import {
  SIGNAL_POLICY_V2_KEYS,
  SIGNAL_POLICY_V2_LIMITS,
  SIGNAL_POLICY_V2_M_KEYS,
} from '../autonomy';
import type { SignalPolicyV2Key, SignalPolicyV2Reason } from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 174 signal estimator: estimates the four 173 signal keys from demonstrated episodes while keeping
 * yellow feasibility, yellow engagement, red-run gap acceptance and green launch in separate
 * contexts.
 *
 * The estimator inverts the delivered `173-signal-policy-v2` arithmetic instead of inventing a
 * second signal model: every value is measured from facts the delivered command already reports
 * (the 173 reason, the sampled unit, the time to line, the accepted or rejected crossing, the launch
 * acceleration) plus the 050 M compliance factor of the same tick. It is candidate-only: it never
 * publishes a profile, never writes to a store, never flips a 092 `implemented` flag and never
 * changes the 173 semantics. It reads the key list, the once-per-opportunity stop vocabulary, the
 * 3 s red-run safety cap and the 6 m/s² launch maximum directly from 173, and the catalog ranges
 * from the 092 registry, so measurement and decision use the same constants.
 *
 * 1. `yellow_stop_probability` (probability) — the stop rate over sampled, feasible yellow
 *    approaches, divided by the observed 050 `red_stop_probability`: 173 turns the key into the
 *    effective probability `M · key`, so only the product is visible and the M factor is the honest
 *    denominator. A rate requires enough opportunities; a demonstrated zero stays a candidate zero.
 * 2. `yellow_commit_time` (s) — a committed approach proves `key ≥ time to line`, a sampled or
 *    red-ahead approach proves `key ≤ time to line`; the estimate is the intersection of those
 *    bounds and the uncertainty is half its width. A single inequality is only a bound.
 * 3. `red_run_gap_acceptance` (s) — an accepted crossing proves `key ≤ observed gap`, a rejection
 *    above the 3 s safety cap proves `key > observed gap`; below the cap the safety margin decides
 *    and the crossing proves nothing, and an unknown gap refuses the crossing.
 * 4. `green_launch_acceleration` (m/s²) — the acceleration 173 commands at a standstill release
 *    after the M start delay, measured per launch and bounded by the catalog maximum.
 */
export const SIGNAL_V2_ESTIMATOR_VERSION = '174-signal-estimator-v2' as const;
export const SIGNAL_V2_ESTIMATOR_KEYS = SIGNAL_POLICY_V2_KEYS;
export type SignalV2EstimatorKey = SignalPolicyV2Key;
export type SignalV2Scenario =
  'YELLOW_FEASIBILITY' | 'YELLOW_COMMITMENT' | 'RED_RUN_GAP' | 'GREEN_LAUNCH';

export const signalV2EstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'NO_YELLOW_FEASIBILITY_EPISODE',
  'YELLOW_OPPORTUNITY_NOT_SAMPLED',
  'YELLOW_TRIALS_BELOW_MINIMUM',
  'YELLOW_COMPLIANCE_FACTOR_ZERO',
  'YELLOW_COMPLIANCE_FACTOR_INCONSISTENT',
  'YELLOW_STOP_RATE_OUT_OF_ENVELOPE',
  'NO_YELLOW_COMMITMENT_EPISODE',
  'COMMIT_PREEMPTED_BY_LATE_BRAKE',
  'COMMIT_GEOMETRY_UNKNOWN',
  'COMMIT_STANDSTILL',
  'COMMIT_LOWER_BOUND_UNOBSERVED',
  'COMMIT_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_COMMIT_BOUNDS',
  'COMMIT_BOUNDS_OUT_OF_ENVELOPE',
  'NO_RED_RUN_EPISODE',
  'RED_RUN_NOT_PROPOSED',
  'RED_RUN_GAP_UNKNOWN',
  'RED_RUN_SAFETY_CAP',
  'RED_RUN_LOWER_BOUND_UNOBSERVED',
  'RED_RUN_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_GAP_BOUNDS',
  'RED_RUN_GAP_BOUNDS_OUT_OF_ENVELOPE',
  'NO_GREEN_LAUNCH_EPISODE',
  'GREEN_LAUNCH_HELD_BY_DELAY',
  'GREEN_LAUNCH_NOT_FROM_STANDSTILL',
  'GREEN_LAUNCH_OUT_OF_ENVELOPE',
] as const;
export type SignalV2EstimatorReason = (typeof signalV2EstimatorReasons)[number];

export const signalV2EpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type SignalV2EpisodeRefusal = (typeof signalV2EpisodeRefusals)[number];

/**
 * The closed 173 reason vocabulary, mirrored so an unknown reason can never be measurement evidence.
 * The four scenarios read only the reasons that name their own fact.
 */
export const signalV2EvidenceReasons = [
  'SIGNAL_POLICY',
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'FOREIGN_OR_STALE_OBSERVATION',
  'FOREIGN_OR_STALE_SIGNAL',
  'SIGNAL_PROFILE_MISMATCH',
  'SIGNAL_M_PROFILE_MISMATCH',
  'SIGNAL_OBSERVATION_MISMATCH',
  'SIGNAL_UNAVAILABLE',
  'NO_SIGNAL',
  'GREEN_START_DELAY',
  'GREEN_RELEASE',
  'GREEN_LAUNCH',
  'YELLOW_LATE_BRAKE',
  'YELLOW_STOP_NO_GEOMETRY',
  'YELLOW_STOP_STANDSTILL',
  'YELLOW_STOP_RED_AHEAD',
  'YELLOW_COMMIT',
  'YELLOW_STOP',
  'YELLOW_PROCEED',
  'RED_STOP',
  'RED_RUN_ACCEPTED',
  'RED_RUN_REJECTED',
  'RED_RUN_GAP_UNKNOWN',
] as const;

export const SIGNAL_V2_ESTIMATOR_LIMITS = Object.freeze({
  version: SIGNAL_V2_ESTIMATOR_VERSION,
  idCodeUnits: SIGNAL_POLICY_V2_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  /** Same observation envelope as 173; a fact outside it is refused, never measured. */
  maximumObservedSpeedMps: SIGNAL_POLICY_V2_LIMITS.maximumSpeedMps,
  maximumDistanceM: SIGNAL_POLICY_V2_LIMITS.maximumDistanceM,
  maximumPhaseTimeS: SIGNAL_POLICY_V2_LIMITS.maximumPhaseTimeS,
  maximumGapS: SIGNAL_POLICY_V2_LIMITS.maximumConflictGapS,
  maximumTimeToLineS: 1_000_000,
  /** 173 standstill threshold; a launch is only a fact below it. */
  minimumStandstillSpeedMps: SIGNAL_POLICY_V2_LIMITS.minimumSpeedMps,
  /** 173 safety cap of the red run: below it the cap decides, not the key. */
  redRunMinimumGapS: SIGNAL_POLICY_V2_LIMITS.redRunMinimumGapS,
  /** 173 launch clamp; the catalog maximum of `green_launch_acceleration`. */
  maximumLaunchAccelerationMps2: SIGNAL_POLICY_V2_LIMITS.maximumLaunchAccelerationMps2,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  /** A stop rate needs enough opportunities to separate a preference from a coin toss. */
  minimumYellowTrials: 6,
  ratioTolerance: 1e-6,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloor: Object.freeze({
    yellow_stop_probability: 0.02,
    yellow_commit_time: 0.05,
    red_run_gap_acceptance: 0.05,
    green_launch_acceleration: 0.05,
  }),
  maximumUncertainty: Object.freeze({
    yellow_stop_probability: 0.2,
    yellow_commit_time: 0.6,
    red_run_gap_acceptance: 1,
    green_launch_acceleration: 0.35,
  }),
  validationTolerance: Object.freeze({
    yellow_stop_probability: 0.15,
    yellow_commit_time: 0.5,
    red_run_gap_acceptance: 1,
    green_launch_acceleration: 0.4,
  }),
  retainedHistory: 0,
});

export const signalV2EligibleScenarios: Readonly<Record<SignalV2EstimatorKey, SignalV2Scenario>> =
  Object.freeze({
    yellow_stop_probability: 'YELLOW_FEASIBILITY',
    yellow_commit_time: 'YELLOW_COMMITMENT',
    red_run_gap_acceptance: 'RED_RUN_GAP',
    green_launch_acceleration: 'GREEN_LAUNCH',
  });

export const signalV2EligibleContexts: Readonly<Record<SignalV2EstimatorKey, string>> =
  Object.freeze({
    yellow_stop_probability:
      'o apropiere de galben în mișcare, cu geometrie cunoscută, în care 173 a ajuns la eșantionul ' +
      'său de fezabilitate (nu era deja angajată), plus factorul M de conformitate al aceluiași tick',
    yellow_commit_time:
      'o apropiere de galben în care 173 a intrat fie angajat, fie eșantionat, deci timpul până la ' +
      'linie delimitează orizontul de angajare',
    red_run_gap_acceptance:
      'o traversare de roșu propusă de 050, în care lumea a raportat un gap conflictual; acceptarea ' +
      'dă limita superioară, refuzul peste plasa de siguranță de 3 s dă limita inferioară',
    green_launch_acceleration:
      'o plecare de pe loc la verde, după expirarea ținerii M de la verde, în care 173 comandă ' +
      'accelerația de plecare',
  });

export const signalV2GroupConstraints = Object.freeze([
  Object.freeze({
    id: 'YELLOW_STOP_AND_RED_COMPLIANCE_SHARED',
    keys: Object.freeze(['yellow_stop_probability'] as const),
    explanation:
      'Probabilitatea de galben și probabilitatea M de oprire la roșu împart aceeași decizie: 173 ' +
      'oprește cu probabilitatea efectivă `red_stop_probability · yellow_stop_probability`. Din ' +
      'comportament se vede numai produsul, deci factorul M observat este denominatorul onest al ' +
      'cheii; cu un factor M nul nicio oprire la galben nu este posibilă și cheia rămâne ' +
      'neobservată, în loc să fie dedusă dintr-un raport imposibil.',
  }),
  Object.freeze({
    id: 'YELLOW_PROBABILITY_AND_COMMIT_SHARE_APPROACH',
    keys: Object.freeze(['yellow_stop_probability', 'yellow_commit_time'] as const),
    explanation:
      'Probabilitatea de galben și orizontul de angajare împart aceeași apropiere: 173 verifică ' +
      'întâi orizontul, apoi eșantionează. O apropiere angajată dovedește doar o limită inferioară ' +
      'a orizontului și nu intră în numitorul opririlor, iar una eșantionată dă o limită ' +
      'superioară a orizontului și un singur eșantion de conformitate. Niciuna nu este dedusă din ' +
      'cealaltă.',
  }),
  Object.freeze({
    id: 'RED_RUN_GAP_DEPENDS_ON_OBSERVED_GAP',
    keys: Object.freeze(['red_run_gap_acceptance'] as const),
    explanation:
      'Gap-ul pe roșu este identificabil numai când lumea raportează un gap conflictual: un gap ' +
      'necunoscut refuză traversarea și nu dovedește nimic. Sub plasa de siguranță de 3 s a lui ' +
      '173 cerința efectivă este plasa, nu cheia, deci un refuz acolo nu oferă limită inferioară; ' +
      'cheia se măsoară doar din decizii în care capul de siguranță nu a decis.',
  }),
  Object.freeze({
    id: 'GREEN_LAUNCH_AFTER_START_DELAY',
    keys: Object.freeze(['green_launch_acceleration'] as const),
    explanation:
      'Accelerația de plecare este identificabilă numai după ce ținerea M de la verde a expirat și ' +
      'vehiculul este încă oprit: cât timp 173 raportează `GREEN_START_DELAY`, comanda este ' +
      'ținerea, nu plecarea, iar un vehicul deja în mișcare raportează o eliberare, nu o plecare de ' +
      'pe loc.',
  }),
  Object.freeze({
    id: 'SIGNAL_KEYS_FROM_ONE_APPROACH',
    keys: SIGNAL_POLICY_V2_KEYS,
    explanation:
      'Cele patru chei pot fi observate în aceeași călătorie, dar nu din aceleași fapte: ' +
      'probabilitatea de galben cere un eșantion de fezabilitate, orizontul cere o apropiere ' +
      'angajată sau eșantionată, gap-ul pe roșu cere o traversare propusă cu gap observat, iar ' +
      'plecarea cere un verde de pe loc după ținerea M. Un set cu un singur tip de fapt lasă ' +
      'celelalte chei neobservate.',
  }),
]);

/** One tick of a signal demonstration, exactly as the delivered 173 command reports it. */
export interface SignalV2EvidenceSample {
  readonly tick: number;
  readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
  /** True when `evaluateSignalPolicyV2` applied the keys, i.e. the command reason was SIGNAL_POLICY. */
  readonly policyActive: boolean;
  /** The 173 command reason of the tick. */
  readonly reason: SignalPolicyV2Reason;
  readonly action: 'PROCEED' | 'START_DELAY' | 'STOP' | 'UNKNOWN';
  readonly speedMps: number;
  readonly distanceToStopLineM: number | null;
  readonly phaseRemainingS: number;
  readonly conflictGapS: number | null;
  /** Seconds to the stop point after the M `red_stop_line_offset`; the horizon comparison input. */
  readonly timeToLineS: number | null;
  /** The single deterministic draw of the opportunity; null when the horizon decided first. */
  readonly sampledUnit: number | null;
  readonly yellowCommitted: boolean;
  readonly yellowFeasibleToStop: boolean | null;
  readonly redRunAccepted: boolean | null;
  readonly launchAccelerationMps2: number | null;
  /** The M `red_stop_probability` of the 050 result of the same tick; null without a signal. */
  readonly redStopProbability: number | null;
}

export interface SignalV2EvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly SignalV2EvidenceSample[];
}

export interface SignalV2EstimatorInput {
  readonly episodes: readonly SignalV2EvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface SignalV2Validation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}

export interface SignalV2KeyEstimate {
  readonly key: SignalV2EstimatorKey;
  readonly scenario: SignalV2Scenario;
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
  readonly reason: SignalV2EstimatorReason | null;
  readonly validation: SignalV2Validation;
}

export interface SignalV2Compatibility {
  readonly policyVersion: '173-signal-policy-v2';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  /** 173 keys the estimate belongs to; the four M signal keys are read, never estimated here. */
  readonly mReadByPolicy: readonly string[];
  readonly redRunSafetyCapS: number;
  readonly maximumLaunchAccelerationMps2: number;
  readonly catalogRanges: Readonly<
    Record<
      SignalV2EstimatorKey,
      { readonly min: number; readonly max: number; readonly unit: string }
    >
  >;
}

export interface SignalV2EstimatorResult {
  readonly version: typeof SIGNAL_V2_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<SignalV2EstimatorKey, SignalV2KeyEstimate>>;
  readonly groupConstraints: typeof signalV2GroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: SignalV2EpisodeRefusal;
  }[];
  readonly compatibility: SignalV2Compatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
  readonly policyActive: boolean;
  readonly reason: SignalPolicyV2Reason;
  readonly action: 'PROCEED' | 'START_DELAY' | 'STOP' | 'UNKNOWN';
  readonly speedMps: number;
  readonly distanceToStopLineM: number | null;
  readonly phaseRemainingS: number;
  readonly conflictGapS: number | null;
  readonly timeToLineS: number | null;
  readonly sampledUnit: number | null;
  readonly yellowCommitted: boolean;
  readonly yellowFeasibleToStop: boolean | null;
  readonly redRunAccepted: boolean | null;
  readonly launchAccelerationMps2: number | null;
  readonly redStopProbability: number | null;
}

interface AdmittedEpisode {
  readonly id: string;
  readonly samples: readonly AdmittedSample[];
}

interface EpisodeValue {
  readonly id: string;
  readonly value: number;
  readonly samples: number;
}

interface EpisodeBounds {
  readonly id: string;
  readonly lower: number | null;
  readonly upper: number | null;
  readonly samples: number;
}

function fail(message: string): never {
  throw new Error(message);
}
function identity(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > SIGNAL_V2_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid signal evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid signal evidence ${field}`);
  return value;
}
function optionalFinite(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
): number | null {
  return value === null ? null : finite(value, minimum, maximum, field);
}
function optionalRatio(value: unknown, field: string): number | null {
  return optionalFinite(value, 0, 1, field);
}
function optionalBoolean(value: unknown, field: string): boolean | null {
  if (value === null || typeof value === 'boolean') return value;
  return fail(`Invalid signal evidence ${field}`);
}
function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`Invalid signal evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid signal evidence sample');
  const sample = value as SignalV2EvidenceSample,
    tick = count(sample.tick, 'sample tick'),
    signalState =
      sample.signalState === null
        ? null
        : ((['RED', 'YELLOW', 'GREEN'] as const).find((entry) => entry === sample.signalState) ??
          fail('Invalid signal evidence sample state')),
    action =
      (['PROCEED', 'START_DELAY', 'STOP', 'UNKNOWN'] as const).find(
        (entry) => entry === sample.action,
      ) ?? fail('Invalid signal evidence sample action');
  for (const field of ['policyActive', 'yellowCommitted'] as const)
    if (typeof sample[field] !== 'boolean') fail(`Invalid signal evidence sample ${field}`);
  if (!(signalV2EvidenceReasons as readonly string[]).includes(sample.reason))
    fail('Invalid signal evidence sample reason');
  return Object.freeze({
    tick,
    signalState,
    policyActive: sample.policyActive,
    reason: sample.reason,
    action,
    speedMps: finite(
      sample.speedMps,
      0,
      SIGNAL_V2_ESTIMATOR_LIMITS.maximumObservedSpeedMps,
      'sample speed',
    ),
    distanceToStopLineM: optionalFinite(
      sample.distanceToStopLineM,
      -SIGNAL_V2_ESTIMATOR_LIMITS.maximumDistanceM,
      SIGNAL_V2_ESTIMATOR_LIMITS.maximumDistanceM,
      'sample distance',
    ),
    phaseRemainingS: finite(
      sample.phaseRemainingS,
      0,
      SIGNAL_V2_ESTIMATOR_LIMITS.maximumPhaseTimeS,
      'sample phase remaining',
    ),
    conflictGapS: optionalFinite(
      sample.conflictGapS,
      0,
      SIGNAL_V2_ESTIMATOR_LIMITS.maximumGapS,
      'sample conflict gap',
    ),
    timeToLineS: optionalFinite(
      sample.timeToLineS,
      0,
      SIGNAL_V2_ESTIMATOR_LIMITS.maximumTimeToLineS,
      'sample time to line',
    ),
    sampledUnit: optionalRatio(sample.sampledUnit, 'sample unit'),
    yellowCommitted: sample.yellowCommitted,
    yellowFeasibleToStop: optionalBoolean(sample.yellowFeasibleToStop, 'sample feasibility'),
    redRunAccepted: optionalBoolean(sample.redRunAccepted, 'sample red-run acceptance'),
    launchAccelerationMps2: optionalFinite(
      sample.launchAccelerationMps2,
      0,
      SIGNAL_V2_ESTIMATOR_LIMITS.maximumLaunchAccelerationMps2,
      'sample launch acceleration',
    ),
    redStopProbability: optionalRatio(sample.redStopProbability, 'sample compliance factor'),
  });
}
function admitEpisode(value: unknown): AdmittedEpisode | SignalV2EpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid signal evidence episode');
  const episode = value as SignalV2EvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid signal evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid signal evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid signal evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched signal evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Signal evidence samples are not strictly ordered');
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
function catalogRange(key: SignalV2EstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function compatibility(): SignalV2Compatibility {
  return Object.freeze({
    policyVersion: SIGNAL_POLICY_V2_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    mReadByPolicy: Object.freeze([...SIGNAL_POLICY_V2_M_KEYS]),
    redRunSafetyCapS: SIGNAL_V2_ESTIMATOR_LIMITS.redRunMinimumGapS,
    maximumLaunchAccelerationMps2: SIGNAL_V2_ESTIMATOR_LIMITS.maximumLaunchAccelerationMps2,
    catalogRanges: Object.freeze(
      Object.fromEntries(SIGNAL_V2_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)])) as Record<
        SignalV2EstimatorKey,
        { min: number; max: number; unit: string }
      >,
    ),
  });
}
function emptyValidation(key: SignalV2EstimatorKey): SignalV2Validation {
  return Object.freeze({
    status: 'NO_DATA',
    episodes: 0,
    value: null,
    error: null,
    tolerance: SIGNAL_V2_ESTIMATOR_LIMITS.validationTolerance[key],
    detail: 'no independent demonstration episodes',
  });
}
function unobserved(
  key: SignalV2EstimatorKey,
  reason: SignalV2EstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: SignalV2Validation = emptyValidation(key),
  uncertainty: number | null = null,
): SignalV2KeyEstimate {
  return Object.freeze({
    key,
    scenario: signalV2EligibleScenarios[key],
    unit: getParameterDefinition(key).unit,
    eligibleContext: signalV2EligibleContexts[key],
    status: 'UNOBSERVED',
    value: null,
    rawValue: null,
    clamped: false,
    uncertainty,
    uncertaintyThreshold: SIGNAL_V2_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason,
    validation,
  });
}
function candidate(
  key: SignalV2EstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: SignalV2Validation,
): SignalV2KeyEstimate | SignalV2EstimatorReason {
  if (uncertainty > SIGNAL_V2_ESTIMATOR_LIMITS.maximumUncertainty[key])
    return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    scenario: signalV2EligibleScenarios[key],
    unit: range.unit,
    eligibleContext: signalV2EligibleContexts[key],
    status: 'CANDIDATE',
    value,
    rawValue,
    clamped: value !== rawValue,
    uncertainty,
    uncertaintyThreshold: SIGNAL_V2_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason: null,
    validation,
  });
}
function continuousValidation(
  key: SignalV2EstimatorKey,
  estimate: number,
  values: readonly number[],
): SignalV2Validation {
  const tolerance = SIGNAL_V2_ESTIMATOR_LIMITS.validationTolerance[key];
  if (values.length < SIGNAL_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: values.length,
      value: values.length === 0 ? null : median(values),
      error: values.length === 0 ? null : Math.abs(median(values) - estimate),
      tolerance,
      detail: `validation set has ${values.length} of the required ${SIGNAL_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
    });
  const value = median(values),
    error = Math.abs(value - estimate),
    unit = getParameterDefinition(key).unit;
  return Object.freeze({
    status: error <= tolerance ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: values.length,
    value,
    error,
    tolerance,
    detail: `held-out estimate ${value.toFixed(4)} ${unit} differs by ${error.toFixed(4)} ${unit}`,
  });
}
function bracketValidation(
  key: SignalV2EstimatorKey,
  estimate: number,
  bounds: readonly EpisodeBounds[],
  tolerance: number,
): SignalV2Validation {
  const unit = getParameterDefinition(key).unit,
    lowers = bounds.map((entry) => entry.lower).filter((entry): entry is number => entry !== null),
    uppers = bounds.map((entry) => entry.upper).filter((entry): entry is number => entry !== null),
    value =
      lowers.length === 0 && uppers.length === 0
        ? null
        : lowers.length === 0
          ? Math.min(...uppers)
          : uppers.length === 0
            ? Math.max(...lowers)
            : (Math.max(...lowers) + Math.min(...uppers)) / 2;
  if (bounds.length < SIGNAL_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: bounds.length,
      value,
      error: value === null ? null : Math.abs(value - estimate),
      tolerance,
      detail: `validation set has ${bounds.length} of the required ${SIGNAL_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
    });
  const heldOutLower = lowers.length === 0 ? null : Math.max(...lowers),
    heldOutUpper = uppers.length === 0 ? null : Math.min(...uppers),
    inconsistent =
      (heldOutLower !== null && heldOutUpper !== null && heldOutLower > heldOutUpper) ||
      bounds.some(
        (entry) =>
          (entry.lower !== null && entry.lower > estimate + tolerance) ||
          (entry.upper !== null && entry.upper < estimate - tolerance),
      );
  return Object.freeze({
    status: inconsistent ? 'OUTSIDE_TOLERANCE' : 'VALIDATED',
    episodes: bounds.length,
    value,
    error: value === null ? null : Math.abs(value - estimate),
    tolerance,
    detail: `${bounds.length} held-out bounds admit ${estimate.toFixed(4)} ${unit} within ${tolerance} ${unit}`,
  });
}
function uncertaintyOf(key: SignalV2EstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    SIGNAL_V2_ESTIMATOR_LIMITS.uncertaintyFloor[key],
    (SIGNAL_V2_ESTIMATOR_LIMITS.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}
/**
 * Yellow stop rate over sampled, feasible approaches. 173 decides a stop with the effective
 * probability `M · key`, so the rate is the product and the observed M factor is its denominator.
 * The denominator is the number of identified opportunities, never the number of frames.
 */
function yellowStopValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const tolerance = SIGNAL_V2_ESTIMATOR_LIMITS.ratioTolerance;
  let trials = 0,
    stops = 0,
    issue: SignalV2EstimatorReason | null = null;
  const factors = new Set<number>();
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.signalState !== 'YELLOW') continue;
    if (sample.sampledUnit === null) {
      issue ??= 'YELLOW_OPPORTUNITY_NOT_SAMPLED';
      continue;
    }
    if (sample.reason !== 'YELLOW_STOP' && sample.reason !== 'YELLOW_PROCEED') {
      issue ??= 'YELLOW_OPPORTUNITY_NOT_SAMPLED';
      continue;
    }
    if (sample.yellowFeasibleToStop !== true) {
      issue ??= 'YELLOW_OPPORTUNITY_NOT_SAMPLED';
      continue;
    }
    if (sample.redStopProbability === null) {
      issue ??= 'YELLOW_COMPLIANCE_FACTOR_ZERO';
      continue;
    }
    factors.add(sample.redStopProbability);
    trials += 1;
    if (sample.reason === 'YELLOW_STOP') stops += 1;
  }
  if (trials === 0) {
    increment(excluded, issue ?? 'NO_YELLOW_FEASIBILITY_EPISODE');
    return null;
  }
  if (factors.size !== 1) {
    increment(excluded, 'YELLOW_COMPLIANCE_FACTOR_INCONSISTENT');
    return null;
  }
  const factor = [...factors][0]!;
  if (factor <= tolerance) {
    increment(excluded, 'YELLOW_COMPLIANCE_FACTOR_ZERO');
    return null;
  }
  if (trials < SIGNAL_V2_ESTIMATOR_LIMITS.minimumYellowTrials) {
    increment(excluded, 'YELLOW_TRIALS_BELOW_MINIMUM');
    return null;
  }
  const value = stops / trials / factor;
  if (value < -tolerance || value > 1 + tolerance) {
    increment(excluded, 'YELLOW_STOP_RATE_OUT_OF_ENVELOPE');
    return null;
  }
  return { value: Math.max(0, Math.min(1, value)), samples: trials };
}
interface Bracket {
  readonly lower: number | null;
  readonly upper: number | null;
  readonly samples: number;
}
/**
 * Engagement bounds of the delivered 173 yellow arithmetic: an approach handled by the commit
 * branch proves `key ≥ time to line`, while a sampled or red-ahead approach proves
 * `key ≤ time to line`. The M late-brake stop and the missing geometry decide before the horizon and
 * are therefore not bounds of it.
 */
function commitBounds(episode: AdmittedEpisode, excluded: Map<string, number>): Bracket | null {
  let lower: number | null = null,
    upper: number | null = null,
    samples = 0,
    issue: SignalV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.signalState !== 'YELLOW') continue;
    if (sample.timeToLineS === null) {
      issue ??= 'COMMIT_GEOMETRY_UNKNOWN';
      continue;
    }
    const time = sample.timeToLineS;
    if (sample.reason === 'YELLOW_COMMIT') {
      if (!sample.yellowCommitted) continue;
      lower = lower === null ? time : Math.max(lower, time);
      samples += 1;
      continue;
    }
    if (
      sample.reason === 'YELLOW_STOP' ||
      sample.reason === 'YELLOW_PROCEED' ||
      sample.reason === 'YELLOW_STOP_RED_AHEAD'
    ) {
      // 173 reports whether the horizon was still enough to stop: true bounds it above, false below.
      if (sample.reason === 'YELLOW_STOP_RED_AHEAD' && sample.yellowFeasibleToStop === false) {
        lower = lower === null ? time : Math.max(lower, time);
      } else if (
        sample.reason !== 'YELLOW_STOP_RED_AHEAD' ||
        sample.yellowFeasibleToStop === true
      ) {
        upper = upper === null ? time : Math.min(upper, time);
      } else continue;
      samples += 1;
      continue;
    }
    if (sample.reason === 'YELLOW_LATE_BRAKE') issue ??= 'COMMIT_PREEMPTED_BY_LATE_BRAKE';
    else if (sample.reason === 'YELLOW_STOP_STANDSTILL') issue ??= 'COMMIT_STANDSTILL';
    else if (sample.reason === 'YELLOW_STOP_NO_GEOMETRY') issue ??= 'COMMIT_GEOMETRY_UNKNOWN';
  }
  if (samples === 0) {
    increment(excluded, issue ?? 'NO_YELLOW_COMMITMENT_EPISODE');
    return null;
  }
  return { lower, upper, samples };
}
/**
 * Gap bounds of the delivered 173 red arithmetic: an accepted crossing proves `key ≤ gap`, a
 * rejection above the 3 s safety cap proves `key > gap`. Below the cap the safety margin decides, so
 * the rejection is discarded instead of being read as a small key, and an unknown gap refuses the
 * crossing and proves nothing.
 */
function gapBounds(episode: AdmittedEpisode, excluded: Map<string, number>): Bracket | null {
  const tolerance = SIGNAL_V2_ESTIMATOR_LIMITS.ratioTolerance;
  let lower: number | null = null,
    upper: number | null = null,
    samples = 0,
    issue: SignalV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.signalState !== 'RED') continue;
    if (sample.reason === 'RED_STOP') {
      issue ??= 'RED_RUN_NOT_PROPOSED';
      continue;
    }
    if (sample.reason === 'RED_RUN_GAP_UNKNOWN') {
      issue ??= 'RED_RUN_GAP_UNKNOWN';
      continue;
    }
    if (sample.conflictGapS === null) {
      issue ??= 'RED_RUN_GAP_UNKNOWN';
      continue;
    }
    if (sample.reason === 'RED_RUN_ACCEPTED' && sample.redRunAccepted !== false) {
      upper = upper === null ? sample.conflictGapS : Math.min(upper, sample.conflictGapS);
      samples += 1;
      continue;
    }
    if (sample.reason === 'RED_RUN_REJECTED' && sample.redRunAccepted !== true) {
      if (sample.conflictGapS + tolerance < SIGNAL_V2_ESTIMATOR_LIMITS.redRunMinimumGapS) {
        issue ??= 'RED_RUN_SAFETY_CAP';
        continue;
      }
      lower = lower === null ? sample.conflictGapS : Math.max(lower, sample.conflictGapS);
      samples += 1;
      continue;
    }
    issue ??= 'RED_RUN_NOT_PROPOSED';
  }
  if (samples === 0) {
    increment(excluded, issue ?? 'NO_RED_RUN_EPISODE');
    return null;
  }
  return { lower, upper, samples };
}
/**
 * Green launch acceleration of the delivered 173 green arithmetic. Only a standstill release after
 * the M start delay commands the key; the launch is measured per release and the episode value is
 * the median of its launches.
 */
function launchValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const range = catalogRange('green_launch_acceleration'),
    tolerance = SIGNAL_V2_ESTIMATOR_LIMITS.ratioTolerance,
    values: number[] = [];
  let issue: SignalV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.signalState !== 'GREEN') continue;
    if (sample.reason === 'GREEN_START_DELAY') {
      issue ??= 'GREEN_LAUNCH_HELD_BY_DELAY';
      continue;
    }
    if (sample.reason !== 'GREEN_LAUNCH') {
      issue ??= 'GREEN_LAUNCH_NOT_FROM_STANDSTILL';
      continue;
    }
    if (sample.launchAccelerationMps2 === null) {
      issue ??= 'GREEN_LAUNCH_NOT_FROM_STANDSTILL';
      continue;
    }
    if (
      sample.launchAccelerationMps2 < range.min - tolerance ||
      sample.launchAccelerationMps2 > range.max + tolerance
    ) {
      issue ??= 'GREEN_LAUNCH_OUT_OF_ENVELOPE';
      continue;
    }
    values.push(Math.max(range.min, Math.min(range.max, sample.launchAccelerationMps2)));
  }
  if (values.length === 0) {
    increment(excluded, issue ?? 'NO_GREEN_LAUNCH_EPISODE');
    return null;
  }
  return { value: median(values), samples: values.length };
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
function collectBounds(
  episodes: readonly AdmittedEpisode[],
  measure: (episode: AdmittedEpisode, excluded: Map<string, number>) => Bracket | null,
  contradictory: SignalV2EstimatorReason,
): { bounds: EpisodeBounds[]; excluded: Map<string, number> } {
  const bounds: EpisodeBounds[] = [],
    excluded = new Map<string, number>();
  for (const episode of episodes) {
    const measured = measure(episode, excluded);
    if (measured === null) continue;
    if (measured.lower !== null && measured.upper !== null && measured.lower > measured.upper) {
      increment(excluded, contradictory);
      continue;
    }
    bounds.push({
      id: episode.id,
      lower: measured.lower,
      upper: measured.upper,
      samples: measured.samples,
    });
  }
  return { bounds, excluded };
}
/** Closed precedence: the reason names the most specific unusable fact of the set. */
const noValueReason: Readonly<Record<SignalV2EstimatorKey, readonly SignalV2EstimatorReason[]>> =
  Object.freeze({
    yellow_stop_probability: [
      'YELLOW_COMPLIANCE_FACTOR_INCONSISTENT',
      'YELLOW_COMPLIANCE_FACTOR_ZERO',
      'YELLOW_STOP_RATE_OUT_OF_ENVELOPE',
      'YELLOW_TRIALS_BELOW_MINIMUM',
      'YELLOW_OPPORTUNITY_NOT_SAMPLED',
      'NO_YELLOW_FEASIBILITY_EPISODE',
    ],
    yellow_commit_time: [
      'CONTRADICTORY_COMMIT_BOUNDS',
      'COMMIT_BOUNDS_OUT_OF_ENVELOPE',
      'COMMIT_UPPER_BOUND_UNOBSERVED',
      'COMMIT_LOWER_BOUND_UNOBSERVED',
      'COMMIT_PREEMPTED_BY_LATE_BRAKE',
      'COMMIT_STANDSTILL',
      'COMMIT_GEOMETRY_UNKNOWN',
      'NO_YELLOW_COMMITMENT_EPISODE',
    ],
    red_run_gap_acceptance: [
      'CONTRADICTORY_GAP_BOUNDS',
      'RED_RUN_GAP_BOUNDS_OUT_OF_ENVELOPE',
      'RED_RUN_UPPER_BOUND_UNOBSERVED',
      'RED_RUN_LOWER_BOUND_UNOBSERVED',
      'RED_RUN_GAP_UNKNOWN',
      'RED_RUN_SAFETY_CAP',
      'RED_RUN_NOT_PROPOSED',
      'NO_RED_RUN_EPISODE',
    ],
    green_launch_acceleration: [
      'GREEN_LAUNCH_OUT_OF_ENVELOPE',
      'GREEN_LAUNCH_HELD_BY_DELAY',
      'GREEN_LAUNCH_NOT_FROM_STANDSTILL',
      'NO_GREEN_LAUNCH_EPISODE',
    ],
  });
function reasonFor(
  key: SignalV2EstimatorKey,
  excluded: ReadonlyMap<string, number>,
): SignalV2EstimatorReason {
  return (
    noValueReason[key].find((reason) => excluded.has(reason)) ??
    ('NO_ELIGIBLE_EPISODES' as SignalV2EstimatorReason)
  );
}
function estimateContinuous(
  key: SignalV2EstimatorKey,
  episodes: readonly AdmittedEpisode[],
  seed: number,
  measure: (
    episode: AdmittedEpisode,
    excluded: Map<string, number>,
  ) => { value: number; samples: number } | null,
): SignalV2KeyEstimate {
  const { values, excluded } = collectValues(episodes, measure),
    split = splitEpisodes(
      values.map((entry) => entry.id),
      seed,
    ),
    estimateValues = values.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationValues = values.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateValues.reduce((sum, entry) => sum + entry.samples, 0);
  if (values.length === 0) return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
  if (estimateValues.length < SIGNAL_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
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
interface BracketReasons {
  readonly noEpisode: SignalV2EstimatorReason;
  readonly lower: SignalV2EstimatorReason;
  readonly upper: SignalV2EstimatorReason;
  readonly contradictory: SignalV2EstimatorReason;
  readonly envelope: SignalV2EstimatorReason;
}
function estimateBracket(
  key: SignalV2EstimatorKey,
  episodes: readonly AdmittedEpisode[],
  seed: number,
  measure: (episode: AdmittedEpisode, excluded: Map<string, number>) => Bracket | null,
  reasons: BracketReasons,
): SignalV2KeyEstimate {
  const { bounds, excluded } = collectBounds(episodes, measure, reasons.contradictory),
    split = splitEpisodes(
      bounds.map((entry) => entry.id),
      seed,
    ),
    estimateBounds = bounds.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationBounds = bounds.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateBounds.reduce((sum, entry) => sum + entry.samples, 0),
    totalSamples = bounds.reduce((sum, entry) => sum + entry.samples, 0);
  if (bounds.length === 0) return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
  if (estimateBounds.length < SIGNAL_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
    return unobserved(key, 'INSUFFICIENT_DISTINCT_EPISODES', bounds.length, totalSamples, excluded);
  const lowers = estimateBounds
      .map((entry) => entry.lower)
      .filter((entry): entry is number => entry !== null),
    uppers = estimateBounds
      .map((entry) => entry.upper)
      .filter((entry): entry is number => entry !== null);
  if (lowers.length === 0)
    return unobserved(key, reasons.lower, estimateBounds.length, estimateSamples, excluded);
  if (uppers.length === 0)
    return unobserved(key, reasons.upper, estimateBounds.length, estimateSamples, excluded);
  const lower = Math.max(...lowers),
    upper = Math.min(...uppers),
    tolerance = SIGNAL_V2_ESTIMATOR_LIMITS.ratioTolerance;
  if (lower > upper)
    return unobserved(key, reasons.contradictory, estimateBounds.length, estimateSamples, excluded);
  const range = catalogRange(key);
  if (upper < range.min - tolerance || lower > range.max + tolerance)
    return unobserved(key, reasons.envelope, estimateBounds.length, estimateSamples, excluded);
  const value = (lower + upper) / 2,
    uncertainty = Math.max(SIGNAL_V2_ESTIMATOR_LIMITS.uncertaintyFloor[key], (upper - lower) / 2),
    validation = bracketValidation(
      key,
      value,
      validationBounds,
      SIGNAL_V2_ESTIMATOR_LIMITS.validationTolerance[key],
    ),
    result = candidate(
      key,
      value,
      uncertainty,
      estimateBounds.length,
      estimateSamples,
      excluded,
      validation,
    );
  return typeof result === 'string'
    ? unobserved(
        key,
        result,
        estimateBounds.length,
        estimateSamples,
        excluded,
        validation,
        uncertainty,
      )
    : result;
}

/**
 * Estimates the four 173 signal keys from demonstrated episodes. The same episodes and the same
 * `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateSignalPolicyStyleV2(
  input: SignalV2EstimatorInput,
): SignalV2EstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid signal estimator input');
  const splitSeed = count(input.splitSeed, 'split seed');
  if (splitSeed > SIGNAL_V2_ESTIMATOR_LIMITS.maximumSeed) fail('Signal split seed out of range');
  if (!Array.isArray(input.episodes)) fail('Invalid signal evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: SignalV2EpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as SignalV2EvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as SignalV2EvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }
  const keys = {
    yellow_stop_probability: estimateContinuous(
      'yellow_stop_probability',
      admitted,
      splitSeed,
      yellowStopValue,
    ),
    yellow_commit_time: estimateBracket('yellow_commit_time', admitted, splitSeed, commitBounds, {
      noEpisode: 'NO_YELLOW_COMMITMENT_EPISODE',
      lower: 'COMMIT_LOWER_BOUND_UNOBSERVED',
      upper: 'COMMIT_UPPER_BOUND_UNOBSERVED',
      contradictory: 'CONTRADICTORY_COMMIT_BOUNDS',
      envelope: 'COMMIT_BOUNDS_OUT_OF_ENVELOPE',
    }),
    red_run_gap_acceptance: estimateBracket(
      'red_run_gap_acceptance',
      admitted,
      splitSeed,
      gapBounds,
      {
        noEpisode: 'NO_RED_RUN_EPISODE',
        lower: 'RED_RUN_LOWER_BOUND_UNOBSERVED',
        upper: 'RED_RUN_UPPER_BOUND_UNOBSERVED',
        contradictory: 'CONTRADICTORY_GAP_BOUNDS',
        envelope: 'RED_RUN_GAP_BOUNDS_OUT_OF_ENVELOPE',
      },
    ),
    green_launch_acceleration: estimateContinuous(
      'green_launch_acceleration',
      admitted,
      splitSeed,
      launchValue,
    ),
  } as Record<SignalV2EstimatorKey, SignalV2KeyEstimate>;
  return Object.freeze({
    version: SIGNAL_V2_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: signalV2GroupConstraints,
    admittedEpisodes: Object.freeze(admitted.map((episode) => episode.id)),
    refusedEpisodes: Object.freeze(refused.map((entry) => Object.freeze(entry))),
    compatibility: compatibility(),
  });
}
