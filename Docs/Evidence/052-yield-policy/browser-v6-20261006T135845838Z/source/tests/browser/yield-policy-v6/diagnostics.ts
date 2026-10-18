import type { NativeCounter } from '../yield-policy-v5/clock-proof';
export interface DiagnosticCounter {
  nativeSerial: number;
  controllerTick: number | null;
}
export interface NativeCost {
  tick: number;
  tickMs: number;
  stepMs: number;
  policyMs: number;
}
export interface BeforeNative {
  stage: 'SETUP' | 'DRIVING';
  tick: number;
  nowMs: number;
  targetMs: number | null;
  debtMs: number | null;
  counter: DiagnosticCounter;
}
export interface RafAttempt {
  tick: number;
  waitStartMs: number;
  targetMs: number;
  counterBefore: NativeCounter;
  previousRaf: Record<string, number> | null;
  recoveryStepsBeforeReset: number;
  stampMs?: number;
  callbackReadMs?: number;
  counterAfter?: NativeCounter;
  guardReadMs?: number;
  debtMs?: number;
}
export interface Presentation {
  tick: number;
  startMs: number;
  renderStartMs: number;
  renderFinishMs: number;
  finishMs: number;
  pendingNativeMs: number;
  mainMs: number;
}
/** Four native cost tuples and latest observations only, including warmup. No raw reconstruction. */
export function armDiagnostics() {
  let beforeNative: BeforeNative | null = null,
    rafAttempt: RafAttempt | null = null,
    presentation: Presentation | null = null;
  const nativeCosts: NativeCost[] = [];
  return {
    beforeNative(value: BeforeNative) {
      beforeNative = structuredClone(value);
    },
    nativeCost(value: NativeCost) {
      if (nativeCosts.length === 4) nativeCosts.shift();
      nativeCosts.push({ ...value });
    },
    wait(value: RafAttempt) {
      rafAttempt = structuredClone(value);
    },
    returned(
      value: Pick<
        RafAttempt,
        'stampMs' | 'callbackReadMs' | 'counterAfter' | 'guardReadMs' | 'debtMs'
      >,
    ) {
      if (!rafAttempt) throw new Error('052 diagnostic RAF return without wait');
      Object.assign(rafAttempt, structuredClone(value));
    },
    presented(value: Presentation) {
      presentation = { ...value };
    },
    snapshot() {
      return structuredClone({
        status: 'DIAGNOSTIC_ONLY',
        performanceAcceptance: false,
        diagnosticOverhead:
          'bounded observation/copy cost included in unchanged timing windows; not product performance',
        beforeNative,
        rafAttempt,
        nativeCosts,
        presentation,
      });
    },
  };
}
