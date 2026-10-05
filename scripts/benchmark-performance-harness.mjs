import { cpus, platform, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createFixedTickLoop } from '../src/simulation/fixed-tick.ts';
import {
  createPerformanceCollector,
  createPerformanceReport,
  distribution,
} from '../src/telemetry/performance.ts';

const budget = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
const inputs = [
  'scripts/benchmark-performance-harness.mjs',
  'src/telemetry/performance.ts',
  'src/simulation/fixed-tick.ts',
  'package-lock.json',
];
const hash = createHash('sha256');
for (const file of inputs) hash.update(file).update(await readFile(file));
const count = 20000;
function run(enabled, measure) {
  let value = 42;
  const collector = createPerformanceCollector(count, enabled);
  const reference = new Float64Array(count);
  const loop = createFixedTickLoop({
    captureSnapshot: () => ({ value }),
    step: () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    },
    interpolate: (_previous, current) => current,
  });
  loop.frame(0);
  const start = performance.now();
  for (let frame = 1; frame <= count; frame++) {
    const began = performance.now();
    const result = loop.frame(frame * (1000 / 60));
    const coreElapsed = performance.now() - began;
    if (enabled) {
      collector.record('mainThreadMs', coreElapsed);
      collector.record('debtMs', result.state.debtSeconds * 1000);
    }
    reference[frame - 1] = performance.now() - began;
  }
  const wallDurationMs = performance.now() - start;
  const state = loop.getState();
  const retainedSnapshotsBeforeDispose = state.snapshots === null ? 0 : 2;
  loop.dispose();
  const retainedSnapshotsAfterDispose = loop.getState().snapshots === null ? 0 : 2;
  return {
    measure,
    value,
    state,
    wallDurationMs,
    collector: collector.finish(),
    reference: distribution(reference, count),
    retainedSnapshotsBeforeDispose,
    retainedSnapshotsAfterDispose,
  };
}
const runs = [];
for (let repeat = 1; repeat <= 5; repeat++) {
  // Alternate order to expose ordering/thermal bias while keeping repeat identities stable.
  for (const enabled of repeat % 2 ? [false, true] : [true, false]) {
    const warm = run(enabled, false);
    const measured = run(enabled, true);
    if (
      measured.state.tick !== count ||
      measured.value !== warm.value ||
      measured.state.overloadCount !== 0
    )
      throw new Error('Fixture determinism failure');
    runs.push({
      repeat,
      seed: 42,
      enabled,
      warmupMs: warm.wallDurationMs,
      activeDurationMs: measured.wallDurationMs,
      wallDurationMs: measured.wallDurationMs,
      collector: measured.collector,
      referenceCpuMs: measured.reference,
      referenceFrameMs: null,
      simulation: {
        clock: 'synthetic',
        measuredWallSeconds: measured.wallDurationMs / 1000,
        simulatedSeconds: measured.state.simulatedSeconds,
        admittedClockSeconds: measured.state.activeRealSeconds,
        ratio: measured.state.simulatedSeconds / measured.state.activeRealSeconds,
        tick: measured.state.tick,
        overloads: measured.state.overloadCount,
      },
      resources: {
        retainedSnapshotsBeforeDispose: measured.retainedSnapshotsBeforeDispose,
        retainedSnapshotsAfterDispose: measured.retainedSnapshotsAfterDispose,
        exactPageMemoryBytes: null,
      },
    });
  }
}
const report = createPerformanceReport({
  role: 'portable-cpu',
  identity: {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceHash: hash.digest('hex'),
    budgetVersion: budget.budgetVersion,
    fixtureVersion: '218-fixed-counter-v1/20000-frames',
    engineVersion: 'not rendered',
    physicsVersion: null,
    mapVersion: null,
    seeds: [42],
    hardware: {
      cpu: cpus()[0]?.model,
      ramBytes: totalmem(),
      os: `${platform()} ${release()}`,
      runtime: process.version,
      inputs,
    },
    browser: null,
    backend: 'Node CPU; synthetic clock',
    preset: 'not applicable',
    cssResolution: null,
    internalResolution: null,
    devicePixelRatio: null,
    cache: 'warm JS after one identical pass per arm',
    network: 'not applicable',
    powerState: 'not captured; portable CPU probe',
  },
  scope:
    'Real fixed-tick core with deterministic counter, synthetic 60Hz clock; no physics, renderer or hardware FPS',
  coldLoad: [],
  warmLoad: [],
  runs,
  unavailable: {
    gpu: 'No renderer/API',
    frame: 'Synthetic clock is not hardware cadence',
    input: 'Authoritative driving input unimplemented',
    learning: 'Learning pipeline unimplemented',
    memory: 'Exact application memory unavailable; owned collector bytes and snapshots reported',
  },
  exclusions: [
    'CPU loop wall throughput is not gameplay real-time throughput; simulation ratio refers to admitted synthetic clock',
    'Cold browser loading is a separate hardware fixture',
  ],
});
await mkdir('Evidence/218', { recursive: true });
await writeFile('Evidence/218/portable-cpu.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      output: 'Evidence/218/portable-cpu.json',
      budgetVersion: report.identity.budgetVersion,
      pairs: 5,
      overhead: report.overhead,
      scope: report.scope,
    },
    null,
    2,
  ),
);
