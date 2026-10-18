import { intersectionConflictFixture } from './intersection-conflicts-fixture';
export function signalFixture() {
  const map = intersectionConflictFixture();
  const ids = map.intersections[0].movements.map((m) => m.id);
  const states = (green: string | null, color: 'RED' | 'YELLOW' | 'GREEN' = 'GREEN') =>
    ids.map((movementId) => ({
      movementId,
      state: movementId === green ? color : ('RED' as const),
    }));
  map.signals = [
    {
      id: 'signal',
      intersectionId: 'junction',
      phases: [
        { id: 'west-green', durationS: 2 / 60, movementStates: states('west-straight') },
        { id: 'west-yellow', durationS: 1 / 60, movementStates: states('west-straight', 'YELLOW') },
        { id: 'all-red', durationS: 1 / 60, movementStates: states(null) },
        { id: 'south-green', durationS: 2 / 60, movementStates: states('south-straight') },
      ],
    },
  ];
  return map;
}

export async function twoSignalFixture() {
  const { mutableMap } = await import('./negative-fixtures');
  const map = mutableMap();
  map.crosswalks = [];
  map.stopLines = map.stopLines.filter((l) => l.kind !== 'CROSSWALK');
  const point = (id: string, x: number, z: number) => ({ id, positionM: { x, y: 0, z } });
  map.geometry.nodes.push(
    point('second-a', 20, 9),
    point('second-b', 20, 11),
    point('second-c1', 18, 8),
    point('second-c2', 22, 8),
    point('second-c3', 22, 12),
    point('second-c4', 18, 12),
  );
  map.geometry.paths.find((p) => p.id === 'g-c')!.nodeIds = ['n-d', 'second-a'];
  map.geometry.paths.push(
    { id: 'g-second-move', nodeIds: ['second-a', 'second-b'] },
    { id: 'g-second-out', nodeIds: ['second-b', 'n-loop', 'n-a'] },
  );
  map.geometry.areas.push({
    id: 'g-second',
    vertexNodeIds: ['second-c1', 'second-c2', 'second-c3', 'second-c4'],
  });
  map.lanes[2].toIntersectionId = 'second';
  map.lanes[2].successorIds = ['second-out'];
  map.lanes.push({
    ...structuredClone(map.lanes[1]),
    id: 'second-out',
    geometryId: 'g-second-out',
    fromIntersectionId: 'second',
    successorIds: ['lane-a'],
  });
  map.intersections.push({
    id: 'second',
    geometryId: 'g-second',
    incomingLaneIds: ['lane-c'],
    outgoingLaneIds: ['second-out'],
    conflictZones: [],
    movements: [
      {
        id: 'second-move',
        geometryId: 'g-second-move',
        fromLaneId: 'lane-c',
        toLaneId: 'second-out',
        conflictZoneIds: [],
      },
    ],
  });
  map.signals[0].phases[0].durationS = 2 / 60;
  map.signals[0].phases[1].durationS = 1 / 60;
  map.signals.push({
    id: 'signal-second',
    intersectionId: 'second',
    phases: [
      {
        id: 'second-green',
        durationS: 2 / 60,
        movementStates: [{ movementId: 'second-move', state: 'GREEN' }],
      },
      {
        id: 'second-red',
        durationS: 1 / 60,
        movementStates: [{ movementId: 'second-move', state: 'RED' }],
      },
    ],
  });
  return map;
}
