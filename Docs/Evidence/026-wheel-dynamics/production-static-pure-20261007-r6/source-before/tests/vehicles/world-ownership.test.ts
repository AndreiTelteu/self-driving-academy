import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeOwnedWorld } from '../../src/vehicles/rapier/world-ownership';

test('pre-handoff setup failure frees once and releases reservation only after native success', () => {
  const primary = new Error('setup');
  const calls: string[] = [];
  let reserved = 1;
  let release: (() => void) | undefined;
  assert.throws(() => initializeOwnedWorld({ free: () => {
    calls.push('free');
    assert.equal(reserved, 1);
    release!(); // Native callback reentry cannot free/decrement twice.
  } }, () => { calls.push('reservation'); reserved--; }, (free) => {
    release = free;
    throw primary;
  }), (error: unknown) => error === primary);
  release!();
  assert.equal(reserved, 0);
  assert.deepEqual(calls, ['free', 'reservation']);
});

test('native free failure retains primary and cleanup identities and leaves capacity reserved', () => {
  const primary = new Error('ground');
  const cleanup = new Error('native free: ownership unknown');
  let reserved = 1;
  let frees = 0;
  let release: (() => void) | undefined;
  assert.throws(() => initializeOwnedWorld({ free: () => {
    frees++;
    release!();
    throw cleanup;
  } }, () => { reserved--; }, (free) => {
    release = free;
    throw primary;
  }), (error: unknown) => {
    assert(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.equal(error.errors[0], primary);
    assert.equal(error.errors[1], cleanup);
    return true;
  });
  release!();
  assert.equal(frees, 1);
  assert.equal(reserved, 1);
});

test('successful handoff leaves world owned until caller disposal, then releases once', () => {
  let reserved = 1;
  let frees = 0;
  const probe = initializeOwnedWorld({ free: () => { frees++; } }, () => { reserved--; },
    (dispose) => ({ dispose, sample: 60 }));
  assert.equal(probe.sample, 60);
  assert.equal(frees, 0);
  assert.equal(reserved, 1);
  probe.dispose();
  probe.dispose();
  assert.equal(frees, 1);
  assert.equal(reserved, 0);
});
