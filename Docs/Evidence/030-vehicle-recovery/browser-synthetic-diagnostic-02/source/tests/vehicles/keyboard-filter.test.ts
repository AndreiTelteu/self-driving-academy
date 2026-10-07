import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKeyboardFilter } from '../../src/vehicles/keyboard-filter';
import type { VehicleCommand } from '../../src/vehicles/contracts';
import { createVehicleController } from '../../src/vehicles/controller';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createFixedTickLoop } from '../../src/simulation/fixed-tick';
import {
  createDefaultSettings,
  createSettingsStore,
  KEYBOARD_MAPPING,
  mapKeyboardRates,
  keyboardSteeringFactor,
  parseControlPreferences,
  upgradeKeyboardControlPreferences,
} from '../../src/settings';
import { CONTROLLER_CONTEXT } from './controller-reference';
const defaults = () => createDefaultSettings('025-test').input.control;
const frame = (tick: number, speedMps = 0) => ({ tick, dtSeconds: 1 / 60, speedMps });

test('legacy mapping remains readable and requires explicit immutable revision upgrade', () => {
  const legacy = { ...defaults(), mappingVersion: 'provisional-v1' as const, version: 4 };
  assert.equal(parseControlPreferences(legacy).mappingVersion, 'provisional-v1');
  assert.throws(() => createKeyboardFilter(CONTROLLER_CONTEXT, 'car', legacy), /Explicit/);
  const upgraded = upgradeKeyboardControlPreferences(legacy);
  assert.equal(legacy.version, 4);
  assert.equal(upgraded.version, 5);
  assert.equal(upgraded.mappingVersion, KEYBOARD_MAPPING.version);
  assert.equal(upgraded.fov, legacy.fov);
  assert.equal(upgraded.cameraMotion, legacy.cameraMotion);
  assert(Object.isFrozen(upgraded));
  assert.throws(() =>
    upgradeKeyboardControlPreferences({ ...legacy, version: Number.MAX_SAFE_INTEGER }),
  );
  const store = createSettingsStore({
    ...createDefaultSettings('p'),
    input: { ...createDefaultSettings('p').input, control: legacy },
  });
  assert.equal(store.getSnapshot().input.control.mappingVersion, 'provisional-v1');
  const reset = store.reset();
  assert.equal(reset.input.control.mappingVersion, KEYBOARD_MAPPING.version);
  assert.equal(reset.input.control.version, 5);
});

test('finite monotone slider rates have positive endpoints and bounded symmetric speed attenuation', () => {
  for (const slider of [
    'steeringSensitivity',
    'returnRate',
    'throttleRamp',
    'brakeRamp',
  ] as const) {
    const values = [0, 50, 100].map((value) =>
      mapKeyboardRates({ ...defaults(), [slider]: value }),
    );
    const key =
      slider === 'steeringSensitivity'
        ? 'steeringRisePerSecond'
        : slider === 'returnRate'
          ? 'steeringReturnPerSecond'
          : slider === 'throttleRamp'
            ? 'throttleRisePerSecond'
            : 'brakeRisePerSecond';
    assert(values[0][key] > 0);
    assert(values[0][key] < values[1][key]);
    assert(values[1][key] < values[2][key]);
  }
  const rates = mapKeyboardRates({ ...defaults(), speedAttenuation: 100 });
  assert.equal(keyboardSteeringFactor(rates, 0), 1);
  assert(Math.abs(keyboardSteeringFactor(rates, 35) - 0.2) < 1e-12);
  assert.equal(keyboardSteeringFactor(rates, 35), keyboardSteeringFactor(rates, -350));
  assert.throws(() => keyboardSteeringFactor(rates, NaN));
});

test('raw digital input and tick-filtered commands are distinct immutable snapshots', () => {
  const filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', defaults());
  filter.setAction('throttle', true);
  filter.setAction('steerRight', true);
  const first = filter.step(frame(1));
  assert.equal(first.raw.throttle, 1);
  assert.equal(first.raw.steering, 1);
  assert.equal(first.command.throttle, 0.05);
  assert(Math.abs(first.command.steering - 2 / 60) < 1e-12);
  assert.notEqual(first.raw, first.command);
  assert(Object.isFrozen(first.held));
  for (let tick = 2; tick <= 60; tick++) filter.step(frame(tick));
  filter.setAction('throttle', false);
  filter.setAction('steerRight', false);
  const released = filter.step(frame(61));
  assert.equal(released.command.throttle, 0);
  assert(released.command.steering > 0 && released.command.steering < 1);
  assert.equal(first.held.throttle, true);
  assert.equal(first.command.throttle, 0.05);
  for (let tick = 62; tick <= 90; tick++) filter.step(frame(tick));
  assert.equal(filter.step(frame(91)).command.steering, 0);
  filter.dispose();
});

test('opposed steering is neutral; raw W+S is retained while brake dominates command throttle', () => {
  const filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', defaults());
  for (const action of ['throttle', 'brake', 'steerLeft', 'steerRight'] as const)
    filter.setAction(action, true);
  const result = filter.step(frame(1));
  assert.equal(result.raw.throttle, 1);
  assert.equal(result.raw.brake, 1);
  assert.equal(result.raw.steering, 0);
  assert.equal(result.command.throttle, 0);
  assert.equal(result.command.brake, 0.1);
  assert.equal(result.command.steering, 0);
  filter.setAction('brake', false);
  filter.setAction('handbrake', true);
  const hand = filter.step(frame(2));
  assert.equal(hand.command.throttle, 0);
  assert.equal(hand.command.brake, 0);
  assert.equal(hand.command.handbrake, true);
  filter.dispose();
});

test('focus clear discards held keys and ramp residuals immediately without stale repeat state', () => {
  const filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', defaults());
  filter.setAction('throttle', true);
  filter.setAction('steerLeft', true);
  filter.setAction('signalLeft', true);
  for (let tick = 1; tick <= 60; tick++) filter.step(frame(tick));
  filter.clear();
  const neutral = filter.step(frame(61));
  assert.equal(neutral.command.throttle, 0);
  assert.equal(neutral.command.steering, 0);
  assert.equal(neutral.command.turnSignal, 'OFF');
  assert.equal(filter.getStats().heldKeys, 0);
  filter.dispose();
  assert.equal(filter.getStats().disposed, true);
  assert.equal(filter.getStats().retainedFrames, 0);
  assert.throws(() => filter.step(frame(62)), /disposed/);
});

test('invalid frame leaves tick and ramps unchanged and getters are never called', () => {
  const filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', defaults());
  filter.setAction('throttle', true);
  assert.throws(() => filter.step(frame(2)));
  assert.throws(() => filter.step({ ...frame(1), dtSeconds: 0.1 }));
  assert.throws(() => filter.step(frame(1, NaN)));
  let reads = 0;
  const hostile = Object.defineProperty(frame(1), 'speedMps', {
    get() {
      reads++;
      return 0;
    },
    enumerable: true,
  });
  assert.throws(() => filter.step(hostile));
  assert.equal(reads, 0);
  assert.equal(filter.getStats().tick, 0);
  assert.equal(filter.step(frame(1)).command.throttle, 0.05);
  assert.throws(() => filter.step(frame(1)));
  filter.dispose();
});

test('preferences apply at exactly next tick, clear input and enforce revision and one pending snapshot', () => {
  const filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', defaults());
  filter.setAction('throttle', true);
  filter.step(frame(1));
  assert.throws(() => filter.replacePreferences({ ...defaults(), steeringSensitivity: 100 }, 2));
  assert.throws(() => filter.replacePreferences({ ...defaults(), version: 1 }, 3));
  filter.replacePreferences({ ...defaults(), version: 1, steeringSensitivity: 100 }, 2);
  assert.equal(filter.getStats().heldKeys, 0);
  assert.throws(() => filter.replacePreferences({ ...defaults(), version: 2 }, 2));
  filter.setAction('throttle', true);
  const next = filter.step(frame(2));
  assert.equal(next.appliedPreferencesAtTick, 2);
  assert.equal(next.controlPreferencesVersion, 1);
  assert.equal(next.command.throttle, 0);
  assert.throws(() => filter.replacePreferences(defaults(), 3));
  filter.dispose();
});

test('high-speed envelope clamps existing steering and signed velocity is symmetric', () => {
  const filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', {
    ...defaults(),
    speedAttenuation: 100,
  });
  filter.setAction('steerRight', true);
  for (let tick = 1; tick <= 60; tick++) filter.step(frame(tick));
  const fast = filter.step(frame(61, 35));
  assert(fast.command.steering <= 0.2 + 1e-12);
  const reverse = filter.step(frame(62, -35));
  assert.equal(fast.command.steering, reverse.command.steering);
  filter.dispose();
});

test('actual native keyboard composition produces identical commands/physics at30/60/144 render cadences', async () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const world = await createRapierProbe();
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, 'sedan');
    const controller = createVehicleController(CONTROLLER_CONTEXT, world),
      filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', defaults());
    const identity = world.bodyIdentity('car')!;
    controller.register(identity);
    const commands: VehicleCommand[] = [];
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick: controller.getStats().tick }),
      interpolate: (_previous, current) => current,
      step(time) {
        filter.setAction('throttle', time.tick > 180 && time.tick <= 360);
        filter.setAction('steerRight', time.tick > 300 && time.tick <= 390);
        filter.setAction('brake', time.tick > 420);
        const result = filter.step({ ...time, speedMps: world.project('car').speed });
        commands.push(result.command);
        controller.step(
          time,
          [{ identity, command: result.command }],
          time.tick === 1 ? [{ identity, mode: 'MANUAL' }] : [],
          false,
        );
        return undefined;
      },
    });
    try {
      loop.frame(0);
      for (let frame = 1; frame <= fps * 8; frame++) loop.frame((frame * 1000) / fps);
      assert.equal(controller.getStats().tick, 480);
      results.push({ commands, physical: world.project('car') });
    } finally {
      loop.dispose();
      filter.dispose();
      controller.dispose();
      world.dispose();
    }
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], results[2]);
});
