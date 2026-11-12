import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SIGNAL_POLICY_V2_KEYS,
  SIGNAL_POLICY_V2_LIMITS,
  SIGNAL_POLICY_V2_M_KEYS,
  compileSignalPolicyV2Profile,
  evaluateSignalPolicyV2,
  getSignalPolicyV2Stats,
} from '../../src/autonomy/signal-policy-v2';
import type { SignalPolicyV2Input } from '../../src/autonomy/signal-policy-v2';
import { evaluateSignalPolicy, projectSignalProfile } from '../../src/autonomy/signal-policy';
import { getParameterDefinition } from '../../src/profiles';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import {
  SEED,
  evaluate,
  findYellowOpportunity,
  opportunityKeyFor,
  scenario,
  signal050Observation,
  signalPolicyV2Document,
  signalV2Observation,
  signalV2Profile,
  signalMValues,
} from './signal-policy-v2-reference';
import type { SignalV2Scene } from './signal-policy-v2-reference';

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance;
const yellowFeasibilityScene: SignalV2Scene = {
  state: 'YELLOW',
  speed: 8,
  distanceToStopLineM: 64,
  phaseRemainingS: 10,
  conflictGapS: null,
};
const yellowCommitScene: SignalV2Scene = {
  state: 'YELLOW',
  speed: 8,
  distanceToStopLineM: 8,
  phaseRemainingS: 6,
  conflictGapS: null,
};
const redRunScene: SignalV2Scene = {
  state: 'RED',
  speed: 8,
  distanceToStopLineM: 10,
  phaseRemainingS: 10,
  conflictGapS: 5,
};
const greenLaunchScene: SignalV2Scene = {
  state: 'GREEN',
  speed: 0,
  distanceToStopLineM: 20,
  phaseRemainingS: 20,
  conflictGapS: null,
};
const probabilityOpportunity = findYellowOpportunity((sample) => sample >= 0.2 && sample < 0.99);
function stopRate(probability: number): number {
  let stops = 0;
  for (let index = 0; index < 120; index++) {
    const row = evaluate(yellowFeasibilityScene, {
      tick: scenario.tick + index,
      opportunityKey: opportunityKeyFor(1000 + index * 17),
      rValues: { yellow_stop_probability: probability },
    });
    if (row.command.stopRequested) stops++;
  }
  return stops / 120;
}
function baseInput(scene: SignalV2Scene = yellowFeasibilityScene): SignalPolicyV2Input {
  const base = evaluate(scene, {
    tick: scenario.tick,
    opportunityKey: probabilityOpportunity.opportunityKey,
  });
  return {
    ...scenario.scope,
    actor: scenario.actor,
    decisionTick: base.decisionTick,
    authority: 'AUTO',
    seed: SEED,
    opportunityKey: base.opportunityKey,
    profile: base.profile,
    signal: base.signal,
    observation: signalV2Observation(scene, base.decisionTick),
  };
}

test('173 compileSignalPolicyV2Profile reads the four R and four M keys without granting support', () => {
  assert.deepEqual(SIGNAL_POLICY_V2_KEYS, [
    'yellow_stop_probability',
    'red_run_gap_acceptance',
    'yellow_commit_time',
    'green_launch_acceleration',
  ]);
  assert.deepEqual(SIGNAL_POLICY_V2_M_KEYS, [
    'red_stop_probability',
    'green_start_delay',
    'red_stop_line_offset',
    'late_red_brake_threshold',
  ]);
  const profile = signalV2Profile(
      { yellow_stop_probability: 0.25, red_run_gap_acceptance: 4 },
      { red_stop_probability: 0.5 },
    ),
    values = profile.values;
  assert.equal(values.yellow_stop_probability, 0.25);
  assert.equal(values.red_run_gap_acceptance, 4);
  assert.equal(values.yellow_commit_time, 0.2);
  assert.equal(values.green_launch_acceleration, 0.2);
  assert.equal(getParameterDefinition('yellow_commit_time').default, 2);
  assert.equal(getParameterDefinition('green_launch_acceleration').default, 1.5);
  assert.equal(profile.mValues.red_stop_probability, 0.5);
  assert.equal(profile.mValues.green_start_delay, 0.7);
  assert.equal(profile.mValues.red_stop_line_offset, 1);
  assert.equal(profile.mValues.late_red_brake_threshold, 2);
  assert.equal(profile.units.yellow_stop_probability, 'probability');
  assert.equal(profile.units.red_run_gap_acceptance, 's');
  assert.equal(profile.units.yellow_commit_time, 's');
  assert.equal(profile.units.green_launch_acceleration, 'm/s²');
  assert.equal(profile.mUnits.red_stop_probability, 'probability');
  assert.equal(profile.mUnits.red_stop_line_offset, 'm');
  for (const key of SIGNAL_POLICY_V2_KEYS) {
    assert.equal(profile.provenance[key], 'BASE');
    assert.equal(getParameterDefinition(key).implemented, false);
    assert.equal(getParameterDefinition(key).estimable, false);
    assert.equal(getParameterDefinition(key).implementationStage, 'extension');
  }
  const missing = signalPolicyV2Document();
  delete (missing.parameters as Record<string, number>).yellow_commit_time;
  assert.throws(() => compileSignalPolicyV2Profile(missing));
  const wrongUnit = signalPolicyV2Document();
  (wrongUnit.unitsByParameter as Record<string, string>).green_launch_acceleration = 'm/s';
  assert.throws(() => compileSignalPolicyV2Profile(wrongUnit));
  const outOfRange = signalPolicyV2Document({ red_run_gap_acceptance: 9 });
  assert.throws(() => compileSignalPolicyV2Profile(outOfRange));
  assert.throws(() => compileSignalPolicyV2Profile({ ...signalPolicyV2Document(), extra: true }));
});

test('173 yellow_stop_probability changes only the yellow stop of a feasible approach', () => {
  const lowRate = stopRate(0.2),
    highRate = stopRate(1),
    low = evaluate(yellowFeasibilityScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 0.2 },
    }),
    high = evaluate(yellowFeasibilityScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 1 },
    });
  assert(lowRate > 0.1 && lowRate < 0.35);
  assert.equal(highRate, 1);
  assert.equal(low.command.reason, 'YELLOW_PROCEED');
  assert.equal(low.command.stopRequested, false);
  assert.equal(high.command.reason, 'YELLOW_STOP');
  assert.equal(high.command.stopRequested, true);
  assert.equal(low.command.sampledUnit, probabilityOpportunity.sample);
  assert.equal(high.command.sampledUnit, probabilityOpportunity.sample);
  // One opportunity, one sample: re-evaluating the same encounter never re-samples per tick.
  for (let offset = 0; offset < 5; offset++) {
    const again = evaluate(yellowFeasibilityScene, {
      tick: scenario.tick + offset,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 0.2 },
    });
    assert.equal(again.command.sampledUnit, probabilityOpportunity.sample);
    assert.equal(again.command.action, 'PROCEED');
  }
  const another = evaluate(yellowFeasibilityScene, {
    tick: scenario.tick,
    opportunityKey: opportunityKeyFor(9000),
    rValues: { yellow_stop_probability: 0.2 },
  });
  assert.notEqual(another.command.sampledUnit, probabilityOpportunity.sample);
  // A stationary vehicle at yellow stays stopped; a missing line cannot prove feasibility.
  const stopped = evaluate(
    { ...yellowFeasibilityScene, speed: 0 },
    {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 0 },
    },
  );
  assert.equal(stopped.command.reason, 'YELLOW_STOP_STANDSTILL');
  assert.equal(stopped.command.stopRequested, true);
  const noGeometry = evaluate(
    { ...yellowFeasibilityScene, distanceToStopLineM: null },
    {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 0 },
    },
  );
  assert.equal(noGeometry.command.reason, 'YELLOW_STOP_NO_GEOMETRY');
  assert.equal(noGeometry.command.stopRequested, true);
});

test('173 yellow_commit_time engages only inside both the horizon and the remaining yellow', () => {
  const early = evaluate(yellowCommitScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 1, yellow_commit_time: 0.2 },
    }),
    engaged = evaluate(yellowCommitScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 1, yellow_commit_time: 6 },
    }),
    redAhead = evaluate(
      { ...yellowCommitScene, distanceToStopLineM: 32, phaseRemainingS: 1 },
      {
        tick: scenario.tick,
        opportunityKey: probabilityOpportunity.opportunityKey,
        rValues: { yellow_stop_probability: 1, yellow_commit_time: 6 },
      },
    );
  assert(close(early.command.timeToLineS!, 0.875, 1e-12));
  assert.equal(early.command.yellowCommitted, false);
  assert.equal(early.command.reason, 'YELLOW_STOP');
  assert.equal(early.command.stopRequested, true);
  assert.equal(engaged.command.yellowCommitted, true);
  assert.equal(engaged.command.reason, 'YELLOW_COMMIT');
  assert.equal(engaged.command.stopRequested, false);
  assert.equal(engaged.command.sampledUnit, null);
  // A commit horizon never authorizes an entry that would happen on red.
  assert(close(redAhead.command.timeToLineS!, 3.875, 1e-12));
  assert.equal(redAhead.command.yellowCommitted, false);
  assert.equal(redAhead.command.reason, 'YELLOW_STOP_RED_AHEAD');
  assert.equal(redAhead.command.stopRequested, true);
});

test('173 red_run_gap_acceptance only tightens a red run and keeps its explicit 3 s cap', () => {
  const base = {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      mValues: { red_stop_probability: 0 },
    },
    accepted = evaluate(redRunScene, { ...base, rValues: { red_run_gap_acceptance: 0.1 } }),
    rejected = evaluate(redRunScene, { ...base, rValues: { red_run_gap_acceptance: 8 } }),
    floor = evaluate(
      { ...redRunScene, conflictGapS: 2 },
      { ...base, rValues: { red_run_gap_acceptance: 0.1 } },
    ),
    unknown = evaluate(
      { ...redRunScene, conflictGapS: null },
      { ...base, rValues: { red_run_gap_acceptance: 0.1 } },
    );
  assert.equal(accepted.signal.reason, 'CROSS_RED_BY_PROFILE');
  assert.equal(accepted.command.reason, 'RED_RUN_ACCEPTED');
  assert.equal(accepted.command.action, 'PROCEED');
  assert.equal(accepted.command.redRunAccepted, true);
  assert.equal(accepted.command.requiredRedGapS, 3);
  assert.equal(rejected.command.reason, 'RED_RUN_REJECTED');
  assert.equal(rejected.command.stopRequested, true);
  assert.equal(rejected.command.requiredRedGapS, 8);
  assert.equal(floor.command.reason, 'RED_RUN_REJECTED');
  assert.equal(floor.command.redRunAccepted, false);
  assert.equal(unknown.command.reason, 'RED_RUN_GAP_UNKNOWN');
  assert.equal(unknown.command.stopRequested, true);
  assert.equal(unknown.command.redRunAccepted, false);
  // The M compliance stop is a limit: the key can never turn it into a proceed.
  const compliant = evaluate(redRunScene, {
    tick: scenario.tick,
    opportunityKey: probabilityOpportunity.opportunityKey,
    rValues: { red_run_gap_acceptance: 0.1 },
  });
  assert.equal(compliant.signal.action, 'STOP');
  assert.equal(compliant.command.reason, 'RED_STOP');
  assert.equal(compliant.command.stopRequested, true);
  for (const acceptance of [0.1, 1, 3, 6, 8])
    for (const gap of [null, 0, 1, 2, 3, 4, 5, 8, 12]) {
      const row = evaluate(
        { ...redRunScene, conflictGapS: gap },
        {
          ...base,
          rValues: { red_run_gap_acceptance: acceptance },
        },
      );
      if (row.command.action === 'PROCEED') assert.equal(row.signal.action, 'PROCEED');
      if (row.signal.action === 'STOP') assert.equal(row.command.action, 'STOP');
    }
});

test('173 green_launch_acceleration launches only after the M start delay and stays bounded', () => {
  const slow = evaluate(greenLaunchScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { green_launch_acceleration: 0.2 },
    }),
    fast = evaluate(greenLaunchScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { green_launch_acceleration: 6 },
    }),
    delayed = evaluate(
      { ...greenLaunchScene, phaseElapsedS: 0.2 },
      {
        tick: scenario.tick,
        opportunityKey: probabilityOpportunity.opportunityKey,
        rValues: { green_launch_acceleration: 6 },
      },
    ),
    moving = evaluate(
      { ...greenLaunchScene, speed: 8 },
      {
        tick: scenario.tick,
        opportunityKey: probabilityOpportunity.opportunityKey,
        rValues: { green_launch_acceleration: 6 },
      },
    );
  assert.equal(slow.signal.reason, 'GREEN_RELEASE');
  assert.equal(slow.command.reason, 'GREEN_LAUNCH');
  assert.equal(slow.command.action, 'PROCEED');
  assert.equal(slow.command.launchAccelerationMps2, 0.2);
  assert.equal(fast.command.launchAccelerationMps2, 6);
  assert.equal(
    fast.command.launchAccelerationMps2,
    SIGNAL_POLICY_V2_LIMITS.maximumLaunchAccelerationMps2,
  );
  assert.equal(delayed.signal.reason, 'GREEN_START_DELAY');
  assert.equal(delayed.command.reason, 'GREEN_START_DELAY');
  assert.equal(delayed.command.stopRequested, true);
  assert.equal(delayed.command.launchAccelerationMps2, null);
  assert.equal(moving.command.reason, 'GREEN_RELEASE');
  assert.equal(moving.command.launchAccelerationMps2, null);
});

test('173 M keys keep their units, their 050 consequences and the yellow probability scaling', () => {
  const yellowDocument = signalPolicyV2Document(
      { yellow_stop_probability: 1, yellow_commit_time: 0.2 },
      { red_stop_probability: 0 },
    ),
    yellowPublishable = parsePublishableDrivingProfile(yellowDocument),
    yellowProfile = projectSignalProfile(yellowPublishable),
    yellowScene: SignalV2Scene = {
      state: 'YELLOW',
      speed: 8,
      distanceToStopLineM: 12,
      phaseRemainingS: 6,
      conflictGapS: null,
    },
    nonCompliant = evaluateSignalPolicy({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick: scenario.tick,
      speedMps: yellowScene.speed,
      seed: SEED,
      opportunityKey: probabilityOpportunity.opportunityKey,
      profile: yellowProfile,
      observation: signal050Observation(yellowScene, scenario.tick),
    }),
    nonCompliantRow = evaluate(yellowScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      mValues: { red_stop_probability: 0 },
      rValues: { yellow_stop_probability: 1 },
    }),
    compliantRow = evaluate(yellowScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      mValues: { red_stop_probability: 1 },
      rValues: { yellow_stop_probability: 1 },
    });
  assert.equal(nonCompliant.reason, 'CROSS_RED_BY_PROFILE');
  assert.equal(nonCompliantRow.command.reason, 'YELLOW_PROCEED');
  assert.equal(nonCompliantRow.command.stopRequested, false);
  assert.equal(compliantRow.command.reason, 'YELLOW_STOP');
  assert.equal(compliantRow.command.stopRequested, true);
  // R keys never change the delivered 050 result: the 050 profile reads only its four M keys.
  const neutralDocument = signalPolicyV2Document(),
    activeDocument = signalPolicyV2Document({
      yellow_stop_probability: 0.2,
      red_run_gap_acceptance: 0.1,
      yellow_commit_time: 6,
      green_launch_acceleration: 6,
    }),
    neutralProfile = projectSignalProfile(parsePublishableDrivingProfile(neutralDocument)),
    activeProfile = projectSignalProfile(parsePublishableDrivingProfile(activeDocument)),
    scenes: readonly SignalV2Scene[] = [
      {
        state: 'GREEN',
        speed: 8,
        distanceToStopLineM: 30,
        phaseRemainingS: 20,
        conflictGapS: null,
      },
      {
        state: 'GREEN',
        speed: 0,
        distanceToStopLineM: 20,
        phaseRemainingS: 20,
        conflictGapS: null,
      },
      { state: 'RED', speed: 8, distanceToStopLineM: 20, phaseRemainingS: 20, conflictGapS: 9 },
      {
        state: 'YELLOW',
        speed: 8,
        distanceToStopLineM: 64,
        phaseRemainingS: 10,
        conflictGapS: null,
      },
    ];
  for (let tick = 1; tick <= 16; tick++) {
    const scene = scenes[(tick - 1) % scenes.length],
      decisionTick = scenario.tick + tick,
      opportunityKey = opportunityKeyFor(Math.floor((tick - 1) / 4) * 1000),
      neutral = evaluateSignalPolicy({
        ...scenario.scope,
        actor: scenario.actor,
        decisionTick,
        speedMps: scene.speed,
        seed: SEED,
        opportunityKey,
        profile: neutralProfile,
        observation: signal050Observation(scene, decisionTick),
      }),
      active = evaluateSignalPolicy({
        ...scenario.scope,
        actor: scenario.actor,
        decisionTick,
        speedMps: scene.speed,
        seed: SEED,
        opportunityKey,
        profile: activeProfile,
        observation: signal050Observation(scene, decisionTick),
      });
    assert.deepEqual(active, neutral);
    assert.equal(getParameterDefinition('red_stop_probability').unit, 'probability');
    assert.equal(getParameterDefinition('green_start_delay').unit, 's');
    assert.equal(getParameterDefinition('red_stop_line_offset').unit, 'm');
    assert.equal(getParameterDefinition('late_red_brake_threshold').unit, 's');
    assert.equal(signalMValues.red_stop_probability, 1);
  }
});

test('173 refusals are explicit and never apply a key effect', () => {
  const input = baseInput(),
    manual = evaluateSignalPolicyV2({ ...input, authority: 'MANUAL' }),
    missing = evaluateSignalPolicyV2({ ...input, profile: null }),
    foreignObservation = evaluateSignalPolicyV2({
      ...input,
      observation: signalV2Observation(yellowFeasibilityScene, input.decisionTick + 1),
    }),
    foreignSignal = evaluateSignalPolicyV2({
      ...input,
      signal: {
        ...(input.signal as Record<string, unknown>),
        decisionTick: input.decisionTick + 1,
      },
    }),
    stateMismatch = evaluateSignalPolicyV2({
      ...input,
      observation: signalV2Observation(
        { ...yellowFeasibilityScene, state: 'RED' },
        input.decisionTick,
      ),
    }),
    unavailable = evaluateSignalPolicyV2({
      ...input,
      signal: evaluateSignalPolicy({
        ...scenario.scope,
        actor: scenario.actor,
        decisionTick: input.decisionTick,
        speedMps: 8,
        seed: SEED,
        opportunityKey: input.opportunityKey,
        profile: null,
        observation: signal050Observation(yellowFeasibilityScene, input.decisionTick),
      }),
    }),
    noSignal = evaluateSignalPolicyV2({
      ...input,
      signal: evaluateSignalPolicy({
        ...scenario.scope,
        actor: scenario.actor,
        decisionTick: input.decisionTick,
        speedMps: 8,
        seed: SEED,
        opportunityKey: input.opportunityKey,
        profile: projectSignalProfile(parsePublishableDrivingProfile(signalPolicyV2Document())),
        observation: null,
      }),
    });
  assert.equal(manual.reason, 'NO_AUTO_AUTHORITY');
  assert.equal(manual.action, 'UNKNOWN');
  assert.equal(manual.yellowStopProbability, null);
  assert.equal(manual.launchAccelerationMps2, null);
  assert.equal(missing.reason, 'MISSING_PROFILE');
  assert.equal(missing.action, 'UNKNOWN');
  assert.throws(() =>
    evaluateSignalPolicyV2({
      ...input,
      profile: signalPolicyV2Document() as unknown as typeof input.profile,
    }),
  );
  assert.equal(foreignObservation.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(foreignSignal.reason, 'FOREIGN_OR_STALE_SIGNAL');
  assert.equal(stateMismatch.reason, 'SIGNAL_OBSERVATION_MISMATCH');
  assert.equal(unavailable.reason, 'SIGNAL_UNAVAILABLE');
  assert.equal(unavailable.action, 'UNKNOWN');
  assert.equal(noSignal.reason, 'NO_SIGNAL');
  assert.equal(noSignal.action, 'PROCEED');
  assert.equal(noSignal.stopRequested, false);
  // A mismatching 050 profile or M value is refused before any key is consulted.
  const otherDocument = signalPolicyV2Document({}, {}, 'other-v1'),
    otherDecision = evaluateSignalPolicy({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick: input.decisionTick,
      speedMps: 8,
      seed: SEED,
      opportunityKey: input.opportunityKey,
      profile: projectSignalProfile(parsePublishableDrivingProfile(otherDocument)),
      observation: signal050Observation(yellowFeasibilityScene, input.decisionTick),
    }),
    profileMismatch = evaluateSignalPolicyV2({ ...input, signal: otherDecision }),
    differentM = evaluateSignalPolicy({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick: input.decisionTick,
      speedMps: 8,
      seed: SEED,
      opportunityKey: input.opportunityKey,
      profile: projectSignalProfile(
        parsePublishableDrivingProfile(signalPolicyV2Document({}, { red_stop_probability: 0.5 })),
      ),
      observation: signal050Observation(yellowFeasibilityScene, input.decisionTick),
    }),
    mMismatch = evaluateSignalPolicyV2({ ...input, signal: differentM });
  assert.equal(profileMismatch.reason, 'SIGNAL_PROFILE_MISMATCH');
  assert.equal(mMismatch.reason, 'SIGNAL_M_PROFILE_MISMATCH');
  for (const invalid of [
    { ...input, extra: true },
    { ...input, seed: -1 },
    { ...input, seed: 2 ** 32 },
    { ...input, opportunityKey: ' padded' },
    {
      ...input,
      observation: { ...input.observation, speedMps: 101 },
    },
    {
      ...input,
      observation: { ...input.observation, phaseRemainingS: -1 },
    },
    {
      ...input,
      observation: { ...input.observation, conflictGapS: -1 },
    },
    {
      ...input,
      observation: { ...input.observation, state: 'BLUE' },
    },
    {
      ...input,
      signal: { ...(input.signal as Record<string, unknown>), stopRequested: false },
    },
  ])
    assert.throws(() => evaluateSignalPolicyV2(invalid as SignalPolicyV2Input));
});

test('173 is deterministic, frozen and keeps no history', () => {
  const first = evaluate(yellowFeasibilityScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 0.6 },
    }),
    second = evaluate(yellowFeasibilityScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { yellow_stop_probability: 0.6 },
    });
  assert.deepEqual(first.command, second.command);
  assert(Object.isFrozen(first.command));
  assert.equal(first.command.retainedHistory, 0);
  assert.equal(first.command.version, '173-signal-policy-v2');
  assert.equal(first.command.units, 'SI');
  for (let cycle = 0; cycle < 20; cycle++)
    assert.equal(
      evaluate(yellowFeasibilityScene, {
        tick: scenario.tick + cycle,
        opportunityKey: probabilityOpportunity.opportunityKey,
      }).command.retainedHistory,
      0,
    );
  assert.deepEqual(getSignalPolicyV2Stats(), {
    compiling: false,
    evaluating: false,
    retainedHistory: 0,
  });
  const before = JSON.stringify(signalV2Profile());
  evaluateSignalPolicyV2(baseInput());
  assert.equal(JSON.stringify(signalV2Profile()), before);
});
