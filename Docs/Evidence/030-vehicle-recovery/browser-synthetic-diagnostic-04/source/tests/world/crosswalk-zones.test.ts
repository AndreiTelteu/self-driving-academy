import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCrosswalkZones,
  MAX_HAZARD_OBSERVATIONS,
  type HazardObservation,
} from '../../src/world/crosswalk-zones';
import { minimalMap } from './fixture';
const query = { fromM: { x: 20, y: 0, z: 16 }, toM: { x: 20, y: 0, z: 23 }, laneId: 'lane-c' };
const pedestrian: HazardObservation = {
  entityId: 'person',
  kind: 'PEDESTRIAN',
  positionM: { x: 20, y: 0, z: 20 },
  radiusM: 0.4,
  active: true,
  observable: true,
};
test('swept traversal detects a zone and stop line even when both endpoints are outside', () => {
  const zones = createCrosswalkZones(minimalMap());
  const results = zones.query(query);
  assert.deepEqual(results, [
    {
      zoneId: 'crosswalk',
      crossedStopLineIds: ['cross-stop'],
      observablePedestrianIds: [],
      observableObstacleIds: [],
      hasPedestrianExposure: false,
    },
  ]);
  assert.equal(zones.query({ ...query, laneId: 'lane-a' }).length, 0);
  assert.equal(zones.query({ ...query, laneId: 'absent' }).length, 0);
  assert.equal(
    zones.query({ ...query, fromM: { x: 10, y: 0, z: 16 }, toM: { x: 10, y: 0, z: 23 } }).length,
    0,
  );
  assert.equal(
    zones.query({ ...query, fromM: { x: 20, y: 5, z: 16 }, toM: { x: 20, y: 5, z: 23 } }).length,
    0,
  );
});
test('empty, hidden, inactive or geometrically irrelevant pedestrians create no exposure', () => {
  const zones = createCrosswalkZones(minimalMap());
  for (const observation of [
    { ...pedestrian, active: false },
    { ...pedestrian, observable: false },
    { ...pedestrian, positionM: { x: 20.8, y: 0, z: 20 } },
    { ...pedestrian, positionM: { x: 20, y: 5, z: 20 } },
    { ...pedestrian, positionM: { x: 20, y: 0, z: 22 } },
  ])
    assert.equal(zones.query(query, [observation])[0].hasPedestrianExposure, false);
  assert.equal(zones.query(query, [pedestrian])[0].hasPedestrianExposure, true);
  // No persisted observations from the previous call and no claim of yielding.
  assert.equal(zones.query(query)[0].hasPedestrianExposure, false);
  assert.equal('yielded' in zones.query(query, [pedestrian])[0], false);
});
test('obstacles have separate identities and do not count as pedestrian exposure', () => {
  const result = createCrosswalkZones(minimalMap()).query(query, [
    { ...pedestrian, entityId: 'crate', kind: 'OBSTACLE' },
  ])[0];
  assert.deepEqual(result.observableObstacleIds, ['crate']);
  assert.deepEqual(result.observablePedestrianIds, []);
  assert.equal(result.hasPedestrianExposure, false);
});
test('stationary points, tangential travel and line departure do not duplicate a crossing', () => {
  const zones = createCrosswalkZones(minimalMap());
  const p = { x: 20, y: 0, z: 19 };
  for (const segment of [
    { fromM: p, toM: p },
    { fromM: { x: 18, y: 0, z: 19 }, toM: { x: 22, y: 0, z: 19 } },
    { fromM: p, toM: { x: 20, y: 0, z: 20 } },
  ])
    assert.deepEqual(zones.query(segment)[0].crossedStopLineIds, []);
  assert.deepEqual(zones.query({ fromM: query.fromM, toM: p })[0].crossedStopLineIds, [
    'cross-stop',
  ]);
});
test('concave polygons use their actual footprint rather than bounding boxes', () => {
  const map = structuredClone(minimalMap()) as unknown as {
    geometry: {
      nodes: { id: string; positionM: { x: number; y: number; z: number } }[];
      areas: { id: string; vertexNodeIds: string[] }[];
    };
  };
  const vertices = [
    [19, 18],
    [21, 18],
    [21, 19],
    [20, 19],
    [20, 21],
    [19, 21],
  ];
  const area = map.geometry.areas.find((item) => item.id === 'g-crosswalk')!;
  area.vertexNodeIds = vertices.map(([x, z], i) => {
    const id = `concave-${i}`;
    map.geometry.nodes.push({ id, positionM: { x, y: 0, z } });
    return id;
  });
  const zones = createCrosswalkZones(map);
  assert.equal(
    zones.query({ fromM: { x: 20.5, y: 0, z: 19.5 }, toM: { x: 20.5, y: 0, z: 20.5 } }).length,
    0,
  );
  assert.equal(
    zones.query({ fromM: { x: 19.5, y: 0, z: 19.5 }, toM: { x: 19.5, y: 0, z: 20.5 } }).length,
    1,
  );
});
test('data is owned/frozen; observations remain bounded and input failures are explicit', () => {
  const zones = createCrosswalkZones(minimalMap());
  assert.ok(Object.isFrozen(zones.getZone('crosswalk')!.polygon));
  assert.ok(Object.isFrozen(zones.query(query)[0].crossedStopLineIds));
  assert.equal(zones.getZone('missing'), null);
  assert.deepEqual(zones.getStats(), { zones: 1, laneReferences: 1, retainedObservations: 0 });
  assert.throws(() => zones.query(query, [pedestrian, pedestrian]), /duplicate/);
  assert.throws(
    () => zones.query(query, Array(MAX_HAZARD_OBSERVATIONS + 1).fill(pedestrian)),
    /capacity/,
  );
  assert.throws(() => zones.query({ ...query, heightToleranceM: NaN }));
  assert.throws(() => zones.query(query, [{ ...pedestrian, radiusM: -1 }]));
  assert.throws(() => zones.query({ ...query, fromM: { x: Infinity, y: 0, z: 0 } }));
});

test('capacity retains every relevant observation and never truncates a last pedestrian', () => {
  const zones = createCrosswalkZones(minimalMap());
  const hazards = Array.from({ length: MAX_HAZARD_OBSERVATIONS }, (_, i) => ({
    ...pedestrian,
    entityId: `person-${i}`,
  }));
  const result = zones.query(query, hazards)[0];
  assert.equal(result.observablePedestrianIds.length, MAX_HAZARD_OBSERVATIONS);
  assert.ok(result.observablePedestrianIds.includes(`person-${MAX_HAZARD_OBSERVATIONS - 1}`));
  assert.equal(zones.getStats().retainedObservations, 0);
});
