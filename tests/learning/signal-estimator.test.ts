import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateSignalParameters } from '../../src/learning/signal-estimator';
import { parameterEvidenceSpecs } from '../../src/learning/parameter-evidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import type { EligibilityWindowRecord, OpportunityDenominators } from '../../src/telemetry';

const reads = parameterEvidenceSpecs
  .filter((x) => x.estimatorOwner === '097')
  .map(
    (x) =>
      ({
        key: x.key,
        status: 'READY',
        distinctEpisodes: 3,
        contextBreakdown: Object.freeze([
          { label: 'FREE_TRAFFIC', roadType: 'test', speedBand: 'MID', episodes: 3 },
        ]),
        sampleCount: 3,
        quality: 1,
        uncertainty: 'MODERATE',
        unchanged: true,
        noEstimate: 'ESTIMATOR_NOT_IMPLEMENTED',
      }) as ParameterEvidenceReadModel,
  );
function fact(
  id: string,
  kind: 'RED' | 'GREEN',
  options: {
    truncated?: boolean;
    outcome?: 'HELD' | 'CROSSED' | 'RELEASED' | 'MISSED';
    blocked?: boolean;
    onset?: number;
    departure?: number;
  } = {},
) {
  const windowId = `w-${id}`;
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
      observationCount: 60,
      reaction: { open: false, reason: 'SEGMENT_CLOSED' },
      windowClass: 'ELIGIBLE',
      label: 'FREE_TRAFFIC',
    } as never,
    opportunity: {
      id,
      kind,
      state: options.truncated ? 'TRUNCATED' : 'RESOLVED',
      outcome: options.truncated
        ? null
        : (options.outcome ?? (kind === 'RED' ? 'HELD' : 'RELEASED')),
      result: options.truncated ? null : 'SUCCESS',
      truncationReason: options.truncated ? 'SEGMENT_CLOSED' : null,
      vehicleId: 'v',
      incarnation: 'inc',
      segmentIds: ['s'],
      learningEligible: true,
      occurrence: 1,
      openedTick: 0,
      lastTick: 60,
      resolvedTick: options.truncated ? null : 60,
      observationCount: 60,
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
      prefix: { fromTick: 0, toTick: 60, ticks: 60 },
    } as never,
    passed: true,
    greenOnsetTick: options.onset,
    departureTick: options.departure,
    departureBlockedByLeader: options.blocked ?? false,
    stopLineOffsetM: kind === 'RED' ? 1.25 : undefined,
    brakeThresholdMps2: kind === 'RED' ? 3.5 : undefined,
  };
}
function denominators(certain: number, incomplete = 0): OpportunityDenominators {
  return {
    version: '086-opportunities-v1',
    total: certain + incomplete,
    certain,
    success: certain,
    failure: 0,
    incomplete,
    entered: 0,
    learningEligibleCertain: certain,
    byKind: [
      {
        kind: 'RED',
        total: certain + incomplete,
        certain,
        success: certain,
        failure: 0,
        incomplete,
        entered: 0,
        learningEligibleCertain: certain,
      },
    ],
    truncatedByReason: [],
  } as never;
}

test('097 counts an opportunity once, uses 086 eligible denominator, and ignores truncated RED', () => {
  const one = fact('red-1', 'RED');
  const duplicates = Array.from({ length: 10 }, () => ({ ...one, repeatedFrame: true }));
  const two = fact('red-2', 'RED');
  const three = fact('red-3', 'RED');
  const truncated = fact('red-truncated', 'RED', { truncated: true });
  const result = estimateSignalParameters(reads, denominators(3, 1), [
    one,
    ...duplicates,
    two,
    three,
    truncated,
  ]);
  assert.equal(result.certainRedDenominator, 3);
  assert.equal(result.totalRedOpportunities, 4);
  assert.equal(result.truncatedRedOpportunities, 1);
  assert.equal(result.duplicateFramesIgnored, 10);
  assert.equal(result.candidates.red_stop_probability.value, 1);
});

test('097 exact unblocked green delay contributes; leader-blocked departure is counted and excluded', () => {
  const result = estimateSignalParameters(reads, denominators(0), [
    fact('g1', 'GREEN', { onset: 100, departure: 130 }),
    fact('g2', 'GREEN', { onset: 200, departure: 230 }),
    fact('g3', 'GREEN', { onset: 100, departure: 400, blocked: true }),
  ]);
  assert.equal(result.candidates.green_start_delay.value, 0.5);
  assert.equal(result.blockedGreenDepartures, 1);
});

test('097 zero certain denominator refuses ratio; unknown and foreign input are rejected', () => {
  const zero = estimateSignalParameters(reads, denominators(0), []);
  assert.equal(zero.candidates.red_stop_probability.status, 'REFUSED');
  assert.equal(zero.candidates.red_stop_probability.value, null);
  assert.equal(zero.candidates.red_stop_probability.reason, 'ZERO_CERTAIN_RED_DENOMINATOR');
  const missingFacts = estimateSignalParameters(reads, denominators(3), [fact('red-only', 'RED')]);
  assert.equal(missingFacts.candidates.red_stop_probability.value, null);
  assert.equal(
    missingFacts.candidates.red_stop_probability.reason,
    'INCOMPLETE_086_RED_DENOMINATOR_FACTS',
  );
  assert.throws(
    () =>
      estimateSignalParameters([{ ...reads[0]!, key: 'unknown' } as never], denominators(0), []),
    /Unknown evidence key/,
  );
  const bad = fact('g3', 'GREEN', { onset: 2, departure: 1 });
  assert.equal(
    estimateSignalParameters(reads, denominators(0), [bad]).candidates.green_start_delay.value,
    null,
  );
  const baseForeign = fact('red-foreign', 'RED');
  const foreign = {
    ...baseForeign,
    eligibility: {
      ...(baseForeign.eligibility as unknown as EligibilityWindowRecord),
      label: 'LEADER',
      windowClass: 'EXTERNAL_CONSTRAINT',
    } as EligibilityWindowRecord,
  };
  assert.equal(
    estimateSignalParameters(reads, denominators(3), [foreign]).candidates.red_stop_line_offset
      .value,
    null,
  );
});
