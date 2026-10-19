import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createFixedTickLoop } from '../src/simulation/fixed-tick.ts';
import { createIntersectionConflicts } from '../src/world/intersection-conflicts.ts';
import { intersectionConflictFixture } from '../tests/world/intersection-conflicts-fixture.ts';
function measure(run) {
  run();
  return Array.from({ length: 5 }, () => {
    const started = performance.now();
    const checksum = run();
    return { ms: performance.now() - started, checksum };
  });
}
const fixture = intersectionConflictFixture();
const conflicts = createIntersectionConflicts(fixture);
const report = {
  stage: process.argv.includes('--before') ? 'before' : 'final',
  source: 'parent revision f902555 + independent020/018/036 working tree',
  runtime: process.version,
  hardware: { cpu: cpus()[0]?.model, os: `${platform()} ${release()}` },
  backend: 'Node CPU only; browser/GPU/FPS unavailable',
  budget: 'provisional pre203; whole tick5.5ms proposal is not isolated controller acceptance',
  method: 'one warmup +5repetitions, bounded batches',
  conflictQueries10000: measure(() => {
    let count = 0;
    for (let i = 0; i < 10000; i++)
      count += Number(
        conflicts.getRelation('junction', 'west-straight', 'south-straight')?.incompatible,
      );
    return count;
  }),
  fixedTicks10000: measure(() => {
    let count = 0;
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick: count }),
      step: () => {
        count++;
      },
      interpolate: (_a, b) => b,
    });
    for (let i = 0; i <= 10000; i++) loop.frame((i * 1000) / 60);
    loop.dispose();
    return count;
  }),
};
if (!process.argv.includes('--before')) {
  const { createSignalController } = await import('../src/world/signals.ts');
  const { signalFixture } = await import('../tests/world/signals-fixture.ts');
  const { createEventBus } = await import('../src/simulation/event-bus.ts');
  const context = { schemaVersion: 1, units: 'SI', sessionId: 'signals-bench', worldEpoch: 0 };
  const input = signalFixture();
  report.additionalCost = {
    construction: measure(() => {
      const bus = createEventBus(context);
      const controller = createSignalController(input, { context, eventBus: bus });
      const count = controller.getStats().signals;
      controller.dispose();
      bus.dispose();
      return count;
    }),
    ticks10000: measure(() => {
      const bus = createEventBus({ ...context, maxEventsPerEpoch: 12000 });
      const controller = createSignalController(input, { context, eventBus: bus });
      for (let tick = 1; tick <= 10000; tick++) controller.step(tick);
      const count = bus.getStats().retainedEvents;
      controller.dispose();
      bus.dispose();
      return count;
    }),
  };
  const samples = new Float64Array(10000);
  report.additionalCost.observedTicks10000 = measure(() => {
    const bus = createEventBus({ ...context, maxEventsPerEpoch: 12000 });
    const controller = createSignalController(input, { context, eventBus: bus });
    for (let tick = 1; tick <= samples.length; tick++) {
      const started = performance.now();
      controller.step(tick);
      samples[tick - 1] = performance.now() - started;
    }
    const checksum = bus.getStats().retainedEvents;
    controller.dispose();
    bus.dispose();
    return checksum;
  });
  samples.sort();
  report.additionalCost.tickCpuMs = { p50: samples[4999], p95: samples[9499], p99: samples[9899] };
  report.additionalCost.observerBytes = samples.byteLength;
  report.memory = { gcAvailable: Boolean(global.gc), cycles: [] };
  for (let cycle = 0; cycle < 20; cycle++) {
    const bus = createEventBus(context);
    const controller = createSignalController(input, { context, eventBus: bus });
    for (let tick = 1; tick <= 120; tick++) controller.step(tick);
    const before = { controller: controller.getStats(), bus: bus.getStats() };
    controller.dispose();
    bus.dispose();
    global.gc?.();
    report.memory.cycles.push({
      before,
      after: { controller: controller.getStats(), bus: bus.getStats() },
      heapUsed: global.gc ? process.memoryUsage().heapUsed : null,
    });
  }
}
console.log(JSON.stringify(report, null, 2));
