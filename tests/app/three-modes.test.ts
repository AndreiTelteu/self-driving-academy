import assert from 'node:assert/strict';
import test from 'node:test';
import { createThreeModesServices } from './three-modes-fixture';
import {
  normalizeThreeModesReport,
  readCommittedThreeModesReport,
  runThreeModesReport,
} from './three-modes-report';
import {
  THREE_MODES_LEARNING_KEY,
  THREE_MODE_TRANSITIONS,
  assertTransition,
  measureThreeModeLatency,
  runThreeModesMatrix,
  transitionFailures,
  type ThreeModeTransitionObservation,
  type ThreeModesMatrixReport,
} from '../../src/app/three-modes';
import type { BodyIdentity } from '../../src/vehicles';

const services = createThreeModesServices();
let cached: Promise<ThreeModesMatrixReport> | null = null;

function matrix(): Promise<ThreeModesMatrixReport> {
  cached ??= runThreeModesMatrix(services);
  return cached;
}

function rowOf(value: ThreeModesMatrixReport, kind: 'TAXI' | 'CIVIL', transition: string) {
  const row = value.rows.find((entry) => entry.kind === kind && entry.transition === transition);
  assert.ok(row !== undefined, `missing ${kind} ${transition} row`);
  return row;
}

function caseOf(value: ThreeModesMatrixReport, id: string) {
  const found = value.cases.find((entry) => entry.id === id);
  assert.ok(found !== undefined, `missing ${id} case`);
  return found;
}

const IDENTITY: BodyIdentity = Object.freeze({
  entityId: 'taxi:217',
  handle: 1,
  generation: 1,
});

/** A fully valid AUTO -> MANUAL transition used as the base of the injected-fault probes. */
function observation(
  overrides: Partial<ThreeModeTransitionObservation> = {},
): ThreeModeTransitionObservation {
  return {
    transition: THREE_MODE_TRANSITIONS[0]!,
    kind: 'TAXI',
    scenarioId: 'probe',
    previousTick: 10,
    atTick: 11,
    eligible: true,
    expectedClosedSegmentId: null,
    closed: null,
    opened: {
      segmentId: 'segment:probe',
      vehicleId: IDENTITY.entityId,
      mode: 'MANUAL',
      learningEligible: false,
      startTick: 11,
      endTick: null,
      completeness: 'OPEN',
      closeReason: null,
      samples: 0,
    },
    beforePhysics: {
      tick: 10,
      positionM: { x: 0, y: 0, z: 0 },
      speedMps: 8,
      headingRad: 0,
    },
    afterPhysics: {
      tick: 11,
      positionM: { x: 0, y: 0, z: 8 / 60 },
      speedMps: 8,
      headingRad: 0,
    },
    seatCount: 1,
    seat: { identity: IDENTITY, mode: 'MANUAL' },
    controlledIdentity: IDENTITY,
    ...overrides,
  };
}

test('217 taxi: all six transitions separate segments with the accepted mode', async () => {
  const report = await matrix();
  for (const transition of THREE_MODE_TRANSITIONS) {
    const row = rowOf(report, 'TAXI', transition.id);
    assert.equal(row.ok, true, `${transition.id}: ${row.failures.join('; ')}`);
    assert.equal(row.from, transition.from);
    assert.equal(row.to, transition.to);
    assert.equal(row.seat.count <= 1, true);
    if (transition.from === 'AUTO') assert.equal(row.closed.segmentId, null);
    else {
      assert.equal(row.closed.mode, transition.from);
      assert.equal(row.closed.endTick, row.atTick);
      assert.equal(row.closed.closeReason, transition.closeReason);
    }
    if (transition.to === 'AUTO') assert.equal(row.opened.segmentId, null);
    else {
      assert.equal(row.opened.mode, transition.to);
      assert.equal(row.opened.startTick, row.atTick);
      assert.equal(row.opened.learningEligible, transition.to === 'LEARNING');
    }
  }
});

test('217 civil: all six transitions separate segments with the accepted mode', async () => {
  const report = await matrix();
  for (const transition of THREE_MODE_TRANSITIONS) {
    const row = rowOf(report, 'CIVIL', transition.id);
    assert.equal(row.ok, true, `${transition.id}: ${row.failures.join('; ')}`);
    assert.equal(row.from, transition.from);
    assert.equal(row.to, transition.to);
    if (transition.to !== 'AUTO') assert.equal(row.opened.mode, transition.to);
  }
});

test('217 every transition preserves speed, heading and the per-tick position step', async () => {
  const report = await matrix();
  assert.equal(report.rows.length, 12);
  for (const row of report.rows) {
    assert.equal(row.physics.preserved, true, `${row.kind} ${row.transition}`);
    assert.equal(row.physics.speedDeltaMps, 0);
    assert.equal(row.physics.headingDeltaRad, 0);
    assert.equal(row.physics.positionStepErrorM, 0);
    assert.equal(row.physics.actualStepM, row.physics.expectedStepM);
  }
});

test('217 at most one PLAYER seat exists and it names the controlled vehicle', async () => {
  const report = await matrix();
  assert.equal(report.counts.maxPlayerSeats, 1);
  for (const row of report.rows) {
    assert.equal(row.seat.count <= 1, true);
    if (row.to === 'AUTO') assert.equal(row.seat.identity, null);
    else assert.equal(row.seat.identity, services.vehicles[row.kind].identity.entityId);
  }
});

test('217 a new selection moves only the camera target and never takes control', async () => {
  const report = await matrix();
  const scenario = caseOf(report, 'selection-no-takeover');
  assert.equal(scenario.ok, true, JSON.stringify(scenario.checks.filter((entry) => !entry.pass)));
  const cameraOnly = scenario.checks.find((entry) => entry.name === 'selection-camera-only');
  assert.deepEqual(cameraOnly?.actual, {
    camera: services.vehicles.CIVIL.identity.entityId,
    seat: null,
    segments: 0,
  });
});

test('217 MANUAL records telemetry but never a learning job, version or parameter', async () => {
  const report = await matrix();
  const evidence = caseOf(report, 'profile-evidence');
  assert.equal(evidence.ok, true, JSON.stringify(evidence.checks.filter((entry) => !entry.pass)));
  const record = evidence.checks.find((entry) => entry.name === 'evidence-manual-record');
  assert.deepEqual(record?.actual, { mode: 'MANUAL', eligible: false, samples: true });
  const skip = evidence.checks.find((entry) => entry.name === 'evidence-manual-skip');
  assert.deepEqual(skip?.actual, {
    status: 'SKIPPED_MANUAL',
    reason: 'MANUAL_SEGMENT_NOT_LEARNABLE',
    job: false,
    version: null,
  });
  assert.equal(report.counts.manualPublications, 0);
});

test('217 an eligible LEARNING segment publishes a real 112 version automatically', async () => {
  const report = await matrix();
  const evidence = caseOf(report, 'profile-evidence');
  const version = evidence.checks.find((entry) => entry.name === 'evidence-eligible-version');
  assert.deepEqual(version?.actual, {
    status: 'COMPOSED',
    job: true,
    version: true,
    versions: 1,
  });
  const value = evidence.checks.find((entry) => entry.name === 'evidence-eligible-value');
  assert.deepEqual(value?.actual, {
    changed: true,
    key: THREE_MODES_LEARNING_KEY,
    compositions: 1,
  });
  for (const row of report.rows.filter((entry) => entry.closed.mode === 'LEARNING')) {
    assert.equal(row.learning.status, 'COMPOSED', `${row.kind} ${row.transition}`);
    assert.notEqual(row.learning.versionId, null);
    assert.equal(row.learning.compositionKey, THREE_MODES_LEARNING_KEY);
  }
});

test('217 an ineligible LEARNING segment is skipped without a job', async () => {
  const report = await matrix();
  const evidence = caseOf(report, 'profile-evidence');
  const ineligible = evidence.checks.find((entry) => entry.name === 'evidence-ineligible-skip');
  assert.deepEqual(ineligible?.actual, {
    openEligible: false,
    status: 'SKIPPED_INELIGIBLE',
    jobs: 0,
    versions: 0,
  });
});

test('217 remapped M/L bindings are the ones that drive the modes', async () => {
  const report = await matrix();
  const remap = caseOf(report, 'remap');
  assert.equal(remap.ok, true, JSON.stringify(remap.checks.filter((entry) => !entry.pass)));
  assert.deepEqual(remap.checks.find((entry) => entry.name === 'remap-saved')?.actual, {
    manual: 'Digit1',
    learning: 'Digit2',
    changed: true,
  });
  assert.deepEqual(remap.checks.find((entry) => entry.name === 'remap-new-code-accepted')?.actual, {
    manual: true,
    learning: true,
  });
});

test('217 the previous M/L codes are ignored after a remap', async () => {
  const report = await matrix();
  const remap = caseOf(report, 'remap');
  assert.deepEqual(remap.checks.find((entry) => entry.name === 'remap-old-code-ignored')?.actual, {
    accepted: false,
    mode: 'AUTO',
    segments: 0,
  });
});

test('217 pause suspends the world and resets the held M/L key', async () => {
  const report = await matrix();
  const pause = caseOf(report, 'pause-focus');
  assert.equal(pause.ok, true, JSON.stringify(pause.checks.filter((entry) => !entry.pass)));
  assert.deepEqual(pause.checks.find((entry) => entry.name === 'pause-holds-key')?.actual, {
    held: 1,
  });
  assert.deepEqual(pause.checks.find((entry) => entry.name === 'pause-resets-held')?.actual, {
    held: 0,
    suspended: true,
  });
  assert.deepEqual(pause.checks.find((entry) => entry.name === 'focus-suspends')?.actual, {
    suspended: true,
    held: 0,
    resumed: false,
    tickGap: 0,
  });
});

test('217 pause/resume keeps the tick sequence contiguous and drops the pending intent', async () => {
  const report = await matrix();
  const pause = caseOf(report, 'pause-focus');
  const stopped = pause.checks.find((entry) => entry.name === 'pause-stops-ticks');
  assert.equal(
    (stopped?.expected as { tick: number }).tick,
    (stopped?.actual as { tick: number }).tick,
  );
  assert.equal((stopped?.actual as { stepped: boolean }).stepped, false);
  assert.deepEqual(pause.checks.find((entry) => entry.name === 'pause-resume')?.actual, {
    paused: false,
    gap: 1,
  });
  assert.deepEqual(pause.checks.find((entry) => entry.name === 'pause-clears-intent')?.actual, {
    mode: 'MANUAL',
    autoSegments: 0,
    closed: 0,
  });
});

test('217 a busy worker still accepts mode and selection changes', async () => {
  const report = await matrix();
  const busy = caseOf(report, 'busy-worker');
  assert.equal(busy.ok, true, JSON.stringify(busy.checks.filter((entry) => !entry.pass)));
  assert.deepEqual(busy.checks.find((entry) => entry.name === 'busy-worker-active')?.actual, {
    active: 1,
  });
  assert.deepEqual(busy.checks.find((entry) => entry.name === 'busy-admission')?.actual, {
    job: true,
    version: true,
  });
});

test('217 a busy worker does not duplicate jobs on a replayed segment', async () => {
  const report = await matrix();
  const busy = caseOf(report, 'busy-worker');
  const replay = busy.checks.find((entry) => entry.name === 'busy-no-duplicate');
  assert.deepEqual(replay?.actual, {
    starts: (replay?.expected as { starts: number }).starts,
    deduplicated: 'DEDUPLICATED',
  });
});

test('217 the local latency probe measures three channels with a busy worker', async () => {
  const latency = await measureThreeModeLatency(services);
  assert.equal(latency.provisional, true);
  assert.equal(latency.scope, 'LOCAL_NODE_SINGLE_PROCESS');
  assert.equal(latency.hardwareClaim, 'NOT_MEASURED');
  assert.equal(latency.fpsClaim, 'NOT_MEASURED');
  assert.equal(latency.gpuClaim, 'NOT_MEASURED');
  assert.deepEqual(latency.failures, []);
  for (const stats of [
    latency.modeIntentToAcceptedTransition,
    latency.selectionChangeToCameraTarget,
    latency.learningSegmentCloseToQueueAdmission,
  ]) {
    assert.equal(stats.samples > 0, true);
    assert.equal(stats.minMs <= stats.p50Ms, true);
    assert.equal(stats.p50Ms <= stats.p95Ms, true);
    assert.equal(stats.p95Ms <= stats.maxMs, true);
  }
  assert.equal(latency.learningSegmentCloseToQueueAdmission.busyWorker, true);
  assert.equal(latency.learningSegmentCloseToQueueAdmission.duplicateJobs, 0);
  assert.equal(
    latency.learningSegmentCloseToQueueAdmission.admissions,
    latency.learningSegmentCloseToQueueAdmission.samples,
  );
});

test('217 an injected physics discontinuity fails explicitly', () => {
  assert.doesNotThrow(() => assertTransition(observation()));
  const jumped = observation({
    afterPhysics: {
      tick: 11,
      positionM: { x: 5, y: 0, z: 8 / 60 },
      speedMps: 8,
      headingRad: 0,
    },
  });
  assert.throws(() => assertTransition(jumped), /PHYSICS_POSITION_STEP/);
  const sped = observation({
    afterPhysics: { tick: 11, positionM: { x: 0, y: 0, z: 8 / 60 }, speedMps: 9, headingRad: 0 },
  });
  assert.throws(() => assertTransition(sped), /PHYSICS_SPEED/);
});

test('217 an injected extra PLAYER seat fails explicitly', () => {
  const extra = observation({ seatCount: 2 });
  assert.throws(() => assertTransition(extra), /MULTIPLE_PLAYER_SEATS/);
  const kinds = transitionFailures(extra).map((entry) => entry.kind);
  assert.deepEqual(kinds.includes('MULTIPLE_PLAYER_SEATS'), true);
});

test('217 an injected missing segment fails explicitly', () => {
  const missing = observation({ expectedClosedSegmentId: 'segment:missing' });
  assert.throws(() => assertTransition(missing), /MISSING_CLOSED_SEGMENT/);
  const wrong = observation({
    expectedClosedSegmentId: 'segment:missing',
    closed: {
      segmentId: 'segment:other',
      vehicleId: IDENTITY.entityId,
      mode: 'MANUAL',
      learningEligible: false,
      startTick: 8,
      endTick: 11,
      closeReason: 'MODE_CHANGE',
      samples: 3,
    },
  });
  assert.throws(() => assertTransition(wrong), /WRONG_CLOSED_SEGMENT/);
});

test('217 two identical matrix runs produce identical JSON', async () => {
  const first = await matrix();
  const second = await runThreeModesMatrix(services);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test(
  '217 committed evidence report is the current three-mode transcript',
  { skip: process.env.THREE_MODES_PREFLIGHT === '1' },
  async () => {
    const saved = readCommittedThreeModesReport();
    assert.notEqual(saved, null, 'Docs/Evidence/217-three-modes/report.json is missing');
    const fresh = await runThreeModesReport(services, { measureLatency: true });
    assert.deepEqual(
      JSON.parse(JSON.stringify(normalizeThreeModesReport(fresh))),
      JSON.parse(JSON.stringify(normalizeThreeModesReport(saved!))),
      'run npm run modes:three to regenerate the evidence',
    );
  },
);
