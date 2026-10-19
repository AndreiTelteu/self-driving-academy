import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPerformanceCollector,
  distribution,
  createPerformanceReport,
  type PerformanceReport,
} from '../../src/telemetry/performance.ts';

test('nearest rank percentiles, histogram and strict budget on known data', () => {
  const result = distribution(
    Float64Array.from({ length: 100 }, (_, i) => i + 1),
    100,
    50,
  )!;
  assert.equal(result.p50, 50);
  assert.equal(result.p95, 95);
  assert.equal(result.p99, 99);
  assert.equal(result.mean, 50.5);
  assert.equal(result.overBudget, 50);
  assert.equal(
    result.histogram.reduce((sum, value) => sum + value, 0),
    100,
  );
  assert.equal(distribution(new Float64Array(0), 0), null);
  assert.throws(() => distribution(Float64Array.of(NaN), 1));
});
test('collector caps allocations, reports overflow and rejects lifecycle misuse', () => {
  assert.throws(() => createPerformanceCollector(60001));
  const collector = createPerformanceCollector(2);
  collector.record('frameMs', 1);
  collector.record('frameMs', 2);
  collector.record('frameMs', 3);
  collector.record('gpuMs', null, 'Timer unavailable');
  const result = collector.finish();
  assert.equal(result.bufferBytes, 2 * 11 * 8 + 11 * 4);
  assert.equal(result.dropped, 1);
  assert.equal(result.complete, false);
  assert.equal(result.metrics.frameMs.distribution?.count, 2);
  assert.deepEqual(result.metrics.gpuMs, {
    status: 'unavailable',
    reason: 'Timer unavailable',
    distribution: null,
  });
  assert.equal(result.metrics.inputToCommandMs.distribution, null);
  assert.throws(() => collector.record('frameMs', 1), /finalized/);
});
test('disabled collector allocates no sample buffers and unavailable APIs never become zero', () => {
  const collector = createPerformanceCollector(60000, false);
  collector.record('frameMs', 12);
  const result = collector.finish();
  assert.equal(result.bufferBytes, 44);
  assert.equal(result.metrics.frameMs.distribution, null);
  assert.equal(result.metrics.gpuMs.distribution, null);
});
function reportInput(): Omit<
  PerformanceReport,
  'schemaVersion' | 'capturedAt' | 'gameplayGate' | 'overhead'
> {
  const metric = distribution(Float64Array.of(1, 2, 3), 3)!;
  return {
    role: 'portable-cpu',
    scope: 'Synthetic parser test, never hardware evidence',
    identity: {
      commit: 'a'.repeat(40),
      sourceHash: 'b'.repeat(64),
      budgetVersion: 'test',
      fixtureVersion: 'test',
      engineVersion: 'none',
      physicsVersion: null,
      mapVersion: null,
      seeds: [42],
      hardware: {},
      browser: null,
      backend: 'CPU',
      preset: 'none',
      cssResolution: null,
      internalResolution: null,
      devicePixelRatio: null,
      cache: 'not applicable',
      network: 'not applicable',
      powerState: 'unknown',
    },
    coldLoad: [],
    warmLoad: [],
    unavailable: { gpu: 'no API', memory: 'no API' },
    exclusions: [],
    runs: Array.from({ length: 10 }, (_, index) => ({
      repeat: Math.floor(index / 2) + 1,
      seed: 42,
      enabled: index % 2 === 1,
      warmupMs: 1,
      activeDurationMs: 2,
      wallDurationMs: 2,
      collector: createPerformanceCollector(2, index % 2 === 1).finish(),
      referenceCpuMs: metric,
      referenceFrameMs: null,
      simulation: {
        clock: 'synthetic',
        measuredWallSeconds: 0.002,
        simulatedSeconds: 1,
        admittedClockSeconds: 1,
        ratio: 1,
        tick: 60,
        overloads: 0,
      },
      resources: { exactPageMemoryBytes: null },
    })),
  };
}
test('reports require five complete pairs, own metadata, preserve missing data and reject nonfinite values', () => {
  const input = reportInput();
  const report = createPerformanceReport(input);
  assert.equal(report.gameplayGate, 'NOT_VALIDATED');
  assert.equal(report.overhead.length, 5);
  assert.equal(report.runs[0].resources.exactPageMemoryBytes, null);
  (input.identity.hardware as Record<string, unknown>).changed = 'later mutation';
  assert.equal(report.identity.hardware.changed, undefined);
  assert.throws(() => createPerformanceReport({ ...input, runs: input.runs.slice(1) }));
  assert.throws(() =>
    createPerformanceReport({ ...input, identity: { ...input.identity, commit: 'unknown' } }),
  );
  assert.throws(
    () =>
      createPerformanceReport({
        ...input,
        identity: { ...input.identity, hardware: { bad: Infinity } },
      }),
    /Nonfinite/,
  );
});
test('hardware baseline rejects short durations, overflow and missing pair identity', () => {
  const input = reportInput();
  assert.throws(
    () => createPerformanceReport({ ...input, role: 'hardware-browser' }),
    /30s warmup/,
  );
  const hardware = {
    ...input,
    role: 'hardware-browser' as const,
    runs: input.runs.map((run) => ({ ...run, warmupMs: 30000, activeDurationMs: 120000 })),
  };
  assert.equal(createPerformanceReport(hardware).runs.length, 10);
  const overflow = {
    ...hardware,
    runs: hardware.runs.map((run) => ({
      ...run,
      collector: { ...run.collector, complete: false, dropped: 1 },
    })),
  };
  assert.throws(() => createPerformanceReport(overflow), /overflowing/);
  assert.throws(
    () =>
      createPerformanceReport({
        ...hardware,
        runs: hardware.runs.map((run) => ({ ...run, repeat: 1 })),
      }),
    /Invalid paired/,
  );
});
