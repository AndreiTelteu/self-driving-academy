import assert from 'node:assert/strict';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSimulationScheduler } from '../src/simulation/scheduling.ts';
import { distribution } from '../src/telemetry/performance.ts';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { syntheticRouteSearch } from '../tests/simulation/scheduling-reference.ts';
import { syntheticRouteTask } from '../tests/simulation/route-work-fixture.ts';

const evidence =
  'Docs/Evidence/219-simulation-scheduling' +
  (process.argv.includes('--corrected-core') ? '/corrected-core' : '');
if (existsSync(`${evidence}/route-cost.json`))
  throw new Error('Route cost evidence exists; preserve original');
const files = [
  'scripts/benchmark-scheduling-route-work.mjs',
  'tests/simulation/route-work-fixture.ts',
  'tests/simulation/scheduling-reference.ts',
  'tests/autonomy/road-context-reference.ts',
  'src/simulation/scheduling.ts',
  'src/world/lane-graph.ts',
  'src/telemetry/performance.ts',
];
for (const directory of [
  'src/simulation',
  'src/autonomy',
  'src/world',
  'src/vehicles',
  'src/sessions',
  'src/telemetry',
])
  for (const name of readdirSync(directory)
    .filter((file) => file.endsWith('.ts'))
    .sort()) {
    const file = `${directory}/${name}`;
    if (!files.includes(file)) files.push(file);
  }
const sourceHashes = Object.fromEntries(
  files.map((file) => {
    const bytes = readFileSync(file),
      hash = createHash('sha256').update(bytes).digest('hex');
    const archive = `${evidence}/route-source/${file}.txt`;
    mkdirSync(dirname(archive), { recursive: true });
    writeFileSync(archive, bytes);
    return [file, hash];
  }),
);
const fixture = roadContextFixture(false),
  lanes = fixture.map.lanes.map((lane) => lane.id).sort();
const scope = { sessionId: '219-route-cost', worldEpoch: 0 };
const actors = Array.from({ length: 16 }, (_, id) => ({
  id: `actor-${id.toString().padStart(2, '0')}`,
  incarnation: 1,
}));
const blocked = new Set([lanes[3]]);
const configurations = actors.map((actor, index) => ({
  ...scope,
  actor,
  graphVersion: 'g1',
  costVersion: 'c0',
  origin: lanes[Math.floor(index / lanes.length)],
  destination: lanes[index % lanes.length],
  access: 'CIVIL',
  priority: index % 5 === 0 ? 'urgent' : 'normal',
}));
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  hardware: { cpu: cpus()[0]?.model, os: `${platform()} ${release()}` },
  sourceHashes,
  sourceHashScope:
    'Declared primary harness/fixtures plus all top-level simulation/autonomy/world/vehicles/sessions/telemetry TS files; not a verified full transitive closure',
  fixtureVersion: '219-route-cost-v1',
  protocol: {
    repetitions: 5,
    warmupBatches: 20,
    measuredBatches: 80,
    routesPerBatch: 16,
    schedulerTicksPerBatch: 4,
    observer:
      'alternating off/on; reference search,queue admission,whole4tick processing timers in both; optional eachtick subtimers on',
    sampleCapacity: 80,
    tickSampleCapacity: 320,
    bufferBytes: 4480,
    warmupSeconds: null,
    measuredSeconds: null,
  },
  scope:
    'Supplemental unpacedCPU added queue/cache pipeline cost, not chronological beforebaseline or045gameplay/fulltick/FPSgate. Reference is preserved original synchronous graph-search semantics; cache invalidated eachbatch to measure16unique coldkeys, including blocked results.',
  runs: [],
};
for (let repeat = 1; repeat <= 5; repeat++)
  for (const observe of repeat % 2 ? [false, true] : [true, false]) {
    const raw = new Float64Array(80),
      admission = new Float64Array(80),
      processing = new Float64Array(80),
      tickSamples = new Float64Array(320);
    let tick = 0,
      callbacks = 0,
      tasks = 0,
      cleanups = 0,
      checksum = 0;
    const outcomes = new Map();
    const scheduler = createSimulationScheduler({
      ...scope,
      ports: {
        input() {},
        decision() {},
        controller() {},
        physics() {},
        routeResult(result) {
          callbacks++;
          outcomes.set(result.actor.id, result.path);
        },
        createRouteTask(request) {
          tasks++;
          const task = syntheticRouteTask(
            fixture.graph,
            request.origin,
            request.destination,
            blocked,
          );
          return {
            step(budget) {
              return task.step(budget);
            },
            dispose() {
              cleanups++;
              task.dispose();
            },
          };
        },
      },
    });
    scheduler.setActors(actors, scope);
    const began = performance.now();
    for (let batch = 0; batch < 100; batch++) {
      const expected = new Map(),
        sample = batch - 20;
      const rawStart = performance.now();
      for (const request of configurations)
        expected.set(
          request.actor.id,
          syntheticRouteSearch(fixture.graph, request.origin, request.destination, blocked),
        );
      const rawCost = performance.now() - rawStart;
      outcomes.clear();
      const admissionStart = performance.now();
      scheduler.setRouteVersions({ graphVersion: 'g1', costVersion: `c${batch}` }, scope);
      for (const request of configurations)
        scheduler.requestRoute({ ...request, costVersion: `c${batch}` });
      const admissionCost = performance.now() - admissionStart;
      const processStart = performance.now();
      for (let offset = 0; offset < 4; offset++) {
        const start = observe ? performance.now() : 0;
        scheduler.step({ ...scope, tick: ++tick, dtSeconds: 1 / 60 });
        if (observe && sample >= 0) {
          const index = sample * 4 + offset;
          if (index >= 320) throw new Error('Tick sample capacity');
          tickSamples[index] = performance.now() - start;
        }
      }
      const processCost = performance.now() - processStart;
      // Exact result-set/path oracle outside timing; fixture agrees even for blocked destinations.
      assert.deepEqual([...outcomes].sort(), [...expected].sort());
      assert.equal(scheduler.getStats().routeJobs, 0);
      checksum += [...outcomes.values()].reduce((sum, path) => sum + (path?.length ?? 0), 0);
      if (sample >= 0) {
        if (sample >= 80) throw new Error('Batch sample capacity');
        raw[sample] = rawCost;
        admission[sample] = admissionCost;
        processing[sample] = processCost;
      }
    }
    const elapsedWallMs = performance.now() - began;
    scheduler.dispose();
    assert.equal(tasks, cleanups);
    assert.equal(callbacks, 1600);
    assert.equal(tasks, 1600);
    report.runs.push({
      repeat,
      observe,
      elapsedWallMs,
      rawSearchCpuMs: distribution(raw, 80),
      queueAdmissionCpuMs: distribution(admission, 80),
      fourTickProcessingCpuMs: distribution(processing, 80),
      optionalTickCpuMs: observe ? distribution(tickSamples, 320) : null,
      callbacks,
      tasks,
      cleanups,
      checksum,
      schedulerTicks: tick,
    });
  }
for (const [file, hash] of Object.entries(sourceHashes))
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash)
    throw new Error(`Route source drift: ${file}`);
writeFileSync(`${evidence}/route-cost.json`, JSON.stringify(report, null, 2));
console.log('219route exactoracle+cost probe PASS');
