import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFixedTickLoop,
  FIXED_DT_SECONDS,
  FIXED_TICK_HZ,
  MAX_STEPS_PER_FRAME,
  OVERLOAD_DEBT_MS,
} from '../../src/simulation/index.ts';

const dtMs = 1000 / FIXED_TICK_HZ;
function fixture(initialTick = 0) {
  const mutable = { position: 0, nested: { values: [0] } };
  const commands: number[] = [];
  const stepDurations: number[] = [];
  const loop = createFixedTickLoop({
    initialTick,
    captureSnapshot: () => mutable,
    step: ({ tick, dtSeconds }) => {
      commands.push(tick);
      stepDurations.push(dtSeconds);
      // A scripted tick-addressed command fixture; this is not vehicle physics or gameplay.
      mutable.position += tick % 3 === 0 ? -2 : 1;
      mutable.nested.values[0] = tick;
    },
    interpolate: (previous, current, alpha) => ({
      position: previous.position + (current.position - previous.position) * alpha,
    }),
  });
  return { loop, mutable, commands, stepDurations };
}

test('30/60 frame schedules preserve tick-addressed commands and duration over ten simulated minutes', () => {
  const run = (fps: number) => {
    const simulation = fixture();
    assert.equal(simulation.loop.frame(0).steps, 0);
    for (let frame = 1; frame <= fps * 600; frame += 1) {
      const result = simulation.loop.frame((frame * 1000) / fps);
      assert.ok(result.steps <= MAX_STEPS_PER_FRAME);
      assert.equal(result.state.status, 'running');
    }
    return simulation;
  };
  const thirty = run(30);
  const sixty = run(60);
  assert.deepEqual(thirty.commands, sixty.commands);
  assert.equal(sixty.commands.length, 36000);
  assert.deepEqual(thirty.mutable, sixty.mutable);
  for (const simulation of [thirty, sixty]) {
    const state = simulation.loop.getState();
    assert.equal(state.tick, 36000);
    assert.equal(state.simulatedSeconds, 600);
    assert.equal(state.activeRealSeconds, 600);
    assert.ok(state.debtSeconds < 1e-8);
    assert.ok(simulation.stepDurations.every((dt) => dt === FIXED_DT_SECONDS));
  }
});

test('first frame anchors time; fractional boundaries produce previous/current interpolation', () => {
  const { loop } = fixture();
  assert.equal(loop.frame(1000).steps, 0);
  assert.equal(loop.frame(1000 + dtMs - 0.000001).steps, 0);
  assert.equal(loop.frame(1000 + dtMs).steps, 1);
  const halfway = loop.frame(1000 + dtMs * 1.5);
  assert.equal(halfway.steps, 0);
  assert.ok(Math.abs(halfway.state.alpha - 0.5) < 1e-10);
  assert.ok(Math.abs((halfway.interpolated?.position ?? -1) - 0.5) < 1e-10);
  assert.equal(halfway.state.snapshots?.previous.position, 0);
  assert.equal(halfway.state.snapshots?.current.position, 1);
});

test('catchup executes at most four constant steps and retains the rest of debt', () => {
  const { loop, stepDurations } = fixture();
  loop.frame(0);
  const catchup = loop.frame(200);
  assert.equal(catchup.steps, 4);
  assert.equal(catchup.state.tick, 4);
  assert.ok(Math.abs(catchup.state.debtSeconds - (0.2 - 4 / 60)) < 1e-10);
  assert.equal(catchup.state.alpha, 1);
  assert.equal(loop.frame(200).steps, 4);
  assert.equal(loop.frame(200).steps, 4);
  assert.equal(loop.getState().tick, 12);
  assert.ok(loop.getState().debtSeconds < 1e-10);
  assert.ok(stepDurations.every((dt) => dt === FIXED_DT_SECONDS));
});

test('overload pauses before steps; explicit recovery drains preserved debt without new wall time', () => {
  const { loop, commands } = fixture();
  loop.frame(0);
  const stall = loop.frame(1000);
  assert.equal(stall.steps, 0);
  assert.equal(stall.state.status, 'overload');
  assert.equal(stall.state.debtSeconds, 1);
  assert.equal(stall.state.overloadCount, 1);
  assert.equal(loop.frame(100000).steps, 0);
  assert.equal(commands.length, 0);
  assert.equal(loop.getState().activeRealSeconds, 1);
  loop.resume(100000);
  assert.equal(loop.getState().status, 'recovering');
  let frameClock = 100000;
  while (loop.getState().status === 'recovering') {
    frameClock += 100;
    const recovery = loop.frame(frameClock);
    assert.ok(recovery.steps <= 4);
    assert.equal(recovery.state.activeRealSeconds, 1);
  }
  assert.equal(commands.length, 60);
  assert.equal(loop.getState().simulatedSeconds, 1);
  assert.ok(loop.getState().debtSeconds < 1e-10);
  assert.equal(loop.frame(frameClock + dtMs).steps, 1);
  assert.equal(loop.getState().tick, 61);
});

test('250 ms threshold is inclusive and a larger debt explicitly overloads', () => {
  const exact = fixture().loop;
  exact.frame(0);
  assert.equal(exact.frame(OVERLOAD_DEBT_MS).steps, 4);
  assert.equal(exact.getState().status, 'running');
  const over = fixture().loop;
  over.frame(0);
  assert.equal(over.frame(OVERLOAD_DEBT_MS + 0.001).steps, 0);
  assert.equal(over.getState().status, 'overload');
});

test('manual and background pauses exclude stopped time and retain fractional debt', () => {
  for (const reason of ['manual', 'background'] as const) {
    const { loop } = fixture();
    loop.frame(0);
    loop.frame(10);
    loop.pause(10, reason);
    assert.equal(loop.frame(100000).steps, 0);
    assert.equal(loop.getState().tick, 0);
    assert.equal(loop.getState().status, reason);
    assert.equal(loop.getState().activeRealSeconds, 0.01);
    loop.resume(100000);
    assert.equal(loop.frame(100000).steps, 0);
    assert.equal(loop.frame(100000 + dtMs - 10).steps, 1);
    assert.equal(loop.getState().tick, 1);
    assert.equal(loop.getState().overloadCount, 0);
  }
});

test('pause accounts only the active interval to its boundary, and recovery can itself pause', () => {
  const { loop } = fixture();
  loop.frame(0);
  loop.pause(20);
  assert.equal(loop.getState().activeRealSeconds, 0.02);
  assert.equal(loop.getState().tick, 0);
  loop.resume(10000);
  assert.equal(loop.frame(10000).steps, 1);
  loop.frame(11000);
  assert.equal(loop.getState().status, 'overload');
  loop.resume(11000);
  for (let i = 0; i < 13; i += 1) loop.frame(11000);
  assert.equal(loop.getState().status, 'recovering');
  loop.pause(11000, 'background');
  loop.resume(50000);
  assert.equal(loop.getState().status, 'recovering');
  assert.equal(loop.frame(50000).steps, 4);
});

test('invalid or regressing clocks are rejected without poisoning clock or loop state', () => {
  const { loop } = fixture();
  loop.frame(50);
  const before = loop.getState();
  for (const bad of [49, NaN, Infinity, -Infinity, -1, Number.MAX_VALUE]) {
    assert.throws(() => loop.frame(bad));
    assert.deepEqual(loop.getState(), before);
  }
  assert.throws(() => loop.pause(49));
  assert.throws(() => loop.resume(100), /already active/);
  assert.equal(loop.frame(50 + dtMs).steps, 1);
});

test('snapshot ownership is defensive, nested immutable and safe after later steps/disposal', () => {
  const { loop, mutable } = fixture();
  const initial = loop.frame(0);
  assert.notEqual(initial.state.snapshots?.current, mutable);
  assert.ok(Object.isFrozen(initial.state.snapshots?.current.nested.values));
  assert.throws(() => {
    (initial.state.snapshots?.current.nested.values as number[])[0] = 99;
  });
  mutable.nested.values[0] = 100;
  assert.equal(initial.state.snapshots?.current.nested.values[0], 0);
  loop.frame(dtMs);
  assert.equal(initial.state.snapshots?.current.nested.values[0], 0);
  loop.dispose();
  loop.dispose();
  assert.equal(loop.getState().status, 'disposed');
  assert.equal(loop.getState().snapshots, null);
  assert.throws(() => loop.frame(100), /disposed/);
  assert.throws(() => loop.pause(100), /disposed/);
  assert.throws(() => loop.resume(100), /disposed/);
});

test('step/capture/interpolate failures are explicit terminal faults and never retry an executed step', () => {
  for (const failureStage of ['step', 'capture', 'interpolate'] as const) {
    let executed = 0;
    const error = new Error(failureStage);
    const loop = createFixedTickLoop({
      captureSnapshot: () => {
        if (executed > 0 && failureStage === 'capture') throw error;
        return { executed };
      },
      step: () => {
        executed += 1;
        if (failureStage === 'step') throw error;
      },
      interpolate: (_previous, current) => {
        if (executed > 0 && failureStage === 'interpolate') throw error;
        return current;
      },
    });
    loop.frame(0);
    const result = loop.frame(dtMs);
    assert.equal(result.state.status, 'fault');
    assert.equal(result.state.fault?.stage, failureStage);
    assert.equal(result.state.fault?.attemptedTick, 1);
    assert.equal(result.state.fault?.error, error);
    assert.equal(result.state.tick, failureStage === 'interpolate' ? 1 : 0);
    assert.equal(result.interpolated, null);
    assert.throws(() => loop.frame(dtMs * 2), /faulted/);
    assert.throws(() => loop.resume(1000), /faulted/);
    assert.equal(executed, 1);
    loop.dispose();
  }
});

test('reentrant operations are rejected; uncaught reentrancy produces a fault', () => {
  let invoke = () => {};
  const loop = createFixedTickLoop({
    captureSnapshot: () => ({ value: 0 }),
    step: () => {
      invoke();
    },
    interpolate: (_previous, current) => current,
  });
  loop.frame(0);
  invoke = () => {
    assert.throws(() => loop.pause(dtMs), /Reentrant/);
    assert.throws(() => loop.resume(dtMs), /Reentrant/);
    assert.throws(() => loop.dispose(), /Reentrant/);
    loop.frame(dtMs);
  };
  assert.equal(loop.frame(dtMs).state.fault?.stage, 'step');
});

test('snapshot plain-tree boundary rejects accessors/cycles/exotic objects; null snapshots are valid', () => {
  let getterCalls = 0;
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get: () => {
      getterCalls += 1;
      return 0;
    },
  });
  const cyclic: { next?: unknown } = {};
  cyclic.next = cyclic;
  for (const invalid of [accessor, cyclic, new Map(), { value: NaN }, [1, , 3]]) {
    assert.throws(() =>
      createFixedTickLoop({
        captureSnapshot: () => invalid,
        step: () => {},
        interpolate: () => null,
      }),
    );
  }
  assert.equal(getterCalls, 0);
  const loop = createFixedTickLoop({
    captureSnapshot: () => null,
    step: () => {},
    interpolate: () => null,
  });
  assert.equal(loop.frame(0).state.status, 'running');
  assert.ok(loop.getState().snapshots);
});

test('initial tick keeps addressed identity while elapsed simulated time starts at zero', () => {
  const { loop, commands } = fixture(100);
  loop.frame(0);
  loop.frame(dtMs);
  assert.deepEqual(commands, [101]);
  assert.equal(loop.getState().simulatedSeconds, FIXED_DT_SECONDS);
});
