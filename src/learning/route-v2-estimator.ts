import { ROUTE_POLICY_V2_KEYS, ROUTE_POLICY_V2_LIMITS, ROUTE_POLICY_V2_M_KEYS } from '../autonomy';
import type {
  RoutePolicyV2Action,
  RoutePolicyV2Key,
  RoutePolicyV2Reason,
  RoutePolicyV2RerouteDecision,
} from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 182 route estimator: estimates the eight 181 route and recovery keys from demonstrated decisions
 * while keeping the time preference, the distance preference, the three perceived costs, the reroute
 * patience, the U-turn willingness and the reverse recovery duration in eight separate contexts.
 *
 * The estimator inverts the delivered `181-route-policy-v2` arithmetic instead of inventing a second
 * router: every value is measured from facts the delivered command already reports (the admitted
 * alternatives with their delivered `styleTimeS`, length, turn/signal counts and congestion delay,
 * the reference time and length of the declared comparable set, the chosen candidate, the reroute
 * transition, the once-per-opportunity U-turn sample and the committed recovery duration). It never
 * reads the profile weights and never uses a score, because both are the quantities under
 * measurement. It is candidate-only: it never publishes a profile, never writes to a store, never
 * flips a 092 `implemented` flag and never changes the 181 semantics. It reads the key list, the
 * 60 Hz tick rate, the 2.5 s recovery floor and the 1e-12 share quantization directly from 181, and
 * the catalog ranges from the 092 registry, so measurement and decision use the same constants.
 *
 * **The five weights are shares, and only ratios are identifiable.** 181 divides each weight by the
 * sum of the five, `share_k = w_k / (w_t + w_d + w_r + w_s + w_c)`, so a profile written at any
 * scale produces bit identical coefficients. The policy therefore reveals only *ratios* between
 * shares, and the five raw weights are identifiable only up to one multiplicative constant: a whole
 * family of profiles produces exactly the same policy. The estimator reports the canonical
 * unit-sum representative of that family, `w_k := share_k`, which is inside every catalog range and
 * which 181 normalizes back to the same coefficient vector byte for byte. It never divides a raw
 * score back into a weight, because that inversion presumes a scale 181 removed.
 *
 * 1. `route_time_weight` (share) — a delivered decision between exactly two admitted alternatives
 *    that differ in style time and length while turns, signals and congestion are identical proves
 *    only the ratio `rho = share_t / share_d`: the chosen route satisfies `rho · dt + dd <= 0`.
 * 2. `route_distance_weight` (share) — the same pair, seen from the other side: the reciprocal of
 *    the same ratio. The two weights are the faces of one decision, never two independent values.
 * 3. `route_turn_penalty` (share) — a pair of equal free-flow speed, so the time and distance terms
 *    are collinear, that differs in length and in declared turns proves only
 *    `kappa_turn = share_r / (share_t + share_d)`; the sign of the choice without a length trade-off
 *    is ordinal and says nothing about magnitude.
 * 4. `route_signal_penalty` (share) — the same construction with declared signals.
 * 5. `route_congestion_penalty` (share) — the same construction with a declared congestion delay;
 *    the delay enters as `delay / referenceSeconds`, so the pair measures
 *    `kappa_congestion = share_c / (share_t + share_d)`.
 * 6. `reroute_patience` (s) — the WAIT → COMMIT transition between two admissible routes: the first
 *    elapsed tick that commits is `patienceTicks = max(1, ceil(key · 60))`, so `P` ticks admit
 *    `key ∈ ((P − 1)/60, P/60]`. A forced reroute never observes patience, because an inadmissible
 *    route is left at once.
 * 7. `u_turn_willingness` (probability) — one deterministic sample per permitted opportunity decides
 *    the admission (`sample < key`). An admitted opportunity proves `key > sample`, a refused one
 *    proves `key <= sample`, and the estimate is the intersection. A forbidden or undeclared U-turn
 *    draws no sample and says nothing: a constant refusal is demonstrated at the catalog floor 0.
 * 8. `reverse_recovery_duration` (s) — the committed duration is `max(key, 2.5 s)`, so only a value
 *    above the floor is the key; a recovery committed on the floor is an upper bound and leaves the
 *    key unobserved. A recovery without declared clearance commands nothing.
 */
export const ROUTE_V2_ESTIMATOR_VERSION = '182-route-estimator-v1' as const;
export const ROUTE_V2_ESTIMATOR_KEYS = ROUTE_POLICY_V2_KEYS;
export type RouteV2EstimatorKey = RoutePolicyV2Key;
export type RouteV2EstimatorScenario =
  | 'TIME_VERSUS_DISTANCE'
  | 'DISTANCE_VERSUS_TIME'
  | 'TURN_VERSUS_LENGTH'
  | 'SIGNAL_VERSUS_LENGTH'
  | 'CONGESTION_VERSUS_LENGTH'
  | 'KEEP_TO_SWITCH'
  | 'U_TURN_OPPORTUNITY'
  | 'RECOVERY_COMMIT';

export const routeV2EstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'WEIGHT_PAIR_NOT_COMPARABLE',
  'TIME_DISTANCE_PAIR_MISSING',
  'TIME_DISTANCE_PAIR_DOMINATED',
  'TIME_DISTANCE_LOWER_BOUND_UNOBSERVED',
  'TIME_DISTANCE_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_TIME_DISTANCE_BOUNDS',
  'TURN_TRADE_OFF_MISSING',
  'TURN_TRADE_OFF_DOMINATED',
  'TURN_TRADE_OFF_LOWER_BOUND_UNOBSERVED',
  'TURN_TRADE_OFF_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_TURN_BOUNDS',
  'SIGNAL_TRADE_OFF_MISSING',
  'SIGNAL_TRADE_OFF_DOMINATED',
  'SIGNAL_TRADE_OFF_LOWER_BOUND_UNOBSERVED',
  'SIGNAL_TRADE_OFF_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_SIGNAL_BOUNDS',
  'CONGESTION_TRADE_OFF_MISSING',
  'CONGESTION_TRADE_OFF_DOMINATED',
  'CONGESTION_TRADE_OFF_LOWER_BOUND_UNOBSERVED',
  'CONGESTION_TRADE_OFF_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_CONGESTION_BOUNDS',
  'SHARE_BUDGET_INCOMPLETE',
  'NO_PATIENCE_TRANSITION',
  'PATIENCE_LOWER_BOUND_UNOBSERVED',
  'PATIENCE_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_PATIENCE_BOUNDS',
  'PATIENCE_TRANSITION_INCONSISTENT',
  'NO_U_TURN_OPPORTUNITY',
  'U_TURN_PERMISSION_NOT_DECLARED',
  'U_TURN_SAMPLE_MISSING',
  'U_TURN_REFUSAL_BAND_TOO_WIDE',
  'CONTRADICTORY_U_TURN_BOUNDS',
  'NO_RECOVERY_COMMIT',
  'RECOVERY_BLOCKED_NO_COMMAND',
  'RECOVERY_FLOOR_SATURATED',
  'RECOVERY_BOUND_INCONSISTENT',
] as const;
export type RouteV2EstimatorReason = (typeof routeV2EstimatorReasons)[number];

export const routeV2EpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type RouteV2EpisodeRefusal = (typeof routeV2EpisodeRefusals)[number];

/**
 * The closed 181 reason vocabulary. The exhaustive record makes the mirror checkable by the
 * compiler: a new policy reason must be added here before it can become measurement evidence.
 */
const evidenceReasonSet: Readonly<Record<RoutePolicyV2Reason, true>> = Object.freeze({
  ROUTE_POLICY_V2: true,
  NO_AUTO_AUTHORITY: true,
  MISSING_PROFILE: true,
  FOREIGN_OR_STALE_OBSERVATION: true,
  NO_ALTERNATIVES: true,
  DUPLICATE_ALTERNATIVE: true,
  NO_ADMISSIBLE_ROUTE: true,
  ROUTE_KEPT: true,
  ROUTE_SELECTED: true,
  REROUTE_WAIT: true,
  REROUTE_COMMIT: true,
  FORCED_REROUTE: true,
  RECOVERY_BLOCKED: true,
  REVERSE_RECOVERY: true,
});
export const routeV2EvidenceReasons: readonly RoutePolicyV2Reason[] = Object.freeze(
  Object.keys(evidenceReasonSet) as RoutePolicyV2Reason[],
);
/** The 181 reasons that mean the layer never applied the keys, i.e. no demonstration at all. */
const admissionRefusals: ReadonlySet<RoutePolicyV2Reason> = new Set<RoutePolicyV2Reason>([
  'ROUTE_POLICY_V2',
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'FOREIGN_OR_STALE_OBSERVATION',
  'NO_ALTERNATIVES',
  'DUPLICATE_ALTERNATIVE',
  'NO_ADMISSIBLE_ROUTE',
]);
/** True only for a 181 tick that applied the keys; a refused input is never a demonstration. */
export function routeV2PolicyActive(reason: RoutePolicyV2Reason): boolean {
  return !admissionRefusals.has(reason);
}
/** The route actions that carry a scored comparison of the tick. */
const decisionActions: ReadonlySet<RoutePolicyV2Action> = new Set<RoutePolicyV2Action>([
  'ROUTE',
  'REROUTE_WAIT',
]);
const rerouteDecisions: readonly RoutePolicyV2RerouteDecision[] = Object.freeze([
  'KEPT',
  'WAIT',
  'COMMIT',
  'FORCED',
  'NONE',
]);
const actions: readonly RoutePolicyV2Action[] = Object.freeze([
  'ROUTE',
  'REROUTE_WAIT',
  'RECOVERY',
  'HOLD',
  'UNAVAILABLE',
]);
const permissions = ['PERMITTED', 'FORBIDDEN', 'UNKNOWN'] as const;

export const ROUTE_V2_ESTIMATOR_LIMITS = Object.freeze({
  version: ROUTE_V2_ESTIMATOR_VERSION,
  idCodeUnits: ROUTE_POLICY_V2_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  /** The 181 measurement cadence: a patience is always a whole number of these ticks. */
  tickHz: ROUTE_POLICY_V2_LIMITS.tickHz,
  maximumTick: ROUTE_POLICY_V2_LIMITS.maximumTimeS * ROUTE_POLICY_V2_LIMITS.tickHz,
  maximumTimeS: ROUTE_POLICY_V2_LIMITS.maximumTimeS,
  maximumLengthM: ROUTE_POLICY_V2_LIMITS.maximumLengthM,
  maximumCount: ROUTE_POLICY_V2_LIMITS.maximumCount,
  maximumAlternatives: ROUTE_POLICY_V2_LIMITS.maximumAlternatives,
  /** The explicit 181 floor of the committed recovery duration. */
  minimumReverseRecoveryS: ROUTE_POLICY_V2_LIMITS.minimumReverseRecoveryS,
  referenceFloor: ROUTE_POLICY_V2_LIMITS.referenceFloor,
  /** Bound of the 086 occurrence ordinal; an occurrence is a counter, never a tick. */
  maximumOccurrence: 1_000_000,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  /** Tolerance of the report/validation arithmetic, never of the physics. */
  ratioTolerance: 1e-9,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloor: Object.freeze({
    route_time_weight: 0.005,
    route_distance_weight: 0.005,
    route_turn_penalty: 0.005,
    route_signal_penalty: 0.005,
    route_congestion_penalty: 0.005,
    reroute_patience: 0.05,
    u_turn_willingness: 0.02,
    reverse_recovery_duration: 0.05,
  }),
  maximumUncertainty: Object.freeze({
    route_time_weight: 0.03,
    route_distance_weight: 0.03,
    route_turn_penalty: 0.04,
    route_signal_penalty: 0.06,
    route_congestion_penalty: 0.03,
    reroute_patience: 0.5,
    u_turn_willingness: 0.15,
    reverse_recovery_duration: 0.5,
  }),
  validationTolerance: Object.freeze({
    route_time_weight: 0.03,
    route_distance_weight: 0.03,
    route_turn_penalty: 0.04,
    route_signal_penalty: 0.06,
    route_congestion_penalty: 0.03,
    reroute_patience: 0.5,
    u_turn_willingness: 0.15,
    reverse_recovery_duration: 0.5,
  }),
  retainedHistory: 0,
});

export const routeV2EligibleScenarios: Readonly<
  Record<RouteV2EstimatorKey, RouteV2EstimatorScenario>
> = Object.freeze({
  route_time_weight: 'TIME_VERSUS_DISTANCE',
  route_distance_weight: 'DISTANCE_VERSUS_TIME',
  route_turn_penalty: 'TURN_VERSUS_LENGTH',
  route_signal_penalty: 'SIGNAL_VERSUS_LENGTH',
  route_congestion_penalty: 'CONGESTION_VERSUS_LENGTH',
  reroute_patience: 'KEEP_TO_SWITCH',
  u_turn_willingness: 'U_TURN_OPPORTUNITY',
  reverse_recovery_duration: 'RECOVERY_COMMIT',
});

export const routeV2EligibleContexts: Readonly<Record<RouteV2EstimatorKey, string>> = Object.freeze(
  {
    route_time_weight:
      'o decizie 181 reală între exact două alternative admise care diferă în timp de stil și ' +
      'lungime, cu virajele, semafoarele și congestia identice: alegerea dovedește doar raportul ' +
      '`share_timp / share_distanță`, niciodată o pondere absolută',
    route_distance_weight:
      'aceeași pereche comparabilă, citită de cealaltă parte: reciproca aceluiași raport, pentru ' +
      'că cele două ponderi sunt fețele aceleiași decizii',
    route_turn_penalty:
      'o pereche de aceeași viteză liberă (deci termenii de timp și distanță sunt coliniari) care ' +
      'diferă în lungime și în virajele declarate: alegerea dovedește doar ' +
      '`share_viraj / (share_timp + share_distanță)`; o pereche cu geometrie identică este ordinală',
    route_signal_penalty:
      'o pereche de aceeași viteză liberă care diferă în lungime și în semafoarele declarate: ' +
      'alegerea dovedește doar `share_semafor / (share_timp + share_distanță)`',
    route_congestion_penalty:
      'o pereche de aceeași viteză liberă care diferă în lungime și în întârzierea de congestie ' +
      'declarată: alegerea dovedește doar `share_congestie / (share_timp + share_distanță)`',
    reroute_patience:
      'tranziția reală WAIT → COMMIT între două rute admise: primul tick scurs care commitează ' +
      'este `max(1, ceil(cheie · 60))`, deci `P` tick-uri admit `cheie ∈ ((P − 1)/60, P/60]`',
    u_turn_willingness:
      'o oportunitate cu întoarcerea declarată permisă, în care 181 a extras eșantionul ' +
      'determinist: admiterea dovedește `cheie > eșantion`, refuzul dovedește ' +
      '`cheie ≤ eșantion`; o întoarcere interzisă sau nedeclarată nu trage eșantion',
    reverse_recovery_duration:
      'o recuperare cerută și commitată cu spațiul din spate declarat liber: durata commitată este ' +
      '`max(cheie, 2,5 s)`, deci peste podea valoarea este chiar cheia, iar pe podea este doar o ' +
      'margine superioară',
  },
);

export const routeV2GroupConstraints = Object.freeze([
  Object.freeze({
    id: 'SHARE_SCALE_UNIDENTIFIABLE',
    keys: Object.freeze([
      'route_time_weight',
      'route_distance_weight',
      'route_turn_penalty',
      'route_signal_penalty',
      'route_congestion_penalty',
    ] as const),
    explanation:
      '181 împarte fiecare pondere la suma celor cinci, `share_k = w_k / Σw`, cuantizat la 1e-12, ' +
      'deci orice profil scris la altă scară produce exact aceiași coeficienți și aceeași politică. ' +
      'Din comportament sunt identificabile doar rapoarte între cote, niciodată cele cinci ponderi ' +
      'absolute: familia `λ · w` dă aceeași politică pentru orice `λ > 0`. Estimatorul raportează ' +
      'reprezentantul canonic cu sumă 1, `w_k := share_k`, care este în intervalul fiecărei chei și ' +
      'pe care 181 îl normalizează înapoi la exact aceiași coeficienți; nu inversează niciodată un ' +
      'scor brut într-o pondere, pentru că acea inversare presupune o scală pe care 181 a eliminat-o.',
  }),
  Object.freeze({
    id: 'TIME_AND_DISTANCE_SHARE_ONE_TRADE_OFF',
    keys: Object.freeze(['route_time_weight', 'route_distance_weight'] as const),
    explanation:
      'Ponderea timpului și ponderea distanței sunt fețele aceleiași decizii: o singură pereche în ' +
      'care timpul și distanța se opun dovedește raportul `rho = share_timp / share_distanță`, iar ' +
      'cealaltă cheie este reciproca lui. Pe o pereche de aceeași viteză liberă timpul de stil și ' +
      'lungimea sunt coliniari, deci perechea nu separă deloc cele două ponderi; ele nu pot fi ' +
      'estimate independent una de alta din aceeași alegere.',
  }),
  Object.freeze({
    id: 'SHARE_BUDGET_COUPLES_THE_FIVE_WEIGHTS',
    keys: Object.freeze([
      'route_turn_penalty',
      'route_signal_penalty',
      'route_congestion_penalty',
    ] as const),
    explanation:
      'Cota unei penalizări este `κ / (1 + κ_viraj + κ_semafor + κ_congestie)`, iar cotele timpului ' +
      'și distanței împart numitorul `(1 + ρ) · (1 + Σκ)`: o penalizare demonstrată doar pe o ' +
      'singură parte lasă toate cele cinci cote neidentificabile, pentru că numitorul comun nu poate ' +
      'fi format. Asimetria reală este cealaltă: ρ cenzat lasă neobservate doar timpul și distanța, ' +
      'în timp ce cele trei penalizări rămân identificabile din perechile lor de aceeași viteză.',
  }),
  Object.freeze({
    id: 'PENALTY_MAGNITUDE_NEEDS_A_LENGTH_TRADE_OFF',
    keys: Object.freeze(['route_turn_penalty', 'route_signal_penalty'] as const),
    explanation:
      'O pereche cu geometrie identică în care doar numărul de viraje sau de semafoare diferă este ' +
      'pur ordinală: pentru orice penalizare pozitivă câștigă aceeași alternativă, iar o penalizare ' +
      'zero este departajată după id. Mărimea penalizării este observabilă numai când numărătoarea ' +
      'se opune lungimii, adică atunci când șoferul acceptă un ocol declarat ca să evite un viraj ' +
      'sau un semafor.',
  }),
  Object.freeze({
    id: 'U_TURN_PERMISSION_SHADOWS_WILLINGNESS',
    keys: Object.freeze(['u_turn_willingness'] as const),
    explanation:
      'Cu întoarcerea interzisă (`FORBIDDEN`) sau nedeclarată (`UNKNOWN`), 181 nu extrage niciun ' +
      'eșantion și nu admite niciodată alternativa cu U, la orice valoare a cheii: o asemenea ' +
      'secvență nu spune nimic despre disponibilitate și lasă cheia neobservată.',
  }),
  Object.freeze({
    id: 'RECOVERY_FLOOR_HIDES_SHORT_DURATIONS',
    keys: Object.freeze(['reverse_recovery_duration'] as const),
    explanation:
      'Durata commitată este `max(cheie, 2,5 s)`, derivată din 3 m la 1,2 m/s, deci fiecare cheie ' +
      'din banda 0–2,5 s a catalogului produce aceeași manevră de 150 de tick-uri și 3 m: o ' +
      'recuperare commitată pe podea dovedește doar `cheie ≤ 2,5 s` și nu devine valoare.',
  }),
  Object.freeze({
    id: 'PATIENCE_ONLY_BETWEEN_ADMISSIBLE_ROUTES',
    keys: Object.freeze(['reroute_patience'] as const),
    explanation:
      'Răbdarea guvernează numai schimbarea între două rute admise: o rută curentă care nu mai ' +
      'este admisă este părăsită imediat (`FORCED_REROUTE`), iar o rută curentă optimă este ținută ' +
      '(`KEPT`). Nicio comandă forțată și nicio primă decizie fără rută curentă nu observă cheia.',
  }),
  Object.freeze({
    id: 'ROUTE_KEYS_FROM_ONE_DECISION',
    keys: ROUTE_POLICY_V2_KEYS,
    explanation:
      'Cele opt chei pot apărea în aceeași călătorie, dar nu din același fapt: o decizie 181 oferă ' +
      'cel mult o pereche de alternative punctată, o tranziție de răbdare, un eșantion de U sau o ' +
      'recuperare commitată. Un set cu un singur tip de demonstrație lasă celelalte chei ' +
      'neobservate, iar estimatorul nu deduce niciodată o cheie din alta.',
  }),
]);

/** One route of a 181 decision, exactly as the delivered command reports it. */
export interface RouteV2EvidenceRoute {
  readonly id: string;
  readonly lengthM: number;
  readonly travelTimeS: number;
  /** `length / (limit + M delta)`, clamped to the policy speed range. */
  readonly styleTimeS: number;
  readonly turns: number;
  readonly signals: number;
  readonly congestionDelayS: number;
  readonly uTurn: boolean;
  readonly admitted: boolean;
}
/**
 * One tick of a route demonstration, exactly as the delivered 181 command reports it. The score and
 * the profile weights are deliberately absent: they are the quantities under measurement.
 */
export interface RouteV2EvidenceSample {
  readonly tick: number;
  /** True when `evaluateRoutePolicyV2` applied the keys, i.e. no refused input. */
  readonly policyActive: boolean;
  /** The 181 command reason of the tick. */
  readonly reason: RoutePolicyV2Reason;
  readonly action: RoutePolicyV2Action;
  /** Reference time of the declared comparable set, s; 0 when the command was refused. */
  readonly referenceSeconds: number;
  /** Reference length of the declared comparable set, m; 0 when the command was refused. */
  readonly referenceMetres: number;
  readonly currentRouteId: string | null;
  /** The best admitted alternative, independent of the patience gate. */
  readonly candidateRouteId: string | null;
  readonly selectedRouteId: string | null;
  readonly reroute: {
    readonly decision: RoutePolicyV2RerouteDecision;
    readonly elapsedTicks: number | null;
    readonly patienceTicks: number | null;
    readonly remainingTicks: number | null;
  };
  readonly uTurn: {
    readonly permission: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN' | null;
    readonly sample: number | null;
    readonly admitted: boolean;
  };
  readonly recovery: {
    readonly required: boolean;
    readonly reverseClear: boolean;
    readonly committed: boolean;
    readonly durationS: number | null;
    readonly floored: boolean;
  };
  readonly routes: readonly RouteV2EvidenceRoute[];
}

export interface RouteV2EvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly RouteV2EvidenceSample[];
}

export interface RouteV2EstimatorInput {
  readonly episodes: readonly RouteV2EvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface RouteV2Validation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}

export interface RouteV2KeyEstimate {
  readonly key: RouteV2EstimatorKey;
  readonly scenario: RouteV2EstimatorScenario;
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
  readonly reason: RouteV2EstimatorReason | null;
  readonly validation: RouteV2Validation;
}

/** The identified coefficients of the five weights: the only quantities behaviour can reveal. */
export interface RouteV2ShareCoefficients {
  /** `share_time / share_distance`. */
  readonly rho: number;
  /** `share_turn / (share_time + share_distance)`. */
  readonly kappaTurn: number;
  /** `share_signal / (share_time + share_distance)`. */
  readonly kappaSignal: number;
  /** `share_congestion / (share_time + share_distance)`. */
  readonly kappaCongestion: number;
}

export interface RouteV2Compatibility {
  readonly policyVersion: '181-route-policy-v2';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  /** 181 M keys the layer reads; they are never estimated here. */
  readonly mReadByPolicy: readonly string[];
  readonly tickHz: number;
  readonly minimumReverseRecoveryS: number;
  /** What the estimator reports for each key, so a share is never read as an absolute weight. */
  readonly reportedQuantity: Readonly<Record<RouteV2EstimatorKey, string>>;
  readonly catalogRanges: Readonly<
    Record<
      RouteV2EstimatorKey,
      { readonly min: number; readonly max: number; readonly unit: string }
    >
  >;
}

export interface RouteV2EstimatorResult {
  readonly version: typeof ROUTE_V2_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<RouteV2EstimatorKey, RouteV2KeyEstimate>>;
  /** The demonstrated share coefficients; null entries are not identifiable. */
  readonly coefficients: {
    readonly rho: number | null;
    readonly kappaTurn: number | null;
    readonly kappaSignal: number | null;
    readonly kappaCongestion: number | null;
  };
  /** The unit-sum representative the five weight estimates report, or null. */
  readonly normalizedShares: Readonly<Record<string, number>> | null;
  readonly groupConstraints: typeof routeV2GroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: RouteV2EpisodeRefusal;
  }[];
  /** The one deterministic assignment every key shares: no episode is on both sides. */
  readonly split: readonly {
    readonly episodeId: string;
    readonly side: 'ESTIMATE' | 'VALIDATION';
  }[];
  readonly compatibility: RouteV2Compatibility;
}

interface AdmittedRoute {
  readonly id: string;
  readonly lengthM: number;
  readonly travelTimeS: number;
  readonly styleTimeS: number;
  readonly turns: number;
  readonly signals: number;
  readonly congestionDelayS: number;
  readonly uTurn: boolean;
  readonly admitted: boolean;
}

interface AdmittedSample {
  readonly tick: number;
  readonly policyActive: boolean;
  readonly reason: RoutePolicyV2Reason;
  readonly action: RoutePolicyV2Action;
  readonly referenceSeconds: number;
  readonly referenceMetres: number;
  readonly currentRouteId: string | null;
  readonly candidateRouteId: string | null;
  readonly selectedRouteId: string | null;
  readonly rerouteDecision: RoutePolicyV2RerouteDecision;
  readonly elapsedTicks: number | null;
  readonly patienceTicks: number | null;
  readonly remainingTicks: number | null;
  readonly uTurnPermission: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN' | null;
  readonly uTurnSample: number | null;
  readonly uTurnAdmitted: boolean;
  readonly recoveryRequired: boolean;
  readonly recoveryReverseClear: boolean;
  readonly recoveryCommitted: boolean;
  readonly recoveryDurationS: number | null;
  readonly recoveryFloored: boolean;
  readonly routes: readonly AdmittedRoute[];
}

interface AdmittedEpisode {
  readonly id: string;
  readonly samples: readonly AdmittedSample[];
}

/** One demonstrated inequality on a coefficient, or an exact value, per episode. */
interface EpisodeBand {
  readonly id: string;
  readonly lower: number | null;
  readonly upper: number | null;
  readonly samples: number;
}

interface BandSummary {
  readonly lower: number | null;
  readonly upper: number | null;
  readonly episodes: number;
  readonly samples: number;
}

interface PairFacts {
  readonly chosen: AdmittedRoute;
  readonly other: AdmittedRoute;
  readonly dTime: number;
  readonly dDistance: number;
  readonly dTurn: number;
  readonly dSignal: number;
  readonly dCongestion: number;
}

type CoefficientName = 'rho' | 'kappaTurn' | 'kappaSignal' | 'kappaCongestion';

interface CoefficientSpec {
  readonly coefficient: CoefficientName;
  readonly missing: RouteV2EstimatorReason;
  readonly dominated: RouteV2EstimatorReason;
  readonly lower: RouteV2EstimatorReason;
  readonly upper: RouteV2EstimatorReason;
  readonly contradictory: RouteV2EstimatorReason;
  /** The `(A, B)` of `x · A + B <= 0` for the chosen alternative of a comparable pair. */
  readonly equation: (pair: PairFacts) => { readonly a: number; readonly b: number } | null;
}

function fail(message: string): never {
  throw new Error(message);
}
function identity(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ROUTE_V2_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid route evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid route evidence ${field}`);
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
function optionalIdentity(value: unknown, field: string): string | null {
  return value === null ? null : identity(value, field);
}
function count(value: unknown, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum)
    fail(`Invalid route evidence ${field}`);
  return value;
}
function optionalCount(value: unknown, maximum: number, field: string): number | null {
  return value === null ? null : count(value, maximum, field);
}
function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') fail(`Invalid route evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
const limit = ROUTE_V2_ESTIMATOR_LIMITS;

function admitRoute(value: unknown): AdmittedRoute {
  if (!value || typeof value !== 'object') fail('Invalid route evidence route');
  const route = value as RouteV2EvidenceRoute,
    turns = count(route.turns, limit.maximumCount, 'route turns'),
    signals = count(route.signals, limit.maximumCount, 'route signals');
  return Object.freeze({
    id: identity(route.id, 'route id'),
    lengthM: finite(route.lengthM, 0, limit.maximumLengthM, 'route length'),
    travelTimeS: finite(route.travelTimeS, 0, limit.maximumTimeS, 'route travel time'),
    styleTimeS: finite(route.styleTimeS, 0, limit.maximumTimeS, 'route style time'),
    turns,
    signals,
    congestionDelayS: finite(
      route.congestionDelayS,
      0,
      limit.maximumTimeS,
      'route congestion delay',
    ),
    uTurn: flag(route.uTurn, 'route U-turn flag'),
    admitted: flag(route.admitted, 'route admitted flag'),
  });
}
function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid route evidence sample');
  const sample = value as RouteV2EvidenceSample,
    reroute = sample.reroute,
    uTurn = sample.uTurn,
    recovery = sample.recovery;
  if (!reroute || typeof reroute !== 'object') fail('Invalid route evidence reroute');
  if (!uTurn || typeof uTurn !== 'object') fail('Invalid route evidence U-turn');
  if (!recovery || typeof recovery !== 'object') fail('Invalid route evidence recovery');
  if (!(routeV2EvidenceReasons as readonly string[]).includes(sample.reason))
    fail('Invalid route evidence sample reason');
  if (!actions.includes(sample.action)) fail('Invalid route evidence sample action');
  if (!rerouteDecisions.includes(reroute.decision)) fail('Invalid route evidence reroute decision');
  if (uTurn.permission !== null && !permissions.includes(uTurn.permission))
    fail('Invalid route evidence U-turn permission');
  const routes = Array.isArray(sample.routes)
    ? (sample.routes as readonly unknown[]).map(admitRoute)
    : fail('Invalid route evidence route list');
  if (routes.length > limit.maximumAlternatives) fail('Route evidence capacity exceeded');
  return Object.freeze({
    tick: count(sample.tick, limit.maximumTick, 'sample tick'),
    policyActive: flag(sample.policyActive, 'sample policy flag'),
    reason: sample.reason,
    action: sample.action,
    referenceSeconds: finite(
      sample.referenceSeconds,
      0,
      limit.maximumTimeS,
      'sample reference seconds',
    ),
    referenceMetres: finite(
      sample.referenceMetres,
      0,
      limit.maximumLengthM,
      'sample reference metres',
    ),
    currentRouteId: optionalIdentity(sample.currentRouteId, 'sample current route'),
    candidateRouteId: optionalIdentity(sample.candidateRouteId, 'sample candidate route'),
    selectedRouteId: optionalIdentity(sample.selectedRouteId, 'sample selected route'),
    rerouteDecision: reroute.decision,
    elapsedTicks: optionalCount(reroute.elapsedTicks, limit.maximumTick, 'reroute elapsed ticks'),
    patienceTicks: optionalCount(
      reroute.patienceTicks,
      limit.maximumTick,
      'reroute patience ticks',
    ),
    remainingTicks: optionalCount(
      reroute.remainingTicks,
      limit.maximumTick,
      'reroute remaining ticks',
    ),
    uTurnPermission: uTurn.permission,
    uTurnSample: optionalFinite(uTurn.sample, 0, 1, 'U-turn sample'),
    uTurnAdmitted: flag(uTurn.admitted, 'U-turn admitted flag'),
    recoveryRequired: flag(recovery.required, 'recovery required flag'),
    recoveryReverseClear: flag(recovery.reverseClear, 'recovery clearance flag'),
    recoveryCommitted: flag(recovery.committed, 'recovery committed flag'),
    recoveryDurationS: optionalFinite(
      recovery.durationS,
      0,
      limit.maximumTimeS,
      'recovery duration',
    ),
    recoveryFloored: flag(recovery.floored, 'recovery floored flag'),
    routes: Object.freeze(routes),
  });
}
function admitEpisode(value: unknown): AdmittedEpisode | RouteV2EpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid route evidence episode');
  const episode = value as RouteV2EvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, limit.maximumOccurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid route evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid route evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid route evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched route evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Route evidence samples are not strictly ordered');
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
function splitEpisodes(ids: readonly string[], seed: number): EpisodeSplit {
  const ordered = [...new Set(ids)].sort((a, b) => {
    const difference = hash(seed, a) - hash(seed, b);
    return difference === 0 ? (a < b ? -1 : a > b ? 1 : 0) : difference;
  });
  return new Map(
    ordered.map((id, index) => [id, index % 2 === 0 ? 'ESTIMATE' : 'VALIDATION'] as const),
  );
}
type EpisodeSplit = ReadonlyMap<string, 'ESTIMATE' | 'VALIDATION'>;
function splitOf(split: EpisodeSplit, id: string): 'ESTIMATE' | 'VALIDATION' {
  return split.get(id) ?? 'ESTIMATE';
}
function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
function frozenCounts(counts: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries([...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))));
}
function catalogRange(key: RouteV2EstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function frozen<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}
/** `x · a + b <= 0` for the chosen alternative, solved for `x`. */
function boundOf(a: number, b: number): { side: 'LOWER' | 'UPPER'; at: number } | null {
  if (Math.abs(a) <= limit.ratioTolerance) return null;
  const at = -b / a;
  if (!(at > 0)) return null;
  return { side: a > 0 ? 'UPPER' : 'LOWER', at };
}
/** The two admitted alternatives of a scored decision, or null when the decision is not a pair. */
function pairFacts(sample: AdmittedSample): PairFacts | null {
  if (!sample.policyActive || !decisionActions.has(sample.action)) return null;
  if (sample.referenceSeconds <= 0 || sample.referenceMetres <= 0) return null;
  if (sample.candidateRouteId === null) return null;
  const admitted = sample.routes.filter((route) => route.admitted);
  if (admitted.length !== 2) return null;
  const chosen = admitted.find((route) => route.id === sample.candidateRouteId);
  if (chosen === undefined) return null;
  const other = admitted.find((route) => route.id !== chosen.id);
  if (other === undefined) return null;
  return Object.freeze({
    chosen,
    other,
    dTime: (chosen.styleTimeS - other.styleTimeS) / sample.referenceSeconds,
    dDistance: (chosen.lengthM - other.lengthM) / sample.referenceMetres,
    dTurn: chosen.turns - other.turns,
    dSignal: chosen.signals - other.signals,
    dCongestion: (chosen.congestionDelayS - other.congestionDelayS) / sample.referenceSeconds,
  });
}
/**
 * The four identified coefficients. Each equation is the delivered 181 score difference divided by
 * the distance share, so the selected coefficient is the only unknown of the pair.
 */
const coefficientSpecs: Readonly<Record<CoefficientName, CoefficientSpec>> = Object.freeze({
  rho: {
    coefficient: 'rho',
    missing: 'TIME_DISTANCE_PAIR_MISSING',
    dominated: 'TIME_DISTANCE_PAIR_DOMINATED',
    lower: 'TIME_DISTANCE_LOWER_BOUND_UNOBSERVED',
    upper: 'TIME_DISTANCE_UPPER_BOUND_UNOBSERVED',
    contradictory: 'CONTRADICTORY_TIME_DISTANCE_BOUNDS',
    equation: (pair) => {
      // Only time and distance may differ: a third term would be an unobserved unknown.
      if (pair.dTurn !== 0 || pair.dSignal !== 0) return null;
      if (Math.abs(pair.dCongestion) > limit.ratioTolerance) return null;
      if (Math.abs(pair.dTime) <= limit.ratioTolerance) return null;
      if (Math.abs(pair.dDistance) <= limit.ratioTolerance) return null;
      return { a: pair.dTime, b: pair.dDistance };
    },
  },
  kappaTurn: {
    coefficient: 'kappaTurn',
    missing: 'TURN_TRADE_OFF_MISSING',
    dominated: 'TURN_TRADE_OFF_DOMINATED',
    lower: 'TURN_TRADE_OFF_LOWER_BOUND_UNOBSERVED',
    upper: 'TURN_TRADE_OFF_UPPER_BOUND_UNOBSERVED',
    contradictory: 'CONTRADICTORY_TURN_BOUNDS',
    equation: (pair) => {
      if (pair.dTurn === 0) return null;
      if (pair.dSignal !== 0) return null;
      if (Math.abs(pair.dCongestion) > limit.ratioTolerance) return null;
      // Equal free-flow speed: the time and distance terms are collinear and cancel with 1 + rho.
      if (Math.abs(pair.dTime - pair.dDistance) > limit.ratioTolerance) return null;
      if (Math.abs(pair.dDistance) <= limit.ratioTolerance) return null;
      return { a: pair.dTurn, b: pair.dDistance };
    },
  },
  kappaSignal: {
    coefficient: 'kappaSignal',
    missing: 'SIGNAL_TRADE_OFF_MISSING',
    dominated: 'SIGNAL_TRADE_OFF_DOMINATED',
    lower: 'SIGNAL_TRADE_OFF_LOWER_BOUND_UNOBSERVED',
    upper: 'SIGNAL_TRADE_OFF_UPPER_BOUND_UNOBSERVED',
    contradictory: 'CONTRADICTORY_SIGNAL_BOUNDS',
    equation: (pair) => {
      if (pair.dSignal === 0) return null;
      if (pair.dTurn !== 0) return null;
      if (Math.abs(pair.dCongestion) > limit.ratioTolerance) return null;
      if (Math.abs(pair.dTime - pair.dDistance) > limit.ratioTolerance) return null;
      if (Math.abs(pair.dDistance) <= limit.ratioTolerance) return null;
      return { a: pair.dSignal, b: pair.dDistance };
    },
  },
  kappaCongestion: {
    coefficient: 'kappaCongestion',
    missing: 'CONGESTION_TRADE_OFF_MISSING',
    dominated: 'CONGESTION_TRADE_OFF_DOMINATED',
    lower: 'CONGESTION_TRADE_OFF_LOWER_BOUND_UNOBSERVED',
    upper: 'CONGESTION_TRADE_OFF_UPPER_BOUND_UNOBSERVED',
    contradictory: 'CONTRADICTORY_CONGESTION_BOUNDS',
    equation: (pair) => {
      if (Math.abs(pair.dCongestion) <= limit.ratioTolerance) return null;
      if (pair.dTurn !== 0 || pair.dSignal !== 0) return null;
      if (Math.abs(pair.dTime - pair.dDistance) > limit.ratioTolerance) return null;
      if (Math.abs(pair.dDistance) <= limit.ratioTolerance) return null;
      return { a: pair.dCongestion, b: pair.dDistance };
    },
  },
});

/** One episode's inequalities for one coefficient: the tightest demonstrated lower and upper bound. */
function coefficientBand(
  episode: AdmittedEpisode,
  spec: CoefficientSpec,
  excluded: Map<string, number>,
): EpisodeBand | null {
  let lower: number | null = null,
    upper: number | null = null,
    samples = 0,
    pairs = 0;
  for (const sample of episode.samples) {
    const pair = pairFacts(sample);
    if (pair === null) {
      if (sample.policyActive && decisionActions.has(sample.action)) {
        increment(excluded, 'WEIGHT_PAIR_NOT_COMPARABLE');
        increment(excluded, spec.missing);
      }
      continue;
    }
    const equation = spec.equation(pair);
    if (equation === null) continue;
    pairs += 1;
    const bound = boundOf(equation.a, equation.b);
    if (bound === null) {
      increment(excluded, spec.dominated);
      continue;
    }
    samples += 1;
    if (bound.side === 'LOWER') lower = lower === null ? bound.at : Math.max(lower, bound.at);
    else upper = upper === null ? bound.at : Math.min(upper, bound.at);
  }
  if (pairs === 0) {
    if (!excluded.has(spec.missing)) increment(excluded, spec.missing);
    return null;
  }
  if (lower !== null && upper !== null && lower > upper + limit.ratioTolerance) {
    increment(excluded, spec.contradictory);
    return null;
  }
  return { id: episode.id, lower, upper, samples };
}

interface CoefficientEstimate {
  readonly value: number;
  readonly lower: number;
  readonly upper: number;
  readonly episodes: number;
  readonly samples: number;
  readonly validationLower: number | null;
  readonly validationUpper: number | null;
  readonly validationEpisodes: number;
}
function summarizeBands(
  bands: readonly EpisodeBand[],
  seed: EpisodeSplit,
  side: 'ESTIMATE' | 'VALIDATION',
): BandSummary {
  const chosen = bands.filter((entry) => splitOf(seed, entry.id) === side),
    lowers = chosen.map((entry) => entry.lower).filter((entry): entry is number => entry !== null),
    uppers = chosen.map((entry) => entry.upper).filter((entry): entry is number => entry !== null);
  return {
    lower: lowers.length === 0 ? null : Math.max(...lowers),
    upper: uppers.length === 0 ? null : Math.min(...uppers),
    episodes: chosen.length,
    samples: chosen.reduce((sum, entry) => sum + entry.samples, 0),
  };
}
function estimateCoefficient(
  coefficient: CoefficientName,
  episodes: readonly AdmittedEpisode[],
  seed: EpisodeSplit,
  excluded: Map<string, number>,
): CoefficientEstimate | RouteV2EstimatorReason {
  const spec = coefficientSpecs[coefficient],
    bands: EpisodeBand[] = [];
  for (const episode of episodes) {
    const band = coefficientBand(episode, spec, excluded);
    if (band !== null) bands.push(band);
  }
  if (bands.length === 0) return spec.missing;

  const estimate = summarizeBands(bands, seed, 'ESTIMATE'),
    validation = summarizeBands(bands, seed, 'VALIDATION');
  if (estimate.episodes < limit.minimumEstimateEpisodes) return 'INSUFFICIENT_DISTINCT_EPISODES';
  if (estimate.lower === null) return spec.lower;
  if (estimate.upper === null) return spec.upper;
  if (estimate.lower > estimate.upper + limit.ratioTolerance) return spec.contradictory;
  return {
    value: (estimate.lower + estimate.upper) / 2,
    lower: estimate.lower,
    upper: estimate.upper,
    episodes: estimate.episodes,
    samples: estimate.samples,
    validationLower: validation.lower,
    validationUpper: validation.upper,
    validationEpisodes: validation.episodes,
  };
}
/** The unit-sum representative implied by the four identified ratios. */
function normalizedShares(
  coefficients: RouteV2ShareCoefficients,
): Readonly<Record<string, number>> {
  return Object.freeze({
    route_time_weight: shareOf('route_time_weight', coefficients.rho, coefficients),
    route_distance_weight: shareOf('route_distance_weight', coefficients.rho, coefficients),
    route_turn_penalty: shareOf('route_turn_penalty', coefficients.kappaTurn, coefficients),
    route_signal_penalty: shareOf('route_signal_penalty', coefficients.kappaSignal, coefficients),
    route_congestion_penalty: shareOf(
      'route_congestion_penalty',
      coefficients.kappaCongestion,
      coefficients,
    ),
  });
}
/** A monotone map from one identified ratio to the share the estimate reports. */
function shareOf(
  key: RouteV2EstimatorKey,
  ratio: number,
  coefficients: RouteV2ShareCoefficients,
): number {
  const total = coefficients.kappaTurn + coefficients.kappaSignal + coefficients.kappaCongestion;
  switch (key) {
    case 'route_time_weight':
      return ratio / ((1 + ratio) * (1 + total));
    case 'route_distance_weight':
      return 1 / ((1 + ratio) * (1 + total));
    case 'route_turn_penalty':
      return ratio / (1 + ratio + coefficients.kappaSignal + coefficients.kappaCongestion);
    case 'route_signal_penalty':
      return ratio / (1 + ratio + coefficients.kappaTurn + coefficients.kappaCongestion);
    case 'route_congestion_penalty':
      return ratio / (1 + ratio + coefficients.kappaTurn + coefficients.kappaSignal);
    default:
      return ratio;
  }
}
function emptyValidation(key: RouteV2EstimatorKey): RouteV2Validation {
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
  key: RouteV2EstimatorKey,
  reason: RouteV2EstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: RouteV2Validation = emptyValidation(key),
  uncertainty: number | null = null,
): RouteV2KeyEstimate {
  return Object.freeze({
    key,
    scenario: routeV2EligibleScenarios[key],
    unit: getParameterDefinition(key).unit,
    eligibleContext: routeV2EligibleContexts[key],
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
  key: RouteV2EstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: RouteV2Validation,
): RouteV2KeyEstimate | RouteV2EstimatorReason {
  if (uncertainty > limit.maximumUncertainty[key]) return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    scenario: routeV2EligibleScenarios[key],
    unit: range.unit,
    eligibleContext: routeV2EligibleContexts[key],
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
/**
 * Validation of a monotone share: the held-out inequalities are mapped through the same transform,
 * and the estimate must be admitted inside the documented tolerance.
 */
function ratioValidation(
  key: RouteV2EstimatorKey,
  estimate: number,
  reading: CoefficientEstimate,
  transform: (ratio: number) => number,
): RouteV2Validation {
  const tolerance = limit.validationTolerance[key],
    unit = getParameterDefinition(key).unit,
    episodes = reading.validationEpisodes,
    mapped = [
      reading.validationLower === null ? null : transform(reading.validationLower),
      reading.validationUpper === null ? null : transform(reading.validationUpper),
    ].filter((entry): entry is number => entry !== null);
  if (mapped.length === 0)
    return Object.freeze({
      status: 'NO_DATA',
      episodes,
      value: null,
      error: null,
      tolerance,
      detail: 'no held-out demonstration bounds this key',
    });
  const lower = Math.min(...mapped),
    upper = Math.max(...mapped),
    value = (lower + upper) / 2,
    detail =
      episodes < limit.minimumValidationEpisodes
        ? `validation set has ${episodes} of the required ${limit.minimumValidationEpisodes} episodes`
        : `${episodes} held-out bounds [${lower.toFixed(4)}, ${upper.toFixed(4)}] ${unit} versus ${estimate.toFixed(4)} ${unit}`;
  if (episodes < limit.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes,
      value,
      error: Math.abs(value - estimate),
      tolerance,
      detail,
    });
  const admitted =
    estimate >= lower - tolerance - limit.ratioTolerance &&
    estimate <= upper + tolerance + limit.ratioTolerance;
  return Object.freeze({
    status: admitted ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes,
    value,
    error: Math.abs(value - estimate),
    tolerance,
    detail,
  });
}
/** Continuous validation: the held-out median must match the estimate inside the tolerance. */
function continuousValidation(
  key: RouteV2EstimatorKey,
  estimate: number,
  values: readonly number[],
): RouteV2Validation {
  const tolerance = limit.validationTolerance[key],
    unit = getParameterDefinition(key).unit;
  if (values.length === 0) return emptyValidation(key);
  const value = median(values),
    error = Math.abs(value - estimate);
  if (values.length < limit.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: values.length,
      value,
      error,
      tolerance,
      detail: `validation set has ${values.length} of the required ${limit.minimumValidationEpisodes} episodes`,
    });
  return Object.freeze({
    status: error <= tolerance ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: values.length,
    value,
    error,
    tolerance,
    detail: `held-out estimate ${value.toFixed(4)} ${unit} differs by ${error.toFixed(4)} ${unit}`,
  });
}
/** Bounded validation: every held-out inequality must admit the estimate inside the tolerance. */
function boundedValidation(
  key: RouteV2EstimatorKey,
  estimate: number,
  lower: number | null,
  upper: number | null,
  episodes: number,
): RouteV2Validation {
  const tolerance = limit.validationTolerance[key],
    unit = getParameterDefinition(key).unit,
    value =
      lower === null && upper === null ? null : ((lower ?? upper ?? 0) + (upper ?? lower ?? 0)) / 2,
    error = value === null ? null : Math.abs(value - estimate);
  if (value === null) return emptyValidation(key);
  if (episodes < limit.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes,
      value,
      error,
      tolerance,
      detail: `validation set has ${episodes} of the required ${limit.minimumValidationEpisodes} episodes`,
    });
  const admitted =
    (lower === null || estimate >= lower - tolerance - limit.ratioTolerance) &&
    (upper === null || estimate <= upper + tolerance + limit.ratioTolerance);
  return Object.freeze({
    status: admitted ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes,
    value,
    error,
    tolerance,
    detail: `${episodes} held-out bounds [${(lower ?? Number.NEGATIVE_INFINITY).toFixed(4)}, ${(upper ?? Number.POSITIVE_INFINITY).toFixed(4)}] ${unit} versus ${estimate.toFixed(4)} ${unit}`,
  });
}
function uncertaintyOf(key: RouteV2EstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    limit.uncertaintyFloor[key],
    (limit.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}
/** The 181 key of a whole number of patience ticks: `P` ticks admit `((P − 1)/60, P/60]`. */
function patienceSeconds(ticks: number): number {
  return ticks <= 1 ? 0 : (ticks - 0.5) / limit.tickHz;
}

/** Reroute patience: the first elapsed tick that commits between two admissible routes. */
function patienceEstimate(
  episodes: readonly AdmittedEpisode[],
  seed: EpisodeSplit,
): RouteV2KeyEstimate {
  const key = 'reroute_patience' as const,
    excluded = new Map<string, number>(),
    bands: EpisodeBand[] = [];
  for (const episode of episodes) {
    let lower: number | null = null,
      upper: number | null = null,
      samples = 0,
      inconsistent = false;
    for (const sample of episode.samples) {
      if (!sample.policyActive || sample.elapsedTicks === null) continue;
      if (sample.candidateRouteId === null || sample.candidateRouteId === sample.currentRouteId)
        continue;
      if (sample.action === 'RECOVERY' || sample.action === 'HOLD') continue;
      if (sample.rerouteDecision === 'FORCED') {
        // An inadmissible current route is left at once: patience is not the cause.
        increment(excluded, 'PATIENCE_ONLY_BETWEEN_ADMISSIBLE_ROUTES');
        continue;
      }
      if (sample.action === 'REROUTE_WAIT' || sample.rerouteDecision === 'WAIT') {
        if (sample.currentRouteId === null) continue;
        lower = lower === null ? sample.elapsedTicks : Math.max(lower, sample.elapsedTicks);
        samples += 1;
        continue;
      }
      if (sample.reason === 'REROUTE_COMMIT' && sample.rerouteDecision === 'COMMIT') {
        if (sample.elapsedTicks < 1) {
          inconsistent = true;
          continue;
        }
        upper = upper === null ? sample.elapsedTicks : Math.min(upper, sample.elapsedTicks);
        samples += 1;
      }
    }
    if (inconsistent) {
      increment(excluded, 'PATIENCE_TRANSITION_INCONSISTENT');
      continue;
    }
    if (samples === 0) continue;
    bands.push({ id: episode.id, lower, upper, samples });
  }
  if (bands.length === 0) return unobserved(key, 'NO_PATIENCE_TRANSITION', 0, 0, excluded);

  const estimate = summarizeBands(bands, seed, 'ESTIMATE'),
    validation = summarizeBands(bands, seed, 'VALIDATION'),
    validationSeconds = {
      lower: validation.lower === null ? null : patienceSeconds(validation.lower),
      upper: validation.upper === null ? null : patienceSeconds(validation.upper),
    };
  if (estimate.episodes < limit.minimumEstimateEpisodes)
    return unobserved(
      key,
      'INSUFFICIENT_DISTINCT_EPISODES',
      bands.length,
      estimate.samples,
      excluded,
    );
  if (estimate.lower === null)
    return unobserved(
      key,
      'PATIENCE_LOWER_BOUND_UNOBSERVED',
      estimate.episodes,
      estimate.samples,
      excluded,
    );
  if (estimate.upper === null)
    return unobserved(
      key,
      'PATIENCE_UPPER_BOUND_UNOBSERVED',
      estimate.episodes,
      estimate.samples,
      excluded,
      boundedValidation(
        key,
        patienceSeconds(estimate.lower),
        validationSeconds.lower,
        validationSeconds.upper,
        validation.episodes,
      ),
    );
  if (estimate.lower >= estimate.upper)
    return unobserved(
      key,
      'CONTRADICTORY_PATIENCE_BOUNDS',
      estimate.episodes,
      estimate.samples,
      excluded,
    );
  const rawValue = patienceSeconds(estimate.upper),
    width = (estimate.upper - estimate.lower) / limit.tickHz,
    uncertainty = Math.max(limit.uncertaintyFloor[key], width / 2),
    range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue)),
    measured = boundedValidation(
      key,
      value,
      validationSeconds.lower,
      validationSeconds.upper,
      validation.episodes,
    ),
    result = candidate(
      key,
      rawValue,
      uncertainty,
      estimate.episodes,
      estimate.samples,
      excluded,
      measured,
    );
  return typeof result === 'string'
    ? unobserved(key, result, estimate.episodes, estimate.samples, excluded, measured, uncertainty)
    : result;
}

/** U-turn willingness: one deterministic sample per permitted opportunity bounds the key. */
function uTurnEstimate(
  episodes: readonly AdmittedEpisode[],
  seed: EpisodeSplit,
): RouteV2KeyEstimate {
  const key = 'u_turn_willingness' as const,
    excluded = new Map<string, number>(),
    bands: EpisodeBand[] = [];
  for (const episode of episodes) {
    let lower: number | null = null,
      upper: number | null = null,
      samples = 0;
    for (const sample of episode.samples) {
      if (!sample.policyActive) continue;
      // A sample only speaks about willingness when a U-turn alternative exists or the world
      // declared the permission: otherwise 181 never draws a sample at all.
      const declared =
        sample.uTurnPermission === 'PERMITTED' || sample.routes.some((route) => route.uTurn);
      if (!declared) continue;
      if (sample.uTurnPermission === 'FORBIDDEN' || sample.uTurnPermission === 'UNKNOWN') {
        increment(excluded, 'U_TURN_PERMISSION_NOT_DECLARED');
        continue;
      }
      if (sample.uTurnPermission !== 'PERMITTED') continue;
      if (sample.uTurnSample === null) {
        increment(excluded, 'U_TURN_SAMPLE_MISSING');
        continue;
      }
      samples += 1;
      if (sample.uTurnAdmitted)
        lower = lower === null ? sample.uTurnSample : Math.max(lower, sample.uTurnSample);
      else upper = upper === null ? sample.uTurnSample : Math.min(upper, sample.uTurnSample);
    }
    if (samples === 0) continue;
    bands.push({ id: episode.id, lower, upper, samples });
  }
  if (bands.length === 0)
    return unobserved(
      key,
      excluded.has('U_TURN_PERMISSION_NOT_DECLARED')
        ? 'U_TURN_PERMISSION_NOT_DECLARED'
        : 'NO_U_TURN_OPPORTUNITY',
      0,
      0,
      excluded,
    );

  const estimate = summarizeBands(bands, seed, 'ESTIMATE'),
    validation = summarizeBands(bands, seed, 'VALIDATION');
  if (estimate.episodes < limit.minimumEstimateEpisodes)
    return unobserved(
      key,
      'INSUFFICIENT_DISTINCT_EPISODES',
      bands.length,
      estimate.samples,
      excluded,
    );
  if (estimate.lower !== null && estimate.upper !== null && estimate.lower > estimate.upper) {
    increment(excluded, 'CONTRADICTORY_U_TURN_BOUNDS');
    return unobserved(
      key,
      'CONTRADICTORY_U_TURN_BOUNDS',
      estimate.episodes,
      estimate.samples,
      excluded,
    );
  }
  // A constant refusal demonstrates the catalog floor: every sample above the refusal bound keeps
  // the same policy, so zero is the demonstrated value and the band half-width is the uncertainty.
  const refusalOnly = estimate.lower === null && estimate.upper !== null,
    admissionOnly = estimate.upper === null && estimate.lower !== null,
    value = refusalOnly
      ? 0
      : admissionOnly
        ? (estimate.lower! + 1) / 2
        : (estimate.lower! + estimate.upper!) / 2,
    lowerValue = refusalOnly ? 0 : (estimate.lower ?? 0),
    upperValue = admissionOnly ? 1 : (estimate.upper ?? 1),
    uncertainty = Math.max(limit.uncertaintyFloor[key], (upperValue - lowerValue) / 2),
    measured = boundedValidation(
      key,
      value,
      validation.lower,
      validation.upper,
      validation.episodes,
    );
  if (refusalOnly && uncertainty > limit.maximumUncertainty[key])
    return unobserved(
      key,
      'U_TURN_REFUSAL_BAND_TOO_WIDE',
      estimate.episodes,
      estimate.samples,
      excluded,
      measured,
      uncertainty,
    );
  const result = candidate(
    key,
    value,
    uncertainty,
    estimate.episodes,
    estimate.samples,
    excluded,
    measured,
  );
  return typeof result === 'string'
    ? unobserved(key, result, estimate.episodes, estimate.samples, excluded, measured, uncertainty)
    : result;
}

/** Reverse recovery: only a commitment above the 2.5 s floor is the key itself. */
function recoveryEstimate(
  episodes: readonly AdmittedEpisode[],
  seed: EpisodeSplit,
): RouteV2KeyEstimate {
  const key = 'reverse_recovery_duration' as const,
    excluded = new Map<string, number>(),
    values: { id: string; value: number; samples: number }[] = [],
    bounds: { id: string; at: number; samples: number }[] = [];
  for (const episode of episodes) {
    if (!episode.samples.some((sample) => sample.policyActive && sample.recoveryRequired)) continue;
    const committed = episode.samples.filter(
      (sample) =>
        sample.policyActive &&
        sample.recoveryRequired &&
        sample.recoveryReverseClear &&
        sample.recoveryCommitted &&
        sample.recoveryDurationS !== null,
    );
    if (committed.length === 0) {
      if (
        episode.samples.some(
          (sample) =>
            sample.policyActive && sample.recoveryRequired && !sample.recoveryReverseClear,
        )
      )
        increment(excluded, 'RECOVERY_BLOCKED_NO_COMMAND');
      else increment(excluded, 'NO_RECOVERY_COMMIT');
      continue;
    }
    const samples = committed.length,
      durations = committed.map((sample) => sample.recoveryDurationS!),
      maximum = Math.max(...durations);
    if (maximum <= limit.minimumReverseRecoveryS + limit.ratioTolerance) {
      // The floor raised every commitment: only `key <= 2.5 s` is demonstrated.
      bounds.push({ id: episode.id, at: limit.minimumReverseRecoveryS, samples });
      continue;
    }
    values.push({ id: episode.id, value: Math.max(...durations), samples });
  }
  if (values.length === 0 && bounds.length === 0)
    return unobserved(
      key,
      excluded.has('RECOVERY_BLOCKED_NO_COMMAND')
        ? 'RECOVERY_BLOCKED_NO_COMMAND'
        : 'NO_RECOVERY_COMMIT',
      0,
      0,
      excluded,
    );
  if (values.length === 0) {
    increment(excluded, 'RECOVERY_FLOOR_SATURATED');
    return unobserved(key, 'RECOVERY_FLOOR_SATURATED', bounds.length, 0, excluded);
  }

  const estimateValues = values.filter((entry) => splitOf(seed, entry.id) === 'ESTIMATE'),
    validationValues = values.filter((entry) => splitOf(seed, entry.id) === 'VALIDATION'),
    estimateSamples = estimateValues.reduce((sum, entry) => sum + entry.samples, 0),
    totalSamples = values.reduce((sum, entry) => sum + entry.samples, 0);
  if (estimateValues.length < limit.minimumEstimateEpisodes)
    return unobserved(key, 'INSUFFICIENT_DISTINCT_EPISODES', values.length, totalSamples, excluded);
  const numbers = estimateValues.map((entry) => entry.value),
    rawValue = median(numbers),
    uncertainty = uncertaintyOf(key, numbers),
    measured = continuousValidation(
      key,
      rawValue,
      validationValues.map((entry) => entry.value),
    );
  // A floor-saturated episode proves `key <= 2.5 s`; it cannot coexist with a larger commitment.
  if (
    bounds.some(
      (entry) => entry.at < rawValue - limit.validationTolerance[key] - limit.ratioTolerance,
    )
  )
    return unobserved(
      key,
      'RECOVERY_BOUND_INCONSISTENT',
      estimateValues.length,
      estimateSamples,
      excluded,
      measured,
      uncertainty,
    );
  const result = candidate(
    key,
    rawValue,
    uncertainty,
    estimateValues.length,
    estimateSamples,
    excluded,
    measured,
  );
  return typeof result === 'string'
    ? unobserved(
        key,
        result,
        estimateValues.length,
        estimateSamples,
        excluded,
        measured,
        uncertainty,
      )
    : result;
}

function compatibility(): RouteV2Compatibility {
  return Object.freeze({
    policyVersion: ROUTE_POLICY_V2_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    mReadByPolicy: Object.freeze([...ROUTE_POLICY_V2_M_KEYS]),
    tickHz: limit.tickHz,
    minimumReverseRecoveryS: limit.minimumReverseRecoveryS,
    reportedQuantity: Object.freeze({
      route_time_weight: 'cota `share_timp` din bugetul normalizat al lui 181',
      route_distance_weight: 'cota `share_distanță` din bugetul normalizat al lui 181',
      route_turn_penalty: 'cota `share_viraj` din bugetul normalizat al lui 181',
      route_signal_penalty: 'cota `share_semafor` din bugetul normalizat al lui 181',
      route_congestion_penalty: 'cota `share_congestie` din bugetul normalizat al lui 181',
      reroute_patience: 'cheia în secunde, inversată din `max(1, ceil(cheie · 60))`',
      u_turn_willingness: 'probabilitatea în sine, intersectată din eșantioane',
      reverse_recovery_duration: 'cheia în secunde, citită peste podeaua de 2,5 s',
    }),
    catalogRanges: Object.freeze(
      Object.fromEntries([
        ...ROUTE_V2_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)] as const),
      ]) as Record<RouteV2EstimatorKey, { min: number; max: number; unit: string }>,
    ),
  });
}

/**
 * Estimates the eight 181 route keys from demonstrated decisions. The same episodes and the same
 * `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateRouteV2Style(input: RouteV2EstimatorInput): RouteV2EstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid route estimator input');
  const splitSeed = count(input.splitSeed, limit.maximumSeed, 'split seed');
  if (!Array.isArray(input.episodes)) fail('Invalid route evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: RouteV2EpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as RouteV2EvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as RouteV2EvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }

  const split = splitEpisodes(
      admitted.map((episode) => episode.id),
      splitSeed,
    ),
    coefficientExcluded: Record<CoefficientName, Map<string, number>> = {
      rho: new Map<string, number>(),
      kappaTurn: new Map<string, number>(),
      kappaSignal: new Map<string, number>(),
      kappaCongestion: new Map<string, number>(),
    },
    coefficientResults = {
      rho: estimateCoefficient('rho', admitted, split, coefficientExcluded.rho),
      kappaTurn: estimateCoefficient('kappaTurn', admitted, split, coefficientExcluded.kappaTurn),
      kappaSignal: estimateCoefficient(
        'kappaSignal',
        admitted,
        split,
        coefficientExcluded.kappaSignal,
      ),
      kappaCongestion: estimateCoefficient(
        'kappaCongestion',
        admitted,
        split,
        coefficientExcluded.kappaCongestion,
      ),
    },
    coefficients: RouteV2ShareCoefficients | null =
      typeof coefficientResults.rho === 'string' ||
      typeof coefficientResults.kappaTurn === 'string' ||
      typeof coefficientResults.kappaSignal === 'string' ||
      typeof coefficientResults.kappaCongestion === 'string'
        ? null
        : {
            rho: coefficientResults.rho.value,
            kappaTurn: coefficientResults.kappaTurn.value,
            kappaSignal: coefficientResults.kappaSignal.value,
            kappaCongestion: coefficientResults.kappaCongestion.value,
          },
    keys = {} as Record<RouteV2EstimatorKey, RouteV2KeyEstimate>;

  const weightKeys = Object.freeze([
      'route_time_weight',
      'route_distance_weight',
      'route_turn_penalty',
      'route_signal_penalty',
      'route_congestion_penalty',
    ] as const),
    drivingCoefficient: Readonly<Record<(typeof weightKeys)[number], CoefficientName>> =
      Object.freeze({
        route_time_weight: 'rho',
        route_distance_weight: 'rho',
        route_turn_penalty: 'kappaTurn',
        route_signal_penalty: 'kappaSignal',
        route_congestion_penalty: 'kappaCongestion',
      }),
    penaltyKeys = Object.freeze([
      'route_turn_penalty',
      'route_signal_penalty',
      'route_congestion_penalty',
    ] as const),
    penaltiesIdentified = penaltyKeys.every(
      (key) => typeof coefficientResults[drivingCoefficient[key]] !== 'string',
    ),
    /**
     * The three penalties never read `rho`: their share is `kappa / (1 + Σκ)`. The placeholder keeps
     * the transform total, so a cenzurat time/distance ratio cannot hide them.
     */
    penaltyCoefficients: RouteV2ShareCoefficients = {
      rho: coefficients?.rho ?? 0,
      kappaTurn:
        typeof coefficientResults.kappaTurn === 'string' ? 0 : coefficientResults.kappaTurn.value,
      kappaSignal:
        typeof coefficientResults.kappaSignal === 'string'
          ? 0
          : coefficientResults.kappaSignal.value,
      kappaCongestion:
        typeof coefficientResults.kappaCongestion === 'string'
          ? 0
          : coefficientResults.kappaCongestion.value,
    };
  for (const key of weightKeys) {
    const coefficient = drivingCoefficient[key],
      reading = coefficientResults[coefficient],
      excluded = coefficientExcluded[coefficient];
    if (typeof reading === 'string') {
      keys[key] = unobserved(key, reading, 0, 0, excluded);
      continue;
    }
    const needsTimeDistance = coefficient === 'rho';
    if (!penaltiesIdentified) {
      // Without the three penalty ratios the shared budget `1 + Σκ` cannot be formed at all.
      keys[key] = unobserved(
        key,
        'SHARE_BUDGET_INCOMPLETE',
        reading.episodes,
        reading.samples,
        excluded,
      );
      continue;
    }
    if (needsTimeDistance && coefficients === null) {
      // `rho` itself is demonstrated (the branch above), so only the shared budget was missing.
      keys[key] = unobserved(
        key,
        'SHARE_BUDGET_INCOMPLETE',
        reading.episodes,
        reading.samples,
        excluded,
      );
      continue;
    }
    const transform = (ratio: number) =>
        shareOf(key, ratio, needsTimeDistance ? coefficients! : penaltyCoefficients),
      lowShare = transform(reading.lower),
      highShare = transform(reading.upper),
      // The reported value is the canonical unit-sum representative of the identified ray, so 181
      // renormalizes it to itself; the demonstrated band only sets the uncertainty.
      value = transform(reading.value),
      uncertainty = Math.max(limit.uncertaintyFloor[key], Math.abs(highShare - lowShare) / 2),
      measured = ratioValidation(key, value, reading, transform),
      result = candidate(
        key,
        value,
        uncertainty,
        reading.episodes,
        reading.samples,
        excluded,
        measured,
      );
    keys[key] =
      typeof result === 'string'
        ? unobserved(
            key,
            result,
            reading.episodes,
            reading.samples,
            excluded,
            measured,
            uncertainty,
          )
        : result;
  }
  keys.reroute_patience = patienceEstimate(admitted, split);
  keys.u_turn_willingness = uTurnEstimate(admitted, split);
  keys.reverse_recovery_duration = recoveryEstimate(admitted, split);
  if (admitted.length === 0)
    for (const key of ROUTE_V2_ESTIMATOR_KEYS)
      keys[key] = unobserved(key, 'NO_ELIGIBLE_EPISODES', 0, 0, new Map<string, number>());

  return Object.freeze({
    version: ROUTE_V2_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    coefficients: Object.freeze({
      rho: coefficients?.rho ?? null,
      kappaTurn: coefficients?.kappaTurn ?? null,
      kappaSignal: coefficients?.kappaSignal ?? null,
      kappaCongestion: coefficients?.kappaCongestion ?? null,
    }),
    normalizedShares: coefficients === null ? null : normalizedShares(coefficients),
    groupConstraints: routeV2GroupConstraints,
    admittedEpisodes: frozen(admitted.map((episode) => episode.id)),
    refusedEpisodes: frozen(refused.map((entry) => Object.freeze(entry))),
    split: frozen(
      admitted.map((episode) =>
        Object.freeze({ episodeId: episode.id, side: splitOf(split, episode.id) }),
      ),
    ),
    compatibility: compatibility(),
  });
}
