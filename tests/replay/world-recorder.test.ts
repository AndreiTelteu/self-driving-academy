import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalizeJson } from '../../src/persistence/index';
import type { WorldSnapshot } from '../../src/persistence/index';
import {
  WORLD_RECORDER_BUDGET,
  WORLD_RECORDER_DEFAULTS,
  WORLD_REPLAY_CHUNK_VERSION,
  WORLD_REPLAY_INTEGRITY,
  computeWorldReplayChunkChecksum,
  createWorldRecorder,
  interpolateReplayPose,
  readReplaySample,
  readWorldReplayChunk,
  subscribeWorldRecorder,
} from '../../src/replay/index';
import type { WorldRecorder, WorldRecorderOptions, WorldReplayChunk } from '../../src/replay/index';
import type { SimulationEvent } from '../../src/simulation/index';
import {
  CIVILIAN_COUNT,
  FLEET,
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

const FIXED_NOW = '2026-11-11T00:00:00.000Z';
const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'replay');

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

/** Offers `from..to` (inclusive) authoritative ticks, one frame per tick. */
function recordRange(
  world: WorldRecorder,
  from: number,
  to: number,
  frame: (tick: number) => ReturnType<typeof replayFrame> = replayFrame,
): void {
  for (let tick = from; tick <= to; tick += 1) world.recordTick(frame(tick));
}

/** Recomputes the canonical checksum and byte count so a tampered chunk stays structurally valid. */
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

function sealed(world: WorldRecorder, eventId: string, sealTick?: number): WorldReplayChunk {
  const result = world.sealIncident(incidentId(eventId), sealTick);
  assert.equal(result.status !== 'REJECTED', true, JSON.stringify(result));
  if (result.status === 'REJECTED') throw new Error(result.rejection.message);
  return result.chunk;
}

function codeOf(result: { readonly status: string }): string | null {
  return result.status === 'REJECTED'
    ? ((result as unknown as { readonly rejection: { readonly code: string } }).rejection.code ??
        null)
    : null;
}

function withCheckpoint(world: WorldRecorder, tick: number, snapshot?: WorldSnapshot): void {
  assert.equal(
    world.recordCheckpoint({
      checkpointId: `checkpoint-${tick}`,
      snapshot: snapshot ?? snapshotAt(tick),
    }),
    true,
  );
}

test('records every taxi, civilian and AUTO vehicle, including the ones outside the camera', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 300);
  /* taxi-03 is AUTO, civil-02 is MANUAL, and neither is inside the camera. */
  const fact = collisionEvent(250, 2, 21);
  assert.equal(world.recordEvent(fact).incident, 'PINNED');
  const chunk = sealed(world, fact.eventId);

  assert.equal(chunk.incident.autoOnly, false);
  assert.deepEqual(chunk.incident.controlModes, ['AUTO', 'MANUAL']);
  const sample = readReplaySample(chunk, 249);
  assert.notEqual(sample, null);
  const vehicles = sample?.vehicles ?? [];
  assert.equal(vehicles.length, TAXI_COUNT + CIVILIAN_COUNT);
  assert.equal(new Set(vehicles.map((vehicle) => vehicle.entityId)).size, vehicles.length);
  assert.equal(vehicles.filter((vehicle) => vehicle.vehicleClass === 'TAXI').length, TAXI_COUNT);
  assert.equal(
    vehicles.filter((vehicle) => vehicle.vehicleClass === 'CIVILIAN').length,
    CIVILIAN_COUNT,
  );
  assert.equal(vehicles.filter((vehicle) => !vehicle.inCamera).length > 0, true);
  assert.equal(vehicles.filter((vehicle) => vehicle.controlMode === 'AUTO').length > 0, true);
  assert.equal(chunk.camera.filterApplied, false);
  assert.equal(chunk.camera.recordedVehicles, TAXI_COUNT + CIVILIAN_COUNT);

  const stats = world.getStats();
  assert.equal(stats.sampledVehicleRows, 101 * (TAXI_COUNT + CIVILIAN_COUNT));
  assert.equal(stats.outOfCameraRows > 0, true);
  assert.equal(stats.autoRows > 0, true);
  assert.equal(stats.retainedSamples, 101);
  assert.equal(stats.chargedBytes <= stats.ramByteCap, true);
});

test('keeps the exact tick of every event and declares the transform cadence', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 200);
  const stop = stopApproachEvent(37, 4);
  const collision = collisionEvent(151, 6, 12);
  assert.equal(world.recordEvent(stop).status, 'RECORDED');
  assert.equal(world.recordEvent(collision).incident, 'PINNED');
  const chunk = sealed(world, collision.eventId);

  const event = chunk.events.find((entry) => entry.eventId === stop.eventId);
  assert.notEqual(event, undefined);
  assert.equal(event?.tick, 37);
  assert.equal(151 % chunk.sampling.cadenceTicks !== 0, true);
  assert.equal(chunk.sampling.eventTicksExact, true);
  assert.equal(chunk.sampling.interpolation, 'LINEAR');
  assert.equal(chunk.sampling.rotationInterpolation, 'NLERP');
  assert.equal(chunk.sampling.observedTicksOnly, true);
  assert.equal(chunk.sampling.physicsFidelity, false);
  assert.equal(chunk.sampling.cadenceTicks, 3);
  assert.deepEqual(
    chunk.samples.map((sample) => sample.tick % chunk.sampling.cadenceTicks),
    chunk.samples.map(() => 0),
  );
  assert.deepEqual(chunk.sampling.quantization, { positionM: 0.01, rotationUnit: 0.0001 });
  assert.equal(readWorldReplayChunk(chunk).status, 'ACCEPTED');
});

test('a complete window is a complete clip and an early seal is a declared partial clip', () => {
  const complete = recorder();
  withCheckpoint(complete, 0);
  recordRange(complete, 0, 1_150);
  const completeFact = collisionEvent(100, 0, 20);
  complete.recordEvent(completeFact);
  const completeChunk = sealed(complete, completeFact.eventId);
  assert.equal(completeChunk.completeness.status, 'COMPLETE');
  assert.equal(completeChunk.completeness.declaredPartial, false);
  assert.deepEqual(completeChunk.completeness.reasons, []);
  assert.equal(completeChunk.completeness.anchor, 'PRESENT');
  assert.equal(completeChunk.completeness.anchorAgeTicks, 0);
  assert.equal(completeChunk.startTick, 0);
  assert.equal(completeChunk.endTick, 1_000);
  assert.equal(completeChunk.completeness.droppedSamples, 0);

  const early = recorder();
  withCheckpoint(early, 0);
  recordRange(early, 0, 400);
  const earlyFact = collisionEvent(250, 2, 21);
  early.recordEvent(earlyFact);
  const earlyChunk = sealed(early, earlyFact.eventId);
  assert.equal(earlyChunk.completeness.status, 'PARTIAL');
  assert.equal(earlyChunk.completeness.declaredPartial, true);
  assert.deepEqual(earlyChunk.completeness.reasons, ['CAPTURE_FINALIZED_EARLY']);
  assert.equal(earlyChunk.endTick, 400);
  assert.equal(earlyChunk.incident.pinnedToTick, 1_150);
  assert.equal(earlyChunk.sealTick, 400);
});

test('a capture that starts after the requested window declares the missing prefix', () => {
  const world = recorder();
  withCheckpoint(world, 500);
  recordRange(world, 500, 900);
  const fact = collisionEvent(600, 4, 24);
  world.recordEvent(fact);
  const chunk = sealed(world, fact.eventId);

  assert.equal(chunk.incident.pinnedFromTick, 0);
  assert.equal(chunk.startTick, 501);
  assert.equal(chunk.completeness.status, 'PARTIAL');
  assert.equal(chunk.completeness.reasons.includes('CAPTURE_STARTED_LATE'), true);
  assert.equal(chunk.startTick > chunk.incident.pinnedFromTick, true);
  assert.equal(
    chunk.completeness.before.coverage,
    1,
    'the declared window is the one that was observed',
  );
});

test('pins the window around the incident and classifies it from a declared sample', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 400);
  const fact = collisionEvent(201, 7, 27);
  const result = world.recordEvent(fact);
  assert.equal(result.incidentId, incidentId(fact.eventId));
  const chunk = sealed(world, fact.eventId);

  assert.equal(chunk.pinned, true);
  assert.equal(chunk.incident.kind, 'COLLISION');
  assert.equal(chunk.incident.tick, 201);
  assert.equal(chunk.incident.classifiedFromTick, 201);
  assert.equal(chunk.incident.pinnedFromTick, 0);
  assert.equal(chunk.incident.pinnedToTick, 1_101);
  assert.equal(chunk.checkpoint?.checkpointId, 'checkpoint-0');
  assert.equal(chunk.anchor?.tick, 0);
  assert.equal(
    chunk.events.some((event) => event.eventId === fact.eventId),
    true,
  );
  assert.equal(chunk.chunkVersion, WORLD_REPLAY_CHUNK_VERSION);
  assert.deepEqual(chunk.integrity, WORLD_REPLAY_INTEGRITY);
  assert.equal(chunk.sequence, 1);
});

test('an AUTO-only incident outside the camera is retained as such', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 400, (tick) => replayFrame(tick, { hideCamera: true }));
  /* taxi-02 and taxi-03 are both AUTO and neither is inside the player camera. */
  const fact = collisionEvent(150, 1, 2);
  world.recordEvent(fact);
  const chunk = sealed(world, fact.eventId);
  assert.deepEqual(chunk.incident.controlModes, ['AUTO', 'AUTO']);
  assert.equal(chunk.incident.autoOnly, true);
  assert.equal(chunk.incident.visibility, 'OUTSIDE_CAMERA');
  assert.equal(chunk.incident.outsideCamera, true);
  assert.equal(chunk.camera.outOfCameraVehicles > 0, true);
});

test('every chunk is a verified SDA-CJSON-1 document and a tampered row is refused', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 200);
  const fact = collisionEvent(150, 3, 23);
  world.recordEvent(fact);
  const chunk = sealed(world, fact.eventId);

  const read = readWorldReplayChunk(chunk);
  assert.equal(read.status, 'ACCEPTED');
  assert.equal(read.bytes, chunk.bytes);

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
              row[8] ?? 0,
              row[9] ?? 0,
              row[10] ?? 0,
              row[11] ?? 0,
            ]),
          }
        : sample,
    ),
  };
  assert.equal(codeOf(readWorldReplayChunk(tampered)), 'CHECKSUM_MISMATCH');

  const wrongVersion = readWorldReplayChunk({
    ...chunk,
    chunkVersion: '207-world-replay-chunk-v2',
  });
  assert.equal(codeOf(wrongVersion), 'INCOMPATIBLE_VERSION');
});

test('a chunk without its 206 anchor cannot claim a checkpoint', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 100, 400);
  const fact = collisionEvent(200, 2, 22);
  world.recordEvent(fact);
  const chunk = sealed(world, fact.eventId);
  assert.equal(chunk.anchor?.tick, 0);
  assert.equal(chunk.checkpoint?.tick, 0);

  assert.equal(codeOf(readWorldReplayChunk(resign({ ...chunk, anchor: null }))), 'ANCHOR_MISMATCH');
  assert.equal(
    codeOf(
      readWorldReplayChunk(
        resign({ ...chunk, checkpoint: { ...chunk.checkpoint, checksum: 'a'.repeat(64) } }),
      ),
    ),
    'ANCHOR_MISMATCH',
  );

  const missing = recorder();
  recordRange(missing, 0, 200);
  const noAnchorFact = collisionEvent(100, 0, 20);
  missing.recordEvent(noAnchorFact);
  const noAnchor = sealed(missing, noAnchorFact.eventId);
  assert.equal(noAnchor.anchor, null);
  assert.equal(noAnchor.completeness.anchor, 'MISSING');
  assert.equal(noAnchor.completeness.reasons.includes('CHECKPOINT_MISSING'), true);
  assert.equal(noAnchor.completeness.status, 'PARTIAL');
});

test('the ring evicts the oldest rows at its byte cap and never grows past the RAM budget', () => {
  const world = recorder({
    ramByteCap: 2 * 1024 * 1024,
    pinnedChunkBytes: 512 * 1024,
    eventByteCap: 256 * 1024,
  });
  recordRange(world, 0, 1_200);
  const stats = world.getStats();
  assert.equal(stats.ringBytes <= stats.ringByteCap, true);
  assert.equal(stats.chargedBytes <= stats.ramByteCap, true);
  assert.equal(stats.peakChargedBytes <= stats.ramByteCap, true);
  assert.equal(stats.samplesEvicted > 0, true);
  assert.equal(stats.samplesRecorded > stats.retainedSamples, true);
  assert.equal(stats.retainedSeconds < WORLD_RECORDER_DEFAULTS.retentionSeconds, true);
});

test('pressure drops rows but never stops the simulation or the exact event stream', () => {
  const world = recorder({ retentionSeconds: 3, pinBeforeSeconds: 2, pinAfterSeconds: 2 });
  const fact = collisionEvent(60, 0, 20);
  recordRange(world, 0, 60);
  assert.equal(world.recordEvent(fact).incident, 'PINNED');

  let pressure = 0;
  let admitted = 0;
  let events = 0;
  for (let tick = 61; tick <= 400; tick += 1) {
    const result = world.recordTick(replayFrame(tick));
    if (result.status === 'PRESSURE_DROPPED') pressure += 1;
    if (result.status !== 'REJECTED') admitted += 1;
    if (tick % 7 === 0) {
      const recorded = world.recordEvent(stopApproachEvent(tick, 1));
      assert.equal(recorded.status, 'RECORDED');
      assert.equal(recorded.tick, tick, 'the exact tick survives the pressure');
      events += 1;
    }
  }
  const stats = world.getStats();
  assert.equal(pressure > 0, true);
  assert.equal(stats.samplesDroppedPressure > 0, true);
  assert.equal(admitted, 340, 'every offered tick was still admitted');
  assert.equal(stats.ticksAccepted, 401);
  assert.equal(stats.eventsRecorded, events + 1);
  assert.equal(stats.chargedBytes <= stats.ramByteCap, true);

  const chunk = sealed(world, fact.eventId);
  assert.equal(chunk.completeness.status, 'PARTIAL');
  assert.equal(chunk.completeness.reasons.includes('PRESSURED_ROWS_EVICTED'), true);
  assert.equal(chunk.completeness.droppedSamples > 0, true);
  assert.equal(chunk.completeness.sampleGaps.length > 0, true);
});

test('the pinned chunk reserve is capped and old chunks are evicted deterministically', () => {
  const world = recorder({ maxPinnedChunks: 2, pinBeforeSeconds: 1, pinAfterSeconds: 1 });
  recordRange(world, 0, 100);
  const first = collisionEvent(100, 0, 20);
  world.recordEvent(first);
  recordRange(world, 101, 400);
  const second = collisionEvent(400, 1, 21);
  world.recordEvent(second);
  recordRange(world, 401, 700);
  const third = collisionEvent(700, 2, 22);
  world.recordEvent(third);
  recordRange(world, 701, 900);

  const stats = world.getStats();
  assert.equal(stats.chunksRetained, 2);
  assert.equal(stats.chunksEvicted, 1);
  assert.equal(stats.sealedChunkBytes <= stats.pinnedChunkBytesCap, true);
  assert.deepEqual(
    world.listChunks().map((entry) => entry.sequence),
    [2, 3],
  );
  assert.equal(codeOf(world.sealIncident(incidentId(first.eventId))), 'CHUNK_EVICTED');
});

test('the incident rate is capped per minute and the refusal is counted', () => {
  const world = recorder({ maxIncidentsPerMinute: 2, pinBeforeSeconds: 1, pinAfterSeconds: 1 });
  recordRange(world, 0, 600);
  const events = [
    collisionEvent(100, 0, 20),
    collisionEvent(200, 1, 21),
    collisionEvent(300, 2, 22),
  ];
  assert.deepEqual(
    events.map((event) => world.recordEvent(event).incident),
    ['PINNED', 'PINNED', 'RATE_LIMITED'],
  );
  const stats = world.getStats();
  assert.equal(stats.incidentsRegistered, 2);
  assert.equal(stats.incidentsRateLimited, 1);
  assert.equal(stats.chunksPerMinute, 3);
  assert.equal(stats.maxChunksPerMinute, 2);
  const refused = world.sealIncident(incidentId(events[2]?.eventId ?? ''));
  assert.equal(codeOf(refused), 'UNKNOWN_INCIDENT');
});

test('the chunk byte cap trims the oldest rows and declares the trim', () => {
  const world = recorder({ chunkByteCap: 20_000 });
  recordRange(world, 0, 600);
  const fact = collisionEvent(500, 3, 23);
  world.recordEvent(fact);
  const chunk = sealed(world, fact.eventId, 500);
  assert.equal(chunk.bytes <= 20_000, true);
  assert.equal(chunk.completeness.reasons.includes('CHUNK_BYTE_CAP'), true);
  assert.equal(chunk.startTick > chunk.incident.pinnedFromTick, true);
  assert.equal(chunk.completeness.droppedSamples, 0, 'the declared window is the retained one');
  assert.equal(
    chunk.endTick - chunk.startTick < chunk.incident.pinnedToTick - chunk.incident.pinnedFromTick,
    true,
  );
  assert.equal(readWorldReplayChunk(chunk).status, 'ACCEPTED');
});

test('lifecycle facts are exact and inferred facts are declared as inferred', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 200);
  const fact = collisionEvent(150, 4, 24);
  world.recordEvent(fact);
  const lastIndex = FLEET.length - 1;
  for (let tick = 201; tick <= 260; tick += 1) {
    world.recordTick(
      replayFrame(tick, {
        omit: tick > 210 ? ['civil-19', 'civil-20'] : [],
        removed: tick === 210 ? [lastIndex] : [],
      }),
    );
  }
  const chunk = sealed(world, fact.eventId);
  const removed = chunk.lifecycle.removed.filter((entry) => entry.entityId === 'civil-20');
  assert.equal(removed.length, 1);
  assert.equal(removed[0]?.tick, 210);
  assert.equal(removed[0]?.inferred, false);
  const inferred = chunk.lifecycle.removed.filter((entry) => entry.entityId === 'civil-19');
  assert.equal(inferred.length, 1);
  assert.equal((inferred[0]?.tick ?? 0) > 120, true);
  assert.equal(inferred[0]?.inferred, true);
  assert.equal(world.getStats().entitiesRemoved >= 1, true);
  assert.equal(world.getStats().inferredRemoved >= 1, true);
});

test('duplicate, foreign and unknown events are refused without corrupting the chunk', () => {
  const world = recorder();
  recordRange(world, 0, 120);
  const fact = collisionEvent(100, 0, 20);
  assert.equal(world.recordEvent(fact).status, 'RECORDED');
  assert.equal(world.recordEvent(fact).status, 'DUPLICATE');
  const foreign = { ...stopApproachEvent(101, 1), sessionId: 'other-session' } as SimulationEvent;
  assert.equal(world.recordEvent(foreign).code, 'FOREIGN_EVENT');
  const unknown = {
    ...stopApproachEvent(102, 1),
    type: 'NOT_A_REAL_TYPE',
  } as unknown as SimulationEvent;
  assert.equal(world.recordEvent(unknown).code, 'INVALID_EVENT');
  assert.equal(world.recordTick(replayFrame(50)).code, 'TICK_ORDER');
  const stats = world.getStats();
  assert.equal(stats.eventsRecorded, 1);
  assert.equal(stats.eventsDuplicate, 1);
  assert.equal(stats.eventsRejected, 2);
  assert.equal(stats.ticksRejected, 1);
});

test('a discontinuity inside the window is declared instead of hidden', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 300);
  const collision = collisionEvent(200, 0, 20);
  world.recordEvent(collision);
  assert.equal(world.recordEvent(worldResetEvent(210)).status, 'RECORDED');
  const chunk = sealed(world, collision.eventId);
  assert.equal(chunk.completeness.reasons.includes('WORLD_DISCONTINUITY'), true);
  assert.equal(chunk.completeness.status, 'PARTIAL');
  assert.equal(chunk.events.find((event) => event.type === 'WORLD_RESET')?.tick, 210);
});

test('the recorder is structurally and behaviourally out of the LEARNING path', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 200);
  const fact = collisionEvent(150, 2, 22);
  world.recordEvent(fact);
  const chunk = sealed(world, fact.eventId);
  for (const stats of [world.getStats(), world.finalize('SESSION_END').stats]) {
    assert.equal(stats.learningArtifacts, 0);
    assert.equal(stats.learningJobs, 0);
    assert.equal(stats.learningObservations, 0);
    assert.equal(stats.profileVersions, 0);
    assert.equal(stats.learningEligible, false);
  }
  assert.deepEqual(chunk.learning, {
    producesArtifacts: false,
    eligible: false,
    jobs: 0,
    observations: 0,
    profileVersions: 0,
  });
  assert.equal(
    codeOf(
      readWorldReplayChunk(
        resign({
          ...chunk,
          learning: { ...chunk.learning, jobs: 1 },
        } as unknown as WorldReplayChunk),
      ),
    ),
    'LEARNING_ARTIFACT',
  );

  for (const file of ['world-recorder.ts', 'index.ts']) {
    const source = readFileSync(join(sourceRoot, file), 'utf8');
    assert.equal(
      /from '\.\.\/learning'/.test(source),
      false,
      `${file} imports the learning module`,
    );
    assert.equal(/createLearningJob|ProfileVersion\b/.test(source), false);
  }
});

test('the 007 bus can feed the recorder without changing its contract', () => {
  const listeners: ((event: SimulationEvent) => undefined)[] = [];
  const bus = {
    subscribe(listener: (event: SimulationEvent) => undefined) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
  const world = recorder();
  const unsubscribe = subscribeWorldRecorder(bus, world);
  recordRange(world, 0, 200);
  const fact = collisionEvent(150, 0, 20);
  for (const listener of listeners) listener(fact);
  assert.equal(world.getStats().eventsRecorded, 1);
  unsubscribe();
  assert.equal(listeners.length, 0);
});

test('interpolation is declared, bounded and only between two observations of one entity', () => {
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 120);
  const fact = collisionEvent(60, 0, 20);
  world.recordEvent(fact);
  const chunk = sealed(world, fact.eventId);
  const from = readReplaySample(chunk, 60);
  const to = readReplaySample(chunk, 63);
  assert.notEqual(from, null);
  assert.notEqual(to, null);
  const pose = interpolateReplayPose(from!, to!, 'taxi-01', 0.5);
  assert.notEqual(pose, null);
  assert.equal(pose?.physicsFidelity, false);
  const start = from?.vehicles.find((vehicle) => vehicle.entityId === 'taxi-01');
  const end = to?.vehicles.find((vehicle) => vehicle.entityId === 'taxi-01');
  assert.equal(pose?.position.x, ((start?.position.x ?? 0) + (end?.position.x ?? 0)) / 2);
  assert.equal(
    Math.hypot(
      pose?.rotation.x ?? 0,
      pose?.rotation.y ?? 0,
      pose?.rotation.z ?? 0,
      pose?.rotation.w ?? 0,
    ) > 0.99,
    true,
  );
  assert.equal(interpolateReplayPose(from!, to!, 'taxi-99', 0.5), null);
  assert.equal(readReplaySample(chunk, 61), null, 'a tick that was never observed is not invented');
});

test('a crash loses only the RAM buffer, never a durable claim or a fake chunk', () => {
  const before = recorder();
  withCheckpoint(before, 0);
  recordRange(before, 0, 300);
  const fact = collisionEvent(200, 0, 20);
  before.recordEvent(fact);
  assert.equal(before.listChunks().length, 0, 'nothing left the process before a seal and a take');
  before.dispose();
  assert.equal(before.getStats().state, 'DISPOSED');

  const after = recorder();
  assert.equal(after.listChunks().length, 0);
  assert.equal(after.getStats().retainedSamples, 0);
  assert.equal(codeOf(after.sealIncident(incidentId(fact.eventId))), 'UNKNOWN_INCIDENT');

  withCheckpoint(after, 300);
  recordRange(after, 300, 1_500);
  const again = collisionEvent(1_200, 0, 20);
  assert.equal(after.recordEvent(again).incident, 'PINNED');
  const chunk = sealed(after, again.eventId);
  assert.equal(chunk.anchor?.tick, 300);
  assert.equal(chunk.completeness.anchor, 'PRESENT');
  assert.equal(readWorldReplayChunk(chunk).status, 'ACCEPTED');
});

test('a row that cannot be held is refused with a counted reason, never silently lost', () => {
  const world = recorder({ maxEntities: 4 });
  recordRange(world, 0, 30);
  const stats = world.getStats();
  assert.equal(stats.samplesDroppedEntityCapacity > 0, true);
  assert.equal(stats.ticksRejected > 0, true);
  assert.equal(stats.chargedBytes <= stats.ramByteCap, true);
  assert.equal(stats.entitiesKnown, 4);
  assert.equal(stats.samplesRecorded, 0);
});

test('the declared budgets of the performance contract bound the module', () => {
  assert.equal(WORLD_RECORDER_BUDGET.recorderRamBytes, 33_554_432);
  assert.equal(WORLD_RECORDER_BUDGET.optionalReplayStorageBytes, 134_217_728);
  assert.equal(WORLD_RECORDER_DEFAULTS.ramByteCap < WORLD_RECORDER_BUDGET.recorderRamBytes, true);
  const world = recorder();
  withCheckpoint(world, 0);
  recordRange(world, 0, 600);
  const stats = world.getStats();
  assert.equal(stats.ramByteCap, WORLD_RECORDER_DEFAULTS.ramByteCap);
  assert.equal(
    stats.ringByteCap,
    WORLD_RECORDER_DEFAULTS.ramByteCap - 8 * 1024 * 1024 - 1024 * 1024,
  );
  assert.equal(stats.sampleRateBytesPerSecond, 512 * 1024);
  assert.equal(stats.peakRateBytes <= stats.sampleRateBytesPerSecond, true);
  assert.equal(stats.retainedSeconds <= WORLD_RECORDER_DEFAULTS.retentionSeconds, true);
  assert.equal(stats.chunksPerMinute <= stats.maxChunksPerMinute, true);
});
