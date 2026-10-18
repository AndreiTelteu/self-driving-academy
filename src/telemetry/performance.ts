import { profileForFixture, VALIDATION_PROFILES } from './validation-protocol';
/** Portable, bounded instrumentation. Never reads browser globals or modifies game state. */
export const PERFORMANCE_METRICS = [
  'frameMs',
  'mainThreadMs',
  'tickCpuMs',
  'simulationCpuMs',
  'debtMs',
  'gpuMs',
  'inputToCommandMs',
  'learningQueueMs',
  'learningServiceMs',
  'learningEndToEndMs',
  'checkpointAgeMs',
] as const;
export type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];
export interface Distribution {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly overBudget: number | null;
  /** Exclusive upper bounds 1,4,8,16.67,25,50 ms; last bucket is >=50. */
  readonly histogram: readonly number[];
}
export interface MetricResult {
  readonly status: 'available' | 'unavailable';
  readonly reason: string | null;
  readonly distribution: Distribution | null;
}
export function distribution(
  values: Float64Array,
  count: number,
  budget: number | null = null,
): Distribution | null {
  if (!Number.isSafeInteger(count) || count < 0 || count > values.length)
    throw new RangeError('Invalid sample count');
  if (budget !== null && (!Number.isFinite(budget) || budget < 0))
    throw new RangeError('Invalid budget');
  if (!count) return null;
  const sorted = values.slice(0, count).sort();
  const bounds = [1, 4, 8, 16.67, 25, 50];
  const histogram = new Array<number>(7).fill(0);
  let total = 0,
    overBudget = 0;
  for (const value of sorted) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid sample');
    total += value;
    if (budget !== null && value > budget) overBudget++;
    const bucket = bounds.findIndex((bound) => value < bound);
    histogram[bucket < 0 ? 6 : bucket]++;
  }
  const at = (fraction: number) => sorted[Math.ceil(count * fraction) - 1];
  return {
    count,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    min: sorted[0],
    max: sorted[count - 1],
    mean: total / count,
    overBudget: budget === null ? null : overBudget,
    histogram,
  };
}
export interface CollectorSnapshot {
  readonly enabled: boolean;
  readonly capacityPerMetric: number;
  readonly bufferBytes: number;
  readonly dropped: number;
  readonly complete: boolean;
  readonly metrics: Readonly<Record<PerformanceMetric, MetricResult>>;
}
export function createPerformanceCollector(capacity = 60000, enabled = true) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 60000)
    throw new RangeError('Collector capacity must be 1..60000');
  const buffers = PERFORMANCE_METRICS.map(() => new Float64Array(enabled ? capacity : 0));
  const counts = new Uint32Array(PERFORMANCE_METRICS.length);
  const reasons = PERFORMANCE_METRICS.map(() => 'No samples supplied for this scope');
  let dropped = 0;
  let finished = false;
  return {
    record(
      metric: PerformanceMetric,
      value: number | null,
      unavailableReason = 'API unavailable or asynchronous result pending',
    ) {
      if (finished) throw new Error('Collector is finalized');
      const index = PERFORMANCE_METRICS.indexOf(metric);
      if (index < 0) throw new RangeError('Unknown metric');
      if (value === null) {
        reasons[index] = unavailableReason;
        return;
      }
      if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid performance sample');
      if (!enabled) return;
      if (counts[index] >= capacity) {
        dropped++;
        return;
      }
      buffers[index][counts[index]++] = value;
    },
    finish(budgets: Partial<Record<PerformanceMetric, number>> = {}): CollectorSnapshot {
      finished = true;
      const metrics = {} as Record<PerformanceMetric, MetricResult>;
      PERFORMANCE_METRICS.forEach((metric, index) => {
        const measured = distribution(buffers[index], counts[index], budgets[metric] ?? null);
        metrics[metric] = {
          status: measured ? 'available' : 'unavailable',
          reason: measured
            ? null
            : enabled
              ? reasons[index]
              : 'Collector disabled for overhead comparison',
          distribution: measured,
        };
      });
      return {
        enabled,
        capacityPerMetric: capacity,
        bufferBytes: buffers.reduce(
          (bytes, buffer) => bytes + buffer.byteLength,
          counts.byteLength,
        ),
        dropped,
        complete: dropped === 0,
        metrics,
      };
    },
  };
}
export interface PerformanceIdentity {
  readonly commit: string;
  readonly sourceHash: string;
  readonly budgetVersion: string;
  readonly fixtureVersion: string;
  readonly engineVersion: string;
  readonly physicsVersion: string | null;
  readonly mapVersion: string | null;
  readonly seeds: readonly number[];
  readonly hardware: Readonly<Record<string, unknown>>;
  readonly browser: string | null;
  readonly backend: string;
  readonly preset: string;
  readonly cssResolution: readonly number[] | null;
  readonly internalResolution: readonly number[] | null;
  readonly devicePixelRatio: number | null;
  readonly cache: string;
  readonly network: string;
  readonly powerState: string;
}
export interface PerformanceRun {
  readonly repeat: number;
  readonly seed: number;
  readonly enabled: boolean;
  readonly warmupMs: number;
  readonly activeDurationMs: number;
  readonly wallDurationMs: number;
  readonly collector: CollectorSnapshot;
  /** Small common reference observer present in both arms; distinct from optional collector. */
  readonly referenceCpuMs: Distribution;
  readonly referenceFrameMs: Distribution | null;
  readonly simulation: {
    readonly clock: 'real-raf' | 'synthetic';
    readonly measuredWallSeconds: number;
    readonly simulatedSeconds: number;
    readonly admittedClockSeconds: number;
    readonly ratio: number | null;
    readonly tick: number;
    readonly overloads: number;
  };
  readonly resources: Readonly<Record<string, number | null>>;
  readonly gpuTimer?: {
    readonly status: string;
    readonly sampleWindow: string;
    readonly percentiles: {
      readonly count: number;
      readonly p50: number;
      readonly p95: number;
      readonly p99: number;
    } | null;
  };
  readonly longTasks?: {
    readonly supported: boolean;
    readonly count: number | null;
    readonly maximumMs: number | null;
    readonly overflow: boolean;
  };
}
export interface PerformanceReport {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly role: 'portable-cpu' | 'hardware-browser';
  readonly identity: PerformanceIdentity;
  readonly scope: string;
  readonly gameplayGate: 'NOT_VALIDATED';
  readonly coldLoad: readonly Readonly<Record<string, unknown>>[];
  readonly warmLoad: readonly Readonly<Record<string, unknown>>[];
  readonly runs: readonly PerformanceRun[];
  readonly overhead: readonly {
    readonly repeat: number;
    readonly cpuP95DeltaMs: number;
    readonly totalWallDeltaMs: number;
  }[];
  readonly unavailable: Readonly<Record<string, string>>;
  readonly exclusions: readonly string[];
}
/** Finalize after all measurements; callers must not serialize during a measured frame. */
export function createPerformanceReport(
  input: Omit<PerformanceReport, 'schemaVersion' | 'capturedAt' | 'gameplayGate' | 'overhead'>,
): PerformanceReport {
  const { identity, runs } = input;
  if (!/^[a-f0-9]{40}$/.test(identity.commit) || !/^[a-f0-9]{64}$/.test(identity.sourceHash))
    throw new Error('Missing real build identity');
  if (
    ![
      identity.budgetVersion,
      identity.fixtureVersion,
      identity.engineVersion,
      identity.backend,
      identity.preset,
      identity.cache,
      identity.network,
      identity.powerState,
      input.scope,
    ].every((text) => typeof text === 'string' && text.length > 0 && text.length <= 4096)
  )
    throw new Error('Incomplete report metadata');
  if (
    !identity.seeds.length ||
    identity.seeds.length > 5 ||
    !identity.seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0)
  )
    throw new Error('Invalid seeds');
  const protocol = VALIDATION_PROFILES[profileForFixture(identity.fixtureVersion)];
  const repetitions = protocol.pairs;
  if (
    runs.length !== repetitions * 2 ||
    input.coldLoad.length > repetitions ||
    input.warmLoad.length > repetitions
  )
    throw new Error('Complete bounded paired repetitions required');
  const overhead = [];
  for (let repeat = 1; repeat <= repetitions; repeat++) {
    const pair = runs.filter((run) => run.repeat === repeat);
    const on = pair.find((run) => run.enabled),
      off = pair.find((run) => !run.enabled);
    if (
      pair.length !== 2 ||
      !on ||
      !off ||
      on.seed !== off.seed ||
      !identity.seeds.includes(on.seed)
    )
      throw new Error('Invalid paired repetition');
    for (const run of pair) {
      if (
        !run.collector.complete ||
        run.collector.enabled !== run.enabled ||
        run.referenceCpuMs.count < 1 ||
        ![run.warmupMs, run.activeDurationMs, run.wallDurationMs].every(
          (value) => Number.isFinite(value) && value >= 0,
        )
      )
        throw new Error('Incomplete or overflowing measurement');
      if (
        input.role === 'hardware-browser' &&
        !identity.fixtureVersion.endsWith('-SMOKE') &&
        (run.warmupMs < protocol.warmupMs ||
          run.activeDurationMs < protocol.measuredMs ||
          run.longTasks?.overflow)
      )
        throw new Error(
          `Hardware protocol requires ${protocol.warmupMs / 1000}s warmup and ${protocol.measuredMs / 1000}s measurement without overflow`,
        );
    }
    overhead.push({
      repeat,
      cpuP95DeltaMs: on.referenceCpuMs.p95 - off.referenceCpuMs.p95,
      totalWallDeltaMs: on.wallDurationMs - off.wallDurationMs,
    });
  }
  const report: PerformanceReport = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    ...input,
    gameplayGate: 'NOT_VALIDATED',
    overhead,
  };
  // Defensive owned copy is made only after measuring; later caller writes cannot change exports.
  const encoded = JSON.stringify(report, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('Nonfinite report value');
    return value;
  });
  if (encoded.length > 1024 * 1024) throw new Error('Report exceeds 1 MiB export cap');
  return JSON.parse(encoded) as PerformanceReport;
}
