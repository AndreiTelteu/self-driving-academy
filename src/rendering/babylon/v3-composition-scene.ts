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
import type { Scene } from '@babylonjs/core/scene';
import { createCharacterAsset, type CharacterRenderFrame } from '../../character';
import type { CompositionFrame } from '../../app';
import type { QualityPreferences } from '../../settings';
import type { CityLayout } from '../../world';
import type { RendererKind } from '../backend-policy';
import type { QualityPreset } from '../quality-policy';
import type { VisualTransform } from '../scene-contract';
import { createCharacterScene, type CharacterScene } from './character-scene';
import { createCityDecorScene, type CityDecorScene } from './city-decor-scene';
import { createCityScene, type CityScene } from './city-scene';
import { createDaylight } from './daylight';
import { createVehicleVisualStage, type VehicleVisualStage } from './vehicle-scene';

export const V3_COMPOSITION_SCENE_VERSION = '236-v3-composition-scene-v1' as const;

export interface V3CompositionSceneOptions {
  readonly scene: Scene;
  readonly layout: CityLayout;
  readonly quality: QualityPreferences;
  readonly preset: QualityPreset;
  readonly viewport: Readonly<{ width: number; height: number; dpr: number }>;
  readonly rendererKind: RendererKind;
  /** Decorul 146 este opțional; orașul și personajul nu depind de el. */
  readonly decor?: boolean;
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
  readonly character: CharacterScene;
  readonly vehicles: VehicleVisualStage;
  readonly camera: FreeCamera;
  readonly daylight: ReturnType<typeof createDaylight>;
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
  const city = createCityScene(scene, layout);
  const decor = options.decor === false ? null : createCityDecorScene(scene, layout);
  const asset = createCharacterAsset();
  const character = createCharacterScene(scene, asset, 'NEAR');
  const vehicles = createVehicleVisualStage(scene, { preset: options.preset });
  const camera = new FreeCamera('v3-composition-camera', new Vector3(0, 3, -6), scene);
  camera.minZ = 0.1;
  camera.maxZ = 600;
  camera.fov = 1.4;
  scene.activeCamera = camera;
  // PBI 241: AA și post-procesarea se atașează camerei de joc, nu camerei de bootstrap.
  daylight.attachCamera(camera);
  const representations = new Map<string, ReturnType<VehicleVisualStage['create']>>();
  let frames = 0;

  return Object.freeze({
    version: V3_COMPOSITION_SCENE_VERSION,
    scene,
    city,
    decor,
    character,
    vehicles,
    camera,
    daylight,
    apply(frame: CompositionFrame, characterFrame: CharacterRenderFrame): void {
      frames += 1;
      character.applyFrame(characterFrame);
      for (const vehicle of frame.vehicles) {
        const transform = visualTransform(vehicle.positionM, vehicle.yawRad);
        const existing = representations.get(vehicle.vehicleId);
        if (existing) {
          existing.setTransform(transform);
          continue;
        }
        const created = vehicles.create(vehicle.vehicleId, vehicle.classId, transform);
        representations.set(vehicle.vehicleId, created);
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
      void daylight;
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
        characterMeshes: characterStats.meshes,
        characterDrawCalls: characterStats.drawCalls,
        vehicleMeshes: vehicleMetrics.meshes,
        vehicleDrawCalls: vehicleMetrics.drawCalls,
        vehicles: representations.size,
        frames,
      });
    },
    dispose(): void {
      for (const representation of representations.values()) representation.dispose();
      representations.clear();
      vehicles.dispose();
      character.dispose();
      decor?.dispose();
      city.dispose();
      daylight.dispose();
      camera.dispose();
    },
  });
}
