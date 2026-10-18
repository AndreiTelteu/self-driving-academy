import { verifyRafProof, verifyHeap } from './browser-observation';
import {
  HARDWARE_METRICS,
  REQUIRED_ON_METRICS,
  validateHistogram,
  quantileInterval,
  absoluteVerdict,
} from '../vehicle-damage/hardware-collector';
import type { HistogramSnapshot } from '../vehicle-damage/hardware-collector';
export const PROTOCOL = Object.freeze({
  version: '030-browser-before-v1',
  runs: 10,
  pairs: 5,
  warmMs: 30000,
  measuredMs: 120000,
  cars: 70,
  hz: 60,
  partBytes: 128 * 1024,
  partsPerRun: 16,
  partsPerBackend: 160,
  minimumRatio: 0.98,
  checkpointCount: 58,
  lastCheckpoint: 8760,
});
export interface Identity {
  captureId: string;
  backend: 'WEBGPU' | 'WEBGL2';
  runOrdinal: number;
  pair: number;
  observer: boolean;
  arm: 'REFERENCE_030';
  sourceHash: string;
  artifactHash: string;
  nativeHash: string;
}
export interface Build {
  version: string;
  commit: string;
  sourceHash: string;
  artifactHash: string;
  nativeHash: string;
  archivedAt: string;
  budgets: Record<string, number>;
}
export interface Part {
  identity: Identity;
  kind: 'metric' | 'trace' | 'heap';
  metric?: string;
  distribution?: HistogramSnapshot | null;
  [key: string]: unknown;
}
export interface Run {
  identity: Identity;
  firstWorldAt: string;
  startedAt: string;
  completedAt: string;
  warmupWallMs: number;
  measuredWallMs: number;
  warmupTicks: number;
  measuredTicks: number;
  measuredFrames: number;
  tickCounts: number[];
  simulationWallRatio: number;
  maximumRafGapMs: number;
  warmupRatio: number;
  guards: {
    foreground: boolean;
    visible: boolean;
    contextAlive: boolean;
    running: boolean;
    overloadCount: number;
    dpr: number;
    css: number[];
    internal: number[];
    renderer: string;
    gpu: string;
  };
  parts: string[];
  cleanup: Record<string, number | boolean>;
  buffers: Record<string, number>;
  [key: string]: unknown;
}
export function sequence() {
  return Array.from({ length: 5 }, (_, pair) =>
    (pair % 2 ? [true, false] : [false, true]).map((observer) => ({ pair, observer })),
  )
    .flat()
    .map((v, runOrdinal) => ({ ...v, runOrdinal }));
}
const check = (v: unknown, message: string) => {
  if (!v) throw new Error(message);
};
export const partId = (i: Identity, name: string) =>
  `run-${String(i.runOrdinal).padStart(2, '0')}-${name}`;
export function memorySummary(values: string[]) {
  return values.length > 0 &&
    values.every((v) => v === 'RAW_PROXY_BASELINE' || v === 'RAW_JS_PROXY_BASELINE_ONLY')
    ? 'RAW_JS_PROXY_BASELINE_ONLY'
    : 'UNVALIDATED';
}
export function optionalVerdict(results: { available: boolean; verdict: string }[]) {
  return results.every((r) => !r.available)
    ? 'NOT_MEASURED'
    : results.some((r) => r.available && r.verdict === 'FAIL')
      ? 'FAIL'
      : results.some((r) => r.available && r.verdict === 'UNVALIDATED')
        ? 'UNVALIDATED'
        : 'PASS';
}
export function verifyRun(run: Run, parts: Part[], build: Build) {
  const expected = sequence()[run.identity.runOrdinal];
  check(
    expected && run.identity.pair === expected.pair && run.identity.observer === expected.observer,
    'Exact canonical sequence',
  );
  check(run.identity.arm === 'REFERENCE_030', 'Actualad32 reference arm');
  for (const k of ['sourceHash', 'artifactHash', 'nativeHash'] as const)
    check(run.identity[k] === build[k], 'Frozen ' + k);
  check(
    Date.parse(build.archivedAt) <= Date.parse(run.firstWorldAt) &&
      Date.parse(run.firstWorldAt) <= Date.parse(run.startedAt) &&
      Date.parse(run.startedAt) <= Date.parse(run.completedAt),
    'World chronology',
  );
  check(
    [
      run.warmupWallMs,
      run.measuredWallMs,
      run.warmupRatio,
      run.simulationWallRatio,
      run.maximumRafGapMs,
    ].every(Number.isFinite),
    'Finite timing/ratios',
  );
  check(
    run.warmupWallMs >= 30000 &&
      run.warmupWallMs <= 30250 &&
      run.measuredWallMs >= 120000 &&
      run.measuredWallMs <= 120250,
    'Full30/120 finiteendpoint',
  );
  check(
    Number.isSafeInteger(run.warmupTicks) &&
      Number.isSafeInteger(run.measuredTicks) &&
      Number.isSafeInteger(run.measuredFrames),
    'Integer tick/framecounts',
  );
  check(
    Math.abs(run.warmupRatio - run.warmupTicks / 60 / (run.warmupWallMs / 1000)) < 1e-12,
    'Warmcadencerecomputed',
  );
  check(run.warmupRatio >= 0.98 && run.simulationWallRatio >= 0.98, 'Real cadence');
  check(
    Math.abs(run.simulationWallRatio - run.measuredTicks / 60 / (run.measuredWallMs / 1000)) <
      1e-12,
    'Ratio recomputed',
  );
  check(run.warmupTicks + run.measuredTicks >= 8760, 'Reachable common checkpoint');
  check(
    run.tickCounts.length === 70 && run.tickCounts.every((t) => t === run.measuredTicks),
    'Every physical actor',
  );
  check(run.measuredFrames > 0 && run.maximumRafGapMs <= 250, 'Actual RAF');
  const g = run.guards;
  check(
    g.foreground &&
      g.visible &&
      g.contextAlive &&
      g.running &&
      g.overloadCount === 0 &&
      g.dpr === 1,
    'Run guards',
  );
  check(
    JSON.stringify(g.css) === '[1920,1080]' &&
      JSON.stringify(g.internal) === '[1920,1080]' &&
      g.renderer === run.identity.backend &&
      /AMD/i.test(g.gpu) &&
      !/swiftshader|llvmpipe|software rasterizer/i.test(g.gpu),
    'Actualhardware/context',
  );
  check(parts.length === run.parts.length && parts.length <= 16, 'Complete parts');
  for (const p of parts)
    check(JSON.stringify(p.identity) === JSON.stringify(run.identity), 'Part frozenidentity');
  const metrics = parts.filter((p) => p.kind === 'metric');
  const expectedMetrics = run.identity.observer ? HARDWARE_METRICS : ['frameIntervalMs'];
  check(
    JSON.stringify(metrics.map((p) => p.metric).sort()) ===
      JSON.stringify([...expectedMetrics].sort()),
    'Exact metric inventory',
  );
  const verdicts: Record<string, string> = {};
  for (const p of metrics) {
    if (p.distribution !== null && p.distribution !== undefined) {
      validateHistogram(p.distribution);
      const count = ['frameIntervalMs', 'mainThreadFrameMs', 'renderCpuMs'].includes(p.metric!)
        ? run.measuredFrames
        : run.measuredTicks;
      check(p.distribution.observations === count, 'All measured observations ' + p.metric);
    } else
      check(
        ['gpuDurationMs', 'inputCommandLatencyMs'].includes(p.metric!),
        'Required channel unavailable',
      );
  }
  const by = (key: string) => metrics.find((p) => p.metric === key)?.distribution ?? null;
  for (const key of REQUIRED_ON_METRICS)
    if (run.identity.observer) check(by(key) !== null, 'Required ON metric');
  for (const [key, budget, p] of [
    ['frameIntervalMs', build.budgets.frameP95Ms, 0.95],
    ['frameIntervalMs', build.budgets.frameP99Ms, 0.99],
    ['mainThreadFrameMs', build.budgets.mainThreadP95Ms, 0.95],
    ['controllerTickMs', build.budgets.authoritativeTickP95Ms, 0.95],
    ['rapierStepMs', build.budgets.rapierStepP95Ms, 0.95],
    ['gpuDurationMs', build.budgets.gpuP95Ms, 0.95],
    ['inputCommandLatencyMs', build.budgets.inputToCommandP95Ms, 0.95],
  ] as const)
    if (run.identity.observer || key === 'frameIntervalMs')
      verdicts[key + '/' + p] = absoluteVerdict(quantileInterval(by(key), p), budget);
  const frameMetric = by('frameIntervalMs');
  check(frameMetric !== null, 'Framehistrequired');
  verifyRafProof(
    run.raf as Parameters<typeof verifyRafProof>[0],
    frameMetric!,
    run.measuredWallMs,
    run.measuredTicks,
  );
  const trace = parts.find((p) => p.kind === 'trace');
  check(
    trace && trace.rows === 58 && Array.isArray(trace.hashes) && trace.hashes.length === 58,
    'All58 common checkpoints',
  );
  check(
    trace!.actualEndTick === run.warmupTicks + run.measuredTicks &&
      trace!.actualEndTick === (run.raf as { nativeAfter: number }).nativeAfter,
    'Actualendtickcounter',
  );
  (trace!.hashes as { tick: number; hash: string }[]).forEach((h, i) =>
    check(h.tick === 1920 + i * 120 && /^[a-f0-9]{64}$/.test(h.hash), 'Exact physical checkpoint'),
  );
  const optionalEntries = Object.entries(verdicts).filter(
    ([key]) => key.startsWith('gpu') || key.startsWith('input'),
  );
  const optional = optionalVerdict(
    optionalEntries.map(([key, verdict]) => ({
      available: by(key.split('/')[0]) !== null,
      verdict,
    })),
  );
  const heap = parts.find((p) => p.kind === 'heap');
  check(
    heap && Array.isArray(heap.endpoints) && heap.endpoints.length === 3,
    'Matching phase endpoints',
  );
  const endpoints = heap!.endpoints as {
    phase: string;
    usedBytes: number | null;
    timeMs: number;
  }[];
  check(
    JSON.stringify(endpoints.map((e) => e.phase)) ===
      JSON.stringify(['BEFORE_WARMUP', 'BEFORE_MEASURE', 'AFTER_MEASURE']),
    'Exactheap phases',
  );
  check(
    endpoints.every(
      (e) =>
        Number.isFinite(e.timeMs) &&
        (e.usedBytes === null || (Number.isFinite(e.usedBytes) && e.usedBytes > 0)),
    ),
    'Actualheap values',
  );
  check(
    endpoints[0].timeMs <= endpoints[1].timeMs && endpoints[1].timeMs <= endpoints[2].timeMs,
    'Heapchronology',
  );
  check(run.cleanup.disposedReadRejected === true, 'Disposednative read rejected');
  for (const key of [
    'vehicles',
    'subscriptions',
    'collisionColliders',
    'controllerVehicles',
    'damageRegistrations',
    'damageHistory',
  ])
    check(run.cleanup[key] === 0, 'Zero nativeowner ' + key);
  const memory = verifyHeap(
    heap!.endpoints as Parameters<typeof verifyHeap>[0],
    heap!.rows as number[],
    run.identity.observer,
    run.measuredWallMs,
    heap!.sampleCount as number,
    heap!.peakUsedBytes as number | null,
  );
  for (const resource of ['Meshes', 'Materials', 'Lights', 'Cameras'])
    check(
      run.cleanup['renderer' + resource + 'Before'] ===
        run.cleanup['renderer' + resource + 'After'],
      'Actualrendererownership ' + resource,
    );
  const required = Object.entries(verdicts)
    .filter(([key]) => !key.startsWith('gpu') && !key.startsWith('input'))
    .some(([, v]) => v === 'FAIL')
    ? 'FAIL'
    : Object.entries(verdicts)
          .filter(([key]) => !key.startsWith('gpu') && !key.startsWith('input'))
          .some(([, v]) => v === 'UNVALIDATED')
      ? 'UNVALIDATED'
      : 'PASS';
  return {
    required,
    optional,
    overall:
      required === 'FAIL' || optional === 'FAIL'
        ? 'FAIL'
        : required === 'UNVALIDATED' ||
            optional === 'NOT_MEASURED' ||
            optional === 'UNVALIDATED' ||
            memory === 'UNVALIDATED'
          ? 'UNVALIDATED'
          : 'PASS',
    absolute: verdicts,
    memory,
    relative: 'AFTER_PENDING',
  };
}
