import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRenderingLifecycle,
  type RenderingState,
  type RenderSession,
} from '../../src/app/rendering-lifecycle';

test('error then retry, one frame/resize subscription, idempotent disposal', async () => {
  const states: RenderingState[] = [];
  let attempts = 0;
  let disposals = 0;
  let listeners = 0;
  let cancels = 0;
  let renders = 0;
  const lifecycle = createRenderingLifecycle({
    createBackend: async () => {
      if (++attempts === 1) throw new Error('both failed');
      return {
        rendererKind: 'WEBGL2',
        render: () => {
          renders++;
        },
        resize: () => {},
        dispose: () => {
          disposals++;
        },
      };
    },
    show: (state) => {
      states.push(state);
    },
    scheduleFrame: () => 1,
    cancelFrame: () => {
      cancels++;
    },
    subscribeResize: () => {
      listeners++;
      return () => {
        listeners--;
      };
    },
  });
  await lifecycle.start();
  assert.equal(states.at(-1)?.kind, 'ERROR');
  await lifecycle.start();
  assert.equal(states.at(-1)?.kind, 'READY');
  assert.equal(listeners, 1);
  assert.equal(renders, 1);
  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(listeners, 0);
  assert.equal(disposals, 1);
  assert.equal(cancels, 1);
});
test('concurrent retry is coalesced; dispose during pending initialization releases late backend', async () => {
  let resolve!: (backend: RenderSession) => void;
  let disposals = 0;
  let attempts = 0;
  let scheduled = 0;
  const lifecycle = createRenderingLifecycle({
    createBackend: () => {
      attempts++;
      return new Promise<RenderSession>((done) => {
        resolve = done;
      });
    },
    show: () => {},
    scheduleFrame: () => {
      scheduled++;
      return 1;
    },
    cancelFrame: () => {},
    subscribeResize: () => () => {},
  });
  const first = lifecycle.start();
  assert.equal(lifecycle.start(), first);
  lifecycle.dispose();
  await Promise.resolve();
  resolve({
    rendererKind: 'WEBGPU',
    render: () => {},
    resize: () => {},
    dispose: () => {
      disposals++;
    },
  });
  await first;
  assert.equal(attempts, 1);
  assert.equal(disposals, 1);
  assert.equal(scheduled, 0);
});
test('render failure stops loop, cleans resources and exposes retry', async () => {
  let callback!: () => void;
  let renders = 0;
  let disposals = 0;
  const states: RenderingState[] = [];
  const lifecycle = createRenderingLifecycle({
    createBackend: async () => ({
      rendererKind: 'WEBGPU',
      render: () => {
        if (++renders > 1) throw new Error('render');
      },
      resize: () => {},
      dispose: () => {
        disposals++;
      },
    }),
    show: (state) => {
      states.push(state);
    },
    scheduleFrame: (next) => {
      callback = next;
      return 1;
    },
    cancelFrame: () => {},
    subscribeResize: () => () => {},
  });
  await lifecycle.start();
  callback();
  assert.equal(states.at(-1)?.kind, 'ERROR');
  assert.equal(disposals, 1);
});

test('cleanup failures clear every owner and still permit retry', async () => {
  let callback!: () => void;
  let attempts = 0;
  let disposals = 0;
  let unsubscribes = 0;
  const states: RenderingState[] = [];
  const lifecycle = createRenderingLifecycle({
    createBackend: async () => {
      const attempt = ++attempts;
      let renders = 0;
      return {
        rendererKind: 'WEBGL2',
        render: () => {
          if (attempt === 1 && ++renders > 1) throw new Error('render failed');
        },
        resize: () => {},
        dispose: () => {
          disposals++;
          if (attempt === 1) throw new Error('dispose failed');
        },
      };
    },
    show: (state) => {
      states.push(state);
    },
    scheduleFrame: (next) => {
      callback = next;
      return 1;
    },
    cancelFrame: () => {
      throw new Error('cancel failed');
    },
    subscribeResize: () => () => {
      unsubscribes++;
      throw new Error('unsubscribe failed');
    },
  });
  await lifecycle.start();
  callback();
  assert.equal(states.at(-1)?.kind, 'ERROR');
  assert.equal(disposals, 1);
  assert.equal(unsubscribes, 1);
  await lifecycle.start();
  assert.equal(states.at(-1)?.kind, 'READY');
  assert.equal(attempts, 2);
  assert.throws(() => lifecycle.dispose(), AggregateError);
  lifecycle.dispose();
  assert.equal(disposals, 2);
  assert.equal(unsubscribes, 2);
});

test('synchronous factory failure does not poison the pending retry promise', async () => {
  let attempts = 0;
  const states: RenderingState[] = [];
  const lifecycle = createRenderingLifecycle({
    createBackend: () => {
      attempts++;
      throw new Error('sync failure');
    },
    show: (state) => {
      states.push(state);
    },
    scheduleFrame: () => 1,
    cancelFrame: () => {},
    subscribeResize: () => () => {},
  });
  await lifecycle.start();
  await lifecycle.start();
  assert.equal(attempts, 2);
  assert.equal(states.at(-1)?.kind, 'ERROR');
});
