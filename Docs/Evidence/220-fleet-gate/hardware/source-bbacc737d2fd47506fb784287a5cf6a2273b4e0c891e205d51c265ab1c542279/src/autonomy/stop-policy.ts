import {
  choice,
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

export const STOP_POLICY_KEYS = Object.freeze([
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
] as const);
export type StopPolicyKey = (typeof STOP_POLICY_KEYS)[number];
export const STOP_POLICY_LIMITS = Object.freeze({
  version: '051-stop-policy-v1' as const,
  observationVersion: '051-stop-observation-v1' as const,
  actors: 110,
  maximumObservationAgeTicks: 6,
  identityCodeUnits: 256,
  profileCodeUnits: 128,
  distanceM: 1000,
  speedMps: 100,
  maximumDurationS: 60,
  tickHz: 60,
  retainedHistory: 0,
});
export interface StopPolicyProfile {
  readonly versionId: string;
  readonly stopFullProbability: number;
  readonly stopDwellTimeS: number;
  readonly stopLineOffsetM: number;
}
/** Authoritative037 view of the current STOP opportunity; never an inferred or leader-made stop. */
export interface StopPolicyObservation {
  readonly version: '051-stop-observation-v1';
  readonly units: 'SI';
  readonly tick: number;
  /** Stable037 STOP_APPROACH opportunity identity; one compliance sample per opportunity. */
  readonly opportunityId: string;
  readonly stopLineId: string;
  /** Front-datum distance to the STOP line, positive before it. */
  readonly distanceToStopLineM: number;
  readonly speedMps: number;
  /** Continuous authoritative stationary proof in seconds; null while a full stop is unproven. */
  readonly stationaryDurationS: number | null;
  readonly crossed: boolean;
}
export interface StopPolicyInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  /** uint32 vehicle seed from the006 addressing. */
  readonly seed: number;
  readonly profile: StopPolicyProfile | null;
  readonly observation: StopPolicyObservation | null;
  /** Separate evidence path: the ego is held by a leader/queue, not by its own STOP intent. */
  readonly leaderStop: 'NONE' | 'LEADER_OR_QUEUE';
}
export interface StopPolicyDecision extends BehaviorScope {
  readonly version: '051-stop-policy-v1';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly action: 'NO_STOP' | 'APPROACH' | 'HOLD' | 'RELEASE' | 'ROLL_THROUGH' | 'UNKNOWN';
  readonly reason:
    | 'NO_STOP_OBSERVATION'
    | 'LEADER_STOP_NOT_STOP_INTENT'
    | 'MISSING_PROFILE'
    | 'OBSERVATION_UNAVAILABLE'
    | 'STOP_APPROACH'
    | 'STOP_HOLD'
    | 'DWELL_IN_PROGRESS'
    | 'DWELL_SATISFIED'
    | 'ROLLING_STOP_BY_PROFILE'
    | 'STOP_LINE_CROSSED';
  /** True only for the driver's own STOP intent, never for a leader-induced hold. */
  readonly stopRequested: boolean;
  readonly leaderInduced: boolean;
  readonly sampledUnit: number | null;
  readonly sampledRole: 'FULL' | 'ROLLING' | null;
  readonly stopFullProbability: number | null;
  readonly stopDwellTimeS: number | null;
  readonly stopLineOffsetM: number | null;
  readonly remainingToStopPointM: number | null;
  readonly retainedHistory: 0;
}
let evaluating = false;
export function getStopPolicyStats() {
  return Object.freeze({
    evaluating,
    retainedActors: 0,
    retainedOpportunities: 0,
    retainedHistory: 0,
  });
}
function identity(value: unknown, limit: number = STOP_POLICY_LIMITS.identityCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value.trim() === value,
    'Invalid stop policy identity',
  );
  return value;
}
function seed(value: unknown): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff,
    'Invalid stop policy seed',
  );
  return value;
}
/** Reads only the selected own data from an already published profile, no capability grant. */
export function projectStopProfile(input: DrivingProfile): StopPolicyProfile {
  const profile = record(input),
    parameters = record(profile.parameters),
    units = record(profile.unitsByParameter);
  requireContract(
    Object.keys(parameters).length <= 80 && Object.keys(units).length <= 80,
    'Stop profile map capacity',
  );
  return Object.freeze({
    versionId: identity(profile.versionId, STOP_POLICY_LIMITS.profileCodeUnits),
    stopFullProbability: validateParameterValue(
      'stop_full_probability',
      parameters.stop_full_probability,
      units.stop_full_probability,
    ),
    stopDwellTimeS: validateParameterValue(
      'stop_dwell_time',
      parameters.stop_dwell_time,
      units.stop_dwell_time,
    ),
    stopLineOffsetM: validateParameterValue(
      'stop_line_offset',
      parameters.stop_line_offset,
      units.stop_line_offset,
    ),
  });
}
function observation(input: unknown): StopPolicyObservation {
  const data = fields(input, [
    'version',
    'units',
    'tick',
    'opportunityId',
    'stopLineId',
    'distanceToStopLineM',
    'speedMps',
    'stationaryDurationS',
    'crossed',
  ]);
  requireContract(
    data.version === STOP_POLICY_LIMITS.observationVersion && data.units === 'SI',
    'Stop observation version/units',
  );
  requireContract(typeof data.crossed === 'boolean', 'Stop observation crossing flag');
  const crossed = data.crossed,
    stationaryDurationS =
      data.stationaryDurationS === null
        ? null
        : number(data.stationaryDurationS, 0, STOP_POLICY_LIMITS.maximumDurationS);
  return Object.freeze({
    version: STOP_POLICY_LIMITS.observationVersion,
    units: 'SI',
    tick: tick(data.tick),
    opportunityId: identity(data.opportunityId),
    stopLineId: identity(data.stopLineId),
    distanceToStopLineM: number(
      data.distanceToStopLineM,
      -STOP_POLICY_LIMITS.distanceM,
      STOP_POLICY_LIMITS.distanceM,
    ),
    speedMps: number(data.speedMps, 0, STOP_POLICY_LIMITS.speedMps),
    stationaryDurationS,
    crossed,
  });
}
/**
 * Pure 051 policy. The full/rolling-stop sample is addressed by the037 opportunity identity, so a
 * re-evaluated STOP opportunity reproduces one decision and is never re-sampled per tick.
 */
export function evaluateStopPolicy(input: StopPolicyInput): StopPolicyDecision {
  requireContract(!evaluating, 'Reentrant stop policy evaluation');
  evaluating = true;
  try {
    const value = fields(input, [
      'sessionId',
      'worldEpoch',
      'actor',
      'decisionTick',
      'seed',
      'profile',
      'observation',
      'leaderStop',
    ]);
    const sessionId = identity(value.sessionId),
      worldEpoch = tick(value.worldEpoch),
      actorData = fields(value.actor, ['id', 'incarnation']),
      actor = Object.freeze({
        id: identity(actorData.id),
        incarnation: tick(actorData.incarnation),
      }),
      decisionTick = tick(value.decisionTick),
      vehicleSeed = seed(value.seed),
      leaderStop = choice(value.leaderStop, ['NONE', 'LEADER_OR_QUEUE']),
      profile =
        value.profile === null
          ? null
          : (() => {
              const data = fields(value.profile, [
                'versionId',
                'stopFullProbability',
                'stopDwellTimeS',
                'stopLineOffsetM',
              ]);
              return Object.freeze({
                versionId: identity(data.versionId, STOP_POLICY_LIMITS.profileCodeUnits),
                stopFullProbability: validateParameterValue(
                  'stop_full_probability',
                  data.stopFullProbability,
                  'probability',
                ),
                stopDwellTimeS: validateParameterValue('stop_dwell_time', data.stopDwellTimeS, 's'),
                stopLineOffsetM: validateParameterValue(
                  'stop_line_offset',
                  data.stopLineOffsetM,
                  'm',
                ),
              });
            })(),
      read = value.observation === null ? null : observation(value.observation);
    const decision = (
      action: StopPolicyDecision['action'],
      reason: StopPolicyDecision['reason'],
      stopRequested: boolean,
      sampledUnit: number | null,
      sampledRole: StopPolicyDecision['sampledRole'],
      remainingToStopPointM: number | null,
    ): StopPolicyDecision =>
      Object.freeze({
        version: STOP_POLICY_LIMITS.version,
        sessionId,
        worldEpoch,
        actor,
        decisionTick,
        profileVersionId: profile?.versionId ?? null,
        action,
        reason,
        stopRequested,
        leaderInduced: reason === 'LEADER_STOP_NOT_STOP_INTENT',
        sampledUnit,
        sampledRole,
        stopFullProbability: profile?.stopFullProbability ?? null,
        stopDwellTimeS: profile?.stopDwellTimeS ?? null,
        stopLineOffsetM: profile?.stopLineOffsetM ?? null,
        remainingToStopPointM,
        retainedHistory: 0,
      });
    // A leader-held ego is an independent evidence path: it never becomes the driver's STOP intent.
    if (read === null)
      return leaderStop === 'LEADER_OR_QUEUE'
        ? decision('NO_STOP', 'LEADER_STOP_NOT_STOP_INTENT', false, null, null, null)
        : decision('NO_STOP', 'NO_STOP_OBSERVATION', false, null, null, null);
    if (profile === null) return decision('UNKNOWN', 'MISSING_PROFILE', false, null, null, null);
    if (
      read.tick > decisionTick ||
      decisionTick - read.tick > STOP_POLICY_LIMITS.maximumObservationAgeTicks
    )
      return decision('UNKNOWN', 'OBSERVATION_UNAVAILABLE', false, null, null, null);
    if (read.crossed) return decision('RELEASE', 'STOP_LINE_CROSSED', false, null, null, null);
    const remainingToStopPointM = read.distanceToStopLineM - profile.stopLineOffsetM,
      sampledUnit = randomUnit(
        deriveOpportunitySeed(vehicleSeed, read.opportunityId),
        'full-stop',
        0,
      ),
      full = sampledUnit < profile.stopFullProbability;
    if (!full)
      // A rolling stop declares its intent and never waits for an authoritative full-stop proof,
      // so prudent and rolling profiles produce distinct observed outcomes.
      return decision(
        'ROLL_THROUGH',
        'ROLLING_STOP_BY_PROFILE',
        false,
        sampledUnit,
        'ROLLING',
        remainingToStopPointM,
      );
    if (remainingToStopPointM > 0)
      return decision(
        'APPROACH',
        'STOP_APPROACH',
        true,
        sampledUnit,
        'FULL',
        remainingToStopPointM,
      );
    if (read.stationaryDurationS === null)
      return decision('HOLD', 'STOP_HOLD', true, sampledUnit, 'FULL', remainingToStopPointM);
    return read.stationaryDurationS < profile.stopDwellTimeS
      ? decision('HOLD', 'DWELL_IN_PROGRESS', true, sampledUnit, 'FULL', remainingToStopPointM)
      : decision('RELEASE', 'DWELL_SATISFIED', false, sampledUnit, 'FULL', remainingToStopPointM);
  } finally {
    evaluating = false;
  }
}
/**
 * 045 bridge. Only raises the STOP-rule intent or clears its own fact; a red intent is preserved and
 * a leader-induced hold never becomes STOP facts.
 */
export function stopBehaviorFacts(
  base: BehaviorFacts,
  decision: StopPolicyDecision,
): BehaviorFacts | null {
  const facts = parseBehaviorFacts(base),
    diagnostic = record(decision);
  requireContract(diagnostic.version === STOP_POLICY_LIMITS.version, 'Stop/FSM version mismatch');
  const action = choice(diagnostic.action, [
    'NO_STOP',
    'APPROACH',
    'HOLD',
    'RELEASE',
    'ROLL_THROUGH',
    'UNKNOWN',
  ]);
  if (action === 'UNKNOWN') return null;
  requireContract(
    typeof diagnostic.profileVersionId === 'string' &&
      facts.profileVersionId === diagnostic.profileVersionId,
    'Stop/FSM profile mismatch',
  );
  const requested = diagnostic.stopRequested;
  requireContract(requested === true || requested === false, 'Stop/FSM request flag');
  if (requested) {
    if (facts.stop === 'RED_BY_PROFILE') return facts;
    return Object.freeze({ ...facts, stop: 'STOP_RULE_BY_PROFILE' });
  }
  return facts.stop === 'STOP_RULE_BY_PROFILE' ? Object.freeze({ ...facts, stop: 'NONE' }) : facts;
}
