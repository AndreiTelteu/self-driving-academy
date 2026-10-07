import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContractContext } from '../../src/sessions';
import {
  createControlAuthority,
  CONTROL_AUTHORITY_LIMITS,
} from '../../src/input/control-authority';
import { createVehicleController } from '../../src/vehicles/controller';
import type { BodyIdentity } from '../../src/vehicles/body-port';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference';
function fixture(
  clearOldPlayer?: (identity: BodyIdentity) => void,
  context: ContractContext = CONTROLLER_CONTEXT,
) {
  const identities = new Map<string, BodyIdentity>();
  let steps = 0,
    generation = 0;
  const add = (id: string) => {
    const identity = Object.freeze({ entityId: id, handle: ++generation, generation });
    identities.set(id, identity);
    return identity;
  };
  const controller = createVehicleController(context, {
    bodyIdentity: (id) => identities.get(id),
    step() {
      steps++;
      return {
        controllerMs: 0,
        stepMs: 0,
        queryMs: 0,
        bridgeMs: 0,
        totalMs: 0,
        queryCount: 0,
        bridgeCalls: 0,
      };
    },
  });
  const ports = { bodyIdentity: (id: string) => identities.get(id), clearOldPlayer };
  const owner = createControlAuthority(context, controller, ports);
  const time = (tick: number) => ({
    ...context,
    version: CONTROL_AUTHORITY_LIMITS.version,
    tick,
    dtSeconds: 1 / 60,
  });
  const packet = (
    identity: BodyIdentity,
    tick: number,
    source: 'PLAYER' | 'AUTONOMY',
    throttle = 0.4,
  ) => ({
    identity,
    command: { ...controllerCommand(identity.entityId, tick, source, { throttle }), ...context },
  });
  return { owner, controller, ports, add, identities, time, packet, steps: () => steps };
}

import { createModeControls } from '../../src/input/mode-controls';
import type { ModeControlsPorts } from '../../src/input/mode-controls';

function modes(clear?: (id: BodyIdentity) => void, eligibility?: ModeControlsPorts['eligibility']) {
  const f = fixture(clear),
    a = f.add('a'),
    b = f.add('b');
  f.owner.register(a);
  f.owner.register(b);
  let selected: BodyIdentity | null = a;
  const adapter = createModeControls(CONTROLLER_CONTEXT, {
    readAuthority: () => f.owner.getStats(),
    selectedIdentity: () => selected,
    bodyIdentity: f.ports.bodyIdentity,
    eligibility,
  });
  const prepare = () =>
    adapter.prepare({ ...f.time(f.owner.getStats().tick + 1), version: '067-mode-controls-v1' });
  const apply = () => {
    const ticket = prepare();
    f.owner.step(f.time(ticket.tick), [], ticket.requests);
    assert.equal(adapter.settle(ticket), 'ACCEPTED');
    return adapter.observe();
  };
  return {
    ...f,
    a,
    b,
    adapter,
    prepare,
    apply,
    select: (id: BodyIdentity | null) => {
      selected = id;
    },
  };
}
test('067 all six edges use actual066 acceptance, with no optimistic projection', () => {
  const f = modes();
  for (const [key, expected] of [
    ['M', 'MANUAL'],
    ['L', 'LEARNING'],
    ['L', 'MANUAL'],
    ['M', 'AUTO'],
    ['L', 'LEARNING'],
    ['M', 'AUTO'],
  ] as const) {
    const old = f.adapter.observe();
    assert.equal(f.adapter.enqueue(key), true);
    assert.equal(f.adapter.observe().mode, old.mode);
    assert.equal(f.apply().mode, expected);
    assert.equal(f.adapter.observe().tick, f.steps());
  }
  assert.equal(f.adapter.getStats().retainedHistory, 0);
});
test('067 burst folds, event-time identity cannot retarget, conflict and capacity reject whole burst', () => {
  const f = modes();
  f.adapter.enqueue('M');
  f.adapter.enqueue('M');
  assert.deepEqual(f.prepare().requests, []);
  f.adapter.clear();
  f.adapter.enqueue('L');
  f.select(f.b);
  const ticket = f.prepare();
  assert.equal(ticket.requests[0].identity, f.a);
  f.owner.step(f.time(1), [], ticket.requests);
  f.adapter.settle(ticket);
  assert.equal(f.adapter.observe().identity, f.a);
  f.adapter.enqueue('M');
  const next = f.prepare();
  assert.deepEqual(next.requests, [
    { identity: f.a, mode: 'AUTO' },
    { identity: f.b, mode: 'MANUAL' },
  ]);
  f.adapter.reject(next);
  f.adapter.enqueue('M');
  f.select(f.a);
  assert.throws(() => f.adapter.enqueue('L'), /conflict/);
  assert.equal(f.adapter.getStats().intents, 0);
  for (let n = 0; n < 16; n++) f.adapter.enqueue('M');
  assert.throws(() => f.adapter.enqueue('M'), /capacity/);
  assert.equal(f.adapter.getStats().intents, 0);
});
test('067 malformed physical batch retains exact ticket for same-tick retry, foreign tickets rejected', () => {
  const f = modes();
  f.adapter.enqueue('M');
  const t = f.prepare(),
    p = f.packet(f.a, 1, 'PLAYER');
  assert.throws(() => f.owner.step(f.time(1), [p, p], t.requests));
  assert.equal(f.adapter.settle(t), 'PENDING');
  assert.equal(f.steps(), 0);
  assert.throws(() => f.adapter.settle({ ...t }), /ticket/);
  assert.throws(() => f.adapter.enqueue('L'), /settle/);
  f.owner.step(f.time(1), [p], t.requests);
  assert.equal(f.adapter.settle(t), 'ACCEPTED');
  assert.throws(() => f.adapter.reject(t), /ticket/);
});
test('067 physical accepted callback fault cannot be hidden by failed eligibility', () => {
  const f = modes(
    () => {
      throw Error('clear failure');
    },
    () => {
      throw Error('eligibility unavailable');
    },
  );
  f.adapter.enqueue('M');
  f.apply();
  f.select(f.b);
  f.adapter.enqueue('L');
  const t = f.prepare();
  assert.throws(() => f.owner.step(f.time(t.tick), [], t.requests), /clear failure/);
  assert.equal(f.adapter.settle(t), 'FAULT');
  const view = f.adapter.getStats().projection!;
  assert.equal(view.tick, 2);
  assert.equal(view.mode, 'LEARNING');
  assert.equal(view.identity, f.b);
  assert.equal(view.fault, 'KEYBOARD_CLEAR');
  assert.equal(view.learningEligible, null);
  assert.throws(() => f.adapter.enqueue('M'), /terminal/);
  assert.throws(
    () =>
      f.adapter.reset(CONTROLLER_CONTEXT, {
        readAuthority: () => f.owner.getStats(),
        selectedIdentity: () => f.a,
        bodyIdentity: f.ports.bodyIdentity,
      }),
    /lifecycle/,
  );
});
test('067 eligibility current explicit facts only; stale, malformed and throwing ports become unavailable', () => {
  let fact: unknown = null;
  const f = modes(undefined, () => fact);
  f.adapter.enqueue('L');
  f.apply();
  const valid = {
    ...CONTROLLER_CONTEXT,
    version: '067-mode-eligibility-v1',
    tick: 1,
    identity: f.a,
    eligible: true,
  };
  fact = valid;
  assert.equal(f.adapter.observe().learningEligible, true);
  fact = { ...valid, eligible: false };
  assert.equal(f.adapter.observe().learningEligible, false);
  for (const value of [
    null,
    Promise.resolve(valid),
    { ...valid, tick: 0 },
    { ...valid, identity: f.b },
    { ...valid, worldEpoch: 999 },
    { ...valid, version: 'old' },
    { ...valid, eligible: 'yes' },
  ]) {
    fact = value;
    const view = f.adapter.observe();
    assert.equal(view.learningEligible, null);
    assert.equal(view.mode, 'LEARNING');
    assert.equal(view.tick, 1);
  }
  fact = Object.defineProperty({ ...valid }, 'eligible', {
    get() {
      throw Error('getter must not run');
    },
    enumerable: true,
  });
  assert.equal(f.adapter.observe().learningEligible, null);
  f.adapter.enqueue('M');
  assert.equal(f.apply().learningEligible, false);
});
test('067 invalid times, stale native identity, expiry, suspension and lifecycle clear are bounded', () => {
  const f = modes();
  f.adapter.enqueue('M');
  assert.throws(() =>
    f.adapter.prepare({ ...f.time(1), version: '067-mode-controls-v1', dtSeconds: 0.1 }),
  );
  assert.equal(f.steps(), 0);
  const t = f.prepare();
  f.adapter.clear();
  assert.throws(() => f.adapter.settle(t), /ticket/);
  f.adapter.enqueue('L');
  f.owner.step(f.time(1));
  assert.throws(() => f.prepare(), /Expired/);
  f.adapter.clear();
  f.owner.suspend();
  assert.equal(f.adapter.enqueue('M'), false);
  assert.throws(() => f.prepare(), /suspended/);
  f.owner.resume();
  const replacement = f.add('a');
  f.select(replacement);
  f.adapter.enqueue('M');
  const bad = f.prepare();
  assert.throws(() => f.owner.step(f.time(2), [], bad.requests));
  f.adapter.reject(bad);
  for (let n = 0; n < 20; n++) {
    const v = modes();
    v.adapter.enqueue('M');
    v.adapter.prepare({ ...v.time(1), version: '067-mode-controls-v1' });
    v.adapter.dispose();
    assert.deepEqual(v.adapter.getStats(), {
      intents: 0,
      inFlight: 0,
      disposed: true,
      fault: null,
      projection: null,
      retainedHistory: 0,
    });
    v.owner.dispose();
    v.controller.dispose();
  }
});
test('067 reentrant informational callback cannot mutate physical ticket or hide state', () => {
  const f = modes(undefined, () => {
    f.adapter.clear();
    return null;
  });
  f.adapter.enqueue('L');
  const view = f.apply();
  assert.equal(view.mode, 'LEARNING');
  assert.equal(view.tick, 1);
  assert.equal(view.learningEligible, null);
  assert.equal(f.adapter.getStats().inFlight, 0);
});

test('067 disposed authority and stale/throwing selection still publish terminal actual tick', () => {
  const f = modes();
  f.adapter.enqueue('M');
  f.apply();
  f.owner.dispose();
  f.identities.clear();
  f.select(f.a);
  const projection = f.adapter.observe();
  assert.equal(projection.tick, 1);
  assert.equal(projection.fault, 'AUTHORITY_DISPOSED');
  assert.equal(projection.identity, null);
  assert.equal(f.adapter.getStats().inFlight, 0);
  const g = fixture();
  const a = g.add('a');
  g.owner.register(a);
  let throws = false;
  const adapter = createModeControls(CONTROLLER_CONTEXT, {
    readAuthority: () => g.owner.getStats(),
    selectedIdentity: () => {
      if (throws) throw Error('selection teardown');
      return a;
    },
    bodyIdentity: g.ports.bodyIdentity,
  });
  g.owner.dispose();
  throws = true;
  assert.equal(adapter.observe().fault, 'AUTHORITY_DISPOSED');
  assert.equal(adapter.observe().identity, null);
});
test('067 ports are descriptor snapshots, accessors and symbols never execute, reset releases old lifecycle', () => {
  const f = modes();
  let getter = 0;
  const ports = {
    readAuthority: () => f.owner.getStats(),
    selectedIdentity: () => f.a,
    bodyIdentity: f.ports.bodyIdentity,
  };
  const bad = Object.defineProperty({ ...ports }, 'selectedIdentity', {
    get() {
      getter++;
      return () => f.a;
    },
    enumerable: true,
  });
  assert.throws(() => createModeControls(CONTROLLER_CONTEXT, bad), /descriptor/);
  assert.equal(getter, 0);
  assert.throws(
    () => createModeControls(CONTROLLER_CONTEXT, { ...ports, [Symbol('extra')]: true }),
    /symbol/,
  );
  const adapter = createModeControls(CONTROLLER_CONTEXT, ports);
  ports.selectedIdentity = () => f.b;
  adapter.enqueue('M');
  const t = adapter.prepare({ ...f.time(1), version: '067-mode-controls-v1' });
  assert.equal(t.identity, f.a);
  adapter.clear();
  const context = { ...CONTROLLER_CONTEXT, worldEpoch: CONTROLLER_CONTEXT.worldEpoch + 1 };
  const fresh = fixture(undefined, context);
  const b = fresh.add('new');
  fresh.owner.register(b);
  adapter.reset(context, {
    readAuthority: () => fresh.owner.getStats(),
    selectedIdentity: () => b,
    bodyIdentity: fresh.ports.bodyIdentity,
  });
  assert.equal(adapter.observe().identity, b);
  assert.equal(adapter.getStats().intents, 0);
  assert.throws(() => adapter.settle(t), /ticket/);
});

test('067 failed actuation publishes prior accepted tick rather than candidate mode or attempted tick', () => {
  const identity = Object.freeze({ entityId: 'fault', handle: 1, generation: 1 });
  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    bodyIdentity: () => identity,
    step() {
      throw Error('native failed');
    },
  });
  const owner = createControlAuthority(CONTROLLER_CONTEXT, controller, {
    bodyIdentity: () => identity,
  });
  owner.register(identity);
  const adapter = createModeControls(CONTROLLER_CONTEXT, {
    readAuthority: () => owner.getStats(),
    selectedIdentity: () => identity,
    bodyIdentity: () => identity,
  });
  adapter.enqueue('L');
  const ticket = adapter.prepare({
    ...CONTROLLER_CONTEXT,
    version: '067-mode-controls-v1',
    tick: 1,
    dtSeconds: 1 / 60,
  });
  assert.throws(
    () =>
      owner.step(
        {
          ...CONTROLLER_CONTEXT,
          version: CONTROL_AUTHORITY_LIMITS.version,
          tick: 1,
          dtSeconds: 1 / 60,
        },
        [],
        ticket.requests,
      ),
    /native failed/,
  );
  assert.equal(adapter.settle(ticket), 'FAULT');
  const view = adapter.getStats().projection!;
  assert.equal(view.tick, 0);
  assert.equal(view.mode, 'AUTO');
  assert.equal(view.fault, 'CONTROLLER_ACTUATION');
  assert.equal(view.learningEligible, false);
});
