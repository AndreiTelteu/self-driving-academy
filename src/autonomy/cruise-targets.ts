import { boolean, choice, fields, number, requireContract, tick } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { roadSurface, vehicleClass } from '../vehicles';
import type { RoadSurfaceId, VehicleClassId } from '../vehicles';
import { parseBehaviorContext } from './behavior-fsm';
import type {
  BehaviorActor,
  BehaviorContext,
  BehaviorDecision,
  BehaviorScope,
} from './behavior-fsm';
import { LATERAL_LIMITS } from './lateral-controller';

export const CRUISE_KEYS = Object.freeze([
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
] as const);
export type CruiseKey = (typeof CRUISE_KEYS)[number];
export const CRUISE_LIMITS = Object.freeze({
  version: '046-cruise-v1' as const,
  factsVersion: '046-road-facts-v1' as const,
  mechanicsVersion: '031-coverage-046-v1' as const,
  maximumContextAgeTicks: 6,
  maximumCoveredSpeedMps: 30,
  parameters: 4,
  profileParameters: 80,
  profileSources: 1024,
  evidenceContexts: 32,
  idCodeUnits: 256,
  metadataCodeUnits: 128,
  retainedHistory: 0,
});
export interface CruiseProfile {
  readonly version: '046-cruise-v1';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<CruiseKey, number>>;
  readonly units: Readonly<Record<CruiseKey, ParameterUnit>>;
  readonly provenance: Readonly<Record<CruiseKey, string>>;
}
export interface CruiseRoadFacts extends BehaviorScope {
  readonly version: '046-road-facts-v1';
  readonly subject: BehaviorActor;
  readonly sourceTick: number;
  readonly laneId: string;
  readonly roadKind: 'URBAN' | 'RESIDENTIAL' | 'UNKNOWN';
  readonly postedLimitMps: number;
  /** null explicitly asserts no curve; unknown geometry requires missing facts. */
  readonly curveRadiusM: number | null;
  readonly intersectionApproach: boolean;
}
export interface CruiseMechanics {
  readonly version: '031-coverage-046-v1';
  readonly classId: VehicleClassId;
  readonly classVersion: '023-mechanics-v1';
  readonly surface: RoadSurfaceId;
  readonly surfaceVersion: '026-flat-surfaces-v1';
}
export interface CruiseInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly profile: CruiseProfile | null;
  readonly context: BehaviorContext | null;
  readonly behavior: BehaviorDecision | null;
  readonly facts: CruiseRoadFacts | null;
  readonly mechanics: CruiseMechanics;
}
export interface CruiseTarget extends BehaviorScope {
  readonly version: '046-cruise-v1';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly sourceTick: number | null;
  readonly profileVersionId: string | null;
  readonly engineVersion: string | null;
  readonly behaviorReason: string | null;
  readonly reason: string;
  readonly targetMps: number;
  readonly preferredRoadMps: number | null;
  readonly preferredCurveMps: number | null;
  readonly preferredApproachMps: number | null;
  readonly styleTargetMps: number | null;
  readonly postedDeviationMps: number | null;
  readonly mechanicalCoverageCapMps: 30;
  readonly mechanicalVersion: '031-coverage-046-v1';
  readonly lateralAdvisoryMps: number | null;
  readonly exceedsLateralAdvisory: boolean;
}
const profiles = new WeakSet<object>();
// Weak ownership follows each caller-held result; this is not an actor or decision cache.
const targetContexts = new WeakMap<object, BehaviorContext | null>();
/** Returns only the immutable context actually admitted while producing this exact046 result. */
export function getCruiseTargetContext(target: unknown): BehaviorContext | null {
  requireContract(
    typeof target === 'object' && target !== null && targetContexts.has(target),
    'Cruise target provenance',
  );
  return targetContexts.get(target)!;
}
let compiling = false;
function boundedId(value: unknown, maximum: number = CRUISE_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid cruise identity',
  );
  return value;
}
function actor(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: boundedId(data.id), incarnation: tick(data.incarnation) });
}
function sameActor(a: BehaviorActor, b: BehaviorActor) {
  return a.id === b.id && a.incarnation === b.incarnation;
}
function sameScope(a: BehaviorScope, b: BehaviorScope) {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
/** Bounded one-time descriptor capture; later publication parsing reads only detached data. */
function boundedRecord(value: unknown, maximum: number): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Expected cruise profile object',
  );
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    'Expected plain cruise profile object',
  );
  const keys = Reflect.ownKeys(value);
  requireContract(keys.length <= maximum, 'Cruise profile object capacity exceeded');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    requireContract(typeof key === 'string' && key.length <= 64, 'Invalid cruise profile field');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireContract(
      descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
      'Expected cruise profile data field',
    );
    const field: unknown = descriptor.value;
    result[key] = field;
  }
  return result;
}
function boundedStrings(value: unknown, maximum: number): readonly string[] {
  requireContract(
    Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype,
    'Expected cruise profile array',
  );
  const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
  requireContract(
    descriptor !== undefined && 'value' in descriptor,
    'Expected cruise profile array length',
  );
  const length = number(descriptor.value, 0, maximum);
  requireContract(Number.isSafeInteger(length), 'Invalid cruise profile array length');
  const keys = Reflect.ownKeys(value);
  requireContract(keys.length === length + 1, 'Expected dense cruise profile array');
  const result: string[] = [];
  for (let index = 0; index < length; index++) {
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    requireContract(
      item !== undefined && 'value' in item && item.enumerable === true,
      'Expected cruise profile array data',
    );
    result.push(boundedId(item.value));
  }
  return Object.freeze(result);
}
/** Explicit profile activation setup. Publication support is separate from estimator support. */
export function compileCruiseProfile(input: unknown): CruiseProfile {
  requireContract(!compiling, 'Reentrant cruise profile compilation');
  compiling = true;
  try {
    const root = boundedRecord(input, 13),
      parameters = boundedRecord(root.parameters, 80),
      evidence = boundedRecord(root.evidenceByParameter, 80);
    root.parameters = parameters;
    root.unitsByParameter = boundedRecord(root.unitsByParameter, 80);
    root.provenanceByParameter = boundedRecord(root.provenanceByParameter, 80);
    root.sourceSegmentIds = boundedStrings(root.sourceSegmentIds, CRUISE_LIMITS.profileSources);
    root.profileId = boundedId(root.profileId);
    for (const key of ['versionId', 'engineVersion'])
      root[key] = boundedId(root[key], CRUISE_LIMITS.metadataCodeUnits);
    if (root.parentVersionId !== null)
      root.parentVersionId = boundedId(root.parentVersionId, CRUISE_LIMITS.metadataCodeUnits);
    root.createdAt = boundedId(root.createdAt, 32);
    root.checksum = boundedId(root.checksum);
    for (const key of Object.keys(evidence))
      if (evidence[key] !== null) {
        const item = boundedRecord(evidence[key], 7);
        item.sourceSegmentIds = boundedStrings(item.sourceSegmentIds, CRUISE_LIMITS.profileSources);
        item.contexts = boundedStrings(item.contexts, CRUISE_LIMITS.evidenceContexts);
        item.key = boundedId(item.key, 64);
        item.estimatorVersion = boundedId(item.estimatorVersion, CRUISE_LIMITS.metadataCodeUnits);
        evidence[key] = item;
      }
    root.evidenceByParameter = evidence;
    const profile = parsePublishableDrivingProfile(root),
      values = {} as Record<CruiseKey, number>,
      units = {} as Record<CruiseKey, ParameterUnit>,
      provenance = {} as Record<CruiseKey, string>;
    for (const key of CRUISE_KEYS) {
      requireContract(Object.hasOwn(profile.parameters, key), 'Missing required cruise parameter');
      values[key] = profile.parameters[key];
      units[key] = profile.unitsByParameter[key];
      provenance[key] = profile.provenanceByParameter[key];
    }
    const result: CruiseProfile = Object.freeze({
      version: CRUISE_LIMITS.version,
      profileId: boundedId(profile.profileId),
      versionId: boundedId(profile.versionId, CRUISE_LIMITS.metadataCodeUnits),
      engineVersion: boundedId(profile.engineVersion, CRUISE_LIMITS.metadataCodeUnits),
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
function facts(value: unknown): CruiseRoadFacts {
  const data = fields(value, [
    'version',
    'sessionId',
    'worldEpoch',
    'subject',
    'sourceTick',
    'laneId',
    'roadKind',
    'postedLimitMps',
    'curveRadiusM',
    'intersectionApproach',
  ]);
  requireContract(data.version === CRUISE_LIMITS.factsVersion, 'Unknown cruise road facts version');
  return Object.freeze({
    version: CRUISE_LIMITS.factsVersion,
    sessionId: boundedId(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    subject: actor(data.subject),
    sourceTick: tick(data.sourceTick),
    laneId: boundedId(data.laneId),
    roadKind: choice(data.roadKind, ['URBAN', 'RESIDENTIAL', 'UNKNOWN']),
    postedLimitMps: number(data.postedLimitMps, 0, 100),
    curveRadiusM: data.curveRadiusM === null ? null : number(data.curveRadiusM, 0.001, 100000),
    intersectionApproach: boolean(data.intersectionApproach),
  });
}
const states = ['FOLLOW', 'STOP', 'YIELD', 'CHANGE_LANE', 'SERVICE', 'BLOCKED'] as const;
const stateReasons = Object.freeze({
  FOLLOW: ['FOLLOW_LANE', 'FOLLOW_LEADER'],
  STOP: ['WAIT_RED_BY_PROFILE', 'WAIT_STOP_BY_PROFILE', 'STOP_REQUESTED'],
  YIELD: ['YIELD_CONFLICT_BY_POLICY'],
  CHANGE_LANE: ['LANE_CHANGE_VALIDATED'],
  SERVICE: ['SERVICE_ACCEPTED'],
  BLOCKED: [
    'MISSING_CONTEXT',
    'FOREIGN_CONTEXT',
    'STALE_CONTEXT',
    'CONTEXT_DISCONTINUITY',
    'INCOMPLETE_CONTEXT',
    'MISSING_POLICY_FACTS',
    'BLOCKED_ROUTE',
  ],
});
function behavior(value: unknown): BehaviorDecision {
  const data = fields(value, [
    'version',
    'sessionId',
    'worldEpoch',
    'actor',
    'state',
    'reason',
    'decisionTick',
    'sourceTick',
    'profileVersionId',
    'previousState',
    'transitioned',
  ]);
  requireContract(data.version === '045-decision-facts-v1', 'Unknown cruise behavior version');
  const state = choice(data.state, states),
    reason = boundedId(data.reason, CRUISE_LIMITS.metadataCodeUnits);
  requireContract(stateReasons[state].includes(reason), 'Inconsistent behavior state/reason');
  return Object.freeze({
    version: '045-decision-facts-v1',
    sessionId: boundedId(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    state,
    reason: reason as BehaviorDecision['reason'],
    decisionTick: tick(data.decisionTick),
    sourceTick: data.sourceTick === null ? null : tick(data.sourceTick),
    profileVersionId:
      data.profileVersionId === null
        ? null
        : boundedId(data.profileVersionId, CRUISE_LIMITS.metadataCodeUnits),
    previousState: data.previousState === null ? null : choice(data.previousState, states),
    transitioned: boolean(data.transitioned),
  });
}
/** Stateless tick consumer.045/activation owner retains authority, monotonic ticks and lifecycle. */
export function evaluateCruiseTarget(input: unknown): CruiseTarget {
  const data = fields(input, [
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
  const scope = { sessionId: boundedId(data.sessionId), worldEpoch: tick(data.worldEpoch) },
    subject = actor(data.actor),
    decisionTick = tick(data.decisionTick),
    authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING']);
  requireContract(
    data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
    'Cruise profile token provenance',
  );
  const profile = data.profile as CruiseProfile | null,
    context = data.context === null ? null : parseBehaviorContext(data.context),
    decision = data.behavior === null ? null : behavior(data.behavior),
    road = data.facts === null ? null : facts(data.facts);
  const mechanical = fields(data.mechanics, [
    'version',
    'classId',
    'classVersion',
    'surface',
    'surfaceVersion',
  ]);
  requireContract(
    mechanical.version === CRUISE_LIMITS.mechanicsVersion,
    'Unknown cruise mechanics coverage',
  );
  const config = vehicleClass(
    choice(mechanical.classId, ['sedan', 'compact']),
    choice(mechanical.classVersion, ['023-mechanics-v1']),
  );
  roadSurface(
    choice(mechanical.surface, ['dry-asphalt', 'reduced-adhesion']),
    choice(mechanical.surfaceVersion, ['026-flat-surfaces-v1']),
  );
  let reason = 'FREE_ROAD',
    target = 0,
    preferredRoad: number | null = null,
    preferredCurve: number | null = null,
    preferredApproach: number | null = null,
    styleTarget: number | null = null;
  if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
  else if (profile === null) reason = 'MISSING_PROFILE';
  else if (context === null) reason = 'MISSING_CONTEXT';
  else if (!sameScope(scope, context) || !sameActor(subject, context.subject))
    reason = 'FOREIGN_CONTEXT';
  else if (
    context.sourceTick > decisionTick ||
    decisionTick - context.sourceTick > CRUISE_LIMITS.maximumContextAgeTicks
  )
    reason = 'STALE_CONTEXT';
  else if (context.discontinuity) reason = 'CONTEXT_DISCONTINUITY';
  else if (!context.vehiclesComplete || context.laneId === null) reason = 'INCOMPLETE_CONTEXT';
  else if (decision === null) reason = 'MISSING_BEHAVIOR';
  else if (
    !sameScope(scope, decision) ||
    !sameActor(subject, decision.actor) ||
    decision.decisionTick !== decisionTick ||
    decision.sourceTick !== context.sourceTick
  )
    reason = 'FOREIGN_OR_STALE_BEHAVIOR';
  else if (decision.profileVersionId !== profile.versionId) reason = 'PROFILE_VERSION_MISMATCH';
  else if (road === null) reason = 'MISSING_ROAD_FACTS';
  else if (
    !sameScope(scope, road) ||
    !sameActor(subject, road.subject) ||
    road.sourceTick !== context.sourceTick ||
    road.laneId !== context.laneId
  )
    reason = 'FOREIGN_ROAD_FACTS';
  else if (road.roadKind === 'UNKNOWN') reason = 'UNSUPPORTED_ROAD_KIND';
  else {
    preferredRoad = Math.max(
      0,
      road.postedLimitMps +
        profile.values[road.roadKind === 'URBAN' ? 'speed_delta_urban' : 'speed_delta_residential'],
    );
    preferredCurve =
      road.curveRadiusM === null
        ? null
        : Math.sqrt(profile.values.curve_lateral_accel * road.curveRadiusM);
    preferredApproach = road.intersectionApproach
      ? profile.values.intersection_approach_speed
      : null;
    styleTarget = Math.min(
      preferredRoad,
      preferredCurve ?? Infinity,
      preferredApproach ?? Infinity,
    );
    target = Math.min(styleTarget, CRUISE_LIMITS.maximumCoveredSpeedMps);
    reason =
      target < styleTarget
        ? 'MECHANICAL_COVERAGE_CAP'
        : preferredApproach !== null && target === preferredApproach
          ? 'INTERSECTION_APPROACH'
          : preferredCurve !== null && target === preferredCurve
            ? 'CURVE_PREFERENCE'
            : 'FREE_ROAD';
    if (['STOP', 'YIELD', 'BLOCKED', 'SERVICE'].includes(decision.state)) {
      target = 0;
      reason = `BEHAVIOR_${decision.state}`;
    } else if (road.curveRadiusM !== null && road.curveRadiusM < config.turningRadiusM) {
      target = 0;
      reason = 'MECHANICALLY_INFEASIBLE_RADIUS';
    }
  }
  const advisory =
    preferredCurve !== null && road?.curveRadiusM !== null && road !== null
      ? Math.sqrt(LATERAL_LIMITS.maximumCornerAccelerationMps2 * road.curveRadiusM)
      : null;
  const result: CruiseTarget = Object.freeze({
    ...scope,
    version: CRUISE_LIMITS.version,
    actor: subject,
    decisionTick,
    sourceTick: context?.sourceTick ?? null,
    profileVersionId: profile?.versionId ?? null,
    engineVersion: profile?.engineVersion ?? null,
    behaviorReason: decision?.reason ?? null,
    reason,
    targetMps: target,
    preferredRoadMps: preferredRoad,
    preferredCurveMps: preferredCurve,
    preferredApproachMps: preferredApproach,
    styleTargetMps: styleTarget,
    postedDeviationMps: styleTarget === null || road === null ? null : target - road.postedLimitMps,
    mechanicalCoverageCapMps: 30,
    mechanicalVersion: CRUISE_LIMITS.mechanicsVersion,
    lateralAdvisoryMps: advisory,
    exceedsLateralAdvisory: advisory !== null && target > advisory,
  });
  targetContexts.set(result, context);
  return result;
}
