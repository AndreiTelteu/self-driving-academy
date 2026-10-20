import { createFleetRegistry, createRideDemand, createRideDispatcher } from '../../src/fleet';
import type {
  FleetRegistry,
  RideDemand,
  RideDispatcher,
  TaxiPositionSource,
} from '../../src/fleet';
import { createLaneGraph, createNeighbourhoodMap, createRoutePlanner } from '../../src/world';
import type { LaneGraph, RoadMap, RoutePlanner } from '../../src/world';
import { RIDE_DEMAND_WINDOWS, rideDemandPlan, singleWindow } from './ride-demand-fixture';

export const DISPATCH_FLEET_NAMESPACE = 'city:fixture:fleet';

export function fleetConfiguration(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session:060',
    worldEpoch: 0,
    scenarioId: 'city-060',
    seed: 60060,
    namespace: DISPATCH_FLEET_NAMESPACE,
    taxiCount: 24,
    civilianCount: 20,
    profile: { profileId: 'city:common', versionId: 'profile-v1' },
    ...overrides,
  };
}

export interface MutablePositions extends TaxiPositionSource {
  set(taxiId: string, laneId: string | null): void;
  entries(): readonly (readonly [string, string | null])[];
}

export function createMutablePositions(
  initial: Iterable<readonly [string, string | null]> = [],
): MutablePositions {
  const lanes = new Map<string, string | null>();
  for (const [taxiId, laneId] of initial) lanes.set(taxiId, laneId);
  return Object.freeze({
    laneFor(taxiId: string): string | null {
      return lanes.get(taxiId) ?? null;
    },
    set(taxiId: string, laneId: string | null): void {
      lanes.set(taxiId, laneId);
    },
    entries(): readonly (readonly [string, string | null])[] {
      return Object.freeze(
        [...lanes.entries()].sort((left, right) => left[0].localeCompare(right[0])),
      );
    },
  });
}

export const TAXI_LANES = (map: RoadMap): readonly string[] =>
  Object.freeze(
    map.lanes
      .filter((lane) => lane.access.includes('TAXI'))
      .map((lane) => lane.id)
      .sort(),
  );

export interface DispatcherWorldOptions {
  readonly windows?: readonly Record<string, unknown>[];
  readonly plan?: Record<string, unknown>;
  readonly taxiCount?: number;
  readonly civilianCount?: number;
  /** Explicit slot (1-based) -> lane mapping. Missing slots fall back to the round-robin lane. */
  readonly slotLanes?: Readonly<Record<number, string | null>>;
  readonly dispatcher?: Partial<{
    maxAssignmentsPerStep: number;
    maxTaxiCandidates: number;
    maxRouteSearchesPerStep: number;
  }>;
}

export interface DispatcherWorld {
  readonly map: RoadMap;
  readonly graph: LaneGraph;
  readonly planner: RoutePlanner;
  readonly demand: RideDemand;
  readonly registry: FleetRegistry;
  readonly positions: MutablePositions;
  readonly dispatcher: RideDispatcher;
  readonly taxiIds: readonly string[];
  readonly civilianIds: readonly string[];
}

export function createDispatcherWorld(options: DispatcherWorldOptions = {}): DispatcherWorld {
  const map = createNeighbourhoodMap(),
    graph = createLaneGraph(map),
    planner = createRoutePlanner({
      graph,
      map,
      graphVersion: '033-lane-graph-v1',
      costVersion: 'route-cost-v1',
    }),
    plan = options.plan ?? rideDemandPlan({ windows: options.windows ?? RIDE_DEMAND_WINDOWS }),
    demand = createRideDemand({ plan, map, graph, planner }),
    registry = createFleetRegistry(
      fleetConfiguration({
        taxiCount: options.taxiCount ?? 24,
        civilianCount: options.civilianCount ?? 20,
      }),
    ),
    taxiIds = registry
      .list()
      .filter((vehicle) => vehicle.driverKind === 'TAXI')
      .map((vehicle) => vehicle.vehicleId),
    civilianIds = registry
      .list()
      .filter((vehicle) => vehicle.driverKind === 'CIVILIAN')
      .map((vehicle) => vehicle.vehicleId),
    lanes = TAXI_LANES(map),
    initial: (readonly [string, string | null])[] = taxiIds.map((taxiId, index) => {
      const slot = index + 1;
      const explicit = Object.hasOwn(options.slotLanes ?? {}, slot);
      return [
        taxiId,
        explicit ? (options.slotLanes![slot] ?? null) : (lanes[index % lanes.length] ?? null),
      ];
    }),
    positions = createMutablePositions(initial),
    dispatcher = createRideDispatcher({
      registry,
      demand,
      planner,
      map,
      positions,
      ...options.dispatcher,
    });
  return { map, graph, planner, demand, registry, positions, dispatcher, taxiIds, civilianIds };
}

export function taxiAt(world: DispatcherWorld, slot: number): string {
  const vehicleId = world.taxiIds[slot - 1];
  if (vehicleId === undefined) throw new RangeError('Unknown fleet taxi slot');
  return vehicleId;
}

export function disposeDispatcherWorld(world: DispatcherWorld): void {
  world.dispatcher.dispose();
  world.demand.dispose();
  world.registry.dispose();
  world.planner.dispose();
}

/** One scheduled request with a fixed pickup/dropoff pair. */
export function fixedWindow(
  originZoneId: string,
  destinationZoneId: string,
  overrides: Record<string, unknown> = {},
): readonly Record<string, unknown>[] {
  return singleWindow({ originZoneId, destinationZoneId, endTick: 10, ...overrides });
}
