import { createRideEta, createRideLifecycle } from '../../src/fleet';
import type {
  DispatchAssignment,
  EtaPoint,
  RideEta,
  RideLifecycle,
  RideRecord,
} from '../../src/fleet';
import type { LaneGraph } from '../../src/world';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from './ride-fsm-fixture';
import type { RideLifecycleWorld } from './ride-fsm-fixture';

export interface EtaWorld {
  readonly rideWorld: RideLifecycleWorld;
  readonly eta: RideEta;
  readonly assignment: DispatchAssignment;
  readonly rideId: string;
  /** The leg of the ride at creation: `PICKUP` before boarding, `TRIP` after. */
  readonly leg: 'PICKUP' | 'TRIP';
  readonly routeLaneIds: readonly string[];
  /** First tick accepted by default observations for this world. */
  readonly startTick: number;
}

export interface EtaWorldOptions {
  readonly boarded?: boolean;
  readonly etaOptions?: Record<string, unknown>;
}

/** Real 057 fleet, real 059 schedule, real 060 assignment and the real 061 lifecycle. */
export function createEtaWorld(options: EtaWorldOptions = {}): EtaWorld {
  const rideWorld = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    assignment = rideWorld.assignments[0];
  if (assignment === undefined) throw new Error('Fixture has no dispatcher assignment');
  const { result } = beginFirstRide(rideWorld);
  let startTick = 10;
  if (options.boarded === true) {
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
    startTick = 20;
  }
  const eta = createRideEta({
      lifecycle: rideWorld.lifecycle,
      graph: rideWorld.dispatcherWorld.graph,
      planner: rideWorld.dispatcherWorld.planner,
      ...options.etaOptions,
    }),
    ride = rideWorld.lifecycle.rideFor(assignment.requestId);
  if (ride === undefined) throw new Error('Fixture ride was not created');
  return {
    rideWorld,
    eta,
    assignment,
    rideId: ride.rideId,
    leg: options.boarded === true ? 'TRIP' : 'PICKUP',
    routeLaneIds: options.boarded === true ? ride.tripRouteLaneIds : ride.pickupRouteLaneIds,
    startTick,
  };
}

export function disposeEtaWorld(world: EtaWorld): void {
  world.eta.dispose();
  disposeRideLifecycleWorld(world.rideWorld);
}

export function graphOf(world: EtaWorld): LaneGraph {
  return world.rideWorld.dispatcherWorld.graph;
}

export function rideOf(world: EtaWorld): RideRecord {
  const ride = world.rideWorld.lifecycle.ride(world.rideId);
  if (ride === undefined) throw new Error('Fixture ride disappeared');
  return ride;
}

export function lanePoint(world: EtaWorld, laneId: string, index: number): EtaPoint {
  const path = graphOf(world).getDirectedPath(laneId);
  if (path === null) throw new Error(`Fixture lane is missing: ${laneId}`);
  const point = path.points[index];
  if (point === undefined) throw new RangeError(`Fixture lane point is outside: ${laneId}`);
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}

export function laneMidpoint(world: EtaWorld, laneId: string): EtaPoint {
  const path = graphOf(world).getDirectedPath(laneId);
  if (path === null) throw new Error(`Fixture lane is missing: ${laneId}`);
  return lanePoint(world, laneId, Math.floor((path.points.length - 1) / 2));
}

export function laneStart(world: EtaWorld, laneId: string): EtaPoint {
  return lanePoint(world, laneId, 0);
}

export function laneEnd(world: EtaWorld, laneId: string): EtaPoint {
  const path = graphOf(world).getDirectedPath(laneId);
  if (path === null) throw new Error(`Fixture lane is missing: ${laneId}`);
  return lanePoint(world, laneId, path.points.length - 1);
}

/** A real same-direction lane next to the given route lane, or `null` when there is none. */
export function adjacentLane(world: EtaWorld, laneId: string): string | null {
  const neighbors = graphOf(world).getNeighbors(laneId, 'TAXI');
  return (neighbors.right ?? neighbors.left)?.id ?? null;
}

/** First route lane that has a real same-direction neighbour, with its route index. */
export function adjacentRouteLane(world: EtaWorld): {
  readonly index: number;
  readonly laneId: string;
  readonly adjacentId: string;
} {
  for (let index = 0; index < world.routeLaneIds.length; index += 1) {
    const laneId = world.routeLaneIds[index]!,
      adjacentId = adjacentLane(world, laneId);
    if (adjacentId !== null) return { index, laneId, adjacentId };
  }
  throw new Error('Fixture route has no adjacent lane');
}

/** Midpoint of the real connection gap between two consecutive route lanes. */
export function gapMidpoint(world: EtaWorld, laneIds: readonly string[]): EtaPoint {
  const a = laneEnd(world, laneIds[0]!),
    b = laneStart(world, laneIds[1]!);
  return Object.freeze({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
}

export interface ObservationOverrides {
  readonly tick?: number;
  readonly positionM?: EtaPoint;
  readonly speedMps?: number;
  readonly headingRad?: number;
  readonly rideId?: string;
  readonly taxiId?: string;
}

export function etaObservation(
  world: EtaWorld,
  overrides: ObservationOverrides = {},
): Record<string, unknown> {
  return {
    rideId: world.rideId,
    taxiId: world.assignment.taxiId,
    tick: world.startTick,
    positionM: laneStart(world, world.routeLaneIds[0]!),
    speedMps: 8,
    ...overrides,
  };
}

export interface StubEta {
  readonly lifecycle: RideLifecycle;
  readonly eta: RideEta;
  readonly ride: RideRecord;
  readonly assignment: Record<string, unknown>;
  dispose(): void;
}

/**
 * A real 061 ride whose assignment is stubbed, so the stored 041 route can be made missing,
 * disconnected or priceless without mutating a frozen ride record. Geometry and planner stay real.
 */
export function createStubEta(overrides: Record<string, unknown> = {}): StubEta {
  const base = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    assignment = base.assignments[0];
  if (assignment === undefined) throw new Error('Fixture has no dispatcher assignment');
  const values: Record<string, unknown> = {
    assignmentId: assignment.assignmentId,
    requestId: assignment.requestId,
    taxiId: assignment.taxiId,
    tick: assignment.tick,
    pickupZoneId: assignment.pickupZoneId,
    dropoffZoneId: assignment.dropoffZoneId,
    pickupCostSeconds: assignment.pickupCostSeconds,
    tripCostSeconds: assignment.tripCostSeconds,
    totalCostSeconds: assignment.totalCostSeconds,
    pickupRouteLaneIds: assignment.pickupRouteLaneIds,
    tripRouteLaneIds: assignment.tripRouteLaneIds,
    ...overrides,
  };
  const stub = Object.freeze({
      namespace: base.dispatcherWorld.dispatcher.namespace,
      assignmentFor: (requestId: string): Record<string, unknown> | undefined =>
        requestId === values.requestId ? values : undefined,
      release: (): null => null,
      taxiStatus: (): 'ASSIGNED' => 'ASSIGNED',
    }),
    lifecycle = createRideLifecycle({ dispatcher: stub }),
    begun = lifecycle.begin({
      requestId: values.requestId as string,
      eventId: 'assigned:stub',
      tick: 10,
    }),
    eta = createRideEta({
      lifecycle,
      graph: base.dispatcherWorld.graph,
      planner: base.dispatcherWorld.planner,
    });
  return Object.freeze({
    lifecycle,
    eta,
    ride: begun.ride,
    assignment: values,
    dispose(): void {
      eta.dispose();
      lifecycle.dispose();
      disposeRideLifecycleWorld(base);
    },
  });
}

export function stubObservation(
  stub: StubEta,
  positionM: EtaPoint,
  tick = 10,
): Record<string, unknown> {
  return {
    rideId: stub.ride.rideId,
    taxiId: stub.ride.taxiId,
    tick,
    positionM,
    speedMps: 0,
  };
}
