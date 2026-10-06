import {
  boolean,
  choice,
  contextFields,
  fields,
  number,
  readContext,
  requireContract,
  text,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import {
  KEYBOARD_MAPPING,
  keyboardSteeringFactor,
  mapKeyboardRates,
  parseControlPreferences,
} from '../settings';
import type { ControlPreferences } from '../settings';
import type { VehicleCommand } from './contracts';

export const keyboardDriveActions = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'handbrake',
  'signalLeft',
  'signalRight',
] as const;
export type KeyboardDriveAction = (typeof keyboardDriveActions)[number];
export interface KeyboardDrivePort {
  setAction(action: KeyboardDriveAction, pressed: boolean): void;
  clear(): void;
}
export interface KeyboardInputFrame {
  readonly raw: VehicleCommand;
  readonly held: Readonly<Record<KeyboardDriveAction, boolean>>;
  readonly command: VehicleCommand;
  readonly mappingVersion: '025-keyboard-v1';
  readonly controlPreferencesVersion: number;
  readonly appliedPreferencesAtTick: number | null;
  readonly steeringFactor: number;
}
export interface KeyboardFilter extends KeyboardDrivePort {
  step(frame: {
    readonly tick: number;
    readonly dtSeconds: number;
    readonly speedMps: number;
  }): KeyboardInputFrame;
  replacePreferences(value: unknown, atTick: number): void;
  getStats(): {
    readonly tick: number;
    readonly heldKeys: number;
    readonly retainedFrames: 0;
    readonly pendingPreferences: boolean;
    readonly disposed: boolean;
  };
  dispose(): void;
}

/** One PLAYER input owner; event handlers change bits, only authoritative60Hz ticks advance ramps. */
export function createKeyboardFilter(
  context: ContractContext,
  vehicleId: string,
  value: unknown,
  initialTick = 0,
): KeyboardFilter {
  const world = Object.freeze(readContext(fields(context, contextFields)));
  const id = text(vehicleId);
  requireContract(id.length <= 256 && world.sessionId.length <= 256, 'Keyboard identity capacity');
  let preferences = parseControlPreferences(value),
    rates = mapKeyboardRates(preferences);
  let currentTick = tick(initialTick),
    disposed = false;
  let throttle = 0,
    brake = 0,
    steering = 0;
  let pending: { preferences: ControlPreferences; atTick: number } | null = null;
  const held = Object.fromEntries(keyboardDriveActions.map((action) => [action, false])) as Record<
    KeyboardDriveAction,
    boolean
  >;
  function active() {
    if (disposed) throw new Error('Keyboard filter disposed');
  }
  function clear() {
    for (const action of keyboardDriveActions) held[action] = false;
    throttle = 0;
    brake = 0;
    steering = 0;
  }
  const approach = (previous: number, target: number, delta: number) =>
    previous < target ? Math.min(previous + delta, target) : Math.max(previous - delta, target);
  return Object.freeze({
    setAction(action: KeyboardDriveAction, pressed: boolean) {
      active();
      const key = choice(action, keyboardDriveActions);
      held[key] = boolean(pressed);
    },
    clear() {
      active();
      clear();
    },
    replacePreferences(candidate: unknown, atTick: number) {
      active();
      const next = parseControlPreferences(candidate);
      mapKeyboardRates(next);
      const boundary = tick(atTick);
      requireContract(boundary === currentTick + 1, 'Preferences must apply at next physical tick');
      requireContract(!pending, 'Preferences already pending');
      requireContract(next.version >= preferences.version, 'Stale keyboard preferences');
      const changed =
        JSON.stringify({ ...next, version: 0 }) !== JSON.stringify({ ...preferences, version: 0 });
      requireContract(
        !changed || next.version > preferences.version,
        'Changed keyboard preferences require newer version',
      );
      if (JSON.stringify(next) === JSON.stringify(preferences)) return;
      pending = { preferences: next, atTick: boundary };
      clear();
    },
    step(frame: Parameters<KeyboardFilter['step']>[0]) {
      active();
      const data = fields(frame, ['tick', 'dtSeconds', 'speedMps']);
      const nextTick = tick(data.tick);
      requireContract(nextTick === currentTick + 1, 'Keyboard tick must be next physical tick');
      const dt = number(data.dtSeconds, 1 / KEYBOARD_MAPPING.hz, 1 / KEYBOARD_MAPPING.hz);
      const speed = number(data.speedMps);
      let appliedPreferencesAtTick: number | null = null;
      if (pending) {
        preferences = pending.preferences;
        rates = mapKeyboardRates(preferences);
        appliedPreferencesAtTick = pending.atTick;
        pending = null;
        clear();
      }
      const raw: VehicleCommand = Object.freeze({
        ...world,
        vehicleId: id,
        tick: nextTick,
        source: 'PLAYER',
        throttle: held.throttle ? 1 : 0,
        brake: held.brake ? 1 : 0,
        steering: Number(held.steerRight) - Number(held.steerLeft),
        handbrake: held.handbrake,
        turnSignal: held.signalLeft
          ? held.signalRight
            ? 'HAZARD'
            : 'LEFT'
          : held.signalRight
            ? 'RIGHT'
            : 'OFF',
      });
      throttle =
        raw.throttle && !raw.brake && !raw.handbrake
          ? approach(throttle, 1, rates.throttleRisePerSecond * dt)
          : 0;
      brake = raw.brake ? approach(brake, 1, rates.brakeRisePerSecond * dt) : 0;
      const steeringFactor = keyboardSteeringFactor(rates, speed);
      const target = raw.steering * steeringFactor;
      // Apply a reduced high-speed envelope immediately; never retain yesterday's wider turn.
      steering = Math.max(-steeringFactor, Math.min(steeringFactor, steering));
      const returning = target === 0 || steering * target < 0;
      steering = approach(
        steering,
        target,
        (returning ? rates.steeringReturnPerSecond : rates.steeringRisePerSecond) * dt,
      );
      const command: VehicleCommand = Object.freeze({ ...raw, throttle, brake, steering });
      currentTick = nextTick;
      return Object.freeze({
        raw,
        held: Object.freeze({ ...held }),
        command,
        mappingVersion: KEYBOARD_MAPPING.version,
        controlPreferencesVersion: preferences.version,
        appliedPreferencesAtTick,
        steeringFactor,
      });
    },
    getStats() {
      return Object.freeze({
        tick: currentTick,
        heldKeys: keyboardDriveActions.filter((action) => held[action]).length,
        retainedFrames: 0 as const,
        pendingPreferences: pending !== null,
        disposed,
      });
    },
    dispose() {
      if (disposed) return;
      clear();
      pending = null;
      disposed = true;
    },
  });
}
