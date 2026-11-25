/**
 * PBI 236 — scena Babylon a compunerii V3: orașul 042, decorul 146, personajul 191/192 și
 * mașinile 145, toate conduse de cadrul produs de compunerea pură.
 *
 * Adaptorul este strict de prezentare: citește `CompositionFrame` și `CharacterRenderFrame` și
 * copiază poziții deja autoritare. Nu pașește niciun tick, nu decide autoritate și nu scrie
 * poziția personajului.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Constants } from '@babylonjs/core/Engines/constants';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { atmosphereAt, nextTimeOfDay, TIME_OF_DAY_NAMES, type TimeOfDayName } from '../time-of-day';
import { createCharacterAsset, type CharacterRenderFrame } from '../../character';
import type { CompositionFrame } from '../../app';
import type { QualityPreferences } from '../../settings';
import type { CityLayout } from '../../world';
import type { RendererKind } from '../backend-policy';
import { SURFACE_PRESETS, type QualityPreset } from '../quality-policy';
import { VEHICLE_RIDE_HEIGHT_M } from '../vehicle-visuals';
import type { VisualTransform } from '../scene-contract';
import { planBuildingModules } from '../building-modules';
import { createBuildingModuleBatches } from './city-buildings-glb';
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
  /** PBI 255: meshurile (submesh host) și plasările modulelor de clădire GLB. */
  readonly buildingModuleMeshes: number;
  readonly buildingModulePlacements: number;
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
  /** PBI 255: modulele GLB de la nivelul străzii (null fără biblioteca de modele). */
  readonly buildingModules: Readonly<{
    meshes: number;
    placements: number;
    models: number;
  }> | null;
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
  /** PBI 252: schimbă ora din zi (cer, soare/lună, IBL, expunere, lumină stradală). */
  setTimeOfDay(name: TimeOfDayName): TimeOfDayName;
  getTimeOfDay(): TimeOfDayName;
  /** PBI 252: tasta T — următorul moment al zilei. */
  cycleTimeOfDay(): TimeOfDayName;
  backendInfo(): V3BackendInfo;
  stats(): V3CompositionSceneStats;
  dispose(): void;
}

/**
 * PBI 252 — textura conului de lumină al farurilor: alb cu alpha în formă de evantai, mai puternic
 * lângă mașină. Este desenată pe un singur mesh thin-instanced pentru tot traficul.
 */
function buildHeadlightBeamTexture(): Uint8Array {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size; // 0 = lângă mașină, 1 = departe
    for (let x = 0; x < size; x += 1) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const halfWidth = 0.22 + 0.62 * v;
      const edge = Math.max(0, 1 - Math.abs(u) / halfWidth);
      const along = Math.pow(1 - v, 0.65);
      const alpha = Math.round(255 * Math.min(1, edge * edge * along * 1.15));
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 244;
      data[index + 2] = 220;
      data[index + 3] = alpha;
    }
  }
  return data;
}

/**
 * Înălțimea de repaus a șasiului deasupra solului (contractul 023): centrul caroseriei stă la 0,8 m,
 * roțile ating asfaltul. Poziția autoritativă a vehiculului este la sol (y=0), deci prezentarea
 * adaugă această cotă; altfel modelul GLB intră 0,8 m în asfalt și roțile dispar.
 */
function visualTransform(
  positionM: Readonly<{ x: number; y: number; z: number }>,
  yawRad: number,
): VisualTransform {
  return Object.freeze({
    positionM: Object.freeze({
      x: positionM.x,
      y: positionM.y + VEHICLE_RIDE_HEIGHT_M,
      z: positionM.z,
    }),
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
  // PBI 255: rândul de clădiri mici de la nivelul străzii, peste masele de bloc 246.
  const buildingModules = options.models
    ? createBuildingModuleBatches(scene, city.root, planBuildingModules(layout), options.models)
    : null;
  for (const mesh of buildingModules?.meshes ?? []) daylight.excludeFromLegacyAmbient(mesh);
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

  // ---- PBI 252: lumina de noapte -------------------------------------------------------------
  const BEAM_CAPACITY = 128;
  const beamTexture = new RawTexture(
    buildHeadlightBeamTexture(),
    64,
    64,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    true,
    false,
    Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  beamTexture.hasAlpha = true;
  const beamMaterial = new StandardMaterial('city:headlight-beam', scene);
  beamMaterial.diffuseTexture = beamTexture;
  beamMaterial.emissiveTexture = beamTexture;
  beamMaterial.useAlphaFromDiffuseTexture = true;
  beamMaterial.diffuseColor = Color3.Black();
  beamMaterial.specularColor = Color3.Black();
  beamMaterial.disableLighting = true;
  beamMaterial.alphaMode = Constants.ALPHA_ADD;
  beamMaterial.backFaceCulling = false;
  beamMaterial.disableDepthWrite = true;
  beamMaterial.fogEnabled = false;
  const beamMesh = CreateGround('city:headlight-beams', { width: 1, height: 1 }, scene);
  beamMesh.material = beamMaterial;
  beamMesh.isPickable = false;
  beamMesh.receiveShadows = false;
  beamMesh.applyFog = false;
  beamMesh.alwaysSelectAsActiveMesh = true;
  const beamMatrices = new Float32Array(BEAM_CAPACITY * 16);
  beamMesh.thinInstanceSetBuffer('matrix', beamMatrices, 16, true);
  beamMesh.thinInstanceRefreshBoundingInfo(true);
  beamMesh.setEnabled(false);
  // Un singur spot real, atașat vehiculului urmărit: lumina de noapte promisă de 252 fără să
  // depășească limita de lumini per material (maxSimultaneousLights = 2 pe PBR-ul suprafețelor).
  const headlightSpot = new SpotLight(
    'city:headlight-spot',
    new Vector3(0, 0.65, 1.8),
    new Vector3(0, -0.08, 1),
    Math.PI / 5,
    2.2,
    scene,
  );
  headlightSpot.diffuse = new Color3(1, 0.9, 0.72);
  headlightSpot.specular = new Color3(0.25, 0.22, 0.18);
  headlightSpot.range = 34;
  headlightSpot.intensity = 0;
  headlightSpot.setEnabled(false);
  let nightFactor = 0;
  let currentTime: TimeOfDayName = 'noon';
  /** PBI 252: amiaza de pornire este exact starea 243 din `daylight`, fără o regenerare IBL. */
  let timeApplied = false;
  const applyNightFactor = (factor: number): void => {
    nightFactor = factor;
    city.setNightFactor(factor);
    decor?.setNightFactor(factor);
    vehicles.setNightFactor(factor);
    beamMaterial.emissiveColor = new Color3(0.78 * factor, 0.65 * factor, 0.45 * factor);
    beamMesh.setEnabled(factor > 0.03);
    // LOW rămâne fără lumini dinamice (criteriul 252): numai emisie, decal-uri și IBL.
    headlightSpot.intensity = 7.2 * factor;
    headlightSpot.setEnabled(factor > 0.03 && daylight.getQuality().preset !== 'LOW');
  };
  // Starea de zi este deja cea implicită a materialelor (niciun stâlp aprins, niciun far pornit);
  // nu se reaplică la pornire, ca amiaza să rămână exact baseline-ul 239.
  const setTimeOfDay = (name: TimeOfDayName): TimeOfDayName => {
    if (!TIME_OF_DAY_NAMES.includes(name)) throw new Error(`Unknown time of day: ${name}`);
    // Prima amiază este deja starea 243 creată de `daylight`; reaplicarea ar regenera IBL-ul degeaba.
    if (name === 'noon' && !timeApplied) return currentTime;
    const state = atmosphereAt(name);
    daylight.setAtmosphere(state);
    applyNightFactor(state.night);
    currentTime = name;
    timeApplied = true;
    return currentTime;
  };
  // PBI 241: AA și post-procesarea se atașează camerei de joc, nu camerei de bootstrap.
  daylight.attachCamera(camera);
  // 244: umbrele urmăresc camera reală și mișcarea reală a casterilor, în fiecare cadru randat.
  let nightPreset = daylight.getQuality().preset;
  const shadowObserver = scene.onBeforeRenderObservable.add(() => {
    // 245: presetul se poate schimba live (setări, calitate adaptivă): texturile și anizotropia îl urmează.
    const activePreset = daylight.getQuality().preset;
    if (activePreset !== surfacePreset) {
      surfacePreset = activePreset;
      surfaces.setPreset(activePreset);
      applyWear();
    }
    if (activePreset !== nightPreset) {
      nightPreset = activePreset;
      // 252: aceeași oră, alt buget: spotul real se oprește pe LOW, decal-urile rămân.
      applyNightFactor(nightFactor);
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
  // PBI 255: modulele de clădire primesc umbre, dar nu aruncă: ar fi 4 treceri CSM peste fiecare
  // submesh al fiecărui model, pentru o umbră de câțiva centimetri la baza fațadei.
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
    buildingModules: buildingModules
      ? Object.freeze({
          meshes: buildingModules.meshes.length,
          placements: buildingModules.placements,
          models: buildingModules.models,
        })
      : null,
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
      // PBI 254/253: când autoritatea este mașina, personajul nu mai este în scenă. `setVisible`
      // exista în contract dar nu era chemat, deci playerul rămânea înghețat pe stradă după intrare.
      character.setVisible(frame.authority.consumer === 'CHARACTER');
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
      // 252: conurile de lumină ale farurilor, un singur mesh thin-instanced pentru tot traficul.
      if (nightFactor > 0.03) {
        let index = 0;
        const local = Matrix.Compose(
          new Vector3(4.6, 1, 9.4),
          Quaternion.Identity(),
          new Vector3(0, -0.63, 6.55),
        );
        for (const representation of representations.values()) {
          if (index >= BEAM_CAPACITY) break;
          representation.root.computeWorldMatrix(true);
          representation.root
            .getWorldMatrix()
            .multiply(local)
            .copyToArray(beamMatrices, index * 16);
          index += 1;
        }
        for (; index < BEAM_CAPACITY; index += 1) {
          Matrix.Compose(
            new Vector3(1e-4, 1e-4, 1e-4),
            Quaternion.Identity(),
            new Vector3(0, -1000, 0),
          ).copyToArray(beamMatrices, index * 16);
        }
        beamMesh.thinInstanceBufferUpdated('matrix');
      }
      const heroRepresentation = hero ? representations.get(hero) : undefined;
      if (heroRepresentation && headlightSpot.parent !== heroRepresentation.root)
        headlightSpot.parent = heroRepresentation.root;
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
    setTimeOfDay,
    getTimeOfDay: () => currentTime,
    cycleTimeOfDay: () => setTimeOfDay(nextTimeOfDay(currentTime)),
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
        buildingModuleMeshes: buildingModules?.meshes.length ?? 0,
        buildingModulePlacements: buildingModules?.placements ?? 0,
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
      buildingModules?.dispose();
      decor?.dispose();
      worldEdge.dispose();
      city.dispose();
      surfaces.dispose();
      daylight.dispose();
      headlightSpot.dispose();
      beamMesh.dispose(false, false);
      beamMaterial.dispose(false, true);
      camera.dispose();
      options.models?.dispose();
    },
  });
}
