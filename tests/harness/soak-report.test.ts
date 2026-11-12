import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOAK_REQUIRED_CYCLES,
  SOAK_REQUIRED_MINUTES,
  type SoakIncident,
  type SoakLifecycleCycle,
  type SoakMeasurement,
  type SoakMeasurementSample,
} from './soak-session';
import {
  SOAK_REPORT_VERSION,
  buildSoakReport,
  buildSoakTrend,
  soakMarkdown,
  verifySoakReport,
} from './soak-report';
import { parseBudgetManifest } from './hardware-budget';
import type { BudgetManifest } from './hardware-budget';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function manifestFixture(): Promise<{ manifest: BudgetManifest; raw: unknown }> {
  const raw = JSON.parse(await readFile(join(root, 'Docs', 'performance-budgets.json'), 'utf8'));
  return { manifest: parseBudgetManifest(raw), raw };
}

interface SampleOptions {
  readonly atMs: number;
  readonly cycle?: number;
  readonly heapUsedBytes?: number;
  readonly rssBytes?: number;
  readonly governorJobs?: number;
  readonly governorBytes?: number;
  readonly recorderChargedBytes?: number;
  readonly retentionDbBytes?: number;
  readonly retentionArtifacts?: number;
  readonly retentionStatus?: 'WITHIN' | 'EXCEEDED' | 'PROTECTED_OVERFLOW';
}

function sample(options: SampleOptions): SoakMeasurementSample {
  return {
    atMs: options.atMs,
    cycle: options.cycle ?? 1,
    tick: Math.round(options.atMs / (1000 / 60)),
    simulatedSeconds: Math.round((options.atMs / 1000) * 100) / 100,
    memory: {
      rssBytes: options.rssBytes ?? 120 * 1024 * 1024,
      heapUsedBytes: options.heapUsedBytes ?? 40 * 1024 * 1024,
      heapTotalBytes: 70 * 1024 * 1024,
      externalBytes: 10 * 1024 * 1024,
      arrayBuffersBytes: 4 * 1024 * 1024,
    },
    queues: {
      governorJobs: options.governorJobs ?? 0,
      governorBytes: options.governorBytes ?? 0,
      activeHeavyJobs: 0,
      protectionRecords: 0,
      protectionBytes: 0,
      pipelinePreparingBytes: 0,
      pipelineTransferringBytes: 0,
      pipelineProtectedPending: 0,
      pendingLearningSegments: 0,
    },
    retention: {
      recorderChargedBytes: options.recorderChargedBytes ?? 20 * 1024 * 1024,
      recorderPeakChargedBytes: options.recorderChargedBytes ?? 20 * 1024 * 1024,
      recorderRetainedSamples: 2048,
      recorderChunksRetained: 2,
      retentionArtifacts: options.retentionArtifacts ?? 10,
      retentionRamBytes: 0,
      retentionDbBytes: options.retentionDbBytes ?? 100 * 1024 * 1024,
      retentionEvictions: 0,
      retentionStatus: options.retentionStatus ?? 'WITHIN',
    },
    fleet: {
      vehicles: 64,
      physicalBodies: 64,
      movingBodies: 40,
      contacts: 3,
      decisions: 1,
      manualTicks: 0,
    },
    timing: {
      tickCount: 1800,
      tickP50Ms: 3,
      tickP95Ms: 4,
      tickMaxMs: 9,
      driftMs: 12,
      cpuSpeedMhzMin: 2400,
      cpuSpeedMhzMax: 2600,
      cpuSpeedMhzMedian: 2500,
    },
  };
}

function cycle(
  index: number,
  options: {
    readonly heapUsedBytes?: number;
    readonly rssBytes?: number;
    readonly retentionDbBytes?: number;
    readonly retentionArtifacts?: number;
  } = {},
): SoakLifecycleCycle {
  return {
    index,
    startedAtMs: (index - 1) * 180_000,
    finishedAtMs: index * 180_000,
    wallMs: 180_000,
    ticks: 10_200,
    simulatedSeconds: 170,
    racesDispatched: 12,
    racesReleased: 10,
    manualInterventions: 2,
    manualTicks: 300,
    learningSegments: 4,
    learningActivations: 3,
    workerJobs: 12,
    workerStale: 0,
    pipelineCommits: 100,
    pipelineCommitFailures: 0,
    checkpointsOffered: 113,
    resetMs: 120,
    reloadMs: 400,
    peakGovernorJobs: 1,
    peakGovernorBytes: 64,
    governorJobsAtEnd: 0,
    governorBytesAtEnd: 0,
    maxCancellationMs: 8,
    peakRecorderBytes: 20 * 1024 * 1024,
    peakRetentionBytes: options.retentionDbBytes ?? 100 * 1024 * 1024,
    retentionDbBytesAfterCycle: options.retentionDbBytes ?? 100 * 1024 * 1024,
    retentionArtifactsAfterCycle: options.retentionArtifacts ?? 10,
    retentionEvictions: 0,
    cleanupLeaked: false,
    bodiesAfterCleanup: 0,
    heapAfterResetBytes: options.heapUsedBytes ?? 40 * 1024 * 1024,
    rssAfterResetBytes: options.rssBytes ?? 120 * 1024 * 1024,
    incidents: 0,
    unrecoveredIncidents: 0,
  };
}

interface MeasurementOptions {
  readonly durationMinutes?: number;
  readonly cycles?: number;
  readonly samples?: number;
  readonly heapGrowthPerCycle?: number;
  readonly retentionGrowthPerCycle?: number;
  readonly incidents?: readonly SoakIncident[];
  readonly leakedCycle?: number;
}

function measurementFixture(options: MeasurementOptions = {}): SoakMeasurement {
  const durationMinutes = options.durationMinutes ?? SOAK_REQUIRED_MINUTES;
  const cycleCount = options.cycles ?? SOAK_REQUIRED_CYCLES;
  const sampleCount = options.samples ?? 24;
  const durationMs = durationMinutes * 60_000;
  const series = Array.from({ length: sampleCount }, (_, index) =>
    sample({
      atMs: Math.round((index / (sampleCount - 1)) * durationMs),
      cycle: Math.min(cycleCount, 1 + Math.floor((index / sampleCount) * cycleCount)),
      heapUsedBytes: 40 * 1024 * 1024 + index * 256 * 1024,
    }),
  );
  const cycles = Array.from({ length: cycleCount }, (_, index) => {
    const base = cycle(index + 1, {
      heapUsedBytes: 40 * 1024 * 1024 + index * (options.heapGrowthPerCycle ?? 0),
      retentionDbBytes: 100 * 1024 * 1024 + index * (options.retentionGrowthPerCycle ?? 0),
    });
    return options.leakedCycle === index + 1
      ? { ...base, cleanupLeaked: true, bodiesAfterCleanup: 3 }
      : base;
  });
  return {
    version: '159-soak-v1',
    fixtureVersion: '159-soak-v1',
    commit: '917a7de9',
    environment: {
      node: 'v24.19.0',
      platform: 'win32',
      release: '10.0.26200',
      arch: 'x64',
      cpuModel: 'AMD Ryzen 7 7735U',
      logicalCores: 16,
      totalMemoryBytes: 16 * 2 ** 30,
      gcAvailable: true,
    },
    protocol: {
      durationMinutes,
      cycles: cycleCount,
      sampleIntervalSeconds: 30,
      seed: 159_001,
      taxis: 24,
      civilians: 40,
      tickSeconds: 1 / 60,
      workload: '24 taxiuri / 40 civili (workload normal V1)',
      pacing: 'WALL_CLOCK_60HZ',
      gcBeforeMemorySample: true,
    },
    startedAt: '2026-11-12T08:00:00.000Z',
    finishedAt: '2026-11-12T09:00:00.000Z',
    durationMs,
    baseline: sample({ atMs: 0 }),
    final: sample({ atMs: durationMs }),
    series,
    cycles,
    incidents: options.incidents ?? [],
    notes: ['rulare de test deterministică'],
  };
}

function incident(overrides: Partial<SoakIncident> = {}): SoakIncident {
  return {
    kind: 'WORKER_JOB_EXPIRED',
    cycle: 6,
    atMs: 1000,
    detail: 'job opțional a depășit lease-ul',
    reason: 'LEASE_EXPIRED',
    action: 'RECLAIM_VIA_LEASE',
    recovered: true,
    recoveryMs: 40,
    recovery: 'governor.usage.jobs = 0',
    ...overrides,
  };
}

test('raportul citește manifestul și refuză un manifest fără regressionProposal', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({ measurement: measurementFixture(), manifest, rawManifest: raw });
  assert.equal(report.version, SOAK_REPORT_VERSION);
  assert.equal(report.manifest.budgetVersion, manifest.budgetVersion);
  const durationCheck = report.checks.find((check) => check.id === 'soak.duration');
  assert.ok(durationCheck?.source.includes('PBI 159'));
  const memoryCheck = report.checks.find((check) => check.id === 'memory.tracked');
  assert.ok(memoryCheck?.source.startsWith('Docs/performance-budgets.json'));
  const incomplete = { ...(raw as Record<string, unknown>) } as Record<string, unknown>;
  delete incomplete.regressionProposal;
  assert.throws(
    () => buildSoakReport({ measurement: measurementFixture(), manifest, rawManifest: incomplete }),
    /regressionProposal\.memoryAbsoluteIncreaseBytes/,
  );
});

test('o serie plată este clasificată PLATEAU, iar o serie liniară este GROWTH', () => {
  const flat = buildSoakTrend({
    id: 'heapUsedBytes',
    unit: 'bytes',
    values: Array.from({ length: 12 }, (_, index) => ({
      atMs: index * 30_000,
      value: 40 * 1024 * 1024,
    })),
    absoluteAllowance: 5 * 1024 * 1024,
    relativeAllowance: 0.1,
    mode: 'span',
    rule: 'test',
  });
  assert.equal(flat.classification, 'PLATEAU');
  const growing = buildSoakTrend({
    id: 'heapUsedBytes',
    unit: 'bytes',
    values: Array.from({ length: 24 }, (_, index) => ({
      atMs: index * 30_000,
      value: 40 * 1024 * 1024 + index * 2 * 1024 * 1024,
    })),
    absoluteAllowance: 5 * 1024 * 1024,
    relativeAllowance: 0.1,
    mode: 'span',
    rule: 'test',
  });
  assert.equal(growing.classification, 'GROWTH');
  assert.ok(growing.slopePerMinute > 0);
});

test('un soak complet, plat și fără incidente trece verificarea structurală', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({ measurement: measurementFixture(), manifest, rawManifest: raw });
  assert.equal(report.verdict.status, 'SOAK_PASS');
  assert.deepEqual(verifySoakReport(report), []);
  assert.equal(report.verdict.failures.length, 0);
  assert.ok(report.lifecycle.cycles >= SOAK_REQUIRED_CYCLES);
  assert.ok(report.duration.actualMinutes >= SOAK_REQUIRED_MINUTES);
});

test('o rulare scurtă este DIAGNOSTIC și nu poate fi declarată soak', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({
    measurement: measurementFixture({ durationMinutes: 2 }),
    manifest,
    rawManifest: raw,
  });
  assert.equal(report.verdict.status, 'DIAGNOSTIC');
  assert.ok(report.verdict.diagnosticReasons.length >= 1);
  const issues = verifySoakReport(report);
  assert.ok(issues.some((issue) => issue.includes('SOAK_PASS')));
  assert.ok(issues.some((issue) => issue.includes('60')));
});

test('mai puțin de 20 de cicluri nu închide soak-ul', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({
    measurement: measurementFixture({ cycles: 19 }),
    manifest,
    rawManifest: raw,
  });
  assert.equal(report.verdict.status, 'DIAGNOSTIC');
  assert.ok(verifySoakReport(report).some((issue) => issue.includes('20')));
});

test('un incident nerecuperat blochează verificarea', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({
    measurement: measurementFixture({
      incidents: [incident({ kind: 'RETENTION_OVER_QUOTA', recovered: false, recoveryMs: null })],
    }),
    manifest,
    rawManifest: raw,
  });
  assert.equal(report.verdict.status, 'SOAK_FAIL');
  assert.ok(report.verdict.failures.some((failure) => failure.includes('nerecuperate')));
  assert.ok(verifySoakReport(report).some((issue) => issue.includes('nerecuperate')));
});

test('un cleanup incomplet este raportat, nu ascuns', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({
    measurement: measurementFixture({ leakedCycle: 3 }),
    manifest,
    rawManifest: raw,
  });
  assert.equal(report.verdict.status, 'SOAK_FAIL');
  assert.ok(report.verdict.failures.some((failure) => failure.includes('cleanup')));
});

test('o creștere liniară a retenției este un defect raportat', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({
    measurement: measurementFixture({ retentionGrowthPerCycle: 2 * 1024 * 1024 }),
    manifest,
    rawManifest: raw,
  });
  const trend = report.trends.find((entry) => entry.id === 'retentionDbBytes');
  assert.equal(trend?.classification, 'GROWTH');
  assert.equal(report.verdict.status, 'SOAK_FAIL');
});

test('memoria finală peste baseline este raportată', async () => {
  const { manifest, raw } = await manifestFixture();
  const measurement = measurementFixture();
  const cycles = measurement.cycles.map((entry, index) =>
    index === measurement.cycles.length - 1
      ? { ...entry, heapAfterResetBytes: entry.heapAfterResetBytes + 20 * 1024 * 1024 }
      : entry,
  );
  const report = buildSoakReport({
    measurement: { ...measurement, cycles },
    manifest,
    rawManifest: raw,
  });
  assert.equal(report.memory.retained, false);
  assert.ok(verifySoakReport(report).some((issue) => issue.includes('baseline')));
});

test('o metrică PASS fără măsurătoare este respinsă de verificator', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({ measurement: measurementFixture(), manifest, rawManifest: raw });
  const forged = {
    ...report,
    checks: [
      ...report.checks,
      {
        id: 'forged.metric',
        metric: 'valoare inventată',
        observed: null,
        unit: 'bytes' as const,
        budget: 1,
        direction: 'maximum' as const,
        source: 'Docs/performance-budgets.json (203-initial-1) forged',
        verdict: 'PASS' as const,
        note: 'fără măsurătoare',
      },
    ],
  };
  assert.ok(verifySoakReport(forged).some((issue) => issue.includes('fără măsurătoare')));
});

test('throttling-ul este raportat cu frecvența și variația tick-ului', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({ measurement: measurementFixture(), manifest, rawManifest: raw });
  assert.equal(report.throttling.status, 'NOT_OBSERVED');
  assert.equal(report.throttling.cpuSpeedMhzMin, 2400);
  assert.equal(report.throttling.cpuSpeedMhzMax, 2600);
  assert.ok(report.throttling.note.length > 0);
  const observed = buildSoakReport({
    measurement: {
      ...measurementFixture(),
      series: measurementFixture().series.map((entry, index) => ({
        ...entry,
        timing: { ...entry.timing, tickP95Ms: index > 12 ? 9 : 4 },
      })),
    },
    manifest,
    rawManifest: raw,
  });
  assert.equal(observed.throttling.status, 'OBSERVED');
});

test('retenția mărginită de cota din manifest este PLATEAU, nu creștere', async () => {
  const { manifest, raw } = await manifestFixture();
  const measurement = measurementFixture();
  const cycles = measurement.cycles.map((entry, index) => ({
    ...entry,
    retentionDbBytesAfterCycle: (120 + (index % 2 ? 4 : 0)) * 1024 * 1024,
  }));
  const report = buildSoakReport({
    measurement: { ...measurement, cycles },
    manifest,
    rawManifest: raw,
  });
  const trend = report.trends.find((entry) => entry.id === 'retentionDbBytes');
  assert.equal(trend?.classification, 'PLATEAU');
  const replay = report.checks.find((check) => check.id === 'retention.optionalReplayStorageBytes');
  assert.equal(replay?.verdict, 'PASS');
});

test('markdown-ul raportului conține durata, tendințele, verificările și throttling-ul', async () => {
  const { manifest, raw } = await manifestFixture();
  const report = buildSoakReport({ measurement: measurementFixture(), manifest, rawManifest: raw });
  const markdown = soakMarkdown(report);
  assert.ok(markdown.includes('60'));
  assert.ok(markdown.includes('## Tendințe'));
  assert.ok(markdown.includes('## Verificări'));
  assert.ok(markdown.includes('## Throttling'));
  assert.ok(markdown.includes('SOAK_PASS'));
});

test('raportul este determinist pentru aceeași măsurătoare', async () => {
  const { manifest, raw } = await manifestFixture();
  const first = buildSoakReport({ measurement: measurementFixture(), manifest, rawManifest: raw });
  const second = buildSoakReport({ measurement: measurementFixture(), manifest, rawManifest: raw });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
