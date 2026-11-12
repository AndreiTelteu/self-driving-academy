import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compileSpeedPolicyProfile,
  evaluateSpeedPolicy,
  SPEED_POLICY_KEYS,
  SPEED_POLICY_LIMITS,
} from '../../src/autonomy/speed-policy';
import type { SpeedPolicyInput } from '../../src/autonomy/speed-policy';
import { compileCruiseProfile } from '../../src/autonomy/cruise-targets';
import { createFollowingTargetFixture } from './following-target-fixture';
import {
  cruiseTargetFixture,
  evaluate,
  scene,
  speedMValues,
  speedObservation,
  speedProfile,
  speedProfileDocument,
  sweep,
} from './speed-policy-reference';

test('167 arterial delta is the only key that moves the arterial road target', () => {
  const low = speedProfile({ speed_delta_arterial: -10 }),
    high = speedProfile({ speed_delta_arterial: 20 }),
    arterial = { roadKind: 'ARTERIAL' as const };
  const cautious = evaluate(low, { target: null, observation: arterial }),
    fast = evaluate(high, { target: null, observation: arterial });
  assert.equal(cautious.reason, 'SPEED_POLICY');
  assert.equal(cautious.arterialDeltaMps, -10);
  assert.equal(cautious.baseStyleMps, scene.postedLimitMps - 10);
  assert.equal(cautious.committedTargetMps, scene.postedLimitMps - 10);
  assert.equal(fast.arterialDeltaMps, 20);
  assert.equal(fast.baseStyleMps, scene.postedLimitMps + 20);
  assert.equal(fast.committedTargetMps, SPEED_POLICY_LIMITS.maximumCoveredSpeedMps);
  assert(fast.committedTargetMps - cautious.committedTargetMps > 26);
  assert.equal(fast.postedDeviationMps, 30 - scene.postedLimitMps);
  // The same key is inert on an urban road: the 046 target keeps its own consequence.
  const urban = evaluate(high, { target: cruiseTargetFixture() });
  assert.equal(urban.arterialDeltaMps, 0);
  assert.equal(urban.committedTargetMps, scene.urbanTargetMps);
});

test('167 cruise_speed_variability changes the target rhythm with a bounded amplitude', () => {
  const calm = sweep(speedProfile({ cruise_speed_variability: 0.3 })),
    restless = sweep(speedProfile({ cruise_speed_variability: 3 }));
  assert(calm.peakToPeakMps > 0.5 && calm.peakToPeakMps <= 0.62);
  assert(restless.peakToPeakMps > 5.5 && restless.peakToPeakMps <= 6);
  assert(restless.changes > calm.changes);
  // The wave never lifts the commitment above the posted limit, however large it is.
  assert(restless.maximumMps <= scene.postedLimitMps);
  for (const offset of [0, 75, 150, 225, 300, 375, 450, 525]) {
    const command = evaluate(speedProfile({ cruise_speed_variability: 3 }), { offset });
    assert(Math.abs(command.variabilityOffsetMps) <= 3);
    assert.equal(
      command.committedTargetMps,
      Math.min(
        Math.max(0, scene.urbanTargetMps + command.variabilityOffsetMps),
        scene.postedLimitMps,
      ),
    );
  }
});

test('167 overtake_speed_bonus only applies while overtaking and stops at the legal ceiling', () => {
  const none = speedProfile({ overtake_speed_bonus: 0 }),
    modest = speedProfile({ overtake_speed_bonus: 2 }),
    maximum = speedProfile({ overtake_speed_bonus: 10 });
  const cruising = evaluate(none, { observation: { overtaking: true } }),
    modestOvertake = evaluate(modest, { observation: { overtaking: true } }),
    maximumOvertake = evaluate(maximum, { observation: { overtaking: true } }),
    notOvertaking = evaluate(maximum, { observation: { overtaking: false } });
  assert.equal(cruising.committedTargetMps, scene.urbanTargetMps);
  assert.equal(modestOvertake.committedTargetMps, scene.urbanTargetMps + 2);
  assert.equal(maximumOvertake.committedTargetMps, scene.postedLimitMps);
  assert.equal(maximumOvertake.bindingConstraint, 'STYLE_CEILING');
  assert.equal(notOvertaking.committedTargetMps, scene.urbanTargetMps);
  assert.equal(notOvertaking.overtakeBonusMps, 0);
  assert(maximumOvertake.committedTargetMps <= scene.postedLimitMps);
});

test('167 cruise_accel_deadband holds the request and the committed target inside the band', () => {
  const tight = speedProfile({ cruise_accel_deadband: 0.05 }),
    loose = speedProfile({ cruise_accel_deadband: 2 });
  const tightBelow = evaluate(tight, { observation: { longitudinalSpeedMps: 9.6 } }),
    looseBelow = evaluate(loose, { observation: { longitudinalSpeedMps: 9.6 } });
  assert.equal(tightBelow.throttleRequest, 'ACCELERATE');
  assert.equal(looseBelow.throttleRequest, 'HOLD');
  const heldByTight = evaluate(tight, { previousCommittedMps: 10.5 }),
    heldByLoose = evaluate(loose, { previousCommittedMps: 10.5 });
  assert.equal(heldByTight.committedTargetMps, scene.urbanTargetMps);
  assert.equal(heldByLoose.committedTargetMps, 10.5);
  assert.equal(heldByLoose.bindingConstraint, 'DEADBAND');
  assert.equal(heldByLoose.deadbandMps, 2);
});

test('167 tempo keys never override the traffic, curve or signal constraints', () => {
  const maximum = speedProfile({ overtake_speed_bonus: 10, cruise_speed_variability: 3 });
  const close = evaluate(maximum, {
      observation: { leadGapM: 8, leadSpeedMps: 9, overtaking: true },
    }),
    tooClose = evaluate(maximum, {
      observation: { leadGapM: 3, leadSpeedMps: 9, overtaking: true },
    }),
    stopped = evaluate(maximum, {
      observation: { stopRequired: true },
      previousCommittedMps: 12,
    }),
    curve = evaluate(maximum, {
      target: cruiseTargetFixture({
        preferredCurveMps: 8,
        targetMps: 8,
        reason: 'CURVE_PREFERENCE',
      }),
      observation: { overtaking: true },
    });
  assert.equal(close.committedTargetMps, 10.5);
  assert.equal(close.bindingConstraint, 'TRAFFIC');
  assert.equal(tooClose.committedTargetMps, 0);
  assert.equal(stopped.committedTargetMps, 0);
  assert.equal(stopped.bindingConstraint, 'SIGNAL');
  assert.equal(curve.committedTargetMps, 8);
  assert.equal(curve.bindingConstraint, 'CURVE');
  // The same scene with the tempo keys at their minimum yields the same protected outcome.
  assert.equal(
    evaluate(speedProfile(), {
      observation: { leadGapM: 8, leadSpeedMps: 9, overtaking: true },
    }).committedTargetMps,
    close.committedTargetMps,
  );
});

test('167 keeps the 046 M keys, units and style consequences unchanged', () => {
  const neutralDocument = speedProfileDocument(speedMValues, {}, '167-integration-v1'),
    tempoDocument = speedProfileDocument(
      speedMValues,
      {
        speed_delta_arterial: 20,
        cruise_speed_variability: 3,
        overtake_speed_bonus: 10,
        cruise_accel_deadband: 2,
      },
      '167-integration-v1',
    ),
    neutralProfile = compileSpeedPolicyProfile(neutralDocument),
    tempoProfile = compileSpeedPolicyProfile(tempoDocument),
    neutralCruise = compileCruiseProfile(neutralDocument),
    tempoCruise = compileCruiseProfile(tempoDocument);
  for (const key of SPEED_POLICY_KEYS) assert.equal(neutralProfile.units[key], 'm/s');
  assert.equal(neutralCruise.units.speed_delta_urban, 'm/s');
  assert.equal(neutralCruise.units.curve_lateral_accel, 'm/s²');
  assert.deepEqual(neutralCruise.values, tempoCruise.values);
  assert.equal(tempoProfile.values.cruise_accel_deadband, 2);
  const neutralFixture = createFollowingTargetFixture(neutralCruise, scene.actor, scene.scope),
    tempoFixture = createFollowingTargetFixture(tempoCruise, scene.actor, scene.scope);
  try {
    const neutralInput = neutralFixture.input(1, 5, 20, 6),
      tempoInput = tempoFixture.input(1, 5, 20, 6),
      neutralTarget = neutralInput.cruise,
      tempoTarget = tempoInput.cruise;
    assert.equal(tempoTarget.targetMps, neutralTarget.targetMps);
    assert.equal(tempoTarget.postedDeviationMps, neutralTarget.postedDeviationMps);
    assert.equal(tempoTarget.reason, neutralTarget.reason);
    const command = evaluateSpeedPolicy({
      ...scene.scope,
      actor: scene.actor,
      decisionTick: 1,
      authority: 'AUTO',
      profile: neutralProfile,
      target: neutralTarget,
      observation: speedObservation({
        tick: 1,
        postedLimitMps: neutralInput.cruiseInput.facts!.postedLimitMps,
      }),
      seed: 167,
      previousCommittedMps: null,
    });
    assert.equal(command.reason, 'SPEED_POLICY');
    assert.equal(command.committedTargetMps, neutralTarget.targetMps);
    assert.equal(command.postedDeviationMps, neutralTarget.postedDeviationMps);
    assert.equal(command.bindingConstraint, 'NONE');
  } finally {
    neutralFixture.dispose();
    tempoFixture.dispose();
  }
});

test('167 refuses out-of-range values, wrong units and incomplete profiles', () => {
  assert.throws(
    () => speedProfile({ speed_delta_arterial: 25 }),
    /Expected finite number in range/,
  );
  assert.throws(
    () => speedProfile({ cruise_speed_variability: 5 }),
    /Expected finite number in range/,
  );
  assert.throws(
    () => speedProfile({ cruise_accel_deadband: 0 }),
    /Expected finite number in range/,
  );
  assert.throws(
    () => speedProfile({ overtake_speed_bonus: -1 }),
    /Expected finite number in range/,
  );
  const wrongUnit = speedProfileDocument();
  (wrongUnit.unitsByParameter as Record<string, string>).cruise_accel_deadband = 's';
  assert.throws(() => compileSpeedPolicyProfile(wrongUnit), /Wrong unit for parameter/);
  const incomplete = speedProfileDocument();
  for (const map of [
    incomplete.parameters,
    incomplete.unitsByParameter,
    incomplete.provenanceByParameter,
    incomplete.evidenceByParameter,
  ])
    delete (map as Record<string, unknown>).overtake_speed_bonus;
  assert.throws(() => compileSpeedPolicyProfile(incomplete), /Missing speed policy parameter/);
});

test('167 diagnoses foreign, stale, mismatched and unusable inputs before any tempo effect', () => {
  const profile = speedProfile({ cruise_speed_variability: 3, overtake_speed_bonus: 10 }),
    base = {
      ...scene.scope,
      actor: scene.actor,
      decisionTick: scene.tick,
      authority: 'AUTO' as const,
      profile,
      target: cruiseTargetFixture(),
      observation: speedObservation(),
      seed: 167,
      previousCommittedMps: null,
    } satisfies SpeedPolicyInput;
  assert.equal(evaluateSpeedPolicy(base).reason, 'SPEED_POLICY');
  assert.equal(evaluateSpeedPolicy({ ...base, authority: 'MANUAL' }).reason, 'NO_AUTO_AUTHORITY');
  assert.equal(evaluateSpeedPolicy({ ...base, profile: null }).reason, 'MISSING_PROFILE');
  assert.equal(
    evaluateSpeedPolicy({ ...base, observation: speedObservation({ worldEpoch: 1 }) }).reason,
    'FOREIGN_OR_STALE_OBSERVATION',
  );
  assert.equal(
    evaluateSpeedPolicy({ ...base, observation: speedObservation({ tick: scene.tick + 1 }) })
      .reason,
    'FOREIGN_OR_STALE_OBSERVATION',
  );
  assert.equal(
    evaluateSpeedPolicy({ ...base, observation: speedObservation({ roadKind: 'UNKNOWN' }) }).reason,
    'UNSUPPORTED_ROAD_KIND',
  );
  assert.equal(
    evaluateSpeedPolicy({ ...base, observation: speedObservation({ roadKind: 'ARTERIAL' }) })
      .reason,
    'TARGET_ROAD_KIND_MISMATCH',
  );
  assert.equal(evaluateSpeedPolicy({ ...base, target: null }).reason, 'MISSING_TARGET');
  assert.equal(
    evaluateSpeedPolicy({ ...base, target: cruiseTargetFixture({ sessionId: 'foreign' }) }).reason,
    'FOREIGN_TARGET',
  );
  assert.equal(
    evaluateSpeedPolicy({ ...base, target: cruiseTargetFixture({ decisionTick: 1 }) }).reason,
    'STALE_TARGET',
  );
  assert.equal(
    evaluateSpeedPolicy({
      ...base,
      target: cruiseTargetFixture({ engineVersion: '046-cruise-v1' }),
    }).reason,
    'TARGET_PROFILE_MISMATCH',
  );
  assert.equal(
    evaluateSpeedPolicy({
      ...base,
      target: cruiseTargetFixture({ reason: 'BEHAVIOR_STOP', targetMps: 0 }),
    }).reason,
    'TARGET_NOT_USABLE',
  );
  const refused = evaluateSpeedPolicy({ ...base, authority: 'MANUAL' });
  assert.equal(refused.committedTargetMps, 0);
  assert.equal(refused.variabilityOffsetMps, 0);
  assert.equal(refused.overtakeBonusMps, 0);
});

test('167 is deterministic for the same seed and input and frozen at the boundary', () => {
  const profile = speedProfile({ cruise_speed_variability: 1.2, cruise_accel_deadband: 0.3 }),
    series = (seed: number, start: number) =>
      Array.from({ length: 24 }, (_, index) => evaluate(profile, { offset: start + index, seed })),
    first = series(5, 40),
    second = series(5, 40),
    otherSeed = series(6, 40),
    otherStart = series(5, 41);
  assert.deepEqual(first, second);
  assert.notDeepEqual(
    first.map((command) => command.variabilityOffsetMps),
    otherSeed.map((command) => command.variabilityOffsetMps),
  );
  assert.notDeepEqual(
    first.map((command) => command.variabilityOffsetMps),
    otherStart.map((command) => command.variabilityOffsetMps),
  );
  assert(Object.isFrozen(first[0]));
  assert(Object.isFrozen(first[0].actor));
  assert.equal(SPEED_POLICY_LIMITS.retainedHistory, 0);
  assert.deepEqual(SPEED_POLICY_KEYS, [
    'speed_delta_arterial',
    'cruise_speed_variability',
    'overtake_speed_bonus',
    'cruise_accel_deadband',
  ]);
});
