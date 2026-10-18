import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOCKED_RECOVERY_EMPTY_STATE,
  BLOCKED_RECOVERY_LIMITS,
  BLOCKED_RECOVERY_STAGE_ORDINAL,
  blockedRecoveryBehaviorFacts,
  blockedRerouteCostVersion,
  evaluateAuthorityReentry,
  evaluateBlockedRecovery,
  getBlockedRecoveryStats,
} from '../../src/autonomy/blocked-recovery';
import type {
  BlockedRecoveryDecision,
  BlockedRecoveryObservation,
  BlockedRecoveryState,
  AuthorityReentryObservation,
} from '../../src/autonomy/blocked-recovery';
import { createBehaviorFSM } from '../../src/autonomy/behavior-fsm';
import type { BehaviorActor, BehaviorFacts } from '../../src/autonomy/behavior-fsm';
import { blockedProbeFixture } from './policy-probe-fixture';

const SESSION = '054-probe';
const SUBJECT: BehaviorActor = { id: 'taxi-054', incarnation: 1 };

function behaviorFacts(): BehaviorFacts {
  return {
    version: '045-decision-facts-v1',
    profileVersionId: '054-test-profile-v1',
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
}
/** Authoritative progress observation of the authored fixture, with explicit per-test overrides. */
function observation(
  tick: number,
  overrides: Partial<BlockedRecoveryObservation> = {},
): BlockedRecoveryObservation {
  return {
    version: '054-progress-observation-v1',
    units: 'SI',
    tick,
    access: 'TAXI',
    speedMps: 0,
    laneId: 'lane-in',
    positionM: { x: 10, y: 0, z: 0 },
    headingRad: 0,
    leaderId: 'civil-054',
    leaderGapM: 3,
    leaderSpeedMps: 0,
    routeStatus: 'READY',
    blockedLaneAheadId: null,
    planner: null,
    allowRecoveryEscalation: false,
    ...overrides,
  };
}
function decide(
  graph: ReturnType<typeof blockedProbeFixture>['graph'] | null,
  tick: number,
  state: BlockedRecoveryState,
  overrides: Partial<BlockedRecoveryObservation> = {},
): BlockedRecoveryDecision {
  return evaluateBlockedRecovery({
    sessionId: SESSION,
    worldEpoch: 0,
    actor: SUBJECT,
    decisionTick: tick,
    graph,
    observation: observation(tick, overrides),
    state,
  });
}

test('054 rejects foreign observations, keeps the latch fenced and fabricates no fact', () => {
  const fixture = blockedProbeFixture();
  // Unavailable data is never a silent success: no observation and a stale one both abstain.
  const none = evaluateBlockedRecovery({
    sessionId: SESSION,
    worldEpoch: 0,
    actor: SUBJECT,
    decisionTick: 6,
    graph: fixture.graph,
    observation: null,
    state: BLOCKED_RECOVERY_EMPTY_STATE,
  });
  assert.equal(none.reason, 'NO_OBSERVATION');
  assert.equal(none.action, 'UNKNOWN');
  assert.equal(none.blocked, false);
  assert.equal(blockedRecoveryBehaviorFacts(behaviorFacts(), none), null);
  assert.equal(none.state.lastDecisionTick, null, 'an abstention does not advance the latch');
  const stale = decide(fixture.graph, 60, BLOCKED_RECOVERY_EMPTY_STATE, { tick: 40 });
  assert.equal(stale.reason, 'OBSERVATION_UNAVAILABLE');
  assert.equal(stale.action, 'UNKNOWN');
  const future = decide(fixture.graph, 40, BLOCKED_RECOVERY_EMPTY_STATE, { tick: 60 });
  assert.equal(future.reason, 'OBSERVATION_UNAVAILABLE');
  // A non-increasing decision tick, an unknown field and an unknown version are contract errors.
  assert.throws(
    () => decide(fixture.graph, 6, { ...BLOCKED_RECOVERY_EMPTY_STATE, lastDecisionTick: 6 }),
    /decision tick must advance/,
  );
  assert.throws(
    () =>
      evaluateBlockedRecovery({
        sessionId: SESSION,
        worldEpoch: 0,
        actor: SUBJECT,
        decisionTick: 6,
        graph: fixture.graph,
        observation: { ...observation(6), speedMps2: 0 } as never,
        state: BLOCKED_RECOVERY_EMPTY_STATE,
      }),
    /Missing or unknown contract fields/,
  );
  assert.throws(
    () =>
      evaluateBlockedRecovery({
        sessionId: SESSION,
        worldEpoch: 0,
        actor: SUBJECT,
        decisionTick: 6,
        graph: fixture.graph,
        observation: { ...observation(6), version: '054-progress-observation-v9' } as never,
        state: BLOCKED_RECOVERY_EMPTY_STATE,
      }),
    /observation version/,
  );
  assert.throws(
    () => decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, { speedMps: -1 }),
    /finite number/,
  );
  assert.throws(
    () => decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, { leaderGapM: null }),
    /Leader without gap\/speed/,
  );
  assert.throws(
    () => decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, { leaderId: null }),
    /Leader gap\/speed without leader/,
  );
  assert.throws(
    () =>
      decide(fixture.graph, 6, { ...BLOCKED_RECOVERY_EMPTY_STATE, stage: 'ESCALATED' as never }),
    /Unsupported enum value/,
  );
  // Without the real033 graph the module abstains: it never claims the vehicle left the graph.
  const noGraph = decide(null, 6, BLOCKED_RECOVERY_EMPTY_STATE);
  assert.equal(noGraph.reason, 'MISSING_LANE_GRAPH');
  assert.equal(noGraph.action, 'UNKNOWN');
  assert.equal(blockedRecoveryBehaviorFacts(behaviorFacts(), noGraph), null);
  // The bounded blocked set of the041 reroute request cannot be unbounded either.
  assert.throws(
    () =>
      decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
        planner: {
          origin: 'lane-in',
          destination: 'lane-out',
          access: 'TAXI',
          graphVersion: '054-graph-v1',
          costVersion: '054-cost-v1',
          blocked: Array.from({ length: 65 }, (_, index) => `lane-${index}`),
        },
      }),
    /Blocked lane set capacity/,
  );
  assert.throws(
    () =>
      decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
        planner: {
          origin: 'lane-in',
          destination: 'lane-out',
          access: 'TAXI',
          graphVersion: '054-graph-v1',
          costVersion: '054-cost-v1',
          blocked: ['lane-a', 'lane-a'],
        },
      }),
    /Duplicate blocked lane/,
  );
  assert.deepEqual(getBlockedRecoveryStats(), {
    evaluating: false,
    retainedActors: 0,
    retainedEpisodes: 0,
    retainedHistory: 0,
  });
  fixture.dispose();
});

test('054 queue standstill blocks only past the threshold, reroutes through real041 and stays bounded', () => {
  const fixture = blockedProbeFixture(),
    planner = fixture.planner(),
    behavior = createBehaviorFSM({ sessionId: SESSION, worldEpoch: 0 });
  behavior.setActors([SUBJECT], { sessionId: SESSION, worldEpoch: 0 });
  const base = planner.findRoute({ origin: 'lane-in', destination: 'lane-out', access: 'TAXI' });
  assert.deepEqual(base.path, ['lane-in', 'lane-a', 'lane-out']);
  const reasons: string[] = [],
    actions: string[] = [],
    stages: string[] = [],
    requests: { tick: number; costVersion: string; blocked: readonly string[] }[] = [],
    fsmStates: string[] = [];
  let state = BLOCKED_RECOVERY_EMPTY_STATE,
    blocked: string[] = [],
    firstBlockedTick: number | null = null,
    lastStageOrdinal = 0;
  for (let tick = 6; tick <= 1200; tick += 6) {
    const decision = decide(fixture.graph, tick, state, {
      leaderId: fixture.leaderId,
      leaderGapM: 3,
      leaderSpeedMps: 0,
      planner: {
        origin: 'lane-in',
        destination: 'lane-out',
        access: 'TAXI',
        graphVersion: planner.graphVersion,
        costVersion: planner.costVersion,
        blocked,
      },
    });
    reasons.push(decision.reason);
    actions.push(decision.action);
    stages.push(decision.stage);
    const ordinal = BLOCKED_RECOVERY_STAGE_ORDINAL[decision.stage];
    assert(ordinal >= lastStageOrdinal, `stage never regresses: ${stages.join(' ')}`);
    lastStageOrdinal = ordinal;
    state = decision.state;
    if (decision.blocked && firstBlockedTick === null) firstBlockedTick = tick;
    if (decision.reroute !== null) {
      requests.push({
        tick,
        costVersion: decision.reroute.costVersion,
        blocked: decision.reroute.blocked,
      });
      // The real041 planner accepts exactly this descriptor; the host applies it, not this module.
      blocked = [...decision.reroute.blocked];
      planner.setBlocked(blocked);
      planner.setVersions({
        graphVersion: decision.reroute.graphVersion,
        costVersion: decision.reroute.costVersion,
      });
      const rerouted = planner.findRoute({
        origin: decision.reroute.origin,
        destination: decision.reroute.destination,
        access: decision.reroute.access,
      });
      assert.equal(rerouted.status, 'READY');
      assert.deepEqual(rerouted.path, ['lane-in', 'lane-a', 'lane-out']);
    }
    behavior.setAuthority(SUBJECT, 'AUTO', { sessionId: SESSION, worldEpoch: 0 });
    fsmStates.push(
      behavior.decide({
        sessionId: SESSION,
        worldEpoch: 0,
        actor: SUBJECT,
        decisionTick: tick,
        context: {
          sessionId: SESSION,
          worldEpoch: 0,
          sourceTick: tick,
          subject: SUBJECT,
          laneId: 'lane-in',
          leaderId: fixture.leaderId,
          vehiclesComplete: true,
          discontinuity: false,
        },
        facts: blockedRecoveryBehaviorFacts(behaviorFacts(), decision)!,
      }).state,
    );
  }
  // Hysteresis on entry: the declared threshold is real, so a queue that clears early never blocks.
  const firstBlockedIndex = reasons.indexOf('NO_PROGRESS_LEADER_STANDSTILL');
  assert(firstBlockedIndex > 0, 'the first slices are not blocked');
  assert(
    reasons.slice(0, firstBlockedIndex).every((reason) => reason === 'STAGNATION_WITHIN_THRESHOLD'),
  );
  assert.equal(
    firstBlockedTick! - 6,
    120,
    'the block is raised exactly at the declared standstill threshold',
  );
  // Explicit reason plus the documented recovery order: bounded wait, then a real reroute request.
  assert.equal(actions[firstBlockedIndex], 'WAIT');
  assert(actions.includes('REQUEST_REROUTE'));
  const firstRequest = requests[0];
  assert.equal(firstRequest.tick - firstBlockedTick!, 180, 'wait window before the reroute');
  assert.equal(requests.length, BLOCKED_RECOVERY_LIMITS.maximumRerouteAttempts);
  assert(
    firstRequest.tick - firstBlockedTick! >= BLOCKED_RECOVERY_LIMITS.waitTicksBeforeReroute,
    'no reroute before the documented wait',
  );
  for (let index = 1; index < requests.length; index++)
    assert(
      requests[index].tick - requests[index - 1].tick >=
        BLOCKED_RECOVERY_LIMITS.rerouteCooldownTicks,
      'reroute attempts are cooldown-separated',
    );
  assert.equal(new Set(requests.map((request) => request.costVersion)).size, requests.length);
  assert(
    requests.every((request) => request.blocked.length === 0),
    'a leader standstill adds no blocked lane; the reroute only re-queries with a fresh version',
  );
  assert.equal(actions[actions.length - 1], 'STAY_BLOCKED');
  assert.equal(stages[stages.length - 1], 'STAY_BLOCKED');
  assert.equal(
    reasons[0],
    'STAGNATION_WITHIN_THRESHOLD',
    'the first decision slice is a bounded wait, not a block',
  );
  assert(fsmStates.slice(0, firstBlockedIndex).every((state) => state === 'FOLLOW'));
  assert(fsmStates.slice(firstBlockedIndex).every((state) => state === 'BLOCKED'));
  // One continuous episode with a stable cause: the reason never oscillates across 200 slices.
  assert(
    reasons.slice(firstBlockedIndex).every((reason) => reason === 'NO_PROGRESS_LEADER_STANDSTILL'),
    'the episode cause is latched, not recomputed into a different family every slice',
  );
  behavior.dispose();
  fixture.dispose();
});

test('054 blocked lane ahead reroutes through the real041 planner and changes the path', () => {
  const fixture = blockedProbeFixture(),
    planner = fixture.planner(),
    base = planner.findRoute({ origin: 'lane-in', destination: 'lane-out', access: 'TAXI' });
  assert.deepEqual(base.path, ['lane-in', 'lane-a', 'lane-out']);
  const decision = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    blockedLaneAheadId: 'lane-a',
    planner: {
      origin: 'lane-in',
      destination: 'lane-out',
      access: 'TAXI',
      graphVersion: planner.graphVersion,
      costVersion: planner.costVersion,
      blocked: [],
    },
  });
  // A structural blockage needs no standstill window: the route is unusable now.
  assert.equal(decision.blocked, true);
  assert.equal(decision.reason, 'NO_PROGRESS_BLOCKED_LANE_AHEAD');
  assert.equal(decision.action, 'REQUEST_REROUTE');
  assert.equal(decision.stage, 'REROUTE');
  assert.equal(decision.limitation, 'NONE');
  assert.equal(decision.blockedLaneAheadId, 'lane-a');
  assert.equal(decision.locatedLaneId, 'lane-in');
  assert.equal(decision.stagnantTicks, 1, 'the first slice counts one authoritative stagnant tick');
  assert.equal(decision.requiredStagnantTicks, BLOCKED_RECOVERY_LIMITS.stagnationTicksToBlock);
  assert(decision.reroute !== null);
  const request = decision.reroute!;
  assert.deepEqual(request.blocked, ['lane-a']);
  assert.equal(request.origin, 'lane-in');
  assert.equal(request.destination, 'lane-out');
  assert.equal(request.access, 'TAXI');
  assert.equal(request.attempt, 1);
  assert.notEqual(
    request.costVersion,
    planner.costVersion,
    'a blocked-set change always carries a new costVersion',
  );
  assert.equal(
    request.costVersion,
    blockedRerouteCostVersion(planner.costVersion, ['lane-a'], 1),
    'the derived version is documented and deterministic',
  );
  const invalidationsBefore = planner.getStats().invalidations;
  planner.setBlocked(request.blocked);
  planner.setVersions({ graphVersion: request.graphVersion, costVersion: request.costVersion });
  const rerouted = planner.findRoute({
    origin: request.origin,
    destination: request.destination,
    access: request.access,
  });
  assert.equal(rerouted.status, 'READY');
  assert.deepEqual(rerouted.path, ['lane-in', 'lane-b', 'lane-out']);
  assert.notDeepEqual(rerouted.path, base.path, 'the legal alternative actually changed the path');
  assert(!rerouted.path!.includes('lane-a'));
  assert(planner.getStats().invalidations > invalidationsBefore);
  assert.equal(rerouted.cached, false, 'the new version cannot reuse the stale cached path');
  // A second request in the same episode bypasses the cache again and consumes the bounded budget.
  const second = decide(
    fixture.graph,
    6 + BLOCKED_RECOVERY_LIMITS.rerouteCooldownTicks,
    decision.state,
    {
      blockedLaneAheadId: 'lane-a',
      planner: {
        origin: 'lane-in',
        destination: 'lane-out',
        access: 'TAXI',
        graphVersion: planner.graphVersion,
        costVersion: planner.costVersion,
        blocked: request.blocked,
      },
    },
  );
  assert.equal(second.action, 'REQUEST_REROUTE');
  assert.equal(second.reroute?.attempt, 2);
  assert.notEqual(second.reroute?.costVersion, request.costVersion);
  assert.deepEqual(second.reroute?.blocked, ['lane-a']);
  const exhausted = decide(
    fixture.graph,
    6 + 2 * BLOCKED_RECOVERY_LIMITS.rerouteCooldownTicks,
    second.state,
    {
      blockedLaneAheadId: 'lane-a',
      planner: {
        origin: 'lane-in',
        destination: 'lane-out',
        access: 'TAXI',
        graphVersion: planner.graphVersion,
        costVersion: planner.costVersion,
        blocked: request.blocked,
      },
    },
  );
  assert.equal(exhausted.action, 'STAY_BLOCKED');
  assert.equal(exhausted.stage, 'STAY_BLOCKED');
  assert.equal(exhausted.limitation, 'ESCALATION_NOT_PERMITTED');
  assert.equal(exhausted.reroute, null, 'the reroute budget is bounded and explicit');
  assert.equal(exhausted.blocked, true);
  assert.equal(exhausted.rerouteAttempts, BLOCKED_RECOVERY_LIMITS.maximumRerouteAttempts);
  fixture.dispose();
});

test('054 distinguishes every structural cause and never blocks an arrived vehicle', () => {
  const fixture = blockedProbeFixture(),
    planner = fixture.planner(),
    plannerContext = {
      origin: 'lane-in',
      destination: 'lane-out',
      access: 'TAXI' as const,
      graphVersion: planner.graphVersion,
      costVersion: planner.costVersion,
      blocked: [] as string[],
    };
  // A terminal destination lane is a legitimate arrival, never a "no feasible successor" block.
  const arrived = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    laneId: 'lane-out',
    positionM: { x: 50, y: 0, z: 0 },
    speedMps: 8,
    leaderId: null,
    leaderSpeedMps: null,
    leaderGapM: null,
    routeStatus: 'READY',
    planner: plannerContext,
  });
  assert.equal(arrived.blocked, false);
  assert.equal(arrived.reason, 'PROGRESS');
  assert.equal(arrived.action, 'CONTINUE');
  assert.equal(arrived.locatedLaneId, 'lane-out');
  // The same lane with an unusable route is an explicit no-feasible-successor block.
  const deadEnd = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    laneId: 'lane-out',
    positionM: { x: 50, y: 0, z: 0 },
    speedMps: 8,
    leaderId: null,
    leaderSpeedMps: null,
    leaderGapM: null,
    routeStatus: 'UNREACHABLE',
    planner: plannerContext,
  });
  assert.equal(deadEnd.blocked, true);
  assert.equal(deadEnd.reason, 'NO_PROGRESS_NO_FEASIBLE_SUCCESSOR');
  assert.equal(deadEnd.action, 'REQUEST_REROUTE');
  // A workbook route budget exhaustion is a distinct cause, not a merged "blocked".
  const exhaustedRoute = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    routeStatus: 'BUDGET_EXHAUSTED',
    planner: plannerContext,
  });
  assert.equal(exhaustedRoute.reason, 'NO_PROGRESS_ROUTE_BLOCKED');
  assert.equal(exhaustedRoute.action, 'REQUEST_REROUTE');
  const unknownOrigin = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    routeStatus: 'ORIGIN_UNKNOWN',
    planner: plannerContext,
  });
  assert.equal(unknownOrigin.reason, 'NO_PROGRESS_ROUTE_BLOCKED');
  const mismatch = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    routeStatus: 'SERVICE_ACCESS_MISMATCH',
    planner: plannerContext,
  });
  assert.equal(mismatch.reason, 'NO_PROGRESS_ROUTE_BLOCKED');
  // Off every corridor with no planner is a physical blockage whose only recovery is explicit030.
  const offGraph = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    positionM: { x: 60, y: 0, z: 12 },
    laneId: 'lane-out',
    leaderId: null,
    leaderGapM: null,
    leaderSpeedMps: null,
    routeStatus: 'UNREACHABLE',
    allowRecoveryEscalation: true,
  });
  assert.equal(offGraph.reason, 'NO_PROGRESS_OFF_GRAPH');
  assert.equal(offGraph.action, 'REQUEST_RECOVERY');
  assert.equal(offGraph.stage, 'RECOVERY');
  assert.equal(offGraph.locatedLaneId, null);
  assert.equal(offGraph.recovery?.intent, 'RECOVERY_TO_VALID_POINT');
  assert.equal(offGraph.recovery?.reason, 'NO_PROGRESS_OFF_GRAPH');
  // Exactly 030's RecoveryRoadProof, derived from the real033 directed path of the last known lane.
  assert.deepEqual(offGraph.recovery?.road, {
    mapId: '054-blocked-corridor-v1',
    laneId: 'lane-out',
    access: 'TAXI',
    start: { x: 40, y: 0, z: 0 },
    end: { x: 70, y: 0, z: 0 },
    widthM: 3.5,
  });
  // Without host permission the same situation stays explicitly blocked with a named cause.
  const disallowed = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    positionM: { x: 60, y: 0, z: 12 },
    leaderId: null,
    leaderGapM: null,
    leaderSpeedMps: null,
    allowRecoveryEscalation: false,
  });
  assert.equal(disallowed.reason, 'NO_PROGRESS_OFF_GRAPH');
  assert.equal(disallowed.stage, 'STAY_BLOCKED');
  assert.equal(disallowed.action, 'STAY_BLOCKED');
  assert.equal(disallowed.limitation, 'ESCALATION_NOT_PERMITTED');
  assert.equal(disallowed.recovery, null);
  // Permission granted but no real033 lane left to recover onto: no fabricated target.
  const noTarget = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
    positionM: { x: 60, y: 0, z: 12 },
    laneId: null,
    leaderId: null,
    leaderGapM: null,
    leaderSpeedMps: null,
    allowRecoveryEscalation: true,
  });
  assert.equal(noTarget.stage, 'STAY_BLOCKED');
  assert.equal(noTarget.limitation, 'NO_RECOVERY_TARGET');
  assert.equal(noTarget.recovery, null);
  assert.equal(noTarget.action, 'STAY_BLOCKED');
  fixture.dispose();
});

test('054 hysteresis keeps one episode across a progress blip and releases only after the hold', () => {
  const fixture = blockedProbeFixture(),
    planner = fixture.planner(),
    plannerContext = {
      origin: 'lane-in',
      destination: 'lane-out',
      access: 'TAXI' as const,
      graphVersion: planner.graphVersion,
      costVersion: planner.costVersion,
      blocked: [] as string[],
    },
    first = decide(fixture.graph, 6, BLOCKED_RECOVERY_EMPTY_STATE, {
      blockedLaneAheadId: 'lane-a',
      planner: plannerContext,
    });
  assert.equal(first.stage, 'REROUTE');
  assert.equal(first.rerouteAttempts, 1);
  assert(first.reroute !== null);
  // A single progressing slice is not a recovery: the episode keeps its stage and its budget.
  const blip = decide(fixture.graph, 12, first.state, {
    speedMps: 8,
    leaderId: null,
    leaderGapM: null,
    leaderSpeedMps: null,
    blockedLaneAheadId: null,
  });
  assert.equal(blip.blocked, false);
  assert.equal(blip.reason, 'PROGRESS');
  assert.equal(blip.action, 'CONTINUE');
  assert.equal(blip.stage, 'REROUTE', 'the episode stage is retained across a blip');
  assert.equal(blip.rerouteAttempts, 1);
  assert.equal(blip.reroute, null, 'a blip cannot trigger a fresh reroute');
  // Back to stagnation below the threshold: no immediate re-block and no stage regression.
  const again = decide(fixture.graph, 18, blip.state, {
    blockedLaneAheadId: null,
    planner: plannerContext,
  });
  assert.equal(again.blocked, false);
  assert.equal(again.reason, 'STAGNATION_WITHIN_THRESHOLD');
  assert.equal(again.action, 'WAIT');
  assert.equal(again.stage, 'REROUTE', 'the retained stage never regresses to WAITING');
  assert.equal(again.reroute, null);
  // A first progressing slice only starts the hold; the episode is not released yet.
  const held = decide(fixture.graph, 24, again.state, {
    speedMps: 8,
    leaderId: null,
    leaderGapM: null,
    leaderSpeedMps: null,
    blockedLaneAheadId: null,
  });
  assert.equal(held.reason, 'PROGRESS');
  assert.equal(
    held.stage,
    'REROUTE',
    'the declared hold is not reached after one progressing slice',
  );
  assert.equal(held.rerouteAttempts, 1);
  // The declared hold is reached: only now is the episode released and its budget reset.
  const released = decide(fixture.graph, 30, held.state, {
    speedMps: 8,
    leaderId: null,
    leaderGapM: null,
    leaderSpeedMps: null,
    blockedLaneAheadId: null,
  });
  assert.equal(released.reason, 'PROGRESS');
  assert.equal(released.stage, 'NONE');
  assert.equal(released.rerouteAttempts, 0);
  assert.equal(released.blockedSinceTick, null);
  assert.equal(released.stagnantSinceTick, null);
  assert.deepEqual(released.state, { ...BLOCKED_RECOVERY_EMPTY_STATE, lastDecisionTick: 30 });
  // A fresh episode then needs the full threshold again: no oscillation at slice granularity.
  let fresh: BlockedRecoveryState = released.state;
  for (let tick = 36; tick <= 150; tick += 6) {
    const decision = decide(fixture.graph, tick, fresh, {
      leaderId: fixture.leaderId,
      leaderGapM: 3,
      leaderSpeedMps: 0,
      blockedLaneAheadId: null,
      planner: plannerContext,
    });
    assert.equal(decision.blocked, false, `still below threshold at ${tick}`);
    assert.equal(decision.reason, 'STAGNATION_WITHIN_THRESHOLD');
    fresh = decision.state;
  }
  const reblocked = decide(fixture.graph, 156, fresh, {
    leaderId: fixture.leaderId,
    leaderGapM: 3,
    leaderSpeedMps: 0,
    blockedLaneAheadId: null,
    planner: plannerContext,
  });
  assert.equal(reblocked.blocked, true);
  assert.equal(reblocked.reason, 'NO_PROGRESS_LEADER_STANDSTILL');
  assert.equal(reblocked.blockedSinceTick, 156);
  assert.equal(reblocked.stage, 'WAITING', 'the new episode restarts at the wait stage');
  assert.equal(reblocked.rerouteAttempts, 0);
  fixture.dispose();
});

test('054 re-entry after MANUAL produces a plan and never teleports the vehicle', () => {
  const fixture = blockedProbeFixture(),
    planner = fixture.planner();
  const reentry = (
    authority: 'AUTO' | 'MANUAL' | 'LEARNING',
    overrides: Partial<AuthorityReentryObservation> = {},
  ) =>
    evaluateAuthorityReentry({
      sessionId: SESSION,
      worldEpoch: 0,
      actor: SUBJECT,
      decisionTick: 60,
      authority,
      graph: fixture.graph,
      observation: {
        version: '054-progress-observation-v1',
        units: 'SI',
        tick: 60,
        access: 'TAXI',
        positionM: { x: 10, y: 0, z: 0 },
        headingRad: 0,
        routeStatus: 'READY',
        destination: 'lane-out',
        recoveryLaneId: 'lane-in',
        allowRecoveryEscalation: false,
        ...overrides,
      },
    });
  // The human owns the vehicle while MANUAL/LEARNING: the module never plans over a driver.
  assert.equal(reentry('MANUAL').action, 'CONTINUE');
  assert.equal(reentry('MANUAL').reason, 'MANUAL_AUTHORITY');
  assert.equal(reentry('LEARNING').reason, 'MANUAL_AUTHORITY');
  // Aligned with the real033 corridor: nothing to do.
  const aligned = reentry('AUTO');
  assert.equal(aligned.action, 'CONTINUE');
  assert.equal(aligned.reason, 'ON_LANE');
  assert.equal(aligned.targetLaneId, 'lane-in');
  assert.equal(aligned.lateralOffsetM, 0);
  // The authority returned to AUTO while the vehicle is off the lane centre: an explicit plan.
  const pose = Object.freeze({
    x: 10,
    y: 0,
    z: 1.4,
  });
  const planned = reentry('AUTO', { positionM: pose });
  assert.equal(planned.action, 'DRIVE_TO_LANE');
  assert.equal(planned.reason, 'OFF_CENTRE_LANE');
  assert.equal(planned.targetLaneId, 'lane-in');
  assert(Math.abs(planned.lateralOffsetM! - 1.4) < 1e-9);
  assert(Math.abs(planned.distanceToLaneM! - 1.4) < 1e-9);
  assert.equal(planned.headingErrorRad, 0);
  assert.equal(
    planned.recovery,
    null,
    'an ordinary off-centre re-entry never asks for a placement',
  );
  // The plan is geometry, not a pose: there is no write path and no transform in the decision.
  assert.equal(planned.teleportsVehicle, false);
  assert(!Object.hasOwn(planned, 'positionM'));
  assert(!Object.hasOwn(planned, 'transform'));
  assert.deepEqual(
    Object.keys(planned).filter((key) => /position|transform|teleport|pose/i.test(key)),
    ['teleportsVehicle'],
  );
  assert.deepEqual(pose, { x: 10, y: 0, z: 1.4 }, 'the authoritative pose is unchanged');
  // The drive is only claimed when the real041 planner proved the re-entry route.
  assert.equal(
    planner.findRoute({ origin: 'lane-in', destination: 'lane-out', access: 'TAXI' }).status,
    'READY',
  );
  fixture.dispose();
});

test('054 impossible re-entry fails explicitly with a reason and stays bounded', () => {
  const fixture = blockedProbeFixture();
  const reentry = (
    overrides: Partial<AuthorityReentryObservation> = {},
    graph: ReturnType<typeof blockedProbeFixture>['graph'] | null = fixture.graph,
  ) =>
    evaluateAuthorityReentry({
      sessionId: SESSION,
      worldEpoch: 0,
      actor: SUBJECT,
      decisionTick: 60,
      authority: 'AUTO',
      graph,
      observation: {
        version: '054-progress-observation-v1',
        units: 'SI',
        tick: 60,
        access: 'TAXI',
        positionM: { x: 60, y: 0, z: 12 },
        headingRad: 0,
        routeStatus: 'READY',
        destination: 'lane-out',
        recoveryLaneId: 'lane-b',
        allowRecoveryEscalation: false,
        ...overrides,
      },
    });
  // No lane within tolerance and no explicit030 permission: a bounded, explicit failure.
  const impossible = reentry();
  assert.equal(impossible.action, 'REENTRY_IMPOSSIBLE');
  assert.equal(impossible.reason, 'RECOVERY_DISALLOWED');
  assert.equal(impossible.targetLaneId, null);
  assert.equal(impossible.recovery, null);
  for (let index = 0; index < 100; index++) {
    const repeated = reentry();
    assert.equal(repeated.action, 'REENTRY_IMPOSSIBLE');
    assert.deepEqual(repeated, impossible, 'no loop, no silent success, deterministic failure');
  }
  // With host permission the very same situation becomes an explicit030 request with a real proof.
  const escalated = reentry({ allowRecoveryEscalation: true });
  assert.equal(escalated.action, 'REQUEST_RECOVERY');
  assert.equal(escalated.reason, 'RECOVERY_REQUESTED');
  assert.equal(escalated.recovery?.intent, 'RECOVERY_TO_VALID_POINT');
  assert.equal(escalated.recovery?.reason, 'NO_PROGRESS_OFF_GRAPH');
  assert.deepEqual(escalated.recovery?.road, {
    mapId: '054-blocked-corridor-v1',
    laneId: 'lane-b',
    access: 'TAXI',
    start: { x: 21, y: 0, z: 12 },
    end: { x: 40, y: 0, z: 0 },
    widthM: 3.5,
  });
  // Permission without any known recovery lane is still an explicit failure, not a silent success.
  const noTarget = reentry({ allowRecoveryEscalation: true, recoveryLaneId: null });
  assert.equal(noTarget.action, 'REENTRY_IMPOSSIBLE');
  assert.equal(noTarget.reason, 'NO_RECOVERY_TARGET');
  // A lane is located but the drive-back route is not proven by the real041 planner.
  const notProven = reentry({
    positionM: { x: 10, y: 0, z: 1.4 },
    routeStatus: null,
  });
  assert.equal(notProven.action, 'REENTRY_IMPOSSIBLE');
  assert.equal(notProven.reason, 'ROUTE_NOT_PROVEN');
  const unreachable = reentry({
    positionM: { x: 10, y: 0, z: 1.4 },
    routeStatus: 'UNREACHABLE',
  });
  assert.equal(unreachable.action, 'REENTRY_IMPOSSIBLE');
  assert.equal(unreachable.reason, 'RECOVERY_DISALLOWED');
  const unreachableEscalated = reentry({
    positionM: { x: 10, y: 0, z: 1.4 },
    routeStatus: 'UNREACHABLE',
    allowRecoveryEscalation: true,
  });
  assert.equal(unreachableEscalated.action, 'REQUEST_RECOVERY');
  assert.deepEqual(unreachableEscalated.recovery?.road?.laneId, 'lane-in');
  // A missing graph or a missing/stale observation is reported, never assumed.
  const noGraph = reentry({}, null);
  assert.equal(noGraph.action, 'UNKNOWN');
  assert.equal(noGraph.reason, 'MISSING_LANE_GRAPH');
  const noObservation = evaluateAuthorityReentry({
    sessionId: SESSION,
    worldEpoch: 0,
    actor: SUBJECT,
    decisionTick: 60,
    authority: 'AUTO',
    graph: fixture.graph,
    observation: null,
  });
  assert.equal(noObservation.action, 'UNKNOWN');
  assert.equal(noObservation.reason, 'NO_OBSERVATION');
  assert.equal(noObservation.teleportsVehicle, false);
  assert.throws(() => reentry({ tick: 40 }), /stale or from the future/);
  assert.throws(() => reentry({ routeStatus: 'PARKED' as never }), /Unsupported enum value/);
  fixture.dispose();
});
