import { cpus, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { seededCounter } from '../tests/scenarios/seeded-counter.ts';

const baseline = process.argv.includes('--baseline');
const iterations = 10000;
const repeats = 5;
function measure(run) {
  run();
  return Array.from({ length: repeats }, () => {
    const start = performance.now();
    const result = run();
    return { milliseconds: performance.now() - start, ...result };
  });
}
const fixture = measure(() => {
  const adapter = seededCounter.create(42);
  for (let i = 0; i < iterations; i += 1) adapter.advance();
  return { finalTick: adapter.snapshot().tick, finalValue: adapter.snapshot().value };
});
const report = {
  mode: baseline ? 'before' : 'after',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  hardware: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  backend: 'CPU / Node; no renderer, GPU or FPS measurements',
  preset: 'unavailable',
  fixtureVersion: 'seeded-counter-v1 / seed 42',
  budgetVersion: 'provisional pre-203; 5.5 ms whole tick proposed desktop, not a hardware gate',
  iterations,
  repeats,
  warmup: 'one identical pass per probe',
  fixture,
};
if (!baseline) {
  const { createEventBus } = await import('../src/simulation/event-bus.ts');
  report.additionalCost = measure(() => {
    const bus = createEventBus({
      sessionId: 'bench',
      worldEpoch: 0,
      maxEventsPerEpoch: iterations,
    });
    let deliveries = 0;
    bus.subscribe(() => {
      deliveries += 1;
    });
    for (let tick = 0; tick < iterations; tick += 1) {
      bus.publish({
        schemaVersion: 1,
        units: 'SI',
        sessionId: 'bench',
        worldEpoch: 0,
        eventId: `event-${tick}`,
        tick,
        entityIds: ['signal'],
        type: 'SIGNAL_CHANGED',
        payload: { signalId: 'signal', state: 'GREEN' },
      });
    }
    const stats = bus.getStats();
    bus.dispose();
    return { deliveries, retained: stats, afterDispose: bus.getStats() };
  });
}
console.log(JSON.stringify(report, null, 2));
