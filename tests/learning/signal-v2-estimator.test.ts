import assert from 'node:assert/strict';
import test from 'node:test';
import { SIGNAL_POLICY_V2_KEYS, SIGNAL_POLICY_V2_LIMITS } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import {
  SIGNAL_V2_ESTIMATOR_KEYS,
  SIGNAL_V2_ESTIMATOR_LIMITS,
  estimateSignalPolicyStyleV2,
} from '../../src/learning/signal-v2-estimator';
import type {
  SignalV2EstimatorResult,
  SignalV2EvidenceEpisode,
} from '../../src/learning/signal-v2-estimator';
import {
  evaluate,
  opportunityKeyFor,
  signalV2Profile,
} from '../autonomy/signal-policy-v2-reference';
import {
  commitLowerBoundEpisodes,
  commitUpperBoundEpisodes,
  contradictoryCommitEpisodes,
  contradictoryGapEpisodes,
  crossingOpportunityTicks,
  greenLaunchEpisodes,
  greenLaunchHeldEpisodes,
  greenLaunchMovingEpisodes,
  lateBrakeEpisodes,
  manualEpisodes,
  noisyLaunchEpisodes,
  noisyYellowEpisodes,
  positiveEpisodes,
  recordEpisode,
  redRunBracketEpisodes,
  redRunLowerOnlyEpisodes,
  redRunNotProposedEpisodes,
  redRunSafetyCapEpisodes,
  redRunUnknownGapEpisodes,
  redRunUpperOnlyEpisodes,
  wideCommitEpisodes,
  wideGapEpisodes,
  yellowCommitEpisodes,
  yellowFeasibilityEpisodes,
  yellowTrialsBelowMinimumEpisodes,
  zeroYellowEpisodes,
} from './signal-v2-estimator-reference';

const seed = 174;

function estimate(episodes: Parameters<typeof estimateSignalPolicyStyleV2>[0]['episodes']) {
  return estimateSignalPolicyStyleV2({ episodes, splitSeed: seed });
}
function digest(result: SignalV2EstimatorResult): string {
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

test('174 each key needs its own scenario and never borrows another fact', () => {
  const yellow = estimate(yellowFeasibilityEpisodes());
  assert.equal(yellow.keys.yellow_stop_probability.status, 'CANDIDATE');
  assert(near(yellow.keys.yellow_stop_probability.value, 0.8, 0.15));
  assert.equal(yellow.keys.yellow_stop_probability.scenario, 'YELLOW_FEASIBILITY');
  assert.equal(yellow.keys.yellow_commit_time.reason, 'COMMIT_LOWER_BOUND_UNOBSERVED');
  assert.equal(yellow.keys.red_run_gap_acceptance.reason, 'NO_RED_RUN_EPISODE');
  assert.equal(yellow.keys.green_launch_acceleration.reason, 'NO_GREEN_LAUNCH_EPISODE');

  const commit = estimate(yellowCommitEpisodes());
  assert.equal(commit.keys.yellow_commit_time.status, 'CANDIDATE');
  assert(near(commit.keys.yellow_commit_time.value, 2, 0.2));
  assert.equal(commit.keys.yellow_commit_time.scenario, 'YELLOW_COMMITMENT');
  assert.equal(commit.keys.yellow_stop_probability.reason, 'YELLOW_OPPORTUNITY_NOT_SAMPLED');
  assert.equal(commit.keys.red_run_gap_acceptance.reason, 'NO_RED_RUN_EPISODE');

  const red = estimate(redRunBracketEpisodes());
  assert.equal(red.keys.red_run_gap_acceptance.status, 'CANDIDATE');
  assert(near(red.keys.red_run_gap_acceptance.value, 4.5, 1e-9));
  assert.equal(red.keys.red_run_gap_acceptance.scenario, 'RED_RUN_GAP');
  assert.equal(red.keys.yellow_stop_probability.reason, 'NO_YELLOW_FEASIBILITY_EPISODE');
  assert.equal(red.keys.yellow_commit_time.reason, 'NO_YELLOW_COMMITMENT_EPISODE');

  const launch = estimate(greenLaunchEpisodes());
  assert.equal(launch.keys.green_launch_acceleration.status, 'CANDIDATE');
  assert(near(launch.keys.green_launch_acceleration.value, 1.5, 1e-9));
  assert.equal(launch.keys.green_launch_acceleration.scenario, 'GREEN_LAUNCH');
  assert.equal(launch.keys.yellow_stop_probability.reason, 'NO_YELLOW_FEASIBILITY_EPISODE');
  assert.equal(launch.keys.red_run_gap_acceptance.reason, 'NO_RED_RUN_EPISODE');
});

test('174 a demonstrated zero stop rate is an observation, not missing evidence', () => {
  const zero = estimate(zeroYellowEpisodes()).keys.yellow_stop_probability;
  assert.equal(zero.status, 'CANDIDATE');
  assert.equal(zero.value, 0);
  assert.equal(zero.rawValue, 0);
  assert.equal(zero.reason, null);
  assert.equal(zero.validation.status, 'VALIDATED');

  const absent = estimate(redRunUnknownGapEpisodes()).keys.red_run_gap_acceptance;
  assert.equal(absent.status, 'UNOBSERVED');
  assert.equal(absent.value, null);
  assert.equal(absent.reason, 'RED_RUN_GAP_UNKNOWN');
});

test('174 uncertainty is measured per key and above its threshold the key stays unobserved', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of SIGNAL_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.status, 'CANDIDATE', key);
    assert(entry.uncertainty !== null && entry.uncertainty > 0, `${key} uncertainty`);
    assert(entry.uncertainty! <= entry.uncertaintyThreshold, `${key} threshold`);
  }

  const noisyYellow = estimate(noisyYellowEpisodes()).keys.yellow_stop_probability;
  assert.equal(noisyYellow.status, 'UNOBSERVED');
  assert.equal(noisyYellow.value, null);
  assert.equal(noisyYellow.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    noisyYellow.uncertainty! >
      SIGNAL_V2_ESTIMATOR_LIMITS.maximumUncertainty.yellow_stop_probability,
  );

  const noisyLaunch = estimate(noisyLaunchEpisodes()).keys.green_launch_acceleration;
  assert.equal(noisyLaunch.status, 'UNOBSERVED');
  assert.equal(noisyLaunch.value, null);
  assert.equal(noisyLaunch.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    noisyLaunch.uncertainty! >
      SIGNAL_V2_ESTIMATOR_LIMITS.maximumUncertainty.green_launch_acceleration,
  );

  const wideCommit = estimate(wideCommitEpisodes()).keys.yellow_commit_time;
  assert.equal(wideCommit.status, 'UNOBSERVED');
  assert.equal(wideCommit.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    wideCommit.uncertainty! > SIGNAL_V2_ESTIMATOR_LIMITS.maximumUncertainty.yellow_commit_time,
  );

  const wideGap = estimate(wideGapEpisodes()).keys.red_run_gap_acceptance;
  assert.equal(wideGap.status, 'UNOBSERVED');
  assert.equal(wideGap.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    wideGap.uncertainty! > SIGNAL_V2_ESTIMATOR_LIMITS.maximumUncertainty.red_run_gap_acceptance,
  );
});

test('174 the validation split is explicit, disjoint and evaluated on held-out episodes', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of SIGNAL_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.validation.status, 'VALIDATED', `${key} validation`);
    assert(entry.validation.episodes >= SIGNAL_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes);
    assert(entry.sourceEpisodes >= SIGNAL_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes);
  }
  assert.equal(positive.admittedEpisodes.length, positiveEpisodes().length);
  assert.equal(new Set(positive.admittedEpisodes).size, positive.admittedEpisodes.length);
  assert.equal(positive.refusedEpisodes.length, 0);

  const tooSmall = estimate(yellowFeasibilityEpisodes([0.8, 0.8, 0.8]));
  assert.equal(tooSmall.keys.yellow_stop_probability.status, 'CANDIDATE');
  assert.equal(tooSmall.keys.yellow_stop_probability.validation.status, 'TOO_SMALL');
  assert.equal(tooSmall.keys.yellow_stop_probability.validation.episodes, 1);

  const single = estimate(yellowFeasibilityEpisodes([0.8]));
  assert.equal(single.keys.yellow_stop_probability.status, 'UNOBSERVED');
});

test('174 the yellow probability needs sampled opportunities and a real compliance factor', () => {
  const belowMinimum = estimate(yellowTrialsBelowMinimumEpisodes()).keys.yellow_stop_probability;
  assert.equal(belowMinimum.status, 'UNOBSERVED');
  assert.equal(belowMinimum.reason, 'YELLOW_TRIALS_BELOW_MINIMUM');
  assert.equal(belowMinimum.excluded.YELLOW_TRIALS_BELOW_MINIMUM, 2);

  const noDraw = estimate(yellowCommitEpisodes()).keys.yellow_stop_probability;
  assert.equal(noDraw.status, 'UNOBSERVED');
  assert.equal(noDraw.reason, 'YELLOW_OPPORTUNITY_NOT_SAMPLED');

  const zeroFactorEpisodes = yellowFeasibilityEpisodes([0.8, 0.8]).map((episode) => ({
    ...episode,
    samples: episode.samples.map((sample) => ({ ...sample, redStopProbability: 0 })),
  })) as SignalV2EvidenceEpisode[];
  const zeroFactor = estimate(zeroFactorEpisodes).keys.yellow_stop_probability;
  assert.equal(zeroFactor.status, 'UNOBSERVED');
  assert.equal(zeroFactor.reason, 'YELLOW_COMPLIANCE_FACTOR_ZERO');

  const mixedFactorEpisodes = yellowFeasibilityEpisodes([0.8, 0.8]).map((episode) => ({
    ...episode,
    samples: episode.samples.map((sample, index) => ({
      ...sample,
      redStopProbability: index === 0 ? 0.5 : 1,
    })),
  })) as SignalV2EvidenceEpisode[];
  const mixedFactor = estimate(mixedFactorEpisodes).keys.yellow_stop_probability;
  assert.equal(mixedFactor.status, 'UNOBSERVED');
  assert.equal(mixedFactor.reason, 'YELLOW_COMPLIANCE_FACTOR_INCONSISTENT');
});

test('174 engagement and gap keep their own bound and never fabricate the missing one', () => {
  const lowerOnly = estimate(commitLowerBoundEpisodes()).keys.yellow_commit_time;
  assert.equal(lowerOnly.status, 'UNOBSERVED');
  assert.equal(lowerOnly.value, null);
  assert.equal(lowerOnly.reason, 'COMMIT_UPPER_BOUND_UNOBSERVED');

  const upperOnly = estimate(commitUpperBoundEpisodes()).keys.yellow_commit_time;
  assert.equal(upperOnly.status, 'UNOBSERVED');
  assert.equal(upperOnly.reason, 'COMMIT_LOWER_BOUND_UNOBSERVED');

  const contradictory = estimate(contradictoryCommitEpisodes()).keys.yellow_commit_time;
  assert.equal(contradictory.status, 'UNOBSERVED');
  assert.equal(contradictory.value, null);
  assert.equal(contradictory.reason, 'CONTRADICTORY_COMMIT_BOUNDS');
  assert.equal(contradictory.excluded.CONTRADICTORY_COMMIT_BOUNDS, 4);

  const lateBrake = estimate(lateBrakeEpisodes()).keys.yellow_commit_time;
  assert.equal(lateBrake.status, 'UNOBSERVED');
  assert.equal(lateBrake.reason, 'COMMIT_PREEMPTED_BY_LATE_BRAKE');

  const gapUpperOnly = estimate(redRunUpperOnlyEpisodes()).keys.red_run_gap_acceptance;
  assert.equal(gapUpperOnly.status, 'UNOBSERVED');
  assert.equal(gapUpperOnly.reason, 'RED_RUN_LOWER_BOUND_UNOBSERVED');

  const gapLowerOnly = estimate(redRunLowerOnlyEpisodes()).keys.red_run_gap_acceptance;
  assert.equal(gapLowerOnly.status, 'UNOBSERVED');
  assert.equal(gapLowerOnly.reason, 'RED_RUN_UPPER_BOUND_UNOBSERVED');

  const contradictoryGap = estimate(contradictoryGapEpisodes()).keys.red_run_gap_acceptance;
  assert.equal(contradictoryGap.status, 'UNOBSERVED');
  assert.equal(contradictoryGap.reason, 'CONTRADICTORY_GAP_BOUNDS');
});

test('174 the red safety cap and an unproposed crossing are not evidence', () => {
  const safetyCap = estimate(redRunSafetyCapEpisodes()).keys.red_run_gap_acceptance;
  assert.equal(safetyCap.status, 'UNOBSERVED');
  assert.equal(safetyCap.value, null);
  assert.equal(safetyCap.reason, 'RED_RUN_SAFETY_CAP');
  assert.equal(safetyCap.excluded.RED_RUN_SAFETY_CAP, 4);

  const notProposed = estimate(redRunNotProposedEpisodes()).keys.red_run_gap_acceptance;
  assert.equal(notProposed.status, 'UNOBSERVED');
  assert.equal(notProposed.value, null);
  assert.equal(notProposed.reason, 'RED_RUN_NOT_PROPOSED');
  assert.equal(notProposed.excluded.RED_RUN_NOT_PROPOSED, 4);
});

test('174 a green launch needs a standstill release after the M start delay', () => {
  const held = estimate(greenLaunchHeldEpisodes()).keys.green_launch_acceleration;
  assert.equal(held.status, 'UNOBSERVED');
  assert.equal(held.reason, 'GREEN_LAUNCH_HELD_BY_DELAY');
  assert.equal(held.excluded.GREEN_LAUNCH_HELD_BY_DELAY, 4);

  const moving = estimate(greenLaunchMovingEpisodes()).keys.green_launch_acceleration;
  assert.equal(moving.status, 'UNOBSERVED');
  assert.equal(moving.reason, 'GREEN_LAUNCH_NOT_FROM_STANDSTILL');
  assert.equal(moving.excluded.GREEN_LAUNCH_NOT_FROM_STANDSTILL, 4);

  const episode = greenLaunchEpisodes()[0]!;
  const outOfEnvelope = {
    ...episode,
    samples: episode.samples.map((sample) => ({ ...sample, launchAccelerationMps2: 0.1 })),
  } as SignalV2EvidenceEpisode;
  const envelope = estimate([outOfEnvelope]).keys.green_launch_acceleration;
  assert.equal(envelope.status, 'UNOBSERVED');
  assert.equal(envelope.reason, 'GREEN_LAUNCH_OUT_OF_ENVELOPE');
});

test('174 no key ever fabricates a value', () => {
  const scenarios = [
    positiveEpisodes(),
    noisyYellowEpisodes(),
    noisyLaunchEpisodes(),
    zeroYellowEpisodes(),
    commitLowerBoundEpisodes(),
    commitUpperBoundEpisodes(),
    wideCommitEpisodes(),
    contradictoryCommitEpisodes(),
    lateBrakeEpisodes(),
    redRunUpperOnlyEpisodes(),
    redRunLowerOnlyEpisodes(),
    redRunSafetyCapEpisodes(),
    contradictoryGapEpisodes(),
    wideGapEpisodes(),
    redRunUnknownGapEpisodes(),
    redRunNotProposedEpisodes(),
    greenLaunchHeldEpisodes(),
    greenLaunchMovingEpisodes(),
    yellowTrialsBelowMinimumEpisodes(),
    manualEpisodes(),
    [],
  ];
  let unobserved = 0;
  for (const episodes of scenarios) {
    const result = estimate(episodes);
    for (const key of SIGNAL_V2_ESTIMATOR_KEYS) {
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

test('174 group constraints name the shared channels of the four keys', () => {
  const { groupConstraints } = estimate(positiveEpisodes());
  assert.equal(groupConstraints.length, 5);
  assert.deepEqual(
    groupConstraints.map((entry) => entry.id),
    [
      'YELLOW_STOP_AND_RED_COMPLIANCE_SHARED',
      'YELLOW_PROBABILITY_AND_COMMIT_SHARE_APPROACH',
      'RED_RUN_GAP_DEPENDS_ON_OBSERVED_GAP',
      'GREEN_LAUNCH_AFTER_START_DELAY',
      'SIGNAL_KEYS_FROM_ONE_APPROACH',
    ],
  );
  for (const entry of groupConstraints) {
    assert(entry.explanation.length > 40);
    assert(entry.keys.every((key) => SIGNAL_V2_ESTIMATOR_KEYS.includes(key)));
  }
  assert.deepEqual([...groupConstraints[4]!.keys], [...SIGNAL_POLICY_V2_KEYS]);
});

test('174 invalid samples and ineligible episodes are refused, never measured', () => {
  const episode = yellowFeasibilityEpisodes()[0]!;
  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [{ ...episode.samples[0]!, speedMps: Number.NaN }, ...episode.samples.slice(1)],
        },
      ]),
    /signal evidence/i,
  );

  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [
            { ...episode.samples[0]!, launchAccelerationMps2: 7 },
            ...episode.samples.slice(1),
          ],
        },
      ]),
    /signal evidence/i,
  );

  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [
            { ...episode.samples[0]!, reason: 'NOT_A_173_REASON' as never },
            ...episode.samples.slice(1),
          ],
        },
      ]),
    /signal evidence/i,
  );

  const duplicate = estimate([episode, episode]);
  assert.deepEqual(duplicate.refusedEpisodes, [
    { episodeId: episode.episodeId, reason: 'DUPLICATE_EPISODE' },
  ]);

  const manual = estimate(manualEpisodes());
  assert.equal(manual.refusedEpisodes.length, 4);
  assert(manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE'));
  assert.equal(manual.keys.yellow_stop_probability.reason, 'NO_ELIGIBLE_EPISODES');

  const unusable = {
    ...episode,
    artifacts: { ...episode.artifacts, windowClass: 'FULLY_SUPPRESSED', prefix: null },
  } as SignalV2EvidenceEpisode;
  assert.deepEqual(estimate([unusable]).refusedEpisodes, [
    { episodeId: episode.episodeId, reason: 'NO_USABLE_PREFIX' },
  ]);

  assert.throws(() => estimateSignalPolicyStyleV2({ episodes: [], splitSeed: -1 }), /split seed/i);
  assert.throws(
    () => estimateSignalPolicyStyleV2({ episodes: [], splitSeed: 4_294_967_296 }),
    /split seed/i,
  );

  const truncated = {
    ...episode,
    artifacts: { ...episode.artifacts, prefix: { fromTick: 0, toTick: 0, ticks: 1 } },
  } as SignalV2EvidenceEpisode;
  assert.equal(
    estimate([truncated]).keys.yellow_stop_probability.reason,
    'NO_YELLOW_FEASIBILITY_EPISODE',
  );

  const unordered = recordEpisode(
    'unordered',
    episode.samples.slice(0, 2).map((_, index) => ({
      scene: {
        state: 'YELLOW',
        speed: 12,
        distanceToStopLineM: 37,
        phaseRemainingS: 20,
        conflictGapS: null,
      },
      opportunityPhaseTick: index,
    })),
    { yellow_stop_probability: 0.8 },
  );
  assert.throws(
    () => estimate([{ ...unordered, samples: [...unordered.samples].reverse() }]),
    /strictly ordered/i,
  );
});

test('174 the estimate is deterministic and frozen', () => {
  const first = estimate(positiveEpisodes()),
    second = estimate(positiveEpisodes());
  assert.equal(digest(first), digest(second));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.keys), true);
  assert.equal(Object.isFrozen(first.keys.yellow_stop_probability), true);
  assert.equal(Object.isFrozen(first.groupConstraints), true);
  assert.equal(first.version, '174-signal-estimator-v2');
  assert.equal(first.splitSeed, seed);
  assert.equal(first.compatibility.candidateOnly, true);
  assert.equal(first.compatibility.changesPolicySemantics, false);
});

test('174 candidates stay inside the 092 catalog and keep the registry unit', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of SIGNAL_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key],
      definition = getParameterDefinition(key);
    assert.equal(entry.unit, definition.unit);
    assert.equal(entry.clamped, false);
    assert(entry.value! >= definition.min && entry.value! <= definition.max);
  }
  const ranges = positive.compatibility.catalogRanges;
  assert.deepEqual(SIGNAL_V2_ESTIMATOR_KEYS, SIGNAL_POLICY_V2_KEYS);
  assert.equal(ranges.yellow_stop_probability.min, 0);
  assert.equal(ranges.yellow_stop_probability.max, 1);
  assert.equal(ranges.red_run_gap_acceptance.min, 0.1);
  assert.equal(ranges.red_run_gap_acceptance.max, 8);
  assert.equal(ranges.yellow_commit_time.min, 0.2);
  assert.equal(ranges.yellow_commit_time.max, 6);
  assert.equal(ranges.green_launch_acceleration.min, 0.2);
  assert.equal(ranges.green_launch_acceleration.max, 6);
  assert.equal(positive.compatibility.policyVersion, SIGNAL_POLICY_V2_LIMITS.version);
  assert.equal(positive.compatibility.redRunSafetyCapS, SIGNAL_POLICY_V2_LIMITS.redRunMinimumGapS);
  assert.deepEqual(
    [...positive.compatibility.mReadByPolicy],
    [
      'red_stop_probability',
      'green_start_delay',
      'red_stop_line_offset',
      'late_red_brake_threshold',
    ],
  );
});

test('174 the estimates are consumed by 173 without changing its semantics', () => {
  const positive = estimate(positiveEpisodes()),
    values = Object.fromEntries(
      SIGNAL_V2_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ),
    profile = signalV2Profile(values);
  for (const key of SIGNAL_V2_ESTIMATOR_KEYS) assert.equal(profile.values[key], values[key]);

  const yellow = evaluate(
    {
      state: 'YELLOW',
      speed: 12,
      distanceToStopLineM: 37,
      phaseRemainingS: 20,
      conflictGapS: null,
    },
    { rValues: values },
  );
  assert.equal(yellow.command.reason, 'YELLOW_STOP');
  assert(yellow.command.sampledUnit !== null);
  assert(yellow.command.sampledUnit! < values.yellow_stop_probability!);

  const commitment = evaluate(
    {
      state: 'YELLOW',
      speed: 10,
      distanceToStopLineM: 21,
      phaseRemainingS: 20,
      conflictGapS: null,
    },
    { rValues: values },
  );
  assert.equal(commitment.command.reason, 'YELLOW_COMMIT');
  assert(near(commitment.command.timeToLineS, 2, 1e-9));
  assert(commitment.command.timeToLineS! <= values.yellow_commit_time!);

  const accepted = evaluate(
    { state: 'RED', speed: 10, distanceToStopLineM: 11, phaseRemainingS: 20, conflictGapS: 4.5 },
    {
      rValues: values,
      mValues: { red_stop_probability: 0.5 },
      opportunityKey: opportunityKeyFor(crossingOpportunityTicks(1)[0]!),
    },
  );
  assert.equal(accepted.command.requiredRedGapS, 4.5);
  assert.equal(accepted.command.redRunAccepted, true);

  const rejected = evaluate(
    { state: 'RED', speed: 10, distanceToStopLineM: 11, phaseRemainingS: 20, conflictGapS: 4.4 },
    {
      rValues: values,
      mValues: { red_stop_probability: 0.5 },
      opportunityKey: opportunityKeyFor(crossingOpportunityTicks(1)[0]!),
    },
  );
  assert.equal(rejected.command.redRunAccepted, false);

  const launch = evaluate(
    {
      state: 'GREEN',
      speed: 0,
      distanceToStopLineM: null,
      phaseRemainingS: 10,
      conflictGapS: null,
    },
    { rValues: values },
  );
  assert.equal(launch.command.reason, 'GREEN_LAUNCH');
  assert.equal(launch.command.launchAccelerationMps2, 1.5);
});
