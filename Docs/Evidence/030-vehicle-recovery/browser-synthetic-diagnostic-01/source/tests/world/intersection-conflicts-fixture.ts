import type { RoadMap } from '../../src/world/schema';
import type { Mutable } from './negative-fixtures';
export function intersectionConflictFixture(kind: 'T' | 'CROSS' = 'CROSS'): Mutable<RoadMap> {
  const map: Mutable<RoadMap> = {
    schemaVersion: 1,
    units: 'SI',
    mapId: `intersection-${kind}-v1`,
    bounds: { minM: { x: -30, y: 0, z: -30 }, maxM: { x: 30, y: 10, z: 30 } },
    geometry: { nodes: [], paths: [], areas: [] },
    lanes: [],
    intersections: [],
    signals: [],
    stopLines: [],
    crosswalks: [],
    serviceZones: [],
    recoveryPoints: [],
  };
  const node = (id: string, x: number, z: number) => {
    map.geometry.nodes.push({ id, positionM: { x, y: 0, z } });
    return id;
  };
  const path = (id: string, points: string[]) => {
    map.geometry.paths.push({ id, nodeIds: points });
    return id;
  };
  const arms: [string, number, number, number, number, number, number][] = [
    ['west', -20, -2, -10, -2, -10, 2],
    ['east', 20, 2, 10, 2, 10, -2],
    ['south', -2, -20, -2, -10, 2, -10],
  ];
  if (kind === 'CROSS') arms.push(['north', 2, 20, 2, 10, -2, 10]);
  for (const [arm, ox, oz, ix, iz, ex, ez] of arms) {
    const outer = node(`${arm}-outer`, ox, oz),
      entry = node(`${arm}-entry`, ix, iz),
      exit = node(`${arm}-exit`, ex, ez);
    map.lanes.push(
      {
        id: `${arm}-in`,
        geometryId: path(`g-${arm}-in`, [outer, entry]),
        direction: 'FORWARD',
        widthM: 1,
        speedLimitMps: 10,
        access: ['TAXI', 'CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: [],
        fromIntersectionId: null,
        toIntersectionId: 'junction',
      },
      {
        id: `${arm}-out`,
        geometryId: path(`g-${arm}-out`, [exit, outer]),
        direction: 'FORWARD',
        widthM: 1,
        speedLimitMps: 10,
        access: ['TAXI', 'CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: [`${arm}-in`],
        fromIntersectionId: 'junction',
        toIntersectionId: null,
      },
    );
  }
  const corners = [
    [-12, -12],
    [12, -12],
    [12, 12],
    [-12, 12],
  ].map(([x, z], i) => node(`corner-${i}`, x, z));
  map.geometry.areas.push({ id: 'g-junction', vertexNodeIds: corners });
  const service = [
    [-21, -3],
    [-19, -3],
    [-19, -1],
    [-21, -1],
  ].map(([x, z], i) => node(`service-${i}`, x, z));
  map.geometry.areas.push({ id: 'g-service', vertexNodeIds: service });
  map.serviceZones.push({
    id: 'service',
    geometryId: 'g-service',
    laneId: 'west-in',
    anchorNodeId: 'west-outer',
    access: ['TAXI', 'CIVIL'],
    kind: 'BOTH',
  });
  const junction: Mutable<RoadMap>['intersections'][number] = {
    id: 'junction',
    geometryId: 'g-junction',
    incomingLaneIds: arms.map(([arm]) => `${arm}-in`),
    outgoingLaneIds: arms.map(([arm]) => `${arm}-out`),
    conflictZones: [{ id: 'authored-zone', geometryId: 'g-junction' }],
    movements: [],
  };
  map.intersections.push(junction);
  const movement = (id: string, from: string, to: string, via: [number, number][] = []) => {
    const ids = [
      `${from}-entry`,
      ...via.map(([x, z], i) => node(`${id}-via-${i}`, x, z)),
      `${to}-exit`,
    ];
    junction.movements.push({
      id,
      geometryId: path(`g-${id}`, ids),
      fromLaneId: `${from}-in`,
      toLaneId: `${to}-out`,
      conflictZoneIds: [],
    });
    map.lanes.find((l) => l.id === `${from}-in`)!.successorIds.push(`${to}-out`);
  };
  movement('west-straight', 'west', 'east');
  movement('east-straight', 'east', 'west');
  movement('south-left', 'south', 'west', [[-2, 2]]);
  movement('west-right', 'west', 'south', [[-6, -2]]);
  if (kind === 'CROSS') {
    movement('south-straight', 'south', 'north');
    movement('west-left', 'west', 'north', [[-2, -2]]);
    movement('north-right', 'north', 'west', [[2, 6]]);
  }
  return map;
}
