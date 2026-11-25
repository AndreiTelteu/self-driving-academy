/**
 * PBI 236 — scena Babylon a compunerii V3: orașul 042, decorul 146, personajul 191/192 și
 * mașinile 145, toate conduse de cadrul produs de compunerea pură.
 *
 * Adaptorul este strict de prezentare: citește `CompositionFrame` și `CharacterRenderFrame` și
 * copiază poziții deja autoritare. Nu pașește niciun tick, nu decide autoritate și nu scrie
 * poziția personajului.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { createCharacterAsset, type CharacterRenderFrame } from '../../character';
import type { CompositionFrame } from '../../app';
import type { QualityPreferences } from '../../settings';
import type { CityLayout } from '../../world';
import type { RendererKind } from '../backend-policy';
import { SURFACE_PRESETS, type QualityPreset } from '../quality-policy';
import type { VisualTransform } from '../scene-contract';
import { createCharacterScene, type CharacterScene } from './character-scene';
import { createCityDecorScene, type CityDecorScene } from './city-decor-scene';
import { createCityScene, type CityScene } from './city-scene';
import { motionSignature } from '../shadow-math';
import { createContactShadows, type ContactShadowTarget } from './contact-shadows';
import { createDaylight, type ShadowCasterPriority } from './daylight';
import { createSurfaceMaterials, type SurfaceMaterials } from './surface-materials';
import { createWorldEdgeScene, type WorldEdgeScene } from './world-edge-scene';
import { createVehicleVisualStage, type VehicleVisualStage } from './vehicle-scene';
import type { GlbModelLibrary } from './glb-model-library';

export const V3_COMPOSITION_SCENE_VERSION = '236-v3-composition-scene-v2' as const;

export interface V3CompositionSceneOptions {
  readonly scene: Scene;
  readonly layout: CityLayout;
  readonly quality: QualityPreferences;
  readonly preset: QualityPreset;
  readonly viewport: Readonly<{ width: number; height: number; dpr: number }>;
  readonly rendererKind: RendererKind;
  /** Decorul 146 este opțional; orașul și personajul nu depind de el. */
  readonly decor?: boolean;
  /** PBI 254: imported GLB models, owned (and disposed) by the composition. */
  readonly models?: GlbModelLibrary;
}

export interface V3BackendInfo {
  readonly version: typeof V3_COMPOSITION_SCENE_VERSION;
  readonly rendererKind: RendererKind;
  readonly engineDescription: string;
  readonly vendor: string;
  readonly renderer: string;
  readonly contextVersion: string;
  readonly webGLVersion: number | null;
  readonly renderWidth: number;
  readonly renderHeight: number;
}

export interface V3CompositionSceneStats {
  readonly cityMeshes: number;
  readonly cityDrawCalls: number;
  readonly decorMeshes: number;
  /** PBI 242: teren, dealuri și parapet (desenări pe preset). */
  readonly edgeMeshes: number;
  readonly edgeDrawCalls: number;
  readonly characterMeshes: number;
  readonly characterDrawCalls: number;
  readonly vehicleMeshes: number;
  readonly vehicleDrawCalls: number;
  readonly vehicles: number;
  readonly frames: number;
}

export interface V3CompositionScene {
  readonly version: typeof V3_COMPOSITION_SCENE_VERSION;
  readonly scene: Scene;
  readonly city: CityScene;
  readonly decor: CityDecorScene | null;
  readonly worldEdge: WorldEdgeScene;
  /** PBI 245: materialele PBR ale suprafețelor (texturi procedurale, anizotropie pe preset). */
  readonly surfaces: SurfaceMaterials;
  readonly character: CharacterScene;
  readonly vehicles: VehicleVisualStage;
  readonly camera: FreeCamera;
  readonly daylight: ReturnType<typeof createDaylight>;
  /** PBI 244: umbre de contact active (numai pe LOW). */
  contactShadowCount(): number;
  apply(frame: CompositionFrame, characterFrame: CharacterRenderFrame): void;
  /** Reprezentarea vizuală a unui vehicul, după apariția lui în primul cadru (239: capturi). */
  representation(vehicleId: string): ReturnType<VehicleVisualStage['create']> | undefined;
  /** PBI 240: dimensiune CSS/DPR nouă; actualizează rezoluția internă fără a recrea scena. */
  resize(viewport: Readonly<{ width: number; height: number; dpr: number }>): void;
  backendInfo(): V3BackendInfo;
  stats(): V3CompositionSceneStats;
  dispose(): void;
}

function visualTransform(
  positionM: Readonly<{ x: number; y: number; z: number }>,
  yawRad: number,
): VisualTransform {
  return Object.freeze({
    positionM: Object.freeze({ x: positionM.x, y: positionM.y, z: positionM.z }),
    rotationQuaternion: Object.freeze({
      x: 0,
      y: Math.sin(yawRad / 2),
      z: 0,
      w: Math.cos(yawRad / 2),
    }),
  });
}

export function createV3CompositionScene(options: V3CompositionSceneOptions): V3CompositionScene {
  const { scene, layout } = options;
  if (!scene || scene.isDisposed) throw new Error('Compunerea vizuală cere o scenă vie.');
  const daylight = createDaylight(scene, options.quality, {
    width: options.viewport.width,
    height: options.viewport.height,
    dpr: options.viewport.dpr,
  });
  // PBI 245: suprafețele orașului sunt PBR; presetul activ al luminii (nu cel cerut) decide rezoluția.
  let surfacePreset = daylight.getQuality().preset;
  const surfaces = createSurfaceMaterials(scene, surfacePreset);
  // PBI 246: nivelul de detaliu al fațadelor urmează presetul curent; LOW rămâne la mase netede.
  const facadeDetail =
    surfacePreset === 'LOW' ? 'low' : surfacePreset === 'MEDIUM' ? 'medium' : 'high';
  const city = createCityScene(scene, layout, { surfaces, wearStrips: true, facadeDetail });
  const worldEdge = createWorldEdgeScene(scene, layout, options.preset, {
    terrainTexture: surfaces.terrainTexture,
  });
  // Un PBRMaterial primește ambientul din IBL: meshurile PBR ies din lumina hemisferică de rezervă
  // (care mai luminează vehiculele și clădirile, încă `StandardMaterial`). Materialele
  // se îngheață abia după excludere, ca lista de lumini să nu se mai schimbe sub ele.
  const wearMesh = city.surfaceMeshes().find((mesh) => mesh.name === 'city:wear') ?? null;
  const applyWear = (): void => wearMesh?.setEnabled(SURFACE_PRESETS[surfacePreset].wearStrips);
  applyWear();
  for (const mesh of city.surfaceMeshes()) daylight.excludeFromLegacyAmbient(mesh);
  surfaces.freeze();
  const decor =
    options.decor === false
      ? null
      : createCityDecorScene(scene, layout, { models: options.models });
  // PBI 249: decorul este acum PBR; ca la suprafețele 245, meshurile PBR ies din lumina
  // hemisferică de rezervă (altfel primesc ambient dublu: hemisferic + IBL).
  for (const mesh of decor?.shadowCasterMeshes() ?? []) daylight.excludeFromLegacyAmbient(mesh);
  const asset = createCharacterAsset();
  const character = createCharacterScene(scene, asset, 'NEAR', { models: options.models });
  const vehicles = createVehicleVisualStage(scene, {
    preset: options.preset,
    models: options.models,
  });
  const camera = new FreeCamera('v3-composition-camera', new Vector3(0, 3, -6), scene);
  camera.minZ = 0.1;
  // PBI 242: relieful și crestele se întind până la ~2,5 km de limita hărții, deci planul îndepărtat
  // nu mai taie orizontul (la 600 m terenul se termina într-o linie).
  camera.maxZ = 3000;
  camera.fov = 1.4;
  scene.activeCamera = camera;
  // PBI 241: AA și post-procesarea se atașează camerei de joc, nu camerei de bootstrap.
  daylight.attachCamera(camera);
  // 244: umbrele urmăresc camera reală și mișcarea reală a casterilor, în fiecare cadru randat.
  const shadowObserver = scene.onBeforeRenderObservable.add(() => {
    // 245: presetul se poate schimba live (setări, calitate adaptivă): texturile și anizotropia îl urmează.
    const activePreset = daylight.getQuality().preset;
    if (activePreset !== surfacePreset) {
      surfacePreset = activePreset;
      surfaces.setPreset(activePreset);
      applyWear();
    }
    const target = camera.getFrontPosition(1);
    daylight.updateShadows({
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
      cameraTarget: [target.x, target.y, target.z],
      motionSignature: motionSignature(dynamicMotion()),
    });
  });
  const representations = new Map<string, ReturnType<VehicleVisualStage['create']>>();
  let frames = 0;
  // PBI 244: casterii statici (clădiri, semafoare, decor) se înregistrează o dată; personajul și
  // vehiculele dinamice la apariție. Terenul, drumul și trotuarul doar primesc umbre.
  for (const mesh of city.shadowCasterMeshes()) daylight.addShadowCaster(mesh, 'optional');
  for (const mesh of decor?.shadowCasterMeshes() ?? []) daylight.addShadowCaster(mesh, 'optional');
  for (const mesh of character.meshes) daylight.addShadowCaster(mesh, 'standard');
  const contactShadows = createContactShadows(scene);
  const casterPriority = new Map<string, ShadowCasterPriority>();
  /** Vehiculul urmărit de cameră (essential): cel condus, altfel taxiul cel mai apropiat. */
  const heroVehicleId = (frame: CompositionFrame): string | null => {
    const anchor = frame.camera.anchorM;
    const driving = frame.camera.targetKind === 'VEHICLE';
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const vehicle of frame.vehicles) {
      if (!driving && vehicle.driverKind !== 'TAXI') continue;
      const distance = Math.hypot(vehicle.positionM.x - anchor.x, vehicle.positionM.z - anchor.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = vehicle.vehicleId;
      }
    }
    return best;
  };
  /**
   * Semnătura mișcării: transformările locale (poziție, rotație, scară) ale tuturor nodurilor care
   * aruncă umbră (rădăcinile vehiculelor, personajul și articulațiile lui) plus FOV-ul camerei.
   * Se citește din scenă, nu din cadrul compunerii: capturile mută direct nodurile fără `apply`.
   */
  const characterNodes: readonly TransformNode[] = [
    character.root,
    ...character.root.getChildTransformNodes(false),
  ];
  function* dynamicMotion(): Generator<number> {
    const nodes: TransformNode[] = [...characterNodes];
    for (const representation of representations.values()) nodes.push(representation.root);
    for (const node of nodes) {
      yield node.position.x;
      yield node.position.y;
      yield node.position.z;
      const q = node.rotationQuaternion;
      if (q) {
        yield q.x;
        yield q.y;
        yield q.z;
        yield q.w;
      } else {
        yield node.rotation.x;
        yield node.rotation.y;
        yield node.rotation.z;
      }
    }
    yield camera.fov;
  }

  return Object.freeze({
    version: V3_COMPOSITION_SCENE_VERSION,
    scene,
    city,
    decor,
    worldEdge,
    surfaces,
    character,
    vehicles,
    camera,
    daylight,
    contactShadowCount: () => contactShadows.count,
    apply(frame: CompositionFrame, characterFrame: CharacterRenderFrame): void {
      frames += 1;
      character.applyFrame(characterFrame);
      // PBI 254: the imported character picks its locomotion clip from the authoritative frame.
      character.setClip(frame.character.clipId, frame.character.speedMps);
      for (const vehicle of frame.vehicles) {
        const transform = visualTransform(vehicle.positionM, vehicle.yawRad);
        const existing = representations.get(vehicle.vehicleId);
        if (existing) {
          existing.setTransform(transform);
          continue;
        }
        const created = vehicles.create(
          vehicle.vehicleId,
          vehicle.classId,
          transform,
          vehicle.driverKind,
        );
        representations.set(vehicle.vehicleId, created);
      }
      // 244: prioritatea de umbră urmărește vehiculul din cadru; se rescrie numai la schimbare.
      const hero = heroVehicleId(frame);
      for (const vehicle of frame.vehicles) {
        const wanted: ShadowCasterPriority = vehicle.vehicleId === hero ? 'essential' : 'standard';
        if (casterPriority.get(vehicle.vehicleId) === wanted) continue;
        casterPriority.set(vehicle.vehicleId, wanted);
        for (const mesh of representations.get(vehicle.vehicleId)?.shadowCasters ?? [])
          daylight.addShadowCaster(mesh, wanted);
      }
      const cameraFrame = frame.camera;
      camera.position.set(
        cameraFrame.positionM.x,
        cameraFrame.positionM.y,
        cameraFrame.positionM.z,
      );
      camera.setTarget(
        new Vector3(cameraFrame.lookAtM.x, cameraFrame.lookAtM.y, cameraFrame.lookAtM.z),
      );
      camera.fov = cameraFrame.fovRadians;
      vehicles.updateLod(camera.position, options.preset);
      // LOW: umbre de contact (fără shadow map) sub vehicule și personaj; altfel niciuna.
      if (daylight.getQuality().preset === 'LOW') {
        const targets: ContactShadowTarget[] = [];
        for (const vehicle of frame.vehicles) {
          const representation = representations.get(vehicle.vehicleId);
          if (!representation) continue;
          targets.push({
            id: vehicle.vehicleId,
            root: representation.root,
            extentX: representation.footprintM.width,
            extentZ: representation.footprintM.length,
          });
        }
        targets.push({
          id: 'character',
          root: character.root,
          extentX: 0.9,
          extentZ: 0.9,
          spread: 1,
        });
        contactShadows.sync(targets);
      } else if (contactShadows.count > 0) contactShadows.sync([]);
    },
    representation(vehicleId: string) {
      return representations.get(vehicleId);
    },
    resize(viewport: Readonly<{ width: number; height: number; dpr: number }>): void {
      daylight.resize({ width: viewport.width, height: viewport.height, dpr: viewport.dpr });
    },
    backendInfo(): V3BackendInfo {
      const engine = scene.getEngine() as unknown as {
        readonly description: string;
        getInfo?: () => Readonly<{ vendor: string; renderer: string; version: string }>;
        getRenderWidth: () => number;
        getRenderHeight: () => number;
        readonly webGLVersion?: number;
      };
      const info = engine.getInfo?.() ?? {
        vendor: 'unknown',
        renderer: 'unknown',
        version: 'unknown',
      };
      return Object.freeze({
        version: V3_COMPOSITION_SCENE_VERSION,
        rendererKind: options.rendererKind,
        engineDescription: engine.description,
        vendor: info.vendor,
        renderer: info.renderer,
        contextVersion: info.version,
        webGLVersion: typeof engine.webGLVersion === 'number' ? engine.webGLVersion : null,
        renderWidth: engine.getRenderWidth(),
        renderHeight: engine.getRenderHeight(),
      });
    },
    stats(): V3CompositionSceneStats {
      const cityStats = city.stats;
      const characterStats = character.stats;
      const vehicleMetrics = vehicles.metrics;
      return Object.freeze({
        cityMeshes: cityStats.meshes,
        cityDrawCalls: cityStats.drawCalls,
        decorMeshes: decor?.stats.meshes ?? 0,
        edgeMeshes: worldEdge.stats.meshes,
        edgeDrawCalls: worldEdge.stats.drawCalls,
        characterMeshes: characterStats.meshes,
        characterDrawCalls: characterStats.drawCalls,
        vehicleMeshes: vehicleMetrics.meshes,
        vehicleDrawCalls: vehicleMetrics.drawCalls,
        vehicles: representations.size,
        frames,
      });
    },
    dispose(): void {
      scene.onBeforeRenderObservable.remove(shadowObserver);
      contactShadows.dispose();
      for (const representation of representations.values()) representation.dispose();
      representations.clear();
      vehicles.dispose();
      character.dispose();
      decor?.dispose();
      worldEdge.dispose();
      city.dispose();
      surfaces.dispose();
      daylight.dispose();
      camera.dispose();
      options.models?.dispose();
    },
  });
}
