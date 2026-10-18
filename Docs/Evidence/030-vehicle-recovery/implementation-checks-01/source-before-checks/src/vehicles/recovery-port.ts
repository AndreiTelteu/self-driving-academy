import { fields, number, requireContract, tick } from '../sessions';
import type { ContractContext } from '../sessions';
import { copyBodyTransform, copyBodyVector } from './body-port';
import type { BodyIdentity, BodyTransform, BodyVector } from './body-port';

export const RECOVERY_LIMITS = Object.freeze({
  version: '030-explicit-recovery-v1' as const,
  vehicles: 110, slots: 6, actorsPerTick: 19, operations: 4096,
  serializedBytes: 4 * 1024 * 1024, page: 64, idCodeUnits: 256,
});
export interface RecoveryNativeState {
  readonly identity: BodyIdentity;
  readonly physicsStepSerial: number;
  readonly transform: BodyTransform;
  readonly velocityMps: BodyVector;
  readonly angularVelocityRadS: BodyVector;
}
/** Pure authored road proof. The native owner still checks full geometry/support/occupancy. */
export interface RecoveryRoadProof {
  readonly mapId: string;
  readonly laneId: string;
  readonly access: 'TAXI' | 'CIVIL';
  readonly start: BodyVector;
  readonly end: BodyVector;
  readonly widthM: number;
}
export interface RecoveryPlacement {
  readonly identity: BodyIdentity;
  readonly context: ContractContext;
  readonly expectedPhysicsSerial: number;
  readonly transform: BodyTransform;
  readonly road: RecoveryRoadProof;
}
export interface RecoveryInspection {
  readonly status: 'SAFE' | 'BLOCKED' | 'INVALID_SUPPORT';
  readonly physicsStepSerial: number;
  readonly colliderCount: number;
  readonly blockingColliderHandle: number | null;
}
export interface RecoveryPlacementResult {
  readonly inspection: RecoveryInspection;
  readonly before: RecoveryNativeState;
  readonly after: RecoveryNativeState | null;
  readonly attempted: number;
  readonly completed: number;
  readonly failure: string | null;
}
export interface PhysicsRecoveryPort {
  readNative(identity: BodyIdentity): RecoveryNativeState;
  inspectPlacement(request: RecoveryPlacement): RecoveryInspection;
  /** Fresh inspection and native setters in one synchronous guarded operation. No world.step. */
  applyPlacement(request: RecoveryPlacement): RecoveryPlacementResult;
  release(): void;
}
/** Copy own-data fields before any native crossing; getter-bearing transforms are rejected. */
export function recoveryTransform(value: unknown): BodyTransform {
  const t = fields(value, ['positionM', 'rotationQuaternion']);
  const p = fields(t.positionM, ['x', 'y', 'z']);
  const q = fields(t.rotationQuaternion, ['x', 'y', 'z', 'w']);
  const result = copyBodyTransform({
    positionM: { x: number(p.x), y: number(p.y), z: number(p.z) },
    rotationQuaternion: { x: number(q.x), y: number(q.y), z: number(q.z), w: number(q.w) },
  });
  // Recovery preserves yaw only. Unsupported slope/upside-down candidates are never normalized.
  requireContract(result.rotationQuaternion.x === 0 && result.rotationQuaternion.z === 0,
    'Recovery requires upright yaw pose');
  return result;
}
export function recoveryIdentity(value: unknown): BodyIdentity {
  const d = fields(value, ['entityId', 'handle', 'generation']);
  requireContract(typeof d.entityId === 'string' && d.entityId.length > 0 &&
    d.entityId.length <= RECOVERY_LIMITS.idCodeUnits, 'Recovery identity capacity');
  number(d.handle); requireContract(tick(d.generation) > 0, 'Recovery generation');
  return value as BodyIdentity;
}
export function recoveryVector(value: unknown): BodyVector {
  const d = fields(value, ['x', 'y', 'z']);
  return copyBodyVector({ x: number(d.x), y: number(d.y), z: number(d.z) });
}
