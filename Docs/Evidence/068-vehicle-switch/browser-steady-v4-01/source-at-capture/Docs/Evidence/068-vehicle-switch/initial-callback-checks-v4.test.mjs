import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInitialCallbacks } from './initial-callback-checks-v4.mjs';
const point = () => ({ nativeSerial: 0, controllerTick: 0 });
const row = (stamp, request, read) => ({
  requestStartedAt: request,
  previousStamp: 100,
  returnedStamp: stamp,
  callbackObservedAt: read,
  timeoutObservedAt: null,
  counterBefore: point(),
  counterAfter: point(),
  debtSecondsBefore: 0,
  activeRealSecondsBefore: 0,
  outcome: 'RETURNED',
});
const valid = () => ({
  rejectedCallback: null,
  initialRafProof: { stampMs: 100, callbackObservedAt: 104 },
  warmStarted: 100,
  warmFrames: 1800,
  frames: 7200,
  initialDuplicateCallbacks: 1,
  actualCallbackCount: 9002,
  initialWarmCallbacks: [row(100, 105, 106), row(116, 107, 117)],
});
test('actual initial repeated stamp and positive followup retained separately', () => {
  validateInitialCallbacks(valid());
});
test('second repeated callback cannot complete', () => {
  const v = valid();
  v.initialWarmCallbacks[1].returnedStamp = 100;
  assert.throws(() => validateInitialCallbacks(v));
});
test('regressing stamp cannot be relabelled duplicate', () => {
  const v = valid();
  v.initialWarmCallbacks[0].returnedStamp = 99;
  assert.throws(() => validateInitialCallbacks(v));
});
test('cumulative original-origin gap remains250ms', () => {
  const v = valid();
  v.initialWarmCallbacks[1] = row(351, 107, 352);
  assert.throws(() => validateInitialCallbacks(v));
});
test('followup delivery cannot reset or exceed bound', () => {
  const v = valid();
  v.initialWarmCallbacks[1] = row(116, 107, 358);
  assert.throws(() => validateInitialCallbacks(v));
});
test('forged native progress or old debt rejects initial allowance', () => {
  for (const field of ['counterAfter', 'debtSecondsBefore']) {
    const v = valid();
    if (field === 'counterAfter') v.initialWarmCallbacks[0][field].nativeSerial = 1;
    else v.initialWarmCallbacks[0][field] = 0.01;
    assert.throws(() => validateInitialCallbacks(v));
  }
});
test('omitted duplicate or callback count rejected', () => {
  for (const change of [(v) => v.initialWarmCallbacks.shift(), (v) => v.actualCallbackCount--]) {
    const v = valid();
    change(v);
    assert.throws(() => validateInitialCallbacks(v));
  }
});
test('origin shift, pending timeout and fabricated positive stamp rejected', () => {
  for (const change of [
    (v) => (v.warmStarted = 101),
    (v) => (v.initialWarmCallbacks[1].outcome = 'TIMEOUT'),
    (v) => (v.initialWarmCallbacks[0].returnedStamp = 100.01),
  ]) {
    const v = valid();
    change(v);
    assert.throws(() => validateInitialCallbacks(v));
  }
});
