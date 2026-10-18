import assert from 'node:assert/strict';
import test from 'node:test';
import type { BodyIdentity, PhysicsProbe } from '../../src/vehicles';
import {
  acquireGuardedReferenceWorld,
  guardedWorld,
  bodySnapshot,
  sameNativeSnapshot,
  NATIVE_MUTATORS,
  NATIVE_READERS,
} from './vehicle-selection-native-guard-v2';
import { createReferenceResourceScope } from './vehicle-selection-reference';
function fake() {
  let identity: BodyIdentity = Object.freeze({ entityId: 'a', handle: 1, generation: 1 });
  const body = {
    identity,
    transform: { positionM: { x: 0, y: 0, z: 0 }, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } },
    velocityMps: { x: 0, y: 0, z: 0 },
  };
  let mutations = 0,
    steps = 0,
    disposes = 0;
  const raw: Record<string, unknown> = { collisionSource: { isCurrent: () => true } };
  for (const method of NATIVE_READERS) raw[method] = () => null;
  for (const method of NATIVE_MUTATORS)
    raw[method] = () => {
      mutations++;
    };
  raw.bodyIdentity = () => identity;
  raw.readBody = () => structuredClone({ ...body, identity });
  raw.collisionStepSerial = () => steps;
  raw.step = () => {
    steps++;
    return { bridgeCalls: 0, queryCount: 0 };
  };
  raw.dispose = () => {
    disposes++;
  };
  return {
    raw: raw as unknown as PhysicsProbe,
    body,
    identity: () => identity,
    replace: () => {
      identity = Object.freeze({ ...identity, generation: 2 });
    },
    counts: () => ({ mutations, steps, disposes }),
  };
}
test('068 v2 guard rejects all body/velocity/admission/callback mutators before native driving mutation', () => {
  const f = fake(),
    g = guardedWorld(f.raw);
  g.guard.phase = 'DRIVING';
  for (const name of NATIVE_MUTATORS)
    assert.throws(() => Reflect.apply(g.world[name], g.world, []), /mutation during driving/);
  assert.deepEqual(f.counts(), { mutations: 0, steps: 0, disposes: 0 });
  for (const name of NATIVE_MUTATORS) assert.equal(g.guard.drivingCalls[name], 1);
});
test('068 v2 unknown actual method cannot bypass native mutation audit', () => {
  const f = fake();
  Object.assign(f.raw, { unclassifiedNativeSetter: () => {} });
  assert.throws(() => guardedWorld(f.raw), /Unclassified native probe surface/);
});
test('068 v2 selection settlement rejects native step before integration', () => {
  const f = fake(),
    g = guardedWorld(f.raw);
  g.guard.phase = 'SELECTION_SETTLEMENT';
  assert.throws(() => g.world.step(new Map()), /step inside selection/);
  assert.equal(f.counts().steps, 0);
  assert.equal(g.guard.selectionStepAttempts, 1);
});
test('068 v2 exact settlement catches changed identity, transform and velocity independently', () => {
  for (const change of ['identity', 'position', 'velocity', 'step'] as const) {
    const f = fake(),
      ids = [f.identity()],
      before = bodySnapshot(f.raw, ids);
    if (change === 'identity') f.replace();
    else if (change === 'position') f.body.transform.positionM.x = 1;
    else if (change === 'velocity') f.body.velocityMps.z = 1;
    else f.raw.step(new Map());
    assert.throws(
      () => sameNativeSnapshot(f.raw, ids, before, 0),
      /Native identity changed|changed native transform\/velocity|advanced native physics/,
    );
  }
});
test('068 v2 setup is labeled and guarded native cleanup happens once despite another release failure', () => {
  const f = fake(),
    g = guardedWorld(f.raw);
  g.world.addClassCar('a', { x: 0, y: 0, z: 0 }, 'sedan');
  assert.deepEqual(
    g.guard.setupCalls.map((v) => ({ path: v.path, label: v.label })),
    [{ path: 'addClassCar', label: 'INITIAL_FIXTURE' }],
  );
  const scope = createReferenceResourceScope();
  scope.own(
    'world',
    () => {
      g.guard.phase = 'CLEANUP';
      g.world.dispose();
    },
    () => f.counts(),
  );
  scope.own('faulting', () => {
    throw Error('other cleanup failed');
  });
  const c = scope.close();
  assert.equal(f.counts().disposes, 1);
  assert.equal(c.errors.length, 1);
  assert.throws(() => scope.close(), /already closed/);
  assert.equal(f.counts().disposes, 1);
});

test('068 v2 acquired native owner is protected before failed audit and all disposal errors preserve original cause', () => {
  const f = fake(),
    scope = createReferenceResourceScope();
  let disposeAttempts = 0,
    otherAttempts = 0;
  Object.assign(f.raw, {
    unclassifiedNativeSetter: () => {},
    dispose: () => {
      disposeAttempts++;
      throw Error('native dispose failed');
    },
    bodyResources: () => ({ entities: 1, subscriptions: 0 }),
    collisionResources: () => ({ vehicles: 1, obstacles: 0, colliders: 1, disposed: false }),
  });
  let primary: unknown = null;
  try {
    acquireGuardedReferenceWorld(f.raw, scope);
  } catch (error) {
    primary = error;
  }
  assert(primary instanceof Error);
  assert.match(primary.message, /Unclassified native probe surface/);
  scope.own('other', () => {
    otherAttempts++;
    throw Error('independent disposal failure');
  });
  const cleanup = scope.close();
  const aggregate = new AggregateError(
    [primary, ...cleanup.errors.map((error) => Error(error.message))],
    'Original audit and all cleanup causes',
  );
  assert.equal(aggregate.errors[0], primary);
  assert.equal(aggregate.errors.length, 3);
  assert.equal(disposeAttempts, 1);
  assert.equal(otherAttempts, 1);
  assert.deepEqual(cleanup.snapshots.body, { entities: 1, subscriptions: 0 });
  assert.deepEqual(cleanup.snapshots.collision, {
    vehicles: 1,
    obstacles: 0,
    colliders: 1,
    disposed: false,
  });
  assert.deepEqual(
    cleanup.errors.map((error) => error.resource),
    ['other', 'world'],
  );
  assert.throws(() => scope.close(), /already closed/);
  assert.equal(disposeAttempts, 1);
});
