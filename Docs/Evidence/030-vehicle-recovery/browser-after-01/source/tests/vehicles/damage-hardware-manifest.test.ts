import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { HARDWARE_METRICS } from '../browser/vehicle-damage/hardware-collector';
import { metricPartId } from '../browser/vehicle-damage/hardware-parts';
import type { HardwarePartIdentity, MetricPart } from '../browser/vehicle-damage/hardware-parts';
import type {
  HardwareRunManifest,
  FrozenHardwareBuild,
} from '../browser/vehicle-damage/hardware-run-manifest';
import { verifyRunManifest } from '../browser/vehicle-damage/hardware-run-manifest';
import { verifyCompleteRun } from '../browser/vehicle-damage/hardware-verifier';
import type { TracePart, HeapPart } from '../browser/vehicle-damage/hardware-verifier';
function fixture() {
  const identity: HardwarePartIdentity = {
    captureId: '20261006T000000000Z',
    backend: 'WEBGPU',
    arm: 'CURRENT_029',
    pair: 0,
    observer: true,
    runOrdinal: 3,
    sourceHash: 'a'.repeat(64),
    artifactHash: 'b'.repeat(64),
    nativeHash: 'c'.repeat(64),
  };
  const build: FrozenHardwareBuild = {
    ...identity,
    archivedAt: '2026-10-05T23:59:00.000Z',
    referenceProvenanceHash: 'd'.repeat(64),
  };
  const parts: MetricPart[] = HARDWARE_METRICS.map((metric) => ({
    version: '029-metric-part-v1',
    identity,
    metric,
    distribution: ['gpuDurationMs', 'inputCommandLatencyMs'].includes(metric)
      ? null
      : {
          version: '029-histogram-v1',
          bins: 4096,
          widthMs: 0.025,
          observations: 7200,
          overflowCount: 0,
          overflowMinMs: null,
          overflowMaxMs: null,
          entries: [[40, 7200]],
        },
  }));
  const endpoints = [
    { phase: 'BEFORE_WARMUP', timeMs: 0, usedBytes: 100, totalBytes: 200, limitBytes: 1000 },
    { phase: 'BEFORE_MEASURE', timeMs: 30000, usedBytes: 100, totalBytes: 200, limitBytes: 1000 },
    { phase: 'AFTER_MEASURE', timeMs: 150000, usedBytes: 100, totalBytes: 200, limitBytes: 1000 },
  ] as const;
  const hashes = Array.from({ length: 58 }, (_, index) => ({
      tick: 1920 + 120 * index,
      hash: 'e'.repeat(64),
    })),
    checkpointHash = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
  const traceId = `${identity.captureId}-WEBGPU-3-trace`,
    heapId = `${identity.captureId}-WEBGPU-3-heap`;
  const run: HardwareRunManifest = {
    version: '029-run-manifest-v1',
    identity,
    firstWorldAt: '2026-10-06T00:00:00.000Z',
    startedAt: '2026-10-06T00:00:00.010Z',
    completedAt: '2026-10-06T00:02:31.000Z',
    warmupWallMs: 30000,
    measuredWallMs: 120000,
    measuredFrames: 7200,
    warmupTicks: 1800,
    measuredTicks: 7200,
    tickCounts: Array(70).fill(7200),
    simulationWallRatio: 1,
    maximumRafGapMs: 16.7,
    guards: {
      foreground: true,
      visible: true,
      contextAlive: true,
      running: true,
      overloadCount: 0,
      dpr: 1,
      css: [1920, 1080],
      internal: [1920, 1080],
      renderer: 'WEBGPU',
      gpu: 'AMD hardware',
    },
    endpoints,
    heapPeak: { usedBytes: 100, samples: 120, cadenceMs: 1000 },
    partIds: [...parts.map(metricPartId), traceId, heapId],
    cleanup: {
      vehicles: 0,
      subscriptions: 0,
      collisionColliders: 0,
      controllerVehicles: 0,
      damageRegistrations: 0,
      damageHistory: 0,
      disposedReadRejected: true,
    },
    physicalHash: 'e'.repeat(64),
    checkpointHash,
    checkpointCount: 58,
    bufferAccounting: {
      histogramBytes: 147456,
      heapBytes: 8192,
      traceBytes: 24576,
      hashScratchBytes: 8960,
      actorTickBytes: 280,
      endpointBytes: 0,
      persistentTotal: 189464,
      checkpointCodecMaximumBytes: 131072,
      pendingCheckpointCapacity: 64,
    },
  };
  const trace: TracePart = {
    version: '029-trace-part-v1',
    identity,
    partId: traceId,
    hashes,
    rows: 58,
    values: Array(58 * 3 * 16).fill(0),
    physicalHash: run.physicalHash,
    checkpointHash,
    actualEndTick: 9000,
    actualEndHash: 'f'.repeat(64),
  };
  const heap: HeapPart = {
    version: '029-heap-part-v1',
    identity,
    partId: heapId,
    endpoints,
    rows: Array.from({ length: 120 }, (_, index) => [30016 + index * 1000, 100, 200, 1000]).flat(),
    sampleCount: 120,
    cadenceMs: 1000,
    scope: 'Test proxy',
  };
  return { identity, build, parts, run, trace, heap };
}
test('run manifest independently rejects required-null and per-tick/RAF count forgery', () => {
  const f = fixture();
  assert.equal(
    verifyRunManifest(f.run, f.parts, f.identity, f.build).memoryAvailability,
    'AVAILABLE',
  );
  const nullRequired = f.parts.map((part) =>
    part.metric === 'controllerTickMs' ? { ...part, distribution: null } : part,
  );
  assert.throws(
    () =>
      verifyRunManifest(
        {
          ...f.run,
          bufferAccounting: {
            ...f.run.bufferAccounting,
            histogramBytes: f.run.bufferAccounting.histogramBytes - 16384,
            persistentTotal: f.run.bufferAccounting.persistentTotal - 16384,
          },
        },
        nullRequired,
        f.identity,
        f.build,
      ),
    /Required timing/,
  );
  assert.throws(
    () => verifyRunManifest({ ...f.run, measuredFrames: 7199 }, f.parts, f.identity, f.build),
    /sample correlation/,
  );
  assert.throws(
    () =>
      verifyRunManifest(
        { ...f.run, tickCounts: [...Array(69).fill(7200), 0] },
        f.parts,
        f.identity,
        f.build,
      ),
    /All70/,
  );
  assert.throws(
    () => verifyRunManifest({ ...f.run, simulationWallRatio: 0.99 }, f.parts, f.identity, f.build),
    /real-wall ratio/,
  );
});
test('full-window immutable trace and raw heap peak are independently recomputed', () => {
  const f = fixture();
  assert.equal(
    verifyCompleteRun(f.run, f.parts, f.trace, f.heap, f.identity, f.build).checkpointCount,
    58,
  );
  assert.throws(
    () =>
      verifyCompleteRun(
        f.run,
        f.parts,
        {
          ...f.trace,
          hashes: f.trace.hashes.map((point, index) =>
            index === 1 ? { ...point, tick: 2041 } : point,
          ),
        },
        f.heap,
        f.identity,
        f.build,
      ),
    /checkpoint addresses/,
  );
  assert.throws(
    () =>
      verifyCompleteRun(
        f.run,
        f.parts,
        f.trace,
        { ...f.heap, rows: [30016, 101, 200, 1000, ...f.heap.rows.slice(4)] },
        f.identity,
        f.build,
      ),
    /observed lower-bound peak/,
  );
  assert.throws(
    () =>
      verifyCompleteRun(
        f.run,
        f.parts,
        { ...f.trace, actualEndTick: 9001 },
        f.heap,
        f.identity,
        f.build,
      ),
    /Actual variable endpoint/,
  );
  assert.throws(
    () =>
      verifyRunManifest(
        { ...f.run, warmupTicks: 1764, warmupWallMs: 30999 },
        f.parts,
        f.identity,
        f.build,
      ),
    /Warmup real-wall/,
  );
});
