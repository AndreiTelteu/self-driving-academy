import { createRideLifecycle } from '../../src/fleet';
import type { DispatchAssignment, RideLifecycle } from '../../src/fleet';
import {
  createDispatcherWorld,
  disposeDispatcherWorld,
  fixedWindow,
  taxiAt,
} from './dispatcher-fixture';
import type { DispatcherWorld } from './dispatcher-fixture';

export interface RideLifecycleWorld {
  readonly dispatcherWorld: DispatcherWorld;
  readonly lifecycle: RideLifecycle;
  readonly assignments: readonly DispatchAssignment[];
}

export interface RideLifecycleWorldOptions {
  readonly requestCount?: number;
  /** Taxi slots left available; everything above this slot is BLOCKED. */
  readonly openTaxis?: number;
  readonly assignedCount?: number;
}

/**
 * Real 057 fleet + real 059 schedule + real 060 assignments. Only taxi slots 1..`openTaxis`
 * stay available so the assignment order and taxi choice are deterministic.
 */
export function createRideLifecycleWorld(
  options: RideLifecycleWorldOptions = {},
): RideLifecycleWorld {
  const requestCount = options.requestCount ?? 2,
    openTaxis = options.openTaxis ?? 2,
    world = createDispatcherWorld({
      windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount, endTick: 10 }),
      taxiCount: Math.max(24, openTaxis),
    });
  for (let slot = openTaxis + 1; slot <= 24; slot += 1)
    world.dispatcher.setTaxiStatus(taxiAt(world, slot), 'BLOCKED', 0);
  world.demand.advance(10);
  const assignments = world.dispatcher.step({
    tick: 10,
    maxAssignments: Math.min(options.assignedCount ?? openTaxis, 16),
  }).assigned;
  return {
    dispatcherWorld: world,
    lifecycle: createRideLifecycle({ dispatcher: world.dispatcher }),
    assignments,
  };
}

export function disposeRideLifecycleWorld(world: RideLifecycleWorld): void {
  world.lifecycle.dispose();
  disposeDispatcherWorld(world.dispatcherWorld);
}

/** Applies one lifecycle event with a deterministic event id derived from the ride and transition. */
export function rideEventInput(
  rideId: string,
  event: string,
  atTick: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { rideId, eventId: `${rideId}:${event}:${atTick}`, event, tick: atTick, ...extra };
}

export function beginFirstRide(world: RideLifecycleWorld, atTick = 10) {
  const assignment = world.assignments[0];
  if (assignment === undefined) throw new Error('Fixture has no dispatcher assignment');
  const result = world.lifecycle.begin({
    requestId: assignment.requestId,
    eventId: `assigned:${assignment.requestId}`,
    tick: atTick,
  });
  return { assignment, result };
}
