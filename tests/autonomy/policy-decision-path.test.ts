import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulationScheduler, entityDecisionPhase } from '../../src/simulation/scheduling';
import type { SchedulingPorts } from '../../src/simulation/scheduling';
import { createBehaviorFSM, projectBehaviorContext } from '../../src/autonomy/behavior-fsm';
import type { BehaviorActor, BehaviorFacts } from '../../src/autonomy/behavior-fsm';
import type { RoadContextFrame } from '../../src/autonomy/road-context';
import { compileCruiseProfile, evaluateCruiseTarget } from '../../src/autonomy/cruise-targets';
import { evaluateFollowingTarget } from '../../src/autonomy/following';
import { evaluateYieldPolicy, yieldBehaviorFacts } from '../../src/autonomy/yield-policy';
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
  evaluateLaneChange,
  LANE_CHANGE_EMPTY_STATE,
  laneChangeBehaviorFacts,
  projectLaneChangeProfile,
} from '../../src/autonomy/lane-change-policy';
import type { LaneChangeState } from '../../src/autonomy/lane-change-policy';
import { deriveScenarioSeed, deriveVehicleSeed } from '../../src/sessions';
import {
  getParameterDefinition,
  parsePublishableDrivingProfile,
} from '../../src/profiles/parameter-registry';
import {
  laneProbeFixture,
  blockedProbeFixture,
  signalProbeFixture,
  stopApproachProfile,
  stopProbeFixture,
} from './policy-probe-fixture';
import {
  BLOCKED_RECOVERY_EMPTY_STATE,
  BLOCKED_RECOVERY_LIMITS,
  blockedRecoveryBehaviorFacts,
  evaluateAuthorityReentry,
  evaluateBlockedRecovery,
} from '../../src/autonomy/blocked-recovery';
import type { BlockedRecoveryState } from '../../src/autonomy/blocked-recovery';

const SHARED_KEYS = [
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
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
] as const;
/** One published style profile owns every policy versionId, exactly as the production owner wires it. */
function sharedProfile(sessionId: string, overrides: Readonly<Record<string, number>> = {}) {
  const parameters: Record<string, number> = {},
    unitsByParameter: Record<string, string> = {},
    provenanceByParameter: Record<string, string> = {},
    evidenceByParameter: Record<string, null> = {};
  for (const key of SHARED_KEYS) {
    parameters[key] = overrides[key] ?? getParameterDefinition(key).default;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: `policy-path-style-${sessionId}`,
    versionId: 'policy-path-v1',
    parentVersionId: null,
    engineVersion: 'policy-path-v1',
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: 'fixture',
  });
}
function facts(profileVersionId: string): BehaviorFacts {
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
/** Real219 owner driving the10Hz decision port, keeping60Hz controller/physics untouched. */
function cadence(input: {
  readonly sessionId: string;
  readonly actors: readonly BehaviorActor[];
  readonly ticks: number;
  readonly beforeTick?: (tick: number) => void;
  readonly decide: (actor: BehaviorActor, tick: number) => void;
}) {
  const scope = { sessionId: input.sessionId, worldEpoch: 0 };
  const decisions = new Map<string, number[]>();
  let inputCalls = 0,
    controllerCalls = 0,
    physicsCalls = 0;
  const ports: SchedulingPorts = {
    input(tick) {
      inputCalls++;
      input.beforeTick?.(tick);
    },
    decision(actor, decisionTick) {
      const list = decisions.get(actor.id) ?? [];
      list.push(decisionTick);
      decisions.set(actor.id, list);
      input.decide(actor, decisionTick);
    },
    controller(_actor, _tick, dtSeconds) {
      assert.equal(dtSeconds, 1 / 60);
      controllerCalls++;
    },
    physics(_tick, dtSeconds) {
      assert.equal(dtSeconds, 1 / 60);
      physicsCalls++;
    },
  };
  const engine = createSimulationScheduler({ ...scope, ports });
  engine.setActors(input.actors, scope);
  for (let tick = 1; tick <= input.ticks; tick++)
    engine.step({ ...scope, tick, dtSeconds: 1 / 60 });
  for (const actor of input.actors) {
    const ticks = decisions.get(actor.id) ?? [];
    assert.equal(ticks.length, input.ticks / 6, `periodic count for ${actor.id}`);
    assert(
      ticks.every((tick) => tick % 6 === entityDecisionPhase(actor.id)),
      `deterministic219 phase for ${actor.id}`,
    );
  }
  assert.equal(controllerCalls, input.ticks * input.actors.length);
  assert.equal(physicsCalls, input.ticks);
  assert.equal(inputCalls, input.ticks);
  return { engine, dispose: () => engine.dispose() };
}
test('050 real219/044/045/036 chain stops on red and releases on green without touching60Hz', () => {
  const fixture = signalProbeFixture(),
    frame = fixture.frame,
    actors = frame.vehicles.map(({ id, incarnation }) => ({ id, incarnation })),
    profile = projectSignalProfile(sharedProfile(frame.sessionId)),
    base = facts(profile.versionId),
    behavior = fixture.behavior,
    subject = frame.vehicles.find((vehicle) => vehicle.route?.movementId === 'west-straight')!,
    seed = deriveVehicleSeed(deriveScenarioSeed(1, frame.sessionId), subject.id);
  const states = { red: [] as string[], green: [] as string[] },
    policyReasons = { red: [] as string[], green: [] as string[] };
  assert(subject !== undefined);
  const run = cadence({
    sessionId: frame.sessionId,
    actors,
    ticks: 120,
    beforeTick: (tick) => fixture.prepare(tick),
    decide(actor, tick) {
      const context = fixture.context.getContext(actor.id)!,
        signal = context.signal,
        phaseStartedTick =
          signal === null ? 0 : (fixture.signals.getSignal(signal.signalId)?.phaseStartedTick ?? 0),
        decision = evaluateSignalPolicy({
          sessionId: frame.sessionId,
          worldEpoch: 0,
          actor,
          decisionTick: tick,
          speedMps: actor.id === subject.id ? 8 : 6,
          seed,
          opportunityKey: signalOpportunityKey({
            sessionId: frame.sessionId,
            worldEpoch: 0,
            vehicleId: actor.id,
            incarnation: actor.incarnation,
            intersectionId: signal?.intersectionId ?? 'junction',
            movementId: signal?.movementId ?? subject.route!.movementId,
            phaseStartedTick,
          }),
          profile,
          observation:
            signal === null
              ? null
              : {
                  version: SIGNAL_POLICY_LIMITS.observationVersion,
                  units: 'SI',
                  tick: Math.max(0, tick - 1),
                  signalId: signal.signalId,
                  intersectionId: signal.intersectionId,
                  movementId: signal.movementId,
                  phaseId: signal.phaseId,
                  state: signal.state,
                  phaseElapsedS: Math.max(0, (tick - phaseStartedTick) / 60),
                  distanceToStopLineM:
                    context.lane === null || context.laneId === null
                      ? null
                      : fixture.stopLineDistanceM(context.laneId, context.lane.positionM),
                },
        }),
        composed = signalBehaviorFacts(base, decision),
        projected = projectBehaviorContext(context)!,
        outcome = behavior.decide({
          sessionId: frame.sessionId,
          worldEpoch: 0,
          actor,
          decisionTick: tick,
          context: projected,
          facts: composed,
        });
      if (actor.id !== subject.id) return;
      const window = tick <= 60 ? 'red' : 'green';
      states[window].push(outcome.state);
      policyReasons[window].push(decision.reason);
      assert.equal(
        outcome.state === 'STOP',
        decision.stopRequested,
        'FSM STOP mirrors the policy intent',
      );
    },
  });
  // The subject's own movement is RED for the first second and GREEN for the second.
  assert(states.red.length > 0 && states.green.length > 0);
  assert(states.red.every((state) => state === 'STOP'));
  assert(
    policyReasons.red.every(
      (reason) => reason === 'STOP_LINE_APPROACH' || reason === 'STOP_LINE_HOLD',
    ),
  );
  assert(states.green.every((state) => state === 'FOLLOW'));
  assert(policyReasons.green.every((reason) => reason === 'GREEN_RELEASE'));
  run.dispose();
  fixture.dispose();
});
test('051 real219/037 chain stops, dwells and releases, and a queue stop stays a leader stop', () => {
  const fixture = stopProbeFixture(),
    profile = projectStopProfile(sharedProfile('policy-path-stop', { stop_dwell_time: 0.5 })),
    base = facts(profile.versionId),
    behavior = createBehaviorFSM({ sessionId: 'policy-path-stop', worldEpoch: 0 }),
    actor: BehaviorActor = { id: 'taxi', incarnation: 1 },
    seed = deriveVehicleSeed(deriveScenarioSeed(2, 'policy-path-stop'), actor.id),
    frames = stopApproachProfile({
      ticks: 180,
      stopPointM: fixture.stopLineLongitudinalM - 1,
      holdTicks: 45,
      stepM: 0.15,
    });
  behavior.setActors([actor], { sessionId: 'policy-path-stop', worldEpoch: 0 });
  let opportunityId: string | null = null,
    crossed = false,
    stationaryDurationS = 0,
    pending: (typeof frames)[number] = frames[0];
  const states: string[] = [],
    reasons: string[] = [];
  const run = cadence({
    sessionId: 'policy-path-stop',
    actors: [actor],
    ticks: 180,
    beforeTick: (tick) => {
      pending = frames[tick - 1];
      const events = fixture.rules.observe({
        ...fixture.context,
        tick,
        vehicleId: actor.id,
        incarnation: 'taxi-1',
        laneId: 'lane-a',
        access: 'TAXI',
        frontPositionM: { x: pending.xM, y: 0, z: 0 },
        headingRad: 0,
        speedMps: pending.speedMps,
        discontinuity: false,
      });
      for (const event of events) {
        if (event.type === 'STOP_APPROACH') opportunityId = event.payload.opportunityId;
        if (event.type === 'STOP_LINE_CROSSED') crossed = true;
      }
      stationaryDurationS = pending.speedMps === 0 ? stationaryDurationS + 1 / 60 : 0;
    },
    decide(_subject, tick) {
      const decision = evaluateStopPolicy({
        sessionId: 'policy-path-stop',
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        seed,
        profile,
        leaderStop: 'NONE',
        observation:
          opportunityId === null
            ? null
            : {
                version: STOP_POLICY_LIMITS.observationVersion,
                units: 'SI',
                tick: tick - 1,
                opportunityId,
                stopLineId: fixture.map.stopLines[0].id,
                distanceToStopLineM: fixture.stopLineLongitudinalM - pending.xM,
                speedMps: pending.speedMps,
                stationaryDurationS: stationaryDurationS > 0 ? stationaryDurationS : null,
                crossed,
              },
      });
      const outcome = behavior.decide({
        sessionId: 'policy-path-stop',
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        context: {
          sessionId: 'policy-path-stop',
          worldEpoch: 0,
          sourceTick: tick,
          subject: actor,
          laneId: 'lane-a',
          leaderId: null,
          vehiclesComplete: true,
          discontinuity: false,
        },
        facts: stopBehaviorFacts(base, decision),
      });
      states.push(outcome.state);
      reasons.push(decision.reason);
    },
  });
  assert(reasons.some((reason) => reason === 'STOP_APPROACH'));
  assert(reasons.some((reason) => reason === 'STOP_HOLD' || reason === 'DWELL_IN_PROGRESS'));
  assert(reasons.includes('DWELL_SATISFIED'));
  assert(states.some((state) => state === 'STOP'));
  assert.equal(states[0], 'STOP');
  assert.equal(states[states.length - 1], 'FOLLOW');
  assert.equal(reasons[reasons.length - 1], 'STOP_LINE_CROSSED');
  run.dispose();
  // Queue case: the ego is held25m before the line, outside its own037 approach window, so the
  // leader-induced stop must stay FOLLOW_LEADER and must never become the driver's STOP intent.
  const queueFrames = stopApproachProfile({
      ticks: 60,
      stopPointM: fixture.stopLineLongitudinalM - 25,
      startM: fixture.stopLineLongitudinalM - 25,
      holdTicks: 120,
      stepM: 0.15,
    }),
    queue = {
      opportunityId: null as string | null,
      states: [] as string[],
      reasons: [] as string[],
    },
    queueRun = cadence({
      sessionId: 'policy-path-stop',
      actors: [actor],
      ticks: 60,
      beforeTick: (tick) => {
        const frame = queueFrames[tick - 1],
          events = fixture.rules.observe({
            ...fixture.context,
            tick: 1000 + tick,
            vehicleId: 'queued',
            incarnation: 'queued-1',
            laneId: 'lane-a',
            access: 'TAXI',
            frontPositionM: { x: frame.xM, y: 0, z: 0 },
            headingRad: 0,
            speedMps: frame.speedMps,
            discontinuity: false,
          });
        for (const event of events)
          if (event.type === 'STOP_APPROACH') queue.opportunityId = event.payload.opportunityId;
      },
      decide(_subject, tick) {
        const frame = queueFrames[tick - 1],
          decision = evaluateStopPolicy({
            sessionId: 'policy-path-stop',
            worldEpoch: 0,
            actor,
            decisionTick: tick + 500,
            seed,
            profile,
            leaderStop: 'LEADER_OR_QUEUE',
            observation:
              queue.opportunityId === null
                ? null
                : {
                    version: STOP_POLICY_LIMITS.observationVersion,
                    units: 'SI',
                    tick: tick + 499,
                    opportunityId: queue.opportunityId,
                    stopLineId: fixture.map.stopLines[0].id,
                    distanceToStopLineM: fixture.stopLineLongitudinalM - frame.xM,
                    speedMps: frame.speedMps,
                    stationaryDurationS: null,
                    crossed: false,
                  },
          });
        assert.equal(decision.stopRequested, false);
        assert.equal(decision.reason, 'LEADER_STOP_NOT_STOP_INTENT');
        const outcome = behavior.decide({
          sessionId: 'policy-path-stop',
          worldEpoch: 0,
          actor,
          decisionTick: tick + 500,
          context: {
            sessionId: 'policy-path-stop',
            worldEpoch: 0,
            sourceTick: tick + 500,
            subject: actor,
            laneId: 'lane-a',
            leaderId: 'civil-ahead',
            vehiclesComplete: true,
            discontinuity: false,
          },
          facts: stopBehaviorFacts(base, decision),
        });
        queue.states.push(outcome.state);
        queue.reasons.push(outcome.reason);
      },
    });
  assert(queue.opportunityId === null, 'a queue25m behind the line has no037 STOP opportunity');
  assert(queue.reasons.every((reason) => reason === 'FOLLOW_LEADER'));
  assert(queue.states.every((state) => state === 'FOLLOW'));
  queueRun.dispose();
  fixture.rules.dispose();
});
test('053 real219/033/046 chain changes lane with continuity and preserves the cruise reference', () => {
  const fixture = laneProbeFixture(),
    sessionId = 'policy-path-lane',
    actor: BehaviorActor = { id: 'taxi', incarnation: 1 },
    profile = projectLaneChangeProfile(sharedProfile(sessionId)),
    cruise = compileCruiseProfile(sharedProfile(sessionId)),
    base = facts(profile.versionId),
    behavior = createBehaviorFSM({ sessionId, worldEpoch: 0 }),
    adjacency = fixture.adjacency('lane-a', 'TAXI'),
    completed = fixture.adjacency('lane-par', 'TAXI'),
    intents = adjacency.neighbors.map((neighbor) => neighbor.laneId);
  assert.deepEqual(intents, ['lane-par']);
  behavior.setActors([actor], { sessionId, worldEpoch: 0 });
  let latch: LaneChangeState = LANE_CHANGE_EMPTY_STATE,
    calls = 0;
  const cruiseReasons: string[] = [],
    decisionReasons: string[] = [],
    states: string[] = [];
  const run = cadence({
    sessionId,
    actors: [actor],
    ticks: 180,
    decide(_subject, tick) {
      calls++;
      const committed = latch.committed !== null,
        targetLaneId = committed ? latch.committed!.targetLaneId : 'lane-par',
        afterRelease = calls > 6;
      const decision = evaluateLaneChange({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        profile,
        state: latch,
        adjacency: afterRelease ? completed : adjacency,
        observation: {
          version: '053-lane-observation-v1',
          units: 'SI',
          tick: tick - 1,
          targetLaneId: afterRelease ? 'lane-a' : targetLaneId,
          coverage: 'COMPLETE',
          frontGapM: calls <= 2 ? 20 : 1,
          backGapM: calls <= 2 ? 18 : 1,
          targetLaneSpeedMps: calls <= 2 ? 12 : 14,
        },
        speedMps: 8,
        ownLaneLeaderSpeedMps: 6,
        intent: 'OPTIONAL_OVERTAKE',
      });
      latch = decision.state;
      decisionReasons.push(decision.reason);
      states.push(
        behavior.decide({
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
            leaderId: null,
            vehiclesComplete: true,
            discontinuity: false,
          },
          facts: laneChangeBehaviorFacts(base, decision),
        }).state,
      );
      // The real046 chain still receives the CHANGE_LANE decision: it must not zero the style target.
      const cruiseTarget = evaluateCruiseTarget({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        authority: 'AUTO',
        profile: cruise,
        context: {
          sessionId,
          worldEpoch: 0,
          sourceTick: tick,
          subject: actor,
          laneId: 'lane-a',
          leaderId: null,
          vehiclesComplete: true,
          discontinuity: false,
        },
        behavior: behavior.read(actor, { sessionId, worldEpoch: 0 }),
        facts: {
          version: '046-road-facts-v1',
          sessionId,
          worldEpoch: 0,
          subject: actor,
          sourceTick: tick,
          laneId: 'lane-a',
          roadKind: 'URBAN',
          postedLimitMps: 13.4,
          curveRadiusM: null,
          intersectionApproach: false,
        },
        mechanics: {
          version: '031-coverage-046-v1',
          classId: 'sedan',
          classVersion: '023-mechanics-v1',
          surface: 'dry-asphalt',
          surfaceVersion: '026-flat-surfaces-v1',
        },
      });
      cruiseReasons.push(cruiseTarget.reason);
      assert(cruiseTarget.targetMps > 0, 'CHANGE_LANE must not zero the045/046 style target');
    },
  });
  assert.equal(calls, 30);
  assert.equal(decisionReasons[0], 'OPTIONAL_CHANGE_VALIDATED');
  assert.equal(states[0], 'CHANGE_LANE');
  // Continuity across the cadence and past failing start gates, then the explicit release.
  for (let index = 1; index < 6; index++) {
    assert.equal(decisionReasons[index], 'COMMITTED_CONTINUITY');
    assert.equal(states[index], 'CHANGE_LANE');
  }
  assert.equal(decisionReasons[6], 'COMMITMENT_RELEASED');
  assert.equal(decisionReasons[7], 'COOLDOWN_ACTIVE');
  assert.equal(states[7], 'FOLLOW');
  assert(cruiseReasons.every((reason) => reason !== 'BEHAVIOR_CHANGE_LANE'));
  assert.strictEqual(latch.committed, null);
  assert(latch.lastChangeTick !== null);
  run.dispose();
});
test('050-053 composition keeps the existing044-049/052 facts intact at the same cadence', () => {
  const sessionId = 'policy-path-compose',
    actor: BehaviorActor = { id: 'taxi', incarnation: 1 },
    published = sharedProfile(sessionId),
    signal = projectSignalProfile(published),
    stop = projectStopProfile(published),
    lane = projectLaneChangeProfile(published),
    cruise = compileCruiseProfile(published),
    base = facts(signal.versionId);
  assert.equal(stop.versionId, signal.versionId);
  assert.equal(lane.versionId, signal.versionId);
  const red = evaluateSignalPolicy({
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 60,
    speedMps: 5,
    seed: deriveVehicleSeed(deriveScenarioSeed(3, sessionId), actor.id),
    opportunityKey: signalOpportunityKey({
      sessionId,
      worldEpoch: 0,
      vehicleId: actor.id,
      incarnation: 1,
      intersectionId: 'junction',
      movementId: 'west-straight',
      phaseStartedTick: 0,
    }),
    profile: signal,
    observation: {
      version: SIGNAL_POLICY_LIMITS.observationVersion,
      units: 'SI',
      tick: 59,
      signalId: 'signal',
      intersectionId: 'junction',
      movementId: 'west-straight',
      phaseId: 'red',
      state: 'RED',
      phaseElapsedS: 1,
      distanceToStopLineM: 18,
    },
  });
  const stopApproach = evaluateStopPolicy({
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 60,
    seed: deriveVehicleSeed(deriveScenarioSeed(4, sessionId), actor.id),
    profile: stop,
    leaderStop: 'NONE',
    observation: {
      version: STOP_POLICY_LIMITS.observationVersion,
      units: 'SI',
      tick: 59,
      opportunityId: 'stop-opportunity-compose',
      stopLineId: 'stop-line',
      distanceToStopLineM: 9,
      speedMps: 4,
      stationaryDurationS: null,
      crossed: false,
    },
  });
  const laneChange = evaluateLaneChange({
    sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 60,
    profile: lane,
    state: LANE_CHANGE_EMPTY_STATE,
    adjacency: null,
    observation: null,
    speedMps: 8,
    ownLaneLeaderSpeedMps: null,
    intent: 'NONE',
  });
  // A foreign policy diagnostic is fenced, and a policy with unavailable facts fabricates nothing.
  assert.throws(() =>
    stopBehaviorFacts(base, laneChange as unknown as Parameters<typeof stopBehaviorFacts>[1]),
  );
  assert.equal(laneChangeBehaviorFacts(base, laneChange), null);
  assert.equal(red.action, 'STOP');
  assert.equal(stopApproach.action, 'APPROACH');
  // Red keeps precedence while the STOP bridge preserves it and the signal bridge preserves service.
  const withRed = signalBehaviorFacts(base, red)!;
  assert.equal(stopBehaviorFacts(withRed, stopApproach)!.stop, 'RED_BY_PROFILE');
  const withRedAndYield = yieldBehaviorFacts(
    { ...withRed!, yield: 'NONE' },
    evaluateYieldPolicy({
      version: '052-yield-interval-v1',
      units: 'SI',
      sessionId,
      worldEpoch: 0,
      subjectId: actor.id,
      observationTick: 59,
      decisionTick: 60,
      profile: { versionId: signal.versionId, yieldTimeGapS: 3 },
      coverage: 'COMPLETE_HORIZON',
      horizonS: 30,
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
          arrival: { state: 'APPROACHING', timeToEntryS: 1.5, timeToExitS: 2.5 },
        },
      ],
    }),
  );
  assert.equal(withRedAndYield!.stop, 'RED_BY_PROFILE');
  assert.equal(withRedAndYield!.yield, 'CONFLICT_BY_POLICY');
  assert.equal(cruise.versionId, signal.versionId);
  // 048 with a missing authority/context keeps its 046 diagnostic instead of inventing a policy fact.
  const following = evaluateFollowingTarget({
    cruiseInput: {
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: 60,
      authority: 'AUTO',
      profile: cruise,
      context: null,
      behavior: null,
      facts: null,
      mechanics: {
        version: '031-coverage-046-v1',
        classId: 'sedan',
        classVersion: '023-mechanics-v1',
        surface: 'dry-asphalt',
        surfaceVersion: '026-flat-surfaces-v1',
      },
    },
    roadContext: null,
    observation: {
      version: '048-observation-v1',
      units: 'SI',
      sessionId,
      worldEpoch: 0,
      actor,
      tick: 60,
      longitudinalSpeedMps: 8,
    },
    profile: null,
  });
  assert.equal(following.reason, 'MISSING_CONTEXT');
  assert.equal(following.target.targetMps, 0);
  assert.equal(following.leader, null);
});
test('054 real219/044/045/033/041 chain blocks, reroutes legally, releases and re-enters after MANUAL', () => {
  const fixture = blockedProbeFixture(),
    sessionId = fixture.scope.sessionId,
    scope = { sessionId, worldEpoch: 0 },
    subject = fixture.subject,
    leader: BehaviorActor = { id: fixture.leaderId, incarnation: 1 },
    planner = fixture.planner(),
    base = planner.findRoute({ origin: 'lane-in', destination: 'lane-out', access: 'TAXI' });
  assert.deepEqual(base.path, ['lane-in', 'lane-a', 'lane-out']);
  fixture.behavior.setActors([subject, leader], scope);
  const policyReasons: { tick: number; reason: string; action: string }[] = [],
    subjectStates: string[] = [],
    subjectReasons: string[] = [],
    leaderStates: string[] = [],
    taskPaths: (readonly string[] | null)[] = [],
    reentry: { tick: number; authority: string; action: string; reason: string }[] = [];
  let latch: BlockedRecoveryState = BLOCKED_RECOVERY_EMPTY_STATE,
    blockedLanes: string[] = [],
    task: ReturnType<typeof planner.createRouteTask> | null = null,
    taskDone = false,
    manualSet = false,
    handoverDone = false,
    admitted: RoadContextFrame = fixture.prepare(0);
  /** The authored physical truth of the fixture world; 047/048 own real car-following. */
  const physicalSpeed = (tick: number) => (tick >= 60 ? 8 : 0);
  const cadenceRun = cadence({
    sessionId,
    actors: [subject, leader],
    ticks: 180,
    beforeTick: (tick) => {
      fixture.physical.subjectSpeedMps = physicalSpeed(tick);
      fixture.physical.leaderSpeedMps = physicalSpeed(tick);
      // The vehicle drifts off the lane centre during the manual window, then AUTO returns.
      if (tick >= 156) fixture.physical.subjectLateralOffsetM = 1.4;
      admitted = fixture.prepare(tick);
      // The host applies an accepted reroute to the real041 planner, then drives the real219 route
      // port with its documented 4 slices/tick x16 expansions budget. No second search exists.
      if (task !== null && !taskDone)
        for (let slice = 0; slice < 4 && !taskDone; slice++) {
          const stepped = task.step({ tick, maxExpansions: 16 });
          taskDone = stepped.done;
          if (stepped.path !== null) taskPaths.push(stepped.path);
        }
    },
    decide(actor, tick) {
      const context = fixture.context.getContext(actor.id);
      assert(context !== null, 'the real044 context exists for every actor');
      if (actor.id !== subject.id) {
        // The undisturbed 044→045 chain: the plain follower keeps FOLLOW with an untouched reason.
        const decision = fixture.behavior.decide({
          sessionId,
          worldEpoch: 0,
          actor,
          decisionTick: tick,
          context: projectBehaviorContext(context),
          facts: facts('policy-path-v1'),
        });
        leaderStates.push(decision.state);
        assert.equal(decision.state, 'FOLLOW');
        assert(decision.reason.startsWith('FOLLOW_'));
        return;
      }
      // MANUAL window: the human owns the vehicle, so 045 keeps no AUTO decision at all.
      if (tick >= 126 && tick < 156) {
        if (!manualSet) {
          fixture.behavior.setAuthority(subject, 'MANUAL', scope);
          manualSet = true;
        }
        const plan = evaluateAuthorityReentry({
          sessionId,
          worldEpoch: 0,
          actor: subject,
          decisionTick: tick,
          authority: 'MANUAL',
          graph: fixture.graph,
          observation: {
            version: '054-progress-observation-v1',
            units: 'SI',
            tick,
            access: 'TAXI',
            positionM: admitted.vehicles[0].positionM,
            headingRad: 0,
            routeStatus: 'READY',
            destination: 'lane-out',
            recoveryLaneId: 'lane-in',
            allowRecoveryEscalation: false,
          },
        });
        reentry.push({ tick, authority: 'MANUAL', action: plan.action, reason: plan.reason });
        assert.equal(plan.reason, 'MANUAL_AUTHORITY');
        assert.equal(plan.action, 'CONTINUE');
        assert.equal(plan.teleportsVehicle, false);
        assert.equal(
          fixture.behavior.read(subject, scope),
          null,
          'MANUAL clears the AUTO decision',
        );
        return;
      }
      if (tick >= 156 && !handoverDone) {
        handoverDone = true;
        // The vehicle drifted off the lane centre while the driver held authority, then AUTO returns.
        const pose = Object.freeze({ ...admitted.vehicles[0].positionM });
        const plan = evaluateAuthorityReentry({
          sessionId,
          worldEpoch: 0,
          actor: subject,
          decisionTick: tick,
          authority: 'AUTO',
          graph: fixture.graph,
          observation: {
            version: '054-progress-observation-v1',
            units: 'SI',
            tick,
            access: 'TAXI',
            positionM: pose,
            headingRad: 0,
            routeStatus: planner.findRoute({
              origin: 'lane-in',
              destination: 'lane-out',
              access: 'TAXI',
            }).status,
            destination: 'lane-out',
            recoveryLaneId: 'lane-in',
            allowRecoveryEscalation: false,
          },
        });
        reentry.push({ tick, authority: 'AUTO', action: plan.action, reason: plan.reason });
        assert.equal(plan.action, 'DRIVE_TO_LANE');
        assert.equal(plan.reason, 'OFF_CENTRE_LANE');
        assert.equal(plan.targetLaneId, 'lane-in');
        assert(Math.abs(plan.lateralOffsetM! - 1.4) < 1e-9);
        assert.equal(plan.teleportsVehicle, false);
        assert(!Object.hasOwn(plan, 'positionM'));
        assert.deepEqual(pose, { x: 10, y: 0, z: 1.4 });
        fixture.behavior.setAuthority(subject, 'AUTO', scope);
      }
      // Host knowledge on the planned route: lane-a stays untraversable until the reroute lands.
      const decision = evaluateBlockedRecovery({
        sessionId,
        worldEpoch: 0,
        actor: subject,
        decisionTick: tick,
        graph: fixture.graph,
        observation: {
          version: '054-progress-observation-v1',
          units: 'SI',
          tick,
          access: 'TAXI',
          speedMps: physicalSpeed(tick),
          laneId: context.laneId,
          positionM: admitted.vehicles[0].positionM,
          headingRad: 0,
          leaderId: context.leader?.id ?? null,
          leaderGapM: context.leader?.gapM ?? null,
          leaderSpeedMps: context.leader?.speedMps ?? null,
          routeStatus: 'READY',
          blockedLaneAheadId: !taskDone && tick < 60 ? 'lane-a' : null,
          planner: {
            origin: 'lane-in',
            destination: 'lane-out',
            access: 'TAXI',
            graphVersion: planner.graphVersion,
            costVersion: planner.costVersion,
            blocked: blockedLanes,
          },
          allowRecoveryEscalation: false,
        },
        state: latch,
      });
      latch = decision.state;
      policyReasons.push({ tick, reason: decision.reason, action: decision.action });
      if (decision.reroute !== null) {
        blockedLanes = [...decision.reroute.blocked];
        planner.setBlocked(blockedLanes);
        planner.setVersions({
          graphVersion: decision.reroute.graphVersion,
          costVersion: decision.reroute.costVersion,
        });
        task = planner.createRouteTask({
          sessionId,
          worldEpoch: 0,
          actor: subject,
          origin: decision.reroute.origin,
          destination: decision.reroute.destination,
          access: decision.reroute.access,
          graphVersion: decision.reroute.graphVersion,
          costVersion: decision.reroute.costVersion,
          priority: 'normal',
        });
      }
      const fed = fixture.behavior.decide({
        sessionId,
        worldEpoch: 0,
        actor: subject,
        decisionTick: tick,
        context: projectBehaviorContext(context),
        facts: blockedRecoveryBehaviorFacts(facts('policy-path-v1'), decision)!,
      });
      subjectStates.push(fed.state);
      subjectReasons.push(fed.reason);
    },
  });
  // Phase A: the route is structurally unusable, so the block needs no standstill window.
  const blockedSlices = policyReasons.filter(
    (entry) => entry.reason === 'NO_PROGRESS_BLOCKED_LANE_AHEAD',
  );
  assert.equal(blockedSlices.length, 1, 'one structural episode at the start of the run');
  assert.equal(blockedSlices[0].action, 'REQUEST_REROUTE');
  assert.equal(policyReasons[0].reason, 'NO_PROGRESS_BLOCKED_LANE_AHEAD');
  assert(
    policyReasons
      .slice(1, 10)
      .every((entry) => entry.reason === 'STAGNATION_WITHIN_THRESHOLD' && entry.action === 'WAIT'),
    'while the vehicle is stopped below the threshold nothing is declared blocked',
  );
  assert.equal(
    policyReasons[0].tick,
    3,
    'the subject is addressed on its own219 phase, not on tick6',
  );
  assert.equal(subjectStates[0], 'BLOCKED');
  assert.equal(subjectReasons[0], 'BLOCKED_ROUTE');
  // The reroute went through the real041 planner and the real219 route port, and it changed the path.
  assert.deepEqual(blockedLanes, ['lane-a']);
  assert.deepEqual(taskPaths, [['lane-in', 'lane-b', 'lane-out']]);
  assert.equal(taskDone, true);
  assert(planner.getStats().expansions > 0);
  // Phase B: with the legal alternative accepted the episode releases to the ordinary FOLLOW chain.
  const firstProgress = policyReasons.find((entry) => entry.reason === 'PROGRESS')!;
  assert(firstProgress.tick > 60 && firstProgress.tick < 66);
  assert.equal(firstProgress.action, 'CONTINUE');
  assert(
    policyReasons
      .slice(policyReasons.indexOf(firstProgress))
      .every((entry) => entry.reason === 'PROGRESS' && entry.action === 'CONTINUE'),
  );
  assert(subjectStates[1], 'FOLLOW');
  assert(subjectStates.slice(1).every((state) => state === 'FOLLOW'));
  assert(subjectReasons.slice(1).every((reason) => reason.startsWith('FOLLOW_')));
  assert.equal(latch.stage, 'NONE', 'the released episode keeps no stage');
  assert.equal(latch.rerouteAttempts, 0);
  assert.equal(latch.blockedSinceTick, null);
  assert.equal(latch.stagnantSinceTick, null);
  assert.equal(BLOCKED_RECOVERY_LIMITS.releaseHoldTicks, 12);
  // Phase C: the MANUAL handover owns the vehicle, and the re-entry plan is explicit but inert.
  assert.equal(reentry.filter((entry) => entry.authority === 'MANUAL').length, 5);
  assert(
    reentry
      .filter((entry) => entry.authority === 'MANUAL')
      .every((entry) => entry.action === 'CONTINUE' && entry.reason === 'MANUAL_AUTHORITY'),
  );
  assert.equal(reentry.find((entry) => entry.authority === 'AUTO')!.action, 'DRIVE_TO_LANE');
  // The 044–048 facts and the 045 reason codes of the other actor stay valid at the same cadence.
  assert.equal(leaderStates.length, 30);
  assert(leaderStates.every((state) => state === 'FOLLOW'));
  assert.equal(subjectStates.length, 25);
  assert.equal(policyReasons.length, 25);
  assert.equal(subjectStates.length + 5, 30);
  assert.equal(fixture.context.getStats().disposed, false);
  assert.equal(fixture.context.getStats().cachedContexts, 2);
  cadenceRun.dispose();
  fixture.dispose();
});
