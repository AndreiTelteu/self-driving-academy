import {
  choice,
  deriveOpportunitySeed,
  fields,
  number,
  randomUnit,
  requireContract,
  tick,
} from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { roadSurface, vehicleClass } from '../vehicles';
import type { RoadSurfaceId, VehicleClassId } from '../vehicles';
import { captureLongitudinalProfileData } from './longitudinal-control';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

/**
 * 183 pedestrian and hazard policy: yield at a real crossing, the space kept from a pedestrian and
 * from an obstacle, the reaction to an observable hazard, the emergency brake intensity, the
 * willingness to steer around an obstacle, the crosswalk approach speed and the horn.
 *
 * The layer is a policy over the observable facts of the tick, never a second pedestrian, hazard or
 * collision system: `164-pedestrians-v1` owns the crossing, the state machine and the conflict
 * facts, `165-hazards-v1` owns the stimulus, the obstacle box and the horn opportunity, `023`
 * owns the vehicle mechanics and `026` the declared road surface. The layer reads those facts and
 * only decides what the driver does with them. No key invents a hazard, a position or a contact.
 *
 * **What each key does, in its own scenario.**
 * 1. `pedestrian_yield_probability` (probability) — one deterministic sample per identified crossing
 *    opportunity (`deriveOpportunitySeed(seed, opportunityKey)` with the fixed key
 *    `pedestrian-yield`) decides whether the driver yields to a pedestrian that is already crossing.
 *    The key is only discretionary where the crossing is not a physical conflict: a pedestrian that
 *    will not have cleared the ego path inside the delivered M `yield_time_gap` is a **mandatory**
 *    yield at every value of the key.
 * 2. `pedestrian_clearance` (m) — the desired space to a pedestrian, and a **minimum**: the
 *    effective clearance is `max(key, trackM + clearanceReserveM)`, i.e. the vehicle width of the
 *    delivered class plus a reserve, so no admissible catalog value (the minimum is 0.1 m) can put
 *    the vehicle body through a person. The clearance becomes a speed cap,
 *    `sqrt(2 · comfort_deceleration · room)`, the fastest approach that can still stop inside the
 *    remaining room at the delivered M comfort deceleration.
 * 3. `hazard_reaction_delay` (s) — the delay added to the delivered M `brake_reaction_delay`
 *    before an emergency brake answers an observable 165 stimulus. It is **capped** by physics:
 *    the maximum feasible delay is `(room − v² / (2 · capability)) / v`, the delay after which the
 *    brake can no longer stop inside the declared room. A larger key is saturated to that cap and
 *    reported as `saturated`, so the policy never accepts blindness.
 * 4. `obstacle_clearance` (m) — the desired space to a declared obstacle box, again a minimum:
 *    `max(key, trackM / 2 + obstacleHalfWidthM + clearanceReserveM)`. The obstacle owns its real
 *    half width, so a barrier asks for more space than a cone.
 * 5. `emergency_brake_intensity` (ratio) — the fraction of the delivered emergency brake
 *    capability, **capped by the available adhesion**: the commanded deceleration is
 *    `min(key · brakeAcceleration, grip · tireGripScale · g)`. On the delivered
 *    `reduced-adhesion` surface the physical cap is below the brake capability, so a full-intensity
 *    key still brakes at the tyre limit only.
 * 6. `evasive_steer_willingness` (probability) — one deterministic sample per opportunity (fixed
 *    key `evasion`) decides whether the driver steers around an obstacle, but only when the declared
 *    lateral space is at least the physical requirement `trackM / 2 + obstacleHalfWidthM +
 *    clearanceReserveM`. Without that space the key is inert at any value: the layer never steers
 *    through another participant. The committed offset is the smallest of the space to spare and
 *    the offset reachable inside the time to the obstacle at the delivered M `curve_lateral_accel`.
 * 7. `crosswalk_approach_speed` (m/s) — the speed commanded on the approach to an authored
 *    crosswalk, `min(key, postedLimit)`; the authored limit stays the ceiling.
 * 8. `horn_use_probability` (probability) — one deterministic sample per opportunity (fixed key
 *    `horn`) decides whether the horn is used. Where the world does not permit the horn the sample
 *    is not even drawn, so the key is inert and the refusal is explicit.
 *
 * **M interaction.** The layer reads four delivered M keys without rewriting them:
 * `comfort_deceleration` (m/s²) is the deceleration of every clearance speed cap,
 * `brake_reaction_delay` (s) is added to the R delay so the total keeps the M consequence,
 * `curve_lateral_accel` (m/s²) is the lateral acceleration of the evasion, and `yield_time_gap` (s)
 * is the mandatory-yield threshold. Units stay the catalog units and the inherited values are
 * reported separately from the R contribution, so a profile that carries both kinds keeps both
 * meanings.
 *
 * The layer keeps no history (`retainedHistory: 0`): every decision is a pure function of the input,
 * the seed and the opportunity identity, and a repeated evaluation of the same opportunity reproduces
 * the same samples instead of drawing new ones.
 */
export const HAZARD_POLICY_V2_KEYS = Object.freeze([
  'pedestrian_yield_probability',
  'pedestrian_clearance',
  'hazard_reaction_delay',
  'obstacle_clearance',
  'emergency_brake_intensity',
  'evasive_steer_willingness',
  'crosswalk_approach_speed',
  'horn_use_probability',
] as const);
export type HazardPolicyV2Key = (typeof HAZARD_POLICY_V2_KEYS)[number];
/** The delivered M keys the layer reads without changing their meaning. */
export const HAZARD_POLICY_V2_M_KEYS = Object.freeze([
  'comfort_deceleration',
  'brake_reaction_delay',
  'curve_lateral_accel',
  'yield_time_gap',
] as const);
export type HazardPolicyV2MKey = (typeof HAZARD_POLICY_V2_M_KEYS)[number];
export const HAZARD_POLICY_V2_LIMITS = Object.freeze({
  version: '183-hazard-policy-v2' as const,
  observationVersion: '183-hazard-observation-v1' as const,
  mechanicsVersion: '023-mechanics-v1' as const,
  surfaceVersion: '026-flat-surfaces-v1' as const,
  idCodeUnits: 256,
  profileCodeUnits: 128,
  opportunityKeyCodeUnits: 8192,
  tickHz: 60,
  maximumSpeedMps: 100,
  maximumDistanceM: 1000,
  maximumTimeS: 3600,
  /** Mechanical coverage ceiling of the delivered speed policies (046/167): 30 m/s. */
  maximumCommandedSpeedMps: 30,
  /** Standard gravity, used to turn the delivered tyre grip into an adhesion limit. */
  standardGravityMps2: 9.81,
  /**
   * Documented pedestrian shoulder half-width. The delivered 164 contract models a pedestrian as a
   * point, so the physical body the policy must clear is a policy constant, not a catalog key.
   */
  pedestrianRadiusM: 0.25,
  /**
   * Reserve added to the physical width. It is larger than the 0.2 m body margin of the lateral
   * policy because a pedestrian can step into the margin, and it is a policy constant.
   */
  clearanceReserveM: 0.5,
  /** Below this ego speed no predictive yield or delay is computed: the vehicle is already stopped. */
  standstillMps: 0.1,
  /** Stopping-distance floor so a zero closing speed cannot divide by zero. */
  minimumClosingSpeedMps: 0.1,
  /** Fixed sample keys: one sample per opportunity and per channel. */
  yieldSampleKey: 'pedestrian-yield' as const,
  evasionSampleKey: 'evasion' as const,
  hornSampleKey: 'horn' as const,
  retainedHistory: 0,
});
export interface HazardPolicyV2Profile {
  readonly version: '183-hazard-policy-v2';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<HazardPolicyV2Key, number>>;
  readonly units: Readonly<Record<HazardPolicyV2Key, ParameterUnit>>;
  readonly provenance: Readonly<Record<HazardPolicyV2Key, string>>;
  readonly mValues: Readonly<Record<HazardPolicyV2MKey, number>>;
  readonly mUnits: Readonly<Record<HazardPolicyV2MKey, ParameterUnit>>;
}
export type HazardPedestrianState =
  'ON_SIDEWALK' | 'WAITING' | 'CROSSING' | 'CROSSED' | 'WITHDRAWN';
/** The nearest pedestrian of the tick, as the delivered 164 snapshot declares it. */
export interface HazardPolicyV2Pedestrian {
  readonly pedestrianId: string;
  readonly state: HazardPedestrianState;
  /** Remaining distance from the ego to the authored crossing line, m; never negative. */
  readonly distanceM: number;
  /** Seconds the pedestrian still needs to clear the ego path; null unless it is CROSSING. */
  readonly crossingRemainingS: number | null;
}
/** A declared obstacle box ahead; the half width is the authored one, along the ego path. */
export interface HazardPolicyV2Obstacle {
  readonly obstacleId: string;
  /** Surface distance from the ego body to the box, m; never negative. */
  readonly distanceM: number;
  readonly halfWidthM: number;
}
/** The observable 165 debut of a hazard for this vehicle. */
export interface HazardPolicyV2Stimulus {
  readonly stimulusId: string;
  readonly kind: 'PEDESTRIAN' | 'OBSTACLE';
  readonly onsetTick: number;
  /** Distance to the hazard at the onset tick, m. */
  readonly distanceM: number;
  /** Closing speed at the onset tick, m/s. */
  readonly closingSpeedMps: number;
  /** Half width of the hazard along the ego path, m. */
  readonly halfWidthM: number;
}
/** The lateral space the world declares beside the ego, and the time before the obstacle. */
export interface HazardPolicyV2EvasionSpace {
  readonly side: 'LEFT' | 'RIGHT';
  /** Free space from the ego body edge to the obstruction on that side, m. */
  readonly lateralSpaceM: number;
  /** Time available before the obstacle is reached at the current speed, s. */
  readonly timeToObstacleS: number;
}
export interface HazardPolicyV2CrosswalkApproach {
  readonly crosswalkId: string;
  readonly distanceM: number;
  /** Authored limit of the approach, m/s: the policy never commands more. */
  readonly postedLimitMps: number;
}
/** An open 165 horn opportunity and the world's declaration that honking is permitted here. */
export interface HazardPolicyV2HornOpportunity {
  readonly opportunityId: string;
  readonly permitted: boolean;
}
export interface HazardPolicyV2Mechanics {
  readonly version: '023-mechanics-v1';
  readonly classId: VehicleClassId;
}
export interface HazardPolicyV2Surface {
  readonly version: '026-flat-surfaces-v1';
  readonly id: RoadSurfaceId;
}
export interface HazardPolicyV2Observation extends BehaviorScope {
  readonly version: '183-hazard-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly speedMps: number;
  /** The delivered vehicle class whose real width and brake capability the policy uses. */
  readonly mechanics: HazardPolicyV2Mechanics;
  /** The declared road surface whose grip caps the adhesion available to the tyres. */
  readonly surface: HazardPolicyV2Surface;
  /** Authored speed limit of the current road, m/s. */
  readonly postedLimitMps: number;
  readonly pedestrian: HazardPolicyV2Pedestrian | null;
  readonly obstacle: HazardPolicyV2Obstacle | null;
  readonly stimulus: HazardPolicyV2Stimulus | null;
  readonly evasion: HazardPolicyV2EvasionSpace | null;
  readonly crosswalk: HazardPolicyV2CrosswalkApproach | null;
  readonly horn: HazardPolicyV2HornOpportunity | null;
}
export interface HazardPolicyV2Input extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  /** uint32 vehicle seed from the 006 addressing; the opportunity seed derives from it. */
  readonly seed: number;
  /** Stable opportunity identity of this decision; addresses the once-per-opportunity samples. */
  readonly opportunityKey: string;
  readonly profile: HazardPolicyV2Profile | null;
  readonly observation: HazardPolicyV2Observation;
}
export type HazardPolicyV2Action = 'PROCEED' | 'SLOW' | 'YIELD' | 'BRAKE' | 'EVADE' | 'UNAVAILABLE';
export type HazardPolicyV2Reason =
  | 'HAZARD_POLICY_V2'
  | 'NO_AUTO_AUTHORITY'
  | 'MISSING_PROFILE'
  | 'FOREIGN_OR_STALE_OBSERVATION'
  | 'FREE_ROAD'
  | 'PEDESTRIAN_MANDATORY_YIELD'
  | 'PEDESTRIAN_YIELD'
  | 'PEDESTRIAN_PROCEED'
  | 'PEDESTRIAN_CLEARANCE'
  | 'OBSTACLE_CLEARANCE'
  | 'HAZARD_REACTION'
  | 'HAZARD_REACTION_SATURATED'
  | 'HAZARD_STOPPING_DISTANCE_EXCEEDED'
  | 'EVASION_NO_SPACE'
  | 'EVASION_REFUSED'
  | 'EVASION_COMMITTED'
  | 'CROSSWALK_APPROACH'
  | 'HORN_USED'
  | 'HORN_REFUSED'
  | 'HORN_FORBIDDEN';
export interface HazardPolicyV2PedestrianCommand {
  readonly pedestrianId: string;
  readonly state: HazardPedestrianState;
  readonly distanceM: number;
  readonly crossingRemainingS: number | null;
  /** `distance / speed − crossingRemainingS`: the margin over the pedestrian, s. */
  readonly gapS: number | null;
  /** The delivered M `yield_time_gap` this decision used, s. */
  readonly yieldGapS: number;
  readonly mandatoryYield: boolean;
  readonly sample: number | null;
  readonly yielded: boolean;
}
export interface HazardPolicyV2ClearanceCommand {
  readonly desiredM: number;
  readonly effectiveM: number;
  readonly minimumM: number;
  /** True when the physical floor raised the desired value. */
  readonly floored: boolean;
  readonly distanceM: number;
  readonly roomM: number;
  /** Fastest approach that still stops inside `roomM` at the delivered comfort deceleration. */
  readonly speedCapMps: number;
  /** True when the hazard is already inside the effective clearance: no advance at all. */
  readonly stopNow: boolean;
}
export interface HazardPolicyV2ReactionCommand {
  readonly stimulusId: string;
  readonly kind: 'PEDESTRIAN' | 'OBSTACLE';
  readonly onsetTick: number;
  readonly distanceM: number;
  readonly closingSpeedMps: number;
  readonly roomM: number;
  readonly capabilityMps2: number;
  readonly stoppingDistanceM: number;
  /** The delivered 047 M delay the policy inherits, s. */
  readonly inheritedDelayS: number;
  /** `inheritedDelayS + hazard_reaction_delay`, s. */
  readonly demandedDelayS: number;
  /** The largest delay the remaining room still allows, s. */
  readonly maximumFeasibleDelayS: number;
  readonly delayS: number;
  readonly delayTicks: number;
  readonly saturated: boolean;
  readonly brakingDistanceM: number;
  readonly stoppingMarginM: number;
  readonly feasible: boolean;
}
export interface HazardPolicyV2EmergencyCommand {
  readonly intensity: number;
  readonly brakeCapabilityMps2: number;
  readonly adhesionLimitMps2: number;
  /** `intensity · brakeCapabilityMps2`, before the adhesion cap. */
  readonly requestedDecelerationMps2: number;
  readonly decelerationMps2: number;
  readonly adhesionLimited: boolean;
}
export interface HazardPolicyV2EvasionCommand {
  readonly side: 'LEFT' | 'RIGHT';
  readonly lateralSpaceM: number;
  readonly requiredSpaceM: number;
  readonly spareM: number;
  readonly timeToObstacleS: number;
  readonly lateralAccelMps2: number;
  /** Offset reachable inside the time to the obstacle at the delivered lateral acceleration. */
  readonly reachableOffsetM: number;
  readonly sample: number | null;
  readonly willing: boolean;
  readonly feasible: boolean;
  readonly offsetM: number;
}
export interface HazardPolicyV2CrosswalkCommand {
  readonly crosswalkId: string;
  readonly distanceM: number;
  readonly postedLimitMps: number;
  readonly preferredSpeedMps: number;
  readonly commandedSpeedMps: number;
}
export interface HazardPolicyV2HornCommand {
  readonly opportunityId: string;
  readonly permitted: boolean;
  readonly sample: number | null;
  readonly used: boolean;
}
export interface HazardPolicyV2Geometry {
  readonly classId: VehicleClassId;
  /** The delivered wheel track, the same physical width the lateral policy uses, m. */
  readonly widthM: number;
  readonly brakeAccelerationMps2: number;
  readonly grip: number;
  readonly adhesionLimitMps2: number;
  /** `min(brakeAcceleration, adhesionLimit)`: what the tyres can actually deliver. */
  readonly brakeCapabilityMps2: number;
}
export interface HazardPolicyV2Command extends BehaviorScope {
  readonly version: '183-hazard-policy-v2';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: HazardPolicyV2Reason;
  readonly action: HazardPolicyV2Action;
  readonly postedLimitMps: number;
  readonly geometry: HazardPolicyV2Geometry;
  readonly surfaceId: RoadSurfaceId;
  readonly groundFriction: number;
  readonly tireGripScale: number;
  /** The slowest cap among the channels: the command is a hard envelope, never a preference. */
  readonly commandedSpeedMps: number;
  readonly commandedDecelerationMps2: number;
  readonly pedestrian: HazardPolicyV2PedestrianCommand | null;
  readonly clearance: Readonly<{
    pedestrian: HazardPolicyV2ClearanceCommand | null;
    obstacle: HazardPolicyV2ClearanceCommand | null;
  }>;
  readonly reaction: HazardPolicyV2ReactionCommand | null;
  readonly emergencyBrake: HazardPolicyV2EmergencyCommand | null;
  readonly evasion: HazardPolicyV2EvasionCommand | null;
  readonly crosswalk: HazardPolicyV2CrosswalkCommand | null;
  readonly horn: HazardPolicyV2HornCommand | null;
  readonly retainedHistory: 0;
}
let compiling = false;
let evaluating = false;
export function getHazardPolicyV2Stats() {
  return Object.freeze({ compiling, evaluating, retainedHistory: 0 });
}
const profiles = new WeakSet<object>();
const observationFields = [
  'version',
  'units',
  'sessionId',
  'worldEpoch',
  'actor',
  'tick',
  'speedMps',
  'mechanics',
  'surface',
  'postedLimitMps',
  'pedestrian',
  'obstacle',
  'stimulus',
  'evasion',
  'crosswalk',
  'horn',
] as const;
const pedestrianFields = ['pedestrianId', 'state', 'distanceM', 'crossingRemainingS'] as const;
const obstacleFields = ['obstacleId', 'distanceM', 'halfWidthM'] as const;
const stimulusFields = [
  'stimulusId',
  'kind',
  'onsetTick',
  'distanceM',
  'closingSpeedMps',
  'halfWidthM',
] as const;
const evasionFields = ['side', 'lateralSpaceM', 'timeToObstacleS'] as const;
const crosswalkFields = ['crosswalkId', 'distanceM', 'postedLimitMps'] as const;
const hornFields = ['opportunityId', 'permitted'] as const;
const inputFields = [
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'authority',
  'seed',
  'opportunityKey',
  'profile',
  'observation',
] as const;
function identity(value: unknown, maximum: number = HAZARD_POLICY_V2_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid hazard policy v2 identity',
  );
  return value;
}
function actor(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: identity(data.id), incarnation: tick(data.incarnation) });
}
function sameScope(a: BehaviorScope, b: BehaviorScope): boolean {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
function sameActor(a: BehaviorActor, b: BehaviorActor): boolean {
  return a.id === b.id && a.incarnation === b.incarnation;
}
function seed(value: unknown): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff,
    'Invalid hazard policy v2 seed',
  );
  return value;
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function flag(value: unknown, message: string): boolean {
  requireContract(typeof value === 'boolean', message);
  return value;
}
export function compileHazardPolicyProfile(input: unknown): HazardPolicyV2Profile {
  requireContract(!compiling, 'Reentrant hazard policy v2 profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<HazardPolicyV2Key, number>,
      units = {} as Record<HazardPolicyV2Key, ParameterUnit>,
      provenance = {} as Record<HazardPolicyV2Key, string>,
      mValues = {} as Record<HazardPolicyV2MKey, number>,
      mUnits = {} as Record<HazardPolicyV2MKey, ParameterUnit>;
    for (const key of HAZARD_POLICY_V2_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing hazard policy v2 parameter',
      );
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    for (const key of HAZARD_POLICY_V2_M_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing hazard policy v2 M parameter',
      );
      mValues[key] = published.parameters[key];
      mUnits[key] = published.unitsByParameter[key];
    }
    const result: HazardPolicyV2Profile = Object.freeze({
      version: HAZARD_POLICY_V2_LIMITS.version,
      profileId: identity(published.profileId),
      versionId: identity(published.versionId, HAZARD_POLICY_V2_LIMITS.profileCodeUnits),
      engineVersion: identity(published.engineVersion),
      values: Object.freeze(values),
      units: Object.freeze(units),
      provenance: Object.freeze(provenance),
      mValues: Object.freeze(mValues),
      mUnits: Object.freeze(mUnits),
    });
    profiles.add(result);
    return result;
  } finally {
    compiling = false;
  }
}
function distanceM(value: unknown): number {
  return number(value, 0, HAZARD_POLICY_V2_LIMITS.maximumDistanceM);
}
function pedestrian(value: unknown): HazardPolicyV2Pedestrian | null {
  if (value === null) return null;
  const data = fields(value, pedestrianFields),
    state = choice(data.state, [
      'ON_SIDEWALK',
      'WAITING',
      'CROSSING',
      'CROSSED',
      'WITHDRAWN',
    ] as const),
    crossingRemainingS =
      data.crossingRemainingS === null
        ? null
        : number(data.crossingRemainingS, 0, HAZARD_POLICY_V2_LIMITS.maximumTimeS);
  requireContract(
    (state === 'CROSSING') === (crossingRemainingS !== null),
    'A crossing pedestrian must declare exactly the remaining crossing time',
  );
  return Object.freeze({
    pedestrianId: identity(data.pedestrianId),
    state,
    distanceM: distanceM(data.distanceM),
    crossingRemainingS,
  });
}
function obstacle(value: unknown): HazardPolicyV2Obstacle | null {
  if (value === null) return null;
  const data = fields(value, obstacleFields);
  return Object.freeze({
    obstacleId: identity(data.obstacleId),
    distanceM: distanceM(data.distanceM),
    halfWidthM: number(data.halfWidthM, 0.01, 50),
  });
}
function stimulus(value: unknown): HazardPolicyV2Stimulus | null {
  if (value === null) return null;
  const data = fields(value, stimulusFields);
  return Object.freeze({
    stimulusId: identity(data.stimulusId),
    kind: choice(data.kind, ['PEDESTRIAN', 'OBSTACLE'] as const),
    onsetTick: tick(data.onsetTick),
    distanceM: distanceM(data.distanceM),
    closingSpeedMps: number(data.closingSpeedMps, 0, HAZARD_POLICY_V2_LIMITS.maximumSpeedMps),
    halfWidthM: number(data.halfWidthM, 0, 50),
  });
}
function evasion(value: unknown): HazardPolicyV2EvasionSpace | null {
  if (value === null) return null;
  const data = fields(value, evasionFields);
  return Object.freeze({
    side: choice(data.side, ['LEFT', 'RIGHT'] as const),
    lateralSpaceM: number(data.lateralSpaceM, 0, 20),
    timeToObstacleS: number(data.timeToObstacleS, 0, HAZARD_POLICY_V2_LIMITS.maximumTimeS),
  });
}
function crosswalk(value: unknown): HazardPolicyV2CrosswalkApproach | null {
  if (value === null) return null;
  const data = fields(value, crosswalkFields);
  return Object.freeze({
    crosswalkId: identity(data.crosswalkId),
    distanceM: distanceM(data.distanceM),
    postedLimitMps: number(data.postedLimitMps, 0.1, HAZARD_POLICY_V2_LIMITS.maximumSpeedMps),
  });
}
function horn(value: unknown): HazardPolicyV2HornOpportunity | null {
  if (value === null) return null;
  const data = fields(value, hornFields);
  return Object.freeze({
    opportunityId: identity(data.opportunityId),
    permitted: flag(data.permitted, 'Invalid horn permission flag'),
  });
}
interface AdmittedObservation extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly speedMps: number;
  readonly mechanics: HazardPolicyV2Mechanics;
  readonly surface: HazardPolicyV2Surface;
  readonly postedLimitMps: number;
  readonly pedestrian: HazardPolicyV2Pedestrian | null;
  readonly obstacle: HazardPolicyV2Obstacle | null;
  readonly stimulus: HazardPolicyV2Stimulus | null;
  readonly evasion: HazardPolicyV2EvasionSpace | null;
  readonly crosswalk: HazardPolicyV2CrosswalkApproach | null;
  readonly horn: HazardPolicyV2HornOpportunity | null;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields),
    mechanics = fields(data.mechanics, ['version', 'classId']),
    surface = fields(data.surface, ['version', 'id']);
  requireContract(
    data.version === HAZARD_POLICY_V2_LIMITS.observationVersion && data.units === 'SI',
    'Invalid hazard policy v2 observation version/units',
  );
  requireContract(
    mechanics.version === HAZARD_POLICY_V2_LIMITS.mechanicsVersion,
    'Invalid hazard policy v2 mechanics version',
  );
  requireContract(
    surface.version === HAZARD_POLICY_V2_LIMITS.surfaceVersion,
    'Invalid hazard policy v2 surface version',
  );
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    tick: tick(data.tick),
    speedMps: number(data.speedMps, 0, HAZARD_POLICY_V2_LIMITS.maximumSpeedMps),
    mechanics: Object.freeze({
      version: HAZARD_POLICY_V2_LIMITS.mechanicsVersion,
      classId: choice(mechanics.classId, ['sedan', 'compact'] as const),
    }),
    surface: Object.freeze({
      version: HAZARD_POLICY_V2_LIMITS.surfaceVersion,
      id: choice(surface.id, ['dry-asphalt', 'reduced-adhesion'] as const),
    }),
    postedLimitMps: number(data.postedLimitMps, 0.1, HAZARD_POLICY_V2_LIMITS.maximumSpeedMps),
    pedestrian: pedestrian(data.pedestrian),
    obstacle: obstacle(data.obstacle),
    stimulus: stimulus(data.stimulus),
    evasion: evasion(data.evasion),
    crosswalk: crosswalk(data.crosswalk),
    horn: horn(data.horn),
  });
}
/**
 * Pure 183 layer. The input is admitted first and every refusal dominates; then each channel is
 * evaluated in its own scenario and the command is the envelope of the speed caps plus the brake and
 * evasion decisions.
 */
export function evaluateHazardPolicyV2(input: HazardPolicyV2Input): HazardPolicyV2Command {
  requireContract(!evaluating, 'Reentrant hazard policy v2 evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      world = { sessionId: identity(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING'] as const),
      vehicleSeed = seed(data.seed),
      opportunityKey = identity(
        data.opportunityKey,
        HAZARD_POLICY_V2_LIMITS.opportunityKeyCodeUnits,
      );
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Hazard policy v2 profile token provenance',
    );
    const profile = data.profile as HazardPolicyV2Profile | null,
      observed = observation(data.observation),
      geometry = vehicleClass(observed.mechanics.classId, observed.mechanics.version),
      surface = roadSurface(observed.surface.id, observed.surface.version),
      adhesionLimitMps2 =
        geometry.grip * surface.tireGripScale * HAZARD_POLICY_V2_LIMITS.standardGravityMps2,
      brakeCapabilityMps2 = Math.min(geometry.brakeAcceleration, adhesionLimitMps2),
      commandGeometry: HazardPolicyV2Geometry = Object.freeze({
        classId: geometry.classId,
        widthM: geometry.wheels.trackM,
        brakeAccelerationMps2: geometry.brakeAcceleration,
        grip: geometry.grip,
        adhesionLimitMps2,
        brakeCapabilityMps2,
      });
    let reason: HazardPolicyV2Reason = 'HAZARD_POLICY_V2',
      action: HazardPolicyV2Action = 'UNAVAILABLE',
      pedestrianCommand: HazardPolicyV2PedestrianCommand | null = null,
      pedestrianClearance: HazardPolicyV2ClearanceCommand | null = null,
      obstacleClearance: HazardPolicyV2ClearanceCommand | null = null,
      reactionCommand: HazardPolicyV2ReactionCommand | null = null,
      emergencyCommand: HazardPolicyV2EmergencyCommand | null = null,
      evasionCommand: HazardPolicyV2EvasionCommand | null = null,
      crosswalkCommand: HazardPolicyV2CrosswalkCommand | null = null,
      hornCommand: HazardPolicyV2HornCommand | null = null,
      commandedSpeedMps = 0,
      commandedDecelerationMps2 = 0;
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(world, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    if (reason === 'HAZARD_POLICY_V2' && profile !== null) {
      const values = profile.values,
        mValues = profile.mValues,
        widthM = geometry.wheels.trackM,
        comfortDeceleration = mValues.comfort_deceleration,
        tickHz = HAZARD_POLICY_V2_LIMITS.tickHz,
        speed = observed.speedMps,
        caps: number[] = [observed.postedLimitMps];
      const speedCap = (roomM: number, deceleration: number): number =>
        Math.sqrt(2 * Math.max(0, deceleration) * Math.max(0, roomM));
      // 1. Pedestrian yield: a real crossing opportunity, one sample per opportunity.
      if (observed.pedestrian !== null) {
        const crossing = observed.pedestrian,
          gapS =
            crossing.crossingRemainingS === null || speed <= HAZARD_POLICY_V2_LIMITS.standstillMps
              ? null
              : crossing.distanceM / speed - crossing.crossingRemainingS,
          mandatoryYield = gapS !== null && gapS < mValues.yield_time_gap,
          sample =
            crossing.crossingRemainingS === null
              ? null
              : randomUnit(
                  deriveOpportunitySeed(vehicleSeed, opportunityKey),
                  HAZARD_POLICY_V2_LIMITS.yieldSampleKey,
                  0,
                ),
          yielded =
            crossing.crossingRemainingS !== null &&
            (mandatoryYield || (sample !== null && sample < values.pedestrian_yield_probability));
        pedestrianCommand = Object.freeze({
          pedestrianId: crossing.pedestrianId,
          state: crossing.state,
          distanceM: crossing.distanceM,
          crossingRemainingS: crossing.crossingRemainingS,
          gapS,
          yieldGapS: mValues.yield_time_gap,
          mandatoryYield,
          sample,
          yielded,
        });
        // 2. Pedestrian clearance: a physical minimum, then the fastest stoppable approach.
        const minimumM = widthM + HAZARD_POLICY_V2_LIMITS.clearanceReserveM,
          effectiveM = Math.max(values.pedestrian_clearance, minimumM),
          roomM = Math.max(0, crossing.distanceM - effectiveM),
          capMps = speedCap(roomM, comfortDeceleration);
        pedestrianClearance = Object.freeze({
          desiredM: values.pedestrian_clearance,
          effectiveM,
          minimumM,
          floored: effectiveM > values.pedestrian_clearance,
          distanceM: crossing.distanceM,
          roomM,
          speedCapMps: capMps,
          stopNow: roomM <= 0,
        });
        caps.push(capMps);
        if (yielded) caps.push(0);
      }
      // 3. Obstacle clearance: the authored half width joins the physical minimum.
      if (observed.obstacle !== null) {
        const declared = observed.obstacle,
          minimumM = widthM / 2 + declared.halfWidthM + HAZARD_POLICY_V2_LIMITS.clearanceReserveM,
          effectiveM = Math.max(values.obstacle_clearance, minimumM),
          roomM = Math.max(0, declared.distanceM - effectiveM),
          capMps = speedCap(roomM, comfortDeceleration);
        obstacleClearance = Object.freeze({
          desiredM: values.obstacle_clearance,
          effectiveM,
          minimumM,
          floored: effectiveM > values.obstacle_clearance,
          distanceM: declared.distanceM,
          roomM,
          speedCapMps: capMps,
          stopNow: roomM <= 0,
        });
        caps.push(capMps);
      }
      // 4. Crosswalk approach: the authored limit stays the ceiling.
      if (observed.crosswalk !== null) {
        const approach = observed.crosswalk,
          preferred = Math.min(values.crosswalk_approach_speed, approach.postedLimitMps);
        crosswalkCommand = Object.freeze({
          crosswalkId: approach.crosswalkId,
          distanceM: approach.distanceM,
          postedLimitMps: approach.postedLimitMps,
          preferredSpeedMps: preferred,
          commandedSpeedMps: preferred,
        });
        caps.push(preferred);
      }
      // 5. Hazard reaction: the total delay is capped by the room that is really there.
      if (observed.stimulus !== null) {
        const onset = observed.stimulus,
          closing =
            onset.closingSpeedMps > HAZARD_POLICY_V2_LIMITS.minimumClosingSpeedMps
              ? onset.closingSpeedMps
              : Math.max(speed, HAZARD_POLICY_V2_LIMITS.minimumClosingSpeedMps),
          roomM = Math.max(0, onset.distanceM - onset.halfWidthM),
          stoppingDistanceM = (closing * closing) / (2 * brakeCapabilityMps2),
          maximumFeasibleDelayS = Math.max(0, (roomM - stoppingDistanceM) / closing),
          demandedDelayS = mValues.brake_reaction_delay + values.hazard_reaction_delay,
          delayS = Math.min(demandedDelayS, maximumFeasibleDelayS),
          delayTicks = Math.ceil(delayS * tickHz),
          saturated = demandedDelayS > maximumFeasibleDelayS + 1e-9,
          brakingDistanceM = closing * delayS + stoppingDistanceM,
          stoppingMarginM = roomM - brakingDistanceM,
          feasible = stoppingMarginM >= -1e-9;
        reactionCommand = Object.freeze({
          stimulusId: onset.stimulusId,
          kind: onset.kind,
          onsetTick: onset.onsetTick,
          distanceM: onset.distanceM,
          closingSpeedMps: closing,
          roomM,
          capabilityMps2: brakeCapabilityMps2,
          stoppingDistanceM,
          inheritedDelayS: mValues.brake_reaction_delay,
          demandedDelayS,
          maximumFeasibleDelayS,
          delayS,
          delayTicks,
          saturated,
          brakingDistanceM,
          stoppingMarginM,
          feasible,
        });
        // 6. Emergency brake: the intensity is capped by the adhesion that is really available.
        const requestedDecelerationMps2 =
            values.emergency_brake_intensity * geometry.brakeAcceleration,
          decelerationMps2 = Math.min(requestedDecelerationMps2, adhesionLimitMps2);
        emergencyCommand = Object.freeze({
          intensity: values.emergency_brake_intensity,
          brakeCapabilityMps2,
          adhesionLimitMps2,
          requestedDecelerationMps2,
          decelerationMps2,
          adhesionLimited: requestedDecelerationMps2 > adhesionLimitMps2 + 1e-9,
        });
        commandedDecelerationMps2 = decelerationMps2;
      }
      // 7. Evasion: willingness only counts where the verified lateral space exists.
      if (observed.obstacle !== null && observed.evasion !== null) {
        const space = observed.evasion,
          requiredSpaceM =
            widthM / 2 + observed.obstacle.halfWidthM + HAZARD_POLICY_V2_LIMITS.clearanceReserveM,
          spareM = space.lateralSpaceM - requiredSpaceM,
          feasible = spareM > 0,
          lateralAccelMps2 = Math.min(mValues.curve_lateral_accel, adhesionLimitMps2),
          reachableOffsetM = 0.5 * lateralAccelMps2 * space.timeToObstacleS * space.timeToObstacleS,
          sample = feasible
            ? randomUnit(
                deriveOpportunitySeed(vehicleSeed, opportunityKey),
                HAZARD_POLICY_V2_LIMITS.evasionSampleKey,
                0,
              )
            : null,
          willing = sample !== null && sample < values.evasive_steer_willingness,
          offsetM = willing ? Math.min(spareM, reachableOffsetM) : 0;
        evasionCommand = Object.freeze({
          side: space.side,
          lateralSpaceM: space.lateralSpaceM,
          requiredSpaceM,
          spareM,
          timeToObstacleS: space.timeToObstacleS,
          lateralAccelMps2,
          reachableOffsetM,
          sample,
          willing,
          feasible,
          offsetM,
        });
      }
      // 8. Horn: no sample and no effect where the world does not permit the horn.
      if (observed.horn !== null) {
        const opportunity = observed.horn,
          sample = opportunity.permitted
            ? randomUnit(
                deriveOpportunitySeed(vehicleSeed, opportunityKey),
                HAZARD_POLICY_V2_LIMITS.hornSampleKey,
                0,
              )
            : null,
          used = sample !== null && sample < values.horn_use_probability;
        hornCommand = Object.freeze({
          opportunityId: opportunity.opportunityId,
          permitted: opportunity.permitted,
          sample,
          used,
        });
      }
      commandedSpeedMps = clamp(
        Math.min(...caps),
        0,
        Math.min(HAZARD_POLICY_V2_LIMITS.maximumCommandedSpeedMps, observed.postedLimitMps),
      );
      const declared = [
        observed.pedestrian,
        observed.obstacle,
        observed.stimulus,
        observed.evasion,
        observed.crosswalk,
        observed.horn,
      ].some((entry) => entry !== null);
      const ordered: readonly (readonly [HazardPolicyV2Reason, boolean])[] = [
        ['PEDESTRIAN_MANDATORY_YIELD', pedestrianCommand?.mandatoryYield === true],
        ['PEDESTRIAN_YIELD', pedestrianCommand?.yielded === true],
        [
          'HAZARD_STOPPING_DISTANCE_EXCEEDED',
          reactionCommand !== null && !reactionCommand.feasible,
        ],
        ['HAZARD_REACTION_SATURATED', reactionCommand?.saturated === true],
        ['PEDESTRIAN_CLEARANCE', pedestrianClearance?.stopNow === true],
        ['OBSTACLE_CLEARANCE', obstacleClearance?.stopNow === true],
        ['EVASION_NO_SPACE', evasionCommand !== null && !evasionCommand.feasible],
        ['EVASION_COMMITTED', (evasionCommand?.offsetM ?? 0) > 0],
        ['HAZARD_REACTION', reactionCommand !== null],
        ['EVASION_REFUSED', evasionCommand !== null],
        [
          'PEDESTRIAN_PROCEED',
          pedestrianCommand !== null && pedestrianCommand.crossingRemainingS !== null,
        ],
        ['CROSSWALK_APPROACH', crosswalkCommand !== null],
        ['PEDESTRIAN_CLEARANCE', pedestrianClearance !== null],
        ['OBSTACLE_CLEARANCE', obstacleClearance !== null],
        ['HORN_USED', hornCommand?.used === true],
        ['HORN_REFUSED', hornCommand?.permitted === true],
        ['HORN_FORBIDDEN', hornCommand !== null],
        ['FREE_ROAD', !declared],
      ];
      reason = ordered.find(([, active]) => active)?.[0] ?? 'HAZARD_POLICY_V2';
      action =
        pedestrianCommand?.yielded === true
          ? 'YIELD'
          : reactionCommand !== null && !reactionCommand.feasible
            ? 'BRAKE'
            : commandedSpeedMps === 0
              ? 'BRAKE'
              : commandedDecelerationMps2 > 0
                ? 'BRAKE'
                : (evasionCommand?.offsetM ?? 0) > 0
                  ? 'EVADE'
                  : commandedSpeedMps < observed.postedLimitMps - 1e-9
                    ? 'SLOW'
                    : 'PROCEED';
    }
    return Object.freeze({
      ...world,
      version: HAZARD_POLICY_V2_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      action,
      postedLimitMps: observed.postedLimitMps,
      geometry: commandGeometry,
      surfaceId: surface.id,
      groundFriction: surface.groundFriction,
      tireGripScale: surface.tireGripScale,
      commandedSpeedMps,
      commandedDecelerationMps2,
      pedestrian: pedestrianCommand,
      clearance: Object.freeze({
        pedestrian: pedestrianClearance,
        obstacle: obstacleClearance,
      }),
      reaction: reactionCommand,
      emergencyBrake: emergencyCommand,
      evasion: evasionCommand,
      crosswalk: crosswalkCommand,
      horn: hornCommand,
      retainedHistory: 0,
    });
  } finally {
    evaluating = false;
  }
}
