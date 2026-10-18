import { choice, number, requireContract, tick } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import { tractiveForceN, vehicleClass } from '../vehicles/vehicle-classes';
import type { VehicleCommand } from '../vehicles/contracts';
import { compileCruiseProfile } from './cruise-targets';
import type { CruiseProfile, CruiseTarget } from './cruise-targets';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

export const LONGITUDINAL_KEYS = Object.freeze([
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
] as const);
export type LongitudinalKey = (typeof LONGITUDINAL_KEYS)[number];
export const LONGITUDINAL_LIMITS = Object.freeze({
  version: '047-longitudinal-v1' as const,
  observationVersion: '047-observation-v1' as const,
  actors: 110,
  identities: 1024,
  idCodeUnits: 256,
  profileNodes: 10000,
  maximumTargetAgeTicks: 5,
  tickHz: 60,
  speedDeadbandMps: 0.1,
  retainedHistory: 0,
});
export interface LongitudinalProfile {
  readonly version: '047-longitudinal-v1';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly cruise: CruiseProfile;
  readonly values: Readonly<Record<LongitudinalKey, number>>;
  readonly provenance: Readonly<Record<LongitudinalKey, string>>;
}
export interface LongitudinalObservation extends BehaviorScope {
  readonly version: '047-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  /** Current authoritative pre-actuation readback; not an independently advancing clock. */
  readonly tick: number;
  readonly longitudinalSpeedMps: number;
  readonly classId: 'sedan' | 'compact';
  readonly classVersion: '023-mechanics-v1';
}
export interface LongitudinalInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly profile: LongitudinalProfile | null;
  readonly target: CruiseTarget | null;
  readonly observation: LongitudinalObservation;
}
export interface LongitudinalResult {
  readonly version: '047-longitudinal-v1';
  readonly command: VehicleCommand;
  readonly accelerationMps2: number;
  readonly brakeEventTick: number | null;
  readonly reactionTicks: number;
  readonly phase: 'RELEASED' | 'REACTION_DELAY' | 'BRAKING' | 'TRACKING';
  readonly reason: string;
  readonly targetMps: number | null;
  readonly availableAccelerationMps2: number;
  readonly profileVersionId: string | null;
}
const profiles = new WeakSet<object>();
let compiling = false;
const scopeFields = new Set(['sessionId', 'worldEpoch']);
const actorFields = new Set(['id', 'incarnation']);
const observationFields = new Set([
  'version',
  'units',
  'sessionId',
  'worldEpoch',
  'actor',
  'tick',
  'longitudinalSpeedMps',
  'classId',
  'classVersion',
]);
const inputFields = new Set([
  'sessionId',
  'worldEpoch',
  'actor',
  'tick',
  'authority',
  'profile',
  'target',
  'observation',
]);
/** Small exact schemas: capacity is checked before copying any descriptor value. */
function fields(value: unknown, names: ReadonlySet<string>): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Expected longitudinal data object',
  );
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    'Expected plain longitudinal data object',
  );
  const keys = Reflect.ownKeys(value);
  requireContract(keys.length === names.size, 'Missing or unknown longitudinal fields/capacity');
  for (const key of keys)
    requireContract(typeof key === 'string' && names.has(key), 'Unknown longitudinal schema key');
  const result: Record<string, unknown> = Object.create(null);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    requireContract(
      descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
      'Expected enumerable longitudinal data fields',
    );
    result[name] = descriptor.value;
  }
  return result;
}
function id(value: unknown, maximum: number = LONGITUDINAL_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid longitudinal identity',
  );
  return value;
}
function scope(input: unknown): BehaviorScope {
  const data = fields(input, scopeFields);
  return Object.freeze({ sessionId: id(data.sessionId), worldEpoch: tick(data.worldEpoch) });
}
function actor(input: unknown): BehaviorActor {
  const data = fields(input, actorFields);
  return Object.freeze({ id: id(data.id), incarnation: tick(data.incarnation) });
}
function sameScope(a: BehaviorScope, b: BehaviorScope) {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
function sameActor(a: BehaviorActor, b: BehaviorActor) {
  return a.id === b.id && a.incarnation === b.incarnation;
}
/** Bounded descriptor capture, before either profile compiler parses detached data. */
function snapshot(value: unknown, depth = 0, budget = { nodes: 0 }): unknown {
  requireContract(
    depth <= 6 && ++budget.nodes <= LONGITUDINAL_LIMITS.profileNodes,
    'Longitudinal profile capacity exceeded',
  );
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    requireContract(value.length <= 256, 'Longitudinal profile string capacity');
    return value;
  }
  requireContract(typeof value === 'object' && value !== null, 'Expected profile data');
  const array = Array.isArray(value),
    prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === (array ? Array.prototype : Object.prototype) || (!array && prototype === null),
    'Expected plain profile data',
  );
  const keys = Reflect.ownKeys(value);
  if (array) {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
    requireContract(
      descriptor !== undefined && 'value' in descriptor,
      'Expected data array length',
    );
    const length = tick(descriptor.value);
    requireContract(
      length <= 1024 && keys.length === length + 1,
      'Expected bounded dense profile array',
    );
    const result: unknown[] = [];
    for (let i = 0; i < length; i++) {
      const item = Object.getOwnPropertyDescriptor(value, String(i));
      requireContract(
        item !== undefined && 'value' in item && item.enumerable === true,
        'Expected profile array data',
      );
      result.push(snapshot(item.value, depth + 1, budget));
    }
    return Object.freeze(result);
  }
  requireContract(keys.length <= (depth === 0 ? 13 : 80), 'Profile map capacity exceeded');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    requireContract(typeof key === 'string' && key.length <= 64, 'Invalid profile field');
    const item = Object.getOwnPropertyDescriptor(value, key);
    requireContract(
      item !== undefined && 'value' in item && item.enumerable === true,
      'Expected profile data field',
    );
    result[key] = snapshot(item.value, depth + 1, budget);
  }
  return Object.freeze(result);
}
export function compileLongitudinalProfile(input: unknown): LongitudinalProfile {
  requireContract(!compiling, 'Reentrant longitudinal profile compilation');
  compiling = true;
  try {
    const detached = snapshot(input),
      profile = parsePublishableDrivingProfile(detached);
    const cruise = compileCruiseProfile(detached);
    const values = {} as Record<LongitudinalKey, number>,
      provenance = {} as Record<LongitudinalKey, string>;
    for (const key of LONGITUDINAL_KEYS) {
      requireContract(
        Object.hasOwn(profile.parameters, key),
        'Missing longitudinal profile parameter',
      );
      values[key] = profile.parameters[key];
      provenance[key] = profile.provenanceByParameter[key];
    }
    const result: LongitudinalProfile = Object.freeze({
      version: LONGITUDINAL_LIMITS.version,
      profileId: cruise.profileId,
      versionId: cruise.versionId,
      engineVersion: cruise.engineVersion,
      cruise,
      values: Object.freeze(values),
      provenance: Object.freeze(provenance),
    });
    profiles.add(result);
    return result;
  } finally {
    compiling = false;
  }
}
function observation(input: unknown): LongitudinalObservation {
  const data = fields(input, observationFields);
  requireContract(
    data.version === LONGITUDINAL_LIMITS.observationVersion && data.units === 'SI',
    'Invalid longitudinal observation version/units',
  );
  return Object.freeze({
    version: LONGITUDINAL_LIMITS.observationVersion,
    units: 'SI',
    sessionId: id(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    tick: tick(data.tick),
    longitudinalSpeedMps: number(data.longitudinalSpeedMps, -1000, 1000),
    classId: choice(data.classId, ['sedan', 'compact']),
    classVersion: choice(data.classVersion, ['023-mechanics-v1']),
  });
}
const targetFields = new Set([
  'version',
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'sourceTick',
  'profileVersionId',
  'engineVersion',
  'behaviorReason',
  'reason',
  'targetMps',
  'preferredRoadMps',
  'preferredCurveMps',
  'preferredApproachMps',
  'styleTargetMps',
  'postedDeviationMps',
  'mechanicalCoverageCapMps',
  'mechanicalVersion',
  'lateralAdvisoryMps',
  'exceedsLateralAdvisory',
]);
const validTargetReasons = [
  'FREE_ROAD',
  'MECHANICAL_COVERAGE_CAP',
  'INTERSECTION_APPROACH',
  'CURVE_PREFERENCE',
  'BEHAVIOR_STOP',
  'BEHAVIOR_YIELD',
  'BEHAVIOR_BLOCKED',
  'BEHAVIOR_SERVICE',
  'MECHANICALLY_INFEASIBLE_RADIUS',
];
function target(input: unknown): CruiseTarget {
  const data = fields(input, targetFields);
  requireContract(
    data.version === '046-cruise-v1' &&
      data.mechanicalVersion === '031-coverage-046-v1' &&
      data.mechanicalCoverageCapMps === 30,
    'Unknown longitudinal target version',
  );
  for (const key of [
    'preferredRoadMps',
    'preferredCurveMps',
    'preferredApproachMps',
    'styleTargetMps',
    'lateralAdvisoryMps',
  ])
    if (data[key] !== null) number(data[key], 0, 10000);
  if (data.postedDeviationMps !== null) number(data.postedDeviationMps, -100, 10000);
  requireContract(typeof data.exceedsLateralAdvisory === 'boolean', 'Invalid target advisory');
  const result = {
    ...data,
    sessionId: id(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    decisionTick: tick(data.decisionTick),
    sourceTick: data.sourceTick === null ? null : tick(data.sourceTick),
    profileVersionId: data.profileVersionId === null ? null : id(data.profileVersionId, 128),
    engineVersion: data.engineVersion === null ? null : id(data.engineVersion, 128),
    behaviorReason: data.behaviorReason === null ? null : id(data.behaviorReason, 128),
    reason: id(data.reason, 128),
    targetMps: number(data.targetMps, 0, 30),
  };
  return Object.freeze(result) as unknown as CruiseTarget;
}
interface Entry {
  actor: BehaviorActor;
  lastTick: number | null;
  acceleration: number;
  brakeEventTick: number | null;
  profile: LongitudinalProfile | null;
  cachedTargetSource: object | null;
  cachedTarget: CruiseTarget | null;
}
export function createLongitudinalController(input: BehaviorScope) {
  let owner = scope(input),
    disposed = false,
    suspended = false,
    busy = false;
  const live = new Map<string, Entry>(),
    history = new Map<string, number>();
  function available() {
    requireContract(!disposed && !busy, 'Unavailable longitudinal controller');
  }
  function release(entry: Entry) {
    entry.acceleration = 0;
    entry.brakeEventTick = null;
    entry.profile = null;
    entry.cachedTargetSource = null;
    entry.cachedTarget = null;
  }
  return Object.freeze({
    setActors(inputs: readonly BehaviorActor[], requestedScope: BehaviorScope) {
      available();
      busy = true;
      try {
        requireContract(
          sameScope(owner, scope(requestedScope)),
          'Foreign longitudinal actor scope',
        );
        requireContract(
          Array.isArray(inputs) && inputs.length <= 110,
          'Longitudinal actor capacity exceeded',
        );
        const detached = snapshot(inputs) as unknown as readonly BehaviorActor[],
          actors = detached.map(actor),
          seen = new Set<string>();
        requireContract(
          actors.length <= LONGITUDINAL_LIMITS.actors,
          'Detached longitudinal actor capacity exceeded',
        );
        let additions = 0;
        for (const subject of actors) {
          requireContract(!seen.has(subject.id), 'Duplicate longitudinal actor');
          seen.add(subject.id);
          const previous = history.get(subject.id),
            existing = live.get(subject.id);
          requireContract(
            previous === undefined ||
              subject.incarnation > previous ||
              (existing !== undefined && sameActor(existing.actor, subject)),
            'Retired longitudinal incarnation',
          );
          if (previous === undefined) additions++;
        }
        requireContract(
          history.size + additions <= 1024,
          'Longitudinal identity capacity exceeded',
        );
        for (const key of live.keys()) if (!seen.has(key)) live.delete(key);
        for (const subject of actors) {
          if (!live.has(subject.id) || !sameActor(live.get(subject.id)!.actor, subject))
            live.set(subject.id, {
              actor: subject,
              lastTick: null,
              acceleration: 0,
              brakeEventTick: null,
              profile: null,
              cachedTargetSource: null,
              cachedTarget: null,
            });
          history.set(subject.id, subject.incarnation);
        }
      } finally {
        busy = false;
      }
    },
    step(
      input: LongitudinalInput,
      steering = 0,
      turnSignal: VehicleCommand['turnSignal'] = 'OFF',
    ): LongitudinalResult {
      available();
      busy = true;
      try {
        const data = fields(input, inputFields),
          requestedScope = { sessionId: id(data.sessionId), worldEpoch: tick(data.worldEpoch) },
          subject = actor(data.actor),
          currentTick = tick(data.tick),
          authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING']);
        requireContract(sameScope(owner, requestedScope), 'Foreign longitudinal step scope');
        const entry = live.get(subject.id);
        requireContract(
          entry !== undefined && sameActor(entry.actor, subject),
          'Unknown longitudinal incarnation',
        );
        requireContract(
          entry.lastTick === null || currentTick === entry.lastTick + 1,
          'Longitudinal tick must be consecutive',
        );
        requireContract(
          data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
          'Longitudinal profile token provenance',
        );
        const profile = data.profile as LongitudinalProfile | null,
          readback = observation(data.observation),
          requested =
            data.target === null
              ? null
              : entry.cachedTargetSource === data.target
                ? entry.cachedTarget
                : target(data.target);
        const selectedSteering = number(steering, -1, 1),
          selectedSignal = choice(turnSignal, ['OFF', 'LEFT', 'RIGHT', 'HAZARD']);
        const config = vehicleClass(readback.classId, readback.classVersion),
          speed = readback.longitudinalSpeedMps;
        const availableForce = tractiveForceN(config, speed),
          availableAcceleration = availableForce / config.massKg;
        // The parsed schema contains only primitive fields and one two-primitive actor.
        // Cache at most that one detached target when both original data objects are frozen.
        const reusedTarget = requested !== null && entry.cachedTargetSource === data.target;
        const targetActor =
          reusedTarget || data.target === null
            ? undefined
            : Object.getOwnPropertyDescriptor(data.target, 'actor');
        const cacheableTarget =
          reusedTarget ||
          (requested !== null &&
            typeof data.target === 'object' &&
            data.target !== null &&
            Object.isFrozen(data.target) &&
            targetActor !== undefined &&
            'value' in targetActor &&
            typeof targetActor.value === 'object' &&
            targetActor.value !== null &&
            Object.isFrozen(targetActor.value));
        let reason = 'TRACK_TARGET';
        if (suspended) reason = 'SUSPENDED';
        else if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
        else if (
          !sameScope(owner, readback) ||
          !sameActor(subject, readback.actor) ||
          readback.tick !== currentTick
        )
          reason = 'FOREIGN_OR_STALE_OBSERVATION';
        else if (profile === null) reason = 'MISSING_PROFILE';
        else if (requested === null) reason = 'MISSING_TARGET';
        else if (!sameScope(owner, requested) || !sameActor(subject, requested.actor))
          reason = 'FOREIGN_TARGET';
        else if (
          requested.decisionTick > currentTick ||
          currentTick - requested.decisionTick > 5 ||
          requested.sourceTick === null ||
          requested.sourceTick > requested.decisionTick ||
          requested.decisionTick - requested.sourceTick > 6
        )
          reason = 'STALE_TARGET';
        else if (
          requested.profileVersionId !== profile.versionId ||
          requested.engineVersion !== profile.engineVersion
        )
          reason = 'PROFILE_VERSION_MISMATCH';
        else if (!validTargetReasons.includes(requested.reason))
          reason = 'INVALID_TARGET_DIAGNOSTIC';
        // All admission above is complete before tick/state mutation.
        entry.lastTick = currentTick;
        if (entry.profile !== profile) release(entry);
        let phase: LongitudinalResult['phase'] = 'RELEASED',
          reactionTicks = 0;
        if (reason !== 'TRACK_TARGET') release(entry);
        else {
          entry.profile = profile;
          entry.cachedTargetSource = cacheableTarget ? (data.target as object) : null;
          entry.cachedTarget = cacheableTarget ? requested : null;
          const values = profile!.values,
            error = requested!.targetMps - Math.max(0, speed),
            braking = speed < -0.1 || error < -0.1;
          if (braking) entry.brakeEventTick ??= currentTick;
          else entry.brakeEventTick = null;
          reactionTicks = Math.ceil(values.brake_reaction_delay * 60);
          const delayed = braking && currentTick - entry.brakeEventTick! < reactionTicks;
          let acceleration = braking
            ? delayed
              ? Math.max(0, entry.acceleration)
              : -Math.min(
                  values.comfort_deceleration,
                  Math.abs(error) * 2 || values.comfort_deceleration,
                )
            : error > 0.1
              ? Math.min(values.desired_acceleration, error * 2)
              : 0;
          if (acceleration > entry.acceleration)
            acceleration = Math.min(
              acceleration,
              entry.acceleration + values.acceleration_jerk / 60,
            );
          entry.acceleration = acceleration;
          phase = delayed ? 'REACTION_DELAY' : braking ? 'BRAKING' : 'TRACKING';
        }
        const command: VehicleCommand = Object.freeze({
          schemaVersion: 1,
          units: 'SI',
          ...owner,
          vehicleId: subject.id,
          tick: currentTick,
          source: 'AUTONOMY',
          throttle:
            speed < -0.1
              ? 0
              : Math.min(1, (Math.max(0, entry.acceleration) * config.massKg) / availableForce),
          brake: Math.min(1, Math.max(0, -entry.acceleration) / config.brakeAcceleration),
          steering: selectedSteering,
          handbrake: false,
          turnSignal: selectedSignal,
        });
        return Object.freeze({
          version: LONGITUDINAL_LIMITS.version,
          command,
          accelerationMps2: entry.acceleration,
          brakeEventTick: entry.brakeEventTick,
          reactionTicks,
          phase,
          reason,
          targetMps: requested?.targetMps ?? null,
          availableAccelerationMps2: availableAcceleration,
          profileVersionId: profile?.versionId ?? null,
        });
      } finally {
        busy = false;
      }
    },
    setSuspended(value: boolean) {
      available();
      requireContract(typeof value === 'boolean', 'Expected suspension boolean');
      suspended = value;
      for (const entry of live.values()) release(entry);
    },
    reset(sessionId: string, worldEpoch: number) {
      available();
      const next = scope({ sessionId, worldEpoch });
      requireContract(
        next.sessionId !== owner.sessionId || next.worldEpoch > owner.worldEpoch,
        'Longitudinal reset must advance epoch',
      );
      live.clear();
      history.clear();
      owner = next;
      suspended = false;
    },
    dispose() {
      if (disposed) return;
      requireContract(!busy, 'Reentrant longitudinal disposal');
      disposed = true;
      live.clear();
      history.clear();
    },
    getStats() {
      return Object.freeze({
        ...owner,
        actors: live.size,
        identities: history.size,
        delayedBrakeStates: [...live.values()].filter((entry) => entry.brakeEventTick !== null)
          .length,
        cachedTargets: [...live.values()].filter((entry) => entry.cachedTarget !== null).length,
        retainedHistory: 0,
        disposed,
        suspended,
      });
    },
  });
}
