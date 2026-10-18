export const RAF_DIAGNOSTIC = Object.freeze({
  version: 'raf-scheduling-observation-v1',
  secondsPerPhase: 40,
  phases: 3,
  frameCap: 30000,
  heartbeatCap: 4000,
  longTaskCap: 4096,
  heartbeatMs: 50,
  waitWatchdogMs: 4000,
  nativeDebtMs: 250,
  nativeCatchupMax: 4,
  cars: 70,
});
export interface WaitObservation {
  phase: string;
  first: boolean;
  requestMs: number;
  beforeReadStartMs: number;
  beforeReadEndMs: number;
  afterReadStartMs: number | null;
  afterReadEndMs: number | null;
  stampMs: number | null;
  callbackMs: number | null;
  nativeBefore: number | null;
  nativeAfter: number | null;
  controllerBefore: number | null;
  controllerAfter: number | null;
  priorRenderStartMs: number | null;
  priorRenderFinishMs: number | null;
  timeout: boolean;
}
export function correlateWait(
  wait: WaitObservation,
  tasks: readonly { startMs: number; durationMs: number }[],
) {
  const end = wait.callbackMs;
  if (end === null) return { status: 'UNOBSERVED_CALLBACK', overlaps: [] };
  const overlaps = tasks.filter(
    (t) => t.startMs < end && t.startMs + t.durationMs > wait.requestMs,
  );
  return {
    status: overlaps.length ? 'OBSERVED_LONGTASK_OVERLAP' : 'NO_OBSERVED_LONGTASK_OVERLAP',
    overlaps,
  };
}
export function pushBounded<T>(rows: T[], value: T, cap: number) {
  if (rows.length >= cap) throw new Error('diagnostic evidence capacity');
  rows.push(value);
}
