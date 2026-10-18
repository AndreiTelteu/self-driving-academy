import assert from 'node:assert/strict';
import test from 'node:test';
import { armDiagnostics } from './diagnostics';
test('warm RAF trigger retained before guard/reset without measured raw reconstruction', () => {
  const d = armDiagnostics();
  d.wait({
    tick: 6,
    waitStartMs: 100,
    targetMs: 110,
    counterBefore: { nativeSerial: 186, controllerTick: 6 },
    previousRaf: null,
    recoveryStepsBeforeReset: 4,
  });
  d.returned({
    stampMs: 400,
    callbackReadMs: 401,
    counterAfter: { nativeSerial: 186, controllerTick: 6 },
    guardReadMs: 402,
    debtMs: 292,
  });
  const s = d.snapshot();
  assert.equal(s.rafAttempt?.debtMs, 292);
  assert.equal(s.rafAttempt?.recoveryStepsBeforeReset, 4);
  assert.equal(s.performanceAcceptance, false);
  assert.ok(!('raw' in s));
});
test('native cost ring includes warmup and caps four without aliasing', () => {
  const d = armDiagnostics();
  for (let tick = 1; tick <= 6; tick++)
    d.nativeCost({ tick, tickMs: tick, stepMs: 1, policyMs: 0 });
  const s = d.snapshot();
  assert.deepEqual(
    s.nativeCosts.map((v) => v.tick),
    [3, 4, 5, 6],
  );
  s.nativeCosts[0].tick = 99;
  assert.equal(d.snapshot().nativeCosts[0].tick, 3);
});
test('setup serial is actual without fabricated driving offset and before-native debt retained', () => {
  const d = armDiagnostics();
  d.beforeNative({
    stage: 'SETUP',
    tick: 0,
    nowMs: 1,
    targetMs: null,
    debtMs: null,
    counter: { nativeSerial: 17, controllerTick: null },
  });
  assert.equal(d.snapshot().beforeNative?.counter.nativeSerial, 17);
  assert.equal(d.snapshot().beforeNative?.counter.controllerTick, null);
  d.beforeNative({
    stage: 'DRIVING',
    tick: 7,
    nowMs: 500,
    targetMs: 120,
    debtMs: 380,
    counter: { nativeSerial: 186, controllerTick: 6 },
  });
  assert.equal(d.snapshot().beforeNative?.debtMs, 380);
});
test('failed later render cannot replace last completed presentation', () => {
  const d = armDiagnostics();
  d.presented({
    tick: 2,
    startMs: 10,
    renderStartMs: 11,
    renderFinishMs: 12,
    finishMs: 13,
    pendingNativeMs: 4,
    mainMs: 6,
  });
  d.wait({
    tick: 6,
    waitStartMs: 20,
    targetMs: 22,
    counterBefore: { nativeSerial: 186, controllerTick: 6 },
    previousRaf: null,
    recoveryStepsBeforeReset: 4,
  });
  assert.equal(d.snapshot().presentation?.tick, 2);
  assert.equal(d.snapshot().rafAttempt?.tick, 6);
});
test('RAF return cannot silently invent an absent wait origin', () => {
  assert.throws(() => armDiagnostics().returned({ stampMs: 400 }), /without wait/);
});
