import { createRideDropoff } from '../../src/fleet';
import type {
  DispatchAssignment,
  DropoffDecision,
  DropoffPoint,
  RideDropoff,
  RideState,
} from '../../src/fleet';
import type { RoadMap } from '../../src/world';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from './ride-fsm-fixture';
import type { RideLifecycleWorld } from './ride-fsm-fixture';
import { createPickupWorld, holdAndBoard, zoneBounds, zoneCenter } from './pickup-fixture';
import type { PickupWorld } from './pickup-fixture';

export { zoneBounds, zoneCenter };

export interface DropoffWorld {
  readonly rideWorld: RideLifecycleWorld;
  readonly dropoff: RideDropoff;
  readonly assignment: DispatchAssignment;
  readonly rideId: string;
  readonly pickupZoneId: string;
  readonly pickupZoneCenter: DropoffPoint;
  readonly dropoffZoneId: string;
  readonly dropoffZoneCenter: DropoffPoint;
  readonly otherDropoffZoneId: string;
  readonly otherDropoffZoneCenter: DropoffPoint;
  readonly outsidePoint: DropoffPoint;
  readonly boundaryInsidePoint: DropoffPoint;
  readonly boundaryOutsidePoint: DropoffPoint;
  /** First tick accepted by the default dropoff observations for this world. */
  readonly startTick: number;
}

export interface DropoffWorldOptions {
  readonly dropoffOptions?: Record<string, unknown>;
  /**
   * `events` advances the ride to `TO_DROPOFF` with the 061 pickup edges only; `pickup` runs the
   * real 062 module first. Both paths must produce the same dropoff evaluation.
   */
  readonly boardedVia?: 'events' | 'pickup';
}

/** The real authored 032 polygon of one service zone, in XZ order. */
export function otherDropoffZoneId(map: RoadMap, excludeId: string): string {
  const zone = map.serviceZones.find(
    (entry) => entry.id !== excludeId && entry.access.includes('TAXI') && entry.kind !== 'PICKUP',
  );
  if (zone === undefined) throw new Error('Fixture map has no other TAXI dropoff zone');
  return zone.id;
}

/**
 * One real narrated map of the same zone kind, used to prove the module refuses an incompatible
 * `ride.dropoffZoneId` instead of trusting the id alone.
 */
export function withZoneKind(
  map: RoadMap,
  zoneId: string,
  kind: 'PICKUP' | 'DROPOFF' | 'BOTH',
): RoadMap {
  return {
    ...map,
    serviceZones: map.serviceZones.map((zone) =>
      zone.id === zoneId ? Object.freeze({ ...zone, kind }) : zone,
    ),
  };
}

/**
 * Real 057 fleet, real 059 schedule, real 060 assignment, real 032 map and the real 061 lifecycle,
 * already advanced to `TO_DROPOFF` through either the 062 pickup module or the 061 pickup edges.
 */
export function createDropoffWorld(options: DropoffWorldOptions = {}): DropoffWorld {
  const pickupWorld: PickupWorld | null =
      options.boardedVia === 'pickup' ? createPickupWorld() : null,
    rideWorld =
      pickupWorld?.rideWorld ?? createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    assignment = rideWorld.assignments[0];
  if (assignment === undefined) throw new Error('Fixture has no dispatcher assignment');
  if (pickupWorld !== null) {
    const boarded = holdAndBoard(pickupWorld, 20);
    if (boarded.status !== 'BOARDED') throw new Error('Fixture pickup did not board');
    // The dropoff module must stand alone once the passenger is aboard.
    pickupWorld.pickup.dispose();
  } else {
    const { result } = beginFirstRide(rideWorld);
    rideWorld.lifecycle.apply({
      rideId: result.ride.rideId,
      eventId: `pickup-arrived:${assignment.requestId}`,
      event: 'ARRIVED_PICKUP',
      tick: 12,
    });
    rideWorld.lifecycle.apply({
      rideId: result.ride.rideId,
      eventId: `pickup-boarded:${assignment.requestId}`,
      event: 'PICKUP_COMPLETE',
      tick: 13,
    });
  }
  const ride = rideWorld.lifecycle.rideFor(assignment.requestId);
  if (ride === undefined) throw new Error('Fixture ride was not created');
  const map = rideWorld.dispatcherWorld.map,
    dropoffZoneId = assignment.dropoffZoneId,
    otherId = otherDropoffZoneId(map, dropoffZoneId),
    bounds = zoneBounds(map, dropoffZoneId),
    center = zoneCenter(map, dropoffZoneId),
    pickupCenter = zoneCenter(map, assignment.pickupZoneId),
    startTick = pickupWorld === null ? 20 : 220,
    dropoff = createRideDropoff({
      map,
      lifecycle: rideWorld.lifecycle,
      ...options.dropoffOptions,
    });
  return {
    rideWorld,
    dropoff,
    assignment,
    rideId: ride.rideId,
    pickupZoneId: assignment.pickupZoneId,
    pickupZoneCenter: pickupCenter,
    dropoffZoneId,
    dropoffZoneCenter: center,
    otherDropoffZoneId: otherId,
    otherDropoffZoneCenter: zoneCenter(map, otherId),
    // Far outside every authored service zone; still a valid finite map position.
    outsidePoint: Object.freeze({ x: center.x + 10_000, y: 0, z: center.z + 10_000 }),
    boundaryInsidePoint: Object.freeze({ x: bounds.maxX - 0.01, y: 0, z: center.z }),
    boundaryOutsidePoint: Object.freeze({ x: bounds.maxX + 0.01, y: 0, z: center.z }),
    startTick,
  };
}

export function disposeDropoffWorld(world: DropoffWorld): void {
  world.dropoff.dispose();
  disposeRideLifecycleWorld(world.rideWorld);
}

export interface ObservationOverrides {
  readonly rideId?: string;
  readonly taxiId?: string;
  readonly tick?: number;
  readonly positionM?: DropoffPoint;
  readonly speedMps?: number;
}

export function dropoffObservation(
  world: DropoffWorld,
  overrides: ObservationOverrides = {},
): Record<string, unknown> {
  return {
    rideId: world.rideId,
    taxiId: world.assignment.taxiId,
    tick: world.startTick,
    positionM: world.dropoffZoneCenter,
    speedMps: 0,
    ...overrides,
  };
}

/** Holds a stopped taxi in the assigned dropoff zone; the last call is the completion observation. */
export function holdStationary(
  world: DropoffWorld,
  fromTick: number,
  ticks = world.dropoff.requiredDwellTicks,
): DropoffDecision {
  let decision = world.dropoff.observe(dropoffObservation(world, { tick: fromTick }));
  for (let offset = 1; offset < ticks; offset += 1)
    decision = world.dropoff.observe(dropoffObservation(world, { tick: fromTick + offset }));
  return decision;
}

export function completeAt(
  world: DropoffWorld,
  fromTick = world.startTick,
  positionM: DropoffPoint = world.dropoffZoneCenter,
): DropoffDecision {
  return world.dropoff.observe(
    dropoffObservation(world, {
      tick: fromTick + world.dropoff.requiredDwellTicks,
      positionM,
    }),
  );
}

/**
 * Observes every intermediate tick and returns the completion decision. `skipFirst` is used when
 * the caller already observed `fromTick` (for example to assert the first pending decision).
 */
export function holdAndComplete(
  world: DropoffWorld,
  fromTick = world.startTick,
  skipFirst = false,
  positionM: DropoffPoint = world.dropoffZoneCenter,
): DropoffDecision {
  const required = world.dropoff.requiredDwellTicks;
  for (let tick = skipFirst ? fromTick + 1 : fromTick; tick < fromTick + required; tick += 1)
    world.dropoff.observe(dropoffObservation(world, { tick, positionM }));
  return completeAt(world, fromTick, positionM);
}

export function rideState(world: DropoffWorld): RideState {
  return world.rideWorld.lifecycle.ride(world.rideId)!.state;
}
