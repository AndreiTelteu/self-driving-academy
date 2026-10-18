/** Independent preproduction scalar oracle. No production longitudinal imports. */
import { cruiseProfile, cruiseValues } from './cruise-targets-reference';
export const longitudinalKeys = [
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
] as const;
export const longitudinalValues = [
  [1.5, 2.5, 4, 0.2],
  [4, 0.3, 1, 1.5],
] as const;
export function longitudinalProfile(values: readonly number[] = longitudinalValues[0], preset = 0) {
  const cruise = cruiseProfile(cruiseValues[preset]);
  return {
    ...cruise,
    profileId: '047-fixture',
    versionId: preset ? '047-risky-v1' : '047-normal-v1',
    engineVersion: 'academy-engine-compatible-v1',
    parameters: {
      ...cruise.parameters,
      ...Object.fromEntries(longitudinalKeys.map((key, i) => [key, values[i]])),
    },
    unitsByParameter: {
      ...cruise.unitsByParameter,
      ...Object.fromEntries(
        longitudinalKeys.map((key, i) => [key, i === 3 ? 's' : i === 2 ? 'm/s³' : 'm/s²']),
      ),
    },
    provenanceByParameter: {
      ...cruise.provenanceByParameter,
      ...Object.fromEntries(longitudinalKeys.map((key) => [key, 'BASE'])),
    },
    evidenceByParameter: {
      ...cruise.evidenceByParameter,
      ...Object.fromEntries(longitudinalKeys.map((key) => [key, null])),
    },
  };
}
export interface ReferenceLongitudinalState {
  acceleration: number;
  brakeEventTick: number | null;
}
export function referenceLongitudinal(
  state: ReferenceLongitudinalState,
  values: readonly number[],
  speed: number,
  target: number,
  tick: number,
  mass: number,
  power: number,
  force: number,
  nominalBrake: number,
) {
  const error = target - Math.max(0, speed);
  const braking = speed < -0.1 || error < -0.1;
  const event = braking ? (state.brakeEventTick ?? tick) : null;
  const reactionTicks = Math.ceil(values[3] * 60);
  let acceleration = braking
    ? tick - event! < reactionTicks
      ? Math.max(0, state.acceleration)
      : -Math.min(values[1], Math.abs(error) * 2 || values[1])
    : error > 0.1
      ? Math.min(values[0], error * 2)
      : 0;
  // The catalog's acceleration_jerk limits increases, including recovery from braking.
  // braking_jerk is a separate unsupported extension.
  if (acceleration > state.acceleration)
    acceleration = Math.min(acceleration, state.acceleration + values[2] / 60);
  const availableForce = speed === 0 ? force : Math.min(force, power / Math.abs(speed));
  return {
    state: { acceleration, brakeEventTick: event },
    throttle: speed < -0.1 ? 0 : Math.min(1, (Math.max(0, acceleration) * mass) / availableForce),
    brake: Math.min(1, Math.max(0, -acceleration) / nominalBrake),
    accelerationMps2: acceleration,
    brakeEventTick: event,
    phase:
      braking && tick - event! < reactionTicks
        ? 'REACTION_DELAY'
        : braking
          ? 'BRAKING'
          : 'TRACKING',
  };
}
