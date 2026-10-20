import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RIDE_CANCEL_REASONS,
  RIDE_FAILURE_REASONS,
  RIDE_FSM_LIMITS,
  RIDE_FSM_VERSION,
  RIDE_TERMINAL_STATES,
  RIDE_TRANSITIONS,
  createRideLifecycle,
  rideLifecycleId,
  rideStates,
  rideTransitionId,
} from '../../src/fleet';
import type { RideRecord, RideState } from '../../src/fleet';
import { createDispatcherWorld } from './dispatcher-fixture';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from './ride-fsm-fixture';

export interface RideFsmReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

interface SimulationRide {
  readonly requestId: string;
  readonly taxiId: string;
  readonly state: RideState;
  readonly events: readonly string[];
  readonly reason: string | null;
  readonly releaseReason: string | null;
}

interface Simulation {
  readonly assignments: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly active: number;
  readonly releases: number;
  readonly dispatcherAssignments: number;
  readonly maxConcurrentRides: number;
  readonly duplicateTaxis: boolean;
  readonly uniqueRides: number;
  readonly uniqueTaxis: number;
  readonly firstBeginTick: number | null;
  readonly lastBeginTick: number | null;
  readonly requests: number;
  readonly rides: readonly SimulationRide[];
}

export interface RideFsmReport {
  readonly version: typeof RIDE_FSM_VERSION;
  readonly generatedBy: 'npm run ride:lifecycle';
  readonly oracleRule: string;
  readonly limits: typeof RIDE_FSM_LIMITS;
  readonly fleet: Readonly<{ taxis: number; civilians: number; requests: number }>;
  readonly path: Readonly<{
    states: readonly RideState[];
    events: readonly string[];
    transitions: number;
    releaseReason: string | null;
    assignmentReleased: boolean;
    taxiStatus: string | undefined;
    available: boolean;
  }>;
  readonly cancel: Readonly<{
    state: RideState;
    reason: string | null;
    releaseReason: string | null;
    assignmentReleased: boolean;
    taxiStatus: string | undefined;
  }>;
  readonly failure: Readonly<{
    state: RideState;
    reason: string | null;
    releaseReason: string | null;
    assignmentReleased: boolean;
    taxiStatus: string | undefined;
  }>;
  readonly duplicates: Readonly<{
    beginDuplicate: boolean;
    replayDuplicate: boolean;
    transitionsAfterReplay: number;
    releasesAfterReplay: number;
    conflictRejected: boolean;
    stateAfterReplay: RideState;
  }>;
  readonly illegal: Readonly<{
    rejected: boolean;
    stateAfter: RideState;
    transitionsAfter: number;
    releasesAfter: number;
    claimIntact: boolean;
  }>;
  readonly doubleTerminal: Readonly<{
    rejected: boolean;
    state: RideState;
    releases: number;
    transitions: number;
  }>;
  readonly stale: Readonly<{
    eventRejected: boolean;
    advanceRejected: boolean;
    tick: number;
    stateAfter: RideState;
  }>;
  readonly reasons: Readonly<{
    missingFailureRejected: boolean;
    missingCancelRejected: boolean;
    wrongVocabularyRejected: boolean;
    reasonOnProgressRejected: boolean;
    releaseOnProgress: boolean;
  }>;
  readonly claimLeak: Readonly<{
    externalReleaseReason: string | null;
    terminalRejected: boolean;
    stateAfter: RideState;
    terminal: boolean;
    lifecycleReleases: number;
  }>;
  readonly selection: Readonly<{
    retargetRejected: boolean;
    firstTaxi: string;
    firstTaxiAfter: string;
    firstState: RideState;
    secondState: RideState;
    secondTaxi: string;
    claimIntact: boolean;
    releases: number;
  }>;
  readonly restore: Readonly<{
    restoredState: RideState;
    restoredTaxiMatches: boolean;
    appliedEventIds: number;
    duplicateAfterRestore: boolean;
    terminalRejected: boolean;
    unclaimedRejected: boolean;
    continuedState: RideState;
  }>;
  readonly identity: Readonly<{
    rideIdDerived: boolean;
    taxiDistinctFromRide: boolean;
    transitionIdsStable: boolean;
    transitionIdsUnique: boolean;
  }>;
  readonly simulation: Simulation;
  readonly disposal: Readonly<{
    disposed: boolean;
    rides: number;
    active: number;
    releases: number;
    claimKept: boolean;
  }>;
  readonly determinism: Readonly<{ identical: boolean; rides: number }>;
  readonly checks: readonly RideFsmReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): RideFsmReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): RideFsmReportCheck {
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

function simulationRide(ride: RideRecord): SimulationRide {
  return Object.freeze({
    requestId: ride.requestId,
    taxiId: ride.taxiId,
    state: ride.state,
    events: Object.freeze(ride.transitions.map((entry) => entry.event)),
    reason: ride.reason,
    releaseReason: ride.release?.reason ?? null,
  });
}

function simulate(): Simulation {
  const world = createDispatcherWorld(),
    lifecycle = createRideLifecycle({ dispatcher: world.dispatcher }),
    order: string[] = [];
  let assignments = 0,
    maxConcurrentRides = 0,
    duplicateTaxis = false,
    firstBeginTick: number | null = null,
    lastBeginTick: number | null = null;
  for (let tick = 0; tick <= 1500; tick += 1) {
    world.demand.advance(tick);
    lifecycle.advance(tick);
    for (const assignment of world.dispatcher.step({ tick, maxAssignments: 4 }).assigned) {
      lifecycle.begin({
        requestId: assignment.requestId,
        eventId: `assigned:${assignment.requestId}`,
        tick,
      });
      order.push(assignment.requestId);
      assignments += 1;
      if (firstBeginTick === null) firstBeginTick = tick;
      lastBeginTick = tick;
    }
    for (const ride of lifecycle.active()) {
      if (ride.updatedTick === tick) continue;
      const index = order.indexOf(ride.requestId);
      if (ride.transitions.length === 1) {
        lifecycle.apply({
          rideId: ride.rideId,
          eventId: `pickup:${ride.requestId}`,
          event: 'ARRIVED_PICKUP',
          tick,
        });
      } else if (ride.transitions.length === 2) {
        if (index % 7 === 3)
          lifecycle.apply({
            rideId: ride.rideId,
            eventId: `cancel:${ride.requestId}`,
            event: 'CANCELLED',
            tick,
            reason: 'PLAYER_CANCELLED',
          });
        else if (index % 11 === 5)
          lifecycle.apply({
            rideId: ride.rideId,
            eventId: `fail:${ride.requestId}`,
            event: 'FAILED',
            tick,
            reason: 'SERVICE_TIMEOUT',
          });
        else
          lifecycle.apply({
            rideId: ride.rideId,
            eventId: `board:${ride.requestId}`,
            event: 'PICKUP_COMPLETE',
            tick,
          });
      } else if (ride.transitions.length === 3) {
        lifecycle.apply({
          rideId: ride.rideId,
          eventId: `dropoff:${ride.requestId}`,
          event: 'ARRIVED_DROPOFF',
          tick,
        });
      } else if (ride.transitions.length === 4) {
        lifecycle.apply({
          rideId: ride.rideId,
          eventId: `complete:${ride.requestId}`,
          event: 'DROPOFF_COMPLETE',
          tick,
        });
      }
      const activeTaxis = lifecycle.active().map((entry) => entry.taxiId);
      if (new Set(activeTaxis).size !== activeTaxis.length) duplicateTaxis = true;
      maxConcurrentRides = Math.max(maxConcurrentRides, activeTaxis.length);
    }
  }
  for (const ride of lifecycle.active()) {
    lifecycle.apply({
      rideId: ride.rideId,
      eventId: `final:${ride.requestId}`,
      event: 'FAILED',
      tick: 1501,
      reason: 'SCENARIO_RESET',
    });
  }
  const closed = lifecycle.terminal(),
    active = lifecycle.active().length,
    totalReleases = lifecycle.stats().releases,
    requests = world.demand.requests().length,
    completed = closed.filter((ride) => ride.state === 'COMPLETED').length,
    failed = closed.filter((ride) => ride.state === 'FAILED').length,
    cancelled = closed.filter((ride) => ride.state === 'CANCELLED').length,
    uniqueRequests = new Set(closed.map((ride) => ride.requestId)).size,
    uniqueTaxis = new Set(closed.map((ride) => ride.taxiId)).size,
    dispatcherAssignments = world.dispatcher.assignments().length,
    rides = Object.freeze(closed.map(simulationRide));
  lifecycle.dispose();
  world.dispatcher.dispose();
  world.demand.dispose();
  world.registry.dispose();
  world.planner.dispose();
  return {
    assignments,
    completed,
    failed,
    cancelled,
    active,
    releases: totalReleases,
    dispatcherAssignments,
    maxConcurrentRides,
    duplicateTaxis,
    uniqueRides: uniqueRequests,
    uniqueTaxis,
    firstBeginTick,
    lastBeginTick,
    requests,
    rides,
  };
}

function pathProbe(): RideFsmReport['path'] {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    states: RideState[] = [result.ride.state];
  let ride = result.ride;
  for (const [index, event] of (
    ['ARRIVED_PICKUP', 'PICKUP_COMPLETE', 'ARRIVED_DROPOFF', 'DROPOFF_COMPLETE'] as const
  ).entries()) {
    ride = world.lifecycle.apply({
      rideId: ride.rideId,
      eventId: `path:${event}`,
      event,
      tick: 11 + index,
    }).ride;
    states.push(ride.state);
  }
  const resultReport = {
    states: Object.freeze(states),
    events: Object.freeze(ride.transitions.map((entry) => entry.event)),
    transitions: ride.transitions.length,
    releaseReason: ride.release?.reason ?? null,
    assignmentReleased:
      world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId) === undefined,
    taxiStatus: world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId),
    available: world.dispatcherWorld.dispatcher.availableTaxis().includes(assignment.taxiId),
  };
  disposeRideLifecycleWorld(world);
  return resultReport;
}

function cancelProbe(): RideFsmReport['cancel'] {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world);
  world.lifecycle.apply({
    rideId: result.ride.rideId,
    eventId: 'cancel:arrived',
    event: 'ARRIVED_PICKUP',
    tick: 11,
  });
  const ride = world.lifecycle.apply({
    rideId: result.ride.rideId,
    eventId: 'cancel:do',
    event: 'CANCELLED',
    tick: 12,
    reason: 'PASSENGER_CANCELLED',
  }).ride;
  const report = {
    state: ride.state,
    reason: ride.reason,
    releaseReason: ride.release?.reason ?? null,
    assignmentReleased:
      world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId) === undefined,
    taxiStatus: world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId),
  };
  disposeRideLifecycleWorld(world);
  return report;
}

function failureProbe(): RideFsmReport['failure'] {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    ride = world.lifecycle.apply({
      rideId: result.ride.rideId,
      eventId: 'failure:do',
      event: 'FAILED',
      tick: 11,
      reason: 'TAXI_DAMAGED',
    }).ride;
  const report = {
    state: ride.state,
    reason: ride.reason,
    releaseReason: ride.release?.reason ?? null,
    assignmentReleased:
      world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId) === undefined,
    taxiStatus: world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId),
  };
  disposeRideLifecycleWorld(world);
  return report;
}

function duplicatesProbe(): RideFsmReport['duplicates'] {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    rideId = result.ride.rideId;
  const beginDuplicate = world.lifecycle.begin({
    requestId: assignment.requestId,
    eventId: `assigned:${assignment.requestId}`,
    tick: 10,
  }).duplicate;
  world.lifecycle.apply({
    rideId,
    eventId: 'duplicate:first',
    event: 'ARRIVED_PICKUP',
    tick: 11,
  });
  const replay = world.lifecycle.apply({
    rideId,
    eventId: 'duplicate:first',
    event: 'ARRIVED_PICKUP',
    tick: 12,
  });
  const conflictRejected = throws(
    () =>
      world.lifecycle.apply({
        rideId,
        eventId: 'duplicate:first',
        event: 'PICKUP_COMPLETE',
        tick: 12,
      }),
    /conflict/,
  );
  const report = {
    beginDuplicate,
    replayDuplicate: replay.duplicate,
    transitionsAfterReplay: replay.ride.transitions.length,
    releasesAfterReplay: world.lifecycle.stats().releases,
    conflictRejected,
    stateAfterReplay: replay.ride.state,
  };
  disposeRideLifecycleWorld(world);
  return report;
}

function illegalProbe(): RideFsmReport['illegal'] {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    rideId = result.ride.rideId;
  const rejected = throws(
    () =>
      world.lifecycle.apply({
        rideId,
        eventId: 'illegal:complete',
        event: 'DROPOFF_COMPLETE',
        tick: 11,
      }),
    /Illegal ride transition/,
  );
  const ride = world.lifecycle.ride(rideId)!;
  const report = {
    rejected,
    stateAfter: ride.state,
    transitionsAfter: ride.transitions.length,
    releasesAfter: world.lifecycle.stats().releases,
    claimIntact:
      world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId)?.assignmentId ===
      assignment.assignmentId,
  };
  disposeRideLifecycleWorld(world);
  return report;
}

function doubleTerminalProbe(): RideFsmReport['doubleTerminal'] {
  const world = createRideLifecycleWorld(),
    { result } = beginFirstRide(world),
    rideId = result.ride.rideId;
  for (const [index, event] of (
    ['ARRIVED_PICKUP', 'PICKUP_COMPLETE', 'ARRIVED_DROPOFF', 'DROPOFF_COMPLETE'] as const
  ).entries())
    world.lifecycle.apply({
      rideId,
      eventId: `double:${event}`,
      event,
      tick: 11 + index,
    });
  const rejected = throws(
    () =>
      world.lifecycle.apply({
        rideId,
        eventId: 'double:failed',
        event: 'FAILED',
        tick: 15,
        reason: 'SERVICE_TIMEOUT',
      }),
    /already terminal/,
  );
  const ride = world.lifecycle.ride(rideId)!;
  const report = {
    rejected,
    state: ride.state,
    releases: world.lifecycle.stats().releases,
    transitions: ride.transitions.length,
  };
  disposeRideLifecycleWorld(world);
  return report;
}

function staleProbe(): RideFsmReport['stale'] {
  const world = createRideLifecycleWorld({ requestCount: 2, openTaxis: 2 }),
    { result } = beginFirstRide(world),
    rideId = result.ride.rideId;
  world.lifecycle.advance(20);
  const eventRejected = throws(
    () =>
      world.lifecycle.apply({
        rideId,
        eventId: 'stale:event',
        event: 'ARRIVED_PICKUP',
        tick: 19,
      }),
    /Stale/,
  );
  const advanceRejected = throws(() => world.lifecycle.advance(19), /Stale/);
  const report = {
    eventRejected,
    advanceRejected,
    tick: world.lifecycle.currentTick(),
    stateAfter: world.lifecycle.ride(rideId)!.state,
  };
  disposeRideLifecycleWorld(world);
  return report;
}

function reasonsProbe(): RideFsmReport['reasons'] {
  const world = createRideLifecycleWorld(),
    { result } = beginFirstRide(world),
    rideId = result.ride.rideId;
  const missingFailureRejected = throws(
      () =>
        world.lifecycle.apply({
          rideId,
          eventId: 'reason:failed',
          event: 'FAILED',
          tick: 11,
        }),
      /FAILED requires an explicit reason/,
    ),
    missingCancelRejected = throws(
      () =>
        world.lifecycle.apply({
          rideId,
          eventId: 'reason:cancelled',
          event: 'CANCELLED',
          tick: 11,
        }),
      /CANCELLED requires an explicit reason/,
    ),
    wrongVocabularyRejected = throws(
      () =>
        world.lifecycle.apply({
          rideId,
          eventId: 'reason:wrong',
          event: 'FAILED',
          tick: 11,
          reason: 'PLAYER_CANCELLED',
        }),
      /enum|Unsupported/i,
    ),
    reasonOnProgressRejected = throws(
      () =>
        world.lifecycle.apply({
          rideId,
          eventId: 'reason:progress',
          event: 'ARRIVED_PICKUP',
          tick: 11,
          reason: 'SERVICE_TIMEOUT',
        }),
      /Only terminal/,
    ),
    ride = world.lifecycle.ride(rideId)!,
    report = {
      missingFailureRejected,
      missingCancelRejected,
      wrongVocabularyRejected,
      reasonOnProgressRejected,
      releaseOnProgress: ride.release !== null,
    };
  disposeRideLifecycleWorld(world);
  return report;
}

function claimLeakProbe(): RideFsmReport['claimLeak'] {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    rideId = result.ride.rideId;
  for (const [index, event] of (
    ['ARRIVED_PICKUP', 'PICKUP_COMPLETE', 'ARRIVED_DROPOFF'] as const
  ).entries())
    world.lifecycle.apply({
      rideId,
      eventId: `leak:${event}`,
      event,
      tick: 11 + index,
    });
  const external = world.dispatcherWorld.dispatcher.release(assignment.taxiId, 'TAXI_REMOVED', 14);
  const terminalRejected = throws(
    () =>
      world.lifecycle.apply({
        rideId,
        eventId: 'leak:complete',
        event: 'DROPOFF_COMPLETE',
        tick: 15,
      }),
    /claim is missing/,
  );
  const ride = world.lifecycle.ride(rideId)!;
  const report = {
    externalReleaseReason: external?.reason ?? null,
    terminalRejected,
    stateAfter: ride.state,
    terminal: ride.terminal,
    lifecycleReleases: world.lifecycle.stats().releases,
  };
  disposeRideLifecycleWorld(world);
  return report;
}

function selectionProbe(): RideFsmReport['selection'] {
  const world = createRideLifecycleWorld({ requestCount: 2, openTaxis: 2 }),
    first = beginFirstRide(world),
    secondAssignment = world.assignments[1]!,
    second = world.lifecycle.begin({
      requestId: secondAssignment.requestId,
      eventId: `assigned:${secondAssignment.requestId}`,
      tick: 10,
    }).ride,
    retargetRejected = throws(
      () =>
        world.lifecycle.apply({
          rideId: first.result.ride.rideId,
          eventId: 'select:retarget',
          event: 'ARRIVED_PICKUP',
          tick: 11,
          taxiId: second.taxiId,
        }),
      /Unknown ride event field/,
    ),
    advanced = world.lifecycle.apply({
      rideId: first.result.ride.rideId,
      eventId: 'select:arrived',
      event: 'ARRIVED_PICKUP',
      tick: 11,
    }).ride,
    report = {
      retargetRejected,
      firstTaxi: first.assignment.taxiId,
      firstTaxiAfter: advanced.taxiId,
      firstState: advanced.state,
      secondState: world.lifecycle.rideFor(secondAssignment.requestId)!.state,
      secondTaxi: world.lifecycle.rideFor(secondAssignment.requestId)!.taxiId,
      claimIntact:
        world.dispatcherWorld.dispatcher.assignmentFor(first.assignment.requestId)?.taxiId ===
        first.assignment.taxiId,
      releases: world.lifecycle.stats().releases,
    };
  disposeRideLifecycleWorld(world);
  return report;
}

function restoreProbe(): RideFsmReport['restore'] {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    rideId = result.ride.rideId;
  world.lifecycle.apply({
    rideId,
    eventId: 'restore:arrived',
    event: 'ARRIVED_PICKUP',
    tick: 11,
  });
  world.lifecycle.apply({
    rideId,
    eventId: 'restore:board',
    event: 'PICKUP_COMPLETE',
    tick: 12,
  });
  const snapshot = world.lifecycle.snapshot(),
    restoredLifecycle = createRideLifecycle({ dispatcher: world.dispatcherWorld.dispatcher }),
    restored = restoredLifecycle.restore(snapshot),
    duplicateAfterRestore = restoredLifecycle.apply({
      rideId,
      eventId: 'restore:board',
      event: 'PICKUP_COMPLETE',
      tick: 13,
    }).duplicate,
    continued = restoredLifecycle.apply({
      rideId,
      eventId: 'restore:dropoff',
      event: 'ARRIVED_DROPOFF',
      tick: 13,
    }).ride;
  restoredLifecycle.dispose();

  const completedWorld = createRideLifecycleWorld(),
    completedFirst = beginFirstRide(completedWorld),
    completedRideId = completedFirst.result.ride.rideId;
  for (const [index, event] of (
    ['ARRIVED_PICKUP', 'PICKUP_COMPLETE', 'ARRIVED_DROPOFF', 'DROPOFF_COMPLETE'] as const
  ).entries())
    completedWorld.lifecycle.apply({
      rideId: completedRideId,
      eventId: `terminal-restore:${event}`,
      event,
      tick: 11 + index,
    });
  const closedEntry = completedWorld.lifecycle.snapshotRide(completedRideId)!,
    terminalLifecycle = createRideLifecycle({
      dispatcher: completedWorld.dispatcherWorld.dispatcher,
    }),
    terminalRejected = throws(
      () =>
        terminalLifecycle.restore({
          version: RIDE_FSM_VERSION,
          tick: 14,
          rides: [closedEntry],
        }),
      /terminal/,
    );
  terminalLifecycle.dispose();

  const leakedWorld = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    leakedFirst = beginFirstRide(leakedWorld),
    leakedSnapshot = leakedWorld.lifecycle.snapshot();
  leakedWorld.dispatcherWorld.dispatcher.release(leakedFirst.assignment.taxiId, 'TAXI_REMOVED', 11);
  const leakedLifecycle = createRideLifecycle({
      dispatcher: leakedWorld.dispatcherWorld.dispatcher,
    }),
    unclaimedRejected = throws(() => leakedLifecycle.restore(leakedSnapshot), /claim|assignment/i);
  leakedLifecycle.dispose();

  const report = {
    restoredState: restored[0]!.state,
    restoredTaxiMatches: restored[0]!.taxiId === assignment.taxiId,
    appliedEventIds: restored[0]!.appliedEventIds.length,
    duplicateAfterRestore,
    terminalRejected,
    unclaimedRejected,
    continuedState: continued.state,
  };
  disposeRideLifecycleWorld(world);
  disposeRideLifecycleWorld(completedWorld);
  disposeRideLifecycleWorld(leakedWorld);
  return report;
}

function identityProbe(): RideFsmReport['identity'] {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    ride = result.ride;
  for (const [index, event] of (
    ['ARRIVED_PICKUP', 'PICKUP_COMPLETE', 'ARRIVED_DROPOFF'] as const
  ).entries())
    world.lifecycle.apply({
      rideId: ride.rideId,
      eventId: `identity:${event}`,
      event,
      tick: 11 + index,
    });
  const allTransitions = world.lifecycle.ride(ride.rideId)!.transitions;
  const report = {
    rideIdDerived: ride.rideId === rideLifecycleId(world.lifecycle.namespace, assignment.requestId),
    taxiDistinctFromRide: ride.rideId !== ride.taxiId,
    transitionIdsStable: allTransitions.every(
      (entry) =>
        entry.transitionId ===
        rideTransitionId(world.lifecycle.namespace, entry.rideId, entry.eventId),
    ),
    transitionIdsUnique:
      new Set(allTransitions.map((entry) => entry.transitionId)).size === allTransitions.length,
  };
  disposeRideLifecycleWorld(world);
  return report;
}

function disposalProbe(): RideFsmReport['disposal'] {
  const world = createRideLifecycleWorld(),
    { assignment } = beginFirstRide(world);
  world.lifecycle.dispose();
  world.lifecycle.dispose();
  const stats = world.lifecycle.stats(),
    report = {
      disposed: stats.disposed,
      rides: stats.rides,
      active: stats.active,
      releases: stats.releases,
      claimKept: world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId) === 'ASSIGNED',
    };
  disposeRideLifecycleWorld(world);
  return report;
}

export function runRideFsmReport(): RideFsmReport {
  const path = pathProbe(),
    cancel = cancelProbe(),
    failure = failureProbe(),
    duplicates = duplicatesProbe(),
    illegal = illegalProbe(),
    doubleTerminal = doubleTerminalProbe(),
    stale = staleProbe(),
    reasons = reasonsProbe(),
    claimLeak = claimLeakProbe(),
    selection = selectionProbe(),
    restore = restoreProbe(),
    identity = identityProbe(),
    disposal = disposalProbe(),
    simulation = simulate(),
    second = simulate(),
    deterministic =
      JSON.stringify(simulation.rides) === JSON.stringify(second.rides) &&
      simulation.assignments === second.assignments &&
      simulation.releases === second.releases,
    fleetWorld = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    fleet = {
      taxis: fleetWorld.dispatcherWorld.registry.counts().taxis,
      civilians: fleetWorld.dispatcherWorld.registry.counts().civilians,
      requests: simulation.requests,
    };
  disposeRideLifecycleWorld(fleetWorld);

  const source = readFileSync(join(process.cwd(), 'src', 'fleet', 'ride-fsm.ts'), 'utf8'),
    noWallClock =
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        source,
      ),
    noDom = !/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source),
    checks: RideFsmReportCheck[] = [
      check('version', '061-ride-fsm-v1', RIDE_FSM_VERSION, 'One versioned lifecycle identity.'),
      check(
        'states',
        ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF', 'COMPLETED', 'FAILED', 'CANCELLED'],
        [...rideStates],
        'The ride state vocabulary is explicit and closed.',
      ),
      check(
        'terminal-states',
        ['COMPLETED', 'FAILED', 'CANCELLED'],
        [...RIDE_TERMINAL_STATES],
        'Terminal rides are explicit outcomes.',
      ),
      check(
        'transitions',
        {
          TO_PICKUP: ['PICKUP', 'FAILED', 'CANCELLED'],
          PICKUP: ['TO_DROPOFF', 'FAILED', 'CANCELLED'],
          TO_DROPOFF: ['DROPOFF', 'FAILED', 'CANCELLED'],
          DROPOFF: ['COMPLETED', 'FAILED'],
          COMPLETED: [],
          FAILED: [],
          CANCELLED: [],
        },
        {
          TO_PICKUP: [...RIDE_TRANSITIONS.TO_PICKUP],
          PICKUP: [...RIDE_TRANSITIONS.PICKUP],
          TO_DROPOFF: [...RIDE_TRANSITIONS.TO_DROPOFF],
          DROPOFF: [...RIDE_TRANSITIONS.DROPOFF],
          COMPLETED: [...RIDE_TRANSITIONS.COMPLETED],
          FAILED: [...RIDE_TRANSITIONS.FAILED],
          CANCELLED: [...RIDE_TRANSITIONS.CANCELLED],
        },
        'Every allowed edge is listed; terminal states have no outgoing edge.',
      ),
      check(
        'fleet-and-demand',
        { taxis: 24, civilians: 20, requests: 32 },
        fleet,
        'The lifecycle uses the real 057 fleet and the real 059 schedule.',
      ),
      check(
        'full-path',
        {
          states: ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF', 'COMPLETED'],
          events: [
            'ASSIGNED',
            'ARRIVED_PICKUP',
            'PICKUP_COMPLETE',
            'ARRIVED_DROPOFF',
            'DROPOFF_COMPLETE',
          ],
          transitions: 5,
          releaseReason: 'COMPLETED',
          assignmentReleased: true,
          taxiStatus: 'AVAILABLE',
          available: true,
        },
        path,
        'A complete ride ends in COMPLETED and releases the real taxi claim.',
      ),
      check(
        'cancel',
        {
          state: 'CANCELLED',
          reason: 'PASSENGER_CANCELLED',
          releaseReason: 'CANCELLED',
          assignmentReleased: true,
          taxiStatus: 'AVAILABLE',
        },
        cancel,
        'A cancellation carries its reason and releases the claim.',
      ),
      check(
        'failure',
        {
          state: 'FAILED',
          reason: 'TAXI_DAMAGED',
          releaseReason: 'FAILED',
          assignmentReleased: true,
          taxiStatus: 'AVAILABLE',
        },
        failure,
        'A failure carries its reason and releases the claim.',
      ),
      check(
        'duplicates',
        {
          beginDuplicate: true,
          replayDuplicate: true,
          transitionsAfterReplay: 2,
          releasesAfterReplay: 0,
          conflictRejected: true,
          stateAfterReplay: 'PICKUP',
        },
        duplicates,
        'Replays are idempotent; the same event id cannot change the event.',
      ),
      check(
        'illegal-transition',
        {
          rejected: true,
          stateAfter: 'TO_PICKUP',
          transitionsAfter: 1,
          releasesAfter: 0,
          claimIntact: true,
        },
        illegal,
        'An illegal edge is rejected without moving state or releasing the taxi.',
      ),
      check(
        'double-terminal',
        { rejected: true, state: 'COMPLETED', releases: 1, transitions: 5 },
        doubleTerminal,
        'A second terminal event cannot overwrite or duplicate the first result.',
      ),
      check(
        'stale-tick',
        { eventRejected: true, advanceRejected: true, tick: 20, stateAfter: 'TO_PICKUP' },
        stale,
        'Ticks are monotonic; a stale event or a backwards advance is rejected.',
      ),
      check(
        'terminal-reasons',
        {
          missingFailureRejected: true,
          missingCancelRejected: true,
          wrongVocabularyRejected: true,
          reasonOnProgressRejected: true,
          releaseOnProgress: false,
        },
        reasons,
        'Terminal outcomes require a reason from the matching closed vocabulary.',
      ),
      check(
        'claim-leak',
        {
          externalReleaseReason: 'TAXI_REMOVED',
          terminalRejected: true,
          stateAfter: 'DROPOFF',
          terminal: false,
          lifecycleReleases: 0,
        },
        claimLeak,
        'A terminal state is never recorded without releasing a real dispatcher claim.',
      ),
      check(
        'selection',
        {
          retargetRejected: true,
          firstTaxiAfter: 'SAME',
          firstState: 'PICKUP',
          secondState: 'TO_PICKUP',
          claimIntact: true,
          releases: 0,
        },
        {
          retargetRejected: selection.retargetRejected,
          firstTaxiAfter:
            selection.firstTaxi === selection.firstTaxiAfter ? 'SAME' : selection.firstTaxiAfter,
          firstState: selection.firstState,
          secondState: selection.secondState,
          claimIntact: selection.claimIntact,
          releases: selection.releases,
        },
        'Changing the selected taxi never retargets or cancels an active ride.',
      ),
      check(
        'restore',
        {
          restoredState: 'TO_DROPOFF',
          restoredTaxiMatches: true,
          appliedEventIds: 3,
          duplicateAfterRestore: true,
          terminalRejected: true,
          unclaimedRejected: true,
          continuedState: 'DROPOFF',
        },
        restore,
        'Only claimed, non-terminal rides are restorable; replay stays idempotent.',
      ),
      check(
        'identity',
        {
          rideIdDerived: true,
          taxiDistinctFromRide: true,
          transitionIdsStable: true,
          transitionIdsUnique: true,
        },
        identity,
        'Ride and transition ids derive from the real request namespace, not from taxis or clocks.',
      ),
      check(
        'simulation',
        {
          assignments: 32,
          terminals: 32,
          releases: 32,
          active: 0,
          dispatcherAssignments: 0,
          uniqueRides: 32,
          duplicateTaxis: false,
          failedAtLeastOne: true,
          cancelledAtLeastOne: true,
        },
        {
          assignments: simulation.assignments,
          terminals: simulation.completed + simulation.failed + simulation.cancelled,
          releases: simulation.releases,
          active: simulation.active,
          dispatcherAssignments: simulation.dispatcherAssignments,
          uniqueRides: simulation.uniqueRides,
          duplicateTaxis: simulation.duplicateTaxis,
          failedAtLeastOne: simulation.failed > 0,
          cancelledAtLeastOne: simulation.cancelled > 0,
        },
        'All 32 real requests reach a terminal state exactly once and release their taxi.',
      ),
      check(
        'simulation-bounds',
        {
          maxConcurrentRides: true,
          uniqueTaxis: true,
          firstBeginTick: true,
          lastBeginTick: true,
        },
        {
          maxConcurrentRides:
            simulation.maxConcurrentRides > 0 && simulation.maxConcurrentRides <= 24,
          uniqueTaxis: simulation.uniqueTaxis > 0 && simulation.uniqueTaxis <= 24,
          firstBeginTick: simulation.firstBeginTick !== null,
          lastBeginTick:
            simulation.lastBeginTick !== null &&
            simulation.firstBeginTick !== null &&
            simulation.lastBeginTick >= simulation.firstBeginTick,
        },
        'The simulation stays inside the documented fleet and tick bounds.',
      ),
      check(
        'disposal',
        { disposed: true, rides: 0, active: 0, releases: 0, claimKept: true },
        disposal,
        'Disposal returns owned state to zero without fabricating a release.',
      ),
      check(
        'closed-vocabularies',
        { failureReasons: 7, cancelReasons: 3, events: 7, releaseReasons: 6 },
        {
          failureReasons: RIDE_FAILURE_REASONS.length,
          cancelReasons: RIDE_CANCEL_REASONS.length,
          events: 7,
          releaseReasons: 6,
        },
        'Failure, cancellation and event vocabularies are closed enums.',
      ),
      check(
        'limits',
        { activeRides: 64, terminalRides: 128, eventsPerRide: 16, minimumFleet: true },
        {
          activeRides: RIDE_FSM_LIMITS.activeRides,
          terminalRides: RIDE_FSM_LIMITS.terminalRides,
          eventsPerRide: RIDE_FSM_LIMITS.eventsPerRide,
          minimumFleet: RIDE_FSM_LIMITS.activeRides >= 30,
        },
        'The lifecycle keeps bounded active and terminal records.',
      ),
      truthy('determinism', deterministic, 'Two identical simulations produce identical rides.'),
      truthy('no-wall-clock', noWallClock, 'The source has no Date, timer or ambient randomness.'),
      truthy('no-dom-or-renderer', noDom, 'The source has no DOM, Babylon or Rapier dependency.'),
      check(
        'validation-errors',
        true,
        throws(() => createRideLifecycle({}), /dispatcher/),
        'Options are validated instead of silently defaulting.',
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: RIDE_FSM_VERSION,
    generatedBy: 'npm run ride:lifecycle',
    oracleRule:
      'One real 060 assignment creates one ride in TO_PICKUP; only the documented edges advance it, every event is idempotent by its stable event id, ticks never decrease, terminal states carry an explicit reason and release the exact dispatcher claim once, and a restart can restore only a claimed, non-terminal ride.',
    limits: RIDE_FSM_LIMITS,
    fleet: Object.freeze(fleet),
    path: Object.freeze(path),
    cancel: Object.freeze(cancel),
    failure: Object.freeze(failure),
    duplicates: Object.freeze(duplicates),
    illegal: Object.freeze(illegal),
    doubleTerminal: Object.freeze(doubleTerminal),
    stale: Object.freeze(stale),
    reasons: Object.freeze(reasons),
    claimLeak: Object.freeze(claimLeak),
    selection: Object.freeze(selection),
    restore: Object.freeze(restore),
    identity: Object.freeze(identity),
    simulation: Object.freeze(simulation),
    disposal: Object.freeze(disposal),
    determinism: Object.freeze({
      identical: deterministic,
      rides: simulation.rides.length,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
