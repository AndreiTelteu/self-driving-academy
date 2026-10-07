import assert from 'node:assert/strict';
import test from 'node:test';
import type { BodyIdentity, PhysicsProbe } from '../../../src/vehicles';
import { browserScope, browserWorld, mutations, snapshot, unchanged, distribution } from './proof';
function fake() {
  let identity: BodyIdentity = { entityId: 'a', handle: 1, generation: 1 };
  const body = {
    identity,
    transform: { positionM: { x: 0, y: 0, z: 0 }, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } },
    velocityMps: { x: 0, y: 0, z: 0 },
  };
  let steps = 0,
    writes = 0;
  const raw: Record<string, unknown> = { collisionSource: { isCurrent: () => true } };
  for (const name of [
    'collisionIdentity',
    'collisionForColliderHandle',
    'collisionStepSerial',
    'collisionResources',
    'readVehicleMechanics',
    'readCollisionContacts',
    'bodyIdentity',
    'entityForBodyHandle',
    'readBody',
    'bodyResources',
    'project',
    'contacts',
    'counts',
    ...mutations,
  ])
    raw[name] = () => {
      writes++;
    };
  raw.bodyIdentity = () => identity;
  raw.readBody = () => structuredClone({ ...body, identity });
  raw.collisionStepSerial = () => steps;
  raw.step = () => {
    steps++;
  };
  return {
    raw: raw as unknown as PhysicsProbe,
    body,
    replace: () => {
      identity = { ...identity, generation: 2 };
    },
    counts: () => ({ steps, writes }),
  };
}
test('068 browser proof rejects every driving mutator and unknown surface before any side effect', () => {
  const f = fake(),
    g = browserWorld(f.raw);
  g.guard.phase = 'DRIVING';
  for (const name of mutations)
    assert.throws(() => Reflect.apply(g.world[name], g.world, []), /mutation during driving/);
  assert.deepEqual(f.counts(), { steps: 0, writes: 0 });
  Object.assign(f.raw, { unknownSetter: () => {} });
  assert.throws(() => browserWorld(f.raw), /Unknown native surface/);
});
test('068 browser exact settlement rejects identity/transform/velocity/step independently', () => {
  for (const kind of ['identity', 'position', 'velocity', 'step']) {
    const f = fake(),
      before = snapshot(f.raw, [f.body.identity]);
    if (kind === 'identity') f.replace();
    if (kind === 'position') f.body.transform.positionM.x = 1;
    if (kind === 'velocity') f.body.velocityMps.x = 1;
    if (kind === 'step') f.raw.step(new Map());
    assert.throws(() => unchanged(f.raw, [f.body.identity], before, 0));
  }
});
test('068 browser no-step bracket blocks integration and raw distributions reject incomplete/nonfinite samples', () => {
  const f = fake(),
    g = browserWorld(f.raw);
  g.guard.phase = 'SETTLEMENT';
  assert.throws(() => g.world.step(new Map()), /Step during selection/);
  assert.equal(f.counts().steps, 0);
  assert.throws(() => distribution([1, 2]));
  assert.throws(() => distribution(Array(600).fill(NaN)));
  const values = Array.from({ length: 600 }, (_, i) => i);
  assert.deepEqual(distribution(values), { p50: 299, p95: 569, p99: 593 });
});

test('068 browser acquisition immediately owns raw disposal and attempts independent cleanup/readbacks after audit rejection', () => {
  const scope = browserScope(),
    f = fake();
  let disposed = 0,
    other = 0;
  scope.own(
    'raw',
    () => {
      disposed++;
      throw Error('raw-disposal');
    },
    () => ({ disposed }),
  );
  scope.own('other', () => {
    other++;
  });
  Object.assign(f.raw, { unreviewedMutation: () => {} });
  assert.throws(() => browserWorld(f.raw), /Unknown native surface/);
  const result = scope.close();
  assert.equal(disposed, 1);
  assert.equal(other, 1);
  assert.deepEqual(result.attempts, ['other', 'raw']);
  assert.equal(result.errors[0]?.message, 'Error: raw-disposal');
  assert.deepEqual(result.snapshots.raw, { disposed: 1 });
  assert.throws(() => scope.close(), /already closed/);
  assert.equal(disposed, 1);
});
