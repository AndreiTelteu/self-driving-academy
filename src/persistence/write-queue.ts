import { PersistenceError, persistenceRejection } from './contracts';
import type { PersistenceRejection } from './contracts';
import type { LocalRepository } from './repository';
import { writeSegment } from './segment-store';
import type { SegmentSaveInput, SegmentWriteOptions, SegmentWriteResult } from './segment-store';

/**
 * Bounded asynchronous write queue for segments (PBI 129).
 *
 * The input loop must never wait for the storage: a long intervention produces many events and a
 * slow disk must not stall the controls. The queue therefore accepts the segment, returns
 * immediately and writes later, outside the tick hot path.
 *
 * Two properties are guaranteed:
 * - **Order**: the queue is FIFO and writes one segment at a time, so the segments reach the
 *   store in the order they were queued and the event order inside a segment is never changed.
 * - **Boundedness**: the queue never holds more than `maxPending` segments. A full queue refuses
 *   the new segment with `STORAGE_FULL` instead of growing without limit; the caller decides what
 *   to do (retry later, export, or drop with an explicit reason).
 */

export interface SegmentQueueResult {
  readonly segmentId: string;
  readonly status: 'COMMITTED' | 'REJECTED';
  readonly rejection: PersistenceRejection | null;
  readonly chunkCount: number;
  readonly eventCount: number;
}

export interface SegmentWriteQueueStats {
  readonly pending: number;
  readonly written: number;
  readonly rejected: number;
  readonly refused: number;
  readonly disposed: boolean;
}

export interface SegmentWriteQueueOptions {
  readonly repository: LocalRepository;
  /** Maximum number of segments waiting or in flight. */
  readonly maxPending?: number;
  /** Forwarded to the segment writer. */
  readonly writeOptions?: SegmentWriteOptions;
  /** Called after every settled segment; used by the HUD and by the tests. */
  readonly onSettled?: (result: SegmentQueueResult) => void;
}

export interface SegmentWriteQueue {
  /**
   * Accepts a segment for saving. The returned promise settles when the segment reached the
   * store; the call itself never waits for the storage.
   */
  enqueue(input: SegmentSaveInput): Promise<SegmentQueueResult>;
  /** Resolves when the queue is empty. */
  drain(): Promise<void>;
  stats(): SegmentWriteQueueStats;
  dispose(): void;
}

interface QueueEntry {
  readonly input: SegmentSaveInput;
  readonly resolve: (result: SegmentQueueResult) => void;
}

function rejectedResult(segmentId: string, rejection: PersistenceRejection): SegmentQueueResult {
  return Object.freeze({
    segmentId,
    status: 'REJECTED' as const,
    rejection,
    chunkCount: 0,
    eventCount: 0,
  });
}

export function createSegmentWriteQueue(options: SegmentWriteQueueOptions): SegmentWriteQueue {
  const repository = options.repository;
  const maxPending = options.maxPending ?? 4;
  const queue: QueueEntry[] = [];
  let current: Promise<void> | null = null;
  let disposed = false;
  let written = 0;
  let rejected = 0;
  let refused = 0;

  async function write(entry: QueueEntry): Promise<SegmentQueueResult> {
    let result: SegmentWriteResult;
    try {
      result = await writeSegment(repository, entry.input, options.writeOptions);
    } catch (error) {
      const rejection =
        error instanceof PersistenceError
          ? persistenceRejection(error.code, error.message, error.path)
          : persistenceRejection(
              'TRANSACTION_ABORTED',
              error instanceof Error ? error.message : 'The segment write failed',
              'segment',
            );
      return rejectedResult(entry.input.segmentId, rejection);
    }
    return Object.freeze({
      segmentId: result.segmentId,
      status: result.status,
      rejection: result.rejection,
      chunkCount: result.chunkCount,
      eventCount: result.eventCount,
    });
  }

  function pump(): Promise<void> {
    if (current !== null) return current;
    const run = async (): Promise<void> => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (entry === undefined) break;
        const settled = await write(entry);
        if (settled.status === 'COMMITTED') written += 1;
        else rejected += 1;
        options.onSettled?.(settled);
        entry.resolve(settled);
      }
    };
    current = run().finally(() => {
      current = null;
    });
    return current;
  }

  function enqueue(input: SegmentSaveInput): Promise<SegmentQueueResult> {
    if (disposed) {
      refused += 1;
      return Promise.reject(
        new PersistenceError('REPOSITORY_DISPOSED', 'The segment write queue was disposed'),
      );
    }
    // The segment being written counts as occupied too: the queue never holds more than
    // `maxPending` segments, not counting the one in flight.
    const occupancy = queue.length + (current === null ? 0 : 1);
    if (occupancy >= maxPending) {
      refused += 1;
      return Promise.reject(
        new PersistenceError(
          'STORAGE_FULL',
          `The segment write queue holds ${maxPending} segments; the new one was refused`,
          'segment',
        ),
      );
    }
    return new Promise<SegmentQueueResult>((resolve) => {
      queue.push({ input, resolve });
      void pump();
    });
  }

  return Object.freeze({
    enqueue,
    drain: async () => {
      while (true) {
        const pending = current;
        if (pending === null) {
          if (queue.length === 0) return;
          await pump();
          continue;
        }
        await pending;
        if (queue.length === 0 && current === null) return;
      }
    },
    stats: () =>
      Object.freeze({
        pending: queue.length,
        written,
        rejected,
        refused,
        disposed,
      }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const pending = queue.splice(0, queue.length);
      for (const entry of pending) {
        entry.resolve(
          rejectedResult(
            entry.input.segmentId,
            persistenceRejection(
              'REPOSITORY_DISPOSED',
              'The segment write queue was disposed before the write',
              'segment',
            ),
          ),
        );
      }
    },
  });
}
