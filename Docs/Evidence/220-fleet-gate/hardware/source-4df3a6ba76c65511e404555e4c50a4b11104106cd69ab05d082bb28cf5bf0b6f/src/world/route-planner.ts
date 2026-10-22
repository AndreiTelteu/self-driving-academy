import type { RouteTask, RouteVersions, ScheduledRouteRequest } from '../simulation';
import { SCHEDULING_LIMITS } from '../simulation';
import type { Vector3 } from '../vehicles';
import type { LaneGraph } from './lane-graph';
import type { RoadAccess, RoadMap, ServiceZone } from './schema';

/**
 * Deterministic, documented and versioned cost model.
 *
 * One traversed lane costs `lengthM / clamp(speedLimitMps, minSpeedMps, ...)` seconds, read from the
 * real directed lane geometry (metres) and the map speed limit. Every connection adds an explicit
 * penalty: a declared TURN costs `turnPenaltyS`, a plain CONTINUATION costs `continuationPenaltyS`.
 * Optional traffic weights are caller inputs (`trafficSeconds`), never hidden state. Bumping the
 * `version` (or supplying new traffic weights / a new blocked set) invalidates the route cache.
 */
export const ROUTE_COST_MODEL = Object.freeze({
  version: 'route-cost-v1',
  /** Lower speed floor so a malformed zero limit cannot divide by zero. */
  minSpeedMps: 1,
  /** Documented penalty for a CONTINUATION connection (no declared Movement). */
  continuationPenaltyS: 0.5,
  /** Documented penalty for a declared TURN Movement at an intersection. */
  turnPenaltyS: 2,
});

/**
 * Frozen planner limits. `cacheEntries`, `pathLanes` and `idCodeUnits` mirror the PBI219 scheduling
 * contract so the route cache and stored paths cannot drift; `maxExpansions` bounds a single search.
 */
export const ROUTE_PLANNER_LIMITS = Object.freeze({
  /** Bounded A* expansions before BUDGET_EXHAUSTED; a pathological graph still terminates. */
  maxExpansions: 16384,
  /** Bounded route cache entries, identical to SCHEDULING_LIMITS.routeCache. */
  cacheEntries: SCHEDULING_LIMITS.routeCache,
  /** Bounded lanes per stored path, identical to SCHEDULING_LIMITS.pathLanes. */
  pathLanes: SCHEDULING_LIMITS.pathLanes,
  /** Bounded UTF-16 code units per stored lane id. */
  idCodeUnits: 256,
});

export type RouteStatus =
  | 'READY'
  | 'BLOCKED'
  | 'UNREACHABLE'
  | 'ORIGIN_UNKNOWN'
  | 'DESTINATION_UNKNOWN'
  | 'SERVICE_ACCESS_MISMATCH'
  | 'BUDGET_EXHAUSTED';

export type RouteDestinationKind = 'LANE' | 'ZONE';

export interface RouteQuery {
  readonly origin: string;
  readonly destination: string;
  readonly access: RoadAccess;
}

export interface RouteDestination {
  readonly kind: RouteDestinationKind;
  readonly laneId: string;
}

export interface RoutePlan {
  readonly status: RouteStatus;
  /** Lane id sequence over directed edges, or null when no route exists. */
  readonly path: readonly string[] | null;
  /** Summed cost model seconds of the path; Infinity when there is no path. */
  readonly costSeconds: number;
  /** A* node expansions performed for this plan (stored on a cache hit). */
  readonly expansions: number;
  /** True when the plan was served from the bounded cache. */
  readonly cached: boolean;
  readonly originLaneId: string | null;
  readonly destinationLaneId: string | null;
  readonly destinationKind: RouteDestinationKind | null;
}

export interface RoutePlannerStats {
  readonly graphVersion: string;
  readonly costVersion: string;
  readonly blockedSignature: string;
  readonly trafficSignature: string;
  readonly cacheEntries: number;
  readonly cacheLimit: number;
  readonly cachePathCodeUnits: number;
  readonly invalidations: number;
  readonly expansions: number;
  readonly searches: number;
  readonly hits: number;
  readonly misses: number;
  readonly maxExpansions: number;
  readonly disposed: boolean;
}

export interface RoutePlannerOptions {
  /** The PBI033 directed lane graph; only its directed, access-filtered edges are traversed. */
  readonly graph: LaneGraph;
  /** The validated map owning the same mapId; supplies speed limits and serviceZones. */
  readonly map: RoadMap;
  readonly graphVersion: string;
  readonly costVersion: string;
  /** Runtime blocked lanes (input, never hidden state). */
  readonly blocked?: readonly string[];
  /** Optional traffic seconds added per lane (input, never hidden state). */
  readonly trafficSeconds?: ReadonlyMap<string, number>;
  /** Bounded override for a single search; defaults to ROUTE_PLANNER_LIMITS.maxExpansions. */
  readonly maxExpansions?: number;
}

export interface RoutePlanner {
  readonly graphVersion: string;
  readonly costVersion: string;
  findRoute(query: RouteQuery): RoutePlan;
  /** PBI219 port. The 219 request destination is a lane id; resolve a zone via resolveDestination. */
  createRouteTask(request: ScheduledRouteRequest): RouteTask;
  resolveDestination(id: string, access: RoadAccess): RouteDestination | null;
  setBlocked(blocked: readonly string[]): void;
  setTrafficSeconds(traffic: ReadonlyMap<string, number>): void;
  setVersions(versions: RouteVersions): void;
  invalidate(): void;
  getStats(): RoutePlannerStats;
  dispose(): void;
}

interface PlanData {
  readonly status: RouteStatus;
  readonly path: readonly string[] | null;
  readonly costSeconds: number;
  readonly expansions: number;
  readonly originLaneId: string | null;
  readonly destinationLaneId: string | null;
  readonly destinationKind: RouteDestinationKind | null;
}

interface CacheEntry {
  readonly data: PlanData;
  lastUsed: number;
}

interface LaneInfo {
  readonly lengthM: number;
  readonly speedMps: number;
  readonly start: Vector3;
  readonly end: Vector3;
}

interface HeapNode {
  readonly lane: string;
  readonly g: number;
  readonly f: number;
}

interface SearchHandle {
  readonly expansions: number;
  readonly finished: boolean;
  readonly status: RouteStatus;
  readonly path: readonly string[] | null;
  readonly costSeconds: number;
  step(budget: number): boolean;
}

const MAX_ID_LENGTH = 256;

function text(value: unknown, maximum = MAX_ID_LENGTH): string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > maximum ||
    value.trim() !== value
  )
    throw new Error('Invalid route identifier');
  return value;
}

function readAccess(value: unknown): RoadAccess {
  if (value !== 'TAXI' && value !== 'CIVIL') throw new Error('Unknown road access class');
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error('Invalid route planner limit');
  return value as number;
}

/** Stable UTF-16 FNV-1a over the sorted, de-duplicated values; independent of insertion order. */
function signature(values: Iterable<string>): string {
  const sorted = [...new Set(values)].sort();
  let hash = 2166136261;
  for (const value of sorted) {
    for (let index = 0; index < value.length; index++)
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    hash = Math.imul(hash ^ 0x1f, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function createMinHeap() {
  const items: HeapNode[] = [];
  const before = (a: HeapNode, b: HeapNode): boolean =>
    a.f !== b.f ? a.f < b.f : a.lane !== b.lane ? a.lane < b.lane : a.g < b.g;
  return {
    push(node: HeapNode) {
      items.push(node);
      let index = items.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (!before(items[index], items[parent])) break;
        const swap = items[index];
        items[index] = items[parent];
        items[parent] = swap;
        index = parent;
      }
    },
    pop(): HeapNode | undefined {
      if (items.length === 0) return undefined;
      const top = items[0];
      const last = items.pop() as HeapNode;
      if (items.length > 0) {
        items[0] = last;
        let index = 0;
        for (;;) {
          const left = index * 2 + 1,
            right = left + 1;
          let smallest = index;
          if (left < items.length && before(items[left], items[smallest])) smallest = left;
          if (right < items.length && before(items[right], items[smallest])) smallest = right;
          if (smallest === index) break;
          const swap = items[index];
          items[index] = items[smallest];
          items[smallest] = swap;
          index = smallest;
        }
      }
      return top;
    },
  };
}

/**
 * Directed A* over the PBI033 lane graph. Only `getConnections` (declared successors with TURN or
 * CONTINUATION kind) are traversed, filtered by access at both ends; lateral neighbours are never
 * edges and reverse edges are never invented. The straight-line/max-speed heuristic is admissible;
 * nodes may be reopened, so cost optimality does not require a consistent heuristic. Expansions are
 * bounded, so an unreachable or pathological graph terminates with an explicit status.
 */
export function createRoutePlanner(input: RoutePlannerOptions): RoutePlanner {
  if (!input || typeof input !== 'object') throw new Error('Invalid route planner options');
  const graph = input.graph,
    map = input.map;
  if (!graph || typeof graph.getLane !== 'function' || typeof graph.getConnections !== 'function')
    throw new Error('Invalid route planner graph');
  if (!map || typeof map.mapId !== 'string' || !Array.isArray(map.lanes))
    throw new Error('Invalid route planner map');
  if (map.mapId !== graph.mapId) throw new Error('Route planner map/graph id mismatch');
  let graphVersion = text(input.graphVersion, 128),
    costVersion = text(input.costVersion, 128);
  const maxExpansions = boundedInteger(
    input.maxExpansions ?? ROUTE_PLANNER_LIMITS.maxExpansions,
    1,
    65536,
  );
  const zones = new Map<string, ServiceZone>();
  for (const zone of map.serviceZones) zones.set(zone.id, zone);
  // Admissible speed ceiling: any traversed metre costs at least 1/vmax seconds.
  let vmax: number = ROUTE_COST_MODEL.minSpeedMps;
  for (const lane of map.lanes) vmax = Math.max(vmax, lane.speedLimitMps);

  let blocked = new Set<string>();
  for (const lane of input.blocked ?? []) blocked.add(text(lane));
  let blockedSignature = signature(blocked);
  let traffic = new Map<string, number>();
  if (input.trafficSeconds) {
    for (const [lane, seconds] of input.trafficSeconds) {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0)
        throw new Error('Invalid traffic weight');
      traffic.set(text(lane), seconds);
    }
  }
  let trafficSignature = signature([...traffic].map(([lane, seconds]) => `${lane}=${seconds}`));
  const cache = new Map<string, CacheEntry>();
  const infoCache = new Map<string, LaneInfo | null>();
  let usage = 0,
    invalidations = 0,
    expansionsTotal = 0,
    searches = 0,
    hits = 0,
    misses = 0,
    disposed = false;

  function assertAvailable(): void {
    if (disposed) throw new Error('Route planner disposed');
  }

  function laneInfo(id: string): LaneInfo | null {
    const known = infoCache.get(id);
    if (known !== undefined) return known;
    const path = graph.getDirectedPath(id),
      lane = graph.getLane(id);
    const info: LaneInfo | null =
      path && lane
        ? Object.freeze({
            lengthM: path.lengthM,
            speedMps: lane.speedLimitMps,
            start: path.points[0],
            end: path.points[path.points.length - 1],
          })
        : null;
    infoCache.set(id, info);
    return info;
  }

  function laneCost(id: string): number {
    const info = laneInfo(id),
      extra = traffic.get(id) ?? 0;
    if (!info) return ROUTE_COST_MODEL.minSpeedMps + extra;
    return info.lengthM / Math.max(info.speedMps, ROUTE_COST_MODEL.minSpeedMps) + extra;
  }

  function heuristic(id: string, destination: LaneInfo | null): number {
    const info = laneInfo(id);
    if (!info || !destination) return 0;
    return (
      Math.hypot(
        info.end.x - destination.start.x,
        info.end.y - destination.start.y,
        info.end.z - destination.start.z,
      ) / vmax
    );
  }

  function beginSearch(originLaneId: string, destinationLaneId: string, access: RoadAccess) {
    const destinationInfo = laneInfo(destinationLaneId);
    const gScore = new Map<string, number>([[originLaneId, 0]]);
    const cameFrom = new Map<string, string>();
    const heap = createMinHeap();
    let expansions = 0,
      finished = false;
    let status: RouteStatus = 'UNREACHABLE';
    let path: readonly string[] | null = null;
    let costSeconds = Infinity;
    heap.push({ lane: originLaneId, g: 0, f: heuristic(originLaneId, destinationInfo) });
    const reconstruct = (laneId: string): readonly string[] => {
      const reversed = [laneId];
      let current = laneId;
      while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        reversed.push(current);
      }
      reversed.reverse();
      return Object.freeze(reversed);
    };
    const handle: SearchHandle = {
      get expansions() {
        return expansions;
      },
      get finished() {
        return finished;
      },
      get status() {
        return status;
      },
      get path() {
        return path;
      },
      get costSeconds() {
        return costSeconds;
      },
      step(budget: number): boolean {
        while (!finished && expansions < budget) {
          const node = heap.pop();
          if (!node) {
            finished = true;
            status = 'UNREACHABLE';
            break;
          }
          if (node.g > (gScore.get(node.lane) ?? Infinity)) continue;
          expansions++;
          if (node.lane === destinationLaneId) {
            finished = true;
            status = 'READY';
            path = reconstruct(node.lane);
            costSeconds = node.g;
            break;
          }
          for (const connection of graph.getConnections(node.lane, access)) {
            const next = connection.toLaneId;
            if (blocked.has(next)) continue;
            const penalty =
              connection.kind === 'TURN'
                ? ROUTE_COST_MODEL.turnPenaltyS
                : ROUTE_COST_MODEL.continuationPenaltyS;
            const tentative = node.g + laneCost(next) + penalty;
            if (tentative < (gScore.get(next) ?? Infinity)) {
              gScore.set(next, tentative);
              cameFrom.set(next, node.lane);
              heap.push({
                lane: next,
                g: tentative,
                f: tentative + heuristic(next, destinationInfo),
              });
            }
          }
        }
        return finished;
      },
    };
    return handle;
  }

  function resolve(
    id: string,
    access: RoadAccess,
  ): { kind: 'LANE' | 'ZONE'; laneId: string } | { kind: 'MISMATCH' } | { kind: 'UNKNOWN' } {
    const lane = graph.getLane(id);
    if (lane)
      return lane.access.includes(access) ? { kind: 'LANE', laneId: id } : { kind: 'UNKNOWN' };
    const zone = zones.get(id);
    if (!zone) return { kind: 'UNKNOWN' };
    if (!zone.access.includes(access) || !graph.getLane(zone.laneId, access))
      return { kind: 'MISMATCH' };
    return { kind: 'ZONE', laneId: zone.laneId };
  }

  function cacheKey(origin: string, destination: string, access: RoadAccess): string {
    return JSON.stringify([
      graphVersion,
      costVersion,
      blockedSignature,
      trafficSignature,
      origin,
      destination,
      access,
    ]);
  }

  function cacheable(data: PlanData): boolean {
    if (data.status === 'BUDGET_EXHAUSTED') return false;
    if (data.path === null) return true;
    return (
      data.path.length > 0 &&
      data.path.length <= ROUTE_PLANNER_LIMITS.pathLanes &&
      data.path.every((lane) => lane.length <= ROUTE_PLANNER_LIMITS.idCodeUnits)
    );
  }

  function remember(key: string, data: PlanData): void {
    if (!cacheable(data)) return;
    if (!cache.has(key) && cache.size >= ROUTE_PLANNER_LIMITS.cacheEntries) {
      const oldest = [...cache.entries()].sort(
        (a, b) => a[1].lastUsed - b[1].lastUsed || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
      )[0];
      cache.delete(oldest[0]);
    }
    cache.set(key, { data, lastUsed: ++usage });
  }

  function freezePlan(data: PlanData, cached: boolean): RoutePlan {
    return Object.freeze({ ...data, cached });
  }

  function blockedPlan(
    status: Exclude<RouteStatus, 'READY'>,
    originLaneId: string | null,
    destinationLaneId: string | null = null,
    destinationKind: RouteDestinationKind | null = null,
  ): PlanData {
    return {
      status,
      path: null,
      costSeconds: Infinity,
      expansions: 0,
      originLaneId,
      destinationLaneId,
      destinationKind,
    };
  }

  function clearCache(): void {
    cache.clear();
    invalidations++;
  }

  function findRoute(query: RouteQuery): RoutePlan {
    assertAvailable();
    const originId = text(query.origin),
      destinationId = text(query.destination),
      access = readAccess(query.access);
    searches++;
    const key = cacheKey(originId, destinationId, access);
    const cached = cache.get(key);
    if (cached) {
      hits++;
      cached.lastUsed = ++usage;
      return freezePlan(cached.data, true);
    }
    misses++;
    const origin = resolve(originId, access);
    let data: PlanData;
    if (origin.kind === 'UNKNOWN' || origin.kind === 'MISMATCH')
      data = blockedPlan('ORIGIN_UNKNOWN', null);
    else if (blocked.has(origin.laneId))
      data = blockedPlan('BLOCKED', origin.laneId, null, origin.kind);
    else {
      const destination = resolve(destinationId, access);
      if (destination.kind === 'UNKNOWN')
        data = blockedPlan('DESTINATION_UNKNOWN', origin.laneId, null);
      else if (destination.kind === 'MISMATCH')
        data = blockedPlan('SERVICE_ACCESS_MISMATCH', origin.laneId, null);
      else if (blocked.has(destination.laneId))
        data = blockedPlan('BLOCKED', origin.laneId, destination.laneId, destination.kind);
      else {
        const search = beginSearch(origin.laneId, destination.laneId, access);
        search.step(maxExpansions);
        expansionsTotal += search.expansions;
        if (!search.finished)
          data = {
            status: 'BUDGET_EXHAUSTED',
            path: null,
            costSeconds: Infinity,
            expansions: search.expansions,
            originLaneId: origin.laneId,
            destinationLaneId: destination.laneId,
            destinationKind: destination.kind,
          };
        else
          data = {
            status: search.status,
            path: search.path,
            costSeconds: search.costSeconds,
            expansions: search.expansions,
            originLaneId: origin.laneId,
            destinationLaneId: destination.laneId,
            destinationKind: destination.kind,
          };
      }
    }
    remember(key, data);
    return freezePlan(data, false);
  }

  function createRouteTask(request: ScheduledRouteRequest): RouteTask {
    assertAvailable();
    const access = readAccess(request.access),
      originId = text(request.origin),
      destinationId = text(request.destination);
    let search: SearchHandle | null = null,
      counted = false,
      taskDisposed = false,
      outcome: { readonly done: boolean; readonly path: readonly string[] | null } | null = null;
    if (request.graphVersion !== graphVersion || request.costVersion !== costVersion)
      outcome = { done: true, path: null };
    else {
      const originLane = graph.getLane(originId, access),
        // The PBI219 RouteTask path is a lane sequence whose last id must equal request.destination,
        // so this port accepts lane ids only; resolve a service zone first.
        destinationLane = graph.getLane(destinationId, access);
      if (!originLane || !destinationLane) outcome = { done: true, path: null };
      else if (blocked.has(originLane.id) || blocked.has(destinationLane.id))
        outcome = { done: true, path: null };
      else search = beginSearch(originLane.id, destinationLane.id, access);
    }
    return Object.freeze({
      step(budget: { readonly tick: number; readonly maxExpansions: number }) {
        if (taskDisposed) throw new Error('Route task disposed');
        if (!Number.isSafeInteger(budget.maxExpansions) || budget.maxExpansions < 1)
          throw new Error('Invalid route task budget');
        if (outcome) return outcome;
        const remaining = maxExpansions - (search?.expansions ?? 0);
        if (remaining <= 0) {
          outcome = { done: true, path: null };
          return outcome;
        }
        search!.step(Math.min(budget.maxExpansions, remaining));
        if (!search!.finished) return { done: false, path: null };
        if (!counted) {
          expansionsTotal += search!.expansions;
          counted = true;
        }
        outcome =
          search!.status === 'READY'
            ? { done: true, path: search!.path }
            : { done: true, path: null };
        return outcome;
      },
      dispose() {
        taskDisposed = true;
        search = null;
        outcome = { done: true, path: null };
      },
    });
  }

  return Object.freeze({
    get graphVersion() {
      return graphVersion;
    },
    get costVersion() {
      return costVersion;
    },
    findRoute,
    createRouteTask,
    resolveDestination(id: string, access: RoadAccess): RouteDestination | null {
      assertAvailable();
      const resolved = resolve(text(id), readAccess(access));
      return resolved.kind === 'LANE' || resolved.kind === 'ZONE'
        ? Object.freeze({ kind: resolved.kind, laneId: resolved.laneId })
        : null;
    },
    setBlocked(inputBlocked: readonly string[]): void {
      assertAvailable();
      if (!Array.isArray(inputBlocked)) throw new Error('Invalid blocked lane set');
      const next = new Set<string>();
      for (const lane of inputBlocked) next.add(text(lane));
      const nextSignature = signature(next);
      if (nextSignature === blockedSignature) return;
      blocked = next;
      blockedSignature = nextSignature;
      clearCache();
    },
    setTrafficSeconds(inputTraffic: ReadonlyMap<string, number>): void {
      assertAvailable();
      if (!(inputTraffic instanceof Map)) throw new Error('Invalid traffic weight map');
      const next = new Map<string, number>();
      for (const [lane, seconds] of inputTraffic) {
        if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0)
          throw new Error('Invalid traffic weight');
        next.set(text(lane), seconds);
      }
      const nextSignature = signature([...next].map(([lane, seconds]) => `${lane}=${seconds}`));
      if (nextSignature === trafficSignature) return;
      traffic = next;
      trafficSignature = nextSignature;
      clearCache();
    },
    setVersions(versions: RouteVersions): void {
      assertAvailable();
      const nextGraph = text(versions.graphVersion, 128),
        nextCost = text(versions.costVersion, 128);
      if (nextGraph === graphVersion && nextCost === costVersion) return;
      graphVersion = nextGraph;
      costVersion = nextCost;
      clearCache();
    },
    invalidate(): void {
      assertAvailable();
      clearCache();
    },
    getStats(): RoutePlannerStats {
      let cachePathCodeUnits = 0;
      for (const entry of cache.values())
        if (entry.data.path) for (const lane of entry.data.path) cachePathCodeUnits += lane.length;
      return Object.freeze({
        graphVersion,
        costVersion,
        blockedSignature,
        trafficSignature,
        cacheEntries: cache.size,
        cacheLimit: ROUTE_PLANNER_LIMITS.cacheEntries,
        cachePathCodeUnits,
        invalidations,
        expansions: expansionsTotal,
        searches,
        hits,
        misses,
        maxExpansions,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cache.clear();
      infoCache.clear();
      traffic.clear();
      blocked = new Set();
    },
  });
}
