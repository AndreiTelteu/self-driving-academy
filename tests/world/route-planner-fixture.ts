import { createLaneGraph, createRoutePlanner } from '../../src/world';
import type { RoadMap, RoutePlanner, RoutePlannerOptions } from '../../src/world';

/**
 * Directed router fixture. It is a strongly connected one-way loop whose access classes take
 * different edges:
 *
 *   l0(n0->n1) --CIVIL--> l1(n1->n2) --CIVIL--> l2(n2->n3) --> l3(n3->n0) --> l0
 *   l0 --TAXI--> l4(n1->n3, bypass) --> l3
 *
 * `l2` is the only CIVIL link between `l1` and `l3`, so blocking it makes CIVIL `l0 -> l3`
 * unreachable while TAXI still uses the bypass. `l4` is TAXI-only. Two service zones exercise the
 * service-point destination and the access-mismatch outcome.
 */
export function routePlannerMap(): RoadMap {
  return {
    schemaVersion: 1,
    units: 'SI',
    mapId: 'route-planner-v1',
    bounds: { minM: { x: -10, y: 0, z: -10 }, maxM: { x: 100, y: 10, z: 10 } },
    geometry: {
      nodes: [
        { id: 'n0', positionM: { x: 0, y: 0, z: 0 } },
        { id: 'n1', positionM: { x: 30, y: 0, z: 0 } },
        { id: 'n2', positionM: { x: 60, y: 0, z: 0 } },
        { id: 'n3', positionM: { x: 90, y: 0, z: 0 } },
        { id: 'both-0', positionM: { x: 88, y: 0, z: -2 } },
        { id: 'both-1', positionM: { x: 92, y: 0, z: -2 } },
        { id: 'both-2', positionM: { x: 92, y: 0, z: 2 } },
        { id: 'both-3', positionM: { x: 88, y: 0, z: 2 } },
        { id: 'taxi-0', positionM: { x: 28, y: 0, z: -2 } },
        { id: 'taxi-1', positionM: { x: 32, y: 0, z: -2 } },
        { id: 'taxi-2', positionM: { x: 32, y: 0, z: 2 } },
        { id: 'taxi-3', positionM: { x: 28, y: 0, z: 2 } },
      ],
      paths: [
        { id: 'g0', nodeIds: ['n0', 'n1'] },
        { id: 'g1', nodeIds: ['n1', 'n2'] },
        { id: 'g2', nodeIds: ['n2', 'n3'] },
        { id: 'g3', nodeIds: ['n3', 'n0'] },
        { id: 'g4', nodeIds: ['n1', 'n3'] },
      ],
      areas: [
        { id: 'area-both', vertexNodeIds: ['both-0', 'both-1', 'both-2', 'both-3'] },
        { id: 'area-taxi', vertexNodeIds: ['taxi-0', 'taxi-1', 'taxi-2', 'taxi-3'] },
      ],
    },
    lanes: [
      {
        id: 'l0',
        geometryId: 'g0',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 10,
        access: ['TAXI', 'CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: ['l1', 'l4'],
        fromIntersectionId: null,
        toIntersectionId: null,
      },
      {
        id: 'l1',
        geometryId: 'g1',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 5,
        access: ['CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: ['l2'],
        fromIntersectionId: null,
        toIntersectionId: null,
      },
      {
        id: 'l2',
        geometryId: 'g2',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 10,
        access: ['TAXI', 'CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: ['l3'],
        fromIntersectionId: null,
        toIntersectionId: null,
      },
      {
        id: 'l3',
        geometryId: 'g3',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 10,
        access: ['TAXI', 'CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: ['l0'],
        fromIntersectionId: null,
        toIntersectionId: null,
      },
      {
        id: 'l4',
        geometryId: 'g4',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 10,
        access: ['TAXI'],
        neighbors: { left: null, right: null },
        successorIds: ['l3'],
        fromIntersectionId: null,
        toIntersectionId: null,
      },
    ],
    intersections: [],
    signals: [],
    stopLines: [],
    crosswalks: [],
    serviceZones: [
      {
        id: 'zone-both',
        geometryId: 'area-both',
        laneId: 'l3',
        anchorNodeId: 'n3',
        access: ['TAXI', 'CIVIL'],
        kind: 'BOTH',
      },
      {
        id: 'zone-taxi',
        geometryId: 'area-taxi',
        laneId: 'l4',
        anchorNodeId: 'n1',
        access: ['TAXI'],
        kind: 'PICKUP',
      },
    ],
    recoveryPoints: [],
  };
}

export function routePlannerFixture() {
  const map = routePlannerMap();
  const graph = createLaneGraph(map);
  return { map, graph };
}

export function routePlannerFixturePlanner(
  options: Partial<Omit<RoutePlannerOptions, 'graph' | 'map'>> = {},
): { planner: RoutePlanner; map: RoadMap; graph: ReturnType<typeof createLaneGraph> } {
  const { map, graph } = routePlannerFixture();
  const planner = createRoutePlanner({
    graph,
    map,
    graphVersion: 'g1',
    costVersion: 'c0',
    ...options,
  });
  return { planner, map, graph };
}
