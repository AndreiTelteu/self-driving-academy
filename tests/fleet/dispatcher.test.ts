import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  RIDE_DISPATCH_LIMITS,
  RIDE_DISPATCH_REJECTION_REASONS,
  RIDE_DISPATCH_RELEASE_REASONS,
  RIDE_DISPATCHER_VERSION,
  createRideDispatcher,
  dispatchAssignmentId,
} from '../../src/fleet';
import type { DispatchAssignment, DispatchTaxiStatus, FleetRegistry } from '../../src/fleet';
import {
  createDispatcherWorld,
  disposeDispatcherWorld,
  fixedWindow,
  taxiAt,
} from './dispatcher-fixture';
import { runDispatcherReport } from './dispatcher-report';

const SOURCE = join(process.cwd(), 'src', 'fleet', 'dispatcher.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '060-dispatcher', 'report.json');

function blockSlots(
  world: ReturnType<typeof createDispatcherWorld>,
  slots: readonly number[],
  status: 'BLOCKED' | 'DAMAGED' | 'OFFLINE' = 'BLOCKED',
): void {
  for (const slot of slots) world.dispatcher.setTaxiStatus(taxiAt(world, slot), status, 0);
}

function blockersAbove(
  world: ReturnType<typeof createDispatcherWorld>,
  lastOpenSlot: number,
): void {
  const slots: number[] = [];
  for (let slot = lastOpenSlot + 1; slot <= 24; slot += 1) slots.push(slot);
  blockSlots(world, slots);
}

function assignmentKey(assignment: DispatchAssignment): string {
  return `${assignment.tick}|${assignment.requestId}|${assignment.taxiId}|${assignment.pickupCostSeconds}|${assignment.tripCostSeconds}`;
}

test('060 assigns the real planner cheapest taxi and replans both legs at assignment time', () => {
  const world = createDispatcherWorld({
      windows: fixedWindow('sz:0-0', 'sz:1-0'),
      slotLanes: { 1: 'lane:00N0', 2: 'lane:00W0' },
    }),
    cheapTaxi = taxiAt(world, 2),
    expensiveTaxi = taxiAt(world, 1);
  blockersAbove(world, 2);
  world.demand.advance(10);
  const request = world.demand.pending()[0]!,
    cheap = world.planner.findRoute({
      origin: 'lane:00W0',
      destination: 'sz:0-0',
      access: 'TAXI',
    }),
    expensive = world.planner.findRoute({
      origin: 'lane:00N0',
      destination: 'sz:0-0',
      access: 'TAXI',
    }),
    trip = world.planner.findRoute({
      origin: 'sz:0-0',
      destination: 'sz:1-0',
      access: 'TAXI',
    });
  // The cheap taxi starts on the pickup lane; the "closer" start node is not the cheaper route.
  assert.equal(cheap.status, 'READY');
  assert.equal(expensive.status, 'READY');
  assert.ok(cheap.costSeconds < expensive.costSeconds);
  assert.equal(trip.status, 'READY');
  const result = world.dispatcher.step({ tick: 10 });
  assert.equal(result.assigned.length, 1);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.blocked, null);
  assert.equal(result.availableCount, 1);
  assert.equal(result.plannerSearches, 3);
  const assignment = result.assigned[0]!;
  assert.equal(assignment.taxiId, cheapTaxi);
  assert.notEqual(assignment.taxiId, expensiveTaxi);
  assert.equal(assignment.requestId, request.requestId);
  assert.equal(
    assignment.assignmentId,
    dispatchAssignmentId(world.demand.plan.namespace, request.requestId, cheapTaxi),
  );
  assert.equal(assignment.pickupCostSeconds, cheap.costSeconds);
  assert.deepEqual(assignment.pickupRouteLaneIds, cheap.path);
  assert.equal(assignment.tripCostSeconds, trip.costSeconds);
  assert.deepEqual(assignment.tripRouteLaneIds, trip.path);
  assert.equal(assignment.totalCostSeconds, cheap.costSeconds + trip.costSeconds);
  assert.equal(assignment.tick, 10);
  assert.equal(assignment.graphVersion, '033-lane-graph-v1');
  assert.equal(assignment.costVersion, 'route-cost-v1');
  assert.ok(Object.isFrozen(assignment));
  assert.deepEqual(world.dispatcher.availableTaxis(), [expensiveTaxi]);
  assert.equal(world.dispatcher.assignmentFor(request.requestId), assignment);
  assert.equal(world.dispatcher.taxiStatus(cheapTaxi), 'ASSIGNED');
  assert.equal(world.dispatcher.taxiStatus(expensiveTaxi), 'AVAILABLE');
  disposeDispatcherWorld(world);
});

test('060 never treats blocked, damaged, civilian or busy vehicles as available', () => {
  const world = createDispatcherWorld({
    windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 2 }),
  });
  blockSlots(world, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  world.dispatcher.setTaxiStatus(taxiAt(world, 1), 'BLOCKED', 0);
  world.dispatcher.setTaxiStatus(taxiAt(world, 2), 'DAMAGED', 0);
  const openTaxi = taxiAt(world, 3),
    civilian = world.civilianIds[0]!;
  assert.throws(() => world.dispatcher.setTaxiStatus(civilian, 'BLOCKED', 0), /Unknown taxi/);
  assert.ok(!world.dispatcher.availableTaxis().includes(civilian));
  assert.ok(!world.dispatcher.availableTaxis().includes(taxiAt(world, 1)));
  assert.ok(!world.dispatcher.availableTaxis().includes(taxiAt(world, 2)));
  assert.equal(world.dispatcher.taxiStatus(taxiAt(world, 1)), 'BLOCKED');
  assert.equal(world.dispatcher.taxiStatus(taxiAt(world, 2)), 'DAMAGED');
  assert.equal(world.dispatcher.taxiStatus(civilian), undefined);
  world.demand.advance(10);
  const first = world.dispatcher.step({ tick: 10 });
  assert.equal(first.assigned.length, 1);
  assert.equal(first.assigned[0]!.taxiId, openTaxi);
  assert.equal(world.dispatcher.taxiStatus(openTaxi), 'ASSIGNED');
  const second = world.dispatcher.step({ tick: 11 });
  assert.deepEqual(second.assigned, []);
  assert.equal(second.blocked?.reason, 'NO_TAXI');
  assert.equal(second.plannerSearches, 0);
  assert.equal(second.availableCount, 0);
  assert.equal(world.demand.stats().pending, 1);
  assert.ok(world.dispatcher.assignments().every((entry) => entry.taxiId === openTaxi));
  assert.throws(() => world.dispatcher.setTaxiStatus(openTaxi, 'AVAILABLE', 12), /assigned/);
  assert.throws(() => world.dispatcher.setTaxiStatus(openTaxi, 'ASSIGNED', 12), /dispatcher/);
  assert.throws(
    () => world.dispatcher.setTaxiStatus(taxiAt(world, 4), 'BROKEN', 12),
    /enum|Unsupported/i,
  );
  disposeDispatcherWorld(world);
});

test('060 never assigns one request or one taxi twice', () => {
  const world = createDispatcherWorld({
    windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 3 }),
    slotLanes: { 1: 'lane:10W0', 2: 'lane:20W0' },
  });
  blockSlots(
    world,
    [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
  );
  world.demand.advance(10);
  const first = world.dispatcher.step({ tick: 10 });
  assert.equal(first.assigned.length, 2);
  assert.equal(new Set(first.assigned.map((entry) => entry.taxiId)).size, 2);
  assert.equal(new Set(first.assigned.map((entry) => entry.requestId)).size, 2);
  assert.deepEqual(
    first.assigned.map((entry) => entry.taxiId),
    [taxiAt(world, 1), taxiAt(world, 2)],
  );
  const blocked = world.dispatcher.step({ tick: 11 });
  assert.equal(blocked.blocked?.reason, 'NO_TAXI');
  assert.equal(world.demand.stats().pending, 1);
  assert.equal(
    world.dispatcher
      .assignments()
      .filter((entry) => entry.requestId === first.assigned[0]!.requestId).length,
    1,
  );
  const release = world.dispatcher.release(taxiAt(world, 1), 'COMPLETED', 12)!;
  assert.equal(release.assignment.taxiId, taxiAt(world, 1));
  const third = world.dispatcher.step({ tick: 13 });
  assert.equal(third.assigned.length, 1);
  assert.equal(third.assigned[0]!.taxiId, taxiAt(world, 1));
  assert.equal(world.demand.stats().pending, 0);
  assert.equal(world.dispatcher.stats().assignments, 3);
  assert.equal(
    new Set(world.dispatcher.releases().map((entry) => entry.assignment.requestId)).size,
    1,
  );
  disposeDispatcherWorld(world);
});

test('060 replans the trip instead of reusing the 059 creation snapshot', () => {
  const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
  world.demand.advance(10);
  const request = world.demand.pending()[0]!;
  assert.equal(world.demand.validation(request.requestId)!.status, 'READY');
  // The stored 059 snapshot says READY; the real planner now says the dropoff lane is blocked.
  world.planner.setBlocked(['lane:10W0']);
  const result = world.dispatcher.step({ tick: 10 });
  assert.deepEqual(result.assigned, []);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0]!.requestId, request.requestId);
  assert.equal(result.rejected[0]!.reason, 'TRIP_UNREACHABLE');
  assert.equal(result.rejected[0]!.routeStatus, 'BLOCKED');
  assert.equal(result.blocked, null);
  assert.equal(result.plannerSearches, 1);
  assert.equal(world.demand.stats().pending, 0);
  assert.equal(world.demand.validation(request.requestId)!.status, 'READY');
  assert.equal(world.dispatcher.stats().rejections, 1);
  assert.equal(world.dispatcher.assignments().length, 0);
  disposeDispatcherWorld(world);

  const pickup = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
  for (const taxiId of pickup.taxiIds) pickup.positions.set(taxiId, 'lane:31W0');
  pickup.demand.advance(10);
  pickup.planner.setBlocked(['lane:31W0']);
  const blockedPickup = pickup.dispatcher.step({ tick: 10 });
  assert.deepEqual(blockedPickup.assigned, []);
  assert.deepEqual(blockedPickup.rejected, []);
  assert.equal(blockedPickup.blocked?.reason, 'PICKUP_UNREACHABLE');
  assert.equal(blockedPickup.plannerSearches, 25);
  assert.equal(pickup.demand.stats().pending, 1);
  disposeDispatcherWorld(pickup);
});

test('060 breaks equal cost by stable taxi id regardless of registry list order', () => {
  const world = createDispatcherWorld({
      windows: fixedWindow('sz:0-0', 'sz:1-0'),
      slotLanes: { 1: 'lane:10W0', 2: 'lane:10W0' },
    }),
    registry = world.registry,
    reversed: FleetRegistry = {
      configuration: registry.configuration,
      context: () => registry.context(),
      get: (vehicleId) => registry.get(vehicleId),
      state: (vehicleId) => registry.state(vehicleId),
      list: () => Object.freeze([...registry.list()].reverse()),
      addVehicle: (driverKind, classId, options) =>
        registry.addVehicle(driverKind, classId, options),
      updateState: (vehicleId, patch) => registry.updateState(vehicleId, patch),
      removeVehicle: (vehicleId) => registry.removeVehicle(vehicleId),
      counts: () => registry.counts(),
      report: () => registry.report(),
      dispose: () => registry.dispose(),
    },
    shuffled = createRideDispatcher({
      registry: reversed,
      demand: world.demand,
      planner: world.planner,
      map: world.map,
      positions: world.positions,
    });
  for (let slot = 3; slot <= 24; slot += 1)
    shuffled.setTaxiStatus(taxiAt(world, slot), 'BLOCKED', 0);
  world.demand.advance(10);
  const first = shuffled.step({ tick: 10 });
  assert.equal(first.assigned.length, 1);
  assert.equal(first.assigned[0]!.taxiId, taxiAt(world, 1));
  shuffled.dispose();
  world.dispatcher.dispose();
  world.demand.dispose();
  world.registry.dispose();
  world.planner.dispose();
});

test('060 bounds per-step assignments, candidates and real planner searches', () => {
  const tight = createDispatcherWorld({
    windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 12, endTick: 1 }),
    dispatcher: { maxRouteSearchesPerStep: 30, maxTaxiCandidates: 24 },
  });
  tight.demand.advance(0);
  assert.equal(tight.demand.pending().length, 12);
  const budgeted = tight.dispatcher.step({ tick: 0, maxAssignments: 8 });
  assert.equal(budgeted.assigned.length, 1);
  assert.equal(budgeted.plannerSearches, 25);
  assert.equal(budgeted.budgetExhausted, true);
  assert.equal(budgeted.blocked?.reason, 'ROUTE_BUDGET_EXHAUSTED');
  assert.equal(tight.demand.stats().pending, 11);
  const next = tight.dispatcher.step({ tick: 1, maxAssignments: 1 });
  assert.equal(next.assigned.length, 1);
  assert.equal(next.plannerSearches, 24);
  disposeDispatcherWorld(tight);

  const capped = createDispatcherWorld({
    windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 12, endTick: 1 }),
  });
  capped.demand.advance(0);
  const two = capped.dispatcher.step({ tick: 0, maxAssignments: 2 });
  assert.equal(two.assigned.length, 2);
  assert.equal(two.budgetExhausted, false);
  assert.equal(two.plannerSearches, 25 + 24);
  assert.equal(capped.demand.stats().pending, 10);
  assert.ok(two.assigned.length <= 2);
  const defaults = createDispatcherWorld({
    windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 12, endTick: 1 }),
  });
  defaults.demand.advance(0);
  assert.equal(defaults.dispatcher.step({ tick: 0 }).assigned.length, 4);
  assert.equal(defaults.demand.stats().pending, 8);
  assert.throws(() => capped.dispatcher.step({ tick: 1, maxAssignments: 17 }), /range/i);
  assert.throws(
    () =>
      createRideDispatcher({
        registry: capped.registry,
        demand: capped.demand,
        planner: capped.planner,
        map: capped.map,
        positions: capped.positions,
        maxRouteSearchesPerStep: 257,
      }),
    /range/i,
  );
  assert.throws(
    () =>
      createRideDispatcher({
        registry: capped.registry,
        demand: capped.demand,
        planner: capped.planner,
        map: capped.map,
        positions: capped.positions,
        maxTaxiCandidates: 31,
      }),
    /range/i,
  );
  capped.dispatcher.step({ tick: 1 });
  assert.throws(() => capped.dispatcher.step({ tick: 0 }), /Stale/);
  disposeDispatcherWorld(defaults);
  disposeDispatcherWorld(capped);
});

test('060 claims and releases explicitly, with closed release reasons and no stale ticks', () => {
  const cases = [
    { reason: 'COMPLETED', status: 'AVAILABLE' },
    { reason: 'CANCELLED', status: 'AVAILABLE' },
    { reason: 'FAILED', status: 'AVAILABLE' },
    { reason: 'TAXI_BLOCKED', status: 'BLOCKED' },
    { reason: 'TAXI_DAMAGED', status: 'DAMAGED' },
    { reason: 'TAXI_REMOVED', status: 'OFFLINE' },
  ] as const;
  for (const entry of cases) {
    const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
    world.demand.advance(10);
    const assignment = world.dispatcher.step({ tick: 10 }).assigned[0]!,
      release = world.dispatcher.release(assignment.taxiId, entry.reason, 12)!;
    assert.equal(release.reason, entry.reason);
    assert.equal(release.tick, 12);
    assert.equal(release.assignment, assignment);
    assert.equal(world.dispatcher.taxiStatus(assignment.taxiId), entry.status);
    assert.equal(
      world.dispatcher.availableTaxis().includes(assignment.taxiId),
      entry.status === 'AVAILABLE',
    );
    assert.equal(world.dispatcher.release(assignment.taxiId, entry.reason, 13), null);
    assert.equal(world.dispatcher.releases().length, 1);
    assert.equal(world.dispatcher.stats().assigned, 0);
    assert.equal(world.dispatcher.stats().releases, 1);
    disposeDispatcherWorld(world);
  }
  const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
  world.demand.advance(10);
  const assignment = world.dispatcher.step({ tick: 10 }).assigned[0]!;
  assert.throws(() => world.dispatcher.release(assignment.taxiId, 'COMPLETED', 9), /Stale/);
  assert.throws(() => world.dispatcher.release(assignment.taxiId, 'DONE', 12), /enum|Unsupported/i);
  assert.throws(() => world.dispatcher.release('id-v1:missing', 'COMPLETED', 12), /Unknown taxi/);
  disposeDispatcherWorld(world);
});

test('060 disposal returns owned state to zero and never disposes injected contracts', () => {
  const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
  world.demand.advance(10);
  const assignment = world.dispatcher.step({ tick: 10 }).assigned[0]!;
  world.dispatcher.dispose();
  world.dispatcher.dispose();
  assert.equal(world.dispatcher.stats().disposed, true);
  assert.equal(world.dispatcher.stats().assignments, 0);
  assert.equal(world.dispatcher.stats().assigned, 0);
  assert.equal(world.dispatcher.stats().routeSearches, 0);
  assert.deepEqual(world.dispatcher.assignments(), []);
  assert.deepEqual(world.dispatcher.availableTaxis(), []);
  assert.deepEqual(world.dispatcher.rejections(), []);
  assert.deepEqual(world.dispatcher.releases(), []);
  assert.equal(world.dispatcher.assignmentFor(assignment.requestId), undefined);
  assert.equal(world.dispatcher.taxiStatus(assignment.taxiId), undefined);
  assert.throws(() => world.dispatcher.step({ tick: 11 }), /disposed/);
  assert.throws(() => world.dispatcher.release(assignment.taxiId, 'COMPLETED', 11), /disposed/);
  assert.throws(
    () => world.dispatcher.setTaxiStatus(assignment.taxiId, 'AVAILABLE', 11),
    /disposed/,
  );
  assert.equal(world.demand.pending().length, 0);
  assert.equal(world.demand.stats().pending, 0);
  assert.equal(world.registry.counts().taxis, 24);
  assert.equal(world.planner.getStats().disposed, false);
  disposeDispatcherWorld(world);
});

test('060 never reads a wall clock, ambient randomness or a renderer', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(
    source,
    /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/,
  );
  assert.doesNotMatch(source, /\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/);
  const run = () => {
    const world = createDispatcherWorld({
      windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 5, endTick: 5 }),
    });
    world.demand.advance(10);
    const first = world.dispatcher.step({ tick: 10 });
    world.dispatcher.release(first.assigned[0]!.taxiId, 'COMPLETED', 11);
    const second = world.dispatcher.step({ tick: 12 });
    const result = [...first.assigned, ...second.assigned].map(assignmentKey);
    disposeDispatcherWorld(world);
    return result;
  };
  const originalNow = Date.now;
  try {
    Date.now = () => 1;
    const first = run();
    Date.now = () => 9_999_999;
    const second = run();
    assert.deepEqual(second, first);
  } finally {
    Date.now = originalNow;
  }
});

test('060 exposes only the closed vocabularies', () => {
  assert.equal(RIDE_DISPATCHER_VERSION, '060-ride-dispatcher-v1');
  assert.deepEqual(
    [...RIDE_DISPATCH_REJECTION_REASONS],
    ['NO_TAXI', 'NO_POSITION', 'PICKUP_UNREACHABLE', 'TRIP_UNREACHABLE', 'ROUTE_BUDGET_EXHAUSTED'],
  );
  assert.deepEqual(
    [...RIDE_DISPATCH_RELEASE_REASONS],
    ['COMPLETED', 'CANCELLED', 'FAILED', 'TAXI_BLOCKED', 'TAXI_DAMAGED', 'TAXI_REMOVED'],
  );
  const statuses: readonly DispatchTaxiStatus[] = [
    'AVAILABLE',
    'ASSIGNED',
    'BLOCKED',
    'DAMAGED',
    'OFFLINE',
  ];
  assert.equal(new Set(statuses).size, 5);
  assert.ok(RIDE_DISPATCH_LIMITS.taxiCandidates >= 24);
  assert.ok(
    RIDE_DISPATCH_LIMITS.routeSearchesPerStep <= RIDE_DISPATCH_LIMITS.maximumRouteSearchesPerStep,
  );
});

test('060 committed evidence report is the current dispatcher transcript', () => {
  const report = runDispatcherReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runDispatcherReport>;
  assert.deepEqual(
    saved,
    JSON.parse(JSON.stringify(report)) as ReturnType<typeof runDispatcherReport>,
  );
});
