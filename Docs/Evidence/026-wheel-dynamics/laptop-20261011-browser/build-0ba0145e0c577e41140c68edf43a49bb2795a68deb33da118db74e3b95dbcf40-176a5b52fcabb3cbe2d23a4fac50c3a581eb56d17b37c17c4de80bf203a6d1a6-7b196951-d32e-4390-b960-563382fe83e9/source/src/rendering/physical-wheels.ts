import type { CarProjection } from '../vehicles';
import type { RenderVehiclePose } from './render-sync';
/** A pure read-only mapping. No clock, native body, commands, cache or synthetic wheel animation. */
export function projectPhysicalWheels(
  state: CarProjection,
  incarnation: string,
): RenderVehiclePose {
  return Object.freeze({
    vehicleId: state.id,
    incarnation,
    transform: Object.freeze({
      positionM: Object.freeze({ ...state.position }),
      rotationQuaternion: Object.freeze({ ...state.rotation }),
    }),
    wheels: Object.freeze(
      state.wheels.map((wheel) =>
        Object.freeze({
          wheelId: wheel.wheelId,
          transform: Object.freeze({
            positionM: Object.freeze({ ...wheel.localPositionM }),
            rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
          }),
          steeringRad: wheel.steeringRad,
          spinRad: wheel.spinRad,
        }),
      ),
    ),
  });
}
