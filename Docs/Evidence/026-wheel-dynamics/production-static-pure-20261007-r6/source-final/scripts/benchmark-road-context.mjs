import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import {
  roadContextFixture,
  exhaustiveRoadContext,
} from '../tests/autonomy/road-context-reference.ts';
import { createSignalController } from '../src/world/index.ts';
import { createEventBus } from '../src/simulation/index.ts';

const baseline = process.argv.includes('--baseline');
const evidence = 'Docs/Evidence/044-road-context';
mkdirSync(evidence, { recursive: true });
const sources = [
  'scripts/benchmark-road-context.mjs',
  'tests/autonomy/road-context-reference.ts',
  'tests/world/intersection-conflicts-fixture.ts',
  'tests/world/spatial-index-reference.ts',
  'src/world/lane-graph.ts',
  'src/world/signals.ts',
  'src/world/spatial-index.ts',
];
if (!baseline)
  for (const directory of [
    'src/autonomy',
    'src/world',
    'src/simulation',
    'src/sessions',
    'src/vehicles',
  ])
    for (const name of readdirSync(directory)
      .filter((file) => file.endsWith('.ts'))
      .sort()) {
      const source = `${directory}/${name}`;
      if (!sources.includes(source)) sources.push(source);
    }
const report = {
  capturedAt: new Date().toISOString(),
  mode: baseline ? 'BEFORE_EXHAUSTIVE' : 'AFTER_INDEXED_CONTEXT',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(
    sources.map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]),
  ),
  sourceHashScope: baseline
    ? 'Declared primary fixture/reference and world files; not a complete transitive Node dependency closure'
    : 'Declared fixture/reference plus all top-level TS source files in autonomy/world/simulation/sessions/vehicles; includes primary priority/conflict/parser/contracts/barrels; not a verified transitive dependency closure',
  hardware: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    os: `${platform()} ${release()}`,
    powerScheme:
      platform() === 'win32'
        ? execFileSync('powercfg', ['/getactivescheme'], { encoding: 'utf8' }).trim()
        : null,
  },
  runtime: process.version,
  budgetVersion: '203-initial-1',
  fixtureVersion: '044-road-context-cross-v1',
  protocol: {
    repetitions: 5,
    warmupIterations: 20,
    measuredIterations: 80,
    observer:
      'paired off/on; whole-query batch externally timed both; optional individual-context sub-timers on',
    warmupSeconds: null,
    measuredSeconds: null,
    tickHz: null,
    batchSampleCapacity: 80,
    individualSampleCapacity: 8800,
    diagnosticPayloadBoundBytes: 71680,
    workload:
      '64/110 vehicles;32/96 obstacles;24/256 zones; 4 junction approaches and parallel overpass; real036signal controller advances consecutive ticks; explicit routes and supplied per-relation distances',
    seed: 'none; deterministic position grid and tick modulo',
    budget:
      'Supplemental CPU only; no isolated context budget fixed;5.5ms provisional full-tick ceiling is not approved by isolated probe',
  },
  scope:
    'CPU Node context/reference algorithm, no renderer/browser/GPU/FPS/realtime throughput claim',
  runs: [],
};
const createContext = baseline
  ? null
  : (await import('../src/autonomy/index.ts')).createRoadContext;
const summary = (samples) => {
  const sorted = samples.slice().sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: sorted[Math.floor((sorted.length - 1) * 0.5)] ?? null,
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)] ?? null,
    p99: sorted[Math.floor((sorted.length - 1) * 0.99)] ?? null,
  };
};
const bounded = (samples, value, capacity = 80) => {
  if (samples.length >= capacity) throw new Error('044 sample capacity');
  samples.push(value);
};
const project = (value) => ({
  tick: value.tick,
  sessionId: value.sessionId,
  worldEpoch: value.worldEpoch,
  subject: value.subject,
  laneId: value.laneId,
  leader: value.leader
    ? { id: value.leader.id, incarnation: value.leader.incarnation, gapM: value.leader.gapM }
    : null,
  signal: value.signal
    ? {
        state: value.signal.state,
        signalId: value.signal.signalId,
        movementId: value.signal.movementId,
        tick: value.signal.tick,
      }
    : null,
  conflictRelationIds: value.conflictRelationIds,
  conflictVehicleIds: value.conflictVehicleIds,
  obstacleIds: value.obstacleIds,
  zoneIds: value.zoneIds,
});
for (let repetition = 0; repetition < 5; repetition++)
  for (const observe of [false, true]) {
    const rows = [];
    for (const dense of [false, true]) {
      const fixture = roadContextFixture(dense),
        { map, policy, frame, graph, conflicts } = fixture;
      const context = {
        schemaVersion: 1,
        units: 'SI',
        sessionId: frame.sessionId,
        worldEpoch: frame.worldEpoch,
      };
      const bus = createEventBus(context),
        signals = createSignalController(map, { context, eventBus: bus });
      const engine = createContext?.(map, {
        priorityPolicy: policy,
        decisionPeriodTicks: 6,
        queryRadiusM: 60,
      });
      const querySamples = [],
        updateSamples = [],
        contextSamples = [];
      let checksum = 0;
      global.gc?.();
      const wallStart = performance.now(),
        heapBefore = process.memoryUsage().heapUsed;
      for (let iteration = 0; iteration < 100; iteration++) {
        if (iteration > 0) signals.step(iteration);
        frame.tick = iteration;
        frame.signals = map.intersections[0].movements.map((movement) =>
          signals.getMovementSignal('junction', movement.id),
        );
        const actor = frame.vehicles[iteration % frame.vehicles.length];
        actor.positionM = {
          ...actor.positionM,
          x: actor.positionM.x + (iteration % 2 === 0 ? 0.1 : -0.1),
        };
        if (iteration % 30 === 0) actor.incarnation++;
        const updateStart = performance.now();
        engine?.updateFrame(frame);
        if (iteration >= 20) bounded(updateSamples, performance.now() - updateStart);
        // Correctness admission outside timed phase, includes phase change/remove-recreate.
        if (engine && [0, 30, 60, 99].includes(iteration))
          for (const subject of frame.vehicles) {
            const actual = project(engine.getContext(subject.id, { force: true }));
            const expected = exhaustiveRoadContext(map, graph, conflicts, frame, subject.id);
            if (JSON.stringify(actual) !== JSON.stringify(expected))
              throw new Error(`044 oracle mismatch: ${subject.id} tick${iteration}`);
          }
        const batchStart = performance.now();
        for (const subject of frame.vehicles) {
          const started = observe ? performance.now() : 0;
          const value = engine
            ? engine.getContext(subject.id, { force: true })
            : exhaustiveRoadContext(map, graph, conflicts, frame, subject.id);
          checksum +=
            value.obstacleIds.length +
            value.zoneIds.length +
            value.conflictVehicleIds.length +
            (value.leader ? 1 : 0);
          if (observe && iteration >= 20)
            bounded(contextSamples, performance.now() - started, 8800);
        }
        if (iteration >= 20) bounded(querySamples, performance.now() - batchStart);
      }
      const elapsedWallMs = performance.now() - wallStart;
      global.gc?.();
      rows.push({
        dense,
        vehicles: frame.vehicles.length,
        obstacles: frame.obstacles.length,
        zones: frame.zones.length,
        elapsedWallMs,
        checksum,
        queryBatchCpuMs: summary(querySamples),
        updateCpuMs: summary(updateSamples),
        individualContextCpuMs: summary(contextSamples),
        heapBeforeBytes: heapBefore,
        heapAfterBytes: process.memoryUsage().heapUsed,
        forcedGc: typeof global.gc === 'function',
        exactContextBytes: null,
        ownership: engine?.getStats() ?? {
          referenceVehicles: frame.vehicles.length,
          referenceObstacles: frame.obstacles.length,
          referenceZones: frame.zones.length,
          indexCells: 0,
          indexReferences: 0,
          cachedContexts: 0,
        },
        signal: signals.getStats(),
      });
      engine?.dispose();
      signals.dispose();
      bus.dispose();
    }
    report.runs.push({ repetition, observe, workloads: rows });
    writeFileSync(
      `${evidence}/${baseline ? 'before' : 'after'}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(`044 ${report.mode} repetition${repetition + 1}/5 observe=${observe} saved`);
  }
report.medians = [false, true].flatMap((observe) =>
  [false, true].map((dense) => {
    const rows = report.runs
      .filter((row) => row.observe === observe)
      .map((row) => row.workloads.find((item) => item.dense === dense));
    return {
      observe,
      dense,
      queryBatchP95MedianMs: summary(rows.map((row) => row.queryBatchCpuMs.p95)).p50,
      updateP95MedianMs: summary(rows.map((row) => row.updateCpuMs.p95)).p50,
    };
  }),
);
writeFileSync(`${evidence}/${baseline ? 'before' : 'after'}.json`, JSON.stringify(report, null, 2));
console.log('044 complete');
