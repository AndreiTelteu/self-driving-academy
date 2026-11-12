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
 * 173 signal policy: yellow feasibility, yellow engagement, red-run gap acceptance and green launch.
 *
 * The layer never rebuilds the signal decision: it admits the genuine `050-signal-policy-v1` result
 * for the tick and only shapes the four R keys. The 050 M keys stay the delivered style and limits:
 * red_stop_probability scales the yellow stop probability, red_stop_line_offset sets the stop point,
 * late_red_brake_threshold keeps its late-braking stop and green_start_delay keeps its launch hold.
 *
 * 1. `yellow_stop_probability` (probability) — on a moving approach to a feasible yellow stop, one
 *    deterministic sample per opportunity decides stop versus enter. The effective probability is
 *    `red_stop_probability · yellow_stop_probability`, so the M compliance consequence is preserved.
 * 2. `yellow_commit_time` (s) — a vehicle whose time to the stop point is within this horizon is
 *    already committed and enters, but only when it can still enter before the phase turns red.
 * 3. `red_run_gap_acceptance` (s) — a red crossed by the 050 profile is admitted only when the world
 *    reports at least that temporal gap to conflicting traffic. The effective requirement is
 *    `max(key, 3 s)`: the explicit safety cap means no key value can accept a dangerous gap, and a
 *    larger key only makes a red run stricter, never more permissive.
 * 4. `green_launch_acceleration` (m/s²) — a release from standstill after the M start delay commands
 *    that acceleration, bounded by the catalog maximum of 6 m/s².
 *
 * Safety stays dominant: a 050 stop is never overridden, the M late-braking stop on yellow is kept,
 * an unknown conflict gap rejects the red run, and the layer only ever turns a 050 proceed on red
 * into a stop. The result is frozen and the layer keeps no history (`retainedHistory: 0`).
 */
export const SIGNAL_POLICY_V2_KEYS = Object.freeze([
  'yellow_stop_probability',
  'red_run_gap_acceptance',
  'yellow_commit_time',
  'green_launch_acceleration',
] as const);
export type SignalPolicyV2Key = (typeof SIGNAL_POLICY_V2_KEYS)[number];
/** The four delivered 050 M keys the layer reads without changing their meaning. */
export const SIGNAL_POLICY_V2_M_KEYS = Object.freeze([
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
] as const);
export type SignalPolicyV2MKey = (typeof SIGNAL_POLICY_V2_M_KEYS)[number];
export const SIGNAL_POLICY_V2_LIMITS = Object.freeze({
  version: '173-signal-policy-v2' as const,
  observationVersion: '173-signal-observation-v1' as const,
  signalVersion: '050-signal-policy-v1' as const,
  idCodeUnits: 256,
  profileCodeUnits: 128,
  opportunityKeyCodeUnits: 8192,
  tickHz: 60,
  /** Same standstill threshold as the 050 green start delay. */
  minimumSpeedMps: 0.1,
  maximumSpeedMps: 100,
  maximumDistanceM: 100000,
  maximumPhaseTimeS: 3600,
  maximumConflictGapS: 3600,
  /**
   * Explicit safety cap of `red_run_gap_acceptance`: the effective requirement is never below 3 s,
   * so no admissible key value (the catalog allows 0.1 s) can accept a dangerous red-run gap.
   */
  redRunMinimumGapS: 3,
  /** The catalog maximum of `green_launch_acceleration`; the command is never above it. */
  maximumLaunchAccelerationMps2: 6,
  retainedHistory: 0,
});
export interface SignalPolicyV2Profile {
  readonly version: '173-signal-policy-v2';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<SignalPolicyV2Key, number>>;
  readonly units: Readonly<Record<SignalPolicyV2Key, ParameterUnit>>;
  readonly provenance: Readonly<Record<SignalPolicyV2Key, string>>;
  readonly mValues: Readonly<Record<SignalPolicyV2MKey, number>>;
  readonly mUnits: Readonly<Record<SignalPolicyV2MKey, ParameterUnit>>;
}
export interface SignalPolicyV2Observation extends BehaviorScope {
  readonly version: '173-signal-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly state: 'RED' | 'YELLOW' | 'GREEN';
  /** Seconds until the current phase ends; the report the signal controller already knows. */
  readonly phaseRemainingS: number;
  /** Front-datum distance to the stop line, positive before it; null without authored geometry. */
  readonly distanceToStopLineM: number | null;
  readonly speedMps: number;
  /** Temporal gap to the next conflicting road user at the crossing point; null when unknown. */
  readonly conflictGapS: number | null;
}
export interface SignalPolicyV2Input extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  /** uint32 vehicle seed from the 006 addressing; the opportunity seed derives from it. */
  readonly seed: number;
  /** The canonical 050 opportunity identity of this encounter. */
  readonly opportunityKey: string;
  readonly profile: SignalPolicyV2Profile | null;
  /** The genuine 050 result for this tick; never rebuilt from separate fields. */
  readonly signal: unknown;
  readonly observation: SignalPolicyV2Observation;
}
export type SignalPolicyV2Action = 'PROCEED' | 'START_DELAY' | 'STOP' | 'UNKNOWN';
export type SignalPolicyV2SignalAction = SignalPolicyV2Action;
export type SignalPolicyV2Reason =
  | 'SIGNAL_POLICY'
  | 'NO_AUTO_AUTHORITY'
  | 'MISSING_PROFILE'
  | 'FOREIGN_OR_STALE_OBSERVATION'
  | 'FOREIGN_OR_STALE_SIGNAL'
  | 'SIGNAL_PROFILE_MISMATCH'
  | 'SIGNAL_M_PROFILE_MISMATCH'
  | 'SIGNAL_OBSERVATION_MISMATCH'
  | 'SIGNAL_UNAVAILABLE'
  | 'NO_SIGNAL'
  | 'GREEN_START_DELAY'
  | 'GREEN_RELEASE'
  | 'GREEN_LAUNCH'
  | 'YELLOW_LATE_BRAKE'
  | 'YELLOW_STOP_NO_GEOMETRY'
  | 'YELLOW_STOP_STANDSTILL'
  | 'YELLOW_STOP_RED_AHEAD'
  | 'YELLOW_COMMIT'
  | 'YELLOW_STOP'
  | 'YELLOW_PROCEED'
  | 'RED_STOP'
  | 'RED_RUN_ACCEPTED'
  | 'RED_RUN_REJECTED'
  | 'RED_RUN_GAP_UNKNOWN';
export interface SignalPolicyV2Command extends BehaviorScope {
  readonly version: '173-signal-policy-v2';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: SignalPolicyV2Reason;
  /** The 050 diagnostic, forwarded unchanged. */
  readonly signalReason: string;
  readonly signalAction: SignalPolicyV2SignalAction;
  readonly action: SignalPolicyV2Action;
  readonly stopRequested: boolean;
  readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
  readonly yellowStopProbability: number | null;
  readonly yellowCommitTimeS: number | null;
  /** Seconds to the stop point of this tick, after the M `red_stop_line_offset`. */
  readonly timeToLineS: number | null;
  readonly yellowCommitted: boolean;
  readonly yellowFeasibleToStop: boolean | null;
  readonly sampledUnit: number | null;
  readonly redRunGapAcceptanceS: number | null;
  /** `max(red_run_gap_acceptance, 3 s)`: the effective, safety-capped requirement. */
  readonly requiredRedGapS: number | null;
  readonly conflictGapS: number | null;
  readonly redRunAccepted: boolean | null;
  readonly launchAccelerationMps2: number | null;
  readonly retainedHistory: 0;
}
let compiling = false;
let evaluating = false;
export function getSignalPolicyV2Stats() {
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
  'state',
  'phaseRemainingS',
  'distanceToStopLineM',
  'speedMps',
  'conflictGapS',
] as const;
const signalFields = [
  'version',
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'profileVersionId',
  'action',
  'reason',
  'stopRequested',
  'signalState',
  'sampledUnit',
  'redStopProbability',
  'greenStartDelayS',
  'redStopLineOffsetM',
  'lateRedBrakeThresholdS',
  'remainingToStopPointM',
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
  'signal',
  'observation',
] as const;
function identity(value: unknown, maximum: number = SIGNAL_POLICY_V2_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid signal policy v2 identity',
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
    'Invalid signal policy v2 seed',
  );
  return value;
}
export function compileSignalPolicyV2Profile(input: unknown): SignalPolicyV2Profile {
  requireContract(!compiling, 'Reentrant signal policy v2 profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<SignalPolicyV2Key, number>,
      units = {} as Record<SignalPolicyV2Key, ParameterUnit>,
      provenance = {} as Record<SignalPolicyV2Key, string>,
      mValues = {} as Record<SignalPolicyV2MKey, number>,
      mUnits = {} as Record<SignalPolicyV2MKey, ParameterUnit>;
    for (const key of SIGNAL_POLICY_V2_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing signal policy v2 parameter',
      );
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    for (const key of SIGNAL_POLICY_V2_M_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing signal policy v2 M parameter',
      );
      mValues[key] = published.parameters[key];
      mUnits[key] = published.unitsByParameter[key];
    }
    const result: SignalPolicyV2Profile = Object.freeze({
      version: SIGNAL_POLICY_V2_LIMITS.version,
      profileId: identity(published.profileId),
      versionId: identity(published.versionId, SIGNAL_POLICY_V2_LIMITS.profileCodeUnits),
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
  readonly state: 'RED' | 'YELLOW' | 'GREEN';
  readonly phaseRemainingS: number;
  readonly distanceToStopLineM: number | null;
  readonly speedMps: number;
  readonly conflictGapS: number | null;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields);
  requireContract(
    data.version === SIGNAL_POLICY_V2_LIMITS.observationVersion && data.units === 'SI',
    'Invalid signal policy v2 observation version/units',
  );
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    tick: tick(data.tick),
    state: choice(data.state, ['RED', 'YELLOW', 'GREEN']),
    phaseRemainingS: number(data.phaseRemainingS, 0, SIGNAL_POLICY_V2_LIMITS.maximumPhaseTimeS),
    distanceToStopLineM:
      data.distanceToStopLineM === null
        ? null
        : number(
            data.distanceToStopLineM,
            -SIGNAL_POLICY_V2_LIMITS.maximumDistanceM,
            SIGNAL_POLICY_V2_LIMITS.maximumDistanceM,
          ),
    speedMps: number(
      data.speedMps,
      -SIGNAL_POLICY_V2_LIMITS.maximumSpeedMps,
      SIGNAL_POLICY_V2_LIMITS.maximumSpeedMps,
    ),
    conflictGapS:
      data.conflictGapS === null
        ? null
        : number(data.conflictGapS, 0, SIGNAL_POLICY_V2_LIMITS.maximumConflictGapS),
  });
}
interface AdmittedSignal extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly action: SignalPolicyV2SignalAction;
  readonly reason: string;
  readonly stopRequested: boolean;
  readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
  readonly sampledUnit: number | null;
  readonly redStopProbability: number | null;
  readonly greenStartDelayS: number | null;
  readonly redStopLineOffsetM: number | null;
  readonly lateRedBrakeThresholdS: number | null;
  readonly remainingToStopPointM: number | null;
}
function optionalParameter(key: string, value: unknown, unit: unknown): number | null {
  return value === null ? null : validateParameterValue(key, value, unit);
}
/** The delivered 050 result shape, re-admitted exactly as 050 produced it. */
function signalDecision(value: unknown): AdmittedSignal {
  const data = fields(value, signalFields);
  requireContract(
    data.version === SIGNAL_POLICY_V2_LIMITS.signalVersion,
    'Unknown signal policy v2 signal version',
  );
  const action = choice(data.action, ['PROCEED', 'START_DELAY', 'STOP', 'UNKNOWN']),
    signalState =
      data.signalState === null ? null : choice(data.signalState, ['RED', 'YELLOW', 'GREEN']),
    stopRequested = data.stopRequested;
  requireContract(typeof stopRequested === 'boolean', 'Invalid signal policy v2 stop request');
  requireContract(
    stopRequested === (action === 'STOP' || action === 'START_DELAY'),
    'Inconsistent signal policy v2 stop request',
  );
  requireContract(
    action !== 'START_DELAY' || signalState === 'GREEN',
    'Signal policy v2 start delay outside green',
  );
  requireContract(data.retainedHistory === 0, 'Signal policy v2 history must stay zero');
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    decisionTick: tick(data.decisionTick),
    profileVersionId:
      data.profileVersionId === null
        ? null
        : identity(data.profileVersionId, SIGNAL_POLICY_V2_LIMITS.profileCodeUnits),
    action,
    reason: identity(data.reason),
    stopRequested,
    signalState,
    sampledUnit: data.sampledUnit === null ? null : number(data.sampledUnit, 0, 1),
    redStopProbability: optionalParameter(
      'red_stop_probability',
      data.redStopProbability,
      'probability',
    ),
    greenStartDelayS: optionalParameter('green_start_delay', data.greenStartDelayS, 's'),
    redStopLineOffsetM: optionalParameter('red_stop_line_offset', data.redStopLineOffsetM, 'm'),
    lateRedBrakeThresholdS: optionalParameter(
      'late_red_brake_threshold',
      data.lateRedBrakeThresholdS,
      's',
    ),
    remainingToStopPointM:
      data.remainingToStopPointM === null
        ? null
        : number(
            data.remainingToStopPointM,
            -SIGNAL_POLICY_V2_LIMITS.maximumDistanceM,
            SIGNAL_POLICY_V2_LIMITS.maximumDistanceM,
          ),
  });
}
/**
 * Pure 173 layer. One determinism sample per identified yellow opportunity decides a feasible stop;
 * re-evaluating the same opportunity reproduces it and never re-samples per tick.
 */
export function evaluateSignalPolicyV2(input: SignalPolicyV2Input): SignalPolicyV2Command {
  requireContract(!evaluating, 'Reentrant signal policy v2 evaluation');
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
        SIGNAL_POLICY_V2_LIMITS.opportunityKeyCodeUnits,
      );
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Signal policy v2 profile token provenance',
    );
    const profile = data.profile as SignalPolicyV2Profile | null,
      observed = observation(data.observation),
      signal = signalDecision(data.signal);
    let reason: SignalPolicyV2Reason = 'SIGNAL_POLICY';
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(world, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    else if (
      !sameScope(world, signal) ||
      !sameActor(subject, signal.actor) ||
      signal.decisionTick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_SIGNAL';
    else if (signal.action === 'UNKNOWN') reason = 'SIGNAL_UNAVAILABLE';
    else if (signal.profileVersionId !== profile.versionId) reason = 'SIGNAL_PROFILE_MISMATCH';
    else if (
      signal.redStopProbability !== profile.mValues.red_stop_probability ||
      signal.greenStartDelayS !== profile.mValues.green_start_delay ||
      signal.redStopLineOffsetM !== profile.mValues.red_stop_line_offset ||
      signal.lateRedBrakeThresholdS !== profile.mValues.late_red_brake_threshold
    )
      reason = 'SIGNAL_M_PROFILE_MISMATCH';
    else if (signal.signalState !== null && signal.signalState !== observed.state)
      reason = 'SIGNAL_OBSERVATION_MISMATCH';
    if (reason === 'SIGNAL_POLICY' && signal.signalState === null) reason = 'NO_SIGNAL';
    let action: SignalPolicyV2Action = 'UNKNOWN',
      stopRequested = false,
      yellowStopProbability: number | null = null,
      yellowCommitTimeS: number | null = null,
      timeToLineS: number | null = null,
      yellowCommitted = false,
      yellowFeasibleToStop: boolean | null = null,
      sampledUnit: number | null = null,
      redRunGapAcceptanceS: number | null = null,
      requiredRedGapS: number | null = null,
      redRunAccepted: boolean | null = null,
      launchAccelerationMps2: number | null = null;
    if (reason === 'SIGNAL_POLICY' && profile !== null) {
      const values = profile.values,
        mValues = profile.mValues,
        yellowStop = mValues.red_stop_probability * values.yellow_stop_probability,
        effectiveRedGap = Math.max(
          values.red_run_gap_acceptance,
          SIGNAL_POLICY_V2_LIMITS.redRunMinimumGapS,
        );
      yellowStopProbability = yellowStop;
      yellowCommitTimeS = values.yellow_commit_time;
      redRunGapAcceptanceS = values.red_run_gap_acceptance;
      requiredRedGapS = effectiveRedGap;
      if (observed.state === 'GREEN') {
        if (signal.action === 'START_DELAY') {
          // The M green_start_delay holds the launch; the R key never shortens it.
          reason = 'GREEN_START_DELAY';
          action = 'START_DELAY';
          stopRequested = true;
        } else if (observed.speedMps <= SIGNAL_POLICY_V2_LIMITS.minimumSpeedMps) {
          reason = 'GREEN_LAUNCH';
          action = 'PROCEED';
          launchAccelerationMps2 = Math.min(
            values.green_launch_acceleration,
            SIGNAL_POLICY_V2_LIMITS.maximumLaunchAccelerationMps2,
          );
        } else {
          reason = 'GREEN_RELEASE';
          action = 'PROCEED';
        }
      } else if (observed.state === 'YELLOW') {
        const remaining =
          observed.distanceToStopLineM === null
            ? null
            : observed.distanceToStopLineM - mValues.red_stop_line_offset;
        timeToLineS =
          remaining === null
            ? null
            : remaining <= 0
              ? 0
              : remaining / Math.max(observed.speedMps, SIGNAL_POLICY_V2_LIMITS.minimumSpeedMps);
        // The M late-braking horizon keeps its stop on yellow; it is a limit, not a style key.
        if (signal.reason === 'LATE_RED_BRAKE') {
          reason = 'YELLOW_LATE_BRAKE';
          action = 'STOP';
          stopRequested = true;
          yellowCommitted = false;
          yellowFeasibleToStop = true;
        } else if (remaining === null) {
          reason = 'YELLOW_STOP_NO_GEOMETRY';
          action = 'STOP';
          stopRequested = true;
          yellowCommitted = false;
          yellowFeasibleToStop = null;
        } else if (observed.speedMps <= SIGNAL_POLICY_V2_LIMITS.minimumSpeedMps) {
          reason = 'YELLOW_STOP_STANDSTILL';
          action = 'STOP';
          stopRequested = true;
          yellowCommitted = false;
          yellowFeasibleToStop = true;
        } else if (timeToLineS === null) {
          reason = 'YELLOW_STOP_NO_GEOMETRY';
          action = 'STOP';
          stopRequested = true;
          yellowCommitted = false;
        } else if (timeToLineS > observed.phaseRemainingS) {
          // Entering would happen on red; the commit horizon cannot authorize a red entry.
          reason = 'YELLOW_STOP_RED_AHEAD';
          action = 'STOP';
          stopRequested = true;
          yellowCommitted = false;
          yellowFeasibleToStop = timeToLineS >= values.yellow_commit_time;
        } else if (timeToLineS <= values.yellow_commit_time) {
          reason = 'YELLOW_COMMIT';
          action = 'PROCEED';
          yellowCommitted = true;
          yellowFeasibleToStop = false;
        } else {
          sampledUnit = randomUnit(
            deriveOpportunitySeed(vehicleSeed, opportunityKey),
            'yellow-stop',
            0,
          );
          yellowFeasibleToStop = true;
          if (sampledUnit < yellowStop) {
            reason = 'YELLOW_STOP';
            action = 'STOP';
            stopRequested = true;
          } else {
            reason = 'YELLOW_PROCEED';
            action = 'PROCEED';
          }
        }
      } else {
        // Red is the 050 limit plus the gap acceptance of the R key; the layer never relaxes it.
        if (signal.action === 'STOP') {
          reason = 'RED_STOP';
          action = 'STOP';
          stopRequested = true;
        } else if (observed.conflictGapS === null) {
          reason = 'RED_RUN_GAP_UNKNOWN';
          action = 'STOP';
          stopRequested = true;
          redRunAccepted = false;
        } else if (observed.conflictGapS < effectiveRedGap) {
          reason = 'RED_RUN_REJECTED';
          action = 'STOP';
          stopRequested = true;
          redRunAccepted = false;
        } else {
          reason = 'RED_RUN_ACCEPTED';
          action = 'PROCEED';
          redRunAccepted = true;
        }
      }
    }
    if (reason === 'NO_SIGNAL') {
      // The 050 free signal is a genuine proceed; the layer adds no fact of its own.
      action = 'PROCEED';
      stopRequested = false;
    }
    return Object.freeze({
      ...world,
      version: SIGNAL_POLICY_V2_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      signalReason: signal.reason,
      signalAction: signal.action,
      action,
      stopRequested,
      signalState: signal.signalState,
      yellowStopProbability,
      yellowCommitTimeS,
      timeToLineS,
      yellowCommitted,
      yellowFeasibleToStop,
      sampledUnit,
      redRunGapAcceptanceS,
      requiredRedGapS,
      conflictGapS: observed.conflictGapS,
      redRunAccepted,
      launchAccelerationMps2,
      retainedHistory: 0,
    });
  } finally {
    evaluating = false;
  }
}
