import { createCityCollisionLog } from '../../src/app';
import type { CityCollisionLog } from '../../src/app';
import type { RideRecord } from '../../src/fleet';
import { CollisionRegistry, createCollisionEpisodes } from '../../src/vehicles';
import type { CityIncidentPositionM } from '../../src/ui';
import { createHealthWorld, disposeHealthWorld, rideOf } from '../fleet/fleet-health-fixture';
import type { HealthWorld } from '../fleet/fleet-health-fixture';
import { cityPosition } from '../ui/city-dashboard-fixture';

export interface CityDashboardWorldOptions {
  /** Dispatched taxis; zero produces the no-exposure scenario. */
  readonly assign?: number;
  /** Complete the first ride through the real 061 events. */
  readonly completeRide?: boolean;
  /** Apply a real 065 `TRAFFIC_BLOCK` to the second taxi at tick 64. */
  readonly blockTaxi?: boolean;
  /** Feed one real 028 collision episode into the bounded log at tick 65. */
  readonly collision?: boolean;
}

export interface CityDashboardWorld {
  readonly health: HealthWorld;
  readonly context: Readonly<{ sessionId: string; worldEpoch: number }>;
  readonly collisionLog: CityCollisionLog;
  readonly hasCollisionSource: boolean;
  readonly completedRide: RideRecord | null;
  readonly blockedTaxiId: string | null;
  readonly collisionVehicleId: string | null;
  /** Real host position read; only the colliding taxi has a coordinate. */
  positions(vehicleId: string): CityIncidentPositionM | null;
  dispose(): void;
}

const RIDE_EVENTS = [
  'ARRIVED_PICKUP',
  'PICKUP_COMPLETE',
  'ARRIVED_DROPOFF',
  'DROPOFF_COMPLETE',
] as const;

/**
 * Real 061 + 028 + 065 world for the 082 evidence: one completed ride, one blocked taxi with a failed
 * ride and one collision incident. Nothing is synthesized outside the real modules.
 */
export function createCityDashboardWorld(
  options: CityDashboardWorldOptions = {},
): CityDashboardWorld {
  const assign = options.assign ?? 2,
    health = createHealthWorld({ assign }),
    context = health.scenario.registry.context(),
    collisionLog = createCityCollisionLog();
  let completedRide: RideRecord | null = null,
    blockedTaxiId: string | null = null,
    collisionVehicleId: string | null = null,
    tick = health.tick + 1;
  if ((options.completeRide ?? true) && health.assignments.length > 0) {
    const ride = rideOf(health, health.assignments[0]!);
    for (const event of RIDE_EVENTS) {
      health.scenario.lifecycle.apply({
        rideId: ride.rideId,
        eventId: `city:082:${event}`,
        event,
        tick,
      });
      tick += 1;
    }
    completedRide = health.scenario.lifecycle.ride(ride.rideId) ?? null;
  }
  if ((options.blockTaxi ?? true) && health.assignments.length > 1) {
    blockedTaxiId = health.assignments[1]!.taxiId;
    health.scenario.health.apply({
      taxiId: blockedTaxiId,
      fact: 'TRAFFIC_BLOCK',
      factId: 'city:082:traffic-block',
      tick: Math.max(tick, 64),
    });
  }
  if (options.collision ?? true) {
    const vehicleId = completedRide?.taxiId ?? health.assignments[0]?.taxiId ?? null;
    if (vehicleId !== null) {
      const registry = new CollisionRegistry(),
        vehicle = registry.register(vehicleId, 'VEHICLE', 1),
        obstacle = registry.register('obstacle:082:wall', 'OBSTACLE', 2),
        episodes = createCollisionEpisodes(
          {
            schemaVersion: 1,
            units: 'SI',
            sessionId: context.sessionId,
            worldEpoch: context.worldEpoch,
          },
          registry,
        );
      episodes.update(65, [{ first: vehicle, second: obstacle, impulseNs: 1200 }]);
      episodes.drain((incident) => {
        collisionLog.record(incident);
      });
      collisionVehicleId = vehicleId;
      episodes.dispose();
      registry.dispose();
    }
  }
  return {
    health,
    context: Object.freeze({ sessionId: context.sessionId, worldEpoch: context.worldEpoch }),
    collisionLog,
    hasCollisionSource: options.collision ?? true,
    completedRide,
    blockedTaxiId,
    collisionVehicleId,
    positions: (vehicleId: string) =>
      vehicleId === collisionVehicleId ? cityPosition(12, 0, -4) : null,
    dispose() {
      collisionLog.dispose();
      disposeHealthWorld(health);
    },
  };
}
