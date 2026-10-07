import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVehicleDamage } from '../../src/vehicles/damage-state';
import { DAMAGE_CONFIG } from '../../src/vehicles/damage-port';
import { createVehicleController } from '../../src/vehicles/controller';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { VEHICLE_CLASSES } from '../../src/vehicles/vehicle-classes';
import { createCollisionEpisodes } from '../../src/vehicles/collision-episodes';
import { CONTROLLER_CONTEXT as context, controllerCommand } from './controller-reference';
import type { CollisionIncident } from '../../src/vehicles/collision-episodes';
import type { PhysicsProbe } from '../../src/vehicles/physics';

function incident(
  world: PhysicsProbe,
  id: string,
  impulseNs: number,
  tick = 0,
  vehicleId = 'car',
): CollisionIncident {
  return {
    ...context,
    incidentId: id,
    tick,
    vehicleId,
    otherEntityId: 'wall',
    impulseNs,
    first: world.collisionIdentity(vehicleId)!,
    second: world.collisionIdentity('wall')!,
  };
}
async function fixture(capacity: number = DAMAGE_CONFIG.historyRecords) {
  const world = await createRapierProbe();
  world.addCar('car', { x: 0, y: 0.8, z: 0 }, VEHICLE_CLASSES.sedan);
  world.addNamedBox('wall', { x: 0, y: 1, z: 20 }, { x: 10, y: 1, z: 0.25 });
  const damage = createVehicleDamage(context, world, capacity);
  const identity = world.bodyIdentity('car')!;
  damage.register(identity, VEHICLE_CLASSES.sedan.massKg);
  return {
    world,
    damage,
    identity,
    dispose() {
      damage.dispose();
      world.dispose();
    },
  };
}
test('mass-normalized exact thresholds, no cumulative low-onset guess, and recovery preserve idempotent history', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 5; i++) f.damage.applyIncident(incident(f.world, `low-${i}`, 2799.999));
    assert.equal(f.damage.readDamage(f.identity).availability, 'AVAILABLE');
    f.damage.applyIncident(incident(f.world, 'boundary', 2800));
    assert.equal(f.damage.readDamage(f.identity).availability, 'DAMAGED');
    assert.equal(f.damage.readDamage(f.identity).throttleMagnitudeLimit, 0.5);
    f.damage.applyIncident(incident(f.world, 'below-stop', 11199.999));
    assert.equal(f.damage.readDamage(f.identity).availability, 'DAMAGED');
    const strong = incident(f.world, 'stop', 11200);
    assert.equal(f.damage.applyIncident(strong), true);
    assert.equal(f.damage.readDamage(f.identity).availability, 'IMMOBILIZED');
    assert.equal(f.damage.applyIncident(strong), false);
    assert.throws(() => f.damage.applyIncident({ ...strong, impulseNs: 1 }));
    const before = f.damage.readHistory();
    const request = { context, operationId: 'recovery', tick: 1 };
    assert.equal(f.damage.recover(f.identity, request), true);
    assert.equal(f.damage.recover(f.identity, request), false);
    assert.equal(f.damage.readDamage(f.identity).availability, 'AVAILABLE');
    assert.equal(f.damage.readDamage(f.identity).lastIncidentId, 'stop');
    assert.deepEqual(f.damage.readHistory().slice(0, before.length), before);
    assert.equal(f.damage.readHistory().at(-1)?.kind, 'RECOVERY');
  } finally {
    f.dispose();
  }
});
test('finite admission backpressures028 without applying damage or consuming the incident', async () => {
  const f = await fixture(1);
  const episodes = createCollisionEpisodes(context, f.world.collisionSource);
  try {
    f.damage.applyIncident(incident(f.world, 'filled', 1));
    episodes.update(0, [
      {
        first: f.world.collisionIdentity('car')!,
        second: f.world.collisionIdentity('wall')!,
        impulseNs: 11200,
      },
    ]);
    const result = episodes.drain((value) => {
      f.damage.applyIncident(value);
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.pending, 1);
    assert.equal(f.damage.readDamage(f.identity).availability, 'AVAILABLE');
    assert.throws(() =>
      f.damage.recover(f.identity, { context, operationId: 'also-full', tick: 1 }),
    );
    assert.equal(f.damage.getStats().historyRecords, 1);
  } finally {
    episodes.dispose();
    f.dispose();
  }
});
test('stale token, forged registration, epoch fencing and reset retain prior history', async () => {
  const f = await fixture();
  try {
    const oldIncident = incident(f.world, 'old', 11200);
    f.damage.applyIncident(oldIncident);
    assert.throws(() => f.damage.readDamage({ ...f.identity }));
    f.world.removeBody(f.identity);
    f.world.addCar('car', { x: 0, y: 0.8, z: 0 });
    const replacement = f.world.bodyIdentity('car')!;
    f.damage.register(replacement, 1400);
    assert.throws(() => f.damage.applyIncident(oldIncident));
    assert.equal(f.damage.readDamage(replacement).availability, 'AVAILABLE');
    assert.throws(() => f.damage.recover(f.identity, { context, operationId: 'stale', tick: 1 }));
    f.damage.reset({ ...context, worldEpoch: 1 }, f.world);
    f.damage.register(replacement, 1400);
    assert.equal(f.damage.readHistory()[0].operationId, 'old');
    assert.throws(() => f.damage.readAvailability(replacement, context, 1));
    assert.equal(
      f.damage.readAvailability(replacement, { ...context, worldEpoch: 1 }, 1)
        .throttleMagnitudeLimit,
      1,
    );
  } finally {
    f.dispose();
  }
});
test('vehicle-to-vehicle impulse affects each exact participant with its own mass', async () => {
  const f = await fixture();
  try {
    f.world.addCar('compact', { x: 5, y: 0.8, z: 0 }, VEHICLE_CLASSES.compact);
    const compact = f.world.bodyIdentity('compact')!;
    f.damage.register(compact, 1100);
    f.damage.applyIncident({
      ...context,
      incidentId: 'two',
      tick: 0,
      vehicleId: 'car',
      otherEntityId: 'compact',
      impulseNs: 9000,
      first: f.world.collisionIdentity('car')!,
      second: f.world.collisionIdentity('compact')!,
    });
    assert.equal(f.damage.readDamage(f.identity).availability, 'DAMAGED');
    assert.equal(f.damage.readDamage(compact).availability, 'IMMOBILIZED');
    assert.equal(f.damage.getStats().historyRecords, 1);
  } finally {
    f.dispose();
  }
});
test('both sources publish truthful effective mobility commands and malformed provider never advances native physics', async () => {
  for (const source of ['PLAYER', 'AUTONOMY'] as const) {
    const f = await fixture();
    const controller = createVehicleController(context, f.world, 0, { availability: f.damage });
    try {
      controller.register(f.identity);
      f.damage.applyIncident(incident(f.world, 'damage', 2800));
      const first = controller.step(
        { tick: 1, dtSeconds: 1 / 60 },
        [{ identity: f.identity, command: controllerCommand('car', 1, source, { throttle: 1 }) }],
        [{ identity: f.identity, mode: source === 'PLAYER' ? 'MANUAL' : 'AUTO' }],
      );
      assert.equal(first.controls[0].raw?.throttle, 1);
      assert.equal(first.controls[0].command.throttle, 0.5);
      f.damage.applyIncident(incident(f.world, 'immobile', 11200, 1));
      const second = controller.step({ tick: 2, dtSeconds: 1 / 60 }, [
        { identity: f.identity, command: controllerCommand('car', 2, source, { throttle: 1 }) },
      ]);
      assert.equal(second.controls[0].command.throttle, 0);
      assert.equal(second.controls[0].command.brake, 1);
    } finally {
      controller.dispose();
      f.dispose();
    }
  }
  const f = await fixture();
  const invalid = createVehicleController(context, f.world, 0, {
    availability: {
      readAvailability() {
        return { throttleMagnitudeLimit: NaN, minimumBrake: 0 };
      },
    },
  });
  try {
    invalid.register(f.identity);
    const serial = f.world.collisionStepSerial();
    assert.throws(() => invalid.step({ tick: 1, dtSeconds: 1 / 60 }));
    assert.equal(f.world.collisionStepSerial(), serial);
    assert.equal(invalid.getStats().tick, 0);
  } finally {
    invalid.dispose();
    f.dispose();
  }
});
test('actual native high impact causes unavailable propulsion; recovery preserves incident and allows real motion for both classes', async () => {
  for (const tuning of [VEHICLE_CLASSES.sedan, VEHICLE_CLASSES.compact]) {
    const world = await createRapierProbe();
    const damage = createVehicleDamage(context, world);
    const episodes = createCollisionEpisodes(context, world.collisionSource);
    const controller = createVehicleController(context, world, 0, { availability: damage });
    try {
      world.addCar('car', { x: 0, y: 0.8, z: 0 }, tuning);
      world.addNamedBox('wall', { x: 0, y: 1, z: 3 }, { x: 10, y: 1, z: 0.25 });
      const identity = world.bodyIdentity('car')!;
      damage.register(identity, tuning.massKg);
      controller.register(identity);
      let at = 0;
      for (; at < 180; at++) controller.step({ tick: at + 1, dtSeconds: 1 / 60 });
      world.setVelocity('car', { x: 0, y: 0, z: 12 });
      for (; at < 300; at++) {
        controller.step({ tick: at + 1, dtSeconds: 1 / 60 });
        episodes.update(at + 1, world.readCollisionContacts().contacts);
        assert.equal(
          episodes.drain((value) => {
            damage.applyIncident(value);
          }).status,
          'drained',
        );
      }
      assert.equal(damage.readDamage(identity).availability, 'IMMOBILIZED');
      const history = damage.readHistory();
      assert.ok(history.some((value) => value.impulseNs! >= tuning.massKg * 8));
      // Test fixture removes the wall and repositions at a clear launch point;029 recovery itself does neither.
      world.removeCollisionEntity(world.collisionIdentity('wall')!);
      world.setPose(identity, {
        positionM: { x: 0, y: 0.8, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      });
      world.setBodyVelocity(identity, { x: 0, y: 0, z: 0 });
      for (; at < 600; at++)
        controller.step(
          { tick: at + 1, dtSeconds: 1 / 60 },
          [{ identity, command: controllerCommand('car', at + 1, 'PLAYER', { throttle: 1 }) }],
          at === 300 ? [{ identity, mode: 'MANUAL' }] : [],
        );
      assert.ok(Math.abs(world.project('car').position.z) < 0.1);
      assert.ok(world.project('car').speed < 0.1);
      damage.recover(identity, { context, operationId: `recover-${tuning.classId}`, tick: at });
      for (; at < 900; at++)
        controller.step({ tick: at + 1, dtSeconds: 1 / 60 }, [
          { identity, command: controllerCommand('car', at + 1, 'PLAYER', { throttle: 1 }) },
        ]);
      assert.ok(world.project('car').position.z > 5);
      assert.ok(world.project('car').speed > 2);
      assert.deepEqual(damage.readHistory().slice(0, history.length), history);
    } finally {
      controller.dispose();
      episodes.dispose();
      damage.dispose();
      world.dispose();
    }
  }
});
test('twenty native lifecycles bound110 registrations and release all retained owner and native resources', async () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const world = await createRapierProbe();
    const damage = createVehicleDamage(context, world);
    try {
      for (let index = 0; index < 110; index++) {
        const name = `car-${index}`;
        world.addCar(name, { x: (index % 11) * 5, y: 0.8, z: Math.floor(index / 11) * 8 });
        damage.register(world.bodyIdentity(name)!, 1400);
      }
      assert.equal(damage.getStats().vehicles, 110);
      assert.throws(() =>
        damage.register({ entityId: 'forged', handle: 0, generation: 111 }, 1400),
      );
      for (let at = 0; at < 3; at++) world.step(new Map(), false);
    } finally {
      damage.dispose();
      damage.dispose();
      world.dispose();
      assert.equal(damage.getStats().vehicles, 0);
      assert.equal(damage.getStats().identityEntries, 0);
      assert.equal(damage.getStats().historyRecords, 0);
      assert.equal(damage.getStats().operationIds, 0);
      assert.equal(world.bodyResources().entities, 0);
      assert.equal(world.bodyResources().subscriptions, 0);
      assert.equal(world.collisionResources().colliders, 0);
    }
  }
});
test('serialized history byte cap fails before retention or state mutation, with no silent eviction', async () => {
  const f = await fixture();
  try {
    let failed = false;
    for (let index = 0; index < DAMAGE_CONFIG.historyRecords; index++) {
      const value = incident(f.world, `${index}-${'x'.repeat(1900)}`, 1);
      const before = f.damage.getStats();
      try {
        f.damage.applyIncident(value);
      } catch (error) {
        assert.match(String(error), /serialized history full/);
        assert.equal(f.damage.getStats().historyRecords, before.historyRecords);
        assert.equal(f.damage.getStats().serializedHistoryBytes, before.serializedHistoryBytes);
        failed = true;
        break;
      }
    }
    assert.equal(failed, true);
    assert.ok(f.damage.getStats().historyRecords < DAMAGE_CONFIG.historyRecords);
    assert.ok(f.damage.getStats().serializedHistoryBytes <= DAMAGE_CONFIG.serializedHistoryBytes);
    const completeHistory = [];
    for (let offset = 0; offset < f.damage.getStats().historyRecords; offset += 64)
      completeHistory.push(...f.damage.readHistory(offset));
    assert.equal(
      new TextEncoder().encode(JSON.stringify(completeHistory)).byteLength,
      f.damage.getStats().serializedHistoryBytes,
    );
    assert.equal(f.damage.readDamage(f.identity).availability, 'AVAILABLE');
    assert.equal(f.damage.readHistory()[0].operationId, `0-${'x'.repeat(1900)}`);
  } finally {
    f.dispose();
  }
});
test('injected identity-port reentrancy is rejected during reads without disposing the owner', async () => {
  const world = await createRapierProbe();
  let armed = false;
  const damage = createVehicleDamage(context, {
    collisionSource: world.collisionSource,
    bodyIdentity(name) {
      if (armed) damage.dispose();
      return world.bodyIdentity(name);
    },
  });
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    const identity = world.bodyIdentity('car')!;
    damage.register(identity, 1400);
    armed = true;
    assert.throws(() => damage.readAvailability(identity, context, 1), /reentrant/);
    assert.equal(damage.getStats().disposed, false);
    assert.equal(damage.getStats().vehicles, 1);
    armed = false;
    assert.equal(damage.readAvailability(identity, context, 1).throttleMagnitudeLimit, 1);
  } finally {
    damage.dispose();
    world.dispose();
  }
});

test('only frozen own-data contexts cache; mutable epochs and frozen changing accessors never bypass validation', async () => {
  const f = await fixture();
  try {
    const immutable = Object.freeze({ ...context });
    assert.equal(f.damage.readAvailability(f.identity, immutable, 0).throttleMagnitudeLimit, 1);
    assert.equal(f.damage.readAvailability(f.identity, immutable, 1).throttleMagnitudeLimit, 1);
    const mutable: { schemaVersion: 1; units: 'SI'; sessionId: string; worldEpoch: number } = {
      ...context,
    };
    f.damage.readAvailability(f.identity, mutable, 1);
    mutable.worldEpoch = 99;
    assert.throws(() => f.damage.readAvailability(f.identity, mutable, 1), /world/);
    let getterCalls = 0;
    const accessor = {
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: context.sessionId,
      get worldEpoch() {
        getterCalls++;
        return getterCalls % 2 ? 0 : 99;
      },
    };
    Object.freeze(accessor);
    assert.throws(() => f.damage.readAvailability(f.identity, accessor, 1), /data fields/);
    assert.throws(() => f.damage.readAvailability(f.identity, accessor, 1), /data fields/);
    assert.equal(getterCalls, 0);
    assert.throws(
      () => f.damage.readAvailability(f.identity, Object.freeze({ ...context, extra: true }), 1),
      /unknown/,
    );
    const exotic = Object.freeze(Object.create(context)) as typeof context;
    assert.throws(() => f.damage.readAvailability(f.identity, exotic, 1), /plain data/);
    f.damage.readAvailability(f.identity, immutable, 1);
    f.damage.reset({ ...context, worldEpoch: 1 }, f.world);
    f.damage.register(f.identity, 1400);
    assert.throws(() => f.damage.readAvailability(f.identity, immutable, 1), /world/);
    assert.equal(
      f.damage.readAvailability(f.identity, Object.freeze({ ...context, worldEpoch: 1 }), 1)
        .throttleMagnitudeLimit,
      1,
    );
  } finally {
    f.dispose();
  }
});

test('controller caches only exact frozen own-data effects; mutable changed bounds and frozen getters cannot actuate', async () => {
  const f = await fixture();
  const immutable = Object.freeze({ throttleMagnitudeLimit: 0.5, minimumBrake: 0 });
  let supplied: unknown = immutable;
  const controller = createVehicleController(context, f.world, 0, {
    availability: {
      readAvailability() {
        return supplied as { throttleMagnitudeLimit: number; minimumBrake: number };
      },
    },
  });
  const step = (at: number) =>
    controller.step({ tick: at, dtSeconds: 1 / 60 }, [
      { identity: f.identity, command: controllerCommand('car', at, 'AUTONOMY', { throttle: 1 }) },
    ]);
  try {
    controller.register(f.identity);
    assert.equal(step(1).controls[0].command.throttle, 0.5);
    assert.equal(step(2).controls[0].command.throttle, 0.5);
    const mutable = { throttleMagnitudeLimit: 0.4, minimumBrake: 0 };
    supplied = mutable;
    assert.equal(step(3).controls[0].command.throttle, 0.4);
    const serial = f.world.collisionStepSerial();
    mutable.throttleMagnitudeLimit = NaN;
    assert.throws(() => step(4), /finite number/);
    assert.equal(f.world.collisionStepSerial(), serial);
    assert.equal(controller.getStats().tick, 3);
    mutable.throttleMagnitudeLimit = 0.2;
    assert.equal(step(4).controls[0].command.throttle, 0.2);
    let getterCalls = 0;
    supplied = Object.freeze({
      get throttleMagnitudeLimit() {
        getterCalls++;
        return getterCalls % 2 ? 0.5 : NaN;
      },
      minimumBrake: 0,
    });
    assert.throws(() => step(5), /data fields/);
    assert.throws(() => step(5), /data fields/);
    assert.equal(getterCalls, 0);
    supplied = Object.freeze({ throttleMagnitudeLimit: 0.5, minimumBrake: 0, extra: true });
    assert.throws(() => step(5), /unknown/);
    supplied = Object.freeze(Object.create(immutable));
    assert.throws(() => step(5), /plain data/);
    supplied = immutable;
    assert.equal(step(5).controls[0].command.throttle, 0.5);
    assert.equal(f.world.collisionStepSerial(), serial + 2);
  } finally {
    controller.dispose();
    f.dispose();
  }
});

test('availability direct read guard releases busy after provider throw and recursive read; retries preserve exact error', async () => {
  const world = await createRapierProbe();
  let mode: 'normal' | 'throw' | 'reenter' = 'normal';
  const failure = Object.freeze({ stage: 'identity-read' });
  const damage = createVehicleDamage(context, {
    collisionSource: world.collisionSource,
    bodyIdentity(name) {
      if (mode === 'throw') throw failure;
      if (mode === 'reenter') damage.readAvailability(world.bodyIdentity(name)!, context, 0);
      return world.bodyIdentity(name);
    },
  });
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    const identity = world.bodyIdentity('car')!;
    damage.register(identity, 1400);
    mode = 'throw';
    assert.throws(
      () => damage.readAvailability(identity, context, 0),
      (error: unknown) => error === failure,
    );
    mode = 'normal';
    assert.equal(damage.readAvailability(identity, context, 0).throttleMagnitudeLimit, 1);
    mode = 'reenter';
    assert.throws(() => damage.readAvailability(identity, context, 0), /reentrant/);
    mode = 'normal';
    assert.equal(damage.readAvailability(identity, context, 0).throttleMagnitudeLimit, 1);
    assert.throws(
      () => damage.readAvailability(identity, { ...context, worldEpoch: 9 }, 0),
      /world/,
    );
    assert.equal(damage.readAvailability(identity, context, 0).throttleMagnitudeLimit, 1);
    assert.equal(damage.getStats().historyRecords, 0);
  } finally {
    damage.dispose();
    world.dispose();
  }
});
