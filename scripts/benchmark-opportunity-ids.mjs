// PBI 086 native probe: added cost and owned memory of the opportunity registry.
//
// Fixture: reused from 044/085 (`tests/autonomy/road-context-reference.ts` `roadContextFixture(false)`)
// so the lane graph, intersections and the real 036 signal controller come from the authoritative
// world modules, plus the real 025 keyboard filter for raw/filtered input. No renderer, no browser,
// no DOM, no second harness.
//
// The 044 fixture has no STOP stop line, so the real 037 *event contract* is injected with
// `parseSimulationEvent` and 037's own `createStableId('stop-opportunity', ...)` identity, one
// approach every 180 ticks; the real 038 yield occurrence is injected through the registry's
// stimulus port with 038's `priority-yield` identity. Both are labelled in the report.
//
// Usage (sequential, one arm at a time):
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-opportunity-ids.mjs --baseline
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-opportunity-ids.mjs
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { createRoadContext } from '../src/autonomy/index.ts';
import { createSignalController } from '../src/world/index.ts';
import { createEventBus, parseSimulationEvent } from '../src/simulation/index.ts';
import { createKeyboardFilter } from '../src/vehicles/index.ts';
import { createDefaultSettings } from '../src/settings/index.ts';
import { createStableId } from '../src/sessions/index.ts';

const baseline = process.argv.includes('--baseline');
const telemetry = baseline ? null : await import('../src/telemetry/index.ts');

const EVIDENCE = 'Docs/Evidence/086-opportunity-ids';
const SUBJECT = 'vehicle-0';
const FIXTURE_VERSION = '086-opportunity-ids-native-v1';
const MOVEMENT = 'west-straight';
const SIGNAL = 'fixture-signal';
const MAP_ID = '044-context-cross-v1';
const WARMUP_ITERATIONS = 200;
const MEASURED_ITERATIONS = 600;
const REPETITIONS = 5;
const MEMORY_ITERATIONS = 5120;
const APPROACH_PERIOD = 180;
const WORLD = { schemaVersion: 1, units: 'SI', sessionId: 'academy-1', worldEpoch: 2 };
const STOP_WORLD = { sessionId: WORLD.sessionId, worldEpoch: WORLD.worldEpoch };
const INCARNATION = 1;

const sources = [
  'scripts/benchmark-opportunity-ids.mjs',
  'src/telemetry/opportunities.ts',
  'src/sessions/identity.ts',
  'src/world/signals.ts',
  'src/autonomy/road-context.ts',
  'src/vehicles/keyboard-filter.ts',
  'tests/autonomy/road-context-reference.ts',
  'tests/world/intersection-conflicts-fixture.ts',
];

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const percentile = (sorted, fraction) => sorted[Math.floor((sorted.length - 1) * fraction)] ?? null;
const summary = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    mean: sorted.length ? sorted.reduce((total, value) => total + value, 0) / sorted.length : null,
  };
};

function powerScheme() {
  try {
    return platform() === 'win32'
      ? execFileSync('powercfg', ['/getactivescheme'], { encoding: 'utf8' }).trim()
      : null;
  } catch {
    return null;
  }
}

function buildHarness() {
  const fixture = roadContextFixture(false);
  const { map, policy, frame } = fixture;
  const bus = createEventBus(WORLD);
  const signals = createSignalController(map, { context: WORLD, eventBus: bus });
  const engine = createRoadContext(map, {
    priorityPolicy: policy,
    decisionPeriodTicks: 6,
    queryRadiusM: 60,
  });
  const filter = createKeyboardFilter(
    WORLD,
    SUBJECT,
    createDefaultSettings('086-probe').input.control,
    0,
  );
  return { fixture, map, frame, signals, engine, filter };
}

/** Real 037 identity and payload shape, built from the authoritative 006 identity contract. */
function stopEvents(tick) {
  const opportunityId = createStableId('stop-opportunity', STOP_WORLD.sessionId, [
    String(STOP_WORLD.worldEpoch),
    SUBJECT,
    String(INCARNATION),
    'fixture-stop-line',
    String(tick),
  ]);
  const at = (offset, type, payload) =>
    parseSimulationEvent({
      ...WORLD,
      tick: tick + offset,
      entityIds: [SUBJECT],
      type,
      eventId: createStableId(`${type}-event`, STOP_WORLD.sessionId, [
        String(STOP_WORLD.worldEpoch),
        SUBJECT,
        String(tick),
        String(offset),
      ]),
      payload,
    });
  return [
    at(0, 'STOP_APPROACH', { vehicleId: SUBJECT, opportunityId, stopLineId: 'fixture-stop-line' }),
    at(60, 'FULL_STOP', { vehicleId: SUBJECT, opportunityId, durationS: 1 }),
    at(65, 'STOP_LINE_CROSSED', {
      vehicleId: SUBJECT,
      opportunityId,
      stopLineId: 'fixture-stop-line',
    }),
  ];
}

/** Real 038 yield occurrence identity. */
function yieldStimulus(tick) {
  return {
    kind: 'YIELD',
    tick,
    sourceKey: createStableId('priority-yield', STOP_WORLD.sessionId, [
      String(STOP_WORLD.worldEpoch),
      MAP_ID,
      'fixture-policy-v1',
      SUBJECT,
      String(INCARNATION),
      String(tick),
    ]),
    relatedIds: ['junction', MOVEMENT],
  };
}

/** The 037 events whose own tick is exactly this tick, for the approach that started at `base`. */
function eventsAtTick(tick) {
  const phase = tick % APPROACH_PERIOD;
  if (phase !== 40 && phase !== 100 && phase !== 105) return [];
  const base = tick - (phase - 40);
  return stopEvents(base).filter((event) => event.tick === tick);
}

// Advances the authoritative world and returns one fixed-tick registry observation.
function observe(harness, tick) {
  const { map, frame, signals, engine, filter } = harness;
  signals.step(tick);
  frame.tick = tick;
  frame.signals = map.intersections[0].movements.map((movement) =>
    signals.getMovementSignal('junction', movement.id),
  );
  const actor = frame.vehicles.find((candidate) => candidate.id === SUBJECT);
  actor.positionM = { ...actor.positionM, x: actor.positionM.x + 0.02 };
  engine.updateFrame(frame);
  const context = engine.getContext(SUBJECT, { force: true });
  filter.setAction('throttle', tick % 120 < 60);
  filter.setAction('brake', tick % 120 >= 90);
  const inputFrame = filter.step({ tick, dtSeconds: 1 / 60, speedMps: actor.speedMps });
  const movement = signals.getMovementSignal('junction', MOVEMENT);
  const snapshot = signals.getSignal(SIGNAL);
  const events = eventsAtTick(tick);
  const stimuli = tick % APPROACH_PERIOD === 100 ? [yieldStimulus(tick)] : [];
  return {
    observation: {
      tick,
      sessionId: WORLD.sessionId,
      worldEpoch: WORLD.worldEpoch,
      segmentId: 'probe-segment',
      learningEligible: false,
      vehicleId: SUBJECT,
      incarnation: String(INCARNATION),
      signal:
        movement && snapshot
          ? {
              signalId: movement.signalId,
              intersectionId: movement.intersectionId,
              phaseId: movement.phaseId,
              movementId: movement.movementId,
              state: movement.state,
              phaseStartedTick: snapshot.phaseStartedTick,
            }
          : null,
      events,
      stimuli,
      conclusions: [],
    },
    inputType: inputFrame.command.source,
    laneId: context.laneId,
  };
}

// Arm: identical world/observation work in both arms; only the registry calls differ.
function runArm(enabled, repetition, sink) {
  const harness = buildHarness();
  const registry = enabled ? telemetry.createOpportunityRegistry() : null;
  const samples = [];
  const worldSamples = [];
  let resolves = 0;
  let observations = 0;
  global.gc?.();
  const wallStart = performance.now();
  for (let iteration = 0; iteration < WARMUP_ITERATIONS + MEASURED_ITERATIONS; iteration += 1) {
    const tick = iteration + 1;
    const worldStart = performance.now();
    const { observation } = observe(harness, tick);
    const worldMs = performance.now() - worldStart;
    const started = performance.now();
    if (registry) {
      registry.observe(observation);
      // A real conclusion path: the 052 owner resolves the yield through its id.
      if (tick % APPROACH_PERIOD === 100) {
        const entered = registry.findEntered('YIELD', SUBJECT, String(INCARNATION));
        if (entered) {
          registry.conclude({ tick, opportunityId: entered.id, outcome: 'YIELDED' });
          resolves += 1;
        }
      }
      observations += 1;
    }
    const elapsed = performance.now() - started;
    if (iteration >= WARMUP_ITERATIONS) {
      samples.push(elapsed);
      worldSamples.push(worldMs);
      if (sink && sink.length < 50) sink.push(observation);
    }
  }
  const wallMs = performance.now() - wallStart;
  const stats = registry ? registry.getStats() : null;
  const denominators = registry ? registry.getDenominators() : null;
  if (registry) registry.dispose();
  return {
    repetition,
    enabled,
    observeLoopMs: summary(samples),
    worldBuildMs: summary(worldSamples),
    wallMs,
    resolves,
    observations,
    heapAfterBytes: process.memoryUsage().heapUsed,
    registryOwnership: stats,
    denominators,
  };
}

let guard = 0;
function checksumGuard(value) {
  guard = (guard + value) % 1000003;
}

// Separate, clearly labelled region: per-tick JSON serialization versus the registry call.
function measureJsonRegion() {
  const harness = buildHarness();
  const frames = [];
  for (let iteration = 0; iteration < 500; iteration += 1) {
    frames.push(observe(harness, iteration + 1).observation);
  }
  const registry = telemetry.createOpportunityRegistry();
  const jsonSamples = [];
  const observeSamples = [];
  for (const frame of frames) {
    const jsonStart = performance.now();
    const encoded = JSON.stringify(frame);
    jsonSamples.push(performance.now() - jsonStart);
    checksumGuard(encoded.length);
    const observeStart = performance.now();
    registry.observe(frame);
    observeSamples.push(performance.now() - observeStart);
  }
  const stats = registry.getStats();
  registry.dispose();
  const jsonP95 = summary(jsonSamples).p95;
  const observeP95 = summary(observeSamples).p95;
  return {
    label: 'JSON_REGION_NOT_PART_OF_HOT_PATH_DELTA',
    iterations: frames.length,
    jsonStringifyMs: summary(jsonSamples),
    registryObserveMs: summary(observeSamples),
    ratioJsonOverRegistry: jsonP95 !== null && observeP95 ? jsonP95 / observeP95 : null,
    registryOwnership: stats,
  };
}

// Separate, clearly labelled region: measured owned memory of the bounded store.
function measureMemoryRegion() {
  global.gc?.();
  const before = process.memoryUsage();
  const registry = telemetry.createOpportunityRegistry();
  const afterCreate = process.memoryUsage();
  for (let index = 0; index < MEMORY_ITERATIONS; index += 1) {
    const tick = index + 1;
    registry.observe({
      tick,
      sessionId: WORLD.sessionId,
      worldEpoch: WORLD.worldEpoch,
      segmentId: 'memory-segment',
      learningEligible: false,
      vehicleId: `vehicle-${index}`,
      incarnation: String(INCARNATION),
      signal: null,
      events: [stopEvents(tick)[0]],
      stimuli: [],
      conclusions: [],
    });
    const id = registry.findEntered('STOP', `vehicle-${index}`, String(INCARNATION));
    if (id) registry.conclude({ tick, opportunityId: id.id, outcome: 'STOPPED' });
  }
  const afterFill = process.memoryUsage();
  const stats = registry.getStats();
  registry.dispose();
  const afterDispose = process.memoryUsage();
  const disposed = registry.getStats();
  return {
    label: 'MEMORY_REGION_EXACT_OWNERSHIP_COUNTERS',
    iterations: MEMORY_ITERATIONS,
    retained: stats.retained,
    maxOpportunities: stats.maxOpportunities,
    openedTotal: stats.openedTotal,
    retiredTotal: stats.retiredTotal,
    bytesPerRecord: telemetry.OPPORTUNITY_BYTES_PER_RECORD,
    recordBytesCeiling: telemetry.OPPORTUNITY_RECORD_BYTES_CEILING,
    estimatedBytes: stats.estimatedBytes,
    estimatedBytesMaximum: stats.estimatedBytesMaximum,
    withinCeiling: stats.estimatedBytes <= stats.estimatedBytesMaximum,
    identityCodeUnits: stats.identityCodeUnits,
    arrayBuffersBeforeBytes: before.arrayBuffers,
    arrayBuffersAfterCreateBytes: afterCreate.arrayBuffers,
    arrayBuffersAfterFillBytes: afterFill.arrayBuffers,
    arrayBuffersAfterDisposeBytes: afterDispose.arrayBuffers,
    heapUsedBeforeBytes: before.heapUsed,
    heapUsedAfterFillBytes: afterFill.heapUsed,
    disposedCountersZero:
      disposed.retained === 0 &&
      disposed.entered === 0 &&
      disposed.identityCodeUnits === 0 &&
      disposed.estimatedBytes === 0,
  };
}

// Strong native self-check: the same real chain at 60 Hz and at the 10 Hz decision cadence.
function selfCheck() {
  const failures = [];
  const drive = (everyTick) => {
    const registry = telemetry.createOpportunityRegistry();
    const harness = buildHarness();
    const queue = { events: [], stimuli: [] };
    let touched = 0;
    for (let tick = 1; tick <= 600; tick += 1) {
      const { observation } = observe(harness, tick);
      // The producer ports are drained exactly like the event stream; neither is sampled.
      queue.events.push(...observation.events);
      queue.stimuli.push(...observation.stimuli);
      if (!everyTick && tick % 6 !== 0) continue;
      const records = registry.observe({
        ...observation,
        events: queue.events.splice(0, queue.events.length),
        stimuli: queue.stimuli.splice(0, queue.stimuli.length),
      });
      touched += records.length;
      // The 052 owner concludes on the authoritative occurrence tick, never on the consumer tick.
      for (const record of records)
        if (record.kind === 'YIELD' && record.state === 'ENTERED')
          registry.conclude({
            tick: record.openedTick,
            opportunityId: record.id,
            outcome: 'YIELDED',
          });
    }
    const all = registry.getOpportunities();
    const denominators = registry.getDenominators();
    registry.dispose();
    return { all, denominators, touched };
  };
  const everyTick = drive(true);
  const decisionCadence = drive(false);
  const project = (record) => ({
    id: record.id,
    kind: record.kind,
    state: record.state,
    outcome: record.outcome,
    truncationReason: record.truncationReason,
    openedTick: record.openedTick,
    resolvedTick: record.resolvedTick,
  });
  if (
    JSON.stringify(everyTick.all.map(project)) !== JSON.stringify(decisionCadence.all.map(project))
  )
    failures.push('60 Hz and 10 Hz consumers disagree on the opportunity set');
  if (new Set(everyTick.all.map((record) => record.id)).size !== everyTick.all.length)
    failures.push('a duplicate opportunity id was produced');
  const denominators = everyTick.denominators;
  if (denominators.total !== denominators.certain + denominators.incomplete + denominators.entered)
    failures.push('denominator identity does not hold');
  if (denominators.certain !== denominators.success + denominators.failure)
    failures.push('certain denominator is not success plus failure');
  if (everyTick.all.some((record) => record.outcome !== null && record.truncationReason !== null))
    failures.push('an opportunity is both certain and incomplete');
  if (!everyTick.all.some((record) => record.kind === 'STOP' && record.state === 'RESOLVED'))
    failures.push('no real STOP opportunity resolved');
  if (!everyTick.all.some((record) => record.kind === 'YIELD' && record.outcome === 'YIELDED'))
    failures.push('no real YIELD opportunity resolved');
  if (everyTick.touched <= decisionCadence.touched)
    failures.push('the 10 Hz consumer did not observe fewer times');
  return {
    passed: failures.length === 0,
    failures,
    everyTickCount: everyTick.all.length,
    decisionCadenceCount: decisionCadence.all.length,
    denominators,
  };
}

const capturedObservations = [];
const runs = [];
for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
  const last = repetition === REPETITIONS;
  runs.push(runArm(false, repetition, null));
  if (!baseline) runs.push(runArm(true, repetition, last ? capturedObservations : null));
}

const paired = [];
if (!baseline)
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    const off = runs.find((run) => run.repetition === repetition && !run.enabled);
    const on = runs.find((run) => run.repetition === repetition && run.enabled);
    paired.push({
      repetition,
      observeOnlyP50DeltaMs: on.observeLoopMs.p50 - off.observeLoopMs.p50,
      observeOnlyP95DeltaMs: on.observeLoopMs.p95 - off.observeLoopMs.p95,
      observeOnlyP99DeltaMs: on.observeLoopMs.p99 - off.observeLoopMs.p99,
      worldBuildP95Ms: on.worldBuildMs.p95,
      offObserveLoopP95Ms: off.observeLoopMs.p95,
      onObserveLoopP95Ms: on.observeLoopMs.p95,
      wallDeltaMs: on.wallMs - off.wallMs,
    });
  }

const report = {
  capturedAt: new Date().toISOString(),
  pbi: '086',
  mode: baseline ? 'BEFORE_REGISTRY_DISABLED' : 'AFTER_OPPORTUNITY_REGISTRY',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(sources.map((file) => [file, hash(file)])),
  sourceHashScope:
    'Probe, opportunity registry, 006 identity, 036 signals, 044 context, 025 filter and the reused 044 fixture; not a verified transitive dependency closure',
  hardware: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    os: `${platform()} ${release()}`,
    powerScheme: powerScheme(),
  },
  runtime: process.version,
  budgetVersion: '203-initial-1',
  fixtureVersion: FIXTURE_VERSION,
  validationLevel: 'targeted',
  protocol: {
    repetitions: REPETITIONS,
    warmupIterations: WARMUP_ITERATIONS,
    measuredIterations: MEASURED_ITERATIONS,
    arms: 'paired OFF/ON per repetition, sequential, one process, no concurrent load',
    workload: `1 subject (${SUBJECT}) observed, real 036 signal controller advancing consecutive ticks over the 044 fixture, real 044 context and 025 keyboard filter; one real-contract 037 STOP approach every ${APPROACH_PERIOD} ticks and one real 038 yield occurrence per approach`,
    seed: 'none; deterministic tick-modulo input pattern and a fixed fixture',
    capacity: 'default (4096)',
    clock: 'performance.now only; fixed synthetic tick index (no wall clock in the fixture)',
    budget:
      'Added cost must stay far below the 5.5 ms provisional full-tick p95 ceiling; no isolated budget claimed',
    calibration: 'PROVISIONAL_UNCALIBRATED',
    injected: [
      'The 044 fixture declares no STOP stop line, so the real 037 event contract and 037 identity are injected with parseSimulationEvent.',
      'The real 038 priority-yield identity is injected through the stimulus port (no 038 producer runs on this fixture).',
      'The 10 Hz consumer drains a queue; the world always steps every fixed tick.',
    ],
  },
  scope:
    'Native Node CPU and owned-memory cost of the 086 opportunity registry on the reused 044/085 fixture. No renderer, browser, GPU, FPS or realtime-throughput claim.',
  runs,
  paired,
  jsonRegion: baseline ? null : measureJsonRegion(),
  memoryRegion: baseline ? null : measureMemoryRegion(),
  selfCheck: baseline ? null : selfCheck(),
  budgets: {
    manifest: 'Docs/performance-budgets.json',
    budgetVersion: '203-initial-1',
    capacityCalibration: 'PROVISIONAL_UNCALIBRATED',
    diagnosticSamplesProposal: 4096,
    measuredCapacity: telemetry?.OPPORTUNITY_CAPACITY.default ?? 4096,
    recorderRamBytesCap: 33554432,
    authoritativeTickP95MsDesktopProvisional: 5.5,
    authoritativeTickP95MsLaptopProvisional: 8,
  },
  exclusions: [
    'No browser, renderer, GPU or FPS measurement; the 052 record documents an unresolved WebGPU presentation stall on this laptop.',
    'Heap counters are diagnostic only; exact ownership is reported from the registry counters.',
    'Forced GC between repetitions is not used inside the timed region.',
    'BEFORE is the same fixture with the registry disabled, not a historical commit: 086 is purely additive.',
  ],
  guard,
};

mkdirSync(EVIDENCE, { recursive: true });
const stem = baseline ? 'native-before-01' : 'native-after-01';
writeFileSync(`${EVIDENCE}/${stem}.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      mode: report.mode,
      commit: report.commit,
      paired,
      jsonRegion: report.jsonRegion,
      memoryRegion: report.memoryRegion,
      selfCheck: report.selfCheck,
    },
    null,
    2,
  ),
);
