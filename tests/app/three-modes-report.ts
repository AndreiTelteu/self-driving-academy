import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  THREE_MODES_LIMITS,
  THREE_MODES_VERSION,
  THREE_MODE_TRANSITIONS,
  measureThreeModeLatency,
  runThreeModesMatrix,
  type ThreeModesCheck,
  type ThreeModesLatencyReport,
  type ThreeModesMatrixReport,
  type ThreeModesScenarioCase,
  type ThreeModesServices,
} from '../../src/app/three-modes';

export interface ThreeModesScenarioReport {
  readonly id: string;
  readonly description: string;
  readonly checks: readonly ThreeModesCheck[];
  readonly ok: boolean;
}

export interface ThreeModesReport {
  readonly version: typeof THREE_MODES_VERSION;
  readonly generatedBy: 'npm run modes:three';
  readonly level: 'full';
  readonly scope: 'LOCAL_NODE_SINGLE_PROCESS';
  readonly oracleRule: string;
  readonly preflight: Readonly<{
    suite: 'npm test';
    required: true;
    runBy: 'scripts/run-three-modes-report.mjs';
    rule: string;
  }>;
  readonly matrix: Readonly<{
    rows: ThreeModesMatrixReport['rows'];
    counts: ThreeModesMatrixReport['counts'];
    failures: readonly string[];
    pass: boolean;
  }>;
  /** The seven acceptance scenarios; the transition matrix is the shared source for the first two. */
  readonly scenarios: readonly ThreeModesScenarioReport[];
  readonly latency: ThreeModesLatencyReport | null;
  readonly checks: readonly ThreeModesCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
  readonly determinism: Readonly<{ identical: boolean; runs: number }>;
  readonly limitations: readonly string[];
}

const LIMITATIONS = Object.freeze([
  'The latency probe is a local single-process Node measurement over bounded samples. It is provisional and machine-local and does not claim FPS, GPU, renderer or hardware performance.',
  'The 094-101 estimators run inside the worker; this harness answers with the real 101 blend through the real 103 queue and 112 pipeline, exactly like the shared 103 harness. It does not re-estimate the style.',
  'The scene physics is a deterministic constant-velocity readback used to prove that a mode/selection transition introduces no position, speed or heading discontinuity; it is not a Rapier vehicle simulation.',
  'The mode/selection latency sample is 48/200 iterations because 069 protects 64 segment records per lifecycle; the admission sample is 200 across fresh scenes to stay below that bound.',
]);

function check(name: string, expected: unknown, actual: unknown, detail: string): ThreeModesCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): ThreeModesCheck {
  return check(name, true, actual, detail);
}

function scenarioFromCase(entry: ThreeModesScenarioCase): ThreeModesScenarioReport {
  return Object.freeze({
    id: entry.id,
    description: entry.description,
    checks: entry.checks,
    ok: entry.ok,
  });
}

function caseById(cases: readonly ThreeModesScenarioCase[], id: string): ThreeModesScenarioCase {
  const found = cases.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`217 report is missing the ${id} scenario`);
  return found;
}

function transitionScenario(
  id: string,
  description: string,
  matrix: ThreeModesMatrixReport,
  kind: 'TAXI' | 'CIVIL',
): ThreeModesScenarioReport {
  const rows = matrix.rows.filter((row) => row.kind === kind);
  const checks: ThreeModesCheck[] = [
    check(
      `${id}-rows`,
      THREE_MODE_TRANSITIONS.length,
      rows.length,
      `All six transitions ran for the ${kind} class.`,
    ),
    truthy(
      `${id}-pass`,
      rows.every((row) => row.ok),
      `Every ${kind} transition row passed.`,
    ),
    truthy(
      `${id}-physics`,
      rows.every((row) => row.physics.preserved),
      'No transition changed speed, heading or the per-tick position step.',
    ),
    truthy(
      `${id}-segments`,
      rows.every((row) => row.closed.endTick === row.atTick || row.closed.segmentId === null) &&
        rows.every((row) => row.opened.startTick === row.atTick || row.opened.segmentId === null),
      'Every closed segment ends and every opened segment starts on the accepted tick.',
    ),
    check(
      `${id}-seats`,
      1,
      Math.max(...rows.map((row) => row.seat.count), 0) || 0,
      'At most one PLAYER seat exists across the whole transition set.',
    ),
    truthy(
      `${id}-hud`,
      rows
        .filter((row) => row.to === 'MANUAL')
        .every((row) => row.hud.label === 'Conduci · învățare oprită') &&
        rows
          .filter((row) => row.to === 'LEARNING')
          .every((row) => row.hud.label === 'Conduci · orașul învață'),
      'The HUD label follows the accepted mode after every transition.',
    ),
  ];
  return Object.freeze({
    id,
    description,
    checks: Object.freeze(checks),
    ok: checks.every((entry) => entry.pass),
  });
}

function matrixChecks(matrix: ThreeModesMatrixReport): ThreeModesCheck[] {
  const rows = matrix.rows;
  const manualClosed = rows.filter((row) => row.closed.mode === 'MANUAL');
  const learningClosed = rows.filter((row) => row.closed.mode === 'LEARNING');
  return [
    check('matrix-rows', 12, rows.length, 'Six transitions times the TAXI and CIVIL classes.'),
    check(
      'matrix-transitions',
      THREE_MODE_TRANSITIONS.map((entry) => entry.id),
      [...new Set(rows.map((row) => row.transition))],
      'Every documented M/L fold is covered exactly once per class.',
    ),
    truthy('matrix-pass', matrix.pass, 'No matrix row or scenario reported a failure.'),
    truthy(
      'matrix-physics',
      rows.every((row) => row.physics.preserved),
      'Physics is preserved on every transition of both classes.',
    ),
    check(
      'matrix-max-seats',
      1,
      Math.max(...rows.map((row) => row.seat.count)),
      'The real 066 coordinator never exposed more than one PLAYER seat.',
    ),
    check(
      'matrix-manual-not-learned',
      manualClosed.map(() => ({ status: 'SKIPPED_MANUAL', job: false, version: null })),
      manualClosed.map((row) => ({
        status: row.learning.status,
        job: row.learning.jobSubmitted,
        version: row.learning.versionId,
      })),
      'Every closed MANUAL segment is skipped by the 112 pipeline without a job or a version.',
    ),
    truthy(
      'matrix-manual-samples',
      manualClosed.length > 0 && manualClosed.every((row) => row.closed.samples > 0),
      'MANUAL keeps telemetry/history; the skip is not a missing record.',
    ),
    check(
      'matrix-learning-versions',
      learningClosed.map(() => ({ job: true, version: true })),
      learningClosed.map((row) => ({
        job: row.learning.jobSubmitted,
        version: row.learning.versionId !== null,
      })),
      'Every closed eligible LEARNING segment produced a real 112 job and version.',
    ),
    check(
      'matrix-close-reasons',
      ['MODE_CHANGE', 'RETURN_TO_AUTO'],
      [
        ...new Set(
          rows
            .filter((row) => row.closed.closeReason !== null)
            .map((row) => row.closed.closeReason),
        ),
      ].sort(),
      'RETURN_TO_AUTO and MODE_CHANGE are the only segment close reasons of a mode change.',
    ),
  ];
}

function latencyChecks(latency: ThreeModesLatencyReport | null): ThreeModesCheck[] {
  if (latency === null)
    return [
      check(
        'latency-present',
        'measured',
        'not-measured (matrix-only report)',
        'This report was generated without the provisional latency probe.',
      ),
    ];
  const admission = latency.learningSegmentCloseToQueueAdmission;
  return [
    check(
      'latency-scope',
      {
        level: 'full',
        scope: 'LOCAL_NODE_SINGLE_PROCESS',
        provisional: true,
        hardware: 'NOT_MEASURED',
        fps: 'NOT_MEASURED',
        gpu: 'NOT_MEASURED',
      },
      {
        level: latency.level,
        scope: latency.scope,
        provisional: latency.provisional,
        hardware: latency.hardwareClaim,
        fps: latency.fpsClaim,
        gpu: latency.gpuClaim,
      },
      'The probe is local and provisional and claims no hardware, FPS or GPU number.',
    ),
    check(
      'latency-mode-samples',
      THREE_MODES_LIMITS.modeSamples,
      latency.modeIntentToAcceptedTransition.samples,
      'The mode-intent channel has its full bounded sample.',
    ),
    check(
      'latency-selection-samples',
      THREE_MODES_LIMITS.selectionSamples,
      latency.selectionChangeToCameraTarget.samples,
      'The selection channel has its full bounded sample.',
    ),
    check(
      'latency-admission-samples',
      THREE_MODES_LIMITS.admissionSamples,
      admission.samples,
      'The queue-admission channel has its full bounded sample.',
    ),
    truthy(
      'latency-percentiles',
      [
        latency.modeIntentToAcceptedTransition,
        latency.selectionChangeToCameraTarget,
        admission,
      ].every(
        (entry) =>
          entry.minMs <= entry.p50Ms && entry.p50Ms <= entry.p95Ms && entry.p95Ms <= entry.maxMs,
      ),
      'p50 <= p95 <= max on every measured channel.',
    ),
    check(
      'latency-busy-worker',
      true,
      admission.busyWorker,
      'Every admission sample was taken while a secondary 103 job occupied the serial worker.',
    ),
    check(
      'latency-busy-samples',
      admission.samples,
      admission.busySamples,
      'The busy worker was confirmed for every admission sample.',
    ),
    check(
      'latency-admissions',
      admission.samples,
      admission.admissions,
      'Every measured close was really admitted as a 103 job.',
    ),
    check(
      'latency-duplicates',
      0,
      admission.duplicateJobs,
      'Replaying a closed segment never started a second job.',
    ),
    truthy(
      'latency-no-failures',
      latency.failures.length === 0,
      'The probe retained zero failures.',
    ),
    check(
      'latency-budget-observation',
      { tickMs: 16.6667, informationalOnly: true },
      {
        tickMs: latency.budget.tickMs,
        informationalOnly: latency.budget.note.includes('never a pass/fail gate'),
      },
      'The one-tick comparison is reported as a local observation, never a gate or a hardware claim.',
    ),
  ];
}

function profileEvidenceChecks(
  matrix: ThreeModesMatrixReport,
  evidence: ThreeModesScenarioCase,
): ThreeModesCheck[] {
  const baseline = matrix.counts;
  return [
    check(
      'evidence-manual',
      { manualSegmentsClosed: 4, publications: 0 },
      { manualSegmentsClosed: baseline.manualClosed, publications: baseline.manualPublications },
      'MANUAL closes are real segments and never publications.',
    ),
    truthy(
      'evidence-case',
      evidence.ok,
      'The dedicated MANUAL/ineligible/eligible profile-evidence case passed.',
    ),
  ];
}

/** Bounded, deterministic report. Latency numbers are live machine values, never fixed. */
export async function runThreeModesReport(
  services: ThreeModesServices,
  options: { readonly measureLatency?: boolean } = {},
): Promise<ThreeModesReport> {
  const matrix = await runThreeModesMatrix(services);
  const second = await runThreeModesMatrix(services);
  const determinism = {
    identical: JSON.stringify(matrix) === JSON.stringify(second),
    runs: 2,
  } as const;
  const cases = matrix.cases;
  const scenarios: ThreeModesScenarioReport[] = [
    transitionScenario(
      'taxi-auto-manual',
      'Taxi AUTO <-> MANUAL with the real hotkey, HUD, seat and segments.',
      matrix,
      'TAXI',
    ),
    transitionScenario(
      'civil-auto-learning',
      'Civil AUTO <-> LEARNING with the real hotkey, HUD, seat and segments.',
      matrix,
      'CIVIL',
    ),
    scenarioFromCase(caseById(cases, 'mixed-ride')),
    scenarioFromCase(caseById(cases, 'pause-focus')),
    scenarioFromCase(caseById(cases, 'remap')),
    scenarioFromCase(caseById(cases, 'busy-worker')),
    scenarioFromCase(caseById(cases, 'selection-no-takeover')),
  ];
  const latency = options.measureLatency === false ? null : await measureThreeModeLatency(services);
  const checks: ThreeModesCheck[] = [
    check('version', THREE_MODES_VERSION, matrix.version, 'One versioned 217 identity.'),
    check(
      'limits',
      {
        tickHz: 60,
        dtSeconds: 1 / 60,
        modeSamples: 48,
        selectionSamples: 200,
        admissionSamples: 200,
      },
      {
        tickHz: matrix.limits.tickHz,
        dtSeconds: matrix.limits.dtSeconds,
        modeSamples: matrix.limits.modeSamples,
        selectionSamples: matrix.limits.selectionSamples,
        admissionSamples: matrix.limits.admissionSamples,
      },
      'The frozen tick and bounded-sample limits.',
    ),
    ...matrixChecks(matrix),
    check(
      'scenarios',
      [
        'taxi-auto-manual',
        'civil-auto-learning',
        'mixed-ride',
        'pause-focus',
        'remap',
        'busy-worker',
        'selection-no-takeover',
      ],
      scenarios.map((entry) => entry.id),
      'The seven required acceptance scenarios are present in order.',
    ),
    truthy(
      'scenario-pass',
      scenarios.every((entry) => entry.ok),
      'Every acceptance scenario passed.',
    ),
    truthy('hud-labels-case', caseById(cases, 'hud-labels').ok, 'The three HUD labels are exact.'),
    ...profileEvidenceChecks(matrix, caseById(cases, 'profile-evidence')),
    ...latencyChecks(latency),
    truthy(
      'determinism',
      determinism.identical,
      'Two identical matrix runs produce identical JSON.',
    ),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: THREE_MODES_VERSION,
    generatedBy: 'npm run modes:three' as const,
    level: 'full' as const,
    scope: 'LOCAL_NODE_SINGLE_PROCESS' as const,
    oracleRule: matrix.oracleRule,
    preflight: Object.freeze({
      suite: 'npm test' as const,
      required: true as const,
      runBy: 'scripts/run-three-modes-report.mjs' as const,
      rule: 'The full suite runs once before the latency probe (targeted-validation-v1 preflight). Only the artifact-freshness assertion of this PBI is skipped during that preflight.',
    }),
    matrix: Object.freeze({
      rows: matrix.rows,
      counts: matrix.counts,
      failures: matrix.failures,
      pass: matrix.pass,
    }),
    scenarios: Object.freeze(scenarios),
    latency,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    determinism: Object.freeze(determinism),
    limitations: LIMITATIONS,
  });
}

/**
 * `--check` equality form: identical structure with the machine-local latency numbers zeroed.
 * The committed report keeps the real measured values; only the freshness comparison normalizes
 * them, exactly as documented in Docs/three-modes.md.
 */
export function normalizeThreeModesReport(report: ThreeModesReport): unknown {
  const zeroed = <T extends object>(value: T) => ({
    ...value,
    minMs: 0,
    p50Ms: 0,
    p95Ms: 0,
    maxMs: 0,
    meanMs: 0,
  });
  return {
    ...report,
    latency:
      report.latency === null
        ? null
        : {
            ...report.latency,
            modeIntentToAcceptedTransition: zeroed(report.latency.modeIntentToAcceptedTransition),
            selectionChangeToCameraTarget: zeroed(report.latency.selectionChangeToCameraTarget),
            learningSegmentCloseToQueueAdmission: zeroed(
              report.latency.learningSegmentCloseToQueueAdmission,
            ),
            budget: {
              ...report.latency.budget,
              modeIntentWithinTick: false,
              selectionChangeWithinTick: false,
            },
          },
  };
}

export const THREE_MODES_EVIDENCE = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '217-three-modes',
  'report.json',
);

export function readCommittedThreeModesReport(): ThreeModesReport | null {
  try {
    return JSON.parse(readFileSync(THREE_MODES_EVIDENCE, 'utf8')) as ThreeModesReport;
  } catch {
    return null;
  }
}
