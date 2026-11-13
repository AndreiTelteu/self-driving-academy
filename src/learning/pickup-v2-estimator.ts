import {
  PICKUP_POLICY_V2_KEYS,
  PICKUP_POLICY_V2_LIMITS,
  PICKUP_POLICY_V2_M_KEYS,
} from '../autonomy';
import type {
  PickupPolicyV2Action,
  PickupPolicyV2BlockedReason,
  PickupPolicyV2Key,
  PickupPolicyV2Reason,
  PickupServicePhase,
} from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 186 pickup estimator: estimates the eight 185 service and passenger-comfort keys from demonstrated
 * commands while keeping the service preference, the mandatory bay rules and the occupied state in
 * three separate channels.
 *
 * The estimator inverts the delivered `185-pickup-policy-v2` arithmetic instead of inventing a
 * second pickup model. Every value is measured from facts the delivered command already reports —
 * the mandatory bay envelope and its refusal, the approach ceiling and its cap flag, the curb band
 * the effective distance was clamped into, the precision window and its floor/cap flags, the
 * boarding dwell floor, and the two occupied scales with the M base and the cap that decided them —
 * plus the M keys of the 185 profile of the same tick. It never reads an R key of the profile. It is
 * candidate-only: it never publishes a profile, never writes to a store, never flips a 092
 * `implemented` flag and never changes the 185 semantics. It reads the key list, the 60 Hz tick
 * rate, the body clearance, the physical position tolerance and the boarding dwell directly from
 * 185, and the catalog ranges from the 092 registry, so measurement and decision use the same
 * constants.
 *
 * **The three kinds of value stay apart.**
 * 1. A service preference — `pickup_approach_speed`, `pickup_curb_distance`,
 *    `pickup_stop_precision`, `pickup_dwell_time`, `dropoff_approach_speed`,
 *    `dropoff_curb_distance` — is measured only inside a stop the mandatory rules allow. A refused
 *    stop is never a preference demonstration, even though the 185 command still reports a number
 *    on the blocked tick.
 * 2. A mandatory threshold — the authored zone, its TAXI access, its kind, the marked stop point and
 *    the bay band — is a fact of the tick. It bounds the preference and it hides the preference
 *    when it refuses the stop; it is never estimated.
 * 3. The occupied state — `occupied_acceleration_scale` and `occupied_lateral_accel_scale` — is
 *    measured only with a passenger aboard, from the ratio between the commanded acceleration and
 *    the delivered M base, and only while no comfort or adhesion cap decides the command.
 */
export const PICKUP_V2_ESTIMATOR_VERSION = '186-pickup-estimator-v1' as const;
export const PICKUP_V2_ESTIMATOR_KEYS = PICKUP_POLICY_V2_KEYS;
export type PickupV2EstimatorKey = PickupPolicyV2Key;
export type PickupV2EstimatorScenario =
  | 'PICKUP_APPROACH'
  | 'PICKUP_CURB'
  | 'PICKUP_PRECISION'
  | 'PICKUP_DWELL'
  | 'DROPOFF_APPROACH'
  | 'DROPOFF_CURB'
  | 'OCCUPIED_ACCELERATION'
  | 'OCCUPIED_LATERAL_ACCEL';

export const pickupV2EstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  // Mandatory rules that refuse the stop: they hide the preference instead of measuring it.
  'PREFERENCE_MASKED_BY_ZONE_KIND',
  'PREFERENCE_MASKED_BY_ZONE_ACCESS',
  'PREFERENCE_MASKED_BY_BEYOND_ZONE',
  'PREFERENCE_MASKED_BY_NARROW_BAY',
  'PREFERENCE_MASKED_BY_STOP_WINDOW',
  // Approach speed: the kinematic cap of the marked stop point.
  'NO_APPROACH_EPISODE',
  'APPROACH_FACT_MISSING',
  'APPROACH_BOUND_INCONSISTENT',
  'PICKUP_APPROACH_SPEED_SATURATED',
  'DROPOFF_APPROACH_SPEED_SATURATED',
  // Curb distance: the authored bay band is a two-sided clamp.
  'NO_CURB_EPISODE',
  'CURB_BOUND_INCONSISTENT',
  'CURB_DISTANCE_FLOOR_SATURATED',
  'CURB_DISTANCE_BAND_SATURATED',
  // Stop precision: a two-sided window, both sides ambiguous when they bind.
  'NO_PRECISION_EPISODE',
  'PRECISION_BOUND_INCONSISTENT',
  'PICKUP_STOP_PRECISION_FLOOR_SATURATED',
  'PICKUP_STOP_PRECISION_CAP_SATURATED',
  // Dwell: the boarding proof is a floor above the catalog minimum.
  'NO_DWELL_EPISODE',
  'DWELL_BOUND_INCONSISTENT',
  'PICKUP_DWELL_FLOOR_SATURATED',
  // Occupied scales: only with a passenger aboard and only under no cap.
  'NO_OCCUPIED_ACCELERATION_EPISODE',
  'NO_OCCUPIED_LATERAL_EPISODE',
  'PASSENGER_NOT_ABOARD',
  'SCALE_NOT_APPLIED',
  'OCCUPIED_SCALE_INCONSISTENT',
  'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED',
  'OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED',
] as const;
export type PickupV2EstimatorReason = (typeof pickupV2EstimatorReasons)[number];

export const pickupV2EpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type PickupV2EpisodeRefusal = (typeof pickupV2EpisodeRefusals)[number];

/**
 * The closed 185 reason vocabulary. The exhaustive record makes the mirror checkable by the
 * compiler: a new policy reason must be added here before it can become measurement evidence.
 */
const evidenceReasonSet: Readonly<Record<PickupPolicyV2Reason, true>> = Object.freeze({
  PICKUP_POLICY_V2: true,
  NO_AUTO_AUTHORITY: true,
  MISSING_PROFILE: true,
  FOREIGN_OR_STALE_OBSERVATION: true,
  NO_SERVICE: true,
  PASSENGER_LIMITS: true,
  ZONE_KIND_MISMATCH: true,
  ZONE_NOT_TAXI: true,
  STOP_BEYOND_ZONE: true,
  BAY_TOO_NARROW: true,
  STOP_WINDOW_TOO_TIGHT: true,
  APPROACH: true,
  HOLD: true,
  SERVICE_NOT_CONFIRMED: true,
  DWELL_PENDING: true,
  READY_TO_DEPART: true,
});
export const pickupV2EvidenceReasons: readonly PickupPolicyV2Reason[] = Object.freeze(
  Object.keys(evidenceReasonSet) as PickupPolicyV2Reason[],
);
/** The 185 reasons that mean the layer never applied the keys, i.e. no demonstration at all. */
const admissionRefusals: ReadonlySet<PickupPolicyV2Reason> = new Set<PickupPolicyV2Reason>([
  'PICKUP_POLICY_V2',
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'FOREIGN_OR_STALE_OBSERVATION',
]);
/** True only for a 185 tick that applied the keys; a refused input is never a demonstration. */
export function pickupV2PolicyActive(reason: PickupPolicyV2Reason): boolean {
  return !admissionRefusals.has(reason);
}
/** Which cap decided an occupied scale command, mirrored from the 185 command vocabulary. */
export type PickupScaleCap = 'NONE' | 'COMFORT' | 'ADHESION';

export const PICKUP_V2_ESTIMATOR_LIMITS = Object.freeze({
  version: PICKUP_V2_ESTIMATOR_VERSION,
  idCodeUnits: PICKUP_POLICY_V2_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  /** The 185 measurement cadence; the boarding floor is a whole number of these ticks. */
  tickHz: PICKUP_POLICY_V2_LIMITS.tickHz,
  maximumTick: PICKUP_POLICY_V2_LIMITS.maximumTimeS * PICKUP_POLICY_V2_LIMITS.tickHz,
  maximumSpeedMps: PICKUP_POLICY_V2_LIMITS.maximumSpeedMps,
  maximumDistanceM: PICKUP_POLICY_V2_LIMITS.maximumDistanceM,
  maximumTimeS: PICKUP_POLICY_V2_LIMITS.maximumTimeS,
  /** Authored bay depth and body clearance bounds accepted as evidence, m. */
  maximumBayDepthM: 100,
  /** The delivered body reserve of 185: the lower curb bound of every bay, m. */
  minimumCurbClearanceM: PICKUP_POLICY_V2_LIMITS.minimumCurbClearanceM,
  /** The delivered 062 position proof: the lower precision bound of every bay, m. */
  physicalPositionToleranceM: PICKUP_POLICY_V2_LIMITS.physicalPositionToleranceM,
  /** The delivered 062 boarding dwell, s. */
  boardingDwellS: PICKUP_POLICY_V2_LIMITS.boardingDwellS,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  /** Bound of the 086 occurrence ordinal; an occurrence is a counter, never a tick. */
  maximumOccurrence: 1_000_000,
  /** Tolerance of the report/validation arithmetic, never of the physics. */
  ratioTolerance: 1e-9,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloor: Object.freeze({
    pickup_approach_speed: 0.05,
    pickup_curb_distance: 0.05,
    pickup_stop_precision: 0.05,
    pickup_dwell_time: 0.15,
    dropoff_approach_speed: 0.05,
    dropoff_curb_distance: 0.05,
    occupied_acceleration_scale: 0.02,
    occupied_lateral_accel_scale: 0.02,
  }),
  maximumUncertainty: Object.freeze({
    pickup_approach_speed: 0.5,
    pickup_curb_distance: 0.15,
    pickup_stop_precision: 0.25,
    pickup_dwell_time: 0.5,
    dropoff_approach_speed: 0.5,
    dropoff_curb_distance: 0.15,
    occupied_acceleration_scale: 0.15,
    occupied_lateral_accel_scale: 0.12,
  }),
  validationTolerance: Object.freeze({
    pickup_approach_speed: 0.5,
    pickup_curb_distance: 0.15,
    pickup_stop_precision: 0.25,
    pickup_dwell_time: 0.5,
    dropoff_approach_speed: 0.5,
    dropoff_curb_distance: 0.15,
    occupied_acceleration_scale: 0.15,
    occupied_lateral_accel_scale: 0.12,
  }),
  retainedHistory: 0,
});

export const pickupV2EligibleScenarios: Readonly<
  Record<PickupV2EstimatorKey, PickupV2EstimatorScenario>
> = Object.freeze({
  pickup_approach_speed: 'PICKUP_APPROACH',
  pickup_curb_distance: 'PICKUP_CURB',
  pickup_stop_precision: 'PICKUP_PRECISION',
  pickup_dwell_time: 'PICKUP_DWELL',
  dropoff_approach_speed: 'DROPOFF_APPROACH',
  dropoff_curb_distance: 'DROPOFF_CURB',
  occupied_acceleration_scale: 'OCCUPIED_ACCELERATION',
  occupied_lateral_accel_scale: 'OCCUPIED_LATERAL_ACCEL',
});

export const pickupV2EligibleContexts: Readonly<Record<PickupV2EstimatorKey, string>> =
  Object.freeze({
    pickup_approach_speed:
      'un tick de fază PICKUP în care oprirea este permisă de pragurile obligatorii și în care ' +
      'plafonul cinematic nu leagă: comanda este `min(cheie, sqrt(2 · comfort_deceleration · ' +
      'distanță))`, deci viteza raportată este chiar cheia; o comandă pe plafon dovedește doar ' +
      '`cheie ≥ plafon`',
    pickup_curb_distance:
      'un tick de fază PICKUP cu oprirea permisă, în care distanța efectivă la bordură este ' +
      'strict în interiorul benzii autorate: `clamp(cheie, 0,15 m, adâncime − ecartament)` este ' +
      'identitatea, deci valoarea raportată este cheia; o valoare pe oricare margine este ' +
      'unilaterală',
    pickup_stop_precision:
      'un tick de fază PICKUP cu oprirea permisă, în care toleranța efectivă nu atinge nici podeaua ' +
      'fizică de 0,05 m, nici plafonul `min(punct, lungime − punct)`: valoarea este cheia, iar o ' +
      'valoare la plafon este ambiguă',
    pickup_dwell_time:
      'un tick de fază PICKUP cu oprirea permisă, în care staționarea efectivă este strict peste ' +
      'podeaua `max(3 s, M stop_dwell_time)`: valoarea raportată este cheia; pe podea, orice cheie ' +
      'sub ea produce aceeași durată',
    dropoff_approach_speed:
      'același plafon cinematic, pe un tick de fază DROPOFF cu oprirea permisă: viteza raportată ' +
      'sub plafon este a doua preferință de apropiere, distinctă de cea de pickup',
    dropoff_curb_distance:
      'aceeași bandă autorată a bordurii, pe un tick de fază DROPOFF cu oprirea permisă: ' +
      'distanța efectivă din interiorul benzii este a doua preferință de bordură',
    occupied_acceleration_scale:
      'un tick cu pasager la bord (061 `TO_DROPOFF`/`DROPOFF`) în care scara este aplicată și ' +
      'niciun plafon nu leagă: `comandat / desired_acceleration` este cheia; sub plafonul de ' +
      'confort sau de aderență, comanda dovedește doar `cheie ≥ plafon / bază`',
    occupied_lateral_accel_scale:
      'același tick cu pasager la bord, pe canalul lateral: `comandat / curve_lateral_accel` este ' +
      'cheia numai când `min(curve_lateral_accel, aderență)` nu taie cererea',
  });

export const pickupV2GroupConstraints = Object.freeze([
  Object.freeze({
    id: 'PICKUP_AND_DROPOFF_SHARE_ZONE_REFUSALS',
    keys: Object.freeze([
      'pickup_approach_speed',
      'pickup_curb_distance',
      'pickup_stop_precision',
      'pickup_dwell_time',
      'dropoff_approach_speed',
      'dropoff_curb_distance',
    ] as const),
    explanation:
      'Pickup și dropoff folosesc aceeași zonă autorată 032 și aceleași praguri obligatorii: un ' +
      'refuz de acces TAXI, de tip de zonă sau de poziție ascunde simultan preferințele ambelor ' +
      'faze. Refuzul nu este o măsurătoare a preferinței și nu se extrapolează dintr-o fază în ' +
      'cealaltă, chiar dacă 185 raportează un număr și pe tick-ul blocat.',
  }),
  Object.freeze({
    id: 'TAXI_REFUSAL_HIDES_ALL_FOUR_PICKUP_PREFERENCES',
    keys: Object.freeze([
      'pickup_approach_speed',
      'pickup_curb_distance',
      'pickup_stop_precision',
      'pickup_dwell_time',
    ] as const),
    explanation:
      'Un singur refuz obligatoriu — zona fără acces TAXI — lasă neobservate toate cele patru ' +
      'preferințe de pickup deodată: apropierea, bordura, precizia și staționarea sunt calculate ' +
      'de 185 pe același tick, dar oprirea nu are loc, deci niciuna nu este demonstrată. ' +
      'Estimatorul numără refuzul o dată per episod și per cheie, nu patru valori.',
  }),
  Object.freeze({
    id: 'PRECISION_AND_DWELL_BELONG_TO_PICKUP_PHASE',
    keys: Object.freeze(['pickup_stop_precision', 'pickup_dwell_time'] as const),
    explanation:
      'Precizia opririi și staționarea aparțin fazei de pickup: 185 nu le calculează pe faza de ' +
      'dropoff, iar catalogul 092 nu are chei echivalente pentru dropoff. Un set de dropoff nu ' +
      'poate estima niciodată aceste două chei, iar un set de pickup nu poate estima viteza și ' +
      'bordura de dropoff.',
  }),
  Object.freeze({
    id: 'APPROACH_CAP_DEPENDS_ON_COMFORT_AND_DISTANCE',
    keys: Object.freeze(['pickup_approach_speed', 'dropoff_approach_speed'] as const),
    explanation:
      'Viteza de apropiere este `min(cheie, sqrt(2 · comfort_deceleration · distanță))`: când ' +
      'plafonul cinematic leagă, comanda dovedește doar `cheie ≥ plafon`, iar plafonul depinde de ' +
      'cheia M `comfort_deceleration` și de distanța până la punctul marcat, nu de preferință. ' +
      'Cele două chei de apropiere împart formula, dar nu și faptul: fiecare are faza ei.',
  }),
  Object.freeze({
    id: 'CURB_BAND_CLAMP_SHARES_PICKUP_AND_DROPOFF',
    keys: Object.freeze(['pickup_curb_distance', 'dropoff_curb_distance'] as const),
    explanation:
      'Ambele preferințe de bordură sunt tăiate de aceeași bandă autorată ' +
      '`[0,15 m, adâncime − ecartament]`. Podeaua de 0,15 m ascunde capătul de jos al catalogului ' +
      '(0,1–0,15 m), iar plafonul depinde de adâncimea bay-ului și de ecartamentul clasei: pe ' +
      'bay-ul real de 3,00 m un sedan are plafonul 1,20 m, deci cheile 1,20–2 m nu sunt ' +
      'identificabile pe acea zonă.',
  }),
  Object.freeze({
    id: 'PRECISION_WINDOW_CLAMP_IS_AMBIGUOUS_AT_THE_CAP',
    keys: Object.freeze(['pickup_stop_precision'] as const),
    explanation:
      'Toleranța de oprire este `clamp(cheie, 0,05 m, min(punct, lungime − punct))`. Plafonul este ' +
      'semilățimea ferestrei marcate: când comanda raportează exact plafonul cu flagul `capped`, ' +
      'cheia poate fi orice valoare mai mare, deci estimatorul raportează saturația, nu plafonul. ' +
      'O cheie exact egală cu plafonul rămâne observabilă, pentru că 185 nu o marchează `capped`.',
  }),
  Object.freeze({
    id: 'DWELL_FLOOR_HIDES_SUB_FLOOR_KEYS',
    keys: Object.freeze(['pickup_dwell_time'] as const),
    explanation:
      'Staționarea efectivă este `max(cheie, 3 s, M stop_dwell_time)`. Podeaua de îmbarcare de 3 s ' +
      'acoperă banda 1–3 s a catalogului, iar un M `stop_dwell_time` mai mare mută podeaua și mai ' +
      'sus: pe podea, nicio valoare a cheii nu este identificabilă, iar durata raportată nu este ' +
      'preferința.',
  }),
  Object.freeze({
    id: 'OCCUPIED_SCALES_CAPPED_BY_COMFORT_AND_ADHESION',
    keys: Object.freeze(['occupied_acceleration_scale', 'occupied_lateral_accel_scale'] as const),
    explanation:
      'Ambele scări sunt `min(cheie · M, plafon de confort, aderență)`. Când oricare plafon leagă ' +
      '— `comfort_deceleration` sau `curve_lateral_accel` pentru longitudinal, respectiv ' +
      '`curve_lateral_accel` sau `grip · tireGripScale · g` pentru lateral — comanda este chiar ' +
      'plafonul, iar cheia nu este separabilă de el. Estimatorul păstrează doar marginea ' +
      '`cheie ≥ plafon / bază` și nu raportează niciodată plafonul ca estimare.',
  }),
  Object.freeze({
    id: 'OCCUPIED_SCALES_ONLY_WITH_PASSENGER',
    keys: Object.freeze(['occupied_acceleration_scale', 'occupied_lateral_accel_scale'] as const),
    explanation:
      'Scările sunt inerte fără pasager: pe `TO_PICKUP`, `PICKUP` sau `COMPLETED` comanda raportează ' +
      'accelerația M livrată, indiferent de cheie. Numai starea 061 `TO_DROPOFF`/`DROPOFF` produce ' +
      'o demonstrație, deci un set fără pasager la bord lasă ambele chei neobservate chiar dacă ' +
      'raportează valori numerice.',
  }),
  Object.freeze({
    id: 'PICKUP_KEYS_FROM_ONE_STOP',
    keys: PICKUP_POLICY_V2_KEYS,
    explanation:
      'Un tick de serviciu 185 raportează simultan apropierea, bordura, precizia și staționarea ' +
      'fazei lui, dar fiecare cheie are faptul ei: plafonul cinematic, banda bordurii, fereastra ' +
      'marcată și podeaua de îmbarcare. Un refuz obligatoriu le ascunde pe toate, iar un tick fără ' +
      'serviciu nu produce niciuna. Nicio cheie nu este dedusă din alta, iar scările cer un tick ' +
      'ocupat separat.',
  }),
]);

/** One tick of a pickup demonstration, exactly as the delivered 185 command reports it. */
export interface PickupV2EvidenceSample {
  readonly tick: number;
  /** True when `evaluatePickupPolicyV2` applied the keys, i.e. no refused input. */
  readonly policyActive: boolean;
  /** The 185 command reason of the tick. */
  readonly reason: PickupPolicyV2Reason;
  readonly action: PickupPolicyV2Action;
  /** The service phase of the tick; null when no service is in progress. */
  readonly phase: PickupServicePhase | null;
  /** True only when the mandatory bay rules allow the stop. */
  readonly stopAllowed: boolean;
  readonly blockedReason: PickupPolicyV2BlockedReason | null;
  /** The kinematic ceiling of the marked stop point, m/s; null without a service. */
  readonly approachFeasibleMps: number | null;
  /** The commanded approach speed, m/s; null without a service. */
  readonly approachCommandedMps: number | null;
  /** True when the preference was cut by the ceiling, so the command is a lower bound. */
  readonly approachCapped: boolean;
  /** Lower curb bound of the authored bay, m; null without a service. */
  readonly curbMinimumM: number | null;
  /** Upper curb bound of the authored bay, m; null without a service. */
  readonly curbMaximumM: number | null;
  /** The clamped curb distance, m; null without a service. */
  readonly curbEffectiveM: number | null;
  readonly curbClampedLow: boolean;
  readonly curbClampedHigh: boolean;
  /** The physical position proof, m; null outside the pickup phase. */
  readonly precisionFloorM: number | null;
  /** The largest tolerance inside the marked bay, m; null outside the pickup phase. */
  readonly precisionMaximumM: number | null;
  /** The clamped stop tolerance, m; null outside the pickup phase. */
  readonly precisionEffectiveM: number | null;
  readonly precisionFloored: boolean;
  readonly precisionCapped: boolean;
  /** `max(3 s, M stop_dwell_time)`, s; null outside the pickup phase. */
  readonly dwellMinimumS: number | null;
  /** The effective stationary time, s; null outside the pickup phase. */
  readonly dwellEffectiveS: number | null;
  /** True only for the 061 states that carry the passenger. */
  readonly aboard: boolean;
  readonly accelerationApplied: boolean;
  readonly accelerationBaseMps2: number;
  readonly accelerationComfortCapMps2: number;
  readonly accelerationAdhesionLimitMps2: number;
  readonly accelerationRequestedMps2: number;
  readonly accelerationCommandedMps2: number;
  readonly accelerationCappedBy: PickupScaleCap;
  readonly lateralApplied: boolean;
  readonly lateralBaseMps2: number;
  readonly lateralComfortCapMps2: number;
  readonly lateralAdhesionLimitMps2: number;
  readonly lateralRequestedMps2: number;
  readonly lateralCommandedMps2: number;
  readonly lateralCappedBy: PickupScaleCap;
}

export interface PickupV2EvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly PickupV2EvidenceSample[];
}

export interface PickupV2EstimatorInput {
  readonly episodes: readonly PickupV2EvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface PickupV2Validation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}

export interface PickupV2KeyEstimate {
  readonly key: PickupV2EstimatorKey;
  readonly scenario: PickupV2EstimatorScenario;
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
  readonly reason: PickupV2EstimatorReason | null;
  readonly validation: PickupV2Validation;
}

export interface PickupV2Compatibility {
  readonly policyVersion: '185-pickup-policy-v2';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  /** 185 M keys the estimate belongs to; they are read, never estimated. */
  readonly mReadByPolicy: readonly string[];
  readonly tickHz: number;
  readonly boardingDwellS: number;
  readonly minimumCurbClearanceM: number;
  readonly physicalPositionToleranceM: number;
  readonly catalogRanges: Readonly<
    Record<
      PickupV2EstimatorKey,
      { readonly min: number; readonly max: number; readonly unit: string }
    >
  >;
}

export interface PickupV2EstimatorResult {
  readonly version: typeof PICKUP_V2_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<PickupV2EstimatorKey, PickupV2KeyEstimate>>;
  readonly groupConstraints: typeof pickupV2GroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: PickupV2EpisodeRefusal;
  }[];
  readonly compatibility: PickupV2Compatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly policyActive: boolean;
  readonly reason: PickupPolicyV2Reason;
  readonly action: PickupPolicyV2Action;
  readonly phase: PickupServicePhase | null;
  readonly stopAllowed: boolean;
  readonly blockedReason: PickupPolicyV2BlockedReason | null;
  readonly approachFeasibleMps: number | null;
  readonly approachCommandedMps: number | null;
  readonly approachCapped: boolean;
  readonly curbMinimumM: number | null;
  readonly curbMaximumM: number | null;
  readonly curbEffectiveM: number | null;
  readonly curbClampedLow: boolean;
  readonly curbClampedHigh: boolean;
  readonly precisionFloorM: number | null;
  readonly precisionMaximumM: number | null;
  readonly precisionEffectiveM: number | null;
  readonly precisionFloored: boolean;
  readonly precisionCapped: boolean;
  readonly dwellMinimumS: number | null;
  readonly dwellEffectiveS: number | null;
  readonly aboard: boolean;
  readonly accelerationApplied: boolean;
  readonly accelerationBaseMps2: number;
  readonly accelerationComfortCapMps2: number;
  readonly accelerationAdhesionLimitMps2: number;
  readonly accelerationRequestedMps2: number;
  readonly accelerationCommandedMps2: number;
  readonly accelerationCappedBy: PickupScaleCap;
  readonly lateralApplied: boolean;
  readonly lateralBaseMps2: number;
  readonly lateralComfortCapMps2: number;
  readonly lateralAdhesionLimitMps2: number;
  readonly lateralRequestedMps2: number;
  readonly lateralCommandedMps2: number;
  readonly lateralCappedBy: PickupScaleCap;
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
  readonly reason: PickupV2EstimatorReason;
  readonly samples: number;
}

/** One episode's measurement: an exact value, a one-sided bound, or nothing usable. */
type Measure =
  | { readonly kind: 'VALUE'; readonly value: number; readonly samples: number }
  | { readonly kind: 'BOUND'; readonly bound: EpisodeBound };

function fail(message: string): never {
  throw new Error(message);
}
function identity(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PICKUP_V2_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid pickup evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid pickup evidence ${field}`);
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
    fail(`Invalid pickup evidence ${field}`);
  return value;
}
function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') fail(`Invalid pickup evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
const actions = ['CRUISE', 'APPROACH', 'HOLD', 'DEPART', 'GO_AROUND', 'UNAVAILABLE'] as const;
const phases = ['PICKUP', 'DROPOFF'] as const;
const blockedReasons = [
  'ZONE_KIND_MISMATCH',
  'ZONE_NOT_TAXI',
  'STOP_BEYOND_ZONE',
  'BAY_TOO_NARROW',
  'STOP_WINDOW_TOO_TIGHT',
] as const;
const scaleCaps = ['NONE', 'COMFORT', 'ADHESION'] as const;
const limit = PICKUP_V2_ESTIMATOR_LIMITS;

function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid pickup evidence sample');
  const sample = value as PickupV2EvidenceSample,
    tick = count(sample.tick, limit.maximumTick, 'sample tick'),
    action = actions.find((entry) => entry === sample.action) ?? fail('Invalid sample action'),
    phase =
      sample.phase === null
        ? null
        : (phases.find((entry) => entry === sample.phase) ?? fail('Invalid sample phase')),
    blocked =
      sample.blockedReason === null
        ? null
        : (blockedReasons.find((entry) => entry === sample.blockedReason) ??
          fail('Invalid sample blocked reason')),
    accelerationCappedBy =
      scaleCaps.find((entry) => entry === sample.accelerationCappedBy) ??
      fail('Invalid sample acceleration cap'),
    lateralCappedBy =
      scaleCaps.find((entry) => entry === sample.lateralCappedBy) ??
      fail('Invalid sample lateral cap');
  if (!(pickupV2EvidenceReasons as readonly string[]).includes(sample.reason))
    fail('Invalid pickup evidence sample reason');
  const policyActive = flag(sample.policyActive, 'sample policy flag'),
    stopAllowed = flag(sample.stopAllowed, 'sample stop flag'),
    aboard = flag(sample.aboard, 'sample occupied flag'),
    result: AdmittedSample = Object.freeze({
      tick,
      policyActive,
      reason: sample.reason,
      action,
      phase,
      stopAllowed,
      blockedReason: blocked,
      approachFeasibleMps: optionalFinite(
        sample.approachFeasibleMps,
        0,
        limit.maximumSpeedMps,
        'sample feasible approach',
      ),
      approachCommandedMps: optionalFinite(
        sample.approachCommandedMps,
        0,
        limit.maximumSpeedMps,
        'sample commanded approach',
      ),
      approachCapped: flag(sample.approachCapped, 'sample approach cap'),
      curbMinimumM: optionalFinite(
        sample.curbMinimumM,
        0,
        limit.maximumBayDepthM,
        'sample curb minimum',
      ),
      curbMaximumM: optionalFinite(
        sample.curbMaximumM,
        0,
        limit.maximumBayDepthM,
        'sample curb maximum',
      ),
      curbEffectiveM: optionalFinite(
        sample.curbEffectiveM,
        0,
        limit.maximumBayDepthM,
        'sample curb effective',
      ),
      curbClampedLow: flag(sample.curbClampedLow, 'sample curb low clamp'),
      curbClampedHigh: flag(sample.curbClampedHigh, 'sample curb high clamp'),
      precisionFloorM: optionalFinite(
        sample.precisionFloorM,
        0,
        limit.maximumDistanceM,
        'sample precision floor',
      ),
      precisionMaximumM: optionalFinite(
        sample.precisionMaximumM,
        0,
        limit.maximumDistanceM,
        'sample precision maximum',
      ),
      precisionEffectiveM: optionalFinite(
        sample.precisionEffectiveM,
        0,
        limit.maximumDistanceM,
        'sample precision effective',
      ),
      precisionFloored: flag(sample.precisionFloored, 'sample precision floor flag'),
      precisionCapped: flag(sample.precisionCapped, 'sample precision cap flag'),
      dwellMinimumS: optionalFinite(
        sample.dwellMinimumS,
        0,
        limit.maximumTimeS,
        'sample dwell minimum',
      ),
      dwellEffectiveS: optionalFinite(
        sample.dwellEffectiveS,
        0,
        limit.maximumTimeS,
        'sample dwell effective',
      ),
      aboard,
      accelerationApplied: flag(sample.accelerationApplied, 'sample acceleration flag'),
      accelerationBaseMps2: finite(
        sample.accelerationBaseMps2,
        0,
        limit.maximumSpeedMps,
        'sample acceleration base',
      ),
      accelerationComfortCapMps2: finite(
        sample.accelerationComfortCapMps2,
        0,
        limit.maximumSpeedMps,
        'sample acceleration comfort cap',
      ),
      accelerationAdhesionLimitMps2: finite(
        sample.accelerationAdhesionLimitMps2,
        0,
        limit.maximumSpeedMps,
        'sample acceleration adhesion limit',
      ),
      accelerationRequestedMps2: finite(
        sample.accelerationRequestedMps2,
        0,
        limit.maximumSpeedMps,
        'sample acceleration requested',
      ),
      accelerationCommandedMps2: finite(
        sample.accelerationCommandedMps2,
        0,
        limit.maximumSpeedMps,
        'sample acceleration commanded',
      ),
      accelerationCappedBy,
      lateralApplied: flag(sample.lateralApplied, 'sample lateral flag'),
      lateralBaseMps2: finite(
        sample.lateralBaseMps2,
        0,
        limit.maximumSpeedMps,
        'sample lateral base',
      ),
      lateralComfortCapMps2: finite(
        sample.lateralComfortCapMps2,
        0,
        limit.maximumSpeedMps,
        'sample lateral comfort cap',
      ),
      lateralAdhesionLimitMps2: finite(
        sample.lateralAdhesionLimitMps2,
        0,
        limit.maximumSpeedMps,
        'sample lateral adhesion limit',
      ),
      lateralRequestedMps2: finite(
        sample.lateralRequestedMps2,
        0,
        limit.maximumSpeedMps,
        'sample lateral requested',
      ),
      lateralCommandedMps2: finite(
        sample.lateralCommandedMps2,
        0,
        limit.maximumSpeedMps,
        'sample lateral commanded',
      ),
      lateralCappedBy,
    });
  // The caller-declared flag and the policy reason must describe the same tick.
  if (policyActive === admissionRefusals.has(result.reason))
    fail('Pickup evidence policy flag contradicts the command reason');
  // A blocked tick applied the keys but never demonstrated a preference. Without a service there is
  // no bay to allow or refuse, so the flag has no meaning and is not cross-checked.
  if (phase !== null && stopAllowed !== (blocked === null))
    fail('Pickup evidence stop flag contradicts the refusal');
  if (blocked !== null && (phase === null || !policyActive))
    fail('Pickup evidence refusal outside an active service');
  return result;
}

function admitEpisode(value: unknown): AdmittedEpisode | PickupV2EpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid pickup evidence episode');
  const episode = value as PickupV2EvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, limit.maximumOccurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid pickup evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid pickup evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid pickup evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched pickup evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Pickup evidence samples are not strictly ordered');
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
function catalogRange(key: PickupV2EstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function compatibility(): PickupV2Compatibility {
  return Object.freeze({
    policyVersion: PICKUP_POLICY_V2_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    mReadByPolicy: Object.freeze([...PICKUP_POLICY_V2_M_KEYS]),
    tickHz: limit.tickHz,
    boardingDwellS: limit.boardingDwellS,
    minimumCurbClearanceM: limit.minimumCurbClearanceM,
    physicalPositionToleranceM: limit.physicalPositionToleranceM,
    catalogRanges: Object.freeze(
      Object.fromEntries(PICKUP_V2_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)])) as Record<
        PickupV2EstimatorKey,
        { min: number; max: number; unit: string }
      >,
    ),
  });
}
function emptyValidation(key: PickupV2EstimatorKey): PickupV2Validation {
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
  key: PickupV2EstimatorKey,
  reason: PickupV2EstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: PickupV2Validation = emptyValidation(key),
  uncertainty: number | null = null,
): PickupV2KeyEstimate {
  return Object.freeze({
    key,
    scenario: pickupV2EligibleScenarios[key],
    unit: getParameterDefinition(key).unit,
    eligibleContext: pickupV2EligibleContexts[key],
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
  key: PickupV2EstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: PickupV2Validation,
): PickupV2KeyEstimate | PickupV2EstimatorReason {
  if (uncertainty > limit.maximumUncertainty[key]) return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    scenario: pickupV2EligibleScenarios[key],
    unit: range.unit,
    eligibleContext: pickupV2EligibleContexts[key],
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
  key: PickupV2EstimatorKey,
  estimate: number,
  values: readonly number[],
): PickupV2Validation {
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
function uncertaintyOf(key: PickupV2EstimatorKey, values: readonly number[]): number {
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

/** Counts a mandatory refusal once per episode, in the policy vocabulary and in the masked one. */
const maskedReason: Readonly<Record<PickupPolicyV2BlockedReason, PickupV2EstimatorReason>> =
  Object.freeze({
    ZONE_KIND_MISMATCH: 'PREFERENCE_MASKED_BY_ZONE_KIND',
    ZONE_NOT_TAXI: 'PREFERENCE_MASKED_BY_ZONE_ACCESS',
    STOP_BEYOND_ZONE: 'PREFERENCE_MASKED_BY_BEYOND_ZONE',
    BAY_TOO_NARROW: 'PREFERENCE_MASKED_BY_NARROW_BAY',
    STOP_WINDOW_TOO_TIGHT: 'PREFERENCE_MASKED_BY_STOP_WINDOW',
  });
function noteRefusal(
  excluded: Map<string, number>,
  refusal: PickupPolicyV2BlockedReason | null,
): void {
  if (refusal === null) return;
  increment(excluded, refusal);
  increment(excluded, maskedReason[refusal]);
}

/**
 * Approach speed: `min(cheie, sqrt(2 · comfort_deceleration · distanță))`. Only an uncapped command
 * is the key; a capped one proves `cheie ≥ plafon` and stays a bound, because the ceiling belongs to
 * the marked stop point and to the M comfort deceleration, not to the preference. A blocked stop
 * proves nothing at all, even though 185 still reports the number.
 */
function approachMeasure(
  key: PickupV2EstimatorKey,
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Measure | null {
  const phase: PickupServicePhase = key === 'pickup_approach_speed' ? 'PICKUP' : 'DROPOFF',
    saturation: PickupV2EstimatorReason =
      key === 'pickup_approach_speed'
        ? 'PICKUP_APPROACH_SPEED_SATURATED'
        : 'DROPOFF_APPROACH_SPEED_SATURATED';
  const values: number[] = [];
  let lower: number | null = null,
    capped = 0,
    seen = 0,
    refusal: PickupPolicyV2BlockedReason | null = null,
    issue: PickupV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.phase !== phase) continue;
    seen += 1;
    if (!sample.stopAllowed) {
      refusal ??= sample.blockedReason;
      continue;
    }
    const feasible = sample.approachFeasibleMps,
      commanded = sample.approachCommandedMps;
    if (feasible === null || commanded === null) {
      issue ??= 'APPROACH_FACT_MISSING';
      continue;
    }
    if (sample.approachCapped) {
      capped += 1;
      lower = lower === null ? feasible : Math.max(lower, feasible);
      continue;
    }
    if (commanded > feasible + limit.ratioTolerance) {
      // `min(cheie, plafon)` can never exceed the ceiling it was built from.
      issue ??= 'APPROACH_BOUND_INCONSISTENT';
      continue;
    }
    values.push(commanded);
  }
  noteRefusal(excluded, refusal);
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
      increment(excluded, 'APPROACH_BOUND_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: values[0]!, samples: values.length };
  }
  if (lower !== null) {
    increment(excluded, saturation);
    return {
      kind: 'BOUND',
      bound: { id: episode.id, side: 'LOWER', at: lower, reason: saturation, samples: capped },
    };
  }
  if (issue !== null) increment(excluded, issue);
  else if (refusal === null && seen > 0) increment(excluded, 'NO_APPROACH_EPISODE');
  return null;
}

/**
 * Curb distance: `clamp(cheie, 0,15 m, adâncime − ecartament)`. Inside the band the value is the
 * key, on the floor it is only an upper bound, on the authored ceiling only a lower bound; the band
 * belongs to the 032 bay and to the 023 track, never to the preference.
 */
function curbMeasure(
  key: PickupV2EstimatorKey,
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Measure | null {
  const phase: PickupServicePhase = key === 'pickup_curb_distance' ? 'PICKUP' : 'DROPOFF';
  const values: number[] = [];
  let floorAt: number | null = null,
    bandAt: number | null = null,
    seen = 0,
    refusal: PickupPolicyV2BlockedReason | null = null,
    issue: PickupV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.phase !== phase) continue;
    seen += 1;
    if (!sample.stopAllowed) {
      refusal ??= sample.blockedReason;
      continue;
    }
    const minimum = sample.curbMinimumM,
      maximum = sample.curbMaximumM,
      effective = sample.curbEffectiveM;
    if (minimum === null || maximum === null || effective === null) {
      issue ??= 'CURB_BOUND_INCONSISTENT';
      continue;
    }
    if (maximum + limit.ratioTolerance < minimum) {
      issue ??= 'CURB_BOUND_INCONSISTENT';
      continue;
    }
    if (sample.curbClampedLow) {
      floorAt = floorAt === null ? minimum : Math.min(floorAt, minimum);
      continue;
    }
    if (sample.curbClampedHigh) {
      bandAt = bandAt === null ? maximum : Math.max(bandAt, maximum);
      continue;
    }
    if (effective < minimum - limit.ratioTolerance || effective > maximum + limit.ratioTolerance) {
      issue ??= 'CURB_BOUND_INCONSISTENT';
      continue;
    }
    values.push(effective);
  }
  noteRefusal(excluded, refusal);
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
      increment(excluded, 'CURB_BOUND_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: values[0]!, samples: values.length };
  }
  if (floorAt !== null && bandAt !== null && bandAt > floorAt + limit.ratioTolerance) {
    // The same preference cannot sit below one floor and above another band ceiling.
    increment(excluded, 'CURB_BOUND_INCONSISTENT');
    return null;
  }
  if (bandAt !== null) {
    increment(excluded, 'CURB_DISTANCE_BAND_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'LOWER',
        at: bandAt,
        reason: 'CURB_DISTANCE_BAND_SATURATED',
        samples: 1,
      },
    };
  }
  if (floorAt !== null) {
    increment(excluded, 'CURB_DISTANCE_FLOOR_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'UPPER',
        at: floorAt,
        reason: 'CURB_DISTANCE_FLOOR_SATURATED',
        samples: 1,
      },
    };
  }
  if (issue !== null) increment(excluded, issue);
  else if (refusal === null && seen > 0) increment(excluded, 'NO_CURB_EPISODE');
  return null;
}

/**
 * Stop precision: `clamp(cheie, 0,05 m, min(punct, lungime − punct))`. A command at the cap is
 * ambiguous — the key may be any larger tolerance — so it is a saturated bound, never the cap as an
 * estimate. An exact equality with the cap is observable, because 185 only flags it when the key is
 * strictly larger.
 */
function precisionMeasure(
  key: PickupV2EstimatorKey,
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Measure | null {
  if (key !== 'pickup_stop_precision') return null;
  const values: number[] = [];
  let floorAt: number | null = null,
    capAt: number | null = null,
    seen = 0,
    refusal: PickupPolicyV2BlockedReason | null = null,
    issue: PickupV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.phase !== 'PICKUP') continue;
    seen += 1;
    if (!sample.stopAllowed) {
      refusal ??= sample.blockedReason;
      continue;
    }
    const floor = sample.precisionFloorM,
      maximum = sample.precisionMaximumM,
      effective = sample.precisionEffectiveM;
    if (floor === null || maximum === null || effective === null) {
      issue ??= 'PRECISION_BOUND_INCONSISTENT';
      continue;
    }
    if (maximum + limit.ratioTolerance < floor) {
      issue ??= 'PRECISION_BOUND_INCONSISTENT';
      continue;
    }
    if (sample.precisionFloored) {
      floorAt = floorAt === null ? floor : Math.max(floorAt, floor);
      continue;
    }
    if (sample.precisionCapped) {
      capAt = capAt === null ? maximum : Math.min(capAt, maximum);
      continue;
    }
    if (effective < floor - limit.ratioTolerance || effective > maximum + limit.ratioTolerance) {
      issue ??= 'PRECISION_BOUND_INCONSISTENT';
      continue;
    }
    values.push(effective);
  }
  noteRefusal(excluded, refusal);
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
      increment(excluded, 'PRECISION_BOUND_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: values[0]!, samples: values.length };
  }
  if (floorAt !== null && capAt !== null && capAt > floorAt + limit.ratioTolerance) {
    increment(excluded, 'PRECISION_BOUND_INCONSISTENT');
    return null;
  }
  if (capAt !== null) {
    increment(excluded, 'PICKUP_STOP_PRECISION_CAP_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'LOWER',
        at: capAt,
        reason: 'PICKUP_STOP_PRECISION_CAP_SATURATED',
        samples: 1,
      },
    };
  }
  if (floorAt !== null) {
    increment(excluded, 'PICKUP_STOP_PRECISION_FLOOR_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'UPPER',
        at: floorAt,
        reason: 'PICKUP_STOP_PRECISION_FLOOR_SATURATED',
        samples: 1,
      },
    };
  }
  if (issue !== null) increment(excluded, issue);
  else if (refusal === null && seen > 0) increment(excluded, 'NO_PRECISION_EPISODE');
  return null;
}

/**
 * Dwell: `max(cheie, 3 s, M stop_dwell_time)`. Above the floor the value is the key; on the floor
 * the command is the boarding proof, so it only bounds the key above and the catalog band below the
 * floor stays hidden.
 */
function dwellMeasure(
  key: PickupV2EstimatorKey,
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Measure | null {
  if (key !== 'pickup_dwell_time') return null;
  const values: number[] = [];
  let floorAt: number | null = null,
    seen = 0,
    refusal: PickupPolicyV2BlockedReason | null = null,
    issue: PickupV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive || sample.phase !== 'PICKUP') continue;
    seen += 1;
    if (!sample.stopAllowed) {
      refusal ??= sample.blockedReason;
      continue;
    }
    const minimum = sample.dwellMinimumS,
      effective = sample.dwellEffectiveS;
    if (minimum === null || effective === null) {
      issue ??= 'DWELL_BOUND_INCONSISTENT';
      continue;
    }
    if (effective > minimum + limit.ratioTolerance) {
      values.push(effective);
      continue;
    }
    if (effective < minimum - limit.ratioTolerance) {
      issue ??= 'DWELL_BOUND_INCONSISTENT';
      continue;
    }
    floorAt = floorAt === null ? minimum : Math.max(floorAt, minimum);
  }
  noteRefusal(excluded, refusal);
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
      increment(excluded, 'DWELL_BOUND_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: values[0]!, samples: values.length };
  }
  if (floorAt !== null) {
    increment(excluded, 'PICKUP_DWELL_FLOOR_SATURATED');
    return {
      kind: 'BOUND',
      bound: {
        id: episode.id,
        side: 'UPPER',
        at: floorAt,
        reason: 'PICKUP_DWELL_FLOOR_SATURATED',
        samples: 1,
      },
    };
  }
  if (issue !== null) increment(excluded, issue);
  else if (refusal === null && seen > 0) increment(excluded, 'NO_DWELL_EPISODE');
  return null;
}

/**
 * Occupied scale: `min(cheie · bază M, plafon de confort, aderență)`. Only with the passenger
 * aboard and only under no cap is `comandat / bază` the key. When a cap decides the command the
 * sample is a lower bound at `plafon / bază`; reporting the cap itself as the preference would
 * attribute a comfort or tyre constant to the player.
 */
function scaleMeasure(
  key: PickupV2EstimatorKey,
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Measure | null {
  const lateral = key === 'occupied_lateral_accel_scale',
    saturation: PickupV2EstimatorReason = lateral
      ? 'OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED'
      : 'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED',
    empty: PickupV2EstimatorReason = lateral
      ? 'NO_OCCUPIED_LATERAL_EPISODE'
      : 'NO_OCCUPIED_ACCELERATION_EPISODE';
  const values: number[] = [];
  let lower: number | null = null,
    capped = 0,
    seen = 0,
    notAboard = 0,
    notApplied = 0,
    issue: PickupV2EstimatorReason | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    seen += 1;
    if (!sample.aboard) {
      notAboard += 1;
      continue;
    }
    const applied = lateral ? sample.lateralApplied : sample.accelerationApplied;
    if (!applied) {
      notApplied += 1;
      continue;
    }
    const base = lateral ? sample.lateralBaseMps2 : sample.accelerationBaseMps2,
      comfort = lateral ? sample.lateralComfortCapMps2 : sample.accelerationComfortCapMps2,
      adhesion = lateral ? sample.lateralAdhesionLimitMps2 : sample.accelerationAdhesionLimitMps2,
      requested = lateral ? sample.lateralRequestedMps2 : sample.accelerationRequestedMps2,
      commanded = lateral ? sample.lateralCommandedMps2 : sample.accelerationCommandedMps2,
      cappedBy = lateral ? sample.lateralCappedBy : sample.accelerationCappedBy;
    if (base <= 0) {
      issue ??= 'OCCUPIED_SCALE_INCONSISTENT';
      continue;
    }
    const cap = Math.min(comfort, adhesion);
    if (cappedBy !== 'NONE') {
      capped += 1;
      const bound = cap / base;
      lower = lower === null ? bound : Math.max(lower, bound);
      continue;
    }
    if (
      requested > cap + limit.ratioTolerance ||
      Math.abs(requested - commanded) > limit.ratioTolerance * Math.max(1, requested)
    ) {
      // An uncapped command must be the requested preference, bounded by the same cap.
      issue ??= 'OCCUPIED_SCALE_INCONSISTENT';
      continue;
    }
    values.push(commanded / base);
  }
  if (values.length > 0) {
    if (Math.max(...values) - Math.min(...values) > limit.ratioTolerance) {
      increment(excluded, 'OCCUPIED_SCALE_INCONSISTENT');
      return null;
    }
    return { kind: 'VALUE', value: values[0]!, samples: values.length };
  }
  if (lower !== null) {
    increment(excluded, saturation);
    return {
      kind: 'BOUND',
      bound: { id: episode.id, side: 'LOWER', at: lower, reason: saturation, samples: capped },
    };
  }
  if (issue !== null) increment(excluded, issue);
  else if (notAboard > 0) increment(excluded, 'PASSENGER_NOT_ABOARD');
  else if (notApplied > 0) increment(excluded, 'SCALE_NOT_APPLIED');
  else if (seen > 0) increment(excluded, empty);
  return null;
}

function measureOf(
  key: PickupV2EstimatorKey,
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): Measure | null {
  switch (key) {
    case 'pickup_approach_speed':
    case 'dropoff_approach_speed':
      return approachMeasure(key, episode, excluded);
    case 'pickup_curb_distance':
    case 'dropoff_curb_distance':
      return curbMeasure(key, episode, excluded);
    case 'pickup_stop_precision':
      return precisionMeasure(key, episode, excluded);
    case 'pickup_dwell_time':
      return dwellMeasure(key, episode, excluded);
    case 'occupied_acceleration_scale':
    case 'occupied_lateral_accel_scale':
      return scaleMeasure(key, episode, excluded);
  }
}

/** Closed precedence: the reason names the most specific unusable fact of the set. */
const noValueReason: Readonly<Record<PickupV2EstimatorKey, readonly PickupV2EstimatorReason[]>> =
  Object.freeze({
    pickup_approach_speed: [
      'APPROACH_BOUND_INCONSISTENT',
      'PICKUP_APPROACH_SPEED_SATURATED',
      'PREFERENCE_MASKED_BY_ZONE_KIND',
      'PREFERENCE_MASKED_BY_ZONE_ACCESS',
      'PREFERENCE_MASKED_BY_BEYOND_ZONE',
      'PREFERENCE_MASKED_BY_NARROW_BAY',
      'PREFERENCE_MASKED_BY_STOP_WINDOW',
      'APPROACH_FACT_MISSING',
      'NO_APPROACH_EPISODE',
    ],
    pickup_curb_distance: [
      'CURB_BOUND_INCONSISTENT',
      'CURB_DISTANCE_FLOOR_SATURATED',
      'CURB_DISTANCE_BAND_SATURATED',
      'PREFERENCE_MASKED_BY_ZONE_KIND',
      'PREFERENCE_MASKED_BY_ZONE_ACCESS',
      'PREFERENCE_MASKED_BY_BEYOND_ZONE',
      'PREFERENCE_MASKED_BY_NARROW_BAY',
      'PREFERENCE_MASKED_BY_STOP_WINDOW',
      'NO_CURB_EPISODE',
    ],
    pickup_stop_precision: [
      'PRECISION_BOUND_INCONSISTENT',
      'PICKUP_STOP_PRECISION_CAP_SATURATED',
      'PICKUP_STOP_PRECISION_FLOOR_SATURATED',
      'PREFERENCE_MASKED_BY_ZONE_KIND',
      'PREFERENCE_MASKED_BY_ZONE_ACCESS',
      'PREFERENCE_MASKED_BY_BEYOND_ZONE',
      'PREFERENCE_MASKED_BY_NARROW_BAY',
      'PREFERENCE_MASKED_BY_STOP_WINDOW',
      'NO_PRECISION_EPISODE',
    ],
    pickup_dwell_time: [
      'DWELL_BOUND_INCONSISTENT',
      'PICKUP_DWELL_FLOOR_SATURATED',
      'PREFERENCE_MASKED_BY_ZONE_KIND',
      'PREFERENCE_MASKED_BY_ZONE_ACCESS',
      'PREFERENCE_MASKED_BY_BEYOND_ZONE',
      'PREFERENCE_MASKED_BY_NARROW_BAY',
      'PREFERENCE_MASKED_BY_STOP_WINDOW',
      'NO_DWELL_EPISODE',
    ],
    dropoff_approach_speed: [
      'APPROACH_BOUND_INCONSISTENT',
      'DROPOFF_APPROACH_SPEED_SATURATED',
      'PREFERENCE_MASKED_BY_ZONE_KIND',
      'PREFERENCE_MASKED_BY_ZONE_ACCESS',
      'PREFERENCE_MASKED_BY_BEYOND_ZONE',
      'PREFERENCE_MASKED_BY_NARROW_BAY',
      'PREFERENCE_MASKED_BY_STOP_WINDOW',
      'APPROACH_FACT_MISSING',
      'NO_APPROACH_EPISODE',
    ],
    dropoff_curb_distance: [
      'CURB_BOUND_INCONSISTENT',
      'CURB_DISTANCE_FLOOR_SATURATED',
      'CURB_DISTANCE_BAND_SATURATED',
      'PREFERENCE_MASKED_BY_ZONE_KIND',
      'PREFERENCE_MASKED_BY_ZONE_ACCESS',
      'PREFERENCE_MASKED_BY_BEYOND_ZONE',
      'PREFERENCE_MASKED_BY_NARROW_BAY',
      'PREFERENCE_MASKED_BY_STOP_WINDOW',
      'NO_CURB_EPISODE',
    ],
    occupied_acceleration_scale: [
      'OCCUPIED_SCALE_INCONSISTENT',
      'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED',
      'PASSENGER_NOT_ABOARD',
      'SCALE_NOT_APPLIED',
      'NO_OCCUPIED_ACCELERATION_EPISODE',
    ],
    occupied_lateral_accel_scale: [
      'OCCUPIED_SCALE_INCONSISTENT',
      'OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED',
      'PASSENGER_NOT_ABOARD',
      'SCALE_NOT_APPLIED',
      'NO_OCCUPIED_LATERAL_EPISODE',
    ],
  });
function reasonFor(
  key: PickupV2EstimatorKey,
  excluded: ReadonlyMap<string, number>,
): PickupV2EstimatorReason {
  return (
    noValueReason[key].find((reason) => excluded.has(reason)) ??
    ('NO_ELIGIBLE_EPISODES' as PickupV2EstimatorReason)
  );
}

const boundReasons: Readonly<
  Record<
    PickupV2EstimatorKey,
    {
      readonly lower: PickupV2EstimatorReason;
      readonly upper: PickupV2EstimatorReason;
      readonly inconsistent: PickupV2EstimatorReason;
    }
  >
> = Object.freeze({
  pickup_approach_speed: {
    lower: 'PICKUP_APPROACH_SPEED_SATURATED',
    upper: 'PICKUP_APPROACH_SPEED_SATURATED',
    inconsistent: 'APPROACH_BOUND_INCONSISTENT',
  },
  pickup_curb_distance: {
    lower: 'CURB_DISTANCE_BAND_SATURATED',
    upper: 'CURB_DISTANCE_FLOOR_SATURATED',
    inconsistent: 'CURB_BOUND_INCONSISTENT',
  },
  pickup_stop_precision: {
    lower: 'PICKUP_STOP_PRECISION_CAP_SATURATED',
    upper: 'PICKUP_STOP_PRECISION_FLOOR_SATURATED',
    inconsistent: 'PRECISION_BOUND_INCONSISTENT',
  },
  pickup_dwell_time: {
    lower: 'PICKUP_DWELL_FLOOR_SATURATED',
    upper: 'PICKUP_DWELL_FLOOR_SATURATED',
    inconsistent: 'DWELL_BOUND_INCONSISTENT',
  },
  dropoff_approach_speed: {
    lower: 'DROPOFF_APPROACH_SPEED_SATURATED',
    upper: 'DROPOFF_APPROACH_SPEED_SATURATED',
    inconsistent: 'APPROACH_BOUND_INCONSISTENT',
  },
  dropoff_curb_distance: {
    lower: 'CURB_DISTANCE_BAND_SATURATED',
    upper: 'CURB_DISTANCE_FLOOR_SATURATED',
    inconsistent: 'CURB_BOUND_INCONSISTENT',
  },
  occupied_acceleration_scale: {
    lower: 'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED',
    upper: 'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED',
    inconsistent: 'OCCUPIED_SCALE_INCONSISTENT',
  },
  occupied_lateral_accel_scale: {
    lower: 'OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED',
    upper: 'OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED',
    inconsistent: 'OCCUPIED_SCALE_INCONSISTENT',
  },
});

/**
 * Bounded continuous estimate: exact demonstrations give the median, one-sided demonstrations give
 * bounds, and a bound that does not admit the median makes the set inconsistent. A set with only
 * bounds has no value: a saturated cap is a constraint, never a preference.
 */
function finishBounded(
  key: PickupV2EstimatorKey,
  values: readonly EpisodeValue[],
  bounds: readonly EpisodeBound[],
  excluded: Map<string, number>,
  seed: number,
): PickupV2KeyEstimate {
  const reasons = boundReasons[key],
    lowers = bounds.filter((entry) => entry.side === 'LOWER'),
    uppers = bounds.filter((entry) => entry.side === 'UPPER'),
    boundSamples = bounds.reduce((sum, entry) => sum + entry.samples, 0);
  if (values.length === 0) {
    if (lowers.length === 0 && uppers.length === 0)
      return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
    if (lowers.length === 0)
      return unobserved(key, reasons.upper, bounds.length, boundSamples, excluded);
    if (uppers.length === 0)
      return unobserved(key, reasons.lower, bounds.length, boundSamples, excluded);
    const lower = Math.max(...lowers.map((entry) => entry.at)),
      upper = Math.min(...uppers.map((entry) => entry.at));
    if (lower > upper + limit.ratioTolerance)
      return unobserved(key, reasons.inconsistent, bounds.length, boundSamples, excluded);
    return unobserved(key, reasons.lower, bounds.length, boundSamples, excluded);
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
 * Estimates the eight 185 pickup and passenger-comfort keys from demonstrated episodes. The same
 * episodes and the same `splitSeed` always produce the same estimates, the same split and the same
 * refusals.
 */
export function estimatePickupV2Style(input: PickupV2EstimatorInput): PickupV2EstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid pickup estimator input');
  const splitSeed = count(input.splitSeed, limit.maximumSeed, 'split seed');
  if (!Array.isArray(input.episodes)) fail('Invalid pickup evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: PickupV2EpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as PickupV2EvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as PickupV2EvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }
  const keys = {} as Record<PickupV2EstimatorKey, PickupV2KeyEstimate>;
  for (const key of PICKUP_V2_ESTIMATOR_KEYS) {
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
    keys[key] = finishBounded(key, values, bounds, excluded, splitSeed);
  }
  return Object.freeze({
    version: PICKUP_V2_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: pickupV2GroupConstraints,
    admittedEpisodes: frozen(admitted.map((episode) => episode.id)),
    refusedEpisodes: frozen(refused.map((entry) => Object.freeze(entry))),
    compatibility: compatibility(),
  });
}
