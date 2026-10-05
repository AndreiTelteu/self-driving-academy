import assert from 'node:assert/strict';
import test from 'node:test';
import { createVehicleController } from '../../src/vehicles/controller';
import {
  createDrivetrainState,
  realizeDrivetrain,
  DRIVETRAIN_LIMITS,
} from '../../src/vehicles/drivetrain';
import { createBrakingReverseKeyboardFilter } from '../../src/vehicles/braking-reverse-input';
import { createDefaultSettings } from '../../src/settings';
import { parseVehicleCommand } from '../../src/vehicles/contracts';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { CONTROLLER_CONTEXT, controllerCommand } from './controller-reference';
import type { VehicleCommand } from '../../src/vehicles/contracts';
import type { DrivetrainState, DriveIntent } from '../../src/vehicles/drivetrain';

function directional(
  tick: number,
  direction: DriveIntent['direction'] = 'REVERSE',
  values: Partial<VehicleCommand> = {},
) {
  return parseVehicleCommand({
    ...controllerCommand('car', tick, 'PLAYER', { throttle: direction === 'NONE' ? 0 : 0.8 }),
    driveIntent: { version: DRIVETRAIN_LIMITS.version, direction, shiftBrake: 0.7 },
    ...values,
  });
}
const motion = (speed: number, total = Math.abs(speed)) => ({
  longitudinalSpeedMps: speed,
  totalSpeedMps: total,
});

test('explicit direction intent preserves legacy schemas and rejects malformed extra fields/getters', () => {
  const legacy = controllerCommand('car', 1, 'PLAYER', { brake: 1 });
  assert.equal(parseVehicleCommand(legacy).driveIntent, undefined);
  assert.equal(directional(1).driveIntent?.direction, 'REVERSE');
  assert.throws(() =>
    parseVehicleCommand({
      ...legacy,
      driveIntent: { version: 'v-fake', direction: 'REVERSE', shiftBrake: 1 },
    }),
  );
  assert.throws(() => directional(1, 'NONE', { throttle: 1 }));
  let reads = 0;
  assert.throws(() =>
    parseVehicleCommand({
      ...legacy,
      get driveIntent() {
        reads++;
        return {};
      },
    }),
  );
  assert.equal(reads, 0);
});
test('forward motion never gets reverse propulsion; full total-speed dwell precedes gear engagement', () => {
  let state = createDrivetrainState();
  for (let tick = 1; tick <= 120; tick++) {
    const result = realizeDrivetrain(state, directional(tick), motion(20));
    state = result.state;
    assert.equal(result.projection.physicalInput.throttle, 0);
    assert.equal(result.brake, 0.7);
    assert.equal(result.projection.phase, 'STOPPING');
    assert.equal(state.nearZeroTicks, 0);
  }
  const lateral = realizeDrivetrain(state, directional(121), motion(0, 5));
  state = lateral.state;
  assert.equal(state.nearZeroTicks, 0);
  assert.equal(lateral.projection.physicalInput.throttle, 0);
  for (let index = 1; index <= 6; index++) {
    const result = realizeDrivetrain(state, directional(121 + index), motion(0.1));
    state = result.state;
    assert.equal(result.projection.nearZeroTicks, index);
    assert.equal(result.projection.physicalInput.throttle, index === 6 ? -0.8 : 0);
  }
  assert.equal(state.direction, 'REVERSE');
});
test('interrupted dwell, opposite request, handbrake and service brake cannot smuggle a shift or force', () => {
  let state: DrivetrainState = createDrivetrainState();
  for (let tick = 1; tick <= 5; tick++)
    state = realizeDrivetrain(state, directional(tick), motion(0)).state;
  state = realizeDrivetrain(state, directional(6), motion(0.21)).state;
  assert.equal(state.nearZeroTicks, 0);
  const cancel = realizeDrivetrain(state, directional(7, 'FORWARD'), motion(0));
  assert.equal(cancel.state.pendingDirection, null);
  assert.equal(cancel.projection.physicalInput.throttle, 0.8);
  for (const values of [{ handbrake: true }, { brake: 0.3 }]) {
    const blocked = realizeDrivetrain(state, directional(8, 'REVERSE', values), motion(0));
    assert.equal(blocked.state.nearZeroTicks, 0);
    assert.equal(blocked.projection.physicalInput.throttle, 0);
  }
  state = Object.freeze({
    enabled: true,
    direction: 'REVERSE',
    pendingDirection: null,
    nearZeroTicks: 0,
  });
  const symmetric = realizeDrivetrain(state, directional(9, 'FORWARD'), motion(-4));
  assert.equal(symmetric.projection.physicalInput.throttle, 0);
  assert.equal(symmetric.brake, 0.7);
  const impact = realizeDrivetrain(state, directional(10, 'REVERSE'), motion(4));
  assert.equal(impact.projection.physicalInput.throttle, 0);
});
test('027 keyboard preserves raw digital braking and isolates directional ramps from025', () => {
  const prefs = createDefaultSettings('027-test').input.control;
  const filter = createBrakingReverseKeyboardFilter(CONTROLLER_CONTEXT, 'car', prefs);
  filter.setAction('brake', true);
  const frame = filter.step({ tick: 1, dtSeconds: 1 / 60, speedMps: 20 });
  assert.equal(frame.raw.brake, 1);
  assert.equal(frame.raw.throttle, 0);
  assert.equal(frame.command.brake, 0);
  assert(frame.command.throttle > 0);
  assert.equal(frame.command.driveIntent?.direction, 'REVERSE');
  assert(frame.command.driveIntent!.shiftBrake > 0);
  filter.setAction('throttle', true);
  const both = filter.step({ tick: 2, dtSeconds: 1 / 60, speedMps: 20 });
  assert.equal(both.command.throttle, 0);
  assert(both.command.brake > 0);
  assert.equal(both.command.driveIntent?.direction, 'NONE');
  filter.clear();
  const cleared = filter.step({ tick: 3, dtSeconds: 1 / 60, speedMps: 20 });
  assert.equal(cleared.command.throttle, 0);
  assert.equal(cleared.command.driveIntent?.shiftBrake, 0);
  assert.equal(filter.getStats().heldKeys, 0);
  filter.dispose();
  assert.throws(() => filter.step({ tick: 4, dtSeconds: 1 / 60, speedMps: 0 }));
});
test('controller opt-in, whole-batch validation and suspend/authority reset guard direction state', async () => {
  const world = await createRapierProbe();
  world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, 'sedan');
  const token = world.bodyIdentity('car')!;
  const legacy = createVehicleController(CONTROLLER_CONTEXT, world);
  legacy.register(token);
  assert.throws(() =>
    legacy.step(
      { tick: 1, dtSeconds: 1 / 60 },
      [{ identity: token, command: directional(1) }],
      [{ identity: token, mode: 'MANUAL' }],
    ),
  );
  assert.equal(legacy.getStats().tick, 0);
  legacy.dispose();
  const controller = createVehicleController(CONTROLLER_CONTEXT, world, 0, {
    drivetrainVersion: DRIVETRAIN_LIMITS.version,
  });
  controller.register(token);
  try {
    for (let tick = 1; tick <= 3; tick++)
      controller.step(
        { tick, dtSeconds: 1 / 60 },
        [{ identity: token, command: directional(tick) }],
        tick === 1 ? [{ identity: token, mode: 'MANUAL' }] : [],
      );
    assert.throws(() =>
      controller.step({ tick: 4, dtSeconds: 1 / 30 }, [
        { identity: token, command: directional(4) },
      ]),
    );
    assert.equal(controller.getStats().tick, 3);
    controller.suspend();
    assert.equal(controller.getStats().drivetrain?.shifting, 0);
    assert.throws(() => controller.step({ tick: 4, dtSeconds: 1 / 60 }));
    controller.resume();
    const frame = controller.step({ tick: 4, dtSeconds: 1 / 60 }, [
      { identity: token, command: directional(4) },
    ]);
    assert((frame.controls[0].drivetrain?.nearZeroTicks ?? 0) <= 1);
    controller.step({ tick: 5, dtSeconds: 1 / 60 }, [], [{ identity: token, mode: 'AUTO' }]);
    assert.equal(controller.readControl(token)?.drivetrain?.engagedDirection, 'FORWARD');
  } finally {
    controller.dispose();
    world.dispose();
    assert.equal(controller.getStats().drivetrain?.states, 0);
    assert.equal(world.bodyResources().entities, 0);
  }
});

test('native heldS brakes, reverses only after dwell, and heldW symmetrically returns forward on both classes', async () => {
  for (const classId of ['sedan', 'compact'] as const) {
    const world = await createRapierProbe();
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
    for (let index = 0; index < 180; index++) world.step(new Map(), false);
    world.setVelocity('car', { x: 0, y: 0, z: 20 });
    const token = world.bodyIdentity('car')!,
      controller = createVehicleController(CONTROLLER_CONTEXT, world, 0, {
        drivetrainVersion: DRIVETRAIN_LIMITS.version,
      }),
      filter = createBrakingReverseKeyboardFilter(
        CONTROLLER_CONTEXT,
        'car',
        createDefaultSettings('027-native').input.control,
      );
    controller.register(token);
    filter.setAction('brake', true);
    let tick = 0,
      engagedTick: number | null = null,
      reverseMotion = false,
      forwardMotion = false;
    try {
      for (; tick < 900;) {
        const input = filter.step({
          tick: ++tick,
          dtSeconds: 1 / 60,
          speedMps: world.project('car').speed,
        });
        const control = controller.step(
          { tick, dtSeconds: 1 / 60 },
          [{ identity: token, command: input.command }],
          tick === 1 ? [{ identity: token, mode: 'MANUAL' }] : [],
          false,
        ).controls[0];
        const drive = control.drivetrain!;
        if (drive.engagedDirection === 'REVERSE' && engagedTick === null) {
          engagedTick = tick;
          assert.equal(drive.nearZeroTicks, 6);
          assert(drive.motion!.totalSpeedMps <= 0.2);
        }
        if (engagedTick === null) assert.equal(drive.physicalInput.throttle, 0);
        if (world.project('car').velocity.z < -2) {
          reverseMotion = true;
          break;
        }
      }
      assert(reverseMotion && engagedTick !== null && engagedTick > 6);
      filter.setAction('brake', false);
      filter.setAction('throttle', true);
      for (let index = 0; index < 900; index++) {
        const input = filter.step({
          tick: ++tick,
          dtSeconds: 1 / 60,
          speedMps: world.project('car').speed,
        });
        const drive = controller.step(
          { tick, dtSeconds: 1 / 60 },
          [{ identity: token, command: input.command }],
          [],
          false,
        ).controls[0].drivetrain!;
        assert(Number.isFinite(world.project('car').position.z));
        if (drive.engagedDirection === 'REVERSE') assert.equal(drive.physicalInput.throttle, 0);
        if (world.project('car').velocity.z > 2) {
          forwardMotion = true;
          break;
        }
      }
      assert(forwardMotion);
    } finally {
      filter.dispose();
      controller.dispose();
      world.dispose();
      assert.equal(world.collisionResources().colliders, 0);
    }
  }
});

test('native rear handbrake changes a moving turn without changing mechanics or creating non-finite state', async () => {
  for (const classId of ['sedan', 'compact'] as const) {
    const outcomes: number[] = [];
    for (const handbrake of [false, true]) {
      const world = await createRapierProbe();
      world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
      for (let index = 0; index < 180; index++) world.step(new Map(), false);
      world.setVelocity('car', { x: 0, y: 0, z: 8 });
      const token = world.bodyIdentity('car')!,
        mechanicsBefore = world.readVehicleMechanics('car');
      const controller = createVehicleController(CONTROLLER_CONTEXT, world, 0, {
        drivetrainVersion: DRIVETRAIN_LIMITS.version,
      });
      controller.register(token);
      try {
        for (let tick = 1; tick <= 180; tick++) {
          const command = directional(tick, 'NONE', { handbrake, steering: 0.35 });
          controller.step(
            { tick, dtSeconds: 1 / 60 },
            [{ identity: token, command }],
            tick === 1 ? [{ identity: token, mode: 'MANUAL' }] : [],
            false,
          );
          const state = world.project('car');
          for (const value of [
            ...Object.values(state.position),
            ...Object.values(state.velocity),
            ...Object.values(state.rotation),
          ])
            assert(Number.isFinite(value));
          assert(
            Math.hypot(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w) >
              0.999,
          );
          assert(state.speed < 30);
          assert(Math.abs(state.position.y) < 10);
        }
        const mechanics = world.readVehicleMechanics('car');
        assert.deepEqual(mechanics.appliedEngineForceN, [0, 0, 0, 0]);
        assert.equal(mechanics.wheelBrakeImpulseLimitNs[0], 0);
        assert.equal(mechanics.wheelBrakeImpulseLimitNs[1], 0);
        assert.equal(mechanics.wheelBrakeImpulseLimitNs[2] > 0, handbrake);
        assert.equal(mechanics.wheelBrakeImpulseLimitNs[3] > 0, handbrake);
        for (const key of [
          'massKg',
          'powerW',
          'grip',
          'brakeAccelerationMps2',
          'wheels',
          'turningRadiusM',
        ] as const)
          assert.deepEqual(mechanics[key], mechanicsBefore[key]);
        outcomes.push(world.project('car').speed);
      } finally {
        controller.dispose();
        world.dispose();
        assert.equal(world.bodyResources().entities, 0);
      }
    }
    assert(
      outcomes[1] < outcomes[0],
      `${classId}: rear handbrake must change actual moving trajectory/speed`,
    );
  }
});

test('bounded state survives20 full-capacity ownership cycles without stale-token or history retention', () => {
  const tokens = Array.from({ length: 111 }, (_, index) =>
    Object.freeze({ entityId: `car-${index}`, handle: index + 0.5, generation: 1 }),
  );
  const identities = new Map<string, (typeof tokens)[number]>(
    tokens.map((token) => [token.entityId, token]),
  );
  const costs = {
    controllerMs: 0,
    stepMs: 0,
    queryMs: 0,
    bridgeMs: 0,
    totalMs: 0,
    queryCount: 0,
    bridgeCalls: 0,
  };
  for (let cycle = 0; cycle < 20; cycle++) {
    const controller = createVehicleController(
      CONTROLLER_CONTEXT,
      {
        bodyIdentity: (id) => identities.get(id),
        readBody: (identity) => ({
          identity,
          transform: {
            positionM: { x: 0, y: 0, z: 0 },
            rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
          },
          velocityMps: { x: 0, y: 0, z: 0 },
        }),
        step: () => costs,
      },
      0,
      { drivetrainVersion: DRIVETRAIN_LIMITS.version },
    );
    for (const token of tokens.slice(0, 110)) controller.register(token);
    assert.equal(controller.getStats().drivetrain?.states, 110);
    assert.throws(() => controller.register(tokens[110]));
    assert.equal(controller.remove({ ...tokens[0] }), false);
    assert.equal(controller.remove(tokens[0]), true);
    assert.equal(controller.getStats().drivetrain?.states, 109);
    assert.equal(controller.readControl(tokens[0]), undefined);
    assert.equal(controller.getStats().drivetrain?.retainedHistory, 0);
    controller.dispose();
    assert.equal(controller.getStats().drivetrain?.states, 0);
    assert.equal(controller.getStats().vehicles, 0);
  }
});
