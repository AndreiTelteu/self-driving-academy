import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePhysical,
  intervalRegression,
  confirmations,
  compareJsProxy,
} from '../browser/vehicle-recovery-after/relative-proof.mjs';
test('strict physical comparison rejects a changed codec/hash or lost checkpoint', () => {
  const trace = {
    kind: 'trace',
    hashes: Array.from({ length: 58 }, (_, i) => ({ tick: 1920 + 120 * i, hash: 'a'.repeat(64) })),
    values: [1, 2, 3],
    physicalHash: 'a',
    checkpointHash: 'b',
  };
  comparePhysical(trace, structuredClone(trace));
  const changed = structuredClone(trace);
  changed.hashes[12].hash = 'c'.repeat(64);
  assert.throws(() => comparePhysical(trace, changed));
  assert.throws(() => comparePhysical(trace, { ...trace, hashes: trace.hashes.slice(1) }));
});
test('conservative ranked intervals retain ambiguity and exact joint3of5 gates', () => {
  assert.equal(
    intervalRegression({ lower: 10, upper: 10.025 }, { lower: 11.025, upper: 11.05 }),
    'UNVALIDATED',
  );
  assert.equal(
    intervalRegression({ lower: 10, upper: 10.025 }, { lower: 12, upper: 12.025 }),
    'FAIL',
  );
  assert.equal(
    confirmations(['FAIL', 'FAIL', 'UNVALIDATED', 'PASS', 'PASS']).verdict,
    'UNVALIDATED',
  );
  assert.equal(confirmations(['FAIL', 'FAIL', 'FAIL', 'PASS', 'PASS']).verdict, 'FAIL');
  assert.equal(confirmations(['FAIL', 'FAIL', 'PASS', 'PASS', 'PASS']).verdict, 'PASS');
});
test('memory API missing remains uncertain; actual5MiB and10percent required together', () => {
  const parts = (x) => [
    {
      kind: 'heap',
      endpoints: ['BEFORE_MEASURE', 'AFTER_MEASURE'].map((phase) => ({ phase, usedBytes: x })),
    },
  ];
  assert.equal(compareJsProxy(parts(null), parts(1)).verdict, 'UNVALIDATED');
  assert.equal(compareJsProxy(parts(100 * 1024 * 1024), parts(106 * 1024 * 1024)).verdict, 'PASS');
  assert.equal(compareJsProxy(parts(100 * 1024 * 1024), parts(112 * 1024 * 1024)).verdict, 'FAIL');
});
