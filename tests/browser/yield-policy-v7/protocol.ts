import { validateCounter } from '../yield-policy-v5/clock-proof';
import type { NativeCounter } from '../yield-policy-v5/clock-proof';
import { LONGTASK_CAPACITY } from './observations';
// Full proof/windows/capacities remain owned by the byte-frozen original protocol.
export * from '../yield-policy-v5/protocol';
export const V7_REVISION = '052-v7-boundary-callback-longtask-observations';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error('052 V7 ' + message);
}
function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'diagnostic object');
  return value as Record<string, unknown>;
}
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value);
function counter(value: unknown) {
  const row = object(value);
  validateCounter(row as unknown as NativeCounter);
  return row;
}

/** Optional on historical metadata; required by the distinct V7 reader. Partial diagnostics never grant acceptance. */
export function validateObservationMetadata(value: unknown, complete: boolean, requireV7 = false) {
  const meta = object(value);
  if (requireV7) check(meta.warmBoundary !== undefined && meta.longTasks !== undefined &&
    meta.diagnostics !== undefined, 'missing observation metadata');
  if (meta.warmBoundary !== undefined) {
    const boundary = object(meta.warmBoundary);
    check(typeof boundary.attempted === 'boolean', 'boundary attempt flag');
    if (complete) check(boundary.attempted && boundary.diagnostic !== null, 'unchecked boundary');
    if (boundary.diagnostic !== null) {
      const diagnostic = object(boundary.diagnostic);
      check(boundary.attempted && diagnostic.status === 'DIAGNOSTIC_ONLY' &&
        diagnostic.performanceAcceptance === false &&
        diagnostic.predicate === '052 actual warm-boundary native counter', 'boundary disposition');
      const entry = counter(diagnostic.phaseEntry), previous = counter(diagnostic.previousRaf);
      counter(diagnostic.diagnosticCounter);
      check(finite(entry.timeMs) && finite(previous.timeMs) && finite(previous.observedAtMs), 'boundary clocks');
      check(integer(diagnostic.recordedFrames) && diagnostic.recordedFrames <= 60000, 'prefix count');
      const entryTick = entry.controllerTick as number, previousTick = previous.controllerTick as number;
      const within = previousTick <= entryTick + 4 && previousTick >= Math.max(0, entryTick - 4);
      check(diagnostic.result === (within ? 'WITHIN_EXISTING_BOUNDARY' : 'REJECTED'), 'boundary result');
      if (complete) {
        check(within, 'rejected complete boundary');
        const proof = object(meta.dualClock);
        for (const [observed, original] of [[entry, object(proof.phaseEntry)], [previous, object(proof.previousRaf)]])
          for (const key of Object.keys(observed)) check(observed[key] === original[key], 'boundary original identity');
        check(diagnostic.recordedFrames <= (object(meta.measurement).samples as number), 'boundary prefix exceeds raw');
      } else {
        check(integer(meta.recordedFrames) && meta.recordedFrames <= 60000 &&
          diagnostic.recordedFrames <= meta.recordedFrames &&
          (within || diagnostic.recordedFrames === meta.recordedFrames), 'partial attempted prefix identity');
        for (const [observed, original] of [[entry, object(meta.phaseEntry)], [previous, object(meta.previousRaf)]])
          for (const key of Object.keys(observed)) check(observed[key] === original[key], 'partial original identity');
      }
    }
  }
  if (meta.diagnostics !== undefined) {
    const diagnostics = object(meta.diagnostics);
    check(diagnostics.status === 'DIAGNOSTIC_ONLY' && diagnostics.performanceAcceptance === false, 'diagnostic acceptance');
    if (diagnostics.rafAttempt !== null) {
      const raf = object(diagnostics.rafAttempt);
      const hasCallback = raf.rafCallbackMs !== undefined, hasContinuation = raf.continuationStartMs !== undefined;
      check(hasCallback === hasContinuation, 'callback/continuation pair');
      if (hasCallback) {
        counter(raf.counterBefore);
        check(finite(raf.waitStartMs) && finite(raf.rafCallbackMs) && finite(raf.continuationStartMs) &&
          finite(raf.stampMs) && raf.waitStartMs <= raf.rafCallbackMs &&
          raf.rafCallbackMs <= raf.continuationStartMs &&
          raf.stampMs <= raf.rafCallbackMs + 1e-6, 'callback/continuation semantics');
        if (raf.continuationReadMs !== undefined) {
          counter(raf.counterAfter);
          check(finite(raf.continuationReadMs) && raf.continuationReadMs >= raf.continuationStartMs &&
            raf.callbackReadMs === raf.continuationReadMs, 'continuation counter-read semantics');
        } else if (complete) check(false, 'missing completed counter-read clock');
        if (raf.guardReadMs !== undefined) check(finite(raf.guardReadMs) &&
          finite(raf.continuationReadMs) && raf.guardReadMs >= raf.continuationReadMs, 'guard chronology');
      }
      if (complete && requireV7) check(hasCallback, 'missing completed RAF callback clock');
    } else if (complete && requireV7) check(false, 'missing completed RAF attempt');
  }
  if (meta.longTasks !== undefined) {
    const tasks = object(meta.longTasks);
    check(typeof tasks.supported === 'boolean' && integer(tasks.count) && finite(tasks.maxMs), 'longtask summary');
    if (tasks.observations !== undefined) {
      const observations = object(tasks.observations);
      check(observations.status === 'DIAGNOSTIC_ONLY' && observations.performanceAcceptance === false &&
        observations.cause === 'UNKNOWN' && observations.coverage ===
        'delivered callbacks plus takeRecords before disconnect; later delivery unknown', 'longtask unknown coverage');
      check(observations.capacity === LONGTASK_CAPACITY && integer(observations.observed) &&
        integer(observations.overflow) && integer(observations.invalid) &&
        Array.isArray(observations.entries) && observations.entries.length <= LONGTASK_CAPACITY &&
        observations.observed === observations.entries.length + observations.overflow + observations.invalid,
        'bounded longtask accounting');
      for (const key of ['acquired', 'drainAttempted', 'drained', 'disconnected'])
        check(typeof observations[key] === 'boolean', 'longtask ownership flag');
      check((!observations.drained || observations.drainAttempted) &&
        (!observations.disconnected || observations.drainAttempted) &&
        (!observations.drainAttempted || observations.acquired), 'longtask ownership chronology');
      check(observations.measuredStartMs === null || finite(observations.measuredStartMs), 'longtask window');
      if (complete) check(observations.measuredStartMs === object(meta.measurement).windowStartMs,
        'longtask original measured boundary');
      let count = 0, maxMs = 0;
      for (const value of observations.entries) {
        const entry = object(value);
        check(finite(entry.startTime) && finite(entry.duration), 'longtask entry');
        if (observations.measuredStartMs !== null && entry.startTime >= (observations.measuredStartMs as number)) {
          count++; maxMs = Math.max(maxMs, entry.duration);
        }
      }
      check(tasks.count >= count && tasks.count <= observations.observed - observations.invalid &&
        tasks.maxMs >= maxMs && (tasks.count !== 0 || tasks.maxMs === 0) &&
        (observations.overflow === 0 || observations.entries.length === LONGTASK_CAPACITY),
        'longtask overflow summary');
      if (observations.overflow === 0 && observations.invalid === 0)
        check(tasks.count === count && tasks.maxMs === maxMs, 'longtask delivered summary');
      if (!tasks.supported) check(!observations.acquired && observations.observed === 0 && tasks.count === 0 &&
        tasks.maxMs === 0, 'unsupported is unknown');
      if (complete) check(observations.overflow === 0 && observations.invalid === 0 &&
        (!tasks.supported || (observations.acquired && observations.drained && observations.disconnected)),
        'incomplete longtask observations');
    } else if (requireV7) check(false, 'missing bounded longtask observations');
  }
}
