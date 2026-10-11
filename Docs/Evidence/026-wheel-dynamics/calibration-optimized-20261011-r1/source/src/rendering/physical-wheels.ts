import type { CarProjection } from '../vehicles';
import type { RenderVehiclePose } from './render-sync';
const NEUTRAL_WHEEL_ROTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
// Native snapshots already own frozen value records. Reuse those records without
// sharing mutable caller input; no pose history or native reference is retained.
function readonlyValue<T extends object>(value: T): Readonly<T> {
  return Object.isFrozen(value) ? value : Object.freeze({ ...value });
}
/** A pure read-only mapping. No clock, native body, commands, cache or synthetic wheel animation. */
export function projectPhysicalWheels(
  state: CarProjection,
  incarnation: string,
): RenderVehiclePose {
  return Object.freeze({
    vehicleId: state.id,
    incarnation,
    transform: Object.freeze({
      positionM: readonlyValue(state.position),
      rotationQuaternion: readonlyValue(state.rotation),
    }),
    wheels: Object.freeze(
      state.wheels.map((wheel) =>
        Object.freeze({
          wheelId: wheel.wheelId,
          transform: Object.freeze({
            positionM: readonlyValue(wheel.localPositionM),
            rotationQuaternion: NEUTRAL_WHEEL_ROTATION,
          }),
          steeringRad: wheel.steeringRad,
          spinRad: wheel.spinRad,
        }),
      ),
    ),
  });
}
