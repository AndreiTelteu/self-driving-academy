import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialIndex, SPATIAL_INDEX_LIMITS } from '../../src/world/spatial-index';
import type { SpatialEntity } from '../../src/world/spatial-index';
import { bruteQuery, spatialFixture } from './spatial-index-reference';
import type { ReferenceEntity } from './spatial-index-reference';

const sphere = (
  id: string,
  x: number,
  y = 0,
  z = 0,
  radiusM = 1,
  incarnation = 1,
): Extract<SpatialEntity, { shape: { type: 'SPHERE' } }> => ({
  id,
  incarnation,
  kind: 'VEHICLE',
  shape: { type: 'SPHERE', centerM: { x, y, z }, radiusM },
});
const ids = (entities: readonly SpatialEntity[]) => entities.map((entity) => entity.id);
test('benchmark query identity sets match the brute oracle outside all timed measurements', () => {
  for (const dense of [false, true]) {
    const index = createSpatialIndex(),
      entities = spatialFixture(dense);
    const live = new Map(entities.map((entity) => [entity.id, entity]));
    for (const entity of entities) index.upsert(entity);
    for (let tick = 0; tick < 40; tick++) {
      const entity = entities[tick % (dense ? 110 : 64)];
      if (entity.shape.type !== 'SPHERE') throw new Error('Invalid fixture');
      if (tick % 30 === 0) {
        live.delete(entity.id);
        index.remove(entity.id, entity.incarnation);
        entity.incarnation++;
      }
      entity.shape.centerM.x = ((tick % 9) - 4) * 32;
      live.set(entity.id, entity);
      index.upsert(entity);
      for (let i = 0; i < (dense ? 110 : 64); i++) {
        const car = entities[i];
        if (car.shape.type !== 'SPHERE') throw new Error('Invalid fixture');
        const query = { centerM: car.shape.centerM, radiusM: 12 };
        assert.deepEqual(ids(index.query(query)), bruteQuery(live.values(), query));
      }
    }
  }
});
test('normal/dense mutable query IDs match exhaustive geometry, including boundaries and overpasses', () => {
  for (const dense of [false, true]) {
    const index = createSpatialIndex(),
      entities = spatialFixture(dense);
    const live = new Map<string, ReferenceEntity>();
    for (const entity of entities) {
      index.upsert(entity);
      live.set(entity.id, entity);
    }
    for (let tick = 0; tick < 300; tick++) {
      const entity = entities[tick % (dense ? 110 : 64)];
      assert.equal(entity.shape.type, 'SPHERE');
      if (entity.shape.type !== 'SPHERE') throw new Error('fixture shape');
      if (tick % 13 === 0) {
        index.remove(entity.id, entity.incarnation);
        live.delete(entity.id);
        entity.incarnation++;
      }
      entity.shape.centerM.x = ((tick % 9) - 4) * 16;
      index.upsert(entity);
      live.set(entity.id, entity);
      const query = {
        centerM: { x: ((tick % 17) - 8) * 8, y: tick % 7 === 0 ? 12 : 0, z: (tick % 11) - 5 },
        radiusM: tick % 19 === 0 ? 1000 : 12,
      };
      assert.deepEqual(ids(index.query(query)), bruteQuery(live.values(), query));
    }
    assert.equal(index.getStats().entities, entities.length);
    assert.ok(index.getStats().fallbackEntities >= 1);
  }
});
test('sphere tangency, negative boundaries, height, kind and exact identity exclusion', () => {
  const index = createSpatialIndex();
  index.upsert(sphere('negative', -16));
  index.upsert(sphere('tangent', 2));
  index.upsert(sphere('bridge', 0, 12));
  index.upsert({ ...sphere('obstacle', 0), kind: 'OBSTACLE' });
  assert.deepEqual(ids(index.query({ centerM: { x: 0, y: 0, z: 0 }, radiusM: 1 })), [
    'obstacle',
    'tangent',
  ]);
  assert.deepEqual(ids(index.query({ centerM: { x: -16, y: 0, z: 0 }, radiusM: 0 })), ['negative']);
  assert.deepEqual(
    ids(
      index.query({
        centerM: { x: 0, y: 0, z: 0 },
        radiusM: 1,
        kinds: ['VEHICLE'],
        exclude: { id: 'tangent', incarnation: 1 },
      }),
    ),
    [],
  );
  assert.deepEqual(
    ids(
      index.query({
        centerM: { x: 0, y: 0, z: 0 },
        radiusM: 1,
        kinds: ['VEHICLE'],
        exclude: { id: 'tangent', incarnation: 0 },
      }),
    ),
    ['tangent'],
  );
});
test('concave prism rejects bounding-box false positives and preserves vertical corner tangencies', () => {
  const index = createSpatialIndex();
  const zone: SpatialEntity = {
    id: 'L',
    incarnation: 1,
    kind: 'ZONE',
    shape: {
      type: 'PRISM',
      minHeightM: 4,
      maxHeightM: 6,
      verticesM: [
        [0, 0],
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 4],
        [0, 4],
      ].map(([x, z]) => ({ x, y: 0, z })),
    },
  };
  index.upsert(zone);
  assert.deepEqual(ids(index.query({ centerM: { x: 3, y: 5, z: 3 }, radiusM: 1 })), []);
  assert.deepEqual(ids(index.query({ centerM: { x: 0.5, y: 3, z: 0.5 }, radiusM: 1 })), ['L']);
  assert.deepEqual(ids(index.query({ centerM: { x: 3, y: 5, z: 3 }, radiusM: 2 })), ['L']);
  assert.deepEqual(ids(index.query({ centerM: { x: 0.5, y: 0, z: 0.5 }, radiusM: 0 })), []);
});
test('moves remove old cells, remove/recreate identity fences and invalid updates are atomic', () => {
  const index = createSpatialIndex();
  const query = { centerM: { x: 0, y: 0, z: 0 }, radiusM: 2 };
  index.upsert(sphere('car', 0));
  index.upsert(sphere('car', 100));
  assert.deepEqual(ids(index.query(query)), []);
  assert.equal(index.remove('car', 0), false);
  assert.equal(index.remove('car', 1), true);
  assert.equal(index.getStats().cells, 0);
  assert.equal(index.getStats().spatialReferences, 0);
  index.upsert(sphere('car', 0, 0, 0, 1, 2));
  assert.equal(index.remove('car', 1), false);
  assert.throws(() => index.upsert(sphere('car', 300, 0, 0, 1, 1)), /Stale/);
  assert.throws(() => index.upsert(sphere('car', NaN, 0, 0, 1, 2)), /numeric/);
  assert.deepEqual(index.get('car'), sphere('car', 0, 0, 0, 1, 2));
});
test('admission rejects before retained allocation; exhausted cell budgets use complete fallback', () => {
  const index = createSpatialIndex({
    maxVehicles: 2,
    maxSpatialReferences: 1,
    maxCellsPerEntity: 1,
    maxQueryCells: 1,
  });
  index.upsert(sphere('a', 0));
  index.upsert(sphere('b', 16));
  const before = index.getStats();
  assert.throws(() => index.upsert(sphere('c', 0)), /admission/);
  assert.deepEqual(index.getStats(), before);
  assert.deepEqual(ids(index.query({ centerM: { x: 8, y: 0, z: 0 }, radiusM: 16 })), ['a', 'b']);
  assert.equal(index.getStats().lastQuery.exhaustive, true);
  assert.equal(index.getStats().fallbackEntities, 2);
  assert.ok(index.getStats().spatialReferences <= 1);
  assert.throws(
    () => createSpatialIndex({ maxVehicles: SPATIAL_INDEX_LIMITS.maxVehicles + 1 }),
    /reduced/,
  );
  assert.throws(() => createSpatialIndex({ toString: 1 } as never), /Unknown/);
});
test('all admitted dense-cell neighbors returned, independent of insertion order', () => {
  const first = createSpatialIndex(),
    second = createSpatialIndex();
  const entities = Array.from({ length: 110 }, (_, i) => sphere(`car-${i}`, 0));
  entities.forEach((entity) => first.upsert(entity));
  entities.reverse().forEach((entity) => second.upsert(entity));
  const query = { centerM: { x: 0, y: 0, z: 0 }, radiusM: 0 };
  assert.deepEqual(first.query(query), second.query(query));
  assert.equal(first.query(query).length, 110);
  assert.equal(first.getStats().lastQuery.candidates, 110);
});
test('ownership snapshots frozen;20 reset/dispose cycles return bounded resources to zero', () => {
  const index = createSpatialIndex();
  const input = sphere('car', 0);
  index.upsert(input);
  if (input.shape.type === 'SPHERE')
    assert.throws(() => {
      const stored = index.get('car')!;
      if (stored.shape.type === 'SPHERE') (stored.shape.centerM as { x: number }).x = 9;
    }, TypeError);
  assert.ok(Object.isFrozen(index.query({ centerM: { x: 0, y: 0, z: 0 }, radiusM: 0 })));
  index.reset();
  for (let i = 0; i < 20; i++) {
    for (const entity of spatialFixture(true)) index.upsert(entity);
    index.reset();
    const stats = index.getStats();
    for (const key of [
      'entities',
      'vehicles',
      'obstacles',
      'zones',
      'zoneVertices',
      'cells',
      'spatialReferences',
      'fallbackEntities',
    ] as const)
      assert.equal(stats[key], 0);
    assert.equal(stats.generation, i + 2);
  }
  index.dispose();
  index.dispose();
  assert.equal(index.getStats().disposed, true);
  assert.throws(() => index.upsert(input), /disposed/);
  assert.throws(() => index.reset(), /disposed/);
  assert.throws(() => index.remove('car', 1), /disposed/);
  assert.throws(() => index.get('car'), /disposed/);
});
test('invalid query and polygon data never mutate ownership', () => {
  const index = createSpatialIndex();
  index.upsert(sphere('car', 0));
  const before = index.getStats();
  for (const value of [NaN, Infinity, -Infinity, -1])
    assert.throws(() => index.query({ centerM: { x: 0, y: 0, z: 0 }, radiusM: value }));
  const invalid = {
    id: 'zone',
    incarnation: 1,
    kind: 'ZONE',
    shape: {
      type: 'PRISM',
      minHeightM: 0,
      maxHeightM: 1,
      verticesM: [
        [0, 0],
        [2, 2],
        [0, 2],
        [2, 0],
      ].map(([x, z]) => ({ x, y: 0, z })),
    },
  } as const;
  assert.throws(() => index.upsert(invalid), /simple|area/);
  assert.deepEqual(index.getStats(), before);
});
