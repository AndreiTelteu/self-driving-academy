/**
 * PBI 220 fleet gate plan: workload matrix, budget column selection and the verdict rules.
 *
 * This module is pure (no DOM, no browser globals) so the same thresholds are used by the browser
 * protocol and by the independent Node verifier. The numbers come from the fixed 203 manifest
 * (`Docs/performance-budgets.json`); nothing here may relax or recalibrate them.
 */

export const FLEET_GATE_VERSION = '220-fleet-gate-v1';

export type WorkloadId = 'scaling-20' | 'normal-24' | 'maximum-30' | 'overload-30-80';

export interface FleetWorkloadSpec {
  readonly id: WorkloadId;
  readonly label: string;
  readonly taxis: number;
  readonly civilians: number;
  /** Supersaturation probe: measured and reported, never used to mask a normal-workload failure. */
  readonly stress: boolean;
  /** The V1 normal workloads must meet all absolute budgets. */
  readonly normalGate: boolean;
}

/** 25-module matrix: 20/24/30 taxis with up to 40 civilians, plus the separate 30/80 stress probe. */
export const FLEET_WORKLOADS: readonly FleetWorkloadSpec[] = Object.freeze([
  Object.freeze({
    id: 'scaling-20',
    label: 'scaling 20 taxis / 20 civilians',
    taxis: 20,
    civilians: 20,
    stress: false,
    normalGate: true,
  }),
  Object.freeze({
    id: 'normal-24',
    label: 'normal 24 taxis / 40 civilians',
    taxis: 24,
    civilians: 40,
    stress: false,
    normalGate: true,
  }),
  Object.freeze({
    id: 'maximum-30',
    label: 'maximum V1 30 taxis / 40 civilians',
    taxis: 30,
    civilians: 40,
    stress: false,
    normalGate: true,
  }),
  Object.freeze({
    id: 'overload-30-80',
    label: 'stress 30 taxis / 80 civilians',
    taxis: 30,
    civilians: 80,
    stress: true,
    normalGate: false,
  }),
]);

export function workloadById(id: string): FleetWorkloadSpec {
  const spec = FLEET_WORKLOADS.find((entry) => entry.id === id);
  if (!spec) throw new RangeError(`Unknown fleet workload: ${id}`);
  return spec;
}

/** How many civilians the real 057/058 population may own; the rest of a stress probe is physical. */
export const AUTHORITATIVE_CIVILIAN_MAXIMUM = 40;

export interface FleetBudgets {
  readonly column: 'laptop' | 'desktop';
  readonly renderFps: number;
  readonly frameP95Ms: number;
  readonly frameP99Ms: number;
  readonly mainThreadP95Ms: number;
  readonly authoritativeTickP95Ms: number;
  readonly rapierStepP95Ms: number;
  readonly gpuP95Ms: number;
  readonly inputToCommandP95Ms: number;
  readonly simulationToWallRatioMinimum: number;
  readonly learningEndToEndP95Ms: number;
  readonly applicationLongTaskMaximumMs: number;
  /** Observed p95 spread across the five repeats, relative to the median. Reported, not hidden. */
  readonly repeatRelativeSpreadWarning: number;
}

/** Copied verbatim from the fixed 203-initial-1 manifest; the gate may not edit these. */
export const FLEET_BUDGETS: Readonly<Record<'laptop' | 'desktop', FleetBudgets>> = Object.freeze({
  laptop: Object.freeze({
    column: 'laptop' as const,
    renderFps: 30,
    frameP95Ms: 35,
    frameP99Ms: 50,
    mainThreadP95Ms: 20,
    authoritativeTickP95Ms: 8,
    rapierStepP95Ms: 5,
    gpuP95Ms: 28,
    inputToCommandP95Ms: 80,
    simulationToWallRatioMinimum: 0.98,
    learningEndToEndP95Ms: 2000,
    applicationLongTaskMaximumMs: 50,
    repeatRelativeSpreadWarning: 0.25,
  }),
  desktop: Object.freeze({
    column: 'desktop' as const,
    renderFps: 60,
    frameP95Ms: 18.5,
    frameP99Ms: 25,
    mainThreadP95Ms: 10,
    authoritativeTickP95Ms: 5.5,
    rapierStepP95Ms: 3,
    gpuP95Ms: 12,
    inputToCommandP95Ms: 50,
    simulationToWallRatioMinimum: 0.98,
    learningEndToEndP95Ms: 2000,
    applicationLongTaskMaximumMs: 50,
    repeatRelativeSpreadWarning: 0.25,
  }),
});

export interface HardwareIdentity {
  readonly model: string | null;
  readonly cpu: string | null;
  readonly gpu: string | null;
}

/**
 * The 203 laptop entry is a declared target, not a measured baseline. When the current CIM
 * identity matches it, the laptop column applies; 220 may not borrow the desktop column.
 */
export function hardwareColumn(identity: HardwareIdentity): 'laptop' | 'desktop' {
  const text = [identity.model, identity.cpu, identity.gpu].filter(Boolean).join(' ').toLowerCase();
  if (/7735u|680m|yoga 7 14arp8|82ym/.test(text)) return 'laptop';
  if (/7950x3d|7900 xtx/.test(text)) return 'desktop';
  throw new Error(
    `Unidentified hardware cannot select a budget column; the gate needs a declared device: ${text}`,
  );
}

export type MetricName =
  | 'frameP50Ms'
  | 'frameP95Ms'
  | 'frameP99Ms'
  | 'mainThreadP95Ms'
  | 'authoritativeTickP95Ms'
  | 'rapierStepP95Ms'
  | 'gpuP95Ms'
  | 'inputToCommandP95Ms'
  | 'learningEndToEndP95Ms';

export interface RunVerdictInput {
  readonly workload: WorkloadId;
  readonly row: 'laptop' | 'desktop';
  readonly frameP95Ms: number;
  readonly frameP99Ms: number;
  readonly mainThreadP95Ms: number;
  readonly authoritativeTickP95Ms: number;
  readonly rapierStepP95Ms: number;
  readonly gpuP95Ms: number | null;
  readonly inputToCommandP95Ms: number | null;
  readonly learningEndToEndP95Ms: number | null;
  readonly simulationToWallRatio: number;
  readonly applicationLongTaskMaximumMs: number | null;
  readonly physicalVehicles: number;
  readonly expectedVehicles: number;
  readonly contacts: number;
  readonly collisions: number;
  readonly cleanupLeaked: boolean;
  readonly overloads: number;
  readonly status: string;
  readonly offscreenVehiclesRetained: boolean;
  readonly aggressiveVehicles: number;
  readonly prudentVehicles: number;
  readonly learningSegments: number;
}

export interface BudgetFailure {
  readonly metric: string;
  readonly actual: number | string;
  readonly budget: number | string;
}

/**
 * Absolute budgets apply to every repetition of a normal workload; GPU and input values may be
 * absent (null) but then the report says so instead of pretending they passed.
 */
export function evaluateRun(input: RunVerdictInput): readonly BudgetFailure[] {
  const budgets = FLEET_BUDGETS[input.row];
  const failures: BudgetFailure[] = [];
  const fail = (metric: string, actual: number | string, budget: number | string) =>
    failures.push(Object.freeze({ metric, actual, budget }));
  if (input.physicalVehicles !== input.expectedVehicles)
    fail('physicalVehicles', input.physicalVehicles, input.expectedVehicles);
  if (!input.offscreenVehiclesRetained) fail('offscreenVehiclesRetained', 'false', 'true');
  if (input.status !== 'running') fail('fixedTickStatus', input.status, 'running');
  if (input.overloads !== 0) fail('overloads', input.overloads, 0);
  if (input.cleanupLeaked) fail('cleanupLeaked', 'true', 'false');
  if (input.contacts < 1) fail('contacts', input.contacts, '>= 1');
  if (input.aggressiveVehicles < 1) fail('aggressiveVehicles', input.aggressiveVehicles, '>= 1');
  if (input.prudentVehicles < 1) fail('prudentVehicles', input.prudentVehicles, '>= 1');
  if (input.simulationToWallRatio < budgets.simulationToWallRatioMinimum)
    fail(
      'simulationToWallRatio',
      round(input.simulationToWallRatio),
      budgets.simulationToWallRatioMinimum,
    );
  if (input.frameP95Ms > budgets.frameP95Ms)
    fail('frameP95Ms', round(input.frameP95Ms), budgets.frameP95Ms);
  if (input.frameP99Ms > budgets.frameP99Ms)
    fail('frameP99Ms', round(input.frameP99Ms), budgets.frameP99Ms);
  if (input.mainThreadP95Ms > budgets.mainThreadP95Ms)
    fail('mainThreadP95Ms', round(input.mainThreadP95Ms), budgets.mainThreadP95Ms);
  if (input.authoritativeTickP95Ms > budgets.authoritativeTickP95Ms)
    fail(
      'authoritativeTickP95Ms',
      round(input.authoritativeTickP95Ms),
      budgets.authoritativeTickP95Ms,
    );
  if (input.rapierStepP95Ms > budgets.rapierStepP95Ms)
    fail('rapierStepP95Ms', round(input.rapierStepP95Ms), budgets.rapierStepP95Ms);
  if (input.gpuP95Ms !== null && input.gpuP95Ms > budgets.gpuP95Ms)
    fail('gpuP95Ms', round(input.gpuP95Ms), budgets.gpuP95Ms);
  if (input.inputToCommandP95Ms !== null && input.inputToCommandP95Ms > budgets.inputToCommandP95Ms)
    fail('inputToCommandP95Ms', round(input.inputToCommandP95Ms), budgets.inputToCommandP95Ms);
  if (
    input.learningEndToEndP95Ms !== null &&
    input.learningEndToEndP95Ms > budgets.learningEndToEndP95Ms
  )
    fail(
      'learningEndToEndP95Ms',
      round(input.learningEndToEndP95Ms),
      budgets.learningEndToEndP95Ms,
    );
  if (input.learningSegments < 1) fail('learningSegments', input.learningSegments, '>= 1');
  if (
    input.applicationLongTaskMaximumMs !== null &&
    input.applicationLongTaskMaximumMs > budgets.applicationLongTaskMaximumMs
  )
    fail(
      'applicationLongTaskMaximumMs',
      round(input.applicationLongTaskMaximumMs),
      budgets.applicationLongTaskMaximumMs,
    );
  return Object.freeze(failures);
}

/**
 * The stress probe keeps the same structural checks and the same 0.98 simulation ratio but has no
 * normal FPS gate. Its over-budget metrics are reported as findings, never as a normal V1 pass.
 */
export function stressFindings(input: RunVerdictInput): readonly BudgetFailure[] {
  return evaluateRun(input).filter(
    (failure) =>
      ![
        'frameP95Ms',
        'frameP99Ms',
        'mainThreadP95Ms',
        'gpuP95Ms',
        'authoritativeTickP95Ms',
        'rapierStepP95Ms',
      ].includes(failure.metric),
  );
}

export interface MetricSummary {
  readonly metric: MetricName;
  readonly median: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly relativeSpread: number;
  readonly repeats: number;
}

const SUMMARY_METRICS: readonly MetricName[] = Object.freeze([
  'frameP50Ms',
  'frameP95Ms',
  'frameP99Ms',
  'mainThreadP95Ms',
  'authoritativeTickP95Ms',
  'rapierStepP95Ms',
  'gpuP95Ms',
  'inputToCommandP95Ms',
  'learningEndToEndP95Ms',
]);

function percentile(values: readonly number[], fraction: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1]!;
}

/** Per-workload reproducibility: every repetition is retained and summarised, never cherry-picked. */
export function summarizeRepeats(
  rows: readonly Readonly<Record<MetricName, number | null>>[],
): readonly MetricSummary[] {
  if (rows.length < 1) throw new RangeError('Reproducibility needs at least one repetition');
  const summaries: MetricSummary[] = [];
  for (const metric of SUMMARY_METRICS) {
    const values = rows
      .map((row) => row[metric])
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (!values.length) continue;
    const median = percentile(values, 0.5);
    summaries.push(
      Object.freeze({
        metric,
        median: round(median),
        minimum: round(Math.min(...values)),
        maximum: round(Math.max(...values)),
        relativeSpread:
          median === 0 ? 0 : round((Math.max(...values) - Math.min(...values)) / median),
        repeats: values.length,
      }),
    );
  }
  return Object.freeze(summaries);
}

/** A report-level reproducibility finding; the absolute per-run verdicts stay authoritative. */
export function reproducibilityFindings(
  summaries: readonly MetricSummary[],
  relativeSpreadMaximum: number,
): readonly string[] {
  return Object.freeze(
    summaries
      .filter((summary) => summary.relativeSpread > relativeSpreadMaximum)
      .map(
        (summary) =>
          `${summary.metric} varies ${(summary.relativeSpread * 100).toFixed(1)}% across ${summary.repeats} repeats (max ${relativeSpreadMaximum * 100}%)`,
      ),
  );
}

export function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
