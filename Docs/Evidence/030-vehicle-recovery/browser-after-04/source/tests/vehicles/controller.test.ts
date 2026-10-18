import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVehicleController } from '../../src/vehicles/controller';
import type { VehicleActuationInput } from '../../src/vehicles/controller-port';
import type { BodyIdentity } from '../../src/vehicles/body-port';
import type { VehicleCommand } from '../../src/vehicles/contracts';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { CONTROLLER_CONTEXT, controllerCommand } from './controller-reference';
import { createFixedTickLoop } from '../../src/simulation/fixed-tick';

const time = (tick: number) => ({ tick, dtSeconds: 1 / 60 });
function fake() {
  const identities = new Map<string, BodyIdentity>();
  let generation = 0;
  const add = (entityId: string) => {
    const identity = Object.freeze({ entityId, handle: ++generation, generation });
    identities.set(entityId, identity);
    return identity;
  };
  const calls: ReadonlyMap<string, VehicleActuationInput>[] = [];
  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    bodyIdentity: (id) => identities.get(id),
    step(inputs) {
      calls.push(inputs);
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
  const identity = add('car');
  controller.register(identity);
  const packet = (tick: number, source: 'PLAYER' | 'AUTONOMY', values = {}) => ({
    identity,
    command: controllerCommand('car', tick, source, values),
  });
  return { controller, identity, calls, identities, add, packet };
}

test('AUTO target realizes fresh commands for exactly six physical ticks and expires', () => {
  const f = fake();
  for (let tick = 1; tick <= 7; tick++) {
    const result = f.controller.step(
      time(tick),
      tick === 1 ? [f.packet(1, 'AUTONOMY', { throttle: 0.7, turnSignal: 'LEFT' })] : [],
    );
    assert.equal(result.controls[0].command.tick, tick);
    assert.equal(result.controls[0].command.throttle, tick <= 6 ? 0.7 : 0);
    assert.equal(result.controls[0].targetTick, tick <= 6 ? 1 : null);
  }
  assert.equal(f.calls.length, 7);
  assert.equal(f.controller.getStats().retainedBatches, 0);
});

test('same-tick takeover ignores valid old AI, dominates throttle with brake, and PLAYER never holds', () => {
  const f = fake();
  const result = f.controller.step(
    time(1),
    [
      f.packet(1, 'AUTONOMY', { throttle: 1 }),
      f.packet(1, 'PLAYER', { throttle: 1, brake: 0.2, turnSignal: 'HAZARD' }),
    ],
    [{ identity: f.identity, mode: 'MANUAL' }],
  );
  assert.equal(result.ignoredCommands.length, 1);
  assert.equal(result.controls[0].command.throttle, 0);
  assert.equal(result.controls[0].command.brake, 0.2);
  assert(result.controls[0].leftIndicatorOn && result.controls[0].rightIndicatorOn);
  assert.equal(f.controller.step(time(2)).controls[0].command.brake, 0);
  assert.equal(f.controller.readControl(f.identity)?.turnSignal, 'OFF');
});

test('authority transfers atomically between two PLAYER candidates', () => {
  const f = fake(),
    other = f.add('other');
  f.controller.register(other);
  f.controller.step(time(1), [], [{ identity: f.identity, mode: 'MANUAL' }]);
  assert.throws(() => f.controller.step(time(2), [], [{ identity: other, mode: 'LEARNING' }]));
  assert.equal(f.calls.length, 1);
  f.controller.step(
    time(2),
    [],
    [
      { identity: other, mode: 'LEARNING' },
      { identity: f.identity, mode: 'AUTO' },
    ],
  );
  assert.equal(f.controller.getStats().players, 1);
  assert.equal(f.controller.readControl(other)?.mode, 'LEARNING');
});

test('malformed, duplicate, stale world/tick/token and oversized batches reject before all effects', () => {
  const f = fake();
  let getters = 0;
  const invalid = Object.defineProperty({}, 'identity', {
    get() {
      getters++;
      return f.identity;
    },
    enumerable: true,
  });
  const good = f.packet(1, 'AUTONOMY', { throttle: 1 });
  for (const packets of [
    [good, invalid],
    [good, good],
    [{ ...good, identity: { ...f.identity } }],
    [{ ...good, command: { ...good.command, worldEpoch: 1 } }],
    [{ ...good, command: { ...good.command, tick: 2 } }],
    Array(221).fill(good),
  ])
    assert.throws(() => f.controller.step(time(1), packets));
  assert.equal(getters, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.controller.getStats().tick, 0);
  assert.equal(f.controller.getStats().targets, 0);
  f.controller.step(time(1), [good]);
});

test('proxy replacement during admission cannot command an ID-reused native body', () => {
  const f = fake(),
    good = f.packet(1, 'AUTONOMY', { throttle: 1 });
  let replaced = false;
  const hostile = new Proxy(good, {
    ownKeys(target) {
      if (!replaced) {
        replaced = true;
        f.add('car');
      }
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(() => f.controller.step(time(1), [hostile]), /body changed/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.controller.getStats().tick, 0);
  assert.equal(f.controller.readControl(f.identity), undefined);
  const replacement = f.identities.get('car')!;
  f.controller.register(replacement);
  assert.equal(f.controller.remove(f.identity), false);
  assert.equal(f.controller.step(time(1)).controls[0].command.throttle, 0);
});

test('suspend flushes targets; readback is historical, resume starts neutral; reset is new owner', () => {
  const f = fake();
  f.controller.step(time(1), [f.packet(1, 'AUTONOMY', { throttle: 1 })]);
  f.controller.suspend();
  assert.equal(f.controller.readControl(f.identity)?.command.throttle, 1);
  assert.equal(f.controller.getStats().targets, 0);
  assert.throws(() => f.controller.step(time(2)), /suspended/);
  f.controller.resume();
  assert.equal(f.controller.step(time(2)).controls[0].command.throttle, 0);
  f.controller.dispose();
  assert.equal(f.controller.getStats().vehicles, 0);
  assert.equal(f.controller.readControl(f.identity), undefined);
  assert.throws(() => f.controller.register(f.identity), /disposed/);
});

test('fault after actuation is terminal and is never retried or claimed rolled back', () => {
  const identity = Object.freeze({ entityId: 'car', handle: 1, generation: 1 });
  let calls = 0;
  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    bodyIdentity: () => identity,
    step() {
      calls++;
      throw new Error('native fault after effects');
    },
  });
  controller.register(identity);
  assert.throws(() => controller.step(time(1)), /native fault/);
  assert.equal(controller.getStats().fault?.attemptedTick, 1);
  assert.equal(controller.getStats().tick, 0);
  assert.throws(() => controller.step(time(1)), /terminal/);
  assert.equal(calls, 1);
  controller.dispose();
});

test('reentrant mutation from the actuation port is rejected', () => {
  const identity = Object.freeze({ entityId: 'car', handle: 1, generation: 1 });
  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    bodyIdentity: () => identity,
    step() {
      assert.throws(() => controller.suspend(), /reentrant/);
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
  controller.register(identity);
  controller.step(time(1));
  controller.dispose();
});

test('native handbrake sets rear impulse caps and rejects malformed whole batch before setters', async () => {
  const world = await createRapierProbe();
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    world.step(
      new Map([['car', { throttle: 0, brake: 0.25, steering: 0, handbrake: true }]]),
      false,
    );
    const caps = world.readVehicleMechanics('car').wheelBrakeImpulseLimitNs;
    assert.equal(caps[0], caps[1]);
    assert.equal(caps[2], caps[3]);
    assert(Math.abs(caps[2] / caps[0] - 4) < 1e-6);
    assert.throws(() =>
      world.step(
        new Map([
          ['car', { throttle: 1, brake: 0, steering: 1, handbrake: 1 as unknown as boolean }],
        ]),
        false,
      ),
    );
    assert.deepEqual(world.readVehicleMechanics('car').wheelBrakeImpulseLimitNs, caps);
  } finally {
    world.dispose();
  }
});

test('PLAYER 60Hz and AUTONOMY 10Hz realize identical actual Rapier trajectories for both classes', async () => {
  for (const classId of ['sedan', 'compact'] as const) {
    const traces = [];
    for (const source of ['PLAYER', 'AUTONOMY'] as const) {
      const world = await createRapierProbe();
      const controller = createVehicleController(CONTROLLER_CONTEXT, world);
      try {
        world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
        const identity = world.bodyIdentity('car')!;
        controller.register(identity);
        const trace = [];
        for (let tick = 1; tick <= 780; tick++) {
          const phase = Math.floor((tick - 1) / 180);
          const values =
            phase === 0
              ? {}
              : phase === 1
                ? { throttle: 0.8 }
                : phase === 2
                  ? { throttle: 0.5, steering: 0.25, turnSignal: 'LEFT' as const }
                  : phase === 3
                    ? { brake: 0.8 }
                    : { throttle: 1, handbrake: true, turnSignal: 'HAZARD' as const };
          const packets =
            source === 'PLAYER' || (tick - 1) % 6 === 0
              ? [{ identity, command: controllerCommand('car', tick, source, values) }]
              : [];
          const result = controller.step(
            time(tick),
            packets,
            tick === 1 && source === 'PLAYER' ? [{ identity, mode: 'MANUAL' }] : [],
            false,
          );
          if (tick % 60 === 0)
            trace.push({
              physical: world.project('car'),
              controls: { ...result.controls[0].command, source: 'same' },
            });
        }
        traces.push(trace);
      } finally {
        controller.dispose();
        world.dispose();
      }
    }
    assert.deepEqual(traces[0], traces[1]);
    assert(traces[0][5].physical.speed > 5);
    assert(traces[0][11].physical.speed < traces[0][8].physical.speed);
  }
});

test('twenty native ownership cycles retain at most 110 entries and release all 880 subscriptions', async () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const world = await createRapierProbe();
    const controller = createVehicleController({ ...CONTROLLER_CONTEXT, worldEpoch: cycle }, world);
    const tokens: BodyIdentity[] = [];
    try {
      for (let i = 0; i < 110; i++) {
        const id = `car-${i}`;
        world.addCar(id, { x: (i % 11) * 4, y: 0.8, z: Math.floor(i / 11) * 6 });
        const identity = world.bodyIdentity(id)!;
        tokens.push(identity);
        controller.register(identity);
        for (let subscriber = 0; subscriber < 8; subscriber++)
          world.subscribeBody(identity, () => {});
      }
      assert.equal(world.bodyResources().subscriptions, 880);
      assert.equal(controller.getStats().vehicles, 110);
      controller.step(time(1), [], [], false);
      assert.equal(controller.getStats().projections, 110);
      assert.equal(controller.getStats().targets, 0);
      assert.equal(controller.getStats().retainedBatches, 0);
    } finally {
      controller.dispose();
      world.dispose();
    }
    assert.equal(controller.getStats().vehicles, 0);
    assert.equal(controller.getStats().projections, 0);
    assert.equal(world.bodyResources().subscriptions, 0);
    assert.equal(world.bodyResources().entities, 0);
    assert.equal(world.collisionResources().colliders, 0);
    assert.equal(world.collisionResources().disposed, true);
    assert.equal(controller.readControl(tokens[0]), undefined);
    assert.throws(() => world.readBody(tokens[0]));
  }
});

test('rear handbrake reduces speed and distance from a repeatable moving start versus coast', async () => {
  const results = [];
  for (const handbrake of [false, true]) {
    const world = await createRapierProbe();
    const controller = createVehicleController(CONTROLLER_CONTEXT, world);
    try {
      world.addCar('car', { x: 0, y: 0.8, z: 0 });
      const identity = world.bodyIdentity('car')!;
      controller.register(identity);
      for (let tick = 1; tick <= 180; tick++) controller.step(time(tick), [], [], false);
      world.setVelocity('car', { x: 0, y: 0, z: 15 });
      const start = world.project('car').position.z;
      for (let tick = 181; tick <= 300; tick++)
        controller.step(
          time(tick),
          (tick - 181) % 6 === 0
            ? [{ identity, command: controllerCommand('car', tick, 'AUTONOMY', { handbrake }) }]
            : [],
          [],
          false,
        );
      results.push({
        speed: world.project('car').speed,
        distance: world.project('car').position.z - start,
      });
    } finally {
      controller.dispose();
      world.dispose();
    }
  }
  assert(results[1].speed < results[0].speed * 0.8);
  assert(results[1].distance < results[0].distance * 0.9);
});

test('actual fixed-tick composition at 30/60/144 presentation Hz produces identical 60Hz commands and pose', async () => {
  const runs = [];
  for (const fps of [30, 60, 144]) {
    const world = await createRapierProbe();
    const controller = createVehicleController(CONTROLLER_CONTEXT, world);
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    const identity = world.bodyIdentity('car')!;
    controller.register(identity);
    const commands: VehicleCommand[] = [];
    const loop = createFixedTickLoop({
      captureSnapshot: () => {
        const state = world.project('car');
        return {
          speed: state.speed,
          position: { x: state.position.x, y: state.position.y, z: state.position.z },
        };
      },
      interpolate: (_previous, current) => current,
      step(frame) {
        const command = controllerCommand('car', frame.tick, 'AUTONOMY', {
          throttle: frame.tick > 180 ? 0.8 : 0,
          steering: frame.tick > 360 ? 0.15 : 0,
        });
        const result = controller.step(
          frame,
          (frame.tick - 1) % 6 === 0 ? [{ identity, command }] : [],
          [],
          false,
        );
        commands.push(result.controls[0].command);
        return undefined;
      },
    });
    try {
      loop.frame(0);
      for (let frame = 1; frame <= fps * 8; frame++) loop.frame((frame * 1000) / fps);
      assert.equal(loop.getState().tick, 480);
      runs.push({ commands, physical: world.project('car') });
      controller.suspend();
      loop.pause(8000, 'background');
      loop.frame(9000);
      assert.equal(controller.getStats().tick, 480);
      assert.equal(controller.getStats().targets, 0);
      controller.resume();
      loop.resume(9000);
      loop.frame(9000 + 1000 / 60);
      assert.equal(controller.getStats().tick, 481);
    } finally {
      loop.dispose();
      controller.dispose();
      world.dispose();
    }
  }
  assert.deepEqual(runs[0], runs[1]);
  assert.deepEqual(runs[0], runs[2]);
});
