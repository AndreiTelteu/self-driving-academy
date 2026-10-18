import { validateCounter } from '../yield-policy-v5/clock-proof';
import type { ClockPoint, NativeCounter, RafPoint } from '../yield-policy-v5/clock-proof';

export interface BoundaryAttempt {
  recordedFrames: number;
  diagnosticCounter: NativeCounter;
}

/** Scalar-only failure context. The caller retains/exports its entire attempted raw prefix. */
export interface BoundaryDiagnostic {
  status: 'DIAGNOSTIC_ONLY';
  performanceAcceptance: false;
  result: 'WITHIN_EXISTING_BOUNDARY' | 'REJECTED';
  predicate: '052 actual warm-boundary native counter';
  phaseEntry: Readonly<ClockPoint>;
  previousRaf: Readonly<RafPoint>;
  diagnosticCounter: Readonly<NativeCounter>;
  recordedFrames: number;
}

export class WarmBoundaryRejection extends Error {
  readonly diagnostic: Readonly<BoundaryDiagnostic>;

  constructor(diagnostic: Readonly<BoundaryDiagnostic>) {
    super(diagnostic.predicate);
    this.name = 'WarmBoundaryRejection';
    this.diagnostic = diagnostic;
  }
}

/**
 * Proposed V7 fail-fast check, only when both actual observations exist.
 * Same inclusive predicate as the frozen V5 dual-clock proof used by V6.
 * No clock, world, history, channel copying, counter substitution or scheduling effect.
 */
export function assertActualWarmBoundary(
  phaseEntry: ClockPoint,
  previousRaf: RafPoint,
  attempt: BoundaryAttempt,
): Readonly<BoundaryDiagnostic> {
  for (const counter of [phaseEntry, previousRaf, attempt.diagnosticCounter])
    validateCounter(counter);
  if (
    !Number.isSafeInteger(attempt.recordedFrames) ||
    attempt.recordedFrames < 0 ||
    attempt.recordedFrames > 60000
  )
    throw new Error('052 bounded attempted RAF prefix count');

  const withinBoundary =
    previousRaf.controllerTick <= phaseEntry.controllerTick + 4 &&
    previousRaf.controllerTick >= Math.max(0, phaseEntry.controllerTick - 4);
  const diagnostic: Readonly<BoundaryDiagnostic> = Object.freeze({
    status: 'DIAGNOSTIC_ONLY',
    performanceAcceptance: false,
    result: withinBoundary ? 'WITHIN_EXISTING_BOUNDARY' : 'REJECTED',
    predicate: '052 actual warm-boundary native counter',
    phaseEntry: Object.freeze({
      timeMs: phaseEntry.timeMs,
      nativeSerial: phaseEntry.nativeSerial,
      controllerTick: phaseEntry.controllerTick,
    }),
    previousRaf: Object.freeze({
      timeMs: previousRaf.timeMs,
      observedAtMs: previousRaf.observedAtMs,
      nativeSerial: previousRaf.nativeSerial,
      controllerTick: previousRaf.controllerTick,
    }),
    diagnosticCounter: Object.freeze({
      nativeSerial: attempt.diagnosticCounter.nativeSerial,
      controllerTick: attempt.diagnosticCounter.controllerTick,
    }),
    recordedFrames: attempt.recordedFrames,
  });
  if (!withinBoundary) throw new WarmBoundaryRejection(diagnostic);
  return diagnostic;
}
