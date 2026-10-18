import { number, tick, requireContract } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { captureLongitudinalProfileData, compileLongitudinalProfile } from './longitudinal-control';
import type { LongitudinalProfile } from './longitudinal-control';
import { evaluateCruiseTarget } from './cruise-targets';
import type { CruiseInput, CruiseTarget } from './cruise-targets';
import { projectBehaviorContext, parseBehaviorContext } from './behavior-fsm';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';
import type { RoadContext } from './road-context';

export const FOLLOWING_KEYS = Object.freeze([
  'following_time_headway',
  'following_min_gap',
  'queue_standstill_gap',
  'following_speed_gain',
] as const);
export type FollowingKey = (typeof FOLLOWING_KEYS)[number];
export const FOLLOWING_LIMITS = Object.freeze({
  version: '048-following-v1' as const,
  observationVersion: '048-observation-v1' as const,
  standstillMps: 0.1,
  speedResponseHorizonS: 1,
  retainedActors: 0,
  retainedHistory: 0,
});
export interface FollowingProfile {
  readonly version: '048-following-v1';
  readonly longitudinal: LongitudinalProfile;
  readonly values: Readonly<Record<FollowingKey, number>>;
  readonly units: Readonly<Record<FollowingKey, ParameterUnit>>;
  readonly provenance: Readonly<Record<FollowingKey, string>>;
}
export interface FollowingObservation extends BehaviorScope {
  readonly version: '048-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly longitudinalSpeedMps: number;
}
export interface FollowingInput {
  readonly cruiseInput: CruiseInput;
  readonly roadContext: RoadContext | null;
  readonly observation: FollowingObservation;
  readonly profile: FollowingProfile | null;
}
export interface FollowingTarget {
  readonly version: '048-following-v1';
  readonly target: CruiseTarget;
  readonly reason: string;
  readonly leader: BehaviorActor | null;
  readonly gapM: number | null;
  readonly desiredGapM: number | null;
  readonly preferredFollowingMps: number | null;
}
const profiles = new WeakSet<object>();
let compiling = false;
export function compileFollowingProfile(input: unknown): FollowingProfile {
  requireContract(!compiling, 'Reentrant following compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      longitudinal = compileLongitudinalProfile(detached);
    const values = {} as Record<FollowingKey, number>,
      units = {} as Record<FollowingKey, ParameterUnit>,
      provenance = {} as Record<FollowingKey, string>;
    for (const key of FOLLOWING_KEYS) {
      requireContract(Object.hasOwn(published.parameters, key), 'Missing following parameter');
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    const result = Object.freeze({
      version: FOLLOWING_LIMITS.version,
      longitudinal,
      values: Object.freeze(values),
      units: Object.freeze(units),
      provenance: Object.freeze(provenance),
    });
    profiles.add(result);
    return result;
  } finally {
    compiling = false;
  }
}
function id(value: unknown): string {
  requireContract(
    typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value,
    'Invalid following identity',
  );
  return value;
}
function actor(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: id(data.id), incarnation: tick(data.incarnation) });
}
function same(a: BehaviorActor, b: BehaviorActor) {
  return a.id === b.id && a.incarnation === b.incarnation;
}
/** Capacity/prototype checked before any value capture. Only requested data descriptors are read. */
function fields(
  value: unknown,
  names: readonly string[],
  maximum = names.length,
  exact = true,
): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Following plain object',
  );
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    'Following plain prototype',
  );
  const keys = Reflect.ownKeys(value);
  requireContract(
    keys.length <= maximum &&
      (!exact || keys.length === names.length) &&
      keys.every((k) => typeof k === 'string' && (!exact || names.includes(k))),
    'Following schema/capacity',
  );
  const result: Record<string, unknown> = Object.create(null);
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(value, name);
    requireContract(
      d !== undefined && 'value' in d && d.enumerable === true,
      'Following data field',
    );
    result[name] = d.value;
  }
  return result;
}
/** Stateless048 policy; caller owns freshness, actor admission and once-per-tick047 realization. */
export function evaluateFollowingTarget(input: FollowingInput): FollowingTarget {
  const data = fields(input, ['cruiseInput', 'roadContext', 'observation', 'profile']);
  requireContract(
    data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
    'Following profile token provenance',
  );
  const profile = data.profile as FollowingProfile | null;
  // Actual046 admission owns authority, decision/fact bindings, mechanical coverage and profile token.
  const cruiseData = fields(data.cruiseInput, [
    'sessionId',
    'worldEpoch',
    'actor',
    'decisionTick',
    'authority',
    'profile',
    'context',
    'behavior',
    'facts',
    'mechanics',
  ]);
  const context = cruiseData.context === null ? null : parseBehaviorContext(cruiseData.context);
  cruiseData.context = context;
  const cruise = evaluateCruiseTarget(cruiseData);
  let target = cruise,
    reason = cruise.reason,
    leader: BehaviorActor | null = null,
    gapM: number | null = null,
    desiredGapM: number | null = null,
    preferredFollowingMps: number | null = null;
  const observation = fields(data.observation, [
    'version',
    'units',
    'sessionId',
    'worldEpoch',
    'actor',
    'tick',
    'longitudinalSpeedMps',
  ]);
  requireContract(
    observation.version === FOLLOWING_LIMITS.observationVersion && observation.units === 'SI',
    'Following observation version/units',
  );
  const observedActor = actor(observation.actor),
    observedTick = tick(observation.tick),
    sessionId = id(observation.sessionId),
    worldEpoch = tick(observation.worldEpoch),
    speed = number(observation.longitudinalSpeedMps, -100, 100);
  const road =
    data.roadContext === null
      ? null
      : fields(
          data.roadContext,
          [
            'sessionId',
            'worldEpoch',
            'tick',
            'subject',
            'laneId',
            'leader',
            'completeness',
            'discontinuity',
          ],
          32,
          false,
        );
  if (road !== null) {
    road.subject = actor(road.subject);
    road.completeness = fields(road.completeness, ['vehicles', 'obstacles', 'zones', 'signals']);
    if (road.leader !== null)
      road.leader = fields(road.leader, ['id', 'incarnation', 'gapM', 'speedMps']);
  }
  const projected = projectBehaviorContext(road as unknown as RoadContext | null);
  const usable = [
    'FREE_ROAD',
    'MECHANICAL_COVERAGE_CAP',
    'INTERSECTION_APPROACH',
    'CURVE_PREFERENCE',
  ].includes(cruise.reason);
  if (!usable) {
    /* Preserve046's diagnostic/stop target and discard all leader fields. */
  } else if (profile === null) reason = 'MISSING_FOLLOWING_PROFILE';
  else if (
    profile.longitudinal.versionId !== cruise.profileVersionId ||
    profile.longitudinal.engineVersion !== cruise.engineVersion
  )
    reason = 'FOLLOWING_PROFILE_MISMATCH';
  else if (
    !same(observedActor, cruise.actor) ||
    observedTick !== cruise.decisionTick ||
    sessionId !== cruise.sessionId ||
    worldEpoch !== cruise.worldEpoch
  )
    reason = 'FOREIGN_OR_STALE_FOLLOWING_OBSERVATION';
  else if (projected === null) reason = 'MISSING_FOLLOWING_CONTEXT';
  else if (
    projected.sessionId !== cruise.sessionId ||
    projected.worldEpoch !== cruise.worldEpoch ||
    !same(projected.subject, cruise.actor) ||
    projected.sourceTick !== cruise.sourceTick ||
    projected.discontinuity ||
    !projected.vehiclesComplete ||
    projected.laneId === null
  )
    reason = 'FOREIGN_OR_STALE_FOLLOWING_CONTEXT';
  else {
    if (
      context === null ||
      projected.leaderId !== context.leaderId ||
      projected.laneId !== context.laneId
    )
      reason = 'FOLLOWING_CONTEXT_MISMATCH';
    else if (projected.leaderId === null) reason = 'NO_LEADER';
    else {
      const fieldsLeader = road!.leader as Record<string, unknown>;
      leader = actor({ id: fieldsLeader.id, incarnation: fieldsLeader.incarnation });
      gapM = number(fieldsLeader.gapM, 0, 100000);
      const leaderSpeed = number(fieldsLeader.speedMps, 0, 100),
        egoSpeed = Math.max(0, speed),
        values = profile.values;
      desiredGapM =
        leaderSpeed <= FOLLOWING_LIMITS.standstillMps
          ? values.queue_standstill_gap
          : values.following_min_gap + values.following_time_headway * egoSpeed;
      preferredFollowingMps = Math.max(
        0,
        egoSpeed +
          values.following_speed_gain *
            (leaderSpeed - egoSpeed) *
            FOLLOWING_LIMITS.speedResponseHorizonS +
          values.following_speed_gain * (gapM - desiredGapM),
      );
      const targetMps = Math.min(cruise.targetMps, preferredFollowingMps);
      reason = leaderSpeed <= FOLLOWING_LIMITS.standstillMps ? 'QUEUE_GAP' : 'FOLLOWING_GAP';
      target = Object.freeze({
        ...cruise,
        reason: 'FOLLOWING_PREFERENCE',
        targetMps,
        postedDeviationMps:
          cruise.postedDeviationMps === null
            ? null
            : cruise.postedDeviationMps + targetMps - cruise.targetMps,
        exceedsLateralAdvisory:
          cruise.lateralAdvisoryMps !== null && targetMps > cruise.lateralAdvisoryMps,
      });
    }
  }
  if (reason !== cruise.reason && !['NO_LEADER', 'QUEUE_GAP', 'FOLLOWING_GAP'].includes(reason))
    target = Object.freeze({
      ...cruise,
      reason,
      targetMps: 0,
      postedDeviationMps: null,
      exceedsLateralAdvisory: false,
    });
  return Object.freeze({
    version: FOLLOWING_LIMITS.version,
    target,
    reason,
    leader,
    gapM,
    desiredGapM,
    preferredFollowingMps,
  });
}
