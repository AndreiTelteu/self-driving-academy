import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateTakeoverContinuity,
  getTakeoverContinuityStats,
  TAKEOVER_CONTINUITY_LIMITS,
  TAKEOVER_CONTINUITY_OWNERSHIP,
  TAKEOVER_SEGMENT_CLOSE_REASONS,
  takeoverContinuityBehaviorFacts,
} from '../../src/autonomy/takeover-continuity';
import type {
  TakeoverCommand,
  TakeoverContinuityDecision,
  TakeoverPhysicalState,
} from '../../src/autonomy/takeover-continuity';
import { createBehaviorFSM } from '../../src/autonomy/behavior-fsm';
import type { BehaviorActor, BehaviorFacts } from '../../src/autonomy/behavior-fsm';
import type { AuthorityReentryObservation } from '../../src/autonomy/blocked-recovery';
import type { LaneGraph } from '../../src/world';
import { segmentCloseReasons } from '../../src/telemetry';
import { createControlAuthority } from '../../src/input/control-authority';
import { createVehicleController } from '../../src/vehicles/controller';
import type { BodyIdentity } from '../../src/vehicles/body-port';
import { createPauseFocusOwner } from '../../src/app/pause-focus';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference';
import { segmentFixture } from '../telemetry/manual-segments-fixture';
import { blockedProbeFixture } from './policy-probe-fixture';

const SESSION = '071-probe';
const SUBJECT: BehaviorActor = { id: 'taxi-071', incarnation: 1 };
const DT = TAKEOVER_CONTINUITY_LIMITS.dtSeconds;

/** Deep freeze used to prove the module has no write path into anything it is given. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null)
    for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}
function physical(
  tick: number,
  overrides: Partial<TakeoverPhysicalState> = {},
): TakeoverPhysicalState {
  return {
    tick,
    positionM: { x: 10, y: 0, z: 0 },
    headingRad: 0,
    velocityMps: { x: 0, y: 0, z: 0 },
    yawRateRadps: 0,
    drivetrainDirection: 'FORWARD',
    damage: 0,
    ...overrides,
  };
}
/** The exact physical continuation of one authoritative step: pose and heading integrate, carry stays. */
function advance(state: TakeoverPhysicalState, tick: number): TakeoverPhysicalState {
  return {
    ...state,
    tick,
    positionM: {
      x: state.positionM.x + state.velocityMps.x * DT,
      y: state.positionM.y + state.velocityMps.y * DT,
      z: state.positionM.z + state.velocityMps.z * DT,
    },
    headingRad: state.headingRad + state.yawRateRadps * DT,
  };
}
function command(overrides: Partial<TakeoverCommand> = {}): TakeoverCommand {
  return { source: 'PLAYER', throttle: 0, brake: 0, steering: 0, handbrake: false, ...overrides };
}
function observation(
  tick: number,
  positionM: TakeoverPhysicalState['positionM'],
  overrides: Partial<AuthorityReentryObservation> = {},
): AuthorityReentryObservation {
  return {
    version: '054-progress-observation-v1',
    units: 'SI',
    tick,
    access: 'TAXI',
    positionM,
    headingRad: 0,
    routeStatus: 'READY',
    destination: 'lane-out',
    recoveryLaneId: 'lane-in',
    allowRecoveryEscalation: false,
    ...overrides,
  };
}
interface HandoverOptions {
  readonly tick?: number;
  readonly authority?: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly closedMode?: 'MANUAL' | 'LEARNING' | null;
  readonly collisionObserved?: boolean;
  readonly before?: Partial<TakeoverPhysicalState>;
  readonly after?:
    Partial<TakeoverPhysicalState> | ((before: TakeoverPhysicalState) => TakeoverPhysicalState);
  readonly lastManualCommand?: TakeoverCommand | null;
  readonly firstAutonomyCommand?: TakeoverCommand | null;
  readonly observation?: Partial<AuthorityReentryObservation> | null;
  readonly graph?: LaneGraph | null;
}
/** Real 071 evaluation over one authoritative step on the real 033/041/054 chain. */
function handover(
  graph: LaneGraph | null,
  options: HandoverOptions = {},
): TakeoverContinuityDecision {
  const tick = options.tick ?? 60,
    before = physical(tick - 1, options.before),
    after =
      typeof options.after === 'function'
        ? options.after(before)
        : physical(tick, { ...options.after, tick });
  return evaluateTakeoverContinuity({
    sessionId: SESSION,
    worldEpoch: 0,
    actor: SUBJECT,
    decisionTick: tick,
    authority: options.authority ?? 'AUTO',
    closedMode: options.closedMode ?? null,
    collisionObserved: options.collisionObserved ?? false,
    graph,
    before,
    after,
    lastManualCommand: options.lastManualCommand ?? null,
    firstAutonomyCommand: options.firstAutonomyCommand ?? null,
    observation:
      options.observation === null
        ? null
        : observation(tick, after.positionM, options.observation ?? {}),
  });
}
function behaviorFacts(): BehaviorFacts {
  return {
    version: '045-decision-facts-v1',
    profileVersionId: '071-test-profile-v1',
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
}

test('071 preserves the physical state across an in-curve takeover and never writes a pose', () => {
  const fixture = blockedProbeFixture(),
    before = deepFreeze(
      physical(59, { headingRad: 0, velocityMps: { x: 8, y: 0, z: 0 }, yawRateRadps: 0.6 }),
    ),
    frozenBefore = JSON.stringify(before),
    after = deepFreeze(advance(before, 60)),
    frozenAfter = JSON.stringify(after),
    decision = evaluateTakeoverContinuity({
      sessionId: SESSION,
      worldEpoch: 0,
      actor: SUBJECT,
      decisionTick: 60,
      authority: 'AUTO',
      closedMode: 'MANUAL',
      collisionObserved: false,
      graph: fixture.graph,
      before,
      after,
      lastManualCommand: command({ source: 'PLAYER', throttle: 0.4, steering: 0.1 }),
      firstAutonomyCommand: command({ source: 'AUTONOMY', throttle: 0.45, steering: 0.12 }),
      observation: observation(60, after.positionM),
    });
  // Every authoritative channel is carried: pose advances exactly one integrated step, the angular
  // state is carried, the gear/drivetrain direction and the damage are bit-identical.
  assert.equal(decision.statePreserved, true);
  assert.deepEqual(decision.violations, []);
  assert.equal(decision.reason, 'STATE_PRESERVED');
  assert.equal(decision.drivetrainPreserved, true);
  assert.equal(decision.damagePreserved, true);
  assert(
    Math.abs(decision.measured.positionM - 8 * DT) < 1e-12,
    'the pose delta is exactly the physical step',
  );
  assert(Math.abs(decision.measured.headingRad - 0.6 * DT) < 1e-12);
  assert.equal(decision.measured.velocityMps, 0);
  assert.equal(decision.measured.yawRateRadps, 0);
  // The curve is what makes the heading bound real: the delta is ten times the flat epsilon, yet it
  // is inside the yaw-rate-derived bound, so an in-curve takeover is not flagged as a discontinuity.
  assert(decision.measured.headingRad > TAKEOVER_CONTINUITY_LIMITS.headingEpsilonRad);
  assert(decision.measured.headingRad <= decision.bounds.headingRad);
  assert(decision.measured.positionM <= decision.bounds.positionM);
  // The re-entry is the real 054 decision on the real 033 corridor.
  assert.equal(decision.reentry, 'CONTINUE');
  assert.equal(decision.reentryReason, 'ON_LANE');
  assert.equal(decision.blocked, false);
  assert.equal(decision.targetLaneId, 'lane-in');
  // No teleport, no pose in the decision: the module has no write path into the authoritative state.
  assert.equal(decision.teleportsVehicle, false);
  assert.equal(decision.segmentCloseReason, 'RETURN_TO_AUTO');
  assert.deepEqual(
    Object.keys(decision).filter((key) => /position|transform|teleport|pose/i.test(key)),
    ['teleportsVehicle'],
    'the decision carries no authoritative transform to write back',
  );
  assert.equal(
    JSON.stringify(before),
    frozenBefore,
    'the given authoritative state was not mutated',
  );
  assert.equal(JSON.stringify(after), frozenAfter);
  assert.deepEqual(getTakeoverContinuityStats(), {
    evaluating: false,
    retainedActors: 0,
    retainedHandovers: 0,
    retainedHistory: 0,
  });
  fixture.dispose();
});

test('071 reports a teleport/re-initialisation instead of clamping it, and never blocks on its own', () => {
  const fixture = blockedProbeFixture();
  // A rolling vehicle whose pose jumps 10 m along its own lane while its velocity is re-initialised
  // to zero: exactly what a teleport or a body reset looks like, and physically impossible in one step.
  const decision = handover(fixture.graph, {
    before: { velocityMps: { x: 8, y: 0, z: 0 }, drivetrainDirection: 'FORWARD', damage: 0.4 },
    after: { positionM: { x: 20, y: 0, z: 0 }, drivetrainDirection: 'FORWARD', damage: 0.4 },
  });
  assert.deepEqual(decision.violations, ['POSITION_STEP', 'VELOCITY_STEP']);
  assert.equal(decision.statePreserved, false);
  assert.equal(decision.reason, 'STATE_CONTINUITY_VIOLATION');
  // Reported, not silently clamped: the measured step is the real 10 m, above the 8 m/s budget.
  assert.equal(decision.measured.positionM, 10);
  assert.equal(decision.bounds.positionM, 8 * DT + TAKEOVER_CONTINUITY_LIMITS.positionEpsilonM);
  assert(decision.measured.positionM > decision.bounds.positionM);
  // The lane is still located, so 054 reports a feasible re-entry: 071 does NOT invent a BLOCKED
  // state out of a continuity violation. The physical producer stays authoritative (021/024).
  assert.equal(decision.reentry, 'CONTINUE');
  assert.equal(decision.reentryReason, 'ON_LANE');
  assert.equal(decision.blocked, false);
  assert.equal(takeoverContinuityBehaviorFacts(behaviorFacts(), decision)!.routeBlocked, false);
  assert.ok(TAKEOVER_CONTINUITY_OWNERSHIP.disagreement.includes('never repairs'));
  fixture.dispose();
});

test('071 bounds the command step between the last MANUAL and the first AUTONOMY command', () => {
  const fixture = blockedProbeFixture(),
    within = handover(fixture.graph, {
      lastManualCommand: command({ source: 'PLAYER', throttle: 0.4, steering: 0.1 }),
      firstAutonomyCommand: command({ source: 'AUTONOMY', throttle: 0.45, steering: 0.12 }),
    });
  assert(Math.abs(within.commandStep! - 0.05) < 1e-12);
  assert.equal(within.commandStepBound, TAKEOVER_CONTINUITY_LIMITS.maximumCommandStepPerTick);
  assert.equal(within.commandContinuity, 'WITHIN_BOUND');
  assert.equal(within.commandHandling, 'NONE');
  // A hard-braking driver handing over to a full-throttle AI target is a real discontinuity: measured,
  // bounded and reported to the owner (024 is the command arbiter) but never rewritten here.
  const exceeded = handover(fixture.graph, {
      lastManualCommand: command({ source: 'PLAYER', brake: 1 }),
      firstAutonomyCommand: command({ source: 'AUTONOMY', throttle: 1 }),
    }),
    handbrake = handover(fixture.graph, {
      lastManualCommand: command({ source: 'PLAYER', handbrake: true }),
      firstAutonomyCommand: command({ source: 'AUTONOMY', handbrake: false }),
    });
  assert.equal(exceeded.commandStep, 1);
  assert.equal(exceeded.commandContinuity, 'EXCEEDS_BOUND');
  assert.equal(exceeded.commandHandling, 'REPORTED');
  assert.equal(handbrake.commandStep, 1);
  assert.equal(handbrake.commandContinuity, 'EXCEEDS_BOUND');
  // No MANUAL command (the driver never commanded) is an explicit abstention, never a fake PASS.
  const unknown = handover(fixture.graph, {
    firstAutonomyCommand: command({ source: 'AUTONOMY', throttle: 0.5 }),
  });
  assert.equal(unknown.commandStep, null);
  assert.equal(unknown.commandContinuity, 'UNKNOWN');
  assert.equal(unknown.commandHandling, 'NONE');
  fixture.dispose();
});

test('071 off-centre re-entry plans a real drive back to the 033 lane and keeps the state', () => {
  const fixture = blockedProbeFixture(),
    projection = fixture.graph.locateLane({
      positionM: { x: 10, y: 0, z: 1.4 },
      access: 'TAXI',
      headingRad: 0,
    }),
    decision = handover(fixture.graph, {
      before: { positionM: { x: 10, y: 0, z: 1.4 }, velocityMps: { x: 0.4, y: 0, z: 0 } },
      after: { positionM: { x: 10.0067, y: 0, z: 1.4 }, velocityMps: { x: 0.4, y: 0, z: 0 } },
      observation: { positionM: { x: 10.0067, y: 0, z: 1.4 } },
    });
  // The 054 plan is real 033 geometry, not a re-derived corridor.
  assert.notEqual(projection, null);
  assert.equal(decision.reentry, 'DRIVE_TO_LANE');
  assert.equal(decision.reentryReason, 'OFF_CENTRE_LANE');
  assert.equal(decision.targetLaneId, projection!.lane.id);
  assert.equal(decision.targetLaneId, 'lane-in');
  assert(Math.abs(decision.lateralOffsetM! - projection!.lateralOffsetM!) < 1e-12);
  assert(Math.abs(decision.lateralOffsetM! - 1.4) < 1e-9);
  assert(Math.abs(decision.distanceToLaneM! - 1.4) < 1e-9);
  assert.equal(decision.recovery, null, 'an ordinary drive back never asks for a placement');
  // Driving back to the lane is a feasible re-entry: not a block. The physical state is still carried.
  assert.equal(decision.blocked, false);
  assert.equal(decision.statePreserved, true);
  assert.deepEqual(decision.violations, []);
  assert.equal(decision.teleportsVehicle, false);
  fixture.dispose();
});

test('071 impossible re-entry becomes BLOCKED with the 054 cause, deterministically and bounded', () => {
  const fixture = blockedProbeFixture(),
    behavior = createBehaviorFSM({ sessionId: SESSION, worldEpoch: 0 }),
    context = {
      sessionId: SESSION,
      worldEpoch: 0,
      sourceTick: 60,
      subject: SUBJECT,
      laneId: 'lane-in',
      leaderId: null,
      vehiclesComplete: true,
      discontinuity: false,
    };
  behavior.setActors([SUBJECT], { sessionId: SESSION, worldEpoch: 0 });
  // Off every 033 corridor with no 030 permission: the explicit, bounded, terminal failure.
  const offGraphPose = { x: 60, y: 0, z: 12 } as const,
    impossible = handover(fixture.graph, {
      before: { positionM: offGraphPose },
      after: { positionM: offGraphPose },
      observation: { positionM: offGraphPose, recoveryLaneId: 'lane-b' },
    });
  assert.equal(impossible.blocked, true);
  assert.equal(impossible.reentry, 'REENTRY_IMPOSSIBLE');
  assert.equal(impossible.reentryReason, 'RECOVERY_DISALLOWED');
  assert.equal(impossible.recovery, null);
  assert.equal(impossible.targetLaneId, null);
  // The 045 state is raised through the existing fact only: BLOCKED with the 045 reason, no new state.
  const facts = takeoverContinuityBehaviorFacts(behaviorFacts(), impossible)!;
  assert.equal(facts.routeBlocked, true);
  const outcome = behavior.decide({
    sessionId: SESSION,
    worldEpoch: 0,
    actor: SUBJECT,
    decisionTick: 60,
    context,
    facts,
  });
  assert.equal(outcome.state, 'BLOCKED');
  assert.equal(outcome.reason, 'BLOCKED_ROUTE');
  // Deterministic and bounded: the same input always yields the same frozen outcome, with no loop.
  for (let index = 0; index < 100; index++) {
    const repeated = handover(fixture.graph, {
      before: { positionM: offGraphPose },
      after: { positionM: offGraphPose },
      observation: { positionM: offGraphPose, recoveryLaneId: 'lane-b' },
    });
    assert.deepEqual(repeated, impossible, 'no silent success and no oscillation over 100 calls');
  }
  // Host permission turns the same situation into the explicit 030 request: BLOCKED plus the remedy,
  // and the road proof is exactly the 030 shape derived from the real 033 directed path.
  const escalated = handover(fixture.graph, {
    before: { positionM: offGraphPose },
    after: { positionM: offGraphPose },
    observation: {
      positionM: offGraphPose,
      recoveryLaneId: 'lane-b',
      allowRecoveryEscalation: true,
    },
  });
  assert.equal(escalated.blocked, true);
  assert.equal(escalated.reentry, 'REQUEST_RECOVERY');
  assert.equal(escalated.reentryReason, 'RECOVERY_REQUESTED');
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
  // Permission without a real 033 lane is still an explicit named failure, never a silent success.
  const noTarget = handover(fixture.graph, {
    before: { positionM: offGraphPose },
    after: { positionM: offGraphPose },
    observation: {
      positionM: offGraphPose,
      recoveryLaneId: null,
      allowRecoveryEscalation: true,
    },
  });
  assert.equal(noTarget.blocked, true);
  assert.equal(noTarget.reentryReason, 'NO_RECOVERY_TARGET');
  assert.equal(noTarget.recovery, null);
  // A locatable lane whose drive-back route the real 041 planner did not prove is also a block.
  const notProven = handover(fixture.graph, {
    before: { velocityMps: { x: 0.4, y: 0, z: 0 } },
    after: {
      positionM: { x: 10.0067, y: 0, z: 1.4 },
      velocityMps: { x: 0.4, y: 0, z: 0 },
    },
    observation: { positionM: { x: 10.0067, y: 0, z: 1.4 }, routeStatus: null },
  });
  assert.equal(notProven.blocked, true);
  assert.equal(notProven.reentry, 'REENTRY_IMPOSSIBLE');
  assert.equal(notProven.reentryReason, 'ROUTE_NOT_PROVEN');
  assert.equal(takeoverContinuityBehaviorFacts(behaviorFacts(), impossible)!.routeBlocked, true);
  behavior.dispose();
  fixture.dispose();
});

test('071 collision takeover preserves state and fabricates neither a repair nor a recovery', () => {
  const fixture = blockedProbeFixture(),
    // The declared real collision impulse: the car keeps rolling, speed and yaw rate change, the
    // accumulated damage does not, and the pose never moves faster than the pre-impact speed.
    collision = handover(fixture.graph, {
      collisionObserved: true,
      before: {
        velocityMps: { x: 8, y: 0, z: 0 },
        yawRateRadps: 0,
        drivetrainDirection: 'FORWARD',
        damage: 0.35,
      },
      after: {
        positionM: { x: 10.1333, y: 0, z: 0 },
        velocityMps: { x: 2, y: 0, z: 0 },
        yawRateRadps: 1.5,
        drivetrainDirection: 'FORWARD',
        damage: 0.35,
      },
    });
  assert.equal(collision.collisionObserved, true);
  assert.equal(collision.statePreserved, true, 'a declared impulse is not a re-initialisation');
  assert.deepEqual(collision.violations, []);
  assert.equal(collision.damagePreserved, true, 'no repair may be fabricated');
  assert.equal(collision.drivetrainPreserved, true, 'no shift may be fabricated');
  assert.equal(collision.recovery, null, 'no placement may be fabricated from a collision');
  assert.equal(collision.reentry, 'CONTINUE');
  assert.equal(collision.blocked, false);
  assert.equal(collision.measured.velocityMps, 6, 'the real impulse magnitude is still reported');
  assert.equal(collision.measured.yawRateRadps, 1.5);
  // Without the declared collision the very same deltas are a reported discontinuity: the exemption
  // is exactly the collision flag, never a blanket tolerance.
  const undeclared = handover(fixture.graph, {
    before: { velocityMps: { x: 8, y: 0, z: 0 }, drivetrainDirection: 'FORWARD', damage: 0.35 },
    after: {
      positionM: { x: 10.1333, y: 0, z: 0 },
      velocityMps: { x: 2, y: 0, z: 0 },
      yawRateRadps: 1.5,
      drivetrainDirection: 'FORWARD',
      damage: 0.35,
    },
  });
  assert.deepEqual(undeclared.violations, ['VELOCITY_STEP', 'YAW_RATE_STEP']);
  assert.equal(undeclared.statePreserved, false);
  // A fabricated repair (damage dropping) and a fabricated shift stay violations even under a
  // declared collision: the strict channels are carried, not integrated.
  const repaired = handover(fixture.graph, {
    collisionObserved: true,
    before: { damage: 0.35, drivetrainDirection: 'REVERSE' },
    after: { damage: 0.2, drivetrainDirection: 'FORWARD' },
  });
  assert.deepEqual(repaired.violations, ['DRIVETRAIN_CHANGE', 'DAMAGE_CHANGE']);
  assert.equal(repaired.statePreserved, false);
  assert.equal(repaired.damagePreserved, false);
  assert.equal(repaired.drivetrainPreserved, false);
  assert.equal(repaired.recovery, null);
  fixture.dispose();
});

test('071 abstains without a graph or an observation and never fabricates a fact', () => {
  const fixture = blockedProbeFixture(),
    noObservation = handover(fixture.graph, { observation: null }),
    noGraph = handover(null, {});
  for (const decision of [noObservation, noGraph]) {
    assert.equal(decision.blocked, false);
    assert.equal(decision.reentry, 'UNKNOWN');
    assert.equal(decision.reason, 'REENTRY_ABSTAINED');
    assert.equal(decision.recovery, null);
    assert.equal(decision.targetLaneId, null);
    assert.equal(decision.teleportsVehicle, false);
    assert.equal(decision.statePreserved, true, 'an abstention does not invent a state violation');
    assert.equal(
      takeoverContinuityBehaviorFacts(behaviorFacts(), decision),
      null,
      'an abstention leaves the caller fact untouched',
    );
  }
  assert.equal(noObservation.reentryReason, 'NO_OBSERVATION');
  assert.equal(noGraph.reentryReason, 'MISSING_LANE_GRAPH');
  // MANUAL/LEARNING authority is never planned over: 054 owns that rule and 071 re-exposes it.
  const manual = handover(fixture.graph, { authority: 'MANUAL', closedMode: 'MANUAL' });
  assert.equal(manual.reentryReason, 'MANUAL_AUTHORITY');
  assert.equal(manual.reentry, 'CONTINUE');
  assert.equal(manual.blocked, false);
  assert.equal(manual.segmentCloseReason, 'MODE_CHANGE');
  fixture.dispose();
});

test('071 rejects malformed handovers atomically instead of reporting a fake clean result', () => {
  const fixture = blockedProbeFixture();
  // A handover must span exactly one authoritative step; a wider span is a caller error.
  assert.throws(
    () =>
      evaluateTakeoverContinuity({
        sessionId: SESSION,
        worldEpoch: 0,
        actor: SUBJECT,
        decisionTick: 60,
        authority: 'AUTO',
        closedMode: null,
        collisionObserved: false,
        graph: fixture.graph,
        before: physical(58),
        after: physical(60),
        lastManualCommand: null,
        firstAutonomyCommand: null,
        observation: observation(60, { x: 10, y: 0, z: 0 }),
      }),
    /exactly one authoritative step/,
  );
  assert.throws(() => handover(fixture.graph, { before: { damage: 1.5 } }), /finite number/);
  assert.throws(() => handover(fixture.graph, { after: { yawRateRadps: 40 } }), /finite number/);
  assert.throws(
    () => handover(fixture.graph, { observation: { tick: 40 } }),
    /stale or from the future/,
  );
  assert.throws(
    () =>
      evaluateTakeoverContinuity({
        sessionId: SESSION,
        worldEpoch: 0,
        actor: SUBJECT,
        decisionTick: 60,
        authority: 'AUTO',
        closedMode: null,
        collisionObserved: false,
        graph: fixture.graph,
        before: { ...physical(59), speed: 8 } as never,
        after: physical(60),
        lastManualCommand: null,
        firstAutonomyCommand: null,
        observation: null,
      }),
    /Missing or unknown contract fields/,
  );
  assert.throws(() => handover(fixture.graph, { closedMode: 'AUTO' as never }), /Unsupported enum/);
  // Rejection is atomic: no fact, no latch and no retained state survive a malformed call.
  assert.deepEqual(getTakeoverContinuityStats(), {
    evaluating: false,
    retainedActors: 0,
    retainedHandovers: 0,
    retainedHistory: 0,
  });
  fixture.dispose();
});

test('071 stays consistent with 066 authority, 070 suspension and the real 069 close vocabulary', () => {
  const identities = new Map<string, BodyIdentity>(),
    cleared: BodyIdentity[] = [];
  let generation = 0,
    steps = 0,
    heldResets = 0;
  const add = (id: string) => {
      const identity = Object.freeze({ entityId: id, handle: ++generation, generation });
      identities.set(id, identity);
      return identity;
    },
    controller = createVehicleController(CONTROLLER_CONTEXT, {
      bodyIdentity: (id) => identities.get(id),
      step() {
        steps++;
        return {
          controllerMs: 0,
          stepMs: 0,
          queryMs: 0,
          bridgeMs: 0,
          totalMs: 0,
          queryCount: 0,
          bridgeCalls: 0,
        };
      },
    }),
    authority = createControlAuthority(CONTROLLER_CONTEXT, controller, {
      bodyIdentity: (id) => identities.get(id),
      clearOldPlayer: (identity) => {
        cleared.push(identity);
      },
    }),
    taxi = add('taxi-071'),
    time = (tick: number) => ({
      ...CONTROLLER_CONTEXT,
      version: '066-control-authority-v1' as const,
      tick,
      dtSeconds: 1 / 60,
    });
  authority.register(taxi);
  // MANUAL window at tick 1, owned by 066 only.
  authority.step(time(1), [], [{ identity: taxi, mode: 'MANUAL' }]);
  assert.equal(authority.getStats().seat?.mode, 'MANUAL');
  // 070 owns suspension: opening a panel in MANUAL suspends the authoritative clock through 066.
  const focus = createPauseFocusOwner({
    suspend: () => authority.suspend(),
    resume: () => authority.resume(),
    resetHeldCommands: () => {
      heldResets++;
    },
  });
  focus.setMode('MANUAL');
  const stepsBefore = steps;
  focus.setSurface('panel', true);
  assert.equal(focus.getState().suspended, true);
  assert.throws(() => authority.step(time(2), [], []), /suspended/);
  assert.equal(steps, stepsBefore, 'a suspended world executes zero physical steps');
  assert.equal(controller.getStats().tick, 1);
  assert.equal(
    focus.requestResume(),
    false,
    'an explicit resume is refused while a surface demands it',
  );
  focus.setSurface('panel', false);
  assert.equal(focus.getState().suspended, false);
  assert.equal(heldResets, 1, 'the held commands are reset exactly once on the real resume edge');
  // The tick sequence stays contiguous: the suspended wall time never became a tick.
  authority.step(time(2), [], [{ identity: taxi, mode: 'AUTO' }]);
  assert.equal(authority.getStats().seat, null);
  assert.deepEqual(cleared, [taxi], 'the departed seat is cleared exactly once');
  assert.equal(controller.getStats().tick, 2);
  assert.equal(authority.getStats().tick, 2);
  // 071 continuity over exactly those real accepted ticks, on the real 033 chain.
  const fixture = blockedProbeFixture(),
    decision = handover(fixture.graph, {
      tick: 2,
      closedMode: 'MANUAL',
      before: { velocityMps: { x: 6, y: 0, z: 0 } },
      after: (before) => advance(before, 2),
    });
  assert.equal(decision.decisionTick, 2);
  assert.equal(decision.segmentCloseReason, 'RETURN_TO_AUTO');
  assert.equal(decision.statePreserved, true);
  assert.equal(decision.reentry, 'CONTINUE');
  assert.equal(decision.teleportsVehicle, false);
  // The 069 lifecycle accepts exactly this close reason and closes the OPEN MANUAL segment once.
  assert(TAKEOVER_SEGMENT_CLOSE_REASONS.every((reason) => segmentCloseReasons.includes(reason)));
  assert(segmentCloseReasons.includes(decision.segmentCloseReason!));
  const segments = segmentFixture();
  segments.apply('MANUAL');
  assert.equal(segments.owner.observe().active?.mode, 'MANUAL');
  const closed = segments.apply('AUTO', decision.segmentCloseReason!);
  assert.equal(closed.active, null, 'no double ownership after the handover');
  assert.equal(closed.lastClosed?.mode, 'MANUAL');
  assert.equal(closed.lastClosed?.closeReason, 'RETURN_TO_AUTO');
  assert.equal(closed.lastClosed?.completeness, 'CLOSED');
  fixture.dispose();
});
