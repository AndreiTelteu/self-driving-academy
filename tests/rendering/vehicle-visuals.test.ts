import assert from 'node:assert/strict';
import test from 'node:test';
import { VEHICLE_CLASSES, VEHICLE_CLASS_VERSION } from '../../src/vehicles';
import {
  RENDER_ASSET_CAPS,
  checkAssetManifest,
  VEHICLE_CONNECTION_Y_M,
  VEHICLE_COLLISION_HALF_EXTENTS_M,
  VEHICLE_LOD_LEVELS,
  VEHICLE_REST_SPRING_M,
  VEHICLE_WHEEL_IDS,
  VEHICLE_VISUAL_VERSION,
  buildVehicleGeometry,
  selectVehicleLod,
  vehicleAssetBudget,
  vehicleAssetInventory,
  vehicleAssetManifest,
  vehicleDrawCalls,
  vehicleVisualAlignment,
  vehicleVisualClass,
  visibleGroupsFor,
} from '../../src/rendering';

const CLASSES = ['sedan', 'compact'] as const;

test('vehicle pivots match the PBI 023 mechanical classes (track/wheelbase/radius/rest pose)', () => {
  const issues = vehicleVisualAlignment({
    sedan: VEHICLE_CLASSES.sedan.wheels,
    compact: VEHICLE_CLASSES.compact.wheels,
  });
  assert.deepEqual(issues, []);
  for (const classId of CLASSES) {
    const mechanical = VEHICLE_CLASSES[classId];
    const visual = vehicleVisualClass(classId);
    assert.equal(visual.version, VEHICLE_VISUAL_VERSION);
    assert.equal(visual.mechanicalVersion, VEHICLE_CLASS_VERSION);
    assert.equal(visual.wheelPivots.length, 4);
    assert.deepEqual(
      visual.wheelPivots.map((pivot) => pivot.wheelId),
      [...VEHICLE_WHEEL_IDS],
    );
    for (const pivot of visual.wheelPivots) {
      assert.equal(
        Math.abs(pivot.x),
        mechanical.wheels.trackM / 2,
        `${classId}/${pivot.wheelId} track`,
      );
      assert.equal(
        Math.abs(pivot.z),
        mechanical.wheels.wheelbaseM / 2,
        `${classId}/${pivot.wheelId} wheelbase`,
      );
      assert.equal(pivot.radiusM, mechanical.wheels.radiusM);
      assert.equal(pivot.y, VEHICLE_CONNECTION_Y_M - VEHICLE_REST_SPRING_M);
      assert.equal(pivot.steering, pivot.wheelId.startsWith('front'));
      // +Z is forward, +X is right for every class.
      assert.equal(pivot.x < 0, pivot.wheelId.endsWith('left'));
      assert.equal(pivot.z > 0, pivot.wheelId.startsWith('front'));
    }
    assert.equal(
      visual.wheelBottomM,
      VEHICLE_CONNECTION_Y_M - VEHICLE_REST_SPRING_M - mechanical.wheels.radiusM,
    );
  }
});

test('LOD selection uses the declared distances, five-metre hysteresis and validates input', () => {
  assert.equal(selectVehicleLod(10, null, 'LOW'), 'NEAR');
  assert.equal(selectVehicleLod(45, null, 'LOW'), 'MID');
  assert.equal(selectVehicleLod(80, null, 'LOW'), 'FAR');
  // A NEAR vehicle keeps its detail up to +5 m past the threshold, then switches.
  assert.equal(selectVehicleLod(32, 'NEAR', 'LOW'), 'NEAR');
  assert.equal(selectVehicleLod(36, 'NEAR', 'LOW'), 'MID');
  assert.equal(selectVehicleLod(66, 'MID', 'LOW'), 'MID');
  assert.equal(selectVehicleLod(76, 'MID', 'LOW'), 'FAR');
  assert.equal(selectVehicleLod(76, 'FAR', 'LOW'), 'FAR');
  // Preset separation: HIGH keeps detail farther than LOW.
  assert.equal(selectVehicleLod(39, null, 'HIGH'), 'NEAR');
  assert.equal(selectVehicleLod(39, null, 'LOW'), 'MID');
  assert.throws(() => selectVehicleLod(-1, null, 'LOW'), RangeError);
  assert.throws(() => selectVehicleLod(10, null, 'ULTRA' as 'LOW'), RangeError);
  assert.throws(() => selectVehicleLod(10, null, 'LOW', -1), RangeError);
});

test('LOD changes detail groups only: collider envelope, identity fields and pivots stay fixed', () => {
  for (const classId of CLASSES) {
    const definition = vehicleVisualClass(classId);
    for (const lod of VEHICLE_LOD_LEVELS) {
      const groups = visibleGroupsFor(classId, lod);
      assert.ok(groups.length >= 1);
      assert.ok(
        groups.every((group) => definition.lods.some((l) => l.visibleGroups.includes(group))),
      );
      assert.equal(definition.collisionHalfExtentsM, VEHICLE_COLLISION_HALF_EXTENTS_M);
      assert.deepEqual(definition.collisionHalfExtentsM, { x: 0.85, y: 0.3, z: 2 });
      // Same pivots for every LOD: only the visible group list changes.
      assert.equal(vehicleVisualClass(classId).wheelPivots.length, 4);
    }
    assert.deepEqual(visibleGroupsFor(classId, 'FAR'), ['BODY']);
    assert.deepEqual(visibleGroupsFor(classId, 'MID'), ['BODY', 'HEADLIGHT', 'TAILLIGHT', 'BRAKE']);
  }
  const base = { headlights: false, brake: false, turn: 'OFF' } as const;
  assert.equal(vehicleDrawCalls('FAR', base), 1);
  assert.equal(vehicleDrawCalls('MID', base), 4);
  assert.equal(vehicleDrawCalls('NEAR', base), 4);
  assert.equal(vehicleDrawCalls('NEAR', { ...base, brake: true }), 5);
  assert.equal(vehicleDrawCalls('NEAR', { ...base, brake: true, turn: 'HAZARD' }), 7);
  assert.ok(
    vehicleDrawCalls('FAR', { ...base, brake: true, turn: 'HAZARD' }) <
      vehicleDrawCalls('NEAR', { ...base, brake: true, turn: 'HAZARD' }),
  );
});

test('geometry is deterministic, LOD-reduced and reports exact GPU bytes', () => {
  for (const classId of CLASSES) {
    for (const lod of VEHICLE_LOD_LEVELS) {
      const first = buildVehicleGeometry(classId, lod);
      const second = buildVehicleGeometry(classId, lod);
      assert.deepEqual(first, second);
      assert.equal(
        first.vertices,
        first.groups.reduce((n, g) => n + g.positions.length / 3, 0),
      );
      assert.equal(
        first.indices,
        first.groups.reduce((n, g) => n + g.indices.length, 0),
      );
      assert.equal(first.gpuBytes, first.vertices * 40 + first.indices * 4);
      for (const group of first.groups) {
        assert.equal(group.positions.length / 3, group.colors.length / 4);
        assert.equal(group.positions.length, group.normals.length);
        assert.ok(group.indices.every((index) => index < group.positions.length / 3));
      }
    }
    const near = buildVehicleGeometry(classId, 'NEAR');
    const mid = buildVehicleGeometry(classId, 'MID');
    const far = buildVehicleGeometry(classId, 'FAR');
    assert.ok(far.vertices < mid.vertices && mid.vertices < near.vertices);
    assert.ok(far.gpuBytes < near.gpuBytes);
    assert.ok(near.wheel && mid.wheel && far.wheel === null);
  }
});

test('the vehicle manifest passes PBI 223 budgets on every preset and rejects overspend', () => {
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const result = vehicleAssetBudget(preset);
    assert.equal(result.accepted, true, JSON.stringify(result.diagnostics));
    assert.equal(result.totals.transferBytes, 0);
    assert.ok(result.totals.geometryGpuBytes > 0);
    assert.ok(result.totals.geometryGpuBytes < RENDER_ASSET_CAPS.geometryGpuBytes);
    assert.equal(result.totals.textureGpuBytes, 0);
    assert.equal(result.totals.shaderVariants, 8);
  }
  const over = vehicleAssetManifest({
    criticalCodeTransferBytes: RENDER_ASSET_CAPS.criticalCodeTransferBytes + 1,
  });
  const rejected = checkAssetManifest(over, 'LOW');
  assert.equal(rejected.accepted, false);
  assert.deepEqual(
    rejected.diagnostics.map((diagnostic) => diagnostic.metric),
    ['criticalCodeTransferBytes'],
  );
});

test('every visual asset is inventoried with an explicit source and licence', () => {
  const inventory = vehicleAssetInventory();
  const manifest = vehicleAssetManifest();
  assert.equal(inventory.length, manifest.assets.length);
  for (const asset of manifest.assets) {
    const entry = inventory.find((candidate) => candidate.id === asset.id);
    assert.ok(entry, `inventory entry for ${asset.id}`);
    assert.equal(entry.version, VEHICLE_VISUAL_VERSION);
    assert.ok(entry.source.trim().length > 0);
    assert.ok(entry.license.trim().length > 0);
    assert.ok(/original|project/i.test(entry.license), `${asset.id} licence is explicit`);
    assert.equal(entry.costBytes, asset.geometryGpuBytes);
  }
});
