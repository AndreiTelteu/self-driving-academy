import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LATERAL_POLICY_V2_KEYS,
  LATERAL_POLICY_V2_LIMITS,
  LATERAL_POLICY_V2_M_KEYS,
  compileLateralPolicyProfile,
  evaluateLateralPolicyV2,
  getLateralPolicyV2Stats,
} from '../../src/autonomy/lateral-policy-v2';
import type { LateralPolicyV2State } from '../../src/autonomy/lateral-policy-v2';
import { getParameterDefinition } from '../../src/profiles';
import { vehicleClass } from '../../src/vehicles/vehicle-classes';
import {
  baseSteeringRad,
  evaluate,
  firstMovement,
  lateralPolicyDocument,
  lateralPolicyProfile,
  neutralLateralPolicyValues,
  projectionAt,
  run,
  scenario,
  turnState,
} from './lateral-policy-v2-reference';
import type { LateralPolicyScene } from './lateral-policy-v2-reference';

const turn: LateralPolicyScene = {
    name: 'viraj',
    geometry: 'turn',
    laneWidthM: 4,
    lateralDeviationM: 0,
    speedMps: 6,
    obstacle: null,
  },
  straight: LateralPolicyScene = { ...turn, name: 'drept', geometry: 'straight' },
  deviation: LateralPolicyScene = { ...turn, lateralDeviationM: 0.3 },
  obstacle: LateralPolicyScene = {
    ...turn,
    obstacle: { side: 'RIGHT', lateralOffsetM: 4, widthM: 1 },
  },
  exitState = turnState(turn),
  close = (left: number, right: number, epsilon = 1e-9) => Math.abs(left - right) <= epsilon;

test('179 compiles the eight R and two delivered M keys with their catalog units', () => {
  assert.deepEqual(LATERAL_POLICY_V2_KEYS, [
    'lane_center_offset',
    'steering_response_time',
    'steering_rate_limit',
    'turn_entry_speed',
    'turn_exit_acceleration',
    'corner_cutting_bias',
    'lateral_clearance',
    'lateral_correction_deadband',
  ]);
  assert.deepEqual(LATERAL_POLICY_V2_M_KEYS, ['curve_lateral_accel', 'desired_acceleration']);
  const profile = lateralPolicyProfile({ lane_center_offset: 0.5, turn_entry_speed: 8 });
  assert.equal(profile.version, '179-lateral-policy-v2');
  assert.equal(profile.values.lane_center_offset, 0.5);
  assert.equal(profile.values.turn_entry_speed, 8);
  assert.equal(profile.values.steering_rate_limit, 4);
  assert.equal(profile.mValues.curve_lateral_accel, 2.5);
  assert.equal(profile.mValues.desired_acceleration, 1.5);
  assert.deepEqual(profile.units, {
    lane_center_offset: 'm',
    steering_response_time: 's',
    steering_rate_limit: 'rad/s',
    turn_entry_speed: 'm/s',
    turn_exit_acceleration: 'm/s²',
    corner_cutting_bias: 'ratio',
    lateral_clearance: 'm',
    lateral_correction_deadband: 'm',
  });
  assert.deepEqual(profile.mUnits, {
    curve_lateral_accel: 'm/s²',
    desired_acceleration: 'm/s²',
  });
  assert(Object.isFrozen(profile));
  assert(Object.isFrozen(profile.values));
  assert(Object.isFrozen(profile.mValues));
  // The capability comes from the certified 187 gate table, never from reading a key.
  for (const key of LATERAL_POLICY_V2_KEYS) {
    const definition = getParameterDefinition(key);
    assert.equal(definition.implemented, true);
    assert.equal(definition.unit, profile.units[key]);
  }
  assert.deepEqual(getLateralPolicyV2Stats(), {
    compiling: false,
    evaluating: false,
    retainedHistory: 0,
  });
});

test('179 rejects a missing key, a wrong unit and an out-of-range value before any decision', () => {
  const withoutTurnSpeed = lateralPolicyDocument();
  delete (withoutTurnSpeed.parameters as Record<string, number>).turn_entry_speed;
  delete (withoutTurnSpeed.unitsByParameter as Record<string, string>).turn_entry_speed;
  delete (withoutTurnSpeed.provenanceByParameter as Record<string, string>).turn_entry_speed;
  delete (withoutTurnSpeed.evidenceByParameter as Record<string, null>).turn_entry_speed;
  assert.throws(() => compileLateralPolicyProfile(withoutTurnSpeed), /Missing lateral policy/);
  const wrongUnit = lateralPolicyDocument();
  (wrongUnit.unitsByParameter as Record<string, string>).steering_rate_limit = 'm';
  assert.throws(() => compileLateralPolicyProfile(wrongUnit), /Wrong unit/);
  assert.throws(() => lateralPolicyProfile({ steering_rate_limit: 5 }), /range/);
  assert.throws(() => lateralPolicyProfile({ turn_entry_speed: 0 }), /range/);
});

test('179 refuses a foreign observation, a missing, stale or foreign 049 projection and any non-AUTO authority', () => {
  const manual = evaluate(turn, { authority: 'MANUAL' }).command;
  assert.equal(manual.reason, 'NO_AUTO_AUTHORITY');
  assert.equal(manual.action, 'UNAVAILABLE');
  const noProfile = evaluateLateralPolicyV2({ ...evaluate(turn).input, profile: null });
  assert.equal(noProfile.reason, 'MISSING_PROFILE');
  assert.equal(noProfile.action, 'UNAVAILABLE');
  const foreignObservation = evaluate(turn, {
    observation: {
      ...evaluate(turn).input.observation,
      tick: scenario.tick + 1,
    },
  }).command;
  assert.equal(foreignObservation.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  const missing = evaluate(turn, { lateral: null }).command;
  assert.equal(missing.reason, 'PROJECTION_UNAVAILABLE');
  assert.equal(missing.action, 'UNAVAILABLE');
  const stale = evaluate(turn, {
    tick: scenario.tick + 2,
    lateral: projectionAt(turn, scenario.tick),
  }).command;
  assert.equal(stale.reason, 'FOREIGN_OR_STALE_PROJECTION');
  const foreign = evaluate(turn, {
    lateral: { ...projectionAt(turn, scenario.tick), actor: { id: 'other', incarnation: 1 } },
  }).command;
  assert.equal(foreign.reason, 'FOREIGN_OR_STALE_PROJECTION');
  const unusable = evaluate({ ...turn, discontinuity: true }).command;
  assert.equal(unusable.reason, 'PROJECTION_UNUSABLE');
  assert.equal(unusable.projectionReason, 'OBSERVATION_DISCONTINUITY');
  assert.equal(unusable.steeringRad, 0);
  assert.equal(unusable.turnSpeedLimitMps, null);
});

test('179 each of the eight keys changes its own observable in an isolated scene', () => {
  const offsetLow = evaluate(straight, { rValues: { lane_center_offset: -1 } }).command,
    offsetHigh = evaluate(straight, { rValues: { lane_center_offset: 1 } }).command,
    responseLow = firstMovement(turn, {
      rValues: { steering_response_time: 0.05 },
    }),
    responseHigh = firstMovement(turn, {
      rValues: { steering_response_time: 1.5 },
    }),
    rateLow = firstMovement(turn, {
      rValues: { steering_response_time: 0.05, steering_rate_limit: 0.1 },
    }),
    rateHigh = firstMovement(turn, {
      rValues: { steering_response_time: 0.05, steering_rate_limit: 4 },
    }),
    entryLow = evaluate(turn, { rValues: { turn_entry_speed: 1 } }).command,
    entryHigh = evaluate(turn, { rValues: { turn_entry_speed: 18 } }).command,
    exitLow = evaluate(straight, {
      state: exitState,
      rValues: { turn_exit_acceleration: 0.2 },
    }).command,
    exitHigh = evaluate(straight, {
      state: exitState,
      rValues: { turn_exit_acceleration: 6 },
    }).command,
    cutLow = evaluate(turn, { rValues: { corner_cutting_bias: 0 } }).command,
    cutHigh = evaluate(turn, { rValues: { corner_cutting_bias: 1 } }).command,
    clearanceLow = evaluate(obstacle, { rValues: { lateral_clearance: 0.1 } }).command,
    clearanceHigh = evaluate(obstacle, { rValues: { lateral_clearance: 3 } }).command,
    deadbandLow = evaluate(deviation, {
      rValues: { lateral_correction_deadband: 0 },
    }).command,
    deadbandHigh = evaluate(deviation, {
      rValues: { lateral_correction_deadband: 0.6 },
    }).command;
  assert(close(offsetLow.laneOffsetTargetM, -0.9));
  assert(close(offsetHigh.laneOffsetTargetM, 0.9));
  assert.equal(responseLow.delayTicks, 3);
  assert.equal(responseHigh.delayTicks, 90);
  assert(close(rateLow.stepRad, 0.1 / 60, 1e-12));
  assert(close(rateHigh.stepRad, 1.5 / 60, 1e-12));
  assert.equal(entryLow.turnSpeedLimitMps, 1);
  assert(close(entryHigh.turnSpeedLimitMps ?? 0, 6.268769, 0.001));
  assert.equal(exitLow.exitAccelerationMps2, 0.2);
  assert.equal(exitHigh.exitAccelerationMps2, 1.5);
  assert.equal(cutLow.cornerCutM, 0);
  assert(close(cutHigh.cornerCutM, -0.9));
  assert.equal(clearanceLow.manoeuvrePermitted, true);
  assert.equal(clearanceHigh.manoeuvrePermitted, false);
  assert.equal(clearanceHigh.reason, 'CLEARANCE_HOLD');
  assert.equal(deadbandLow.correctionActive, true);
  assert.equal(deadbandHigh.correctionActive, false);
});

test('179 every key is inert in the other seven scenarios', () => {
  const rows = [
      {
        scene: straight,
        measure: (rValues: Record<string, number>) =>
          evaluate(straight, { rValues }).command.laneOffsetTargetM,
      },
      {
        scene: turn,
        measure: (rValues: Record<string, number>) => firstMovement(turn, { rValues }).delayTicks,
      },
      {
        scene: turn,
        measure: (rValues: Record<string, number>) => firstMovement(turn, { rValues }).stepRad,
      },
      {
        scene: turn,
        measure: (rValues: Record<string, number>) =>
          evaluate(turn, { rValues }).command.turnSpeedLimitMps ?? 0,
      },
      {
        scene: straight,
        measure: (rValues: Record<string, number>) =>
          evaluate(straight, { rValues, state: exitState }).command.exitAccelerationMps2,
      },
      {
        scene: turn,
        measure: (rValues: Record<string, number>) =>
          Math.abs(evaluate(turn, { rValues }).command.cornerCutM),
      },
      {
        scene: obstacle,
        measure: (rValues: Record<string, number>) =>
          evaluate(obstacle, { rValues }).command.manoeuvrePermitted ? 1 : 0,
      },
      {
        scene: deviation,
        measure: (rValues: Record<string, number>) =>
          evaluate(deviation, { rValues }).command.correctionActive ? 1 : 0,
      },
    ],
    ranges: Record<string, readonly [number, number]> = {
      lane_center_offset: [-1, 1],
      steering_response_time: [0.05, 1.5],
      steering_rate_limit: [0.1, 4],
      turn_entry_speed: [1, 18],
      turn_exit_acceleration: [0.2, 6],
      corner_cutting_bias: [0, 1],
      lateral_clearance: [0.1, 3],
      lateral_correction_deadband: [0, 0.6],
    };
  let pairs = 0;
  for (const [index, row] of rows.entries())
    for (const key of LATERAL_POLICY_V2_KEYS) {
      if (key === LATERAL_POLICY_V2_KEYS[index]) continue;
      const [low, high] = ranges[key],
        lowOutcome = row.measure({
          ...neutralLateralPolicyValues,
          [LATERAL_POLICY_V2_KEYS[index]]: ranges[LATERAL_POLICY_V2_KEYS[index]][0],
          [key]: low,
        }),
        highOutcome = row.measure({
          ...neutralLateralPolicyValues,
          [LATERAL_POLICY_V2_KEYS[index]]: ranges[LATERAL_POLICY_V2_KEYS[index]][0],
          [key]: high,
        });
      assert.equal(highOutcome, lowOutcome, `${key} is not inert in row ${index}`);
      pairs += 1;
    }
  assert.equal(pairs, 56);
});

test('179 the lane offset and the corner cut stay inside the delivered 049 corridor', () => {
  const sedanOffset = evaluate(straight, { rValues: { lane_center_offset: 1 } }).command,
    compactOffset = evaluate(straight, {
      rValues: { lane_center_offset: 1 },
      classId: 'compact',
    }).command,
    sedanCut = evaluate(turn, { rValues: { corner_cutting_bias: 1 } }).command,
    both = evaluate(turn, {
      rValues: { lane_center_offset: 1, corner_cutting_bias: 1 },
    }).command;
  assert(close(sedanOffset.laneCorridorM, 0.9));
  assert(close(sedanOffset.laneOffsetTargetM, 0.9));
  assert(close(compactOffset.laneCorridorM, 1));
  assert(close(compactOffset.laneOffsetTargetM, 1));
  assert(close(sedanCut.cornerCutM, -0.9));
  assert(close(sedanCut.desiredOffsetM, -0.9));
  // Offset and cut cannot add up beyond the corridor in either direction.
  assert.equal(Math.abs(both.desiredOffsetM), 0);
  assert.equal(Math.abs(both.desiredOffsetM) <= both.laneCorridorM + 1e-12, true);
});

test('179 the steering rate limit is capped so the command can never jump', () => {
  const high = firstMovement(turn, {
      rValues: { steering_response_time: 0.05, steering_rate_limit: 4 },
    }),
    low = firstMovement(turn, {
      rValues: { steering_response_time: 0.05, steering_rate_limit: 0.1 },
    }),
    ceiling = evaluate(turn, { rValues: { steering_rate_limit: 4 } }).command;
  assert.equal(ceiling.steeringRateRadPerS, 1.5);
  assert(close(high.stepRad, 1.5 / 60, 1e-12));
  assert(high.stepRad < 4 / 60);
  assert(close(low.stepRad, 0.1 / 60, 1e-12));
  assert.equal(low.delayTicks, high.delayTicks);
});

test('179 turn entry speed can never exceed the adherence ceiling derived from geometry', () => {
  const limits = Array.from(
      { length: 18 },
      (_, index) =>
        evaluate(turn, { rValues: { turn_entry_speed: index + 1 } }).command.turnSpeedLimitMps ?? 0,
    ),
    ceiling = evaluate(turn, { rValues: { turn_entry_speed: 18 } }).command.adherenceCeilingMps,
    strong = evaluate(turn, {
      rValues: { turn_entry_speed: 18 },
      mValues: { curve_lateral_accel: 8 },
    }).command;
  assert.equal(Math.max(...limits), limits[17]);
  assert(ceiling !== null && close(limits[17], ceiling));
  assert(limits.every((limit) => limit <= (ceiling ?? 0) + 1e-12));
  assert(limits[17] < 18);
  assert((strong.turnSpeedLimitMps ?? 0) > limits[17]);
  assert((strong.adherenceCeilingMps ?? 0) <= 7.483315 + 1e-6);
  assert(strong.turnSpeedLimitMps !== 18);
});

test('179 turn exit acceleration follows the M desired acceleration and never exceeds it', () => {
  const lowStyle = evaluate(straight, {
      state: exitState,
      rValues: { turn_exit_acceleration: 6 },
      mValues: { desired_acceleration: 0.8 },
    }).command,
    highStyle = evaluate(straight, {
      state: exitState,
      rValues: { turn_exit_acceleration: 6 },
      mValues: { desired_acceleration: 4 },
    }).command,
    insideTurn = evaluate(turn, {
      state: exitState,
      rValues: { turn_exit_acceleration: 6 },
    }).command,
    notLeaving = evaluate(straight, {
      rValues: { turn_exit_acceleration: 6 },
    }).command;
  assert.equal(lowStyle.exitAccelerationMps2, 0.8);
  assert.equal(highStyle.exitAccelerationMps2, 4);
  assert.equal(insideTurn.exitAccelerationMps2, 0);
  assert.equal(notLeaving.exitAccelerationMps2, 0);
});

test('179 the lateral clearance is a floor of the vehicle width plus margin and vetoes a tight gap', () => {
  const sedan = evaluate(obstacle, { rValues: { lateral_clearance: 0.1 } }).command,
    compact = evaluate(obstacle, {
      rValues: { lateral_clearance: 0.1 },
      classId: 'compact',
    }).command,
    tight = evaluate(
      { ...turn, obstacle: { side: 'RIGHT', lateralOffsetM: 3, widthM: 1.2 } },
      { rValues: { lateral_clearance: 0.1 } },
    ).command,
    unknown = evaluate(turn, { rValues: { lateral_clearance: 3 } }).command;
  assert.equal(sedan.effectiveClearanceM, 2);
  assert.equal(compact.effectiveClearanceM, 1.8);
  assert.equal(sedan.manoeuvrePermitted, true);
  assert(close(sedan.clearanceMarginM ?? 0, 0.6));
  assert.equal(tight.manoeuvrePermitted, false);
  assert.equal(tight.reason, 'CLEARANCE_HOLD');
  assert(close(tight.availableClearanceM ?? 0, 1.5));
  // Without a declared obstacle the key is a preference and never blocks the lane keeping.
  assert.equal(unknown.manoeuvrePermitted, true);
  assert.equal(unknown.availableClearanceM, null);
  assert.equal(unknown.reason, 'TRACKING');
});

test('179 the deadband stops only the correction, never the geometry tracking', () => {
  const withBand = run(deviation, {
      ticks: 12,
      rValues: { ...neutralLateralPolicyValues, lateral_correction_deadband: 0.6 },
    }).commands.at(-1),
    withoutBand = run(deviation, {
      ticks: 12,
      rValues: { ...neutralLateralPolicyValues, lateral_correction_deadband: 0 },
    }).commands.at(-1);
  assert(withBand !== undefined && withoutBand !== undefined);
  assert.equal(withBand.correctionActive, false);
  assert(close(withBand.steeringRad, baseSteeringRad(deviation), 1e-9));
  assert.equal(withoutBand.correctionActive, true);
  assert(withoutBand.steeringRad < withBand.steeringRad);
  assert(
    close(
      withoutBand.correctionSteeringRad,
      withoutBand.rawSteeringRad - withBand.steeringRad,
      1e-9,
    ),
  );
});

test('179 a foreign, stale or unusable 049 result is refused before any key acts', () => {
  const maxima = {
      lane_center_offset: 1,
      steering_response_time: 1.5,
      steering_rate_limit: 4,
      turn_entry_speed: 18,
      turn_exit_acceleration: 6,
      corner_cutting_bias: 1,
      lateral_clearance: 3,
      lateral_correction_deadband: 0,
    },
    unusable = evaluate({ ...turn, discontinuity: true }, { rValues: maxima }).command,
    stale = evaluate(turn, {
      tick: scenario.tick + 3,
      lateral: projectionAt(turn, scenario.tick),
      rValues: maxima,
    }).command;
  assert.equal(unusable.action, 'UNAVAILABLE');
  assert.equal(unusable.steeringRad, 0);
  assert.equal(unusable.steeringStepRad, 0);
  assert.equal(unusable.turnSpeedLimitMps, null);
  assert.equal(unusable.exitAccelerationMps2, 0);
  assert.equal(unusable.laneOffsetTargetM, 0);
  assert.equal(stale.action, 'UNAVAILABLE');
  assert.equal(stale.reason, 'FOREIGN_OR_STALE_PROJECTION');
});

test('179 refuses a caller state outside the delivered mechanics and the dead-time bound', () => {
  const sedan = vehicleClass('sedan'),
    beyond: LateralPolicyV2State = {
      steeringRad: sedan.steeringRadians + 0.01,
      committedTargetRad: 0,
      holdTicksRemaining: 0,
      inTurn: false,
    },
    longHold: LateralPolicyV2State = {
      steeringRad: 0,
      committedTargetRad: 0,
      holdTicksRemaining: Math.ceil(1.5 * 60) + 1,
      inTurn: false,
    };
  assert.throws(() => evaluate(turn, { state: beyond }), /range/);
  assert.throws(() => evaluate(turn, { state: longHold }), /exceeds its bound/);
  assert.throws(
    () =>
      evaluate(turn, {
        observation: {
          ...evaluate(turn).input.observation,
          obstacle: { side: 'LEFT', lateralOffsetM: 4, widthM: 1 },
        },
      }),
    /obstacle side/,
  );
});

test('179 the compact class keeps its own steering geometry', () => {
  const projection = projectionAt(turn, scenario.tick),
    compact = vehicleClass('compact'),
    sedan = vehicleClass('sedan'),
    compactRun = run(turn, { ticks: 20, classId: 'compact' }).commands.at(-1),
    sedanRun = run(turn, { ticks: 20, classId: 'sedan' }).commands.at(-1);
  assert(compact.steeringRadians !== sedan.steeringRadians);
  assert(compactRun !== undefined && sedanRun !== undefined);
  assert(close(compactRun.steeringRad, projection.steering * compact.steeringRadians, 1e-9));
  assert(close(sedanRun.steeringRad, projection.steering * sedan.steeringRadians, 1e-9));
  assert.equal(close(compactRun.steering, sedanRun.steering, 1e-9), true);
});

test('179 the same inputs and the same latch produce the same frozen command', () => {
  const values = {
      lane_center_offset: 0.4,
      steering_response_time: 0.5,
      steering_rate_limit: 0.6,
      turn_entry_speed: 4,
      turn_exit_acceleration: 1,
      corner_cutting_bias: 0.5,
      lateral_clearance: 1.2,
      lateral_correction_deadband: 0.05,
    },
    first = run(turn, { ticks: 20, rValues: values }),
    second = run(turn, { ticks: 20, rValues: values });
  assert.deepEqual(first, second);
  assert.equal(first.commands.length, 20);
  assert(first.commands.every((command) => Object.isFrozen(command)));
  assert(first.commands.every((command) => command.retainedHistory === 0));
  assert.equal(first.state.steeringRad, first.commands.at(-1)?.steeringRad);
  assert.equal(LATERAL_POLICY_V2_LIMITS.maximumSteeringRateRadPerS, 1.5);
  assert.equal(LATERAL_POLICY_V2_LIMITS.retainedHistory, 0);
  assert.equal(LATERAL_POLICY_V2_LIMITS.version, '179-lateral-policy-v2');
});
