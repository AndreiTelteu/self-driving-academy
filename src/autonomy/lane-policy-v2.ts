import {
  choice,
  deriveOpportunitySeed,
  fields,
  number,
  randomUnit,
  requireContract,
  tick,
} from '../sessions';
import { parsePublishableDrivingProfile, validateParameterValue } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { captureLongitudinalProfileData } from './longitudinal-control';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

/**
 * 177 lane policy: manoeuvre duration, signalling lead, indicator use and the right-side pass.
 *
 * The layer never rebuilds the lane-change decision: it admits the genuine `053-lane-change-v1`
 * result of the tick and only shapes the four R keys. The four delivered 053 M keys stay the style
 * and the limits: `lane_change_front_gap`/`lane_change_back_gap`/`lane_change_speed_gain` decide
 * whether the change is validated and `lane_change_cooldown` decides when the next one is allowed.
 *
 * 1. `lane_change_duration` (s) — the duration of the lateral movement. The manoeuvre advances a
 *    normalized lateral progress `elapsed / ceil(max(key, 1 s) · 60)` and never teleports: an
 *    explicit policy floor of one second (60 ticks) keeps every manoeuvre non-instantaneous, even
 *    at the catalog minimum of 0.5 s.
 * 2. `signal_lead_time` (s) — the interval between a validated change and the start of the lateral
 *    movement when the indicator is used. While the interval runs the layer reports `SIGNAL_ONLY`
 *    with zero lateral progress and refuses to start from a 053 continuity result
 *    (`SIGNAL_LEAD_STALE`), so a delayed manoeuvre can never ride on stale gaps: every lead tick is
 *    a fresh 053 validation.
 * 3. `signal_use_probability` (probability) — one deterministic sample per identified opportunity
 *    (`deriveOpportunitySeed(seed, opportunityKey)` with the fixed key `signal-use`) decides whether
 *    the indicator is switched on for the manoeuvre. Without the indicator there is no lead, so the
 *    manoeuvre starts on the validated tick.
 * 4. `pass_on_right_probability` (probability) — only an optional overtake into a RIGHT neighbour is
 *    a right-side pass. It is subordinate to the world's safety declaration: the map must permit it
 *    (`PERMITTED`, an `UNKNOWN` is refused), the declared clear space in the right lane must cover
 *    the M `lane_change_front_gap`, and only then is one deterministic sample per opportunity
 *    (`pass-on-right`) compared with the key. A forbidden, undeclared or too-tight right lane is
 *    refused for every key value, and the sample is never taken.
 *
 * Safety stays dominant: a 053 `NO_CHANGE` is forwarded and cancels any waiting manoeuvre, a 053
 * `UNKNOWN` is forwarded as `UNKNOWN`, a target that the authored adjacency no longer exposes is
 * abandoned rather than continued, and the layer keeps no history (`retainedHistory: 0`). The state
 * (target lane, indicator tick, indicator used and manoeuvre start tick) is the caller's and is
 * returned for the next tick.
 */
export const LANE_POLICY_V2_KEYS = Object.freeze([
  'lane_change_duration',
  'signal_lead_time',
  'signal_use_probability',
  'pass_on_right_probability',
] as const);
export type LanePolicyV2Key = (typeof LANE_POLICY_V2_KEYS)[number];
/** The delivered 053 M keys the layer reads without changing their meaning. */
export const LANE_POLICY_V2_M_KEYS = Object.freeze([
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
] as const);
export type LanePolicyV2MKey = (typeof LANE_POLICY_V2_M_KEYS)[number];
export const LANE_POLICY_V2_LIMITS = Object.freeze({
  version: '177-lane-policy-v2' as const,
  observationVersion: '177-lane-observation-v1' as const,
  laneChangeVersion: '053-lane-change-v1' as const,
  idCodeUnits: 256,
  profileCodeUnits: 128,
  opportunityKeyCodeUnits: 8192,
  tickHz: 60,
  neighbors: 2,
  maximumGapM: 10000,
  maximumTimeS: 3600,
  /**
   * Explicit safety floor of `lane_change_duration`: a lane cannot be changed in 0 s, so the
   * manoeuvre always lasts at least one second (60 ticks), even when the catalog minimum of 0.5 s
   * is requested. The floor is a documented policy constant, not a catalog key.
   */
  minimumManoeuvreDurationS: 1,
  retainedHistory: 0,
});
export interface LanePolicyV2Profile {
  readonly version: '177-lane-policy-v2';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<LanePolicyV2Key, number>>;
  readonly units: Readonly<Record<LanePolicyV2Key, ParameterUnit>>;
  readonly provenance: Readonly<Record<LanePolicyV2Key, string>>;
  readonly mValues: Readonly<Record<LanePolicyV2MKey, number>>;
  readonly mUnits: Readonly<Record<LanePolicyV2MKey, ParameterUnit>>;
}
/** Authored lateral neighbour of the current lane, projected by the 033 graph owner. */
export interface LanePolicyV2AdjacentLane {
  readonly laneId: string;
  readonly side: 'LEFT' | 'RIGHT';
}
export interface LanePolicyV2Observation extends BehaviorScope {
  readonly version: '177-lane-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly currentLaneId: string;
  /** At most two authored lateral neighbours; the target of 053 must appear here. */
  readonly adjacentLanes: readonly LanePolicyV2AdjacentLane[];
  /** The world declares this validated change is an overtaking manoeuvre. */
  readonly overtake: boolean;
  /** Whether the map permits passing on the right here; only PERMITTED unlocks the key. */
  readonly rightOvertake: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN';
  /** Clear space ahead in the right lane; null when the world cannot declare it. */
  readonly rightLaneSpaceM: number | null;
}
/** Caller-held latch. Carrying it forward is what gives a signalled manoeuvre continuity. */
export interface LanePolicyV2State {
  readonly targetLaneId: string | null;
  /** Tick the indicator was switched on; null when the manoeuvre is not signalled. */
  readonly signalTick: number | null;
  readonly signalUsed: boolean;
  /** Tick the lateral movement actually began; null while the lead interval still runs. */
  readonly manoeuvreStartTick: number | null;
}
export const LANE_POLICY_V2_EMPTY_STATE: LanePolicyV2State = Object.freeze({
  targetLaneId: null,
  signalTick: null,
  signalUsed: false,
  manoeuvreStartTick: null,
});
export interface LanePolicyV2Input extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  /** uint32 vehicle seed from the 006 addressing; the opportunity seed derives from it. */
  readonly seed: number;
  /** Stable opportunity identity of this lane change; addresses the once-per-opportunity samples. */
  readonly opportunityKey: string;
  readonly profile: LanePolicyV2Profile | null;
  /** The genuine 053 result for this tick, or null when no lane-change evidence exists. */
  readonly laneChange: unknown;
  readonly observation: LanePolicyV2Observation;
  readonly state: LanePolicyV2State;
}
export type LanePolicyV2Action = 'LANE_CHANGE' | 'SIGNAL_ONLY' | 'NO_CHANGE' | 'UNKNOWN';
export type LanePolicyV2LaneChangeAction = 'CHANGE' | 'NO_CHANGE' | 'UNKNOWN';
export type LanePolicyV2Reason =
  | 'LANE_POLICY_V2'
  | 'NO_AUTO_AUTHORITY'
  | 'MISSING_PROFILE'
  | 'FOREIGN_OR_STALE_OBSERVATION'
  | 'FOREIGN_OR_STALE_LANE_CHANGE'
  | 'LANE_CHANGE_UNAVAILABLE'
  | 'LANE_CHANGE_PROFILE_MISMATCH'
  | 'LANE_CHANGE_M_PROFILE_MISMATCH'
  | 'NO_LANE_CHANGE'
  | 'TARGET_LANE_NOT_ADJACENT'
  | 'TARGET_LANE_MISMATCH'
  | 'RIGHT_OVERTAKE_FORBIDDEN'
  | 'RIGHT_OVERTAKE_NO_SPACE'
  | 'RIGHT_OVERTAKE_REFUSED'
  | 'CHANGE_WITHOUT_SIGNAL'
  | 'SIGNAL_IMMEDIATE'
  | 'SIGNAL_LEAD'
  | 'SIGNAL_LEAD_STALE'
  | 'SIGNAL_LEAD_COMPLETE'
  | 'SIGNAL_CANCELLED'
  | 'MANOEUVRE_IN_PROGRESS'
  | 'MANOEUVRE_COMPLETE'
  | 'MANOEUVRE_ABANDONED';
export interface LanePolicyV2Command extends BehaviorScope {
  readonly version: '177-lane-policy-v2';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: LanePolicyV2Reason;
  /** The 053 diagnostic, forwarded unchanged. */
  readonly laneChangeReason: string | null;
  readonly laneChangeAction: LanePolicyV2LaneChangeAction | null;
  readonly action: LanePolicyV2Action;
  readonly targetLaneId: string | null;
  readonly targetSide: 'LEFT' | 'RIGHT' | null;
  /** Effective duration after the non-instantaneous floor, in ticks. */
  readonly manoeuvreDurationTicks: number | null;
  readonly manoeuvreElapsedTicks: number | null;
  readonly manoeuvreRemainingTicks: number | null;
  /** Normalized lateral progress in [0, 1]; 0 while the lead interval still runs. */
  readonly lateralProgress: number | null;
  readonly signalUsed: boolean;
  readonly indicator: 'NONE' | 'LEFT' | 'RIGHT';
  /** Effective `signal_lead_time` in ticks; only a signalled manoeuvre waits for it. */
  readonly signalLeadTicks: number | null;
  readonly signalStartTick: number | null;
  readonly signalRemainingTicks: number | null;
  readonly manoeuvreStartTick: number | null;
  /** True only for an optional overtake into a RIGHT neighbour. */
  readonly rightOvertakeRequested: boolean;
  /** The map declaration: only a PERMITTED right pass unlocks the key. */
  readonly rightOvertakePermitted: boolean | null;
  readonly rightLaneSpaceM: number | null;
  /** Space required by the M `lane_change_front_gap`. */
  readonly requiredRightSpaceM: number | null;
  readonly rightOvertakeProbability: number | null;
  readonly rightOvertakeSample: number | null;
  readonly rightOvertakeGranted: boolean | null;
  /** The latch the caller must carry into the next decision. */
  readonly state: LanePolicyV2State;
  readonly retainedHistory: 0;
}
let compiling = false;
let evaluating = false;
export function getLanePolicyV2Stats() {
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
  'currentLaneId',
  'adjacentLanes',
  'overtake',
  'rightOvertake',
  'rightLaneSpaceM',
] as const;
const laneChangeFields = [
  'version',
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'profileVersionId',
  'action',
  'reason',
  'targetLaneId',
  'frontGapM',
  'backGapM',
  'speedAdvantageMps',
  'requiredFrontGapM',
  'requiredBackGapM',
  'requiredSpeedGainMps',
  'cooldownTicks',
  'cooldownRemainingTicks',
  'state',
  'retainedHistory',
] as const;
const inputFields = [
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'authority',
  'seed',
  'opportunityKey',
  'profile',
  'laneChange',
  'observation',
  'state',
] as const;
const stateFields = ['targetLaneId', 'signalTick', 'signalUsed', 'manoeuvreStartTick'] as const;
function identity(value: unknown, maximum: number = LANE_POLICY_V2_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid lane policy v2 identity',
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
    'Invalid lane policy v2 seed',
  );
  return value;
}
export function compileLanePolicyProfile(input: unknown): LanePolicyV2Profile {
  requireContract(!compiling, 'Reentrant lane policy v2 profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<LanePolicyV2Key, number>,
      units = {} as Record<LanePolicyV2Key, ParameterUnit>,
      provenance = {} as Record<LanePolicyV2Key, string>,
      mValues = {} as Record<LanePolicyV2MKey, number>,
      mUnits = {} as Record<LanePolicyV2MKey, ParameterUnit>;
    for (const key of LANE_POLICY_V2_KEYS) {
      requireContract(Object.hasOwn(published.parameters, key), 'Missing lane policy v2 parameter');
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    for (const key of LANE_POLICY_V2_M_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing lane policy v2 M parameter',
      );
      mValues[key] = published.parameters[key];
      mUnits[key] = published.unitsByParameter[key];
    }
    const result: LanePolicyV2Profile = Object.freeze({
      version: LANE_POLICY_V2_LIMITS.version,
      profileId: identity(published.profileId),
      versionId: identity(published.versionId, LANE_POLICY_V2_LIMITS.profileCodeUnits),
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
  readonly currentLaneId: string;
  readonly adjacentLanes: readonly LanePolicyV2AdjacentLane[];
  readonly overtake: boolean;
  readonly rightOvertake: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN';
  readonly rightLaneSpaceM: number | null;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields);
  requireContract(
    data.version === LANE_POLICY_V2_LIMITS.observationVersion && data.units === 'SI',
    'Invalid lane policy v2 observation version/units',
  );
  requireContract(typeof data.overtake === 'boolean', 'Invalid lane policy v2 overtake flag');
  requireContract(
    Array.isArray(data.adjacentLanes) &&
      data.adjacentLanes.length <= LANE_POLICY_V2_LIMITS.neighbors,
    'Lane policy v2 adjacency capacity',
  );
  const adjacentLanes: LanePolicyV2AdjacentLane[] = [],
    seen = new Set<string>();
  for (const raw of data.adjacentLanes as unknown[]) {
    const neighbor = fields(raw, ['laneId', 'side']),
      laneId = identity(neighbor.laneId);
    requireContract(!seen.has(laneId), 'Duplicate lane policy v2 neighbour');
    seen.add(laneId);
    adjacentLanes.push(
      Object.freeze({ laneId, side: choice(neighbor.side, ['LEFT', 'RIGHT'] as const) }),
    );
  }
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    tick: tick(data.tick),
    currentLaneId: identity(data.currentLaneId),
    adjacentLanes: Object.freeze(adjacentLanes),
    overtake: data.overtake,
    rightOvertake: choice(data.rightOvertake, ['PERMITTED', 'FORBIDDEN', 'UNKNOWN'] as const),
    rightLaneSpaceM:
      data.rightLaneSpaceM === null
        ? null
        : number(data.rightLaneSpaceM, 0, LANE_POLICY_V2_LIMITS.maximumGapM),
  });
}
interface AdmittedLaneChange extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly action: LanePolicyV2LaneChangeAction;
  readonly reason: string;
  readonly targetLaneId: string | null;
  readonly requiredFrontGapM: number | null;
  readonly requiredBackGapM: number | null;
  readonly requiredSpeedGainMps: number | null;
}
function laneChangeState(value: unknown): void {
  const data = fields(value, ['committed', 'lastChangeTick']);
  if (data.committed !== null) {
    const committed = fields(data.committed, ['targetLaneId', 'startedTick']);
    identity(committed.targetLaneId);
    tick(committed.startedTick);
  }
  if (data.lastChangeTick !== null) tick(data.lastChangeTick);
}
/** The delivered 053 result shape, re-admitted exactly as 053 produced it. */
function laneChangeDecision(value: unknown): AdmittedLaneChange {
  const data = fields(value, laneChangeFields);
  requireContract(
    data.version === LANE_POLICY_V2_LIMITS.laneChangeVersion,
    'Unknown lane policy v2 lane-change version',
  );
  requireContract(data.retainedHistory === 0, 'Lane policy v2 lane-change history must stay zero');
  laneChangeState(data.state);
  const optionalParameter = (key: string, value: unknown, unit: unknown): number | null =>
    value === null ? null : validateParameterValue(key, value, unit);
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    decisionTick: tick(data.decisionTick),
    profileVersionId:
      data.profileVersionId === null
        ? null
        : identity(data.profileVersionId, LANE_POLICY_V2_LIMITS.profileCodeUnits),
    action: choice(data.action, ['CHANGE', 'NO_CHANGE', 'UNKNOWN'] as const),
    reason: identity(data.reason),
    targetLaneId: data.targetLaneId === null ? null : identity(data.targetLaneId),
    requiredFrontGapM: optionalParameter('lane_change_front_gap', data.requiredFrontGapM, 'm'),
    requiredBackGapM: optionalParameter('lane_change_back_gap', data.requiredBackGapM, 'm'),
    requiredSpeedGainMps: optionalParameter(
      'lane_change_speed_gain',
      data.requiredSpeedGainMps,
      'm/s',
    ),
  });
}
function state(value: unknown): LanePolicyV2State {
  const data = fields(value, stateFields),
    signalUsed = data.signalUsed;
  requireContract(typeof signalUsed === 'boolean', 'Invalid lane policy v2 signal flag');
  return Object.freeze({
    targetLaneId: data.targetLaneId === null ? null : identity(data.targetLaneId),
    signalTick: data.signalTick === null ? null : tick(data.signalTick),
    signalUsed,
    manoeuvreStartTick: data.manoeuvreStartTick === null ? null : tick(data.manoeuvreStartTick),
  });
}
function carriedStateIsSane(carried: LanePolicyV2State, decisionTick: number): boolean {
  const consistent =
    carried.targetLaneId === null
      ? carried.signalTick === null && !carried.signalUsed && carried.manoeuvreStartTick === null
      : carried.signalUsed
        ? carried.signalTick !== null
        : carried.signalTick === null && carried.manoeuvreStartTick !== null;
  return (
    consistent &&
    (carried.signalTick === null || carried.signalTick <= decisionTick) &&
    (carried.manoeuvreStartTick === null || carried.manoeuvreStartTick <= decisionTick) &&
    (carried.signalTick === null ||
      carried.manoeuvreStartTick === null ||
      carried.manoeuvreStartTick >= carried.signalTick)
  );
}
/**
 * Pure 177 layer. The 053 result is admitted first and any refusal dominates; the four R keys then
 * act only in their own scenario. The safety conditions of the right-side pass precede its sample.
 */
export function evaluateLanePolicyV2(input: LanePolicyV2Input): LanePolicyV2Command {
  requireContract(!evaluating, 'Reentrant lane policy v2 evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      world = { sessionId: identity(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING'] as const),
      vehicleSeed = seed(data.seed),
      opportunityKey = identity(data.opportunityKey, LANE_POLICY_V2_LIMITS.opportunityKeyCodeUnits);
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Lane policy v2 profile token provenance',
    );
    const profile = data.profile as LanePolicyV2Profile | null,
      observed = observation(data.observation),
      change = data.laneChange === null ? null : laneChangeDecision(data.laneChange),
      carried = state(data.state);
    requireContract(
      carriedStateIsSane(carried, decisionTick),
      'Lane policy v2 state cannot contradict or start in the future',
    );
    const emptyState = Object.freeze({
        targetLaneId: null,
        signalTick: null,
        signalUsed: false,
        manoeuvreStartTick: null,
      }),
      sideOf = (laneId: string): 'LEFT' | 'RIGHT' | null =>
        observed.adjacentLanes.find((neighbor) => neighbor.laneId === laneId)?.side ?? null;
    let reason: LanePolicyV2Reason = 'LANE_POLICY_V2',
      action: LanePolicyV2Action = 'UNKNOWN',
      targetLaneId: string | null = null,
      targetSide: 'LEFT' | 'RIGHT' | null = null,
      durationTicks: number | null = null,
      elapsedTicks: number | null = null,
      remainingTicks: number | null = null,
      lateralProgress: number | null = null,
      signalUsed = false,
      indicator: 'NONE' | 'LEFT' | 'RIGHT' = 'NONE',
      leadTicks: number | null = null,
      signalStartTick: number | null = null,
      signalRemainingTicks: number | null = null,
      manoeuvreStartTick: number | null = null,
      nextState: LanePolicyV2State = carried,
      rightOvertakeRequested = false,
      rightOvertakePermitted: boolean | null = null,
      rightLaneSpaceM: number | null = null,
      requiredRightSpaceM: number | null = null,
      rightOvertakeProbability: number | null = null,
      rightOvertakeSample: number | null = null,
      rightOvertakeGranted: boolean | null = null;
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(world, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    else if (change === null) reason = 'LANE_CHANGE_UNAVAILABLE';
    else if (
      !sameScope(world, change) ||
      !sameActor(subject, change.actor) ||
      change.decisionTick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_LANE_CHANGE';
    else if (change.action === 'UNKNOWN') reason = 'LANE_CHANGE_UNAVAILABLE';
    else if (change.profileVersionId !== profile.versionId) reason = 'LANE_CHANGE_PROFILE_MISMATCH';
    else if (
      change.requiredFrontGapM !== profile.mValues.lane_change_front_gap ||
      change.requiredBackGapM !== profile.mValues.lane_change_back_gap ||
      change.requiredSpeedGainMps !== profile.mValues.lane_change_speed_gain
    )
      reason = 'LANE_CHANGE_M_PROFILE_MISMATCH';
    if (reason === 'LANE_POLICY_V2' && profile !== null && change !== null) {
      const values = profile.values,
        mValues = profile.mValues,
        durationTicksValue = Math.ceil(
          Math.max(values.lane_change_duration, LANE_POLICY_V2_LIMITS.minimumManoeuvreDurationS) *
            LANE_POLICY_V2_LIMITS.tickHz,
        ),
        leadTicksValue = Math.ceil(values.signal_lead_time * LANE_POLICY_V2_LIMITS.tickHz);
      durationTicks = durationTicksValue;
      leadTicks = leadTicksValue;
      requiredRightSpaceM = mValues.lane_change_front_gap;
      const startManoeuvre = (
        startedAtTick: number,
        lane: string,
        signalled: boolean,
        signalTick: number | null,
      ) => {
        targetLaneId = lane;
        targetSide = sideOf(lane);
        signalUsed = signalled;
        indicator = signalled ? (sideOf(lane) ?? 'NONE') : 'NONE';
        signalStartTick = signalTick;
        manoeuvreStartTick = startedAtTick;
        elapsedTicks = decisionTick - startedAtTick;
        remainingTicks = Math.max(0, durationTicksValue - elapsedTicks);
        lateralProgress = Math.min(1, elapsedTicks / durationTicksValue);
        nextState = Object.freeze({
          targetLaneId: lane,
          signalTick,
          signalUsed: signalled,
          manoeuvreStartTick: startedAtTick,
        });
      };
      if (carried.targetLaneId !== null) {
        // A carried manoeuvre owns its target lane: it continues or is abandoned, never restarted.
        if (change.targetLaneId !== carried.targetLaneId) {
          reason = 'TARGET_LANE_MISMATCH';
          action = 'NO_CHANGE';
          targetLaneId = carried.targetLaneId;
          targetSide = sideOf(carried.targetLaneId);
          nextState = emptyState;
        } else if (sideOf(carried.targetLaneId) === null) {
          reason = 'MANOEUVRE_ABANDONED';
          action = 'NO_CHANGE';
          targetLaneId = carried.targetLaneId;
          signalUsed = carried.signalUsed;
          nextState = emptyState;
        } else if (change.action !== 'CHANGE') {
          reason = carried.manoeuvreStartTick === null ? 'SIGNAL_CANCELLED' : 'MANOEUVRE_ABANDONED';
          action = 'NO_CHANGE';
          targetLaneId = carried.targetLaneId;
          targetSide = sideOf(carried.targetLaneId);
          signalUsed = carried.signalUsed;
          signalStartTick = carried.signalTick;
          const stoppedTicks =
            carried.manoeuvreStartTick === null
              ? 0
              : Math.min(decisionTick - carried.manoeuvreStartTick, durationTicksValue);
          elapsedTicks = stoppedTicks;
          remainingTicks = durationTicksValue - stoppedTicks;
          lateralProgress = stoppedTicks / durationTicksValue;
          nextState = emptyState;
        } else if (carried.manoeuvreStartTick === null) {
          // Still signalling: the lateral movement waits for the lead, on fresh validations only.
          targetLaneId = carried.targetLaneId;
          targetSide = sideOf(carried.targetLaneId);
          signalUsed = carried.signalUsed;
          indicator = carried.signalUsed ? (sideOf(carried.targetLaneId) ?? 'NONE') : 'NONE';
          signalStartTick = carried.signalTick;
          const servedTicks =
            carried.signalTick === null ? leadTicksValue : decisionTick - carried.signalTick;
          signalRemainingTicks = Math.max(0, leadTicksValue - servedTicks);
          if (servedTicks < leadTicksValue) {
            // A 053 continuity result is a latch on older gaps: the lead never starts a manoeuvre
            // from it, so the wait can only ever complete on a fresh validation.
            if (change.reason !== 'OPTIONAL_CHANGE_VALIDATED') {
              reason = 'SIGNAL_LEAD_STALE';
              action = 'SIGNAL_ONLY';
              lateralProgress = 0;
            } else {
              reason = 'SIGNAL_LEAD';
              action = 'SIGNAL_ONLY';
              lateralProgress = 0;
            }
            nextState = carried;
          } else {
            reason = 'SIGNAL_LEAD_COMPLETE';
            action = 'LANE_CHANGE';
            startManoeuvre(
              decisionTick,
              carried.targetLaneId,
              carried.signalUsed,
              carried.signalTick,
            );
          }
        } else {
          targetLaneId = carried.targetLaneId;
          targetSide = sideOf(carried.targetLaneId);
          signalUsed = carried.signalUsed;
          signalStartTick = carried.signalTick;
          const elapsed = decisionTick - carried.manoeuvreStartTick;
          if (elapsed >= durationTicksValue) {
            // The lateral movement is complete; the latch is released and the progress stays full.
            reason = 'MANOEUVRE_COMPLETE';
            action = 'NO_CHANGE';
            elapsedTicks = durationTicksValue;
            remainingTicks = 0;
            lateralProgress = 1;
            nextState = emptyState;
          } else {
            reason = 'MANOEUVRE_IN_PROGRESS';
            action = 'LANE_CHANGE';
            manoeuvreStartTick = carried.manoeuvreStartTick;
            elapsedTicks = elapsed;
            remainingTicks = durationTicksValue - elapsed;
            lateralProgress = elapsed / durationTicksValue;
            indicator = carried.signalUsed ? (sideOf(carried.targetLaneId) ?? 'NONE') : 'NONE';
            nextState = carried;
          }
        }
      } else if (change.action !== 'CHANGE' || change.targetLaneId === null) {
        // 053 refused or released the change: the layer only forwards it and starts nothing.
        reason = 'NO_LANE_CHANGE';
        action = 'NO_CHANGE';
        targetLaneId = change.targetLaneId;
        targetSide = change.targetLaneId === null ? null : sideOf(change.targetLaneId);
        nextState = emptyState;
      } else if (sideOf(change.targetLaneId) === null) {
        reason = 'TARGET_LANE_NOT_ADJACENT';
        action = 'NO_CHANGE';
        targetLaneId = change.targetLaneId;
        nextState = emptyState;
      } else {
        const side = sideOf(change.targetLaneId);
        targetLaneId = change.targetLaneId;
        targetSide = side;
        // The right-side pass is subordinate to the world: forbidden, undeclared or too-tight
        // space refuses it before any sample, whatever the key says.
        rightOvertakeRequested = side === 'RIGHT' && observed.overtake;
        let startable = true;
        if (rightOvertakeRequested) {
          rightOvertakePermitted = observed.rightOvertake === 'PERMITTED';
          rightLaneSpaceM = observed.rightLaneSpaceM;
          if (!rightOvertakePermitted) {
            reason = 'RIGHT_OVERTAKE_FORBIDDEN';
            action = 'NO_CHANGE';
            startable = false;
          } else if (rightLaneSpaceM === null || rightLaneSpaceM < mValues.lane_change_front_gap) {
            reason = 'RIGHT_OVERTAKE_NO_SPACE';
            action = 'NO_CHANGE';
            startable = false;
          } else {
            rightOvertakeProbability = values.pass_on_right_probability;
            rightOvertakeSample = randomUnit(
              deriveOpportunitySeed(vehicleSeed, opportunityKey),
              'pass-on-right',
              0,
            );
            rightOvertakeGranted = rightOvertakeSample < rightOvertakeProbability;
            if (!rightOvertakeGranted) {
              reason = 'RIGHT_OVERTAKE_REFUSED';
              action = 'NO_CHANGE';
              startable = false;
            }
          }
        }
        if (startable) {
          // One deterministic sample per opportunity decides the indicator, never per tick.
          signalUsed =
            randomUnit(deriveOpportunitySeed(vehicleSeed, opportunityKey), 'signal-use', 0) <
            values.signal_use_probability;
          indicator = signalUsed ? (side ?? 'NONE') : 'NONE';
          if (signalUsed && leadTicksValue > 0) {
            reason = 'SIGNAL_LEAD';
            action = 'SIGNAL_ONLY';
            signalStartTick = decisionTick;
            signalRemainingTicks = leadTicksValue;
            lateralProgress = 0;
            nextState = Object.freeze({
              targetLaneId: change.targetLaneId,
              signalTick: decisionTick,
              signalUsed: true,
              manoeuvreStartTick: null,
            });
          } else {
            reason = signalUsed ? 'SIGNAL_IMMEDIATE' : 'CHANGE_WITHOUT_SIGNAL';
            action = 'LANE_CHANGE';
            signalStartTick = signalUsed ? decisionTick : null;
            startManoeuvre(
              decisionTick,
              change.targetLaneId,
              signalUsed,
              signalUsed ? decisionTick : null,
            );
          }
        }
      }
    }
    return Object.freeze({
      ...world,
      version: LANE_POLICY_V2_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      laneChangeReason: change?.reason ?? null,
      laneChangeAction: change?.action ?? null,
      action,
      targetLaneId,
      targetSide,
      manoeuvreDurationTicks: durationTicks,
      manoeuvreElapsedTicks: elapsedTicks,
      manoeuvreRemainingTicks: remainingTicks,
      lateralProgress,
      signalUsed,
      indicator,
      signalLeadTicks: leadTicks,
      signalStartTick,
      signalRemainingTicks,
      manoeuvreStartTick,
      rightOvertakeRequested,
      rightOvertakePermitted,
      rightLaneSpaceM,
      requiredRightSpaceM,
      rightOvertakeProbability,
      rightOvertakeSample,
      rightOvertakeGranted,
      state: nextState,
      retainedHistory: 0,
    });
  } finally {
    evaluating = false;
  }
}
