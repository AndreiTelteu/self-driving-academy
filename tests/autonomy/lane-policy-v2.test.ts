import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LANE_POLICY_V2_KEYS,
  LANE_POLICY_V2_LIMITS,
  LANE_POLICY_V2_M_KEYS,
  compileLanePolicyProfile,
  evaluateLanePolicyV2,
  getLanePolicyV2Stats,
} from '../../src/autonomy/lane-policy-v2';
import type { LanePolicyV2Input } from '../../src/autonomy/lane-policy-v2';
import { LANE_CHANGE_EMPTY_STATE } from '../../src/autonomy/lane-change-policy';
import { getParameterDefinition } from '../../src/profiles';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import { deriveOpportunitySeed, randomUnit } from '../../src/sessions';
import {
  SEED,
  evaluate,
  evaluateLaneChange053,
  laneOpportunity,
  lanePolicyDocument,
  lanePolicyMValues,
  lanePolicyObservation,
  lanePolicyProfile,
  progressAfterStart,
  rightPassOpportunity,
  rightPassSample,
  run,
  scenario,
  signalUseSample,
} from './lane-policy-v2-reference';
import type { LanePolicyScene } from './lane-policy-v2-reference';
import { projectLaneChangeProfile } from '../../src/autonomy/lane-change-policy';

const opportunity = laneOpportunity(0),
  passOpportunity = rightPassOpportunity(0),
  noSignal = { signal_use_probability: 0 } as const,
  leftScene: LanePolicyScene = {
    currentLaneId: 'lane-a',
    lanes: [{ laneId: 'lane-left', side: 'LEFT' }],
    targetLaneId: 'lane-left',
    overtake: true,
    rightOvertake: 'UNKNOWN',
    rightLaneSpaceM: null,
    coverage: 'COMPLETE',
    frontGapM: 20,
    backGapM: 18,
    targetLaneSpeedMps: 12,
    speedMps: 8,
    ownLaneLeaderSpeedMps: 6,
    intent: 'OPTIONAL_OVERTAKE',
  },
  rightScene: LanePolicyScene = {
    ...leftScene,
    lanes: [{ laneId: 'lane-right', side: 'RIGHT' }],
    targetLaneId: 'lane-right',
    rightOvertake: 'PERMITTED',
    rightLaneSpaceM: 30,
  },
  activeValues = {
    lane_change_duration: 5,
    signal_lead_time: 5,
    signal_use_probability: 1,
    pass_on_right_probability: 1,
  } as const;

test('177 compileLanePolicyProfile reads the four R and four M keys with the certified capability', () => {
  assert.deepEqual(LANE_POLICY_V2_KEYS, [
    'lane_change_duration',
    'signal_lead_time',
    'signal_use_probability',
    'pass_on_right_probability',
  ]);
  assert.deepEqual(LANE_POLICY_V2_M_KEYS, [
    'lane_change_front_gap',
    'lane_change_back_gap',
    'lane_change_speed_gain',
    'lane_change_cooldown',
  ]);
  const profile = lanePolicyProfile(
    { lane_change_duration: 3.5, signal_lead_time: 2, signal_use_probability: 0.4 },
    { lane_change_front_gap: 20, lane_change_cooldown: 8 },
  );
  assert.equal(profile.version, '177-lane-policy-v2');
  assert.equal(profile.values.lane_change_duration, 3.5);
  assert.equal(profile.values.signal_lead_time, 2);
  assert.equal(profile.values.signal_use_probability, 0.4);
  assert.equal(profile.values.pass_on_right_probability, 0);
  assert.equal(profile.mValues.lane_change_front_gap, 20);
  assert.equal(profile.mValues.lane_change_cooldown, 8);
  assert.deepEqual(profile.units, {
    lane_change_duration: 's',
    signal_lead_time: 's',
    signal_use_probability: 'probability',
    pass_on_right_probability: 'probability',
  });
  assert.deepEqual(profile.provenance, {
    lane_change_duration: 'BASE',
    signal_lead_time: 'BASE',
    signal_use_probability: 'BASE',
    pass_on_right_probability: 'BASE',
  });
  assert(Object.isFrozen(profile));
  assert(Object.isFrozen(profile.values));
  // The capability comes from the certified 187 gate table, never from reading a key.
  for (const key of LANE_POLICY_V2_KEYS) {
    const definition = getParameterDefinition(key);
    assert.equal(definition.unit, key.endsWith('_probability') ? 'probability' : 's');
    assert.equal(definition.implemented, true);
  }
  assert.deepEqual(getLanePolicyV2Stats(), {
    compiling: false,
    evaluating: false,
    retainedHistory: 0,
  });
});

test('177 rejects a missing key, a wrong unit and an out-of-range value before any decision', () => {
  const document = lanePolicyDocument();
  assert.throws(
    () =>
      compileLanePolicyProfile({
        ...document,
        parameters: { ...lanePolicyMValues },
        unitsByParameter: {
          lane_change_front_gap: 'm',
          lane_change_back_gap: 'm',
          lane_change_speed_gain: 'm/s',
          lane_change_cooldown: 's',
        },
        provenanceByParameter: {
          lane_change_front_gap: 'BASE',
          lane_change_back_gap: 'BASE',
          lane_change_speed_gain: 'BASE',
          lane_change_cooldown: 'BASE',
        },
        evidenceByParameter: {
          lane_change_front_gap: null,
          lane_change_back_gap: null,
          lane_change_speed_gain: null,
          lane_change_cooldown: null,
        },
      }),
    /Missing lane policy v2 parameter/,
  );
  assert.throws(
    () =>
      compileLanePolicyProfile({
        ...document,
        unitsByParameter: { ...document.unitsByParameter, lane_change_duration: 'm' },
      }),
    /Wrong unit for parameter: lane_change_duration/,
  );
  assert.throws(
    () => lanePolicyProfile({ lane_change_duration: 0.4 }),
    /Expected finite number in range/,
  );
  assert.throws(
    () => lanePolicyProfile({ signal_lead_time: 6 }),
    /Expected finite number in range/,
  );
  assert.throws(
    () => lanePolicyProfile({ pass_on_right_probability: 1.5 }),
    /Expected finite number in range/,
  );
});

test('177 lane_change_duration changes the lateral progress in its own episode', () => {
  const short = progressAfterStart(leftScene, {
      rValues: { ...noSignal, lane_change_duration: 0.5 },
      advanceTicks: 30,
    }),
    long = progressAfterStart(leftScene, {
      rValues: { ...noSignal, lane_change_duration: 5 },
      advanceTicks: 30,
    });
  assert.equal(short.started.reason, 'CHANGE_WITHOUT_SIGNAL');
  assert.equal(short.started.lateralProgress, 0);
  assert.equal(short.durationTicks, 60);
  assert.equal(long.durationTicks, 300);
  assert.equal(short.progress, 0.5);
  assert.equal(long.progress, 0.1);
  assert(short.progress > long.progress);
});

test('177 lane_change_duration never produces an instantaneous manoeuvre', () => {
  const atMinimum = progressAfterStart(leftScene, {
      rValues: { ...noSignal, lane_change_duration: 0.5 },
      advanceTicks: 0,
    }),
    first = progressAfterStart(leftScene, {
      rValues: { ...noSignal, lane_change_duration: 0.5 },
      advanceTicks: 1,
    });
  // The catalog minimum of 0.5 s is floored to one second: the manoeuvre lasts at least 60 ticks.
  assert.equal(atMinimum.durationTicks, LANE_POLICY_V2_LIMITS.minimumManoeuvreDurationS * 60);
  assert.equal(atMinimum.started.manoeuvreElapsedTicks, 0);
  assert.equal(atMinimum.started.lateralProgress, 0);
  assert.equal(first.progress, 1 / 60);
  assert(first.progress < 1);
  // A zero-duration key is not admissible at all.
  assert.throws(() => lanePolicyProfile({ lane_change_duration: 0 }), /Expected finite number/);
});

test('177 signal_use_probability switches the indicator on its own opportunity sample', () => {
  const off = evaluate(leftScene, {
      rValues: { ...noSignal, signal_use_probability: 0 },
      opportunityKey: opportunity.opportunityKey,
    }),
    on = evaluate(leftScene, {
      rValues: { ...noSignal, signal_use_probability: 1 },
      opportunityKey: opportunity.opportunityKey,
    });
  assert.equal(off.command.signalUsed, false);
  assert.equal(off.command.indicator, 'NONE');
  assert.equal(off.command.reason, 'CHANGE_WITHOUT_SIGNAL');
  assert.equal(on.command.signalUsed, true);
  assert.equal(on.command.indicator, 'LEFT');
  // The sample is addressed by the identity of the opportunity, never by the tick.
  const repeated = evaluate(leftScene, {
    rValues: { ...noSignal, signal_use_probability: 1 },
    opportunityKey: opportunity.opportunityKey,
    tick: scenario.tick + 5,
  });
  assert.equal(repeated.command.signalUsed, true);
  assert.equal(signalUseSample(opportunity.opportunityKey), opportunity.signalSample);
  assert(opportunity.signalSample < 1);
  const partial = evaluate(leftScene, {
    rValues: { ...noSignal, signal_use_probability: 0.1 },
    opportunityKey: opportunity.opportunityKey,
  });
  assert.equal(partial.command.signalUsed, opportunity.signalSample < 0.1);
});

test('177 signal_lead_time delays the manoeuvre only after an indicator is used', () => {
  const immediate = run(leftScene, {
      rValues: { signal_use_probability: 1, signal_lead_time: 0 },
      opportunityKey: opportunity.opportunityKey,
      ticks: 2,
      stopWhen: (command) => command.action === 'LANE_CHANGE',
    }),
    delayed = run(leftScene, {
      rValues: { signal_use_probability: 1, signal_lead_time: 5 },
      opportunityKey: opportunity.opportunityKey,
      ticks: 320,
      stopWhen: (command) => command.action === 'LANE_CHANGE',
    }),
    delayTicks = delayed.commands.length - 1;
  assert.equal(immediate.commands[0].action, 'LANE_CHANGE');
  assert.equal(immediate.commands[0].reason, 'SIGNAL_IMMEDIATE');
  assert.equal(delayed.commands[0].action, 'SIGNAL_ONLY');
  assert.equal(delayed.commands[0].reason, 'SIGNAL_LEAD');
  assert.equal(delayed.commands[0].lateralProgress, 0);
  assert.equal(delayed.commands[0].signalRemainingTicks, 300);
  assert.equal(delayed.commands[299].reason, 'SIGNAL_LEAD');
  assert.equal(delayed.commands[299].lateralProgress, 0);
  assert.equal(delayTicks, 300);
  assert.equal(delayed.commands[delayTicks].reason, 'SIGNAL_LEAD_COMPLETE');
  assert.equal(delayed.commands[delayTicks].lateralProgress, 0);
});

test('177 the signalling lead can never start a manoeuvre on stale 053 continuity', () => {
  // The caller latches 053 from the first validated tick, so the lead keeps seeing continuity.
  const first = evaluate(leftScene, {
      rValues: { signal_use_probability: 1, signal_lead_time: 2 },
      opportunityKey: opportunity.opportunityKey,
    }),
    continuity = evaluateLaneChange053(
      leftScene,
      projectLaneChangeProfile(parsePublishableDrivingProfile(lanePolicyDocument())),
      first.decisionTick + 1,
      first.change.state,
    ),
    next = evaluate(leftScene, {
      rValues: { signal_use_probability: 1, signal_lead_time: 2 },
      opportunityKey: opportunity.opportunityKey,
      tick: first.decisionTick + 1,
      state: first.command.state,
      laneChange: continuity,
    });
  assert.equal(first.command.action, 'SIGNAL_ONLY');
  assert.equal(first.command.reason, 'SIGNAL_LEAD');
  assert.equal(continuity.action, 'CHANGE');
  assert.equal(continuity.reason, 'COMMITTED_CONTINUITY');
  assert.equal(next.command.action, 'SIGNAL_ONLY');
  assert.equal(next.command.reason, 'SIGNAL_LEAD_STALE');
  assert.equal(next.command.lateralProgress, 0);
  assert.equal(next.command.state.manoeuvreStartTick, null);
});

test('177 pass_on_right_probability is subordinate to the map and the declared space', () => {
  const refused = evaluate(rightScene, {
      rValues: { ...noSignal, pass_on_right_probability: 0 },
      opportunityKey: passOpportunity.opportunityKey,
    }),
    granted = evaluate(rightScene, {
      rValues: { ...noSignal, pass_on_right_probability: 1 },
      opportunityKey: passOpportunity.opportunityKey,
    });
  assert.equal(refused.command.rightOvertakeRequested, true);
  assert.equal(refused.command.rightOvertakePermitted, true);
  assert.equal(refused.command.rightOvertakeSample, passOpportunity.passSample);
  assert.equal(refused.command.rightOvertakeGranted, false);
  assert.equal(refused.command.reason, 'RIGHT_OVERTAKE_REFUSED');
  assert.equal(refused.command.action, 'NO_CHANGE');
  assert.equal(granted.command.rightOvertakeGranted, true);
  assert.equal(granted.command.action, 'LANE_CHANGE');
  assert.equal(rightPassSample(passOpportunity.opportunityKey), passOpportunity.passSample);

  for (const scene of [
    { ...rightScene, rightOvertake: 'FORBIDDEN' as const },
    { ...rightScene, rightOvertake: 'UNKNOWN' as const },
    { ...rightScene, rightLaneSpaceM: 8 },
    { ...rightScene, rightLaneSpaceM: null },
  ]) {
    for (const key of [0, 1]) {
      const row = evaluate(scene, {
        rValues: { ...noSignal, pass_on_right_probability: key },
        opportunityKey: passOpportunity.opportunityKey,
      });
      assert.equal(row.command.action, 'NO_CHANGE');
      assert.notEqual(row.command.reason, 'RIGHT_OVERTAKE_REFUSED');
      // The refusal precedes the sample: no draw is taken for a forbidden or too-tight pass.
      assert.equal(row.command.rightOvertakeSample, null);
      assert.equal(row.command.rightOvertakeGranted, null);
    }
  }
  assert.equal(
    evaluate(
      { ...rightScene, rightOvertake: 'FORBIDDEN' },
      {
        rValues: { ...noSignal, pass_on_right_probability: 1 },
        opportunityKey: passOpportunity.opportunityKey,
      },
    ).command.reason,
    'RIGHT_OVERTAKE_FORBIDDEN',
  );
  assert.equal(
    evaluate(
      { ...rightScene, rightLaneSpaceM: 11.9 },
      {
        rValues: { ...noSignal, pass_on_right_probability: 1 },
        opportunityKey: passOpportunity.opportunityKey,
      },
    ).command.reason,
    'RIGHT_OVERTAKE_NO_SPACE',
  );
  // A left change is never a right pass, whatever the key says.
  const left = evaluate(leftScene, {
    rValues: { ...noSignal, pass_on_right_probability: 1 },
    opportunityKey: passOpportunity.opportunityKey,
  });
  assert.equal(left.command.rightOvertakeRequested, false);
  assert.equal(left.command.rightOvertakeGranted, null);
  assert.equal(left.command.action, 'LANE_CHANGE');
  // A route-required change into the right lane is not an overtake, so the key stays inert.
  const route = evaluate(
    { ...rightScene, overtake: false },
    {
      rValues: { ...noSignal, pass_on_right_probability: 1 },
      opportunityKey: passOpportunity.opportunityKey,
    },
  );
  assert.equal(route.command.rightOvertakeRequested, false);
  assert.equal(route.command.action, 'LANE_CHANGE');
});

test('177 a 053 refusal or an unknown result is forwarded and starts nothing', () => {
  const refused = evaluate({ ...leftScene, frontGapM: 4 }, { rValues: activeValues }),
    localOnly = evaluate({ ...leftScene, coverage: 'LOCAL_ONLY' }, {}),
    noIntent = evaluate({ ...leftScene, intent: 'NONE' }, {}),
    unknownChange = evaluateLaneChange053(leftScene, null),
    unknownLayer = evaluate(leftScene, { laneChange: unknownChange });
  assert.equal(refused.change.reason, 'INSUFFICIENT_FRONT_GAP');
  assert.equal(refused.command.action, 'NO_CHANGE');
  assert.equal(refused.command.reason, 'NO_LANE_CHANGE');
  assert.equal(refused.command.laneChangeReason, 'INSUFFICIENT_FRONT_GAP');
  assert.equal(refused.command.manoeuvreStartTick, null);
  assert.equal(localOnly.command.action, 'NO_CHANGE');
  assert.equal(localOnly.command.reason, 'NO_LANE_CHANGE');
  assert.equal(noIntent.command.reason, 'NO_LANE_CHANGE');
  assert.equal(unknownChange.action, 'UNKNOWN');
  assert.equal(unknownLayer.command.action, 'UNKNOWN');
  assert.equal(unknownLayer.command.reason, 'LANE_CHANGE_UNAVAILABLE');
});

test('177 rejects a foreign profile, observation, 053 result and mismatched M values', () => {
  const input = (): LanePolicyV2Input => evaluate(leftScene).input,
    foreignProfile = compileLanePolicyProfile(lanePolicyDocument({}, {}, 'other-v1')),
    changeFromOtherVersion = evaluateLaneChange053(
      leftScene,
      projectLaneChangeProfile(
        parsePublishableDrivingProfile(lanePolicyDocument({}, {}, 'other-v1')),
      ),
    );
  assert.throws(
    () => evaluateLanePolicyV2({ ...input(), profile: { ...lanePolicyProfile() } }),
    /Lane policy v2 profile token provenance/,
  );
  assert.equal(
    evaluateLanePolicyV2({ ...input(), laneChange: changeFromOtherVersion }).reason,
    'LANE_CHANGE_PROFILE_MISMATCH',
  );
  assert.equal(foreignProfile.versionId, 'other-v1');
  assert.equal(
    evaluateLanePolicyV2({
      ...input(),
      observation: { ...lanePolicyObservation(leftScene), tick: scenario.tick - 1 },
    }).reason,
    'FOREIGN_OR_STALE_OBSERVATION',
  );
  assert.equal(
    evaluateLanePolicyV2({
      ...input(),
      observation: { ...lanePolicyObservation(leftScene), sessionId: 'other-session' },
    }).reason,
    'FOREIGN_OR_STALE_OBSERVATION',
  );
  assert.equal(
    evaluateLanePolicyV2({ ...input(), laneChange: null }).reason,
    'LANE_CHANGE_UNAVAILABLE',
  );
  assert.equal(
    evaluateLanePolicyV2({
      ...input(),
      laneChange: evaluate(leftScene, { tick: scenario.tick + 1 }).change,
    }).reason,
    'FOREIGN_OR_STALE_LANE_CHANGE',
  );
  // The 053 result carries the M values, so a profile with another front gap cannot admit it.
  const fromTwenty = evaluate(leftScene, { mValues: { lane_change_front_gap: 20 } }).change,
    mismatch = evaluate(leftScene, {
      mValues: { lane_change_front_gap: 25 },
      laneChange: fromTwenty,
    });
  assert.equal(fromTwenty.requiredFrontGapM, 20);
  assert.equal(mismatch.command.reason, 'LANE_CHANGE_M_PROFILE_MISMATCH');
  assert.equal(mismatch.command.action, 'UNKNOWN');
});

test('177 keeps the caller-held latch and completes the manoeuvre exactly once', () => {
  const options = {
      rValues: { ...noSignal, lane_change_duration: 1 },
      opportunityKey: opportunity.opportunityKey,
    },
    started = evaluate(leftScene, options),
    midway = evaluate(leftScene, {
      ...options,
      tick: started.decisionTick + 30,
      state: started.command.state,
    }),
    finished = evaluate(leftScene, {
      ...options,
      tick: started.decisionTick + 60,
      state: started.command.state,
    }),
    abandoned = evaluate(leftScene, {
      ...options,
      tick: started.decisionTick + 10,
      state: started.command.state,
      laneChange: evaluate({ ...leftScene, frontGapM: 4 }, { tick: started.decisionTick + 10 })
        .change,
    });
  assert.equal(started.command.action, 'LANE_CHANGE');
  assert.equal(started.command.state.manoeuvreStartTick, started.decisionTick);
  assert.equal(midway.command.reason, 'MANOEUVRE_IN_PROGRESS');
  assert.equal(midway.command.lateralProgress, 0.5);
  assert.equal(midway.command.manoeuvreRemainingTicks, 30);
  assert.equal(finished.command.reason, 'MANOEUVRE_COMPLETE');
  assert.equal(finished.command.action, 'NO_CHANGE');
  assert.equal(finished.command.lateralProgress, 1);
  assert.equal(finished.command.state.targetLaneId, null);
  assert.equal(abandoned.command.reason, 'MANOEUVRE_ABANDONED');
  assert.equal(abandoned.command.action, 'NO_CHANGE');
  assert.equal(abandoned.command.state.targetLaneId, null);
  // A state that cannot exist is refused before it is trusted.
  assert.throws(
    () =>
      evaluate(leftScene, {
        tick: started.decisionTick + 1,
        state: {
          targetLaneId: 'lane-left',
          signalTick: null,
          signalUsed: false,
          manoeuvreStartTick: null,
        },
      }),
    /state cannot contradict/,
  );
  assert.equal(LANE_CHANGE_EMPTY_STATE.committed, null);
});

test('177 keeps the delivered 053 results with the four M keys unchanged', () => {
  const scenes: readonly LanePolicyScene[] = [
      leftScene,
      { ...leftScene, frontGapM: 4 },
      { ...leftScene, coverage: 'LOCAL_ONLY' },
      { ...leftScene, targetLaneId: 'lane-absent' },
      { ...rightScene, overtake: false },
    ],
    active: Readonly<Record<keyof typeof activeValues, number>> = activeValues;
  let identical = 0,
    forwarded = 0,
    differing = 0;
  for (let tick = 1; tick <= 60; tick++) {
    const scene = scenes[(tick - 1) % scenes.length],
      decisionTick = scenario.tick + tick,
      neutral = evaluate(scene, { tick: decisionTick }),
      live = evaluate(scene, { tick: decisionTick, rValues: active });
    if (JSON.stringify(neutral.change) === JSON.stringify(live.change)) identical += 1;
    // The neutral configuration forwards the delivered 053 decision unchanged.
    if (
      neutral.command.action === (neutral.change.action === 'CHANGE' ? 'LANE_CHANGE' : 'NO_CHANGE')
    )
      forwarded += 1;
    if (
      live.command.action !== neutral.command.action ||
      live.command.signalUsed !== neutral.command.signalUsed ||
      live.command.lateralProgress !== neutral.command.lateralProgress
    )
      differing += 1;
  }
  assert.equal(identical, 60);
  assert.equal(forwarded, 60);
  assert(differing > 0);
  for (const key of LANE_POLICY_V2_M_KEYS)
    assert.equal(lanePolicyMValues[key], getParameterDefinition(key).default);
});

test('177 is deterministic, frozen and keeps no history', () => {
  const values = {
      lane_change_duration: 3,
      signal_lead_time: 2,
      signal_use_probability: 1,
      pass_on_right_probability: 1,
    },
    first = evaluate(rightScene, {
      rValues: values,
      opportunityKey: passOpportunity.opportunityKey,
    }),
    second = evaluate(rightScene, {
      rValues: values,
      opportunityKey: passOpportunity.opportunityKey,
    });
  assert.equal(JSON.stringify(first.command), JSON.stringify(second.command));
  assert(Object.isFrozen(first.command));
  assert(Object.isFrozen(first.command.state));
  assert.equal(first.command.retainedHistory, 0);
  assert.equal(first.command.version, LANE_POLICY_V2_LIMITS.version);
  assert.equal(first.command.units, 'SI');
  // The addressing is the 006 seed plus the opportunity identity, never wall-clock time.
  assert.equal(
    randomUnit(deriveOpportunitySeed(SEED, passOpportunity.opportunityKey), 'pass-on-right', 0),
    passOpportunity.passSample,
  );
});
