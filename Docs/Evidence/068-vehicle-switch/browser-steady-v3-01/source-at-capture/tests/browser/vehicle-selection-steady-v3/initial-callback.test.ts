import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedRaf, windowRafPorts } from './initial-callback';
test('bounded actual followup timeout cancels only its own RAF exactly once', async () => {
  let callback: ((stamp: number) => void) | null = null,
    timer: (() => void) | null = null,
    cancels = 0,
    timeouts = 0;
  const promise = boundedRaf(
    {
      request: (cb) => {
        callback = cb;
        return 7;
      },
      cancel: (id) => {
        assert.equal(id, 7);
        cancels++;
      },
      timer: (cb, ms) => {
        assert.equal(ms, 250);
        timer = cb;
        return 1;
      },
      clear: () => {},
    },
    () => {
      timeouts++;
    },
  );
  const rejected = assert.rejects(promise, /timeout/);
  timer!();
  callback!(100);
  timer!();
  await rejected;
  assert.equal(cancels, 1);
  assert.equal(timeouts, 1);
});

test('Window scheduling wrapper preserves strict native receivers for return and timeout paths', async () => {
  let raf: ((stamp: number) => void) | null = null,
    timeout: (() => void) | null = null,
    canceled = 0,
    cleared = 0;
  const target = {
    requestAnimationFrame(this: unknown, cb: (stamp: number) => void) {
      assert.equal(this, target);
      raf = cb;
      return 8;
    },
    cancelAnimationFrame(this: unknown, id: number) {
      assert.equal(this, target);
      assert.equal(id, 8);
      canceled++;
    },
    setTimeout(this: unknown, cb: () => void, ms: number) {
      assert.equal(this, target);
      assert.equal(ms, 250);
      timeout = cb;
      return 9;
    },
    clearTimeout(this: unknown, id: number) {
      assert.equal(this, target);
      assert.equal(id, 9);
      cleared++;
    },
  };
  const ports = windowRafPorts(
    target as unknown as Pick<
      Window,
      'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout'
    >,
  );
  const success = boundedRaf(ports, () => assert.fail('No false timeout'));
  raf!(120);
  assert.equal(await success, 120);
  assert.equal(cleared, 1);
  assert.equal(canceled, 0);
  const failure = boundedRaf(ports, () => {});
  const rejected = assert.rejects(failure, /timeout/);
  timeout!();
  await rejected;
  assert.equal(canceled, 1);
  assert.equal(cleared, 1);
});
