import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HARDWARE_BUDGET_REPORT_VERSION,
  SYSTEM_IDS,
  budgetSource,
  buildHardwareBudgetReport,
  hardwareBudgetMarkdown,
  parseBudgetManifest,
  percentile,
  summarize,
  verifyHardwareBudgetReport,
} from './hardware-budget';
import type {
  BrowserRunInput,
  BudgetManifest,
  ReportInput,
  StatisticSummary,
  SystemsCostInput,
} from './hardware-budget';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function manifest(): Promise<BudgetManifest> {
  return parseBudgetManifest(
    JSON.parse(await readFile(join(root, 'Docs', 'performance-budgets.json'), 'utf8')),
  );
}

function statistic(value: number, spread = 1): StatisticSummary {
  return {
    count: 6000,
    p50: value,
    p95: value + spread,
    p99: value + spread * 2,
    min: value - spread,
    max: value + spread * 2,
    mean: value + spread / 2,
  };
}

interface RunOptions {
  renderer?: string;
  workload?: string;
  stress?: boolean;
  frameP95?: number;
  tickP95?: number;
  ratio?: number;
  gpu?: number | null;
  input?: number | null;
  learning?: number | null;
  heap?: number | null;
  longTask?: number | null;
  vehicles?: number;
  expected?: number;
  leaked?: boolean;
}

function run(repeat: number, options: RunOptions = {}): BrowserRunInput {
  return {
    captureId: 'capture-155',
    renderer: options.renderer ?? 'WEBGPU',
    budgetColumn: 'laptop',
    browser: 'Chromium test',
    preset: 'LOW_FIXED_155',
    cssResolution: [1920, 1080],
    internalResolution: [1920, 1080],
    dpr: 1,
    build: { commit: 'a'.repeat(40), sourceHash: 'b'.repeat(64), artifactHash: 'c'.repeat(64) },
    workload: options.workload ?? 'maximum-30',
    workloadLabel: '30 taxiuri / 40 civili',
    stress: options.stress ?? false,
    expectedVehicles: options.expected ?? 70,
    run: {
      repeat,
      frameMs: statistic(options.frameP95 ?? 16.8),
      mainThreadMs: statistic(6),
      authoritativeTickMs: statistic(options.tickP95 ?? 5.5),
      rapierStepMs: statistic(0.4),
      inputToCommandMs: options.input === null ? null : statistic(options.input ?? 2.5),
      learningEndToEndMs: options.learning === null ? null : statistic(options.learning ?? 18),
      gpuMs: options.gpu === null ? null : statistic(options.gpu ?? 1.1),
      gpuStatus: options.gpu === null ? 'unavailable: timer query unsupported' : 'available',
      pageHeapBytes: options.heap === null ? null : (options.heap ?? 64 * 1024 * 1024),
      longTaskMaxMs: options.longTask === null ? null : (options.longTask ?? 0),
      simulatedToWallRatio: options.ratio ?? 1.0001,
      framesOver35Ms: 0,
      physicalVehicles: options.vehicles ?? 70,
      cleanupLeaked: options.leaked ?? false,
    },
  };
}

function fiveRuns(options: RunOptions = {}): BrowserRunInput[] {
  return [1, 2, 3, 4, 5].map((repeat) => run(repeat, options));
}

function costs(overrides: Partial<Record<string, number>> = {}): SystemsCostInput {
  const baseline = [100, 101, 99, 100, 102];
  return {
    measuredAt: '2026-11-12T00:00:00.000Z',
    machine: 'test machine',
    command: 'npm run perf:hardware-budget -- --measure',
    ticksPerSample: 600,
    samples: baseline.length,
    vehicles: 70,
    baselineMs: baseline,
    arms: SYSTEM_IDS.map((system) => ({
      system,
      cadence: 'test cadence',
      invocationsPerSample: 100,
      totalMs: baseline.map((value) => value + (overrides[system] ?? 6)),
      counters:
        system === 'recorder'
          ? { peakChargedBytes: 1_395_200 }
          : ({ entries: 1 } as Record<string, number | null>),
    })),
  };
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    manifest: undefined as unknown as BudgetManifest,
    runs: fiveRuns(),
    baseline: null,
    loading: {
      build: {
        commit: 'a'.repeat(40),
        artifactCount: 130,
        javascriptBytes: 3_400_000,
        wasmBytes: 2_600_000,
        cssBytes: 44_000,
        gzipBytes: 1_700_000,
        measuredAt: '2026-11-12T00:00:00.000Z',
        command: 'npm run perf:hardware-budget -- --measure',
      },
    },
    costs: costs(),
    production: { commit: 'a'.repeat(40), generatedFrom: ['fixture'] },
    ...overrides,
  };
}

test('the manifest is read, not redefined', async () => {
  const parsed = await manifest();
  assert.equal(parsed.budgetVersion, '203-initial-1');
  assert.equal(parsed.proposedBudgets.laptop.authoritativeTickP95Ms, 8);
  assert.equal(parsed.proposedBudgets.desktop.frameP95Ms, 18.5);
  assert.equal(parsed.proposedBudgets.laptop.renderFps, 30);
  assert.equal(parsed.protocol.repetitions, 5);
  assert.equal(parsed.proposedCapacities.recorderRamBytes, 33_554_432);
  assert.equal(parsed.proposedCapacities.totalHeapBytes, null);
  assert.equal(
    budgetSource(parsed, 'proposedBudgets.laptop.frameP95Ms').includes('203-initial-1'),
    true,
  );
});

test('nearest-rank percentiles and the summary use the 218 rule', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.95), 5);
  assert.equal(percentile([5], 0.99), 5);
  assert.deepEqual(summarize([1, 2, 3]).p95, 3);
  assert.equal(summarize([1, 2, 3], 5).p50, 2);
  assert.throws(() => percentile([], 0.5));
  assert.throws(() => summarize([1, Number.NaN]));
});

test('a measured configuration inside every budget passes', async () => {
  const report = buildHardwareBudgetReport(input({ manifest: await manifest() }));
  assert.equal(report.version, HARDWARE_BUDGET_REPORT_VERSION);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.gate, 'MEASURED_CONFIGURATIONS_PASS');
  assert.equal(report.summary.hardwareGameplayGate, 'NOT_VALIDATED');
  const frame = report.rows.find((row) => row.id.endsWith('-frame-p95'));
  assert.equal(frame?.verdict, 'PASS');
  assert.equal(frame?.budget?.source.startsWith('Docs/performance-budgets.json'), true);
  assert.deepEqual(verifyHardwareBudgetReport(report), []);
});

test('an over-budget repetition is a FAIL with the real value, never a redefined budget', async () => {
  const report = buildHardwareBudgetReport(
    input({ manifest: await manifest(), runs: fiveRuns({ tickP95: 9.4 }) }),
  );
  const tick = report.rows.find((row) => row.id.endsWith('-tick-p95'));
  assert.equal(tick?.verdict, 'FAIL');
  assert.equal(tick?.measured?.max, 9.4 + 1);
  assert.equal(tick?.budget?.value, 8);
  assert.equal(report.summary.fail, 1);
  assert.equal(report.summary.gate, 'FAILED');
  assert.equal(report.deviations.length, 1);
  assert.equal(report.deviations[0]?.includes('tick autoritar'), true);
  assert.equal(report.manifest.modified, false);
});

test('the derived cadence must clear a minimum, not a maximum', async () => {
  const report = buildHardwareBudgetReport(
    input({ manifest: await manifest(), runs: fiveRuns({ frameP95: 40 }) }),
  );
  const fps = report.rows.find((row) => row.id.endsWith('-fps'));
  assert.equal(fps?.budget?.direction, 'minimum');
  assert.equal(fps?.verdict, 'FAIL');
  assert.equal(fps?.measured?.max, 25);
});

test('unavailable GPU and input are NOT_MEASURED with a reason, never zero', async () => {
  const report = buildHardwareBudgetReport(
    input({
      manifest: await manifest(),
      runs: fiveRuns({ gpu: null, input: null, learning: null, heap: null }),
    }),
  );
  const gpu = report.rows.find((row) => row.id.endsWith('-gpu-p95'));
  assert.equal(gpu?.verdict, 'NOT_MEASURED');
  assert.equal(gpu?.measured, null);
  assert.equal(gpu?.note.includes('null, nu 0'), true);
  const memory = report.rows.find((row) => row.id === 'memory-exact');
  assert.equal(memory?.verdict, 'NOT_MEASURED');
  assert.equal(
    report.notMeasured.some((entry) => entry.metric.includes('memoria exactă')),
    true,
  );
});

test('the stress probe is structural and cannot pass as a normal workload', async () => {
  const report = buildHardwareBudgetReport(
    input({
      manifest: await manifest(),
      runs: fiveRuns({ stress: true, workload: 'overload-30-80', tickP95: 9.9 }),
    }),
  );
  assert.equal(
    report.rows.some((row) => row.verdict === 'STRUCTURAL'),
    true,
  );
  assert.equal(
    report.rows.filter((row) => row.verdict === 'PASS' && row.id.endsWith('-tick-p95')).length,
    0,
  );
  assert.equal(report.summary.fail, 0);
});

test('a configuration without the fixed five repetitions is refused', async () => {
  const parsed = await manifest();
  assert.throws(() =>
    buildHardwareBudgetReport(input({ manifest: parsed, runs: fiveRuns().slice(0, 3) })),
  );
});

test('system costs are paired deltas over the baseline, with noise declared', async () => {
  const parsed = await manifest();
  const report = buildHardwareBudgetReport(
    input({ manifest: parsed, costs: costs({ learning: 0, recorder: 60 }) }),
  );
  assert.equal(report.costs.length, SYSTEM_IDS.length);
  const recorder = report.costs.find((entry) => entry.system === 'recorder');
  assert.equal(recorder?.perTickMs.p95, 0.1);
  assert.equal(recorder?.shareOfTickBudgetPercent, 1.25);
  const learning = report.costs.find((entry) => entry.system === 'learning');
  assert.equal(learning?.noiseFloor, true);
  assert.equal(
    report.rows.some((row) => row.metric.includes('recorder')),
    true,
  );
});

test('the documented baseline before the optimisations keeps its FAIL', async () => {
  const report = buildHardwareBudgetReport(
    input({
      manifest: await manifest(),
      baseline: {
        capturedAt: '2026-10-22T01:06:04.388Z',
        commit: 'd'.repeat(40),
        captureId: '20261022T005309189Z',
        sourceHash: 'e'.repeat(64),
        conditions: 'înainte de corecții',
        metric: 'tick autoritar p95',
        values: [6.6, 7.1, 8.4, 9.1, 10.4],
        budget: 8,
        unit: 'ms',
      },
    }),
  );
  assert.equal(report.baseline?.verdict, 'FAIL');
  assert.equal(report.baseline?.before.max, 10.4);
  assert.equal(report.baseline?.sourceHash, 'e'.repeat(64));
});

test('the verifier rejects a PASS without a measurement and an unlisted deviation', async () => {
  const report = buildHardwareBudgetReport(
    input({ manifest: await manifest(), runs: fiveRuns({ tickP95: 9.4 }) }),
  );
  const broken = {
    ...report,
    rows: report.rows.map((row) =>
      row.id.endsWith('-frame-p95') ? { ...row, measured: null } : row,
    ),
    deviations: [],
  };
  const issues = verifyHardwareBudgetReport(broken as typeof report);
  assert.equal(
    issues.some((issue) => issue.includes('PASS fără măsurătoare')),
    true,
  );
  assert.equal(
    issues.some((issue) => issue.includes('absența abaterii')),
    true,
  );
});

test('the Markdown rendering is deterministic and cites unavailable metrics', async () => {
  const parsed = await manifest();
  const first = hardwareBudgetMarkdown(
    buildHardwareBudgetReport(input({ manifest: parsed, runs: fiveRuns({ gpu: null }) })),
  );
  const second = hardwareBudgetMarkdown(
    buildHardwareBudgetReport(input({ manifest: parsed, runs: fiveRuns({ gpu: null }) })),
  );
  assert.equal(first, second);
  assert.equal(first.includes('Ce nu a putut fi măsurat'), true);
  assert.equal(first.includes('NOT_MEASURED'), true);
  assert.equal(first.includes('Costul fiecărui sistem peste baseline'), true);
  assert.equal(first.includes('203-initial-1'), true);
  assert.equal(first.includes('cardinal'), false);
});
