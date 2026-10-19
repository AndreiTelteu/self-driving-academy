// PBI 087 native probe: added cost and owned memory of the eligible-window / external-constraint layer.
//
// Fixture: reused from 044/085/086 (`tests/autonomy/road-context-reference.ts`
// `roadContextFixture(false)`) so the lane graph, intersections, the real 036 signal controller and
// the real 044 road context/leader come from the authoritative world modules. The 044 fixture has no
// STOP stop line, so the real 037 *event contract* is injected with `parseSimulationEvent` and 037's
// own `createStableId('stop-opportunity', ...)` identity, one approach every 180 ticks; the real 038
// yield occurrence is injected through the registry's stimulus port. Both are labelled in the report.
//
// Arms (paired, sequential, one process):
//   world         - authoritative world/context work only (BEFORE)
//   registry      - world + the real 086 opportunity registry
//   eligibility   - world + 086 registry + the 087 eligibility layer
// The 087 added cost is the eligibility-minus-registry delta; the registry-minus-world delta is the
// already documented 086 cost and is reported only for transparency.
//
// Usage (sequential, one arm at a time):
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-eligibility-windows.mjs --baseline
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-eligibility-windows.mjs
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

const EVIDENCE = 'Docs/Evidence/087-eligibility-windows';
const SUBJECT = 'vehicle-0';
const FIXTURE_VERSION = '087-eligibility-windows-native-v1';
const MOVEMENT = 'west-straight';
const SIGNAL = 'fixture-signal';
const MAP_ID = '044-context-cross-v1';
const WARMUP_ITERATIONS = 200;
const MEASURED_ITERATIONS = 600;
const REPETITIONS = 5;
const MEMORY_ITERATIONS = 5120;
const APPROACH_PERIOD = 180;
// The 048 proposed `queue_standstill_gap` default; the real compiled profile value is exercised by
// the unit suite. The probe does not compile a following profile.
const PROBE_QUEUE_STANDSTILL_GAP_M = 2;
const WORLD = { schemaVersion: 1, units: 'SI', sessionId: 'academy-1', worldEpoch: 2 };
const STOP_WORLD = { sessionId: WORLD.sessionId, worldEpoch: WORLD.worldEpoch };
const INCARNATION = 1;

const sources = [
  'scripts/benchmark-eligibility-windows.mjs',
  'src/telemetry/eligibility-windows.ts',
  'src/telemetry/opportunities.ts',
  'src/telemetry/tick-samples.ts',
  'src/sessions/identity.ts',
  'src/autonomy/following.ts',
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
    createDefaultSettings('087-probe').input.control,
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

// Advances the authoritative world and returns one fixed-tick registry observation plus the real
// 044/048 context facts the 087 layer consumes.
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
  const signalFact = movement
    ? {
        signalId: movement.signalId,
        intersectionId: movement.intersectionId,
        movementId: movement.movementId,
        state: movement.state,
      }
    : null;
  const leaderFact = context?.leader
    ? { id: context.leader.id, gapM: context.leader.gapM, speedMps: context.leader.speedMps }
    : null;
  return {
    observation: {
      tick,
      sessionId: WORLD.sessionId,
      worldEpoch: WORLD.worldEpoch,
      segmentId: 'probe-segment',
      learningEligible: true,
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
    signalFact,
    leaderFact,
    inputType: inputFrame.command.source,
    laneId: context?.laneId ?? null,
  };
}

/** Builds one 087 window input from a real 086 record plus the real 044/036 context of this tick. */
function eligibilityInput(record, tick, signalFact, leaderFact) {
  const greenExit =
    record.kind === 'GREEN'
      ? telemetry.greenExitBlockedByQueue({
          signal: signalFact,
          leader: leaderFact,
          queueStandstillGapM: PROBE_QUEUE_STANDSTILL_GAP_M,
        })
      : null;
  return {
    tick,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    opportunityId: record.id,
    kind: record.kind,
    vehicleId: record.vehicleId,
    incarnation: record.incarnation,
    segmentId: 'probe-segment',
    controlMode: 'LEARNING',
    learningEligible: true,
    classId: 'sedan',
    suspension: 'NONE',
    visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
    leader: leaderFact,
    signal: signalFact,
    greenExit,
    mechanical: null,
    impact: null,
  };
}

// Arm: identical world/observation work in every arm; only the registry/eligibility calls differ.
function runArm(mode, repetition, sink) {
  const harness = buildHarness();
  const registry = mode === 'world' ? null : telemetry.createOpportunityRegistry();
  const eligibility = mode === 'eligibility' ? telemetry.createEligibilityWindows() : null;
  const samples = [];
  const worldSamples = [];
  let observations = 0;
  let labels = 0;
  global.gc?.();
  const wallStart = performance.now();
  for (let iteration = 0; iteration < WARMUP_ITERATIONS + MEASURED_ITERATIONS; iteration += 1) {
    const tick = iteration + 1;
    const worldStart = performance.now();
    const { observation, signalFact, leaderFact } = observe(harness, tick);
    const worldMs = performance.now() - worldStart;
    const started = performance.now();
    if (registry) {
      const records = registry.observe(observation);
      if (tick % APPROACH_PERIOD === 100) {
        const entered = registry.findEntered('YIELD', SUBJECT, String(INCARNATION));
        if (entered) registry.conclude({ tick, opportunityId: entered.id, outcome: 'YIELDED' });
      }
      if (eligibility)
        for (const record of records) {
          const window = eligibility.observe(
            eligibilityInput(record, tick, signalFact, leaderFact),
          );
          if (sink && sink.length < 50) sink.push(window);
          labels += 1;
        }
      observations += 1;
    }
    const elapsed = performance.now() - started;
    if (iteration >= WARMUP_ITERATIONS) {
      samples.push(elapsed);
      worldSamples.push(worldMs);
    }
  }
  const wallMs = performance.now() - wallStart;
  const registryStats = registry ? registry.getStats() : null;
  const eligibilityDenominators = eligibility ? eligibility.getDenominators() : null;
  const eligibilityStats = eligibility ? eligibility.getStats() : null;
  if (eligibility) eligibility.dispose();
  if (registry) registry.dispose();
  return {
    repetition,
    mode,
    observeLoopMs: summary(samples),
    worldBuildMs: summary(worldSamples),
    wallMs,
    observations,
    labels,
    heapAfterBytes: process.memoryUsage().heapUsed,
    registryOwnership: registryStats,
    eligibilityDenominators,
    eligibilityOwnership: eligibilityStats,
  };
}

let guard = 0;
function checksumGuard(value) {
  guard = (guard + value) % 1000003;
}

// Separate, clearly labelled region: measured owned memory of the bounded eligibility store.
function measureMemoryRegion() {
  global.gc?.();
  const before = process.memoryUsage();
  const eligibility = telemetry.createEligibilityWindows();
  const afterCreate = process.memoryUsage();
  for (let index = 0; index < MEMORY_ITERATIONS; index += 1) {
    eligibility.observe({
      tick: index + 1,
      sessionId: WORLD.sessionId,
      worldEpoch: WORLD.worldEpoch,
      opportunityId: `opportunity-${index}`,
      kind: index % 2 === 0 ? 'STOP' : 'GREEN',
      vehicleId: `vehicle-${index}`,
      incarnation: String(INCARNATION),
      segmentId: 'memory-segment',
      controlMode: 'LEARNING',
      learningEligible: true,
      classId: index % 2 === 0 ? 'sedan' : 'compact',
      suspension: 'NONE',
      visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
      leader: index % 3 === 0 ? { id: 'leader', gapM: 2, speedMps: 0 } : null,
      signal: null,
      greenExit: null,
      mechanical: null,
      impact: null,
    });
  }
  const afterFill = process.memoryUsage();
  const stats = eligibility.getStats();
  const denominators = eligibility.getDenominators();
  eligibility.dispose();
  const afterDispose = process.memoryUsage();
  const disposed = eligibility.getStats();
  return {
    label: 'MEMORY_REGION_EXACT_OWNERSHIP_COUNTERS',
    iterations: MEMORY_ITERATIONS,
    retained: stats.retained,
    maxWindows: stats.maxWindows,
    windowsOpened: stats.windowsOpened,
    retiredTotal: stats.retiredTotal,
    bytesPerRecord: telemetry.ELIGIBILITY_BYTES_PER_RECORD,
    recordBytesCeiling: telemetry.ELIGIBILITY_RECORD_BYTES_CEILING,
    estimatedBytes: stats.estimatedBytes,
    estimatedBytesMaximum: stats.estimatedBytesMaximum,
    withinCeiling: stats.estimatedBytes <= stats.estimatedBytesMaximum,
    identityCodeUnits: stats.identityCodeUnits,
    eligible: denominators.eligible,
    externalConstraint: denominators.externalConstraint,
    arrayBuffersBeforeBytes: before.arrayBuffers,
    arrayBuffersAfterCreateBytes: afterCreate.arrayBuffers,
    arrayBuffersAfterFillBytes: afterFill.arrayBuffers,
    arrayBuffersAfterDisposeBytes: afterDispose.arrayBuffers,
    heapUsedBeforeBytes: before.heapUsed,
    heapUsedAfterFillBytes: afterFill.heapUsed,
    disposedCountersZero:
      disposed.retained === 0 && disposed.identityCodeUnits === 0 && disposed.estimatedBytes === 0,
  };
}

// Strong native self-check: the same real chain at 60 Hz and at the 10 Hz decision cadence.
function selfCheck() {
  const failures = [];
  const drive = (everyTick) => {
    const eligibility = telemetry.createEligibilityWindows();
    const registry = telemetry.createOpportunityRegistry();
    const harness = buildHarness();
    const queue = { events: [], stimuli: [] };
    for (let tick = 1; tick <= 600; tick += 1) {
      const { observation, signalFact, leaderFact } = observe(harness, tick);
      queue.events.push(...observation.events);
      queue.stimuli.push(...observation.stimuli);
      if (!everyTick && tick % 6 !== 0) continue;
      const records = registry.observe({
        ...observation,
        events: queue.events.splice(0),
        stimuli: queue.stimuli.splice(0),
      });
      for (const record of records)
        eligibility.observe(eligibilityInput(record, tick, signalFact, leaderFact));
    }
    const windows = eligibility.getWindows();
    const denominators = eligibility.getDenominators();
    eligibility.dispose();
    registry.dispose();
    return { windows, denominators };
  };
  const everyTick = drive(true);
  const decisionCadence = drive(false);
  const project = (record) => ({
    opportunityId: record.opportunityId,
    kind: record.kind,
    windowClass: record.windowClass,
    label: record.label,
    reason: record.reason,
    source: record.source,
    observable: record.observable,
  });
  if (
    JSON.stringify(everyTick.windows.map(project)) !==
    JSON.stringify(decisionCadence.windows.map(project))
  )
    failures.push('60 Hz and 10 Hz consumers disagree on the eligibility labels');
  const denominators = everyTick.denominators;
  if (
    denominators.total !==
    denominators.eligible + denominators.externalConstraint + denominators.excluded
  )
    failures.push('the eligibility denominator identity does not hold');
  if (denominators.total === 0) failures.push('the real chain produced no eligibility windows');
  // The 044 fixture's subject always has a same-lane leader, so the real chain is correctly external.
  if (denominators.externalConstraint !== denominators.total)
    failures.push('the queued real chain was not fully classified as an external constraint');
  if (everyTick.windows.some((record) => record.label === 'NOT_OBSERVABLE'))
    failures.push('the controlled-fixture stimulus was reported as not observable');
  // The eligible free-traffic path and its open reaction window, on an otherwise identical window.
  const freeProbe = telemetry.createEligibilityWindows();
  const freeRecord = freeProbe.observe({
    tick: 1,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    opportunityId: 'free-opportunity',
    kind: 'RED',
    vehicleId: SUBJECT,
    incarnation: String(INCARNATION),
    segmentId: 'probe-segment',
    controlMode: 'LEARNING',
    learningEligible: true,
    classId: 'sedan',
    suspension: 'NONE',
    visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
    leader: null,
    signal: null,
    greenExit: null,
    mechanical: null,
    impact: null,
  });
  if (freeRecord.label !== 'FREE_TRAFFIC' || !freeRecord.reaction.open)
    failures.push('the eligible free-traffic path did not open a reaction window');
  const accepted = freeProbe.respond({ tick: 31, opportunityId: 'free-opportunity' });
  if (!accepted.accepted || accepted.durationTicks !== 30)
    failures.push('the eligible reaction window did not record a reaction time');
  freeProbe.dispose();
  // Criterion 1: an external constraint can never become preference evidence.
  const constrained = everyTick.windows.find(
    (record) => record.windowClass === 'EXTERNAL_CONSTRAINT',
  );
  if (constrained) {
    let refused = false;
    try {
      eligibilityEmitProbe(everyTick, constrained);
    } catch {
      refused = true;
    }
    if (!refused) failures.push('an external constraint became preference evidence');
  }
  // Criterion 2: a hidden stimulus is explicit NOT_OBSERVABLE with no reaction denominator entry.
  const hidden = telemetry.createEligibilityWindows();
  const hiddenRecord = hidden.observe({
    tick: 1,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    opportunityId: 'hidden-opportunity',
    kind: 'GREEN',
    vehicleId: SUBJECT,
    incarnation: String(INCARNATION),
    segmentId: 'probe-segment',
    controlMode: 'LEARNING',
    learningEligible: true,
    classId: 'sedan',
    suspension: 'NONE',
    visibility: { source: 'CONTROLLED_FIXTURE', observable: false },
    leader: null,
    signal: null,
    greenExit: null,
    mechanical: null,
    impact: null,
  });
  if (hiddenRecord.label !== 'NOT_OBSERVABLE')
    failures.push('a hidden stimulus was not reported NOT_OBSERVABLE');
  const refused = hidden.respond({ tick: 30, opportunityId: 'hidden-opportunity' });
  if (refused.accepted || hidden.getDenominators().reactionSamples !== 0)
    failures.push('a hidden stimulus contributed a reaction time');
  hidden.dispose();
  return { passed: failures.length === 0, failures, denominators };
}

// The self-check cannot retain the disposed layer, so it re-derives one constrained window to prove
// the runtime gate. Kept separate to make the disposal path explicit.
function eligibilityEmitProbe(chain, constrained) {
  const recreated = telemetry.createEligibilityWindows();
  const record = recreated.observe({
    tick: 1,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    opportunityId: constrained.opportunityId,
    kind: constrained.kind,
    vehicleId: constrained.vehicleId,
    incarnation: constrained.incarnation,
    segmentId: constrained.segmentId,
    controlMode: constrained.controlMode,
    learningEligible: constrained.learningEligible,
    classId: 'sedan',
    suspension: 'NONE',
    visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
    leader: { id: 'leader', gapM: 1, speedMps: 0 },
    signal: null,
    greenExit: null,
    mechanical: null,
    impact: null,
  });
  try {
    return recreated.emitPreferenceEvidence(record);
  } finally {
    recreated.dispose();
    checksumGuard(chain.windows.length);
  }
}

const capturedWindows = [];
const runs = [];
for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
  const last = repetition === REPETITIONS;
  if (baseline) {
    runs.push(runArm('world', repetition, null));
    continue;
  }
  runs.push(runArm('world', repetition, null));
  runs.push(runArm('registry', repetition, null));
  runs.push(runArm('eligibility', repetition, last ? capturedWindows : null));
}

const paired = [];
if (!baseline)
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    const world = runs.find((run) => run.repetition === repetition && run.mode === 'world');
    const registry = runs.find((run) => run.repetition === repetition && run.mode === 'registry');
    const eligibility = runs.find(
      (run) => run.repetition === repetition && run.mode === 'eligibility',
    );
    paired.push({
      repetition,
      registryOverWorldP95Ms: registry.observeLoopMs.p95 - world.observeLoopMs.p95,
      eligibilityOverRegistryP50Ms: eligibility.observeLoopMs.p50 - registry.observeLoopMs.p50,
      eligibilityOverRegistryP95Ms: eligibility.observeLoopMs.p95 - registry.observeLoopMs.p95,
      eligibilityOverRegistryP99Ms: eligibility.observeLoopMs.p99 - registry.observeLoopMs.p99,
      eligibilityOverWorldP95Ms: eligibility.observeLoopMs.p95 - world.observeLoopMs.p95,
      worldBuildP95Ms: world.worldBuildMs.p95,
      labels: eligibility.labels,
      wallDeltaMs: eligibility.wallMs - registry.wallMs,
    });
  }

const report = {
  capturedAt: new Date().toISOString(),
  pbi: '087',
  mode: baseline ? 'BEFORE_ELIGIBILITY_DISABLED' : 'AFTER_ELIGIBILITY_WINDOWS',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(sources.map((file) => [file, hash(file)])),
  sourceHashScope:
    'Probe, eligibility layer, opportunity registry, 006 identity, 048 following, 036 signals, 044 context, 025 filter and the reused 044 fixture; not a verified transitive dependency closure',
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
    arms: 'world / registry / eligibility per repetition, sequential, one process, no concurrent load',
    workload: `1 subject (${SUBJECT}) observed, real 036 signal controller advancing consecutive ticks over the 044 fixture, real 044 context/leader and 025 keyboard filter; one real-contract 037 STOP approach every ${APPROACH_PERIOD} ticks and one real 038 yield occurrence per approach`,
    seed: 'none; deterministic tick-modulo input pattern and a fixed fixture',
    capacity: 'default (4096)',
    clock: 'performance.now only; fixed synthetic tick index (no wall clock in the fixture)',
    budget:
      'Added cost must stay far below the 5.5 ms provisional full-tick p95 ceiling; no isolated budget claimed',
    calibration: 'PROVISIONAL_UNCALIBRATED',
    injected: [
      'The 044 fixture declares no STOP stop line, so the real 037 event contract and 037 identity are injected with parseSimulationEvent.',
      'The real 038 priority-yield identity is injected through the stimulus port (no 038 producer runs on this fixture).',
      'The stimulus observability is declared by a controlled fixture; the 017 camera pose/occlusion path is covered by the unit suite.',
      'The 10 Hz consumer drains a queue; the world always steps every fixed tick.',
    ],
  },
  scope:
    'Native Node CPU and owned-memory cost of the 087 eligibility layer on top of the 086 registry on the reused 044/085 fixture. No renderer, browser, GPU, FPS or realtime-throughput claim.',
  runs,
  paired,
  memoryRegion: baseline ? null : measureMemoryRegion(),
  selfCheck: baseline ? null : selfCheck(),
  budgets: {
    manifest: 'Docs/performance-budgets.json',
    budgetVersion: '203-initial-1',
    capacityCalibration: 'PROVISIONAL_UNCALIBRATED',
    diagnosticSamplesProposal: 4096,
    measuredCapacity: telemetry?.ELIGIBILITY_CAPACITY.default ?? 4096,
    recorderRamBytesCap: 33554432,
    authoritativeTickP95MsDesktopProvisional: 5.5,
    authoritativeTickP95MsLaptopProvisional: 8,
  },
  exclusions: [
    'No browser, renderer, GPU or FPS measurement; the 052 record documents an unresolved WebGPU presentation stall on this laptop.',
    'Heap counters are diagnostic only; exact ownership is reported from the eligibility counters.',
    'Forced GC between repetitions is not used inside the timed region.',
    'BEFORE is the same fixture with the registry and eligibility disabled, not a historical commit: 087 is purely additive.',
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
      memoryRegion: report.memoryRegion,
      selfCheck: report.selfCheck,
    },
    null,
    2,
  ),
);
