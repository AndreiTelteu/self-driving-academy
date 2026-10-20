import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DROPOFF_DEFAULTS,
  DROPOFF_LIMITS,
  DROPOFF_REJECTION_REASONS,
  DROPOFF_VERSION,
  createRideDropoff,
  createRideLifecycle,
  createRidePickup,
  dropoffCompleteEventId,
} from '../../src/fleet';
import type { DropoffDecision, DropoffRejectionReason, RideState } from '../../src/fleet';
import { createDispatcherWorld } from './dispatcher-fixture';
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
  zoneCenter,
} from './dropoff-fixture';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from './ride-fsm-fixture';

export interface DropoffReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

interface SimulationRide {
  readonly requestId: string;
  readonly taxiId: string;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly boardTick: number;
  readonly dropoffStartTick: number;
  readonly completeTick: number;
  readonly boardDwellTicks: number;
  readonly completeDwellTicks: number;
  readonly state: RideState;
  readonly events: readonly string[];
  readonly releaseReason: string | null;
}

interface Simulation {
  readonly assignments: number;
  readonly boarded: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly active: number;
  readonly releases: number;
  readonly requests: number;
  readonly duplicateTaxis: boolean;
  readonly uniqueDropoffZones: number;
  readonly uniqueCompleteEvents: number;
  readonly minCompleteDwellTicks: number;
  readonly maxCompleteDwellTicks: number;
  readonly exactDwellRides: number;
  readonly pickupRejections: number;
  readonly pickupDuplicates: number;
  readonly dropoffRejections: number;
  readonly dropoffDuplicates: number;
  readonly minTransitions: number;
  readonly maxTransitions: number;
  readonly rides: readonly SimulationRide[];
}

export interface DropoffReport {
  readonly version: typeof DROPOFF_VERSION;
  readonly generatedBy: 'npm run ride:dropoff';
  readonly oracleRule: string;
  readonly defaults: typeof DROPOFF_DEFAULTS;
  readonly limits: typeof DROPOFF_LIMITS;
  readonly fleet: Readonly<{ taxis: number; civilians: number; requests: number }>;
  readonly exactDwell: Readonly<{
    requiredDwellTicks: number;
    startTick: number;
    completeTick: number;
    pendingBeforeComplete: number;
    dwellAtComplete: number;
    dwellSeconds: number;
    stateAfterComplete: RideState;
    events: readonly string[];
    transitionTicks: readonly number[];
    replayDuplicate: boolean;
    transitionsAfterReplay: number;
    releaseReason: string | null;
    taxiStatus: string | undefined;
    metricsPreserved: boolean;
  }>;
  readonly fastPass: Readonly<{
    samples: number;
    insideSamples: number;
    reasons: readonly DropoffRejectionReason[];
    maxDwell: number;
    state: RideState;
    transitions: number;
    completions: number;
  }>;
  readonly zoneRejections: Readonly<{
    outside: Readonly<{ samples: number; reason: DropoffRejectionReason }>;
    otherDropoffZone: Readonly<{
      zoneId: string;
      samples: number;
      reason: DropoffRejectionReason;
    }>;
    pickupZone: Readonly<{ zoneId: string; samples: number; reason: DropoffRejectionReason }>;
    state: RideState;
    transitions: number;
    completions: number;
  }>;
  readonly incompatibleZone: Readonly<{
    reason: DropoffRejectionReason;
    inDropoffZone: boolean;
    state: RideState;
    completions: number;
  }>;
  readonly boundary: Readonly<{
    exactBoundaryInZone: boolean;
    exactBoundaryReason: DropoffRejectionReason | null;
    outsideReason: DropoffRejectionReason;
    reentryReason: DropoffRejectionReason | null;
    completeTick: number;
    dwellTicks: number;
    state: RideState;
  }>;
  readonly idempotency: Readonly<{
    sameTickDuplicate: boolean;
    laterDuplicate: boolean;
    transitions: number;
    completions: number;
    completeEvents: number;
    lifecycleDuplicates: number;
    releases: number;
  }>;
  readonly wrongRide: Readonly<{
    unknown: DropoffRejectionReason;
    foreign: DropoffRejectionReason;
    notOnTrip: DropoffRejectionReason;
    cancelled: DropoffRejectionReason;
    failed: DropoffRejectionReason;
    notOnTripState: RideState;
    cancelledState: RideState;
    failedState: RideState;
    completions: number;
  }>;
  readonly stale: Readonly<{
    staleBefore: boolean;
    staleAfterAdvance: boolean;
    tickAfterStale: number;
    restartDwell: number;
    state: RideState;
    staleCount: number;
  }>;
  readonly release: Readonly<{
    attemptedCompletionRejected: boolean;
    stateAfterAttempt: RideState;
    completions: number;
    lifecycleReleases: number;
    dispatcherReleaseReason: string | null;
    taxiStatus: string | undefined;
  }>;
  readonly equivalence: Readonly<{
    identical: boolean;
    manualState: RideState;
    autonomousState: RideState;
    manualDwellTicks: number | null;
    autonomousDwellTicks: number | null;
    completeTick: number;
  }>;
  readonly simulation: Simulation;
  readonly disposal: Readonly<{
    disposed: boolean;
    attempts: number;
    completions: number;
    observations: number;
    completed: number;
    tick: number;
    rideState: RideState;
    taxiStatus: string | undefined;
    releases: number;
  }>;
  readonly determinism: Readonly<{ identical: boolean; rides: number }>;
  readonly checks: readonly DropoffReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): DropoffReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): DropoffReportCheck {
  return check(name, true, actual, detail);
}

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function metricSnapshot(world: ReturnType<typeof createDropoffWorld>): readonly unknown[] {
  const ride = world.rideWorld.lifecycle.ride(world.rideId)!;
  return [
    ride.pickupZoneId,
    ride.dropoffZoneId,
    ride.pickupCostSeconds,
    ride.tripCostSeconds,
    ride.totalCostSeconds,
    ride.pickupRouteLaneIds,
    ride.tripRouteLaneIds,
    ride.startedTick,
  ];
}

function exactDwellProbe(): DropoffReport['exactDwell'] {
  const world = createDropoffWorld(),
    required = world.dropoff.requiredDwellTicks,
    startTick = world.startTick,
    before = metricSnapshot(world);
  let pending = world.dropoff.observe(dropoffObservation(world, { tick: startTick }));
  for (let offset = 1; offset < required; offset += 1)
    pending = world.dropoff.observe(dropoffObservation(world, { tick: startTick + offset }));
  const completed = world.dropoff.observe(
      dropoffObservation(world, { tick: startTick + required }),
    ),
    ride = world.rideWorld.lifecycle.ride(world.rideId)!,
    replay = world.dropoff.observe(dropoffObservation(world, { tick: startTick + required })),
    after = metricSnapshot(world),
    report = {
      requiredDwellTicks: required,
      startTick,
      completeTick: completed.tick,
      pendingBeforeComplete: pending.dwellTicks,
      dwellAtComplete: completed.dwellTicks,
      dwellSeconds: completed.dwellSeconds,
      stateAfterComplete: ride.state,
      events: Object.freeze(ride.transitions.map((entry) => entry.event)),
      transitionTicks: Object.freeze(ride.transitions.map((entry) => entry.tick)),
      replayDuplicate: replay.duplicate,
      transitionsAfterReplay: world.rideWorld.lifecycle.ride(world.rideId)!.transitions.length,
      releaseReason: ride.release?.reason ?? null,
      taxiStatus: world.rideWorld.dispatcherWorld.dispatcher.taxiStatus(world.assignment.taxiId),
      metricsPreserved: JSON.stringify(before) === JSON.stringify(after),
    };
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function fastPassProbe(): DropoffReport['fastPass'] {
  const world = createDropoffWorld(),
    bounds = zoneBounds(world.rideWorld.dispatcherWorld.map, world.dropoffZoneId),
    steps = 13,
    startTick = world.startTick,
    reasons = new Set<DropoffRejectionReason>();
  let maxDwell = 0,
    insideSamples = 0;
  for (let index = 0; index < steps; index += 1) {
    const x = bounds.minX - 2 + ((bounds.maxX - bounds.minX + 4) * index) / (steps - 1),
      decision = world.dropoff.observe(
        dropoffObservation(world, {
          tick: startTick + index,
          positionM: { x, y: 0, z: world.dropoffZoneCenter.z },
          speedMps: 5,
        }),
      );
    if (decision.inDropoffZone) insideSamples += 1;
    if (decision.reason !== null) reasons.add(decision.reason);
    maxDwell = Math.max(maxDwell, decision.dwellTicks);
  }
  const report = {
    samples: steps,
    insideSamples,
    reasons: Object.freeze([...reasons].sort()),
    maxDwell,
    state: rideState(world),
    transitions: world.rideWorld.lifecycle.ride(world.rideId)!.transitions.length,
    completions: world.dropoff.completions().length,
  };
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function zoneRejectionsProbe(): DropoffReport['zoneRejections'] {
  const world = createDropoffWorld(),
    startTick = world.startTick;
  let outside: DropoffDecision = world.dropoff.observe(
      dropoffObservation(world, { tick: startTick, positionM: world.outsidePoint }),
    ),
    other: DropoffDecision = world.dropoff.observe(
      dropoffObservation(world, { tick: startTick + 1, positionM: world.otherDropoffZoneCenter }),
    ),
    pickupZone: DropoffDecision = world.dropoff.observe(
      dropoffObservation(world, { tick: startTick + 2, positionM: world.pickupZoneCenter }),
    );
  for (let tick = startTick + 1; tick <= startTick + 199; tick += 1)
    outside = world.dropoff.observe(
      dropoffObservation(world, { tick, positionM: world.outsidePoint }),
    );
  for (let tick = startTick + 200; tick <= startTick + 379; tick += 1)
    other = world.dropoff.observe(
      dropoffObservation(world, { tick, positionM: world.otherDropoffZoneCenter }),
    );
  for (let tick = startTick + 380; tick <= startTick + 479; tick += 1)
    pickupZone = world.dropoff.observe(
      dropoffObservation(world, { tick, positionM: world.pickupZoneCenter }),
    );
  const report = {
    outside: Object.freeze({ samples: 200, reason: outside.reason! }),
    otherDropoffZone: Object.freeze({
      zoneId: world.otherDropoffZoneId,
      samples: 180,
      reason: other.reason!,
    }),
    pickupZone: Object.freeze({
      zoneId: world.pickupZoneId,
      samples: 100,
      reason: pickupZone.reason!,
    }),
    state: rideState(world),
    transitions: world.rideWorld.lifecycle.ride(world.rideId)!.transitions.length,
    completions: world.dropoff.completions().length,
  };
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function incompatibleZoneProbe(): DropoffReport['incompatibleZone'] {
  const world = createDropoffWorld(),
    dropoff = createRideDropoff({
      map: withZoneKind(world.rideWorld.dispatcherWorld.map, world.dropoffZoneId, 'PICKUP'),
      lifecycle: world.rideWorld.lifecycle,
    }),
    decision = dropoff.observe(dropoffObservation(world)),
    report = {
      reason: decision.reason!,
      inDropoffZone: decision.inDropoffZone,
      state: rideState(world),
      completions: dropoff.completions().length,
    };
  dropoff.dispose();
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function boundaryProbe(): DropoffReport['boundary'] {
  const world = createDropoffWorld(),
    bounds = zoneBounds(world.rideWorld.dispatcherWorld.map, world.dropoffZoneId),
    exact = { x: bounds.maxX, y: 0, z: world.dropoffZoneCenter.z },
    startTick = world.startTick,
    first = world.dropoff.observe(dropoffObservation(world, { tick: startTick, positionM: exact })),
    outside = world.dropoff.observe(
      dropoffObservation(world, {
        tick: startTick + 81,
        positionM: world.boundaryOutsidePoint,
      }),
    ),
    reentered = world.dropoff.observe(
      dropoffObservation(world, { tick: startTick + 82, positionM: exact }),
    ),
    completed = holdAndComplete(world, startTick + 82, true, exact),
    report = {
      exactBoundaryInZone: first.inDropoffZone,
      exactBoundaryReason: first.reason,
      outsideReason: outside.reason!,
      reentryReason: reentered.reason,
      completeTick: completed.tick,
      dwellTicks: completed.dwellTicks,
      state: rideState(world),
    };
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function idempotencyProbe(): DropoffReport['idempotency'] {
  const world = createDropoffWorld(),
    required = world.dropoff.requiredDwellTicks,
    startTick = world.startTick;
  holdStationary(world, startTick);
  completeAt(world, startTick);
  const sameTick = world.dropoff.observe(dropoffObservation(world, { tick: startTick + required })),
    later = world.dropoff.observe(dropoffObservation(world, { tick: startTick + 900 })),
    ride = world.rideWorld.lifecycle.ride(world.rideId)!,
    report = {
      sameTickDuplicate: sameTick.duplicate,
      laterDuplicate: later.duplicate,
      transitions: ride.transitions.length,
      completions: world.dropoff.completions().length,
      completeEvents: ride.appliedEventIds.filter(
        (eventId) => eventId === dropoffCompleteEventId(world.assignment.requestId),
      ).length,
      lifecycleDuplicates: world.rideWorld.lifecycle.stats().duplicates,
      releases: world.rideWorld.dispatcherWorld.dispatcher.releases().length,
    };
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function wrongRideProbe(): DropoffReport['wrongRide'] {
  const world = createDropoffWorld(),
    startTick = world.startTick,
    unknown = world.dropoff.observe(
      dropoffObservation(world, { tick: startTick, rideId: 'ride:unknown' }),
    ),
    foreign = world.dropoff.observe(
      dropoffObservation(world, { tick: startTick + 1, taxiId: 'taxi:foreign' }),
    );
  const cancelledWorld = createDropoffWorld(),
    cancelledTick = cancelledWorld.startTick;
  cancelledWorld.rideWorld.lifecycle.apply({
    rideId: cancelledWorld.rideId,
    eventId: 'cancel:before-dropoff',
    event: 'CANCELLED',
    tick: cancelledTick,
    reason: 'PLAYER_CANCELLED',
  });
  const cancelled = cancelledWorld.dropoff.observe(
    dropoffObservation(cancelledWorld, { tick: cancelledTick + 1 }),
  );
  const failedWorld = createDropoffWorld(),
    failedTick = failedWorld.startTick;
  failedWorld.rideWorld.lifecycle.apply({
    rideId: failedWorld.rideId,
    eventId: 'fail:at-destination',
    event: 'FAILED',
    tick: failedTick,
    reason: 'TAXI_DAMAGED',
  });
  const failed = failedWorld.dropoff.observe(
    dropoffObservation(failedWorld, { tick: failedTick + 1 }),
  );
  const early = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    earlyAssignment = early.assignments[0]!,
    { result } = beginFirstRide(early),
    earlyDropoff = createRideDropoff({
      map: early.dispatcherWorld.map,
      lifecycle: early.lifecycle,
    }),
    notOnTrip = earlyDropoff.observe({
      rideId: result.ride.rideId,
      taxiId: earlyAssignment.taxiId,
      tick: 20,
      positionM: world.dropoffZoneCenter,
      speedMps: 0,
    }),
    report = {
      unknown: unknown.reason!,
      foreign: foreign.reason!,
      notOnTrip: notOnTrip.reason!,
      cancelled: cancelled.reason!,
      failed: failed.reason!,
      notOnTripState: notOnTrip.ride!.state,
      cancelledState: cancelled.ride!.state,
      failedState: failed.ride!.state,
      completions:
        world.dropoff.completions().length +
        cancelledWorld.dropoff.completions().length +
        failedWorld.dropoff.completions().length +
        earlyDropoff.completions().length,
    };
  earlyDropoff.dispose();
  disposeRideLifecycleWorld(early);
  disposeDropoffWorld(failedWorld);
  disposeDropoffWorld(cancelledWorld);
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function staleProbe(): DropoffReport['stale'] {
  const world = createDropoffWorld(),
    startTick = world.startTick;
  world.dropoff.observe(dropoffObservation(world, { tick: startTick + 80 }));
  const staleBefore = world.dropoff.observe(dropoffObservation(world, { tick: startTick + 79 })),
    tickAfterStale = world.dropoff.currentTick();
  world.rideWorld.lifecycle.advance(startTick + 500);
  const staleAfterAdvance = world.dropoff.observe(
      dropoffObservation(world, { tick: startTick + 499 }),
    ),
    restart = world.dropoff.observe(dropoffObservation(world, { tick: startTick + 500 })),
    report = {
      staleBefore: staleBefore.reason === 'STALE_TICK',
      staleAfterAdvance: staleAfterAdvance.reason === 'STALE_TICK',
      tickAfterStale,
      restartDwell: restart.dwellTicks,
      state: rideState(world),
      staleCount: world.dropoff.stats().byReason.STALE_TICK,
    };
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function releaseProbe(): DropoffReport['release'] {
  const world = createDropoffWorld(),
    startTick = world.startTick,
    dispatcher = world.rideWorld.dispatcherWorld.dispatcher;
  holdStationary(world, startTick);
  dispatcher.release(world.assignment.taxiId, 'TAXI_BLOCKED', startTick + 180);
  const attemptedCompletionRejected = throws(
      () => completeAt(world, startTick),
      /Ride taxi claim is missing/,
    ),
    report = {
      attemptedCompletionRejected,
      stateAfterAttempt: rideState(world),
      completions: world.dropoff.completions().length,
      lifecycleReleases: world.rideWorld.lifecycle.stats().releases,
      dispatcherReleaseReason: dispatcher.releases()[0]?.reason ?? null,
      taxiStatus: dispatcher.taxiStatus(world.assignment.taxiId),
    };
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

function equivalenceProbe(): DropoffReport['equivalence'] {
  const manual = createDropoffWorld({ boardedVia: 'events' }),
    autonomous = createDropoffWorld({ boardedVia: 'pickup' }),
    startTick = 220,
    last = startTick + 180;
  let identical = true;
  for (let tick = startTick; tick <= last; tick += 1) {
    const left = manual.dropoff.observe(dropoffObservation(manual, { tick })),
      right = autonomous.dropoff.observe(dropoffObservation(autonomous, { tick }));
    if (
      left.status !== right.status ||
      left.reason !== right.reason ||
      left.dwellTicks !== right.dwellTicks
    )
      identical = false;
  }
  const report = {
    identical,
    manualState: rideState(manual),
    autonomousState: rideState(autonomous),
    manualDwellTicks: manual.dropoff.completions()[0]?.dwellTicks ?? null,
    autonomousDwellTicks: autonomous.dropoff.completions()[0]?.dwellTicks ?? null,
    completeTick: manual.dropoff.completions()[0]?.tick ?? 0,
  };
  disposeDropoffWorld(manual);
  disposeDropoffWorld(autonomous);
  return Object.freeze(report);
}

function simulate(): Simulation {
  const world = createDispatcherWorld(),
    lifecycle = createRideLifecycle({ dispatcher: world.dispatcher }),
    pickup = createRidePickup({ map: world.map, lifecycle }),
    dropoff = createRideDropoff({ map: world.map, lifecycle });
  const boarded = new Map<string, { tick: number; dwellTicks: number }>(),
    dropoffStarted = new Map<string, number>(),
    completed = new Map<string, { tick: number; dwellTicks: number }>();
  let assignments = 0,
    duplicateTaxis = false,
    pickupRejections = 0,
    pickupDuplicates = 0,
    dropoffRejections = 0,
    dropoffDuplicates = 0;
  for (let tick = 0; tick <= 2500; tick += 1) {
    world.demand.advance(tick);
    lifecycle.advance(tick);
    for (const assignment of world.dispatcher.step({ tick, maxAssignments: 4 }).assigned) {
      lifecycle.begin({
        requestId: assignment.requestId,
        eventId: `assigned:${assignment.requestId}`,
        tick,
      });
      assignments += 1;
    }
    for (const ride of lifecycle.active()) {
      if (ride.state === 'TO_PICKUP') {
        const decision = pickup.observe({
          rideId: ride.rideId,
          taxiId: ride.taxiId,
          tick,
          positionM: zoneCenter(world.map, ride.pickupZoneId),
          speedMps: 0,
        });
        if (decision.duplicate) pickupDuplicates += 1;
        if (decision.status === 'BOARDED')
          boarded.set(ride.rideId, { tick: decision.tick, dwellTicks: decision.dwellTicks });
        else if (decision.reason !== 'NOT_STATIONARY') pickupRejections += 1;
      } else if (ride.state === 'TO_DROPOFF') {
        if (!dropoffStarted.has(ride.rideId)) dropoffStarted.set(ride.rideId, tick);
        const decision = dropoff.observe({
          rideId: ride.rideId,
          taxiId: ride.taxiId,
          tick,
          positionM: zoneCenter(world.map, ride.dropoffZoneId),
          speedMps: 0,
        });
        if (decision.duplicate) dropoffDuplicates += 1;
        if (decision.status === 'COMPLETED')
          completed.set(ride.rideId, { tick: decision.tick, dwellTicks: decision.dwellTicks });
        else if (decision.reason !== 'NOT_STATIONARY') dropoffRejections += 1;
      }
      const taxis = lifecycle.active().map((entry) => entry.taxiId);
      if (new Set(taxis).size !== taxis.length) duplicateTaxis = true;
    }
  }
  const closed = lifecycle.terminal(),
    rides = Object.freeze(
      closed.map((ride) => {
        const boardedAt = boarded.get(ride.rideId) ?? { tick: 0, dwellTicks: 0 },
          startedAt = dropoffStarted.get(ride.rideId) ?? 0,
          completedAt = completed.get(ride.rideId) ?? { tick: 0, dwellTicks: 0 };
        return Object.freeze({
          requestId: ride.requestId,
          taxiId: ride.taxiId,
          pickupZoneId: ride.pickupZoneId,
          dropoffZoneId: ride.dropoffZoneId,
          boardTick: boardedAt.tick,
          dropoffStartTick: startedAt,
          completeTick: completedAt.tick,
          boardDwellTicks: boardedAt.dwellTicks,
          completeDwellTicks: completedAt.dwellTicks,
          state: ride.state,
          events: Object.freeze(ride.transitions.map((entry) => entry.event)),
          releaseReason: ride.release?.reason ?? null,
        });
      }),
    ),
    dwells = rides.map((ride) => ride.completeDwellTicks),
    transitions = rides.map((ride) => ride.events.length),
    report = {
      assignments,
      boarded: boarded.size,
      completed: closed.filter((ride) => ride.state === 'COMPLETED').length,
      failed: closed.filter((ride) => ride.state === 'FAILED').length,
      cancelled: closed.filter((ride) => ride.state === 'CANCELLED').length,
      active: lifecycle.active().length,
      releases: lifecycle.stats().releases,
      requests: world.demand.requests().length,
      duplicateTaxis,
      uniqueDropoffZones: new Set(rides.map((ride) => ride.dropoffZoneId)).size,
      uniqueCompleteEvents: new Set(rides.map((ride) => dropoffCompleteEventId(ride.requestId)))
        .size,
      minCompleteDwellTicks: dwells.length === 0 ? 0 : Math.min(...dwells),
      maxCompleteDwellTicks: dwells.length === 0 ? 0 : Math.max(...dwells),
      exactDwellRides: rides.filter(
        (ride) =>
          ride.completeDwellTicks === dropoff.requiredDwellTicks &&
          ride.completeTick - ride.dropoffStartTick === dropoff.requiredDwellTicks,
      ).length,
      pickupRejections,
      pickupDuplicates,
      dropoffRejections,
      dropoffDuplicates,
      minTransitions: transitions.length === 0 ? 0 : Math.min(...transitions),
      maxTransitions: transitions.length === 0 ? 0 : Math.max(...transitions),
      rides,
    };
  pickup.dispose();
  dropoff.dispose();
  lifecycle.dispose();
  world.dispatcher.dispose();
  world.demand.dispose();
  world.registry.dispose();
  world.planner.dispose();
  return report;
}

function disposalProbe(): DropoffReport['disposal'] {
  const world = createDropoffWorld();
  world.dropoff.observe(dropoffObservation(world));
  world.dropoff.dispose();
  world.dropoff.dispose();
  const stats = world.dropoff.stats(),
    report = {
      disposed: stats.disposed,
      attempts: stats.attempts,
      completions: world.dropoff.completions().length,
      observations: stats.observations,
      completed: stats.completed,
      tick: stats.tick,
      rideState: rideState(world),
      taxiStatus: world.rideWorld.dispatcherWorld.dispatcher.taxiStatus(world.assignment.taxiId),
      releases: world.rideWorld.dispatcherWorld.dispatcher.releases().length,
    };
  disposeDropoffWorld(world);
  return Object.freeze(report);
}

export function runDropoffReport(): DropoffReport {
  const exactDwell = exactDwellProbe(),
    fastPass = fastPassProbe(),
    zoneRejections = zoneRejectionsProbe(),
    incompatibleZone = incompatibleZoneProbe(),
    boundary = boundaryProbe(),
    idempotency = idempotencyProbe(),
    wrongRide = wrongRideProbe(),
    stale = staleProbe(),
    release = releaseProbe(),
    equivalence = equivalenceProbe(),
    simulation = simulate(),
    second = simulate(),
    deterministic =
      JSON.stringify(simulation.rides) === JSON.stringify(second.rides) &&
      simulation.completed === second.completed &&
      simulation.releases === second.releases;
  const fleetWorld = createDispatcherWorld(),
    fleet = {
      taxis: fleetWorld.registry.counts().taxis,
      civilians: fleetWorld.registry.counts().civilians,
      requests: fleetWorld.demand.requests().length,
    };
  fleetWorld.dispatcher.dispose();
  fleetWorld.demand.dispose();
  fleetWorld.registry.dispose();
  fleetWorld.planner.dispose();
  const validationWorld = createDropoffWorld(),
    validationMap = validationWorld.rideWorld.dispatcherWorld.map,
    validationLifecycle = validationWorld.rideWorld.lifecycle,
    disposal = disposalProbe(),
    source = readFileSync(join(process.cwd(), 'src', 'fleet', 'dropoff.ts'), 'utf8'),
    noWallClock =
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        source,
      ),
    noDom = !/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source),
    checks: DropoffReportCheck[] = [
      check('version', '063-dropoff-v1', DROPOFF_VERSION, 'One versioned dropoff identity.'),
      check(
        'rejection-reasons',
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
        [...DROPOFF_REJECTION_REASONS],
        'Every non-completed observation carries one closed reason.',
      ),
      check(
        'defaults',
        {
          tickRateHz: 60,
          speedThresholdMps: 0.3,
          dwellTicks: 180,
          displacementToleranceM: 0.05,
        },
        { ...DROPOFF_DEFAULTS },
        'Delivery uses the same provisional zone, speed and dwell rules as pickup 062.',
      ),
      check(
        'fleet-and-demand',
        { taxis: 24, civilians: 20, requests: 32 },
        fleet,
        'The report uses the real 057 fleet and the real 059 schedule.',
      ),
      check(
        'exact-dwell',
        {
          requiredDwellTicks: 180,
          startTick: 20,
          completeTick: 200,
          pendingBeforeComplete: 179,
          dwellAtComplete: 180,
          dwellSeconds: 3,
          stateAfterComplete: 'COMPLETED',
          events: [
            'ASSIGNED',
            'ARRIVED_PICKUP',
            'PICKUP_COMPLETE',
            'ARRIVED_DROPOFF',
            'DROPOFF_COMPLETE',
          ],
          transitionTicks: [10, 12, 13, 200, 200],
          replayDuplicate: true,
          transitionsAfterReplay: 5,
          releaseReason: 'COMPLETED',
          taxiStatus: 'AVAILABLE',
          metricsPreserved: true,
        },
        exactDwell,
        'Completion happens exactly at 180 simulated tick intervals inside the real destination zone.',
      ),
      check(
        'fast-pass',
        {
          samples: 13,
          insideSamples: 7,
          reasons: ['NOT_AT_DROPOFF', 'TOO_FAST'],
          maxDwell: 0,
          state: 'TO_DROPOFF',
          transitions: 3,
          completions: 0,
        },
        fastPass,
        'A fast pass through the destination never completes or starts a dwell proof.',
      ),
      check(
        'zone-rejections',
        {
          outside: { samples: 200, reason: 'NOT_AT_DROPOFF' },
          otherDropoffZone: { zoneId: 'sz:0-1', samples: 180, reason: 'WRONG_ZONE' },
          pickupZone: { zoneId: 'sz:0-0', samples: 100, reason: 'WRONG_ZONE' },
          state: 'TO_DROPOFF',
          transitions: 3,
          completions: 0,
        },
        zoneRejections,
        'A nearby authored zone or the pickup-only zone never yields a completion.',
      ),
      check(
        'incompatible-zone',
        { reason: 'WRONG_ZONE', inDropoffZone: false, state: 'TO_DROPOFF', completions: 0 },
        incompatibleZone,
        'A dropoff zone id that exists but cannot serve a taxi is refused before dwell.',
      ),
      check(
        'boundary',
        {
          exactBoundaryInZone: true,
          exactBoundaryReason: 'NOT_STATIONARY',
          outsideReason: 'NOT_AT_DROPOFF',
          reentryReason: 'NOT_STATIONARY',
          completeTick: 282,
          dwellTicks: 180,
          state: 'COMPLETED',
        },
        boundary,
        'The authored boundary is inclusive and leaving it resets the dwell proof.',
      ),
      check(
        'idempotency',
        {
          sameTickDuplicate: true,
          laterDuplicate: true,
          transitions: 5,
          completions: 1,
          completeEvents: 1,
          lifecycleDuplicates: 0,
          releases: 1,
        },
        idempotency,
        'One ride has exactly one completion transition and one stable completion event id.',
      ),
      check(
        'wrong-ride',
        {
          unknown: 'WRONG_RIDE',
          foreign: 'FOREIGN_VEHICLE',
          notOnTrip: 'RIDE_NOT_ON_TRIP',
          cancelled: 'WRONG_RIDE',
          failed: 'WRONG_RIDE',
          notOnTripState: 'TO_PICKUP',
          cancelledState: 'CANCELLED',
          failedState: 'FAILED',
          completions: 0,
        },
        wrongRide,
        'Unknown rides, foreign taxis, early rides and terminal rides never complete.',
      ),
      check(
        'stale-tick',
        {
          staleBefore: true,
          staleAfterAdvance: true,
          tickAfterStale: 100,
          restartDwell: 0,
          state: 'TO_DROPOFF',
          staleCount: 2,
        },
        stale,
        'Stale ticks are refused and never contribute dwell.',
      ),
      check(
        'release',
        {
          attemptedCompletionRejected: true,
          stateAfterAttempt: 'DROPOFF',
          completions: 0,
          lifecycleReleases: 0,
          dispatcherReleaseReason: 'TAXI_BLOCKED',
          taxiStatus: 'BLOCKED',
        },
        release,
        'Without the real 060 claim the 061 terminal edge is refused and no completion is recorded.',
      ),
      check(
        'equivalence',
        {
          identical: true,
          manualState: 'COMPLETED',
          autonomousState: 'COMPLETED',
          manualDwellTicks: 180,
          autonomousDwellTicks: 180,
          completeTick: 400,
        },
        equivalence,
        'A manually composed ride and a ride boarded through the real 062 module share one predicate.',
      ),
      check(
        'simulation',
        {
          assignments: 32,
          boarded: 32,
          completed: 32,
          failed: 0,
          cancelled: 0,
          active: 0,
          releases: 32,
          uniqueDropoffZones: simulation.uniqueDropoffZones,
          uniqueCompleteEvents: 32,
          minCompleteDwellTicks: 180,
          maxCompleteDwellTicks: 180,
          exactDwellRides: 32,
          pickupRejections: 0,
          pickupDuplicates: 0,
          dropoffRejections: 0,
          dropoffDuplicates: 0,
          duplicateTaxis: false,
        },
        {
          assignments: simulation.assignments,
          boarded: simulation.boarded,
          completed: simulation.completed,
          failed: simulation.failed,
          cancelled: simulation.cancelled,
          active: simulation.active,
          releases: simulation.releases,
          uniqueDropoffZones: simulation.uniqueDropoffZones,
          uniqueCompleteEvents: simulation.uniqueCompleteEvents,
          minCompleteDwellTicks: simulation.minCompleteDwellTicks,
          maxCompleteDwellTicks: simulation.maxCompleteDwellTicks,
          exactDwellRides: simulation.exactDwellRides,
          pickupRejections: simulation.pickupRejections,
          pickupDuplicates: simulation.pickupDuplicates,
          dropoffRejections: simulation.dropoffRejections,
          dropoffDuplicates: simulation.dropoffDuplicates,
          duplicateTaxis: simulation.duplicateTaxis,
        },
        'All 32 real requests are picked up and delivered in their real zones at the exact dwell and released once.',
      ),
      check(
        'simulation-bounds',
        {
          requests: 32,
          uniqueDropoffZones: true,
          transitions: true,
          completedNotMoreThanRides: true,
        },
        {
          requests: simulation.requests,
          uniqueDropoffZones:
            simulation.uniqueDropoffZones > 0 && simulation.uniqueDropoffZones <= 32,
          transitions: simulation.minTransitions === 5 && simulation.maxTransitions === 5,
          completedNotMoreThanRides: simulation.completed <= simulation.rides.length,
        },
        'The simulation stays inside the documented fleet, zone and transition bounds.',
      ),
      check(
        'disposal',
        {
          disposed: true,
          attempts: 0,
          completions: 0,
          observations: 0,
          completed: 0,
          tick: 0,
          rideState: 'TO_DROPOFF',
          taxiStatus: 'ASSIGNED',
          releases: 0,
        },
        disposal,
        'Disposal returns owned dropoff state to zero without releasing the taxi claim.',
      ),
      check(
        'limits',
        { attempts: 64, completions: 128, vertices: 256, minimumFleet: true },
        {
          attempts: DROPOFF_LIMITS.attempts,
          completions: DROPOFF_LIMITS.completions,
          vertices: DROPOFF_LIMITS.vertices,
          minimumFleet: DROPOFF_LIMITS.attempts >= 30,
        },
        'Dropoff state is bounded by the same active- and terminal-ride ceilings.',
      ),
      truthy('determinism', deterministic, 'Two identical simulations produce identical rides.'),
      truthy('no-wall-clock', noWallClock, 'The source has no Date, timer or ambient randomness.'),
      truthy('no-dom-or-renderer', noDom, 'The source has no DOM, Babylon or Rapier dependency.'),
      check(
        'validation-errors',
        { missingMap: true, unknownOption: true, badDwell: true, noLifecycle: true },
        {
          missingMap: throws(() => createRideDropoff({}), /map/),
          unknownOption: throws(
            () =>
              createRideDropoff({
                map: validationMap,
                lifecycle: validationLifecycle,
                extra: true,
              }),
            /Unknown ride dropoff option field/,
          ),
          badDwell: throws(
            () =>
              createRideDropoff({
                map: validationMap,
                lifecycle: validationLifecycle,
                dwellTicks: 0,
              }),
            /range/,
          ),
          noLifecycle: throws(
            () =>
              createRideDropoff({
                map: validationMap,
                lifecycle: {},
              }),
            /lifecycle/,
          ),
        },
        'Options are validated before any observed tick changes dropoff state.',
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  disposeDropoffWorld(validationWorld);
  return Object.freeze({
    version: DROPOFF_VERSION,
    generatedBy: 'npm run ride:dropoff',
    oracleRule:
      'A delivery completes only when the assigned taxi is inside the ride’s real authored destination-zone polygon, at or below the speed threshold, and has remained contiguous and stationary for the exact simulated dwell; completion writes DROPOFF_COMPLETE through 061 exactly once, keeps the trip metrics and releases the 060 claim with COMPLETED.',
    defaults: DROPOFF_DEFAULTS,
    limits: DROPOFF_LIMITS,
    fleet: Object.freeze(fleet),
    exactDwell: Object.freeze(exactDwell),
    fastPass: Object.freeze(fastPass),
    zoneRejections: Object.freeze(zoneRejections),
    incompatibleZone: Object.freeze(incompatibleZone),
    boundary: Object.freeze(boundary),
    idempotency: Object.freeze(idempotency),
    wrongRide: Object.freeze(wrongRide),
    stale: Object.freeze(stale),
    release: Object.freeze(release),
    equivalence: Object.freeze(equivalence),
    simulation: Object.freeze(simulation),
    disposal: Object.freeze(disposal),
    determinism: Object.freeze({ identical: deterministic, rides: simulation.rides.length }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
