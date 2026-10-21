import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { learningExplanationCurrentJob, readLearningExplanation } from '../../src/app';
import { CANDIDATE_LEARNING_KEYS } from '../../src/learning';
import {
  LEARNING_EXPLANATION_LIMITS,
  LEARNING_EXPLANATION_NO_CHANGE_TEXT,
  LEARNING_EXPLANATION_NO_VERSION_TEXT,
  LEARNING_EXPLANATION_VERSION,
  createLearningExplanationSnapshot,
  formatLearningExplanationNumber,
  learningExplanationStatuses,
  projectLearningExplanation,
} from '../../src/ui';
import type { LearningExplanationChange, LearningExplanationSnapshot } from '../../src/ui';
import { runLearningExplanationReport } from '../app/learning-explanation-report';
import {
  createLearningExplanationHarness,
  explanationFailure,
  explanationJob,
  explanationOutcome,
  frameOf,
  noContextJob,
  noEvidenceJob,
  weakEvidenceJob,
  withEstimate,
} from './learning-explanation-fixture';

function singleChange(value = 1.5, tick = 10): LearningExplanationSnapshot {
  const job = explanationJob();
  return readLearningExplanation({ job, outcome: explanationOutcome(job, value) }, { tick });
}

function firstChange(snapshot: LearningExplanationSnapshot): LearningExplanationChange {
  const change = snapshot.changes[0];
  assert.ok(change, 'a change row is required');
  return change;
}

test('104 a composed change is CHANGED with the real version, evidence and contexts', () => {
  const snapshot = singleChange(),
    view = projectLearningExplanation(snapshot),
    row = view.rows[0]!;
  assert.equal(snapshot.status, 'CHANGED');
  assert.equal(snapshot.versionId, 'style:104:v2~103.7');
  assert.equal(snapshot.changes.length, 1);
  assert.equal(row.key, 'following_time_headway');
  assert.equal(row.previous, 1.8);
  assert.equal(row.next, 1.5);
  assert.ok(Math.abs(row.delta + 0.3) < 1e-9);
  assert.equal(row.previousLabel, '1.8 s');
  assert.equal(row.nextLabel, '1.5 s');
  assert.equal(row.deltaLabel, '-0.3 s');
  assert.equal(row.evidenceCount, 3);
  assert.equal(row.evidenceLabel, '3 episoade efective');
  assert.deepEqual(row.contexts, ['LEADER']);
  assert.equal(row.quality, 1);
  assert.equal(row.confidence, 'OBSERVED');
  assert.equal(row.uncertainty, 'MODERATE');
  assert.deepEqual(row.sourceSegmentIds, ['segment:104:headway']);
  assert.equal(row.reason, 'EVIDENCE_APPLIED');
  assert.equal(view.success, true);
  assert.equal(view.published, false);
  assert.equal(view.noVersion, false);
  assert.equal(view.versionLabel, 'style:104:v2~103.7');
  assert.ok(view.summary.includes('segment:104:headway'));
  assert.ok(view.summary.includes('job:104:segment:104:headway:7'));
  assert.ok(view.summary.includes('1.8 → 1.5 s'));
  assert.equal(view.counts.changes, 1);
  assert.equal(view.counts.contexts, 1);
});

test('104 no-change has no version, zero changes and a concrete missing explanation', () => {
  const job = noEvidenceJob(),
    snapshot = readLearningExplanation(
      { job, outcome: explanationOutcome(job, job.baseValue) },
      { tick: 11 },
    ),
    view = projectLearningExplanation(snapshot);
  assert.equal(snapshot.status, 'NO_CHANGE');
  assert.equal(snapshot.versionId, null);
  assert.equal(snapshot.changes.length, 0);
  assert.equal(snapshot.noChangeReason, 'NO_NEW_EVIDENCE');
  assert.ok(snapshot.missingContexts.length > 0);
  assert.match(snapshot.missingContexts[0]!, /^following_time_headway: NO_NEW_EVIDENCE/);
  assert.equal(view.noVersion, true);
  assert.equal(view.versionLabel, LEARNING_EXPLANATION_NO_VERSION_TEXT);
  assert.equal(view.published, false);
  assert.equal(view.success, false);
  assert.equal(view.rows.length, 0);
  assert.ok(view.noChange !== null);
  assert.ok(view.noChange.includes(LEARNING_EXPLANATION_NO_CHANGE_TEXT));
  assert.ok(view.noChange.includes('following_time_headway'));
  assert.ok(view.summary.includes(LEARNING_EXPLANATION_NO_CHANGE_TEXT));
  assert.equal(view.text.includes('style:104:v2~103.7'), false);
});

test('104 the parser rejects a no-change that claims a version or a change', () => {
  const noChange = readLearningExplanation(
      { job: noEvidenceJob(), outcome: explanationOutcome(noEvidenceJob(), 1.8) },
      { tick: 12 },
    ),
    change = firstChange(singleChange()),
    frame = frameOf(noChange);
  assert.throws(
    () => createLearningExplanationSnapshot({ ...frame, versionId: 'style:104:v9' }),
    /cannot claim a version/,
  );
  assert.throws(
    () => createLearningExplanationSnapshot({ ...frame, changes: [change] }),
    /cannot carry a change/,
  );
  assert.throws(
    () =>
      createLearningExplanationSnapshot({
        ...frame,
        status: 'CHANGED',
        changes: [],
        versionId: 'style:104:v9',
      }),
    /requires at least one change/,
  );
  assert.throws(
    () => createLearningExplanationSnapshot({ ...frame, missingContexts: [] }),
    /requires a concrete explanation/,
  );
});

test('104 a real zero previous → next is preserved and marked ZERO', () => {
  const job = withEstimate(
      explanationJob({
        key: 'stop_full_probability',
        segmentId: 'segment:104:stop',
        order: 2,
        baseValue: 1,
      }),
      0,
    ),
    snapshot = readLearningExplanation({ job, outcome: explanationOutcome(job, 0) }, { tick: 13 }),
    row = projectLearningExplanation(snapshot).rows[0]!;
  assert.equal(snapshot.status, 'CHANGED');
  assert.equal(row.previous, 1);
  assert.equal(row.next, 0);
  assert.equal(row.delta, -1);
  assert.equal(row.nextLabel, '0 probabilitate');
  assert.equal(row.confidence, 'ZERO');
  assert.equal(row.confidenceLabel, 'Zero observat');
  assert.equal(row.reason, 'ZERO_OBSERVED');
  assert.equal(row.evidenceCount, 3);
  assert.equal(formatLearningExplanationNumber(0), '0');
  assert.ok(snapshot.summary.includes('1 → 0 probabilitate'));
});

test('104 multi-key delta aggregates deterministically with unique keys', () => {
  const headway = explanationJob({ order: 7 }),
    stop = withEstimate(
      explanationJob({
        key: 'stop_full_probability',
        segmentId: 'segment:104:stop',
        order: 8,
        baseValue: 1,
      }),
      0,
    ),
    forward = readLearningExplanation(
      [
        { job: headway, outcome: explanationOutcome(headway, 1.5) },
        { job: stop, outcome: explanationOutcome(stop, 0) },
      ],
      { tick: 14 },
    ),
    reversed = readLearningExplanation(
      [
        { job: stop, outcome: explanationOutcome(stop, 0) },
        { job: headway, outcome: explanationOutcome(headway, 1.5) },
      ],
      { tick: 14 },
    ),
    view = projectLearningExplanation(forward);
  assert.equal(forward.status, 'CHANGED');
  assert.deepEqual(
    forward.changes.map((row) => row.key),
    ['following_time_headway', 'stop_full_probability'],
  );
  assert.equal(new Set(forward.changes.map((row) => row.key)).size, 2);
  assert.equal(forward.changes.length, 2);
  assert.equal(forward.versionId, 'style:104:v2~103.8');
  assert.equal(forward.order, 8);
  assert.equal(forward.segmentId, 'segment:104:stop');
  assert.equal(forward.jobKey, 'job:104:segment:104:stop:8');
  assert.equal(view.rows.length, 2);
  assert.deepEqual(
    view.rows.map((row) => row.next),
    [1.5, 0],
  );
  assert.equal(reversed.signature, forward.signature);
  assert.equal(reversed.summary, forward.summary);
});

test('104 missing context is explicit and blocks invented evidence', () => {
  const job = noContextJob(),
    snapshot = readLearningExplanation(
      { job, outcome: explanationOutcome(job, 1.5) },
      { tick: 15 },
    ),
    view = projectLearningExplanation(snapshot);
  assert.equal(snapshot.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(snapshot.versionId, null);
  assert.equal(snapshot.changes.length, 0);
  assert.equal(snapshot.noChangeReason, 'WEAK_EVIDENCE');
  assert.equal(view.rows.length, 0);
  assert.deepEqual(
    view.missing.map((row) => row.text),
    snapshot.missingContexts,
  );
  assert.ok(snapshot.missingContexts[0]!.includes('CONTEXT_MISSING'));
  assert.ok(snapshot.missingContexts[0]!.includes('3 episoade efective'));
  assert.equal(view.text.includes('LEADER'), false);
  assert.ok(view.noChange !== null);
  assert.ok(view.noChange.includes(LEARNING_EXPLANATION_NO_CHANGE_TEXT));
});

test('104 a change with zero evidence is rejected by the parser', () => {
  const snapshot = singleChange(),
    frame = frameOf(snapshot),
    change = firstChange(snapshot);
  assert.throws(
    () =>
      createLearningExplanationSnapshot({ ...frame, changes: [{ ...change, evidenceCount: 0 }] }),
    /requires positive evidence/,
  );
  assert.throws(
    () => createLearningExplanationSnapshot({ ...frame, changes: [{ ...change, contexts: [] }] }),
    /context ceiling/,
  );
  assert.throws(
    () =>
      createLearningExplanationSnapshot({
        ...frame,
        changes: [{ ...change, delta: 0 }],
      }),
    /delta does not match/,
  );
});

test('104 weak evidence keeps its real effective count and a closed reason', () => {
  const job = weakEvidenceJob(),
    snapshot = readLearningExplanation(
      { job, outcome: explanationOutcome(job, job.baseValue) },
      { tick: 16 },
    );
  assert.equal(snapshot.status, 'NO_CHANGE');
  assert.equal(snapshot.versionId, null);
  assert.equal(snapshot.noChangeReason, 'WEAK_EVIDENCE');
  assert.equal(snapshot.missingContexts.length, 1);
  assert.ok(snapshot.missingContexts[0]!.includes('2 episoade efective'));
  assert.ok(snapshot.missingContexts[0]!.includes('2 distincte'));
  assert.ok(snapshot.missingContexts[0]!.includes('WEAK_EVIDENCE'));
});

test('104 error keeps the real reason and never a version or a success', () => {
  const job = explanationJob(),
    snapshot = readLearningExplanation(
      {
        job,
        outcome: explanationFailure(job, 'error', 'RESULT_INVALID', 'Malformed estimator result'),
      },
      { tick: 17 },
    ),
    view = projectLearningExplanation(snapshot);
  assert.equal(snapshot.status, 'ERROR');
  assert.equal(snapshot.versionId, null);
  assert.equal(snapshot.changes.length, 0);
  assert.equal(snapshot.noChangeReason, 'RESULT_INVALID');
  assert.equal(snapshot.detail, 'Malformed estimator result');
  assert.equal(view.success, false);
  assert.equal(view.published, false);
  assert.ok(view.failure !== null);
  assert.ok(view.failure.includes('RESULT_INVALID'));
  assert.ok(view.failure.includes('Malformed estimator result'));
  assert.ok(view.failure.includes(LEARNING_EXPLANATION_NO_VERSION_TEXT));
  assert.equal(view.text.includes('Profil publicat'), false);
  assert.ok(view.summary.includes('RESULT_INVALID'));
  assert.throws(
    () => createLearningExplanationSnapshot({ ...frameOf(snapshot), noChangeReason: 'PUBLISHED' }),
    /real failure reason/,
  );
});

test('104 rejected, invalidated and cancelled outcomes stay non-success', () => {
  const job = explanationJob();
  for (const [status, reason] of [
    ['rejected', 'COMPOSITION_REJECTED'],
    ['invalidated', 'GENERATION_INVALIDATED'],
    ['cancelled', 'CANCELLED'],
  ] as const) {
    const snapshot = readLearningExplanation(
        { job, outcome: explanationFailure(job, status, null) },
        { tick: 18 },
      ),
      view = projectLearningExplanation(snapshot);
    assert.equal(snapshot.status, 'REJECTED', status);
    assert.equal(snapshot.versionId, null);
    assert.equal(snapshot.changes.length, 0);
    assert.equal(snapshot.noChangeReason, reason);
    assert.equal(view.success, false);
    assert.equal(view.published, false);
    assert.ok(view.failure !== null);
    assert.ok(view.failure.includes(reason));
  }
});

test('104 a stale or foreign job is a closed STALE_JOB error', () => {
  const job = explanationJob(),
    other = explanationJob({ segmentId: 'segment:104:other', order: 9 }),
    outcome = explanationOutcome(job, 1.5);
  const byCurrent = readLearningExplanation(
      { job, outcome },
      { tick: 19, current: learningExplanationCurrentJob(other) },
    ),
    bySession = readLearningExplanation(
      { job, outcome },
      { tick: 19, sessionId: 'session:104:other' },
    ),
    byWorld = readLearningExplanation({ job, outcome }, { tick: 19, worldEpoch: 9 });
  for (const snapshot of [byCurrent, bySession, byWorld]) {
    assert.equal(snapshot.status, 'ERROR');
    assert.equal(snapshot.noChangeReason, 'STALE_JOB');
    assert.equal(snapshot.versionId, null);
    assert.equal(snapshot.changes.length, 0);
  }
  const foreign = explanationJob({ learningEpoch: 5, order: 10 }),
    mixed = readLearningExplanation(
      [
        { job, outcome },
        { job: foreign, outcome: explanationOutcome(foreign, 1.5) },
      ],
      { tick: 19 },
    );
  assert.equal(mixed.status, 'ERROR');
  assert.equal(mixed.noChangeReason, 'STALE_JOB');
  assert.ok(projectLearningExplanation(byCurrent).failure!.includes('jobului curent'));
});

test('104 a reserved R key can never appear as a learned change', () => {
  const rJob = { ...explanationJob(), key: 'route_time_weight' } as unknown as ReturnType<
      typeof explanationJob
    >,
    rOutcome = explanationOutcome({ ...rJob, key: 'following_time_headway' }, 1.5);
  assert.throws(
    () => readLearningExplanation({ job: rJob, outcome: rOutcome }, { tick: 20 }),
    /not a learning target/,
  );
  const snapshot = singleChange(),
    frame = frameOf(snapshot),
    change = firstChange(snapshot),
    patched = createLearningExplanationSnapshot({
      ...frame,
      changes: [{ ...change, key: 'route_time_weight' }],
    });
  assert.throws(
    () => createLearningExplanationSnapshot({ ...frameOf(patched) }, CANDIDATE_LEARNING_KEYS),
    /not a learning target/,
  );
  const harness = createLearningExplanationHarness({ learningKeys: CANDIDATE_LEARNING_KEYS });
  try {
    assert.equal(harness.panel.update(patched, 0), 'REJECTED');
    assert.equal(harness.rows().length, 0);
    assert.equal(harness.panel.getStats().rejected, 1);
    assert.equal(harness.panel.getStats().writes, 0);
  } finally {
    harness.panel.dispose();
  }
});

test('104 the panel keeps one stable row per key and rewrites only changed text', () => {
  const harness = createLearningExplanationHarness();
  try {
    assert.equal(harness.panel.update(singleChange(1.5, 10), 0), 'ACCEPTED');
    assert.equal(harness.rows().length, 1);
    const row = harness.rowFor('following_time_headway'),
      writes = harness.panel.getStats().writes,
      field = harness.fieldOf('following_time_headway', 'Valoare');
    assert.equal(field.textContent, '1.8 s → 1.5 s');
    assert.equal(
      harness.fieldOf('following_time_headway', 'Dovezi').textContent,
      '3 episoade efective',
    );
    assert.equal(harness.identityValue('Job').textContent, 'job:104:segment:104:headway:7');
    assert.equal(harness.identityValue('Segment').textContent, 'segment:104:headway');
    assert.equal(harness.identityValue('Profil').textContent, 'style:104');
    assert.equal(harness.identityValue('Epocă învățare').textContent, '4');
    assert.equal(harness.identityValue('Mod').textContent, 'LEARNING');
    assert.equal(harness.versionLine().textContent, 'Versiune: style:104:v2~103.7');
    assert.equal(harness.panel.update(singleChange(1.5, 10), 400), 'UNCHANGED');
    assert.equal(harness.panel.getStats().writes, writes);
    assert.equal(harness.panel.update(singleChange(1.4, 11), 500), 'ACCEPTED');
    assert.equal(harness.rows().length, 1);
    assert.equal(harness.rowFor('following_time_headway'), row);
    assert.equal(harness.fieldOf('following_time_headway', 'Valoare').textContent, '1.8 s → 1.4 s');
    assert.equal(harness.panel.getStats().rows, 1);
  } finally {
    harness.panel.dispose();
  }
});

test('104 the panel explains a no-change without a version and with the exact sentence', () => {
  const job = noEvidenceJob(),
    snapshot = readLearningExplanation(
      { job, outcome: explanationOutcome(job, job.baseValue) },
      { tick: 21 },
    ),
    harness = createLearningExplanationHarness();
  try {
    assert.equal(harness.panel.update(snapshot, 0), 'ACCEPTED');
    assert.equal(harness.rows().length, 0);
    assert.equal(
      harness.versionLine().textContent,
      `Versiune: ${LEARNING_EXPLANATION_NO_VERSION_TEXT}`,
    );
    assert.ok(harness.noChange().textContent.includes(LEARNING_EXPLANATION_NO_CHANGE_TEXT));
    assert.ok(harness.noChange().textContent.includes('following_time_headway'));
    assert.equal(harness.noChange().hasAttribute('hidden'), false);
    assert.equal(harness.missingItems().length, snapshot.missingContexts.length);
    assert.equal(harness.missingItems()[0]!.textContent, snapshot.missingContexts[0]);
    assert.equal(harness.root().getAttribute('data-status'), 'NO_CHANGE');
    assert.equal(harness.root().getAttribute('data-no-version'), 'true');
    assert.equal(harness.root().getAttribute('data-version'), '');
    assert.equal(harness.root().getAttribute('data-published'), 'false');
    assert.equal(harness.root().getAttribute('data-success'), 'false');
    assert.equal(harness.root().getAttribute('data-changes'), '0');
    assert.ok(harness.summary().textContent.includes(LEARNING_EXPLANATION_NO_CHANGE_TEXT));
  } finally {
    harness.panel.dispose();
  }
});

test('104 writes are capped at 10 Hz while a status change bypasses the ceiling', () => {
  const harness = createLearningExplanationHarness();
  try {
    for (let index = 0; index < 20; index += 1) {
      harness.panel.update(singleChange(1.5 + index / 100, 10 + index), index * 16);
    }
    const stats = harness.panel.getStats();
    assert.ok(stats.updates <= 4, `20 frames at 16 ms produced ${stats.updates} renders`);
    assert.ok(stats.skipped >= 15, `skipped ${stats.skipped}`);
    const job = explanationJob(),
      error = readLearningExplanation(
        { job, outcome: explanationFailure(job, 'error', 'RESULT_INVALID', 'boom') },
        { tick: 200 },
      );
    assert.equal(harness.panel.update(error, 320), 'ACCEPTED');
    assert.equal(harness.panel.getStats().updates, stats.updates + 1);
    assert.equal(harness.root().getAttribute('data-status'), 'ERROR');
    assert.equal(harness.rows().length, 0);
    assert.ok(harness.failure().textContent.includes('RESULT_INVALID'));
    assert.equal(harness.failure().hasAttribute('hidden'), false);
    assert.equal(harness.root().getAttribute('data-success'), 'false');
  } finally {
    harness.panel.dispose();
  }
});

test('104 malformed and stale frames never touch the DOM', () => {
  const harness = createLearningExplanationHarness();
  try {
    harness.panel.update(singleChange(1.5, 10), 0);
    const writes = harness.panel.getStats().writes,
      dom = harness.dom(),
      snapshot = singleChange(1.5, 10);
    assert.equal(harness.panel.update({ ...snapshot, summary: 'inventat' }, 20), 'REJECTED');
    assert.equal(harness.panel.update({ ...snapshot, changes: [] }, 20), 'REJECTED');
    assert.equal(harness.panel.update(singleChange(1.4, 5), 20), 'STALE');
    assert.equal(harness.panel.getStats().writes, writes);
    assert.equal(harness.dom(), dom);
    assert.equal(harness.panel.getStats().rejected, 2);
    assert.equal(harness.panel.getStats().stale, 1);
    assert.equal(harness.fieldOf('following_time_headway', 'Valoare').textContent, '1.8 s → 1.5 s');
  } finally {
    harness.panel.dispose();
  }
});

test('104 no fabricated values: a null or missing input is never a default', () => {
  const snapshot = singleChange(),
    frame = frameOf(snapshot),
    change = firstChange(snapshot);
  assert.throws(
    () =>
      createLearningExplanationSnapshot({
        ...frame,
        changes: [{ ...change, previous: null as unknown as number }],
      }),
    /previous value must be finite/,
  );
  const job = explanationJob(),
    withoutComposition = readLearningExplanation(
      { job, outcome: { ...explanationOutcome(job, 1.5), composition: null } },
      { tick: 22 },
    );
  assert.equal(withoutComposition.status, 'ERROR');
  assert.equal(withoutComposition.noChangeReason, 'RESULT_INVALID');
  assert.equal(withoutComposition.versionId, null);
  assert.equal(withoutComposition.changes.length, 0);
  const harness = createLearningExplanationHarness();
  try {
    assert.equal(
      harness.panel.update({ ...frame, changes: [{ ...change, previous: null }] }, 0),
      'REJECTED',
    );
    assert.equal(harness.rows().length, 0);
    assert.equal(harness.panel.getStats().writes, 0);
  } finally {
    harness.panel.dispose();
  }
});

test('104 disposal is bounded and idempotent and owns no key listener', () => {
  const harness = createLearningExplanationHarness();
  harness.panel.update(singleChange(), 0);
  assert.equal(harness.panel.getStats().keyListeners, 0);
  assert.equal(harness.panel.getStats().listeners, 0);
  assert.equal(harness.panel.getStats().elements > 0, true);
  harness.panel.dispose();
  const stats = harness.panel.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.elements, 0);
  assert.equal(stats.rows, 0);
  assert.equal(harness.host.children.length, 0);
  assert.equal(harness.panel.getView(), null);
  harness.panel.dispose();
  assert.throws(() => harness.panel.update(singleChange(), 10), /disposed/);
});

test('104 the contract versions, statuses and limits are fixed', () => {
  assert.equal(LEARNING_EXPLANATION_VERSION, '104-learning-explanation-v1');
  assert.deepEqual(
    [...learningExplanationStatuses],
    ['CHANGED', 'NO_CHANGE', 'INSUFFICIENT_EVIDENCE', 'REJECTED', 'ERROR'],
  );
  assert.equal(LEARNING_EXPLANATION_LIMITS.maximumHz, 10);
  assert.equal(LEARNING_EXPLANATION_LIMITS.changes, 24);
  assert.equal(LEARNING_EXPLANATION_NO_VERSION_TEXT, 'Nicio versiune nouă');
  const snapshot = singleChange();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.changes), true);
  assert.equal(Object.isFrozen(firstChange(snapshot).contexts), true);
  assert.equal(projectLearningExplanation(snapshot).signature, snapshot.signature);
});

test('104 committed evidence report is the current deterministic transcript', () => {
  const committed = readFileSync(
      join('Docs', 'Evidence', '104-learning-explanation', 'report.json'),
      'utf8',
    ),
    report = runLearningExplanationReport();
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, committed);
  assert.equal(report.summary.pass, true);
  assert.equal(report.scenarios.length, 7);
  assert.ok(report.checks.length >= 25);
});
