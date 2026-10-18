import type { CarTuning } from './physics';

export const VEHICLE_CLASS_VERSION = '023-mechanics-v1' as const;
export type VehicleClassId = 'sedan' | 'compact';
export interface WheelGeometry {
  readonly radiusM: number;
  readonly wheelbaseM: number;
  readonly trackM: number;
}
export interface VehicleClass extends CarTuning {
  readonly classId: VehicleClassId;
  readonly version: typeof VEHICLE_CLASS_VERSION;
  /** Mechanical power at the driven wheels; W = N × m/s. */
  readonly powerW: number;
  readonly wheels: WheelGeometry;
  /** Geometric full-lock bicycle radius, not a guaranteed actual trajectory. */
  readonly turningRadiusM: number;
}
function define(
  classId: VehicleClassId,
  massKg: number,
  powerW: number,
  engineForceN: number,
  brakeAcceleration: number,
  grip: number,
  wheels: WheelGeometry,
  steeringRadians: number,
): VehicleClass {
  return Object.freeze({
    classId,
    version: VEHICLE_CLASS_VERSION,
    massKg,
    powerW,
    engineForceN,
    brakeAcceleration,
    grip,
    wheels: Object.freeze({ ...wheels }),
    steeringRadians,
    turningRadiusM: wheels.wheelbaseM / Math.tan(steeringRadians),
    suspensionStiffness: 35,
  });
}
/** Bounded, immutable mechanical definitions; never merged with settings or DrivingProfile. */
export const VEHICLE_CLASSES = Object.freeze({
  sedan: define(
    'sedan',
    1400,
    90000,
    6500,
    8,
    1.3,
    { radiusM: 0.32, wheelbaseM: 2.7, trackM: 1.8 },
    0.45,
  ),
  compact: define(
    'compact',
    1100,
    70000,
    7000,
    9,
    1.5,
    { radiusM: 0.29, wheelbaseM: 2.4, trackM: 1.6 },
    0.55,
  ),
});
export function vehicleClass(
  classId: VehicleClassId,
  version = VEHICLE_CLASS_VERSION,
): VehicleClass {
  if (version !== VEHICLE_CLASS_VERSION || !Object.hasOwn(VEHICLE_CLASSES, classId))
    throw new RangeError('Unknown vehicle class/version');
  return VEHICLE_CLASSES[classId];
}
/** Force cap handles launch/zero speed; power limits propulsion at speed, in either direction. */
export function tractiveForceN(
  config: Pick<VehicleClass, 'powerW' | 'engineForceN'>,
  speedMps: number,
) {
  if (!Number.isFinite(speedMps)) throw new RangeError('Invalid drivetrain speed');
  return speedMps === 0
    ? config.engineForceN
    : Math.min(config.engineForceN, config.powerW / Math.abs(speedMps));
}
