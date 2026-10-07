import { number, requireContract } from '../sessions';
import { parseControlPreferences } from './contracts';
import type { ControlPreferences } from './contracts';

/** Candidate bounds are measured by the025 calibration fixture; no vehicle mechanics are changed. */
export const KEYBOARD_MAPPING = Object.freeze({
  version: '025-keyboard-v1' as const,
  hz: 60,
  steeringRisePerSecond: Object.freeze([0.8, 3.2] as const),
  steeringReturnPerSecond: Object.freeze([1, 6] as const),
  throttleRisePerSecond: Object.freeze([1, 5] as const),
  brakeRisePerSecond: Object.freeze([2, 10] as const),
  attenuationSpeedMps: 35,
  minimumSteeringFactor: 0.2,
});

export interface KeyboardRates {
  readonly steeringRisePerSecond: number;
  readonly steeringReturnPerSecond: number;
  readonly throttleRisePerSecond: number;
  readonly brakeRisePerSecond: number;
  readonly speedAttenuation: number;
}

/** Never silently reinterpret009 saved provisional-v1 values. */
export function upgradeKeyboardControlPreferences(value: unknown): ControlPreferences {
  const previous = parseControlPreferences(value);
  if (previous.mappingVersion === KEYBOARD_MAPPING.version) return previous;
  return parseControlPreferences({
    ...previous,
    mappingVersion: KEYBOARD_MAPPING.version,
    version: previous.version + 1,
  });
}

export function mapKeyboardRates(value: unknown): KeyboardRates {
  const preferences = parseControlPreferences(value);
  requireContract(
    preferences.mappingVersion === KEYBOARD_MAPPING.version,
    'Explicit keyboard mapping upgrade required',
  );
  const interpolate = (slider: number, range: readonly [number, number]) =>
    range[0] + ((range[1] - range[0]) * slider) / 100;
  return Object.freeze({
    steeringRisePerSecond: interpolate(
      preferences.steeringSensitivity,
      KEYBOARD_MAPPING.steeringRisePerSecond,
    ),
    steeringReturnPerSecond: interpolate(
      preferences.returnRate,
      KEYBOARD_MAPPING.steeringReturnPerSecond,
    ),
    throttleRisePerSecond: interpolate(
      preferences.throttleRamp,
      KEYBOARD_MAPPING.throttleRisePerSecond,
    ),
    brakeRisePerSecond: interpolate(preferences.brakeRamp, KEYBOARD_MAPPING.brakeRisePerSecond),
    speedAttenuation: preferences.speedAttenuation / 100,
  });
}

export function keyboardSteeringFactor(rates: KeyboardRates, speedMps: number): number {
  const speed = number(speedMps);
  const ratio = Math.min(Math.abs(speed) / KEYBOARD_MAPPING.attenuationSpeedMps, 1);
  return 1 - rates.speedAttenuation * (1 - KEYBOARD_MAPPING.minimumSteeringFactor) * ratio * ratio;
}
