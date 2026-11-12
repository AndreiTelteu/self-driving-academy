import type { CruiseTarget } from '../../src/autonomy/cruise-targets';
import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import type {
  SpeedPolicyInput,
  SpeedPolicyKey,
  SpeedPolicyObservation,
  SpeedPolicyProfile,
} from '../../src/autonomy/speed-policy';
import { compileSpeedPolicyProfile, evaluateSpeedPolicy } from '../../src/autonomy/speed-policy';

export const speedMKeys = [
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
] as const;
export const speedMValues = [0, 0, 2.5, 6] as const;
export const neutralSpeedValues = Object.freeze({
  speed_delta_arterial: 0,
  cruise_speed_variability: 0,
  overtake_speed_bonus: 0,
  cruise_accel_deadband: 0.05,
}) satisfies Readonly<Record<SpeedPolicyKey, number>>;
/** Independent scenario numbers; the catalog only fixes the admissible ranges. */
export const scene = Object.freeze({
  scope: { sessionId: '167-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 10,
  postedLimitMps: 13.9,
  urbanTargetMps: 10.9,
});

/** A profile document that carries the four 046 M keys and the four 167 R keys together. */
export function speedProfileDocument(
  mValues: readonly number[] = speedMValues,
  rValues: Partial<Record<SpeedPolicyKey, number>> = {},
  versionId = '167-fixture-v1',
) {
  const parameters: Record<string, number> = {
    speed_delta_urban: mValues[0],
    speed_delta_residential: mValues[1],
    curve_lateral_accel: mValues[2],
    intersection_approach_speed: mValues[3],
    ...neutralSpeedValues,
    ...rValues,
  };
  const units: Record<string, string> = Object.fromEntries(
    Object.keys(parameters).map((key) => [key, key === 'curve_lateral_accel' ? 'm/s²' : 'm/s']),
  );
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: '167-fixture',
    versionId,
    parentVersionId: null,
    engineVersion: '167-speed-policy-v1',
    parameters,
    unitsByParameter: units,
    provenanceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, 'BASE'])),
    evidenceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, null])),
    sourceSegmentIds: [],
    createdAt: '2026-11-12T00:00:00Z',
    checksum: `unverified:${versionId}`,
  };
}
export function speedProfile(
  rValues: Partial<Record<SpeedPolicyKey, number>> = {},
  mValues: readonly number[] = speedMValues,
): SpeedPolicyProfile {
  return compileSpeedPolicyProfile(speedProfileDocument(mValues, rValues));
}
export function cruiseTargetFixture(overrides: Partial<CruiseTarget> = {}): CruiseTarget {
  const decisionTick = overrides.decisionTick ?? scene.tick,
    targetMps = overrides.targetMps ?? scene.urbanTargetMps;
  return {
    version: '046-cruise-v1',
    ...scene.scope,
    actor: scene.actor,
    decisionTick,
    sourceTick: decisionTick - 1,
    profileVersionId: '167-fixture-v1',
    engineVersion: '167-speed-policy-v1',
    behaviorReason: 'FOLLOW_LANE',
    reason: 'FREE_ROAD',
    targetMps,
    preferredRoadMps: targetMps,
    preferredCurveMps: null,
    preferredApproachMps: null,
    styleTargetMps: targetMps,
    postedDeviationMps: targetMps - scene.postedLimitMps,
    mechanicalCoverageCapMps: 30,
    mechanicalVersion: '031-coverage-046-v1',
    lateralAdvisoryMps: null,
    exceedsLateralAdvisory: false,
    ...overrides,
  };
}
export function speedObservation(
  overrides: Partial<SpeedPolicyObservation> = {},
): SpeedPolicyObservation {
  return {
    version: '167-observation-v1',
    units: 'SI',
    ...scene.scope,
    actor: scene.actor,
    tick: scene.tick,
    longitudinalSpeedMps: 0,
    roadKind: 'URBAN',
    postedLimitMps: scene.postedLimitMps,
    leadGapM: null,
    leadSpeedMps: null,
    stopRequired: false,
    overtaking: false,
    ...overrides,
  };
}
/** Rate of target changes and peak-to-peak amplitude over one full variability period. */
export function sweep(profile: SpeedPolicyProfile, ticks = 600) {
  const values: number[] = [];
  let previousCommittedMps: number | null = null;
  for (let offset = 0; offset < ticks; offset++) {
    const command = evaluate(profile, { offset, previousCommittedMps });
    values.push(command.committedTargetMps);
    previousCommittedMps = command.committedTargetMps;
  }
  let changes = 0;
  for (let index = 1; index < values.length; index++)
    if (values[index] !== values[index - 1]) changes++;
  return {
    changes,
    peakToPeakMps: Math.max(...values) - Math.min(...values),
    minimumMps: Math.min(...values),
    maximumMps: Math.max(...values),
  };
}

export function evaluate(
  profile: SpeedPolicyProfile,
  options: {
    offset?: number;
    previousCommittedMps?: number | null;
    seed?: number;
    target?: CruiseTarget | null;
    observation?: Partial<SpeedPolicyObservation>;
  } = {},
) {
  const observation = speedObservation({
      tick: scene.tick + (options.offset ?? 0),
      ...options.observation,
    }),
    input: SpeedPolicyInput = {
      ...scene.scope,
      actor: scene.actor,
      decisionTick: observation.tick,
      authority: 'AUTO',
      profile,
      target:
        options.target === undefined
          ? cruiseTargetFixture({ decisionTick: observation.tick })
          : options.target,
      observation,
      seed: options.seed ?? 167,
      previousCommittedMps: options.previousCommittedMps ?? null,
    };
  return evaluateSpeedPolicy(input);
}
