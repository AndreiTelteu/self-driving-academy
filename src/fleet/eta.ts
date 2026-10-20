import { number, record, requireContract, text, tick } from '../sessions';
import { ROUTE_COST_MODEL } from '../world';
import type { LaneGraph, RoadAccess, RoutePlanner } from '../world';
import type { RideLifecycle, RideRecord, RideState } from './ride-fsm';

export const RIDE_ETA_VERSION = '064-eta-v1' as const;

/**
 * Closed vocabulary for an estimate that cannot be certified. Every unavailable snapshot carries
 * exactly one of these reasons; the module never returns a silent `0` seconds estimate for a route
 * or a position it could not read.
 */
export const ETA_UNAVAILABLE_REASONS = [
  'ROUTE_MISSING',
  'ROUTE_STALE',
  'ROUTE_INVALID',
  'POSITION_INVALID',
  'OFF_ROUTE',
  'SERVICE_BLOCKED',
  'STALE_TICK',
  'WRONG_RIDE',
  'FOREIGN_VEHICLE',
  'RIDE_TERMINAL',
] as const;
export type EtaUnavailableReason = (typeof ETA_UNAVAILABLE_REASONS)[number];

/** Caller-owned service state. It is an explicit input, never hidden traffic prediction. */
export const ETA_SERVICE_STATES = ['FREE_FLOW', 'CONGESTED', 'BLOCKED'] as const;
export type EtaServiceState = (typeof ETA_SERVICE_STATES)[number];

export interface EtaPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface EtaObservation {
  readonly rideId: string;
  readonly taxiId: string;
  readonly tick: number;
  readonly positionM: EtaPoint;
  /** Authoritative instantaneous speed in m/s for this tick; never used as the ETA basis. */
  readonly speedMps: number;
  /** Optional map-plane heading (zero +X, positive toward +Z) used to disambiguate lane identity. */
  readonly headingRad?: number;
}

export type EtaLeg = 'PICKUP' | 'TRIP';

export type EtaStatus = 'ESTIMATED' | 'ARRIVED' | 'UNAVAILABLE';

/**
 * One estimate at one authoritative tick.
 *
 * Route geometry values are `null` when the stored 041 route cannot be read at all. When the route
 * is readable but the observation cannot move the certified progress (off-route, invalid position,
 * blocked service), the last certified progress is reported together with `etaSeconds: null`; a
 * missing route is never reported as `remainingDistanceM: 0`.
 */
export interface EtaSnapshot {
  readonly status: EtaStatus;
  readonly reason: EtaUnavailableReason | null;
  readonly tick: number;
  readonly rideId: string;
  readonly taxiId: string;
  /** `null` only for an unknown ride. */
  readonly state: RideState | null;
  readonly leg: EtaLeg | null;
  readonly serviceState: EtaServiceState;
  readonly routeLaneIds: readonly string[] | null;
  readonly laneCount: number | null;
  readonly totalDistanceM: number | null;
  /** Distance certified along the route; never decreases for one ride and one leg. */
  readonly traveledDistanceM: number | null;
  readonly remainingDistanceM: number | null;
  /** `traveledDistanceM / totalDistanceM`, in [0, 1]. */
  readonly progressFraction: number | null;
  readonly segmentIndex: number | null;
  readonly segmentLaneId: string | null;
  readonly segmentKind: 'LANE' | 'CONNECTION' | null;
  readonly segmentProgressFraction: number | null;
  /** Mean planned speed of the whole leg from the real 041 cost over the real lane metres. */
  readonly plannedSpeedMps: number | null;
  /** Planned speed after the service-state factor; `null` when the service is blocked. */
  readonly speedBasisMps: number | null;
  readonly observedSpeedMps: number;
  /** Free-flow remaining time from the route cost model, before the service-state factor. */
  readonly plannedRemainingSeconds: number | null;
  readonly etaSeconds: number | null;
  readonly etaMinSeconds: number | null;
  readonly etaMaxSeconds: number | null;
  /** Lateral distance used by an off-route reprojection; `null` when the position was on-route. */
  readonly offRouteDistanceM: number | null;
  /** `true` when the position was not directly on the current route lane (gap or adjacent lane). */
  readonly reprojected: boolean;
  /** `true` when the stored route no longer matches the planner's current inputs. */
  readonly stale: boolean;
}

export interface RideEtaStats {
  readonly version: typeof RIDE_ETA_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly observations: number;
  readonly estimated: number;
  readonly arrived: number;
  readonly unavailable: number;
  readonly reprojected: number;
  readonly routeLoads: number;
  readonly byReason: Readonly<Record<EtaUnavailableReason, number>>;
  readonly disposed: boolean;
}

export interface RideEta {
  readonly namespace: string;
  readonly tickRateHz: number;
  readonly offRouteToleranceM: number;
  readonly reprojectionLanes: number;
  readonly serviceState: EtaServiceState;
  /** Authoritative simulated tick of the last accepted observation; there is no wall clock. */
  currentTick(): number;
  setServiceState(state: unknown): EtaServiceState;
  observe(input: unknown): EtaSnapshot;
  /** Last estimate retained for one ride, including a terminal ride. */
  estimate(rideId: string): EtaSnapshot | undefined;
  estimates(): readonly EtaSnapshot[];
  stats(): RideEtaStats;
  dispose(): void;
}

export const ETA_LIMITS = Object.freeze({
  version: RIDE_ETA_VERSION,
  /** Concurrent retained estimates; identical to the 061 active-ride ceiling. */
  rides: 64,
  /** Lanes per stored 041 route; identical to the 041 path ceiling. */
  routeLanes: 256,
  /** Code units per observation identity. */
  idCodeUnits: 512,
  /** Lanes inspected forward when the position is not on the current route lane. */
  reprojectionLanes: 8,
  /** Hard ceiling for the caller's reprojection window override. */
  maximumReprojectionLanes: 64,
});

/**
 * Documented, provisional uncertainty of the planned speed basis. `nominalSpeedFactor` scales the
 * real route speed to the service state; the min/max factors delimit the published ETA interval.
 * These values are a declared uncertainty, not a traffic prediction or a hardware measurement.
 */
export const ETA_UNCERTAINTY: Readonly<
  Record<
    EtaServiceState,
    Readonly<{
      nominalSpeedFactor: number;
      minSpeedFactor: number;
      maxSpeedFactor: number;
    }> | null
  >
> = Object.freeze({
  FREE_FLOW: Object.freeze({ nominalSpeedFactor: 1, minSpeedFactor: 0.9, maxSpeedFactor: 1.1 }),
  CONGESTED: Object.freeze({ nominalSpeedFactor: 0.5, minSpeedFactor: 0.35, maxSpeedFactor: 0.65 }),
  BLOCKED: null,
});

export const ETA_DEFAULTS = Object.freeze({
  tickRateHz: 60,
  /** Lateral tolerance for reprojecting a position that is not inside the route lane corridor. */
  offRouteToleranceM: 4,
  reprojectionLanes: ETA_LIMITS.reprojectionLanes,
  serviceState: 'FREE_FLOW' as EtaServiceState,
});

/** Height separation between route geometry and an observation, matching the 033 lane query. */
const MAX_HEIGHT_DIFFERENCE_M = 1.5;

const optionFields = [
  'lifecycle',
  'graph',
  'planner',
  'tickRateHz',
  'offRouteToleranceM',
  'reprojectionLanes',
  'serviceState',
] as const;

const observationFields = [
  'rideId',
  'taxiId',
  'tick',
  'positionM',
  'speedMps',
  'headingRad',
] as const;

const pointFields = ['x', 'y', 'z'] as const;

interface RouteSegment {
  readonly laneIndex: number;
  readonly kind: 'LANE' | 'CONNECTION';
  readonly a: EtaPoint;
  readonly b: EtaPoint;
  /** Cumulative route distance at `a`, connection gaps included. */
  readonly startM: number;
  readonly lengthM: number;
}

interface LaneProfile {
  readonly laneId: string;
  readonly points: readonly EtaPoint[];
  /** Cumulative distance from the lane start to each polyline point. */
  readonly pointDistances: readonly number[];
  /** Cumulative route distance at the first point of the lane. */
  readonly startM: number;
  /** Directed lane length from the real 033 polyline. */
  readonly lengthM: number;
  /** Real lane length used by the 041 cost model (`path.lengthM`). */
  readonly costLengthM: number;
  readonly speedMps: number;
  /** Free-flow seconds of this lane from the 041 cost model, before penalty/traffic scaling. */
  readonly freeSeconds: number;
  /** Free-flow seconds distributed so the whole leg equals the stored 041 cost. */
  readonly plannedSeconds: number;
}

interface LoadedRoute {
  readonly status: 'READY';
  readonly laneIds: readonly string[];
  readonly lanes: readonly LaneProfile[];
  readonly segments: readonly RouteSegment[];
  /** Lane index occurrences by lane id, used to pick the forward occurrence deterministically. */
  readonly occurrences: ReadonlyMap<string, readonly number[]>;
  readonly totalDistanceM: number;
  readonly costSeconds: number;
  readonly plannedSpeedMps: number;
  /** Suffix sums of `plannedSeconds`; `suffixSeconds[i]` is the time from lane `i` to the end. */
  readonly suffixSeconds: readonly number[];
}

interface RouteFailure {
  readonly status: 'ROUTE_MISSING' | 'ROUTE_STALE' | 'ROUTE_INVALID';
  readonly detail: string;
}

type RouteState = LoadedRoute | RouteFailure;

interface RouteProgress {
  readonly leg: EtaLeg;
  distanceM: number;
}

interface PositionMatch {
  /** Route distance of the matched point, connection gaps included. */
  readonly distanceM: number;
  readonly reprojected: boolean;
  readonly offRouteDistanceM: number | null;
}

type PositionResult =
  | { readonly kind: 'MATCH'; readonly match: PositionMatch }
  | { readonly kind: 'OFF_ROUTE' }
  | { readonly kind: 'INVALID' };

interface Projection {
  readonly fraction: number;
  readonly distanceM: number;
  readonly heightM: number;
}

interface Direction {
  readonly x: number;
  readonly z: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function boundedId(value: unknown, label: string): string {
  const id = text(value);
  requireContract(
    id.length <= ETA_LIMITS.idCodeUnits && id.trim() === id,
    `Invalid ${label} identity or code-unit length`,
  );
  return id;
}

function readPoint(value: unknown): EtaPoint {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract((pointFields as readonly string[]).includes(key), 'Unknown eta position field');
  for (const key of pointFields)
    requireContract(data[key] !== undefined, `Missing eta position field: ${key}`);
  return Object.freeze({
    x: number(data.x, -1_000_000, 1_000_000),
    y: number(data.y, -1_000_000, 1_000_000),
    z: number(data.z, -1_000_000, 1_000_000),
  });
}

function readObservation(value: unknown): EtaObservation {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (observationFields as readonly string[]).includes(key),
      'Unknown eta observation field',
    );
  for (const key of ['rideId', 'taxiId', 'tick', 'positionM', 'speedMps'] as const)
    requireContract(data[key] !== undefined, `Missing eta observation field: ${key}`);
  const heading =
    data.headingRad === undefined ? undefined : number(data.headingRad, -Math.PI, Math.PI);
  return Object.freeze({
    rideId: boundedId(data.rideId, 'eta ride'),
    taxiId: boundedId(data.taxiId, 'eta taxi'),
    tick: tick(data.tick),
    positionM: readPoint(data.positionM),
    // A NaN, infinite or negative speed is a caller contract violation, not a zero ETA.
    speedMps: number(data.speedMps, 0, 100),
    ...(heading === undefined ? {} : { headingRad: heading }),
  });
}

function readLifecycle(value: unknown): RideLifecycle {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as RideLifecycle).namespace === 'string' &&
      typeof (value as RideLifecycle).currentTick === 'function' &&
      typeof (value as RideLifecycle).ride === 'function',
    'Ride eta requires a real ride lifecycle',
  );
  const lifecycle = value as RideLifecycle;
  requireContract(lifecycle.namespace.trim().length > 0, 'Invalid ride eta namespace');
  return lifecycle;
}

function readGraph(value: unknown): LaneGraph {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as LaneGraph).mapId === 'string' &&
      typeof (value as LaneGraph).getLane === 'function' &&
      typeof (value as LaneGraph).getDirectedPath === 'function' &&
      typeof (value as LaneGraph).locateLane === 'function' &&
      typeof (value as LaneGraph).canTraverse === 'function',
    'Ride eta requires a real lane graph',
  );
  const graph = value as LaneGraph;
  requireContract(graph.mapId.trim().length > 0, 'Invalid ride eta lane graph');
  return graph;
}

function readPlanner(value: unknown): RoutePlanner {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as RoutePlanner).findRoute === 'function' &&
      typeof (value as RoutePlanner).getStats === 'function' &&
      typeof (value as RoutePlanner).graphVersion === 'string' &&
      typeof (value as RoutePlanner).costVersion === 'string',
    'Ride eta requires a real route planner',
  );
  const planner = value as RoutePlanner;
  requireContract(
    planner.graphVersion.trim().length > 0 && planner.costVersion.trim().length > 0,
    'Invalid ride eta route planner versions',
  );
  return planner;
}

function readInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  const result = number(value, minimum, maximum);
  requireContract(Number.isSafeInteger(result), `${label} must be an integer`);
  return result;
}

/** Route-input identity: any change after construction invalidates every stored route. */
function routeInputs(planner: RoutePlanner): string {
  const stats = planner.getStats();
  requireContract(
    typeof stats === 'object' &&
      stats !== null &&
      typeof stats.graphVersion === 'string' &&
      typeof stats.costVersion === 'string' &&
      typeof stats.blockedSignature === 'string' &&
      typeof stats.trafficSignature === 'string',
    'Route planner does not expose route-input signatures',
  );
  return [
    stats.graphVersion,
    stats.costVersion,
    stats.blockedSignature,
    stats.trafficSignature,
  ].join('|');
}

function projectOnSegment(position: EtaPoint, a: EtaPoint, b: EtaPoint): Projection {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    planar = dx * dx + dz * dz;
  let fraction = planar > 0 ? ((position.x - a.x) * dx + (position.z - a.z) * dz) / planar : 0;
  fraction = Math.min(1, Math.max(0, fraction));
  const x = a.x + fraction * dx,
    z = a.z + fraction * dz,
    y = a.y + fraction * (b.y - a.y);
  return Object.freeze({
    fraction,
    distanceM: Math.hypot(position.x - x, position.z - z),
    heightM: Math.abs(position.y - y),
  });
}

function directionBetween(a: EtaPoint, b: EtaPoint): Direction | null {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length = Math.hypot(dx, dz);
  return length > 0 ? Object.freeze({ x: dx / length, z: dz / length }) : null;
}

function oppositeDirections(left: Direction, right: Direction): boolean {
  return left.x * right.x + left.z * right.z < 0;
}

/** Lane-to-lane continuity is the same declared 033 edge the planner traversed. */
function isContinuous(
  graph: LaneGraph,
  routeLaneIds: readonly string[],
  access: RoadAccess,
): boolean {
  for (let index = 0; index + 1 < routeLaneIds.length; index += 1)
    if (!graph.canTraverse(routeLaneIds[index]!, routeLaneIds[index + 1]!, access)) return false;
  return true;
}

function zeroByReason(): Record<EtaUnavailableReason, number> {
  return {
    ROUTE_MISSING: 0,
    ROUTE_STALE: 0,
    ROUTE_INVALID: 0,
    POSITION_INVALID: 0,
    OFF_ROUTE: 0,
    SERVICE_BLOCKED: 0,
    STALE_TICK: 0,
    WRONG_RIDE: 0,
    FOREIGN_VEHICLE: 0,
    RIDE_TERMINAL: 0,
  };
}

export function createRideEta(options: unknown): RideEta {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract((optionFields as readonly string[]).includes(key), 'Unknown ride eta option');
  requireContract(data.lifecycle !== undefined, 'Ride eta requires a ride lifecycle');
  requireContract(data.graph !== undefined, 'Ride eta requires a lane graph');
  requireContract(data.planner !== undefined, 'Ride eta requires a route planner');
  const lifecycle = readLifecycle(data.lifecycle),
    graph = readGraph(data.graph),
    planner = readPlanner(data.planner),
    namespace = text(lifecycle.namespace),
    tickRateHz =
      data.tickRateHz === undefined
        ? ETA_DEFAULTS.tickRateHz
        : readInteger(data.tickRateHz, 1, 1_000, 'Ride eta tick rate'),
    offRouteToleranceM =
      data.offRouteToleranceM === undefined
        ? ETA_DEFAULTS.offRouteToleranceM
        : number(data.offRouteToleranceM, 0, 50),
    reprojectionLanes =
      data.reprojectionLanes === undefined
        ? ETA_DEFAULTS.reprojectionLanes
        : readInteger(
            data.reprojectionLanes,
            1,
            ETA_LIMITS.maximumReprojectionLanes,
            'Ride eta reprojection lanes',
          );
  requireContract(
    data.serviceState === undefined ||
      (typeof data.serviceState === 'string' &&
        (ETA_SERVICE_STATES as readonly string[]).includes(data.serviceState)),
    'Unsupported eta service state',
  );
  let serviceState: EtaServiceState =
    data.serviceState === undefined
      ? ETA_DEFAULTS.serviceState
      : (data.serviceState as EtaServiceState);
  const initialInputs = routeInputs(planner),
    routes = new Map<string, RouteState>(),
    progress = new Map<string, RouteProgress>(),
    snapshots = new Map<string, EtaSnapshot>();
  let lastTick = 0,
    observations = 0,
    estimated = 0,
    arrived = 0,
    unavailable = 0,
    reprojectedTotal = 0,
    routeLoads = 0,
    disposed = false;
  const byReason = zeroByReason();

  function assertLive(): void {
    if (disposed) throw new Error('Ride eta disposed');
  }

  function legFor(state: RideState): EtaLeg | null {
    if (state === 'TO_PICKUP' || state === 'PICKUP') return 'PICKUP';
    if (state === 'TO_DROPOFF' || state === 'DROPOFF') return 'TRIP';
    return null;
  }

  function routeIdsFor(ride: RideRecord, leg: EtaLeg): readonly string[] {
    return leg === 'PICKUP' ? ride.pickupRouteLaneIds : ride.tripRouteLaneIds;
  }

  function costFor(ride: RideRecord, leg: EtaLeg): number {
    return leg === 'PICKUP' ? ride.pickupCostSeconds : ride.tripCostSeconds;
  }

  /**
   * A stored route is still the real 041 route only if the planner, with its current inputs,
   * returns exactly the same lane sequence. The pickup route starts at its first lane by the 041
   * contract, so the origin is not invented; the trip route starts at the real pickup zone.
   */
  function matchesPlanner(
    ride: RideRecord,
    leg: EtaLeg,
    laneIds: readonly string[],
    expectedCostSeconds: number,
  ): boolean {
    const plan =
      leg === 'PICKUP'
        ? planner.findRoute({
            origin: laneIds[0]!,
            destination: ride.pickupZoneId,
            access: 'TAXI',
          })
        : planner.findRoute({
            origin: ride.pickupZoneId,
            destination: ride.dropoffZoneId,
            access: 'TAXI',
          });
    return (
      plan.status === 'READY' &&
      plan.path !== null &&
      plan.path.length === laneIds.length &&
      plan.path.every((laneId, index) => laneId === laneIds[index]) &&
      Number.isFinite(plan.costSeconds) &&
      Math.abs(plan.costSeconds - expectedCostSeconds) <= 1e-9
    );
  }

  function buildRoute(ride: RideRecord, leg: EtaLeg): RouteState {
    const laneIds = routeIdsFor(ride, leg),
      costSeconds = costFor(ride, leg);
    if (!Number.isFinite(costSeconds) || costSeconds < 0)
      return Object.freeze({
        status: 'ROUTE_INVALID',
        detail: 'Ride leg has no finite nonnegative 041 cost',
      });
    if (laneIds.length === 0)
      return Object.freeze({ status: 'ROUTE_MISSING', detail: 'Ride leg has no 041 route' });
    if (laneIds.length > ETA_LIMITS.routeLanes)
      return Object.freeze({
        status: 'ROUTE_INVALID',
        detail: 'Ride route exceeds the 041 path limit',
      });
    const geometries: {
        readonly laneId: string;
        readonly points: readonly EtaPoint[];
        readonly pointDistances: readonly number[];
        readonly lengthM: number;
        readonly costLengthM: number;
        readonly speedMps: number;
        readonly freeSeconds: number;
      }[] = [],
      occurrences = new Map<string, number[]>();
    for (let index = 0; index < laneIds.length; index += 1) {
      const laneId = laneIds[index]!,
        lane = graph.getLane(laneId, 'TAXI'),
        path = graph.getDirectedPath(laneId);
      if (lane === null || path === null || path.points.length < 2)
        return Object.freeze({
          status: 'ROUTE_MISSING',
          detail: `Route lane is not a real TAXI lane: ${laneId}`,
        });
      if (!Number.isFinite(path.lengthM) || path.lengthM <= 0)
        return Object.freeze({
          status: 'ROUTE_INVALID',
          detail: `Route lane length is invalid: ${laneId}`,
        });
      const points: EtaPoint[] = path.points.map((point) =>
          Object.freeze({ x: point.x, y: point.y, z: point.z }),
        ),
        pointDistances: number[] = [0];
      for (let pointIndex = 0; pointIndex + 1 < points.length; pointIndex += 1) {
        const a = points[pointIndex]!,
          b = points[pointIndex + 1]!;
        pointDistances.push(
          pointDistances[pointIndex]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
        );
      }
      const lengthM = pointDistances[pointDistances.length - 1] ?? 0,
        speedMps = Math.max(lane.speedLimitMps, ROUTE_COST_MODEL.minSpeedMps),
        occurrence = occurrences.get(laneId);
      if (occurrence === undefined) occurrences.set(laneId, [index]);
      else occurrence.push(index);
      geometries.push(
        Object.freeze({
          laneId,
          points: Object.freeze(points),
          pointDistances: Object.freeze(pointDistances),
          lengthM,
          costLengthM: path.lengthM,
          speedMps,
          freeSeconds: path.lengthM / speedMps,
        }),
      );
    }
    if (!isContinuous(graph, laneIds, 'TAXI'))
      return Object.freeze({
        status: 'ROUTE_STALE',
        detail: 'Stored route is not a connected 033 lane sequence',
      });
    if (!matchesPlanner(ride, leg, laneIds, costSeconds))
      return Object.freeze({
        status: 'ROUTE_STALE',
        detail: 'Stored route no longer matches the real 041 plan',
      });
    // One flat geometry with connection gaps keeps an intersection position on the route: a lane
    // polyline ends before the junction and the next one starts after it, so the gap is real travel.
    const lanes: LaneProfile[] = [],
      segments: RouteSegment[] = [];
    let distanceM = 0;
    for (let index = 0; index < geometries.length; index += 1) {
      const geometry = geometries[index]!,
        laneStartM = distanceM;
      for (let pointIndex = 0; pointIndex + 1 < geometry.points.length; pointIndex += 1) {
        const a = geometry.points[pointIndex]!,
          b = geometry.points[pointIndex + 1]!,
          lengthM = geometry.pointDistances[pointIndex + 1]! - geometry.pointDistances[pointIndex]!;
        segments.push(
          Object.freeze({ laneIndex: index, kind: 'LANE', a, b, startM: distanceM, lengthM }),
        );
        distanceM += lengthM;
      }
      lanes.push(
        Object.freeze({
          laneId: geometry.laneId,
          points: geometry.points,
          pointDistances: geometry.pointDistances,
          startM: laneStartM,
          lengthM: geometry.lengthM,
          costLengthM: geometry.costLengthM,
          speedMps: geometry.speedMps,
          freeSeconds: geometry.freeSeconds,
          plannedSeconds: 0,
        }),
      );
      const next = geometries[index + 1];
      if (next === undefined) continue;
      const a = geometry.points[geometry.points.length - 1]!,
        b = next.points[0]!,
        gapM = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (gapM <= 0) continue;
      segments.push(
        Object.freeze({
          laneIndex: index + 1,
          kind: 'CONNECTION',
          a,
          b,
          startM: distanceM,
          lengthM: gapM,
        }),
      );
      distanceM += gapM;
    }
    const laneDistanceM = lanes.reduce((sum, lane) => sum + lane.costLengthM, 0),
      freeSeconds = lanes.reduce((sum, lane) => sum + lane.freeSeconds, 0);
    if (!Number.isFinite(freeSeconds) || freeSeconds <= 0 || laneDistanceM <= 0)
      return Object.freeze({ status: 'ROUTE_INVALID', detail: 'Ride route has no planned time' });
    // The real 041 leg cost carries penalties and caller traffic; distribute it over the lanes so
    // the whole route reproduces the stored cost while every lane keeps its own speed limit. A
    // zero-cost route is the 041 origin==destination-lane case: it has a valid zero estimate.
    const scale = costSeconds / freeSeconds,
      planned = lanes.map((lane) =>
        Object.freeze({ ...lane, plannedSeconds: lane.freeSeconds * scale }),
      ),
      suffixSeconds = new Array<number>(planned.length + 1).fill(0);
    for (let index = planned.length - 1; index >= 0; index -= 1)
      suffixSeconds[index] = suffixSeconds[index + 1]! + planned[index]!.plannedSeconds;
    return Object.freeze({
      status: 'READY',
      laneIds: Object.freeze(laneIds.slice()),
      lanes: Object.freeze(planned),
      segments: Object.freeze(segments),
      occurrences,
      totalDistanceM: distanceM,
      costSeconds,
      plannedSpeedMps: costSeconds > 0 ? laneDistanceM / costSeconds : 0,
      suffixSeconds: Object.freeze(suffixSeconds),
    });
  }

  function loadRoute(ride: RideRecord, leg: EtaLeg): RouteState {
    if (routeInputs(planner) !== initialInputs)
      return Object.freeze({
        status: 'ROUTE_STALE',
        detail: 'Route planner inputs changed after the estimate session started',
      });
    const key = `${ride.rideId}:${leg}`,
      cached = routes.get(key);
    if (cached !== undefined) return cached;
    const built = buildRoute(ride, leg);
    routes.set(key, built);
    routeLoads += 1;
    return built;
  }

  /** Best projection of one position onto the polyline of one lane, in lane-local metres. */
  function projectLane(
    lane: LaneProfile,
    position: EtaPoint,
  ): { readonly distanceM: number; readonly offRouteM: number } | null {
    let best: {
      distanceM: number;
      offRouteM: number;
    } | null = null;
    for (let pointIndex = 0; pointIndex + 1 < lane.points.length; pointIndex += 1) {
      const a = lane.points[pointIndex]!,
        b = lane.points[pointIndex + 1]!,
        projection = projectOnSegment(position, a, b);
      if (projection.heightM > MAX_HEIGHT_DIFFERENCE_M) continue;
      const segmentLength = lane.pointDistances[pointIndex + 1]! - lane.pointDistances[pointIndex]!;
      const alongM = lane.pointDistances[pointIndex]! + projection.fraction * segmentLength;
      if (best === null || projection.distanceM < best.offRouteM)
        best = { distanceM: alongM, offRouteM: projection.distanceM };
    }
    return best === null ? null : Object.freeze(best);
  }

  /**
   * Current route segment for one certified distance. A gap between two lane polylines is a
   * `CONNECTION` to the next lane; it is reported at 0% of that next lane because the lane itself
   * has not started yet.
   */
  function segmentAt(
    route: LoadedRoute,
    distanceM: number,
  ): {
    readonly index: number;
    readonly kind: 'LANE' | 'CONNECTION';
    readonly fraction: number;
    readonly lane: LaneProfile;
  } {
    let index = 0;
    for (let laneIndex = 0; laneIndex < route.lanes.length; laneIndex += 1)
      if (route.lanes[laneIndex]!.startM <= distanceM) index = laneIndex;
    const lane = route.lanes[index]!,
      laneEndM = lane.startM + lane.lengthM;
    if (distanceM > laneEndM && index + 1 < route.lanes.length)
      return {
        index: index + 1,
        kind: 'CONNECTION',
        fraction: 0,
        lane: route.lanes[index + 1]!,
      };
    return {
      index,
      kind: 'LANE',
      fraction:
        lane.lengthM > 0 ? Math.min(1, Math.max(0, (distanceM - lane.startM) / lane.lengthM)) : 1,
      lane,
    };
  }

  /**
   * Forward-only repositioning.
   *
   * 1. The real 033 lane identity anchors the current segment: if that lane occurs in the route at
   *    or after the committed lane, the position is on-route and its projection is certified.
   * 2. Otherwise the position may only reproject onto route segments inside the configured forward
   *    window, within the lateral tolerance, and never onto an opposite-direction segment. This
   *    accepts an intersection gap or an adjacent same-direction lane without jumping backwards or
   *    onto a differently oriented segment.
   * 3. A real lane with no eligible route segment is `OFF_ROUTE`; no lane and no route segment is
   *    `POSITION_INVALID`.
   */
  function locatePosition(
    route: LoadedRoute,
    position: EtaPoint,
    headingRad: number | undefined,
    committedLaneIndex: number,
  ): PositionResult {
    const located = graph.locateLane({
        positionM: position,
        access: 'TAXI',
        ...(headingRad === undefined ? {} : { headingRad }),
        maxHeightDifferenceM: MAX_HEIGHT_DIFFERENCE_M,
      }),
      actualLaneId = located?.lane.id ?? null,
      actualPath = actualLaneId === null ? null : graph.getDirectedPath(actualLaneId),
      actualDirection =
        actualPath === null
          ? null
          : directionBetween(
              Object.freeze({
                x: actualPath.points[0]!.x,
                y: actualPath.points[0]!.y,
                z: actualPath.points[0]!.z,
              }),
              Object.freeze({
                x: actualPath.points[actualPath.points.length - 1]!.x,
                y: actualPath.points[actualPath.points.length - 1]!.y,
                z: actualPath.points[actualPath.points.length - 1]!.z,
              }),
            );
    if (actualLaneId !== null) {
      const occurrence = (route.occurrences.get(actualLaneId) ?? []).find(
        (index) => index >= committedLaneIndex,
      );
      if (occurrence !== undefined) {
        const lane = route.lanes[occurrence]!,
          projected = projectLane(lane, position);
        if (projected !== null)
          return Object.freeze({
            kind: 'MATCH' as const,
            match: Object.freeze({
              distanceM: lane.startM + projected.distanceM,
              reprojected: false,
              offRouteDistanceM: null,
            }),
          });
      }
    }
    const firstIndex = Math.min(committedLaneIndex, route.lanes.length - 1),
      lastIndex = Math.min(route.lanes.length - 1, committedLaneIndex + reprojectionLanes);
    let best: {
      distanceM: number;
      offRouteM: number;
    } | null = null;
    for (const segment of route.segments) {
      if (segment.laneIndex < firstIndex || segment.laneIndex > lastIndex) continue;
      const projection = projectOnSegment(position, segment.a, segment.b);
      if (projection.heightM > MAX_HEIGHT_DIFFERENCE_M) continue;
      if (projection.distanceM > offRouteToleranceM) continue;
      const direction = directionBetween(segment.a, segment.b);
      if (
        actualDirection !== null &&
        direction !== null &&
        oppositeDirections(actualDirection, direction)
      )
        continue;
      if (
        best === null ||
        projection.distanceM < best.offRouteM ||
        (projection.distanceM === best.offRouteM && segment.startM < best.distanceM)
      )
        best = {
          distanceM: segment.startM + projection.fraction * segment.lengthM,
          offRouteM: projection.distanceM,
        };
    }
    if (best !== null)
      return Object.freeze({
        kind: 'MATCH' as const,
        match: Object.freeze({
          distanceM: best.distanceM,
          reprojected: true,
          offRouteDistanceM: best.offRouteM,
        }),
      });
    return actualLaneId === null
      ? Object.freeze({ kind: 'INVALID' as const })
      : Object.freeze({ kind: 'OFF_ROUTE' as const });
  }

  function baseSnapshot(observation: EtaObservation, state: RideState | null): EtaSnapshot {
    return {
      status: 'UNAVAILABLE',
      reason: null,
      tick: observation.tick,
      rideId: observation.rideId,
      taxiId: observation.taxiId,
      state,
      leg: null,
      serviceState,
      routeLaneIds: null,
      laneCount: null,
      totalDistanceM: null,
      traveledDistanceM: null,
      remainingDistanceM: null,
      progressFraction: null,
      segmentIndex: null,
      segmentLaneId: null,
      segmentKind: null,
      segmentProgressFraction: null,
      plannedSpeedMps: null,
      speedBasisMps: null,
      observedSpeedMps: observation.speedMps,
      plannedRemainingSeconds: null,
      etaSeconds: null,
      etaMinSeconds: null,
      etaMaxSeconds: null,
      offRouteDistanceM: null,
      reprojected: false,
      stale: false,
    };
  }

  function countAndStore(snapshot: EtaSnapshot): EtaSnapshot {
    if (snapshot.reprojected) reprojectedTotal += 1;
    if (snapshot.status === 'ESTIMATED') estimated += 1;
    else if (snapshot.status === 'ARRIVED') arrived += 1;
    else {
      unavailable += 1;
      if (snapshot.reason !== null) byReason[snapshot.reason] += 1;
    }
    // A terminal ride can never advance again, so its route geometry and progress are released
    // immediately; only the bounded estimate record is retained for the fleet panel.
    if (
      snapshot.state === 'COMPLETED' ||
      snapshot.state === 'FAILED' ||
      snapshot.state === 'CANCELLED'
    ) {
      progress.delete(snapshot.rideId);
      routes.delete(`${snapshot.rideId}:PICKUP`);
      routes.delete(`${snapshot.rideId}:TRIP`);
    }
    snapshots.set(snapshot.rideId, snapshot);
    while (snapshots.size > ETA_LIMITS.rides) {
      const oldest = [...snapshots.values()]
        .filter((entry) => entry.rideId !== snapshot.rideId)
        .sort((left, right) => left.tick - right.tick || compareText(left.rideId, right.rideId))[0];
      if (oldest === undefined) break;
      snapshots.delete(oldest.rideId);
    }
    return snapshot;
  }

  function failed(
    observation: EtaObservation,
    ride: RideRecord | null,
    state: RideState | null,
    reason: EtaUnavailableReason,
    extra: Partial<EtaSnapshot> = {},
  ): EtaSnapshot {
    return countAndStore(
      Object.freeze({
        ...baseSnapshot(observation, state),
        leg: ride === null ? null : legFor(ride.state),
        reason,
        stale: reason === 'ROUTE_STALE',
        ...extra,
      }),
    );
  }

  function routeGeometry(route: LoadedRoute, committed: number): Partial<EtaSnapshot> {
    return {
      routeLaneIds: route.laneIds,
      laneCount: route.laneIds.length,
      totalDistanceM: route.totalDistanceM,
      traveledDistanceM: committed,
      remainingDistanceM: Math.max(0, route.totalDistanceM - committed),
      progressFraction: route.totalDistanceM > 0 ? committed / route.totalDistanceM : 1,
      plannedSpeedMps: route.plannedSpeedMps,
    };
  }

  function observe(input: unknown): EtaSnapshot {
    assertLive();
    const observation = readObservation(input),
      lifecycleTick = lifecycle.currentTick();
    observations += 1;
    if (observation.tick < lastTick || observation.tick < lifecycleTick)
      return failed(observation, null, null, 'STALE_TICK');
    lastTick = observation.tick;
    const ride = lifecycle.ride(observation.rideId);
    if (ride === undefined) return failed(observation, null, null, 'WRONG_RIDE');
    if (ride.taxiId !== observation.taxiId)
      return failed(observation, ride, ride.state, 'FOREIGN_VEHICLE');
    if (ride.terminal) return failed(observation, ride, ride.state, 'RIDE_TERMINAL');
    const leg = legFor(ride.state);
    if (leg === null) return failed(observation, ride, ride.state, 'RIDE_TERMINAL');

    // The lifecycle already certifies arrival; a missing route cannot turn arrival into a zero-time
    // estimate of a trip that has not happened.
    if (ride.state === 'PICKUP' || ride.state === 'DROPOFF')
      return countAndStore(
        Object.freeze({
          ...baseSnapshot(observation, ride.state),
          status: 'ARRIVED' as const,
          leg,
          remainingDistanceM: 0,
          progressFraction: 1,
          plannedRemainingSeconds: 0,
          etaSeconds: 0,
          etaMinSeconds: 0,
          etaMaxSeconds: 0,
        }),
      );

    const route = loadRoute(ride, leg);
    if (route.status !== 'READY') return failed(observation, ride, ride.state, route.status);
    const previous = progress.get(ride.rideId),
      committed = previous !== undefined && previous.leg === leg ? previous.distanceM : 0,
      containing = route.lanes.findIndex((lane) => committed <= lane.startM + lane.lengthM),
      committedLaneIndex = containing === -1 ? route.lanes.length - 1 : Math.max(0, containing),
      located = locatePosition(
        route,
        observation.positionM,
        observation.headingRad,
        committedLaneIndex,
      );
    if (located.kind !== 'MATCH')
      return failed(
        observation,
        ride,
        ride.state,
        located.kind === 'INVALID' ? 'POSITION_INVALID' : 'OFF_ROUTE',
        {
          leg,
          ...routeGeometry(route, committed),
          ...(located.kind === 'OFF_ROUTE' ? { reprojected: true } : {}),
        },
      );
    const match = located.match,
      distanceM = Math.min(route.totalDistanceM, Math.max(committed, match.distanceM)),
      segment = segmentAt(route, distanceM),
      remainingDistanceM = Math.max(0, route.totalDistanceM - distanceM),
      plannedRemainingSeconds =
        segment.kind === 'CONNECTION'
          ? route.suffixSeconds[segment.index]!
          : (1 - segment.fraction) * segment.lane.plannedSeconds +
            route.suffixSeconds[segment.index + 1]!;
    progress.set(ride.rideId, { leg, distanceM });
    if (serviceState === 'BLOCKED')
      return failed(observation, ride, ride.state, 'SERVICE_BLOCKED', {
        leg,
        ...routeGeometry(route, distanceM),
        segmentIndex: segment.index,
        segmentLaneId: segment.lane.laneId,
        segmentKind: segment.kind,
        segmentProgressFraction: segment.fraction,
        plannedRemainingSeconds,
        offRouteDistanceM: match.offRouteDistanceM,
        reprojected: match.reprojected,
      });
    const uncertainty = ETA_UNCERTAINTY[serviceState];
    if (uncertainty === null) throw new Error('Eta service state has no uncertainty');
    const arrivedNow = remainingDistanceM <= 0;
    return countAndStore(
      Object.freeze({
        ...baseSnapshot(observation, ride.state),
        status: arrivedNow ? ('ARRIVED' as const) : ('ESTIMATED' as const),
        leg,
        ...routeGeometry(route, distanceM),
        segmentIndex: segment.index,
        segmentLaneId: segment.lane.laneId,
        segmentKind: segment.kind,
        segmentProgressFraction: segment.fraction,
        plannedSpeedMps: route.plannedSpeedMps,
        speedBasisMps: route.plannedSpeedMps * uncertainty.nominalSpeedFactor,
        plannedRemainingSeconds,
        etaSeconds: plannedRemainingSeconds / uncertainty.nominalSpeedFactor,
        etaMinSeconds: plannedRemainingSeconds / uncertainty.maxSpeedFactor,
        etaMaxSeconds: plannedRemainingSeconds / uncertainty.minSpeedFactor,
        offRouteDistanceM: match.offRouteDistanceM,
        reprojected: match.reprojected,
      }),
    );
  }

  function zeroStats(): RideEtaStats {
    return Object.freeze({
      version: RIDE_ETA_VERSION,
      namespace,
      tick: 0,
      observations: 0,
      estimated: 0,
      arrived: 0,
      unavailable: 0,
      reprojected: 0,
      routeLoads: 0,
      byReason: Object.freeze(zeroByReason()),
      disposed: true,
    });
  }

  return Object.freeze({
    namespace,
    tickRateHz,
    offRouteToleranceM,
    reprojectionLanes,
    get serviceState(): EtaServiceState {
      return serviceState;
    },
    currentTick: () => lastTick,
    setServiceState(value: unknown): EtaServiceState {
      assertLive();
      requireContract(
        typeof value === 'string' && (ETA_SERVICE_STATES as readonly string[]).includes(value),
        'Unsupported eta service state',
      );
      serviceState = value as EtaServiceState;
      return serviceState;
    },
    observe,
    estimate(rideId: string): EtaSnapshot | undefined {
      return disposed ? undefined : snapshots.get(rideId);
    },
    estimates(): readonly EtaSnapshot[] {
      if (disposed) return Object.freeze([]);
      return Object.freeze(
        [...snapshots.values()].sort((left, right) => compareText(left.rideId, right.rideId)),
      );
    },
    stats(): RideEtaStats {
      if (disposed) return zeroStats();
      return Object.freeze({
        version: RIDE_ETA_VERSION,
        namespace,
        tick: lastTick,
        observations,
        estimated,
        arrived,
        unavailable,
        reprojected: reprojectedTotal,
        routeLoads,
        byReason: Object.freeze({ ...byReason }),
        disposed: false,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      routes.clear();
      progress.clear();
      snapshots.clear();
      lastTick = 0;
      observations = 0;
      estimated = 0;
      arrived = 0;
      unavailable = 0;
      reprojectedTotal = 0;
      routeLoads = 0;
      for (const reason of ETA_UNAVAILABLE_REASONS) byReason[reason] = 0;
    },
  });
}

export const ETA_SNAPSHOT_FIELDS = Object.freeze([
  'status',
  'reason',
  'tick',
  'rideId',
  'taxiId',
  'state',
  'leg',
  'serviceState',
  'routeLaneIds',
  'laneCount',
  'totalDistanceM',
  'traveledDistanceM',
  'remainingDistanceM',
  'progressFraction',
  'segmentIndex',
  'segmentLaneId',
  'segmentKind',
  'segmentProgressFraction',
  'plannedSpeedMps',
  'speedBasisMps',
  'observedSpeedMps',
  'plannedRemainingSeconds',
  'etaSeconds',
  'etaMinSeconds',
  'etaMaxSeconds',
  'offRouteDistanceM',
  'reprojected',
  'stale',
] as const);
