import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVehicleController } from '../../src/vehicles/controller';
import { createVehicleDamage } from '../../src/vehicles/damage-state';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { VEHICLE_CLASSES } from '../../src/vehicles/vehicle-classes';
import { DRIVETRAIN_LIMITS } from '../../src/vehicles/drivetrain';
import { CONTROLLER_CONTEXT as context, controllerCommand } from './controller-reference';
import type { VehicleCommand } from '../../src/vehicles/contracts';
import type { VehicleActuationInput } from '../../src/vehicles/controller-port';

function command(
  tick: number,
  source: VehicleCommand['source'],
  direction: 'FORWARD' | 'REVERSE',
  extra: Partial<VehicleCommand> = {},
) {
  return {
    ...controllerCommand('car', tick, source, { throttle: 1 }),
    driveIntent: { version: DRIVETRAIN_LIMITS.version, direction, shiftBrake: 0.7 },
    ...extra,
  };
}
async function fixture(classId: keyof typeof VEHICLE_CLASSES = 'sedan') {
  const world = await createRapierProbe();
  const vehicle = VEHICLE_CLASSES[classId];
  world.addCar('car', { x: 0, y: 0.8, z: 0 }, vehicle);
  world.addNamedBox('wall', { x: 0, y: 1, z: 30 }, { x: 10, y: 1, z: 0.25 });
  for (let tick = 0; tick < 180; tick++) world.step(new Map());
  const identity = world.bodyIdentity('car')!;
  const damage = createVehicleDamage(context, world);
  damage.register(identity, vehicle.massKg);
  let applied: ReadonlyMap<string, VehicleActuationInput> = new Map();
  const port = {
    bodyIdentity: (id: string) => world.bodyIdentity(id),
    readBody: (token: typeof identity) => world.readBody(token),
    step(inputs: ReadonlyMap<string, VehicleActuationInput>, measure?: boolean) {
      applied = inputs;
      return world.step(inputs, measure);
    },
  };
  const controller = createVehicleController(context, port, 0, {
    drivetrainVersion: DRIVETRAIN_LIMITS.version,
    availability: damage,
  });
  controller.register(identity);
  return {
    world,
    damage,
    controller,
    identity,
    port,
    vehicle,
    applied: () => applied.get('car')!,
    impact(id: string, multiplier: number, tick = 0) {
      damage.applyIncident({
        ...context,
        incidentId: id,
        tick,
        vehicleId: 'car',
        otherEntityId: 'wall',
        impulseNs: vehicle.massKg * multiplier,
        first: world.collisionIdentity('car')!,
        second: world.collisionIdentity('wall')!,
      });
    },
    dispose() {
      controller.dispose();
      damage.dispose();
      world.dispose();
    },
  };
}

test('combined native reverse damage caps magnitude after gear realization for both classes and authorities', async () => {
  for (const classId of ['sedan', 'compact'] as const)
    for (const source of ['PLAYER', 'AUTONOMY'] as const) {
      const f = await fixture(classId);
      try {
        f.impact('damaged', 2);
        const startZ = f.world.readBody(f.identity).transform.positionM.z;
        for (let tick = 1; tick <= 300; tick++) {
          const projection = f.controller.step(
            { tick, dtSeconds: 1 / 60 },
            [{ identity: f.identity, command: command(tick, source, 'REVERSE') }],
            tick === 1
              ? [{ identity: f.identity, mode: source === 'PLAYER' ? 'MANUAL' : 'AUTO' }]
              : [],
          ).controls[0];
          assert.equal(projection.raw?.throttle, 1);
          assert.equal(projection.raw?.driveIntent?.direction, 'REVERSE');
          assert.equal(projection.command.source, source);
          assert.deepEqual(projection.drivetrain?.physicalInput, f.applied());
          assert.equal(Math.abs(f.applied().throttle), projection.command.throttle);
          if (
            projection.drivetrain?.engagedDirection === 'REVERSE' &&
            projection.drivetrain.phase === 'DRIVING'
          ) {
            assert.equal(projection.command.throttle, 0.5);
            assert.equal(f.applied().throttle, -0.5);
            assert.equal(projection.command.driveIntent?.direction, 'REVERSE');
          } else assert.equal(f.applied().throttle, 0);
        }
        assert.ok(
          f.world.readBody(f.identity).transform.positionM.z < startZ - 5,
          'actual native damage-limited reverse displacement',
        );
      } finally {
        f.dispose();
      }
    }
});

test('immobilized minimum brake blocks released-brake dwell; recovery preserves history and unlocks six physical ticks', async () => {
  const f = await fixture();
  try {
    f.impact('immobile', 8);
    for (let tick = 1; tick <= 12; tick++) {
      const control = f.controller.step({ tick, dtSeconds: 1 / 60 }, [
        { identity: f.identity, command: command(tick, 'AUTONOMY', 'REVERSE') },
      ]).controls[0];
      assert.equal(control.raw?.brake, 0);
      assert.equal(control.command.brake, 1);
      assert.equal(control.command.throttle, 0);
      assert.equal(control.drivetrain?.engagedDirection, 'FORWARD');
      assert.equal(control.drivetrain?.nearZeroTicks, 0);
      assert.deepEqual(control.drivetrain?.physicalInput, f.applied());
    }
    const history = f.damage.readHistory();
    f.damage.recover(f.identity, { context, operationId: 'recover', tick: 12 });
    assert.deepEqual(f.damage.readHistory().slice(0, history.length), history);
    assert.equal(f.damage.readHistory().at(-1)?.kind, 'RECOVERY');
    for (let tick = 13; tick <= 18; tick++) {
      const control = f.controller.step({ tick, dtSeconds: 1 / 60 }, [
        { identity: f.identity, command: command(tick, 'AUTONOMY', 'REVERSE') },
      ]).controls[0];
      assert.equal(control.drivetrain?.nearZeroTicks, tick - 12);
      assert.equal(f.applied().throttle, tick === 18 ? -1 : 0);
      assert.deepEqual(control.drivetrain?.physicalInput, f.applied());
    }
  } finally {
    f.dispose();
  }
});

test('combined damage and shift-brake guards reset on authority, brake, handbrake and lateral motion', async () => {
  const f = await fixture();
  try {
    f.impact('damaged', 2);
    // Inject native readback velocity only to isolate the total-speed guard; the real world remains owned and stepped.
    const originalRead = f.port.readBody;
    f.port.readBody = (token) => ({ ...originalRead(token), velocityMps: { x: 2, y: 0, z: 0 } });
    let control = f.controller.step({ tick: 1, dtSeconds: 1 / 60 }, [
      { identity: f.identity, command: command(1, 'AUTONOMY', 'REVERSE') },
    ]).controls[0];
    assert.equal(control.drivetrain?.nearZeroTicks, 0);
    assert.equal(control.command.brake, 0.7);
    assert.equal(f.applied().throttle, 0);
    f.port.readBody = (token) => ({ ...originalRead(token), velocityMps: { x: 0, y: 0, z: 0 } });
    control = f.controller.step({ tick: 2, dtSeconds: 1 / 60 }, [
      { identity: f.identity, command: command(2, 'AUTONOMY', 'REVERSE') },
    ]).controls[0];
    assert.equal(control.drivetrain?.nearZeroTicks, 1);
    control = f.controller.step(
      { tick: 3, dtSeconds: 1 / 60 },
      [{ identity: f.identity, command: command(3, 'PLAYER', 'REVERSE') }],
      [{ identity: f.identity, mode: 'MANUAL' }],
    ).controls[0];
    assert.equal(control.drivetrain?.nearZeroTicks, 1);
    for (const [tick, extra] of [
      [4, { brake: 0.3 }],
      [5, { handbrake: true }],
    ] as const) {
      control = f.controller.step({ tick, dtSeconds: 1 / 60 }, [
        { identity: f.identity, command: command(tick, 'PLAYER', 'REVERSE', extra) },
      ]).controls[0];
      assert.equal(control.drivetrain?.nearZeroTicks, 0);
      assert.equal(control.command.throttle, 0);
      assert.deepEqual(control.drivetrain?.physicalInput, f.applied());
      assert.equal(control.raw?.driveIntent?.direction, 'REVERSE');
    }
    f.controller.suspend();
    f.controller.resume();
    control = f.controller.step({ tick: 6, dtSeconds: 1 / 60 }, [
      { identity: f.identity, command: command(6, 'PLAYER', 'REVERSE') },
    ]).controls[0];
    assert.equal(control.drivetrain?.nearZeroTicks, 1);
    assert.throws(() => f.controller.step({ tick: 8, dtSeconds: 1 / 60 }));
    assert.equal(f.controller.getStats().tick, 6);
  } finally {
    f.dispose();
  }
});

test('combined provider mutation of physical generation rejects whole batch before signed actuation', async () => {
  const f = await fixture();
  f.controller.dispose();
  let replace = false;
  const controller = createVehicleController(context, f.port, 0, {
    drivetrainVersion: DRIVETRAIN_LIMITS.version,
    availability: {
      readAvailability() {
        if (replace) {
          f.world.removeBody(f.identity);
          f.world.addCar('car', { x: 0, y: 0.8, z: 0 }, f.vehicle);
        }
        return Object.freeze({ throttleMagnitudeLimit: 0.5, minimumBrake: 0 });
      },
    },
  });
  try {
    controller.register(f.identity);
    const serial = f.world.collisionStepSerial();
    replace = true;
    assert.throws(() =>
      controller.step({ tick: 1, dtSeconds: 1 / 60 }, [
        { identity: f.identity, command: command(1, 'AUTONOMY', 'FORWARD') },
      ]),
    );
    assert.equal(f.world.collisionStepSerial(), serial);
    assert.equal(controller.getStats().tick, 0);
    assert.equal(controller.readControl(f.identity), undefined);
  } finally {
    controller.dispose();
    f.dispose();
  }
});

test('proxy admission cannot replace the native token and deliver a signed damage-limited command to the replacement', async () => {
  const f = await fixture();
  try {
    const serial = f.world.collisionStepSerial();
    let replaced = false;
    const packetCommand = new Proxy(command(1, 'AUTONOMY', 'FORWARD'), {
      getOwnPropertyDescriptor(target, property) {
        if (!replaced) {
          replaced = true;
          f.world.removeBody(f.identity);
          f.world.addCar('car', { x: 0, y: 0.8, z: 0 }, f.vehicle);
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    assert.throws(() =>
      f.controller.step({ tick: 1, dtSeconds: 1 / 60 }, [
        { identity: f.identity, command: packetCommand },
      ]),
    );
    assert.equal(replaced, true);
    assert.notEqual(f.world.bodyIdentity('car'), f.identity);
    assert.equal(f.world.collisionStepSerial(), serial);
    assert.equal(f.controller.getStats().tick, 0);
    assert.equal(f.controller.readControl(f.identity), undefined);
  } finally {
    f.dispose();
  }
});
