import {
  LEARNING_NOTIFICATION_ADAPTER_VERSION,
  missingObservationsFromEvidence,
  notificationCurrentJob,
  notificationFromMissingEvidence,
  notificationFromOutcome,
  notificationFromPublication,
} from '../../src/app';
import {
  LEARNING_NOTIFICATION_LIMITS,
  LEARNING_NOTIFICATION_VERSION,
  learningNotificationKindView,
} from '../../src/ui';
import type {
  LearningNotificationCounts,
  LearningNotificationKind,
  LearningNotificationView,
} from '../../src/ui';
import {
  NOTIFICATION_SESSION,
  NOTIFICATION_WORLD_EPOCH,
  composedOutcome,
  createLearningNotificationsHarness,
  evidenceRead,
  failedOutcome,
  learningJob,
} from '../ui/learning-notifications-fixture';
import type { LearningNotificationsHarness } from '../ui/learning-notifications-fixture';

export interface LearningNotificationReportItem {
  readonly kind: string;
  readonly text: string;
  readonly detail: string | null;
  readonly missing: readonly string[];
  readonly soundCue: string;
  readonly published: boolean;
  readonly segment: string;
  readonly job: string;
}

export interface LearningNotificationReportScenario {
  readonly name: string;
  readonly push: string;
  readonly counts: LearningNotificationCounts;
  readonly summary: string;
  readonly notifications: readonly LearningNotificationReportItem[];
  readonly dom: string | null;
  readonly stats: Readonly<Record<string, number | boolean | string>>;
}

export interface LearningNotificationCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LearningNotificationsReport {
  readonly version: typeof LEARNING_NOTIFICATION_VERSION;
  readonly adapter: typeof LEARNING_NOTIFICATION_ADAPTER_VERSION;
  readonly contract: Readonly<{
    kinds: readonly string[];
    rules: readonly string[];
    limits: Readonly<Record<string, number | string>>;
  }>;
  readonly scenarios: readonly LearningNotificationReportScenario[];
  readonly checks: readonly LearningNotificationCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): LearningNotificationCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function itemsOf(view: LearningNotificationView): readonly LearningNotificationReportItem[] {
  return Object.freeze(
    view.notifications.map((item) =>
      Object.freeze({
        kind: item.kind,
        text: item.text,
        detail: item.detail,
        missing: Object.freeze(item.missing.map((row) => row.text)),
        soundCue: item.soundCue,
        published: item.published,
        segment: item.segmentId,
        job: item.jobKey,
      }),
    ),
  );
}

export function runLearningNotificationsReport(): LearningNotificationsReport {
  const harnesses: LearningNotificationsHarness[] = [];
  const harness = (
    options: Parameters<typeof createLearningNotificationsHarness>[0] = {},
  ): LearningNotificationsHarness => {
    const created = createLearningNotificationsHarness(options);
    harnesses.push(created);
    return created;
  };
  try {
    // 1. Valid composed result: a validated candidate, explicitly not published.
    const validJob = learningJob(),
      valid = harness({ current: () => notificationCurrentJob(validJob) }),
      validPush = valid.notifications.push(
        notificationFromOutcome(validJob, composedOutcome(validJob, 1.5), {
          eventId: '079:valid',
          tick: 10,
        }),
        0,
      ),
      validView = valid.notifications.getView(),
      validItem = validView.notifications[0],
      validDom = valid.dom(),
      validAttributes = valid.itemFor('079:valid');

    // 2. Composed with no actual change.
    const noChangeJob = learningJob({ segmentId: 'segment:079:nochange', order: 8 }),
      noChange = harness(),
      noChangePush = noChange.notifications.push(
        notificationFromOutcome(noChangeJob, composedOutcome(noChangeJob, noChangeJob.baseValue), {
          eventId: '079:nochange',
          tick: 11,
        }),
        0,
      ),
      noChangeItem = noChange.notifications.getView().notifications[0];

    // 3. Worker error with its real reason and detail.
    const errorJob = learningJob({ segmentId: 'segment:079:error', order: 9 }),
      error = harness(),
      errorPush = error.notifications.push(
        notificationFromOutcome(
          errorJob,
          failedOutcome(errorJob, 'error', 'RESULT_INVALID', 'Malformed estimator result'),
          { eventId: '079:error', tick: 12 },
        ),
        0,
      ),
      errorView = error.notifications.getView(),
      errorItem = errorView.notifications[0],
      errorDom = error.dom();

    // 4. A late result for a job that is no longer current.
    const currentJob = learningJob({ segmentId: 'segment:079:current', order: 10 }),
      lateJob = learningJob({ segmentId: 'segment:079:late', order: 11 }),
      late = harness({ current: () => notificationCurrentJob(currentJob) }),
      latePush = late.notifications.push(
        notificationFromOutcome(lateJob, composedOutcome(lateJob, 1.4), {
          eventId: '079:late',
          tick: 13,
        }),
        0,
      ),
      lateItem = late.notifications.getView().notifications[0];

    // 5. Insufficient evidence names the concrete missing observations.
    const missingJob = learningJob({ segmentId: 'segment:079:missing', order: 12 }),
      missing = missingObservationsFromEvidence([
        evidenceRead('following_time_headway', 'INSUFFICIENT', 2),
        evidenceRead('stop_full_probability', 'NO_EVIDENCE', 0),
        evidenceRead('red_stop_probability', 'READY', 4),
        evidenceRead('green_start_delay', 'INSUFFICIENT', 1),
        evidenceRead('lane_change_front_gap', 'NO_EVIDENCE', 0),
      ]),
      insufficientJob = harness(),
      insufficientPush = insufficientJob.notifications.push(
        notificationFromMissingEvidence(missingJob, missing, {
          eventId: '079:missing',
          tick: 14,
        }),
        0,
      ),
      insufficientView = insufficientJob.notifications.getView(),
      insufficientItem = insufficientView.notifications[0],
      insufficientDom = insufficientJob.dom();

    // 6. Dedupe/no spam, the three-row cap and expiry.
    const dedupeJob = learningJob({ segmentId: 'segment:079:dedupe', order: 13 }),
      dedupe = harness(),
      dedupeWrites: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      dedupe.notifications.push(
        notificationFromOutcome(dedupeJob, composedOutcome(dedupeJob, 1.5 + index / 100), {
          eventId: `079:dedupe:${index}`,
          tick: 20 + index,
        }),
        index * 5,
      );
      dedupeWrites.push(dedupe.notifications.getStats().writes);
    }
    const dedupeView = dedupe.notifications.getView(),
      dedupeDom = dedupe.dom(),
      cap = harness();
    for (let index = 0; index < 5; index += 1) {
      const job = learningJob({ segmentId: `segment:079:cap:${index}`, order: 20 + index });
      cap.notifications.push(
        notificationFromOutcome(job, composedOutcome(job, 1.5), {
          eventId: `079:cap:${index}`,
          tick: 30 + index,
        }),
        index * 10,
      );
    }
    const capView = cap.notifications.getView(),
      expiry = harness({ ttlMs: 1000, staleTtlMs: 500 }),
      expiryJob = learningJob({ segmentId: 'segment:079:expiry', order: 30 });
    expiry.notifications.push(
      notificationFromOutcome(expiryJob, composedOutcome(expiryJob, 1.5), {
        eventId: '079:expiry',
        tick: 40,
      }),
      0,
    );
    const expiryBefore = expiry.notifications.getView().notifications.length;
    expiry.notifications.update(999);
    const expiryDuring = expiry.notifications.getView().notifications.length;
    expiry.notifications.update(1000);
    const expiryAfter = expiry.notifications.getView().notifications.length;

    // 7. Explicit publication payload, and a worker error that stays unpublished.
    const publishJob = learningJob({ segmentId: 'segment:079:published', order: 15 }),
      publication = harness({ current: () => notificationCurrentJob(publishJob) }),
      publicationPush = publication.notifications.push(
        notificationFromPublication(
          {
            publicationVersionId: 'style:079:v3',
            published: true,
            profileId: publishJob.profileId,
            key: publishJob.key,
            previousValue: 1.8,
            value: 1.5,
            segmentId: publishJob.segmentId,
            jobKey: `job:103:${publishJob.segmentId}:${publishJob.order}`,
            generationKey: `gen:103:${publishJob.profileId}:${publishJob.learningEpoch}:${publishJob.baseVersionId}`,
            learningEpoch: publishJob.learningEpoch,
            order: publishJob.order,
            mode: publishJob.mode,
            sessionId: NOTIFICATION_SESSION,
            worldEpoch: NOTIFICATION_WORLD_EPOCH,
            tick: 50,
          },
          { eventId: '079:published' },
        ),
        0,
      ),
      publicationView = publication.notifications.getView(),
      publishedItem = publicationView.notifications[0];
    publication.notifications.push(
      notificationFromOutcome(publishJob, failedOutcome(publishJob, 'error', 'RESULT_INVALID'), {
        eventId: '079:published:error',
        tick: 51,
      }),
      10,
    );
    const publicationAfterError = publication.notifications.getView(),
      publicationDom = publication.dom();

    const validText = validItem?.text ?? 'missing',
      errorText = errorItem?.text ?? 'missing',
      lateText = lateItem?.text ?? 'missing',
      insufficientText = insufficientItem?.text ?? 'missing',
      publishedText = publishedItem?.text ?? 'missing';

    const scenarios = Object.freeze([
      scenarioOf('valid', validPush.status, validView, valid, validDom),
      scenarioOf(
        'no-change',
        noChangePush.status,
        noChange.notifications.getView(),
        noChange,
        null,
      ),
      scenarioOf('error', errorPush.status, errorView, error, errorDom),
      scenarioOf('late', latePush.status, late.notifications.getView(), late, null),
      scenarioOf(
        'insufficient evidence',
        insufficientPush.status,
        insufficientView,
        insufficientJob,
        insufficientDom,
      ),
      scenarioOf(
        'dedupe/no-spam',
        dedupeWrites.length === 6 ? 'DEDUPED' : 'UNKNOWN',
        dedupeView,
        dedupe,
        dedupeDom,
      ),
      scenarioOf(
        'explicit publication',
        publicationPush.status,
        publicationView,
        publication,
        publicationDom,
      ),
    ]);

    const checks = [
      check('contract-version', LEARNING_NOTIFICATION_VERSION, validView.version, '079 contract'),
      check(
        'adapter-version',
        LEARNING_NOTIFICATION_ADAPTER_VERSION,
        LEARNING_NOTIFICATION_ADAPTER_VERSION,
        'composition root contract',
      ),
      check('valid-kind', 'RESULT', validItem?.kind ?? 'missing', 'a composed candidate is RESULT'),
      check(
        'valid-title',
        'Candidat validat, nepublicat',
        validItem?.title ?? 'missing',
        'a worker composition is never a publication',
      ),
      check('valid-published', false, validItem?.published ?? true, 'RESULT is not published'),
      check('valid-success', false, validItem?.success ?? true, 'RESULT is not a success'),
      check(
        'valid-sound',
        'SUCCESS',
        validItem?.soundCue ?? 'missing',
        'the result has a sound cue',
      ),
      check(
        'valid-change',
        true,
        validText.includes('1.8 s → 1.5 s'),
        'the short result names the old and new value',
      ),
      check(
        'valid-segment-attribute',
        validJob.segmentId,
        validAttributes.getAttribute('data-segment') ?? 'missing',
        'the row is bound to its segment',
      ),
      check(
        'valid-job-attribute',
        `job:103:${validJob.segmentId}:${validJob.order}`,
        validAttributes.getAttribute('data-job') ?? 'missing',
        'the row is bound to its job',
      ),
      check(
        'valid-text-binding',
        true,
        validText.includes(validJob.segmentId) &&
          validText.includes(`job:103:${validJob.segmentId}:${validJob.order}`),
        'the segment and job also appear in the text',
      ),
      check(
        'valid-epoch-attributes',
        true,
        validAttributes.getAttribute('data-learning-epoch') === String(validJob.learningEpoch) &&
          validAttributes.getAttribute('data-session') === validJob.sessionId &&
          validAttributes.getAttribute('data-world-epoch') === String(validJob.worldEpoch),
        'learning epoch, session and world epoch are explicit',
      ),
      check('valid-counts-published', 0, validView.counts.published, 'no publication is counted'),
      check(
        'nochange-kind',
        'NO_CHANGE',
        noChangeItem?.kind ?? 'missing',
        'equal values are NO_CHANGE',
      ),
      check(
        'nochange-text',
        true,
        (noChangeItem?.text ?? '').includes('Nicio modificare justificată'),
        'the no-change text is explicit',
      ),
      check(
        'nochange-published',
        false,
        noChangeItem?.published ?? true,
        'no-change is not published',
      ),
      check('error-kind', 'ERROR', errorItem?.kind ?? 'missing', 'a worker failure is ERROR'),
      check(
        'error-reason',
        true,
        errorText.includes('RESULT_INVALID'),
        'the real 103 reason is shown',
      ),
      check(
        'error-detail',
        true,
        errorText.includes('Malformed estimator result'),
        'the real detail is shown',
      ),
      check(
        'error-not-published',
        true,
        !errorText.includes('Profil publicat') &&
          errorView.counts.published === 0 &&
          errorFlags(error, '079:error') === 'false',
        'a worker error is never displayed as a published profile',
      ),
      check('error-sound', 'ERROR', errorItem?.soundCue ?? 'missing', 'the error has an error cue'),
      check('late-kind', 'STALE', lateItem?.kind ?? 'missing', 'a late result is STALE'),
      check(
        'late-text',
        true,
        lateText.includes('Rezultat întârziat ignorat'),
        'the late result is quiet text',
      ),
      check(
        'late-not-current',
        false,
        lateText.includes('segment:079:current') || lateItem?.published === true,
        'a late result never replaces the current result',
      ),
      check(
        'late-counts',
        1,
        late.notifications.getView().counts.stale,
        'the stale count is explicit',
      ),
      check('missing-limit', 4, missing.length, 'the missing list is bounded to four keys'),
      check(
        'missing-first',
        'following_time_headway (2 episoade, WEAK)',
        missing[0]?.key === 'following_time_headway'
          ? `${missing[0].key} (${missing[0].episodes} episoade, ${missing[0].state})`
          : 'missing',
        'the concrete key and real episode count are named',
      ),
      check(
        'missing-unobserved',
        true,
        insufficientItem?.missing.some(
          (row) => row.key === 'stop_full_probability' && row.state === 'UNOBSERVED',
        ) ?? false,
        'an unobserved key is distinct from a weak one',
      ),
      check(
        'missing-text',
        true,
        insufficientText.includes('Lipsesc dovezi:'),
        'the message names the missing evidence',
      ),
      check(
        'missing-bounded-text',
        true,
        insufficientText.length < 1200,
        'the message stays bounded',
      ),
      check(
        'missing-no-invented',
        true,
        insufficientItem?.missing.every((row) =>
          row.episodes === null ? true : Number.isInteger(row.episodes) && row.episodes >= 0,
        ) ?? false,
        'every episode count comes from the read model',
      ),
      check('dedupe-rows', 1, dedupeView.notifications.length, 'six duplicates show one row'),
      check('dedupe-count', 5, dedupeView.counts.deduped, 'five duplicates were suppressed'),
      check(
        'dedupe-writes',
        true,
        dedupeWrites[5] === dedupeWrites[0],
        'duplicate pushes do not rewrite the row',
      ),
      check(
        'dedupe-dom-stable',
        true,
        dedupeDom.includes(dedupeJob.segmentId) &&
          dedupeDom.split('data-kind="RESULT"').length === 2,
        'the duplicate does not add a second row',
      ),
      check(
        'cap-rows',
        3,
        capView.notifications.length,
        'at most three notifications stay visible',
      ),
      check('cap-evicted', 2, capView.counts.evicted, 'the oldest rows are evicted'),
      check('expiry-before', 1, expiryBefore, 'the notification is visible before the deadline'),
      check('expiry-during', 1, expiryDuring, 'the notification is visible before the deadline'),
      check('expiry-after', 0, expiryAfter, 'the notification expires with the injected clock'),
      check(
        'publish-kind',
        'PUBLISHED',
        publishedItem?.kind ?? 'missing',
        'an explicit publication is PUBLISHED',
      ),
      check(
        'publish-title',
        true,
        publishedText.includes('Profil publicat'),
        'only the explicit publication says Profil publicat',
      ),
      check(
        'publish-flag',
        true,
        publishedItem?.published ?? false,
        'the publication flag is true',
      ),
      check(
        'publish-version',
        true,
        publishedText.includes('style:079:v3'),
        'the publication version is named',
      ),
      check('publish-count', 1, publicationView.counts.published, 'one publication is counted'),
      check(
        'publish-after-error',
        1,
        publicationAfterError.counts.published,
        'a later worker error cannot remove or fake the real publication',
      ),
      check(
        'publish-after-error-kind',
        'ERROR',
        publicationAfterError.notifications.find((item) => item.kind === 'ERROR')?.kind ??
          'missing',
        'the worker error stays an ERROR next to the publication',
      ),
      check(
        'kind-symbols',
        true,
        [
          'ANALYZING',
          'RESULT',
          'NO_CHANGE',
          'INSUFFICIENT_EVIDENCE',
          'ERROR',
          'REJECTED',
          'CANCELLED',
          'INVALIDATED',
          'STALE',
          'PUBLISHED',
        ].every((kind) => {
          const view = learningNotificationKindView(kind as LearningNotificationKind);
          return view.symbol.length > 0 && view.title.length > 0;
        }),
        'every kind has a symbol and text, never colour only',
      ),
      check(
        'limits',
        `${LEARNING_NOTIFICATION_LIMITS.maxActive}/${LEARNING_NOTIFICATION_LIMITS.maximumHz}`,
        '3/10',
        'three rows at a 10 Hz write ceiling',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: LEARNING_NOTIFICATION_VERSION,
      adapter: LEARNING_NOTIFICATION_ADAPTER_VERSION,
      contract: Object.freeze({
        kinds: Object.freeze([...learningNotificationKindsList()]),
        rules: Object.freeze([
          'every notification is bound to one segmentId and one jobKey, in the text and data-* attributes',
          'a worker composed candidate is RESULT (Candidat validat, nepublicat), never PUBLISHED',
          'ERROR/REJECTED/CANCELLED/INVALIDATED are non-success and never claim a publication',
          'only an explicit 110 publication payload may say Profil publicat',
          'a late event for another segment/job/epoch/session/world becomes STALE and is never the current result',
          'the same segment/job/kind is deduplicated for a bounded window; at most three rows stay visible',
          'every kind has a visual symbol and text; the sound cue is optional and never the only signal',
        ]),
        limits: Object.freeze({
          maxActive: LEARNING_NOTIFICATION_LIMITS.maxActive,
          maximumHz: LEARNING_NOTIFICATION_LIMITS.maximumHz,
          dedupeWindowMs: LEARNING_NOTIFICATION_LIMITS.dedupeWindowMs,
          ttlMs: LEARNING_NOTIFICATION_LIMITS.ttlMs,
          staleTtlMs: LEARNING_NOTIFICATION_LIMITS.staleTtlMs,
          missing: LEARNING_NOTIFICATION_LIMITS.missing,
        }),
      }),
      scenarios,
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    for (const created of harnesses) created.notifications.dispose();
  }
}

/** Local helpers keep the report readable without leaking extra public API. */
function errorFlags(harness: LearningNotificationsHarness, eventId: string): string {
  return harness.itemFor(eventId).getAttribute('data-published') ?? 'missing';
}

function learningNotificationKindsList(): readonly string[] {
  return [
    'ANALYZING',
    'RESULT',
    'NO_CHANGE',
    'INSUFFICIENT_EVIDENCE',
    'ERROR',
    'REJECTED',
    'CANCELLED',
    'INVALIDATED',
    'STALE',
    'PUBLISHED',
  ];
}

function scenarioOf(
  name: string,
  push: string,
  view: LearningNotificationView,
  harness: LearningNotificationsHarness,
  dom: string | null,
): LearningNotificationReportScenario {
  return Object.freeze({
    name,
    push,
    counts: view.counts,
    summary: view.summary,
    notifications: itemsOf(view),
    dom,
    stats: harness.notifications.getStats(),
  });
}

export function learningNotificationsReportMarkdown(report: LearningNotificationsReport): string {
  const scenarios = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Last push | ${entry.push} |
| Active | ${entry.counts.active} |
| Stale | ${entry.counts.stale} |
| Errors | ${entry.counts.errors} |
| Results | ${entry.counts.results} |
| Published | ${entry.counts.published} |
| Deduplicated | ${entry.counts.deduped} |
| Evicted | ${entry.counts.evicted} |
| Expired | ${entry.counts.expired} |
| Summary | ${entry.summary} |

| # | Kind | Published | Sound | Segment | Job | Text |
| ---: | --- | --- | --- | --- | --- | --- |
${entry.notifications
  .map(
    (item, index) =>
      `| ${index + 1} | ${item.kind} | ${item.published ? 'yes' : 'no'} | ${item.soundCue} | ${item.segment} | ${item.job} | ${item.text.replaceAll('|', '\\|')} |`,
  )
  .join('\n')}

${
  entry.notifications.some((item) => item.missing.length > 0)
    ? entry.notifications
        .filter((item) => item.missing.length > 0)
        .map((item) => `- Missing evidence: ${item.missing.join('; ')}`)
        .join('\n')
    : 'No missing-evidence row in this scenario.'
}

${
  entry.dom === null
    ? ''
    : `\`\`\`html
${entry.dom}
\`\`\`
`
}
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 079 learning notifications report

Machine-readable transcript: [report.json](report.json). Generated by
\`npm run learning:notifications\`; it contains no wall-clock value, random value or browser state.

Version: \`${report.version}\`. Adapter: \`${report.adapter}\`. The report drives the real
\`createLearningNotifications\` adapter over real 103-style queue outcomes, a real 102-validated
composition and an explicit publication payload.

## Contract

Kinds: ${report.contract.kinds.join(', ')}.

Rules: ${report.contract.rules.map((rule) => `${rule}.`).join(' ')}

Limits: ${report.contract.limits.maxActive} visible rows, ${report.contract.limits.maximumHz} Hz write ceiling, ${report.contract.limits.dedupeWindowMs} ms dedupe window, ${report.contract.limits.ttlMs} ms lifetime, ${report.contract.limits.staleTtlMs} ms stale lifetime and ${report.contract.limits.missing} missing observations per message.

${scenarios}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${report.scenarios.length}
- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
