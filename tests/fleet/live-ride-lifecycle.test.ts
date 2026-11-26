import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  LIVE_RIDE_LIFECYCLE_LIMITS,
  LIVE_RIDE_LIFECYCLE_VERSION,
  LIVE_RIDE_TERMINAL_CAUSES,
} from '../../src/fleet';
import { DROPOFF_DEFAULTS } from '../../src/fleet/dropoff';
import { PICKUP_DEFAULTS } from '../../src/fleet/pickup';
import { projectTaxiHud } from '../../src/ui';
import {
  LIVE_RIDE_LIFECYCLE_REPORT_VERSION,
  runLiveRideLifecycleReport,
} from './live-ride-lifecycle-report';
import { createLiveRideLifecycleFixture } from './live-ride-lifecycle-fixture';

const SOURCE = join(process.cwd(), 'src', 'fleet', 'live-ride-lifecycle.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '265-ride-lifecycle', 'report.json');

function ride(
  snapshot: ReturnType<ReturnType<typeof createLiveRideLifecycleFixture>['snapshot']>,
  rideId: string,
) {
  return snapshot.rides.rides.find((entry) => entry.rideId === rideId);
}

test('265 a live ride completes through the real pickup and dropoff zones with one release', () => {
  const fixture = createLiveRideLifecycleFixture({ dwellTicks: 3, civilianCount: 20 });
  try {
    fixture.runTo(60);
    const assigned = fixture.snapshot().live.assignments[0];
    assert.ok(assigned, 'the live dispatcher claims a real taxi at tick 60');
    const pickupAnchor = fixture.anchorFor(assigned.pickupZoneId);
    const dropoffAnchor = fixture.anchorFor(assigned.dropoffZoneId);
    fixture.driveTo(assigned.taxiId, pickupAnchor, 0);

    fixture.step(61);
    let snapshot = fixture.snapshot();
    let current = ride(snapshot, snapshot.rides.rides[0]!.rideId)!;
    assert.ok(current.rideId.length > 0);
    assert.equal(current.requestId, assigned.requestId);
    assert.equal(current.taxiId, assigned.taxiId);
    assert.equal(current.state, 'PICKUP', 'arrival is visible before boarding');
    assert.equal(current.pickup?.inZone, true);
    assert.equal(current.pickup?.dwellTicks, 0);
    assert.equal(current.pickup?.requiredDwellTicks, 3);
    const boardingPassenger = snapshot.passenger[current.rideId]!;
    assert.equal(boardingPassenger.phase, 'BOARDING');
    assert.equal(boardingPassenger.occupancy, 0);
    assert.equal(boardingPassenger.passengerVisible, true);
    assert.deepEqual(
      boardingPassenger.markers.map((marker) => marker.role),
      ['PICKUP', 'PASSENGER'],
    );
    const pickupMarker = boardingPassenger.markers[0]!;
    assert.equal(pickupMarker.zoneId, assigned.pickupZoneId);
    assert.equal(pickupMarker.x, pickupAnchor.x);
    assert.equal(pickupMarker.z, pickupAnchor.z);

    fixture.step(62);
    fixture.step(63);
    snapshot = fixture.snapshot();
    current = ride(snapshot, current.rideId)!;
    assert.equal(current.state, 'PICKUP');
    assert.equal(current.pickup?.dwellTicks, 2);

    fixture.step(64);
    snapshot = fixture.snapshot();
    current = ride(snapshot, current.rideId)!;
    assert.equal(current.state, 'TO_DROPOFF');
    assert.equal(current.boardingTick, 64);
    assert.equal(current.pickup?.dwellTicks, 3);
    assert.equal(current.pickup?.boardedTick, 64);
    const onboardPassenger = snapshot.passenger[current.rideId]!;
    assert.equal(onboardPassenger.phase, 'ONBOARD');
    assert.equal(onboardPassenger.occupancy, 1);
    assert.equal(onboardPassenger.passengerVisible, true);
    assert.deepEqual(
      onboardPassenger.markers.map((marker) => marker.role),
      ['DROPOFF'],
    );
    assert.equal(onboardPassenger.markers[0]!.zoneId, assigned.dropoffZoneId);
    assert.ok(current.eta !== null);
    assert.equal(current.eta?.leg, 'TRIP');
    const hud = fixture.composition.hud({
      taxiId: assigned.taxiId,
      mode: 'MANUAL',
      tick: 64,
      speedMps: 0,
    });
    const projection = projectTaxiHud(hud);
    assert.equal(projection.stage, 'Spre destinație');
    assert.match(projection.objective, new RegExp(assigned.dropoffZoneId));
    assert.notEqual(projection.eta, 'Fără estimare');

    fixture.driveTo(assigned.taxiId, dropoffAnchor, 0);
    fixture.step(65);
    snapshot = fixture.snapshot();
    current = ride(snapshot, current.rideId)!;
    assert.equal(current.state, 'DROPOFF', 'destination arrival is visible during the dwell');
    assert.equal(current.dropoff?.inZone, true);
    const droppingOff = snapshot.passenger[current.rideId]!;
    assert.equal(droppingOff.phase, 'DROPPING_OFF');
    assert.equal(droppingOff.occupancy, 1);
    assert.deepEqual(
      droppingOff.markers.map((marker) => marker.role),
      ['DROPOFF'],
    );
    assert.equal(droppingOff.markers[0]!.x, dropoffAnchor.x);
    assert.equal(droppingOff.markers[0]!.z, dropoffAnchor.z);

    fixture.step(66);
    fixture.step(67);
    assert.equal(ride(fixture.snapshot(), current.rideId)!.state, 'DROPOFF');
    fixture.step(68);
    snapshot = fixture.snapshot();
    current = ride(snapshot, current.rideId)!;
    assert.equal(current.state, 'COMPLETED');
    assert.equal(current.terminal, true);
    assert.equal(current.reason, null);
    assert.equal(current.completionTick, 68);
    assert.equal(current.dropoff?.dwellTicks, 3);
    assert.equal(current.release?.reason, 'COMPLETED');
    assert.equal(snapshot.rides.counts.completed, 1);
    assert.equal(snapshot.rides.terminalsByCause.COMPLETED, 1);
    assert.equal(snapshot.rides.terminals.length, 1);
    assert.equal(snapshot.rides.terminals[0]!.cause, 'COMPLETED');
    assert.equal(snapshot.rides.terminals[0]!.dispatchReason, 'COMPLETED');
    assert.equal(snapshot.passenger[current.rideId]!.phase, 'NONE');
    assert.equal(snapshot.passenger[current.rideId]!.reset, true);
    assert.equal(
      fixture.live.dispatcher.assignmentFor(assigned.requestId),
      undefined,
      'the completed ride released its claim exactly once',
    );
    assert.equal(fixture.live.dispatcher.taxiStatus(assigned.taxiId), 'AVAILABLE');

    // A replay of the exact completion observation is a duplicate with no second release.
    const replay = fixture.composition.lifecycle.dropoff.observe({
      rideId: current.rideId,
      taxiId: assigned.taxiId,
      tick: 68,
      positionM: dropoffAnchor,
      speedMps: 0,
    });
    assert.equal(replay.duplicate, true);
    assert.equal(replay.completion?.completeEventId, `dropoff-complete:${assigned.requestId}`);
    assert.equal(replay.completion?.release?.reason, 'COMPLETED');
    assert.equal(fixture.snapshot().rides.terminals.length, 1);
    assert.equal(fixture.snapshot().rides.counts.completed, 1);
  } finally {
    fixture.dispose();
  }
});

test('265 pickup rejects a fast pass and the wrong real zone before the valid dwell', () => {
  const fixture = createLiveRideLifecycleFixture({ dwellTicks: 3, civilianCount: 20 });
  try {
    fixture.runTo(60);
    const assigned = fixture.snapshot().live.assignments[0]!;
    const pickupAnchor = fixture.anchorFor(assigned.pickupZoneId),
      dropoffAnchor = fixture.anchorFor(assigned.dropoffZoneId);
    const rideId = fixture.snapshot().rides.rides[0]!.rideId;

    // A fast pass through the pickup zone never boards, even after the dwell length.
    fixture.driveTo(assigned.taxiId, pickupAnchor, 8);
    for (let tick = 61; tick <= 70; tick += 1) fixture.step(tick);
    let current = ride(fixture.snapshot(), rideId)!;
    assert.equal(current.state, 'TO_PICKUP');
    assert.equal(current.boardingTick, null);
    assert.equal(current.pickup?.dwellTicks, 0);

    // A stationary taxi at another real zone (the DROPOFF zone) is a WRONG_ZONE refusal.
    fixture.driveTo(assigned.taxiId, dropoffAnchor, 0);
    for (let tick = 71; tick <= 76; tick += 1) fixture.step(tick);
    current = ride(fixture.snapshot(), rideId)!;
    assert.equal(current.state, 'TO_PICKUP');
    assert.equal(current.boardingTick, null);

    // Only the real pickup zone with the required dwell completes the boarding.
    fixture.driveTo(assigned.taxiId, pickupAnchor, 0);
    for (let tick = 77; tick <= 82; tick += 1) fixture.step(tick);
    current = ride(fixture.snapshot(), rideId)!;
    assert.equal(current.state, 'TO_DROPOFF');
    assert.equal(current.boardingTick, 80);
    assert.equal(current.pickup?.dwellTicks, 3);
  } finally {
    fixture.dispose();
  }
});

test('265 a blocked taxi closes the active ride with FAILED/TAXI_BLOCKED and one release', () => {
  const fixture = createLiveRideLifecycleFixture({ dwellTicks: 3, civilianCount: 20 });
  try {
    fixture.runTo(60);
    const assigned = fixture.snapshot().live.assignments[0]!;
    fixture.driveTo(assigned.taxiId, fixture.anchorFor(assigned.pickupZoneId), 0);
    fixture.step(61);
    const rideId = fixture.snapshot().rides.rides[0]!.rideId;
    fixture.blocked.add(assigned.taxiId);
    const result = fixture.step(62);
    assert.equal(result.terminals.length, 1);
    const receipt = result.terminals[0]!;
    assert.equal(receipt.rideId, rideId);
    assert.equal(receipt.cause, 'BLOCKED');
    assert.equal(receipt.state, 'FAILED');
    assert.equal(receipt.reason, 'TAXI_BLOCKED');
    assert.equal(receipt.dispatchReason, 'FAILED');
    assert.equal(receipt.release?.reason, 'FAILED');
    assert.equal(receipt.release?.taxiId, assigned.taxiId);
    const snapshot = fixture.snapshot();
    assert.equal(snapshot.rides.counts.active, 0);
    assert.equal(snapshot.rides.counts.failed, 1);
    assert.equal(snapshot.rides.terminalsByCause.BLOCKED, 1);
    assert.equal(fixture.live.dispatcher.assignmentFor(assigned.requestId), undefined);
    assert.equal(fixture.live.dispatcher.taxiStatus(assigned.taxiId), 'BLOCKED');

    fixture.step(63);
    fixture.step(64);
    assert.equal(
      fixture.snapshot().rides.terminals.length,
      1,
      'a terminal ride cannot close twice',
    );
    assert.equal(fixture.snapshot().rides.counts.failed, 1);
  } finally {
    fixture.dispose();
  }
});

test('265 a player takeover keeps the ride and claim while another vehicle change is ignored', () => {
  const fixture = createLiveRideLifecycleFixture({ dwellTicks: 3, civilianCount: 20 });
  try {
    fixture.runTo(60);
    const assigned = fixture.snapshot().live.assignments[0]!;
    fixture.driveTo(assigned.taxiId, fixture.anchorFor(assigned.pickupZoneId), 0);
    fixture.step(61);
    const rideId = fixture.snapshot().rides.rides[0]!.rideId;

    // A different taxi changes mode: the active ride keeps its own claim and state.
    const other = fixture.ambient
      .list()
      .find((actor) => actor.driverKind === 'TAXI' && actor.vehicleId !== assigned.taxiId);
    assert.ok(other);
    fixture.ambient.traffic.setAuthority(other.vehicleId, 'MANUAL', 61);
    fixture.step(62);
    assert.equal(ride(fixture.snapshot(), rideId)!.state, 'PICKUP');
    fixture.ambient.traffic.setAuthority(other.vehicleId, 'AUTO', 62);

    // The player takes over the claimed taxi: the ride survives and the player can drive it.
    fixture.takeover(assigned.taxiId, 'LEARNING');
    const takeover = fixture.step(63);
    assert.equal(takeover.terminals.length, 0);
    let snapshot = fixture.snapshot();
    assert.equal(ride(snapshot, rideId)!.state, 'PICKUP');
    assert.equal(snapshot.rides.counts.active, 1);
    assert.equal(snapshot.live.counts.excludedPlayer, 1);
    assert.equal(
      fixture.live.dispatcher.assignmentFor(assigned.requestId)?.taxiId,
      assigned.taxiId,
      'the player-driven taxi keeps the real ride claim',
    );

    fixture.releasePlayer();
    fixture.step(64);
    snapshot = fixture.snapshot();
    assert.equal(ride(snapshot, rideId)!.terminal, false);
    assert.equal(snapshot.live.counts.excludedPlayer, 0);
    assert.equal(snapshot.rides.terminals.length, 0);
  } finally {
    fixture.dispose();
  }
});

test('265 scenario reset closes active rides with SCENARIO_RESET and leaves no duplicate claim', () => {
  const fixture = createLiveRideLifecycleFixture({ dwellTicks: 3, civilianCount: 20 });
  try {
    fixture.runTo(60);
    const assigned = fixture.snapshot().live.assignments[0]!;
    fixture.driveTo(assigned.taxiId, fixture.anchorFor(assigned.pickupZoneId), 0);
    fixture.step(61);
    assert.equal(fixture.snapshot().rides.counts.active, 1);
    const reset = fixture.composition.reset({ tick: 61, preserveStats: true });
    assert.equal(reset.closedRides, 1);
    assert.ok(reset.releasedAssignments >= 1);
    const snapshot = fixture.snapshot();
    assert.equal(snapshot.rides.counts.active, 0);
    assert.equal(snapshot.rides.rides.length, 0);
    assert.equal(snapshot.live.assignments.length, 0);
    assert.equal(fixture.live.dispatcher.assignmentFor(assigned.requestId), undefined);
    fixture.runTo(90);
    const after = fixture.snapshot();
    assert.equal(
      new Set(after.live.assignments.map((assignment) => assignment.requestId)).size,
      after.live.assignments.length,
    );
    assert.equal(
      new Set(after.live.assignments.map((assignment) => assignment.taxiId)).size,
      after.live.assignments.length,
    );
  } finally {
    fixture.dispose();
  }
});

test('265 ETA never invents zero seconds when the service is blocked', () => {
  const fixture = createLiveRideLifecycleFixture({ dwellTicks: 3, civilianCount: 20 });
  try {
    fixture.runTo(60);
    const assigned = fixture.snapshot().live.assignments[0]!;
    fixture.driveTo(assigned.taxiId, fixture.anchorFor(assigned.pickupZoneId), 0);
    for (let tick = 61; tick <= 64; tick += 1) fixture.step(tick);
    let snapshot = fixture.snapshot();
    assert.equal(snapshot.rides.rides[0]!.state, 'TO_DROPOFF');
    fixture.composition.setServiceState('BLOCKED');
    fixture.step(65);
    snapshot = fixture.snapshot();
    const current = snapshot.rides.rides[0]!;
    assert.ok(current.eta !== null);
    assert.equal(current.eta?.status, 'UNAVAILABLE');
    assert.equal(current.eta?.reason, 'SERVICE_BLOCKED');
    assert.equal(current.eta?.etaSeconds, null);
    assert.ok((current.eta?.remainingDistanceM ?? 0) > 0, 'the readable route keeps its distance');
    const projection = projectTaxiHud(
      fixture.composition.hud({
        taxiId: assigned.taxiId,
        mode: 'MANUAL',
        tick: 65,
        speedMps: 0,
      }),
    );
    assert.equal(projection.eta, 'Indisponibil');
    assert.match(projection.etaAccessible, /SERVICE_BLOCKED/);
    assert.equal(
      projection.details.find((detail) => detail.label === 'Motiv ETA')?.value,
      'SERVICE_BLOCKED',
    );
  } finally {
    fixture.dispose();
  }
});

test('265 lifecycle defaults match the frozen 062/063 service rules and have no wall clock', () => {
  assert.equal(LIVE_RIDE_LIFECYCLE_VERSION, '265-live-ride-lifecycle-v1');
  assert.equal(LIVE_RIDE_LIFECYCLE_LIMITS.tickRateHz, PICKUP_DEFAULTS.tickRateHz);
  assert.equal(LIVE_RIDE_LIFECYCLE_LIMITS.speedThresholdMps, PICKUP_DEFAULTS.speedThresholdMps);
  assert.equal(LIVE_RIDE_LIFECYCLE_LIMITS.dwellTicks, PICKUP_DEFAULTS.dwellTicks);
  assert.equal(
    LIVE_RIDE_LIFECYCLE_LIMITS.displacementToleranceM,
    PICKUP_DEFAULTS.displacementToleranceM,
  );
  assert.equal(LIVE_RIDE_LIFECYCLE_LIMITS.dwellTicks, DROPOFF_DEFAULTS.dwellTicks);
  assert.equal(LIVE_RIDE_LIFECYCLE_LIMITS.speedThresholdMps, DROPOFF_DEFAULTS.speedThresholdMps);
  assert.deepEqual([...LIVE_RIDE_TERMINAL_CAUSES].sort(), [
    'BLOCKED',
    'COMPLETED',
    'DAMAGED',
    'OFFLINE',
    'PLAYER_TAKEOVER',
    'SCENARIO_RESET',
  ]);
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(
    source,
    /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/,
  );
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|HTMLCanvasElement)\b/);
  assert.doesNotMatch(source, /from '@babylonjs\/|from '@dimforge\//);
});

test('265 committed lifecycle report is deterministic and every check passes', () => {
  const report = runLiveRideLifecycleReport(),
    saved = readFileSync(EVIDENCE, 'utf8');
  assert.equal(report.version, LIVE_RIDE_LIFECYCLE_REPORT_VERSION);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.ok(report.summary.checks >= 45);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, saved);
  assert.equal(report.completedRide.pickupDwellTicks, 180);
  assert.equal(report.completedRide.dropoffDwellTicks, 180);
  assert.equal(report.completedRide.releaseReason, 'COMPLETED');
  assert.equal(report.failure.state, 'FAILED');
  assert.equal(report.failure.reason, 'TAXI_BLOCKED');
  assert.equal(report.playerRide.stateWithPlayer, 'TO_PICKUP');
  assert.equal(report.playerRide.claimKeptWithPlayer, true);
  assert.equal(report.playerRide.terminalsWithPlayer, 0);
  assert.equal(report.playerRide.stateAfterRelease, 'TO_PICKUP');
  assert.equal(report.reset.activeAfter, 0);
  assert.equal(report.reset.duplicateRequests, 0);
  assert.equal(report.reset.duplicateTaxis, 0);
});
