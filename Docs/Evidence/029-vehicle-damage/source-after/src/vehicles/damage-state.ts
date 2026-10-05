import {
  contextFields,
  fields,
  number,
  readContext,
  requireContract,
  text,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import type { BodyIdentity } from './body-port';
import type { CollisionIncident } from './collision-episodes';
import { DAMAGE_CONFIG } from './damage-port';
import type {
  DamageHistoryRecord,
  DamageIdentityPort,
  DamageProjection,
  VehicleAvailability,
} from './damage-port';

interface Entry {
  readonly identity: BodyIdentity;
  readonly massKg: number;
  availability: VehicleAvailability;
  lastIncidentId: string | null;
  lastOperationTick: number;
}
function id(value: unknown, maximum: number = DAMAGE_CONFIG.idCodeUnits) {
  requireContract(typeof value === 'string' && value.length <= maximum, 'Damage identity capacity');
  const result = text(value);
  requireContract(result.length <= maximum, 'Damage identity capacity');
  return result;
}
function context(value: unknown) {
  const data = fields(value, contextFields);
  id(data.sessionId);
  const result = Object.freeze(readContext(data));
  id(result.sessionId);
  return result;
}
function bodyId(value: unknown) {
  const data = fields(value, ['entityId', 'handle', 'generation']);
  const result = id(data.entityId);
  number(data.handle);
  requireContract(tick(data.generation) > 0, 'Damage body generation');
  return result;
}
function effect(availability: VehicleAvailability) {
  return {
    throttleMagnitudeLimit:
      availability === 'AVAILABLE'
        ? 1
        : availability === 'DAMAGED'
          ? DAMAGE_CONFIG.damagedThrottleMagnitudeLimit
          : 0,
    minimumBrake: availability === 'IMMOBILIZED' ? 1 : 0,
  };
}

/** Bounded early-session history; capacity failure backpressures028 before any damage commit. */
export function createVehicleDamage(
  initialContext: ContractContext,
  initialPort: DamageIdentityPort,
  historyCapacity: number = DAMAGE_CONFIG.historyRecords,
) {
  let world = context(initialContext);
  let port: DamageIdentityPort | undefined = initialPort;
  requireContract(
    typeof initialPort.bodyIdentity === 'function' &&
      typeof initialPort.collisionSource?.isCurrent === 'function',
    'Damage identity port',
  );
  const capacity = tick(historyCapacity);
  requireContract(
    capacity > 0 && capacity <= DAMAGE_CONFIG.historyRecords,
    'Damage history capacity',
  );
  const entries = new Map<string, Entry>();
  const history: DamageHistoryRecord[] = [];
  const operations = new Map<string, DamageHistoryRecord>();
  let currentTick = 0,
    busy = false,
    disposed = false,
    serializedHistoryBytes = 2;
  function mutate<T>(work: () => T): T {
    requireContract(!busy && !disposed, 'Damage owner disposed or reentrant');
    busy = true;
    try {
      return work();
    } finally {
      busy = false;
    }
  }
  function entry(identity: BodyIdentity) {
    const key = bodyId(identity);
    const result = entries.get(key);
    requireContract(
      result?.identity === identity && port!.bodyIdentity(key) === identity,
      'Stale damage body identity',
    );
    return result;
  }
  function sameWorld(value: ContractContext) {
    const parsed = context(value);
    requireContract(
      parsed.sessionId === world.sessionId && parsed.worldEpoch === world.worldEpoch,
      'Damage operation world',
    );
  }
  function accept(record: DamageHistoryRecord, apply: () => void) {
    const existing = operations.get(record.operationId);
    if (existing) {
      requireContract(
        JSON.stringify(existing) === JSON.stringify(record),
        'Conflicting damage operation identity',
      );
      return false;
    }
    requireContract(record.tick >= currentTick, 'Damage operation tick cannot decrease');
    requireContract(
      history.length < capacity,
      'Damage history full: preserve/export history before resuming',
    );
    const recordBytes =
      new TextEncoder().encode(JSON.stringify(record)).byteLength + (history.length > 0 ? 1 : 0);
    requireContract(
      serializedHistoryBytes + recordBytes <= DAMAGE_CONFIG.serializedHistoryBytes,
      'Damage serialized history full: preserve/export before resuming',
    );
    apply();
    serializedHistoryBytes += recordBytes;
    history.push(record);
    operations.set(record.operationId, record);
    currentTick = record.tick;
    return true;
  }
  return Object.freeze({
    register(identity: BodyIdentity, massKg: number) {
      mutate(() => {
        const key = bodyId(identity);
        const mass = number(massKg, 1, 1_000_000);
        requireContract(port!.bodyIdentity(key) === identity, 'Stale damage registration');
        for (const [name, old] of entries)
          if (port!.bodyIdentity(name) !== old.identity) entries.delete(name);
        requireContract(
          !entries.has(key) && entries.size < DAMAGE_CONFIG.vehicles,
          'Damage vehicle admission',
        );
        entries.set(key, {
          identity,
          massKg: mass,
          availability: 'AVAILABLE',
          lastIncidentId: null,
          lastOperationTick: currentTick,
        });
      });
    },
    remove(identity: BodyIdentity) {
      return mutate(() => {
        const key = bodyId(identity);
        if (entries.get(key)?.identity !== identity) return false;
        entries.delete(key);
        return true;
      });
    },
    applyIncident(value: CollisionIncident) {
      return mutate(() => {
        const data = fields(value, [
          ...contextFields,
          'incidentId',
          'tick',
          'vehicleId',
          'otherEntityId',
          'impulseNs',
          'first',
          'second',
        ]);
        sameWorld(readContext(data));
        const operationId = id(data.incidentId, DAMAGE_CONFIG.operationIdCodeUnits);
        const at = tick(data.tick),
          impulseNs = number(data.impulseNs, 0);
        const vehicleId = id(data.vehicleId),
          otherEntityId = id(data.otherEntityId);
        const first = data.first as CollisionIncident['first'],
          second = data.second as CollisionIncident['second'];
        requireContract(
          first !== second &&
            port!.collisionSource.isCurrent(first) &&
            port!.collisionSource.isCurrent(second),
          'Stale damage collision identity',
        );
        requireContract(
          first.entityId !== second.entityId &&
            [first.entityId, second.entityId].includes(vehicleId) &&
            [first.entityId, second.entityId].includes(otherEntityId) &&
            vehicleId !== otherEntityId,
          'Damage incident participants',
        );
        const participants = [first, second]
          .filter((token) => token.kind === 'VEHICLE')
          .sort((a, b) => (a.entityId < b.entityId ? -1 : 1));
        requireContract(
          participants.some((token) => token.entityId === vehicleId),
          'Damage primary participant must be vehicle',
        );
        const affected = participants.map((token) => {
          const active = entries.get(token.entityId);
          requireContract(active !== undefined, 'Damage participant unregistered');
          return entry(active.identity);
        });
        // Recheck every source after boundary reads, before all-or-nothing state commit.
        for (const token of [first, second])
          requireContract(
            port!.collisionSource.isCurrent(token),
            'Damage collision changed during admission',
          );
        for (const active of affected) entry(active.identity);
        const record: DamageHistoryRecord = Object.freeze({
          ...world,
          kind: 'INCIDENT',
          operationId,
          tick: at,
          vehicleIds: Object.freeze(affected.map((active) => active.identity.entityId)),
          bodyGenerations: Object.freeze(affected.map((active) => active.identity.generation)),
          collisionSerials: Object.freeze([first.serial, second.serial]),
          impulseNs,
          otherEntityId,
        });
        return accept(record, () => {
          for (const active of affected) {
            const equivalentDeltaVelocityMps = impulseNs / active.massKg;
            if (equivalentDeltaVelocityMps >= DAMAGE_CONFIG.immobilizedEquivalentDeltaVelocityMps)
              active.availability = 'IMMOBILIZED';
            else if (
              equivalentDeltaVelocityMps >= DAMAGE_CONFIG.damagedEquivalentDeltaVelocityMps &&
              active.availability === 'AVAILABLE'
            )
              active.availability = 'DAMAGED';
            active.lastIncidentId = operationId;
            active.lastOperationTick = at;
          }
        });
      });
    },
    recover(
      identity: BodyIdentity,
      request: {
        readonly context: ContractContext;
        readonly operationId: string;
        readonly tick: number;
      },
    ) {
      return mutate(() => {
        const data = fields(request, ['context', 'operationId', 'tick']);
        sameWorld(data.context as ContractContext);
        const active = entry(identity),
          at = tick(data.tick);
        const record: DamageHistoryRecord = Object.freeze({
          ...world,
          kind: 'RECOVERY',
          operationId: id(data.operationId, DAMAGE_CONFIG.operationIdCodeUnits),
          tick: at,
          vehicleIds: Object.freeze([identity.entityId]),
          bodyGenerations: Object.freeze([identity.generation]),
          collisionSerials: Object.freeze([]),
          impulseNs: null,
          otherEntityId: null,
        });
        entry(identity);
        return accept(record, () => {
          active.availability = 'AVAILABLE';
          active.lastOperationTick = at;
        });
      });
    },
    readDamage(identity: BodyIdentity): DamageProjection {
      return mutate(() => {
        const active = entry(identity);
        return Object.freeze({
          identity: active.identity,
          availability: active.availability,
          massKg: active.massKg,
          lastIncidentId: active.lastIncidentId,
          lastOperationTick: active.lastOperationTick,
          ...effect(active.availability),
        });
      });
    },
    readAvailability(identity: BodyIdentity, suppliedContext: ContractContext, at: number) {
      return mutate(() => {
        sameWorld(suppliedContext);
        requireContract(tick(at) >= currentTick, 'Damage realization predates incident');
        return Object.freeze(effect(entry(identity).availability));
      });
    },
    readHistory(offset = 0, limit = 64): readonly DamageHistoryRecord[] {
      requireContract(!disposed && !busy, 'Damage owner disposed or reentrant');
      const start = tick(offset),
        count = tick(limit);
      requireContract(count <= 64, 'Damage history page capacity');
      return Object.freeze(history.slice(start, start + count));
    },
    reset(nextContext: ContractContext, nextPort: DamageIdentityPort) {
      mutate(() => {
        const next = context(nextContext);
        requireContract(
          next.sessionId === world.sessionId && next.worldEpoch > world.worldEpoch,
          'Damage reset must advance same-session epoch',
        );
        requireContract(
          typeof nextPort.bodyIdentity === 'function' &&
            typeof nextPort.collisionSource?.isCurrent === 'function',
          'Damage reset port',
        );
        world = next;
        port = nextPort;
        entries.clear();
        currentTick = 0;
        // Prior incident/recovery records remain bounded and unchanged.
      });
    },
    getStats() {
      return Object.freeze({
        context: world,
        vehicles: entries.size,
        historyRecords: history.length,
        operationIds: operations.size,
        historyCapacity: capacity,
        serializedHistoryBytes,
        serializedHistoryByteCapacity: DAMAGE_CONFIG.serializedHistoryBytes,
        tick: currentTick,
        disposed,
      });
    },
    dispose() {
      requireContract(!busy, 'Damage disposal reentrant');
      if (disposed) return;
      disposed = true;
      entries.clear();
      history.length = 0;
      serializedHistoryBytes = 0;
      operations.clear();
      port = undefined;
    },
  });
}
