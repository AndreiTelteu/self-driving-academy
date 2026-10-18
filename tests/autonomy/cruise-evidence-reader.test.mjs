import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertComparableCruiseRunner,
  CLEANUP_ANNOTATION,
} from '../../scripts/cruise-evidence-comparison.mjs';
test('046 common-runner reader admits only the reviewed single non-executable cleanup annotation', () => {
  const before = Buffer.from('const warmup=180;\n  throw new AggregateError(errors);\n');
  const after = Buffer.from(
    `const warmup=180;\n  ${CLEANUP_ANNOTATION}\n  throw new AggregateError(errors);\n`,
  );
  assert.doesNotThrow(() => assertComparableCruiseRunner(before, before));
  assert.doesNotThrow(() => assertComparableCruiseRunner(before, after));
  for (const mutation of [
    after.toString().replace('180', '1'),
    after.toString().replace('errors', '[]'),
    after.toString() + `${CLEANUP_ANNOTATION}\n`,
    after.toString().replace('every cleanup failure', 'some cleanup failures'),
    after.toString() + '// unreviewed\n',
  ])
    assert.throws(() => assertComparableCruiseRunner(before, Buffer.from(mutation)));
});
