import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileLongitudinalProfile,
  createLongitudinalController,
  LONGITUDINAL_KEYS,
} from '../../src/autonomy/longitudinal-control';
import type { LongitudinalInput } from '../../src/autonomy/longitudinal-control';
import { vehicleClass } from '../../src/vehicles/vehicle-classes';
import { getParameterDefinition } from '../../src/profiles';
import {
  longitudinalProfile,
  longitudinalValues,
  referenceLongitudinal,
} from './longitudinal-reference';
import { createLongitudinalTargetFixture } from './longitudinal-target-fixture';
import { createLongitudinalDrivingEpisode } from './longitudinal-driving-fixture';

const scope = { sessionId: '047-test', worldEpoch: 0 },
  actor = { id: 'car', incarnation: 1 };
function setup(values: readonly number[] = longitudinalValues[0]) {
  const profile = compileLongitudinalProfile(longitudinalProfile(values)),
    owner = createLongitudinalController(scope),
    targetOwner = createLongitudinalTargetFixture(profile.cruise, actor, scope);
  owner.setActors([actor], scope);
  return {
    profile,
    owner,
    targets: targetOwner,
    input(tick: number, speed = 15, stopping = true): LongitudinalInput {
      return {
        ...scope,
        actor,
        tick,
        authority: 'AUTO',
        profile,
        target: targetOwner.target(tick, stopping),
        observation: {
          version: '047-observation-v1',
          units: 'SI',
          ...scope,
          actor,
          tick,
          longitudinalSpeedMps: speed,
          classId: 'sedan',
          classVersion: '023-mechanics-v1',
        },
      };
    },
    dispose() {
      owner.dispose();
      targetOwner.dispose();
    },
  };
}
test('047 real044/045/046 binding and independent scalar oracle across target refreshes', () => {
  for (const values of longitudinalValues) {
    const s = setup(values),
      config = vehicleClass('sedan');
    let state = { acceleration: 0, brakeEventTick: null as number | null };
    try {
      for (let tick = 1; tick <= 300; tick++) {
        const input = s.input(tick, tick < 120 ? 15 : 0, tick < 120),
          result = s.owner.step(input, 0.25, 'LEFT'),
          expected = referenceLongitudinal(
            state,
            values,
            input.observation.longitudinalSpeedMps,
            input.target!.targetMps,
            tick,
            config.massKg,
            config.powerW,
            config.engineForceN,
            config.brakeAcceleration,
          );
        state = expected.state;
        assert.equal(result.command.throttle, expected.throttle);
        assert.equal(result.command.brake, expected.brake);
        assert.equal(result.accelerationMps2, expected.accelerationMps2);
        assert.equal(result.phase, expected.phase);
        assert.equal(result.brakeEventTick, expected.brakeEventTick);
        assert.equal(result.command.units, 'SI');
        assert.equal(result.command.source, 'AUTONOMY');
        assert.equal(result.command.steering, 0.25);
        assert.equal(result.command.turnSignal, 'LEFT');
      }
    } finally {
      s.dispose();
    }
  }
});
test('047 each of four parameters is individually observable; braking_jerk stays outside this contract', () => {
  function sample(values: readonly number[], speed: number, stopping: boolean, ticks: number) {
    const s = setup(values);
    let result;
    try {
      for (let tick = 1; tick <= ticks; tick++)
        result = s.owner.step(s.input(tick, speed, stopping));
      return result!;
    } finally {
      s.dispose();
    }
  }
  assert(
    sample([1, 2, 15, 0], 0, false, 60).accelerationMps2 <
      sample([3, 2, 15, 0], 0, false, 60).accelerationMps2,
  );
  assert(
    sample([1, 1, 2, 0], 15, true, 1).command.brake <
      sample([1, 4, 2, 0], 15, true, 1).command.brake,
  );
  assert(
    sample([4, 2, 1, 0], 0, false, 1).accelerationMps2 <
      sample([4, 2, 8, 0], 0, false, 1).accelerationMps2,
  );
  assert.equal(sample([1, 2, 2, 0.5], 15, true, 30).phase, 'REACTION_DELAY');
  assert.equal(sample([1, 2, 2, 0.5], 15, true, 31).phase, 'BRAKING');
  assert.equal(
    sample([1, 4, 0.2, 0], 15, true, 1).accelerationMps2,
    -4,
    'No hidden braking jerk extension',
  );
});
test('047 reaction starts at observed episode tick, persists refreshed targets and acceleration recovery is jerk bounded', () => {
  const s = setup([3, 4, 2, 0.5]);
  try {
    let previous = 0;
    for (let tick = 1; tick <= 80; tick++) {
      const result = s.owner.step(s.input(tick, tick <= 35 ? 15 : 0, tick <= 35));
      if (tick <= 35) assert.equal(result.brakeEventTick, 1);
      if (tick <= 30) assert.equal(result.command.brake, 0);
      if (tick === 31) assert.equal(result.accelerationMps2, -4);
      if (result.accelerationMps2 > previous)
        assert(result.accelerationMps2 - previous <= 2 / 60 + 1e-12);
      previous = result.accelerationMps2;
    }
  } finally {
    s.dispose();
  }
});
test('047 power cap and signed reverse speed preserve finite bounded common commands', () => {
  const s = setup([6, 8, 15, 0]);
  try {
    for (let tick = 1; tick <= 60; tick++) {
      const result = s.owner.step(s.input(tick, tick < 60 ? 20 : -4, false));
      assert(result.command.throttle >= 0 && result.command.throttle <= 1);
      assert(result.command.brake >= 0 && result.command.brake <= 1);
      if (tick < 60) assert.equal(result.availableAccelerationMps2, 90000 / 20 / 1400);
      else {
        assert.equal(result.command.throttle, 0);
        assert(result.command.brake > 0);
      }
    }
  } finally {
    s.dispose();
  }
});
test('047 complete admission rejects repeated/nonconsecutive/malformed tick before effects; stale authority/profile release', () => {
  const s = setup();
  try {
    const first = s.input(1, 0, false);
    s.owner.step(first);
    assert.throws(() => s.owner.step(first), /consecutive/);
    assert.throws(() => s.owner.step({ ...first, tick: 3 }), /consecutive/);
    assert.throws(
      () =>
        s.owner.step({
          ...first,
          tick: 2,
          observation: { ...first.observation, longitudinalSpeedMps: NaN },
        }),
      /finite/,
    );
    assert.throws(
      () => s.owner.step({ ...first, tick: 2, profile: { ...s.profile } }),
      /provenance/,
    );
    const next = s.input(2, 0, false);
    assert(s.owner.step(next).accelerationMps2 > 0);
    const manual = s.owner.step({ ...s.input(3), authority: 'MANUAL' });
    assert.equal(manual.phase, 'RELEASED');
    assert.equal(manual.command.brake, 0);
    const foreign = s.owner.step({
      ...s.input(4),
      target: { ...next.target!, profileVersionId: 'wrong-version' },
    });
    assert.equal(foreign.reason, 'PROFILE_VERSION_MISMATCH');
    const old = { ...s.input(5), target: first.target };
    assert.equal(s.owner.step(old).reason, 'TRACK_TARGET');
    const stale = { ...s.input(6), target: first.target };
    assert.equal(s.owner.step(stale).reason, 'TRACK_TARGET');
    const expired = { ...s.input(7), target: first.target };
    assert.equal(s.owner.step(expired).reason, 'STALE_TARGET');
    s.owner.setSuspended(true);
    assert.equal(s.owner.step(s.input(8)).reason, 'SUSPENDED');
    s.owner.setSuspended(false);
    const resumed = s.owner.step(s.input(9));
    assert.equal(resumed.brakeEventTick, 9);
    const changed = compileLongitudinalProfile({
      ...longitudinalProfile(),
      versionId: '047-next-version',
    });
    const changedTargets = createLongitudinalTargetFixture(changed.cruise, actor, scope);
    try {
      const transition = s.owner.step({
        ...s.input(10),
        profile: changed,
        target: changedTargets.target(10),
      });
      assert.equal(transition.brakeEventTick, 10);
    } finally {
      changedTargets.dispose();
    }
  } finally {
    s.dispose();
  }
});
test('047 descriptor compiler is detached, bounded, rejects getters/forged units and reentry; guard releases after failure', () => {
  const original = longitudinalProfile(),
    compiled = compileLongitudinalProfile(original);
  original.parameters.desired_acceleration = 5;
  assert.equal(compiled.values.desired_acceleration, 1.5);
  for (const key of LONGITUDINAL_KEYS) assert.equal(compiled.provenance[key], 'BASE');
  assert.equal(compiled.cruise.versionId, compiled.versionId);
  assert.equal(compiled.engineVersion, 'academy-engine-compatible-v1');
  const getter = Object.defineProperty(longitudinalProfile(), 'parameters', {
    get() {
      throw new Error('Getter executed');
    },
    enumerable: true,
  });
  assert.throws(() => compileLongitudinalProfile(getter), /data field/);
  assert.throws(
    () => compileLongitudinalProfile({ ...longitudinalProfile(), engineVersion: 'x'.repeat(129) }),
    /identity/,
  );
  const invalid = longitudinalProfile();
  invalid.unitsByParameter.desired_acceleration = 'm/s';
  assert.throws(() => compileLongitudinalProfile(invalid), /unit/);
  const proxy = new Proxy(longitudinalProfile(), {
    ownKeys(target) {
      compileLongitudinalProfile(longitudinalProfile());
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(() => compileLongitudinalProfile(proxy), /Reentrant/);
  assert.equal(compileLongitudinalProfile(longitudinalProfile()).values.desired_acceleration, 1.5);
});
test('047 only four new policies allow manual publication; positive LEARNED evidence cannot grant estimator support', () => {
  const candidate = longitudinalProfile();
  for (const key of LONGITUDINAL_KEYS) {
    assert.equal(getParameterDefinition(key).implemented, true);
    assert.equal(getParameterDefinition(key).estimable, false);
    candidate.provenanceByParameter[key] = 'MANUAL_TUNING';
  }
  const manual = compileLongitudinalProfile(candidate);
  assert(LONGITUDINAL_KEYS.every((key) => manual.provenance[key] === 'MANUAL_TUNING'));
  assert.equal(getParameterDefinition('braking_jerk').implemented, false);
  assert.equal(getParameterDefinition('following_time_headway').implemented, false);
  const learned = {
    ...candidate,
    provenanceByParameter: { ...candidate.provenanceByParameter, desired_acceleration: 'LEARNED' },
    evidenceByParameter: {
      ...candidate.evidenceByParameter,
      desired_acceleration: {
        key: 'desired_acceleration',
        effectiveCount: 4,
        contexts: ['straight'],
        quality: 1,
        uncertainty: 0,
        sourceSegmentIds: ['observed'],
        estimatorVersion: 'forged-positive',
      },
    },
    sourceSegmentIds: ['observed'],
  };
  assert.throws(() => compileLongitudinalProfile(learned), /LEARNED/);
});
test('047 caches one deeply frozen target, reparses mutable target/actor and clears cache on lifecycle release', () => {
  const s = setup([1.5, 2.5, 4, 0]);
  try {
    const first = s.input(1),
      mutableActor = { ...first.target!.actor },
      shallow = Object.freeze({ ...first.target!, actor: mutableActor });
    s.owner.step({ ...first, target: shallow });
    assert.equal(s.owner.getStats().cachedTargets, 0);
    mutableActor.id = 'foreign';
    const second = s.input(2);
    assert.equal(s.owner.step({ ...second, target: shallow }).reason, 'FOREIGN_TARGET');
    const third = s.input(3),
      mutable = { ...third.target! };
    s.owner.step({ ...third, target: mutable });
    assert.equal(s.owner.getStats().cachedTargets, 0);
    mutable.targetMps = 10;
    const fourth = s.input(4);
    assert.equal(s.owner.step({ ...fourth, target: mutable }).targetMps, 10);
    const fifth = s.input(5);
    let reflections = 0;
    const frozenProxy = new Proxy(fifth.target!, {
      getOwnPropertyDescriptor(target, key) {
        reflections++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    s.owner.step({ ...fifth, target: frozenProxy });
    assert.equal(s.owner.getStats().cachedTargets, 1);
    const initialReflections = reflections,
      sixth = s.input(6);
    s.owner.step({ ...sixth, target: frozenProxy });
    assert.equal(reflections, initialReflections, 'No repeated immutable target reflection');
    s.owner.step({ ...s.input(7), authority: 'MANUAL' });
    assert.equal(s.owner.getStats().cachedTargets, 0);
    s.owner.setSuspended(true);
    assert.equal(s.owner.getStats().cachedTargets, 0);
  } finally {
    s.dispose();
  }
});
test('047 immutable diagnostic target caches admission while clearing actuation and rechecking lifecycle binding', () => {
  const s = setup();
  try {
    assert(s.owner.step(s.input(1, 0, false)).accelerationMps2 > 0);
    assert.equal(s.owner.step(s.input(2)).brakeEventTick, 2);
    const third = s.input(3);
    let reflections = 0;
    const diagnostic = new Proxy(
      Object.freeze({ ...third.target!, reason: 'INCOMPLETE_CONTEXT', targetMps: 0 }),
      {
        getOwnPropertyDescriptor(target, key) {
          reflections++;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    const released = s.owner.step({ ...third, target: diagnostic });
    assert.equal(released.phase, 'RELEASED');
    assert.equal(released.reason, 'INVALID_TARGET_DIAGNOSTIC');
    assert.equal(released.accelerationMps2, 0);
    assert.equal(released.brakeEventTick, null);
    assert.equal(released.command.throttle, 0);
    assert.equal(released.command.brake, 0);
    assert.equal(s.owner.getStats().cachedTargets, 1);
    const initialReflections = reflections;
    s.owner.step({ ...s.input(4), target: diagnostic });
    assert.equal(reflections, initialReflections);
    s.owner.step({ ...s.input(5), target: diagnostic, authority: 'MANUAL' });
    assert.equal(s.owner.getStats().cachedTargets, 0);
    s.owner.step({ ...s.input(6), target: diagnostic });
    assert.equal(s.owner.getStats().cachedTargets, 1);
    for (const tick of [7, 8]) s.owner.step({ ...s.input(tick), target: diagnostic });
    assert.equal(s.owner.step({ ...s.input(9), target: diagnostic }).reason, 'STALE_TARGET');
    assert.equal(s.owner.getStats().cachedTargets, 0);
    const tenth = s.input(10),
      replacement = compileLongitudinalProfile({
        ...longitudinalProfile(),
        versionId: '047-replacement-v2',
      });
    s.owner.step({
      ...tenth,
      target: Object.freeze({ ...tenth.target!, reason: 'INCOMPLETE_CONTEXT' }),
    });
    assert.equal(s.owner.getStats().cachedTargets, 1);
    const next = s.input(11);
    assert.equal(
      s.owner.step({ ...next, profile: replacement }).reason,
      'PROFILE_VERSION_MISMATCH',
    );
    assert.equal(s.owner.getStats().cachedTargets, 0);
    s.owner.setSuspended(true);
    assert.equal(s.owner.getStats().cachedTargets, 0);
  } finally {
    s.dispose();
  }
});

test('047 separately snapshots mutable actor identity again after observation reflection', () => {
  const s = setup();
  try {
    const input = s.input(1),
      mutableActor = { ...input.actor };
    const observation = new Proxy(
      { ...input.observation, actor: mutableActor },
      {
        ownKeys(target) {
          mutableActor.incarnation++;
          return Reflect.ownKeys(target);
        },
      },
    );
    assert.equal(
      s.owner.step({ ...input, actor: mutableActor, observation }).reason,
      'FOREIGN_OR_STALE_OBSERVATION',
    );
    assert.equal(s.owner.getStats().cachedTargets, 0);
  } finally {
    s.dispose();
  }
});
test('047 guarded detached scratch survives partial descriptor failure without leaking prior values or mutating published results', () => {
  const s = setup();
  try {
    const first = s.owner.step(s.input(1, 0, false));
    assert.equal(s.owner.getStats().scratchRetainedFields, 0);
    const retained = structuredClone(first);
    const second = s.input(2);
    const partial = new Proxy(second, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'observation') throw new Error('Partial descriptor failure');
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    assert.throws(() => s.owner.step(partial), /Partial descriptor failure/);
    assert.equal(s.owner.getStats().scratchRetainedFields, 0);
    const next = s.owner.step(second);
    assert.equal(next.brakeEventTick, 2);
    assert.deepEqual(first, retained);
    assert(Object.isFrozen(first) && Object.isFrozen(first.command));
    const third = s.input(3),
      malformed = { ...third.observation, actor: { ...third.actor, incarnation: NaN } };
    assert.throws(() => s.owner.step({ ...third, observation: malformed }));
    assert.equal(s.owner.getStats().scratchRetainedFields, 0);
    assert.equal(s.owner.step(third).brakeEventTick, 2);
    assert.equal(s.owner.getStats().scratchRetainedFields, 0);
  } finally {
    s.dispose();
  }
});
test('047 every detached scratch schema field clears caller objects after rejected admission', () => {
  const s = setup();
  try {
    const input = s.input(1),
      callerGraph = { nested: { retained: true } };
    for (const key of Object.keys(input)) {
      assert.throws(() =>
        s.owner.step({ ...input, [key]: callerGraph } as unknown as LongitudinalInput),
      );
      assert.equal(s.owner.getStats().scratchRetainedFields, 0, `input ${key}`);
    }
    for (const key of Object.keys(input.observation)) {
      assert.throws(() =>
        s.owner.step({
          ...input,
          observation: { ...input.observation, [key]: callerGraph },
        } as unknown as LongitudinalInput),
      );
      assert.equal(s.owner.getStats().scratchRetainedFields, 0, `observation ${key}`);
    }
    for (const slot of ['actor', 'observationActor'])
      for (const key of ['id', 'incarnation']) {
        const badActor = { ...input.actor, [key]: callerGraph };
        assert.throws(() =>
          s.owner.step(
            (slot === 'actor'
              ? { ...input, actor: badActor }
              : {
                  ...input,
                  observation: { ...input.observation, actor: badActor },
                }) as unknown as LongitudinalInput,
          ),
        );
        assert.equal(s.owner.getStats().scratchRetainedFields, 0, `${slot} ${key}`);
      }
    assert.equal(s.owner.step(input).brakeEventTick, 1);
    assert.equal(s.owner.getStats().scratchRetainedFields, 0);
  } finally {
    s.dispose();
  }
});
test('047 private plain scratch own fields ignore inherited caller setters and release all values', () => {
  const s = setup();
  const input = s.input(1);
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'actor');
  assert.equal(previous, undefined);
  let inheritedCalls = 0;
  try {
    Object.defineProperty(Object.prototype, 'actor', {
      configurable: true,
      get() {
        inheritedCalls++;
        throw new Error('Inherited scratch getter');
      },
      set() {
        inheritedCalls++;
        throw new Error('Inherited scratch setter');
      },
    });
    assert.equal(s.owner.step(input).brakeEventTick, 1);
    assert.equal(s.owner.getStats().scratchRetainedFields, 0);
    assert.equal(inheritedCalls, 0);
  } finally {
    delete (Object.prototype as { actor?: unknown }).actor;
    s.dispose();
  }
});
test('047 fixed private readers reject substituted observation/actor keys and reentrant descriptor traps atomically', () => {
  const s = setup();
  try {
    const input = s.input(1);
    for (const slot of ['observation', 'actor', 'observationActor']) {
      const original = slot === 'observation' ? input.observation : input.actor;
      const firstKey = Reflect.ownKeys(original)[0];
      for (const substituted of [Symbol('hidden'), 'unexpected']) {
        const proxy = new Proxy(original, {
          ownKeys(target) {
            return Reflect.ownKeys(target).map((key) => (key === firstKey ? substituted : key));
          },
        });
        const bad =
          slot === 'observation'
            ? { ...input, observation: proxy }
            : slot === 'actor'
              ? { ...input, actor: proxy }
              : { ...input, observation: { ...input.observation, actor: proxy } };
        assert.throws(() => s.owner.step(bad as LongitudinalInput), /schema key/);
        assert.equal(s.owner.getStats().scratchRetainedFields, 0);
      }
      const reentrant = new Proxy(original, {
        getOwnPropertyDescriptor(target, key) {
          s.owner.step(input);
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
      const bad =
        slot === 'observation'
          ? { ...input, observation: reentrant }
          : slot === 'actor'
            ? { ...input, actor: reentrant }
            : { ...input, observation: { ...input.observation, actor: reentrant } };
      assert.throws(() => s.owner.step(bad as LongitudinalInput), /Unavailable/);
      assert.equal(s.owner.getStats().scratchRetainedFields, 0);
    }
    assert.equal(s.owner.step(input).brakeEventTick, 1);
  } finally {
    s.dispose();
  }
});

test('047 malformed frozen/accessor/reentrant targets cannot enter the cache or mutate tick state', () => {
  const s = setup();
  try {
    const input = s.input(1);
    assert.throws(
      () => s.owner.step({ ...input, target: Object.freeze({ ...input.target!, targetMps: NaN }) }),
      /finite/,
    );
    const getter = Object.freeze(
      Object.defineProperty({ ...input.target! }, 'targetMps', {
        get() {
          throw new Error('Getter ran');
        },
        enumerable: true,
      }),
    );
    assert.throws(() => s.owner.step({ ...input, target: getter }), /data fields/);
    const proxy = new Proxy(input.target!, {
      getOwnPropertyDescriptor(target, key) {
        s.owner.step(input);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    assert.throws(() => s.owner.step({ ...input, target: proxy }), /Unavailable/);
    assert.equal(s.owner.getStats().cachedTargets, 0);
    assert.equal(s.owner.step(input).brakeEventTick, 1);
    assert.equal(s.owner.getStats().cachedTargets, 1);
  } finally {
    s.dispose();
  }
});
test('047 exact small data schemas reject oversized, unknown, accessor, symbol, array and foreign prototype before mutation', () => {
  const s = setup();
  try {
    const input = s.input(1);
    let descriptorCopies = 0;
    const oversized = new Proxy(
      { ...input, extra: 1 },
      {
        getOwnPropertyDescriptor(target, key) {
          descriptorCopies++;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    assert.throws(() => s.owner.step(oversized), /fields\/capacity/);
    assert.equal(descriptorCopies, 0);
    for (const swapped of [Symbol('substitution'), 'unexpected']) {
      const hiddenKey = new Proxy(input, {
        ownKeys(target) {
          return Reflect.ownKeys(target).map((key) => (key === 'authority' ? swapped : key));
        },
      });
      assert.throws(() => s.owner.step(hiddenKey), /schema key/);
    }
    const { authority: ignored, ...missing } = input;
    assert.equal(ignored, 'AUTO');
    assert.throws(
      () => s.owner.step({ ...missing, unexpected: 'AUTO' } as unknown as LongitudinalInput),
      /data fields|schema key/,
    );
    assert.throws(
      () =>
        s.owner.step(
          Object.defineProperty({ ...input }, 'tick', {
            get() {
              throw new Error('Getter ran');
            },
            enumerable: true,
          }),
        ),
      /data fields|schema key/,
    );
    assert.throws(() => s.owner.step({ ...input, [Symbol('extra')]: 1 }), /fields\/capacity/);
    assert.throws(() => s.owner.step([] as unknown as LongitudinalInput), /data object/);
    assert.throws(
      () => s.owner.step(Object.assign(Object.create({ inherited: true }), input)),
      /plain/,
    );
    const reentrant = new Proxy(input, {
      ownKeys(target) {
        s.owner.step(input);
        return Reflect.ownKeys(target);
      },
    });
    assert.throws(() => s.owner.step(reentrant), /Unavailable/);
    assert.equal(s.owner.step(input).brakeEventTick, 1);
  } finally {
    s.dispose();
  }
});
test('047 bounded actor admission catches late Proxy length and epoch/incarnation lifecycle, twenty ownership cycles', () => {
  const owner = createLongitudinalController(scope);
  const oversized = Array.from({ length: 111 }, (_, i) => ({ id: `car-${i}`, incarnation: 1 }));
  const late = new Proxy(oversized, {
    get(target, key, receiver) {
      return key === 'length' ? 0 : Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => owner.setActors(late, scope), /Detached.*capacity/);
  assert.equal(owner.getStats().actors, 0);
  owner.setActors([actor], scope);
  owner.setActors([], scope);
  assert.throws(() => owner.setActors([actor], scope), /Retired/);
  owner.setActors([{ ...actor, incarnation: 2 }], scope);
  owner.reset(scope.sessionId, 1);
  assert.equal(owner.getStats().identities, 0);
  assert.throws(() => owner.setActors([actor], scope), /Foreign/);
  owner.dispose();
  for (let cycle = 0; cycle < 20; cycle++) {
    const fresh = createLongitudinalController(scope);
    fresh.setActors(oversized.slice(0, 110), scope);
    assert.equal(fresh.getStats().actors, 110);
    fresh.dispose();
    assert.equal(fresh.getStats().actors, 0);
    assert.equal(fresh.getStats().identities, 0);
  }
});
test('047 the1024 identity watermark is bounded and1025 admission rejects atomically', () => {
  const owner = createLongitudinalController(scope);
  try {
    for (let first = 0; first < 1024; first += 110)
      owner.setActors(
        Array.from({ length: Math.min(110, 1024 - first) }, (_, offset) => ({
          id: `id-${first + offset}`,
          incarnation: 1,
        })),
        scope,
      );
    assert.equal(owner.getStats().identities, 1024);
    const before = owner.getStats();
    assert.throws(
      () => owner.setActors([{ id: 'overflow', incarnation: 1 }], scope),
      /identity capacity/,
    );
    assert.deepEqual(owner.getStats(), before);
  } finally {
    owner.dispose();
  }
});
test('047 real024 native launch realizes positive jerk bounded throttle for both classes', async () => {
  for (const classId of ['sedan', 'compact'] as const) {
    const episode = await createLongitudinalDrivingEpisode(
      classId,
      'dry-asphalt',
      false,
      false,
      false,
    );
    try {
      while (!episode.complete) episode.step();
      const result = episode.result();
      assert(result.trace.at(-1)!.speedMps > 3);
      assert(result.trace.at(-1)!.position.z > 3);
      assert(
        result.trace.every(
          (row) =>
            row.command.throttle > 0 &&
            row.command.throttle <= 1 &&
            row.command.brake === 0 &&
            row.command.source === 'AUTONOMY',
        ),
      );
      assert.equal(result.trace[0].accelerationMps2, 4 / 60);
      assert.equal(result.trace.at(-1)!.accelerationMps2, 1.5);
    } finally {
      assert.equal(episode.dispose().body.entities, 0);
    }
  }
});
for (const classId of ['sedan', 'compact'] as const)
  test(`047 ${classId} actual Rapier/024 normal stop and delayed risky obstacle impact stay finite on both surfaces`, async () => {
    for (const surface of ['dry-asphalt', 'reduced-adhesion'] as const)
      for (const risky of [false, true]) {
        const episode = await createLongitudinalDrivingEpisode(classId, surface, risky);
        try {
          while (!episode.complete) episode.step();
          const result = episode.result();
          assert(result.stopped);
          assert(
            result.trace.every(
              (row) =>
                Object.values(row.position).every(Number.isFinite) &&
                Object.values(row.velocity).every(Number.isFinite),
            ),
          );
          assert(
            result.trace
              .slice(0, 1 + Math.ceil(longitudinalValues[risky ? 1 : 0][3] * 60))
              .every((row) => row.brakeEventTick === 1),
          );
          assert(result.trace.some((row) => row.command.brake > 0));
          assert.equal(
            result.trace.find((row) => row.command.brake > 0)!.tick,
            1 + Math.ceil(longitudinalValues[risky ? 1 : 0][3] * 60),
          );
          assert.equal(result.mechanics.surface.id, surface);
          if (risky) {
            assert(result.collisionImpulseNs > result.mechanics.massKg);
            assert(result.pathM > 70);
            assert(result.trace.slice(0, 90).every((row) => row.command.brake === 0));
          } else {
            assert.equal(result.collisionImpulseNs, 0);
            assert(result.pathM < 70);
          }
        } finally {
          const cleanup = episode.dispose();
          assert.equal(cleanup.body.entities, 0);
          assert.equal(cleanup.body.subscriptions, 0);
          assert.equal(cleanup.policy.actors, 0);
          assert.equal(cleanup.controller.vehicles, 0);
        }
      }
  });
