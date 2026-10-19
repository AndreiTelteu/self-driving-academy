import { cpus, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createApplicationLifecycle } from '../src/app/application-lifecycle.ts';
const reports = [];
async function run(observe) {
  let now = 0;
  let callback;
  let tick = 0;
  let listeners = 0;
  const app = createApplicationLifecycle({
    createBackend: async () => ({
      rendererKind: 'CPU mock',
      render() {},
      resize() {},
      dispose() {},
    }),
    createSimulation: () => ({
      captureSnapshot: () => ({ tick }),
      step(step) {
        tick = step.tick;
      },
      interpolate: (_previous, current) => current,
    }),
    show() {},
    now: () => now,
    isHidden: () => false,
    scheduleFrame: (next) => {
      callback = next;
      return 1;
    },
    cancelFrame() {},
    subscribeResize: () => {
      listeners++;
      return () => listeners--;
    },
    subscribeVisibility: () => {
      listeners++;
      return () => listeners--;
    },
  });
  await app.load();
  app.play();
  const samples = [];
  const start = performance.now();
  for (let i = 1; i <= 10000; i++) {
    now = (i * 1000) / 60;
    const before = observe ? performance.now() : 0;
    callback();
    if (observe) samples.push(performance.now() - before);
  }
  const milliseconds = performance.now() - start;
  app.dispose();
  samples.sort((a, b) => a - b);
  return {
    milliseconds,
    tick,
    listenersAfterDispose: listeners,
    p50: samples[4999] ?? null,
    p95: samples[9499] ?? null,
    p99: samples[9899] ?? null,
  };
}
await run(false);
for (let i = 0; i < 5; i++)
  reports.push({ unobserved: await run(false), observed: await run(true) });
console.log(
  JSON.stringify(
    {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      build: 'working tree PBI012',
      runtime: process.version,
      cpu: cpus()[0]?.model,
      os: `${platform()} ${release()}`,
      backend: 'CPU Node mock renderer; no hardware FPS',
      preset: 'unavailable',
      budget: 'provisional pre203 whole-tick p95 5.5ms/frame18.5ms; compact fixture only',
      fixture:
        '10000 lifecycle frames, 60Hz, tick-only snapshot; five runs + warmup; bounded observer10000',
      reports,
    },
    null,
    2,
  ),
);
