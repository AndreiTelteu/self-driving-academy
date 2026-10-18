import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApplicationLifecycle } from '../../src/app/application-lifecycle';
import {
  createRendererRecovery,
  ownRecoverySnapshot,
  type RecoveryRenderer,
} from '../../src/app/renderer-recovery';
function fixture() {
  let world = { tick: 17, body: { x: 2, z: 9 } },
    paused = false,
    created = 0,
    released = 0,
    live = 0,
    maxLive = 0,
    failures = 0;
  let loss: (reason: unknown) => void = () => {};
  let resizeFail = false;
  const states: string[] = [];
  const recovery = createRendererRecovery({
    captureSnapshot: () => world,
    suspendSimulation: () => {
      paused = true;
    },
    createRenderer: async (snapshot, _preference, onLost) => {
      assert(paused);
      assert(Object.isFrozen(snapshot.body));
      assert.equal(snapshot.tick, 17);
      if (failures-- > 0) throw new Error('Injected creation failure');
      created++;
      live++;
      maxLive = Math.max(maxLive, live);
      loss = onLost;
      let disposed = false;
      return {
        rendererKind: 'fixture',
        render() {},
        resize() {
          if (resizeFail) {
            resizeFail = false;
            throw new Error('resize failure');
          }
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          live--;
          released++;
        },
      };
    },
    show: (state) => states.push(state.kind),
  });
  return {
    recovery,
    states,
    get world() {
      return world;
    },
    set world(value) {
      world = value;
    },
    get paused() {
      return paused;
    },
    get loss() {
      return loss;
    },
    get metrics() {
      return { created, released, live, maxLive };
    },
    fail(count: number) {
      failures = count;
    },
    badResize() {
      resizeFail = true;
    },
  };
}
test('loss captures the same authoritative tick/body after suspension, retries preserve immutable RAM', async () => {
  const f = fixture();
  await f.recovery.start('WEBGL2');
  f.fail(2);
  f.loss('simulated GPU loss');
  await f.recovery.retry();
  assert.equal(f.recovery.getState().kind, 'ERROR');
  const checkpoint = f.recovery.getSnapshot()!;
  assert.deepEqual(checkpoint, { tick: 17, body: { x: 2, z: 9 } });
  assert(f.paused);
  f.world.body.x = 99;
  await f.recovery.retry();
  assert.equal(f.recovery.getState().kind, 'ERROR');
  assert.equal(f.recovery.getSnapshot(), checkpoint);
  await f.recovery.retry();
  assert.equal(f.recovery.getState().kind, 'READY');
  assert.equal(f.recovery.getSnapshot(), checkpoint);
  assert.equal(f.metrics.maxLive, 1);
  assert.equal(checkpoint.body.x, 2);
  f.recovery.dispose();
  assert.equal(f.metrics.live, 0);
  assert.equal(f.recovery.getSnapshot(), null);
});
test('twenty reload/resize cycles plateau, coalescing and old loss callback cannot recreate a session', async () => {
  const f = fixture();
  await f.recovery.start();
  await f.recovery.retry();
  assert.equal(f.metrics.created, 1, 'READY retry cannot restore an obsolete checkpoint');
  const oldLoss = f.loss;
  for (let i = 0; i < 20; i++) {
    f.recovery.resize();
    await f.recovery.recover('simulated');
  }
  assert.deepEqual(f.metrics, { created: 21, released: 20, live: 1, maxLive: 1 });
  oldLoss('late old generation');
  await Promise.resolve();
  assert.equal(f.metrics.created, 21);
  f.recovery.dispose();
  f.recovery.dispose();
  assert.equal(f.metrics.released, 21);
});
test('failure in resize reconstructs once; invalid capture disables stale checkpoint retry', async () => {
  const f = fixture();
  await f.recovery.start();
  f.badResize();
  f.recovery.resize();
  await f.recovery.retry();
  assert.equal(f.metrics.created, 2);
  f.world = { tick: NaN, body: { x: 0, z: 0 } };
  await f.recovery.recover();
  assert.equal(f.recovery.getState().kind, 'ERROR');
  assert.equal(f.recovery.getSnapshot(), null);
  await f.recovery.retry();
  assert.equal(f.recovery.getState().kind, 'ERROR');
  const errorState = f.recovery.getState();
  assert(errorState.kind === 'ERROR' && !errorState.retryAvailable);
  f.recovery.dispose();
});
test('disposal during pending construction releases late candidate; no renderer resurrection', async () => {
  let resolve!: (value: RecoveryRenderer) => void,
    disposed = 0;
  const recovery = createRendererRecovery({
    captureSnapshot: () => ({ tick: 0 }),
    suspendSimulation() {},
    show() {},
    createRenderer: () =>
      new Promise<RecoveryRenderer>((yes) => {
        resolve = yes;
      }),
  });
  const first = recovery.start(),
    same = recovery.recover();
  assert.equal(first, same);
  await Promise.resolve();
  recovery.dispose();
  resolve({
    rendererKind: 'fixture',
    render() {
      throw new Error('late render');
    },
    resize() {},
    dispose() {
      disposed++;
    },
  });
  await first;
  assert.equal(disposed, 1);
  assert.equal(recovery.getState().kind, 'DISPOSED');
  assert.equal(recovery.getRenderer(), undefined);
  assert.equal(recovery.getSnapshot(), null);
});
test('GPU loss while factory is pending becomes retryable ERROR and candidate disposed', async () => {
  let disposed = 0;
  const recovery = createRendererRecovery({
    captureSnapshot: () => ({ tick: 5 }),
    suspendSimulation() {},
    show() {},
    createRenderer: async (_snapshot, _preference, onLost) => {
      onLost(new Error('lost during load'));
      return {
        rendererKind: 'fixture',
        render() {},
        resize() {},
        dispose() {
          disposed++;
        },
      };
    },
  });
  await recovery.start();
  assert.equal(recovery.getState().kind, 'ERROR');
  assert.equal(disposed, 1);
  assert.equal(recovery.getSnapshot()!.tick, 5);
  recovery.dispose();
});
test('RAM capture rejects accessors, nonfinite, cycles, sparse arrays and capacity without reading getters', () => {
  let reads = 0;
  assert.throws(() =>
    ownRecoverySnapshot({
      get body() {
        reads++;
        return 1;
      },
    }),
  );
  assert.equal(reads, 0);
  assert.throws(() => ownRecoverySnapshot({ tick: Infinity }));
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.throws(() => ownRecoverySnapshot(cycle));
  assert.throws(() => ownRecoverySnapshot([, 1]));
  const sparseWithExtra = [, 1];
  Object.assign(sparseWithExtra, { extra: 2 });
  assert.throws(() => ownRecoverySnapshot(sparseWithExtra));
  assert.throws(() => ownRecoverySnapshot({ payload: 'x'.repeat(100) }, 100, 64));
  assert.throws(() => ownRecoverySnapshot({ a: { b: 1 } }, 2));
  const source = { tick: 10, items: [{ x: 2 }] },
    owned = ownRecoverySnapshot(source);
  source.items[0].x = 9;
  assert.equal(owned.items[0].x, 2);
  assert(Object.isFrozen(owned.items[0]));
});

test('application keeps its simulation, tick, RAF and subscriptions across renderer failure/retry', async () => {
  let now = 0,
    worldTick = 417,
    simulationCreates = 0,
    subscriptions = 0,
    failure = false;
  let loss: (reason: unknown) => void = () => {};
  let callback: (() => void) | undefined;
  const recovery = createRendererRecovery({
    captureSnapshot: (): { tick: number; body: { x: number } } => ({
      tick: application.getSimulationState()?.tick ?? worldTick,
      body: { x: 9 },
    }),
    suspendSimulation: () => application.pause(),
    show() {},
    createRenderer: async (checkpoint, _preference, onLost) => {
      assert.equal(checkpoint.body.x, 9);
      loss = onLost;
      if (failure) throw new Error('renderer unavailable');
      return { rendererKind: 'fixture', render() {}, resize() {}, dispose() {} };
    },
  });
  const subscribe = () => {
    subscriptions++;
    return () => {
      subscriptions--;
    };
  };
  const application = createApplicationLifecycle({
    createBackend: async (): Promise<RecoveryRenderer> => {
      await recovery.start();
      return {
        rendererKind: 'fixture',
        render: recovery.render,
        resize: recovery.resize,
        dispose: recovery.dispose,
      };
    },
    createSimulation: () => {
      simulationCreates++;
      return {
        initialTick: 417,
        captureSnapshot: () => ({ tick: worldTick }),
        step: ({ tick }: { tick: number }) => {
          worldTick = tick;
        },
        interpolate: (_previous: unknown, current: { tick: number }) => current,
      };
    },
    show() {},
    now: () => now,
    scheduleFrame: (next) => {
      callback = next;
      return 1;
    },
    cancelFrame: () => {
      callback = undefined;
    },
    subscribeResize: subscribe,
    subscribeVisibility: subscribe,
    isHidden: () => false,
  });
  await application.load();
  application.play();
  now = 50;
  callback!();
  const tick = application.getSimulationState()!.tick;
  assert.equal(tick, 420);
  failure = true;
  loss('device lost');
  await recovery.retry();
  assert.equal(application.getState().kind, 'PAUSED');
  now = 500;
  callback!();
  assert.equal(application.getSimulationState()!.tick, tick);
  assert.equal(recovery.getSnapshot()!.tick, tick);
  failure = false;
  await recovery.retry();
  assert.equal(application.getSimulationState()!.tick, tick);
  assert.equal(simulationCreates, 1);
  assert.equal(subscriptions, 2);
  application.play();
  now += 1000 / 60;
  callback!();
  assert.equal(application.getSimulationState()!.tick, tick + 1);
  application.dispose();
  assert.equal(subscriptions, 0);
  assert.equal(callback, undefined);
  assert.equal(recovery.getSnapshot(), null);
});
