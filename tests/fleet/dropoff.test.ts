import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  DROPOFF_DEFAULTS,
  DROPOFF_LIMITS,
  DROPOFF_REJECTION_REASONS,
  DROPOFF_VERSION,
  PICKUP_DEFAULTS,
  createRideDropoff,
  dropoffArrivedEventId,
  dropoffCompleteEventId,
} from '../../src/fleet';
import type { DropoffDecision } from '../../src/fleet';
import {
  completeAt,
  createDropoffWorld,
  disposeDropoffWorld,
  dropoffObservation,
  holdAndComplete,
  holdStationary,
  rideState,
  withZoneKind,
  zoneBounds,
} from './dropoff-fixture';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from './ride-fsm-fixture';
import { runDropoffReport } from './dropoff-report';

const SOURCE = join(process.cwd(), 'src', 'fleet', 'dropoff.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '063-dropoff', 'report.json');

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

test('063 completes only at the exact stationary dwell tick inside the real dropoff zone', () => {
  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    required = dropoff.requiredDwellTicks,
    startTick = world.startTick,
    before = rideWorld.lifecycle.ride(world.rideId)!;
  assert.equal(required, DROPOFF_DEFAULTS.dwellTicks);
  assert.equal(before.state, 'TO_DROPOFF');
  assert.equal(before.transitions.length, 3);

  for (let offset = 0; offset < required; offset += 1) {
    const decision = dropoff.observe(dropoffObservation(world, { tick: startTick + offset }));
    assert.equal(decision.status, 'PENDING');
    assert.equal(decision.reason, 'NOT_STATIONARY');
    assert.equal(decision.inDropoffZone, true);
    assert.equal(decision.dwellTicks, offset);
    assert.equal(decision.dwellSeconds, offset / dropoff.tickRateHz);
    assert.equal(rideWorld.lifecycle.ride(world.rideId)!.state, 'TO_DROPOFF');
    assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 3);
  }
  const completed = dropoff.observe(dropoffObservation(world, { tick: startTick + required }));
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.reason, null);
  assert.equal(completed.duplicate, false);
  assert.equal(completed.dwellTicks, required);
  assert.equal(completed.dwellSeconds, required / dropoff.tickRateHz);
  assert.equal(completed.tick, startTick + required);
  assert.equal(completed.inDropoffZone, true);
  assert.ok(completed.completion !== null);
  assert.equal(completed.completion!.rideId, world.rideId);
  assert.equal(completed.completion!.requestId, world.assignment.requestId);
  assert.equal(completed.completion!.taxiId, world.assignment.taxiId);
  assert.equal(completed.completion!.dropoffZoneId, world.dropoffZoneId);
  assert.equal(completed.completion!.fromState, 'TO_DROPOFF');
  assert.equal(completed.completion!.toState, 'COMPLETED');
  assert.equal(completed.completion!.dwellTicks, required);
  assert.equal(
    completed.completion!.arrivedEventId,
    dropoffArrivedEventId(world.assignment.requestId),
  );
  assert.equal(
    completed.completion!.completeEventId,
    dropoffCompleteEventId(world.assignment.requestId),
  );
  assert.equal(completed.completion!.release?.reason, 'COMPLETED');
  assert.equal(completed.completion!.release?.taxiId, world.assignment.taxiId);
  assert.equal(completed.completion!.metrics.startedTick, 10);
  assert.equal(completed.completion!.metrics.completedTick, startTick + required);
  assert.equal(completed.completion!.metrics.transitions, 5);
  assert.equal(completed.completion!.metrics.pickupZoneId, before.pickupZoneId);
  assert.equal(completed.completion!.metrics.dropoffZoneId, before.dropoffZoneId);
  assert.equal(completed.completion!.metrics.pickupCostSeconds, before.pickupCostSeconds);
  assert.equal(completed.completion!.metrics.tripCostSeconds, before.tripCostSeconds);
  assert.equal(completed.completion!.metrics.totalCostSeconds, before.totalCostSeconds);
  assert.deepEqual(completed.completion!.metrics.pickupRouteLaneIds, before.pickupRouteLaneIds);
  assert.deepEqual(completed.completion!.metrics.tripRouteLaneIds, before.tripRouteLaneIds);

  const ride = rideWorld.lifecycle.ride(world.rideId)!;
  assert.equal(ride.state, 'COMPLETED');
  assert.equal(ride.terminal, true);
  assert.equal(ride.release?.reason, 'COMPLETED');
  assert.equal(ride.transitions.length, 5);
  assert.deepEqual(
    ride.transitions.map((entry) => entry.event),
    ['ASSIGNED', 'ARRIVED_PICKUP', 'PICKUP_COMPLETE', 'ARRIVED_DROPOFF', 'DROPOFF_COMPLETE'],
  );
  assert.deepEqual(
    ride.transitions.map((entry) => entry.tick),
    [10, 12, 13, startTick + required, startTick + required],
  );
  assert.deepEqual(ride.appliedEventIds, [
    `assigned:${world.assignment.requestId}`,
    `pickup-arrived:${world.assignment.requestId}`,
    `pickup-boarded:${world.assignment.requestId}`,
    dropoffArrivedEventId(world.assignment.requestId),
    dropoffCompleteEventId(world.assignment.requestId),
  ]);
  // The trip metrics the lifecycle copied from the real 060 assignment are untouched.
  assert.equal(ride.pickupZoneId, before.pickupZoneId);
  assert.equal(ride.dropoffZoneId, before.dropoffZoneId);
  assert.equal(ride.pickupCostSeconds, before.pickupCostSeconds);
  assert.equal(ride.tripCostSeconds, before.tripCostSeconds);
  assert.equal(ride.totalCostSeconds, before.totalCostSeconds);
  assert.deepEqual(ride.pickupRouteLaneIds, before.pickupRouteLaneIds);
  assert.deepEqual(ride.tripRouteLaneIds, before.tripRouteLaneIds);

  const dispatcher = rideWorld.dispatcherWorld.dispatcher;
  assert.equal(dispatcher.assignmentFor(world.assignment.requestId), undefined);
  assert.equal(dispatcher.taxiStatus(world.assignment.taxiId), 'AVAILABLE');
  assert.equal(dispatcher.releases().length, 1);
  assert.equal(dispatcher.releases()[0]!.reason, 'COMPLETED');
  assert.equal(dropoff.attempt(world.rideId)?.completedTick, startTick + required);
  assert.equal(dropoff.stats().completed, 1);
  assert.equal(dropoff.stats().pending, required);
  assert.equal(dropoff.stats().rejected, 0);
  assert.equal(dropoff.currentTick(), startTick + required);
  disposeDropoffWorld(world);
});

test('063 refuses a fast pass through the destination and never credits dwell at speed', () => {
  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    startTick = world.startTick;
  for (let tick = startTick; tick <= startTick + 240; tick += 1) {
    const decision = dropoff.observe(dropoffObservation(world, { tick, speedMps: 5 }));
    assert.equal(decision.status, 'REJECTED');
    assert.equal(decision.reason, 'TOO_FAST');
    assert.equal(decision.dwellTicks, 0);
    assert.equal(decision.speedMps, 5);
  }
  assert.equal(rideState(world), 'TO_DROPOFF');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 3);
  assert.equal(dropoff.completions().length, 0);
  assert.equal(rideWorld.dispatcherWorld.dispatcher.releases().length, 0);
  assert.equal(dropoff.stats().pending, 0);
  assert.equal(dropoff.stats().rejected, 241);
  assert.equal(dropoff.stats().byReason.TOO_FAST, 241);

  // Stopping afterwards starts a fresh proof at zero and completes only after the full dwell.
  const stopTick = startTick + 241;
  let decision = dropoff.observe(dropoffObservation(world, { tick: stopTick }));
  assert.equal(decision.dwellTicks, 0);
  assert.equal(decision.reason, 'NOT_STATIONARY');
  for (let tick = stopTick + 1; tick < stopTick + dropoff.requiredDwellTicks; tick += 1) {
    decision = dropoff.observe(dropoffObservation(world, { tick }));
    assert.equal(decision.reason, 'NOT_STATIONARY');
  }
  assert.equal(decision.dwellTicks, dropoff.requiredDwellTicks - 1);
  assert.equal(rideState(world), 'TO_DROPOFF');
  const completed = dropoff.observe(
    dropoffObservation(world, { tick: stopTick + dropoff.requiredDwellTicks }),
  );
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.dwellTicks, dropoff.requiredDwellTicks);
  assert.equal(rideState(world), 'COMPLETED');
  assert.equal(rideWorld.dispatcherWorld.dispatcher.releases()[0]!.reason, 'COMPLETED');
  disposeDropoffWorld(world);
});

test('063 never completes a taxi that only passes through the destination zone', () => {
  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    bounds = zoneBounds(world.rideWorld.dispatcherWorld.map, world.dropoffZoneId),
    startTick = world.startTick,
    steps = 13;
  let insideSamples = 0;
  for (let index = 0; index < steps; index += 1) {
    const x = bounds.minX - 2 + ((bounds.maxX - bounds.minX + 4) * index) / (steps - 1),
      decision = dropoff.observe(
        dropoffObservation(world, {
          tick: startTick + index,
          positionM: { x, y: 0, z: world.dropoffZoneCenter.z },
          speedMps: 8,
        }),
      );
    if (decision.inDropoffZone) insideSamples += 1;
    assert.notEqual(decision.status, 'COMPLETED');
    assert.equal(decision.dwellTicks, 0);
  }
  assert.equal(insideSamples, 7);
  assert.equal(rideState(world), 'TO_DROPOFF');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 3);
  assert.equal(dropoff.completions().length, 0);

  // A genuine stop after the pass starts a fresh proof and completes at the exact dwell.
  const completed = holdAndComplete(world, startTick + 20);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.dwellTicks, dropoff.requiredDwellTicks);
  assert.equal(rideState(world), 'COMPLETED');
  disposeDropoffWorld(world);
});

test('063 rejects outside, nearby and pickup-only zones without starting dwell', () => {
  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    startTick = world.startTick;
  let decision = dropoff.observe(
    dropoffObservation(world, { tick: startTick, positionM: world.outsidePoint }),
  );
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'NOT_AT_DROPOFF');
  for (let tick = startTick + 1; tick <= startTick + 199; tick += 1) {
    decision = dropoff.observe(dropoffObservation(world, { tick, positionM: world.outsidePoint }));
    assert.equal(decision.reason, 'NOT_AT_DROPOFF');
    assert.equal(decision.dwellTicks, 0);
  }
  for (let tick = startTick + 200; tick <= startTick + 379; tick += 1) {
    decision = dropoff.observe(
      dropoffObservation(world, { tick, positionM: world.otherDropoffZoneCenter }),
    );
    assert.equal(decision.status, 'REJECTED');
    assert.equal(decision.reason, 'WRONG_ZONE');
    assert.equal(decision.dwellTicks, 0);
  }
  for (let tick = startTick + 380; tick <= startTick + 479; tick += 1) {
    decision = dropoff.observe(
      dropoffObservation(world, { tick, positionM: world.pickupZoneCenter }),
    );
    assert.equal(decision.reason, 'WRONG_ZONE');
  }
  assert.equal(rideState(world), 'TO_DROPOFF');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 3);
  assert.equal(dropoff.completions().length, 0);
  assert.equal(dropoff.stats().byReason.NOT_AT_DROPOFF, 200);
  assert.equal(dropoff.stats().byReason.WRONG_ZONE, 280);

  // A zone id that exists but is pickup-only is refused even if the point is inside its polygon.
  const incompatible = createDropoffWorld(),
    incompatibleDropoff = createRideDropoff({
      map: withZoneKind(
        incompatible.rideWorld.dispatcherWorld.map,
        incompatible.dropoffZoneId,
        'PICKUP',
      ),
      lifecycle: incompatible.rideWorld.lifecycle,
    }),
    refused = incompatibleDropoff.observe(dropoffObservation(incompatible, { tick: 20 }));
  assert.equal(refused.status, 'REJECTED');
  assert.equal(refused.reason, 'WRONG_ZONE');
  assert.equal(refused.inDropoffZone, false);
  assert.equal(incompatibleDropoff.stats().completed, 0);
  incompatibleDropoff.dispose();
  disposeDropoffWorld(incompatible);
  disposeDropoffWorld(world);
});

test('063 treats the zone boundary inclusively and resets dwell when the taxi leaves', () => {
  const world = createDropoffWorld(),
    { dropoff } = world,
    bounds = zoneBounds(world.rideWorld.dispatcherWorld.map, world.dropoffZoneId),
    exactBoundary = { x: bounds.maxX, y: 0, z: world.dropoffZoneCenter.z },
    startTick = world.startTick;
  let decision = dropoff.observe(
    dropoffObservation(world, { tick: startTick, positionM: exactBoundary }),
  );
  assert.equal(decision.status, 'PENDING');
  assert.equal(decision.inDropoffZone, true);
  assert.equal(decision.dwellTicks, 0);
  for (let tick = startTick + 1; tick <= startTick + 80; tick += 1) {
    decision = dropoff.observe(dropoffObservation(world, { tick, positionM: exactBoundary }));
    assert.equal(decision.reason, 'NOT_STATIONARY');
  }
  assert.equal(decision.dwellTicks, 80);
  decision = dropoff.observe(
    dropoffObservation(world, {
      tick: startTick + 81,
      positionM: world.boundaryOutsidePoint,
    }),
  );
  assert.equal(decision.reason, 'NOT_AT_DROPOFF');
  assert.equal(decision.dwellTicks, 0);
  decision = dropoff.observe(
    dropoffObservation(world, { tick: startTick + 82, positionM: exactBoundary }),
  );
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);
  assert.equal(rideState(world), 'TO_DROPOFF');

  const completed = holdAndComplete(world, startTick + 82, true, exactBoundary);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.tick, startTick + 82 + dropoff.requiredDwellTicks);
  assert.equal(completed.dwellTicks, dropoff.requiredDwellTicks);
  assert.equal(rideState(world), 'COMPLETED');
  disposeDropoffWorld(world);
});

test('063 rejects a wrong ride, a foreign taxi, a ride not on trip and terminal rides', () => {
  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    startTick = world.startTick;
  let decision = dropoff.observe(
    dropoffObservation(world, { tick: startTick, rideId: 'ride:unknown' }),
  );
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'WRONG_RIDE');
  assert.equal(decision.ride, null);
  assert.equal(decision.dropoffZoneId, null);

  decision = dropoff.observe(
    dropoffObservation(world, { tick: startTick + 1, taxiId: 'taxi:foreign' }),
  );
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'FOREIGN_VEHICLE');
  assert.equal(decision.ride?.taxiId, world.assignment.taxiId);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 3);

  // Cancelled before delivery: the ride is terminal and can never be completed.
  rideWorld.lifecycle.apply({
    rideId: world.rideId,
    eventId: 'cancel:before-dropoff',
    event: 'CANCELLED',
    tick: startTick + 2,
    reason: 'PLAYER_CANCELLED',
  });
  decision = dropoff.observe(dropoffObservation(world, { tick: startTick + 3 }));
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'WRONG_RIDE');
  assert.equal(decision.ride?.state, 'CANCELLED');
  assert.equal(rideState(world), 'CANCELLED');
  assert.equal(
    rideWorld.lifecycle
      .ride(world.rideId)!
      .appliedEventIds.includes(dropoffCompleteEventId(world.assignment.requestId)),
    false,
  );
  assert.equal(dropoff.completions().length, 0);
  assert.equal(rideWorld.lifecycle.stats().releases, 1);
  assert.equal(rideWorld.dispatcherWorld.dispatcher.releases()[0]!.reason, 'CANCELLED');

  // Failed at the destination is terminal as well.
  const failed = createDropoffWorld(),
    failedDispatcher = failed.rideWorld.dispatcherWorld.dispatcher;
  failed.rideWorld.lifecycle.apply({
    rideId: failed.rideId,
    eventId: 'fail:at-destination',
    event: 'FAILED',
    tick: failed.startTick,
    reason: 'TAXI_DAMAGED',
  });
  decision = failed.dropoff.observe(dropoffObservation(failed, { tick: failed.startTick + 1 }));
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'WRONG_RIDE');
  assert.equal(rideState(failed), 'FAILED');
  assert.equal(failed.dropoff.completions().length, 0);
  assert.equal(failedDispatcher.releases()[0]!.reason, 'FAILED');
  disposeDropoffWorld(failed);

  // A ride that has not reached the destination yet is not a dropoff at all.
  const early = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    earlyAssignment = early.assignments[0]!;
  const { result } = beginFirstRide(early),
    earlyDropoff = createRideDropoff({
      map: early.dispatcherWorld.map,
      lifecycle: early.lifecycle,
    });
  decision = earlyDropoff.observe({
    rideId: result.ride.rideId,
    taxiId: earlyAssignment.taxiId,
    tick: 20,
    positionM: world.dropoffZoneCenter,
    speedMps: 0,
  });
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'RIDE_NOT_ON_TRIP');
  assert.equal(decision.ride?.state, 'TO_PICKUP');
  early.lifecycle.apply({
    rideId: result.ride.rideId,
    eventId: `pickup-arrived:${earlyAssignment.requestId}`,
    event: 'ARRIVED_PICKUP',
    tick: 21,
  });
  decision = earlyDropoff.observe({
    rideId: result.ride.rideId,
    taxiId: earlyAssignment.taxiId,
    tick: 22,
    positionM: world.dropoffZoneCenter,
    speedMps: 0,
  });
  assert.equal(decision.reason, 'RIDE_NOT_ON_TRIP');
  assert.equal(decision.ride?.state, 'PICKUP');
  assert.equal(earlyDropoff.completions().length, 0);
  assert.equal(early.lifecycle.stats().releases, 0);
  assert.equal(earlyDropoff.stats().byReason.RIDE_NOT_ON_TRIP, 2);
  earlyDropoff.dispose();
  disposeRideLifecycleWorld(early);
  disposeDropoffWorld(world);
});

test('063 refuses stale ticks and repeats the same tick without double-counting dwell', () => {
  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    startTick = world.startTick;
  let decision = dropoff.observe(dropoffObservation(world, { tick: startTick + 80 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);
  const repeat = dropoff.observe(dropoffObservation(world, { tick: startTick + 80 }));
  assert.equal(repeat.duplicate, true);
  assert.equal(repeat.reason, 'NOT_STATIONARY');
  assert.equal(repeat.dwellTicks, 0);
  assert.equal(dropoff.stats().duplicates, 1);
  assert.equal(dropoff.stats().pending, 1);

  decision = dropoff.observe(dropoffObservation(world, { tick: startTick + 79 }));
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.reason, 'STALE_TICK');
  assert.equal(dropoff.currentTick(), startTick + 80);
  assert.equal(rideState(world), 'TO_DROPOFF');

  decision = dropoff.observe(dropoffObservation(world, { tick: startTick + 81 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 1);

  rideWorld.lifecycle.advance(startTick + 500);
  decision = dropoff.observe(dropoffObservation(world, { tick: startTick + 499 }));
  assert.equal(decision.reason, 'STALE_TICK');
  assert.equal(dropoff.currentTick(), startTick + 81);
  decision = dropoff.observe(dropoffObservation(world, { tick: startTick + 500 }));
  assert.equal(decision.reason, 'NOT_STATIONARY');
  assert.equal(decision.dwellTicks, 0);
  assert.equal(dropoff.stats().byReason.STALE_TICK, 2);
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 3);
  disposeDropoffWorld(world);
});

test('063 makes completion idempotent across repeats and later observations', () => {
  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    required = dropoff.requiredDwellTicks,
    startTick = world.startTick;
  holdStationary(world, startTick);
  const completed = completeAt(world, startTick);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(rideState(world), 'COMPLETED');

  const sameTick = dropoff.observe(dropoffObservation(world, { tick: startTick + required }));
  assert.equal(sameTick.status, 'COMPLETED');
  assert.equal(sameTick.duplicate, true);
  assert.equal(sameTick.completion?.tick, startTick + required);
  const later = dropoff.observe(dropoffObservation(world, { tick: startTick + 900 }));
  assert.equal(later.status, 'COMPLETED');
  assert.equal(later.duplicate, true);
  assert.equal(later.completion?.tick, startTick + required);
  assert.equal(later.ride?.state, 'COMPLETED');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.transitions.length, 5);
  assert.equal(
    rideWorld.lifecycle
      .ride(world.rideId)!
      .appliedEventIds.filter(
        (eventId) => eventId === dropoffCompleteEventId(world.assignment.requestId),
      ).length,
    1,
  );
  assert.equal(dropoff.completions().length, 1);
  assert.equal(dropoff.stats().completed, 1);
  assert.equal(dropoff.stats().duplicates, 2);
  assert.equal(rideWorld.dispatcherWorld.dispatcher.releases().length, 1);
  assert.equal(rideWorld.lifecycle.stats().duplicates, 0);
  disposeDropoffWorld(world);
});

test('063 never completes without the real dispatcher release', () => {
  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    dispatcher = rideWorld.dispatcherWorld.dispatcher,
    startTick = world.startTick;
  holdStationary(world, startTick);
  assert.equal(rideState(world), 'TO_DROPOFF');
  // The claim disappears externally; 061 refuses DROPOFF_COMPLETE instead of losing the taxi.
  assert.equal(
    dispatcher.release(world.assignment.taxiId, 'TAXI_BLOCKED', startTick + 180) !== null,
    true,
  );
  assert.equal(dispatcher.taxiStatus(world.assignment.taxiId), 'BLOCKED');
  assert.equal(
    throws(() => completeAt(world, startTick), /Ride taxi claim is missing/),
    true,
  );
  assert.equal(rideState(world), 'DROPOFF');
  assert.equal(rideWorld.lifecycle.ride(world.rideId)!.release, null);
  assert.equal(rideWorld.lifecycle.stats().releases, 0);
  assert.equal(dropoff.completions().length, 0);
  assert.equal(dropoff.stats().completed, 0);
  assert.equal(dispatcher.releases().length, 1);
  disposeDropoffWorld(world);
});

test('063 evaluates a manual and an autonomous ride through the same predicate', () => {
  const manual = createDropoffWorld({ boardedVia: 'events' }),
    autonomous = createDropoffWorld({ boardedVia: 'pickup' }),
    startTick = 220,
    last = startTick + 180;
  for (let tick = startTick; tick <= last; tick += 1) {
    const left: DropoffDecision = manual.dropoff.observe(dropoffObservation(manual, { tick })),
      right: DropoffDecision = autonomous.dropoff.observe(dropoffObservation(autonomous, { tick }));
    assert.deepEqual(
      { status: left.status, reason: left.reason, dwellTicks: left.dwellTicks },
      { status: right.status, reason: right.reason, dwellTicks: right.dwellTicks },
    );
    if (tick < last) {
      assert.equal(left.reason, 'NOT_STATIONARY');
      assert.equal(right.reason, 'NOT_STATIONARY');
    }
  }
  assert.equal(rideState(manual), 'COMPLETED');
  assert.equal(rideState(autonomous), 'COMPLETED');
  assert.equal(manual.dropoff.completions()[0]!.dwellTicks, 180);
  assert.equal(autonomous.dropoff.completions()[0]!.dwellTicks, 180);
  assert.equal(manual.dropoff.completions()[0]!.fromState, 'TO_DROPOFF');
  assert.equal(autonomous.dropoff.completions()[0]!.fromState, 'TO_DROPOFF');

  // Control mode is not an input: the same evaluation is the only one that exists.
  const world = createDropoffWorld();
  assert.equal(
    throws(
      () =>
        world.dropoff.observe({
          ...dropoffObservation(world),
          controlMode: 'AUTO',
        }),
      /Unknown dropoff observation field/,
    ),
    true,
  );
  disposeDropoffWorld(world);
  disposeDropoffWorld(manual);
  disposeDropoffWorld(autonomous);
});

test('063 uses no wall clock, validates options and disposes to zero without releasing the taxi', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(
    source,
    /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/,
  );
  assert.doesNotMatch(source, /\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/);

  const world = createDropoffWorld(),
    { dropoff, rideWorld } = world,
    map = rideWorld.dispatcherWorld.map;
  assert.ok(throws(() => createRideDropoff({}), /map/));
  assert.ok(
    throws(
      () => createRideDropoff({ map, lifecycle: rideWorld.lifecycle, extra: true }),
      /Unknown ride dropoff option field/,
    ),
  );
  assert.ok(
    throws(
      () => createRideDropoff({ map, lifecycle: rideWorld.lifecycle, tickRateHz: 0 }),
      /range/,
    ),
  );
  assert.ok(
    throws(
      () => createRideDropoff({ map, lifecycle: rideWorld.lifecycle, dwellTicks: 0 }),
      /range/,
    ),
  );
  assert.ok(throws(() => createRideDropoff({ map, lifecycle: {} }), /lifecycle/));

  dropoff.observe(dropoffObservation(world));
  dropoff.dispose();
  dropoff.dispose();
  const stats = dropoff.stats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.attempts, 0);
  assert.equal(stats.observations, 0);
  assert.equal(stats.completed, 0);
  assert.equal(stats.pending, 0);
  assert.equal(stats.rejected, 0);
  assert.equal(stats.duplicates, 0);
  assert.equal(stats.tick, 0);
  assert.deepEqual(dropoff.completions(), []);
  assert.equal(dropoff.attempt(world.rideId), undefined);
  assert.ok(throws(() => dropoff.observe(dropoffObservation(world)), /disposed/));
  assert.equal(rideState(world), 'TO_DROPOFF');
  assert.equal(
    rideWorld.dispatcherWorld.dispatcher.taxiStatus(world.assignment.taxiId),
    'ASSIGNED',
  );
  assert.equal(rideWorld.dispatcherWorld.dispatcher.releases().length, 0);
  disposeDropoffWorld(world);
});

test('063 exposes the documented dropoff vocabulary, defaults and event identities', () => {
  assert.equal(DROPOFF_VERSION, '063-dropoff-v1');
  assert.deepEqual(
    [...DROPOFF_REJECTION_REASONS],
    [
      'WRONG_ZONE',
      'TOO_FAST',
      'NOT_STATIONARY',
      'WRONG_RIDE',
      'NOT_AT_DROPOFF',
      'STALE_TICK',
      'FOREIGN_VEHICLE',
      'RIDE_NOT_ON_TRIP',
    ],
  );
  assert.equal(new Set(DROPOFF_REJECTION_REASONS).size, DROPOFF_REJECTION_REASONS.length);
  assert.deepEqual({ ...DROPOFF_DEFAULTS }, { ...PICKUP_DEFAULTS });
  assert.deepEqual(
    { ...DROPOFF_DEFAULTS },
    {
      tickRateHz: 60,
      speedThresholdMps: 0.3,
      dwellTicks: 180,
      displacementToleranceM: 0.05,
    },
  );
  assert.equal(DROPOFF_DEFAULTS.dwellTicks / DROPOFF_DEFAULTS.tickRateHz, 3);
  assert.ok(DROPOFF_LIMITS.attempts >= 30);
  assert.ok(DROPOFF_LIMITS.attempts <= 64);
  assert.ok(DROPOFF_LIMITS.vertices >= 4);
  assert.equal(dropoffArrivedEventId('req:1'), 'dropoff-arrived:req:1');
  assert.equal(dropoffCompleteEventId('req:1'), 'dropoff-complete:req:1');
});

test('063 committed evidence report is the current dropoff transcript', () => {
  const report = runDropoffReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runDropoffReport>;
  assert.deepEqual(
    saved,
    JSON.parse(JSON.stringify(report)) as ReturnType<typeof runDropoffReport>,
  );
});
