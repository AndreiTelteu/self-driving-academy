import type { CruiseTarget } from '../../src/autonomy/cruise-targets';
import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import type { LongitudinalResult } from '../../src/autonomy/longitudinal-control';
import type {
  AccelPolicyActuation,
  AccelPolicyInput,
  AccelPolicyKey,
  AccelPolicyObservation,
  AccelPolicyProfile,
} from '../../src/autonomy/accel-policy';
import { compileAccelPolicyProfile, evaluateAccelPolicy } from '../../src/autonomy/accel-policy';
import type { VehicleCommand } from '../../src/vehicles';

/** The 046 M keys the 047 controller keeps reading while the 169 R keys change. */
export const cruiseMValues = Object.freeze({
  speed_delta_urban: 0,
  speed_delta_residential: 0,
  curve_lateral_accel: 2.5,
  intersection_approach_speed: 6,
});
/** The four delivered 047 M keys; 169 only shapes how their request is applied. */
export const longitudinalMValues = Object.freeze({
  desired_acceleration: 1.5,
  comfort_deceleration: 2,
  acceleration_jerk: 2,
  brake_reaction_delay: 0.5,
});
/** Catalog extremes that make every 169 key inert: immediate brake, no hold, full launch, no coast. */
export const neutralAccelValues = Object.freeze({
  braking_jerk: 20,
  throttle_release_delay: 0,
  launch_intensity: 1,
  coasting_bias: 0,
}) satisfies Readonly<Record<AccelPolicyKey, number>>;
/** Independent scenario numbers; the catalog only fixes the admissible ranges. */
export const scene = Object.freeze({
  scope: { sessionId: '169-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 10,
  cruiseSpeedMps: 8,
  launchSpeedMps: 0.5,
  targetMps: 12,
});

const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  speed_delta_urban: 'm/s',
  speed_delta_residential: 'm/s',
  curve_lateral_accel: 'm/s²',
  intersection_approach_speed: 'm/s',
  desired_acceleration: 'm/s²',
  comfort_deceleration: 'm/s²',
  acceleration_jerk: 'm/s³',
  braking_jerk: 'm/s³',
  throttle_release_delay: 's',
  brake_reaction_delay: 's',
  launch_intensity: 'ratio',
  coasting_bias: 'ratio',
});

/** A profile document that carries the 046 M keys, the 047 M keys and the 169 R keys together. */
export function accelProfileDocument(
  rValues: Partial<Record<AccelPolicyKey, number>> = {},
  versionId = '169-fixture-v1',
) {
  const parameters: Record<string, number> = {
    ...cruiseMValues,
    ...longitudinalMValues,
    ...neutralAccelValues,
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
    profileId: '169-fixture',
    versionId,
    parentVersionId: null,
    engineVersion: '169-accel-policy-v1',
    parameters,
    unitsByParameter: units,
    provenanceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, 'BASE'])),
    evidenceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, null])),
    sourceSegmentIds: [],
    createdAt: '2026-11-12T00:00:00Z',
    checksum: `unverified:${versionId}`,
  };
}
export function accelProfile(
  rValues: Partial<Record<AccelPolicyKey, number>> = {},
): AccelPolicyProfile {
  return compileAccelPolicyProfile(accelProfileDocument(rValues));
}
export function commandFixture(
  options: {
    tick?: number;
    throttle?: number;
    brake?: number;
    scope?: BehaviorScope;
    actor?: BehaviorActor;
  } = {},
): VehicleCommand {
  const scope = options.scope ?? scene.scope,
    actor = options.actor ?? scene.actor;
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: scope.sessionId,
    worldEpoch: scope.worldEpoch,
    vehicleId: actor.id,
    tick: options.tick ?? scene.tick,
    throttle: options.throttle ?? 0,
    brake: options.brake ?? 0,
    steering: 0,
    handbrake: false,
    turnSignal: 'OFF',
    source: 'AUTONOMY',
  });
}
/** A genuine-shaped 047 result built for an isolated scenario (the report uses the real 047 too). */
export function longitudinalRequest(
  options: {
    accelerationMps2?: number;
    throttle?: number;
    brake?: number;
    phase?: LongitudinalResult['phase'];
    reason?: string;
    tick?: number;
    targetMps?: number | null;
    profileVersionId?: string | null;
    scope?: BehaviorScope;
    actor?: BehaviorActor;
    brakeEventTick?: number | null;
    reactionTicks?: number;
  } = {},
): LongitudinalResult {
  const accelerationMps2 = options.accelerationMps2 ?? 0,
    targetMps = options.targetMps === undefined ? scene.targetMps : options.targetMps;
  return Object.freeze({
    version: '047-longitudinal-v1',
    command: commandFixture({
      tick: options.tick,
      throttle: options.throttle ?? 0,
      brake: options.brake ?? 0,
      scope: options.scope,
      actor: options.actor,
    }),
    accelerationMps2,
    brakeEventTick: options.brakeEventTick ?? null,
    reactionTicks: options.reactionTicks ?? 0,
    phase: options.phase ?? (accelerationMps2 < 0 ? 'BRAKING' : 'TRACKING'),
    reason: options.reason ?? 'TRACK_TARGET',
    targetMps,
    availableAccelerationMps2: 6,
    profileVersionId: options.profileVersionId ?? '169-fixture-v1',
  });
}
export function accelObservation(
  overrides: Partial<AccelPolicyObservation> = {},
): AccelPolicyObservation {
  return {
    version: '169-observation-v1',
    units: 'SI',
    ...scene.scope,
    actor: scene.actor,
    tick: scene.tick,
    longitudinalSpeedMps: scene.cruiseSpeedMps,
    leadGapM: null,
    leadSpeedMps: null,
    stopRequired: false,
    ...overrides,
  };
}
export function previousActuation(
  overrides: Partial<AccelPolicyActuation> = {},
): AccelPolicyActuation {
  return {
    accelerationMps2: 0,
    throttle: 0,
    brake: 0,
    throttleReleaseTicks: 0,
    ...overrides,
  };
}
export function evaluate(
  profile: AccelPolicyProfile,
  options: {
    offset?: number;
    previous?: Partial<AccelPolicyActuation>;
    request?: Partial<Parameters<typeof longitudinalRequest>[0]>;
    observation?: Partial<AccelPolicyObservation>;
  } = {},
) {
  const observation = accelObservation({
      tick: scene.tick + (options.offset ?? 0),
      ...options.observation,
    }),
    input: AccelPolicyInput = {
      ...scene.scope,
      actor: scene.actor,
      decisionTick: observation.tick,
      authority: 'AUTO',
      profile,
      longitudinal: longitudinalRequest({
        tick: observation.tick,
        ...options.request,
      }),
      observation,
      previous: previousActuation(options.previous),
    };
  return evaluateAccelPolicy(input);
}
/** Runs a fixed request for a number of ticks, feeding the previous actuation back. */
export function simulate(
  profile: AccelPolicyProfile,
  options: {
    ticks: number;
    request?: Partial<Parameters<typeof longitudinalRequest>[0]>;
    observation?: Partial<AccelPolicyObservation>;
    previous?: Partial<AccelPolicyActuation>;
  },
) {
  const rows = [];
  let previous = previousActuation(options.previous);
  for (let index = 0; index < options.ticks; index++) {
    const command = evaluate(profile, {
      offset: index,
      previous,
      request: options.request,
      observation: options.observation,
    });
    rows.push(command);
    previous = command.actuation;
  }
  return rows;
}
/** The 046 target a real 047 controller consumes while 169 filters its result. */
export function cruiseTargetFixture(
  versionId: string,
  options: Partial<CruiseTarget> = {},
): CruiseTarget {
  const decisionTick = options.decisionTick ?? scene.tick,
    targetMps = options.targetMps ?? scene.targetMps;
  return {
    version: '046-cruise-v1',
    ...scene.scope,
    actor: scene.actor,
    decisionTick,
    sourceTick: decisionTick - 1,
    profileVersionId: versionId,
    engineVersion: '169-accel-policy-v1',
    behaviorReason: 'FOLLOW_LANE',
    reason: 'FREE_ROAD',
    targetMps,
    preferredRoadMps: targetMps,
    preferredCurveMps: null,
    preferredApproachMps: null,
    styleTargetMps: targetMps,
    postedDeviationMps: targetMps - 13.9,
    mechanicalCoverageCapMps: 30,
    mechanicalVersion: '031-coverage-046-v1',
    lateralAdvisoryMps: null,
    exceedsLateralAdvisory: false,
    ...options,
  };
}
