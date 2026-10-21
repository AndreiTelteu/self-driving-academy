import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { admitLearningWindowForRegression, runLearningEdgeCaseRegressions } from '../../src/app';
import {
  LEARNING_EDGECASE_ADAPTER_VERSION,
  LEARNING_EDGECASES_VERSION,
  learningEdgeCaseIds,
} from '../../src/experiments';
import type { LearningEdgeCaseId, LearningEdgeCaseResult } from '../../src/experiments';
import { parameterDefinitions, parameterRegistry } from '../../src/profiles';
import {
  artifactCauses,
  artifactKinds,
  createArtifactFilter,
  createEligibilityWindows,
} from '../../src/telemetry';

const report = runLearningEdgeCaseRegressions();

function caseOf(id: LearningEdgeCaseId): LearningEdgeCaseResult {
  const found = report.cases.find((entry) => entry.caseId === id);
  assert.ok(found, `missing 107 case ${id}`);
  return found;
}

function ledgerOf(id: LearningEdgeCaseId, key: string) {
  const entry = caseOf(id).ledgerKeys.find((row) => row.key === key);
  assert.ok(entry, `missing ${key} in ${id}`);
  return entry;
}

function admissionOf(id: LearningEdgeCaseId, index: number) {
  const entry = caseOf(id).admissions[index];
  assert.ok(entry, `missing admission ${index} in ${id}`);
  return entry;
}

test('107 declares the closed case set and a frozen report', () => {
  assert.equal(LEARNING_EDGECASES_VERSION, '107-learning-edgecases-v1');
  assert.equal(LEARNING_EDGECASE_ADAPTER_VERSION, '107-learning-edgecase-adapter-v1');
  assert.equal(report.version, LEARNING_EDGECASES_VERSION);
  assert.equal(report.adapterVersion, LEARNING_EDGECASE_ADAPTER_VERSION);
  assert.deepEqual(
    report.cases.map((entry) => entry.caseId),
    [...learningEdgeCaseIds],
  );
  assert.equal(report.cases.length, 13);
  assert.equal(report.summary.cases, 13);
  for (const entry of report.cases) {
    assert.equal(entry.ledgerKeys.length, 24);
    assert.equal(entry.profileChanges, 0);
    assert.equal(entry.candidatesProduced, 0);
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.checks), true);
    assert.equal(Object.isFrozen(entry.ledgerKeys), true);
  }
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.cases), true);
  assert.equal(Object.isFrozen(report.coverage), true);
  assert.equal(Object.isFrozen(report.summary), true);
});

test('107 covers every 088 artifact kind and cause', () => {
  for (const kind of artifactKinds) assert.ok(report.coverage.kinds.includes(kind), kind);
  for (const cause of artifactCauses) assert.ok(report.coverage.causes.includes(cause), cause);
  assert.deepEqual([...report.coverage.windowClasses].sort(), [
    'FULLY_SUPPRESSED',
    'PREFIX_ELIGIBLE',
  ]);
  assert.ok(report.coverage.completeness.includes('COMPLETE'));
  assert.ok(report.coverage.completeness.includes('PARTIAL'));
  assert.ok(report.coverage.completeness.includes('TRUNCATED'));
});

test('107 a pause is a PAUSE artifact with zero learned keys', () => {
  const pause = caseOf('PAUSE');
  const [artifact] = pause.artifacts;
  assert.equal(artifact?.kind, 'PAUSE');
  assert.equal(artifact?.cause, 'SUSPENSION_PAUSE');
  assert.equal(artifact?.source, 'SUSPENSION_070');
  assert.equal(artifact?.suspensionCause, 'panel');
  const [window] = pause.windows;
  assert.equal(window?.completeness, 'PARTIAL');
  assert.equal(window?.completenessReason, 'TRUNCATED_BY_ARTIFACT');
  assert.equal(window?.prefixTicks, 99);
  assert.equal(window?.suppressedTicks, 141);
  assert.equal(admissionOf('PAUSE', 0).admitted, false);
  assert.equal(admissionOf('PAUSE', 0).reason, 'ELIGIBILITY_EXCLUDED');
  assert.deepEqual(pause.learnedKeys, []);
  assert.equal(ledgerOf('PAUSE', 'speed_delta_urban').status, 'NO_EVIDENCE');
  assert.equal(
    pause.ledgerKeys.every((row) => row.status === 'NO_EVIDENCE'),
    true,
  );
  assert.equal(pause.status, 'PASS');
});

test('107 a focus loss is a distinct PAUSE cause and never a slow reaction', () => {
  const focus = caseOf('FOCUS_LOSS_PAUSE');
  const [artifact] = focus.artifacts;
  assert.equal(artifact?.kind, 'PAUSE');
  assert.equal(artifact?.cause, 'SUSPENSION_FOCUS_LOST');
  assert.equal(artifact?.source, 'SUSPENSION_070');
  assert.equal(artifact?.suspensionCause, 'focus');
  assert.equal(focus.windows[0]?.completenessReason, 'TRUNCATED_BY_ARTIFACT');
  assert.ok(focus.artifacts.every((entry) => entry.kind !== 'INCOMPLETE_SAMPLE'));
  assert.deepEqual(focus.learnedKeys, []);
  assert.equal(
    focus.ledgerKeys.every((row) => row.status === 'NO_EVIDENCE'),
    true,
  );
});

test('107 an admitted recovery keeps its 030 proof and the usable prefix, never the teleport', () => {
  const recovery = caseOf('RECOVERY_ADMITTED');
  const teleport = recovery.artifacts.find((entry) => entry.kind === 'TELEPORT');
  assert.ok(teleport);
  assert.equal(teleport.cause, 'RECOVERY_TELEPORT');
  assert.equal(teleport.source, 'RECOVERY_030');
  assert.equal(teleport.operationId, 'op-completed');
  assert.equal(teleport.recoveryPointId, 'point-completed');
  assert.equal(teleport.recoveryMapId, 'map-107');
  assert.equal(teleport.recoveryLaneId, 'lane-completed');
  assert.equal(teleport.recoveryMode, 'MANUAL');
  assert.equal(teleport.recoveryValidatedTick, 698);
  const collision = recovery.artifacts.find((entry) => entry.kind === 'COLLISION');
  assert.equal(collision?.cause, 'COLLISION_IMPULSE');
  assert.equal(collision?.impulseNs, 1800);
  const window = recovery.windows[0];
  assert.equal(window?.completeness, 'PARTIAL');
  assert.equal(window?.completenessReason, 'RECOVERY');
  assert.equal(window?.boundaryTick, 690);
  assert.equal(window?.prefixTicks, 689);
  assert.equal(recovery.admissions[0]?.admitted, true);
  assert.equal(recovery.admissions[1]?.admitted, false);
  assert.equal(recovery.admissions[1]?.reason, 'OBSERVATION_OUTSIDE_USABLE_PREFIX');
  assert.deepEqual(recovery.learnedKeys, ['speed_delta_urban']);
  assert.equal(ledgerOf('RECOVERY_ADMITTED', 'speed_delta_urban').distinctEpisodes, 1);
  assert.equal(recovery.status, 'PASS');
});

test('107 a denied or partial recovery is TELEPORT with its own cause and no learned behaviour', () => {
  for (const [id, cause] of [
    ['RECOVERY_DENIED', 'RECOVERY_DENIED'],
    ['RECOVERY_PARTIAL', 'RECOVERY_PARTIAL'],
  ] as const) {
    const recovery = caseOf(id);
    const teleport = recovery.artifacts.find((entry) => entry.kind === 'TELEPORT');
    assert.equal(teleport?.cause, cause);
    assert.equal(teleport?.source, 'RECOVERY_030');
    assert.equal(recovery.windows[0]?.completenessReason, 'RECOVERY');
    assert.equal(recovery.admissions[1]?.reason, 'OBSERVATION_OUTSIDE_USABLE_PREFIX');
    assert.deepEqual(recovery.learnedKeys, []);
    assert.equal(
      recovery.ledgerKeys.every((row) => row.status !== 'READY'),
      true,
    );
  }
});

test('107 incomplete, data-loss and lost-checkpoint segments are TRUNCATED with no evidence', () => {
  const incomplete = caseOf('INCOMPLETE_SEGMENT');
  assert.deepEqual(incomplete.artifacts.map((entry) => entry.cause).sort(), [
    'CHECKPOINT_LOST',
    'CLOSE_REASON_DATA_LOSS',
    'SEGMENT_INCOMPLETE',
  ]);
  assert.equal(incomplete.windows.length, 3);
  for (const window of incomplete.windows) {
    assert.equal(window.completeness, 'TRUNCATED');
    assert.notEqual(window.completenessReason, 'SEGMENT_CLOSED');
  }
  assert.equal(
    incomplete.admissions.every((entry) => !entry.admitted),
    true,
  );
  assert.equal(
    incomplete.admissions.every((entry) => entry.reason === 'OBSERVATION_OUTSIDE_USABLE_PREFIX'),
    true,
  );
  assert.deepEqual(incomplete.learnedKeys, []);
  assert.equal(
    incomplete.ledgerKeys.every((row) => row.status === 'NO_EVIDENCE'),
    true,
  );
});

test('107 an open segment is PARTIAL/OPEN_SEGMENT and fabricates no value', () => {
  const open = caseOf('OPEN_SEGMENT');
  assert.equal(open.artifacts.length, 0);
  assert.equal(open.windows[0]?.completeness, 'PARTIAL');
  assert.equal(open.windows[0]?.completenessReason, 'OPEN_SEGMENT');
  assert.equal(open.windows[0]?.prefixTicks, 300);
  assert.deepEqual(open.learnedKeys, []);
  assert.equal(ledgerOf('OPEN_SEGMENT', 'speed_delta_urban').status, 'NO_EVIDENCE');
  assert.equal(ledgerOf('OPEN_SEGMENT', 'intersection_approach_speed').status, 'INSUFFICIENT');
  assert.equal(open.profileChanges, 0);
});

test('107 an observation gap is PARTIAL/OBSERVATION_GAP and the lost span is refused', () => {
  const gap = caseOf('OBSERVATION_GAP');
  const [artifact] = gap.artifacts;
  assert.equal(artifact?.kind, 'INCOMPLETE_SAMPLE');
  assert.equal(artifact?.cause, 'OBSERVATION_GAP');
  assert.equal(artifact?.source, 'TICK_SAMPLES_085');
  assert.equal(artifact?.boundaryTick, 200);
  assert.equal(gap.windows[0]?.completeness, 'PARTIAL');
  assert.equal(gap.windows[0]?.completenessReason, 'OBSERVATION_GAP');
  assert.equal(gap.windows[0]?.prefixTicks, 199);
  assert.equal(gap.admissions[0]?.admitted, false);
  assert.deepEqual(gap.learnedKeys, []);
});

test('107 many streets count distinct opportunities separately and dedupe repeated frames', () => {
  const many = caseOf('MANY_STREETS');
  assert.equal(ledgerOf('MANY_STREETS', 'speed_delta_urban').distinctEpisodes, 3);
  assert.equal(ledgerOf('MANY_STREETS', 'intersection_approach_speed').distinctEpisodes, 3);
  assert.equal(ledgerOf('MANY_STREETS', 'following_time_headway').distinctEpisodes, 1);
  assert.equal(ledgerOf('MANY_STREETS', 'following_time_headway').status, 'INSUFFICIENT');
  assert.equal(ledgerOf('MANY_STREETS', 'green_start_delay').status, 'NO_EVIDENCE');
  assert.deepEqual(many.learnedKeys, ['speed_delta_urban', 'intersection_approach_speed']);
  assert.deepEqual(many.contextsObserved, ['FREE_TRAFFIC', 'LEADER', 'BLOCKED_GREEN']);
  assert.deepEqual(many.contextsUnobserved, []);
  assert.deepEqual(
    [...new Set(ledgerOf('MANY_STREETS', 'speed_delta_urban').contexts)],
    ['FREE_TRAFFIC'],
  );
  assert.deepEqual(
    [...new Set(ledgerOf('MANY_STREETS', 'following_time_headway').contexts)],
    ['LEADER'],
  );
  const blocked = admissionOf('MANY_STREETS', 4);
  assert.equal(blocked.label, 'BLOCKED_GREEN');
  assert.equal(blocked.admitted, false);
  assert.equal(blocked.reason, 'CONTEXT_NOT_EVIDENCE');
});

test('107 a short intervention reaches READY only for its observed speed context', () => {
  const short = caseOf('SHORT_INTERVENTION');
  assert.deepEqual(short.learnedKeys, ['speed_delta_urban']);
  assert.equal(ledgerOf('SHORT_INTERVENTION', 'speed_delta_urban').status, 'READY');
  assert.equal(ledgerOf('SHORT_INTERVENTION', 'speed_delta_urban').distinctEpisodes, 1);
  assert.equal(
    ledgerOf('SHORT_INTERVENTION', 'intersection_approach_speed').status,
    'INSUFFICIENT',
  );
  assert.equal(ledgerOf('SHORT_INTERVENTION', 'following_time_headway').status, 'NO_EVIDENCE');
  assert.equal(ledgerOf('SHORT_INTERVENTION', 'green_start_delay').status, 'NO_EVIDENCE');
  assert.equal(ledgerOf('SHORT_INTERVENTION', 'lane_change_front_gap').status, 'NO_EVIDENCE');
  assert.deepEqual(short.contextsObserved, ['FREE_TRAFFIC']);
  assert.deepEqual(short.contextsUnobserved, ['LEADER', 'BLOCKED_GREEN']);
});

test('107 a MANUAL short intervention learns nothing and adds no episode', () => {
  const short = caseOf('SHORT_INTERVENTION');
  const manual = admissionOf('SHORT_INTERVENTION', 1);
  assert.equal(manual.label, 'MANUAL_SEGMENT');
  assert.equal(manual.admitted, false);
  assert.equal(manual.reason, 'ELIGIBILITY_EXCLUDED');
  assert.equal(ledgerOf('SHORT_INTERVENTION', 'speed_delta_urban').distinctEpisodes, 1);
  assert.deepEqual(short.learnedKeys, ['speed_delta_urban']);
  assert.equal(short.profileChanges, 0);
});

test('107 positive controls stay READY in their own contexts without spillover', () => {
  const free = caseOf('CLEAN_FREE_TRAFFIC');
  assert.equal(free.artifacts.length, 0);
  assert.equal(free.windows[0]?.completeness, 'COMPLETE');
  assert.deepEqual(free.learnedKeys, ['speed_delta_urban']);
  assert.equal(ledgerOf('CLEAN_FREE_TRAFFIC', 'following_time_headway').status, 'NO_EVIDENCE');

  const leader = caseOf('CLEAN_LEADER');
  assert.deepEqual(leader.learnedKeys, [
    'following_time_headway',
    'following_min_gap',
    'queue_standstill_gap',
    'following_speed_gain',
    'yield_time_gap',
  ]);
  assert.equal(ledgerOf('CLEAN_LEADER', 'speed_delta_urban').status, 'NO_EVIDENCE');
  assert.deepEqual(leader.contextsObserved, ['LEADER']);

  const green = caseOf('CLEAN_BLOCKED_GREEN');
  assert.equal(green.windows[0]?.completeness, 'COMPLETE');
  assert.equal(admissionOf('CLEAN_BLOCKED_GREEN', 0).admitted, false);
  assert.equal(admissionOf('CLEAN_BLOCKED_GREEN', 0).reason, 'CONTEXT_NOT_EVIDENCE');
  assert.deepEqual(green.learnedKeys, []);
  assert.equal(ledgerOf('CLEAN_BLOCKED_GREEN', 'green_start_delay').status, 'NO_EVIDENCE');
  assert.equal(ledgerOf('CLEAN_BLOCKED_GREEN', 'speed_delta_urban').status, 'NO_EVIDENCE');
});

test('107 the adapter refuses a fully suppressed window before 093 sees it', () => {
  const filter = createArtifactFilter();
  const artifacts = filter.evaluate({
    tick: 100,
    sessionId: '107-adapter',
    worldEpoch: 1,
    segmentId: 'adapter-segment',
    vehicleId: 'taxi-adapter',
    incarnation: 'taxi-adapter-1',
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 1,
    endTick: 100,
    segmentCompleteness: 'CLOSED',
    closeReason: 'RIDE_COMPLETED',
    lostCheckpointTick: null,
    observationLoss: null,
    collisions: [
      { tick: 1, incidentId: 'adapter-incident', impulseNs: 900, otherEntityId: 'wall' },
    ],
    recoveries: [],
    suspensions: [],
  });
  assert.equal(artifacts.windowClass, 'FULLY_SUPPRESSED');
  const eligibility = createEligibilityWindows();
  const window = eligibility.observe({
    tick: 50,
    sessionId: '107-adapter',
    worldEpoch: 1,
    opportunityId: 'adapter-opportunity',
    kind: 'STOP',
    vehicleId: 'taxi-adapter',
    incarnation: 'taxi-adapter-1',
    segmentId: 'adapter-segment',
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
  });
  const admission = admitLearningWindowForRegression({
    eligibility: window,
    opportunity: {
      id: 'adapter-opportunity',
      kind: 'STOP',
      state: 'RESOLVED',
      outcome: 'STOPPED',
      result: 'SUCCESS',
      truncationReason: null,
      vehicleId: 'taxi-adapter',
      incarnation: 'taxi-adapter-1',
      segmentIds: ['adapter-segment'],
      learningEligible: true,
      occurrence: 1,
      openedTick: 1,
      lastTick: 50,
      resolvedTick: 50,
      observationCount: 50,
      stimulus: {
        stopLineId: 'adapter-stop-line',
        signalId: null,
        intersectionId: null,
        movementId: null,
        movementPhaseStartedTick: null,
        fromLaneId: null,
        toLaneId: null,
        relationIds: [],
      },
    },
    artifacts,
    roadType: 'urban',
    speedSamples: [{ tick: 10, speedMps: 10 }],
  });
  assert.equal(admission.admitted, false);
  if (admission.admitted) assert.fail('a fully suppressed window was admitted');
  assert.equal(admission.reason, 'WINDOW_FULLY_SUPPRESSED');
  eligibility.dispose();
  filter.dispose();
});

test('107 is deterministic and never uses Math.random or a wall clock', () => {
  assert.equal(JSON.stringify(report), JSON.stringify(runLearningEdgeCaseRegressions()));
  const source = readFileSync('src/experiments/learning-edgecases.ts', 'utf8');
  assert.equal(source.includes('Math.random('), false);
  assert.equal(source.includes('Date.now'), false);
  for (const entry of report.cases) {
    assert.equal(entry.status, 'PASS', `${entry.caseId} must pass`);
    for (const row of entry.checks) assert.equal(row.pass, true, `${entry.caseId}/${row.name}`);
  }
});

test('107 never mutates the registry, store, publication or fleet', () => {
  const definitionsBefore = JSON.stringify(parameterDefinitions);
  const estimableBefore = parameterDefinitions.map((entry) => entry.estimable);
  const first = runLearningEdgeCaseRegressions();
  const second = runLearningEdgeCaseRegressions();
  assert.equal(JSON.stringify(parameterDefinitions), definitionsBefore);
  assert.deepEqual(
    parameterDefinitions.map((entry) => entry.estimable),
    estimableBefore,
  );
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.summary.profileChanges, 0);
  assert.equal(first.summary.profilePublications, 0);
  assert.equal(first.summary.storeWrites, 0);
  assert.equal(first.summary.fleetMutations, 0);
  assert.equal(first.summary.candidatesProduced, 0);
  assert.equal(parameterRegistry.speed_delta_urban.estimable, false);
  assert.equal(parameterRegistry.following_time_headway.estimable, false);
});

test('107 report counts and frozen rows sum to the per-case results', () => {
  assert.equal(report.summary.cases, report.cases.length);
  assert.equal(
    report.summary.passed,
    report.cases.filter((entry) => entry.status === 'PASS').length,
  );
  assert.equal(report.summary.failed, 0);
  assert.equal(
    report.summary.checks,
    report.cases.reduce((total, entry) => total + entry.checks.length, 0),
  );
  assert.equal(report.summary.checksPassed, report.summary.checks);
  assert.equal(report.summary.pass, true);
  assert.deepEqual(report.summary.learnedKeys, [
    'following_min_gap',
    'following_speed_gain',
    'following_time_headway',
    'intersection_approach_speed',
    'queue_standstill_gap',
    'speed_delta_urban',
    'yield_time_gap',
  ]);
  const negative = report.cases.filter((entry) => entry.kind === 'NEGATIVE');
  assert.equal(negative.length, 8);
  assert.equal(
    negative.every((entry) => entry.profileChanges === 0),
    true,
  );
  assert.equal(
    negative
      .filter((entry) => entry.caseId !== 'RECOVERY_ADMITTED')
      .every((entry) => entry.learnedKeys.length === 0),
    true,
  );
  assert.deepEqual(caseOf('RECOVERY_ADMITTED').learnedKeys, ['speed_delta_urban']);
});
