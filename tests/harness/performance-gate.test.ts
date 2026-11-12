import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GATE_CRITERIA,
  PERFORMANCE_GATE_REQUIRED_REPETITIONS,
  PERFORMANCE_GATE_REQUIRED_SOAK_CYCLES,
  PERFORMANCE_GATE_REQUIRED_SOAK_MINUTES,
  PERFORMANCE_GATE_VERSION,
  REQUIRED_EVIDENCE_ROWS,
  buildPerformanceGateReport,
  parseGateBudgets,
  performanceGateMarkdown,
  verifyPerformanceGateReport,
} from './performance-gate';
import type {
  GateBuildSample,
  GateEvidenceInput,
  GateMeasurement,
  GateRenderSample,
  GateSoakInput,
} from './performance-gate';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'Docs', 'performance-budgets.json'), 'utf8'));
const budgets = parseGateBudgets(manifest);
const commit = 'a'.repeat(40);

function buildSample(overrides: Partial<GateBuildSample> = {}): GateBuildSample {
  return {
    javascriptBytes: 3_479_290,
    wasmBytes: 2_646_596,
    cssBytes: 43_917,
    gzipBytes: 1_769_191,
    artifactCount: 130,
    digest: 'build-digest-1',
    ...overrides,
  };
}

function renderSample(overrides: Partial<GateRenderSample> = {}): GateRenderSample {
  return {
    digest: 'render-digest-1',
    cityDrawCalls: 12,
    decorDrawCalls: 0,
    thinInstances: 1_024,
    thinBatches: 24,
    decorCells: 16,
    meshes: 96,
    elements: 900,
    ...overrides,
  };
}

function evidenceEntry(
  required: (typeof REQUIRED_EVIDENCE_ROWS)[number],
  overrides: Partial<GateEvidenceInput> = {},
): GateEvidenceInput {
  return {
    id: required.id,
    criterion: required.criterion,
    title: required.title,
    files: [`Docs/Evidence/fixture/${required.id}.json`],
    revision: null,
    checks: 3,
    passed: 3,
    verdict: 'PASS',
    detail: 'dovadă sintetică pentru test',
    reason: '',
    ...overrides,
  };
}

function soak(overrides: Partial<GateSoakInput> = {}): GateSoakInput {
  return {
    file: 'Docs/Evidence/224-performance-gate/soak/report.json',
    revision: commit,
    status: 'SOAK_PASS',
    minutes: 60.002,
    cycles: 20,
    cleanCycles: 20,
    trends: [
      { id: 'heapUsedBytes', classification: 'PLATEAU' },
      { id: 'rssBytes', classification: 'PLATEAU' },
      { id: 'governorBytes', classification: 'PLATEAU' },
      { id: 'governorJobs', classification: 'PLATEAU' },
      { id: 'recorderChargedBytes', classification: 'PLATEAU' },
      { id: 'retentionDbBytes', classification: 'PLATEAU' },
      { id: 'retentionArtifacts', classification: 'PLATEAU' },
    ],
    heapDeltaBytes: 1_895_920,
    allowedHeapGrowthBytes: 5_242_880,
    queueMaxBytes: 4,
    queueMaxJobs: 1,
    throttling: 'OBSERVED',
    baselineUnmodified: true,
    ...overrides,
  };
}

function measurement(overrides: Partial<GateMeasurement> = {}): GateMeasurement {
  return {
    version: PERFORMANCE_GATE_VERSION,
    budgetVersion: budgets.budgetVersion,
    commit,
    measuredAt: '2026-11-12T00:00:00.000Z',
    manifest: { digest: 'f'.repeat(64), modified: false },
    build: {
      samples: Array.from({ length: PERFORMANCE_GATE_REQUIRED_REPETITIONS }, () => buildSample()),
      baseline: {
        commit: '2d68b43c8cdf9c826e4229c0c1f10ef22d4b5873',
        javascriptBytes: 3_478_182,
        wasmBytes: 2_646_596,
        file: 'Docs/Evidence/155-hardware-budget/build-transfer.json',
      },
      injectedPayloadBytes: 0,
    },
    render: Array.from({ length: PERFORMANCE_GATE_REQUIRED_REPETITIONS }, () => renderSample()),
    commands: [
      { id: 'render-budget', command: 'npm run perf:render-budget -- --check', exitCode: 0 },
      {
        id: 'simulation-budget',
        command: 'npm run perf:simulation-budget -- --check',
        exitCode: 0,
      },
      {
        id: 'traffic-benchmark',
        command: 'npm run perf:traffic-benchmark -- --check',
        exitCode: 0,
      },
      { id: 'hardware-budget', command: 'npm run perf:hardware-budget -- --check', exitCode: 0 },
      { id: 'soak', command: 'npm run perf:soak -- --check', exitCode: 0 },
    ],
    evidence: REQUIRED_EVIDENCE_ROWS.map((required) => evidenceEntry(required)),
    soak: soak(),
    hardware: {
      measured: false,
      reason: 'fără GPU real pe runner nu există timer și nu se pretinde FPS',
      revision: null,
      sameRevision: false,
      files: ['Docs/Evidence/155-hardware-budget/report.json'],
      captures: [],
    },
    ...overrides,
  };
}

function report(overrides: Partial<GateMeasurement> = {}) {
  return buildPerformanceGateReport({ budgets, measurement: measurement(overrides) });
}

function row(input: ReturnType<typeof report>, id: string) {
  const found = input.rows.find((entry) => entry.id === id);
  assert.ok(found, `missing row ${id}`);
  return found;
}

test('the manifest budgets are read, not defined here', () => {
  assert.equal(budgets.source, 'Docs/performance-budgets.json');
  assert.equal(budgets.budgetVersion, '203-initial-1');
  assert.equal(budgets.criticalJsWasmTransferBytes, 8_388_608);
  assert.equal(budgets.drawCalls, 128);
  assert.equal(budgets.instances, 8_192);
  assert.equal(budgets.batches, 512);
  assert.equal(budgets.babylonObjects, 4_096);
  assert.equal(budgets.frameP95Ms, 35);
  assert.equal(budgets.gpuP95Ms, 28);
  assert.equal(budgets.automaticBaselineReplacement, false);
  assert.equal(budgets.confirmationsOutOfFive, 3);
  assert.throws(() => parseGateBudgets({ proposedCapacities: {} }), /proposedBudgets/);
});

test('a clean revision passes structurally, but release stays NOT_VALIDATED without real GPU', () => {
  const built = report();
  assert.deepEqual(verifyPerformanceGateReport(built), []);
  assert.equal(built.summary.structural, 'PASS');
  assert.equal(built.summary.release, 'NOT_VALIDATED');
  assert.equal(built.summary.fail, 0);
  assert.equal(built.summary.pass, built.rows.length - 1);
  assert.equal(row(built, 'bundle-critical-transfer').verdict, 'PASS');
  assert.equal(row(built, 'capacity-render').verdict, 'PASS');
  assert.equal(row(built, 'determinism').verdict, 'PASS');
  assert.equal(row(built, 'soak-60min').verdict, 'PASS');
  assert.equal(row(built, 'fps-hardware').verdict, 'NOT_VALIDATED');
  assert.ok(row(built, 'fps-hardware').reason.includes('GPU'));
  assert.deepEqual(
    built.notValidated.map((entry) => entry.id),
    ['fps-hardware'],
  );
  assert.deepEqual(built.summary.openCriteria, [GATE_CRITERIA.fps]);
  assert.equal(built.manifest.modified, false);
  assert.equal(built.manifest.baselineReplacedAutomatically, false);
  assert.equal(built.repetitions.count, PERFORMANCE_GATE_REQUIRED_REPETITIONS);
  assert.equal(built.repetitions.identical, true);
});

test('a bundle above the capacity is rejected, and a 2.5 MiB growth is not called a relative regression', () => {
  const regressed = report({
    build: {
      samples: Array.from({ length: PERFORMANCE_GATE_REQUIRED_REPETITIONS }, () =>
        buildSample({ javascriptBytes: 6_000_000, digest: 'build-digest-regressed' }),
      ),
      baseline: {
        commit: '2d68b43c8cdf9c826e4229c0c1f10ef22d4b5873',
        javascriptBytes: 3_478_182,
        wasmBytes: 2_646_596,
        file: 'Docs/Evidence/155-hardware-budget/build-transfer.json',
      },
      injectedPayloadBytes: 0,
    },
  });
  assert.equal(row(regressed, 'bundle-critical-transfer').verdict, 'FAIL');
  assert.ok(row(regressed, 'bundle-critical-transfer').reason.includes('depășește'));
  assert.equal(row(regressed, 'bundle-regression').verdict, 'PASS');
  assert.equal(regressed.summary.structural, 'FAIL');
  assert.equal(regressed.summary.release, 'FAIL');
  assert.deepEqual(verifyPerformanceGateReport(regressed), []);
});

test('a relative regression above 10% and 5 MiB confirmed in five repetitions is rejected', () => {
  const regressed = report({
    build: {
      samples: Array.from({ length: PERFORMANCE_GATE_REQUIRED_REPETITIONS }, () =>
        buildSample({ javascriptBytes: 11_500_000, digest: 'build-digest-huge' }),
      ),
      baseline: {
        commit: '2d68b43c8cdf9c826e4229c0c1f10ef22d4b5873',
        javascriptBytes: 3_478_182,
        wasmBytes: 2_646_596,
        file: 'Docs/Evidence/155-hardware-budget/build-transfer.json',
      },
      injectedPayloadBytes: 0,
    },
  });
  const regression = row(regressed, 'bundle-regression');
  assert.equal(regression.verdict, 'FAIL');
  assert.ok(regression.detail.includes('5/5'));
  assert.equal(regressed.summary.structural, 'FAIL');
});

test('a capacity regression in draw calls or instances is rejected', () => {
  const crowded = report({
    render: Array.from({ length: PERFORMANCE_GATE_REQUIRED_REPETITIONS }, () =>
      renderSample({ cityDrawCalls: 200, thinInstances: 20_000, digest: 'render-digest-crowded' }),
    ),
  });
  const capacity = row(crowded, 'capacity-render');
  assert.equal(capacity.verdict, 'FAIL');
  assert.ok(capacity.reason.includes('draw calls 200 > 128'));
  assert.ok(capacity.reason.includes('instanțe thin 20000 > 8192'));
  assert.equal(crowded.summary.structural, 'FAIL');
});

test('five identical repetitions are required to prove determinism', () => {
  const noisy = report({
    build: {
      samples: Array.from({ length: PERFORMANCE_GATE_REQUIRED_REPETITIONS }, (_, index) =>
        buildSample({ digest: `build-digest-${index}` }),
      ),
      baseline: null,
      injectedPayloadBytes: 0,
    },
  });
  assert.equal(row(noisy, 'determinism').verdict, 'FAIL');
  assert.equal(noisy.repetitions.identical, false);
  assert.deepEqual(verifyPerformanceGateReport(noisy), []);
  const four = report({
    build: {
      samples: Array.from({ length: 4 }, () => buildSample()),
      baseline: null,
      injectedPayloadBytes: 0,
    },
    render: Array.from({ length: 4 }, () => renderSample()),
  });
  assert.equal(four.repetitions.count, 4);
  assert.ok(
    verifyPerformanceGateReport(four).some((issue) => issue.includes('repetări, contractul cere')),
  );
});

test('a soak shorter than 60 minutes or without plateau fails the criterion', () => {
  const short = report({
    soak: soak({
      minutes: 45,
      cycles: PERFORMANCE_GATE_REQUIRED_SOAK_CYCLES,
      status: 'DIAGNOSTIC',
    }),
  });
  const soakRow = row(short, 'soak-60min');
  assert.equal(soakRow.verdict, 'FAIL');
  assert.ok(soakRow.reason.includes('45 min'));
  assert.ok(soakRow.reason.includes('DIAGNOSTIC'));
  const growing = report({
    soak: soak({ trends: [{ id: 'heapUsedBytes', classification: 'GROWTH' }] }),
  });
  assert.equal(row(growing, 'soak-60min').verdict, 'FAIL');
  assert.ok(row(growing, 'soak-60min').reason.includes('GROWTH'));
  const modifiedManifest = report({ soak: soak({ baselineUnmodified: false }) });
  assert.equal(row(modifiedManifest, 'soak-60min').verdict, 'FAIL');
  assert.ok(row(modifiedManifest, 'soak-60min').reason.includes('manifestul'));
});

test('a same-revision hardware capture can close FPS, but only with both backends', () => {
  const measured = report({
    hardware: {
      measured: true,
      reason: '',
      revision: commit.slice(0, 12),
      sameRevision: true,
      files: ['Docs/Evidence/155-hardware-budget/report.json'],
      captures: [
        {
          backend: 'WEBGPU',
          workload: 'maxim V1',
          build: commit.slice(0, 12),
          frameP95Ms: 16.9,
          gpuP95Ms: null,
        },
        {
          backend: 'WEBGL2',
          workload: 'maxim V1',
          build: commit.slice(0, 12),
          frameP95Ms: 17.2,
          gpuP95Ms: 1.109,
        },
      ],
    },
  });
  assert.equal(row(measured, 'fps-hardware').verdict, 'PASS');
  assert.equal(measured.summary.release, 'PASS');
  assert.deepEqual(verifyPerformanceGateReport(measured), []);
  const overBudget = report({
    hardware: {
      measured: true,
      reason: '',
      revision: commit.slice(0, 12),
      sameRevision: true,
      files: ['Docs/Evidence/155-hardware-budget/report.json'],
      captures: [
        {
          backend: 'WEBGPU',
          workload: 'maxim V1',
          build: commit.slice(0, 12),
          frameP95Ms: 51,
          gpuP95Ms: null,
        },
        {
          backend: 'WEBGL2',
          workload: 'maxim V1',
          build: commit.slice(0, 12),
          frameP95Ms: 17.2,
          gpuP95Ms: 1.109,
        },
      ],
    },
  });
  assert.equal(row(overBudget, 'fps-hardware').verdict, 'FAIL');
  assert.ok(row(overBudget, 'fps-hardware').reason.includes('51 ms > 35 ms'));
});

test('the gate refuses to close FPS without a measurement', () => {
  const built = report();
  const forged = {
    ...built,
    rows: built.rows.map((entry) =>
      entry.id === 'fps-hardware' ? { ...entry, verdict: 'PASS' as const } : entry,
    ),
  };
  const issues = verifyPerformanceGateReport(forged);
  assert.ok(issues.some((issue) => issue.includes('FPS este închis fără măsurătoare hardware')));
});

test('missing evidence becomes NOT_VALIDATED with a reason, never a silent PASS', () => {
  const missing = report({
    evidence: REQUIRED_EVIDENCE_ROWS.filter((required) => required.id !== 'savefile-integrity').map(
      (required) => evidenceEntry(required),
    ),
  });
  const savefile = row(missing, 'savefile-integrity');
  assert.equal(savefile.verdict, 'NOT_VALIDATED');
  assert.ok(savefile.reason.length > 0);
  assert.equal(missing.summary.release, 'NOT_VALIDATED');
  assert.deepEqual(verifyPerformanceGateReport(missing), []);
});

test('evidence that claims PASS without all checks passed is downgraded to FAIL', () => {
  const inconsistent = report({
    evidence: REQUIRED_EVIDENCE_ROWS.map((required) =>
      required.id === 'backend-matrix'
        ? evidenceEntry(required, { checks: 5, passed: 4 })
        : evidenceEntry(required),
    ),
  });
  const backend = row(inconsistent, 'backend-matrix');
  assert.equal(backend.verdict, 'FAIL');
  assert.ok(backend.reason.includes('4/5'));
});

test('the summary verifier rejects a manifest marked as modified and a forged release PASS', () => {
  const built = report();
  const modified = {
    ...built,
    manifest: { ...built.manifest, modified: true as unknown as false },
  };
  assert.ok(verifyPerformanceGateReport(modified).some((issue) => issue.includes('manifest')));
  const forged = { ...built, summary: { ...built.summary, release: 'PASS' as const } };
  assert.ok(verifyPerformanceGateReport(forged).some((issue) => issue.includes('release')));
});

test('the markdown names the verdict, every criterion and what stayed open', () => {
  const markdown = performanceGateMarkdown(report());
  assert.ok(markdown.startsWith('# PBI 224'));
  assert.ok(markdown.includes('203-initial-1'));
  assert.ok(markdown.includes('`PASS`'));
  assert.ok(markdown.includes('`NOT_VALIDATED`'));
  assert.ok(markdown.includes(GATE_CRITERIA.soak));
  assert.ok(markdown.includes('fps-hardware'));
  assert.ok(markdown.includes('Ce rămâne deschis'));
  assert.ok(markdown.includes(String(PERFORMANCE_GATE_REQUIRED_SOAK_MINUTES)));
});

test('the committed gate evidence is the report of the committed measurement', () => {
  const evidenceDirectory = join(root, 'Docs', 'Evidence', '224-performance-gate');
  const measurementFile = join(evidenceDirectory, 'measurement.json');
  assert.ok(existsSync(measurementFile), 'measurement.json is missing');
  const committedMeasurement = JSON.parse(readFileSync(measurementFile, 'utf8'));
  const built = buildPerformanceGateReport({
    budgets,
    measurement: committedMeasurement,
  });
  assert.deepEqual(verifyPerformanceGateReport(built), []);
  assert.equal(built.summary.structural, 'PASS');
  assert.ok(
    built.rows.every((entry) => entry.verdict !== 'FAIL'),
    `unexpected FAIL rows: ${built.rows
      .filter((entry) => entry.verdict === 'FAIL')
      .map((entry) => entry.id)
      .join(', ')}`,
  );
  assert.equal(row(built, 'soak-60min').verdict, 'PASS');
  assert.equal(built.repetitions.identical, true);
  const saved = JSON.parse(readFileSync(join(evidenceDirectory, 'report.json'), 'utf8'));
  assert.equal(
    `${JSON.stringify(built, null, 2)}\n`,
    readFileSync(join(evidenceDirectory, 'report.json'), 'utf8'),
  );
  assert.equal(saved.commit, committedMeasurement.commit);
  const markdown = readFileSync(join(evidenceDirectory, 'report.md'), 'utf8');
  assert.equal(markdown, performanceGateMarkdown(built));
});
