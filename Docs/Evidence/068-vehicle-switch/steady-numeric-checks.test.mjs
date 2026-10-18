import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decode64,
  quantiles,
  tupleUnchanged,
  elapsedMatches,
  relativeViolation,
  assertDistributions,
  order,
  validateHeap,
} from './steady-numeric-checks.mjs';
const wire = (values) => {
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  return {
    encoding: 'float64-le-base64',
    count: values.length,
    bytes: bytes.length,
    data: bytes.toString('base64'),
  };
};
test('Raw evidence loses no samples and rejects NaN or forged distributions', () => {
  assert.deepEqual(decode64(wire([1, 2, 3]), 3), [1, 2, 3]);
  assert.throws(() => decode64(wire([1, 2]), 3));
  assert.throws(() => decode64(wire([1, NaN]), 2));
  assert.throws(() => decode64({ ...wire([1]), bytes: 16 }));
  const expected = quantiles([4, 1, 3, 2]);
  assert.deepEqual(expected, { count: 4, p50: 2, p95: 3, p99: 3 });
  assertDistributions({ count: 4, p50: 2, p95: 3, p99: 3 }, expected);
  assert.throws(() => assertDistributions({ ...expected, count: 3 }, expected));
  assert.throws(() => assertDistributions({ ...expected, p95: 2 }, expected));
  elapsedMatches([10, 10, 10], 30);
  assert.throws(() => elapsedMatches([10, 10], 30));
});
test('Lossless all70 settlement evidence rejects transform, velocity and signed-zero mutation', () => {
  const fields = [
    'position.x',
    'position.y',
    'position.z',
    'rotation.x',
    'rotation.y',
    'rotation.z',
    'rotation.w',
    'velocity.x',
    'velocity.y',
    'velocity.z',
  ];
  const proof = {
    tupleVersion: '068-all70-body-tuple-v1',
    fields,
    before: wire(Array(700).fill(0)),
    after: { copyBefore: true, changedIndices: [], changedValues: wire([]) },
  };
  tupleUnchanged(proof);
  for (const [index, value] of [
    [0, 1],
    [699, 1],
    [7, -0],
  ]) {
    assert.throws(() =>
      tupleUnchanged({
        ...proof,
        after: { copyBefore: true, changedIndices: [index], changedValues: wire([value]) },
      }),
    );
  }
  assert.throws(() => tupleUnchanged({ ...proof, before: wire(Array(699).fill(0)) }));
});
test('Confirmed relative predicate requires both strict limits and canonical balanced20 order', () => {
  assert.equal(relativeViolation(10, 11), false);
  assert.equal(relativeViolation(10, 11.1), true);
  assert.equal(relativeViolation(1, 1.9), false);
  assert.equal(relativeViolation(100, 105), false);
  assert.throws(() => relativeViolation(NaN, 12));
  assert.equal(order().length, 20);
  for (let pair = 0; pair < 5; pair++) {
    const arms = order().filter((arm) => arm.pair === pair);
    assert.equal(new Set(arms.map((arm) => arm.treatment + ':' + arm.observer)).size, 4);
    assert.deepEqual(
      arms.map((arm) => arm.ordinal),
      [pair * 4, pair * 4 + 1, pair * 4 + 2, pair * 4 + 3],
    );
  }
});

test('Heap readback binds real phase/tick/clock and rejects malformed REPORTED ordering', () => {
  const value = {
    phase: 'liveHeap',
    tick: 8820,
    readStarted: 150001,
    readEnded: 150002,
    support: 'REPORTED',
    precision: 'browser-reported-nonstandard-not-exact',
    usedBytes: 10,
    totalBytes: 20,
    limitBytes: 30,
    reason: null,
  };
  validateHeap(value, 'liveHeap', 8820);
  for (const patch of [
    { usedBytes: -1 },
    { totalBytes: 5 },
    { limitBytes: 15 },
    { readEnded: 150000 },
    { phase: 'afterWarmup' },
    { tick: 9000 },
  ])
    assert.throws(() => validateHeap({ ...value, ...patch }, 'liveHeap', 8820));
  const missing = { ...value };
  delete missing.totalBytes;
  assert.throws(() => validateHeap(missing, 'liveHeap', 8820));
  validateHeap(
    {
      ...value,
      support: 'UNVALIDATED',
      precision: 'unknown',
      usedBytes: null,
      totalBytes: null,
      limitBytes: null,
      reason: 'Malformed native API values',
    },
    'liveHeap',
    8820,
  );
});
