import {
  choice,
  createStableId,
  deriveOpportunitySeed,
  fields,
  number,
  randomUnit,
  record,
  requireContract,
  tick,
} from '../sessions';
import { validateParameterValue } from '../profiles';
import type { DrivingProfile } from '../profiles';
import type { BehaviorActor, BehaviorFacts, BehaviorScope } from './behavior-fsm';
import { parseBehaviorFacts } from './behavior-fsm';

export const SIGNAL_POLICY_KEYS = Object.freeze([
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
] as const);
export type SignalPolicyKey = (typeof SIGNAL_POLICY_KEYS)[number];
export const SIGNAL_POLICY_LIMITS = Object.freeze({
  version: '050-signal-policy-v1' as const,
  observationVersion: '050-signal-observation-v1' as const,
  actors: 110,
  maximumObservationAgeTicks: 6,
  identityCodeUnits: 256,
  profileCodeUnits: 128,
  opportunityKeyCodeUnits: 8192,
  distanceM: 100000,
  speedMps: 100,
  maximumPhaseElapsedS: 3600,
  /** Below this the driver cannot reach the line by motion; the red is not run from a standstill. */
  minimumSpeedMps: 0.1,
  retainedHistory: 0,
});
export interface SignalPolicyProfile {
  readonly versionId: string;
  readonly redStopProbability: number;
  readonly greenStartDelayS: number;
  readonly redStopLineOffsetM: number;
  readonly lateRedBrakeThresholdS: number;
}
/** Authoritative036 read for the subject's own movement; never an inferred signal. */
export interface SignalPolicyObservation {
  readonly version: '050-signal-observation-v1';
  readonly units: 'SI';
  readonly tick: number;
  readonly signalId: string;
  readonly intersectionId: string;
  readonly movementId: string;
  readonly phaseId: string;
  readonly state: 'RED' | 'YELLOW' | 'GREEN';
  /** Seconds since the applied phase started; the source of the green start delay. */
  readonly phaseElapsedS: number;
  /** Front-datum distance to the stop line, positive before it; null without authored line geometry. */
  readonly distanceToStopLineM: number | null;
}
export interface SignalPolicyInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  /** Authoritative ego longitudinal speed at decisionTick. */
  readonly speedMps: number;
  /** uint32 vehicle seed from the006 addressing; the opportunity seed derives from it. */
  readonly seed: number;
  readonly opportunityKey: string;
  readonly profile: SignalPolicyProfile | null;
  readonly observation: SignalPolicyObservation | null;
}
export interface SignalPolicyDecision extends BehaviorScope {
  readonly version: '050-signal-policy-v1';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly action: 'PROCEED' | 'START_DELAY' | 'STOP' | 'UNKNOWN';
  readonly reason:
    | 'NO_SIGNAL'
    | 'UNAVAILABLE'
    | 'GREEN_RELEASE'
    | 'GREEN_START_DELAY'
    | 'STOP_LINE_APPROACH'
    | 'STOP_LINE_HOLD'
    | 'CROSS_RED_BY_PROFILE'
    | 'LATE_RED_BRAKE';
  readonly stopRequested: boolean;
  readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
  /** The once-per-opportunity unit sample; identical while the same opportunity is re-evaluated. */
  readonly sampledUnit: number | null;
  readonly redStopProbability: number | null;
  readonly greenStartDelayS: number | null;
  readonly redStopLineOffsetM: number | null;
  readonly lateRedBrakeThresholdS: number | null;
  /** distanceToStopLineM minus red_stop_line_offset; negative at or beyond the stop point. */
  readonly remainingToStopPointM: number | null;
  readonly retainedHistory: 0;
}
let evaluating = false;
export function getSignalPolicyStats() {
  return Object.freeze({
    evaluating,
    retainedActors: 0,
    retainedOpportunities: 0,
    retainedHistory: 0,
  });
}
function identity(value: unknown, limit: number = SIGNAL_POLICY_LIMITS.identityCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value.trim() === value,
    'Invalid signal policy identity',
  );
  return value;
}
function seed(value: unknown): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff,
    'Invalid signal policy seed',
  );
  return value;
}
/** Canonical semantic opportunity identity: one red/green encounter per phase occurrence. */
export function signalOpportunityKey(input: unknown): string {
  const data = fields(input, [
    'sessionId',
    'worldEpoch',
    'vehicleId',
    'incarnation',
    'intersectionId',
    'movementId',
    'phaseStartedTick',
  ]);
  return createStableId('signal-opportunity', identity(data.sessionId), [
    String(tick(data.worldEpoch)),
    identity(data.vehicleId),
    String(tick(data.incarnation)),
    identity(data.intersectionId),
    identity(data.movementId),
    String(tick(data.phaseStartedTick)),
  ]);
}
/** Reads only the selected own data from an already published profile, no capability grant. */
export function projectSignalProfile(input: DrivingProfile): SignalPolicyProfile {
  const profile = record(input),
    parameters = record(profile.parameters),
    units = record(profile.unitsByParameter);
  requireContract(
    Object.keys(parameters).length <= 80 && Object.keys(units).length <= 80,
    'Signal profile map capacity',
  );
  return Object.freeze({
    versionId: identity(profile.versionId, SIGNAL_POLICY_LIMITS.profileCodeUnits),
    redStopProbability: validateParameterValue(
      'red_stop_probability',
      parameters.red_stop_probability,
      units.red_stop_probability,
    ),
    greenStartDelayS: validateParameterValue(
      'green_start_delay',
      parameters.green_start_delay,
      units.green_start_delay,
    ),
    redStopLineOffsetM: validateParameterValue(
      'red_stop_line_offset',
      parameters.red_stop_line_offset,
      units.red_stop_line_offset,
    ),
    lateRedBrakeThresholdS: validateParameterValue(
      'late_red_brake_threshold',
      parameters.late_red_brake_threshold,
      units.late_red_brake_threshold,
    ),
  });
}
function observation(input: unknown): SignalPolicyObservation {
  const data = fields(input, [
    'version',
    'units',
    'tick',
    'signalId',
    'intersectionId',
    'movementId',
    'phaseId',
    'state',
    'phaseElapsedS',
    'distanceToStopLineM',
  ]);
  requireContract(
    data.version === SIGNAL_POLICY_LIMITS.observationVersion && data.units === 'SI',
    'Signal observation version/units',
  );
  return Object.freeze({
    version: SIGNAL_POLICY_LIMITS.observationVersion,
    units: 'SI',
    tick: tick(data.tick),
    signalId: identity(data.signalId),
    intersectionId: identity(data.intersectionId),
    movementId: identity(data.movementId),
    phaseId: identity(data.phaseId),
    state: choice(data.state, ['RED', 'YELLOW', 'GREEN']),
    phaseElapsedS: number(data.phaseElapsedS, 0, SIGNAL_POLICY_LIMITS.maximumPhaseElapsedS),
    distanceToStopLineM:
      data.distanceToStopLineM === null
        ? null
        : number(
            data.distanceToStopLineM,
            -SIGNAL_POLICY_LIMITS.distanceM,
            SIGNAL_POLICY_LIMITS.distanceM,
          ),
  });
}
/**
 * Pure 050 policy. The compliance sample is addressed by the opportunity seed and a fixed sample
 * key, so re-evaluating the same opportunity reproduces one value and never re-samples per tick.
 */
export function evaluateSignalPolicy(input: SignalPolicyInput): SignalPolicyDecision {
  requireContract(!evaluating, 'Reentrant signal policy evaluation');
  evaluating = true;
  try {
    const value = fields(input, [
      'sessionId',
      'worldEpoch',
      'actor',
      'decisionTick',
      'speedMps',
      'seed',
      'opportunityKey',
      'profile',
      'observation',
    ]);
    const sessionId = identity(value.sessionId),
      worldEpoch = tick(value.worldEpoch),
      actorData = fields(value.actor, ['id', 'incarnation']),
      actor = Object.freeze({
        id: identity(actorData.id),
        incarnation: tick(actorData.incarnation),
      }),
      decisionTick = tick(value.decisionTick),
      speedMps = number(
        value.speedMps,
        -SIGNAL_POLICY_LIMITS.speedMps,
        SIGNAL_POLICY_LIMITS.speedMps,
      ),
      vehicleSeed = seed(value.seed),
      opportunityKey = identity(value.opportunityKey, SIGNAL_POLICY_LIMITS.opportunityKeyCodeUnits),
      profile =
        value.profile === null
          ? null
          : (() => {
              const data = fields(value.profile, [
                'versionId',
                'redStopProbability',
                'greenStartDelayS',
                'redStopLineOffsetM',
                'lateRedBrakeThresholdS',
              ]);
              return Object.freeze({
                versionId: identity(data.versionId, SIGNAL_POLICY_LIMITS.profileCodeUnits),
                redStopProbability: validateParameterValue(
                  'red_stop_probability',
                  data.redStopProbability,
                  'probability',
                ),
                greenStartDelayS: validateParameterValue(
                  'green_start_delay',
                  data.greenStartDelayS,
                  's',
                ),
                redStopLineOffsetM: validateParameterValue(
                  'red_stop_line_offset',
                  data.redStopLineOffsetM,
                  'm',
                ),
                lateRedBrakeThresholdS: validateParameterValue(
                  'late_red_brake_threshold',
                  data.lateRedBrakeThresholdS,
                  's',
                ),
              });
            })(),
      read = value.observation === null ? null : observation(value.observation);
    const decision = (
      action: SignalPolicyDecision['action'],
      reason: SignalPolicyDecision['reason'],
      stopRequested: boolean,
      sampledUnit: number | null,
      remainingToStopPointM: number | null,
    ): SignalPolicyDecision =>
      Object.freeze({
        version: SIGNAL_POLICY_LIMITS.version,
        sessionId,
        worldEpoch,
        actor,
        decisionTick,
        profileVersionId: profile?.versionId ?? null,
        action,
        reason,
        stopRequested,
        signalState: read?.state ?? null,
        sampledUnit,
        redStopProbability: profile?.redStopProbability ?? null,
        greenStartDelayS: profile?.greenStartDelayS ?? null,
        redStopLineOffsetM: profile?.redStopLineOffsetM ?? null,
        lateRedBrakeThresholdS: profile?.lateRedBrakeThresholdS ?? null,
        remainingToStopPointM,
        retainedHistory: 0,
      });
    if (read === null) return decision('PROCEED', 'NO_SIGNAL', false, null, null);
    if (profile === null) return decision('UNKNOWN', 'UNAVAILABLE', false, null, null);
    if (
      read.tick > decisionTick ||
      decisionTick - read.tick > SIGNAL_POLICY_LIMITS.maximumObservationAgeTicks
    )
      return decision('UNKNOWN', 'UNAVAILABLE', false, null, null);
    if (read.state === 'GREEN') {
      const starting =
        speedMps <= SIGNAL_POLICY_LIMITS.minimumSpeedMps &&
        read.phaseElapsedS < profile.greenStartDelayS;
      return starting
        ? decision('START_DELAY', 'GREEN_START_DELAY', true, null, null)
        : decision('PROCEED', 'GREEN_RELEASE', false, null, null);
    }
    // Red-like phase (RED/YELLOW): one sample per identified opportunity, never per tick.
    const sampledUnit = randomUnit(
      deriveOpportunitySeed(vehicleSeed, opportunityKey),
      'red-compliance',
      0,
    );
    const remainingToStopPointM =
      read.distanceToStopLineM === null
        ? null
        : read.distanceToStopLineM - profile.redStopLineOffsetM;
    if (sampledUnit < profile.redStopProbability)
      return remainingToStopPointM === null || remainingToStopPointM > 0
        ? decision('STOP', 'STOP_LINE_APPROACH', true, sampledUnit, remainingToStopPointM)
        : decision('STOP', 'STOP_LINE_HOLD', true, sampledUnit, remainingToStopPointM);
    // Non-compliant: braking is still initiated while the remaining time to the line covers the
    // profile horizon; below it the red is already committed and the driver crosses.
    if (read.distanceToStopLineM === null || remainingToStopPointM! < 0)
      return decision('PROCEED', 'CROSS_RED_BY_PROFILE', false, sampledUnit, remainingToStopPointM);
    const timeToLineS =
      read.distanceToStopLineM / Math.max(speedMps, SIGNAL_POLICY_LIMITS.minimumSpeedMps);
    return timeToLineS >= profile.lateRedBrakeThresholdS
      ? decision('STOP', 'LATE_RED_BRAKE', true, sampledUnit, remainingToStopPointM)
      : decision('PROCEED', 'CROSS_RED_BY_PROFILE', false, sampledUnit, remainingToStopPointM);
  } finally {
    evaluating = false;
  }
}
/**
 * 045 bridge. Only raises the red intent or clears its own fact; an independent STOP rule,
 * explicit request or leader-induced stop is never fabricated or overwritten.
 */
export function signalBehaviorFacts(
  base: BehaviorFacts,
  decision: SignalPolicyDecision,
): BehaviorFacts | null {
  const facts = parseBehaviorFacts(base),
    diagnostic = record(decision);
  requireContract(
    diagnostic.version === SIGNAL_POLICY_LIMITS.version,
    'Signal/FSM version mismatch',
  );
  const action = choice(diagnostic.action, ['PROCEED', 'START_DELAY', 'STOP', 'UNKNOWN']);
  // An unavailable observation carries no profile binding and fabricates no fact.
  if (action === 'UNKNOWN') return null;
  requireContract(
    typeof diagnostic.profileVersionId === 'string' &&
      facts.profileVersionId === diagnostic.profileVersionId,
    'Signal/FSM profile mismatch',
  );
  if (action === 'STOP' && facts.stop !== 'RED_BY_PROFILE')
    return Object.freeze({ ...facts, stop: 'RED_BY_PROFILE' });
  if (action !== 'STOP' && facts.stop === 'RED_BY_PROFILE')
    return Object.freeze({ ...facts, stop: 'NONE' });
  return facts;
}
