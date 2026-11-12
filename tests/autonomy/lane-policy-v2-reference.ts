import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import {
  LANE_CHANGE_EMPTY_STATE,
  LANE_CHANGE_LIMITS,
  evaluateLaneChange,
  projectLaneChangeProfile,
} from '../../src/autonomy/lane-change-policy';
import type { LaneChangeDecision, LaneChangeState } from '../../src/autonomy/lane-change-policy';
import {
  LANE_POLICY_V2_EMPTY_STATE,
  LANE_POLICY_V2_LIMITS,
  compileLanePolicyProfile,
  evaluateLanePolicyV2,
} from '../../src/autonomy/lane-policy-v2';
import type {
  LanePolicyV2AdjacentLane,
  LanePolicyV2Command,
  LanePolicyV2Input,
  LanePolicyV2Key,
  LanePolicyV2MKey,
  LanePolicyV2Observation,
  LanePolicyV2Profile,
  LanePolicyV2State,
} from '../../src/autonomy/lane-policy-v2';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import {
  deriveOpportunitySeed,
  deriveScenarioSeed,
  deriveVehicleSeed,
  randomUnit,
} from '../../src/sessions';

/** The four delivered 053 M keys; the 177 layer reads them and never changes their meaning. */
export const lanePolicyMValues = Object.freeze({
  lane_change_front_gap: 12,
  lane_change_back_gap: 10,
  lane_change_speed_gain: 2,
  lane_change_cooldown: 6,
}) satisfies Readonly<Record<LanePolicyV2MKey, number>>;
/** The most conservative admissible 177 configuration; it reproduces 053 outside its keys. */
export const neutralLanePolicyValues = Object.freeze({
  lane_change_duration: 2,
  signal_lead_time: 0,
  signal_use_probability: 0,
  pass_on_right_probability: 0,
}) satisfies Readonly<Record<LanePolicyV2Key, number>>;
/** Independent scenario identity; the catalog only fixes the admissible ranges. */
export const scenario = Object.freeze({
  scope: { sessionId: '177-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 61,
  profileId: '177-fixture',
  versionId: '177-fixture-v1',
  engineVersion: '177-lane-policy-v2',
});
export const SEED = deriveVehicleSeed(deriveScenarioSeed(177, 'city:one'), 'taxi');

const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  lane_change_front_gap: 'm',
  lane_change_back_gap: 'm',
  lane_change_speed_gain: 'm/s',
  lane_change_cooldown: 's',
  lane_change_duration: 's',
  signal_lead_time: 's',
  signal_use_probability: 'probability',
  pass_on_right_probability: 'probability',
});

/** A profile document that carries the four 053 M keys and the four 177 R keys together. */
export function lanePolicyDocument(
  rValues: Partial<Record<LanePolicyV2Key, number>> = {},
  mValues: Partial<Record<LanePolicyV2MKey, number>> = {},
  versionId: string = scenario.versionId,
) {
  const parameters: Record<string, number> = {
    ...lanePolicyMValues,
    ...mValues,
    ...neutralLanePolicyValues,
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
    createdAt: '2026-11-12T00:00:00.000Z',
    checksum: `unverified:${versionId}`,
  };
}
export function lanePolicyProfile(
  rValues: Partial<Record<LanePolicyV2Key, number>> = {},
  mValues: Partial<Record<LanePolicyV2MKey, number>> = {},
): LanePolicyV2Profile {
  return compileLanePolicyProfile(lanePolicyDocument(rValues, mValues));
}

/** One deterministic lane-change episode: the numbers the world reports for a single tick. */
export interface LanePolicyScene {
  readonly currentLaneId: string;
  readonly lanes: readonly LanePolicyV2AdjacentLane[];
  readonly targetLaneId: string;
  /** The world declares the validated change is an overtaking manoeuvre. */
  readonly overtake: boolean;
  readonly rightOvertake: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN';
  readonly rightLaneSpaceM: number | null;
  readonly coverage: 'COMPLETE' | 'LOCAL_ONLY';
  readonly frontGapM: number | null;
  readonly backGapM: number | null;
  readonly targetLaneSpeedMps: number;
  readonly speedMps: number;
  readonly ownLaneLeaderSpeedMps: number | null;
  readonly intent: 'NONE' | 'OPTIONAL_OVERTAKE';
}
function adjacency(scene: LanePolicyScene) {
  return {
    version: LANE_CHANGE_LIMITS.adjacencyVersion,
    mapId: '177-map',
    currentLaneId: scene.currentLaneId,
    access: 'TAXI',
    neighbors: scene.lanes.map((lane) => ({ laneId: lane.laneId, side: lane.side })),
  } as const;
}
export function lanePolicyObservation(
  scene: LanePolicyScene,
  tick: number = scenario.tick,
): LanePolicyV2Observation {
  return {
    version: LANE_POLICY_V2_LIMITS.observationVersion,
    units: 'SI',
    ...scenario.scope,
    actor: scenario.actor,
    tick,
    currentLaneId: scene.currentLaneId,
    adjacentLanes: scene.lanes,
    overtake: scene.overtake,
    rightOvertake: scene.rightOvertake,
    rightLaneSpaceM: scene.rightLaneSpaceM,
  };
}
/** Runs the real 053 layer for the scene with an explicit caller-held 053 latch. */
export function evaluateLaneChange053(
  scene: LanePolicyScene,
  profile: ReturnType<typeof projectLaneChangeProfile> | null,
  tick: number = scenario.tick,
  state: LaneChangeState = LANE_CHANGE_EMPTY_STATE,
): LaneChangeDecision {
  return evaluateLaneChange({
    ...scenario.scope,
    actor: scenario.actor,
    decisionTick: tick,
    profile,
    state,
    adjacency: adjacency(scene),
    observation: {
      version: LANE_CHANGE_LIMITS.observationVersion,
      units: 'SI',
      tick,
      targetLaneId: scene.targetLaneId,
      coverage: scene.coverage,
      frontGapM: scene.frontGapM,
      backGapM: scene.backGapM,
      targetLaneSpeedMps: scene.targetLaneSpeedMps,
    },
    speedMps: scene.speedMps,
    ownLaneLeaderSpeedMps: scene.ownLaneLeaderSpeedMps,
    intent: scene.intent,
  });
}

export interface LanePolicyEvaluationOptions {
  readonly tick?: number;
  readonly opportunityKey?: string;
  readonly rValues?: Partial<Record<LanePolicyV2Key, number>>;
  readonly mValues?: Partial<Record<LanePolicyV2MKey, number>>;
  readonly state?: LanePolicyV2State;
  /** 053 latch fed to the delivered layer; empty state produces a fresh validation. */
  readonly laneChangeState?: LaneChangeState;
  /** Replaces the 053 result, used to feed a continuity or a refusal explicitly. */
  readonly laneChange?: unknown;
}
export interface LanePolicyEvaluation {
  readonly command: LanePolicyV2Command;
  readonly change: LaneChangeDecision;
  readonly profile: LanePolicyV2Profile;
  readonly decisionTick: number;
  readonly opportunityKey: string;
  readonly input: LanePolicyV2Input;
}
/** Runs the real 053 layer first, then the 177 layer over its genuine result. */
export function evaluate(
  scene: LanePolicyScene,
  options: LanePolicyEvaluationOptions = {},
): LanePolicyEvaluation {
  const document = lanePolicyDocument(options.rValues, options.mValues),
    profile = compileLanePolicyProfile(document),
    published = parsePublishableDrivingProfile(document),
    decisionTick = options.tick ?? scenario.tick,
    opportunityKey = options.opportunityKey ?? laneOpportunity(0).opportunityKey,
    change =
      options.laneChange === undefined
        ? evaluateLaneChange053(
            scene,
            projectLaneChangeProfile(published),
            decisionTick,
            options.laneChangeState,
          )
        : options.laneChange,
    input: LanePolicyV2Input = {
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      authority: 'AUTO',
      seed: SEED,
      opportunityKey,
      profile,
      laneChange: change,
      observation: lanePolicyObservation(scene, decisionTick),
      state: options.state ?? LANE_POLICY_V2_EMPTY_STATE,
    };
  return {
    command: evaluateLanePolicyV2(input),
    change: change as LaneChangeDecision,
    profile,
    decisionTick,
    opportunityKey,
    input,
  };
}

export interface LanePolicyRunOptions extends LanePolicyEvaluationOptions {
  readonly ticks: number;
  readonly stopWhen?: (command: LanePolicyV2Command) => boolean;
}
/**
 * Advances the layer over consecutive ticks, carrying its own latch and feeding the delivered 053
 * layer a fresh validation every tick (the caller rule the contract documents).
 */
export function run(
  scene: LanePolicyScene,
  options: LanePolicyRunOptions,
): { readonly commands: readonly LanePolicyV2Command[]; readonly state: LanePolicyV2State } {
  const commands: LanePolicyV2Command[] = [];
  let state = options.state ?? LANE_POLICY_V2_EMPTY_STATE;
  for (let index = 0; index < options.ticks; index++) {
    const row = evaluate(scene, {
      tick: (options.tick ?? scenario.tick) + index,
      opportunityKey: options.opportunityKey,
      rValues: options.rValues,
      mValues: options.mValues,
      state,
      laneChangeState: options.laneChangeState,
      laneChange: options.laneChange,
    });
    commands.push(row.command);
    state = row.command.state;
    if (options.stopWhen?.(row.command)) break;
  }
  return { commands, state };
}

export interface LanePolicyProgress {
  readonly started: LanePolicyV2Command;
  readonly progress: number;
  readonly durationTicks: number;
}
/**
 * Starts the manoeuvre on the same scene and reports the lateral progress after `advanceTicks`
 * ticks, so a duration comparison is measured from the manoeuvre start and not from the decision.
 */
export function progressAfterStart(
  scene: LanePolicyScene,
  options: {
    readonly rValues?: Partial<Record<LanePolicyV2Key, number>>;
    readonly advanceTicks: number;
  },
): LanePolicyProgress {
  const started = run(scene, {
      rValues: options.rValues,
      ticks: 400,
      stopWhen: (command) => command.action === 'LANE_CHANGE',
    }),
    command = started.commands[started.commands.length - 1];
  if (command === undefined || command.action !== 'LANE_CHANGE')
    throw new Error('Fixture scene never started a lane change');
  const advanced =
    options.advanceTicks === 0
      ? command
      : (() => {
          const rows = run(scene, {
            rValues: options.rValues,
            state: started.state,
            tick: scenario.tick + started.commands.length,
            ticks: options.advanceTicks,
          });
          return rows.commands[rows.commands.length - 1] ?? command;
        })();
  return {
    started: command,
    progress: advanced.lateralProgress ?? 0,
    durationTicks: command.manoeuvreDurationTicks ?? 0,
  };
}

/** The once-per-opportunity sample of the indicator key. */
export function signalUseSample(opportunityKey: string): number {
  return randomUnit(deriveOpportunitySeed(SEED, opportunityKey), 'signal-use', 0);
}
/** The once-per-opportunity sample of the right-side pass key. */
export function rightPassSample(opportunityKey: string): number {
  return randomUnit(deriveOpportunitySeed(SEED, opportunityKey), 'pass-on-right', 0);
}
function opportunity(
  from: number,
  accept: (signal: number, pass: number) => boolean,
): { opportunityKey: string; signalSample: number; passSample: number; index: number } {
  for (let index = from; index < from + 10000; index++) {
    const opportunityKey = `opportunity-${index}`,
      signalSample = signalUseSample(opportunityKey),
      passSample = rightPassSample(opportunityKey);
    if (accept(signalSample, passSample))
      return { opportunityKey, signalSample, passSample, index };
  }
  throw new Error('No matching lane-policy opportunity in fixture range');
}
/** Indicator sample low enough to stay below a 0.5 key and above zero. */
export function laneOpportunity(from = 0) {
  return opportunity(from, (signal) => signal >= 0.2 && signal < 0.49);
}
/** Right-side pass sample inside (0.2, 0.49), so key 0 refuses and key 1 grants. */
export function rightPassOpportunity(from = 0) {
  return opportunity(from, (_signal, pass) => pass >= 0.2 && pass < 0.49);
}
