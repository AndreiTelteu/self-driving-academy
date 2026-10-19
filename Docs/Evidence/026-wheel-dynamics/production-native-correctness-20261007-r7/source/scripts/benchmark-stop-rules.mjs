import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createLaneGraph } from '../src/world/lane-graph.ts';
import { minimalMap } from '../tests/world/fixture.ts';
const input = minimalMap();
input.stopLines[0] = { ...input.stopLines[0], kind: 'STOP', signalId: null };
const graph = createLaneGraph(input);
const query = { positionM: { x: 7, y: 0, z: 0 }, access: 'TAXI' };
function measure(run) {
  run(false);
  return Array.from({ length: 5 }, () => {
    const samples = [];
    const start = performance.now();
    const result = run(samples);
    samples.sort((a, b) => a - b);
    return {
      totalMs: performance.now() - start,
      p95Ms: samples[9499],
      p99Ms: samples[9899],
      ...result,
    };
  });
}
const report = {
  mode: process.argv.includes('--baseline') ? 'before' : 'after',
  baselineRevision:
    'f902555 (parent reported committed HEAD); working tree includes concurrent uncommitted work',
  runtime: process.version,
  sourceState: 'working tree; parent owns commit/push; concurrent uncommitted tasks present',
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  backend: 'CPU Node microbenchmark; Babylon/GPU/preset/FPS unavailable',
  fixture: 'minimal-road-v1 STOP lane-a; 10000 samples/five repeats + warmup',
  budget: 'Docs25 provisional whole-tick p95 5.5ms; this isolated producer does not certify it',
  projection: measure((samples) => {
    let matches = 0;
    for (let i = 0; i < 10000; i++) {
      const started = samples ? performance.now() : 0;
      if (graph.projectOnLane('lane-a', query)) matches++;
      if (samples) samples.push(performance.now() - started);
    }
    return { matches, graphStats: graph.getStats() };
  }),
};
if (!process.argv.includes('--baseline')) {
  const { createStopRules } = await import('../src/world/stop-rules.ts');
  report.additionalCost = measure((samples) => {
    const rules = createStopRules(input, { sessionId: 'bench', worldEpoch: 0 });
    let events = 0;
    for (let tick = 0; tick < 10000; tick++) {
      const started = samples ? performance.now() : 0;
      events += rules.observe({
        sessionId: 'bench',
        worldEpoch: 0,
        tick,
        vehicleId: 'taxi',
        incarnation: 'taxi-1',
        laneId: 'lane-a',
        access: 'TAXI',
        frontPositionM: query.positionM,
        speedMps: 1,
        headingRad: 0,
        discontinuity: false,
      }).length;
      if (samples) samples.push(performance.now() - started);
    }
    const retained = rules.getStats();
    rules.dispose();
    return { events, retained, afterDisposal: rules.getStats() };
  });
  report.cleanupCycles = Array.from({ length: 20 }, (_, i) => {
    const rules = createStopRules(input, { sessionId: 'cleanup', worldEpoch: i });
    rules.observe({
      sessionId: 'cleanup',
      worldEpoch: i,
      tick: 0,
      vehicleId: 'taxi',
      incarnation: 'taxi-1',
      laneId: 'lane-a',
      access: 'TAXI',
      frontPositionM: query.positionM,
      headingRad: 0,
      speedMps: 1,
      discontinuity: false,
    });
    const before = rules.getStats();
    rules.dispose();
    return { before, after: rules.getStats() };
  });
}
process.stdout.write(JSON.stringify(report, null, 2));
