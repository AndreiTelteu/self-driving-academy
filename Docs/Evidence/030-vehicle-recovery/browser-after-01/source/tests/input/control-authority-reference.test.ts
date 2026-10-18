import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceChanges, referenceSeat } from './control-authority-reference';
const ids = [
  Object.freeze({ entityId: 'a', handle: 1, generation: 1 }),
  Object.freeze({ entityId: 'b', handle: 2, generation: 2 }),
];
test('066 preproduction schedule exercises all modes and explicit coherent published024 handoff', () => {
  assert.equal(referenceSeat(1, ids), null);
  const manual = referenceSeat(21, ids);
  assert.equal(manual?.identity, ids[0]);
  assert.equal(manual?.mode, 'MANUAL');
  const learning = referenceSeat(41, ids);
  assert.equal(learning?.identity, ids[0]);
  assert.equal(learning?.mode, 'LEARNING');
  assert.deepEqual(referenceChanges(manual, learning), [{ identity: ids[0], mode: 'LEARNING' }]);
  const transfer = referenceSeat(61, ids);
  assert.deepEqual(referenceChanges(learning, transfer), [
    { identity: ids[0], mode: 'AUTO' },
    { identity: ids[1], mode: 'MANUAL' },
  ]);
  assert.deepEqual(referenceChanges(transfer, referenceSeat(81, ids)), [
    { identity: ids[1], mode: 'AUTO' },
  ]);
  assert.equal(referenceSeat(101, ids)?.mode, 'LEARNING');
  assert.equal(referenceSeat(121, ids), null);
});
