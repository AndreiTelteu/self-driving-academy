import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { createLongitudinalController, evaluateStopPolicy } from '../src/autonomy/index.ts';
import { createFixedTickLoop } from '../src/simulation/fixed-tick.ts';
import { createSimulationScheduler } from '../src/simulation/scheduling.ts';
import {
  createPerformanceCollector,
  createPerformanceReport,
  distribution,
} from '../src/telemetry/performance.ts';
import { WorkerClient, WorkerResourceGovernor } from '../src/workers/index.ts';
import {
  EARLY_LOOP_ACTORS,
  EARLY_LOOP_FIXTURE_VERSION,
  EARLY_LOOP_SCOPE,
  STOP_OPPORTUNITY_COUNT,
  STOP_SEED,
  runEarlyLoopScenario,
} from '../tests/harness/early-loop-204-fixture.ts';
import { createLongitudinalTargetFixture } from '../tests/autonomy/longitudinal-target-fixture.ts';
import { GovernorMemoryStore } from '../tests/harness/governor-store.ts';

const outputDirectory = 'Docs/Evidence/204-early-learning-demo/loop-probe';
const WARMUP_FRAMES = 120;
const MEASURED_FRAMES = 600;
const REPEATS = 5;
const SEED = 204;
const inputs = [
  'scripts/run-204-loop-probe.mjs',
  'tests/harness/early-loop-204-fixture.ts',
  'tests/harness/early-loop-governor-task.ts',
  'tests/workers/early-loop-governor-thread.mjs',
  'src/learning/early-loop.ts',
  'src/learning/parameter-evidence.ts',
  'src/learning/speed-estimator.ts',
  'src/learning/acceleration-estimator.ts',
  'src/learning/stop-yield-estimator.ts',
  'src/autonomy/cruise-targets.ts',
  'src/autonomy/longitudinal-control.ts',
  'src/autonomy/stop-policy.ts',
  'src/simulation/fixed-tick.ts',
  'src/simulation/scheduling.ts',
  'src/telemetry/performance.ts',
  'src/workers/client.ts',
  'src/workers/governor.ts',
  'src/workers/protocol.ts',
  'src/workers/runtime.ts',
];
const hash = createHash('sha256');
for (const file of inputs) hash.update(file).update(readFileSync(file));

const scenario = runEarlyLoopScenario('prudent');
const scope = EARLY_LOOP_SCOPE;

function createLiveFixture() {
  const actors = EARLY_LOOP_ACTORS.map((actor) => ({
    id: actor.id,
    incarnation: actor.incarnation,
  }));
  const policy = createLongitudinalController(scope);
  policy.setActors(actors, scope);
  const fixtures = EARLY_LOOP_ACTORS.map((actor) =>
    createLongitudinalTargetFixture(
      scenario.tokens.cruise,
      { id: actor.id, incarnation: actor.incarnation },
      scope,
    ),
  );
  const entries = new Map();
  EARLY_LOOP_ACTORS.forEach((actor, index) => {
    entries.set(actor.id, {
      actor,
      fixture: fixtures[index],
      target: null,
      speed: 0,
      acceleration: 0,
    });
  });
  const milliseconds = { decision: 0, controller: 0, physics: 0 };
  let stopCalls = 0;
  return {
    actors,
    decision(actor, tick) {
      const began = performance.now();
      const entry = entries.get(actor.id);
      entry.target = entry.fixture.target(tick, false, entry.actor.classId);
      evaluateStopPolicy({
        ...scope,
        actor,
        decisionTick: tick,
        seed: STOP_SEED,
        profile: scenario.tokens.stop,
        observation: {
          version: '051-stop-observation-v1',
          units: 'SI',
          tick,
          opportunityId: `stop-op-${String((tick % STOP_OPPORTUNITY_COUNT) + 1).padStart(2, '0')}`,
          stopLineId: 'stop-line-01',
          distanceToStopLineM: 30,
          speedMps: entry.speed,
          stationaryDurationS: null,
          crossed: false,
        },
        leaderStop: 'NONE',
      });
      stopCalls++;
      milliseconds.decision += performance.now() - began;
    },
    controller(actor, tick) {
      const began = performance.now();
      const entry = entries.get(actor.id);
      if (entry.target) {
        const step = policy.step({
          ...scope,
          actor,
          tick,
          authority: 'AUTO',
          profile: scenario.tokens.longitudinal,
          target: entry.target,
          observation: {
            version: '047-observation-v1',
            units: 'SI',
            ...scope,
            actor,
            tick,
            longitudinalSpeedMps: entry.speed,
            classId: entry.actor.classId,
            classVersion: '023-mechanics-v1',
          },
        });
        entry.acceleration = step.accelerationMps2;
      }
      milliseconds.controller += performance.now() - began;
    },
    physics(_tick, dtSeconds) {
      const began = performance.now();
      for (const entry of entries.values())
        entry.speed = Math.min(30, Math.max(0, entry.speed + entry.acceleration * dtSeconds));
      milliseconds.physics += performance.now() - began;
    },
    get milliseconds() {
      return milliseconds;
    },
    get stopCalls() {
      return stopCalls;
    },
    dispose() {
      for (const fixture of fixtures) fixture.dispose();
      policy.dispose();
    },
  };
}

function runArm(enabled) {
  const live = createLiveFixture();
  let schedulerTick = 0;
  let measuring = false;
  let frameStepMs = 0;
  const costs = {
    total: [],
    own: [],
    decision: [],
    controller: [],
    physics: [],
    debt: [],
  };
  const scheduler = createSimulationScheduler({
    ...scope,
    initialTick: 0,
    ports: {
      input: () => undefined,
      decision: (actor, tick) => {
        live.decision(actor, tick);
      },
      controller: (actor, tick, dtSeconds) => {
        live.controller(actor, tick, dtSeconds);
      },
      physics: (tick, dtSeconds) => {
        live.physics(tick, dtSeconds);
      },
    },
  });
  scheduler.setActors(live.actors, scope);
  const loop = createFixedTickLoop({
    initialTick: 0,
    captureSnapshot: () => ({ tick: schedulerTick }),
    step: (step) => {
      const before = { ...live.milliseconds };
      frameStepMs = 0;
      const began = performance.now();
      scheduler.step({ ...scope, tick: step.tick, dtSeconds: step.dtSeconds });
      const elapsed = performance.now() - began;
      const ports =
        live.milliseconds.decision -
        before.decision +
        (live.milliseconds.controller - before.controller) +
        (live.milliseconds.physics - before.physics);
      frameStepMs = elapsed;
      if (measuring) {
        costs.total.push(elapsed);
        costs.own.push(Math.max(0, elapsed - ports));
        costs.decision.push(live.milliseconds.decision - before.decision);
        costs.controller.push(live.milliseconds.controller - before.controller);
        costs.physics.push(live.milliseconds.physics - before.physics);
      }
      schedulerTick = step.tick;
    },
    interpolate: (_previous, current) => current,
  });
  loop.frame(0);
  const warmupStart = performance.now();
  for (let frame = 1; frame <= WARMUP_FRAMES; frame++) loop.frame(frame * (1000 / 60));
  const warmupMs = performance.now() - warmupStart;
  const collector = createPerformanceCollector(MEASURED_FRAMES, enabled);
  const reference = new Float64Array(MEASURED_FRAMES);
  measuring = true;
  const measuredStart = performance.now();
  for (let index = 1; index <= MEASURED_FRAMES; index++) {
    const began = performance.now();
    const frame = loop.frame((WARMUP_FRAMES + index) * (1000 / 60));
    const elapsed = performance.now() - began;
    reference[index - 1] = elapsed;
    const debtMs = frame.state.debtSeconds * 1000;
    costs.debt.push(debtMs);
    collector.record('frameMs', elapsed);
    collector.record('mainThreadMs', elapsed);
    collector.record('simulationCpuMs', frameStepMs);
    collector.record('debtMs', debtMs);
  }
  const measuredMs = performance.now() - measuredStart;
  const state = loop.getState();
  const retainedSnapshotsBeforeDispose = state.snapshots === null ? 0 : 2;
  const schedulerStats = scheduler.getStats();
  loop.dispose();
  const retainedSnapshotsAfterDispose = loop.getState().snapshots === null ? 0 : 2;
  live.dispose();
  scheduler.dispose();
  return {
    enabled,
    warmupMs,
    measuredMs,
    totalMs: warmupMs + measuredMs,
    state,
    collector: collector.finish(),
    reference: distribution(reference, MEASURED_FRAMES),
    simulation: {
      clock: 'synthetic',
      measuredWallSeconds: measuredMs / 1000,
      simulatedSeconds: state.simulatedSeconds,
      admittedClockSeconds: state.activeRealSeconds,
      ratio: state.activeRealSeconds > 0 ? state.simulatedSeconds / state.activeRealSeconds : null,
      tick: state.tick,
      overloads: state.overloadCount,
    },
    resources: {
      actors: schedulerStats.actors,
      routeJobs: schedulerStats.routeJobs,
      routeCache: schedulerStats.routeCache,
      stopPolicyCalls: live.stopCalls,
      retainedSnapshotsBeforeDispose,
      retainedSnapshotsAfterDispose,
      exactPageMemoryBytes: null,
    },
    costs,
  };
}

const arms = [];
const runs = [];
for (let repeat = 1; repeat <= REPEATS; repeat++) {
  for (const enabled of repeat % 2 ? [false, true] : [true, false]) {
    const arm = runArm(enabled);
    if (arm.state.tick !== WARMUP_FRAMES + MEASURED_FRAMES)
      throw new Error(`204 frame fixture stopped at tick ${arm.state.tick}`);
    arms.push(arm);
    runs.push({
      repeat,
      seed: SEED,
      enabled,
      warmupMs: arm.warmupMs,
      activeDurationMs: arm.measuredMs,
      wallDurationMs: arm.totalMs,
      collector: arm.collector,
      referenceCpuMs: arm.reference,
      referenceFrameMs: null,
      simulation: arm.simulation,
      resources: arm.resources,
    });
  }
}

const report = createPerformanceReport({
  role: 'portable-cpu',
  identity: {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceHash: hash.digest('hex'),
    budgetVersion: '203-initial-1',
    fixtureVersion: EARLY_LOOP_FIXTURE_VERSION,
    engineVersion: '204-fixture-engine',
    physicsVersion: null,
    mapVersion: '044-context-cross-v1',
    seeds: [SEED],
    hardware: {
      cpu: cpus()[0]?.model ?? null,
      logicalCpus: cpus().length,
      ramBytes: totalmem(),
      os: `${platform()} ${release()}`,
      runtime: process.version,
      inputs,
    },
    browser: null,
    backend: 'Node CPU; synthetic 60Hz clock',
    preset: 'not applicable',
    cssResolution: null,
    internalResolution: null,
    devicePixelRatio: null,
    cache: 'warm JS after one identical pass per arm',
    network: 'not applicable',
    powerState: 'not captured; portable CPU probe',
  },
  scope:
    '204 early loop fixture: 3 taxis + 2 civilians, authored 044 road context, 046/047/051 callbacks under the 219 scheduler and 008 fixed-tick loop after one 093/094/095/098 compose/compile; synthetic 60Hz clock, no Rapier, renderer, GPU or hardware FPS',
  coldLoad: [],
  warmLoad: [],
  runs,
  unavailable: {
    gpu: 'No renderer/API',
    frame: 'Synthetic clock is not hardware display cadence',
    input: 'No player input stream in the 204 fixture',
    learningEstimators:
      'Estimators are measured by the native behaviour driver; the frame arm calls 046/047/051',
    memory: 'Exact page memory unavailable; owned collector/snapshots reported',
    physics: 'The 204 fixture publishes a kinematic speed state, not a Rapier world',
  },
  exclusions: [
    'Frame/main-thread values are Node CPU execution cost, not FPS or display latency',
    'No browser, GPU, laptop, soak or gameplay budget is validated by this probe',
    'Scheduler-own cost excludes the injected 044/045/046/047/051 callback work',
  ],
});

const enabledArms = arms.filter((arm) => arm.enabled);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const distributionOf = (values) => {
  if (!values.length) return null;
  const samples = Float64Array.from(values);
  return distribution(samples, samples.length);
};
const combined = (name) => enabledArms.flatMap((arm) => arm.costs[name]);
const frameRuns = enabledArms.map((arm) => ({
  warmupMs: arm.warmupMs,
  activeDurationMs: arm.measuredMs,
  frame: arm.collector.metrics.frameMs.distribution,
  mainThread: arm.collector.metrics.mainThreadMs.distribution,
  simulationCpu: arm.collector.metrics.simulationCpuMs.distribution,
  debt: arm.collector.metrics.debtMs.distribution,
  overloads: arm.simulation.overloads,
}));
const frameAggregate = {
  frameP50MedianMs: median(frameRuns.map((run) => run.frame.p50)),
  frameP95MedianMs: median(frameRuns.map((run) => run.frame.p95)),
  frameP99MedianMs: median(frameRuns.map((run) => run.frame.p99)),
  mainThreadP50MedianMs: median(frameRuns.map((run) => run.mainThread.p50)),
  mainThreadP95MedianMs: median(frameRuns.map((run) => run.mainThread.p95)),
  mainThreadP99MedianMs: median(frameRuns.map((run) => run.mainThread.p99)),
  schedulerTotalP95MedianMs: median(enabledArms.map((arm) => distributionOf(arm.costs.total).p95)),
};
const scheduler = {
  stepTotalMs: distributionOf(combined('total')),
  schedulerOwnMs: distributionOf(combined('own')),
  decisionCallbackMs: distributionOf(combined('decision')),
  controllerCallbackMs: distributionOf(combined('controller')),
  physicsCallbackMs: distributionOf(combined('physics')),
  debtMs: distributionOf(combined('debt')),
  debtP95MedianMs: median(enabledArms.map((arm) => distributionOf(arm.costs.debt).p95)),
  debtP99MedianMs: median(enabledArms.map((arm) => distributionOf(arm.costs.debt).p99)),
  overloads: enabledArms.reduce((sum, arm) => sum + arm.simulation.overloads, 0),
  stats: enabledArms[0].resources,
};

async function runWorkerProbe() {
  const worker = new Worker(
    new URL('../tests/workers/early-loop-governor-thread.mjs', import.meta.url),
    {
      execArgv: ['--import', new URL('./register-typescript.mjs', import.meta.url).href],
    },
  );
  let transferCount = 0;
  const port = {
    send: (packet, transfers) => {
      worker.postMessage(packet, [...transfers]);
      if (transfers.length) {
        transferCount++;
        if (packet.buffer.byteLength !== 0) throw new Error('Private transfer not detached');
      }
    },
    listen: (message, error) => {
      worker.on('message', message);
      worker.on('error', error);
      return () => {
        worker.off('message', message);
        worker.off('error', error);
      };
    },
  };
  const identity = {
    baseVersionId: scenario.tokens.profile.versionId,
    profileId: scenario.tokens.profile.profileId,
    learningEpoch: 1,
    sessionId: '204-loop-probe',
    worldEpoch: 1,
  };
  const client = new WorkerClient(port, () => identity);
  const store = new GovernorMemoryStore();
  const governor = new WorkerResourceGovernor(client, store);
  const payload = new Float64Array([
    scenario.composed.values.speed_delta_urban.base,
    scenario.composed.values.speed_delta_urban.candidate,
    scenario.composed.values.speed_delta_urban.quality,
    scenario.composed.values.desired_acceleration.base,
    scenario.composed.values.desired_acceleration.candidate,
    scenario.composed.values.desired_acceleration.quality,
    scenario.composed.values.stop_full_probability.base,
    scenario.composed.values.stop_full_probability.candidate,
    scenario.composed.values.stop_full_probability.quality,
  ]);
  const make = (prefix, index) => {
    const buffer = payload.slice().buffer;
    return {
      ...identity,
      jobId: '1',
      segmentId: `${prefix}-${String(index + 1).padStart(2, '0')}`,
      priority: 'interactive',
      buffer,
      payloadBytes: buffer.byteLength,
      type: 'start',
      sequence: 0,
      ownership: 'transfer',
    };
  };
  const batch = async (prefix, count) => {
    const admissions = await Promise.all(
      Array.from({ length: count }, (_unused, index) =>
        governor.submit(make(prefix, index), 'learning'),
      ),
    );
    if (admissions.some((admission) => admission.status !== 'PENDING' || !admission.ticket))
      throw new Error('204 worker admission was refused');
    const outcomes = await Promise.all(admissions.map((admission) => admission.ticket.outcome));
    if (outcomes.some((outcome) => outcome.status !== 'result'))
      throw new Error('204 worker job did not return a result');
    return { admissions, outcomes };
  };
  try {
    const created = performance.now();
    const warmup = await batch('204-early-warmup', 2);
    const startupMs = performance.now() - created;
    for (const admission of warmup.admissions) await governor.acknowledge(admission.ticket.key);
    const measured = await batch('204-early-segment', 8);
    const results = measured.outcomes.map((outcome) =>
      Array.from(new Float64Array(outcome.packet.buffer)),
    );
    const expected = [
      scenario.tokens.cruise.values.speed_delta_urban,
      scenario.tokens.longitudinal.values.desired_acceleration,
      scenario.tokens.stop.stopFullProbability,
      scenario.tokens.stop.stopDwellTimeS,
    ];
    for (const result of results)
      for (let index = 0; index < expected.length; index++)
        if (Math.abs(result[index] - expected[index]) > 1e-9)
          throw new Error(`204 worker result mismatch at ${index}`);
    const measurements = governor.measurements.slice(-8);
    if (measurements.length !== 8) throw new Error('Expected eight 204 worker measurements');
    const completed = await governor.completed();
    if (completed.length !== 8) throw new Error('Protected 204 results were not retained');
    for (const admission of measured.admissions) await governor.acknowledge(admission.ticket.key);
    const usageAfterAcknowledgement = governor.usage;
    const storeAfterAcknowledgement = store.usage;
    const samples = {
      queueMs: measurements.map((sample) => sample.queueMs),
      serviceMs: measurements.map((sample) => sample.serviceMs),
      endToEndMs: measurements.map((sample) => sample.endToEndMs),
    };
    return {
      jobs: 8,
      warmupJobs: 2,
      startupMs,
      admissions: measured.admissions.map((admission) => admission.status),
      statuses: measured.outcomes.map((outcome) => outcome.status),
      transferCount,
      completedCount: completed.length,
      results,
      queueMs: distributionOf(samples.queueMs),
      serviceMs: distributionOf(samples.serviceMs),
      endToEndMs: distributionOf(samples.endToEndMs),
      usageAfterAcknowledgement,
      storeAfterAcknowledgement,
      measurements,
    };
  } finally {
    governor.dispose();
    await worker.terminate();
  }
}

const workerProbe = await runWorkerProbe();
const probe = {
  schemaVersion: 1,
  label: 'PROVISIONAL_UNCALIBRATED',
  capturedAt: new Date().toISOString(),
  fixture: EARLY_LOOP_FIXTURE_VERSION,
  commit: report.identity.commit,
  sourceHash: report.identity.sourceHash,
  inputs,
  scope: report.scope,
  protocol: {
    warmupFrames: WARMUP_FRAMES,
    measuredFrames: MEASURED_FRAMES,
    repeats: REPEATS,
    pairedArms: 'collector enabled/disabled, alternating order',
    seed: SEED,
    actors: EARLY_LOOP_ACTORS.map((actor) => ({
      id: actor.id,
      kind: actor.kind,
      classId: actor.classId,
    })),
    schedulerDecisionPhase: '219 entity-ID 10Hz distribution',
    workerJobs: 8,
  },
  frame218: {
    aggregate: frameAggregate,
    enabledRuns: frameRuns,
    collector: {
      enabledArms: enabledArms.length,
      capacityPerMetric: MEASURED_FRAMES,
      complete: enabledArms.every((arm) => arm.collector.complete),
    },
  },
  scheduler219: {
    stepTotalMs: scheduler.stepTotalMs,
    schedulerOwnMs: scheduler.schedulerOwnMs,
    decisionCallbackMs: scheduler.decisionCallbackMs,
    controllerCallbackMs: scheduler.controllerCallbackMs,
    physicsCallbackMs: scheduler.physicsCallbackMs,
    debtMs: scheduler.debtMs,
    debtP95MedianMs: scheduler.debtP95MedianMs,
    debtP99MedianMs: scheduler.debtP99MedianMs,
    overloads: scheduler.overloads,
    stats: scheduler.stats,
  },
  worker221: workerProbe,
  performanceReport: report,
  exportConstraints: [],
  limitations: [
    'Node CPU only; no browser, GPU, FPS, laptop, soak or gameplay gate is measured',
    'The fixed tick is synthetic 60Hz; debt/overload are reported from that clock',
    'The fixture publishes a kinematic speed state instead of a Rapier world',
    'The 221 worker task runs the real 204 compose/compile on estimator candidates; ledger/estimator work stays on the main thread',
    'Zero playtest participants exist; this probe is not participant evidence',
  ],
};

let singleRunError = null;
try {
  createPerformanceReport({
    ...report,
    runs: [runs[0]],
  });
} catch (error) {
  singleRunError = error instanceof Error ? error.message : String(error);
}
probe.exportConstraints.push({
  export: 'createPerformanceReport',
  attempted: 'single-arm 204 run',
  error: singleRunError,
  resolution:
    'The export accepts the 204 workload only as complete paired repetitions; five real pairs were delivered above.',
});

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(`${outputDirectory}/probe.json`, `${JSON.stringify(probe, null, 2)}\n`);

const format = (value) => (value === null ? 'unavailable' : value.toFixed(6));
const formatDebt = (value) =>
  value === null ? 'unavailable' : value === 0 ? '0' : value.toExponential(3);
const lines = [
  '# PBI 204 first-loop probe (218/219/221)',
  '',
  '**PROVISIONAL_UNCALIBRATED.** Measured on Node CPU only. These numbers are not FPS, GPU, laptop, gameplay or release evidence.',
  '',
  `Fixture: \`${EARLY_LOOP_FIXTURE_VERSION}\`; 3 taxis + 2 civilians; authored 044 road context. The 093/094/095/098 -> compose/compile chain runs once; then 046/047/051 callbacks run under the 219 scheduler and the 008 fixed-tick loop. Commit: \`${probe.commit}\`.`,
  '',
  '## 218 performance harness',
  '',
  'Five enabled/disabled pairs, alternating order, 120 warmup frames and 600 measured frames per arm. `frameMs`/`mainThreadMs` are the wall cost of one synthetic frame; display cadence is unavailable.',
  '',
  '| Enabled run | frame p50 | frame p95 | frame p99 | main p95 | main p99 | debt p95 | overloads |',
  '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
];
frameRuns.forEach((run, index) => {
  lines.push(
    `| ${index + 1} | ${format(run.frame.p50)} | ${format(run.frame.p95)} | ${format(run.frame.p99)} | ${format(run.mainThread.p95)} | ${format(run.mainThread.p99)} | ${formatDebt(run.debt.p95)} | ${run.overloads} |`,
  );
});
lines.push(
  '',
  `Median across the five enabled arms: frame p50 ${format(frameAggregate.frameP50MedianMs)} ms, p95 ${format(frameAggregate.frameP95MedianMs)} ms, p99 ${format(frameAggregate.frameP99MedianMs)} ms; main-thread p50 ${format(frameAggregate.mainThreadP50MedianMs)} ms, p95 ${format(frameAggregate.mainThreadP95MedianMs)} ms, p99 ${format(frameAggregate.mainThreadP99MedianMs)} ms.`,
  '',
  'Collector overflow/dropped: none (`complete` for every enabled arm).',
  '',
  '## 219 scheduler',
  '',
  '| Metric | p50 | p95 | p99 | max |',
  '| --- | ---: | ---: | ---: | ---: |',
);
for (const [label, value] of [
  ['step total (callbacks + scheduler)', scheduler.stepTotalMs],
  ['scheduler own (excludes 044/045/046/047/051)', scheduler.schedulerOwnMs],
  ['decision callback (044/045/046/051)', scheduler.decisionCallbackMs],
  ['controller callback (047)', scheduler.controllerCallbackMs],
  ['physics callback (kinematic state)', scheduler.physicsCallbackMs],
]) {
  lines.push(
    `| ${label} | ${format(value.p50)} | ${format(value.p95)} | ${format(value.p99)} | ${format(value.max)} |`,
  );
}
lines.push(
  '',
  `Debt: p95 ${formatDebt(scheduler.debtP95MedianMs)} ms, p99 ${formatDebt(scheduler.debtP99MedianMs)} ms; combined ${scheduler.debtMs.count} fixed-tick samples with max ${formatDebt(scheduler.debtMs.max)} ms. Overloads: ${scheduler.overloads}. Scheduler stats after the measured arms: ${JSON.stringify(scheduler.stats)}.`,
  '',
  '## 221 worker governor',
  '',
  `Two warmup jobs absorb worker startup (${format(workerProbe.startupMs)} ms) and are acknowledged before measurement. Eight concurrent \`learning\` submissions then go to one real \`worker_threads\` runtime; each job runs the real 204 compose/compile on the estimator candidates. Admissions: ${workerProbe.admissions.join(', ')}; outcomes: ${workerProbe.statuses.join(', ')}; transfers: ${workerProbe.transferCount}.`,
  '',
  '| Metric | p50 | p95 | p99 | max | count |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
);
for (const [label, value] of [
  ['queue', workerProbe.queueMs],
  ['service', workerProbe.serviceMs],
  ['end-to-end', workerProbe.endToEndMs],
]) {
  lines.push(
    `| ${label} | ${format(value.p50)} | ${format(value.p95)} | ${format(value.p99)} | ${format(value.max)} | ${value.count} |`,
  );
}
lines.push(
  '',
  `Protected results retained: ${workerProbe.completedCount}/8; store after acknowledgement: ${JSON.stringify(workerProbe.storeAfterAcknowledgement)}; governor usage after acknowledgement: jobs ${workerProbe.usageAfterAcknowledgement.jobs}, bytes ${workerProbe.usageAfterAcknowledgement.bytes}.`,
  '',
  '## Export constraints',
  '',
  `- \`createPerformanceReport\` with a single 204 arm: ${singleRunError ?? 'accepted'}. The export requires complete paired repetitions; five real pairs were delivered.`,
  '- No other 218/219/221 export rejected the 204 workload. `createFixedTickLoop`, `createSimulationScheduler`, `WorkerClient` and `WorkerResourceGovernor` accepted the fixture directly.',
  '',
  '## Limitations',
  '',
  ...probe.limitations.map((item) => `- ${item}`),
  '',
  'Zero real playtest participants exist. This probe says nothing about the five-participant target.',
  '',
);
writeFileSync(`${outputDirectory}/summary.md`, `${lines.join('\n')}`);

console.log(
  JSON.stringify(
    {
      output: `${outputDirectory}/probe.json`,
      summary: `${outputDirectory}/summary.md`,
      frame: frameAggregate,
      scheduler: {
        stepTotalP95Ms: scheduler.stepTotalMs?.p95,
        schedulerOwnP95Ms: scheduler.schedulerOwnMs?.p95,
        debtP95MedianMs: scheduler.debtP95MedianMs,
        overloads: scheduler.overloads,
      },
      worker: {
        queueP95Ms: workerProbe.queueMs.p95,
        serviceP95Ms: workerProbe.serviceMs.p95,
        endToEndP95Ms: workerProbe.endToEndMs.p95,
        completed: workerProbe.completedCount,
      },
      singleRunError,
    },
    null,
    2,
  ),
);
