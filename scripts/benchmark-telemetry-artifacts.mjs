// PBI 088 native probe: added cost and owned memory of the artefact / partial-segment filter.
//
// Fixture: reused from 044/085/086/087 (`tests/autonomy/road-context-reference.ts`
// `roadContextFixture(false)`) so the lane graph, intersections, the real 036 signal controller, the
// real 044 road context/leader and the real 025 keyboard filter come from the authoritative world
// modules. The 044 fixture carries neither a collision nor a recovery, so the real 028 and 030 facts
// are injected with their own contracts and marked as injected.
//
// Arms (paired, sequential, one process):
//   world   - authoritative world/context work only (BEFORE)
//   chain   - world + the real 086 opportunity registry + the real 087 eligibility layer
//   filter  - world + 086 + 087 + the real 088 artefact filter
// The 088 added cost is the filter-minus-chain delta; the chain-minus-world delta is the already
// documented 086/087 cost and is reported only for transparency.
//
// Usage (sequential, one arm at a time):
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-telemetry-artifacts.mjs --baseline
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-telemetry-artifacts.mjs
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

const EVIDENCE = 'Docs/Evidence/088-telemetry-filters';
const SUBJECT = 'vehicle-0';
const FIXTURE_VERSION = '088-telemetry-artifacts-native-v1';
const MOVEMENT = 'west-straight';
const SIGNAL = 'fixture-signal';
const MAP_ID = '044-context-cross-v1';
const WARMUP_ITERATIONS = 200;
const MEASURED_ITERATIONS = 600;
const REPETITIONS = 5;
const MEMORY_ITERATIONS = 5120;
const APPROACH_PERIOD = 180;
const PROBE_QUEUE_STANDSTILL_GAP_M = 2;
// Injected real-contract discontinuities over the 600-tick measured window.
const COLLISION_TICK = 300;
const RECOVERY_TICK = 420;
const SEGMENT_ID = 'probe-segment';
const WORLD = { schemaVersion: 1, units: 'SI', sessionId: 'academy-1', worldEpoch: 2 };
const STOP_WORLD = { sessionId: WORLD.sessionId, worldEpoch: WORLD.worldEpoch };
const INCARNATION = 1;

const sources = [
  'scripts/benchmark-telemetry-artifacts.mjs',
  'src/telemetry/artifact-filter.ts',
  'src/telemetry/eligibility-windows.ts',
  'src/telemetry/opportunities.ts',
  'src/telemetry/tick-samples.ts',
  'src/sessions/identity.ts',
  'src/vehicles/recovery-ledger.ts',
  'src/autonomy/following.ts',
  'src/world/signals.ts',
  'src/autonomy/road-context.ts',
  'src/vehicles/keyboard-filter.ts',
  'tests/autonomy/road-context-reference.ts',
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
    createDefaultSettings('088-probe').input.control,
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

function eventsAtTick(tick) {
  const phase = tick % APPROACH_PERIOD;
  if (phase !== 40 && phase !== 100 && phase !== 105) return [];
  const base = tick - (phase - 40);
  return stopEvents(base).filter((event) => event.tick === tick);
}

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
      segmentId: SEGMENT_ID,
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
    segmentId: SEGMENT_ID,
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

/** The injected real-contract discontinuities; every one is labelled as injected in the report. */
function injectedCollisions() {
  return [
    {
      tick: COLLISION_TICK,
      incidentId: createStableId('collision', WORLD.sessionId, [
        '028',
        String(WORLD.worldEpoch),
        'probe-pair',
        String(COLLISION_TICK),
      ]),
      impulseNs: 4400,
      otherEntityId: 'probe-wall',
    },
  ];
}

function injectedRecoveries() {
  return [
    {
      tick: RECOVERY_TICK,
      operationId: 'probe-recovery-op-1',
      status: 'COMPLETED',
      pointId: 'probe-point-1',
      mapId: MAP_ID,
      laneId: 'west-1',
      mode: 'MANUAL',
      validatedTick: RECOVERY_TICK - 6,
      learningEligible: false,
    },
  ];
}

function artifactInput(tick, closed) {
  return {
    tick,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    segmentId: 'ride-segment',
    vehicleId: SUBJECT,
    incarnation: String(INCARNATION),
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 1,
    endTick: closed ? MEASURED_ITERATIONS + WARMUP_ITERATIONS : null,
    segmentCompleteness: closed ? 'CLOSED' : 'OPEN',
    closeReason: closed ? 'RIDE_COMPLETED' : null,
    lostCheckpointTick: null,
    observationLoss: null,
    collisions: tick >= COLLISION_TICK ? injectedCollisions() : [],
    recoveries: tick >= RECOVERY_TICK ? injectedRecoveries() : [],
    suspensions: [],
  };
}

// Arm: identical world/observation work in every arm; only the registry/eligibility/filter calls differ.
function runArm(mode, repetition, sink) {
  const harness = buildHarness();
  const registry = mode === 'world' ? null : telemetry.createOpportunityRegistry();
  const eligibility = mode === 'world' ? null : telemetry.createEligibilityWindows();
  const artifacts = mode === 'filter' ? telemetry.createArtifactFilter() : null;
  const samples = [];
  const worldSamples = [];
  const callSamples = [];
  const artifactCallSamples = [];
  let observations = 0;
  let labels = 0;
  let evaluations = 0;
  global.gc?.();
  const wallStart = performance.now();
  const total = WARMUP_ITERATIONS + MEASURED_ITERATIONS;
  const closingTick = Math.floor(total / 6) * 6;
  for (let iteration = 0; iteration < total; iteration += 1) {
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
      for (const record of records) {
        eligibility.observe(eligibilityInput(record, tick, signalFact, leaderFact));
        labels += 1;
      }
      if (artifacts && tick % 6 === 0) {
        const artifactStart = performance.now();
        const record = artifacts.evaluate(artifactInput(tick, tick >= closingTick));
        if (iteration >= WARMUP_ITERATIONS)
          artifactCallSamples.push(performance.now() - artifactStart);
        if (sink) sink.push(record);
        evaluations += 1;
      }
      observations += 1;
    }
    const elapsed = performance.now() - started;
    if (iteration >= WARMUP_ITERATIONS) {
      samples.push(elapsed);
      worldSamples.push(worldMs);
      if (registry) callSamples.push(elapsed);
    }
  }
  const wallMs = performance.now() - wallStart;
  const registryStats = registry ? registry.getStats() : null;
  const eligibilityStats = eligibility ? eligibility.getStats() : null;
  const artifactStats = artifacts ? artifacts.getStats() : null;
  const artifactDenominators = artifacts ? artifacts.getDenominators() : null;
  if (artifacts) artifacts.dispose();
  if (eligibility) eligibility.dispose();
  if (registry) registry.dispose();
  return {
    repetition,
    mode,
    observeLoopMs: summary(samples),
    chainCallMs: registry ? summary(callSamples) : null,
    artifactCallMs: artifacts ? summary(artifactCallSamples) : null,
    worldBuildMs: summary(worldSamples),
    wallMs,
    observations,
    labels,
    evaluations,
    heapAfterBytes: process.memoryUsage().heapUsed,
    registryOwnership: registryStats,
    eligibilityOwnership: eligibilityStats,
    artifactOwnership: artifactStats,
    artifactDenominators,
  };
}

let guard = 0;
function checksumGuard(value) {
  guard = (guard + value) % 1000003;
}

// Separate, clearly labelled region: measured owned memory of the bounded artefact store.
function measureMemoryRegion() {
  global.gc?.();
  const before = process.memoryUsage();
  const layer = telemetry.createArtifactFilter();
  const afterCreate = process.memoryUsage();
  for (let index = 0; index < MEMORY_ITERATIONS; index += 1) {
    layer.evaluate({
      tick: index + 1,
      sessionId: WORLD.sessionId,
      worldEpoch: WORLD.worldEpoch,
      segmentId: `memory-segment-${index}`,
      vehicleId: `vehicle-${index}`,
      incarnation: String(INCARNATION),
      controlMode: 'LEARNING',
      learningEligible: true,
      startTick: 1,
      endTick: 200,
      segmentCompleteness: 'CLOSED',
      closeReason: 'RIDE_COMPLETED',
      lostCheckpointTick: index % 5 === 0 ? 150 : null,
      observationLoss: index % 7 === 0 ? { fromTick: 120, ticks: 2 } : null,
      collisions:
        index % 3 === 0
          ? [{ tick: 60, incidentId: `incident-${index}`, impulseNs: 100, otherEntityId: 'wall' }]
          : [],
      recoveries: [],
      suspensions: index % 11 === 0 ? [{ fromTick: 20, toTick: 30, cause: 'panel' }] : [],
    });
  }
  const afterFill = process.memoryUsage();
  const stats = layer.getStats();
  const denominators = layer.getDenominators();
  layer.dispose();
  const afterDispose = process.memoryUsage();
  const disposed = layer.getStats();
  return {
    label: 'MEMORY_REGION_EXACT_OWNERSHIP_COUNTERS',
    iterations: MEMORY_ITERATIONS,
    retained: stats.retained,
    maxWindows: stats.maxWindows,
    windowsEvaluated: stats.windowsEvaluated,
    retiredTotal: stats.retiredTotal,
    checkpointLosses: stats.checkpointLosses,
    bytesPerRecord: telemetry.ARTIFACT_BYTES_PER_RECORD,
    recordBytesCeiling: telemetry.ARTIFACT_RECORD_BYTES_CEILING,
    estimatedBytes: stats.estimatedBytes,
    estimatedBytesMaximum: stats.estimatedBytesMaximum,
    withinCeiling: stats.estimatedBytes <= stats.estimatedBytesMaximum,
    identityCodeUnits: stats.identityCodeUnits,
    prefixEligible: denominators.prefixEligible,
    fullySuppressed: denominators.fullySuppressed,
    truncated: denominators.truncated,
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

// Strong native self-check on the real chain, at 60 Hz and at the 10 Hz decision cadence.
function selfCheck() {
  const failures = [];
  const drive = (everyTick) => {
    const eligibility = telemetry.createEligibilityWindows();
    const registry = telemetry.createOpportunityRegistry();
    const artifacts = telemetry.createArtifactFilter();
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
      artifacts.evaluate(artifactInput(tick, tick === 600));
    }
    const windows = eligibility.getWindows();
    const artifactWindow = artifacts.getWindow('ride-segment');
    const denominators = artifacts.getDenominators();
    eligibility.dispose();
    registry.dispose();
    artifacts.dispose();
    return { windows, artifactWindow, denominators };
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
  });
  if (
    JSON.stringify(everyTick.windows.map(project)) !==
    JSON.stringify(decisionCadence.windows.map(project))
  )
    failures.push('60 Hz and 10 Hz consumers disagree on the 087 labels');

  const artifact = everyTick.artifactWindow;
  if (!artifact) failures.push('the real chain produced no artifact window');
  else {
    if (artifact.windowClass !== 'PREFIX_ELIGIBLE')
      failures.push('the collision window was not prefix-eligible');
    if (artifact.boundaryTick !== COLLISION_TICK)
      failures.push(`the split boundary is ${artifact.boundaryTick}, not the collision tick`);
    if (artifact.prefix.toTick !== COLLISION_TICK - 1)
      failures.push('the usable prefix does not end exactly before the collision');
    if (artifact.completeness !== 'PARTIAL' || artifact.completenessReason !== 'RECOVERY')
      failures.push('the recovered window did not report PARTIAL/RECOVERY');
    const kinds = artifact.artifacts.map((entry) => entry.kind).join(',');
    if (kinds !== 'COLLISION,TELEPORT') failures.push(`unexpected artifact kinds: ${kinds}`);
    if (artifact.artifacts[1].operationId !== 'probe-recovery-op-1')
      failures.push('the 030 recovery cause/proof was not preserved');
  }
  // `observationCount`, `lastTick` and `openedTick` are cadence-visible by design (087 documents the
  // same rule); every other field must be identical between the 60 Hz and the 10 Hz consumer.
  const projectWindow = (record) =>
    record === null
      ? null
      : {
          windowId: record.windowId,
          segmentId: record.segmentId,
          vehicleId: record.vehicleId,
          incarnation: record.incarnation,
          controlMode: record.controlMode,
          learningEligible: record.learningEligible,
          startTick: record.startTick,
          endTick: record.endTick,
          completeness: record.completeness,
          completenessReason: record.completenessReason,
          windowClass: record.windowClass,
          prefix: record.prefix,
          suppressed: record.suppressed,
          boundaryTick: record.boundaryTick,
          boundaryCause: record.boundaryCause,
          artifactCount: record.artifactCount,
          artifacts: record.artifacts,
        };
  if (
    JSON.stringify(projectWindow(everyTick.artifactWindow)) !==
    JSON.stringify(projectWindow(decisionCadence.artifactWindow))
  )
    failures.push('the artifact window is not cadence-independent');
  // Criterion 2: a lost checkpoint is an explicit TRUNCATED segment, never COMPLETE.
  const layer = telemetry.createArtifactFilter();
  const crash = layer.evaluate({
    tick: 10,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    segmentId: 'crash-segment',
    vehicleId: SUBJECT,
    incarnation: String(INCARNATION),
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 1,
    endTick: null,
    segmentCompleteness: 'OPEN',
    closeReason: null,
    lostCheckpointTick: 5,
    observationLoss: null,
    collisions: [],
    recoveries: [],
    suspensions: [],
  });
  if (crash.completeness !== 'TRUNCATED' || crash.completenessReason !== 'CHECKPOINT_LOST')
    failures.push('a lost checkpoint did not produce an explicit TRUNCATED segment');
  if (crash.artifacts[0]?.source !== 'CHECKPOINT_222')
    failures.push('the lost-checkpoint artifact lost its provenance');

  // Criterion 1: a clean segment stays COMPLETE, a fully suppressed one cannot be evidence.
  const clean = layer.evaluate({
    tick: 20,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    segmentId: 'clean-segment',
    vehicleId: SUBJECT,
    incarnation: String(INCARNATION),
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 11,
    endTick: 20,
    segmentCompleteness: 'CLOSED',
    closeReason: 'RIDE_COMPLETED',
    lostCheckpointTick: null,
    observationLoss: null,
    collisions: [],
    recoveries: [],
    suspensions: [],
  });
  if (clean.completeness !== 'COMPLETE' || clean.windowClass !== 'PREFIX_ELIGIBLE')
    failures.push('a clean segment was not COMPLETE and fully usable');
  layer.emitPreImpactEvidence(clean);
  const suppressed = layer.evaluate({
    tick: 30,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    segmentId: 'suppressed-segment',
    vehicleId: SUBJECT,
    incarnation: String(INCARNATION),
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 21,
    endTick: 30,
    segmentCompleteness: 'CLOSED',
    closeReason: 'RIDE_COMPLETED',
    lostCheckpointTick: null,
    observationLoss: null,
    collisions: [{ tick: 21, incidentId: 'i', impulseNs: 10, otherEntityId: 'w' }],
    recoveries: [],
    suspensions: [],
  });
  let refused = false;
  try {
    layer.emitPreImpactEvidence(suppressed);
  } catch {
    refused = true;
  }
  if (suppressed.windowClass !== 'FULLY_SUPPRESSED' || !refused)
    failures.push('a fully suppressed window became preference evidence');
  checksumGuard(layer.getDenominators().artifactsTotal);
  layer.dispose();
  return { passed: failures.length === 0, failures, denominators: everyTick.denominators };
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
  runs.push(runArm('chain', repetition, null));
  runs.push(runArm('filter', repetition, last ? capturedWindows : null));
}

const paired = [];
if (!baseline)
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    const world = runs.find((run) => run.repetition === repetition && run.mode === 'world');
    const chain = runs.find((run) => run.repetition === repetition && run.mode === 'chain');
    const filter = runs.find((run) => run.repetition === repetition && run.mode === 'filter');
    paired.push({
      repetition,
      chainOverWorldP95Ms: chain.observeLoopMs.p95 - world.observeLoopMs.p95,
      filterOverChainP50Ms: filter.observeLoopMs.p50 - chain.observeLoopMs.p50,
      filterOverChainP95Ms: filter.observeLoopMs.p95 - chain.observeLoopMs.p95,
      filterOverChainP99Ms: filter.observeLoopMs.p99 - chain.observeLoopMs.p99,
      filterOverWorldP95Ms: filter.observeLoopMs.p95 - world.observeLoopMs.p95,
      artifactCallP50Ms: filter.artifactCallMs.p50,
      artifactCallP95Ms: filter.artifactCallMs.p95,
      artifactCallP99Ms: filter.artifactCallMs.p99,
      artifactAmortizedPerTickP95Ms: filter.artifactCallMs.p95 / 6,
      worldBuildP95Ms: world.worldBuildMs.p95,
      evaluations: filter.evaluations,
      wallDeltaMs: filter.wallMs - chain.wallMs,
    });
  }

const report = {
  capturedAt: new Date().toISOString(),
  pbi: '088',
  mode: baseline ? 'BEFORE_FILTER_DISABLED' : 'AFTER_ARTIFACT_FILTER',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(sources.map((file) => [file, hash(file)])),
  sourceHashScope:
    'Probe, artefact filter, eligibility layer, opportunity registry, 006 identity, 030 recovery ledger, 048 following, 036 signals, 044 context, 025 filter and the reused 044 fixture; not a verified transitive dependency closure',
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
    arms: 'world / chain / filter per repetition, sequential, one process, no concurrent load',
    workload: `1 subject (${SUBJECT}) observed, real 036 signal controller advancing consecutive ticks over the 044 fixture, real 044 context/leader and 025 keyboard filter; the 088 filter evaluated at the real 219 decision cadence (every 6 ticks) over one 800-tick ride segment (BEFORE/WARMUP + MEASURED), with one injected real-contract 028 collision at tick ${COLLISION_TICK} and one injected real-contract 030 recovery placement at tick ${RECOVERY_TICK}`,
    seed: 'none; deterministic tick-modulo input pattern and a fixed fixture',
    capacity: 'default (4096)',
    clock: 'performance.now only; fixed synthetic tick index (no wall clock in the fixture)',
    budget:
      'Added cost must stay far below the 5.5 ms provisional full-tick p95 ceiling; no isolated budget claimed',
    calibration: 'PROVISIONAL_UNCALIBRATED',
    injected: [
      'The 044 fixture carries no collision, so the real 028 incident contract and 028 createStableId identity are injected at one tick.',
      'The 044 fixture carries no recovery, so a real 030 RecoveryRecord-compatible fact is injected at one tick.',
      'The 044 fixture declares no STOP stop line, so the real 037 event contract and 037 identity are injected with parseSimulationEvent.',
      'The real 038 priority-yield identity is injected through the registry stimulus port.',
      'The stimulus observability is declared by a controlled fixture; the 017 camera pose/occlusion path is covered by the unit suite.',
      'The 10 Hz consumer drains a queue; the world always steps every fixed tick.',
      'No suspension is injected in the timed ride; the pause arm is covered by the unit suite and the self-check.',
    ],
  },
  scope:
    'Native Node CPU and owned-memory cost of the 088 artefact filter on top of the real 086/087 chain on the reused 044/085 fixture. No renderer, browser, GPU, FPS or realtime-throughput claim.',
  runs,
  paired,
  memoryRegion: baseline ? null : measureMemoryRegion(),
  selfCheck: baseline ? null : selfCheck(),
  budgets: {
    manifest: 'Docs/performance-budgets.json',
    budgetVersion: '203-initial-1',
    capacityCalibration: 'PROVISIONAL_UNCALIBRATED',
    diagnosticSamplesProposal: 4096,
    measuredCapacity: telemetry?.ARTIFACT_CAPACITY.default ?? 4096,
    recorderRamBytesCap: 33554432,
    authoritativeTickP95MsDesktopProvisional: 5.5,
    authoritativeTickP95MsLaptopProvisional: 8,
  },
  exclusions: [
    'No browser, renderer, GPU or FPS measurement; the 052 record documents an unresolved WebGPU presentation stall on this laptop.',
    'Heap counters are diagnostic only; exact ownership is reported from the artefact counters.',
    'Forced GC between repetitions is not used inside the timed region.',
    'BEFORE is the same fixture with the 086/087/088 layers disabled, not a historical commit: 088 is purely additive.',
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
