import { choice, fields, record, requireContract, text, tick } from '../sessions';
import { RIDE_DISPATCH_RELEASE_REASONS } from './dispatcher';
import type { DispatchRelease, RideDispatcher } from './dispatcher';
import type { RideDemand } from './ride-demand';
import { RIDE_FAILURE_REASONS } from './ride-fsm';
import type { RideEventResult, RideFailureReason, RideLifecycle } from './ride-fsm';
import type { RideEta } from './eta';
import type { FleetRegistry } from './registry';

export const FLEET_HEALTH_VERSION = '065-fleet-health-v1' as const;

/**
 * Availability of a taxi, driven by explicit external facts. `ASSIGNED` stays a dispatcher claim,
 * not a health state: a healthy taxi under an active claim is `AVAILABLE` here and `ASSIGNED` in 060.
 */
export const fleetHealthStates = ['AVAILABLE', 'BLOCKED', 'DAMAGED', 'OFFLINE'] as const;
export type FleetHealthState = (typeof fleetHealthStates)[number];

/**
 * Closed fact vocabulary. Damage 029 publishes collision/immobilization facts, recovery 030
 * publishes `RECOVERY`, and the composition publishes service withdrawal/return. The module never
 * infers damage from speed, collisions or renderer state.
 */
export const FLEET_HEALTH_FACTS = [
  'TRAFFIC_BLOCK',
  'IMMOBILIZATION',
  'COLLISION_DAMAGE',
  'RECOVERY',
  'SERVICE_WITHDRAWN',
  'SERVICE_RETURNED',
] as const;
export type FleetHealthFact = (typeof FLEET_HEALTH_FACTS)[number];

/** Explicit reset policies for cumulative statistics and per-vehicle profile references. */
export const FLEET_RESET_POLICIES = ['RESET', 'PRESERVE'] as const;
export type FleetResetPolicy = (typeof FLEET_RESET_POLICIES)[number];

interface HealthEffect {
  readonly state: FleetHealthState;
  /** Dispatcher release reason used when the taxi holds a claim but no active ride. */
  readonly release: (typeof RIDE_DISPATCH_RELEASE_REASONS)[number] | null;
  /** Ride terminal reason used when the claimed taxi still drives an active ride. */
  readonly failure: RideFailureReason | null;
}

/**
 * One fact has exactly one consequence. `IMMOBILIZATION` is a block, matching the 060 availability
 * table where an immobilized 029 vehicle is `BLOCKED`; damage is `DAMAGED`; withdrawal is `OFFLINE`.
 */
const HEALTH_EFFECTS: Readonly<Record<FleetHealthFact, HealthEffect>> = Object.freeze({
  TRAFFIC_BLOCK: Object.freeze({
    state: 'BLOCKED',
    release: 'TAXI_BLOCKED',
    failure: 'TAXI_BLOCKED',
  }),
  IMMOBILIZATION: Object.freeze({
    state: 'BLOCKED',
    release: 'TAXI_BLOCKED',
    failure: 'TAXI_BLOCKED',
  }),
  COLLISION_DAMAGE: Object.freeze({
    state: 'DAMAGED',
    release: 'TAXI_DAMAGED',
    failure: 'TAXI_DAMAGED',
  }),
  RECOVERY: Object.freeze({ state: 'AVAILABLE', release: null, failure: null }),
  SERVICE_WITHDRAWN: Object.freeze({
    state: 'OFFLINE',
    release: 'TAXI_REMOVED',
    failure: 'TAXI_REMOVED',
  }),
  SERVICE_RETURNED: Object.freeze({ state: 'AVAILABLE', release: null, failure: null }),
});

export const FLEET_HEALTH_LIMITS = Object.freeze({
  version: FLEET_HEALTH_VERSION,
  /** V1 fleet maximum; health never tracks civilians. */
  taxis: 30,
  /** Bounded fact audit trail retained for evidence and the fleet panel. */
  historyEntries: 256,
  /** Bounded fact-id memory used for idempotent replay. */
  factIds: 1024,
  /** Code units per taxi identity. */
  idCodeUnits: 256,
  /** Code units per caller fact identity (long enough for `health:<factId>` ride events). */
  factIdCodeUnits: 200,
});

export interface FleetHealthEntry {
  readonly taxiId: string;
  readonly state: FleetHealthState;
  /** The fact that produced the current state; `null` for the implicit initial `AVAILABLE`. */
  readonly cause: FleetHealthFact | null;
  readonly tick: number;
  readonly factId: string | null;
}

export interface FleetHealthHistoryEntry {
  readonly taxiId: string;
  readonly fact: FleetHealthFact;
  readonly from: FleetHealthState;
  readonly to: FleetHealthState;
  readonly tick: number;
  readonly factId: string;
  /** The ride closed by this fact, when the taxi was claimed and driving. */
  readonly releasedRideId: string | null;
}

export interface FleetHealthChange {
  readonly entry: FleetHealthEntry;
  /** `true` for an idempotent replay of the same `(taxiId, fact)` under the same `factId`. */
  readonly duplicate: boolean;
  /** Direct dispatcher release, when the taxi held a claim without an active ride. */
  readonly release: DispatchRelease | null;
  /** Lifecycle failure result, when the taxi held a claim with an active ride. */
  readonly ride: RideEventResult | null;
}

export interface FleetHealthReport {
  readonly version: typeof FLEET_HEALTH_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly taxis: number;
  readonly available: number;
  readonly blocked: number;
  readonly damaged: number;
  readonly offline: number;
  /** Active dispatcher claims; every claimed taxi must still be health-`AVAILABLE`. */
  readonly assigned: number;
  readonly byState: Readonly<Record<FleetHealthState, number>>;
  /** `true` when every dispatcher status matches the published health state. */
  readonly consistent: boolean;
  readonly disposed: boolean;
}

export interface FleetHealthStats extends Omit<FleetHealthReport, 'consistent'> {
  readonly facts: number;
  readonly blockFacts: number;
  readonly damageFacts: number;
  readonly offlineFacts: number;
  readonly recoveries: number;
  /** Rides closed because their claimed taxi became unavailable. */
  readonly closedRides: number;
  /** Claims released without an active ride because their taxi became unavailable. */
  readonly releasedClaims: number;
  readonly resets: number;
  readonly droppedFactIds: number;
}

export interface FleetResetRide {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly reason: 'SCENARIO_RESET';
}

export interface FleetResetDiscardedRide {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly reason: 'CLAIM_MISSING';
}

export interface FleetResetResult {
  readonly tick: number;
  readonly stats: FleetResetPolicy;
  readonly profiles: FleetResetPolicy;
  /** Rides closed through the real 061 lifecycle with `SCENARIO_RESET`. */
  readonly closedRides: readonly FleetResetRide[];
  /** Active rides whose claim had already disappeared; cleared and reported, never hidden. */
  readonly discardedRides: readonly FleetResetDiscardedRide[];
  /** Remaining dispatcher claims released with the closed `FAILED` vocabulary. */
  readonly releasedAssignments: readonly DispatchRelease[];
  /** Explicit health marks cleared by the reset. */
  readonly clearedHealth: number;
  /** Vehicles whose applied profile version was reset to the configured common version. */
  readonly resetProfiles: number;
}

export interface FleetHealthOptions {
  readonly dispatcher: unknown;
  readonly lifecycle: unknown;
  readonly demand: unknown;
  readonly eta: unknown;
  readonly registry: unknown;
}

export interface FleetHealth {
  readonly version: typeof FLEET_HEALTH_VERSION;
  readonly namespace: string;
  /** Current health of one real taxi; an unmarked taxi is implicitly `AVAILABLE`. */
  health(taxiId: string): FleetHealthEntry | undefined;
  /** Every real taxi in stable id order, including the implicit `AVAILABLE` entries. */
  list(): readonly FleetHealthEntry[];
  report(): FleetHealthReport;
  /** Applies one external damage/block/recovery fact and enforces dispatcher/lifecycle coherence. */
  apply(input: unknown): FleetHealthChange;
  /** Scenario boundary: closes rides, releases claims and rewinds rides, demand, ETA and health. */
  reset(input: unknown): FleetResetResult;
  history(): readonly FleetHealthHistoryEntry[];
  stats(): FleetHealthStats;
  dispose(): void;
}

const optionFields = ['dispatcher', 'lifecycle', 'demand', 'eta', 'registry'] as const;

const applyFields = ['taxiId', 'fact', 'factId', 'tick'] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function boundedId(value: unknown, maximum: number, label: string): string {
  const id = text(value);
  requireContract(
    id.length <= maximum && id.trim() === id,
    `Invalid ${label} identity or code-unit length`,
  );
  return id;
}

function zeroByState(): Record<FleetHealthState, number> {
  return { AVAILABLE: 0, BLOCKED: 0, DAMAGED: 0, OFFLINE: 0 };
}

function readPolicy(value: unknown, fallback: FleetResetPolicy): FleetResetPolicy {
  if (value === undefined) return fallback;
  return choice(value, FLEET_RESET_POLICIES);
}

function readDispatcher(value: unknown): RideDispatcher {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as RideDispatcher).namespace === 'string' &&
      typeof (value as RideDispatcher).assignmentFor === 'function' &&
      typeof (value as RideDispatcher).assignments === 'function' &&
      typeof (value as RideDispatcher).release === 'function' &&
      typeof (value as RideDispatcher).reset === 'function' &&
      typeof (value as RideDispatcher).setTaxiStatus === 'function' &&
      typeof (value as RideDispatcher).taxiStatus === 'function',
    'Fleet health requires a real dispatcher with a scenario reset port',
  );
  return value as RideDispatcher;
}

function readLifecycle(value: unknown): RideLifecycle {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as RideLifecycle).namespace === 'string' &&
      typeof (value as RideLifecycle).active === 'function' &&
      typeof (value as RideLifecycle).apply === 'function' &&
      typeof (value as RideLifecycle).currentTick === 'function' &&
      typeof (value as RideLifecycle).reset === 'function' &&
      typeof (value as RideLifecycle).rideFor === 'function',
    'Fleet health requires a real ride lifecycle with a scenario reset port',
  );
  return value as RideLifecycle;
}

function readDemand(value: unknown): RideDemand {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as RideDemand).reset === 'function' &&
      typeof (value as RideDemand).stats === 'function' &&
      typeof (value as RideDemand).plan === 'object' &&
      (value as RideDemand).plan !== null &&
      typeof (value as RideDemand).plan.namespace === 'string',
    'Fleet health requires a real ride demand with a scenario reset port',
  );
  return value as RideDemand;
}

function readEta(value: unknown): RideEta {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as RideEta).namespace === 'string' &&
      typeof (value as RideEta).reset === 'function' &&
      typeof (value as RideEta).stats === 'function',
    'Fleet health requires a real ride eta with a scenario reset port',
  );
  return value as RideEta;
}

function readRegistry(value: unknown): FleetRegistry {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as FleetRegistry).configuration === 'object' &&
      (value as FleetRegistry).configuration !== null &&
      typeof (value as FleetRegistry).configuration.profile?.versionId === 'string' &&
      typeof (value as FleetRegistry).get === 'function' &&
      typeof (value as FleetRegistry).list === 'function' &&
      typeof (value as FleetRegistry).state === 'function' &&
      typeof (value as FleetRegistry).updateState === 'function',
    'Fleet health requires a real fleet registry',
  );
  return value as FleetRegistry;
}

export function createFleetHealth(options: unknown): FleetHealth {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract(
      (optionFields as readonly string[]).includes(key),
      'Unknown fleet health option',
    );
  for (const key of optionFields)
    requireContract(data[key] !== undefined, `Fleet health requires ${key}`);
  const dispatcher = readDispatcher(data.dispatcher),
    lifecycle = readLifecycle(data.lifecycle),
    demand = readDemand(data.demand),
    eta = readEta(data.eta),
    registry = readRegistry(data.registry),
    namespace = text(dispatcher.namespace);
  requireContract(namespace.trim().length > 0, 'Invalid fleet health namespace');
  requireContract(lifecycle.namespace === namespace, 'Fleet health lifecycle namespace mismatch');
  requireContract(demand.plan.namespace === namespace, 'Fleet health demand namespace mismatch');
  requireContract(eta.namespace === namespace, 'Fleet health eta namespace mismatch');
  for (const effect of Object.values(HEALTH_EFFECTS)) {
    if (effect.release !== null)
      requireContract(
        (RIDE_DISPATCH_RELEASE_REASONS as readonly string[]).includes(effect.release),
        'Fleet health fact has no dispatcher release reason',
      );
    if (effect.failure !== null)
      requireContract(
        (RIDE_FAILURE_REASONS as readonly string[]).includes(effect.failure),
        'Fleet health fact has no ride failure reason',
      );
  }

  /** Explicit marks only; an absent entry is the implicit initial AVAILABLE state. */
  const marks = new Map<string, FleetHealthEntry>();
  const factRecords = new Map<
    string,
    { readonly taxiId: string; readonly fact: FleetHealthFact }
  >();
  const historyLog: FleetHealthHistoryEntry[] = [];
  let lastTick = 0,
    factsTotal = 0,
    blockFacts = 0,
    damageFacts = 0,
    offlineFacts = 0,
    recoveries = 0,
    closedRides = 0,
    releasedClaims = 0,
    resets = 0,
    droppedFactIds = 0,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Fleet health disposed');
  }

  function taxis(): readonly string[] {
    return registry
      .list()
      .filter((vehicle) => vehicle.driverKind === 'TAXI')
      .map((vehicle) => vehicle.vehicleId)
      .sort(compareText);
  }

  function requireTaxi(taxiId: unknown): string {
    const id = boundedId(taxiId, FLEET_HEALTH_LIMITS.idCodeUnits, 'fleet health taxi'),
      vehicle = registry.get(id);
    requireContract(vehicle !== undefined && vehicle.driverKind === 'TAXI', 'Unknown taxi');
    return id;
  }

  function stateOf(taxiId: string): FleetHealthState {
    return marks.get(taxiId)?.state ?? 'AVAILABLE';
  }

  function entryOf(taxiId: string): FleetHealthEntry {
    return (
      marks.get(taxiId) ??
      Object.freeze({
        taxiId,
        state: 'AVAILABLE' as const,
        cause: null,
        tick: 0,
        factId: null,
      })
    );
  }

  function list(): readonly FleetHealthEntry[] {
    if (disposed) return Object.freeze([]);
    return Object.freeze(taxis().map(entryOf));
  }

  function countStates(entries: readonly FleetHealthEntry[]): Record<FleetHealthState, number> {
    const counts = zeroByState();
    for (const entry of entries) counts[entry.state] += 1;
    return counts;
  }

  function report(): FleetHealthReport {
    if (disposed)
      return Object.freeze({
        version: FLEET_HEALTH_VERSION,
        namespace,
        tick: 0,
        taxis: 0,
        available: 0,
        blocked: 0,
        damaged: 0,
        offline: 0,
        assigned: 0,
        byState: Object.freeze(zeroByState()),
        consistent: true,
        disposed: true,
      });
    const entries = list(),
      counts = countStates(entries),
      taxiIds = taxis();
    let assigned = 0,
      consistent = true;
    for (const taxiId of taxiIds) {
      const status = dispatcher.taxiStatus(taxiId),
        health = stateOf(taxiId);
      if (status === undefined) {
        consistent = false;
        continue;
      }
      if (status === 'ASSIGNED') {
        assigned += 1;
        // A claim never hides an unavailable taxi behind ASSIGNED.
        if (health !== 'AVAILABLE') consistent = false;
      } else if (status !== health) consistent = false;
    }
    if (dispatcher.assignments().length !== assigned) consistent = false;
    return Object.freeze({
      version: FLEET_HEALTH_VERSION,
      namespace,
      tick: lastTick,
      taxis: taxiIds.length,
      available: counts.AVAILABLE,
      blocked: counts.BLOCKED,
      damaged: counts.DAMAGED,
      offline: counts.OFFLINE,
      assigned,
      byState: Object.freeze(counts),
      consistent,
      disposed: false,
    });
  }

  function recordFact(factId: string, taxiId: string, fact: FleetHealthFact): void {
    factRecords.set(factId, Object.freeze({ taxiId, fact }));
    while (factRecords.size > FLEET_HEALTH_LIMITS.factIds) {
      const oldest = factRecords.keys().next().value;
      if (oldest === undefined) break;
      factRecords.delete(oldest);
      droppedFactIds += 1;
    }
  }

  function apply(input: unknown): FleetHealthChange {
    assertLive();
    const event = fields(input, applyFields);
    for (const key of applyFields)
      requireContract(event[key] !== undefined, `Missing fleet health field: ${key}`);
    const taxiId = requireTaxi(event.taxiId),
      fact = choice(event.fact, FLEET_HEALTH_FACTS),
      factId = boundedId(event.factId, FLEET_HEALTH_LIMITS.factIdCodeUnits, 'fleet health fact'),
      atTick = tick(event.tick),
      previous = factRecords.get(factId);
    if (previous !== undefined) {
      requireContract(
        previous.taxiId === taxiId && previous.fact === fact,
        'Fleet health fact id conflict',
      );
      return Object.freeze({
        entry: entryOf(taxiId),
        duplicate: true,
        release: null,
        ride: null,
      });
    }
    if (atTick < lastTick) throw new RangeError('Stale fleet health tick');
    const before = stateOf(taxiId),
      effect = HEALTH_EFFECTS[fact],
      assignment = dispatcher.assignments().find((entry) => entry.taxiId === taxiId) ?? null;
    if (assignment !== null)
      requireContract(atTick >= assignment.tick, 'Stale fleet health tick for an active claim');
    let release: DispatchRelease | null = null,
      ride: RideEventResult | null = null;
    if (effect.state === 'AVAILABLE') {
      // A recovered taxi keeps its real claim; only an unclaimed taxi needs the status cleared.
      if (assignment === null) dispatcher.setTaxiStatus(taxiId, 'AVAILABLE', atTick);
    } else if (assignment === null) {
      dispatcher.setTaxiStatus(taxiId, effect.state, atTick);
    } else {
      const activeRide = lifecycle.rideFor(assignment.requestId);
      if (activeRide !== undefined && !activeRide.terminal) {
        requireContract(
          activeRide.taxiId === taxiId && activeRide.assignmentId === assignment.assignmentId,
          'Fleet health claim and ride disagree',
        );
        ride = lifecycle.apply({
          rideId: activeRide.rideId,
          eventId: `health:${factId}`,
          event: 'FAILED',
          reason: effect.failure,
          tick: atTick,
        });
        requireContract(
          ride.ride.terminal && ride.ride.reason === effect.failure,
          'Fleet health did not close the ride with its terminal reason',
        );
        closedRides += 1;
        // The lifecycle released the claim with FAILED, which returns AVAILABLE; publish the health.
        dispatcher.setTaxiStatus(taxiId, effect.state, atTick);
      } else {
        release = dispatcher.release(taxiId, effect.release, atTick);
        requireContract(release !== null, 'Fleet health release did not find the active claim');
        requireContract(
          dispatcher.taxiStatus(taxiId) === effect.state,
          'Fleet health release produced another taxi status',
        );
        releasedClaims += 1;
      }
    }
    const entry = Object.freeze({
        taxiId,
        state: effect.state,
        cause: effect.state === 'AVAILABLE' ? null : fact,
        tick: atTick,
        factId,
      }),
      logged = Object.freeze({
        taxiId,
        fact,
        from: before,
        to: effect.state,
        tick: atTick,
        factId,
        releasedRideId: ride === null ? null : ride.ride.rideId,
      });
    marks.set(taxiId, entry);
    recordFact(factId, taxiId, fact);
    historyLog.push(logged);
    if (historyLog.length > FLEET_HEALTH_LIMITS.historyEntries)
      historyLog.splice(0, historyLog.length - FLEET_HEALTH_LIMITS.historyEntries);
    lastTick = atTick;
    factsTotal += 1;
    if (fact === 'RECOVERY' || fact === 'SERVICE_RETURNED') recoveries += 1;
    else if (fact === 'COLLISION_DAMAGE') damageFacts += 1;
    else if (fact === 'SERVICE_WITHDRAWN') offlineFacts += 1;
    else blockFacts += 1;
    return Object.freeze({ entry, duplicate: false, release, ride });
  }

  function reset(input: unknown): FleetResetResult {
    assertLive();
    const event = record(input);
    for (const key of Object.keys(event))
      requireContract(
        key === 'tick' || key === 'stats' || key === 'profiles',
        'Unknown fleet reset field',
      );
    requireContract(event.tick !== undefined, 'Fleet health reset requires a tick');
    const atTick = tick(event.tick),
      statsPolicy = readPolicy(event.stats, 'RESET'),
      profilesPolicy = readPolicy(event.profiles, 'RESET');
    if (atTick < lastTick) throw new RangeError('Stale fleet health tick');
    requireContract(atTick >= lifecycle.currentTick(), 'Stale fleet reset tick');
    const vehicles = registry.list();
    // Validate every profile write before mutating anything, so a reset is all-or-nothing.
    if (profilesPolicy === 'RESET')
      for (const vehicle of vehicles) {
        const state = registry.state(vehicle.vehicleId);
        requireContract(state !== undefined, 'Fleet reset requires a known vehicle state');
        requireContract(atTick >= state.tick, 'Stale fleet reset tick for a vehicle state');
      }

    const closed: FleetResetRide[] = [],
      discarded: FleetResetDiscardedRide[] = [];
    for (const ride of lifecycle.active()) {
      const claim = dispatcher.assignmentFor(ride.requestId);
      if (
        claim === undefined ||
        claim.assignmentId !== ride.assignmentId ||
        claim.taxiId !== ride.taxiId
      ) {
        discarded.push(
          Object.freeze({
            rideId: ride.rideId,
            requestId: ride.requestId,
            taxiId: ride.taxiId,
            reason: 'CLAIM_MISSING' as const,
          }),
        );
        continue;
      }
      const result = lifecycle.apply({
        rideId: ride.rideId,
        eventId: 'scenario-reset',
        event: 'FAILED',
        reason: 'SCENARIO_RESET',
        tick: atTick,
      });
      requireContract(
        result.ride.terminal && result.ride.reason === 'SCENARIO_RESET',
        'Fleet reset did not close the ride',
      );
      closed.push(
        Object.freeze({
          rideId: ride.rideId,
          requestId: ride.requestId,
          taxiId: ride.taxiId,
          reason: 'SCENARIO_RESET' as const,
        }),
      );
    }
    const released: DispatchRelease[] = [];
    for (const assignment of dispatcher.assignments()) {
      const entry = dispatcher.release(assignment.taxiId, 'FAILED', atTick);
      requireContract(entry !== null, 'Fleet reset did not release a dispatcher claim');
      released.push(entry);
    }
    const clearedHealth = marks.size,
      lifecycleReset = lifecycle.reset({
        tick: atTick,
        preserveStats: statsPolicy === 'PRESERVE',
      });
    requireContract(
      lifecycleReset.discardedActive === discarded.length,
      'Fleet reset discarded ride count diverged',
    );
    dispatcher.reset({ tick: atTick, preserveStats: statsPolicy === 'PRESERVE' });
    demand.reset({ preserveStats: statsPolicy === 'PRESERVE' });
    eta.reset({ preserveStats: statsPolicy === 'PRESERVE' });
    let resetProfiles = 0;
    if (profilesPolicy === 'RESET') {
      const versionId = registry.configuration.profile.versionId;
      for (const vehicle of vehicles) {
        registry.updateState(vehicle.vehicleId, { tick: atTick, appliedProfileVersion: versionId });
        resetProfiles += 1;
      }
    }
    marks.clear();
    factRecords.clear();
    historyLog.length = 0;
    lastTick = atTick;
    resets += 1;
    if (statsPolicy === 'RESET') {
      factsTotal = 0;
      blockFacts = 0;
      damageFacts = 0;
      offlineFacts = 0;
      recoveries = 0;
      closedRides = 0;
      releasedClaims = 0;
      droppedFactIds = 0;
    }
    return Object.freeze({
      tick: atTick,
      stats: statsPolicy,
      profiles: profilesPolicy,
      closedRides: Object.freeze(closed),
      discardedRides: Object.freeze(discarded),
      releasedAssignments: Object.freeze(released),
      clearedHealth,
      resetProfiles,
    });
  }

  function stats(): FleetHealthStats {
    const current = report();
    if (disposed)
      return Object.freeze({
        ...current,
        facts: 0,
        blockFacts: 0,
        damageFacts: 0,
        offlineFacts: 0,
        recoveries: 0,
        closedRides: 0,
        releasedClaims: 0,
        resets: 0,
        droppedFactIds: 0,
      });
    return Object.freeze({
      ...current,
      facts: factsTotal,
      blockFacts,
      damageFacts,
      offlineFacts,
      recoveries,
      closedRides,
      releasedClaims,
      resets,
      droppedFactIds,
    });
  }

  return Object.freeze({
    version: FLEET_HEALTH_VERSION,
    namespace,
    health(taxiId: string): FleetHealthEntry | undefined {
      if (disposed) return undefined;
      const id = text(taxiId),
        vehicle = registry.get(id);
      if (vehicle === undefined || vehicle.driverKind !== 'TAXI') return undefined;
      return entryOf(id);
    },
    list,
    report,
    apply,
    reset,
    history(): readonly FleetHealthHistoryEntry[] {
      return disposed ? Object.freeze([]) : Object.freeze(historyLog.slice());
    },
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      marks.clear();
      factRecords.clear();
      historyLog.length = 0;
      lastTick = 0;
      factsTotal = 0;
      blockFacts = 0;
      damageFacts = 0;
      offlineFacts = 0;
      recoveries = 0;
      closedRides = 0;
      releasedClaims = 0;
      resets = 0;
      droppedFactIds = 0;
    },
  });
}

export const FLEET_HEALTH_ENTRY_FIELDS = Object.freeze([
  'taxiId',
  'state',
  'cause',
  'tick',
  'factId',
] as const);

export const FLEET_HEALTH_HISTORY_FIELDS = Object.freeze([
  'taxiId',
  'fact',
  'from',
  'to',
  'tick',
  'factId',
  'releasedRideId',
] as const);
