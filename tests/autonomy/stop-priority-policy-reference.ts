import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import {
  STOP_POLICY_LIMITS,
  evaluateStopPolicy,
  projectStopProfile,
} from '../../src/autonomy/stop-policy';
import type { StopPolicyDecision, StopPolicyObservation } from '../../src/autonomy/stop-policy';
import { evaluateYieldPolicy, projectYieldProfile } from '../../src/autonomy/yield-policy';
import type { YieldPolicyDecision } from '../../src/autonomy/yield-policy';
import {
  STOP_PRIORITY_POLICY_LIMITS,
  compileStopPriorityProfile,
  evaluateStopPriorityPolicy,
} from '../../src/autonomy/stop-priority-policy';
import type {
  StopPriorityPolicyCommand,
  StopPriorityPolicyKey,
  StopPriorityPolicyMKey,
  StopPriorityPolicyObservation,
  StopPriorityPolicyProfile,
} from '../../src/autonomy/stop-priority-policy';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import {
  deriveOpportunitySeed,
  deriveScenarioSeed,
  deriveVehicleSeed,
  randomUnit,
} from '../../src/sessions';

/** The four delivered 051/052 M keys; the 175 layer reads them and never changes their meaning. */
export const stopPriorityMValues = Object.freeze({
  stop_full_probability: 1,
  stop_dwell_time: 1,
  stop_line_offset: 1,
  yield_time_gap: 3,
}) satisfies Readonly<Record<StopPriorityPolicyMKey, number>>;
/** The most conservative admissible 175 configuration; it reproduces 051/052 outside its keys. */
export const neutralStopPriorityValues = Object.freeze({
  rolling_stop_speed: 1,
  priority_assertiveness: 0,
  allway_stop_patience: 0,
  blocked_intersection_entry_probability: 0,
}) satisfies Readonly<Record<StopPriorityPolicyKey, number>>;
/** Independent scenario identity; the catalog only fixes the admissible ranges. */
export const scenario = Object.freeze({
  scope: { sessionId: '175-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 61,
  profileId: '175-fixture',
  versionId: '175-fixture-v1',
  engineVersion: '175-stop-priority-policy-v1',
});
export const SEED = deriveVehicleSeed(deriveScenarioSeed(175, 'city:one'), 'taxi');
const otherActorId = 'other';

const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  stop_full_probability: 'probability',
  stop_dwell_time: 's',
  stop_line_offset: 'm',
  yield_time_gap: 's',
  rolling_stop_speed: 'm/s',
  priority_assertiveness: 'ratio',
  allway_stop_patience: 's',
  blocked_intersection_entry_probability: 'probability',
});

/** A profile document that carries the four 051/052 M keys and the four 175 R keys together. */
export function stopPriorityDocument(
  rValues: Partial<Record<StopPriorityPolicyKey, number>> = {},
  mValues: Partial<Record<StopPriorityPolicyMKey, number>> = {},
  versionId: string = scenario.versionId,
) {
  const parameters: Record<string, number> = {
    ...stopPriorityMValues,
    ...mValues,
    ...neutralStopPriorityValues,
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
export function stopPriorityProfile(
  rValues: Partial<Record<StopPriorityPolicyKey, number>> = {},
  mValues: Partial<Record<StopPriorityPolicyMKey, number>> = {},
): StopPriorityPolicyProfile {
  return compileStopPriorityProfile(stopPriorityDocument(rValues, mValues));
}

/** One deterministic stop/priority episode: the numbers the world reports for a single tick. */
export interface StopPriorityScene {
  readonly speed: number;
  /** Front-datum distance to the STOP line; null means no 051 STOP opportunity exists. */
  readonly stopDistanceM: number | null;
  readonly stopSpeed: number;
  readonly stationaryDurationS: number | null;
  readonly crossed: boolean;
  readonly allWayArrival: { readonly position: number; readonly sinceDwellS: number } | null;
  readonly atIntersection: boolean;
  readonly intersectionBlocked: boolean;
  readonly intersectionExitM: number | null;
  /** Declared 052 separation to the conflicting actor; null means the subject has priority. */
  readonly yieldGapS: number | null;
}
export function stopPriorityObservation(
  scene: StopPriorityScene,
  tick: number = scenario.tick,
): StopPriorityPolicyObservation {
  return {
    version: STOP_PRIORITY_POLICY_LIMITS.observationVersion,
    units: 'SI',
    ...scenario.scope,
    actor: scenario.actor,
    tick,
    speedMps: scene.speed,
    atIntersection: scene.atIntersection,
    intersectionBlocked: scene.intersectionBlocked,
    intersectionExitM: scene.intersectionExitM,
    allWayArrival: scene.allWayArrival,
  };
}
export function stop051Observation(
  scene: StopPriorityScene,
  tick: number = scenario.tick,
): StopPolicyObservation | null {
  if (scene.stopDistanceM === null) return null;
  return {
    version: STOP_POLICY_LIMITS.observationVersion,
    units: 'SI',
    tick,
    opportunityId: 'stop-175',
    stopLineId: 'line-175',
    distanceToStopLineM: scene.stopDistanceM,
    speedMps: scene.stopSpeed,
    stationaryDurationS: scene.stationaryDurationS,
    crossed: scene.crossed,
  };
}
/** Runs the real 051 layer for the scene. */
export function evaluateStop(
  scene: StopPriorityScene,
  profile: ReturnType<typeof projectStopProfile>,
  tick: number = scenario.tick,
): StopPolicyDecision {
  return evaluateStopPolicy({
    ...scenario.scope,
    actor: scenario.actor,
    decisionTick: tick,
    seed: SEED,
    profile,
    observation: stop051Observation(scene, tick),
    leaderStop: 'NONE',
  });
}
/** Runs the real 052 layer for the scene: one candidate interval, one explicit priority pair. */
export function evaluateYield(
  scene: StopPriorityScene,
  profile: ReturnType<typeof projectYieldProfile>,
  tick: number = scenario.tick,
  coverage: 'COMPLETE_HORIZON' | 'LOCAL_ONLY' = 'COMPLETE_HORIZON',
): YieldPolicyDecision {
  const refused = scene.yieldGapS !== null,
    otherEntryS = refused ? 4 + scene.yieldGapS! : 9;
  return evaluateYieldPolicy({
    version: '052-yield-interval-v1',
    units: 'SI',
    ...scenario.scope,
    subjectId: scenario.actor.id,
    observationTick: tick,
    decisionTick: tick,
    profile,
    coverage,
    horizonS: 20,
    discontinuity: false,
    actors: [
      {
        id: scenario.actor.id,
        incarnation: scenario.actor.incarnation,
        active: true,
        observable: true,
        routeKnown: true,
      },
      {
        id: otherActorId,
        incarnation: 2,
        active: true,
        observable: true,
        routeKnown: true,
      },
    ],
    candidates: [{ relationId: 'relation-1', entryS: 1, exitS: 4 }],
    pairs: [
      {
        relationId: 'relation-1',
        otherActorId,
        priority: refused ? 'YIELD' : 'PRIORITY',
        arrival: {
          state: 'APPROACHING',
          timeToEntryS: otherEntryS,
          timeToExitS: otherEntryS + 3,
        },
      },
    ],
  });
}

export interface StopPriorityEvaluationOptions {
  readonly tick?: number;
  readonly opportunityKey?: string;
  readonly rValues?: Partial<Record<StopPriorityPolicyKey, number>>;
  readonly mValues?: Partial<Record<StopPriorityPolicyMKey, number>>;
}
export interface StopPriorityEvaluation {
  readonly command: StopPriorityPolicyCommand;
  readonly stop: StopPolicyDecision;
  readonly yielded: YieldPolicyDecision;
  readonly profile: StopPriorityPolicyProfile;
  readonly decisionTick: number;
  readonly opportunityKey: string;
}
/** Runs the real 051 and 052 layers first, then the 175 layer over their genuine results. */
export function evaluate(
  scene: StopPriorityScene,
  options: StopPriorityEvaluationOptions = {},
): StopPriorityEvaluation {
  const document = stopPriorityDocument(options.rValues, options.mValues),
    profile = compileStopPriorityProfile(document),
    published = parsePublishableDrivingProfile(document),
    stopProfile = projectStopProfile(published),
    yieldProfile = projectYieldProfile(published),
    decisionTick = options.tick ?? scenario.tick,
    opportunityKey = options.opportunityKey ?? blockedEntryOpportunity(0).opportunityKey,
    stop = evaluateStop(scene, stopProfile, decisionTick),
    yielded = evaluateYield(scene, yieldProfile, decisionTick),
    command = evaluateStopPriorityPolicy({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      authority: 'AUTO',
      seed: SEED,
      opportunityKey,
      profile,
      stopDecision: stop,
      yieldDecision: yielded,
      observation: stopPriorityObservation(scene, decisionTick),
    });
  return { command, stop, yielded, profile, decisionTick, opportunityKey };
}

/** The once-per-opportunity sample of the blocked-entry probability key. */
export function blockedEntrySample(opportunityKey: string): number {
  return randomUnit(deriveOpportunitySeed(SEED, opportunityKey), 'blocked-entry', 0);
}
/** First opportunity whose blocked-entry sample satisfies the predicate. */
export function blockedEntryOpportunity(
  from = 0,
  accept: (sample: number) => boolean = (sample) => sample >= 0.2 && sample < 0.49,
): { opportunityKey: string; sample: number; index: number } {
  for (let index = from; index < from + 10000; index++) {
    const opportunityKey = `opportunity-${index}`,
      sample = blockedEntrySample(opportunityKey);
    if (accept(sample)) return { opportunityKey, sample, index };
  }
  throw new Error('No matching blocked-entry opportunity in fixture range');
}
