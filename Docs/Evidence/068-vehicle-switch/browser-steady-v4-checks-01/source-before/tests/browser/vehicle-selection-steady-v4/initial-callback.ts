export type EntryPoint = { nativeSerial: number; controllerTick: number };
export type EntryCallback = {
  requestStartedAt: number;
  previousStamp: number;
  returnedStamp: number | null;
  callbackObservedAt: number | null;
  timeoutObservedAt: number | null;
  counterBefore: EntryPoint;
  counterAfter: EntryPoint | null;
  debtSecondsBefore: number;
  activeRealSecondsBefore: number;
  outcome: 'PENDING' | 'RETURNED' | 'TIMEOUT';
};
/** Only the one initial duplicate followup owns a timer and cancellation. No native work. */
export function boundedRaf(
  ports: {
    request: (cb: (stamp: number) => void) => number;
    cancel: (id: number) => void;
    timer: (cb: () => void, ms: number) => number;
    clear: (id: number) => void;
  },
  timeout: () => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const handle = ports.request((stamp) => {
      if (settled) return;
      settled = true;
      ports.clear(timer);
      resolve(stamp);
    });
    const timer = ports.timer(() => {
      if (settled) return;
      settled = true;
      ports.cancel(handle);
      timeout();
      reject(Error('Initial repeated RAF followup delivery timeout'));
    }, 250);
  });
}

/** Preserve Window receiver for every native scheduling operation; pure injected seam for tests. */
export function windowRafPorts(
  target: Pick<
    Window,
    'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout'
  >,
) {
  return {
    request: (cb: (stamp: number) => void) => target.requestAnimationFrame(cb),
    cancel: (id: number) => target.cancelAnimationFrame(id),
    timer: (cb: () => void, ms: number) => target.setTimeout(cb, ms),
    clear: (id: number) => target.clearTimeout(id),
  };
}
