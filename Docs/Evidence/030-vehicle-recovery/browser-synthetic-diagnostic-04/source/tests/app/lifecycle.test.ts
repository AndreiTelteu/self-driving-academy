import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationLifecycle } from '../../src/app/application-lifecycle';

function fixture() {
  let now = 0;
  let tick = 0;
  let hidden = false;
  let visibility: (hidden: boolean) => void = () => {};
  let renders = 0;
  let disposals = 0;
  let listeners = 0;
  let failed = false;
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  const app = createApplicationLifecycle({
    createBackend: async () => ({
      rendererKind: 'WEBGL2',
      render: () => {
        if (failed) throw new Error('render fault');
        renders++;
      },
      resize: () => {},
      dispose: () => {
        disposals++;
      },
    }),
    createSimulation: () => {
      tick = 0;
      return {
        captureSnapshot: () => ({ tick }),
        step: (step) => {
          tick = step.tick;
        },
        interpolate: (_previous, current) => current,
      };
    },
    now: () => now,
    show: () => {},
    scheduleFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
    subscribeResize: () => {
      listeners++;
      return () => {
        listeners--;
      };
    },
    subscribeVisibility: (callback) => {
      visibility = callback;
      listeners++;
      return () => {
        visibility = () => {};
        listeners--;
      };
    },
    isHidden: () => hidden,
  });
  return {
    app,
    frame(time: number) {
      now = time;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback();
    },
    setNow(time: number) {
      now = time;
    },
    hide(value: boolean) {
      hidden = value;
      visibility(value);
    },
    fail() {
      failed = true;
    },
    read: () => ({ tick, renders, disposals, listeners, frames: frames.size }),
  };
}

test('ready and manual pause render without advancing ticks; resume excludes paused time', async () => {
  const f = fixture();
  await f.app.load();
  f.frame(1000);
  assert.equal(f.read().tick, 0);
  f.app.play();
  f.frame(1020);
  assert.equal(f.read().tick, 1);
  f.app.pause();
  const paused = f.read();
  f.frame(10000);
  assert.equal(f.read().tick, paused.tick);
  assert.ok(f.read().renders > paused.renders);
  f.app.play();
  f.frame(10020);
  assert.equal(f.read().tick, 2);
  assert.equal(f.app.getState().kind, 'PLAYING');
  f.app.dispose();
});

test('visibility resumes only background pause; overload requires explicit recovery', async () => {
  const f = fixture();
  await f.app.load();
  f.app.play();
  f.frame(20);
  f.hide(true);
  assert.deepEqual(f.app.getState(), {
    kind: 'PAUSED',
    rendererKind: 'WEBGL2',
    reason: 'background',
  });
  f.setNow(1000);
  f.hide(false);
  f.frame(1020);
  assert.equal(f.read().tick, 2);
  f.app.pause();
  f.hide(true);
  f.hide(false);
  assert.equal(f.app.getState().kind, 'PAUSED');
  f.app.play();
  f.frame(2000);
  assert.deepEqual(f.app.getState(), {
    kind: 'PAUSED',
    rendererKind: 'WEBGL2',
    reason: 'overload',
  });
  const tick = f.read().tick;
  f.frame(3000);
  assert.equal(f.read().tick, tick);
  f.app.play();
  f.frame(3000);
  assert.equal(f.read().tick, tick + 4);
  f.app.dispose();
});

test('reload coalesces requests and never duplicates frames/listeners; errors and disposal release owners', async () => {
  const f = fixture();
  const first = f.app.load();
  assert.equal(f.app.load(), first);
  await first;
  assert.equal(f.read().frames, 1);
  assert.equal(f.read().listeners, 2);
  await f.app.load();
  assert.equal(f.read().frames, 1);
  assert.equal(f.read().listeners, 2);
  assert.equal(f.read().disposals, 1);
  f.fail();
  f.frame(20);
  assert.equal(f.app.getState().kind, 'ERROR');
  assert.equal(f.read().listeners, 0);
  assert.equal(f.read().frames, 0);
  f.app.dispose();
  f.app.dispose();
  assert.equal(f.app.getState().kind, 'DISPOSED');
  assert.equal(f.read().disposals, 2);
});

test('disposal during loading releases a late backend and never installs subscriptions', async () => {
  let resolve!: (backend: {
    rendererKind: string;
    render(): void;
    resize(): void;
    dispose(): void;
  }) => void;
  let disposed = 0;
  const f = createApplicationLifecycle({
    createBackend: () =>
      new Promise((done) => {
        resolve = done;
      }),
    createSimulation: () => ({
      captureSnapshot: () => ({}),
      step: () => {},
      interpolate: () => ({}),
    }),
    show: () => {},
    now: () => 0,
    isHidden: () => false,
    scheduleFrame: () => {
      throw new Error('unexpected frame');
    },
    cancelFrame: () => {},
    subscribeResize: () => {
      throw new Error('unexpected listener');
    },
    subscribeVisibility: () => {
      throw new Error('unexpected listener');
    },
  });
  const loading = f.load();
  await Promise.resolve();
  f.dispose();
  resolve({
    rendererKind: 'WEBGL2',
    render: () => {},
    resize: () => {},
    dispose: () => {
      disposed++;
    },
  });
  await loading;
  assert.equal(disposed, 1);
  assert.equal(f.getState().kind, 'DISPOSED');
});

test('initially hidden ready cannot start until foreground', async () => {
  const f = fixture();
  f.hide(true);
  await f.app.load();
  f.app.play();
  f.frame(1000);
  assert.equal(f.app.getState().kind, 'READY');
  assert.equal(f.read().tick, 0);
  f.hide(false);
  f.app.play();
  f.frame(1020);
  assert.equal(f.read().tick, 1);
  f.app.dispose();
});

test('projection is frozen, presentation faults terminate, cleanup attempts every owner', async () => {
  let callback = () => {};
  let disposals = 0;
  let unsubscribes = 0;
  let now = 0;
  const app = createApplicationLifecycle({
    createBackend: async () => ({
      rendererKind: 'WEBGL2',
      render: () => {},
      resize: () => {},
      dispose: () => {
        disposals++;
        throw new Error('cleanup backend');
      },
    }),
    createSimulation: () => ({
      captureSnapshot: () => ({ value: 0 }),
      step: () => {},
      interpolate: (_previous, current) => current,
    }),
    present: (frame) => {
      assert.ok(Object.isFrozen(frame.interpolated));
      throw new Error('projection fault');
    },
    show: () => {},
    now: () => now,
    isHidden: () => false,
    scheduleFrame: (next) => {
      callback = next;
      return 1;
    },
    cancelFrame: () => {
      throw new Error('cleanup frame');
    },
    subscribeResize: () => () => {
      unsubscribes++;
      throw new Error('cleanup resize');
    },
    subscribeVisibility: () => () => {
      unsubscribes++;
      throw new Error('cleanup visibility');
    },
  });
  await app.load();
  app.play();
  now = 20;
  callback();
  assert.deepEqual(app.getState(), { kind: 'ERROR', message: 'projection fault' });
  assert.equal(disposals, 1);
  assert.equal(unsubscribes, 2);
  app.dispose();
});

test('fixed-step faults and synchronous loader errors expose ERROR without retrying a step', async () => {
  let callback = () => {};
  let steps = 0;
  let attempts = 0;
  let now = 0;
  const app = createApplicationLifecycle({
    createBackend: () => {
      if (++attempts === 1) throw new Error('loader failure');
      return Promise.resolve({
        rendererKind: 'WEBGL2',
        render: () => {},
        resize: () => {},
        dispose: () => {},
      });
    },
    createSimulation: () => ({
      captureSnapshot: () => ({}),
      step: () => {
        steps++;
        throw new Error('step fault');
      },
      interpolate: () => ({}),
    }),
    show: () => {},
    now: () => now,
    isHidden: () => false,
    scheduleFrame: (next) => {
      callback = next;
      return 1;
    },
    cancelFrame: () => {},
    subscribeResize: () => () => {},
    subscribeVisibility: () => () => {},
  });
  await app.load();
  assert.equal(app.getState().kind, 'ERROR');
  await app.load();
  app.play();
  now = 20;
  callback();
  callback();
  assert.deepEqual(app.getState(), { kind: 'ERROR', message: 'step fault' });
  assert.equal(steps, 1);
  app.dispose();
});
