import './register-typescript.mjs';
import assert from 'node:assert/strict';
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';

const { createRoutePlanner, ROUTE_COST_MODEL } = await import('../src/world/route-planner.ts');
const { createSimulationScheduler } = await import('../src/simulation/scheduling.ts');
const { distribution } = await import('../src/telemetry/performance.ts');
const { roadContextFixture } = await import('../tests/autonomy/road-context-reference.ts');
const { syntheticRouteSearch } = await import('../tests/simulation/scheduling-reference.ts');

const evidence = 'Docs/Evidence/041-route-planner';
const files = [
  'scripts/benchmark-route-planner.mjs',
  'src/world/route-planner.ts',
  'src/world/lane-graph.ts',
  'src/simulation/scheduling.ts',
  'src/telemetry/performance.ts',
  'tests/autonomy/road-context-reference.ts',
  'tests/simulation/scheduling-reference.ts',
  'tests/simulation/route-work-fixture.ts',
];
for (const directory of ['src/simulation', 'src/world', 'src/telemetry'])
  for (const name of readdirSync(directory)
    .filter((file) => file.endsWith('.ts'))
    .sort()) {
    const file = `${directory}/${name}`;
    if (!files.includes(file)) files.push(file);
  }
const sourceHashes = {};
for (const file of files) {
  const bytes = readFileSync(file);
  sourceHashes[file] = createHash('sha256').update(bytes).digest('hex');
  const archive = `${evidence}/route-source/${file}.txt`;
  mkdirSync(dirname(archive), { recursive: true });
  writeFileSync(archive, bytes);
}

const fixture = roadContextFixture(false);
const lanes = fixture.map.lanes.map((lane) => lane.id).sort();
const graph = fixture.graph;
const blocked = new Set([lanes[3]]);
const scope = { sessionId: '041-route-planner', worldEpoch: 0 };
const actors = Array.from({ length: 16 }, (_, id) => ({
  id: `actor-${id.toString().padStart(2, '0')}`,
  incarnation: 1,
}));
const configurations = actors.map((actor, index) => ({
  actor,
  origin: lanes[Math.floor(index / lanes.length)],
  destination: lanes[index % lanes.length],
  priority: index % 5 === 0 ? 'urgent' : 'normal',
}));

function costOfPath(path) {
  let total = 0;
  for (let index = 1; index < path.length; index++) {
    const lane = graph.getLane(path[index]);
    const lengthM = graph.getDirectedPath(path[index]).lengthM;
    const connection = graph
      .getConnections(path[index - 1], 'CIVIL')
      .find((candidate) => candidate.toLaneId === path[index]);
    const penalty =
      connection && connection.kind === 'TURN'
        ? ROUTE_COST_MODEL.turnPenaltyS
        : ROUTE_COST_MODEL.continuationPenaltyS;
    total += lengthM / Math.max(lane.speedLimitMps, ROUTE_COST_MODEL.minSpeedMps) + penalty;
  }
  return total;
}

function assertProbe(rawPaths, plans) {
  for (let index = 0; index < rawPaths.length; index++) {
    const reference = rawPaths[index];
    const plan = plans[index];
    if (reference === null) {
      assert.notEqual(plan.status, 'READY', `unexpected route ${configurations[index].origin}`);
      continue;
    }
    assert.equal(plan.status, 'READY');
    assert.equal(plan.path[0], configurations[index].origin);
    assert.equal(plan.path.at(-1), configurations[index].destination);
    for (let step = 1; step < plan.path.length; step++)
      assert.ok(graph.canTraverse(plan.path[step - 1], plan.path[step], 'CIVIL'));
    assert.ok(plan.costSeconds <= costOfPath(reference) + 1e-9, 'planner not optimal-or-better');
  }
}

const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  hardware: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    os: `${platform()} ${release()}`,
    powerScheme: 'not captured by this Node probe',
  },
  sourceHashes,
  sourceHashScope:
    'Declared primary harness/fixtures plus all top-level world/simulation/telemetry TS files; not a verified transitive closure',
  fixtureVersion: '041-route-planner-v1',
  costModel: { ...ROUTE_COST_MODEL },
  protocol: {
    repetitions: 5,
    warmupBatches: 20,
    measuredBatches: 80,
    routesPerBatch: 16,
    schedulerTicksPerBatch: 4,
    observer:
      'alternating off/on; synthetic reference search, direct planner findRoute, queue admission and whole 4-tick processing timers in both arms',
    sampleCapacity: 80,
    tickSampleCapacity: 320,
    before: 'preserved syntheticRouteSearch BFS over the same 033 successors',
    after: 'createRoutePlanner.findRoute A* with a fresh cost version each batch (cold cache)',
  },
  budgetComparison: {
    manifest: 'Docs/performance-budgets.json',
    budgetVersion: '203-initial-1',
    ceilingMs: 5.5,
    ceilingName: 'proposedBudgets.desktop.authoritativeTickP95Ms',
    label: 'PROVISIONAL_UNCALIBRATED',
    note: 'Single-route CPU slice in a Node probe; not a whole-tick or hardware/FPS gate. The routing arm must stay within the provisional authoritative-tick budget, but a passing probe does not approve gameplay or laptop performance.',
  },
  scope:
    'Local CPU cost of the real PBI041 A* planner versus the preserved 219 synthetic reference on the identical 044 map/lane fixture, plus the added 219 queue/cache pipeline cost. No renderer, physics or FPS claim.',
  runs: [],
};

for (let repeat = 1; repeat <= 5; repeat++) {
  for (const observe of repeat % 2 ? [false, true] : [true, false]) {
    const raw = new Float64Array(80);
    const planner = new Float64Array(80);
    const admission = new Float64Array(80);
    const processing = new Float64Array(80);
    const tickSamples = new Float64Array(320);
    const plannerDirect = createRoutePlanner({
      graph,
      map: fixture.map,
      graphVersion: 'g1',
      costVersion: 'c0',
      blocked: [...blocked],
    });
    const plannerPipeline = createRoutePlanner({
      graph,
      map: fixture.map,
      graphVersion: 'g1',
      costVersion: 'c0',
      blocked: [...blocked],
    });
    let tick = 0;
    let callbacks = 0;
    let tasks = 0;
    let cleanups = 0;
    let checksum = 0;
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
          const task = plannerPipeline.createRouteTask(request);
          return {
            step: (budget) => task.step(budget),
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
      const sample = batch - 20;
      const costVersion = `c${batch}`;

      const rawStart = performance.now();
      const rawPaths = configurations.map((configuration) =>
        syntheticRouteSearch(graph, configuration.origin, configuration.destination, blocked),
      );
      const rawCost = performance.now() - rawStart;

      plannerDirect.setVersions({ graphVersion: 'g1', costVersion });
      const plannerStart = performance.now();
      const plans = configurations.map((configuration) =>
        plannerDirect.findRoute({
          origin: configuration.origin,
          destination: configuration.destination,
          access: 'CIVIL',
        }),
      );
      const plannerCost = performance.now() - plannerStart;
      assertProbe(rawPaths, plans);

      plannerPipeline.setVersions({ graphVersion: 'g1', costVersion });
      outcomes.clear();
      const admissionStart = performance.now();
      scheduler.setRouteVersions({ graphVersion: 'g1', costVersion }, scope);
      for (const configuration of configurations)
        scheduler.requestRoute({
          ...scope,
          actor: configuration.actor,
          graphVersion: 'g1',
          costVersion,
          origin: configuration.origin,
          destination: configuration.destination,
          access: 'CIVIL',
          priority: configuration.priority,
        });
      const admissionCost = performance.now() - admissionStart;
      const processStart = performance.now();
      for (let offset = 0; offset < 4; offset++) {
        const start = observe ? performance.now() : 0;
        scheduler.step({ ...scope, tick: ++tick, dtSeconds: 1 / 60 });
        if (observe && sample >= 0) tickSamples[sample * 4 + offset] = performance.now() - start;
      }
      const processCost = performance.now() - processStart;
      assert.equal(scheduler.getStats().routeJobs, 0);
      checksum += [...outcomes.values()].reduce((sum, path) => sum + (path?.length ?? 0), 0);
      if (sample >= 0) {
        raw[sample] = rawCost;
        planner[sample] = plannerCost;
        admission[sample] = admissionCost;
        processing[sample] = processCost;
      }
    }
    const elapsedWallMs = performance.now() - began;
    scheduler.dispose();
    plannerDirect.dispose();
    plannerPipeline.dispose();
    assert.equal(tasks, cleanups);
    report.runs.push({
      repeat,
      observe,
      elapsedWallMs,
      syntheticSearchCpuMs: distribution(raw, 80),
      plannerFindRouteCpuMs: distribution(planner, 80),
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
}

for (const [file, hash] of Object.entries(sourceHashes))
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash)
    throw new Error(`Route planner source drift: ${file}`);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const perRun = (key) => report.runs.filter((run) => run[key]).map((run) => run[key].p95);
report.mediansP95 = {
  syntheticSearchCpuMs: median(perRun('syntheticSearchCpuMs')),
  plannerFindRouteCpuMs: median(perRun('plannerFindRouteCpuMs')),
  queueAdmissionCpuMs: median(perRun('queueAdmissionCpuMs')),
  fourTickProcessingCpuMs: median(perRun('fourTickProcessingCpuMs')),
};
report.addedCostMs = {
  plannerVsSyntheticP95:
    report.mediansP95.plannerFindRouteCpuMs - report.mediansP95.syntheticSearchCpuMs,
  pipelineAdmissionP95: report.mediansP95.queueAdmissionCpuMs,
  pipelineFourTickP95: report.mediansP95.fourTickProcessingCpuMs,
  note: 'Separate measured regions; never summed into a compound percentile.',
};

mkdirSync(evidence, { recursive: true });
writeFileSync(`${evidence}/route-planner-cost.json`, JSON.stringify(report, null, 2));
console.log(
  `041 route planner probe PASS: synthetic p95 ${report.mediansP95.syntheticSearchCpuMs}ms, ` +
    `planner p95 ${report.mediansP95.plannerFindRouteCpuMs}ms, ` +
    `admission p95 ${report.mediansP95.queueAdmissionCpuMs}ms, ` +
    `four-tick p95 ${report.mediansP95.fourTickProcessingCpuMs}ms`,
);
