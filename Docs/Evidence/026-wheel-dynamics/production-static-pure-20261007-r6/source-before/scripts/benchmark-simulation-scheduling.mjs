import { cpus, platform, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createFixedTickLoop } from '../src/simulation/fixed-tick.ts';
import { distribution } from '../src/telemetry/performance.ts';
import {
  schedulingFixture,
  unscheduledStep,
  referenceClockScenario,
  referenceStressScenario,
} from '../tests/simulation/scheduling-reference.ts';

const baseline = process.argv.includes('--baseline');
const root =
  'Docs/Evidence/219-simulation-scheduling' +
  (process.argv.includes('--corrected-core') ? '/corrected-core' : '');
const output = `${root}/${baseline ? 'before' : 'after'}.json`;
if (existsSync(output))
  throw new Error(
    'Evidence exists; preserve original before/after explicitly before another capture',
  );
if (baseline && existsSync('src/simulation/scheduling.ts'))
  throw new Error('Production scheduler already exists before baseline');
mkdirSync(root, { recursive: true });
const files = [
  'scripts/benchmark-simulation-scheduling.mjs',
  'tests/simulation/scheduling-reference.ts',
  'tests/autonomy/road-context-reference.ts',
  'tests/world/intersection-conflicts-fixture.ts',
  'tests/world/spatial-index-reference.ts',
  'package-lock.json',
  'Docs/performance-budgets.json',
];
for (const directory of [
  'src/simulation',
  'src/autonomy',
  'src/world',
  'src/vehicles',
  'src/sessions',
  'src/telemetry',
])
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith('.ts'))
    .sort())
    files.push(`${directory}/${file}`);
const sourceHashes = Object.fromEntries(
  files.map((file) => {
    const bytes = readFileSync(file),
      hash = createHash('sha256').update(bytes).digest('hex');
    const archive = `${root}/${baseline ? 'before' : 'after'}-source/${file}.txt`;
    mkdirSync(dirname(archive), { recursive: true });
    writeFileSync(archive, bytes);
    return [file, hash];
  }),
);
const scenarios = [30, 60, 120].map(referenceClockScenario);
if (
  !scenarios.every(
    (scenario) =>
      scenario.tick === 120 &&
      JSON.stringify(scenario.events) === JSON.stringify(scenarios[0].events),
  )
)
  throw new Error('Reference frame cadence changes authoritative trace');
const createScheduler = baseline
  ? null
  : (await import('../src/simulation/scheduling.ts')).createSimulationScheduler;
const report = {
  capturedAt: new Date().toISOString(),
  mode: baseline ? 'BEFORE_ALL_IN_PHASE' : 'AFTER_ENTITY_PHASED',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes,
  sourceHashScope:
    'Declared new harness/reference/fixtures and all top-level simulation/autonomy/world/vehicles/sessions/telemetry TS files; lock/budgets. Not a verified full transitive closure.',
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
  fixtureVersion: '219-context-scheduling-v1',
  protocol: {
    repetitions: 5,
    warmupTicks: 60,
    measuredTicks: 240,
    clock: 'synthetic60Hz',
    warmupSeconds: null,
    measuredSeconds: null,
    sampleCapacity: 240,
    bufferBytes: 9600,
    observer:
      'alternating paired off/on; reference tick and frame-admission timer in both, optional decision/route sub-timers on',
    workload:
      'normal70/overload110 actor contexts, static authored map plus real036 signal ticks; synthetic controller/physics counters and bounded033route search',
    seed: 'none; canonical fixture identities',
    scope:
      'Unpaced Node CPU supplement; no real frame/FPS/physical-controller/fullgame budget approval',
  },
  referenceClockScenarios: scenarios.map(({ events, ...state }) => ({
    ...state,
    eventCount: events.length,
    traceHash: createHash('sha256').update(JSON.stringify(events)).digest('hex'),
  })),
  referenceStressScenarios: ['hitch', 'background', 'urgent-selection-blockage'].map(
    referenceStressScenario,
  ),
  runs: [],
};
for (let repeat = 1; repeat <= 5; repeat++)
  for (const observe of repeat % 2 ? [false, true] : [true, false]) {
    const workloads = [];
    for (const dense of [false, true]) {
      const fixture = schedulingFixture(dense),
        tickSamples = new Float64Array(240),
        admissionSamples = new Float64Array(240),
        decisionSamples = new Float64Array(240),
        routeSamples = new Float64Array(240),
        decisionCounts = new Float64Array(240);
      let tick = 0,
        decisionCost = 0,
        routeCost = 0,
        inTickDecisions = 0;
      const ports = {
        ...fixture.ports,
        decision(actor, at, urgent) {
          const start = observe ? performance.now() : 0;
          fixture.ports.decision(actor, at, urgent);
          inTickDecisions++;
          if (observe) decisionCost += performance.now() - start;
          const routeStart = observe ? performance.now() : 0;
          fixture.route();
          if (observe) routeCost += performance.now() - routeStart;
        },
      };
      const scheduler = createScheduler?.({
        sessionId: fixture.frame.sessionId,
        worldEpoch: fixture.frame.worldEpoch,
        ports,
      });
      scheduler?.setActors(fixture.actors, {
        sessionId: fixture.frame.sessionId,
        worldEpoch: fixture.frame.worldEpoch,
      });
      const loop = createFixedTickLoop({
        captureSnapshot: () => ({ tick }),
        interpolate: (_a, b) => b,
        step({ tick: at }) {
          tick = at;
          decisionCost = 0;
          routeCost = 0;
          inTickDecisions = 0;
          const admissionStart = performance.now();
          fixture.prepare(at);
          const admissionCost = performance.now() - admissionStart;
          const start = performance.now();
          if (scheduler)
            scheduler.step({
              sessionId: fixture.frame.sessionId,
              worldEpoch: fixture.frame.worldEpoch,
              tick: at,
              dtSeconds: 1 / 60,
            });
          else unscheduledStep(fixture.actors, at, ports);
          const cost = performance.now() - start;
          if (at > 60) {
            const index = at - 61;
            if (index >= 240) throw new Error('Sample admission');
            tickSamples[index] = cost;
            admissionSamples[index] = admissionCost;
            decisionCounts[index] = inTickDecisions;
            if (observe) {
              decisionSamples[index] = decisionCost;
              routeSamples[index] = routeCost;
            }
          }
        },
      });
      global.gc?.();
      const heapBefore = process.memoryUsage().heapUsed,
        began = performance.now();
      loop.frame(0);
      for (let frame = 1; frame <= 300; frame++) loop.frame((frame * 1000) / 60);
      const elapsedWallMs = performance.now() - began,
        state = loop.getState(),
        counters = fixture.counters();
      if (
        state.tick !== 300 ||
        counters.controllers !== 300 * fixture.actors.length ||
        counters.physics !== 300 ||
        counters.decisions !== 50 * fixture.actors.length
      )
        throw new Error('Missing authoritative callbacks or periodic decisions');
      loop.dispose();
      scheduler?.dispose();
      fixture.dispose();
      global.gc?.();
      workloads.push({
        dense,
        actors: fixture.actors.length,
        identity: {
          sessionId: fixture.frame.sessionId,
          worldEpoch: fixture.frame.worldEpoch,
          firstMeasuredTick: 61,
          lastMeasuredTick: 300,
          actorIdentities: fixture.actors,
        },
        elapsedWallMs,
        tickCpuMs: distribution(tickSamples, 240),
        frameAdmissionCpuMs: distribution(admissionSamples, 240),
        decisionCpuMs: observe ? distribution(decisionSamples, 240) : null,
        routeCpuMs: observe ? distribution(routeSamples, 240) : null,
        decisionsPerTick: distribution(decisionCounts, 240),
        counters,
        simulatedSeconds: state.simulatedSeconds,
        admittedClockSeconds: state.activeRealSeconds,
        debtSeconds: state.debtSeconds,
        overloadCount: state.overloadCount,
        heapBeforeBytes: heapBefore,
        heapAfterBytes: process.memoryUsage().heapUsed,
      });
    }
    report.runs.push({ repeat, observe, workloads });
    console.log(`219 ${report.mode} ${repeat}/5 observer=${observe} complete`);
  }
if (baseline && existsSync('src/simulation/scheduling.ts'))
  throw new Error('Production scheduler appeared during baseline');
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`219 evidence saved ${output}`);
