import { choice, fields, number, requireContract, tick } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { vehicleClass } from '../vehicles';
import type { VehicleClassId } from '../vehicles';
import { captureLongitudinalProfileData } from './longitudinal-control';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

/**
 * 179 lateral policy: lane offset, steering response, steering slew, turn entry and exit, corner
 * cutting, obstacle clearance and the lateral deadband.
 *
 * The layer is a policy over the genuine `049-lateral-v1` projection of the tick, never a second
 * lateral controller: the delivered projection decides tracking, feasibility, preview target,
 * curvature and advisory speed, and the eight R keys only shape the command around it. Geometry
 * comes from the delivered vehicle class (`wheelbaseM`, `trackM`, `steeringRadians`), so a
 * trajectory is normalized by the same mechanics 049 already uses; adherence comes from the M
 * `curve_lateral_accel`, the key 046 already uses for its curve preference.
 *
 * 1. `lane_center_offset` (m) — preferred offset from the authored lane centerline. The offset is
 *    clamped to the 049 corridor (`laneWidth/2 − track/2 − 0.2 m`), so a preference can never put
 *    the wheels outside the authored lane.
 * 2. `steering_response_time` (s) — dead time before a new steering target is acknowledged: after
 *    a target change the committed command is held for `max(1, ceil(key · 60))` ticks, then the
 *    command follows. The floor of one tick keeps the command non-instantaneous at the catalog
 *    minimum of 0.05 s; the interval is a policy constant, not a catalog key.
 * 3. `steering_rate_limit` (rad/s) — maximum road-wheel variation per tick, capped by the explicit
 *    policy ceiling `maximumSteeringRateRadPerS = 1.5 rad/s` (full lock in 0.3 s). The catalog
 *    maximum of 4 rad/s therefore cannot turn the command into a jump.
 * 4. `turn_entry_speed` (m/s) — preferred speed for a turn (`radius ≤ 40 m`), always bounded by the
 *    adherence ceiling `min(sqrt(curve_lateral_accel · radius), 049 advisory)`; no key value can
 *    enter a curve above the physical limit derived from the geometry.
 * 5. `turn_exit_acceleration` (m/s²) — preferred acceleration on the first tick after a turn,
 *    bounded by the M `desired_acceleration` of the same profile, so the exit can never ask for
 *    more acceleration than the delivered style owner already allows.
 * 6. `corner_cutting_bias` (ratio) — preference to shorten the path towards the inside of the turn,
 *    `bias · corridor` metres, so cutting stays inside the same corridor as the lane offset.
 * 7. `lateral_clearance` (m) — desired space to a declared obstacle. It is a minimum: the effective
 *    clearance is `max(key, trackM + 0.2 m)`, so no admissible key can squeeze the vehicle below its
 *    own width plus a margin, and a declared gap below the effective clearance forbids the pass.
 * 8. `lateral_correction_deadband` (m) — tolerance around the desired offset: inside the band the
 *    cross-track correction is zero and only the 049 geometry tracking steers the car.
 *
 * The layer keeps no history (`retainedHistory: 0`): the caller carries the committed steering
 * angle, the tracked target, the remaining dead-time ticks and the previous in-turn flag.
 */
export const LATERAL_POLICY_V2_KEYS = Object.freeze([
  'lane_center_offset',
  'steering_response_time',
  'steering_rate_limit',
  'turn_entry_speed',
  'turn_exit_acceleration',
  'corner_cutting_bias',
  'lateral_clearance',
  'lateral_correction_deadband',
] as const);
export type LateralPolicyV2Key = (typeof LATERAL_POLICY_V2_KEYS)[number];
/** The delivered 046/047 M keys the layer reads without changing their meaning. */
export const LATERAL_POLICY_V2_M_KEYS = Object.freeze([
  'curve_lateral_accel',
  'desired_acceleration',
] as const);
export type LateralPolicyV2MKey = (typeof LATERAL_POLICY_V2_M_KEYS)[number];
export const LATERAL_POLICY_V2_LIMITS = Object.freeze({
  version: '179-lateral-policy-v2' as const,
  observationVersion: '179-lateral-observation-v1' as const,
  projectionVersion: '049-lateral-v1' as const,
  mechanicsVersion: '023-mechanics-v1' as const,
  idCodeUnits: 256,
  profileCodeUnits: 128,
  tickHz: 60,
  maximumTimeS: 3600,
  maximumLaneWidthM: 20,
  maximumDeviationM: 20,
  maximumSpeedMps: 100,
  maximumClearanceM: 10,
  maximumCurvaturePerM: 10,
  /**
   * Explicit ceiling of `steering_rate_limit`: 1.5 rad/s reaches full lock in 0.3 s, so no
   * admissible value of the catalog (up to 4 rad/s) may turn the command into a jump.
   */
  maximumSteeringRateRadPerS: 1.5,
  /** `steering_response_time` floor, in ticks: the command is never instantaneous. */
  minimumResponseTicks: 1,
  /** A turn is a local radius at or below this value; the 049 preview is the source of the radius. */
  turnRadiusThresholdM: 40,
  /** Same corridor rule as the delivered 049 controller. */
  corridorMarginM: 0.2,
  /** Same preview as the delivered 049 controller. */
  previewBaseM: 3,
  previewSeconds: 0.45,
  /** Lateral clearance floor: the wheel track plus the body margin of the vehicle class. */
  clearanceBodyMarginM: 0.2,
  /** A steering-target change below this angle is road noise and does not restart the dead time. */
  steeringTargetToleranceRad: 0.01,
  retainedHistory: 0,
});
export interface LateralPolicyV2Profile {
  readonly version: '179-lateral-policy-v2';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<LateralPolicyV2Key, number>>;
  readonly units: Readonly<Record<LateralPolicyV2Key, ParameterUnit>>;
  readonly provenance: Readonly<Record<LateralPolicyV2Key, string>>;
  readonly mValues: Readonly<Record<LateralPolicyV2MKey, number>>;
  readonly mUnits: Readonly<Record<LateralPolicyV2MKey, ParameterUnit>>;
}
/** A declared obstacle the vehicle is passing; the side must agree with the sign of the offset. */
export interface LateralPolicyV2Obstacle {
  readonly side: 'LEFT' | 'RIGHT';
  /** Signed lateral centre of the obstacle from the lane centerline, positive to the right. */
  readonly lateralOffsetM: number;
  readonly widthM: number;
}
export interface LateralPolicyV2Observation extends BehaviorScope {
  readonly version: '179-lateral-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  /** Authored width of the current lane, m. */
  readonly laneWidthM: number;
  /** Signed lateral deviation of the vehicle from the lane centerline, positive to the right. */
  readonly lateralDeviationM: number;
  readonly speedMps: number;
  readonly obstacle: LateralPolicyV2Obstacle | null;
}
/** Caller-held latch: committed steering, tracked target, dead time and the previous turn flag. */
export interface LateralPolicyV2State {
  /** Committed steering angle at the road wheel, rad. */
  readonly steeringRad: number;
  /** Steering target the dead time last acknowledged, rad. */
  readonly committedTargetRad: number;
  readonly holdTicksRemaining: number;
  /** Whether the previous decision tick was inside a turn. */
  readonly inTurn: boolean;
}
export const LATERAL_POLICY_V2_EMPTY_STATE: LateralPolicyV2State = Object.freeze({
  steeringRad: 0,
  committedTargetRad: 0,
  holdTicksRemaining: 0,
  inTurn: false,
});
export interface LateralPolicyV2Mechanics {
  readonly version: '023-mechanics-v1';
  readonly classId: VehicleClassId;
}
export interface LateralPolicyV2Input extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly profile: LateralPolicyV2Profile | null;
  /** The genuine 049 projection of this tick, or null when no lateral evidence exists. */
  readonly lateral: unknown;
  readonly observation: LateralPolicyV2Observation;
  readonly state: LateralPolicyV2State;
  readonly mechanics: LateralPolicyV2Mechanics;
}
export type LateralPolicyV2Action = 'TRACK' | 'UNAVAILABLE';
export type LateralPolicyV2Reason =
  | 'LATERAL_POLICY_V2'
  | 'NO_AUTO_AUTHORITY'
  | 'MISSING_PROFILE'
  | 'FOREIGN_OR_STALE_OBSERVATION'
  | 'PROJECTION_UNAVAILABLE'
  | 'FOREIGN_OR_STALE_PROJECTION'
  | 'PROJECTION_UNUSABLE'
  | 'TRACKING'
  | 'CLEARANCE_HOLD';
export interface LateralPolicyV2Command extends BehaviorScope {
  readonly version: '179-lateral-policy-v2';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: LateralPolicyV2Reason;
  readonly action: LateralPolicyV2Action;
  /** The 049 diagnostic, forwarded unchanged. */
  readonly projectionReason: string | null;
  readonly trajectoryId: string | null;
  readonly laneCorridorM: number;
  readonly laneOffsetTargetM: number;
  readonly cornerCutM: number;
  readonly desiredOffsetM: number;
  readonly deviationErrorM: number;
  readonly correctionActive: boolean;
  readonly lookaheadM: number;
  readonly correctionSteeringRad: number;
  readonly baseSteeringRad: number;
  readonly rawSteeringRad: number;
  /** Committed road-wheel angle after the dead time and the rate limit, rad. */
  readonly steeringRad: number;
  /** Normalized command in [−1, 1], the same convention as the 049 steering. */
  readonly steering: number;
  readonly steeringStepRad: number;
  readonly steeringRateRadPerS: number;
  readonly responseTicks: number;
  readonly holdTicksRemaining: number;
  readonly inTurn: boolean;
  readonly localRadiusM: number | null;
  readonly adherenceCeilingMps: number | null;
  readonly turnSpeedLimitMps: number | null;
  /** Preferred acceleration on the exit tick; zero while the vehicle is not leaving a turn. */
  readonly exitAccelerationMps2: number;
  readonly effectiveClearanceM: number;
  readonly availableClearanceM: number | null;
  readonly clearanceMarginM: number | null;
  /** False when a declared obstacle gap is below the effective clearance. */
  readonly manoeuvrePermitted: boolean;
  /** The latch the caller must carry into the next decision. */
  readonly state: LateralPolicyV2State;
  readonly retainedHistory: 0;
}
let compiling = false;
let evaluating = false;
export function getLateralPolicyV2Stats() {
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
  'laneWidthM',
  'lateralDeviationM',
  'speedMps',
  'obstacle',
] as const;
const obstacleFields = ['side', 'lateralOffsetM', 'widthM'] as const;
const stateFields = ['steeringRad', 'committedTargetRad', 'holdTicksRemaining', 'inTurn'] as const;
const mechanicsFields = ['version', 'classId'] as const;
const inputFields = [
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'authority',
  'profile',
  'lateral',
  'observation',
  'state',
  'mechanics',
] as const;
/** The delivered 049 projection shape, re-admitted exactly as 049 produced it. */
const projectionFields = [
  'version',
  'sessionId',
  'worldEpoch',
  'mapId',
  'mapVersionId',
  'actor',
  'tick',
  'sourceTick',
  'trajectoryId',
  'steering',
  'feasible',
  'reason',
  'advisorySpeedLimitMps',
  'requestedSpeedMps',
  'actualSpeedMps',
  'crossTrackM',
  'targetM',
  'curvaturePerM',
] as const;
function identity(value: unknown, maximum: number = LATERAL_POLICY_V2_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid lateral policy v2 identity',
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
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
export function compileLateralPolicyProfile(input: unknown): LateralPolicyV2Profile {
  requireContract(!compiling, 'Reentrant lateral policy v2 profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<LateralPolicyV2Key, number>,
      units = {} as Record<LateralPolicyV2Key, ParameterUnit>,
      provenance = {} as Record<LateralPolicyV2Key, string>,
      mValues = {} as Record<LateralPolicyV2MKey, number>,
      mUnits = {} as Record<LateralPolicyV2MKey, ParameterUnit>;
    for (const key of LATERAL_POLICY_V2_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing lateral policy v2 parameter',
      );
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    for (const key of LATERAL_POLICY_V2_M_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing lateral policy v2 M parameter',
      );
      mValues[key] = published.parameters[key];
      mUnits[key] = published.unitsByParameter[key];
    }
    const result: LateralPolicyV2Profile = Object.freeze({
      version: LATERAL_POLICY_V2_LIMITS.version,
      profileId: identity(published.profileId),
      versionId: identity(published.versionId, LATERAL_POLICY_V2_LIMITS.profileCodeUnits),
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
interface AdmittedObservation extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly laneWidthM: number;
  readonly lateralDeviationM: number;
  readonly speedMps: number;
  readonly obstacle: LateralPolicyV2Obstacle | null;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields);
  requireContract(
    data.version === LATERAL_POLICY_V2_LIMITS.observationVersion && data.units === 'SI',
    'Invalid lateral policy v2 observation version/units',
  );
  let obstacle: LateralPolicyV2Obstacle | null = null;
  if (data.obstacle !== null) {
    const raw = fields(data.obstacle, obstacleFields),
      side = choice(raw.side, ['LEFT', 'RIGHT'] as const),
      lateralOffsetM = number(
        raw.lateralOffsetM,
        -LATERAL_POLICY_V2_LIMITS.maximumDeviationM,
        LATERAL_POLICY_V2_LIMITS.maximumDeviationM,
      ),
      widthM = number(raw.widthM, 0, LATERAL_POLICY_V2_LIMITS.maximumClearanceM);
    requireContract(
      (side === 'RIGHT' && lateralOffsetM > 0) || (side === 'LEFT' && lateralOffsetM < 0),
      'Lateral policy v2 obstacle side disagrees with its offset',
    );
    obstacle = Object.freeze({ side, lateralOffsetM, widthM });
  }
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    tick: tick(data.tick),
    laneWidthM: number(data.laneWidthM, 0.5, LATERAL_POLICY_V2_LIMITS.maximumLaneWidthM),
    lateralDeviationM: number(
      data.lateralDeviationM,
      -LATERAL_POLICY_V2_LIMITS.maximumDeviationM,
      LATERAL_POLICY_V2_LIMITS.maximumDeviationM,
    ),
    speedMps: number(data.speedMps, 0, LATERAL_POLICY_V2_LIMITS.maximumSpeedMps),
    obstacle,
  });
}
interface AdmittedProjection extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly trajectoryId: string | null;
  readonly steering: number;
  readonly feasible: boolean;
  readonly reason: string;
  readonly advisorySpeedLimitMps: number;
  readonly curvaturePerM: number | null;
}
function projection(value: unknown): AdmittedProjection {
  const data = fields(value, projectionFields);
  requireContract(
    data.version === LATERAL_POLICY_V2_LIMITS.projectionVersion,
    'Unknown lateral policy v2 projection version',
  );
  requireContract(typeof data.feasible === 'boolean', 'Invalid lateral policy v2 feasibility');
  if (data.targetM !== null) {
    fields(data.targetM, ['x', 'y', 'z']);
  }
  if (data.sourceTick !== null) tick(data.sourceTick);
  if (data.crossTrackM !== null)
    number(data.crossTrackM, 0, LATERAL_POLICY_V2_LIMITS.maximumDeviationM * 50);
  const result: AdmittedProjection = Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    mapId: identity(data.mapId, LATERAL_POLICY_V2_LIMITS.profileCodeUnits),
    mapVersionId: identity(data.mapVersionId, LATERAL_POLICY_V2_LIMITS.profileCodeUnits),
    actor: actor(data.actor),
    tick: tick(data.tick),
    trajectoryId: data.trajectoryId === null ? null : identity(data.trajectoryId),
    steering: number(data.steering, -1, 1),
    feasible: data.feasible,
    reason: identity(data.reason),
    advisorySpeedLimitMps: number(
      data.advisorySpeedLimitMps,
      0,
      LATERAL_POLICY_V2_LIMITS.maximumSpeedMps,
    ),
    curvaturePerM:
      data.curvaturePerM === null
        ? null
        : number(
            data.curvaturePerM,
            -LATERAL_POLICY_V2_LIMITS.maximumCurvaturePerM,
            LATERAL_POLICY_V2_LIMITS.maximumCurvaturePerM,
          ),
  });
  number(data.requestedSpeedMps, 0, LATERAL_POLICY_V2_LIMITS.maximumSpeedMps);
  if (data.actualSpeedMps !== null)
    number(data.actualSpeedMps, 0, LATERAL_POLICY_V2_LIMITS.maximumSpeedMps);
  return result;
}
function state(value: unknown, fullLockRad: number): LateralPolicyV2State {
  const data = fields(value, stateFields);
  requireContract(typeof data.inTurn === 'boolean', 'Invalid lateral policy v2 turn flag');
  const result = Object.freeze({
    steeringRad: number(data.steeringRad, -fullLockRad, fullLockRad),
    committedTargetRad: number(data.committedTargetRad, -fullLockRad, fullLockRad),
    holdTicksRemaining: tick(data.holdTicksRemaining),
    inTurn: data.inTurn,
  });
  requireContract(
    result.holdTicksRemaining <= Math.ceil(1.5 * LATERAL_POLICY_V2_LIMITS.tickHz),
    'Lateral policy v2 dead time exceeds its bound',
  );
  return result;
}
function mechanics(value: unknown) {
  const data = fields(value, mechanicsFields);
  requireContract(
    data.version === LATERAL_POLICY_V2_LIMITS.mechanicsVersion,
    'Unknown lateral policy v2 mechanics version',
  );
  return vehicleClass(choice(data.classId, ['sedan', 'compact'] as const));
}
/**
 * Pure 179 layer. The 049 projection is admitted first and any refusal dominates; the eight R keys
 * then act only in their own scenario and never rewrite the delivered projection.
 */
export function evaluateLateralPolicyV2(input: LateralPolicyV2Input): LateralPolicyV2Command {
  requireContract(!evaluating, 'Reentrant lateral policy v2 evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      world = { sessionId: identity(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING'] as const);
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Lateral policy v2 profile token provenance',
    );
    const profile = data.profile as LateralPolicyV2Profile | null,
      config = mechanics(data.mechanics),
      observed = observation(data.observation),
      carried = state(data.state, config.steeringRadians),
      admitted = data.lateral === null ? null : projection(data.lateral);
    const fullLockRad = config.steeringRadians,
      trackM = config.wheels.trackM,
      wheelbaseM = config.wheels.wheelbaseM,
      minimumClearanceM = trackM + LATERAL_POLICY_V2_LIMITS.clearanceBodyMarginM;
    let reason: LateralPolicyV2Reason = 'LATERAL_POLICY_V2',
      action: LateralPolicyV2Action = 'UNAVAILABLE',
      laneCorridorM = 0,
      laneOffsetTargetM = 0,
      cornerCutM = 0,
      desiredOffsetM = 0,
      deviationErrorM = 0,
      correctionActive = false,
      lookaheadM = 0,
      correctionSteeringRad = 0,
      baseSteeringRad = 0,
      rawSteeringRad = 0,
      steeringRad = carried.steeringRad,
      steeringStepRad = 0,
      steeringRateRadPerS = 0,
      responseTicks: number = LATERAL_POLICY_V2_LIMITS.minimumResponseTicks,
      holdTicksRemaining = carried.holdTicksRemaining,
      inTurn = false,
      localRadiusM: number | null = null,
      adherenceCeilingMps: number | null = null,
      turnSpeedLimitMps: number | null = null,
      exitAccelerationMps2 = 0,
      effectiveClearanceM = minimumClearanceM,
      availableClearanceM: number | null = null,
      clearanceMarginM: number | null = null,
      manoeuvrePermitted = true,
      nextState: LateralPolicyV2State = carried;
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(world, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    else if (admitted === null) reason = 'PROJECTION_UNAVAILABLE';
    else if (
      !sameScope(world, admitted) ||
      !sameActor(subject, admitted.actor) ||
      admitted.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_PROJECTION';
    else if (!admitted.feasible) reason = 'PROJECTION_UNUSABLE';
    if (reason === 'LATERAL_POLICY_V2' && profile !== null && admitted !== null) {
      const values = profile.values,
        mValues = profile.mValues,
        speedMps = observed.speedMps,
        path = admitted;
      laneCorridorM = Math.max(
        0,
        observed.laneWidthM / 2 - trackM / 2 - LATERAL_POLICY_V2_LIMITS.corridorMarginM,
      );
      // The preference is clamped to the authored corridor: the wheels never leave the lane.
      laneOffsetTargetM = clamp(values.lane_center_offset, -laneCorridorM, laneCorridorM);
      const curvaturePerM = path.curvaturePerM ?? 0;
      localRadiusM = Math.abs(curvaturePerM) > 0.000001 ? 1 / Math.abs(curvaturePerM) : null;
      inTurn =
        localRadiusM !== null && localRadiusM <= LATERAL_POLICY_V2_LIMITS.turnRadiusThresholdM;
      const insideSign = curvaturePerM > 0 ? 1 : curvaturePerM < 0 ? -1 : 0;
      // Cutting shortens the path towards the inside, inside the same corridor as the offset.
      const cut = inTurn ? values.corner_cutting_bias * laneCorridorM * insideSign : 0;
      cornerCutM = cut === 0 ? 0 : cut;
      desiredOffsetM = clamp(laneOffsetTargetM + cornerCutM, -laneCorridorM, laneCorridorM);
      deviationErrorM = observed.lateralDeviationM - desiredOffsetM;
      correctionActive = Math.abs(deviationErrorM) > values.lateral_correction_deadband;
      lookaheadM = Math.max(
        1,
        LATERAL_POLICY_V2_LIMITS.previewBaseM + speedMps * LATERAL_POLICY_V2_LIMITS.previewSeconds,
      );
      // Pure-pursuit form already used by 049: the lateral error over the lookahead is a curvature.
      correctionSteeringRad = correctionActive
        ? clamp(
            Math.atan(wheelbaseM * ((-2 * deviationErrorM) / (lookaheadM * lookaheadM))),
            -fullLockRad,
            fullLockRad,
          )
        : 0;
      baseSteeringRad = path.steering * fullLockRad;
      rawSteeringRad = clamp(baseSteeringRad + correctionSteeringRad, -fullLockRad, fullLockRad);
      responseTicks = Math.max(
        LATERAL_POLICY_V2_LIMITS.minimumResponseTicks,
        Math.ceil(values.steering_response_time * LATERAL_POLICY_V2_LIMITS.tickHz),
      );
      steeringRateRadPerS = Math.min(
        values.steering_rate_limit,
        LATERAL_POLICY_V2_LIMITS.maximumSteeringRateRadPerS,
      );
      const rateStepRad = steeringRateRadPerS / LATERAL_POLICY_V2_LIMITS.tickHz;
      let committedTargetRad = carried.committedTargetRad;
      holdTicksRemaining = carried.holdTicksRemaining;
      if (
        Math.abs(rawSteeringRad - committedTargetRad) >
          LATERAL_POLICY_V2_LIMITS.steeringTargetToleranceRad &&
        holdTicksRemaining === 0
      ) {
        // A new target is acknowledged only after the dead time; the dead time cannot be skipped.
        committedTargetRad = rawSteeringRad;
        holdTicksRemaining = responseTicks;
      }
      if (holdTicksRemaining > 0) holdTicksRemaining -= 1;
      else {
        steeringRad =
          carried.steeringRad +
          clamp(committedTargetRad - carried.steeringRad, -rateStepRad, rateStepRad);
      }
      steeringStepRad = steeringRad - carried.steeringRad;
      // Entry speed is a preference under the adherence ceiling derived from the real geometry.
      if (inTurn && localRadiusM !== null) {
        adherenceCeilingMps = Math.min(
          Math.sqrt(mValues.curve_lateral_accel * localRadiusM),
          path.advisorySpeedLimitMps,
        );
        turnSpeedLimitMps = Math.min(values.turn_entry_speed, adherenceCeilingMps);
      }
      exitAccelerationMps2 =
        !inTurn && carried.inTurn
          ? Math.min(values.turn_exit_acceleration, mValues.desired_acceleration)
          : 0;
      effectiveClearanceM = Math.max(values.lateral_clearance, minimumClearanceM);
      if (observed.obstacle !== null) {
        availableClearanceM = Math.max(
          0,
          Math.abs(observed.obstacle.lateralOffsetM) - observed.obstacle.widthM / 2 - trackM / 2,
        );
        clearanceMarginM = availableClearanceM - effectiveClearanceM;
        manoeuvrePermitted = availableClearanceM >= effectiveClearanceM;
      }
      action = 'TRACK';
      reason = manoeuvrePermitted ? 'TRACKING' : 'CLEARANCE_HOLD';
      nextState = Object.freeze({
        steeringRad,
        committedTargetRad,
        holdTicksRemaining,
        inTurn,
      });
    }
    return Object.freeze({
      ...world,
      version: LATERAL_POLICY_V2_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      action,
      projectionReason: admitted?.reason ?? null,
      trajectoryId: admitted?.trajectoryId ?? null,
      laneCorridorM,
      laneOffsetTargetM,
      cornerCutM,
      desiredOffsetM,
      deviationErrorM,
      correctionActive,
      lookaheadM,
      correctionSteeringRad,
      baseSteeringRad,
      rawSteeringRad,
      steeringRad,
      steering: fullLockRad === 0 ? 0 : steeringRad / fullLockRad,
      steeringStepRad,
      steeringRateRadPerS,
      responseTicks,
      holdTicksRemaining,
      inTurn,
      localRadiusM,
      adherenceCeilingMps,
      turnSpeedLimitMps,
      exitAccelerationMps2,
      effectiveClearanceM,
      availableClearanceM,
      clearanceMarginM,
      manoeuvrePermitted,
      state: nextState,
      retainedHistory: 0,
    });
  } finally {
    evaluating = false;
  }
}
