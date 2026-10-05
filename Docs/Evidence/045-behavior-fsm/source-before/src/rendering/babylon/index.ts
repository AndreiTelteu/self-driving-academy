import { Engine } from '@babylonjs/core/Engines/engine';
import type { BootstrapView, Renderer } from '../index';
export { createRenderingBackend, type RenderingBackend } from './backend';
export { BabylonSceneAdapter, type VisualRepresentation } from './scene-adapter';
export { BabylonSnapshotPresenter, type WheelNodeResolver } from './snapshot-presenter';
export { createDaylight, type DaylightMaterial, type QualityViewport } from './daylight';
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
export { analyzeRegistryGlb } from './asset-contract';
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
