import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateLaneChangeParameters } from '../../src/learning/lane-estimator';
import { parameterEvidenceSpecs } from '../../src/learning/parameter-evidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import type { LaneEstimatorObservation } from '../../src/learning/lane-estimator';

const reads = parameterEvidenceSpecs
  .filter((x) => x.estimatorOwner === '099')
  .map(
    (x) =>
      ({
        key: x.key,
        status: 'READY',
        distinctEpisodes: 3,
        contextBreakdown: Object.freeze([]),
        sampleCount: 3,
        quality: 1,
        uncertainty: 'MODERATE',
        unchanged: true,
        noEstimate: 'ESTIMATOR_NOT_IMPLEMENTED',
      }) as unknown as ParameterEvidenceReadModel,
  );
function fact(
  id: string,
  opts: {
    route?: boolean;
    outcome?: 'COMPLETED' | 'REJECTED' | 'ABORTED';
    front?: number;
    back?: number;
    gain?: number;
    cooldown?: number;
  } = {},
): LaneEstimatorObservation {
  const windowId = `w-${id}`;
  return {
    eligibility: {
      windowId,
      opportunityId: id,
      kind: 'LANE_CHANGE',
      reason: 'NO_CONSTRAINT',
      source: 'NONE',
      observable: true,
      vehicleId: 'v',
      incarnation: 'inc',
      segmentId: 's',
      controlMode: 'LEARNING',
      learningEligible: true,
      openedTick: 0,
      lastTick: 60,
      observationCount: 1,
      reaction: { open: false, reason: 'SEGMENT_CLOSED' },
      windowClass: 'ELIGIBLE',
      label: 'FREE_TRAFFIC',
    } as never,
    opportunity: {
      id,
      kind: 'LANE_CHANGE',
      state: 'RESOLVED',
      outcome:
        opts.outcome === 'ABORTED'
          ? 'ABORTED'
          : opts.outcome === 'REJECTED'
            ? 'ABORTED'
            : 'COMPLETED',
      result: opts.outcome === 'REJECTED' || opts.outcome === 'ABORTED' ? 'FAILURE' : 'SUCCESS',
      truncationReason: null,
      vehicleId: 'v',
      incarnation: 'inc',
      segmentIds: ['s'],
      learningEligible: true,
      occurrence: 1,
      openedTick: 0,
      lastTick: 60,
      resolvedTick: 60,
      observationCount: 1,
      stimulus: {},
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
      prefix: { fromTick: 0, toTick: 60, ticks: 60 },
    } as never,
    routeRequired: opts.route ?? false,
    outcome: opts.outcome ?? 'COMPLETED',
    frontGapM: opts.front ?? 10,
    backGapM: opts.back ?? 8,
    speedAdvantageMps: opts.gain ?? 2,
    cooldownTicks: opts.cooldown,
  };
}

test('099 route-forced changes do not mix with optional gap, advantage or cooldown evidence', () => {
  const optional = [
    fact('a', { front: 12, back: 9, gain: 3, cooldown: 120 }),
    fact('b', { front: 14, back: 11, gain: 4, cooldown: 180 }),
    fact('c', { front: 16, back: 12, gain: 5, cooldown: 240 }),
  ];
  const result = estimateLaneChangeParameters(reads, [
    ...optional,
    fact('forced', { route: true, front: 1, back: 1, gain: 0, cooldown: 1 }),
  ]);
  assert.equal(result.routeForcedExcluded, 1);
  assert.equal(result.optionalOpportunityCount, 3);
  assert.equal(result.candidates.lane_change_front_gap.bound, 12);
  assert.equal(result.candidates.lane_change_front_gap.interval, null);
  assert.equal(result.candidates.lane_change_cooldown.value, 3);
});

test('099 varied rejected and completed opportunities bound each optional gap threshold', () => {
  const result = estimateLaneChangeParameters(reads, [
    fact('r', { outcome: 'REJECTED', front: 8, back: 6, gain: 1 }),
    fact('a', { front: 12, back: 10, gain: 3 }),
    fact('b', { front: 14, back: 12, gain: 4 }),
  ]);
  assert.deepEqual(result.candidates.lane_change_front_gap.interval, [8, 12]);
  assert.equal(result.candidates.lane_change_front_gap.value, null);
  assert.deepEqual(result.candidates.lane_change_back_gap.interval, [6, 10]);
  assert.equal(result.candidates.lane_change_back_gap.value, null);
  assert.deepEqual(result.candidates.lane_change_speed_gain.interval, [1, 3]);
  assert.equal(result.candidates.lane_change_speed_gain.value, null);
});
