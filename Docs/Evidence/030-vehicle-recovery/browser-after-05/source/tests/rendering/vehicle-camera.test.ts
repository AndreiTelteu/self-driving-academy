import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VehicleCameraController, type CameraTarget } from '../../src/rendering/vehicle-camera';
import { resolveCameraObstacles } from '../../src/rendering/camera-collision';
const preferences = { mode: 'CHASE' as const, fovDegrees: 80, motion: 50, distanceM: 6 };
function target(entityId = 'a', x = 0, speedMps = 0): CameraTarget {
  return Object.freeze({
    entityId,
    incarnation: 'first',
    speedMps,
    driverEyeM: Object.freeze({ x: -0.35, y: 1.15, z: 0.2 }),
    transform: Object.freeze({
      positionM: Object.freeze({ x, y: 0, z: 0 }),
      rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
    }),
  });
}
test('selection changes only camera, target identity is independent of authority', () => {
  const controller = new VehicleCameraController(preferences),
    a = target(),
    b = target('b', 100);
  const authority = JSON.stringify([a, b]);
  controller.select('a');
  assert.equal(controller.update(a, 1 / 60)!.positionM.z, -6);
  controller.select('b');
  assert.equal(controller.update(b, 1 / 60)!.positionM.x, 100);
  assert.equal(controller.update(a, 1 / 60), null);
  assert.equal(JSON.stringify([a, b]), authority);
  controller.select(null);
  assert.equal(controller.update(b, 1 / 60), null);
});
test('damping is time-based, stable zero-motion and speed-dependent distance brakes inward', () => {
  const create = () => {
    const c = new VehicleCameraController(preferences);
    c.select('a');
    c.update(target(), 0);
    return c;
  };
  const a = create(),
    b = create();
  const moved = target('a', 10, 40);
  const one = a.update(moved, 0.1)!;
  b.update(moved, 0.05);
  const two = b.update(moved, 0.05)!;
  assert(Math.abs(one.positionM.x - two.positionM.x) < 1e-12);
  assert(one.positionM.x > 0 && one.positionM.x < 10);
  assert(one.positionM.z < -6);
  a.setPreferences({ ...preferences, motion: 0 });
  const fast = a.update(moved, 1 / 60)!;
  const brake = a.update(target('a', 10, 0), 1 / 60)!;
  assert.equal(fast.positionM.z, -9.2);
  assert.equal(brake.positionM.z, -6);
  a.setPreferences({ ...preferences, motion: 0, distanceM: 15 });
  assert.equal(a.update(target(), 0)!.positionM.z, -15);
});
test('driver eye is inside cabin and follows turn/roll exactly with adjustable FOV', () => {
  const c = new VehicleCameraController({
    ...preferences,
    mode: 'FIRST_PERSON',
    motion: 0,
    fovDegrees: 100,
  });
  c.select('a');
  const t = target(),
    before = JSON.stringify(t),
    first = c.update(t, 1 / 60)!;
  assert.deepEqual(first.positionM, t.driverEyeM);
  assert.equal(first.fovRadians, (100 * Math.PI) / 180);
  const turned = {
    ...t,
    transform: {
      ...t.transform,
      rotationQuaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
    },
  };
  const pose = c.update(turned, 1 / 60)!;
  assert(Math.abs(pose.positionM.x - 0.2) < 1e-12);
  assert(Math.abs(pose.positionM.z - 0.35) < 1e-12);
  assert(Math.abs(pose.lookAtM.x - pose.positionM.x - 1) < 1e-12);
  assert.equal(JSON.stringify(t), before);
});
test('look clamps and recenter, reuse resets visual damping and look', () => {
  const c = new VehicleCameraController(preferences);
  c.select('a');
  c.update(target(), 0);
  c.look(100000, 100000);
  assert(c.lookAngles.yaw < Math.PI);
  assert(c.lookAngles.pitch > -Math.PI / 2);
  c.recenter();
  assert.deepEqual(c.lookAngles, { yaw: 0, pitch: 0 });
  c.look(100, 100);
  const reused = { ...target('a', 100), incarnation: 'second' };
  assert.equal(c.update(reused, 0)!.positionM.x, 100);
  assert.equal(c.lookAngles.yaw, 0);
  assert.equal(c.toggleMode(), 'FIRST_PERSON');
  assert.equal(c.toggleMode(), 'CHASE');
});
test('expanded-AABB sphere sweep prevents thin-wall tunneling and corrects start penetration', () => {
  const box = { min: { x: -3, y: -3, z: -4 }, max: { x: 3, y: 4, z: -3.9 } };
  const hit = resolveCameraObstacles({ x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: -10 }, 0.2, [box])!;
  assert(hit.z > -3.7);
  assert(hit.z < 0);
  const inside = resolveCameraObstacles({ x: 0, y: 1, z: -4 }, { x: 0, y: 1, z: -4 }, 0.2, [box])!;
  assert(inside.z <= -4.2 || inside.z >= -3.7);
  assert.deepEqual(
    resolveCameraObstacles({ x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: -10 }, 0.2, [box]),
    { x: 10, y: 0, z: -10 },
  );
});
test('collision correction runs after damping and on motion path, fail-safe and invalid input', () => {
  const c = new VehicleCameraController(preferences);
  c.select('a');
  let calls = 0;
  const sweep = (
    _from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ) => {
    calls++;
    return { ...to, z: Math.max(-2, to.z) };
  };
  assert.equal(c.update(target(), 1 / 60, sweep)!.positionM.z, -2);
  c.update(target('a', 2), 1 / 60, sweep);
  assert.equal(calls, 3);
  assert.equal(
    c.update(target(), 1 / 60, () => null),
    null,
  );
  assert.throws(() => c.update(target(), NaN));
  assert.throws(() => c.setPreferences({ ...preferences, fovDegrees: 101 }));
  assert.throws(() => c.look(NaN, 0));
  assert.throws(() => c.update({ ...target(), speedMps: Infinity }, 0));
});
