import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCEL_ESTIMATOR_KEYS,
  ACCEL_ESTIMATOR_LIMITS,
  estimateAccelPolicyStyle,
} from '../../src/learning/accel-estimator';
import type { AccelEstimatorResult } from '../../src/learning/accel-estimator';
import { ACCEL_POLICY_LIMITS } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import { accelProfile, evaluate, simulate } from '../autonomy/accel-policy-reference';
import {
  brakingAfterLiftEpisodes,
  brakingEpisodes,
  brakingSamples,
  censoredBrakingEpisodes,
  censoredReleaseEpisodes,
  changingDemandEpisodes,
  coastingEpisodes,
  envelopeCoastingEpisodes,
  envelopeLaunchEpisodes,
  hardBrakingEpisodes,
  launchEpisodes,
  noisyBrakingEpisodes,
  positiveEpisodes,
  releaseEpisodes,
  strongCoastingEpisodes,
  strongRequestEpisodes,
  vetoedEpisodes,
  accelEpisode,
  accelSample,
} from './accel-estimator-reference';

const seed = 170;

function estimate(episodes: Parameters<typeof estimateAccelPolicyStyle>[0]['episodes']) {
  return estimateAccelPolicyStyle({ episodes, splitSeed: seed });
}
function digest(result: AccelEstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

test('170 each key needs its own eligible fact and never borrows another fact', () => {
  const brakingOnly = estimate(brakingEpisodes());
  assert.equal(brakingOnly.keys.braking_jerk.status, 'CANDIDATE');
  assert(Math.abs(brakingOnly.keys.braking_jerk.value! - 3) < 0.2);
  for (const key of ['throttle_release_delay', 'launch_intensity', 'coasting_bias'] as const) {
    assert.equal(brakingOnly.keys[key].status, 'UNOBSERVED');
    assert.equal(brakingOnly.keys[key].value, null);
  }

  const releaseOnly = estimate(releaseEpisodes());
  assert.equal(releaseOnly.keys.throttle_release_delay.status, 'CANDIDATE');
  assert(Math.abs(releaseOnly.keys.throttle_release_delay.value! - 0.2) < 0.02);
  assert.equal(releaseOnly.keys.braking_jerk.reason, 'NO_BRAKING_EVENT');
  assert.equal(releaseOnly.keys.launch_intensity.status, 'UNOBSERVED');

  const launchOnly = estimate(launchEpisodes());
  assert.equal(launchOnly.keys.launch_intensity.status, 'CANDIDATE');
  assert(Math.abs(launchOnly.keys.launch_intensity.value! - 0.6) < 0.05);
  assert.equal(launchOnly.keys.coasting_bias.reason, 'NO_COASTING_EVENT');
  assert.equal(launchOnly.keys.throttle_release_delay.reason, 'NO_RELEASE_EVENT');

  const coastingOnly = estimate(coastingEpisodes());
  assert.equal(coastingOnly.keys.coasting_bias.status, 'CANDIDATE');
  assert(Math.abs(coastingOnly.keys.coasting_bias.value! - 0.4) < 0.05);
  assert.equal(coastingOnly.keys.launch_intensity.reason, 'NO_LAUNCH_EVENT');
  assert.equal(coastingOnly.keys.braking_jerk.reason, 'NO_BRAKING_EVENT');
});

test('170 uncertainty is reported and an uncertain estimate stays unobserved', () => {
  const clean = estimate(brakingEpisodes());
  const cleanKey = clean.keys.braking_jerk;
  assert.equal(cleanKey.status, 'CANDIDATE');
  assert(cleanKey.uncertainty !== null && cleanKey.uncertainty > 0);
  assert(cleanKey.uncertainty! <= cleanKey.uncertaintyThreshold);

  const noisy = estimate(noisyBrakingEpisodes());
  const noisyKey = noisy.keys.braking_jerk;
  assert.equal(noisyKey.status, 'UNOBSERVED');
  assert.equal(noisyKey.value, null);
  assert.equal(noisyKey.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(noisyKey.uncertainty! > ACCEL_ESTIMATOR_LIMITS.maximumUncertainty.braking_jerk);
});

test('170 the validation split is explicit, disjoint and evaluated on held-out episodes', () => {
  const report = estimate(positiveEpisodes());
  const episodesByFamily = {
    braking_jerk: 4,
    throttle_release_delay: 4,
    launch_intensity: 4,
    coasting_bias: 4,
  } as const;
  for (const key of ACCEL_ESTIMATOR_KEYS) {
    const entry = report.keys[key];
    assert.equal(entry.status, 'CANDIDATE', `${key} should be a candidate`);
    assert.equal(entry.validation.status, 'VALIDATED', `${key} validation`);
    assert(entry.validation.episodes >= ACCEL_ESTIMATOR_LIMITS.minimumValidationEpisodes);
    assert(entry.sourceEpisodes >= ACCEL_ESTIMATOR_LIMITS.minimumEstimateEpisodes);
    assert.equal(entry.sourceEpisodes + entry.validation.episodes, episodesByFamily[key]);
    assert(entry.validation.error === null || entry.validation.error <= entry.validation.tolerance);
  }
  assert.equal(report.splitSeed, seed);
  assert.equal(report.refusedEpisodes.length, 0);
  assert.equal(report.admittedEpisodes.length, positiveEpisodes().length);
  assert.equal(new Set(report.admittedEpisodes).size, report.admittedEpisodes.length);

  const tooSmall = estimate(brakingEpisodes([2.9, 3.0, 3.1]));
  assert.equal(tooSmall.keys.braking_jerk.status, 'CANDIDATE');
  assert.equal(tooSmall.keys.braking_jerk.validation.status, 'TOO_SMALL');
});

test('170 unidentifiable facts keep the key unobserved with an explicit reason', () => {
  const steady = estimate(strongRequestEpisodes());
  for (const key of ACCEL_ESTIMATOR_KEYS) {
    assert.equal(steady.keys[key].status, 'UNOBSERVED', key);
    assert.equal(steady.keys[key].value, null, key);
  }
  assert.equal(steady.keys.braking_jerk.reason, 'NO_BRAKING_EVENT');
  assert.equal(steady.keys.throttle_release_delay.reason, 'NO_RELEASE_EVENT');
  assert.equal(steady.keys.launch_intensity.reason, 'NO_LAUNCH_EVENT');
  assert.equal(steady.keys.coasting_bias.reason, 'STRONG_REQUEST');

  const censoredBraking = estimate(censoredBrakingEpisodes());
  assert.equal(censoredBraking.keys.braking_jerk.reason, 'BRAKING_RAMP_CENSORED');

  const hardBraking = estimate(hardBrakingEpisodes());
  assert.equal(hardBraking.keys.braking_jerk.reason, 'BRAKING_RAMP_NOT_OBSERVED');

  const changing = estimate(changingDemandEpisodes());
  assert.equal(changing.keys.braking_jerk.reason, 'BRAKING_DEMAND_CHANGED');

  const censoredRelease = estimate(censoredReleaseEpisodes());
  assert.equal(censoredRelease.keys.throttle_release_delay.reason, 'RELEASE_HOLD_CENSORED');

  const strongCoast = estimate(strongCoastingEpisodes());
  assert.equal(strongCoast.keys.coasting_bias.reason, 'STRONG_REQUEST');
  assert.equal(strongCoast.keys.coasting_bias.excluded.STRONG_REQUEST, 4);

  const envelopeCoast = estimate(envelopeCoastingEpisodes());
  assert.equal(envelopeCoast.keys.coasting_bias.reason, 'COASTING_FACTOR_OUT_OF_ENVELOPE');

  const envelopeLaunch = estimate(envelopeLaunchEpisodes());
  assert.equal(envelopeLaunch.keys.launch_intensity.reason, 'LAUNCH_FACTOR_OUT_OF_ENVELOPE');
});

test('170 the shared pedal transition proves braking while the hold stays excluded', () => {
  const report = estimate(brakingAfterLiftEpisodes());
  assert.equal(report.keys.braking_jerk.status, 'CANDIDATE');
  assert.equal(report.keys.throttle_release_delay.status, 'UNOBSERVED');
  assert.equal(report.keys.throttle_release_delay.reason, 'RELEASE_CANCELLED_BY_BRAKING');
  assert.equal(report.keys.throttle_release_delay.excluded.RELEASE_CANCELLED_BY_BRAKING, 4);
});

test('170 the safety veto splits braking from throttle, launch and coasting', () => {
  const report = estimate(vetoedEpisodes());
  assert.equal(report.keys.braking_jerk.status, 'CANDIDATE');
  assert.equal(report.keys.throttle_release_delay.status, 'UNOBSERVED');
  assert.equal(report.keys.throttle_release_delay.reason, 'SAFETY_CONSTRAINED');
  assert.equal(report.keys.launch_intensity.reason, 'NO_LAUNCH_EVENT');
  assert.equal(report.keys.coasting_bias.reason, 'SAFETY_CONSTRAINED');
});

test('170 group constraints explain which keys cannot be separated from the same facts', () => {
  const report = estimate(positiveEpisodes());
  assert.equal(report.groupConstraints.length, 4);
  const shared = report.groupConstraints.find(
    (entry) => entry.id === 'BRAKING_AND_RELEASE_SHARED_TRANSITION',
  );
  assert(shared);
  assert(shared.explanation.includes('tranziție'));
  assert.deepEqual(shared.keys, ['braking_jerk', 'throttle_release_delay']);
  const launchAndCoast = report.groupConstraints.find(
    (entry) => entry.id === 'LAUNCH_AND_COAST_SHARED_REQUEST',
  );
  assert(launchAndCoast);
  assert.deepEqual(launchAndCoast.keys, ['launch_intensity', 'coasting_bias']);
  for (const entry of report.groupConstraints) {
    assert(entry.explanation.length > 40);
    for (const key of entry.keys) assert(ACCEL_ESTIMATOR_KEYS.includes(key));
  }
});

test('170 invalid input is refused and non-learning evidence is not admitted', () => {
  assert.throws(
    () => estimate([accelEpisode('bad-speed', [accelSample(0, Number.NaN, 0, 0)])]),
    /accel evidence/i,
  );
  assert.throws(() => estimateAccelPolicyStyle({ episodes: [], splitSeed: -1 }), /split seed/i);
  assert.throws(
    () =>
      estimate([
        accelEpisode('bad-lead', [accelSample(0, 12, 0, 0, { leadGapM: 5, leadSpeedMps: null })]),
      ]),
    /lead facts/i,
  );
  assert.throws(
    () => estimate([accelEpisode('inconsistent', [accelSample(0, 12, -2, 0.5)])]),
    /accel evidence braking/i,
  );
  const refused = estimate([
    accelEpisode('manual', [accelSample(0, 12, -2, -2)], {
      eligibilityOverrides: { controlMode: 'MANUAL', learningEligible: false },
    }),
    accelEpisode('duplicate', brakingSamples(3)),
    accelEpisode('duplicate', brakingSamples(3)),
  ]);
  assert.deepEqual(refused.refusedEpisodes.map((entry) => entry.reason).sort(), [
    'DUPLICATE_EPISODE',
    'NOT_LEARNING_ELIGIBLE',
  ]);
  assert.equal(refused.keys.braking_jerk.status, 'UNOBSERVED');
  assert.equal(refused.keys.braking_jerk.value, null);
});

test('170 the same facts and seed always produce the same estimate', () => {
  const first = estimate(positiveEpisodes()),
    second = estimate(positiveEpisodes()),
    otherSeed = estimateAccelPolicyStyle({ episodes: positiveEpisodes(), splitSeed: 171 });
  assert.equal(digest(first), digest(second));
  assert.deepEqual(first, second);
  assert.equal(first.version, '170-accel-estimator-v1');
  assert.equal(ACCEL_ESTIMATOR_LIMITS.retainedHistory, 0);
  assert.notEqual(first.splitSeed, otherSeed.splitSeed);
});

test('170 estimates stay inside the 092 ranges and the 169 policy reads them unchanged', () => {
  const report = estimate(positiveEpisodes());
  for (const key of ACCEL_ESTIMATOR_KEYS) {
    const definition = getParameterDefinition(key),
      entry = report.keys[key];
    assert.equal(entry.unit, definition.unit);
    assert(entry.value! >= definition.min && entry.value! <= definition.max);
    assert.equal(entry.clamped, false);
    assert.equal(entry.rawValue, entry.value);
  }
  assert.equal(report.compatibility.policyVersion, '169-accel-policy-v1');
  assert.equal(report.compatibility.candidateOnly, true);
  assert.equal(report.compatibility.changesPolicySemantics, false);

  const values = Object.fromEntries(
      ACCEL_ESTIMATOR_KEYS.map((key) => [key, report.keys[key].value!]),
    ),
    profile = accelProfile(values),
    jerk = report.keys.braking_jerk.value!,
    delay = report.keys.throttle_release_delay.value!,
    intensity = report.keys.launch_intensity.value!,
    bias = report.keys.coasting_bias.value!;

  const ramp = simulate(profile, { ticks: 6, request: { accelerationMps2: -2, brake: 0.25 } });
  for (let tick = 1; tick <= 5; tick += 1)
    assert(
      Math.abs(
        ramp[tick - 1]!.committedAccelerationMps2 +
          Math.min(2, (tick * jerk) / ACCEL_POLICY_LIMITS.tickHz),
      ) < 1e-9,
    );

  assert.equal(
    simulate(profile, {
      ticks: 200,
      request: { accelerationMps2: 0 },
      previous: { accelerationMps2: 1.5, throttle: 0.4 },
    }).filter((row) => row.throttleHeld).length,
    Math.ceil(delay * ACCEL_POLICY_LIMITS.tickHz),
  );

  const launch = evaluate(profile, {
    request: { accelerationMps2: 1.5, throttle: 0.4 },
    observation: { longitudinalSpeedMps: 0.5 },
  });
  assert.equal(
    launch.launchFactor,
    ACCEL_POLICY_LIMITS.minimumLaunchFraction +
      (1 - ACCEL_POLICY_LIMITS.minimumLaunchFraction) * intensity,
  );

  const coast = evaluate(profile, {
    request: { accelerationMps2: 0.4, throttle: 0.12 },
    observation: { longitudinalSpeedMps: 8 },
  });
  assert.equal(coast.coastingFactor, 1 - bias);
  assert.equal(coast.committedAccelerationMps2, 0.4 * (1 - bias));
});
