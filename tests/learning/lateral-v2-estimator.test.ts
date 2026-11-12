import assert from 'node:assert/strict';
import test from 'node:test';
import { LATERAL_POLICY_V2_LIMITS } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import {
  LATERAL_V2_ESTIMATOR_KEYS,
  LATERAL_V2_ESTIMATOR_LIMITS,
  estimateLateralV2Style,
} from '../../src/learning/lateral-v2-estimator';
import type {
  LateralV2EstimatorKey,
  LateralV2EstimatorResult,
  LateralV2EvidenceEpisode,
} from '../../src/learning/lateral-v2-estimator';
import { evaluate, firstMovement, turnState } from '../autonomy/lateral-policy-v2-reference';
import {
  censoredResponseEpisodes,
  compactClearanceEpisodes,
  contradictoryDeadbandEpisodes,
  deadbandEpisodes,
  demonstrationKeys,
  keyEpisodes,
  lowerOnlyDeadbandEpisodes,
  manualEpisodes,
  missingLatchEpisodes,
  obstacleScene,
  positiveEpisodes,
  straightDeviationScene,
  straightScene,
  truncatedExitEpisodes,
  turnScene,
  unusablePrefixEpisodes,
  upperOnlyDeadbandEpisodes,
  wideDeadbandEpisodes,
} from './lateral-v2-estimator-reference';
import { runLateralV2EstimatorReport } from './lateral-v2-estimator-report';

const seed = 180;

function estimate(episodes: readonly LateralV2EvidenceEpisode[]): LateralV2EstimatorResult {
  return estimateLateralV2Style({ episodes, splitSeed: seed });
}
function digest(result: LateralV2EstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function near(actual: number | null, expected: number, tolerance: number): boolean {
  return actual !== null && Math.abs(actual - expected) <= tolerance;
}

test('180 fiecare cheie are contextul ei eligibil, din comanda 179 reală', () => {
  const positive = estimate(positiveEpisodes());
  assert.equal(LATERAL_V2_ESTIMATOR_KEYS.length, 8);
  assert.equal(
    new Set(LATERAL_V2_ESTIMATOR_KEYS.map((key) => positive.keys[key].scenario)).size,
    8,
  );
  for (const key of LATERAL_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.status, 'CANDIDATE', key);
    assert.equal(entry.reason, null, key);
    assert(
      near(entry.value, demonstrationKeys[key], key === 'steering_response_time' ? 0.01 : 1e-9),
      key,
    );
    assert(entry.eligibleContext.length > 80, key);
  }
});

test('180 un scenariu nu inventează cheile pe care scena nu le poate produce', () => {
  // A straight lane has no turn, no exit tick and no declared obstacle.
  const straightOnly = estimate([
    ...keyEpisodes('lane_center_offset'),
    ...keyEpisodes('steering_response_time', undefined, { idPrefix: 'response-straight' }),
  ]);
  for (const key of [
    'turn_entry_speed',
    'corner_cutting_bias',
    'turn_exit_acceleration',
    'lateral_clearance',
  ] as const) {
    assert.equal(straightOnly.keys[key].status, 'UNOBSERVED', key);
  }
  assert.equal(straightOnly.keys.lane_center_offset.status, 'CANDIDATE');
  assert.equal(straightOnly.keys.steering_response_time.status, 'CANDIDATE');

  // A two-tick turn tick cannot show the exit and cannot show the reaction of a 21-tick hold.
  const turnOnly = estimate(keyEpisodes('turn_entry_speed'));
  assert.equal(turnOnly.keys.turn_exit_acceleration.status, 'UNOBSERVED');
  assert.equal(turnOnly.keys.steering_response_time.status, 'UNOBSERVED');
  assert.equal(turnOnly.keys.lateral_clearance.status, 'UNOBSERVED');

  // Without a declared obstacle there is no lateral clearance fact at all.
  assert.deepEqual(
    LATERAL_V2_ESTIMATOR_KEYS.filter((key) => turnOnly.keys[key].status === 'CANDIDATE').sort(),
    ['corner_cutting_bias', 'lane_center_offset', 'turn_entry_speed'],
  );
});

test('180 un zero demonstrat rămâne candidat, nu dovezi lipsă', () => {
  const zeroOffset = estimate(keyEpisodes('lane_center_offset', [0, 0, 0, 0])).keys
    .lane_center_offset;
  assert.equal(zeroOffset.status, 'CANDIDATE');
  assert.equal(zeroOffset.value, 0);
  assert.equal(zeroOffset.rawValue, 0);
  assert.equal(zeroOffset.validation.status, 'VALIDATED');

  const zeroCut = estimate(keyEpisodes('corner_cutting_bias', [0, 0, 0, 0])).keys
    .corner_cutting_bias;
  assert.equal(zeroCut.status, 'CANDIDATE');
  assert.equal(zeroCut.value, 0);
  assert.equal(zeroCut.reason, null);

  // A straight tick has a structural cut of zero and must not be read as a zero preference.
  const noTurn = estimate(keyEpisodes('lane_center_offset')).keys.corner_cutting_bias;
  assert.equal(noTurn.status, 'UNOBSERVED');
  assert.equal(noTurn.value, null);
  assert.equal(noTurn.reason, 'NO_CORNER_CUT_EPISODE');
});

test('180 incertitudinea are prag per cheie, iar peste prag cheia rămâne neobservată', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of LATERAL_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.notEqual(entry.uncertainty, null, key);
    assert(entry.uncertainty! > 0, key);
    assert(entry.uncertainty! <= entry.uncertaintyThreshold, key);
    assert.equal(entry.uncertaintyThreshold, LATERAL_V2_ESTIMATOR_LIMITS.maximumUncertainty[key]);
  }

  const noisy: Readonly<Record<LateralV2EstimatorKey, readonly number[]>> = {
    lane_center_offset: [0, 0.3, 0.6, 0.85],
    steering_response_time: [0.1, 0.5, 0.9, 1.3],
    steering_rate_limit: [0.1, 0.55, 1, 1.45],
    turn_entry_speed: [1.5, 3.2, 4.6, 6],
    turn_exit_acceleration: [0.25, 0.65, 1.05, 1.45],
    corner_cutting_bias: [0, 0.3, 0.6, 0.9],
    lateral_clearance: [2.05, 2.35, 2.65, 2.95],
    lateral_correction_deadband: [0.1, 0.1, 0.1, 0.1],
  };
  for (const key of LATERAL_V2_ESTIMATOR_KEYS) {
    const result = estimate(
      key === 'lateral_correction_deadband'
        ? wideDeadbandEpisodes()
        : keyEpisodes(key, noisy[key], { idPrefix: `noisy-${key}` }),
    );
    const entry = result.keys[key];
    assert.equal(entry.status, 'UNOBSERVED', key);
    assert.equal(entry.reason, 'UNCERTAINTY_ABOVE_THRESHOLD', key);
    assert.equal(entry.value, null, key);
    assert(entry.uncertainty! > entry.uncertaintyThreshold, key);
  }
});

test('180 plafonul de rată ascunde cheile peste 1,5 rad/s', () => {
  const result = estimate(keyEpisodes('steering_rate_limit', [4, 4, 4, 4])).keys
    .steering_rate_limit;
  assert.equal(result.status, 'UNOBSERVED');
  assert.equal(result.value, null);
  assert.equal(result.reason, 'STEERING_RATE_CEILING_SATURATED');
  assert.equal(result.excluded.STEERING_RATE_CEILING_SATURATED, 4);

  const movement = firstMovement(turnScene, {
    rValues: { ...demonstrationKeys, steering_rate_limit: 4 },
  });
  assert(near(movement.stepRad * LATERAL_V2_ESTIMATOR_LIMITS.tickHz, 1.5, 1e-9));
});

test('180 podeaua de spațiu lateral ascunde cheile sub ecartament + 0,2 m', () => {
  const sedan = estimate(keyEpisodes('lateral_clearance', [0.5, 0.5, 0.8, 1.2])).keys
    .lateral_clearance;
  assert.equal(sedan.status, 'UNOBSERVED');
  assert.equal(sedan.value, null);
  assert.equal(sedan.reason, 'LATERAL_CLEARANCE_FLOOR_SATURATED');

  const compact = estimate(compactClearanceEpisodes()).keys.lateral_clearance;
  assert.equal(compact.status, 'CANDIDATE');
  assert(near(compact.value, 1.9, 1e-9));

  const command = evaluate(straightScene, {
    rValues: { ...demonstrationKeys, lateral_clearance: 0.5 },
  }).command;
  assert(near(command.effectiveClearanceM, 2, 1e-9));
  assert.equal(command.effectiveClearanceM, 1.8 + LATERAL_V2_ESTIMATOR_LIMITS.clearanceBodyMarginM);
});

test('180 intrarea în viraj peste aderență nu este observabilă', () => {
  const result = estimate(keyEpisodes('turn_entry_speed', [18, 18, 18, 18])).keys.turn_entry_speed;
  assert.equal(result.status, 'UNOBSERVED');
  assert.equal(result.reason, 'TURN_ENTRY_ADHERENCE_SATURATED');
  const command = evaluate(turnScene, { rValues: demonstrationKeys }).command;
  assert(command.adherenceCeilingMps !== null);
  assert(near(command.adherenceCeilingMps, 6.268769, 1e-5));
  assert(command.turnSpeedLimitMps !== null && command.turnSpeedLimitMps < 18);
});

test('180 accelerația de ieșire este plafonată de cheia M și de fereastra de tranziție', () => {
  const capped = estimate(keyEpisodes('turn_exit_acceleration', [6, 6, 6, 6])).keys
    .turn_exit_acceleration;
  assert.equal(capped.status, 'UNOBSERVED');
  assert.equal(capped.reason, 'TURN_EXIT_ACCELERATION_SATURATED');

  const command = evaluate(straightScene, {
    rValues: demonstrationKeys,
    state: turnState(turnScene),
  }).command;
  assert(near(command.exitAccelerationMps2, demonstrationKeys.turn_exit_acceleration, 1e-9));
  assert(command.exitAccelerationMps2 < 6);

  const truncated = estimate(truncatedExitEpisodes()).keys.turn_exit_acceleration;
  assert.equal(truncated.status, 'UNOBSERVED');
  assert.equal(truncated.reason, 'NO_TURN_EXIT_EPISODE');
});

test('180 coridorul ascunde deplasarea de bandă peste ±0,9 m', () => {
  const result = estimate(keyEpisodes('lane_center_offset', [1, 1, 1, 1])).keys.lane_center_offset;
  assert.equal(result.status, 'UNOBSERVED');
  assert.equal(result.reason, 'OFFSET_CORRIDOR_SATURATED');
  const command = evaluate(straightScene, {
    rValues: { ...demonstrationKeys, lane_center_offset: 1 },
  }).command;
  assert(near(command.laneCorridorM, command.laneOffsetTargetM, 1e-9));
  assert(near(command.laneCorridorM, 0.9, 1e-9));
});

test('180 timpul mort depinde de continuitatea latch-ului', () => {
  const positive = estimate(keyEpisodes('steering_response_time')).keys.steering_response_time;
  assert.equal(positive.status, 'CANDIDATE');
  assert(near(positive.value, (21 - 0.5) / 60, 1e-9));

  const censored = estimate(censoredResponseEpisodes()).keys.steering_response_time;
  assert.equal(censored.status, 'UNOBSERVED');
  assert.equal(censored.reason, 'RESPONSE_CENSORED');

  const missing = estimate(missingLatchEpisodes()).keys.steering_response_time;
  assert.equal(missing.status, 'UNOBSERVED');
  assert.equal(missing.reason, 'RESPONSE_LATCH_MISSING');
});

test('180 banda moartă este o inegalitate, nu o valoare exactă', () => {
  const positive = estimate(deadbandEpisodes()).keys.lateral_correction_deadband;
  assert.equal(positive.status, 'CANDIDATE');
  assert(near(positive.value, demonstrationKeys.lateral_correction_deadband, 1e-9));
  assert(
    near(
      positive.uncertainty,
      LATERAL_V2_ESTIMATOR_LIMITS.uncertaintyFloor.lateral_correction_deadband,
      1e-9,
    ),
  );

  const lower = estimate(lowerOnlyDeadbandEpisodes()).keys.lateral_correction_deadband;
  assert.equal(lower.status, 'UNOBSERVED');
  assert.equal(lower.reason, 'DEADBAND_UPPER_BOUND_UNOBSERVED');

  const upper = estimate(upperOnlyDeadbandEpisodes()).keys.lateral_correction_deadband;
  assert.equal(upper.status, 'UNOBSERVED');
  assert.equal(upper.reason, 'DEADBAND_LOWER_BOUND_UNOBSERVED');

  const contradictory = estimate(contradictoryDeadbandEpisodes()).keys.lateral_correction_deadband;
  assert.equal(contradictory.status, 'UNOBSERVED');
  assert.equal(contradictory.reason, 'CONTRADICTORY_DEADBAND_BOUNDS');
  assert.equal(contradictory.excluded.CONTRADICTORY_DEADBAND_BOUNDS, 4);

  const wide = estimate(wideDeadbandEpisodes()).keys.lateral_correction_deadband;
  assert.equal(wide.status, 'UNOBSERVED');
  assert.equal(wide.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
});

test('180 validarea folosește date independente și un set mic dă TOO_SMALL', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of LATERAL_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.validation.status, 'VALIDATED', key);
    assert(entry.validation.episodes >= LATERAL_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes);
    assert(entry.sourceEpisodes >= LATERAL_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes);
  }
  assert.equal(new Set(positive.admittedEpisodes).size, positive.admittedEpisodes.length);

  const tiny = estimate(keyEpisodes('lane_center_offset').slice(0, 3));
  assert.equal(tiny.keys.lane_center_offset.status, 'CANDIDATE');
  assert.equal(tiny.keys.lane_center_offset.validation.status, 'TOO_SMALL');
  assert.equal(tiny.keys.lane_center_offset.validation.episodes, 1);
});

test('180 intrările neeligibile, duplicate sau malformate sunt refuzate', () => {
  const manual = estimate(manualEpisodes());
  assert.equal(manual.admittedEpisodes.length, 0);
  assert.equal(manual.refusedEpisodes.length, 4);
  assert(manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE'));
  assert.equal(manual.keys.lane_center_offset.status, 'UNOBSERVED');
  assert.equal(manual.keys.lane_center_offset.reason, 'NO_ELIGIBLE_EPISODES');

  const prefix = estimate(unusablePrefixEpisodes());
  assert(prefix.refusedEpisodes.every((entry) => entry.reason === 'NO_USABLE_PREFIX'));

  const duplicate = estimate([positiveEpisodes()[0]!, positiveEpisodes()[0]!]);
  assert.equal(duplicate.refusedEpisodes.length, 1);
  assert.equal(duplicate.refusedEpisodes[0]!.reason, 'DUPLICATE_EPISODE');

  const invalid = positiveEpisodes()[0]!;
  assert.throws(
    () =>
      estimateLateralV2Style({
        splitSeed: seed,
        episodes: [
          {
            ...invalid,
            samples: [
              { ...invalid.samples[0]!, laneOffsetTargetM: Number.NaN },
              ...invalid.samples.slice(1),
            ],
          },
        ],
      }),
    /lateral evidence/i,
  );
});

test('180 estimarea este deterministă și valorile stau în intervalele catalogului', () => {
  const first = estimate(positiveEpisodes());
  assert.equal(digest(first), digest(estimate(positiveEpisodes())));
  assert.equal(first.splitSeed, seed);
  for (const key of LATERAL_V2_ESTIMATOR_KEYS) {
    const entry = first.keys[key],
      definition = getParameterDefinition(key);
    assert(entry.value !== null, key);
    assert(entry.value! >= definition.min && entry.value! <= definition.max, key);
    assert.equal(entry.unit, definition.unit, key);
    assert.equal(entry.clamped, false, key);
    assert.equal(entry.uncertaintyThreshold, LATERAL_V2_ESTIMATOR_LIMITS.maximumUncertainty[key]);
  }
  assert.equal(first.groupConstraints.length, 7);
  assert(
    first.groupConstraints.some((entry) => entry.id === 'RATE_CEILING_HIDES_HIGH_KEYS'),
    'the rate ceiling is an explained group constraint',
  );
});

test('180 179 citește estimările fără schimbare de semantică', () => {
  const values = Object.fromEntries(
    LATERAL_V2_ESTIMATOR_KEYS.map((key) => [key, estimate(positiveEpisodes()).keys[key].value!]),
  ) as Record<LateralV2EstimatorKey, number>;

  const offset = evaluate(straightScene, { rValues: values }).command;
  assert(near(offset.laneOffsetTargetM, values.lane_center_offset, 1e-9));
  assert.equal(firstMovement(straightScene, { rValues: values }).delayTicks, 21);

  const movement = firstMovement(turnScene, { rValues: values });
  assert(near(movement.stepRad, values.steering_rate_limit / 60, 1e-9));

  const entry = evaluate(turnScene, { rValues: values }).command;
  assert(near(entry.turnSpeedLimitMps, values.turn_entry_speed, 1e-9));
  assert(near(entry.cornerCutM, -values.corner_cutting_bias * entry.laneCorridorM, 1e-9));

  const exit = evaluate(straightScene, {
    rValues: values,
    state: turnState(turnScene),
  }).command;
  assert(near(exit.exitAccelerationMps2, values.turn_exit_acceleration, 1e-9));

  const clearance = evaluate(obstacleScene(values.lateral_clearance), { rValues: values }).command;
  assert(near(clearance.effectiveClearanceM, values.lateral_clearance, 1e-9));
  assert.equal(clearance.manoeuvrePermitted, true);

  const inside = evaluate(
    straightDeviationScene(0.4 + values.lateral_correction_deadband - 0.001),
    { rValues: values },
  ).command;
  const outside = evaluate(
    straightDeviationScene(0.4 + values.lateral_correction_deadband + 0.001),
    { rValues: values },
  ).command;
  assert.equal(inside.correctionActive, false);
  assert.equal(outside.correctionActive, true);
});

test('180 raportul determinist trece toate verificările', () => {
  const report = runLateralV2EstimatorReport();
  assert.equal(report.version, '180-lateral-estimator-v2');
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(report.summary.passed, report.checks.length);
  assert.equal(report.summary.pass, true);
  assert.equal(report.rows.length, 8);
  assert.equal(report.rows.filter((entry) => entry.status === 'CANDIDATE').length, 8);
  assert.equal(report.determinism.digest, report.determinism.repeatedDigest);
  assert.equal(report.split.disjoint, true);
  assert.equal(report.compatibility.policyVersion, LATERAL_POLICY_V2_LIMITS.version);
  assert.equal(report.compatibility.candidateOnly, true);
  assert.equal(report.compatibility.changesPolicySemantics, false);
});
