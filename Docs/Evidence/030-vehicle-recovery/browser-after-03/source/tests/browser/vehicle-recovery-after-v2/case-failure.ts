/** Display only: never coerce a thrown object or invoke an accessor. Exact cause stays attached. */
function display(cause: unknown): string {
  if (cause === null) return 'null';
  if (typeof cause === 'string') return cause.slice(0, 2048);
  if (typeof cause === 'number' || typeof cause === 'boolean' || typeof cause === 'bigint')
    return String(cause);
  if (typeof cause === 'undefined') return 'undefined';
  if (typeof cause === 'symbol') return '[symbol thrown value]';
  try {
    const descriptor = Object.getOwnPropertyDescriptor(cause, 'message');
    if (descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string')
      return descriptor.value.slice(0, 2048);
  } catch {
    /* A hostile proxy is display-unavailable; its original identity remains the cause. */
  }
  return '[non-primitive thrown value; inspect retained cause ledger]';
}
export function functionalCaseFailure(hasPrimary: boolean, primary: unknown, causes: unknown) {
  const error = new Error(
    'Functional case failed: ' + (hasPrimary ? display(primary) : 'cleanup/readback failure'),
    hasPrimary ? { cause: primary } : undefined,
  );
  return Object.assign(error, { hasPrimary, causes });
}
