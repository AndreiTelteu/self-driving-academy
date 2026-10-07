import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { SEDAN } from '../../src/vehicles/physics';
import { VEHICLE_CLASSES, vehicleClass, tractiveForceN } from '../../src/vehicles/vehicle-classes';
import { measureVehicle } from './vehicle-class-fixture';
import { parseControlPreferences } from '../../src/settings';

test('mechanical catalog is immutable/versioned and excluded from player preferences', () => {
  assert(Object.isFrozen(VEHICLE_CLASSES));
  for (const config of Object.values(VEHICLE_CLASSES)) {
    assert(Object.isFrozen(config) && Object.isFrozen(config.wheels));
    assert.equal(
      config.turningRadiusM,
      config.wheels.wheelbaseM / Math.tan(config.steeringRadians),
    );
    assert.equal(tractiveForceN(config, 0), config.engineForceN);
    assert.equal(tractiveForceN(config, 40), config.powerW / 40);
    assert.equal(tractiveForceN(config, -40), config.powerW / 40);
  }
  assert.throws(() => vehicleClass('unknown' as 'sedan'), /Unknown/);
  assert.throws(() => vehicleClass('sedan', 'wrong' as '023-mechanics-v1'), /Unknown/);
  assert.throws(() => parseControlPreferences({ massKg: 1100 }), /contract/i);
});

test('two actual Rapier classes differ in acceleration, braking and same-flat-scene turning', async () => {
  const sedan = await measureVehicle(VEHICLE_CLASSES.sedan);
  const compact = await measureVehicle(VEHICLE_CLASSES.compact);
  assert(compact.accelerationSpeedMps > sedan.accelerationSpeedMps * 1.15);
  assert(compact.brakingDistanceM < sedan.brakingDistanceM * 0.95);
  assert(Math.abs(compact.turnXM - sedan.turnXM) > 0.5);
  const legacy = await measureVehicle(SEDAN);
  assert(Math.abs(legacy.accelerationSpeedMps - 13.525297164916992) < 1e-6);
  assert(Math.abs(legacy.brakingDistanceM - 24.235017776489258) < 1e-6);
  assert(Math.abs(legacy.turnXM - 14.178452491760254) < 1e-6);
});

test('Rapier native mass, wheel geometry and controls match classes including orientation and power caps', async () => {
  const world = await createRapierProbe();
  try {
    for (const config of Object.values(VEHICLE_CLASSES)) {
      world.addClassCar(
        config.classId,
        { x: config.classId === 'sedan' ? 0 : 10, y: 0.8, z: 0 },
        config.classId,
      );
      const state = world.readVehicleMechanics(config.classId);
      assert(Math.abs(state.massKg - config.massKg) < 0.01);
      assert.equal(state.classId, config.classId);
      for (const key of ['radiusM', 'wheelbaseM', 'trackM'] as const)
        assert(Math.abs(state.wheels[key] - config.wheels[key]) < 1e-6);
      assert(Math.abs(state.grip - config.grip) < 1e-6);
    }
    for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
    const token = world.bodyIdentity('sedan')!;
    const pose = world.readBody(token).transform;
    world.setPose(token, {
      ...pose,
      rotationQuaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
    });
    world.setVelocity('sedan', { x: 40, y: 0, z: 0 });
    const inputs = new Map([['sedan', { throttle: 1, brake: 0, steering: 0.5 }]]);
    world.step(inputs, false);
    const mechanics = world.readVehicleMechanics('sedan');
    const force = mechanics.appliedEngineForceN.reduce((a, b) => a + b, 0);
    assert(force > 2100 && force < 2400, `Rotated longitudinal power cap: ${force}`);
    assert(Math.abs(mechanics.appliedSteeringRadians[0]! - 0.225) < 1e-6);
    assert(Object.isFrozen(mechanics) && Object.isFrozen(mechanics.wheels));
    world.setVelocity('sedan', { x: -40, y: 0, z: 0 });
    world.step(new Map([['sedan', { throttle: -1, brake: 0, steering: 0 }]]), false);
    const reverseForce = world
      .readVehicleMechanics('sedan')
      .appliedEngineForceN.reduce((a, b) => a + b, 0);
    assert(reverseForce < -2100 && reverseForce > -2400);
    const before = world.counts();
    assert.throws(
      () => world.addClassCar('bad', { x: 0, y: 0.8, z: 0 }, 'bad' as 'sedan'),
      /Unknown/,
    );
    assert.throws(
      () => world.addCar('bad', { x: 0, y: 0.8, z: 0 }, { ...SEDAN, powerW: NaN }),
      /Invalid/,
    );
    assert.deepEqual(world.counts(), before);
  } finally {
    world.dispose();
  }
});

test('20 mixed-class lifecycle cycles preserve vehicle and subscription caps, remove/recreate cleanup', async () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const world = await createRapierProbe();
    for (let i = 0; i < 110; i++) {
      const id = `car-${i}`;
      world.addClassCar(
        id,
        { x: (i % 11) * 4, y: 0.8, z: Math.floor(i / 11) * 5 },
        i % 2 ? 'compact' : 'sedan',
      );
      const token = world.bodyIdentity(id)!;
      for (let subscription = 0; subscription < 8; subscription++)
        world.subscribeBody(token, () => {});
    }
    assert.deepEqual(world.counts(), { vehicles: 110, bodies: 110, colliders: 111 });
    assert.deepEqual(world.bodyResources(), { entities: 110, subscriptions: 880 });
    assert.throws(() => world.addClassCar('overflow', { x: 0, y: 0, z: 0 }, 'compact'), /capacity/);
    world.step(new Map(), false);
    world.publishBodies(1, false);
    for (let i = 0; i < 110; i++) world.removeBody(world.bodyIdentity(`car-${i}`)!);
    assert.deepEqual(world.counts(), { vehicles: 0, bodies: 0, colliders: 1 });
    assert.deepEqual(world.bodyResources(), { entities: 0, subscriptions: 0 });
    world.dispose();
    world.dispose();
  }
});
