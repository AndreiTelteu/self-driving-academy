import type { ContractContext } from '../../../src/sessions';
import type { RecoveryNativeState } from '../../../src/vehicles/recovery-port';
import type { RecoveryRecord } from '../../../src/vehicles/recovery-ledger';
import type { CollisionIncident } from '../../../src/vehicles/collision-episodes';
import type { CollisionIdentity } from '../../../src/vehicles/collision-port';
import type { DamageHistoryRecord } from '../../../src/vehicles/damage-port';
import { decodeDiagnosticText } from './functional-diagnostic';
export interface FunctionalKey {
  isTrusted: boolean;
  code: string;
  type: string;
  repeat: boolean;
  tick: number;
  vehicleId: string | null;
  generation: number | null;
  stage: string;
}
interface Boundary {
  subject: RecoveryNativeState;
  other: RecoveryNativeState;
}
interface Operation {
  edge: FunctionalKey;
  acceptedTick: number;
  serialBefore: number;
  serialAfter: number;
  before: Boundary;
  after: Boundary;
  otherBefore: RecoveryNativeState;
  otherAfter: RecoveryNativeState;
  record: RecoveryRecord;
  result: string;
}
interface KeyInterval {
  keysStart: number;
  keysEnd: number;
}
export interface FunctionalCase {
  [key: string]: unknown;
  classId: string;
  status: string;
  vehicleId: string;
  generation: number;
  context: ContractContext;
  setupWrites: unknown[];
  deliveryOrder: string[];
  rows: {
    tick: number;
    nativeSerial: number;
    heightM: number;
    speedMps: number;
    wheelContacts: number;
    rotation: Record<string, number>;
    suspension: number[];
    raw: unknown;
    effective: unknown;
  }[];
  keys: FunctionalKey[];
  supportCurve: {
    heightM: number;
    upDot: number;
    nativeSerial: number;
    suspension: number[];
    accepted: boolean;
    wheelContacts: number;
  }[];
  incidents: CollisionIncident[];
  collisionIdentities: CollisionIdentity[];
  nativeImpulseNs: number;
  mechanicsBefore: Record<string, unknown>;
  mechanicsAfter: Record<string, unknown>;
  noPoint: Operation;
  recovered: Operation;
  blocked: Operation;
  remapped: Operation;
  hud: Operation & { pointer: { isTrusted: boolean }; focusedOwnButton: boolean };
  staleHud: {
    pointer: { isTrusted: boolean; actualSeat: unknown };
    before: Boundary;
    after: Boundary;
    historyBefore: string;
    historyAfter: string;
  };
  auto: KeyInterval & {
    seat: unknown;
    before: Boundary;
    after: Boundary;
    historyBefore: string;
    historyAfter: string;
  };
  staleGeneration: { rejected: boolean; before: Boundary; after: Boundary };
  repeat: KeyInterval & {
    edge: FunctionalKey;
    acceptedTick: number;
    serialBefore: number;
    serialAfter: number;
    before: Boundary;
    after: Boundary;
    historyBefore: string;
    historyAfter: string;
    eventsBefore: number;
    eventsAfter: number;
  };
  remapOld: KeyInterval & {
    before: Boundary;
    after: Boundary;
    historyBefore: string;
    historyAfter: string;
  };
  unsupported: { result: { inspection: { status: string }; attempted: number } }[];
  nativeSetterFault: {
    scope: string;
    result: NonNullable<RecoveryRecord['placement']>;
    operation: Operation;
    injectedSetterAttempts: number;
    retryRejected: boolean;
    serialBefore: number;
    serialAfter: number;
    before: Boundary;
    after: Boundary;
  };
  deliveryRetry: {
    scope: string;
    partial: RecoveryRecord;
    completed: RecoveryRecord;
    segmentAttempts: number;
    serialBefore: number;
    serialAfter: number;
    before: Boundary;
    after: Boundary;
  };
  history: RecoveryRecord[];
  historyBytes: number;
  damageBefore: DamageHistoryRecord[];
  damageAfter: DamageHistoryRecord[];
  lastIncidentBefore: unknown;
  lastIncidentAfter: unknown;
  availabilityAfter: string;
  segmentBefore: Record<string, unknown>;
  segmentAfter: Record<string, unknown>;
  events: (ContractContext & {
    type: string;
    eventId: string;
    tick: number;
    entityIds: string[];
    payload: { vehicleId: string; recoveryPointId: string };
  })[];
  neutral: { heldKeys: number; raw: { throttle: number; brake: number; steering: number } };
  lifetimes: {
    activePorts: number;
    afterPorts: number;
    listeners: number;
    nodes: number;
    serialBefore: number;
    serialAfter: number;
  }[];
  cleanup: {
    nativeBodies: number;
    nativeColliders: number;
    nativeSubscriptions: number;
    recoveryPorts: number;
    driveListeners: number;
    recoveryListeners: number;
    recoveryNodes: number;
    domConnected: boolean;
    totalCauses: number;
    resources: number;
    attempted: number;
  };
}
export interface FunctionalReport {
  version: string;
  status: string;
  identity: Record<string, string>;
  firstWorldAt: string;
  completedAt: string;
  cases: FunctionalCase[];
  backendCleanup: {
    sceneDisposed: boolean;
    meshes: number;
    materials: number;
    engineScenes: number;
  };
  ownership: { totalCauses: number; resources: number; attempted: number };
}
/** Bounds and checks every actual raw JSON node before semantic DTO access; no getter crossing. */
export function functionalJsonBoundary(value: unknown) {
  let nodes = 0;
  function visit(item: unknown, depth: number, field = '', parent?: Record<string, unknown>) {
    if (++nodes > 100000 || depth > 32) throw new Error('Functional JSON structural capacity');
    if (typeof item === 'string') {
      const cap =
        field === 'data'
          ? 10924
          : field === 'historyBefore' || field === 'historyAfter'
            ? 65536
            : field === 'gpu' || field === 'message'
              ? 4096
              : field === 'category'
                ? 64
                : 512;
      if (item.length > cap) throw new Error('Bounded functional string: ' + field);
      if (
        (field === 'historyBefore' || field === 'historyAfter') &&
        new TextEncoder().encode(item).byteLength > 65536
      )
        throw new Error('Bounded UTF8 history snapshot');
      if (field === 'sessionId' && item !== '030-trusted-functional')
        throw new Error('Actual fixture context session');
      if (
        ['vehicleId', 'entityId', 'otherEntityId'].includes(field) &&
        !['subject', 'other', 'wall', 'ground'].includes(item)
      )
        throw new Error('Actual fixture actor identity');
      if (field === 'mapId' && item !== '030-authored-road-v1')
        throw new Error('Actual fixture road identity');
      if (field === 'laneId' && item !== 'lane-0') throw new Error('Actual fixture lane identity');
      if (field === 'data') decodeDiagnosticText(parent, 4096);
      return;
    }
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error('Finite JSON number');
      return;
    }
    if (typeof item !== 'object') throw new Error('JSON own-data expected');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
      throw new Error('Plain functional JSON object');
    if (Array.isArray(item) && item.length > 4096) throw new Error('Bounded functional JSON array');
    if (Array.isArray(item) && field === 'causes' && item.length > 32)
      throw new Error('Bounded actual diagnostic cause ledger');
    const keys = Object.keys(item);
    if (keys.length > (Array.isArray(item) ? 4096 : 128))
      throw new Error('Bounded functional object field count');
    // Complete the descriptor audit before any codec or recursive property access.
    for (const key of keys) {
      if (key.length > 64) throw new Error('Bounded functional object key');
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!Object.hasOwn(descriptor, 'value')) throw new Error('Getter in functional JSON');
    }
    if (Object.hasOwn(item, 'encoding')) decodeDiagnosticText(item, field === 'text' ? 4096 : 2048);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!Object.hasOwn(descriptor, 'value')) throw new Error('Getter in functional JSON');
      visit(descriptor.value, depth + 1, key, item as Record<string, unknown>);
    }
  }
  visit(value, 0);
  return value;
}
