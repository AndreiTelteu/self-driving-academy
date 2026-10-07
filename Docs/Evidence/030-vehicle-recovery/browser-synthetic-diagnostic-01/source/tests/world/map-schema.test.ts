import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapValidationError, parseRoadMap } from '../../src/world';
import { minimalMap } from './fixture';
test('minimal semantic map is deterministic and deeply immutable', () => {
  const input = minimalMap(),
    one = parseRoadMap(input),
    two = parseRoadMap(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(one, two);
  assert.notEqual(one, input);
  assert.notEqual(one.geometry.nodes[0], input.geometry.nodes[0]);
  function frozen(value: unknown): void {
    if (value && typeof value === 'object') {
      assert.ok(Object.isFrozen(value));
      for (const child of Object.values(value)) frozen(child);
    }
  }
  frozen(one);
  assert.throws(() => {
    Object.assign(one.geometry.nodes[0].positionM, { x: 99 });
  });
});
import { mutableMap, twoMovements } from './negative-fixtures';
import type { Mutable } from './negative-fixtures';
import type { RoadMap } from '../../src/world';
const cases: readonly [string, (map: Mutable<RoadMap>) => void, RegExp][] = [
  [
    'duplicate geometry ID',
    (m) => {
      m.geometry.paths[0].id = m.geometry.nodes[0].id;
    },
    /Duplicate ID/,
  ],
  [
    'duplicate semantic ID',
    (m) => {
      m.serviceZones[0].id = m.lanes[0].id;
    },
    /Duplicate ID/,
  ],
  [
    'dangling geometry node',
    (m) => {
      m.geometry.paths[0].nodeIds[1] = 'missing-node';
    },
    /Missing reference missing-node/,
  ],
  [
    'dangling lane geometry',
    (m) => {
      m.lanes[0].geometryId = 'missing-geometry';
    },
    /Missing reference missing-geometry/,
  ],
  [
    'duplicate successor',
    (m) => {
      m.lanes[0].successorIds.push('lane-b');
    },
    /Duplicate reference/,
  ],
  [
    'dangling successor',
    (m) => {
      m.lanes[2].successorIds = ['missing-lane'];
    },
    /Missing reference missing-lane/,
  ],
  [
    'self successor',
    (m) => {
      m.lanes[2].successorIds = ['lane-c'];
    },
    /Self successor/,
  ],
  [
    'direct continuation opposite endpoints',
    (m) => {
      m.lanes[2].direction = 'REVERSE';
    },
    /Continuation endpoint/,
  ],
  [
    'intersection directed endpoint outside footprint',
    (m) => {
      m.lanes[0].direction = 'REVERSE';
    },
    /endpoint outside intersection/,
  ],
  [
    'intersection omitted membership',
    (m) => {
      m.lanes[0].toIntersectionId = null;
    },
    /membership mismatch/,
  ],
  [
    'intersection dangling membership',
    (m) => {
      m.intersections[0].incomingLaneIds.push('missing-lane');
    },
    /Missing reference missing-lane/,
  ],
  [
    'movement missing successor',
    (m) => {
      m.lanes[0].successorIds = [];
    },
    /missing corresponding successor/,
  ],
  [
    'successor without movement',
    (m) => {
      m.lanes[0].successorIds.push('lane-c');
    },
    /must have a permitted movement/,
  ],
  [
    'movement endpoint direction',
    (m) => {
      m.geometry.paths[3].nodeIds.reverse();
    },
    /path endpoint\/direction mismatch/,
  ],
  [
    'movement incoming to incoming',
    (m) => {
      m.intersections[0].movements[0].toLaneId = 'lane-a';
    },
    /distinct incoming and outgoing/,
  ],
  [
    'dangling conflict zone',
    (m) => {
      m.intersections[0].movements[0].conflictZoneIds = ['missing-conflict'];
    },
    /Missing reference missing-conflict/,
  ],
  [
    'duplicate movement pair',
    (m) => {
      m.intersections[0].movements.push({
        ...m.intersections[0].movements[0],
        id: 'duplicate-movement',
      });
    },
    /Duplicate movement for lane pair/,
  ],
  [
    'neighbor dangling',
    (m) => {
      m.lanes[0].neighbors.left = 'missing-neighbor';
    },
    /Missing reference missing-neighbor/,
  ],
  [
    'neighbor self',
    (m) => {
      m.lanes[0].neighbors.left = 'lane-a';
    },
    /Neighbor must be distinct/,
  ],
  [
    'neighbor not reciprocal',
    (m) => {
      m.lanes[0].neighbors.left = 'lane-c';
    },
    /reciprocal/,
  ],
  [
    'signal dangling intersection',
    (m) => {
      m.signals[0].intersectionId = 'missing-junction';
    },
    /Missing reference missing-junction/,
  ],
  [
    'phase unknown movement',
    (m) => {
      m.signals[0].phases[0].movementStates[0].movementId = 'missing-move';
    },
    /Missing reference missing-move/,
  ],
  [
    'phase repeated assignment',
    (m) => {
      m.signals[0].phases[0].movementStates.push({ ...m.signals[0].phases[0].movementStates[0] });
    },
    /Duplicate reference/,
  ],
  [
    'phase incomplete',
    (m) => {
      m.signals[0].phases[0].movementStates = [];
    },
    /minimum length/,
  ],
  [
    'stop dangling lane',
    (m) => {
      m.stopLines[0].laneId = 'missing-lane';
    },
    /Missing reference missing-lane/,
  ],
  [
    'stop wrong anchor',
    (m) => {
      m.stopLines[0].anchorNodeId = 'n-c';
    },
    /Anchor must be a node/,
  ],
  [
    'stop signal absent',
    (m) => {
      m.stopLines[0].signalId = null;
    },
    /requires signal and intersection/,
  ],
  [
    'stop signal dangling',
    (m) => {
      m.stopLines[0].signalId = 'missing-signal';
    },
    /Missing reference missing-signal/,
  ],
  [
    'STOP missing intersection',
    (m) => {
      m.stopLines[0].kind = 'STOP';
      m.stopLines[0].signalId = null;
      m.stopLines[0].intersectionId = null;
    },
    /STOP line requires intersection/,
  ],
  [
    'crosswalk wrong stop kind',
    (m) => {
      m.crosswalks[0].stopLineIds = ['signal-stop'];
    },
    /Crosswalk stop/,
  ],
  [
    'crosswalk lane not covered',
    (m) => {
      m.crosswalks[0].laneIds.push('lane-a');
    },
    /Every crossed lane requires/,
  ],
  [
    'crosswalk orphan stop',
    (m) => {
      m.crosswalks = [];
    },
    /Orphan CROSSWALK/,
  ],
  [
    'service wrong anchor',
    (m) => {
      m.serviceZones[0].anchorNodeId = 'n-c';
    },
    /Anchor must be a node/,
  ],
  [
    'service anchor outside area bbox',
    (m) => {
      m.serviceZones[0].anchorNodeId = 'n-b';
    },
    /Service anchor outside/,
  ],
  [
    'service inaccessible class',
    (m) => {
      m.lanes.forEach((l) => {
        l.access = ['TAXI'];
      });
    },
    /Service access must be allowed/,
  ],
  [
    'service unreachable graph',
    (m) => {
      m.lanes[2].successorIds = [];
    },
    /service unreachable from lane lane-b/,
  ],
  [
    'recovery dangling node',
    (m) => {
      m.recoveryPoints[0].nodeId = 'missing-node';
    },
    /Missing reference missing-node/,
  ],
  [
    'recovery off lane',
    (m) => {
      m.recoveryPoints[0].nodeId = 'n-a';
    },
    /Anchor must be a node/,
  ],
  [
    'bounds reversed',
    (m) => {
      m.bounds.maxM.x = m.bounds.minM.x;
    },
    /positive X\/Z extent/,
  ],
  [
    'position out of bounds',
    (m) => {
      m.geometry.nodes[0].positionM.x = 100;
    },
    /Position outside map bounds/,
  ],
  [
    'path zero length alias',
    (m) => {
      m.geometry.nodes[1].positionM = { ...m.geometry.nodes[0].positionM };
    },
    /Zero-length path edge/,
  ],
  [
    'area degenerate',
    (m) => {
      m.geometry.areas[0].vertexNodeIds = ['n-a', 'n-b', 'n-c'];
    },
    /Degenerate X\/Z/,
  ],
  [
    'width zero',
    (m) => {
      m.lanes[0].widthM = 0;
    },
    /positive quantity/,
  ],
  [
    'access repeated',
    (m) => {
      m.lanes[0].access.push('TAXI');
    },
    /Duplicate reference/,
  ],
];
for (const [name, mutate, message] of cases)
  test(`rejects ${name}`, () => {
    const map = mutableMap();
    mutate(map);
    assert.throws(
      () => parseRoadMap(map),
      (error) =>
        error instanceof MapValidationError &&
        message.test(error.message) &&
        error.path.startsWith('map'),
    );
  });
test('signal programs permit separated movement phases and reject conflicting simultaneous greens', () => {
  const map = twoMovements();
  parseRoadMap(map);
  map.signals[0].phases[0].movementStates[1].state = 'GREEN';
  assert.throws(() => parseRoadMap(map), /Simultaneous GREEN conflicts/);
});
test('class-specific connectivity ignores lanes inaccessible to that class', () => {
  const map = mutableMap();
  map.serviceZones[0].access = ['TAXI'];
  map.lanes[2].access = ['TAXI'];
  parseRoadMap(map);
  map.serviceZones[0].access.push('CIVIL');
  assert.throws(() => parseRoadMap(map), /CIVIL service unreachable/);
});
test('neighbors require reciprocal links and compatible directed corridors', () => {
  const map = twoMovements();
  map.lanes[0].neighbors.left = 'lane-a2';
  map.lanes[3].neighbors.right = 'lane-a';
  parseRoadMap(map);
  map.lanes[3].fromIntersectionId = 'junction';
  assert.throws(
    () => parseRoadMap(map),
    /endpoint outside intersection|omitted|membership mismatch|corridor/,
  );
});
test('errors carry offending ID, position and stable field path', () => {
  const map = mutableMap();
  map.geometry.nodes[0].positionM.x = 100;
  assert.throws(
    () => parseRoadMap(map),
    (error) =>
      error instanceof MapValidationError &&
      error.id === 'n-a' &&
      error.path === 'map.geometry.nodes[0].positionM' &&
      error.positionM?.x === 100,
  );
});
test('strict structure rejects hidden fields, accessors, prototypes, symbols and sparse arrays', () => {
  const bad: unknown[] = [
    { ...minimalMap(), schemaVersion: 2 },
    { ...minimalMap(), units: 'km' },
    { ...minimalMap(), extra: 1 },
  ];
  const getter = mutableMap();
  Object.defineProperty(getter.geometry.nodes[0], 'id', {
    get() {
      throw new Error('Getter ran');
    },
    enumerable: true,
  });
  bad.push(getter);
  const hidden = mutableMap();
  Object.defineProperty(hidden.lanes[0], 'extra', { value: 1, enumerable: false });
  bad.push(hidden);
  const symbol = mutableMap();
  Object.defineProperty(symbol, Symbol('x'), { value: 1 });
  bad.push(symbol);
  const prototype = mutableMap();
  Object.setPrototypeOf(prototype.lanes[0], { id: 'inherited' });
  bad.push(prototype);
  const sparse = mutableMap();
  delete sparse.lanes[0];
  bad.push(sparse);
  const extraArray = mutableMap();
  Object.assign(extraArray.lanes, { extra: true });
  bad.push(extraArray);
  for (const input of bad) assert.throws(() => parseRoadMap(input), MapValidationError);
});
test('all numeric fields reject nonfinite data and numeric strings', () => {
  let checked = 0;
  const original = mutableMap();
  function walk(value: unknown, path: (string | number)[]): void {
    if (typeof value === 'number') {
      for (const invalid of [NaN, Infinity, -Infinity, String(value)]) {
        const map = structuredClone(original);
        let parent: unknown = map;
        for (const key of path.slice(0, -1))
          parent = (parent as Record<string | number, unknown>)[key];
        (parent as Record<string | number, unknown>)[path[path.length - 1]] = invalid;
        assert.throws(() => parseRoadMap(map), MapValidationError);
        checked++;
      }
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
    }
  }
  walk(original, []);
  assert.ok(checked > 200);
});
test('array capacity rejects before graph traversal and finite cycles terminate deterministically', () => {
  const map = mutableMap();
  map.lanes = new Array(8193).fill(map.lanes[0]);
  assert.throws(() => parseRoadMap(map), /capacity/);
  assert.deepEqual(parseRoadMap(minimalMap()), parseRoadMap(minimalMap()));
});

test('input mutations after parsing and rejected validation never alter published data', () => {
  const input = mutableMap();
  const output = parseRoadMap(input);
  const published = JSON.stringify(output);
  input.geometry.nodes[0].positionM.x = 999;
  input.lanes[0].successorIds.push('missing');
  assert.equal(JSON.stringify(output), published);
  const invalidBefore = JSON.stringify(input);
  assert.throws(() => parseRoadMap(input), MapValidationError);
  assert.equal(JSON.stringify(input), invalidBefore);
});
test('STOP regulation and reversed stored geometry remain valid when their semantic direction agrees', () => {
  const input = mutableMap();
  input.signals = [];
  input.stopLines[0].kind = 'STOP';
  input.stopLines[0].signalId = null;
  const path = input.geometry.paths.find((p) => p.id === 'g-a')!;
  path.nodeIds.reverse();
  input.lanes[0].direction = 'REVERSE';
  parseRoadMap(input);
});
test('signal phases reject foreign-intersection movements and simultaneous merges', () => {
  const map = twoMovements();
  const first = map.intersections[0];
  const second = {
    ...structuredClone(first),
    id: 'junction2',
    incomingLaneIds: ['lane-a2'],
    outgoingLaneIds: ['lane-b2'],
    conflictZones: [{ id: 'conflict2', geometryId: 'g-junction' }],
    movements: [{ ...first.movements[1], conflictZoneIds: ['conflict2'] }],
  };
  first.incomingLaneIds = ['lane-a'];
  first.outgoingLaneIds = ['lane-b'];
  first.movements = [first.movements[0]];
  map.lanes[3].toIntersectionId = 'junction2';
  map.lanes[4].fromIntersectionId = 'junction2';
  map.intersections.push(second);
  for (const phase of map.signals[0].phases)
    phase.movementStates = phase.movementStates.slice(0, 1);
  parseRoadMap(map);
  map.signals[0].phases[0].movementStates[0].movementId = 'move2';
  assert.throws(() => parseRoadMap(map), /another intersection movement/);
  const merge = twoMovements();
  merge.lanes[3].successorIds = ['lane-b'];
  merge.geometry.paths.find((p) => p.id === 'g-move2')!.nodeIds = ['n-b2', 'n-c'];
  merge.intersections[0].movements[1].toLaneId = 'lane-b';
  merge.intersections[0].movements[1].conflictZoneIds = [];
  merge.signals[0].phases[0].movementStates[1].state = 'GREEN';
  assert.throws(() => parseRoadMap(merge), /Simultaneous GREEN merges/);
});

test('structural field errors retain a validated object ID without executing accessors', () => {
  const map = mutableMap();
  map.lanes[0].widthM = NaN;
  assert.throws(
    () => parseRoadMap(map),
    (error) =>
      error instanceof MapValidationError &&
      error.path === 'map.lanes[0].widthM' &&
      error.id === 'lane-a',
  );
});
