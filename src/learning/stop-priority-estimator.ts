import {
  STOP_PRIORITY_POLICY_KEYS,
  STOP_PRIORITY_POLICY_LIMITS,
  STOP_PRIORITY_POLICY_M_KEYS,
} from '../autonomy';
import type {
  StopPriorityPolicyAction,
  StopPriorityPolicyKey,
  StopPriorityPolicyReason,
  StopPriorityStopAction,
  StopPriorityYieldAction,
} from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 176 stop/priority estimator: estimates the four 175 keys from demonstrated episodes while keeping
 * rolling stop, assertiveness, all-way patience and blocked-entry probability in separate contexts.
 *
 * The estimator inverts the delivered `175-stop-priority-policy-v1` arithmetic instead of inventing
 * a second stop model: every value is measured from facts the delivered command already reports (the
 * 175 reason, the commanded rolling speed and its cap flag, the 052 separation and the required gap,
 * the all-way arrival and the elapsed dwell, the once-per-opportunity entry draw and its outcome)
 * plus the M keys of the 051/052 results of the same tick. It is candidate-only: it never publishes
 * a profile, never writes to a store, never flips a 092 `implemented` flag and never changes the 175
 * semantics. It reads the key list, the 2.5 m/s rolling cap, the 3 s assertiveness floor and the 0.5
 * entry cap directly from 175, and the catalog ranges from the 092 registry, so measurement and
 * decision use the same constants.
 *
 * 1. `rolling_stop_speed` (m/s) — the speed 175 commands through a 051 `ROLL_THROUGH`. An uncapped
 *    command reports the key exactly; a capped command only proves `key > 2.5 m/s`, so a set with
 *    capped demonstrations keeps the key unobserved instead of reporting the cap as the preference.
 * 2. `priority_assertiveness` (ratio) — a 052 refusal with a known separation. A claim proves
 *    `key ≥ (yield_time_gap − gap) / (yield_time_gap − 3)`, a yield proves `key <` the same ratio,
 *    so the estimate is the intersection of the bounds. A `yield_time_gap` at or below the 3 s floor
 *    makes the key inert: no ratio can be measured there.
 * 3. `allway_stop_patience` (s) — a 051 release at an all-way stop where the subject is not the
 *    first arrival. A held release proves `key > sinceDwellS`, a granted release proves
 *    `key ≤ sinceDwellS`; the first arrival and an approaching/held STOP never observe the key.
 * 4. `blocked_intersection_entry_probability` (probability) — the deterministic entry draw of an
 *    opportunity without declared exit space. A grant proves `key > draw`, a denial below the 0.5
 *    cap proves `key ≤ draw`; the blocked-interior veto decides before the draw and proves nothing,
 *    and the cap hides every value above 0.5.
 */
export const STOP_PRIORITY_ESTIMATOR_VERSION = '176-stop-priority-estimator-v1' as const;
export const STOP_PRIORITY_ESTIMATOR_KEYS = STOP_PRIORITY_POLICY_KEYS;
export type StopPriorityEstimatorKey = StopPriorityPolicyKey;
export type StopPriorityEstimatorScenario =
  'ROLLING_STOP' | 'PRIORITY_CLAIM' | 'ALLWAY_PATIENCE' | 'BLOCKED_ENTRY';

export const stopPriorityEstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'NO_ROLLING_STOP_EPISODE',
  'ROLLING_STOP_STOPPED',
  'ROLLING_STOP_PREEMPTED',
  'ROLLING_STOP_SPEED_MISSING',
  'ROLLING_STOP_CAP_SATURATED',
  'ROLLING_STOP_CAP_INCONSISTENT',
  'ROLLING_STOP_OUT_OF_ENVELOPE',
  'NO_PRIORITY_EPISODE',
  'PRIORITY_NOT_REFUSED',
  'PRIORITY_PREEMPTED_BY_STOP',
  'PRIORITY_SEPARATION_UNKNOWN',
  'ASSERTIVENESS_INERT_AT_FLOOR',
  'ASSERTIVENESS_LOWER_UNINFORMATIVE',
  'ASSERTIVENESS_UPPER_UNINFORMATIVE',
  'ASSERTIVENESS_LOWER_BOUND_UNOBSERVED',
  'ASSERTIVENESS_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_ASSERTIVENESS_BOUNDS',
  'ASSERTIVENESS_OUT_OF_ENVELOPE',
  'NO_ALLWAY_EPISODE',
  'ALLWAY_FIRST_ARRIVAL',
  'ALLWAY_STOP_NOT_RELEASED',
  'ALLWAY_LOWER_BOUND_UNOBSERVED',
  'ALLWAY_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_ALLWAY_BOUNDS',
  'ALLWAY_OUT_OF_ENVELOPE',
  'NO_BLOCKED_ENTRY_EPISODE',
  'BLOCKED_INTERSECTION_VETO',
  'EXIT_SPACE_DECLARED',
  'BLOCKED_ENTRY_NOT_SAMPLED',
  'BLOCKED_ENTRY_CAP_SATURATED',
  'BLOCKED_ENTRY_LOWER_BOUND_UNOBSERVED',
  'BLOCKED_ENTRY_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_BLOCKED_ENTRY_BOUNDS',
  'BLOCKED_ENTRY_OUT_OF_ENVELOPE',
] as const;
export type StopPriorityEstimatorReason = (typeof stopPriorityEstimatorReasons)[number];

export const stopPriorityEpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type StopPriorityEpisodeRefusal = (typeof stopPriorityEpisodeRefusals)[number];

/**
 * The closed 175 reason vocabulary. The exhaustive record makes the mirror checkable by the
 * compiler: a new policy reason must be added here before it can become measurement evidence.
 */
const evidenceReasonSet: Readonly<Record<StopPriorityPolicyReason, true>> = Object.freeze({
  STOP_PRIORITY_POLICY: true,
  NO_AUTO_AUTHORITY: true,
  MISSING_PROFILE: true,
  FOREIGN_OR_STALE_OBSERVATION: true,
  FOREIGN_OR_STALE_STOP: true,
  FOREIGN_OR_STALE_YIELD: true,
  NO_POLICY_INPUT: true,
  STOP_UNAVAILABLE: true,
  STOP_PROFILE_MISMATCH: true,
  STOP_M_PROFILE_MISMATCH: true,
  YIELD_UNAVAILABLE: true,
  YIELD_PROFILE_MISMATCH: true,
  YIELD_M_PROFILE_MISMATCH: true,
  BLOCKED_INTERSECTION_VETO: true,
  EXIT_SPACE_INSUFFICIENT: true,
  STOP_REQUIRED: true,
  STOP_RELEASED: true,
  ROLLING_STOP_AT_SPEED: true,
  PRIORITY_CLAIMED: true,
  PRIORITY_YIELD: true,
  PRIORITY_GRANTED: true,
  ALLWAY_PATIENCE: true,
  ALLWAY_TURN: true,
  BLOCKED_ENTRY_ACCEPTED: true,
  BLOCKED_ENTRY_WAIT: true,
  EXIT_SPACE_CONFIRMED: true,
  NO_STOP: true,
});
export const stopPriorityEvidenceReasons: readonly StopPriorityPolicyReason[] = Object.freeze(
  Object.keys(evidenceReasonSet) as StopPriorityPolicyReason[],
);

export const STOP_PRIORITY_ESTIMATOR_LIMITS = Object.freeze({
  version: STOP_PRIORITY_ESTIMATOR_VERSION,
  idCodeUnits: STOP_PRIORITY_POLICY_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  /** Same observation envelope as 175; a fact outside it is refused, never measured. */
  maximumPosition: STOP_PRIORITY_POLICY_LIMITS.maximumPosition,
  maximumTimeS: STOP_PRIORITY_POLICY_LIMITS.maximumTimeS,
  maximumExitM: STOP_PRIORITY_POLICY_LIMITS.maximumExitM,
  /** 175 policy cap of `rolling_stop_speed`: above it the command hides the key. */
  rollingStopCapMps: STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps,
  /** 175 safety floor of `priority_assertiveness`; at or below it the key is inert. */
  priorityFloorS: STOP_PRIORITY_POLICY_LIMITS.priorityMinimumGapS,
  /** 175 policy cap of `blocked_intersection_entry_probability`: above it the draw hides the key. */
  blockedEntryCap: STOP_PRIORITY_POLICY_LIMITS.blockedEntryMaximumProbability,
  /**
   * How close the proven lower bound must get to the 0.5 cap before the demonstration can no longer
   * separate the key from values above the cap: the effective probability stops growing at 0.5, so
   * the ceiling problem starts where the remaining interval is decision-irrelevant.
   */
  blockedEntryCapResolution: 0.05,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  ratioTolerance: 1e-6,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloor: Object.freeze({
    rolling_stop_speed: 0.05,
    priority_assertiveness: 0.02,
    allway_stop_patience: 0.05,
    blocked_intersection_entry_probability: 0.02,
  }),
  maximumUncertainty: Object.freeze({
    rolling_stop_speed: 0.5,
    priority_assertiveness: 0.15,
    allway_stop_patience: 0.5,
    blocked_intersection_entry_probability: 0.15,
  }),
  validationTolerance: Object.freeze({
    rolling_stop_speed: 0.5,
    priority_assertiveness: 0.15,
    allway_stop_patience: 0.5,
    blocked_intersection_entry_probability: 0.15,
  }),
  retainedHistory: 0,
});

export const stopPriorityEligibleScenarios: Readonly<
  Record<StopPriorityEstimatorKey, StopPriorityEstimatorScenario>
> = Object.freeze({
  rolling_stop_speed: 'ROLLING_STOP',
  priority_assertiveness: 'PRIORITY_CLAIM',
  allway_stop_patience: 'ALLWAY_PATIENCE',
  blocked_intersection_entry_probability: 'BLOCKED_ENTRY',
});

export const stopPriorityEligibleContexts: Readonly<Record<StopPriorityEstimatorKey, string>> =
  Object.freeze({
    rolling_stop_speed:
      'o comandă `ROLL_THROUGH` reală a lui 051, în care 175 raportează viteza de traversare: ' +
      'o comandă neplafonată dă cheia exact, una plafonată dovedește doar `cheie > 2,5 m/s`',
    priority_assertiveness:
      'un refuz real 052 cu un separator cunoscut, în care 175 revendică sau cedează: ' +
      'revendicarea dă limita inferioară, cedarea dă limita superioară a asertivității',
    allway_stop_patience:
      'o eliberare 051 la un all-way stop unde subiectul nu este primul sosit: ținerea dă limita ' +
      'inferioară, trecerea dă limita superioară a răbdării',
    blocked_intersection_entry_probability:
      'o oportunitate de intrare fără spațiu de ieșire declarat, fără veto, în care 175 a extras ' +
      'eșantionul determinist: acceptarea dă limita inferioară, așteptarea sub plafon dă limita ' +
      'superioară',
  });

export const stopPriorityGroupConstraints = Object.freeze([
  Object.freeze({
    id: 'ROLLING_STOP_AND_STOP_INTENT_SHARED',
    keys: Object.freeze(['rolling_stop_speed'] as const),
    explanation:
      'Viteza de rolling stop există numai în scenariul în care 051 a declarat `ROLL_THROUGH`: ' +
      'rolul opririi complete este decis de cheile M `stop_full_probability` și `stop_dwell_time`, ' +
      'deci un tick cu oprire completă sau cu apropiere nu spune nimic despre viteză. Schimbarea ' +
      'probabilității M mută proporția de oportunități care ajung la cheie, fără să o estimeze.',
  }),
  Object.freeze({
    id: 'ROLLING_STOP_CAP_CEILING',
    keys: Object.freeze(['rolling_stop_speed'] as const),
    explanation:
      'Plafonul explicit al politicii, `rollingStopMaximumMps = 2,5 m/s`, face ca orice valoare ' +
      'peste el să fie invizibilă: comanda raportează 2,5 m/s cu `rollingStopCapped`, adică doar ' +
      'limita inferioară `cheie > 2,5`. Intervalul catalogului merge până la 5 m/s, dar acea zonă ' +
      'nu este identificabilă din comportament, deci cheia rămâne neobservată în loc să primească ' +
      'plafonul ca valoare.',
  }),
  Object.freeze({
    id: 'ASSERTIVENESS_AND_YIELD_GAP_SHARED',
    keys: Object.freeze(['priority_assertiveness'] as const),
    explanation:
      'Asertivitatea este identificabilă numai din refuzul 052 cu separator cunoscut: cerința ' +
      'efectivă este `yield_time_gap − asertivitate · (yield_time_gap − 3 s)`. Un `yield_time_gap` ' +
      'deja sub podeaua de 3 s lasă cheia inertă — cerința rămâne pragul M — deci acolo nu se ' +
      'măsoară nimic, iar o prioritate acordată de 052 nu este o decizie de revendicare.',
  }),
  Object.freeze({
    id: 'ALLWAY_PATIENCE_AFTER_M_DWELL',
    keys: Object.freeze(['allway_stop_patience'] as const),
    explanation:
      'Răbdarea se numără de la momentul în care propria oprire 051 (`stop_dwell_time`) a fost ' +
      'satisfăcută și numai pentru un sosit care nu este primul: primul sosit pleacă fără întârziere, ' +
      'iar o apropiere ori o ținere 051 domină cheia. Un episod fără `RELEASE` nu oferă nicio ' +
      'latură a intervalului, iar durata M a opririi deplasează momentul din care se măsoară.',
  }),
  Object.freeze({
    id: 'BLOCKED_ENTRY_VETO_SHADOWS_PROBABILITY',
    keys: Object.freeze(['blocked_intersection_entry_probability'] as const),
    explanation:
      'Vetoul de intersecție blocată este absolut și este evaluat primul: comanda rămâne `STOP` ' +
      'fără eșantion, deci un astfel de tick nu spune nimic despre probabilitate. Un spațiu de ' +
      'ieșire declarat ocolește complet eșantionul, iar plafonul de 0,5 al politicii ascunde orice ' +
      'valoare peste el — cheia rămâne neobservată, nu plafonul.',
  }),
  Object.freeze({
    id: 'STOP_PRIORITY_KEYS_FROM_ONE_APPROACH',
    keys: STOP_PRIORITY_POLICY_KEYS,
    explanation:
      'Cele patru chei pot apărea în aceeași călătorie, dar nu din același fapt: ordinea ramurilor ' +
      '175 dă fiecărui tick un singur fapt — veto, intenție 051, rolling stop, all-way, refuz 052 ' +
      'sau eșantion de intrare. Un set cu un singur tip de demonstrație lasă celelalte trei chei ' +
      'neobservate.',
  }),
]);

/** One tick of a stop/priority demonstration, exactly as the delivered 175 command reports it. */
export interface StopPriorityEvidenceSample {
  readonly tick: number;
  /** True when `evaluateStopPriorityPolicy` applied the keys, i.e. no refused input. */
  readonly policyActive: boolean;
  /** The 175 command reason of the tick. */
  readonly reason: StopPriorityPolicyReason;
  readonly action: StopPriorityPolicyAction;
  readonly atIntersection: boolean;
  readonly intersectionBlocked: boolean;
  readonly intersectionExitM: number | null;
  /** The 051 diagnostic forwarded by 175. */
  readonly stopAction: StopPriorityStopAction | null;
  readonly stopRequested: boolean;
  /** The 052 diagnostic forwarded by 175. */
  readonly yieldAction: StopPriorityYieldAction | null;
  /** The M `yield_time_gap` of the delivered 052 result; null without a 052 result. */
  readonly yieldThresholdS: number | null;
  /** `priority_assertiveness` requirement after the relief and the 3 s floor. */
  readonly requiredGapS: number | null;
  /** The separation 052 measured for the limiting relation; null when it is unknown. */
  readonly minimumGapS: number | null;
  /** One-based all-way arrival position, or null outside an all-way arrival. */
  readonly allWayPosition: number | null;
  readonly allWaySinceDwellS: number | null;
  /** Speed commanded through a 051 rolling stop, capped by the 175 policy. */
  readonly rollThroughSpeedMps: number | null;
  readonly rollingStopCapped: boolean;
  /** Effective `blocked_intersection_entry_probability` after the 0.5 cap. */
  readonly blockedEntryProbability: number | null;
  /** The single deterministic draw of the opportunity; null when no sample was taken. */
  readonly blockedEntrySample: number | null;
  readonly blockedEntryGranted: boolean | null;
}

export interface StopPriorityEvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly StopPriorityEvidenceSample[];
}

export interface StopPriorityEstimatorInput {
  readonly episodes: readonly StopPriorityEvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface StopPriorityValidation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}

export interface StopPriorityKeyEstimate {
  readonly key: StopPriorityEstimatorKey;
  readonly scenario: StopPriorityEstimatorScenario;
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
  readonly reason: StopPriorityEstimatorReason | null;
  readonly validation: StopPriorityValidation;
}

export interface StopPriorityCompatibility {
  readonly policyVersion: '175-stop-priority-policy-v1';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  /** 175 keys the estimate belongs to; the four M stop/yield keys are read, never estimated. */
  readonly mReadByPolicy: readonly string[];
  readonly rollingStopCapMps: number;
  readonly priorityFloorS: number;
  readonly blockedEntryCap: number;
  readonly catalogRanges: Readonly<
    Record<
      StopPriorityEstimatorKey,
      { readonly min: number; readonly max: number; readonly unit: string }
    >
  >;
}

export interface StopPriorityEstimatorResult {
  readonly version: typeof STOP_PRIORITY_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<StopPriorityEstimatorKey, StopPriorityKeyEstimate>>;
  readonly groupConstraints: typeof stopPriorityGroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: StopPriorityEpisodeRefusal;
  }[];
  readonly compatibility: StopPriorityCompatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly policyActive: boolean;
  readonly reason: StopPriorityPolicyReason;
  readonly action: StopPriorityPolicyAction;
  readonly atIntersection: boolean;
  readonly intersectionBlocked: boolean;
  readonly intersectionExitM: number | null;
  readonly stopAction: StopPriorityStopAction | null;
  readonly stopRequested: boolean;
  readonly yieldAction: StopPriorityYieldAction | null;
  readonly yieldThresholdS: number | null;
  readonly requiredGapS: number | null;
  readonly minimumGapS: number | null;
  readonly allWayPosition: number | null;
  readonly allWaySinceDwellS: number | null;
  readonly rollThroughSpeedMps: number | null;
  readonly rollingStopCapped: boolean;
  readonly blockedEntryProbability: number | null;
  readonly blockedEntrySample: number | null;
  readonly blockedEntryGranted: boolean | null;
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

interface Bracket {
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
    value.length > STOP_PRIORITY_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid stop/priority evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid stop/priority evidence ${field}`);
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
  return fail(`Invalid stop/priority evidence ${field}`);
}
function optionalChoice<T extends string>(
  value: unknown,
  choices: readonly T[],
  field: string,
): T | null {
  if (value === null) return null;
  const found = choices.find((entry) => entry === value);
  return found ?? fail(`Invalid stop/priority evidence ${field}`);
}
function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`Invalid stop/priority evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
const stopActions = ['NO_STOP', 'APPROACH', 'HOLD', 'RELEASE', 'ROLL_THROUGH', 'UNKNOWN'] as const;
const yieldActions = ['ACCEPT', 'REFUSE', 'UNKNOWN'] as const;
const policyActions = ['PROCEED', 'ROLL_THROUGH', 'STOP', 'UNKNOWN'] as const;
function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid stop/priority evidence sample');
  const sample = value as StopPriorityEvidenceSample,
    tick = count(sample.tick, 'sample tick'),
    action =
      policyActions.find((entry) => entry === sample.action) ?? fail('Invalid sample action');
  for (const field of ['policyActive', 'atIntersection', 'intersectionBlocked'] as const)
    if (typeof sample[field] !== 'boolean') fail(`Invalid stop/priority evidence sample ${field}`);
  for (const field of ['stopRequested', 'rollingStopCapped'] as const)
    if (typeof sample[field] !== 'boolean') fail(`Invalid stop/priority evidence sample ${field}`);
  if (!(stopPriorityEvidenceReasons as readonly string[]).includes(sample.reason))
    fail('Invalid stop/priority evidence sample reason');
  const allWayPosition =
    sample.allWayPosition === null ? null : count(sample.allWayPosition, 'sample all-way position');
  if (
    allWayPosition !== null &&
    (allWayPosition < 1 || allWayPosition > STOP_PRIORITY_ESTIMATOR_LIMITS.maximumPosition)
  )
    fail('Invalid stop/priority evidence all-way position');
  return Object.freeze({
    tick,
    policyActive: sample.policyActive,
    reason: sample.reason,
    action,
    atIntersection: sample.atIntersection,
    intersectionBlocked: sample.intersectionBlocked,
    intersectionExitM: optionalFinite(
      sample.intersectionExitM,
      0,
      STOP_PRIORITY_ESTIMATOR_LIMITS.maximumExitM,
      'sample exit space',
    ),
    stopAction: optionalChoice(sample.stopAction, stopActions, 'sample stop action'),
    stopRequested: sample.stopRequested,
    yieldAction: optionalChoice(sample.yieldAction, yieldActions, 'sample yield action'),
    yieldThresholdS: optionalFinite(
      sample.yieldThresholdS,
      yieldGapRange().min,
      yieldGapRange().max,
      'sample yield threshold',
    ),
    requiredGapS: optionalFinite(
      sample.requiredGapS,
      0,
      STOP_PRIORITY_ESTIMATOR_LIMITS.maximumTimeS,
      'sample required gap',
    ),
    minimumGapS: optionalFinite(
      sample.minimumGapS,
      0,
      STOP_PRIORITY_ESTIMATOR_LIMITS.maximumTimeS,
      'sample observed separation',
    ),
    allWayPosition,
    allWaySinceDwellS: optionalFinite(
      sample.allWaySinceDwellS,
      0,
      STOP_PRIORITY_ESTIMATOR_LIMITS.maximumTimeS,
      'sample all-way dwell',
    ),
    rollThroughSpeedMps: optionalFinite(sample.rollThroughSpeedMps, 0, 100, 'sample rolling speed'),
    rollingStopCapped: sample.rollingStopCapped,
    blockedEntryProbability: optionalRatio(
      sample.blockedEntryProbability,
      'sample entry probability',
    ),
    blockedEntrySample: optionalRatio(sample.blockedEntrySample, 'sample entry draw'),
    blockedEntryGranted: optionalBoolean(sample.blockedEntryGranted, 'sample entry decision'),
  });
}
function admitEpisode(value: unknown): AdmittedEpisode | StopPriorityEpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid stop/priority evidence episode');
  const episode = value as StopPriorityEvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object')
    fail('Invalid stop/priority evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid stop/priority evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid stop/priority evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched stop/priority evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick)
      fail('Stop/priority evidence samples are not strictly ordered');
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
function catalogRange(key: StopPriorityEstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
/** The M `yield_time_gap` envelope of the 092 catalog; the 052 threshold is read, not estimated. */
function yieldGapRange() {
  const definition = getParameterDefinition('yield_time_gap');
  return Object.freeze({ min: definition.min, max: definition.max });
}
function compatibility(): StopPriorityCompatibility {
  return Object.freeze({
    policyVersion: STOP_PRIORITY_POLICY_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    mReadByPolicy: Object.freeze([...STOP_PRIORITY_POLICY_M_KEYS]),
    rollingStopCapMps: STOP_PRIORITY_ESTIMATOR_LIMITS.rollingStopCapMps,
    priorityFloorS: STOP_PRIORITY_ESTIMATOR_LIMITS.priorityFloorS,
    blockedEntryCap: STOP_PRIORITY_ESTIMATOR_LIMITS.blockedEntryCap,
    catalogRanges: Object.freeze(
      Object.fromEntries(
        STOP_PRIORITY_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)]),
      ) as Record<StopPriorityEstimatorKey, { min: number; max: number; unit: string }>,
    ),
  });
}
function emptyValidation(key: StopPriorityEstimatorKey): StopPriorityValidation {
  return Object.freeze({
    status: 'NO_DATA',
    episodes: 0,
    value: null,
    error: null,
    tolerance: STOP_PRIORITY_ESTIMATOR_LIMITS.validationTolerance[key],
    detail: 'no independent demonstration episodes',
  });
}
function unobserved(
  key: StopPriorityEstimatorKey,
  reason: StopPriorityEstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: StopPriorityValidation = emptyValidation(key),
  uncertainty: number | null = null,
): StopPriorityKeyEstimate {
  return Object.freeze({
    key,
    scenario: stopPriorityEligibleScenarios[key],
    unit: getParameterDefinition(key).unit,
    eligibleContext: stopPriorityEligibleContexts[key],
    status: 'UNOBSERVED',
    value: null,
    rawValue: null,
    clamped: false,
    uncertainty,
    uncertaintyThreshold: STOP_PRIORITY_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason,
    validation,
  });
}
function candidate(
  key: StopPriorityEstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: StopPriorityValidation,
): StopPriorityKeyEstimate | StopPriorityEstimatorReason {
  if (uncertainty > STOP_PRIORITY_ESTIMATOR_LIMITS.maximumUncertainty[key])
    return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    scenario: stopPriorityEligibleScenarios[key],
    unit: range.unit,
    eligibleContext: stopPriorityEligibleContexts[key],
    status: 'CANDIDATE',
    value,
    rawValue,
    clamped: value !== rawValue,
    uncertainty,
    uncertaintyThreshold: STOP_PRIORITY_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason: null,
    validation,
  });
}
function continuousValidation(
  key: StopPriorityEstimatorKey,
  estimate: number,
  values: readonly number[],
): StopPriorityValidation {
  const tolerance = STOP_PRIORITY_ESTIMATOR_LIMITS.validationTolerance[key];
  if (values.length < STOP_PRIORITY_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: values.length,
      value: values.length === 0 ? null : median(values),
      error: values.length === 0 ? null : Math.abs(median(values) - estimate),
      tolerance,
      detail: `validation set has ${values.length} of the required ${STOP_PRIORITY_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
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
  key: StopPriorityEstimatorKey,
  estimate: number,
  bounds: readonly EpisodeBounds[],
  tolerance: number,
): StopPriorityValidation {
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
  if (bounds.length < STOP_PRIORITY_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: bounds.length,
      value,
      error: value === null ? null : Math.abs(value - estimate),
      tolerance,
      detail: `validation set has ${bounds.length} of the required ${STOP_PRIORITY_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
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
function uncertaintyOf(key: StopPriorityEstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    STOP_PRIORITY_ESTIMATOR_LIMITS.uncertaintyFloor[key],
    (STOP_PRIORITY_ESTIMATOR_LIMITS.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}
interface RollingMeasure {
  readonly value: number | null;
  readonly samples: number;
  /** True when at least one sample of the episode carried the policy cap. */
  readonly capped: boolean;
}
/**
 * Rolling stop speed of the delivered 175 rolling branch. An uncapped command reports the key
 * exactly; a capped command only proves `key > 2.5 m/s` and is counted, never averaged into the
 * preference. A stop or an approach of 051 is not a rolling stop and measures nothing.
 */
function rollingStopValue(
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): RollingMeasure | null {
  const range = catalogRange('rolling_stop_speed'),
    cap = STOP_PRIORITY_ESTIMATOR_LIMITS.rollingStopCapMps,
    tolerance = STOP_PRIORITY_ESTIMATOR_LIMITS.ratioTolerance,
    values: number[] = [];
  let issue: StopPriorityEstimatorReason | null = null,
    capped = false;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (sample.reason === 'ROLLING_STOP_AT_SPEED') {
      if (sample.rollThroughSpeedMps === null) {
        issue ??= 'ROLLING_STOP_SPEED_MISSING';
        continue;
      }
      if (sample.rollingStopCapped) {
        capped = true;
        continue;
      }
      if (
        sample.rollThroughSpeedMps < range.min - tolerance ||
        sample.rollThroughSpeedMps > cap + tolerance
      ) {
        issue ??= 'ROLLING_STOP_OUT_OF_ENVELOPE';
        continue;
      }
      values.push(Math.max(range.min, Math.min(cap, sample.rollThroughSpeedMps)));
      continue;
    }
    if (sample.stopAction === 'ROLL_THROUGH') {
      issue ??= 'ROLLING_STOP_PREEMPTED';
      continue;
    }
    if (sample.stopAction === 'APPROACH' || sample.stopAction === 'HOLD')
      issue ??= 'ROLLING_STOP_STOPPED';
  }
  if (values.length === 0) {
    if (capped) return { value: null, samples: 0, capped: true };
    increment(excluded, issue ?? 'NO_ROLLING_STOP_EPISODE');
    return null;
  }
  return { value: median(values), samples: values.length, capped };
}
/**
 * Assertiveness bounds of the delivered 175 refusal branch. A claim proves the key is at least
 * `(M − gap) / (M − 3 s)`, a yield proves it is below it. At or below the 3 s floor the span is zero
 * and the key is inert, so nothing is measured there.
 */
function assertivenessBounds(
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Bracket | null {
  const floorS = STOP_PRIORITY_ESTIMATOR_LIMITS.priorityFloorS,
    tolerance = STOP_PRIORITY_ESTIMATOR_LIMITS.ratioTolerance;
  let lower: number | null = null,
    upper: number | null = null,
    samples = 0,
    issue: StopPriorityEstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (sample.yieldAction !== 'REFUSE') {
      if (sample.stopRequested) issue ??= 'PRIORITY_PREEMPTED_BY_STOP';
      else if (sample.yieldAction === 'ACCEPT') issue ??= 'PRIORITY_NOT_REFUSED';
      continue;
    }
    if (sample.reason !== 'PRIORITY_CLAIMED' && sample.reason !== 'PRIORITY_YIELD') {
      issue ??= 'PRIORITY_PREEMPTED_BY_STOP';
      continue;
    }
    if (sample.yieldThresholdS === null || sample.minimumGapS === null) {
      issue ??= 'PRIORITY_SEPARATION_UNKNOWN';
      continue;
    }
    const span = sample.yieldThresholdS - Math.min(sample.yieldThresholdS, floorS);
    if (span <= tolerance) {
      issue ??= 'ASSERTIVENESS_INERT_AT_FLOOR';
      continue;
    }
    const ratio = (sample.yieldThresholdS - sample.minimumGapS) / span,
      value = Math.max(0, Math.min(1, ratio));
    if (sample.reason === 'PRIORITY_CLAIMED') {
      // A claim at or above the M threshold would also be explained by assertiveness 0.
      if (value <= tolerance) {
        issue ??= 'ASSERTIVENESS_LOWER_UNINFORMATIVE';
        continue;
      }
      lower = lower === null ? value : Math.max(lower, value);
      samples += 1;
      continue;
    }
    // A yield at or below the 3 s floor would also be explained by assertiveness 1.
    if (value >= 1 - tolerance) {
      issue ??= 'ASSERTIVENESS_UPPER_UNINFORMATIVE';
      continue;
    }
    upper = upper === null ? value : Math.min(upper, value);
    samples += 1;
  }
  if (samples === 0) {
    increment(excluded, issue ?? 'NO_PRIORITY_EPISODE');
    return null;
  }
  return { lower, upper, samples };
}
/**
 * All-way patience bounds of the delivered 175 all-way branch. A held release proves
 * `key > sinceDwellS`, a granted release proves `key ≤ sinceDwellS`. The first arrival is never
 * delayed and a 051 approach/hold never reaches the branch, so neither observes the key.
 */
function allwayBounds(episode: AdmittedEpisode, excluded: Map<string, number>): Bracket | null {
  let lower: number | null = null,
    upper: number | null = null,
    samples = 0,
    issue: StopPriorityEstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (sample.allWayPosition === null) continue;
    if (sample.allWayPosition === 1) {
      if (sample.stopAction === 'RELEASE') issue ??= 'ALLWAY_FIRST_ARRIVAL';
      continue;
    }
    if (sample.reason === 'ALLWAY_PATIENCE' || sample.reason === 'ALLWAY_TURN') {
      if (sample.allWaySinceDwellS === null) {
        issue ??= 'ALLWAY_STOP_NOT_RELEASED';
        continue;
      }
      if (sample.reason === 'ALLWAY_PATIENCE')
        lower =
          lower === null ? sample.allWaySinceDwellS : Math.max(lower, sample.allWaySinceDwellS);
      else
        upper =
          upper === null ? sample.allWaySinceDwellS : Math.min(upper, sample.allWaySinceDwellS);
      samples += 1;
      continue;
    }
    if (
      sample.stopAction === 'APPROACH' ||
      sample.stopAction === 'HOLD' ||
      sample.stopAction === 'ROLL_THROUGH' ||
      sample.stopRequested
    )
      issue ??= 'ALLWAY_STOP_NOT_RELEASED';
  }
  if (samples === 0) {
    increment(excluded, issue ?? 'NO_ALLWAY_EPISODE');
    return null;
  }
  return { lower, upper, samples };
}
/**
 * Blocked-entry bounds of the delivered 175 sample. The entry is granted when the deterministic
 * draw is below the effective key, so a grant proves `key > draw` and a denial proves `key ≤ draw`.
 * A denial at or above the 0.5 cap proves nothing (the cap would deny any key) and the veto decides
 * before the draw, so neither is evidence of the probability.
 */
function blockedEntryBounds(
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Bracket | null {
  const cap = STOP_PRIORITY_ESTIMATOR_LIMITS.blockedEntryCap,
    tolerance = STOP_PRIORITY_ESTIMATOR_LIMITS.ratioTolerance;
  let lower: number | null = null,
    upper: number | null = null,
    samples = 0,
    issue: StopPriorityEstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (sample.reason === 'BLOCKED_INTERSECTION_VETO') {
      issue ??= 'BLOCKED_INTERSECTION_VETO';
      continue;
    }
    if (sample.reason === 'EXIT_SPACE_INSUFFICIENT' || sample.reason === 'EXIT_SPACE_CONFIRMED') {
      issue ??= 'EXIT_SPACE_DECLARED';
      continue;
    }
    if (sample.reason !== 'BLOCKED_ENTRY_ACCEPTED' && sample.reason !== 'BLOCKED_ENTRY_WAIT') {
      if (sample.stopRequested) issue ??= 'BLOCKED_ENTRY_NOT_SAMPLED';
      continue;
    }
    if (sample.blockedEntrySample === null || sample.blockedEntryGranted === null) {
      issue ??= 'BLOCKED_ENTRY_NOT_SAMPLED';
      continue;
    }
    const draw = sample.blockedEntrySample;
    if (sample.blockedEntryGranted) {
      lower = lower === null ? draw : Math.max(lower, draw);
      samples += 1;
      continue;
    }
    if (draw >= cap - tolerance) {
      issue ??= 'BLOCKED_ENTRY_CAP_SATURATED';
      continue;
    }
    upper = upper === null ? draw : Math.min(upper, draw);
    samples += 1;
  }
  if (samples === 0) {
    increment(excluded, issue ?? 'NO_BLOCKED_ENTRY_EPISODE');
    return null;
  }
  return { lower, upper, samples };
}
function frozen<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}
function finishContinuous(
  key: StopPriorityEstimatorKey,
  values: readonly EpisodeValue[],
  excluded: Map<string, number>,
  seed: number,
): StopPriorityKeyEstimate {
  if (values.length === 0) return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
  const split = splitEpisodes(
      values.map((entry) => entry.id),
      seed,
    ),
    estimateValues = values.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationValues = values.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateValues.reduce((sum, entry) => sum + entry.samples, 0),
    totalSamples = values.reduce((sum, entry) => sum + entry.samples, 0);
  if (estimateValues.length < STOP_PRIORITY_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
    return unobserved(key, 'INSUFFICIENT_DISTINCT_EPISODES', values.length, totalSamples, excluded);
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
 * Rolling stop estimate: only uncapped commands report the key. A set that also contains capped
 * commands cannot come from a single key — one demonstration says `≤ 2,5 m/s`, the other `> 2,5 m/s`
 * — so the key stays unobserved instead of picking one side.
 */
function estimateRollingStop(
  episodes: readonly AdmittedEpisode[],
  seed: number,
): StopPriorityKeyEstimate {
  const excluded = new Map<string, number>(),
    values: EpisodeValue[] = [];
  let cappedEpisodes = 0;
  for (const episode of episodes) {
    const measured = rollingStopValue(episode, excluded);
    if (measured === null) continue;
    if (measured.capped) {
      cappedEpisodes += 1;
      if (measured.value !== null) {
        values.push({ id: episode.id, value: measured.value, samples: measured.samples });
      }
      continue;
    }
    if (measured.value === null) continue;
    values.push({ id: episode.id, value: measured.value, samples: measured.samples });
  }
  if (cappedEpisodes === 0) return finishContinuous('rolling_stop_speed', values, excluded, seed);
  const exactSamples = values.reduce((sum, entry) => sum + entry.samples, 0);
  if (values.length === 0) {
    excluded.set('ROLLING_STOP_CAP_SATURATED', cappedEpisodes);
    return unobserved(
      'rolling_stop_speed',
      'ROLLING_STOP_CAP_SATURATED',
      cappedEpisodes,
      exactSamples,
      excluded,
    );
  }
  increment(excluded, 'ROLLING_STOP_CAP_INCONSISTENT');
  return unobserved(
    'rolling_stop_speed',
    'ROLLING_STOP_CAP_INCONSISTENT',
    values.length + cappedEpisodes,
    exactSamples,
    excluded,
  );
}

interface BracketReasons {
  readonly noEpisode: StopPriorityEstimatorReason;
  readonly lower: StopPriorityEstimatorReason;
  readonly upper: StopPriorityEstimatorReason;
  readonly contradictory: StopPriorityEstimatorReason;
  readonly envelope: StopPriorityEstimatorReason;
  /** An explicit policy cap that hides every value above `bound`. */
  readonly saturation?: { readonly bound: number; readonly reason: StopPriorityEstimatorReason };
}
/**
 * Shared bracket estimate: the estimate is the middle of the intersection of the demonstrated
 * bounds and the uncertainty is half its width. A single side is a bound, not a value, unless the
 * bound reaches the catalog floor — a release/denial at zero is then a demonstrated zero.
 */
function estimateBracket(
  key: StopPriorityEstimatorKey,
  episodes: readonly AdmittedEpisode[],
  seed: number,
  measure: (episode: AdmittedEpisode, excluded: Map<string, number>) => Bracket | null,
  reasons: BracketReasons,
): StopPriorityKeyEstimate {
  const tolerance = STOP_PRIORITY_ESTIMATOR_LIMITS.ratioTolerance,
    excluded = new Map<string, number>(),
    bounds: EpisodeBounds[] = [];
  for (const episode of episodes) {
    const measured = measure(episode, excluded);
    if (measured === null) continue;
    if (
      measured.lower !== null &&
      measured.upper !== null &&
      measured.lower > measured.upper + tolerance
    ) {
      increment(excluded, reasons.contradictory);
      continue;
    }
    bounds.push({
      id: episode.id,
      lower: measured.lower,
      upper: measured.upper,
      samples: measured.samples,
    });
  }
  if (bounds.length === 0) return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
  const split = splitEpisodes(
      bounds.map((entry) => entry.id),
      seed,
    ),
    estimateBounds = bounds.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationBounds = bounds.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateBounds.reduce((sum, entry) => sum + entry.samples, 0),
    totalSamples = bounds.reduce((sum, entry) => sum + entry.samples, 0);
  if (estimateBounds.length < STOP_PRIORITY_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
    return unobserved(key, 'INSUFFICIENT_DISTINCT_EPISODES', bounds.length, totalSamples, excluded);
  const range = catalogRange(key),
    lowers = estimateBounds
      .map((entry) => entry.lower)
      .filter((entry): entry is number => entry !== null),
    uppers = estimateBounds
      .map((entry) => entry.upper)
      .filter((entry): entry is number => entry !== null),
    validation = (value: number) =>
      bracketValidation(
        key,
        value,
        validationBounds,
        STOP_PRIORITY_ESTIMATOR_LIMITS.validationTolerance[key],
      );
  let rawValue: number;
  if (lowers.length === 0) {
    if (uppers.length === 0)
      return unobserved(key, reasons.noEpisode, estimateBounds.length, estimateSamples, excluded);
    const upper = Math.min(...uppers);
    if (upper > range.min + tolerance)
      return unobserved(key, reasons.lower, estimateBounds.length, estimateSamples, excluded);
    // A bound at the catalog floor with no lower bound pins the value at the floor.
    rawValue = range.min;
  } else if (uppers.length === 0) {
    const lower = Math.max(...lowers);
    if (reasons.saturation && lower >= reasons.saturation.bound - tolerance)
      return unobserved(
        key,
        reasons.saturation.reason,
        estimateBounds.length,
        estimateSamples,
        excluded,
      );
    return unobserved(key, reasons.upper, estimateBounds.length, estimateSamples, excluded);
  } else {
    const lower = Math.max(...lowers),
      upper = Math.min(...uppers);
    if (lower > upper + tolerance)
      return unobserved(
        key,
        reasons.contradictory,
        estimateBounds.length,
        estimateSamples,
        excluded,
      );
    if (upper < range.min - tolerance || lower > range.max + tolerance)
      return unobserved(key, reasons.envelope, estimateBounds.length, estimateSamples, excluded);
    rawValue = (lower + upper) / 2;
  }
  const width =
      lowers.length === 0 || uppers.length === 0 ? 0 : Math.min(...uppers) - Math.max(...lowers),
    uncertainty = Math.max(
      STOP_PRIORITY_ESTIMATOR_LIMITS.uncertaintyFloor[key],
      width === 0 ? 0 : width / 2,
    ),
    measured = validation(rawValue),
    result = candidate(
      key,
      rawValue,
      uncertainty,
      estimateBounds.length,
      estimateSamples,
      excluded,
      measured,
    );
  return typeof result === 'string'
    ? unobserved(
        key,
        result,
        estimateBounds.length,
        estimateSamples,
        excluded,
        measured,
        uncertainty,
      )
    : result;
}
/** Closed precedence: the reason names the most specific unusable fact of the set. */
const noValueReason: Readonly<
  Record<StopPriorityEstimatorKey, readonly StopPriorityEstimatorReason[]>
> = Object.freeze({
  rolling_stop_speed: [
    'ROLLING_STOP_CAP_INCONSISTENT',
    'ROLLING_STOP_CAP_SATURATED',
    'ROLLING_STOP_OUT_OF_ENVELOPE',
    'ROLLING_STOP_SPEED_MISSING',
    'ROLLING_STOP_PREEMPTED',
    'ROLLING_STOP_STOPPED',
    'NO_ROLLING_STOP_EPISODE',
  ],
  priority_assertiveness: [
    'CONTRADICTORY_ASSERTIVENESS_BOUNDS',
    'ASSERTIVENESS_OUT_OF_ENVELOPE',
    'ASSERTIVENESS_INERT_AT_FLOOR',
    'ASSERTIVENESS_LOWER_UNINFORMATIVE',
    'ASSERTIVENESS_UPPER_UNINFORMATIVE',
    'ASSERTIVENESS_LOWER_BOUND_UNOBSERVED',
    'ASSERTIVENESS_UPPER_BOUND_UNOBSERVED',
    'PRIORITY_SEPARATION_UNKNOWN',
    'PRIORITY_PREEMPTED_BY_STOP',
    'PRIORITY_NOT_REFUSED',
    'NO_PRIORITY_EPISODE',
  ],
  allway_stop_patience: [
    'CONTRADICTORY_ALLWAY_BOUNDS',
    'ALLWAY_OUT_OF_ENVELOPE',
    'ALLWAY_FIRST_ARRIVAL',
    'ALLWAY_STOP_NOT_RELEASED',
    'ALLWAY_LOWER_BOUND_UNOBSERVED',
    'ALLWAY_UPPER_BOUND_UNOBSERVED',
    'NO_ALLWAY_EPISODE',
  ],
  blocked_intersection_entry_probability: [
    'CONTRADICTORY_BLOCKED_ENTRY_BOUNDS',
    'BLOCKED_ENTRY_OUT_OF_ENVELOPE',
    'BLOCKED_ENTRY_CAP_SATURATED',
    'BLOCKED_ENTRY_LOWER_BOUND_UNOBSERVED',
    'BLOCKED_ENTRY_UPPER_BOUND_UNOBSERVED',
    'BLOCKED_INTERSECTION_VETO',
    'EXIT_SPACE_DECLARED',
    'BLOCKED_ENTRY_NOT_SAMPLED',
    'NO_BLOCKED_ENTRY_EPISODE',
  ],
});
function reasonFor(
  key: StopPriorityEstimatorKey,
  excluded: ReadonlyMap<string, number>,
): StopPriorityEstimatorReason {
  return (
    noValueReason[key].find((reason) => excluded.has(reason)) ??
    ('NO_ELIGIBLE_EPISODES' as StopPriorityEstimatorReason)
  );
}

/**
 * Estimates the four 175 stop/priority keys from demonstrated episodes. The same episodes and the
 * same `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateStopPriorityStyle(
  input: StopPriorityEstimatorInput,
): StopPriorityEstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid stop/priority estimator input');
  const splitSeed = count(input.splitSeed, 'split seed');
  if (splitSeed > STOP_PRIORITY_ESTIMATOR_LIMITS.maximumSeed)
    fail('Stop/priority split seed out of range');
  if (!Array.isArray(input.episodes)) fail('Invalid stop/priority evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: StopPriorityEpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as StopPriorityEvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as StopPriorityEvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }
  const keys = {
    rolling_stop_speed: estimateRollingStop(admitted, splitSeed),
    priority_assertiveness: estimateBracket(
      'priority_assertiveness',
      admitted,
      splitSeed,
      assertivenessBounds,
      {
        noEpisode: 'NO_PRIORITY_EPISODE',
        lower: 'ASSERTIVENESS_LOWER_BOUND_UNOBSERVED',
        upper: 'ASSERTIVENESS_UPPER_BOUND_UNOBSERVED',
        contradictory: 'CONTRADICTORY_ASSERTIVENESS_BOUNDS',
        envelope: 'ASSERTIVENESS_OUT_OF_ENVELOPE',
      },
    ),
    allway_stop_patience: estimateBracket(
      'allway_stop_patience',
      admitted,
      splitSeed,
      allwayBounds,
      {
        noEpisode: 'NO_ALLWAY_EPISODE',
        lower: 'ALLWAY_LOWER_BOUND_UNOBSERVED',
        upper: 'ALLWAY_UPPER_BOUND_UNOBSERVED',
        contradictory: 'CONTRADICTORY_ALLWAY_BOUNDS',
        envelope: 'ALLWAY_OUT_OF_ENVELOPE',
      },
    ),
    blocked_intersection_entry_probability: estimateBracket(
      'blocked_intersection_entry_probability',
      admitted,
      splitSeed,
      blockedEntryBounds,
      {
        noEpisode: 'NO_BLOCKED_ENTRY_EPISODE',
        lower: 'BLOCKED_ENTRY_LOWER_BOUND_UNOBSERVED',
        upper: 'BLOCKED_ENTRY_UPPER_BOUND_UNOBSERVED',
        contradictory: 'CONTRADICTORY_BLOCKED_ENTRY_BOUNDS',
        envelope: 'BLOCKED_ENTRY_OUT_OF_ENVELOPE',
        saturation: {
          bound:
            STOP_PRIORITY_ESTIMATOR_LIMITS.blockedEntryCap -
            STOP_PRIORITY_ESTIMATOR_LIMITS.blockedEntryCapResolution,
          reason: 'BLOCKED_ENTRY_CAP_SATURATED',
        },
      },
    ),
  } as Record<StopPriorityEstimatorKey, StopPriorityKeyEstimate>;
  return Object.freeze({
    version: STOP_PRIORITY_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: stopPriorityGroupConstraints,
    admittedEpisodes: frozen(admitted.map((episode) => episode.id)),
    refusedEpisodes: frozen(refused.map((entry) => Object.freeze(entry))),
    compatibility: compatibility(),
  });
}
