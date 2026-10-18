import {
  contextFields,
  createStableId,
  fields,
  list,
  MAX_IDENTITY_PART_LENGTH,
  number,
  readContext,
  record,
  requireContract,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import { COLLISION_LIMITS } from './collision-port';
import type {
  CollisionContact,
  CollisionIdentity,
  CollisionIdentitySource,
} from './collision-port';

export interface CollisionIncident extends ContractContext {
  readonly incidentId: string;
  readonly tick: number;
  readonly vehicleId: string;
  readonly otherEntityId: string;
  readonly impulseNs: number;
  readonly first: CollisionIdentity;
  readonly second: CollisionIdentity;
}
interface Episode {
  readonly first: CollisionIdentity;
  readonly second: CollisionIdentity;
  readonly active: boolean;
  readonly lastIncidentTick: number | null;
}
export interface CollisionEpisodeOptions {
  readonly cooldownTicks?: number;
  readonly maxPairs?: number;
  readonly maxPending?: number;
}

/** Complete fixed-tick snapshots; pure records, no EventBus or simulation dependency. */
export function createCollisionEpisodes(
  initialContext: ContractContext,
  initialRegistry: CollisionIdentitySource,
  options: CollisionEpisodeOptions = {},
) {
  requireContract(
    initialRegistry !== null && typeof initialRegistry?.isCurrent === 'function',
    'Expected collision identity source',
  );
  let context = Object.freeze(readContext(fields(initialContext, contextFields)));
  requireContract(
    context.sessionId.length <= MAX_IDENTITY_PART_LENGTH,
    'Collision session identity capacity',
  );
  let registry = initialRegistry;
  const data = record(options);
  requireContract(
    Object.keys(data).every((key) => ['cooldownTicks', 'maxPairs', 'maxPending'].includes(key)),
    'Invalid collision options',
  );
  const cooldownTicks = tick(Object.hasOwn(data, 'cooldownTicks') ? data.cooldownTicks : 60);
  const maxPairs = tick(Object.hasOwn(data, 'maxPairs') ? data.maxPairs : COLLISION_LIMITS.pairs);
  const maxPending = tick(
    Object.hasOwn(data, 'maxPending') ? data.maxPending : COLLISION_LIMITS.pending,
  );
  requireContract(
    maxPairs > 0 &&
      maxPairs <= COLLISION_LIMITS.pairs &&
      maxPending > 0 &&
      maxPending <= COLLISION_LIMITS.pending,
    'Collision episode capacity',
  );
  let episodes = new Map<string, Episode>();
  let pending: CollisionIncident[] = [];
  let lastTick = -1,
    fingerprint = '',
    busy = false,
    disposed = false;
  const idle = () => {
    requireContract(!disposed && !busy, 'Collision episodes disposed or busy');
  };
  const current = (entry: Episode) =>
    registry.isCurrent(entry.first) && registry.isCurrent(entry.second);
  const prune = () => {
    for (const [key, entry] of episodes) if (!current(entry)) episodes.delete(key);
  };
  return Object.freeze({
    update(nextTick: number, contacts: readonly CollisionContact[]): number {
      idle();
      busy = true;
      try {
        const at = tick(nextTick);
        requireContract(at >= lastTick, 'Collision tick cannot decrease');
        requireContract(
          lastTick < 0 || at === lastTick || at === lastTick + 1,
          'Collision snapshots must cover consecutive ticks',
        );
        requireContract(
          at === lastTick || pending.length === 0,
          'Drain pending collisions before a newer tick',
        );
        requireContract(
          Array.isArray(contacts) && contacts.length <= COLLISION_LIMITS.contacts,
          'Collision contact capacity',
        );
        const pairs = new Map<string, CollisionContact>();
        list(contacts, (value) => {
          const contact = fields(value, ['first', 'second', 'impulseNs']);
          const first = contact.first as CollisionIdentity,
            second = contact.second as CollisionIdentity;
          requireContract(
            registry.isCurrent(first) && registry.isCurrent(second),
            'Stale collision registration',
          );
          requireContract(
            first !== second && first.entityId !== second.entityId,
            'Collision pair must be distinct',
          );
          const impulseNs = number(contact.impulseNs, 0);
          if (first.kind === 'OBSTACLE' && second.kind === 'OBSTACLE') return null;
          const a = first.serial < second.serial ? first : second,
            b = a === first ? second : first;
          const key = `${a.serial}:${b.serial}`;
          const previous = pairs.get(key);
          const sum = number((previous?.impulseNs ?? 0) + impulseNs, 0);
          if (!previous) requireContract(pairs.size < maxPairs, 'Collision pair capacity');
          pairs.set(key, Object.freeze({ first: a, second: b, impulseNs: sum }));
          return null;
        });
        const orderedPairs = [...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        const signature = JSON.stringify(
          orderedPairs.map(([key, value]) => [key, value.impulseNs]),
        );
        if (at === lastTick) {
          requireContract(signature === fingerprint, 'Conflicting same-tick collision snapshot');
          return 0;
        }
        const next = new Map<string, Episode>();
        for (const [key, old] of episodes) {
          if (
            current(old) &&
            (pairs.has(key) ||
              old.lastIncidentTick === null ||
              at - old.lastIncidentTick < cooldownTicks)
          )
            next.set(key, { ...old, active: false });
        }
        const emitted: CollisionIncident[] = [];
        for (const [key, contact] of orderedPairs) {
          requireContract(
            current({ ...contact, active: false, lastIncidentTick: null }),
            'Registration changed during collision preparation',
          );
          const old = episodes.get(key);
          let onset = old?.lastIncidentTick ?? null;
          if (!old?.active && (onset === null || at - onset >= cooldownTicks)) {
            requireContract(emitted.length < maxPending, 'Collision pending capacity');
            const firstVehicle = contact.first.kind === 'VEHICLE';
            const vehicle =
              firstVehicle &&
              (contact.second.kind !== 'VEHICLE' ||
                contact.first.entityId < contact.second.entityId)
                ? contact.first
                : contact.second;
            const other = vehicle === contact.first ? contact.second : contact.first;
            emitted.push(
              Object.freeze({
                ...context,
                incidentId: createStableId('collision', context.sessionId, [
                  '028',
                  String(context.worldEpoch),
                  key,
                  String(at),
                ]),
                tick: at,
                vehicleId: vehicle.entityId,
                otherEntityId: other.entityId,
                impulseNs: contact.impulseNs,
                first: contact.first,
                second: contact.second,
              }),
            );
            onset = at;
          }
          if (!next.has(key))
            requireContract(next.size < maxPairs, 'Collision tracked pair capacity');
          next.set(
            key,
            Object.freeze({
              first: contact.first,
              second: contact.second,
              active: true,
              lastIncidentTick: onset,
            }),
          );
        }
        episodes = next;
        pending = emitted;
        lastTick = at;
        fingerprint = signature;
        return emitted.length;
      } finally {
        busy = false;
      }
    },
    /** Synchronous accepted-prefix drain. Throwing publisher keeps the failed suffix for retry. */
    drain(publish: (incident: CollisionIncident) => undefined) {
      idle();
      requireContract(typeof publish === 'function', 'Expected synchronous collision publisher');
      busy = true;
      let consumed = 0,
        accepted = 0,
        discarded = 0;
      let blocked: unknown = null;
      let status: 'drained' | 'blocked' = 'drained';
      try {
        for (const incident of pending) {
          if (!registry.isCurrent(incident.first) || !registry.isCurrent(incident.second)) {
            consumed++;
            discarded++;
            continue;
          }
          try {
            const result: unknown = publish(incident);
            requireContract(
              result === undefined,
              'Collision publisher must return undefined synchronously',
            );
          } catch (error: unknown) {
            status = 'blocked';
            blocked = error;
            break;
          }
          consumed++;
          accepted++;
        }
      } finally {
        pending = pending.slice(consumed);
        try {
          prune();
        } finally {
          busy = false;
        }
      }
      return Object.freeze({ status, accepted, discarded, pending: pending.length, blocked });
    },
    getStats() {
      return Object.freeze({
        trackedPairs: episodes.size,
        activePairs: [...episodes.values()].filter((entry) => entry.active).length,
        pending: pending.length,
        lastTick,
        worldEpoch: context.worldEpoch,
        disposed,
      });
    },
    reset(nextContext: ContractContext, nextRegistry: CollisionIdentitySource): void {
      idle();
      busy = true;
      try {
        const parsed = readContext(fields(nextContext, contextFields));
        requireContract(
          parsed.sessionId.length <= MAX_IDENTITY_PART_LENGTH,
          'Collision session identity capacity',
        );
        requireContract(
          nextRegistry !== null && typeof nextRegistry?.isCurrent === 'function',
          'Expected collision identity source',
        );
        requireContract(
          parsed.sessionId === context.sessionId && parsed.worldEpoch > context.worldEpoch,
          'Collision epoch must increase within session',
        );
        context = Object.freeze(parsed);
        registry = nextRegistry;
        episodes.clear();
        pending = [];
        lastTick = -1;
        fingerprint = '';
      } finally {
        busy = false;
      }
    },
    dispose(): void {
      if (disposed) return;
      idle();
      disposed = true;
      episodes.clear();
      pending = [];
      fingerprint = '';
    },
  });
}
