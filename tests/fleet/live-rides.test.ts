import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAmbientTraffic, createCompositionWorld } from '../../src/app';
import {
  LIVE_RIDES_LIMITS,
  LIVE_RIDES_VERSION,
  LIVE_RIDE_REQUEST_STATES,
  createFleetRegistry,
  createLiveRidePlan,
  createLiveRides,
} from '../../src/fleet';
import type { LiveRideFrameVehicle, LiveRideStepResult, LiveRides } from '../../src/fleet';
import { RIDE_DISPATCH_LIMITS, settleableTaxiStatuses } from '../../src/fleet/dispatcher';
import { createLaneGraph, createRoutePlanner } from '../../src/world';
import { LIVE_RIDES_REPORT_VERSION, runLiveRidesReport } from './live-rides-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '264-live-rides', 'report.json');
const SOURCE = join(process.cwd(), 'src', 'fleet', 'live-rides.ts');

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-264-test',
  worldEpoch: 1,
});

function registryConfiguration(taxiCount = 24): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-264-test',
    worldEpoch: 1,
    scenarioId: 'v3-live-city-264-test',
    seed: 264,
    namespace: 'test:264:fleet',
    taxiCount,
    civilianCount: 20,
    profile: { profileId: 'city:common', versionId: 'profile-v1' },
  };
}

interface LiveFixture {
  readonly world: ReturnType<typeof createCompositionWorld>;
  readonly ambient: ReturnType<typeof createAmbientTraffic>;
  readonly live: LiveRides;
  readonly player: { value: string | null };
  readonly blocked: Set<string>;
  currentTick(): number;
  step(atTick?: number): LiveRideStepResult;
  runTo(target: number): void;
  takeover(taxiId: string): void;
  releasePlayer(): void;
  dispose(): void;
}

function createLiveFixture(overrides: Record<string, unknown> = {}): LiveFixture {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed: 262,
    focus: { x: world.spawn.x, z: world.spawn.z },
  });
  const live = createLiveRides({
    registry: ambient.registry,
    map: world.map,
    graph: world.graph,
    seed: ambient.seed,
    scenarioId: 'v3-live-city-264-test',
    namespace: 'test:264:rides',
    ...overrides,
  });
  let tick = 0;
  const player: { value: string | null } = { value: null };
  const blocked = new Set<string>();
  const vehicles = (): readonly LiveRideFrameVehicle[] =>
    ambient.list().map((actor) => ({
      vehicleId: actor.vehicleId,
      driverKind: actor.driverKind,
      laneId: actor.laneId,
      blocked: blocked.has(actor.vehicleId) || actor.blocked,
      controlMode: actor.authority,
    }));
  const step = (atTick = tick + 1): LiveRideStepResult => {
    assert.ok(atTick > tick, `fixture tick ${atTick} must follow ${tick}`);
    ambient.traffic.step({ tick: atTick, dtSeconds: 1 / 60, vehicles: [] });
    tick = atTick;
    return live.step({ tick: atTick, vehicles: vehicles(), playerVehicleId: player.value });
  };
  return {
    world,
    ambient,
    live,
    player,
    blocked,
    currentTick: () => tick,
    step,
    runTo(target: number): void {
      while (tick < target) step(tick + 1);
    },
    takeover(taxiId: string): void {
      ambient.traffic.setAuthority(taxiId, 'MANUAL', tick);
      player.value = taxiId;
    },
    releasePlayer(): void {
      if (player.value === null) return;
      ambient.traffic.setAuthority(player.value, 'AUTO', tick);
      player.value = null;
    },
    dispose(): void {
      live.dispose();
      ambient.dispose();
    },
  };
}

function planOnly(seed = 264): {
  readonly world: ReturnType<typeof createCompositionWorld>;
  readonly registry: ReturnType<typeof createFleetRegistry>;
  readonly live: LiveRides;
  dispose(): void;
} {
  const world = createCompositionWorld();
  const registry = createFleetRegistry(registryConfiguration());
  const live = createLiveRides({
    registry,
    map: world.map,
    graph: world.graph,
    seed,
    scenarioId: 'v3-live-city-264-plan',
    namespace: 'test:264:plan',
  });
  return {
    world,
    registry,
    live,
    dispose(): void {
      live.dispose();
      registry.dispose();
    },
  };
}

function laneAssignments(world: ReturnType<typeof createCompositionWorld>): readonly string[] {
  return world.map.lanes
    .filter((lane) => lane.access.includes('TAXI'))
    .map((lane) => lane.id)
    .sort();
}

test('264 live plan uses real TAXI zones and deterministic spawn ticks from the seed', () => {
  const first = planOnly(264);
  try {
    const plan = createLiveRidePlan({ map: first.world.map, seed: 264, scenarioId: 'plan-test' });
    assert.equal(plan.windows.length, LIVE_RIDES_LIMITS.windows);
    assert.equal(
      plan.windows.reduce((total, window) => total + window.requestCount, 0),
      LIVE_RIDES_LIMITS.windows * LIVE_RIDES_LIMITS.requestsPerWindow,
    );
    const requests = first.live.demand.requests();
    assert.equal(requests.length, 64);
    assert.equal(requests[0]!.spawnTick, 60);
    assert.equal(first.live.snapshot().requests[0]!.state, 'SCHEDULED');
    const zones = new Map(first.world.map.serviceZones.map((zone) => [zone.id, zone]));
    for (const request of requests) {
      const origin = zones.get(request.originZoneId),
        destination = zones.get(request.destinationZoneId);
      assert.ok(origin, `origin ${request.originZoneId} is real`);
      assert.ok(destination, `destination ${request.destinationZoneId} is real`);
      assert.ok(origin.access.includes('TAXI'));
      assert.ok(destination.access.includes('TAXI'));
      assert.notEqual(origin.kind, 'DROPOFF');
      assert.notEqual(destination.kind, 'PICKUP');
      assert.notEqual(request.originZoneId, request.destinationZoneId);
      assert.ok(request.spawnTick >= 60 && request.spawnTick < 540);
    }
    const latest = first.live.demand.requests().at(-1)!.spawnTick;
    assert.ok(latest < 540, `only the authored live windows spawn, got ${latest}`);
    assert.equal(new Set(requests.map((request) => request.requestId)).size, requests.length);
  } finally {
    first.dispose();
  }
});

test('264 live plan is seed deterministic and a different seed moves the real zones', () => {
  const base = planOnly(264),
    different = planOnly(265);
  try {
    const first = base.live.demand.requests();
    const second = createLiveRides({
      registry: base.registry,
      map: base.world.map,
      graph: base.world.graph,
      seed: 264,
      scenarioId: 'v3-live-city-264-plan',
      namespace: 'test:264:plan',
    });
    try {
      assert.deepEqual(first, second.demand.requests());
      const moved = different.live.demand.requests();
      assert.equal(moved.length, first.length);
      assert.deepEqual(
        moved.map((request) => request.spawnTick),
        first.map((request) => request.spawnTick),
      );
      assert.ok(
        moved.some(
          (request, index) =>
            request.originZoneId !== first[index]!.originZoneId ||
            request.destinationZoneId !== first[index]!.destinationZoneId,
        ),
        'a different seed must choose different real zones',
      );
    } finally {
      second.dispose();
    }
  } finally {
    base.dispose();
    different.dispose();
  }
});

test('264 live queue is bounded and rejects the newest request explicitly', () => {
  const world = createCompositionWorld();
  const registry = createFleetRegistry(registryConfiguration());
  const live = createLiveRides({
    registry,
    map: world.map,
    graph: world.graph,
    seed: 264,
    scenarioId: 'queue-test',
    namespace: 'test:264:queue',
    queueLimit: 8,
    firstSpawnTick: 0,
    windowSpanTicks: 60,
    windows: 2,
    requestsPerWindow: 8,
    dispatchEveryTicks: 600,
  });
  try {
    for (let tick = 1; tick <= 120; tick += 1)
      live.step({ tick, vehicles: [], playerVehicleId: null });
    const snapshot = live.snapshot();
    assert.equal(snapshot.queue.limit, 8);
    assert.equal(snapshot.queue.policy, 'REJECT_NEWEST');
    assert.equal(snapshot.counts.pending, 8);
    assert.ok(snapshot.counts.requests > snapshot.counts.pending);
    assert.ok(snapshot.totals.overflow > 0);
    const rejected = live.demand.rejections().filter((entry) => entry.reason === 'QUEUE_OVERFLOW');
    assert.ok(rejected.length > 0);
    assert.equal(snapshot.totals.overflow, rejected.length);
    const overflowIds = new Set(rejected.map((entry) => entry.requestId));
    assert.equal(
      snapshot.requests.filter((request) => request.state === 'REJECTED_QUEUE').length,
      overflowIds.size,
    );
    // Advance to the dispatch tick with no positions: the request remains pending, rejected ones
    // never resurrect and no assignment is invented.
    live.step({ tick: 600, vehicles: [], playerVehicleId: null });
    const after = live.snapshot();
    assert.equal(after.assignments.length, 0);
    assert.equal(after.counts.pending, 8);
    assert.ok(
      after.requests
        .filter((request) => overflowIds.has(request.requestId))
        .every((request) => request.state === 'REJECTED_QUEUE'),
    );
  } finally {
    live.dispose();
    registry.dispose();
  }
});

test('264 dispatcher uses the real minimum pickup cost and replans both legs', () => {
  const world = createCompositionWorld();
  const registry = createFleetRegistry(registryConfiguration());
  const lanes = laneAssignments(world);
  const graph = createLaneGraph(world.map);
  const planner = createRoutePlanner({
    graph,
    map: world.map,
    graphVersion: '033-lane-graph-v1',
    costVersion: 'route-cost-v1',
  });
  const live = createLiveRides({
    registry,
    map: world.map,
    graph,
    seed: 264,
    scenarioId: 'cost-test',
    namespace: 'test:264:cost',
  });
  try {
    const taxis = registry
      .list()
      .filter((vehicle) => vehicle.driverKind === 'TAXI')
      .slice()
      .sort((left, right) => (left.vehicleId < right.vehicleId ? -1 : 1));
    const frame: LiveRideFrameVehicle[] = taxis.map((taxi, index) => ({
      vehicleId: taxi.vehicleId,
      driverKind: 'TAXI',
      laneId: lanes[index % lanes.length]!,
      blocked: false,
      controlMode: 'AUTO',
    }));
    const request = live.demand.requests()[0]!;
    let expected: { taxiId: string; costSeconds: number } | null = null;
    for (const taxi of frame) {
      const pickup = planner.findRoute({
        origin: taxi.laneId!,
        destination: request.originZoneId,
        access: 'TAXI',
      });
      if (pickup.status !== 'READY' || pickup.path === null) continue;
      if (
        expected === null ||
        pickup.costSeconds < expected.costSeconds ||
        (pickup.costSeconds === expected.costSeconds && taxi.vehicleId < expected.taxiId)
      )
        expected = { taxiId: taxi.vehicleId, costSeconds: pickup.costSeconds };
    }
    assert.ok(expected, 'at least one real pickup route');
    const result = live.step({ tick: 60, vehicles: frame, playerVehicleId: null });
    assert.equal(result.dispatchRan, true);
    assert.equal(result.assigned, 1);
    assert.ok(result.plannerSearches <= LIVE_RIDES_LIMITS.routeSearchesPerDispatch);
    assert.equal(result.plannerSearches, 1 + frame.length);
    const assignment = live.snapshot().assignments[0]!;
    assert.equal(assignment.taxiId, expected.taxiId);
    assert.ok(Math.abs(assignment.pickupCostSeconds - expected.costSeconds) < 1e-9);
    assert.ok(assignment.pickupRouteLaneIds.length > 0);
    assert.ok(assignment.tripRouteLaneIds.length > 0);
    assert.equal(
      assignment.pickupCostSeconds + assignment.tripCostSeconds,
      assignment.totalCostSeconds,
    );
    assert.equal(assignment.graphVersion, '033-lane-graph-v1');
    assert.equal(assignment.costVersion, 'route-cost-v1');
    const trip = planner.findRoute({
      origin: request.originZoneId,
      destination: request.destinationZoneId,
      access: 'TAXI',
    });
    assert.equal(trip.status, 'READY');
    assert.ok(Math.abs(assignment.tripCostSeconds - trip.costSeconds) < 1e-9);
    assert.deepEqual(assignment.tripRouteLaneIds, trip.path);
    assert.equal(result.released.length, 0);
  } finally {
    live.dispose();
    planner.dispose();
    registry.dispose();
  }
});

test('264 live cost is capped per dispatch step and the read model reports it', () => {
  const fixture = createLiveFixture();
  try {
    fixture.runTo(600);
    const snapshot = fixture.live.snapshot();
    assert.ok(snapshot.totals.dispatchSteps > 0);
    assert.ok(
      snapshot.totals.maxSearchesPerStep <= LIVE_RIDES_LIMITS.routeSearchesPerDispatch,
      `max searches ${snapshot.totals.maxSearchesPerStep}`,
    );
    assert.ok(snapshot.totals.maxAssignmentsPerStep <= LIVE_RIDES_LIMITS.assignmentsPerDispatch);
    assert.ok(snapshot.totals.lastSearches <= snapshot.queue.routeSearchBudget);
    assert.equal(snapshot.queue.routeSearchBudget, RIDE_DISPATCH_LIMITS.routeSearchesPerStep);
    assert.ok(
      snapshot.totals.routeSearches <=
        snapshot.totals.dispatchSteps * snapshot.queue.routeSearchBudget,
    );
    assert.ok(snapshot.totals.assignments > 0);
    assert.ok(snapshot.totals.assignments <= snapshot.counts.requests);
  } finally {
    fixture.dispose();
  }
});

test('264 blocked, damaged, offline and player-driven taxis are excluded and released with reasons', () => {
  const fixture = createLiveFixture();
  try {
    fixture.runTo(130);
    const assigned = fixture.live.snapshot().assignments;
    assert.ok(assigned.length >= 5);
    const [damaged, offline, blocked, explicitBlocked, playerTaken] = assigned;
    assert.ok(damaged && offline && blocked && explicitBlocked && playerTaken);
    fixture.live.setTaxiStatus(damaged.taxiId, 'DAMAGED');
    fixture.live.setTaxiStatus(offline.taxiId, 'OFFLINE');
    fixture.live.setTaxiStatus(explicitBlocked.taxiId, 'BLOCKED');
    fixture.blocked.add(blocked.taxiId);
    fixture.takeover(playerTaken.taxiId);
    const step = fixture.step(131);
    const causes = new Map(step.released.map((entry) => [entry.taxiId, entry]));
    assert.equal(causes.get(damaged.taxiId)?.cause, 'DAMAGED');
    assert.equal(causes.get(damaged.taxiId)?.reason, 'TAXI_DAMAGED');
    assert.equal(causes.get(offline.taxiId)?.cause, 'OFFLINE');
    assert.equal(causes.get(offline.taxiId)?.reason, 'TAXI_REMOVED');
    assert.equal(causes.get(blocked.taxiId)?.cause, 'BLOCKED');
    assert.equal(causes.get(blocked.taxiId)?.reason, 'TAXI_BLOCKED');
    assert.equal(causes.get(explicitBlocked.taxiId)?.cause, 'BLOCKED');
    assert.equal(causes.get(explicitBlocked.taxiId)?.reason, 'TAXI_BLOCKED');
    assert.equal(causes.get(playerTaken.taxiId)?.cause, 'PLAYER_TAKEOVER');
    assert.equal(causes.get(playerTaken.taxiId)?.reason, 'CANCELLED');
    const snapshot = fixture.live.snapshot();
    assert.equal(snapshot.counts.damagedTaxis, 1);
    assert.equal(snapshot.counts.offlineTaxis, 1);
    assert.equal(snapshot.counts.blockedTaxis, 2);
    assert.equal(snapshot.counts.excludedPlayer, 1);
    assert.ok(
      snapshot.requests
        .filter((request) =>
          [damaged, offline, blocked, explicitBlocked, playerTaken].some(
            (entry) => entry.requestId === request.requestId,
          ),
        )
        .every((request) => request.state === 'RELEASED'),
    );
    const banned = new Set([
      damaged.taxiId,
      offline.taxiId,
      blocked.taxiId,
      explicitBlocked.taxiId,
      playerTaken.taxiId,
    ]);
    fixture.runTo(360);
    const later = fixture.live.snapshot();
    assert.ok(
      later.assignments.every((assignment) => !banned.has(assignment.taxiId)),
      'an unavailable taxi is never proposed again while the status holds',
    );
    assert.equal(later.totals.releasesByCause.DAMAGED, 1);
    assert.equal(later.totals.releasesByCause.OFFLINE, 1);
    assert.equal(later.totals.releasesByCause.BLOCKED, 2);
    assert.equal(later.totals.releasesByCause.PLAYER_TAKEOVER, 1);
    // The player gives the car back; the other explicit statuses still hold.
    fixture.blocked.delete(blocked.taxiId);
    fixture.releasePlayer();
    fixture.runTo(420);
    const released = fixture.live.snapshot();
    assert.equal(released.counts.excludedPlayer, 0);
    assert.equal(released.counts.damagedTaxis, 1);
    assert.equal(released.counts.offlineTaxis, 1);
    assert.equal(released.counts.blockedTaxis, 1);
    assert.ok(
      released.assignments.every(
        (assignment) =>
          assignment.taxiId !== damaged.taxiId &&
          assignment.taxiId !== offline.taxiId &&
          assignment.taxiId !== explicitBlocked.taxiId,
      ),
    );
  } finally {
    fixture.dispose();
  }
});

test('264 a request never receives two taxis and reset does not duplicate assignments', () => {
  const fixture = createLiveFixture();
  try {
    fixture.runTo(600);
    const before = fixture.live.snapshot();
    assert.ok(before.assignments.length > 0);
    assert.equal(
      new Set(before.assignments.map((assignment) => assignment.requestId)).size,
      before.assignments.length,
    );
    assert.equal(
      new Set(before.assignments.map((assignment) => assignment.taxiId)).size,
      before.assignments.length,
    );
    const identities = new Map(
      before.assignments.map((assignment) => [
        `${assignment.requestId}:${assignment.taxiId}`,
        assignment.assignmentId,
      ]),
    );
    const released = fixture.live.reset({ tick: 600, preserveStats: true });
    assert.equal(released.releasedAssignments, before.assignments.length);
    assert.equal(fixture.live.snapshot().assignments.length, 0);
    assert.equal(fixture.live.stats().assignments, before.totals.assignments);
    assert.equal(fixture.live.stats().releases, before.totals.releases + before.assignments.length);
    fixture.runTo(800);
    const after = fixture.live.snapshot();
    assert.ok(after.assignments.length > 0);
    assert.equal(
      new Set(after.assignments.map((assignment) => assignment.requestId)).size,
      after.assignments.length,
    );
    assert.equal(
      new Set(after.assignments.map((assignment) => assignment.taxiId)).size,
      after.assignments.length,
    );
    for (const assignment of after.assignments) {
      const prior = identities.get(`${assignment.requestId}:${assignment.taxiId}`);
      if (prior !== undefined) assert.equal(assignment.assignmentId, prior);
    }
    assert.ok(
      after.requests.every((request) => request.state !== 'CONSUMED'),
      'every consumed request has a visible trace',
    );
  } finally {
    fixture.dispose();
  }
});

test('264 read model states are consistent with the real queue and assignments', () => {
  const fixture = createLiveFixture();
  try {
    fixture.runTo(300);
    const snapshot = fixture.live.snapshot();
    const pending = new Set(fixture.live.demand.pending().map((request) => request.requestId));
    assert.ok(snapshot.requests.length > 0);
    for (const request of snapshot.requests) {
      assert.ok(
        (LIVE_RIDE_REQUEST_STATES as readonly string[]).includes(request.state),
        `closed state ${request.state}`,
      );
      assert.notEqual(request.state, 'CONSUMED');
      if (request.state === 'PENDING') assert.ok(pending.has(request.requestId));
      if (request.state === 'ASSIGNED') {
        assert.ok(
          snapshot.assignments.some(
            (assignment) =>
              assignment.requestId === request.requestId && assignment.taxiId === request.taxiId,
          ),
        );
      }
      if (request.state === 'RELEASED') assert.notEqual(request.releaseCause, null);
      if (request.state.startsWith('REJECTED')) assert.equal(request.taxiId, null);
    }
    for (const assignment of snapshot.assignments) {
      assert.ok(assignment.pickupCostSeconds >= 0);
      assert.ok(assignment.tripCostSeconds > 0);
      assert.ok(assignment.pickupRouteLaneIds.length > 0);
      assert.ok(assignment.tripRouteLaneIds.length > 0);
      assert.equal(assignment.pickupZoneId.startsWith('sz:'), true);
      assert.equal(assignment.dropoffZoneId.startsWith('sz:'), true);
    }
  } finally {
    fixture.dispose();
  }
});

test('264 live module has no wall clock and disposes to zero without owning the registry', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(
    source,
    /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/,
  );
  const world = createCompositionWorld();
  const registry = createFleetRegistry(registryConfiguration());
  const externalPlanner = createRoutePlanner({
    graph: createLaneGraph(world.map),
    map: world.map,
    graphVersion: '033-lane-graph-v1',
    costVersion: 'route-cost-v1',
  });
  const live = createLiveRides({
    registry,
    map: world.map,
    planner: externalPlanner,
    seed: 264,
    scenarioId: 'dispose-test',
    namespace: 'test:264:dispose',
  });
  try {
    live.step({ tick: 1, vehicles: [], playerVehicleId: null });
    assert.equal(live.version, LIVE_RIDES_VERSION);
    live.dispose();
    live.dispose();
    assert.equal(live.stats().disposed, true);
    assert.equal(live.snapshot().disposed, true);
    assert.equal(live.snapshot().requests.length, 0);
    assert.throws(() => live.step({ tick: 2, vehicles: [], playerVehicleId: null }), /disposed/);
    assert.throws(() => live.reset({ tick: 2 }), /disposed/);
    assert.throws(() => live.setTaxiStatus('unknown', 'DAMAGED'), /disposed/);
    assert.equal(externalPlanner.getStats().disposed, false);
    for (const status of settleableTaxiStatuses) assert.ok(status.length > 0);
  } finally {
    live.dispose();
    externalPlanner.dispose();
    registry.dispose();
  }
});

test('264 committed live rides report is deterministic and every check passes', () => {
  const report = runLiveRidesReport(),
    saved = readFileSync(EVIDENCE, 'utf8');
  assert.equal(report.version, LIVE_RIDES_REPORT_VERSION);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.ok(report.summary.checks >= 20);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, saved);
  assert.equal(report.fixture.taxis, 24);
  assert.equal(report.fixture.civilians, 32);
  assert.equal(report.dispatch.uniqueRequests, report.dispatch.uniqueTaxis);
  assert.equal(report.dispatch.uniqueRequests, report.state.activeRequests);
  assert.ok(report.dispatch.uniqueRequests <= report.dispatch.assignments);
  assert.equal(report.reset.duplicateActive, 0);
  assert.equal(report.state.consumed, 0);
});
