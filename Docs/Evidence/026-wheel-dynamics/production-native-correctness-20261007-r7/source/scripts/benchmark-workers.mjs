import os from 'node:os';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
const samples = [];
for (let r = 0; r < 5; r++) {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) structuredClone(new ArrayBuffer(4096));
  samples.push(performance.now() - start);
}
const report = {
  fixture: 'clone-4096x1000-v1',
  capturedAt: new Date().toISOString(),
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  revision: 'working tree; PBI010 protocol',
  powerState: 'not observed',
  gpu: 'not used',
  preset: 'CPU protocol fixture only',
  node: process.version,
  os: os.platform(),
  cpu: os.cpus()[0].model,
  ramBytes: os.totalmem(),
  samplesMs: samples,
  bytesPerCopy: 4096,
  backend: 'Node CPU only; no FPS/GPU claim',
};
if (process.argv.includes('--new')) {
  const { Worker } = await import('node:worker_threads');
  const { WorkerClient, limits } = await import('../src/workers/index.ts');
  const measurements = [];
  const identity = {
    baseVersionId: 'v1',
    profileId: 'p1',
    learningEpoch: 1,
    sessionId: 's1',
    worldEpoch: 1,
  };
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    const worker = new Worker(new URL('../tests/workers/thread-fixture.mjs', import.meta.url), {
      execArgv: ['--import', new URL('./register-typescript.mjs', import.meta.url).href],
    });
    let ready;
    const readyPromise = new Promise((resolve) => {
      ready = resolve;
    });
    let progressCount = 0;
    const port = {
      send: (p, transfers) => worker.postMessage(p, [...transfers]),
      listen: (message, error) => {
        worker.on('message', message);
        worker.on('error', error);
        return () => {
          worker.off('message', message);
          worker.off('error', error);
        };
      },
    };
    const client = new WorkerClient(
      port,
      () => identity,
      () => performance.now(),
      () => {
        progressCount++;
        ready();
      },
    );
    const make = (jobId, segmentId) => ({
      ...identity,
      jobId: String(jobId),
      segmentId,
      type: 'start',
      sequence: 0,
      payloadBytes: 16,
      buffer: new ArrayBuffer(16),
      ownership: 'transfer',
      priority: 'interactive',
    });
    try {
      const long = client.submit(make(1, 'long'));
      await readyPromise;
      const startupMs = performance.now() - start;
      await new Promise((resolve) => setTimeout(resolve, 450));
      const cancelStart = performance.now();
      client.cancel('1');
      await long;
      const cancelMs = performance.now() - cancelStart;
      const nextStart = performance.now();
      const next = await client.submit(make(2, 'short'));
      const nextJobMs = performance.now() - nextStart;
      const metrics = new Float64Array(next.packet.buffer);
      const throughputStart = performance.now();
      for (let i = 3; i < 103; i++) await client.submit(make(i, 'short'));
      measurements.push({
        startupMs,
        cancelMs,
        nextJobMs,
        oneHundredJobsMs: performance.now() - throughputStart,
        maxSliceMs: metrics[0],
        slices: metrics[1],
        workerHeapUsedBytes: metrics[2],
        processRssBytes: metrics[3],
        progressCount,
        tracked: client.usage,
      });
    } finally {
      client.dispose();
      await worker.terminate();
    }
  }
  report.newCost = {
    fixture: 'real-thread-slices-2ms-450ms-cancel-100jobs-v1',
    measurements,
    limits,
    budgets: 'provisional slice<=10ms cancel<=100ms progress<=5Hz; timers/Node CPU no browser FPS',
    memory:
      'worker heap/process RSS observed, not GPU nor exact retention; tracked payload and history bounded',
  };
  if (
    measurements.some(
      (m) =>
        m.cancelMs > 100 ||
        m.maxSliceMs > 10 ||
        m.progressCount > 3 ||
        m.tracked.jobs !== 0 ||
        m.tracked.bytes !== 0 ||
        m.tracked.history > 64,
    )
  )
    throw new Error('Worker provisional budget exceeded');
}
fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
console.log(report);
