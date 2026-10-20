import { createRideDemand } from '../../src/fleet';
import type { RideDemand, RideDemandOptions } from '../../src/fleet';
import {
  NEIGHBOURHOOD_MAP_ID,
  createLaneGraph,
  createNeighbourhoodMap,
  createRoutePlanner,
} from '../../src/world';
import type { LaneGraph, RoadMap, RoutePlanner } from '../../src/world';

export const RIDE_DEMAND_WINDOWS = Object.freeze([
  Object.freeze({
    windowId: 'w:morning',
    startTick: 0,
    endTick: 600,
    demandLevel: 'NORMAL' as const,
    requestCount: 12,
    originZoneId: null,
    destinationZoneId: null,
  }),
  Object.freeze({
    windowId: 'w:peak',
    startTick: 600,
    endTick: 900,
    demandLevel: 'HIGH' as const,
    requestCount: 12,
    originZoneId: null,
    destinationZoneId: null,
  }),
  Object.freeze({
    windowId: 'w:evening',
    startTick: 900,
    endTick: 1500,
    demandLevel: 'LOW' as const,
    requestCount: 8,
    originZoneId: null,
    destinationZoneId: null,
  }),
]);

export function rideDemandPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    scenarioId: 'city-059',
    mapId: NEIGHBOURHOOD_MAP_ID,
    seed: 59059,
    namespace: 'city:fixture:rides',
    windows: RIDE_DEMAND_WINDOWS,
    ...overrides,
  };
}

export function singleWindow(
  overrides: Record<string, unknown> = {},
): readonly Record<string, unknown>[] {
  return [
    {
      windowId: 'w:single',
      startTick: 0,
      endTick: 10,
      demandLevel: 'NORMAL',
      requestCount: 1,
      originZoneId: null,
      destinationZoneId: null,
      ...overrides,
    },
  ];
}

export interface RideDemandWorld {
  readonly map: RoadMap;
  readonly graph: LaneGraph;
  readonly planner: RoutePlanner;
  readonly demand: RideDemand;
}

export function createRideWorld(
  planOverrides: Record<string, unknown> = {},
  options: {
    readonly planner?: RoutePlanner;
    readonly createDemand?: boolean;
    readonly demand?: Partial<RideDemandOptions>;
  } = {},
): RideDemandWorld {
  const map = createNeighbourhoodMap(),
    graph = createLaneGraph(map),
    planner =
      options.planner ??
      createRoutePlanner({
        graph,
        map,
        graphVersion: '033-lane-graph-v1',
        costVersion: 'route-cost-v1',
      }),
    demand =
      options.createDemand === false
        ? (null as unknown as RideDemand)
        : createRideDemand({
            plan: rideDemandPlan(planOverrides),
            map,
            graph,
            planner,
            ...options.demand,
          });
  return { map, graph, planner, demand };
}

export function disposeRideWorld(world: RideDemandWorld): void {
  world.demand.dispose();
  world.planner.dispose();
}
