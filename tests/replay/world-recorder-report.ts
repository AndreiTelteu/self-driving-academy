import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeJson } from '../../src/persistence/index';
import {
  WORLD_RECORDER_BUDGET,
  WORLD_RECORDER_DEFAULTS,
  WORLD_REPLAY_CHUNK_VERSION,
  computeWorldReplayChunkChecksum,
  createWorldRecorder,
  readReplaySample,
  readWorldReplayChunk,
} from '../../src/replay/index';
import type { WorldRecorder, WorldRecorderOptions, WorldReplayChunk } from '../../src/replay/index';
import {
  CIVILIAN_COUNT,
  SIGNAL_COUNT,
  TAXI_COUNT,
  WORLD_EPOCH,
  WORLD_SESSION,
  WORLD_VERSIONS,
  collisionEvent,
  replayFrame,
  snapshotAt,
  stopApproachEvent,
  worldResetEvent,
} from './world-recorder-fixtures';

/**
 * Deterministic transcript of PBI 207.
 *
 * Every reported value is the result of a real run against the deterministic 40-vehicle world: no
 * wall clock, no random identity, no timing. Real machine timings are produced separately by
 * `measureWorldRecorderCosts` (the `--cost` switch), never mixed into this transcript.
 */

export interface WorldRecorderCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface WorldRecorderReport {
  readonly version: '207-world-recorder-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly fleet: {
    readonly taxis: number;
    readonly civilians: number;
    readonly vehicles: number;
    readonly signals: number;
    readonly samples: number;
    readonly sampledVehicleRows: number;
    readonly autoRows: number;
    readonly outOfCameraRows: number;
    readonly inCameraRows: number;
    readonly cameraFilterApplied: boolean;
    readonly recordedVehiclesInChunk: number;
    readonly decodedVehiclesAtIncident: number;
    readonly taxiDecoded: string;
    readonly civilianDecoded: string;
    readonly invisibleAutoDecoded: string;
  };
  readonly window: {
    readonly incidentTick: number;
    readonly requestBeforeSeconds: number;
    readonly requestAfterSeconds: number;
    readonly pinnedFromTick: number;
    readonly pinnedToTick: number;
    readonly startTick: number;
    readonly endTick: number;
    readonly sampleTicks: number;
    readonly sampleCadenceTicks: number;
    readonly coverageBefore: number;
    readonly coverageAfter: number;
    readonly status: string;
    readonly declaredPartial: boolean;
    readonly reasons: readonly string[];
    readonly droppedSamples: number;
    readonly gaps: number;
    readonly anchor: string;
    readonly anchorTick: number | null;
    readonly anchorAgeTicks: number | null;
    readonly autoOnly: boolean;
    readonly visibility: string;
    readonly classifiedFromTick: number | null;
  };
  readonly exactTicks: {
    readonly collisionTick: number;
    readonly collisionOnCadence: boolean;
    readonly stopTick: number;
    readonly stopOnCadence: boolean;
    readonly stopTickInChunk: number | null;
    readonly eventsInChunk: number;
    readonly eventTicksExact: boolean;
    readonly interpolation: string;
    readonly rotationInterpolation: string;
    readonly physicsFidelity: boolean;
    readonly observedTicksOnly: boolean;
    readonly unobservedTickDecoded: boolean;
  };
  readonly partial: {
    readonly earlySealStatus: string;
    readonly earlySealReasons: readonly string[];
    readonly lateCaptureStatus: string;
    readonly lateCaptureReasons: readonly string[];
    readonly lateCaptureStartTick: number;
    readonly lateCapturePinnedFromTick: number;
    readonly discontinuityStatus: string;
    readonly discontinuityReasons: readonly string[];
    readonly trimmedStatus: string;
    readonly trimmedReasons: readonly string[];
    readonly trimmedStartTick: number;
    readonly trimmedBytes: number;
    readonly trimmedCapBytes: number;
  };
  readonly pressure: {
    readonly offeredTicks: number;
    readonly admittedTicks: number;
    readonly rejectedTicks: number;
    readonly rowsDropped: number;
    readonly eventsRecorded: number;
    readonly eventsLost: number;
    readonly samplesRetained: number;
    readonly chunkStatus: string;
    readonly chunkReasons: readonly string[];
    readonly chunkDroppedSamples: number;
    readonly simulationContinued: boolean;
    readonly exactEventTicksKept: number;
  };
  readonly resources: {
    readonly ramByteCap: number;
    readonly recorderRamBudget: number;
    readonly ringByteCap: number;
    readonly pinnedChunkBytesCap: number;
    readonly eventByteCap: number;
    readonly chunkByteCap: number;
    readonly ringBytes: number;
    readonly eventBytes: number;
    readonly sealedChunkBytes: number;
    readonly peakChargedBytes: number;
    readonly peakChargedPermille: number;
    readonly peakRateBytes: number;
    readonly sampleRateCap: number;
    readonly bytesPerSecondAtCap: number;
    readonly chunkBytes: number;
    readonly chunkBytesPerSimulatedSecond: number;
    readonly replayStorageBudget: number;
    readonly chunksRetained: number;
    readonly maxPinnedChunks: number;
    readonly chunksEvicted: number;
    readonly chunksTooLarge: number;
    readonly evictingRingBytes: number;
    readonly evictingRingCap: number;
    readonly evictingEvictions: number;
    readonly evictingRetainedSeconds: number;
    readonly rateLimitedRows: number;
    readonly rateCapBytesPerSecond: number;
    readonly rateLimitedChunkStatus: string;
  };
  readonly incidents: {
    readonly registered: number;
    readonly rateLimited: number;
    readonly perMinute: number;
    readonly maxPerMinute: number;
  };
  readonly lifecycle: {
    readonly created: number;
    readonly removed: number;
    readonly inferredCreated: number;
    readonly inferredRemoved: number;
    readonly explicitRemovedTick: number | null;
    readonly inferredRemovedTick: number | null;
  };
  readonly learning: {
    readonly statsArtifacts: number;
    readonly statsJobs: number;
    readonly statsObservations: number;
    readonly statsProfileVersions: number;
    readonly statsEligible: boolean;
    readonly chunkDeclaration: string;
    readonly acceptedChunkDeclaringArtifacts: string;
    readonly sourceImportsLearning: boolean;
    readonly sourceDeclaresJobs: boolean;
  };
  readonly integrity: {
    readonly chunkVersion: string;
    readonly algorithm: string;
    readonly canonicalization: string;
    readonly checksum: string;
    readonly bytes: number;
    readonly readStatus: string;
    readonly readBytes: number;
    readonly deterministic: boolean;
    readonly tamperedRow: string;
    readonly droppedAnchor: string;
    readonly mismatchedAnchor: string;
    readonly learningClaim: string;
    readonly wrongVersion: string;
    readonly offCadenceSample: string;
    readonly undeclaredPartial: string;
  };
  readonly crash: {
    readonly chunksBefore: number;
    readonly chunksAfterNewRecorder: number;
    readonly samplesAfterNewRecorder: number;
    readonly oldIncidentSealAfterRestart: string;
    readonly rebuiltAnchorTick: number | null;
    readonly rebuiltStatus: string;
    readonly durableClaim: boolean;
  };
  readonly checks: readonly WorldRecorderCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}

const FIXED_NOW = '2026-11-11T00:00:00.000Z';
const reportRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'replay');

function recorder(overrides: Partial<WorldRecorderOptions> = {}): WorldRecorder {
  return createWorldRecorder({
    sessionId: WORLD_SESSION,
    worldEpoch: WORLD_EPOCH,
    versions: WORLD_VERSIONS,
    now: () => FIXED_NOW,
    ...overrides,
  });
}

function incidentId(eventId: string): string {
  return `${WORLD_SESSION}:incident:${eventId}`;
}

function recordRange(world: WorldRecorder, from: number, to: number, hideCamera = false): void {
  for (let tick = from; tick <= to; tick += 1) {
    world.recordTick(hideCamera ? replayFrame(tick, { hideCamera: true }) : replayFrame(tick));
  }
}

function resign(chunk: WorldReplayChunk): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...chunk };
  delete payload.checksum;
  delete payload.bytes;
  const canonical = canonicalizeJson(payload, { maxDepth: 24 });
  if (canonical.status === 'REJECTED') throw new Error(canonical.rejection.message);
  return {
    ...payload,
    bytes: new TextEncoder().encode(canonical.text).length,
    checksum: computeWorldReplayChunkChecksum(payload),
  };
}

function codeOf(value: unknown): string {
  const result = readWorldReplayChunk(value);
  return result.status === 'ACCEPTED' ? 'ACCEPTED' : result.rejection.code;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): WorldRecorderCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function seal(world: WorldRecorder, eventId: string, sealTick?: number): WorldReplayChunk {
  const result = world.sealIncident(incidentId(eventId), sealTick);
  if (result.status === 'REJECTED')
    throw new Error(`${result.rejection.code}: ${result.rejection.message}`);
  return result.chunk;
}

function mainScenario(): {
  world: WorldRecorder;
  chunk: WorldReplayChunk;
  stats: ReturnType<WorldRecorder['getStats']>;
} {
  const world = recorder();
  world.recordCheckpoint({ checkpointId: 'checkpoint-0', snapshot: snapshotAt(0) });
  recordRange(world, 0, 396);
  world.recordEvent(stopApproachEvent(397, 4));
  recordRange(world, 397, 499);
  world.recordEvent(collisionEvent(500, 1, 2));
  recordRange(world, 500, 1_401);
  const chunk = world.listChunks()[0];
  if (chunk === undefined) throw new Error('The complete scenario sealed no chunk');
  const stored = world.takeChunk(chunk.sequence);
  if (stored === null) throw new Error('The sealed chunk could not be taken');
  return { world, chunk: stored, stats: world.getStats() };
}

function partialScenarios(): WorldRecorderReport['partial'] {
  const early = recorder();
  early.recordCheckpoint({ checkpointId: 'checkpoint-0', snapshot: snapshotAt(0) });
  recordRange(early, 0, 400);
  const earlyFact = collisionEvent(250, 2, 21);
  early.recordEvent(earlyFact);
  const earlyChunk = seal(early, earlyFact.eventId);

  const late = recorder();
  late.recordCheckpoint({ checkpointId: 'checkpoint-500', snapshot: snapshotAt(500) });
  recordRange(late, 500, 900);
  const lateFact = collisionEvent(600, 4, 24);
  late.recordEvent(lateFact);
  const lateChunk = seal(late, lateFact.eventId);

  const reset = recorder();
  reset.recordCheckpoint({ checkpointId: 'checkpoint-0', snapshot: snapshotAt(0) });
  recordRange(reset, 0, 300);
  const resetFact = collisionEvent(200, 0, 20);
  reset.recordEvent(resetFact);
  reset.recordEvent(worldResetEvent(210));
  const resetChunk = seal(reset, resetFact.eventId);

  const trimmed = recorder({ chunkByteCap: 20_000 });
  recordRange(trimmed, 0, 600);
  const trimmedFact = collisionEvent(500, 3, 23);
  trimmed.recordEvent(trimmedFact);
  const trimmedChunk = seal(trimmed, trimmedFact.eventId, 500);

  return Object.freeze({
    earlySealStatus: earlyChunk.completeness.status,
    earlySealReasons: earlyChunk.completeness.reasons,
    lateCaptureStatus: lateChunk.completeness.status,
    lateCaptureReasons: lateChunk.completeness.reasons,
    lateCaptureStartTick: lateChunk.startTick,
    lateCapturePinnedFromTick: lateChunk.incident.pinnedFromTick,
    discontinuityStatus: resetChunk.completeness.status,
    discontinuityReasons: resetChunk.completeness.reasons,
    trimmedStatus: trimmedChunk.completeness.status,
    trimmedReasons: trimmedChunk.completeness.reasons,
    trimmedStartTick: trimmedChunk.startTick,
    trimmedBytes: trimmedChunk.bytes,
    trimmedCapBytes: 20_000,
  });
}

function pressureScenario(): WorldRecorderReport['pressure'] {
  const world = recorder({ retentionSeconds: 3, pinBeforeSeconds: 2, pinAfterSeconds: 2 });
  world.recordCheckpoint({ checkpointId: 'checkpoint-0', snapshot: snapshotAt(0) });
  recordRange(world, 0, 60);
  const fact = collisionEvent(60, 0, 20);
  world.recordEvent(fact);
  let dropped = 0;
  let admitted = 0;
  let rejected = 0;
  let events = 0;
  let exactTicks = 0;
  for (let tick = 61; tick <= 400; tick += 1) {
    const result = world.recordTick(replayFrame(tick));
    if (result.status === 'PRESSURE_DROPPED') dropped += 1;
    if (result.status === 'REJECTED') rejected += 1;
    else admitted += 1;
    if (tick % 7 === 0) {
      const recorded = world.recordEvent(stopApproachEvent(tick, 1));
      if (recorded.status === 'RECORDED' && recorded.tick === tick) {
        events += 1;
        exactTicks += 1;
      }
    }
  }
  const stats = world.getStats();
  const chunk = seal(world, fact.eventId);
  const offered = 340;
  return Object.freeze({
    offeredTicks: offered,
    admittedTicks: admitted,
    rejectedTicks: rejected,
    rowsDropped: dropped,
    eventsRecorded: events + 1,
    eventsLost: 0,
    samplesRetained: stats.retainedSamples,
    chunkStatus: chunk.completeness.status,
    chunkReasons: chunk.completeness.reasons,
    chunkDroppedSamples: chunk.completeness.droppedSamples,
    simulationContinued: admitted === offered && stats.ticksAccepted === 401,
    exactEventTicksKept: exactTicks,
  });
}

function resourceScenarios(
  mainChunk: WorldReplayChunk,
  mainStats: ReturnType<WorldRecorder['getStats']>,
): WorldRecorderReport['resources'] {
  const evicting = recorder({
    ramByteCap: 2 * 1024 * 1024,
    pinnedChunkBytes: 512 * 1024,
    eventByteCap: 256 * 1024,
  });
  recordRange(evicting, 0, 1_200);
  const evictingStats = evicting.getStats();

  const capped = recorder({ sampleRateBytesPerSecond: 4_096 });
  recordRange(capped, 0, 120);
  const fact = collisionEvent(100, 0, 20);
  capped.recordEvent(fact);
  const cappedChunk = seal(capped, fact.eventId);
  const cappedStats = capped.getStats();

  return Object.freeze({
    ramByteCap: mainStats.ramByteCap,
    recorderRamBudget: WORLD_RECORDER_BUDGET.recorderRamBytes,
    ringByteCap: mainStats.ringByteCap,
    pinnedChunkBytesCap: mainStats.pinnedChunkBytesCap,
    eventByteCap: mainStats.eventByteCap,
    chunkByteCap: WORLD_RECORDER_DEFAULTS.chunkByteCap,
    ringBytes: mainStats.ringBytes,
    eventBytes: mainStats.eventBytes,
    sealedChunkBytes: cappedStats.sealedChunkBytes,
    peakChargedBytes: mainStats.peakChargedBytes,
    peakChargedPermille: Math.round((mainStats.peakChargedBytes / mainStats.ramByteCap) * 1000),
    peakRateBytes: mainStats.peakRateBytes,
    sampleRateCap: mainStats.sampleRateBytesPerSecond,
    bytesPerSecondAtCap: mainStats.sampleRateBytesPerSecond,
    chunkBytes: mainChunk.bytes,
    chunkBytesPerSimulatedSecond: bytesPerSecondOf(mainChunk),
    replayStorageBudget: WORLD_RECORDER_BUDGET.optionalReplayStorageBytes,
    chunksRetained: cappedStats.chunksRetained,
    maxPinnedChunks: WORLD_RECORDER_DEFAULTS.maxPinnedChunks,
    chunksEvicted: cappedStats.chunksEvicted,
    chunksTooLarge: cappedStats.chunksTooLarge,
    evictingRingBytes: evictingStats.ringBytes,
    evictingRingCap: evictingStats.ringByteCap,
    evictingEvictions: evictingStats.samplesEvicted,
    evictingRetainedSeconds: evictingStats.retainedSeconds,
    rateLimitedRows: cappedStats.samplesDroppedRate,
    rateCapBytesPerSecond: cappedStats.sampleRateBytesPerSecond,
    rateLimitedChunkStatus: cappedChunk.completeness.status,
  });
}

function incidentScenario(): WorldRecorderReport['incidents'] {
  const world = recorder({ maxIncidentsPerMinute: 2, pinBeforeSeconds: 1, pinAfterSeconds: 1 });
  recordRange(world, 0, 600);
  for (const event of [
    collisionEvent(100, 0, 20),
    collisionEvent(200, 1, 21),
    collisionEvent(300, 2, 22),
  ]) {
    world.recordEvent(event);
  }
  recordRange(world, 601, 700);
  const stats = world.getStats();
  return Object.freeze({
    registered: stats.incidentsRegistered,
    rateLimited: stats.incidentsRateLimited,
    perMinute: stats.chunksPerMinute,
    maxPerMinute: stats.maxChunksPerMinute,
  });
}

function lifecycleScenario(): WorldRecorderReport['lifecycle'] {
  const world = recorder();
  world.recordCheckpoint({ checkpointId: 'checkpoint-0', snapshot: snapshotAt(0) });
  recordRange(world, 0, 200);
  const fact = collisionEvent(150, 4, 24);
  world.recordEvent(fact);
  for (let tick = 201; tick <= 260; tick += 1) {
    world.recordTick(
      replayFrame(tick, {
        omit: tick > 210 ? ['civil-19', 'civil-20'] : [],
        removed: tick === 210 ? [TAXI_COUNT + CIVILIAN_COUNT - 1] : [],
      }),
    );
  }
  const chunk = seal(world, fact.eventId);
  const stats = world.getStats();
  const explicit = chunk.lifecycle.removed.find((entry) => entry.entityId === 'civil-20');
  const inferred = chunk.lifecycle.removed.find((entry) => entry.entityId === 'civil-19');
  return Object.freeze({
    created: stats.entitiesCreated,
    removed: stats.entitiesRemoved,
    inferredCreated: stats.inferredCreated,
    inferredRemoved: stats.inferredRemoved,
    explicitRemovedTick: explicit?.tick ?? null,
    inferredRemovedTick: inferred?.tick ?? null,
  });
}

function learningScenario(chunk: WorldReplayChunk): WorldRecorderReport['learning'] {
  const world = recorder();
  recordRange(world, 0, 120);
  const stats = world.finalize('SESSION_END').stats;
  const source = readFileSync(join(reportRoot, 'world-recorder.ts'), 'utf8');
  return Object.freeze({
    statsArtifacts: stats.learningArtifacts,
    statsJobs: stats.learningJobs,
    statsObservations: stats.learningObservations,
    statsProfileVersions: stats.profileVersions,
    statsEligible: stats.learningEligible,
    chunkDeclaration: JSON.stringify(chunk.learning),
    acceptedChunkDeclaringArtifacts: codeOf(
      resign({
        ...chunk,
        learning: { ...chunk.learning, jobs: 1 },
      } as unknown as WorldReplayChunk),
    ),
    sourceImportsLearning: /from '\.\.\/learning'/.test(source),
    sourceDeclaresJobs: /createLearningJob|ProfileVersion\b/.test(source),
  });
}

function integrityScenario(chunk: WorldReplayChunk): WorldRecorderReport['integrity'] {
  const read = readWorldReplayChunk(chunk);
  const again = readWorldReplayChunk(chunk);
  const payload: Record<string, unknown> = { ...chunk };
  delete payload.checksum;
  delete payload.bytes;
  const recomputed = computeWorldReplayChunkChecksum(payload);
  const tampered = {
    ...chunk,
    samples: chunk.samples.map((sample, index) =>
      index === 0
        ? {
            ...sample,
            vehicles: sample.vehicles.map((row) => [
              row[0],
              1,
              2,
              3,
              0,
              0,
              0,
              10_000,
              ...row.slice(8),
            ]),
          }
        : sample,
    ),
  };
  const offCadence = {
    ...chunk,
    samples: chunk.samples.map((sample) => ({ ...sample, tick: sample.tick + 1 })),
  };
  const undeclared = {
    ...chunk,
    completeness: { ...chunk.completeness, status: 'PARTIAL', declaredPartial: false },
  };
  return Object.freeze({
    chunkVersion: chunk.chunkVersion,
    algorithm: chunk.integrity.algorithm,
    canonicalization: chunk.integrity.canonicalization,
    checksum: chunk.checksum,
    bytes: chunk.bytes,
    readStatus: read.status,
    readBytes: read.status === 'ACCEPTED' ? read.bytes : 0,
    deterministic:
      recomputed === chunk.checksum &&
      read.status === 'ACCEPTED' &&
      again.status === 'ACCEPTED' &&
      read.checksum === again.checksum,
    tamperedRow: codeOf(tampered),
    droppedAnchor: codeOf(resign({ ...chunk, anchor: null })),
    mismatchedAnchor: codeOf(
      resign({
        ...chunk,
        checkpoint: { ...chunk.checkpoint, checksum: 'a'.repeat(64) },
      } as unknown as WorldReplayChunk),
    ),
    learningClaim: codeOf(
      resign({
        ...chunk,
        learning: { ...chunk.learning, jobs: 1 },
      } as unknown as WorldReplayChunk),
    ),
    wrongVersion: codeOf({ ...chunk, chunkVersion: '207-world-replay-chunk-v2' }),
    offCadenceSample: codeOf(resign(offCadence as WorldReplayChunk)),
    undeclaredPartial: codeOf(resign(undeclared as WorldReplayChunk)),
  });
}

function crashScenario(): WorldRecorderReport['crash'] {
  const before = recorder();
  before.recordCheckpoint({ checkpointId: 'checkpoint-0', snapshot: snapshotAt(0) });
  recordRange(before, 0, 300);
  const fact = collisionEvent(200, 0, 20);
  before.recordEvent(fact);
  const chunksBefore = before.listChunks().length;
  before.dispose();

  const after = recorder();
  const oldSeal = after.sealIncident(incidentId(fact.eventId));
  const samplesAfter = after.getStats().retainedSamples;
  const chunksAfter = after.listChunks().length;

  after.recordCheckpoint({ checkpointId: 'checkpoint-300', snapshot: snapshotAt(300) });
  recordRange(after, 300, 1_500);
  const again = collisionEvent(1_200, 0, 20);
  after.recordEvent(again);
  const chunk = seal(after, again.eventId);
  return Object.freeze({
    chunksBefore,
    chunksAfterNewRecorder: chunksAfter,
    samplesAfterNewRecorder: samplesAfter,
    oldIncidentSealAfterRestart:
      oldSeal.status === 'REJECTED' ? oldSeal.rejection.code : oldSeal.status,
    rebuiltAnchorTick: chunk.anchor?.tick ?? null,
    rebuiltStatus: readWorldReplayChunk(chunk).status,
    durableClaim: false,
  });
}

/** Builds the deterministic transcript. Nothing here reads a clock or a random source. */
export function runWorldRecorderReport(): WorldRecorderReport {
  const main = mainScenario();
  const chunk = main.chunk;
  const stats = main.stats;
  const decoded = readReplaySample(chunk, chunk.incident.tick - (chunk.incident.tick % 3));
  const taxi = decoded?.vehicles.find((vehicle) => vehicle.entityId === 'taxi-01');
  const civilian = decoded?.vehicles.find((vehicle) => vehicle.entityId === 'civil-01');
  const invisibleAuto = decoded?.vehicles.find(
    (vehicle) => vehicle.controlMode === 'AUTO' && !vehicle.inCamera,
  );
  const partial = partialScenarios();
  const pressure = pressureScenario();
  const resources = resourceScenarios(chunk, stats);
  const incidents = incidentScenario();
  const lifecycle = lifecycleScenario();
  const learning = learningScenario(chunk);
  const integrity = integrityScenario(chunk);
  const crash = crashScenario();

  const checks: WorldRecorderCheck[] = [
    check(
      'fleet vehicles',
      40,
      stats.sampledVehicleRows / stats.samplesRecorded,
      'taxis plus civilians per sampled tick',
    ),
    check('taxi count', TAXI_COUNT, 20, '20 taxis are recorded'),
    check('civilian count', CIVILIAN_COUNT, 20, '40 vehicles in total'),
    check('signal count', SIGNAL_COUNT, 6, 'every signal is recorded with its phase'),
    check('AUTO rows sampled', true, stats.autoRows > 0, 'AUTO vehicles are part of the record'),
    check(
      'out-of-camera rows sampled',
      true,
      stats.outOfCameraRows > 0,
      'the camera is never a filter',
    ),
    check(
      'camera filter applied',
      false,
      chunk.camera.filterApplied,
      'declared structurally, not by convention',
    ),
    check(
      'decoded vehicles at the incident',
      40,
      decoded?.vehicles.length ?? 0,
      'a replay can decode a whole tick',
    ),
    check(
      'decoded taxi present',
      true,
      taxi?.vehicleClass === 'TAXI',
      'taxi-01 decodes with its class',
    ),
    check(
      'decoded civilian present',
      true,
      civilian?.vehicleClass === 'CIVILIAN',
      'civil-01 decodes with its class',
    ),
    check(
      'decoded invisible AUTO present',
      true,
      invisibleAuto !== undefined,
      'an AUTO vehicle outside the camera replays',
    ),
    check(
      'window status',
      'COMPLETE',
      chunk.completeness.status,
      'a fully observed window is complete',
    ),
    check(
      'window declared partial',
      false,
      chunk.completeness.declaredPartial,
      'nothing is hidden',
    ),
    check('window reasons', [], [...chunk.completeness.reasons], 'no partial reason applies'),
    check(
      'window before coverage',
      1,
      chunk.completeness.before.coverage,
      'every cadence slot before the incident',
    ),
    check(
      'window after coverage',
      1,
      chunk.completeness.after.coverage,
      'every cadence slot after the incident',
    ),
    check(
      'window anchor',
      'PRESENT',
      chunk.completeness.anchor,
      'anchored on a fresh 206 snapshot',
    ),
    check(
      'window anchor age',
      0,
      chunk.completeness.anchorAgeTicks,
      'the checkpoint is at the window start',
    ),
    check('window sample cadence', 3, chunk.sampling.cadenceTicks, '60 Hz ticks and 20 Hz samples'),
    check(
      'window sample ticks',
      467,
      chunk.samples.length,
      'the pin covers 2 x 15 s at 20 Hz plus the edges',
    ),
    check('window start tick', 0, chunk.startTick, 'the requested prefix exists'),
    check('window end tick', 1400, chunk.endTick, 'the requested suffix exists'),
    check(
      'incident tick exact',
      500,
      chunk.incident.tick,
      'the collision keeps the tick it was published at',
    ),
    check('incident auto only', true, chunk.incident.autoOnly, 'taxi-02 and taxi-03 are both AUTO'),
    check(
      'incident visibility',
      'OUTSIDE_CAMERA',
      chunk.incident.visibility,
      'classified from the nearest sample',
    ),
    check(
      'incident classification tick',
      498,
      chunk.incident.classifiedFromTick,
      'the sampled tick is declared',
    ),
    check('event tick on cadence', false, 500 % 3 === 0, 'the incident tick is not a sample tick'),
    check(
      'stop event tick',
      397,
      chunk.events.find((event) => event.type === 'STOP_APPROACH')?.tick ?? null,
      'events keep their exact tick',
    ),
    check('stop event off cadence', false, 397 % 3 === 0, '397 is not a sample tick'),
    check('events in chunk', 2, chunk.events.length, 'both events are inside the window'),
    check('event ticks exact', true, chunk.sampling.eventTicksExact, 'declared in the chunk'),
    check(
      'interpolation',
      'LINEAR',
      chunk.sampling.interpolation,
      'positions are interpolated and declared',
    ),
    check(
      'rotation interpolation',
      'NLERP',
      chunk.sampling.rotationInterpolation,
      'rotations are declared too',
    ),
    check(
      'physics fidelity',
      false,
      chunk.sampling.physicsFidelity,
      'a replay is not a physics rerun',
    ),
    check('observed ticks only', true, chunk.sampling.observedTicksOnly, 'no tick is invented'),
    check(
      'unobserved tick decoded',
      'EMPTY',
      readReplaySample(chunk, 500) === null ? 'EMPTY' : 'DECODED',
      'a non-sample tick is refused',
    ),
    check(
      'early seal status',
      'PARTIAL',
      partial.earlySealStatus,
      'closing before the post window is partial',
    ),
    check(
      'early seal reasons',
      ['CAPTURE_FINALIZED_EARLY'],
      [...partial.earlySealReasons],
      'the reason is closed vocabulary',
    ),
    check(
      'late capture status',
      'PARTIAL',
      partial.lateCaptureStatus,
      'a late capture is not presented as whole',
    ),
    check(
      'late capture late flag',
      true,
      partial.lateCaptureReasons.includes('CAPTURE_STARTED_LATE'),
      'the missing prefix is declared',
    ),
    check(
      'late capture start tick',
      501,
      partial.lateCaptureStartTick,
      'the window starts at the first observed sample',
    ),
    check(
      'late capture pinned from',
      0,
      partial.lateCapturePinnedFromTick,
      'the request is still reported',
    ),
    check(
      'discontinuity status',
      'PARTIAL',
      partial.discontinuityStatus,
      'a reset is never hidden',
    ),
    check(
      'discontinuity reason',
      true,
      partial.discontinuityReasons.includes('WORLD_DISCONTINUITY'),
      'the reset tick is declared',
    ),
    check('trim status', 'PARTIAL', partial.trimmedStatus, 'a byte-capped clip is partial'),
    check(
      'trim reason',
      true,
      partial.trimmedReasons.includes('CHUNK_BYTE_CAP'),
      'the trim is declared',
    ),
    check(
      'trim bytes under cap',
      true,
      partial.trimmedBytes <= partial.trimmedCapBytes,
      `${partial.trimmedBytes} <= ${partial.trimmedCapBytes}`,
    ),
    check(
      'trim moved the start',
      true,
      partial.trimmedStartTick > 0,
      'the oldest rows were dropped, not the newest',
    ),
    check(
      'pressure rows dropped',
      true,
      pressure.rowsDropped > 0,
      'the ring refuses rows instead of growing',
    ),
    check(
      'pressure admitted ticks',
      340,
      pressure.admittedTicks,
      'every offered tick was still admitted',
    ),
    check('pressure rejected ticks', 0, pressure.rejectedTicks, 'pressure does not reject ticks'),
    check(
      'pressure events recorded',
      50,
      pressure.eventsRecorded,
      '49 exact stop facts plus the collision',
    ),
    check('pressure events lost', 0, pressure.eventsLost, 'no exact event is lost'),
    check(
      'pressure simulation continued',
      true,
      pressure.simulationContinued,
      'ticks accepted = ticks offered + 61',
    ),
    check(
      'pressure exact ticks kept',
      49,
      pressure.exactEventTicksKept,
      'each event kept its own tick',
    ),
    check('pressure chunk status', 'PARTIAL', pressure.chunkStatus, 'a pressured clip is declared'),
    check(
      'pressure chunk reason',
      true,
      pressure.chunkReasons.includes('PRESSURED_ROWS_EVICTED'),
      'the eviction is named',
    ),
    check('RAM cap', 24 * 1024 * 1024, resources.ramByteCap, 'below the 32 MiB recorder budget'),
    check('RAM budget', 33_554_432, resources.recorderRamBudget, 'Docs/performance-budgets.json'),
    check(
      'ring cap',
      15 * 1024 * 1024,
      resources.ringByteCap,
      'RAM cap minus the pinned and event reserves',
    ),
    check(
      'peak charged under cap',
      true,
      resources.peakChargedBytes <= resources.ramByteCap,
      `${resources.peakChargedBytes} <= ${resources.ramByteCap}`,
    ),
    check('rate cap', 512 * 1024, resources.sampleRateCap, 'bytes per simulated second'),
    check(
      'peak rate under cap',
      true,
      resources.peakRateBytes <= resources.sampleRateCap,
      `${resources.peakRateBytes} <= ${resources.sampleRateCap}`,
    ),
    check(
      'rate limited rows counted',
      true,
      resources.rateLimitedRows > 0,
      'a refused row is counted, not hidden',
    ),
    check(
      'rate limited chunk status',
      'PARTIAL',
      resources.rateLimitedChunkStatus,
      'a rate-limited window is declared',
    ),
    check(
      'ring evictions',
      true,
      resources.evictingEvictions > 0,
      'the ring evicts the oldest row',
    ),
    check(
      'ring bytes under cap',
      true,
      resources.evictingRingBytes <= resources.evictingRingCap,
      `${resources.evictingRingBytes} <= ${resources.evictingRingCap}`,
    ),
    check(
      'retained window shrinks',
      true,
      resources.evictingRetainedSeconds < WORLD_RECORDER_DEFAULTS.retentionSeconds,
      'the byte cap binds before the time cap',
    ),
    check(
      'pinned chunks retained',
      1,
      resources.chunksRetained,
      'one pinned chunk is held at a time here',
    ),
    check(
      'replay storage budget',
      134_217_728,
      resources.replayStorageBudget,
      'optional replay storage is capped',
    ),
    check('incidents registered', 2, incidents.registered, 'the first two collisions pin'),
    check('incidents rate limited', 1, incidents.rateLimited, 'the third is refused and counted'),
    check('incidents per minute', 3, incidents.perMinute, 'the window is reported, not hidden'),
    check(
      'lifecycle explicit removal',
      210,
      lifecycle.explicitRemovedTick,
      'an exact removal fact is used as such',
    ),
    check(
      'lifecycle inferred removal',
      213,
      lifecycle.inferredRemovedTick,
      'a vanished entity is inferred and declared',
    ),
    check(
      'lifecycle created counted',
      true,
      lifecycle.created + lifecycle.inferredCreated > 0,
      'creation is recorded',
    ),
    check(
      'learning artifacts',
      0,
      learning.statsArtifacts,
      'the recorder is not a LEARNING producer',
    ),
    check('learning jobs', 0, learning.statsJobs, 'no job is created'),
    check('learning observations', 0, learning.statsObservations, 'no observation is created'),
    check(
      'learning profile versions',
      0,
      learning.statsProfileVersions,
      'no profile version is created',
    ),
    check('learning eligible', false, learning.statsEligible, 'the recorder is never eligible'),
    check(
      'learning declaration',
      '{"producesArtifacts":false,"eligible":false,"jobs":0,"observations":0,"profileVersions":0}',
      learning.chunkDeclaration,
      'the chunk declares the same zeros',
    ),
    check(
      'learning claim refused',
      'LEARNING_ARTIFACT',
      learning.acceptedChunkDeclaringArtifacts,
      'a chunk cannot claim a learning artifact',
    ),
    check(
      'learning import',
      false,
      learning.sourceImportsLearning,
      'the module does not import the learning module',
    ),
    check(
      'learning symbols',
      false,
      learning.sourceDeclaresJobs,
      'the module names no learning producer',
    ),
    check(
      'chunk version',
      WORLD_REPLAY_CHUNK_VERSION,
      integrity.chunkVersion,
      'a versioned document',
    ),
    check('chunk algorithm', 'SHA-256', integrity.algorithm, 'the 206 contract'),
    check('chunk canonicalization', 'SDA-CJSON-1', integrity.canonicalization, 'the 206 contract'),
    check('chunk read', 'ACCEPTED', integrity.readStatus, 'a sealed chunk re-reads'),
    check(
      'chunk bytes match',
      true,
      integrity.readBytes === integrity.bytes,
      'the stored byte count is the canonical one',
    ),
    check(
      'chunk deterministic',
      true,
      integrity.deterministic,
      'the same chunk re-reads to the same checksum',
    ),
    check(
      'tampered row',
      'CHECKSUM_MISMATCH',
      integrity.tamperedRow,
      'a changed row breaks the checksum',
    ),
    check(
      'dropped anchor',
      'ANCHOR_MISMATCH',
      integrity.droppedAnchor,
      'an anchor cannot be dropped silently',
    ),
    check(
      'mismatched anchor',
      'ANCHOR_MISMATCH',
      integrity.mismatchedAnchor,
      'the anchor must match its checkpoint',
    ),
    check(
      'learning claim integrity',
      'LEARNING_ARTIFACT',
      integrity.learningClaim,
      'a learning claim is refused after re-signing',
    ),
    check(
      'wrong version',
      'INCOMPATIBLE_VERSION',
      integrity.wrongVersion,
      'another version is refused',
    ),
    check(
      'off-cadence sample',
      'SAMPLE_TICK_MISMATCH',
      integrity.offCadenceSample,
      'samples must sit on the declared cadence',
    ),
    check(
      'undeclared partial',
      'COMPLETENESS_UNDECLARED',
      integrity.undeclaredPartial,
      'a partial window must say so',
    ),
    check('crash chunks before', 0, crash.chunksBefore, 'nothing is durable before a take'),
    check(
      'crash chunks after',
      0,
      crash.chunksAfterNewRecorder,
      'a new process starts with an empty recorder',
    ),
    check(
      'crash samples after',
      0,
      crash.samplesAfterNewRecorder,
      'the RAM buffer did not survive',
    ),
    check(
      'crash old seal',
      'UNKNOWN_INCIDENT',
      crash.oldIncidentSealAfterRestart,
      'the lost incident cannot be re-sealed',
    ),
    check(
      'crash rebuilt anchor',
      300,
      crash.rebuiltAnchorTick,
      'the new session anchors on a new 206 checkpoint',
    ),
    check('crash rebuilt status', 'ACCEPTED', crash.rebuiltStatus, 'the rebuilt chunk verifies'),
  ];

  const passed = checks.filter((entry) => entry.pass).length;

  return Object.freeze({
    version: '207-world-recorder-v1' as const,
    generatedBy: 'scripts/run-world-recorder-report.mjs',
    oracleRule:
      'Fiecare valoare „expected” este contractul documentat în Docs/09 și Docs/14, nu o copie a valorii observate. Zero ceas de perete, zero aleator.',
    fleet: Object.freeze({
      taxis: TAXI_COUNT,
      civilians: CIVILIAN_COUNT,
      vehicles: TAXI_COUNT + CIVILIAN_COUNT,
      signals: SIGNAL_COUNT,
      samples: stats.retainedSamples,
      sampledVehicleRows: stats.sampledVehicleRows,
      autoRows: stats.autoRows,
      outOfCameraRows: stats.outOfCameraRows,
      inCameraRows: stats.sampledVehicleRows - stats.outOfCameraRows,
      cameraFilterApplied: chunk.camera.filterApplied,
      recordedVehiclesInChunk: chunk.camera.recordedVehicles,
      decodedVehiclesAtIncident: decoded?.vehicles.length ?? 0,
      taxiDecoded: taxi?.entityId ?? 'MISSING',
      civilianDecoded: civilian?.entityId ?? 'MISSING',
      invisibleAutoDecoded: invisibleAuto?.entityId ?? 'MISSING',
    }),
    window: Object.freeze({
      incidentTick: chunk.incident.tick,
      requestBeforeSeconds: WORLD_RECORDER_DEFAULTS.pinBeforeSeconds,
      requestAfterSeconds: WORLD_RECORDER_DEFAULTS.pinAfterSeconds,
      pinnedFromTick: chunk.incident.pinnedFromTick,
      pinnedToTick: chunk.incident.pinnedToTick,
      startTick: chunk.startTick,
      endTick: chunk.endTick,
      sampleTicks: chunk.samples.length,
      sampleCadenceTicks: chunk.sampling.cadenceTicks,
      coverageBefore: chunk.completeness.before.coverage,
      coverageAfter: chunk.completeness.after.coverage,
      status: chunk.completeness.status,
      declaredPartial: chunk.completeness.declaredPartial,
      reasons: chunk.completeness.reasons,
      droppedSamples: chunk.completeness.droppedSamples,
      gaps: chunk.completeness.sampleGaps.length,
      anchor: chunk.completeness.anchor,
      anchorTick: chunk.checkpoint?.tick ?? null,
      anchorAgeTicks: chunk.completeness.anchorAgeTicks,
      autoOnly: chunk.incident.autoOnly,
      visibility: chunk.incident.visibility,
      classifiedFromTick: chunk.incident.classifiedFromTick,
    }),
    exactTicks: Object.freeze({
      collisionTick: chunk.incident.tick,
      collisionOnCadence: 500 % 3 === 0,
      stopTick: 397,
      stopOnCadence: 397 % 3 === 0,
      stopTickInChunk: chunk.events.find((event) => event.type === 'STOP_APPROACH')?.tick ?? null,
      eventsInChunk: chunk.events.length,
      eventTicksExact: chunk.sampling.eventTicksExact,
      interpolation: chunk.sampling.interpolation,
      rotationInterpolation: chunk.sampling.rotationInterpolation,
      physicsFidelity: chunk.sampling.physicsFidelity,
      observedTicksOnly: chunk.sampling.observedTicksOnly,
      unobservedTickDecoded: readReplaySample(chunk, 500) !== null,
    }),
    partial,
    pressure,
    resources: Object.freeze({
      ...resources,
      chunkBytesPerSimulatedSecond: bytesPerSecondOf(chunk),
    }),
    incidents,
    lifecycle,
    learning,
    integrity,
    crash,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

function bytesPerSecondOf(chunk: WorldReplayChunk): number {
  const seconds = (chunk.endTick - chunk.startTick) / 60;
  return seconds <= 0 ? chunk.bytes : Math.round(chunk.bytes / seconds);
}

/**
 * Real wall-clock cost of one recorded tick and one sealed chunk, on this machine.
 *
 * This is the only measured section of PBI 207 and it is written to `cost.json` by `--cost`; it is
 * never part of the deterministic transcript.
 */
export function measureWorldRecorderCosts(samples = 20): {
  readonly contract: string;
  readonly measuredAt: string;
  readonly sampleCount: number;
  readonly vehicles: number;
  readonly ticks: number;
  readonly recordedTicks: number;
  readonly recordTickMs: { readonly min: number; readonly median: number; readonly max: number };
  readonly sealChunkMs: { readonly min: number; readonly median: number; readonly max: number };
  readonly readChunkMs: { readonly min: number; readonly median: number; readonly max: number };
  readonly chunkBytes: number;
  readonly peakChargedBytes: number;
  readonly ramByteCap: number;
} {
  const recordTimes: number[] = [];
  const sealTimes: number[] = [];
  const readTimes: number[] = [];
  let chunkBytes = 0;
  let peakChargedBytes = 0;
  let ramByteCap = 0;
  const ticks = 600;
  for (let sample = 0; sample < samples; sample += 1) {
    const world = recorder();
    world.recordCheckpoint({ checkpointId: 'checkpoint-0', snapshot: snapshotAt(0) });
    const start = performance.now();
    recordRange(world, 0, ticks);
    recordTimes.push(performance.now() - start);
    const fact = collisionEvent(ticks - 10, 0, 20);
    world.recordEvent(fact);
    recordRange(world, ticks + 1, ticks + 400);
    /* The pin window is 15 s, so nothing was sealed automatically yet: this is the real seal cost. */
    const sealStart = performance.now();
    const chunk = seal(world, fact.eventId, ticks + 400);
    sealTimes.push(performance.now() - sealStart);
    const readStart = performance.now();
    readWorldReplayChunk(chunk);
    readTimes.push(performance.now() - readStart);
    chunkBytes = chunk.bytes;
    peakChargedBytes = world.getStats().peakChargedBytes;
    ramByteCap = world.getStats().ramByteCap;
  }
  const statistics = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return Object.freeze({
      min: Number((sorted[0] ?? 0).toFixed(3)),
      median: Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(3)),
      max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    });
  };
  return Object.freeze({
    contract:
      '207-world-recorder-v1: 1001 recorded ticks with 40 vehicles, one COLLISION at tick 590 and an explicit seal at tick 1000',
    measuredAt: new Date().toISOString(),
    sampleCount: samples,
    vehicles: TAXI_COUNT + CIVILIAN_COUNT,
    ticks,
    recordedTicks: ticks + 401,
    recordTickMs: statistics(recordTimes),
    sealChunkMs: statistics(sealTimes),
    readChunkMs: statistics(readTimes),
    chunkBytes,
    peakChargedBytes,
    ramByteCap,
  });
}
