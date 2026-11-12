import assert from 'node:assert/strict';
import test from 'node:test';
import { FOLLOW_POLICY_LIMITS } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import {
  FOLLOW_ESTIMATOR_KEYS,
  FOLLOW_ESTIMATOR_LIMITS,
  estimateFollowPolicyStyle,
} from '../../src/learning/follow-estimator';
import type {
  FollowEstimatorResult,
  FollowEvidenceEpisode,
} from '../../src/learning/follow-estimator';
import { evaluate, followProfile, run, state } from '../autonomy/follow-policy-reference';
import {
  bandUpperUnobservedEpisodes,
  censoredHoldEpisodes,
  closingEpisodes,
  closingWithoutCapEpisodes,
  contradictoryBandEpisodes,
  cutInEpisodes,
  cutInWithoutReductionEpisodes,
  hysteresisEpisodes,
  interruptedHoldEpisodes,
  leaderChangeEpisodes,
  manualEpisodes,
  noisyCutInEpisodes,
  noisyDelayEpisodes,
  oneSidedBandEpisodes,
  positiveEpisodes,
  recordEpisode,
} from './follow-estimator-reference';

const seed = 172;

function estimate(episodes: Parameters<typeof estimateFollowPolicyStyle>[0]['episodes']) {
  return estimateFollowPolicyStyle({ episodes, splitSeed: seed });
}
function digest(result: FollowEstimatorResult): string {
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

test('172 each key needs its own episode and never borrows another fact', () => {
  const cutIn = estimate(cutInEpisodes());
  assert.equal(cutIn.keys.cutin_brake_response.status, 'CANDIDATE');
  assert(near(cutIn.keys.cutin_brake_response.value, 0.7, 1e-9));
  assert.equal(cutIn.keys.cutin_brake_response.episode, 'CUT_IN');
  assert.equal(cutIn.keys.closing_ttc_threshold.reason, 'NO_CLOSING_EPISODE');
  assert.equal(cutIn.keys.leader_change_delay.reason, 'NO_LEADER_CHANGE');
  assert.equal(cutIn.keys.following_hysteresis.reason, 'NO_HYSTERESIS_EPISODE');

  const closing = estimate(closingEpisodes());
  assert.equal(closing.keys.closing_ttc_threshold.status, 'CANDIDATE');
  assert(near(closing.keys.closing_ttc_threshold.value, 3, 1e-6));
  assert.equal(closing.keys.cutin_brake_response.reason, 'NO_CUT_IN_EPISODE');
  assert.equal(closing.keys.leader_change_delay.reason, 'NO_LEADER_CHANGE');

  const change = estimate(leaderChangeEpisodes());
  assert.equal(change.keys.leader_change_delay.status, 'CANDIDATE');
  assert(near(change.keys.leader_change_delay.value, 0.2, 1 / FOLLOW_ESTIMATOR_LIMITS.tickHz));
  assert.equal(change.keys.cutin_brake_response.reason, 'NO_CUT_IN_EPISODE');
  assert.equal(change.keys.closing_ttc_threshold.reason, 'NO_CLOSING_EPISODE');

  const band = estimate(hysteresisEpisodes());
  assert.equal(band.keys.following_hysteresis.status, 'CANDIDATE');
  assert(near(band.keys.following_hysteresis.value, 1, 1e-9));
  assert.equal(band.keys.cutin_brake_response.reason, 'NO_CUT_IN_EPISODE');
  assert.equal(band.keys.leader_change_delay.reason, 'NO_LEADER_CHANGE');
});

test('172 a demonstrated zero delay is an observation, not missing evidence', () => {
  const zero = estimate(leaderChangeEpisodes([0, 0, 0, 0]));
  const key = zero.keys.leader_change_delay;
  assert.equal(key.status, 'CANDIDATE');
  assert.equal(key.value, 0);
  assert.equal(key.rawValue, 0);
  assert.equal(key.reason, null);
  assert.equal(key.validation.status, 'VALIDATED');

  const absent = estimate(cutInEpisodes());
  assert.equal(absent.keys.leader_change_delay.status, 'UNOBSERVED');
  assert.equal(absent.keys.leader_change_delay.value, null);
});

test('172 uncertainty is measured per key and above its threshold the key stays unobserved', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of FOLLOW_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.status, 'CANDIDATE', key);
    assert(entry.uncertainty !== null && entry.uncertainty > 0, `${key} uncertainty`);
    assert(entry.uncertainty! <= entry.uncertaintyThreshold, `${key} threshold`);
  }

  const noisyCutIn = estimate(noisyCutInEpisodes()).keys.cutin_brake_response;
  assert.equal(noisyCutIn.status, 'UNOBSERVED');
  assert.equal(noisyCutIn.value, null);
  assert.equal(noisyCutIn.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(noisyCutIn.uncertainty! > FOLLOW_ESTIMATOR_LIMITS.maximumUncertainty.cutin_brake_response);

  const noisyDelay = estimate(noisyDelayEpisodes()).keys.leader_change_delay;
  assert.equal(noisyDelay.status, 'UNOBSERVED');
  assert.equal(noisyDelay.value, null);
  assert.equal(noisyDelay.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(noisyDelay.uncertainty! > FOLLOW_ESTIMATOR_LIMITS.maximumUncertainty.leader_change_delay);
});

test('172 the validation split is explicit, disjoint and evaluated on held-out episodes', () => {
  const positive = estimate(positiveEpisodes());
  const families = {
    cutin_brake_response: 4,
    closing_ttc_threshold: 4,
    leader_change_delay: 4,
    following_hysteresis: 4,
  } as const;
  for (const key of FOLLOW_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.validation.status, 'VALIDATED', `${key} validation`);
    assert(entry.validation.episodes >= FOLLOW_ESTIMATOR_LIMITS.minimumValidationEpisodes);
    assert(entry.sourceEpisodes >= FOLLOW_ESTIMATOR_LIMITS.minimumEstimateEpisodes);
    assert.equal(entry.sourceEpisodes + entry.validation.episodes, families[key]);
  }
  assert.equal(positive.admittedEpisodes.length, positiveEpisodes().length);
  assert.equal(new Set(positive.admittedEpisodes).size, positive.admittedEpisodes.length);
  assert.equal(positive.refusedEpisodes.length, 0);

  const tooSmall = estimate(cutInEpisodes([0.7, 0.7, 0.7]));
  assert.equal(tooSmall.keys.cutin_brake_response.status, 'CANDIDATE');
  assert.equal(tooSmall.keys.cutin_brake_response.validation.status, 'TOO_SMALL');
  assert.equal(tooSmall.keys.cutin_brake_response.validation.episodes, 1);

  const single = estimate(cutInEpisodes([0.7]));
  assert.equal(single.keys.cutin_brake_response.status, 'UNOBSERVED');
  assert.equal(single.keys.cutin_brake_response.reason, 'INSUFFICIENT_DISTINCT_EPISODES');
});

test('172 a cut-in without an offered reduction and a non-binding cap are not values', () => {
  const noReduction = estimate(cutInWithoutReductionEpisodes()).keys.cutin_brake_response;
  assert.equal(noReduction.status, 'UNOBSERVED');
  assert.equal(noReduction.value, null);
  assert.equal(noReduction.reason, 'CUT_IN_WITHOUT_REDUCTION');
  assert.equal(noReduction.excluded.CUT_IN_WITHOUT_REDUCTION, 4);

  const notBound = estimate(closingWithoutCapEpisodes()).keys.closing_ttc_threshold;
  assert.equal(notBound.status, 'UNOBSERVED');
  assert.equal(notBound.value, null);
  assert.equal(notBound.reason, 'TTC_CAP_NOT_BOUND');
  assert.equal(notBound.excluded.TTC_CAP_NOT_BOUND, 4);
});

test('172 a censored or interrupted hold keeps the delay unobserved', () => {
  const censored = estimate(censoredHoldEpisodes()).keys.leader_change_delay;
  assert.equal(censored.status, 'UNOBSERVED');
  assert.equal(censored.value, null);
  assert.equal(censored.reason, 'LEADER_HOLD_CENSORED');

  const interrupted = estimate(interruptedHoldEpisodes()).keys.leader_change_delay;
  assert.equal(interrupted.status, 'UNOBSERVED');
  assert.equal(interrupted.value, null);
  assert.equal(interrupted.reason, 'LEADER_HOLD_INTERRUPTED_BY_REDUCTION');
  assert.equal(interrupted.excluded.LEADER_HOLD_INTERRUPTED_BY_REDUCTION, 4);
});

test('172 the hysteresis band needs both bounds and a real oscillation', () => {
  const upperOnly = estimate(bandUpperUnobservedEpisodes()).keys.following_hysteresis;
  assert.equal(upperOnly.status, 'UNOBSERVED');
  assert.equal(upperOnly.value, null);
  assert.equal(upperOnly.reason, 'HYSTERESIS_UPPER_BOUND_UNOBSERVED');

  const oneSided = estimate(oneSidedBandEpisodes()).keys.following_hysteresis;
  assert.equal(oneSided.status, 'UNOBSERVED');
  assert.equal(oneSided.reason, 'NO_BAND_OSCILLATION');

  const contradictory = estimate(contradictoryBandEpisodes()).keys.following_hysteresis;
  assert.equal(contradictory.status, 'UNOBSERVED');
  assert.equal(contradictory.value, null);
  assert.equal(contradictory.reason, 'CONTRADICTORY_BAND_BOUNDS');
});

test('172 no key ever fabricates a value', () => {
  const scenarios = [
    positiveEpisodes(),
    cutInWithoutReductionEpisodes(),
    closingWithoutCapEpisodes(),
    censoredHoldEpisodes(),
    interruptedHoldEpisodes(),
    bandUpperUnobservedEpisodes(),
    oneSidedBandEpisodes(),
    contradictoryBandEpisodes(),
    noisyCutInEpisodes(),
    noisyDelayEpisodes(),
    manualEpisodes(),
    [],
  ];
  let unobserved = 0;
  for (const episodes of scenarios) {
    const result = estimate(episodes);
    for (const key of FOLLOW_ESTIMATOR_KEYS) {
      const entry = result.keys[key];
      if (entry.status === 'CANDIDATE') {
        assert.notEqual(entry.value, null, `${key} candidate value`);
        assert.equal(entry.reason, null);
        assert(entry.uncertainty! <= entry.uncertaintyThreshold);
      } else {
        unobserved += 1;
        assert.equal(entry.value, null, `${key} unobserved value`);
        assert.equal(entry.rawValue, null);
        assert.notEqual(entry.reason, null, `${key} unobserved reason`);
      }
    }
  }
  assert(unobserved > 0);
});

test('172 group constraints name the shared channels of the four keys', () => {
  const { groupConstraints } = estimate(positiveEpisodes());
  assert.equal(groupConstraints.length, 4);
  assert.deepEqual(
    groupConstraints.map((entry) => entry.id),
    [
      'CUT_IN_AND_TTC_SHARE_BRAKE',
      'HYSTERESIS_DEPENDS_ON_GAP_BAND',
      'LEADER_CHANGE_REQUIRES_NO_CUT_IN',
      'FOLLOW_KEYS_FROM_ONE_TRAJECTORY',
    ],
  );
  for (const entry of groupConstraints) {
    assert(entry.explanation.length > 40);
    assert(entry.keys.every((key) => FOLLOW_ESTIMATOR_KEYS.includes(key)));
  }
  assert.deepEqual([...groupConstraints[3]!.keys], [...FOLLOW_ESTIMATOR_KEYS]);
});

test('172 invalid samples and ineligible episodes are refused, never measured', () => {
  const episode = cutInEpisodes()[0]!;
  const broken = {
    ...episode,
    samples: [{ ...episode.samples[0]!, egoSpeedMps: Number.NaN }, ...episode.samples.slice(1)],
  };
  assert.throws(() => estimate([broken]), /follow evidence/i);

  const inconsistent = {
    ...episode,
    samples: [{ ...episode.samples[0]!, leadSpeedMps: null }, ...episode.samples.slice(1)],
  };
  assert.throws(() => estimate([inconsistent]), /follow evidence/i);

  const duplicate = estimate([episode, episode]);
  assert.deepEqual(duplicate.refusedEpisodes, [
    { episodeId: episode.episodeId, reason: 'DUPLICATE_EPISODE' },
  ]);

  const manual = estimate(manualEpisodes());
  assert.equal(manual.refusedEpisodes.length, 4);
  assert(manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE'));
  assert.equal(manual.keys.cutin_brake_response.status, 'UNOBSERVED');
  assert.equal(manual.keys.cutin_brake_response.reason, 'NO_ELIGIBLE_EPISODES');

  assert.throws(() => estimateFollowPolicyStyle({ episodes: [], splitSeed: -1 }), /split seed/i);

  const outOfPrefix = recordEpisode(
    'outside-prefix',
    [
      { ego: 15, gap: 40, lead: 15, leader: 'a' },
      { ego: 15, gap: 18, lead: 12, leader: 'b', cutIn: true },
    ],
    { cutin_brake_response: 0.7 },
  );
  const truncated = {
    ...outOfPrefix,
    artifacts: { ...outOfPrefix.artifacts, prefix: { fromTick: 0, toTick: 0, ticks: 1 } },
  } as FollowEvidenceEpisode;
  assert.equal(estimate([truncated]).keys.cutin_brake_response.reason, 'NO_CUT_IN_EPISODE');
});

test('172 the estimate is deterministic and frozen', () => {
  const first = estimate(positiveEpisodes()),
    second = estimate(positiveEpisodes());
  assert.equal(digest(first), digest(second));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.keys), true);
  assert.equal(Object.isFrozen(first.keys.cutin_brake_response), true);
  assert.equal(first.version, '172-follow-estimator-v1');
  assert.equal(first.splitSeed, seed);
});

test('172 candidates stay inside the 092 catalog and keep the registry unit', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of FOLLOW_ESTIMATOR_KEYS) {
    const entry = positive.keys[key],
      definition = getParameterDefinition(key);
    assert.equal(entry.unit, definition.unit);
    assert.equal(entry.clamped, false);
    assert(entry.value! >= definition.min && entry.value! <= definition.max);
  }
  const ranges = positive.compatibility.catalogRanges;
  assert.equal(ranges.cutin_brake_response.min, 0);
  assert.equal(ranges.cutin_brake_response.max, 1);
  assert.equal(ranges.closing_ttc_threshold.min, 0.3);
  assert.equal(ranges.closing_ttc_threshold.max, 8);
  assert.equal(ranges.leader_change_delay.max, 2);
  assert.equal(ranges.following_hysteresis.max, 5);
  assert.equal(positive.compatibility.policyVersion, FOLLOW_POLICY_LIMITS.version);
  assert.equal(positive.compatibility.candidateOnly, true);
  assert.equal(positive.compatibility.changesPolicySemantics, false);
});

test('172 the estimates are consumed by 171 without changing its semantics', () => {
  const positive = estimate(positiveEpisodes()),
    values = Object.fromEntries(
      FOLLOW_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ),
    profile = followProfile(values);
  assert.equal(profile.values.cutin_brake_response, values.cutin_brake_response);
  assert.equal(profile.values.closing_ttc_threshold, values.closing_ttc_threshold);
  assert.equal(profile.values.leader_change_delay, values.leader_change_delay);
  assert.equal(profile.values.following_hysteresis, values.following_hysteresis);

  const settled = evaluate(profile, { egoSpeed: 15, leadGap: 40, leadSpeed: 15, leaderId: 'a' });
  const cutIn = evaluate(
    profile,
    { egoSpeed: 15, leadGap: 18, leadSpeed: 12, leaderId: 'b', cutIn: true },
    { state: settled.state, offset: 1 },
  );
  assert.equal(cutIn.bindingConstraint, 'CUT_IN_BLEND');
  assert(near(cutIn.committedTargetMps, 7.95, 1e-9));
  const expectedCutIn = 16 - values.cutin_brake_response * (16 - cutIn.requestedTargetMps);
  assert(near(cutIn.committedTargetMps, expectedCutIn, 1e-9));

  const closing = evaluate(
    profile,
    { egoSpeed: 18, leadGap: 60, leadSpeed: 4, leaderId: 'a', cruiseTargetMps: 30 },
    { offset: 2 },
  );
  assert.equal(closing.bindingConstraint, 'TTC_CAP');
  const expectedCap =
    4 + (60 - FOLLOW_POLICY_LIMITS.minimumLeadGapM) / values.closing_ttc_threshold!;
  assert(near(closing.ttcCapMps, expectedCap, 1e-9));
  assert(near(closing.committedTargetMps, expectedCap, 1e-9));

  const hold = run(
    profile,
    [
      { egoSpeed: 12, leadGap: 20, leadSpeed: 12, leaderId: 'a', leaderIncarnation: 1 },
      ...Array.from({ length: 14 }, () => ({
        egoSpeed: 12,
        leadGap: 60,
        leadSpeed: 20,
        leaderId: 'b',
        leaderIncarnation: 1,
      })),
    ],
    { initial: state() },
  );
  const heldTicks = hold.filter((entry) => entry.bindingConstraint === 'LEADER_DELAY').length;
  assert.equal(heldTicks, Math.ceil(values.leader_change_delay! * FOLLOW_POLICY_LIMITS.tickHz));
  assert.equal(heldTicks, 12);

  const held = evaluate(
    profile,
    { egoSpeed: 12, leadGap: 25.4, leadSpeed: 12, leaderId: 'a' },
    { state: { ...state(), leaderId: 'a', leaderIncarnation: 10, committedTargetMps: 12.8 } },
  );
  assert.equal(held.hysteresisHeld, true);
  assert.equal(held.bindingConstraint, 'HYSTERESIS');

  const escaped = evaluate(
    profile,
    { egoSpeed: 12, leadGap: 25.8, leadSpeed: 12, leaderId: 'a' },
    { state: { ...state(), leaderId: 'a', leaderIncarnation: 10, committedTargetMps: 12.8 } },
  );
  assert.equal(escaped.hysteresisHeld, false);
  assert.equal(escaped.bindingConstraint, 'FOLLOWING_TARGET');
});
