import { parseRoadMap } from '../../../src/world/parser.ts';
import { createLaneGraph } from '../../../src/world/lane-graph.ts';
/**Frozen authored ground-level closed rectangle; centerline0 spans contact fixture. No030 algorithm.*/
export function recoveryRoadFixture() {
  const points = [
    [0, -20],
    [0, 100],
    [40, 100],
    [40, -20],
  ];
  const nodes = points.map(([x, z], i) => ({ id: 'road-' + i, positionM: { x, y: 0, z } }));
  const corners = [
    [-2, -22],
    [2, -22],
    [2, -18],
    [-2, -18],
  ].map(([x, z], i) => ({ id: 'service-' + i, positionM: { x, y: 0, z } }));
  const map = parseRoadMap({
    schemaVersion: 1,
    units: 'SI',
    mapId: '030-authored-road-v1',
    bounds: { minM: { x: -60, y: 0, z: -40 }, maxM: { x: 60, y: 0, z: 120 } },
    geometry: {
      nodes: [...nodes, ...corners],
      paths: nodes.map((n, i) => ({ id: 'path-' + i, nodeIds: [n.id, nodes[(i + 1) % 4].id] })),
      areas: [{ id: 'service-area', vertexNodeIds: corners.map((n) => n.id) }],
    },
    lanes: nodes.map((_node, i) => ({
      id: 'lane-' + i,
      geometryId: 'path-' + i,
      direction: 'FORWARD',
      widthM: 24,
      speedLimitMps: 13.4,
      access: ['TAXI', 'CIVIL'],
      neighbors: { left: null, right: null },
      successorIds: ['lane-' + ((i + 1) % 4)],
      fromIntersectionId: null,
      toIntersectionId: null,
    })),
    intersections: [],
    signals: [],
    stopLines: [],
    crosswalks: [],
    serviceZones: [
      {
        id: 'service',
        geometryId: 'service-area',
        laneId: 'lane-0',
        anchorNodeId: 'road-0',
        access: ['TAXI', 'CIVIL'],
        kind: 'BOTH',
      },
    ],
    recoveryPoints: [
      { id: 'point-0', nodeId: 'road-0', laneId: 'lane-0', headingRad: Math.PI / 2 },
    ],
  });
  return { map, graph: createLaneGraph(map) };
}
