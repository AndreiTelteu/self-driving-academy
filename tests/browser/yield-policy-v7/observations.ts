import { assertActualWarmBoundary, WarmBoundaryRejection } from './boundary';
import type { BoundaryAttempt, BoundaryDiagnostic } from './boundary';
import type { ClockPoint, RafPoint } from '../yield-policy-v5/clock-proof';

/** Records the callback clock before resolving; the caller separately reads its continuation. */
export function observeRaf(
  request: (callback: (stampMs: number) => void) => unknown,
  now: () => number,
): Promise<{ stampMs: number; callbackMs: number }> {
  return new Promise((resolve) => {
    request((stampMs) => resolve({ stampMs, callbackMs: now() }));
  });
}

/** One attempt, even on throw. Never replaces the caller's originally selected previous RAF. */
export function warmBoundaryObservation() {
  let attempted = false;
  let diagnostic: Readonly<BoundaryDiagnostic> | null = null;
  return {
    check(entry: ClockPoint | undefined, previous: RafPoint | undefined, attempt: BoundaryAttempt) {
      if (attempted || !entry || !previous) return;
      attempted = true;
      try {
        diagnostic = assertActualWarmBoundary(entry, previous, attempt);
      } catch (error) {
        if (error instanceof WarmBoundaryRejection) diagnostic = error.diagnostic;
        throw error;
      }
    },
    snapshot() {
      return structuredClone({ attempted, diagnostic });
    },
  };
}

export const LONGTASK_CAPACITY = 1024;
export interface LongTaskEntry { startTime: number; duration: number }
export interface LongTaskOwner {
  takeRecords(): readonly LongTaskEntry[];
  disconnect(): void;
}

/** All delivered entries retained up to the declared cap; overflow remains visible and rejects completion. */
export function longTaskObservations(supported: boolean, measuredStart: () => number | null) {
  const entries: LongTaskEntry[] = [];
  let observed = 0, overflow = 0, invalid = 0, count = 0, maxMs = 0;
  let owner: LongTaskOwner | null = null;
  let attempted = false, drained = false, disconnected = false;
  const ingest = (values: readonly LongTaskEntry[]) => {
    for (const entry of values) {
      observed++;
      if (!Number.isFinite(entry.startTime) || entry.startTime < 0 ||
          !Number.isFinite(entry.duration) || entry.duration < 0) {
        invalid++;
        continue;
      }
      const value = { startTime: entry.startTime, duration: entry.duration };
      if (entries.length < LONGTASK_CAPACITY) entries.push(value);
      else overflow++;
      const start = measuredStart();
      if (start !== null && value.startTime >= start) {
        count++;
        maxMs = Math.max(maxMs, value.duration);
      }
    }
  };
  return {
    ingest,
    acquire(value: LongTaskOwner) {
      if (!supported || owner || attempted) throw new Error('052 longtask ownership');
      owner = value;
    },
    finish() {
      if (attempted || !owner) return;
      attempted = true;
      const errors: unknown[] = [];
      try {
        ingest(owner.takeRecords());
        drained = true;
      } catch (error) {
        errors.push(error);
      }
      try {
        owner.disconnect();
        disconnected = true;
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length === 2) throw new AggregateError(errors, '052 longtask drain and disconnect failed');
    },
    assertComplete() {
      if (overflow || invalid || (supported && (!owner || !drained || !disconnected)))
        throw new Error('052 longtask observations incomplete/overflow');
    },
    snapshot() {
      return {
        supported, count, maxMs,
        observations: {
          status: 'DIAGNOSTIC_ONLY' as const, performanceAcceptance: false as const,
          capacity: LONGTASK_CAPACITY, observed, overflow, invalid,
          acquired: !!owner, drainAttempted: attempted, drained, disconnected,
          measuredStartMs: measuredStart(),
          entries: entries.map((value) => ({ ...value })),
          coverage: 'delivered callbacks plus takeRecords before disconnect; later delivery unknown',
          cause: 'UNKNOWN',
        },
      };
    },
  };
}
