// SOURCE16 pure adverse drafts. Not executed; no native/browser dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeDiagnostic } from './safe-diagnostic.mjs';

test('own string data only; hostile accessors, converters and proxy traps never escape', () => {
  let calls = 0;
  const hostile = {};
  for (const key of [
    'message',
    'toJSON',
    'toString',
    'valueOf',
    Symbol.toPrimitive,
    Symbol.iterator,
  ])
    Object.defineProperty(hostile, key, {
      get() {
        calls++;
        throw new Error('getter');
      },
    });
  const proxy = new Proxy(
    {},
    {
      get() {
        calls++;
        throw new Error('get');
      },
      getOwnPropertyDescriptor() {
        throw new Error('descriptor');
      },
    },
  );
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [Object.create(null), hostile, proxy, revoked.proxy, Symbol('x'), 1n])
    assert.deepEqual(safeDiagnostic(value), { text: 'UNKNOWN', omittedCodeUnits: 0 });
  assert.equal(calls, 0);
  assert.deepEqual(safeDiagnostic(new Error('actual message')), {
    text: 'actual message',
    omittedCodeUnits: 0,
  });
  assert.equal(safeDiagnostic(Object.create({ message: 'inherited' })).text, 'UNKNOWN');
  assert.equal(safeDiagnostic({ message: hostile }).text, 'UNKNOWN');
});

test('primitive text and own message caps retain exact omitted UTF16 counts and JSON safety', () => {
  for (const [value, text] of [
    [undefined, 'undefined'],
    [null, 'null'],
    [false, 'false'],
    [0, '0'],
  ])
    assert.equal(safeDiagnostic(value).text, text);
  for (const value of ['x'.repeat(4096), { message: 'x'.repeat(4096) }]) {
    const diagnostic = safeDiagnostic(value);
    assert.equal(diagnostic.text.length, 1024);
    assert.equal(diagnostic.omittedCodeUnits, 3072);
    assert.deepEqual(JSON.parse(JSON.stringify(diagnostic)), diagnostic);
  }
  assert.equal(safeDiagnostic('x'.repeat(4096), Infinity).text.length, 1024);
  assert.equal(safeDiagnostic('x'.repeat(4096), 4096).text.length, 1024);
  assert.equal(safeDiagnostic('x'.repeat(256), 128).omittedCodeUnits, 128);
});
