import assert from 'node:assert/strict';
import test from 'node:test';
import { LANE_POLICY_V2_KEYS, LANE_POLICY_V2_LIMITS } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import {
  LANE_V2_ESTIMATOR_KEYS,
  LANE_V2_ESTIMATOR_LIMITS,
  estimateLaneV2Style,
} from '../../src/learning/lane-v2-estimator';
import type {
  LaneV2EstimatorResult,
  LaneV2EvidenceEpisode,
} from '../../src/learning/lane-v2-estimator';
import {
  alternatingIndicatorEpisodes,
  durationEpisodes,
  indicatorEpisodes,
  indicatorOn,
  indicatorOff,
  leadEpisodes,
  leftScene,
  manualEpisodes,
  positiveEpisodes,
  rightPassContradictoryEpisodes,
  rightPassEpisodes,
  rightPassForbiddenEpisodes,
  rightPassGrant,
  rightPassGrantOnlyEpisodes,
  rightPassRefusal,
  rightPassRefusalOnlyEpisodes,
  rightScene,
  unsignalledDurationEpisodes,
  wideRightPassEpisodes,
  zeroIndicatorEpisodes,
  zeroLeadEpisodes,
} from './lane-v2-estimator-reference';
import { evaluate, progressAfterStart, run } from '../autonomy/lane-policy-v2-reference';

const seed = 178;

function estimate(episodes: Parameters<typeof estimateLaneV2Style>[0]['episodes']) {
  return estimateLaneV2Style({ episodes, splitSeed: seed });
}
function digest(result: LaneV2EstimatorResult): string {
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

test('178 fiecare cheie are contextul ei eligibil și nu împrumută faptul alteia', () => {
  const duration = estimate(durationEpisodes());
  assert.equal(duration.keys.lane_change_duration.status, 'CANDIDATE');
  assert(near(duration.keys.lane_change_duration.value, 1.9917, 0.01));
  assert.equal(duration.keys.lane_change_duration.scenario, 'MANOEUVRE_DURATION');
  assert.equal(duration.keys.signal_use_probability.status, 'UNOBSERVED');
  assert.equal(duration.keys.pass_on_right_probability.status, 'UNOBSERVED');

  const lead = estimate(leadEpisodes());
  assert.equal(lead.keys.signal_lead_time.status, 'CANDIDATE');
  assert(near(lead.keys.signal_lead_time.value, 1.9917, 0.01));
  assert.equal(lead.keys.signal_lead_time.scenario, 'SIGNAL_LEAD');
  assert.equal(lead.keys.lane_change_duration.status, 'UNOBSERVED');
  assert.equal(lead.keys.pass_on_right_probability.status, 'UNOBSERVED');

  const indicator = estimate(indicatorEpisodes());
  assert.equal(indicator.keys.signal_use_probability.status, 'CANDIDATE');
  assert.equal(indicator.keys.signal_use_probability.value, 0.4);
  assert.equal(indicator.keys.signal_use_probability.scenario, 'INDICATOR_USE');
  assert.equal(indicator.keys.lane_change_duration.status, 'UNOBSERVED');
  assert.equal(indicator.keys.pass_on_right_probability.status, 'UNOBSERVED');

  const pass = estimate(rightPassEpisodes());
  assert.equal(pass.keys.pass_on_right_probability.status, 'CANDIDATE');
  assert(
    near(
      pass.keys.pass_on_right_probability.value,
      (rightPassGrant(0).sample + rightPassRefusal(0).sample) / 2,
      1e-9,
    ),
  );
  assert.equal(pass.keys.pass_on_right_probability.scenario, 'RIGHT_SIDE_PASS');
  assert.equal(pass.keys.lane_change_duration.status, 'UNOBSERVED');
  assert.equal(pass.keys.signal_use_probability.status, 'UNOBSERVED');
});

test('178 un zero demonstrat este o observație, nu dovezi lipsă', () => {
  // Immediate signalling: the movement starts on the indicator tick, so the lead is exactly 0 s.
  const zeroLead = estimate(zeroLeadEpisodes()).keys.signal_lead_time;
  assert.equal(zeroLead.status, 'CANDIDATE');
  assert.equal(zeroLead.value, 0);
  assert.equal(zeroLead.rawValue, 0);
  assert.equal(zeroLead.reason, null);
  assert.equal(zeroLead.validation.status, 'VALIDATED');

  // Ten opportunities without a single indicator: a demonstrated zero probability.
  const zeroIndicator = estimate(zeroIndicatorEpisodes()).keys.signal_use_probability;
  assert.equal(zeroIndicator.status, 'CANDIDATE');
  assert.equal(zeroIndicator.value, 0);
  assert.equal(zeroIndicator.reason, null);
  assert.equal(zeroIndicator.validation.status, 'VALIDATED');

  // Absent evidence stays absent instead of becoming a zero.
  const absent = estimate(rightPassForbiddenEpisodes()).keys.pass_on_right_probability;
  assert.equal(absent.status, 'UNOBSERVED');
  assert.equal(absent.value, null);
  assert.equal(absent.reason, 'RIGHT_PASS_PRECONDITION');
});

test('178 incertitudinea se măsoară per cheie și peste pragul ei cheia rămâne neobservată', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of LANE_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.status, 'CANDIDATE', key);
    assert(entry.uncertainty !== null && entry.uncertainty > 0, `${key} uncertainty`);
    assert(entry.uncertainty! <= entry.uncertaintyThreshold, `${key} threshold`);
  }

  const noisyDuration = estimate(
    durationEpisodes([1.5, 2.5, 3.5, 4.5], { idPrefix: 'noisy', from: 700 }),
  ).keys.lane_change_duration;
  assert.equal(noisyDuration.status, 'UNOBSERVED');
  assert.equal(noisyDuration.value, null);
  assert.equal(noisyDuration.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    noisyDuration.uncertainty! > LANE_V2_ESTIMATOR_LIMITS.maximumUncertainty.lane_change_duration,
  );

  const noisyLead = estimate(
    leadEpisodes([1.5, 2.5, 3.5, 4.5], { idPrefix: 'lead-noisy', from: 800 }),
  ).keys.signal_lead_time;
  assert.equal(noisyLead.status, 'UNOBSERVED');
  assert.equal(noisyLead.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(noisyLead.uncertainty! > LANE_V2_ESTIMATOR_LIMITS.maximumUncertainty.signal_lead_time);

  const contradictoryIndicator = estimate(alternatingIndicatorEpisodes()).keys
    .signal_use_probability;
  assert.equal(contradictoryIndicator.status, 'UNOBSERVED');
  assert.equal(contradictoryIndicator.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    contradictoryIndicator.uncertainty! >
      LANE_V2_ESTIMATOR_LIMITS.maximumUncertainty.signal_use_probability,
  );

  const widePass = estimate(wideRightPassEpisodes()).keys.pass_on_right_probability;
  assert.equal(widePass.status, 'UNOBSERVED');
  assert.equal(widePass.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert(
    widePass.uncertainty! > LANE_V2_ESTIMATOR_LIMITS.maximumUncertainty.pass_on_right_probability,
  );
});

test('178 împărțirea estimare/validare este explicită, disjunctă și raportează TOO_SMALL', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of LANE_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.validation.status, 'VALIDATED', `${key} validation`);
    assert(entry.validation.episodes >= LANE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes);
    assert(entry.sourceEpisodes >= LANE_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes);
  }
  assert.equal(positive.admittedEpisodes.length, positiveEpisodes().length);
  assert.equal(new Set(positive.admittedEpisodes).size, positive.admittedEpisodes.length);
  assert.equal(positive.refusedEpisodes.length, 0);

  const tiny = estimate(durationEpisodes([2, 2, 2], { idPrefix: 'tiny', from: 1100 }));
  assert.equal(tiny.keys.lane_change_duration.status, 'CANDIDATE');
  assert.equal(tiny.keys.lane_change_duration.validation.status, 'TOO_SMALL');
  assert.equal(tiny.keys.lane_change_duration.validation.episodes, 1);

  const single = estimate(durationEpisodes([2], { idPrefix: 'single', from: 1200 }));
  assert.equal(single.keys.lane_change_duration.status, 'UNOBSERVED');
  assert.equal(single.keys.lane_change_duration.reason, 'INSUFFICIENT_DISTINCT_EPISODES');
});

test('178 podeaua de 1 s a duratei ascunde banda 0,5–1 s a catalogului', () => {
  const floor = estimate(durationEpisodes([0.5, 0.5, 1, 1], { idPrefix: 'floor', from: 500 })).keys
    .lane_change_duration;
  assert.equal(floor.status, 'UNOBSERVED');
  assert.equal(floor.value, null);
  assert.equal(floor.reason, 'DURATION_FLOOR_SATURATED');

  const mixed = estimate(durationEpisodes([0.5, 2, 0.5, 2], { idPrefix: 'mixed', from: 600 })).keys
    .lane_change_duration;
  assert.equal(mixed.status, 'UNOBSERVED');
  assert.equal(mixed.value, null);
  assert.equal(mixed.reason, 'DURATION_FLOOR_INCONSISTENT');

  // The floor is real in the delivered policy: 0.5 s and 1 s produce the same 60 ticks.
  for (const duration of [0.5, 1]) {
    const started = progressAfterStart(leftScene, {
      rValues: { signal_use_probability: 0, lane_change_duration: duration },
      advanceTicks: 0,
    });
    assert.equal(started.durationTicks, LANE_V2_ESTIMATOR_LIMITS.minimumManoeuvreDurationTicks);
  }
});

test('178 avansul de semnalizare există numai când indicatorul este folosit', () => {
  // The same episodes that measure a duration never switch the indicator on, so no lead exists.
  const unsignalled = estimate(unsignalledDurationEpisodes()).keys.signal_lead_time;
  assert.equal(unsignalled.status, 'UNOBSERVED');
  assert.equal(unsignalled.value, null);
  assert.equal(unsignalled.reason, 'SIGNAL_LEAD_WITHOUT_INDICATOR');
  assert.equal(unsignalled.excluded.SIGNAL_LEAD_WITHOUT_INDICATOR, 4);

  // A signalled manoeuvre whose movement never starts is only a censored wait.
  const censoredEpisodes = leadEpisodes([5, 5, 5, 5], {
    idPrefix: 'lead-censored',
    from: 1000,
  }).map((episode) => ({
    ...episode,
    samples: episode.samples.filter((sample) => sample.manoeuvreStartTick === null),
  })) as LaneV2EvidenceEpisode[];
  const censored = estimate(censoredEpisodes).keys.signal_lead_time;
  assert.equal(censored.status, 'UNOBSERVED');
  assert.equal(censored.value, null);
  assert.equal(censored.reason, 'SIGNAL_LEAD_CENSORED');
  assert.equal(censored.excluded.SIGNAL_LEAD_CENSORED, 4);

  // A real signalled manoeuvre does measure it.
  const measured = estimate(leadEpisodes()).keys.signal_lead_time;
  assert.equal(measured.status, 'CANDIDATE');
  assert.equal(measured.validation.status, 'VALIDATED');
});

test('178 refuzul de permisiune ori spațiul insuficient precede eșantionul de depășire', () => {
  const precondition = estimate(rightPassForbiddenEpisodes()).keys.pass_on_right_probability;
  assert.equal(precondition.status, 'UNOBSERVED');
  assert.equal(precondition.value, null);
  assert.equal(precondition.reason, 'RIGHT_PASS_PRECONDITION');
  assert.equal(precondition.excluded.RIGHT_PASS_PRECONDITION, 4);
  // No sample is taken at all: the refusal is a precondition, not a denied draw.
  for (const episode of rightPassForbiddenEpisodes())
    for (const sample of episode.samples) {
      assert.equal(sample.rightOvertakeSample, null);
      assert.equal(sample.rightOvertakeGranted, null);
    }

  const grantsOnly = estimate(rightPassGrantOnlyEpisodes()).keys.pass_on_right_probability;
  assert.equal(grantsOnly.status, 'UNOBSERVED');
  assert.equal(grantsOnly.reason, 'RIGHT_PASS_UPPER_BOUND_UNOBSERVED');

  const refusalsOnly = estimate(rightPassRefusalOnlyEpisodes()).keys.pass_on_right_probability;
  assert.equal(refusalsOnly.status, 'UNOBSERVED');
  assert.equal(refusalsOnly.reason, 'RIGHT_PASS_LOWER_BOUND_UNOBSERVED');

  const contradictory = estimate(rightPassContradictoryEpisodes()).keys.pass_on_right_probability;
  assert.equal(contradictory.status, 'UNOBSERVED');
  assert.equal(contradictory.value, null);
  assert.equal(contradictory.reason, 'CONTRADICTORY_RIGHT_PASS_BOUNDS');
  assert.equal(contradictory.excluded.CONTRADICTORY_RIGHT_PASS_BOUNDS, 4);
});

test('178 nicio cheie nu inventează o valoare', () => {
  const scenarios = [
    positiveEpisodes(),
    durationEpisodes(),
    leadEpisodes(),
    indicatorEpisodes(),
    rightPassEpisodes(),
    zeroLeadEpisodes(),
    zeroIndicatorEpisodes(),
    alternatingIndicatorEpisodes(),
    durationEpisodes([0.5, 0.5, 1, 1], { idPrefix: 'floor', from: 500 }),
    durationEpisodes([0.5, 2, 0.5, 2], { idPrefix: 'mixed', from: 600 }),
    durationEpisodes([1.5, 2.5, 3.5, 4.5], { idPrefix: 'noisy', from: 700 }),
    leadEpisodes([1.5, 2.5, 3.5, 4.5], { idPrefix: 'lead-noisy', from: 800 }),
    rightPassGrantOnlyEpisodes(),
    rightPassRefusalOnlyEpisodes(),
    rightPassContradictoryEpisodes(),
    wideRightPassEpisodes(),
    rightPassForbiddenEpisodes(),
    manualEpisodes(),
    [],
  ];
  let unobserved = 0;
  for (const episodes of scenarios) {
    const result = estimate(episodes);
    for (const key of LANE_V2_ESTIMATOR_KEYS) {
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

test('178 constrângerile de grup numesc canalele comune și plafoanele neidentificabile', () => {
  const { groupConstraints } = estimate(positiveEpisodes());
  assert.equal(groupConstraints.length, 5);
  assert.deepEqual(
    groupConstraints.map((entry) => entry.id),
    [
      'DURATION_FLOOR_HIDES_SUB_SECOND',
      'MANOEUVRE_TIMELINE_SHARED',
      'SIGNAL_LEAD_DEPENDS_ON_INDICATOR',
      'RIGHT_PASS_REFUSAL_PRECEDES_SAMPLE',
      'LANE_KEYS_FROM_ONE_MANOEUVRE',
    ],
  );
  for (const entry of groupConstraints) {
    assert(entry.explanation.length > 40);
    assert(entry.keys.every((key) => LANE_V2_ESTIMATOR_KEYS.includes(key)));
  }
  assert.deepEqual([...groupConstraints[4]!.keys], [...LANE_POLICY_V2_KEYS]);
});

test('178 intrările invalide și episoadele neeligibile sunt refuzate, niciodată măsurate', () => {
  const episode = durationEpisodes()[0]!;
  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [
            { ...episode.samples[0]!, lateralProgress: Number.NaN },
            ...episode.samples.slice(1),
          ],
        },
      ]),
    /lane evidence/i,
  );
  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [
            { ...episode.samples[0]!, reason: 'NOT_A_177_REASON' as never },
            ...episode.samples.slice(1),
          ],
        },
      ]),
    /lane evidence/i,
  );
  assert.throws(
    () =>
      estimate([
        {
          ...episode,
          samples: [{ ...episode.samples[0]!, tick: -1 }, ...episode.samples.slice(1)],
        },
      ]),
    /lane evidence/i,
  );

  const duplicate = estimate([episode, episode]);
  assert.deepEqual(duplicate.refusedEpisodes, [
    { episodeId: episode.episodeId, reason: 'DUPLICATE_EPISODE' },
  ]);

  const manual = estimate(manualEpisodes());
  assert.equal(manual.refusedEpisodes.length, 4);
  assert(manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE'));
  assert.equal(manual.keys.lane_change_duration.reason, 'NO_ELIGIBLE_EPISODES');

  const unusable = {
    ...episode,
    artifacts: { ...episode.artifacts, windowClass: 'FULLY_SUPPRESSED', prefix: null },
  } as LaneV2EvidenceEpisode;
  assert.deepEqual(estimate([unusable]).refusedEpisodes, [
    { episodeId: episode.episodeId, reason: 'NO_USABLE_PREFIX' },
  ]);

  assert.throws(() => estimateLaneV2Style({ episodes: [], splitSeed: -1 }), /split seed/i);
  assert.throws(
    () => estimateLaneV2Style({ episodes: [], splitSeed: 4_294_967_296 }),
    /split seed/i,
  );

  const truncated = {
    ...episode,
    artifacts: { ...episode.artifacts, prefix: { fromTick: 0, toTick: 0, ticks: 1 } },
  } as LaneV2EvidenceEpisode;
  assert.equal(
    estimate([truncated]).keys.lane_change_duration.reason,
    'NO_MANOEUVRE_DURATION_EPISODE',
  );

  assert.throws(
    () => estimate([{ ...episode, samples: [...episode.samples].reverse() }]),
    /strictly ordered/i,
  );
});

test('178 estimarea este deterministă și înghețată', () => {
  const first = estimate(positiveEpisodes()),
    second = estimate(positiveEpisodes());
  assert.equal(digest(first), digest(second));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.keys), true);
  assert.equal(Object.isFrozen(first.keys.lane_change_duration), true);
  assert.equal(Object.isFrozen(first.groupConstraints), true);
  assert.equal(first.version, '178-lane-estimator-v2');
  assert.equal(first.splitSeed, seed);
  assert.equal(first.compatibility.candidateOnly, true);
  assert.equal(first.compatibility.changesPolicySemantics, false);
});

test('178 candidații respectă catalogul 092 și păstrează unitatea registrului', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of LANE_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key],
      definition = getParameterDefinition(key);
    assert.equal(entry.unit, definition.unit);
    assert.equal(entry.clamped, false);
    assert(entry.value! >= definition.min && entry.value! <= definition.max);
  }
  const ranges = positive.compatibility.catalogRanges;
  assert.deepEqual(LANE_V2_ESTIMATOR_KEYS, LANE_POLICY_V2_KEYS);
  assert.equal(ranges.lane_change_duration.min, 0.5);
  assert.equal(ranges.lane_change_duration.max, 5);
  assert.equal(ranges.signal_lead_time.min, 0);
  assert.equal(ranges.signal_lead_time.max, 5);
  assert.equal(ranges.signal_use_probability.min, 0);
  assert.equal(ranges.signal_use_probability.max, 1);
  assert.equal(ranges.pass_on_right_probability.min, 0);
  assert.equal(ranges.pass_on_right_probability.max, 1);
  assert.equal(positive.compatibility.policyVersion, LANE_POLICY_V2_LIMITS.version);
  assert.equal(
    positive.compatibility.minimumManoeuvreDurationS,
    LANE_POLICY_V2_LIMITS.minimumManoeuvreDurationS,
  );
  assert.equal(positive.compatibility.tickHz, LANE_POLICY_V2_LIMITS.tickHz);
  assert.deepEqual(
    [...positive.compatibility.mReadByPolicy],
    [
      'lane_change_front_gap',
      'lane_change_back_gap',
      'lane_change_speed_gain',
      'lane_change_cooldown',
    ],
  );
});

test('178 estimările sunt consumate de 177 fără schimbare de semantică', () => {
  const positive = estimate(positiveEpisodes()),
    values = Object.fromEntries(
      LANE_V2_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    );

  // lane_change_duration: the estimated second still yields the same 120 effective ticks.
  const progress = progressAfterStart(leftScene, {
      rValues: { signal_use_probability: 0, lane_change_duration: values.lane_change_duration },
      advanceTicks: 30,
    }),
    started = progress.started;
  assert.equal(started.reason, 'CHANGE_WITHOUT_SIGNAL');
  assert.equal(progress.durationTicks, 120);
  assert.equal(progress.progress, 30 / 120);

  // signal_lead_time: the estimated lead still holds the movement for exactly 120 ticks.
  const delayed = run(leftScene, {
      rValues: {
        signal_use_probability: 1,
        signal_lead_time: values.signal_lead_time,
        lane_change_duration: values.lane_change_duration,
      },
      opportunityKey: indicatorOn(0)[0]!.opportunityKey,
      ticks: 400,
      stopWhen: (command) => command.action === 'LANE_CHANGE',
    }),
    leadTicks = delayed.commands.length - 1;
  assert.equal(delayed.commands[0]!.reason, 'SIGNAL_LEAD');
  assert.equal(delayed.commands[0]!.lateralProgress, 0);
  assert.equal(leadTicks, 120);
  assert.equal(delayed.commands[leadTicks]!.reason, 'SIGNAL_LEAD_COMPLETE');

  // signal_use_probability: the estimated rate does not flip a sampled opportunity.
  const on = indicatorOn(0)[0]!,
    off = indicatorOff(0)[0]!,
    used = evaluate(leftScene, {
      rValues: { ...values, signal_use_probability: values.signal_use_probability },
      opportunityKey: on.opportunityKey,
    }).command,
    unused = evaluate(leftScene, {
      rValues: { ...values, signal_use_probability: values.signal_use_probability },
      opportunityKey: off.opportunityKey,
    }).command;
  assert.equal(used.signalUsed, on.sample < values.signal_use_probability!);
  assert.equal(unused.signalUsed, off.sample < values.signal_use_probability!);

  // pass_on_right_probability: the estimated bracket grants the low draw and refuses the high one.
  const granted = evaluate(rightScene, {
      rValues: { ...values, signal_use_probability: 0 },
      opportunityKey: rightPassGrant(0).opportunityKey,
    }).command,
    refused = evaluate(rightScene, {
      rValues: { ...values, signal_use_probability: 0 },
      opportunityKey: rightPassRefusal(0).opportunityKey,
    }).command;
  assert.equal(granted.rightOvertakeGranted, true);
  assert.equal(granted.action, 'LANE_CHANGE');
  assert.equal(refused.rightOvertakeGranted, false);
  assert.equal(refused.reason, 'RIGHT_OVERTAKE_REFUSED');
});
