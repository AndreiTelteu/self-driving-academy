import type { RoadMap } from '../../src/world';
/** Directed ring scales to schema2048 lanes, with every lane reaching a real eligible service. */
export function laneGraphRing(count = 8, reverse = false): RoadMap {
  if (!Number.isInteger(count) || count < 3 || count > 2048) throw new Error('Invalid ring size');
  const radius = 1000;
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    positionM: {
      x: radius * Math.cos((i * 2 * Math.PI) / count),
      y: 0,
      z: radius * Math.sin((i * 2 * Math.PI) / count),
    },
  }));
  const anchor = nodes[0].positionM;
  const areaNodes = [
    [-2, -2],
    [2, -2],
    [2, 2],
    [-2, 2],
  ].map(([x, z], i) => ({
    id: `service-corner-${i}`,
    positionM: { x: anchor.x + x, y: 0, z: anchor.z + z },
  }));
  return {
    schemaVersion: 1,
    units: 'SI',
    mapId: `lane-ring-${count}-${reverse ? 'reverse' : 'forward'}`,
    bounds: { minM: { x: -1100, y: 0, z: -1100 }, maxM: { x: 1100, y: 0, z: 1100 } },
    geometry: {
      nodes: [...nodes, ...areaNodes],
      paths: nodes.map((node, i) => ({
        id: `path-${i}`,
        nodeIds: [node.id, nodes[(i + 1) % count].id],
      })),
      areas: [{ id: 'service-area', vertexNodeIds: areaNodes.map((n) => n.id) }],
    },
    lanes: nodes.map((_node, i) => ({
      id: `lane-${i}`,
      geometryId: `path-${i}`,
      direction: reverse ? 'REVERSE' : 'FORWARD',
      widthM: 3.5,
      speedLimitMps: 13.4,
      access: ['TAXI', 'CIVIL'],
      neighbors: { left: null, right: null },
      successorIds: [`lane-${(i + (reverse ? count - 1 : 1)) % count}`],
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
        anchorNodeId: 'node-0',
        access: ['TAXI', 'CIVIL'],
        kind: 'BOTH',
      },
    ],
    recoveryPoints: [],
  };
}
