import type { ContractContext } from '../sessions';
import { mapKeyboardRates, parseControlPreferences } from '../settings';
import { createKeyboardFilter } from './keyboard-filter';
import type { KeyboardFilter, KeyboardInputFrame, KeyboardDriveAction } from './keyboard-filter';
import { DRIVETRAIN_LIMITS } from './drivetrain';
import type { DriveIntent } from './drivetrain';

export interface BrakingReverseKeyboardFrame extends KeyboardInputFrame {
  readonly drivetrainVersion: typeof DRIVETRAIN_LIMITS.version;
}
export interface BrakingReverseKeyboardFilter extends Omit<KeyboardFilter, 'step'> {
  step(frame: Parameters<KeyboardFilter['step']>[0]): BrakingReverseKeyboardFrame;
}
/** Explicit027 convenience adapter: old025 raw S remains braking evidence, intent is separate. */
export function createBrakingReverseKeyboardFilter(
  context: ContractContext,
  vehicleId: string,
  value: unknown,
  initialTick = 0,
): BrakingReverseKeyboardFilter {
  const base = createKeyboardFilter(context, vehicleId, value, initialTick);
  let rates = mapKeyboardRates(value),
    pendingRates: ReturnType<typeof mapKeyboardRates> | null = null;
  let reverseThrottle = 0,
    shiftBrake = 0,
    previousDirection: DriveIntent['direction'] = 'NONE';
  const reset = () => {
    reverseThrottle = 0;
    shiftBrake = 0;
    previousDirection = 'NONE';
  };
  return Object.freeze({
    setAction(action: KeyboardDriveAction, pressed: boolean) {
      base.setAction(action, pressed);
    },
    clear() {
      base.clear();
      reset();
    },
    replacePreferences(candidate: unknown, atTick: number) {
      const validated = parseControlPreferences(candidate),
        next = mapKeyboardRates(validated);
      base.replacePreferences(validated, atTick);
      if (base.getStats().pendingPreferences) {
        pendingRates = next;
        reset();
      }
    },
    step(frame: Parameters<KeyboardFilter['step']>[0]) {
      const input = base.step(frame);
      if (input.appliedPreferencesAtTick !== null && pendingRates) {
        rates = pendingRates;
        pendingRates = null;
        reset();
      }
      const direction: DriveIntent['direction'] = input.held.handbrake
        ? 'NONE'
        : input.held.brake && !input.held.throttle
          ? 'REVERSE'
          : input.held.throttle && !input.held.brake
            ? 'FORWARD'
            : 'NONE';
      if (direction !== previousDirection) {
        reverseThrottle = 0;
        shiftBrake = 0;
      }
      reverseThrottle =
        direction === 'REVERSE'
          ? Math.min(1, reverseThrottle + rates.throttleRisePerSecond / DRIVETRAIN_LIMITS.hz)
          : 0;
      shiftBrake =
        direction !== 'NONE'
          ? Math.min(1, shiftBrake + rates.brakeRisePerSecond / DRIVETRAIN_LIMITS.hz)
          : 0;
      previousDirection = direction;
      const command = Object.freeze({
        ...input.command,
        throttle: direction === 'REVERSE' ? reverseThrottle : input.command.throttle,
        brake: direction === 'REVERSE' ? 0 : input.command.brake,
        driveIntent: Object.freeze({ version: DRIVETRAIN_LIMITS.version, direction, shiftBrake }),
      });
      return Object.freeze({ ...input, command, drivetrainVersion: DRIVETRAIN_LIMITS.version });
    },
    getStats() {
      return base.getStats();
    },
    dispose() {
      base.dispose();
      reset();
      pendingRates = null;
    },
  });
}
