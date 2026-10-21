import {
  profileUiBindingReport,
  PROFILE_UI_BINDING_LIMITS,
  PROFILE_UI_BINDING_VERSION,
  profileUiMismatchCodes,
  profileUiReasonCodes,
  verifyProfileUiConsistency,
} from '../../src/app';
import type {
  ProfileUiBinding,
  ProfileUiBindingReport,
  ProfileUiBindingReportRow,
  ProfileUiBindingRow,
} from '../../src/app';
import {
  BINDING_BASE,
  BINDING_CURRENT,
  BINDING_HEADWAY_KEY,
  BINDING_NO_CHANGE_KEY,
  BINDING_NO_CHANGE_SEGMENT,
  BINDING_PROFILE,
  BINDING_RESERVED_KEY,
  BINDING_SEGMENT,
  BINDING_TARGET_KEYS,
  BINDING_UNOBSERVED_KEY,
  BINDING_ZERO_KEY,
  baseParameters,
  bindingOf,
  bindingPipeline,
  changedExplanation,
  createBindingActivation,
  createBindingStore,
  currentParameters,
  noChangeExplanation,
  rowFor,
} from './profile-ui-binding-fixture';

export const PROFILE_UI_BINDING_REPORT_KEYS: readonly string[] = Object.freeze([
  ...BINDING_TARGET_KEYS.map((definition) => definition.key),
  BINDING_RESERVED_KEY,
]);

export interface ProfileUiBindingReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfileUiBindingReportScenario {
  readonly name: string;
  readonly profileId: string;
  readonly tick: number;
  readonly hasVersion: boolean;
  readonly hasActivation: boolean;
  readonly versions: ProfileUiBinding['versions'];
  readonly pipeline: ProfileUiBinding['pipeline'];
  readonly explanation: ProfileUiBinding['explanation'];
  readonly counts: ProfileUiBindingReport['counts'];
  readonly mismatches: readonly string[];
  readonly rows: readonly ProfileUiBindingReportRow[];
  readonly pass: boolean;
}

export interface ProfileUiBindingEvidenceReport {
  readonly version: typeof PROFILE_UI_BINDING_VERSION;
  readonly contract: Readonly<{
    rules: readonly string[];
    mismatchCodes: readonly string[];
    reasonCodes: readonly string[];
    limits: Readonly<Record<string, number | string>>;
  }>;
  readonly scenarios: readonly ProfileUiBindingReportScenario[];
  readonly checks: readonly ProfileUiBindingReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): ProfileUiBindingReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function scenarioOf(
  name: string,
  binding: ProfileUiBinding,
  report: ProfileUiBindingReport,
  keys: readonly string[] = PROFILE_UI_BINDING_REPORT_KEYS,
): ProfileUiBindingReportScenario {
  return Object.freeze({
    name,
    profileId: binding.profileId,
    tick: binding.tick,
    hasVersion: binding.hasVersion,
    hasActivation: binding.hasActivation,
    versions: binding.versions,
    pipeline: binding.pipeline,
    explanation: binding.explanation,
    counts: report.counts,
    mismatches: report.mismatches,
    rows: Object.freeze(report.rows.filter((row) => keys.includes(row.key))),
    pass: report.pass,
  });
}

function withRows(
  binding: ProfileUiBinding,
  patch: Readonly<Record<string, Partial<ProfileUiBindingRow>>>,
): readonly ProfileUiBindingRow[] {
  return Object.freeze(
    binding.rows.map((row) => {
      const change = patch[row.key];
      return change === undefined ? row : Object.freeze({ ...row, ...change });
    }),
  );
}

export function runProfileUiBindingReport(): ProfileUiBindingEvidenceReport {
  const store = createBindingStore(),
    activation = createBindingActivation(BINDING_CURRENT),
    base = baseParameters(),
    current = currentParameters(),
    before = JSON.stringify(store.listVersions(BINDING_PROFILE));
  try {
    const pipeline = bindingPipeline({
        status: 'COMPOSED',
        versionId: BINDING_CURRENT,
        segmentId: BINDING_SEGMENT,
        key: BINDING_ZERO_KEY,
      }),
      explanation = changedExplanation(),
      currentBinding = bindingOf({
        store,
        activation: activation.activation,
        pipeline,
      }),
      deltaBinding = bindingOf({
        store,
        activation: activation.activation,
        pipeline,
        explanation,
        selectedVersionId: BINDING_BASE,
      }),
      currentReport = profileUiBindingReport(currentBinding),
      deltaReport = profileUiBindingReport(deltaBinding);

    const noChangeBinding = bindingOf({
        store,
        activation: activation.activation,
        pipeline: bindingPipeline({
          status: 'NO_CHANGE',
          versionId: null,
          reason: 'NO_CHANGE',
          segmentId: BINDING_NO_CHANGE_SEGMENT,
          key: BINDING_NO_CHANGE_KEY,
        }),
        explanation: noChangeExplanation(),
      }),
      noChangeReport = profileUiBindingReport(noChangeBinding);

    const reservedRow = rowFor(deltaBinding, BINDING_RESERVED_KEY),
      unobservedRow = rowFor(deltaBinding, BINDING_UNOBSERVED_KEY),
      zeroRow = rowFor(deltaBinding, BINDING_ZERO_KEY),
      headwayRow = rowFor(deltaBinding, BINDING_HEADWAY_KEY),
      noChangeRow = rowFor(noChangeBinding, BINDING_NO_CHANGE_KEY);

    const emptyBinding = bindingOf({ store: createBindingStore({ empty: true }) });

    const injectedBinding = Object.freeze({
        ...deltaBinding,
        versions: Object.freeze({
          ...deltaBinding.versions,
          panel: 'v9',
          active: BINDING_BASE,
        }),
        delta: Object.freeze({
          ...deltaBinding.delta!,
          baseVersionId: 'v0',
        }),
        history: Object.freeze({
          ...deltaBinding.history!,
          preview: Object.freeze({
            ...deltaBinding.history!.preview!,
            changes: Object.freeze(
              deltaBinding.history!.preview!.changes.map((change) =>
                change.key === BINDING_ZERO_KEY
                  ? Object.freeze({ ...change, previous: 0.25 })
                  : change,
              ),
            ),
          }),
        }),
        rows: withRows(deltaBinding, {
          [BINDING_ZERO_KEY]: {
            panelValue: 0.4,
            reasonCodes: [
              'PROFILE_VALUE_BASE',
              'NO_EVIDENCE_RECORD',
              'CHANGED',
              'EVIDENCE_APPLIED',
            ],
          },
          [BINDING_RESERVED_KEY]: {
            reserved: false,
            observed: true,
            panelStatus: 'OBSERVED',
            panelValue: 5,
            panelEvidenceCount: 0,
            panelUncertainty: 0,
            evidenceReason: 'NO_EVIDENCE_RECORD',
            historyStatus: 'OBSERVED',
            historyValue: 5,
            reasonCodes: ['PROFILE_VALUE_BASE', 'NO_EVIDENCE_RECORD', 'NOT_CHANGED'],
          },
          [BINDING_UNOBSERVED_KEY]: {
            observed: true,
            panelStatus: 'OBSERVED',
            panelValue: 0,
            panelEvidenceCount: 0,
            panelUncertainty: 0,
            evidenceReason: 'NO_EVIDENCE_RECORD',
            historyStatus: 'OBSERVED',
            historyValue: 0,
            reasonCodes: ['PROFILE_VALUE_BASE', 'NO_EVIDENCE_RECORD', 'NOT_CHANGED'],
          },
        }),
      }),
      injectedConsistency = verifyProfileUiConsistency(injectedBinding),
      repeat = bindingOf({ store, activation: activation.activation, pipeline });

    const scenarios = Object.freeze([
      scenarioOf('versiune curentă', currentBinding, currentReport),
      scenarioOf('delta părinte→copil', deltaBinding, deltaReport),
      scenarioOf('cheie rezervată', deltaBinding, deltaReport, [BINDING_RESERVED_KEY]),
      scenarioOf('cheie neobservată', deltaBinding, deltaReport, [BINDING_UNOBSERVED_KEY]),
      scenarioOf('zero real', deltaBinding, deltaReport, [BINDING_ZERO_KEY]),
      scenarioOf('motiv NO_CHANGE', noChangeBinding, noChangeReport, [BINDING_NO_CHANGE_KEY]),
      scenarioOf('abateri injectate', injectedBinding, profileUiBindingReport(injectedBinding)),
    ]);

    const checks = [
      check(
        'contract-version',
        '113-profile-ui-binding-v1',
        PROFILE_UI_BINDING_VERSION,
        'the composition contract version',
      ),
      check(
        'same-panel-version',
        BINDING_CURRENT,
        currentBinding.versions.panel ?? '—',
        'the panel reads the real 109 version',
      ),
      check(
        'same-history-version',
        BINDING_CURRENT,
        currentBinding.versions.history ?? '—',
        'the history reads the same version',
      ),
      check(
        'same-active-version',
        BINDING_CURRENT,
        currentBinding.versions.active ?? '—',
        'the real 110 active target is the same version',
      ),
      check(
        'panel-not-illustrative',
        false,
        currentBinding.panel?.illustrative ?? true,
        'a real version never renders the catalog preview',
      ),
      check('row-count', 80, currentBinding.rows.length, 'one row per catalog key'),
      check('m-key-count', 24, BINDING_TARGET_KEYS.length, 'the 24 initial learning targets'),
      check(
        'm-key-observed',
        23,
        BINDING_TARGET_KEYS.filter((definition) => rowFor(currentBinding, definition.key).observed)
          .length,
        'one M key is deliberately unobserved',
      ),
      check(
        'panel-values-store',
        true,
        BINDING_TARGET_KEYS.every((definition) => {
          const row = rowFor(currentBinding, definition.key);
          return Object.hasOwn(current, definition.key)
            ? row.panelValue === current[definition.key]
            : row.panelValue === null;
        }),
        'every M key panel value equals the immutable 109 record',
      ),
      check(
        'history-values-store',
        true,
        BINDING_TARGET_KEYS.every((definition) => {
          const row = rowFor(currentBinding, definition.key);
          return Object.hasOwn(current, definition.key)
            ? row.historyValue === current[definition.key]
            : row.historyValue === null;
        }),
        'every M key history value equals the same record',
      ),
      check(
        'reserved-status',
        'RESERVED',
        reservedRow.panelStatus ?? '—',
        'an R key is reserved in the panel',
      ),
      check('reserved-value', null, reservedRow.panelValue, 'an R key never carries a value'),
      check(
        'reserved-record-value',
        true,
        typeof store.getVersion(BINDING_CURRENT)!.parameters[BINDING_RESERVED_KEY] === 'number',
        'the 109 record does contain a number for the R key',
      ),
      check(
        'reserved-delta',
        false,
        (deltaBinding.delta?.changes ?? []).some((change) => change.key === BINDING_RESERVED_KEY),
        'the R key is excluded from the learnable delta',
      ),
      check(
        'unobserved-status',
        'UNOBSERVED',
        unobservedRow.panelStatus ?? '—',
        'a missing key stays unobserved',
      ),
      check('unobserved-value', null, unobservedRow.panelValue, 'absence is null, not zero'),
      check(
        'unobserved-history',
        null,
        unobservedRow.historyValue,
        'history keeps the same absence',
      ),
      check('zero-status', 'OBSERVED', zeroRow.panelStatus ?? '—', 'a real zero is observed'),
      check('zero-panel', 0, zeroRow.panelValue, 'the panel shows the real zero'),
      check('zero-history', 0, zeroRow.historyValue, 'the history shows the real zero'),
      check(
        'delta-base',
        BINDING_BASE,
        deltaBinding.delta?.baseVersionId ?? '—',
        'the panel delta base is the real parent',
      ),
      check(
        'delta-zero-previous',
        base[BINDING_ZERO_KEY],
        zeroRow.deltaPrevious,
        'the delta previous value is the parent value',
      ),
      check(
        'delta-zero-next',
        current[BINDING_ZERO_KEY],
        zeroRow.deltaNext,
        'the delta next value is the child value',
      ),
      check(
        'history-preview-from',
        BINDING_CURRENT,
        deltaBinding.history?.preview?.fromVersionId ?? '—',
        'the preview starts at the current version',
      ),
      check(
        'history-preview-to',
        BINDING_BASE,
        deltaBinding.history?.preview?.toVersionId ?? '—',
        'the preview ends at the selected parent',
      ),
      check(
        'history-zero-previous',
        0,
        zeroRow.historyDeltaPrevious,
        'the preview keeps the child zero',
      ),
      check(
        'history-zero-next',
        base[BINDING_ZERO_KEY],
        zeroRow.historyDeltaNext,
        'the preview keeps the parent value',
      ),
      check(
        'reason-zero',
        true,
        zeroRow.reasonCodes.includes('ZERO_OBSERVED'),
        'the changed zero matches the 104 zero code',
      ),
      check(
        'reason-headway',
        true,
        headwayRow.reasonCodes.includes('EVIDENCE_APPLIED'),
        'the changed headway matches the 104 evidence code',
      ),
      check(
        'explanation-version',
        BINDING_CURRENT,
        deltaBinding.explanation?.versionId ?? '—',
        'the 104 explanation belongs to the real version',
      ),
      check(
        'no-change-reason',
        'UNCHANGED_ESTIMATE',
        noChangeBinding.explanation?.noChangeReason ?? '—',
        'the 104 no-change reason is kept verbatim',
      ),
      check(
        'no-change-row',
        true,
        noChangeRow.reasonCodes.includes('NO_CHANGE') &&
          noChangeRow.reasonCodes.includes('UNCHANGED_ESTIMATE'),
        'the row carries the closed no-change codes',
      ),
      check(
        'no-change-no-version',
        null,
        noChangeBinding.explanation?.versionId ?? null,
        'a no-change explanation claims no version',
      ),
      check(
        'missing-version',
        true,
        emptyBinding.mismatches.includes('MISSING_VERSION'),
        'an empty store is an explicit missing version',
      ),
      check(
        'missing-version-no-preview',
        true,
        emptyBinding.panel === null,
        'no illustrative preview is produced',
      ),
      check(
        'missing-version-rows',
        0,
        emptyBinding.rows.length,
        'the empty binding invents no row',
      ),
      check(
        'injected-version',
        true,
        injectedConsistency.mismatches.includes('VERSION_MISMATCH'),
        'a wrong panel version is reported',
      ),
      check(
        'injected-panel-value',
        true,
        injectedConsistency.mismatches.includes('PANEL_VALUE_MISMATCH'),
        'a wrong panel value is reported',
      ),
      check(
        'injected-history-value',
        true,
        injectedConsistency.mismatches.includes('HISTORY_VALUE_MISMATCH'),
        'a wrong history value is reported',
      ),
      check(
        'injected-reserved',
        true,
        injectedConsistency.mismatches.includes('RESERVED_TREATED_AS_OBSERVED'),
        'an R value is reported',
      ),
      check(
        'injected-unobserved',
        true,
        injectedConsistency.mismatches.includes('UNOBSERVED_TREATED_AS_ZERO'),
        'absence reported as zero is reported',
      ),
      check(
        'injected-delta-base',
        true,
        injectedConsistency.mismatches.includes('DELTA_BASE_MISMATCH'),
        'a wrong delta base is reported',
      ),
      check(
        'injected-reason',
        true,
        injectedConsistency.mismatches.includes('REASON_CODE_MISMATCH'),
        'a wrong reason code is reported',
      ),
      check(
        'injected-active',
        true,
        injectedConsistency.mismatches.includes('ACTIVE_TARGET_MISMATCH'),
        'a wrong active target is reported',
      ),
      check('injected-fails', false, injectedConsistency.pass, 'injected mismatches never pass'),
      check(
        'evidence-count',
        0,
        zeroRow.panelEvidenceCount,
        'a bare 109 version carries no evidence count',
      ),
      check(
        'evidence-uncertainty',
        0,
        zeroRow.panelUncertainty,
        'a bare 109 version carries no uncertainty',
      ),
      check(
        'evidence-reason',
        'NO_EVIDENCE_RECORD',
        zeroRow.evidenceReason ?? '—',
        'missing evidence has a closed reason',
      ),
      check(
        'valid-pass',
        true,
        deltaReport.pass && currentReport.pass && noChangeReport.pass,
        'valid bindings pass the verifier',
      ),
      check(
        'valid-no-mismatch',
        0,
        deltaReport.counts.mismatchedRows,
        'no valid row reports a mismatch',
      ),
      check(
        'deterministic',
        JSON.stringify(currentBinding),
        JSON.stringify(repeat),
        'the same inputs produce the same binding',
      ),
      check(
        'store-unchanged',
        before,
        JSON.stringify(store.listVersions(BINDING_PROFILE)),
        'reading the binding never writes the store',
      ),
      check(
        'report-rows',
        80,
        currentReport.rows.length,
        'the per-key report covers every catalog key',
      ),
      check(
        'report-version-ids',
        true,
        currentReport.rows.every(
          (row) =>
            row.versions.panel === BINDING_CURRENT &&
            row.versions.history === BINDING_CURRENT &&
            row.versions.active === BINDING_CURRENT,
        ),
        'every row reports the same three version identities',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: PROFILE_UI_BINDING_VERSION,
      contract: Object.freeze({
        rules: Object.freeze([
          'one immutable 109 version is the only source for the panel, the history and the active target',
          'a real zero stays OBSERVED/0 in both panel and history; absence stays null',
          'reserved R keys stay RESERVED/null even when the record carries a number',
          'a bare 109 version has no evidence record: 0 count, 0 uncertainty, NO_EVIDENCE_RECORD',
          'the panel delta is the real parent→child delta; the history preview compares the same two versions',
          'the 104 explanation is bound to the last 112 result and keeps its closed reason codes',
          'every mismatch is explicit; the verifier never repairs a value or a version',
        ]),
        mismatchCodes: Object.freeze([...profileUiMismatchCodes]),
        reasonCodes: Object.freeze([...profileUiReasonCodes]),
        limits: Object.freeze({
          parameters: PROFILE_UI_BINDING_LIMITS.parameters,
          retainedViews: PROFILE_UI_BINDING_LIMITS.retainedViews,
          history: PROFILE_UI_BINDING_LIMITS.history,
        }),
      }),
      scenarios,
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    activation.dispose();
  }
}

export function profileUiBindingReportMarkdown(report: ProfileUiBindingEvidenceReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Profile | ${entry.profileId} |
| Versions panel/history/active | ${entry.versions.panel ?? '—'} / ${entry.versions.history ?? '—'} / ${entry.versions.active ?? '—'} |
| Parent / selected | ${entry.versions.parent ?? '—'} / ${entry.versions.selected ?? '—'} |
| Pipeline | ${entry.pipeline.status ?? '—'} · ${entry.pipeline.versionId ?? '—'} |
| Explanation | ${entry.explanation?.status ?? '—'} · ${entry.explanation?.noChangeReason ?? '—'} |
| Rows | ${entry.counts.rows} · observed ${entry.counts.observed} · unobserved ${entry.counts.unobserved} · reserved ${entry.counts.reserved} · changed ${entry.counts.changed} |
| Mismatches | ${entry.mismatches.length === 0 ? 'none' : entry.mismatches.join(', ')} |
| Pass | ${entry.pass} |

| Key | Panel | History | Delta | History delta | Reasons |
| --- | --- | --- | --- | --- | --- |
${entry.rows
  .map(
    (row) =>
      `| ${row.key} | ${row.panel.status ?? '—'} ${row.panel.value ?? '—'} | ${row.history.status} ${row.history.value ?? '—'} | ${
        row.delta === null ? '—' : `${row.delta.previous} → ${row.delta.next}`
      } | ${
        row.historyDelta === null
          ? '—'
          : `${row.historyDelta.previous ?? '—'} → ${row.historyDelta.next ?? '—'}`
      } | ${row.reasonCodes.join(', ')} |`,
  )
  .join('\n')}
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 113 profile UI binding report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run profile:ui-binding\`;
it contains no wall-clock value, random value, browser state or hardware measurement.

Version: \`${report.version}\`. The report reads real 109 stores, a real 110 controller and a real 104
snapshot; it does not use the 077 illustrative preview.

## Contract

Rules: ${report.contract.rules.join('; ')}.

Mismatch codes: ${report.contract.mismatchCodes.join(', ')}.

Reason codes: ${report.contract.reasonCodes.join(', ')}.

Limits: ${report.contract.limits.parameters} catalog rows, ${report.contract.limits.retainedViews}
retained view and ${report.contract.limits.history} history rows.

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Scenarios: ${report.scenarios.length}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
