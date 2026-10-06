import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceMode, referenceSeat, referenceAction } from './mode-controls-reference';
test('067 reference exercises all six edges repeatedly without production adapter', () => {
  const cases = [
    ['AUTO', 'M', 'MANUAL'],
    ['MANUAL', 'M', 'AUTO'],
    ['LEARNING', 'M', 'AUTO'],
    ['AUTO', 'L', 'LEARNING'],
    ['MANUAL', 'L', 'LEARNING'],
    ['LEARNING', 'L', 'MANUAL'],
  ] as const;
  for (const [from, key, to] of cases) assert.equal(referenceMode(from, key), to);
  const ids = [Object.freeze({ entityId: 'a', handle: 1, generation: 1 })];
  let mode: 'AUTO' | 'MANUAL' | 'LEARNING' = 'AUTO';
  const covered = new Set<string>();
  for (let tick = 1; tick <= 780; tick++) {
    const action = referenceAction(tick);
    if (action) {
      const next = referenceMode(mode, action);
      covered.add(mode + ':' + action + ':' + next);
      mode = next;
    }
    assert.equal(referenceSeat(tick, ids)?.mode ?? 'AUTO', mode);
  }
  assert.equal(covered.size, 6);
});
