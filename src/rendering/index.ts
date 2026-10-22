import type { SimulationSnapshot } from '../simulation';
export type { BackendPreference, RendererKind } from './backend-policy';
export type { VisualTransform, VisualVehicleState, VisualWorldIdentity } from './scene-contract';
export { interpolateRenderSnapshots, validateRenderSnapshot } from './render-sync';
export type { RenderSnapshot, RenderVehiclePose, RenderWheelPose } from './render-sync';
export {
  resolveQuality,
  createAdaptiveQuality,
  QUALITY_PRESETS,
  checkVisualResources,
} from './quality-policy';
export {
  RENDER_ASSET_CAPS,
  checkAssetManifest,
  admitAssetManifest,
  checkAssetUsage,
  checkRenderingCounters,
} from './asset-budgets';
export type { AssetBudgetManifest, BudgetedAsset, BudgetDiagnostic } from './asset-budgets';
export type { QualityPreset, QualitySample } from './quality-policy';
export { VehicleCameraController, validateCameraPreferences } from './vehicle-camera';
export type {
  VehicleCameraMode,
  CameraPreferences,
  CameraTarget,
  VehicleCameraPose,
  CameraSweep,
} from './vehicle-camera';
export { resolveCameraObstacles } from './camera-collision';
export type { CameraPoint, CameraObstacle } from './camera-collision';
export { DiagnosticsCollector, UNAVAILABLE_DIAGNOSTIC_COUNTERS } from './diagnostics';
export type {
  DiagnosticSample,
  DiagnosticCounters,
  DiagnosticResources,
  DiagnosticPercentiles,
  DiagnosticReport,
} from './diagnostics';

export interface Renderer {
  present(snapshot: SimulationSnapshot): void;
  dispose(): void;
}

export interface BootstrapPresentation {
  readonly status: string;
  readonly engineLabel: string;
}

export interface BootstrapView {
  show(presentation: BootstrapPresentation): void;
  dispose(): void;
}
export * from './physical-wheels';
export {
  VEHICLE_VISUAL_VERSION,
  VEHICLE_LOD_LEVELS,
  VEHICLE_LOD_DISTANCES_M,
  VEHICLE_WHEEL_IDS,
  VEHICLE_CONNECTION_Y_M,
  VEHICLE_REST_SPRING_M,
  VEHICLE_COLLISION_HALF_EXTENTS_M,
  VEHICLE_LIGHTS_OFF,
  vehicleVisualClass,
  selectVehicleLod,
  vehicleVisualAlignment,
  visibleGroupsFor,
  vehicleDrawCalls,
  vehicleAssetManifest,
  vehicleAssetBudget,
  admitVehicleAssets,
  vehicleAssetInventory,
} from './vehicle-visuals';
export type {
  VehicleLodLevel,
  VehicleWheelId,
  VehicleWheelPivot,
  VehicleLodSpec,
  VehicleVisualClass,
  MechanicalWheelSource,
  VehicleLightState,
  VehicleAssetInventoryEntry,
  VehicleAssetDiagnostic,
} from './vehicle-visuals';
export {
  buildVehicleGeometry,
  vehicleGeometrySpec,
  VEHICLE_VERTEX_BYTES,
  VEHICLE_INDEX_BYTES,
} from './vehicle-geometry';
export type {
  VehicleClassKey,
  VehicleGeometrySet,
  VehicleGeometryGroup,
  VehicleMaterialGroup,
  VehicleBoxPart,
  VehicleClassGeometrySpec,
  VehicleLod,
} from './vehicle-geometry';
