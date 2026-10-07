import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference';
import {
  createReferenceResourceScope,
  createFixtureSegmentStore,
  referenceSelectionAdmission,
  referenceSelectionPhase,
} from './vehicle-selection-reference';
const a = Object.freeze({ entityId: 'a', handle: 1, generation: 1 });
test('068 independent schedule includes controlled departure and camera-only return in every mode', () => {
  const modes = new Set();
  for (let tick = 1; tick <= 780; tick++) {
    const phase = referenceSelectionPhase(tick);
    if (phase.claim) modes.add(phase.mode);
    assert.equal(phase.depart, (tick - 1) % 60 === 20);
    assert.equal(phase.returnCamera, (tick - 1) % 60 === 40);
  }
  assert.deepEqual([...modes].sort(), ['AUTO', 'LEARNING', 'MANUAL']);
});
test('068 fixture segment close is an actual005 record mutation bound to exact native generation', () => {
  const store = createFixtureSegmentStore(CONTROLLER_CONTEXT);
  store.open(a, 'LEARNING', 1);
  assert.throws(() => store.close({ ...a }, 2), /boundary/);
  assert.equal(store.read()?.segment.completeness, 'OPEN');
  store.close(a, 21);
  assert.equal(store.read()?.identity, a);
  assert.equal(store.read()?.segment.endTick, 21);
  assert.equal(store.read()?.segment.closeReason, 'VEHICLE_SWITCH');
  assert.equal(store.read()?.segment.completeness, 'CLOSED');
  assert.throws(() => store.close(a, 22), /boundary/);
  store.dispose();
  assert.equal(store.getStats().retainedSegments, 0);
});
test('068 reference separates actual WORLD visibility/native token from offscreen taxi FLEET membership', () => {
  assert.equal(referenceSelectionAdmission(a, a, 'WORLD', 'CIVIL', true, true), true);
  assert.equal(referenceSelectionAdmission(a, a, 'WORLD', 'TAXI', false, true), false);
  assert.equal(referenceSelectionAdmission(a, a, 'WORLD', 'TAXI', true, false), false);
  assert.equal(referenceSelectionAdmission(a, a, 'FLEET', 'TAXI', false, false), true);
  assert.equal(referenceSelectionAdmission(a, a, 'FLEET', 'CIVIL', true, true), false);
  assert.equal(referenceSelectionAdmission(a, { ...a }, 'WORLD', 'TAXI', true, true), false);
});

test('068 reference cleanup attempts every acquired release once despite dispose/readback errors', () => {
  const scope = createReferenceResourceScope();
  const calls: string[] = [];
  scope.own(
    'world',
    () => {
      calls.push('world');
    },
    () => ({ entities: 0 }),
  );
  scope.own(
    'owner',
    () => {
      calls.push('owner');
      throw Error('dispose failed');
    },
    () => {
      throw Error('unavailable readback');
    },
  );
  const cleanup = scope.close();
  assert.deepEqual(calls, ['owner', 'world']);
  assert.equal(cleanup.errors.length, 2);
  assert.equal(cleanup.snapshots.owner, null);
  assert.deepEqual(cleanup.snapshots.world, { entities: 0 });
  assert.throws(() => scope.close(), /already closed/);
  assert.deepEqual(calls, ['owner', 'world']);
});
