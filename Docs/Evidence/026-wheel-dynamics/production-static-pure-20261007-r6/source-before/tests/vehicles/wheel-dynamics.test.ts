import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { ROAD_SURFACES, roadSurface, VEHICLE_CLASSES } from '../../src/vehicles';
import { projectPhysicalWheels, interpolateRenderSnapshots } from '../../src/rendering';
import { calibrateWheels } from './wheel-dynamics-fixture';

test('surface catalog is mechanical/versioned, native defaults preserve both classes', async () => {
  assert(Object.isFrozen(ROAD_SURFACES));
  assert.throws(() => roadSurface('unknown' as 'dry-asphalt'), /Unknown/);
  for (const surface of Object.values(ROAD_SURFACES)) {
    const world = await createRapierProbe(undefined, surface.id);
    try {
      for (const config of Object.values(VEHICLE_CLASSES)) {
        world.addClassCar(
          config.classId,
          { x: config.classId === 'sedan' ? 0 : 10, y: 0.8, z: 0 },
          config.classId,
        );
        const state = world.readVehicleMechanics(config.classId);
        assert.equal(state.surface.id, surface.id);
        assert(Math.abs(state.grip - config.grip * surface.tireGripScale) < 1e-6);
        assert(Math.abs(state.nativeGroundFriction - surface.groundFriction) < 1e-6);
      }
    } finally {
      world.dispose();
    }
  }
});

test('actual stopping and fixed-radius high-speed slip depend on native adhesion for both classes', async () => {
  for (const classId of ['sedan', 'compact'] as const) {
    const dry = await calibrateWheels(classId, 'dry-asphalt', 20, 'braking');
    const reduced = await calibrateWheels(classId, 'reduced-adhesion', 20, 'braking');
    assert(dry.stopped && reduced.stopped);
    assert(reduced.brakingDistanceM > dry.brakingDistanceM * 1.1);
    const slow = await calibrateWheels(classId, 'dry-asphalt', 8, 'turning');
    const fast = await calibrateWheels(classId, 'dry-asphalt', 20, 'turning');
    assert(fast.maxWheelLateralMps > slow.maxWheelLateralMps + 0.5);
    assert.equal(fast.geometricRadiusM, slow.geometricRadiusM);
    const airborne = await calibrateWheels(classId, 'dry-asphalt', 10, 'airborne');
    assert.equal(airborne.minContacts, 0);
    assert.equal(airborne.maxContacts, 4);
    assert(
      airborne.curve
        .flatMap((point) => point.wheels)
        .every((wheel) => Number.isFinite(wheel.suspensionLengthM)),
    );
  }
});

test('physical wheel projection is continuous, frozen and presentation cannot write native state', async () => {
  const world = await createRapierProbe();
  try {
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, 'sedan');
    for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
    world.setVelocity('car', { x: 0, y: 0, z: 10 });
    const input = new Map([['car', { throttle: 0.5, brake: 0, steering: 0.2 }]]);
    let prior = world.project('car');
    for (let tick = 0; tick < 120; tick++) {
      world.step(input, false);
      const current = world.project('car');
      const before = JSON.stringify(current);
      const snapshot = {
        sessionId: 'test',
        worldEpoch: 0,
        tick: tick + 1,
        vehicles: [projectPhysicalWheels(current, '1')],
      };
      const previous = { ...snapshot, tick, vehicles: [projectPhysicalWheels(prior, '1')] };
      const visual = interpolateRenderSnapshots(previous, snapshot, 0.5)!;
      assert.equal(JSON.stringify(world.project('car')), before);
      assert(
        Object.isFrozen(current.wheels) &&
          Object.isFrozen(current.wheels[0]) &&
          Object.isFrozen(current.wheels[0]!.localPositionM),
      );
      assert.equal(
        visual.vehicles[0]!.wheels[0]!.spinRad,
        (prior.wheels[0]!.spinRad + current.wheels[0]!.spinRad) / 2,
      );
      assert.equal(
        current.wheels[0]!.steeringRad,
        world.readVehicleMechanics('car').appliedSteeringRadians[0],
      );
      assert(Math.abs(current.wheels[0]!.spinRad - prior.wheels[0]!.spinRad) < 2);
      assert.throws(() => {
        (current.wheels[0]!.localPositionM as { y: number }).y = 200;
      }, TypeError);
      prior = current;
    }
    assert(Math.abs(prior.wheels[0]!.spinRad) > Math.PI * 2);
    const token = world.bodyIdentity('car')!;
    world.removeBody(token);
    assert.throws(() => world.project('car'), /Unknown/);
  } finally {
    world.dispose();
  }
});

test('20 full-capacity wheel projection lifecycles release native bodies and subscriptions', async () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const world = await createRapierProbe(
      undefined,
      cycle % 2 ? 'reduced-adhesion' : 'dry-asphalt',
    );
    try {
      for (let index = 0; index < 110; index++) {
        const id = `car-${index}`;
        world.addClassCar(
          id,
          { x: (index % 11) * 4, y: 0.8, z: Math.floor(index / 11) * 5 },
          index % 2 ? 'compact' : 'sedan',
        );
        const token = world.bodyIdentity(id)!;
        for (let subscriber = 0; subscriber < 8; subscriber++) world.subscribeBody(token, () => {});
      }
      world.step(new Map(), false);
      for (let index = 0; index < 110; index++)
        assert.equal(world.project(`car-${index}`).wheels.length, 4);
      assert.deepEqual(world.counts(), { vehicles: 110, bodies: 110, colliders: 111 });
      assert.deepEqual(world.bodyResources(), { entities: 110, subscriptions: 880 });
      for (let index = 0; index < 110; index++)
        world.removeBody(world.bodyIdentity(`car-${index}`)!);
      assert.deepEqual(world.counts(), { vehicles: 0, bodies: 0, colliders: 1 });
      assert.deepEqual(world.bodyResources(), { entities: 0, subscriptions: 0 });
    } finally {
      world.dispose();
    }
    assert.equal(world.collisionResources().colliders, 0);
    assert.throws(() => world.project('car-0'), /disposed/);
  }
});
