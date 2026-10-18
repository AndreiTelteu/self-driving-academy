import test from 'node:test';
import assert from 'node:assert/strict';
import { correlateWait, pushBounded } from './protocol';
import type { WaitObservation } from './protocol';
const wait: WaitObservation = {
  phase: 'WARM',
  first: true,
  requestMs: 100,
  beforeReadStartMs: 99.8,
  beforeReadEndMs: 99.9,
  afterReadStartMs: 1755.1,
  afterReadEndMs: 1755.2,
  stampMs: 1750,
  callbackMs: 1755,
  nativeBefore: 186,
  nativeAfter: 186,
  controllerBefore: 6,
  controllerAfter: 6,
  priorRenderStartMs: 98,
  priorRenderFinishMs: 99.7,
  timeout: false,
};
test('real longtask overlap is correlation, not GC attribution', () => {
  assert.equal(
    correlateWait(wait, [{ startMs: 200, durationMs: 1000 }]).status,
    'OBSERVED_LONGTASK_OVERLAP',
  );
  assert.equal(
    correlateWait(wait, [{ startMs: 98, durationMs: 1.7 }]).status,
    'NO_OBSERVED_LONGTASK_OVERLAP',
  );
});
test('absent callback cannot reconstruct a delay', () =>
  assert.equal(correlateWait({ ...wait, callbackMs: null }, []).status, 'UNOBSERVED_CALLBACK'));
test('capacity overflow rejects without dropping old observations', () => {
  const rows: number[] = [];
  pushBounded(rows, 1, 1);
  assert.throws(() => pushBounded(rows, 2, 1));
  assert.deepEqual(rows, [1]);
});
