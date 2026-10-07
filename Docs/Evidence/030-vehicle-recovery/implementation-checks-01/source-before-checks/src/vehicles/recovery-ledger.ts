import { requireContract, tick } from '../sessions';
import type { ContractContext } from '../sessions';
import type { BodyIdentity } from './body-port';
import type { RecoveryNativeState } from './recovery-port';
import { RECOVERY_LIMITS } from './recovery-port';

export type RecoverySnapshot = Omit<RecoveryNativeState, 'identity'>;
export interface RecoveryEvidence {
  readonly status: 'SAFE' | 'BLOCKED' | 'INVALID_SUPPORT';
  readonly physicsStepSerial: number;
  readonly colliderCount: number;
  readonly after: RecoverySnapshot | null;
  readonly attempted: number;
  readonly completed: number;
  readonly failure: string | null;
}
export function recoverySnapshot(state: RecoveryNativeState): RecoverySnapshot {
  return Object.freeze({ physicsStepSerial: state.physicsStepSerial, transform: state.transform,
    velocityMps: state.velocityMps, angularVelocityRadS: state.angularVelocityRadS });
}
export interface RecoveryRecord {
  readonly context: ContractContext;
  readonly operationId: string;
  readonly vehicleId: string;
  readonly bodyGeneration: number;
  readonly pointId: string;
  readonly mapId: string;
  readonly laneId: string;
  readonly access: 'TAXI' | 'CIVIL';
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly validatedTick: number;
  readonly requestedTick: number;
  readonly acceptedTick: number;
  readonly origin: 'R' | 'HUD';
  readonly kind: 'TELEPORT';
  readonly learningEligible: false;
  readonly status: 'ADMITTED' | 'DENIED' | 'PARTIAL' | 'COMPLETED';
  readonly before: RecoverySnapshot | null;
  readonly placement: RecoveryEvidence | null;
  readonly deliveredStages: number;
  readonly failure: string | null;
}
const encoder = new TextEncoder();
// Proven structural bound to be checked by worst-shape pure test before any native acceptance.
export const RECOVERY_RECORD_RESERVE_BYTES = 16384;
export function createRecoveryLedger() {
  const records: RecoveryRecord[] = [], operations = new Map<string, { fingerprint: string; index: number }>();
  const active = new Set<number>();
  let bytes = 2, reserved = 0;
  const encoded = (record: RecoveryRecord) => encoder.encode(JSON.stringify(record)).byteLength;
  return Object.freeze({
    lookup(operationId: string, fingerprint: string): RecoveryRecord | null {
      const prior = operations.get(operationId);
      if (!prior) return null;
      requireContract(prior.fingerprint === fingerprint, 'Conflicting recovery operation');
      return records[prior.index]!;
    },
    admit(record: RecoveryRecord, fingerprint: string): number {
      requireContract(!operations.has(record.operationId), 'Recovery operation already admitted');
      const size = encoded(record), delimiter = records.length ? 1 : 0;
      requireContract(size <= RECOVERY_RECORD_RESERVE_BYTES, 'Recovery record structural bound');
      requireContract(records.length < RECOVERY_LIMITS.operations &&
        bytes + reserved + delimiter + RECOVERY_RECORD_RESERVE_BYTES <= RECOVERY_LIMITS.serializedBytes,
        'Recovery history full: preserve/export before resuming');
      const index = records.length;
      records.push(Object.freeze(record)); operations.set(record.operationId, { fingerprint, index }); active.add(index);
      bytes += size + delimiter; reserved += RECOVERY_RECORD_RESERVE_BYTES - size;
      return index;
    },
    update(index: number, record: RecoveryRecord): void {
      const prior = records[tick(index)];
      requireContract(active.has(index) && prior !== undefined && prior.operationId === record.operationId, 'Recovery ledger slot');
      const previous = encoded(prior), next = encoded(record);
      requireContract(next <= RECOVERY_RECORD_RESERVE_BYTES, 'Recovery record structural bound');
      bytes += next - previous; reserved -= next - previous;
      records[index] = Object.freeze(record);
    },
    finish(index: number): void {
      const record = records[tick(index)]; requireContract(record !== undefined, 'Recovery ledger slot');
      requireContract(active.delete(index), 'Recovery reservation already released');
      reserved -= RECOVERY_RECORD_RESERVE_BYTES - encoded(record);
    },
    readHistory(offset = 0, limit = 64): readonly RecoveryRecord[] {
      const start = tick(offset), count = tick(limit);
      requireContract(count <= RECOVERY_LIMITS.page, 'Recovery history page capacity');
      return Object.freeze(records.slice(start, start + count));
    },
    getStats() { return Object.freeze({ records: records.length, operations: operations.size,
      serializedBytes: bytes, reservedBytes: reserved, byteCapacity: RECOVERY_LIMITS.serializedBytes }); },
    clear() { records.length = 0; operations.clear(); active.clear(); bytes = 2; reserved = 0; },
  });
}
/** Exact registration pointer is retained only by active owner, never history serialization. */
export interface RecoveryCandidate {
  readonly identity: BodyIdentity;
  readonly pointId: string;
  readonly validatedTick: number;
  readonly transform: RecoveryNativeState['transform'];
}
