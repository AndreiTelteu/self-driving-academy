import {
  HAZARD_POLICY_V2_KEYS,
  HAZARD_POLICY_V2_LIMITS,
  HAZARD_POLICY_V2_M_KEYS,
} from '../autonomy';
import type {
  HazardPedestrianState,
  HazardPolicyV2Action,
  HazardPolicyV2Key,
  HazardPolicyV2Reason,
} from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';
import type { RoadSurfaceId, VehicleClassId } from '../vehicles';

/**
 * 184 pedestrian and hazard estimator: estimates the eight 183 keys from demonstrated decisions while
 * keeping the yield decision, the two clearance minima, the reaction delay, the emergency intensity,
 * the evasion willingness, the crosswalk approach speed and the horn in eight separate contexts.
 *
 * The estimator inverts the delivered `183-hazard-policy-v2` arithmetic instead of inventing a second
 * pedestrian, hazard or collision system: every value is measured from facts the delivered command
 * already reports (the crossing decision with its deterministic sample, the clearance speed cap and
 * the room it was computed from, the reaction delay with its inherited M delay and its feasibility
 * ceiling, the commanded emergency deceleration with its adhesion limit, the once-per-opportunity
 * evasion sample with the verified lateral space, the crosswalk command and the horn sample). It
 * never reads an R profile value, because those are the quantities under measurement. It is
 * candidate-only: it never publishes a profile, never writes to a store, never flips a 092
 * `implemented` flag and never changes the 183 semantics. It reads the key list, the tick rate, the
 * clearance reserve, the standard gravity and the fixed sample keys directly from 183, and the
 * catalog ranges from the 092 registry, so measurement and decision use the same constants.
 *
 * **The two identifiability traps of this module.**
 *
 * 1. The two clearances are *speed caps*, `sqrt(2 · comfort_deceleration · room)`, and the room is
 *    `distance − max(key, physical minimum)`. The cap therefore mixes the key with the delivered M
 *    `comfort_deceleration`, so the key is only isolable when the M deceleration of that same tick is
 *    known: the estimator recovers the room from the reported cap and the declared M and refuses the
 *    sample (`CLEARANCE_M_UNKNOWN`) when the M value is absent, and refuses it as
 *    `CLEARANCE_M_INCONSISTENT` when the declared M does not reproduce the reported cap. A clearance
 *    raised by the physical minimum (`floored`) says only `key <= minimum`, and a hazard already
 *    inside the effective clearance (`room = 0`) commands 0 m/s without saying anything about the
 *    key: both are refused, never interpreted.
 * 2. `hazard_reaction_delay` is added to the delivered M `brake_reaction_delay` and then truncated by
 *    physics, `min(M + key, (room − v² / (2 · capability)) / v)`. A saturated delay only proves
 *    `key >= cap − M`, so it is refused as `REACTION_DELAY_SATURATED` instead of being read as an
 *    estimate: the observation must be *unsaturated* for `delayS − inheritedDelayS` to be the key.
 *
 * 1. `pedestrian_yield_probability` (probability) — one deterministic sample per identified crossing
 *    opportunity decides the yield (`sample < key`), but only where the crossing is discretionary:
 *    a pedestrian that cannot clear the ego path inside the delivered `yield_time_gap` is a mandatory
 *    yield at every key value and is excluded from the denominator. The denominator is the number of
 *    distinct discretionary opportunities, never the number of frames.
 * 2. `pedestrian_clearance` (m) — the desired space to a pedestrian, measured from the reported
 *    speed cap and the declared M comfort deceleration; a value under the physical floor
 *    `width + reserve` is unobservable.
 * 3. `hazard_reaction_delay` (s) — the delay above the delivered M `brake_reaction_delay`, measured
 *    only on an unsaturated reaction.
 * 4. `obstacle_clearance` (m) — the same cap inversion against an authored obstacle box, whose half
 *    width joins the physical floor, so a barrier asks for more space than a cone.
 * 5. `emergency_brake_intensity` (ratio) — the fraction of the class brake capability, measured only
 *    where the adhesion limit does not bind: `deceleration / brakeAcceleration`.
 * 6. `evasive_steer_willingness` (probability) — one deterministic sample per verified lateral
 *    opportunity: an admission proves `key > sample`, a refusal proves `key <= sample`, and the
 *    estimate is their intersection. Without the physical lateral margin no sample is drawn.
 * 7. `crosswalk_approach_speed` (m/s) — the speed commanded on an approach, `min(key, postedLimit)`;
 *    a command equal to the authored limit only proves `key >= postedLimit` and is refused.
 * 8. `horn_use_probability` (probability) — one deterministic sample per permitted opportunity, the
 *    same intersection. Where the world forbids the horn no sample is drawn and the key is inert.
 */
export const HAZARD_V2_ESTIMATOR_VERSION = '184-hazard-estimator-v1' as const;
export const HAZARD_V2_ESTIMATOR_KEYS = HAZARD_POLICY_V2_KEYS;
export type HazardV2EstimatorKey = HazardPolicyV2Key;
export type HazardV2EstimatorScenario =
  | 'PEDESTRIAN_CROSSING'
  | 'PEDESTRIAN_CLEARANCE_APPROACH'
  | 'HAZARD_REACTION'
  | 'OBSTACLE_CLEARANCE_APPROACH'
  | 'EMERGENCY_BRAKE'
  | 'EVASION_OPPORTUNITY'
  | 'CROSSWALK_APPROACH'
  | 'HORN_OPPORTUNITY';

export const hazardV2EstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'NO_PEDESTRIAN_CROSSING',
  'PEDESTRIAN_ALL_CROSSINGS_MANDATORY',
  'PEDESTRIAN_CROSSING_STANDSTILL',
  'PEDESTRIAN_SAMPLE_MISSING',
  'NO_PEDESTRIAN_CLEARANCE',
  'CLEARANCE_M_UNKNOWN',
  'CLEARANCE_M_INCONSISTENT',
  'CLEARANCE_FLOOR_SATURATED',
  'CLEARANCE_ROOM_EXHAUSTED',
  'CLEARANCE_HAZARD_UNKNOWN',
  'NO_HAZARD_REACTION',
  'REACTION_M_UNKNOWN',
  'REACTION_M_INCONSISTENT',
  'REACTION_DELAY_SATURATED',
  'REACTION_STOPPING_DISTANCE_EXCEEDED',
  'REACTION_DELAY_INCONSISTENT',
  'REACTION_DELAY_BELOW_INHERITED',
  'REACTION_ROOM_EXHAUSTED',
  'NO_OBSTACLE_CLEARANCE',
  'NO_EMERGENCY_BRAKE',
  'EMERGENCY_CAPABILITY_UNKNOWN',
  'EMERGENCY_GEOMETRY_INCONSISTENT',
  'ADHESION_CAP_SATURATED',
  'NO_EVASION_OPPORTUNITY',
  'EVASION_NO_SPACE',
  'EVASION_SAMPLE_MISSING',
  'EVASION_REFUSAL_BAND_TOO_WIDE',
  'CONTRADICTORY_EVASION_BOUNDS',
  'NO_CROSSWALK_APPROACH',
  'CROSSWALK_LIMIT_SATURATED',
  'CROSSWALK_NO_COMMAND',
  'NO_HORN_OPPORTUNITY',
  'HORN_FORBIDDEN',
  'HORN_SAMPLE_MISSING',
  'HORN_REFUSAL_BAND_TOO_WIDE',
  'CONTRADICTORY_HORN_BOUNDS',
] as const;
export type HazardV2EstimatorReason = (typeof hazardV2EstimatorReasons)[number];

export const hazardV2EpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type HazardV2EpisodeRefusal = (typeof hazardV2EpisodeRefusals)[number];

/**
 * The closed 183 reason vocabulary. The exhaustive record makes the mirror checkable by the
 * compiler: a new policy reason must be added here before it can become measurement evidence.
 */
const evidenceReasonSet: Readonly<Record<HazardPolicyV2Reason, true>> = Object.freeze({
  HAZARD_POLICY_V2: true,
  NO_AUTO_AUTHORITY: true,
  MISSING_PROFILE: true,
  FOREIGN_OR_STALE_OBSERVATION: true,
  FREE_ROAD: true,
  PEDESTRIAN_MANDATORY_YIELD: true,
  PEDESTRIAN_YIELD: true,
  PEDESTRIAN_PROCEED: true,
  PEDESTRIAN_CLEARANCE: true,
  OBSTACLE_CLEARANCE: true,
  HAZARD_REACTION: true,
  HAZARD_REACTION_SATURATED: true,
  HAZARD_STOPPING_DISTANCE_EXCEEDED: true,
  EVASION_NO_SPACE: true,
  EVASION_REFUSED: true,
  EVASION_COMMITTED: true,
  CROSSWALK_APPROACH: true,
  HORN_USED: true,
  HORN_REFUSED: true,
  HORN_FORBIDDEN: true,
});
export const hazardV2EvidenceReasons: readonly HazardPolicyV2Reason[] = Object.freeze(
  Object.keys(evidenceReasonSet) as HazardPolicyV2Reason[],
);
/** The 183 reasons that mean the layer never applied the keys, i.e. no demonstration at all. */
const admissionRefusals: ReadonlySet<HazardPolicyV2Reason> = new Set<HazardPolicyV2Reason>([
  'HAZARD_POLICY_V2',
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'FOREIGN_OR_STALE_OBSERVATION',
]);
/** True only for a 183 tick that applied the keys; a refused input is never a demonstration. */
export function hazardV2PolicyActive(reason: HazardPolicyV2Reason): boolean {
  return !admissionRefusals.has(reason);
}
const actions: readonly HazardPolicyV2Action[] = Object.freeze([
  'PROCEED',
  'SLOW',
  'YIELD',
  'BRAKE',
  'EVADE',
  'UNAVAILABLE',
]);
const pedestrianStates: readonly HazardPedestrianState[] = Object.freeze([
  'ON_SIDEWALK',
  'WAITING',
  'CROSSING',
  'CROSSED',
  'WITHDRAWN',
]);
const stimulusKinds = ['PEDESTRIAN', 'OBSTACLE'] as const;
const evasionSides = ['LEFT', 'RIGHT'] as const;
const surfaces: readonly RoadSurfaceId[] = Object.freeze(['dry-asphalt', 'reduced-adhesion']);
const classIds: readonly VehicleClassId[] = Object.freeze(['sedan', 'compact']);

export const HAZARD_V2_ESTIMATOR_LIMITS = Object.freeze({
  version: HAZARD_V2_ESTIMATOR_VERSION,
  idCodeUnits: HAZARD_POLICY_V2_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  tickHz: HAZARD_POLICY_V2_LIMITS.tickHz,
  maximumTimeS: HAZARD_POLICY_V2_LIMITS.maximumTimeS,
  maximumDistanceM: HAZARD_POLICY_V2_LIMITS.maximumDistanceM,
  maximumSpeedMps: HAZARD_POLICY_V2_LIMITS.maximumSpeedMps,
  /** The 183 physical floor of both clearances, read from the policy instead of restated. */
  clearanceReserveM: HAZARD_POLICY_V2_LIMITS.clearanceReserveM,
  standardGravityMps2: HAZARD_POLICY_V2_LIMITS.standardGravityMps2,
  /** Bound of the 086 occurrence ordinal; an occurrence is a counter, never a tick. */
  maximumOccurrence: 1_000_000,
  maximumTicksPerEpisode: 100_000,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  /** Tolerance of the report/validation arithmetic, never of the physics. */
  ratioTolerance: 1e-9,
  /** A recovered room must reproduce the reported one; this is a consistency check, not physics. */
  capConsistencyToleranceM: 1e-6,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  uncertaintyFloor: Object.freeze({
    pedestrian_yield_probability: 0.02,
    pedestrian_clearance: 0.02,
    hazard_reaction_delay: 0.02,
    obstacle_clearance: 0.02,
    emergency_brake_intensity: 0.02,
    evasive_steer_willingness: 0.02,
    crosswalk_approach_speed: 0.05,
    horn_use_probability: 0.02,
  }),
  maximumUncertainty: Object.freeze({
    pedestrian_yield_probability: 0.15,
    pedestrian_clearance: 0.15,
    hazard_reaction_delay: 0.2,
    obstacle_clearance: 0.15,
    emergency_brake_intensity: 0.15,
    evasive_steer_willingness: 0.15,
    crosswalk_approach_speed: 0.5,
    horn_use_probability: 0.15,
  }),
  validationTolerance: Object.freeze({
    pedestrian_yield_probability: 0.15,
    pedestrian_clearance: 0.15,
    hazard_reaction_delay: 0.15,
    obstacle_clearance: 0.15,
    emergency_brake_intensity: 0.15,
    evasive_steer_willingness: 0.15,
    crosswalk_approach_speed: 0.5,
    horn_use_probability: 0.15,
  }),
  retainedHistory: 0,
});

export const hazardV2EligibleScenarios: Readonly<
  Record<HazardV2EstimatorKey, HazardV2EstimatorScenario>
> = Object.freeze({
  pedestrian_yield_probability: 'PEDESTRIAN_CROSSING',
  pedestrian_clearance: 'PEDESTRIAN_CLEARANCE_APPROACH',
  hazard_reaction_delay: 'HAZARD_REACTION',
  obstacle_clearance: 'OBSTACLE_CLEARANCE_APPROACH',
  emergency_brake_intensity: 'EMERGENCY_BRAKE',
  evasive_steer_willingness: 'EVASION_OPPORTUNITY',
  crosswalk_approach_speed: 'CROSSWALK_APPROACH',
  horn_use_probability: 'HORN_OPPORTUNITY',
});

export const hazardV2EligibleContexts: Readonly<Record<HazardV2EstimatorKey, string>> =
  Object.freeze({
    pedestrian_yield_probability:
      'o traversare reală 164 în care 183 a extras eșantionul determinist `pedestrian-yield` și ' +
      'traversarea nu este un conflict fizic (marja peste `yield_time_gap`): cedarea dovedește ' +
      '`cheie > eșantion`, trecerea dovedește `cheie ≤ eșantion`, iar numitorul este numărul de ' +
      'oportunități distincte, niciodată numărul de cadre',
    pedestrian_clearance:
      'un tick cu plafon de viteză față de un pieton, peste podeaua fizică `lățime + 0,5 m`, cu ' +
      '`comfort_deceleration` M declarat: camera se recuperează din `plafon² / (2 · comfort)` și ' +
      'cheia este `distanță − cameră`; fără M cunoscut cheia nu se poate izola de plafon',
    hazard_reaction_delay:
      'un stimul 165 observabil cu reacție **nesaturată**: `delayS − brake_reaction_delay` este cheia, ' +
      'iar o întârziere tăiată de plafonul de oprire dovedește doar o margine inferioară',
    obstacle_clearance:
      'același plafon de viteză, față de o cutie de obstacol autorată, peste podeaua fizică ' +
      '`lățime/2 + jumătate de cutie + 0,5 m`, cu `comfort_deceleration` M declarat',
    emergency_brake_intensity:
      'o frânare de urgență pe o suprafață cu aderență cunoscută, **sub** plafonul de aderență: ' +
      '`decelerație / brakeAcceleration` este chiar cheia, iar o decelerație plafonată de anvelopă ' +
      'nu spune nimic despre intensitate',
    evasive_steer_willingness:
      'o oportunitate de ocolire cu spațiu lateral verificat peste marja fizică, în care 183 a extras ' +
      'eșantionul determinist `evasion`: acceptarea dovedește `cheie > eșantion`, refuzul dovedește ' +
      '`cheie ≤ eșantion`',
    crosswalk_approach_speed:
      'o apropiere de trecere autorată în care comanda este **sub** limita postată: ' +
      '`min(cheie, limită)` sub limită este cheia, iar o comandă egală cu limita este doar o margine ' +
      'inferioară',
    horn_use_probability:
      'o oportunitate 165 în care lumea permite claxonul și 183 a extras eșantionul determinist ' +
      '`horn`: folosirea dovedește `cheie > eșantion`, refuzul dovedește `cheie ≤ eșantion`; unde ' +
      'claxonul este interzis nu se trage niciun eșantion',
  });

export const hazardV2GroupConstraints = Object.freeze([
  Object.freeze({
    id: 'CLEARANCE_SPEED_CAP_DEPENDS_ON_M',
    keys: Object.freeze(['pedestrian_clearance', 'obstacle_clearance'] as const),
    explanation:
      '183 nu raportează spațiul ca poziție, ci ca plafon de viteză `sqrt(2 · comfort_deceleration · ' +
      'cameră)`, unde camera este `distanță − max(cheie, minim fizic)`. Plafonul amestecă deci cheia ' +
      'cu cheia M `comfort_deceleration`: ca să izolezi cheia trebuie să cunoști decelerația de ' +
      'confort din același tick. Estimatorul recuperează camera din plafon și M declarat și refuză ' +
      'proba când M lipsește (`CLEARANCE_M_UNKNOWN`) sau când M declarat nu reproduce plafonul ' +
      'raportat (`CLEARANCE_M_INCONSISTENT`); nu presupune niciodată o valoare de confort.',
  }),
  Object.freeze({
    id: 'CLEARANCE_FLOOR_HIDES_SMALL_VALUES',
    keys: Object.freeze(['pedestrian_clearance', 'obstacle_clearance'] as const),
    explanation:
      'Spațiul efectiv este `max(cheie, minim fizic)`, cu minimul `lățime + 0,5 m` față de pieton ' +
      '(2,30 m pentru sedan) și `lățime/2 + jumătate de cutie + 0,5 m` față de obstacol (1,70 m ' +
      'pentru con, 3,40 m pentru barieră). Sub podea toate cheile produc aceeași comandă, deci banda ' +
      '0,10–2,30 m (respectiv 0,10–1,70 m) a catalogului este ascunsă: o probă ridicată de podea ' +
      'dovedește doar `cheie ≤ minim` și rămâne `CLEARANCE_FLOOR_SATURATED`.',
  }),
  Object.freeze({
    id: 'REACTION_CAP_HIDES_LARGE_DELAYS',
    keys: Object.freeze(['hazard_reaction_delay'] as const),
    explanation:
      'Întârzierea totală este `min(brake_reaction_delay + cheie, (cameră − v² / (2 · capability)) / v)`. ' +
      'Peste plafonul fezabil politica saturează și raportează `saturated`, deci o asemenea probă ' +
      'dovedește doar `cheie ≥ plafon − M` și nu este o estimare: catalogul merge până la 3 s, dar ' +
      'dintr-un stimul apropiat și rapid sunt observabile numai întârzierile care încă mai opresc ' +
      'vehiculul în camera declarată (`REACTION_DELAY_SATURATED`).',
  }),
  Object.freeze({
    id: 'ADHESION_CAP_HIDES_HIGH_INTENSITIES',
    keys: Object.freeze(['emergency_brake_intensity'] as const),
    explanation:
      'Decelerația comandată este `min(cheie · brakeAcceleration, grip · tireGripScale · g)`. Pe ' +
      '`reduced-adhesion` plafonul fizic este 4,463550 m/s², sub capacitatea de frânare de 8 m/s², ' +
      'deci orice intensitate peste 0,557944 produce aceeași frânare la limita anvelopei: proba este ' +
      'refuzată (`ADHESION_CAP_SATURATED`) în loc să fie citită ca intensitate.',
  }),
  Object.freeze({
    id: 'HAZARD_IN_MARGIN_COMMANDS_ZERO_WITHOUT_CLEARANCE',
    keys: Object.freeze(['pedestrian_clearance', 'obstacle_clearance'] as const),
    explanation:
      'Când hazardul este deja în interiorul spațiului efectiv, `camera = max(0, distanță − spațiu)` ' +
      'este zero, plafonul de viteză este 0 și comanda este 0 m/s la orice valoare a cheii. Oprirea ' +
      'demonstrează siguranța, nu spațiul dorit: proba rămâne `CLEARANCE_ROOM_EXHAUSTED` și nu ' +
      'devine o valoare mică inventată.',
  }),
  Object.freeze({
    id: 'YIELD_AND_HORN_ARE_BINARY_OPPORTUNITIES',
    keys: Object.freeze(['pedestrian_yield_probability', 'horn_use_probability'] as const),
    explanation:
      'Cedarea și claxonul sunt decizii binare pe oportunități identificate, nu rate pe cadre: ' +
      'numitorul este numărul de traversări (respectiv de oportunități de claxon) distincte, iar un ' +
      'eșantion se trage o singură dată per oportunitate. O cedare obligatorie (pietonul nu poate ' +
      'elibera calea în `yield_time_gap`) nu este o decizie de stil și iese din numitor, iar unde ' +
      'claxonul este interzis nu se trage niciun eșantion.',
  }),
  Object.freeze({
    id: 'EVASION_DEPENDS_ON_VERIFIED_SPACE',
    keys: Object.freeze(['evasive_steer_willingness'] as const),
    explanation:
      'Disponibilitatea de ocolire este inertă sub marja fizică `lățime/2 + jumătate de cutie + 0,5 m`: ' +
      'fără spațiul lateral verificat, 183 nu trage eșantion și nu se deplasează, la orice valoare a ' +
      'cheii. O asemenea oportunitate nu spune nimic despre disponibilitate și rămâne ' +
      '`EVASION_NO_SPACE`.',
  }),
  Object.freeze({
    id: 'HAZARD_KEYS_FROM_ONE_TICK',
    keys: HAZARD_POLICY_V2_KEYS,
    explanation:
      'Ordinea ramurilor 183 hotărăște ce fapte există într-un tick: traversarea, cele două plafoane ' +
      'de spațiu, apropierea de trecere, reacția cu frânarea de urgență, ocolirea și claxonul. Un ' +
      'tick poate purta simultan cedarea și plafonul de spațiu față de pieton, dar nicio cheie nu ' +
      'este dedusă din alta: un set cu un singur tip de demonstrație lasă celelalte chei ' +
      'neobservate.',
  }),
]);

/** The clearance channel 183 reports: a cap, the room it was computed from, and the physical floor. */
export interface HazardV2EvidenceClearance {
  readonly desiredM: number;
  readonly effectiveM: number;
  readonly minimumM: number;
  /** True when the physical floor raised the desired value. */
  readonly floored: boolean;
  readonly distanceM: number;
  readonly roomM: number;
  readonly speedCapMps: number;
  readonly stopNow: boolean;
}
export interface HazardV2EvidencePedestrian {
  readonly pedestrianId: string;
  readonly state: HazardPedestrianState;
  readonly distanceM: number;
  readonly crossingRemainingS: number | null;
  readonly gapS: number | null;
  readonly yieldGapS: number;
  readonly mandatoryYield: boolean;
  readonly sample: number | null;
  readonly yielded: boolean;
}
export interface HazardV2EvidenceReaction {
  readonly stimulusId: string;
  readonly kind: 'PEDESTRIAN' | 'OBSTACLE';
  readonly roomM: number;
  readonly closingSpeedMps: number;
  readonly capabilityMps2: number;
  readonly stoppingDistanceM: number;
  /** The delivered M `brake_reaction_delay` the policy inherited. */
  readonly inheritedDelayS: number;
  /** `inheritedDelayS + hazard_reaction_delay`, before the feasibility cap. */
  readonly demandedDelayS: number;
  readonly maximumFeasibleDelayS: number;
  readonly delayS: number;
  readonly saturated: boolean;
  readonly stoppingMarginM: number;
  readonly feasible: boolean;
}
export interface HazardV2EvidenceEmergency {
  readonly intensity: number;
  readonly brakeCapabilityMps2: number;
  readonly adhesionLimitMps2: number;
  readonly requestedDecelerationMps2: number;
  readonly decelerationMps2: number;
  readonly adhesionLimited: boolean;
}
export interface HazardV2EvidenceEvasion {
  readonly side: 'LEFT' | 'RIGHT';
  readonly lateralSpaceM: number;
  readonly requiredSpaceM: number;
  readonly spareM: number;
  readonly timeToObstacleS: number;
  readonly lateralAccelMps2: number;
  readonly reachableOffsetM: number;
  readonly sample: number | null;
  readonly willing: boolean;
  readonly feasible: boolean;
  readonly offsetM: number;
}
export interface HazardV2EvidenceCrosswalk {
  readonly crosswalkId: string;
  readonly distanceM: number;
  readonly postedLimitMps: number;
  readonly preferredSpeedMps: number;
  readonly commandedSpeedMps: number;
}
export interface HazardV2EvidenceHorn {
  readonly opportunityId: string;
  readonly permitted: boolean;
  readonly sample: number | null;
  readonly used: boolean;
}
/** The mechanical and surface facts the policy reported for this tick. */
export interface HazardV2EvidenceGeometry {
  readonly classId: VehicleClassId;
  readonly widthM: number;
  readonly brakeAccelerationMps2: number;
  readonly adhesionLimitMps2: number;
  readonly brakeCapabilityMps2: number;
}
/**
 * The four delivered M keys of the episode, as the caller observed them. `null` marks a stream that
 * did not record the M value that composed the profile: the two clearance keys and the reaction delay
 * then cannot be isolated and stay unobserved.
 */
export interface HazardV2EvidenceDeclaredM {
  readonly comfortDecelerationMps2: number | null;
  readonly brakeReactionDelayS: number | null;
  readonly curveLateralAccelMps2: number | null;
  readonly yieldTimeGapS: number | null;
}
export interface HazardV2EvidenceSample {
  readonly tick: number;
  readonly speedMps: number;
  readonly postedLimitMps: number;
  readonly policyActive: boolean;
  readonly reason: HazardPolicyV2Reason;
  readonly action: HazardPolicyV2Action;
  readonly geometry: HazardV2EvidenceGeometry;
  readonly surfaceId: RoadSurfaceId;
  readonly declaredM: HazardV2EvidenceDeclaredM;
  readonly pedestrian: HazardV2EvidencePedestrian | null;
  readonly obstacleId: string | null;
  readonly clearance: Readonly<{
    pedestrian: HazardV2EvidenceClearance | null;
    obstacle: HazardV2EvidenceClearance | null;
  }>;
  readonly reaction: HazardV2EvidenceReaction | null;
  readonly emergencyBrake: HazardV2EvidenceEmergency | null;
  readonly evasion: HazardV2EvidenceEvasion | null;
  readonly crosswalk: HazardV2EvidenceCrosswalk | null;
  readonly horn: HazardV2EvidenceHorn | null;
}
export interface HazardV2EvidenceEpisode {
  /** Stable episode identity; the split hashes it and never the samples. */
  readonly episodeId: string;
  /** 086 occurrence ordinal of the same episode; a counter, never a tick. */
  readonly occurrence: number;
  /** The 070/086 eligibility record that admitted the segment. */
  readonly eligibility: EligibilityWindowRecord;
  /** The 071/085 filtered window whose usable prefix bounds the samples. */
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly HazardV2EvidenceSample[];
}
export interface HazardV2EstimatorInput {
  readonly episodes: readonly HazardV2EvidenceEpisode[];
  /** Explicit, deterministic split seed; it changes the split, never the measurements. */
  readonly splitSeed: number;
}
export interface HazardV2Validation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}
export interface HazardV2KeyEstimate {
  readonly key: HazardV2EstimatorKey;
  readonly scenario: HazardV2EstimatorScenario;
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
  readonly reason: HazardV2EstimatorReason | null;
  readonly validation: HazardV2Validation;
}
export interface HazardV2Compatibility {
  readonly policyVersion: '183-hazard-policy-v2';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  readonly mReadByPolicy: readonly string[];
  readonly tickHz: number;
  readonly clearanceReserveM: number;
  readonly standardGravityMps2: number;
  readonly reportedQuantity: Readonly<Record<HazardV2EstimatorKey, string>>;
  readonly catalogRanges: Readonly<
    Record<
      HazardV2EstimatorKey,
      { readonly min: number; readonly max: number; readonly unit: string }
    >
  >;
}
export interface HazardV2EstimatorResult {
  readonly version: typeof HAZARD_V2_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<HazardV2EstimatorKey, HazardV2KeyEstimate>>;
  readonly groupConstraints: typeof hazardV2GroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: HazardV2EpisodeRefusal;
  }[];
  readonly split: readonly {
    readonly episodeId: string;
    readonly side: 'ESTIMATE' | 'VALIDATION';
  }[];
  readonly compatibility: HazardV2Compatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly policyActive: boolean;
  readonly speedMps: number;
  readonly postedLimitMps: number;
  readonly geometry: HazardV2EvidenceGeometry;
  readonly declaredM: HazardV2EvidenceDeclaredM;
  readonly pedestrian: HazardV2EvidencePedestrian | null;
  readonly obstacleId: string | null;
  readonly clearance: Readonly<{
    pedestrian: HazardV2EvidenceClearance | null;
    obstacle: HazardV2EvidenceClearance | null;
  }>;
  readonly reaction: HazardV2EvidenceReaction | null;
  readonly emergencyBrake: HazardV2EvidenceEmergency | null;
  readonly evasion: HazardV2EvidenceEvasion | null;
  readonly crosswalk: HazardV2EvidenceCrosswalk | null;
  readonly horn: HazardV2EvidenceHorn | null;
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
    value.length > HAZARD_V2_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid hazard evidence ${field}`);
  return value;
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid hazard evidence ${field}`);
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
    fail(`Invalid hazard evidence ${field}`);
  return value;
}
function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') fail(`Invalid hazard evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
const limit = HAZARD_V2_ESTIMATOR_LIMITS;

function admitClearance(value: unknown, field: string): HazardV2EvidenceClearance | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') fail(`Invalid hazard evidence ${field}`);
  const clearance = value as HazardV2EvidenceClearance;
  return Object.freeze({
    desiredM: finite(clearance.desiredM, 0, limit.maximumDistanceM, `${field} desired`),
    effectiveM: finite(clearance.effectiveM, 0, limit.maximumDistanceM, `${field} effective`),
    minimumM: finite(clearance.minimumM, 0, limit.maximumDistanceM, `${field} minimum`),
    floored: flag(clearance.floored, `${field} floored flag`),
    distanceM: finite(clearance.distanceM, 0, limit.maximumDistanceM, `${field} distance`),
    roomM: finite(clearance.roomM, 0, limit.maximumDistanceM, `${field} room`),
    speedCapMps: finite(clearance.speedCapMps, 0, limit.maximumSpeedMps, `${field} speed cap`),
    stopNow: flag(clearance.stopNow, `${field} stop flag`),
  });
}
function admitPedestrian(value: unknown): HazardV2EvidencePedestrian | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence pedestrian');
  const pedestrian = value as HazardV2EvidencePedestrian;
  if (!pedestrianStates.includes(pedestrian.state))
    fail('Invalid hazard evidence pedestrian state');
  const crossingRemainingS = optionalFinite(
      pedestrian.crossingRemainingS,
      0,
      limit.maximumTimeS,
      'pedestrian crossing remaining',
    ),
    sample = optionalFinite(pedestrian.sample, 0, 1, 'pedestrian yield sample');
  if ((pedestrian.state === 'CROSSING') !== (crossingRemainingS !== null))
    fail('A crossing pedestrian must declare exactly the remaining crossing time');
  return Object.freeze({
    pedestrianId: identity(pedestrian.pedestrianId, 'pedestrian id'),
    state: pedestrian.state,
    distanceM: finite(pedestrian.distanceM, 0, limit.maximumDistanceM, 'pedestrian distance'),
    crossingRemainingS,
    gapS: optionalFinite(
      pedestrian.gapS,
      -limit.maximumTimeS,
      limit.maximumTimeS,
      'pedestrian gap',
    ),
    yieldGapS: finite(pedestrian.yieldGapS, 0, limit.maximumTimeS, 'pedestrian yield gap'),
    mandatoryYield: flag(pedestrian.mandatoryYield, 'pedestrian mandatory flag'),
    sample,
    yielded: flag(pedestrian.yielded, 'pedestrian yielded flag'),
  });
}
function admitReaction(value: unknown): HazardV2EvidenceReaction | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence reaction');
  const reaction = value as HazardV2EvidenceReaction;
  if (!stimulusKinds.includes(reaction.kind)) fail('Invalid hazard evidence stimulus kind');
  return Object.freeze({
    stimulusId: identity(reaction.stimulusId, 'stimulus id'),
    kind: reaction.kind,
    roomM: finite(reaction.roomM, 0, limit.maximumDistanceM, 'reaction room'),
    closingSpeedMps: finite(reaction.closingSpeedMps, 0, limit.maximumSpeedMps, 'reaction closing'),
    capabilityMps2: finite(reaction.capabilityMps2, 0, 100, 'reaction capability'),
    stoppingDistanceM: finite(
      reaction.stoppingDistanceM,
      0,
      limit.maximumDistanceM,
      'reaction stopping distance',
    ),
    inheritedDelayS: finite(reaction.inheritedDelayS, 0, limit.maximumTimeS, 'reaction inherited'),
    demandedDelayS: finite(reaction.demandedDelayS, 0, limit.maximumTimeS, 'reaction demanded'),
    maximumFeasibleDelayS: finite(
      reaction.maximumFeasibleDelayS,
      0,
      limit.maximumTimeS,
      'reaction feasible delay',
    ),
    delayS: finite(reaction.delayS, 0, limit.maximumTimeS, 'reaction delay'),
    saturated: flag(reaction.saturated, 'reaction saturated flag'),
    stoppingMarginM: finite(
      reaction.stoppingMarginM,
      -limit.maximumDistanceM,
      limit.maximumDistanceM,
      'reaction margin',
    ),
    feasible: flag(reaction.feasible, 'reaction feasible flag'),
  });
}
function admitEmergency(value: unknown): HazardV2EvidenceEmergency | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence emergency brake');
  const emergency = value as HazardV2EvidenceEmergency;
  return Object.freeze({
    intensity: finite(emergency.intensity, 0, 1, 'emergency intensity'),
    brakeCapabilityMps2: finite(emergency.brakeCapabilityMps2, 0, 100, 'emergency capability'),
    adhesionLimitMps2: finite(emergency.adhesionLimitMps2, 0, 100, 'emergency adhesion'),
    requestedDecelerationMps2: finite(
      emergency.requestedDecelerationMps2,
      0,
      100,
      'emergency requested',
    ),
    decelerationMps2: finite(emergency.decelerationMps2, 0, 100, 'emergency deceleration'),
    adhesionLimited: flag(emergency.adhesionLimited, 'emergency adhesion flag'),
  });
}
function admitEvasion(value: unknown): HazardV2EvidenceEvasion | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence evasion');
  const evasion = value as HazardV2EvidenceEvasion;
  if (!evasionSides.includes(evasion.side)) fail('Invalid hazard evidence evasion side');
  return Object.freeze({
    side: evasion.side,
    lateralSpaceM: finite(evasion.lateralSpaceM, 0, 20, 'evasion space'),
    requiredSpaceM: finite(evasion.requiredSpaceM, 0, 50, 'evasion required space'),
    spareM: finite(evasion.spareM, -50, 50, 'evasion spare'),
    timeToObstacleS: finite(evasion.timeToObstacleS, 0, limit.maximumTimeS, 'evasion time'),
    lateralAccelMps2: finite(evasion.lateralAccelMps2, 0, 100, 'evasion lateral accel'),
    reachableOffsetM: finite(evasion.reachableOffsetM, 0, limit.maximumDistanceM, 'evasion offset'),
    sample: optionalFinite(evasion.sample, 0, 1, 'evasion sample'),
    willing: flag(evasion.willing, 'evasion willing flag'),
    feasible: flag(evasion.feasible, 'evasion feasible flag'),
    offsetM: finite(evasion.offsetM, 0, limit.maximumDistanceM, 'evasion committed offset'),
  });
}
function admitCrosswalk(value: unknown): HazardV2EvidenceCrosswalk | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence crosswalk');
  const crosswalk = value as HazardV2EvidenceCrosswalk;
  return Object.freeze({
    crosswalkId: identity(crosswalk.crosswalkId, 'crosswalk id'),
    distanceM: finite(crosswalk.distanceM, 0, limit.maximumDistanceM, 'crosswalk distance'),
    postedLimitMps: finite(
      crosswalk.postedLimitMps,
      0.1,
      limit.maximumSpeedMps,
      'crosswalk posted limit',
    ),
    preferredSpeedMps: finite(
      crosswalk.preferredSpeedMps,
      0,
      limit.maximumSpeedMps,
      'crosswalk preferred speed',
    ),
    commandedSpeedMps: finite(
      crosswalk.commandedSpeedMps,
      0,
      limit.maximumSpeedMps,
      'crosswalk commanded speed',
    ),
  });
}
function admitHorn(value: unknown): HazardV2EvidenceHorn | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence horn');
  const horn = value as HazardV2EvidenceHorn;
  return Object.freeze({
    opportunityId: identity(horn.opportunityId, 'horn opportunity id'),
    permitted: flag(horn.permitted, 'horn permitted flag'),
    sample: optionalFinite(horn.sample, 0, 1, 'horn sample'),
    used: flag(horn.used, 'horn used flag'),
  });
}
function admitGeometry(value: unknown): HazardV2EvidenceGeometry {
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence geometry');
  const geometry = value as HazardV2EvidenceGeometry;
  if (!classIds.includes(geometry.classId)) fail('Invalid hazard evidence vehicle class');
  return Object.freeze({
    classId: geometry.classId,
    widthM: finite(geometry.widthM, 0, 10, 'geometry width'),
    brakeAccelerationMps2: finite(geometry.brakeAccelerationMps2, 0, 100, 'geometry brake'),
    adhesionLimitMps2: finite(geometry.adhesionLimitMps2, 0, 100, 'geometry adhesion'),
    brakeCapabilityMps2: finite(geometry.brakeCapabilityMps2, 0, 100, 'geometry capability'),
  });
}
function admitDeclaredM(value: unknown): HazardV2EvidenceDeclaredM {
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence declared M');
  const declared = value as HazardV2EvidenceDeclaredM;
  return Object.freeze({
    comfortDecelerationMps2: optionalFinite(
      declared.comfortDecelerationMps2,
      0,
      100,
      'declared comfort deceleration',
    ),
    brakeReactionDelayS: optionalFinite(
      declared.brakeReactionDelayS,
      0,
      limit.maximumTimeS,
      'declared brake reaction delay',
    ),
    curveLateralAccelMps2: optionalFinite(
      declared.curveLateralAccelMps2,
      0,
      100,
      'declared curve lateral acceleration',
    ),
    yieldTimeGapS: optionalFinite(
      declared.yieldTimeGapS,
      0,
      limit.maximumTimeS,
      'declared yield time gap',
    ),
  });
}
function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence sample');
  const sample = value as HazardV2EvidenceSample,
    clearance = sample.clearance;
  if (!clearance || typeof clearance !== 'object')
    fail('Invalid hazard evidence clearance channel');
  if (!(hazardV2EvidenceReasons as readonly string[]).includes(sample.reason))
    fail('Invalid hazard evidence sample reason');
  if (!actions.includes(sample.action)) fail('Invalid hazard evidence sample action');
  if (!surfaces.includes(sample.surfaceId)) fail('Invalid hazard evidence surface');
  return Object.freeze({
    tick: count(sample.tick, limit.maximumTimeS * limit.tickHz, 'sample tick'),
    policyActive: flag(sample.policyActive, 'sample policy flag'),
    speedMps: finite(sample.speedMps, 0, limit.maximumSpeedMps, 'sample speed'),
    postedLimitMps: finite(
      sample.postedLimitMps,
      0.1,
      limit.maximumSpeedMps,
      'sample posted limit',
    ),
    geometry: admitGeometry(sample.geometry),
    surfaceId: sample.surfaceId,
    declaredM: admitDeclaredM(sample.declaredM),
    pedestrian: admitPedestrian(sample.pedestrian),
    obstacleId: optionalIdentity(sample.obstacleId, 'sample obstacle id'),
    clearance: Object.freeze({
      pedestrian: admitClearance(clearance.pedestrian, 'pedestrian clearance'),
      obstacle: admitClearance(clearance.obstacle, 'obstacle clearance'),
    }),
    reaction: admitReaction(sample.reaction),
    emergencyBrake: admitEmergency(sample.emergencyBrake),
    evasion: admitEvasion(sample.evasion),
    crosswalk: admitCrosswalk(sample.crosswalk),
    horn: admitHorn(sample.horn),
  });
}
function admitEpisode(value: unknown): AdmittedEpisode | HazardV2EpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid hazard evidence episode');
  const episode = value as HazardV2EvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, limit.maximumOccurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid hazard evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid hazard evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid hazard evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched hazard evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Hazard evidence samples are not strictly ordered');
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
/** The reason that refused most observations, so a refusal is reported with its real cause. */
function dominantExclusion(
  counts: ReadonlyMap<string, number>,
  fallback: HazardV2EstimatorReason,
): HazardV2EstimatorReason {
  let best: string | null = null,
    bestCount = 0;
  for (const [reason, value] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
    if (value > bestCount) {
      best = reason;
      bestCount = value;
    }
  return best === null ? fallback : (best as HazardV2EstimatorReason);
}
function frozenCounts(counts: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries([...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))));
}
function catalogRange(key: HazardV2EstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function frozen<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}
function emptyValidation(key: HazardV2EstimatorKey): HazardV2Validation {
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
  key: HazardV2EstimatorKey,
  reason: HazardV2EstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: HazardV2Validation = emptyValidation(key),
  uncertainty: number | null = null,
): HazardV2KeyEstimate {
  return Object.freeze({
    key,
    scenario: hazardV2EligibleScenarios[key],
    unit: getParameterDefinition(key).unit,
    eligibleContext: hazardV2EligibleContexts[key],
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
  key: HazardV2EstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: HazardV2Validation,
): HazardV2KeyEstimate | HazardV2EstimatorReason {
  if (uncertainty > limit.maximumUncertainty[key]) return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    scenario: hazardV2EligibleScenarios[key],
    unit: range.unit,
    eligibleContext: hazardV2EligibleContexts[key],
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
/** Continuous validation: the held-out median must match the estimate inside the tolerance. */
function continuousValidation(
  key: HazardV2EstimatorKey,
  estimate: number,
  values: readonly number[],
): HazardV2Validation {
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
  key: HazardV2EstimatorKey,
  estimate: number,
  lower: number | null,
  upper: number | null,
  episodes: number,
): HazardV2Validation {
  const tolerance = limit.validationTolerance[key],
    unit = getParameterDefinition(key).unit;
  if (lower === null && upper === null) return emptyValidation(key);
  const value = ((lower ?? 0) + (upper ?? 1)) / 2,
    error = Math.abs(value - estimate);
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
/** Pooled validation of a probability: the held-out opportunities must reproduce the rate. */
function rateValidation(
  key: HazardV2EstimatorKey,
  estimate: number,
  episodes: readonly RateEpisode[],
): HazardV2Validation {
  const tolerance = limit.validationTolerance[key],
    opportunities = episodes.reduce((sum, entry) => sum + entry.opportunities, 0);
  if (opportunities === 0) return emptyValidation(key);
  const successes = episodes.reduce((sum, entry) => sum + entry.successes, 0),
    value = successes / opportunities,
    error = Math.abs(value - estimate);
  if (episodes.length < limit.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: episodes.length,
      value,
      error,
      tolerance,
      detail: `validation set has ${episodes.length} of the required ${limit.minimumValidationEpisodes} episodes`,
    });
  return Object.freeze({
    status: error <= tolerance ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: episodes.length,
    value,
    error,
    tolerance,
    detail: `${successes}/${opportunities} held-out opportunities yield ${value.toFixed(4)} versus ${estimate.toFixed(4)}`,
  });
}
function uncertaintyOf(key: HazardV2EstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    limit.uncertaintyFloor[key],
    (limit.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}

interface EpisodeReading {
  readonly id: string;
  readonly value: number;
}
/** One value per distinct opportunity (never per frame), with the refusals it produced. */
type EpisodeExtractor = (
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
) => readonly EpisodeReading[];

function continuousEstimate(
  key: HazardV2EstimatorKey,
  episodes: readonly AdmittedEpisode[],
  split: EpisodeSplit,
  extract: EpisodeExtractor,
  missing: HazardV2EstimatorReason,
): HazardV2KeyEstimate {
  const excluded = new Map<string, number>(),
    readings: { id: string; value: number; samples: number }[] = [];
  for (const episode of episodes) {
    const entries = extract(episode, excluded);
    if (entries.length === 0) continue;
    readings.push({
      id: episode.id,
      value: median(entries.map((entry) => entry.value)),
      samples: entries.length,
    });
  }
  if (readings.length === 0)
    return unobserved(key, dominantExclusion(excluded, missing), 0, 0, excluded);
  const estimateReadings = readings.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationReadings = readings.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    totalSamples = readings.reduce((sum, entry) => sum + entry.samples, 0),
    estimateSamples = estimateReadings.reduce((sum, entry) => sum + entry.samples, 0);
  if (estimateReadings.length < limit.minimumEstimateEpisodes)
    return unobserved(
      key,
      'INSUFFICIENT_DISTINCT_EPISODES',
      readings.length,
      totalSamples,
      excluded,
    );
  const numbers = estimateReadings.map((entry) => entry.value),
    rawValue = median(numbers),
    uncertainty = uncertaintyOf(key, numbers),
    measured = continuousValidation(
      key,
      rawValue,
      validationReadings.map((entry) => entry.value),
    ),
    result = candidate(
      key,
      rawValue,
      uncertainty,
      estimateReadings.length,
      estimateSamples,
      excluded,
      measured,
    );
  return typeof result === 'string'
    ? unobserved(
        key,
        result,
        estimateReadings.length,
        estimateSamples,
        excluded,
        measured,
        uncertainty,
      )
    : result;
}

/** Both clearance channels: the cap is inverted through the declared M deceleration. */
function clearanceExtractor(hazard: 'pedestrian' | 'obstacle'): EpisodeExtractor {
  return (episode, excluded) => {
    const readings = new Map<string, number>();
    for (const sample of episode.samples) {
      if (!sample.policyActive) continue;
      const clearance =
        hazard === 'pedestrian' ? sample.clearance.pedestrian : sample.clearance.obstacle;
      if (clearance === null) continue;
      if (clearance.floored) {
        increment(excluded, 'CLEARANCE_FLOOR_SATURATED');
        continue;
      }
      const comfort = sample.declaredM.comfortDecelerationMps2;
      if (comfort === null || !(comfort > 0)) {
        increment(excluded, 'CLEARANCE_M_UNKNOWN');
        continue;
      }
      if (clearance.stopNow || clearance.roomM <= 0 || clearance.speedCapMps <= 0) {
        increment(excluded, 'CLEARANCE_ROOM_EXHAUSTED');
        continue;
      }
      // `cap = sqrt(2 · comfort · room)` is the only speed fact; the M value is what isolates it.
      const recoveredRoomM = (clearance.speedCapMps * clearance.speedCapMps) / (2 * comfort);
      if (Math.abs(recoveredRoomM - clearance.roomM) > limit.capConsistencyToleranceM) {
        increment(excluded, 'CLEARANCE_M_INCONSISTENT');
        continue;
      }
      const value = clearance.distanceM - recoveredRoomM;
      if (!(value > 0)) {
        increment(excluded, 'CLEARANCE_ROOM_EXHAUSTED');
        continue;
      }
      const hazardId =
        hazard === 'pedestrian' ? (sample.pedestrian?.pedestrianId ?? null) : sample.obstacleId;
      if (hazardId === null) {
        increment(excluded, 'CLEARANCE_HAZARD_UNKNOWN');
        continue;
      }
      if (!readings.has(hazardId)) readings.set(hazardId, value);
    }
    return [...readings].map(([id, value]) => ({ id, value }));
  };
}

/** The reaction delay: only an unsaturated total delay reports the R contribution. */
const reactionExtractor: EpisodeExtractor = (episode, excluded) => {
  const readings = new Map<string, number>();
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    const reaction = sample.reaction;
    if (reaction === null) continue;
    if (reaction.saturated) {
      increment(excluded, 'REACTION_DELAY_SATURATED');
      continue;
    }
    if (!reaction.feasible) {
      increment(excluded, 'REACTION_STOPPING_DISTANCE_EXCEEDED');
      continue;
    }
    const inherited = sample.declaredM.brakeReactionDelayS;
    if (inherited === null) {
      increment(excluded, 'REACTION_M_UNKNOWN');
      continue;
    }
    if (Math.abs(inherited - reaction.inheritedDelayS) > limit.capConsistencyToleranceM) {
      increment(excluded, 'REACTION_M_INCONSISTENT');
      continue;
    }
    if (Math.abs(reaction.delayS - reaction.demandedDelayS) > limit.capConsistencyToleranceM) {
      increment(excluded, 'REACTION_DELAY_INCONSISTENT');
      continue;
    }
    if (reaction.roomM <= 0 || reaction.closingSpeedMps <= 0) {
      increment(excluded, 'REACTION_ROOM_EXHAUSTED');
      continue;
    }
    const value = reaction.delayS - inherited;
    if (value < -limit.capConsistencyToleranceM) {
      increment(excluded, 'REACTION_DELAY_BELOW_INHERITED');
      continue;
    }
    if (!readings.has(reaction.stimulusId)) readings.set(reaction.stimulusId, value);
  }
  return [...readings].map(([id, value]) => ({ id, value }));
};

/** The emergency intensity: only a deceleration below the adhesion limit is the key itself. */
const emergencyExtractor: EpisodeExtractor = (episode, excluded) => {
  const readings = new Map<string, number>();
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    const emergency = sample.emergencyBrake;
    if (emergency === null) continue;
    const capability = sample.geometry.brakeAccelerationMps2;
    if (!(capability > 0)) {
      increment(excluded, 'EMERGENCY_CAPABILITY_UNKNOWN');
      continue;
    }
    const expected = Math.min(capability, emergency.adhesionLimitMps2);
    if (Math.abs(emergency.brakeCapabilityMps2 - expected) > limit.capConsistencyToleranceM) {
      increment(excluded, 'EMERGENCY_GEOMETRY_INCONSISTENT');
      continue;
    }
    if (emergency.adhesionLimited) {
      increment(excluded, 'ADHESION_CAP_SATURATED');
      continue;
    }
    const id = sample.reaction?.stimulusId ?? null;
    if (id === null) {
      increment(excluded, 'NO_HAZARD_REACTION');
      continue;
    }
    if (!readings.has(id)) readings.set(id, emergency.decelerationMps2 / capability);
  }
  return [...readings].map(([id, value]) => ({ id, value }));
};

/** The crosswalk approach: a command equal to the authored limit is only a lower bound. */
const crosswalkExtractor: EpisodeExtractor = (episode, excluded) => {
  const readings = new Map<string, number>();
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    const crosswalk = sample.crosswalk;
    if (crosswalk === null) continue;
    if (!(crosswalk.commandedSpeedMps > 0)) {
      increment(excluded, 'CROSSWALK_NO_COMMAND');
      continue;
    }
    if (crosswalk.commandedSpeedMps >= crosswalk.postedLimitMps - limit.capConsistencyToleranceM) {
      increment(excluded, 'CROSSWALK_LIMIT_SATURATED');
      continue;
    }
    if (!readings.has(crosswalk.crosswalkId))
      readings.set(crosswalk.crosswalkId, crosswalk.commandedSpeedMps);
  }
  return [...readings].map(([id, value]) => ({ id, value }));
};

interface RateEpisode {
  readonly id: string;
  readonly successes: number;
  readonly opportunities: number;
}
/** The yield: a rate over distinct discretionary crossing opportunities, never over frames. */
function yieldEstimate(
  episodes: readonly AdmittedEpisode[],
  split: EpisodeSplit,
): HazardV2KeyEstimate {
  const key = 'pedestrian_yield_probability' as const,
    excluded = new Map<string, number>(),
    perEpisode: RateEpisode[] = [];
  for (const episode of episodes) {
    const decisions = new Map<string, boolean>();
    for (const sample of episode.samples) {
      if (!sample.policyActive) continue;
      const pedestrian = sample.pedestrian;
      if (pedestrian === null || pedestrian.crossingRemainingS === null) continue;
      if (pedestrian.sample === null) {
        increment(excluded, 'PEDESTRIAN_SAMPLE_MISSING');
        continue;
      }
      if (pedestrian.mandatoryYield) {
        // A pedestrian that cannot clear the path is a mandatory yield at every key value.
        increment(excluded, 'PEDESTRIAN_ALL_CROSSINGS_MANDATORY');
        continue;
      }
      if (pedestrian.gapS === null) {
        increment(excluded, 'PEDESTRIAN_CROSSING_STANDSTILL');
        continue;
      }
      if (!decisions.has(pedestrian.pedestrianId))
        decisions.set(pedestrian.pedestrianId, pedestrian.yielded);
    }
    if (decisions.size === 0) continue;
    perEpisode.push({
      id: episode.id,
      successes: [...decisions.values()].filter(Boolean).length,
      opportunities: decisions.size,
    });
  }
  if (perEpisode.length === 0)
    return unobserved(key, dominantExclusion(excluded, 'NO_PEDESTRIAN_CROSSING'), 0, 0, excluded);
  const estimateEpisodes = perEpisode.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationEpisodes = perEpisode.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    opportunities = estimateEpisodes.reduce((sum, entry) => sum + entry.opportunities, 0),
    successes = estimateEpisodes.reduce((sum, entry) => sum + entry.successes, 0),
    totalOpportunities = perEpisode.reduce((sum, entry) => sum + entry.opportunities, 0);
  if (estimateEpisodes.length < limit.minimumEstimateEpisodes)
    return unobserved(
      key,
      'INSUFFICIENT_DISTINCT_EPISODES',
      perEpisode.length,
      totalOpportunities,
      excluded,
    );
  const rate = successes / opportunities,
    binomial = Math.sqrt((rate * (1 - rate)) / Math.max(1, opportunities)),
    withOwnRate = estimateEpisodes.filter((entry) => entry.opportunities >= 2),
    rates = withOwnRate.map((entry) => entry.successes / entry.opportunities),
    betweenEpisodes =
      rates.length >= 2
        ? (limit.uncertainMedianFactor *
            median(rates.map((value) => Math.abs(value - median(rates))))) /
          Math.sqrt(rates.length)
        : 0,
    uncertainty = Math.max(limit.uncertaintyFloor[key], binomial, betweenEpisodes),
    measured = rateValidation(key, rate, validationEpisodes),
    result = candidate(
      key,
      rate,
      uncertainty,
      estimateEpisodes.length,
      opportunities,
      excluded,
      measured,
    );
  return typeof result === 'string'
    ? unobserved(
        key,
        result,
        estimateEpisodes.length,
        opportunities,
        excluded,
        measured,
        uncertainty,
      )
    : result;
}

interface BandReading {
  readonly id: string;
  readonly sample: number;
  readonly admitted: boolean;
}
type BandExtractor = (sample: AdmittedSample, excluded: Map<string, number>) => BandReading | null;
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
function summarizeBands(
  bands: readonly EpisodeBand[],
  split: EpisodeSplit,
  side: 'ESTIMATE' | 'VALIDATION',
): BandSummary {
  const selected = bands.filter((entry) => splitOf(split, entry.id) === side);
  return {
    lower: selected.reduce<number | null>(
      (value, entry) =>
        entry.lower === null ? value : value === null ? entry.lower : Math.max(value, entry.lower),
      null,
    ),
    upper: selected.reduce<number | null>(
      (value, entry) =>
        entry.upper === null ? value : value === null ? entry.upper : Math.min(value, entry.upper),
      null,
    ),
    episodes: selected.length,
    samples: selected.reduce((sum, entry) => sum + entry.samples, 0),
  };
}
/** A binary decision on a deterministic sample: the intersection of the demonstrated bounds. */
function bandEstimate(
  key: HazardV2EstimatorKey,
  episodes: readonly AdmittedEpisode[],
  split: EpisodeSplit,
  extract: BandExtractor,
  missing: HazardV2EstimatorReason,
  refusalBand: HazardV2EstimatorReason,
  contradictory: HazardV2EstimatorReason,
): HazardV2KeyEstimate {
  const excluded = new Map<string, number>(),
    bands: EpisodeBand[] = [];
  for (const episode of episodes) {
    const readings = new Map<string, BandReading>();
    for (const sample of episode.samples) {
      if (!sample.policyActive) continue;
      const reading = extract(sample, excluded);
      if (reading === null) continue;
      if (!readings.has(reading.id)) readings.set(reading.id, reading);
    }
    if (readings.size === 0) continue;
    let lower: number | null = null,
      upper: number | null = null;
    for (const reading of readings.values())
      if (reading.admitted)
        lower = lower === null ? reading.sample : Math.max(lower, reading.sample);
      else upper = upper === null ? reading.sample : Math.min(upper, reading.sample);
    bands.push({ id: episode.id, lower, upper, samples: readings.size });
  }
  if (bands.length === 0)
    return unobserved(key, dominantExclusion(excluded, missing), 0, 0, excluded);
  const estimate = summarizeBands(bands, split, 'ESTIMATE'),
    validation = summarizeBands(bands, split, 'VALIDATION');
  if (estimate.episodes < limit.minimumEstimateEpisodes)
    return unobserved(
      key,
      'INSUFFICIENT_DISTINCT_EPISODES',
      bands.length,
      bands.reduce((sum, entry) => sum + entry.samples, 0),
      excluded,
    );
  if (estimate.lower !== null && estimate.upper !== null && estimate.lower > estimate.upper) {
    increment(excluded, contradictory);
    return unobserved(key, contradictory, estimate.episodes, estimate.samples, excluded);
  }
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
      refusalBand,
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

const evasionExtractor: BandExtractor = (sample, excluded) => {
  const evasion = sample.evasion;
  if (evasion === null) return null;
  if (!evasion.feasible || evasion.sample === null) {
    increment(excluded, 'EVASION_NO_SPACE');
    return null;
  }
  // One decision per declared side of the same obstacle: the side is the opportunity identity.
  return { id: evasion.side, sample: evasion.sample, admitted: evasion.willing };
};
const hornExtractor: BandExtractor = (sample, excluded) => {
  const horn = sample.horn;
  if (horn === null) return null;
  if (!horn.permitted) {
    // The world forbids the horn: 183 draws no sample, so the key is inert.
    increment(excluded, 'HORN_FORBIDDEN');
    return null;
  }
  if (horn.sample === null) {
    increment(excluded, 'HORN_SAMPLE_MISSING');
    return null;
  }
  return { id: horn.opportunityId, sample: horn.sample, admitted: horn.used };
};

function compatibility(): HazardV2Compatibility {
  return Object.freeze({
    policyVersion: HAZARD_POLICY_V2_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    mReadByPolicy: Object.freeze([...HAZARD_POLICY_V2_M_KEYS]),
    tickHz: limit.tickHz,
    clearanceReserveM: limit.clearanceReserveM,
    standardGravityMps2: limit.standardGravityMps2,
    reportedQuantity: Object.freeze({
      pedestrian_yield_probability:
        'rata pe oportunități distincte de traversare discreționară, nu pe cadre',
      pedestrian_clearance:
        'cheia în metri, inversată din `distanță − plafon² / (2 · comfort_deceleration)`',
      hazard_reaction_delay:
        'contribuția R în secunde, `delayS − brake_reaction_delay`, doar nesaturată',
      obstacle_clearance: 'aceeași inversare, față de cutia de obstacol autorată',
      emergency_brake_intensity:
        'raportul `decelerație / brakeAcceleration` sub plafonul de aderență',
      evasive_steer_willingness: 'probabilitatea în sine, intersectată din eșantioane',
      crosswalk_approach_speed: 'viteza comandată sub limita postată, în m/s',
      horn_use_probability: 'probabilitatea în sine, intersectată din eșantioane',
    }),
    catalogRanges: Object.freeze(
      Object.fromEntries(
        HAZARD_V2_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)] as const),
      ) as Record<
        HazardV2EstimatorKey,
        { readonly min: number; readonly max: number; readonly unit: string }
      >,
    ),
  });
}

/**
 * Estimates the eight 183 hazard keys from demonstrated decisions. The same episodes and the same
 * `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateHazardV2Style(input: HazardV2EstimatorInput): HazardV2EstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid hazard estimator input');
  const splitSeed = count(input.splitSeed, limit.maximumSeed, 'split seed');
  if (!Array.isArray(input.episodes)) fail('Invalid hazard evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: HazardV2EpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as HazardV2EvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as HazardV2EvidenceEpisode).occurrence}`;
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
    keys = {} as Record<HazardV2EstimatorKey, HazardV2KeyEstimate>;
  keys.pedestrian_yield_probability = yieldEstimate(admitted, split);
  keys.pedestrian_clearance = continuousEstimate(
    'pedestrian_clearance',
    admitted,
    split,
    clearanceExtractor('pedestrian'),
    'NO_PEDESTRIAN_CLEARANCE',
  );
  keys.hazard_reaction_delay = continuousEstimate(
    'hazard_reaction_delay',
    admitted,
    split,
    reactionExtractor,
    'NO_HAZARD_REACTION',
  );
  keys.obstacle_clearance = continuousEstimate(
    'obstacle_clearance',
    admitted,
    split,
    clearanceExtractor('obstacle'),
    'NO_OBSTACLE_CLEARANCE',
  );
  keys.emergency_brake_intensity = continuousEstimate(
    'emergency_brake_intensity',
    admitted,
    split,
    emergencyExtractor,
    'NO_EMERGENCY_BRAKE',
  );
  keys.evasive_steer_willingness = bandEstimate(
    'evasive_steer_willingness',
    admitted,
    split,
    evasionExtractor,
    'NO_EVASION_OPPORTUNITY',
    'EVASION_REFUSAL_BAND_TOO_WIDE',
    'CONTRADICTORY_EVASION_BOUNDS',
  );
  keys.crosswalk_approach_speed = continuousEstimate(
    'crosswalk_approach_speed',
    admitted,
    split,
    crosswalkExtractor,
    'NO_CROSSWALK_APPROACH',
  );
  keys.horn_use_probability = bandEstimate(
    'horn_use_probability',
    admitted,
    split,
    hornExtractor,
    'NO_HORN_OPPORTUNITY',
    'HORN_REFUSAL_BAND_TOO_WIDE',
    'CONTRADICTORY_HORN_BOUNDS',
  );
  if (admitted.length === 0)
    for (const key of HAZARD_V2_ESTIMATOR_KEYS)
      keys[key] = unobserved(key, 'NO_ELIGIBLE_EPISODES', 0, 0, new Map<string, number>());

  return Object.freeze({
    version: HAZARD_V2_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: hazardV2GroupConstraints,
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
