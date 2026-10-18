import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BODY_LIMITS, PhysicsBodyRegistry, copyBodyTransform } from '../../src/vehicles';
import type { BodyIdentity, BodyState } from '../../src/vehicles';

const transform = copyBodyTransform({
  positionM: { x: 3, y: 2, z: 1 },
  rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
});
const state = (identity: BodyIdentity): BodyState =>
  Object.freeze({ identity, transform, velocityMps: Object.freeze({ x: 1, y: 2, z: 3 }) });

test('opaque fractional/subnormal handles are fenced by exact registration, without tombstones', () => {
  const registry = new PhysicsBodyRegistry();
  for (const handle of [Number.MIN_VALUE, 0.25, 4.75]) {
    const old = registry.register('car', handle);
    let delivered = 0;
    const off = registry.subscribe(old, () => delivered++);
    assert.equal(registry.forHandle(handle), old);
    assert.equal(registry.publish(state(old), 1), true);
    assert.equal(registry.remove(old), true);
    assert.equal(registry.forHandle(handle), undefined);
    const current = registry.register('car', handle);
    assert.equal(registry.publish(state(old), 2), false);
    assert.equal(registry.remove(old), false);
    assert.throws(() => registry.subscribe(old, () => {}), /Stale/);
    assert.equal(registry.isCurrent({ ...current }), false);
    off();
    off();
    assert.equal(delivered, 1);
    assert.deepEqual(registry.counts(), { entities: 1, subscriptions: 0 });
    registry.remove(current);
  }
  registry.dispose();
  registry.dispose();
  assert.throws(() => registry.register('car', 1), /disposed/);
});

test('admission caps subscriptions and active entities before registration', () => {
  const registry = new PhysicsBodyRegistry();
  assert.throws(() => registry.admit('   '), /identity/);
  assert.throws(() => registry.admit(42 as unknown as string), /identity/);
  for (let i = 0; i < BODY_LIMITS.entities; i++) {
    const identity = registry.register(`car-${i}`, i + 0.5);
    for (let j = 0; j < BODY_LIMITS.subscriptionsPerBody; j++)
      registry.subscribe(identity, () => {});
    assert.throws(() => registry.subscribe(identity, () => {}), /capacity/);
  }
  assert.deepEqual(registry.counts(), { entities: 110, subscriptions: 880 });
  assert.throws(() => registry.admit('extra'), /capacity/);
  assert.throws(() => registry.register('extra', 999), /capacity/);
  registry.dispose();
  assert.deepEqual(registry.counts(), { entities: 0, subscriptions: 0 });
});

test('old unsubscribe never decrements subscriptions belonging to a reused entity', () => {
  const registry = new PhysicsBodyRegistry();
  const old = registry.register('car', 0.5);
  const off = registry.subscribe(old, () => {});
  registry.remove(old);
  const current = registry.register('car', 0.5);
  registry.subscribe(current, () => {});
  off();
  off();
  assert.deepEqual(registry.counts(), { entities: 1, subscriptions: 1 });
  registry.dispose();
});

test('dispatch rejects stale ticks, removal/recreation and reentrant newer publication', () => {
  const registry = new PhysicsBodyRegistry();
  const identity = registry.register('car', 0.5);
  const ticks: number[] = [];
  registry.subscribe(identity, (s, tick) => {
    if (tick === 2) registry.publish(s, 3);
  });
  registry.subscribe(identity, (_, tick) => ticks.push(tick));
  registry.publish(state(identity), 2);
  assert.deepEqual(ticks, [3]);
  assert.equal(registry.publish(state(identity), 1), false);
  registry.remove(identity);
  const recreated = registry.register('car', 0.5);
  let second = 0;
  registry.subscribe(recreated, () => {
    registry.remove(recreated);
    registry.register('car', 0.5);
  });
  registry.subscribe(recreated, () => second++);
  registry.publish(state(recreated), 0);
  assert.equal(second, 0);
  assert.deepEqual(registry.counts(), { entities: 1, subscriptions: 0 });
  registry.dispose();
});

test('conversions copy SI values and quaternion exactly; invalid quaternion is rejected', () => {
  const source = {
    positionM: { x: 4, y: 5, z: 6 },
    rotationQuaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
  };
  const copy = copyBodyTransform(source);
  assert.deepEqual(copy, source);
  source.positionM.x = 100;
  assert.equal(copy.positionM.x, 4);
  assert(Object.isFrozen(copy.rotationQuaternion));
  assert.throws(
    () => copyBodyTransform({ ...source, rotationQuaternion: { x: 0, y: 0, z: 0, w: 2 } }),
    /quaternion/,
  );
});

test('same-tick reentrant publication delivers only the fresh state to later callbacks', () => {
  const registry = new PhysicsBodyRegistry();
  const identity = registry.register('car', 0.5);
  const outer = state(identity);
  const fresh: BodyState = Object.freeze({
    ...outer,
    transform: copyBodyTransform({
      ...outer.transform,
      positionM: { x: 99, y: 2, z: 1 },
    }),
  });
  let reentered = false;
  const positions: number[] = [];
  registry.subscribe(identity, (_, tick) => {
    if (!reentered) {
      reentered = true;
      registry.publish(fresh, tick);
    }
  });
  registry.subscribe(identity, (s) => positions.push(s.transform.positionM.x));
  registry.publish(outer, 7);
  assert.deepEqual(positions, [99]);
  assert.deepEqual(registry.counts(), { entities: 1, subscriptions: 2 });
  registry.dispose();
});
