import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BOUNDED_PIPELINE_BUDGET,
  BOUNDED_PIPELINE_VERSION,
  boundedPipelineBudgetGaps,
  createBoundedPipeline,
  createRepositoryPipelineStore,
  protectedFactRecord,
  recoverBoundedPipeline,
} from '../../src/persistence/index';
import type {
  BoundedGeneration,
  BoundedPipeline,
  BoundedPipelineOptions,
  BoundedPipelineStore,
  BoundedReplayChunk,
  WorldSnapshotSource,
} from '../../src/persistence/index';
import {
  PIPELINE_CHECKPOINT,
  PIPELINE_NOW,
  PIPELINE_SESSION,
  PIPELINE_VERSIONS,
  boundedChunk,
  countingClock,
  createPipelineWorld,
  createRecorderFixture,
  createScriptedStore,
  pipelineSource,
  stepPipelineWorld,
} from './bounded-pipeline-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';
import { createOrigin, openTab } from './world-checkpoint-harness';

const MANIFEST = JSON.parse(
  readFileSync(new URL('../../Docs/performance-budgets.json', import.meta.url), 'utf8'),
) as {
  proposedCapacities: Record<string, number | null>;
};

/** Microtask turns; the pipeline never schedules a timer, so this is a deterministic settle. */
async function settle(times = 6): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

function pipeline(
  store: BoundedPipelineStore,
  overrides: Partial<BoundedPipelineOptions> = {},
): BoundedPipeline {
  return createBoundedPipeline({
    store,
    sessionId: PIPELINE_SESSION,
    checkpointId: PIPELINE_CHECKPOINT,
    versions: PIPELINE_VERSIONS,
    now: () => PIPELINE_NOW,
    ...overrides,
  });
}

function worldAt(tick: number): MutableWorld {
  const world = createPipelineWorld();
  for (let index = 0; index < tick; index += 1) stepPipelineWorld(world);
  return world;
}

function fixedSource(tick: number): WorldSnapshotSource {
  return {
    tick,
    boundary: 'BOUNDARY',
    capture: () => {
      throw new Error(`The fixed source at ${tick} has no world`);
    },
  };
}

test('the capture stage is the only work inside the tick', async () => {
  const clock = countingClock([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  const store = createScriptedStore();
  const world = worldAt(60);
  const subject = pipeline(store, { monotonic: clock.clock });

  const before = clock.readCount();
  const decision = subject.offerTick(pipelineSource(world));
  const afterOffer = clock.readCount();

  assert.equal(decision.status, 'CAPTURED');
  assert.equal(decision.tick, 60);
  assert.equal(subject.stats().phase, 'PREPARING');
  assert.equal(afterOffer - before, 2, 'capture starts and stops the clock once');

  await subject.drain();
  assert.ok(clock.readCount() > afterOffer + 2, 'encode and copy run after the tick returns');
  assert.equal(subject.stats().phase, 'IDLE');
  assert.equal(subject.stats().generations.committed, 1);
});

test('the state machine is explicit and has one prepared and one committing slot', async () => {
  const store = createScriptedStore({ mode: 'STUCK' });
  const world = worldAt(60);
  const subject = pipeline(store);

  assert.equal(subject.stats().phase, 'IDLE');
  subject.offerTick(pipelineSource(world));
  assert.equal(subject.stats().phase, 'PREPARING');

  await settle();
  const committing = subject.stats();
  assert.equal(committing.phase, 'COMMITTING');
  assert.equal(committing.generations.committingTick, 60);
  assert.equal(committing.generations.preparedTick, null);

  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  const second = subject.offerTick(pipelineSource(world));
  assert.equal(second.status, 'CAPTURED');
  await settle();
  const both = subject.stats();
  assert.equal(both.phase, 'COMMITTING', 'the committing generation owns the phase');
  assert.equal(both.generations.committingTick, 60);
  assert.equal(both.generations.preparedTick, 120);
  assert.notEqual(both.generations.committingTick, both.generations.preparedTick);

  store.mode = 'OK';
  store.releaseAll();
  await subject.drain();
  assert.equal(subject.stats().phase, 'IDLE');
  assert.deepEqual(
    store.handed.map((generation) => generation.tick),
    [60, 120],
  );
});

test('a tick arriving while the encode runs is coalesced into one pending slot', async () => {
  const store = createScriptedStore({ mode: 'STUCK' });
  const world = worldAt(60);
  const subject = pipeline(store);

  subject.offerTick(pipelineSource(world));
  assert.equal(subject.stats().generations.preparedTick, null);
  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  const coalesced = subject.offerTick(pipelineSource(world));
  assert.equal(coalesced.status, 'COALESCED');
  assert.equal(coalesced.generation, 1);
  assert.equal(subject.stats().generations.pendingTick, 120);
  assert.equal(subject.stats().generations.captured, 1, 'coalescing never starts a second capture');

  await settle();
  store.mode = 'OK';
  store.releaseAll();
  await subject.drain();

  const stats = subject.stats();
  assert.equal(stats.generations.coalescedTicks, 1);
  assert.deepEqual(
    store.handed.map((generation) => generation.tick),
    [120],
    'the uncommitted 60 generation is superseded by the coalesced 120 tick',
  );
  assert.equal(stats.generations.captured, 2);
  assert.equal(stats.generations.replaced, 1);
  assert.equal(stats.generations.committed, 1);
});

test('a prepared generation is replaced by a newer tick instead of being written stale', async () => {
  const store = createScriptedStore({ mode: 'STUCK' });
  const world = worldAt(60);
  const subject = pipeline(store);

  subject.offerTick(pipelineSource(world));
  await settle();
  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  assert.equal(subject.offerTick(pipelineSource(world)).status, 'CAPTURED');
  await settle();
  assert.equal(subject.stats().generations.preparedTick, 120);
  assert.equal(subject.stats().generations.preparedBytes > 0, true);

  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  const replacement = subject.offerTick(pipelineSource(world));
  assert.equal(replacement.status, 'CAPTURED');
  assert.equal(subject.stats().generations.replaced, 1);
  await settle();
  assert.equal(subject.stats().generations.preparedTick, 180);

  store.mode = 'OK';
  store.releaseAll();
  await subject.drain();
  assert.deepEqual(
    store.handed.map((generation) => generation.tick),
    [60, 180],
    'the superseded 120 generation is never handed to the store',
  );
  assert.equal(subject.stats().generations.committed, 2);
});

test('protected facts survive coalescing and every fact is committed exactly once', async () => {
  const store = createScriptedStore({ mode: 'STUCK' });
  const world = worldAt(60);
  const subject = pipeline(store);

  subject.recordProtected({
    factId: 'fare-60',
    kind: 'COMMERCIAL_EVENT',
    tick: 60,
    payload: { fareCents: 1250, rideId: 'ride-01' },
  });
  subject.offerTick(pipelineSource(world));
  await settle();
  assert.equal(subject.stats().generations.committingTick, 60);

  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  subject.recordProtected({
    factId: 'reward-120',
    kind: 'REWARD',
    tick: 120,
    payload: { xp: 40, profileId: 'profile-1' },
  });
  subject.recordProtected({
    factId: 'invalidation-120',
    kind: 'LEARNING_INVALIDATION',
    tick: 120,
    payload: { segmentId: 'segment-01', reason: 'MANUAL_TAKEOVER' },
  });
  assert.equal(subject.offerTick(pipelineSource(world)).status, 'CAPTURED');
  await settle();
  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  assert.equal(subject.offerTick(pipelineSource(world)).status, 'CAPTURED');

  store.mode = 'OK';
  store.releaseAll();
  await subject.drain();

  const delivered = store.handed.flatMap((generation) =>
    generation.protectedFacts.map((fact) => fact.factId),
  );
  const attached = store.handed.map((generation) => generation.protectedFacts.length);
  assert.deepEqual(
    attached,
    [1, 3],
    'the later facts wait for a generation at or after their tick, and the uncommitted fare is retried',
  );
  assert.deepEqual([...new Set(delivered)].sort(), ['fare-60', 'invalidation-120', 'reward-120']);
  const stats = subject.stats();
  assert.equal(stats.protected.pending, 0);
  assert.equal(stats.protected.committed, 3);
  assert.equal(stats.protected.refused, 0);
});

test('the protected ledger refuses instead of dropping and suspends explicitly', () => {
  const subject = pipeline(createScriptedStore(), { protectedByteCap: 260 });
  const first = subject.recordProtected({
    factId: 'fact-1',
    kind: 'OPPORTUNITY_TICK',
    tick: 60,
    payload: { opportunityId: 'opportunity-01', verdict: 'ALLOW' },
  });
  assert.equal(first.status, 'ACCEPTED');
  let refused = 0;
  for (let index = 2; index < 20; index += 1) {
    const decision = subject.recordProtected({
      factId: `fact-${index}`,
      kind: 'OPPORTUNITY_TICK',
      tick: 60 + index,
      payload: { opportunityId: `opportunity-${index}`, verdict: 'DENY' },
    });
    if (decision.status === 'REJECTED') {
      refused += 1;
      assert.equal(decision.code, 'PROTECTED_OVERFLOW');
    }
  }
  const stats = subject.stats();
  assert.ok(refused > 0, 'the cap refuses facts instead of dropping them silently');
  assert.equal(stats.protected.refused, refused);
  assert.equal(stats.protected.suspended, true);
  assert.ok(stats.protected.overflowTick !== null && stats.protected.overflowTick >= 61);
  assert.ok(stats.buffers.protectedBytes <= 260);
  subject.resume();
  assert.equal(subject.stats().protected.suspended, false);
});

test('a transfer overflow refuses the generation without blocking or losing facts', async () => {
  const store = createScriptedStore();
  const world = worldAt(60);
  const subject = pipeline(store, { transferByteCap: 128 });
  subject.recordProtected({
    factId: 'fare-60',
    kind: 'COMMERCIAL_EVENT',
    tick: 60,
    payload: { fareCents: 900 },
  });

  const decision = subject.offerTick(pipelineSource(world));
  assert.equal(decision.status, 'CAPTURED', 'the tick is never refused by a storage cap');
  await subject.drain();

  const stats = subject.stats();
  assert.equal(stats.generations.prepareRejections, 1);
  assert.equal(stats.storage.lastCode, 'TRANSFER_OVERFLOW');
  assert.equal(stats.generations.committed, 0);
  assert.equal(stats.phase, 'IDLE');
  assert.equal(stats.protected.pending, 1, 'the fact is still pending, not lost');
  assert.equal(store.handed.length, 0);
});

test('a quota-full store keeps the tick, the facts and the retry', async () => {
  const store = createScriptedStore({ rejectNext: 1, rejectCode: 'STORAGE_FULL' });
  const world = worldAt(60);
  const subject = pipeline(store);
  subject.recordProtected({
    factId: 'fare-60',
    kind: 'COMMERCIAL_EVENT',
    tick: 60,
    payload: { fareCents: 900 },
  });

  assert.equal(subject.offerTick(pipelineSource(world)).status, 'CAPTURED');
  await subject.drain();
  const failed = subject.stats();
  assert.equal(failed.generations.commitRejections, 1);
  assert.equal(failed.generations.committed, 0);
  assert.equal(failed.protected.pending, 1);
  assert.equal(failed.storage.lastCode, 'STORAGE_FULL');
  assert.equal(failed.storage.unsavedTicks, 60);
  assert.equal(failed.phase, 'IDLE');

  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  subject.recordProtected({
    factId: 'fare-120',
    kind: 'COMMERCIAL_EVENT',
    tick: 120,
    payload: { fareCents: 700 },
  });
  assert.equal(subject.offerTick(pipelineSource(world)).status, 'CAPTURED');
  await subject.drain();

  const recovered = subject.stats();
  assert.equal(recovered.generations.committed, 1);
  assert.equal(recovered.protected.pending, 0);
  assert.equal(
    recovered.protected.committed,
    2,
    'both facts are released once, after a real commit',
  );
  assert.deepEqual(
    store.handed[1]?.protectedFacts.map((fact) => fact.factId),
    ['fare-60', 'fare-120'],
    'the retry carries the fact that the failed commit did not release',
  );
  assert.equal(recovered.storage.unsavedTicks, 0);
});

test('slow storage is measured by the age of the last commit, in ticks', async () => {
  const store = createScriptedStore({ mode: 'STUCK' });
  const world = worldAt(60);
  const subject = pipeline(store);
  subject.offerTick(pipelineSource(world));
  await settle();
  for (let index = 0; index < 240; index += 1) stepPipelineWorld(world);
  assert.equal(subject.offerTick(pipelineSource(world)).status, 'CAPTURED');
  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  const coalesced = subject.offerTick(pipelineSource(world));
  assert.equal(coalesced.status, 'COALESCED');

  const stalled = subject.stats();
  assert.equal(stalled.storage.commitAgeTicks, null);
  assert.equal(stalled.storage.unsavedTicks, 360);
  assert.equal(stalled.generations.committingTick, 60);
  assert.equal(stalled.generations.pendingTick, 360);

  store.mode = 'OK';
  store.releaseAll();
  await subject.drain();
  const settled = subject.stats();
  assert.equal(settled.generations.committed, 2);
  assert.equal(settled.storage.commitAgeTicks, 0, 'the newest tick is the committed one');
  assert.equal(settled.generations.coalescedTicks, 1);
});

test('the replay window is byte-capped and evicts the oldest sequence first', () => {
  const subject = pipeline(createScriptedStore(), { replayByteCap: 1_000 });
  const chunk = (sequence: number, bytes: number): BoundedReplayChunk =>
    Object.freeze({
      chunkId: `chunk-${sequence}`,
      sequence,
      incidentId: `incident-${sequence}`,
      startTick: sequence * 100,
      endTick: sequence * 100 + 90,
      bytes,
      status: 'COMPLETE' as const,
      chunk: null,
    });

  assert.equal(subject.stageChunk(chunk(1, 400)).status, 'STAGED');
  assert.equal(subject.stageChunk(chunk(2, 400)).status, 'STAGED');
  const third = subject.stageChunk(chunk(3, 400));
  assert.equal(third.status, 'STAGED');
  if (third.status !== 'STAGED') throw new Error('expected a staged chunk');
  assert.equal(third.evicted, 1);
  assert.equal(third.evictedBytes, 400);

  const stats = subject.stats();
  assert.equal(stats.buffers.replayBytes, 800);
  assert.equal(stats.buffers.replayChunks, 2);
  assert.equal(stats.replay.evictedChunks, 1);
  assert.equal(stats.replay.partial, true);
  assert.equal(stats.replay.durable, false, 'the 127 schema has no replay store');

  const tooLarge = subject.stageChunk(chunk(4, 1_200));
  assert.equal(tooLarge.status, 'REJECTED');
  if (tooLarge.status !== 'REJECTED') throw new Error('expected a refusal');
  assert.equal(tooLarge.code, 'CHUNK_TOO_LARGE');
  assert.equal(subject.stats().buffers.replayBytes, 800, 'a refusal never mutates the window');
});

test('chunks are committed through the single lane when the store supports it', async () => {
  const store = createScriptedStore({ handoffChunk: true });
  const subject = pipeline(store);
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    subject.stageChunk({
      chunkId: `chunk-${sequence}`,
      sequence,
      incidentId: `incident-${sequence}`,
      startTick: sequence,
      endTick: sequence + 1,
      bytes: 100,
      status: 'COMPLETE',
      chunk: null,
    });
  }
  await subject.drain();
  const stats = subject.stats();
  assert.equal(stats.replay.committed, 3);
  assert.equal(stats.replay.durable, true);
  assert.equal(stats.buffers.replayChunks, 0);
  assert.deepEqual(
    store.chunkHanded.map((chunk) => chunk.sequence),
    [1, 2, 3],
    'chunks leave in FIFO order',
  );
});

test('a failed chunk commit is declared partial, never retried forever', async () => {
  const store = createScriptedStore({ handoffChunk: true, failChunk: true });
  const subject = pipeline(store);
  subject.stageChunk({
    chunkId: 'chunk-1',
    sequence: 1,
    incidentId: 'incident-1',
    startTick: 10,
    endTick: 20,
    bytes: 100,
    status: 'COMPLETE',
    chunk: null,
  });
  await subject.drain();
  const stats = subject.stats();
  assert.equal(stats.replay.failed, 1);
  assert.equal(stats.replay.committed, 0);
  assert.equal(stats.replay.partial, true);
  assert.equal(stats.buffers.replayChunks, 0);
});

test('a recorder chunk is staged by its declared bytes and the payload stays opaque', async () => {
  const world = worldAt(0);
  const fixture = createRecorderFixture(world);
  for (let index = 0; index < 120; index += 1) {
    stepPipelineWorld(world);
    fixture.recordTick();
  }
  fixture.anchor();
  const sealed = fixture.sealCollision(0, 1);
  assert.ok(sealed !== null, 'the recorder sealed the collision chunk');
  if (sealed === null) return;
  const store = createScriptedStore({ handoffChunk: true });
  const subject = pipeline(store);
  const staged = subject.stageChunk(boundedChunk(sealed));
  assert.equal(staged.status, 'STAGED');
  if (staged.status !== 'STAGED') return;
  assert.equal(staged.bytes, sealed.bytes);
  assert.equal(staged.bytes > 0, true);
  await subject.drain();
  assert.equal(store.chunkHanded.length, 1);
  assert.equal(store.chunkHanded[0]?.chunk, sealed, 'the pipeline hands the sealed chunk over');
});

test('the owned byte image is exactly the encoded canonical body', async () => {
  const store = createScriptedStore();
  const subject = pipeline(store);
  subject.offerTick(pipelineSource(worldAt(60)));
  await subject.drain();
  const generation = store.handed[0];
  assert.ok(generation !== undefined);
  if (generation === undefined) return;
  assert.equal(generation.payload.byteLength, generation.bytes);
  const decoded = JSON.parse(new TextDecoder().decode(generation.payload)) as Record<
    string,
    unknown
  >;
  assert.deepEqual(decoded, generation.body);
  assert.equal(decoded.checksum, generation.checksum);
  assert.equal(generation.cost.captureMs >= 0, true);
});

test('an invalid capture is refused and does not wedge the pipeline', async () => {
  const store = createScriptedStore();
  const world = worldAt(60);
  const subject = pipeline(store);
  const broken: WorldSnapshotSource = {
    tick: 60,
    boundary: 'BOUNDARY',
    capture: () => {
      throw new Error('The world is mid-step');
    },
  };
  const refused = subject.offerTick(broken);
  assert.equal(refused.status, 'REJECTED');
  assert.equal(refused.code, 'INVALID_CAPTURE');
  assert.equal(subject.stats().phase, 'IDLE');

  const next = subject.offerTick(pipelineSource(world));
  assert.equal(next.status, 'CAPTURED');
  await subject.drain();
  assert.equal(subject.stats().generations.committed, 1);
  assert.equal(subject.stats().generations.prepareRejections, 1);
});

test('a tick on a step boundary is refused, an older offer is refused', async () => {
  const store = createScriptedStore();
  const subject = pipeline(store);
  const inStep: WorldSnapshotSource = {
    tick: 60,
    boundary: 'IN_STEP',
    capture: () => {
      throw new Error('never reached');
    },
  };
  const refused = subject.offerTick(inStep);
  assert.equal(refused.code, 'TICK_NOT_BOUNDARY');

  subject.offerTick(pipelineSource(worldAt(60)));
  await subject.drain();
  const older = subject.offerTick(fixedSource(30));
  assert.equal(older.code, 'TICK_ORDER');
  const stats = subject.stats();
  assert.equal(stats.generations.staleRefusals, 1);
  assert.equal(stats.generations.committed, 1);
  assert.ok(stats.storage.commitAgeTicks !== null);
});

test('dispose refuses new work and releases the buffers', async () => {
  const store = createScriptedStore();
  const subject = pipeline(store);
  subject.offerTick(pipelineSource(worldAt(60)));
  await subject.drain();
  subject.stageChunk({
    chunkId: 'chunk-1',
    sequence: 1,
    incidentId: 'incident-1',
    startTick: 1,
    endTick: 2,
    bytes: 100,
    status: 'COMPLETE',
    chunk: null,
  });
  subject.dispose();
  const stats = subject.stats();
  assert.equal(stats.phase, 'DISPOSED');
  assert.equal(stats.buffers.replayChunks, 0);
  assert.equal(subject.offerTick(pipelineSource(worldAt(120))).status, 'REJECTED');
  assert.equal(
    subject.stageChunk({
      chunkId: 'chunk-2',
      sequence: 2,
      incidentId: 'incident-2',
      startTick: 3,
      endTick: 4,
      bytes: 100,
      status: 'COMPLETE',
      chunk: null,
    }).status,
    'REJECTED',
  );
});

test('the pipeline budgets are the manifest capacities, not invented values', () => {
  const capacities = MANIFEST.proposedCapacities;
  assert.equal(BOUNDED_PIPELINE_VERSION, '222-bounded-pipeline-v1');
  assert.equal(BOUNDED_PIPELINE_BUDGET.recorderRamBytes, capacities.recorderRamBytes);
  assert.equal(
    BOUNDED_PIPELINE_BUDGET.pendingWorkerPayloadBytes,
    capacities.pendingWorkerPayloadBytes,
  );
  assert.equal(
    BOUNDED_PIPELINE_BUDGET.optionalReplayStorageBytes,
    capacities.optionalReplayStorageBytes,
  );
  assert.equal(BOUNDED_PIPELINE_BUDGET.preparingCheckpoints, capacities.preparingCheckpoints);
  assert.equal(BOUNDED_PIPELINE_BUDGET.committingCheckpoints, capacities.committingCheckpoints);
  assert.equal(BOUNDED_PIPELINE_BUDGET.heavyBackgroundJobs, capacities.heavyBackgroundJobs);
  assert.equal(capacities.twoSessionCheckpointBytes, null);
  assert.deepEqual(
    boundedPipelineBudgetGaps.map((gap) => gap.key),
    ['twoSessionCheckpointBytes', 'totalHeapBytes'],
  );
});

test('after a commit the last durable generation survives a crash intact', async () => {
  const origin = createOrigin();
  const repository = await openTab(origin);
  const store = createRepositoryPipelineStore({ repository, now: () => PIPELINE_NOW });
  const subject = pipeline(store);
  const world = worldAt(60);
  subject.recordProtected({
    factId: 'fare-60',
    kind: 'COMMERCIAL_EVENT',
    tick: 60,
    payload: { fareCents: 1250 },
  });
  assert.equal(subject.offerTick(pipelineSource(world)).status, 'CAPTURED');
  await subject.drain();
  assert.equal(subject.stats().generations.committed, 1);

  const recovery = await recoverBoundedPipeline(repository, PIPELINE_SESSION);
  assert.equal(recovery.lastDurableGeneration, 1);
  assert.equal(recovery.lastDurableTick, 60);
  assert.equal(typeof recovery.lastDurableChecksum, 'string');
  assert.equal(recovery.orphanFacts, 0);
  assert.equal(recovery.factRows, 1);
  assert.equal(recovery.partialGenerations, 0);

  const facts = await repository.listProgress(PIPELINE_SESSION);
  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.recordId, 'bounded-pipeline-fact:fare-60');
  assert.equal(facts[0]?.status, 'COMPLETED');
});

test('a crash between the fact rows and the checkpoint loses no protected fact', async () => {
  const origin = createOrigin();
  const repository = await openTab(origin);
  const durableStore = createRepositoryPipelineStore({ repository, now: () => PIPELINE_NOW });
  const first = pipeline(durableStore);
  assert.equal(first.offerTick(pipelineSource(worldAt(60))).status, 'CAPTURED');
  await first.drain();

  // The process dies after the facts reached the store and before the checkpoint transaction.
  let factsWritten: Promise<void> = Promise.resolve();
  const crashing: BoundedPipelineStore = {
    handoff: (generation: BoundedGeneration) => {
      factsWritten = (async () => {
        for (const fact of generation.protectedFacts) {
          await repository.putProgress(protectedFactRecord(fact, generation, PIPELINE_NOW));
        }
      })();
      return new Promise(() => undefined);
    },
  };
  const second = pipeline(crashing, { startGeneration: 1 });
  const world = worldAt(120);
  for (let index = 0; index < 2; index += 1) {
    second.recordProtected({
      factId: `reward-120-${index}`,
      kind: 'REWARD',
      tick: 120,
      payload: { xp: 10 + index },
    });
  }
  assert.equal(second.offerTick(pipelineSource(world)).status, 'CAPTURED');
  await settle();
  await factsWritten;

  const recovery = await recoverBoundedPipeline(repository, PIPELINE_SESSION);
  assert.equal(recovery.lastDurableGeneration, 1, 'no partial generation is activated');
  assert.equal(recovery.lastDurableTick, 60);
  assert.equal(
    recovery.orphanFacts,
    2,
    'the durable facts of the unpublished generation are named',
  );
  assert.deepEqual(recovery.orphanGenerations, [2]);
  assert.equal(recovery.partialGenerations, 0);
  assert.equal((await repository.latestCheckpoint(PIPELINE_SESSION))?.generation, 1);
});

test('the default repository store declares that replay chunks are not durable', async () => {
  const origin = createOrigin();
  const repository = await openTab(origin);
  const store = createRepositoryPipelineStore({ repository });
  assert.equal(store.handoffChunk, undefined);
  const subject = pipeline(store);
  subject.stageChunk({
    chunkId: 'chunk-1',
    sequence: 1,
    incidentId: 'incident-1',
    startTick: 10,
    endTick: 20,
    bytes: 100,
    status: 'COMPLETE',
    chunk: null,
  });
  await subject.drain();
  const stats = subject.stats();
  assert.equal(stats.replay.durable, false);
  assert.equal(stats.replay.committed, 0);
  assert.equal(stats.buffers.replayChunks, 1, 'the RAM window keeps the chunk until the cap');
});

test('two sessions capture the same tick without sharing a byte budget', async () => {
  const storeA = createScriptedStore();
  const storeB = createScriptedStore();
  const world = worldAt(60);
  const a = pipeline(storeA, { sessionId: 'session-222-a', checkpointId: 'checkpoint-222-a' });
  const b = pipeline(storeB, { sessionId: 'session-222-b', checkpointId: 'checkpoint-222-b' });
  a.offerTick(pipelineSource(world));
  b.offerTick(pipelineSource(world));
  await a.drain();
  await b.drain();
  const first = storeA.handed[0];
  const second = storeB.handed[0];
  assert.ok(first !== undefined && second !== undefined);
  if (first === undefined || second === undefined) return;
  assert.equal(first.tick, second.tick);
  assert.equal(first.sessionId, 'session-222-a');
  assert.equal(second.sessionId, 'session-222-b');
  assert.equal(first.bytes, second.bytes, 'the same tick encodes to the same bytes');
  assert.equal(first.checksum, second.checksum);
});
