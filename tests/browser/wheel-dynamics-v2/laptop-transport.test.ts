import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkedJson } from './browser-ports';

test('slow export remains bounded and preserves an actionable own timeout diagnostic', async () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const savedFetch = globalThis.fetch;
  let timeout: (() => void) | undefined;
  let duration = 0;
  let cleared = false;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setTimeout(callback: () => void, ms: number) {
        timeout = callback;
        duration = ms;
        return 1;
      },
      clearTimeout() {
        cleared = true;
      },
    },
  });
  globalThis.fetch = async (_input, options) =>
    new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason));
    });
  try {
    const pending = checkedJson('/capture/parts', { operation: 'commit' });
    assert.ok(duration > 10000 && duration <= 60000);
    timeout!();
    await assert.rejects(pending, /Evidence request exceeded60s: \/capture\/parts/);
    assert.equal(cleared, true);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
