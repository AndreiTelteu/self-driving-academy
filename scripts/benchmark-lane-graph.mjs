import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { parseRoadMap } from '../src/world/parser.ts';
import { minimalMap } from '../tests/world/fixture.ts';
const iterations = 1000;
function measure(run) {
  run();
  return Array.from({ length: 5 }, () => {
    const start = performance.now();
    const result = run();
    return { ms: performance.now() - start, ...result };
  });
}
const fixture = minimalMap();
const report = {
  mode: process.argv.includes('--baseline') ? 'before' : 'after',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  backend: 'CPU Node only; renderer/GPU/preset/FPS unavailable',
  fixture: 'minimal-road-v1; parser1000iterations/five repetitions+warmup',
  budget: 'provisional pre203; whole-tick p95proposal5.5ms, no isolated query budget fixed',
  parser: measure(() => {
    let lanes = 0;
    for (let i = 0; i < iterations; i++) lanes += parseRoadMap(fixture).lanes.length;
    return { lanes };
  }),
};
if (!process.argv.includes('--baseline')) {
  const { createLaneGraph } = await import('../src/world/lane-graph.ts');
  const { laneGraphRing } = await import('../tests/world/lane-graph-fixture.ts');
  report.additionalCost = [];
  for (const count of [3, 256, 2048]) {
    const input = count === 3 ? fixture : laneGraphRing(count);
    const construction = measure(() => ({ stats: createLaneGraph(input).getStats() }));
    const graph = createLaneGraph(input);
    const poses = input.lanes.map((lane) => {
      const path = graph.getDirectedPath(lane.id),
        a = path.points[0],
        b = path.points[1];
      return {
        expected: lane.id,
        query: {
          positionM: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
          access: 'TAXI',
          headingRad: Math.atan2(b.z - a.z, b.x - a.x),
        },
      };
    });
    const run = (observe) => {
      let matches = 0;
      const samples = [];
      for (let i = 0; i < 10000; i++) {
        const pose = poses[i % poses.length],
          started = observe ? performance.now() : 0;
        const found = graph.locateLane(pose.query);
        graph.getSuccessors(pose.expected, 'TAXI');
        if (found?.lane.id === pose.expected) matches++;
        if (observe) samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);
      return {
        matches,
        statsAfter: graph.getStats(),
        queryCpuMs: observe
          ? { samples: samples.length, p50: samples[4999], p95: samples[9499], p99: samples[9899] }
          : null,
      };
    };
    report.additionalCost.push({
      lanes: count,
      construction,
      unobserved: measure(() => run(false)),
      observed: measure(() => run(true)),
      observer: 'bounded10000samples; active/off totals separate',
    });
  }
  const memoryInput = laneGraphRing(2048);
  global.gc?.();
  const memoryBefore = process.memoryUsage().heapUsed;
  const cycleHeap = [];
  for (let i = 0; i < 20; i++) {
    {
      const graph = createLaneGraph(memoryInput);
      if (graph.getStats().segments !== 2048) throw new Error('invalid retained counters');
    }
    global.gc?.();
    cycleHeap.push(process.memoryUsage().heapUsed);
  }
  report.memory = {
    forcedGc: typeof global.gc === 'function',
    memoryBefore,
    cycleHeap,
    memoryAfter: cycleHeap.at(-1),
    retainedApplicationHistory: 0,
    limitation: 'Node heap diagnostic; GC noise/overlap; no GPU/WASM or full-game soak',
  };
}
console.log(JSON.stringify(report, null, 2));
