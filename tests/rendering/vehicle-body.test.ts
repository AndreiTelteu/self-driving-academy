import assert from 'node:assert/strict';
import test from 'node:test';
import {
  taxiRoofSign,
  vehicleBodyPlan,
  vehiclePaintHash,
  vehiclePaintMultiplier,
} from '../../src/rendering/vehicle-body';
import { VEHICLE_CLASSES } from '../../src/vehicles';

const IDS = ['taxi-01', 'civil-01', 'civil-02', 'civil-03', 'civil-04'] as const;

test('paint multiplier is deterministic per id and distinct across ids', () => {
  const palette = new Map<string, readonly number[]>();
  for (const id of IDS) {
    const paint = vehiclePaintMultiplier('sedan', id, 'CIVILIAN');
    assert.ok(paint.every((channel) => channel >= 0 && channel <= 1));
    const key = paint.join(',');
    assert.ok(!palette.has(key), `duplicate civilian paint for ${id}`);
    palette.set(key, paint);
  }
  assert.equal(vehiclePaintMultiplier('sedan', 'taxi-01', 'TAXI')[0], 0.92);
  assert.equal(vehiclePaintMultiplier('compact', 'taxi-01', 'TAXI')[0], 0.92);
});

test('paint hash is stable and independent of class', () => {
  assert.equal(vehiclePaintHash('civil-01'), vehiclePaintHash('civil-01'));
  assert.notEqual(vehiclePaintHash('civil-01'), vehiclePaintHash('civil-02'));
});

test('body plan stays inside the PBI 023 collider envelope plus presentation allowance', () => {
  for (const classId of ['sedan', 'compact'] as const) {
    for (const lod of ['NEAR', 'MID', 'FAR'] as const) {
      const plan = vehicleBodyPlan(classId, lod, 'test', 'CIVILIAN');
      assert.equal(plan.classId, classId);
      assert.equal(plan.lod, lod);
      assert.ok(plan.sections.length >= 4);
      assert.ok(plan.wheelArches.length === 4);
      const mechanical = VEHICLE_CLASSES[classId].wheels;
      for (const arch of plan.wheelArches) {
        assert.ok(Math.abs(arch.x) <= mechanical.trackM / 2 + 1e-9);
        assert.ok(Math.abs(arch.z) <= mechanical.wheelbaseM / 2 + 1e-9);
        assert.equal(arch.radiusM, mechanical.radiusM);
      }
      for (const section of plan.sections) {
        assert.ok(section.halfWidth <= 0.9, `${classId} halfWidth ${section.halfWidth}`);
        assert.ok(section.roofY <= 1.15, `${classId} roofY ${section.roofY}`);
        assert.ok(section.rockerY >= -0.1, `${classId} rockerY ${section.rockerY}`);
      }
    }
  }
});

test('taxi roof sign is a BODY panel with a light colour', () => {
  for (const classId of ['sedan', 'compact'] as const) {
    const sign = taxiRoofSign(classId);
    assert.equal(sign.group, 'BODY');
    assert.ok(sign.colour[0] > 0.9 && sign.colour[1] > 0.9 && sign.colour[2] > 0.8);
    assert.ok(sign.center[1] > 0.9, 'sign sits above the roof');
  }
});

test('FAR LOD keeps no panels and only the shell silhouette', () => {
  for (const classId of ['sedan', 'compact'] as const) {
    const far = vehicleBodyPlan(classId, 'FAR', 'test', 'CIVILIAN');
    assert.equal(far.panels.length, 0);
    assert.ok(far.sections.length >= 4);
  }
});
