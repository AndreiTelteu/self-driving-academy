import { browserScope } from './proof';
import { errorEvidence } from './diagnostics';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkLifecycleCleanup,
  requireCurrentCanvas,
  requireLifecycleSurface,
  lifecycleFailures,
} from './lifecycle-proof';
test('replacement current canvas identity must advance before next acquisition', () => {
  const old = { isConnected: false, id: 'canvas' },
    next = { isConnected: true, id: 'canvas' };
  assert.throws(() => requireCurrentCanvas(old, next));
  requireCurrentCanvas(next, next);
});
test('missing DOM pointer/disconnected/changed id fails before world', () => {
  for (const canvas of [
    { isConnected: false, id: 'canvas' },
    { isConnected: true, id: 'other' },
  ])
    assert.throws(() => requireCurrentCanvas(canvas, canvas));
  assert.throws(() => requireCurrentCanvas({ isConnected: true, id: 'canvas' }, null));
});
test('early renderer-only failure does not invent unacquired native zero', () => {
  const result = checkLifecycleCleanup({
    attempts: ['context-latch', 'renderer'],
    errors: [],
    snapshots: { renderer: { disposed: true, meshes: 0, materials: 0, cameras: 0 } },
  });
  assert.deepEqual(result, {
    errors: [],
    world: 'NOT_ACQUIRED',
    input: 'NOT_ACQUIRED',
    renderer: 'ACQUIRED',
  });
});
test('acquired world after failure must prove actual native cleanup', () => {
  const value = {
    attempts: ['world'],
    errors: [],
    snapshots: { body: { entities: 0, subscriptions: 0 }, collision: { colliders: 0 } },
  };
  assert.deepEqual(checkLifecycleCleanup(value).errors, []);
  value.snapshots.body.entities = 1;
  assert.ok(checkLifecycleCleanup(value).errors.length);
});
test('missing owned readback and repeated disposal attempt fail', () => {
  assert.ok(
    checkLifecycleCleanup({ attempts: ['world'], errors: [], snapshots: {} }).errors.length,
  );
  assert.ok(
    checkLifecycleCleanup({
      attempts: ['renderer', 'renderer'],
      errors: [],
      snapshots: { renderer: { disposed: true, meshes: 0, materials: 0, cameras: 0 } },
    }).errors.length,
  );
});
test('input owner retained targets/physical resources fail even with valid renderer', () => {
  const v = {
    attempts: ['controller'],
    errors: [],
    snapshots: {
      controller: { vehicles: 0, players: 0, targets: 1, projections: 0, disposed: true },
    },
  };
  assert.ok(checkLifecycleCleanup(v).errors.length);
});

test('explicit internal sizing cannot waive wrong CSS or DPR', () => {
  requireLifecycleSurface({ css: [1920, 1080], internal: [1920, 1080], dpr: 1 });
  for (const v of [
    { css: [0, 0], internal: [1920, 1080], dpr: 1 },
    { css: [1920, 1080], internal: [100, 100], dpr: 1 },
    { css: [1920, 1080], internal: [1920, 1080], dpr: 2 },
  ])
    assert.throws(() => requireLifecycleSurface(v));
});

test('context-latch release failure remains real cleanup cause without inventing world', () => {
  const result = checkLifecycleCleanup({
    attempts: ['context-latch'],
    errors: [{ resource: 'context-latch', phase: 'DISPOSE', message: 'release failed' }],
    snapshots: {},
  });
  assert.equal(result.world, 'NOT_ACQUIRED');
  assert.equal(
    lifecycleFailures(
      null,
      { errors: [{ resource: 'context-latch', phase: 'DISPOSE', message: 'release failed' }] },
      result.errors,
    ).length,
    1,
  );
});

test('actual browserScope disposer throw preserves primary and cleanup/readback causes with all owners attempted once', () => {
  const scope = browserScope(),
    attempts: string[] = [];
  const primary = Error('Actual acquisition failure');
  scope.own(
    'renderer',
    () => {
      attempts.push('renderer');
    },
    () => ({ disposed: true, meshes: 0, materials: 0, cameras: 0 }),
  );
  scope.own('context-latch', () => {
    attempts.push('context-latch');
    throw Error('Actual release throw');
  });
  const cleanup = scope.close(),
    ownership = checkLifecycleCleanup(cleanup),
    causes = lifecycleFailures(primary, cleanup, ownership.errors);
  assert.equal(causes[0], primary);
  assert.equal(causes.length, 2);
  assert.deepEqual(attempts, ['context-latch', 'renderer']);
  assert.deepEqual(cleanup.attempts, attempts);
  const evidence = errorEvidence(new AggregateError(causes, 'Lifecycle failure')) as {
    errors: { message: string }[];
  };
  assert.equal(evidence.errors[0].message, 'Actual acquisition failure');
  assert.match(evidence.errors[1].message, /Actual release throw/);
  assert.throws(() => scope.close());
});
