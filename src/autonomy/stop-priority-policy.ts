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
 * 175 stop/priority policy: rolling stop, assertiveness, all-way patience and blocked entry.
 *
 * The layer never rebuilds the STOP or yield decision: it admits the genuine `051-stop-policy-v1`
 * and `052-yield-interval-v1` results of the tick and only shapes the four R keys. The delivered M
 * keys stay the style and the limits: `stop_full_probability`/`stop_dwell_time`/`stop_line_offset`
 * decide the 051 full/rolling role and the stop point, `yield_time_gap` stays the 052 threshold.
 *
 * 1. `rolling_stop_speed` (m/s) — the speed commanded through a 051 rolling stop. It is exhausted
 *    by an explicit policy cap of 2.5 m/s (`rollingStopMaximumMps`), so the catalog maximum of
 *    5 m/s can never turn a rolling stop into a crossing at speed.
 * 2. `priority_assertiveness` (ratio) — on a 052 refusal with a known separation, the requirement
 *    moves from the M `yield_time_gap` towards the documented safety floor of 3 s (the 052 native
 *    calibration value that produced no contact). A value of 0 reproduces 052 exactly, 1 claims at
 *    the floor, and a `yield_time_gap` already at or below the floor leaves the key inert, so the
 *    M consequence is preserved instead of being overwritten.
 * 3. `allway_stop_patience` (s) — after the subject's own 051 dwell is satisfied at an all-way stop
 *    where it is not the first arrival, the release is held for the remaining patience. The first
 *    arrival is never delayed and an approaching/held STOP already dominates the key.
 * 4. `blocked_intersection_entry_probability` (probability) — with no declared exit space the layer
 *    samples one deterministic entry decision per opportunity, capped at 0.5
 *    (`blockedEntryMaximumProbability`). The cap is the ceiling; the veto is absolute: a declared
 *    blocked interior or a known exit below one vehicle of storage keeps the command at STOP
 *    whatever the key says.
 *
 * Safety stays dominant: a 051 stop is never overridden, an unknown 051/052 result is forwarded as
 * UNKNOWN, the blocked-intersection veto precedes every key, and the layer only ever turns a
 * proceed into a hold, never the other way around. The result is frozen and keeps no history
 * (`retainedHistory: 0`).
 */
export const STOP_PRIORITY_POLICY_KEYS = Object.freeze([
  'rolling_stop_speed',
  'priority_assertiveness',
  'allway_stop_patience',
  'blocked_intersection_entry_probability',
] as const);
export type StopPriorityPolicyKey = (typeof STOP_PRIORITY_POLICY_KEYS)[number];
/** The delivered 051 and 052 M keys the layer reads without changing their meaning. */
export const STOP_PRIORITY_POLICY_M_KEYS = Object.freeze([
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
  'yield_time_gap',
] as const);
export type StopPriorityPolicyMKey = (typeof STOP_PRIORITY_POLICY_M_KEYS)[number];
export const STOP_PRIORITY_POLICY_LIMITS = Object.freeze({
  version: '175-stop-priority-policy-v1' as const,
  observationVersion: '175-stop-priority-observation-v1' as const,
  stopVersion: '051-stop-policy-v1' as const,
  yieldVersion: '052-yield-interval-v1' as const,
  idCodeUnits: 256,
  profileCodeUnits: 128,
  opportunityKeyCodeUnits: 8192,
  tickHz: 60,
  maximumSpeedMps: 100,
  maximumTimeS: 3600,
  maximumExitM: 1000,
  maximumPosition: 64,
  /**
   * Explicit safety cap of `rolling_stop_speed`: a rolling stop is a crawl, never a crossing at
   * speed, so the catalog maximum of 5 m/s is never commanded through the STOP area.
   */
  rollingStopMaximumMps: 2.5,
  /**
   * Explicit safety floor of `priority_assertiveness`: the 3 s threshold of the 052 native
   * calibration that produced no contact. Assertiveness can reach it but never go below it.
   */
  priorityMinimumGapS: 3,
  /** Exit storage of one vehicle plus margin: below it the intersection has no usable exit. */
  minimumExitStorageM: 5,
  /**
   * Explicit safety cap of `blocked_intersection_entry_probability`: even the catalog maximum of 1
   * enters at most half of the unconfirmed opportunities; the rest wait for exit space.
   */
  blockedEntryMaximumProbability: 0.5,
  retainedHistory: 0,
});
export interface StopPriorityPolicyProfile {
  readonly version: '175-stop-priority-policy-v1';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<StopPriorityPolicyKey, number>>;
  readonly units: Readonly<Record<StopPriorityPolicyKey, ParameterUnit>>;
  readonly provenance: Readonly<Record<StopPriorityPolicyKey, string>>;
  readonly mValues: Readonly<Record<StopPriorityPolicyMKey, number>>;
  readonly mUnits: Readonly<Record<StopPriorityPolicyMKey, ParameterUnit>>;
}
export interface StopPriorityAllWayArrival {
  /** One-based arrival position at the all-way stop; 1 is the first arrival and goes first. */
  readonly position: number;
  /** Seconds already spent waiting after the subject's own full-stop dwell was satisfied. */
  readonly sinceDwellS: number;
}
export interface StopPriorityPolicyObservation extends BehaviorScope {
  readonly version: '175-stop-priority-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly speedMps: number;
  /** True only when the subject is approaching an intersection the layer may evaluate. */
  readonly atIntersection: boolean;
  /** The world declares the intersection interior occupied: an absolute entry veto. */
  readonly intersectionBlocked: boolean;
  /** Space beyond the intersection available to clear it; null when the world cannot declare it. */
  readonly intersectionExitM: number | null;
  /** All-way stop arrival context; null when the subject is not at an all-way stop. */
  readonly allWayArrival: StopPriorityAllWayArrival | null;
}
export interface StopPriorityPolicyInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  /** uint32 vehicle seed from the 006 addressing; the opportunity seed derives from it. */
  readonly seed: number;
  /** Stable opportunity identity of this encounter; addresses the once-per-opportunity sample. */
  readonly opportunityKey: string;
  readonly profile: StopPriorityPolicyProfile | null;
  /** The genuine 051 result for this tick, or null when no STOP evidence exists. */
  readonly stopDecision: unknown;
  /** The genuine 052 result for this tick, or null when no priority evidence exists. */
  readonly yieldDecision: unknown;
  readonly observation: StopPriorityPolicyObservation;
}
export type StopPriorityPolicyAction = 'PROCEED' | 'ROLL_THROUGH' | 'STOP' | 'UNKNOWN';
export type StopPriorityStopAction =
  'NO_STOP' | 'APPROACH' | 'HOLD' | 'RELEASE' | 'ROLL_THROUGH' | 'UNKNOWN';
export type StopPriorityYieldAction = 'ACCEPT' | 'REFUSE' | 'UNKNOWN';
export type StopPriorityPolicyReason =
  | 'STOP_PRIORITY_POLICY'
  | 'NO_AUTO_AUTHORITY'
  | 'MISSING_PROFILE'
  | 'FOREIGN_OR_STALE_OBSERVATION'
  | 'FOREIGN_OR_STALE_STOP'
  | 'FOREIGN_OR_STALE_YIELD'
  | 'NO_POLICY_INPUT'
  | 'STOP_UNAVAILABLE'
  | 'STOP_PROFILE_MISMATCH'
  | 'STOP_M_PROFILE_MISMATCH'
  | 'YIELD_UNAVAILABLE'
  | 'YIELD_PROFILE_MISMATCH'
  | 'YIELD_M_PROFILE_MISMATCH'
  | 'BLOCKED_INTERSECTION_VETO'
  | 'EXIT_SPACE_INSUFFICIENT'
  | 'STOP_REQUIRED'
  | 'STOP_RELEASED'
  | 'ROLLING_STOP_AT_SPEED'
  | 'PRIORITY_CLAIMED'
  | 'PRIORITY_YIELD'
  | 'PRIORITY_GRANTED'
  | 'ALLWAY_PATIENCE'
  | 'ALLWAY_TURN'
  | 'BLOCKED_ENTRY_ACCEPTED'
  | 'BLOCKED_ENTRY_WAIT'
  | 'EXIT_SPACE_CONFIRMED'
  | 'NO_STOP';
export interface StopPriorityPolicyCommand extends BehaviorScope {
  readonly version: '175-stop-priority-policy-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: StopPriorityPolicyReason;
  /** The 051 diagnostic, forwarded unchanged. */
  readonly stopReason: string | null;
  readonly stopAction: StopPriorityStopAction | null;
  /** The 052 diagnostic, forwarded unchanged. */
  readonly yieldReason: string | null;
  readonly yieldAction: StopPriorityYieldAction | null;
  readonly action: StopPriorityPolicyAction;
  readonly stopRequested: boolean;
  /** One-based all-way arrival position, or null outside an all-way arrival. */
  readonly allWayPosition: number | null;
  readonly allWaySinceDwellS: number | null;
  /** Extra wait required by `allway_stop_patience`; 0 when the key does not hold the release. */
  readonly allWayHoldS: number | null;
  /** Speed commanded through a 051 rolling stop, capped by `rollingStopMaximumMps`. */
  readonly rollThroughSpeedMps: number | null;
  /** True when `rolling_stop_speed` asked for more than the explicit cap allows. */
  readonly rollingStopCapped: boolean;
  /** The M `yield_time_gap` of the delivered 052 result. */
  readonly yieldThresholdS: number | null;
  /** `priority_assertiveness` requirement after the relief and the 3 s floor. */
  readonly requiredGapS: number | null;
  /** The separation 052 measured for the limiting relation. */
  readonly minimumGapS: number | null;
  readonly priorityClaimed: boolean;
  readonly intersectionBlocked: boolean;
  readonly intersectionExitM: number | null;
  /** Effective `blocked_intersection_entry_probability`, capped at 0.5. */
  readonly blockedEntryProbability: number | null;
  readonly blockedEntrySample: number | null;
  readonly blockedEntryGranted: boolean | null;
  readonly retainedHistory: 0;
}
let compiling = false;
let evaluating = false;
export function getStopPriorityPolicyStats() {
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
  'atIntersection',
  'intersectionBlocked',
  'intersectionExitM',
  'allWayArrival',
] as const;
const stopFields = [
  'version',
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'profileVersionId',
  'action',
  'reason',
  'stopRequested',
  'leaderInduced',
  'sampledUnit',
  'sampledRole',
  'stopFullProbability',
  'stopDwellTimeS',
  'stopLineOffsetM',
  'remainingToStopPointM',
  'retainedHistory',
] as const;
const yieldFields = [
  'version',
  'sessionId',
  'worldEpoch',
  'subjectId',
  'sourceTick',
  'decisionTick',
  'profileVersionId',
  'action',
  'reason',
  'thresholdS',
  'minimumGapS',
  'comparedPairs',
  'limitingRelationId',
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
  'stopDecision',
  'yieldDecision',
  'observation',
] as const;
function identity(
  value: unknown,
  maximum: number = STOP_PRIORITY_POLICY_LIMITS.idCodeUnits,
): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid stop/priority identity',
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
    'Invalid stop/priority seed',
  );
  return value;
}
export function compileStopPriorityProfile(input: unknown): StopPriorityPolicyProfile {
  requireContract(!compiling, 'Reentrant stop/priority profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<StopPriorityPolicyKey, number>,
      units = {} as Record<StopPriorityPolicyKey, ParameterUnit>,
      provenance = {} as Record<StopPriorityPolicyKey, string>,
      mValues = {} as Record<StopPriorityPolicyMKey, number>,
      mUnits = {} as Record<StopPriorityPolicyMKey, ParameterUnit>;
    for (const key of STOP_PRIORITY_POLICY_KEYS) {
      requireContract(Object.hasOwn(published.parameters, key), 'Missing stop/priority parameter');
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    for (const key of STOP_PRIORITY_POLICY_M_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing stop/priority M parameter',
      );
      mValues[key] = published.parameters[key];
      mUnits[key] = published.unitsByParameter[key];
    }
    const result: StopPriorityPolicyProfile = Object.freeze({
      version: STOP_PRIORITY_POLICY_LIMITS.version,
      profileId: identity(published.profileId),
      versionId: identity(published.versionId, STOP_PRIORITY_POLICY_LIMITS.profileCodeUnits),
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
  readonly speedMps: number;
  readonly atIntersection: boolean;
  readonly intersectionBlocked: boolean;
  readonly intersectionExitM: number | null;
  readonly allWayArrival: StopPriorityAllWayArrival | null;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields);
  requireContract(
    data.version === STOP_PRIORITY_POLICY_LIMITS.observationVersion && data.units === 'SI',
    'Invalid stop/priority observation version/units',
  );
  requireContract(
    typeof data.atIntersection === 'boolean' && typeof data.intersectionBlocked === 'boolean',
    'Invalid stop/priority intersection flags',
  );
  let allWayArrival: StopPriorityAllWayArrival | null = null;
  if (data.allWayArrival !== null) {
    const arrival = fields(data.allWayArrival, ['position', 'sinceDwellS']),
      position = tick(arrival.position);
    requireContract(
      position >= 1 && position <= STOP_PRIORITY_POLICY_LIMITS.maximumPosition,
      'Invalid all-way arrival position',
    );
    allWayArrival = Object.freeze({
      position,
      sinceDwellS: number(arrival.sinceDwellS, 0, STOP_PRIORITY_POLICY_LIMITS.maximumTimeS),
    });
  }
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    tick: tick(data.tick),
    speedMps: number(data.speedMps, 0, STOP_PRIORITY_POLICY_LIMITS.maximumSpeedMps),
    atIntersection: data.atIntersection,
    intersectionBlocked: data.intersectionBlocked,
    intersectionExitM:
      data.intersectionExitM === null
        ? null
        : number(data.intersectionExitM, 0, STOP_PRIORITY_POLICY_LIMITS.maximumExitM),
    allWayArrival,
  });
}
interface AdmittedStop extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly action: StopPriorityStopAction;
  readonly reason: string;
  readonly stopRequested: boolean;
  readonly stopFullProbability: number | null;
  readonly stopDwellTimeS: number | null;
  readonly stopLineOffsetM: number | null;
}
function stopDecision(value: unknown): AdmittedStop {
  const data = fields(value, stopFields);
  requireContract(
    data.version === STOP_PRIORITY_POLICY_LIMITS.stopVersion,
    'Unknown stop/priority stop version',
  );
  const action = choice(data.action, [
      'NO_STOP',
      'APPROACH',
      'HOLD',
      'RELEASE',
      'ROLL_THROUGH',
      'UNKNOWN',
    ]),
    stopRequested = data.stopRequested;
  requireContract(typeof stopRequested === 'boolean', 'Invalid stop/priority stop request');
  requireContract(
    stopRequested === (action === 'APPROACH' || action === 'HOLD'),
    'Inconsistent stop/priority stop request',
  );
  requireContract(data.retainedHistory === 0, 'Stop/priority stop history must stay zero');
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
        : identity(data.profileVersionId, STOP_PRIORITY_POLICY_LIMITS.profileCodeUnits),
    action,
    reason: identity(data.reason),
    stopRequested,
    stopFullProbability: optionalParameter(
      'stop_full_probability',
      data.stopFullProbability,
      'probability',
    ),
    stopDwellTimeS: optionalParameter('stop_dwell_time', data.stopDwellTimeS, 's'),
    stopLineOffsetM: optionalParameter('stop_line_offset', data.stopLineOffsetM, 'm'),
  });
}
interface AdmittedYield extends BehaviorScope {
  readonly subjectId: string;
  readonly decisionTick: number;
  readonly profileVersionId: string;
  readonly action: StopPriorityYieldAction;
  readonly reason: string;
  readonly thresholdS: number;
  readonly minimumGapS: number | null;
}
function yieldDecision(value: unknown): AdmittedYield {
  const data = fields(value, yieldFields);
  requireContract(
    data.version === STOP_PRIORITY_POLICY_LIMITS.yieldVersion,
    'Unknown stop/priority yield version',
  );
  requireContract(data.retainedHistory === 0, 'Stop/priority yield history must stay zero');
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    subjectId: identity(data.subjectId),
    decisionTick: tick(data.decisionTick),
    profileVersionId: identity(data.profileVersionId, STOP_PRIORITY_POLICY_LIMITS.profileCodeUnits),
    action: choice(data.action, ['ACCEPT', 'REFUSE', 'UNKNOWN']),
    reason: identity(data.reason),
    thresholdS: validateParameterValue('yield_time_gap', data.thresholdS, 's'),
    minimumGapS:
      data.minimumGapS === null
        ? null
        : number(
            data.minimumGapS,
            -STOP_PRIORITY_POLICY_LIMITS.maximumTimeS,
            STOP_PRIORITY_POLICY_LIMITS.maximumTimeS,
          ),
  });
}
/**
 * Pure 175 layer. The blocked-intersection veto is evaluated first and is absolute; the 051 stop
 * intent then dominates; the four R keys act only in their own disjoint scenario.
 */
export function evaluateStopPriorityPolicy(
  input: StopPriorityPolicyInput,
): StopPriorityPolicyCommand {
  requireContract(!evaluating, 'Reentrant stop/priority evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      world = { sessionId: identity(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING']),
      vehicleSeed = seed(data.seed),
      opportunityKey = identity(
        data.opportunityKey,
        STOP_PRIORITY_POLICY_LIMITS.opportunityKeyCodeUnits,
      );
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Stop/priority profile token provenance',
    );
    const profile = data.profile as StopPriorityPolicyProfile | null,
      observed = observation(data.observation),
      stop = data.stopDecision === null ? null : stopDecision(data.stopDecision),
      yielded = data.yieldDecision === null ? null : yieldDecision(data.yieldDecision);
    let reason: StopPriorityPolicyReason = 'STOP_PRIORITY_POLICY';
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(world, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    else if (stop === null && yielded === null) reason = 'NO_POLICY_INPUT';
    else if (
      stop !== null &&
      (!sameScope(world, stop) ||
        !sameActor(subject, stop.actor) ||
        stop.decisionTick !== decisionTick)
    )
      reason = 'FOREIGN_OR_STALE_STOP';
    else if (
      yielded !== null &&
      (!sameScope(world, yielded) ||
        yielded.subjectId !== subject.id ||
        yielded.decisionTick !== decisionTick)
    )
      reason = 'FOREIGN_OR_STALE_YIELD';
    else if (stop !== null && stop.action === 'UNKNOWN') reason = 'STOP_UNAVAILABLE';
    else if (yielded !== null && yielded.action === 'UNKNOWN') reason = 'YIELD_UNAVAILABLE';
    else if (stop !== null && stop.profileVersionId !== profile.versionId)
      reason = 'STOP_PROFILE_MISMATCH';
    else if (
      stop !== null &&
      (stop.stopFullProbability !== profile.mValues.stop_full_probability ||
        stop.stopDwellTimeS !== profile.mValues.stop_dwell_time ||
        stop.stopLineOffsetM !== profile.mValues.stop_line_offset)
    )
      reason = 'STOP_M_PROFILE_MISMATCH';
    else if (yielded !== null && yielded.profileVersionId !== profile.versionId)
      reason = 'YIELD_PROFILE_MISMATCH';
    else if (yielded !== null && yielded.thresholdS !== profile.mValues.yield_time_gap)
      reason = 'YIELD_M_PROFILE_MISMATCH';
    let action: StopPriorityPolicyAction = 'UNKNOWN',
      stopRequested = false,
      allWayPosition: number | null = null,
      allWaySinceDwellS: number | null = null,
      allWayHoldS: number | null = null,
      rollThroughSpeedMps: number | null = null,
      rollingStopCapped = false,
      yieldThresholdS: number | null = null,
      requiredGapS: number | null = null,
      minimumGapS: number | null = null,
      priorityClaimed = false,
      blockedEntryProbability: number | null = null,
      blockedEntrySample: number | null = null,
      blockedEntryGranted: boolean | null = null;
    if (reason === 'STOP_PRIORITY_POLICY' && profile !== null) {
      const values = profile.values,
        mValues = profile.mValues,
        floorS = Math.min(mValues.yield_time_gap, STOP_PRIORITY_POLICY_LIMITS.priorityMinimumGapS),
        gapRequirement =
          mValues.yield_time_gap -
          values.priority_assertiveness * Math.max(0, mValues.yield_time_gap - floorS),
        effectiveEntryProbability = Math.min(
          values.blocked_intersection_entry_probability,
          STOP_PRIORITY_POLICY_LIMITS.blockedEntryMaximumProbability,
        ),
        exitUnknown = observed.atIntersection && observed.intersectionExitM === null;
      yieldThresholdS = yielded?.thresholdS ?? mValues.yield_time_gap;
      requiredGapS = Math.max(floorS, gapRequirement);
      minimumGapS = yielded?.minimumGapS ?? null;
      if (observed.allWayArrival !== null) {
        allWayPosition = observed.allWayArrival.position;
        allWaySinceDwellS = observed.allWayArrival.sinceDwellS;
      }
      // The blocked-interior veto and a known insufficient exit are absolute: they precede the
      // 051 intent, the 052 claim and every R key.
      if (observed.atIntersection && observed.intersectionBlocked) {
        reason = 'BLOCKED_INTERSECTION_VETO';
        action = 'STOP';
        stopRequested = true;
      } else if (
        observed.atIntersection &&
        observed.intersectionExitM !== null &&
        observed.intersectionExitM < STOP_PRIORITY_POLICY_LIMITS.minimumExitStorageM
      ) {
        reason = 'EXIT_SPACE_INSUFFICIENT';
        action = 'STOP';
        stopRequested = true;
      } else if (stop !== null && stop.stopRequested) {
        // 051 owns the STOP intent and the dwell; the layer only keeps it.
        reason = 'STOP_REQUIRED';
        action = 'STOP';
        stopRequested = true;
      } else if (stop !== null && stop.action === 'ROLL_THROUGH') {
        reason = 'ROLLING_STOP_AT_SPEED';
        action = 'ROLL_THROUGH';
        rollThroughSpeedMps = Math.min(
          values.rolling_stop_speed,
          STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps,
        );
        rollingStopCapped =
          values.rolling_stop_speed > STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps;
      } else if (
        stop !== null &&
        stop.action === 'RELEASE' &&
        observed.allWayArrival !== null &&
        observed.allWayArrival.position > 1
      ) {
        // The all-way turn is the only episode of the patience key; the first arrival is free and
        // an approaching/held STOP never reaches this branch.
        const holdS = values.allway_stop_patience;
        allWayHoldS = holdS;
        if (observed.allWayArrival.sinceDwellS < holdS) {
          reason = 'ALLWAY_PATIENCE';
          action = 'STOP';
          stopRequested = true;
        } else {
          reason = 'ALLWAY_TURN';
          action = 'PROCEED';
        }
      } else if (yielded !== null && yielded.action === 'REFUSE') {
        // Only a known M separation can be claimed; an unknown 052 result is refused upstream.
        if (yielded.minimumGapS !== null && yielded.minimumGapS >= requiredGapS) {
          reason = 'PRIORITY_CLAIMED';
          action = 'PROCEED';
          priorityClaimed = true;
        } else {
          reason = 'PRIORITY_YIELD';
          action = 'STOP';
          stopRequested = true;
        }
      } else if (exitUnknown) {
        // No declared exit space and no declared block: one deterministic sample per opportunity,
        // capped by the explicit policy ceiling. The remaining opportunities wait.
        blockedEntryProbability = effectiveEntryProbability;
        blockedEntrySample = randomUnit(
          deriveOpportunitySeed(vehicleSeed, opportunityKey),
          'blocked-entry',
          0,
        );
        blockedEntryGranted = blockedEntrySample < effectiveEntryProbability;
        if (blockedEntryGranted) {
          reason = 'BLOCKED_ENTRY_ACCEPTED';
          action = 'PROCEED';
        } else {
          reason = 'BLOCKED_ENTRY_WAIT';
          action = 'STOP';
          stopRequested = true;
        }
      } else if (
        observed.atIntersection &&
        observed.intersectionExitM !== null &&
        (yielded === null || yielded.action === 'ACCEPT')
      ) {
        reason = 'EXIT_SPACE_CONFIRMED';
        action = 'PROCEED';
      } else if (stop !== null && stop.action === 'RELEASE') {
        reason = 'STOP_RELEASED';
        action = 'PROCEED';
      } else if (yielded !== null && yielded.action === 'ACCEPT') {
        reason = 'PRIORITY_GRANTED';
        action = 'PROCEED';
      } else if (stop !== null) {
        reason = 'NO_STOP';
        action = 'PROCEED';
      }
    }
    return Object.freeze({
      ...world,
      version: STOP_PRIORITY_POLICY_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      stopReason: stop?.reason ?? null,
      stopAction: stop?.action ?? null,
      yieldReason: yielded?.reason ?? null,
      yieldAction: yielded?.action ?? null,
      action,
      stopRequested,
      allWayPosition,
      allWaySinceDwellS,
      allWayHoldS,
      rollThroughSpeedMps,
      rollingStopCapped,
      yieldThresholdS,
      requiredGapS,
      minimumGapS,
      priorityClaimed,
      intersectionBlocked: observed.intersectionBlocked,
      intersectionExitM: observed.intersectionExitM,
      blockedEntryProbability,
      blockedEntrySample,
      blockedEntryGranted,
      retainedHistory: 0,
    });
  } finally {
    evaluating = false;
  }
}
