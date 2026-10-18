import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLaneGraph,
  createRoutePlanner,
  ROUTE_COST_MODEL,
  ROUTE_PLANNER_LIMITS,
} from '../../src/world';
import type { LaneGraph } from '../../src/world';
import { createSimulationScheduler, SCHEDULING_LIMITS } from '../../src/simulation';
import type { ScheduledRouteRequest, ScheduledRouteResult } from '../../src/simulation';
import { roadContextFixture } from '../autonomy/road-context-reference';
import { syntheticRouteSearch } from '../simulation/scheduling-reference';
import { laneGraphRing } from './lane-graph-fixture';
import { routePlannerFixturePlanner } from './route-planner-fixture';

const pathOf = (path: readonly string[] | null): readonly string[] => {
  assert.ok(path, 'expected a path');
  return path;
};

function assertDirectedPath(
  graph: LaneGraph,
  path: readonly string[],
  access: 'TAXI' | 'CIVIL',
): void {
  for (let index = 1; index < path.length; index++)
    assert.ok(
      graph.canTraverse(path[index - 1], path[index], access),
      `illegal ${access} edge ${path[index - 1]} -> ${path[index]}`,
    );
}

/** Independent O(V^2) cheapest-path oracle over the documented cost model. */
function oracleCostSeconds(
  graph: LaneGraph,
  origin: string,
  destination: string,
  blocked: ReadonlySet<string>,
): number | null {
  if (blocked.has(origin) || blocked.has(destination)) return null;
  const cost = (id: string): number => {
    const lane = graph.getLane(id)!;
    return (
      graph.getDirectedPath(id)!.lengthM /
        Math.max(lane.speedLimitMps, ROUTE_COST_MODEL.minSpeedMps) +
      (blocked.has(id) ? Infinity : 0)
    );
  };
  const distance = new Map<string, number>([[origin, 0]]);
  const settled = new Set<string>();
  for (;;) {
    let bestLane: string | null = null;
    let best = Infinity;
    for (const [lane, value] of distance)
      if (!settled.has(lane) && value < best) {
        best = value;
        bestLane = lane;
      }
    if (bestLane === null) return null;
    if (bestLane === destination) return best;
    settled.add(bestLane);
    for (const connection of graph.getConnections(bestLane, 'CIVIL')) {
      const next = connection.toLaneId;
      if (settled.has(next) || blocked.has(next)) continue;
      const penalty =
        connection.kind === 'TURN'
          ? ROUTE_COST_MODEL.turnPenaltyS
          : ROUTE_COST_MODEL.continuationPenaltyS;
      const candidate = best + cost(next) + penalty;
      if (candidate < (distance.get(next) ?? Infinity)) distance.set(next, candidate);
    }
  }
}

test('routes follow lane direction and access: CIVIL uses the loop, TAXI uses the bypass', () => {
  const { planner, graph } = routePlannerFixturePlanner();
  const civil = planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' });
  assert.equal(civil.status, 'READY');
  assert.deepEqual([...pathOf(civil.path)], ['l0', 'l1', 'l2', 'l3']);
  assertDirectedPath(graph, pathOf(civil.path), 'CIVIL');
  const taxi = planner.findRoute({ origin: 'l0', destination: 'l3', access: 'TAXI' });
  assert.equal(taxi.status, 'READY');
  assert.deepEqual([...pathOf(taxi.path)], ['l0', 'l4', 'l3']);
  assertDirectedPath(graph, pathOf(taxi.path), 'TAXI');
  assert.ok(taxi.costSeconds > 0 && Number.isFinite(taxi.costSeconds));
  planner.dispose();
});

test('a blocked lane on the only CIVIL path is an explicit UNREACHABLE without inventing a route', () => {
  const { planner } = routePlannerFixturePlanner();
  planner.setBlocked(['l2']);
  const civil = planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' });
  assert.equal(civil.status, 'UNREACHABLE');
  assert.equal(civil.path, null);
  assert.equal(civil.costSeconds, Infinity);
  const taxi = planner.findRoute({ origin: 'l0', destination: 'l3', access: 'TAXI' });
  assert.deepEqual([...pathOf(taxi.path)], ['l0', 'l4', 'l3']);
  planner.setBlocked(['l0']);
  assert.equal(
    planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' }).status,
    'BLOCKED',
  );
  planner.setBlocked(['l3']);
  assert.equal(
    planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' }).status,
    'BLOCKED',
  );
  planner.dispose();
});

test('one-way traversal never produces a reverse edge; an upstream goal loops forward instead', () => {
  const { planner, graph } = routePlannerFixturePlanner();
  assert.equal(graph.canTraverse('l1', 'l0', 'CIVIL'), false);
  const plan = planner.findRoute({ origin: 'l1', destination: 'l0', access: 'CIVIL' });
  assert.equal(plan.status, 'READY');
  assert.deepEqual([...pathOf(plan.path)], ['l1', 'l2', 'l3', 'l0']);
  assertDirectedPath(graph, pathOf(plan.path), 'CIVIL');
  planner.setBlocked(['l2']);
  assert.equal(
    planner.findRoute({ origin: 'l1', destination: 'l0', access: 'CIVIL' }).status,
    'UNREACHABLE',
  );
  planner.dispose();
});

test('unknown origins and destinations are explicit results, never a silent success', () => {
  const { planner } = routePlannerFixturePlanner();
  assert.equal(
    planner.findRoute({ origin: 'ghost', destination: 'l3', access: 'CIVIL' }).status,
    'ORIGIN_UNKNOWN',
  );
  assert.equal(
    planner.findRoute({ origin: 'l0', destination: 'ghost', access: 'CIVIL' }).status,
    'DESTINATION_UNKNOWN',
  );
  planner.dispose();
});

test('service-zone destinations end on a lane that serves the zone for the requested access', () => {
  const { planner } = routePlannerFixturePlanner();
  const both = planner.findRoute({ origin: 'l0', destination: 'zone-both', access: 'CIVIL' });
  assert.equal(both.status, 'READY');
  assert.equal(both.destinationKind, 'ZONE');
  assert.equal(both.destinationLaneId, 'l3');
  assert.equal(pathOf(both.path).at(-1), 'l3');
  const taxi = planner.findRoute({ origin: 'l0', destination: 'zone-taxi', access: 'TAXI' });
  assert.equal(taxi.status, 'READY');
  assert.equal(pathOf(taxi.path).at(-1), 'l4');
  const mismatch = planner.findRoute({ origin: 'l0', destination: 'zone-taxi', access: 'CIVIL' });
  assert.equal(mismatch.status, 'SERVICE_ACCESS_MISMATCH');
  assert.equal(mismatch.path, null);
  const originZone = planner.findRoute({ origin: 'zone-both', destination: 'l0', access: 'CIVIL' });
  assert.equal(originZone.status, 'READY');
  assert.deepEqual([...pathOf(originZone.path)], ['l3', 'l0']);
  assert.deepEqual(planner.resolveDestination('zone-taxi', 'TAXI'), { kind: 'ZONE', laneId: 'l4' });
  assert.equal(planner.resolveDestination('zone-taxi', 'CIVIL'), null);
  assert.deepEqual(planner.resolveDestination('l4', 'TAXI'), { kind: 'LANE', laneId: 'l4' });
  assert.equal(planner.resolveDestination('l4', 'CIVIL'), null);
  planner.dispose();
});

test('repeated searches on independent planners are deterministic in path, cost and expansions', () => {
  const first = routePlannerFixturePlanner().planner;
  const second = routePlannerFixturePlanner().planner;
  const query = { origin: 'l0', destination: 'l3', access: 'CIVIL' } as const;
  const a = first.findRoute(query);
  const b = second.findRoute(query);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.equal(a.expansions, b.expansions);
  assert.equal(a.costSeconds, b.costSeconds);
  assert.deepEqual(first.getStats().expansions, second.getStats().expansions);
  first.dispose();
  second.dispose();
});

test('bounded cache respects the cap, reports code units and invalidates on graph/cost/blocked change', () => {
  const ring = laneGraphRing(64);
  const graph = createLaneGraph(ring);
  const planner = createRoutePlanner({ graph, map: ring, graphVersion: 'g1', costVersion: 'c0' });
  const queries: [string, string][] = [];
  for (let destination = 1; destination < 64 && queries.length < 65; destination++)
    queries.push(['lane-0', `lane-${destination}`]);
  for (let destination = 2; destination < 64 && queries.length < 65; destination++)
    queries.push(['lane-1', `lane-${destination}`]);
  for (const [origin, destination] of queries)
    assert.equal(planner.findRoute({ origin, destination, access: 'CIVIL' }).status, 'READY');
  const capped = planner.getStats();
  assert.equal(capped.cacheEntries, ROUTE_PLANNER_LIMITS.cacheEntries);
  assert.equal(capped.cacheLimit, SCHEDULING_LIMITS.routeCache);
  assert.ok(capped.cachePathCodeUnits > 0);
  assert.ok(
    capped.cachePathCodeUnits <= SCHEDULING_LIMITS.routeCache * SCHEDULING_LIMITS.pathLanes * 256,
  );
  const recent = queries[queries.length - 1];
  assert.equal(
    planner.findRoute({ origin: recent[0], destination: recent[1], access: 'CIVIL' }).cached,
    true,
  );
  planner.setVersions({ graphVersion: 'g2', costVersion: 'c0' });
  assert.equal(planner.getStats().cacheEntries, 0);
  assert.ok(planner.getStats().invalidations >= 1);
  assert.equal(
    planner.findRoute({ origin: 'lane-0', destination: 'lane-1', access: 'CIVIL' }).cached,
    false,
  );
  planner.setVersions({ graphVersion: 'g2', costVersion: 'c1' });
  assert.equal(planner.getStats().cacheEntries, 0);
  planner.dispose();
});

test('a blocked-set change cannot return a stale cached path', () => {
  const { planner } = routePlannerFixturePlanner();
  const open = planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' });
  assert.equal(open.status, 'READY');
  assert.equal(
    planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' }).cached,
    true,
  );
  planner.setBlocked(['l2']);
  assert.equal(planner.getStats().cacheEntries, 0);
  const blocked = planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' });
  assert.equal(blocked.status, 'UNREACHABLE');
  assert.equal(blocked.cached, false);
  assert.equal(blocked.path, null);
  planner.dispose();
});

test('traffic weights are explicit inputs that invalidate the cache and add documented seconds', () => {
  const { planner } = routePlannerFixturePlanner();
  const query = { origin: 'l0', destination: 'l3', access: 'CIVIL' } as const;
  const base = planner.findRoute(query);
  assert.equal(base.status, 'READY');
  const signature = planner.getStats().trafficSignature;
  planner.setTrafficSeconds(new Map([['l2', 5]]));
  assert.notEqual(planner.getStats().trafficSignature, signature);
  assert.equal(planner.getStats().cacheEntries, 0);
  const weighted = planner.findRoute(query);
  assert.equal(weighted.cached, false);
  assert.ok(Math.abs(weighted.costSeconds - (base.costSeconds + 5)) < 1e-9);
  planner.dispose();
});

test('unreachable and budget-exhausted searches terminate within the documented expansion cap', () => {
  const ring = laneGraphRing(64);
  const graph = createLaneGraph(ring);
  const capped = createRoutePlanner({
    graph,
    map: ring,
    graphVersion: 'g1',
    costVersion: 'c0',
    maxExpansions: 4,
  });
  const exhausted = capped.findRoute({ origin: 'lane-0', destination: 'lane-32', access: 'CIVIL' });
  assert.equal(exhausted.status, 'BUDGET_EXHAUSTED');
  assert.equal(exhausted.path, null);
  assert.ok(exhausted.expansions <= 4);
  assert.equal(capped.getStats().cacheEntries, 0);
  capped.dispose();
  const large = laneGraphRing(2048);
  const largeGraph = createLaneGraph(large);
  const planner = createRoutePlanner({
    graph: largeGraph,
    map: large,
    graphVersion: 'g1',
    costVersion: 'c0',
  });
  const plan = planner.findRoute({ origin: 'lane-0', destination: 'lane-100', access: 'CIVIL' });
  assert.equal(plan.status, 'READY');
  assert.equal(pathOf(plan.path).length, 101);
  assert.ok(plan.expansions <= ROUTE_PLANNER_LIMITS.maxExpansions);
  planner.dispose();
});

test('the real planner agrees with the preserved reference reachability and is cost-optimal on the219 fixture', () => {
  const fixture = roadContextFixture(false);
  const lanes = fixture.map.lanes.map((lane) => lane.id).sort();
  const cases = [new Set<string>(), new Set([lanes[3]]), new Set(['west-out'])];
  for (const blocked of cases) {
    const planner = createRoutePlanner({
      graph: fixture.graph,
      map: fixture.map,
      graphVersion: 'g1',
      costVersion: 'c0',
      blocked: [...blocked],
    });
    for (const origin of lanes)
      for (const destination of lanes) {
        const plan = planner.findRoute({ origin, destination, access: 'CIVIL' });
        const reference = syntheticRouteSearch(fixture.graph, origin, destination, blocked);
        if (reference === null) {
          assert.notEqual(plan.status, 'READY', `unexpected route ${origin} -> ${destination}`);
          assert.equal(plan.path, null);
        } else {
          assert.equal(plan.status, 'READY', `missing route ${origin} -> ${destination}`);
          const path = pathOf(plan.path);
          assert.equal(path[0], origin);
          assert.equal(path.at(-1), destination);
          assertDirectedPath(fixture.graph, path, 'CIVIL');
          const optimal = oracleCostSeconds(fixture.graph, origin, destination, blocked);
          assert.ok(optimal !== null);
          assert.ok(
            Math.abs(plan.costSeconds - optimal) < 1e-9,
            `suboptimal ${origin} -> ${destination}: ${plan.costSeconds} vs ${optimal}`,
          );
        }
      }
    planner.dispose();
  }
});

test('routing through the real219 scheduler queue is ordered, cached and version-invalidated', () => {
  const { planner } = routePlannerFixturePlanner();
  const scope = { sessionId: 'route-planner-041', worldEpoch: 0 };
  const slow = { id: 'a', incarnation: 1 };
  const urgent = { id: 'b', incarnation: 1 };
  const routes: ScheduledRouteResult[] = [];
  const engine = createSimulationScheduler({
    ...scope,
    ports: {
      input() {},
      decision() {},
      controller() {},
      physics() {},
      routeResult(result) {
        routes.push(result);
      },
      createRouteTask: (request) => planner.createRouteTask(request),
    },
  });
  const request = (
    actor: { id: string; incarnation: number },
    extra: Partial<ScheduledRouteRequest> = {},
  ) => ({
    ...scope,
    actor,
    graphVersion: 'g1',
    costVersion: 'c0',
    origin: 'l0',
    destination: 'l3',
    access: 'CIVIL' as const,
    priority: 'normal' as const,
    ...extra,
  });
  try {
    engine.setActors([slow, urgent], scope);
    engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c0' }, scope);
    engine.requestRoute(request(slow));
    engine.requestRoute(request(urgent, { access: 'TAXI', priority: 'urgent' }));
    let tick = 0;
    for (let guard = 0; routes.length < 2 && guard < 10; guard++)
      engine.step({ ...scope, tick: ++tick, dtSeconds: 1 / 60 });
    assert.equal(routes.length, 2);
    assert.equal(routes[0].actor.id, 'b');
    assert.equal(routes[0].status, 'READY');
    assert.deepEqual([...pathOf(routes[0].path)], ['l0', 'l4', 'l3']);
    assert.deepEqual([...pathOf(routes[1].path)], ['l0', 'l1', 'l2', 'l3']);
    assert.equal(engine.requestRoute(request(slow)).status, 'CACHED');
    planner.setBlocked(['l2']);
    planner.setVersions({ graphVersion: 'g1', costVersion: 'c1' });
    engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
    engine.requestRoute({ ...request(slow), costVersion: 'c1' });
    for (let guard = 0; routes.length < 3 && guard < 10; guard++)
      engine.step({ ...scope, tick: ++tick, dtSeconds: 1 / 60 });
    assert.equal(routes.at(-1)?.status, 'BLOCKED');
    assert.equal(routes.at(-1)?.path, null);
  } finally {
    engine.dispose();
    planner.dispose();
  }
});

test('disposal frees the cache and blocks further searches without hidden global state', () => {
  const { planner } = routePlannerFixturePlanner();
  planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' });
  assert.equal(planner.getStats().cacheEntries, 1);
  planner.dispose();
  planner.dispose();
  const stats = planner.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.cacheEntries, 0);
  assert.equal(stats.cachePathCodeUnits, 0);
  assert.throws(() => planner.findRoute({ origin: 'l0', destination: 'l3', access: 'CIVIL' }));
});
