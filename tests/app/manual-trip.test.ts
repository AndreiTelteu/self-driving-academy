import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createManualTripWorld } from './manual-trip-fixture';
import type { ManualTripWorld } from './manual-trip-fixture';
import { runManualTripReport } from './manual-trip-report';
import type {
  ManualTripBegin,
  ManualTripModeRequest,
  ManualTripRefusal,
  ManualTripStep,
} from '../../src/app/manual-trip';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '072-manual-trip', 'report.json');

type AnyResult = ManualTripBegin | ManualTripModeRequest | ManualTripStep | ManualTripRefusal;

function refusalOf(value: AnyResult): ManualTripRefusal {
  assert.equal(value.accepted, false, 'expected a closed refusal');
  if (value.accepted) throw new Error('Expected a refusal');
  return value;
}

function acceptedOf<T extends { accepted: boolean }>(value: T): Extract<T, { accepted: true }> {
  assert.equal(value.accepted, true, 'expected an accepted intervention');
  if (!value.accepted) throw new Error('Expected acceptance');
  return value as Extract<T, { accepted: true }>;
}

function started(): ManualTripWorld {
  const world = createManualTripWorld();
  world.advanceAuthorityTo(world.timeline.beginTick);
  acceptedOf(world.begin());
  return world;
}

/** One complete rider: AUTO, a short MANUAL intervention during the pickup dwell, then AUTO to delivery. */
function mixedTrip(world: ManualTripWorld): void {
  world.runTo(30);
  acceptedOf(world.requestMode('MANUAL'));
  world.runTo(34);
  acceptedOf(world.requestMode('AUTO'));
  world.runTo(world.timeline.completionTick);
}

test('072 mixed trip keeps one ride and one MANUAL segment, then AUTO finishes the same ride', () => {
  const world = started();
  const rideId = world.trip.stats().rideId!;
  mixedTrip(world);
  const result = world.trip.result();
  assert.equal(result.ride?.rideId, rideId);
  assert.equal(result.ride?.state, 'COMPLETED');
  assert.equal(result.ride?.releaseReason, 'COMPLETED');
  assert.equal(world.rideWorld.lifecycle.stats().rides, 1, 'an intervention never creates a ride');
  assert.equal(result.segments.length, 1, 'one ride mode change owns exactly one segment');
  assert.equal(result.segments[0]!.mode, 'MANUAL');
  assert.equal(result.segments[0]!.closeReason, 'RETURN_TO_AUTO');
  assert.equal(result.segments[0]!.completeness, 'CLOSED');
  assert.equal(world.rideWorld.lifecycle.stats().transitions, 5);
  assert.equal(
    result.ride?.transitions.filter(([event]) => event === 'DROPOFF_COMPLETE').length,
    1,
  );
  assert.equal(result.learning.intakeEntries, 0, 'a MANUAL segment never enters the intake');
  world.dispose();
});

test('072 MANUAL segments are MANUAL telemetry, never learning evidence', () => {
  const world = started();
  mixedTrip(world);
  const result = world.trip.result(),
    segment = result.segments[0]!;
  assert.equal(segment.mode, 'MANUAL');
  assert.equal(segment.learningEligible, false);
  assert.ok(segment.samples > 0, 'the MANUAL segment carries real telemetry samples');
  assert.deepEqual(segment.publishedParameters, []);
  assert.equal(result.learning.publications.length, 0);
  assert.equal(result.learning.intakeEntries, 0);
  assert.equal(result.learning.manualPublications, 0);
  assert.equal(result.learning.manualSegments, 1);
  assert.equal(result.telemetry.ticks.MANUAL, 4);
  assert.equal(result.telemetry.samplesAppended, 4);
  assert.ok(
    segment.observedParameters.length > 0,
    'the host did observe manual parameters, they are simply never published',
  );
  assert.equal(result.profile.unchanged, true);
  world.dispose();
});

test('072 a complete MANUAL ride produces the result with unchanged profile values and proofs', () => {
  const world = started();
  acceptedOf(world.requestMode('MANUAL'));
  world.runTo(world.timeline.completionTick);
  const beforeSwitch = world.trip.result();
  assert.equal(beforeSwitch.ride?.state, 'COMPLETED');
  assert.equal(beforeSwitch.ride?.completionTick, world.timeline.completionTick);
  assert.equal(beforeSwitch.ride?.boardingTick, world.timeline.boardingTick);
  assert.equal(beforeSwitch.learning.intakeEntries, 0);
  assert.deepEqual(beforeSwitch.profile.values, world.profile.values);
  assert.deepEqual(beforeSwitch.profile.proofs, world.profile.proofs);
  assert.equal(beforeSwitch.profile.unchanged, true);
  assert.ok(beforeSwitch.telemetry.ticks.MANUAL > 800);
  assert.equal(beforeSwitch.telemetry.samplesSkipped > 0, true, 'the 069 record is bounded');
  acceptedOf(world.requestMode('AUTO'));
  world.runTo(world.timeline.completionTick + 1);
  const result = world.trip.result();
  assert.equal(result.mode, 'AUTO');
  assert.equal(result.segments[0]!.closeReason, 'RETURN_TO_AUTO');
  assert.equal(result.handovers[0]!.statePreserved, true);
  assert.equal(result.profile.unchanged, true);
  world.dispose();
});

test('072 a short LEARNING demonstration publishes only the observed parameters', () => {
  const world = started();
  world.runTo(30);
  const learning = acceptedOf(world.requestMode('LEARNING'));
  assert.equal(learning.from, 'AUTO');
  assert.equal(learning.to, 'LEARNING');
  world.runTo(34);
  acceptedOf(world.requestMode('AUTO'));
  world.runTo(35);
  const result = world.trip.result(),
    segment = result.segments[0]!,
    publication = result.learning.publications[0]!;
  assert.equal(segment.mode, 'LEARNING');
  assert.equal(segment.learningEligible, true);
  assert.deepEqual(segment.observedParameters, ['desired_acceleration', 'speed_delta_urban']);
  assert.deepEqual(publication.observedParameters, ['desired_acceleration', 'speed_delta_urban']);
  assert.equal(publication.mode, 'LEARNING');
  assert.equal(publication.learningEligible, true);
  assert.equal(result.learning.intakeEntries, 1);
  assert.equal(result.learning.publications.length, 1);
  assert.equal(publication.unobservedParameters.length, 22);
  assert.equal(publication.unobservedParameters.includes('green_start_delay'), true);
  assert.equal(publication.observedParameters.includes('green_start_delay'), false);
  assert.equal(result.profile.unchanged, true);
  assert.deepEqual(result.profile.values, world.profile.values);
  world.dispose();
});

test('072 the control switch preserves the ride, passenger and destination', () => {
  const world = started();
  const rideId = world.trip.stats().rideId!;
  world.runTo(30);
  const rideBefore = world.rideWorld.lifecycle.ride(rideId)!;
  acceptedOf(world.requestMode('MANUAL'));
  world.runTo(34);
  const rideDuring = world.rideWorld.lifecycle.ride(rideId)!;
  assert.equal(rideDuring.rideId, rideBefore.rideId);
  assert.equal(rideDuring.requestId, rideBefore.requestId);
  assert.equal(rideDuring.taxiId, rideBefore.taxiId);
  assert.equal(rideDuring.assignmentId, rideBefore.assignmentId);
  assert.equal(rideDuring.pickupZoneId, rideBefore.pickupZoneId);
  assert.equal(rideDuring.dropoffZoneId, rideBefore.dropoffZoneId);
  assert.equal(rideDuring.state, rideBefore.state);
  assert.equal(rideDuring.startedTick, rideBefore.startedTick);
  assert.deepEqual(rideDuring.pickupRouteLaneIds, rideBefore.pickupRouteLaneIds);
  assert.deepEqual(rideDuring.tripRouteLaneIds, rideBefore.tripRouteLaneIds);
  assert.equal(rideDuring.pickupCostSeconds, rideBefore.pickupCostSeconds);
  assert.equal(rideDuring.tripCostSeconds, rideBefore.tripCostSeconds);
  assert.equal(
    world.rideWorld.dispatcherWorld.dispatcher.taxiStatus(rideBefore.taxiId),
    'ASSIGNED',
    'the passenger claim survives the switch',
  );
  world.runTo(34);
  acceptedOf(world.requestMode('AUTO'));
  world.runTo(35);
  const rideAfter = world.rideWorld.lifecycle.ride(rideId)!,
    handover = world.trip.result().handovers[0]!;
  assert.equal(rideAfter.state, rideBefore.state);
  assert.equal(rideAfter.dropoffZoneId, rideBefore.dropoffZoneId);
  assert.equal(handover.closedMode, 'MANUAL');
  assert.equal(handover.authority, 'AUTO');
  assert.equal(handover.statePreserved, true);
  assert.deepEqual(handover.violations, []);
  assert.equal(handover.teleportsVehicle, false);
  world.dispose();
});

test('072 returning to AUTO resumes the same ride without a second ride or completion', () => {
  const world = started();
  const rideId = world.trip.stats().rideId!;
  mixedTrip(world);
  const result = world.trip.result();
  assert.equal(result.ride?.rideId, rideId);
  assert.equal(result.ride?.requestId, world.assignment.requestId);
  assert.equal(result.ride?.boardingTick, world.timeline.boardingTick);
  assert.equal(result.ride?.completionTick, world.timeline.completionTick);
  assert.equal(result.ride?.pickupZoneId, world.assignment.pickupZoneId);
  assert.equal(result.ride?.dropoffZoneId, world.assignment.dropoffZoneId);
  assert.equal(result.handovers.length, 1);
  assert.equal(result.handovers[0]!.decisionTick, 35);
  assert.equal(result.handovers[0]!.segmentCloseReason, 'RETURN_TO_AUTO');
  assert.equal(world.rideWorld.lifecycle.stats().releases, 1);
  assert.equal(world.rideWorld.lifecycle.stats().rides, 1);
  assert.equal(world.rideWorld.lifecycle.terminal().length, 1);
  const restart = refusalOf(world.begin());
  assert.equal(restart.reason, 'RIDE_TERMINAL');
  assert.equal(world.rideWorld.lifecycle.stats().rides, 1, 'a completed ride is never recreated');
  world.dispose();
});

test('072 a repeated completion observation is a duplicate, not a second release', () => {
  const world = started();
  mixedTrip(world);
  const ride = world.trip.result().ride!,
    replay = world.dropoff.observe({
      rideId: ride.rideId,
      taxiId: ride.taxiId,
      tick: ride.completionTick! + 1,
      positionM: world.timeline.dropoffCenter,
      speedMps: 0,
    });
  assert.equal(replay.status, 'COMPLETED');
  assert.equal(replay.duplicate, true);
  const record = world.rideWorld.lifecycle.ride(ride.rideId)!;
  assert.equal(record.transitions.filter((entry) => entry.event === 'DROPOFF_COMPLETE').length, 1);
  assert.equal(world.rideWorld.lifecycle.stats().releases, 1);
  assert.equal(world.dropoff.completions().length, 1);
  world.dispose();
});

test('072 illegal interventions are refused with closed reasons and mutate nothing', () => {
  const world = createManualTripWorld();
  const beforeRide = refusalOf(world.requestMode('MANUAL'));
  assert.equal(beforeRide.reason, 'NO_ACTIVE_RIDE');
  world.advanceAuthorityTo(world.timeline.beginTick);
  acceptedOf(world.begin());
  const duplicateAgain = refusalOf(world.begin());
  assert.equal(duplicateAgain.reason, 'DUPLICATE_RIDE');
  assert.equal(world.rideWorld.lifecycle.stats().rides, 1);

  const stale = refusalOf(world.trip.requestMode({ tick: 9, mode: 'MANUAL' }));
  assert.equal(stale.reason, 'TICK_NOT_CURRENT');
  const foreign = refusalOf(
    world.trip.requestMode({ tick: world.trip.currentTick(), mode: 'MANUAL', rideId: 'other' }),
  );
  assert.equal(foreign.reason, 'RIDE_MISMATCH');
  const already = refusalOf(world.requestMode('AUTO'));
  assert.equal(already.reason, 'ALREADY_IN_MODE');
  const unknown = refusalOf(
    world.trip.requestMode({ tick: world.trip.currentTick(), mode: 'FLY' }),
  );
  assert.equal(unknown.reason, 'UNKNOWN_MODE');
  world.setSelected(null);
  const unavailableTarget = refusalOf(world.requestMode('MANUAL'));
  assert.equal(unavailableTarget.reason, 'TARGET_UNAVAILABLE');
  world.setSelected(world.taxi);
  const gap = refusalOf(world.trip.step({ tick: world.trip.currentTick() + 2 }));
  assert.equal(gap.reason, 'TICK_NOT_NEXT');

  acceptedOf(world.requestMode('MANUAL'));
  const queued = refusalOf(world.requestMode('AUTO'));
  assert.equal(queued.reason, 'INTENT_ALREADY_QUEUED');
  world.runTo(11);
  assert.equal(world.trip.result().segments.length, 1);

  world.runTo(12);
  acceptedOf(world.requestMode('AUTO'));
  world.runTo(13);
  assert.equal(world.trip.stats().mode, 'AUTO');
  assert.equal(world.trip.result().segments.length, 1, 'a repeated switch creates no segment');

  world.suspend();
  const suspended = refusalOf(world.requestMode('MANUAL'));
  assert.equal(suspended.reason, 'AUTHORITY_SUSPENDED');
  const suspendedStep = refusalOf(world.trip.step({ tick: world.trip.currentTick() + 1 }));
  assert.equal(suspendedStep.reason, 'AUTHORITY_SUSPENDED');
  assert.equal(world.trip.stats().mode, 'AUTO');
  world.resume();

  const learningWorld = started();
  learningWorld.setLearningEligible(false);
  const unavailable = refusalOf(learningWorld.requestMode('LEARNING'));
  assert.equal(unavailable.reason, 'LEARNING_UNAVAILABLE');
  assert.equal(learningWorld.trip.result().segments.length, 0);
  learningWorld.dispose();

  const taxiWorld = createManualTripWorld();
  taxiWorld.advanceAuthorityTo(taxiWorld.timeline.beginTick);
  const mismatch = refusalOf(
    taxiWorld.trip.begin({
      requestId: taxiWorld.assignment.requestId,
      eventId: `assigned:${taxiWorld.assignment.requestId}`,
      tick: taxiWorld.trip.currentTick(),
      taxiId: 'foreign-taxi',
    }),
  );
  assert.equal(mismatch.reason, 'TAXI_MISMATCH');
  assert.equal(
    taxiWorld.rideWorld.lifecycle.stats().rides,
    0,
    'no ride is created for a foreign taxi',
  );
  taxiWorld.dispose();

  const stats = world.trip.stats();
  assert.equal(stats.segments, 1);
  assert.equal(
    world.rideWorld.lifecycle.ride(stats.rideId!)!.state,
    'TO_PICKUP',
    'a refused intervention leaves the ride untouched',
  );
  assert.equal(stats.refusals.NO_ACTIVE_RIDE, 1);
  assert.equal(stats.refusals.DUPLICATE_RIDE, 1);
  assert.equal(stats.refusals.TICK_NOT_CURRENT, 1);
  assert.equal(stats.refusals.RIDE_MISMATCH, 1);
  assert.equal(stats.refusals.ALREADY_IN_MODE, 1);
  assert.equal(stats.refusals.UNKNOWN_MODE, 1);
  assert.equal(stats.refusals.TARGET_UNAVAILABLE, 1);
  assert.equal(stats.refusals.TICK_NOT_NEXT, 1);
  assert.equal(stats.refusals.INTENT_ALREADY_QUEUED, 1);
  assert.equal(stats.refusals.AUTHORITY_SUSPENDED, 2);
  world.dispose();
});

test('072 deterministic ticks refuse every gap and duplicate without advancing', () => {
  const world = started();
  const tick = world.trip.currentTick();
  const next = refusalOf(world.trip.step({ tick }));
  assert.equal(next.reason, 'TICK_NOT_NEXT');
  assert.equal(world.trip.currentTick(), tick);
  const skipped = refusalOf(world.trip.step({ tick: tick + 3 }));
  assert.equal(skipped.reason, 'TICK_NOT_NEXT');
  assert.equal(world.trip.currentTick(), tick);
  world.runTo(tick + 1);
  assert.equal(world.trip.currentTick(), tick + 1);
  world.dispose();
});

test('072 a ride completed while MANUAL opens a new segment without changing the mode', () => {
  const world = started();
  acceptedOf(world.requestMode('MANUAL'));
  world.runTo(world.timeline.completionTick + 1);
  const result = world.trip.result();
  assert.equal(result.ride?.state, 'COMPLETED');
  assert.equal(result.mode, 'MANUAL');
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0]!.closeReason, 'RIDE_COMPLETED');
  assert.equal(result.segments[1]!.mode, 'MANUAL');
  assert.equal(result.segments[1]!.completeness, 'OPEN');
  assert.equal(result.segments[1]!.startTick, world.timeline.completionTick + 1);
  assert.equal(result.learning.intakeEntries, 0);
  world.dispose();
});

test('072 disposal retires the open segment and leaves the host-owned ride intact', () => {
  const world = started();
  acceptedOf(world.requestMode('MANUAL'));
  world.runTo(12);
  const rideId = world.trip.stats().rideId!;
  world.trip.dispose();
  world.trip.dispose();
  const stats = world.trip.stats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.openSegments, 0);
  assert.equal(world.rideWorld.lifecycle.ride(rideId)!.state, 'TO_PICKUP');
  assert.equal(
    world.rideWorld.dispatcherWorld.dispatcher.taxiStatus(world.assignment.taxiId),
    'ASSIGNED',
    'the host ride claim is not released by disposing the trip driver',
  );
  assert.throws(() => world.trip.step({ tick: world.trip.currentTick() + 1 }), /disposed/);
  world.dispose();
});

test('072 a physical discontinuity on return is reported, never repaired or hidden', () => {
  const world = started();
  const rideId = world.trip.stats().rideId!;
  world.runTo(30);
  acceptedOf(world.requestMode('MANUAL'));
  world.runTo(34);
  acceptedOf(world.requestMode('AUTO'));
  world.setPhysicalDiscontinuity(35, 5);
  world.runTo(35);
  const interrupted = world.trip.result(),
    handover = interrupted.handovers[0]!;
  assert.equal(handover.decisionTick, 35);
  assert.equal(handover.reason, 'STATE_CONTINUITY_VIOLATION');
  assert.equal(handover.statePreserved, false);
  assert.deepEqual(handover.violations, ['POSITION_STEP']);
  assert.equal(handover.teleportsVehicle, false);
  assert.equal(handover.segmentCloseReason, 'RETURN_TO_AUTO');
  assert.equal(interrupted.ride?.rideId, rideId, 'the reported jump never retargets the ride');
  assert.equal(world.rideWorld.lifecycle.stats().rides, 1);
  world.runTo(world.timeline.completionTick);
  const result = world.trip.result();
  assert.equal(result.ride?.rideId, rideId, 'the ride still completes after the reported jump');
  assert.equal(result.ride?.state, 'COMPLETED');
  assert.equal(result.ride?.completionTick, world.timeline.completionTick);
  assert.equal(world.rideWorld.lifecycle.stats().releases, 1);
  assert.equal(
    result.ride?.transitions.filter(([event]) => event === 'DROPOFF_COMPLETE').length,
    1,
  );
  world.dispose();
});

test('072 committed evidence report is the current manual trip transcript', () => {
  const report = runManualTripReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runManualTripReport>;
  assert.deepEqual(
    saved,
    JSON.parse(JSON.stringify(report)) as ReturnType<typeof runManualTripReport>,
  );
});

test('072 two identical scenarios produce identical evidence', () => {
  const run = () => {
    const world = started();
    world.runTo(30);
    acceptedOf(world.requestMode('MANUAL'));
    world.runTo(34);
    acceptedOf(world.requestMode('AUTO'));
    world.runTo(world.timeline.completionTick);
    const result = world.trip.result();
    world.dispose();
    return JSON.stringify(result);
  };
  assert.equal(run(), run());
});
