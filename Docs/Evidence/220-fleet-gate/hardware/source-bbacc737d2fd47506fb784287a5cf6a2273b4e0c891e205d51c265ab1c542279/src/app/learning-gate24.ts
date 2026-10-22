import { evaluateLearningGate24, gateProfileIds } from '../experiments';
import type {
  InverseLearningReport,
  LearningEdgeCaseReport,
  LearningGate24Input,
  LearningGate24Report,
  LearningGate24Row,
} from '../experiments';
import { runInverseLearningValidation } from './inverse-learning';
import { runLearningEdgeCaseRegressions } from './learning-edgecases';

/** Report/composition layer for 108. It adds no UI, persistence, publication or fleet path. */
export const LEARNING_GATE24_APP_VERSION = '108-learning-gate24-app-v1' as const;

export interface LearningGate24ReadOptions {
  /** Optional matrix overrides for tests; the real 092/093/086/094–099 sources stay the default. */
  readonly matrix?: LearningGate24Input;
  /** Optional precomputed 105 report; the real `runInverseLearningValidation()` is reused by default. */
  readonly inverseReport?: InverseLearningReport;
  /** Optional precomputed 107 report; the real `runLearningEdgeCaseRegressions()` is reused by default. */
  readonly edgeCaseReport?: LearningEdgeCaseReport;
}

/**
 * Reads the real 108 coverage report. The 105 report is produced by the existing
 * `runInverseLearningValidation()` and the 107 cases by `runLearningEdgeCaseRegressions()`, so the
 * gate never duplicates either harness and never runs an estimator of its own.
 */
export function readLearningGate24(options: LearningGate24ReadOptions = {}): LearningGate24Report {
  const inverse = options.inverseReport ?? runInverseLearningValidation();
  const edgeCase = options.edgeCaseReport ?? runLearningEdgeCaseRegressions();
  return evaluateLearningGate24({
    inverseScenarios: inverse.scenarios,
    edgeCases: edgeCase.cases,
    ...options.matrix,
  });
}

const BACKTICK = '`';

function code(value: string | number | boolean): string {
  return `${BACKTICK}${String(value)}${BACKTICK}`;
}

function scenarioCell(row: LearningGate24Row): string {
  if (row.scenarios.length === 0) return 'MISSING';
  return row.scenarios.map((entry) => `${entry.profileId}=${entry.status}`).join('<br>');
}

function edgeCaseCell(row: LearningGate24Row): string {
  return row.edgeCaseIds.length === 0 ? '—' : row.edgeCaseIds.join(', ');
}

function opportunityCell(row: LearningGate24Row): string {
  return row.opportunities.length === 0
    ? '—'
    : row.opportunities.map((entry) => `${entry.kind} (${entry.role})`).join(' + ');
}

/**
 * Evidence table for the coverage report. The carrier relation is printed as data, never hidden:
 * a key carried by GREEN/STOP is visibly different from a key with a dedicated 086 opportunity.
 */
export function learningGate24Markdown(report: LearningGate24Report): string {
  const expectedScenarios = gateProfileIds.length;
  const rows = report.matrix
    .map(
      (row, index) =>
        '| ' +
        [
          index + 1,
          row.key,
          row.estimatorOwner ?? '—',
          row.channel ?? '—',
          row.contexts.join(', '),
          opportunityCell(row),
          row.opportunityRole ?? '—',
          `${row.scenariosWithinTolerance}/${expectedScenarios}`,
          scenarioCell(row),
          edgeCaseCell(row),
          row.validated ? 'VALIDATED' : 'UNVALIDATED',
          row.reasons.length === 0 ? '—' : row.reasons.join(', '),
        ].join(' | ') +
        ' |',
    )
    .join('\n');
  const unvalidated =
    report.unvalidated.length === 0
      ? 'None.'
      : report.unvalidated
          .map((entry) => `- ${code(entry.key)}: ${entry.reasons.join(', ')}`)
          .join('\n');
  const matrixErrors =
    report.matrixErrors.length === 0
      ? 'None.'
      : report.matrixErrors.map((entry) => code(entry)).join(', ');
  return `${[
    '# 108 learning gate — 24 M keys',
    '',
    'Contract: ' +
      code(report.version) +
      ' · app adapter: ' +
      code(LEARNING_GATE24_APP_VERSION) +
      ' · gate: **' +
      report.gateStatus +
      '**.',
    '',
    'The matrix is derived from the real 092 M keys, 093 evidence specs, 094–099 key sets, 086',
    'opportunity vocabulary, 105 profile results and 107 edge cases. A key is validated only when all',
    'five sources agree; the gate is never forced closed.',
    '',
    '## Summary',
    '',
    '- Gate: ' + report.gateStatus,
    '- M keys in the 092 registry: ' + String(report.counts.registryMKeys),
    '- Matrix rows / validated / unvalidated: ' +
      `${report.counts.matrixRows} / ${report.counts.validated} / ${report.counts.unvalidated}`,
    '- Estimator owners: ' + String(report.counts.estimatorOwners),
    '- Channels / contexts: ' + `${report.counts.channels} / ${report.counts.contexts}`,
    '- Dedicated keys (' +
      String(report.counts.dedicatedKeys) +
      '): ' +
      report.dedicatedKeys.join(', '),
    '- 105 scenario rows: ' + String(report.counts.scenarioResults),
    '- 107 cases read: ' + String(report.counts.edgeCases),
    '- Matrix errors: ' + matrixErrors,
    '- Signature: ' + code(report.signature),
    '',
    '## Dedicated versus carrier opportunities',
    '',
    'Dedicated keys (' +
      String(report.counts.dedicatedKeys) +
      '): ' +
      report.dedicatedKeys.join(', ') +
      '.',
    'Carrier keys (' +
      String(report.counts.carrierKeys) +
      '): ' +
      report.carrierKeys.join(', ') +
      '.',
    '',
    'The 086 vocabulary has no dedicated free-flow or following opportunity kind. Speed,',
    'acceleration and following keys are therefore carried by GREEN (and STOP for queue standstill);',
    'signal keys use RED/GREEN, stop/yield keys use STOP/YIELD, and lane keys use LANE_CHANGE as',
    'dedicated opportunities. The carrier relation is a limitation of the 086 vocabulary, not evidence',
    'that a dedicated free-flow opportunity exists.',
    '',
    '## Coverage matrix',
    '',
    '| # | Key | Owner | Channel | Contexts | Opportunity | Role | 105 within | 105 scenario result | 107 context cases | Status | Reasons |',
    '| ---: | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |',
    rows,
    '',
    '## Unvalidated keys',
    '',
    unvalidated,
    '',
    '## Matrix defects',
    '',
    '- 092 M-key set exactly matched: ' + code(report.mKeySetMatches092),
    '- Duplicate M keys: ' +
      (report.duplicateMKeys.length === 0 ? 'none' : report.duplicateMKeys.join(', ')),
    '- Foreign keys (outside the 24 M keys): ' +
      (report.foreignKeys.length === 0 ? 'none' : report.foreignKeys.join(', ')),
    '',
    '## Effects',
    '',
    '- Profile publications: ' + String(report.effects.profilePublications),
    '- Store writes: ' + String(report.effects.storeWrites),
    '- Fleet mutations: ' + String(report.effects.fleetMutations),
    '',
    'The harness only reads frozen exports: it has no estimator execution of its own and no profile,',
    'store or fleet write path.',
  ].join('\n')}\n`;
}
