import { observeFunctionalCallback } from '../vehicle-recovery-after/functional-callback';

export interface FunctionalPresentation {
  observedMs: number;
  focus: boolean;
  visibility: string;
  stickyLost: boolean;
  contextLost: boolean;
  dpr: number;
  css: [number, number];
  internal: [number, number];
}
export interface FunctionalDraw {
  startedMs: number;
  endedMs: number;
  completed: boolean;
  nativeBefore: number;
  nativeAfter: number;
}
/** One bounded returned-callback snapshot; no extra native steps, timing changes or cause inference. */
export async function observeFunctionalCallbackDiagnostic<T extends string>(
  ports: {
    now: () => number;
    nativeSerial: () => number;
    next: () => Promise<number>;
    retain: (row: object) => void;
    presentation: () => FunctionalPresentation;
  },
  stage: T,
  previousStamp: number | null,
  priorDraw: FunctionalDraw | null,
) {
  const beforeRequest = ports.presentation();
  return observeFunctionalCallback(
    {
      ...ports,
      retain: (row) =>
        ports.retain({
          ...row,
          diagnostics: {
            revision: '030-functional-diagnostic-overlay-v2',
            anchor: previousStamp === null ? 'FIRST_CALLBACK' : 'STEADY_CALLBACK',
            beforeRequest,
            afterCallback: ports.presentation(),
            priorDraw: priorDraw ? { ...priorDraw } : null,
            schedulingCause: 'UNKNOWN',
          },
        }),
    },
    stage,
    previousStamp,
  );
}
