import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import {
  SIGNAL_POLICY_LIMITS,
  evaluateSignalPolicy,
  projectSignalProfile,
  signalOpportunityKey,
} from '../../src/autonomy/signal-policy';
import type {
  SignalPolicyDecision,
  SignalPolicyObservation,
} from '../../src/autonomy/signal-policy';
import {
  SIGNAL_POLICY_V2_LIMITS,
  compileSignalPolicyV2Profile,
  evaluateSignalPolicyV2,
} from '../../src/autonomy/signal-policy-v2';
import type {
  SignalPolicyV2Command,
  SignalPolicyV2Key,
  SignalPolicyV2MKey,
  SignalPolicyV2Observation,
  SignalPolicyV2Profile,
} from '../../src/autonomy/signal-policy-v2';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import {
  deriveOpportunitySeed,
  deriveScenarioSeed,
  deriveVehicleSeed,
  randomUnit,
} from '../../src/sessions';

/** The four delivered 050 M keys; the 173 layer reads them and never changes their meaning. */
export const signalMValues = Object.freeze({
  red_stop_probability: 1,
  green_start_delay: 0.7,
  red_stop_line_offset: 1,
  late_red_brake_threshold: 2,
}) satisfies Readonly<Record<SignalPolicyV2MKey, number>>;
/** The most conservative admissible 173 configuration; it reproduces the 050 stop outside yellow. */
export const neutralSignalValues = Object.freeze({
  yellow_stop_probability: 1,
  red_run_gap_acceptance: 8,
  yellow_commit_time: 0.2,
  green_launch_acceleration: 0.2,
}) satisfies Readonly<Record<SignalPolicyV2Key, number>>;
/** Independent scenario identity; the catalog only fixes the admissible ranges. */
export const scenario = Object.freeze({
  scope: { sessionId: '173-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 61,
  profileId: '173-fixture',
  versionId: '173-fixture-v1',
  engineVersion: '173-signal-policy-v2',
});
export const SEED = deriveVehicleSeed(deriveScenarioSeed(173, 'city:one'), 'taxi');

const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  red_stop_probability: 'probability',
  green_start_delay: 's',
  red_stop_line_offset: 'm',
  late_red_brake_threshold: 's',
  yellow_stop_probability: 'probability',
  red_run_gap_acceptance: 's',
  yellow_commit_time: 's',
  green_launch_acceleration: 'm/s²',
});

/** A profile document that carries the four 050 M keys and the four 173 R keys together. */
export function signalPolicyV2Document(
  rValues: Partial<Record<SignalPolicyV2Key, number>> = {},
  mValues: Partial<Record<SignalPolicyV2MKey, number>> = {},
  versionId: string = scenario.versionId,
) {
  const parameters: Record<string, number> = {
    ...signalMValues,
    ...mValues,
    ...neutralSignalValues,
    ...rValues,
  };
  const units = Object.fromEntries(
    Object.keys(parameters).map((key) => {
      const unit = unitByKey[key];
      if (unit === undefined) throw new Error(`Missing unit for ${key}`);
      return [key, unit];
    }),
  );
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: scenario.profileId,
    versionId,
    parentVersionId: null,
    engineVersion: scenario.engineVersion,
    parameters,
    unitsByParameter: units,
    provenanceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, 'BASE'])),
    evidenceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, null])),
    sourceSegmentIds: [],
    createdAt: '2026-11-12T00:00:00Z',
    checksum: `unverified:${versionId}`,
  };
}
export function signalV2Profile(
  rValues: Partial<Record<SignalPolicyV2Key, number>> = {},
  mValues: Partial<Record<SignalPolicyV2MKey, number>> = {},
): SignalPolicyV2Profile {
  return compileSignalPolicyV2Profile(signalPolicyV2Document(rValues, mValues));
}

/** One deterministic signal episode: the numbers the world reports for a single tick. */
export interface SignalV2Scene {
  readonly state: 'RED' | 'YELLOW' | 'GREEN';
  readonly speed: number;
  readonly distanceToStopLineM: number | null;
  readonly phaseRemainingS: number;
  readonly conflictGapS: number | null;
  /** Seconds since the applied phase started; used only by the delivered 050 layer. */
  readonly phaseElapsedS?: number;
}
export function signalV2Observation(
  scene: SignalV2Scene,
  tick: number = scenario.tick,
): SignalPolicyV2Observation {
  return {
    version: SIGNAL_POLICY_V2_LIMITS.observationVersion,
    units: 'SI',
    ...scenario.scope,
    actor: scenario.actor,
    tick,
    state: scene.state,
    phaseRemainingS: scene.phaseRemainingS,
    distanceToStopLineM: scene.distanceToStopLineM,
    speedMps: scene.speed,
    conflictGapS: scene.conflictGapS,
  };
}
export function signal050Observation(
  scene: SignalV2Scene,
  tick: number = scenario.tick,
): SignalPolicyObservation {
  return {
    version: SIGNAL_POLICY_LIMITS.observationVersion,
    units: 'SI',
    tick,
    signalId: 'signal',
    intersectionId: 'junction',
    movementId: 'west-straight',
    phaseId: `west-${scene.state.toLowerCase()}`,
    state: scene.state,
    phaseElapsedS: scene.phaseElapsedS ?? (scene.state === 'GREEN' ? 4 : 0.5),
    distanceToStopLineM: scene.distanceToStopLineM,
  };
}
/** The canonical 050 opportunity key of one phase occurrence. */
export function opportunityKeyFor(phaseStartedTick: number): string {
  return signalOpportunityKey({
    sessionId: scenario.scope.sessionId,
    worldEpoch: scenario.scope.worldEpoch,
    vehicleId: scenario.actor.id,
    incarnation: scenario.actor.incarnation,
    intersectionId: 'junction',
    movementId: 'west-straight',
    phaseStartedTick,
  });
}
/** The once-per-opportunity sample of the 173 yellow probability key. */
export function yellowSample(opportunityKey: string): number {
  return randomUnit(deriveOpportunitySeed(SEED, opportunityKey), 'yellow-stop', 0);
}
/** First opportunity whose yellow sample satisfies the predicate, addressed by its start tick. */
export function findYellowOpportunity(
  accept: (sample: number) => boolean,
  from = 0,
): { opportunityKey: string; sample: number; phaseStartedTick: number } {
  for (let phaseStartedTick = from; phaseStartedTick < from + 10000; phaseStartedTick++) {
    const opportunityKey = opportunityKeyFor(phaseStartedTick),
      sample = yellowSample(opportunityKey);
    if (accept(sample)) return { opportunityKey, sample, phaseStartedTick };
  }
  throw new Error('No matching yellow opportunity in fixture range');
}

export interface SignalEvaluationOptions {
  readonly tick?: number;
  readonly opportunityKey?: string;
  readonly rValues?: Partial<Record<SignalPolicyV2Key, number>>;
  readonly mValues?: Partial<Record<SignalPolicyV2MKey, number>>;
}
export interface SignalEvaluation {
  readonly command: SignalPolicyV2Command;
  readonly signal: SignalPolicyDecision;
  readonly profile: SignalPolicyV2Profile;
  readonly decisionTick: number;
  readonly opportunityKey: string;
}
/** Runs the real 050 layer first, then the 173 layer over its genuine result. */
export function evaluate(
  scene: SignalV2Scene,
  options: SignalEvaluationOptions = {},
): SignalEvaluation {
  const document = signalPolicyV2Document(options.rValues, options.mValues),
    profile = compileSignalPolicyV2Profile(document),
    published = parsePublishableDrivingProfile(document),
    signalProfile = projectSignalProfile(published),
    decisionTick = options.tick ?? scenario.tick,
    opportunityKey = options.opportunityKey ?? opportunityKeyFor(0),
    signal = evaluateSignalPolicy({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      speedMps: scene.speed,
      seed: SEED,
      opportunityKey,
      profile: signalProfile,
      observation: signal050Observation(scene, decisionTick),
    }),
    command = evaluateSignalPolicyV2({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      authority: 'AUTO',
      seed: SEED,
      opportunityKey,
      profile,
      signal,
      observation: signalV2Observation(scene, decisionTick),
    });
  return { command, signal, profile, decisionTick, opportunityKey };
}
