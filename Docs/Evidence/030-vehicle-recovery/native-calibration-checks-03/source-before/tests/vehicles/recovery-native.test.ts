import assert from 'node:assert/strict';
import { test } from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createRecoveryRoadProvider } from '../../src/app/vehicle-recovery-road';
import { recoveryRoadFixture } from '../browser/vehicle-recovery/road-fixture';
import { CONTROLLER_CONTEXT } from './controller-reference';
import type { PhysicsProbe } from '../../src/vehicles/physics';

for (const classId of ['sedan', 'compact'] as const) {
  test(`030 actual ${classId} full native placement resets angular/linear state without extra physics or other body mutation`, async () => {
    const world = await createRapierProbe();
    const recovery = world.createRecoveryPort!(CONTROLLER_CONTEXT);
    try {
      world.addClassCar('subject', { x: 0, y: 0.75, z: 0 }, classId);
      world.addClassCar('other', { x: 8, y: 0.75, z: 0 }, classId);
      for (let i = 0; i < 180; i++) world.step(new Map(), false);
      const identity = world.bodyIdentity('subject')!,
        other = world.bodyIdentity('other')!;
      const datum = world.readBody(identity).transform.positionM.y;
      const transform = {
        positionM: { x: 0, y: datum, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      };
      const road = createRecoveryRoadProvider(recoveryRoadFixture().graph).locate(
        transform,
        'TAXI',
      )!;
      assert(road);
      world.setPose(identity, {
        positionM: { x: 0, y: datum, z: 12 },
        rotationQuaternion: { x: 0, y: 0, z: 1, w: 0 },
      });
      world.setBodyVelocity(identity, { x: 2, y: 1, z: -3 });
      const serial = world.collisionStepSerial(),
        priorOther = world.readBody(other),
        mechanics = world.readVehicleMechanics('subject');
      const result = recovery.applyPlacement({
        identity,
        context: CONTROLLER_CONTEXT,
        expectedPhysicsSerial: serial,
        transform,
        road,
      });
      assert.equal(result.inspection.status, 'SAFE');
      assert.equal(result.completed, 5);
      assert.equal(result.failure, null);
      assert.equal(world.collisionStepSerial(), serial);
      assert.deepEqual(world.readBody(other), priorOther);
      assert.deepEqual(result.after!.velocityMps, { x: 0, y: 0, z: 0 });
      assert.deepEqual(result.after!.angularVelocityRadS, { x: 0, y: 0, z: 0 });
      assert.deepEqual(world.readVehicleMechanics('subject'), mechanics);
      assert.throws(() =>
        recovery.applyPlacement({
          identity: { ...identity },
          context: CONTROLLER_CONTEXT,
          expectedPhysicsSerial: serial,
          transform,
          road,
        }),
      );
      assert.throws(() =>
        recovery.applyPlacement({
          identity,
          context: { ...CONTROLLER_CONTEXT, worldEpoch: 1 },
          expectedPhysicsSerial: serial,
          transform,
          road,
        }),
      );
      assert.throws(() =>
        recovery.applyPlacement({
          identity,
          context: CONTROLLER_CONTEXT,
          expectedPhysicsSerial: serial + 1,
          transform,
          road,
        }),
      );
      assert.equal(
        recovery.inspectPlacement({
          identity,
          context: CONTROLLER_CONTEXT,
          expectedPhysicsSerial: serial,
          transform: { ...transform, positionM: { x: 12, y: datum, z: 0 } },
          road,
        }).status,
        'INVALID_SUPPORT',
      );
      assert.equal(
        recovery.inspectPlacement({
          identity,
          context: CONTROLLER_CONTEXT,
          expectedPhysicsSerial: serial,
          transform: { ...transform, positionM: { x: 0, y: 10, z: 0 } },
          road,
        }).status,
        'INVALID_SUPPORT',
      );
    } finally {
      recovery.release();
      world.dispose();
    }
  });
}

test('030 moved anonymous native blocker is detected without world.step; partial setter fault never pretends rollback', async () => {
  const original = RAPIER.World.prototype.createRigidBody;
  const originalCollider = RAPIER.World.prototype.createCollider;
  const acquired: RAPIER.RigidBody[] = [];
  const colliders: RAPIER.Collider[] = [];
  let world: PhysicsProbe | null = null;
  RAPIER.World.prototype.createRigidBody = function (desc) {
    const body = original.call(this, desc);
    acquired.push(body);
    return body;
  };
  RAPIER.World.prototype.createCollider = function (desc, parent) {
    const collider = originalCollider.call(this, desc, parent);
    colliders.push(collider);
    return collider;
  };
  try {
    world = await createRapierProbe();
    world.addClassCar('subject', { x: 0, y: 0.75, z: 0 }, 'sedan');
    world.addBox({ x: 20, y: 0.75, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 }, false);
  } catch (error) {
    if (world) {
      try {
        world.dispose();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], 'Native test setup/cleanup failed');
      }
    }
    throw error;
  } finally {
    RAPIER.World.prototype.createRigidBody = original;
    RAPIER.World.prototype.createCollider = originalCollider;
  }
  assert(world);
  const recovery = world.createRecoveryPort!(CONTROLLER_CONTEXT);
  try {
    const identity = world.bodyIdentity('subject')!,
      transform = {
        positionM: { x: 0, y: 0.75, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      };
    const road = createRecoveryRoadProvider(recoveryRoadFixture().graph).locate(transform, 'TAXI')!;
    const request = {
      identity,
      context: CONTROLLER_CONTEXT,
      expectedPhysicsSerial: world.collisionStepSerial(),
      transform,
      road,
    };
    assert.equal(recovery.inspectPlacement(request).status, 'SAFE');
    const blocker = colliders[2]!;
    assert.equal(blocker.parent(), null);
    const comparisonShape = new RAPIER.Cuboid(0.9, 0.4, 2.25);
    const inspectCurrent = (expected: 'SAFE' | 'BLOCKED') => {
      // Independent old public shape-query expression versus live collider-query expression.
      // Both read the same current native collider, including same-serial external changes.
      assert.equal(
        blocker.intersectsShape(comparisonShape, transform.positionM, transform.rotationQuaternion),
        comparisonShape.intersectsShape(
          transform.positionM,
          transform.rotationQuaternion,
          blocker.shape,
          blocker.translation(),
          blocker.rotation(),
        ),
      );
      const actual = recovery.inspectPlacement(request);
      assert.equal(actual.status, expected);
      assert.equal(actual.colliderCount, 3);
      assert.equal(world!.collisionStepSerial(), request.expectedPhysicsSerial);
    };
    blocker.setTranslation({ x: 0, y: 0.75, z: 0 });
    inspectCurrent('BLOCKED');
    blocker.setSensor(true);
    inspectCurrent('SAFE');
    blocker.setSensor(false);
    inspectCurrent('BLOCKED');
    blocker.setTranslation({ x: 3, y: 0.75, z: 0 });
    blocker.setShape(new RAPIER.Cuboid(0.1, 0.2, 4));
    inspectCurrent('SAFE');
    blocker.setRotation({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 });
    inspectCurrent('BLOCKED');
    blocker.setRotation({ x: 0, y: 0, z: 0, w: 1 });
    inspectCurrent('SAFE');
    blocker.setShape(new RAPIER.Cuboid(4, 0.2, 0.1));
    inspectCurrent('BLOCKED');
    blocker.setShape(new RAPIER.Cuboid(0.2, 0.2, 0.2));
    blocker.setTranslation({ x: 0, y: 0.75, z: 0 });
    const blocked = recovery.applyPlacement(request);
    assert.equal(blocked.inspection.status, 'BLOCKED');
    assert.equal(blocked.attempted, 0);
    assert.equal(world.collisionStepSerial(), request.expectedPhysicsSerial);
    blocker.setTranslation({ x: 20, y: 0.75, z: 0 });
    inspectCurrent('SAFE');
    const body = acquired[0]!,
      setter = body.setRotation;
    body.setAngvel({ x: 2, y: -3, z: 1 }, true);
    assert.deepEqual(recovery.readNative(identity).angularVelocityRadS, { x: 2, y: -3, z: 1 });
    const recovered = recovery.applyPlacement(request);
    assert.deepEqual(recovered.after!.angularVelocityRadS, { x: 0, y: 0, z: 0 });
    body.setRotation = () => {
      throw new Error('injected actual setter failure');
    };
    let partial;
    try {
      partial = recovery.applyPlacement({
        ...request,
        transform: { ...transform, positionM: { x: 0, y: 0.75, z: 3 } },
      });
    } finally {
      body.setRotation = setter;
    }
    assert.equal(partial.attempted, 2);
    assert.equal(partial.completed, 1);
    assert.match(partial.failure!, /injected actual setter/);
    assert.equal(partial.after!.transform.positionM.z, 3);
    assert.equal(world.collisionStepSerial(), request.expectedPhysicsSerial);
  } finally {
    recovery.release();
    world.dispose();
  }
});

test('030 twenty110-token port lifetimes retain no additional native world/collider/subscription or stale port capability', async () => {
  const world = await createRapierProbe();
  try {
    for (let i = 0; i < 110; i++)
      world.addClassCar(
        'car-' + i,
        { x: (i % 10) * 4, y: 0.75, z: Math.floor(i / 10) * 5 },
        i % 2 ? 'compact' : 'sedan',
      );
    const counts = world.counts(),
      serial = world.collisionStepSerial();
    for (let cycle = 0; cycle < 20; cycle++) {
      const port = world.createRecoveryPort!(CONTROLLER_CONTEXT);
      assert.equal(world.recoveryResources!().activePorts, 1);
      for (let i = 0; i < 110; i++)
        assert.equal(port.readNative(world.bodyIdentity('car-' + i)!).physicsStepSerial, serial);
      port.release();
      port.release();
      assert.equal(world.recoveryResources!().activePorts, 0);
      assert.deepEqual(world.counts(), counts);
      assert.equal(world.bodyResources().subscriptions, 0);
      assert.throws(() => port.readNative(world.bodyIdentity('car-0')!));
    }
    assert.throws(() => world.createRecoveryPort!({ ...CONTROLLER_CONTEXT, worldEpoch: 1 }));
  } finally {
    world.dispose();
  }
  assert.deepEqual(world.recoveryResources!(), {
    activePorts: 0,
    worldBound: true,
    disposed: true,
  });
  assert.equal(world.bodyResources().entities, 0);
});
