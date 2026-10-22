import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  createSegmentWriteQueue,
  readSegment,
  writeInterventionCheckpoint,
  writeSegment,
} from '../../src/persistence/index';
import type {
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
  SegmentSaveInput,
} from '../../src/persistence/index';
import { fixedClock } from './fixtures';

const DB = '129-segment-store-db';

interface Harness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly repository: LocalRepository;
}

async function opened(tabId = 'tab-a'): Promise<Harness> {
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const repository = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId,
    now: fixedClock(),
  });
  const report = await repository.open();
  assert.equal(report.status, 'READY');
  assert.equal(report.role, 'WRITER');
  return { factory, locks, repository };
}

/** A closed manual segment with `count` ordered events. */
function segment(count: number, overrides: Partial<SegmentSaveInput> = {}): SegmentSaveInput {
  const events = Array.from({ length: count }, (_, index) => ({
    eventId: `event-${index}`,
    tick: index,
    kind: index % 2 === 0 ? 'STOP' : 'REACTION',
  }));
  return {
    segmentId: 'segment-1',
    sessionId: 'session-1',
    worldEpoch: 1,
    vehicleId: 'vehicle-1',
    controlMode: 'MANUAL',
    learningEligible: false,
    baseVersionId: 'profile-1@1',
    learningEpoch: 0,
    startTick: 0,
    endTick: Math.max(0, count - 1),
    closeReason: 'RETURN_TO_AUTO',
    completeness: 'CLOSED',
    events,
    sampleCount: count,
    ...overrides,
  };
}

test('129 a closed segment keeps its state, its reason and its event order', async () => {
  const { repository } = await opened();
  const written = await writeSegment(repository, segment(6), { now: fixedClock() });
  assert.equal(written.status, 'COMMITTED');
  assert.equal(written.eventCount, 6);

  const recovered = await readSegment(repository, 'session-1', 'segment-1');
  assert.equal(recovered?.completeness, 'CLOSED');
  assert.equal(recovered?.reason, null);
  assert.equal(recovered?.closeReason, 'RETURN_TO_AUTO');
  assert.equal(recovered?.eventCount, 6);
  assert.equal(recovered?.expectedEventCount, 6);
  assert.deepEqual(
    recovered?.events.map((entry) => entry.eventId),
    ['event-0', 'event-1', 'event-2', 'event-3', 'event-4', 'event-5'],
  );
  assert.deepEqual(
    recovered?.events.map((entry) => entry.sequence),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(recovered?.sealed, true);
  assert.equal(recovered?.digestMatches, true);
  repository.close();
});

test('129 a long intervention is stored in ordered chunks', async () => {
  const { repository } = await opened();
  const written = await writeSegment(repository, segment(500), {
    now: fixedClock(),
    maxEventsPerChunk: 64,
  });
  assert.equal(written.status, 'COMMITTED');
  assert.equal(written.chunkCount, 8);

  const recovered = await readSegment(repository, 'session-1', 'segment-1');
  assert.equal(recovered?.completeness, 'CLOSED');
  assert.equal(recovered?.eventCount, 500);
  assert.deepEqual(recovered?.missingChunks, []);
  assert.deepEqual(
    recovered?.events.map((entry) => entry.sequence),
    Array.from({ length: 500 }, (_, index) => index),
  );
  assert.equal(recovered?.digestMatches, true);
  repository.close();
});

test('129 a crash before the chunks leaves an unsealed segment', async () => {
  const { repository } = await opened();
  const crashed = await writeSegment(repository, segment(4), {
    now: fixedClock(),
    hooks: {
      afterManifest: () => {
        throw new Error('simulated crash before the chunks');
      },
    },
  });
  assert.equal(crashed.status, 'REJECTED');

  const recovered = await readSegment(repository, 'session-1', 'segment-1');
  assert.equal(recovered?.completeness, 'INCOMPLETE');
  assert.equal(recovered?.reason, 'UNSEALED_WRITE');
  assert.equal(recovered?.sealed, false);
  assert.equal(recovered?.eventCount, 0);
  assert.equal(recovered?.expectedEventCount, 4);
  repository.close();
});

test('129 a crash in the middle of the chunks recovers the segment as partial', async () => {
  const { repository } = await opened();
  await writeSegment(repository, segment(200), {
    now: fixedClock(),
    maxEventsPerChunk: 50,
    hooks: {
      afterChunk: (index) => {
        if (index === 1) throw new Error('simulated crash in the middle of the chunks');
      },
    },
  }).catch(() => undefined);

  const recovered = await readSegment(repository, 'session-1', 'segment-1');
  assert.equal(recovered?.completeness, 'INCOMPLETE');
  assert.equal(recovered?.reason, 'UNSEALED_WRITE');
  assert.equal(recovered?.sealed, false);
  // Only the chunks that really landed are reported; the missing ones are named, not invented.
  assert.deepEqual(recovered?.presentChunks, [0, 1]);
  assert.deepEqual(recovered?.missingChunks, [2, 3]);
  assert.equal(recovered?.eventCount, 100);
  assert.equal(recovered?.expectedEventCount, 200);
  assert.equal(recovered?.events.length, 100);
  repository.close();
});

test('129 a missing chunk is reported as incomplete with an explicit reason', async () => {
  const { repository } = await opened();
  await writeSegment(repository, segment(200), {
    now: fixedClock(),
    maxEventsPerChunk: 50,
  });
  // A chunk disappears from the store, as a partial write or a manual edit would leave it.
  const removed = await repository.deleteRecord('segments', 'segment-1#3');
  assert.equal(removed.status, 'COMMITTED');

  const recovered = await readSegment(repository, 'session-1', 'segment-1');
  assert.equal(recovered?.completeness, 'INCOMPLETE');
  assert.equal(recovered?.reason, 'MISSING_CHUNKS');
  assert.deepEqual(recovered?.missingChunks, [3]);
  assert.equal(recovered?.eventCount, 150);
  assert.equal(recovered?.expectedEventCount, 200);
  repository.close();
});

test('129 a tampered chunk breaks the digest and is reported', async () => {
  const { repository } = await opened();
  await writeSegment(repository, segment(10), { now: fixedClock() });
  const chunk = await repository.getSegment('segment-1#0');
  assert.equal(chunk?.status, 'CLOSED');
  const tampered = {
    schemaVersion: 1,
    recordKind: 'SEGMENT',
    recordId: chunk?.recordId,
    sessionId: chunk?.sessionId,
    worldEpoch: chunk?.worldEpoch,
    status: chunk?.status,
    revision: (chunk?.revision ?? 0) + 1,
    createdAt: chunk?.createdAt,
    body: {
      ...chunk?.body,
      events: [
        { sequence: 0, eventId: 'event-0', tick: 0, kind: 'STOP', payload: { forged: true } },
      ],
    },
  };
  assert.equal((await repository.putSegment(tampered)).status, 'COMMITTED');

  const recovered = await readSegment(repository, 'session-1', 'segment-1');
  assert.equal(recovered?.completeness, 'INCOMPLETE');
  assert.equal(recovered?.reason, 'DIGEST_MISMATCH');
  assert.equal(recovered?.digestMatches, false);
  repository.close();
});

test('129 an incomplete source segment keeps its own reason', async () => {
  const { repository } = await opened();
  const written = await writeSegment(
    repository,
    segment(3, { completeness: 'INCOMPLETE', incompleteReason: 'DATA_LOSS' }),
    { now: fixedClock() },
  );
  assert.equal(written.status, 'COMMITTED');
  const recovered = await readSegment(repository, 'session-1', 'segment-1');
  assert.equal(recovered?.completeness, 'INCOMPLETE');
  assert.equal(recovered?.reason, 'SOURCE_INCOMPLETE');
  assert.equal(recovered?.sourceReason, 'DATA_LOSS');
  repository.close();
});

test('129 an invalid segment is refused before anything is written', async () => {
  const { repository } = await opened();
  const written = await writeSegment(
    repository,
    segment(2, { completeness: 'CLOSED', endTick: null, closeReason: null }),
    { now: fixedClock() },
  );
  assert.equal(written.status, 'REJECTED');
  assert.equal(written.rejection?.code, 'INVALID_RECORD');
  assert.equal((await repository.stats()).counts.segments, 0);
  repository.close();
});

/**
 * A repository whose writes wait for a gate. It makes the "the input loop is not blocked"
 * property observable: the caller returns before the storage happened.
 */
function gatedRepository(repository: LocalRepository): {
  readonly repository: LocalRepository;
  readonly release: () => void;
} {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gated = {
    ...repository,
    putSegment: async (record: unknown) => {
      await gate;
      return repository.putSegment(record);
    },
    getSegment: async (segmentId: string) => {
      await gate;
      return repository.getSegment(segmentId);
    },
  } as LocalRepository;
  return { repository: gated, release };
}

test('129 the write queue does not block the caller and keeps the order', async () => {
  const { repository } = await opened();
  const gated = gatedRepository(repository);
  const settled: string[] = [];
  const queue = createSegmentWriteQueue({
    repository: gated.repository,
    maxPending: 8,
    writeOptions: { now: fixedClock(), maxEventsPerChunk: 16 },
    onSettled: (result) => settled.push(result.segmentId),
  });

  const pending: Promise<unknown>[] = [];
  for (let index = 0; index < 5; index += 1) {
    pending.push(
      queue.enqueue(
        segment(4, {
          segmentId: `segment-${index}`,
          events: Array.from({ length: 4 }, (_, position) => ({
            eventId: `event-${index}-${position}`,
            tick: position,
            kind: 'STOP',
          })),
        }),
      ),
    );
  }
  // The input loop continued: the segments are queued and the storage did not happen yet.
  assert.equal((await repository.stats()).counts.segments, 0);
  assert.equal(queue.stats().written, 0);

  gated.release();
  await queue.drain();
  await Promise.all(pending);

  assert.deepEqual(settled, ['segment-0', 'segment-1', 'segment-2', 'segment-3', 'segment-4']);
  const stats = await repository.stats();
  // Five segments, each with one manifest row and one chunk row.
  assert.equal(stats.counts.segments, 10);
  for (let index = 0; index < 5; index += 1) {
    const recovered = await readSegment(repository, 'session-1', `segment-${index}`);
    assert.equal(recovered?.completeness, 'CLOSED');
    assert.deepEqual(
      recovered?.events.map((entry) => entry.eventId),
      [`event-${index}-0`, `event-${index}-1`, `event-${index}-2`, `event-${index}-3`],
    );
  }
  queue.dispose();
  repository.close();
});

test('129 a full write queue refuses the new segment instead of growing', async () => {
  const { repository } = await opened();
  const queue = createSegmentWriteQueue({
    repository,
    maxPending: 1,
    writeOptions: { now: fixedClock() },
  });
  const first = queue.enqueue(segment(2, { segmentId: 'segment-a' }));
  await assert.rejects(
    () => queue.enqueue(segment(2, { segmentId: 'segment-b' })),
    /STORAGE_FULL|queue holds/,
  );
  await queue.drain();
  await first;
  assert.equal(queue.stats().refused, 1);
  assert.equal(queue.stats().written, 1);
  queue.dispose();
  repository.close();
});

test('129 the checkpoint of an active intervention keeps identity and generation only', async () => {
  const { repository } = await opened();
  const written = await writeInterventionCheckpoint(repository, {
    checkpointId: 'checkpoint-1',
    sessionId: 'session-1',
    profileId: 'profile-1',
    worldEpoch: 1,
    tick: 120,
    generation: 3,
    learningEpoch: 2,
    engineVersion: 'engine-127',
    physicsVersion: 'rapier-0.21.0',
    mapVersion: 'provisional-v1',
    segmentId: 'segment-1',
    vehicleId: 'vehicle-1',
    controlMode: 'MANUAL',
    startTick: 0,
    createdAt: '2026-10-22T09:00:00.000Z',
  });
  assert.equal(written.status, 'COMMITTED');

  const stored = await repository.getCheckpoint('checkpoint-1');
  assert.equal(stored?.generation, 3);
  assert.equal(stored?.learningEpoch, 2);
  assert.equal(stored?.sessionId, 'session-1');
  assert.deepEqual(stored?.body, {
    scope: 'INTERVENTION_IDENTITY',
    segmentId: 'segment-1',
    vehicleId: 'vehicle-1',
    controlMode: 'MANUAL',
    startTick: 0,
    generation: 3,
    learningEpoch: 2,
  });
  // The world snapshot belongs to PBI 206; nothing here pretends to be one.
  assert.equal(Object.hasOwn(stored?.body ?? {}, 'world'), false);
  assert.equal(Object.hasOwn(stored?.body ?? {}, 'snapshot'), false);

  const older = await writeInterventionCheckpoint(repository, {
    checkpointId: 'checkpoint-1',
    sessionId: 'session-1',
    profileId: 'profile-1',
    worldEpoch: 1,
    tick: 100,
    generation: 2,
    learningEpoch: 2,
    engineVersion: 'engine-127',
    physicsVersion: 'rapier-0.21.0',
    mapVersion: 'provisional-v1',
    segmentId: 'segment-1',
    vehicleId: 'vehicle-1',
    controlMode: 'MANUAL',
    startTick: 0,
    createdAt: '2026-10-22T09:00:00.000Z',
  });
  assert.equal(older.status, 'REJECTED');
  assert.equal(older.status === 'REJECTED' ? older.rejection.code : null, 'STALE_REVISION');
  repository.close();
});
