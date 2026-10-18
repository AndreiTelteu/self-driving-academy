import type { InputPreferences } from '../settings';
import { validateEntityId, validateVisualTransform, type VisualTransform } from './scene-contract';
import type { CameraPoint } from './camera-collision';

export type VehicleCameraMode = InputPreferences['cameraMode'];
export interface CameraPreferences {
  readonly mode: VehicleCameraMode;
  readonly fovDegrees: number;
  readonly motion: number;
  readonly distanceM: number;
}
export interface CameraTarget {
  readonly entityId: string;
  readonly incarnation: string;
  readonly transform: VisualTransform;
  readonly speedMps: number;
  /** Driver eye position in local metres, provided by calibrated vehicle representation. */
  readonly driverEyeM: CameraPoint;
}
export interface VehicleCameraPose {
  readonly entityId: string;
  readonly mode: VehicleCameraMode;
  readonly positionM: CameraPoint;
  readonly lookAtM: CameraPoint;
  readonly up: CameraPoint;
  readonly fovRadians: number;
}
export type CameraSweep = (
  from: CameraPoint,
  to: CameraPoint,
  radiusM: number,
) => CameraPoint | null;
const vector = (x: number, y: number, z: number): CameraPoint => ({ x, y, z });
const add = (a: CameraPoint, b: CameraPoint): CameraPoint =>
  vector(a.x + b.x, a.y + b.y, a.z + b.z);
const lerp = (a: CameraPoint, b: CameraPoint, t: number): CameraPoint =>
  vector(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
function rotate(p: CameraPoint, transform: VisualTransform): CameraPoint {
  const q = transform.rotationQuaternion;
  const tx = 2 * (q.y * p.z - q.z * p.y),
    ty = 2 * (q.z * p.x - q.x * p.z),
    tz = 2 * (q.x * p.y - q.y * p.x);
  return vector(
    p.x + q.w * tx + q.y * tz - q.z * ty,
    p.y + q.w * ty + q.z * tx - q.x * tz,
    p.z + q.w * tz + q.x * ty - q.y * tx,
  );
}
function finitePoint(p: CameraPoint) {
  return p && [p.x, p.y, p.z].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e7);
}
export function validateCameraPreferences(value: CameraPreferences): void {
  if (
    !value ||
    !['CHASE', 'FIRST_PERSON'].includes(value.mode) ||
    !Number.isFinite(value.fovDegrees) ||
    value.fovDegrees < 60 ||
    value.fovDegrees > 100 ||
    !Number.isFinite(value.motion) ||
    value.motion < 0 ||
    value.motion > 100 ||
    !Number.isFinite(value.distanceM) ||
    value.distanceM < 2 ||
    value.distanceM > 15
  )
    throw new Error('Invalid camera preferences');
}

/** Visual-only damped chase/driver camera. Does not own vehicle selection, commands or physics. */
export class VehicleCameraController {
  private preferences: CameraPreferences;
  private selected: string | null = null;
  private identity: string | null = null;
  private position: CameraPoint | null = null;
  private yaw = 0;
  private pitch = 0;
  constructor(preferences: CameraPreferences) {
    validateCameraPreferences(preferences);
    this.preferences = { ...preferences };
  }
  get mode(): VehicleCameraMode {
    return this.preferences.mode;
  }
  get lookAngles() {
    return Object.freeze({ yaw: this.yaw, pitch: this.pitch });
  }
  get selectedEntityId(): string | null {
    return this.selected;
  }
  setPreferences(preferences: CameraPreferences): void {
    validateCameraPreferences(preferences);
    if (preferences.mode !== this.mode) this.position = null;
    this.preferences = { ...preferences };
  }
  toggleMode(): VehicleCameraMode {
    this.setPreferences({
      ...this.preferences,
      mode: this.mode === 'CHASE' ? 'FIRST_PERSON' : 'CHASE',
    });
    this.recenter();
    return this.mode;
  }
  select(entityId: string | null): void {
    if (entityId !== null) validateEntityId(entityId);
    if (entityId === this.selected) return;
    this.selected = entityId;
    this.reset();
  }
  recenter(): void {
    this.yaw = 0;
    this.pitch = 0;
  }
  look(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY))
      throw new Error('Invalid mouse delta');
    this.yaw = Math.max(-Math.PI * 0.61, Math.min(Math.PI * 0.61, this.yaw + deltaX * 0.002));
    this.pitch = Math.max(-Math.PI * 0.39, Math.min(Math.PI * 0.39, this.pitch - deltaY * 0.002));
  }
  reset(): void {
    this.position = null;
    this.identity = null;
    this.recenter();
  }
  update(
    target: CameraTarget | null,
    dtSeconds: number,
    sweep: CameraSweep = (_from, to) => to,
  ): VehicleCameraPose | null {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new Error('Invalid camera frame time');
    if (!target || target.entityId !== this.selected) {
      this.reset();
      return null;
    }
    validateEntityId(target.incarnation);
    validateVisualTransform(target.transform);
    if (
      !finitePoint(target.driverEyeM) ||
      !finitePoint(target.transform.positionM) ||
      !Number.isFinite(target.speedMps) ||
      target.speedMps < 0 ||
      target.speedMps > 150
    )
      throw new Error('Invalid camera target');
    const identity = JSON.stringify([target.entityId, target.incarnation]);
    if (identity !== this.identity) {
      this.position = null;
      this.identity = identity;
      this.recenter();
    }
    const world = (p: CameraPoint) => add(target.transform.positionM, rotate(p, target.transform));
    const anchor = world(target.driverEyeM);
    const distance = this.preferences.distanceM + Math.min(4, target.speedMps * 0.08);
    const desired = this.mode === 'FIRST_PERSON' ? anchor : world(vector(0, 2.5, -distance));
    const strength = this.preferences.motion / 100;
    const factor =
      strength === 0 ? 1 : 1 - Math.exp(-(18 - 12 * strength) * Math.min(0.25, dtSeconds));
    const candidate =
      this.mode === 'FIRST_PERSON' || !this.position
        ? desired
        : lerp(this.position, desired, factor);
    // Constrain AFTER damping as smoothing a corrected endpoint could pass through geometry.
    const safe = sweep(anchor, candidate, 0.2);
    if (!safe || !finitePoint(safe)) {
      this.position = null;
      return null;
    }
    const swept = this.mode === 'CHASE' && this.position ? sweep(this.position, safe, 0.2) : safe;
    if (!swept || !finitePoint(swept)) {
      this.position = null;
      return null;
    }
    this.position = { ...swept };
    const forward = rotate(
      vector(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch),
      ),
      target.transform,
    );
    const lookAt = this.mode === 'FIRST_PERSON' ? add(swept, forward) : add(anchor, forward);
    return Object.freeze({
      entityId: target.entityId,
      mode: this.mode,
      positionM: Object.freeze({ ...swept }),
      lookAtM: Object.freeze(lookAt),
      up: Object.freeze(
        this.mode === 'FIRST_PERSON' ? rotate(vector(0, 1, 0), target.transform) : vector(0, 1, 0),
      ),
      fovRadians: (this.preferences.fovDegrees * Math.PI) / 180,
    });
  }
}
