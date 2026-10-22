import { PERSISTENCE_LIMITS, PersistenceError, persistenceRejection } from './contracts';
import type { PersistenceReasonCode, PersistenceRejection } from './contracts';
import { measureJsonBytes } from './records';
import type { LocalRepository } from './repository';

/**
 * Durable storage of closed segments and of the identity of an active intervention (PBI 129).
 *
 * Two rules shape the design:
 *
 * 1. A crash must never turn a half-written segment into a valid one. The segment is written in
 *    two phases: a manifest that declares how many chunks will follow, then the chunks, then a
 *    seal that rewrites the manifest with the final state and a digest of the ordered events. A
 *    reader that finds an unsealed manifest, a missing chunk or a digest mismatch reports the
 *    segment as INCOMPLETE with an explicit reason and returns only the events that are really
 *    stored â€” it never completes the missing data.
 * 2. Writing must not block the input loop. The writer returns as soon as the work is queued;
 *    the storage happens later, outside the tick hot path (see `write-queue.ts`).
 */

/** Contract id of this layer. */
export const SEGMENT_STORE_VERSION = '129-segment-store-v1' as const;

/** Digest algorithm of the segment manifest; the same FNV-1a 64 used by the 109 checksum. */
export const SEGMENT_DIGEST_ALGORITHM = 'fnv1a64' as const;

/** Lifecycle of a segment as it is persisted. */
export type SegmentCompleteness = 'OPEN' | 'CLOSED' | 'INCOMPLETE';

/** Explicit reasons why a recovered segment is incomplete. */
export const segmentIncompleteReasons = [
  /** The write never reached the seal step, so the segment was never complete. */
  'UNSEALED_WRITE',
  /** At least one planned chunk is missing from the store. */
  'MISSING_CHUNKS',
  /** The stored events do not match the digest of the sealed manifest. */
  'DIGEST_MISMATCH',
  /** The stored event sequence is not monotonic. */
  'ORDER_VIOLATION',
  /** The source segment was already incomplete when it was offered for saving. */
  'SOURCE_INCOMPLETE',
] as const;
export type SegmentIncompleteReason = (typeof segmentIncompleteReasons)[number];

/** One recorded event as the game hands it over; the position is assigned by the writer. */
export interface SegmentEventInput {
  readonly eventId: string;
  readonly tick: number;
  readonly kind: string;
  /** Plain JSON payload; stored as it is when it is valid JSON data. */
  readonly payload?: Readonly<Record<string, unknown>>;
}

/** One recorded event as it is stored and read back; the position is part of the record. */
export interface SegmentEventFact {
  readonly sequence: number;
  readonly eventId: string;
  readonly tick: number;
  readonly kind: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

/** The segment as the game hands it over for saving. */
export interface SegmentSaveInput {
  readonly segmentId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly vehicleId: string;
  readonly controlMode: 'MANUAL' | 'LEARNING' | 'AUTO';
  readonly learningEligible: boolean;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  readonly startTick: number;
  readonly endTick: number | null;
  /** Why the segment closed (`069` close reasons). */
  readonly closeReason: string | null;
  readonly completeness: SegmentCompleteness;
  /** The reason the source segment was incomplete; required when `completeness` is INCOMPLETE. */
  readonly incompleteReason?: string | null;
  readonly events: readonly SegmentEventInput[];
  readonly sampleCount: number;
}

/** Fault-injection points used by the deterministic crash tests. */
export interface SegmentWriteHooks {
  /** Called after the manifest was written, before the first chunk. */
  readonly afterManifest?: () => void;
  /** Called after every chunk; the argument is the chunk index. */
  readonly afterChunk?: (index: number) => void;
}

export interface SegmentWriteOptions {
  /** Maximum number of events in one chunk. */
  readonly maxEventsPerChunk?: number;
  /** Maximum canonical bytes of one chunk body. */
  readonly maxChunkBytes?: number;
  /** Clock of the record timestamps; injected so the tests stay deterministic. */
  readonly now?: () => string;
  readonly hooks?: SegmentWriteHooks;
}

export interface SegmentWriteResult {
  readonly segmentId: string;
  readonly status: 'COMMITTED' | 'REJECTED';
  readonly chunkCount: number;
  readonly eventCount: number;
  readonly bytes: number;
  readonly rejection: PersistenceRejection | null;
}

/** A segment read back from the store, with its real completeness. */
export interface RecoveredSegment {
  readonly segmentId: string;
  readonly sessionId: string;
  readonly completeness: 'CLOSED' | 'INCOMPLETE';
  /** Why the segment is incomplete; `null` for a complete segment. */
  readonly reason: SegmentIncompleteReason | null;
  /** The close reason of the source segment. */
  readonly closeReason: string | null;
  /** The reason the source segment itself was incomplete. */
  readonly sourceReason: string | null;
  readonly vehicleId: string;
  readonly controlMode: string;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly learningEligible: boolean;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly sampleCount: number;
  /** Only the events that are really stored, in the stored order. */
  readonly events: readonly SegmentEventFact[];
  readonly eventCount: number;
  readonly expectedEventCount: number;
  readonly presentChunks: readonly number[];
  readonly missingChunks: readonly number[];
  readonly sealed: boolean;
  readonly digest: string;
  readonly digestMatches: boolean;
}

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function fnv1a64(value: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/** The stored event carries its position, so the order survives the round-trip. */
function canonicalEvents(events: readonly SegmentEventFact[]): string {
  return JSON.stringify(
    events.map((event) => [
      event.sequence,
      event.eventId,
      event.tick,
      event.kind,
      event.payload === undefined ? null : event.payload,
    ]),
  );
}

export function digestEvents(events: readonly SegmentEventFact[]): string {
  return `${SEGMENT_DIGEST_ALGORITHM}:${fnv1a64(canonicalEvents(events))}`;
}

function invalid(code: PersistenceReasonCode, message: string, path: string): PersistenceRejection {
  return persistenceRejection(code, message, path);
}

function readId(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PERSISTENCE_LIMITS.maxIdCodeUnits ||
    value.trim() !== value
  ) {
    throw new PersistenceError('INVALID_RECORD', 'Expected a bounded identity', path);
  }
  return value;
}

function readCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PersistenceError('INVALID_RECORD', 'Expected a nonnegative counter', path);
  }
  return value;
}

/** Validates the segment handed over by the game and returns its ordered events. */
export function normalizeSegmentInput(input: SegmentSaveInput): readonly SegmentEventFact[] {
  const segmentId = readId(input.segmentId, 'segment.segmentId');
  if (segmentId.includes('#')) {
    // The chunk rows use `${segmentId}#${index}` as their key, so the separator is reserved.
    throw new PersistenceError(
      'INVALID_RECORD',
      'The segment identity cannot contain the chunk separator',
      'segment.segmentId',
    );
  }
  readId(input.sessionId, 'segment.sessionId');
  readId(input.vehicleId, 'segment.vehicleId');
  readId(input.baseVersionId, 'segment.baseVersionId');
  readCount(input.worldEpoch, 'segment.worldEpoch');
  readCount(input.learningEpoch, 'segment.learningEpoch');
  readCount(input.startTick, 'segment.startTick');
  readCount(input.sampleCount, 'segment.sampleCount');
  if (input.endTick !== null) {
    readCount(input.endTick, 'segment.endTick');
    if (input.endTick < input.startTick) {
      throw new PersistenceError(
        'INVALID_RECORD',
        'The segment ends before it starts',
        'segment.endTick',
      );
    }
  }
  if (input.completeness === 'OPEN') {
    if (input.endTick !== null || input.closeReason !== null) {
      throw new PersistenceError(
        'INVALID_RECORD',
        'An open segment has no end tick and no close reason',
        'segment.completeness',
      );
    }
  } else if (input.endTick === null || input.closeReason === null) {
    throw new PersistenceError(
      'INVALID_RECORD',
      'A closed segment needs its end tick and its close reason',
      'segment.completeness',
    );
  }
  if (input.completeness === 'INCOMPLETE' && (input.incompleteReason ?? null) === null) {
    throw new PersistenceError(
      'INVALID_RECORD',
      'An incomplete segment needs an explicit reason',
      'segment.incompleteReason',
    );
  }
  const seen = new Set<string>();
  return input.events.map((event, index) => {
    const eventId = readId(event.eventId, `segment.events[${index}].eventId`);
    if (seen.has(eventId)) {
      throw new PersistenceError(
        'INVALID_RECORD',
        `Duplicate event identity: ${eventId}`,
        `segment.events[${index}].eventId`,
      );
    }
    seen.add(eventId);
    const tick = readCount(event.tick, `segment.events[${index}].tick`);
    if (tick < input.startTick) {
      throw new PersistenceError(
        'INVALID_RECORD',
        'An event is older than the segment',
        `segment.events[${index}].tick`,
      );
    }
    if (input.endTick !== null && tick > input.endTick) {
      throw new PersistenceError(
        'INVALID_RECORD',
        'An event is newer than the segment',
        `segment.events[${index}].tick`,
      );
    }
    if (event.payload !== undefined) {
      // The body must stay plain JSON; the measurement rejects anything else.
      measureJsonBytes(event.payload, `segment.events[${index}].payload`);
    }
    return Object.freeze({
      sequence: index,
      eventId,
      tick,
      kind: readId(event.kind, `segment.events[${index}].kind`),
      ...(event.payload === undefined ? {} : { payload: event.payload }),
    });
  });
}

function chunkEvents(
  events: readonly SegmentEventFact[],
  maxEventsPerChunk: number,
  maxChunkBytes: number,
): readonly (readonly SegmentEventFact[])[] {
  const chunks: SegmentEventFact[][] = [];
  let current: SegmentEventFact[] = [];
  for (const event of events) {
    const candidate = [...current, event];
    const bytes = measureJsonBytes({ events: candidate }, 'chunk');
    if (current.length > 0 && (candidate.length > maxEventsPerChunk || bytes > maxChunkBytes)) {
      chunks.push(current);
      current = [event];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.map((chunk) => Object.freeze(chunk));
}

function manifestBody(
  input: SegmentSaveInput,
  events: readonly SegmentEventFact[],
  chunkCount: number,
  digest: string,
  sealed: boolean,
): Record<string, unknown> {
  return {
    kind: 'SEGMENT_MANIFEST',
    segmentId: input.segmentId,
    sessionId: input.sessionId,
    vehicleId: input.vehicleId,
    controlMode: input.controlMode,
    learningEligible: input.learningEligible,
    baseVersionId: input.baseVersionId,
    learningEpoch: input.learningEpoch,
    startTick: input.startTick,
    endTick: input.endTick,
    closeReason: input.closeReason,
    sourceReason: input.incompleteReason ?? null,
    sampleCount: input.sampleCount,
    eventCount: events.length,
    chunkCount,
    digest,
    sealed,
  };
}

function chunkBody(
  input: SegmentSaveInput,
  chunkIndex: number,
  chunkCount: number,
  events: readonly SegmentEventFact[],
): Record<string, unknown> {
  return {
    kind: 'SEGMENT_EVENTS',
    segmentId: input.segmentId,
    sessionId: input.sessionId,
    chunkIndex,
    chunkCount,
    eventCount: events.length,
    events,
  };
}

/**
 * Writes one segment durably: manifest, chunks, then the seal.
 *
 * The three steps are separate transactions on purpose: that is what makes an interrupted write
 * observable. The reader treats an unsealed manifest as an incomplete segment.
 */
export async function writeSegment(
  repository: LocalRepository,
  input: SegmentSaveInput,
  options: SegmentWriteOptions = {},
): Promise<SegmentWriteResult> {
  const maxEventsPerChunk = options.maxEventsPerChunk ?? 64;
  const maxChunkBytes = options.maxChunkBytes ?? 131_072;
  let events: readonly SegmentEventFact[];
  try {
    events = normalizeSegmentInput(input);
  } catch (error) {
    if (error instanceof PersistenceError) {
      return Object.freeze({
        segmentId: input.segmentId,
        status: 'REJECTED' as const,
        chunkCount: 0,
        eventCount: 0,
        bytes: 0,
        rejection: invalid(error.code, error.message, error.path ?? 'segment'),
      });
    }
    throw error;
  }
  const chunks = chunkEvents(events, maxEventsPerChunk, maxChunkBytes);
  const digest = digestEvents(events);
  const hooks = options.hooks ?? {};
  const now = options.now ?? (() => new Date().toISOString());

  // A re-save continues the revision sequence of the stored manifest instead of failing.
  const existingManifest = await repository.getSegment(input.segmentId);
  const baseRevision = existingManifest?.revision ?? 0;

  try {
    const prepared = await repository.putSegment({
      schemaVersion: 1,
      recordKind: 'SEGMENT',
      recordId: input.segmentId,
      sessionId: input.sessionId,
      worldEpoch: input.worldEpoch,
      status: 'OPEN',
      revision: baseRevision + 1,
      createdAt: now(),
      body: manifestBody(input, events, chunks.length, digest, false),
    });
    if (prepared.status === 'REJECTED') {
      return Object.freeze({
        segmentId: input.segmentId,
        status: 'REJECTED' as const,
        chunkCount: 0,
        eventCount: events.length,
        bytes: 0,
        rejection: prepared.rejection,
      });
    }
    hooks.afterManifest?.();

    let bytes = 0;
    for (const [index, chunk] of chunks.entries()) {
      const chunkId = `${input.segmentId}#${index}`;
      const existingChunk = await repository.getSegment(chunkId);
      const written = await repository.putSegment({
        schemaVersion: 1,
        recordKind: 'SEGMENT',
        recordId: chunkId,
        sessionId: input.sessionId,
        worldEpoch: input.worldEpoch,
        status: 'CLOSED',
        revision: (existingChunk?.revision ?? 0) + 1,
        createdAt: now(),
        body: chunkBody(input, index, chunks.length, chunk),
      });
      if (written.status === 'REJECTED') {
        return Object.freeze({
          segmentId: input.segmentId,
          status: 'REJECTED' as const,
          chunkCount: chunks.length,
          eventCount: events.length,
          bytes,
          rejection: written.rejection,
        });
      }
      bytes += written.bytes;
      hooks.afterChunk?.(index);
    }

    const sealed = await repository.putSegment({
      schemaVersion: 1,
      recordKind: 'SEGMENT',
      recordId: input.segmentId,
      sessionId: input.sessionId,
      worldEpoch: input.worldEpoch,
      status: input.completeness,
      revision: baseRevision + 2,
      createdAt: now(),
      body: manifestBody(input, events, chunks.length, digest, true),
    });
    if (sealed.status === 'REJECTED') {
      return Object.freeze({
        segmentId: input.segmentId,
        status: 'REJECTED' as const,
        chunkCount: chunks.length,
        eventCount: events.length,
        bytes,
        rejection: sealed.rejection,
      });
    }
    return Object.freeze({
      segmentId: input.segmentId,
      status: 'COMMITTED' as const,
      chunkCount: chunks.length,
      eventCount: events.length,
      bytes: bytes + sealed.bytes,
      rejection: null,
    });
  } catch (error) {
    // The process died in the middle of the write. Whatever reached the store stays there, the
    // caller is told the write failed, and the reader reports the segment as incomplete.
    return Object.freeze({
      segmentId: input.segmentId,
      status: 'REJECTED' as const,
      chunkCount: chunks.length,
      eventCount: events.length,
      bytes: 0,
      rejection: invalid(
        'TRANSACTION_ABORTED',
        error instanceof Error ? error.message : 'The segment write was interrupted',
        'segment',
      ),
    });
  }
}

interface SegmentRow {
  readonly recordId: string;
  readonly sessionId: string;
  readonly status: string | null;
  readonly body: Readonly<Record<string, unknown>>;
}

function rowOf(record: {
  readonly recordId: string;
  readonly sessionId: string;
  readonly status: string | null;
  readonly body: Readonly<Record<string, unknown>>;
}): SegmentRow {
  return {
    recordId: record.recordId,
    sessionId: record.sessionId,
    status: record.status,
    body: record.body,
  };
}

function numberOf(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function eventsOf(value: unknown): SegmentEventFact[] {
  if (!Array.isArray(value)) return [];
  const events: SegmentEventFact[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const data = entry as Record<string, unknown>;
    const sequence = numberOf(data.sequence, -1);
    const eventId = stringOf(data.eventId);
    const tick = numberOf(data.tick, -1);
    const kind = stringOf(data.kind);
    if (sequence < 0 || eventId === null || tick < 0 || kind === null) continue;
    const payload = data.payload;
    events.push(
      Object.freeze({
        sequence,
        eventId,
        tick,
        kind,
        ...(typeof payload === 'object' && payload !== null && !Array.isArray(payload)
          ? { payload: payload as Readonly<Record<string, unknown>> }
          : {}),
      }),
    );
  }
  return events;
}

/**
 * Reads one segment back, reporting its real completeness.
 *
 * The function never completes a segment: it returns the events that are stored, the chunks that
 * are missing and the reason why the segment is not complete.
 */
export async function readSegment(
  repository: LocalRepository,
  sessionId: string,
  segmentId: string,
): Promise<RecoveredSegment | null> {
  const rows = await repository.listSegments(sessionId);
  const parts = rows.map(rowOf).filter((row) => stringOf(row.body.segmentId) === segmentId);
  const manifest = parts.find((row) => row.body.kind === 'SEGMENT_MANIFEST');
  if (manifest === undefined) return null;
  const body = manifest.body;
  const chunkRows = parts
    .filter((row) => row.body.kind === 'SEGMENT_EVENTS')
    .sort((left, right) => numberOf(left.body.chunkIndex) - numberOf(right.body.chunkIndex));
  const chunkCount = numberOf(body.chunkCount);
  const presentChunks = chunkRows.map((row) => numberOf(row.body.chunkIndex));
  const missingChunks: number[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    if (!presentChunks.includes(index)) missingChunks.push(index);
  }
  const events = chunkRows.flatMap((row) => eventsOf(row.body.events));
  const storedDigest = stringOf(body.digest) ?? '';
  const digestMatches = digestEvents(events) === storedDigest;
  const ordered = events.every(
    (event, index) => index === 0 || event.sequence > events[index - 1]!.sequence,
  );
  const sealed = body.sealed === true;
  const sourceReason = stringOf(body.sourceReason);
  const expectedEventCount = numberOf(body.eventCount);

  let completeness: 'CLOSED' | 'INCOMPLETE' = 'INCOMPLETE';
  let reason: SegmentIncompleteReason | null = null;
  if (manifest.status === 'INCOMPLETE') {
    reason = 'SOURCE_INCOMPLETE';
  } else if (!sealed) {
    reason = 'UNSEALED_WRITE';
  } else if (missingChunks.length > 0) {
    reason = 'MISSING_CHUNKS';
  } else if (!ordered) {
    reason = 'ORDER_VIOLATION';
  } else if (!digestMatches) {
    reason = 'DIGEST_MISMATCH';
  } else if (manifest.status !== 'CLOSED') {
    reason = 'UNSEALED_WRITE';
  } else {
    completeness = 'CLOSED';
    reason = null;
  }

  return Object.freeze({
    segmentId,
    sessionId,
    completeness,
    reason,
    closeReason: stringOf(body.closeReason),
    sourceReason,
    vehicleId: stringOf(body.vehicleId) ?? '',
    controlMode: stringOf(body.controlMode) ?? 'MANUAL',
    startTick: numberOf(body.startTick),
    endTick: body.endTick === null || body.endTick === undefined ? null : numberOf(body.endTick),
    learningEligible: body.learningEligible === true,
    learningEpoch: numberOf(body.learningEpoch),
    baseVersionId: stringOf(body.baseVersionId) ?? '',
    sampleCount: numberOf(body.sampleCount),
    events: Object.freeze(events),
    eventCount: events.length,
    expectedEventCount,
    presentChunks: Object.freeze(presentChunks),
    missingChunks: Object.freeze(missingChunks),
    sealed,
    digest: storedDigest,
    digestMatches,
  });
}
