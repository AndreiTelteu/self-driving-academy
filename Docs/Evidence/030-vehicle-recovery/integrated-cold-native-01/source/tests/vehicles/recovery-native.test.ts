import assert from 'node:assert/strict';
import { test } from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createRecoveryRoadProvider } from '../../src/app/vehicle-recovery-road';
import { recoveryRoadFixture } from '../browser/vehicle-recovery/road-fixture';
import { CONTROLLER_CONTEXT } from './controller-reference';
import type { PhysicsProbe } from '../../src/vehicles/physics';
import { recoveryTransform } from '../../src/vehicles/recovery-port';

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
  let capturedNativeWorld: RAPIER.World | null = null;
  let world: PhysicsProbe | null = null;
  RAPIER.World.prototype.createRigidBody = function (desc) {
    const body = original.call(this, desc);
    acquired.push(body);
    return body;
  };
  RAPIER.World.prototype.createCollider = function (desc, parent) {
    capturedNativeWorld = this;
    const collider = originalCollider.call(this, desc, parent);
    colliders.push(collider);
    return collider;
  };
  try {
    world = await createRapierProbe();
    world.addClassCar('subject', { x: 0, y: 0.75, z: 0 }, 'sedan');
    world.addBox({ x: 20, y: 0.75, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 }, false);
    world.addBox({ x: 25, y: 0.75, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 }, false);
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
      transform = recoveryTransform({
        positionM: { x: 0, y: 0.75, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      });
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
    const farBlocker = colliders[3]!;
    assert(capturedNativeWorld);
    const rawSet = (capturedNativeWorld as RAPIER.World).colliders.raw;
    assert.equal(blocker.parent(), null);
    assert.equal(farBlocker.parent(), null);
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
      const wheels = world!.readVehicleMechanics('subject').wheels;
      const bottom = -0.15 - 0.35 - 0.2 - wheels.radiusM,
        top = 0.3;
      const candidate = new RAPIER.Cuboid(
        Math.max(0.85, wheels.trackM / 2 + wheels.radiusM),
        (top - bottom) / 2,
        Math.max(2, wheels.wheelbaseM / 2 + wheels.radiusM),
      );
      const centre = { ...transform.positionM, y: transform.positionM.y + (top + bottom) / 2 };
      const expectedQueries = [blocker, farBlocker]
        .filter((collider) => !collider.isSensor())
        .map((collider) => ({
          handle: collider.handle,
          result: collider.intersectsShape(candidate, centre, transform.rotationQuaternion),
        }));
      const originalCo = rawSet.coIntersectsShape;
      const actualQueries: typeof expectedQueries = [];
      const buffers: unknown[][] = [];
      const originalFrees = new Map<{ free(): void }, () => void>();
      const freeCounts = [0, 0, 0];
      rawSet.coIntersectsShape = function (handle, rawShape, rawPosition, rawRotation) {
        if (!buffers.length) {
          for (const [index, resource] of [rawPosition, rawRotation, rawShape].entries()) {
            const originalFree = resource.free;
            originalFrees.set(resource, originalFree);
            resource.free = function () {
              freeCounts[index]!++;
              originalFree.call(this);
            };
          }
        }
        const result = originalCo.call(this, handle, rawShape, rawPosition, rawRotation);
        actualQueries.push({ handle, result });
        buffers.push([rawPosition, rawRotation, rawShape]);
        return result;
      };
      let actual;
      try {
        actual = recovery.inspectPlacement(request);
      } finally {
        rawSet.coIntersectsShape = originalCo;
        for (const [resource, originalFree] of originalFrees) resource.free = originalFree;
      }
      assert.deepEqual(actualQueries, expectedQueries);
      for (const row of buffers) for (let i = 0; i < 3; i++) assert.equal(row[i], buffers[0]![i]);
      if (buffers.length) assert.equal(new Set(buffers[0]).size, 3);
      assert.deepEqual(freeCounts, buffers.length ? [1, 1, 1] : [0, 0, 0]);
      assert.equal(actual.status, expected);
      assert.equal(actual.colliderCount, 4);
      assert.equal(world!.collisionStepSerial(), request.expectedPhysicsSerial);
    };
    blocker.setTranslation({ x: 0, y: 0.75, z: 0 });
    inspectCurrent('BLOCKED');
    blocker.setSensor(true);
    inspectCurrent('SAFE');
    farBlocker.setSensor(true);
    inspectCurrent('SAFE'); // zero eligible queries; lazy helper acquires no candidate buffers.
    farBlocker.setSensor(false);
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
    const originalTranslation = RAPIER.Collider.prototype.translation;
    const originalRotation = RAPIER.Collider.prototype.rotation;
    const originalIntersection = rawSet.coIntersectsShape;
    const originalTraversal = RAPIER.World.prototype.forEachCollider;
    // Inject invalid readback at the native getter seam, not invalid physics setters.
    // Verify rejection order and complete borrowed-resource traversal for every component.
    for (const kind of ['translation', 'rotation'] as const) {
      for (const key of kind === 'translation' ? ['x', 'y', 'z'] : ['x', 'y', 'z', 'w']) {
        for (const bad of [NaN, Infinity, -Infinity]) {
          let visited = 0,
            blockerQueries = 0,
            blockerRotationReads = 0;
          RAPIER.Collider.prototype.translation = function () {
            const actual = originalTranslation.call(this);
            return this.handle === blocker.handle && kind === 'translation'
              ? { ...actual, [key]: bad }
              : actual;
          };
          RAPIER.Collider.prototype.rotation = function () {
            const actual = originalRotation.call(this);
            if (this.handle === blocker.handle) blockerRotationReads++;
            return this.handle === blocker.handle && kind === 'rotation'
              ? { ...actual, [key]: bad }
              : actual;
          };
          rawSet.coIntersectsShape = function (...args) {
            if (args[0] === blocker.handle) blockerQueries++;
            return originalIntersection.apply(this, args);
          };
          RAPIER.World.prototype.forEachCollider = function (callback) {
            return originalTraversal.call(this, (collider) => {
              visited++;
              callback(collider);
            });
          };
          try {
            assert.throws(
              () => recovery.inspectPlacement(request),
              kind === 'translation' ? /Invalid body vector/ : /Invalid native collider rotation/,
            );
            assert.equal(visited, 4);
            assert.equal(blockerQueries, 0);
            assert.equal(blockerRotationReads, kind === 'translation' ? 0 : 1);
            assert.equal(world.collisionStepSerial(), request.expectedPhysicsSerial);
          } finally {
            RAPIER.Collider.prototype.translation = originalTranslation;
            RAPIER.Collider.prototype.rotation = originalRotation;
            rawSet.coIntersectsShape = originalIntersection;
            RAPIER.World.prototype.forEachCollider = originalTraversal;
          }
        }
      }
    }
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
    assert.equal(partial.failure, 'Native setter threw');
    assert.equal(partial.after!.transform.positionM.z, 3);
    assert.equal(world.collisionStepSerial(), request.expectedPhysicsSerial);
    let hooks = 0;
    const hostile = new Error('unread');
    Object.defineProperties(hostile, {
      name: {
        get() {
          hooks++;
          throw new Error('name getter');
        },
      },
      message: {
        get() {
          hooks++;
          throw new Error('message getter');
        },
      },
    });
    const proxy = new Proxy(
      {},
      {
        get() {
          hooks++;
          throw new Error('get');
        },
        getPrototypeOf() {
          hooks++;
          throw new Error('prototype');
        },
        getOwnPropertyDescriptor() {
          hooks++;
          throw new Error('descriptor');
        },
      },
    );
    for (const thrown of [hostile, proxy, '', undefined, null]) {
      let attempts = 0;
      const candidate = { ...transform, positionM: { x: 0, y: 0.75, z: 4 } };
      body.setRotation = () => {
        attempts++;
        throw thrown;
      };
      let result;
      try {
        result = recovery.applyPlacement({ ...request, transform: candidate });
      } finally {
        body.setRotation = setter;
      }
      assert.equal(result.attempted, 2);
      assert.equal(result.completed, 1);
      assert.equal(result.failure, 'Native setter threw');
      assert.equal(attempts, 1);
      assert.equal(result.after!.transform.positionM.z, 4);
      assert.equal(world.collisionStepSerial(), request.expectedPhysicsSerial);
    }
    // Failure only in actual final readback, after all five native operations complete.
    const translation = body.translation,
      angularSetter = body.setAngvel;
    for (const thrown of [hostile, proxy, '', undefined]) {
      let finalReadback = false,
        reads = 0;
      body.translation = function () {
        if (finalReadback) {
          reads++;
          throw thrown;
        }
        return translation.call(this);
      };
      body.setAngvel = function (...args: Parameters<typeof angularSetter>) {
        angularSetter.apply(this, args);
        finalReadback = true;
      };
      let result;
      try {
        result = recovery.applyPlacement(request);
      } finally {
        body.translation = translation;
        body.setAngvel = angularSetter;
      }
      assert.equal(result.attempted, 5);
      assert.equal(result.completed, 5);
      assert.equal(result.after, null);
      assert.equal(result.failure, 'Native readback threw');
      assert.equal(reads, 1);
      assert.equal(world.collisionStepSerial(), request.expectedPhysicsSerial);
      assert.equal(recovery.readNative(identity).transform.positionM.z, 0);
    }
    assert.equal(hooks, 0);
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
