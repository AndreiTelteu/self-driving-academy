/** Bounded error evidence; never rely on JSON serialization of Error objects. */
export function errorEvidence(value: unknown, depth = 0): unknown {
  if (depth >= 8) return { name: 'TRUNCATED_CAUSE', message: 'Nested cause cap8 reached' };
  if (value instanceof Error) return {
    name: value.name.slice(0, 256), message: value.message.slice(0, 4096),
    cause: value.cause === undefined ? null : errorEvidence(value.cause, depth + 1),
    errors: value instanceof AggregateError ? Array.from(value.errors).slice(0, 32).map((error) => errorEvidence(error, depth + 1)) : null,
  };
  return { name: 'NON_ERROR', message: String(value).slice(0, 4096) };
}
