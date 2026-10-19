import { cpus, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { seededCounter } from '../tests/scenarios/seeded-counter.ts';

const baseline = process.argv.includes('--baseline');
const iterations = 10000;
function measure(run) {
  run();
  return Array.from({ length: 5 }, () => {
    const start = performance.now();
    const result = run();
    return { milliseconds: performance.now() - start, ...result };
  });
}
const report = {
  mode: baseline ? 'before' : 'after',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  hardware: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  backend: 'CPU Node; no GPU, browser, physics or hardware FPS measurement',
  preset: 'unavailable',
  fixtureVersion: 'seeded-counter-v1/seed42',
  budgetVersion: 'provisional pre-203; desktop whole-tick p95 proposal 5.5ms, frame p95 18.5ms',
  iterations,
  warmup: 'one identical pass per probe',
  fixture: measure(() => {
    const adapter = seededCounter.create(42);
    for (let i = 0; i < iterations; i += 1) adapter.advance();
    return { finalTick: adapter.snapshot().tick, finalValue: adapter.snapshot().value };
  }),
};
if (!baseline) {
  const { createFixedTickLoop } = await import('../src/simulation/fixed-tick.ts');
  const runLoop = (observe) => {
    let value = 0;
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ value }),
      step: () => {
        value += 1;
      },
      interpolate: (previous, current, alpha) => ({
        value: previous.value + (current.value - previous.value) * alpha,
      }),
    });
    loop.frame(0);
    const samples = [];
    for (let frame = 1; frame <= iterations; frame += 1) {
      const start = observe ? performance.now() : 0;
      loop.frame(frame * (1000 / 60));
      if (observe) samples.push(performance.now() - start);
    }
    const state = loop.getState();
    loop.dispose();
    samples.sort((a, b) => a - b);
    return {
      tick: state.tick,
      value,
      debtSeconds: state.debtSeconds,
      simulatedSeconds: state.simulatedSeconds,
      activeRealSeconds: state.activeRealSeconds,
      retainedSnapshots: state.snapshots === null ? 0 : 2,
      retainedSnapshotsAfterDispose: loop.getState().snapshots === null ? 0 : 2,
      disposed: loop.getState().status === 'disposed',
      frameCpuMs: observe
        ? {
            count: samples.length,
            p50: samples[Math.ceil(samples.length * 0.5) - 1],
            p95: samples[Math.ceil(samples.length * 0.95) - 1],
            p99: samples[Math.ceil(samples.length * 0.99) - 1],
          }
        : null,
    };
  };
  report.additionalCost = measure(() => runLoop(false));
  report.observedFrames = measure(() => runLoop(true));
  report.observer =
    '10000 bounded CPU duration samples per repetition; active/off totals separate; no hardware FPS';
}
console.log(JSON.stringify(report, null, 2));
