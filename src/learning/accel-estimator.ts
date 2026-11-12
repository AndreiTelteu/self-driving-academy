import { ACCEL_POLICY_KEYS, ACCEL_POLICY_LIMITS } from '../autonomy';
import type { AccelPolicyKey } from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 170 accel estimator: estimates the four 169 longitudinal style keys from demonstrated
 * actuation facts, keeping real braking, real throttle release, real launches and real coasting
 * apart instead of inferring one key from another.
 *
 * The estimator is candidate-only. It never publishes a profile, never writes to a store, never
 * flips a 092 `implemented` flag and never changes the 169 policy semantics: it reads the same key
 * list, the same catalog ranges, the same launch threshold, the same coasting demand, the same
 * minimum lead gap and the same tick rate, and it reports `Unobserved` instead of inventing a value
 * whenever the eligible fact, the uncertainty threshold or the independent validation do not
 * support one.
 */
export const ACCEL_ESTIMATOR_VERSION = '170-accel-estimator-v1' as const;
export const ACCEL_ESTIMATOR_KEYS = ACCEL_POLICY_KEYS;
export type AccelEstimatorKey = AccelPolicyKey;

export const accelEstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'NO_BRAKING_EVENT',
  'BRAKING_RAMP_NOT_OBSERVED',
  'BRAKING_RAMP_CENSORED',
  'BRAKING_DEMAND_CHANGED',
  'NO_RELEASE_EVENT',
  'RELEASE_HOLD_CENSORED',
  'RELEASE_CANCELLED_BY_BRAKING',
  'NO_LAUNCH_EVENT',
  'LAUNCH_FACTOR_OUT_OF_ENVELOPE',
  'NO_COASTING_EVENT',
  'COASTING_FACTOR_OUT_OF_ENVELOPE',
  'STRONG_REQUEST',
  'SAFETY_CONSTRAINED',
] as const;
export type AccelEstimatorReason = (typeof accelEstimatorReasons)[number];

export const accelEpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type AccelEpisodeRefusal = (typeof accelEpisodeRefusals)[number];

export const accelEpisodeExclusions = [
  'NO_BRAKING_EVENT',
  'BRAKING_RAMP_NOT_OBSERVED',
  'BRAKING_RAMP_CENSORED',
  'BRAKING_DEMAND_CHANGED',
  'NO_RELEASE_EVENT',
  'RELEASE_HOLD_CENSORED',
  'RELEASE_CANCELLED_BY_BRAKING',
  'SAFETY_CONSTRAINED',
  'NO_LAUNCH_EVENT',
  'LAUNCH_FACTOR_OUT_OF_ENVELOPE',
  'NO_COASTING_EVENT',
  'STRONG_REQUEST',
  'COASTING_FACTOR_OUT_OF_ENVELOPE',
] as const;
export type AccelEpisodeExclusion = (typeof accelEpisodeExclusions)[number];

export const ACCEL_ESTIMATOR_LIMITS = Object.freeze({
  version: ACCEL_ESTIMATOR_VERSION,
  idCodeUnits: ACCEL_POLICY_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  /** The 169 policy tick rate; a measured ramp or hold is converted with exactly this cadence. */
  tickHz: ACCEL_POLICY_LIMITS.tickHz,
  maximumSpeedMps: 100,
  maximumAccelerationMps2: ACCEL_POLICY_LIMITS.maximumCoveredAccelerationMps2,
  maximumGapM: 100000,
  /** Same launch threshold as 169: below it a positive request is a launch, not a cruise request. */
  launchSpeedMps: ACCEL_POLICY_LIMITS.launchSpeedMps,
  /** Same coasting demand as 169: only a mild positive request may be released. */
  coastingDemandMps2: ACCEL_POLICY_LIMITS.coastingDemandMps2,
  /** Same safety floor as 169: a lead inside it vetoes throttle, hold, launch and coasting. */
  minimumLeadGapM: ACCEL_POLICY_LIMITS.minimumLeadGapM,
  /** Same launch envelope as 169: a launch keeps this fraction of the 047 request at intensity 0. */
  minimumLaunchFraction: ACCEL_POLICY_LIMITS.minimumLaunchFraction,
  /** The longest 169 release hold is 3 s = 180 ticks; a longer hold cannot be genuine. */
  maximumReleaseTicks: ACCEL_POLICY_LIMITS.maximumReleaseDelayTicks,
  /** A braking ramp needs at least two observed sub-demand samples to expose a slope. */
  minimumRampSamples: 2,
  minimumEpisodeSamples: 2,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  /** Equality tolerance for the 047 demand and for the committed/requested ratio. */
  demandToleranceMps2: 1e-9,
  ratioTolerance: 1e-9,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloor: Object.freeze({
    braking_jerk: 0.05,
    throttle_release_delay: 0.002,
    launch_intensity: 0.005,
    coasting_bias: 0.005,
  }),
  maximumUncertainty: Object.freeze({
    braking_jerk: 1.5,
    throttle_release_delay: 0.25,
    launch_intensity: 0.1,
    coasting_bias: 0.1,
  }),
  validationTolerance: Object.freeze({
    braking_jerk: 1.5,
    throttle_release_delay: 0.1,
    launch_intensity: 0.06,
    coasting_bias: 0.06,
  }),
  retainedHistory: 0,
});

export const accelEligibleContexts: Readonly<Record<AccelEstimatorKey, string>> = Object.freeze({
  braking_jerk:
    'frânări reale cerute de 047, măsurate ca panta decelerației commitate după onset, ' +
    'cu cererea de decelerație constantă și rampa complet observată sub ea',
  throttle_release_delay:
    'ridicări reale de throttle (cerere 047 căzută la zero, fără cerere de frânare), măsurate ca ' +
    'numărul de tick-uri în care accelerația și throttle-ul anterior sunt menținute',
  launch_intensity:
    'plecări reale sub 2 m/s, măsurate ca raportul dintre accelerația aplicată și cererea 047, ' +
    'între fracțiunea minimă a politicii 169 și cererea integrală',
  coasting_bias:
    'coasting real peste 2 m/s, măsurat ca eliberarea unei cereri pozitive mici (≤ 0,6 m/s²) ' +
    'între cererea integrală și rularea liberă',
});

export const accelGroupConstraints = Object.freeze([
  Object.freeze({
    id: 'BRAKING_AND_RELEASE_SHARED_TRANSITION',
    keys: Object.freeze(['braking_jerk', 'throttle_release_delay'] as const),
    explanation:
      'Jerk-ul de frânare și întârzierea de ridicare împart aceeași tranziție de pedală: o cerere ' +
      'de frânare anulează imediat ținerea de throttle, deci aceleași tick-uri nu pot dovedi ' +
      'ambele chei. O ridicare urmată de frânare dă cel mult una dintre valori, iar un episod care ' +
      'conține ambele fapte separat le estimează pe rând, din intervale disjuncte.',
  }),
  Object.freeze({
    id: 'LAUNCH_AND_COAST_SHARED_REQUEST',
    keys: Object.freeze(['launch_intensity', 'coasting_bias'] as const),
    explanation:
      'Plecarea și coasting-ul citesc același raport dintre accelerația aplicată și cererea 047; ' +
      'numai pragul de 2 m/s al politicii 169 le separă. Un segment care rămâne sub 2 m/s nu poate ' +
      'dovedi coasting-ul, iar unul care rulează doar peste 2 m/s nu poate dovedi plecarea, deci ' +
      'niciuna dintre chei nu se deduce din cealaltă.',
  }),
  Object.freeze({
    id: 'JERK_ABOVE_DEMAND_RAMP',
    keys: Object.freeze(['braking_jerk'] as const),
    explanation:
      'Rampa de frânare este plafonată de cererea 047: dacă decelerația atinge cererea în primul ' +
      'tick observat, jerk-ul rămâne doar o limită inferioară, nu o valoare. Rampa trunchiată sau ' +
      'cu cerere schimbată la mijloc lasă cheia neobservată în loc să producă o pantă inventată.',
  }),
  Object.freeze({
    id: 'VETO_SPLITS_BRAKING_FROM_THROTTLE',
    keys: ACCEL_POLICY_KEYS,
    explanation:
      'Veto-ul dur al politicii 169 (oprire cerută sau lider în interiorul a 5 m) anulează ' +
      'throttle-ul, ținerea, plecarea și coasting-ul, dar nu frânarea: o cerere de frânare este ' +
      'aplicată de la primul tick. Același segment constrâns poate deci dovedi `braking_jerk` și nu ' +
      'poate dovedi niciodată celelalte trei chei.',
  }),
]);

export interface AccelEvidenceSample {
  readonly tick: number;
  readonly speedMps: number;
  /** Genuine 047 request of the tick, before the 169 style layer. */
  readonly requestedAccelerationMps2: number;
  /** Acceleration actually applied by the 169 layer for the same tick. */
  readonly committedAccelerationMps2: number;
  /** Observed lead vehicle facts; both null when the lane ahead is free. */
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  readonly stopRequired: boolean;
}

export interface AccelEvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly AccelEvidenceSample[];
}

export interface AccelEstimatorInput {
  readonly episodes: readonly AccelEvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface AccelValidation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}

export interface AccelKeyEstimate {
  readonly key: AccelEstimatorKey;
  readonly unit: string;
  readonly eligibleContext: string;
  readonly status: 'CANDIDATE' | 'UNOBSERVED';
  readonly value: number | null;
  readonly rawValue: number | null;
  readonly clamped: boolean;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly sourceEpisodes: number;
  readonly sourceSamples: number;
  readonly excluded: Readonly<Record<string, number>>;
  readonly reason: AccelEstimatorReason | null;
  readonly validation: AccelValidation;
}

export interface AccelCompatibility {
  readonly policyVersion: '169-accel-policy-v1';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  readonly catalogRanges: Readonly<
    Record<AccelEstimatorKey, { readonly min: number; readonly max: number; readonly unit: string }>
  >;
}

export interface AccelEstimatorResult {
  readonly version: typeof ACCEL_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<AccelEstimatorKey, AccelKeyEstimate>>;
  readonly groupConstraints: typeof accelGroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: AccelEpisodeRefusal;
  }[];
  readonly compatibility: AccelCompatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly speedMps: number;
  readonly requestedAccelerationMps2: number;
  readonly committedAccelerationMps2: number;
  readonly veto: boolean;
  readonly braking: boolean;
  readonly lift: boolean;
}

interface AdmittedEpisode {
  readonly id: string;
  readonly samples: readonly AdmittedSample[];
}

function fail(message: string): never {
  throw new Error(message);
}
function identity(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ACCEL_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid accel evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid accel evidence ${field}`);
  return value;
}
function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`Invalid accel evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid accel evidence sample');
  const sample = value as AccelEvidenceSample,
    tick = count(sample.tick, 'sample tick'),
    speedMps = finite(sample.speedMps, 0, ACCEL_ESTIMATOR_LIMITS.maximumSpeedMps, 'sample speed'),
    requestedAccelerationMps2 = finite(
      sample.requestedAccelerationMps2,
      -ACCEL_ESTIMATOR_LIMITS.maximumAccelerationMps2,
      ACCEL_ESTIMATOR_LIMITS.maximumAccelerationMps2,
      'sample requested acceleration',
    ),
    committedAccelerationMps2 = finite(
      sample.committedAccelerationMps2,
      -ACCEL_ESTIMATOR_LIMITS.maximumAccelerationMps2,
      ACCEL_ESTIMATOR_LIMITS.maximumAccelerationMps2,
      'sample committed acceleration',
    );
  if (typeof sample.stopRequired !== 'boolean')
    fail('Invalid accel evidence sample stop requirement');
  if ((sample.leadGapM === null) !== (sample.leadSpeedMps === null))
    fail('Incomplete accel evidence lead facts');
  if (sample.leadGapM !== null)
    finite(sample.leadGapM, 0, ACCEL_ESTIMATOR_LIMITS.maximumGapM, 'sample lead gap');
  if (sample.leadSpeedMps !== null) finite(sample.leadSpeedMps, 0, 100, 'sample lead speed');
  const veto =
    sample.stopRequired ||
    (sample.leadGapM !== null && sample.leadGapM <= ACCEL_ESTIMATOR_LIMITS.minimumLeadGapM);
  if (requestedAccelerationMps2 < 0 && committedAccelerationMps2 > 0)
    fail('Inconsistent accel evidence braking');
  return Object.freeze({
    tick,
    speedMps,
    requestedAccelerationMps2,
    committedAccelerationMps2,
    veto,
    braking: requestedAccelerationMps2 < 0,
    lift: requestedAccelerationMps2 === 0,
  });
}
function admitEpisode(value: unknown): AdmittedEpisode | AccelEpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid accel evidence episode');
  const episode = value as AccelEvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid accel evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid accel evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid accel evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched accel evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Accel evidence samples are not strictly ordered');
    previousTick = admitted.tick;
    samples.push(admitted);
  }
  return Object.freeze({ id, samples: Object.freeze(samples) });
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
function catalogRange(key: AccelEstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function compatibility(): AccelCompatibility {
  return Object.freeze({
    policyVersion: ACCEL_POLICY_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    catalogRanges: Object.freeze(
      Object.fromEntries(ACCEL_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)])) as Record<
        AccelEstimatorKey,
        { min: number; max: number; unit: string }
      >,
    ),
  });
}
function emptyValidation(key: AccelEstimatorKey): AccelValidation {
  return Object.freeze({
    status: 'NO_DATA',
    episodes: 0,
    value: null,
    error: null,
    tolerance: ACCEL_ESTIMATOR_LIMITS.validationTolerance[key],
    detail: 'no independent demonstration episodes',
  });
}
function unobserved(
  key: AccelEstimatorKey,
  reason: AccelEstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: AccelValidation = emptyValidation(key),
  uncertainty: number | null = null,
): AccelKeyEstimate {
  return Object.freeze({
    key,
    unit: getParameterDefinition(key).unit,
    eligibleContext: accelEligibleContexts[key],
    status: 'UNOBSERVED',
    value: null,
    rawValue: null,
    clamped: false,
    uncertainty,
    uncertaintyThreshold: ACCEL_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason,
    validation,
  });
}
function candidate(
  key: AccelEstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: AccelValidation,
): AccelKeyEstimate | AccelEstimatorReason {
  if (uncertainty > ACCEL_ESTIMATOR_LIMITS.maximumUncertainty[key])
    return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    unit: range.unit,
    eligibleContext: accelEligibleContexts[key],
    status: 'CANDIDATE',
    value,
    rawValue,
    clamped: value !== rawValue,
    uncertainty,
    uncertaintyThreshold: ACCEL_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason: null,
    validation,
  });
}
function continuousValidation(
  key: AccelEstimatorKey,
  estimate: number,
  values: readonly number[],
): AccelValidation {
  const tolerance = ACCEL_ESTIMATOR_LIMITS.validationTolerance[key];
  if (values.length < ACCEL_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: values.length,
      value: values.length === 0 ? null : median(values),
      error: values.length === 0 ? null : Math.abs(median(values) - estimate),
      tolerance,
      detail: `validation set has ${values.length} of the required ${ACCEL_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
    });
  const value = median(values),
    error = Math.abs(value - estimate);
  return Object.freeze({
    status: error <= tolerance ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: values.length,
    value,
    error,
    tolerance,
    detail: `held-out estimate ${value.toFixed(4)} ${getParameterDefinition(key).unit} differs by ${error.toFixed(4)} ${getParameterDefinition(key).unit}`,
  });
}
function uncertaintyOf(key: AccelEstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    ACCEL_ESTIMATOR_LIMITS.uncertaintyFloor[key],
    (ACCEL_ESTIMATOR_LIMITS.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}
/**
 * Braking jerk from the growth of the committed deceleration: the first complete 047 braking
 * segment whose demand stays constant and whose ramp is visible below the demand.
 */
function brakingValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const samples = episode.samples,
    tolerance = ACCEL_ESTIMATOR_LIMITS.demandToleranceMps2;
  let index = 0,
    issue: AccelEpisodeExclusion | null = null;
  while (index < samples.length) {
    if (!samples[index]!.braking) {
      index += 1;
      continue;
    }
    const start = index;
    while (index + 1 < samples.length && samples[index + 1]!.braking) index += 1;
    const run = samples.slice(start, index + 1);
    index += 1;
    const demand = -run[0]!.requestedAccelerationMps2;
    if (run.some((sample) => Math.abs(-sample.requestedAccelerationMps2 - demand) > tolerance)) {
      issue ??= 'BRAKING_DEMAND_CHANGED';
      continue;
    }
    const deceleration = run.map((sample) => -sample.committedAccelerationMps2);
    if (deceleration[deceleration.length - 1]! < demand - tolerance) {
      issue ??= 'BRAKING_RAMP_CENSORED';
      continue;
    }
    const ramping = deceleration.filter((value) => value < demand - tolerance);
    if (ramping.length < ACCEL_ESTIMATOR_LIMITS.minimumRampSamples) {
      issue ??= 'BRAKING_RAMP_NOT_OBSERVED';
      continue;
    }
    const steps: number[] = [];
    for (let position = 1; position < ramping.length; position += 1) {
      const step = ramping[position]! - ramping[position - 1]!;
      if (step > 0) steps.push(step);
    }
    if (steps.length === 0) {
      issue ??= 'BRAKING_RAMP_NOT_OBSERVED';
      continue;
    }
    return { value: median(steps) * ACCEL_ESTIMATOR_LIMITS.tickHz, samples: ramping.length };
  }
  increment(excluded, issue ?? 'NO_BRAKING_EVENT');
  return null;
}
/**
 * Throttle release delay from the ticks that keep the previous acceleration after the 047 request
 * falls to zero. Braking, a safety veto and a truncated window make the hold unidentifiable.
 */
function releaseValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const samples = episode.samples;
  let issue: AccelEpisodeExclusion | null = null;
  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index]!,
      previous = samples[index - 1]!;
    if (!(current.lift && previous.requestedAccelerationMps2 > 0)) continue;
    if (!(previous.committedAccelerationMps2 > 0)) {
      issue ??= 'NO_RELEASE_EVENT';
      continue;
    }
    if (current.veto) {
      issue ??= 'SAFETY_CONSTRAINED';
      continue;
    }
    if (!(current.committedAccelerationMps2 > 0))
      // The hold ended inside one tick: the delay is below the measured cadence and is a real zero.
      return { value: 0, samples: 1 };
    let end = -1,
      blocked: AccelEpisodeExclusion | null = null;
    for (
      let position = index;
      position < samples.length &&
      samples[position]!.tick - current.tick <= ACCEL_ESTIMATOR_LIMITS.maximumReleaseTicks;
      position += 1
    ) {
      const sample = samples[position]!;
      if (sample.requestedAccelerationMps2 < 0) {
        blocked = 'RELEASE_CANCELLED_BY_BRAKING';
        break;
      }
      if (sample.veto) {
        blocked = 'SAFETY_CONSTRAINED';
        break;
      }
      if (sample.committedAccelerationMps2 === 0) {
        end = position;
        break;
      }
    }
    if (blocked !== null) {
      issue ??= blocked;
      continue;
    }
    if (end < 0) {
      issue ??= 'RELEASE_HOLD_CENSORED';
      continue;
    }
    return { value: (end - index + 1) / ACCEL_ESTIMATOR_LIMITS.tickHz, samples: end - index + 1 };
  }
  increment(excluded, issue ?? 'NO_RELEASE_EVENT');
  return null;
}
/** Launch intensity inverted from the observed applied/requested ratio below the launch speed. */
function launchValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const candidates = episode.samples.filter(
      (sample) =>
        sample.speedMps < ACCEL_ESTIMATOR_LIMITS.launchSpeedMps &&
        sample.requestedAccelerationMps2 > 0,
    ),
    launches = candidates.filter((sample) => !sample.veto),
    vetoed = candidates.length - launches.length;
  if (launches.length < ACCEL_ESTIMATOR_LIMITS.minimumEpisodeSamples) {
    increment(
      excluded,
      launches.length === 0 && vetoed > 0 ? 'SAFETY_CONSTRAINED' : 'NO_LAUNCH_EVENT',
    );
    return null;
  }
  const minimum = ACCEL_ESTIMATOR_LIMITS.minimumLaunchFraction,
    tolerance = ACCEL_ESTIMATOR_LIMITS.ratioTolerance,
    ratios = launches.map(
      (sample) => sample.committedAccelerationMps2 / sample.requestedAccelerationMps2,
    );
  if (ratios.some((ratio) => ratio < minimum - tolerance || ratio > 1 + tolerance)) {
    increment(excluded, 'LAUNCH_FACTOR_OUT_OF_ENVELOPE');
    return null;
  }
  const intensities = ratios.map((ratio) => Math.max(0, (ratio - minimum) / (1 - minimum)));
  return { value: median(intensities), samples: launches.length };
}
/** Coasting bias inverted from the release of a mild positive cruise request. */
function coastingValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const tolerance = ACCEL_ESTIMATOR_LIMITS.ratioTolerance,
    candidates = episode.samples.filter(
      (sample) =>
        sample.speedMps >= ACCEL_ESTIMATOR_LIMITS.launchSpeedMps &&
        sample.requestedAccelerationMps2 > 0,
    ),
    cruising = candidates.filter((sample) => !sample.veto),
    vetoed = candidates.length - cruising.length,
    mild = cruising.filter(
      (sample) => sample.requestedAccelerationMps2 <= ACCEL_ESTIMATOR_LIMITS.coastingDemandMps2,
    ),
    strong = cruising.some(
      (sample) => sample.requestedAccelerationMps2 > ACCEL_ESTIMATOR_LIMITS.coastingDemandMps2,
    );
  if (mild.length < ACCEL_ESTIMATOR_LIMITS.minimumEpisodeSamples) {
    increment(
      excluded,
      cruising.length === 0 && vetoed > 0
        ? 'SAFETY_CONSTRAINED'
        : strong
          ? 'STRONG_REQUEST'
          : 'NO_COASTING_EVENT',
    );
    return null;
  }
  const ratios = mild.map(
    (sample) => sample.committedAccelerationMps2 / sample.requestedAccelerationMps2,
  );
  if (ratios.some((ratio) => ratio < -tolerance || ratio > 1 + tolerance)) {
    increment(excluded, 'COASTING_FACTOR_OUT_OF_ENVELOPE');
    return null;
  }
  return {
    value: median(ratios.map((ratio) => Math.max(0, 1 - ratio))),
    samples: mild.length,
  };
}
interface EpisodeValue {
  readonly id: string;
  readonly value: number;
  readonly samples: number;
}
const measureByKey: Readonly<
  Record<
    AccelEstimatorKey,
    (
      episode: AdmittedEpisode,
      excluded: Map<string, number>,
    ) => { value: number; samples: number } | null
  >
> = Object.freeze({
  braking_jerk: brakingValue,
  throttle_release_delay: releaseValue,
  launch_intensity: launchValue,
  coasting_bias: coastingValue,
});
/** Closed precedence: the reason names the most specific unusable fact of the set. */
const noValueReason: Readonly<Record<AccelEstimatorKey, readonly AccelEstimatorReason[]>> =
  Object.freeze({
    braking_jerk: [
      'BRAKING_DEMAND_CHANGED',
      'BRAKING_RAMP_CENSORED',
      'BRAKING_RAMP_NOT_OBSERVED',
      'NO_BRAKING_EVENT',
    ],
    throttle_release_delay: [
      'SAFETY_CONSTRAINED',
      'RELEASE_CANCELLED_BY_BRAKING',
      'RELEASE_HOLD_CENSORED',
      'NO_RELEASE_EVENT',
    ],
    launch_intensity: ['LAUNCH_FACTOR_OUT_OF_ENVELOPE', 'SAFETY_CONSTRAINED', 'NO_LAUNCH_EVENT'],
    coasting_bias: [
      'COASTING_FACTOR_OUT_OF_ENVELOPE',
      'SAFETY_CONSTRAINED',
      'STRONG_REQUEST',
      'NO_COASTING_EVENT',
    ],
  });
function reasonFor(
  key: AccelEstimatorKey,
  excluded: ReadonlyMap<string, number>,
): AccelEstimatorReason {
  return (
    noValueReason[key].find((reason) => excluded.has(reason)) ??
    ('NO_ELIGIBLE_EPISODES' as AccelEstimatorReason)
  );
}
function collectValues(
  episodes: readonly AdmittedEpisode[],
  measure: (
    episode: AdmittedEpisode,
    excluded: Map<string, number>,
  ) => { value: number; samples: number } | null,
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
function estimateKey(
  key: AccelEstimatorKey,
  episodes: readonly AdmittedEpisode[],
  seed: number,
): AccelKeyEstimate {
  const { values, excluded } = collectValues(episodes, measureByKey[key]),
    split = splitEpisodes(
      values.map((entry) => entry.id),
      seed,
    ),
    estimateValues = values.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationValues = values.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateValues.reduce((sum, entry) => sum + entry.samples, 0);
  if (values.length === 0) return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
  if (estimateValues.length < ACCEL_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
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
      estimateSamples,
      excluded,
      validation,
    );
  return typeof result === 'string'
    ? unobserved(
        key,
        result,
        estimateValues.length,
        estimateSamples,
        excluded,
        validation,
        uncertainty,
      )
    : result;
}

/**
 * Estimates the four 169 accel keys from demonstrated episodes. The same episodes and the same
 * `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateAccelPolicyStyle(input: AccelEstimatorInput): AccelEstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid accel estimator input');
  const splitSeed = count(input.splitSeed, 'split seed');
  if (splitSeed > ACCEL_ESTIMATOR_LIMITS.maximumSeed) fail('Accel split seed out of range');
  if (!Array.isArray(input.episodes)) fail('Invalid accel evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: AccelEpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as AccelEvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as AccelEvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }
  const keys = Object.fromEntries(
    ACCEL_ESTIMATOR_KEYS.map((key) => [key, estimateKey(key, admitted, splitSeed)]),
  ) as Record<AccelEstimatorKey, AccelKeyEstimate>;
  return Object.freeze({
    version: ACCEL_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: accelGroupConstraints,
    admittedEpisodes: Object.freeze(admitted.map((episode) => episode.id)),
    refusedEpisodes: Object.freeze(refused.map((entry) => Object.freeze(entry))),
    compatibility: compatibility(),
  });
}
