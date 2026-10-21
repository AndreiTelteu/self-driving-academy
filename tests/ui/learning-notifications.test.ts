import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  isStaleNotification,
  learningNotificationEventId,
  learningNotificationGenerationKey,
  learningNotificationJobKey,
  missingObservationsFromEvidence,
  notificationCurrentJob,
  notificationFromAdmission,
  notificationFromMissingEvidence,
  notificationFromOutcome,
  notificationFromPublication,
} from '../../src/app';
import {
  LEARNING_NOTIFICATION_LIMITS,
  LEARNING_NOTIFICATION_VERSION,
  createLearningNotificationState,
  learningNotificationKindView,
  learningNotificationKinds,
  parseLearningNotificationEvent,
  reduceLearningNotifications,
} from '../../src/ui';
import type { LearningNotificationPublicationPayload } from '../../src/app';
import type { LearningNotificationEvent } from '../../src/ui';
import { runLearningNotificationsReport } from '../app/learning-notifications-report';
import {
  NOTIFICATION_SESSION,
  NOTIFICATION_WORLD_EPOCH,
  composedOutcome,
  createLearningNotificationsHarness,
  evidenceRead,
  failedOutcome,
  learningJob,
} from './learning-notifications-fixture';

function eventIdOf(job: ReturnType<typeof learningJob>, suffix: string): string {
  return learningNotificationEventId(job, suffix);
}

function resultEvent(
  job: ReturnType<typeof learningJob>,
  value: number,
  suffix = 'result',
): LearningNotificationEvent {
  return notificationFromOutcome(job, composedOutcome(job, value), {
    eventId: eventIdOf(job, suffix),
    tick: 10,
  });
}

function publicationPayload(
  job: ReturnType<typeof learningJob>,
): LearningNotificationPublicationPayload {
  return {
    publicationVersionId: 'style:079:v3',
    published: true,
    profileId: job.profileId,
    key: job.key,
    previousValue: 1.8,
    value: 1.5,
    segmentId: job.segmentId,
    jobKey: learningNotificationJobKey(job),
    generationKey: learningNotificationGenerationKey(job),
    learningEpoch: job.learningEpoch,
    order: job.order,
    mode: job.mode,
    sessionId: NOTIFICATION_SESSION,
    worldEpoch: NOTIFICATION_WORLD_EPOCH,
    tick: 50,
  };
}

test('079 a composed candidate is a validated candidate, never a publication', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness({ current: () => notificationCurrentJob(job) });
  try {
    const pushed = harness.notifications.push(resultEvent(job, 1.5), 0),
      view = harness.notifications.getView(),
      item = view.notifications[0]!,
      row = harness.itemFor(eventIdOf(job, 'result'));
    assert.equal(pushed.status, 'ACCEPTED');
    assert.equal(item.kind, 'RESULT');
    assert.equal(item.title, 'Candidat validat, nepublicat');
    assert.equal(item.published, false);
    assert.equal(item.success, false);
    assert.equal(view.counts.published, 0);
    assert.equal(item.soundCue, 'SUCCESS');
    assert.match(item.text, /1\.8 s → 1\.5 s/);
    assert.equal(row.getAttribute('data-published'), 'false');
    assert.equal(row.getAttribute('data-success'), 'false');
    assert.equal(row.getAttribute('data-kind'), 'RESULT');
  } finally {
    harness.notifications.dispose();
  }
});

test('079 a composed outcome without an actual change is NO_CHANGE', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness();
  try {
    const pushed = harness.notifications.push(
      notificationFromOutcome(job, composedOutcome(job, job.baseValue), {
        eventId: '079:nochange',
        tick: 10,
      }),
      0,
    );
    const item = harness.notifications.getView().notifications[0]!;
    assert.equal(pushed.status, 'ACCEPTED');
    assert.equal(item.kind, 'NO_CHANGE');
    assert.equal(item.title, 'Nicio modificare justificată');
    assert.equal(item.published, false);
    assert.equal(item.soundCue, 'NONE');
    assert.match(item.text, /Nicio modificare justificată/);
    assert.ok(item.text.includes('Interval temporal țintă față de lider'));
    assert.ok(item.text.includes(job.segmentId));
  } finally {
    harness.notifications.dispose();
  }
});

test('079 a worker error keeps its real reason and is never displayed as published', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness();
  try {
    harness.notifications.push(
      notificationFromOutcome(
        job,
        failedOutcome(job, 'error', 'RESULT_INVALID', 'Malformed estimator result'),
        { eventId: '079:error', tick: 10 },
      ),
      0,
    );
    const view = harness.notifications.getView(),
      item = view.notifications[0]!,
      row = harness.itemFor('079:error');
    assert.equal(item.kind, 'ERROR');
    assert.equal(item.title, 'Eroare de analiză');
    assert.equal(item.soundCue, 'ERROR');
    assert.ok(item.text.includes('RESULT_INVALID'));
    assert.ok(item.text.includes('Malformed estimator result'));
    assert.equal(item.text.includes('Profil publicat'), false);
    assert.equal(item.published, false);
    assert.equal(item.success, false);
    assert.equal(view.counts.published, 0);
    assert.equal(row.getAttribute('data-published'), 'false');
    assert.equal(row.getAttribute('data-sound'), 'ERROR');
  } finally {
    harness.notifications.dispose();
  }
});

test('079 rejected, cancelled and invalidated outcomes stay non-success', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness();
  try {
    harness.notifications.push(
      notificationFromOutcome(job, failedOutcome(job, 'rejected', 'COMPOSITION_REJECTED'), {
        eventId: '079:rejected',
        tick: 10,
      }),
      0,
    );
    harness.notifications.push(
      notificationFromOutcome(job, failedOutcome(job, 'cancelled'), {
        eventId: '079:cancelled',
        tick: 11,
      }),
      10,
    );
    harness.notifications.push(
      notificationFromOutcome(job, failedOutcome(job, 'invalidated', 'GENERATION_INVALIDATED'), {
        eventId: '079:invalidated',
        tick: 12,
      }),
      20,
    );
    const view = harness.notifications.getView(),
      kinds = view.notifications.map((item) => item.kind);
    assert.deepEqual(kinds, ['REJECTED', 'CANCELLED', 'INVALIDATED']);
    assert.equal(view.counts.errors, 3);
    assert.equal(view.counts.published, 0);
    for (const item of view.notifications) {
      assert.equal(item.published, false);
      assert.equal(item.success, false);
    }
    assert.ok(view.notifications[0]!.text.includes('COMPOSITION_REJECTED'));
    assert.ok(view.notifications[1]!.text.includes('Analiză anulată'));
  } finally {
    harness.notifications.dispose();
  }
});

test('079 a late result for another segment/job/epoch is STALE and never the current result', () => {
  const current = learningJob({ segmentId: 'segment:079:current', order: 10 }),
    late = learningJob({ segmentId: 'segment:079:late', order: 11, learningEpoch: 5 }),
    harness = createLearningNotificationsHarness({
      current: () => notificationCurrentJob(current),
    });
  try {
    const outcome = composedOutcome(late, 1.4),
      event = notificationFromOutcome(late, outcome, { eventId: '079:late', tick: 10 }),
      stale = notificationFromOutcome(
        late,
        outcome,
        { eventId: '079:late:detected', tick: 10 },
        notificationCurrentJob(current),
      );
    assert.equal(isStaleNotification(event, notificationCurrentJob(current)), true);
    assert.equal(isStaleNotification(event, notificationCurrentJob(late)), false);
    assert.equal(stale.kind, 'STALE');
    assert.notEqual(stale.eventId, event.eventId);
    assert.equal(stale.eventId.endsWith(':stale'), true);
    const pushed = harness.notifications.push(event, 0);
    const view = harness.notifications.getView(),
      item = view.notifications[0]!;
    assert.equal(pushed.status, 'STALE');
    assert.equal(item.kind, 'STALE');
    assert.equal(item.title, 'Rezultat întârziat ignorat');
    assert.equal(item.soundCue, 'NONE');
    assert.equal(item.published, false);
    assert.equal(view.counts.stale, 1);
    assert.equal(view.counts.results, 0);
    assert.equal(item.text.includes('segment:079:current'), false);
    assert.ok(item.text.includes('segment:079:late'));
  } finally {
    harness.notifications.dispose();
  }
});

test('079 every notification is bound to its segment and job in text and attributes', () => {
  const job = learningJob({ segmentId: 'segment:079:binding', order: 6 }),
    harness = createLearningNotificationsHarness();
  try {
    harness.notifications.push(resultEvent(job, 1.5), 0);
    const item = harness.notifications.getView().notifications[0]!,
      row = harness.itemFor(eventIdOf(job, 'result'));
    assert.ok(item.text.includes(job.segmentId));
    assert.ok(item.text.includes(learningNotificationJobKey(job)));
    assert.equal(row.getAttribute('data-segment'), job.segmentId);
    assert.equal(row.getAttribute('data-job'), learningNotificationJobKey(job));
    assert.equal(row.getAttribute('data-generation'), learningNotificationGenerationKey(job));
    assert.equal(row.getAttribute('data-profile'), job.profileId);
    assert.equal(row.getAttribute('data-learning-epoch'), String(job.learningEpoch));
    assert.equal(row.getAttribute('data-session'), job.sessionId);
    assert.equal(row.getAttribute('data-world-epoch'), String(job.worldEpoch));
    assert.equal(row.getAttribute('data-order'), String(job.order));
    assert.equal(row.getAttribute('data-mode'), 'LEARNING');
  } finally {
    harness.notifications.dispose();
  }
});

test('079 missing evidence names the concrete keys, states and real episode counts', () => {
  const job = learningJob(),
    missing = missingObservationsFromEvidence([
      evidenceRead('following_time_headway', 'INSUFFICIENT', 2),
      evidenceRead('stop_full_probability', 'NO_EVIDENCE', 0),
      evidenceRead('red_stop_probability', 'READY', 4),
      {
        key: 'green_start_delay',
        evidence: evidenceRead('green_start_delay', 'INSUFFICIENT', 1),
        state: 'WEAK',
      },
      { key: 'lane_change_front_gap', state: 'UNOBSERVED', distinctEpisodes: 0 },
      { key: 'not_a_parameter', evidence: null },
    ]),
    harness = createLearningNotificationsHarness();
  try {
    assert.equal(missing.length, 4);
    assert.deepEqual(
      missing.map((row) => row.key),
      [
        'following_time_headway',
        'green_start_delay',
        'lane_change_front_gap',
        'stop_full_probability',
      ],
    );
    assert.equal(missing[0]!.episodes, 2);
    assert.equal(missing[0]!.state, 'WEAK');
    harness.notifications.push(
      notificationFromMissingEvidence(job, missing, { eventId: '079:missing', tick: 10 }),
      0,
    );
    const item = harness.notifications.getView().notifications[0]!,
      rowMissing = harness.missingOf('079:missing');
    assert.equal(item.kind, 'INSUFFICIENT_EVIDENCE');
    assert.ok(item.text.includes('Lipsesc dovezi:'));
    assert.ok(item.text.includes('following_time_headway (2 episoade, WEAK)'));
    assert.ok(item.text.includes('stop_full_probability (0 episoade, UNOBSERVED)'));
    assert.equal(rowMissing.length, 4);
    assert.equal(rowMissing[0]!.getAttribute('data-state'), 'WEAK');
    assert.equal(rowMissing[0]!.textContent, 'following_time_headway (2 episoade, WEAK)');
    assert.throws(() => notificationFromMissingEvidence(job, [], { eventId: 'x', tick: 1 }));
  } finally {
    harness.notifications.dispose();
  }
});

test('079 the same segment/job/kind is deduplicated inside the bounded window', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness({ dedupeWindowMs: 1000 });
  try {
    const statuses: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      statuses.push(
        harness.notifications.push(
          notificationFromOutcome(job, composedOutcome(job, 1.5 + index / 100), {
            eventId: `079:dedupe:${index}`,
            tick: 10 + index,
          }),
          index * 10,
        ).status,
      );
    }
    const view = harness.notifications.getView(),
      dom = harness.dom();
    assert.equal(view.notifications.length, 1);
    assert.equal(view.counts.deduped, 4);
    assert.deepEqual(statuses.slice(1), ['DEDUPED', 'DEDUPED', 'DEDUPED', 'DEDUPED']);
    assert.equal(harness.items().length, 1);
    const late = harness.notifications.push(
      notificationFromOutcome(job, composedOutcome(job, 1.7), {
        eventId: '079:dedupe:later',
        tick: 20,
      }),
      1_500,
    );
    assert.equal(late.status, 'ACCEPTED');
    assert.equal(harness.notifications.getView().notifications.length, 2);
    assert.equal(harness.dom().includes('079:dedupe:later'), true);
    assert.ok(dom.includes('079:dedupe:0'));
  } finally {
    harness.notifications.dispose();
  }
});

test('079 at most three notifications stay visible and the oldest is evicted', () => {
  const harness = createLearningNotificationsHarness();
  try {
    for (let index = 0; index < 5; index += 1) {
      const job = learningJob({ segmentId: `segment:079:cap:${index}`, order: 20 + index });
      harness.notifications.push(resultEvent(job, 1.5, `cap:${index}`), index * 10);
    }
    const view = harness.notifications.getView();
    assert.equal(view.notifications.length, 3);
    assert.equal(view.maxActive, 3);
    assert.equal(view.counts.evicted, 2);
    assert.equal(harness.items().length, 3);
    assert.deepEqual(
      view.notifications.map((item) => item.segmentId),
      ['segment:079:cap:2', 'segment:079:cap:3', 'segment:079:cap:4'],
    );
  } finally {
    harness.notifications.dispose();
  }
});

test('079 notifications expire with the injected clock and never grow a history', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness({ ttlMs: 1000, staleTtlMs: 400 });
  try {
    harness.notifications.push(resultEvent(job, 1.5), 0);
    assert.equal(harness.notifications.getView().notifications.length, 1);
    harness.notifications.update(999);
    assert.equal(harness.notifications.getView().notifications.length, 1);
    harness.notifications.update(1000);
    const view = harness.notifications.getView();
    assert.equal(view.notifications.length, 0);
    assert.equal(view.counts.expired, 1);
    assert.equal(harness.items().length, 0);
    assert.equal(harness.notifications.getStats().active, 0);
  } finally {
    harness.notifications.dispose();
  }
});

test('079 the visual text always exists and the sound is only an optional port', () => {
  const job = learningJob(),
    cues: string[] = [],
    harness = createLearningNotificationsHarness({
      announce: (cue) => {
        cues.push(cue);
        throw new Error('audio blocked');
      },
    });
  try {
    harness.notifications.push(
      notificationFromAdmission(
        { status: 'QUEUED', reason: null, detail: null, ticket: null },
        job,
        { eventId: '079:analyzing', tick: 1 },
      ),
      0,
    );
    const item = harness.notifications.getView().notifications[0]!;
    assert.equal(item.kind, 'ANALYZING');
    assert.equal(item.soundCue, 'NONE');
    assert.ok(item.symbol.length > 0);
    assert.ok(item.text.length > 0);
    assert.ok(harness.dom().includes('Analiză în curs'));
    assert.deepEqual(cues, []);
    harness.notifications.push(
      notificationFromOutcome(job, composedOutcome(job, 1.5), {
        eventId: '079:visual',
        tick: 2,
      }),
      10,
    );
    assert.deepEqual(cues, ['SUCCESS']);
    const stats = harness.notifications.getStats();
    assert.equal(stats.announced, 0);
    assert.equal(stats.announceFailures, 1);
    assert.equal(harness.itemFor('079:visual').getAttribute('data-sound'), 'SUCCESS');
  } finally {
    harness.notifications.dispose();
  }
});

test('079 writes are capped at 10 Hz while a new kind or segment bypasses the ceiling', () => {
  const harness = createLearningNotificationsHarness();
  try {
    for (let index = 0; index < 20; index += 1) {
      const job = learningJob({ segmentId: 'segment:079:rate', order: 100 + index });
      harness.notifications.push(resultEvent(job, 1.5, `rate:${index}`), index * 16);
    }
    const stats = harness.notifications.getStats();
    assert.ok(stats.updates <= 4, `20 events at 16 ms produced ${stats.updates} renders`);
    assert.ok(stats.skipped >= 15, `skipped ${stats.skipped}`);
    const before = stats.updates,
      errorJob = learningJob({ segmentId: 'segment:079:rate', order: 300 });
    harness.notifications.push(
      notificationFromOutcome(errorJob, failedOutcome(errorJob, 'error', 'RESULT_INVALID'), {
        eventId: '079:rate:error',
        tick: 400,
      }),
      320,
    );
    assert.equal(harness.notifications.getStats().updates, before + 1);
    harness.notifications.update(500);
    assert.equal(harness.itemFor('079:rate:error').getAttribute('data-kind'), 'ERROR');
  } finally {
    harness.notifications.dispose();
  }
});

test('079 an identical push writes nothing at all', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness(),
    event = resultEvent(job, 1.5);
  try {
    harness.notifications.push(event, 0);
    const writes = harness.notifications.getStats().writes,
      dom = harness.dom(),
      updates = harness.notifications.getStats().updates;
    const repeat = harness.notifications.push(event, 50);
    assert.equal(repeat.status, 'UNCHANGED');
    assert.equal(harness.notifications.getStats().writes, writes);
    assert.equal(harness.notifications.getStats().updates, updates);
    assert.equal(harness.notifications.getStats().skipped, 1);
    assert.equal(harness.dom(), dom);
  } finally {
    harness.notifications.dispose();
  }
});

test('079 malformed events never touch the DOM', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness();
  try {
    harness.notifications.push(resultEvent(job, 1.5), 0);
    const writes = harness.notifications.getStats().writes,
      dom = harness.dom(),
      malformed = [
        { kind: 'ERROR' },
        { ...resultEvent(job, 1.5), extra: true },
        { ...resultEvent(job, 1.5), tick: Number.NaN },
        { ...resultEvent(job, 1.5), value: 1.8 },
      ];
    const statuses = malformed.map((event) => harness.notifications.push(event, 20).status);
    assert.deepEqual(statuses, ['REJECTED', 'REJECTED', 'REJECTED', 'REJECTED']);
    assert.equal(harness.notifications.getStats().rejected, 4);
    assert.equal(harness.notifications.getStats().writes, writes);
    assert.equal(harness.dom(), dom);
  } finally {
    harness.notifications.dispose();
  }
});

test('079 disposal is bounded and idempotent and owns no key listener', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness({ dismissible: true });
  try {
    harness.notifications.push(resultEvent(job, 1.5), 0);
    const button = harness
      .itemFor(eventIdOf(job, 'result'))
      .children.find((child) => child.tagName === 'button');
    assert.ok(button);
    assert.equal(button!.getAttribute('type'), 'button');
    assert.equal(button!.getAttribute('tabindex'), '-1');
    assert.equal(harness.notifications.getStats().keyListeners, 0);
    button!.dispatch('click');
    assert.equal(harness.notifications.getStats().dismissed, 1);
    assert.equal(harness.items().length, 0);
    const dismissed = harness.notifications.dismiss(eventIdOf(job, 'result'));
    assert.equal(dismissed, false);
    harness.notifications.dispose();
    const stats = harness.notifications.getStats();
    assert.equal(harness.notifications.getView().notifications.length, 0);
    assert.equal(stats.disposed, true);
    assert.equal(stats.elements, 0);
    assert.equal(harness.host.children.length, 0);
    harness.notifications.dispose();
    assert.throws(() => harness.notifications.push(resultEvent(job, 1.5), 10), /disposed/);
  } finally {
    harness.notifications.dispose();
  }
});

test('079 the parser rejects unknown, duplicated, unbounded and contradictory events', () => {
  const job = learningJob(),
    valid = resultEvent(job, 1.5);
  assert.equal(parseLearningNotificationEvent(valid).kind, 'RESULT');
  assert.throws(() => parseLearningNotificationEvent({ ...valid, extra: true }), /fields/);
  assert.throws(() => parseLearningNotificationEvent({ ...valid, kind: 'UNKNOWN' }), /kind/);
  assert.throws(
    () => parseLearningNotificationEvent({ ...valid, tick: Number.POSITIVE_INFINITY }),
    /tick/,
  );
  assert.throws(() => parseLearningNotificationEvent({ ...valid, tick: -1 }), /tick/);
  assert.throws(
    () => parseLearningNotificationEvent({ ...valid, eventId: 'x'.repeat(129) }),
    /event id/,
  );
  assert.throws(
    () =>
      parseLearningNotificationEvent({
        ...valid,
        value: valid.kind === 'RESULT' ? valid.previousValue : 0,
      }),
    /NO_CHANGE/,
  );
  assert.throws(() => parseLearningNotificationEvent({ ...valid, kind: 'PUBLISHED' }), /fields/);
  const missing = notificationFromMissingEvidence(
    job,
    [
      {
        key: 'following_time_headway',
        label: 'Distanța în mers',
        state: 'WEAK',
        episodes: 2,
      },
    ],
    { eventId: '079:parser:missing', tick: 1 },
  );
  assert.throws(
    () =>
      parseLearningNotificationEvent({
        ...missing,
        missing: [
          { key: 'following_time_headway', label: 'x', state: 'WEAK', episodes: 2 },
          { key: 'following_time_headway', label: 'x', state: 'WEAK', episodes: 2 },
        ],
      }),
    /duplicate/,
  );
  assert.equal(Object.isFrozen(parseLearningNotificationEvent(valid)), true);
});

test('079 only an explicit publication payload may say Profil publicat', () => {
  const job = learningJob(),
    harness = createLearningNotificationsHarness();
  try {
    const published = notificationFromPublication(publicationPayload(job), {
      eventId: '079:published',
    });
    assert.equal(published.kind, 'PUBLISHED');
    harness.notifications.push(published, 0);
    const view = harness.notifications.getView(),
      item = view.notifications[0]!;
    assert.equal(item.published, true);
    assert.equal(item.success, true);
    assert.equal(item.soundCue, 'SUCCESS');
    assert.ok(item.text.includes('Profil publicat'));
    assert.ok(item.text.includes('style:079:v3'));
    assert.equal(view.counts.published, 1);
    assert.equal(harness.itemFor('079:published').getAttribute('data-published'), 'true');
    assert.throws(
      () =>
        notificationFromPublication(
          { ...publicationPayload(job), published: false as true },
          { eventId: '079:fake' },
        ),
      /explicit published payload/,
    );
    assert.throws(
      () =>
        parseLearningNotificationEvent({
          ...published,
          published: false,
          publicationVersionId: 'style:079:v4',
        }),
      /publication payload/,
    );
    harness.notifications.push(
      notificationFromOutcome(job, failedOutcome(job, 'error', 'RESULT_INVALID'), {
        eventId: '079:published:error',
        tick: 60,
      }),
      10,
    );
    assert.equal(harness.notifications.getView().counts.published, 1);
    assert.equal(
      harness.notifications.getView().notifications.filter((entry) => entry.published).length,
      1,
    );
  } finally {
    harness.notifications.dispose();
  }
});

test('079 admission maps QUEUED to ANALYZING and refusals to REJECTED', () => {
  const job = learningJob();
  const analyzing = notificationFromAdmission(
    { status: 'QUEUED', reason: null, detail: null, ticket: null },
    job,
    { eventId: '079:queued', tick: 1 },
  );
  assert.equal(analyzing.kind, 'ANALYZING');
  const rejected = notificationFromAdmission(
    { status: 'REJECTED', reason: 'MANUAL_SEGMENT_NOT_LEARNABLE', detail: 'manual', ticket: null },
    job,
    { eventId: '079:rejected:admission', tick: 2 },
  );
  assert.equal(rejected.kind, 'REJECTED');
  assert.equal(rejected.kind === 'REJECTED' ? rejected.reason : '', 'MANUAL_SEGMENT_NOT_LEARNABLE');
  const backpressure = notificationFromAdmission(
    { status: 'BACKPRESSURE', reason: 'QUEUE_FULL', detail: 'full', ticket: null },
    job,
    { eventId: '079:backpressure', tick: 3 },
  );
  assert.equal(backpressure.kind, 'REJECTED');
  assert.equal(backpressure.kind === 'REJECTED' ? backpressure.reason : '', 'QUEUE_FULL');
});

test('079 the reducer is pure and its state stays bounded', () => {
  const job = learningJob(),
    policy = { maxActive: 3, dedupeWindowMs: 1000, ttlMs: 5000, staleTtlMs: 1000, current: null },
    start = createLearningNotificationState(policy);
  let state = start;
  for (let index = 0; index < 12; index += 1) {
    const next = learningJob({ segmentId: `segment:079:pure:${index}`, order: index + 1 });
    state = reduceLearningNotifications(
      state,
      resultEvent(next, 1.5, `pure:${index}`),
      index * 10,
      policy,
    );
  }
  assert.equal(Object.isFrozen(state), true);
  assert.equal(start.entries.length, 0, 'the reducer never mutates the previous state');
  assert.equal(state.entries.length, 3);
  assert.equal(state.seen.length, 12);
  assert.ok(state.seen.length <= LEARNING_NOTIFICATION_LIMITS.seenKeys);
  assert.ok(state.eventIds.length <= LEARNING_NOTIFICATION_LIMITS.eventIds);
  assert.equal(state.counters.evicted, 9);
  assert.throws(
    () => reduceLearningNotifications(state, resultEvent(job, 1.5), 0, policy),
    /backwards/,
  );
});

test('079 every kind has a visual symbol and text and only PUBLISHED is a success', () => {
  for (const kind of learningNotificationKinds) {
    const view = learningNotificationKindView(kind);
    assert.ok(view.symbol.length > 0, kind);
    assert.ok(view.title.length > 0, kind);
    assert.equal(view.success, kind === 'PUBLISHED', kind);
  }
  assert.equal(LEARNING_NOTIFICATION_VERSION, '079-learning-notifications-v1');
  assert.equal(LEARNING_NOTIFICATION_LIMITS.maxActive, 3);
  assert.equal(LEARNING_NOTIFICATION_LIMITS.maximumHz, 10);
});

test('079 committed evidence report is the current deterministic transcript', () => {
  const committed = readFileSync(
      join('Docs', 'Evidence', '079-learning-notifications', 'report.json'),
      'utf8',
    ),
    report = runLearningNotificationsReport();
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, committed);
  assert.equal(report.summary.pass, true);
  assert.equal(report.scenarios.length, 7);
  assert.ok(report.checks.length >= 25);
});
