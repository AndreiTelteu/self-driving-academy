import {
  LEARNING_GATE24_APP_VERSION,
  learningGate24Markdown as renderLearningGate24Markdown,
  readLearningGate24,
  runInverseLearningValidation,
  runLearningEdgeCaseRegressions,
} from '../../src/app';
import {
  LEARNING_GATE24_VERSION,
  gateEstimatorKeySets,
  learningGate24MKeys,
} from '../../src/experiments';
import type {
  GateEstimatorKeySet,
  InverseScenarioResult,
  LearningGate24Input,
  LearningGate24Report,
} from '../../src/experiments';
import { parameterEvidenceSpecs } from '../../src/learning';
import { opportunityKinds } from '../../src/telemetry';

export interface LearningGate24Check {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LearningGate24ScenarioEvidence {
  readonly scenarioId: string;
  readonly detail: string;
  readonly gateStatus: 'OPEN' | 'CLOSED';
  readonly validated: number;
  readonly unvalidated: readonly string[];
  readonly checks: readonly LearningGate24Check[];
}

export interface LearningGate24EvidenceReport {
  readonly version: typeof LEARNING_GATE24_VERSION;
  readonly appVersion: typeof LEARNING_GATE24_APP_VERSION;
  readonly gate: LearningGate24Report;
  readonly scenarios: readonly LearningGate24ScenarioEvidence[];
  readonly checks: readonly LearningGate24Check[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
    gateStatus: 'OPEN' | 'CLOSED';
    carrierKeys: readonly string[];
    unvalidated: readonly string[];
  }>;
}

const inverse = runInverseLearningValidation();
const edgeCases = runLearningEdgeCaseRegressions();
const real = readLearningGate24({ inverseReport: inverse, edgeCaseReport: edgeCases });

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): LearningGate24Check {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function injected(matrix: LearningGate24Input): LearningGate24Report {
  return readLearningGate24({ matrix, inverseReport: inverse, edgeCaseReport: edgeCases });
}

function rowOf(target: LearningGate24Report, key: string) {
  const row = target.matrix.find((entry) => entry.key === key);
  if (!row) throw new Error(`Missing gate row: ${key}`);
  return row;
}

function withoutEstimatorKey(key: string): GateEstimatorKeySet[] {
  return gateEstimatorKeySets.map((entry) => ({
    owner: entry.owner,
    keys: entry.keys.filter((candidate) => candidate !== key),
  }));
}

function withoutScenarioKey(key: string): InverseScenarioResult[] {
  return inverse.scenarios.map((scenario) => ({
    ...scenario,
    results: scenario.results.filter((row) => row.key !== key),
  }));
}

const specByKey = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));

const missingEstimator = injected({
  estimatorKeySets: withoutEstimatorKey('lane_change_cooldown'),
});
const missingOpportunity = injected({
  opportunityKinds: opportunityKinds.filter((kind) => kind !== 'RED' && kind !== 'LANE_CHANGE'),
});
const failedScenario = injected({
  inverseScenarios: inverse.scenarios.map((scenario) =>
    scenario.scenarioId === 'PROFILE_PRUDENT'
      ? {
          ...scenario,
          results: scenario.results.map((row) =>
            row.key === 'speed_delta_urban'
              ? { ...row, status: 'OUTSIDE_TOLERANCE' as const }
              : row,
          ),
        }
      : scenario,
  ),
});
const missingScenario = injected({
  inverseScenarios: withoutScenarioKey('green_start_delay'),
});
const missingEdgeCase = injected({
  edgeCases: edgeCases.cases.filter(
    (entry) => !(entry.kind === 'POSITIVE' && entry.contextsObserved.includes('LEADER')),
  ),
});
const duplicateOwner = injected({
  estimatorKeySets: [...gateEstimatorKeySets, { owner: '095', keys: ['speed_delta_urban'] }],
});
const foreignKey = injected({
  estimatorKeySets: [...gateEstimatorKeySets, { owner: '094', keys: ['speed_delta_arterial'] }],
});
const extraMKey = injected({ mKeys: [...learningGate24MKeys, 'speed_delta_arterial'] });

const fullMatrixChecks: LearningGate24Check[] = [
  check('gate-status', 'CLOSED', real.gateStatus, 'all 24 M keys validated'),
  check('registry-m-keys', 24, real.counts.registryMKeys, '092 initial_learning_target count'),
  check('matrix-rows', 24, real.matrix.length, 'one row per M key'),
  check('validated-rows', 24, real.counts.validated, 'every key passed all five sources'),
  check('unvalidated-rows', 0, real.counts.unvalidated, 'no unvalidated key remains'),
  check('estimator-owners', 6, real.counts.estimatorOwners, '094–099 all own at least one key'),
  check('channels', 7, real.counts.channels, 'all 093 channels are represented'),
  check('contexts', 2, real.counts.contexts, 'FREE_TRAFFIC and LEADER contexts'),
  check('scenario-results', 96, real.counts.scenarioResults, '24 keys × 4 profiles'),
  check('edge-cases', 13, real.counts.edgeCases, 'closed 107 case set'),
  check(
    'units-from-093',
    true,
    real.matrix.every((row) => specByKey.get(row.key)?.unit === row.unit),
    'every row carries the 092 unit through its 093 spec',
  ),
  check(
    'reasons-empty',
    true,
    real.matrix.every((row) => row.reasons.length === 0),
    'validated rows carry no residual reason',
  ),
];

const missingEstimatorChecks: LearningGate24Check[] = [
  check(
    'gate-status',
    'OPEN',
    missingEstimator.gateStatus,
    'a missing owner cannot close the gate',
  ),
  check(
    'unvalidated-rows',
    1,
    missingEstimator.unvalidated.length,
    'only the affected key remains',
  ),
  check(
    'unvalidated-key',
    'lane_change_cooldown',
    missingEstimator.unvalidated[0]?.key ?? '—',
    'the key removed from the 099 set',
  ),
  check(
    'reason',
    'NO_ESTIMATOR',
    rowOf(missingEstimator, 'lane_change_cooldown').reasons.join(','),
    'the reason is closed and exact',
  ),
  check('validated-rows', 23, missingEstimator.counts.validated, 'the other keys are unaffected'),
];

const missingOpportunityChecks: LearningGate24Check[] = [
  check('gate-status', 'OPEN', missingOpportunity.gateStatus, 'a missing 086 kind opens the gate'),
  check(
    'red-reason',
    'NO_OPPORTUNITY',
    rowOf(missingOpportunity, 'red_stop_probability').reasons.join(','),
    'RED is no longer available',
  ),
  check(
    'lane-reason',
    'NO_OPPORTUNITY',
    rowOf(missingOpportunity, 'lane_change_cooldown').reasons.join(','),
    'LANE_CHANGE is no longer available',
  ),
  check(
    'green-start-still-valid',
    true,
    rowOf(missingOpportunity, 'green_start_delay').validated,
    'GREEN remains a dedicated opportunity for green_start_delay',
  ),
  check(
    'dedicated-keys',
    5,
    missingOpportunity.counts.dedicatedKeys,
    'only green start plus the four STOP/YIELD keys stay dedicated',
  ),
];

const failedScenarioChecks: LearningGate24Check[] = [
  check(
    'gate-status',
    'OPEN',
    failedScenario.gateStatus,
    'a retained failure cannot close the gate',
  ),
  check(
    'reason',
    'SCENARIO_FAILED',
    rowOf(failedScenario, 'speed_delta_urban').reasons.join(','),
    'outside tolerance is a closed failure reason',
  ),
  check(
    'within-tolerance',
    3,
    rowOf(failedScenario, 'speed_delta_urban').scenariosWithinTolerance,
    'three profiles remain inside tolerance',
  ),
  check(
    'retained-failure',
    'OUTSIDE_TOLERANCE',
    rowOf(failedScenario, 'speed_delta_urban').scenarios.find(
      (entry) => entry.profileId === 'PRUDENT',
    )?.status ?? '—',
    'the real 105 status is preserved, not rewritten',
  ),
  check(
    'signature-changes',
    true,
    failedScenario.signature !== real.signature,
    'the deterministic signature covers the failure',
  ),
];

const carrierChecks: LearningGate24Check[] = [
  check('carrier-keys', 12, real.counts.carrierKeys, '094–096 keys have no dedicated 086 kind'),
  check('dedicated-keys', 12, real.counts.dedicatedKeys, '097–099 keys have dedicated kinds'),
  check(
    'carrier-list',
    [
      'speed_delta_urban',
      'speed_delta_residential',
      'curve_lateral_accel',
      'intersection_approach_speed',
      'desired_acceleration',
      'comfort_deceleration',
      'acceleration_jerk',
      'brake_reaction_delay',
      'following_time_headway',
      'following_min_gap',
      'queue_standstill_gap',
      'following_speed_gain',
    ].join(','),
    real.carrierKeys.join(','),
    'carrier keys are listed explicitly',
  ),
  check(
    'roles-uniform',
    true,
    real.matrix.every((row) =>
      row.opportunities.every((entry) => entry.role === row.opportunityRole),
    ),
    'a row never mixes dedicated and carrier roles',
  ),
  check(
    'carrier-kinds',
    'GREEN,STOP',
    [
      ...new Set(
        real.matrix
          .filter((row) => row.opportunityRole === 'CARRIER')
          .flatMap((row) => row.opportunities.map((entry) => entry.kind)),
      ),
    ]
      .sort()
      .join(','),
    '086 has no dedicated free-flow/following kind',
  ),
  check(
    'carrier-no-dedicated-kind',
    true,
    real.matrix
      .filter((row) => row.opportunityRole === 'CARRIER')
      .every((row) =>
        row.opportunities.every((entry) => entry.kind === 'GREEN' || entry.kind === 'STOP'),
      ),
    'RED/YIELD/LANE_CHANGE are never presented as carriers',
  ),
  check(
    'carrier-opportunities',
    16,
    real.counts.carrierOpportunities,
    '12 single-kind carriers plus four following keys with GREEN+STOP',
  ),
];

const duplicateChecks: LearningGate24Check[] = [
  check('duplicate-open', 'OPEN', duplicateOwner.gateStatus, 'duplicate ownership opens the gate'),
  check(
    'duplicate-reason',
    'DUPLICATE_OWNER',
    rowOf(duplicateOwner, 'speed_delta_urban').reasons.join(','),
    'the key has two estimator owners',
  ),
  check(
    'duplicate-owners',
    '094,095',
    rowOf(duplicateOwner, 'speed_delta_urban').estimatorOwners.join(','),
    'both real owners are reported',
  ),
  check('foreign-open', 'OPEN', foreignKey.gateStatus, 'a foreign key opens the gate'),
  check(
    'foreign-keys',
    'speed_delta_arterial',
    foreignKey.foreignKeys.join(','),
    'an R key is never accepted as an M key',
  ),
  check(
    'foreign-matrix-error',
    'FOREIGN_KEY',
    foreignKey.matrixErrors.join(','),
    'the defect is reported at report level',
  ),
  check('extra-key-open', 'OPEN', extraMKey.gateStatus, 'an injected 25th key opens the gate'),
  check(
    'extra-key-mismatch',
    true,
    extraMKey.matrixErrors.includes('M_KEY_SET_MISMATCH'),
    'the M-key set must be exactly the 092 24',
  ),
];

const allReports = [
  real,
  missingEstimator,
  missingOpportunity,
  failedScenario,
  missingScenario,
  missingEdgeCase,
  duplicateOwner,
  foreignKey,
  extraMKey,
];

const openClosedChecks: LearningGate24Check[] = [
  check(
    'closed-only-at-24',
    true,
    real.gateStatus === 'CLOSED' && real.counts.validated === 24 && real.counts.unvalidated === 0,
    'the real data closes the gate at 24/24',
  ),
  check('missing-edge-open', 'OPEN', missingEdgeCase.gateStatus, 'a missing 107 context opens it'),
  check(
    'missing-edge-reason',
    'NO_EDGE_CASE',
    rowOf(missingEdgeCase, 'following_time_headway').reasons.join(','),
    'the LEADER context lost its positive 107 coverage',
  ),
  check(
    'status-invariant',
    true,
    allReports.every(
      (entry) =>
        entry.gateStatus ===
        (entry.matrix.length > 0 &&
        entry.counts.unvalidated === 0 &&
        entry.mKeySetMatches092 &&
        entry.matrixErrors.length === 0
          ? 'CLOSED'
          : 'OPEN'),
    ),
    'the gate is derived from rows and matrix defects',
  ),
  check(
    'counts-invariant',
    true,
    allReports.every(
      (entry) =>
        entry.counts.validated + entry.counts.unvalidated === entry.matrix.length &&
        entry.counts.validated === entry.matrix.filter((row) => row.validated).length,
    ),
    'validated plus unvalidated always equals the matrix rows',
  ),
  check(
    'reasons-invariant',
    true,
    allReports.every((entry) =>
      entry.matrix.every((row) =>
        row.validated ? row.reasons.length === 0 : row.reasons.length > 0,
      ),
    ),
    'validated rows have no reasons and unvalidated rows always do',
  ),
];

function scenario(
  scenarioId: string,
  detail: string,
  report: LearningGate24Report,
  checks: readonly LearningGate24Check[],
): LearningGate24ScenarioEvidence {
  return Object.freeze({
    scenarioId,
    detail,
    gateStatus: report.gateStatus,
    validated: report.counts.validated,
    unvalidated: Object.freeze(
      report.unvalidated.map((entry) => `${entry.key}:${entry.reasons.join(',')}`),
    ),
    checks: Object.freeze([...checks]),
  });
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

export function runLearningGate24Report(): LearningGate24EvidenceReport {
  const scenarios = Object.freeze([
    scenario('FULL_MATRIX', 'real 092/093/086/094–099/105/107 exports', real, fullMatrixChecks),
    scenario(
      'MISSING_ESTIMATOR',
      'lane_change_cooldown removed from the 099 key set',
      missingEstimator,
      missingEstimatorChecks,
    ),
    scenario(
      'MISSING_OPPORTUNITY',
      'RED and LANE_CHANGE removed from the 086 vocabulary',
      missingOpportunity,
      missingOpportunityChecks,
    ),
    scenario(
      'FAILED_SCENARIO',
      'PROFILE_PRUDENT/speed_delta_urban forced OUTSIDE_TOLERANCE',
      failedScenario,
      failedScenarioChecks,
    ),
    scenario(
      'CARRIER_TRANSPARENCY',
      'dedicated versus carrier opportunity roles',
      real,
      carrierChecks,
    ),
    scenario(
      'DUPLICATE_INJECTED',
      'duplicate owner, foreign key and injected 25th key',
      duplicateOwner,
      duplicateChecks,
    ),
    scenario('OPEN_VS_CLOSED', 'gate derived from rows and matrix defects', real, openClosedChecks),
  ]);
  const checks = Object.freeze(scenarios.flatMap((entry) => [...entry.checks]));
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: LEARNING_GATE24_VERSION,
    appVersion: LEARNING_GATE24_APP_VERSION,
    gate: real,
    scenarios,
    checks,
    summary: Object.freeze({
      scenarios: scenarios.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
      gateStatus: real.gateStatus,
      carrierKeys: real.carrierKeys,
      unvalidated: Object.freeze(real.unvalidated.map((entry) => entry.key)),
    }),
  });
}

export function learningGate24ReportMarkdown(report: LearningGate24EvidenceReport): string {
  const scenarioRows = report.scenarios
    .map(
      (entry) =>
        `| ${entry.scenarioId} | ${entry.gateStatus} | ${entry.validated} | ${escapeCell(
          entry.unvalidated.length === 0 ? '—' : entry.unvalidated.join(', '),
        )} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  const checkRows = report.checks
    .map(
      (entry) =>
        `| ${escapeCell(entry.name)} | ${escapeCell(String(entry.expected))} | ${escapeCell(
          String(entry.actual),
        )} | ${entry.pass ? 'PASS' : 'FAIL'} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  return `${renderLearningGate24Markdown(report.gate)}
## Evidence scenarios

| Scenario | Gate | Validated | Unvalidated | Detail |
| --- | --- | ---: | --- | --- |
${scenarioRows}

## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${report.summary.scenarios}
- Checks: ${report.summary.passed}/${report.summary.checks}
- Real gate: ${report.summary.gateStatus}
- Carrier keys: ${report.summary.carrierKeys.length}
- Unvalidated keys: ${report.summary.unvalidated.length}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
