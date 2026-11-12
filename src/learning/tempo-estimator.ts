import { SPEED_POLICY_KEYS, SPEED_POLICY_LIMITS, speedPolicyTrafficLimitMps } from '../autonomy';
import type { SpeedPolicyKey } from '../autonomy';
import { getParameterDefinition } from '../profiles';
import { normalizationPercentile } from '../telemetry';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 168 tempo estimator: estimates the four 167 keys from demonstrated driving facts while keeping
 * rhythm, deadband and overtake bonus separate from traffic constraints.
 *
 * The estimator is candidate-only. It never publishes a profile, never flips a 092 `implemented`
 * flag and never changes the 167 policy semantics: it reads the same key list, the same catalog
 * ranges and the same hard traffic envelope, and it reports `Unobserved` instead of inventing a
 * value whenever the eligible context, the uncertainty threshold or the independent validation do
 * not support one.
 */
export const TEMPO_ESTIMATOR_VERSION = '168-tempo-estimator-v1' as const;
export const TEMPO_ESTIMATOR_KEYS = SPEED_POLICY_KEYS;
export type TempoEstimatorKey = SpeedPolicyKey;

export const tempoEstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'TRAFFIC_DOMINATED',
  'NO_TARGET_STEPS',
  'DEADBAND_LOWER_BOUND_UNOBSERVED',
  'DEADBAND_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_STEP_BOUNDS',
  'NO_CRUISE_BASELINE',
] as const;
export type TempoEstimatorReason = (typeof tempoEstimatorReasons)[number];

export const tempoEpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type TempoEpisodeRefusal = (typeof tempoEpisodeRefusals)[number];

export type TempoEpisodeExclusion =
  | 'NOT_FREE_TRAFFIC'
  | 'TRAFFIC_CONSTRAINED'
  | 'OVERTAKE_SAMPLES'
  | 'SHORT_CRUISE_CYCLE'
  | 'NO_ARTERIAL_SAMPLES'
  | 'NO_OVERTAKE_SAMPLES'
  | 'NO_CRUISE_BASELINE'
  | 'TRAFFIC_DOMINATED'
  | 'NO_TARGET_STEPS'
  | 'UNRESOLVED_STEP';

export const TEMPO_ESTIMATOR_LIMITS = Object.freeze({
  version: TEMPO_ESTIMATOR_VERSION,
  idCodeUnits: SPEED_POLICY_LIMITS.idCodeUnits,
  maximumSeed: SPEED_POLICY_LIMITS.maximumSeed,
  maximumSpeedMps: 100,
  maximumStepSpeedMps: SPEED_POLICY_LIMITS.maximumCoveredSpeedMps,
  maximumGapM: 100000,
  /** A cruise cycle must cover one complete 167 variability period (600 ticks = 10 s at 60 Hz). */
  minimumCruiseTicks: SPEED_POLICY_LIMITS.variabilityPeriodTicks,
  minimumCruiseSamples: 60,
  minimumEpisodeSamples: 2,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  minimumStepSamples: 2,
  minimumStepEpisodes: 2,
  /**
   * The p10–p90 span of one full sine cycle is 1,902 amplitudes; dividing by it turns the robust
   * observed span into the 167 wave amplitude instead of a peak-to-peak artefact.
   */
  fullCycleSineQuantileSpan: 1.902,
  /** Samples within this margin of the 167 traffic envelope are traffic-dominated, not rhythm. */
  trafficMarginMps: 0.5,
  /** A commit this close to the previous target counts as held by the deadband. */
  stepHoldToleranceMps: 0.05,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloorMps: Object.freeze({
    speed_delta_arterial: 0.1,
    cruise_speed_variability: 0.05,
    overtake_speed_bonus: 0.2,
    cruise_accel_deadband: 0.02,
  }),
  maximumUncertaintyMps: Object.freeze({
    speed_delta_arterial: 1,
    cruise_speed_variability: 0.5,
    overtake_speed_bonus: 1.5,
    cruise_accel_deadband: 0.4,
  }),
  validationToleranceMps: Object.freeze({
    speed_delta_arterial: 1,
    cruise_speed_variability: 0.5,
    overtake_speed_bonus: 1.5,
    cruise_accel_deadband: 0.1,
  }),
  retainedHistory: 0,
});

export const tempoEligibleContexts: Readonly<Record<TempoEstimatorKey, string>> = Object.freeze({
  speed_delta_arterial:
    'probe arteriale FREE_TRAFFIC/ELIGIBLE fără constrângere de lider, măsurate ca viteză − limita postată',
  cruise_speed_variability:
    'cicluri de croazieră FREE_TRAFFIC/ELIGIBLE de minimum 600 tick-uri, fără depășiri și fără lider',
  overtake_speed_bonus:
    'depășiri reale, neconstrânse de trafic, comparate cu linia de croazieră a aceluiași episod',
  cruise_accel_deadband:
    'pași de țintă observați care au ținut commit-ul anterior (limită inferioară) sau l-au mișcat (limită superioară)',
});

export const tempoGroupConstraints = Object.freeze([
  Object.freeze({
    id: 'CRUISE_DISPERSION_SHARED',
    keys: Object.freeze(['cruise_speed_variability', 'cruise_accel_deadband'] as const),
    explanation:
      'Variația de croazieră și deadband-ul acționează asupra aceleiași serii de viteză: dispersia ' +
      'de croazieră poate fi explicată fie de unda de ritm, fie de o bandă de toleranță care filtrează ' +
      'unda. Deadband-ul nu se estimează din dispersie, ci doar din pași de țintă observați; fără ' +
      'pași ținuți și pași mișcați, cheia rămâne neobservată.',
  }),
  Object.freeze({
    id: 'OVERTAKE_ADVANTAGE_UNDER_LEAD',
    keys: Object.freeze(['overtake_speed_bonus'] as const),
    explanation:
      'Avantajul de viteză la depășire este bonus numai când liderul nu plafonează viteza. ' +
      'Depășirile în care viteza atinge anvelopa de trafic 167 sunt excluse, deci un set format ' +
      'doar din astfel de manevre produce `TRAFFIC_DOMINATED`, nu un bonus.',
  }),
  Object.freeze({
    id: 'ARTERIAL_DELTA_UNDER_LEAD',
    keys: Object.freeze(['speed_delta_arterial'] as const),
    explanation:
      'Delta arterială este diferența de stil față de limita postată. Probele arteriale cu lider ' +
      'apropiat sunt plafonate de trafic și nu pot deveni preferință; ele sunt excluse înainte de ' +
      'estimare, la fel ca în estimatorul 094 pentru drumurile urbane.',
  }),
  Object.freeze({
    id: 'TEMPO_FROM_ONE_TRAJECTORY',
    keys: SPEED_POLICY_KEYS,
    explanation:
      'Cele patru chei de tempo pot fi observate în aceeași călătorie, dar nu din aceleași fapte: ' +
      'arterialul cere probe arteriale libere, variabilitatea cere cicluri de croazieră, bonusul cere ' +
      'depășiri reale, iar deadband-ul cere pași de țintă. Un set care conține doar un tip de fapt ' +
      'lasă celelalte chei neobservate, în loc să le deducă din traiectoria comună.',
  }),
]);

export interface TempoEvidenceSample {
  readonly tick: number;
  readonly speedMps: number;
  readonly postedLimitMps: number;
  readonly roadKind: 'URBAN' | 'RESIDENTIAL' | 'ARTERIAL';
  /** Authoritative lead facts of the same tick; both null when the lane ahead is free. */
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  /** 167 observation flag of the same tick. */
  readonly overtaking: boolean;
}

export interface TempoTargetStep {
  readonly tick: number;
  /** Committed target immediately before the requested change. */
  readonly previousCommittedMps: number;
  /** Requested target after the 167 style ceiling and envelope were applied. */
  readonly requestedTargetMps: number;
  /** Observed committed target right after the request; the previous value means the band held. */
  readonly observedCommittedMps: number;
}

export interface TempoEvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly TempoEvidenceSample[];
  readonly targetSteps: readonly TempoTargetStep[];
}

export interface TempoEstimatorInput {
  readonly episodes: readonly TempoEvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface TempoValidation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly errorMps: number | null;
  readonly toleranceMps: number;
  readonly detail: string;
}

export interface TempoKeyEstimate {
  readonly key: TempoEstimatorKey;
  readonly unit: string;
  readonly eligibleContext: string;
  readonly status: 'CANDIDATE' | 'UNOBSERVED';
  readonly value: number | null;
  readonly rawValue: number | null;
  readonly clamped: boolean;
  readonly uncertaintyMps: number | null;
  readonly uncertaintyThresholdMps: number;
  readonly sourceEpisodes: number;
  readonly sourceSamples: number;
  readonly excluded: Readonly<Record<string, number>>;
  readonly reason: TempoEstimatorReason | null;
  readonly validation: TempoValidation;
}

export interface TempoCompatibility {
  readonly policyVersion: '167-speed-policy-v1';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  readonly catalogRanges: Readonly<
    Record<TempoEstimatorKey, { readonly min: number; readonly max: number; readonly unit: string }>
  >;
}

export interface TempoEstimatorResult {
  readonly version: typeof TEMPO_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<TempoEstimatorKey, TempoKeyEstimate>>;
  readonly groupConstraints: typeof tempoGroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: TempoEpisodeRefusal;
  }[];
  readonly compatibility: TempoCompatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly speedMps: number;
  readonly postedLimitMps: number;
  readonly roadKind: TempoEvidenceSample['roadKind'];
  readonly overtaking: boolean;
  readonly trafficFree: boolean;
}

interface AdmittedStep {
  readonly deltaMps: number;
  readonly held: boolean;
}

interface AdmittedEpisode {
  readonly id: string;
  readonly freeTraffic: boolean;
  readonly samples: readonly AdmittedSample[];
  readonly steps: readonly AdmittedStep[];
  readonly unresolvedSteps: number;
}

function fail(message: string): never {
  throw new Error(message);
}
function identity(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > TEMPO_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid tempo evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid tempo evidence ${field}`);
  return value;
}
function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`Invalid tempo evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function percentile(values: readonly number[], fraction: number): number {
  return normalizationPercentile(
    [...values].sort((a, b) => a - b),
    fraction,
  );
}
function isTrafficFree(sample: TempoEvidenceSample): boolean {
  const limit = speedPolicyTrafficLimitMps(sample.leadGapM, sample.leadSpeedMps);
  return limit === null || sample.speedMps <= limit - TEMPO_ESTIMATOR_LIMITS.trafficMarginMps;
}
function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid tempo evidence sample');
  const sample = value as TempoEvidenceSample,
    tick = count(sample.tick, 'sample tick'),
    speedMps = finite(sample.speedMps, 0, TEMPO_ESTIMATOR_LIMITS.maximumSpeedMps, 'sample speed'),
    postedLimitMps = finite(sample.postedLimitMps, 0, 100, 'sample posted limit'),
    roadKind = sample.roadKind;
  if (roadKind !== 'URBAN' && roadKind !== 'RESIDENTIAL' && roadKind !== 'ARTERIAL')
    fail('Invalid tempo evidence sample road kind');
  if (typeof sample.overtaking !== 'boolean') fail('Invalid tempo evidence sample overtaking');
  if ((sample.leadGapM === null) !== (sample.leadSpeedMps === null))
    fail('Incomplete tempo evidence lead facts');
  if (sample.leadGapM !== null)
    finite(sample.leadGapM, 0, TEMPO_ESTIMATOR_LIMITS.maximumGapM, 'sample lead gap');
  if (sample.leadSpeedMps !== null) finite(sample.leadSpeedMps, 0, 100, 'sample lead speed');
  return Object.freeze({
    tick,
    speedMps,
    postedLimitMps,
    roadKind,
    overtaking: sample.overtaking,
    trafficFree: isTrafficFree(sample),
  });
}
function admitStep(value: unknown): AdmittedStep | TempoEpisodeExclusion {
  if (!value || typeof value !== 'object') fail('Invalid tempo evidence step');
  const step = value as TempoTargetStep;
  count(step.tick, 'step tick');
  const previous = finite(
      step.previousCommittedMps,
      0,
      TEMPO_ESTIMATOR_LIMITS.maximumStepSpeedMps,
      'step previous target',
    ),
    requested = finite(
      step.requestedTargetMps,
      0,
      TEMPO_ESTIMATOR_LIMITS.maximumStepSpeedMps,
      'step requested target',
    ),
    observed = finite(
      step.observedCommittedMps,
      0,
      TEMPO_ESTIMATOR_LIMITS.maximumStepSpeedMps,
      'step observed commit',
    ),
    tolerance = TEMPO_ESTIMATOR_LIMITS.stepHoldToleranceMps,
    deltaMps = Math.abs(requested - previous);
  if (deltaMps <= tolerance) return 'NO_TARGET_STEPS';
  const keptPrevious = Math.abs(observed - previous) <= tolerance,
    movedToRequest = Math.abs(observed - requested) <= tolerance;
  if (keptPrevious === movedToRequest) return 'UNRESOLVED_STEP';
  return Object.freeze({ deltaMps, held: keptPrevious });
}
function admitEpisode(value: unknown): AdmittedEpisode | TempoEpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid tempo evidence episode');
  const episode = value as TempoEvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid tempo evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid tempo evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid tempo evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched tempo evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Tempo evidence samples are not strictly ordered');
    previousTick = admitted.tick;
    samples.push(admitted);
  }
  const steps: AdmittedStep[] = [];
  let unresolvedSteps = 0;
  for (const step of episode.targetSteps as readonly unknown[]) {
    const admitted = admitStep(step);
    if (typeof admitted === 'string') {
      if (admitted === 'UNRESOLVED_STEP') unresolvedSteps += 1;
      continue;
    }
    steps.push(admitted);
  }
  return Object.freeze({
    id,
    freeTraffic: eligibility.windowClass === 'ELIGIBLE' && eligibility.label === 'FREE_TRAFFIC',
    samples: Object.freeze(samples),
    steps: Object.freeze(steps),
    unresolvedSteps,
  });
}
function hash(seed: number, text: string): number {
  let value = 0x811c9dc5;
  for (const character of `${seed}:${text}`) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}
/** Deterministic interleaved split: every second identity by seeded hash goes to validation. */
function splitEpisodes(
  ids: readonly string[],
  seed: number,
): ReadonlyMap<string, 'ESTIMATE' | 'VALIDATION'> {
  const ordered = [...new Set(ids)].sort((a, b) => {
    const difference = hash(seed, a) - hash(seed, b);
    return difference === 0 ? (a < b ? -1 : a > b ? 1 : 0) : difference;
  });
  return new Map(
    ordered.map((id, index) => [id, index % 2 === 0 ? 'ESTIMATE' : 'VALIDATION'] as const),
  );
}
function splitOf(
  split: ReadonlyMap<string, 'ESTIMATE' | 'VALIDATION'>,
  id: string,
): 'ESTIMATE' | 'VALIDATION' {
  return split.get(id) ?? 'ESTIMATE';
}
function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
function frozenCounts(counts: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries([...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))));
}
function catalogRange(key: TempoEstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function compatibility(): TempoCompatibility {
  return Object.freeze({
    policyVersion: SPEED_POLICY_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    catalogRanges: Object.freeze(
      Object.fromEntries(TEMPO_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)])) as Record<
        TempoEstimatorKey,
        { min: number; max: number; unit: string }
      >,
    ),
  });
}
function emptyValidation(key: TempoEstimatorKey): TempoValidation {
  return Object.freeze({
    status: 'NO_DATA',
    episodes: 0,
    value: null,
    errorMps: null,
    toleranceMps: TEMPO_ESTIMATOR_LIMITS.validationToleranceMps[key],
    detail: 'no independent demonstration episodes',
  });
}
function unobserved(
  key: TempoEstimatorKey,
  reason: TempoEstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: TempoValidation = emptyValidation(key),
  uncertaintyMps: number | null = null,
): TempoKeyEstimate {
  return Object.freeze({
    key,
    unit: getParameterDefinition(key).unit,
    eligibleContext: tempoEligibleContexts[key],
    status: 'UNOBSERVED',
    value: null,
    rawValue: null,
    clamped: false,
    uncertaintyMps,
    uncertaintyThresholdMps: TEMPO_ESTIMATOR_LIMITS.maximumUncertaintyMps[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason,
    validation,
  });
}
function candidate(
  key: TempoEstimatorKey,
  rawValue: number,
  uncertaintyMps: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: TempoValidation,
): TempoKeyEstimate | TempoEstimatorReason {
  if (uncertaintyMps > TEMPO_ESTIMATOR_LIMITS.maximumUncertaintyMps[key])
    return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    unit: range.unit,
    eligibleContext: tempoEligibleContexts[key],
    status: 'CANDIDATE',
    value,
    rawValue,
    clamped: value !== rawValue,
    uncertaintyMps,
    uncertaintyThresholdMps: TEMPO_ESTIMATOR_LIMITS.maximumUncertaintyMps[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason: null,
    validation,
  });
}
function continuousValidation(
  key: TempoEstimatorKey,
  estimate: number,
  values: readonly number[],
): TempoValidation {
  const toleranceMps = TEMPO_ESTIMATOR_LIMITS.validationToleranceMps[key];
  if (values.length < TEMPO_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: values.length,
      value: values.length === 0 ? null : median(values),
      errorMps: values.length === 0 ? null : Math.abs(median(values) - estimate),
      toleranceMps,
      detail: `validation set has ${values.length} of the required ${TEMPO_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
    });
  const value = median(values),
    errorMps = Math.abs(value - estimate);
  return Object.freeze({
    status: errorMps <= toleranceMps ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: values.length,
    value,
    errorMps,
    toleranceMps,
    detail: `held-out estimate ${value.toFixed(3)} m/s differs by ${errorMps.toFixed(3)} m/s`,
  });
}
function uncertaintyOf(key: TempoEstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    TEMPO_ESTIMATOR_LIMITS.uncertaintyFloorMps[key],
    (TEMPO_ESTIMATOR_LIMITS.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}
function arterialValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  if (!episode.freeTraffic) {
    increment(excluded, 'NOT_FREE_TRAFFIC');
    return null;
  }
  const arterial = episode.samples.filter((sample) => sample.roadKind === 'ARTERIAL');
  if (arterial.length < TEMPO_ESTIMATOR_LIMITS.minimumEpisodeSamples) {
    increment(excluded, 'NO_ARTERIAL_SAMPLES');
    return null;
  }
  if (arterial.some((sample) => sample.overtaking)) {
    increment(excluded, 'OVERTAKE_SAMPLES');
    return null;
  }
  if (arterial.some((sample) => !sample.trafficFree)) {
    increment(excluded, 'TRAFFIC_CONSTRAINED');
    return null;
  }
  return {
    value: median(arterial.map((sample) => sample.speedMps - sample.postedLimitMps)),
    samples: arterial.length,
  };
}
function variabilityValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  if (!episode.freeTraffic) {
    increment(excluded, 'NOT_FREE_TRAFFIC');
    return null;
  }
  if (episode.samples.some((sample) => sample.overtaking)) {
    increment(excluded, 'OVERTAKE_SAMPLES');
    return null;
  }
  if (episode.samples.some((sample) => !sample.trafficFree)) {
    increment(excluded, 'TRAFFIC_CONSTRAINED');
    return null;
  }
  const first = episode.samples[0]?.tick ?? 0,
    last = episode.samples[episode.samples.length - 1]?.tick ?? 0;
  if (
    episode.samples.length < TEMPO_ESTIMATOR_LIMITS.minimumCruiseSamples ||
    last - first + 1 < TEMPO_ESTIMATOR_LIMITS.minimumCruiseTicks
  ) {
    increment(excluded, 'SHORT_CRUISE_CYCLE');
    return null;
  }
  const speeds = episode.samples.map((sample) => sample.speedMps),
    span = percentile(speeds, 0.9) - percentile(speeds, 0.1);
  return {
    value: Math.max(0, span / TEMPO_ESTIMATOR_LIMITS.fullCycleSineQuantileSpan),
    samples: episode.samples.length,
  };
}
function overtakeValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const overtakes = episode.samples.filter((sample) => sample.overtaking);
  if (overtakes.length < TEMPO_ESTIMATOR_LIMITS.minimumEpisodeSamples) {
    increment(excluded, 'NO_OVERTAKE_SAMPLES');
    return null;
  }
  if (overtakes.some((sample) => !sample.trafficFree)) {
    increment(excluded, 'TRAFFIC_DOMINATED');
    return null;
  }
  const baseline = episode.samples.filter((sample) => !sample.overtaking && sample.trafficFree);
  if (baseline.length < TEMPO_ESTIMATOR_LIMITS.minimumEpisodeSamples) {
    increment(excluded, 'NO_CRUISE_BASELINE');
    return null;
  }
  return {
    value:
      median(overtakes.map((sample) => sample.speedMps)) -
      median(baseline.map((sample) => sample.speedMps)),
    samples: overtakes.length,
  };
}
interface EpisodeValue {
  readonly id: string;
  readonly value: number;
  readonly samples: number;
}
function collectValues(
  episodes: readonly AdmittedEpisode[],
  measure: (
    episode: AdmittedEpisode,
    excluded: Map<string, number>,
  ) => {
    value: number;
    samples: number;
  } | null,
): { values: EpisodeValue[]; excluded: Map<string, number> } {
  const values: EpisodeValue[] = [],
    excluded = new Map<string, number>();
  for (const episode of episodes) {
    const measured = measure(episode, excluded);
    if (measured !== null)
      values.push({ id: episode.id, value: measured.value, samples: measured.samples });
  }
  return { values, excluded };
}
function estimateContinuous(
  key: TempoEstimatorKey,
  episodes: readonly AdmittedEpisode[],
  seed: number,
  measure: (
    episode: AdmittedEpisode,
    excluded: Map<string, number>,
  ) => {
    value: number;
    samples: number;
  } | null,
): TempoKeyEstimate {
  const { values, excluded } = collectValues(episodes, measure),
    split = splitEpisodes(
      values.map((entry) => entry.id),
      seed,
    ),
    estimateValues = values.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationValues = values.filter((entry) => splitOf(split, entry.id) === 'VALIDATION');
  if (values.length === 0) {
    const reason =
      excluded.has('TRAFFIC_DOMINATED') || excluded.has('TRAFFIC_CONSTRAINED')
        ? 'TRAFFIC_DOMINATED'
        : 'NO_ELIGIBLE_EPISODES';
    return unobserved(key, reason, 0, 0, excluded);
  }
  if (estimateValues.length < TEMPO_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
    return unobserved(
      key,
      'INSUFFICIENT_DISTINCT_EPISODES',
      values.length,
      values.reduce((sum, entry) => sum + entry.samples, 0),
      excluded,
    );
  const numbers = estimateValues.map((entry) => entry.value),
    estimate = median(numbers),
    uncertainty = uncertaintyOf(key, numbers),
    validation = continuousValidation(
      key,
      estimate,
      validationValues.map((entry) => entry.value),
    ),
    result = candidate(
      key,
      estimate,
      uncertainty,
      estimateValues.length,
      estimateValues.reduce((sum, entry) => sum + entry.samples, 0),
      excluded,
      validation,
    );
  return typeof result === 'string'
    ? unobserved(
        key,
        result,
        estimateValues.length,
        estimateValues.reduce((sum, entry) => sum + entry.samples, 0),
        excluded,
        validation,
        uncertainty,
      )
    : result;
}
function deadbandEstimate(episodes: readonly AdmittedEpisode[], seed: number): TempoKeyEstimate {
  const excluded = new Map<string, number>(),
    relevant = episodes.filter((episode) => episode.freeTraffic && episode.steps.length > 0);
  for (const episode of episodes) {
    if (!episode.freeTraffic) increment(excluded, 'NOT_FREE_TRAFFIC');
    else if (episode.steps.length === 0) increment(excluded, 'NO_TARGET_STEPS');
    if (episode.unresolvedSteps > 0) increment(excluded, 'UNRESOLVED_STEP');
  }
  if (relevant.length === 0)
    return unobserved('cruise_accel_deadband', 'NO_TARGET_STEPS', 0, 0, excluded);
  const split = splitEpisodes(
      relevant.map((episode) => episode.id),
      seed,
    ),
    estimateEpisodes = relevant.filter((episode) => splitOf(split, episode.id) === 'ESTIMATE'),
    estimateSteps = estimateEpisodes.flatMap((episode) => episode.steps),
    validationSteps = relevant
      .filter((episode) => splitOf(split, episode.id) === 'VALIDATION')
      .flatMap((episode) => episode.steps);
  if (estimateEpisodes.length < TEMPO_ESTIMATOR_LIMITS.minimumStepEpisodes)
    return unobserved(
      'cruise_accel_deadband',
      'INSUFFICIENT_DISTINCT_EPISODES',
      estimateEpisodes.length,
      estimateSteps.length,
      excluded,
    );
  const held = estimateSteps.filter((step) => step.held).map((step) => step.deltaMps),
    moved = estimateSteps.filter((step) => !step.held).map((step) => step.deltaMps);
  if (held.length < TEMPO_ESTIMATOR_LIMITS.minimumStepSamples)
    return unobserved(
      'cruise_accel_deadband',
      'DEADBAND_LOWER_BOUND_UNOBSERVED',
      estimateEpisodes.length,
      estimateSteps.length,
      excluded,
    );
  if (moved.length < TEMPO_ESTIMATOR_LIMITS.minimumStepSamples)
    return unobserved(
      'cruise_accel_deadband',
      'DEADBAND_UPPER_BOUND_UNOBSERVED',
      estimateEpisodes.length,
      estimateSteps.length,
      excluded,
    );
  const lower = Math.max(...held),
    upper = Math.min(...moved),
    tolerance = TEMPO_ESTIMATOR_LIMITS.validationToleranceMps.cruise_accel_deadband;
  if (lower >= upper)
    return unobserved(
      'cruise_accel_deadband',
      'CONTRADICTORY_STEP_BOUNDS',
      estimateEpisodes.length,
      estimateSteps.length,
      excluded,
    );
  const value = (lower + upper) / 2,
    uncertainty = (upper - lower) / 2,
    validation = deadbandValidation(
      value,
      validationSteps,
      tolerance,
      relevant.length - estimateEpisodes.length,
    ),
    result = candidate(
      'cruise_accel_deadband',
      value,
      uncertainty,
      estimateEpisodes.length,
      estimateSteps.length,
      excluded,
      validation,
    );
  return typeof result === 'string'
    ? unobserved(
        'cruise_accel_deadband',
        result,
        estimateEpisodes.length,
        estimateSteps.length,
        excluded,
        validation,
        uncertainty,
      )
    : result;
}
function deadbandValidation(
  estimate: number,
  steps: readonly AdmittedStep[],
  toleranceMps: number,
  episodeCount: number,
): TempoValidation {
  const held = steps.filter((step) => step.held),
    moved = steps.filter((step) => !step.held);
  if (held.length === 0 || moved.length === 0)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: episodeCount,
      value: null,
      errorMps: null,
      toleranceMps,
      detail: `validation set holds ${held.length} held and ${moved.length} moved steps`,
    });
  const inconsistent = [
    ...held.filter((step) => step.deltaMps > estimate + toleranceMps),
    ...moved.filter((step) => step.deltaMps < estimate - toleranceMps),
  ];
  return Object.freeze({
    status: inconsistent.length === 0 ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: episodeCount,
    value: null,
    errorMps: null,
    toleranceMps,
    detail: `${steps.length - inconsistent.length}/${steps.length} held-out steps agree with ${estimate.toFixed(3)} m/s`,
  });
}

/**
 * Estimates the four 167 tempo keys from demonstrated episodes. The same episodes and the same
 * `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateSpeedPolicyTempo(input: TempoEstimatorInput): TempoEstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid tempo estimator input');
  const splitSeed = count(input.splitSeed, 'split seed');
  if (splitSeed > TEMPO_ESTIMATOR_LIMITS.maximumSeed) fail('Tempo split seed out of range');
  if (!Array.isArray(input.episodes)) fail('Invalid tempo evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: TempoEpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as TempoEvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as TempoEvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }
  const keys = {
    speed_delta_arterial: estimateContinuous(
      'speed_delta_arterial',
      admitted,
      splitSeed,
      arterialValue,
    ),
    cruise_speed_variability: estimateContinuous(
      'cruise_speed_variability',
      admitted,
      splitSeed,
      variabilityValue,
    ),
    overtake_speed_bonus: estimateContinuous(
      'overtake_speed_bonus',
      admitted,
      splitSeed,
      overtakeValue,
    ),
    cruise_accel_deadband: deadbandEstimate(admitted, splitSeed),
  } as Record<TempoEstimatorKey, TempoKeyEstimate>;
  return Object.freeze({
    version: TEMPO_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: tempoGroupConstraints,
    admittedEpisodes: Object.freeze(admitted.map((episode) => episode.id)),
    refusedEpisodes: Object.freeze(refused.map((entry) => Object.freeze(entry))),
    compatibility: compatibility(),
  });
}
