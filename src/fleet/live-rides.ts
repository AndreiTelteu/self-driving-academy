import { choice, number, record, requireContract, text, tick } from '../sessions';
import { ROUTE_COST_MODEL, createLaneGraph, createRoutePlanner, parseRoadMap } from '../world';
import type { LaneGraph, RoadMap, RoutePlanner, RouteStatus, ServiceZone } from '../world';
import { controlModes } from '../vehicles';
import type { ControlMode } from '../vehicles';
import { RIDE_DISPATCH_LIMITS, createRideDispatcher, settleableTaxiStatuses } from './dispatcher';
import type {
  DispatchAssignment,
  DispatchRejection,
  DispatchStep,
  RideDispatcher,
  RideDispatchReleaseReason,
  SettleableTaxiStatus,
  TaxiPositionSource,
} from './dispatcher';
import { RIDE_DEMAND_LIMITS, RIDE_DEMAND_OVERFLOW_POLICY, createRideDemand } from './ride-demand';
import type { RideDemand, RideDemandPlan, RideRequest } from './ride-demand';
import type { FleetRegistry, FleetVehicle } from './registry';

export const LIVE_RIDES_VERSION = '264-live-rides-v1' as const;

/**
 * PBI 264 — live ride demand and dispatch over the real fleet.
 *
 * This module is the composition root between the real 059 queue, the real 060 dispatcher and the
 * live 057/058 fleet. It creates no second simulation model, ride lifecycle, passenger or ETA: the
 * 24 live taxis stay owned by the fleet composition, assignments are 060 claims, and the physical
 * pickup/dropoff belongs to PBI 265. The contract is pure (no DOM, Babylon, renderer or wall clock);
 * the authoritative tick and the fleet frame are explicit inputs.
 */
export const LIVE_RIDES_LIMITS = Object.freeze({
  version: LIVE_RIDES_VERSION,
  /** Scenario windows authored by the live plan. */
  windows: 8,
  /** Requests per window; 8 windows x 8 requests = 64 real queued requests. */
  requestsPerWindow: 8,
  /** First request of the live scenario (about one second after the world starts). */
  firstSpawnTick: 60,
  /** One window per simulated second at 60 Hz. */
  windowSpanTicks: 60,
  /** Dispatch decisions run at 10 Hz, never on every tick. */
  dispatchEveryTicks: 6,
  /** Bounded requests assigned by one live dispatch step. */
  assignmentsPerDispatch: 2,
  /** Real 041 search budget of one dispatch step (same frozen 060 budget). */
  routeSearchesPerDispatch: RIDE_DISPATCH_LIMITS.routeSearchesPerStep,
  /** Bounded pending queue (same frozen 059 capacity). */
  queueLimit: RIDE_DEMAND_LIMITS.pendingRequests,
  /** Validation ceilings for caller overrides. */
  maximumWindows: 32,
  maximumRequestsPerWindow: 32,
  maximumDispatchEveryTicks: 600,
  /** Bounded live release log retained for the read model. */
  releaseHistory: RIDE_DISPATCH_LIMITS.releaseHistory,
  /** Bounded live rejection view retained for the read model. */
  rejectionHistory: 128,
  /** Frame input ceiling; the live fleet cannot exceed the 057 vehicle capacity. */
  frameVehicles: 128,
  idCodeUnits: RIDE_DEMAND_LIMITS.idCodeUnits,
});

/** Request states projected by the live read model. `CONSUMED` is an invariant violation guard. */
export const LIVE_RIDE_REQUEST_STATES = [
  'SCHEDULED',
  'PENDING',
  'ASSIGNED',
  'RELEASED',
  'REJECTED_INVALID',
  'REJECTED_QUEUE',
  'REJECTED_NO_ROUTE',
  'CONSUMED',
] as const;
export type LiveRideRequestState = (typeof LIVE_RIDE_REQUEST_STATES)[number];

/** Why a live assignment stopped being a claim. Reasons map onto the closed 060 vocabulary. */
export const LIVE_RIDE_RELEASE_CAUSES = [
  'PLAYER_TAKEOVER',
  'BLOCKED',
  'DAMAGED',
  'OFFLINE',
  'SCENARIO_RESET',
] as const;
export type LiveRideReleaseCause = (typeof LIVE_RIDE_RELEASE_CAUSES)[number];

export const LIVE_RIDE_REJECTION_SOURCES = ['DEMAND', 'DISPATCHER'] as const;
export type LiveRideRejectionSource = (typeof LIVE_RIDE_REJECTION_SOURCES)[number];

export interface LiveRidePlanOptions {
  readonly map: unknown;
  readonly seed?: number;
  readonly scenarioId?: string;
  readonly namespace?: string;
  readonly firstSpawnTick?: number;
  readonly windowSpanTicks?: number;
  readonly windows?: number;
  readonly requestsPerWindow?: number;
}

/** The exact fleet frame the composition publishes after its authoritative world step. */
export interface LiveRideFrameVehicle {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly laneId: string | null;
  readonly blocked: boolean;
  readonly controlMode: ControlMode;
}

export interface LiveRideStepInput {
  readonly tick: number;
  readonly vehicles: readonly LiveRideFrameVehicle[];
  /** The single car in the PLAYER seat (MANUAL/LEARNING), owned by 263. */
  readonly playerVehicleId: string | null;
}

export interface LiveRidesOptions {
  readonly registry: unknown;
  readonly map: unknown;
  readonly graph?: LaneGraph;
  readonly planner?: RoutePlanner;
  readonly seed?: number;
  readonly scenarioId?: string;
  readonly namespace?: string;
  readonly firstSpawnTick?: number;
  readonly windowSpanTicks?: number;
  readonly windows?: number;
  readonly requestsPerWindow?: number;
  readonly queueLimit?: number;
  readonly dispatchEveryTicks?: number;
  readonly assignmentsPerDispatch?: number;
  readonly maxRouteSearchesPerDispatch?: number;
}

export interface LiveRideReleaseView {
  readonly assignmentId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly tick: number;
  readonly cause: LiveRideReleaseCause;
  readonly reason: RideDispatchReleaseReason;
  readonly pickupCostSeconds: number;
  readonly tripCostSeconds: number;
}

export interface LiveRideRejectionView {
  readonly source: LiveRideRejectionSource;
  readonly requestId: string;
  readonly tick: number;
  readonly reason: string;
  readonly routeStatus: RouteStatus | null;
}

export interface LiveRideRequestView {
  readonly requestId: string;
  readonly windowId: string;
  readonly ordinal: number;
  readonly spawnTick: number;
  readonly demandLevel: string;
  readonly originZoneId: string;
  readonly destinationZoneId: string;
  readonly state: LiveRideRequestState;
  readonly validationStatus: string;
  readonly taxiId: string | null;
  readonly taxiSlot: number | null;
  readonly assignmentId: string | null;
  readonly pickupCostSeconds: number | null;
  readonly tripCostSeconds: number | null;
  readonly releaseCause: LiveRideReleaseCause | null;
}

export interface LiveRideAssignmentView extends DispatchAssignment {
  readonly taxiSlot: number | null;
}

export interface LiveRideCounts {
  readonly windows: number;
  readonly requests: number;
  readonly valid: number;
  readonly invalid: number;
  readonly pending: number;
  readonly assigned: number;
  readonly availableTaxis: number;
  readonly excludedPlayer: number;
  readonly blockedTaxis: number;
  readonly damagedTaxis: number;
  readonly offlineTaxis: number;
  readonly taxis: number;
}

export interface LiveRideTotals {
  readonly admitted: number;
  readonly dequeued: number;
  readonly overflow: number;
  readonly assignments: number;
  readonly releases: number;
  readonly rejected: number;
  readonly dispatchSteps: number;
  readonly routeSearches: number;
  readonly lastSearches: number;
  readonly maxSearchesPerStep: number;
  readonly maxAssignmentsPerStep: number;
  readonly releasesByCause: Readonly<Record<LiveRideReleaseCause, number>>;
}

export interface LiveRideSnapshot {
  readonly version: typeof LIVE_RIDES_VERSION;
  readonly tick: number;
  readonly namespace: string;
  readonly scenarioId: string;
  readonly counts: LiveRideCounts;
  readonly totals: LiveRideTotals;
  readonly queue: Readonly<{
    limit: number;
    pending: number;
    admitted: number;
    overflow: number;
    policy: typeof RIDE_DEMAND_OVERFLOW_POLICY;
    dispatchEveryTicks: number;
    assignmentsPerDispatch: number;
    routeSearchBudget: number;
  }>;
  readonly requests: readonly LiveRideRequestView[];
  readonly assignments: readonly LiveRideAssignmentView[];
  readonly releases: readonly LiveRideReleaseView[];
  readonly rejections: readonly LiveRideRejectionView[];
  readonly disposed: boolean;
}

export interface LiveRideStats {
  readonly version: typeof LIVE_RIDES_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly taxis: number;
  readonly available: number;
  readonly assigned: number;
  readonly pending: number;
  readonly requests: number;
  readonly admitted: number;
  readonly overflow: number;
  readonly assignments: number;
  readonly releases: number;
  readonly dispatchSteps: number;
  readonly routeSearches: number;
  readonly lastSearches: number;
  readonly maxSearchesPerStep: number;
  readonly maxAssignmentsPerStep: number;
  readonly queueLimit: number;
  readonly dispatchEveryTicks: number;
  readonly assignmentsPerDispatch: number;
  readonly routeSearchBudget: number;
  readonly disposed: boolean;
}

export interface LiveRideStepResult {
  readonly tick: number;
  readonly admitted: number;
  readonly overflowed: number;
  readonly assigned: number;
  readonly rejected: number;
  readonly blocked: string | null;
  readonly released: readonly LiveRideReleaseView[];
  readonly plannerSearches: number;
  readonly dispatchRan: boolean;
}

export interface LiveRideResetResult {
  readonly tick: number;
  readonly releasedAssignments: number;
  readonly preserveStats: boolean;
}

export interface LiveRides {
  readonly version: typeof LIVE_RIDES_VERSION;
  readonly plan: RideDemandPlan;
  readonly namespace: string;
  readonly demand: RideDemand;
  readonly dispatcher: RideDispatcher;
  /** One authoritative live step; the frame is the post-world composition frame. */
  step(input: unknown): LiveRideStepResult;
  /** Explicit external health fact (029/030/065); applied by the next step. */
  setTaxiStatus(taxiId: unknown, status: unknown): SettleableTaxiStatus;
  snapshot(): LiveRideSnapshot;
  stats(): LiveRideStats;
  rejections(): readonly LiveRideRejectionView[];
  reset(input: unknown): LiveRideResetResult;
  dispose(): void;
}

const planOptionFields = [
  'map',
  'seed',
  'scenarioId',
  'namespace',
  'firstSpawnTick',
  'windowSpanTicks',
  'windows',
  'requestsPerWindow',
] as const;

const optionFields = [
  'registry',
  'map',
  'graph',
  'planner',
  'seed',
  'scenarioId',
  'namespace',
  'firstSpawnTick',
  'windowSpanTicks',
  'windows',
  'requestsPerWindow',
  'queueLimit',
  'dispatchEveryTicks',
  'assignmentsPerDispatch',
  'maxRouteSearchesPerDispatch',
] as const;

const frameFields = ['vehicleId', 'driverKind', 'laneId', 'blocked', 'controlMode'] as const;
const stepFields = ['tick', 'vehicles', 'playerVehicleId'] as const;
const resetFields = ['tick', 'preserveStats'] as const;

const demandLevelCycle = ['HIGH', 'NORMAL', 'LOW'] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function boundedCount(value: unknown, minimum: number, maximum: number, label: string): number {
  const count = number(value, minimum, maximum);
  requireContract(Number.isSafeInteger(count), `${label} must be an integer`);
  return count;
}

function boundedTick(value: unknown, label: string): number {
  const atTick = tick(value);
  requireContract(atTick <= Number.MAX_SAFE_INTEGER, `${label} is too large`);
  return atTick;
}

function boundedId(value: unknown, label: string): string {
  const id = text(value);
  requireContract(id.length <= LIVE_RIDES_LIMITS.idCodeUnits, `${label} is too long`);
  return id;
}

/** Deterministic live scenario plan over the real 032 map; 059 derives the real zones from seed. */
export function createLiveRidePlan(options: unknown): RideDemandPlan {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract(
      (planOptionFields as readonly string[]).includes(key),
      'Unknown live ride plan option',
    );
  requireContract(data.map !== undefined, 'Live ride plan requires a road map');
  const map = parseRoadMap(data.map);
  const seed =
    data.seed === undefined ? 264 : boundedCount(data.seed, 0, 0xffff_ffff, 'Live ride seed');
  const scenarioId =
    data.scenarioId === undefined ? 'v3-live-city-264' : boundedId(data.scenarioId, 'scenario id');
  const namespace =
    data.namespace === undefined ? 'v3:city:rides' : boundedId(data.namespace, 'namespace');
  requireContract(namespace.length <= RIDE_DEMAND_LIMITS.namespaceCodeUnits, 'Live ride namespace');
  const firstSpawnTick =
    data.firstSpawnTick === undefined
      ? LIVE_RIDES_LIMITS.firstSpawnTick
      : boundedTick(data.firstSpawnTick, 'Live ride first spawn tick');
  const windowSpanTicks =
    data.windowSpanTicks === undefined
      ? LIVE_RIDES_LIMITS.windowSpanTicks
      : boundedCount(data.windowSpanTicks, 1, 60 * 60, 'Live ride window span');
  const windows =
    data.windows === undefined
      ? LIVE_RIDES_LIMITS.windows
      : boundedCount(data.windows, 1, LIVE_RIDES_LIMITS.maximumWindows, 'Live ride windows');
  const requestsPerWindow =
    data.requestsPerWindow === undefined
      ? LIVE_RIDES_LIMITS.requestsPerWindow
      : boundedCount(
          data.requestsPerWindow,
          1,
          LIVE_RIDES_LIMITS.maximumRequestsPerWindow,
          'Live ride requests per window',
        );
  requireContract(
    windows * requestsPerWindow <= RIDE_DEMAND_LIMITS.requests,
    'Live ride plan exceeds the 059 request capacity',
  );
  const zones = map.serviceZones;
  requireContract(
    zones.some((zone) => zone.access.includes('TAXI') && zone.kind !== 'DROPOFF') &&
      zones.some((zone) => zone.access.includes('TAXI') && zone.kind !== 'PICKUP'),
    'Live ride plan requires TAXI pickup and dropoff service zones',
  );
  const planned = Array.from({ length: windows }, (_, index) =>
    Object.freeze({
      windowId: `w${String(index).padStart(3, '0')}`,
      startTick: firstSpawnTick + index * windowSpanTicks,
      endTick: firstSpawnTick + (index + 1) * windowSpanTicks,
      demandLevel: demandLevelCycle[index % demandLevelCycle.length]!,
      requestCount: requestsPerWindow,
      // The real 059 generator chooses the pickup/dropoff zones from this seed and the real map.
      originZoneId: null,
      destinationZoneId: null,
    }),
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    scenarioId,
    mapId: map.mapId,
    seed,
    namespace,
    windows: Object.freeze(planned),
  });
}

function readRegistry(value: unknown): FleetRegistry {
  const registry = value as FleetRegistry;
  requireContract(
    typeof registry === 'object' &&
      registry !== null &&
      typeof registry.list === 'function' &&
      typeof registry.get === 'function' &&
      typeof registry.state === 'function' &&
      typeof registry.context === 'function',
    'Invalid live ride fleet registry',
  );
  return registry;
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
    'Invalid live ride route planner',
  );
  return planner;
}

function readFrameVehicles(value: unknown): readonly LiveRideFrameVehicle[] {
  requireContract(Array.isArray(value), 'Live ride frame vehicles must be a list');
  requireContract(value.length <= LIVE_RIDES_LIMITS.frameVehicles, 'Live ride frame is too large');
  const seen = new Set<string>();
  const vehicles: LiveRideFrameVehicle[] = [];
  for (const entry of value) {
    const data = record(entry);
    for (const key of Object.keys(data))
      requireContract(
        (frameFields as readonly string[]).includes(key),
        'Unknown live ride frame field',
      );
    const vehicleId = boundedId(data.vehicleId, 'vehicle id');
    requireContract(!seen.has(vehicleId), 'Duplicate live ride frame vehicle');
    seen.add(vehicleId);
    const driverKind = choice(data.driverKind, ['TAXI', 'CIVILIAN'] as const);
    const laneId =
      data.laneId === null || data.laneId === undefined ? null : boundedId(data.laneId, 'lane id');
    requireContract(typeof data.blocked === 'boolean', 'Live ride frame blocked must be a boolean');
    vehicles.push(
      Object.freeze({
        vehicleId,
        driverKind,
        laneId,
        blocked: data.blocked,
        controlMode: choice(data.controlMode, controlModes),
      }),
    );
  }
  return Object.freeze(vehicles);
}

function readStepInput(value: unknown): LiveRideStepInput {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (stepFields as readonly string[]).includes(key),
      'Unknown live ride step field',
    );
  requireContract(data.tick !== undefined, 'Live ride step requires a tick');
  const playerVehicleId =
    data.playerVehicleId === null || data.playerVehicleId === undefined
      ? null
      : boundedId(data.playerVehicleId, 'player vehicle id');
  return Object.freeze({
    tick: boundedTick(data.tick, 'live ride tick'),
    vehicles: readFrameVehicles(data.vehicles),
    playerVehicleId,
  });
}

function statusRank(status: SettleableTaxiStatus): number {
  switch (status) {
    case 'AVAILABLE':
      return 0;
    case 'BLOCKED':
      return 1;
    case 'DAMAGED':
      return 2;
    case 'OFFLINE':
      return 3;
  }
}

function mergeStatus(
  fact: SettleableTaxiStatus | undefined,
  worldBlocked: boolean,
): SettleableTaxiStatus {
  const observed: SettleableTaxiStatus = worldBlocked ? 'BLOCKED' : 'AVAILABLE';
  const explicit = fact ?? 'AVAILABLE';
  return statusRank(explicit) >= statusRank(observed) ? explicit : observed;
}

function releaseForStatus(
  status: SettleableTaxiStatus,
): { readonly cause: LiveRideReleaseCause; readonly reason: RideDispatchReleaseReason } | null {
  switch (status) {
    case 'BLOCKED':
      return { cause: 'BLOCKED', reason: 'TAXI_BLOCKED' };
    case 'DAMAGED':
      return { cause: 'DAMAGED', reason: 'TAXI_DAMAGED' };
    case 'OFFLINE':
      return { cause: 'OFFLINE', reason: 'TAXI_REMOVED' };
    case 'AVAILABLE':
      return null;
  }
}

function zeroByCause(): Record<LiveRideReleaseCause, number> {
  return {
    PLAYER_TAKEOVER: 0,
    BLOCKED: 0,
    DAMAGED: 0,
    OFFLINE: 0,
    SCENARIO_RESET: 0,
  };
}

function emptySnapshot(
  namespace: string,
  scenarioId: string,
  queueLimit: number,
  dispatchEveryTicks: number,
  assignmentsPerDispatch: number,
  routeSearchBudget: number,
): LiveRideSnapshot {
  return Object.freeze({
    version: LIVE_RIDES_VERSION,
    tick: 0,
    namespace,
    scenarioId,
    counts: Object.freeze({
      windows: 0,
      requests: 0,
      valid: 0,
      invalid: 0,
      pending: 0,
      assigned: 0,
      availableTaxis: 0,
      excludedPlayer: 0,
      blockedTaxis: 0,
      damagedTaxis: 0,
      offlineTaxis: 0,
      taxis: 0,
    }),
    totals: Object.freeze({
      admitted: 0,
      dequeued: 0,
      overflow: 0,
      assignments: 0,
      releases: 0,
      rejected: 0,
      dispatchSteps: 0,
      routeSearches: 0,
      lastSearches: 0,
      maxSearchesPerStep: 0,
      maxAssignmentsPerStep: 0,
      releasesByCause: Object.freeze(zeroByCause()),
    }),
    queue: Object.freeze({
      limit: queueLimit,
      pending: 0,
      admitted: 0,
      overflow: 0,
      policy: RIDE_DEMAND_OVERFLOW_POLICY,
      dispatchEveryTicks,
      assignmentsPerDispatch,
      routeSearchBudget,
    }),
    requests: Object.freeze([]),
    assignments: Object.freeze([]),
    releases: Object.freeze([]),
    rejections: Object.freeze([]),
    disposed: true,
  });
}

export function createLiveRides(options: unknown): LiveRides {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract((optionFields as readonly string[]).includes(key), 'Unknown live ride option');
  requireContract(data.registry !== undefined, 'Live rides require a fleet registry');
  requireContract(data.map !== undefined, 'Live rides require a road map');
  const registry = readRegistry(data.registry);
  const map: RoadMap = parseRoadMap(data.map);
  const graph = data.graph === undefined ? null : (data.graph as LaneGraph);
  if (graph !== null)
    requireContract(
      typeof graph.getLane === 'function' && typeof graph.getDirectedPath === 'function',
      'Invalid live ride lane graph',
    );
  const plan = createLiveRidePlan({
    map,
    ...(data.seed === undefined ? {} : { seed: data.seed }),
    ...(data.scenarioId === undefined ? {} : { scenarioId: data.scenarioId }),
    ...(data.namespace === undefined ? {} : { namespace: data.namespace }),
    ...(data.firstSpawnTick === undefined ? {} : { firstSpawnTick: data.firstSpawnTick }),
    ...(data.windowSpanTicks === undefined ? {} : { windowSpanTicks: data.windowSpanTicks }),
    ...(data.windows === undefined ? {} : { windows: data.windows }),
    ...(data.requestsPerWindow === undefined ? {} : { requestsPerWindow: data.requestsPerWindow }),
  });
  const queueLimit =
    data.queueLimit === undefined
      ? LIVE_RIDES_LIMITS.queueLimit
      : boundedCount(data.queueLimit, 1, LIVE_RIDES_LIMITS.queueLimit, 'Live ride queue limit');
  const dispatchEveryTicks =
    data.dispatchEveryTicks === undefined
      ? LIVE_RIDES_LIMITS.dispatchEveryTicks
      : boundedCount(
          data.dispatchEveryTicks,
          1,
          LIVE_RIDES_LIMITS.maximumDispatchEveryTicks,
          'Live ride dispatch cadence',
        );
  const assignmentsPerDispatch =
    data.assignmentsPerDispatch === undefined
      ? LIVE_RIDES_LIMITS.assignmentsPerDispatch
      : boundedCount(
          data.assignmentsPerDispatch,
          1,
          RIDE_DISPATCH_LIMITS.maximumAssignmentsPerStep,
          'Live ride assignments per dispatch',
        );
  const routeSearchBudget =
    data.maxRouteSearchesPerDispatch === undefined
      ? LIVE_RIDES_LIMITS.routeSearchesPerDispatch
      : boundedCount(
          data.maxRouteSearchesPerDispatch,
          1,
          RIDE_DISPATCH_LIMITS.maximumRouteSearchesPerStep,
          'Live ride route search budget',
        );
  const ownedPlanner = data.planner === undefined;
  const planner =
    data.planner === undefined
      ? createRoutePlanner({
          graph: graph ?? createLaneGraph(map),
          map,
          graphVersion: '033-lane-graph-v1',
          costVersion: ROUTE_COST_MODEL.version,
        })
      : readPlanner(data.planner);
  let demand: RideDemand;
  try {
    demand = createRideDemand({
      plan,
      map,
      planner,
      queueLimit,
    });
  } catch (error: unknown) {
    if (ownedPlanner) planner.dispose();
    throw error;
  }
  /** Player-driven taxis are removed from the dispatcher's registry view, never invented statuses. */
  const excluded = new Set<string>();
  const dispatchRegistry = Object.freeze({
    list: () =>
      Object.freeze(registry.list().filter((vehicle) => !excluded.has(vehicle.vehicleId))),
    get: (vehicleId: string): FleetVehicle | undefined =>
      excluded.has(vehicleId) ? undefined : registry.get(vehicleId),
    state: (vehicleId: string) => (excluded.has(vehicleId) ? undefined : registry.state(vehicleId)),
  });
  /** Current real lane per taxi, refreshed from the post-world frame before each dispatch step. */
  const lanes = new Map<string, string | null>();
  const positions: TaxiPositionSource = Object.freeze({
    laneFor: (taxiId: string): string | null => lanes.get(taxiId) ?? null,
  });
  let dispatcher: RideDispatcher;
  try {
    dispatcher = createRideDispatcher({
      registry: dispatchRegistry,
      demand,
      planner,
      map,
      positions,
      maxAssignmentsPerStep: assignmentsPerDispatch,
      maxRouteSearchesPerStep: routeSearchBudget,
    });
  } catch (error: unknown) {
    demand.dispose();
    if (ownedPlanner) planner.dispose();
    throw error;
  }
  const facts = new Map<string, SettleableTaxiStatus>();
  const admittedEver = new Set<string>();
  const noRoute = new Set<string>();
  const releasedByRequest = new Map<string, LiveRideReleaseView>();
  const releaseLog: LiveRideReleaseView[] = [];
  const rejectionLog: LiveRideRejectionView[] = [];
  const displacedRejections = new Map<string, DispatchRejection>();
  const totals = {
    admitted: 0,
    dequeued: 0,
    overflow: 0,
    assignments: 0,
    releases: 0,
    rejected: 0,
    dispatchSteps: 0,
    routeSearches: 0,
    lastSearches: 0,
    maxSearchesPerStep: 0,
    maxAssignmentsPerStep: 0,
    releasesByCause: zeroByCause(),
  };
  let lastTick = -1;
  let disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Live rides disposed');
  }

  function allTaxis(): readonly FleetVehicle[] {
    return registry
      .list()
      .filter((vehicle) => vehicle.driverKind === 'TAXI')
      .sort((left, right) => compareText(left.vehicleId, right.vehicleId));
  }

  function pushBounded<T>(log: T[], entry: T, limit: number): void {
    log.push(entry);
    if (log.length > limit) log.splice(0, log.length - limit);
  }

  function releaseView(
    assignment: DispatchAssignment,
    cause: LiveRideReleaseCause,
    reason: RideDispatchReleaseReason,
    atTick: number,
  ): LiveRideReleaseView {
    const released = dispatcher.release(assignment.taxiId, reason, atTick);
    requireContract(released !== null, 'Live ride claim disappeared during release');
    const view = Object.freeze({
      assignmentId: assignment.assignmentId,
      requestId: assignment.requestId,
      taxiId: assignment.taxiId,
      tick: atTick,
      cause,
      reason,
      pickupCostSeconds: assignment.pickupCostSeconds,
      tripCostSeconds: assignment.tripCostSeconds,
    });
    pushBounded(releaseLog, view, LIVE_RIDES_LIMITS.releaseHistory);
    releasedByRequest.set(assignment.requestId, view);
    totals.releases += 1;
    totals.releasesByCause[cause] += 1;
    return view;
  }

  function refreshFleet(input: LiveRideStepInput): ReadonlyMap<string, SettleableTaxiStatus> {
    excluded.clear();
    lanes.clear();
    const frameByTaxi = new Map<string, LiveRideFrameVehicle>();
    for (const vehicle of input.vehicles) {
      if (vehicle.driverKind !== 'TAXI') continue;
      frameByTaxi.set(vehicle.vehicleId, vehicle);
      lanes.set(vehicle.vehicleId, vehicle.laneId);
      if (vehicle.controlMode !== 'AUTO') excluded.add(vehicle.vehicleId);
    }
    if (
      input.playerVehicleId !== null &&
      registry.get(input.playerVehicleId)?.driverKind === 'TAXI'
    )
      excluded.add(input.playerVehicleId);
    const effective = new Map<string, SettleableTaxiStatus>();
    for (const taxi of allTaxis()) {
      if (excluded.has(taxi.vehicleId)) continue;
      effective.set(
        taxi.vehicleId,
        mergeStatus(facts.get(taxi.vehicleId), frameByTaxi.get(taxi.vehicleId)?.blocked ?? false),
      );
    }
    return effective;
  }

  function step(input: unknown): LiveRideStepResult {
    assertLive();
    const request = readStepInput(input);
    if (request.tick <= lastTick)
      throw new RangeError(`Stale live ride tick: ${request.tick} <= ${lastTick}`);
    const atTick = request.tick;
    lastTick = atTick;
    const effective = refreshFleet(request);
    const releases: LiveRideReleaseView[] = [];
    // 1. A claim whose taxi became player-driven, blocked, damaged or offline is released explicitly
    //    with the closed 060 reason. The dispatcher never loses a claim silently.
    for (const assignment of dispatcher.assignments()) {
      if (excluded.has(assignment.taxiId)) {
        releases.push(releaseView(assignment, 'PLAYER_TAKEOVER', 'CANCELLED', atTick));
        continue;
      }
      const status = effective.get(assignment.taxiId) ?? 'AVAILABLE';
      const release = releaseForStatus(status);
      if (release !== null)
        releases.push(releaseView(assignment, release.cause, release.reason, atTick));
    }
    // 2. Publish the caller-visible availability of every unclaimed, non-player taxi.
    const claimed = new Set(dispatcher.assignments().map((assignment) => assignment.taxiId));
    for (const taxi of allTaxis()) {
      if (claimed.has(taxi.vehicleId) || excluded.has(taxi.vehicleId)) continue;
      const status = effective.get(taxi.vehicleId) ?? 'AVAILABLE';
      if (dispatcher.taxiStatus(taxi.vehicleId) !== status)
        dispatcher.setTaxiStatus(taxi.vehicleId, status, atTick);
    }
    // 3. The real 059 schedule admits every due request; the bounded queue rejects the newest.
    const advance = demand.advance(atTick);
    for (const admitted of advance.admitted) admittedEver.add(admitted.requestId);
    totals.admitted += advance.admitted.length;
    totals.overflow += advance.overflowed.length;
    // 4. Dispatch decisions run at 10 Hz; the 060 step owns the real cost scan and both replans.
    let dispatch: DispatchStep | null = null;
    if (atTick % dispatchEveryTicks === 0) {
      dispatch = dispatcher.step({ tick: atTick, maxAssignments: assignmentsPerDispatch });
      totals.dispatchSteps += 1;
      totals.assignments += dispatch.assigned.length;
      totals.lastSearches = dispatch.plannerSearches;
      totals.routeSearches += dispatch.plannerSearches;
      totals.maxSearchesPerStep = Math.max(totals.maxSearchesPerStep, dispatch.plannerSearches);
      totals.maxAssignmentsPerStep = Math.max(
        totals.maxAssignmentsPerStep,
        dispatch.assigned.length,
      );
      for (const rejected of dispatch.rejected) {
        noRoute.add(rejected.requestId);
        displacedRejections.set(rejected.requestId, rejected);
        totals.rejected += 1;
        pushBounded(
          rejectionLog,
          Object.freeze({
            source: 'DISPATCHER' as const,
            requestId: rejected.requestId,
            tick: rejected.tick,
            reason: rejected.reason,
            routeStatus: rejected.routeStatus,
          }),
          LIVE_RIDES_LIMITS.rejectionHistory,
        );
      }
    }
    const demandStats = demand.stats();
    totals.dequeued = demandStats.dequeued;
    return Object.freeze({
      tick: atTick,
      admitted: advance.admitted.length,
      overflowed: advance.overflowed.length,
      assigned: dispatch?.assigned.length ?? 0,
      rejected: dispatch?.rejected.length ?? 0,
      blocked: dispatch?.blocked?.reason ?? null,
      released: Object.freeze(releases),
      plannerSearches: dispatch?.plannerSearches ?? 0,
      dispatchRan: dispatch !== null,
    });
  }

  function requestRows(): readonly LiveRideRequestView[] {
    const pending = new Set(demand.pending().map((request) => request.requestId));
    const assignments = new Map(
      dispatcher.assignments().map((assignment) => [assignment.requestId, assignment]),
    );
    const demandRejections = new Map(
      demand.rejections().map((rejection) => [rejection.requestId, rejection.reason] as const),
    );
    const dispatcherRejections = new Map(
      dispatcher.rejections().map((rejection) => [rejection.requestId, rejection.reason] as const),
    );
    const rows: LiveRideRequestView[] = [];
    for (const request of demand.requests()) {
      const assignment = assignments.get(request.requestId),
        released = releasedByRequest.get(request.requestId),
        validation = demand.validation(request.requestId);
      let state: LiveRideRequestState;
      let taxiId: string | null = null;
      let assignmentId: string | null = null;
      let pickupCostSeconds: number | null = null;
      let tripCostSeconds: number | null = null;
      let releaseCause: LiveRideReleaseCause | null = null;
      if (assignment !== undefined) {
        state = 'ASSIGNED';
        taxiId = assignment.taxiId;
        assignmentId = assignment.assignmentId;
        pickupCostSeconds = assignment.pickupCostSeconds;
        tripCostSeconds = assignment.tripCostSeconds;
      } else if (pending.has(request.requestId)) {
        state = 'PENDING';
      } else if (validation !== undefined && validation.status !== 'READY') {
        state = 'REJECTED_INVALID';
      } else if (demandRejections.has(request.requestId)) {
        state = 'REJECTED_QUEUE';
      } else if (
        noRoute.has(request.requestId) ||
        dispatcherRejections.has(request.requestId) ||
        displacedRejections.has(request.requestId)
      ) {
        state = 'REJECTED_NO_ROUTE';
      } else if (released !== undefined) {
        state = 'RELEASED';
        taxiId = released.taxiId;
        assignmentId = released.assignmentId;
        pickupCostSeconds = released.pickupCostSeconds;
        tripCostSeconds = released.tripCostSeconds;
        releaseCause = released.cause;
      } else if (request.spawnTick > lastTick) {
        state = 'SCHEDULED';
      } else if (admittedEver.has(request.requestId)) {
        // No live module path may remove an admitted request without a trace; the report asserts 0.
        state = 'CONSUMED';
      } else {
        state = 'SCHEDULED';
      }
      const taxi = taxiId === null ? undefined : registry.get(taxiId);
      rows.push(
        Object.freeze({
          requestId: request.requestId,
          windowId: request.windowId,
          ordinal: request.ordinal,
          spawnTick: request.spawnTick,
          demandLevel: request.demandLevel,
          originZoneId: request.originZoneId,
          destinationZoneId: request.destinationZoneId,
          state,
          validationStatus: validation?.status ?? 'UNKNOWN',
          taxiId,
          taxiSlot: taxi?.slot ?? null,
          assignmentId,
          pickupCostSeconds,
          tripCostSeconds,
          releaseCause,
        }),
      );
    }
    return Object.freeze(rows);
  }

  function countTaxis(): {
    readonly available: number;
    readonly assigned: number;
    readonly excludedPlayer: number;
    readonly blocked: number;
    readonly damaged: number;
    readonly offline: number;
  } {
    const claimed = new Set(dispatcher.assignments().map((assignment) => assignment.taxiId));
    let available = 0,
      assigned = 0,
      excludedPlayer = 0,
      blocked = 0,
      damaged = 0,
      offline = 0;
    for (const taxi of allTaxis()) {
      if (excluded.has(taxi.vehicleId)) {
        excludedPlayer += 1;
        continue;
      }
      if (claimed.has(taxi.vehicleId)) {
        assigned += 1;
        continue;
      }
      switch (dispatcher.taxiStatus(taxi.vehicleId) ?? 'AVAILABLE') {
        case 'AVAILABLE':
          available += 1;
          break;
        case 'BLOCKED':
          blocked += 1;
          break;
        case 'DAMAGED':
          damaged += 1;
          break;
        case 'OFFLINE':
          offline += 1;
          break;
        case 'ASSIGNED':
          assigned += 1;
          break;
      }
    }
    return { available, assigned, excludedPlayer, blocked, damaged, offline };
  }

  function snapshot(): LiveRideSnapshot {
    if (disposed)
      return emptySnapshot(
        plan.namespace,
        plan.scenarioId,
        queueLimit,
        dispatchEveryTicks,
        assignmentsPerDispatch,
        routeSearchBudget,
      );
    const demandStats = demand.stats(),
      taxis = allTaxis(),
      counts = countTaxis(),
      assignments = Object.freeze(
        dispatcher.assignments().map((assignment) =>
          Object.freeze({
            ...assignment,
            taxiSlot: registry.get(assignment.taxiId)?.slot ?? null,
          }),
        ),
      );
    return Object.freeze({
      version: LIVE_RIDES_VERSION,
      tick: lastTick < 0 ? 0 : lastTick,
      namespace: plan.namespace,
      scenarioId: plan.scenarioId,
      counts: Object.freeze({
        windows: plan.windows.length,
        requests: demandStats.requests,
        valid: demandStats.valid,
        invalid: demandStats.invalid,
        pending: demandStats.pending,
        assigned: assignments.length,
        availableTaxis: counts.available,
        excludedPlayer: counts.excludedPlayer,
        blockedTaxis: counts.blocked,
        damagedTaxis: counts.damaged,
        offlineTaxis: counts.offline,
        taxis: taxis.length,
      }),
      totals: Object.freeze({
        admitted: totals.admitted,
        dequeued: totals.dequeued,
        overflow: totals.overflow,
        assignments: totals.assignments,
        releases: totals.releases,
        rejected: totals.rejected,
        dispatchSteps: totals.dispatchSteps,
        routeSearches: totals.routeSearches,
        lastSearches: totals.lastSearches,
        maxSearchesPerStep: totals.maxSearchesPerStep,
        maxAssignmentsPerStep: totals.maxAssignmentsPerStep,
        releasesByCause: Object.freeze({ ...totals.releasesByCause }),
      }),
      queue: Object.freeze({
        limit: queueLimit,
        pending: demandStats.pending,
        admitted: totals.admitted,
        overflow: totals.overflow,
        policy: RIDE_DEMAND_OVERFLOW_POLICY,
        dispatchEveryTicks,
        assignmentsPerDispatch,
        routeSearchBudget,
      }),
      requests: requestRows(),
      assignments,
      releases: Object.freeze(releaseLog.slice()),
      rejections: Object.freeze(rejectionLog.slice()),
      disposed: false,
    });
  }

  function zeroStats(): LiveRideStats {
    return Object.freeze({
      version: LIVE_RIDES_VERSION,
      namespace: plan.namespace,
      tick: 0,
      taxis: 0,
      available: 0,
      assigned: 0,
      pending: 0,
      requests: 0,
      admitted: 0,
      overflow: 0,
      assignments: 0,
      releases: 0,
      dispatchSteps: 0,
      routeSearches: 0,
      lastSearches: 0,
      maxSearchesPerStep: 0,
      maxAssignmentsPerStep: 0,
      queueLimit,
      dispatchEveryTicks,
      assignmentsPerDispatch,
      routeSearchBudget,
      disposed: true,
    });
  }

  function stats(): LiveRideStats {
    if (disposed) return zeroStats();
    const demandStats = demand.stats(),
      counts = countTaxis();
    return Object.freeze({
      version: LIVE_RIDES_VERSION,
      namespace: plan.namespace,
      tick: lastTick < 0 ? 0 : lastTick,
      taxis: allTaxis().length,
      available: counts.available,
      assigned: counts.assigned,
      pending: demandStats.pending,
      requests: demandStats.requests,
      admitted: totals.admitted,
      overflow: totals.overflow,
      assignments: totals.assignments,
      releases: totals.releases,
      dispatchSteps: totals.dispatchSteps,
      routeSearches: totals.routeSearches,
      lastSearches: totals.lastSearches,
      maxSearchesPerStep: totals.maxSearchesPerStep,
      maxAssignmentsPerStep: totals.maxAssignmentsPerStep,
      queueLimit,
      dispatchEveryTicks,
      assignmentsPerDispatch,
      routeSearchBudget,
      disposed: false,
    });
  }

  function reset(input: unknown): LiveRideResetResult {
    assertLive();
    const resetData = record(input);
    for (const key of Object.keys(resetData))
      requireContract(
        (resetFields as readonly string[]).includes(key),
        'Unknown live ride reset field',
      );
    requireContract(resetData.tick !== undefined, 'Live ride reset requires a tick');
    const atTick = boundedTick(resetData.tick, 'live ride reset tick');
    requireContract(
      resetData.preserveStats === undefined || typeof resetData.preserveStats === 'boolean',
      'Live ride preserveStats must be a boolean',
    );
    if (atTick < lastTick) throw new RangeError('Stale live ride reset tick');
    const preserveStats = resetData.preserveStats === true;
    let releasedAssignments = 0;
    // 065 order: release every live claim explicitly before clearing the 060/059 structures.
    for (const assignment of dispatcher.assignments()) {
      const view = releaseView(assignment, 'SCENARIO_RESET', 'CANCELLED', atTick);
      requireContract(view.requestId === assignment.requestId, 'Live ride reset lost a claim');
      releasedAssignments += 1;
    }
    dispatcher.reset({ tick: atTick, preserveStats });
    demand.reset({ preserveStats });
    facts.clear();
    excluded.clear();
    lanes.clear();
    admittedEver.clear();
    noRoute.clear();
    releasedByRequest.clear();
    releaseLog.length = 0;
    rejectionLog.length = 0;
    displacedRejections.clear();
    lastTick = atTick;
    if (!preserveStats) {
      totals.admitted = 0;
      totals.dequeued = 0;
      totals.overflow = 0;
      totals.assignments = 0;
      totals.releases = 0;
      totals.rejected = 0;
      totals.dispatchSteps = 0;
      totals.routeSearches = 0;
      totals.lastSearches = 0;
      totals.maxSearchesPerStep = 0;
      totals.maxAssignmentsPerStep = 0;
      totals.releasesByCause = zeroByCause();
    }
    return Object.freeze({ tick: atTick, releasedAssignments, preserveStats });
  }

  return Object.freeze({
    version: LIVE_RIDES_VERSION,
    plan,
    namespace: plan.namespace,
    demand,
    dispatcher,
    step,
    setTaxiStatus(taxiId: unknown, status: unknown): SettleableTaxiStatus {
      assertLive();
      const id = boundedId(taxiId, 'taxi id'),
        vehicle = registry.get(id);
      requireContract(
        vehicle !== undefined && vehicle.driverKind === 'TAXI',
        'Unknown live ride taxi',
      );
      const next = choice(status, settleableTaxiStatuses);
      if (next === 'AVAILABLE') facts.delete(id);
      else facts.set(id, next);
      return next;
    },
    snapshot,
    stats,
    rejections(): readonly LiveRideRejectionView[] {
      return disposed ? Object.freeze([]) : Object.freeze(rejectionLog.slice());
    },
    reset,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      dispatcher.dispose();
      demand.dispose();
      if (ownedPlanner) planner.dispose();
      facts.clear();
      excluded.clear();
      lanes.clear();
      admittedEver.clear();
      noRoute.clear();
      releasedByRequest.clear();
      releaseLog.length = 0;
      rejectionLog.length = 0;
      displacedRejections.clear();
      totals.admitted = 0;
      totals.dequeued = 0;
      totals.overflow = 0;
      totals.assignments = 0;
      totals.releases = 0;
      totals.rejected = 0;
      totals.dispatchSteps = 0;
      totals.routeSearches = 0;
      totals.lastSearches = 0;
      totals.maxSearchesPerStep = 0;
      totals.maxAssignmentsPerStep = 0;
      totals.releasesByCause = zeroByCause();
      lastTick = 0;
    },
  });
}

/** Real service zones referenced by a live plan's requests, used by evidence and UI probes. */
export function liveRideZones(map: RoadMap): readonly ServiceZone[] {
  return Object.freeze(
    map.serviceZones
      .filter((zone) => zone.access.includes('TAXI'))
      .slice()
      .sort((left, right) => compareText(left.id, right.id)),
  );
}

/** Stable, deterministic live request list helper for reports; the identity stays owned by 059. */
export function liveRideRequests(demand: RideDemand): readonly RideRequest[] {
  return demand.requests();
}
