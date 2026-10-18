import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SIGNAL_POLICY_LIMITS,
  evaluateSignalPolicy,
  getSignalPolicyStats,
  projectSignalProfile,
  signalBehaviorFacts,
  signalOpportunityKey,
} from '../../src/autonomy/signal-policy';
import type { SignalPolicyInput, SignalPolicyProfile } from '../../src/autonomy/signal-policy';
import { createBehaviorFSM, parseBehaviorFacts } from '../../src/autonomy/behavior-fsm';
import type { BehaviorFacts } from '../../src/autonomy/behavior-fsm';
import {
  deriveOpportunitySeed,
  deriveScenarioSeed,
  deriveVehicleSeed,
  randomUnit,
} from '../../src/sessions';
import {
  getParameterDefinition,
  parsePublishableDrivingProfile,
} from '../../src/profiles/parameter-registry';
import { referenceSignal } from './signal-policy-reference';
import type { ReferenceSignalInput } from './signal-policy-reference';

const SEED = deriveVehicleSeed(deriveScenarioSeed(12345, 'city:one'), 'taxi');
const SCOPE = { sessionId: 'signal-test', worldEpoch: 0 };
const ACTOR = { id: 'taxi', incarnation: 1 };
function opportunity(phaseStartedTick: number) {
  return signalOpportunityKey({
    sessionId: SCOPE.sessionId,
    worldEpoch: 0,
    vehicleId: ACTOR.id,
    incarnation: ACTOR.incarnation,
    intersectionId: 'junction',
    movementId: 'west-straight',
    phaseStartedTick,
  });
}
function sampledUnit(key: string) {
  return randomUnit(deriveOpportunitySeed(SEED, key), 'red-compliance', 0);
}
/** First opportunity key at/after `from` whose sample falls on the requested side of `threshold`. */
function findOpportunity(from: number, threshold: number, below: boolean) {
  for (let phaseStartedTick = from; phaseStartedTick < from + 2000; phaseStartedTick++) {
    const key = opportunity(phaseStartedTick),
      unit = sampledUnit(key);
    if (below ? unit < threshold : unit >= threshold)
      return Object.freeze({ key, unit, phaseStartedTick });
  }
  throw new Error('No matching signal opportunity in fixture range');
}
function published(values: Partial<Record<string, number>> = {}) {
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: 'signal-style',
    versionId: 'signal-base-v1',
    parentVersionId: null,
    engineVersion: 'test',
    parameters: {
      red_stop_probability: 1,
      green_start_delay: 0.7,
      red_stop_line_offset: 1,
      late_red_brake_threshold: 2,
      ...values,
    },
    unitsByParameter: {
      red_stop_probability: 'probability',
      green_start_delay: 's',
      red_stop_line_offset: 'm',
      late_red_brake_threshold: 's',
    },
    provenanceByParameter: {
      red_stop_probability: 'BASE',
      green_start_delay: 'BASE',
      red_stop_line_offset: 'BASE',
      late_red_brake_threshold: 'BASE',
    },
    evidenceByParameter: {
      red_stop_probability: null,
      green_start_delay: null,
      red_stop_line_offset: null,
      late_red_brake_threshold: null,
    },
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: 'fixture',
  });
}
function profile(overrides: Partial<SignalPolicyProfile> = {}): SignalPolicyProfile {
  return Object.freeze({ ...projectSignalProfile(published()), ...overrides });
}
function packet(overrides: Partial<SignalPolicyInput> = {}): SignalPolicyInput {
  return {
    ...SCOPE,
    actor: ACTOR,
    decisionTick: 61,
    speedMps: 8,
    seed: SEED,
    opportunityKey: findOpportunity(0, 1, true).key,
    profile: profile(),
    observation: {
      version: SIGNAL_POLICY_LIMITS.observationVersion,
      units: 'SI',
      tick: 60,
      signalId: 'signal',
      intersectionId: 'junction',
      movementId: 'west-straight',
      phaseId: 'west-red',
      state: 'RED',
      phaseElapsedS: 0.5,
      distanceToStopLineM: 20,
    },
    ...overrides,
  };
}
const RED_REFERENCE: ReferenceSignalInput = {
  redStopProbability: 1,
  greenStartDelayS: 0.7,
  redStopLineOffsetM: 1,
  lateRedBrakeThresholdS: 2,
  state: 'RED',
  phaseElapsedS: 0.5,
  distanceToStopLineM: 20,
  speedMps: 8,
  complianceSample: 0,
};

test('050 projectSignalProfile reads only its four published values and does not grant estimator support', () => {
  const projected = projectSignalProfile(published({ red_stop_probability: 0.25 }));
  assert.deepEqual(projected, {
    versionId: 'signal-base-v1',
    redStopProbability: 0.25,
    greenStartDelayS: 0.7,
    redStopLineOffsetM: 1,
    lateRedBrakeThresholdS: 2,
  });
  assert(Object.isFrozen(projected));
  for (const key of [
    'red_stop_probability',
    'green_start_delay',
    'red_stop_line_offset',
    'late_red_brake_threshold',
  ]) {
    assert.equal(getParameterDefinition(key).implemented, true);
    assert.equal(getParameterDefinition(key).estimable, false);
  }
  assert.equal(getParameterDefinition('red_stop_probability').unit, 'probability');
  assert.throws(() =>
    projectSignalProfile({
      ...published(),
      unitsByParameter: { ...published().unitsByParameter, red_stop_probability: 'ratio' },
    }),
  );
  assert.throws(() =>
    projectSignalProfile({ ...published(), parameters: { red_stop_probability: 1.5 } }),
  );
});

test('050 free signal releases and the green start delay distinguishes a slow from a fast start', () => {
  const free = packet({
    observation: {
      ...packet().observation!,
      state: 'GREEN',
      phaseElapsedS: 4,
      distanceToStopLineM: 20,
    },
  });
  assert.equal(evaluateSignalPolicy(free).action, 'PROCEED');
  assert.equal(evaluateSignalPolicy(free).reason, 'GREEN_RELEASE');
  assert.equal(evaluateSignalPolicy(free).sampledUnit, null);
  const waiting = {
    ...free,
    speedMps: 0.05,
    observation: { ...free.observation!, phaseElapsedS: 0.2 },
  };
  const slow = evaluateSignalPolicy({ ...waiting, profile: profile({ greenStartDelayS: 2 }) });
  const fast = evaluateSignalPolicy({ ...waiting, profile: profile({ greenStartDelayS: 0 }) });
  assert.equal(slow.action, 'START_DELAY');
  assert.equal(slow.reason, 'GREEN_START_DELAY');
  assert.equal(slow.stopRequested, true);
  assert.equal(fast.action, 'PROCEED');
  assert.equal(fast.reason, 'GREEN_RELEASE');
  // A moving vehicle is never held for the configured delay.
  assert.equal(
    evaluateSignalPolicy({ ...waiting, speedMps: 5, profile: profile({ greenStartDelayS: 2 }) })
      .action,
    'PROCEED',
  );
});

test('050 compliant red applies the stop-line offset, then holds, and the oracle agrees', () => {
  const approaching = evaluateSignalPolicy(
    packet({ observation: { ...packet().observation!, distanceToStopLineM: 20 } }),
  );
  assert.equal(approaching.action, 'STOP');
  assert.equal(approaching.reason, 'STOP_LINE_APPROACH');
  assert.equal(approaching.stopRequested, true);
  assert.equal(approaching.remainingToStopPointM, 19);
  const holding = evaluateSignalPolicy(
    packet({ observation: { ...packet().observation!, distanceToStopLineM: 0.5 } }),
  );
  assert.equal(holding.reason, 'STOP_LINE_HOLD');
  assert.equal(holding.remainingToStopPointM, -0.5);
  // A larger offset reports a longer remaining margin for the same observation.
  assert.equal(
    evaluateSignalPolicy(
      packet({
        profile: profile({ redStopLineOffsetM: 5 }),
        observation: { ...packet().observation!, distanceToStopLineM: 20 },
      }),
    ).remainingToStopPointM,
    15,
  );
  for (const datum of [
    { distanceToStopLineM: 20 },
    { distanceToStopLineM: 0.5 },
    { distanceToStopLineM: null },
  ]) {
    const decision = evaluateSignalPolicy(
        packet({ observation: { ...packet().observation!, ...datum } }),
      ),
      sample = 0;
    assert.equal(
      decision.reason,
      referenceSignal({ ...RED_REFERENCE, ...datum, complianceSample: sample }).reason,
    );
    assert.equal(
      decision.remainingToStopPointM,
      datum.distanceToStopLineM === null ? null : datum.distanceToStopLineM - 1,
    );
    assert.equal(decision.stopRequested, true);
  }
  const oracle = referenceSignal({ ...RED_REFERENCE, complianceSample: 0 });
  assert.equal(oracle.reason, approaching.reason);
  for (const distanceToStopLineM of [20, 3, 0.5, 0])
    assert.equal(
      evaluateSignalPolicy(
        packet({ observation: { ...packet().observation!, distanceToStopLineM } }),
      ).reason,
      referenceSignal({ ...RED_REFERENCE, distanceToStopLineM, complianceSample: 0 }).reason,
    );
});

test('050 the compliance sample is drawn once per opportunity and is never re-sampled per tick', () => {
  const compliant = findOpportunity(0, 0.5, true),
    nonCompliant = findOpportunity(0, 0.5, false),
    p = 0.5;
  assert(sampledUnit(compliant.key) < p);
  assert(sampledUnit(nonCompliant.key) >= p);
  const first = evaluateSignalPolicy(
    packet({
      profile: profile({ redStopProbability: p }),
      opportunityKey: compliant.key,
      observation: { ...packet().observation!, distanceToStopLineM: 20 },
    }),
  );
  assert.equal(first.action, 'STOP');
  assert.equal(first.sampledUnit, compliant.unit);
  // Re-evaluated across advancing decision ticks and re-read observations: same opportunity, one value.
  for (let decisionTick = 61; decisionTick < 121; decisionTick += 6) {
    for (const distanceToStopLineM of [20, 10, 2, 0.2]) {
      const again = evaluateSignalPolicy(
        packet({
          profile: profile({ redStopProbability: p }),
          opportunityKey: compliant.key,
          decisionTick,
          observation: {
            ...packet().observation!,
            tick: decisionTick - 1,
            phaseElapsedS: (decisionTick - 60) / 60,
            distanceToStopLineM,
          },
        }),
      );
      assert.equal(again.sampledUnit, first.sampledUnit);
      assert.equal(again.action, 'STOP');
    }
  }
  const runner = evaluateSignalPolicy(
    packet({ profile: profile({ redStopProbability: p }), opportunityKey: nonCompliant.key }),
  );
  assert.equal(runner.sampledUnit, nonCompliant.unit);
  // Different opportunities are addressed independently, never through a consumed counter.
  assert.notEqual(
    evaluateSignalPolicy(packet({ profile: profile({ redStopProbability: p }) })).sampledUnit,
    evaluateSignalPolicy(
      packet({ profile: profile({ redStopProbability: p }), opportunityKey: opportunity(600) }),
    ).sampledUnit,
  );
  // A profile with zero compliance can never satisfy the inclusive comparison: no compliance stop.
  const zeroCompliance = evaluateSignalPolicy(
    packet({
      profile: profile({ redStopProbability: 0 }),
      speedMps: 4,
      observation: { ...packet().observation!, distanceToStopLineM: 2 },
    }),
  );
  assert.equal(zeroCompliance.reason, 'CROSS_RED_BY_PROFILE');
  assert.equal(zeroCompliance.stopRequested, false);
  assert.equal(sampledUnit(compliant.key), first.sampledUnit);
});

test('050 a non-compliant profile crosses on red unless the late-red horizon still allows braking', () => {
  const nonCompliant = findOpportunity(0, 1, true).key,
    base = packet({ profile: profile({ redStopProbability: 0, lateRedBrakeThresholdS: 1 }) });
  // 3 s to the line versus a 1 s horizon: braking is still initiated.
  const braking = evaluateSignalPolicy({
    ...base,
    opportunityKey: nonCompliant,
    observation: { ...base.observation!, distanceToStopLineM: 24 },
  });
  assert.equal(braking.action, 'STOP');
  assert.equal(braking.reason, 'LATE_RED_BRAKE');
  assert.equal(braking.stopRequested, true);
  // 0.25 s to the line: already committed, the red is run.
  const committed = evaluateSignalPolicy({
    ...base,
    opportunityKey: nonCompliant,
    observation: { ...base.observation!, distanceToStopLineM: 2 },
  });
  assert.equal(committed.action, 'PROCEED');
  assert.equal(committed.reason, 'CROSS_RED_BY_PROFILE');
  assert.equal(committed.stopRequested, false);
  for (const lateRedBrakeThresholdS of [0.2, 1, 2, 6])
    assert.equal(
      evaluateSignalPolicy({
        ...base,
        profile: profile({ redStopProbability: 0, lateRedBrakeThresholdS }),
        opportunityKey: nonCompliant,
        observation: { ...base.observation!, distanceToStopLineM: 24 },
      }).reason,
      referenceSignal({
        ...RED_REFERENCE,
        redStopProbability: 0,
        lateRedBrakeThresholdS,
        distanceToStopLineM: 24,
        complianceSample: 0.9,
      }).reason,
    );
  // An unauthored stop line cannot be stopped for; the policy reports the limitation, never a fake stop.
  const noGeometry = evaluateSignalPolicy({
    ...base,
    opportunityKey: nonCompliant,
    observation: { ...base.observation!, distanceToStopLineM: null },
  });
  assert.equal(noGeometry.reason, 'CROSS_RED_BY_PROFILE');
  assert.equal(noGeometry.remainingToStopPointM, null);
});

test('050 unsignalled, stale and missing-profile facts stay explicit and admission is strict', () => {
  const free = packet({ observation: null });
  assert.equal(evaluateSignalPolicy(free).action, 'PROCEED');
  assert.equal(evaluateSignalPolicy(free).reason, 'NO_SIGNAL');
  assert.equal(evaluateSignalPolicy(free).signalState, null);
  assert.equal(evaluateSignalPolicy(packet({ profile: null })).action, 'UNKNOWN');
  for (const observation of [
    { ...packet().observation!, tick: 62 },
    { ...packet().observation!, tick: 53 },
  ]) {
    const decision = evaluateSignalPolicy(packet({ observation }));
    assert.equal(decision.action, 'UNKNOWN');
    assert.equal(decision.reason, 'UNAVAILABLE');
  }
  assert.equal(
    evaluateSignalPolicy(
      packet({ observation: { ...packet().observation!, tick: 61, phaseElapsedS: 0.0001 } }),
    ).action,
    'STOP',
  );
  let getterCalls = 0;
  const getter = {
    ...packet(),
    get decisionTick() {
      getterCalls++;
      return 61;
    },
  };
  assert.throws(() => evaluateSignalPolicy(getter));
  assert.equal(getterCalls, 0);
  for (const invalid of [
    { ...packet(), seed: 2 ** 32 },
    { ...packet(), seed: 1.5 },
    { ...packet(), seed: -1 },
    { ...packet(), opportunityKey: '  padded' },
    { ...packet(), opportunityKey: 'x'.repeat(SIGNAL_POLICY_LIMITS.opportunityKeyCodeUnits + 1) },
    { ...packet(), speedMps: 101 },
    { ...packet(), decisionTick: -1 },
    { ...packet(), actor: { id: '', incarnation: 1 } },
    { ...packet(), profile: profile({ redStopProbability: 1.2 }) },
    { ...packet(), profile: profile({ lateRedBrakeThresholdS: 0.1 }) },
    { ...packet(), observation: { ...packet().observation!, state: 'BLUE' } },
    { ...packet(), observation: { ...packet().observation!, phaseElapsedS: -1 } },
    { ...packet(), observation: { ...packet().observation!, distanceToStopLineM: 1e9 } },
    { ...packet(), extra: true },
  ])
    assert.throws(() => evaluateSignalPolicy(invalid as SignalPolicyInput));
  const before = JSON.stringify(packet());
  for (let cycle = 0; cycle < 20; cycle++)
    assert.equal(evaluateSignalPolicy(packet()).retainedHistory, 0);
  assert.equal(JSON.stringify(packet()), before);
  assert.deepEqual(getSignalPolicyStats(), {
    evaluating: false,
    retainedActors: 0,
    retainedOpportunities: 0,
    retainedHistory: 0,
  });
});

test('050 real 045 composition turns the policy facts into WAIT_RED_BY_PROFILE without losing independent stops', () => {
  const base: BehaviorFacts = {
    version: '045-decision-facts-v1',
    profileVersionId: 'signal-base-v1',
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
  const stopped = evaluateSignalPolicy(packet());
  assert.deepEqual(signalBehaviorFacts(base, stopped), { ...base, stop: 'RED_BY_PROFILE' });
  // The explicit red intent has precedence over an independent STOP-rule fact, which is preserved
  // whenever the signal releases.
  assert.equal(
    signalBehaviorFacts({ ...base, stop: 'STOP_RULE_BY_PROFILE' }, stopped)!.stop,
    'RED_BY_PROFILE',
  );
  assert.equal(
    signalBehaviorFacts({ ...base, stop: 'REQUESTED' }, stopped)!.stop,
    'RED_BY_PROFILE',
  );
  // Releasing the red clears only its own fact.
  const released = evaluateSignalPolicy(
    packet({ observation: { ...packet().observation!, state: 'GREEN', phaseElapsedS: 9 } }),
  );
  assert.equal(signalBehaviorFacts({ ...base, stop: 'RED_BY_PROFILE' }, released)!.stop, 'NONE');
  assert.equal(
    signalBehaviorFacts({ ...base, stop: 'STOP_RULE_BY_PROFILE' }, released)!.stop,
    'STOP_RULE_BY_PROFILE',
  );
  // An unavailable observation yields no fabricated facts at all.
  assert.equal(signalBehaviorFacts(base, evaluateSignalPolicy(packet({ profile: null }))), null);
  assert.throws(() => signalBehaviorFacts({ ...base, profileVersionId: 'foreign' }, stopped));
  const scope = { sessionId: 'signal-test', worldEpoch: 0 },
    owner = createBehaviorFSM(scope);
  owner.setActors([ACTOR], scope);
  const context = {
      ...scope,
      sourceTick: 60,
      subject: ACTOR,
      laneId: 'west-in',
      leaderId: null,
      vehiclesComplete: true,
      discontinuity: false,
    },
    decision = owner.decide({
      ...scope,
      actor: ACTOR,
      decisionTick: 61,
      context,
      facts: signalBehaviorFacts(base, stopped),
    });
  assert.equal(decision.state, 'STOP');
  assert.equal(decision.reason, 'WAIT_RED_BY_PROFILE');
  const following = owner.decide({
    ...scope,
    actor: ACTOR,
    decisionTick: 67,
    context: { ...context, sourceTick: 66 },
    facts: parseBehaviorFacts(signalBehaviorFacts(base, released)!),
  });
  assert.equal(following.state, 'FOLLOW');
  owner.dispose();
});
