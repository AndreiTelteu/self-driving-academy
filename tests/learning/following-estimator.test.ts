import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateFollowingParameters } from '../../src/learning/following-estimator';
import { parameterEvidenceSpecs } from '../../src/learning/parameter-evidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import type { FollowingEstimatorObservation } from '../../src/learning/following-estimator';

const reads = parameterEvidenceSpecs
  .filter((x) => x.estimatorOwner === '096')
  .map(
    (x) =>
      ({
        key: x.key,
        status: 'READY',
        distinctEpisodes: 6,
        contextBreakdown: Object.freeze([
          { label: 'LEADER', roadType: 'test', speedBand: 'MID', episodes: 6 },
        ]),
        sampleCount: 6,
        quality: 1,
        uncertainty: 'MODERATE',
        unchanged: true,
        noEstimate: 'ESTIMATOR_NOT_IMPLEMENTED',
      }) as ParameterEvidenceReadModel,
  );
function row(
  i: number,
  speed: number,
  gap: number,
  leaderId = 'leader-a',
  context: 'LEADER' | 'QUEUE_STANDSTILL' = 'LEADER',
): FollowingEstimatorObservation {
  const id = `o${i}`;
  return {
    eligibility: {
      windowId: `w${id}`,
      opportunityId: id,
      kind: 'RED',
      reason: 'LEADER_AHEAD',
      source: 'FOLLOWING_048',
      observable: true,
      vehicleId: 'v',
      incarnation: 'inc',
      segmentId: 's',
      controlMode: 'LEARNING',
      learningEligible: true,
      openedTick: 0,
      lastTick: 60,
      observationCount: 60,
      reaction: { open: false, reason: 'SEGMENT_CLOSED' },
      windowClass: 'EXTERNAL_CONSTRAINT',
      label: 'LEADER',
    } as never,
    opportunity: {
      id,
      kind: 'RED',
      state: 'RESOLVED',
      outcome: 'HELD',
      result: 'SUCCESS',
      truncationReason: null,
      vehicleId: 'v',
      incarnation: 'inc',
      segmentIds: ['s'],
      learningEligible: true,
      occurrence: 1,
      openedTick: 0,
      lastTick: 60,
      resolvedTick: 60,
      observationCount: 60,
      stimulus: {},
    } as never,
    artifacts: {
      windowId: `w${id}`,
      segmentId: 's',
      vehicleId: 'v',
      incarnation: 'inc',
      controlMode: 'LEARNING',
      learningEligible: true,
      windowClass: 'PREFIX_ELIGIBLE',
      prefix: { fromTick: 0, toTick: 60, ticks: 60 },
    } as never,
    context,
    gapM: gap,
    speedMps: speed,
    leaderId,
    leaderSpeedMps: context === 'QUEUE_STANDSTILL' ? 0 : Math.max(speed, 1),
    speedGain: 0.5,
  };
}

test('096 varied moving speeds recover minimum gap and headway with inspectable residual', () => {
  const result = estimateFollowingParameters(reads, [
    row(1, 2, 4),
    row(2, 4, 7),
    row(3, 8, 13),
    row(4, 12, 19),
  ]);
  assert.equal(result.candidates.following_min_gap.value, 1);
  assert.equal(result.candidates.following_time_headway.value, 1.5);
  assert.equal(result.candidates.following_time_headway.residualRmsM, 0);
});

test('096 one speed cannot identify the coefficient pair; queue observations remain isolated', () => {
  const result = estimateFollowingParameters(reads, [
    row(1, 5, 8),
    row(2, 5, 9),
    row(3, 5, 10),
    row(4, 0, 1, 'leader-q1', 'QUEUE_STANDSTILL'),
    row(5, 0, 2, 'leader-q2', 'QUEUE_STANDSTILL'),
    row(6, 0, 3, 'leader-q3', 'QUEUE_STANDSTILL'),
  ]);
  assert.equal(result.candidates.following_min_gap.status, 'UNIDENTIFIED');
  assert.equal(result.candidates.following_min_gap.value, null);
  assert.equal(result.candidates.following_time_headway.status, 'UNIDENTIFIED');
  assert.equal(result.candidates.queue_standstill_gap.value, 2);
});

test('096 leader rollover splits episodes and foreign contexts contribute nothing', () => {
  const result = estimateFollowingParameters(reads, [
    row(1, 3, 5, 'a'),
    row(2, 6, 8, 'b'),
    row(3, 9, 11, 'b'),
  ]);
  assert.equal(result.leaderChangeSplits, 1);
  const base = row(4, 10, 15);
  const foreign = {
    ...base,
    eligibility: { ...base.eligibility, controlMode: 'MANUAL', learningEligible: false } as never,
    artifacts: { ...base.artifacts, controlMode: 'MANUAL', learningEligible: false } as never,
  };
  assert.equal(
    estimateFollowingParameters(reads, [foreign]).candidates.following_time_headway.value,
    null,
  );
});
