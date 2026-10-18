import test from 'node:test';
import assert from 'node:assert/strict';
import { warmObservation } from './warm-observation';
test('first warm gap remains actual before acceptance and never invents completed native steps', () => {
  const d = warmObservation();
  d.wait({
    phase: 'WARM',
    requestStartedAt: 1000,
    previousStamp: 990,
    counterBefore: { nativeSerial: 0, controllerTick: 0 },
  });
  d.returned({
    returnedStamp: 1390,
    callbackObservedAt: 1400,
    gapMs: 400,
    counterAfter: { nativeSerial: 0, controllerTick: 0 },
  });
  const s = d.snapshot();
  assert.equal(s.wait?.gapMs, 400);
  assert.equal(s.wait?.counterAfter?.nativeSerial, 0);
  assert.deepEqual(s.completed, []);
  assert.equal(s.acceptance, false);
});
test('four prior completed warm frames are bounded and cannot alias capture inputs/exports', () => {
  const d = warmObservation();
  for (let n = 1; n <= 6; n++)
    d.completed({
      stampMs: n * 10,
      readStartedAt: n * 10 + 1,
      readEndedAt: n * 10 + 3,
      counter: { nativeSerial: n, controllerTick: n },
      frameWorkMs: 2,
      renderWorkMs: 1,
    });
  const s = d.snapshot();
  assert.deepEqual(
    s.completed.map((v) => v.stampMs),
    [30, 40, 50, 60],
  );
  s.completed[0]!.counter.nativeSerial = 99;
  assert.equal(d.snapshot().completed[0]!.counter.nativeSerial, 3);
});
test('a returned warm callback cannot manufacture missing actual request origin', () => {
  assert.throws(
    () =>
      warmObservation().returned({
        returnedStamp: 1,
        callbackObservedAt: 2,
        gapMs: 1,
        counterAfter: { nativeSerial: 0, controllerTick: 0 },
      }),
    /without owned wait/,
  );
});
