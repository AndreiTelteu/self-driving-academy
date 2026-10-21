import {
  runVerticalSlice,
  VERTICAL_SLICE_ENGINE_VERSION,
  VERTICAL_SLICE_LIMITS,
  VERTICAL_SLICE_SEGMENT_IDS,
  VERTICAL_SLICE_VERSION,
  verticalSliceDigest,
  verticalSliceLearningSegment,
  verticalSliceManualSegment,
  verticalSliceReportMarkdown,
} from '../../src/app';
import type {
  VerticalSliceCheck,
  VerticalSliceQueueHandle,
  VerticalSliceQueueResult,
  VerticalSliceReport,
  VerticalSliceScenarioId,
  VerticalSliceServices,
} from '../../src/app';
import type { LearningJob } from '../../src/learning';
import type { ProfilePipelineQueue } from '../../src/app';
import { createLearningQueueHarness } from '../harness/learning-queue-harness';

/**
 * 115 evidence driver.
 *
 * It injects the real 103 queue (with the synthetic transport used by the 112 harness) and the
 * closed 069-shaped segments. The 057 registry, the 110 activation, the 058 civil traffic, the 109
 * store, the 112 pipeline, the 138 accumulators and the 113 binding are the real modules under test.
 *
 * The playtest is a deterministic simulation: the opportunity plan and its encounter pressures are
 * declared by the slice. No human, browser, screenshot, physics body or wall clock participates.
 */
export const VERTICAL_SLICE_REPORT_VERSION = '115-vertical-slice-report-v1' as const;

export const verticalSliceEvidenceRows = [
  'PRUDENT',
  'RECKLESS',
  'BOTH_CATEGORIES',
  'MISTAKES_VISIBLE',
  'MANUAL_NO_CHANGE',
  'UNOBSERVED_CONTEXTS',
  'DETERMINISM',
] as const;
export type VerticalSliceEvidenceRowId = (typeof verticalSliceEvidenceRows)[number];

export interface VerticalSliceEvidenceRow {
  readonly row: VerticalSliceEvidenceRowId;
  readonly status: 'PASS' | 'FAIL';
  readonly detail: string;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
}

export interface VerticalSliceEvidenceReport {
  readonly version: typeof VERTICAL_SLICE_VERSION;
  readonly reportVersion: typeof VERTICAL_SLICE_REPORT_VERSION;
  readonly rows: readonly VerticalSliceEvidenceRow[];
  readonly checks: readonly VerticalSliceCheck[];
  readonly summary: Readonly<{
    rows: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
  readonly determinism: Readonly<{
    runs: number;
    equal: boolean;
    fingerprint: string;
  }>;
  readonly playtest: VerticalSliceReport['playtest'];
  readonly report: VerticalSliceReport;
}

function createObservedQueue(): VerticalSliceQueueHandle {
  const harness = createLearningQueueHarness({ engineVersion: VERTICAL_SLICE_ENGINE_VERSION });
  const results: VerticalSliceQueueResult[] = [];
  const queue: ProfilePipelineQueue = {
    submit(value: unknown) {
      const admission = harness.queue.submit(value);
      if (admission.ticket !== null) {
        const job = value as LearningJob;
        void admission.ticket.outcome.then((outcome) => {
          results.push(Object.freeze({ job, outcome }));
        });
      }
      return admission;
    },
  };
  return Object.freeze({
    queue,
    results: () => Object.freeze([...results]),
    dispose: () => harness.dispose(),
  });
}

function segmentFor(scenario: VerticalSliceScenarioId) {
  return verticalSliceLearningSegment({
    scenario,
    segmentId: VERTICAL_SLICE_SEGMENT_IDS[scenario],
    order: 1,
    interventionId: `learner-115-${scenario.toLowerCase()}`,
    reason: `${scenario} observation of the common city style`,
  });
}

export function createVerticalSliceServices(): VerticalSliceServices {
  return Object.freeze({
    createQueue: () => createObservedQueue(),
    segments: Object.freeze({
      PRUDENT: segmentFor('PRUDENT'),
      RECKLESS: segmentFor('RECKLESS'),
    }),
    manualSegment: verticalSliceManualSegment(),
    taxiCount: VERTICAL_SLICE_LIMITS.taxis,
    civilianCount: VERTICAL_SLICE_LIMITS.civilians,
  });
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): VerticalSliceCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function row(
  id: VerticalSliceEvidenceRowId,
  pass: boolean,
  detail: string,
  values: Readonly<Record<string, string | number | boolean | null>>,
): VerticalSliceEvidenceRow {
  return Object.freeze({
    row: id,
    status: pass ? 'PASS' : 'FAIL',
    detail,
    values: Object.freeze(values),
  });
}

function rowsOf(report: VerticalSliceReport): readonly VerticalSliceEvidenceRow[] {
  const prudent = report.scenarios.find((entry) => entry.scenario === 'PRUDENT')!;
  const reckless = report.scenarios.find((entry) => entry.scenario === 'RECKLESS')!;
  return Object.freeze([
    row(
      'PRUDENT',
      prudent.status === 'PASS' &&
        prudent.behaviour.violations === 0 &&
        prudent.behaviour.eligibleOpportunities > 0,
      'the prudent profile learns a higher stop probability and commits no violation',
      {
        version: prudent.versionChain.at(-1)?.versionId ?? null,
        evidence: prudent.explanation.evidenceTotal,
        opportunities: prudent.behaviour.eligibleOpportunities,
        violations: prudent.behaviour.violations,
      },
    ),
    row(
      'RECKLESS',
      reckless.status === 'PASS' && reckless.behaviour.violations > 0,
      'the reckless profile learns a lower stop probability and commits visible violations',
      {
        version: reckless.versionChain.at(-1)?.versionId ?? null,
        evidence: reckless.explanation.evidenceTotal,
        opportunities: reckless.behaviour.eligibleOpportunities,
        violations: reckless.behaviour.violations,
      },
    ),
    row(
      'BOTH_CATEGORIES',
      report.bothCategoriesUpdated &&
        report.scenarios.every(
          (scenario) =>
            scenario.fleet.taxiVersions.length === 1 &&
            scenario.fleet.civilianVersions.length === 1 &&
            scenario.binding.sameVersion &&
            scenario.binding.sameValues,
        ),
      'taxis and civilians read the same learned version and values in both scenarios',
      {
        prudentTaxi: prudent.fleet.taxiVersions.join(',') || null,
        prudentCivilian: prudent.fleet.civilianVersions.join(',') || null,
        recklessTaxi: reckless.fleet.taxiVersions.join(',') || null,
        recklessCivilian: reckless.fleet.civilianVersions.join(',') || null,
      },
    ),
    row(
      'MISTAKES_VISIBLE',
      report.mistakesVisible &&
        prudent.behaviour.taxi.violations === 0 &&
        prudent.behaviour.civilian.violations === 0 &&
        reckless.behaviour.taxi.violations > 0 &&
        reckless.behaviour.civilian.violations > 0,
      'the reckless mistakes are visible on both a taxi and a civilian, while the prudent run is clean',
      {
        prudentTaxiViolations: prudent.behaviour.taxi.violations,
        prudentCivilianViolations: prudent.behaviour.civilian.violations,
        recklessTaxiViolations: reckless.behaviour.taxi.violations,
        recklessCivilianViolations: reckless.behaviour.civilian.violations,
      },
    ),
    row(
      'MANUAL_NO_CHANGE',
      report.manualNoChange &&
        report.scenarios.every(
          (scenario) =>
            scenario.manual.pipelineStatus === 'SKIPPED_MANUAL' &&
            scenario.manual.jobSubmitted === false &&
            scenario.manual.versionId === null &&
            scenario.manual.versionsBefore === scenario.manual.versionsAfter &&
            scenario.manual.activeVersionBefore === scenario.manual.activeVersionAfter &&
            scenario.manual.explanation.status === 'NO_CHANGE' &&
            scenario.manual.explanation.versionId === null &&
            scenario.manual.telemetry.opportunities > 0,
        ),
      'MANUAL records telemetry but creates no job, version, activation or style change',
      {
        prudentStatus: prudent.manual.pipelineStatus,
        prudentTelemetry: prudent.manual.telemetry.opportunities,
        prudentExplanation: prudent.manual.explanation.status,
        recklessStatus: reckless.manual.pipelineStatus,
        recklessTelemetry: reckless.manual.telemetry.opportunities,
        recklessExplanation: reckless.manual.explanation.status,
      },
    ),
    row(
      'UNOBSERVED_CONTEXTS',
      report.unobservedContexts.length > 0 &&
        report.scenarios.every(
          (scenario) =>
            scenario.explanation.unobservedContexts.length > 0 &&
            scenario.explanation.declaredContexts.every(
              (context) =>
                scenario.explanation.observedContexts.includes(context) ||
                scenario.explanation.unobservedContexts.some((entry) => entry.context === context),
            ),
        ),
      'the explanation names the observed context and every unobserved context explicitly',
      {
        reported: report.unobservedContexts.join(','),
        declared: prudent.explanation.declaredContexts.join(','),
        observed: prudent.explanation.observedContexts.join(','),
      },
    ),
    row('DETERMINISM', true, 'two independent runs produce the same frozen report', {
      fingerprint: verticalSliceDigest(report),
    }),
  ]);
}

export async function runVerticalSliceEvidenceReport(): Promise<VerticalSliceEvidenceReport> {
  const first = await runVerticalSlice(createVerticalSliceServices());
  const second = await runVerticalSlice(createVerticalSliceServices());
  const equal = JSON.stringify(first) === JSON.stringify(second);
  const fingerprint = verticalSliceDigest(first);
  const rows = rowsOf(first).map((entry) =>
    entry.row === 'DETERMINISM'
      ? row('DETERMINISM', equal && entry.values.fingerprint === fingerprint, entry.detail, {
          ...entry.values,
          secondFingerprint: verticalSliceDigest(second),
        })
      : entry,
  );
  const rowChecks: VerticalSliceCheck[] = rows.map((entry) =>
    check(`row.${entry.row}`, 'PASS', entry.status, entry.detail),
  );
  const checks = Object.freeze([
    ...first.checks,
    ...rowChecks,
    check('report.version', VERTICAL_SLICE_VERSION, first.version, 'the report version is closed'),
    check(
      'report.playtest',
      'DETERMINISTIC_SIMULATED',
      first.playtest.kind,
      'the playtest is a deterministic simulation, not a human or browser run',
    ),
    check('report.determinism', true, equal, 'two independent runs are byte-identical'),
  ]);
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: first.version,
    reportVersion: VERTICAL_SLICE_REPORT_VERSION,
    rows,
    checks,
    summary: Object.freeze({
      rows: rows.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
    determinism: Object.freeze({ runs: 2, equal, fingerprint }),
    playtest: first.playtest,
    report: first,
  });
}

function countsText(counts: Readonly<Record<string, number>>): string {
  return Object.entries(counts)
    .map(([key, count]) => `${key}=${count}`)
    .join(',');
}

/** Human-readable companion to `report.json`; generated from the same frozen report. */
export function verticalSliceEvidenceMarkdown(report: VerticalSliceEvidenceReport): string {
  const base = verticalSliceReportMarkdown(report.report);
  const rows = [
    '# 115 vertical slice evidence',
    '',
    'Generated by `npm run vertical:slice`; `npm run vertical:slice -- --check` compares this',
    'transcript and `report.json` with the committed files. The playtest is a deterministic',
    'simulation, not a human or browser playtest, and no screenshot was produced.',
    '',
    '## Evidence rows',
    '',
    '| Row | Result | Detail | Values |',
    '| --- | --- | --- | --- |',
    ...report.rows.map(
      (entry) =>
        `| ${entry.row} | \`${entry.status}\` | ${entry.detail} | ${Object.entries(entry.values)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(', ')} |`,
    ),
    '',
    '## Determinism',
    '',
    `- Runs: ${String(report.determinism.runs)}`,
    `- Byte-identical: \`${String(report.determinism.equal)}\``,
    `- Fingerprint: \`${report.determinism.fingerprint}\``,
    '',
    '## Fleet histograms',
    '',
    ...report.report.scenarios.flatMap((scenario) => [
      `### ${scenario.scenario}`,
      '',
      `- Before: ${countsText(scenario.fleet.before)}`,
      `- After: ${countsText(scenario.fleet.after)}`,
      `- Taxi after: ${countsText(scenario.fleet.taxiAfter)}`,
      `- Civilian after: ${countsText(scenario.fleet.civilianAfter)}`,
      '',
    ]),
  ].join('\n');
  const separator = '\n## Rules\n';
  const index = base.indexOf(separator);
  if (index < 0) return `${rows}\n${base}`;
  return `${rows}${base.slice(index)}`;
}
