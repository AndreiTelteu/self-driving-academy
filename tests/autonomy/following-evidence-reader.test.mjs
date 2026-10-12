import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareFollowing } from '../../scripts/verify-following.mjs';
function reports() {
  const before = {
    binding: {
      phase: 'before',
      native: { sha256: 'native' },
      inputs: [{ path: 'scripts/benchmark-following.mjs', sha256: 'fixed' }],
    },
    report: { fixture: 'same', runtime: 'same', cpu: 'same', os: 'same', runs: [] },
  };
  for (const count of [70, 110])
    for (let pair = 0; pair < 3; pair++)
      before.report.runs.push({
        count,
        pair,
        observer: true,
        tickP95Ms: 2,
        ownP95Ms: 1,
        trace: [[60, 4, 0]],
        physicalHash: 'same',
      });
  const after = structuredClone(before);
  after.binding.phase = 'after';
  return { after, before };
}
test('048 reader refuses relative escalation, changed common source, scalar/physics drift and native mismatch', () => {
  const { after, before } = reports();
  assert.equal(compareFollowing(after, before).length, 2);
  for (const mutate of [
    (r) => {
      for (const row of r.report.runs) row.tickP95Ms = 3.5;
    },
    (r) => (r.binding.inputs[0].sha256 = 'changed'),
    (r) => (r.report.runs[0].trace[0][1] = 5),
    (r) => (r.report.runs[0].physicalHash = 'changed'),
    (r) => (r.binding.native.sha256 = 'changed'),
  ]) {
    const bad = structuredClone(after);
    mutate(bad);
    assert.throws(() => compareFollowing(bad, before));
  }
});
