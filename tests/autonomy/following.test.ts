import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compileFollowingProfile,
  evaluateFollowingTarget,
  getFollowingStats,
} from '../../src/autonomy/following';
import type { FollowingInput } from '../../src/autonomy/following';
import { createLongitudinalController } from '../../src/autonomy/longitudinal-control';
import {
  followingProfile,
  followingKeys,
  followingValues,
  referenceFollowing,
} from './following-reference';
import { createFollowingTargetFixture } from './following-target-fixture';
import { isGeneratedRoadContext } from '../../src/autonomy/road-context';
import { evaluateCruiseTarget, getCruiseTargetContext } from '../../src/autonomy/cruise-targets';
const scope = { sessionId: '048-test', worldEpoch: 0 },
  actor = { id: 'car', incarnation: 1 };
function setup(values: readonly number[] = followingValues) {
  const profile = compileFollowingProfile(followingProfile(values));
  const fixture = createFollowingTargetFixture(profile.longitudinal.cruise, actor, scope);
  return {
    profile,
    fixture,
    input(tick = 1, speed = 5, gap = 8, leaderSpeed = 4, leader: string | null = 'leader') {
      const f = fixture.input(tick, speed, gap, leaderSpeed, leader);
      return {
        cruiseInput: f.cruiseInput,
        roadContext: f.roadContext,
        observation: f.observation,
        profile,
      };
    },
  };
}
test('048 genuine weak provenance admits immutable producer data only and preserves lifecycle diagnostics', () => {
  const f = setup();
  const input = f.input();
  const road = input.roadContext;
  assert(isGeneratedRoadContext(road));
  assert(Object.isFrozen(road) && Object.isFrozen(road.subject));
  assert(Object.isFrozen(road.completeness) && Object.isFrozen(road.leader));
  const cruise = evaluateCruiseTarget(input.cruiseInput);
  const context = getCruiseTargetContext(cruise)!;
  assert(Object.isFrozen(context) && Object.isFrozen(context.subject));
  assert.deepEqual(context, input.cruiseInput.context);
  for (const foreign of [{ ...cruise }, JSON.parse(JSON.stringify(cruise)), new Proxy(cruise, {})])
    assert.throws(() => getCruiseTargetContext(foreign), /provenance/);
  assert.equal(
    getCruiseTargetContext(evaluateCruiseTarget({ ...input.cruiseInput, context: null })),
    null,
  );
  for (const foreign of [
    Object.freeze({ ...road }),
    JSON.parse(JSON.stringify(road)),
    new Proxy(road, {}),
  ]) {
    assert.equal(isGeneratedRoadContext(foreign), false);
    assert.deepEqual(
      evaluateFollowingTarget({ ...input, roadContext: foreign }),
      evaluateFollowingTarget(input),
    );
  }
  let reads = 0;
  const proxy = new Proxy(road, {
    getOwnPropertyDescriptor(target, key) {
      reads++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  evaluateFollowingTarget({ ...input, roadContext: proxy });
  assert(reads > 0);
  const oldResult = evaluateFollowingTarget(input);
  f.fixture.dispose();
  assert(isGeneratedRoadContext(road));
  assert.deepEqual(evaluateFollowingTarget(input), oldResult);
  assert.equal(
    evaluateFollowingTarget({
      ...input,
      observation: { ...input.observation, worldEpoch: 1 },
    }).reason,
    'FOREIGN_OR_STALE_FOLLOWING_OBSERVATION',
  );
  assert.equal(
    evaluateFollowingTarget({
      ...input,
      cruiseInput: { ...input.cruiseInput, decisionTick: 100 },
      observation: { ...input.observation, tick: 100 },
    }).reason,
    'STALE_CONTEXT',
  );
  assert.equal(getFollowingStats().scratchRetainedFields, 0);
});
test('048 actual044/045/046 oracle at varying speeds/gaps/profile extremes', () => {
  for (const values of [followingValues, [0.2, 0.2, 0.2, 0.1], [5, 15, 10, 2]]) {
    const f = setup(values);
    try {
      let tick = 0;
      for (const speed of [0, 0.05, 1, 5, 15, 30])
        for (const leaderSpeed of [0, 0.1, 0.11, 2, 10, 30])
          for (const gap of [0, 0.2, 2, 8, 20, 35]) {
            const input = f.input(++tick, speed, gap, leaderSpeed),
              result = evaluateFollowingTarget(input),
              leader = input.roadContext.leader!;
            assert(leader);
            const oracle = referenceFollowing(
              values,
              speed,
              leaderSpeed,
              leader.gapM,
              input.cruiseInput.facts!.postedLimitMps - 2,
            );
            assert.equal(result.desiredGapM, oracle.desiredGapM);
            assert.equal(result.target.targetMps, oracle.targetMps);
            assert.equal(result.leader?.id, leader.id);
          }
    } finally {
      f.fixture.dispose();
    }
  }
});
test('048 all four parameters individually effective, queue gap does not inherit moving minimum', () => {
  const scenarios = [
    [0, 5, 14, 4],
    [1, 5, 14, 4],
    [2, 0, 3, 0],
    [3, 5, 14, 4],
  ];
  for (const [key, speed, gap, leaderSpeed] of scenarios) {
    const a = setup(),
      changed = [...followingValues];
    changed[key] += key === 3 ? 0.2 : 1;
    const b = setup(changed);
    try {
      const first = evaluateFollowingTarget(a.input(1, speed, gap, leaderSpeed)),
        second = evaluateFollowingTarget(b.input(1, speed, gap, leaderSpeed));
      assert.notEqual(first.target.targetMps, second.target.targetMps, followingKeys[key]);
    } finally {
      a.fixture.dispose();
      b.fixture.dispose();
    }
  }
  const f = setup([5, 15, 0.2, 0.7]);
  try {
    assert.equal(evaluateFollowingTarget(f.input(1, 0, 0.2, 0)).desiredGapM, 0.2);
  } finally {
    f.fixture.dispose();
  }
});
test('048 switched/disappeared/reincarnated leaders do not retain previous distance target;047 real admission', () => {
  const f = setup(),
    controller = createLongitudinalController(scope);
  controller.setActors([actor], scope);
  try {
    for (let tick = 1; tick <= 6; tick++) {
      const input = f.input(
          tick,
          5,
          tick === 1 ? 1 : 8,
          4,
          tick === 3 ? null : tick === 2 ? 'replacement' : 'leader',
        ),
        result = evaluateFollowingTarget(input);
      assert.equal(
        result.leader?.id ?? null,
        tick === 3 ? null : tick === 2 ? 'replacement' : 'leader',
      );
      if (tick === 3) {
        assert.equal(result.desiredGapM, null);
        assert.equal(result.target.reason, 'FREE_ROAD');
      }
      const realized = controller.step({
        ...scope,
        actor,
        tick,
        authority: 'AUTO',
        profile: f.profile.longitudinal,
        target: result.target,
        observation: {
          version: '047-observation-v1',
          units: 'SI',
          ...scope,
          actor,
          tick,
          longitudinalSpeedMps: 5,
          classId: 'sedan',
          classVersion: '023-mechanics-v1',
        },
      });
      assert.equal(realized.reason, 'TRACK_TARGET');
    }
  } finally {
    controller.dispose();
    const cleanup = f.fixture.dispose();
    assert.equal(cleanup.road.cachedContexts, 0);
    assert.equal(controller.getStats().actors, 0);
  }
});
test('048 diagnostics discard leader on authority/profile/context/observation lifecycle and stop wins', () => {
  const f = setup();
  try {
    const input = f.input();
    const run = (patch: Partial<FollowingInput>) => evaluateFollowingTarget({ ...input, ...patch });
    for (const patch of [
      { profile: null },
      { observation: { ...input.observation, tick: 2 } },
      { roadContext: null },
      { roadContext: { ...input.roadContext, worldEpoch: 1 } },
      { roadContext: { ...input.roadContext, tick: 0 } },
      { roadContext: { ...input.roadContext, discontinuity: true } },
      { cruiseInput: { ...input.cruiseInput, authority: 'MANUAL' as const } },
      { cruiseInput: { ...input.cruiseInput, actor: { ...actor, incarnation: 2 } } },
    ]) {
      const result = run(patch);
      assert.equal(result.leader, null);
      assert.equal(result.desiredGapM, null);
      assert.equal(result.target.targetMps, 0);
    }
    const frame = f.fixture.input(2, 5, 8, 4, 'leader', 2, 20, true);
    const result = evaluateFollowingTarget({
      cruiseInput: frame.cruiseInput,
      roadContext: frame.roadContext,
      observation: frame.observation,
      profile: f.profile,
    });
    assert.equal(result.target.reason, 'BEHAVIOR_STOP');
    assert.equal(result.leader, null);
  } finally {
    f.fixture.dispose();
  }
});
test('048 compilation is bounded, detached, provenance gated; forged tokens and invalid units fail', () => {
  const raw = followingProfile(),
    profile = compileFollowingProfile(raw);
  assert.deepEqual(Object.keys(profile.values), followingKeys);
  assert(Object.isFrozen(profile.values));
  raw.parameters.following_time_headway = 4;
  assert.equal(profile.values.following_time_headway, 1.8);
  for (const key of followingKeys) {
    const p = followingProfile();
    delete (p.parameters as Record<string, unknown>)[key];
    assert.throws(() => compileFollowingProfile(p));
  }
  const malformed = followingProfile();
  malformed.unitsByParameter.following_time_headway = 'm';
  assert.throws(() => compileFollowingProfile(malformed));
  const f = setup();
  try {
    assert.throws(() => evaluateFollowingTarget({ ...f.input(), profile: { ...f.profile } }));
  } finally {
    f.fixture.dispose();
  }
  const accessor = followingProfile();
  let calls = 0;
  Object.defineProperty(accessor, 'parameters', {
    enumerable: true,
    get() {
      calls++;
      return {};
    },
  });
  assert.throws(() => compileFollowingProfile(accessor));
  assert.equal(calls, 0);
  const learned = followingProfile();
  learned.provenanceByParameter.following_min_gap = 'LEARNED';
  assert.throws(() => compileFollowingProfile(learned));
});
test('048 rejects accessor/symbol/unknown/prototype inputs without invoking hooks, captures proxy fields once', () => {
  const f = setup();
  try {
    const input = f.input();
    let calls = 0;
    for (const bad of [
      { ...input, extra: 1 },
      { ...input, [Symbol('extra')]: 1 },
      Object.assign(Object.create({ x: 1 }), input),
    ])
      assert.throws(() => evaluateFollowingTarget(bad));
    const accessor = { ...input };
    Object.defineProperty(accessor, 'cruiseInput', {
      enumerable: true,
      get() {
        calls++;
        return input.cruiseInput;
      },
    });
    assert.throws(() => evaluateFollowingTarget(accessor));
    assert.equal(calls, 0);
    const nested = { ...input.cruiseInput };
    Object.defineProperty(nested, 'context', {
      enumerable: true,
      get() {
        calls++;
        return input.cruiseInput.context;
      },
    });
    assert.throws(() => evaluateFollowingTarget({ ...input, cruiseInput: nested }));
    assert.equal(calls, 0);
    let reads = 0;
    const proxy = new Proxy(input.cruiseInput, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'context') reads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    evaluateFollowingTarget({ ...input, cruiseInput: proxy });
    assert.equal(reads, 1);
  } finally {
    f.fixture.dispose();
  }
});
test('048 optimized compact admission captures leader/subject once and retains strict primitive validation', () => {
  const f = setup();
  try {
    const input = f.input();
    let leaderReads = 0,
      subjectReads = 0;
    const leader = new Proxy(input.roadContext.leader!, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'id') {
          leaderReads++;
          return {
            ...Reflect.getOwnPropertyDescriptor(target, key)!,
            value: leaderReads === 1 ? 'leader' : 'substituted',
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const subject = new Proxy(input.roadContext.subject, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'id') subjectReads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const result = evaluateFollowingTarget({
      ...input,
      roadContext: { ...input.roadContext, leader, subject },
    });
    assert.equal(result.leader?.id, 'leader');
    assert.equal(leaderReads, 1);
    assert.equal(subjectReads, 1);
    for (const malformed of [
      { ...input.roadContext, leader: { ...input.roadContext.leader!, gapM: NaN } },
      { ...input.roadContext, leader: { ...input.roadContext.leader!, speedMps: 101 } },
      {
        ...input.roadContext,
        completeness: { ...input.roadContext.completeness, obstacles: 'true' },
      },
      { ...input.roadContext, discontinuity: 1 },
      { ...input.roadContext, leader: { ...input.roadContext.leader!, id: 'car' } },
    ])
      assert.throws(() =>
        evaluateFollowingTarget({
          ...input,
          roadContext: malformed as unknown as FollowingInput['roadContext'],
        }),
      );
    let invoked = 0;
    const completeness = { ...input.roadContext.completeness };
    Object.defineProperty(completeness, 'vehicles', {
      enumerable: true,
      get() {
        invoked++;
        return true;
      },
    });
    assert.throws(() =>
      evaluateFollowingTarget({ ...input, roadContext: { ...input.roadContext, completeness } }),
    );
    assert.equal(invoked, 0);
  } finally {
    f.fixture.dispose();
  }
});
test('048 private scratch clears every field after success, partial failure and nested reentry without result aliases', () => {
  const f = setup();
  try {
    const good = f.input();
    const first = evaluateFollowingTarget(good);
    assert.equal(getFollowingStats().scratchRetainedFields, 0);
    const frozen = JSON.stringify(first);
    let failureTick = 1;
    for (const [part, key] of [
      ['root', 'profile'],
      ['cruise', 'mechanics'],
      ['context', 'subject'],
      ['observation', 'longitudinalSpeedMps'],
      ['road', 'completeness'],
      ['leader', 'speedMps'],
      ['completeness', 'signals'],
    ]) {
      const input = f.input(++failureTick);
      let object: object;
      if (part === 'root') object = input;
      else if (part === 'cruise') object = input.cruiseInput;
      else if (part === 'context') object = input.cruiseInput.context!;
      else if (part === 'observation') object = input.observation;
      else if (part === 'road') {
        input.roadContext = { ...input.roadContext };
        object = input.roadContext;
      } else if (part === 'leader') {
        input.roadContext = { ...input.roadContext, leader: { ...input.roadContext.leader! } };
        object = input.roadContext.leader!;
      } else {
        input.roadContext = {
          ...input.roadContext,
          completeness: { ...input.roadContext.completeness },
        };
        object = input.roadContext.completeness;
      }
      // Replace frozen domain objects only through a detached parent copy.
      if (Object.isFrozen(object)) {
        const clone = { ...object };
        if (part === 'context')
          input.cruiseInput = {
            ...input.cruiseInput,
            context: clone as NonNullable<FollowingInput['cruiseInput']['context']>,
          };
        object = clone;
      }
      Object.defineProperty(object, key, {
        enumerable: true,
        get() {
          throw new Error('Accessor invoked');
        },
      });
      assert.throws(() => evaluateFollowingTarget(input));
      assert.equal(getFollowingStats().scratchRetainedFields, 0);
      assert.equal(getFollowingStats().evaluating, false);
    }
    const reentry = new Proxy(good.observation, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'version') {
          assert.equal(getFollowingStats().evaluating, true);
          assert.throws(() => evaluateFollowingTarget(good), /Reentrant/);
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    evaluateFollowingTarget({ ...good, observation: reentry });
    assert.equal(getFollowingStats().scratchRetainedFields, 0);
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'cruiseInput');
    let calls = 0;
    Object.defineProperty(Object.prototype, 'cruiseInput', {
      configurable: true,
      set() {
        calls++;
      },
    });
    try {
      evaluateFollowingTarget(good);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'cruiseInput', previous);
      else delete (Object.prototype as Record<string, unknown>).cruiseInput;
    }
    assert.equal(calls, 0);
    assert.equal(getFollowingStats().scratchRetainedFields, 0);
    assert.equal(JSON.stringify(first), frozen);
    assert(
      Object.isFrozen(first) &&
        Object.isFrozen(first.target) &&
        Object.isFrozen(first.target.actor),
    );
  } finally {
    f.fixture.dispose();
  }
});
