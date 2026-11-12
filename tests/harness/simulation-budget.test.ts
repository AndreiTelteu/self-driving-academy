import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LEARNING_ESTIMATE_VERSION,
  blendProfileValue,
  decodeLearningEstimateRequest,
  decodeLearningEstimateResult,
  encodeLearningEstimateRequest,
  encodeLearningEstimateResult,
} from '../../src/learning';
import type { LearningEstimateRequest } from '../../src/learning';
import { control, parsePacket } from '../../src/workers/protocol';
import type { Packet } from '../../src/workers';
import { learningTestJob } from './learning-estimator-fixture';
import {
  SIMULATION_BUDGET_VERSION,
  SIMULATION_FIXTURE_VERSION,
  buildSimulationBudgetReport,
  measureSimulationBudget,
  simulationBudgetMarkdown,
  verifySimulationBudgetReport,
} from './simulation-budget';
import type {
  SimulationBudgetLimits,
  SimulationBudgetMeasurement,
  SimulationBudgetReportInput,
} from './simulation-budget';

const limits: SimulationBudgetLimits = Object.freeze({
  sliceMaximumMs: 10,
  pendingWorkerPayloadBytes: 16 * 1024 * 1024,
  maxWorkerPayloadBytes: 8 * 1024 * 1024,
});

const manifest = {
  budgetVersion: '203-initial-1',
  proposedBudgets: {
    desktop: { mainThreadP95Ms: 10, authoritativeTickP95Ms: 5.5 },
    laptop: { mainThreadP95Ms: 20, authoritativeTickP95Ms: 8 },
  },
};

function stat(value: number) {
  return Object.freeze({
    count: 10,
    p50: value,
    p95: value,
    p99: value,
    min: value,
    max: value,
    mean: value,
  });
}

interface MeasurementOverrides {
  readonly decisionsTickP95?: number;
  readonly publicationP95?: number;
  readonly workerStepP95?: number;
  readonly submitP95?: number;
  readonly requestBytes?: number;
  readonly payloadSlicesPerEstimate?: number;
  readonly copiedBytesPerEstimate?: number;
  readonly perMessageP95?: number;
  readonly controlSharesEmptyBuffer?: boolean;
  readonly decisionsDigest?: string;
  readonly estimationDigest?: string;
  readonly transferDigest?: string;
  readonly commit?: string;
}

function measurement(overrides: MeasurementOverrides = {}): SimulationBudgetMeasurement {
  const decisionsDigest = overrides.decisionsDigest ?? 'a'.repeat(64);
  const estimationDigest = overrides.estimationDigest ?? 'b'.repeat(64);
  const transferDigest = overrides.transferDigest ?? 'c'.repeat(64);
  const payloadSlices = overrides.payloadSlicesPerEstimate ?? 0;
  return {
    version: SIMULATION_BUDGET_VERSION,
    fixtureVersion: SIMULATION_FIXTURE_VERSION,
    capturedAt: '2026-11-12T00:00:00.000Z',
    commit: overrides.commit ?? 'deadbeef',
    runtime: 'node',
    hardware: { cpu: 'test', logicalCpus: 8, ramBytes: 16, os: 'test' },
    protocol: {
      decisionWarmupTicks: 1,
      decisionMeasuredTicks: 2,
      decisionRepeats: 1,
      decisionPublicationPeriodTicks: 6,
      decisionSlots: 6,
      estimateWarmupIterations: 1,
      estimateMeasuredIterations: 2,
      estimateRepeats: 1,
      transferMessages: 3,
      transferRepeats: 1,
      passes: 1,
      statistic: 'median-of-repetition-percentiles',
      backend: 'test',
    },
    workload: {
      vehicles: 110,
      obstacles: 96,
      zones: 256,
      decisionsPerTick: 19,
      episodesPerEstimate: 16,
      estimates: 4,
      messages: 4,
    },
    decisions: {
      dense: true,
      vehicles: 110,
      obstacles: 96,
      zones: 256,
      ticks: 3,
      publications: 1,
      contextReads: 57,
      publicationMs: stat(overrides.publicationP95 ?? 4),
      slotDeriveMs: stat(2),
      tickMs: stat(overrides.decisionsTickP95 ?? 6),
      peakCachedContexts: 110,
      digest: decisionsDigest,
      digestEntries: 57,
    },
    estimation: {
      key: 'speed_delta_urban',
      episodesPerEstimate: 16,
      estimates: 4,
      mainThreadSubmitMs: stat(overrides.submitP95 ?? 0.01),
      workerStepMs: stat(overrides.workerStepP95 ?? 0.05),
      resultDecodeMs: stat(0.003),
      roundTripMs: stat(0.07),
      requestBytes: overrides.requestBytes ?? 1971,
      resultBytes: 229,
      largeEpisodes: 4096,
      largeRequestBytes: 404829,
      largeMainThreadSubmitMs: stat(0.9),
      payloadSlices: payloadSlices * 4,
      payloadCopiedBytes: (overrides.copiedBytesPerEstimate ?? 0) * 4,
      payloadSlicesPerEstimate: payloadSlices,
      payloadCopiedBytesPerEstimate: overrides.copiedBytesPerEstimate ?? 0,
      digest: estimationDigest,
      digestEntries: 8,
    },
    transfer: {
      messages: 4,
      sendMs: stat(0.008),
      receiveMs: stat(0.0003),
      controlMs: stat(0.006),
      perMessageMs: stat(overrides.perMessageP95 ?? 0.021),
      deliveredPayloadBytes: 1024,
      transferredPayloadBytes: 0,
      controlPayloadBytes: 0,
      controlSharesEmptyBuffer: overrides.controlSharesEmptyBuffer ?? true,
      digest: transferDigest,
      digestEntries: 8,
    },
    digests: { decisions: decisionsDigest, estimation: estimationDigest, transfer: transferDigest },
  };
}

function input(overrides: {
  baseline?: MeasurementOverrides;
  after?: MeasurementOverrides;
}): SimulationBudgetReportInput {
  return {
    manifest,
    limits,
    baseline: measurement({
      payloadSlicesPerEstimate: 2,
      copiedBytesPerEstimate: 2199.627,
      controlSharesEmptyBuffer: false,
      ...overrides.baseline,
    }),
    after: measurement(overrides.after),
  };
}

test('the committed measurement contract is deterministic: identical fixtures produce identical digests', () => {
  const options = {
    commit: 'test',
    capturedAt: '2026-11-12T00:00:00.000Z',
    decisionWarmupTicks: 6,
    decisionMeasuredTicks: 12,
    decisionRepeats: 1,
    estimateWarmupIterations: 2,
    estimateMeasuredIterations: 6,
    estimateRepeats: 1,
    transferMessages: 12,
    transferRepeats: 1,
  } as const;
  const first = measureSimulationBudget(options);
  const second = measureSimulationBudget(options);
  assert.equal(first.fixtureVersion, SIMULATION_FIXTURE_VERSION);
  assert.equal(first.decisions.digest, second.decisions.digest);
  assert.equal(first.estimation.digest, second.estimation.digest);
  assert.equal(first.transfer.digest, second.transfer.digest);
  // Deterministic byte accounting: the optimized path copies no payload and delivers the same data.
  assert.equal(first.estimation.payloadSlicesPerEstimate, 0);
  assert.equal(first.estimation.payloadCopiedBytesPerEstimate, 0);
  assert.equal(first.estimation.requestBytes, second.estimation.requestBytes);
  assert.equal(first.transfer.deliveredPayloadBytes, second.transfer.deliveredPayloadBytes);
  assert.equal(first.transfer.controlSharesEmptyBuffer, true);
  assert.equal(first.transfer.transferredPayloadBytes, 0);
});

test('the report passes only when every component is inside budget and the outputs are identical', () => {
  const report = buildSimulationBudgetReport(input({}));
  assert.deepEqual(verifySimulationBudgetReport(report), []);
  assert.equal(report.verdicts.equivalence, 'PASS');
  assert.equal(report.verdicts.decisions, 'PASS');
  assert.equal(report.verdicts.estimation, 'PASS');
  assert.equal(report.verdicts.transfer, 'PASS');
  assert.equal(report.verdicts.overall, 'PASS');
  assert.ok(report.equivalence.every((entry) => entry.status === 'IDENTICAL'));
});

test('a changed decision, estimation or transfer output fails equivalence and the overall gate', () => {
  for (const component of ['decisionsDigest', 'estimationDigest', 'transferDigest'] as const) {
    const report = buildSimulationBudgetReport(input({ after: { [component]: 'd'.repeat(64) } }));
    assert.equal(report.verdicts.equivalence, 'FAIL', component);
    assert.equal(report.verdicts.overall, 'FAIL', component);
    assert.ok(verifySimulationBudgetReport(report).some((issue) => issue.includes('Echivalența')));
  }
});

test('a decision tick over the manifest budget is reported as FAIL, never as a pass', () => {
  const report = buildSimulationBudgetReport(
    input({ after: { decisionsTickP95: 9.5 }, baseline: { decisionsTickP95: 9.5 } }),
  );
  const row = report.rows.find((entry) => entry.id === 'decisions.tickP95Ms')!;
  assert.equal(row.verdict, 'FAIL');
  assert.equal(row.budget?.value, 8);
  assert.equal(report.verdicts.decisions, 'FAIL');
  assert.equal(report.verdicts.overall, 'FAIL');
});

test('an estimation step over the worker slice budget fails; a request over the pending payload cap fails', () => {
  const report = buildSimulationBudgetReport(input({ after: { workerStepP95: 11 } }));
  assert.equal(
    report.rows.find((entry) => entry.id === 'estimation.workerStepP95Ms')!.verdict,
    'FAIL',
  );
  assert.equal(report.verdicts.estimation, 'FAIL');
  const overCapacity = buildSimulationBudgetReport(
    input({ after: { requestBytes: limits.pendingWorkerPayloadBytes + 1 } }),
  );
  assert.equal(
    overCapacity.rows.find((entry) => entry.id === 'transfer.requestBytes')!.verdict,
    'FAIL',
  );
});

test('transfer rows require fewer payload copies than the baseline, not merely a fast machine', () => {
  const unchanged = buildSimulationBudgetReport(
    input({ after: { payloadSlicesPerEstimate: 2, copiedBytesPerEstimate: 2199.627 } }),
  );
  assert.equal(
    unchanged.rows.find((entry) => entry.id === 'transfer.payloadCopiesPerEstimate')!.verdict,
    'FAIL',
  );
  assert.equal(
    unchanged.rows.find((entry) => entry.id === 'transfer.payloadCopiedBytesPerEstimate')!.verdict,
    'FAIL',
  );
  const reduced = buildSimulationBudgetReport(input({ after: {} }));
  assert.equal(
    reduced.rows.find((entry) => entry.id === 'transfer.payloadCopiesPerEstimate')!.verdict,
    'PASS',
  );
  const worse = buildSimulationBudgetReport(input({ after: { controlSharesEmptyBuffer: false } }));
  assert.equal(
    worse.rows.find((entry) => entry.id === 'transfer.controlBufferAllocations')!.verdict,
    'FAIL',
  );
});

test('the markdown rendering is derivable and lists every metric and equivalence row', () => {
  const report = buildSimulationBudgetReport(input({}));
  const markdown = simulationBudgetMarkdown(report);
  assert.ok(markdown.startsWith('# PBI 158'));
  for (const row of report.rows) assert.ok(markdown.includes(row.id), row.id);
  for (const equivalence of report.equivalence)
    assert.ok(markdown.includes(equivalence.before), equivalence.component);
  assert.ok(markdown.includes('general: **PASS**'));
});

test('request/result encoding is byte-for-byte the canonical JSON and decodes back to the same values', () => {
  const job = learningTestJob({ segmentId: 'equivalence', order: 1, episodeCount: 16 });
  const request: LearningEstimateRequest = {
    version: LEARNING_ESTIMATE_VERSION,
    key: job.key,
    baseVersionId: job.baseVersionId,
    segmentId: job.segmentId,
    learningEpoch: job.learningEpoch,
    baseValue: job.baseValue,
    evidence: job.evidence,
    episodes: job.episodes,
    candidate: job.candidate,
  };
  const buffer = encodeLearningEstimateRequest(request);
  const expected = new TextEncoder().encode(JSON.stringify({ ...request }));
  assert.deepEqual(Buffer.from(buffer), Buffer.from(expected.buffer.slice(0) as ArrayBuffer));
  assert.deepEqual(decodeLearningEstimateRequest(buffer), { ...request });
  const result = {
    version: LEARNING_ESTIMATE_VERSION,
    key: job.key,
    baseVersionId: job.baseVersionId,
    segmentId: job.segmentId,
    learningEpoch: job.learningEpoch,
    estimate: 2.5,
    learningWeight: 0.6,
    resolution: 'APPLIED',
    changed: true,
    min: 0,
    max: 10,
  } as const;
  assert.deepEqual(decodeLearningEstimateResult(encodeLearningEstimateResult(result)), result);
});

test('a validated packet keeps its envelope and bytes without a second copy, and still rejects a detached buffer', () => {
  const buffer = new ArrayBuffer(16);
  new Uint8Array(buffer).fill(7);
  const raw = {
    type: 'start' as const,
    jobId: '7',
    segmentId: 'segment',
    baseVersionId: 'v1',
    profileId: 'p1',
    learningEpoch: 1,
    sessionId: 's1',
    worldEpoch: 1,
    sequence: 0,
    payloadBytes: 16,
    ownership: 'copy' as const,
    priority: 'interactive' as const,
    buffer,
  };
  const parsed = parsePacket(raw);
  const again = parsePacket(parsed);
  assert.equal(again, parsed);
  assert.deepEqual({ ...again }, { ...parsed });
  assert.equal(again.buffer, buffer);
  structuredClone(again.buffer, { transfer: [again.buffer] });
  assert.throws(() => parsePacket(again), /Invalid bytes/);
});

test('control packets share one empty buffer and carry no payload', () => {
  const start = parsePacket({
    type: 'start',
    jobId: '1',
    segmentId: 'a',
    baseVersionId: 'v1',
    profileId: 'p1',
    learningEpoch: 1,
    sessionId: 's1',
    worldEpoch: 1,
    sequence: 0,
    payloadBytes: 0,
    ownership: 'copy',
    priority: 'interactive',
    buffer: new ArrayBuffer(0),
  });
  const first: Packet = control(start, 'progress', 1, 0.5);
  const second: Packet = control(start, 'cancelled', 2);
  assert.equal(first.buffer, second.buffer);
  assert.equal(first.payloadBytes, 0);
  assert.equal(first.progress, 0.5);
  assert.equal(second.type, 'cancelled');
});

test('the empty-history blend shortcut is equivalent to an explicit empty history', () => {
  const job = learningTestJob({ segmentId: 'blend', order: 1, episodeCount: 16 });
  const base = {
    key: job.key,
    oldValue: job.baseValue,
    evidence: job.evidence,
    episodes: job.episodes,
    candidate: job.candidate,
  } as const;
  assert.deepEqual(blendProfileValue(base), blendProfileValue({ ...base, history: [] }));
});
