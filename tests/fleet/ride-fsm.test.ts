import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
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
import type { RideLifecycle, RideRecord, RideState } from '../../src/fleet';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from './ride-fsm-fixture';
import { runRideFsmReport } from './ride-fsm-report';

const SOURCE = join(process.cwd(), 'src', 'fleet', 'ride-fsm.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '061-ride-fsm', 'report.json');

const RIDE_PATH = [
  'ARRIVED_PICKUP',
  'PICKUP_COMPLETE',
  'ARRIVED_DROPOFF',
  'DROPOFF_COMPLETE',
] as const;

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function driveToDropoff(lifecycle: RideLifecycle, rideId: string, fromTick: number): RideRecord {
  let atTick = fromTick,
    ride = lifecycle.ride(rideId)!;
  for (const event of RIDE_PATH.slice(0, 3)) {
    atTick += 1;
    ride = lifecycle.apply({ rideId, eventId: `path:${event}`, event, tick: atTick }).ride;
  }
  return ride;
}

test('061 completes a full ride and releases the real 060 claim exactly once', () => {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    { lifecycle } = world,
    begin = result.ride;
  assert.equal(result.duplicate, false);
  assert.equal(begin.state, 'TO_PICKUP');
  assert.equal(begin.taxiId, assignment.taxiId);
  assert.equal(begin.assignmentId, assignment.assignmentId);
  assert.equal(begin.rideId, rideLifecycleId(lifecycle.namespace, assignment.requestId));
  assert.equal(begin.pickupZoneId, assignment.pickupZoneId);
  assert.deepEqual(begin.tripRouteLaneIds, assignment.tripRouteLaneIds);
  assert.equal(
    begin.transitions[0]!.transitionId,
    rideTransitionId(lifecycle.namespace, begin.rideId, `assigned:${assignment.requestId}`),
  );
  assert.equal(world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId), 'ASSIGNED');
  assert.ok(!world.dispatcherWorld.dispatcher.availableTaxis().includes(assignment.taxiId));

  const states: RideState[] = [begin.state];
  let ride = begin;
  for (const [index, event] of RIDE_PATH.entries()) {
    const applied = lifecycle.apply({
      rideId: begin.rideId,
      eventId: `full:${event}`,
      event,
      tick: 11 + index,
    });
    assert.equal(applied.duplicate, false);
    ride = applied.ride;
    states.push(ride.state);
  }
  assert.deepEqual(states, ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF', 'COMPLETED']);
  assert.equal(ride.terminal, true);
  assert.equal(ride.reason, null);
  assert.equal(ride.release?.reason, 'COMPLETED');
  assert.equal(ride.release?.tick, 14);
  assert.equal(ride.release?.assignmentId, assignment.assignmentId);
  assert.equal(ride.transitions.length, 5);
  assert.deepEqual(
    ride.transitions.map((entry) => entry.to),
    ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF', 'COMPLETED'],
  );
  assert.equal(world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId), undefined);
  assert.equal(world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId), 'AVAILABLE');
  assert.ok(world.dispatcherWorld.dispatcher.availableTaxis().includes(assignment.taxiId));
  const releases = world.dispatcherWorld.dispatcher.releases();
  assert.equal(releases.length, 1);
  assert.equal(releases[0]!.reason, 'COMPLETED');
  assert.equal(releases[0]!.assignment.assignmentId, assignment.assignmentId);
  assert.equal(releases[0]!.tick, 14);
  assert.equal(lifecycle.stats().completed, 1);
  assert.equal(lifecycle.stats().releases, 1);
  assert.equal(lifecycle.stats().active, 0);
  assert.equal(lifecycle.active().length, 0);
  assert.equal(lifecycle.terminal().length, 1);
  assert.equal(lifecycle.rideFor(assignment.requestId)?.state, 'COMPLETED');

  const replay = lifecycle.apply({
    rideId: begin.rideId,
    eventId: 'full:DROPOFF_COMPLETE',
    event: 'DROPOFF_COMPLETE',
    tick: 14,
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.transition, ride.transitions[4]);
  assert.equal(lifecycle.stats().releases, 1);
  disposeRideLifecycleWorld(world);
});

test('061 rejects every illegal transition without moving state or releasing the claim', () => {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    { lifecycle } = world,
    rideId = result.ride.rideId;
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'illegal:dropoff-complete',
          event: 'DROPOFF_COMPLETE',
          tick: 11,
        }),
      /Illegal ride transition/,
    ),
  );
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'illegal:pickup-complete',
          event: 'PICKUP_COMPLETE',
          tick: 11,
        }),
      /Illegal ride transition/,
    ),
  );
  assert.ok(
    throws(
      () => lifecycle.apply({ rideId, eventId: 'illegal:assigned', event: 'ASSIGNED', tick: 11 }),
      /ASSIGNED is only valid/,
    ),
  );
  assert.equal(lifecycle.ride(rideId)?.state, 'TO_PICKUP');
  assert.equal(lifecycle.ride(rideId)?.transitions.length, 1);
  assert.equal(lifecycle.stats().releases, 0);
  assert.equal(world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId), 'ASSIGNED');

  lifecycle.apply({ rideId, eventId: 'path:ARRIVED_PICKUP', event: 'ARRIVED_PICKUP', tick: 11 });
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'illegal:pickup-again',
          event: 'ARRIVED_PICKUP',
          tick: 12,
        }),
      /Illegal ride transition/,
    ),
  );
  lifecycle.apply({
    rideId,
    eventId: 'path:PICKUP_COMPLETE',
    event: 'PICKUP_COMPLETE',
    tick: 12,
  });
  lifecycle.apply({
    rideId,
    eventId: 'path:ARRIVED_DROPOFF',
    event: 'ARRIVED_DROPOFF',
    tick: 13,
  });
  // Once the taxi arrived at the dropoff the only outcomes are COMPLETED or FAILED.
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'illegal:cancel-at-dropoff',
          event: 'CANCELLED',
          tick: 14,
          reason: 'PLAYER_CANCELLED',
        }),
      /Illegal ride transition/,
    ),
  );
  assert.equal(lifecycle.ride(rideId)?.state, 'DROPOFF');
  assert.equal(lifecycle.stats().releases, 0);
  disposeRideLifecycleWorld(world);
});

test('061 rejects a second terminal transition and keeps the first result', () => {
  const world = createRideLifecycleWorld(),
    { result } = beginFirstRide(world),
    { lifecycle } = world,
    rideId = result.ride.rideId;
  driveToDropoff(lifecycle, rideId, 10);
  const completed = lifecycle.apply({
    rideId,
    eventId: 'terminal:complete',
    event: 'DROPOFF_COMPLETE',
    tick: 14,
  }).ride;
  assert.equal(completed.state, 'COMPLETED');
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'terminal:failed',
          event: 'FAILED',
          tick: 15,
          reason: 'SERVICE_TIMEOUT',
        }),
      /already terminal/,
    ),
  );
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'terminal:cancelled',
          event: 'CANCELLED',
          tick: 15,
          reason: 'PLAYER_CANCELLED',
        }),
      /already terminal/,
    ),
  );
  const stored = lifecycle.ride(rideId)!;
  assert.equal(stored.state, 'COMPLETED');
  assert.equal(stored.reason, null);
  assert.equal(stored.transitions.length, 5);
  assert.equal(lifecycle.stats().completed, 1);
  assert.equal(lifecycle.stats().failed, 0);
  assert.equal(lifecycle.stats().cancelled, 0);
  assert.equal(lifecycle.stats().releases, 1);
  assert.equal(world.dispatcherWorld.dispatcher.releases().length, 1);
  disposeRideLifecycleWorld(world);
});

test('061 refuses a terminal state when the dispatcher claim is already gone', () => {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    { lifecycle } = world,
    rideId = result.ride.rideId;
  driveToDropoff(lifecycle, rideId, 10);
  // The caller released the taxi behind the lifecycle's back; a terminal state must not be faked.
  const external = world.dispatcherWorld.dispatcher.release(assignment.taxiId, 'COMPLETED', 14);
  assert.equal(external?.reason, 'COMPLETED');
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'leak:complete',
          event: 'DROPOFF_COMPLETE',
          tick: 15,
        }),
      /claim is missing/,
    ),
  );
  const ride = lifecycle.ride(rideId)!;
  assert.equal(ride.state, 'DROPOFF');
  assert.equal(ride.terminal, false);
  assert.equal(ride.release, null);
  assert.equal(lifecycle.stats().releases, 0);
  assert.equal(lifecycle.stats().completed, 0);
  assert.equal(world.dispatcherWorld.dispatcher.releases().length, 1);
  disposeRideLifecycleWorld(world);
});

test('061 requires an explicit terminal reason and reuses the 060 release for it', () => {
  const reasonProbe = (event: 'FAILED' | 'CANCELLED') => {
    const world = createRideLifecycleWorld(),
      { result } = beginFirstRide(world),
      { lifecycle } = world;
    return {
      world,
      lifecycle,
      apply: (value: Record<string, unknown>) =>
        lifecycle.apply({
          rideId: result.ride.rideId,
          eventId: `reason:${event}`,
          tick: 11,
          ...value,
        }),
    };
  };
  const missingFailure = reasonProbe('FAILED');
  assert.ok(
    throws(() => missingFailure.apply({ event: 'FAILED' }), /FAILED requires an explicit reason/),
  );
  assert.equal(missingFailure.lifecycle.stats().releases, 0);
  disposeRideLifecycleWorld(missingFailure.world);

  const wrongFailure = reasonProbe('FAILED');
  assert.ok(
    throws(
      () => wrongFailure.apply({ event: 'FAILED', reason: 'PLAYER_CANCELLED' }),
      /enum|Unsupported/i,
    ),
  );
  disposeRideLifecycleWorld(wrongFailure.world);

  const missingCancel = reasonProbe('CANCELLED');
  assert.ok(
    throws(
      () => missingCancel.apply({ event: 'CANCELLED' }),
      /CANCELLED requires an explicit reason/,
    ),
  );
  disposeRideLifecycleWorld(missingCancel.world);

  const wrongCancel = reasonProbe('CANCELLED');
  assert.ok(
    throws(
      () => wrongCancel.apply({ event: 'CANCELLED', reason: 'TAXI_DAMAGED' }),
      /enum|Unsupported/i,
    ),
  );
  disposeRideLifecycleWorld(wrongCancel.world);

  const extraReason = reasonProbe('FAILED');
  assert.ok(
    throws(
      () => extraReason.apply({ event: 'ARRIVED_PICKUP', reason: 'SERVICE_TIMEOUT' }),
      /Only terminal/,
    ),
  );
  disposeRideLifecycleWorld(extraReason.world);

  for (const reason of RIDE_FAILURE_REASONS) {
    const world = createRideLifecycleWorld(),
      { assignment, result } = beginFirstRide(world),
      applied = world.lifecycle.apply({
        rideId: result.ride.rideId,
        eventId: `failure:${reason}`,
        event: 'FAILED',
        tick: 11,
        reason,
      });
    assert.equal(applied.ride.state, 'FAILED');
    assert.equal(applied.ride.reason, reason);
    assert.equal(applied.ride.release?.reason, 'FAILED');
    assert.equal(world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId), undefined);
    assert.equal(world.lifecycle.stats().failed, 1);
    assert.equal(world.lifecycle.stats().releases, 1);
    assert.equal(world.dispatcherWorld.dispatcher.releases()[0]!.reason, 'FAILED');
    disposeRideLifecycleWorld(world);
  }
  for (const reason of RIDE_CANCEL_REASONS) {
    const world = createRideLifecycleWorld(),
      { assignment, result } = beginFirstRide(world),
      applied = world.lifecycle.apply({
        rideId: result.ride.rideId,
        eventId: `cancel:${reason}`,
        event: 'CANCELLED',
        tick: 11,
        reason,
      });
    assert.equal(applied.ride.state, 'CANCELLED');
    assert.equal(applied.ride.reason, reason);
    assert.equal(applied.ride.release?.reason, 'CANCELLED');
    assert.equal(world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId), undefined);
    assert.equal(world.lifecycle.stats().cancelled, 1);
    disposeRideLifecycleWorld(world);
  }
});

test('061 makes events idempotent by event id and rejects conflicting replays', () => {
  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world),
    { lifecycle } = world,
    rideId = result.ride.rideId;
  const replayedBegin = lifecycle.begin({
    requestId: assignment.requestId,
    eventId: `assigned:${assignment.requestId}`,
    tick: 10,
  });
  assert.equal(replayedBegin.duplicate, true);
  assert.equal(replayedBegin.transition, result.transition);
  assert.equal(lifecycle.stats().duplicates, 1);
  assert.ok(
    throws(
      () =>
        lifecycle.begin({
          requestId: assignment.requestId,
          eventId: 'assigned:other',
          tick: 10,
        }),
      /already exists/,
    ),
  );

  const first = lifecycle.apply({
    rideId,
    eventId: 'idempotent:arrived',
    event: 'ARRIVED_PICKUP',
    tick: 11,
  });
  assert.equal(first.ride.state, 'PICKUP');
  const replay = lifecycle.apply({
    rideId,
    eventId: 'idempotent:arrived',
    event: 'ARRIVED_PICKUP',
    tick: 999,
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.transition, first.transition);
  assert.equal(replay.ride.state, 'PICKUP');
  assert.equal(replay.ride.updatedTick, 11);
  assert.equal(replay.ride.transitions.length, 2);
  assert.equal(lifecycle.stats().duplicates, 2);
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'idempotent:arrived',
          event: 'PICKUP_COMPLETE',
          tick: 12,
        }),
      /conflict/,
    ),
  );
  assert.equal(lifecycle.ride(rideId)?.state, 'PICKUP');
  assert.equal(lifecycle.stats().releases, 0);
  disposeRideLifecycleWorld(world);
});

test('061 rejects stale ticks and stale lifecycle advances', () => {
  const world = createRideLifecycleWorld({ requestCount: 2, openTaxis: 2 }),
    { result } = beginFirstRide(world),
    { lifecycle } = world,
    rideId = result.ride.rideId;
  assert.equal(lifecycle.advance(20), 20);
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'stale:arrived',
          event: 'ARRIVED_PICKUP',
          tick: 19,
        }),
      /Stale/,
    ),
  );
  assert.equal(lifecycle.ride(rideId)?.state, 'TO_PICKUP');
  assert.ok(throws(() => lifecycle.advance(19), /Stale/));
  assert.equal(lifecycle.advance(20), 20);
  const second = world.assignments[1]!;
  assert.ok(
    throws(
      () =>
        lifecycle.begin({
          requestId: second.requestId,
          eventId: 'stale:begin',
          tick: 9,
        }),
      /Stale/,
    ),
  );
  assert.equal(lifecycle.active().length, 1);
  lifecycle.apply({
    rideId,
    eventId: 'fresh:arrived',
    event: 'ARRIVED_PICKUP',
    tick: 21,
  });
  assert.ok(
    throws(
      () =>
        lifecycle.apply({
          rideId,
          eventId: 'stale:board',
          event: 'PICKUP_COMPLETE',
          tick: 20,
        }),
      /Stale/,
    ),
  );
  assert.equal(lifecycle.ride(rideId)?.state, 'PICKUP');
  disposeRideLifecycleWorld(world);
});

test('061 keeps the ride on its assigned taxi when the selected taxi changes', () => {
  const world = createRideLifecycleWorld({ requestCount: 2, openTaxis: 2 }),
    first = beginFirstRide(world),
    secondAssignment = world.assignments[1]!,
    second = world.lifecycle.begin({
      requestId: secondAssignment.requestId,
      eventId: `assigned:${secondAssignment.requestId}`,
      tick: 10,
    }).ride;
  assert.notEqual(first.assignment.taxiId, second.taxiId);

  // A retarget attempt is rejected instead of silently moving the ride to the selected taxi.
  assert.ok(
    throws(
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
  );
  // Selection is not part of the ride contract; the immutable assignment survives.
  const selected = second.taxiId,
    advanced = world.lifecycle.apply({
      rideId: first.result.ride.rideId,
      eventId: 'select:arrived',
      event: 'ARRIVED_PICKUP',
      tick: 11,
    }).ride;
  assert.equal(selected, second.taxiId);
  assert.equal(advanced.taxiId, first.assignment.taxiId);
  assert.equal(advanced.assignmentId, first.assignment.assignmentId);
  assert.equal(advanced.state, 'PICKUP');
  assert.equal(
    world.dispatcherWorld.dispatcher.assignmentFor(first.assignment.requestId)?.taxiId,
    first.assignment.taxiId,
  );
  assert.equal(world.lifecycle.rideFor(secondAssignment.requestId)?.state, 'TO_PICKUP');
  assert.equal(
    world.lifecycle.rideFor(secondAssignment.requestId)?.taxiId,
    secondAssignment.taxiId,
  );
  assert.equal(world.lifecycle.stats().releases, 0);
  assert.equal(world.dispatcherWorld.dispatcher.releases().length, 0);
  disposeRideLifecycleWorld(world);
});

test('061 restores an active ride without id forks and refuses terminal or unclaimed rides', () => {
  const world = createRideLifecycleWorld({ requestCount: 2, openTaxis: 2 }),
    { assignment, result } = beginFirstRide(world),
    { lifecycle } = world,
    rideId = result.ride.rideId;
  lifecycle.apply({ rideId, eventId: 'restore:arrived', event: 'ARRIVED_PICKUP', tick: 11 });
  lifecycle.apply({ rideId, eventId: 'restore:board', event: 'PICKUP_COMPLETE', tick: 12 });
  const snapshot = lifecycle.snapshot();
  assert.equal(snapshot.version, RIDE_FSM_VERSION);
  assert.equal(snapshot.tick, 12);
  assert.equal(snapshot.rides.length, 1);
  assert.equal(snapshot.rides[0]!.state, 'TO_DROPOFF');

  const restoredLifecycle = createRideLifecycle({
    dispatcher: world.dispatcherWorld.dispatcher,
  });
  const restored = restoredLifecycle.restore(snapshot);
  assert.equal(restored.length, 1);
  assert.equal(restored[0]!.rideId, rideId);
  assert.equal(restored[0]!.state, 'TO_DROPOFF');
  assert.equal(restored[0]!.taxiId, assignment.taxiId);
  assert.equal(restored[0]!.assignmentId, assignment.assignmentId);
  assert.equal(restored[0]!.startedTick, 10);
  assert.equal(restored[0]!.updatedTick, 12);
  assert.deepEqual(restored[0]!.appliedEventIds, [
    `assigned:${assignment.requestId}`,
    'restore:arrived',
    'restore:board',
  ]);
  assert.equal(restoredLifecycle.stats().restored, 1);
  const replay = restoredLifecycle.apply({
    rideId,
    eventId: 'restore:board',
    event: 'PICKUP_COMPLETE',
    tick: 13,
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.ride.state, 'TO_DROPOFF');
  const continued = restoredLifecycle.apply({
    rideId,
    eventId: 'restore:dropoff',
    event: 'ARRIVED_DROPOFF',
    tick: 13,
  });
  assert.equal(continued.ride.state, 'DROPOFF');
  assert.ok(throws(() => restoredLifecycle.restore(snapshot), /empty/));

  const completed = lifecycle.apply({
    rideId,
    eventId: 'restore:complete',
    event: 'ARRIVED_DROPOFF',
    tick: 13,
  });
  const completedRide = lifecycle.apply({
    rideId,
    eventId: 'restore:dropoff',
    event: 'DROPOFF_COMPLETE',
    tick: 14,
  }).ride;
  assert.equal(completed.ride.state, 'DROPOFF');
  assert.equal(completedRide.state, 'COMPLETED');
  const closedEntry = lifecycle.snapshotRide(rideId)!;
  assert.equal(closedEntry.state, 'COMPLETED');
  const terminalLifecycle = createRideLifecycle({
    dispatcher: world.dispatcherWorld.dispatcher,
  });
  assert.ok(
    throws(
      () =>
        terminalLifecycle.restore({
          version: RIDE_FSM_VERSION,
          tick: 14,
          rides: [closedEntry],
        }),
      /terminal/,
    ),
  );
  // Restoring the terminal entry as an older active state fails the transition check too.
  assert.ok(
    throws(
      () =>
        terminalLifecycle.restore({
          version: RIDE_FSM_VERSION,
          tick: 14,
          rides: [
            {
              ...closedEntry,
              state: 'DROPOFF',
              updatedTick: 13,
            },
          ],
        }),
      /terminal|not match|discontinuous|already released/i,
    ),
  );
  const activeEntry = snapshot.rides[0]!;
  assert.ok(
    throws(
      () =>
        terminalLifecycle.restore({
          version: RIDE_FSM_VERSION,
          tick: 12,
          rides: [
            {
              ...activeEntry,
              transitions: [{ ...activeEntry.transitions[0]!, transitionId: 'id-v1:forged' }],
              appliedEventIds: [activeEntry.transitions[0]!.eventId],
              state: 'TO_PICKUP',
              updatedTick: 10,
            },
          ],
        }),
      /stable 006/,
    ),
  );
  disposeRideLifecycleWorld(world);
  restoredLifecycle.dispose();
  terminalLifecycle.dispose();

  // An active snapshot whose claim no longer exists is rejected instead of restored silently.
  const leaked = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    leakedFirst = beginFirstRide(leaked),
    leakedSnapshot = leaked.lifecycle.snapshot();
  leaked.dispatcherWorld.dispatcher.release(leakedFirst.assignment.taxiId, 'TAXI_REMOVED', 11);
  const leakedLifecycle = createRideLifecycle({
    dispatcher: leaked.dispatcherWorld.dispatcher,
  });
  assert.ok(throws(() => leakedLifecycle.restore(leakedSnapshot), /claim|assignment/i));
  assert.equal(leakedLifecycle.stats().active, 0);
  leakedLifecycle.dispose();
  disposeRideLifecycleWorld(leaked);
});

test('061 restores atomically and never keeps a partially restored lifecycle', () => {
  const world = createRideLifecycleWorld({ requestCount: 2, openTaxis: 2 }),
    first = beginFirstRide(world),
    secondAssignment = world.assignments[1]!,
    second = world.lifecycle.begin({
      requestId: secondAssignment.requestId,
      eventId: `assigned:${secondAssignment.requestId}`,
      tick: 10,
    }).ride;
  for (const ride of [first.result.ride, second])
    world.lifecycle.apply({
      rideId: ride.rideId,
      eventId: 'atomic:arrived',
      event: 'ARRIVED_PICKUP',
      tick: 11,
    });
  const snapshot = world.lifecycle.snapshot();
  assert.equal(snapshot.rides.length, 2);
  const tampered = {
    version: RIDE_FSM_VERSION,
    tick: 11,
    rides: [
      snapshot.rides[0]!,
      {
        ...snapshot.rides[1]!,
        transitions: [
          { ...snapshot.rides[1]!.transitions[0]!, transitionId: 'id-v1:forged' },
          ...snapshot.rides[1]!.transitions.slice(1),
        ],
      },
    ],
  };
  const lifecycle = createRideLifecycle({ dispatcher: world.dispatcherWorld.dispatcher });
  assert.ok(throws(() => lifecycle.restore(tampered), /stable 006/));
  assert.equal(lifecycle.stats().rides, 0);
  assert.equal(lifecycle.stats().active, 0);
  assert.equal(lifecycle.currentTick(), 0);
  assert.deepEqual(lifecycle.active(), []);
  assert.ok(
    throws(
      () =>
        lifecycle.restore({
          version: RIDE_FSM_VERSION,
          tick: 11,
          rides: [snapshot.rides[0]!, snapshot.rides[0]!],
        }),
      /Duplicate ride request/,
    ),
  );
  assert.equal(lifecycle.stats().rides, 0);
  assert.equal(lifecycle.restore(snapshot).length, 2);
  assert.equal(lifecycle.stats().active, 2);
  lifecycle.dispose();
  disposeRideLifecycleWorld(world);
});

test('061 never reads a wall clock or a renderer and disposes to zero', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(
    source,
    /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/,
  );
  assert.doesNotMatch(source, /\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/);

  const run = () => {
    const world = createRideLifecycleWorld(),
      { result } = beginFirstRide(world),
      rideId = result.ride.rideId;
    driveToDropoff(world.lifecycle, rideId, 10);
    world.lifecycle.apply({
      rideId,
      eventId: 'clock:complete',
      event: 'DROPOFF_COMPLETE',
      tick: 14,
    });
    const transcript = world.lifecycle
      .terminal()
      .map((ride) => `${ride.rideId}|${ride.state}|${ride.release?.tick}`)
      .join(',');
    disposeRideLifecycleWorld(world);
    return transcript;
  };
  const originalNow = Date.now;
  try {
    Date.now = () => 1;
    const first = run();
    Date.now = () => 9_999_999;
    assert.equal(run(), first);
  } finally {
    Date.now = originalNow;
  }

  const world = createRideLifecycleWorld(),
    { assignment, result } = beginFirstRide(world);
  world.lifecycle.dispose();
  world.lifecycle.dispose();
  const stats = world.lifecycle.stats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.rides, 0);
  assert.equal(stats.active, 0);
  assert.equal(stats.releases, 0);
  assert.equal(stats.transitions, 0);
  assert.deepEqual(world.lifecycle.active(), []);
  assert.deepEqual(world.lifecycle.terminal(), []);
  assert.deepEqual(world.lifecycle.snapshot().rides, []);
  assert.equal(world.lifecycle.ride(result.ride.rideId), undefined);
  assert.equal(world.lifecycle.rideFor(assignment.requestId), undefined);
  assert.equal(world.lifecycle.snapshotRide(result.ride.rideId), undefined);
  assert.ok(
    throws(
      () =>
        world.lifecycle.apply({
          rideId: result.ride.rideId,
          eventId: 'disposed:event',
          event: 'ARRIVED_PICKUP',
          tick: 11,
        }),
      /disposed/,
    ),
  );
  assert.ok(throws(() => world.lifecycle.advance(11), /disposed/));
  assert.ok(
    throws(
      () => world.lifecycle.begin({ requestId: assignment.requestId, eventId: 'x', tick: 11 }),
      /disposed/,
    ),
  );
  assert.ok(
    throws(
      () => world.lifecycle.restore({ version: RIDE_FSM_VERSION, tick: 11, rides: [] }),
      /disposed/,
    ),
  );
  // The injected dispatcher keeps its claim; the lifecycle never fabricates a release on disposal.
  assert.equal(world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId), 'ASSIGNED');
  disposeRideLifecycleWorld(world);
});

test('061 exposes only the documented states, events, reasons and transitions', () => {
  assert.equal(RIDE_FSM_VERSION, '061-ride-fsm-v1');
  assert.deepEqual(
    [...rideStates],
    ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF', 'COMPLETED', 'FAILED', 'CANCELLED'],
  );
  assert.deepEqual([...RIDE_TERMINAL_STATES], ['COMPLETED', 'FAILED', 'CANCELLED']);
  assert.deepEqual([...RIDE_TRANSITIONS.TO_PICKUP], ['PICKUP', 'FAILED', 'CANCELLED']);
  assert.deepEqual([...RIDE_TRANSITIONS.PICKUP], ['TO_DROPOFF', 'FAILED', 'CANCELLED']);
  assert.deepEqual([...RIDE_TRANSITIONS.TO_DROPOFF], ['DROPOFF', 'FAILED', 'CANCELLED']);
  assert.deepEqual([...RIDE_TRANSITIONS.DROPOFF], ['COMPLETED', 'FAILED']);
  for (const state of RIDE_TERMINAL_STATES) assert.deepEqual([...RIDE_TRANSITIONS[state]], []);
  assert.equal(new Set(RIDE_FAILURE_REASONS).size, RIDE_FAILURE_REASONS.length);
  assert.equal(new Set(RIDE_CANCEL_REASONS).size, RIDE_CANCEL_REASONS.length);
  assert.ok(
    RIDE_FAILURE_REASONS.every(
      (reason) => !(RIDE_CANCEL_REASONS as readonly string[]).includes(reason),
    ),
  );
  assert.ok(RIDE_FSM_LIMITS.activeRides >= 30);
  assert.ok(RIDE_FSM_LIMITS.eventsPerRide >= 6);
  assert.ok(RIDE_FSM_LIMITS.terminalRides >= RIDE_FSM_LIMITS.activeRides);
  assert.ok(throws(() => createRideLifecycle({}), /dispatcher/));
});

test('061 committed evidence report is the current ride lifecycle transcript', () => {
  const report = runRideFsmReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runRideFsmReport>;
  assert.deepEqual(
    saved,
    JSON.parse(JSON.stringify(report)) as ReturnType<typeof runRideFsmReport>,
  );
});
