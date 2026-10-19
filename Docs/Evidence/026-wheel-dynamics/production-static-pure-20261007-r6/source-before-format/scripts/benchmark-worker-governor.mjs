import { Worker } from 'node:worker_threads';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { runGovernorProbe } from '../tests/harness/governor-probe.ts';
import { governorLimits } from '../src/workers/index.ts';
import { createPerformanceCollector } from '../src/telemetry/index.ts';

const output = process.argv[2] ?? 'Evidence/221/cpu.json';
const inputs = [
  'src/workers/governor.ts',
  'src/workers/client.ts',
  'src/workers/runtime.ts',
  'src/workers/protocol.ts',
  'tests/harness/governor-probe.ts',
  'tests/harness/governor-task.ts',
  'tests/harness/governor-store.ts',
  'tests/workers/governor-thread.mjs',
  'scripts/benchmark-worker-governor.mjs',
];
const hash = createHash('sha256');
for (const input of inputs) hash.update(input).update(readFileSync(input));
const baseline = [];
for (let r = 0; r < 5; r++) {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) structuredClone(new ArrayBuffer(4096));
  baseline.push(performance.now() - start);
}
const repeats = [];
const collector = createPerformanceCollector(64);
for (let r = 0; r < 5; r++) {
  const worker = new Worker(new URL('../tests/workers/governor-thread.mjs', import.meta.url), {
    execArgv: ['--import', new URL('./register-typescript.mjs', import.meta.url).href],
  });
  let transferCount = 0;
  const port = {
    send: (p, transfers) => {
      worker.postMessage(p, [...transfers]);
      if (transfers.length) {
        transferCount++;
        if (p.buffer.byteLength !== 0) throw new Error('Private transfer not detached');
      }
    },
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
    const repeat = await runGovernorProbe(port);
    for (const sample of repeat.measurements)
      if (sample.key.includes('learning-short')) {
        collector.record('learningQueueMs', sample.queueMs);
        collector.record('learningServiceMs', sample.serviceMs);
        collector.record('learningEndToEndMs', sample.endToEndMs);
      }
    repeats.push({ repeat: r + 1, ...repeat, transferCount, processMemory: process.memoryUsage() });
  } finally {
    await worker.terminate();
  }
}
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  fixtureVersion: '221-synthetic-cpu-v1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: hash.digest('hex'),
  inputs,
  budgetVersion: '203-initial-1',
  workerBudgetVersion: governorLimits.version,
  hardware: {
    cpu: os.cpus()[0].model,
    ramBytes: os.totalmem(),
    os: os.platform(),
    node: process.version,
  },
  backend: 'Node worker_threads CPU; no browser/FPS/GPU claims',
  powerState: 'not observed',
  scope:
    'Synthetic protocol, slices2ms/120, preemption/cancel/restart/protected result persistence, five repetitions; not gameplay calibration',
  baseline: { fixture: 'clone-4096x1000-v1', samplesMs: baseline },
  limits: governorLimits,
  categories: {
    pendingOwned: '16MiB/8jobs cap',
    persistenceIngress: '16MiB/8jobs independent cap',
    activeTransport: '8MiB/1heavy cap; client metadata buffer detached on transfer',
    protectedStore:
      'fixture16MiB/8records including evidence and proposals; injected production store must declare finite bounds',
    memory:
      'RSS/heap/external observed independently; do not sum overlapping categories or call the16MiB queue cap total RAM',
  },
  repeats,
  collector: collector.finish({ learningEndToEndMs: 2000 }),
  gameplayGate: 'NOT_VALIDATED',
  laptop: 'NOT_MEASURED;203 waiver only',
};
mkdirSync(new URL('../Evidence/221', import.meta.url), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2));
const failures = repeats.flatMap((r) => [
  ...(r.maxSliceMs > 10 ? ['slice>10ms'] : []),
  ...(r.measurements.some((m) => m.cancellationMs !== null && m.cancellationMs > 100)
    ? ['cancel>100ms']
    : []),
  ...(r.interactiveEndToEndMs > 2000 ? ['interactive>2s'] : []),
]);
console.log(JSON.stringify({ output, repeats: repeats.length, failures, scope: report.scope }));
if (failures.length) process.exitCode = 1;
