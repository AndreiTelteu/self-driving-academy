import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIntersectionConflicts,
  INTERSECTION_CONFLICT_LIMITS,
} from '../../src/world/intersection-conflicts';
import { intersectionEnvelopeContact } from '../../src/world/intersection-conflict-geometry';
import { intersectionConflictFixture } from './intersection-conflicts-fixture';
const relation = (kind: 'T' | 'CROSS', a: string, b: string) =>
  createIntersectionConflicts(intersectionConflictFixture(kind)).getRelation('junction', a, b)!;
test('cross separates perpendicular crossing from parallel opposing travel', () => {
  const cross = relation('CROSS', 'west-straight', 'south-straight');
  assert.equal(cross.incompatible, true);
  assert.deepEqual(cross.reasons, ['TRAJECTORY_ENVELOPES']);
  assert.equal(cross.geometricContact!.distanceM, 0);
  assert.deepEqual(cross.geometricContact!.positionA, { x: -2, y: 0, z: -2 });
  assert.equal(cross.priority, null);
  assert.equal(relation('CROSS', 'west-straight', 'east-straight').incompatible, false);
});
test('T crossing, shared entry, and separated turns produce different relations', () => {
  assert.equal(relation('T', 'west-straight', 'south-left').incompatible, true);
  assert.ok(relation('T', 'west-straight', 'west-right').reasons.includes('SHARED_ENTRY'));
  assert.equal(relation('T', 'west-right', 'east-straight').incompatible, false);
});
test('turn merges are explicit semantic conflicts and separated right turns remain compatible', () => {
  assert.ok(relation('CROSS', 'west-left', 'south-straight').reasons.includes('SHARED_EXIT'));
  assert.equal(relation('CROSS', 'west-right', 'north-right').incompatible, false);
});
test('authored conflict zones remain independent from geometry and never imply priority', () => {
  const input = intersectionConflictFixture();
  for (const movement of input.intersections[0].movements)
    if (['west-straight', 'east-straight'].includes(movement.id))
      movement.conflictZoneIds = ['authored-zone'];
  const model = createIntersectionConflicts(input);
  const pair = model.getRelation('junction', 'east-straight', 'west-straight')!;
  assert.equal(pair.incompatible, true);
  assert.deepEqual(pair.reasons, ['SHARED_ZONE']);
  assert.equal(pair.geometricContact, null);
  assert.equal(pair.priority, null);
  assert.deepEqual(model.getZones('junction')[0].declaredMovementIds, [
    'east-straight',
    'west-straight',
  ]);
  assert.equal(model.getZones('junction')[0].polygonM.length, 4);
});
test('stable identities symmetric queries, readonly snapshots and bounded retained state', () => {
  const input = intersectionConflictFixture(),
    model = createIntersectionConflicts(input);
  const first = model.getRelation('junction', 'west-straight', 'south-straight');
  assert.equal(first, model.getRelation('junction', 'south-straight', 'west-straight'));
  input.intersections[0].movements.reverse();
  assert.deepEqual(
    first,
    createIntersectionConflicts(input).getRelation('junction', 'south-straight', 'west-straight'),
  );
  input.geometry.nodes[0].positionM.x = 999;
  assert.equal(model.getMovement('junction', 'west-straight')!.trajectoryM[0].x, -10);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first!.movementIds));
  assert.ok(Object.isFrozen(model.getMovement('junction', 'west-straight')!.trajectoryM));
  const stats = model.getStats();
  for (let i = 0; i < 10000; i++) model.getIncompatible('junction', 'west-straight');
  assert.equal(model.getStats(), stats);
  assert.equal(stats.pairRelations, 21);
  assert.equal(model.getRelation('unknown', 'a', 'b'), null);
  assert.equal(model.getRelation('junction', 'west-straight', 'west-straight'), null);
  assert.deepEqual(model.getIncompatible('junction', 'missing'), []);
});
test('corridor width, tangency, collinear overlap and bridge height are explicit geometric semantics', () => {
  const point = (x: number, z: number, y = 0) => Object.freeze({ x, y, z });
  const a = [point(0, 0), point(10, 0)],
    b = [point(0, 2), point(10, 2)];
  const admit = () => {};
  assert.equal(intersectionEnvelopeContact(a, b, 1.99, 1.5, admit), null);
  assert.equal(intersectionEnvelopeContact(a, b, 2, 1.5, admit)!.distanceM, 2);
  assert.equal(
    intersectionEnvelopeContact(a, [point(5, 0), point(12, 0)], 1, 1.5, admit)!.distanceM,
    0,
  );
  assert.equal(
    intersectionEnvelopeContact(a, [point(5, -5, 5), point(5, 5, 5)], 1, 1.5, admit),
    null,
  );
  assert.ok(intersectionEnvelopeContact(a, [point(5, -5, 1), point(5, 5, 1)], 1, 1.5, admit));
});
test('invalid data/options fail rather than silently dropping semantic conflicts', () => {
  const input = intersectionConflictFixture();
  input.intersections[0].movements[0].toLaneId = 'missing';
  assert.throws(() => createIntersectionConflicts(input));
  assert.throws(() =>
    createIntersectionConflicts(intersectionConflictFixture(), { heightToleranceM: NaN }),
  );
  assert.equal(INTERSECTION_CONFLICT_LIMITS.pairRelations, 65536);
  assert.equal(INTERSECTION_CONFLICT_LIMITS.segmentComparisons, 2_000_000);
});

test('geometry construction budget aborts explicitly on authored pathological paths', () => {
  const input = intersectionConflictFixture('T');
  for (const id of ['west-straight', 'east-straight']) {
    const path = input.geometry.paths.find((p) => p.id === `g-${id}`)!;
    const z = id === 'west-straight' ? -2 : 2;
    const extra = [];
    for (let i = 0; i < 1500; i++) {
      const nodeId = `long-${id}-${i}`;
      input.geometry.nodes.push({
        id: nodeId,
        positionM: { x: i % 2 ? -8 : 8, y: 0, z: z + (i % 3) * 0.01 },
      });
      extra.push(nodeId);
    }
    path.nodeIds.splice(1, 0, ...extra);
  }
  assert.throws(() => createIntersectionConflicts(input), /geometry budget 2000000 exceeded/);
});

test('pair capacity rejects the whole map before quadratic geometry, never truncates conflicts', async () => {
  const { minimalMap } = await import('./fixture');
  const { mutableMap } = await import('./negative-fixtures');
  const input = mutableMap(),
    template = minimalMap();
  input.signals = [];
  input.stopLines = [];
  input.crosswalks = [];
  input.lanes = [structuredClone(input.lanes[2])];
  input.lanes[0].successorIds = [];
  input.intersections = [];
  for (let n = 0; n < 9; n++) {
    const junctionId = `junction-${n}`;
    const junction = structuredClone(
      template.intersections[0],
    ) as (typeof input.intersections)[number];
    junction.id = junctionId;
    junction.conflictZones[0].id = `conflict-${n}`;
    junction.movements = [];
    junction.incomingLaneIds = [];
    junction.outgoingLaneIds = [];
    for (let i = 0; i < 8; i++) {
      const lane = structuredClone(template.lanes[0]) as (typeof input.lanes)[number];
      lane.id = `in-${n}-${i}`;
      lane.toIntersectionId = junctionId;
      lane.successorIds = [];
      junction.incomingLaneIds.push(lane.id);
      input.lanes[0].successorIds.push(lane.id);
      for (let j = 0; j < 16; j++) lane.successorIds.push(`out-${n}-${j}`);
      input.lanes.push(lane);
    }
    for (let j = 0; j < 16; j++) {
      const lane = structuredClone(template.lanes[1]) as (typeof input.lanes)[number];
      lane.id = `out-${n}-${j}`;
      lane.fromIntersectionId = junctionId;
      junction.outgoingLaneIds.push(lane.id);
      input.lanes.push(lane);
    }
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 16; j++)
        junction.movements.push({
          id: `move-${n}-${i}-${j}`,
          geometryId: 'g-move',
          fromLaneId: `in-${n}-${i}`,
          toLaneId: `out-${n}-${j}`,
          conflictZoneIds: [],
        });
    input.intersections.push(junction);
  }
  input.serviceZones[0].laneId = 'in-0-0';
  input.recoveryPoints = [];
  assert.throws(() => createIntersectionConflicts(input), /pair capacity 65536 exceeded/);
});

test('shared authored geometry reuses immutable trajectories and zone arrays', () => {
  const input = intersectionConflictFixture();
  const from = structuredClone(input.lanes.find((l) => l.id === 'west-in')!),
    to = structuredClone(input.lanes.find((l) => l.id === 'east-out')!);
  from.id = 'duplicate-in';
  from.successorIds = ['duplicate-out'];
  to.id = 'duplicate-out';
  input.lanes.push(from, to);
  const junction = input.intersections[0];
  junction.incomingLaneIds.push(from.id);
  junction.outgoingLaneIds.push(to.id);
  junction.movements.push({
    id: 'duplicate',
    geometryId: 'g-west-straight',
    fromLaneId: from.id,
    toLaneId: to.id,
    conflictZoneIds: [],
  });
  junction.conflictZones.push({ id: 'another-zone', geometryId: 'g-junction' });
  const model = createIntersectionConflicts(input);
  assert.equal(
    model.getMovement('junction', 'west-straight')!.trajectoryM,
    model.getMovement('junction', 'duplicate')!.trajectoryM,
  );
  assert.equal(model.getZones('junction')[0].polygonM, model.getZones('junction')[1].polygonM);
  assert.equal(model.getStats().uniqueTrajectoryGeometries, 7);
  assert.equal(model.getStats().uniqueZoneGeometries, 1);
});
