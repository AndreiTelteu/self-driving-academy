import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  RIDE_DEMAND_LIMITS,
  RIDE_DEMAND_OVERFLOW_POLICY,
  RIDE_DEMAND_VERSION,
  createRideDemand,
  parseRideDemandPlan,
  rideRequestId,
  rideRequestSpawnTick,
} from '../../src/fleet';
import type { RideRequest } from '../../src/fleet';
import {
  NEIGHBOURHOOD_MAP_ID,
  createLaneGraph,
  createNeighbourhoodMap,
  createRoutePlanner,
} from '../../src/world';
import type { RoutePlanner, RouteQuery } from '../../src/world';
import {
  RIDE_DEMAND_WINDOWS,
  createRideWorld,
  disposeRideWorld,
  rideDemandPlan,
  singleWindow,
} from './ride-demand-fixture';
import { runRideDemandReport } from './ride-demand-report';

const SOURCE = join(process.cwd(), 'src', 'fleet', 'ride-demand.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '059-ride-demand', 'report.json');

function requestsFor(world: ReturnType<typeof createRideWorld>): readonly RideRequest[] {
  return world.demand.requests();
}

function planWindows(world: ReturnType<typeof createRideWorld>) {
  return new Map(world.demand.plan.windows.map((window) => [window.windowId, window]));
}

test('059 generates stable unique requests over the real service zones and scenario schedule', () => {
  const world = createRideWorld(),
    requests = requestsFor(world),
    windows = planWindows(world),
    zones = new Map(world.map.serviceZones.map((zone) => [zone.id, zone]));
  assert.equal(requests.length, 32);
  assert.equal(world.demand.stats().windows, 3);
  assert.equal(new Set(requests.map((request) => request.requestId)).size, requests.length);
  assert.equal(world.demand.stats().valid, 32);
  assert.equal(world.demand.stats().invalid, 0);
  for (const request of requests) {
    assert.match(request.requestId, /^id-v1:/);
    assert.equal(request.scenarioId, 'city-059');
    assert.equal(request.access, 'TAXI');
    assert.ok(windows.has(request.windowId));
    const window = windows.get(request.windowId)!,
      origin = zones.get(request.originZoneId),
      destination = zones.get(request.destinationZoneId);
    assert.ok(origin !== undefined, `origin ${request.originZoneId} is not a map service zone`);
    assert.ok(
      destination !== undefined,
      `destination ${request.destinationZoneId} is not a map service zone`,
    );
    assert.ok(origin!.access.includes('TAXI'));
    assert.ok(destination!.access.includes('TAXI'));
    assert.notEqual(origin!.kind, 'DROPOFF');
    assert.notEqual(destination!.kind, 'PICKUP');
    assert.notEqual(origin!.id, destination!.id);
    assert.ok(request.spawnTick >= window.startTick);
    assert.ok(request.spawnTick < window.endTick);
    assert.equal(request.spawnTick, rideRequestSpawnTick(window, request.ordinal));
    assert.equal(request.demandLevel, window.demandLevel);
    assert.equal(
      request.requestId,
      rideRequestId(world.demand.plan.namespace, window.windowId, request.ordinal),
    );
    const validation = world.demand.validation(request.requestId)!;
    assert.equal(validation.status, 'READY');
    assert.equal(validation.routeStatus, 'READY');
    assert.ok(validation.costSeconds !== null && validation.costSeconds > 0);
    assert.ok(validation.laneCount !== null && validation.laneCount > 0);
  }
  for (let index = 1; index < requests.length; index += 1) {
    const previous = requests[index - 1]!,
      current = requests[index]!;
    assert.ok(
      previous.spawnTick < current.spawnTick ||
        (previous.spawnTick === current.spawnTick && previous.requestId < current.requestId),
    );
  }
  assert.equal(world.demand.stats().version, RIDE_DEMAND_VERSION);
  assert.equal(world.demand.stats().plannerOwned, false);
  assert.equal(world.demand.stats().plannerDisposed, false);
  disposeRideWorld(world);
});

test('059 reproduces the fixed schedule and seed but a different seed changes the zone pairs', () => {
  const left = createRideWorld(),
    right = createRideWorld();
  assert.deepEqual(requestsFor(left), requestsFor(right));
  assert.deepEqual(left.demand.stats(), right.demand.stats());
  const otherSeed = createRideWorld({ seed: 59060 }),
    leftIds = requestsFor(left).map((request) => request.requestId),
    seedIds = requestsFor(otherSeed).map((request) => request.requestId),
    leftPairs = requestsFor(left).map(
      (request) => `${request.originZoneId}>${request.destinationZoneId}`,
    ),
    seedPairs = requestsFor(otherSeed).map(
      (request) => `${request.originZoneId}>${request.destinationZoneId}`,
    );
  assert.deepEqual(seedIds, leftIds);
  assert.notDeepEqual(seedPairs, leftPairs);
  disposeRideWorld(left);
  disposeRideWorld(right);
  disposeRideWorld(otherSeed);
});

test('059 is independent of window array order and of advance granularity', () => {
  const ordered = createRideWorld(),
    shuffled = createRideWorld({ windows: [...RIDE_DEMAND_WINDOWS].reverse() });
  assert.deepEqual(requestsFor(ordered), requestsFor(shuffled));
  assert.deepEqual(
    ordered.demand.plan.windows.map((window) => window.windowId),
    shuffled.demand.plan.windows.map((window) => window.windowId),
  );
  const oneStep = createRideWorld(),
    manySteps = createRideWorld();
  oneStep.demand.advance(1500);
  for (let tick = 0; tick <= 1500; tick += 1) manySteps.demand.advance(tick);
  assert.deepEqual(oneStep.demand.pending(), manySteps.demand.pending());
  assert.deepEqual(oneStep.demand.stats(), manySteps.demand.stats());
  disposeRideWorld(ordered);
  disposeRideWorld(shuffled);
  disposeRideWorld(oneStep);
  disposeRideWorld(manySteps);
});

test('059 never admits a request before its scheduled tick and rejects stale ticks', () => {
  const world = createRideWorld(),
    demand = world.demand,
    scheduled = requestsFor(world),
    firstFuture = scheduled.find((request) => request.spawnTick > 0)!;
  const atZero = demand.advance(0);
  assert.ok(atZero.admitted.length > 0);
  assert.ok(atZero.admitted.every((request) => request.spawnTick === 0));
  assert.ok(atZero.pending.every((request) => request.spawnTick <= 0));
  assert.ok(!atZero.pending.some((request) => request.requestId === firstFuture.requestId));
  const atFuture = demand.advance(firstFuture.spawnTick);
  assert.ok(atFuture.pending.every((request) => request.spawnTick <= firstFuture.spawnTick));
  assert.ok(atFuture.admitted.every((request) => request.spawnTick <= firstFuture.spawnTick));
  assert.throws(() => demand.advance(firstFuture.spawnTick - 1), /Stale/);
  assert.throws(() => demand.advance(-1), /range/);
  assert.throws(() => demand.advance(1.5), /integer/);
  disposeRideWorld(world);
});

test('059 validates unknown, non-TAXI, wrong-kind and same-zone requests before admission', () => {
  const cases = [
    {
      override: { destinationZoneId: 'sz:2-2' },
      status: 'ACCESS_MISMATCH',
    },
    {
      override: { destinationZoneId: 'sz:missing' },
      status: 'UNKNOWN_DESTINATION',
    },
    {
      override: { originZoneId: 'sz:missing' },
      status: 'UNKNOWN_ORIGIN',
    },
    {
      override: { originZoneId: 'sz:1-0', destinationZoneId: 'sz:1-1' },
      status: 'NOT_PICKUP_ZONE',
    },
    {
      override: { originZoneId: 'sz:1-1', destinationZoneId: 'sz:1-2' },
      status: 'NOT_DROPOFF_ZONE',
    },
    {
      override: { originZoneId: 'sz:1-1', destinationZoneId: 'sz:1-1' },
      status: 'SAME_ZONE',
    },
  ] as const;
  for (const entry of cases) {
    const world = createRideWorld({ windows: singleWindow(entry.override) }),
      request = requestsFor(world)[0]!,
      validation = world.demand.validation(request.requestId)!;
    assert.equal(validation.status, entry.status, JSON.stringify(entry.override));
    assert.equal(validation.routeStatus, null);
    assert.equal(validation.costSeconds, null);
    assert.equal(validation.laneCount, null);
    assert.equal(world.demand.stats().valid, 0);
    assert.equal(world.demand.stats().invalid, 1);
    const advance = world.demand.advance(10);
    assert.deepEqual(advance.admitted, []);
    assert.deepEqual(advance.pending, []);
    const rejection = world.demand.rejections()[0]!;
    assert.equal(rejection.requestId, request.requestId);
    assert.equal(rejection.reason, 'INVALID_REQUEST');
    assert.equal(rejection.validationStatus, entry.status);
    disposeRideWorld(world);
  }
});

test('059 consults the real 041 planner for every request and refuses blocked routes', () => {
  const map = createNeighbourhoodMap(),
    graph = createLaneGraph(map),
    base = createRoutePlanner({
      graph,
      map,
      graphVersion: '033-lane-graph-v1',
      costVersion: 'route-cost-v1',
    });
  let searches = 0;
  const spy: RoutePlanner = Object.freeze({
    ...base,
    findRoute(query: RouteQuery) {
      searches += 1;
      return base.findRoute(query);
    },
  });
  const reused = createRideDemand({ plan: rideDemandPlan(), map, graph, planner: spy });
  assert.equal(searches, 32);
  assert.equal(reused.stats().routeSearches, 32);
  assert.ok(
    reused.requests().every((request) => reused.validation(request.requestId)!.status === 'READY'),
  );
  reused.dispose();
  assert.equal(base.getStats().disposed, false);
  base.dispose();

  const blocked = createRoutePlanner({
      graph,
      map,
      graphVersion: '033-lane-graph-v1',
      costVersion: 'route-cost-v1',
      blocked: ['lane:02W0'],
    }),
    blockedDemand = createRideDemand({
      plan: rideDemandPlan({
        windows: singleWindow({ originZoneId: 'sz:0-2', destinationZoneId: 'sz:1-0' }),
      }),
      map,
      graph,
      planner: blocked,
    }),
    request = blockedDemand.requests()[0]!,
    validation = blockedDemand.validation(request.requestId)!;
  assert.equal(validation.status, 'NO_ROUTE');
  assert.equal(validation.routeStatus, 'BLOCKED');
  assert.equal(blockedDemand.stats().valid, 0);
  const advance = blockedDemand.advance(10);
  assert.deepEqual(advance.pending, []);
  blockedDemand.dispose();
  blocked.dispose();
});

test('059 bounds the pending queue and rejects the newest overflow explicitly', () => {
  assert.equal(RIDE_DEMAND_OVERFLOW_POLICY, 'REJECT_NEWEST');
  const world = createRideWorld(
      {
        windows: [
          {
            windowId: 'w:flood',
            startTick: 0,
            endTick: 100,
            demandLevel: 'HIGH',
            requestCount: 100,
            originZoneId: null,
            destinationZoneId: null,
          },
        ],
      },
      { demand: { queueLimit: 4 } },
    ),
    demand = world.demand,
    advance = demand.advance(100);
  assert.equal(advance.admitted.length, 4);
  assert.equal(advance.pending.length, 4);
  assert.equal(advance.overflowed.length, 96);
  assert.equal(demand.stats().pending, 4);
  assert.equal(demand.stats().overflow, 96);
  assert.equal(demand.stats().queueLimit, 4);
  assert.ok(demand.stats().pending <= RIDE_DEMAND_LIMITS.pendingRequests);
  assert.equal(
    demand.rejections().filter((rejection) => rejection.reason === 'QUEUE_OVERFLOW').length,
    96,
  );
  const first = demand.dequeue()!;
  assert.ok(first.requestId.length > 0);
  assert.equal(demand.stats().dequeued, 1);
  assert.equal(demand.stats().pending, 3);
  assert.deepEqual(demand.advance(100), {
    tick: 100,
    admitted: [],
    pending: demand.pending(),
    overflowed: [],
  });
  assert.equal(demand.stats().pending, 3);
  assert.throws(() => createRideWorld({}, { demand: { queueLimit: 0 } }), /range/);
  assert.throws(
    () => createRideWorld({}, { demand: { queueLimit: RIDE_DEMAND_LIMITS.pendingRequests + 1 } }),
    /range/,
  );
  disposeRideWorld(world);
});

test('059 never consults wall clock or ambient randomness', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(
    source,
    /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/,
  );
  const originalNow = Date.now;
  try {
    Date.now = () => 1;
    const first = createRideWorld();
    first.demand.advance(1500);
    const firstRequests = requestsFor(first),
      firstPending = first.demand.pending();
    Date.now = () => 9_999_999;
    const second = createRideWorld();
    second.demand.advance(1500);
    assert.deepEqual(requestsFor(second), firstRequests);
    assert.deepEqual(second.demand.pending(), firstPending);
    disposeRideWorld(first);
    disposeRideWorld(second);
  } finally {
    Date.now = originalNow;
  }
});

test('059 parsing rejects malformed plans and freezes the canonical schedule', () => {
  const parsed = parseRideDemandPlan(rideDemandPlan());
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.windows));
  assert.ok(parsed.windows.every((window) => Object.isFrozen(window)));
  assert.equal(parsed.mapId, NEIGHBOURHOOD_MAP_ID);
  assert.throws(() => parseRideDemandPlan({ ...rideDemandPlan(), extra: true }), /contract/i);
  assert.throws(
    () =>
      parseRideDemandPlan({
        ...rideDemandPlan(),
        windows: [...singleWindow(), ...singleWindow({ windowId: 'w:single' })],
      }),
    /Duplicate/,
  );
  assert.throws(
    () => parseRideDemandPlan({ ...rideDemandPlan(), windows: singleWindow({ endTick: 0 }) }),
    /positive span/,
  );
  assert.throws(
    () => parseRideDemandPlan({ ...rideDemandPlan(), windows: singleWindow({ requestCount: 0 }) }),
    /range/,
  );
  assert.throws(
    () =>
      parseRideDemandPlan({
        ...rideDemandPlan(),
        windows: singleWindow({ demandLevel: 'EXTREME' }),
      }),
    /enum/i,
  );
  assert.throws(
    () =>
      parseRideDemandPlan({
        ...rideDemandPlan(),
        windows: Array.from({ length: 5 }, (_, index) => ({
          ...singleWindow({ windowId: `w:${index}`, requestCount: 205, endTick: 10_000 })[0]!,
        })),
      }),
    /capacity/,
  );
  const map = createNeighbourhoodMap();
  assert.throws(
    () => createRideDemand({ plan: rideDemandPlan({ mapId: 'another-map' }), map }),
    /mismatch/,
  );
  assert.throws(
    () =>
      createRideDemand({
        plan: rideDemandPlan({ windows: singleWindow({ requestCount: 1 }) }),
        map,
        extra: true,
      }),
    /Unknown/,
  );
});

test('059 disposes every owned request, queue and planner without leaking external ownership', () => {
  const map = createNeighbourhoodMap(),
    demand = createRideDemand({ plan: rideDemandPlan(), map });
  demand.advance(1500);
  assert.equal(demand.stats().plannerOwned, true);
  assert.equal(demand.stats().plannerDisposed, false);
  assert.ok(demand.pending().length > 0);
  const requestId = demand.pending()[0]!.requestId;
  demand.dispose();
  demand.dispose();
  assert.deepEqual(demand.requests(), []);
  assert.deepEqual(demand.pending(), []);
  assert.deepEqual(demand.rejections(), []);
  assert.equal(demand.validation(requestId), undefined);
  const zero = demand.stats();
  assert.equal(zero.disposed, true);
  assert.equal(zero.plannerOwned, true);
  assert.equal(zero.plannerDisposed, true);
  assert.equal(zero.windows, 0);
  assert.equal(zero.requests, 0);
  assert.equal(zero.valid, 0);
  assert.equal(zero.invalid, 0);
  assert.equal(zero.pending, 0);
  assert.equal(zero.admitted, 0);
  assert.equal(zero.dequeued, 0);
  assert.equal(zero.overflow, 0);
  assert.equal(zero.routeSearches, 0);
  assert.throws(() => demand.advance(1500), /disposed/);
  assert.throws(() => demand.dequeue(), /disposed/);

  const external = createRideWorld();
  external.demand.dispose();
  assert.equal(external.planner.getStats().disposed, false);
  external.planner.dispose();
});

test('059 committed evidence report is the current demand transcript', () => {
  const report = runRideDemandReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runRideDemandReport>;
  assert.deepEqual(
    saved,
    JSON.parse(JSON.stringify(report)) as ReturnType<typeof runRideDemandReport>,
  );
});
