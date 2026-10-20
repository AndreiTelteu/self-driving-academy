import { choice, createStableId, number, record, requireContract, text, tick } from '../sessions';
import { parseRoadMap } from '../world';
import type { RoadMap, RoutePlanner, RouteStatus } from '../world';
import { RIDE_DEMAND_LIMITS } from './ride-demand';
import type { RideDemand, RideRequest } from './ride-demand';
import type { FleetRegistry } from './registry';

export const RIDE_DISPATCHER_VERSION = '060-ride-dispatcher-v1' as const;

/**
 * Fixed budgets. One `step` never inspects more than `taxiCandidates` taxis, never assigns more
 * than `assignmentsPerStep` requests and never runs more than `routeSearchesPerStep` real 041
 * searches. The candidate scan is all-or-nothing: a step that cannot afford the complete candidate
 * scan assigns nothing, so the chosen taxi never depends on where the search budget ran out.
 */
export const RIDE_DISPATCH_LIMITS = Object.freeze({
  version: RIDE_DISPATCHER_VERSION,
  /** Bounded requests assigned by one step. */
  assignmentsPerStep: 4,
  /** Hard ceiling for the caller's per-call assignment override. */
  maximumAssignmentsPerStep: 16,
  /** Bounded taxi candidates inspected for one request (V1 fleet maximum). */
  taxiCandidates: 30,
  /** Bounded real 041 searches performed by one step. */
  routeSearchesPerStep: 128,
  /** Hard ceiling for the configured per-step search budget. */
  maximumRouteSearchesPerStep: 256,
  /** Bounded release audit log retained for evidence and UI. */
  releaseHistory: 128,
  /** Bounded rejection log retained for evidence and UI. */
  rejectionHistory: 128,
});

/** A taxi claim is owned by the dispatcher; callers never set it directly. */
export const dispatchTaxiStatuses = [
  'AVAILABLE',
  'ASSIGNED',
  'BLOCKED',
  'DAMAGED',
  'OFFLINE',
] as const;
export type DispatchTaxiStatus = (typeof dispatchTaxiStatuses)[number];

/** Statuses a caller may publish. `ASSIGNED` exists only while a claim is active. */
export const settleableTaxiStatuses = ['AVAILABLE', 'BLOCKED', 'DAMAGED', 'OFFLINE'] as const;
export type SettleableTaxiStatus = (typeof settleableTaxiStatuses)[number];

/**
 * Closed rejection vocabulary. `TRIP_UNREACHABLE` removes the request from the 059 queue because
 * the replanned pickup->dropoff route is permanently impossible; the other reasons are transient
 * and keep the request pending at the head of the queue.
 */
export const RIDE_DISPATCH_REJECTION_REASONS = [
  'NO_TAXI',
  'NO_POSITION',
  'PICKUP_UNREACHABLE',
  'TRIP_UNREACHABLE',
  'ROUTE_BUDGET_EXHAUSTED',
] as const;
export type RideDispatchRejectionReason = (typeof RIDE_DISPATCH_REJECTION_REASONS)[number];

/** Explicit release vocabulary; each reason maps to a documented next taxi status. */
export const RIDE_DISPATCH_RELEASE_REASONS = [
  'COMPLETED',
  'CANCELLED',
  'FAILED',
  'TAXI_BLOCKED',
  'TAXI_DAMAGED',
  'TAXI_REMOVED',
] as const;
export type RideDispatchReleaseReason = (typeof RIDE_DISPATCH_RELEASE_REASONS)[number];

/** Real lane/zone position of a taxi, owned by the world composition (058/024), never by 060. */
export interface TaxiPositionSource {
  laneFor(taxiId: string): string | null;
}

export interface DispatchAssignment {
  readonly assignmentId: string;
  readonly requestId: string;
  readonly taxiId: string;
  /** Authoritative tick of the assignment; there is no wall clock anywhere in the module. */
  readonly tick: number;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  /** Real 041 cost of taxi->pickup at assignment time; this is the dispatch cost. */
  readonly pickupCostSeconds: number;
  /** Real 041 cost of pickup->dropoff replanned at assignment time (never the 059 snapshot). */
  readonly tripCostSeconds: number;
  readonly totalCostSeconds: number;
  readonly pickupRouteLaneIds: readonly string[];
  readonly tripRouteLaneIds: readonly string[];
  readonly graphVersion: string;
  readonly costVersion: string;
}

export interface DispatchRejection {
  readonly requestId: string;
  readonly tick: number;
  readonly reason: RideDispatchRejectionReason;
  /** Raw 041 status when the request was permanently rejected, otherwise null. */
  readonly routeStatus: RouteStatus | null;
}

export interface DispatchRelease {
  readonly assignment: DispatchAssignment;
  readonly reason: RideDispatchReleaseReason;
  readonly tick: number;
}

export interface DispatchStep {
  readonly tick: number;
  readonly assigned: readonly DispatchAssignment[];
  /** Requests removed from the 059 queue because the replanned trip is impossible. */
  readonly rejected: readonly DispatchRejection[];
  /** Transient block of the queue head; the request stays pending and is retried next step. */
  readonly blocked: DispatchRejection | null;
  readonly availableCount: number;
  readonly plannerSearches: number;
  readonly budgetExhausted: boolean;
}

export interface RideDispatcherStats {
  readonly version: typeof RIDE_DISPATCHER_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly taxis: number;
  readonly available: number;
  readonly assigned: number;
  readonly pending: number;
  readonly assignments: number;
  readonly releases: number;
  readonly rejections: number;
  readonly routeSearches: number;
  readonly lastStepSearches: number;
  readonly blockedTaxis: number;
  readonly damagedTaxis: number;
  readonly offlineTaxis: number;
  readonly droppedReleaseHistory: number;
  readonly graphVersion: string;
  readonly costVersion: string;
  readonly disposed: boolean;
}

export interface RideDispatcherOptions {
  readonly registry: unknown;
  readonly demand: unknown;
  readonly planner: unknown;
  readonly map: unknown;
  readonly positions: unknown;
  readonly maxAssignmentsPerStep?: number;
  readonly maxTaxiCandidates?: number;
  readonly maxRouteSearchesPerStep?: number;
}

export interface DispatcherStepInput {
  readonly tick: number;
  /** Bounded override, never above RIDE_DISPATCH_LIMITS.maximumAssignmentsPerStep. */
  readonly maxAssignments?: number;
}

export interface RideDispatcher {
  readonly namespace: string;
  readonly graphVersion: string;
  readonly costVersion: string;
  step(input: unknown): DispatchStep;
  assignments(): readonly DispatchAssignment[];
  assignmentFor(requestId: string): DispatchAssignment | undefined;
  availableTaxis(): readonly string[];
  taxiStatus(taxiId: string): DispatchTaxiStatus | undefined;
  setTaxiStatus(taxiId: string, status: unknown, atTick: unknown): SettleableTaxiStatus;
  release(taxiId: string, reason: unknown, atTick: unknown): DispatchRelease | null;
  rejections(): readonly DispatchRejection[];
  releases(): readonly DispatchRelease[];
  stats(): RideDispatcherStats;
  /**
   * Scenario boundary (065): the caller has already released every claim, so this only clears
   * caller statuses, the dispatched-request memory and the bounded logs. The tick stays monotonic.
   */
  reset(input: unknown): void;
  dispose(): void;
}

const optionFields = [
  'registry',
  'demand',
  'planner',
  'map',
  'positions',
  'maxAssignmentsPerStep',
  'maxTaxiCandidates',
  'maxRouteSearchesPerStep',
] as const;

const stepFields = ['tick', 'maxAssignments'] as const;

const releaseStatus: Readonly<Record<RideDispatchReleaseReason, SettleableTaxiStatus>> =
  Object.freeze({
    COMPLETED: 'AVAILABLE',
    CANCELLED: 'AVAILABLE',
    FAILED: 'AVAILABLE',
    TAXI_BLOCKED: 'BLOCKED',
    TAXI_DAMAGED: 'DAMAGED',
    TAXI_REMOVED: 'OFFLINE',
  });

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function boundedCount(value: unknown, minimum: number, maximum: number, label: string): number {
  const count = number(value, minimum, maximum);
  requireContract(Number.isSafeInteger(count), `${label} must be an integer`);
  return count;
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function readPlanner(value: unknown): RoutePlanner {
  const planner = value as RoutePlanner;
  requireContract(
    typeof planner === 'object' &&
      planner !== null &&
      typeof planner.findRoute === 'function' &&
      typeof planner.resolveDestination === 'function' &&
      typeof planner.getStats === 'function' &&
      typeof planner.graphVersion === 'string' &&
      typeof planner.costVersion === 'string',
    'Invalid dispatcher route planner',
  );
  requireContract(planner.graphVersion.trim().length > 0, 'Invalid dispatcher graph version');
  requireContract(planner.costVersion.trim().length > 0, 'Invalid dispatcher cost version');
  return planner;
}

function readRegistry(value: unknown): FleetRegistry {
  const registry = value as FleetRegistry;
  requireContract(
    typeof registry === 'object' &&
      registry !== null &&
      typeof registry.list === 'function' &&
      typeof registry.get === 'function' &&
      typeof registry.state === 'function',
    'Invalid dispatcher fleet registry',
  );
  return registry;
}

function readDemand(value: unknown): RideDemand {
  const demand = value as RideDemand;
  requireContract(
    typeof demand === 'object' &&
      demand !== null &&
      typeof demand.pending === 'function' &&
      typeof demand.dequeue === 'function' &&
      typeof demand.stats === 'function' &&
      typeof demand.plan === 'object' &&
      demand.plan !== null &&
      typeof demand.plan.namespace === 'string' &&
      Array.isArray(demand.plan.windows),
    'Invalid dispatcher ride demand',
  );
  return demand;
}

function readPositions(value: unknown): TaxiPositionSource {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as TaxiPositionSource).laneFor === 'function',
    'Dispatcher positions must expose laneFor(taxiId)',
  );
  const source = value as TaxiPositionSource,
    receiver = value;
  return Object.freeze({
    laneFor: (taxiId: string): string | null => source.laneFor.call(receiver, taxiId),
  });
}

function readOptions(value: unknown): {
  registry: FleetRegistry;
  demand: RideDemand;
  planner: RoutePlanner;
  map: RoadMap;
  positions: TaxiPositionSource;
  assignmentsPerStep: number;
  taxiCandidates: number;
  routeSearchesPerStep: number;
} {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (optionFields as readonly string[]).includes(key),
      'Unknown ride dispatcher option',
    );
  requireContract(data.registry !== undefined, 'Ride dispatcher requires a fleet registry');
  requireContract(data.demand !== undefined, 'Ride dispatcher requires a ride demand queue');
  requireContract(data.planner !== undefined, 'Ride dispatcher requires a route planner');
  requireContract(data.map !== undefined, 'Ride dispatcher requires a road map');
  requireContract(data.positions !== undefined, 'Ride dispatcher requires taxi positions');
  const registry = readRegistry(data.registry),
    demand = readDemand(data.demand),
    planner = readPlanner(data.planner),
    map = parseRoadMap(data.map),
    positions = readPositions(data.positions);
  requireContract(demand.plan.mapId === map.mapId, 'Ride dispatcher demand/map id mismatch');
  const assignmentsPerStep =
    data.maxAssignmentsPerStep === undefined
      ? RIDE_DISPATCH_LIMITS.assignmentsPerStep
      : boundedCount(
          data.maxAssignmentsPerStep,
          1,
          RIDE_DISPATCH_LIMITS.maximumAssignmentsPerStep,
          'Ride dispatcher assignments per step',
        );
  const taxiCandidates =
    data.maxTaxiCandidates === undefined
      ? RIDE_DISPATCH_LIMITS.taxiCandidates
      : boundedCount(
          data.maxTaxiCandidates,
          1,
          RIDE_DISPATCH_LIMITS.taxiCandidates,
          'Ride dispatcher taxi candidates',
        );
  const routeSearchesPerStep =
    data.maxRouteSearchesPerStep === undefined
      ? RIDE_DISPATCH_LIMITS.routeSearchesPerStep
      : boundedCount(
          data.maxRouteSearchesPerStep,
          1,
          RIDE_DISPATCH_LIMITS.maximumRouteSearchesPerStep,
          'Ride dispatcher route searches per step',
        );
  return {
    registry,
    demand,
    planner,
    map,
    positions,
    assignmentsPerStep,
    taxiCandidates,
    routeSearchesPerStep,
  };
}

function freezeAssignment(
  namespace: string,
  request: RideRequest,
  taxiId: string,
  atTick: number,
  pickup: { readonly costSeconds: number; readonly path: readonly string[] },
  trip: { readonly costSeconds: number; readonly path: readonly string[] },
  graphVersion: string,
  costVersion: string,
): DispatchAssignment {
  return frozenRecord({
    assignmentId: createStableId('dispatch-assignment', namespace, [request.requestId, taxiId]),
    requestId: request.requestId,
    taxiId,
    tick: atTick,
    pickupZoneId: request.originZoneId,
    dropoffZoneId: request.destinationZoneId,
    pickupCostSeconds: pickup.costSeconds,
    tripCostSeconds: trip.costSeconds,
    totalCostSeconds: pickup.costSeconds + trip.costSeconds,
    pickupRouteLaneIds: pickup.path,
    tripRouteLaneIds: trip.path,
    graphVersion,
    costVersion,
  });
}

function freezeRejection(
  requestId: string,
  atTick: number,
  reason: RideDispatchRejectionReason,
  routeStatus: RouteStatus | null,
): DispatchRejection {
  return frozenRecord({ requestId, tick: atTick, reason, routeStatus });
}

function pushBounded<T>(log: T[], entry: T, limit: number): boolean {
  log.push(entry);
  if (log.length <= limit) return false;
  log.splice(0, log.length - limit);
  return true;
}

export function createRideDispatcher(options: unknown): RideDispatcher {
  const read = readOptions(options),
    { registry, demand, planner, positions } = read;
  const namespace = text(demand.plan.namespace),
    graphVersion = text(planner.graphVersion),
    costVersion = text(planner.costVersion);

  /** Explicit caller statuses; a missing entry means AVAILABLE. */
  const statuses = new Map<string, SettleableTaxiStatus>();
  /** Active claims: taxi id -> assignment. One taxi holds at most one request. */
  const active = new Map<string, DispatchAssignment>();
  /** Active claims by request, so a request can never hold two taxis. */
  const byRequest = new Map<string, DispatchAssignment>();
  /** Every request ever dequeued by the dispatcher; bounded by the 059 plan capacity. */
  const dispatched = new Set<string>();
  const releaseLog: DispatchRelease[] = [];
  const rejectionLog: DispatchRejection[] = [];
  let lastTick = 0,
    assignmentsTotal = 0,
    releasesTotal = 0,
    rejectionsTotal = 0,
    routeSearchesTotal = 0,
    lastStepSearches = 0,
    droppedReleaseHistory = 0,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Ride dispatcher disposed');
  }

  function taxis(): readonly string[] {
    return registry
      .list()
      .filter((vehicle) => vehicle.driverKind === 'TAXI')
      .map((vehicle) => vehicle.vehicleId)
      .sort(compareText);
  }

  function requireTaxi(taxiId: unknown): string {
    const id = text(taxiId),
      vehicle = registry.get(id);
    requireContract(vehicle !== undefined && vehicle.driverKind === 'TAXI', 'Unknown taxi');
    return id;
  }

  function statusOf(taxiId: string): DispatchTaxiStatus {
    if (active.has(taxiId)) return 'ASSIGNED';
    return statuses.get(taxiId) ?? 'AVAILABLE';
  }

  function snapshotAssignments(): readonly DispatchAssignment[] {
    return Object.freeze(
      [...active.values()].sort(
        (left, right) =>
          compareText(left.taxiId, right.taxiId) || compareText(left.requestId, right.requestId),
      ),
    );
  }

  function step(input: unknown): DispatchStep {
    assertLive();
    const data = record(input);
    for (const key of Object.keys(data))
      requireContract(
        (stepFields as readonly string[]).includes(key),
        'Unknown dispatch step field',
      );
    const atTick = tick(data.tick);
    if (atTick < lastTick) throw new RangeError('Stale dispatcher tick');
    const requestLimit =
      data.maxAssignments === undefined
        ? read.assignmentsPerStep
        : boundedCount(
            data.maxAssignments,
            1,
            RIDE_DISPATCH_LIMITS.maximumAssignmentsPerStep,
            'Ride dispatcher step assignments',
          );
    // A claim whose taxi disappeared from the registry is a composition bug, never silently freed.
    for (const [taxiId] of active) {
      const vehicle = registry.get(taxiId);
      requireContract(
        vehicle !== undefined && vehicle.driverKind === 'TAXI',
        'Assigned taxi is missing from the fleet registry',
      );
    }
    const taxiIds = taxis();
    let available = taxiIds.filter((taxiId) => statusOf(taxiId) === 'AVAILABLE');
    const assigned: DispatchAssignment[] = [];
    const rejected: DispatchRejection[] = [];
    let blocked: DispatchRejection | null = null,
      searches = 0,
      budgetExhausted = false;
    lastTick = atTick;

    while (assigned.length < requestLimit) {
      const pending = demand.pending();
      if (pending.length === 0) break;
      const head = pending[0]!;
      requireContract(!byRequest.has(head.requestId), 'Ride request is already assigned to a taxi');
      requireContract(!dispatched.has(head.requestId), 'Ride request was already dispatched');
      if (available.length === 0) {
        blocked = freezeRejection(head.requestId, atTick, 'NO_TAXI', null);
        break;
      }
      const candidates = available.slice(0, read.taxiCandidates);
      // All-or-nothing candidate scan keeps the minimum-cost choice independent of the budget edge.
      if (searches + 1 + candidates.length > read.routeSearchesPerStep) {
        blocked = freezeRejection(head.requestId, atTick, 'ROUTE_BUDGET_EXHAUSTED', null);
        budgetExhausted = true;
        break;
      }
      const positioned: { readonly taxiId: string; readonly laneId: string }[] = [];
      for (const taxiId of candidates) {
        const laneId = positions.laneFor(taxiId);
        if (laneId === null) continue;
        requireContract(
          typeof laneId === 'string' &&
            laneId.trim().length > 0 &&
            laneId.length <= RIDE_DEMAND_LIMITS.idCodeUnits &&
            laneId.trim() === laneId,
          'Invalid taxi lane position',
        );
        positioned.push(Object.freeze({ taxiId, laneId }));
      }
      if (positioned.length === 0) {
        blocked = freezeRejection(head.requestId, atTick, 'NO_POSITION', null);
        break;
      }
      // The trip leg is taxi-independent, so it is replanned once per request and decides whether
      // the request is still possible at all. The 059 validation snapshot is never consulted.
      const trip = planner.findRoute({
        origin: head.originZoneId,
        destination: head.destinationZoneId,
        access: 'TAXI',
      });
      searches += 1;
      if (trip.status !== 'READY' || trip.path === null) {
        const removed = demand.dequeue();
        requireContract(
          removed !== undefined && removed.requestId === head.requestId,
          'Ride demand queue diverged',
        );
        const rejection = freezeRejection(head.requestId, atTick, 'TRIP_UNREACHABLE', trip.status);
        rejected.push(rejection);
        pushBounded(rejectionLog, rejection, RIDE_DISPATCH_LIMITS.rejectionHistory);
        rejectionsTotal += 1;
        continue;
      }
      let best: {
        readonly taxiId: string;
        readonly laneId: string;
        readonly costSeconds: number;
        readonly path: readonly string[];
      } | null = null;
      for (const candidate of positioned) {
        const pickup = planner.findRoute({
          origin: candidate.laneId,
          destination: head.originZoneId,
          access: 'TAXI',
        });
        searches += 1;
        if (pickup.status !== 'READY' || pickup.path === null) continue;
        const cost = pickup.costSeconds;
        if (!Number.isFinite(cost) || cost < 0) continue;
        // Deterministic tie-break: strictly lower cost, then the stable taxi id.
        if (
          best === null ||
          cost < best.costSeconds ||
          (cost === best.costSeconds && compareText(candidate.taxiId, best.taxiId) < 0)
        )
          best = {
            taxiId: candidate.taxiId,
            laneId: candidate.laneId,
            costSeconds: cost,
            path: pickup.path,
          };
      }
      if (best === null) {
        blocked = freezeRejection(head.requestId, atTick, 'PICKUP_UNREACHABLE', null);
        break;
      }
      // Remove the request first and verify the FIFO head; then claim exactly one available taxi.
      const removed = demand.dequeue();
      requireContract(
        removed !== undefined && removed.requestId === head.requestId,
        'Ride demand queue diverged',
      );
      const assignment = freezeAssignment(
        namespace,
        head,
        best.taxiId,
        atTick,
        { costSeconds: best.costSeconds, path: best.path },
        { costSeconds: trip.costSeconds, path: trip.path },
        graphVersion,
        costVersion,
      );
      active.set(best.taxiId, assignment);
      byRequest.set(head.requestId, assignment);
      dispatched.add(head.requestId);
      assigned.push(assignment);
      assignmentsTotal += 1;
      available = available.filter((taxiId) => taxiId !== best!.taxiId);
    }

    lastStepSearches = searches;
    routeSearchesTotal += searches;
    return frozenRecord({
      tick: atTick,
      assigned: Object.freeze(assigned),
      rejected: Object.freeze(rejected),
      blocked,
      availableCount: available.length,
      plannerSearches: searches,
      budgetExhausted,
    });
  }

  function release(taxiId: string, reason: unknown, atTick: unknown): DispatchRelease | null {
    assertLive();
    const id = text(taxiId),
      releaseReason = choice(reason, RIDE_DISPATCH_RELEASE_REASONS),
      releaseTick = tick(atTick),
      assignment = active.get(id);
    if (assignment === undefined) {
      // An unclaimed identity must still be a real taxi; an unknown id is never silently accepted.
      requireTaxi(id);
      return null;
    }
    // A claim can outlive its registry entry when the composition removes a vehicle. Releasing it is
    // an explicit caller decision (TAXI_REMOVED or the lifecycle terminal reason), never a step side
    // effect: `step` still fails loudly on a claim whose taxi disappeared.
    requireContract(releaseTick >= assignment.tick, 'Stale dispatch release tick');
    const nextStatus = releaseStatus[releaseReason];
    active.delete(id);
    byRequest.delete(assignment.requestId);
    statuses.set(id, nextStatus);
    const entry = frozenRecord({ assignment, reason: releaseReason, tick: releaseTick });
    if (pushBounded(releaseLog, entry, RIDE_DISPATCH_LIMITS.releaseHistory))
      droppedReleaseHistory += 1;
    releasesTotal += 1;
    return entry;
  }

  function reset(input: unknown): void {
    assertLive();
    const data = record(input);
    for (const key of Object.keys(data))
      requireContract(key === 'tick' || key === 'preserveStats', 'Unknown dispatcher reset field');
    requireContract(data.tick !== undefined, 'Ride dispatcher reset requires a tick');
    const atTick = tick(data.tick);
    requireContract(
      data.preserveStats === undefined || typeof data.preserveStats === 'boolean',
      'Ride dispatcher preserveStats must be a boolean',
    );
    requireContract(active.size === 0, 'Cannot reset a dispatcher with active assignments');
    if (atTick < lastTick) throw new RangeError('Stale dispatcher tick');
    const preserveStats = data.preserveStats === true;
    statuses.clear();
    dispatched.clear();
    releaseLog.length = 0;
    rejectionLog.length = 0;
    lastTick = atTick;
    if (!preserveStats) {
      assignmentsTotal = 0;
      releasesTotal = 0;
      rejectionsTotal = 0;
      routeSearchesTotal = 0;
      lastStepSearches = 0;
      droppedReleaseHistory = 0;
    }
  }

  function stats(): RideDispatcherStats {
    if (disposed)
      return frozenRecord({
        version: RIDE_DISPATCHER_VERSION,
        namespace,
        tick: 0,
        taxis: 0,
        available: 0,
        assigned: 0,
        pending: 0,
        assignments: 0,
        releases: 0,
        rejections: 0,
        routeSearches: 0,
        lastStepSearches: 0,
        blockedTaxis: 0,
        damagedTaxis: 0,
        offlineTaxis: 0,
        droppedReleaseHistory: 0,
        graphVersion,
        costVersion,
        disposed: true,
      });
    const taxiIds = taxis(),
      counts = { available: 0, assigned: 0, blocked: 0, damaged: 0, offline: 0 };
    for (const taxiId of taxiIds)
      counts[statusOf(taxiId).toLowerCase() as keyof typeof counts] += 1;
    return frozenRecord({
      version: RIDE_DISPATCHER_VERSION,
      namespace,
      tick: lastTick,
      taxis: taxiIds.length,
      available: counts.available,
      assigned: counts.assigned,
      pending: demand.stats().pending,
      assignments: assignmentsTotal,
      releases: releasesTotal,
      rejections: rejectionsTotal,
      routeSearches: routeSearchesTotal,
      lastStepSearches,
      blockedTaxis: counts.blocked,
      damagedTaxis: counts.damaged,
      offlineTaxis: counts.offline,
      droppedReleaseHistory,
      graphVersion,
      costVersion,
      disposed: false,
    });
  }

  return Object.freeze({
    namespace,
    graphVersion,
    costVersion,
    step,
    assignments(): readonly DispatchAssignment[] {
      return disposed ? Object.freeze([]) : snapshotAssignments();
    },
    assignmentFor(requestId: string): DispatchAssignment | undefined {
      return disposed ? undefined : byRequest.get(requestId);
    },
    availableTaxis(): readonly string[] {
      return disposed
        ? Object.freeze([])
        : Object.freeze(taxis().filter((taxiId) => statusOf(taxiId) === 'AVAILABLE'));
    },
    taxiStatus(taxiId: string): DispatchTaxiStatus | undefined {
      if (disposed) return undefined;
      if (!taxis().includes(taxiId)) return undefined;
      return statusOf(taxiId);
    },
    setTaxiStatus(taxiId: string, status: unknown, atTick: unknown): SettleableTaxiStatus {
      assertLive();
      const id = requireTaxi(taxiId),
        next = choice(status, dispatchTaxiStatuses);
      requireContract(next !== 'ASSIGNED', 'Taxi assignment is owned by the dispatcher');
      tick(atTick);
      requireContract(!active.has(id), 'Taxi is assigned; release it before changing status');
      const settleable = choice(next, settleableTaxiStatuses);
      if (settleable === 'AVAILABLE') statuses.delete(id);
      else statuses.set(id, settleable);
      return settleable;
    },
    release,
    rejections(): readonly DispatchRejection[] {
      return disposed ? Object.freeze([]) : Object.freeze(rejectionLog.slice());
    },
    releases(): readonly DispatchRelease[] {
      return disposed ? Object.freeze([]) : Object.freeze(releaseLog.slice());
    },
    stats,
    reset,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      statuses.clear();
      active.clear();
      byRequest.clear();
      dispatched.clear();
      releaseLog.length = 0;
      rejectionLog.length = 0;
      lastTick = 0;
      assignmentsTotal = 0;
      releasesTotal = 0;
      rejectionsTotal = 0;
      routeSearchesTotal = 0;
      lastStepSearches = 0;
      droppedReleaseHistory = 0;
    },
  });
}

/** Stable 006 assignment identity: request plus the taxi that claimed it. */
export function dispatchAssignmentId(namespace: string, requestId: string, taxiId: string): string {
  return createStableId('dispatch-assignment', namespace, [requestId, taxiId]);
}

export const DISPATCH_ASSIGNMENT_FIELDS = Object.freeze([
  'assignmentId',
  'requestId',
  'taxiId',
  'tick',
  'pickupZoneId',
  'dropoffZoneId',
  'pickupCostSeconds',
  'tripCostSeconds',
  'totalCostSeconds',
  'pickupRouteLaneIds',
  'tripRouteLaneIds',
  'graphVersion',
  'costVersion',
] as const);
