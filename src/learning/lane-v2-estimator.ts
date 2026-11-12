import { LANE_POLICY_V2_KEYS, LANE_POLICY_V2_LIMITS, LANE_POLICY_V2_M_KEYS } from '../autonomy';
import type { LanePolicyV2Action, LanePolicyV2Key, LanePolicyV2Reason } from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 178 lane estimator: estimates the four 177 keys from demonstrated manoeuvres while keeping the
 * manoeuvre duration, the signalling lead, the indicator use and the right-side pass in separate
 * contexts.
 *
 * The estimator inverts the delivered `177-lane-policy-v2` arithmetic instead of inventing a second
 * lane model: every value is measured from facts the delivered command already reports (the 177
 * reason, the effective duration and the observed lateral progress, the indicator latch and the
 * manoeuvre start tick, the once-per-opportunity indicator sample outcome, the once-per-opportunity
 * right-pass draw and its outcome) plus the M keys of the 053 result of the same tick. It is
 * candidate-only: it never publishes a profile, never writes to a store, never flips a 092
 * `implemented` flag and never changes the 177 semantics. It reads the key list, the 60 Hz tick
 * rate and the explicit one-second manoeuvre floor directly from 177, and the catalog ranges from
 * the 092 registry, so measurement and decision use the same constants.
 *
 * 1. `lane_change_duration` (s) — the lateral progress observed inside a manoeuvre. 177 advances
 *    `elapsed / ceil(max(key, 1 s) · 60)`, so a sample measures the effective ticks `D` and inverts
 *    the ceiling: `key ∈ ((D − 1)/60, D/60]`. The reported value is the midpoint of that interval.
 *    The explicit one-second floor makes `D = 60` ambiguous — every key in 0.5–1 s produces it — so
 *    a set of floor manoeuvres is `DURATION_FLOOR_SATURATED`, never a duration of 1 s.
 * 2. `signal_lead_time` (s) — the ticks between the indicator switch-on and the first lateral
 *    movement of a signalled manoeuvre: `L = manoeuvreStartTick − signalStartTick`, inverted as
 *    `key ∈ ((L − 1)/60, L/60]` with `L = 0` meaning exactly `0 s`. Without the indicator there is
 *    no lead at all, so an unsignalled manoeuvre never observes the key.
 * 3. `signal_use_probability` (probability) — the outcome of the once-per-opportunity indicator
 *    sample: the denominator is the number of distinct opportunities that reached the indicator
 *    decision, never the number of frames, and the numerator is the opportunities whose indicator
 *    was actually switched on. A demonstrated zero (no indicator over enough opportunities) is a
 *    candidate with the value `0`, not missing evidence.
 * 4. `pass_on_right_probability` (probability) — the once-per-opportunity right-pass draw. A grant
 *    proves `key > draw`, a refusal proves `key ≤ draw`, so the estimate is the intersection of the
 *    demonstrated bounds. The world's safety declaration precedes the draw: a forbidden pass, an
 *    `UNKNOWN` permission or an insufficient declared space refuses the manoeuvre before any sample
 *    and therefore says nothing about the probability.
 */
export const LANE_V2_ESTIMATOR_VERSION = '178-lane-estimator-v2' as const;
export const LANE_V2_ESTIMATOR_KEYS = LANE_POLICY_V2_KEYS;
export type LaneV2EstimatorKey = LanePolicyV2Key;
export type LaneV2EstimatorScenario =
  'MANOEUVRE_DURATION' | 'SIGNAL_LEAD' | 'INDICATOR_USE' | 'RIGHT_SIDE_PASS';

export const laneV2EstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'NO_MANOEUVRE_DURATION_EPISODE',
  'MANOEUVRE_PROGRESS_MISSING',
  'MANOEUVRE_PROGRESS_MISMATCH',
  'MANOEUVRE_CENSORED',
  'DURATION_BELOW_FLOOR',
  'DURATION_FLOOR_SATURATED',
  'DURATION_FLOOR_INCONSISTENT',
  'DURATION_OUT_OF_ENVELOPE',
  'NO_SIGNALLED_MANOEUVRE',
  'SIGNAL_LEAD_WITHOUT_INDICATOR',
  'SIGNAL_LEAD_CENSORED',
  'SIGNAL_LEAD_INCONSISTENT',
  'SIGNAL_LEAD_OUT_OF_ENVELOPE',
  'NO_INDICATOR_OPPORTUNITY',
  'INDICATOR_TRIALS_BELOW_MINIMUM',
  'INDICATOR_USE_INCONSISTENT',
  'NO_RIGHT_PASS_OPPORTUNITY',
  'RIGHT_PASS_PRECONDITION',
  'RIGHT_PASS_SAMPLE_MISSING',
  'RIGHT_PASS_SAMPLE_INCONSISTENT',
  'RIGHT_PASS_LOWER_BOUND_UNOBSERVED',
  'RIGHT_PASS_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_RIGHT_PASS_BOUNDS',
  'RIGHT_PASS_OUT_OF_ENVELOPE',
] as const;
export type LaneV2EstimatorReason = (typeof laneV2EstimatorReasons)[number];

export const laneV2EpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type LaneV2EpisodeRefusal = (typeof laneV2EpisodeRefusals)[number];

/**
 * The closed 177 reason vocabulary. The exhaustive record makes the mirror checkable by the
 * compiler: a new policy reason must be added here before it can become measurement evidence.
 */
const evidenceReasonSet: Readonly<Record<LanePolicyV2Reason, true>> = Object.freeze({
  LANE_POLICY_V2: true,
  NO_AUTO_AUTHORITY: true,
  MISSING_PROFILE: true,
  FOREIGN_OR_STALE_OBSERVATION: true,
  FOREIGN_OR_STALE_LANE_CHANGE: true,
  LANE_CHANGE_UNAVAILABLE: true,
  LANE_CHANGE_PROFILE_MISMATCH: true,
  LANE_CHANGE_M_PROFILE_MISMATCH: true,
  NO_LANE_CHANGE: true,
  TARGET_LANE_NOT_ADJACENT: true,
  TARGET_LANE_MISMATCH: true,
  RIGHT_OVERTAKE_FORBIDDEN: true,
  RIGHT_OVERTAKE_NO_SPACE: true,
  RIGHT_OVERTAKE_REFUSED: true,
  CHANGE_WITHOUT_SIGNAL: true,
  SIGNAL_IMMEDIATE: true,
  SIGNAL_LEAD: true,
  SIGNAL_LEAD_STALE: true,
  SIGNAL_LEAD_COMPLETE: true,
  SIGNAL_CANCELLED: true,
  MANOEUVRE_IN_PROGRESS: true,
  MANOEUVRE_COMPLETE: true,
  MANOEUVRE_ABANDONED: true,
});
export const laneV2EvidenceReasons: readonly LanePolicyV2Reason[] = Object.freeze(
  Object.keys(evidenceReasonSet) as LanePolicyV2Reason[],
);

/** The 177 reasons that mean the layer never applied the keys, i.e. no demonstration at all. */
const admissionRefusals: ReadonlySet<LanePolicyV2Reason> = new Set<LanePolicyV2Reason>([
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'FOREIGN_OR_STALE_OBSERVATION',
  'FOREIGN_OR_STALE_LANE_CHANGE',
  'LANE_CHANGE_UNAVAILABLE',
  'LANE_CHANGE_PROFILE_MISMATCH',
  'LANE_CHANGE_M_PROFILE_MISMATCH',
]);
/** True only for a 177 tick that applied the keys; a refused input is never a demonstration. */
export function laneV2PolicyActive(reason: LanePolicyV2Reason): boolean {
  return !admissionRefusals.has(reason);
}
/**
 * The 177 branch that took the once-per-opportunity indicator decision. Every one of these reasons
 * is downstream of the signal sample, so its opportunity is a real trial of the indicator key.
 */
const indicatorBranchReasons: ReadonlySet<LanePolicyV2Reason> = new Set<LanePolicyV2Reason>([
  'SIGNAL_LEAD',
  'SIGNAL_LEAD_STALE',
  'SIGNAL_LEAD_COMPLETE',
  'SIGNAL_IMMEDIATE',
  'CHANGE_WITHOUT_SIGNAL',
  'SIGNAL_CANCELLED',
  'MANOEUVRE_IN_PROGRESS',
  'MANOEUVRE_COMPLETE',
  'MANOEUVRE_ABANDONED',
]);
/** The 177 reasons that report a lateral progress inside a manoeuvre. */
const progressReasons: ReadonlySet<LanePolicyV2Reason> = new Set<LanePolicyV2Reason>([
  'MANOEUVRE_IN_PROGRESS',
  'MANOEUVRE_COMPLETE',
]);
/** The 177 reasons of a cancelled or abandoned manoeuvre: the same latch, no usable progress. */
const censoredReasons: ReadonlySet<LanePolicyV2Reason> = new Set<LanePolicyV2Reason>([
  'SIGNAL_CANCELLED',
  'MANOEUVRE_ABANDONED',
]);

export const LANE_V2_ESTIMATOR_LIMITS = Object.freeze({
  version: LANE_V2_ESTIMATOR_VERSION,
  idCodeUnits: LANE_POLICY_V2_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  /** The 177 measurement cadence; a duration or a lead is always a whole number of these ticks. */
  tickHz: LANE_POLICY_V2_LIMITS.tickHz,
  maximumTick: LANE_POLICY_V2_LIMITS.maximumTimeS * LANE_POLICY_V2_LIMITS.tickHz,
  /** 177 explicit policy floor of `lane_change_duration`: 1 s = 60 ticks. */
  minimumManoeuvreDurationTicks:
    LANE_POLICY_V2_LIMITS.minimumManoeuvreDurationS * LANE_POLICY_V2_LIMITS.tickHz,
  /** Catalog 092 maximum of `lane_change_duration` (5 s) and of `signal_lead_time` (5 s) in ticks. */
  maximumManoeuvreDurationTicks: 5 * LANE_POLICY_V2_LIMITS.tickHz,
  maximumSignalLeadTicks: 5 * LANE_POLICY_V2_LIMITS.tickHz,
  /** Distinct indicator opportunities the rate needs before it can carry a value. */
  minimumIndicatorOpportunities: 6,
  /**
   * An episode needs at least this many opportunities before its own rate can inform the dispersion
   * between episodes; a single opportunity is an individual Bernoulli trial, already covered by the
   * pooled binomial error.
   */
  dispersionMinimumOpportunities: 2,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  /** Bound of the 086 occurrence ordinal; an occurrence is a counter, never a tick. */
  maximumOccurrence: 1_000_000,
  /** Tolerance of the report/validation arithmetic, never of the physics. */
  ratioTolerance: 1e-9,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloor: Object.freeze({
    lane_change_duration: 0.05,
    signal_lead_time: 0.05,
    signal_use_probability: 0.02,
    pass_on_right_probability: 0.02,
  }),
  maximumUncertainty: Object.freeze({
    lane_change_duration: 0.5,
    signal_lead_time: 0.5,
    signal_use_probability: 0.15,
    pass_on_right_probability: 0.15,
  }),
  validationTolerance: Object.freeze({
    lane_change_duration: 0.5,
    signal_lead_time: 0.5,
    signal_use_probability: 0.15,
    pass_on_right_probability: 0.15,
  }),
  retainedHistory: 0,
});

export const laneV2EligibleScenarios: Readonly<
  Record<LaneV2EstimatorKey, LaneV2EstimatorScenario>
> = Object.freeze({
  lane_change_duration: 'MANOEUVRE_DURATION',
  signal_lead_time: 'SIGNAL_LEAD',
  signal_use_probability: 'INDICATOR_USE',
  pass_on_right_probability: 'RIGHT_SIDE_PASS',
});

export const laneV2EligibleContexts: Readonly<Record<LaneV2EstimatorKey, string>> = Object.freeze({
  lane_change_duration:
    'o manevră reală a lui 177 în care progresul lateral este observat: tick-urile efective `D` ' +
    'inversează plafonul `ceil(max(cheie, 1 s) · 60)`, deci cheia se află în `((D − 1)/60, D/60]`; ' +
    'podeaua de 1 s face `D = 60` ambiguu pentru tot intervalul 0,5–1 s',
  signal_lead_time:
    'o manevră semnalizată care a pornit efectiv: numărul de tick-uri dintre pornirea ' +
    'indicatorului și prima mișcare laterală inversează același plafon; fără indicator nu există ' +
    'avans de măsurat',
  signal_use_probability:
    'oportunități distincte care au ajuns la decizia indicatorului: numitorul este numărul de ' +
    'oportunități, nu numărul de cadre, iar numărătorul este oportunitățile cu indicatorul pornit',
  pass_on_right_probability:
    'o oportunitate de depășire prin dreapta în care harta permite manevra și spațiul declarat ' +
    'acoperă pragul M, deci 177 a extras eșantionul: acceptarea dă limita inferioară, refuzul dă ' +
    'limita superioară',
});

export const laneV2GroupConstraints = Object.freeze([
  Object.freeze({
    id: 'DURATION_FLOOR_HIDES_SUB_SECOND',
    keys: Object.freeze(['lane_change_duration'] as const),
    explanation:
      'Podeaua explicită a politicii, `minimumManoeuvreDurationS = 1 s`, face ca orice cheie din ' +
      'intervalul 0,5–1 s al catalogului să producă aceleași 60 de tick-uri: `D = 60` dovedește ' +
      'doar `cheie ≤ 1 s`, deci acea bandă nu este identificabilă din comportament și cheia ' +
      'rămâne neobservată în loc să primească podeaua ca valoare.',
  }),
  Object.freeze({
    id: 'MANOEUVRE_TIMELINE_SHARED',
    keys: Object.freeze(['lane_change_duration', 'signal_lead_time'] as const),
    explanation:
      'Cele două durate sunt segmente ale aceleiași cronologii de tick-uri: avansul de semnalizare ' +
      'precede prima mișcare, iar durata numără tick-urile de după ea. O fereastră trunchiată ' +
      'înainte de pornire cenzează avansul, iar una tăiată în timpul mișcării cenzează durata; ' +
      'aceeași manevră nu poate furniza două valori independente din același tick.',
  }),
  Object.freeze({
    id: 'SIGNAL_LEAD_DEPENDS_ON_INDICATOR',
    keys: Object.freeze(['signal_lead_time', 'signal_use_probability'] as const),
    explanation:
      'Avansul există prin definiție numai când indicatorul este folosit: fără indicator manevra ' +
      'pornește în tick-ul validării, deci nu există interval de măsurat. Cele două chei împart ' +
      'aceeași oportunitate — un eșantion `signal-use` decide indicatorul, iar avansul se numără ' +
      'numai după el — dar niciuna nu se deduce din cealaltă.',
  }),
  Object.freeze({
    id: 'RIGHT_PASS_REFUSAL_PRECEDES_SAMPLE',
    keys: Object.freeze(['pass_on_right_probability'] as const),
    explanation:
      'Declarația de siguranță a lumii precede eșantionul: o depășire prin dreapta interzisă, o ' +
      'permisiune `UNKNOWN` sau un spațiu declarat sub `lane_change_front_gap` refuză manevra ' +
      'înainte de orice extragere. Un astfel de tick nu spune nimic despre probabilitate, iar ' +
      'plafonul de spațiu al lui 053 mută proporția de oportunități care ajung la cheie.',
  }),
  Object.freeze({
    id: 'LANE_KEYS_FROM_ONE_MANOEUVRE',
    keys: LANE_POLICY_V2_KEYS,
    explanation:
      'Cele patru chei pot apărea în aceeași călătorie, dar nu din același fapt: ordinea ramurilor ' +
      '177 dă fiecărui tick un singur fapt — refuz 053, refuz de permisiune ori spațiu, eșantion ' +
      'de depășire prin dreapta, eșantion de indicator, avans de semnalizare sau progres lateral. ' +
      'Un set cu un singur tip de demonstrație lasă celelalte trei chei neobservate.',
  }),
]);

/** One tick of a lane demonstration, exactly as the delivered 177 command reports it. */
export interface LaneV2EvidenceSample {
  readonly tick: number;
  /** True when `evaluateLanePolicyV2` applied the keys, i.e. no refused input. */
  readonly policyActive: boolean;
  /** The 177 command reason of the tick. */
  readonly reason: LanePolicyV2Reason;
  readonly action: LanePolicyV2Action;
  /** Distinct 177 opportunity identity; both once-per-opportunity draws are addressed by it. */
  readonly opportunityKey: string;
  /** Effective duration after the one-second floor, in ticks; null outside a manoeuvre. */
  readonly manoeuvreDurationTicks: number | null;
  readonly manoeuvreElapsedTicks: number | null;
  /** Normalized lateral progress in [0, 1]; 0 while the signalling lead still runs. */
  readonly lateralProgress: number | null;
  readonly signalUsed: boolean;
  readonly signalStartTick: number | null;
  readonly manoeuvreStartTick: number | null;
  /** True only for an optional overtake into a RIGHT neighbour. */
  readonly rightOvertakeRequested: boolean;
  /** The map declaration: only a PERMITTED right pass unlocks the key. */
  readonly rightOvertakePermitted: boolean | null;
  readonly rightLaneSpaceM: number | null;
  /** Space required by the M `lane_change_front_gap`. */
  readonly requiredRightSpaceM: number | null;
  /** The single deterministic draw of the opportunity; null when no sample was taken. */
  readonly rightOvertakeSample: number | null;
  readonly rightOvertakeGranted: boolean | null;
}

export interface LaneV2EvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly LaneV2EvidenceSample[];
}

export interface LaneV2EstimatorInput {
  readonly episodes: readonly LaneV2EvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface LaneV2Validation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}

export interface LaneV2KeyEstimate {
  readonly key: LaneV2EstimatorKey;
  readonly scenario: LaneV2EstimatorScenario;
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
  readonly reason: LaneV2EstimatorReason | null;
  readonly validation: LaneV2Validation;
}

export interface LaneV2Compatibility {
  readonly policyVersion: '177-lane-policy-v2';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  /** 177 M keys the estimate belongs to; the four 053 keys are read, never estimated. */
  readonly mReadByPolicy: readonly string[];
  readonly minimumManoeuvreDurationS: number;
  readonly tickHz: number;
  readonly catalogRanges: Readonly<
    Record<
      LaneV2EstimatorKey,
      { readonly min: number; readonly max: number; readonly unit: string }
    >
  >;
}

export interface LaneV2EstimatorResult {
  readonly version: typeof LANE_V2_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<LaneV2EstimatorKey, LaneV2KeyEstimate>>;
  readonly groupConstraints: typeof laneV2GroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: LaneV2EpisodeRefusal;
  }[];
  readonly compatibility: LaneV2Compatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly policyActive: boolean;
  readonly reason: LanePolicyV2Reason;
  readonly action: LanePolicyV2Action;
  readonly opportunityKey: string;
  readonly manoeuvreDurationTicks: number | null;
  readonly manoeuvreElapsedTicks: number | null;
  readonly lateralProgress: number | null;
  readonly signalUsed: boolean;
  readonly signalStartTick: number | null;
  readonly manoeuvreStartTick: number | null;
  readonly rightOvertakeRequested: boolean;
  readonly rightOvertakePermitted: boolean | null;
  readonly rightLaneSpaceM: number | null;
  readonly requiredRightSpaceM: number | null;
  readonly rightOvertakeSample: number | null;
  readonly rightOvertakeGranted: boolean | null;
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
    value.length > LANE_V2_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid lane evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid lane evidence ${field}`);
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
  return fail(`Invalid lane evidence ${field}`);
}
function count(value: unknown, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum)
    fail(`Invalid lane evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
const actions = ['LANE_CHANGE', 'SIGNAL_ONLY', 'NO_CHANGE', 'UNKNOWN'] as const;

function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid lane evidence sample');
  const sample = value as LaneV2EvidenceSample,
    tick = count(sample.tick, LANE_V2_ESTIMATOR_LIMITS.maximumTick, 'sample tick'),
    action = actions.find((entry) => entry === sample.action) ?? fail('Invalid sample action');
  if (typeof sample.policyActive !== 'boolean') fail('Invalid lane evidence sample policy flag');
  if (typeof sample.signalUsed !== 'boolean') fail('Invalid lane evidence sample signal flag');
  if (typeof sample.rightOvertakeRequested !== 'boolean')
    fail('Invalid lane evidence sample right-pass flag');
  if (!(laneV2EvidenceReasons as readonly string[]).includes(sample.reason))
    fail('Invalid lane evidence sample reason');
  return Object.freeze({
    tick,
    policyActive: sample.policyActive,
    reason: sample.reason,
    action,
    opportunityKey: identity(sample.opportunityKey, 'sample opportunity'),
    manoeuvreDurationTicks: optionalFinite(
      sample.manoeuvreDurationTicks,
      1,
      LANE_V2_ESTIMATOR_LIMITS.maximumTick,
      'sample manoeuvre duration',
    ),
    manoeuvreElapsedTicks: optionalFinite(
      sample.manoeuvreElapsedTicks,
      0,
      LANE_V2_ESTIMATOR_LIMITS.maximumTick,
      'sample manoeuvre elapsed',
    ),
    lateralProgress: optionalRatio(sample.lateralProgress, 'sample lateral progress'),
    signalUsed: sample.signalUsed,
    signalStartTick: optionalFinite(
      sample.signalStartTick,
      0,
      LANE_V2_ESTIMATOR_LIMITS.maximumTick,
      'sample signal start',
    ),
    manoeuvreStartTick: optionalFinite(
      sample.manoeuvreStartTick,
      0,
      LANE_V2_ESTIMATOR_LIMITS.maximumTick,
      'sample manoeuvre start',
    ),
    rightOvertakeRequested: sample.rightOvertakeRequested,
    rightOvertakePermitted: optionalBoolean(
      sample.rightOvertakePermitted,
      'sample right-pass permission',
    ),
    rightLaneSpaceM: optionalFinite(
      sample.rightLaneSpaceM,
      0,
      LANE_POLICY_V2_LIMITS.maximumGapM,
      'sample right-lane space',
    ),
    requiredRightSpaceM: optionalFinite(
      sample.requiredRightSpaceM,
      0,
      LANE_POLICY_V2_LIMITS.maximumGapM,
      'sample required right space',
    ),
    rightOvertakeSample: optionalRatio(sample.rightOvertakeSample, 'sample right-pass draw'),
    rightOvertakeGranted: optionalBoolean(
      sample.rightOvertakeGranted,
      'sample right-pass decision',
    ),
  });
}
function admitEpisode(value: unknown): AdmittedEpisode | LaneV2EpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid lane evidence episode');
  const episode = value as LaneV2EvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, LANE_V2_ESTIMATOR_LIMITS.maximumOccurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid lane evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid lane evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid lane evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched lane evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Lane evidence samples are not strictly ordered');
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
function catalogRange(key: LaneV2EstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function compatibility(): LaneV2Compatibility {
  return Object.freeze({
    policyVersion: LANE_POLICY_V2_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    mReadByPolicy: Object.freeze([...LANE_POLICY_V2_M_KEYS]),
    minimumManoeuvreDurationS: LANE_POLICY_V2_LIMITS.minimumManoeuvreDurationS,
    tickHz: LANE_V2_ESTIMATOR_LIMITS.tickHz,
    catalogRanges: Object.freeze(
      Object.fromEntries(LANE_V2_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)])) as Record<
        LaneV2EstimatorKey,
        { min: number; max: number; unit: string }
      >,
    ),
  });
}
function emptyValidation(key: LaneV2EstimatorKey): LaneV2Validation {
  return Object.freeze({
    status: 'NO_DATA',
    episodes: 0,
    value: null,
    error: null,
    tolerance: LANE_V2_ESTIMATOR_LIMITS.validationTolerance[key],
    detail: 'no independent demonstration episodes',
  });
}
function unobserved(
  key: LaneV2EstimatorKey,
  reason: LaneV2EstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: LaneV2Validation = emptyValidation(key),
  uncertainty: number | null = null,
): LaneV2KeyEstimate {
  return Object.freeze({
    key,
    scenario: laneV2EligibleScenarios[key],
    unit: getParameterDefinition(key).unit,
    eligibleContext: laneV2EligibleContexts[key],
    status: 'UNOBSERVED',
    value: null,
    rawValue: null,
    clamped: false,
    uncertainty,
    uncertaintyThreshold: LANE_V2_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason,
    validation,
  });
}
function candidate(
  key: LaneV2EstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: LaneV2Validation,
): LaneV2KeyEstimate | LaneV2EstimatorReason {
  if (uncertainty > LANE_V2_ESTIMATOR_LIMITS.maximumUncertainty[key])
    return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    scenario: laneV2EligibleScenarios[key],
    unit: range.unit,
    eligibleContext: laneV2EligibleContexts[key],
    status: 'CANDIDATE',
    value,
    rawValue,
    clamped: value !== rawValue,
    uncertainty,
    uncertaintyThreshold: LANE_V2_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason: null,
    validation,
  });
}
function continuousValidation(
  key: LaneV2EstimatorKey,
  estimate: number,
  values: readonly number[],
): LaneV2Validation {
  const tolerance = LANE_V2_ESTIMATOR_LIMITS.validationTolerance[key];
  if (values.length < LANE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: values.length,
      value: values.length === 0 ? null : median(values),
      error: values.length === 0 ? null : Math.abs(median(values) - estimate),
      tolerance,
      detail: `validation set has ${values.length} of the required ${LANE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
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
/**
 * Pooled validation of a rate: the held-out opportunities are pooled exactly like the estimate, so
 * a held-out set of many small episodes is not judged by the median of its coarse per-episode rates.
 */
function pooledValidation(
  key: LaneV2EstimatorKey,
  estimate: number,
  episodes: readonly { readonly used: number; readonly opportunities: number }[],
): LaneV2Validation {
  const tolerance = LANE_V2_ESTIMATOR_LIMITS.validationTolerance[key],
    trials = episodes.reduce((sum, entry) => sum + entry.opportunities, 0),
    used = episodes.reduce((sum, entry) => sum + entry.used, 0),
    value = trials === 0 ? null : used / trials,
    error = value === null ? null : Math.abs(value - estimate);
  if (episodes.length < LANE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: episodes.length,
      value,
      error,
      tolerance,
      detail: `validation set has ${episodes.length} of the required ${LANE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
    });
  return Object.freeze({
    status: error !== null && error <= tolerance ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: episodes.length,
    value,
    error,
    tolerance,
    detail: `held-out rate ${value === null ? '—' : value.toFixed(4)} over ${trials} opportunities differs by ${error === null ? '—' : error.toFixed(4)}`,
  });
}
function bracketValidation(
  key: LaneV2EstimatorKey,
  estimate: number,
  bounds: readonly EpisodeBounds[],
  tolerance: number,
): LaneV2Validation {
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
  if (bounds.length < LANE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: bounds.length,
      value,
      error: value === null ? null : Math.abs(value - estimate),
      tolerance,
      detail: `validation set has ${bounds.length} of the required ${LANE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
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
function uncertaintyOf(key: LaneV2EstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    LANE_V2_ESTIMATOR_LIMITS.uncertaintyFloor[key],
    (LANE_V2_ESTIMATOR_LIMITS.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}
/**
 * Inverts the 177 ceiling of a whole number of ticks: `ceil(key · 60) = ticks` admits every key in
 * `((ticks − 1)/60, ticks/60]`, and the midpoint is the minimax value of that interval.
 */
function invertTicks(ticks: number): number {
  return ticks === 0 ? 0 : (ticks - 0.5) / LANE_V2_ESTIMATOR_LIMITS.tickHz;
}
interface DurationMeasure {
  readonly value: number | null;
  readonly samples: number;
  /** Maneuvers whose effective ticks sat at the explicit one-second floor. */
  readonly floor: number;
}
/**
 * Duration of the delivered 177 lateral movement. Only a progress inside a manoeuvre reports the
 * effective ticks; the explicit one-second floor makes `D = 60` ambiguous for the whole 0.5–1 s
 * catalog band, so those manoeuvres are counted, never averaged into the preference.
 */
function durationMeasure(
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): DurationMeasure | null {
  const floorTicks = LANE_V2_ESTIMATOR_LIMITS.minimumManoeuvreDurationTicks,
    values: number[] = [],
    measured = new Set<number>();
  let floor = 0,
    issue: LaneV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (!progressReasons.has(sample.reason)) {
      if (censoredReasons.has(sample.reason)) issue ??= 'MANOEUVRE_CENSORED';
      continue;
    }
    const start = sample.manoeuvreStartTick;
    if (start === null) {
      issue ??= 'MANOEUVRE_PROGRESS_MISSING';
      continue;
    }
    if (measured.has(start)) continue;
    const ticks = sample.manoeuvreDurationTicks,
      elapsed = sample.manoeuvreElapsedTicks,
      progress = sample.lateralProgress;
    if (ticks === null || elapsed === null || progress === null) {
      issue ??= 'MANOEUVRE_PROGRESS_MISSING';
      continue;
    }
    if (ticks < floorTicks) {
      issue ??= 'DURATION_BELOW_FLOOR';
      continue;
    }
    // The command reports `elapsed / ticks` as the progress; a contradiction is not a measurement.
    if (
      Math.abs(Math.min(1, elapsed / ticks) - progress) > LANE_V2_ESTIMATOR_LIMITS.ratioTolerance
    ) {
      issue ??= 'MANOEUVRE_PROGRESS_MISMATCH';
      continue;
    }
    if (ticks > LANE_V2_ESTIMATOR_LIMITS.maximumManoeuvreDurationTicks) {
      issue ??= 'DURATION_OUT_OF_ENVELOPE';
      continue;
    }
    measured.add(start);
    if (ticks === floorTicks) {
      floor += 1;
      continue;
    }
    values.push(invertTicks(ticks));
  }
  if (values.length === 0) {
    if (floor > 0) return { value: null, samples: 0, floor };
    increment(excluded, issue ?? 'NO_MANOEUVRE_DURATION_EPISODE');
    return null;
  }
  return { value: median(values), samples: values.length, floor };
}
interface LeadMeasure {
  readonly value: number;
  readonly samples: number;
}
/**
 * Lead of the delivered 177 signalled manoeuvre: the ticks between the indicator switch-on and the
 * first lateral movement. Without the indicator there is no lead, so an unsignalled manoeuvre never
 * measures the key, and a lead that never completed is only a censored wait.
 */
function leadMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): LeadMeasure | null {
  const lead = new Map<number, AdmittedSample>();
  let censored = false,
    issue: LaneV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (sample.manoeuvreStartTick === null) {
      // The indicator is on but the lateral movement has not begun: the lead is still running.
      if (sample.signalUsed && sample.signalStartTick !== null) censored = true;
      continue;
    }
    if (!lead.has(sample.manoeuvreStartTick)) lead.set(sample.manoeuvreStartTick, sample);
  }
  const values: number[] = [];
  for (const sample of lead.values()) {
    if (!sample.signalUsed) {
      issue ??= 'SIGNAL_LEAD_WITHOUT_INDICATOR';
      continue;
    }
    const start = sample.manoeuvreStartTick!,
      signalTick = sample.signalStartTick;
    if (signalTick === null || signalTick > start || !indicatorBranchReasons.has(sample.reason)) {
      issue ??= 'SIGNAL_LEAD_INCONSISTENT';
      continue;
    }
    const ticks = start - signalTick;
    if (ticks > LANE_V2_ESTIMATOR_LIMITS.maximumSignalLeadTicks) {
      issue ??= 'SIGNAL_LEAD_OUT_OF_ENVELOPE';
      continue;
    }
    values.push(invertTicks(ticks));
  }
  if (values.length === 0) {
    if (censored && issue === null) issue = 'SIGNAL_LEAD_CENSORED';
    increment(excluded, issue ?? 'NO_SIGNALLED_MANOEUVRE');
    return null;
  }
  return { value: median(values), samples: values.length };
}
interface IndicatorMeasure {
  readonly used: number;
  readonly opportunities: number;
}
/**
 * Indicator trials of the delivered 177 sample. The denominator is the number of distinct
 * opportunities that reached the indicator decision, never the number of frames of a manoeuvre.
 */
function indicatorMeasure(
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): IndicatorMeasure | null {
  const drawn = new Map<string, boolean>();
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (!indicatorBranchReasons.has(sample.reason)) continue;
    const prior = drawn.get(sample.opportunityKey);
    if (prior !== undefined && prior !== sample.signalUsed) {
      increment(excluded, 'INDICATOR_USE_INCONSISTENT');
      return null;
    }
    drawn.set(sample.opportunityKey, sample.signalUsed);
  }
  if (drawn.size === 0) {
    increment(excluded, 'NO_INDICATOR_OPPORTUNITY');
    return null;
  }
  let used = 0;
  for (const granted of drawn.values()) if (granted) used += 1;
  return { used, opportunities: drawn.size };
}
/**
 * Right-pass bounds of the delivered 177 draw. The map declaration and the declared space precede
 * the sample, so a forbidden or too-tight pass proves nothing about the probability. A grant proves
 * `key > draw`, a refusal proves `key ≤ draw`.
 */
function rightPassBounds(episode: AdmittedEpisode, excluded: Map<string, number>): Bracket | null {
  const drawn = new Map<string, { readonly draw: number; readonly granted: boolean }>();
  let precondition = 0;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (
      sample.reason === 'RIGHT_OVERTAKE_FORBIDDEN' ||
      sample.reason === 'RIGHT_OVERTAKE_NO_SPACE'
    ) {
      precondition += 1;
      continue;
    }
    const draw = sample.rightOvertakeSample,
      granted = sample.rightOvertakeGranted;
    if (draw === null || granted === null) continue;
    const prior = drawn.get(sample.opportunityKey);
    if (prior !== undefined && (prior.granted !== granted || prior.draw !== draw)) {
      increment(excluded, 'RIGHT_PASS_SAMPLE_INCONSISTENT');
      return null;
    }
    drawn.set(sample.opportunityKey, { draw, granted });
  }
  if (drawn.size === 0) {
    increment(excluded, precondition > 0 ? 'RIGHT_PASS_PRECONDITION' : 'NO_RIGHT_PASS_OPPORTUNITY');
    return null;
  }
  let lower: number | null = null,
    upper: number | null = null;
  for (const entry of drawn.values()) {
    if (entry.granted) lower = lower === null ? entry.draw : Math.max(lower, entry.draw);
    else upper = upper === null ? entry.draw : Math.min(upper, entry.draw);
  }
  if (lower === null && upper === null) {
    increment(excluded, 'RIGHT_PASS_SAMPLE_MISSING');
    return null;
  }
  return { lower, upper, samples: drawn.size };
}
function frozen<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}
function finishContinuous(
  key: LaneV2EstimatorKey,
  values: readonly EpisodeValue[],
  excluded: Map<string, number>,
  seed: number,
): LaneV2KeyEstimate {
  if (values.length === 0) return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
  const split = splitEpisodes(
      values.map((entry) => entry.id),
      seed,
    ),
    estimateValues = values.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationValues = values.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateValues.reduce((sum, entry) => sum + entry.samples, 0),
    totalSamples = values.reduce((sum, entry) => sum + entry.samples, 0);
  if (estimateValues.length < LANE_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
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
 * Duration estimate: only a manoeuvre that actually shows a lateral progress reports the effective
 * ticks. A set that only sat on the one-second floor cannot separate 0.5 s from 1 s, and a set that
 * claims both the floor and an exact duration cannot come from a single key.
 */
function estimateDuration(episodes: readonly AdmittedEpisode[], seed: number): LaneV2KeyEstimate {
  const excluded = new Map<string, number>(),
    values: EpisodeValue[] = [];
  let floorEpisodes = 0;
  for (const episode of episodes) {
    const measured = durationMeasure(episode, excluded);
    if (measured === null) continue;
    if (measured.value === null) {
      floorEpisodes += 1;
      continue;
    }
    values.push({ id: episode.id, value: measured.value, samples: measured.samples });
  }
  // One key cannot produce both the ambiguous one-second floor and an exact duration.
  if (floorEpisodes > 0 && values.length > 0) {
    increment(excluded, 'DURATION_FLOOR_INCONSISTENT');
    return unobserved(
      'lane_change_duration',
      'DURATION_FLOOR_INCONSISTENT',
      values.length + floorEpisodes,
      values.reduce((sum, entry) => sum + entry.samples, 0),
      excluded,
    );
  }
  if (floorEpisodes > 0 && values.length === 0)
    return unobserved(
      'lane_change_duration',
      'DURATION_FLOOR_SATURATED',
      floorEpisodes,
      0,
      excluded,
    );
  return finishContinuous('lane_change_duration', values, excluded, seed);
}
/**
 * Lead estimate: only a signalled manoeuvre that actually started reports the ticks between the
 * indicator and the first lateral movement. An unsignalled manoeuvre never observes the key, and a
 * lead that never completed is a censored wait, not a value.
 */
function estimateLead(episodes: readonly AdmittedEpisode[], seed: number): LaneV2KeyEstimate {
  const excluded = new Map<string, number>(),
    values: EpisodeValue[] = [];
  for (const episode of episodes) {
    const measured = leadMeasure(episode, excluded);
    if (measured === null) continue;
    values.push({ id: episode.id, value: measured.value, samples: measured.samples });
  }
  return finishContinuous('signal_lead_time', values, excluded, seed);
}
/**
 * Indicator estimate: the pooled rate of distinct opportunities whose indicator was switched on.
 * Every opportunity is one Bernoulli trial, so the estimate is `used / opportunities` and never the
 * average of per-episode rates of wildly different sizes. The uncertainty carries both the binomial
 * standard error of that rate and the dispersion between episodes, so a handful of trials cannot
 * impersonate a preference.
 */
function estimateIndicator(episodes: readonly AdmittedEpisode[], seed: number): LaneV2KeyEstimate {
  const key: LaneV2EstimatorKey = 'signal_use_probability',
    excluded = new Map<string, number>(),
    measured: { id: string; used: number; opportunities: number }[] = [];
  for (const episode of episodes) {
    const trials = indicatorMeasure(episode, excluded);
    if (trials === null) continue;
    measured.push({
      id: episode.id,
      used: trials.used,
      opportunities: trials.opportunities,
    });
  }
  if (measured.length === 0) return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
  const split = splitEpisodes(
      measured.map((entry) => entry.id),
      seed,
    ),
    estimateEpisodes = measured.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationEpisodes = measured.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    totalSamples = measured.reduce((sum, entry) => sum + entry.opportunities, 0);
  if (estimateEpisodes.length < LANE_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
    return unobserved(
      key,
      'INSUFFICIENT_DISTINCT_EPISODES',
      measured.length,
      totalSamples,
      excluded,
    );
  const trials = estimateEpisodes.reduce((sum, entry) => sum + entry.opportunities, 0);
  if (trials < LANE_V2_ESTIMATOR_LIMITS.minimumIndicatorOpportunities)
    return unobserved(
      key,
      'INDICATOR_TRIALS_BELOW_MINIMUM',
      estimateEpisodes.length,
      trials,
      excluded,
    );
  const used = estimateEpisodes.reduce((sum, entry) => sum + entry.used, 0),
    estimate = used / trials,
    rateEpisodes = estimateEpisodes.filter(
      (entry) => entry.opportunities >= LANE_V2_ESTIMATOR_LIMITS.dispersionMinimumOpportunities,
    ),
    dispersion =
      rateEpisodes.length === 0
        ? 0
        : uncertaintyOf(
            key,
            rateEpisodes.map((entry) => entry.used / entry.opportunities),
          ),
    uncertainty = Math.max(dispersion, Math.sqrt((estimate * (1 - estimate)) / trials)),
    validation = pooledValidation(key, estimate, validationEpisodes),
    result = candidate(
      key,
      estimate,
      uncertainty,
      estimateEpisodes.length,
      trials,
      excluded,
      validation,
    );
  return typeof result === 'string'
    ? unobserved(key, result, estimateEpisodes.length, trials, excluded, validation, uncertainty)
    : result;
}
/**
 * Shared bracket estimate: the estimate is the middle of the intersection of the demonstrated
 * bounds and the uncertainty is half its width. A single inequality is a bound, not a value.
 */
function estimateBracket(
  key: LaneV2EstimatorKey,
  episodes: readonly AdmittedEpisode[],
  seed: number,
  measure: (episode: AdmittedEpisode, excluded: Map<string, number>) => Bracket | null,
  reasons: {
    readonly lower: LaneV2EstimatorReason;
    readonly upper: LaneV2EstimatorReason;
    readonly contradictory: LaneV2EstimatorReason;
    readonly envelope: LaneV2EstimatorReason;
  },
): LaneV2KeyEstimate {
  const tolerance = LANE_V2_ESTIMATOR_LIMITS.ratioTolerance,
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
  if (estimateBounds.length < LANE_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
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
        LANE_V2_ESTIMATOR_LIMITS.validationTolerance[key],
      );
  let rawValue: number;
  if (lowers.length === 0) {
    const upper = Math.min(...uppers);
    if (upper > range.min + tolerance)
      return unobserved(key, reasons.lower, estimateBounds.length, estimateSamples, excluded);
    // A bound at the catalog floor with no lower bound pins the value at the floor: the draw that
    // would be needed to demonstrate a zero is never produced by the delivered stream.
    rawValue = range.min;
  } else if (uppers.length === 0) {
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
      LANE_V2_ESTIMATOR_LIMITS.uncertaintyFloor[key],
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
const noValueReason: Readonly<Record<LaneV2EstimatorKey, readonly LaneV2EstimatorReason[]>> =
  Object.freeze({
    lane_change_duration: [
      'DURATION_FLOOR_INCONSISTENT',
      'DURATION_FLOOR_SATURATED',
      'DURATION_OUT_OF_ENVELOPE',
      'DURATION_BELOW_FLOOR',
      'MANOEUVRE_PROGRESS_MISMATCH',
      'MANOEUVRE_PROGRESS_MISSING',
      'MANOEUVRE_CENSORED',
      'NO_MANOEUVRE_DURATION_EPISODE',
    ],
    signal_lead_time: [
      'SIGNAL_LEAD_INCONSISTENT',
      'SIGNAL_LEAD_OUT_OF_ENVELOPE',
      'SIGNAL_LEAD_CENSORED',
      'SIGNAL_LEAD_WITHOUT_INDICATOR',
      'NO_SIGNALLED_MANOEUVRE',
    ],
    signal_use_probability: [
      'INDICATOR_USE_INCONSISTENT',
      'INDICATOR_TRIALS_BELOW_MINIMUM',
      'NO_INDICATOR_OPPORTUNITY',
    ],
    pass_on_right_probability: [
      'RIGHT_PASS_SAMPLE_INCONSISTENT',
      'CONTRADICTORY_RIGHT_PASS_BOUNDS',
      'RIGHT_PASS_OUT_OF_ENVELOPE',
      'RIGHT_PASS_LOWER_BOUND_UNOBSERVED',
      'RIGHT_PASS_UPPER_BOUND_UNOBSERVED',
      'RIGHT_PASS_SAMPLE_MISSING',
      'RIGHT_PASS_PRECONDITION',
      'NO_RIGHT_PASS_OPPORTUNITY',
    ],
  });
function reasonFor(
  key: LaneV2EstimatorKey,
  excluded: ReadonlyMap<string, number>,
): LaneV2EstimatorReason {
  return (
    noValueReason[key].find((reason) => excluded.has(reason)) ??
    ('NO_ELIGIBLE_EPISODES' as LaneV2EstimatorReason)
  );
}

/**
 * Estimates the four 177 lane keys from demonstrated episodes. The same episodes and the same
 * `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateLaneV2Style(input: LaneV2EstimatorInput): LaneV2EstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid lane estimator input');
  const splitSeed = count(input.splitSeed, LANE_V2_ESTIMATOR_LIMITS.maximumSeed, 'split seed');
  if (!Array.isArray(input.episodes)) fail('Invalid lane evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: LaneV2EpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as LaneV2EvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as LaneV2EvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }
  const keys = {
    lane_change_duration: estimateDuration(admitted, splitSeed),
    signal_lead_time: estimateLead(admitted, splitSeed),
    signal_use_probability: estimateIndicator(admitted, splitSeed),
    pass_on_right_probability: estimateBracket(
      'pass_on_right_probability',
      admitted,
      splitSeed,
      rightPassBounds,
      {
        lower: 'RIGHT_PASS_LOWER_BOUND_UNOBSERVED',
        upper: 'RIGHT_PASS_UPPER_BOUND_UNOBSERVED',
        contradictory: 'CONTRADICTORY_RIGHT_PASS_BOUNDS',
        envelope: 'RIGHT_PASS_OUT_OF_ENVELOPE',
      },
    ),
  } as Record<LaneV2EstimatorKey, LaneV2KeyEstimate>;
  return Object.freeze({
    version: LANE_V2_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: laneV2GroupConstraints,
    admittedEpisodes: frozen(admitted.map((episode) => episode.id)),
    refusedEpisodes: frozen(refused.map((entry) => Object.freeze(entry))),
    compatibility: compatibility(),
  });
}
