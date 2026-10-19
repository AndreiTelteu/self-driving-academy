// PBI 085 native probe: added cost and owned memory of the tick sample recorder.
//
// Fixture: reused from 044 (`tests/autonomy/road-context-reference.ts` `roadContextFixture(false)`) so
// lane and signal context come from the real authoritative world modules, plus the real 025 keyboard
// filter for raw/filtered input and the real 023 vehicle classes for the vehicle class. No renderer,
// no browser, no DOM, no new harness.
//
// Usage (sequential, one arm at a time):
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-telemetry-tick-samples.mjs --baseline
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-telemetry-tick-samples.mjs
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { createRoadContext } from '../src/autonomy/index.ts';
import { createSignalController } from '../src/world/index.ts';
import { createEventBus } from '../src/simulation/index.ts';
import {
  createKeyboardFilter,
  parseVehicleCommand,
  parseVehicleState,
} from '../src/vehicles/index.ts';
import { createDefaultSettings } from '../src/settings/index.ts';

const baseline = process.argv.includes('--baseline');
const telemetry = baseline ? null : await import('../src/telemetry/index.ts');

const EVIDENCE = 'Docs/Evidence/085-telemetry-samples';
const SUBJECT = 'vehicle-0';
const FIXTURE_VERSION = '085-tick-samples-native-v1';
const PROFILE_VERSION = 'style-v1';
const WARMUP_ITERATIONS = 200;
const MEASURED_ITERATIONS = 600;
const REPETITIONS = 5;
const JSON_ITERATIONS = 500;
const SAMPLE_CAPACITY = 4096;
const WORLD = {
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'academy-1',
  worldEpoch: 2,
};
const vehiclesInFrame = roadContextFixture(false).frame.vehicles.length;

const sources = [
  'scripts/benchmark-telemetry-tick-samples.mjs',
  'src/telemetry/tick-samples.ts',
  'src/vehicles/keyboard-filter.ts',
  'src/vehicles/vehicle-classes.ts',
  'src/vehicles/contracts.ts',
  'src/autonomy/road-context.ts',
  'src/world/lane-graph.ts',
  'src/world/signals.ts',
  'src/settings/contracts.ts',
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
    createDefaultSettings('085-probe').input.control,
    0,
  );
  return { fixture, map, frame, signals, engine, filter, previousState: null };
}

// Advances the authoritative world and returns the observation frame for one fixed tick.
function observe(harness, tick) {
  const { map, frame, signals, engine, filter } = harness;
  if (tick > 0) signals.step(tick);
  frame.tick = tick;
  frame.signals = map.intersections[0].movements.map((movement) =>
    signals.getMovementSignal('junction', movement.id),
  );
  const actor = frame.vehicles.find((candidate) => candidate.id === SUBJECT);
  actor.positionM = { ...actor.positionM, x: actor.positionM.x + 0.02 };
  engine.updateFrame(frame);
  const context = engine.getContext(SUBJECT, { force: true });
  const state = parseVehicleState({
    ...WORLD,
    vehicleId: actor.id,
    classId: 'sedan',
    tick,
    transform: {
      positionM: { ...actor.positionM },
      rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    },
    velocityMps: { x: 0, y: 0, z: actor.speedMps },
    laneId: context.laneId,
    controlMode: 'MANUAL',
    appliedProfileVersion: PROFILE_VERSION,
    maneuverState: 'IDLE',
  });
  filter.setAction('throttle', tick % 120 < 60);
  filter.setAction('brake', tick % 120 >= 90);
  filter.setAction('steerRight', tick % 37 < 12);
  const inputFrame = filter.step({ tick, dtSeconds: 1 / 60, speedMps: actor.speedMps });
  const physics = telemetry
    ? telemetry.deriveTickSamplePhysics(harness.previousState ?? state, state, 1 / 60)
    : { longitudinalAccelerationMps2: 0, lateralAccelerationMps2: 0 };
  const observation = {
    tick,
    state,
    raw: inputFrame.raw,
    command: inputFrame.command,
    physics,
    lane: context.lane
      ? { laneId: context.laneId, speedLimitMps: context.lane.lane.speedLimitMps }
      : null,
    signal: context.signal
      ? { signalId: context.signal.signalId, state: context.signal.state }
      : null,
  };
  harness.previousState = state;
  return observation;
}

function segmentInput(segmentId) {
  return {
    segmentId,
    sessionId: WORLD.sessionId,
    worldEpoch: WORLD.worldEpoch,
    vehicleId: SUBJECT,
    classId: 'sedan',
    controlMode: 'MANUAL',
    profileId: 'style-1',
    baseVersionId: PROFILE_VERSION,
    learningEpoch: 1,
    learningEligible: false,
    inputType: 'KEYBOARD',
    startTick: 0,
  };
}

// Arm: identical world/input/state work in both arms; only the recorder call differs.
function runArm(enabled, repetition, sink) {
  const harness = buildHarness();
  const recorder = enabled ? telemetry.createTickSampleRecorder() : null;
  if (recorder) recorder.openSegment(segmentInput(`probe-${repetition}`));
  const samples = [];
  const buildSamples = [];
  let checksum = 0;
  let written = 0;
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const wallStart = performance.now();
  for (let iteration = 0; iteration < WARMUP_ITERATIONS + MEASURED_ITERATIONS; iteration += 1) {
    const tick = iteration + 1;
    const buildStart = performance.now();
    const observation = observe(harness, tick);
    const buildMs = performance.now() - buildStart;
    const started = performance.now();
    const result = recorder ? recorder.record(observation) : 0;
    const elapsed = performance.now() - started;
    if (result >= 0) written += 1;
    checksum += result + 1;
    if (iteration >= WARMUP_ITERATIONS) {
      samples.push(elapsed);
      buildSamples.push(buildMs);
      if (sink && sink.length < JSON_ITERATIONS) sink.push(observation);
    }
  }
  const wallMs = performance.now() - wallStart;
  const stats = recorder ? recorder.getStats() : null;
  if (recorder) recorder.dispose();
  return {
    repetition,
    enabled,
    recordLoopMs: summary(samples),
    frameBuildMs: summary(buildSamples),
    wallMs,
    checksum,
    written,
    heapBeforeBytes: heapBefore,
    heapAfterBytes: process.memoryUsage().heapUsed,
    forcedGc: typeof global.gc === 'function',
    exactCadenceBytes: null,
    recorderOwnership: stats,
  };
}

// Separate, clearly labelled region: per-tick JSON serialization versus the buffer write.
function measureJsonRegion() {
  const harness = buildHarness();
  const frames = [];
  for (let iteration = 0; iteration < JSON_ITERATIONS; iteration += 1) {
    frames.push(observe(harness, iteration + 1));
  }
  const recorder = telemetry.createTickSampleRecorder();
  recorder.openSegment(segmentInput('json-region'));
  const jsonSamples = [];
  const writeSamples = [];
  for (const frame of frames) {
    const jsonStart = performance.now();
    const encoded = JSON.stringify(frame);
    jsonSamples.push(performance.now() - jsonStart);
    checksumGuard(encoded.length);
    const writeStart = performance.now();
    recorder.record(frame);
    writeSamples.push(performance.now() - writeStart);
  }
  const stats = recorder.getStats();
  recorder.dispose();
  return {
    label: 'JSON_REGION_NOT_PART_OF_HOT_PATH_DELTA',
    iterations: JSON_ITERATIONS,
    jsonStringifyMs: summary(jsonSamples),
    bufferWriteMs: summary(writeSamples),
    ratioJsonOverWrite:
      summary(jsonSamples).p95 !== null && summary(writeSamples).p95
        ? summary(jsonSamples).p95 / summary(writeSamples).p95
        : null,
    recorderOwnership: stats,
  };
}

let guard = 0;
function checksumGuard(value) {
  guard = (guard + value) % 1000003;
}

// Separate, clearly labelled region: measured owned memory of the bounded buffers.
function measureMemoryRegion() {
  global.gc?.();
  const before = process.memoryUsage();
  const recorder = telemetry.createTickSampleRecorder();
  const afterCreate = process.memoryUsage();
  recorder.openSegment(segmentInput('memory-region'));
  const deep = buildHarness();
  for (let iteration = 0; iteration < SAMPLE_CAPACITY; iteration += 1) {
    recorder.record(observe(deep, iteration + 1));
  }
  const afterFill = process.memoryUsage();
  const stats = recorder.getStats();
  const expectedBufferBytes = telemetry.TICK_SAMPLE_BYTES_PER_SAMPLE * stats.capacity;
  recorder.dispose();
  const afterDispose = process.memoryUsage();
  const disposed = recorder.getStats();
  return {
    label: 'MEMORY_REGION_EXACT_TYPED_ARRAY_OWNERSHIP',
    capacity: stats.capacity,
    bytesPerSample: telemetry.TICK_SAMPLE_BYTES_PER_SAMPLE,
    expectedBufferBytes,
    reportedBufferBytes: stats.bufferBytes,
    bufferBytesMatch: stats.bufferBytes === expectedBufferBytes,
    identityCodeUnits: stats.identityCodeUnits,
    samplesRetained: stats.samplesRetained,
    arrayBuffersBeforeBytes: before.arrayBuffers,
    arrayBuffersAfterCreateBytes: afterCreate.arrayBuffers,
    arrayBuffersAfterFillBytes: afterFill.arrayBuffers,
    arrayBuffersAfterDisposeBytes: afterDispose.arrayBuffers,
    observedArrayBufferGrowthBytes: afterFill.arrayBuffers - before.arrayBuffers,
    heapUsedBeforeBytes: before.heapUsed,
    heapUsedAfterFillBytes: afterFill.heapUsed,
    disposedCountersZero:
      disposed.samplesRetained === 0 &&
      disposed.bufferBytes === 0 &&
      disposed.retainedBytes === 0 &&
      disposed.segmentsRetained === 0,
  };
}

function selfCheck() {
  const failures = [];
  const recorder = telemetry.createTickSampleRecorder();
  recorder.openSegment(segmentInput('self-check'));
  const harness = buildHarness();
  for (let iteration = 0; iteration < 30; iteration += 1) {
    recorder.record(observe(harness, iteration + 1));
  }
  recorder.closeSegment('SHUTDOWN');
  const segment = recorder.getSegment('self-check');
  if (!segment) failures.push('segment missing');
  else {
    if (segment.sampleCount !== 30) failures.push(`sampleCount ${segment.sampleCount}`);
    if (segment.learningEligible !== false) failures.push('MANUAL must not be learning-eligible');
    if (segment.controlMode !== 'MANUAL') failures.push('controlMode drifted');
    if (segment.profileId !== 'style-1') failures.push('profileId drifted');
  }
  for (let index = 0; index < 5; index += 1) {
    const readout = recorder.readSample('self-check', index);
    parseVehicleState(readout.observation.state);
    parseVehicleCommand(readout.observation.command);
    if (readout.learningEligible !== false) failures.push('readout eligibility drifted');
  }
  recorder.dispose();
  const disposed = recorder.getStats();
  if (!disposed.disposed) failures.push('dispose flag');
  if (disposed.bufferBytes !== 0) failures.push('buffers retained after dispose');
  return { passed: failures.length === 0, failures };
}

const capturedFrames = [];
const runs = [];
for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
  const last = repetition === REPETITIONS;
  runs.push(runArm(false, repetition, null));
  if (!baseline) runs.push(runArm(true, repetition, last ? capturedFrames : null));
}

const paired = [];
if (!baseline)
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    const off = runs.find((run) => run.repetition === repetition && !run.enabled);
    const on = runs.find((run) => run.repetition === repetition && run.enabled);
    paired.push({
      repetition,
      recordOnlyP50DeltaMs: on.recordLoopMs.p50 - off.recordLoopMs.p50,
      recordOnlyP95DeltaMs: on.recordLoopMs.p95 - off.recordLoopMs.p95,
      recordOnlyP99DeltaMs: on.recordLoopMs.p99 - off.recordLoopMs.p99,
      frameBuildP95Ms: on.frameBuildMs.p95,
      offRecordLoopP95Ms: off.recordLoopMs.p95,
      onRecordLoopP95Ms: on.recordLoopMs.p95,
      wallDeltaMs: on.wallMs - off.wallMs,
    });
  }

const report = {
  capturedAt: new Date().toISOString(),
  pbi: '085',
  mode: baseline ? 'BEFORE_TELEMETRY_DISABLED' : 'AFTER_TELEMETRY_RECORDER',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(sources.map((file) => [file, hash(file)])),
  sourceHashScope:
    'Probe, recorder module, authoritative input/class/context sources and the reused 044 fixture; not a verified transitive dependency closure',
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
    workload: `1 subject (${SUBJECT}) recorded,${vehiclesInFrame} authoritative vehicles in the 044 frame, real 036 signal controller advancing consecutive ticks, real 025 keyboard filter input`,
    seed: 'none; deterministic tick modulo input pattern and fixed grid fixture',
    capacity: SAMPLE_CAPACITY,
    jsonIterations: JSON_ITERATIONS,
    clock: 'performance.now only; fixed synthetic tick index (no wall clock in the fixture)',
    budget:
      'Added cost must stay far below the 5.5 ms provisional full-tick p95 ceiling; no isolated budget claimed',
    calibration: 'PROVISIONAL_UNCALIBRATED',
  },
  scope:
    'Native Node CPU and owned-memory cost of the 085 recorder on the reused 044 fixture. No renderer/browser/GPU/FPS/realtime-throughput claim.',
  runs,
  paired,
  jsonRegion: baseline ? null : measureJsonRegion(),
  memoryRegion: baseline ? null : measureMemoryRegion(),
  selfCheck: baseline ? null : selfCheck(),
  budgets: {
    manifest: 'Docs/performance-budgets.json',
    budgetVersion: '203-initial-1',
    capacityCalibration: 'PROVISIONAL_UNCALIBRATED',
    diagnosticsSamplesProposal: 4096,
    measuredCapacity: SAMPLE_CAPACITY,
    recorderRamBytesCap: 33554432,
    authoritativeTickP95MsDesktopProvisional: 5.5,
    authoritativeTickP95MsLaptopProvisional: 8,
  },
  exclusions: [
    'No browser, renderer, GPU or FPS measurement; the 052 record documents an unresolved WebGPU presentation stall on this laptop.',
    'Heap counters are diagnostic only; exact ownership is reported from the recorder typed-array counters.',
    'Forced GC between repetitions is not used inside the timed region.',
    'BEFORE is the same fixture with telemetry disabled, not a historical commit: 085 is purely additive.',
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
