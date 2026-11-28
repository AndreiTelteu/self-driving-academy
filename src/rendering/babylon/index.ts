import { Engine } from '@babylonjs/core/Engines/engine';
import type { BootstrapView, Renderer } from '../index';
export { createRenderingBackend, type RenderingBackend } from './backend';
export { BabylonSceneAdapter, type VisualRepresentation } from './scene-adapter';
export { BabylonSnapshotPresenter, type WheelNodeResolver } from './snapshot-presenter';
export {
  createDaylight,
  SHADOW_CASTER_PRIORITIES,
  SHADOW_MAP_CONTENT,
  type DaylightMaterial,
  type QualityViewport,
  type ShadowCasterPriority,
} from './daylight';
export { BabylonVehicleCamera, type BabylonVehicleCameraOptions } from './vehicle-camera';
export { bindVehicleCameraInput, type VehicleCameraInputOptions } from './vehicle-camera-input';
export { diagnoseBackend, type BabylonDiagnostics } from './diagnostics-adapter';
export { showDevelopmentInspector } from './dev-inspector';
export {
  VehiclePickingRegistry,
  type VehiclePickingRegistryOptions,
} from './vehicle-picking-registry';
export { BabylonVehiclePicker, type SelectVehicleIntent } from './vehicle-picking';
export { BabylonCellBatches, type BatchInstance, type CellBatchDefinition } from './cell-batches';
export {
  createCityScene,
  type CityElementGeometry,
  type CityMaterialKey,
  type CityScene,
  type CitySceneOptions,
  type CitySceneResourceCounts,
  type CitySceneStats,
  type CitySignalPart,
} from './city-scene';
export {
  createCityDecorScene,
  type CityDecorScene,
  type CityDecorSceneOptions,
  type CityDecorSceneStats,
} from './city-decor-scene';
export { analyzeRegistryGlb } from './asset-contract';
export {
  createVehicleVisualStage,
  type VehicleMaterialKey,
  type VehicleRenderWheel,
  type VehicleRepresentation,
  type VehicleRepresentationMetrics,
  type VehicleVisualMetrics,
  type VehicleVisualOptions,
  type VehicleVisualStage,
} from './vehicle-scene';
export { bindVehiclePickingInput, type VehiclePickingInputOptions } from './vehicle-picking-input';
export {
  createBabylonRecoverySession,
  subscribeRenderingLoss,
  type RecoverySceneSnapshot,
  type BabylonRecoverySession,
} from './recovery-session';
export {
  BabylonAssetRegistry,
  DEFAULT_ASSET_LIMITS,
  validateRegistryGlb,
  type AssetDefinition,
  type AssetLimits,
  type AssetProgress,
  type AssetLoadReport,
  type AssetLease,
} from './asset-registry';

/** Preserved metadata-only fixture for bootstrap regression probes. */
export function createBabylonBootstrapRenderer(view: BootstrapView): Renderer {
  return {
    present: () => {
      view.show({
        status: 'Bootstrap pregătit',
        engineLabel: `Babylon.js ${Engine.Version} · TypeScript · Vite`,
      });
    },
    dispose: () => view.dispose(),
  };
}

export {
  CHARACTER_SCENE_VERSION,
  createCharacterScene,
  type CharacterScene,
  type CharacterSceneStats,
} from './character-scene';
export {
  V3_COMPOSITION_SCENE_VERSION,
  createV3CompositionScene,
  type V3BackendInfo,
  type V3CompositionScene,
  type V3CompositionSceneOptions,
  type V3CompositionSceneStats,
} from './v3-composition-scene';
export { installVisualCapture, type VisualCaptureApi } from './visual-capture';
export {
  CAPTURE_FIXED_CLOCK,
  CAPTURE_SEED,
  CAPTURE_VIEWPORT,
  CAPTURE_VIEWS,
  VISUAL_CAPTURE_VERSION,
  captureView,
  readCaptureConfig,
  type CaptureConfig,
  type CaptureModels,
  type CaptureView,
} from '../visual-capture';
export {
  LIVE_PEDESTRIAN_SCENE_LIMITS,
  LIVE_PEDESTRIAN_SCENE_VERSION,
  createLivePedestrianScene,
  type LivePedestrianScene,
  type LivePedestrianSceneStats,
} from './live-pedestrian-scene';
export {
  COMPOSITION_KEYS,
  V3_BROWSER_COMPOSITION_VERSION,
  createV3BrowserComposition,
  type CostSummary,
  type V3BrowserComposition,
  type V3BrowserCompositionOptions,
} from './v3-browser-composition';
export {
  GLB_ASSETS,
  GLB_ASSET_LICENSE,
  getGlbAsset,
  getGlbAssetsByCategory,
  glbAssetBytes,
  type GlbAssetCategory,
  type GlbAssetDefinition,
} from './glb-assets';
export {
  GLB_MODEL_LIBRARY_VERSION,
  loadGlbModelLibrary,
  type GlbModelFailure,
  type GlbModelLibrary,
  type GlbModelLibraryOptions,
} from './glb-model-library';
