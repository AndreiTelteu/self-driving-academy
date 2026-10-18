import { createHash } from 'node:crypto';
import { absoluteVerdict, relativeVerdict, fivePairVerdict } from './hardware-collector';
import type { Verdict } from './hardware-collector';
import { verifyRunManifest } from './hardware-run-manifest';
import type { FrozenHardwareBuild, HardwareRunManifest } from './hardware-run-manifest';
import type { HardwarePartIdentity, MetricPart } from './hardware-parts';
export function optionalTimingGate(absolute: readonly Verdict[], unavailable: boolean): Verdict {
  return absolute.includes('FAIL')
    ? 'FAIL'
    : absolute.includes('UNVALIDATED') || unavailable
      ? 'UNVALIDATED'
      : 'PASS';
}
export function rejectTerminalMarkers(files: readonly string[]) {
  check(
    !files.some((name) => /failure|rejected|incomplete/i.test(name)),
    'Terminal failure/rejected/incomplete capture cannot verify PASS',
  );
}
function check(value: boolean, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export interface TracePart {
  version: '029-trace-part-v1';
  identity: HardwarePartIdentity;
  partId: string;
  hashes: readonly { tick: number; hash: string }[];
  rows: number;
  values: readonly number[];
  physicalHash: string;
  checkpointHash: string;
  actualEndTick: number;
  actualEndHash: string;
}
export interface HeapPart {
  version: '029-heap-part-v1';
  identity: HardwarePartIdentity;
  partId: string;
  endpoints: HardwareRunManifest['endpoints'];
  rows: readonly number[];
  sampleCount: number;
  cadenceMs: number;
  scope: string;
}
export function verifyCompleteRun(
  run: HardwareRunManifest,
  metrics: readonly MetricPart[],
  trace: TracePart,
  heap: HeapPart,
  expected: HardwarePartIdentity,
  build: FrozenHardwareBuild,
) {
  const result = verifyRunManifest(run, metrics, expected, build);
  for (const part of [trace, heap]) {
    check(run.partIds.includes(part.partId), 'Ancillary part manifest');
    for (const key of Object.keys(expected) as (keyof HardwarePartIdentity)[])
      check(part.identity[key] === expected[key], `Ancillary identity:${key}`);
  }
  check(
    trace.version === '029-trace-part-v1' &&
      trace.partId === `${expected.captureId}-${expected.backend}-${expected.runOrdinal}-trace`,
    'Trace schema/ID',
  );
  check(
    trace.rows === 58 &&
      trace.hashes.length === 58 &&
      trace.values.length === 58 * 3 * 16 &&
      trace.values.every(Number.isFinite),
    'Bounded full fixed trace',
  );
  check(
    trace.hashes.every(
      (point, index) => point.tick === 1920 + 120 * index && /^[a-f0-9]{64}$/.test(point.hash),
    ),
    'All58 exact checkpoint addresses',
  );
  const recomputed = createHash('sha256').update(JSON.stringify(trace.hashes)).digest('hex');
  check(
    trace.checkpointHash === recomputed &&
      run.checkpointHash === recomputed &&
      trace.physicalHash === trace.hashes.at(-1)!.hash &&
      run.physicalHash === trace.physicalHash,
    'Recomputed aggregate hash and final common8760',
  );
  check(
    Number.isSafeInteger(trace.actualEndTick) &&
      trace.actualEndTick === run.warmupTicks + run.measuredTicks &&
      trace.actualEndTick >= 8760 &&
      /^[a-f0-9]{64}$/.test(trace.actualEndHash),
    'Actual variable endpoint separately retained',
  );
  check(
    heap.version === '029-heap-part-v1' &&
      heap.partId === `${expected.captureId}-${expected.backend}-${expected.runOrdinal}-heap`,
    'Heap schema/ID',
  );
  check(
    JSON.stringify(heap.endpoints) === JSON.stringify(run.endpoints),
    'Exact same-phase raw heap endpoints',
  );
  check(
    heap.cadenceMs === 1000 &&
      Number.isSafeInteger(heap.sampleCount) &&
      heap.sampleCount >= 0 &&
      heap.sampleCount <= 256 &&
      heap.rows.length === heap.sampleCount * 4 &&
      heap.rows.every(Number.isFinite),
    'Bounded heap rows',
  );
  if (!expected.observer)
    check(heap.sampleCount === 0 && run.heapPeak === null, 'OFF has endpoints only');
  let peak = 0,
    lastTime = -Infinity;
  for (let index = 0; index < heap.sampleCount; index++) {
    const [time, used, total, limit] = heap.rows.slice(index * 4, index * 4 + 4);
    check(
      time >= run.endpoints[1].timeMs &&
        time <= run.endpoints[2].timeMs &&
        time > lastTime &&
        used >= 0 &&
        total >= used &&
        limit >= total,
      'Actual measured heap phases/units',
    );
    if (index)
      check(
        time - lastTime >= 750 && time - lastTime <= 1250,
        'Declared1Hz sampling under normal RAF guards',
      );
    lastTime = time;
    peak = Math.max(peak, used);
  }
  check(
    run.heapPeak === null
      ? heap.sampleCount === 0
      : run.heapPeak.samples === heap.sampleCount && run.heapPeak.usedBytes === peak,
    'Recomputed observed lower-bound peak',
  );
  const absolute = result.metrics.map((metric) => ({
    metric: metric.metric,
    p95: absoluteVerdict(
      metric.p95,
      metric.metric === 'frameIntervalMs'
        ? 18.5
        : metric.metric === 'mainThreadFrameMs'
          ? 10
          : metric.metric === 'controllerTickMs'
            ? 5.5
            : metric.metric === 'rapierStepMs'
              ? 3
              : metric.metric === 'gpuDurationMs'
                ? 12
                : metric.metric === 'inputCommandLatencyMs'
                  ? 50
                  : Number.MAX_VALUE,
    ),
    ...(metric.metric === 'frameIntervalMs' ? { p99: absoluteVerdict(metric.p99, 25) } : {}),
  }));
  return {
    ...result,
    absolute,
    physicalHash: run.physicalHash,
    checkpointHash: run.checkpointHash,
    checkpointCount: 58,
    heapAfterMeasureBytes: run.endpoints[2].usedBytes,
    heapPeakBytes: run.heapPeak?.usedBytes ?? null,
    actualEndTick: trace.actualEndTick,
    actualEndHash: trace.actualEndHash,
    warmupWallMs: run.warmupWallMs,
    measuredWallMs: run.measuredWallMs,
    measuredFrames: run.measuredFrames,
    measuredTicks: run.measuredTicks,
    simulationWallRatio: run.simulationWallRatio,
    bufferAccounting: run.bufferAccounting,
  };
}
export type VerifiedRun = ReturnType<typeof verifyCompleteRun>;
function rawHeapVerdict(before: number | null, after: number | null): Verdict {
  return before === null || after === null
    ? 'UNVALIDATED'
    : after > 1.1 * before && after - before > 5 * 1024 * 1024
      ? 'FAIL'
      : 'PASS';
}
export function compareBackend(runs: readonly VerifiedRun[]) {
  check(
    runs.length === 20 && new Set(runs.map((run) => run.identity.runOrdinal)).size === 20,
    'Full normal20run protocol',
  );
  const find = (pair: number, observer: boolean, arm: HardwarePartIdentity['arm']) => {
    const run = runs.find(
      (value) =>
        value.identity.pair === pair &&
        value.identity.observer === observer &&
        value.identity.arm === arm,
    );
    check(run !== undefined, 'Missing normal run');
    return run;
  };
  for (let pair = 0; pair < 5; pair++)
    for (const observer of [false, true]) {
      const before = find(pair, observer, 'PUBLISHED_027'),
        after = find(pair, observer, 'CURRENT_029');
      check(
        before.identity.captureId === after.identity.captureId &&
          before.identity.backend === after.identity.backend &&
          before.identity.sourceHash === after.identity.sourceHash &&
          before.identity.artifactHash === after.identity.artifactHash &&
          before.identity.nativeHash === after.identity.nativeHash,
        'Frozen same capture comparison',
      );
      check(
        before.checkpointHash === after.checkpointHash &&
          before.physicalHash === after.physicalHash,
        'All58 current/reference physical+command checkpoint hashes exact',
      );
    }
  const relative = ['frameIntervalMs', 'mainThreadFrameMs', 'controllerTickMs', 'rapierStepMs'].map(
    (metric) => {
      const flags = Array.from({ length: 5 }, (_, pair) => {
        const before = find(pair, true, 'PUBLISHED_027').metrics.find(
            (value) => value.metric === metric,
          )!,
          after = find(pair, true, 'CURRENT_029').metrics.find((value) => value.metric === metric)!;
        return relativeVerdict(before.p95, after.p95);
      });
      return { metric, pairs: flags, verdict: fivePairVerdict(flags) };
    },
  );
  const memory = [false, true].map((observer) => {
    const endpoint = Array.from({ length: 5 }, (_, pair) =>
      rawHeapVerdict(
        find(pair, observer, 'PUBLISHED_027').heapAfterMeasureBytes,
        find(pair, observer, 'CURRENT_029').heapAfterMeasureBytes,
      ),
    );
    const peak = observer
      ? Array.from({ length: 5 }, (_, pair) =>
          rawHeapVerdict(
            find(pair, true, 'PUBLISHED_027').heapPeakBytes,
            find(pair, true, 'CURRENT_029').heapPeakBytes,
          ),
        )
      : null;
    return {
      observer,
      endpointPairs: endpoint,
      endpoint: fivePairVerdict(endpoint),
      peakPairs: peak,
      observedPeak: peak ? fivePairVerdict(peak) : null,
    };
  });
  const requiredAbsolute = runs.flatMap((run) =>
    run.absolute
      .filter((value) =>
        ['frameIntervalMs', 'mainThreadFrameMs', 'controllerTickMs', 'rapierStepMs'].includes(
          value.metric,
        ),
      )
      .flatMap((value) => [value.p95, ...(value.p99 ? [value.p99] : [])]),
  );
  const observerPerturbation = (['PUBLISHED_027', 'CURRENT_029'] as const).map((arm) => ({
    arm,
    pairs: Array.from({ length: 5 }, (_, pair) => {
      const off = find(pair, false, arm),
        on = find(pair, true, arm);
      return {
        pair,
        off: {
          frameP95: off.metrics.find((metric) => metric.metric === 'frameIntervalMs')!.p95,
          measuredWallMs: off.measuredWallMs,
          rawHeapEndpoint: off.heapAfterMeasureBytes,
          persistentTypedBytes: off.bufferAccounting.persistentTotal,
        },
        on: {
          frameP95: on.metrics.find((metric) => metric.metric === 'frameIntervalMs')!.p95,
          measuredWallMs: on.measuredWallMs,
          rawHeapEndpoint: on.heapAfterMeasureBytes,
          persistentTypedBytes: on.bufferAccounting.persistentTotal,
        },
        scope:
          'OFF/ON observed perturbation, not exact observer CPU cost; OFF has no timing channels/observed heap peak',
      };
    }),
  }));
  const values = [
    ...requiredAbsolute,
    ...relative.map((value) => value.verdict),
    ...memory.flatMap((value) => [
      value.endpoint,
      ...(value.observedPeak ? [value.observedPeak] : []),
    ]),
  ];
  const verdict: Verdict = values.includes('FAIL')
    ? 'FAIL'
    : values.includes('UNVALIDATED')
      ? 'UNVALIDATED'
      : 'PASS';
  const optionalTimingAvailability = runs.map((run) => ({
    runOrdinal: run.identity.runOrdinal,
    unavailable: run.metrics
      .filter((metric) => metric.observations === null)
      .map((metric) => metric.metric),
  }));
  const optionalAbsolute = runs
    .filter((run) => run.identity.observer)
    .flatMap((run) =>
      run.absolute
        .filter((value) => ['gpuDurationMs', 'inputCommandLatencyMs'].includes(value.metric))
        .map((value) => value.p95),
    );
  const optionalTimingVerdict = optionalTimingGate(
    optionalAbsolute,
    optionalTimingAvailability.some((row) => row.unavailable.length > 0),
  );
  return {
    version: '029-backend-comparison-v1',
    backend: runs[0].identity.backend,
    captureId: runs[0].identity.captureId,
    runCount: 20,
    exactCrossArmCheckpoints: 5 * 2 * 58,
    relative,
    memory,
    requiredAbsolute,
    observerPerturbation,
    requiredCpuFrameMemoryVerdict: verdict,
    optionalTimingVerdict,
    verdict:
      verdict === 'FAIL' || optionalTimingVerdict === 'FAIL'
        ? 'FAIL'
        : verdict === 'UNVALIDATED' || optionalTimingVerdict === 'UNVALIDATED'
          ? 'UNVALIDATED'
          : 'PASS',
    limits: {
      scope:
        'Separate postimplementation hardware control; original chronological CPUbaseline and historical failures retained',
      heap: 'Observed Chrome JSproxy endpoints/1Hz lower-bound peak, not true/native/WASM/totalRAM',
      optionalTimings: optionalTimingAvailability,
      optionalTimingReasons:
        'Current source does not associate GPU queries with every measured frame; GPU null/UNVALIDATED. Scripted native commands do not measure external input latency; input null/UNVALIDATED. No zeros or whole-protocol PASS inferred.',
    },
  };
}
