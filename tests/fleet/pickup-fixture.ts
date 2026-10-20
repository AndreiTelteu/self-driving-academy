import { createRidePickup } from '../../src/fleet';
import type { DispatchAssignment, PickupDecision, PickupPoint, RidePickup } from '../../src/fleet';
import type { RoadMap } from '../../src/world';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from './ride-fsm-fixture';
import type { RideLifecycleWorld } from './ride-fsm-fixture';

export interface PickupWorld {
  readonly rideWorld: RideLifecycleWorld;
  readonly pickup: RidePickup;
  readonly assignment: DispatchAssignment;
  readonly rideId: string;
  readonly pickupZoneId: string;
  readonly pickupZoneCenter: PickupPoint;
  readonly otherPickupZoneId: string;
  readonly otherPickupZoneCenter: PickupPoint;
  readonly dropoffZoneCenter: PickupPoint;
  readonly outsidePoint: PickupPoint;
  readonly boundaryInsidePoint: PickupPoint;
  readonly boundaryOutsidePoint: PickupPoint;
}

export interface PickupWorldOptions {
  readonly pickupOptions?: Record<string, unknown>;
}

function nodeMap(map: RoadMap): ReadonlyMap<string, PickupPoint> {
  return new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
}

/** The real authored 032 polygon of one service zone, in XZ order. */
export function zonePolygon(map: RoadMap, zoneId: string): readonly PickupPoint[] {
  const zone = map.serviceZones.find((entry) => entry.id === zoneId);
  if (zone === undefined) throw new Error(`Unknown service zone ${zoneId}`);
  const area = map.geometry.areas.find((entry) => entry.id === zone.geometryId);
  if (area === undefined) throw new Error(`Missing service zone area ${zone.geometryId}`);
  const nodes = nodeMap(map);
  return Object.freeze(
    area.vertexNodeIds.map((nodeId) => {
      const position = nodes.get(nodeId);
      if (position === undefined) throw new Error(`Missing service zone node ${nodeId}`);
      return Object.freeze({ x: position.x, y: position.y, z: position.z });
    }),
  );
}

export function zoneBounds(
  map: RoadMap,
  zoneId: string,
): Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  const vertices = zonePolygon(map, zoneId);
  return Object.freeze({
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    minZ: Math.min(...vertices.map((vertex) => vertex.z)),
    maxZ: Math.max(...vertices.map((vertex) => vertex.z)),
  });
}

/** Polygon centre used by tests as a clearly interior pickup position. */
export function zoneCenter(map: RoadMap, zoneId: string): PickupPoint {
  const vertices = zonePolygon(map, zoneId);
  return Object.freeze({
    x: vertices.reduce((sum, vertex) => sum + vertex.x, 0) / vertices.length,
    y: vertices.reduce((sum, vertex) => sum + vertex.y, 0) / vertices.length,
    z: vertices.reduce((sum, vertex) => sum + vertex.z, 0) / vertices.length,
  });
}

export function otherPickupZoneId(map: RoadMap, excludeId: string): string {
  const zone = map.serviceZones.find(
    (entry) => entry.id !== excludeId && entry.access.includes('TAXI') && entry.kind !== 'DROPOFF',
  );
  if (zone === undefined) throw new Error('Fixture map has no other TAXI pickup zone');
  return zone.id;
}

/**
 * Real 057 fleet, real 059 schedule, real 060 assignment, real 032 map service zones and the
 * 061 lifecycle. The first request uses the fixed `sz:0-0 -> sz:1-0` window of the 061 fixture.
 */
export function createPickupWorld(options: PickupWorldOptions = {}): PickupWorld {
  const rideWorld = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    { assignment, result } = beginFirstRide(rideWorld),
    map = rideWorld.dispatcherWorld.map,
    pickupZoneId = assignment.pickupZoneId,
    otherPickupId = otherPickupZoneId(map, pickupZoneId),
    bounds = zoneBounds(map, pickupZoneId),
    center = zoneCenter(map, pickupZoneId),
    pickup = createRidePickup({
      map,
      lifecycle: rideWorld.lifecycle,
      ...options.pickupOptions,
    });
  return {
    rideWorld,
    pickup,
    assignment,
    rideId: result.ride.rideId,
    pickupZoneId,
    pickupZoneCenter: center,
    otherPickupZoneId: otherPickupId,
    otherPickupZoneCenter: zoneCenter(map, otherPickupId),
    dropoffZoneCenter: zoneCenter(map, assignment.dropoffZoneId),
    // Far outside every authored service zone; still a valid finite map position.
    outsidePoint: Object.freeze({ x: center.x + 10_000, y: 0, z: center.z + 10_000 }),
    boundaryInsidePoint: Object.freeze({ x: bounds.maxX - 0.01, y: 0, z: center.z }),
    boundaryOutsidePoint: Object.freeze({ x: bounds.maxX + 0.01, y: 0, z: center.z }),
  };
}

export function disposePickupWorld(world: PickupWorld): void {
  world.pickup.dispose();
  disposeRideLifecycleWorld(world.rideWorld);
}

export interface ObservationOverrides {
  readonly rideId?: string;
  readonly taxiId?: string;
  readonly tick?: number;
  readonly positionM?: PickupPoint;
  readonly speedMps?: number;
}

export function pickupObservation(
  world: PickupWorld,
  overrides: ObservationOverrides = {},
): Record<string, unknown> {
  return {
    rideId: world.rideId,
    taxiId: world.assignment.taxiId,
    tick: 20,
    positionM: world.pickupZoneCenter,
    speedMps: 0,
    ...overrides,
  };
}

/** Holds a stopped taxi in the assigned pickup zone; the last call is the boarding observation. */
export function holdStationary(
  world: PickupWorld,
  fromTick: number,
  ticks = world.pickup.requiredDwellTicks,
): PickupDecision {
  let decision = world.pickup.observe(pickupObservation(world, { tick: fromTick }));
  for (let offset = 1; offset < ticks; offset += 1)
    decision = world.pickup.observe(pickupObservation(world, { tick: fromTick + offset }));
  return decision;
}

export function boardAt(
  world: PickupWorld,
  fromTick = 20,
  positionM: PickupPoint = world.pickupZoneCenter,
): PickupDecision {
  return world.pickup.observe(
    pickupObservation(world, {
      tick: fromTick + world.pickup.requiredDwellTicks,
      positionM,
    }),
  );
}

/**
 * Observes every intermediate tick and returns the boarding decision. `skipFirst` is used when
 * the caller already observed `fromTick` (for example to assert the first pending decision).
 */
export function holdAndBoard(
  world: PickupWorld,
  fromTick = 20,
  skipFirst = false,
  positionM: PickupPoint = world.pickupZoneCenter,
): PickupDecision {
  const required = world.pickup.requiredDwellTicks;
  for (let tick = skipFirst ? fromTick + 1 : fromTick; tick < fromTick + required; tick += 1)
    world.pickup.observe(pickupObservation(world, { tick, positionM }));
  return boardAt(world, fromTick, positionM);
}
