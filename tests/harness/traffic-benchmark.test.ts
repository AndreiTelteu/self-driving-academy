import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRAFFIC_BENCHMARK_VERSION,
  TRAFFIC_CIVIL_DENSITIES,
  TRAFFIC_CONDITIONS,
  TRAFFIC_SYSTEM_IDS,
  TRAFFIC_TAXI_COUNTS,
  buildTrafficBenchmarkReport,
  expandTrafficMatrix,
  trafficBenchmarkMarkdown,
  trafficClassification,
  trafficRowId,
  verifyTrafficBenchmarkReport,
} from './traffic-benchmark';
import type {
  TrafficBenchmarkMeasurement,
  TrafficBenchmarkRow,
  TrafficCpuBreakdown,
  TrafficRowMeasurement,
  TrafficRowSpec,
} from './traffic-benchmark';
import { parseBudgetManifest, summarize } from './hardware-budget';
import type { BudgetManifest, StatisticSummary } from './hardware-budget';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function manifest(): Promise<BudgetManifest> {
  return parseBudgetManifest(
    JSON.parse(await readFile(join(root, 'Docs', 'performance-budgets.json'), 'utf8')),
  );
}

function statistic(value: number): StatisticSummary {
  return {
    count: 180,
    p50: value,
    p95: value,
    p99: value,
    min: value,
    max: value,
    mean: value,
  };
}

interface RowOptions {
  readonly tick?: number;
  readonly physics?: number;
  readonly decisions?: number;
  readonly ui?: number;
  readonly system?: number;
  readonly simulatedSeconds?: number;
  readonly wallSeconds?: number;
  readonly learningP95?: number | null;
  readonly recorderPeakBytes?: number | null;
  readonly coldFirstCommandMs?: number | null;
  readonly invisibleTaxis?: number;
  readonly invisibleDecisions?: number;
  readonly invisibleMoved?: number;
  readonly fleetVehicles?: number;
  readonly fleetVehicleSeconds?: number;
  readonly cleanupLeaked?: boolean;
}

function cpu(options: RowOptions): TrafficCpuBreakdown {
  return {
    tick: statistic(options.tick ?? 4),
    physics: statistic(options.physics ?? 0.4),
    controller: statistic(0.3),
    decisions: statistic(options.decisions ?? 1.2),
    ui: statistic(options.ui ?? 0.08),
    system: statistic(options.system ?? 0.2),
  };
}

function rowFor(spec: TrafficRowSpec, options: RowOptions = {}): TrafficRowMeasurement {
  const simulatedSeconds = options.simulatedSeconds ?? 3;
  const wallSeconds = options.wallSeconds ?? 3;
  const invisibleTaxis = options.invisibleTaxis ?? Math.max(1, Math.floor(spec.taxis / 3));
  const fleetVehicles = options.fleetVehicles ?? spec.taxis + spec.authoritativeCivilians;
  const learning =
    spec.system === 'LEARNING'
      ? options.learningP95 === null
        ? null
        : summarize([options.learningP95 ?? 120])
      : null;
  const structural: { id: string; pass: boolean; detail: string }[] = [
    {
      id: 'populatie-fizica-completa',
      pass: true,
      detail: `${spec.taxis + spec.civilians} vehicule fizice`,
    },
    {
      id: 'taxiuri-invizibile-simulate',
      pass: invisibleTaxis >= 1 && (options.invisibleMoved ?? invisibleTaxis) >= 1,
      detail: `${invisibleTaxis} taxiuri invizibile`,
    },
    {
      id: 'expunere-include-flota-intreaga',
      pass: true,
      detail: `${fleetVehicles} vehicule × ${simulatedSeconds} s`,
    },
    { id: 'cleanup-fara-resurse', pass: !(options.cleanupLeaked ?? false), detail: 'cleanup' },
  ];
  if (spec.system === 'LEARNING')
    structural.push({
      id: 'learning-activat',
      pass: learning !== null,
      detail: 'un segment, o activare',
    });
  if (spec.system === 'RECORDER_AUTOSAVE')
    structural.push({
      id: 'recorder-autosave-executat',
      pass: (options.recorderPeakBytes ?? 1_000_000) !== null,
      detail: 'mostre și capturi',
    });
  if (spec.system === 'XP')
    structural.push({ id: 'xp-creditat', pass: true, detail: 'o fereastră XP' });
  if (spec.condition === 'AGGRESSIVE')
    structural.push({ id: 'contacte-agresive', pass: true, detail: 'contacte reale' });
  const repeat = {
    repeat: 1,
    ticks: 180,
    simulatedSeconds,
    wallMs: wallSeconds * 1000,
    cpu: cpu(options),
    contactsMax: spec.condition === 'AGGRESSIVE' ? 3 : 0,
    collisionEvents: spec.condition === 'AGGRESSIVE' ? 2 : 0,
    minPairGapM: 4,
    pairLeaderSpeedMax: 2,
    pairFollowerSpeedMax: 5,
    decisions: 600,
    invisibleDecisions: options.invisibleDecisions ?? invisibleTaxis * 90,
    taxisMoved: options.invisibleMoved ?? invisibleTaxis,
    systemInvocations: 180,
    uiInvocations: 30,
    learningSegments: spec.system === 'LEARNING' ? 1 : 0,
    learningActivations: spec.system === 'LEARNING' ? 1 : 0,
    learningEndToEndMs: spec.system === 'LEARNING' && learning !== null ? [120] : [],
    recorderSamples: spec.system === 'RECORDER_AUTOSAVE' ? 60 : 0,
    recorderPeakBytes: options.recorderPeakBytes ?? 1_000_000,
    autosaveCaptures: spec.system === 'RECORDER_AUTOSAVE' ? 2 : 0,
    autosaveBytes: spec.system === 'RECORDER_AUTOSAVE' ? 400_000 : 0,
    xpWindows: spec.system === 'XP' ? 1 : 0,
    xpEntries: spec.system === 'XP' ? 1 : 0,
    fleetVehicles,
    fleetVehicleSeconds: options.fleetVehicleSeconds ?? fleetVehicles * simulatedSeconds,
    invisibleTaxis,
    invisibleVehicles: invisibleTaxis + 4,
    physicalVehicles: spec.taxis + spec.civilians,
    surplusActors: spec.surplusCivilians,
    coldFirstCommandMs:
      spec.condition === 'COLD_FIRST_USE' ? (options.coldFirstCommandMs ?? 600) : null,
    cleanupLeaked: options.cleanupLeaked ?? false,
  };
  return {
    spec,
    repeats: [repeat, { ...repeat, repeat: 2 }],
    pooled: cpu(options),
    perRepeatP95: [
      { repeat: 1, tick: 4, physics: 0.4, decisions: 1.2, ui: 0.08, system: 0.2 },
      { repeat: 2, tick: 4, physics: 0.4, decisions: 1.2, ui: 0.08, system: 0.2 },
    ],
    simulatedSeconds,
    wallSeconds,
    expectedTaxis: spec.taxis,
    expectedCivilians: spec.civilians,
    physicalVehicles: spec.taxis + spec.civilians,
    surplusActors: spec.surplusCivilians,
    invisibleTaxis,
    invisibleVehicles: invisibleTaxis + 4,
    invisibleTaxiDecisions: options.invisibleDecisions ?? invisibleTaxis * 90,
    invisibleTaxiBodiesMoved: options.invisibleMoved ?? invisibleTaxis,
    fleetVehicles,
    fleetVehicleSeconds: options.fleetVehicleSeconds ?? fleetVehicles * simulatedSeconds,
    exposureSeconds: simulatedSeconds,
    contactsMax: spec.condition === 'AGGRESSIVE' ? 3 : 0,
    collisionEvents: spec.condition === 'AGGRESSIVE' ? 2 : 0,
    learningSegments: spec.system === 'LEARNING' ? 1 : 0,
    learningActivations: spec.system === 'LEARNING' ? 1 : 0,
    learningEndToEndMs: learning,
    recorderPeakBytes:
      spec.system === 'RECORDER_AUTOSAVE' ? (options.recorderPeakBytes ?? 1_000_000) : null,
    recorderSamples: spec.system === 'RECORDER_AUTOSAVE' ? 60 : 0,
    autosaveCaptures: spec.system === 'RECORDER_AUTOSAVE' ? 2 : 0,
    autosaveBytes: spec.system === 'RECORDER_AUTOSAVE' ? 400_000 : 0,
    xpWindows: spec.system === 'XP' ? 1 : 0,
    xpEntries: spec.system === 'XP' ? 1 : 0,
    coldFirstCommandMs:
      spec.condition === 'COLD_FIRST_USE' ? (options.coldFirstCommandMs ?? 600) : null,
    cleanupLeaked: options.cleanupLeaked ?? false,
    structural,
  };
}

function measurement(
  mutate: (spec: TrafficRowSpec) => RowOptions = () => ({}),
  filter?: (spec: TrafficRowSpec) => boolean,
): TrafficBenchmarkMeasurement {
  const rows = expandTrafficMatrix()
    .filter((spec) => filter === undefined || filter(spec))
    .map((spec) => rowFor(spec, mutate(spec)));
  return {
    version: TRAFFIC_BENCHMARK_VERSION,
    measuredAt: '2026-11-12T00:00:00.000Z',
    machine: 'test fixture; not a measurement',
    command: 'unit test',
    protocol: {
      warmupTicks: 30,
      measuredTicks: 180,
      coldTicks: 120,
      repeats: 2,
      coldRepeats: 1,
      autosaveCadenceTicks: 90,
      learningCadenceTicks: 300,
      xpWindowTicks: 300,
      uiCadenceTicks: 6,
      decisionCadenceTicks: 6,
      observationHalfExtentM: 80,
      seed: 156_001,
    },
    rows,
  };
}

function findRow(
  report: ReturnType<typeof buildTrafficBenchmarkReport>,
  pattern: string,
): TrafficBenchmarkRow {
  const row = report.rows.find((entry) => entry.id.includes(pattern));
  assert.ok(row, `missing row ${pattern}`);
  return row;
}

test('the executed matrix covers every axis combination with a stable id', () => {
  const matrix = expandTrafficMatrix();
  assert.equal(matrix.length, 3 * 3 * 4 * 3);
  assert.equal(new Set(matrix.map((row) => row.id)).size, matrix.length);
  assert.deepEqual(
    [...new Set(matrix.map((row) => row.taxis))].sort((left, right) => left - right),
    [...TRAFFIC_TAXI_COUNTS],
  );
  assert.deepEqual(
    [...new Set(matrix.map((row) => row.civilians))].sort((left, right) => left - right),
    [...TRAFFIC_CIVIL_DENSITIES],
  );
  assert.deepEqual([...new Set(matrix.map((row) => row.system))], [...TRAFFIC_SYSTEM_IDS]);
  assert.deepEqual([...new Set(matrix.map((row) => row.condition))], [...TRAFFIC_CONDITIONS]);
  assert.equal(matrix[0]?.id, trafficRowId(20, 20, 'BASELINE', 'NORMAL'));
});

test('only the declared manifest workloads gate; overload is labelled and density variants are reported', () => {
  assert.equal(trafficClassification(20, 20), 'GATE');
  assert.equal(trafficClassification(24, 40), 'GATE');
  assert.equal(trafficClassification(30, 40), 'GATE');
  assert.equal(trafficClassification(30, 80), 'STRESS');
  assert.equal(trafficClassification(20, 40), 'REPORTED');
  assert.equal(trafficClassification(24, 80), 'REPORTED');
  assert.equal(trafficClassification(30, 20), 'REPORTED');
});

test('the report separates physics, decisions, UI, the attached system and GPU', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement(),
  });
  const row = findRow(report, '24x40-learning-normal');
  assert.equal(row.cpu.physics.p95, 0.4);
  assert.equal(row.cpu.decisions.p95, 1.2);
  assert.equal(row.cpu.ui.p95, 0.08);
  assert.equal(row.cpu.system.p95, 0.2);
  assert.equal(row.gpu.verdict, 'NOT_MEASURED');
  assert.match(row.gpu.reason, /fără renderer/);
  assert.equal(row.verdict, 'PASS');
});

test('gate rows pass only when every measurable budget is inside the manifest', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement(),
  });
  assert.equal(report.matrix.gateRows, 36);
  assert.equal(report.matrix.stressRows, 12);
  assert.equal(report.matrix.reportedRows, 60);
  assert.equal(report.summary.pass, 36);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.stress, 12);
  assert.equal(report.summary.reported, 60);
  assert.equal(report.summary.gate, 'MEASURED_GATE_PASS');
  assert.equal(verifyTrafficBenchmarkReport(report).length, 0);
});

test('an over-budget gate row fails and is reported with the cited budget', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement((spec) =>
      spec.taxis === 30 &&
      spec.civilians === 40 &&
      spec.system === 'BASELINE' &&
      spec.condition === 'NORMAL'
        ? { tick: 12 }
        : {},
    ),
  });
  const row = findRow(report, '30x40-baseline-normal');
  assert.equal(row.verdict, 'FAIL');
  assert.equal(report.summary.fail, 1);
  assert.equal(report.summary.gate, 'FAILED');
  assert.ok(row.findings.some((entry) => entry.includes('tick autoritar p95')));
  assert.ok(row.findings.some((entry) => entry.includes('Docs/performance-budgets.json')));
});

test('overload stays labelled STRESS even above budget and never becomes a normal pass', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement((spec) =>
      spec.taxis === 30 && spec.civilians === 80 ? { tick: 40 } : {},
    ),
  });
  const row = findRow(report, '30x80-baseline-normal');
  assert.equal(row.classification, 'STRESS');
  assert.equal(row.verdict, 'STRESS');
  assert.ok(row.stressOverBudget.length > 0);
  assert.equal(report.summary.fail, 0);
});

test('density variants outside the manifest are measured and reported, not gated', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement((spec) =>
      spec.taxis === 24 && spec.civilians === 80 ? { tick: 40 } : {},
    ),
  });
  const row = findRow(report, '24x80-baseline-normal');
  assert.equal(row.classification, 'REPORTED');
  assert.equal(row.verdict, 'REPORTED');
  assert.equal(report.summary.fail, 0);
  assert.ok(row.stressOverBudget.length > 0);
});

test('NOT_MEASURED learning is declared with a reason instead of a fabricated pass', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement((spec) => (spec.system === 'LEARNING' ? { learningP95: null } : {})),
  });
  const row = findRow(report, '24x40-learning-normal');
  const entry = row.checks.find((item) => item.id.endsWith('-learning-p95'));
  assert.ok(entry);
  assert.equal(entry.verdict, 'NOT_MEASURED');
  assert.match(entry.note, /activare/);
});

test('recorder bytes and cold first command are checked against the manifest capacities', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement((spec) => {
      if (spec.system === 'RECORDER_AUTOSAVE' && spec.condition === 'NORMAL')
        return { recorderPeakBytes: 64 * 1024 * 1024 };
      if (spec.condition === 'COLD_FIRST_USE') return { coldFirstCommandMs: 13_000 };
      return {};
    }),
  });
  const recorder = findRow(report, '24x40-recorder_autosave-normal');
  const bytes = recorder.checks.find((item) => item.id.endsWith('-recorder-bytes'));
  assert.equal(bytes?.budget, 33_554_432);
  assert.equal(bytes?.verdict, 'FAIL');
  const cold = findRow(report, '24x40-baseline-cold_first_use');
  const coldEntry = cold.checks.find((item) => item.id.endsWith('-cold-first-command'));
  assert.equal(coldEntry?.budget, 12_000);
  assert.equal(coldEntry?.verdict, 'FAIL');
  assert.equal(cold.verdict, 'FAIL');
});

test('exposure uses the whole fleet and the invisible-taxi proof is mandatory', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement(),
  });
  const row = findRow(report, '30x40-baseline-normal');
  assert.equal(
    row.exposure.fleetVehicleSeconds,
    row.exposure.fleetVehicles * row.exposure.simulatedSeconds,
  );
  assert.ok(row.exposure.invisibleTaxis >= 1);
  assert.ok(row.exposure.invisibleTaxiDecisions >= 1);
  assert.ok(row.exposure.invisibleTaxiBodiesMoved >= 1);
});

test('the verifier refuses a missing invisible proof, a partial matrix and a PASS without measurement', async () => {
  const full = measurement();
  const withoutInvisible = {
    ...full,
    rows: full.rows.map((row) =>
      row.spec.id.includes('20x20-baseline-normal')
        ? { ...row, invisibleTaxis: 0, invisibleTaxiDecisions: 0, invisibleTaxiBodiesMoved: 0 }
        : row,
    ),
  };
  const issues = verifyTrafficBenchmarkReport(
    buildTrafficBenchmarkReport({ manifest: await manifest(), measurement: withoutInvisible }),
  );
  assert.ok(issues.some((issue) => issue.includes('taxi invizibil')));
  assert.ok(issues.some((issue) => issue.includes('decizii pentru taxiurile invizibile')));

  const partial = verifyTrafficBenchmarkReport(
    buildTrafficBenchmarkReport({
      manifest: await manifest(),
      measurement: measurement(undefined, (spec) => spec.system === 'BASELINE'),
    }),
  );
  assert.ok(partial.some((issue) => issue.includes('contractul cere')));
});

test('the markdown report states the matrix, the invisible-taxi proof and the NOT_MEASURED list', async () => {
  const report = buildTrafficBenchmarkReport({
    manifest: await manifest(),
    measurement: measurement(),
  });
  const markdown = trafficBenchmarkMarkdown(report);
  assert.match(markdown, /## Matricea executată/);
  assert.match(markdown, /## Taxiuri invizibile și expunere/);
  assert.match(markdown, /## Verificări de buget pe rândurile de gate/);
  assert.match(markdown, /## Suprasarcină și abateri/);
  assert.match(markdown, /## Ce nu a putut fi măsurat/);
  assert.match(markdown, /NOT_MEASURED/);
  assert.match(markdown, /30 taxiuri \/ 80 civili/);
  const rowLines = markdown.split('\n').filter((line) => line.startsWith('| 20 | 20 | BASELINE |'));
  assert.equal(rowLines.length, 6);
});
