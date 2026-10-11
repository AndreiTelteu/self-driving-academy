import { CaptureLifetime } from './lifetime.mjs';
import { ports } from './browser-ports';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import type { VehicleClassId, RoadSurfaceId } from '../../../src/vehicles';
import { VEHICLE_CLASSES, wheelLateralSpeedsMps } from '../../../src/vehicles';

export async function calibrateWheels(
  classId: VehicleClassId,
  surface: RoadSurfaceId,
  speed: number,
  scenario: 'braking' | 'turning' | 'curb' | 'airborne',
) {
  const life = new CaptureLifetime(ports(() => !life.failed));
  let result: Record<string, unknown> | undefined;
  try {
    const world = await createRapierProbe(undefined, surface);
    life.own('calibration-world', () => world.dispose());
    life.readback('native-resources', () => {
      const resources = { bodies: world.bodyResources(), collisions: world.collisionResources() };
      if (
        resources.bodies.entities ||
        resources.bodies.subscriptions ||
        resources.collisions.colliders ||
        !resources.collisions.disposed
      )
        throw new Error('Calibration cleanup failed');
      return resources;
    });
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
    if (scenario === 'curb') world.addBox({ x: 0, y: 0.09, z: 10 }, { x: 4, y: 0.09, z: 0.15 });
    for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
    const mechanics = world.readVehicleMechanics('car');
    const settled = world.project('car');
    if (scenario === 'airborne') {
      const token = world.bodyIdentity('car')!;
      world.setPose(token, { ...world.readBody(token).transform, positionM: { x: 0, y: 3, z: 0 } });
    }
    world.setVelocity('car', { x: 0, y: 0, z: speed });
    const start = world.project('car').position;
    // Both classes receive the same geometric 17m radius, not a forced path.
    const steeringRadians = Math.atan(VEHICLE_CLASSES[classId].wheels.wheelbaseM / 17);
    const inputs = new Map([
      [
        'car',
        {
          throttle: 0,
          brake: scenario === 'braking' ? 1 : 0,
          steering:
            scenario === 'turning' ? steeringRadians / VEHICLE_CLASSES[classId].steeringRadians : 0,
        },
      ],
    ]);
    const curve = [];
    let maxLateralMps = 0,
      maxWheelLateralMps = 0,
      maxHeightM = settled.position.y,
      minContacts = 4,
      maxContacts = 0;
    let tick = 0;
    for (; tick < (scenario === 'braking' ? 1800 : 180); tick++) {
      world.step(inputs, false);
      const state = world.project('car'),
        q = state.rotation;
      const forwardX = 2 * (q.x * q.z + q.w * q.y),
        forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
      const lateralMps = Math.abs(state.velocity.x * forwardZ - state.velocity.z * forwardX);
      maxLateralMps = Math.max(maxLateralMps, lateralMps);
      const wheelLateralMps = wheelLateralSpeedsMps(state);
      maxWheelLateralMps = Math.max(maxWheelLateralMps, ...wheelLateralMps);
      maxHeightM = Math.max(maxHeightM, state.position.y);
      minContacts = Math.min(minContacts, state.wheelContacts);
      maxContacts = Math.max(maxContacts, state.wheelContacts);
      if (tick % 6 === 0)
        curve.push({
          tick: tick + 1,
          positionM: state.position,
          speedMps: state.speed,
          lateralMps,
          wheels: state.wheels,
          wheelLateralMps,
        });
      if (scenario === 'braking' && state.speed < 0.1) break;
    }
    const final = world.project('car');
    result = {
      classId,
      surface,
      speedMps: speed,
      scenario,
      mechanics,
      geometricRadiusM: 17,
      steeringRadians,
      settled,
      ticks: tick + 1,
      stopped: final.speed < 0.1,
      brakingDistanceM: final.position.z - start.z,
      maxLateralMps,
      maxWheelLateralMps,
      maxHeightM,
      minContacts,
      maxContacts,
      final,
      curve,
    };
  } catch (error) {
    life.fail('calibration', error);
  } finally {
    const readbacks = await life.teardown();
    if (result) Object.assign(result, { readbacks, lifetime: life.snapshot() });
  }
  if (life.failed || !result) throw new Error(JSON.stringify(life.snapshot()));
  return result;
}
