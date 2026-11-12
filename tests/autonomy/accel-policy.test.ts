import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCEL_POLICY_KEYS,
  ACCEL_POLICY_LIMITS,
  compileAccelPolicyProfile,
  evaluateAccelPolicy,
} from '../../src/autonomy/accel-policy';
import type {
  AccelPolicyActuation,
  AccelPolicyInput,
  AccelPolicyProfile,
} from '../../src/autonomy/accel-policy';
import {
  compileLongitudinalProfile,
  createLongitudinalController,
} from '../../src/autonomy/longitudinal-control';
import {
  accelProfile,
  accelProfileDocument,
  cruiseTargetFixture,
  evaluate,
  longitudinalRequest,
  scene,
  simulate,
} from './accel-policy-reference';

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance;

test('169 braking_jerk only changes how fast the demanded braking grows', () => {
  const gentle = accelProfile({ braking_jerk: 0.2 }),
    brisk = accelProfile({ braking_jerk: 20 }),
    request = { accelerationMps2: -2, brake: 0.25, phase: 'BRAKING' as const };
  const gentleRows = simulate(gentle, { ticks: 8, request }),
    briskRows = simulate(brisk, { ticks: 8, request });
  // Both start braking on the first tick: reaction delay and onset belong to 047, not to this key.
  assert(gentleRows[0].command.brake > 0 && briskRows[0].command.brake > 0);
  assert(gentleRows[0].brakingRampTicks > 500);
  assert(briskRows[0].brakingRampTicks <= 6);
  assert(close(gentleRows[7].committedAccelerationMps2, -(0.2 / 60) * 8, 1e-12));
  assert(close(briskRows[7].committedAccelerationMps2, -2, 1e-12));
  // The ramp never overshoots the 047 demand and the brake fraction never exceeds it.
  for (const row of [...gentleRows, ...briskRows]) {
    assert(row.committedAccelerationMps2 >= -2);
    assert(row.command.brake <= 0.25);
    assert.equal(row.command.throttle, 0);
  }
});

test('169 throttle_release_delay holds the previous throttle only until it expires', () => {
  const immediate = accelProfile({ throttle_release_delay: 0 }),
    delayed = accelProfile({ throttle_release_delay: 3 }),
    previous = { accelerationMps2: 1.5, throttle: 0.4 };
  const immediateRow = evaluate(immediate, { request: { accelerationMps2: 0 }, previous }),
    onset = evaluate(delayed, { request: { accelerationMps2: 0 }, previous });
  assert.equal(immediateRow.throttleHeld, false);
  assert.equal(immediateRow.command.throttle, 0);
  assert.equal(onset.throttleHeld, true);
  assert.equal(onset.command.throttle, 0.4);
  assert.equal(onset.throttleReleaseTicks, 179);
  const rows = simulate(delayed, {
    ticks: 182,
    request: { accelerationMps2: 0 },
    previous,
  });
  assert.equal(rows[179].throttleHeld, true);
  assert.equal(rows[179].throttleReleaseTicks, 0);
  assert.equal(rows[179].command.throttle, 0.4);
  assert.equal(rows[180].command.throttle, 0);
  assert.equal(rows[181].command.throttle, 0);
  assert(rows.every((row) => row.command.brake === 0));
});

test('169 launch_intensity only scales a launch below the launch speed', () => {
  const gentle = accelProfile({ launch_intensity: 0 }),
    full = accelProfile({ launch_intensity: 1 }),
    request = { accelerationMps2: 1.5, throttle: 0.4 },
    observation = { longitudinalSpeedMps: 0.5 };
  const gentleLaunch = evaluate(gentle, { request, observation }),
    fullLaunch = evaluate(full, { request, observation });
  assert(close(gentleLaunch.committedAccelerationMps2, 1.5 * 0.35, 1e-12));
  assert(close(gentleLaunch.command.throttle, 0.4 * 0.35, 1e-12));
  assert(close(fullLaunch.committedAccelerationMps2, 1.5, 1e-12));
  assert.equal(fullLaunch.command.throttle, 0.4);
  assert(gentleLaunch.launchFactor < fullLaunch.launchFactor);
  // Above the launch speed the same key is inert: the request is applied in full.
  const cruiseGentle = evaluate(gentle, {
      request,
      observation: { longitudinalSpeedMps: 8 },
    }),
    cruiseFull = evaluate(full, { request, observation: { longitudinalSpeedMps: 8 } });
  assert.equal(cruiseGentle.committedAccelerationMps2, 1.5);
  assert.equal(cruiseFull.committedAccelerationMps2, 1.5);
  assert.equal(cruiseGentle.command.throttle, cruiseFull.command.throttle);
});

test('169 coasting_bias only releases a mild cruise request above the launch speed', () => {
  const hold = accelProfile({ coasting_bias: 0 }),
    freeRoll = accelProfile({ coasting_bias: 1 }),
    mild = { accelerationMps2: 0.4, throttle: 0.12 },
    observation = { longitudinalSpeedMps: 8 };
  const held = evaluate(hold, { request: mild, observation }),
    coasting = evaluate(freeRoll, { request: mild, observation });
  assert.equal(held.committedAccelerationMps2, 0.4);
  assert.equal(held.command.throttle, 0.12);
  assert.equal(held.coasting, false);
  assert.equal(coasting.committedAccelerationMps2, 0);
  assert.equal(coasting.command.throttle, 0);
  assert.equal(coasting.coasting, true);
  // A strong request is not a coasting request.
  const strong = evaluate(freeRoll, {
    request: { accelerationMps2: 1.2, throttle: 0.3 },
    observation,
  });
  assert.equal(strong.coasting, false);
  assert.equal(strong.committedAccelerationMps2, 1.2);
  // Below the launch speed it is launch_intensity, not coasting, that applies the request.
  const launch = evaluate(freeRoll, {
    request: mild,
    observation: { longitudinalSpeedMps: 0.5 },
  });
  assert.equal(launch.coasting, false);
  assert.equal(launch.committedAccelerationMps2, 0.4);
});

test('169 each key is inert in the other three isolated scenarios', () => {
  const base = accelProfile(),
    braking = { accelerationMps2: -2, brake: 0.25, phase: 'BRAKING' as const },
    launch = { accelerationMps2: 1.5, throttle: 0.4 },
    mild = { accelerationMps2: 0.4, throttle: 0.12 },
    lift = { accelerationMps2: 0 },
    liftObservation = { longitudinalSpeedMps: 8 };
  const outcome = (
    profile: AccelPolicyProfile,
    request: NonNullable<Parameters<typeof evaluate>[1]>['request'],
    observation: NonNullable<Parameters<typeof evaluate>[1]>['observation'],
    previous: NonNullable<Parameters<typeof evaluate>[1]>['previous'] = {},
  ) => {
    const row = evaluate(profile, { request, observation, previous });
    return [
      row.committedAccelerationMps2,
      row.command.throttle,
      row.command.brake,
      row.throttleHeld,
      row.coasting,
    ];
  };
  const launchObservation = { longitudinalSpeedMps: 0.5 },
    coastObservation = { longitudinalSpeedMps: 8 };
  // Braking scene: only braking_jerk changes the result.
  assert.deepEqual(
    outcome(accelProfile({ throttle_release_delay: 3 }), braking, undefined),
    outcome(base, braking, undefined),
  );
  assert.deepEqual(
    outcome(accelProfile({ launch_intensity: 0 }), braking, undefined),
    outcome(base, braking, undefined),
  );
  assert.deepEqual(
    outcome(accelProfile({ coasting_bias: 1 }), braking, undefined),
    outcome(base, braking, undefined),
  );
  // Launch scene: only launch_intensity changes the result.
  assert.deepEqual(
    outcome(accelProfile({ braking_jerk: 0.2 }), launch, launchObservation),
    outcome(base, launch, launchObservation),
  );
  assert.deepEqual(
    outcome(accelProfile({ throttle_release_delay: 3 }), launch, launchObservation),
    outcome(base, launch, launchObservation),
  );
  assert.deepEqual(
    outcome(accelProfile({ coasting_bias: 1 }), launch, launchObservation),
    outcome(base, launch, launchObservation),
  );
  // Coasting scene: only coasting_bias changes the result.
  assert.deepEqual(
    outcome(accelProfile({ braking_jerk: 0.2 }), mild, coastObservation),
    outcome(base, mild, coastObservation),
  );
  assert.deepEqual(
    outcome(accelProfile({ throttle_release_delay: 3 }), mild, coastObservation),
    outcome(base, mild, coastObservation),
  );
  assert.deepEqual(
    outcome(accelProfile({ launch_intensity: 0 }), mild, coastObservation),
    outcome(base, mild, coastObservation),
  );
  // Lift scene: only throttle_release_delay changes the result.
  const previous = { accelerationMps2: 1.5, throttle: 0.4 };
  assert.deepEqual(
    outcome(accelProfile({ braking_jerk: 0.2 }), lift, liftObservation, previous),
    outcome(base, lift, liftObservation, previous),
  );
  assert.deepEqual(
    outcome(accelProfile({ launch_intensity: 0 }), lift, liftObservation, previous),
    outcome(base, lift, liftObservation, previous),
  );
  assert.deepEqual(
    outcome(accelProfile({ coasting_bias: 1 }), lift, liftObservation, previous),
    outcome(base, lift, liftObservation, previous),
  );
  assert.notDeepEqual(
    outcome(accelProfile({ throttle_release_delay: 3 }), lift, liftObservation, previous),
    outcome(base, lift, liftObservation, previous),
  );
});

test('169 stop, gap and braking limits stay dominant over every style key', () => {
  const aggressive = accelProfile({
      braking_jerk: 20,
      throttle_release_delay: 3,
      launch_intensity: 1,
      coasting_bias: 1,
    }),
    launch = { accelerationMps2: 1.5, throttle: 0.4 },
    stopped = evaluate(aggressive, {
      request: launch,
      observation: { longitudinalSpeedMps: 8, stopRequired: true },
      previous: { accelerationMps2: 1.5, throttle: 0.4 },
    }),
    tooClose = evaluate(aggressive, {
      request: launch,
      observation: { longitudinalSpeedMps: 8, leadGapM: 3, leadSpeedMps: 9 },
    }),
    safeGap = evaluate(aggressive, {
      request: launch,
      observation: { longitudinalSpeedMps: 0.5, leadGapM: 8, leadSpeedMps: 9 },
    });
  for (const row of [stopped, tooClose]) {
    assert.equal(row.safetyVeto, true);
    assert.equal(row.command.throttle, 0);
    assert.equal(row.committedAccelerationMps2, 0);
    assert.equal(row.throttleHeld, false);
  }
  assert.equal(safeGap.safetyVeto, false);
  assert.equal(safeGap.committedAccelerationMps2, 1.5);
  // Braking is never vetoed, never delayed by the release hold and never exceeds 047.
  const braking = evaluate(aggressive, {
    request: { accelerationMps2: -2, brake: 0.25, phase: 'BRAKING' },
    observation: { stopRequired: true },
    previous: { accelerationMps2: 1.5, throttle: 0.4 },
  });
  assert(braking.command.brake > 0);
  assert.equal(braking.throttleHeld, false);
  assert(braking.committedAccelerationMps2 >= -2);
  const settled = simulate(aggressive, {
    ticks: 30,
    request: { accelerationMps2: -2, brake: 0.25 },
  });
  assert(
    settled.every(
      (row) => row.committedAccelerationMps2 <= 0 && row.committedAccelerationMps2 >= -2,
    ),
  );
  assert(close(settled.at(-1)!.committedAccelerationMps2, -2, 1e-12));
});

test('169 keeps the 047 M keys, units and consequences unchanged', () => {
  const neutralDocument = accelProfileDocument({}, '169-integration-v1'),
    activeDocument = accelProfileDocument(
      {
        braking_jerk: 0.2,
        throttle_release_delay: 3,
        launch_intensity: 0,
        coasting_bias: 1,
      },
      '169-integration-v1',
    ),
    neutralLongitudinal = compileLongitudinalProfile(neutralDocument),
    activeLongitudinal = compileLongitudinalProfile(activeDocument),
    neutralPolicy = compileAccelPolicyProfile(neutralDocument);
  assert.deepEqual(neutralLongitudinal.cruise.values, activeLongitudinal.cruise.values);
  assert.deepEqual(neutralLongitudinal.values, activeLongitudinal.values);
  for (const key of [
    'desired_acceleration',
    'comfort_deceleration',
    'acceleration_jerk',
    'brake_reaction_delay',
  ] as const)
    assert.equal(neutralLongitudinal.values[key], activeLongitudinal.values[key]);
  assert.equal(neutralLongitudinal.cruise.units.curve_lateral_accel, 'm/s²');
  assert.equal(neutralPolicy.units.braking_jerk, 'm/s³');
  assert.equal(neutralPolicy.units.throttle_release_delay, 's');
  assert.equal(neutralPolicy.units.launch_intensity, 'ratio');
  assert.equal(neutralPolicy.units.coasting_bias, 'ratio');

  const neutralController = createLongitudinalController(scene.scope),
    activeController = createLongitudinalController(scene.scope),
    neutralRows = [],
    activeRows = [],
    filteredRows = [];
  neutralController.setActors([scene.actor], scene.scope);
  activeController.setActors([scene.actor], scene.scope);
  try {
    let previous: AccelPolicyActuation = Object.freeze({
      accelerationMps2: 0,
      throttle: 0,
      brake: 0,
      throttleReleaseTicks: 0,
    });
    const firstBrakeTick: number[] = [],
      filteredFirstBrakeTick: number[] = [];
    for (let tick = 1; tick <= 100; tick++) {
      const targetMps = tick <= 30 ? 12 : tick <= 42 ? 10 : 0,
        neutralTarget = cruiseTargetFixture(neutralLongitudinal.versionId, {
          decisionTick: tick,
          targetMps,
        }),
        activeTarget = cruiseTargetFixture(activeLongitudinal.versionId, {
          decisionTick: tick,
          targetMps,
        }),
        observation = {
          version: '047-observation-v1' as const,
          units: 'SI' as const,
          ...scene.scope,
          actor: scene.actor,
          tick,
          longitudinalSpeedMps: 10,
          classId: 'sedan' as const,
          classVersion: '023-mechanics-v1' as const,
        },
        neutralRequest = neutralController.step({
          ...scene.scope,
          actor: scene.actor,
          tick,
          authority: 'AUTO',
          profile: neutralLongitudinal,
          target: neutralTarget,
          observation,
        }),
        activeRequest = activeController.step({
          ...scene.scope,
          actor: scene.actor,
          tick,
          authority: 'AUTO',
          profile: activeLongitudinal,
          target: activeTarget,
          observation,
        });
      // The 047 M consequences are identical whatever the four R keys say.
      assert.equal(activeRequest.accelerationMps2, neutralRequest.accelerationMps2);
      assert.equal(activeRequest.command.throttle, neutralRequest.command.throttle);
      assert.equal(activeRequest.command.brake, neutralRequest.command.brake);
      assert.equal(activeRequest.phase, neutralRequest.phase);
      assert.equal(activeRequest.targetMps, neutralRequest.targetMps);
      const filtered = evaluateAccelPolicy({
        ...scene.scope,
        actor: scene.actor,
        decisionTick: tick,
        authority: 'AUTO',
        profile: neutralPolicy,
        longitudinal: neutralRequest,
        observation: {
          version: '169-observation-v1',
          units: 'SI',
          ...scene.scope,
          actor: scene.actor,
          tick,
          longitudinalSpeedMps: 10,
          leadGapM: null,
          leadSpeedMps: null,
          stopRequired: false,
        },
        previous,
      });
      previous = filtered.actuation;
      if (neutralRequest.command.brake > 0 && firstBrakeTick.length === 0)
        firstBrakeTick.push(tick);
      if (filtered.command.brake > 0 && filteredFirstBrakeTick.length === 0)
        filteredFirstBrakeTick.push(tick);
      // Positive tracking and lift are byte-identical to 047 under the neutral R values.
      if (neutralRequest.accelerationMps2 >= 0) {
        assert.equal(filtered.command.throttle, neutralRequest.command.throttle);
        assert.equal(filtered.command.brake, neutralRequest.command.brake);
        assert.equal(filtered.committedAccelerationMps2, neutralRequest.accelerationMps2);
      } else {
        // Braking only ramps towards exactly the same M demand, never past it.
        assert(filtered.committedAccelerationMps2 >= neutralRequest.accelerationMps2);
        assert(filtered.command.brake <= neutralRequest.command.brake);
      }
      neutralRows.push(neutralRequest);
      activeRows.push(activeRequest);
      filteredRows.push(filtered);
    }
    assert.equal(firstBrakeTick.length, 1);
    assert.equal(filteredFirstBrakeTick.length, 1);
    // The reaction delay onset belongs to 047 and is not moved by the 169 layer.
    assert.equal(filteredFirstBrakeTick[0], firstBrakeTick[0]);
    assert(neutralRows.some((row) => row.accelerationMps2 < 0));
    assert.equal(activeRows.length, neutralRows.length);
    // Seven ticks after the onset the neutral ramp reaches exactly the 047 braking demand.
    const settledIndex = firstBrakeTick[0]! + 5;
    assert(close(filteredRows[settledIndex].committedAccelerationMps2, -2, 1e-9));
    assert.equal(filteredRows[settledIndex].command.brake, 0.25);
    assert.equal(filteredRows[settledIndex].brakingRampTicks, 0);
  } finally {
    neutralController.dispose();
    activeController.dispose();
  }
});

test('169 refuses out-of-range values, wrong units and incomplete profiles', () => {
  assert.throws(() => accelProfile({ braking_jerk: 25 }), /Expected finite number in range/);
  assert.throws(
    () => accelProfile({ throttle_release_delay: 4 }),
    /Expected finite number in range/,
  );
  assert.throws(() => accelProfile({ launch_intensity: 1.5 }), /Expected finite number in range/);
  assert.throws(() => accelProfile({ coasting_bias: -0.1 }), /Expected finite number in range/);
  const wrongUnit = accelProfileDocument();
  (wrongUnit.unitsByParameter as Record<string, string>).braking_jerk = 'm/s²';
  assert.throws(() => compileAccelPolicyProfile(wrongUnit), /Wrong unit for parameter/);
  for (const key of ACCEL_POLICY_KEYS) {
    const incomplete = accelProfileDocument();
    for (const map of [
      incomplete.parameters,
      incomplete.unitsByParameter,
      incomplete.provenanceByParameter,
      incomplete.evidenceByParameter,
    ])
      delete (map as Record<string, unknown>)[key];
    assert.throws(() => compileAccelPolicyProfile(incomplete), /Missing accel policy parameter/);
  }
});

test('169 diagnoses foreign, stale and mismatched inputs before any style effect', () => {
  const profile = accelProfile({ launch_intensity: 0, coasting_bias: 1 }),
    base = {
      ...scene.scope,
      actor: scene.actor,
      decisionTick: scene.tick,
      authority: 'AUTO' as const,
      profile,
      longitudinal: longitudinalRequest(),
      observation: {
        version: '169-observation-v1' as const,
        units: 'SI' as const,
        ...scene.scope,
        actor: scene.actor,
        tick: scene.tick,
        longitudinalSpeedMps: 8,
        leadGapM: null,
        leadSpeedMps: null,
        stopRequired: false,
      },
      previous: {
        accelerationMps2: 0,
        throttle: 0,
        brake: 0,
        throttleReleaseTicks: 0,
      },
    } satisfies AccelPolicyInput;
  assert.equal(evaluateAccelPolicy(base).reason, 'ACCEL_POLICY');
  assert.equal(evaluateAccelPolicy({ ...base, authority: 'MANUAL' }).reason, 'NO_AUTO_AUTHORITY');
  assert.equal(evaluateAccelPolicy({ ...base, profile: null }).reason, 'MISSING_PROFILE');
  assert.equal(
    evaluateAccelPolicy({
      ...base,
      observation: { ...base.observation, worldEpoch: 1 },
    }).reason,
    'FOREIGN_OR_STALE_OBSERVATION',
  );
  assert.equal(
    evaluateAccelPolicy({
      ...base,
      observation: { ...base.observation, tick: scene.tick + 1 },
    }).reason,
    'FOREIGN_OR_STALE_OBSERVATION',
  );
  assert.equal(
    evaluateAccelPolicy({
      ...base,
      longitudinal: longitudinalRequest({
        scope: { sessionId: 'foreign', worldEpoch: 0 },
      }),
    }).reason,
    'FOREIGN_OR_STALE_REQUEST',
  );
  assert.equal(
    evaluateAccelPolicy({
      ...base,
      longitudinal: longitudinalRequest({ tick: scene.tick + 1 }),
    }).reason,
    'FOREIGN_OR_STALE_REQUEST',
  );
  assert.equal(
    evaluateAccelPolicy({
      ...base,
      longitudinal: longitudinalRequest({ profileVersionId: '169-other-v1' }),
    }).reason,
    'REQUEST_PROFILE_MISMATCH',
  );
  const refused = evaluateAccelPolicy({ ...base, authority: 'MANUAL' });
  assert.equal(refused.command.throttle, base.longitudinal.command.throttle);
  assert.equal(refused.command.brake, base.longitudinal.command.brake);
  assert.equal(refused.committedAccelerationMps2, base.longitudinal.accelerationMps2);
  assert.throws(
    () => evaluateAccelPolicy({ ...base, profile: {} as AccelPolicyProfile }),
    /Accel policy profile token provenance/,
  );
  assert.throws(
    () =>
      evaluateAccelPolicy({
        ...base,
        previous: { ...base.previous, throttleReleaseTicks: 181 },
      }),
    /release hold exceeds its bound/,
  );
  assert.throws(
    () =>
      evaluateAccelPolicy({
        ...base,
        previous: { ...base.previous, throttle: 0.2, brake: 0.2 },
      }),
    /throttle and brake together/,
  );
  assert.throws(
    () =>
      evaluateAccelPolicy({
        ...base,
        longitudinal: longitudinalRequest({ accelerationMps2: 1, brake: 0.2 }),
      }),
    /Inconsistent accel policy request braking/,
  );
  assert.throws(
    () =>
      evaluateAccelPolicy({
        ...base,
        observation: {
          ...base.observation,
          leadGapM: 8,
          leadSpeedMps: null,
        },
      }),
    /Incomplete lead vehicle facts/,
  );
});

test('169 is deterministic, frozen and keeps no hidden history', () => {
  const profile = accelProfile({ launch_intensity: 0.4, coasting_bias: 0.3 }),
    previous = { accelerationMps2: 1.5, throttle: 0.4 },
    first = simulate(profile, { ticks: 24, request: { accelerationMps2: 0 }, previous }),
    second = simulate(profile, { ticks: 24, request: { accelerationMps2: 0 }, previous }),
    other = simulate(accelProfile({ throttle_release_delay: 2.5 }), {
      ticks: 24,
      request: { accelerationMps2: 0 },
      previous,
    });
  assert.deepEqual(first, second);
  assert.notDeepEqual(
    first.map((row) => row.command.throttle),
    other.map((row) => row.command.throttle),
  );
  assert(Object.isFrozen(first[0]));
  assert(Object.isFrozen(first[0].command));
  assert(Object.isFrozen(first[0].actuation));
  assert(Object.isFrozen(first[0].actor));
  assert.equal(ACCEL_POLICY_LIMITS.retainedHistory, 0);
  assert.deepEqual(ACCEL_POLICY_KEYS, [
    'braking_jerk',
    'throttle_release_delay',
    'launch_intensity',
    'coasting_bias',
  ]);
});
