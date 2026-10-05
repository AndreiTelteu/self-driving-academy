import type { PhysicsBodyPort } from './body-port';
import type { VehicleClassId, VehicleClass, WheelGeometry } from './vehicle-classes';
import type { PhysicsCollisionPort } from './collision-port';
/** SI units; no Rapier objects escape this port. Prototype configuration, not driver style. */
export const PHYSICS_CONFIG = Object.freeze({
  version: '021-raycast-v1',
  hz: 60,
  solverIterations: 8,
  ccdSubsteps: 4,
  vehicles: 110,
  worlds: 1,
  obstacles: 96,
  bodies: 207,
  colliders: 256,
  queryScratchBytes: 4096,
  // Admission estimate, not exact allocator/physical RAM measurement.
  ownedWasmEstimateBytes: 32 * 1024 * 1024,
});
export interface CarTuning {
  readonly massKg: number;
  readonly grip: number;
  readonly brakeAcceleration: number;
  readonly engineForceN: number;
  readonly steeringRadians: number;
  readonly suspensionStiffness: number;
  readonly powerW?: number;
  readonly wheels?: WheelGeometry;
}
export const SEDAN: CarTuning = Object.freeze({
  massKg: 1400,
  grip: 1.3,
  brakeAcceleration: 8,
  engineForceN: 6500,
  steeringRadians: 0.45,
  suspensionStiffness: 35,
});
export interface PhysicsInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
}
export interface PhysicsVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface CarProjection {
  readonly id: string;
  readonly position: PhysicsVector;
  readonly rotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly velocity: PhysicsVector;
  readonly speed: number;
  readonly suspension: readonly number[];
  readonly wheelContacts: number;
}
export interface PhysicsCosts {
  readonly controllerMs: number;
  readonly stepMs: number;
  readonly queryMs: number;
  readonly bridgeMs: number;
  readonly totalMs: number;
  readonly queryCount: number;
  readonly bridgeCalls: number;
}
export interface PhysicsProbe extends PhysicsBodyPort, PhysicsCollisionPort {
  addCar(id: string, position: PhysicsVector, tuning?: CarTuning): void;
  addClassCar(
    id: string,
    position: PhysicsVector,
    classId: VehicleClassId,
    version?: VehicleClass['version'],
  ): void;
  readVehicleMechanics(id: string): {
    readonly classId: VehicleClassId | null;
    readonly version: string;
    readonly massKg: number;
    readonly powerW: number | null;
    readonly grip: number;
    readonly brakeAccelerationMps2: number;
    readonly wheels: WheelGeometry;
    readonly turningRadiusM: number;
    readonly appliedEngineForceN: readonly number[];
    readonly appliedSteeringRadians: readonly number[];
  };
  addBox(position: PhysicsVector, halfSize: PhysicsVector, dynamic?: boolean): void;
  setVelocity(id: string, velocity: PhysicsVector): void;
  step(inputs: ReadonlyMap<string, PhysicsInput>, measure?: boolean): PhysicsCosts;
  project(id: string): CarProjection;
  contacts(): number;
  counts(): { vehicles: number; bodies: number; colliders: number };
  dispose(): void;
}
