import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import {
  FOLLOW_POLICY_LIMITS,
  compileFollowPolicyProfile,
  evaluateFollowPolicy,
} from '../../src/autonomy/follow-policy';
import type {
  FollowPolicyCommand,
  FollowPolicyInput,
  FollowPolicyKey,
  FollowPolicyObservation,
  FollowPolicyProfile,
  FollowPolicyState,
} from '../../src/autonomy/follow-policy';

/** The 046 M keys the cruise layer keeps reading while the 171 R keys change. */
export const cruiseMValues = Object.freeze({
  speed_delta_urban: 0,
  speed_delta_residential: 0,
  curve_lateral_accel: 2.5,
  intersection_approach_speed: 6,
});
/** The four delivered 047 M keys; 171 never touches them. */
export const longitudinalMValues = Object.freeze({
  desired_acceleration: 1.5,
  comfort_deceleration: 2,
  acceleration_jerk: 2,
  brake_reaction_delay: 0.5,
});
/** The four delivered 048 M keys that own the following preference 171 shapes. */
export const followingMValues = Object.freeze({
  following_time_headway: 1.8,
  following_min_gap: 3,
  queue_standstill_gap: 2,
  following_speed_gain: 0.7,
});
/** Catalog extremes that make every 171 key inert in the integration scene. */
export const neutralFollowValues = Object.freeze({
  cutin_brake_response: 1,
  closing_ttc_threshold: 0.3,
  leader_change_delay: 0,
  following_hysteresis: 0,
}) satisfies Readonly<Record<FollowPolicyKey, number>>;
/** Independent scenario numbers; the catalog only fixes the admissible ranges. */
export const scenario = Object.freeze({
  scope: { sessionId: '171-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 10,
  profileId: '171-fixture',
  versionId: '171-fixture-v1',
  engineVersion: '171-follow-policy-v1',
});

const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  speed_delta_urban: 'm/s',
  speed_delta_residential: 'm/s',
  curve_lateral_accel: 'm/s²',
  intersection_approach_speed: 'm/s',
  desired_acceleration: 'm/s²',
  comfort_deceleration: 'm/s²',
  acceleration_jerk: 'm/s³',
  brake_reaction_delay: 's',
  following_time_headway: 's',
  following_min_gap: 'm',
  queue_standstill_gap: 'm',
  following_speed_gain: '1/s',
  cutin_brake_response: 'ratio',
  closing_ttc_threshold: 's',
  leader_change_delay: 's',
  following_hysteresis: 'm',
});

/** A profile document that carries the 046, 047 and 048 M keys and the 171 R keys together. */
export function followProfileDocument(
  rValues: Partial<Record<FollowPolicyKey, number>> = {},
  versionId: string = scenario.versionId,
) {
  const parameters: Record<string, number> = {
    ...cruiseMValues,
    ...longitudinalMValues,
    ...followingMValues,
    ...neutralFollowValues,
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
export function followProfile(
  rValues: Partial<Record<FollowPolicyKey, number>> = {},
): FollowPolicyProfile {
  return compileFollowPolicyProfile(followProfileDocument(rValues));
}

/** One deterministic following episode: the numbers the world reports for a single tick. */
export interface FollowScene {
  readonly egoSpeed: number;
  readonly leadGap: number | null;
  readonly leadSpeed: number | null;
  readonly leaderId?: string | null;
  readonly leaderIncarnation?: number | null;
  readonly cutIn?: boolean;
  readonly stopRequired?: boolean;
  /** The 046 target that caps the 048 preference in this scene. */
  readonly cruiseTargetMps?: number;
}

/** The 048 arithmetic from the delivered contract, used to shape a genuine fixture result. */
export function followingNumbers(values: Readonly<Record<string, number>>, input: FollowScene) {
  const ego = Math.max(0, input.egoSpeed),
    gap = input.leadGap ?? 0,
    lead = input.leadSpeed ?? 0,
    desiredGapM =
      lead <= 0.1
        ? values.queue_standstill_gap
        : values.following_min_gap + values.following_time_headway * ego,
    preferredFollowingMps = Math.max(
      0,
      ego +
        values.following_speed_gain * (lead - ego) +
        values.following_speed_gain * (gap - desiredGapM),
    );
  return {
    desiredGapM,
    preferredFollowingMps,
    targetMps: Math.min(input.cruiseTargetMps ?? 16, preferredFollowingMps),
    reason: lead <= 0.1 ? 'QUEUE_GAP' : 'FOLLOWING_GAP',
  };
}

/** A 048-shaped result for one tick; the 048 formula and profile versions are preserved. */
export function followingFixture(
  input: FollowScene,
  options: { tick?: number; values?: Readonly<Record<string, number>> } = {},
) {
  const tick = options.tick ?? scenario.tick,
    values = options.values ?? followingMValues,
    numbers = followingNumbers(values, input),
    leader =
      input.leadGap === null || input.leaderId === null
        ? null
        : {
            id: input.leaderId ?? 'leader',
            incarnation: input.leaderIncarnation ?? tick,
          };
  return {
    version: '048-following-v1' as const,
    target: {
      version: '046-cruise-v1' as const,
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick: tick,
      sourceTick: tick - 1,
      profileVersionId: scenario.versionId,
      engineVersion: scenario.engineVersion,
      behaviorReason: 'FOLLOW_LANE',
      reason: 'FOLLOWING_PREFERENCE',
      targetMps: numbers.targetMps,
      preferredRoadMps: input.cruiseTargetMps ?? 16,
      preferredCurveMps: null,
      preferredApproachMps: null,
      styleTargetMps: input.cruiseTargetMps ?? 16,
      postedDeviationMps: numbers.targetMps - 13.9,
      mechanicalCoverageCapMps: 30 as const,
      mechanicalVersion: '031-coverage-046-v1' as const,
      lateralAdvisoryMps: null,
      exceedsLateralAdvisory: false,
    },
    reason: numbers.reason,
    leader,
    gapM: leader === null ? null : input.leadGap,
    desiredGapM: leader === null ? null : numbers.desiredGapM,
    preferredFollowingMps: leader === null ? null : numbers.preferredFollowingMps,
  };
}
export function followObservation(
  input: FollowScene,
  tick: number = scenario.tick,
): FollowPolicyObservation {
  const leaderId =
    input.leadGap === null || input.leaderId === null ? null : (input.leaderId ?? 'leader');
  return {
    version: FOLLOW_POLICY_LIMITS.observationVersion,
    units: 'SI',
    ...scenario.scope,
    actor: scenario.actor,
    tick,
    longitudinalSpeedMps: input.egoSpeed,
    leaderId,
    leaderIncarnation: leaderId === null ? null : (input.leaderIncarnation ?? tick),
    leadGapM: leaderId === null ? null : input.leadGap,
    leadSpeedMps: leaderId === null ? null : input.leadSpeed,
    cutIn: input.cutIn ?? false,
    stopRequired: input.stopRequired ?? false,
  };
}
export function state(overrides: Partial<FollowPolicyState> = {}): FollowPolicyState {
  return {
    leaderId: null,
    leaderIncarnation: null,
    committedTargetMps: null,
    leaderHoldTicks: 0,
    ...overrides,
  };
}
export function evaluate(
  profile: FollowPolicyProfile,
  input: FollowScene,
  options: { tick?: number; state?: FollowPolicyState; offset?: number } = {},
) {
  const tick = (options.tick ?? scenario.tick) + (options.offset ?? 0),
    request: FollowPolicyInput = {
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick: tick,
      authority: 'AUTO',
      profile,
      following: followingFixture(input, { tick }),
      observation: followObservation(input, tick),
      previous: options.state ?? state(),
    };
  return evaluateFollowPolicy(request);
}
/** Runs a fixed sequence of scenes, feeding the returned state back into the next tick. */
export function run(
  profile: FollowPolicyProfile,
  scenes: readonly FollowScene[],
  options: { initial?: FollowPolicyState; tick?: number } = {},
): FollowPolicyCommand[] {
  const rows: FollowPolicyCommand[] = [];
  let current = options.initial ?? state();
  for (let index = 0; index < scenes.length; index++) {
    const command = evaluate(profile, scenes[index], {
      offset: index,
      tick: options.tick ?? scenario.tick,
      state: current,
    });
    rows.push(command);
    current = command.state;
  }
  return rows;
}
