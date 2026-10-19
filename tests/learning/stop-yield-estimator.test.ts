import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateStopYieldParameters } from '../../src/learning/stop-yield-estimator';
import { parameterEvidenceSpecs } from '../../src/learning/parameter-evidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import type { OpportunityDenominators } from '../../src/telemetry';

const reads = parameterEvidenceSpecs
  .filter((x) => x.estimatorOwner === '098')
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
  kind: 'STOP' | 'YIELD',
  opts: {
    outcome?: string;
    label?: string;
    cause?: 'STOP_LINE' | 'LEADER' | 'QUEUE' | 'BLOCKED';
    rolling?: boolean;
    full?: boolean;
    dwell?: number;
    offset?: number;
    gap?: number;
  } = {},
) {
  const windowId = `w-${id}`;
  const label = opts.label ?? (kind === 'YIELD' ? 'LEADER' : 'FREE_TRAFFIC');
  return {
    eligibility: {
      windowId,
      opportunityId: id,
      kind,
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
      windowClass: label === 'LEADER' ? 'EXTERNAL_CONSTRAINT' : 'ELIGIBLE',
      label,
    } as never,
    opportunity: {
      id,
      kind,
      state: 'RESOLVED',
      outcome:
        opts.outcome ??
        (opts.rolling ? 'CROSSED_WITHOUT_STOP' : kind === 'STOP' ? 'STOPPED' : 'YIELDED'),
      result: opts.rolling ? 'FAILURE' : 'SUCCESS',
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
    stopCause: opts.cause,
    rollingStop: opts.rolling,
    fullStop: opts.full,
    dwellTicks: opts.dwell,
    stopLineOffsetM: opts.offset,
    yieldGapS: opts.gap,
  };
}
function denominators(stopCertain: number, yieldCertain = 0): OpportunityDenominators {
  const byKind = (['STOP', 'YIELD'] as const).map((kind) => {
    const certain = kind === 'STOP' ? stopCertain : yieldCertain;
    return {
      kind,
      total: certain,
      certain,
      success: certain,
      failure: 0,
      incomplete: 0,
      entered: 0,
      learningEligibleCertain: certain,
    };
  });
  return {
    version: '086-opportunity-ids-v1',
    total: stopCertain + yieldCertain,
    certain: stopCertain + yieldCertain,
    success: stopCertain + yieldCertain,
    failure: 0,
    incomplete: 0,
    entered: 0,
    learningEligibleCertain: stopCertain + yieldCertain,
    byKind,
    truncatedByReason: [],
  } as never;
}

test('098 separates rolling, full and traffic-induced STOP facts and uses exact dwell ticks', () => {
  const input = [
    fact('s1', 'STOP', { cause: 'STOP_LINE', full: true, dwell: 90, offset: 1 }),
    fact('s2', 'STOP', {
      cause: 'STOP_LINE',
      rolling: true,
      full: false,
      offset: 2,
    }),
    fact('s3', 'STOP', { cause: 'STOP_LINE', full: true, dwell: 120, offset: 3 }),
    fact('s4', 'STOP', { cause: 'STOP_LINE', full: true, dwell: 150, offset: 4 }),
    fact('s5', 'STOP', { cause: 'QUEUE', label: 'LEADER', full: true, dwell: 600 }),
  ];
  const result = estimateStopYieldParameters(reads, denominators(5), input);
  assert.equal(result.candidates.stop_full_probability.value, 0.75);
  assert.equal(result.certainStopOpportunityDenominator, 5);
  assert.equal(result.certainStopDenominator, 4);
  assert.equal(result.candidates.stop_dwell_time.value, 2);
  assert.equal(result.rollingStops, 1);
  assert.equal(result.trafficInducedStopsExcluded, 1);
  assert.equal(result.candidates.stop_line_offset.value, 2.5);
});

test('098 zero STOP denominator refuses; accepted yields alone remain an observed lower bound', () => {
  const zero = estimateStopYieldParameters(reads, denominators(0), []);
  assert.equal(zero.candidates.stop_full_probability.status, 'REFUSED');
  assert.equal(zero.candidates.stop_full_probability.reason, 'ZERO_ELIGIBLE_STOP_DENOMINATOR');
  const accepted = [
    fact('y1', 'YIELD', { outcome: 'PROCEEDED', gap: 2 }),
    fact('y2', 'YIELD', { outcome: 'PROCEEDED', gap: 3 }),
    fact('y3', 'YIELD', { outcome: 'PROCEEDED', gap: 4 }),
  ];
  const lower = estimateStopYieldParameters(reads, denominators(0, 3), accepted).candidates
    .yield_time_gap;
  assert.equal(lower.bound, 2);
  assert.equal(lower.interval, null);
  const mixed = estimateStopYieldParameters(reads, denominators(0, 4), [
    ...accepted,
    fact('y4', 'YIELD', { outcome: 'YIELDED', gap: 1.5 }),
  ]).candidates.yield_time_gap;
  assert.deepEqual(mixed.interval, [1.5, 2]);
  assert.equal(mixed.value, null);
});
