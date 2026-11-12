/**
 * PBI 155 — contract verification of the fixed hardware budgets.
 *
 * This module is pure (no DOM, no Node built-ins, no clock) so the report, the Markdown rendering
 * and the tests share one verdict rule. Every threshold is **cited** from the fixed 203 manifest
 * (`Docs/performance-budgets.json`); nothing here may define, relax or recalibrate a budget. A
 * metric that could not be measured is `NOT_MEASURED` with a reason, never zero and never PASS.
 */

export const HARDWARE_BUDGET_REPORT_VERSION = '155-hardware-budget-v1';

export type BudgetColumn = 'desktop' | 'laptop';

export type SystemId = 'learning' | 'recorder' | 'kpi' | 'xp' | 'challenges' | 'destruction';

export const SYSTEM_IDS: readonly SystemId[] = Object.freeze([
  'learning',
  'recorder',
  'kpi',
  'xp',
  'challenges',
  'destruction',
]);

export type Verdict = 'PASS' | 'FAIL' | 'NOT_MEASURED' | 'STRUCTURAL' | 'REPORTED';

export interface ColumnBudgets {
  readonly renderFps: number;
  readonly frameP95Ms: number;
  readonly frameP99Ms: number;
  readonly mainThreadP95Ms: number;
  readonly authoritativeTickP95Ms: number;
  readonly rapierStepP95Ms: number;
  readonly gpuP95Ms: number;
  readonly inputToCommandP95Ms: number;
}

export interface BudgetManifest {
  readonly budgetVersion: string;
  readonly status: string;
  readonly approvedGate: boolean;
  readonly proposedBudgets: Readonly<{
    desktop: ColumnBudgets;
    laptop: ColumnBudgets;
    simulationToActiveWallTimeMinimum: number;
    segmentCloseToProfileActivationP95Ms: number;
    coldFirstAcceptedCommandP95Ms: number;
    normalSteadyStateApplicationLongTaskMaximumMs: number;
  }>;
  readonly proposedCapacities: Readonly<Record<string, number | null>>;
  readonly protocol: Readonly<{
    warmupSeconds: number;
    measuredSeconds: number;
    repetitions: number;
    percentiles: readonly number[];
    productionBuild: boolean;
    inspectorClosed: boolean;
    foregroundRequired: boolean;
    adaptiveQuality: boolean;
  }>;
  readonly acceptance: Readonly<Record<string, unknown>>;
}

function numeric(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`Budget manifest field ${path} must be a finite number`);
  return value;
}

function columnBudgets(value: unknown, path: string): ColumnBudgets {
  const source = value as Record<string, unknown>;
  if (typeof source !== 'object' || source === null)
    throw new TypeError(`Budget manifest field ${path} must be an object`);
  return Object.freeze({
    renderFps: numeric(source.renderFps, `${path}.renderFps`),
    frameP95Ms: numeric(source.frameP95Ms, `${path}.frameP95Ms`),
    frameP99Ms: numeric(source.frameP99Ms, `${path}.frameP99Ms`),
    mainThreadP95Ms: numeric(source.mainThreadP95Ms, `${path}.mainThreadP95Ms`),
    authoritativeTickP95Ms: numeric(
      source.authoritativeTickP95Ms,
      `${path}.authoritativeTickP95Ms`,
    ),
    rapierStepP95Ms: numeric(source.rapierStepP95Ms, `${path}.rapierStepP95Ms`),
    gpuP95Ms: numeric(source.gpuP95Ms, `${path}.gpuP95Ms`),
    inputToCommandP95Ms: numeric(source.inputToCommandP95Ms, `${path}.inputToCommandP95Ms`),
  });
}

/**
 * Reads the fixed manifest defensively. A missing field is an error, not a silently skipped check:
 * the gate must never pass because the budget it should compare against disappeared.
 */
export function parseBudgetManifest(value: unknown): BudgetManifest {
  const source = value as Record<string, unknown>;
  if (typeof source !== 'object' || source === null)
    throw new TypeError('Budget manifest must be an object');
  if (source.schemaVersion !== 1)
    throw new TypeError('Budget manifest schemaVersion must be 1 for the fixed 203 contract');
  const budgets = source.proposedBudgets as Record<string, unknown>;
  const capacities = source.proposedCapacities as Record<string, unknown>;
  const protocol = source.protocol as Record<string, unknown>;
  if (typeof budgets !== 'object' || budgets === null)
    throw new TypeError('Budget manifest proposedBudgets is missing');
  if (typeof capacities !== 'object' || capacities === null)
    throw new TypeError('Budget manifest proposedCapacities is missing');
  if (typeof protocol !== 'object' || protocol === null)
    throw new TypeError('Budget manifest protocol is missing');
  const percentiles = protocol.percentiles;
  if (!Array.isArray(percentiles) || percentiles.some((entry) => typeof entry !== 'number'))
    throw new TypeError('Budget manifest protocol.percentiles must be a number list');
  const capacitiesOut: Record<string, number | null> = {};
  for (const [key, entry] of Object.entries(capacities))
    capacitiesOut[key] = typeof entry === 'number' && Number.isFinite(entry) ? entry : null;
  return Object.freeze({
    budgetVersion: String(source.budgetVersion),
    status: String(source.status),
    approvedGate: source.approvedGate === true,
    proposedBudgets: Object.freeze({
      desktop: columnBudgets(budgets.desktop, 'proposedBudgets.desktop'),
      laptop: columnBudgets(budgets.laptop, 'proposedBudgets.laptop'),
      simulationToActiveWallTimeMinimum: numeric(
        budgets.simulationToActiveWallTimeMinimum,
        'proposedBudgets.simulationToActiveWallTimeMinimum',
      ),
      segmentCloseToProfileActivationP95Ms: numeric(
        budgets.segmentCloseToProfileActivationP95Ms,
        'proposedBudgets.segmentCloseToProfileActivationP95Ms',
      ),
      coldFirstAcceptedCommandP95Ms: numeric(
        budgets.coldFirstAcceptedCommandP95Ms,
        'proposedBudgets.coldFirstAcceptedCommandP95Ms',
      ),
      normalSteadyStateApplicationLongTaskMaximumMs: numeric(
        budgets.normalSteadyStateApplicationLongTaskMaximumMs,
        'proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs',
      ),
    }),
    proposedCapacities: Object.freeze(capacitiesOut),
    protocol: Object.freeze({
      warmupSeconds: numeric(protocol.warmupSeconds, 'protocol.warmupSeconds'),
      measuredSeconds: numeric(protocol.measuredSeconds, 'protocol.measuredSeconds'),
      repetitions: numeric(protocol.repetitions, 'protocol.repetitions'),
      percentiles: Object.freeze([...percentiles] as number[]),
      productionBuild: protocol.productionBuild === true,
      inspectorClosed: protocol.inspectorClosed === true,
      foregroundRequired: protocol.foregroundRequired === true,
      adaptiveQuality: protocol.adaptiveQuality === true,
    }),
    acceptance: Object.freeze({ ...(source.acceptance as Record<string, unknown>) }),
  });
}

export interface StatisticSummary {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

/** Nearest-rank percentile: the same rule as the 218 collector, so p95 means the same thing. */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length < 1) throw new RangeError('A percentile needs at least one sample');
  if (!(fraction > 0 && fraction <= 1)) throw new RangeError('Percentile fraction must be (0, 1]');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] as number;
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function summarize(values: readonly number[], digits = 3): StatisticSummary {
  if (values.length < 1) throw new RangeError('A summary needs at least one sample');
  if (values.some((value) => !Number.isFinite(value)))
    throw new RangeError('A summary rejects non-finite samples');
  const total = values.reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    count: values.length,
    p50: round(percentile(values, 0.5), digits),
    p95: round(percentile(values, 0.95), digits),
    p99: round(percentile(values, 0.99), digits),
    min: round(Math.min(...values), digits),
    max: round(Math.max(...values), digits),
    mean: round(total / values.length, digits),
  });
}

export interface MetricRow {
  readonly id: string;
  readonly area: 'frame' | 'simulation' | 'memory' | 'loading' | 'input' | 'cost';
  readonly metric: string;
  readonly configuration: string;
  /** Measured distribution; null only for a `NOT_MEASURED` row. */
  readonly measured: StatisticSummary | null;
  readonly unit: 'ms' | 'fps' | 'ratio' | 'MiB' | '%';
  readonly budget: Readonly<{
    value: number;
    direction: 'maximum' | 'minimum';
    source: string;
  }> | null;
  readonly verdict: Verdict;
  readonly note: string;
}

export function budgetSource(manifest: BudgetManifest, path: string): string {
  return `Docs/performance-budgets.json (${manifest.budgetVersion}) ${path}`;
}

function maximumRow(input: {
  id: string;
  area: MetricRow['area'];
  metric: string;
  configuration: string;
  values: readonly number[];
  unit: MetricRow['unit'];
  budget: number;
  source: string;
  direction?: 'maximum' | 'minimum';
  verdictOverride?: Verdict;
  note?: string;
}): MetricRow {
  const measured = summarize(input.values);
  const direction = input.direction ?? 'maximum';
  const worst = direction === 'minimum' ? measured.min : measured.max;
  const within = direction === 'minimum' ? worst >= input.budget : worst <= input.budget;
  const verdict = input.verdictOverride ?? (within ? 'PASS' : 'FAIL');
  return Object.freeze({
    id: input.id,
    area: input.area,
    metric: input.metric,
    configuration: input.configuration,
    measured,
    unit: input.unit,
    budget: Object.freeze({
      value: input.budget,
      direction,
      source: input.source,
    }),
    verdict,
    note:
      input.note ??
      (verdict === 'FAIL'
        ? `depășire: cea mai defavorabilă repetare ${round(worst)} față de bugetul ${input.budget}`
        : `cea mai defavorabilă repetare ${round(worst)} în bugetul ${input.budget}`),
  });
}

export interface BrowserRunInput {
  readonly captureId: string;
  readonly renderer: string;
  readonly budgetColumn: BudgetColumn;
  readonly browser: string;
  readonly preset: string;
  readonly cssResolution: readonly [number, number];
  readonly internalResolution: readonly [number, number];
  readonly dpr: number;
  readonly build: Readonly<{ commit: string; sourceHash: string; artifactHash: string }>;
  readonly workload: string;
  readonly workloadLabel: string;
  readonly stress: boolean;
  readonly expectedVehicles: number;
  readonly run: Readonly<{
    repeat: number;
    frameMs: StatisticSummary;
    mainThreadMs: StatisticSummary;
    authoritativeTickMs: StatisticSummary;
    rapierStepMs: StatisticSummary;
    inputToCommandMs: StatisticSummary | null;
    learningEndToEndMs: StatisticSummary | null;
    gpuMs: StatisticSummary | null;
    gpuStatus: string;
    pageHeapBytes: number | null;
    longTaskMaxMs: number | null;
    simulatedToWallRatio: number;
    framesOver35Ms: number;
    physicalVehicles: number;
    cleanupLeaked: boolean;
  }>;
}

export interface LoadingInput {
  /** Real production build of the application entry, measured with Vite. */
  readonly build: Readonly<{
    commit: string;
    artifactCount: number;
    javascriptBytes: number;
    wasmBytes: number;
    cssBytes: number;
    gzipBytes: number;
    measuredAt: string;
    command: string;
  }>;
}

export interface SystemsCostInput {
  readonly measuredAt: string;
  readonly machine: string;
  readonly command: string;
  readonly ticksPerSample: number;
  readonly samples: number;
  readonly vehicles: number;
  /** Total wall-clock milliseconds of the baseline driving loop, one entry per sample. */
  readonly baselineMs: readonly number[];
  readonly arms: readonly Readonly<{
    system: SystemId;
    cadence: string;
    /** Real contract work executed inside each 600-tick sample. */
    invocationsPerSample: number;
    totalMs: readonly number[];
    /** Resource counters reported by the real contract (bytes, entries, bodies…). */
    counters: Readonly<Record<string, number | null>>;
  }>[];
}

export interface BaselineInput {
  readonly capturedAt: string;
  readonly commit: string;
  readonly captureId: string;
  readonly sourceHash?: string;
  readonly conditions: string;
  readonly metric: string;
  readonly values: readonly number[];
  readonly budget: number;
  readonly unit: 'ms';
}

export interface ReportInput {
  readonly manifest: BudgetManifest;
  readonly runs: readonly BrowserRunInput[];
  readonly baseline: BaselineInput | null;
  readonly loading: LoadingInput | null;
  readonly costs: SystemsCostInput | null;
  readonly production: Readonly<{ commit: string; generatedFrom: readonly string[] }>;
}

export interface HardwareBudgetReport {
  readonly version: string;
  readonly generatedFrom: readonly string[];
  readonly productionCommit: string;
  readonly manifest: Readonly<{
    budgetVersion: string;
    status: string;
    approvedGate: boolean;
    modified: false;
    hashLike: string;
  }>;
  readonly configurations: readonly Readonly<{
    id: string;
    workload: string;
    backend: string;
    column: BudgetColumn;
    preset: string;
    cssResolution: string;
    internalResolution: string;
    dpr: number;
    browser: string;
    build: string;
    protocol: string;
    repeats: number;
    stress: boolean;
  }>[];
  readonly rows: readonly MetricRow[];
  readonly costs: readonly Readonly<{
    system: SystemId;
    cadence: string;
    invocationsPerSample: number;
    perInvocationMs: StatisticSummary;
    perTickMs: StatisticSummary;
    perSimulatedSecondMs: StatisticSummary;
    shareOfTickBudgetPercent: number;
    shareOfFrameBudgetPercent: number;
    counters: Readonly<Record<string, number | null>>;
    samples: number;
    noiseFloor: boolean;
  }>[];
  readonly baseline: Readonly<{
    capturedAt: string;
    commit: string;
    captureId: string;
    sourceHash?: string;
    conditions: string;
    metric: string;
    before: StatisticSummary;
    after: StatisticSummary | null;
    budget: number;
    unit: 'ms';
    verdict: Verdict;
    note: string;
  }> | null;
  readonly deviations: readonly string[];
  readonly notMeasured: readonly Readonly<{
    metric: string;
    reason: string;
    measuredInstead: string;
  }>[];
  readonly summary: Readonly<{
    pass: number;
    fail: number;
    notMeasured: number;
    structural: number;
    reported: number;
    gate: 'MEASURED_CONFIGURATIONS_PASS' | 'FAILED';
    hardwareGameplayGate: 'NOT_VALIDATED';
    note: string;
  }>;
}

const MIB = 1024 * 1024;

function configurationId(run: BrowserRunInput): string {
  return `${run.budgetColumn}-${run.renderer.toLowerCase()}-${run.workload}`;
}

function configurationLabel(run: BrowserRunInput): string {
  return `${run.budgetColumn} · ${run.renderer} · ${run.preset} · ${run.internalResolution[0]}×${run.internalResolution[1]} intern · ${run.workload}`;
}

function groupRuns(runs: readonly BrowserRunInput[]) {
  const groups = new Map<string, BrowserRunInput[]>();
  for (const run of runs) {
    const id = configurationId(run);
    const list = groups.get(id) ?? [];
    list.push(run);
    groups.set(id, list);
  }
  return [...groups.entries()].map(([id, list]) => ({ id, runs: list }));
}

function frameRows(
  manifest: BudgetManifest,
  group: { id: string; runs: readonly BrowserRunInput[] },
): MetricRow[] {
  const first = group.runs[0] as BrowserRunInput;
  const budgets = manifest.proposedBudgets[first.budgetColumn];
  const label = configurationLabel(first);
  const stressNote = first.stress
    ? 'probă de suprasarcină: se raportează, nu închide gate-ul normal'
    : undefined;
  const rows: MetricRow[] = [];
  const metricRow = (
    suffix: string,
    metric: string,
    values: readonly number[],
    budget: number,
    path: string,
    unit: MetricRow['unit'] = 'ms',
  ) =>
    rows.push(
      maximumRow({
        id: `${group.id}-${suffix}`,
        area: unit === 'ratio' ? 'simulation' : 'frame',
        metric,
        configuration: label,
        values,
        unit,
        budget,
        source: budgetSource(manifest, path),
        verdictOverride: first.stress && unit !== 'ratio' ? 'STRUCTURAL' : undefined,
        note: stressNote,
      }),
    );
  // One repetition must not hide another: every p95 of the five repetitions is judged, and the
  // table reports the worst repeat next to the median spread.
  metricRow(
    'frame-p95',
    'interval de cadru p95',
    group.runs.map((run) => run.run.frameMs.p95),
    budgets.frameP95Ms,
    `proposedBudgets.${first.budgetColumn}.frameP95Ms`,
    'ms',
  );
  metricRow(
    'frame-p99',
    'interval de cadru p99',
    group.runs.map((run) => run.run.frameMs.p99),
    budgets.frameP99Ms,
    `proposedBudgets.${first.budgetColumn}.frameP99Ms`,
  );
  metricRow(
    'main-p95',
    'lucru pe firul principal p95',
    group.runs.map((run) => run.run.mainThreadMs.p95),
    budgets.mainThreadP95Ms,
    `proposedBudgets.${first.budgetColumn}.mainThreadP95Ms`,
  );
  metricRow(
    'tick-p95',
    'tick autoritar p95',
    group.runs.map((run) => run.run.authoritativeTickMs.p95),
    budgets.authoritativeTickP95Ms,
    `proposedBudgets.${first.budgetColumn}.authoritativeTickP95Ms`,
  );
  metricRow(
    'rapier-p95',
    'pas Rapier p95',
    group.runs.map((run) => run.run.rapierStepMs.p95),
    budgets.rapierStepP95Ms,
    `proposedBudgets.${first.budgetColumn}.rapierStepP95Ms`,
  );

  // Derived cadence: the frame interval is the measured quantity; FPS is 1000/p50, never a counter.
  const fps = group.runs.map((run) => 1000 / Math.max(run.run.frameMs.p50, 1e-6));
  rows.push(
    maximumRow({
      id: `${group.id}-fps`,
      area: 'frame',
      metric: 'cadență derivată din intervalul p50',
      configuration: label,
      values: fps,
      unit: 'fps',
      budget: budgets.renderFps,
      direction: 'minimum' as const,
      source: budgetSource(manifest, `proposedBudgets.${first.budgetColumn}.renderFps`),
      verdictOverride: first.stress ? 'STRUCTURAL' : undefined,
      note: first.stress ? stressNote : 'derivată (1000 / p50 frame), nu contor de FPS dedicat',
    }),
  );

  const gpuValues = group.runs
    .map((run) => run.run.gpuMs?.p95 ?? null)
    .filter((value): value is number => value !== null);
  const gpuStatus = first.run.gpuStatus;
  if (gpuValues.length === 0) {
    rows.push(
      Object.freeze({
        id: `${group.id}-gpu-p95`,
        area: 'frame' as const,
        metric: 'lucru GPU p95',
        configuration: label,
        measured: null,
        unit: 'ms' as const,
        budget: Object.freeze({
          value: budgets.gpuP95Ms,
          direction: 'maximum' as const,
          source: budgetSource(manifest, `proposedBudgets.${first.budgetColumn}.gpuP95Ms`),
        }),
        verdict: 'NOT_MEASURED' as const,
        note: `timer GPU indisponibil: ${gpuStatus}; valoarea rămâne null, nu 0`,
      }),
    );
  } else
    rows.push(
      maximumRow({
        id: `${group.id}-gpu-p95`,
        area: 'frame',
        metric: 'lucru GPU p95',
        configuration: label,
        values: gpuValues,
        unit: 'ms',
        budget: budgets.gpuP95Ms,
        source: budgetSource(manifest, `proposedBudgets.${first.budgetColumn}.gpuP95Ms`),
        verdictOverride: first.stress ? 'STRUCTURAL' : undefined,
        note: `timer GPU: ${gpuStatus}`,
      }),
    );

  const inputValues = group.runs
    .map((run) => run.run.inputToCommandMs?.p95 ?? null)
    .filter((value): value is number => value !== null);
  if (inputValues.length === 0)
    rows.push(
      Object.freeze({
        id: `${group.id}-input-p95`,
        area: 'input' as const,
        metric: 'input → aplicarea comenzii p95',
        configuration: label,
        measured: null,
        unit: 'ms' as const,
        budget: Object.freeze({
          value: budgets.inputToCommandP95Ms,
          direction: 'maximum' as const,
          source: budgetSource(
            manifest,
            `proposedBudgets.${first.budgetColumn}.inputToCommandP95Ms`,
          ),
        }),
        verdict: 'NOT_MEASURED' as const,
        note: 'nicio mostră de input → comandă în repetările acestei configurații',
      }),
    );
  else
    rows.push(
      maximumRow({
        id: `${group.id}-input-p95`,
        area: 'input',
        metric: 'input → aplicarea comenzii p95',
        configuration: label,
        values: inputValues,
        unit: 'ms',
        budget: budgets.inputToCommandP95Ms,
        source: budgetSource(manifest, `proposedBudgets.${first.budgetColumn}.inputToCommandP95Ms`),
        verdictOverride: first.stress ? 'STRUCTURAL' : undefined,
      }),
    );

  const learningValues = group.runs
    .map((run) => run.run.learningEndToEndMs?.p95 ?? null)
    .filter((value): value is number => value !== null);
  if (learningValues.length > 0)
    rows.push(
      maximumRow({
        id: `${group.id}-learning-p95`,
        area: 'simulation',
        metric: 'închidere segment → activare learning p95',
        configuration: label,
        values: learningValues,
        unit: 'ms',
        budget: manifest.proposedBudgets.segmentCloseToProfileActivationP95Ms,
        source: budgetSource(manifest, 'proposedBudgets.segmentCloseToProfileActivationP95Ms'),
        verdictOverride: first.stress ? 'STRUCTURAL' : undefined,
      }),
    );

  rows.push(
    ((values) =>
      Object.freeze({
        id: `${group.id}-ratio`,
        area: 'simulation' as const,
        metric: 'timp simulat / timp real activ',
        configuration: label,
        measured: summarize(values, 5),
        unit: 'ratio' as const,
        budget: Object.freeze({
          value: manifest.proposedBudgets.simulationToActiveWallTimeMinimum,
          direction: 'minimum' as const,
          source: budgetSource(manifest, 'proposedBudgets.simulationToActiveWallTimeMinimum'),
        }),
        verdict: (Math.min(...values) >= manifest.proposedBudgets.simulationToActiveWallTimeMinimum
          ? 'PASS'
          : 'FAIL') as Verdict,
        note: `minim observat ${round(Math.min(...values), 5)}`,
      }))(group.runs.map((run) => run.run.simulatedToWallRatio)),
  );

  const longTasks = group.runs
    .map((run) => run.run.longTaskMaxMs)
    .filter((value): value is number => value !== null);
  if (longTasks.length > 0)
    rows.push(
      maximumRow({
        id: `${group.id}-long-task`,
        area: 'frame',
        metric: 'Long Task maxim de aplicație',
        configuration: label,
        values: longTasks,
        unit: 'ms',
        budget: manifest.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs,
        source: budgetSource(
          manifest,
          'proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs',
        ),
        note: 'PerformanceObserver longtask; lipsa API-ului nu este raportată ca 0',
      }),
    );

  // Structural invariants of every repetition: population retained, cleanup and no overload.
  const structural = [
    [
      'vehicule fizice păstrate',
      group.runs.every((run) => run.run.physicalVehicles === run.expectedVehicles),
    ],
    ['cleanup fără resurse deținute', group.runs.every((run) => !run.run.cleanupLeaked)],
  ] as const;
  for (const [metric, pass] of structural)
    rows.push(
      Object.freeze({
        id: `${group.id}-${metric.replaceAll(' ', '-')}`,
        area: 'simulation' as const,
        metric,
        configuration: label,
        measured: null,
        unit: 'ratio' as const,
        budget: null,
        verdict: (pass ? 'PASS' : 'FAIL') as Verdict,
        note: `${group.runs.length} repetări verificate structural`,
      }),
    );
  return rows;
}

function loadingRows(manifest: BudgetManifest, loading: LoadingInput | null): MetricRow[] {
  const criticalBudget = manifest.proposedCapacities.criticalJsWasmTransferBytes ?? null;
  if (loading === null || criticalBudget === null)
    return [
      Object.freeze({
        id: 'loading-critical-transfer',
        area: 'loading' as const,
        metric: 'JS+WASM critice transferate (build de producție)',
        configuration: 'build de producție al intrării aplicației',
        measured: null,
        unit: 'MiB' as const,
        budget: null,
        verdict: 'NOT_MEASURED' as const,
        note: 'build-ul de producție nu a fost măsurat',
      }),
    ];
  const bytes = loading.build.javascriptBytes + loading.build.wasmBytes;
  const mib = bytes / MIB;
  return [
    Object.freeze({
      id: 'loading-critical-transfer',
      area: 'loading' as const,
      metric: 'JS+WASM critice transferate (build de producție)',
      configuration: `build ${loading.build.commit.slice(0, 12)} · ${loading.build.artifactCount} artefacte`,
      measured: summarize([mib]),
      unit: 'MiB' as const,
      budget: Object.freeze({
        value: round(criticalBudget / MIB),
        direction: 'maximum' as const,
        source: budgetSource(manifest, 'proposedCapacities.criticalJsWasmTransferBytes'),
      }),
      verdict: (mib <= criticalBudget / MIB ? 'PASS' : 'FAIL') as Verdict,
      note: `JS ${loading.build.javascriptBytes} B + WASM ${loading.build.wasmBytes} B = ${bytes} B; gzip ${loading.build.gzipBytes} B; CSS ${loading.build.cssBytes} B separat`,
    }),
  ];
}

function costRows(
  manifest: BudgetManifest,
  costs: SystemsCostInput | null,
  runs: readonly BrowserRunInput[],
): HardwareBudgetReport['costs'] {
  if (costs === null) return [];
  const column: BudgetColumn = runs[0]?.budgetColumn ?? 'laptop';
  const budgets = manifest.proposedBudgets[column];
  const baseline = summarize(costs.baselineMs);
  const baselinePerTick = baseline.p50 / costs.ticksPerSample;
  const result: HardwareBudgetReport['costs'][number][] = [];
  for (const arm of costs.arms) {
    if (arm.totalMs.length !== costs.baselineMs.length)
      throw new RangeError(`Cost arm ${arm.system} has a different sample count than the baseline`);
    const paired = arm.totalMs.map((value, index) => value - (costs.baselineMs[index] as number));
    const perTick = paired.map((value) => value / costs.ticksPerSample);
    const perInvocation = paired.map((value) => value / Math.max(arm.invocationsPerSample, 1));
    const summary = summarize(perTick);
    result.push(
      Object.freeze({
        system: arm.system,
        cadence: arm.cadence,
        invocationsPerSample: arm.invocationsPerSample,
        perInvocationMs: summarize(perInvocation),
        perTickMs: summary,
        perSimulatedSecondMs: summarize(perTick.map((value) => value * 60)),
        shareOfTickBudgetPercent: round((summary.p95 / budgets.authoritativeTickP95Ms) * 100, 2),
        shareOfFrameBudgetPercent: round((summary.p95 / budgets.mainThreadP95Ms) * 100, 2),
        counters: Object.freeze({ ...arm.counters }),
        samples: costs.samples,
        // A paired delta at or below zero cannot prove a cost; it is reported as noise, not as gain.
        noiseFloor: summary.p95 <= 0 || baselinePerTick <= 0,
      }),
    );
  }
  return Object.freeze(result);
}

function memoryRows(
  manifest: BudgetManifest,
  runs: readonly BrowserRunInput[],
  costs: SystemsCostInput | null,
): MetricRow[] {
  const heap = runs
    .map((run) => run.run.pageHeapBytes)
    .filter((value): value is number => value !== null)
    .map((value) => value / MIB);
  const rows: MetricRow[] = [];
  if (heap.length > 0)
    rows.push(
      Object.freeze({
        id: 'memory-page-heap',
        area: 'memory' as const,
        metric: 'heap JS al paginii (performance.memory)',
        configuration: `${runs[0]?.budgetColumn ?? 'laptop'} · ${runs[0]?.renderer ?? 'WEBGPU'} · toate rulările comise`,
        measured: summarize(heap),
        unit: 'MiB' as const,
        budget:
          manifest.proposedCapacities.totalHeapBytes === null
            ? null
            : Object.freeze({
                value: round((manifest.proposedCapacities.totalHeapBytes ?? 0) / MIB),
                direction: 'maximum' as const,
                source: budgetSource(manifest, 'proposedCapacities.totalHeapBytes'),
              }),
        verdict: 'REPORTED' as const,
        note:
          manifest.proposedCapacities.totalHeapBytes === null
            ? 'manifestul nu fixează totalHeapBytes (null): valoarea se raportează, nu se compară cu un prag inventat'
            : 'comparat cu capacitatea fixată',
      }),
    );
  const recorder = costs?.arms.find((arm) => arm.system === 'recorder');
  const recorderBytes = recorder?.counters.peakChargedBytes ?? null;
  const recorderBudget = manifest.proposedCapacities.recorderRamBytes ?? null;
  if (recorderBytes !== null && recorderBudget !== null)
    rows.push(
      Object.freeze({
        id: 'memory-recorder',
        area: 'memory' as const,
        metric: 'vârf de bytes încărcați în recorder',
        configuration: `recorder real peste ${costs?.vehicles ?? 0} vehicule`,
        measured: summarize([recorderBytes / MIB]),
        unit: 'MiB' as const,
        budget: Object.freeze({
          value: round(recorderBudget / MIB),
          direction: 'maximum' as const,
          source: budgetSource(manifest, 'proposedCapacities.recorderRamBytes'),
        }),
        verdict: (recorderBytes <= recorderBudget ? 'PASS' : 'FAIL') as Verdict,
        note: 'contoare de ownership ale contractului, nu RAM totală a paginii',
      }),
    );
  rows.push(
    Object.freeze({
      id: 'memory-exact',
      area: 'memory' as const,
      metric: 'memoria exactă a paginii și a GPU',
      configuration: `${runs[0]?.budgetColumn ?? 'laptop'}`,
      measured: null,
      unit: 'MiB' as const,
      budget: null,
      verdict: 'NOT_MEASURED' as const,
      note: 'API-ul de memorie exactă (page/GPU) nu este disponibil; se raportează heap-ul JS și contoarele de ownership, fără însumarea categoriilor suprapuse',
    }),
  );
  return rows;
}

export function buildHardwareBudgetReport(input: ReportInput): HardwareBudgetReport {
  const { manifest } = input;
  if (input.runs.length < 1) throw new RangeError('The report needs at least one measured run');
  for (const run of input.runs) {
    if (run.budgetColumn !== run.budgetColumn.toLowerCase())
      throw new TypeError('Budget column must be lowercase');
    if (run.run.repeat < 1) throw new RangeError('A measured repeat starts at 1');
    if (!Number.isFinite(run.run.simulatedToWallRatio))
      throw new RangeError('A run without a simulated/wall ratio is not a measurement');
  }
  const groups = groupRuns(input.runs);
  const rows: MetricRow[] = [];
  for (const group of groups) {
    if (group.runs.length !== manifest.protocol.repetitions)
      throw new RangeError(
        `Configuration ${group.id} has ${group.runs.length} repeats; the fixed protocol requires ${manifest.protocol.repetitions}`,
      );
    rows.push(...frameRows(manifest, group));
  }
  rows.push(...loadingRows(manifest, input.loading));
  rows.push(...memoryRows(manifest, input.runs, input.costs));

  // A first-command / cold-load latency is not measurable without the complete game page.
  rows.push(
    Object.freeze({
      id: 'loading-cold-first-command',
      area: 'loading' as const,
      metric: 'pornire la prima comandă acceptată, cold p95',
      configuration: 'joc complet',
      measured: null,
      unit: 'ms' as const,
      budget: Object.freeze({
        value: manifest.proposedBudgets.coldFirstAcceptedCommandP95Ms,
        direction: 'maximum' as const,
        source: budgetSource(manifest, 'proposedBudgets.coldFirstAcceptedCommandP95Ms'),
      }),
      verdict: 'NOT_MEASURED' as const,
      note: 'intrarea de producție src/main.ts nu compune o cursă completă (scenă de bootstrap); nu există „prima comandă acceptată” de măsurat fără a inventa pagina de joc',
    }),
  );

  const costs = costRows(manifest, input.costs, input.runs);

  const configurations = groups.map((group) => {
    const first = group.runs[0] as BrowserRunInput;
    return Object.freeze({
      id: group.id,
      workload: first.workloadLabel,
      backend: first.renderer,
      column: first.budgetColumn,
      preset: first.preset,
      cssResolution: `${first.cssResolution[0]}×${first.cssResolution[1]}`,
      internalResolution: `${first.internalResolution[0]}×${first.internalResolution[1]}`,
      dpr: first.dpr,
      browser: first.browser,
      build: `${first.build.commit.slice(0, 12)} · artifact ${first.build.artifactHash.slice(0, 12)}`,
      protocol: `${manifest.protocol.repetitions} × (${manifest.protocol.warmupSeconds} s warmup + ${manifest.protocol.measuredSeconds} s măsurare)`,
      repeats: group.runs.length,
      stress: first.stress,
    });
  });

  const normalRows = rows.filter((row) => row.verdict !== 'STRUCTURAL');
  const pass = normalRows.filter((row) => row.verdict === 'PASS').length;
  const fail = normalRows.filter((row) => row.verdict === 'FAIL').length;
  const notMeasured = normalRows.filter((row) => row.verdict === 'NOT_MEASURED').length;
  const structural = rows.filter((row) => row.verdict === 'STRUCTURAL').length;
  const reported = normalRows.filter((row) => row.verdict === 'REPORTED').length;

  const deviations = rows
    .filter((row) => row.verdict === 'FAIL')
    .map(
      (row) =>
        `${row.metric} (${row.configuration}): ${row.measured === null ? 'fără valoare' : row.measured.max} ${row.unit} > buget ${row.budget?.value ?? '—'} ${row.unit} [${row.budget?.source ?? 'fără buget'}]`,
    );

  const notMeasuredList: HardwareBudgetReport['notMeasured'][number][] = [];
  for (const row of rows)
    if (row.verdict === 'NOT_MEASURED')
      notMeasuredList.push(
        Object.freeze({
          metric: `${row.metric} (${row.configuration})`,
          reason: row.note,
          measuredInstead:
            row.area === 'loading'
              ? 'bytes reali ai build-ului de producție'
              : row.area === 'memory'
                ? 'performance.memory.usedJSHeapSize și contoare de ownership'
                : 'distribuțiile celorlalte metrici din aceeași configurație',
        }),
      );

  const baseline = input.baseline === null ? null : baselineOf(input.baseline);

  return Object.freeze({
    version: HARDWARE_BUDGET_REPORT_VERSION,
    generatedFrom: Object.freeze([...input.production.generatedFrom]),
    productionCommit: input.production.commit,
    manifest: Object.freeze({
      budgetVersion: manifest.budgetVersion,
      status: manifest.status,
      approvedGate: manifest.approvedGate,
      modified: false as const,
      hashLike: `${manifest.budgetVersion}/${manifest.status}`,
    }),
    configurations: Object.freeze(configurations),
    rows: Object.freeze(rows),
    costs: Object.freeze(costs),
    baseline,
    deviations: Object.freeze(deviations),
    notMeasured: Object.freeze(notMeasuredList),
    summary: Object.freeze({
      pass,
      fail,
      notMeasured,
      structural,
      reported,
      gate: fail > 0 ? 'FAILED' : 'MEASURED_CONFIGURATIONS_PASS',
      hardwareGameplayGate: 'NOT_VALIDATED' as const,
      note: 'Verdictul acoperă numai metricile măsurate pe configurația fixată; gate-ul hardware al jocului complet rămâne NOT_VALIDATED.',
    }),
  });
}

function baselineOf(input: BaselineInput): HardwareBudgetReport['baseline'] {
  const before = summarize(input.values);
  return Object.freeze({
    capturedAt: input.capturedAt,
    commit: input.commit,
    captureId: input.captureId,
    ...(input.sourceHash === undefined ? {} : { sourceHash: input.sourceHash }),
    conditions: input.conditions,
    metric: input.metric,
    before,
    after: null,
    budget: input.budget,
    unit: 'ms' as const,
    verdict: (before.max <= input.budget ? 'PASS' : 'FAIL') as Verdict,
    note:
      before.max <= input.budget
        ? 'baseline-ul documentat intră în buget'
        : `baseline-ul documentat depășește bugetul (${before.max} > ${input.budget}); se păstrează ca dovadă a stării dinainte de optimizare`,
  });
}

/** Structural self-check of a report; used by the script and by the tests, never to hide a FAIL. */
export function verifyHardwareBudgetReport(report: HardwareBudgetReport): readonly string[] {
  const issues: string[] = [];
  if (report.manifest.modified !== false) issues.push('manifestul de bugete apare ca modificat');
  for (const row of report.rows) {
    // A structural invariant (population retained, cleanup) has no distribution and no budget; a
    // metric with a budget can never be PASS without a measurement.
    if (row.verdict === 'PASS' && row.measured === null && row.budget !== null)
      issues.push(`rândul ${row.id} este PASS fără măsurătoare`);
    if (row.verdict === 'PASS' && row.measured === null && row.budget === null && !row.note)
      issues.push(`rândul structural ${row.id} nu explică verificarea`);
    if (row.verdict === 'NOT_MEASURED' && row.note.trim().length === 0)
      issues.push(`rândul ${row.id} este NOT_MEASURED fără motiv`);
    if (row.budget !== null && !row.budget.source.startsWith('Docs/performance-budgets.json'))
      issues.push(`rândul ${row.id} nu citează manifestul de bugete`);
    if (row.verdict === 'FAIL' && !report.deviations.some((entry) => entry.includes(row.metric)))
      issues.push(`absența abaterii pentru rândul ${row.id} (${row.metric})`);
  }
  const counted =
    report.summary.pass +
    report.summary.fail +
    report.summary.notMeasured +
    report.summary.structural +
    report.summary.reported;
  if (counted !== report.rows.length)
    issues.push(`sumarul numără ${counted} rânduri, raportul are ${report.rows.length}`);
  for (const configuration of report.configurations)
    if (configuration.repeats !== report.configurations[0]?.repeats)
      issues.push(` configurația ${configuration.id} nu are același număr de repetări`);
  const systems = new Set(report.costs.map((entry) => entry.system));
  if (report.costs.length > 0 && systems.size !== SYSTEM_IDS.length)
    issues.push(`costurile acoperă ${systems.size}/${SYSTEM_IDS.length} sisteme`);
  for (const cost of report.costs)
    if (!Number.isFinite(cost.perTickMs.p95))
      issues.push(`costul ${cost.system} nu are un p95 finit`);
  return Object.freeze(issues);
}

function rowTable(rows: readonly MetricRow[]): string[] {
  const lines = [
    '| Metrică | Configurație | min | p50 | p95 | p99 | max | Buget | Verdict |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of rows)
    lines.push(
      `| ${row.metric} | ${row.configuration} | ${row.measured?.min ?? '—'} | ${row.measured?.p50 ?? '—'} | ${row.measured?.p95 ?? '—'} | ${row.measured?.p99 ?? '—'} | ${row.measured?.max ?? '—'} | ${row.budget === null ? 'fără buget' : `${row.budget.value} ${row.unit} (${row.budget.direction === 'maximum' ? '≤' : '≥'})`} | ${row.verdict} |`,
    );
  return lines;
}

export function hardwareBudgetMarkdown(report: HardwareBudgetReport): string {
  const lines: string[] = [];
  lines.push('# PBI 155 — verificarea hardware și a bugetelor fixate');
  lines.push('');
  lines.push(
    `Raport determinist derivat din măsurătorile comise (${report.version}); bugetele sunt citate din manifestul \`${report.manifest.budgetVersion}\` și **nu** sunt modificate.`,
  );
  lines.push('');
  lines.push(`- Build curent: \`${report.productionCommit}\``);
  lines.push(
    `- Sumar: **${report.summary.pass} PASS**, **${report.summary.fail} FAIL**, ${report.summary.notMeasured} NOT_MEASURED, ${report.summary.structural} STRUCTURAL, ${report.summary.reported} REPORTED`,
  );
  lines.push(
    `- Verdict: \`${report.summary.gate}\`; gate hardware al jocului complet: \`${report.summary.hardwareGameplayGate}\``,
  );
  lines.push('');
  lines.push(
    'Coloanele min/p50/p95/p99/max ale fiecărui rând sunt statistica valorii metricii pe cele cinci repetări; distribuția per cadru (p50/p95/p99, histogramă, cadre peste buget) a fiecărei rulări este în `report.json`.',
  );
  lines.push('');
  lines.push('## Configurațiile măsurate');
  lines.push('');
  lines.push(
    '| Configurație | Workload | Backend | Coloană | Preset | CSS | Intern | DPR | Repetări | Build | Protocol |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- |');
  for (const configuration of report.configurations)
    lines.push(
      `| ${configuration.id} | ${configuration.workload} | ${configuration.backend} | ${configuration.column} | ${configuration.preset} | ${configuration.cssResolution} | ${configuration.internalResolution} | ${configuration.dpr} | ${configuration.repeats} | ${configuration.build} | ${configuration.protocol} |`,
    );
  lines.push('');
  const areas: readonly [MetricRow['area'], string][] = [
    ['frame', 'Cadru, main thread și cadență'],
    ['simulation', 'Simulare, tick și learning'],
    ['input', 'Input'],
    ['memory', 'Memorie'],
    ['loading', 'Încărcare'],
  ];
  for (const [area, title] of areas) {
    const rows = report.rows.filter((row) => row.area === area);
    if (rows.length === 0) continue;
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(...rowTable(rows));
    lines.push('');
  }
  lines.push('## Costul fiecărui sistem peste baseline');
  lines.push('');
  if (report.costs.length === 0) lines.push('Niciun cost măsurat.');
  else {
    lines.push(
      '| Sistem | Cadență | Invocări/eșantion | Δ ms/invocare p95 | Δ ms/tick p95 | Δ ms/secundă simulată p95 | % din bugetul de tick | % din bugetul main-thread | Contoare reale | Eșantioane | Zgomot |',
    );
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |');
    for (const cost of report.costs)
      lines.push(
        `| ${cost.system} | ${cost.cadence} | ${cost.invocationsPerSample} | ${cost.perInvocationMs.p95} | ${cost.perTickMs.p95} | ${cost.perSimulatedSecondMs.p95} | ${cost.shareOfTickBudgetPercent}% | ${cost.shareOfFrameBudgetPercent}% | ${Object.entries(
          cost.counters,
        )
          .map(([key, value]) => `${key}=${value === null ? 'null' : value}`)
          .join(
            '; ',
          )} | ${cost.samples} | ${cost.noiseFloor ? 'sub zgomotul de măsurare' : 'peste zgomot'} |`,
      );
  }
  lines.push('');
  if (report.baseline !== null) {
    lines.push('## Baseline înainte de optimizări');
    lines.push('');
    lines.push(
      `Captura \`${report.baseline.captureId}\` din ${report.baseline.capturedAt}, commit \`${report.baseline.commit.slice(0, 12)}\`${report.baseline.sourceHash === undefined ? '' : `, sourceHash \`${report.baseline.sourceHash.slice(0, 12)}\``}.`,
    );
    lines.push('');
    lines.push(report.baseline.conditions);
    lines.push('');
    lines.push('| Metrică | Valori pe repetări | Buget | Verdict |');
    lines.push('| --- | ---: | ---: | --- |');
    lines.push(
      `| ${report.baseline.metric} | p50 ${report.baseline.before.p50}, p95 ${report.baseline.before.p95}, max ${report.baseline.before.max} | ≤ ${report.baseline.budget} ms | ${report.baseline.verdict} |`,
    );
    lines.push('');
    lines.push(report.baseline.note);
    lines.push('');
  }
  lines.push('## Abateri');
  lines.push('');
  if (report.deviations.length === 0)
    lines.push('Niciuna dintre metricile măsurate nu depășește bugetul citat.');
  else for (const deviation of report.deviations) lines.push(`- ${deviation}`);
  lines.push('');
  lines.push('## Ce nu a putut fi măsurat');
  lines.push('');
  if (report.notMeasured.length === 0) lines.push('Niciun element declarat indisponibil.');
  else {
    lines.push('| Metrică | Motiv | Măsurat în schimb |');
    lines.push('| --- | --- | --- |');
    for (const entry of report.notMeasured)
      lines.push(`| ${entry.metric} | ${entry.reason} | ${entry.measuredInstead} |`);
  }
  lines.push('');
  lines.push(report.summary.note);
  lines.push('');
  return lines.join('\n');
}
