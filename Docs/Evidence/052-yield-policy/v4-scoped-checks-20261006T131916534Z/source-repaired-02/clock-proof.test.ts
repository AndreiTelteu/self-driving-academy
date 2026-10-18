import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDualClock } from './clock-proof';
function fixture(previous = 60, span = 3000) {
  const frame = Array.from({length: 180}, () => span / 180);
  let time = 1000;
  const rafTime = frame.map(delta => time += delta);
  const controllerTick = Array.from({length: 180}, (_, i) => i + 61);
  const nativeSerial = controllerTick.map(tick => tick + 180);
  const proof = {
    phaseEntry: {timeMs: 1000, controllerTick: 60, nativeSerial: 240},
    phaseCompletion: {timeMs: 4000, controllerTick: 240, nativeSerial: 420},
    previousRaf: {timeMs: 1000, observedAtMs: 1000, controllerTick: previous, nativeSerial: previous + 180},
    nativePhaseRatio: 1,
    matchedRafRatio: (240 - previous) / 60 / (span / 1000),
  };
  return {proof, raw: {frame, rafTime, rafReadTime: rafTime.map(time => Math.max(time, proof.phaseCompletion.timeMs * (time === rafTime.at(-1) ? 1 : 0))), nativeSerial, controllerTick}};
}
test('actual warm overhang uses actual previous counter, not nominal 180 numerator', () => {
  const value = fixture(59, 3062);
  value.proof.phaseEntry.timeMs = 1020;
  value.proof.phaseCompletion.timeMs = 4050;
  value.proof.nativePhaseRatio = 3 / 3.030;
  value.raw.rafReadTime[0] = 1021;
  assert.equal(validateDualClock(value.proof, value.raw, 60, 180).rafTicks, 181);
  assert.throws(() => validateDualClock({...value.proof, matchedRafRatio: 3 / 3.062}, value.raw, 60, 180));
});
test('real tail stall still fails matched RAF even when native phase passes', () => {
  const value = fixture(60, 3000);
  value.raw.frame[179] += 100;
  value.raw.rafTime[179] += 100;
  value.raw.rafReadTime[179] += 100;
  value.proof.matchedRafRatio = 3 / 3.1;
  assert.throws(() => validateDualClock(value.proof, value.raw, 60, 180), /matched RAF simulation/);
});
test('slow native phase still fails with fast RAF', () => {
  const value = fixture();
  value.proof.phaseCompletion.timeMs = 4100;
  value.proof.nativePhaseRatio = 3 / 3.1;
  value.raw.rafReadTime[179] = 4100;
  assert.throws(() => validateDualClock(value.proof, value.raw, 60, 180), /native phase simulation/);
});
test('actual native/controller disagreement, hidden step, and >4 admission are rejected', () => {
  const value = fixture();
  assert.doesNotThrow(() => validateDualClock(value.proof, value.raw, 60, 180));
  const mismatch = {...value.raw, nativeSerial: [...value.raw.nativeSerial]};
  mismatch.nativeSerial[20]++;
  assert.throws(() => validateDualClock(value.proof, mismatch, 60, 180), /counter disagreement/);
  const jump = {...value.raw, controllerTick: [...value.raw.controllerTick], nativeSerial: [...value.raw.nativeSerial]};
  jump.controllerTick[0] = 65; jump.nativeSerial[0] = 245;
  assert.throws(() => validateDualClock(value.proof, jump, 60, 180), /max4/);
});
test('dropped tail, shortened raw channels, forged phase, and interpolated delta are rejected', () => {
  const value = fixture();
  const missing = Object.fromEntries(Object.entries(value.raw).map(([key, rows]) => [key, rows.slice(0,-1)])) as typeof value.raw;
  assert.throws(() => validateDualClock(value.proof, missing, 60, 180), /final RAF/);
  assert.throws(() => validateDualClock(value.proof, {...value.raw, rafTime: value.raw.rafTime.slice(1)}, 60, 180), /channels/);
  assert.throws(() => validateDualClock({...value.proof, phaseCompletion: {...value.proof.phaseCompletion, controllerTick: 239, nativeSerial: 419}}, value.raw, 60, 180), /phase boundaries/);
  const changed = {...value.raw, frame: [...value.raw.frame]}; changed.frame[0] = 5;
  assert.throws(() => validateDualClock(value.proof, changed, 60, 180), /untrimmed/);
});
test('shifted phase clocks and impossible callback chronology cannot keep plausible ratios', () => {
  const value = fixture();
  for (const shift of [-500, 100000]) assert.throws(() => validateDualClock({...value.proof,
    phaseEntry: {...value.proof.phaseEntry, timeMs: value.proof.phaseEntry.timeMs + shift},
    phaseCompletion: {...value.proof.phaseCompletion, timeMs: value.proof.phaseCompletion.timeMs + shift},
  }, value.raw, 60, 180), /chronology/);
  const backwards = {...value.raw, rafReadTime: [...value.raw.rafReadTime]};
  backwards.rafReadTime[20] = backwards.rafReadTime[19] - 1;
  assert.throws(() => validateDualClock(value.proof, backwards, 60, 180));
  const beforeEntry = {...value.raw, rafReadTime: [...value.raw.rafReadTime]};
  beforeEntry.rafReadTime[0] = 900;
  assert.throws(() => validateDualClock(value.proof, beforeEntry, 60, 180));
});
