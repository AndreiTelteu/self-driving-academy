import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  FLEET_HEALTH_FACTS,
  FLEET_HEALTH_LIMITS,
  FLEET_HEALTH_VERSION,
  FLEET_RESET_POLICIES,
  FLEET_SCENARIO_LIMITS,
  FLEET_SCENARIO_TAXI_PRESETS,
  FLEET_SCENARIO_VERSION,
  createFleetHealth,
  createFleetScenario,
  fleetHealthStates,
  fleetScenarioReport,
} from '../../src/fleet';
import {
  createHealthWorld,
  disposeHealthWorld,
  rideObservation,
  rideOf,
} from './fleet-health-fixture';
import type { HealthWorld } from './fleet-health-fixture';
import { runFleetHealthReport } from './fleet-health-report';

const HEALTH_SOURCE = join(process.cwd(), 'src', 'fleet', 'fleet-health.ts');
const SCENARIO_SOURCE = join(process.cwd(), 'src', 'fleet', 'scenario-fixture.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '065-fleet-health', 'report.json');

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function coherentState(world: HealthWorld): Record<string, unknown> {
  const { scenario } = world;
  return {
    assignments: scenario.dispatcher.assignments(),
    releases: scenario.dispatcher.releases(),
    active: scenario.lifecycle.active(),
    terminal: scenario.lifecycle.terminal(),
    pending: scenario.demand.pending(),
    estimates: scenario.eta.estimates(),
    health: scenario.health.list(),
    dispatcher: scenario.dispatcher.stats(),
    demand: scenario.demand.stats(),
    eta: scenario.eta.stats(),
    lifecycle: scenario.lifecycle.stats(),
    population: scenario.registry.report(),
  };
}

test('065 health states are driven by the closed block, damage and recovery facts', () => {
  const world = createHealthWorld({ requests: 1, openTaxis: 20, assign: 1 }),
    { scenario } = world,
    taxiId = scenario.taxiIds[1]!;
  const apply = (fact: string, factId: string, tick: number) =>
    scenario.health.apply({ taxiId, fact, factId, tick });
  assert.deepEqual(apply('TRAFFIC_BLOCK', 'block:1', 1).entry, {
    taxiId,
    state: 'BLOCKED',
    cause: 'TRAFFIC_BLOCK',
    tick: 1,
    factId: 'block:1',
  });
  assert.equal(apply('IMMOBILIZATION', 'block:2', 2).entry.state, 'BLOCKED');
  assert.equal(apply('IMMOBILIZATION', 'block:2', 2).entry.cause, 'IMMOBILIZATION');
  const damage = apply('COLLISION_DAMAGE', 'damage:1', 3).entry;
  assert.equal(damage.state, 'DAMAGED');
  assert.equal(damage.cause, 'COLLISION_DAMAGE');
  assert.equal(damage.tick, 3);
  assert.equal(apply('RECOVERY', 'recovery:1', 4).entry.state, 'AVAILABLE');
  assert.equal(apply('RECOVERY', 'recovery:1', 4).entry.cause, null);
  assert.equal(apply('SERVICE_WITHDRAWN', 'offline:1', 5).entry.state, 'OFFLINE');
  assert.equal(apply('SERVICE_RETURNED', 'offline:2', 6).entry.state, 'AVAILABLE');
  assert.equal(scenario.health.health(taxiId)!.state, 'AVAILABLE');
  assert.equal(scenario.health.health(taxiId)!.cause, null);
  assert.equal(scenario.health.report().available, 20);
  assert.equal(scenario.health.report().damaged, 0);
  assert.equal(scenario.health.report().offline, 0);
  assert.equal(scenario.health.stats().facts, 6);
  assert.equal(scenario.health.stats().damageFacts, 1);
  assert.equal(scenario.health.stats().blockFacts, 2);
  assert.equal(scenario.health.stats().offlineFacts, 1);
  assert.equal(scenario.health.stats().recoveries, 2);
  assert.equal(scenario.health.health(scenario.civilianIds[0]!), undefined);
  assert.equal(scenario.health.health('id-v1:missing'), undefined);
  disposeHealthWorld(world);
});

test('065 closes the claimed ride with the fact terminal reason when the taxi is damaged', () => {
  const world = createHealthWorld({ requests: 1, openTaxis: 1, assign: 1 }),
    { scenario, assignments } = world,
    assignment = assignments[0]!,
    ride = rideOf(world, assignment);
  assert.equal(ride.state, 'TO_PICKUP');
  const change = scenario.health.apply({
    taxiId: assignment.taxiId,
    fact: 'COLLISION_DAMAGE',
    factId: 'damage:ride',
    tick: 60,
  });
  assert.equal(change.duplicate, false);
  assert.equal(change.release, null);
  assert.ok(change.ride !== null);
  assert.equal(change.ride.ride.terminal, true);
  assert.equal(change.ride.ride.state, 'FAILED');
  assert.equal(change.ride.ride.reason, 'TAXI_DAMAGED');
  assert.equal(change.ride.ride.release!.reason, 'FAILED');
  assert.equal(scenario.dispatcher.assignmentFor(assignment.requestId), undefined);
  assert.deepEqual(scenario.dispatcher.assignments(), []);
  assert.equal(scenario.dispatcher.taxiStatus(assignment.taxiId), 'DAMAGED');
  assert.equal(scenario.dispatcher.stats().damagedTaxis, 1);
  assert.equal(scenario.dispatcher.releases().length, 1);
  assert.equal(scenario.dispatcher.releases()[0]!.reason, 'FAILED');
  assert.deepEqual(
    scenario.lifecycle.active().map((entry) => entry.rideId),
    [],
  );
  assert.equal(scenario.lifecycle.terminal()[0]!.reason, 'TAXI_DAMAGED');
  assert.equal(scenario.health.health(assignment.taxiId)!.state, 'DAMAGED');
  assert.equal(scenario.health.health(assignment.taxiId)!.cause, 'COLLISION_DAMAGE');
  assert.equal(scenario.health.stats().closedRides, 1);
  assert.equal(scenario.health.stats().releasedClaims, 0);
  assert.equal(scenario.health.report().consistent, true);
  assert.equal(scenario.health.report().assigned, 0);
  disposeHealthWorld(world);
});

test('065 releases a claim without an active ride with the matching closed reason', () => {
  const world = createHealthWorld({ requests: 2, openTaxis: 2, assign: 2, beginRides: false }),
    { scenario, assignments } = world,
    first = assignments[0]!,
    second = assignments[1]!;
  const blocked = scenario.health.apply({
    taxiId: first.taxiId,
    fact: 'TRAFFIC_BLOCK',
    factId: 'block:claim',
    tick: 60,
  });
  assert.equal(blocked.ride, null);
  assert.equal(blocked.release!.reason, 'TAXI_BLOCKED');
  assert.equal(scenario.dispatcher.taxiStatus(first.taxiId), 'BLOCKED');
  assert.equal(scenario.dispatcher.assignmentFor(first.requestId), undefined);
  const withdrawn = scenario.health.apply({
    taxiId: second.taxiId,
    fact: 'SERVICE_WITHDRAWN',
    factId: 'offline:claim',
    tick: 61,
  });
  assert.equal(withdrawn.release!.reason, 'TAXI_REMOVED');
  assert.equal(scenario.dispatcher.taxiStatus(second.taxiId), 'OFFLINE');
  assert.deepEqual(scenario.dispatcher.assignments(), []);
  assert.deepEqual(
    scenario.dispatcher.releases().map((entry) => entry.reason),
    ['TAXI_BLOCKED', 'TAXI_REMOVED'],
  );
  assert.equal(scenario.health.stats().closedRides, 0);
  assert.equal(scenario.health.stats().releasedClaims, 2);
  assert.equal(scenario.health.report().blocked, 1);
  assert.equal(scenario.health.report().offline, 19);
  assert.equal(scenario.health.report().consistent, true);
  disposeHealthWorld(world);
});

test('065 never assigns a damaged, blocked or offline taxi', () => {
  const scenario = createFleetScenario({
      taxiCount: 20,
      civilianCount: 20,
      requestsPerWindow: 2,
    }),
    [first, second] = scenario.taxiIds;
  for (let index = 2; index < scenario.taxiIds.length; index += 1) {
    const taxiId = scenario.taxiIds[index]!;
    scenario.health.apply({
      taxiId,
      fact: 'SERVICE_WITHDRAWN',
      factId: `availability:offline:${taxiId}`,
      tick: 0,
    });
  }
  scenario.health.apply({
    taxiId: first!,
    fact: 'COLLISION_DAMAGE',
    factId: 'availability:damage',
    tick: 0,
  });
  scenario.demand.advance(59);
  const availableBefore = scenario.dispatcher.availableTaxis(),
    step = scenario.dispatcher.step({ tick: 59, maxAssignments: 1 });
  assert.equal(step.assigned.length, 1);
  assert.equal(step.assigned[0]!.taxiId, second);
  assert.equal(availableBefore.includes(first!), false);
  assert.equal(availableBefore.includes(second!), true);
  assert.equal(scenario.dispatcher.taxiStatus(second!), 'ASSIGNED');
  assert.equal(scenario.dispatcher.taxiStatus(first!), 'DAMAGED');
  scenario.dispose();

  const blocked = createFleetScenario({
    taxiCount: 20,
    civilianCount: 20,
    requestsPerWindow: 1,
  });
  for (const taxiId of blocked.taxiIds) {
    blocked.health.apply({
      taxiId,
      fact: 'COLLISION_DAMAGE',
      factId: `all:damage:${taxiId}`,
      tick: 0,
    });
  }
  blocked.demand.advance(59);
  const none = blocked.dispatcher.step({ tick: 59, maxAssignments: 1 });
  assert.deepEqual(none.assigned, []);
  assert.equal(none.blocked!.reason, 'NO_TAXI');
  assert.deepEqual(blocked.dispatcher.assignments(), []);
  blocked.dispose();
});

test('065 reset closes a ride whose taxi disappeared instead of leaving it allocated', () => {
  const world = createHealthWorld({ requests: 1, openTaxis: 1, assign: 1 }),
    { scenario, assignments } = world,
    assignment = assignments[0]!,
    ride = rideOf(world, assignment);
  assert.equal(scenario.registry.removeVehicle(assignment.taxiId), true);
  assert.equal(scenario.registry.get(assignment.taxiId), undefined);
  assert.ok(
    throws(
      () => scenario.dispatcher.step({ tick: 60, maxAssignments: 1 }),
      /missing from the fleet/,
    ),
  );
  const result = scenario.health.reset({ tick: 100 });
  assert.equal(result.closedRides.length, 1);
  assert.equal(result.closedRides[0]!.rideId, ride.rideId);
  assert.equal(result.closedRides[0]!.reason, 'SCENARIO_RESET');
  assert.deepEqual(result.discardedRides, []);
  assert.deepEqual(scenario.dispatcher.assignments(), []);
  assert.equal(scenario.dispatcher.stats().assigned, 0);
  assert.deepEqual(scenario.lifecycle.active(), []);
  assert.equal(scenario.lifecycle.stats().rides, 0);
  assert.equal(scenario.health.list().length, 19);
  assert.equal(
    scenario.health.list().every((entry) => entry.state === 'AVAILABLE'),
    true,
  );
  assert.equal(scenario.health.report().consistent, true);
  assert.deepEqual(scenario.demand.pending(), []);
  assert.deepEqual(scenario.eta.estimates(), []);
  disposeHealthWorld(world);
});

test('065 reset is coherent, idempotent and leaves no ride, claim, queue or estimate', () => {
  const world = createHealthWorld({ requests: 2, openTaxis: 2, assign: 2 }),
    { scenario, assignments } = world,
    rides = assignments.map((assignment) => rideOf(world, assignment));
  for (const ride of rides)
    assert.equal(scenario.eta.observe(rideObservation(world, ride, 60)).status, 'ESTIMATED');
  const rideIds = rides.map((ride) => ride.rideId),
    requestIds = assignments.map((assignment) => assignment.requestId),
    before = coherentState(world),
    first = scenario.health.reset({ tick: 100 });
  assert.equal(first.closedRides.length, 2);
  assert.equal(first.releasedAssignments.length, 0);
  assert.equal(first.clearedHealth, 18);
  assert.equal(first.stats, 'RESET');
  assert.equal(first.profiles, 'RESET');
  assert.equal(first.resetProfiles, 40);
  for (const rideId of rideIds) assert.equal(scenario.lifecycle.ride(rideId), undefined);
  for (const requestId of requestIds)
    assert.equal(scenario.dispatcher.assignmentFor(requestId), undefined);
  assert.deepEqual(scenario.lifecycle.active(), []);
  assert.deepEqual(scenario.lifecycle.terminal(), []);
  assert.equal(scenario.lifecycle.stats().rides, 0);
  assert.equal(scenario.lifecycle.stats().completed, 0);
  assert.equal(scenario.lifecycle.stats().failed, 0);
  assert.deepEqual(scenario.dispatcher.assignments(), []);
  assert.deepEqual(scenario.dispatcher.releases(), []);
  assert.equal(scenario.dispatcher.stats().available, 20);
  assert.equal(scenario.dispatcher.stats().assigned, 0);
  assert.deepEqual(scenario.demand.pending(), []);
  assert.equal(scenario.demand.stats().pending, 0);
  assert.equal(scenario.demand.stats().admitted, 0);
  assert.equal(scenario.demand.stats().dequeued, 0);
  assert.deepEqual(scenario.eta.estimates(), []);
  assert.equal(scenario.eta.stats().observations, 0);
  assert.equal(scenario.eta.currentTick(), 0);
  assert.equal(scenario.health.history().length, 0);
  assert.equal(scenario.health.stats().facts, 0);
  assert.equal(scenario.health.stats().closedRides, 0);
  assert.equal(
    scenario.health.list().every((entry) => entry.state === 'AVAILABLE'),
    true,
  );
  assert.equal(scenario.health.report().consistent, true);
  assert.equal(scenario.health.report().available, 20);
  assert.equal(scenario.health.report().assigned, 0);
  const afterFirst = coherentState(world),
    second = scenario.health.reset({ tick: 100 }),
    afterSecond = coherentState(world);
  assert.deepEqual(second.closedRides, []);
  assert.deepEqual(second.releasedAssignments, []);
  assert.equal(second.clearedHealth, 0);
  assert.deepEqual(afterFirst, afterSecond);
  assert.notDeepEqual(before, afterFirst);
  assert.equal(scenario.health.stats().resets, 2);
  disposeHealthWorld(world);
});

test('065 reset rewinds demand and ETA, then the next scenario runs without stale ids', () => {
  const world = createHealthWorld({ requests: 1, openTaxis: 1, assign: 1 }),
    { scenario, assignments } = world,
    assignment = assignments[0]!,
    oldRide = rideOf(world, assignment),
    observed = scenario.eta.observe(rideObservation(world, oldRide, 60));
  assert.equal(observed.status, 'ESTIMATED');
  const reset = scenario.health.reset({ tick: 100 });
  assert.equal(reset.closedRides.length, 1);
  assert.equal(scenario.eta.estimate(oldRide.rideId), undefined);
  assert.equal(scenario.lifecycle.ride(oldRide.rideId), undefined);
  assert.equal(scenario.dispatcher.assignmentFor(assignment.requestId), undefined);

  scenario.demand.advance(159);
  const next = scenario.dispatcher.step({ tick: 159, maxAssignments: 1 }).assigned;
  assert.equal(next.length, 1);
  assert.equal(next[0]!.requestId, assignment.requestId);
  assert.notEqual(next[0]!.taxiId, '');
  assert.notEqual(next[0]!.assignmentId, assignment.assignmentId);
  assert.equal(scenario.dispatcher.taxiStatus(next[0]!.taxiId), 'ASSIGNED');
  const begun = scenario.lifecycle.begin({
    requestId: next[0]!.requestId,
    eventId: `assigned:again:${next[0]!.requestId}`,
    tick: 159,
  });
  assert.equal(begun.duplicate, false);
  assert.equal(begun.ride.rideId, oldRide.rideId);
  assert.equal(begun.ride.state, 'TO_PICKUP');
  assert.equal(scenario.eta.estimate(begun.ride.rideId), undefined);
  const fresh = scenario.eta.observe(rideObservation(world, begun.ride, 160));
  assert.equal(fresh.status, 'ESTIMATED');
  assert.equal(fresh.rideId, begun.ride.rideId);
  // The reset cleared fact-id memory, so the same semantic id is accepted in the new scenario.
  const damage = scenario.health.apply({
    taxiId: begun.ride.taxiId,
    fact: 'COLLISION_DAMAGE',
    factId: `fixture:withdrawn:${scenario.taxiIds[19]}`,
    tick: 161,
  });
  assert.equal(damage.duplicate, false);
  assert.equal(damage.ride!.ride.reason, 'TAXI_DAMAGED');
  assert.equal(scenario.lifecycle.terminal()[0]!.reason, 'TAXI_DAMAGED');
  assert.deepEqual(scenario.dispatcher.assignments(), []);
  assert.equal(scenario.health.report().consistent, true);
  disposeHealthWorld(world);
});

test('065 reset keeps statistics and profiles only when explicitly asked', () => {
  const preserved = createHealthWorld({ requests: 1, openTaxis: 2, assign: 1 }),
    preservedProfileTaxi = preserved.scenario.taxiIds[1]!;
  preserved.scenario.registry.updateState(preservedProfileTaxi, {
    tick: 60,
    appliedProfileVersion: 'profile-v2',
  });
  const preservedResult = preserved.scenario.health.reset({
    tick: 100,
    stats: 'PRESERVE',
    profiles: 'PRESERVE',
  });
  assert.equal(preservedResult.stats, 'PRESERVE');
  assert.equal(preservedResult.profiles, 'PRESERVE');
  assert.equal(preservedResult.resetProfiles, 0);
  assert.equal(
    preserved.scenario.registry.state(preservedProfileTaxi)!.appliedProfileVersion,
    'profile-v2',
  );
  assert.equal(preserved.scenario.health.stats().facts > 0, true);
  assert.equal(
    preserved.scenario.health.list().every((entry) => entry.state === 'AVAILABLE'),
    true,
  );
  assert.equal(preserved.scenario.health.report().consistent, true);
  disposeHealthWorld(preserved);

  const cleared = createHealthWorld({ requests: 1, openTaxis: 2, assign: 1 }),
    clearedProfileTaxi = cleared.scenario.taxiIds[1]!;
  cleared.scenario.registry.updateState(clearedProfileTaxi, {
    tick: 60,
    appliedProfileVersion: 'profile-v2',
  });
  const clearedResult = cleared.scenario.health.reset({
    tick: 100,
    stats: 'RESET',
    profiles: 'RESET',
  });
  assert.equal(clearedResult.resetProfiles, 40);
  assert.equal(
    cleared.scenario.registry.state(clearedProfileTaxi)!.appliedProfileVersion,
    'profile-v1',
  );
  assert.equal(cleared.scenario.health.stats().facts, 0);
  assert.ok(
    throws(() => cleared.scenario.health.reset({ tick: 101, stats: 'KEEP' }), /enum|Unsupported/i),
  );
  disposeHealthWorld(cleared);
});

test('065 scenario fixture is reproducible for the 20/24/30 taxi presets', () => {
  assert.deepEqual([...FLEET_SCENARIO_TAXI_PRESETS], [20, 24, 30]);
  assert.equal(FLEET_SCENARIO_VERSION, '065-fleet-scenario-v1');
  assert.equal(FLEET_SCENARIO_LIMITS.civiliansMaximum, 40);
  for (const taxiCount of FLEET_SCENARIO_TAXI_PRESETS) {
    const first = createFleetScenario({ taxiCount, civilianCount: 40 }),
      second = createFleetScenario({ taxiCount, civilianCount: 40 });
    const report = fleetScenarioReport(first);
    assert.deepEqual(report, fleetScenarioReport(second));
    assert.equal(report.configuration.taxiCount, taxiCount);
    assert.equal(report.configuration.civilianCount, 40);
    assert.equal(report.population.taxis, taxiCount);
    assert.equal(report.population.civilians, 40);
    assert.equal(report.population.total, taxiCount + 40);
    assert.equal(report.requests.length, 32);
    assert.equal(report.taxis.length, taxiCount);
    assert.equal(new Set(report.taxis.map((entry) => entry.vehicle.vehicleId)).size, taxiCount);
    assert.equal(
      report.taxis.every((entry) => entry.laneId !== null),
      true,
    );
    assert.equal(report.civilians, 40);
    if (taxiCount === 20) {
      first.demand.advance(59);
      const step = first.dispatcher.step({ tick: 59, maxAssignments: 4 });
      assert.equal(step.assigned.length, 4);
    }
    first.dispose();
    second.dispose();
    first.dispose();
  }
});

test('065 is pure, deterministic and disposes only its own state', () => {
  for (const source of [HEALTH_SOURCE, SCENARIO_SOURCE]) {
    const code = readFileSync(source, 'utf8');
    assert.equal(
      /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        code,
      ),
      false,
    );
    assert.equal(
      /\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(code),
      false,
    );
  }
  const run = (): unknown => {
    const world = createHealthWorld({ requests: 1, openTaxis: 1, assign: 1 }),
      assignment = world.assignments[0]!;
    world.scenario.health.apply({
      taxiId: assignment.taxiId,
      fact: 'COLLISION_DAMAGE',
      factId: 'pure:damage',
      tick: 60,
    });
    const state = {
      health: world.scenario.health.list(),
      history: world.scenario.health.history(),
      dispatcher: world.scenario.dispatcher.assignments(),
      lifecycle: world.scenario.lifecycle.terminal(),
    };
    disposeHealthWorld(world);
    return state;
  };
  assert.deepEqual(run(), run());

  const world = createHealthWorld({ requests: 1, openTaxis: 1, assign: 1 }),
    { scenario } = world,
    taxiId = scenario.taxiIds[0]!;
  scenario.health.dispose();
  scenario.health.dispose();
  const stats = scenario.health.stats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.facts, 0);
  assert.equal(stats.available, 0);
  assert.deepEqual(scenario.health.list(), []);
  assert.deepEqual(scenario.health.history(), []);
  assert.equal(scenario.health.health(taxiId), undefined);
  assert.equal(scenario.health.report().disposed, true);
  assert.ok(
    throws(
      () => scenario.health.apply({ taxiId, fact: 'RECOVERY', factId: 'x', tick: 1 }),
      /disposed/,
    ),
  );
  assert.ok(throws(() => scenario.health.reset({ tick: 100 }), /disposed/));
  // Health never disposes the injected dispatcher: the claim and the taxi status remain readable.
  assert.notEqual(scenario.dispatcher.taxiStatus(taxiId), undefined);
  disposeHealthWorld(world);
});

test('065 keeps the versioned contract, closed vocabularies and bounded validation', () => {
  assert.equal(FLEET_HEALTH_VERSION, '065-fleet-health-v1');
  assert.deepEqual([...fleetHealthStates], ['AVAILABLE', 'BLOCKED', 'DAMAGED', 'OFFLINE']);
  assert.deepEqual(
    [...FLEET_HEALTH_FACTS],
    [
      'TRAFFIC_BLOCK',
      'IMMOBILIZATION',
      'COLLISION_DAMAGE',
      'RECOVERY',
      'SERVICE_WITHDRAWN',
      'SERVICE_RETURNED',
    ],
  );
  assert.deepEqual([...FLEET_RESET_POLICIES], ['RESET', 'PRESERVE']);
  assert.equal(FLEET_HEALTH_LIMITS.taxis, 30);
  assert.equal(FLEET_HEALTH_LIMITS.historyEntries, 256);
  assert.equal(FLEET_HEALTH_LIMITS.factIds, 1024);
  assert.ok(throws(() => createFleetHealth({}), /dispatcher/));
  const world = createHealthWorld({ requests: 1, openTaxis: 1, assign: 1 }),
    { scenario } = world,
    taxiId = scenario.taxiIds[0]!,
    base = {
      dispatcher: scenario.dispatcher,
      lifecycle: scenario.lifecycle,
      demand: scenario.demand,
      eta: scenario.eta,
      registry: scenario.registry,
    };
  assert.ok(
    throws(() => createFleetHealth({ ...base, extra: true }), /Unknown fleet health option/),
  );
  assert.ok(
    throws(() => createFleetHealth({ ...base, lifecycle: { namespace: 'x' } }), /lifecycle/),
  );
  assert.ok(
    throws(
      () => scenario.health.apply({ taxiId, fact: 'RECOVERY', factId: 'x', tick: 1, extra: true }),
      /Unknown|Unexpected|field/i,
    ),
  );
  assert.ok(
    throws(
      () => scenario.health.apply({ taxiId, fact: 'EXPLODED', factId: 'x', tick: 1 }),
      /enum|Unsupported/i,
    ),
  );
  assert.ok(
    throws(
      () =>
        scenario.health.apply({
          taxiId,
          fact: 'RECOVERY',
          factId: 'x'.repeat(FLEET_HEALTH_LIMITS.factIdCodeUnits + 1),
          tick: 1,
        }),
      /length/,
    ),
  );
  assert.ok(
    throws(
      () => scenario.health.apply({ taxiId, fact: 'RECOVERY', factId: 'x', tick: 1.5 }),
      /integer/,
    ),
  );
  assert.ok(
    throws(
      () =>
        scenario.health.apply({ taxiId: 'id-v1:missing', fact: 'RECOVERY', factId: 'x', tick: 1 }),
      /Unknown taxi/,
    ),
  );
  assert.ok(
    throws(
      () =>
        scenario.health.apply({
          taxiId: scenario.civilianIds[0]!,
          fact: 'RECOVERY',
          factId: 'x',
          tick: 1,
        }),
      /Unknown taxi/,
    ),
  );
  assert.ok(throws(() => scenario.health.reset({}), /requires a tick/));
  assert.ok(throws(() => scenario.health.reset({ tick: 100, extra: true }), /Unknown/));
  scenario.lifecycle.advance(200);
  assert.ok(throws(() => scenario.health.reset({ tick: 150 }), /Stale fleet reset tick/));
  disposeHealthWorld(world);
});

test('065 fact application is idempotent by fact id and rejects conflicts', () => {
  const world = createHealthWorld({ requests: 1, openTaxis: 1, assign: 1 }),
    { scenario, assignments } = world,
    taxiId = assignments[0]!.taxiId,
    input = { taxiId, fact: 'COLLISION_DAMAGE', factId: 'once', tick: 60 },
    first = scenario.health.apply(input),
    replay = scenario.health.apply(input);
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.deepEqual(replay.entry, first.entry);
  assert.equal(replay.release, null);
  assert.equal(replay.ride, null);
  assert.equal(scenario.lifecycle.terminal().length, 1);
  assert.equal(scenario.dispatcher.releases().length, 1);
  assert.equal(scenario.health.stats().closedRides, 1);
  assert.ok(
    throws(() => scenario.health.apply({ ...input, fact: 'TRAFFIC_BLOCK', tick: 61 }), /conflict/),
  );
  assert.ok(
    throws(
      () => scenario.health.apply({ ...input, taxiId: scenario.taxiIds[1]!, tick: 61 }),
      /conflict/,
    ),
  );
  disposeHealthWorld(world);
});

test('065 committed evidence report is the current fleet health transcript', () => {
  const report = runFleetHealthReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runFleetHealthReport>;
  assert.deepEqual(
    saved,
    JSON.parse(JSON.stringify(report)) as ReturnType<typeof runFleetHealthReport>,
  );
});
