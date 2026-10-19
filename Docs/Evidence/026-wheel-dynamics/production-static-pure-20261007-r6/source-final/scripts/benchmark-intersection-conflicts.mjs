import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { parseRoadMap } from '../src/world/parser.ts';
import { createLaneGraph } from '../src/world/lane-graph.ts';
import { minimalMap } from '../tests/world/fixture.ts';
const input = minimalMap();
function measure(run) {
  run();
  return Array.from({ length: 5 }, () => {
    const started = performance.now();
    const checksum = run();
    return { ms: performance.now() - started, checksum };
  });
}
const graph = createLaneGraph(input);
const report = {
  stage: process.argv.includes('--before') ? 'before' : 'final',
  source: process.argv.includes('--before')
    ? 'parent baseline revision afd217a + independent019/020/018 working tree'
    : 'parent final revision f902555 + independent020/018 and035 working tree; no gameplay integration',
  runtime: process.version,
  hardware: { cpu: cpus()[0]?.model, os: `${platform()} ${release()}` },
  backend: 'Node CPU algorithm only; GPU/browser/preset/FPS unavailable',
  fixture: 'minimal-road-v1',
  method: 'one warmup then5repetitions; batch duration, not whole tick/frame',
  budget: 'provisional pre203; no isolated conflict query budget fixed',
  parser1000: measure(() => {
    let checksum = 0;
    for (let i = 0; i < 1000; i++) checksum += parseRoadMap(input).lanes.length;
    return checksum;
  }),
  laneConnections10000: measure(() => {
    let checksum = 0;
    for (let i = 0; i < 10000; i++) checksum += graph.getConnections('lane-a', 'TAXI').length;
    return checksum;
  }),
};
if (!process.argv.includes('--before')) {
  const { createIntersectionConflicts } = await import('../src/world/intersection-conflicts.ts');
  const { intersectionConflictFixture } =
    await import('../tests/world/intersection-conflicts-fixture.ts');
  const fixture = intersectionConflictFixture('CROSS');
  const conflicts = createIntersectionConflicts(fixture);
  report.additionalCost = {
    construction: measure(() => createIntersectionConflicts(fixture).getStats().pairRelations),
    query10000: measure(() => {
      let checksum = 0;
      for (let i = 0; i < 10000; i++)
        checksum += Number(
          conflicts.getRelation('junction', 'west-straight', 'south-straight')?.incompatible,
        );
      return checksum;
    }),
    stats: conflicts.getStats(),
  };
  const samples = new Float64Array(10000);
  const observed = () => {
    let checksum = 0;
    for (let i = 0; i < samples.length; i++) {
      const start = performance.now();
      checksum += Number(
        conflicts.getRelation('junction', 'west-straight', 'south-straight')?.incompatible,
      );
      samples[i] = performance.now() - start;
    }
    return checksum;
  };
  report.additionalCost.observedQuery10000 = measure(observed);
  samples.sort();
  report.additionalCost.queryCpuMs = { p50: samples[4999], p95: samples[9499], p99: samples[9899] };
  report.additionalCost.observerBytes = samples.byteLength;
  const retainedHeap = [];
  if (global.gc) {
    global.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 20; i++) {
      createIntersectionConflicts(fixture).getStats();
      global.gc();
      retainedHeap.push(process.memoryUsage().heapUsed);
    }
    report.memory = {
      method: '20 construction/drop cycles with explicit GC; V8 heap only, not total RAM',
      before,
      retainedHeap,
    };
  } else report.memory = { unavailable: 'Run Node with --expose-gc for retained heap cycles' };
}
console.log(JSON.stringify(report, null, 2));
