import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 273 live learning cost probe. It measures the local software path only: evidence projection,
 * the real 103/221 runtime, the 109/110 publication and the total step-to-activation latency. It is
 * PROVISIONAL_UNCALIBRATED and is not FPS, GPU, frame or hardware evidence.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '273-live-learning');
const reportModule = await import(
  pathToFileURL(join(root, 'tests', 'app', 'live-learning-report.ts')).href
);
const evidenceModule = await import(
  pathToFileURL(join(root, 'src', 'learning', 'live-evidence.ts')).href
);
const world = reportModule.createReportWorld();
const sample = [];
const measure = async (name, action) => {
  const start = performance.now();
  const value = await action();
  const elapsed = performance.now() - start;
  sample.push({ name, ms: elapsed });
  return value;
};

try {
  const segment = world.drive({
    segmentId: 'cost-segment',
    startDistanceM: 130,
    ticks: 1080,
    speed: (tick, total) => (tick < total - 240 ? 9 : 2),
  });
  const derive = [];
  for (let index = 0; index < 20; index += 1) {
    const start = performance.now();
    evidenceModule.deriveLiveLearningPayload(segment, {
      baseValue: (key) => world.live.read().profile.parameters[key] ?? 0,
    });
    derive.push(performance.now() - start);
  }
  const sorted = [...derive].sort((a, b) => a - b);
  const percentile = (p) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
  await measure('step-to-activation', async () => {
    world.tick.value += 1;
    world.live.step(world.tick.value);
    const deadline = Date.now() + 5000;
    for (;;) {
      const read = world.live.read();
      if (read.stats.activationsApplied >= 1) return read;
      if (Date.now() > deadline) throw new Error('cost probe activation timeout');
      await new Promise((resolve) => setTimeout(resolve, 1));
      world.tick.value += 1;
      world.live.step(world.tick.value);
    }
  });
  const measurement = world.queue.queue.measurements.at(-1) ?? null;
  const read = world.live.read();
  const cost = {
    version: '273-live-learning-cost-v1',
    label: 'PROVISIONAL_UNCALIBRATED',
    contract: '273-live-learning-v1',
    generatedBy: 'scripts/run-live-learning-cost.mjs',
    hardware: {
      cpu: cpus()[0]?.model ?? 'unknown',
      platform: `${platform()} ${release()}`,
      node: process.version,
      backend: 'NODE_CPU',
      preset: 'NOT_APPLICABLE',
      gpu: 'NOT_MEASURED',
      frame: 'NOT_MEASURED',
    },
    evidenceProjection: {
      runs: derive.length,
      p50Ms: Number(percentile(0.5).toFixed(4)),
      p95Ms: Number(percentile(0.95).toFixed(4)),
      minMs: Number(Math.min(...derive).toFixed(4)),
      maxMs: Number(Math.max(...derive).toFixed(4)),
    },
    queue: {
      queueMs: measurement?.queueMs ?? null,
      serviceMs: measurement?.serviceMs ?? null,
      endToEndMs: measurement?.endToEndMs ?? null,
      payloadBytes: measurement?.payloadBytes ?? null,
      status: measurement?.status ?? null,
    },
    activation: {
      stepToActivationMs: Number(
        sample.find((row) => row.name === 'step-to-activation')?.ms.toFixed(4) ?? 0,
      ),
      versionCount: read.stats.versions,
      activationCount: read.stats.activationsApplied,
      versionId: read.headVersionId,
      activateAtTick: read.history.at(-1)?.activateAtTick ?? null,
      appliedAtTick: read.activation.lastAppliedTick,
    },
    notes: [
      'Local software probe, not FPS/GPU/frame/hardware evidence.',
      'The browser probe uses the same in-process runtime when a dedicated worker port is unavailable; the Node report uses the real WorkerRuntime.',
      'No XP or mission writer participates.',
    ],
  };
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'cost.json'), `${JSON.stringify(cost, null, 2)}\n`);
  console.log(
    `273 cost: evidence p95 ${cost.evidenceProjection.p95Ms} ms, queue end-to-end ${cost.queue.endToEndMs} ms, activation ${cost.activation.stepToActivationMs} ms.`,
  );
} finally {
  world.dispose();
}
