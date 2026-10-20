import { createFleetScenario } from '../../src/fleet';
import type { DispatchAssignment, FleetScenario, RideRecord } from '../../src/fleet';
export interface HealthWorld {
  readonly scenario: FleetScenario;
  readonly assignments: readonly DispatchAssignment[];
  /** First tick accepted after dispatch; rides begin here. */
  readonly tick: number;
}

export interface HealthWorldOptions {
  readonly taxiCount?: number;
  readonly civilianCount?: number;
  readonly requests?: number;
  /** Taxis 1..openTaxis stay available; the rest are withdrawn at tick 0. */
  readonly openTaxis?: number;
  readonly assign?: number;
  readonly beginRides?: boolean;
}

/** Real 057−064 world plus the 065 health/reset contract over the reproducible scenario fixture. */
export function createHealthWorld(options: HealthWorldOptions = {}): HealthWorld {
  const scenario = createFleetScenario({
    taxiCount: options.taxiCount ?? 20,
    civilianCount: options.civilianCount ?? 20,
    requestsPerWindow: options.requests ?? 2,
  });
  const openTaxis = options.openTaxis ?? Math.max(1, options.assign ?? 2);
  for (let index = openTaxis; index < scenario.taxiIds.length; index += 1) {
    const taxiId = scenario.taxiIds[index]!;
    scenario.health.apply({
      taxiId,
      fact: 'SERVICE_WITHDRAWN',
      factId: `fixture:withdrawn:${taxiId}`,
      tick: 0,
    });
  }
  const tick = 59;
  scenario.demand.advance(tick);
  const assignments = scenario.dispatcher.step({
    tick,
    maxAssignments: options.assign ?? openTaxis,
  }).assigned;
  if (options.beginRides !== false)
    for (const assignment of assignments)
      scenario.lifecycle.begin({
        requestId: assignment.requestId,
        eventId: `assigned:${assignment.requestId}`,
        tick,
      });
  return { scenario, assignments, tick };
}

export function disposeHealthWorld(world: HealthWorld): void {
  world.scenario.dispose();
}

export function rideOf(world: HealthWorld, assignment: DispatchAssignment): RideRecord {
  const ride = world.scenario.lifecycle.rideFor(assignment.requestId);
  if (ride === undefined) throw new Error('Fixture ride disappeared');
  return ride;
}

export function laneStart(scenario: FleetScenario, laneId: string): Record<string, number> {
  const path = scenario.graph.getDirectedPath(laneId);
  if (path === null) throw new Error(`Fixture lane is missing: ${laneId}`);
  const point = path.points[0]!;
  return { x: point.x, y: point.y, z: point.z };
}

/** ETA observation on the first lane of the ride's current leg. */
export function rideObservation(
  world: HealthWorld,
  ride: RideRecord,
  tick: number,
): Record<string, unknown> {
  const laneId =
    ride.state === 'TO_PICKUP' || ride.state === 'PICKUP'
      ? ride.pickupRouteLaneIds[0]
      : ride.tripRouteLaneIds[0];
  if (laneId === undefined) throw new Error('Fixture ride has no route');
  return {
    rideId: ride.rideId,
    taxiId: ride.taxiId,
    tick,
    positionM: laneStart(world.scenario, laneId),
    speedMps: 8,
  };
}
