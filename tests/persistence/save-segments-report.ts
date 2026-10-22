import {
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  createSegmentWriteQueue,
  readSegment,
  writeInterventionCheckpoint,
  writeSegment,
} from '../../src/persistence/index';
import type { LocalRepository, SegmentSaveInput } from '../../src/persistence/index';
import { fixedClock } from './fixtures';

/**
 * Deterministic transcript of PBI 129.
 *
 * Every value is the result of a real run against the in-memory IndexedDB double: no wall clock,
 * no random identity, no timing value. The committed transcript can be re-verified with
 * `--check`.
 */
export interface SegmentStoreCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface SaveSegmentsReport {
  readonly version: '129-save-segments-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly closedSegment: {
    readonly status: string;
    readonly completeness: string;
    readonly reason: string | null;
    readonly closeReason: string | null;
    readonly eventCount: number;
    readonly expectedEventCount: number;
    readonly firstEventId: string | null;
    readonly lastEventId: string | null;
    readonly sequences: readonly number[];
    readonly sealed: boolean;
    readonly digestMatches: boolean;
  };
  readonly longIntervention: {
    readonly chunkCount: number;
    readonly eventCount: number;
    readonly completeness: string;
    readonly missingChunks: readonly number[];
    readonly sequencesMonotonic: boolean;
  };
  readonly crashBeforeChunks: {
    readonly writeStatus: string;
    readonly completeness: string;
    readonly reason: string | null;
    readonly storedEvents: number;
    readonly expectedEvents: number;
    readonly missingChunks: readonly number[];
  };
  readonly crashInTheMiddle: {
    readonly writeStatus: string;
    readonly completeness: string;
    readonly reason: string | null;
    readonly storedEvents: number;
    readonly expectedEvents: number;
    readonly presentChunks: readonly number[];
    readonly missingChunks: readonly number[];
  };
  readonly missingChunk: {
    readonly completeness: string;
    readonly reason: string | null;
    readonly storedEvents: number;
    readonly expectedEvents: number;
    readonly missingChunks: readonly number[];
  };
  readonly tamperedChunk: {
    readonly completeness: string;
    readonly reason: string | null;
    readonly digestMatches: boolean;
  };
  readonly incompleteSource: {
    readonly completeness: string;
    readonly reason: string | null;
    readonly sourceReason: string | null;
  };
  readonly writeQueue: {
    readonly rowsBeforeTheGate: number;
    readonly rowsAfterDrain: number;
    readonly settledOrder: readonly string[];
    readonly written: number;
    readonly refused: number;
    readonly refusalCode: string;
  };
  readonly checkpoint: {
    readonly status: string;
    readonly generation: number;
    readonly learningEpoch: number;
    readonly bodyKeys: readonly string[];
    readonly olderGeneration: string;
    readonly hasWorldSnapshot: boolean;
  };
  readonly checks: readonly SegmentStoreCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

const DB = '129-save-segments-db';

async function openRepository(tabId: string): Promise<LocalRepository> {
  const repository = createLocalRepository({
    factory: createMemoryIdbFactory(),
    locks: createMemoryLockManager(),
    dbName: DB,
    tabId,
    now: fixedClock(),
  });
  const report = await repository.open();
  if (report.status !== 'READY') throw new Error(`open failed: ${report.status}`);
  return repository;
}

function segment(count: number, overrides: Partial<SegmentSaveInput> = {}): SegmentSaveInput {
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
    events: Array.from({ length: count }, (_, index) => ({
      eventId: `event-${index}`,
      tick: index,
      kind: index % 2 === 0 ? 'STOP' : 'REACTION',
    })),
    sampleCount: count,
    ...overrides,
  };
}

export async function runSaveSegmentsReport(): Promise<SaveSegmentsReport> {
  const checks: SegmentStoreCheck[] = [];
  const check = (name: string, expected: unknown, actual: unknown, detail: string): void => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    checks.push({ name, expected, actual, pass, detail });
  };

  // 1. A closed segment: state, reason and event order.
  const closed = await openRepository('tab-closed');
  const closedWrite = await writeSegment(closed, segment(6), { now: fixedClock() });
  const closedRead = await readSegment(closed, 'session-1', 'segment-1');
  closed.close();

  // 2. A long intervention split into ordered chunks.
  const long = await openRepository('tab-long');
  const longWrite = await writeSegment(long, segment(500), {
    now: fixedClock(),
    maxEventsPerChunk: 64,
  });
  const longRead = await readSegment(long, 'session-1', 'segment-1');
  long.close();

  // 3. A crash before the first chunk.
  const before = await openRepository('tab-crash-before');
  const beforeWrite = await writeSegment(before, segment(4), {
    now: fixedClock(),
    hooks: {
      afterManifest: () => {
        throw new Error('simulated crash before the chunks');
      },
    },
  });
  const beforeRead = await readSegment(before, 'session-1', 'segment-1');
  before.close();

  // 4. A crash in the middle of the chunks.
  const middle = await openRepository('tab-crash-middle');
  const middleWrite = await writeSegment(middle, segment(200), {
    now: fixedClock(),
    maxEventsPerChunk: 50,
    hooks: {
      afterChunk: (index) => {
        if (index === 1) throw new Error('simulated crash in the middle of the chunks');
      },
    },
  });
  const middleRead = await readSegment(middle, 'session-1', 'segment-1');
  middle.close();

  // 5. A chunk that is missing from the store.
  const missing = await openRepository('tab-missing');
  await writeSegment(missing, segment(200), { now: fixedClock(), maxEventsPerChunk: 50 });
  await missing.deleteRecord('segments', 'segment-1#3');
  const missingRead = await readSegment(missing, 'session-1', 'segment-1');
  missing.close();

  // 6. A chunk whose content was changed behind the back of the writer.
  const tampered = await openRepository('tab-tampered');
  await writeSegment(tampered, segment(10), { now: fixedClock() });
  const chunk = await tampered.getSegment('segment-1#0');
  await tampered.putSegment({
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
  });
  const tamperedRead = await readSegment(tampered, 'session-1', 'segment-1');
  tampered.close();

  // 7. A segment whose source was already incomplete.
  const source = await openRepository('tab-source');
  await writeSegment(
    source,
    segment(3, { completeness: 'INCOMPLETE', incompleteReason: 'DATA_LOSS' }),
    { now: fixedClock() },
  );
  const sourceRead = await readSegment(source, 'session-1', 'segment-1');
  source.close();

  // 8. The write queue: the caller is not blocked and the order is kept.
  const queued = await openRepository('tab-queue');
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gated = {
    ...queued,
    putSegment: async (record: unknown) => {
      await gate;
      return queued.putSegment(record);
    },
    getSegment: async (segmentId: string) => {
      await gate;
      return queued.getSegment(segmentId);
    },
  } as LocalRepository;
  const settled: string[] = [];
  const queue = createSegmentWriteQueue({
    repository: gated,
    maxPending: 8,
    writeOptions: { now: fixedClock(), maxEventsPerChunk: 16 },
    onSettled: (result) => settled.push(result.segmentId),
  });
  const pending = [0, 1, 2, 3, 4].map((index) =>
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
  const rowsBeforeTheGate = (await queued.stats()).counts.segments;
  release();
  await queue.drain();
  await Promise.all(pending);
  const rowsAfterDrain = (await queued.stats()).counts.segments;
  const queueStats = queue.stats();

  // 9. The bounded queue refuses one segment more than it may hold.
  const bounded = createSegmentWriteQueue({
    repository: gated,
    maxPending: 1,
    writeOptions: { now: fixedClock() },
  });
  const first = bounded.enqueue(segment(2, { segmentId: 'segment-a' }));
  let refusalCode = 'NONE';
  try {
    await bounded.enqueue(segment(2, { segmentId: 'segment-b' }));
  } catch (error) {
    refusalCode = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';
  }
  await bounded.drain();
  await first;
  const boundedStats = bounded.stats();
  queue.dispose();
  bounded.dispose();
  queued.close();

  // 10. The checkpoint of an active intervention.
  const checkpointRun = await openRepository('tab-checkpoint');
  const checkpoint = await writeInterventionCheckpoint(checkpointRun, {
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
  const storedCheckpoint = await checkpointRun.getCheckpoint('checkpoint-1');
  const older = await writeInterventionCheckpoint(checkpointRun, {
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
  checkpointRun.close();

  const report: SaveSegmentsReport = {
    version: '129-save-segments-v1',
    generatedBy:
      'node --import ./scripts/register-typescript.mjs scripts/run-save-segments-report.mjs',
    oracleRule:
      'Every row is a real run of src/persistence against the in-memory IndexedDB double; the expected value is the documented contract, never a copy of the actual one.',
    closedSegment: {
      status: closedWrite.status,
      completeness: closedRead?.completeness ?? 'NONE',
      reason: closedRead?.reason ?? null,
      closeReason: closedRead?.closeReason ?? null,
      eventCount: closedRead?.eventCount ?? 0,
      expectedEventCount: closedRead?.expectedEventCount ?? 0,
      firstEventId: closedRead?.events[0]?.eventId ?? null,
      lastEventId: closedRead?.events[closedRead.events.length - 1]?.eventId ?? null,
      sequences: closedRead?.events.map((entry) => entry.sequence) ?? [],
      sealed: closedRead?.sealed ?? false,
      digestMatches: closedRead?.digestMatches ?? false,
    },
    longIntervention: {
      chunkCount: longWrite.chunkCount,
      eventCount: longRead?.eventCount ?? 0,
      completeness: longRead?.completeness ?? 'NONE',
      missingChunks: longRead?.missingChunks ?? [],
      sequencesMonotonic: (longRead?.events ?? []).every(
        (entry, index, all) => index === 0 || entry.sequence > all[index - 1]!.sequence,
      ),
    },
    crashBeforeChunks: {
      writeStatus: beforeWrite.status,
      completeness: beforeRead?.completeness ?? 'NONE',
      reason: beforeRead?.reason ?? null,
      storedEvents: beforeRead?.eventCount ?? 0,
      expectedEvents: beforeRead?.expectedEventCount ?? 0,
      missingChunks: beforeRead?.missingChunks ?? [],
    },
    crashInTheMiddle: {
      writeStatus: middleWrite.status,
      completeness: middleRead?.completeness ?? 'NONE',
      reason: middleRead?.reason ?? null,
      storedEvents: middleRead?.eventCount ?? 0,
      expectedEvents: middleRead?.expectedEventCount ?? 0,
      presentChunks: middleRead?.presentChunks ?? [],
      missingChunks: middleRead?.missingChunks ?? [],
    },
    missingChunk: {
      completeness: missingRead?.completeness ?? 'NONE',
      reason: missingRead?.reason ?? null,
      storedEvents: missingRead?.eventCount ?? 0,
      expectedEvents: missingRead?.expectedEventCount ?? 0,
      missingChunks: missingRead?.missingChunks ?? [],
    },
    tamperedChunk: {
      completeness: tamperedRead?.completeness ?? 'NONE',
      reason: tamperedRead?.reason ?? null,
      digestMatches: tamperedRead?.digestMatches ?? true,
    },
    incompleteSource: {
      completeness: sourceRead?.completeness ?? 'NONE',
      reason: sourceRead?.reason ?? null,
      sourceReason: sourceRead?.sourceReason ?? null,
    },
    writeQueue: {
      rowsBeforeTheGate,
      rowsAfterDrain,
      settledOrder: settled,
      written: queueStats.written,
      refused: boundedStats.refused,
      refusalCode,
    },
    checkpoint: {
      status: checkpoint.status,
      generation: storedCheckpoint?.generation ?? -1,
      learningEpoch: storedCheckpoint?.learningEpoch ?? -1,
      bodyKeys: Object.keys(storedCheckpoint?.body ?? {}),
      olderGeneration: older.status === 'REJECTED' ? older.rejection.code : older.status,
      hasWorldSnapshot: Object.hasOwn(storedCheckpoint?.body ?? {}, 'world'),
    },
    checks: [],
    summary: { checks: 0, passed: 0, pass: false },
  };

  check('closed-status', 'COMMITTED', report.closedSegment.status, 'The segment was written');
  check('closed-completeness', 'CLOSED', report.closedSegment.completeness, 'A sealed segment');
  check('closed-reason', null, report.closedSegment.reason, 'A complete segment has no reason');
  check(
    'closed-close-reason',
    'RETURN_TO_AUTO',
    report.closedSegment.closeReason,
    'The close reason of the source is kept',
  );
  check('closed-events', 6, report.closedSegment.eventCount, 'Every event is stored');
  check(
    'closed-expected-events',
    6,
    report.closedSegment.expectedEventCount,
    'The manifest declares the same count',
  );
  check('closed-first-event', 'event-0', report.closedSegment.firstEventId, 'The first event');
  check('closed-last-event', 'event-5', report.closedSegment.lastEventId, 'The last event');
  check(
    'closed-sequences',
    [0, 1, 2, 3, 4, 5],
    report.closedSegment.sequences,
    'The event order is monotonic and unchanged',
  );
  check('closed-sealed', true, report.closedSegment.sealed, 'The segment was sealed');
  check('closed-digest', true, report.closedSegment.digestMatches, 'The digest matches');
  check('long-chunks', 8, report.longIntervention.chunkCount, '500 events in 8 chunks');
  check('long-events', 500, report.longIntervention.eventCount, 'No event was lost');
  check(
    'long-completeness',
    'CLOSED',
    report.longIntervention.completeness,
    'A long intervention is still complete',
  );
  check('long-missing', [], report.longIntervention.missingChunks, 'No chunk is missing');
  check(
    'long-monotonic',
    true,
    report.longIntervention.sequencesMonotonic,
    'The order survives the chunking',
  );
  check(
    'crash-before-status',
    'REJECTED',
    report.crashBeforeChunks.writeStatus,
    'The interrupted write is reported as failed',
  );
  check(
    'crash-before-completeness',
    'INCOMPLETE',
    report.crashBeforeChunks.completeness,
    'The segment is not complete',
  );
  check(
    'crash-before-reason',
    'UNSEALED_WRITE',
    report.crashBeforeChunks.reason,
    'The reason is explicit',
  );
  check('crash-before-events', 0, report.crashBeforeChunks.storedEvents, 'No event was invented');
  check(
    'crash-before-expected',
    4,
    report.crashBeforeChunks.expectedEvents,
    'The manifest still declares the planned count',
  );
  check(
    'crash-before-missing',
    [0],
    report.crashBeforeChunks.missingChunks,
    'The missing chunk is named',
  );
  check(
    'crash-middle-status',
    'REJECTED',
    report.crashInTheMiddle.writeStatus,
    'The interrupted write is reported as failed',
  );
  check(
    'crash-middle-completeness',
    'INCOMPLETE',
    report.crashInTheMiddle.completeness,
    'The segment is not complete',
  );
  check(
    'crash-middle-reason',
    'UNSEALED_WRITE',
    report.crashInTheMiddle.reason,
    'The reason is explicit',
  );
  check('crash-middle-events', 100, report.crashInTheMiddle.storedEvents, 'Only stored events');
  check(
    'crash-middle-expected',
    200,
    report.crashInTheMiddle.expectedEvents,
    'The planned count is reported',
  );
  check(
    'crash-middle-present',
    [0, 1],
    report.crashInTheMiddle.presentChunks,
    'The chunks that really landed',
  );
  check(
    'crash-middle-missing',
    [2, 3],
    report.crashInTheMiddle.missingChunks,
    'The missing chunks are named, not invented',
  );
  check(
    'missing-completeness',
    'INCOMPLETE',
    report.missingChunk.completeness,
    'A missing chunk means an incomplete segment',
  );
  check('missing-reason', 'MISSING_CHUNKS', report.missingChunk.reason, 'The reason is explicit');
  check('missing-events', 150, report.missingChunk.storedEvents, 'Only the stored events');
  check(
    'missing-expected',
    200,
    report.missingChunk.expectedEvents,
    'The planned count is reported',
  );
  check('missing-chunks', [3], report.missingChunk.missingChunks, 'The missing chunk is named');
  check(
    'tampered-completeness',
    'INCOMPLETE',
    report.tamperedChunk.completeness,
    'A changed chunk means an incomplete segment',
  );
  check(
    'tampered-reason',
    'DIGEST_MISMATCH',
    report.tamperedChunk.reason,
    'The digest detects the change',
  );
  check('tampered-digest', false, report.tamperedChunk.digestMatches, 'The digest does not match');
  check(
    'source-completeness',
    'INCOMPLETE',
    report.incompleteSource.completeness,
    'An incomplete source stays incomplete',
  );
  check(
    'source-reason',
    'SOURCE_INCOMPLETE',
    report.incompleteSource.reason,
    'The reason of the source is kept',
  );
  check(
    'source-reason-detail',
    'DATA_LOSS',
    report.incompleteSource.sourceReason,
    'The explicit reason of the source',
  );
  check(
    'queue-not-blocking',
    0,
    report.writeQueue.rowsBeforeTheGate,
    'Nothing was written while the input loop continued',
  );
  check('queue-rows', 10, report.writeQueue.rowsAfterDrain, 'Five manifests and five chunks');
  check(
    'queue-order',
    ['segment-0', 'segment-1', 'segment-2', 'segment-3', 'segment-4'],
    report.writeQueue.settledOrder,
    'The segments reached the store in the queued order',
  );
  check('queue-written', 5, report.writeQueue.written, 'Every queued segment was written');
  check('queue-refused', 1, report.writeQueue.refused, 'The bounded queue refused one');
  check('queue-refusal-code', 'STORAGE_FULL', report.writeQueue.refusalCode, 'Closed code');
  check('checkpoint-status', 'COMMITTED', report.checkpoint.status, 'The checkpoint was written');
  check('checkpoint-generation', 3, report.checkpoint.generation, 'The generation is stored');
  check('checkpoint-epoch', 2, report.checkpoint.learningEpoch, 'The learning epoch is stored');
  check(
    'checkpoint-body',
    ['scope', 'segmentId', 'vehicleId', 'controlMode', 'startTick', 'generation', 'learningEpoch'],
    report.checkpoint.bodyKeys,
    'The body holds identity and generation only',
  );
  check(
    'checkpoint-older',
    'STALE_REVISION',
    report.checkpoint.olderGeneration,
    'An older generation never replaces a newer one',
  );
  check(
    'checkpoint-no-world',
    false,
    report.checkpoint.hasWorldSnapshot,
    'The world snapshot stays with PBI 206',
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return {
    ...report,
    checks: Object.freeze(checks),
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
