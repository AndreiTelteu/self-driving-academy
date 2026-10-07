import { createRapierProbe } from '../../src/vehicles/rapier';
import type { CarTuning, PhysicsInput } from '../../src/vehicles/physics';

/** Same flat ground, settling, inputs and initial velocities for every configuration. */
export async function measureVehicle(tuning: CarTuning) {
  const result = { accelerationSpeedMps: 0, brakingDistanceM: 0, turnXM: 0, turnZM: 0 };
  for (const scenario of ['acceleration', 'braking', 'turning'] as const) {
    const world = await createRapierProbe();
    try {
      world.addCar('car', { x: 0, y: 0.8, z: 0 }, tuning);
      for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
      if (scenario !== 'acceleration')
        world.setVelocity('car', { x: 0, y: 0, z: scenario === 'braking' ? 20 : 8 });
      const origin = world.project('car').position.z;
      const input: PhysicsInput = {
        throttle: scenario === 'acceleration' ? 1 : 0,
        brake: scenario === 'braking' ? 1 : 0,
        steering: scenario === 'turning' ? 0.35 : 0,
      };
      const inputs = new Map([['car', input]]);
      for (let tick = 0; tick < (scenario === 'braking' ? 1800 : 180); tick++) {
        world.step(inputs, false);
        if (scenario === 'braking' && world.project('car').speed < 0.1) break;
      }
      const state = world.project('car');
      if (scenario === 'acceleration') result.accelerationSpeedMps = state.speed;
      if (scenario === 'braking') {
        if (state.speed >= 0.1) throw new Error('Vehicle did not stop');
        result.brakingDistanceM = state.position.z - origin;
      }
      if (scenario === 'turning') {
        result.turnXM = state.position.x;
        result.turnZM = state.position.z - origin;
      }
    } finally {
      world.dispose();
    }
  }
  return result;
}
