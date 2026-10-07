import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateRawChannels,
  recomputeRelative,
} from '../../Docs/Evidence/068-vehicle-switch/after-numeric-checks.mjs';
function rawRun(value = 2) {
  const raw = Array.from({ length: 600 }, () => value),
    summary = { p50: value, p95: value, p99: value };
  return {
    observer: true,
    sampleBytes: 19200,
    rawTimings: {
      tickMs: [...raw],
      authorityMs: [...raw],
      referenceSelectionMs: [...raw],
      vehicleSelectionMs: [...raw],
    },
    tickMs: { ...summary },
    existingAuthorityMs: { ...summary },
    referenceSelectionMs: { ...summary },
    vehicleSelectionMs: { ...summary },
  };
}
test('068 full AFTER validator rejects a missing channel or lost raw sample', () => {
  validateRawChannels(rawRun());
  const missing = rawRun();
  delete missing.rawTimings.vehicleSelectionMs;
  assert.throws(() => validateRawChannels(missing));
  const lost = rawRun();
  lost.rawTimings.authorityMs.pop();
  assert.throws(() => validateRawChannels(lost));
});
test('068 full AFTER validator rejects NaN and a forged otherwise ordered summary', () => {
  const nan = rawRun();
  nan.rawTimings.referenceSelectionMs[300] = NaN;
  assert.throws(() => validateRawChannels(nan));
  const forged = rawRun();
  forged.vehicleSelectionMs = { p50: 2, p95: 2.1, p99: 2.2 };
  assert.throws(() => validateRawChannels(forged), /Independent raw percentile/);
});
test('068 full AFTER relative gate is recomputed from raw samples with exact conjunctive thresholds', () => {
  const before = [],
    after = [];
  for (const count of [70, 110])
    for (let pair = 0; pair < 5; pair++) {
      before.push({ ...rawRun(), count, pair });
      after.push({ ...rawRun(pair < 2 ? 4 : 2), count, pair });
    }
  assert.deepEqual(
    recomputeRelative(after, before).map((v) => v.failures),
    [2, 2],
  );
  after.find((v) => v.count === 110 && v.pair === 2).rawTimings.tickMs.fill(4);
  assert.throws(() => recomputeRelative(after, before), />10%AND>1ms >=3\/5/);
  const boundary = after.map((v) => ({
    ...v,
    rawTimings: { ...v.rawTimings, tickMs: Array(600).fill(3) },
  }));
  assert.deepEqual(
    recomputeRelative(boundary, before).map((v) => v.failures),
    [0, 0],
  );
});
