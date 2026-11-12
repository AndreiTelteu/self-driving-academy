import {
  LATERAL_POLICY_V2_KEYS,
  LATERAL_POLICY_V2_LIMITS,
  LATERAL_POLICY_V2_M_KEYS,
} from '../autonomy';
import type { LateralPolicyV2Action, LateralPolicyV2Key, LateralPolicyV2Reason } from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 180 lateral estimator: estimates the eight 179 lateral-control keys from demonstrated commands
 * while keeping the lane offset, the steering response, the steering slew, the turn entry speed, the
 * turn exit acceleration, the corner cutting, the obstacle clearance and the correction deadband in
 * eight separate contexts.
 *
 * The estimator inverts the delivered `179-lateral-policy-v2` arithmetic instead of inventing a
 * second lateral model: every value is measured from facts the delivered command already reports
 * (the corridor and the offset target, the reported `responseTicks` of the latch together with the
 * ticks actually spent before the first steering step, the applied steering step against the
 * committed target, the turn speed limit and the adherence ceiling of the same tick, the exit
 * acceleration and the M ceiling that bounds it, the reported corner cut against the corridor, the
 * effective clearance against the vehicle floor, and the cross-track error against the correction
 * flag) plus the M keys of the 179 profile of the same tick. It is candidate-only: it never
 * publishes a profile, never writes to a store, never flips a 092 `implemented` flag and never
 * changes the 179 semantics. It reads the key list, the 60 Hz tick rate, the 1.5 rad/s rate ceiling,
 * the clearance body margin, the corridor margin and the turn radius threshold directly from 179,
 * and the catalog ranges from the 092 registry, so measurement and decision use the same constants.
 *
 * 1. `lane_center_offset` (m) — the corridor clamp is the identity inside `±(lățime/2 − ecartament/2
 *    − 0,2 m)`, so an unsaturated `laneOffsetTargetM` is the key itself; a target sitting on the
 *    corridor proves only `|cheie| ≥ coridor`, never a value beyond it.
 * 2. `steering_response_time` (s) — the dead time is the number of held command ticks before the
 *    first non-zero steering step of a fresh latch, cross-checked against the reported
 *    `responseTicks = max(1, ceil(cheie · 60))`: `R` ticks admit `cheie ∈ ((R − 1)/60, R/60]`.
 * 3. `steering_rate_limit` (rad/s) — the applied step is `min(cheie, 1,5 rad/s)/60` when the
 *    committed target is further away than one step; only a saturated step measures the key, and a
 *    step sitting on the 1,5 rad/s ceiling proves `cheie ≥ 1,5` and nothing above it.
 * 4. `turn_entry_speed` (m/s) — inside a turn the command reports `min(cheie, plafon de aderență)`;
 *    a limit strictly under the ceiling is the key, a limit on the ceiling is only a lower bound.
 * 5. `turn_exit_acceleration` (m/s²) — the first tick after a turn reports `min(cheie, cheia M
 *    desired_acceleration)`; the M cap is read from the same profile and a value on the cap is only
 *    a lower bound. A zero outside the exit tick is structural and never evidence.
 * 6. `corner_cutting_bias` (ratio) — inside a turn the cut is `cheie · coridor`, so
 *    `|cornerCutM| / coridor` is the key; outside a turn the cut is structurally zero and proves
 *    nothing, while a zero cut inside a turn is a demonstrated zero.
 * 7. `lateral_clearance` (m) — the effective clearance is `max(cheie, ecartament + 0,2 m)` and it is
 *    reported next to the declared obstacle gap; above the floor the value is the key, on the floor
 *    it is only an upper bound.
 * 8. `lateral_correction_deadband` (m) — the correction is active exactly when
 *    `|eroare| > cheie`, so every sample is one inequality: an active correction bounds the key
 *    above the error, an inactive one bounds it below, and the estimate is the intersection.
 */
export const LATERAL_V2_ESTIMATOR_VERSION = '180-lateral-estimator-v2' as const;
export const LATERAL_V2_ESTIMATOR_KEYS = LATERAL_POLICY_V2_KEYS;
export type LateralV2EstimatorKey = LateralPolicyV2Key;
export type LateralV2EstimatorScenario =
  | 'LANE_OFFSET'
  | 'STEERING_RESPONSE'
  | 'STEERING_RATE'
  | 'TURN_ENTRY_SPEED'
  | 'TURN_EXIT_ACCELERATION'
  | 'CORNER_CUTTING'
  | 'OBSTACLE_CLEARANCE'
  | 'CORRECTION_DEADBAND';

export const lateralV2EstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'NO_OFFSET_EPISODE',
  'OFFSET_CORRIDOR_SATURATED',
  'OFFSET_INCONSISTENT',
  'NO_RESPONSE_EPISODE',
  'RESPONSE_LATCH_MISSING',
  'RESPONSE_CENSORED',
  'RESPONSE_DELAY_MISMATCH',
  'RESPONSE_OUT_OF_ENVELOPE',
  'NO_RATE_EPISODE',
  'STEERING_RATE_CEILING_SATURATED',
  'STEERING_RATE_BOUND_INCONSISTENT',
  'STEERING_STEP_INCONSISTENT',
  'NO_TURN_ENTRY_EPISODE',
  'TURN_ENTRY_ADHERENCE_SATURATED',
  'TURN_ENTRY_BOUND_INCONSISTENT',
  'NO_TURN_EXIT_EPISODE',
  'TURN_EXIT_ACCELERATION_SATURATED',
  'TURN_EXIT_BOUND_INCONSISTENT',
  'NO_CORNER_CUT_EPISODE',
  'CORNER_CUT_NO_CORRIDOR',
  'CORNER_CUT_INCONSISTENT',
  'NO_CLEARANCE_EPISODE',
  'LATERAL_CLEARANCE_FLOOR_SATURATED',
  'CLEARANCE_BOUND_INCONSISTENT',
  'CLEARANCE_DECISION_INCONSISTENT',
  'NO_DEADBAND_EPISODE',
  'DEADBAND_LOWER_BOUND_UNOBSERVED',
  'DEADBAND_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_DEADBAND_BOUNDS',
  'CORRECTION_STEERING_INCONSISTENT',
] as const;
export type LateralV2EstimatorReason = (typeof lateralV2EstimatorReasons)[number];

export const lateralV2EpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type LateralV2EpisodeRefusal = (typeof lateralV2EpisodeRefusals)[number];

/**
 * The closed 179 reason vocabulary. The exhaustive record makes the mirror checkable by the
 * compiler: a new policy reason must be added here before it can become measurement evidence.
 */
const evidenceReasonSet: Readonly<Record<LateralPolicyV2Reason, true>> = Object.freeze({
  LATERAL_POLICY_V2: true,
  NO_AUTO_AUTHORITY: true,
  MISSING_PROFILE: true,
  FOREIGN_OR_STALE_OBSERVATION: true,
  PROJECTION_UNAVAILABLE: true,
  FOREIGN_OR_STALE_PROJECTION: true,
  PROJECTION_UNUSABLE: true,
  TRACKING: true,
  CLEARANCE_HOLD: true,
});
export const lateralV2EvidenceReasons: readonly LateralPolicyV2Reason[] = Object.freeze(
  Object.keys(evidenceReasonSet) as LateralPolicyV2Reason[],
);
/** The 179 reasons that mean the layer never applied the keys, i.e. no demonstration at all. */
const admissionRefusals: ReadonlySet<LateralPolicyV2Reason> = new Set<LateralPolicyV2Reason>([
  'LATERAL_POLICY_V2',
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'FOREIGN_OR_STALE_OBSERVATION',
  'PROJECTION_UNAVAILABLE',
  'FOREIGN_OR_STALE_PROJECTION',
  'PROJECTION_UNUSABLE',
]);
/** True only for a 179 tick that applied the keys; a refused input is never a demonstration. */
export function lateralV2PolicyActive(reason: LateralPolicyV2Reason): boolean {
  return !admissionRefusals.has(reason);
}

export const LATERAL_V2_ESTIMATOR_LIMITS = Object.freeze({
  version: LATERAL_V2_ESTIMATOR_VERSION,
  idCodeUnits: LATERAL_POLICY_V2_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  /** The 179 measurement cadence; a dead time is always a whole number of these ticks. */
  tickHz: LATERAL_POLICY_V2_LIMITS.tickHz,
  maximumTick: LATERAL_POLICY_V2_LIMITS.maximumTimeS * LATERAL_POLICY_V2_LIMITS.tickHz,
  /** The explicit 179 ceiling of `steering_rate_limit`. */
  maximumSteeringRateRadPerS: LATERAL_POLICY_V2_LIMITS.maximumSteeringRateRadPerS,
  minimumResponseTicks: LATERAL_POLICY_V2_LIMITS.minimumResponseTicks,
  clearanceBodyMarginM: LATERAL_POLICY_V2_LIMITS.clearanceBodyMarginM,
  corridorMarginM: LATERAL_POLICY_V2_LIMITS.corridorMarginM,
  turnRadiusThresholdM: LATERAL_POLICY_V2_LIMITS.turnRadiusThresholdM,
  maximumLaneWidthM: LATERAL_POLICY_V2_LIMITS.maximumLaneWidthM,
  maximumDeviationM: LATERAL_POLICY_V2_LIMITS.maximumDeviationM,
  maximumSpeedMps: LATERAL_POLICY_V2_LIMITS.maximumSpeedMps,
  maximumClearanceM: LATERAL_POLICY_V2_LIMITS.maximumClearanceM,
  maximumCurvaturePerM: LATERAL_POLICY_V2_LIMITS.maximumCurvaturePerM,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  /** Bound of the 086 occurrence ordinal; an occurrence is a counter, never a tick. */
  maximumOccurrence: 1_000_000,
  /** Tolerance of the report/validation arithmetic, never of the physics. */
  ratioTolerance: 1e-9,
  /** Steering arithmetic tolerance, rad: the applied step is compared with the committed target. */
  steeringToleranceRad: 1e-9,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloor: Object.freeze({
    lane_center_offset: 0.02,
    steering_response_time: 0.02,
    steering_rate_limit: 0.05,
    turn_entry_speed: 0.05,
    turn_exit_acceleration: 0.05,
    corner_cutting_bias: 0.02,
    lateral_clearance: 0.05,
    lateral_correction_deadband: 0.02,
  }),
  maximumUncertainty: Object.freeze({
    lane_center_offset: 0.15,
    steering_response_time: 0.2,
    steering_rate_limit: 0.25,
    turn_entry_speed: 0.8,
    turn_exit_acceleration: 0.25,
    corner_cutting_bias: 0.15,
    lateral_clearance: 0.15,
    lateral_correction_deadband: 0.12,
  }),
  validationTolerance: Object.freeze({
    lane_center_offset: 0.15,
    steering_response_time: 0.2,
    steering_rate_limit: 0.25,
    turn_entry_speed: 0.8,
    turn_exit_acceleration: 0.25,
    corner_cutting_bias: 0.15,
    lateral_clearance: 0.15,
    lateral_correction_deadband: 0.1,
  }),
  retainedHistory: 0,
});

export const lateralV2EligibleScenarios: Readonly<
  Record<LateralV2EstimatorKey, LateralV2EstimatorScenario>
> = Object.freeze({
  lane_center_offset: 'LANE_OFFSET',
  steering_response_time: 'STEERING_RESPONSE',
  steering_rate_limit: 'STEERING_RATE',
  turn_entry_speed: 'TURN_ENTRY_SPEED',
  turn_exit_acceleration: 'TURN_EXIT_ACCELERATION',
  corner_cutting_bias: 'CORNER_CUTTING',
  lateral_clearance: 'OBSTACLE_CLEARANCE',
  lateral_correction_deadband: 'CORRECTION_DEADBAND',
});

export const lateralV2EligibleContexts: Readonly<Record<LateralV2EstimatorKey, string>> =
  Object.freeze({
    lane_center_offset:
      'o comandă 179 activă în care deplasarea țintă este în interiorul coridorului 049: ' +
      '`clamp(cheie, ±coridor)` este identitatea, deci ținta este chiar cheia; o țintă pe coridor ' +
      'dovedește doar `|cheie| ≥ coridor`',
    steering_response_time:
      'un latch proaspăt în care o țintă nouă de direcție produce o reacție: numărul de tick-uri ' +
      'de comandă ținută înainte de primul pas nenul inversează `max(1, ceil(cheie · 60))`, iar ' +
      'valoarea raportată confirmă măsurătoarea',
    steering_rate_limit:
      'un pas de direcție aplicat când ținta commitată este mai departe decât un pas, deci pasul ' +
      'este saturat: `|pas| · 60` este cheia, iar un pas pe plafonul de 1,5 rad/s dovedește doar ' +
      '`cheie ≥ 1,5`',
    turn_entry_speed:
      'un tick real în viraj (rază locală ≤ 40 m) în care comanda raportează limita de viteză și ' +
      'plafonul de aderență: `min(cheie, plafon)` sub plafon este cheia, iar o limită pe plafon ' +
      'este doar o margine inferioară',
    turn_exit_acceleration:
      'primul tick după viraj, cu latch-ul de viraj purtat din tick-ul anterior: ' +
      '`min(cheie, desired_acceleration)` sub plafonul M este cheia, iar o valoare pe plafon este ' +
      'doar o margine inferioară; un zero în afara ieșirii este structural',
    corner_cutting_bias:
      'un tick real în viraj cu coridor pozitiv: tăierea este `cheie · coridor`, deci ' +
      '`|cornerCutM| / coridor` este cheia; în afara virajului tăierea este structural zero, iar ' +
      'o tăiere zero în viraj este un zero demonstrat',
    lateral_clearance:
      'un tick activ cu un obstacol declarat, în care spațiul lateral disponibil este raportat: ' +
      '`max(cheie, ecartament + 0,2 m)` peste podea este cheia, iar o valoare pe podea este doar o ' +
      'margine superioară',
    lateral_correction_deadband:
      'un tick activ în care abaterea laterală este cunoscută: corecția este activă exact când ' +
      '`|eroare| > cheie`, deci fiecare eșantion este o inegalitate, iar estimarea este intersecția ' +
      'lor, niciodată o valoare exactă',
  });

export const lateralV2GroupConstraints = Object.freeze([
  Object.freeze({
    id: 'RATE_CEILING_HIDES_HIGH_KEYS',
    keys: Object.freeze(['steering_rate_limit'] as const),
    explanation:
      'Plafonul explicit al politicii, `maximumSteeringRateRadPerS = 1,5 rad/s`, face ca fiecare ' +
      'cheie din intervalul 1,5–4 rad/s al catalogului să producă exact același pas de 0,025 ' +
      'rad/tick: un pas pe plafon dovedește doar `cheie ≥ 1,5`, deci banda 1,5–4 rămâne ' +
      'neidentificabilă din comportament și cheia rămâne neobservată în loc să primească plafonul.',
  }),
  Object.freeze({
    id: 'CLEARANCE_FLOOR_HIDES_LOW_KEYS',
    keys: Object.freeze(['lateral_clearance'] as const),
    explanation:
      'Podeaua de siguranță `ecartament + 0,2 m` (2,0 m pentru sedan, 1,8 m pentru compact) ' +
      'transformă orice cheie sub ea în aceeași comandă: spațiul efectiv raportat este podeaua, ' +
      'deci tot intervalul 0,1–2,0 m al catalogului este ascuns și cheia rămâne neobservată.',
  }),
  Object.freeze({
    id: 'ENTRY_SPEED_ADHERENCE_CEILING',
    keys: Object.freeze(['turn_entry_speed'] as const),
    explanation:
      'Viteza de intrare este plafonată de aderență, `min(sqrt(curve_lateral_accel · rază), ' +
      'avizul 049)`: pe virajul de 15,7 m cu 2,5 m/s² plafonul este 6,269 m/s, deci nicio cheie ' +
      'peste el (catalogul merge până la 18 m/s) nu poate fi observată. Plafonul depinde de ' +
      'geometrie și de cheia M `curve_lateral_accel`, nu de stilul șoferului.',
  }),
  Object.freeze({
    id: 'EXIT_ACCELERATION_M_CAP',
    keys: Object.freeze(['turn_exit_acceleration'] as const),
    explanation:
      'Accelerația de ieșire este plafonată de cheia M `desired_acceleration` a lui 047: cu 1,5 ' +
      'm/s² orice cheie de la 1,5 la 6 m/s² produce aceeași comandă. Ea este și singura cheie ' +
      'măsurată pe un singur tick de tranziție, deci fereastra trebuie să conțină ambele tick-uri ' +
      'ale ieșirii; altfel ieșirea este cenzată, nu zero.',
  }),
  Object.freeze({
    id: 'CORRIDOR_CLAMP_SHARES_OFFSET_AND_CUT',
    keys: Object.freeze(['lane_center_offset', 'corner_cutting_bias'] as const),
    explanation:
      'Deplasarea de bandă și tăierea virajului împart același coridor 049 ' +
      '(`lățime/2 − ecartament/2 − 0,2 m`) și aceeași ordine de ramuri: tăierea se adaugă peste ' +
      'deplasarea deja plafonată și suma este plafonată din nou. O țintă sau o tăiere pe coridor ' +
      'nu distinge cheia de orice valoare mai mare, iar o tăiere este observabilă numai în viraj.',
  }),
  Object.freeze({
    id: 'DEAD_TIME_AND_CORRECTION_SHARE_LATCH',
    keys: Object.freeze(['steering_response_time', 'lateral_correction_deadband'] as const),
    explanation:
      'Timpul mort și corecția depind de continuitatea latch-ului purtat de apelant: timpul mort ' +
      'se numără numai dintr-o țintă nouă recunoscută după ce latch-ul s-a golit, iar corecția ' +
      'depinde de eroarea de cross-track a aceluiași tick. O fereastră care începe în mijlocul ' +
      'unui hold nu are reacție de măsurat, iar una tăiată înainte de reacție cenzează timpul mort.',
  }),
  Object.freeze({
    id: 'LATERAL_KEYS_FROM_ONE_TICK',
    keys: LATERAL_POLICY_V2_KEYS,
    explanation:
      'Cele opt chei pot apărea în aceeași călătorie, dar nu din același fapt: ordinea ramurilor ' +
      '179 dă fiecărui tick o singură situație — refuz de proiecție, deplasare de bandă, tăiere, ' +
      'timp mort și pas de direcție, plafon de aderență în viraj, accelerație de ieșire, spațiu ' +
      'lateral sau corecție. Un set cu un singur tip de demonstrație lasă celelalte șapte chei ' +
      'neobservate.',
  }),
]);

/** One tick of a lateral demonstration, exactly as the delivered 179 command reports it. */
export interface LateralV2EvidenceSample {
  readonly tick: number;
  /** True when `evaluateLateralPolicyV2` applied the keys, i.e. no refused input. */
  readonly policyActive: boolean;
  /** The 179 command reason of the tick. */
  readonly reason: LateralPolicyV2Reason;
  readonly action: LateralPolicyV2Action;
  /** The 049 corridor of the tick: `laneWidth/2 − track/2 − 0,2 m`. */
  readonly laneCorridorM: number;
  /** The clamped offset target, m. */
  readonly laneOffsetTargetM: number;
  readonly inTurn: boolean;
  /** `min(key, adherence ceiling)`, m/s; null outside a turn. */
  readonly turnSpeedLimitMps: number | null;
  readonly adherenceCeilingMps: number | null;
  readonly localRadiusM: number | null;
  /** `key · corridor`, signed towards the inside of the turn, m; zero outside a turn. */
  readonly cornerCutM: number;
  readonly desiredOffsetM: number;
  /** Signed cross-track error `deviation − desired offset`, m. */
  readonly deviationErrorM: number;
  readonly correctionActive: boolean;
  readonly correctionSteeringRad: number;
  /** `max(key, track + 0,2 m)`, m. */
  readonly effectiveClearanceM: number;
  /** Declared obstacle gap, m; null when no obstacle was declared. */
  readonly availableClearanceM: number | null;
  readonly manoeuvrePermitted: boolean;
  /** The delivered vehicle track, m: the clearance floor is derived from it. */
  readonly trackM: number;
  readonly rawSteeringRad: number;
  readonly steeringRad: number;
  /** Applied road-wheel step of the tick, rad. */
  readonly steeringStepRad: number;
  /** Target the latch holds after the tick, rad. */
  readonly committedTargetRad: number;
  /** `max(1, ceil(key · 60))`, ticks. */
  readonly responseTicks: number;
  readonly holdTicksRemaining: number;
  /** Preferred acceleration on the exit tick, m/s²; zero outside the exit tick. */
  readonly exitAccelerationMps2: number;
  /** The M `desired_acceleration` that bounds the exit, m/s². */
  readonly exitAccelerationCapMps2: number;
}

export interface LateralV2EvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly LateralV2EvidenceSample[];
}

export interface LateralV2EstimatorInput {
  readonly episodes: readonly LateralV2EvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface LateralV2Validation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}

export interface LateralV2KeyEstimate {
  readonly key: LateralV2EstimatorKey;
  readonly scenario: LateralV2EstimatorScenario;
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
  readonly reason: LateralV2EstimatorReason | null;
  readonly validation: LateralV2Validation;
}

export interface LateralV2Compatibility {
  readonly policyVersion: '179-lateral-policy-v2';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  /** 179 M keys the estimate belongs to; they are read, never estimated. */
  readonly mReadByPolicy: readonly string[];
  readonly maximumSteeringRateRadPerS: number;
  readonly tickHz: number;
  readonly catalogRanges: Readonly<
    Record<
      LateralV2EstimatorKey,
      { readonly min: number; readonly max: number; readonly unit: string }
    >
  >;
}

export interface LateralV2EstimatorResult {
  readonly version: typeof LATERAL_V2_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<LateralV2EstimatorKey, LateralV2KeyEstimate>>;
  readonly groupConstraints: typeof lateralV2GroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: LateralV2EpisodeRefusal;
  }[];
  readonly compatibility: LateralV2Compatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly policyActive: boolean;
  readonly reason: LateralPolicyV2Reason;
  readonly action: LateralPolicyV2Action;
  readonly laneCorridorM: number;
  readonly laneOffsetTargetM: number;
  readonly inTurn: boolean;
  readonly turnSpeedLimitMps: number | null;
  readonly adherenceCeilingMps: number | null;
  readonly localRadiusM: number | null;
  readonly cornerCutM: number;
  readonly desiredOffsetM: number;
  readonly deviationErrorM: number;
  readonly correctionActive: boolean;
  readonly correctionSteeringRad: number;
  readonly effectiveClearanceM: number;
  readonly availableClearanceM: number | null;
  readonly manoeuvrePermitted: boolean;
  readonly trackM: number;
  readonly rawSteeringRad: number;
  readonly steeringRad: number;
  readonly steeringStepRad: number;
  readonly committedTargetRad: number;
  readonly responseTicks: number;
  readonly holdTicksRemaining: number;
  readonly exitAccelerationMps2: number;
  readonly exitAccelerationCapMps2: number;
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

/** A demonstrated inequality: a saturated fact proves one side of the key, never its value. */
interface EpisodeBound {
  readonly id: string;
  readonly side: 'LOWER' | 'UPPER';
  readonly at: number;
  readonly reason: LateralV2EstimatorReason;
  readonly samples: number;
}

/** One episode's measurement: an exact value, a one-sided bound, or nothing usable. */
type Measure =
  | { readonly kind: 'VALUE'; readonly value: number; readonly samples: number }
  | { readonly kind: 'BOUND'; readonly bound: EpisodeBound };

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
    value.length > LATERAL_V2_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid lateral evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid lateral evidence ${field}`);
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
function count(value: unknown, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum)
    fail(`Invalid lateral evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
const actions = ['TRACK', 'UNAVAILABLE'] as const;
const limit = LATERAL_V2_ESTIMATOR_LIMITS;

function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid lateral evidence sample');
  const sample = value as LateralV2EvidenceSample,
    tick = count(sample.tick, limit.maximumTick, 'sample tick'),
    action = actions.find((entry) => entry === sample.action) ?? fail('Invalid sample action');
  if (typeof sample.policyActive !== 'boolean') fail('Invalid sample policy flag');
  if (typeof sample.inTurn !== 'boolean') fail('Invalid sample turn flag');
  if (typeof sample.correctionActive !== 'boolean') fail('Invalid sample correction flag');
  if (typeof sample.manoeuvrePermitted !== 'boolean') fail('Invalid sample manoeuvre flag');
  if (!(lateralV2EvidenceReasons as readonly string[]).includes(sample.reason))
    fail('Invalid lateral evidence sample reason');
  return Object.freeze({
    tick,
    policyActive: sample.policyActive,
    reason: sample.reason,
    action,
    laneCorridorM: finite(sample.laneCorridorM, 0, limit.maximumLaneWidthM, 'sample corridor'),
    laneOffsetTargetM: finite(
      sample.laneOffsetTargetM,
      -limit.maximumLaneWidthM,
      limit.maximumLaneWidthM,
      'sample offset target',
    ),
    inTurn: sample.inTurn,
    turnSpeedLimitMps: optionalFinite(
      sample.turnSpeedLimitMps,
      0,
      limit.maximumSpeedMps,
      'sample turn speed limit',
    ),
    adherenceCeilingMps: optionalFinite(
      sample.adherenceCeilingMps,
      0,
      limit.maximumSpeedMps,
      'sample adherence ceiling',
    ),
    localRadiusM: optionalFinite(sample.localRadiusM, 0, 1_000_000, 'sample local radius'),
    cornerCutM: finite(
      sample.cornerCutM,
      -limit.maximumLaneWidthM,
      limit.maximumLaneWidthM,
      'sample corner cut',
    ),
    desiredOffsetM: finite(
      sample.desiredOffsetM,
      -limit.maximumLaneWidthM,
      limit.maximumLaneWidthM,
      'sample desired offset',
    ),
    deviationErrorM: finite(
      sample.deviationErrorM,
      -2 * limit.maximumDeviationM,
      2 * limit.maximumDeviationM,
      'sample deviation error',
    ),
    correctionActive: sample.correctionActive,
    correctionSteeringRad: finite(
      sample.correctionSteeringRad,
      -1,
      1,
      'sample correction steering',
    ),
    effectiveClearanceM: finite(
      sample.effectiveClearanceM,
      0,
      limit.maximumClearanceM,
      'sample effective clearance',
    ),
    availableClearanceM: optionalFinite(
      sample.availableClearanceM,
      0,
      limit.maximumClearanceM,
      'sample available clearance',
    ),
    manoeuvrePermitted: sample.manoeuvrePermitted,
    trackM: finite(sample.trackM, 0.5, 5, 'sample track'),
    rawSteeringRad: finite(sample.rawSteeringRad, -1, 1, 'sample raw steering'),
    steeringRad: finite(sample.steeringRad, -1, 1, 'sample steering'),
    steeringStepRad: finite(sample.steeringStepRad, -1, 1, 'sample steering step'),
    committedTargetRad: finite(sample.committedTargetRad, -1, 1, 'sample committed target'),
    responseTicks: count(sample.responseTicks, limit.maximumTick, 'sample response ticks'),
    holdTicksRemaining: count(sample.holdTicksRemaining, limit.maximumTick, 'sample hold ticks'),
    exitAccelerationMps2: finite(
      sample.exitAccelerationMps2,
      0,
      limit.maximumSpeedMps,
      'sample exit acceleration',
    ),
    exitAccelerationCapMps2: finite(
      sample.exitAccelerationCapMps2,
      0,
      limit.maximumSpeedMps,
      'sample exit acceleration cap',
    ),
  });
}
function admitEpisode(value: unknown): AdmittedEpisode | LateralV2EpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid lateral evidence episode');
  const episode = value as LateralV2EvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, limit.maximumOccurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid lateral evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid lateral evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid lateral evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched lateral evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Lateral evidence samples are not strictly ordered');
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
function catalogRange(key: LateralV2EstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function compatibility(): LateralV2Compatibility {
  return Object.freeze({
    policyVersion: LATERAL_POLICY_V2_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    mReadByPolicy: Object.freeze([...LATERAL_POLICY_V2_M_KEYS]),
    maximumSteeringRateRadPerS: limit.maximumSteeringRateRadPerS,
    tickHz: limit.tickHz,
    catalogRanges: Object.freeze(
      Object.fromEntries(
        LATERAL_V2_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)]),
      ) as Record<LateralV2EstimatorKey, { min: number; max: number; unit: string }>,
    ),
  });
}
function emptyValidation(key: LateralV2EstimatorKey): LateralV2Validation {
  return Object.freeze({
    status: 'NO_DATA',
    episodes: 0,
    value: null,
    error: null,
    tolerance: limit.validationTolerance[key],
    detail: 'no independent demonstration episodes',
  });
}
function unobserved(
  key: LateralV2EstimatorKey,
  reason: LateralV2EstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: LateralV2Validation = emptyValidation(key),
  uncertainty: number | null = null,
): LateralV2KeyEstimate {
  return Object.freeze({
    key,
    scenario: lateralV2EligibleScenarios[key],
    unit: getParameterDefinition(key).unit,
    eligibleContext: lateralV2EligibleContexts[key],
    status: 'UNOBSERVED',
    value: null,
    rawValue: null,
    clamped: false,
    uncertainty,
    uncertaintyThreshold: limit.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason,
    validation,
  });
}
function candidate(
  key: LateralV2EstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: LateralV2Validation,
): LateralV2KeyEstimate | LateralV2EstimatorReason {
  if (uncertainty > limit.maximumUncertainty[key]) return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    scenario: lateralV2EligibleScenarios[key],
    unit: range.unit,
    eligibleContext: lateralV2EligibleContexts[key],
    status: 'CANDIDATE',
    value,
    rawValue,
    clamped: value !== rawValue,
    uncertainty,
    uncertaintyThreshold: limit.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason: null,
    validation,
  });
}
function continuousValidation(
  key: LateralV2EstimatorKey,
  estimate: number,
  values: readonly number[],
): LateralV2Validation {
  const tolerance = limit.validationTolerance[key];
  if (values.length < limit.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: values.length,
      value: values.length === 0 ? null : median(values),
      error: values.length === 0 ? null : Math.abs(median(values) - estimate),
      tolerance,
      detail: `validation set has ${values.length} of the required ${limit.minimumValidationEpisodes} episodes`,
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
 * Bracket validation: the held-out demonstrations must admit the estimate inside the documented
 * tolerance, which is how an inequality is validated without inventing a held-out value.
 */
function bracketValidation(
  key: LateralV2EstimatorKey,
  estimate: number,
  bounds: readonly EpisodeBounds[],
  tolerance: number,
): LateralV2Validation {
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
  if (bounds.length < limit.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: bounds.length,
      value,
      error: value === null ? null : Math.abs(value - estimate),
      tolerance,
      detail: `validation set has ${bounds.length} of the required ${limit.minimumValidationEpisodes} episodes`,
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
function uncertaintyOf(key: LateralV2EstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    limit.uncertaintyFloor[key],
    (limit.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}
function frozen<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}
/**
 * Inverts the 179 ceiling of a whole number of ticks: `ceil(key · 60) = ticks` admits every key in
 * `((ticks − 1)/60, ticks/60]`, and the midpoint is the minimax value of that interval.
 */
function invertTicks(ticks: number): number {
  return ticks === 0 ? 0 : (ticks - 0.5) / limit.tickHz;
}
/** The 179 clearance floor of the delivered vehicle class: `track + 0,2 m`. */
function clearanceFloor(trackM: number): number {
  return trackM + limit.clearanceBodyMarginM;
}

/**
 * Lane offset: the corridor clamp is the identity strictly inside the corridor, so the reported
 * target is the key. A target on the corridor is a one-sided proof and is never averaged in.
 */
function offsetMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): Measure | null {
  const values: number[] = [];
  let saturated = 0;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.action !== 'TRACK') continue;
    const corridor = sample.laneCorridorM;
    if (corridor <= limit.ratioTolerance) {
      increment(excluded, 'OFFSET_CORRIDOR_SATURATED');
      return null;
    }
    if (Math.abs(sample.laneOffsetTargetM) >= corridor - limit.ratioTolerance) {
      // Saturated inside the corridor: the target does not distinguish the key from anything beyond.
      saturated += 1;
      continue;
    }
    values.push(sample.laneOffsetTargetM);
  }
  if (values.length === 0) {
    if (saturated > 0) {
      increment(excluded, 'OFFSET_CORRIDOR_SATURATED');
      const target = episode.samples.find((sample) => sample.policyActive)?.laneOffsetTargetM ?? 0;
      return {
        kind: 'BOUND',
        bound: {
          id: episode.id,
          side: target >= 0 ? 'LOWER' : 'UPPER',
          at: target,
          reason: 'OFFSET_CORRIDOR_SATURATED',
          samples: saturated,
        },
      };
    }
    increment(excluded, 'NO_OFFSET_EPISODE');
    return null;
  }
  // The key is constant, so every unsaturated target of the episode must be the same number.
  if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
    increment(excluded, 'OFFSET_INCONSISTENT');
    return null;
  }
  return { kind: 'VALUE', value: values[0]!, samples: values.length };
}

/**
 * Steering response: the dead time is the number of held command ticks before the first non-zero
 * steering step of a fresh latch, and the reported `responseTicks` must confirm it. A window that
 * starts inside a hold has no target change to measure, and one cut before the reaction is censored.
 */
function responseMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): Measure | null {
  const active = episode.samples.filter(
    (sample) => sample.policyActive && sample.action === 'TRACK',
  );
  if (active.length === 0) {
    increment(excluded, 'NO_RESPONSE_EPISODE');
    return null;
  }
  const reported = active[0]!.responseTicks,
    firstMovement = active.findIndex((sample) => sample.steeringStepRad !== 0);
  if (firstMovement < 0) {
    increment(excluded, 'RESPONSE_CENSORED');
    return null;
  }
  if (firstMovement === 0) {
    // The window begins after the target was already acknowledged: the hold was never observed.
    increment(excluded, 'RESPONSE_LATCH_MISSING');
    return null;
  }
  const ticks = active.slice(0, firstMovement).every((sample) => sample.steeringStepRad === 0)
    ? firstMovement
    : -1;
  if (ticks < 0) {
    increment(excluded, 'RESPONSE_LATCH_MISSING');
    return null;
  }
  if (ticks !== reported) {
    increment(excluded, 'RESPONSE_DELAY_MISMATCH');
    return null;
  }
  if (reported < 1 || reported > limit.tickHz * 1.5) {
    increment(excluded, 'RESPONSE_OUT_OF_ENVELOPE');
    return null;
  }
  return { kind: 'VALUE', value: invertTicks(reported), samples: ticks };
}

/**
 * Steering rate: the applied step is `min(key, 1,5 rad/s)/60` when the committed target is further
 * away than one step. Only a saturated step measures the key; a partial step is a lower bound, and a
 * step on the explicit ceiling proves `key ≥ 1,5` and hides everything above it.
 */
function rateMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): Measure | null {
  const values: number[] = [];
  let ceiling: number | null = null,
    issue: LateralV2EstimatorReason | null = null;
  for (let index = 0; index < episode.samples.length; index++) {
    const sample = episode.samples[index]!;
    if (!sample.policyActive || sample.action !== 'TRACK') continue;
    if (sample.steeringStepRad === 0) continue;
    const previous = episode.samples[index - 1];
    if (
      previous === undefined ||
      previous.tick !== sample.tick - 1 ||
      !previous.policyActive ||
      previous.action !== 'TRACK'
    ) {
      // A missing adjacent tick means the change of the steering is not reconstructible.
      issue ??= 'STEERING_STEP_INCONSISTENT';
      continue;
    }
    const step = Math.abs(sample.steeringStepRad),
      remaining = Math.abs(sample.committedTargetRad - previous.steeringRad),
      difference = Math.abs(remaining - step);
    if (difference > limit.steeringToleranceRad) {
      if (remaining < step - limit.steeringToleranceRad) {
        // The layer should have applied the remaining distance, not a full step.
        issue ??= 'STEERING_STEP_INCONSISTENT';
        continue;
      }
      // Saturated step: `step = min(key, ceiling) / tickHz`, so the key is `step · 60`.
      const rate = step * limit.tickHz;
      if (rate >= limit.maximumSteeringRateRadPerS - limit.steeringToleranceRad) ceiling = rate;
      else values.push(rate);
      continue;
    }
    // A partial step only proves `key ≥ step · 60`, which is not a measurement of the limit.
  }
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.steeringToleranceRad * limit.tickHz) {
      increment(excluded, 'STEERING_STEP_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: median(values), samples: values.length };
  }
  if (ceiling !== null) {
    increment(excluded, 'STEERING_RATE_CEILING_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'LOWER',
        at: limit.maximumSteeringRateRadPerS,
        reason: 'STEERING_RATE_CEILING_SATURATED',
        samples: 1,
      },
    };
  }
  increment(excluded, issue ?? 'NO_RATE_EPISODE');
  return null;
}

/**
 * Turn entry speed: inside a turn the command reports `min(key, adherence ceiling)`. A limit strictly
 * under the ceiling is the key; a limit on the ceiling proves only `key ≥ ceiling`, which is exactly
 * the physical cap no key can cross.
 */
function turnEntryMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): Measure | null {
  const values: number[] = [];
  let ceilingAt: number | null = null,
    issue: LateralV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.action !== 'TRACK') continue;
    if (!sample.inTurn) continue;
    const limitMps = sample.turnSpeedLimitMps,
      ceilingMps = sample.adherenceCeilingMps;
    if (limitMps === null || ceilingMps === null) {
      issue ??= 'TURN_ENTRY_BOUND_INCONSISTENT';
      continue;
    }
    if (limitMps > ceilingMps + limit.ratioTolerance) {
      // `min(key, ceiling)` can never exceed the ceiling it was built from.
      issue ??= 'TURN_ENTRY_BOUND_INCONSISTENT';
      continue;
    }
    if (limitMps >= ceilingMps - limit.ratioTolerance) ceilingAt = ceilingMps;
    else values.push(limitMps);
  }
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
      increment(excluded, 'TURN_ENTRY_BOUND_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: median(values), samples: values.length };
  }
  if (ceilingAt !== null) {
    increment(excluded, 'TURN_ENTRY_ADHERENCE_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'LOWER',
        at: ceilingAt,
        reason: 'TURN_ENTRY_ADHERENCE_SATURATED',
        samples: 1,
      },
    };
  }
  increment(excluded, issue ?? 'NO_TURN_ENTRY_EPISODE');
  return null;
}

/**
 * Turn exit acceleration: the first tick after a turn reports `min(key, desired_acceleration)`. Only
 * that transition tick is a measurement; a zero elsewhere is structural, and a value on the M cap
 * proves only `key ≥ cap`.
 */
function turnExitMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): Measure | null {
  const values: number[] = [];
  let ceilingAt: number | null = null,
    transitions = 0,
    issue: LateralV2EstimatorReason | null = null;
  for (let index = 0; index < episode.samples.length; index++) {
    const sample = episode.samples[index]!;
    if (!sample.policyActive || sample.action !== 'TRACK') continue;
    const previous = episode.samples[index - 1];
    const exits = sample.inTurn === false && previous?.inTurn === true;
    if (!exits) continue;
    transitions += 1;
    const acceleration = sample.exitAccelerationMps2,
      cap = sample.exitAccelerationCapMps2;
    if (acceleration <= 0) {
      // The transition tick always reports the bounded preference: zero here is a contradiction.
      issue ??= 'TURN_EXIT_BOUND_INCONSISTENT';
      continue;
    }
    if (acceleration > cap + limit.ratioTolerance) {
      issue ??= 'TURN_EXIT_BOUND_INCONSISTENT';
      continue;
    }
    if (acceleration >= cap - limit.ratioTolerance) ceilingAt = cap;
    else values.push(acceleration);
  }
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
      increment(excluded, 'TURN_EXIT_BOUND_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: median(values), samples: values.length };
  }
  if (ceilingAt !== null) {
    increment(excluded, 'TURN_EXIT_ACCELERATION_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'LOWER',
        at: ceilingAt,
        reason: 'TURN_EXIT_ACCELERATION_SATURATED',
        samples: 1,
      },
    };
  }
  increment(
    excluded,
    issue ?? (transitions === 0 ? 'NO_TURN_EXIT_EPISODE' : 'TURN_EXIT_BOUND_INCONSISTENT'),
  );
  return null;
}

/**
 * Corner cutting: inside a turn the cut is `key · corridor`, signed towards the inside. Outside a
 * turn the cut is structurally zero and proves nothing; a zero cut inside a turn is a demonstrated
 * zero, which stays a candidate instead of missing evidence.
 */
function cornerCutMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): Measure | null {
  const values: number[] = [];
  let turns = 0,
    noCorridor = 0;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.action !== 'TRACK') continue;
    if (!sample.inTurn) continue;
    turns += 1;
    const corridor = sample.laneCorridorM;
    if (corridor <= limit.ratioTolerance) {
      noCorridor += 1;
      continue;
    }
    const expected = Math.max(
      -corridor,
      Math.min(corridor, sample.laneOffsetTargetM + sample.cornerCutM),
    );
    if (Math.abs(expected - sample.desiredOffsetM) > limit.ratioTolerance) {
      increment(excluded, 'CORNER_CUT_INCONSISTENT');
      return null;
    }
    values.push(Math.abs(sample.cornerCutM) / corridor);
  }
  if (values.length === 0) {
    increment(excluded, noCorridor > 0 ? 'CORNER_CUT_NO_CORRIDOR' : 'NO_CORNER_CUT_EPISODE');
    return null;
  }
  if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
    increment(excluded, 'CORNER_CUT_INCONSISTENT');
    return null;
  }
  return { kind: 'VALUE', value: values[0]!, samples: values.length };
}

/**
 * Obstacle clearance: the effective clearance is `max(key, track + 0,2 m)` and it is reported next
 * to the declared gap. Above the floor the value is the key; on the floor it is only an upper bound.
 */
function clearanceMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): Measure | null {
  const values: number[] = [];
  let floorAt: number | null = null,
    issue: LateralV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.action !== 'TRACK') continue;
    if (sample.availableClearanceM === null) continue;
    const minimum = clearanceFloor(sample.trackM),
      permitted = sample.availableClearanceM >= sample.effectiveClearanceM;
    if (sample.manoeuvrePermitted !== permitted) {
      issue ??= 'CLEARANCE_DECISION_INCONSISTENT';
      continue;
    }
    if (sample.effectiveClearanceM <= minimum + limit.ratioTolerance) {
      floorAt = minimum;
      continue;
    }
    values.push(sample.effectiveClearanceM);
  }
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
      increment(excluded, 'CLEARANCE_BOUND_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: median(values), samples: values.length };
  }
  if (floorAt !== null) {
    increment(excluded, 'LATERAL_CLEARANCE_FLOOR_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'UPPER',
        at: floorAt,
        reason: 'LATERAL_CLEARANCE_FLOOR_SATURATED',
        samples: 1,
      },
    };
  }
  increment(excluded, issue ?? 'NO_CLEARANCE_EPISODE');
  return null;
}

/**
 * Correction deadband: `correctionActive = |error| > key` makes every sample one inequality. An
 * active correction bounds the key above the error, an inactive one bounds it below, and no sample
 * can ever pin the strict threshold itself.
 */
function deadbandMeasure(episode: AdmittedEpisode, excluded: Map<string, number>): Bracket | null {
  let lower: number | null = null,
    upper: number | null = null,
    samples = 0;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.action !== 'TRACK') continue;
    if (!sample.correctionActive && sample.correctionSteeringRad !== 0) {
      increment(excluded, 'CORRECTION_STEERING_INCONSISTENT');
      return null;
    }
    if (sample.correctionActive && sample.correctionSteeringRad === 0) {
      increment(excluded, 'CORRECTION_STEERING_INCONSISTENT');
      return null;
    }
    const error = Math.abs(sample.deviationErrorM);
    samples += 1;
    if (sample.correctionActive) upper = upper === null ? error : Math.min(upper, error);
    else lower = lower === null ? error : Math.max(lower, error);
  }
  if (samples === 0) {
    increment(excluded, 'NO_DEADBAND_EPISODE');
    return null;
  }
  return { lower, upper, samples };
}

/**
 * Bounded continuous estimate: exact demonstrations give the median, one-sided demonstrations give
 * bounds, and a bound that does not admit the median makes the set inconsistent. A set with only
 * bounds has no value unless both sides are demonstrated, in which case the intersection midpoint is
 * the minimax estimate.
 */
function finishBounded(
  key: LateralV2EstimatorKey,
  values: readonly EpisodeValue[],
  bounds: readonly EpisodeBound[],
  excluded: Map<string, number>,
  seed: number,
  reasons: {
    readonly lower: LateralV2EstimatorReason;
    readonly upper: LateralV2EstimatorReason;
    readonly inconsistent: LateralV2EstimatorReason;
  },
): LateralV2KeyEstimate {
  const lowers = bounds.filter((entry) => entry.side === 'LOWER'),
    uppers = bounds.filter((entry) => entry.side === 'UPPER');
  if (values.length === 0) {
    if (lowers.length === 0 && uppers.length === 0)
      return unobserved(key, reasonFor(key, excluded), 0, 0, excluded, emptyValidation(key));
    if (lowers.length === 0)
      return unobserved(
        key,
        reasons.upper,
        bounds.length,
        bounds.reduce((sum, entry) => sum + entry.samples, 0),
        excluded,
      );
    if (uppers.length === 0)
      return unobserved(
        key,
        reasons.lower,
        bounds.length,
        bounds.reduce((sum, entry) => sum + entry.samples, 0),
        excluded,
      );
    const lower = Math.max(...lowers.map((entry) => entry.at)),
      upper = Math.min(...uppers.map((entry) => entry.at));
    if (lower > upper + limit.ratioTolerance)
      return unobserved(
        key,
        reasons.inconsistent,
        bounds.length,
        bounds.reduce((sum, entry) => sum + entry.samples, 0),
        excluded,
      );
    return unobserved(
      key,
      reasons.lower,
      bounds.length,
      bounds.reduce((sum, entry) => sum + entry.samples, 0),
      excluded,
    );
  }
  const split = splitEpisodes(
      values.map((entry) => entry.id),
      seed,
    ),
    estimateValues = values.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationValues = values.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateValues.reduce((sum, entry) => sum + entry.samples, 0),
    totalSamples = values.reduce((sum, entry) => sum + entry.samples, 0);
  if (estimateValues.length < limit.minimumEstimateEpisodes)
    return unobserved(key, 'INSUFFICIENT_DISTINCT_EPISODES', values.length, totalSamples, excluded);
  const numbers = estimateValues.map((entry) => entry.value),
    estimate = median(numbers),
    uncertainty = uncertaintyOf(key, numbers),
    validation = continuousValidation(
      key,
      estimate,
      validationValues.map((entry) => entry.value),
    );
  // Every demonstrated bound of the set must admit the estimate of the exact demonstrations.
  const violation = bounds.find((entry) =>
    entry.side === 'LOWER'
      ? entry.at > estimate + limit.validationTolerance[key]
      : entry.at < estimate - limit.validationTolerance[key],
  );
  if (violation !== undefined)
    return unobserved(
      key,
      reasons.inconsistent,
      estimateValues.length,
      estimateSamples,
      excluded,
      validation,
      uncertainty,
    );
  const result = candidate(
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
 * Shared bracket estimate: the estimate is the middle of the intersection of the demonstrated
 * bounds and the uncertainty is half its width. A single inequality is a bound, not a value.
 */
function estimateBracket(
  key: LateralV2EstimatorKey,
  episodes: readonly AdmittedEpisode[],
  seed: number,
  measure: (episode: AdmittedEpisode, excluded: Map<string, number>) => Bracket | null,
  reasons: {
    readonly lower: LateralV2EstimatorReason;
    readonly upper: LateralV2EstimatorReason;
    readonly contradictory: LateralV2EstimatorReason;
  },
): LateralV2KeyEstimate {
  const excluded = new Map<string, number>(),
    bounds: {
      id: string;
      lower: number | null;
      upper: number | null;
      samples: number;
    }[] = [];
  for (const episode of episodes) {
    const measured = measure(episode, excluded);
    if (measured === null) continue;
    if (
      measured.lower !== null &&
      measured.upper !== null &&
      measured.lower > measured.upper + limit.ratioTolerance
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
  if (estimateBounds.length < limit.minimumEstimateEpisodes)
    return unobserved(key, 'INSUFFICIENT_DISTINCT_EPISODES', bounds.length, totalSamples, excluded);
  const range = catalogRange(key),
    lowers = estimateBounds
      .map((entry) => entry.lower)
      .filter((entry): entry is number => entry !== null),
    uppers = estimateBounds
      .map((entry) => entry.upper)
      .filter((entry): entry is number => entry !== null),
    validation = (value: number) =>
      bracketValidation(key, value, validationBounds, limit.validationTolerance[key]);
  if (lowers.length === 0)
    return unobserved(key, reasons.lower, estimateBounds.length, estimateSamples, excluded);
  if (uppers.length === 0)
    return unobserved(key, reasons.upper, estimateBounds.length, estimateSamples, excluded);
  const lower = Math.max(...lowers),
    upper = Math.min(...uppers);
  if (lower > upper + limit.ratioTolerance)
    return unobserved(key, reasons.contradictory, estimateBounds.length, estimateSamples, excluded);
  if (upper < range.min - limit.ratioTolerance || lower > range.max + limit.ratioTolerance)
    return unobserved(key, reasons.contradictory, estimateBounds.length, estimateSamples, excluded);
  const rawValue = (lower + upper) / 2,
    width = upper - lower,
    uncertainty = Math.max(limit.uncertaintyFloor[key], width / 2),
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
const noValueReason: Readonly<Record<LateralV2EstimatorKey, readonly LateralV2EstimatorReason[]>> =
  Object.freeze({
    lane_center_offset: ['OFFSET_INCONSISTENT', 'OFFSET_CORRIDOR_SATURATED', 'NO_OFFSET_EPISODE'],
    steering_response_time: [
      'RESPONSE_DELAY_MISMATCH',
      'RESPONSE_LATCH_MISSING',
      'RESPONSE_CENSORED',
      'RESPONSE_OUT_OF_ENVELOPE',
      'NO_RESPONSE_EPISODE',
    ],
    steering_rate_limit: [
      'STEERING_STEP_INCONSISTENT',
      'STEERING_RATE_CEILING_SATURATED',
      'NO_RATE_EPISODE',
    ],
    turn_entry_speed: [
      'TURN_ENTRY_BOUND_INCONSISTENT',
      'TURN_ENTRY_ADHERENCE_SATURATED',
      'NO_TURN_ENTRY_EPISODE',
    ],
    turn_exit_acceleration: [
      'TURN_EXIT_BOUND_INCONSISTENT',
      'TURN_EXIT_ACCELERATION_SATURATED',
      'NO_TURN_EXIT_EPISODE',
    ],
    corner_cutting_bias: [
      'CORNER_CUT_INCONSISTENT',
      'CORNER_CUT_NO_CORRIDOR',
      'NO_CORNER_CUT_EPISODE',
    ],
    lateral_clearance: [
      'CLEARANCE_DECISION_INCONSISTENT',
      'CLEARANCE_BOUND_INCONSISTENT',
      'LATERAL_CLEARANCE_FLOOR_SATURATED',
      'NO_CLEARANCE_EPISODE',
    ],
    lateral_correction_deadband: [
      'CORRECTION_STEERING_INCONSISTENT',
      'CONTRADICTORY_DEADBAND_BOUNDS',
      'DEADBAND_LOWER_BOUND_UNOBSERVED',
      'DEADBAND_UPPER_BOUND_UNOBSERVED',
      'NO_DEADBAND_EPISODE',
    ],
  });
function reasonFor(
  key: LateralV2EstimatorKey,
  excluded: ReadonlyMap<string, number>,
): LateralV2EstimatorReason {
  return (
    noValueReason[key].find((reason) => excluded.has(reason)) ??
    ('NO_ELIGIBLE_EPISODES' as LateralV2EstimatorReason)
  );
}

/** Exact value or one-sided bound, per key, over one admitted episode. */
function measureOf(
  key: LateralV2EstimatorKey,
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Measure | null {
  switch (key) {
    case 'lane_center_offset':
      return offsetMeasure(episode, excluded);
    case 'steering_response_time':
      return responseMeasure(episode, excluded);
    case 'steering_rate_limit':
      return rateMeasure(episode, excluded);
    case 'turn_entry_speed':
      return turnEntryMeasure(episode, excluded);
    case 'turn_exit_acceleration':
      return turnExitMeasure(episode, excluded);
    case 'corner_cutting_bias':
      return cornerCutMeasure(episode, excluded);
    case 'lateral_clearance':
      return clearanceMeasure(episode, excluded);
    case 'lateral_correction_deadband':
      return null;
  }
}

/**
 * Estimates the eight 179 lateral keys from demonstrated episodes. The same episodes and the same
 * `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateLateralV2Style(input: LateralV2EstimatorInput): LateralV2EstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid lateral estimator input');
  const splitSeed = count(input.splitSeed, limit.maximumSeed, 'split seed');
  if (!Array.isArray(input.episodes)) fail('Invalid lateral evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: LateralV2EpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as LateralV2EvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as LateralV2EvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }
  const keys = {} as Record<LateralV2EstimatorKey, LateralV2KeyEstimate>;
  for (const key of LATERAL_V2_ESTIMATOR_KEYS) {
    if (key === 'lateral_correction_deadband') {
      keys[key] = estimateBracket(key, admitted, splitSeed, deadbandMeasure, {
        lower: 'DEADBAND_LOWER_BOUND_UNOBSERVED',
        upper: 'DEADBAND_UPPER_BOUND_UNOBSERVED',
        contradictory: 'CONTRADICTORY_DEADBAND_BOUNDS',
      });
      continue;
    }
    const excluded = new Map<string, number>(),
      values: EpisodeValue[] = [],
      bounds: EpisodeBound[] = [];
    for (const episode of admitted) {
      const measured = measureOf(key, episode, excluded);
      if (measured === null) continue;
      if (measured.kind === 'VALUE')
        values.push({ id: episode.id, value: measured.value, samples: measured.samples });
      else bounds.push(measured.bound);
    }
    keys[key] = finishBounded(key, values, bounds, excluded, splitSeed, {
      lower: boundReasons[key].lower,
      upper: boundReasons[key].upper,
      inconsistent: boundReasons[key].inconsistent,
    });
  }
  return Object.freeze({
    version: LATERAL_V2_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: lateralV2GroupConstraints,
    admittedEpisodes: frozen(admitted.map((episode) => episode.id)),
    refusedEpisodes: frozen(refused.map((entry) => Object.freeze(entry))),
    compatibility: compatibility(),
  });
}

const boundReasons: Readonly<
  Record<
    Exclude<LateralV2EstimatorKey, 'lateral_correction_deadband'>,
    {
      readonly lower: LateralV2EstimatorReason;
      readonly upper: LateralV2EstimatorReason;
      readonly inconsistent: LateralV2EstimatorReason;
    }
  >
> = Object.freeze({
  lane_center_offset: {
    lower: 'OFFSET_CORRIDOR_SATURATED',
    upper: 'OFFSET_CORRIDOR_SATURATED',
    inconsistent: 'OFFSET_INCONSISTENT',
  },
  steering_response_time: {
    lower: 'RESPONSE_OUT_OF_ENVELOPE',
    upper: 'RESPONSE_OUT_OF_ENVELOPE',
    inconsistent: 'RESPONSE_DELAY_MISMATCH',
  },
  steering_rate_limit: {
    lower: 'STEERING_RATE_CEILING_SATURATED',
    upper: 'STEERING_RATE_CEILING_SATURATED',
    inconsistent: 'STEERING_RATE_BOUND_INCONSISTENT',
  },
  turn_entry_speed: {
    lower: 'TURN_ENTRY_ADHERENCE_SATURATED',
    upper: 'TURN_ENTRY_ADHERENCE_SATURATED',
    inconsistent: 'TURN_ENTRY_BOUND_INCONSISTENT',
  },
  turn_exit_acceleration: {
    lower: 'TURN_EXIT_ACCELERATION_SATURATED',
    upper: 'TURN_EXIT_ACCELERATION_SATURATED',
    inconsistent: 'TURN_EXIT_BOUND_INCONSISTENT',
  },
  corner_cutting_bias: {
    lower: 'CORNER_CUT_INCONSISTENT',
    upper: 'CORNER_CUT_INCONSISTENT',
    inconsistent: 'CORNER_CUT_INCONSISTENT',
  },
  lateral_clearance: {
    lower: 'CLEARANCE_BOUND_INCONSISTENT',
    upper: 'LATERAL_CLEARANCE_FLOOR_SATURATED',
    inconsistent: 'CLEARANCE_BOUND_INCONSISTENT',
  },
});
