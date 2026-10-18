import type { RoadMap } from '../../src/world';
import { minimalMap } from './fixture';
export type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
export function mutableMap(): Mutable<RoadMap> {
  return minimalMap() as Mutable<RoadMap>;
}
export function twoMovements(): Mutable<RoadMap> {
  const map = mutableMap();
  map.geometry.nodes.push(
    { id: 'n-b2', positionM: { x: 9, y: 0, z: 1 } },
    { id: 'n-c2', positionM: { x: 11, y: 0, z: 1 } },
  );
  map.geometry.paths.push(
    { id: 'g-a2', nodeIds: ['n-a', 'n-b2'] },
    { id: 'g-b2', nodeIds: ['n-c2', 'n-d'] },
    { id: 'g-move2', nodeIds: ['n-b2', 'n-c2'] },
  );
  map.lanes.push(
    {
      ...structuredClone(map.lanes[0]),
      id: 'lane-a2',
      geometryId: 'g-a2',
      successorIds: ['lane-b2'],
    },
    { ...structuredClone(map.lanes[1]), id: 'lane-b2', geometryId: 'g-b2' },
  );
  map.lanes[2].successorIds.push('lane-a2');
  const junction = map.intersections[0];
  junction.incomingLaneIds.push('lane-a2');
  junction.outgoingLaneIds.push('lane-b2');
  junction.movements.push({
    id: 'move2',
    geometryId: 'g-move2',
    fromLaneId: 'lane-a2',
    toLaneId: 'lane-b2',
    conflictZoneIds: ['conflict'],
  });
  map.signals[0].phases[0].movementStates.push({ movementId: 'move2', state: 'RED' });
  map.signals[0].phases[1].movementStates.push({ movementId: 'move2', state: 'GREEN' });
  return map;
}
