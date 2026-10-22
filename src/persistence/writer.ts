import { boundedText } from './contracts';
import type { PersistenceReasonCode, RepositoryRole } from './contracts';
import type { LockManagerPort } from './ports';

/**
 * Single-writer protocol for one origin (Docs/15 §Autoritatea salvării între taburi).
 *
 * The production protocol is Web Locks: exactly one page holds the exclusive lock and therefore
 * the only write role. There is no "best effort" fallback, because a second autosave writing
 * concurrently is worse than an explicit read-only page:
 *
 * - `claim()` succeeds only if the lock is free; otherwise the page is READ_ONLY.
 * - `wait()` queues behind the holder (Web Locks is FIFO), which is the explicit transfer path:
 *   the holder calls `release()` and the waiter becomes the writer.
 * - when Web Locks is unavailable the role is READ_ONLY with `WEB_LOCKS_UNAVAILABLE`; writes are
 *   rejected instead of racing.
 * - a page that must close for a schema upgrade releases the lock before closing the database.
 */
export const WRITER_LOCK_NAME = 'self-driving-academy-persistence-writer' as const;

export interface WriterAuthorityState {
  readonly role: RepositoryRole;
  readonly reason: PersistenceReasonCode | null;
  readonly detail: string | null;
  readonly since: string;
  readonly tabId: string;
}

export interface WriterAuthorityOptions {
  readonly locks: LockManagerPort;
  readonly tabId: string;
  readonly now?: () => string;
  readonly onStateChange?: (state: WriterAuthorityState) => void;
}

export interface WriterAuthority {
  readonly tabId: string;
  state(): WriterAuthorityState;
  /** Non-blocking claim: WRITER or READ_ONLY, never WAITING. */
  claim(): Promise<WriterAuthorityState>;
  /** Queued claim: WAITING until the current holder releases. */
  wait(): Promise<WriterAuthorityState>;
  /** Releases a held lock or cancels a queued request. Idempotent. */
  release(): WriterAuthorityState;
  dispose(): void;
}

interface Hold {
  readonly controller: AbortController;
  release(): void;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : 'Unknown lock failure';
}

export function createWriterAuthority(options: WriterAuthorityOptions): WriterAuthority {
  const locks = options.locks;
  const tabId = boundedText(options.tabId, 'tabId', 128);
  const now = options.now ?? (() => new Date().toISOString());

  let state: WriterAuthorityState = Object.freeze({
    role: 'NONE' as RepositoryRole,
    reason: null,
    detail: null,
    since: now(),
    tabId,
  });
  let hold: Hold | null = null;
  let currentRequest: Promise<void> | null = null;
  let disposed = false;
  let requestSequence = 0;

  function publish(
    role: RepositoryRole,
    reason: PersistenceReasonCode | null,
    detail: string | null,
  ): WriterAuthorityState {
    state = Object.freeze({ role, reason, detail, since: now(), tabId });
    options.onStateChange?.(state);
    return state;
  }

  /** Narrowing `state.role` across an await would be wrong: another callback can publish. */
  const roleNow = (): RepositoryRole => state.role;

  async function request(ifAvailable: boolean): Promise<WriterAuthorityState> {
    if (disposed) {
      return publish('NONE', 'REPOSITORY_DISPOSED', 'The writer authority was disposed');
    }
    if (!locks.available) {
      return publish(
        'READ_ONLY',
        'WEB_LOCKS_UNAVAILABLE',
        'Web Locks are unavailable; this page cannot own the write role',
      );
    }
    if (roleNow() === 'WRITER') return state;
    if (currentRequest !== null) {
      try {
        await currentRequest;
      } catch {
        // A previous request failed or was aborted; the new request reports its own outcome.
      }
      currentRequest = null;
      if (disposed || roleNow() === 'WRITER') return state;
    }

    requestSequence += 1;
    const controller = new AbortController();
    let releaseHold: (() => void) | null = null;
    let settle: ((granted: boolean) => void) | null = null;
    const granted = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    const current: Hold = {
      controller,
      release: () => {
        releaseHold?.();
      },
    };
    hold = current;
    currentRequest = locks
      .request(
        WRITER_LOCK_NAME,
        { mode: 'exclusive', ifAvailable, signal: controller.signal },
        async (held) => {
          settle?.(held);
          settle = null;
          if (!held) return;
          await new Promise<void>((resolve) => {
            releaseHold = resolve;
          });
          releaseHold = null;
        },
      )
      .then(
        () => {
          if (hold === current) hold = null;
          if (state.role === 'WRITER') {
            publish('RELEASED', 'WRITER_RELEASED', 'The writer lock was released');
          }
        },
        (error: unknown) => {
          if (hold === current) hold = null;
          settle?.(false);
          settle = null;
          if (error instanceof Error && error.name === 'AbortError') {
            if (state.role !== 'RELEASED') {
              publish('READ_ONLY', 'WRITER_RELEASED', 'The queued writer request was cancelled');
            }
            return;
          }
          publish('READ_ONLY', 'OPEN_FAILED', errorDetail(error));
        },
      );
    const held = await granted;
    return held
      ? publish('WRITER', null, `Writer lock request ${requestSequence}`)
      : publish('READ_ONLY', 'WRITER_HELD_BY_OTHER_TAB', 'Another tab owns the writer lock');
  }

  return Object.freeze({
    tabId,
    state: () => state,
    claim: () => request(true),
    wait: () => {
      if (disposed || state.role === 'WRITER') return Promise.resolve(state);
      publish('WAITING', null, 'Waiting for the writer lock');
      return request(false);
    },
    release: () => {
      if (disposed) return state;
      const current = hold;
      hold = null;
      if (state.role === 'WRITER' && current !== null) {
        publish('RELEASED', 'WRITER_RELEASED', 'The writer lock was released by this page');
        current.release();
        return state;
      }
      if (current !== null) {
        current.controller.abort();
        current.release();
        return publish('READ_ONLY', 'WRITER_RELEASED', 'The queued writer request was cancelled');
      }
      return state;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const current = hold;
      hold = null;
      if (current !== null) {
        current.controller.abort();
        current.release();
      }
      publish('NONE', 'REPOSITORY_DISPOSED', 'The writer authority was disposed');
    },
  });
}
