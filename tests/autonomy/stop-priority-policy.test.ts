import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STOP_PRIORITY_POLICY_KEYS,
  STOP_PRIORITY_POLICY_LIMITS,
  STOP_PRIORITY_POLICY_M_KEYS,
  compileStopPriorityProfile,
  evaluateStopPriorityPolicy,
  getStopPriorityPolicyStats,
} from '../../src/autonomy/stop-priority-policy';
import type {
  StopPriorityPolicyInput,
  StopPriorityPolicyKey,
} from '../../src/autonomy/stop-priority-policy';
import { evaluateStopPolicy, projectStopProfile } from '../../src/autonomy/stop-policy';
import { projectYieldProfile } from '../../src/autonomy/yield-policy';
import { getParameterDefinition } from '../../src/profiles';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import {
  SEED,
  blockedEntryOpportunity,
  evaluate,
  evaluateStop,
  evaluateYield,
  scenario,
  stop051Observation,
  stopPriorityDocument,
  stopPriorityMValues,
  stopPriorityProfile,
} from './stop-priority-policy-reference';
import type { StopPriorityScene } from './stop-priority-policy-reference';

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance;
const blockedOpportunity = blockedEntryOpportunity(0);
const rollingScene: StopPriorityScene = {
  speed: 8,
  stopDistanceM: 6,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: false,
  intersectionBlocked: false,
  intersectionExitM: null,
  yieldGapS: null,
};
const priorityScene: StopPriorityScene = {
  speed: 8,
  stopDistanceM: null,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: 12,
  yieldGapS: 3,
};
const patienceScene: StopPriorityScene = {
  speed: 2,
  stopDistanceM: 0.5,
  stopSpeed: 2,
  stationaryDurationS: 2,
  crossed: false,
  allWayArrival: { position: 2, sinceDwellS: 4 },
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: 12,
  yieldGapS: null,
};
const blockedScene: StopPriorityScene = {
  speed: 8,
  stopDistanceM: null,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: null,
  yieldGapS: null,
};
const claimed = (row: ReturnType<typeof evaluate>) => (row.command.stopRequested ? 0 : 1);
const rollingSpeed = (row: ReturnType<typeof evaluate>) => row.command.rollThroughSpeedMps ?? 0;
const turnGranted = (row: ReturnType<typeof evaluate>) =>
  row.command.reason === 'ALLWAY_TURN' ? 1 : 0;
const entryGranted = (row: ReturnType<typeof evaluate>) =>
  row.command.blockedEntryGranted === true ? 1 : 0;

function baseInput(scene: StopPriorityScene = priorityScene): StopPriorityPolicyInput {
  const base = evaluate(scene, { mValues: { yield_time_gap: 6 } });
  return {
    ...scenario.scope,
    actor: scenario.actor,
    decisionTick: base.decisionTick,
    authority: 'AUTO',
    seed: SEED,
    opportunityKey: base.opportunityKey,
    profile: base.profile,
    stopDecision: base.stop,
    yieldDecision: base.yielded,
    observation: {
      version: STOP_PRIORITY_POLICY_LIMITS.observationVersion,
      units: 'SI',
      ...scenario.scope,
      actor: scenario.actor,
      tick: base.decisionTick,
      speedMps: scene.speed,
      atIntersection: scene.atIntersection,
      intersectionBlocked: scene.intersectionBlocked,
      intersectionExitM: scene.intersectionExitM,
      allWayArrival: scene.allWayArrival,
    },
  };
}

test('175 compileStopPriorityProfile reads the four R and four M keys with the certified capability', () => {
  assert.deepEqual(STOP_PRIORITY_POLICY_KEYS, [
    'rolling_stop_speed',
    'priority_assertiveness',
    'allway_stop_patience',
    'blocked_intersection_entry_probability',
  ]);
  assert.deepEqual(STOP_PRIORITY_POLICY_M_KEYS, [
    'stop_full_probability',
    'stop_dwell_time',
    'stop_line_offset',
    'yield_time_gap',
  ]);
  const profile = stopPriorityProfile(
      { rolling_stop_speed: 2, priority_assertiveness: 0.8 },
      { yield_time_gap: 6, stop_dwell_time: 2 },
    ),
    values = profile.values;
  assert.equal(values.rolling_stop_speed, 2);
  assert.equal(values.priority_assertiveness, 0.8);
  assert.equal(values.allway_stop_patience, 0);
  assert.equal(values.blocked_intersection_entry_probability, 0);
  assert.equal(profile.mValues.stop_full_probability, 1);
  assert.equal(profile.mValues.stop_dwell_time, 2);
  assert.equal(profile.mValues.stop_line_offset, 1);
  assert.equal(profile.mValues.yield_time_gap, 6);
  assert.equal(profile.units.rolling_stop_speed, 'm/s');
  assert.equal(profile.units.priority_assertiveness, 'ratio');
  assert.equal(profile.units.allway_stop_patience, 's');
  assert.equal(profile.units.blocked_intersection_entry_probability, 'probability');
  assert.equal(profile.mUnits.stop_full_probability, 'probability');
  assert.equal(profile.mUnits.yield_time_gap, 's');
  assert.equal(getParameterDefinition('rolling_stop_speed').default, 1);
  assert.equal(getParameterDefinition('priority_assertiveness').default, 0.3);
  assert.equal(getParameterDefinition('allway_stop_patience').default, 2);
  for (const key of STOP_PRIORITY_POLICY_KEYS) {
    assert.equal(profile.provenance[key], 'BASE');
    assert.equal(getParameterDefinition(key).implemented, true);
    assert.equal(getParameterDefinition(key).estimable, true);
    assert.equal(getParameterDefinition(key).implementationStage, 'extension');
  }
  const missing = stopPriorityDocument();
  delete (missing.parameters as Record<string, number>).allway_stop_patience;
  assert.throws(() => compileStopPriorityProfile(missing));
  const wrongUnit = stopPriorityDocument();
  (wrongUnit.unitsByParameter as Record<string, string>).priority_assertiveness = 'probability';
  assert.throws(() => compileStopPriorityProfile(wrongUnit));
  assert.throws(() => compileStopPriorityProfile(stopPriorityDocument({ rolling_stop_speed: 6 })));
  assert.throws(() => compileStopPriorityProfile({ ...stopPriorityDocument(), extra: true }));
});

test('175 rolling_stop_speed changes only the rolling speed and is capped below a crossing at speed', () => {
  const slow = evaluate(rollingScene, {
      rValues: { rolling_stop_speed: 0.2 },
      mValues: { stop_full_probability: 0 },
    }),
    fast = evaluate(rollingScene, {
      rValues: { rolling_stop_speed: 5 },
      mValues: { stop_full_probability: 0 },
    });
  assert.equal(slow.stop.action, 'ROLL_THROUGH');
  assert.equal(slow.stop.reason, 'ROLLING_STOP_BY_PROFILE');
  assert.equal(slow.command.reason, 'ROLLING_STOP_AT_SPEED');
  assert.equal(slow.command.action, 'ROLL_THROUGH');
  assert.equal(slow.command.stopRequested, false);
  assert.equal(slow.command.rollThroughSpeedMps, 0.2);
  assert.equal(slow.command.rollingStopCapped, false);
  assert.equal(fast.command.action, 'ROLL_THROUGH');
  assert.equal(fast.command.rollThroughSpeedMps, STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps);
  assert.equal(fast.command.rollingStopCapped, true);
  // The catalog allows 5 m/s; the explicit policy cap keeps a rolling stop at 2.5 m/s or less.
  assert.equal(getParameterDefinition('rolling_stop_speed').max, 5);
  assert(fast.command.rollThroughSpeedMps! < getParameterDefinition('rolling_stop_speed').max!);
});

test('175 priority_assertiveness claims only inside the floor and reproduces the M threshold at zero', () => {
  const base = { mValues: { yield_time_gap: 6 } as const },
    neutral = evaluate(priorityScene, { ...base, rValues: { priority_assertiveness: 0 } }),
    half = evaluate(priorityScene, { ...base, rValues: { priority_assertiveness: 0.5 } }),
    full = evaluate(priorityScene, { ...base, rValues: { priority_assertiveness: 1 } });
  assert.equal(neutral.yielded.action, 'REFUSE');
  assert.equal(neutral.yielded.minimumGapS, 3);
  assert.equal(neutral.yielded.thresholdS, 6);
  assert.equal(neutral.command.requiredGapS, 6);
  assert.equal(neutral.command.reason, 'PRIORITY_YIELD');
  assert.equal(neutral.command.stopRequested, true);
  assert.equal(neutral.command.priorityClaimed, false);
  assert.equal(half.command.requiredGapS, 4.5);
  assert.equal(half.command.reason, 'PRIORITY_YIELD');
  assert.equal(full.command.requiredGapS, STOP_PRIORITY_POLICY_LIMITS.priorityMinimumGapS);
  assert.equal(full.command.reason, 'PRIORITY_CLAIMED');
  assert.equal(full.command.action, 'PROCEED');
  assert.equal(full.command.stopRequested, false);
  assert.equal(full.command.priorityClaimed, true);
  // The floor is absolute: 2.9 s stays refused even at full assertiveness.
  const belowFloor = evaluate(
    { ...priorityScene, yieldGapS: 2.9 },
    { mValues: { yield_time_gap: 8 }, rValues: { priority_assertiveness: 1 } },
  );
  assert.equal(belowFloor.yielded.action, 'REFUSE');
  assert(belowFloor.yielded.minimumGapS! < 3);
  assert.equal(belowFloor.command.requiredGapS, 3);
  assert.equal(belowFloor.command.reason, 'PRIORITY_YIELD');
  // A threshold already at or below the floor leaves the key inert, so the M consequence stands.
  const smallThreshold = evaluate(
    { ...priorityScene, yieldGapS: 2.9 },
    { rValues: { priority_assertiveness: 1 } },
  );
  assert.equal(smallThreshold.command.requiredGapS, 3);
  assert.equal(smallThreshold.command.reason, 'PRIORITY_YIELD');
  const equality = evaluate(
    { ...priorityScene, yieldGapS: 0.2 },
    { mValues: { yield_time_gap: 0.2 }, rValues: { priority_assertiveness: 1 } },
  );
  assert.equal(equality.command.requiredGapS, 0.2);
  assert.equal(equality.yielded.reason, 'GAP_ACCEPTED');
  assert.equal(equality.command.action, 'PROCEED');
});

test('175 allway_stop_patience holds only a non-first release and never the approach', () => {
  const impatient = evaluate(patienceScene, { rValues: { allway_stop_patience: 0 } }),
    patient = evaluate(patienceScene, { rValues: { allway_stop_patience: 10 } }),
    satisfied = evaluate(
      { ...patienceScene, allWayArrival: { position: 3, sinceDwellS: 12 } },
      { rValues: { allway_stop_patience: 10 } },
    ),
    first = evaluate(
      { ...patienceScene, allWayArrival: { position: 1, sinceDwellS: 0 } },
      { rValues: { allway_stop_patience: 10 } },
    ),
    approaching = evaluate(
      { ...patienceScene, stopDistanceM: 10, stationaryDurationS: null },
      { rValues: { allway_stop_patience: 10 } },
    );
  assert.equal(impatient.stop.action, 'RELEASE');
  assert.equal(impatient.stop.reason, 'DWELL_SATISFIED');
  assert.equal(impatient.command.reason, 'ALLWAY_TURN');
  assert.equal(impatient.command.action, 'PROCEED');
  assert.equal(impatient.command.allWayHoldS, 0);
  assert.equal(patient.command.reason, 'ALLWAY_PATIENCE');
  assert.equal(patient.command.action, 'STOP');
  assert.equal(patient.command.stopRequested, true);
  assert.equal(patient.command.allWayPosition, 2);
  assert.equal(patient.command.allWaySinceDwellS, 4);
  assert.equal(patient.command.allWayHoldS, 10);
  assert.equal(satisfied.command.reason, 'ALLWAY_TURN');
  assert.equal(satisfied.command.allWayPosition, 3);
  assert.equal(first.command.action, 'PROCEED');
  assert.equal(first.command.allWayPosition, 1);
  assert.equal(first.command.reason, 'EXIT_SPACE_CONFIRMED');
  assert.equal(approaching.stop.action, 'APPROACH');
  assert.equal(approaching.command.reason, 'STOP_REQUIRED');
  assert.equal(approaching.command.stopRequested, true);
  assert.equal(approaching.command.allWayHoldS, null);
});

test('175 blocked intersection entry has one sample, a 0.5 cap and an absolute veto', () => {
  const wait = evaluate(blockedScene, {
      rValues: { blocked_intersection_entry_probability: 0 },
      opportunityKey: blockedOpportunity.opportunityKey,
    }),
    enter = evaluate(blockedScene, {
      rValues: { blocked_intersection_entry_probability: 1 },
      opportunityKey: blockedOpportunity.opportunityKey,
    }),
    again = evaluate(blockedScene, {
      rValues: { blocked_intersection_entry_probability: 1 },
      opportunityKey: blockedOpportunity.opportunityKey,
      tick: scenario.tick + 7,
    });
  assert.equal(wait.command.reason, 'BLOCKED_ENTRY_WAIT');
  assert.equal(wait.command.stopRequested, true);
  assert.equal(wait.command.blockedEntryProbability, 0);
  assert.equal(wait.command.blockedEntryGranted, false);
  assert.equal(enter.command.reason, 'BLOCKED_ENTRY_ACCEPTED');
  assert.equal(enter.command.action, 'PROCEED');
  assert.equal(enter.command.blockedEntryProbability, 0.5);
  assert.equal(enter.command.blockedEntrySample, blockedOpportunity.sample);
  assert.equal(enter.command.blockedEntryGranted, true);
  // One opportunity, one sample: a later tick keeps the same value and the same outcome.
  assert.equal(again.command.blockedEntrySample, blockedOpportunity.sample);
  assert.equal(again.command.blockedEntryGranted, true);
  const veto = evaluate(
      { ...blockedScene, intersectionBlocked: true },
      { rValues: { blocked_intersection_entry_probability: 1 } },
    ),
    insufficient = evaluate(
      { ...blockedScene, intersectionExitM: 3 },
      { rValues: { blocked_intersection_entry_probability: 1 } },
    ),
    confirmed = evaluate(
      { ...blockedScene, intersectionExitM: 12 },
      { rValues: { blocked_intersection_entry_probability: 1 } },
    );
  assert.equal(veto.command.reason, 'BLOCKED_INTERSECTION_VETO');
  assert.equal(veto.command.action, 'STOP');
  assert.equal(veto.command.blockedEntrySample, null);
  assert.equal(insufficient.command.reason, 'EXIT_SPACE_INSUFFICIENT');
  assert.equal(insufficient.command.action, 'STOP');
  assert.equal(confirmed.command.reason, 'EXIT_SPACE_CONFIRMED');
  assert.equal(confirmed.command.action, 'PROCEED');
  assert.equal(confirmed.command.blockedEntryGranted, null);
});

test('175 each key is inert in the other three scenarios', () => {
  const rows: readonly {
    readonly scene: StopPriorityScene;
    readonly measure: (row: ReturnType<typeof evaluate>) => number;
    readonly mValues: Partial<Record<(typeof STOP_PRIORITY_POLICY_M_KEYS)[number], number>>;
    readonly fixed: Partial<Record<StopPriorityPolicyKey, number>>;
  }[] = [
    {
      scene: rollingScene,
      measure: rollingSpeed,
      mValues: { stop_full_probability: 0 },
      fixed: { rolling_stop_speed: 1 },
    },
    { scene: priorityScene, measure: claimed, mValues: { yield_time_gap: 6 }, fixed: {} },
    { scene: patienceScene, measure: turnGranted, mValues: {}, fixed: {} },
    {
      scene: blockedScene,
      measure: entryGranted,
      mValues: {},
      fixed: {},
    },
  ];
  const ranges: Readonly<Record<StopPriorityPolicyKey, readonly [number, number]>> = {
    rolling_stop_speed: [0.2, 5],
    priority_assertiveness: [0, 1],
    allway_stop_patience: [0, 10],
    blocked_intersection_entry_probability: [0, 1],
  };
  let pairs = 0;
  for (const row of rows) {
    for (const key of STOP_PRIORITY_POLICY_KEYS) {
      if (key === measuredKey(row.scene)) continue;
      const [lowValue, highValue] = ranges[key],
        low = evaluate(row.scene, {
          mValues: row.mValues,
          rValues: { ...row.fixed, [key]: lowValue },
          opportunityKey: blockedOpportunity.opportunityKey,
        }),
        high = evaluate(row.scene, {
          mValues: row.mValues,
          rValues: { ...row.fixed, [key]: highValue },
          opportunityKey: blockedOpportunity.opportunityKey,
        });
      assert.equal(
        row.measure(low),
        row.measure(high),
        `${key} must be inert in the ${measuredKey(row.scene)} scenario`,
      );
      pairs += 1;
    }
  }
  assert.equal(pairs, 12);
});

function measuredKey(scene: StopPriorityScene): StopPriorityPolicyKey {
  if (scene === rollingScene) return 'rolling_stop_speed';
  if (scene === priorityScene) return 'priority_assertiveness';
  if (scene === patienceScene) return 'allway_stop_patience';
  return 'blocked_intersection_entry_probability';
}

test('175 M keys keep their units and their 051/052 consequences with neutral and active R keys', () => {
  const activeValues = {
      rolling_stop_speed: 5,
      priority_assertiveness: 1,
      allway_stop_patience: 10,
      blocked_intersection_entry_probability: 1,
    } as const,
    scenes: readonly StopPriorityScene[] = [
      { ...priorityScene, stopDistanceM: 10, stationaryDurationS: null },
      { ...patienceScene, stationaryDurationS: 0 },
      { ...patienceScene, allWayArrival: null },
      { ...patienceScene, allWayArrival: { position: 2, sinceDwellS: 0.5 } },
      rollingScene,
      { ...blockedScene, intersectionExitM: 12 },
      { ...blockedScene, intersectionExitM: 12, yieldGapS: 3 },
      { ...rollingScene, stopDistanceM: null },
      { ...priorityScene, stopDistanceM: 10, stationaryDurationS: null, yieldGapS: 3 },
      { ...blockedScene, intersectionExitM: 12 },
    ],
    mValuesAt = (scene: StopPriorityScene) =>
      scene === rollingScene
        ? { stop_full_probability: 0 }
        : scene.yieldGapS === 3
          ? { yield_time_gap: 6 }
          : {};
  assert.equal(getParameterDefinition('stop_full_probability').unit, 'probability');
  assert.equal(getParameterDefinition('stop_dwell_time').unit, 's');
  assert.equal(getParameterDefinition('stop_line_offset').unit, 'm');
  assert.equal(getParameterDefinition('yield_time_gap').unit, 's');
  assert.equal(stopPriorityMValues.yield_time_gap, 3);
  let comparableTicks = 0,
    identicalStopTicks = 0,
    identicalYieldTicks = 0,
    neutralForwardTicks = 0,
    activeDifferingTicks = 0,
    maximumRollingDifferenceMps = 0;
  for (let tick = 1; tick <= 60; tick++) {
    const scene = scenes[(tick - 1) % scenes.length],
      mValues = mValuesAt(scene),
      decisionTick = scenario.tick + tick,
      opportunityKey = blockedOpportunity.opportunityKey,
      neutralDocument = stopPriorityDocument({}, mValues),
      activeDocument = stopPriorityDocument(activeValues, mValues),
      neutralStop = projectStopProfile(parsePublishableDrivingProfile(neutralDocument)),
      activeStop = projectStopProfile(parsePublishableDrivingProfile(activeDocument)),
      neutralYield = projectYieldProfile(parsePublishableDrivingProfile(neutralDocument)),
      activeYield = projectYieldProfile(parsePublishableDrivingProfile(activeDocument)),
      stopNeutral = evaluateStop(scene, neutralStop, decisionTick),
      stopActive = evaluateStop(scene, activeStop, decisionTick),
      yieldNeutral = evaluateYield(scene, neutralYield, decisionTick),
      yieldActive = evaluateYield(scene, activeYield, decisionTick),
      neutralRow = evaluate(scene, { tick: decisionTick, mValues, opportunityKey }),
      activeRow = evaluate(scene, {
        tick: decisionTick,
        mValues,
        opportunityKey,
        rValues: activeValues,
      }),
      expected =
        stopNeutral.action === 'APPROACH' || stopNeutral.action === 'HOLD'
          ? 'STOP'
          : stopNeutral.action === 'ROLL_THROUGH'
            ? 'ROLL_THROUGH'
            : stopNeutral.action === 'RELEASE' || stopNeutral.action === 'NO_STOP'
              ? yieldNeutral.action === 'REFUSE'
                ? 'STOP'
                : 'PROCEED'
              : 'UNKNOWN';
    comparableTicks += 1;
    if (JSON.stringify(stopNeutral) === JSON.stringify(stopActive)) identicalStopTicks += 1;
    if (JSON.stringify(yieldNeutral) === JSON.stringify(yieldActive)) identicalYieldTicks += 1;
    if (neutralRow.command.action === expected) neutralForwardTicks += 1;
    if (
      activeRow.command.action !== neutralRow.command.action ||
      activeRow.command.allWayHoldS !== neutralRow.command.allWayHoldS ||
      activeRow.command.blockedEntryGranted !== neutralRow.command.blockedEntryGranted ||
      activeRow.command.rollThroughSpeedMps !== neutralRow.command.rollThroughSpeedMps
    ) {
      activeDifferingTicks += 1;
      maximumRollingDifferenceMps = Math.max(
        maximumRollingDifferenceMps,
        Math.abs(
          (activeRow.command.rollThroughSpeedMps ?? 0) -
            (neutralRow.command.rollThroughSpeedMps ?? 0),
        ),
      );
    }
    assert.equal(neutralRow.command.profileVersionId, neutralDocument.versionId);
    assert.equal(activeRow.command.profileVersionId, activeDocument.versionId);
  }
  assert.equal(identicalStopTicks, comparableTicks);
  assert.equal(identicalYieldTicks, comparableTicks);
  assert.equal(neutralForwardTicks, comparableTicks);
  assert(activeDifferingTicks > 0);
  assert(close(maximumRollingDifferenceMps, 1.5, 1e-12));
});

test('175 refusals are explicit and never apply a key effect', () => {
  const input = baseInput(),
    manual = evaluateStopPriorityPolicy({ ...input, authority: 'MANUAL' }),
    missing = evaluateStopPriorityPolicy({ ...input, profile: null }),
    foreignObservation = evaluateStopPriorityPolicy({
      ...input,
      observation: { ...input.observation, tick: input.decisionTick + 1 },
    }),
    noInput = evaluateStopPriorityPolicy({ ...input, stopDecision: null, yieldDecision: null }),
    foreignStop = evaluateStopPriorityPolicy({
      ...input,
      stopDecision: {
        ...(input.stopDecision as Record<string, unknown>),
        decisionTick: input.decisionTick + 1,
      },
    }),
    foreignYield = evaluateStopPriorityPolicy({
      ...input,
      yieldDecision: {
        ...(input.yieldDecision as Record<string, unknown>),
        decisionTick: input.decisionTick + 1,
      },
    });
  assert.equal(manual.reason, 'NO_AUTO_AUTHORITY');
  assert.equal(manual.action, 'UNKNOWN');
  assert.equal(manual.rollThroughSpeedMps, null);
  assert.equal(manual.requiredGapS, null);
  assert.equal(missing.reason, 'MISSING_PROFILE');
  assert.equal(missing.action, 'UNKNOWN');
  assert.throws(() =>
    evaluateStopPriorityPolicy({
      ...input,
      profile: stopPriorityDocument() as unknown as typeof input.profile,
    }),
  );
  assert.equal(foreignObservation.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(noInput.reason, 'NO_POLICY_INPUT');
  assert.equal(foreignStop.reason, 'FOREIGN_OR_STALE_STOP');
  assert.equal(foreignYield.reason, 'FOREIGN_OR_STALE_YIELD');
  // An unusable delivered result is forwarded as UNKNOWN, never as a fabricated key effect.
  const stopUnknown = evaluateStopPolicy({
    ...scenario.scope,
    actor: scenario.actor,
    decisionTick: input.decisionTick,
    seed: SEED,
    profile: null,
    observation: stop051Observation({ ...priorityScene, stopDistanceM: 6 }, input.decisionTick),
    leaderStop: 'NONE',
  });
  assert.equal(stopUnknown.action, 'UNKNOWN');
  assert.equal(
    evaluateStopPriorityPolicy({ ...input, stopDecision: stopUnknown }).reason,
    'STOP_UNAVAILABLE',
  );
  const yieldUnknown = evaluateYield(
    priorityScene,
    projectYieldProfile(parsePublishableDrivingProfile(stopPriorityDocument({}, {}))),
    input.decisionTick,
    'LOCAL_ONLY',
  );
  assert.equal(yieldUnknown.action, 'UNKNOWN');
  assert.equal(
    evaluateStopPriorityPolicy({ ...input, yieldDecision: yieldUnknown }).reason,
    'YIELD_UNAVAILABLE',
  );
  // A foreign profile or a changed M value is refused before any key is consulted.
  const otherStop = evaluateStopPolicy({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick: input.decisionTick,
      seed: SEED,
      profile: projectStopProfile(
        parsePublishableDrivingProfile(stopPriorityDocument({}, {}, 'other-v1')),
      ),
      observation: null,
      leaderStop: 'NONE',
    }),
    otherYield = evaluateYield(
      priorityScene,
      projectYieldProfile(parsePublishableDrivingProfile(stopPriorityDocument({}, {}, 'other-v1'))),
      input.decisionTick,
    ),
    differentStop = evaluateStopPolicy({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick: input.decisionTick,
      seed: SEED,
      profile: projectStopProfile(
        parsePublishableDrivingProfile(stopPriorityDocument({}, { stop_full_probability: 0.5 })),
      ),
      observation: null,
      leaderStop: 'NONE',
    }),
    differentYield = evaluateYield(
      priorityScene,
      projectYieldProfile(
        parsePublishableDrivingProfile(stopPriorityDocument({}, { yield_time_gap: 4 })),
      ),
      input.decisionTick,
    );
  assert.equal(
    evaluateStopPriorityPolicy({ ...input, stopDecision: otherStop }).reason,
    'STOP_PROFILE_MISMATCH',
  );
  assert.equal(
    evaluateStopPriorityPolicy({ ...input, stopDecision: differentStop }).reason,
    'STOP_M_PROFILE_MISMATCH',
  );
  assert.equal(
    evaluateStopPriorityPolicy({ ...input, yieldDecision: otherYield }).reason,
    'YIELD_PROFILE_MISMATCH',
  );
  assert.equal(
    evaluateStopPriorityPolicy({ ...input, yieldDecision: differentYield }).reason,
    'YIELD_M_PROFILE_MISMATCH',
  );
  for (const invalid of [
    { ...input, extra: true },
    { ...input, seed: -1 },
    { ...input, seed: 2 ** 32 },
    { ...input, opportunityKey: ' padded' },
    { ...input, observation: { ...input.observation, speedMps: 101 } },
    { ...input, observation: { ...input.observation, atIntersection: 'yes' } },
    { ...input, observation: { ...input.observation, intersectionExitM: -1 } },
    {
      ...input,
      observation: {
        ...input.observation,
        allWayArrival: { position: 0, sinceDwellS: 1 },
      },
    },
    {
      ...input,
      observation: {
        ...input.observation,
        allWayArrival: { position: 2, sinceDwellS: -1 },
      },
    },
    {
      ...input,
      stopDecision: {
        ...(input.stopDecision as Record<string, unknown>),
        stopRequested: true,
      },
    },
  ])
    assert.throws(() => evaluateStopPriorityPolicy(invalid as StopPriorityPolicyInput));
});

test('175 is deterministic, frozen and keeps no history', () => {
  const first = evaluate(priorityScene, {
      mValues: { yield_time_gap: 6 },
      rValues: { priority_assertiveness: 0.6 },
    }),
    second = evaluate(priorityScene, {
      mValues: { yield_time_gap: 6 },
      rValues: { priority_assertiveness: 0.6 },
    });
  assert.deepEqual(first.command, second.command);
  assert(Object.isFrozen(first.command));
  assert.equal(first.command.retainedHistory, 0);
  assert.equal(first.command.version, '175-stop-priority-policy-v1');
  assert.equal(first.command.units, 'SI');
  for (let cycle = 0; cycle < 20; cycle++)
    assert.equal(
      evaluate(blockedScene, {
        tick: scenario.tick + cycle,
        opportunityKey: blockedOpportunity.opportunityKey,
      }).command.retainedHistory,
      0,
    );
  assert.deepEqual(getStopPriorityPolicyStats(), {
    compiling: false,
    evaluating: false,
    retainedHistory: 0,
  });
  const before = JSON.stringify(stopPriorityProfile());
  evaluate(blockedScene);
  assert.equal(JSON.stringify(stopPriorityProfile()), before);
});
