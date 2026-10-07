import {
  contextFields,
  createStableId,
  fields,
  readContext,
  requireContract,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import type { BodyIdentity, BodyTransform } from './body-port';
import type { PhysicsProbe } from './physics';
import type { VehicleController } from './controller-port';
import type { createVehicleDamage } from './damage-state';
import { RECOVERY_LIMITS, recoveryIdentity } from './recovery-port';
import type { PhysicsRecoveryPort, RecoveryPlacement, RecoveryRoadProof } from './recovery-port';
import { createRecoveryLedger, recoverySnapshot } from './recovery-ledger';
import type { RecoveryRecord } from './recovery-ledger';

export interface RecoverySegmentBoundary {
  inspect(identity: BodyIdentity, at: number): void;
  close(identity: BodyIdentity, at: number, operationId: string): void;
}
type RoadAccess = 'TAXI' | 'CIVIL';
export interface RecoverySeatPort {
  getStats(): {
    readonly context: ContractContext;
    readonly tick: number;
    readonly disposed: boolean;
    readonly suspended: boolean;
    readonly fault: unknown;
    readonly seat: { readonly identity: BodyIdentity; readonly mode: 'MANUAL' | 'LEARNING' } | null;
  };
}
export interface RecoveryEvent extends ContractContext {
  readonly eventId: string;
  readonly tick: number;
  readonly entityIds: readonly string[];
  readonly type: 'VEHICLE_RECOVERED';
  readonly payload: { readonly vehicleId: string; readonly recoveryPointId: string };
}
export interface RecoveryEventPort {
  inspectPublication?(value: unknown): 'new' | 'duplicate';
  publish(value: unknown): {
    readonly status: 'delivered' | 'duplicate';
    readonly failures: readonly unknown[];
  };
  getStats(): {
    readonly sessionId: string;
    readonly worldEpoch: number;
    readonly disposed: boolean;
  };
}
interface Entry {
  readonly identity: BodyIdentity;
  readonly access: RoadAccess;
  readonly slot: number;
  candidate: {
    readonly pointId: string;
    readonly validatedTick: number;
    readonly transform: BodyTransform;
    readonly road: RecoveryRoadProof;
  } | null;
}
interface Intent {
  readonly identity: BodyIdentity;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly tick: number;
  readonly origin: 'R' | 'HUD';
  readonly operationId: string;
}
/** Explicit game operation owner; scheduler calls observe after the accepted024 physical tick. */
export function createVehicleRecovery(
  context: ContractContext,
  ports: {
    readonly physics: PhysicsProbe;
    readonly controller: VehicleController;
    readonly authority: RecoverySeatPort;
    readonly road: {
      readonly mapId: string;
      locate(transform: BodyTransform, access: RoadAccess): RecoveryRoadProof | null;
    };
    readonly damage: ReturnType<typeof createVehicleDamage>;
    readonly eventBus: RecoveryEventPort;
    readonly segments: RecoverySegmentBoundary;
    readonly clearAddressedInput: (identity: BodyIdentity) => void;
  },
) {
  const world = Object.freeze(readContext(fields(context, contextFields)));
  requireContract(world.sessionId.length <= 256, 'Recovery session capacity');
  requireContract(
    typeof ports.physics.createRecoveryPort === 'function' &&
      typeof ports.controller.invalidateRealization === 'function' &&
      typeof ports.damage.inspectRecovery === 'function' &&
      typeof ports.eventBus.inspectPublication === 'function',
    'Recovery needs real guarded capabilities',
  );
  const nativeSerialAtAdmission = ports.physics.collisionStepSerial();
  const controllerBoundary = () => ports.controller.readBoundary?.() ?? ports.controller.getStats();
  const initialController = controllerBoundary(),
    initialAuthority = ports.authority.getStats();
  requireContract(
    initialController.tick === initialAuthority.tick,
    'Recovery owners have different accepted ticks',
  );
  const nativeTickOffset = nativeSerialAtAdmission - initialController.tick;
  requireContract(
    Number.isSafeInteger(nativeTickOffset) && nativeTickOffset >= 0,
    'Recovery native/controller epoch offset',
  );
  for (const actual of [initialController, initialAuthority, ports.damage.getStats()]) {
    requireContract(
      !actual.disposed &&
        JSON.stringify(readContext(fields(actual.context, contextFields))) ===
          JSON.stringify(world),
      'Foreign/disposed recovery owner composition',
    );
  }
  // These exact references already passed strict plain enumerable own-data context parsing.
  // A different or mutable context always takes the original parser path.
  const immutableContexts = new Set(
    [initialController.context, initialAuthority.context].filter((context) =>
      Object.isFrozen(context),
    ),
  );
  const bus = ports.eventBus.getStats();
  requireContract(
    !bus.disposed && bus.sessionId === world.sessionId && bus.worldEpoch === world.worldEpoch,
    'Foreign/disposed recovery event bus',
  );
  requireContract(
    typeof ports.clearAddressedInput === 'function' &&
      typeof ports.road.locate === 'function' &&
      typeof ports.segments.inspect === 'function' &&
      typeof ports.segments.close === 'function',
    'Recovery host ports',
  );
  requireContract(
    ports.physics.collisionStepSerial() === nativeSerialAtAdmission,
    'Native world advanced during recovery composition',
  );
  const native: PhysicsRecoveryPort = ports.physics.createRecoveryPort(world);
  const entries = new Map<string, Entry>(),
    slots = [0, 0, 0, 0, 0, 0],
    ledger = createRecoveryLedger();
  let pending: Intent | null = null,
    flight: { intent: Intent; index: number; record: RecoveryRecord; event: RecoveryEvent } | null =
      null;
  let busy = false,
    disposed = false,
    fault: string | null = null,
    lastTick = -1;
  let result: RecoveryRecord | 'NO_VALID_POINT' | 'CANCELLED' | null = null;
  const mutate = <T>(work: () => T): T => {
    requireContract(!busy && !disposed, 'Recovery disposed or reentrant');
    busy = true;
    try {
      return work();
    } finally {
      busy = false;
    }
  };
  const sameContext = (value: ContractContext) => {
    if (immutableContexts.has(value)) {
      requireContract(
        value.schemaVersion === world.schemaVersion &&
          value.units === world.units &&
          value.sessionId === world.sessionId &&
          value.worldEpoch === world.worldEpoch,
        'Foreign recovery context',
      );
      return;
    }
    const parsed = readContext(fields(value, contextFields));
    requireContract(JSON.stringify(parsed) === JSON.stringify(world), 'Foreign recovery context');
  };
  const fence = (identity: BodyIdentity, at: number, mode?: 'MANUAL' | 'LEARNING') => {
    recoveryIdentity(identity);
    requireContract(
      entries.get(identity.entityId)?.identity === identity &&
        ports.physics.bodyIdentity(identity.entityId) === identity,
      'Stale recovery registration',
    );
    const authority = ports.authority.getStats(),
      controller = controllerBoundary();
    sameContext(authority.context);
    sameContext(controller.context);
    requireContract(
      !authority.disposed &&
        !authority.suspended &&
        !authority.fault &&
        !controller.disposed &&
        !controller.suspended &&
        !controller.fault &&
        authority.tick === at &&
        controller.tick === at,
      'Recovery boundary paused/faulted/stale',
    );
    requireContract(
      ports.physics.collisionStepSerial() === nativeTickOffset + at,
      'Native world advanced outside accepted controller boundary',
    );
    if (mode !== undefined)
      requireContract(
        authority.seat?.identity === identity && authority.seat.mode === mode,
        'Recovery requires actual controlled seat',
      );
    requireContract(
      entries.get(identity.entityId)?.identity === identity &&
        ports.physics.bodyIdentity(identity.entityId) === identity,
      'Recovery token changed during owner readback',
    );
  };
  const synchronous = (returned: unknown) =>
    requireContract(returned === undefined, 'Recovery host must return synchronous void');
  const fail = (error: unknown) =>
    error instanceof Error
      ? (error.name + ': ' + error.message).slice(0, 512)
      : 'Recovery stage threw';
  const deliver = () => {
    requireContract(flight !== null, 'No recovery delivery');
    const active = flight,
      { intent, event } = active;
    const save = (stage: number) => {
      active.record = Object.freeze({ ...active.record, deliveredStages: stage });
      ledger.update(active.index, active.record);
      result = active.record;
    };
    try {
      fence(intent.identity, active.record.acceptedTick, intent.mode);
      if (active.record.deliveredStages < 1) {
        ports.controller.invalidateRealization!(
          intent.identity,
          active.record.acceptedTick,
          intent.mode,
        );
        save(1);
        fence(intent.identity, active.record.acceptedTick, intent.mode);
      }
      if (active.record.deliveredStages < 2) {
        synchronous(ports.clearAddressedInput(intent.identity));
        save(2);
        fence(intent.identity, active.record.acceptedTick, intent.mode);
      }
      if (active.record.deliveredStages < 3) {
        synchronous(
          ports.segments.close(intent.identity, active.record.acceptedTick, intent.operationId),
        );
        save(3);
        fence(intent.identity, active.record.acceptedTick, intent.mode);
      }
      if (active.record.deliveredStages < 4) {
        ports.damage.recover(intent.identity, {
          context: world,
          operationId: intent.operationId,
          tick: active.record.acceptedTick,
        });
        save(4);
        fence(intent.identity, active.record.acceptedTick, intent.mode);
      }
      if (active.record.deliveredStages < 5) {
        const publication = ports.eventBus.publish(event);
        save(5); //007 consumes identity before listeners; even listener failures never replay.
        if (publication.failures.length) {
          active.record = Object.freeze({
            ...active.record,
            failure: `${publication.failures.length} event listener failures`,
          });
          ledger.update(active.index, active.record);
        }
      }
      active.record = Object.freeze({ ...active.record, status: 'COMPLETED' });
      ledger.update(active.index, active.record);
      ledger.finish(active.index);
      result = active.record;
      flight = null;
      fault = null;
    } catch (error) {
      fault = fail(error);
      active.record = Object.freeze({ ...active.record, status: 'PARTIAL', failure: fault });
      ledger.update(active.index, active.record);
      result = active.record;
    }
  };
  return Object.freeze({
    register(identity: BodyIdentity, access: RoadAccess) {
      mutate(() => {
        recoveryIdentity(identity);
        requireContract(access === 'TAXI' || access === 'CIVIL', 'Recovery road access');
        requireContract(
          ports.physics.bodyIdentity(identity.entityId) === identity &&
            !entries.has(identity.entityId) &&
            entries.size < RECOVERY_LIMITS.vehicles,
          'Recovery registration/capacity',
        );
        const slot = slots.indexOf(Math.min(...slots));
        requireContract(
          slots[slot]! < RECOVERY_LIMITS.actorsPerTick,
          'Recovery scheduler capacity',
        );
        slots[slot]!++;
        entries.set(identity.entityId, { identity, access, slot, candidate: null });
      });
    },
    remove(identity: BodyIdentity): boolean {
      return mutate(() => {
        const entry = entries.get(identity.entityId);
        if (entry?.identity !== identity) return false;
        requireContract(
          flight?.intent.identity !== identity,
          'Preserve partial recovery before removing owner',
        );
        slots[entry.slot]!--;
        entries.delete(identity.entityId);
        if (pending?.identity === identity) pending = null;
        return true;
      });
    },
    observe(at: number) {
      mutate(() => {
        const current = tick(at);
        requireContract(
          lastTick < 0 || current === lastTick + 1,
          'Recovery observation tick must advance exactly once',
        );
        requireContract(
          flight === null && fault === null,
          'Recovery partial fault requires explicit delivery',
        );
        lastTick = current;
        for (const entry of entries.values()) {
          if (entry.slot !== current % 6) continue;
          fence(entry.identity, current);
          const projected = ports.physics.project(entry.identity.entityId);
          if (projected.wheelContacts !== 4) continue;
          const q = projected.rotation;
          // Tracking admission only; native physics/mechanics are unchanged. Calibration pending.
          if (1 - 2 * (q.x * q.x + q.z * q.z) < Math.cos((5 * Math.PI) / 180)) continue;
          const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
          const transform = Object.freeze({
            positionM: Object.freeze({
              x: projected.position.x,
              y: projected.position.y,
              z: projected.position.z,
            }),
            rotationQuaternion: Object.freeze({
              x: 0,
              y: Math.sin(yaw / 2),
              z: 0,
              w: Math.cos(yaw / 2),
            }),
          });
          const road = ports.road.locate(transform, entry.access);
          fence(entry.identity, current);
          if (!road) continue;
          requireContract(
            road.mapId === ports.road.mapId && road.access === entry.access,
            'Recovery road provider returned foreign map/access',
          );
          const request: RecoveryPlacement = {
            identity: entry.identity,
            context: world,
            expectedPhysicsSerial: ports.physics.collisionStepSerial(),
            transform,
            road,
          };
          const inspected = native.inspectPlacement(request);
          fence(entry.identity, current);
          if (inspected.status === 'SAFE')
            entry.candidate = Object.freeze({
              pointId: createStableId('recovery-point', ports.road.mapId, [
                entry.identity.entityId,
                String(entry.identity.generation),
                road.laneId,
                String(current),
              ]),
              validatedTick: current,
              transform,
              road,
            });
        }
      });
    },
    request(value: {
      readonly context: ContractContext;
      readonly identity: BodyIdentity;
      readonly mode: 'MANUAL' | 'LEARNING';
      readonly tick: number;
      readonly origin: 'R' | 'HUD';
    }): string {
      return mutate(() => {
        const d = fields(value, ['context', 'identity', 'mode', 'tick', 'origin']);
        sameContext(d.context as ContractContext);
        const identity = recoveryIdentity(d.identity),
          at = tick(d.tick);
        requireContract(d.mode === 'MANUAL' || d.mode === 'LEARNING', 'Explicit recovery mode');
        requireContract(d.origin === 'R' || d.origin === 'HUD', 'Explicit recovery origin');
        fence(identity, at, d.mode);
        requireContract(!fault && !flight, 'Recovery partial fault blocks new admission');
        const intent: Intent = Object.freeze({
          identity,
          mode: d.mode,
          tick: at,
          origin: d.origin,
          operationId: createStableId('recovery', world.sessionId, [
            String(world.worldEpoch),
            identity.entityId,
            String(identity.generation),
            String(at),
            d.origin,
          ]),
        });
        const fingerprint = JSON.stringify({
          operationId: intent.operationId,
          mode: intent.mode,
          origin: intent.origin,
        });
        const prior = ledger.lookup(intent.operationId, fingerprint);
        if (prior) {
          result = prior;
          return intent.operationId;
        }
        requireContract(
          pending === null || pending.operationId === intent.operationId,
          'Recovery pending capacity',
        );
        pending = intent;
        return intent.operationId;
      });
    },
    commit(at: number): RecoveryRecord | 'NO_VALID_POINT' | 'CANCELLED' | null {
      return mutate(() => {
        requireContract(!fault && !flight, 'Recovery partial fault blocks commit');
        if (!pending) return result;
        const intent = pending,
          current = tick(at);
        fence(intent.identity, current, intent.mode);
        requireContract(current === intent.tick, 'R must commit at its accepted tick boundary');
        const candidate = entries.get(intent.identity.entityId)!.candidate;
        if (!candidate) {
          pending = null;
          result = 'NO_VALID_POINT';
          return result;
        }
        const event: RecoveryEvent = Object.freeze({
          ...world,
          eventId: intent.operationId,
          tick: current,
          entityIds: Object.freeze([intent.identity.entityId]),
          type: 'VEHICLE_RECOVERED',
          payload: Object.freeze({
            vehicleId: intent.identity.entityId,
            recoveryPointId: candidate.pointId,
          }),
        });
        synchronous(ports.segments.inspect(intent.identity, current));
        fence(intent.identity, current, intent.mode);
        ports.damage.inspectRecovery(intent.identity, {
          context: world,
          operationId: intent.operationId,
          tick: current,
        });
        fence(intent.identity, current, intent.mode);
        ports.eventBus.inspectPublication!(event);
        fence(intent.identity, current, intent.mode);
        let record: RecoveryRecord = Object.freeze({
          context: world,
          operationId: intent.operationId,
          vehicleId: intent.identity.entityId,
          bodyGeneration: intent.identity.generation,
          pointId: candidate.pointId,
          mapId: candidate.road.mapId,
          laneId: candidate.road.laneId,
          access: candidate.road.access,
          mode: intent.mode,
          validatedTick: candidate.validatedTick,
          requestedTick: intent.tick,
          acceptedTick: current,
          origin: intent.origin,
          kind: 'TELEPORT',
          learningEligible: false,
          status: 'ADMITTED',
          before: null,
          placement: null,
          deliveredStages: 0,
          failure: null,
        });
        const fingerprint = JSON.stringify({
          operationId: intent.operationId,
          mode: intent.mode,
          origin: intent.origin,
        });
        const index = ledger.admit(record, fingerprint);
        pending = null;
        try {
          const placement = native.applyPlacement({
            identity: intent.identity,
            context: world,
            expectedPhysicsSerial: ports.physics.collisionStepSerial(),
            transform: candidate.transform,
            road: candidate.road,
          });
          record = Object.freeze({
            ...record,
            before: recoverySnapshot(placement.before),
            placement: Object.freeze({
              status: placement.inspection.status,
              physicsStepSerial: placement.inspection.physicsStepSerial,
              colliderCount: placement.inspection.colliderCount,
              after: placement.after ? recoverySnapshot(placement.after) : null,
              attempted: placement.attempted,
              completed: placement.completed,
              failure: placement.failure,
            }),
          });
          ledger.update(index, record);
          result = record;
          if (placement.inspection.status !== 'SAFE') {
            record = Object.freeze({ ...record, status: 'DENIED' });
            ledger.update(index, record);
            ledger.finish(index);
            result = record;
          } else if (placement.failure || placement.completed !== 5 || !placement.after) {
            fault = placement.failure ?? 'Incomplete native recovery';
            record = Object.freeze({ ...record, status: 'PARTIAL', failure: fault });
            ledger.update(index, record);
            result = record;
          } else {
            flight = { intent, index, record, event };
            deliver();
          }
        } catch (error) {
          fault = fail(error);
          record = Object.freeze({ ...record, status: 'PARTIAL', failure: fault });
          ledger.update(index, record);
          result = record;
        }
        return result;
      });
    },
    retryDelivery() {
      return mutate(() => {
        requireContract(flight !== null, 'Native partial fault cannot be replayed');
        deliver();
        return result;
      });
    },
    clearPending() {
      mutate(() => {
        pending = null;
        result = 'CANCELLED';
      });
    },
    readProjection() {
      const actual = ports.authority.getStats(),
        seat = actual.seat;
      const entry = seat ? entries.get(seat.identity.entityId) : undefined;
      const current =
        !!seat &&
        entry?.identity === seat.identity &&
        ports.physics.bodyIdentity(seat.identity.entityId) === seat.identity;
      return Object.freeze({
        identity: current ? seat!.identity : null,
        mode: current ? seat!.mode : null,
        available: current && entry!.candidate !== null,
        enabled:
          current &&
          !disposed &&
          !fault &&
          !flight &&
          !actual.disposed &&
          !actual.fault &&
          !actual.suspended,
        pointId: current ? (entry!.candidate?.pointId ?? null) : null,
        result,
        fault,
      });
    },
    readHistory: ledger.readHistory,
    getStats() {
      return Object.freeze({
        context: world,
        vehicles: entries.size,
        candidates: [...entries.values()].filter((e) => e.candidate).length,
        pending: pending ? 1 : 0,
        inFlight: flight ? 1 : 0,
        result,
        fault,
        disposed,
        ledger: ledger.getStats(),
      });
    },
    /** Caller must preserve/export protected history before disposing, same as029. */
    dispose() {
      if (disposed) return;
      mutate(() => {
        native.release();
        disposed = true;
        entries.clear();
        slots.fill(0);
        pending = null;
        flight = null;
        result = null;
        ledger.clear();
      });
    },
  });
}
