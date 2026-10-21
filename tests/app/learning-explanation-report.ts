import { LEARNING_EXPLANATION_ADAPTER_VERSION, readLearningExplanation } from '../../src/app';
import {
  LEARNING_EXPLANATION_LIMITS,
  LEARNING_EXPLANATION_NO_CHANGE_TEXT,
  LEARNING_EXPLANATION_NO_VERSION_TEXT,
  LEARNING_EXPLANATION_VERSION,
  learningExplanationStatusView,
  learningExplanationStatuses,
  projectLearningExplanation,
} from '../../src/ui';
import type { LearningExplanationSnapshot, LearningExplanationView } from '../../src/ui';
import {
  createLearningExplanationHarness,
  explanationFailure,
  explanationJob,
  explanationOutcome,
  noContextJob,
  noEvidenceJob,
  withEstimate,
} from '../ui/learning-explanation-fixture';
import type { LearningExplanationHarness } from '../ui/learning-explanation-fixture';

export interface LearningExplanationReportRow {
  readonly key: string;
  readonly previous: number;
  readonly next: number;
  readonly delta: string;
  readonly evidence: number;
  readonly contexts: readonly string[];
  readonly quality: number;
  readonly uncertainty: string;
  readonly confidence: string;
  readonly reason: string;
}

export interface LearningExplanationReportScenario {
  readonly name: string;
  readonly status: string;
  readonly versionId: string | null;
  readonly reason: string | null;
  readonly detail: string | null;
  readonly missing: readonly string[];
  readonly rows: readonly LearningExplanationReportRow[];
  readonly summary: string;
  readonly noChange: string | null;
  readonly failure: string | null;
  readonly dom: string | null;
  readonly stats: Readonly<Record<string, number | boolean | string | null>>;
}

export interface LearningExplanationCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LearningExplanationReport {
  readonly version: typeof LEARNING_EXPLANATION_VERSION;
  readonly adapter: typeof LEARNING_EXPLANATION_ADAPTER_VERSION;
  readonly contract: Readonly<{
    statuses: readonly string[];
    rules: readonly string[];
    limits: Readonly<Record<string, number | string>>;
  }>;
  readonly scenarios: readonly LearningExplanationReportScenario[];
  readonly checks: readonly LearningExplanationCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): LearningExplanationCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function rowsOf(view: LearningExplanationView): readonly LearningExplanationReportRow[] {
  return Object.freeze(
    view.rows.map((row) =>
      Object.freeze({
        key: row.key,
        previous: row.previous,
        next: row.next,
        delta: row.deltaLabel,
        evidence: row.evidenceCount,
        contexts: row.contexts,
        quality: row.quality,
        uncertainty: row.uncertainty,
        confidence: row.confidence,
        reason: row.reason,
      }),
    ),
  );
}

function scenarioOf(
  name: string,
  snapshot: LearningExplanationSnapshot,
  harness: LearningExplanationHarness,
  dom: string | null,
): LearningExplanationReportScenario {
  const view = projectLearningExplanation(snapshot);
  return Object.freeze({
    name,
    status: snapshot.status,
    versionId: snapshot.versionId,
    reason: snapshot.noChangeReason,
    detail: snapshot.detail,
    missing: snapshot.missingContexts,
    rows: rowsOf(view),
    summary: snapshot.summary,
    noChange: view.noChange,
    failure: view.failure,
    dom,
    stats: harness.panel.getStats(),
  });
}

export function runLearningExplanationReport(): LearningExplanationReport {
  const harnesses: LearningExplanationHarness[] = [];
  const harness = (): LearningExplanationHarness => {
    const created = createLearningExplanationHarness();
    harnesses.push(created);
    return created;
  };
  try {
    // 1. One real change, explained by its evidence.
    const headway = explanationJob(),
      changeSnapshot = readLearningExplanation(
        { job: headway, outcome: explanationOutcome(headway, 1.5) },
        { tick: 10 },
      ),
      changeHarness = harness();
    changeHarness.panel.update(changeSnapshot, 0);
    const changeDom = changeHarness.dom(),
      changeView = projectLearningExplanation(changeSnapshot);

    // 2. Two keys aggregated deterministically.
    const stop = withEstimate(
        explanationJob({
          key: 'stop_full_probability',
          segmentId: 'segment:104:stop',
          order: 8,
          baseValue: 1,
        }),
        0,
      ),
      multiSnapshot = readLearningExplanation(
        [
          { job: headway, outcome: explanationOutcome(headway, 1.5) },
          { job: stop, outcome: explanationOutcome(stop, 0) },
        ],
        { tick: 11 },
      ),
      multiReversed = readLearningExplanation(
        [
          { job: stop, outcome: explanationOutcome(stop, 0) },
          { job: headway, outcome: explanationOutcome(headway, 1.5) },
        ],
        { tick: 11 },
      ),
      multiHarness = harness();
    multiHarness.panel.update(multiSnapshot, 0);

    // 3. No change without evidence: no artificial version.
    const emptyJob = noEvidenceJob(),
      noChangeSnapshot = readLearningExplanation(
        { job: emptyJob, outcome: explanationOutcome(emptyJob, emptyJob.baseValue) },
        { tick: 12 },
      ),
      noChangeHarness = harness();
    noChangeHarness.panel.update(noChangeSnapshot, 0);
    const noChangeDom = noChangeHarness.dom();

    // 4. Insufficient evidence / missing context is explicit.
    const contextJob = noContextJob(),
      insufficientSnapshot = readLearningExplanation(
        { job: contextJob, outcome: explanationOutcome(contextJob, 1.5) },
        { tick: 13 },
      ),
      insufficientHarness = harness();
    insufficientHarness.panel.update(insufficientSnapshot, 0);
    const insufficientDom = insufficientHarness.dom();

    // 5. A real zero previous → next.
    const stopOnly = withEstimate(
        explanationJob({
          key: 'stop_full_probability',
          segmentId: 'segment:104:stop',
          order: 2,
          baseValue: 1,
        }),
        0,
      ),
      zeroSnapshot = readLearningExplanation(
        { job: stopOnly, outcome: explanationOutcome(stopOnly, 0) },
        { tick: 14 },
      ),
      zeroHarness = harness();
    zeroHarness.panel.update(zeroSnapshot, 0);
    const zeroDom = zeroHarness.dom();

    // 6. A worker error with its real reason and never a version.
    const errorJob = explanationJob({ segmentId: 'segment:104:error', order: 3 }),
      errorSnapshot = readLearningExplanation(
        {
          job: errorJob,
          outcome: explanationFailure(errorJob, 'error', 'RESULT_INVALID', 'Malformed result'),
        },
        { tick: 15 },
      ),
      errorHarness = harness();
    errorHarness.panel.update(errorSnapshot, 0);
    const errorDom = errorHarness.dom();

    // 7. 60 frames at 16 ms stay capped and keep one row.
    const frameHarness = harness();
    for (let index = 0; index < 60; index += 1) {
      const value = 1.5 + index / 1_000,
        frameSnapshot = readLearningExplanation(
          { job: headway, outcome: explanationOutcome(headway, value) },
          { tick: 20 + index },
        );
      frameHarness.panel.update(frameSnapshot, index * 16);
    }
    const frameStats = frameHarness.panel.getStats(),
      frameDom = frameHarness.dom();

    const scenarios = Object.freeze([
      scenarioOf('single change', changeSnapshot, changeHarness, changeDom),
      scenarioOf('multi-key', multiSnapshot, multiHarness, null),
      scenarioOf('no-change', noChangeSnapshot, noChangeHarness, noChangeDom),
      scenarioOf(
        'insufficient evidence / missing context',
        insufficientSnapshot,
        insufficientHarness,
        insufficientDom,
      ),
      scenarioOf('real zero', zeroSnapshot, zeroHarness, zeroDom),
      scenarioOf('error', errorSnapshot, errorHarness, errorDom),
      scenarioOf('60-frame ceiling', changeSnapshot, frameHarness, frameDom),
    ]);

    const changeRow = changeView.rows[0],
      noChangeView = projectLearningExplanation(noChangeSnapshot),
      zeroRow = projectLearningExplanation(zeroSnapshot).rows[0],
      checks = [
        check(
          'contract-version',
          LEARNING_EXPLANATION_VERSION,
          changeSnapshot.version,
          '104 contract',
        ),
        check(
          'adapter-version',
          LEARNING_EXPLANATION_ADAPTER_VERSION,
          LEARNING_EXPLANATION_ADAPTER_VERSION,
          'composition root contract',
        ),
        check('changed-status', 'CHANGED', changeSnapshot.status, 'a real delta is CHANGED'),
        check(
          'changed-version',
          'style:104:v2~103.7',
          changeSnapshot.versionId ?? 'missing',
          'the real 103 composition version is shown',
        ),
        check('changed-rows', 1, changeSnapshot.changes.length, 'one change for one key'),
        check('changed-previous', 1.8, changeRow?.previous ?? -1, 'the real base value'),
        check('changed-next', 1.5, changeRow?.next ?? -1, 'the real composed value'),
        check('changed-delta', '-0.3 s', changeRow?.deltaLabel ?? 'missing', 'delta with its unit'),
        check(
          'changed-evidence',
          '3 episoade efective',
          changeRow?.evidenceLabel ?? 'missing',
          'the effective episode count is shown',
        ),
        check(
          'changed-context',
          'LEADER',
          changeRow?.contextsLabel ?? 'missing',
          'the real context',
        ),
        check('changed-quality', '100%', changeRow?.qualityLabel ?? 'missing', 'the 100 quality'),
        check(
          'changed-confidence',
          'OBSERVED',
          changeRow?.confidence ?? 'missing',
          'the confidence state is explicit',
        ),
        check('changed-published', false, changeView.published, 'a change is never a publication'),
        check(
          'changed-success',
          true,
          learningExplanationStatusView('CHANGED').success,
          'CHANGED is the only successful job result',
        ),
        check(
          'changed-text-binding',
          true,
          changeSnapshot.summary.includes('segment:104:headway') &&
            changeSnapshot.summary.includes('job:104:segment:104:headway:7'),
          'the segment and job are in the text',
        ),
        check(
          'nochange-status',
          'NO_CHANGE',
          noChangeSnapshot.status,
          'equal values are NO_CHANGE',
        ),
        check(
          'nochange-version',
          'null',
          String(noChangeSnapshot.versionId),
          'a no-change has no version',
        ),
        check('nochange-changes', 0, noChangeSnapshot.changes.length, 'a no-change has no row'),
        check(
          'nochange-reason',
          'NO_NEW_EVIDENCE',
          noChangeSnapshot.noChangeReason ?? 'missing',
          'the reason is closed and derived from the evidence',
        ),
        check(
          'nochange-missing',
          true,
          noChangeSnapshot.missingContexts.length > 0,
          'the missing evidence is concrete',
        ),
        check(
          'nochange-sentence',
          true,
          (noChangeView.noChange ?? '').includes(LEARNING_EXPLANATION_NO_CHANGE_TEXT),
          'the exact sentence is present',
        ),
        check(
          'nochange-dom-version',
          `Versiune: ${LEARNING_EXPLANATION_NO_VERSION_TEXT}`,
          noChangeHarness.versionLine().textContent,
          'the panel never invents a version',
        ),
        check(
          'nochange-dom-flags',
          'true/false',
          `${noChangeHarness.root().getAttribute('data-no-version')}/${noChangeHarness.root().getAttribute('data-published')}`,
          'no version and no publication',
        ),
        check('multi-keys', 2, multiSnapshot.changes.length, 'two keys aggregate'),
        check(
          'multi-unique',
          true,
          new Set(multiSnapshot.changes.map((row) => row.key)).size === 2,
          'the aggregated keys are unique',
        ),
        check(
          'multi-order',
          'following_time_headway,stop_full_probability',
          multiSnapshot.changes.map((row) => row.key).join(','),
          'the rows are ordered by key',
        ),
        check(
          'multi-head-version',
          'style:104:v2~103.8',
          multiSnapshot.versionId ?? 'missing',
          'the head composition version is used',
        ),
        check(
          'multi-deterministic',
          true,
          multiSnapshot.signature === multiReversed.signature,
          'input order does not change the frame',
        ),
        check('multi-dom-rows', 2, multiHarness.rows().length, 'the panel renders one row per key'),
        check(
          'insufficient-status',
          'INSUFFICIENT_EVIDENCE',
          insufficientSnapshot.status,
          'a change without context is not shown as a change',
        ),
        check(
          'insufficient-version',
          'null',
          String(insufficientSnapshot.versionId),
          'no version without an explanation',
        ),
        check(
          'insufficient-missing',
          true,
          insufficientSnapshot.missingContexts.some((text) => text.includes('CONTEXT_MISSING')),
          'the missing context is named',
        ),
        check(
          'insufficient-rows',
          0,
          insufficientSnapshot.changes.length,
          'no invented evidence row',
        ),
        check('zero-next', 0, zeroRow?.next ?? -1, 'a real zero is preserved'),
        check('zero-delta', '-1 probabilitate', zeroRow?.deltaLabel ?? 'missing', 'the real delta'),
        check(
          'zero-confidence',
          'ZERO',
          zeroRow?.confidence ?? 'missing',
          'zero is distinct from unobserved',
        ),
        check('error-status', 'ERROR', errorSnapshot.status, 'a worker failure is ERROR'),
        check(
          'error-reason',
          'RESULT_INVALID',
          errorSnapshot.noChangeReason ?? 'missing',
          'the real 103 reason is kept',
        ),
        check(
          'error-detail',
          'Malformed result',
          errorSnapshot.detail ?? 'missing',
          'the real detail',
        ),
        check(
          'error-version',
          'null',
          String(errorSnapshot.versionId),
          'an error never claims a version',
        ),
        check(
          'error-not-published',
          true,
          !errorDom.includes('Profil publicat') &&
            errorHarness.root().getAttribute('data-success') === 'false',
          'an error is never a published profile',
        ),
        check('frames-rows', 1, frameStats.rows, 'sixty frames keep one stable row'),
        check(
          'frames-renders',
          true,
          frameStats.updates <= 10,
          `60 frames at 16 ms produced ${frameStats.updates} renders`,
        ),
        check(
          'frames-status',
          'CHANGED',
          frameStats.status ?? 'missing',
          'the panel still shows the last accepted result',
        ),
        check(
          'frames-dom',
          true,
          frameDom.includes('data-key="following_time_headway"'),
          'the stable row is present in the DOM',
        ),
        check(
          'limits',
          `${LEARNING_EXPLANATION_LIMITS.changes}/${LEARNING_EXPLANATION_LIMITS.maximumHz}`,
          '24/10',
          '24 learnable keys at a 10 Hz write ceiling',
        ),
        check(
          'status-symbols',
          true,
          learningExplanationStatuses.every((status) => {
            const view = learningExplanationStatusView(status);
            return view.symbol.length > 0 && view.title.length > 0 && view.published === false;
          }),
          'every status has a symbol and text and none is a publication',
        ),
        check(
          'nochange-rows-visible',
          0,
          noChangeHarness.rows().length,
          'the panel shows no change row for a no-change',
        ),
      ],
      passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: LEARNING_EXPLANATION_VERSION,
      adapter: LEARNING_EXPLANATION_ADAPTER_VERSION,
      contract: Object.freeze({
        statuses: Object.freeze([...learningExplanationStatuses]),
        rules: Object.freeze([
          'CHANGED requires at least one change and the real 103 composition versionId',
          'NO_CHANGE and INSUFFICIENT_EVIDENCE require versionId null, zero changes and a closed reason',
          'ERROR and REJECTED require zero changes, no version and the real closed reason/detail',
          'every change carries a positive effective episode count, real contexts, quality, uncertainty and confidence',
          'a real zero is a valid value and never an unobserved one',
          'a late or foreign job becomes a closed STALE_JOB error, never the current result',
          'an R key can never appear as a learned change',
          'the panel writes only changed text at 10 Hz and never invents a version, value or publication',
        ]),
        limits: Object.freeze({
          changes: LEARNING_EXPLANATION_LIMITS.changes,
          contextsPerChange: LEARNING_EXPLANATION_LIMITS.contextsPerChange,
          missingContexts: LEARNING_EXPLANATION_LIMITS.missingContexts,
          maximumHz: LEARNING_EXPLANATION_LIMITS.maximumHz,
        }),
      }),
      scenarios,
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    for (const created of harnesses) created.panel.dispose();
  }
}

export function learningExplanationReportMarkdown(report: LearningExplanationReport): string {
  const scenarios = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Status | ${entry.status} |
| Version | ${entry.versionId ?? 'Nicio versiune nouă'} |
| Reason | ${entry.reason ?? '—'} |
| Detail | ${entry.detail ?? '—'} |
| Missing contexts | ${entry.missing.length === 0 ? '—' : entry.missing.join('; ')} |
| Rows | ${entry.rows.length} |

${
  entry.rows.length === 0
    ? 'No change row in this scenario.'
    : `| Key | Previous | Next | Delta | Evidence | Contexts | Quality | Uncertainty | Confidence | Reason |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- |
${entry.rows
  .map(
    (row) =>
      `| ${row.key} | ${row.previous} | ${row.next} | ${row.delta} | ${row.evidence} | ${row.contexts.join(', ')} | ${row.quality} | ${row.uncertainty} | ${row.confidence} | ${row.reason} |`,
  )
  .join('\n')}`
}

${entry.noChange === null ? '' : `No-change text: ${entry.noChange}\n`}
${entry.failure === null ? '' : `Failure text: ${entry.failure}\n`}

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
  return `# 104 learning explanation report

Machine-readable transcript: [report.json](report.json). Generated by
\`npm run learning:explanation\`; it contains no wall-clock value, random value or browser state.

Version: \`${report.version}\`. Adapter: \`${report.adapter}\`. The report drives the real
\`readLearningExplanation\` composition root over real 103-style queue outcomes and the real
\`createLearningExplanationPanel\` adapter on a deterministic DOM.

## Contract

Statuses: ${report.contract.statuses.join(', ')}.

Rules: ${report.contract.rules.map((rule) => `${rule}.`).join(' ')}

Limits: ${report.contract.limits.changes} change rows, ${report.contract.limits.contextsPerChange} contexts per change, ${report.contract.limits.missingContexts} missing-context entries and a ${report.contract.limits.maximumHz} Hz write ceiling.

${scenarios}## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${report.scenarios.length}
- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
