import {
  CROSS_CLASS_FIDELITY_APP_VERSION,
  crossClassFidelityReportMarkdown as renderCrossClassFidelityReportMarkdown,
  runCrossClassFidelityValidation,
} from '../../src/app';
import {
  CROSS_CLASS_FIDELITY_VERSION,
  MECHANICAL_CAPABILITY_COPY_CODE,
  crossClassCapability,
  crossClassIds,
  crossClassKeys,
  crossClassStyleIds,
  crossClassTolerances,
  crossClassTrendKeys,
  unrepresentableBehaviourIds,
} from '../../src/experiments';
import type { CrossClassFidelityReport, CrossClassStyleRun } from '../../src/experiments';

export interface CrossClassFidelityCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CrossClassFidelityEvidenceReport extends CrossClassFidelityReport {
  readonly appVersion: typeof CROSS_CLASS_FIDELITY_APP_VERSION;
  readonly scenarios: readonly string[];
  readonly tolerances: typeof crossClassTolerances;
  readonly checks: readonly CrossClassFidelityCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

const scenarioIds = Object.freeze([
  'SEDAN_CAUTIOUS',
  'SEDAN_ASSERTIVE',
  'COMPACT_CAUTIOUS',
  'COMPACT_ASSERTIVE',
  'COMMON_PROFILE_BOTH_FLEETS',
  'SAME_ROUTE_MANUAL_VS_LEARNING',
  'UNREPRESENTABLE_MANOEUVRE',
]);

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): CrossClassFidelityCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function runOf(
  report: CrossClassFidelityReport,
  style: string,
  classId: string,
): CrossClassStyleRun {
  const found = report.runs.find((entry) => entry.style === style && entry.classId === classId);
  if (!found) throw new Error(`Missing 106 run: ${style}/${classId}`);
  return found;
}

function countKeyRows(report: CrossClassFidelityReport): number {
  return report.runs.reduce((total, run) => total + run.keys.length, 0);
}

export function runCrossClassFidelityReport(): CrossClassFidelityEvidenceReport {
  const report = runCrossClassFidelityValidation();
  const stable = JSON.stringify(report) === JSON.stringify(runCrossClassFidelityValidation());
  const injected = runCrossClassFidelityValidation({
    commonProfileOverrides: {
      desired_acceleration: crossClassCapability('sedan').maxAccelerationMps2,
    },
  });
  const checks: CrossClassFidelityCheck[] = [];
  const manual = report.modeFidelity.manual;
  const learning = report.modeFidelity.learningEligible;
  const ineligible = report.modeFidelity.learningIneligible;
  const curve = report.trend.find((row) => row.key === 'curve_lateral_accel');
  const sedanAssertive = runOf(report, 'ASSERTIVE', 'sedan');
  const compactAssertive = runOf(report, 'ASSERTIVE', 'compact');
  const accelerationDiffer = Math.abs(
    sedanAssertive.mechanical.rawP50.accelerationMps2 -
      compactAssertive.mechanical.rawP50.accelerationMps2,
  );
  const normalizedDiffer = Math.abs(
    sedanAssertive.mechanical.normalizedP50.acceleration -
      compactAssertive.mechanical.normalizedP50.acceleration,
  );

  checks.push(
    check('contract-version', CROSS_CLASS_FIDELITY_VERSION, report.version, '106 harness version'),
    check(
      'app-adapter-version',
      '106-cross-class-fidelity-app-v1',
      CROSS_CLASS_FIDELITY_APP_VERSION,
      'frozen report adapter version',
    ),
    check('classes', 2, report.contract.classes.length, 'sedan and compact real 023 classes'),
    check('styles', 2, report.contract.styles.length, 'cautious and assertive'),
    check('keys', 8, report.contract.keys.length, 'eight class-normalizable M keys'),
    check('trend-keys', 8, crossClassTrendKeys.length, 'one ordering rule per key'),
    check('tolerances', 8, crossClassTolerances.length, 'one documented tolerance per key'),
    check(
      'style-targets-from-105',
      true,
      report.contract.styleSources.CAUTIOUS === 'PRUDENT' &&
        report.contract.styleSources.ASSERTIVE === 'IMPULSIVE',
      'styles reuse the 105 PRUDENT/IMPULSIVE targets',
    ),
    check('style-runs', 4, report.runs.length, 'two styles × two classes'),
    check(
      'scenario-count',
      7,
      scenarioIds.length,
      'four class/style + common + mode + out-of-scope',
    ),
    check('trend-preserved', true, report.trendPreserved, 'cautious < assertive in both classes'),
    check(
      'normalized-agreement',
      true,
      report.normalizedAgreement,
      'cross-class estimates stay within the per-key tolerance',
    ),
    check(
      'sedan-order',
      true,
      report.trend.every((row) => row.classOrderPreserved.sedan),
      'sedan preserves every documented ordering',
    ),
    check(
      'compact-order',
      true,
      report.trend.every((row) => row.classOrderPreserved.compact),
      'compact preserves every documented ordering',
    ),
    check(
      'per-key-agreement',
      true,
      report.trend.every((row) => row.agreement <= row.tolerance.effective),
      'every agreement is inside its declared effective bound',
    ),
    check(
      'curve-class-reconstruction',
      true,
      curve !== undefined &&
        curve.tolerance.source === '106-CLASS-RECONSTRUCTION' &&
        curve.agreement <= curve.tolerance.effective,
      '094 curve SI is reconstructed with the observed class ceiling and documented',
    ),
    check(
      'mechanical-raw-differs',
      true,
      accelerationDiffer > 0.05,
      `compact raw acceleration differs by ${accelerationDiffer.toFixed(4)} m/s²`,
    ),
    check(
      'normalized-demand-stable',
      true,
      normalizedDiffer <= 0.05,
      `normalized acceleration demand differs by ${normalizedDiffer.toFixed(6)}`,
    ),
    check(
      'mechanical-not-copied',
      false,
      report.mechanicalCopied,
      'the common profile carries style, not a class ceiling',
    ),
    check(
      'copy-code-absent',
      'none',
      report.mechanicalCopyCode === null ? 'none' : report.mechanicalCopyCode,
      'no mechanical copy in the default run',
    ),
    check(
      'injected-copy-detected',
      true,
      injected.mechanicalCopied,
      'injecting the sedan acceleration ceiling as a profile value fails',
    ),
    check(
      'injected-copy-code',
      MECHANICAL_CAPABILITY_COPY_CODE,
      injected.mechanicalCopyCode ?? 'none',
      'the failure carries MECHANICAL_CAPABILITY_COPIED',
    ),
    check(
      'injected-copy-fails-report',
      false,
      injected.overall.pass,
      'the injected copy is not hidden by the aggregate',
    ),
    check(
      'common-profiles',
      2,
      report.commonProfiles.length,
      'one common profile per demonstrated style',
    ),
    check(
      'common-taxi-civilian-same',
      true,
      report.overall.commonProfileSameAcrossKinds,
      'TAXI and CIVILIAN receive the same parameter set',
    ),
    check(
      'common-no-class-overrides',
      true,
      report.overall.commonProfileNoClassOverrides,
      'no class-specific mechanical override exists',
    ),
    check(
      'common-both-classes',
      true,
      report.commonProfiles.every((profile) => profile.appliedToBothClasses),
      'both real classes accept the common profile',
    ),
    check(
      'manual-no-change',
      true,
      report.overall.manualNoLearning,
      'MANUAL on the same route changes nothing',
    ),
    check(
      'manual-no-candidate-version',
      true,
      manual.candidate === null && manual.versionId === null && manual.delta === null,
      'MANUAL has no candidate or version',
    ),
    check('manual-reason', 'MANUAL_NO_LEARNING', manual.reason, 'MANUAL reason is explicit'),
    check(
      'manual-real-gate',
      'MANUAL_SEGMENT_NOT_LEARNABLE',
      manual.gate.reason ?? manual.gate.status,
      'the real 103 admission gate rejects MANUAL',
    ),
    check(
      'learning-eligible-changed',
      true,
      report.overall.learningEligibleChanged,
      'eligible LEARNING produces a candidate delta',
    ),
    check(
      'learning-eligible-candidate',
      true,
      learning.candidate !== null && learning.delta !== null && learning.versionId !== null,
      'the candidate and version are present',
    ),
    check(
      'learning-eligible-evidence',
      'READY',
      learning.evidence?.status ?? 'MISSING',
      'the change is tied to the real 093 evidence',
    ),
    check(
      'learning-ineligible-unchanged',
      true,
      report.overall.learningIneligibleUnchanged,
      'ineligible LEARNING changes nothing',
    ),
    check(
      'learning-ineligible-reason',
      'INELIGIBLE',
      ineligible.reason,
      'the ineligible reason is explicit',
    ),
    check(
      'same-route-identical',
      true,
      report.overall.sameRoute,
      'MANUAL and LEARNING share the same physical route and observation digest',
    ),
    check(
      'unrepresentable-count',
      4,
      report.unrepresentable.length,
      'the closed unrepresentable set is complete',
    ),
    check(
      'unrepresentable-null-estimate',
      true,
      report.unrepresentable.every(
        (entry) => entry.result === 'UNREPRESENTABLE' && entry.estimate === null,
      ),
      'no unrepresentable behaviour receives an estimate',
    ),
    check(
      'unrepresentable-no-key-value',
      true,
      report.unrepresentable.every((entry) => entry.key === null && entry.value === null),
      'no fabricated parameter key or value',
    ),
    check(
      'out-of-scope-manoeuvre',
      'UNREPRESENTABLE',
      report.outOfScopeManoeuvre.result,
      'the evasive hazard swerve is retained as UNREPRESENTABLE',
    ),
    check('no-store-writes', 0, report.overall.storeWrites, 'no profile store was written'),
    check('no-fleet-mutations', 0, report.overall.fleetMutations, 'no fleet vehicle was mutated'),
    check(
      'no-profile-publication',
      0,
      report.overall.profilePublications,
      'no profile version was published',
    ),
    check('deterministic', true, stable, 'two runs produce byte-identical reports'),
    check('key-row-count', 32, countKeyRows(report), 'four runs × eight keys'),
    check(
      'overall-pass',
      true,
      report.overall.pass,
      'all trend, profile, mode and unrepresentable expectations hold',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    ...report,
    appVersion: CROSS_CLASS_FIDELITY_APP_VERSION,
    scenarios: scenarioIds,
    tolerances: crossClassTolerances,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      scenarios: scenarioIds.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

export function crossClassFidelityReportMarkdown(report: CrossClassFidelityEvidenceReport): string {
  const toleranceRows = report.tolerances
    .map(
      (entry) =>
        `| ${entry.key} | ${entry.absoluteTolerance} | ${entry.relativeTolerance} | ${entry.effective} | ${entry.source} | ${escapeCell(entry.justifiedBy)} |`,
    )
    .join('\n');
  const checkRows = report.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  const scenarioRows = report.scenarios
    .map((scenario) => {
      const passed =
        scenario === 'COMMON_PROFILE_BOTH_FLEETS'
          ? report.overall.commonProfileSameAcrossKinds &&
            report.overall.commonProfileNoClassOverrides
          : scenario === 'SAME_ROUTE_MANUAL_VS_LEARNING'
            ? report.overall.manualNoLearning &&
              report.overall.learningEligibleChanged &&
              report.overall.learningIneligibleUnchanged &&
              report.overall.sameRoute
            : scenario === 'UNREPRESENTABLE_MANOEUVRE'
              ? report.overall.unrepresentableReported
              : report.trendPreserved && report.normalizedAgreement;
      return `| ${scenario} | ${passed ? 'PASS' : 'FAIL'} |`;
    })
    .join('\n');
  return `${renderCrossClassFidelityReportMarkdown(report)}
## Scenario matrix

| Scenario | Result |
| --- | --- |
${scenarioRows}

## Tolerance justifications

| Key | Absolute | Relative | Effective | Source | Justification |
| --- | ---: | ---: | ---: | --- | --- |
${toleranceRows}

## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${report.summary.scenarios}
- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
- Classes: ${crossClassIds.join(', ')}
- Styles: ${crossClassStyleIds.join(', ')}
- Keys: ${crossClassKeys.length}
- Unrepresentable behaviours: ${unrepresentableBehaviourIds.join(', ')}
`;
}
