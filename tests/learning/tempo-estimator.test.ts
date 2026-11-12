import assert from 'node:assert/strict';
import test from 'node:test';
import { getParameterDefinition } from '../../src/profiles';
import {
  TEMPO_ESTIMATOR_KEYS,
  TEMPO_ESTIMATOR_LIMITS,
  estimateSpeedPolicyTempo,
} from '../../src/learning/tempo-estimator';
import type { TempoEstimatorResult } from '../../src/learning/tempo-estimator';
import { speedProfileDocument, evaluate } from '../autonomy/speed-policy-reference';
import { compileSpeedPolicyProfile } from '../../src/autonomy/speed-policy';
import {
  arterialEpisodes,
  contradictoryDeadbandEpisodes,
  coveringDeadbandEpisodes,
  deadbandEpisodes,
  overtakeEpisodes,
  positiveEpisodes,
  shortCruiseEpisodes,
  tempoEpisode,
  tempoSample,
  tempoStep,
  trafficDominatedArterialEpisodes,
  trafficDominatedOvertakeEpisodes,
  variabilityEpisodes,
} from './tempo-estimator-reference';

const seed = 168;

function estimate(episodes: Parameters<typeof estimateSpeedPolicyTempo>[0]['episodes']) {
  return estimateSpeedPolicyTempo({ episodes, splitSeed: seed });
}
function digest(result: TempoEstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

test('168 each key needs its own eligible context and never borrows another fact', () => {
  const arterialOnly = estimate(arterialEpisodes());
  assert.equal(arterialOnly.keys.speed_delta_arterial.status, 'CANDIDATE');
  assert(Math.abs(arterialOnly.keys.speed_delta_arterial.value! - 4) < 0.2);
  for (const key of [
    'cruise_speed_variability',
    'overtake_speed_bonus',
    'cruise_accel_deadband',
  ] as const) {
    assert.equal(arterialOnly.keys[key].status, 'UNOBSERVED');
    assert.equal(arterialOnly.keys[key].value, null);
  }
  assert.equal(arterialOnly.keys.cruise_accel_deadband.reason, 'NO_TARGET_STEPS');

  const cruiseOnly = estimate(variabilityEpisodes());
  assert.equal(cruiseOnly.keys.cruise_speed_variability.status, 'CANDIDATE');
  assert(Math.abs(cruiseOnly.keys.cruise_speed_variability.value! - 1.2) < 0.05);
  assert.equal(cruiseOnly.keys.speed_delta_arterial.status, 'UNOBSERVED');
  assert.equal(cruiseOnly.keys.speed_delta_arterial.reason, 'NO_ELIGIBLE_EPISODES');
  assert.equal(cruiseOnly.keys.overtake_speed_bonus.status, 'UNOBSERVED');

  const overtakesOnly = estimate(overtakeEpisodes());
  assert.equal(overtakesOnly.keys.overtake_speed_bonus.status, 'CANDIDATE');
  assert(Math.abs(overtakesOnly.keys.overtake_speed_bonus.value! - 2) < 0.001);
  assert.equal(overtakesOnly.keys.cruise_speed_variability.status, 'UNOBSERVED');

  const stepsOnly = estimate(deadbandEpisodes());
  assert.equal(stepsOnly.keys.cruise_accel_deadband.status, 'CANDIDATE');
  assert(Math.abs(stepsOnly.keys.cruise_accel_deadband.value! - 0.325) < 1e-12);
  assert(Math.abs(stepsOnly.keys.cruise_accel_deadband.uncertaintyMps! - 0.075) < 1e-12);
});

test('168 uncertainty is reported and an uncertain estimate stays unobserved', () => {
  const clean = estimate(arterialEpisodes());
  const cleanKey = clean.keys.speed_delta_arterial;
  assert.equal(cleanKey.status, 'CANDIDATE');
  assert(cleanKey.uncertaintyMps !== null && cleanKey.uncertaintyMps > 0);
  assert(cleanKey.uncertaintyMps! <= cleanKey.uncertaintyThresholdMps);

  const noisy = estimate(arterialEpisodes([1, 3, 7, 9]));
  const noisyKey = noisy.keys.speed_delta_arterial;
  assert.equal(noisyKey.status, 'UNOBSERVED');
  assert.equal(noisyKey.value, null);
  assert.equal(noisyKey.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    noisyKey.uncertaintyMps! > TEMPO_ESTIMATOR_LIMITS.maximumUncertaintyMps.speed_delta_arterial,
  );
});

test('168 the validation split is explicit, disjoint and evaluated on held-out episodes', () => {
  const report = estimate(positiveEpisodes());
  for (const key of TEMPO_ESTIMATOR_KEYS) {
    const entry = report.keys[key];
    assert.equal(entry.status, 'CANDIDATE', `${key} should be a candidate`);
    assert.equal(entry.validation.status, 'VALIDATED', `${key} validation`);
    assert(entry.validation.episodes >= TEMPO_ESTIMATOR_LIMITS.minimumValidationEpisodes);
    assert(entry.sourceEpisodes >= TEMPO_ESTIMATOR_LIMITS.minimumEstimateEpisodes);
    assert(
      entry.validation.errorMps === null ||
        entry.validation.errorMps <= entry.validation.toleranceMps,
    );
  }
  assert.equal(report.splitSeed, seed);
  assert.equal(report.refusedEpisodes.length, 0);
  assert.equal(report.admittedEpisodes.length, positiveEpisodes().length);
  const unique = new Set(report.admittedEpisodes);
  assert.equal(unique.size, report.admittedEpisodes.length);

  const tooSmall = estimate(arterialEpisodes([3.9, 4.1, 4]));
  assert.equal(tooSmall.keys.speed_delta_arterial.validation.status, 'TOO_SMALL');
  assert.equal(tooSmall.keys.speed_delta_arterial.status, 'CANDIDATE');
});

test('168 unidentifiable facts keep the key unobserved with an explicit reason', () => {
  const arterialTraffic = estimate(trafficDominatedArterialEpisodes());
  assert.equal(arterialTraffic.keys.speed_delta_arterial.status, 'UNOBSERVED');
  assert.equal(arterialTraffic.keys.speed_delta_arterial.value, null);
  assert.equal(arterialTraffic.keys.speed_delta_arterial.reason, 'TRAFFIC_DOMINATED');
  assert.equal(arterialTraffic.keys.speed_delta_arterial.excluded.TRAFFIC_CONSTRAINED, 3);

  const overtakeTraffic = estimate(trafficDominatedOvertakeEpisodes());
  assert.equal(overtakeTraffic.keys.overtake_speed_bonus.status, 'UNOBSERVED');
  assert.equal(overtakeTraffic.keys.overtake_speed_bonus.reason, 'TRAFFIC_DOMINATED');
  assert.equal(overtakeTraffic.keys.overtake_speed_bonus.excluded.TRAFFIC_DOMINATED, 2);

  const short = estimate(shortCruiseEpisodes());
  assert.equal(short.keys.cruise_speed_variability.status, 'UNOBSERVED');
  assert.equal(short.keys.cruise_speed_variability.excluded.SHORT_CRUISE_CYCLE, 3);

  const covering = estimate(coveringDeadbandEpisodes());
  assert.equal(covering.keys.cruise_accel_deadband.status, 'UNOBSERVED');
  assert.equal(covering.keys.cruise_accel_deadband.reason, 'DEADBAND_UPPER_BOUND_UNOBSERVED');

  const contradiction = estimate(contradictoryDeadbandEpisodes());
  assert.equal(contradiction.keys.cruise_accel_deadband.status, 'UNOBSERVED');
  assert.equal(contradiction.keys.cruise_accel_deadband.reason, 'CONTRADICTORY_STEP_BOUNDS');
});

test('168 group constraints explain which keys cannot be separated from the same facts', () => {
  const report = estimate(positiveEpisodes());
  assert.equal(report.groupConstraints.length, 4);
  const shared = report.groupConstraints.find((entry) => entry.id === 'CRUISE_DISPERSION_SHARED');
  assert(shared);
  assert(shared.explanation.includes('dispersie'));
  assert.deepEqual(shared.keys, ['cruise_speed_variability', 'cruise_accel_deadband']);
  for (const entry of report.groupConstraints) {
    assert(entry.explanation.length > 40);
    for (const key of entry.keys) assert(TEMPO_ESTIMATOR_KEYS.includes(key));
  }
  // Cruise dispersion alone measures variability; it can never prove the deadband.
  const cruise = estimate(variabilityEpisodes());
  assert.equal(cruise.keys.cruise_speed_variability.status, 'CANDIDATE');
  assert.equal(cruise.keys.cruise_accel_deadband.status, 'UNOBSERVED');
  assert.equal(cruise.keys.cruise_accel_deadband.reason, 'NO_TARGET_STEPS');
});

test('168 invalid input is refused and non-learning evidence is not admitted', () => {
  assert.throws(
    () => estimate([tempoEpisode('bad-speed', [tempoSample(0, Number.NaN)])]),
    /tempo evidence/i,
  );
  assert.throws(() => estimateSpeedPolicyTempo({ episodes: [], splitSeed: -1 }), /split seed/i);
  assert.throws(
    () =>
      estimate([
        tempoEpisode('unresolved', [tempoSample(0, 12)], {
          steps: [tempoStep(10, 12, 12.5, false)],
        }),
        tempoEpisode('bad-lead', [tempoSample(0, 12, { leadGapM: 5, leadSpeedMps: null })]),
      ]),
    /lead facts/i,
  );
  const refused = estimate([
    tempoEpisode('manual', [tempoSample(0, 12)], {
      eligibilityOverrides: { controlMode: 'MANUAL', learningEligible: false },
    }),
    tempoEpisode('duplicate', [tempoSample(0, 12)]),
    tempoEpisode('duplicate', [tempoSample(1, 12)]),
  ]);
  assert.deepEqual(refused.refusedEpisodes.map((entry) => entry.reason).sort(), [
    'DUPLICATE_EPISODE',
    'NOT_LEARNING_ELIGIBLE',
  ]);
  assert.equal(refused.keys.speed_delta_arterial.status, 'UNOBSERVED');
  assert.equal(refused.keys.speed_delta_arterial.value, null);
});

test('168 the same facts and seed always produce the same estimate', () => {
  const first = estimate(positiveEpisodes()),
    second = estimate(positiveEpisodes()),
    otherSeed = estimateSpeedPolicyTempo({ episodes: positiveEpisodes(), splitSeed: 169 });
  assert.equal(digest(first), digest(second));
  assert.deepEqual(first, second);
  assert.equal(first.version, '168-tempo-estimator-v1');
  assert.equal(TEMPO_ESTIMATOR_LIMITS.retainedHistory, 0);
  assert.notEqual(first.splitSeed, otherSeed.splitSeed);
});

test('168 estimates stay inside the 092 ranges and the 167 policy reads them unchanged', () => {
  const report = estimate(positiveEpisodes());
  for (const key of TEMPO_ESTIMATOR_KEYS) {
    const definition = getParameterDefinition(key),
      entry = report.keys[key];
    assert.equal(entry.unit, definition.unit);
    assert(entry.value! >= definition.min && entry.value! <= definition.max);
    assert.equal(entry.clamped, false);
    assert.equal(entry.rawValue, entry.value);
  }
  assert.equal(report.compatibility.policyVersion, '167-speed-policy-v1');
  assert.equal(report.compatibility.candidateOnly, true);
  assert.equal(report.compatibility.changesPolicySemantics, false);

  const values = Object.fromEntries(
      TEMPO_ESTIMATOR_KEYS.map((key) => [key, report.keys[key].value!]),
    ),
    profile = compileSpeedPolicyProfile(speedProfileDocument(undefined, values)),
    command = evaluate(profile, {
      target: null,
      observation: { roadKind: 'ARTERIAL' },
    }),
    arterialDelta = report.keys.speed_delta_arterial.value!,
    variability = report.keys.cruise_speed_variability.value!,
    deadband = report.keys.cruise_accel_deadband.value!;
  assert.equal(command.reason, 'SPEED_POLICY');
  assert.equal(command.deadbandMps, deadband);
  assert.equal(command.baseStyleMps, 13.9 + arterialDelta);
  assert.equal(command.styleCeilingMps, 13.9 + arterialDelta);
  assert(command.committedTargetMps <= command.styleCeilingMps);
  assert(command.committedTargetMps >= command.styleCeilingMps - variability - deadband);
});
