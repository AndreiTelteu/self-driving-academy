import assert from 'node:assert/strict';
import test from 'node:test';
import { createBehaviorFSM, projectBehaviorContext } from '../../src/autonomy/behavior-fsm';
import type { BehaviorActor, BehaviorFacts } from '../../src/autonomy/behavior-fsm';
import {
  consumedInfluences,
  createDecisionExplainer,
  explainDecision,
} from '../../src/autonomy/decision-explanation';
import type { DecisionExplanation } from '../../src/autonomy/decision-explanation';
import { compileFollowingProfile, evaluateFollowingTarget } from '../../src/autonomy/following';
import {
  evaluateSignalPolicy,
  projectSignalProfile,
  signalBehaviorFacts,
  signalOpportunityKey,
  SIGNAL_POLICY_LIMITS,
} from '../../src/autonomy/signal-policy';
import {
  evaluateStopPolicy,
  projectStopProfile,
  stopBehaviorFacts,
  STOP_POLICY_LIMITS,
} from '../../src/autonomy/stop-policy';
import {
  evaluateYieldPolicy,
  projectYieldProfile,
  yieldBehaviorFacts,
  YIELD_POLICY_LIMITS,
} from '../../src/autonomy/yield-policy';
import {
  evaluateLaneChange,
  LANE_CHANGE_EMPTY_STATE,
  laneChangeBehaviorFacts,
  projectLaneChangeProfile,
} from '../../src/autonomy/lane-change-policy';
import {
  BLOCKED_RECOVERY_EMPTY_STATE,
  blockedRecoveryBehaviorFacts,
  evaluateBlockedRecovery,
} from '../../src/autonomy/blocked-recovery';
import { ContractValidationError, deriveScenarioSeed, deriveVehicleSeed } from '../../src/sessions';
import {
  getParameterDefinition,
  parsePublishableDrivingProfile,
} from '../../src/profiles/parameter-registry';
import { createFollowingTargetFixture } from './following-target-fixture';
import { followingProfile } from './following-reference';
import {
  blockedProbeFixture,
  laneProbeFixture,
  signalProbeFixture,
  stopApproachProfile,
  stopProbeFixture,
} from './policy-probe-fixture';

/** Every V1 policy key plus the two shared style keys; the published profile carries all of them. */
const PROFILE_KEYS = [
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
  'yield_time_gap',
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
] as const;
function sharedProfile(sessionId: string, overrides: Readonly<Record<string, number>> = {}) {
  const parameters: Record<string, number> = {},
    unitsByParameter: Record<string, string> = {},
    provenanceByParameter: Record<string, string> = {},
    evidenceByParameter: Record<string, null> = {};
  for (const key of PROFILE_KEYS) {
    parameters[key] = overrides[key] ?? getParameterDefinition(key).default;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: `055-${sessionId}`,
    versionId: '055-profile-v1',
    parentVersionId: null,
    engineVersion: '055-v1',
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: 'fixture',
  });
}
function baseFacts(profileVersionId: string): BehaviorFacts {
  return {
    version: '045-decision-facts-v1',
    profileVersionId,
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
}
function inf(
  ...pairs: (readonly [string, number | null])[]
): readonly (readonly [string, number | null])[] {
  return pairs;
}
/** Asserts the frozen shape at every level and that no live reference to the source survived. */
function assertFrozenExplanation(explanation: DecisionExplanation, behavior: object) {
  assert(Object.isFrozen(explanation));
  assert(Object.isFrozen(explanation.actor));
  assert(Object.isFrozen(explanation.behavior));
  assert(Object.isFrozen(explanation.reasons));
  assert(Object.isFrozen(explanation.targets));
  assert(Object.isFrozen(explanation.influences));
  for (const influence of explanation.influences) assert(Object.isFrozen(influence));
  for (const target of explanation.targets) assert(Object.isFrozen(target));
  assert.notEqual(explanation.behavior, behavior, 'no live reference into the 045 decision');
  assert.equal(explanation.reasons[explanation.reasons.length - 1], explanation.behavior.reason);
  assert(explanation.reasons.length >= 1);
  for (const influence of explanation.influences) {
    assert.equal(influence.implemented, true);
    assert.equal(getParameterDefinition(influence.key).implemented, true);
  }
}

test('055 explains FOLLOW and FOLLOW_LEADER from the real044/045/046/048 chain', () => {
  const sessionId = '055-follow',
    scope = { sessionId, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'car', incarnation: 1 },
    profile = compileFollowingProfile(followingProfile()),
    fixture = createFollowingTargetFixture(profile.longitudinal.cruise, actor, scope),
    cruiseValues = profile.longitudinal.cruise.values;
  try {
    // No leader: 044 gives no leader, so the real chain ends in FOLLOW_LANE.
    const lane = fixture.input(1, 5, 8, 4, null),
      laneBehavior = lane.cruiseInput.behavior!,
      laneFollowing = evaluateFollowingTarget({
        cruiseInput: lane.cruiseInput,
        roadContext: lane.roadContext,
        observation: lane.observation,
        profile,
      });
    assert.equal(laneBehavior.state, 'FOLLOW');
    assert.equal(laneBehavior.reason, 'FOLLOW_LANE');
    assert.equal(laneFollowing.reason, 'NO_LEADER');
    const laneExplanation = explainDecision({
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: 1,
      behavior: laneBehavior,
      reasons: [lane.cruise.reason, laneFollowing.reason, laneBehavior.reason],
      action: null,
      targets: [{ name: 'targetMps', value: lane.cruise.targetMps }],
      // Only speed_delta_urban was consumed: URBAN road, no curve, no intersection approach.
      influences: inf(['speed_delta_urban', cruiseValues.speed_delta_urban]),
    });
    assertFrozenExplanation(laneExplanation, laneBehavior);
    assert.deepEqual(
      laneExplanation.influences.map((entry) => entry.key),
      ['speed_delta_urban'],
    );

    // A leader appears: the real chain ends in FOLLOW_LEADER and consumes the 048 keys it used.
    const withLeader = fixture.input(2, 5, 8, 4, 'leader'),
      behavior = withLeader.cruiseInput.behavior!,
      following = evaluateFollowingTarget({
        cruiseInput: withLeader.cruiseInput,
        roadContext: withLeader.roadContext,
        observation: withLeader.observation,
        profile,
      });
    assert.equal(behavior.state, 'FOLLOW');
    assert.equal(behavior.reason, 'FOLLOW_LEADER');
    assert(following.reason === 'FOLLOWING_GAP' || following.reason === 'QUEUE_GAP');
    assert(following.desiredGapM !== null && following.preferredFollowingMps !== null);
    const values = profile.values;
    const explanation = explainDecision({
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: 2,
      behavior,
      reasons: [withLeader.cruise.reason, following.reason, behavior.reason],
      action: null,
      targets: [
        { name: 'cruiseTargetMps', value: withLeader.cruise.targetMps },
        { name: 'desiredGapM', value: following.desiredGapM },
        { name: 'preferredFollowingMps', value: following.preferredFollowingMps },
      ],
      influences: inf(
        ['speed_delta_urban', cruiseValues.speed_delta_urban],
        ['following_time_headway', values.following_time_headway],
        ['following_min_gap', values.following_min_gap],
        ['following_speed_gain', values.following_speed_gain],
      ),
    });
    assertFrozenExplanation(explanation, behavior);
    assert(explanation.influences.length === 4);
    // queue_standstill_gap was not consumed by a moving leader; it must not be claimed.
    assert(!explanation.influences.some((entry) => entry.key === 'queue_standstill_gap'));
  } finally {
    fixture.dispose();
  }
});

test('055 explains STOP on red and on a real037 STOP rule', () => {
  // Red by profile: the real 044/036 signal chain plus the 050 policy drive a compliant stop.
  const fixture = signalProbeFixture(),
    frame = fixture.frame,
    sessionId = frame.sessionId,
    scope = { sessionId, worldEpoch: 0 },
    subject = frame.vehicles.find((vehicle) => vehicle.route?.movementId === 'west-straight')!,
    actor: BehaviorActor = { id: subject.id, incarnation: subject.incarnation },
    profile = projectSignalProfile(sharedProfile(sessionId, { red_stop_probability: 1 })),
    seed = deriveVehicleSeed(deriveScenarioSeed(1, sessionId), actor.id),
    behavior = createBehaviorFSM(scope);
  behavior.setActors([actor], scope);
  try {
    fixture.prepare(1);
    const full = fixture.context.getContext(actor.id)!,
      signal = full.signal,
      phaseStartedTick =
        signal === null ? 0 : (fixture.signals.getSignal(signal.signalId)?.phaseStartedTick ?? 0),
      decision = evaluateSignalPolicy({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: 1,
        speedMps: 8,
        seed,
        opportunityKey: signalOpportunityKey({
          sessionId,
          worldEpoch: 0,
          vehicleId: actor.id,
          incarnation: actor.incarnation,
          intersectionId: signal?.intersectionId ?? 'junction',
          movementId: signal?.movementId ?? 'west-straight',
          phaseStartedTick,
        }),
        profile,
        observation:
          signal === null
            ? null
            : {
                version: SIGNAL_POLICY_LIMITS.observationVersion,
                units: 'SI',
                tick: 0,
                signalId: signal.signalId,
                intersectionId: signal.intersectionId,
                movementId: signal.movementId,
                phaseId: signal.phaseId,
                state: signal.state,
                phaseElapsedS: Math.max(0, (1 - phaseStartedTick) / 60),
                distanceToStopLineM:
                  full.lane === null || full.laneId === null
                    ? null
                    : fixture.stopLineDistanceM(full.laneId, full.lane.positionM),
              },
      });
    assert.equal(decision.stopRequested, true);
    const facts = signalBehaviorFacts(baseFacts(profile.versionId), decision)!;
    const redBehavior = behavior.decide({
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: 1,
      context: projectBehaviorContext(full),
      facts,
    });
    assert.equal(redBehavior.state, 'STOP');
    assert.equal(redBehavior.reason, 'WAIT_RED_BY_PROFILE');
    const red = explainDecision({
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: 1,
      behavior: redBehavior,
      reasons: [decision.reason, redBehavior.reason],
      action: decision.action,
      targets: [
        { name: 'sampledUnit', value: decision.sampledUnit! },
        { name: 'remainingToStopPointM', value: decision.remainingToStopPointM ?? 0 },
      ],
      // The compliant red stop consumed only the compliance sample and the line offset.
      influences: inf(
        ['red_stop_probability', profile.redStopProbability],
        ['red_stop_line_offset', profile.redStopLineOffsetM],
      ),
    });
    assertFrozenExplanation(red, redBehavior);
    assert(!red.influences.some((entry) => entry.key === 'green_start_delay'));
    assert(!red.influences.some((entry) => entry.key === 'late_red_brake_threshold'));

    // The same actor and 045 FSM on a green phase consumes green_start_delay instead.
    let greenTick = 0;
    for (let candidate = 2; candidate <= 120 && greenTick === 0; candidate++) {
      fixture.prepare(candidate);
      if (fixture.context.getContext(actor.id)!.signal?.state === 'GREEN') greenTick = candidate;
    }
    assert(greenTick > 0, 'the fixture signal reaches a green phase');
    const green = fixture.context.getContext(actor.id)!,
      greenSignal = green.signal,
      greenPhaseStarted =
        greenSignal === null
          ? 0
          : (fixture.signals.getSignal(greenSignal.signalId)?.phaseStartedTick ?? 0),
      greenDecision = evaluateSignalPolicy({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: greenTick,
        speedMps: 0,
        seed,
        opportunityKey: signalOpportunityKey({
          sessionId,
          worldEpoch: 0,
          vehicleId: actor.id,
          incarnation: actor.incarnation,
          intersectionId: greenSignal?.intersectionId ?? 'junction',
          movementId: greenSignal?.movementId ?? 'west-straight',
          phaseStartedTick: greenPhaseStarted,
        }),
        profile,
        observation:
          greenSignal === null
            ? null
            : {
                version: SIGNAL_POLICY_LIMITS.observationVersion,
                units: 'SI',
                tick: greenTick - 1,
                signalId: greenSignal.signalId,
                intersectionId: greenSignal.intersectionId,
                movementId: greenSignal.movementId,
                phaseId: greenSignal.phaseId,
                state: greenSignal.state,
                phaseElapsedS: Math.max(0, (greenTick - greenPhaseStarted) / 60),
                distanceToStopLineM: 20,
              },
      });
    assert.equal(greenDecision.reason, 'GREEN_START_DELAY');
    const greenBehavior = behavior.decide({
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: greenTick,
      context: projectBehaviorContext(green),
      facts: signalBehaviorFacts(baseFacts(profile.versionId), greenDecision),
    });
    const greenExplanation = explainDecision({
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: greenTick,
      behavior: greenBehavior,
      reasons: [greenDecision.reason, greenBehavior.reason],
      action: greenDecision.action,
      targets: [{ name: 'greenStartDelayS', value: profile.greenStartDelayS }],
      influences: inf(['green_start_delay', profile.greenStartDelayS]),
    });
    assertFrozenExplanation(greenExplanation, greenBehavior);
    assert.deepEqual(
      greenExplanation.influences.map((entry) => entry.key),
      ['green_start_delay'],
    );
  } finally {
    behavior.dispose();
    fixture.dispose();
  }

  // STOP rule from the real 037 producer plus the 051 policy.
  const stopFixture = stopProbeFixture(),
    stopActor: BehaviorActor = { id: 'taxi', incarnation: 1 },
    stopSession = '055-stop-rule',
    stopScope = { sessionId: stopSession, worldEpoch: 0 },
    stopProfile = projectStopProfile(
      sharedProfile(stopSession, { stop_full_probability: 1, stop_dwell_time: 0.5 }),
    ),
    stopSeed = deriveVehicleSeed(deriveScenarioSeed(2, stopSession), stopActor.id),
    stopFrames = stopApproachProfile({
      ticks: 120,
      stopPointM: stopFixture.stopLineLongitudinalM - 1,
      holdTicks: 300,
      stepM: 0.15,
    }),
    stopBehavior = createBehaviorFSM(stopScope);
  stopBehavior.setActors([stopActor], stopScope);
  try {
    let opportunityId: string | null = null,
      approach = stopFrames[0];
    for (let tick = 1; tick <= 120 && opportunityId === null; tick++) {
      const frame = stopFrames[tick - 1];
      approach = frame;
      for (const event of stopFixture.rules.observe({
        ...stopFixture.context,
        tick,
        vehicleId: stopActor.id,
        incarnation: 'taxi-1',
        laneId: 'lane-a',
        access: 'TAXI',
        frontPositionM: { x: frame.xM, y: 0, z: 0 },
        headingRad: 0,
        speedMps: frame.speedMps,
        discontinuity: false,
      }))
        if (event.type === 'STOP_APPROACH') opportunityId = event.payload.opportunityId;
    }
    assert(opportunityId !== null, 'the real037 producer offered a STOP opportunity');
    const stopDecision = evaluateStopPolicy({
      sessionId: stopSession,
      worldEpoch: 0,
      actor: stopActor,
      decisionTick: 120,
      seed: stopSeed,
      profile: stopProfile,
      leaderStop: 'NONE',
      observation: {
        version: STOP_POLICY_LIMITS.observationVersion,
        units: 'SI',
        tick: 119,
        opportunityId,
        stopLineId: stopFixture.map.stopLines[0].id,
        distanceToStopLineM: stopFixture.stopLineLongitudinalM - approach.xM,
        speedMps: approach.speedMps,
        stationaryDurationS: null,
        crossed: false,
      },
    });
    assert.equal(stopDecision.action, 'APPROACH');
    assert.equal(stopDecision.reason, 'STOP_APPROACH');
    assert.equal(stopDecision.stopRequested, true);
    const stopRuleBehavior = stopBehavior.decide({
      sessionId: stopSession,
      worldEpoch: 0,
      actor: stopActor,
      decisionTick: 120,
      context: {
        sessionId: stopSession,
        worldEpoch: 0,
        sourceTick: 120,
        subject: stopActor,
        laneId: 'lane-a',
        leaderId: null,
        vehiclesComplete: true,
        discontinuity: false,
      },
      facts: stopBehaviorFacts(baseFacts(stopProfile.versionId), stopDecision)!,
    });
    assert.equal(stopRuleBehavior.reason, 'WAIT_STOP_BY_PROFILE');
    const rule = explainDecision({
      sessionId: stopSession,
      worldEpoch: 0,
      actor: stopActor,
      decisionTick: 120,
      behavior: stopRuleBehavior,
      reasons: [stopDecision.reason, stopRuleBehavior.reason],
      action: stopDecision.action,
      targets: [
        { name: 'remainingToStopPointM', value: stopDecision.remainingToStopPointM ?? 0 },
        { name: 'sampledUnit', value: stopDecision.sampledUnit! },
      ],
      influences: inf(
        ['stop_full_probability', stopProfile.stopFullProbability],
        ['stop_line_offset', stopProfile.stopLineOffsetM],
      ),
    });
    assertFrozenExplanation(rule, stopRuleBehavior);
    // The dwell time was not consumed before the stop point was reached.
    assert(!rule.influences.some((entry) => entry.key === 'stop_dwell_time'));
  } finally {
    stopBehavior.dispose();
    stopFixture.rules.dispose();
  }
});

test('055 explains YIELD, CHANGE_LANE and BLOCKED/recovery without inventing a key', () => {
  const sessionId = '055-yield',
    scope = { sessionId, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'taxi', incarnation: 1 },
    published = sharedProfile(sessionId),
    yieldProfile = projectYieldProfile(published),
    yieldDecision = evaluateYieldPolicy({
      version: YIELD_POLICY_LIMITS.version,
      units: 'SI',
      sessionId,
      worldEpoch: 0,
      subjectId: actor.id,
      observationTick: 59,
      decisionTick: 60,
      profile: yieldProfile,
      coverage: 'COMPLETE_HORIZON',
      horizonS: 10,
      discontinuity: false,
      actors: [
        { id: actor.id, incarnation: 1, active: true, observable: true, routeKnown: true },
        { id: 'civil', incarnation: 1, active: true, observable: true, routeKnown: true },
      ],
      candidates: [{ relationId: 'conflict', entryS: 1, exitS: 2 }],
      pairs: [
        {
          relationId: 'conflict',
          otherActorId: 'civil',
          priority: 'YIELD',
          arrival: { state: 'APPROACHING', timeToEntryS: 2.5, timeToExitS: 4 },
        },
      ],
    });
  assert.equal(yieldDecision.action, 'REFUSE');
  assert.equal(yieldDecision.reason, 'GAP_REFUSED');
  const behavior = createBehaviorFSM(scope);
  behavior.setActors([actor], scope);
  const yieldBehavior = behavior.decide({
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 60,
    context: {
      sessionId,
      worldEpoch: 0,
      sourceTick: 60,
      subject: actor,
      laneId: 'lane-a',
      leaderId: null,
      vehiclesComplete: true,
      discontinuity: false,
    },
    facts: yieldBehaviorFacts(baseFacts(published.versionId), yieldDecision)!,
  });
  assert.equal(yieldBehavior.state, 'YIELD');
  assert.equal(yieldBehavior.reason, 'YIELD_CONFLICT_BY_POLICY');
  const explanation = explainDecision({
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 60,
    behavior: yieldBehavior,
    reasons: [yieldDecision.reason, yieldBehavior.reason],
    action: yieldDecision.action,
    targets: [
      { name: 'yieldThresholdS', value: yieldDecision.thresholdS },
      { name: 'minimumGapS', value: yieldDecision.minimumGapS! },
    ],
    // 092 does not mark yield_time_gap implemented, so YIELD exposes the quantity, not a key.
    influences: inf(),
  });
  assertFrozenExplanation(explanation, yieldBehavior);
  assert.equal(explanation.influences.length, 0);
  assert.equal(getParameterDefinition('yield_time_gap').implemented, false);
  assert.throws(
    () =>
      explainDecision({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: 60,
        behavior: yieldBehavior,
        reasons: [yieldDecision.reason, yieldBehavior.reason],
        action: yieldDecision.action,
        targets: [],
        influences: inf(['yield_time_gap', yieldDecision.thresholdS]),
      }),
    ContractValidationError,
  );
  behavior.dispose();

  // CHANGE_LANE through the real 053 policy on the real033 adjacency, then the real 045 FSM.
  const laneFixture = laneProbeFixture(),
    laneSession = '055-lane',
    laneScope = { sessionId: laneSession, worldEpoch: 0 },
    laneActor: BehaviorActor = { id: 'taxi', incarnation: 1 },
    laneProfile = projectLaneChangeProfile(sharedProfile(laneSession)),
    laneDecision = evaluateLaneChange({
      sessionId: laneSession,
      worldEpoch: 0,
      actor: laneActor,
      decisionTick: 60,
      profile: laneProfile,
      state: LANE_CHANGE_EMPTY_STATE,
      adjacency: laneFixture.adjacency('lane-a', 'TAXI'),
      observation: {
        version: '053-lane-observation-v1',
        units: 'SI',
        tick: 59,
        targetLaneId: 'lane-par',
        coverage: 'COMPLETE',
        frontGapM: 20,
        backGapM: 18,
        targetLaneSpeedMps: 12,
      },
      speedMps: 8,
      ownLaneLeaderSpeedMps: 6,
      intent: 'OPTIONAL_OVERTAKE',
    });
  assert.equal(laneDecision.action, 'CHANGE');
  const laneBehavior = createBehaviorFSM(laneScope);
  laneBehavior.setActors([laneActor], laneScope);
  const laneOutcome = laneBehavior.decide({
    sessionId: laneSession,
    worldEpoch: 0,
    actor: laneActor,
    decisionTick: 60,
    context: {
      sessionId: laneSession,
      worldEpoch: 0,
      sourceTick: 60,
      subject: laneActor,
      laneId: 'lane-a',
      leaderId: null,
      vehiclesComplete: true,
      discontinuity: false,
    },
    facts: laneChangeBehaviorFacts(baseFacts(laneProfile.versionId), laneDecision)!,
  });
  assert.equal(laneOutcome.state, 'CHANGE_LANE');
  assert.equal(laneOutcome.reason, 'LANE_CHANGE_VALIDATED');
  const laneExplanation = explainDecision({
    sessionId: laneSession,
    worldEpoch: 0,
    actor: laneActor,
    decisionTick: 60,
    behavior: laneOutcome,
    reasons: [laneDecision.reason, laneOutcome.reason],
    action: laneDecision.action,
    targets: [
      { name: 'requiredFrontGapM', value: laneDecision.requiredFrontGapM! },
      { name: 'requiredBackGapM', value: laneDecision.requiredBackGapM! },
      { name: 'requiredSpeedGainMps', value: laneDecision.requiredSpeedGainMps! },
      { name: 'speedAdvantageMps', value: laneDecision.speedAdvantageMps! },
    ],
    influences: inf(
      ['lane_change_front_gap', laneProfile.frontGapM],
      ['lane_change_back_gap', laneProfile.backGapM],
      ['lane_change_speed_gain', laneProfile.speedGainMps],
    ),
  });
  assertFrozenExplanation(laneExplanation, laneOutcome);
  laneBehavior.dispose();

  // BLOCKED / recovery through the real 054 policy and the real 033 graph, then 045 BLOCKED.
  const blockedFixture = blockedProbeFixture(),
    blockedScope = blockedFixture.scope,
    subject = blockedFixture.subject,
    planner = blockedFixture.planner();
  blockedFixture.prepare(3);
  const blockedContext = blockedFixture.context.getContext(subject.id)!,
    blockedDecision = evaluateBlockedRecovery({
      sessionId: blockedScope.sessionId,
      worldEpoch: 0,
      actor: subject,
      decisionTick: 3,
      graph: blockedFixture.graph,
      observation: {
        version: '054-progress-observation-v1',
        units: 'SI',
        tick: 3,
        access: 'TAXI',
        speedMps: 0,
        laneId: blockedContext.laneId,
        positionM: { x: 10, y: 0, z: 0 },
        headingRad: 0,
        leaderId: blockedContext.leader?.id ?? null,
        leaderGapM: blockedContext.leader?.gapM ?? null,
        leaderSpeedMps: blockedContext.leader?.speedMps ?? null,
        routeStatus: 'READY',
        blockedLaneAheadId: 'lane-a',
        planner: {
          origin: 'lane-in',
          destination: 'lane-out',
          access: 'TAXI',
          graphVersion: planner.graphVersion,
          costVersion: planner.costVersion,
          blocked: [],
        },
        allowRecoveryEscalation: false,
      },
      state: BLOCKED_RECOVERY_EMPTY_STATE,
    });
  assert.equal(blockedDecision.blocked, true);
  assert.equal(blockedDecision.action, 'REQUEST_REROUTE');
  const blockedBehavior = blockedFixture.behavior.decide({
    sessionId: blockedScope.sessionId,
    worldEpoch: 0,
    actor: subject,
    decisionTick: 3,
    context: projectBehaviorContext(blockedContext),
    facts: blockedRecoveryBehaviorFacts(baseFacts('055-profile-v1'), blockedDecision)!,
  });
  assert.equal(blockedBehavior.state, 'BLOCKED');
  assert.equal(blockedBehavior.reason, 'BLOCKED_ROUTE');
  const blockedExplanation = explainDecision({
    sessionId: blockedScope.sessionId,
    worldEpoch: 0,
    actor: subject,
    decisionTick: 3,
    behavior: blockedBehavior,
    reasons: [blockedDecision.reason, blockedBehavior.reason],
    action: blockedDecision.action,
    targets: [
      { name: 'stagnantTicks', value: blockedDecision.stagnantTicks },
      { name: 'requiredStagnantTicks', value: blockedDecision.requiredStagnantTicks },
    ],
    // 054 consumes no profile parameter: the block is a route fact, so no key is claimed.
    influences: inf(),
  });
  assertFrozenExplanation(blockedExplanation, blockedBehavior);
  assert.equal(blockedExplanation.influences.length, 0);
  blockedFixture.dispose();
});

test('055 refuses any unimplemented parameter influence (acceptance criterion 2)', () => {
  const sessionId = '055-negative',
    scope = { sessionId, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'car', incarnation: 1 },
    behavior = createBehaviorFSM(scope);
  behavior.setActors([actor], scope);
  const decision = behavior.decide({
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 1,
    context: {
      sessionId,
      worldEpoch: 0,
      sourceTick: 1,
      subject: actor,
      laneId: 'lane-a',
      leaderId: null,
      vehiclesComplete: true,
      discontinuity: false,
    },
    facts: baseFacts('055-profile-v1'),
  });
  const build = (influences: unknown) => ({
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 1,
    behavior: decision,
    reasons: ['NO_LEADER', decision.reason],
    action: null,
    targets: [],
    influences,
  });
  // A V2 catalog key with no runtime policy must never surface.
  assert.equal(getParameterDefinition('speed_delta_arterial').implemented, false);
  assert.throws(() => explainDecision(build(inf(['speed_delta_arterial', 5]))), /Unimplemented/);
  // 052's own policy key is not marked implemented by 092, so it is refused too.
  assert.equal(getParameterDefinition('yield_time_gap').implemented, false);
  assert.throws(() => explainDecision(build(inf(['yield_time_gap', 3]))), /Unimplemented/);
  // Unknown and duplicate keys are rejected; a null value is "not consumed" and is dropped.
  assert.throws(() => explainDecision(build(inf(['not_a_key', 1]))), ContractValidationError);
  assert.throws(
    () => explainDecision(build(inf(['speed_delta_urban', 0], ['speed_delta_urban', 0]))),
    /Duplicate/,
  );
  const dropped = explainDecision(build(inf(['red_stop_probability', null])));
  assert.deepEqual(dropped.influences, []);
  // The exported gate returns only implemented keys and captures the registry proof.
  const influences = consumedInfluences([['red_stop_probability', 0.5]]);
  assert.deepEqual(influences, [{ key: 'red_stop_probability', value: 0.5, implemented: true }]);
  behavior.dispose();
});

test('055 explanations are deeply frozen and tampering cannot change the next decision', () => {
  const run = (tamper: boolean) => {
    const sessionId = '055-tamper',
      scope = { sessionId, worldEpoch: 0 },
      actor: BehaviorActor = { id: 'car', incarnation: 1 },
      behavior = createBehaviorFSM(scope),
      explainer = createDecisionExplainer(scope);
    behavior.setActors([actor], scope);
    explainer.setActors([actor], scope);
    const decisions: string[] = [],
      views: string[] = [];
    for (let tick = 1; tick <= 4; tick++) {
      const decision = behavior.decide({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        context: {
          sessionId,
          worldEpoch: 0,
          sourceTick: tick,
          subject: actor,
          laneId: 'lane-a',
          leaderId: tick >= 3 ? 'leader' : null,
          vehiclesComplete: true,
          discontinuity: false,
        },
        facts: baseFacts('055-profile-v1'),
      });
      const explanation = explainer.capture({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        behavior: decision,
        reasons: ['NO_LEADER', decision.reason],
        action: null,
        targets: [{ name: 'targetMps', value: 10 }],
        influences: inf(['speed_delta_urban', 0]),
      });
      decisions.push(`${decision.state}:${decision.reason}:${decision.decisionTick}`);
      if (tamper) {
        const raw = explanation as unknown as {
          decisionTick: number;
          behavior: { state: string };
          reasons: string[];
          targets: { value: number }[];
          influences: { value: number }[];
        };
        assert.throws(() => {
          raw.decisionTick = 0;
        }, TypeError);
        assert.throws(() => {
          raw.behavior.state = 'BLOCKED';
        }, TypeError);
        assert.throws(() => {
          raw.reasons.push('FOREIGN_REASON');
        }, TypeError);
        assert.throws(() => {
          raw.targets[0].value = -1;
        }, TypeError);
        assert.throws(() => {
          raw.influences[0].value = 99;
        }, TypeError);
        assert.equal(Reflect.set(explanation, 'action', 'STOP'), false);
        assert.equal(explanation.decisionTick, tick);
        assert.equal(explanation.behavior.state, decision.state);
      }
      const view = explainer.view(actor, scope);
      assert.equal(view.present, true);
      if (view.present) assert.equal(view.explanation.decisionTick, tick);
      views.push(JSON.stringify(view));
    }
    behavior.dispose();
    explainer.dispose();
    return { decisions, views };
  };
  const clean = run(false),
    tampered = run(true);
  assert.deepEqual(tampered.decisions, clean.decisions);
  assert.deepEqual(tampered.views, clean.views);
  assert.deepEqual(clean.decisions, [
    'FOLLOW:FOLLOW_LANE:1',
    'FOLLOW:FOLLOW_LANE:2',
    'FOLLOW:FOLLOW_LEADER:3',
    'FOLLOW:FOLLOW_LEADER:4',
  ]);
});

test('055 identical inputs give deep-equal explanations and two runs agree', () => {
  const runOnce = () => {
    const sessionId = '055-determinism',
      scope = { sessionId, worldEpoch: 0 },
      actor: BehaviorActor = { id: 'car', incarnation: 1 },
      behavior = createBehaviorFSM(scope);
    behavior.setActors([actor], scope);
    const outputs: string[] = [];
    for (let tick = 1; tick <= 3; tick++) {
      const decision = behavior.decide({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        context: {
          sessionId,
          worldEpoch: 0,
          sourceTick: tick,
          subject: actor,
          laneId: 'lane-a',
          leaderId: tick === 3 ? 'leader' : null,
          vehiclesComplete: true,
          discontinuity: false,
        },
        facts: baseFacts('055-profile-v1'),
      });
      outputs.push(
        JSON.stringify(
          explainDecision({
            sessionId,
            worldEpoch: 0,
            actor,
            decisionTick: tick,
            behavior: decision,
            reasons: ['NO_LEADER', decision.reason],
            action: null,
            targets: [
              { name: 'a', value: 1.5 },
              { name: 'b', value: 2 },
            ],
            influences: inf(['speed_delta_urban', 0], ['speed_delta_residential', 0]),
          }),
        ),
      );
    }
    behavior.dispose();
    return outputs;
  };
  const first = runOnce(),
    second = runOnce();
  assert.deepEqual(second, first);
  // Identical inputs in one process are deep-equal but never the same object.
  const sessionId = '055-determinism-identity',
    scope = { sessionId, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'car', incarnation: 1 },
    behavior = createBehaviorFSM(scope);
  behavior.setActors([actor], scope);
  const decision = behavior.decide({
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 1,
    context: {
      sessionId,
      worldEpoch: 0,
      sourceTick: 1,
      subject: actor,
      laneId: 'lane-a',
      leaderId: null,
      vehiclesComplete: true,
      discontinuity: false,
    },
    facts: baseFacts('055-profile-v1'),
  });
  const input = {
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 1,
    behavior: decision,
    reasons: ['NO_LEADER', decision.reason],
    action: null,
    targets: [{ name: 'a', value: 1 }],
    influences: inf(['speed_delta_urban', 0]),
  };
  const a = explainDecision(input),
    b = explainDecision(input);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  behavior.dispose();
});

test('055 reports an explicit none before any decision and owns bounded state', () => {
  const sessionId = '055-owner',
    scope = { sessionId, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'car', incarnation: 1 },
    explainer = createDecisionExplainer(scope);
  explainer.setActors([actor], scope);
  // No decision yet: the surface reports an explicit none instead of guessing.
  assert.equal(explainer.read(actor, scope), null);
  assert.deepEqual(explainer.view(actor, scope), {
    version: '055-decision-explanation-v1',
    sessionId,
    worldEpoch: 0,
    actor,
    present: false,
    decisionTick: null,
    reason: 'NO_DECISION',
    retainedHistory: 0,
  });
  assert(Object.isFrozen(explainer.view(actor, scope)));
  // An actor that was never admitted is an explicit rejection, not a silent none.
  assert.throws(() => explainer.read({ id: 'ghost', incarnation: 1 }, scope), /Unknown/);
  // Reading never owns anything and the store keeps no history.
  const stats = explainer.getStats();
  assert.equal(stats.retainedHistory, 0);
  assert.equal(stats.explanations, 0);
  assert.equal(stats.actors, 1);
  assert.throws(() => explainer.reset(sessionId, 0), /advance/);
  explainer.dispose();
  explainer.dispose();
  assert.throws(() => explainer.read(actor, scope), /disposed/);
});
