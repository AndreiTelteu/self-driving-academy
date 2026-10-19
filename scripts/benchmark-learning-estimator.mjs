import { Worker } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { runLearningEstimatorProbe } from '../tests/harness/learning-estimator-probe.ts';
import { governorLimits } from '../src/workers/index.ts';
import { createPerformanceCollector } from '../src/telemetry/index.ts';

const output = process.argv[2] ?? 'Docs/Evidence/103-learning-worker/probe.json';
const inputs = [
  'src/learning/estimator-worker.ts',
  'src/learning/estimator-task.ts',
  'src/learning/profile-blend.ts',
  'src/learning/evidence-confidence.ts',
  'src/learning/candidate-validation.ts',
  'src/workers/governor.ts',
  'src/workers/client.ts',
  'src/workers/runtime.ts',
  'src/workers/protocol.ts',
  'tests/harness/learning-estimator-probe.ts',
  'tests/harness/learning-estimator-fixture.ts',
  'tests/harness/governor-store.ts',
  'tests/harness/governor-task.ts',
  'tests/workers/learning-estimator-probe-thread.mjs',
  'scripts/benchmark-learning-estimator.mjs',
];
const hash = createHash('sha256');
for (const input of inputs) hash.update(input).update(readFileSync(input));

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

const collector = createPerformanceCollector(256);
const repeats = [];
for (let repeat = 0; repeat < 5; repeat++) {
  const worker = new Worker(
    new URL('../tests/workers/learning-estimator-probe-thread.mjs', import.meta.url),
    { execArgv: ['--import', new URL('./register-typescript.mjs', import.meta.url).href] },
  );
  const port = {
    send: (packet, transfers) => worker.postMessage(packet, [...transfers]),
    listen: (message, error) => {
      worker.on('message', message);
      worker.on('error', error);
      return () => {
        worker.off('message', message);
        worker.off('error', error);
      };
    },
  };
  try {
    const probe = await runLearningEstimatorProbe(port);
    for (const sample of probe.measurements) {
      collector.record('learningQueueMs', sample.queueMs);
      collector.record('learningServiceMs', sample.serviceMs);
      collector.record('learningEndToEndMs', sample.endToEndMs);
    }
    collector.record('mainThreadMs', probe.submitBatch1Ms / 13);
    collector.record('mainThreadMs', probe.submitBatch2Ms / 12);
    const composed = probe.measurements.filter((sample) => sample.status === 'COMPOSED');
    repeats.push({
      repeat: repeat + 1,
      ...probe,
      derived: {
        endToEndP50Ms: percentile(
          composed.map((s) => s.endToEndMs),
          0.5,
        ),
        endToEndP95Ms: percentile(
          composed.map((s) => s.endToEndMs),
          0.95,
        ),
        endToEndP99Ms: percentile(
          composed.map((s) => s.endToEndMs),
          0.99,
        ),
        queueP50Ms: percentile(
          composed.map((s) => s.queueMs),
          0.5,
        ),
        queueP95Ms: percentile(
          composed.map((s) => s.queueMs),
          0.95,
        ),
        queueP99Ms: percentile(
          composed.map((s) => s.queueMs),
          0.99,
        ),
        queueOverheadP95Ms: percentile(
          composed.map((s) => s.endToEndMs - (s.governorQueueMs ?? 0) - (s.governorServiceMs ?? 0)),
          0.95,
        ),
      },
      processMemoryAfter: process.memoryUsage(),
    });
  } finally {
    await worker.terminate();
  }
}
collector.record('frameMs', null, 'No browser rAF/frame clock in this Node worker_threads probe');
collector.record('gpuMs', null, 'No GPU timer in this Node worker_threads probe');
collector.record('tickCpuMs', null, 'No gameplay tick in this probe');
collector.record('simulationCpuMs', null, 'No gameplay simulation in this probe');
collector.record('debtMs', null, 'No simulation loop in this probe');
collector.record('inputToCommandMs', null, 'No driving input in this probe');
collector.record('checkpointAgeMs', null, 'No checkpoint in this probe');

const report = {
  schemaVersion: 1,
  calibration: 'PROVISIONAL_UNCALIBRATED',
  capturedAt: new Date().toISOString(),
  fixtureVersion: '103-learning-estimator-v1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: hash.digest('hex'),
  inputs,
  budgetVersion: '203-initial-1',
  workerBudgetVersion: governorLimits.version,
  hardware: {
    cpu: os.cpus()[0].model,
    ramBytes: os.totalmem(),
    os: `${os.platform()} ${os.release()}`,
    node: process.version,
  },
  backend: 'Node worker_threads CPU; no browser/FPS/GPU claims',
  powerState: 'not observed',
  scope:
    'Serial learning queue through the real 221 governor, one secondary optional comparison, 25 jobs (23 composed, 1 task error, 1 pending cancel), two waves with lower orders for recomposition; five repetitions',
  frameFamily: {
    status: 'UNAVAILABLE',
    reason:
      'Node worker_threads has no rAF/browser frame clock; mainThreadMs measures only synchronous submit/coalescing cost',
  },
  gpu: { status: 'UNAVAILABLE', reason: 'No GPU timer in a Node probe' },
  browser: { status: 'NOT_MEASURED', reason: 'No browser run was executed for this PBI' },
  queueLimits: {
    maxPending: 32,
    maxBytes: 8 * 1024 * 1024,
    maxProposals: 256,
    history: governorLimits.history,
  },
  limits: governorLimits,
  memoryCategories: {
    queueOwned: 'Encoded estimator payloads held by the serial queue (pending+active)',
    governorOwned: 'Private 221 pending/active snapshots, cap 8 jobs/16 MiB',
    store: 'Fixture 64 records/32 MiB including proposals; not browser durable storage',
    process: 'RSS/heap/external/arrayBuffers are separate, overlapping categories',
  },
  repeats,
  collector: collector.finish({
    learningEndToEndMs: 2000,
    learningQueueMs: 2000,
    mainThreadMs: 16,
  }),
  gameplayGate: 'NOT_VALIDATED',
  laptop: 'NOT_MEASURED; 203 waiver only',
};
mkdirSync(new URL('../Docs/Evidence/103-learning-worker', import.meta.url), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2));

const failures = [];
for (const repeat of repeats) {
  if (repeat.composed !== 23 || repeat.errors !== 1 || repeat.cancelled !== 1)
    failures.push(`repeat ${repeat.repeat}: unexpected outcome counts`);
  if (repeat.invalidated !== 0) failures.push(`repeat ${repeat.repeat}: unexpected invalidation`);
  if (repeat.recomposed < 10) failures.push(`repeat ${repeat.repeat}: recomposition not exercised`);
  if (repeat.secondaryAttempts < 1)
    failures.push(`repeat ${repeat.repeat}: secondary job was not observed`);
  if (repeat.secondaryStatus !== 'cancelled')
    failures.push(`repeat ${repeat.repeat}: secondary did not end cancelled`);
  if (repeat.usage.pending || repeat.usage.active || repeat.usage.bytes)
    failures.push(`repeat ${repeat.repeat}: queue not drained`);
  if (repeat.governorUsage.jobs || repeat.governorUsage.bytes)
    failures.push(`repeat ${repeat.repeat}: governor not drained`);
  if (repeat.storeUsage.records !== 24)
    failures.push(`repeat ${repeat.repeat}: protected store record count changed`);
  if (repeat.submitBatch1Ms > 16 || repeat.submitBatch2Ms > 16)
    failures.push(`repeat ${repeat.repeat}: submit/coalescing batch exceeded 16 ms`);
  if (repeat.startupMs > 5000)
    failures.push(`repeat ${repeat.repeat}: worker startup exceeded 5 s`);
  if ((repeat.derived.endToEndP95Ms ?? Infinity) > 2000)
    failures.push(`repeat ${repeat.repeat}: end-to-end p95 exceeded 2 s`);
}
const first = repeats[0];
const summary = {
  output,
  calibration: report.calibration,
  repeats: repeats.length,
  jobsPerRepeat: first?.learningJobs,
  composed: first?.composed,
  errors: first?.errors,
  cancelled: first?.cancelled,
  recomposed: first?.recomposed,
  startupMs: repeats.map((repeat) => repeat.startupMs),
  derived: first?.derived,
  submitBatchMs: repeats.map((repeat) => [repeat.submitBatch1Ms, repeat.submitBatch2Ms]),
  bytes: first
    ? {
        maxOwned: first.maxOwnedBytes,
        totalPayload: first.totalPayloadBytes,
        maxPayload: first.maxPayloadBytes,
        store: first.storeUsage,
      }
    : null,
  collector: report.collector.metrics,
  failures,
};
console.log(JSON.stringify(summary));
if (failures.length) process.exitCode = 1;
