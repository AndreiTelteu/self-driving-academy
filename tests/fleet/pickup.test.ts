import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  PICKUP_DEFAULTS,
  PICKUP_LIMITS,
  PICKUP_REJECTION_REASONS,
  PICKUP_VERSION,
  createRidePickup,
  pickupArrivedEventId,
  pickupBoardedEventId,
} from '../../src/fleet';
import {
  boardAt,
  createPickupWorld,
  disposePickupWorld,
  holdAndBoard,
  holdStationary,
  pickupObservation,
  zoneBounds,
} from './pickup-fixture';
import { runPickupReport } from './pickup-report';

const SOURCE = join(process.cwd(), 'src', 'fleet', 'pickup.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '062-pickup', 'report.json');

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

test('062 boards only at the exact stationary dwell tick inside the real pickup zone', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world,
    required = pickup.requiredDwellTicks,
    startTick = 20;
  assert.equal(required, PICKUP_DEFAULTS.dwellTicks);
  for (let offset = 0; offset < required; offset += 1) {
    const decision = pickup.observe(pickupObservation(world, { tick: startTick + offset }));
    assert.equal(decision.status, 'PENDING');
    assert.equal(decision.reason, 'NOT_STATIONARY');
    assert.equal(decision.inPickupZone, true);
    assert.equal(decision.dwellTicks, offset);
    assert.equal(decision.dwellSeconds, offset / pickup.tickRateHz);
    assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_PICKUP');
    assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 1);
  }
  const boarded = pickup.observe(pickupObservation(world, { tick: startTick + required }));
  assert.equal(boarded.status, 'BOARDED');
  assert.equal(boarded.reason, null);
  assert.equal(boarded.duplicate, false);
  assert.equal(boarded.dwellTicks, required);
  assert.equal(boarded.dwellSeconds, required / pickup.tickRateHz);
  assert.equal(boarded.tick, startTick + required);
  assert.equal(boarded.inPickupZone, true);
  assert.ok(boarded.boarding !== null);
  assert.equal(boarded.boarding!.rideId, world.rideId);
  assert.equal(boarded.boarding!.requestId, world.assignment.requestId);
  assert.equal(boarded.boarding!.taxiId, world.assignment.taxiId);
  assert.equal(boarded.boarding!.pickupZoneId, world.pickupZoneId);
  assert.equal(boarded.boarding!.fromState, 'TO_PICKUP');
  assert.equal(boarded.boarding!.toState, 'TO_DROPOFF');
  assert.equal(boarded.boarding!.dwellTicks, required);
  assert.equal(boarded.boarding!.arrivedEventId, pickupArrivedEventId(world.assignment.requestId));
  assert.equal(boarded.boarding!.completeEventId, pickupBoardedEventId(world.assignment.requestId));

  const ride = rideWorld.lifecycle.ride(world.rideId)!;
  assert.equal(ride.state, 'TO_DROPOFF');
  assert.equal(ride.terminal, false);
  assert.equal(ride.release, null);
  assert.equal(ride.transitions.length, 3);
  assert.deepEqual(
    ride.transitions.map((entry) => entry.event),
    ['ASSIGNED', 'ARRIVED_PICKUP', 'PICKUP_COMPLETE'],
  );
  assert.deepEqual(ride.appliedEventIds, [
    `assigned:${world.assignment.requestId}`,
    pickupArrivedEventId(world.assignment.requestId),
    pickupBoardedEventId(world.assignment.requestId),
  ]);
  assert.equal(ride.transitions[2]!.tick, startTick + required);
  assert.equal(
    rideWorld.dispatcherWorld.dispatcher.assignmentFor(world.assignment.requestId)?.assignmentId,
    world.assignment.assignmentId,
  );
  assert.equal(
    rideWorld.dispatcherWorld.dispatcher.taxiStatus(world.assignment.taxiId),
    'ASSIGNED',
  );
  assert.equal(rideWorld.dispatcherWorld.dispatcher.releases().length, 0);
  assert.equal(pickup.attempt(world.rideId)?.boardedTick, startTick + required);
  assert.equal(pickup.stats().boarded, 1);
  assert.equal(pickup.stats().pending, required);
  assert.equal(pickup.stats().rejected, 0);
  assert.equal(pickup.currentTick(), startTick + required);
  disposePickupWorld(world);
});

test('062 refuses a fast pass through the zone and never credits dwell at speed', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world;
  for (let tick = 20; tick <= 260; tick += 1) {
    const decision = pickup.observe(pickupObservation(world, { tick, speedMps: 5 }));
    assert.equal(decision.status, 'REJECTED');
    assert.equal(decision.reason, 'TOO_FAST');
    assert.equal(decision.dwellTicks, 0);
    assert.equal(decision.speedMps, 5);
  }
  const ride = rideWorld.lifecycle.ride(world.rideId)!;
  assert.equal(ride.state, 'TO_PICKUP');
  assert.equal(ride.transitions.length, 1);
  assert.equal(pickup.boardings().length, 0);
  assert.equal(pickup.stats().pending, 0);
  assert.equal(pickup.stats().rejected, 241);
  assert.equal(pickup.stats().byReason.TOO_FAST, 241);

  // Stopping afterwards starts a fresh proof at zero and completes only after the full dwell.
  let decision = pickup.observe(pickupObservation(world, { tick: 261 }));
  assert.equal(decision.dwellTicks, 0);
  assert.equal(decision.reason, 'NOT_STATIONARY');
  for (let tick = 262; tick < 261 + pickup.requiredDwellTicks; tick += 1) {
    decision = pickup.observe(pickupObservation(world, { tick }));
    assert.equal(decision.reason, 'NOT_STATIONARY');
  }
  assert.equal(decision.dwellTicks, pickup.requiredDwellTicks - 1);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_PICKUP');
  const boarded = pickup.observe(
    pickupObservation(world, { tick: 261 + pickup.requiredDwellTicks }),
  );
  assert.equal(boarded.status, 'BOARDED');
  assert.equal(boarded.dwellTicks, pickup.requiredDwellTicks);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_DROPOFF');
  disposePickupWorld(world);
});

test('062 never boards a taxi that only passes through the pickup zone', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world,
    bounds = zoneBounds(world.rideWorld.dispatcherWorld.map, world.pickupZoneId),
    steps = 13;
  let insideSamples = 0;
  for (let index = 0; index < steps; index += 1) {
    const x = bounds.minX - 2 + ((bounds.maxX - bounds.minX + 4) * index) / (steps - 1),
      decision = pickup.observe(
        pickupObservation(world, {
          tick: 20 + index,
          positionM: { x, y: 0, z: world.pickupZoneCenter.z },
          speedMps: 8,
        }),
      );
    if (decision.inPickupZone) insideSamples += 1;
    assert.notEqual(decision.status, 'BOARDED');
    assert.equal(decision.dwellTicks, 0);
  }
  assert.equal(insideSamples, 7);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_PICKUP');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 1);
  assert.equal(pickup.boardings().length, 0);

  // A genuine stop after the pass starts a fresh proof and boards at the exact dwell.
  const boarded = holdAndBoard(world, 40);
  assert.equal(boarded.status, 'BOARDED');
  assert.equal(boarded.dwellTicks, pickup.requiredDwellTicks);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_DROPOFF');
  disposePickupWorld(world);
});

test('062 rejects outside, nearby and wrong-kind zones without starting dwell', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world;
  let decision = pickup.observe(
    pickupObservation(world, { tick: 20, positionM: world.outsidePoint }),
  );
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'NOT_AT_PICKUP');
  for (let tick = 21; tick <= 219; tick += 1) {
    decision = pickup.observe(pickupObservation(world, { tick, positionM: world.outsidePoint }));
    assert.equal(decision.reason, 'NOT_AT_PICKUP');
    assert.equal(decision.dwellTicks, 0);
  }
  for (let tick = 220; tick <= 399; tick += 1) {
    decision = pickup.observe(
      pickupObservation(world, { tick, positionM: world.otherPickupZoneCenter }),
    );
    assert.equal(decision.status, 'REJECTED');
    assert.equal(decision.reason, 'WRONG_ZONE');
    assert.equal(decision.dwellTicks, 0);
  }
  for (let tick = 400; tick <= 499; tick += 1) {
    decision = pickup.observe(
      pickupObservation(world, { tick, positionM: world.dropoffZoneCenter }),
    );
    assert.equal(decision.reason, 'WRONG_ZONE');
  }
  const ride = rideWorld.lifecycle.ride(world.rideId)!;
  assert.equal(ride.state, 'TO_PICKUP');
  assert.equal(ride.transitions.length, 1);
  assert.equal(pickup.boardings().length, 0);
  assert.equal(pickup.stats().byReason.NOT_AT_PICKUP, 200);
  assert.equal(pickup.stats().byReason.WRONG_ZONE, 280);

  // Entering the correct real zone afterwards starts the proof from zero.
  decision = pickup.observe(pickupObservation(world, { tick: 500 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);
  const boarded = holdAndBoard(world, 500, true);
  assert.equal(boarded.status, 'BOARDED');
  assert.equal(boarded.dwellTicks, pickup.requiredDwellTicks);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_DROPOFF');
  disposePickupWorld(world);
});

test('062 treats the zone boundary inclusively and resets dwell when the taxi leaves', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world,
    bounds = zoneBounds(world.rideWorld.dispatcherWorld.map, world.pickupZoneId),
    exactBoundary = { x: bounds.maxX, y: 0, z: world.pickupZoneCenter.z };
  let decision = pickup.observe(pickupObservation(world, { tick: 20, positionM: exactBoundary }));
  assert.equal(decision.status, 'PENDING');
  assert.equal(decision.inPickupZone, true);
  assert.equal(decision.dwellTicks, 0);
  for (let tick = 21; tick <= 100; tick += 1) {
    decision = pickup.observe(pickupObservation(world, { tick, positionM: exactBoundary }));
    assert.equal(decision.reason, 'NOT_STATIONARY');
  }
  assert.equal(decision.dwellTicks, 80);
  decision = pickup.observe(
    pickupObservation(world, { tick: 101, positionM: world.boundaryOutsidePoint }),
  );
  assert.equal(decision.reason, 'NOT_AT_PICKUP');
  assert.equal(decision.dwellTicks, 0);
  decision = pickup.observe(pickupObservation(world, { tick: 102, positionM: exactBoundary }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_PICKUP');

  const boarded = holdAndBoard(world, 102, true, exactBoundary);
  assert.equal(boarded.status, 'BOARDED');
  assert.equal(boarded.tick, 102 + pickup.requiredDwellTicks);
  assert.equal(boarded.dwellTicks, pickup.requiredDwellTicks);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_DROPOFF');
  disposePickupWorld(world);
});

test('062 rejects a wrong ride, a foreign taxi and a cancelled ride', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world;
  let decision = pickup.observe(pickupObservation(world, { tick: 20, rideId: 'ride:unknown' }));
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'WRONG_RIDE');
  assert.equal(decision.ride, null);
  assert.equal(decision.pickupZoneId, null);
  assert.equal(pickup.stats().byReason.WRONG_RIDE, 1);

  decision = pickup.observe(pickupObservation(world, { tick: 21, taxiId: 'taxi:foreign' }));
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'FOREIGN_VEHICLE');
  assert.equal(decision.ride?.taxiId, world.assignment.taxiId);
  assert.equal(pickup.stats().byReason.FOREIGN_VEHICLE, 1);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 1);

  decision = pickup.observe(pickupObservation(world, { tick: 22 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);

  rideWorld.lifecycle.apply({
    rideId: world.rideId,
    eventId: 'cancel:before-pickup',
    event: 'CANCELLED',
    tick: 23,
    reason: 'PLAYER_CANCELLED',
  });
  decision = pickup.observe(pickupObservation(world, { tick: 24 }));
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'WRONG_RIDE');
  assert.equal(decision.ride?.state, 'CANCELLED');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'CANCELLED');
  assert.equal(
    rideWorld.lifecycle
      .ride(world.rideId)!
      .appliedEventIds.includes(pickupBoardedEventId(world.assignment.requestId)),
    false,
  );
  assert.equal(pickup.boardings().length, 0);
  assert.equal(rideWorld.lifecycle.stats().releases, 1);
  disposePickupWorld(world);
});

test('062 rejects stale ticks and repeats the same tick without double-counting dwell', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world;
  let decision = pickup.observe(pickupObservation(world, { tick: 100 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);
  const repeat = pickup.observe(pickupObservation(world, { tick: 100 }));
  assert.equal(repeat.duplicate, true);
  assert.equal(repeat.reason, 'NOT_STATIONARY');
  assert.equal(repeat.dwellTicks, 0);
  assert.equal(pickup.stats().duplicates, 1);
  assert.equal(pickup.stats().pending, 1);

  decision = pickup.observe(pickupObservation(world, { tick: 99 }));
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'STALE_TICK');
  assert.equal(pickup.currentTick(), 100);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_PICKUP');

  decision = pickup.observe(pickupObservation(world, { tick: 101 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 1);

  rideWorld.lifecycle.advance(500);
  decision = pickup.observe(pickupObservation(world, { tick: 499 }));
  assert.equal(decision.reason, 'STALE_TICK');
  assert.equal(pickup.currentTick(), 101);
  decision = pickup.observe(pickupObservation(world, { tick: 500 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);
  assert.equal(pickup.stats().byReason.STALE_TICK, 2);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 1);
  disposePickupWorld(world);
});

test('062 makes boarding idempotent across repeats and later ride progress', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world,
    required = pickup.requiredDwellTicks;
  holdStationary(world, 20);
  const boarded = boardAt(world, 20);
  assert.equal(boarded.status, 'BOARDED');
  const rideAfterBoard = rideWorld.lifecycle.ride(world.rideId)!;
  assert.equal(rideAfterBoard.transitions.length, 3);

  const sameTick = pickup.observe(pickupObservation(world, { tick: 20 + required }));
  assert.equal(sameTick.status, 'BOARDED');
  assert.equal(sameTick.duplicate, true);
  assert.equal(sameTick.boarding?.tick, 20 + required);
  const later = pickup.observe(pickupObservation(world, { tick: 900 }));
  assert.equal(later.status, 'BOARDED');
  assert.equal(later.duplicate, true);
  assert.equal(later.boarding?.tick, 20 + required);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 3);
  assert.equal(rideWorld.lifecycle.stats().duplicates, 0);
  assert.equal(pickup.boardings().length, 1);
  assert.equal(pickup.stats().boarded, 1);
  assert.equal(pickup.stats().duplicates, 2);

  rideWorld.lifecycle.apply({
    rideId: world.rideId,
    eventId: 'progress:arrived-dropoff',
    event: 'ARRIVED_DROPOFF',
    tick: 901,
  });
  rideWorld.lifecycle.apply({
    rideId: world.rideId,
    eventId: 'progress:complete',
    event: 'DROPOFF_COMPLETE',
    tick: 902,
  });
  const afterTerminal = pickup.observe(pickupObservation(world, { tick: 903 }));
  assert.equal(afterTerminal.status, 'BOARDED');
  assert.equal(afterTerminal.duplicate, true);
  assert.equal(afterTerminal.ride?.state, 'COMPLETED');
  assert.equal(pickup.boardings().length, 1);
  assert.equal(rideWorld.lifecycle.stats().completed, 1);
  assert.equal(rideWorld.lifecycle.stats().releases, 1);
  disposePickupWorld(world);
});

test('062 completes an externally arrived ride only after the same valid dwell', () => {
  const world = createPickupWorld(),
    { pickup, rideWorld } = world;
  rideWorld.lifecycle.apply({
    rideId: world.rideId,
    eventId: 'arrive:external',
    event: 'ARRIVED_PICKUP',
    tick: 20,
  });
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'PICKUP');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 2);

  let decision = pickup.observe(pickupObservation(world, { tick: 21 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);
  decision = pickup.observe(pickupObservation(world, { tick: 22, speedMps: 5 }));
  assert.equal(decision.reason, 'TOO_FAST');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'PICKUP');

  const boarded = holdAndBoard(world, 23);
  assert.equal(boarded.status, 'BOARDED');
  assert.equal(boarded.dwellTicks, pickup.requiredDwellTicks);
  assert.equal(boarded.boarding?.fromState, 'PICKUP');
  assert.equal(boarded.boarding?.arrivedEventId, null);
  assert.equal(boarded.boarding?.completeEventId, pickupBoardedEventId(world.assignment.requestId));
  const ride = rideWorld.lifecycle.ride(world.rideId)!;
  assert.equal(ride.state, 'TO_DROPOFF');
  assert.deepEqual(
    ride.transitions.map((entry) => entry.event),
    ['ASSIGNED', 'ARRIVED_PICKUP', 'PICKUP_COMPLETE'],
  );
  assert.deepEqual(ride.appliedEventIds, [
    `assigned:${world.assignment.requestId}`,
    'arrive:external',
    pickupBoardedEventId(world.assignment.requestId),
  ]);
  assert.equal(ride.release, null);
  assert.equal(rideWorld.lifecycle.stats().releases, 0);
  disposePickupWorld(world);
});

test('062 uses no wall clock, validates options and disposes to zero without releasing the taxi', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(
    source,
    /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/,
  );
  assert.doesNotMatch(source, /\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/);

  const world = createPickupWorld(),
    { pickup, rideWorld } = world;
  assert.ok(throws(() => createRidePickup({}), /map/));
  assert.ok(
    throws(
      () =>
        createRidePickup({
          map: rideWorld.dispatcherWorld.map,
          lifecycle: rideWorld.lifecycle,
          extra: true,
        }),
      /Unknown ride pickup option field/,
    ),
  );
  assert.ok(
    throws(
      () =>
        createRidePickup({
          map: rideWorld.dispatcherWorld.map,
          lifecycle: rideWorld.lifecycle,
          tickRateHz: 0,
        }),
      /range/,
    ),
  );
  assert.ok(
    throws(
      () =>
        createRidePickup({
          map: rideWorld.dispatcherWorld.map,
          lifecycle: rideWorld.lifecycle,
          dwellTicks: 0,
        }),
      /range/,
    ),
  );
  assert.ok(
    throws(
      () =>
        createRidePickup({
          map: rideWorld.dispatcherWorld.map,
          lifecycle: {},
        }),
      /lifecycle/,
    ),
  );

  pickup.observe(pickupObservation(world, { tick: 20 }));
  pickup.dispose();
  pickup.dispose();
  const stats = pickup.stats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.attempts, 0);
  assert.equal(stats.observations, 0);
  assert.equal(stats.boarded, 0);
  assert.equal(stats.pending, 0);
  assert.equal(stats.rejected, 0);
  assert.equal(stats.duplicates, 0);
  assert.equal(stats.tick, 0);
  assert.deepEqual(pickup.boardings(), []);
  assert.equal(pickup.attempt(world.rideId), undefined);
  assert.ok(throws(() => pickup.observe(pickupObservation(world, { tick: 21 })), /disposed/));
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_PICKUP');
  assert.equal(
    rideWorld.dispatcherWorld.dispatcher.taxiStatus(world.assignment.taxiId),
    'ASSIGNED',
  );
  assert.equal(rideWorld.dispatcherWorld.dispatcher.releases().length, 0);
  disposePickupWorld(world);
});

test('062 exposes the documented pickup vocabulary and defaults', () => {
  assert.equal(PICKUP_VERSION, '062-pickup-v1');
  assert.deepEqual(
    [...PICKUP_REJECTION_REASONS],
    [
      'WRONG_ZONE',
      'TOO_FAST',
      'NOT_STATIONARY',
      'WRONG_RIDE',
      'NOT_AT_PICKUP',
      'STALE_TICK',
      'FOREIGN_VEHICLE',
    ],
  );
  assert.equal(new Set(PICKUP_REJECTION_REASONS).size, PICKUP_REJECTION_REASONS.length);
  assert.deepEqual(
    { ...PICKUP_DEFAULTS },
    {
      tickRateHz: 60,
      speedThresholdMps: 0.3,
      dwellTicks: 180,
      displacementToleranceM: 0.05,
    },
  );
  assert.equal(PICKUP_DEFAULTS.dwellTicks / PICKUP_DEFAULTS.tickRateHz, 3);
  assert.ok(PICKUP_LIMITS.attempts >= 30);
  assert.ok(PICKUP_LIMITS.attempts <= 64);
  assert.ok(PICKUP_LIMITS.polygonVertices >= 4);
});

test('062 committed evidence report is the current pickup transcript', () => {
  const report = runPickupReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runPickupReport>;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as ReturnType<typeof runPickupReport>);
});
