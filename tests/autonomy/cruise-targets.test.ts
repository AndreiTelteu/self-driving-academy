import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileCruiseProfile,
  evaluateCruiseTarget,
  CRUISE_KEYS,
  CRUISE_LIMITS,
} from '../../src/autonomy/cruise-targets';
import type { CruiseInput } from '../../src/autonomy/cruise-targets';
import { createBehaviorFSM, projectBehaviorContext } from '../../src/autonomy/behavior-fsm';
import { createRoadContext } from '../../src/autonomy/road-context';
import {
  compileLateralTrajectory,
  createLateralController,
  LATERAL_LIMITS,
} from '../../src/autonomy/lateral-controller';
import { vehicleClass } from '../../src/vehicles/vehicle-classes';
import { roadContextFixture } from './road-context-reference';
import { cruiseProfile, cruiseValues, referenceCruise } from './cruise-targets-reference';
import { lateralTurnFixture } from './lateral-controller-fixture';
import { getParameterDefinition } from '../../src/profiles';

function scenario(values: readonly number[] = cruiseValues[0]): CruiseInput {
  const fixture = roadContextFixture(false),
    road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy });
  road.updateFrame(fixture.frame);
  const full = road.getContext('vehicle-1', { force: true })!,
    context = projectBehaviorContext(full)!,
    scope = { sessionId: context.sessionId, worldEpoch: context.worldEpoch };
  const profile = compileCruiseProfile(cruiseProfile(values)),
    owner = createBehaviorFSM(scope),
    actor = context.subject,
    decisionTick = context.sourceTick + 1;
  owner.setActors([actor], scope);
  const decision = owner.decide({
    ...scope,
    actor,
    decisionTick,
    context,
    facts: {
      version: '045-decision-facts-v1',
      profileVersionId: profile.versionId,
      routeBlocked: false,
      stop: 'NONE',
      yield: 'NONE',
      service: 'NONE',
      laneChange: 'NONE',
    },
  });
  owner.dispose();
  road.dispose();
  return {
    ...scope,
    actor,
    decisionTick,
    authority: 'AUTO',
    profile,
    context,
    behavior: decision,
    facts: {
      version: '046-road-facts-v1',
      ...scope,
      subject: actor,
      sourceTick: context.sourceTick,
      laneId: context.laneId!,
      roadKind: 'URBAN',
      postedLimitMps: full.lane!.lane.speedLimitMps,
      curveRadiusM: null,
      intersectionApproach: false,
    },
    mechanics: {
      version: '031-coverage-046-v1',
      classId: 'sedan',
      classVersion: '023-mechanics-v1',
      surface: 'dry-asphalt',
      surfaceVersion: '026-flat-surfaces-v1',
    },
  };
}
const stateReasons = {
  FOLLOW: 'FOLLOW_LANE',
  STOP: 'STOP_REQUESTED',
  YIELD: 'YIELD_CONFLICT_BY_POLICY',
  BLOCKED: 'BLOCKED_ROUTE',
  SERVICE: 'SERVICE_ACCEPTED',
  CHANGE_LANE: 'LANE_CHANGE_VALIDATED',
} as const;

test('046 actual044/045 free road, curve and approach distinguish prudent/aggressive without correcting speeding/red', () => {
  const samples: number[][] = [];
  for (const values of cruiseValues) {
    const input = scenario(values);
    const free = evaluateCruiseTarget(input),
      curve = evaluateCruiseTarget({ ...input, facts: { ...input.facts!, curveRadiusM: 16 } }),
      approach = evaluateCruiseTarget({
        ...input,
        facts: { ...input.facts!, intersectionApproach: true },
      });
    assert.equal(free.targetMps, input.facts!.postedLimitMps + values[0]);
    assert.equal(curve.targetMps, Math.min(free.targetMps, Math.sqrt(16 * values[2])));
    assert.equal(approach.targetMps, Math.min(free.targetMps, values[3]));
    assert.equal(free.behaviorReason, input.behavior!.reason);
    samples.push([free.targetMps, curve.targetMps, approach.targetMps]);
  }
  assert(samples[1].every((value, i) => value > samples[0][i]));
  const aggressive = evaluateCruiseTarget(scenario(cruiseValues[1]));
  assert(aggressive.postedDeviationMps! > 0);
});

test('046 each of four parameters individually changes target in an unsaturated isolated scenario', () => {
  const values = [0, 0, 1, 3];
  for (let i = 0; i < 4; i++) {
    const low = scenario(values),
      high = scenario(values.map((v, k) => (k === i ? v + 1 : v)));
    const facts = {
      ...low.facts!,
      roadKind: i === 1 ? ('RESIDENTIAL' as const) : ('URBAN' as const),
      postedLimitMps: 20,
      curveRadiusM: i === 2 ? 16 : null,
      intersectionApproach: i === 3,
    };
    assert(
      evaluateCruiseTarget({ ...high, facts }).targetMps >
        evaluateCruiseTarget({ ...low, facts }).targetMps,
    );
  }
});

test('046 exhaustive independent candidate oracle covers all parameter bounds, both classes/surfaces/roads and concurrent constraints', () => {
  const template = scenario();
  let cases = 0;
  for (const a of [-8, 0, 15])
    for (const b of [-8, 0, 12])
      for (const c of [0.5, 2.5, 8])
        for (const d of [1, 6, 20]) {
          const values = [a, b, c, d],
            profile = compileCruiseProfile(cruiseProfile(values));
          for (const classId of ['sedan', 'compact'] as const)
            for (const surface of ['dry-asphalt', 'reduced-adhesion'] as const)
              for (const roadKind of ['URBAN', 'RESIDENTIAL'] as const)
                for (const radius of [null, 2, 16, 100])
                  for (const intersection of [false, true])
                    for (const state of Object.keys(
                      stateReasons,
                    ) as (keyof typeof stateReasons)[]) {
                      const input = {
                        ...template,
                        profile,
                        behavior: {
                          ...template.behavior!,
                          profileVersionId: profile.versionId,
                          state,
                          reason: stateReasons[state],
                        },
                        facts: {
                          ...template.facts!,
                          roadKind,
                          postedLimitMps: 20,
                          curveRadiusM: radius,
                          intersectionApproach: intersection,
                        },
                        mechanics: { ...template.mechanics, classId, surface },
                      };
                      const actual = evaluateCruiseTarget(input);
                      assert.equal(
                        actual.targetMps,
                        referenceCruise(
                          values,
                          roadKind,
                          20,
                          radius,
                          intersection,
                          state,
                          vehicleClass(classId).turningRadiusM,
                        ),
                      );
                      assert(
                        Number.isFinite(actual.targetMps) &&
                          actual.targetMps >= 0 &&
                          actual.targetMps <= 30,
                      );
                      cases++;
                    }
        }
  assert.equal(cases, 31104);
});

test('046 mechanical coverage cap is explicit and class full-lock radius differs, without invented reduced-grip cap', () => {
  const input = scenario(cruiseValues[1]);
  const capped = evaluateCruiseTarget({ ...input, facts: { ...input.facts!, postedLimitMps: 40 } });
  assert.equal(capped.targetMps, 30);
  assert.equal(capped.styleTargetMps, 48);
  assert.equal(capped.reason, 'MECHANICAL_COVERAGE_CAP');
  const radius =
    (vehicleClass('sedan').turningRadiusM + vehicleClass('compact').turningRadiusM) / 2;
  for (const surface of ['dry-asphalt', 'reduced-adhesion'] as const) {
    const sedan = evaluateCruiseTarget({
      ...input,
      facts: { ...input.facts!, curveRadiusM: radius },
      mechanics: { ...input.mechanics, surface },
    });
    assert.equal(sedan.reason, 'MECHANICALLY_INFEASIBLE_RADIUS');
    assert.equal(sedan.targetMps, 0);
    assert(
      evaluateCruiseTarget({
        ...input,
        facts: { ...input.facts!, curveRadiusM: radius },
        mechanics: { ...input.mechanics, classId: 'compact', surface },
      }).targetMps > 0,
    );
  }
});

test('046 actual045 stop/yield/blocked/service holds retain exact policy reason and expose unused style request', () => {
  const input = scenario(cruiseValues[1]),
    scope = { sessionId: input.sessionId, worldEpoch: input.worldEpoch },
    owner = createBehaviorFSM(scope);
  owner.setActors([input.actor], scope);
  for (const [index, state] of ['STOP', 'YIELD', 'BLOCKED', 'SERVICE'].entries()) {
    const decisionTick = input.decisionTick + index,
      context = { ...input.context!, sourceTick: decisionTick };
    const decision = owner.decide({
      ...scope,
      actor: input.actor,
      decisionTick,
      context,
      facts: {
        version: '045-decision-facts-v1',
        profileVersionId: input.profile!.versionId,
        routeBlocked: state === 'BLOCKED',
        stop: state === 'STOP' ? 'RED_BY_PROFILE' : 'NONE',
        yield: state === 'YIELD' ? 'CONFLICT_BY_POLICY' : 'NONE',
        service: state === 'SERVICE' ? 'ACCEPTED' : 'NONE',
        laneChange: 'NONE',
      },
    });
    const result = evaluateCruiseTarget({
      ...input,
      context,
      decisionTick,
      behavior: decision,
      facts: { ...input.facts!, sourceTick: context.sourceTick },
    });
    assert.equal(result.targetMps, 0);
    assert.equal(result.reason, `BEHAVIOR_${state}`);
    assert.equal(result.behaviorReason, decision.reason);
    assert(result.styleTargetMps! > 0);
  }
  owner.dispose();
  assert.equal(owner.getStats().actors, 0);
});

test('046 actual049 advisory can reject aggressive style8 while prudent style1.5 tracks; policy never clamps to3.5', () => {
  const map = lateralTurnFixture(),
    world = { sessionId: '046-049', worldEpoch: 0, mapId: map.mapId, mapVersionId: 'fixture-v1' };
  const trajectory = compileLateralTrajectory(map, {
    ...world,
    version: '049-directed-trajectory-v1',
    id: 'curve',
    access: 'CIVIL',
    laneIds: ['lane-a', 'lane-b'],
    loop: false,
  });
  assert(Math.abs(trajectory.minimumRadiusM! - 16) < 1e-6);
  assert.equal(LATERAL_LIMITS.maximumCornerAccelerationMps2, 3.5);
  for (const classId of ['sedan', 'compact'] as const)
    for (const [i, values] of cruiseValues.entries()) {
      const input = scenario(values),
        target = evaluateCruiseTarget({
          ...input,
          facts: { ...input.facts!, curveRadiusM: trajectory.minimumRadiusM },
          mechanics: { ...input.mechanics, classId },
        });
      assert.equal(target.exceedsLateralAdvisory, i === 1);
      if (i === 1) assert(target.targetMps > target.lateralAdvisoryMps!);
      const owner = createLateralController(world),
        actor = { id: 'car', incarnation: 1 };
      owner.setActors([{ ...actor, classId }], world);
      owner.setTrajectory(actor, trajectory, world);
      const actual = owner.step({
        ...world,
        version: '049-lateral-v1',
        actor,
        tick: 1,
        requestedSpeedMps: target.targetMps,
        observation: {
          sourceTick: 0,
          positionM: { x: -30, y: 0.8, z: 0 },
          rotationQuaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
          velocityMps: { x: 3, y: 0, z: 0 },
          discontinuity: false,
        },
      });
      assert.equal(actual.reason, i === 1 ? 'REQUESTED_OVERSPEED' : 'TRACKING');
      owner.dispose();
      assert.equal(owner.getStats().actors, 0);
    }
});

test('046 missing, weak, foreign, future/stale context and mismatched behavior/profile/facts fail explicitly with no optimistic defaults', () => {
  const input = scenario();
  const cases: readonly [unknown, string][] = [
    [{ ...input, profile: null }, 'MISSING_PROFILE'],
    [{ ...input, authority: 'MANUAL' }, 'NO_AUTO_AUTHORITY'],
    [{ ...input, authority: 'LEARNING' }, 'NO_AUTO_AUTHORITY'],
    [{ ...input, context: null }, 'MISSING_CONTEXT'],
    [{ ...input, context: { ...input.context!, sessionId: 'foreign' } }, 'FOREIGN_CONTEXT'],
    [{ ...input, context: { ...input.context!, worldEpoch: 1 } }, 'FOREIGN_CONTEXT'],
    [
      { ...input, context: { ...input.context!, subject: { ...input.actor, incarnation: 2 } } },
      'FOREIGN_CONTEXT',
    ],
    [
      { ...input, context: { ...input.context!, sourceTick: input.decisionTick + 1 } },
      'STALE_CONTEXT',
    ],
    [{ ...input, decisionTick: input.context!.sourceTick + 7 }, 'STALE_CONTEXT'],
    [{ ...input, context: { ...input.context!, discontinuity: true } }, 'CONTEXT_DISCONTINUITY'],
    [{ ...input, context: { ...input.context!, vehiclesComplete: false } }, 'INCOMPLETE_CONTEXT'],
    [{ ...input, context: { ...input.context!, laneId: null } }, 'INCOMPLETE_CONTEXT'],
    [{ ...input, behavior: null }, 'MISSING_BEHAVIOR'],
    [
      { ...input, behavior: { ...input.behavior!, decisionTick: input.decisionTick - 1 } },
      'FOREIGN_OR_STALE_BEHAVIOR',
    ],
    [
      { ...input, behavior: { ...input.behavior!, profileVersionId: 'old' } },
      'PROFILE_VERSION_MISMATCH',
    ],
    [{ ...input, facts: null }, 'MISSING_ROAD_FACTS'],
    [
      { ...input, facts: { ...input.facts!, sourceTick: input.facts!.sourceTick + 1 } },
      'FOREIGN_ROAD_FACTS',
    ],
    [{ ...input, facts: { ...input.facts!, laneId: 'foreign' } }, 'FOREIGN_ROAD_FACTS'],
    [{ ...input, facts: { ...input.facts!, roadKind: 'UNKNOWN' } }, 'UNSUPPORTED_ROAD_KIND'],
  ];
  for (const [value, reason] of cases) {
    const result = evaluateCruiseTarget(value);
    assert.equal(result.reason, reason);
    assert.equal(result.targetMps, 0);
    assert.equal(result.styleTargetMps, null);
  }
  const tick = input.context!.sourceTick + 6;
  assert(
    evaluateCruiseTarget({
      ...input,
      decisionTick: tick,
      behavior: { ...input.behavior!, decisionTick: tick },
    }).targetMps > 0,
  );
});

test('046 finite numeric, exact data-field, profile provenance/units/range/version boundaries reject atomically', () => {
  const input = scenario();
  for (const value of [NaN, Infinity, -Infinity, -1, 101, '10'])
    assert.throws(() =>
      evaluateCruiseTarget({ ...input, facts: { ...input.facts!, postedLimitMps: value } }),
    );
  for (const value of [NaN, Infinity, 0, -1, 100001])
    assert.throws(() =>
      evaluateCruiseTarget({ ...input, facts: { ...input.facts!, curveRadiusM: value } }),
    );
  for (const value of [
    { ...input, extra: true },
    { ...input, decisionTick: 1.5 },
    { ...input, actor: { id: 'x'.repeat(257), incarnation: 1 } },
    { ...input, facts: { ...input.facts!, version: 'future' } },
    { ...input, mechanics: { ...input.mechanics, classVersion: 'future' } },
    { ...input, mechanics: { ...input.mechanics, surface: 'dry' } },
    { ...input, behavior: { ...input.behavior!, state: 'STOP', reason: 'FOLLOW_LANE' } },
    { ...input, profile: { ...input.profile! } },
    { ...input, profile: new Proxy(input.profile!, {}) },
  ])
    assert.throws(() => evaluateCruiseTarget(value));
  let getterCalls = 0;
  const malicious = { ...input };
  Object.defineProperty(malicious, 'authority', {
    enumerable: true,
    get() {
      getterCalls++;
      return 'AUTO';
    },
  });
  assert.throws(() => evaluateCruiseTarget(malicious));
  assert.equal(getterCalls, 0);
  for (const key of CRUISE_KEYS) {
    const profile = cruiseProfile(cruiseValues[0]);
    profile.unitsByParameter[key] = 'km/h';
    assert.throws(() => compileCruiseProfile(profile));
    profile.unitsByParameter[key] = getParameterDefinition(key).unit;
    profile.parameters[key] = getParameterDefinition(key).max + 1;
    assert.throws(() => compileCruiseProfile(profile));
  }
  const missing = cruiseProfile(cruiseValues[0]);
  delete missing.parameters.speed_delta_urban;
  assert.throws(() => compileCruiseProfile(missing));
  const overloaded = cruiseProfile(cruiseValues[0]);
  Object.assign(overloaded, {
    sourceSegmentIds: Array.from({ length: 1025 }, (_, i) => String(i)),
  });
  assert.throws(() => compileCruiseProfile(overloaded));
  const huge = cruiseProfile(cruiseValues[0]);
  huge.evidenceByParameter = Object.fromEntries(
    Array.from({ length: 81 }, (_, i) => [`fake_${i}`, null]),
  );
  assert.throws(() => compileCruiseProfile(huge));
  const recursive = new Proxy(cruiseProfile(cruiseValues[0]), {
    getPrototypeOf(target) {
      assert.throws(() => compileCruiseProfile(cruiseProfile(cruiseValues[0])), /Reentrant/);
      return Object.getPrototypeOf(target);
    },
  });
  assert.doesNotThrow(() => compileCruiseProfile(recursive));
  assert.equal(evaluateCruiseTarget(input).targetMps, 8);
});

test('046 detached bounded setup never rereads descriptor traps that grow a previously checked source array', () => {
  const profile = cruiseProfile(cruiseValues[0]),
    sources: string[] = [];
  Object.assign(profile, { sourceSegmentIds: sources });
  let reads = 0;
  profile.parameters = new Proxy(profile.parameters, {
    getOwnPropertyDescriptor(target, key) {
      reads++;
      if (reads > 4) sources.push(...Array.from({ length: 1025 }, (_, i) => String(i)));
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const token = compileCruiseProfile(profile);
  assert.equal(reads, 4);
  assert.equal(sources.length, 0);
  assert.equal(Object.keys(token.values).length, 4);
  const late = cruiseProfile(cruiseValues[0]),
    lateSources: string[] = [];
  Object.assign(late, { sourceSegmentIds: lateSources });
  late.parameters = new Proxy(late.parameters, {
    getOwnPropertyDescriptor(target, key) {
      if (lateSources.length === 0)
        lateSources.push(...Array.from({ length: 1025 }, (_, i) => String(i)));
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.throws(() => compileCruiseProfile(late), /range/);
});

test('046 compilation retains four immutable values with arbitrary engine metadata and explicit BASE/IMPORTED/MANUAL support, never estimator support', () => {
  for (const source of ['BASE', 'IMPORTED', 'MANUAL_TUNING']) {
    const profile = cruiseProfile(cruiseValues[0]);
    profile.engineVersion = 'application-version-9';
    for (const key of CRUISE_KEYS) profile.provenanceByParameter[key] = source;
    const compiled = compileCruiseProfile(profile);
    assert.equal(compiled.engineVersion, 'application-version-9');
    assert.equal(Object.keys(compiled.values).length, 4);
    assert(Object.isFrozen(compiled) && Object.isFrozen(compiled.values));
    profile.parameters.speed_delta_urban = 10;
    assert.equal(compiled.values.speed_delta_urban, -2);
  }
  const learned = cruiseProfile(cruiseValues[0]);
  const observed = Object.fromEntries(
    CRUISE_KEYS.map((key) => [
      key,
      {
        key,
        effectiveCount: 2,
        contexts: ['curve'],
        quality: 1,
        uncertainty: 0,
        sourceSegmentIds: ['segment'],
        estimatorVersion: 'unverified-estimator',
      },
    ]),
  );
  Object.assign(learned, { sourceSegmentIds: ['segment'], evidenceByParameter: observed });
  for (const key of CRUISE_KEYS) learned.provenanceByParameter[key] = 'LEARNED';
  assert.throws(() => compileCruiseProfile(learned));
  const reserved = cruiseProfile(cruiseValues[0]);
  reserved.parameters.following_time_headway = 1.8;
  reserved.unitsByParameter.following_time_headway = 's';
  reserved.provenanceByParameter.following_time_headway = 'BASE';
  reserved.evidenceByParameter.following_time_headway = null;
  assert.equal(Object.keys(compileCruiseProfile(reserved).values).length, 4);
  assert.equal(getParameterDefinition('following_time_headway').implemented, false);
  assert.equal(CRUISE_LIMITS.retainedHistory, 0);
});

test('046 stateless activation, authority, identity/epoch lifecycle follows actual045 ownership and retains no decision history', () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const input = scenario(),
      scope = { sessionId: input.sessionId, worldEpoch: input.worldEpoch },
      owner = createBehaviorFSM(scope);
    owner.setActors([input.actor], scope);
    owner.setAuthority(input.actor, 'MANUAL', scope);
    assert.equal(owner.read(input.actor, scope), null);
    assert.throws(() =>
      owner.decide({
        ...scope,
        actor: input.actor,
        decisionTick: input.decisionTick,
        context: input.context,
        facts: null,
      }),
    );
    assert.equal(evaluateCruiseTarget({ ...input, authority: 'MANUAL' }).targetMps, 0);
    owner.reset(scope.sessionId, scope.worldEpoch + 1);
    assert.equal(owner.getStats().identities, 0);
    const replay = evaluateCruiseTarget({ ...input, worldEpoch: scope.worldEpoch + 1 });
    assert.equal(replay.reason, 'FOREIGN_CONTEXT');
    assert.equal(
      evaluateCruiseTarget({ ...input, actor: { ...input.actor, incarnation: 2 } }).reason,
      'FOREIGN_CONTEXT',
    );
    const changed = compileCruiseProfile(cruiseProfile(cruiseValues[1]));
    assert.equal(
      evaluateCruiseTarget({ ...input, profile: changed }).reason,
      'PROFILE_VERSION_MISMATCH',
    );
    owner.dispose();
    assert.equal(owner.getStats().actors, 0);
    assert.equal(owner.getStats().decisions, 0);
  }
});
