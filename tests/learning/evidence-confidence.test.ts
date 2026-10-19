import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessEstimatorConfidence,
  assessEvidenceConfidence,
  confidenceThreshold,
  parameterConfidenceThresholds,
  summarizeEvidenceQuality,
} from '../../src/learning/evidence-confidence';
import type {
  ConfidenceCandidate,
  ConfidenceEpisode,
} from '../../src/learning/evidence-confidence';
import { parameterEvidenceSpecs } from '../../src/learning/parameter-evidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import { estimateLaneChangeParameters } from '../../src/learning/lane-estimator';
import type { LaneEstimatorObservation } from '../../src/learning/lane-estimator';
import type { ParameterKey } from '../../src/profiles';

function read(
  key: ParameterKey,
  distinctEpisodes: number,
  sampleCount: number,
  status: ParameterEvidenceReadModel['status'] = 'READY',
): ParameterEvidenceReadModel {
  return {
    key,
    status,
    distinctEpisodes,
    contextBreakdown: [],
    sampleCount,
    quality: status === 'READY' ? 1 : 0,
    uncertainty: status === 'READY' ? 'MODERATE' : 'HIGH',
    unchanged: true,
    noEstimate:
      status === 'NO_EVIDENCE'
        ? 'NO_QUALIFYING_EVIDENCE'
        : status === 'INSUFFICIENT'
          ? 'INSUFFICIENT_DISTINCT_EPISODES_OR_VARIATION'
          : 'ESTIMATOR_NOT_IMPLEMENTED',
  } as ParameterEvidenceReadModel;
}

function episode(
  id: string,
  options: {
    readonly occurrence?: number;
    readonly ticks?: number;
    readonly value?: number;
    readonly outcome?: ConfidenceEpisode['outcome'];
    readonly speed?: number;
    readonly correlatedWith?: string;
  } = {},
): ConfidenceEpisode {
  return {
    opportunityId: id,
    occurrence: options.occurrence ?? 1,
    observedTicks: options.ticks ?? 60,
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.outcome === undefined ? {} : { outcome: options.outcome }),
    ...(options.speed === undefined ? {} : { speedMps: options.speed }),
    ...(options.correlatedWith === undefined ? {} : { correlatedWith: options.correlatedWith }),
  };
}

function candidate(
  key: ParameterKey,
  value: number | null,
  status = 'CANDIDATE',
  interval: readonly [number, number] | null = null,
): ConfidenceCandidate {
  return { key, status, value, ...(interval ? { interval } : {}) };
}

test('100 effective count uses deduplicated exposures, not 20 Hz samples or frames', () => {
  const repeatedFrames = Array.from({ length: 20 }, () =>
    episode('stop-1', { ticks: 60, value: 2.5 }),
  );
  const inflated = assessEvidenceConfidence({
    key: 'curve_lateral_accel',
    evidence: read('curve_lateral_accel', 1, 1200),
    episodes: repeatedFrames,
    candidate: candidate('curve_lateral_accel', 2.5),
  });
  assert.equal(inflated.frameObservationCount, 20);
  assert.equal(inflated.sampleCount, 1200);
  assert.equal(inflated.distinctEpisodeCount, 1);
  assert.equal(inflated.effectiveEpisodeCount, 1);
  assert.equal(inflated.state, 'WEAK');
  assert.equal(inflated.reason, 'INSUFFICIENT_EFFECTIVE_EPISODES');

  const genuine = assessEvidenceConfidence({
    key: 'curve_lateral_accel',
    evidence: read('curve_lateral_accel', 3, 3),
    episodes: [
      episode('a', { value: 2.4 }),
      episode('b', { value: 2.6 }),
      episode('c', { value: 2.5 }),
    ],
    candidate: candidate('curve_lateral_accel', 2.5),
  });
  assert.equal(genuine.effectiveEpisodeCount, 3);
  assert.equal(genuine.state, 'OBSERVED');
  assert.ok(genuine.effectiveEpisodeCount < inflated.sampleCount);
  assert.ok(genuine.effectiveEpisodeCount < inflated.frameObservationCount);
});

test('100 correlated episodes collapse to one encounter instead of inflating confidence', () => {
  const assessment = assessEvidenceConfidence({
    key: 'following_time_headway',
    evidence: read('following_time_headway', 3, 3),
    episodes: [
      episode('a', { ticks: 120, value: 1.6, speed: 9, correlatedWith: 'leader-7' }),
      episode('b', { ticks: 120, value: 1.8, speed: 13, correlatedWith: 'leader-7' }),
      episode('c', { ticks: 120, value: 2, speed: 17, correlatedWith: 'leader-7' }),
    ],
    candidate: candidate('following_time_headway', 1.8),
  });
  assert.equal(assessment.distinctEpisodeCount, 3);
  assert.equal(assessment.collapsedCorrelatedEpisodes, 2);
  assert.equal(assessment.effectiveEpisodeCount, 1);
  assert.equal(assessment.state, 'WEAK');
  assert.equal(assessment.reason, 'CORRELATED_EPISODES_REDUCED_EFFECTIVE_COUNT');
});

test('100 short intervals are not sufficient even with many samples', () => {
  const threshold = confidenceThreshold('speed_delta_urban');
  assert.equal(threshold.minimumEpisodeTicks, 600);
  assert.equal(threshold.minimumEffectiveEpisodes, 1);

  const short = assessEvidenceConfidence({
    key: 'speed_delta_urban',
    evidence: read('speed_delta_urban', 1, 300),
    episodes: [episode('a', { ticks: 300, value: 4 })],
    candidate: candidate('speed_delta_urban', 4),
  });
  assert.equal(short.effectiveEpisodeCount, 0.5);
  assert.equal(short.exposureSeconds, 5);
  assert.equal(short.shortEpisodeCount, 1);
  assert.equal(short.state, 'WEAK');
  assert.equal(short.reason, 'SHORT_INTERVAL_BELOW_MINIMUM_EXPOSURE');

  const full = assessEvidenceConfidence({
    key: 'speed_delta_urban',
    evidence: read('speed_delta_urban', 1, 600),
    episodes: [episode('a', { ticks: 600, value: 4 })],
    candidate: candidate('speed_delta_urban', 4),
  });
  assert.equal(full.effectiveEpisodeCount, 1);
  assert.equal(full.state, 'OBSERVED');
});

test('100 observed zero is distinct from unobserved and from weak evidence', () => {
  const zero = assessEvidenceConfidence({
    key: 'stop_full_probability',
    evidence: read('stop_full_probability', 4, 4),
    episodes: [
      episode('a', { value: 0 }),
      episode('b', { value: 0 }),
      episode('c', { value: 0 }),
      episode('d', { value: 0 }),
    ],
    candidate: candidate('stop_full_probability', 0),
  });
  assert.equal(zero.state, 'ZERO');
  assert.equal(zero.zeroObserved, true);
  assert.equal(zero.value, 0);
  assert.equal(zero.reason, null);

  const unobserved = assessEvidenceConfidence({
    key: 'stop_full_probability',
    evidence: read('stop_full_probability', 0, 0, 'NO_EVIDENCE'),
    episodes: [],
    candidate: candidate('stop_full_probability', null, 'UNOBSERVED'),
  });
  assert.equal(unobserved.state, 'UNOBSERVED');
  assert.equal(unobserved.zeroObserved, false);
  assert.equal(unobserved.value, null);
  assert.notDeepEqual(zero.state, unobserved.state);

  const weak = assessEvidenceConfidence({
    key: 'stop_full_probability',
    evidence: read('stop_full_probability', 1, 1),
    episodes: [episode('a', { value: 0 })],
    candidate: candidate('stop_full_probability', 0),
  });
  assert.equal(weak.state, 'WEAK');
  assert.equal(weak.value, null);
  assert.notDeepEqual(weak.state, unobserved.state);
});

test('100 contradictory fast and slow episodes stay weak with an explicit interval', () => {
  const assessment = assessEvidenceConfidence({
    key: 'following_time_headway',
    evidence: read('following_time_headway', 6, 6),
    episodes: [
      episode('a', { value: 0.8, speed: 8 }),
      episode('b', { value: 0.9, speed: 9 }),
      episode('c', { value: 1, speed: 10 }),
      episode('d', { value: 4.9, speed: 18 }),
      episode('e', { value: 5, speed: 19 }),
      episode('f', { value: 4.7, speed: 20 }),
    ],
    candidate: candidate('following_time_headway', 2.9),
  });
  assert.equal(assessment.contradiction.severity, 'SEVERE');
  assert.equal(assessment.contradiction.detected, true);
  assert.deepEqual(assessment.interval, [0.8, 5]);
  assert.equal(assessment.state, 'WEAK');
  assert.equal(assessment.evidenceState, 'WEAK');
  assert.equal(assessment.value, null);
  assert.equal(assessment.reason, 'CONTRADICTORY_EPISODE_VALUES');
  assert.notEqual(assessment.value, 2.9);
});

test('100 moderate dispersion is reported as an interval instead of being averaged away', () => {
  const assessment = assessEvidenceConfidence({
    key: 'following_time_headway',
    evidence: read('following_time_headway', 3, 3),
    episodes: [
      episode('a', { value: 1.5, speed: 9 }),
      episode('b', { value: 2, speed: 12 }),
      episode('c', { value: 2.5, speed: 15 }),
    ],
    candidate: candidate('following_time_headway', 2),
  });
  assert.equal(assessment.contradiction.severity, 'MODERATE');
  assert.deepEqual(assessment.interval, [1.5, 2.5]);
  assert.equal(assessment.state, 'OBSERVED');
  assert.equal(assessment.uncertainty, 'HIGH');
  assert.equal(assessment.confidence, 'MODERATE');
});

test('100 accepted and refused gaps delimit a threshold or contradict when they overlap', () => {
  const bounded = assessEvidenceConfidence({
    key: 'yield_time_gap',
    evidence: read('yield_time_gap', 3, 3),
    episodes: [
      episode('r', { outcome: 'REFUSED', value: 3 }),
      episode('a', { outcome: 'ACCEPTED', value: 5 }),
      episode('b', { outcome: 'ACCEPTED', value: 6 }),
    ],
    candidate: candidate('yield_time_gap', null, 'CANDIDATE', [3, 5]),
  });
  assert.equal(bounded.state, 'OBSERVED');
  assert.deepEqual(bounded.interval, [3, 5]);
  assert.equal(bounded.contradiction.severity, 'NONE');

  const overlapping = assessEvidenceConfidence({
    key: 'yield_time_gap',
    evidence: read('yield_time_gap', 3, 3),
    episodes: [
      episode('r', { outcome: 'REFUSED', value: 6 }),
      episode('a', { outcome: 'ACCEPTED', value: 5 }),
      episode('b', { outcome: 'ACCEPTED', value: 7 }),
    ],
    candidate: candidate('yield_time_gap', null, 'CANDIDATE'),
  });
  assert.equal(overlapping.contradiction.severity, 'SEVERE');
  assert.equal(overlapping.contradiction.reason, 'ACCEPTED_AND_REFUSED_OVERLAP');
  assert.equal(overlapping.state, 'WEAK');
});

test('100 following evidence needs varied speeds and full episode detail', () => {
  const sameSpeed = assessEvidenceConfidence({
    key: 'following_time_headway',
    evidence: read('following_time_headway', 3, 3),
    episodes: [
      episode('a', { value: 1.8, speed: 10 }),
      episode('b', { value: 1.8, speed: 10 }),
      episode('c', { value: 1.8, speed: 10 }),
    ],
    candidate: candidate('following_time_headway', 1.8),
  });
  assert.equal(sameSpeed.state, 'WEAK');
  assert.equal(sameSpeed.reason, 'VARIED_SPEEDS_REQUIRED');

  const missing = summarizeEvidenceQuality(
    'following_time_headway',
    read('following_time_headway', 3, 3),
    [],
  );
  assert.equal(missing.evidenceState, 'WEAK');
  assert.equal(missing.reason, 'MISSING_EPISODE_EXPOSURE');

  const mismatched = summarizeEvidenceQuality(
    'following_time_headway',
    read('following_time_headway', 4, 4),
    [episode('a', { value: 1.8, speed: 10 })],
  );
  assert.equal(mismatched.reason, 'EPISODE_DETAIL_MISMATCH');
});

test('100 thresholds cover all 24 keys and preserve the 093 gates', () => {
  assert.equal(parameterConfidenceThresholds.length, 24);
  assert.deepEqual(
    new Set(parameterConfidenceThresholds.map((row) => row.key)),
    new Set(parameterEvidenceSpecs.map((row) => row.key)),
  );
  assert.equal(confidenceThreshold('speed_delta_urban').minimumEpisodeTicks, 600);
  assert.equal(confidenceThreshold('following_time_headway').requiresVariedSpeeds, true);
  assert.equal(confidenceThreshold('desired_acceleration').minimumEpisodeTicks, 30);
  assert.equal(Object.isFrozen(parameterConfidenceThresholds), true);
  assert.throws(() => confidenceThreshold('not_a_key' as ParameterKey), /Unknown/);
});

test('100 real 099 candidates integrate without publishing or enabling estimation', () => {
  const reads = (
    [
      'lane_change_front_gap',
      'lane_change_back_gap',
      'lane_change_speed_gain',
      'lane_change_cooldown',
    ] as const
  ).map((key) => read(key, 3, 3));
  function fact(id: string, front: number): LaneEstimatorObservation {
    const windowId = `w-${id}`;
    return {
      eligibility: {
        windowId,
        opportunityId: id,
        kind: 'LANE_CHANGE',
        label: 'FREE_TRAFFIC',
        windowClass: 'ELIGIBLE',
        controlMode: 'LEARNING',
        learningEligible: true,
        vehicleId: 'v',
        incarnation: 'inc',
        segmentId: 's',
      } as never,
      opportunity: {
        id,
        kind: 'LANE_CHANGE',
        state: 'RESOLVED',
        outcome: 'COMPLETED',
        result: 'SUCCESS',
        vehicleId: 'v',
        incarnation: 'inc',
        segmentIds: ['s'],
        learningEligible: true,
        occurrence: 1,
      } as never,
      artifacts: {
        windowId,
        segmentId: 's',
        vehicleId: 'v',
        incarnation: 'inc',
        controlMode: 'LEARNING',
        learningEligible: true,
        windowClass: 'PREFIX_ELIGIBLE',
        completeness: 'COMPLETE',
        prefix: { fromTick: 0, toTick: 120, ticks: 120 },
      } as never,
      routeRequired: false,
      outcome: 'COMPLETED',
      frontGapM: front,
      backGapM: 10,
      speedAdvantageMps: 3,
    };
  }
  const result = estimateLaneChangeParameters(reads, [fact('a', 12), fact('b', 14), fact('c', 16)]);
  const assessments = assessEstimatorConfidence(result, reads, {
    lane_change_front_gap: [
      episode('a', { ticks: 120, value: 12 }),
      episode('b', { ticks: 120, value: 14 }),
      episode('c', { ticks: 120, value: 16 }),
    ],
    lane_change_back_gap: [
      episode('a', { ticks: 120, value: 10 }),
      episode('b', { ticks: 120, value: 10 }),
      episode('c', { ticks: 120, value: 10 }),
    ],
    lane_change_speed_gain: [
      episode('a', { ticks: 120, value: 3 }),
      episode('b', { ticks: 120, value: 3 }),
      episode('c', { ticks: 120, value: 3 }),
    ],
    lane_change_cooldown: [
      episode('a', { ticks: 120, value: 2 }),
      episode('b', { ticks: 180, value: 3 }),
      episode('c', { ticks: 240, value: 4 }),
    ],
  });
  const front = assessments.find((row) => row.key === 'lane_change_front_gap')!;
  assert.equal(front.state, 'OBSERVED');
  assert.equal(front.value, 12);
  assert.equal(front.published, false);
  assert.equal(front.unchanged, true);
  assert.equal(Object.isFrozen(front), true);
  assert.equal(Object.isFrozen(assessments), true);
  const cooldown = assessments.find((row) => row.key === 'lane_change_cooldown')!;
  assert.equal(cooldown.state, 'WEAK');
  assert.equal(cooldown.reason, 'ESTIMATOR_NOT_READY');
});
