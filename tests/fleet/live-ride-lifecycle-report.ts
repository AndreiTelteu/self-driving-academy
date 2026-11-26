import { LIVE_RIDE_LIFECYCLE_VERSION, type LiveRideLifecycleRideView } from '../../src/fleet';
import { projectTaxiHud } from '../../src/ui';
import type { LiveRideCompositionSnapshot } from '../../src/app';
import { createLiveRideLifecycleFixture } from './live-ride-lifecycle-fixture';

export const LIVE_RIDE_LIFECYCLE_REPORT_VERSION = '265-live-ride-lifecycle-report-v1' as const;

export interface LiveRideLifecycleReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveRideLifecycleReport {
  readonly version: typeof LIVE_RIDE_LIFECYCLE_REPORT_VERSION;
  readonly contract: typeof LIVE_RIDE_LIFECYCLE_VERSION;
  readonly fixture: Readonly<{
    taxis: number;
    civilians: number;
    seed: number;
    dwellTicks: number;
    ticks: number;
    resetTick: number;
  }>;
  readonly completedRide: Readonly<{
    rideId: string;
    requestId: string;
    taxiId: string;
    pickupZoneId: string;
    dropoffZoneId: string;
    startedTick: number;
    boardingTick: number;
    completionTick: number;
    pickupDwellTicks: number;
    dropoffDwellTicks: number;
    requiredDwellTicks: number;
    transitions: number;
    releaseReason: string | null;
    pickupAnchor: Readonly<{ x: number; y: number; z: number }>;
    dropoffAnchor: Readonly<{ x: number; y: number; z: number }>;
  }>;
  readonly passenger: Readonly<{
    waitingPhase: string;
    waitingMarkers: readonly string[];
    boardingPhase: string;
    boardingMarkers: readonly string[];
    boardingAnchorMatches: boolean;
    onboardPhase: string;
    onboardMarkers: readonly string[];
    onboardOccupancy: number;
    droppingPhase: string;
    droppingMarkers: readonly string[];
    completedPhase: string;
    completedReset: boolean;
  }>;
  readonly hud: Readonly<{
    pickupStage: string;
    pickupObjective: string;
    pickupEta: string;
    onboardStage: string;
    onboardEta: string;
    onboardProgress: string;
    droppingStage: string;
    droppingEta: string;
  }>;
  readonly failure: Readonly<{
    rideId: string;
    taxiId: string;
    cause: string;
    state: string;
    reason: string | null;
    dispatchReason: string;
    releaseTaxiId: string | null;
    releaseReason: string | null;
    claimReleased: boolean;
    receiptsForRide: number;
  }>;
  readonly playerRide: Readonly<{
    rideId: string;
    taxiId: string;
    stateWithPlayer: string;
    claimKeptWithPlayer: boolean;
    excludedPlayer: number;
    terminalsWithPlayer: number;
    stateAfterRelease: string;
    claimKeptAfterRelease: boolean;
    terminalsAfterRelease: number;
  }>;
  readonly eta: Readonly<{
    blockedReason: string | null;
    blockedEtaSeconds: number | null;
    blockedRemainingM: number | null;
    hudEta: string;
    hudReason: string | null;
  }>;
  readonly reset: Readonly<{
    activeBefore: number;
    closedRides: number;
    releasedAssignments: number;
    activeAfter: number;
    assignmentsAfter: number;
    ridesAfter: number;
    duplicateRequests: number;
    duplicateTaxis: number;
  }>;
  readonly checks: readonly LiveRideLifecycleReportCheck[];
  readonly summary: Readonly<{
    version: typeof LIVE_RIDE_LIFECYCLE_REPORT_VERSION;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: LiveRideLifecycleReportCheck['expected'],
  actual: LiveRideLifecycleReportCheck['actual'],
  detail: string,
): LiveRideLifecycleReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function rideByRequest(
  snapshot: LiveRideCompositionSnapshot,
  requestId: string,
): LiveRideLifecycleRideView {
  const ride = snapshot.rides.rides.find((entry) => entry.requestId === requestId);
  if (ride === undefined) throw new Error(`Missing ride for ${requestId}`);
  return ride;
}

/** Deterministic 265 report on the real 24/32 live fleet and the real 032/033/041/059/060 chain. */
export function runLiveRideLifecycleReport(): LiveRideLifecycleReport {
  const fixture = createLiveRideLifecycleFixture({
    dwellTicks: 180,
    civilianCount: 32,
  });
  try {
    fixture.runTo(60);
    const initial = fixture.snapshot();
    const assigned = initial.live.assignments[0];
    if (assigned === undefined) throw new Error('No live assignment at tick 60');
    const ride = rideByRequest(initial, assigned.requestId);
    const waitingFrame = initial.passenger[ride.rideId]!;
    const pickupAnchor = fixture.anchorFor(assigned.pickupZoneId),
      dropoffAnchor = fixture.anchorFor(assigned.dropoffZoneId);
    const pickupHud = projectTaxiHud(
      fixture.composition.hud({
        taxiId: assigned.taxiId,
        mode: 'AUTO',
        tick: initial.tick,
        speedMps: 0,
      }),
    );

    fixture.driveTo(assigned.taxiId, pickupAnchor, 0);
    fixture.step(61);
    let snapshot = fixture.snapshot(),
      current = rideByRequest(snapshot, assigned.requestId);
    const boardingFrame = snapshot.passenger[ride.rideId]!;
    const boardingMarker = boardingFrame.markers.find((marker) => marker.role === 'PICKUP');
    let tick = 61;
    while (current.boardingTick === null) {
      tick += 1;
      if (tick > 61 + 200) throw new Error('Ride did not board in the expected dwell');
      fixture.step(tick);
      snapshot = fixture.snapshot();
      current = rideByRequest(snapshot, assigned.requestId);
    }
    const boardingTick = current.boardingTick;
    const pickupDwellTicks = current.pickup?.dwellTicks ?? -1;
    const onboardFrame = snapshot.passenger[ride.rideId]!;
    const onboardHud = projectTaxiHud(
      fixture.composition.hud({
        taxiId: assigned.taxiId,
        mode: 'MANUAL',
        tick,
        speedMps: 0,
      }),
    );

    fixture.driveTo(assigned.taxiId, dropoffAnchor, 0);
    do {
      tick += 1;
      if (tick > boardingTick + 10) throw new Error('Destination arrival was not observed');
      fixture.step(tick);
      snapshot = fixture.snapshot();
      current = rideByRequest(snapshot, assigned.requestId);
    } while (current.state !== 'DROPOFF');
    const droppingFrame = snapshot.passenger[ride.rideId]!;
    const droppingHud = projectTaxiHud(
      fixture.composition.hud({
        taxiId: assigned.taxiId,
        mode: 'MANUAL',
        tick,
        speedMps: 0,
      }),
    );
    while (!current.terminal) {
      tick += 1;
      if (tick > boardingTick + 10 + 200) throw new Error('Ride did not complete in the dwell');
      fixture.step(tick);
      snapshot = fixture.snapshot();
      current = rideByRequest(snapshot, assigned.requestId);
    }
    const completedRide = current;
    const completionTick = current.completionTick ?? -1;
    const dropoffDwellTicks = current.dropoff?.dwellTicks ?? -1;
    const completedFrame = snapshot.passenger[ride.rideId]!;

    // FAILED: a claimed taxi becomes blocked; the ride closes with a real reason and release.
    tick += 1;
    fixture.step(tick);
    snapshot = fixture.snapshot();
    const blockedTarget = snapshot.rides.rides.find(
      (entry) => !entry.terminal && entry.state === 'TO_PICKUP',
    );
    if (blockedTarget === undefined) throw new Error('No active ride for the failure probe');
    fixture.blocked.add(blockedTarget.taxiId);
    tick += 1;
    const failureResult = fixture.step(tick);
    snapshot = fixture.snapshot();
    const failureReceipt = failureResult.terminals.find(
      (receipt) => receipt.rideId === blockedTarget.rideId,
    );
    if (failureReceipt === undefined) throw new Error('Blocked ride did not produce a receipt');

    // PLAYER RIDE: taking over the claimed taxi keeps the real ride; it is not cancelled.
    tick += 1;
    fixture.step(tick);
    snapshot = fixture.snapshot();
    const playerTarget = snapshot.rides.rides.find(
      (entry) => !entry.terminal && entry.state === 'TO_PICKUP',
    );
    if (playerTarget === undefined) throw new Error('No active ride for the player probe');
    fixture.takeover(playerTarget.taxiId, 'LEARNING');
    tick += 1;
    const playerResult = fixture.step(tick);
    snapshot = fixture.snapshot();
    const playerRide = rideByRequest(snapshot, playerTarget.requestId);
    const claimWithPlayer = fixture.live.dispatcher.assignmentFor(playerTarget.requestId);
    const playerState = {
      stateWithPlayer: playerRide.state,
      claimKeptWithPlayer: claimWithPlayer?.taxiId === playerTarget.taxiId,
      excludedPlayer: snapshot.live.counts.excludedPlayer,
      terminalsWithPlayer: playerResult.terminals.length,
    };
    fixture.releasePlayer();
    tick += 1;
    fixture.step(tick);
    snapshot = fixture.snapshot();
    const afterRelease = rideByRequest(snapshot, playerTarget.requestId);
    const claimAfterRelease = fixture.live.dispatcher.assignmentFor(playerTarget.requestId);

    // ETA: an explicit blocked service is unavailable, never an invented zero.
    fixture.composition.setServiceState('BLOCKED');
    tick += 1;
    fixture.step(tick);
    snapshot = fixture.snapshot();
    const etaTarget = snapshot.rides.rides.find(
      (entry) => !entry.terminal && entry.state === 'TO_PICKUP',
    );
    if (etaTarget === undefined) throw new Error('No active ride for the ETA probe');
    const blockedEta = etaTarget.eta;
    const blockedHud = projectTaxiHud(
      fixture.composition.hud({
        taxiId: etaTarget.taxiId,
        mode: 'AUTO',
        tick: snapshot.tick,
        speedMps: 0,
      }),
    );
    fixture.composition.setServiceState('FREE_FLOW');

    const activeBefore = snapshot.rides.counts.active;
    tick += 1;
    const reset = fixture.composition.reset({ tick, preserveStats: true });
    const afterReset = fixture.snapshot();
    const duplicateRequests =
      afterReset.live.assignments.length -
      new Set(afterReset.live.assignments.map((assignment) => assignment.requestId)).size;
    const duplicateTaxis =
      afterReset.live.assignments.length -
      new Set(afterReset.live.assignments.map((assignment) => assignment.taxiId)).size;

    const checks: LiveRideLifecycleReportCheck[] = [
      check(
        'passenger-contract-version',
        '147-passenger-visual-v1',
        completedFrame.version,
        'the 147 passenger frame is accepted',
      ),
      check('ride-starts', 'TO_PICKUP', ride.state, 'a live assignment starts a real 061 ride'),
      check('ride-follows-claim', assigned.taxiId, ride.taxiId, 'the ride keeps the claimed taxi'),
      check(
        'real-pickup-zone',
        true,
        assigned.pickupZoneId.startsWith('sz:'),
        assigned.pickupZoneId,
      ),
      check(
        'real-dropoff-zone',
        true,
        assigned.dropoffZoneId.startsWith('sz:'),
        assigned.dropoffZoneId,
      ),
      check(
        'pickup-arrival-visible',
        'BOARDING',
        boardingFrame.phase,
        'the 147 passenger waits at the real pickup anchor',
      ),
      check(
        'pickup-marker',
        true,
        boardingMarker !== undefined,
        'P marker is present during boarding',
      ),
      check(
        'pickup-marker-anchor',
        true,
        boardingMarker !== undefined &&
          boardingMarker.x === pickupAnchor.x &&
          boardingMarker.z === pickupAnchor.z,
        'the marker uses the validated 032 anchor',
      ),
      check(
        'passenger-marker',
        true,
        boardingFrame.markers.some((marker) => marker.role === 'PASSENGER'),
        'the S marker accompanies the passenger',
      ),
      check(
        'pickup-dwell',
        180,
        pickupDwellTicks,
        'boarding happens after the required 180-tick dwell',
      ),
      check(
        'boarding-tick',
        241,
        boardingTick,
        'the real boarding tick from the assignment tick 60',
      ),
      check('onboard-phase', 'ONBOARD', onboardFrame.phase, 'the passenger stays on board'),
      check('onboard-occupancy', 1, onboardFrame.occupancy, 'exactly one passenger on board'),
      check(
        'onboard-marker',
        'DROPOFF',
        onboardFrame.markers[0]?.role ?? 'none',
        'only the destination marker remains',
      ),
      check(
        'dropoff-arrival-visible',
        'DROPPING_OFF',
        droppingFrame.phase,
        'the destination arrival is visible during the dwell',
      ),
      check(
        'dropoff-dwell',
        180,
        dropoffDwellTicks,
        'completion happens after the required 180-tick dwell',
      ),
      check('completed-state', 'COMPLETED', completedRide.state, 'the ride completes through 061'),
      check(
        'completed-release',
        'COMPLETED',
        completedRide.release?.reason ?? null,
        '061 releases the real 060 claim',
      ),
      check(
        'completed-passenger-hidden',
        'NONE',
        completedFrame.phase,
        'the passenger disappears after dropoff',
      ),
      check('completed-passenger-reset', true, completedFrame.reset, 'the 147 frame is a reset'),
      check(
        'completed-markers-empty',
        0,
        completedFrame.markers.length,
        'no marker survives the terminal ride',
      ),
      check(
        'hud-pickup-stage',
        'Spre pasager',
        pickupHud.stage,
        'the 073 HUD names the pickup stage',
      ),
      check(
        'hud-pickup-objective',
        true,
        pickupHud.objective.includes(assigned.pickupZoneId),
        pickupHud.objective,
      ),
      check(
        'hud-pickup-eta',
        true,
        pickupHud.eta !== 'Fără estimare' && pickupHud.eta !== 'Indisponibil',
        pickupHud.eta,
      ),
      check(
        'hud-onboard-stage',
        'Spre destinație',
        onboardHud.stage,
        'the 073 HUD names the trip stage',
      ),
      check('hud-onboard-eta', true, onboardHud.eta !== 'Fără estimare', onboardHud.eta),
      check('hud-onboard-progress', true, onboardHud.progress !== '—', onboardHud.progress),
      check(
        'hud-dropoff-stage',
        'La destinație',
        droppingHud.stage,
        'the 073 HUD names the dropoff stage',
      ),
      check(
        'hud-dropoff-eta',
        'La destinație',
        droppingHud.eta,
        'ETA ARRIVED is not displayed as zero',
      ),
      check(
        'failure-cause',
        'BLOCKED',
        failureReceipt.cause,
        'a blocked taxi closes the ride explicitly',
      ),
      check('failure-state', 'FAILED', failureReceipt.state, 'the terminal state is FAILED'),
      check(
        'failure-reason',
        'TAXI_BLOCKED',
        failureReceipt.reason,
        'the closed 061 failure reason is preserved',
      ),
      check(
        'failure-dispatch-release',
        'FAILED',
        failureReceipt.dispatchReason,
        'the 060 release reason is FAILED',
      ),
      check(
        'failure-claim-released',
        true,
        failureReceipt.release !== null,
        'the claim is released exactly once',
      ),
      check(
        'failure-single-receipt',
        1,
        snapshot.rides.terminals.filter((entry) => entry.rideId === failureReceipt.rideId).length,
        'a terminal ride cannot close twice',
      ),
      check(
        'player-ride-survives',
        'TO_PICKUP',
        playerState.stateWithPlayer,
        'the player-driven taxi keeps the live ride',
      ),
      check(
        'player-claim-kept',
        true,
        playerState.claimKeptWithPlayer,
        'the 060 claim survives the takeover',
      ),
      check(
        'player-excluded-from-new-dispatch',
        true,
        playerState.excludedPlayer >= 1,
        'the player-driven taxi is not offered to new requests',
      ),
      check(
        'player-no-terminal',
        0,
        playerState.terminalsWithPlayer,
        'taking over the ride does not close it',
      ),
      check(
        'player-ride-after-release',
        'TO_PICKUP',
        afterRelease.state,
        'the ride survives the return to AUTO',
      ),
      check(
        'player-claim-after-release',
        true,
        claimAfterRelease?.taxiId === playerTarget.taxiId,
        'the claim stays with the same taxi after release',
      ),
      check(
        'eta-blocked-reason',
        'SERVICE_BLOCKED',
        blockedEta?.reason ?? null,
        'a blocked service is an explicit unavailable reason',
      ),
      check(
        'eta-blocked-seconds',
        null,
        blockedEta?.etaSeconds ?? null,
        'no zero seconds are invented',
      ),
      check(
        'eta-blocked-distance',
        true,
        (blockedEta?.remainingDistanceM ?? 0) > 0,
        'the readable route keeps its real distance',
      ),
      check(
        'hud-blocked-eta',
        'Indisponibil',
        blockedHud.eta,
        'the 073 HUD shows unavailable, not zero',
      ),
      check(
        'hud-blocked-reason',
        'SERVICE_BLOCKED',
        blockedHud.details.find((detail) => detail.label === 'Motiv ETA')?.value ?? null,
        'the closed reason stays in the details',
      ),
      check(
        'reset-closes-active',
        activeBefore,
        reset.closedRides,
        'every active ride is closed with SCENARIO_RESET',
      ),
      check(
        'reset-releases-claims',
        true,
        reset.releasedAssignments >= activeBefore,
        'every claim is released',
      ),
      check('reset-active-zero', 0, afterReset.rides.counts.active, 'no ride survives the reset'),
      check(
        'reset-assignments-zero',
        0,
        afterReset.live.assignments.length,
        'no claim survives the reset',
      ),
      check(
        'reset-rides-zero',
        0,
        afterReset.rides.rides.length,
        'the lifecycle is empty after reset',
      ),
      check(
        'reset-duplicate-requests',
        0,
        duplicateRequests,
        'post-reset request map has no duplicate',
      ),
      check('reset-duplicate-taxis', 0, duplicateTaxis, 'post-reset taxi map has no duplicate'),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return {
      version: LIVE_RIDE_LIFECYCLE_REPORT_VERSION,
      contract: LIVE_RIDE_LIFECYCLE_VERSION,
      fixture: {
        taxis: 24,
        civilians: 32,
        seed: fixture.ambient.seed,
        dwellTicks: 180,
        ticks: tick,
        resetTick: tick,
      },
      completedRide: {
        rideId: completedRide.rideId,
        requestId: completedRide.requestId,
        taxiId: completedRide.taxiId,
        pickupZoneId: completedRide.pickupZoneId,
        dropoffZoneId: completedRide.dropoffZoneId,
        startedTick: completedRide.startedTick,
        boardingTick,
        completionTick,
        pickupDwellTicks,
        dropoffDwellTicks,
        requiredDwellTicks: completedRide.pickup?.requiredDwellTicks ?? 0,
        transitions: completedRide.transitions,
        releaseReason: completedRide.release?.reason ?? null,
        pickupAnchor,
        dropoffAnchor,
      },
      passenger: {
        waitingPhase: waitingFrame.phase,
        waitingMarkers: waitingFrame.markers.map((marker) => marker.role),
        boardingPhase: boardingFrame.phase,
        boardingMarkers: boardingFrame.markers.map((marker) => marker.role),
        boardingAnchorMatches:
          boardingMarker !== undefined &&
          boardingMarker.x === pickupAnchor.x &&
          boardingMarker.z === pickupAnchor.z,
        onboardPhase: onboardFrame.phase,
        onboardMarkers: onboardFrame.markers.map((marker) => marker.role),
        onboardOccupancy: onboardFrame.occupancy,
        droppingPhase: droppingFrame.phase,
        droppingMarkers: droppingFrame.markers.map((marker) => marker.role),
        completedPhase: completedFrame.phase,
        completedReset: completedFrame.reset,
      },
      hud: {
        pickupStage: pickupHud.stage,
        pickupObjective: pickupHud.objective,
        pickupEta: pickupHud.eta,
        onboardStage: onboardHud.stage,
        onboardEta: onboardHud.eta,
        onboardProgress: onboardHud.progress,
        droppingStage: droppingHud.stage,
        droppingEta: droppingHud.eta,
      },
      failure: {
        rideId: failureReceipt.rideId,
        taxiId: failureReceipt.taxiId,
        cause: failureReceipt.cause,
        state: failureReceipt.state,
        reason: failureReceipt.reason,
        dispatchReason: failureReceipt.dispatchReason,
        releaseTaxiId: failureReceipt.release?.taxiId ?? null,
        releaseReason: failureReceipt.release?.reason ?? null,
        claimReleased:
          fixture.live.dispatcher.assignmentFor(failureReceipt.requestId) === undefined,
        receiptsForRide: snapshot.rides.terminals.filter(
          (entry) => entry.rideId === failureReceipt.rideId,
        ).length,
      },
      playerRide: {
        rideId: playerRide.rideId,
        taxiId: playerRide.taxiId,
        stateWithPlayer: playerState.stateWithPlayer,
        claimKeptWithPlayer: playerState.claimKeptWithPlayer,
        excludedPlayer: playerState.excludedPlayer,
        terminalsWithPlayer: playerState.terminalsWithPlayer,
        stateAfterRelease: afterRelease.state,
        claimKeptAfterRelease: claimAfterRelease?.taxiId === playerTarget.taxiId,
        terminalsAfterRelease: snapshot.rides.terminals.filter(
          (entry) => entry.rideId === playerRide.rideId,
        ).length,
      },
      eta: {
        blockedReason: blockedEta?.reason ?? null,
        blockedEtaSeconds: blockedEta?.etaSeconds ?? null,
        blockedRemainingM: blockedEta?.remainingDistanceM ?? null,
        hudEta: blockedHud.eta,
        hudReason: blockedHud.details.find((detail) => detail.label === 'Motiv ETA')?.value ?? null,
      },
      reset: {
        activeBefore,
        closedRides: reset.closedRides,
        releasedAssignments: reset.releasedAssignments,
        activeAfter: afterReset.rides.counts.active,
        assignmentsAfter: afterReset.live.assignments.length,
        ridesAfter: afterReset.rides.rides.length,
        duplicateRequests,
        duplicateTaxis,
      },
      checks,
      summary: {
        version: LIVE_RIDE_LIFECYCLE_REPORT_VERSION,
        checks: checks.length,
        passed,
        pass: passed === checks.length,
      },
    };
  } finally {
    fixture.dispose();
  }
}
