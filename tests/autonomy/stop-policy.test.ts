import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STOP_POLICY_LIMITS,
  evaluateStopPolicy,
  getStopPolicyStats,
  projectStopProfile,
  stopBehaviorFacts,
} from '../../src/autonomy/stop-policy';
import type {
  StopPolicyDecision,
  StopPolicyInput,
  StopPolicyObservation,
  StopPolicyProfile,
} from '../../src/autonomy/stop-policy';
import { createBehaviorFSM } from '../../src/autonomy/behavior-fsm';
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
import { referenceStop } from './stop-policy-reference';
import { stopApproachProfile, stopProbeFixture } from './policy-probe-fixture';

const SEED = deriveVehicleSeed(deriveScenarioSeed(12345, 'city:one'), 'taxi');
const SCOPE = { sessionId: 'stop-test', worldEpoch: 0 };
const ACTOR = { id: 'taxi', incarnation: 1 };
function opportunityId(index: number) {
  return `stop-opportunity-${index}`;
}
function sampledUnit(id: string) {
  return randomUnit(deriveOpportunitySeed(SEED, id), 'full-stop', 0);
}
function findOpportunity(from: number, threshold: number, below: boolean) {
  for (let index = from; index < from + 2000; index++) {
    const id = opportunityId(index),
      unit = sampledUnit(id);
    if (below ? unit < threshold : unit >= threshold) return Object.freeze({ id, unit, index });
  }
  throw new Error('No matching STOP opportunity in fixture range');
}
function published(values: Partial<Record<string, number>> = {}) {
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: 'stop-style',
    versionId: 'stop-base-v1',
    parentVersionId: null,
    engineVersion: 'test',
    parameters: { stop_full_probability: 1, stop_dwell_time: 1, stop_line_offset: 1, ...values },
    unitsByParameter: {
      stop_full_probability: 'probability',
      stop_dwell_time: 's',
      stop_line_offset: 'm',
    },
    provenanceByParameter: {
      stop_full_probability: 'BASE',
      stop_dwell_time: 'BASE',
      stop_line_offset: 'BASE',
    },
    evidenceByParameter: {
      stop_full_probability: null,
      stop_dwell_time: null,
      stop_line_offset: null,
    },
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: 'fixture',
  });
}
function profile(overrides: Partial<StopPolicyProfile> = {}): StopPolicyProfile {
  return Object.freeze({ ...projectStopProfile(published()), ...overrides });
}
function observed(overrides: Partial<StopPolicyObservation> = {}): StopPolicyObservation {
  return {
    version: STOP_POLICY_LIMITS.observationVersion,
    units: 'SI',
    tick: 60,
    opportunityId: findOpportunity(0, 1, true).id,
    stopLineId: 'signal-stop',
    distanceToStopLineM: 12,
    speedMps: 6,
    stationaryDurationS: null,
    crossed: false,
    ...overrides,
  };
}
function packet(overrides: Partial<StopPolicyInput> = {}): StopPolicyInput {
  return {
    ...SCOPE,
    actor: ACTOR,
    decisionTick: 61,
    seed: SEED,
    profile: profile(),
    observation: observed(),
    leaderStop: 'NONE',
    ...overrides,
  };
}
test('051 projectStopProfile reads only its three published values and does not grant estimator support', () => {
  const projected = projectStopProfile(published({ stop_full_probability: 0.4 }));
  assert.deepEqual(projected, {
    versionId: 'stop-base-v1',
    stopFullProbability: 0.4,
    stopDwellTimeS: 1,
    stopLineOffsetM: 1,
  });
  assert(Object.isFrozen(projected));
  for (const key of ['stop_full_probability', 'stop_dwell_time', 'stop_line_offset']) {
    assert.equal(getParameterDefinition(key).implemented, true);
    assert.equal(getParameterDefinition(key).estimable, false);
  }
  assert.equal(getParameterDefinition('stop_full_probability').unit, 'probability');
  assert.throws(() =>
    projectStopProfile({
      ...published(),
      unitsByParameter: { ...published().unitsByParameter, stop_dwell_time: 'm' },
    }),
  );
  assert.throws(() =>
    projectStopProfile({ ...published(), parameters: { stop_full_probability: 2 } }),
  );
});
test('051 a free STOP approaches the offset point, holds until the authoritative proof and then releases', () => {
  const approaching = evaluateStopPolicy(packet());
  assert.equal(approaching.action, 'APPROACH');
  assert.equal(approaching.reason, 'STOP_APPROACH');
  assert.equal(approaching.stopRequested, true);
  assert.equal(approaching.remainingToStopPointM, 11);
  const unpromised = evaluateStopPolicy(
    packet({ observation: observed({ distanceToStopLineM: 0.5 }) }),
  );
  assert.equal(unpromised.action, 'HOLD');
  assert.equal(unpromised.reason, 'STOP_HOLD');
  assert.equal(unpromised.remainingToStopPointM, -0.5);
  const during = evaluateStopPolicy(
    packet({
      observation: observed({ distanceToStopLineM: 0.5, stationaryDurationS: 0.4 }),
    }),
  );
  assert.equal(during.reason, 'DWELL_IN_PROGRESS');
  assert.equal(during.stopRequested, true);
  // The dwell comparison is inclusive: exactly the configured duration releases.
  const exact = evaluateStopPolicy(
    packet({ observation: observed({ distanceToStopLineM: 0.5, stationaryDurationS: 1 }) }),
  );
  assert.equal(exact.action, 'RELEASE');
  assert.equal(exact.reason, 'DWELL_SATISFIED');
  assert.equal(exact.stopRequested, false);
  // A longer configured dwell keeps the same observation holding.
  assert.equal(
    evaluateStopPolicy(
      packet({
        profile: profile({ stopDwellTimeS: 4 }),
        observation: observed({ distanceToStopLineM: 0.5, stationaryDurationS: 1 }),
      }),
    ).reason,
    'DWELL_IN_PROGRESS',
  );
  for (const stationaryDurationS of [null, 0.2, 1, 3])
    assert.equal(
      evaluateStopPolicy(
        packet({ observation: observed({ distanceToStopLineM: 0.5, stationaryDurationS }) }),
      ).reason,
      referenceStop({
        stopFullProbability: 1,
        stopDwellTimeS: 1,
        stopLineOffsetM: 1,
        distanceToStopLineM: 0.5,
        stationaryDurationS,
        crossed: false,
        fullStopSample: 0,
      }).reason,
    );
});
test('051 prudent and rolling profiles differ, and one sample per037 opportunity is never re-drawn', () => {
  const prudent = findOpportunity(0, 0.5, true),
    rolling = findOpportunity(0, 0.5, false);
  const full = evaluateStopPolicy(
    packet({
      profile: profile({ stopFullProbability: 0.5 }),
      observation: observed({ opportunityId: prudent.id, distanceToStopLineM: 0.5 }),
    }),
  );
  assert.equal(full.sampledRole, 'FULL');
  assert.equal(full.sampledUnit, prudent.unit);
  assert.equal(full.stopRequested, true);
  const roll = evaluateStopPolicy(
    packet({
      profile: profile({ stopFullProbability: 0.5 }),
      observation: observed({ opportunityId: rolling.id, distanceToStopLineM: 0.5 }),
    }),
  );
  assert.equal(roll.sampledRole, 'ROLLING');
  assert.equal(roll.action, 'ROLL_THROUGH');
  assert.equal(roll.reason, 'ROLLING_STOP_BY_PROFILE');
  assert.equal(roll.stopRequested, false);
  // Distinct outcomes for the same geometry: the prudent profile waits for the proof, the rolling
  // profile never does, so the observed stop differs without any hidden style cap.
  assert.notEqual(full.action, roll.action);
  // The same identified opportunity reproduces one sample across advancing ticks and re-reads.
  for (let decisionTick = 61; decisionTick < 121; decisionTick += 6)
    for (const distanceToStopLineM of [12, 4, 0.5])
      assert.equal(
        evaluateStopPolicy(
          packet({
            profile: profile({ stopFullProbability: 0.5 }),
            decisionTick,
            observation: observed({
              opportunityId: prudent.id,
              tick: decisionTick - 1,
              distanceToStopLineM,
            }),
          }),
        ).sampledUnit,
        prudent.unit,
      );
  assert.equal(
    evaluateStopPolicy(
      packet({ profile: profile({ stopFullProbability: 0 }), observation: observed() }),
    ).sampledRole,
    'ROLLING',
  );
});
test('051 a leader-induced hold is never attributed to the driver STOP intent', () => {
  const leaderOnly = evaluateStopPolicy(
    packet({ observation: null, leaderStop: 'LEADER_OR_QUEUE' }),
  );
  assert.equal(leaderOnly.action, 'NO_STOP');
  assert.equal(leaderOnly.reason, 'LEADER_STOP_NOT_STOP_INTENT');
  assert.equal(leaderOnly.stopRequested, false);
  assert.equal(leaderOnly.leaderInduced, true);
  assert.equal(leaderOnly.sampledUnit, null);
  const noObservation = evaluateStopPolicy(packet({ observation: null }));
  assert.equal(noObservation.reason, 'NO_STOP_OBSERVATION');
  assert.equal(noObservation.leaderInduced, false);
  // Both evidence paths can be active at once: the queue never suppresses a real STOP intent.
  const queuedAtStop = evaluateStopPolicy(packet({ leaderStop: 'LEADER_OR_QUEUE' }));
  assert.equal(queuedAtStop.action, 'APPROACH');
  assert.equal(queuedAtStop.stopRequested, true);
  assert.equal(queuedAtStop.leaderInduced, false);
  const base: BehaviorFacts = {
    version: '045-decision-facts-v1',
    profileVersionId: 'stop-base-v1',
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
  // The real 045 owner keeps FOLLOW for a leader-held ego and STOP only for the driver's intent.
  const scope = { sessionId: 'stop-test', worldEpoch: 0 },
    owner = createBehaviorFSM(scope),
    context = {
      ...scope,
      sourceTick: 60,
      subject: ACTOR,
      laneId: 'lane-a',
      leaderId: 'civil-ahead',
      vehiclesComplete: true,
      discontinuity: false,
    };
  owner.setActors([ACTOR, { id: 'civil-ahead', incarnation: 1 }], scope);
  const following = owner.decide({
    ...scope,
    actor: ACTOR,
    decisionTick: 61,
    context,
    facts: stopBehaviorFacts(base, leaderOnly),
  });
  assert.equal(following.state, 'FOLLOW');
  assert.equal(following.reason, 'FOLLOW_LEADER');
  const stopped = owner.decide({
    ...scope,
    actor: ACTOR,
    decisionTick: 67,
    context: { ...context, sourceTick: 66 },
    facts: stopBehaviorFacts(base, evaluateStopPolicy(packet({ leaderStop: 'LEADER_OR_QUEUE' }))),
  });
  assert.equal(stopped.state, 'STOP');
  assert.equal(stopped.reason, 'WAIT_STOP_BY_PROFILE');
  const released = owner.decide({
    ...scope,
    actor: ACTOR,
    decisionTick: 73,
    context: { ...context, sourceTick: 72 },
    facts: stopBehaviorFacts(
      base,
      evaluateStopPolicy(
        packet({
          observation: observed({ distanceToStopLineM: 0.5, stationaryDurationS: 2 }),
        }),
      ),
    ),
  });
  assert.equal(released.state, 'FOLLOW');
  owner.dispose();
});
test('051 crossing, unavailable facts, red precedence and strict admission stay explicit', () => {
  const base: BehaviorFacts = {
    version: '045-decision-facts-v1',
    profileVersionId: 'stop-base-v1',
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
  const crossed = evaluateStopPolicy(
    packet({ observation: observed({ crossed: true, distanceToStopLineM: -1 }) }),
  );
  assert.equal(crossed.action, 'RELEASE');
  assert.equal(crossed.reason, 'STOP_LINE_CROSSED');
  assert.equal(crossed.stopRequested, false);
  assert.deepEqual(stopBehaviorFacts(base, crossed), base);
  assert.equal(evaluateStopPolicy(packet({ profile: null })).action, 'UNKNOWN');
  assert.equal(evaluateStopPolicy(packet({ profile: null })).reason, 'MISSING_PROFILE');
  assert.equal(stopBehaviorFacts(base, evaluateStopPolicy(packet({ profile: null }))), null);
  for (const observation of [observed({ tick: 62 }), observed({ tick: 54 })])
    assert.equal(evaluateStopPolicy(packet({ observation })).action, 'UNKNOWN');
  const stopping = evaluateStopPolicy(packet());
  assert.equal(stopBehaviorFacts(base, stopping)!.stop, 'STOP_RULE_BY_PROFILE');
  // An independent red intent is preserved and the STOP bridge never clears it.
  assert.equal(
    stopBehaviorFacts({ ...base, stop: 'RED_BY_PROFILE' }, stopping)!.stop,
    'RED_BY_PROFILE',
  );
  assert.equal(stopBehaviorFacts({ ...base, stop: 'STOP_RULE_BY_PROFILE' }, crossed)!.stop, 'NONE');
  assert.throws(() => stopBehaviorFacts({ ...base, profileVersionId: 'foreign' }, stopping));
  let getterCalls = 0;
  const getter = {
    ...packet(),
    get decisionTick() {
      getterCalls++;
      return 61;
    },
  };
  assert.throws(() => evaluateStopPolicy(getter));
  assert.equal(getterCalls, 0);
  for (const invalid of [
    { ...packet(), seed: 2 ** 32 },
    { ...packet(), leaderStop: 'LEADER' },
    { ...packet(), decisionTick: -1 },
    { ...packet(), profile: profile({ stopFullProbability: 1.5 }) },
    { ...packet(), profile: profile({ stopLineOffsetM: 6 }) },
    { ...packet(), observation: observed({ opportunityId: '' }) },
    { ...packet(), observation: observed({ stationaryDurationS: -1 }) },
    { ...packet(), observation: observed({ speedMps: 101 }) },
    { ...packet(), observation: observed({ distanceToStopLineM: 2000 }) },
    { ...packet(), observation: { ...observed(), crossed: 'yes' } },
    { ...packet(), extra: true },
  ])
    assert.throws(() => evaluateStopPolicy(invalid as StopPolicyInput));
  assert.deepEqual(getStopPolicyStats(), {
    evaluating: false,
    retainedActors: 0,
    retainedOpportunities: 0,
    retainedHistory: 0,
  });
  const before = JSON.stringify(packet());
  for (let cycle = 0; cycle < 20; cycle++)
    assert.equal(evaluateStopPolicy(packet()).retainedHistory, 0);
  assert.equal(JSON.stringify(packet()), before);
});
test('051 real037 drive proves the dwell and the opportunity identity the policy consumes', () => {
  const fixture = stopProbeFixture(),
    profileData = profile({ stopDwellTimeS: 0.5 }),
    seed = SEED,
    frames = stopApproachProfile({
      ticks: 260,
      stopPointM: fixture.stopLineLongitudinalM - 1,
      holdTicks: 45,
      stepM: 0.15,
    }),
    transitions = { approach: 0, hold: 0, during: 0, release: 0 },
    fullStops: { opportunityId: string; durationS: number }[] = [];
  let opportunityId: string | null = null,
    stopLineId: string | null = null,
    crossed = false,
    stationaryDurationS = 0,
    lastDecision: StopPolicyDecision | null = null,
    requestedTicks = 0;
  for (const frame of frames) {
    const events = fixture.rules.observe({
      ...fixture.context,
      tick: frame.tick,
      vehicleId: ACTOR.id,
      incarnation: 'taxi-1',
      laneId: 'lane-a',
      access: 'TAXI',
      frontPositionM: { x: frame.xM, y: 0, z: 0 },
      headingRad: 0,
      speedMps: frame.speedMps,
      discontinuity: false,
    });
    for (const event of events) {
      if (event.type === 'STOP_APPROACH') opportunityId = event.payload.opportunityId;
      if (event.type === 'FULL_STOP')
        fullStops.push({
          opportunityId: event.payload.opportunityId,
          durationS: event.payload.durationS,
        });
      if (event.type === 'STOP_LINE_CROSSED') {
        crossed = true;
        stopLineId = event.payload.stopLineId;
      }
    }
    stationaryDurationS = frame.speedMps === 0 ? stationaryDurationS + 1 / 60 : 0;
    if (frame.tick % 6 !== 0) continue;
    const decision = evaluateStopPolicy({
      ...fixture.context,
      actor: ACTOR,
      decisionTick: frame.tick,
      seed,
      profile: profileData,
      leaderStop: 'NONE',
      observation:
        opportunityId === null
          ? null
          : {
              version: STOP_POLICY_LIMITS.observationVersion,
              units: 'SI',
              tick: frame.tick - 1,
              opportunityId,
              stopLineId: stopLineId ?? fixture.map.stopLines[0].id,
              distanceToStopLineM: fixture.stopLineLongitudinalM - frame.xM,
              speedMps: frame.speedMps,
              stationaryDurationS: stationaryDurationS > 0 ? stationaryDurationS : null,
              crossed,
            },
    });
    lastDecision = decision;
    if (decision.stopRequested) requestedTicks++;
    if (decision.reason === 'STOP_APPROACH') transitions.approach++;
    if (decision.reason === 'STOP_HOLD') transitions.hold++;
    if (decision.reason === 'DWELL_IN_PROGRESS') transitions.during++;
    if (decision.reason === 'DWELL_SATISFIED') transitions.release++;
  }
  // Real037 evidence: one approach, one crossing and a proven full stop for the same opportunity.
  assert(fullStops.length >= 1);
  assert(crossed);
  assert.equal(stopLineId, fixture.map.stopLines[0].id);
  assert.ok(transitions.approach > 0 && transitions.hold > 0 && transitions.during > 0);
  // A sustained authoritative dwell proof releases the driver's own stop before the line.
  assert.ok(transitions.release > 0);
  assert.equal(lastDecision!.action, 'RELEASE');
  assert.equal(lastDecision!.stopRequested, false);
  assert.ok(requestedTicks > 0);
  // A dwell requirement above the observed proof never releases on the same run.
  const stricter = frames
    .filter((frame) => frame.tick % 6 === 0)
    .map((frame) =>
      evaluateStopPolicy({
        ...fixture.context,
        actor: ACTOR,
        decisionTick: frame.tick,
        seed,
        profile: profile({ stopDwellTimeS: 4 }),
        leaderStop: 'NONE',
        observation: {
          version: STOP_POLICY_LIMITS.observationVersion,
          units: 'SI',
          tick: frame.tick - 1,
          opportunityId: fullStops[0].opportunityId,
          stopLineId: fixture.map.stopLines[0].id,
          distanceToStopLineM: fixture.stopLineLongitudinalM - frame.xM,
          speedMps: frame.speedMps,
          stationaryDurationS: fullStops[0].durationS,
          crossed: false,
        },
      }),
    );
  assert(stricter.every((decision) => decision.stopRequested));
  fixture.rules.dispose();
});
