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
test('066 simultaneous transfer is order independent and old input never retargets', () => {
  for (const reverse of [false, true]) {
    const cleared: BodyIdentity[] = [];
    const f = fixture((id) => {
      cleared.push(id);
    });
    const a = f.add('a'),
      b = f.add('b');
    f.owner.register(a);
    f.owner.register(b);
    const first = f.owner.step(
      f.time(1),
      [f.packet(a, 1, 'PLAYER'), f.packet(a, 1, 'AUTONOMY', 1)],
      [{ identity: a, mode: 'MANUAL' }],
    );
    assert.equal(first.frame.ignoredCommands[0].source, 'AUTONOMY');
    const changes = [
      { identity: a, mode: 'AUTO' as const },
      { identity: b, mode: 'LEARNING' as const },
    ];
    const next = f.owner.step(
      f.time(2),
      [f.packet(a, 2, 'PLAYER', 1)],
      reverse ? changes.reverse() : changes,
    );
    assert.equal(next.seat?.identity, b);
    assert.equal(next.frame.controls.find((c) => c.identity === b)?.command.throttle, 0);
    assert.equal(next.frame.ignoredCommands[0].vehicleId, 'a');
    assert.deepEqual(cleared, [a]);
    assert.equal(f.steps(), 2);
  }
});
test('066 same-body MANUAL/LEARNING preserves filter and release clears after accepted state', () => {
  let calls = 0;
  const f = fixture(() => {
    calls++;
    assert.equal(f.owner.getStats().tick, 3);
    assert.equal(f.owner.getStats().seat, null);
    assert.equal(f.steps(), 3);
  });
  const a = f.add('a');
  f.owner.register(a);
  f.owner.step(f.time(1), [], [{ identity: a, mode: 'MANUAL' }]);
  f.owner.step(f.time(2), [], [{ identity: a, mode: 'LEARNING' }]);
  assert.equal(calls, 0);
  f.owner.step(f.time(3), [], [{ identity: a, mode: 'AUTO' }]);
  assert.equal(calls, 1);
});
test('066 whole malformed batches reject without physical/tick/filter effects and same tick retries', () => {
  let clears = 0;
  const f = fixture(() => {
      clears++;
    }),
    a = f.add('a'),
    b = f.add('b');
  f.owner.register(a);
  f.owner.register(b);
  let getters = 0;
  const bad = Object.defineProperty({}, 'identity', {
    enumerable: true,
    get() {
      getters++;
      return a;
    },
  });
  for (const requests of [
    [
      { identity: a, mode: 'MANUAL' },
      { identity: b, mode: 'LEARNING' },
    ],
    [
      { identity: a, mode: 'AUTO' },
      { identity: a, mode: 'AUTO' },
    ],
    [bad],
    [{ identity: { ...a }, mode: 'AUTO' }],
    Array(111).fill({ identity: a, mode: 'AUTO' }),
  ])
    assert.throws(() => f.owner.step(f.time(1), [], requests));
  assert.throws(() => f.owner.step({ ...f.time(1), worldEpoch: 999 }));
  assert.throws(() => f.owner.step(f.time(2)));
  const p = f.packet(a, 1, 'PLAYER');
  assert.throws(() => f.owner.step(f.time(1), [p, p], [{ identity: a, mode: 'MANUAL' }]));
  assert.equal(getters, 0);
  assert.equal(f.steps(), 0);
  assert.equal(clears, 0);
  assert.equal(f.owner.getStats().tick, 0);
  f.owner.step(f.time(1), [p], [{ identity: a, mode: 'MANUAL' }]);
  assert.equal(f.steps(), 1);
});
test('066 callback failure records accepted physical state and is terminal, including reentrant guard', () => {
  const f = fixture(() => {
    assert.equal(f.owner.getStats().tick, 2);
    assert.equal(f.owner.getStats().seat, null);
    assert.throws(() => f.owner.dispose(), /reentrant/);
    throw Error('clear failed');
  });
  const a = f.add('a');
  f.owner.register(a);
  f.owner.step(f.time(1), [], [{ identity: a, mode: 'MANUAL' }]);
  assert.throws(() => f.owner.step(f.time(2), [], [{ identity: a, mode: 'AUTO' }]), /clear failed/);
  assert.deepEqual(f.owner.getStats().fault, {
    attemptedTick: 2,
    acceptedTick: 2,
    stage: 'KEYBOARD_CLEAR',
    physicalTickAccepted: true,
  });
  assert.equal(f.steps(), 2);
  assert.throws(() => f.owner.step(f.time(3)), /terminal/);
  const same = fixture();
  assert.throws(
    () => f.owner.reset(CONTROLLER_CONTEXT, same.controller, same.ports),
    /new lifecycle/,
  );
  const context = { ...CONTROLLER_CONTEXT, worldEpoch: CONTROLLER_CONTEXT.worldEpoch + 1 },
    fresh = fixture(undefined, context);
  f.owner.reset(context, fresh.controller, fresh.ports);
  assert.equal(f.owner.getStats().fault, null);
  assert.equal(f.owner.getStats().vehicles, 0);
});
test('066 stale native replacement and registration refusal do not silently recreate owner entities', () => {
  const f = fixture(),
    a = f.add('a');
  f.owner.register(a);
  assert.throws(() => f.owner.register(a));
  assert.equal(f.owner.getStats().vehicles, 1);
  const replacement = f.add('a');
  assert.throws(() => f.owner.step(f.time(1), [], [{ identity: a, mode: 'MANUAL' }]), /Stale/);
  f.owner.register(replacement);
  assert.equal(f.owner.getStats().vehicles, 1);
  assert.equal(f.owner.remove(a), false);
  f.owner.step(f.time(1), [], [{ identity: replacement, mode: 'LEARNING' }]);
  assert.equal(f.owner.getStats().seat?.identity, replacement);
  assert.equal(f.owner.remove(replacement), true);
  assert.equal(f.owner.getStats().seat, null);
});
test('066 suspension does not advance physical tick and ownership disposal releases only own references', () => {
  const f = fixture(),
    a = f.add('a');
  f.owner.register(a);
  f.owner.suspend();
  assert.throws(() => f.owner.step(f.time(1)), /suspended/);
  assert.equal(f.steps(), 0);
  f.owner.resume();
  f.owner.step(f.time(1));
  f.owner.dispose();
  f.owner.dispose();
  assert.equal(f.owner.getStats().vehicles, 0);
  assert.equal(f.owner.getStats().players, 0);
  assert.equal(f.controller.getStats().disposed, false);
  assert.throws(() => f.owner.step(f.time(2)), /disposed/);
  f.controller.dispose();
});
test('066 20 lifecycle cycles enforce 110 retained tokens, atomic capacity, and zero owner history', () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const f = fixture();
    for (let n = 0; n < 110; n++) f.owner.register(f.add('car-' + n));
    assert.throws(() => f.owner.register(f.add('overflow')), /capacity/);
    assert.equal(f.owner.getStats().vehicles, 110);
    assert.equal(f.controller.getStats().vehicles, 110);
    f.owner.step(f.time(1));
    assert.equal(f.owner.getStats().retainedHistory, 0);
    assert.equal(f.owner.getStats().retainedBatches, 0);
    f.owner.dispose();
    assert.equal(f.owner.getStats().vehicles, 0);
    assert.equal(f.owner.getStats().seat, null);
    f.controller.dispose();
    assert.equal(f.controller.getStats().vehicles, 0);
  }
});
test('066 descriptor snapshots reject symbols/accessors and proxy-triggered reentry without effects', () => {
  const f = fixture(),
    a = f.add('a');
  f.owner.register(a);
  let getterCalls = 0,
    reentries = 0;
  const accessor = Object.defineProperty({ mode: 'MANUAL' }, 'identity', {
    enumerable: true,
    get() {
      getterCalls++;
      return a;
    },
  });
  const symbolic = { identity: a, mode: 'MANUAL', [Symbol('extra')]: 1 };
  const extra = { identity: a, mode: 'MANUAL', extra: 1 };
  for (const request of [accessor, symbolic, extra])
    assert.throws(() => f.owner.step(f.time(1), [], [request]));
  const proxy = new Proxy(
    { identity: a, mode: 'MANUAL' },
    {
      ownKeys(target) {
        reentries++;
        assert.throws(() => f.owner.step(f.time(1)), /reentrant/);
        return Reflect.ownKeys(target);
      },
    },
  );
  f.owner.step(f.time(1), [], [proxy]);
  assert.equal(getterCalls, 0);
  assert.equal(reentries, 1);
  assert.equal(f.steps(), 1);
});
test('066 player removal callback fault reports registration acceptance without claiming a new physical tick', () => {
  const f = fixture(() => {
      throw Error('remove clear failed');
    }),
    a = f.add('a');
  f.owner.register(a);
  f.owner.step(f.time(1), [], [{ identity: a, mode: 'MANUAL' }]);
  assert.throws(() => f.owner.remove(a), /remove clear/);
  assert.equal(f.owner.getStats().vehicles, 0);
  assert.equal(f.controller.getStats().vehicles, 0);
  assert.equal(f.steps(), 1);
  assert.equal(f.owner.getStats().fault?.physicalTickAccepted, false);
  assert.equal(f.owner.getStats().fault?.acceptedTick, 1);
});
test('066 actuation fault is terminal and distinguishes unaccepted full physical tick from rollback', () => {
  const identity = Object.freeze({ entityId: 'a', handle: 1, generation: 1 });
  let physicalCalls = 0;
  const ports = {
    bodyIdentity: (id: string) => (id === 'a' ? identity : undefined),
    step() {
      physicalCalls++;
      throw Error('native actuation failure');
    },
  };
  const controller = createVehicleController(CONTROLLER_CONTEXT, ports),
    owner = createControlAuthority(CONTROLLER_CONTEXT, controller, ports);
  owner.register(identity);
  assert.throws(
    () =>
      owner.step({
        ...CONTROLLER_CONTEXT,
        version: CONTROL_AUTHORITY_LIMITS.version,
        tick: 1,
        dtSeconds: 1 / 60,
      }),
    /native actuation/,
  );
  assert.equal(physicalCalls, 1);
  assert.equal(owner.getStats().fault?.stage, 'CONTROLLER_ACTUATION');
  assert.equal(owner.getStats().fault?.physicalTickAccepted, false);
  assert.throws(
    () =>
      owner.step({
        ...CONTROLLER_CONTEXT,
        version: CONTROL_AUTHORITY_LIMITS.version,
        tick: 1,
        dtSeconds: 1 / 60,
      }),
    /terminal/,
  );
  assert.equal(physicalCalls, 1);
});
