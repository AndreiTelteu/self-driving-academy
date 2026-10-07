import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { connectPhysicsBodyToScene } from '../../src/vehicles';
import { createRapierProbe } from '../../src/vehicles/rapier';
import type { BodyIdentity, PhysicsScenePort } from '../../src/vehicles';

const pose = {
  positionM: { x: 7, y: 3, z: -11 },
  rotationQuaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
};
const close = (a: number, b: number) => assert(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('real Rapier readback drives Babylon Matrix: translated +90Y, +Z becomes +X, velocity stays SI', async () => {
  const world = await createRapierProbe();
  try {
    world.addCar('car', pose.positionM);
    const identity = world.bodyIdentity('car')!;
    world.setPose(identity, pose);
    world.setBodyVelocity(identity, { x: 12, y: -2, z: 4 });
    assert.equal(world.entityForBodyHandle(identity.handle), identity);
    const body = world.readBody(identity);
    assert.deepEqual(body.velocityMps, { x: 12, y: -2, z: 4 });
    const sink: PhysicsScenePort = {
      presentVehicle(s) {
        assert.equal(s.sessionId, 'session');
        assert.equal(s.worldEpoch, 2);
        assert.equal(s.tick, 8);
        const p = s.transform.positionM,
          q = s.transform.rotationQuaternion;
        const matrix = Matrix.Compose(
          Vector3.One(),
          new Quaternion(q.x, q.y, q.z, q.w),
          new Vector3(p.x, p.y, p.z),
        );
        const point = Vector3.TransformCoordinates(new Vector3(0, 0, 1), matrix);
        close(point.x, 8);
        close(point.y, 3);
        close(point.z, -11);
        return true;
      },
    };
    const off = connectPhysicsBodyToScene(world, identity, sink, {
      sessionId: 'session',
      worldEpoch: 2,
    });
    const costs = world.publishBodies(8);
    assert.equal(costs.bodies, 1);
    assert(costs.readbackMs >= 0 && costs.dispatchMs >= 0);
    off();
    off();
    const before = world.readBody(identity);
    assert.throws(
      () => world.setPose(identity, { ...pose, rotationQuaternion: { x: 0, y: 0, z: 0, w: 0 } }),
      /quaternion/,
    );
    assert.deepEqual(world.readBody(identity), before);
  } finally {
    world.dispose();
  }
});

test('20 full-capacity create/remove cycles release controllers, colliders, maps and callbacks', async () => {
  const world = await createRapierProbe();
  try {
    for (let cycle = 0; cycle < 20; cycle++) {
      let delivered = 0;
      const identities: BodyIdentity[] = [];
      for (let i = 0; i < 110; i++) {
        world.addCar(`car-${i}`, { x: i * 2, y: 3, z: 0 });
        const identity = world.bodyIdentity(`car-${i}`)!;
        identities.push(identity);
        for (let j = 0; j < 8; j++) world.subscribeBody(identity, () => delivered++);
      }
      assert.deepEqual(world.counts(), { vehicles: 110, bodies: 110, colliders: 111 });
      assert.deepEqual(world.bodyResources(), { entities: 110, subscriptions: 880 });
      assert.throws(() => world.addCar('overflow', pose.positionM), /capacity/);
      world.publishBodies(cycle, false);
      assert.equal(delivered, 880);
      for (const identity of identities) {
        assert.equal(world.removeBody(identity), true);
        assert.equal(world.removeBody(identity), false);
        assert.equal(world.entityForBodyHandle(identity.handle), undefined);
        assert.throws(() => world.readBody(identity), /Stale/);
      }
      world.step(new Map(), false);
      world.contacts();
      assert.deepEqual(world.counts(), { vehicles: 0, bodies: 0, colliders: 1 });
      assert.deepEqual(world.bodyResources(), { entities: 0, subscriptions: 0 });
      world.addCar('car-0', pose.positionM);
      assert.throws(() => world.setBodyVelocity(identities[0]!, { x: 1, y: 0, z: 0 }), /Stale/);
      world.publishBodies(cycle + 1, false);
      assert.equal(delivered, 880);
      world.removeBody(world.bodyIdentity('car-0')!);
    }
  } finally {
    world.dispose();
    world.dispose();
  }
  assert.deepEqual(world.bodyResources(), { entities: 0, subscriptions: 0 });
});

test('callback removes a body during dispatch and another world rejects its old token', async () => {
  const world = await createRapierProbe();
  world.addCar('car', pose.positionM);
  const old = world.bodyIdentity('car')!;
  let calls = 0;
  world.subscribeBody(old, () => {
    world.removeBody(old);
    world.addCar('car', pose.positionM);
  });
  world.subscribeBody(old, () => calls++);
  world.publishBodies(1, false);
  assert.equal(calls, 0);
  assert.equal(world.bodyResources().subscriptions, 0);
  world.dispose();
  const next = await createRapierProbe();
  try {
    next.addCar('car', pose.positionM);
    assert.throws(() => next.readBody(old), /Stale/);
    assert.equal(next.removeBody(old), false);
  } finally {
    next.dispose();
  }
});

test('same-tick nested Rapier publication fences stale callbacks and later bodies in outer batch', async () => {
  const world = await createRapierProbe();
  try {
    world.addCar('a', pose.positionM);
    world.addCar('b', pose.positionM);
    const a = world.bodyIdentity('a')!,
      b = world.bodyIdentity('b')!;
    let reentered = false;
    const positionsA: number[] = [],
      positionsB: number[] = [];
    world.subscribeBody(a, (_, tick) => {
      if (!reentered) {
        reentered = true;
        world.setPose(a, { ...pose, positionM: { x: 99, y: 3, z: -11 } });
        world.setPose(b, { ...pose, positionM: { x: 88, y: 3, z: -11 } });
        world.publishBodies(tick, false);
      }
    });
    world.subscribeBody(a, (s) => positionsA.push(s.transform.positionM.x));
    world.subscribeBody(b, (s) => positionsB.push(s.transform.positionM.x));
    world.publishBodies(7, false);
    assert.deepEqual(positionsA, [99]);
    assert.deepEqual(positionsB, [88]);
  } finally {
    world.dispose();
  }
});
