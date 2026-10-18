/** Bounded browser-safe diagnostics. Never convert objects or traverse their graphs. */
export function safeDiagnostic(value, limit = 1024) {
  limit = Number.isInteger(limit) ? Math.max(0, Math.min(1024, limit)) : 1024;
  let text = 'UNKNOWN';
  if (typeof value === 'string') text = value;
  else if (value === null) text = 'null';
  else if (value === undefined) text = 'undefined';
  else if (typeof value === 'boolean' || typeof value === 'number') text = String(value);
  else if (typeof value === 'object' || typeof value === 'function') {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, 'message');
      if (descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string')
        text = descriptor.value;
    } catch {
      // Revoked/hostile proxy descriptors are UNKNOWN; the original value is untouched.
    }
  }
  return { text: text.slice(0, limit), omittedCodeUnits: Math.max(0, text.length - limit) };
}
