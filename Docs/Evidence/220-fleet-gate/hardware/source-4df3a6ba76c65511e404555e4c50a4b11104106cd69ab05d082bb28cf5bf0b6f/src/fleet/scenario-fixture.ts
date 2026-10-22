import { number, record, requireContract, text, tick } from '../sessions';
import {
  createLaneGraph,
  createNeighbourhoodMap,
  createRoutePlanner,
  parseRoadMap,
} from '../world';
import type { LaneGraph, RoadMap, RoutePlanner, ServiceZone } from '../world';
import { createRideDispatcher } from './dispatcher';
import type { RideDispatcher, TaxiPositionSource } from './dispatcher';
import { createRideEta } from './eta';
import type { RideEta } from './eta';
import { createFleetHealth } from './fleet-health';
import type { FleetHealth } from './fleet-health';
import { createRideDemand } from './ride-demand';
import type { RideDemand, RideRequest } from './ride-demand';
import { createRideLifecycle } from './ride-fsm';
import type { RideLifecycle } from './ride-fsm';
import { createFleetRegistry } from './registry';
import type {
  FleetConfiguration,
  FleetPopulationReport,
  FleetRegistry,
  FleetVehicle,
} from './registry';

export const FLEET_SCENARIO_VERSION = '065-fleet-scenario-v1' as const;

/** Gate 220 fixture presets: 20, 24 and 30 taxis with up to 40 civilians. */
export const FLEET_SCENARIO_TAXI_PRESETS = Object.freeze([20, 24, 30] as const);

export const FLEET_SCENARIO_LIMITS = Object.freeze({
  version: FLEET_SCENARIO_VERSION,
  taxisMinimum: 20,
  taxisMaximum: 30,
  civiliansMinimum: 20,
  civiliansMaximum: 40,
  windows: 4,
  requestsPerWindow: 8,
  maximumRequestsPerWindow: 256,
  defaultSeed: 65065,
});

export interface FleetScenarioOptions {
  readonly taxiCount?: number;
  readonly civilianCount?: number;
  readonly seed?: number;
  readonly scenarioId?: string;
  readonly sessionId?: string;
  readonly worldEpoch?: number;
  readonly requestsPerWindow?: number;
  /** Real 032 map; the default neighbourhood map is used when omitted. */
  readonly map?: unknown;
}

/** Deterministic taxi position source: sorted real TAXI lanes, round-robin by taxi id order. */
export interface ScenarioPositions extends TaxiPositionSource {
  set(taxiId: string, laneId: string | null): void;
  entries(): readonly (readonly [string, string | null])[];
}

export interface FleetScenario {
  readonly version: typeof FLEET_SCENARIO_VERSION;
  readonly configuration: FleetConfiguration;
  readonly map: RoadMap;
  readonly graph: LaneGraph;
  readonly planner: RoutePlanner;
  readonly registry: FleetRegistry;
  readonly demand: RideDemand;
  readonly dispatcher: RideDispatcher;
  readonly lifecycle: RideLifecycle;
  readonly eta: RideEta;
  readonly health: FleetHealth;
  readonly positions: ScenarioPositions;
  readonly taxiIds: readonly string[];
  readonly civilianIds: readonly string[];
  dispose(): void;
}

export interface FleetScenarioVehicle {
  readonly vehicle: FleetVehicle;
  readonly laneId: string | null;
}

export interface FleetScenarioReport {
  readonly version: typeof FLEET_SCENARIO_VERSION;
  readonly configuration: Readonly<{
    scenarioId: string;
    seed: number;
    taxiCount: number;
    civilianCount: number;
    profileId: string;
    profileVersion: string;
    fleetNamespace: string;
    rideNamespace: string;
  }>;
  readonly population: FleetPopulationReport;
  readonly taxis: readonly FleetScenarioVehicle[];
  readonly civilians: number;
  readonly requests: readonly RideRequest[];
}

function boundedCount(value: unknown, minimum: number, maximum: number, label: string): number {
  const result = number(value, minimum, maximum);
  requireContract(Number.isSafeInteger(result), `${label} must be an integer`);
  return result;
}

function sortedZones(map: RoadMap): readonly ServiceZone[] {
  return map.serviceZones
    .slice()
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function createPositions(taxiIds: readonly string[], lanes: readonly string[]): ScenarioPositions {
  requireContract(lanes.length > 0, 'Fleet scenario requires TAXI lanes');
  const assigned = new Map<string, string | null>();
  for (let index = 0; index < taxiIds.length; index += 1)
    assigned.set(taxiIds[index]!, lanes[index % lanes.length]!);
  return Object.freeze({
    laneFor(taxiId: string): string | null {
      return assigned.get(taxiId) ?? null;
    },
    set(taxiId: string, laneId: string | null): void {
      assigned.set(taxiId, laneId);
    },
    entries(): readonly (readonly [string, string | null])[] {
      return Object.freeze(
        [...assigned.entries()].sort((left, right) =>
          left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0,
        ),
      );
    },
  });
}

/**
 * Reproducible 20/24/30-taxi scenario fixture, reusable by the 220 gate. It composes the real
 * 032/033/041 world, the real 057 population, the 059 schedule, the 060 dispatcher, the 061
 * lifecycle, the 064 ETA and the 065 health/reset contract without DOM, renderer or wall clock.
 */
export function createFleetScenario(options: FleetScenarioOptions = {}): FleetScenario {
  const optionsData = record(options);
  for (const key of Object.keys(optionsData))
    requireContract(
      [
        'taxiCount',
        'civilianCount',
        'seed',
        'scenarioId',
        'sessionId',
        'worldEpoch',
        'requestsPerWindow',
        'map',
      ].includes(key),
      'Unknown fleet scenario option',
    );
  const taxiCount =
      options.taxiCount === undefined
        ? 24
        : boundedCount(
            options.taxiCount,
            FLEET_SCENARIO_LIMITS.taxisMinimum,
            FLEET_SCENARIO_LIMITS.taxisMaximum,
            'Fleet scenario taxis',
          ),
    civilianCount =
      options.civilianCount === undefined
        ? 40
        : boundedCount(
            options.civilianCount,
            FLEET_SCENARIO_LIMITS.civiliansMinimum,
            FLEET_SCENARIO_LIMITS.civiliansMaximum,
            'Fleet scenario civilians',
          ),
    requestsPerWindow =
      options.requestsPerWindow === undefined
        ? FLEET_SCENARIO_LIMITS.requestsPerWindow
        : boundedCount(
            options.requestsPerWindow,
            1,
            FLEET_SCENARIO_LIMITS.maximumRequestsPerWindow,
            'Fleet scenario requests per window',
          ),
    seed =
      options.seed === undefined
        ? FLEET_SCENARIO_LIMITS.defaultSeed
        : boundedCount(options.seed, 0, 0xffff_ffff, 'Fleet scenario seed'),
    scenarioId = options.scenarioId === undefined ? 'fleet-065' : text(options.scenarioId),
    sessionId = options.sessionId === undefined ? 'session:065' : text(options.sessionId),
    worldEpoch = options.worldEpoch === undefined ? 0 : tick(options.worldEpoch),
    map = options.map === undefined ? createNeighbourhoodMap() : parseRoadMap(options.map),
    graph = createLaneGraph(map),
    planner = createRoutePlanner({
      graph,
      map,
      graphVersion: '033-lane-graph-v1',
      costVersion: 'route-cost-v1',
    }),
    zones = sortedZones(map).filter((zone) => zone.access.includes('TAXI')),
    pickupZone = zones.find((zone) => zone.kind !== 'DROPOFF'),
    dropoffZone =
      pickupZone === undefined
        ? undefined
        : zones.find((zone) => zone.kind !== 'PICKUP' && zone.id !== pickupZone.id);
  const plannedPickup = pickupZone,
    plannedDropoff = dropoffZone;
  if (plannedPickup === undefined || plannedDropoff === undefined)
    throw new Error('Fleet scenario requires distinct TAXI pickup and dropoff zones');
  const fleetNamespace = `city:${scenarioId}:fleet`,
    rideNamespace = `city:${scenarioId}:rides`;
  requireContract(rideNamespace.length <= 64, 'Fleet scenario ride namespace is too long');
  const windows = Array.from({ length: FLEET_SCENARIO_LIMITS.windows }, (_, index) =>
    Object.freeze({
      windowId: `w${String(index).padStart(3, '0')}`,
      startTick: index * 60,
      endTick: index * 60 + 60,
      demandLevel: index % 3 === 0 ? 'HIGH' : index % 3 === 1 ? 'NORMAL' : 'LOW',
      requestCount: requestsPerWindow,
      originZoneId: plannedPickup.id,
      destinationZoneId: plannedDropoff.id,
    }),
  );
  const registry = createFleetRegistry({
      schemaVersion: 1,
      units: 'SI',
      sessionId,
      worldEpoch,
      scenarioId,
      seed,
      namespace: fleetNamespace,
      taxiCount,
      civilianCount,
      profile: { profileId: 'city:common', versionId: 'profile-v1' },
    }),
    demand = createRideDemand({
      plan: {
        schemaVersion: 1,
        units: 'SI',
        scenarioId,
        mapId: map.mapId,
        seed,
        namespace: rideNamespace,
        windows,
      },
      map,
      graph,
      planner,
    }),
    taxiIds = Object.freeze(
      registry
        .list()
        .filter((vehicle) => vehicle.driverKind === 'TAXI')
        .map((vehicle) => vehicle.vehicleId),
    ),
    civilianIds = Object.freeze(
      registry
        .list()
        .filter((vehicle) => vehicle.driverKind === 'CIVILIAN')
        .map((vehicle) => vehicle.vehicleId),
    ),
    lanes = Object.freeze(
      map.lanes
        .filter((lane) => lane.access.includes('TAXI'))
        .map((lane) => lane.id)
        .sort(),
    ),
    positions = createPositions(taxiIds, lanes),
    dispatcher = createRideDispatcher({ registry, demand, planner, map, positions }),
    lifecycle = createRideLifecycle({ dispatcher }),
    eta = createRideEta({ lifecycle, graph, planner }),
    health = createFleetHealth({ dispatcher, lifecycle, demand, eta, registry });
  let disposed = false;
  return Object.freeze({
    version: FLEET_SCENARIO_VERSION,
    configuration: registry.configuration,
    map,
    graph,
    planner,
    registry,
    demand,
    dispatcher,
    lifecycle,
    eta,
    health,
    positions,
    taxiIds,
    civilianIds,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      health.dispose();
      eta.dispose();
      lifecycle.dispose();
      dispatcher.dispose();
      demand.dispose();
      registry.dispose();
      planner.dispose();
    },
  });
}

/** Stable structural report used to prove fixture reproducibility and reuse in gate 220. */
export function fleetScenarioReport(scenario: FleetScenario): FleetScenarioReport {
  const { configuration } = scenario;
  return Object.freeze({
    version: FLEET_SCENARIO_VERSION,
    configuration: Object.freeze({
      scenarioId: configuration.scenarioId,
      seed: configuration.seed,
      taxiCount: configuration.taxiCount,
      civilianCount: configuration.civilianCount,
      profileId: configuration.profile.profileId,
      profileVersion: configuration.profile.versionId,
      fleetNamespace: configuration.namespace,
      rideNamespace: scenario.demand.plan.namespace,
    }),
    population: scenario.registry.report(),
    taxis: Object.freeze(
      scenario.taxiIds.map((taxiId) =>
        Object.freeze({
          vehicle: scenario.registry.get(taxiId)!,
          laneId: scenario.positions.laneFor(taxiId),
        }),
      ),
    ),
    civilians: scenario.civilianIds.length,
    requests: scenario.demand.requests(),
  });
}
