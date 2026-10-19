// PBI 090 native probe. BEFORE reads the same real 044 fixture through 085 only; AFTER adds
// 090 compaction, chunk rollover, incremental finalization and safe copy-transfer. Run arms alone.
// Usage: volta run --node 24.21.0 --npm 11.19.0 -- node scripts/benchmark-telemetry-storage.mjs --baseline
//        volta run --node 24.21.0 --npm 11.19.0 -- node scripts/benchmark-telemetry-storage.mjs
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { parseVehicleCommand, parseVehicleState } from '../src/vehicles/index.ts';
import {
  createOpportunityRegistry,
  createSegmentCompaction,
  createTickSampleRecorder,
} from '../src/telemetry/index.ts';

const baseline = process.argv.includes('--baseline');
const EVIDENCE = 'Docs/Evidence/090-telemetry-storage';
const TICKS = 1200,
  WARMUP = 120,
  REPETITIONS = 5,
  CADENCE = 3;
const fixture = roadContextFixture(false);
const actor = fixture.frame.vehicles[0];
const sessionId = 'academy-1',
  worldEpoch = 2;
const sources = [
  'scripts/benchmark-telemetry-storage.mjs',
  'src/telemetry/segment-compaction.ts',
  'src/telemetry/tick-samples.ts',
  'src/telemetry/opportunities.ts',
  'tests/autonomy/road-context-reference.ts',
];
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] ?? null;
const stats = (values) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
});
function powerScheme() {
  try {
    return platform() === 'win32'
      ? execFileSync('powercfg', ['/getactivescheme'], { encoding: 'utf8' }).trim()
      : null;
  } catch {
    return null;
  }
}
function npmVersion() {
  try {
    return execFileSync(
      'volta',
      ['run', '--node', '24.21.0', '--npm', '11.19.0', '--', 'npm', '--version'],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    return null;
  }
}

function makeFrame(tick) {
  const state = parseVehicleState({
    schemaVersion: 1,
    units: 'SI',
    sessionId,
    worldEpoch,
    vehicleId: actor.id,
    classId: 'sedan',
    tick,
    transform: {
      positionM: { x: actor.positionM.x + tick * 0.01, y: actor.positionM.y, z: actor.positionM.z },
      rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    },
    velocityMps: { x: 0, y: 0, z: actor.speedMps },
    laneId: null,
    controlMode: 'MANUAL',
    appliedProfileVersion: 'style-v1',
    maneuverState: 'IDLE',
  });
  const command = parseVehicleCommand({
    schemaVersion: 1,
    units: 'SI',
    sessionId,
    worldEpoch,
    vehicleId: actor.id,
    tick,
    throttle: tick % 120 < 60 ? 0.5 : 0,
    brake: 0,
    steering: 0.1,
    handbrake: false,
    turnSignal: 'OFF',
    source: 'PLAYER',
  });
  return {
    tick,
    state,
    raw: { throttle: command.throttle, brake: 0, steering: 0.1, handbrake: false },
    command,
    physics: { longitudinalAccelerationMps2: 0, lateralAccelerationMps2: 0 },
    lane: null,
    signal: null,
  };
}
function openRecorder(id = 'ride') {
  const recorder = createTickSampleRecorder();
  recorder.openSegment({
    segmentId: id,
    sessionId,
    worldEpoch,
    vehicleId: actor.id,
    classId: 'sedan',
    controlMode: 'MANUAL',
    profileId: 'style-1',
    baseVersionId: 'style-v1',
    learningEpoch: 1,
    learningEligible: false,
    inputType: 'KEYBOARD',
    startTick: 0,
  });
  for (let tick = 0; tick < TICKS; tick++) recorder.record(makeFrame(tick));
  recorder.closeSegment('RIDE_COMPLETED');
  return recorder;
}
function makeFacts(registry, compactor) {
  const eventTicks = new Map();
  for (let tick = 30; tick < TICKS; tick += 90) {
    const records = registry.observe({
      tick,
      sessionId,
      worldEpoch,
      segmentId: 'ride',
      learningEligible: false,
      vehicleId: actor.id,
      incarnation: 'inc-1',
      signal: null,
      events: [],
      conclusions: [],
      stimuli: [{ kind: 'YIELD', tick, sourceKey: `yield-${tick}`, relatedIds: [`other-${tick}`] }],
    });
    for (const record of records) {
      compactor.recordOpportunity(record);
      eventTicks.set(record.id, record.openedTick);
    }
  }
  return eventTicks;
}

const repetitions = [];
let selfCheck = null;
for (let repetition = 0; repetition < REPETITIONS; repetition++) {
  const recorder = openRecorder();
  const readCost = [];
  if (baseline) {
    let checksum = 0;
    for (let index = 0; index < TICKS; index++) {
      const start = performance.now();
      const row = recorder.readSample('ride', index);
      const elapsed = performance.now() - start;
      if (index >= WARMUP) readCost.push(elapsed * 1000);
      checksum += row.observation.tick;
    }
    repetitions.push({
      repetition: repetition + 1,
      sourceReads: TICKS,
      directReadUs: stats(readCost),
      checksum,
      sourceOwnedBytes: recorder.getStats().bufferBytes,
    });
  } else {
    const compactor = createSegmentCompaction({
      recorder,
      segmentId: 'ride',
      options: { finalizeItemsPerStep: 4 },
    });
    const registry = createOpportunityRegistry();
    const opportunityTicks = makeFacts(registry, compactor);
    const eventFacts = new Map();
    for (const event of [
      { id: 'stop-crossing-511', kind: 'STOP_LINE_CROSSED', tick: 511 },
      { id: 'reaction-stimulus-512', kind: 'REACTION_STIMULUS', tick: 512 },
    ]) {
      compactor.recordEvent(event);
      eventFacts.set(event.id, event);
    }
    const compactionCalls = [],
      finalizeCalls = [];
    let complete = false;
    while (!complete) {
      const start = performance.now();
      const result = compactor.compactAvailable(32);
      const elapsed = performance.now() - start;
      compactionCalls.push(elapsed * 1000);
      complete = result.done;
    }
    if (!compactor.beginFinalize())
      throw new Error(`finalize refused: ${JSON.stringify(compactor.getStats())}`);
    while (compactor.state === 'FINALIZING') {
      const start = performance.now();
      compactor.finalizeStep();
      finalizeCalls.push((performance.now() - start) * 1000);
    }
    const chunks = compactor.getChunks();
    const retainedTicks = chunks.flatMap((chunk) => Array.from(chunk.samples.ticks));
    const retainedEvents = chunks.flatMap((chunk) => chunk.opportunities);
    const retainedFacts = chunks.flatMap((chunk) => chunk.events);
    const expectedTicks = Array.from(
      { length: Math.ceil(TICKS / CADENCE) },
      (_, index) => index * CADENCE,
    );
    const continuity = chunks.every(
      (chunk, index) =>
        chunk.sequence === index &&
        chunk.previousSequence === (index ? index - 1 : null) &&
        chunk.nextSequence === (index + 1 < chunks.length ? index + 1 : null),
    );
    const eventEquality =
      [...opportunityTicks].every(([id, tick]) =>
        retainedEvents.some((event) => event.id === id && event.openedTick === tick),
      ) && retainedEvents.length === new Set(retainedEvents.map((event) => event.id)).size;
    const explicitEventEquality =
      [...eventFacts].every(([id, fact]) =>
        retainedFacts.some(
          (event) => event.id === id && event.kind === fact.kind && event.tick === fact.tick,
        ),
      ) && retainedFacts.length === new Set(retainedFacts.map((event) => event.id)).size;
    let detachedFalse = false,
      liveAfterTransfer = false,
      copyDetached = false,
      cloneTicks = 0,
      transferPayloadBytes = 0;
    if (repetition === 0) {
      const handle = compactor.acquireTransfer(0);
      if (!handle) throw new Error('first transfer unavailable');
      const transferBuffers = Object.values(handle.samples).map((array) => array.buffer);
      const clone = structuredClone(handle, { transfer: transferBuffers });
      copyDetached = Object.values(handle.samples).every((array) => array.byteLength === 0);
      cloneTicks = clone.samples.ticks.length;
      transferPayloadBytes = handle.payloadBytes;
      detachedFalse = copyDetached && cloneTicks > 0;
      const before = recorder.readSample('ride', 0).observation.tick;
      recorder.openSegment({
        segmentId: 'live-after-transfer',
        sessionId,
        worldEpoch,
        vehicleId: actor.id,
        classId: 'sedan',
        controlMode: 'MANUAL',
        profileId: 'style-1',
        baseVersionId: 'style-v1',
        learningEpoch: 1,
        learningEligible: false,
        inputType: 'KEYBOARD',
        startTick: TICKS,
      });
      recorder.record(makeFrame(TICKS));
      liveAfterTransfer =
        before === 0 && recorder.readSample('live-after-transfer', 0).observation.tick === TICKS;
    }
    if (repetition === 0) {
      selfCheck = {
        continuity,
        eventTickEquality: eventEquality,
        stopAndReactionTickEquality: explicitEventEquality,
        noDuplicateEvents: retainedEvents.length === opportunityTicks.size,
        exactAnalysisTicks: JSON.stringify(retainedTicks) === JSON.stringify(expectedTicks),
        detachedFalse,
        copyDetached,
        cloneTickCount: cloneTicks,
        liveAfterTransfer,
        chunks: chunks.length,
        retainedTicks: retainedTicks.length,
        opportunityIds: retainedEvents.length,
        eventFacts: retainedFacts.length,
      };
      if (!Object.values(selfCheck).every((value) => typeof value !== 'boolean' || value))
        throw new Error(`self-check failed: ${JSON.stringify(selfCheck)}`);
    }
    repetitions.push({
      repetition: repetition + 1,
      sourceRows: TICKS,
      compactionCallUs: stats(compactionCalls),
      finalizeStepUs: stats(finalizeCalls),
      chunks: chunks.length,
      chunkPayloadBytes: chunks.map((chunk) => chunk.payloadBytes),
      retainedBytes: compactor.getStats().retainedBytes,
      maxStepItems: compactor.getStats().maxFinalizeItems,
      transferPayloadBytes: transferPayloadBytes || chunks[0]?.payloadBytes || 0,
      stats: compactor.getStats(),
    });
    compactor.dispose();
    registry.dispose();
  }
  recorder.dispose();
}
const result = {
  schemaVersion: 1,
  fixtureVersion: '090-telemetry-storage-native-v1',
  arm: baseline ? 'BEFORE_085_DIRECT_READ' : 'AFTER_090_COMPACTION',
  fixture: {
    mapId: fixture.map.mapId,
    source: 'tests/autonomy/road-context-reference.ts:roadContextFixture(false)',
    ticks: TICKS,
    warmupTicks: WARMUP,
    analysisHz: 20,
    tickHz: 60,
    repetitions: REPETITIONS,
  },
  runtime: { node: process.version, npm: npmVersion() },
  hardware: {
    cpu: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    platform: platform(),
    release: release(),
    powerScheme: powerScheme(),
  },
  budgetVersion: '203-initial-1',
  budgets: { recorderRamBytes: 33554432, pendingWorkerPayloadBytes: 16777216, sliceMaximumMs: 10 },
  calibration: 'PROVISIONAL_UNCALIBRATED',
  sourceHashes: Object.fromEntries(sources.map((file) => [file, sha(file)])),
  repetitions,
  selfCheck,
};
mkdirSync(EVIDENCE, { recursive: true });
const stem = baseline ? 'native-before-01' : 'native-after-01';
writeFileSync(`${EVIDENCE}/${stem}.json`, `${JSON.stringify(result, null, 2)}\n`);
const text =
  [
    `PBI 090 native telemetry storage probe`,
    `arm: ${result.arm}`,
    `fixture: ${result.fixtureVersion}`,
    `runtime: ${result.runtime.node}`,
    `map: ${fixture.map.mapId}`,
    `repetitions: ${REPETITIONS}`,
    `calibration: PROVISIONAL_UNCALIBRATED`,
    ...repetitions.map((item) => JSON.stringify(item)),
    ...(selfCheck ? [`selfCheck: ${JSON.stringify(selfCheck)}`] : []),
  ].join('\n') + '\n';
writeFileSync(`${EVIDENCE}/${stem}.txt`, text);
process.stdout.write(text);
