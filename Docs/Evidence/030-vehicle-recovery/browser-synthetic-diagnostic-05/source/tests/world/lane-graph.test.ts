import assert from 'node:assert/strict';
import test from 'node:test';
import { createLaneGraph } from '../../src/world/lane-graph';
import type { LaneLocationQuery } from '../../src/world/lane-graph';
import { minimalMap } from './fixture';
import { mutableMap, twoMovements } from './negative-fixtures';
import { laneGraphRing } from './lane-graph-fixture';
const query = (x: number, z: number, headingRad?: number): LaneLocationQuery => ({
  positionM: { x, y: 0, z },
  access: 'TAXI',
  ...(headingRad === undefined ? {} : { headingRad }),
});
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('one-way topology never invents reverse edges or undeclared turns', () => {
  const graph = createLaneGraph(twoMovements());
  assert.deepEqual(
    graph.getSuccessors('lane-a', 'TAXI').map((l) => l.id),
    ['lane-b'],
  );
  assert.equal(graph.canTraverse('lane-b', 'lane-a', 'TAXI'), false);
  assert.equal(graph.canTraverse('lane-a', 'lane-b2', 'TAXI'), false);
  assert.deepEqual(
    graph.getTurnConnections('lane-a', 'TAXI').map((e) => e.movement?.id),
    ['move'],
  );
  assert.equal(graph.getConnections('lane-b', 'TAXI')[0].kind, 'CONTINUATION');
  assert.equal(graph.getConnections('lane-b', 'TAXI')[0].movement, null);
  assert.equal(graph.getTurnConnections('lane-b', 'TAXI').length, 0);
});

test('parallel neighbors and all edges respect source/destination access classes', () => {
  const map = twoMovements();
  map.lanes[0].neighbors.left = 'lane-a2';
  map.lanes[3].neighbors.right = 'lane-a';
  map.lanes[3].access = ['TAXI'];
  map.lanes[4].access = ['TAXI'];
  const graph = createLaneGraph(map);
  assert.equal(graph.getNeighbors('lane-a', 'TAXI').left?.id, 'lane-a2');
  assert.equal(graph.getNeighbors('lane-a2', 'TAXI').right?.id, 'lane-a');
  assert.equal(graph.getNeighbors('lane-a', 'CIVIL').left, null);
  assert.deepEqual(graph.getSuccessors('lane-a2', 'CIVIL'), []);
  assert.equal(graph.canTraverse('lane-c', 'lane-a2', 'CIVIL'), false);
  assert.equal(graph.canTraverse('lane-c', 'lane-a2', 'TAXI'), true);
  assert.equal(graph.getTurnConnections('lane-a2', 'CIVIL').length, 0);
  assert.equal(graph.getLane('lane-a2', 'CIVIL'), null);
  assert.equal(graph.locateLane({ ...query(5, 0.56), access: 'TAXI' })?.lane.id, 'lane-a2');
  assert.equal(graph.locateLane({ ...query(5, 0.56), access: 'CIVIL' })?.lane.id, 'lane-a');
});

test('REVERSE reverses geometry, direction, progress and allowed successors', () => {
  const graph = createLaneGraph(laneGraphRing(4, true));
  const path = graph.getDirectedPath('lane-0')!;
  assert.deepEqual(path.nodeIds, ['node-1', 'node-0']);
  const a = path.points[0],
    b = path.points[1],
    p = { x: (a.x + b.x) / 2, y: 0, z: (a.z + b.z) / 2 };
  const heading = Math.atan2(b.z - a.z, b.x - a.x);
  const hit = graph.projectOnLane('lane-0', { positionM: p, access: 'TAXI', headingRad: heading })!;
  near(hit.longitudinalM, path.lengthM / 2);
  near(hit.segmentFraction, 0.5);
  assert.equal(
    graph.projectOnLane('lane-0', {
      positionM: p,
      access: 'TAXI',
      headingRad: Math.atan2(a.z - b.z, a.x - b.x),
    }),
    null,
  );
  assert.deepEqual(
    graph.getSuccessors('lane-0', 'TAXI').map((l) => l.id),
    ['lane-3'],
  );
  assert.equal(graph.canTraverse('lane-0', 'lane-1', 'TAXI'), false);
});

test('current lane uses directed polyline projection/width/height and no meshes; off-graph remains null', () => {
  const graph = createLaneGraph(minimalMap());
  const hit = graph.locateLane(query(4, 0.5, 0))!;
  assert.equal(hit.lane.id, 'lane-a');
  near(hit.longitudinalM, 4);
  near(hit.lateralOffsetM!, 0.5);
  near(hit.distanceM, 0.5);
  assert.equal(graph.projectOnLane('lane-a', query(4, 1.75, 0))?.lane.id, 'lane-a');
  assert.equal(graph.projectOnLane('lane-a', query(4, 1.751, 0)), null);
  assert.equal(graph.projectOnLane('lane-a', query(-0.01, 0)), null);
  assert.equal(graph.projectOnLane('lane-a', query(9.01, 0)), null);
  assert.equal(graph.locateLane(query(4, 0, Math.PI)), null);
  assert.equal(graph.locateLane(query(100, 100)), null);
  assert.equal(
    graph.projectOnLane('lane-a', { ...query(4, 0), positionM: { x: 4, y: 1.51, z: 0 } }),
    null,
  );
  assert.equal(
    graph.projectOnLane('lane-a', { ...query(4, 0), positionM: { x: 4, y: 1.5, z: 0 } })
      ?.heightOffsetM,
    1.5,
  );
  const curve = graph.projectOnLane('lane-c', query(20, 10, Math.PI / 2))!;
  near(curve.longitudinalM, 10);
  near(curve.segmentFraction, 0.5);
});

test('intersection gaps do not fabricate lanes from movement or visual geometry', () => {
  const graph = createLaneGraph(minimalMap());
  assert.equal(graph.locateLane(query(10, 0, 0)), null);
  assert.equal(graph.getTurnConnections('lane-a', 'TAXI')[0].movement?.geometryId, 'g-move');
});

test('deterministic ambiguity ties ignore lane input order; heading disambiguates', () => {
  const map = mutableMap();
  const position = { x: 0, y: 0, z: 0 };
  const a = createLaneGraph(map).locateLane({ positionM: position, access: 'TAXI' })!;
  map.lanes.reverse();
  const b = createLaneGraph(map).locateLane({ positionM: position, access: 'TAXI' })!;
  assert.equal(a.lane.id, 'lane-a');
  assert.equal(b.lane.id, a.lane.id);
  assert.equal(
    createLaneGraph(map).locateLane({
      positionM: position,
      access: 'TAXI',
      headingRad: (-3 * Math.PI) / 4,
    })?.lane.id,
    'lane-c',
  );
});

test('owned graph data/projections are frozen and unaffected by caller mutations', () => {
  const map = mutableMap(),
    graph = createLaneGraph(map);
  map.lanes[0].successorIds = [];
  map.geometry.nodes[0].positionM.x = 100;
  assert.equal(graph.canTraverse('lane-a', 'lane-b', 'TAXI'), true);
  assert.equal(graph.getDirectedPath('lane-a')!.points[0].x, 0);
  const hit = graph.locateLane(query(4, 0))!;
  assert.ok(Object.isFrozen(graph));
  assert.ok(Object.isFrozen(hit));
  assert.ok(Object.isFrozen(hit.positionM));
  assert.ok(Object.isFrozen(graph.getDirectedPath('lane-a')!.points));
  assert.throws(() => {
    (hit.positionM as { x: number }).x = 5;
  }, TypeError);
  assert.equal(graph.locateLane(query(4, 0))!.positionM.x, 4);
  assert.equal(graph.getStats().lanes, 3);
});

test('unknown IDs return empty results; invalid queries/maps/classes fail before execution', () => {
  const graph = createLaneGraph(minimalMap());
  assert.equal(graph.getLane('missing'), null);
  assert.equal(graph.getDirectedPath('missing'), null);
  assert.deepEqual(graph.getNeighbors('missing', 'TAXI'), { left: null, right: null });
  assert.deepEqual(graph.getConnections('missing', 'TAXI'), []);
  assert.equal(graph.canTraverse('missing', 'lane-a', 'TAXI'), false);
  assert.equal(graph.projectOnLane('missing', query(0, 0)), null);
  for (const bad of [NaN, Infinity, -Infinity])
    assert.throws(() => graph.locateLane(query(bad, 0)));
  assert.throws(() => graph.locateLane({ ...query(0, 0), headingRad: 4 }));
  assert.throws(() => graph.locateLane({ ...query(0, 0), maxHeadingErrorRad: Math.PI }));
  assert.throws(() => graph.locateLane({ ...query(0, 0), maxHeightDifferenceM: -1 }));
  assert.throws(() => graph.getSuccessors('lane-a', 'BUS' as 'TAXI'));
  const bad = mutableMap();
  bad.lanes[0].successorIds = ['missing'];
  assert.throws(() => createLaneGraph(bad));
});

test('schema-size ring remains finite and loop-safe without recursive graph traversal', () => {
  const graph = createLaneGraph(laneGraphRing(2048));
  assert.equal(graph.getStats().lanes, 2048);
  assert.equal(graph.getStats().segments, 2048);
  assert.equal(graph.getStats().connections, 2048);
  assert.ok(graph.getStats().spatialReferences <= 32768);
  let lane = 'lane-0';
  for (let i = 0; i < 2048; i++) lane = graph.getSuccessors(lane, 'TAXI')[0].id;
  assert.equal(lane, 'lane-0');
  const path = graph.getDirectedPath('lane-777')!,
    a = path.points[0],
    b = path.points[1];
  assert.equal(
    graph.locateLane({
      positionM: { x: (a.x + b.x) / 2, y: 0, z: (a.z + b.z) / 2 },
      access: 'TAXI',
      headingRad: Math.atan2(b.z - a.z, b.x - a.x),
    })?.lane.id,
    'lane-777',
  );
});

test('height and slope distinguish an overpass from overlapping planar geometry', () => {
  const map = mutableMap();
  map.bounds.maxM.y = 5;
  map.geometry.nodes.push({ id: 'bridge-top', positionM: { x: 4.5, y: 5, z: 0 } });
  map.geometry.paths.push({ id: 'bridge-path', nodeIds: ['n-a', 'bridge-top', 'n-b'] });
  map.lanes.push({
    ...structuredClone(map.lanes[0]),
    id: 'lane-bridge',
    geometryId: 'bridge-path',
  });
  map.lanes[2].successorIds.push('lane-bridge');
  map.intersections[0].incomingLaneIds.push('lane-bridge');
  map.intersections[0].movements.push({
    id: 'bridge-move',
    geometryId: 'g-move',
    fromLaneId: 'lane-bridge',
    toLaneId: 'lane-b',
    conflictZoneIds: ['conflict'],
  });
  for (const phase of map.signals[0].phases)
    phase.movementStates.push({ movementId: 'bridge-move', state: 'RED' });
  const graph = createLaneGraph(map);
  assert.equal(
    graph.locateLane({ positionM: { x: 4.5, y: 0, z: 0 }, access: 'TAXI' })?.lane.id,
    'lane-a',
  );
  assert.equal(
    graph.locateLane({ positionM: { x: 4.5, y: 5, z: 0 }, access: 'TAXI' })?.lane.id,
    'lane-bridge',
  );
  const hit = graph.projectOnLane('lane-bridge', {
    positionM: { x: 2.25, y: 2.5, z: 0 },
    access: 'TAXI',
    headingRad: 0,
  })!;
  near(hit.positionM.y, 2.5);
  near(hit.longitudinalM, Math.hypot(4.5, 5) / 2);
});

test('bounded index matches exhaustive projection and oversized geometry always uses complete fallback', () => {
  for (const size of [3, 32]) {
    const map = laneGraphRing(size),
      graph = createLaneGraph(map);
    if (size === 3) assert.ok(graph.getStats().fallbackLanes > 0);
    for (const lane of map.lanes) {
      const path = graph.getDirectedPath(lane.id)!,
        a = path.points[0],
        b = path.points[1];
      for (const offset of [0, 0.7, 3]) {
        const dx = b.x - a.x,
          dz = b.z - a.z,
          length = Math.hypot(dx, dz);
        const q: LaneLocationQuery = {
          positionM: {
            x: (a.x + b.x) / 2 - (offset * dz) / length,
            y: 0,
            z: (a.z + b.z) / 2 + (offset * dx) / length,
          },
          access: 'TAXI',
          headingRad: Math.atan2(dz, dx),
        };
        const all = map.lanes.map((l) => graph.projectOnLane(l.id, q)).filter((p) => p !== null);
        all.sort(
          (a, b) =>
            a.distanceM - b.distanceM ||
            (a.headingErrorRad ?? 0) - (b.headingErrorRad ?? 0) ||
            (a.lane.id < b.lane.id ? -1 : a.lane.id > b.lane.id ? 1 : 0) ||
            a.segmentIndex - b.segmentIndex,
        );
        assert.deepEqual(graph.locateLane(q), all[0] ?? null);
      }
    }
  }
});

test('spatial reference capacity falls back without dropping a permitted lane', () => {
  const map = laneGraphRing(3) as ReturnType<typeof mutableMap>;
  map.geometry.nodes[0].positionM = { x: 0, y: 0, z: 0 };
  map.geometry.nodes[1].positionM = { x: 400, y: 0, z: 400 };
  map.geometry.nodes[2].positionM = { x: 800, y: 0, z: 0 };
  for (const [i, point] of [
    [-2, -2],
    [2, -2],
    [2, 2],
    [-2, 2],
  ].entries())
    map.geometry.nodes[3 + i].positionM = { x: point[0], y: 0, z: point[1] };
  const originals = map.lanes;
  map.lanes = Array.from({ length: 384 }, (_, i) => ({
    ...structuredClone(originals[i % 3]),
    id: `duplicate-${i}`,
    access: ['TAXI'],
    successorIds: [`duplicate-${(i + 1) % 384}`],
  }));
  map.lanes[383].access = ['TAXI', 'CIVIL'];
  map.serviceZones[0].laneId = 'duplicate-0';
  map.serviceZones[0].access = ['TAXI'];
  const graph = createLaneGraph(map);
  assert.ok(graph.getStats().spatialReferences <= 32768);
  assert.ok(graph.getStats().fallbackLanes > 0);
  assert.equal(graph.getStats().geometryVariants, 3);
  assert.equal(graph.getStats().uniqueSegments, 3);
  assert.equal(
    graph.getDirectedPath('duplicate-0')!.points,
    graph.getDirectedPath('duplicate-3')!.points,
  );
  assert.equal(
    graph.locateLane({ positionM: { x: 400, y: 0, z: 0 }, access: 'CIVIL', headingRad: Math.PI })
      ?.lane.id,
    'duplicate-383',
  );
});
