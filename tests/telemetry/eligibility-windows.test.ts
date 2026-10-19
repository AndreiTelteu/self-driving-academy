import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createEligibilityWindows,
  createOpportunityRegistry,
  eligibilityLabelClasses,
  eligibilityLabels,
  eligibilityPrecedence,
  ELIGIBILITY_CAPACITY,
  ELIGIBILITY_RECORDER_RAM_BYTES,
  ELIGIBILITY_RECORD_BYTES_CEILING,
  greenExitBlockedByQueue,
  isStimulusInCameraCone,
  opportunitySignalContext,
  type EligibleWindowRecord,
  type EligibilityWindowObservation,
} from '../../src/telemetry/index.ts';
import { createStopRules, createSignalController } from '../../src/world/index.ts';
import type { RoadMap, StopObservation } from '../../src/world/index.ts';
import { createEventBus } from '../../src/simulation/index.ts';
import type { SimulationEvent } from '../../src/simulation/index.ts';
import {
  compileFollowingProfile,
  evaluateFollowingTarget,
  FOLLOWING_LIMITS,
} from '../../src/autonomy/index.ts';
import { createFollowingTargetFixture } from '../autonomy/following-target-fixture.ts';
import { followingProfile, followingValues } from '../autonomy/following-reference.ts';
import { minimalMap } from '../world/fixture.ts';
import type { Mutable } from '../world/negative-fixtures.ts';

const SESSION = 'academy-1';
const EPOCH = 2;
const VEHICLE = 'taxi';
const INCARNATION = 'taxi-1';
const SEGMENT = 'seg-1';
const WORLD = { sessionId: SESSION, worldEpoch: EPOCH };
const BUS_WORLD = Object.freeze({ schemaVersion: 1 as const, units: 'SI' as const, ...WORLD });

/** A clean free-traffic window; every test overrides only the fact it is about. */
function observation(
  overrides: Partial<EligibilityWindowObservation> = {},
): EligibilityWindowObservation {
  return {
    tick: 1,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    opportunityId: 'opp-1',
    kind: 'RED',
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    segmentId: SEGMENT,
    controlMode: 'LEARNING',
    learningEligible: true,
    classId: 'sedan',
    suspension: 'NONE',
    visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
    leader: null,
    signal: null,
    greenExit: null,
    mechanical: null,
    impact: null,
    ...overrides,
  };
}

const cameraPose = {
  positionM: { x: 0, y: 1, z: 0 },
  lookAtM: { x: 0, y: 1, z: 100 },
  up: { x: 0, y: 1, z: 0 },
  fovRadians: (60 * Math.PI) / 180,
};

test('087 a clean free-traffic window is eligible, counts in the learning denominator and can be evidence', () => {
  const layer = createEligibilityWindows();
  const record = layer.observe(observation());
  assert.equal(record.windowClass, 'ELIGIBLE');
  assert.equal(record.label, 'FREE_TRAFFIC');
  assert.equal(record.reason, 'NO_CONSTRAINT');
  assert.equal(record.observable, true);
  assert.deepEqual(record.reaction, { open: true, openedTick: 1 });
  const denominators = layer.getDenominators();
  assert.equal(denominators.total, 1);
  assert.equal(denominators.eligible, 1);
  assert.equal(denominators.externalConstraint, 0);
  assert.equal(denominators.excluded, 0);
  assert.equal(denominators.total, denominators.eligible + denominators.externalConstraint);
  assert.equal(denominators.byLabel.find((entry) => entry.label === 'FREE_TRAFFIC')?.count, 1);
  assert.equal(denominators.externalConstraints.length, 4);
  assert.equal(denominators.reactionWindowsOpened, 1);
  const evidence = layer.emitPreferenceEvidence(record);
  assert.equal(evidence.opportunityId, record.opportunityId);
  assert.equal(evidence.windowId, record.windowId);
  assert.equal(layer.getDenominators().preferenceEvidenceEmitted, 1);
});

test('087 a stimulus hidden by the controlled fixture or outside the camera cone never opens a reaction window', () => {
  const layer = createEligibilityWindows();
  const hidden = layer.observe(
    observation({
      opportunityId: 'opp-hidden',
      visibility: { source: 'CONTROLLED_FIXTURE', observable: false },
    }),
  );
  assert.equal(hidden.windowClass, 'EXCLUDED');
  assert.equal(hidden.label, 'NOT_OBSERVABLE');
  assert.equal(hidden.reason, 'STIMULUS_NOT_OBSERVABLE');
  assert.equal(hidden.source, 'CAMERA_017');
  assert.deepEqual(hidden.reaction, { open: false, reason: 'NOT_OBSERVABLE' });
  // A hidden stimulus contributes no reaction-time denominator entry and no reaction time.
  const refused = layer.respond({ tick: 40, opportunityId: 'opp-hidden' });
  assert.equal(refused.accepted, false);
  assert.equal(refused.reason, 'NOT_OBSERVABLE');
  assert.equal(refused.durationTicks, null);
  assert.equal(refused.durationSeconds, null);
  const denominators = layer.getDenominators();
  assert.equal(denominators.notObservable, 1);
  assert.equal(denominators.reactionWindowsOpened, 0);
  assert.equal(denominators.reactionSamples, 0);
  assert.equal(denominators.eligible, 0);

  // The camera truth: behind the camera or occluded is not observable; in front is.
  assert.equal(isStimulusInCameraCone(cameraPose, { x: 0, y: 1, z: 50 }), true);
  assert.equal(isStimulusInCameraCone(cameraPose, { x: 0, y: 1, z: -50 }), false);
  assert.equal(isStimulusInCameraCone(cameraPose, { x: 1000, y: 1, z: 1 }), false);
  const occluded = layer.observe(
    observation({
      opportunityId: 'opp-occluded',
      visibility: {
        source: 'CAMERA',
        pose: cameraPose,
        stimulusPositionM: { x: 0, y: 1, z: 50 },
        occluded: true,
      },
    }),
  );
  assert.equal(occluded.label, 'NOT_OBSERVABLE');
  const visible = layer.observe(
    observation({
      tick: 2,
      opportunityId: 'opp-visible',
      visibility: {
        source: 'CAMERA',
        pose: cameraPose,
        stimulusPositionM: { x: 0, y: 1, z: 50 },
        occluded: false,
      },
    }),
  );
  assert.equal(visible.label, 'FREE_TRAFFIC');
  assert.deepEqual(visible.reaction, { open: true, openedTick: 2 });
});

test('087 a leader or queue standstill is an external constraint and can never become preference evidence', () => {
  const layer = createEligibilityWindows();
  const queued = layer.observe(
    observation({
      opportunityId: 'opp-queue',
      leader: { id: 'leader', gapM: 4, speedMps: FOLLOWING_LIMITS.standstillMps },
    }),
  );
  assert.equal(queued.windowClass, 'EXTERNAL_CONSTRAINT');
  assert.equal(queued.label, 'LEADER');
  assert.equal(queued.reason, 'QUEUE_STANDSTILL');
  assert.equal(queued.source, 'FOLLOWING_048');
  assert.deepEqual(queued.reaction, { open: false, reason: 'EXTERNAL_CONSTRAINT' });
  const moving = layer.observe(
    observation({
      tick: 2,
      opportunityId: 'opp-headway',
      leader: { id: 'lead', gapM: 18, speedMps: 6 },
    }),
  );
  assert.equal(moving.label, 'LEADER');
  assert.equal(moving.reason, 'LEADER_HEADWAY');
  const denominators = layer.getDenominators();
  assert.equal(denominators.eligible, 0);
  assert.equal(denominators.externalConstraint, 2);
  assert.equal(
    denominators.externalConstraints.find((entry) => entry.label === 'LEADER')?.count,
    2,
  );
  // The type system rejects it at compile time; the runtime gate rejects a forced value.
  assert.throws(
    () => layer.emitPreferenceEvidence(queued as unknown as EligibleWindowRecord),
    /free-traffic/,
  );
  assert.equal(layer.getDenominators().preferenceEvidenceRefused, 1);
  assert.equal(layer.getDenominators().preferenceEvidenceEmitted, 0);
});

test('087 a green whose exit is blocked by the real 038/044 context is an external constraint', () => {
  const signal = {
    signalId: 'signal',
    intersectionId: 'junction',
    movementId: 'move',
    state: 'GREEN' as const,
  };
  const blocked = greenExitBlockedByQueue({
    signal,
    leader: { id: 'queued', gapM: 5, speedMps: 0 },
    queueStandstillGapM: 6,
  });
  assert.deepEqual(blocked, { blocked: true, source: 'FOLLOWING_QUEUE' });
  // Not blocked while the leader is moving, and not blocked on a RED phase.
  assert.equal(
    greenExitBlockedByQueue({
      signal,
      leader: { id: 'moving', gapM: 5, speedMps: 5 },
      queueStandstillGapM: 6,
    }).blocked,
    false,
  );
  assert.equal(
    greenExitBlockedByQueue({
      signal: { ...signal, state: 'RED' },
      leader: { id: 'queued', gapM: 5, speedMps: 0 },
      queueStandstillGapM: 6,
    }).blocked,
    false,
  );
  const layer = createEligibilityWindows();
  const record = layer.observe(
    observation({
      opportunityId: 'opp-green',
      kind: 'GREEN',
      signal,
      leader: { id: 'queued', gapM: 5, speedMps: 0 },
      greenExit: blocked,
    }),
  );
  assert.equal(record.windowClass, 'EXTERNAL_CONSTRAINT');
  assert.equal(record.label, 'BLOCKED_GREEN');
  assert.equal(record.reason, 'GREEN_EXIT_BLOCKED');
  assert.equal(record.source, 'ROAD_CONTEXT_044');
  assert.throws(
    () => layer.emitPreferenceEvidence(record as unknown as EligibleWindowRecord),
    /free-traffic/,
  );
  // An occupancy declared by the 038 priority owner keeps the constraint and its provenance.
  const priority = layer.observe(
    observation({
      tick: 2,
      opportunityId: 'opp-green-priority',
      kind: 'GREEN',
      signal,
      greenExit: { blocked: true, source: 'PRIORITY_OCCUPANCY' },
    }),
  );
  assert.equal(priority.label, 'BLOCKED_GREEN');
  assert.equal(priority.source, 'PRIORITY_038');
  // A GREEN whose exit is clear stays eligible.
  const clear = layer.observe(
    observation({
      tick: 3,
      opportunityId: 'opp-green-clear',
      kind: 'GREEN',
      signal,
      greenExit: { blocked: false, source: 'FOLLOWING_QUEUE' },
    }),
  );
  assert.equal(clear.label, 'FREE_TRAFFIC');
});

test('087 a collision, damage or recovery window is an external constraint and never preference evidence', () => {
  const layer = createEligibilityWindows();
  const collision = layer.observe(
    observation({
      opportunityId: 'opp-impact',
      impact: { collision: true, impairment: null, recovery: false },
    }),
  );
  assert.equal(collision.windowClass, 'EXTERNAL_CONSTRAINT');
  assert.equal(collision.label, 'IMPACT');
  assert.equal(collision.reason, 'COLLISION_IN_WINDOW');
  assert.equal(collision.source, 'COLLISION_028');
  const damage = layer.observe(
    observation({
      tick: 2,
      opportunityId: 'opp-damage',
      impact: { collision: false, impairment: 'IMMOBILIZED', recovery: false },
    }),
  );
  assert.equal(damage.label, 'IMPACT');
  assert.equal(damage.reason, 'DAMAGE_LIMITED');
  assert.equal(damage.source, 'DAMAGE_029');
  const recovery = layer.observe(
    observation({
      tick: 3,
      opportunityId: 'opp-recovery',
      impact: { collision: false, impairment: null, recovery: true },
    }),
  );
  assert.equal(recovery.label, 'IMPACT');
  assert.equal(recovery.reason, 'RECOVERY_IN_WINDOW');
  assert.equal(recovery.source, 'RECOVERY_030');
  const denominators = layer.getDenominators();
  assert.equal(denominators.externalConstraint, 3);
  assert.equal(denominators.eligible, 0);
  assert.equal(
    denominators.externalConstraints.find((entry) => entry.label === 'IMPACT')?.count,
    3,
  );
  assert.throws(
    () => layer.emitPreferenceEvidence(collision as unknown as EligibleWindowRecord),
    /free-traffic/,
  );
});

test('087 a demand beyond the real 023 class capability is a mechanical external constraint', () => {
  const layer = createEligibilityWindows();
  // sedan: engineForceN/massKg = 6500/1400 ≈ 4.64 m/s², brakeAcceleration 8 m/s², grip×9.81 ≈ 12.75.
  const hardBrake = layer.observe(
    observation({
      opportunityId: 'opp-brake',
      mechanical: { demandedLongitudinalAccelerationMps2: -20, demandedLateralAccelerationMps2: 0 },
    }),
  );
  assert.equal(hardBrake.windowClass, 'EXTERNAL_CONSTRAINT');
  assert.equal(hardBrake.label, 'MECHANICAL_LIMIT');
  assert.equal(hardBrake.reason, 'CAPABILITY_EXCEEDED_DECELERATION');
  assert.equal(hardBrake.source, 'MECHANICS_023');
  const hardAcceleration = layer.observe(
    observation({
      tick: 2,
      opportunityId: 'opp-accel',
      mechanical: { demandedLongitudinalAccelerationMps2: 30, demandedLateralAccelerationMps2: 0 },
    }),
  );
  assert.equal(hardAcceleration.reason, 'CAPABILITY_EXCEEDED_ACCELERATION');
  const hardLateral = layer.observe(
    observation({
      tick: 3,
      opportunityId: 'opp-lateral',
      mechanical: { demandedLongitudinalAccelerationMps2: 1, demandedLateralAccelerationMps2: 20 },
    }),
  );
  assert.equal(hardLateral.reason, 'CAPABILITY_EXCEEDED_LATERAL');
  // A demand inside the class capability is not a constraint.
  const within = layer.observe(
    observation({
      tick: 4,
      opportunityId: 'opp-within',
      mechanical: { demandedLongitudinalAccelerationMps2: -4, demandedLateralAccelerationMps2: 3 },
    }),
  );
  assert.equal(within.label, 'FREE_TRAFFIC');
  assert.throws(
    () => layer.emitPreferenceEvidence(hardBrake as unknown as EligibleWindowRecord),
    /free-traffic/,
  );
});

test('087 a suspension and a non-learning segment are excluded with their own reasons and never a reaction failure', () => {
  const layer = createEligibilityWindows();
  const paused = layer.observe(observation({ opportunityId: 'opp-pause', suspension: 'PAUSE' }));
  assert.equal(paused.windowClass, 'EXCLUDED');
  assert.equal(paused.label, 'PAUSE');
  assert.equal(paused.reason, 'SUSPENSION_PAUSE');
  assert.equal(paused.source, 'SUSPENSION_070');
  assert.deepEqual(paused.reaction, { open: false, reason: 'SEGMENT_EXCLUDED' });
  const focus = layer.observe(
    observation({ tick: 2, opportunityId: 'opp-focus', suspension: 'FOCUS_LOST' }),
  );
  assert.equal(focus.label, 'FOCUS_LOST');
  assert.equal(focus.reason, 'SUSPENSION_FOCUS_LOST');
  const manual = layer.observe(
    observation({
      tick: 3,
      opportunityId: 'opp-manual',
      controlMode: 'MANUAL',
      learningEligible: false,
    }),
  );
  assert.equal(manual.label, 'MANUAL_SEGMENT');
  assert.equal(manual.reason, 'NON_LEARNING_SEGMENT');
  assert.equal(manual.source, 'SEGMENT_069');
  const auto = layer.observe(
    observation({
      tick: 4,
      opportunityId: 'opp-auto',
      controlMode: 'AUTO',
      learningEligible: false,
    }),
  );
  assert.equal(auto.label, 'AUTO_SEGMENT');
  // A suspension is a suspension, not a slow reaction: no response, no reaction time, no denominator entry.
  const suspendedResponse = layer.respond({ tick: 60, opportunityId: 'opp-pause' });
  assert.equal(suspendedResponse.accepted, false);
  assert.equal(suspendedResponse.reason, 'SEGMENT_EXCLUDED');
  assert.equal(suspendedResponse.durationTicks, null);
  const denominators = layer.getDenominators();
  assert.equal(denominators.reactionSamples, 0);
  assert.equal(denominators.responsesRefused, 1);
  assert.equal(denominators.excluded, 4);
  assert.equal(denominators.eligible, 0);
  // Only a LEARNING segment may be learning-eligible.
  assert.throws(
    () =>
      layer.observe(
        observation({
          tick: 5,
          opportunityId: 'bad',
          controlMode: 'MANUAL',
          learningEligible: true,
        }),
      ),
    /LEARNING/,
  );
});

test('087 a reaction window opens only for an eligible observable window and a later constraint tightens it', () => {
  const layer = createEligibilityWindows();
  const window = layer.observe(observation({ opportunityId: 'opp-react' }));
  assert.deepEqual(window.reaction, { open: true, openedTick: 1 });
  const response = layer.respond({ tick: 31, opportunityId: 'opp-react' });
  assert.equal(response.accepted, true);
  assert.equal(response.reason, 'RESPONSE');
  assert.equal(response.durationTicks, 30);
  assert.equal(response.durationSeconds, 0.5);
  assert.equal(layer.respond({ tick: 40, opportunityId: 'opp-react' }).reason, 'ALREADY_RESPONDED');
  // The same occurrence later shows a queue: the classification tightens and cannot loosen back.
  const tightened = layer.observe(
    observation({
      tick: 32,
      opportunityId: 'opp-react',
      leader: { id: 'leader', gapM: 1, speedMps: 0 },
    }),
  );
  assert.equal(tightened.label, 'LEADER');
  assert.equal(tightened.observationCount, 2);
  const loosened = layer.observe(observation({ tick: 33, opportunityId: 'opp-react' }));
  assert.equal(loosened.label, 'LEADER', 'a constrained window never drifts back to eligible');
  assert.equal(layer.getStats().reclassifiedTotal, 1);
  assert.equal(layer.getDenominators().eligible, 0);
  assert.throws(
    () => layer.emitPreferenceEvidence(tightened as unknown as EligibleWindowRecord),
    /free-traffic/,
  );
});

test('087 the closed label vocabulary maps every label to exactly one class and the precedence is total', () => {
  const classes = new Set(['ELIGIBLE', 'EXTERNAL_CONSTRAINT', 'EXCLUDED']);
  for (const label of eligibilityLabels) {
    assert.ok(classes.has(eligibilityLabelClasses[label]), `${label} has a class`);
  }
  assert.equal(new Set(eligibilityPrecedence).size, eligibilityLabels.length);
  assert.deepEqual(
    [...eligibilityPrecedence].sort(),
    [...eligibilityLabels].sort(),
    'the precedence orders every label exactly once',
  );
  assert.equal(eligibilityLabelClasses.FREE_TRAFFIC, 'ELIGIBLE');
  for (const label of ['LEADER', 'BLOCKED_GREEN', 'MECHANICAL_LIMIT', 'IMPACT'] as const)
    assert.equal(eligibilityLabelClasses[label], 'EXTERNAL_CONSTRAINT');
  for (const label of [
    'PAUSE',
    'FOCUS_LOST',
    'MANUAL_SEGMENT',
    'AUTO_SEGMENT',
    'NOT_OBSERVABLE',
  ] as const)
    assert.equal(eligibilityLabelClasses[label], 'EXCLUDED');
});

test('087 the bounded store retires oldest-first, keeps cumulative denominators and rejects malformed input', () => {
  const layer = createEligibilityWindows({ maxWindows: ELIGIBILITY_CAPACITY.minimum });
  const cap = ELIGIBILITY_CAPACITY.minimum;
  for (let index = 0; index < cap + 5; index += 1)
    layer.observe(observation({ tick: index + 1, opportunityId: `opp-${index}` }));
  const stats = layer.getStats();
  assert.equal(stats.retained, cap);
  assert.equal(stats.windowsOpened, cap + 5);
  assert.equal(stats.retiredTotal, 5);
  assert.equal(stats.rejectedTotal, 0);
  assert.ok(stats.estimatedBytes <= stats.estimatedBytesMaximum);
  assert.equal(stats.estimatedBytesMaximum, cap * ELIGIBILITY_RECORD_BYTES_CEILING);
  assert.equal(
    ELIGIBILITY_CAPACITY.default * ELIGIBILITY_RECORD_BYTES_CEILING <=
      ELIGIBILITY_RECORDER_RAM_BYTES,
    true,
  );
  assert.equal(
    ELIGIBILITY_CAPACITY.maximum * ELIGIBILITY_RECORD_BYTES_CEILING <=
      ELIGIBILITY_RECORDER_RAM_BYTES,
    true,
  );
  // Cumulative label evidence survives retirement, exactly like the 086 denominators.
  assert.equal(layer.getDenominators().total, cap + 5);
  assert.equal(layer.getDenominators().eligible, cap + 5);
  layer.dispose();
  const disposed = layer.getStats();
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.retained, 0);
  assert.equal(disposed.identityCodeUnits, 0);
  assert.equal(disposed.estimatedBytes, 0);
  assert.equal(layer.getDenominators().total, cap + 5);
  assert.throws(() => layer.observe(observation({ opportunityId: 'late' })), /disposed/);

  assert.throws(() => createEligibilityWindows({ maxWindows: 1 }), /capacity out of range/);
  assert.throws(
    () => createEligibilityWindows({ maxWindows: ELIGIBILITY_CAPACITY.maximum + 1 }),
    /capacity out of range/,
  );
  assert.throws(
    () => createEligibilityWindows({ unknown: 1 } as never),
    /Unknown eligibility option/,
  );
  const other = createEligibilityWindows();
  assert.throws(
    () => other.observe({ ...observation(), extra: true } as never),
    /Missing or unknown contract fields/,
  );
  other.observe(observation({ tick: 2, opportunityId: 'a' }));
  assert.throws(() => other.observe(observation({ tick: 1, opportunityId: 'b' })), /regressed/);
  assert.throws(
    () => other.observe(observation({ tick: 2, opportunityId: 'c', worldEpoch: EPOCH + 1 })),
    /another session or world epoch/,
  );
  assert.throws(
    () => other.observe(observation({ tick: 2, opportunityId: 'd', classId: 'truck' as never })),
    /Unsupported enum value/,
  );
  assert.deepEqual(other.respond({ tick: 3, opportunityId: 'missing' }), {
    accepted: false,
    reason: 'NO_WINDOW',
    durationTicks: null,
    durationSeconds: null,
  });
  assert.equal(other.observe(observation({ tick: 2, opportunityId: 'a' })).observationCount, 2);
});

test('087 integration: real 036/037/086 opportunities at the 219 cadence feed real 036/044/048 context', () => {
  // A real 048 evaluation on the real 044 fixture: a standstill leader is a QUEUE_GAP.
  const profile = compileFollowingProfile(followingProfile(followingValues));
  const following = createFollowingTargetFixture(
    profile.longitudinal.cruise,
    { id: 'car', incarnation: 1 },
    { sessionId: '087-chain', worldEpoch: 0 },
  );
  // Bumper-to-bumper queue: the real 044 gap is zero and the real 048 profile standstill gap applies.
  const followingInput = following.input(1, 0, 0, 0);
  const queueTarget = evaluateFollowingTarget({
    cruiseInput: followingInput.cruiseInput,
    roadContext: followingInput.roadContext,
    observation: followingInput.observation,
    profile,
  });
  assert.equal(queueTarget.reason, 'QUEUE_GAP');
  assert.equal(queueTarget.leader?.id, 'leader');
  const queueLeader = {
    id: queueTarget.leader!.id,
    gapM: queueTarget.gapM!,
    speedMps: 0,
  };
  following.dispose();

  const map = structuredClone(minimalMap()) as Mutable<RoadMap>;
  map.stopLines = map.stopLines.map((line) =>
    line.id === 'signal-stop' ? { ...line, kind: 'STOP' as const, signalId: null } : line,
  );
  map.signals = [
    {
      id: 'signal',
      intersectionId: 'junction',
      phases: [
        { id: 'green', durationS: 2, movementStates: [{ movementId: 'move', state: 'GREEN' }] },
        { id: 'red', durationS: 1, movementStates: [{ movementId: 'move', state: 'RED' }] },
      ],
    },
  ];
  const bus = createEventBus(BUS_WORLD);
  const signals = createSignalController(map, { context: BUS_WORLD, eventBus: bus });
  const rules = createStopRules(map, WORLD);
  const registry = createOpportunityRegistry();
  const eligibility = createEligibilityWindows();
  const queue: SimulationEvent[] = [];
  const kindCounts = new Map<string, number>();
  for (let tick = 1; tick <= 600; tick += 1) {
    signals.step(tick);
    const stopObservation: StopObservation = {
      ...WORLD,
      tick,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      laneId: 'lane-a',
      access: 'TAXI',
      frontPositionM: { x: tick <= 65 ? 7.5 : 8.6, y: 0, z: 0 },
      headingRad: 0,
      speedMps: tick <= 65 ? 0 : 5,
      discontinuity: false,
    };
    for (const event of rules.observe(stopObservation)) queue.push(event);
    // The real 219 decision cadence: 60 Hz ticks, a decision every six ticks (10 Hz).
    if (tick % 6 !== 0) continue;
    const movement = signals.getMovementSignal('junction', 'move');
    const snapshot = signals.getSignal('signal');
    const records = registry.observe({
      tick,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      learningEligible: true,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      signal:
        movement && snapshot ? opportunitySignalContext(movement, snapshot.phaseStartedTick) : null,
      events: queue.splice(0, queue.length),
      stimuli: [],
      conclusions: [],
    });
    for (const record of records) {
      const recordSignal = movement
        ? {
            signalId: movement.signalId,
            intersectionId: movement.intersectionId,
            movementId: movement.movementId,
            state: movement.state,
          }
        : null;
      // A GREEN whose exit is blocked by the real 044/048 queue is an external constraint.
      const greenExit =
        record.kind === 'GREEN'
          ? greenExitBlockedByQueue({
              signal: recordSignal,
              leader: queueLeader,
              queueStandstillGapM: profile.values.queue_standstill_gap,
            })
          : null;
      eligibility.observe({
        tick,
        sessionId: SESSION,
        worldEpoch: EPOCH,
        opportunityId: record.id,
        kind: record.kind,
        vehicleId: VEHICLE,
        incarnation: INCARNATION,
        segmentId: SEGMENT,
        controlMode: 'LEARNING',
        learningEligible: true,
        classId: 'sedan',
        suspension: 'NONE',
        visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
        leader: record.kind === 'GREEN' ? queueLeader : null,
        signal: recordSignal,
        greenExit,
        mechanical: null,
        impact: null,
      });
    }
  }
  for (const record of registry.getOpportunities())
    kindCounts.set(record.kind, (kindCounts.get(record.kind) ?? 0) + 1);
  const registryDenominators = registry.getDenominators();
  const denominators = eligibility.getDenominators();
  assert.ok(
    registryDenominators.total >= 7,
    `the real chain produced opportunities (${registryDenominators.total})`,
  );
  assert.equal(kindCounts.get('STOP'), 1, 'the real 037 STOP approach opened one opportunity');
  assert.ok((kindCounts.get('RED') ?? 0) >= 1, 'at least one real 036 RED phase');
  assert.ok((kindCounts.get('GREEN') ?? 0) >= 1, 'at least one real 036 GREEN phase');
  assert.equal(
    denominators.total,
    registryDenominators.total,
    'one eligibility window per real 086 opportunity',
  );
  assert.equal(
    denominators.total,
    denominators.eligible + denominators.externalConstraint + denominators.excluded,
  );
  const greenWindows = eligibility.getWindows().filter((record) => record.kind === 'GREEN');
  assert.equal(greenWindows.length, kindCounts.get('GREEN'));
  for (const record of greenWindows) {
    assert.equal(record.windowClass, 'EXTERNAL_CONSTRAINT');
    assert.equal(record.label, 'BLOCKED_GREEN');
    assert.equal(record.source, 'ROAD_CONTEXT_044');
    assert.throws(
      () => eligibility.emitPreferenceEvidence(record as unknown as EligibleWindowRecord),
      /free-traffic/,
    );
  }
  assert.equal(
    denominators.externalConstraints.find((entry) => entry.label === 'BLOCKED_GREEN')?.count,
    kindCounts.get('GREEN'),
  );
  // The STOP and RED opportunities had no constraint and stayed in the learning denominator.
  const stopWindow = eligibility.getWindows().find((record) => record.kind === 'STOP');
  assert.equal(stopWindow?.label, 'FREE_TRAFFIC');
  assert.equal(denominators.eligible, (kindCounts.get('STOP') ?? 0) + (kindCounts.get('RED') ?? 0));
  assert.equal(denominators.preferenceEvidenceEmitted, 0);
  rules.dispose();
  signals.dispose();
  bus.dispose();
  registry.dispose();
  eligibility.dispose();
});
