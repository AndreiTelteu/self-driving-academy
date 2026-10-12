import assert from 'node:assert/strict';
export const CLEANUP_ANNOTATION =
  '// eslint-disable-next-line no-unsafe-finally -- Preserve the primary failure together with every cleanup failure.';
/** The only allowed common-runner difference is one reviewed non-executable lint annotation. */
export function assertComparableCruiseRunner(before, after) {
  if (before.equals(after)) return;
  const source = after.toString('utf8'),
    lines = source.split('\n'),
    matches = lines.filter((line) => line.trim() === CLEANUP_ANNOTATION);
  assert.equal(matches.length, 1, 'Unexpected runner annotation count');
  const stripped = lines.filter((line) => line.trim() !== CLEANUP_ANNOTATION).join('\n');
  assert(Buffer.from(stripped).equals(before), 'Executable/common runner bytes changed');
}
