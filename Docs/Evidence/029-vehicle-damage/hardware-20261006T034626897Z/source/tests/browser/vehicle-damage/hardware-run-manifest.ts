import { REQUIRED_ON_METRICS, HARDWARE_BUFFER_CAPS } from './hardware-collector';
import { verifyMetricSet } from './hardware-parts';
import type { HardwarePartIdentity, MetricPart } from './hardware-parts';
import { HARDWARE_PROTOCOL } from './hardware-protocol';

export interface FrozenHardwareBuild {
  readonly sourceHash: string;
  readonly artifactHash: string;
  readonly nativeHash: string;
  readonly archivedAt: string;
  readonly referenceProvenanceHash: string;
}
export interface HeapEndpoint {
  readonly phase: 'BEFORE_WARMUP' | 'BEFORE_MEASURE' | 'AFTER_MEASURE';
  readonly timeMs: number;
  readonly usedBytes: number | null;
  readonly totalBytes: number | null;
  readonly limitBytes: number | null;
}
export interface HardwareRunManifest {
  readonly version: '029-run-manifest-v1';
  readonly identity: HardwarePartIdentity;
  readonly firstWorldAt: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly warmupWallMs: number;
  readonly measuredWallMs: number;
  readonly measuredFrames: number;
  readonly warmupTicks: number;
  readonly measuredTicks: number;
  readonly tickCounts: readonly number[];
  readonly simulationWallRatio: number;
  readonly maximumRafGapMs: number;
  readonly guards: {
    readonly foreground: boolean;
    readonly visible: boolean;
    readonly contextAlive: boolean;
    readonly running: boolean;
    readonly overloadCount: number;
    readonly dpr: number;
    readonly css: readonly number[];
    readonly internal: readonly number[];
    readonly renderer: string;
    readonly gpu: string;
  };
  readonly endpoints: readonly HeapEndpoint[];
  readonly heapPeak: {
    readonly usedBytes: number;
    readonly samples: number;
    readonly cadenceMs: 1000;
  } | null;
  readonly partIds: readonly string[];
  readonly cleanup: {
    readonly vehicles: number;
    readonly subscriptions: number;
    readonly collisionColliders: number;
    readonly controllerVehicles: number;
    readonly damageRegistrations: number;
    readonly damageHistory: number;
    readonly disposedReadRejected: boolean;
  };
  readonly physicalHash: string;
  readonly checkpointHash: string;
  readonly checkpointCount: number;
  readonly bufferAccounting: {
    readonly histogramBytes: number;
    readonly heapBytes: number;
    readonly traceBytes: number;
    readonly hashScratchBytes: number;
    readonly actorTickBytes: number;
    readonly endpointBytes: number;
    readonly persistentTotal: number;
    readonly checkpointCodecMaximumBytes: number;
    readonly pendingCheckpointCapacity: number;
  };
}
function check(value: boolean, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
function finite(value: number) {
  return Number.isFinite(value) && value >= 0;
}
export function verifyRunManifest(
  run: HardwareRunManifest,
  parts: readonly MetricPart[],
  expected: HardwarePartIdentity,
  build: FrozenHardwareBuild,
) {
  check(run.version === '029-run-manifest-v1', 'Run manifest version');
  check(
    build.sourceHash === expected.sourceHash &&
      build.artifactHash === expected.artifactHash &&
      build.nativeHash === expected.nativeHash,
    'Frozen build identity',
  );
  check(
    /^[a-f0-9]{64}$/.test(build.referenceProvenanceHash),
    'Published reference provenance proof',
  );
  for (const key of Object.keys(expected) as (keyof HardwarePartIdentity)[])
    check(run.identity[key] === expected[key], `Run identity:${key}`);
  const archive = Date.parse(build.archivedAt),
    first = Date.parse(run.firstWorldAt),
    start = Date.parse(run.startedAt),
    end = Date.parse(run.completedAt);
  check(
    [archive, first, start, end].every(Number.isFinite) &&
      archive <= first &&
      first <= start &&
      start <= end,
    'Source archive before first world chronology',
  );
  check(
    finite(run.warmupWallMs) && run.warmupWallMs >= 30000 && run.warmupWallMs < 31000,
    'Normal full warmup',
  );
  check(
    finite(run.measuredWallMs) && run.measuredWallMs >= 120000 && run.measuredWallMs < 121000,
    'Normal full measurement',
  );
  check(
    Number.isSafeInteger(run.measuredFrames) &&
      run.measuredFrames > 0 &&
      run.measuredFrames <= 100000,
    'Measured RAF count',
  );
  check(
    Number.isSafeInteger(run.warmupTicks) && run.warmupTicks >= 1764 && run.warmupTicks <= 1860,
    'Warmup physical ticks',
  );
  check(
    run.warmupTicks / 60 / (run.warmupWallMs / 1000) >= HARDWARE_PROTOCOL.simulationWallMinimum,
    'Warmup real-wall ratio proves common8760 reachability without tail steps',
  );
  check(
    Number.isSafeInteger(run.measuredTicks) &&
      run.measuredTicks >= 7056 &&
      run.measuredTicks <= 7260,
    'Measured physical ticks',
  );
  check(
    run.tickCounts.length === 70 && run.tickCounts.every((count) => count === run.measuredTicks),
    'All70 physically stepped actors',
  );
  const ratio = run.measuredTicks / 60 / (run.measuredWallMs / 1000);
  check(
    finite(run.simulationWallRatio) &&
      Math.abs(ratio - run.simulationWallRatio) < 1e-12 &&
      ratio >= HARDWARE_PROTOCOL.simulationWallMinimum,
    'Simulation real-wall ratio',
  );
  check(finite(run.maximumRafGapMs) && run.maximumRafGapMs <= 250, 'RAF gap');
  const guard = run.guards;
  check(
    guard.foreground &&
      guard.visible &&
      guard.contextAlive &&
      guard.running &&
      guard.overloadCount === 0,
    'Focus/context/fixedtick normal guards',
  );
  check(
    guard.dpr === 1 &&
      guard.css.length === 2 &&
      guard.internal.length === 2 &&
      guard.css.every((v, i) => v === [1920, 1080][i]) &&
      guard.internal.every((v, i) => v === [1920, 1080][i]),
    'Actual owned canvas resolution',
  );
  check(
    guard.renderer === expected.backend &&
      typeof guard.gpu === 'string' &&
      /AMD/i.test(guard.gpu) &&
      !/swiftshader|llvmpipe|software rasterizer/i.test(guard.gpu),
    'Actual AMD requested backend',
  );
  const results = verifyMetricSet(parts, expected);
  const buffers = run.bufferAccounting;
  check(
    buffers.histogramBytes ===
      parts.filter((part) => part.distribution !== null).length * 4096 * 4 &&
      buffers.heapBytes === (expected.observer ? 256 * 4 * 8 : 0) &&
      buffers.traceBytes === 64 * 3 * 16 * 8 &&
      buffers.hashScratchBytes === 70 * 16 * 8 &&
      buffers.actorTickBytes === 70 * 4 &&
      buffers.endpointBytes === 0,
    'Explicit actual persistent typed-buffer ownership',
  );
  check(
    buffers.persistentTotal ===
      buffers.histogramBytes +
        buffers.heapBytes +
        buffers.traceBytes +
        buffers.hashScratchBytes +
        buffers.actorTickBytes &&
      buffers.checkpointCodecMaximumBytes === 128 * 1024 &&
      buffers.pendingCheckpointCapacity === 64,
    'Persistent bytes and bounded transient crypto codec; excludes JS/internal GPU/native memory',
  );
  for (const result of results) {
    const perFrame = ['frameIntervalMs', 'mainThreadFrameMs', 'renderCpuMs'].includes(
      result.metric,
    );
    const perTick = [
      'controllerTickMs',
      'rapierStepMs',
      'nativeControllerMs',
      'nativeQueryMs',
      'nativeBridgeMs',
      'drivetrainStageMs',
    ].includes(result.metric);
    if (result.observations !== null)
      check(
        result.observations ===
          (perFrame ? run.measuredFrames : perTick ? run.measuredTicks : result.observations),
        'Metric sample correlation',
      );
    if (
      REQUIRED_ON_METRICS.includes(result.metric as (typeof REQUIRED_ON_METRICS)[number]) &&
      (expected.observer || result.metric === 'frameIntervalMs')
    )
      check(result.observations !== null && result.observations > 0, 'Required timing unavailable');
  }
  check(
    run.partIds.length <= HARDWARE_BUFFER_CAPS.partsPerRun &&
      new Set(run.partIds).size === run.partIds.length,
    'Complete bounded part identifiers',
  );
  check(
    run.partIds.length === parts.length + 2 &&
      results.every((result) => run.partIds.includes(result.partId)),
    'Manifest binds all metric, trace and heap parts',
  );
  check(
    run.endpoints.length === 3 &&
      run.endpoints.every(
        (point, i) =>
          point.phase === ['BEFORE_WARMUP', 'BEFORE_MEASURE', 'AFTER_MEASURE'][i] &&
          finite(point.timeMs) &&
          [point.usedBytes, point.totalBytes, point.limitBytes].every(
            (v) => v === null || finite(v),
          ),
      ),
    'Matched raw heap phases',
  );
  check(
    run.endpoints[0].timeMs < run.endpoints[1].timeMs &&
      run.endpoints[1].timeMs < run.endpoints[2].timeMs,
    'Heap endpoint order',
  );
  check(
    !expected.observer
      ? run.heapPeak === null
      : run.heapPeak === null ||
          (finite(run.heapPeak.usedBytes) &&
            Number.isSafeInteger(run.heapPeak.samples) &&
            run.heapPeak.samples >= 120 &&
            run.heapPeak.samples <= 256 &&
            run.heapPeak.cadenceMs === 1000),
    'ON-only bounded observed heap peak',
  );
  const cleanup = run.cleanup;
  check(
    [
      cleanup.vehicles,
      cleanup.subscriptions,
      cleanup.collisionColliders,
      cleanup.controllerVehicles,
      cleanup.damageRegistrations,
      cleanup.damageHistory,
    ].every((v) => v === 0) && cleanup.disposedReadRejected,
    'Actual disposed ownership',
  );
  check(
    /^[a-f0-9]{64}$/.test(run.physicalHash) &&
      /^[a-f0-9]{64}$/.test(run.checkpointHash) &&
      run.checkpointCount === 58 &&
      run.warmupTicks + run.measuredTicks >= 8760,
    'Physical/checkpoint hashes',
  );
  return Object.freeze({
    identity: expected,
    metrics: results,
    memoryAvailability:
      run.endpoints.every((point) => point.usedBytes !== null) &&
      (!expected.observer || run.heapPeak !== null)
        ? 'AVAILABLE'
        : 'UNVALIDATED',
  });
}
