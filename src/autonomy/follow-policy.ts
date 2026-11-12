import { boolean, choice, fields, number, requireContract, tick } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { captureLongitudinalProfileData } from './longitudinal-control';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

/**
 * 171 following policy: cut-in response, closing time-to-contact, leader adoption and hysteresis.
 *
 * The layer never reconstructs following: it admits the genuine `048-following-v1` result and only
 * shapes the target 048 already asked for. Each key owns one distinct episode, so the four episodes
 * are separate scenarios and the keys never share a channel:
 *
 * 1. `cutin_brake_response` (ratio) — a cut-in tick (`cutIn`) moves the committed target towards the
 *    delivered following target by that fraction. The blend only ever reduces, so the response is
 *    the intensity of the reaction; the safe target itself is the 048 preference.
 * 2. `closing_ttc_threshold` (s) — while the ego closes on the leader, the committed target is capped
 *    at `leaderSpeed + (gap − 5 m) / threshold`, i.e. the remaining margin lasts at least the
 *    threshold. A larger threshold means a smaller, gentler closing speed.
 * 3. `leader_change_delay` (s) — a new leader without a cut-in (the previous leader left the lane)
 *    is adopted after `ceil(delay · 60)` ticks when that means accelerating; every reduction is
 *    adopted on the spot, so safety is never delayed.
 * 4. `following_hysteresis` (m) — while the gap stays within that tolerance of the desired gap, the
 *    previous committed target is held, so the command does not oscillate.
 *
 * Safety stays with the delivered layers: a stop request or a lead inside the 5 m floor commands
 * 0 m/s whatever the keys say, the time-to-contact cap is applied after every style decision, and
 * the committed target never exceeds the 30 m/s coverage of 046/048. The state (leader identity,
 * committed target, pending adoption ticks) belongs to the caller and is returned for the next tick.
 */
export const FOLLOW_POLICY_KEYS = Object.freeze([
  'cutin_brake_response',
  'closing_ttc_threshold',
  'leader_change_delay',
  'following_hysteresis',
] as const);
export type FollowPolicyKey = (typeof FOLLOW_POLICY_KEYS)[number];
export const FOLLOW_POLICY_LIMITS = Object.freeze({
  version: '171-follow-policy-v1' as const,
  observationVersion: '171-observation-v1' as const,
  idCodeUnits: 256,
  tickHz: 60,
  /** The delivered 046/048 targets cover speeds up to 30 m/s. */
  maximumCoveredSpeedMps: 30,
  /** Bounded admission for an observed gap. */
  maximumCoveredGapM: 100000,
  /** Same hard traffic floor as the 167 tempo layer and the 169 accel layer. */
  minimumLeadGapM: 5,
  /** `leader_change_delay` is catalog-bounded at 2 s, i.e. 120 ticks at 60 Hz. */
  maximumLeaderChangeTicks: 120,
  retainedHistory: 0,
});
export interface FollowPolicyProfile {
  readonly version: '171-follow-policy-v1';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<FollowPolicyKey, number>>;
  readonly units: Readonly<Record<FollowPolicyKey, ParameterUnit>>;
  readonly provenance: Readonly<Record<FollowPolicyKey, string>>;
}
export interface FollowPolicyObservation extends BehaviorScope {
  readonly version: '171-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly longitudinalSpeedMps: number;
  /** Observed leader facts; all four are null when the lane ahead is free. */
  readonly leaderId: string | null;
  readonly leaderIncarnation: number | null;
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  /** The world reports that another vehicle just entered the lane ahead of the subject. */
  readonly cutIn: boolean;
  readonly stopRequired: boolean;
}
/** Caller-owned state: the last leader and commitment, fed back on the next tick. */
export interface FollowPolicyState {
  readonly leaderId: string | null;
  readonly leaderIncarnation: number | null;
  readonly committedTargetMps: number | null;
  /** Remaining ticks of a pending leader adoption; zero when no adoption is pending. */
  readonly leaderHoldTicks: number;
}
export interface FollowPolicyInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly profile: FollowPolicyProfile | null;
  /** The genuine 048 result for this tick; never rebuilt from separate fields. */
  readonly following: unknown;
  readonly observation: FollowPolicyObservation;
  readonly previous: FollowPolicyState;
}
export type FollowPolicyEpisode = 'NONE' | 'CUT_IN' | 'LEADER_CHANGE' | 'TTC' | 'HYSTERESIS';
export type FollowPolicyBinding =
  | 'NONE'
  | 'FOLLOWING_TARGET'
  | 'CUT_IN_BLEND'
  | 'LEADER_DELAY'
  | 'TTC_CAP'
  | 'HYSTERESIS'
  | 'CONTACT_FLOOR'
  | 'STOP_REQUIRED';
export interface FollowPolicyCommand extends BehaviorScope {
  readonly version: '171-follow-policy-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: string;
  /** The 048 diagnostic, forwarded unchanged. */
  readonly followingReason: string;
  readonly episode: FollowPolicyEpisode;
  readonly bindingConstraint: FollowPolicyBinding;
  /** The 048 preference before the 171 layer, in m/s. */
  readonly requestedTargetMps: number;
  readonly committedTargetMps: number;
  readonly gapM: number | null;
  readonly desiredGapM: number | null;
  readonly closingSpeedMps: number;
  readonly timeToContactS: number | null;
  readonly ttcCapMps: number | null;
  readonly cutInFactor: number;
  readonly hysteresisHeld: boolean;
  /** True when no leader adoption is still pending. */
  readonly leaderAdopted: boolean;
  readonly leaderHoldTicks: number;
  readonly state: FollowPolicyState;
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
  'leaderId',
  'leaderIncarnation',
  'leadGapM',
  'leadSpeedMps',
  'cutIn',
  'stopRequired',
] as const;
const stateFields = [
  'leaderId',
  'leaderIncarnation',
  'committedTargetMps',
  'leaderHoldTicks',
] as const;
const inputFields = [
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'authority',
  'profile',
  'following',
  'observation',
  'previous',
] as const;
/** The delivered 048 result shape, re-admitted here exactly as 048 produced it. */
const followingFields = [
  'version',
  'target',
  'reason',
  'leader',
  'gapM',
  'desiredGapM',
  'preferredFollowingMps',
] as const;
/** The delivered 046 result carried inside 048, re-admitted exactly as 167 admits it. */
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
const leaderFields = ['id', 'incarnation'] as const;
const followingReasons = ['FOLLOWING_GAP', 'QUEUE_GAP'] as const;
function id(value: unknown, maximum: number = FOLLOW_POLICY_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid follow policy identity',
  );
  return value;
}
function actor(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: id(data.id), incarnation: tick(data.incarnation) });
}
function optionalId(value: unknown): string | null {
  return value === null ? null : id(value);
}
function sameScope(a: BehaviorScope, b: BehaviorScope): boolean {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
function sameActor(a: BehaviorActor, b: BehaviorActor): boolean {
  return a.id === b.id && a.incarnation === b.incarnation;
}
export function compileFollowPolicyProfile(input: unknown): FollowPolicyProfile {
  requireContract(!compiling, 'Reentrant follow policy profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<FollowPolicyKey, number>,
      units = {} as Record<FollowPolicyKey, ParameterUnit>,
      provenance = {} as Record<FollowPolicyKey, string>;
    for (const key of FOLLOW_POLICY_KEYS) {
      requireContract(Object.hasOwn(published.parameters, key), 'Missing follow policy parameter');
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    const result: FollowPolicyProfile = Object.freeze({
      version: FOLLOW_POLICY_LIMITS.version,
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
interface AdmittedObservation extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly longitudinalSpeedMps: number;
  readonly leaderId: string | null;
  readonly leaderIncarnation: number | null;
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  readonly cutIn: boolean;
  readonly stopRequired: boolean;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields);
  requireContract(
    data.version === FOLLOW_POLICY_LIMITS.observationVersion && data.units === 'SI',
    'Invalid follow policy observation version/units',
  );
  const leaderId = optionalId(data.leaderId),
    leaderIncarnation = data.leaderIncarnation === null ? null : tick(data.leaderIncarnation),
    leadGapM =
      data.leadGapM === null
        ? null
        : number(data.leadGapM, 0, FOLLOW_POLICY_LIMITS.maximumCoveredGapM),
    leadSpeedMps = data.leadSpeedMps === null ? null : number(data.leadSpeedMps, 0, 100),
    result: AdmittedObservation = Object.freeze({
      sessionId: id(data.sessionId),
      worldEpoch: tick(data.worldEpoch),
      actor: actor(data.actor),
      tick: tick(data.tick),
      longitudinalSpeedMps: number(data.longitudinalSpeedMps, -1000, 1000),
      leaderId,
      leaderIncarnation,
      leadGapM,
      leadSpeedMps,
      cutIn: boolean(data.cutIn),
      stopRequired: boolean(data.stopRequired),
    });
  requireContract(
    (leaderId === null) === (leaderIncarnation === null) &&
      (leaderId === null) === (leadGapM === null) &&
      (leaderId === null) === (leadSpeedMps === null),
    'Incomplete follow policy leader facts',
  );
  return result;
}
function policyState(value: unknown): FollowPolicyState {
  const data = fields(value, stateFields),
    leaderId = optionalId(data.leaderId),
    leaderIncarnation = data.leaderIncarnation === null ? null : tick(data.leaderIncarnation),
    committedTargetMps =
      data.committedTargetMps === null
        ? null
        : number(data.committedTargetMps, 0, FOLLOW_POLICY_LIMITS.maximumCoveredSpeedMps),
    leaderHoldTicks = tick(data.leaderHoldTicks);
  requireContract(
    (leaderId === null) === (leaderIncarnation === null),
    'Incomplete follow policy leader state',
  );
  requireContract(
    leaderHoldTicks <= FOLLOW_POLICY_LIMITS.maximumLeaderChangeTicks,
    'Follow policy leader hold exceeds its bound',
  );
  return Object.freeze({ leaderId, leaderIncarnation, committedTargetMps, leaderHoldTicks });
}
interface AdmittedTarget extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly engineVersion: string | null;
  readonly reason: string;
  readonly targetMps: number;
}
function target(value: unknown): AdmittedTarget {
  const data = fields(value, targetFields);
  requireContract(
    data.version === '046-cruise-v1' &&
      data.mechanicalVersion === '031-coverage-046-v1' &&
      data.mechanicalCoverageCapMps === 30,
    'Unknown follow policy target version',
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
    targetMps: number(data.targetMps, 0, FOLLOW_POLICY_LIMITS.maximumCoveredSpeedMps),
  });
}
interface AdmittedFollowing extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly reason: string;
  readonly target: AdmittedTarget;
  readonly leader: BehaviorActor | null;
  readonly gapM: number | null;
  readonly desiredGapM: number | null;
}
function followingResult(value: unknown): AdmittedFollowing {
  const data = fields(value, followingFields);
  requireContract(data.version === '048-following-v1', 'Unknown follow policy following version');
  const targetValue = target(data.target),
    leader =
      data.leader === null
        ? null
        : (() => {
            const raw = fields(data.leader, leaderFields);
            return Object.freeze({ id: id(raw.id), incarnation: tick(raw.incarnation) });
          })(),
    gapM =
      data.gapM === null ? null : number(data.gapM, 0, FOLLOW_POLICY_LIMITS.maximumCoveredGapM),
    desiredGapM =
      data.desiredGapM === null
        ? null
        : number(data.desiredGapM, 0, FOLLOW_POLICY_LIMITS.maximumCoveredGapM);
  if (data.preferredFollowingMps !== null) number(data.preferredFollowingMps, 0, 1000);
  requireContract((leader === null) === (gapM === null), 'Incomplete follow policy following gap');
  requireContract(
    (desiredGapM === null) === (leader === null),
    'Incomplete follow policy desired gap',
  );
  return Object.freeze({
    sessionId: targetValue.sessionId,
    worldEpoch: targetValue.worldEpoch,
    actor: targetValue.actor,
    decisionTick: targetValue.decisionTick,
    reason: id(data.reason),
    target: targetValue,
    leader,
    gapM,
    desiredGapM,
  });
}
/** The 048 leader admission and the 171 observation must describe the same vehicle and gap. */
function leaderFactsMatch(following: AdmittedFollowing, observed: AdmittedObservation): boolean {
  if (observed.leaderId === null)
    return following.leader === null && following.gapM === null && observed.leadGapM === null;
  return (
    following.leader !== null &&
    following.leader.id === observed.leaderId &&
    following.leader.incarnation === observed.leaderIncarnation &&
    following.gapM === observed.leadGapM &&
    observed.leadGapM !== null
  );
}
/** Stateless policy layer; the caller owns the leader/commitment state and feeds it back. */
export function evaluateFollowPolicy(input: FollowPolicyInput): FollowPolicyCommand {
  requireContract(!evaluating, 'Reentrant follow policy evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      world = { sessionId: id(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING']);
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Follow policy profile token provenance',
    );
    const profile = data.profile as FollowPolicyProfile | null,
      observed = observation(data.observation),
      following = followingResult(data.following),
      previous = policyState(data.previous),
      usable = (followingReasons as readonly string[]).includes(following.reason);
    let reason = 'FOLLOW_POLICY';
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(world, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    else if (
      !sameScope(world, following) ||
      !sameActor(subject, following.actor) ||
      following.decisionTick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_FOLLOWING';
    else if (
      following.target.profileVersionId !== profile.versionId ||
      following.target.engineVersion !== profile.engineVersion
    )
      reason = 'FOLLOWING_PROFILE_MISMATCH';
    else if (!leaderFactsMatch(following, observed)) reason = 'FOLLOWING_OBSERVATION_MISMATCH';
    else if (usable && following.leader === null) reason = 'FOLLOWING_OBSERVATION_MISMATCH';
    if (reason === 'FOLLOW_POLICY' && !usable) reason = 'FOLLOWING_NOT_ACTIVE';
    const requestedTargetMps = following.target.targetMps,
      gapM = observed.leadGapM,
      desiredGapM = following.desiredGapM;
    let committedTargetMps = 0,
      episode: FollowPolicyEpisode = 'NONE',
      bindingConstraint: FollowPolicyBinding = 'NONE',
      closingSpeedMps = 0,
      timeToContactS: number | null = null,
      ttcCapMps: number | null = null,
      cutInFactor = 1,
      hysteresisHeld = false,
      leaderHoldTicks = 0,
      state: FollowPolicyState = previous;
    if (reason === 'FOLLOW_POLICY') {
      const values = profile!.values,
        egoSpeed = Math.max(0, observed.longitudinalSpeedMps),
        leadSpeed = observed.leadSpeedMps!,
        gap = observed.leadGapM!,
        floorApplied = observed.stopRequired || gap <= FOLLOW_POLICY_LIMITS.minimumLeadGapM;
      closingSpeedMps = Math.max(0, egoSpeed - leadSpeed);
      timeToContactS = closingSpeedMps > 0 ? gap / closingSpeedMps : null;
      ttcCapMps =
        closingSpeedMps > 0 && gap > FOLLOW_POLICY_LIMITS.minimumLeadGapM
          ? leadSpeed + (gap - FOLLOW_POLICY_LIMITS.minimumLeadGapM) / values.closing_ttc_threshold
          : null;
      const safeTargetMps = Math.min(requestedTargetMps, floorApplied ? 0 : Infinity),
        holdTicks = Math.ceil(values.leader_change_delay * FOLLOW_POLICY_LIMITS.tickHz),
        leaderChanged =
          previous.leaderId !== observed.leaderId ||
          previous.leaderIncarnation !== observed.leaderIncarnation;
      let value = requestedTargetMps;
      bindingConstraint = 'FOLLOWING_TARGET';
      if (observed.cutIn) {
        // A cut-in is adopted immediately: only the size of the reduction is the response key.
        episode = 'CUT_IN';
        if (previous.committedTargetMps !== null && safeTargetMps < previous.committedTargetMps) {
          cutInFactor = values.cutin_brake_response;
          value =
            previous.committedTargetMps -
            cutInFactor * (previous.committedTargetMps - safeTargetMps);
          bindingConstraint = 'CUT_IN_BLEND';
        } else {
          value = safeTargetMps;
        }
      } else if (previous.leaderHoldTicks > 0) {
        // The countdown continues until the new leader is adopted; a reduction is never delayed.
        episode = 'LEADER_CHANGE';
        if (
          previous.committedTargetMps !== null &&
          requestedTargetMps < previous.committedTargetMps
        )
          value = requestedTargetMps;
        else {
          value = previous.committedTargetMps ?? requestedTargetMps;
          leaderHoldTicks = previous.leaderHoldTicks - 1;
          bindingConstraint = 'LEADER_DELAY';
        }
      } else if (leaderChanged) {
        episode = 'LEADER_CHANGE';
        // Adopting a farther/faster leader would accelerate; that is the only delayed action.
        if (
          previous.committedTargetMps !== null &&
          requestedTargetMps > previous.committedTargetMps &&
          holdTicks > 0
        ) {
          value = previous.committedTargetMps;
          leaderHoldTicks = holdTicks - 1;
          bindingConstraint = 'LEADER_DELAY';
        }
      } else if (
        previous.committedTargetMps !== null &&
        desiredGapM !== null &&
        Math.abs(gap - desiredGapM) < values.following_hysteresis
      ) {
        // Inside the tolerance band the previous commitment stands; the caps below still apply.
        episode = 'HYSTERESIS';
        value = previous.committedTargetMps;
        hysteresisHeld = true;
        bindingConstraint = 'HYSTERESIS';
      }
      if (ttcCapMps !== null && value > ttcCapMps) {
        value = ttcCapMps;
        bindingConstraint = 'TTC_CAP';
        if (episode === 'NONE') episode = 'TTC';
      }
      if (floorApplied) {
        value = 0;
        bindingConstraint = observed.stopRequired ? 'STOP_REQUIRED' : 'CONTACT_FLOOR';
      }
      committedTargetMps = Math.min(
        Math.max(0, value),
        FOLLOW_POLICY_LIMITS.maximumCoveredSpeedMps,
      );
      state = Object.freeze({
        leaderId: observed.leaderId,
        leaderIncarnation: observed.leaderIncarnation,
        committedTargetMps,
        leaderHoldTicks,
      });
    } else if (reason === 'FOLLOWING_NOT_ACTIVE') {
      // 048 decided the whole target (free road, stop, refusal); 171 forwards it without keys.
      committedTargetMps = Math.min(
        requestedTargetMps,
        FOLLOW_POLICY_LIMITS.maximumCoveredSpeedMps,
      );
      bindingConstraint = 'FOLLOWING_TARGET';
      state = Object.freeze({
        leaderId: observed.leaderId,
        leaderIncarnation: observed.leaderIncarnation,
        committedTargetMps,
        leaderHoldTicks: 0,
      });
    }
    return Object.freeze({
      ...world,
      version: FOLLOW_POLICY_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      followingReason: following.reason,
      episode,
      bindingConstraint,
      requestedTargetMps,
      committedTargetMps,
      gapM,
      desiredGapM,
      closingSpeedMps,
      timeToContactS,
      ttcCapMps,
      cutInFactor,
      hysteresisHeld,
      leaderAdopted: state.leaderHoldTicks === 0,
      leaderHoldTicks: state.leaderHoldTicks,
      state,
    });
  } finally {
    evaluating = false;
  }
}
