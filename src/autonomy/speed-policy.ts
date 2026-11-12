import { boolean, choice, fields, number, requireContract, tick } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { captureLongitudinalProfileData } from './longitudinal-control';
import type { CruiseTarget } from './cruise-targets';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

/** The four reserved tempo keys 167 activates on top of the delivered 046/047/048 layers. */
export const SPEED_POLICY_KEYS = Object.freeze([
  'speed_delta_arterial',
  'cruise_speed_variability',
  'overtake_speed_bonus',
  'cruise_accel_deadband',
] as const);
export type SpeedPolicyKey = (typeof SPEED_POLICY_KEYS)[number];
export const SPEED_POLICY_LIMITS = Object.freeze({
  version: '167-speed-policy-v1' as const,
  observationVersion: '167-observation-v1' as const,
  idCodeUnits: 256,
  maximumCoveredSpeedMps: 30,
  maximumTargetAgeTicks: 5,
  /** One full variability cycle is ten seconds at the 60 Hz authoritative tick. */
  variabilityPeriodTicks: 600,
  /** Below this gap the hard traffic constraint commands a stop instead of a following speed. */
  minimumLeadGapM: 5,
  /** A closing speed of one metre per second needs this many seconds to consume the gap margin. */
  gapClosingHorizonS: 2,
  maximumSeed: 2147483647,
  retainedHistory: 0,
});
export interface SpeedPolicyProfile {
  readonly version: '167-speed-policy-v1';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<SpeedPolicyKey, number>>;
  readonly units: Readonly<Record<SpeedPolicyKey, ParameterUnit>>;
  readonly provenance: Readonly<Record<SpeedPolicyKey, string>>;
}
export interface SpeedPolicyObservation extends BehaviorScope {
  readonly version: '167-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly longitudinalSpeedMps: number;
  readonly roadKind: 'URBAN' | 'RESIDENTIAL' | 'ARTERIAL' | 'UNKNOWN';
  readonly postedLimitMps: number;
  /** Observed lead vehicle facts; both null when the lane ahead is free. */
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  readonly stopRequired: boolean;
  readonly overtaking: boolean;
}
export interface SpeedPolicyInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly profile: SpeedPolicyProfile | null;
  /** Genuine 046 result on URBAN/RESIDENTIAL roads; null exactly when the road is ARTERIAL. */
  readonly target: CruiseTarget | null;
  readonly observation: SpeedPolicyObservation;
  readonly seed: number;
  /** Previously committed target, owned by the caller; used only for the deadband hold. */
  readonly previousCommittedMps: number | null;
}
export interface SpeedPolicyCommand extends BehaviorScope {
  readonly version: '167-speed-policy-v1';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly seed: number;
  readonly reason: string;
  readonly roadKind: SpeedPolicyObservation['roadKind'];
  readonly baseStyleMps: number;
  readonly arterialDeltaMps: number;
  readonly variabilityOffsetMps: number;
  readonly overtakeBonusMps: number;
  readonly styleTargetMps: number;
  readonly styleCeilingMps: number;
  readonly envelopeMps: number;
  readonly deadbandMps: number;
  readonly committedTargetMps: number;
  readonly postedDeviationMps: number | null;
  readonly throttleRequest: 'STOP' | 'ACCELERATE' | 'HOLD' | 'BRAKE';
  readonly bindingConstraint:
    | 'NONE'
    | 'SIGNAL'
    | 'TRAFFIC'
    | 'CURVE'
    | 'APPROACH'
    | 'MECHANICAL_CAP'
    | 'STYLE_CEILING'
    | 'DEADBAND';
}
const profiles = new WeakSet<object>();
let compiling = false;
let evaluating = false;
const observationFields = [
  'version',
  'units',
  'sessionId',
  'worldEpoch',
  'actor',
  'tick',
  'longitudinalSpeedMps',
  'roadKind',
  'postedLimitMps',
  'leadGapM',
  'leadSpeedMps',
  'stopRequired',
  'overtaking',
] as const;
const inputFields = [
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'authority',
  'profile',
  'target',
  'observation',
  'seed',
  'previousCommittedMps',
] as const;
/** The delivered 046 result shape, re-admitted here exactly as 047 admits it. */
const targetFields = [
  'version',
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'sourceTick',
  'profileVersionId',
  'engineVersion',
  'behaviorReason',
  'reason',
  'targetMps',
  'preferredRoadMps',
  'preferredCurveMps',
  'preferredApproachMps',
  'styleTargetMps',
  'postedDeviationMps',
  'mechanicalCoverageCapMps',
  'mechanicalVersion',
  'lateralAdvisoryMps',
  'exceedsLateralAdvisory',
] as const;
const usableTargetReasons = [
  'FREE_ROAD',
  'MECHANICAL_COVERAGE_CAP',
  'INTERSECTION_APPROACH',
  'CURVE_PREFERENCE',
  'FOLLOWING_PREFERENCE',
] as const;
function id(value: unknown): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= SPEED_POLICY_LIMITS.idCodeUnits &&
      value.trim() === value,
    'Invalid speed policy identity',
  );
  return value;
}
function actor(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: id(data.id), incarnation: tick(data.incarnation) });
}
function sameScope(a: BehaviorScope, b: BehaviorScope): boolean {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
function sameActor(a: BehaviorActor, b: BehaviorActor): boolean {
  return a.id === b.id && a.incarnation === b.incarnation;
}
export function compileSpeedPolicyProfile(input: unknown): SpeedPolicyProfile {
  requireContract(!compiling, 'Reentrant speed policy profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<SpeedPolicyKey, number>,
      units = {} as Record<SpeedPolicyKey, ParameterUnit>,
      provenance = {} as Record<SpeedPolicyKey, string>;
    for (const key of SPEED_POLICY_KEYS) {
      requireContract(Object.hasOwn(published.parameters, key), 'Missing speed policy parameter');
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    const result: SpeedPolicyProfile = Object.freeze({
      version: SPEED_POLICY_LIMITS.version,
      profileId: id(published.profileId),
      versionId: id(published.versionId),
      engineVersion: id(published.engineVersion),
      values: Object.freeze(values),
      units: Object.freeze(units),
      provenance: Object.freeze(provenance),
    });
    profiles.add(result);
    return result;
  } finally {
    compiling = false;
  }
}
interface AdmittedTarget {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly engineVersion: string | null;
  readonly reason: string;
  readonly targetMps: number;
  readonly preferredCurveMps: number | null;
  readonly preferredApproachMps: number | null;
}
function target(value: unknown): AdmittedTarget {
  const data = fields(value, targetFields);
  requireContract(
    data.version === '046-cruise-v1' &&
      data.mechanicalVersion === '031-coverage-046-v1' &&
      data.mechanicalCoverageCapMps === 30,
    'Unknown speed policy target version',
  );
  for (const key of [
    'preferredRoadMps',
    'preferredCurveMps',
    'preferredApproachMps',
    'styleTargetMps',
  ])
    if (data[key] !== null) number(data[key], 0, 10000);
  if (data.lateralAdvisoryMps !== null) number(data.lateralAdvisoryMps, 0, 10000);
  requireContract(typeof data.exceedsLateralAdvisory === 'boolean', 'Invalid target advisory');
  if (data.behaviorReason !== null) id(data.behaviorReason);
  return Object.freeze({
    sessionId: id(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    decisionTick: tick(data.decisionTick),
    profileVersionId: data.profileVersionId === null ? null : id(data.profileVersionId),
    engineVersion: data.engineVersion === null ? null : id(data.engineVersion),
    reason: id(data.reason),
    targetMps: number(data.targetMps, 0, SPEED_POLICY_LIMITS.maximumCoveredSpeedMps),
    preferredCurveMps: data.preferredCurveMps === null ? null : (data.preferredCurveMps as number),
    preferredApproachMps:
      data.preferredApproachMps === null ? null : (data.preferredApproachMps as number),
  });
}
interface AdmittedObservation extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly longitudinalSpeedMps: number;
  readonly roadKind: SpeedPolicyObservation['roadKind'];
  readonly postedLimitMps: number;
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  readonly stopRequired: boolean;
  readonly overtaking: boolean;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields);
  requireContract(
    data.version === SPEED_POLICY_LIMITS.observationVersion && data.units === 'SI',
    'Invalid speed policy observation version/units',
  );
  const leadGapM = data.leadGapM === null ? null : number(data.leadGapM, 0, 100000),
    leadSpeedMps = data.leadSpeedMps === null ? null : number(data.leadSpeedMps, 0, 100),
    result: AdmittedObservation = Object.freeze({
      sessionId: id(data.sessionId),
      worldEpoch: tick(data.worldEpoch),
      actor: actor(data.actor),
      tick: tick(data.tick),
      longitudinalSpeedMps: number(data.longitudinalSpeedMps, -1000, 1000),
      roadKind: choice(data.roadKind, ['URBAN', 'RESIDENTIAL', 'ARTERIAL', 'UNKNOWN']),
      postedLimitMps: number(data.postedLimitMps, 0, 100),
      leadGapM,
      leadSpeedMps,
      stopRequired: boolean(data.stopRequired),
      overtaking: boolean(data.overtaking),
    });
  requireContract((leadGapM === null) === (leadSpeedMps === null), 'Incomplete lead vehicle facts');
  return result;
}
/** Hard traffic constraint: no closing speed inside the minimum gap, bounded closing time beyond it. */
function trafficLimitMps(gapM: number | null, leadSpeedMps: number | null): number | null {
  if (gapM === null || leadSpeedMps === null) return null;
  if (gapM <= SPEED_POLICY_LIMITS.minimumLeadGapM) return 0;
  return Math.max(
    0,
    leadSpeedMps +
      (gapM - SPEED_POLICY_LIMITS.minimumLeadGapM) / SPEED_POLICY_LIMITS.gapClosingHorizonS,
  );
}
/** Explicit seed and actor id fix the wave phase; the wave itself follows the authoritative tick. */
function variabilityPhase(seed: number, actorId: string): number {
  let hash = 0x811c9dc5;
  const text = `${seed}:${actorId}`;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (2 * Math.PI * hash) / 0x100000000;
}
/** Stateless tempo layer; the caller owns freshness, admission and the previous committed target. */
export function evaluateSpeedPolicy(input: SpeedPolicyInput): SpeedPolicyCommand {
  requireContract(!evaluating, 'Reentrant speed policy evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      scope = { sessionId: id(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING']),
      seed = tick(data.seed);
    requireContract(seed <= SPEED_POLICY_LIMITS.maximumSeed, 'Speed policy seed out of range');
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Speed policy profile token provenance',
    );
    const profile = data.profile as SpeedPolicyProfile | null,
      observed = observation(data.observation),
      requested = data.target === null ? null : target(data.target),
      previous =
        data.previousCommittedMps === null
          ? null
          : number(data.previousCommittedMps, 0, SPEED_POLICY_LIMITS.maximumCoveredSpeedMps);
    let reason = 'SPEED_POLICY';
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(scope, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    else if (observed.roadKind === 'UNKNOWN') reason = 'UNSUPPORTED_ROAD_KIND';
    else if (observed.roadKind === 'ARTERIAL' && requested !== null)
      reason = 'TARGET_ROAD_KIND_MISMATCH';
    else if (observed.roadKind !== 'ARTERIAL' && requested === null) reason = 'MISSING_TARGET';
    else if (
      requested !== null &&
      (!sameScope(scope, requested) || !sameActor(subject, requested.actor))
    )
      reason = 'FOREIGN_TARGET';
    else if (
      requested !== null &&
      (requested.decisionTick > decisionTick ||
        decisionTick - requested.decisionTick > SPEED_POLICY_LIMITS.maximumTargetAgeTicks)
    )
      reason = 'STALE_TARGET';
    else if (
      requested !== null &&
      (requested.profileVersionId !== profile.versionId ||
        requested.engineVersion !== profile.engineVersion)
    )
      reason = 'TARGET_PROFILE_MISMATCH';
    else if (
      requested !== null &&
      !(usableTargetReasons as readonly string[]).includes(requested.reason)
    )
      reason = 'TARGET_NOT_USABLE';
    const deadbandMps = profile === null ? 0 : profile.values.cruise_accel_deadband;
    let baseStyleMps = 0,
      arterialDeltaMps = 0,
      variabilityOffsetMps = 0,
      overtakeBonusMps = 0,
      styleTargetMps = 0,
      styleCeilingMps = 0,
      envelopeMps = 0,
      committedTargetMps = 0,
      postedDeviationMps: number | null = null,
      bindingConstraint: SpeedPolicyCommand['bindingConstraint'] = 'NONE';
    if (reason === 'SPEED_POLICY') {
      const values = profile!.values,
        arterial = observed.roadKind === 'ARTERIAL';
      // Style: the arterial delta is the same class as the two 046 road deltas, not a tempo key.
      arterialDeltaMps = arterial ? values.speed_delta_arterial : 0;
      baseStyleMps = arterial
        ? Math.max(0, observed.postedLimitMps + arterialDeltaMps)
        : requested!.targetMps;
      const curveCap = arterial ? null : requested!.preferredCurveMps,
        approachCap = arterial ? null : requested!.preferredApproachMps,
        trafficCap = trafficLimitMps(observed.leadGapM, observed.leadSpeedMps);
      // The tempo keys may only use the budget the driver already asked for, or the posted limit.
      styleCeilingMps = Math.min(
        Math.max(baseStyleMps, observed.postedLimitMps),
        SPEED_POLICY_LIMITS.maximumCoveredSpeedMps,
      );
      // Traffic, curve, approach and signals are hard caps applied after the tempo keys.
      envelopeMps = Math.min(
        observed.stopRequired ? 0 : SPEED_POLICY_LIMITS.maximumCoveredSpeedMps,
        curveCap ?? Infinity,
        approachCap ?? Infinity,
        trafficCap ?? Infinity,
      );
      const wave = Math.sin(
        (2 * Math.PI * decisionTick) / SPEED_POLICY_LIMITS.variabilityPeriodTicks +
          variabilityPhase(seed, subject.id),
      );
      variabilityOffsetMps = values.cruise_speed_variability * wave;
      overtakeBonusMps = observed.overtaking ? values.overtake_speed_bonus : 0;
      const rawTargetMps = baseStyleMps + variabilityOffsetMps + overtakeBonusMps;
      styleTargetMps = Math.min(Math.max(0, rawTargetMps), styleCeilingMps);
      const limitedMps = Math.min(styleTargetMps, envelopeMps),
        heldMps =
          previous !== null && Math.abs(limitedMps - previous) <= deadbandMps
            ? previous
            : limitedMps;
      committedTargetMps = Math.min(Math.max(0, heldMps), envelopeMps);
      postedDeviationMps = committedTargetMps - observed.postedLimitMps;
      bindingConstraint = observed.stopRequired
        ? 'SIGNAL'
        : trafficCap !== null && limitedMps === trafficCap
          ? 'TRAFFIC'
          : approachCap !== null && limitedMps === approachCap
            ? 'APPROACH'
            : curveCap !== null && limitedMps === curveCap
              ? 'CURVE'
              : envelopeMps === SPEED_POLICY_LIMITS.maximumCoveredSpeedMps &&
                  limitedMps === envelopeMps
                ? 'MECHANICAL_CAP'
                : committedTargetMps !== limitedMps
                  ? 'DEADBAND'
                  : styleTargetMps < Math.max(0, rawTargetMps)
                    ? 'STYLE_CEILING'
                    : 'NONE';
    }
    const speed = Math.max(0, observed.longitudinalSpeedMps),
      error = committedTargetMps - speed,
      throttleRequest: SpeedPolicyCommand['throttleRequest'] =
        committedTargetMps <= 0 && speed <= deadbandMps
          ? 'STOP'
          : error > deadbandMps
            ? 'ACCELERATE'
            : error < -deadbandMps
              ? 'BRAKE'
              : 'HOLD';
    return Object.freeze({
      ...scope,
      version: SPEED_POLICY_LIMITS.version,
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      seed,
      reason,
      roadKind: observed.roadKind,
      baseStyleMps,
      arterialDeltaMps,
      variabilityOffsetMps,
      overtakeBonusMps,
      styleTargetMps,
      styleCeilingMps,
      envelopeMps,
      deadbandMps,
      committedTargetMps,
      postedDeviationMps,
      throttleRequest,
      bindingConstraint,
    });
  } finally {
    evaluating = false;
  }
}
