import { createRapierProbe } from '../../src/vehicles/rapier';
import { createVehicleController } from '../../src/vehicles/controller';
import { VEHICLE_CLASSES } from '../../src/vehicles/vehicle-classes';
import { wheelLateralSpeedsMps } from '../../src/vehicles/wheel-slip';
import type { VehicleClassId } from '../../src/vehicles/vehicle-classes';
import type { RoadSurfaceId } from '../../src/vehicles/road-surfaces';
import type { VehicleCommand } from '../../src/vehicles/contracts';
import { CONTROLLER_CONTEXT, controllerCommand } from './controller-reference';
import { disposeAfterFailure } from './fixture-setup';

export const CALIBRATION_SCENARIOS = [
  { scenario: 'braking', speed: 10 },
  { scenario: 'braking', speed: 20 },
  { scenario: 'braking', speed: 30 },
  { scenario: 'turning', speed: 8 },
  { scenario: 'turning', speed: 20 },
  { scenario: 'lane-change', speed: 8 },
  { scenario: 'curb', speed: 10 },
  { scenario: 'two-cars', speed: 10 },
] as const;
export type CalibrationScenario = (typeof CALIBRATION_SCENARIOS)[number]['scenario'];

/** Composition fixture: the production controller alone advances the production native world. */
export async function calibrateController(
  classId: VehicleClassId,
  surface: RoadSurfaceId,
  scenario: CalibrationScenario,
  speed: number,
  source: VehicleCommand['source'],
) {
  const world = await createRapierProbe(undefined, surface);
  const controller = createVehicleController(CONTROLLER_CONTEXT, world, 0, {
    drivetrainVersion: '027-braking-reverse-v1',
  });
  let failed = false;
  let primary: unknown;
  try {
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
    if (scenario === 'curb')
      world.addNamedBox('curb', { x: 0, y: 0.09, z: 10 }, { x: 4, y: 0.09, z: 0.15 });
    if (scenario === 'two-cars') world.addClassCar('other', { x: 0, y: 0.8, z: 12 }, classId);
    // Reuse the026 settling protocol, geometry and speed initialization.
    for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
    const identity = world.bodyIdentity('car')!;
    controller.register(identity);
    world.setVelocity('car', { x: 0, y: 0, z: speed });
    const start = world.project('car');
    const steering =
      Math.atan(VEHICLE_CLASSES[classId].wheels.wheelbaseM / 17) /
      VEHICLE_CLASSES[classId].steeringRadians;
    const trace = [];
    let pathM = 0;
    let previous = start.position;
    let headingRad = 0;
    let previousHeading = 0;
    let maxWheelLateralMps = 0;
    let maxHeightM = start.position.y;
    let contactImpulseNs = 0;
    let contactTicks = 0;
    for (let tick = 1; tick <= (scenario === 'braking' ? 1800 : 180); tick++) {
      const command = {
        ...controllerCommand('car', tick, source, {
          throttle: scenario === 'braking' ? 0.4 : scenario === 'lane-change' ? 0.15 : 0,
          brake: scenario === 'braking' ? 1 : 0,
          steering:
            scenario === 'turning'
              ? steering
              : scenario === 'lane-change'
                ? tick <= 40
                  ? steering
                  : tick <= 80
                    ? -steering
                    : 0
                : 0,
          turnSignal: scenario === 'lane-change' ? 'RIGHT' : 'OFF',
        }),
        driveIntent: {
          version: '027-braking-reverse-v1' as const,
          direction: 'FORWARD' as const,
          shiftBrake: 1,
        },
      };
      const frame = controller.step(
        { tick, dtSeconds: 1 / 60 },
        [{ identity, command }],
        tick === 1 ? [{ identity, mode: source === 'PLAYER' ? 'MANUAL' : 'AUTO' }] : [],
        false,
      );
      const control = frame.controls[0];
      const { source: commandSource, ...effective } = control.command;
      if (commandSource !== source) throw new Error('Wrong command authority');
      const state = world.project('car');
      const contacts = world.readCollisionContacts();
      const impulses = contacts.contacts.reduce((sum, contact) => sum + contact.impulseNs, 0);
      contactImpulseNs += impulses;
      if (contacts.contacts.length) contactTicks++;
      pathM += Math.hypot(state.position.x - previous.x, state.position.z - previous.z);
      previous = state.position;
      const q = state.rotation;
      const heading = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
      headingRad += Math.atan2(
        Math.sin(heading - previousHeading),
        Math.cos(heading - previousHeading),
      );
      previousHeading = heading;
      maxWheelLateralMps = Math.max(maxWheelLateralMps, ...wheelLateralSpeedsMps(state));
      maxHeightM = Math.max(maxHeightM, state.position.y);
      trace.push({
        tick,
        effective,
        drivetrain: control.drivetrain,
        state,
        other: scenario === 'two-cars' ? world.project('other') : null,
        contacts,
      });
      if (scenario === 'braking' && state.speed < 0.1) break;
    }
    const final = world.project('car');
    const report = {
      classId,
      surface,
      scenario,
      speedMps: speed,
      source,
      start,
      final,
      ticks: trace.length,
      elapsedSeconds: trace.length / 60,
      pathM,
      displacementM: {
        x: final.position.x - start.position.x,
        z: final.position.z - start.position.z,
      },
      headingRad,
      achievedMeanRadiusM: Math.abs(headingRad) > 1e-6 ? pathM / Math.abs(headingRad) : null,
      geometricRadiusM: scenario === 'turning' ? 17 : null,
      maxWheelLateralMps,
      maxHeightM,
      contactImpulseNs,
      contactTicks,
      mechanics: world.readVehicleMechanics('car'),
      trace,
    };
    controller.dispose();
    world.dispose();
    let disposedReadRejected = false;
    try {
      world.readBody(identity);
    } catch {
      disposedReadRejected = true;
    }
    return {
      ...report,
      cleanup: {
        bodies: world.bodyResources(),
        collisions: world.collisionResources(),
        controllerVehicles: controller.getStats().vehicles,
        disposedReadRejected,
      },
    };
  } catch (error) {
    failed = true;
    primary = error;
    throw error;
  } finally {
    controller.dispose();
    disposeAfterFailure(world, failed, primary);
  }
}
