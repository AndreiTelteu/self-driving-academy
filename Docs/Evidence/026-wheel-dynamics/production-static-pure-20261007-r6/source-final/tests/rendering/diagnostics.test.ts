import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DiagnosticsCollector,
  UNAVAILABLE_DIAGNOSTIC_COUNTERS,
} from '../../src/rendering/diagnostics';
test('fixed ring retains recent values, exact percentiles and bounded numeric bytes', () => {
  const collector = new DiagnosticsCollector(3);
  for (const cpuRenderMs of [100, 1, 2, 3])
    collector.record({ cpuRenderMs, frameMs: 16, gpuMs: null, tickCpuMs: null });
  const report = collector.report('WEBGL2', 'unsupported');
  assert.equal(report.retainedSamples, 3);
  assert.equal(report.bufferBytes, 96);
  assert.deepEqual(report.cpuRenderMs, { count: 3, p50: 2, p95: 3, p99: 3 });
  assert.equal(report.gpuMs, null);
  assert.equal(report.tickCpuMs, null);
});
test('missing timers stay unavailable; fresh measured GPU zero remains valid', () => {
  const collector = new DiagnosticsCollector();
  collector.record({ cpuRenderMs: 1, frameMs: null, gpuMs: 0, tickCpuMs: 2 });
  const report = collector.report('WEBGPU', 'timer available');
  assert.equal(report.gpuMs?.p95, 0);
  assert.equal(report.frameMs, null);
});
test('disabled collector performs no admission and reenabling starts a fresh window', () => {
  const collector = new DiagnosticsCollector();
  collector.setEnabled(false);
  assert.equal(
    collector.record({ cpuRenderMs: -1, frameMs: null, gpuMs: null, tickCpuMs: null }),
    false,
  );
  assert.equal(collector.report('WEBGL2', 'disabled').retainedSamples, 0);
  collector.setEnabled(true);
  assert.throws(() =>
    collector.record({ cpuRenderMs: NaN, frameMs: 1, gpuMs: null, tickCpuMs: null }),
  );
  assert.equal(collector.report('WEBGL2', 'supported').retainedSamples, 0);
});
test('counter projections are copied/frozen and invalid capacity/counters reject', () => {
  assert.throws(() => new DiagnosticsCollector(4097));
  const collector = new DiagnosticsCollector();
  const counters = { ...UNAVAILABLE_DIAGNOSTIC_COUNTERS, tick: 10, pendingBytes: 128 };
  const report = collector.report('WEBGL2', 'unsupported', null, counters);
  counters.tick = 11;
  assert.equal(report.counters.tick, 10);
  assert(Object.isFrozen(report.counters));
  assert.throws(() =>
    collector.report('WEBGL2', 'unsupported', null, { ...counters, queuedJobs: -1 }),
  );
});
