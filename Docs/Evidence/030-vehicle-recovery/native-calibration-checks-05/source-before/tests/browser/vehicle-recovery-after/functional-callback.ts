/** Actual returned callback snapshot is retained before caller presentation/debt guards.
 * Injected ports allow pure failures without constructing a world or browser.
 */
export async function observeFunctionalCallback<T extends string>(
  ports: {
    now: () => number;
    nativeSerial: () => number;
    next: () => Promise<number>;
    retain: (row: object) => void;
  },
  stage: T,
  previousStamp: number | null,
) {
  const requestMs = ports.now(),
    nativeBefore = ports.nativeSerial(),
    stamp = await ports.next();
  const row = {
    stage,
    requestMs,
    stamp,
    readMs: ports.now(),
    previousStamp,
    nativeBefore,
    nativeAfter: ports.nativeSerial(),
  };
  ports.retain(row);
  return row;
}
