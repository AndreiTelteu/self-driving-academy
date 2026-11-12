/**
 * PBI 159 — analiza deterministă a sesiunii lungi (soak).
 *
 * Raportul este derivat exclusiv din măsurătoarea comisă și din manifestul de bugete citit la rulare.
 * Nu inventează valori: o metrică fără eșantioane este `NOT_MEASURED` cu motiv, iar un `PASS` fără
 * măsurătoare este respins de `verifySoakReport`.
 *
 * Tendința se calculează pe fereastra finală (ultimele 25 % din eșantioane) cu pragurile din
 * manifestul 203 (`regressionProposal`): o creștere este o regresie numai când depășește **și** 10 %
 * relativ **și** 5 MiB absolut. Pentru cozi și retenție se folosesc praguri absolute declarate mai
 * jos, plus cota din manifest.
 */
import type { SoakIncidentKind, SoakMeasurement, SoakMeasurementSample } from './soak-session';
import {
  SOAK_PLATEAU_WINDOW_FRACTION,
  SOAK_REQUIRED_CYCLES,
  SOAK_REQUIRED_MINUTES,
} from './soak-session';
import { budgetSource, round } from './hardware-budget';
import type { BudgetManifest } from './hardware-budget';

export const SOAK_REPORT_VERSION = '159-soak-report-v1' as const;

export type SoakTrendId =
  | 'heapUsedBytes'
  | 'rssBytes'
  | 'governorBytes'
  | 'governorJobs'
  | 'recorderChargedBytes'
  | 'retentionDbBytes'
  | 'retentionArtifacts';

export type SoakTrendClassification = 'PLATEAU' | 'GROWTH' | 'DECREASING';

export interface SoakTrend {
  readonly id: SoakTrendId;
  readonly unit: 'bytes' | 'count';
  readonly samples: number;
  readonly firstValue: number;
  readonly lastValue: number;
  readonly windowMedian: number;
  readonly windowMin: number;
  readonly windowMax: number;
  readonly growthWithinWindow: number;
  readonly growthRatio: number;
  readonly slopePerMinute: number;
  readonly allowedGrowth: number;
  readonly classification: SoakTrendClassification;
  readonly rule: string;
}

export type SoakCheckVerdict = 'PASS' | 'FAIL' | 'NOT_MEASURED';

export interface SoakBudgetCheck {
  readonly id: string;
  readonly metric: string;
  readonly observed: number | null;
  readonly unit: 'bytes' | 'count' | 'minutes' | 'ratio';
  readonly budget: number | null;
  readonly direction: 'maximum' | 'minimum';
  readonly source: string;
  readonly verdict: SoakCheckVerdict;
  readonly note: string;
}

export interface SoakThrottling {
  readonly status: 'OBSERVED' | 'NOT_OBSERVED' | 'NOT_MEASURED';
  readonly cpuSpeedMhzMin: number | null;
  readonly cpuSpeedMhzMax: number | null;
  readonly cpuSpeedMhzMedian: number | null;
  readonly cpuSpeedVariationRatio: number | null;
  readonly tickP50MinMs: number | null;
  readonly tickP95MinMs: number | null;
  readonly tickP95MaxMs: number | null;
  readonly tickP95Ratio: number | null;
  readonly maxDriftMs: number;
  readonly note: string;
}

export interface SoakIncidentSummary {
  readonly total: number;
  readonly recovered: number;
  readonly unrecovered: number;
  readonly byKind: Readonly<Record<SoakIncidentKind, number>>;
  readonly cancellationResponseMaxMs: number | null;
}

export interface SoakReport {
  readonly version: typeof SOAK_REPORT_VERSION;
  readonly fixtureVersion: string;
  readonly commit: string;
  readonly measuredAt: string;
  readonly environment: Readonly<{ cpuModel: string; logicalCores: number; node: string }>;
  readonly protocol: Readonly<{
    durationMinutes: number;
    cycles: number;
    sampleIntervalSeconds: number;
    workload: string;
    pacing: string;
  }>;
  readonly duration: Readonly<{
    actualMinutes: number;
    requiredMinutes: number;
    passesMinimum: boolean;
    simulatedSeconds: number;
  }>;
  readonly lifecycle: Readonly<{
    cycles: number;
    requiredCycles: number;
    passesMinimum: boolean;
    cleanCycles: number;
    reloads: number;
    racesDispatched: number;
    manualInterventions: number;
    learningSegments: number;
    learningActivations: number;
    workerJobs: number;
    checkpointsOffered: number;
    pipelineCommits: number;
  }>;
  readonly memory: Readonly<{
    baselineHeapUsedBytes: number;
    finalHeapUsedBytes: number;
    deltaHeapUsedBytes: number;
    baselineRssBytes: number;
    finalRssBytes: number;
    deltaRssBytes: number;
    allowedGrowthBytes: number;
    retained: boolean;
    baselineKind: 'FIRST_CYCLE_AFTER_RESET';
    coldBaselineHeapUsedBytes: number;
    coldBaselineRssBytes: number;
  }>;
  readonly trends: readonly SoakTrend[];
  readonly checks: readonly SoakBudgetCheck[];
  readonly incidents: SoakIncidentSummary;
  readonly throttling: SoakThrottling;
  readonly manifest: Readonly<{ budgetVersion: string; hashLike: string }>;
  readonly verdict: Readonly<{
    status: 'SOAK_PASS' | 'SOAK_FAIL' | 'DIAGNOSTIC';
    failures: readonly string[];
    diagnosticReasons: readonly string[];
  }>;
  readonly notes: readonly string[];
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('A median needs a sample');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function slopePerMinute(
  points: readonly { readonly atMs: number; readonly value: number }[],
): number {
  if (points.length < 2) return 0;
  const meanX = points.reduce((total, point) => total + point.atMs, 0) / points.length;
  const meanY = points.reduce((total, point) => total + point.value, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.atMs - meanX) * (point.value - meanY);
    denominator += (point.atMs - meanX) ** 2;
  }
  if (denominator === 0) return 0;
  return (numerator / denominator) * 60_000;
}

export function buildSoakTrend(input: {
  id: SoakTrendId;
  unit: 'bytes' | 'count';
  values: readonly { readonly atMs: number; readonly value: number }[];
  absoluteAllowance: number;
  relativeAllowance: number;
  /** `span` compares the min/max of the window; `slope` tolerates a bounded sawtooth (quota);
   *  `bounded` accepts any window that stays under the manifest cap. */
  mode: 'span' | 'slope' | 'bounded';
  /** Manifest cap used by `bounded`. */
  bound?: number;
  rule: string;
}): SoakTrend {
  if (input.values.length < 2)
    throw new RangeError(`Tendința ${input.id} are nevoie de cel puțin două eșantioane`);
  const windowSize = Math.max(2, Math.ceil(input.values.length * SOAK_PLATEAU_WINDOW_FRACTION));
  const window = input.values.slice(-windowSize);
  const windowValues = window.map((point) => point.value);
  const windowMedian = median(windowValues);
  const windowMin = Math.min(...windowValues);
  const windowMax = Math.max(...windowValues);
  const growth = windowMax - windowMin;
  const relative = input.relativeAllowance * Math.abs(windowMedian);
  const allowed =
    input.mode === 'bounded'
      ? (input.bound ?? input.absoluteAllowance)
      : Math.max(input.absoluteAllowance, relative);
  const slope = slopePerMinute(window);
  const windowMinutes = Math.max(
    (window[window.length - 1]!.atMs - window[0]!.atMs) / 60_000,
    1 / 60,
  );
  const projection = Math.abs(slope) * windowMinutes;
  const classification: SoakTrendClassification =
    input.mode === 'bounded'
      ? windowMax <= allowed
        ? 'PLATEAU'
        : 'GROWTH'
      : (input.mode === 'span' ? growth : projection) <= allowed
        ? 'PLATEAU'
        : window[window.length - 1]!.value < window[0]!.value
          ? 'DECREASING'
          : 'GROWTH';
  return Object.freeze({
    id: input.id,
    unit: input.unit,
    samples: input.values.length,
    firstValue: input.values[0]!.value,
    lastValue: input.values[input.values.length - 1]!.value,
    windowMedian,
    windowMin,
    windowMax,
    growthWithinWindow: growth,
    growthRatio: windowMedian === 0 ? 0 : growth / Math.abs(windowMedian),
    slopePerMinute: slope,
    allowedGrowth: allowed,
    classification,
    rule: input.rule,
  });
}

function manifestCap(manifest: BudgetManifest, id: string): number | null {
  const value = manifest.proposedCapacities[id];
  return value === null || value === undefined ? null : value;
}

function maximumCheck(input: {
  id: string;
  metric: string;
  observed: number | null;
  unit: SoakBudgetCheck['unit'];
  budget: number | null;
  source: string;
  note: string;
}): SoakBudgetCheck {
  const verdict: SoakCheckVerdict =
    input.observed === null || input.budget === null
      ? 'NOT_MEASURED'
      : input.observed <= input.budget
        ? 'PASS'
        : 'FAIL';
  return Object.freeze({
    id: input.id,
    metric: input.metric,
    observed: input.observed === null ? null : round(input.observed, 3),
    unit: input.unit,
    budget: input.budget,
    direction: 'maximum',
    source: input.source,
    verdict,
    note: input.note,
  });
}

function incidentKinds(): readonly SoakIncidentKind[] {
  return Object.freeze([
    'FLEET_BLOCKED',
    'WORKER_JOB_EXPIRED',
    'WORKER_QUEUE_PRESSURE',
    'LEARNING_SEGMENT_STALLED',
    'CHECKPOINT_STORE_STALLED',
    'RETENTION_OVER_QUOTA',
  ] as const);
}

interface SoakManifestExtensions {
  readonly memoryAbsoluteIncreaseBytes: number;
  readonly memoryRelativeIncrease: number;
  readonly cancellationTargetMaximumMs: number;
}

/** Fields that the 155 manifest reader does not model, read directly from the same JSON file. */
function readManifestExtensions(raw: unknown): SoakManifestExtensions {
  const source = raw as Record<string, unknown>;
  const regression = source?.regressionProposal as Record<string, unknown> | undefined;
  const workers = source?.workerSchedulingProposal as Record<string, unknown> | undefined;
  const absolute = regression?.memoryAbsoluteIncreaseBytes;
  const relative = regression?.memoryRelativeIncrease;
  const cancellation = workers?.cancellationResponseMaximumMs;
  if (typeof absolute !== 'number' || !Number.isFinite(absolute))
    throw new TypeError(
      'Docs/performance-budgets.json regressionProposal.memoryAbsoluteIncreaseBytes is missing',
    );
  if (typeof relative !== 'number' || !Number.isFinite(relative))
    throw new TypeError(
      'Docs/performance-budgets.json regressionProposal.memoryRelativeIncrease is missing',
    );
  if (typeof cancellation !== 'number' || !Number.isFinite(cancellation))
    throw new TypeError(
      'Docs/performance-budgets.json workerSchedulingProposal.cancellationResponseMaximumMs is missing',
    );
  return {
    memoryAbsoluteIncreaseBytes: absolute,
    memoryRelativeIncrease: relative,
    cancellationTargetMaximumMs: cancellation,
  };
}

function minimumCheck(input: {
  id: string;
  metric: string;
  observed: number | null;
  unit: SoakBudgetCheck['unit'];
  minimum: number | null;
  source: string;
  note: string;
}): SoakBudgetCheck {
  const verdict: SoakCheckVerdict =
    input.observed === null || input.minimum === null
      ? 'NOT_MEASURED'
      : input.observed >= input.minimum
        ? 'PASS'
        : 'FAIL';
  return Object.freeze({
    id: input.id,
    metric: input.metric,
    observed: input.observed === null ? null : round(input.observed, 3),
    unit: input.unit,
    budget: input.minimum,
    direction: 'minimum',
    source: input.source,
    verdict,
    note: input.note,
  });
}

export function buildSoakReport(input: {
  measurement: SoakMeasurement;
  manifest: BudgetManifest;
  /** The same JSON the manifest was parsed from; supplies fields the 155 reader does not model. */
  rawManifest: unknown;
}): SoakReport {
  const { measurement, manifest } = input;
  const extensions = readManifestExtensions(input.rawManifest);
  if (measurement.series.length < 2)
    throw new RangeError('Un soak fără serie de măsurători nu poate produce raport');
  const series = measurement.series;
  const byKind = Object.fromEntries(incidentKinds().map((kind) => [kind, 0])) as Record<
    SoakIncidentKind,
    number
  >;
  for (const incident of measurement.incidents) byKind[incident.kind] += 1;
  const cancellation = measurement.cycles
    .map((cycle) => cycle.maxCancellationMs)
    .filter((value): value is number => value !== null);
  const recovered = measurement.incidents.filter((incident) => incident.recovered).length;

  const recorderCap = manifestCap(manifest, 'recorderRamBytes');
  const workerCap = manifestCap(manifest, 'pendingWorkerPayloadBytes');
  const replayCap = manifestCap(manifest, 'optionalReplayStorageBytes');
  const diagnosticCap = manifestCap(manifest, 'diagnosticSamples');
  const heavyCap = manifestCap(manifest, 'heavyBackgroundJobs');
  const preparingCap = manifestCap(manifest, 'preparingCheckpoints');
  const committingCap = manifestCap(manifest, 'committingCheckpoints');

  const maxOf = (select: (sample: SoakMeasurementSample) => number): number =>
    Math.max(...series.map(select));
  /* The plateau is read at the lifecycle boundary: intra-cycle allocation rises while a world is
     alive and is released by the reset. Comparing the same phase across cycles detects a real leak
     instead of the normal sawtooth of one session. */
  const cyclePoints = (
    select: (cycle: (typeof measurement.cycles)[number]) => number,
  ): { atMs: number; value: number }[] =>
    measurement.cycles.map((cycle) => ({ atMs: cycle.finishedAtMs, value: select(cycle) }));
  const heapTrend = buildSoakTrend({
    id: 'heapUsedBytes',
    unit: 'bytes',
    values: cyclePoints((cycle) => cycle.heapAfterResetBytes),
    absoluteAllowance: extensions.memoryAbsoluteIncreaseBytes,
    relativeAllowance: extensions.memoryRelativeIncrease,
    mode: 'span',
    rule: 'după fiecare reset (GC forțat), creștere ≤ max(5 MiB, 10 % din mediană)',
  });
  const rssTrend = buildSoakTrend({
    id: 'rssBytes',
    unit: 'bytes',
    values: cyclePoints((cycle) => cycle.rssAfterResetBytes),
    absoluteAllowance: extensions.memoryAbsoluteIncreaseBytes,
    relativeAllowance: extensions.memoryRelativeIncrease,
    mode: 'span',
    rule: 'după fiecare reset, creștere ≤ max(5 MiB, 10 % din mediană)',
  });
  const governorBytesTrend = buildSoakTrend({
    id: 'governorBytes',
    unit: 'bytes',
    values: cyclePoints((cycle) => cycle.governorBytesAtEnd),
    absoluteAllowance: 1024 * 1024,
    relativeAllowance: 0,
    mode: 'span',
    rule: 'bytes în coada 221 la închiderea ciclului: interval ≤ max(1 MiB, 0)',
  });
  const governorJobsTrend = buildSoakTrend({
    id: 'governorJobs',
    unit: 'count',
    values: cyclePoints((cycle) => cycle.governorJobsAtEnd),
    absoluteAllowance: 1,
    relativeAllowance: 0,
    mode: 'span',
    rule: 'joburi în coada 221 la închiderea ciclului: interval ≤ 1',
  });
  const recorderTrend = buildSoakTrend({
    id: 'recorderChargedBytes',
    unit: 'bytes',
    values: cyclePoints((cycle) => cycle.peakRecorderBytes),
    absoluteAllowance: extensions.memoryAbsoluteIncreaseBytes,
    relativeAllowance: 0,
    mode: 'span',
    rule: 'vârful ferestrei 207 per ciclu: interval ≤ max(5 MiB, 0)',
  });
  const retentionTrend = buildSoakTrend({
    id: 'retentionDbBytes',
    unit: 'bytes',
    values: cyclePoints((cycle) => cycle.retentionDbBytesAfterCycle),
    absoluteAllowance: extensions.memoryAbsoluteIncreaseBytes,
    relativeAllowance: 0,
    mode: 'bounded',
    ...(replayCap === null ? {} : { bound: replayCap }),
    rule: 'retenția 132 rămâne sub cota durabilă din manifest; evacuarea la cotă este mărginită',
  });
  const retentionArtifactsTrend = buildSoakTrend({
    id: 'retentionArtifacts',
    unit: 'count',
    values: cyclePoints((cycle) => cycle.retentionArtifactsAfterCycle),
    absoluteAllowance: 8,
    relativeAllowance: 0,
    mode: 'slope',
    rule: 'panta numărului de artefacte 132 în fereastra finală ≤ 8',
  });
  const trends = Object.freeze([
    heapTrend,
    rssTrend,
    governorBytesTrend,
    governorJobsTrend,
    recorderTrend,
    retentionTrend,
    retentionArtifactsTrend,
  ]);

  const actualMinutes = measurement.durationMs / 60_000;
  const passesMinimumDuration = actualMinutes >= SOAK_REQUIRED_MINUTES;
  const passesMinimumCycles = measurement.cycles.length >= SOAK_REQUIRED_CYCLES;
  const cleanCycles = measurement.cycles.filter(
    (cycle) => !cycle.cleanupLeaked && cycle.bodiesAfterCleanup === 0,
  ).length;
  const reloads = measurement.cycles.filter((cycle) => cycle.reloadMs > 0).length;
  const simulatedSeconds =
    Math.round(
      measurement.cycles.reduce((total, cycle) => total + cycle.simulatedSeconds, 0) * 1000,
    ) / 1000;

  const maxPreparing = Math.max(...series.map((sample) => sample.queues.pipelinePreparingBytes));
  const maxTransferring = Math.max(
    ...series.map((sample) => sample.queues.pipelineTransferringBytes),
  );
  const maxCancellation = cancellation.length ? Math.max(...cancellation) : null;

  const checks: SoakBudgetCheck[] = [
    minimumCheck({
      id: 'soak.duration',
      metric: 'durata reală a soak-ului',
      observed: round(actualMinutes, 2),
      unit: 'minutes',
      minimum: SOAK_REQUIRED_MINUTES,
      source: 'PBI 159: minimum 60 de minute de timp de perete',
      note: 'măsurată cu ceasul procesului, nu simulată',
    }),
    minimumCheck({
      id: 'soak.cycles',
      metric: 'cicluri de lifecycle',
      observed: measurement.cycles.length,
      unit: 'count',
      minimum: SOAK_REQUIRED_CYCLES,
      source: 'PBI 159: 20 de cicluri lifecycle',
      note: `${passesMinimumCycles ? 'minimul' : 'sub minimul'} de ${SOAK_REQUIRED_CYCLES} cicluri`,
    }),
    minimumCheck({
      id: 'soak.cleanup',
      metric: 'cicluri cu cleanup complet',
      observed: cleanCycles,
      unit: 'count',
      minimum: measurement.cycles.length,
      source: 'PBI 159: fără creștere necontrolată de resurse',
      note: `din ${measurement.cycles.length}; corpurile revin la 0 după fiecare reset`,
    }),
    minimumCheck({
      id: 'soak.incidents',
      metric: 'incidente recuperate',
      observed: recovered,
      unit: 'count',
      minimum: measurement.incidents.length,
      source: 'PBI 159: blocajele sunt raportate și recuperabile',
      note: `${measurement.incidents.length} incidente, ${measurement.incidents.length - recovered} nerecuperate`,
    }),
    maximumCheck({
      id: 'memory.tracked',
      metric: 'creșterea heap-ului în fereastra finală',
      observed: heapTrend.growthWithinWindow,
      unit: 'bytes',
      budget: heapTrend.allowedGrowth,
      source: budgetSource(manifest, 'regressionProposal.memoryAbsoluteIncreaseBytes/relative'),
      note: 'heap JS măsurat după GC forțat; RSS este raportat separat, mai zgomotos',
    }),
    maximumCheck({
      id: 'memory.totalHeapBytes',
      metric: 'memoria exactă a paginii',
      observed: null,
      unit: 'bytes',
      budget: manifestCap(manifest, 'totalHeapBytes'),
      source: budgetSource(manifest, 'proposedCapacities.totalHeapBytes'),
      note: 'manifestul o lasă null; API-ul exact nu este portabil, se raportează heap/RSS și contoarele de ownership',
    }),
    maximumCheck({
      id: 'retention.recorderRamBytes',
      metric: 'vârful memoriei recorder-ului 207',
      observed: maxOf((sample) => sample.retention.recorderPeakChargedBytes),
      unit: 'bytes',
      budget: recorderCap,
      source: budgetSource(manifest, 'proposedCapacities.recorderRamBytes'),
      note: 'chargedBytes/peakChargedBytes raportate de contractul 207',
    }),
    maximumCheck({
      id: 'retention.optionalReplayStorageBytes',
      metric: 'retenția durabilă 132',
      observed: maxOf((sample) => sample.retention.retentionDbBytes),
      unit: 'bytes',
      budget: replayCap,
      source: budgetSource(manifest, 'proposedCapacities.optionalReplayStorageBytes'),
      note: 'ledger-ul 132 evacuează după export când cota este depășită',
    }),
    maximumCheck({
      id: 'retention.diagnosticSamples',
      metric: 'eșantioane reținute de recorder',
      observed: maxOf((sample) => sample.retention.recorderRetainedSamples),
      unit: 'count',
      budget: diagnosticCap,
      source: budgetSource(manifest, 'proposedCapacities.diagnosticSamples'),
      note: 'fereastra RAM a recorder-ului rămâne mărginită',
    }),
    maximumCheck({
      id: 'workers.pendingWorkerPayloadBytes',
      metric: 'bytes în așteptare în governor-ul 221',
      observed: maxOf((sample) => sample.queues.governorBytes),
      unit: 'bytes',
      budget: workerCap,
      source: budgetSource(manifest, 'proposedCapacities.pendingWorkerPayloadBytes'),
      note: 'coada de payloaduri a worker-ului',
    }),
    maximumCheck({
      id: 'workers.heavyBackgroundJobs',
      metric: 'joburi grele simultane',
      observed: maxOf((sample) => sample.queues.activeHeavyJobs),
      unit: 'count',
      budget: heavyCap,
      source: budgetSource(manifest, 'proposedCapacities.heavyBackgroundJobs'),
      note: 'cel mult un job greu simultan, conform 221',
    }),
    maximumCheck({
      id: 'workers.cancellationResponse',
      metric: 'răspuns la recuperarea unui job expirat',
      observed: maxCancellation,
      unit: 'count',
      budget: extensions.cancellationTargetMaximumMs,
      source: budgetSource(manifest, 'workerSchedulingProposal.cancellationResponseMaximumMs'),
      note:
        maxCancellation === null
          ? 'nicio anulare explicită nu a fost cronometrată'
          : 'răspunsul la anularea explicită a unui job opțional aflat în execuție',
    }),
    maximumCheck({
      id: 'storage.preparingCheckpoints',
      metric: 'generații de checkpoint în pregătire',
      observed: maxPreparing > 0 ? 1 : 0,
      unit: 'count',
      budget: preparingCap,
      source: budgetSource(manifest, 'proposedCapacities.preparingCheckpoints'),
      note: 'pipeline-ul 222 ține cel mult o generație în pregătire',
    }),
    maximumCheck({
      id: 'storage.committingCheckpoints',
      metric: 'generații de checkpoint în commit',
      observed: maxTransferring > 0 ? 1 : 0,
      unit: 'count',
      budget: committingCap,
      source: budgetSource(manifest, 'proposedCapacities.committingCheckpoints'),
      note: 'pipeline-ul 222 ține cel mult o generație în commit',
    }),
    maximumCheck({
      id: 'frame.renderFps',
      metric: 'cadența de render',
      observed: null,
      unit: 'count',
      budget: manifest.proposedBudgets.laptop.renderFps,
      source: budgetSource(manifest, 'proposedBudgets.laptop.renderFps'),
      note: 'proba este headless, fără renderer; FPS-ul nu este măsurabil aici și nu se raportează ca 0',
    }),
    maximumCheck({
      id: 'frame.gpuP95Ms',
      metric: 'lucrul GPU p95',
      observed: null,
      unit: 'count',
      budget: manifest.proposedBudgets.laptop.gpuP95Ms,
      source: budgetSource(manifest, 'proposedBudgets.laptop.gpuP95Ms'),
      note: 'fără renderer nu există timer GPU; valoarea rămâne null',
    }),
  ];

  const speeds = series
    .map((sample) => sample.timing.cpuSpeedMhzMedian)
    .filter((value): value is number => value !== null);
  const speedVariation =
    speeds.length < 2
      ? null
      : (Math.max(...speeds) - Math.min(...speeds)) / Math.max(1, median(speeds));
  const p95Values = series.map((sample) => sample.timing.tickP95Ms);
  const p95Min = Math.min(...p95Values);
  const p95Max = Math.max(...p95Values);
  const p95Ratio = p95Min > 0 ? p95Max / p95Min : null;
  const speeds2 = series
    .flatMap((sample) => [sample.timing.cpuSpeedMhzMin, sample.timing.cpuSpeedMhzMax])
    .filter((value): value is number => value !== null);
  const throttling: SoakThrottling = Object.freeze({
    status:
      (speedVariation !== null && speedVariation > 0.05) || (p95Ratio !== null && p95Ratio > 1.25)
        ? 'OBSERVED'
        : speeds.length === 0
          ? 'NOT_MEASURED'
          : 'NOT_OBSERVED',
    cpuSpeedMhzMin: speeds2.length ? Math.min(...speeds2) : null,
    cpuSpeedMhzMax: speeds2.length ? Math.max(...speeds2) : null,
    cpuSpeedMhzMedian: speeds.length ? median(speeds) : null,
    cpuSpeedVariationRatio: speedVariation === null ? null : round(speedVariation, 4),
    tickP50MinMs: Math.min(...series.map((sample) => sample.timing.tickP50Ms)),
    tickP95MinMs: p95Min,
    tickP95MaxMs: p95Max,
    tickP95Ratio: p95Ratio === null ? null : round(p95Ratio, 4),
    maxDriftMs: Math.max(...series.map((sample) => Math.abs(sample.timing.driftMs))),
    note: 'throttling-ul este raportat cu variația frecvenței citite din OS și cu variația p95 a tick-ului; absența unei variații nu dovedește absența throttling-ului termic',
  });

  const allowedMemoryGrowth = Math.max(
    extensions.memoryAbsoluteIncreaseBytes,
    extensions.memoryRelativeIncrease * measurement.cycles[0]!.heapAfterResetBytes,
  );
  const firstCycle = measurement.cycles[0]!;
  const lastCycle = measurement.cycles[measurement.cycles.length - 1]!;
  const deltaHeap = lastCycle.heapAfterResetBytes - firstCycle.heapAfterResetBytes;
  const deltaRss = lastCycle.rssAfterResetBytes - firstCycle.rssAfterResetBytes;
  const failures: string[] = [];
  for (const check of checks) if (check.verdict === 'FAIL') failures.push(check.id);
  for (const trend of trends)
    if (trend.classification === 'GROWTH') failures.push(`trend:${trend.id}`);
  if (measurement.incidents.some((incident) => !incident.recovered))
    failures.push('incidente nerecuperate');
  if (!passesMinimumDuration) failures.push('durata sub 60 de minute');
  if (!passesMinimumCycles) failures.push('mai puțin de 20 de cicluri');
  if (cleanCycles !== measurement.cycles.length) failures.push('cleanup incomplet într-un ciclu');
  if (deltaHeap > allowedMemoryGrowth) failures.push('memoria finală peste baseline');

  const diagnosticReasons: string[] = [];
  if (!passesMinimumDuration)
    diagnosticReasons.push(
      `rulare diagnostic de ${round(actualMinutes, 2)} min; un soak cere ${SOAK_REQUIRED_MINUTES} min`,
    );
  if (!passesMinimumCycles)
    diagnosticReasons.push(
      `${measurement.cycles.length} cicluri; un soak cere ${SOAK_REQUIRED_CYCLES}`,
    );
  const status: SoakReport['verdict']['status'] =
    diagnosticReasons.length > 0 ? 'DIAGNOSTIC' : failures.length === 0 ? 'SOAK_PASS' : 'SOAK_FAIL';

  return Object.freeze({
    version: SOAK_REPORT_VERSION,
    fixtureVersion: measurement.fixtureVersion,
    commit: measurement.commit,
    measuredAt: measurement.finishedAt,
    environment: Object.freeze({
      cpuModel: measurement.environment.cpuModel,
      logicalCores: measurement.environment.logicalCores,
      node: measurement.environment.node,
    }),
    protocol: Object.freeze({
      durationMinutes: measurement.protocol.durationMinutes,
      cycles: measurement.protocol.cycles,
      sampleIntervalSeconds: measurement.protocol.sampleIntervalSeconds,
      workload: measurement.protocol.workload,
      pacing: measurement.protocol.pacing,
    }),
    duration: Object.freeze({
      actualMinutes: round(actualMinutes, 3),
      requiredMinutes: SOAK_REQUIRED_MINUTES,
      passesMinimum: passesMinimumDuration,
      simulatedSeconds,
    }),
    lifecycle: Object.freeze({
      cycles: measurement.cycles.length,
      requiredCycles: SOAK_REQUIRED_CYCLES,
      passesMinimum: passesMinimumCycles,
      cleanCycles,
      reloads,
      racesDispatched: measurement.cycles.reduce(
        (total, cycle) => total + cycle.racesDispatched,
        0,
      ),
      manualInterventions: measurement.cycles.reduce(
        (total, cycle) => total + cycle.manualInterventions,
        0,
      ),
      learningSegments: measurement.cycles.reduce(
        (total, cycle) => total + cycle.learningSegments,
        0,
      ),
      learningActivations: measurement.cycles.reduce(
        (total, cycle) => total + cycle.learningActivations,
        0,
      ),
      workerJobs: measurement.cycles.reduce((total, cycle) => total + cycle.workerJobs, 0),
      checkpointsOffered: measurement.cycles.reduce(
        (total, cycle) => total + cycle.checkpointsOffered,
        0,
      ),
      pipelineCommits: measurement.cycles.reduce(
        (total, cycle) => total + cycle.pipelineCommits,
        0,
      ),
    }),
    memory: Object.freeze({
      baselineHeapUsedBytes: firstCycle.heapAfterResetBytes,
      finalHeapUsedBytes: lastCycle.heapAfterResetBytes,
      deltaHeapUsedBytes: deltaHeap,
      baselineRssBytes: firstCycle.rssAfterResetBytes,
      finalRssBytes: lastCycle.rssAfterResetBytes,
      deltaRssBytes: deltaRss,
      allowedGrowthBytes: Math.round(allowedMemoryGrowth),
      retained: deltaHeap <= allowedMemoryGrowth,
      baselineKind: 'FIRST_CYCLE_AFTER_RESET',
      coldBaselineHeapUsedBytes: measurement.baseline.memory.heapUsedBytes,
      coldBaselineRssBytes: measurement.baseline.memory.rssBytes,
    }),
    trends,
    checks: Object.freeze(checks),
    incidents: Object.freeze({
      total: measurement.incidents.length,
      recovered,
      unrecovered: measurement.incidents.length - recovered,
      byKind: Object.freeze(byKind),
      cancellationResponseMaxMs: maxCancellation,
    }),
    throttling,
    manifest: Object.freeze({
      budgetVersion: manifest.budgetVersion,
      hashLike: manifest.status,
    }),
    verdict: Object.freeze({
      status,
      failures: Object.freeze(failures),
      diagnosticReasons: Object.freeze(diagnosticReasons),
    }),
    notes: measurement.notes,
  });
}

/** Refuză un PASS fără dovadă: durată, cicluri, serie, tendințe, incidente și bugete citate. */
export function verifySoakReport(report: SoakReport): readonly string[] {
  const issues: string[] = [];
  if (report.verdict.status !== 'SOAK_PASS')
    issues.push(`verdictul este ${report.verdict.status}, nu SOAK_PASS`);
  if (!report.duration.passesMinimum)
    issues.push(`durata de ${report.duration.actualMinutes} min este sub minimul de 60`);
  if (!report.lifecycle.passesMinimum) issues.push(`${report.lifecycle.cycles} cicluri, sub 20`);
  if (report.lifecycle.cleanCycles !== report.lifecycle.cycles)
    issues.push('există cicluri cu cleanup incomplet');
  if (report.lifecycle.reloads < report.lifecycle.cycles - 1)
    issues.push('există cicluri fără reload cronometrat');
  if (report.trends.length < 5) issues.push('seria de tendințe este incompletă');
  for (const trend of report.trends) {
    if (trend.samples < 4) issues.push(`tendința ${trend.id} are mai puțin de 4 eșantioane`);
    if (trend.classification === 'GROWTH')
      issues.push(
        `tendința ${trend.id} crește cu ${Math.round(trend.growthWithinWindow)} peste pragul ${Math.round(
          trend.allowedGrowth,
        )}`,
      );
  }
  if (report.incidents.unrecovered > 0)
    issues.push(`${report.incidents.unrecovered} incidente nerecuperate`);
  if (!report.memory.retained)
    issues.push(
      `heap-ul final a crescut cu ${report.memory.deltaHeapUsedBytes} B peste baseline (permis ${report.memory.allowedGrowthBytes} B)`,
    );
  for (const check of report.checks) {
    if (check.verdict === 'PASS' && check.observed === null)
      issues.push(`verificarea ${check.id} este PASS fără măsurătoare`);
    if (check.verdict === 'NOT_MEASURED' && check.note.trim().length === 0)
      issues.push(`verificarea ${check.id} este NOT_MEASURED fără motiv`);
    if (
      check.budget !== null &&
      !check.source.startsWith('Docs/performance-budgets.json') &&
      !check.source.startsWith('PBI 159')
    )
      issues.push(`verificarea ${check.id} nu citează manifestul sau cerința PBI`);
  }
  if (report.commit.trim().length === 0) issues.push('raportul nu are commit');
  if (report.throttling.note.trim().length === 0)
    issues.push('throttling-ul nu are o notă de raportare');
  return Object.freeze(issues);
}

function mib(bytes: number, digits = 1): string {
  return (bytes / 1048576).toFixed(digits);
}

export function soakMarkdown(report: SoakReport): string {
  const lines: string[] = [];
  lines.push('# PBI 159 — soak de memorie și stabilitatea flotei');
  lines.push('');
  lines.push(
    `Raport determinist derivat din măsurătoarea comisă (${report.version}); bugetele sunt citite din ` +
      `manifestul \`${report.manifest.budgetVersion}\` și **nu** sunt modificate.`,
  );
  lines.push('');
  lines.push(`- Build: \`${report.commit}\``);
  lines.push(`- Verdict: \`${report.verdict.status}\``);
  lines.push(
    `- Durată reală: **${report.duration.actualMinutes} min** (cerut ${report.duration.requiredMinutes}); ` +
      `${report.duration.simulatedSeconds} s simulați`,
  );
  lines.push(
    `- Cicluri lifecycle: **${report.lifecycle.cycles}** (cerute ${report.lifecycle.requiredCycles}), ` +
      `${report.lifecycle.cleanCycles} curate, ${report.lifecycle.reloads} reload-uri`,
  );
  lines.push(
    `- Mașină: ${report.environment.cpuModel}, ${report.environment.logicalCores} fire logice, ${report.environment.node}`,
  );
  lines.push('');
  lines.push('## Memorie');
  lines.push('');
  lines.push(
    'Baseline-ul comparabil este primul ciclu după reset (aceeași fază, GC forțat); baseline-ul ' +
      'procesului rece este raportat separat, pentru context.',
  );
  lines.push('');
  lines.push('| Moment | Heap folosit | RSS |');
  lines.push('| --- | ---: | ---: |');
  lines.push(
    `| Baseline (primul ciclu după reset) | ${mib(report.memory.baselineHeapUsedBytes)} MiB | ${mib(report.memory.baselineRssBytes)} MiB |`,
  );
  lines.push(
    `| Final (ultimul ciclu după reset) | ${mib(report.memory.finalHeapUsedBytes)} MiB | ${mib(report.memory.finalRssBytes)} MiB |`,
  );
  lines.push(
    `| Delta | ${mib(report.memory.deltaHeapUsedBytes)} MiB | ${mib(report.memory.deltaRssBytes)} MiB |`,
  );
  lines.push(
    `| Baseline proces rece | ${mib(report.memory.coldBaselineHeapUsedBytes)} MiB | ${mib(report.memory.coldBaselineRssBytes)} MiB |`,
  );
  lines.push('');
  lines.push('## Tendințe (fereastra finală)');
  lines.push('');
  lines.push('| Metrică | Mediană | Interval | Creștere | Prag | Clasificare |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- |');
  for (const trend of report.trends) {
    const unit = trend.unit === 'bytes' ? ' B' : '';
    lines.push(
      `| ${trend.id} | ${Math.round(trend.windowMedian)}${unit} | ${Math.round(
        trend.windowMax - trend.windowMin,
      )}${unit} | ${Math.round(trend.growthWithinWindow)}${unit} | ${Math.round(
        trend.allowedGrowth,
      )}${unit} | \`${trend.classification}\` |`,
    );
  }
  lines.push('');
  lines.push('## Verificări');
  lines.push('');
  lines.push('| Verificare | Observat | Buget | Verdict | Notă |');
  lines.push('| --- | ---: | ---: | --- | --- |');
  for (const check of report.checks) {
    lines.push(
      `| ${check.id} | ${check.observed === null ? '—' : check.observed} | ${
        check.budget === null ? '—' : check.budget
      } | \`${check.verdict}\` | ${check.note} |`,
    );
  }
  lines.push('');
  lines.push('## Incidente');
  lines.push('');
  lines.push(
    `${report.incidents.total} incidente, ${report.incidents.recovered} recuperate, ` +
      `${report.incidents.unrecovered} nerecuperate.`,
  );
  for (const [kind, count] of Object.entries(report.incidents.byKind))
    if (count > 0) lines.push(`- \`${kind}\`: ${count}`);
  lines.push('');
  lines.push('## Throttling');
  lines.push('');
  lines.push(
    `Status: \`${report.throttling.status}\`. Frecvență CPU min/median/max: ` +
      `${report.throttling.cpuSpeedMhzMin ?? '—'} / ${report.throttling.cpuSpeedMhzMedian ?? '—'} / ` +
      `${report.throttling.cpuSpeedMhzMax ?? '—'} MHz; variație ${report.throttling.cpuSpeedVariationRatio ?? '—'}. ` +
      `Tick p95 min/max: ${report.throttling.tickP95MinMs ?? '—'} / ${report.throttling.tickP95MaxMs ?? '—'} ms ` +
      `(raport ${report.throttling.tickP95Ratio ?? '—'}); derivă maximă ${report.throttling.maxDriftMs} ms.`,
  );
  lines.push('');
  lines.push(`> ${report.throttling.note}`);
  lines.push('');
  if (report.verdict.failures.length > 0) {
    lines.push('## Eșecuri');
    lines.push('');
    for (const failure of report.verdict.failures) lines.push(`- ${failure}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
