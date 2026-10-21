import {
  INVERSE_LEARNING_APP_VERSION,
  inverseLearningReportMarkdown as renderInverseLearningReportMarkdown,
  runInverseLearningValidation,
} from '../../src/app';
import {
  INVERSE_LEARNING_VERSION,
  inverseIdentifiabilityRules,
  inverseProfileIds,
  inverseTolerances,
  knownProfiles,
} from '../../src/experiments';
import type { InverseLearningReport, KeyTolerance } from '../../src/experiments';

export interface InverseLearningCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface InverseLearningEvidenceReport extends InverseLearningReport {
  readonly appVersion: typeof INVERSE_LEARNING_APP_VERSION;
  readonly tolerances: readonly KeyTolerance[];
  readonly checks: readonly InverseLearningCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): InverseLearningCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function statusCount(report: InverseLearningReport, status: string): number {
  return report.scenarios.reduce(
    (total, scenario) => total + scenario.results.filter((row) => row.status === status).length,
    0,
  );
}

function result(report: InverseLearningReport, scenarioId: string, key: string) {
  const scenario = report.scenarios.find((entry) => entry.scenarioId === scenarioId);
  if (!scenario) throw new Error(`Missing report scenario: ${scenarioId}`);
  const row = scenario.results.find((entry) => entry.key === key);
  if (!row) throw new Error(`Missing report key: ${scenarioId}/${key}`);
  return row;
}

function distinctEstimateCount(report: InverseLearningReport, key: string): number {
  return new Set(
    inverseProfileIds.map((profile) => result(report, `PROFILE_${profile}`, key).estimate),
  ).size;
}

export function runInverseLearningReport(): InverseLearningEvidenceReport {
  const report = runInverseLearningValidation();
  const stable = JSON.stringify(report) === JSON.stringify(runInverseLearningValidation());
  const checks: InverseLearningCheck[] = [];
  const profileScenarios = report.scenarios.filter((scenario) => scenario.kind === 'PROFILE');
  const profileWithin = profileScenarios.reduce(
    (total, scenario) => total + scenario.withinTolerance,
    0,
  );
  const profileOutside = profileScenarios.reduce(
    (total, scenario) => total + scenario.outsideTolerance,
    0,
  );
  const profileNotIdentifiable = profileScenarios.reduce(
    (total, scenario) => total + scenario.notIdentifiable,
    0,
  );
  const profileNoEstimate = profileScenarios.reduce(
    (total, scenario) => total + scenario.noEstimate,
    0,
  );
  const sparse = report.scenarios.find((scenario) => scenario.probe === 'SPARSE_EVIDENCE')!;
  const contradictory = report.scenarios.find(
    (scenario) => scenario.probe === 'CONTRADICTORY_EVIDENCE',
  )!;
  const probe = report.scenarios.find((scenario) => scenario.probe === 'OUT_OF_TOLERANCE')!;
  const totalKeys = report.scenarios.reduce((total, scenario) => total + scenario.keys, 0);

  checks.push(
    check('contract-version', INVERSE_LEARNING_VERSION, report.version, '105 harness version'),
    check(
      'app-adapter-version',
      '105-inverse-learning-app-v1',
      INVERSE_LEARNING_APP_VERSION,
      'frozen report adapter version',
    ),
    check('profiles', 4, report.contract.profiles.length, 'prudent/impulsive/reckless/mixed'),
    check(
      'demonstration-scenarios',
      6,
      report.contract.demonstrationScenarios.length,
      'free flow, following, longitudinal, signals, stop/yield, lane change',
    ),
    check('m-keys', 24, report.contract.keys.length, 'only initial_learning_target keys'),
    check('tolerances', 24, inverseTolerances.length, 'one documented tolerance per M key'),
    check(
      'identifiability-rules',
      24,
      inverseIdentifiabilityRules.length,
      'one identifiability rule per M key',
    ),
    check(
      'known-profile-targets',
      96,
      knownProfiles.reduce((total, profile) => total + profile.targets.length, 0),
      'four profiles × 24 explicit targets',
    ),
    check(
      'key-specific-justifications',
      24,
      new Set(inverseTolerances.map((entry) => entry.justifiedBy)).size,
      'no shared default justification text',
    ),
    check(
      'no-uniform-tolerance',
      true,
      new Set(
        inverseTolerances.map((entry) => `${entry.absoluteTolerance}:${entry.relativeTolerance}`),
      ).size > 8,
      'tolerance pairs are spread across keys',
    ),
    check('scenario-count', 7, report.scenarios.length, 'four profiles plus three probes'),
    check('profile-scenarios', 4, profileScenarios.length, 'four profile runs'),
    check(
      'profile-keys-within',
      96,
      profileWithin,
      '24 keys × 4 profiles inside their explicit tolerance',
    ),
    check('profile-outside', 0, profileOutside, 'no profile key is outside tolerance'),
    check(
      'profile-not-identifiable',
      0,
      profileNotIdentifiable,
      'all four profiles identify all 24 keys',
    ),
    check('profile-no-estimate', 0, profileNoEstimate, 'no profile key lacks an estimate'),
    check(
      'distinct-speed',
      4,
      distinctEstimateCount(report, 'speed_delta_urban'),
      'prudent/impulsive/reckless/mixed have four speed estimates',
    ),
    check(
      'distinct-headway',
      4,
      distinctEstimateCount(report, 'following_time_headway'),
      'four distinct time-headway estimates',
    ),
    check(
      'distinct-cooldown',
      4,
      distinctEstimateCount(report, 'lane_change_cooldown'),
      'four distinct lane-change cooldown estimates',
    ),
    check(
      'lane-interval-separation',
      true,
      JSON.stringify(result(report, 'PROFILE_PRUDENT', 'lane_change_front_gap').interval) !==
        JSON.stringify(result(report, 'PROFILE_RECKLESS', 'lane_change_front_gap').interval),
      'interval keys separate prudent from reckless',
    ),
    check('sparse-within', 0, sparse.withinTolerance, 'sparse evidence identifies nothing'),
    check(
      'sparse-not-identifiable',
      24,
      sparse.notIdentifiable,
      'all sparse keys are unidentifiable',
    ),
    check(
      'sparse-no-numeric',
      true,
      sparse.results.every((row) => row.estimate === null && row.interval === null),
      'unidentifiable keys never carry a numeric estimate',
    ),
    check(
      'sparse-single-speed-following',
      'NOT_IDENTIFIABLE',
      result(report, 'SPARSE_EVIDENCE', 'following_time_headway').status,
      'one observed speed cannot identify headway and minimum gap',
    ),
    check(
      'sparse-few-signals',
      'NOT_IDENTIFIABLE',
      result(report, 'SPARSE_EVIDENCE', 'red_stop_probability').status,
      'one RED opportunity is below the three-opportunity threshold',
    ),
    check(
      'sparse-no-lane-changes',
      'NOT_IDENTIFIABLE',
      result(report, 'SPARSE_EVIDENCE', 'lane_change_front_gap').status,
      'no lane change fact means no lane threshold',
    ),
    check(
      'contradictory-outside',
      0,
      contradictory.outsideTolerance,
      'contradiction is not reported as a numeric tolerance failure',
    ),
    check(
      'contradictory-following',
      'CONTRADICTORY_EVIDENCE',
      result(report, 'CONTRADICTORY_EVIDENCE', 'following_time_headway').reason,
      'a negative OLS slope is retained as contradictory evidence',
    ),
    check(
      'contradictory-yield',
      'NOT_IDENTIFIABLE',
      result(report, 'CONTRADICTORY_EVIDENCE', 'yield_time_gap').status,
      'an inverted accepted/refused interval is refused',
    ),
    check(
      'contradictory-lane',
      'NOT_IDENTIFIABLE',
      result(report, 'CONTRADICTORY_EVIDENCE', 'lane_change_front_gap').status,
      'an inverted lane interval is unidentified',
    ),
    check(
      'contradictory-no-numeric',
      true,
      [
        'following_time_headway',
        'following_min_gap',
        'yield_time_gap',
        'lane_change_front_gap',
        'lane_change_back_gap',
        'lane_change_speed_gain',
      ].every(
        (key) =>
          result(report, 'CONTRADICTORY_EVIDENCE', key).estimate === null &&
          result(report, 'CONTRADICTORY_EVIDENCE', key).interval === null,
      ),
      'no contradictory threshold receives a point estimate or interval',
    ),
    check('probe-outside', 1, probe.outsideTolerance, 'one injected wrong estimate is retained'),
    check(
      'probe-retained-failure',
      'speed_delta_urban:OUTSIDE_TOLERANCE',
      probe.retainedFailures.join(','),
      'the report exposes the deliberate failure',
    ),
    check(
      'probe-detector',
      true,
      probe.passed,
      'the detector passes only because it reported the failure',
    ),
    check(
      'probe-is-not-hidden',
      true,
      report.overall.retainedProbeFailures > 0 &&
        report.overall.outsideTolerance === probe.outsideTolerance,
      'probe failures are counted in the overall totals',
    ),
    check(
      'totals-match-results',
      report.overall.keysEvaluated,
      report.overall.withinTolerance +
        report.overall.outsideTolerance +
        report.overall.notIdentifiable +
        report.overall.noEstimate,
      'aggregate status counts sum to the evaluated keys',
    ),
    check('evaluated-keys', 168, report.overall.keysEvaluated, '7 scenarios × 24 keys'),
    check(
      'scenario-key-total',
      totalKeys,
      report.overall.keysEvaluated,
      'scenario key counts sum to the overall total',
    ),
    check(
      'within-tolerance-total',
      statusCount(report, 'WITHIN_TOLERANCE'),
      report.overall.withinTolerance,
      'within-tolerance aggregate matches per-key rows',
    ),
    check(
      'not-identifiable-total',
      statusCount(report, 'NOT_IDENTIFIABLE'),
      report.overall.notIdentifiable,
      'not-identifiable aggregate matches per-key rows',
    ),
    check(
      'profile-failures',
      0,
      report.overall.profileFailures,
      'the four known profiles have no outside/no-estimate key',
    ),
    check('overall-pass', true, report.overall.pass, 'all profile and probe expectations held'),
    check('deterministic', true, stable, 'two runs produce byte-identical reports'),
    check(
      'every-result-has-context',
      true,
      report.scenarios.every((scenario) =>
        scenario.results.every(
          (row) =>
            row.context.length > 10 &&
            row.tolerance.effective > 0 &&
            row.scenarioId === scenario.scenarioId,
        ),
      ),
      'each row carries its context, tolerance and scenario',
    ),
    check(
      'probe-reuses-profile-stream',
      true,
      JSON.stringify(probe.demonstrationSeeds) ===
        JSON.stringify(
          report.scenarios.find((scenario) => scenario.scenarioId === 'PROFILE_PRUDENT')!
            .demonstrationSeeds,
        ),
      'the out-of-tolerance probe reuses the PRUDENT demonstration and only injects the estimate',
    ),
    check(
      'variant-seeds-are-independent',
      true,
      [...sparse.demonstrationSeeds, ...contradictory.demonstrationSeeds].every(
        (seed) => !profileScenarios.some((scenario) => scenario.demonstrationSeeds.includes(seed)),
      ),
      'sparse and contradictory evidence derive their own scenario seeds',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    ...report,
    appVersion: INVERSE_LEARNING_APP_VERSION,
    tolerances: Object.freeze([...inverseTolerances]),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      scenarios: report.scenarios.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

export function inverseLearningReportMarkdown(report: InverseLearningEvidenceReport): string {
  const toleranceRows = report.tolerances
    .map(
      (entry) =>
        `| ${entry.key} | ${entry.absoluteTolerance} | ${entry.relativeTolerance} | ${escapeCell(entry.justifiedBy)} |`,
    )
    .join('\n');
  const targetRows = knownProfiles
    .map(
      (profile) =>
        `| ${profile.profileId} | ${profile.description} | ${profile.targets
          .map((target) => `${target.key}=${target.value}`)
          .join('; ')} |`,
    )
    .join('\n');
  const checkRows = report.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  return `${renderInverseLearningReportMarkdown(report)}
## Tolerance model

Effective bound: \`absolute + relative × |target|\`. Every row is key-specific; there is no uniform default.

| Key | Absolute | Relative | Justification |
| --- | ---: | ---: | --- |
${toleranceRows}

## Known-profile targets

| Profile | Description | Explicit targets |
| --- | --- | --- |
${targetRows}

## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${report.summary.scenarios}
- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
