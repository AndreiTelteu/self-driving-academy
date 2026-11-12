import assert from 'node:assert/strict';
import test from 'node:test';
import { STOP_PRIORITY_POLICY_KEYS, STOP_PRIORITY_POLICY_LIMITS } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import {
  STOP_PRIORITY_ESTIMATOR_KEYS,
  STOP_PRIORITY_ESTIMATOR_LIMITS,
  estimateStopPriorityStyle,
} from '../../src/learning/stop-priority-estimator';
import type {
  StopPriorityEstimatorResult,
  StopPriorityEvidenceEpisode,
} from '../../src/learning/stop-priority-estimator';
import {
  allwayBracketEpisodes,
  allwayContradictoryEpisodes,
  allwayFirstArrivalEpisodes,
  allwayHoldOnlyEpisodes,
  allwayNotReleasedEpisodes,
  allwayScene,
  allwayTurnOnlyEpisodes,
  blockedBracketEpisodes,
  blockedCeilingEpisodes,
  blockedContradictoryEpisodes,
  blockedDeclaredExitEpisodes,
  blockedDenialOnlyEpisodes,
  blockedEntryDenial,
  blockedEntryGrant,
  blockedGrantOnlyEpisodes,
  blockedScene,
  blockedVetoEpisodes,
  cappedRollingEpisodes,
  manualEpisodes,
  mixedRollingCapEpisodes,
  noisyRollingEpisodes,
  positiveEpisodes,
  priorityBracketEpisodes,
  priorityClaimOnlyEpisodes,
  priorityContradictoryEpisodes,
  priorityGrantedEpisodes,
  priorityInertEpisodes,
  priorityUnknownSeparationEpisodes,
  priorityYieldOnlyEpisodes,
  recordEpisode,
  refusalScene,
  rollingScene,
  rollingStopEpisodes,
  wideAllwayEpisodes,
  wideBlockedEpisodes,
  widePriorityEpisodes,
  zeroAllwayEpisodes,
} from './stop-priority-estimator-reference';
import { evaluate } from '../autonomy/stop-priority-policy-reference';

const seed = 176;

function estimate(episodes: Parameters<typeof estimateStopPriorityStyle>[0]['episodes']) {
  return estimateStopPriorityStyle({ episodes, splitSeed: seed });
}
function digest(result: StopPriorityEstimatorResult): string {
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

test('176 each key needs its own scenario and never borrows another fact', () => {
  const rolling = estimate(rollingStopEpisodes());
  assert.equal(rolling.keys.rolling_stop_speed.status, 'CANDIDATE');
  assert.equal(rolling.keys.rolling_stop_speed.value, 1.2);
  assert.equal(rolling.keys.rolling_stop_speed.scenario, 'ROLLING_STOP');
  assert.equal(rolling.keys.priority_assertiveness.status, 'UNOBSERVED');
  assert.equal(rolling.keys.allway_stop_patience.status, 'UNOBSERVED');
  assert.equal(rolling.keys.blocked_intersection_entry_probability.status, 'UNOBSERVED');

  const priority = estimate(priorityBracketEpisodes());
  assert.equal(priority.keys.priority_assertiveness.status, 'CANDIDATE');
  assert(near(priority.keys.priority_assertiveness.value, 0.3667, 0.01));
  assert.equal(priority.keys.priority_assertiveness.scenario, 'PRIORITY_CLAIM');
  assert.equal(priority.keys.rolling_stop_speed.status, 'UNOBSERVED');
  assert.equal(priority.keys.allway_stop_patience.status, 'UNOBSERVED');

  const allway = estimate(allwayBracketEpisodes());
  assert.equal(allway.keys.allway_stop_patience.status, 'CANDIDATE');
  assert.equal(allway.keys.allway_stop_patience.value, 4);
  assert.equal(allway.keys.allway_stop_patience.scenario, 'ALLWAY_PATIENCE');
  assert.equal(allway.keys.rolling_stop_speed.status, 'UNOBSERVED');
  assert.equal(allway.keys.priority_assertiveness.status, 'UNOBSERVED');

  const blocked = estimate(blockedBracketEpisodes());
  assert.equal(blocked.keys.blocked_intersection_entry_probability.status, 'CANDIDATE');
  assert(
    near(
      blocked.keys.blocked_intersection_entry_probability.value,
      (blockedEntryGrant(0).sample + blockedEntryDenial(0).sample) / 2,
      1e-9,
    ),
  );
  assert.equal(blocked.keys.blocked_intersection_entry_probability.scenario, 'BLOCKED_ENTRY');
  assert.equal(blocked.keys.rolling_stop_speed.status, 'UNOBSERVED');
  assert.equal(blocked.keys.allway_stop_patience.status, 'UNOBSERVED');
});

test('176 a demonstrated zero patience is an observation, not missing evidence', () => {
  const zero = estimate(zeroAllwayEpisodes()).keys.allway_stop_patience;
  assert.equal(zero.status, 'CANDIDATE');
  assert.equal(zero.value, 0);
  assert.equal(zero.rawValue, 0);
  assert.equal(zero.reason, null);
  assert.equal(zero.validation.status, 'VALIDATED');

  const absent = estimate(blockedVetoEpisodes()).keys.blocked_intersection_entry_probability;
  assert.equal(absent.status, 'UNOBSERVED');
  assert.equal(absent.value, null);
  assert.equal(absent.reason, 'BLOCKED_INTERSECTION_VETO');
});

test('176 uncertainty is measured per key and above its threshold the key stays unobserved', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of STOP_PRIORITY_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.status, 'CANDIDATE', key);
    assert(entry.uncertainty !== null && entry.uncertainty > 0, `${key} uncertainty`);
    assert(entry.uncertainty! <= entry.uncertaintyThreshold, `${key} threshold`);
  }

  const noisyRolling = estimate(noisyRollingEpisodes()).keys.rolling_stop_speed;
  assert.equal(noisyRolling.status, 'UNOBSERVED');
  assert.equal(noisyRolling.value, null);
  assert.equal(noisyRolling.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    noisyRolling.uncertainty! >
      STOP_PRIORITY_ESTIMATOR_LIMITS.maximumUncertainty.rolling_stop_speed,
  );

  const widePriority = estimate(widePriorityEpisodes()).keys.priority_assertiveness;
  assert.equal(widePriority.status, 'UNOBSERVED');
  assert.equal(widePriority.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    widePriority.uncertainty! >
      STOP_PRIORITY_ESTIMATOR_LIMITS.maximumUncertainty.priority_assertiveness,
  );

  const wideAllway = estimate(wideAllwayEpisodes()).keys.allway_stop_patience;
  assert.equal(wideAllway.status, 'UNOBSERVED');
  assert.equal(wideAllway.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    wideAllway.uncertainty! >
      STOP_PRIORITY_ESTIMATOR_LIMITS.maximumUncertainty.allway_stop_patience,
  );

  const wideBlocked = estimate(wideBlockedEpisodes()).keys.blocked_intersection_entry_probability;
  assert.equal(wideBlocked.status, 'UNOBSERVED');
  assert.equal(wideBlocked.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    wideBlocked.uncertainty! >
      STOP_PRIORITY_ESTIMATOR_LIMITS.maximumUncertainty.blocked_intersection_entry_probability,
  );
});

test('176 the validation split is explicit and disjoint and is evaluated on held-out episodes', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of STOP_PRIORITY_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.validation.status, 'VALIDATED', `${key} validation`);
    assert(entry.validation.episodes >= STOP_PRIORITY_ESTIMATOR_LIMITS.minimumValidationEpisodes);
    assert(entry.sourceEpisodes >= STOP_PRIORITY_ESTIMATOR_LIMITS.minimumEstimateEpisodes);
  }
  assert.equal(positive.admittedEpisodes.length, positiveEpisodes().length);
  assert.equal(new Set(positive.admittedEpisodes).size, positive.admittedEpisodes.length);
  assert.equal(positive.refusedEpisodes.length, 0);

  const tiny = estimate(rollingStopEpisodes([1.2, 1.2, 1.2]));
  assert.equal(tiny.keys.rolling_stop_speed.status, 'CANDIDATE');
  assert.equal(tiny.keys.rolling_stop_speed.validation.status, 'TOO_SMALL');
  assert.equal(tiny.keys.rolling_stop_speed.validation.episodes, 1);

  const single = estimate(rollingStopEpisodes([1.2]));
  assert.equal(single.keys.rolling_stop_speed.status, 'UNOBSERVED');
  assert.equal(single.keys.rolling_stop_speed.reason, 'INSUFFICIENT_DISTINCT_EPISODES');
});

test('176 the rolling stop cap hides every value above it instead of reporting the cap', () => {
  const capped = estimate(cappedRollingEpisodes()).keys.rolling_stop_speed;
  assert.equal(capped.status, 'UNOBSERVED');
  assert.equal(capped.value, null);
  assert.equal(capped.reason, 'ROLLING_STOP_CAP_SATURATED');
  assert.equal(capped.excluded.ROLLING_STOP_CAP_SATURATED, 4);

  const mixed = estimate(mixedRollingCapEpisodes()).keys.rolling_stop_speed;
  assert.equal(mixed.status, 'UNOBSERVED');
  assert.equal(mixed.value, null);
  assert.equal(mixed.reason, 'ROLLING_STOP_CAP_INCONSISTENT');
  assert.equal(mixed.excluded.ROLLING_STOP_CAP_INCONSISTENT, 1);

  const exact = estimate(rollingStopEpisodes([2.5, 2.5, 2.5, 2.5])).keys.rolling_stop_speed;
  assert.equal(exact.status, 'CANDIDATE');
  assert.equal(exact.value, STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps);
  assert.equal(exact.clamped, false);
  assert(exact.value! < getParameterDefinition('rolling_stop_speed').max!);
});

test('176 assertiveness is only measurable from a 052 refusal above the 3 s floor', () => {
  const claimsOnly = estimate(priorityClaimOnlyEpisodes()).keys.priority_assertiveness;
  assert.equal(claimsOnly.status, 'UNOBSERVED');
  assert.equal(claimsOnly.value, null);
  assert.equal(claimsOnly.reason, 'ASSERTIVENESS_UPPER_BOUND_UNOBSERVED');

  const yieldsOnly = estimate(priorityYieldOnlyEpisodes()).keys.priority_assertiveness;
  assert.equal(yieldsOnly.status, 'UNOBSERVED');
  assert.equal(yieldsOnly.reason, 'ASSERTIVENESS_LOWER_BOUND_UNOBSERVED');

  const contradictory = estimate(priorityContradictoryEpisodes()).keys.priority_assertiveness;
  assert.equal(contradictory.status, 'UNOBSERVED');
  assert.equal(contradictory.value, null);
  assert.equal(contradictory.reason, 'CONTRADICTORY_ASSERTIVENESS_BOUNDS');
  assert.equal(contradictory.excluded.CONTRADICTORY_ASSERTIVENESS_BOUNDS, 4);

  const inert = estimate(priorityInertEpisodes()).keys.priority_assertiveness;
  assert.equal(inert.status, 'UNOBSERVED');
  assert.equal(inert.value, null);
  assert.equal(inert.reason, 'ASSERTIVENESS_INERT_AT_FLOOR');
  assert.equal(inert.excluded.ASSERTIVENESS_INERT_AT_FLOOR, 4);

  const granted = estimate(priorityGrantedEpisodes()).keys.priority_assertiveness;
  assert.equal(granted.status, 'UNOBSERVED');
  assert.equal(granted.reason, 'PRIORITY_NOT_REFUSED');

  const unknown = estimate(priorityUnknownSeparationEpisodes()).keys.priority_assertiveness;
  assert.equal(unknown.status, 'UNOBSERVED');
  assert.equal(unknown.reason, 'PRIORITY_SEPARATION_UNKNOWN');
  assert.equal(unknown.excluded.PRIORITY_SEPARATION_UNKNOWN, 4);
});

test('176 all-way patience is only measured after the 051 release of a non-first arrival', () => {
  const first = estimate(allwayFirstArrivalEpisodes()).keys.allway_stop_patience;
  assert.equal(first.status, 'UNOBSERVED');
  assert.equal(first.value, null);
  assert.equal(first.reason, 'ALLWAY_FIRST_ARRIVAL');
  assert.equal(first.excluded.ALLWAY_FIRST_ARRIVAL, 4);

  const held = estimate(allwayNotReleasedEpisodes()).keys.allway_stop_patience;
  assert.equal(held.status, 'UNOBSERVED');
  assert.equal(held.reason, 'ALLWAY_STOP_NOT_RELEASED');
  assert.equal(held.excluded.ALLWAY_STOP_NOT_RELEASED, 4);

  const turnsOnly = estimate(allwayTurnOnlyEpisodes()).keys.allway_stop_patience;
  assert.equal(turnsOnly.status, 'UNOBSERVED');
  assert.equal(turnsOnly.reason, 'ALLWAY_LOWER_BOUND_UNOBSERVED');

  const holdsOnly = estimate(allwayHoldOnlyEpisodes()).keys.allway_stop_patience;
  assert.equal(holdsOnly.status, 'UNOBSERVED');
  assert.equal(holdsOnly.reason, 'ALLWAY_UPPER_BOUND_UNOBSERVED');

  const contradictory = estimate(allwayContradictoryEpisodes()).keys.allway_stop_patience;
  assert.equal(contradictory.status, 'UNOBSERVED');
  assert.equal(contradictory.reason, 'CONTRADICTORY_ALLWAY_BOUNDS');
  assert.equal(contradictory.excluded.CONTRADICTORY_ALLWAY_BOUNDS, 4);
});

test('176 the blocked-entry veto and the declared exit prove nothing about the probability', () => {
  const veto = estimate(blockedVetoEpisodes()).keys.blocked_intersection_entry_probability;
  assert.equal(veto.status, 'UNOBSERVED');
  assert.equal(veto.value, null);
  assert.equal(veto.reason, 'BLOCKED_INTERSECTION_VETO');
  assert.equal(veto.excluded.BLOCKED_INTERSECTION_VETO, 4);

  const declared = estimate(blockedDeclaredExitEpisodes()).keys
    .blocked_intersection_entry_probability;
  assert.equal(declared.status, 'UNOBSERVED');
  assert.equal(declared.reason, 'EXIT_SPACE_DECLARED');
  assert.equal(declared.excluded.EXIT_SPACE_DECLARED, 4);

  const grantsOnly = estimate(blockedGrantOnlyEpisodes()).keys
    .blocked_intersection_entry_probability;
  assert.equal(grantsOnly.status, 'UNOBSERVED');
  assert.equal(grantsOnly.reason, 'BLOCKED_ENTRY_UPPER_BOUND_UNOBSERVED');

  const denialsOnly = estimate(blockedDenialOnlyEpisodes()).keys
    .blocked_intersection_entry_probability;
  assert.equal(denialsOnly.status, 'UNOBSERVED');
  assert.equal(denialsOnly.reason, 'BLOCKED_ENTRY_LOWER_BOUND_UNOBSERVED');

  const ceiling = estimate(blockedCeilingEpisodes()).keys.blocked_intersection_entry_probability;
  assert.equal(ceiling.status, 'UNOBSERVED');
  assert.equal(ceiling.value, null);
  assert.equal(ceiling.reason, 'BLOCKED_ENTRY_CAP_SATURATED');

  const contradictory = estimate(blockedContradictoryEpisodes()).keys
    .blocked_intersection_entry_probability;
  assert.equal(contradictory.status, 'UNOBSERVED');
  assert.equal(contradictory.reason, 'CONTRADICTORY_BLOCKED_ENTRY_BOUNDS');
  assert.equal(contradictory.excluded.CONTRADICTORY_BLOCKED_ENTRY_BOUNDS, 4);
});

test('176 no key ever fabricates a value', () => {
  const scenarios = [
    positiveEpisodes(),
    noisyRollingEpisodes(),
    cappedRollingEpisodes(),
    mixedRollingCapEpisodes(),
    priorityClaimOnlyEpisodes(),
    priorityYieldOnlyEpisodes(),
    priorityContradictoryEpisodes(),
    priorityInertEpisodes(),
    priorityGrantedEpisodes(),
    priorityUnknownSeparationEpisodes(),
    widePriorityEpisodes(),
    allwayTurnOnlyEpisodes(),
    allwayHoldOnlyEpisodes(),
    allwayContradictoryEpisodes(),
    allwayFirstArrivalEpisodes(),
    allwayNotReleasedEpisodes(),
    wideAllwayEpisodes(),
    zeroAllwayEpisodes(),
    blockedGrantOnlyEpisodes(),
    blockedDenialOnlyEpisodes(),
    blockedCeilingEpisodes(),
    blockedVetoEpisodes(),
    blockedDeclaredExitEpisodes(),
    blockedContradictoryEpisodes(),
    wideBlockedEpisodes(),
    manualEpisodes(),
    [],
  ];
  let unobserved = 0;
  for (const episodes of scenarios) {
    const result = estimate(episodes);
    for (const key of STOP_PRIORITY_ESTIMATOR_KEYS) {
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

test('176 group constraints name the shared channels and the unidentifiable ceilings', () => {
  const { groupConstraints } = estimate(positiveEpisodes());
  assert.equal(groupConstraints.length, 6);
  assert.deepEqual(
    groupConstraints.map((entry) => entry.id),
    [
      'ROLLING_STOP_AND_STOP_INTENT_SHARED',
      'ROLLING_STOP_CAP_CEILING',
      'ASSERTIVENESS_AND_YIELD_GAP_SHARED',
      'ALLWAY_PATIENCE_AFTER_M_DWELL',
      'BLOCKED_ENTRY_VETO_SHADOWS_PROBABILITY',
      'STOP_PRIORITY_KEYS_FROM_ONE_APPROACH',
    ],
  );
  for (const entry of groupConstraints) {
    assert(entry.explanation.length > 40);
    assert(entry.keys.every((key) => STOP_PRIORITY_ESTIMATOR_KEYS.includes(key)));
  }
  assert.deepEqual([...groupConstraints[5]!.keys], [...STOP_PRIORITY_POLICY_KEYS]);
});

test('176 invalid samples and ineligible episodes are refused, never measured', () => {
  const episode = rollingStopEpisodes()[0]!;
  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [
            { ...episode.samples[0]!, rollThroughSpeedMps: Number.NaN },
            ...episode.samples.slice(1),
          ],
        },
      ]),
    /stop\/priority evidence/i,
  );
  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [
            { ...episode.samples[0]!, reason: 'NOT_A_175_REASON' as never },
            ...episode.samples.slice(1),
          ],
        },
      ]),
    /stop\/priority evidence/i,
  );
  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [{ ...episode.samples[0]!, allWayPosition: 0 }, ...episode.samples.slice(1)],
        },
      ]),
    /stop\/priority evidence/i,
  );

  const duplicate = estimate([episode, episode]);
  assert.deepEqual(duplicate.refusedEpisodes, [
    { episodeId: episode.episodeId, reason: 'DUPLICATE_EPISODE' },
  ]);

  const manual = estimate(manualEpisodes());
  assert.equal(manual.refusedEpisodes.length, 4);
  assert(manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE'));
  assert.equal(manual.keys.rolling_stop_speed.reason, 'NO_ELIGIBLE_EPISODES');

  const unusable = {
    ...episode,
    artifacts: { ...episode.artifacts, windowClass: 'FULLY_SUPPRESSED', prefix: null },
  } as StopPriorityEvidenceEpisode;
  assert.deepEqual(estimate([unusable]).refusedEpisodes, [
    { episodeId: episode.episodeId, reason: 'NO_USABLE_PREFIX' },
  ]);

  assert.throws(() => estimateStopPriorityStyle({ episodes: [], splitSeed: -1 }), /split seed/i);
  assert.throws(
    () => estimateStopPriorityStyle({ episodes: [], splitSeed: 4_294_967_296 }),
    /split seed/i,
  );

  const truncated = {
    ...episode,
    artifacts: { ...episode.artifacts, prefix: { fromTick: 0, toTick: 0, ticks: 1 } },
  } as StopPriorityEvidenceEpisode;
  assert.equal(estimate([truncated]).keys.rolling_stop_speed.reason, 'NO_ROLLING_STOP_EPISODE');

  const unordered = recordEpisode(
    'unordered',
    [
      { scene: rollingScene, opportunityKey: 'opportunity-0' },
      { scene: rollingScene, opportunityKey: 'opportunity-1' },
    ],
    { rolling_stop_speed: 1 },
    { mValues: { stop_full_probability: 0 } },
  );
  assert.throws(
    () => estimate([{ ...unordered, samples: [...unordered.samples].reverse() }]),
    /strictly ordered/i,
  );
});

test('176 the estimate is deterministic and frozen', () => {
  const first = estimate(positiveEpisodes()),
    second = estimate(positiveEpisodes());
  assert.equal(digest(first), digest(second));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.keys), true);
  assert.equal(Object.isFrozen(first.keys.priority_assertiveness), true);
  assert.equal(Object.isFrozen(first.groupConstraints), true);
  assert.equal(first.version, '176-stop-priority-estimator-v1');
  assert.equal(first.splitSeed, seed);
  assert.equal(first.compatibility.candidateOnly, true);
  assert.equal(first.compatibility.changesPolicySemantics, false);
});

test('176 candidates stay inside the 092 catalog and keep the registry unit', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of STOP_PRIORITY_ESTIMATOR_KEYS) {
    const entry = positive.keys[key],
      definition = getParameterDefinition(key);
    assert.equal(entry.unit, definition.unit);
    assert.equal(entry.clamped, false);
    assert(entry.value! >= definition.min && entry.value! <= definition.max);
  }
  const ranges = positive.compatibility.catalogRanges;
  assert.deepEqual(STOP_PRIORITY_ESTIMATOR_KEYS, STOP_PRIORITY_POLICY_KEYS);
  assert.equal(ranges.rolling_stop_speed.min, 0.2);
  assert.equal(ranges.rolling_stop_speed.max, 5);
  assert.equal(ranges.priority_assertiveness.min, 0);
  assert.equal(ranges.priority_assertiveness.max, 1);
  assert.equal(ranges.allway_stop_patience.min, 0);
  assert.equal(ranges.allway_stop_patience.max, 10);
  assert.equal(ranges.blocked_intersection_entry_probability.min, 0);
  assert.equal(ranges.blocked_intersection_entry_probability.max, 1);
  assert.equal(positive.compatibility.policyVersion, STOP_PRIORITY_POLICY_LIMITS.version);
  assert.equal(
    positive.compatibility.rollingStopCapMps,
    STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps,
  );
  assert.equal(
    positive.compatibility.priorityFloorS,
    STOP_PRIORITY_POLICY_LIMITS.priorityMinimumGapS,
  );
  assert.equal(
    positive.compatibility.blockedEntryCap,
    STOP_PRIORITY_POLICY_LIMITS.blockedEntryMaximumProbability,
  );
  assert.deepEqual(
    [...positive.compatibility.mReadByPolicy],
    ['stop_full_probability', 'stop_dwell_time', 'stop_line_offset', 'yield_time_gap'],
  );
});

test('176 the estimates are consumed by 175 without changing its semantics', () => {
  const positive = estimate(positiveEpisodes()),
    values = Object.fromEntries(
      STOP_PRIORITY_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    );

  const rolling = evaluate(rollingScene, {
    rValues: values,
    mValues: { stop_full_probability: 0 },
  }).command;
  assert.equal(rolling.reason, 'ROLLING_STOP_AT_SPEED');
  assert.equal(rolling.rollThroughSpeedMps, values.rolling_stop_speed);
  assert.equal(rolling.rollingStopCapped, false);

  const required = evaluate(refusalScene(5), {
    rValues: values,
    mValues: { yield_time_gap: 6 },
  }).command.requiredGapS!;
  assert(near(required, 4.9, 0.01));
  const claimed = evaluate(refusalScene(required), {
    rValues: values,
    mValues: { yield_time_gap: 6 },
  }).command;
  assert.equal(claimed.reason, 'PRIORITY_CLAIMED');
  assert.equal(claimed.priorityClaimed, true);
  const yielded = evaluate(refusalScene(required - 0.05), {
    rValues: values,
    mValues: { yield_time_gap: 6 },
  }).command;
  assert.equal(yielded.reason, 'PRIORITY_YIELD');
  assert.equal(yielded.stopRequested, true);

  const held = evaluate(allwayScene(values.allway_stop_patience - 0.1), {
    rValues: values,
  }).command;
  assert.equal(held.reason, 'ALLWAY_PATIENCE');
  const turned = evaluate(allwayScene(values.allway_stop_patience + 0.1), {
    rValues: values,
  }).command;
  assert.equal(turned.reason, 'ALLWAY_TURN');

  const grant = blockedEntryGrant(0),
    denial = blockedEntryDenial(0),
    accepted = evaluate(blockedScene(), {
      rValues: values,
      opportunityKey: grant.opportunityKey,
    }).command;
  assert.equal(accepted.reason, 'BLOCKED_ENTRY_ACCEPTED');
  assert.equal(accepted.blockedEntryGranted, true);
  const waited = evaluate(blockedScene(), {
    rValues: values,
    opportunityKey: denial.opportunityKey,
  }).command;
  assert.equal(waited.reason, 'BLOCKED_ENTRY_WAIT');
  assert.equal(waited.blockedEntryGranted, false);
});
