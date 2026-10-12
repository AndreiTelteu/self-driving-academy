import { number, tick, boolean, requireContract } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { captureLongitudinalProfileData, compileLongitudinalProfile } from './longitudinal-control';
import type { LongitudinalProfile } from './longitudinal-control';
import { evaluateCruiseTarget } from './cruise-targets';
import type { CruiseInput, CruiseTarget } from './cruise-targets';
import type { BehaviorActor, BehaviorScope, BehaviorContext } from './behavior-fsm';
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
let evaluating = false;
const rootFields = new Set(['cruiseInput', 'roadContext', 'observation', 'profile']);
const cruiseFields = new Set([
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
const contextFields = new Set([
  'sessionId',
  'worldEpoch',
  'sourceTick',
  'subject',
  'laneId',
  'leaderId',
  'vehiclesComplete',
  'discontinuity',
]);
const observationFields = new Set([
  'version',
  'units',
  'sessionId',
  'worldEpoch',
  'actor',
  'tick',
  'longitudinalSpeedMps',
]);
const roadFields = new Set([
  'sessionId',
  'worldEpoch',
  'tick',
  'subject',
  'laneId',
  'leader',
  'completeness',
  'discontinuity',
]);
const completenessFields = new Set(['vehicles', 'obstacles', 'zones', 'signals']);
const leaderFields = new Set(['id', 'incarnation', 'gapM', 'speedMps']);
const actorFields = new Set(['id', 'incarnation']);
// Private own properties have stable shapes. No sink is exposed or retained by a result.
const rootScratch: Record<string, unknown> = {
  cruiseInput: undefined,
  roadContext: undefined,
  observation: undefined,
  profile: undefined,
};
const cruiseScratch: Record<string, unknown> = {
  sessionId: undefined,
  worldEpoch: undefined,
  actor: undefined,
  decisionTick: undefined,
  authority: undefined,
  profile: undefined,
  context: undefined,
  behavior: undefined,
  facts: undefined,
  mechanics: undefined,
};
const contextScratch: Record<string, unknown> = {
  sessionId: undefined,
  worldEpoch: undefined,
  sourceTick: undefined,
  subject: undefined,
  laneId: undefined,
  leaderId: undefined,
  vehiclesComplete: undefined,
  discontinuity: undefined,
};
const observationScratch: Record<string, unknown> = {
  version: undefined,
  units: undefined,
  sessionId: undefined,
  worldEpoch: undefined,
  actor: undefined,
  tick: undefined,
  longitudinalSpeedMps: undefined,
};
const roadScratch: Record<string, unknown> = {
  sessionId: undefined,
  worldEpoch: undefined,
  tick: undefined,
  subject: undefined,
  laneId: undefined,
  leader: undefined,
  completeness: undefined,
  discontinuity: undefined,
};
const completenessScratch: Record<string, unknown> = {
  vehicles: undefined,
  obstacles: undefined,
  zones: undefined,
  signals: undefined,
};
const leaderScratch: Record<string, unknown> = {
  id: undefined,
  incarnation: undefined,
  gapM: undefined,
  speedMps: undefined,
};
const actorScratch: Record<string, unknown> = { id: undefined, incarnation: undefined };
const sinks = [
  [rootScratch, rootFields],
  [cruiseScratch, cruiseFields],
  [contextScratch, contextFields],
  [observationScratch, observationFields],
  [roadScratch, roadFields],
  [completenessScratch, completenessFields],
  [leaderScratch, leaderFields],
  [actorScratch, actorFields],
] as const;
export function getFollowingStats() {
  let scratchRetainedFields = 0;
  for (const [sink, names] of sinks)
    for (const name of names) if (sink[name] !== undefined) scratchRetainedFields++;
  return Object.freeze({
    evaluating,
    scratchRetainedFields,
    retainedActors: 0,
    retainedHistory: 0,
    scratchCapacity: 47,
  });
}
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
  const data = fields(value, actorFields, actorScratch);
  return Object.freeze({ id: id(data.id), incarnation: tick(data.incarnation) });
}
function same(a: BehaviorActor, b: BehaviorActor) {
  return a.id === b.id && a.incarnation === b.incarnation;
}
/** Capacity/prototype checked before any value capture. Only requested data descriptors are read. */
function fields(
  value: unknown,
  names: ReadonlySet<string>,
  result: Record<string, unknown>,
  maximum = names.size,
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
    keys.length <= maximum && (!exact || keys.length === names.size),
    'Following schema/capacity',
  );
  for (const key of keys)
    requireContract(typeof key === 'string' && (!exact || names.has(key)), 'Following schema key');
  if (names === rootFields) {
    result.cruiseInput = dataValue(value, 'cruiseInput');
    result.roadContext = dataValue(value, 'roadContext');
    result.observation = dataValue(value, 'observation');
    result.profile = dataValue(value, 'profile');
  } else if (names === cruiseFields) {
    result.sessionId = dataValue(value, 'sessionId');
    result.worldEpoch = dataValue(value, 'worldEpoch');
    result.actor = dataValue(value, 'actor');
    result.decisionTick = dataValue(value, 'decisionTick');
    result.authority = dataValue(value, 'authority');
    result.profile = dataValue(value, 'profile');
    result.context = dataValue(value, 'context');
    result.behavior = dataValue(value, 'behavior');
    result.facts = dataValue(value, 'facts');
    result.mechanics = dataValue(value, 'mechanics');
  } else if (names === contextFields) {
    result.sessionId = dataValue(value, 'sessionId');
    result.worldEpoch = dataValue(value, 'worldEpoch');
    result.sourceTick = dataValue(value, 'sourceTick');
    result.subject = dataValue(value, 'subject');
    result.laneId = dataValue(value, 'laneId');
    result.leaderId = dataValue(value, 'leaderId');
    result.vehiclesComplete = dataValue(value, 'vehiclesComplete');
    result.discontinuity = dataValue(value, 'discontinuity');
  } else if (names === observationFields) {
    result.version = dataValue(value, 'version');
    result.units = dataValue(value, 'units');
    result.sessionId = dataValue(value, 'sessionId');
    result.worldEpoch = dataValue(value, 'worldEpoch');
    result.actor = dataValue(value, 'actor');
    result.tick = dataValue(value, 'tick');
    result.longitudinalSpeedMps = dataValue(value, 'longitudinalSpeedMps');
  } else if (names === roadFields) {
    result.sessionId = dataValue(value, 'sessionId');
    result.worldEpoch = dataValue(value, 'worldEpoch');
    result.tick = dataValue(value, 'tick');
    result.subject = dataValue(value, 'subject');
    result.laneId = dataValue(value, 'laneId');
    result.leader = dataValue(value, 'leader');
    result.completeness = dataValue(value, 'completeness');
    result.discontinuity = dataValue(value, 'discontinuity');
  } else if (names === completenessFields) {
    result.vehicles = dataValue(value, 'vehicles');
    result.obstacles = dataValue(value, 'obstacles');
    result.zones = dataValue(value, 'zones');
    result.signals = dataValue(value, 'signals');
  } else if (names === leaderFields) {
    result.id = dataValue(value, 'id');
    result.incarnation = dataValue(value, 'incarnation');
    result.gapM = dataValue(value, 'gapM');
    result.speedMps = dataValue(value, 'speedMps');
  } else {
    result.id = dataValue(value, 'id');
    result.incarnation = dataValue(value, 'incarnation');
  }
  return result;
}
function dataValue(value: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  requireContract(
    descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
    'Following data field',
  );
  return descriptor.value;
}
/** Stateless048 policy; caller owns freshness, actor admission and once-per-tick047 realization. */
export function evaluateFollowingTarget(input: FollowingInput): FollowingTarget {
  requireContract(!evaluating, 'Reentrant following evaluation');
  evaluating = true;
  try {
    const data = fields(input, rootFields, rootScratch);
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Following profile token provenance',
    );
    const profile = data.profile as FollowingProfile | null;
    // Actual046 admission owns authority, decision/fact bindings, mechanical coverage and profile token.
    const cruiseData = fields(data.cruiseInput, cruiseFields, cruiseScratch);
    // Capture once;046 performs the actual primitive/schema validation on this detached snapshot.
    // Avoid parsing an already-detached context here and then repeating the same parse in046.
    const contextData =
      cruiseData.context === null
        ? null
        : fields(cruiseData.context, contextFields, contextScratch);
    if (contextData !== null) contextData.subject = actor(contextData.subject);
    const context = contextData as unknown as BehaviorContext | null;
    cruiseData.context = context;
    const cruise = evaluateCruiseTarget(cruiseData);
    let target = cruise,
      reason = cruise.reason,
      leader: BehaviorActor | null = null,
      gapM: number | null = null,
      desiredGapM: number | null = null,
      preferredFollowingMps: number | null = null;
    const observation = fields(data.observation, observationFields, observationScratch);
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
        : fields(data.roadContext, roadFields, roadScratch, 32, false);
    let projected: BehaviorContext | null = null;
    let admittedLeader: (BehaviorActor & { gapM: number; speedMps: number }) | null = null;
    if (road !== null) {
      const completeness = fields(road.completeness, completenessFields, completenessScratch);
      const vehiclesComplete = boolean(completeness.vehicles);
      boolean(completeness.obstacles);
      boolean(completeness.zones);
      boolean(completeness.signals);
      const subject = actor(road.subject);
      if (road.leader !== null) {
        const raw = fields(road.leader, leaderFields, leaderScratch);
        admittedLeader = {
          id: id(raw.id),
          incarnation: tick(raw.incarnation),
          gapM: number(raw.gapM, 0, 100000),
          speedMps: number(raw.speedMps, 0, 100),
        };
        requireContract(admittedLeader.id !== subject.id, 'Following leader cannot be subject');
      }
      projected = {
        sessionId: id(road.sessionId),
        worldEpoch: tick(road.worldEpoch),
        sourceTick: tick(road.tick),
        subject,
        laneId: road.laneId === null ? null : id(road.laneId),
        leaderId: admittedLeader?.id ?? null,
        vehiclesComplete,
        discontinuity: boolean(road.discontinuity),
      };
    }
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
        leader = Object.freeze({
          id: admittedLeader!.id,
          incarnation: admittedLeader!.incarnation,
        });
        gapM = admittedLeader!.gapM;
        const leaderSpeed = admittedLeader!.speedMps,
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
  } finally {
    for (const [sink, names] of sinks) for (const name of names) sink[name] = undefined;
    evaluating = false;
  }
}
