import type { SimulationSnapshot } from '../simulation';
export type { BackendPreference, RendererKind } from './backend-policy';
export type { VisualTransform, VisualVehicleState, VisualWorldIdentity } from './scene-contract';
export { interpolateRenderSnapshots, validateRenderSnapshot } from './render-sync';
export type { RenderSnapshot, RenderVehiclePose, RenderWheelPose } from './render-sync';
export { resolveQuality, createAdaptiveQuality, QUALITY_PRESETS } from './quality-policy';
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
