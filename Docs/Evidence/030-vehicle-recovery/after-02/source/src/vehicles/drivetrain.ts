import { number } from '../sessions';
import type { BodyState } from './body-port';
import type { VehicleCommand } from './contracts';
import type { VehicleActuationInput } from './controller-port';

/** Candidate guards; must pass real sedan/compact calibration before acceptance. */
export const DRIVETRAIN_LIMITS = Object.freeze({
  version: '027-braking-reverse-v1' as const,
  nearZeroSpeedMps: 0.2,
  nearZeroTicks: 6,
  hz: 60,
});
export type DriveDirection = 'FORWARD' | 'REVERSE';
export interface DriveIntent {
  readonly version: typeof DRIVETRAIN_LIMITS.version;
  readonly direction: DriveDirection | 'NONE';
  /** Service braking used only while a requested direction is interlocked. */
  readonly shiftBrake: number;
}
export interface DrivetrainState {
  readonly enabled: boolean;
  readonly direction: DriveDirection;
  readonly pendingDirection: DriveDirection | null;
  readonly nearZeroTicks: number;
}
export interface DrivetrainProjection {
  readonly version: typeof DRIVETRAIN_LIMITS.version;
  readonly requestedDirection: DriveDirection | 'NONE';
  readonly engagedDirection: DriveDirection;
  readonly phase: 'COASTING' | 'DRIVING' | 'STOPPING' | 'NEAR_ZERO_DWELL';
  readonly nearZeroTicks: number;
  readonly motion: { readonly longitudinalSpeedMps: number; readonly totalSpeedMps: number } | null;
  readonly physicalInput: Readonly<VehicleActuationInput>;
}
export const createDrivetrainState = (): DrivetrainState =>
  Object.freeze({
    enabled: false,
    direction: 'FORWARD',
    pendingDirection: null,
    nearZeroTicks: 0,
  });
export function drivetrainNeedsMotion(state: DrivetrainState, command: VehicleCommand): boolean {
  return Boolean(
    (command.driveIntent || state.enabled) &&
    (command.throttle > 0 || (command.driveIntent && command.driveIntent.direction !== 'NONE')),
  );
}
export function readDrivetrainMotion(body: BodyState) {
  const v = body.velocityMps,
    q = body.transform.rotationQuaternion;
  const longitudinalSpeedMps = number(
    v.x * 2 * (q.x * q.z + q.w * q.y) +
      v.y * 2 * (q.y * q.z - q.w * q.x) +
      v.z * (1 - 2 * (q.x * q.x + q.y * q.y)),
  );
  return Object.freeze({
    longitudinalSpeedMps,
    totalSpeedMps: number(Math.hypot(v.x, v.y, v.z), 0),
  });
}
/** Pure next-state calculation; no clock, physics setters, history or mutable retained commands. */
export function realizeDrivetrain(
  previous: DrivetrainState,
  command: VehicleCommand,
  motion: ReturnType<typeof readDrivetrainMotion> | null,
) {
  const enabled = previous.enabled || Boolean(command.driveIntent);
  const requested = command.driveIntent?.direction ?? (command.throttle > 0 ? 'FORWARD' : 'NONE');
  let direction = previous.direction,
    pendingDirection: DriveDirection | null = null,
    nearZeroTicks = 0;
  let phase: DrivetrainProjection['phase'] = command.throttle > 0 ? 'DRIVING' : 'COASTING';
  let throttle = command.brake > 0 || command.handbrake ? 0 : command.throttle,
    brake = command.brake;
  const sign = requested === 'REVERSE' ? -1 : 1;
  const movingOpposite =
    enabled &&
    motion !== null &&
    motion.longitudinalSpeedMps * sign < -DRIVETRAIN_LIMITS.nearZeroSpeedMps;
  const interlocked =
    enabled &&
    requested !== 'NONE' &&
    (requested !== previous.direction || movingOpposite || previous.pendingDirection === requested);
  if (interlocked) {
    pendingDirection = requested as DriveDirection;
    const atRest = motion !== null && motion.totalSpeedMps <= DRIVETRAIN_LIMITS.nearZeroSpeedMps;
    nearZeroTicks =
      atRest && !command.handbrake && command.brake === 0
        ? Math.min(
            DRIVETRAIN_LIMITS.nearZeroTicks,
            (previous.pendingDirection === requested ? previous.nearZeroTicks : 0) + 1,
          )
        : 0;
    if (nearZeroTicks === DRIVETRAIN_LIMITS.nearZeroTicks) {
      direction = pendingDirection;
      pendingDirection = null;
      phase = throttle > 0 ? 'DRIVING' : 'COASTING';
    } else {
      throttle = 0;
      brake = Math.max(brake, command.driveIntent?.shiftBrake ?? 1);
      phase = atRest ? 'NEAR_ZERO_DWELL' : 'STOPPING';
    }
  }
  if (requested === 'NONE') throttle = 0;
  const physicalInput = Object.freeze({
    throttle: throttle === 0 ? 0 : throttle * (enabled && direction === 'REVERSE' ? -1 : 1),
    brake,
    steering: command.steering,
    handbrake: command.handbrake,
  });
  const state: DrivetrainState = Object.freeze({
    enabled,
    direction,
    pendingDirection,
    nearZeroTicks: pendingDirection === null ? 0 : nearZeroTicks,
  });
  const projection: DrivetrainProjection = Object.freeze({
    version: DRIVETRAIN_LIMITS.version,
    requestedDirection: requested,
    engagedDirection: direction,
    phase,
    nearZeroTicks,
    motion,
    physicalInput,
  });
  return Object.freeze({ state, projection, throttle, brake });
}
