import { LEARNING_EDGECASES_APP_VERSION, runLearningEdgeCaseRegressions } from '../../src/app';
import {
  LEARNING_EDGECASE_ADAPTER_VERSION,
  LEARNING_EDGECASES_VERSION,
  learningEdgeCaseIds,
} from '../../src/experiments';
import type {
  LearningEdgeCaseId,
  LearningEdgeCaseReport,
  LearningEdgeCaseResult,
} from '../../src/experiments';
import { artifactCauses, artifactKinds } from '../../src/telemetry';

export interface LearningEdgeCaseEvidenceCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LearningEdgeCaseScenario {
  readonly id: string;
  readonly caseIds: readonly LearningEdgeCaseId[];
  readonly pass: boolean;
}

export interface LearningEdgeCasesEvidenceReport {
  readonly appVersion: typeof LEARNING_EDGECASES_APP_VERSION;
  readonly report: LearningEdgeCaseReport;
  readonly scenarios: readonly LearningEdgeCaseScenario[];
  readonly checks: readonly LearningEdgeCaseEvidenceCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

const scenarioDefinitions = Object.freeze([
  Object.freeze({ id: 'PAUSE', caseIds: Object.freeze(['PAUSE', 'FOCUS_LOSS_PAUSE'] as const) }),
  Object.freeze({
    id: 'RECOVERY_ADMITTED',
    caseIds: Object.freeze(['RECOVERY_ADMITTED'] as const),
  }),
  Object.freeze({
    id: 'RECOVERY_DENIED_PARTIAL',
    caseIds: Object.freeze(['RECOVERY_DENIED', 'RECOVERY_PARTIAL'] as const),
  }),
  Object.freeze({
    id: 'INCOMPLETE_GAP',
    caseIds: Object.freeze(['INCOMPLETE_SEGMENT', 'OPEN_SEGMENT', 'OBSERVATION_GAP'] as const),
  }),
  Object.freeze({ id: 'MANY_STREETS', caseIds: Object.freeze(['MANY_STREETS'] as const) }),
  Object.freeze({
    id: 'SHORT_INTERVENTION',
    caseIds: Object.freeze(['SHORT_INTERVENTION'] as const),
  }),
  Object.freeze({
    id: 'POSITIVE_CONTROLS',
    caseIds: Object.freeze(['CLEAN_FREE_TRAFFIC', 'CLEAN_LEADER', 'CLEAN_BLOCKED_GREEN'] as const),
  }),
]);

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): LearningEdgeCaseEvidenceCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function caseOf(report: LearningEdgeCaseReport, id: LearningEdgeCaseId): LearningEdgeCaseResult {
  const found = report.cases.find((entry) => entry.caseId === id);
  if (!found) throw new Error(`Missing 107 case: ${id}`);
  return found;
}

function ledgerOf(report: LearningEdgeCaseReport, id: LearningEdgeCaseId, key: string) {
  const found = caseOf(report, id).ledgerKeys.find((row) => row.key === key);
  if (!found) throw new Error(`Missing 107 ledger row: ${id}/${key}`);
  return found;
}

function admissionOf(report: LearningEdgeCaseReport, id: LearningEdgeCaseId, index: number) {
  const found = caseOf(report, id).admissions[index];
  if (!found) throw new Error(`Missing 107 admission: ${id}[${index}]`);
  return found;
}

export function runLearningEdgeCasesReport(): LearningEdgeCasesEvidenceReport {
  const report = runLearningEdgeCaseRegressions();
  const stable = JSON.stringify(report) === JSON.stringify(runLearningEdgeCaseRegressions());
  const checks: LearningEdgeCaseEvidenceCheck[] = [];
  const pause = caseOf(report, 'PAUSE');
  const focus = caseOf(report, 'FOCUS_LOSS_PAUSE');
  const admitted = caseOf(report, 'RECOVERY_ADMITTED');
  const denied = caseOf(report, 'RECOVERY_DENIED');
  const partial = caseOf(report, 'RECOVERY_PARTIAL');
  const incomplete = caseOf(report, 'INCOMPLETE_SEGMENT');
  const open = caseOf(report, 'OPEN_SEGMENT');
  const gap = caseOf(report, 'OBSERVATION_GAP');
  const many = caseOf(report, 'MANY_STREETS');
  const short = caseOf(report, 'SHORT_INTERVENTION');
  const teleport = admitted.artifacts.find((entry) => entry.kind === 'TELEPORT');

  checks.push(
    check('contract-version', LEARNING_EDGECASES_VERSION, report.version, '107 harness version'),
    check(
      'adapter-version',
      LEARNING_EDGECASE_ADAPTER_VERSION,
      report.adapterVersion,
      'frozen admission adapter version',
    ),
    check(
      'app-adapter-version',
      '107-learning-edgecases-app-v1',
      LEARNING_EDGECASES_APP_VERSION,
      'frozen report adapter version',
    ),
    check(
      'closed-case-set',
      learningEdgeCaseIds.join(','),
      report.cases.map((entry) => entry.caseId).join(','),
      'the closed case set is exactly the declared one',
    ),
    check('scenarios', 7, scenarioDefinitions.length, 'seven evidence scenarios'),
    check('cases', 13, report.cases.length, 'thirteen closed cases'),
    check(
      'all-cases-pass',
      true,
      report.cases.every((entry) => entry.status === 'PASS'),
      'every case satisfies its checks',
    ),
    check('deterministic', true, stable, 'two runs produce byte-identical reports'),
    check(
      'coverage-kinds',
      artifactKinds.join(','),
      report.coverage.kinds.join(','),
      'every 088 artifact kind is exercised',
    ),
    check(
      'coverage-causes',
      artifactCauses.join(','),
      report.coverage.causes.join(','),
      'every 088 artifact cause is exercised',
    ),
    check(
      'coverage-window-classes',
      'PREFIX_ELIGIBLE,FULLY_SUPPRESSED',
      report.coverage.windowClasses.join(','),
      'both 088 split classes are exercised',
    ),
    check(
      'coverage-completeness',
      'COMPLETE,PARTIAL,TRUNCATED',
      report.coverage.completeness.join(','),
      'all three 088 completeness degrees are exercised',
    ),
    check(
      'pause-cause',
      'SUSPENSION_PAUSE',
      pause.artifacts[0]?.cause ?? 'NONE',
      'a pause has its own cause',
    ),
    check('pause-zero-learned', 0, pause.learnedKeys.length, 'a pause learns nothing'),
    check(
      'pause-zero-no-evidence',
      true,
      pause.ledgerKeys.every((row) => row.status === 'NO_EVIDENCE'),
      'no ledger key receives pause evidence',
    ),
    check(
      'focus-cause',
      'SUSPENSION_FOCUS_LOST',
      focus.artifacts[0]?.cause ?? 'NONE',
      'focus loss is distinct from a panel pause',
    ),
    check('focus-zero-learned', 0, focus.learnedKeys.length, 'focus loss learns nothing'),
    check(
      'focus-fully-suppressed',
      'FULLY_SUPPRESSED',
      focus.windows[1]?.windowClass ?? 'NONE',
      'a suspension from tick one leaves no prefix',
    ),
    check(
      'recovery-teleport-cause',
      'RECOVERY_TELEPORT',
      teleport?.cause ?? 'NONE',
      'an admitted/completed recovery is a TELEPORT',
    ),
    check(
      'recovery-proof-operation',
      'op-completed',
      teleport?.operationId ?? 'NONE',
      'the 030 operation proof is preserved',
    ),
    check(
      'recovery-prefix-speed',
      'READY',
      ledgerOf(report, 'RECOVERY_ADMITTED', 'speed_delta_urban').status,
      'the long usable prefix remains evidence',
    ),
    check(
      'recovery-post-refused',
      'OBSERVATION_OUTSIDE_USABLE_PREFIX',
      admissionOf(report, 'RECOVERY_ADMITTED', 1).reason ?? 'NONE',
      'the teleport interval never becomes evidence',
    ),
    check(
      'recovery-collision-retained',
      true,
      admitted.artifacts.some((entry) => entry.cause === 'COLLISION_IMPULSE'),
      'the real collision fact is retained',
    ),
    check(
      'denied-cause',
      'RECOVERY_DENIED',
      denied.artifacts[0]?.cause ?? 'NONE',
      'denied recovery keeps its cause',
    ),
    check('denied-zero-learned', 0, denied.learnedKeys.length, 'a denied recovery learns nothing'),
    check(
      'partial-cause',
      'RECOVERY_PARTIAL',
      partial.artifacts[0]?.cause ?? 'NONE',
      'partial recovery keeps its cause',
    ),
    check(
      'partial-zero-learned',
      0,
      partial.learnedKeys.length,
      'a partial recovery learns nothing',
    ),
    check(
      'incomplete-truncated',
      3,
      incomplete.windows.filter((entry) => entry.completeness === 'TRUNCATED').length,
      'incomplete, data-loss and checkpoint-loss are all TRUNCATED',
    ),
    check(
      'incomplete-zero-learned',
      0,
      incomplete.learnedKeys.length,
      'a truncated tail never becomes learned behaviour',
    ),
    check(
      'open-reason',
      'OPEN_SEGMENT',
      open.windows[0]?.completenessReason ?? 'NONE',
      'an open segment is explicit',
    ),
    check(
      'open-zero-learned',
      0,
      open.learnedKeys.length,
      'an open segment does not fabricate a value',
    ),
    check(
      'gap-reason',
      'OBSERVATION_GAP',
      gap.windows[0]?.completenessReason ?? 'NONE',
      'a lost observation window is explicit',
    ),
    check(
      'gap-refused',
      'OBSERVATION_OUTSIDE_USABLE_PREFIX',
      admissionOf(report, 'OBSERVATION_GAP', 0).reason ?? 'NONE',
      'the lost span never becomes evidence',
    ),
    check(
      'many-distinct-episodes',
      3,
      ledgerOf(report, 'MANY_STREETS', 'speed_delta_urban').distinctEpisodes,
      'three distinct street opportunities count separately',
    ),
    check(
      'many-repeated-frames-deduped',
      3,
      ledgerOf(report, 'MANY_STREETS', 'speed_delta_urban').distinctEpisodes,
      'repeated frames of the same opportunity add no episode',
    ),
    check(
      'many-contexts',
      'FREE_TRAFFIC,LEADER,BLOCKED_GREEN',
      many.contextsObserved.join(','),
      'the three contexts remain represented',
    ),
    check(
      'many-blocked-green-refused',
      'CONTEXT_NOT_EVIDENCE',
      admissionOf(report, 'MANY_STREETS', 4).reason ?? 'NONE',
      'blocked green is not preference evidence',
    ),
    check(
      'many-no-green-spill',
      'NO_EVIDENCE',
      ledgerOf(report, 'MANY_STREETS', 'green_start_delay').status,
      'blocked green adds no green-start evidence',
    ),
    check(
      'short-ready-keys',
      'speed_delta_urban',
      short.learnedKeys.join(','),
      'only the observed speed context reaches READY',
    ),
    check(
      'short-within-context',
      1,
      ledgerOf(report, 'SHORT_INTERVENTION', 'speed_delta_urban').distinctEpisodes,
      'a ten-second short intervention contributes exactly one episode',
    ),
    check(
      'short-following-no-evidence',
      'NO_EVIDENCE',
      ledgerOf(report, 'SHORT_INTERVENTION', 'following_time_headway').status,
      'no following evidence is fabricated',
    ),
    check(
      'short-signal-no-evidence',
      'NO_EVIDENCE',
      ledgerOf(report, 'SHORT_INTERVENTION', 'green_start_delay').status,
      'no signal evidence is fabricated',
    ),
    check(
      'short-manual-refused',
      'ELIGIBILITY_EXCLUDED',
      admissionOf(report, 'SHORT_INTERVENTION', 1).reason ?? 'NONE',
      'the MANUAL part of the short intervention is refused explicitly',
    ),
    check(
      'short-manual-no-episode',
      1,
      ledgerOf(report, 'SHORT_INTERVENTION', 'speed_delta_urban').distinctEpisodes,
      'MANUAL does not inflate the eligible episode count',
    ),
    check(
      'positive-free-ready',
      'READY',
      ledgerOf(report, 'CLEAN_FREE_TRAFFIC', 'speed_delta_urban').status,
      'free traffic produces a speed control',
    ),
    check(
      'positive-leader-ready',
      'READY',
      ledgerOf(report, 'CLEAN_LEADER', 'following_time_headway').status,
      'varied leader speeds produce following evidence',
    ),
    check(
      'positive-leader-no-speed',
      'NO_EVIDENCE',
      ledgerOf(report, 'CLEAN_LEADER', 'speed_delta_urban').status,
      'a leader never becomes preferred speed',
    ),
    check(
      'positive-green-no-delay',
      'NO_EVIDENCE',
      ledgerOf(report, 'CLEAN_BLOCKED_GREEN', 'green_start_delay').status,
      'blocked green produces no green-start delay',
    ),
    check('no-profile-changes', 0, report.summary.profileChanges, 'no profile value changed'),
    check(
      'no-profile-publication',
      0,
      report.summary.profilePublications,
      'no profile version was published',
    ),
    check('no-store-writes', 0, report.summary.storeWrites, 'no store was written'),
    check('no-fleet-mutations', 0, report.summary.fleetMutations, 'no fleet vehicle was mutated'),
    check(
      'no-candidates',
      0,
      report.summary.candidatesProduced,
      'no estimator candidate was produced',
    ),
    check(
      'ledger-keys-complete',
      13 * 24,
      report.cases.reduce((total, entry) => total + entry.ledgerKeys.length, 0),
      'each case reads all 24 M keys',
    ),
    check(
      'checks-all-pass',
      true,
      report.cases.every((entry) => entry.checks.every((row) => row.pass)),
      'every per-case check passes',
    ),
    check('overall-pass', true, report.summary.pass, 'the aggregate is PASS'),
  );

  const scenarios = Object.freeze(
    scenarioDefinitions.map((scenario) =>
      Object.freeze({
        id: scenario.id,
        caseIds: scenario.caseIds,
        pass: scenario.caseIds.every((id) => caseOf(report, id).status === 'PASS'),
      }),
    ),
  );
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    appVersion: LEARNING_EDGECASES_APP_VERSION,
    report,
    scenarios,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      scenarios: scenarios.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length && scenarios.every((entry) => entry.pass),
    }),
  });
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

export function learningEdgeCasesReportMarkdown(evidence: LearningEdgeCasesEvidenceReport): string {
  const scenarioRows = evidence.scenarios
    .map(
      (entry) => `| ${entry.id} | ${entry.caseIds.join(', ')} | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    )
    .join('\n');
  const caseRows = evidence.report.cases
    .map((entry) => {
      const artifacts = entry.artifacts.map((artifact) => artifact.cause).join(', ') || 'none';
      const windows = entry.windows
        .map((window) => `${window.completeness}/${window.completenessReason}`)
        .join(', ');
      return `| ${entry.caseId} | ${entry.kind} | ${entry.status} | ${escapeCell(artifacts)} | ${escapeCell(windows)} | ${entry.learnedKeys.join(', ') || 'none'} | ${entry.contextsObserved.join(', ') || 'none'} | ${entry.profileChanges} |`;
    })
    .join('\n');
  const checkRows = evidence.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  return `# 107 — learning edge cases

- Contract: \`${evidence.report.version}\`
- Admission adapter: \`${evidence.report.adapterVersion}\`
- App adapter: \`${evidence.appVersion}\`
- Cases: ${evidence.report.summary.cases}
- Checks: ${evidence.summary.passed}/${evidence.summary.checks}
- Overall: ${evidence.summary.pass ? 'PASS' : 'FAIL'}

The harness reuses the real 087 eligibility windows, the real 088 artifact filter, the real 030
recovery ledger and the real 093 parameter-evidence ledger. It never estimates, publishes a
profile, writes a store or mutates a fleet.

## Scenario matrix

| Scenario | Cases | Result |
| --- | --- | --- |
${scenarioRows}

## Cases

| Case | Kind | Result | Artifact causes | Completeness | Learned keys | Contexts observed | Profile changes |
| --- | --- | --- | --- | --- | --- | --- | ---: |
${caseRows}

## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${evidence.summary.scenarios}
- Checks: ${evidence.summary.passed}/${evidence.summary.checks}
- Overall: ${evidence.summary.pass ? 'PASS' : 'FAIL'}
- Learned keys across positive controls: ${evidence.report.summary.learnedKeys.join(', ')}
- Profile changes: ${evidence.report.summary.profileChanges}
- Profile publications: ${evidence.report.summary.profilePublications}
- Store writes: ${evidence.report.summary.storeWrites}
- Fleet mutations: ${evidence.report.summary.fleetMutations}

## Limits

- Observations are deterministic synthetic fixtures shaped like the real 086/087/088/093 records;
  they are not captured gameplay sessions.
- The harness does not run the 094–099 estimators, the 103 worker, the 109/110 profile store or a
  live fleet. A READY key is evidence sufficiency only, never an estimate or a publication.
- Pause and focus-loss facts are built as real 088 suspension inputs with the documented 070
  causes; no headed browser pause/focus probe is included.
- No FPS, GPU, frame-time or hardware claim is made.
`;
}
