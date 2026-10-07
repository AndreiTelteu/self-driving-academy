import test from 'node:test';
import assert from 'node:assert/strict';
import { observeFunctionalCallbackDiagnostic } from './functional-callback-diagnostic';
import { functionalCaseFailure } from './case-failure';

test('hostile thrown accessors/converters are never invoked by case display; cause identity and ledger remain exact', () => {
  let calls = 0;
  const hostile = {
    get message() {
      calls++;
      throw Error('getter');
    },
    toString() {
      calls++;
      throw Error('coercion');
    },
    [Symbol.toPrimitive]() {
      calls++;
      throw Error('primitive');
    },
  };
  const ledger = { causes: ['original', 'cleanup'] };
  const failure = functionalCaseFailure(true, hostile, ledger);
  assert.equal(calls, 0);
  assert.equal(failure.cause, hostile);
  assert.equal(failure.causes, ledger);
  assert.equal(failure.hasPrimary, true);
  assert.match(failure.message, /non-primitive/);
  const actual = new Error('Functional RAF gap');
  assert.match(functionalCaseFailure(true, actual, ledger).message, /Functional RAF gap/);
});
test('explicit primary flag preserves undefined/null/falsy throws and distinguishes cleanup-only failure', () => {
  for (const cause of [undefined, null, false, 0, '']) {
    const failure = functionalCaseFailure(true, cause, []);
    assert.equal(failure.hasPrimary, true);
    assert(Object.hasOwn(failure, 'cause'));
    assert.equal(failure.cause, cause);
  }
  const cleanup = functionalCaseFailure(false, undefined, []);
  assert.equal(cleanup.hasPrimary, false);
  assert(!Object.hasOwn(cleanup, 'cause'));
  assert.match(cleanup.message, /cleanup\/readback/);
});

test('actual long callback is retained before unchanged 250ms guard with real counters and unknown cause', async () => {
  const times = [14153.5, 15151.9];
  let retained: Record<string, unknown> | undefined;
  const presentation = () => ({
    observedMs: 15152,
    focus: true,
    visibility: 'visible',
    stickyLost: false,
    contextLost: false,
    dpr: 1,
    css: [1920, 1080] as [number, number],
    internal: [1920, 1080] as [number, number],
  });
  const row = await observeFunctionalCallbackDiagnostic(
    {
      now: () => times.shift()!,
      nativeSerial: () => 181,
      next: async () => 15151.7,
      retain: (r) => {
        retained = r as Record<string, unknown>;
      },
      presentation,
    },
    'NO_POINT',
    14151.6,
    { startedMs: 14151.9, endedMs: 14153.2, completed: true, nativeBefore: 180, nativeAfter: 180 },
  );
  assert.equal(retained?.stamp, 15151.7);
  assert.equal(row.nativeBefore, row.nativeAfter);
  assert.throws(() => assert(row.stamp - 14151.6 <= 250));
  assert.equal((retained?.diagnostics as { schedulingCause: string }).schedulingCause, 'UNKNOWN');
});

test('first callback labels unknown prior draw and preserves sticky visibility/focus loss without synthesizing counters', async () => {
  let retained: Record<string, unknown> | undefined;
  await observeFunctionalCallbackDiagnostic(
    {
      now: () => 20,
      nativeSerial: () => 180,
      next: async () => 19,
      retain: (r) => {
        retained = r as Record<string, unknown>;
      },
      presentation: () => ({
        observedMs: 20,
        focus: false,
        visibility: 'hidden',
        stickyLost: true,
        contextLost: false,
        dpr: 1,
        css: [1920, 1080],
        internal: [1920, 1080],
      }),
    },
    'NO_POINT',
    null,
    null,
  );
  const diagnostic = retained?.diagnostics as {
    anchor: string;
    priorDraw: unknown;
    afterCallback: { stickyLost: boolean };
  };
  assert.equal(diagnostic.anchor, 'FIRST_CALLBACK');
  assert.equal(diagnostic.priorDraw, null);
  assert.equal(diagnostic.afterCallback.stickyLost, true);
  assert.equal(retained?.nativeBefore, 180);
  assert.equal(retained?.nativeAfter, 180);
});
