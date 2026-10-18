import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHistogram,
  quantileInterval,
  absoluteVerdict,
  relativeVerdict,
  fivePairVerdict,
  validateHistogram,
  HISTOGRAM,
  HARDWARE_BUFFER_CAPS,
} from '../browser/vehicle-damage/hardware-collector';
import { verifyMetricPart, verifyMetricSet } from '../browser/vehicle-damage/hardware-parts';
import type {
  HistogramSnapshot,
  QuantileInterval,
} from '../browser/vehicle-damage/hardware-collector';
import type { HardwarePartIdentity, MetricPart } from '../browser/vehicle-damage/hardware-parts';
const interval = (lower: number, upper: number): QuantileInterval => ({
  lower,
  upper,
  upperExclusive: false,
  rank: 95,
  observations: 100,
});

test('full-window rank includes every observation and finite overflow rather than clipping old samples', () => {
  const h = createHistogram();
  for (let i = 0; i < 5000; i++) h.add(1);
  for (let i = 0; i < 100; i++) h.add(150);
  for (let i = 0; i < 100; i++) h.add(200);
  const data = h.snapshot();
  assert.equal(data.observations, 5200);
  assert.equal(data.overflowCount, 200);
  assert.equal(data.overflowMinMs, 150);
  assert.equal(data.overflowMaxMs, 200);
  assert.equal(quantileInterval(data, 0.95)?.lower, 1);
  assert.deepEqual(quantileInterval(data, 0.99), {
    lower: 150,
    upper: 200,
    upperExclusive: false,
    rank: 5148,
    observations: 5200,
  });
  assert.equal(h.ownedCounterBytes, 16384);
  assert.equal(HARDWARE_BUFFER_CAPS.onHistogramBytes, 180224);
});
test('boundary membership is conservative for exact, adjacent IEEE, zero and range-edge observations', () => {
  for (const value of [
    0, -0, 0.025, 0.075, 0.07500000000000001, 1.1, 102.375, 102.39999999999999, 102.4, 1000,
  ]) {
    const h = createHistogram();
    h.add(value);
    const q = quantileInterval(h.snapshot(), 1)!;
    assert.ok(q.lower <= value && q.upper >= value);
    if (q.upperExclusive) assert.ok(value < q.upper);
  }
  const h = createHistogram();
  for (const value of [NaN, Infinity, -Infinity, -1]) assert.throws(() => h.add(value));
  assert.equal(h.snapshot().observations, 0);
  assert.equal(quantileInterval(h.snapshot(), 0.95), null);
  assert.equal(absoluteVerdict(null, 5.5), 'UNVALIDATED');
});
test('interval gates preserve uncertainty near absolute and joint relative thresholds', () => {
  assert.equal(absoluteVerdict(interval(5.49, 5.51), 5.5), 'UNVALIDATED');
  assert.equal(absoluteVerdict(interval(5.45, 5.5), 5.5), 'PASS');
  assert.equal(relativeVerdict(interval(10, 10.025), interval(11.025, 11.05)), 'UNVALIDATED');
  assert.equal(relativeVerdict(interval(10, 10.025), interval(11.05, 11.075)), 'FAIL');
  assert.equal(relativeVerdict(interval(10, 10.025), interval(10.9, 10.925)), 'PASS');
  assert.equal(fivePairVerdict(['FAIL', 'FAIL', 'UNVALIDATED', 'PASS', 'PASS']), 'UNVALIDATED');
  assert.equal(fivePairVerdict(['FAIL', 'UNVALIDATED', 'PASS', 'PASS', 'PASS']), 'PASS');
  assert.equal(fivePairVerdict(['FAIL', 'FAIL', 'FAIL', 'UNVALIDATED', 'PASS']), 'FAIL');
});
test('snapshot distribution rejects tampered totals, sparse duplicates and invalid overflow without trusting client percentiles', () => {
  const h = createHistogram();
  h.add(1);
  const d = h.snapshot();
  assert.throws(() => validateHistogram({ ...d, observations: 2 }));
  assert.throws(() =>
    validateHistogram({
      ...d,
      entries: [
        [40, 1],
        [40, 1],
      ],
      observations: 2,
    }),
  );
  assert.throws(() =>
    validateHistogram({
      ...d,
      entries: [],
      overflowCount: 1,
      overflowMinMs: Infinity,
      overflowMaxMs: Infinity,
    }),
  );
  assert.throws(() => validateHistogram({ ...d, widthMs: 0.05 }));
  const modified = {
    ...d,
    entries: d.entries.map((entry) => [...entry] as [number, number]),
  } as HistogramSnapshot;
  assert.equal(quantileInterval(modified, 0.95)?.upper, 1.0250000000000001);
});
const identity: HardwarePartIdentity = {
  captureId: '20261006T000000Z',
  backend: 'WEBGPU',
  arm: 'CURRENT_029',
  pair: 0,
  observer: true,
  runOrdinal: 3,
  sourceHash: 'a'.repeat(64),
  artifactHash: 'b'.repeat(64),
  nativeHash: 'c'.repeat(64),
};
test('immutable metric identity binds source/backend/run and verifier recomputes ranks', () => {
  const h = createHistogram();
  for (let i = 0; i < 100; i++) h.add(i < 96 ? 1 : 2);
  const part: MetricPart = {
    version: '029-metric-part-v1',
    identity,
    metric: 'controllerTickMs',
    distribution: h.snapshot(),
  };
  const result = verifyMetricPart(part, identity);
  assert.equal(result.p95?.rank, 95);
  assert.equal(result.p95?.lower, 1);
  assert.throws(() =>
    verifyMetricPart({ ...part, identity: { ...identity, sourceHash: 'd'.repeat(64) } }, identity),
  );
  assert.throws(() =>
    verifyMetricPart({ ...part, identity: { ...identity, backend: 'WEBGL2' } }, identity),
  );
  assert.throws(() =>
    verifyMetricPart({ ...part, distribution: { ...h.snapshot(), observations: 101 } }, identity),
  );
  assert.throws(() => verifyMetricSet([part, part], identity));
  const off = { ...identity, observer: false, runOrdinal: 1 };
  assert.throws(() => verifyMetricPart({ ...part, identity: off }, off));
  assert.equal(
    verifyMetricPart({ ...part, metric: 'gpuDurationMs', distribution: null }, identity).p95,
    null,
  );
});
test('bounded observation capacity fails before mutation and export counters stay independent of raw sample cap', () => {
  const h = createHistogram();
  for (let i = 0; i < HISTOGRAM.sampleMaximum; i++) h.add(0);
  assert.throws(() => h.add(0));
  assert.equal(h.snapshot().observations, HISTOGRAM.sampleMaximum);
  assert.equal(HARDWARE_BUFFER_CAPS.endpointBytes, 256);
  assert.equal(HARDWARE_BUFFER_CAPS.partBytes, 131072);
  assert.equal(HARDWARE_BUFFER_CAPS.partsPerBackend, 320);
});
