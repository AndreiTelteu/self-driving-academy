import { createRapierProbe } from '../../src/vehicles/rapier';
import { createVehicleController } from '../../src/vehicles/controller';
import {
  compileLongitudinalProfile,
  createLongitudinalController,
} from '../../src/autonomy/longitudinal-control';
import type { CruiseTarget } from '../../src/autonomy/cruise-targets';
import type { RoadSurfaceId } from '../../src/vehicles/road-surfaces';
import type { VehicleCommand } from '../../src/vehicles/contracts';
import type { PhysicsVector } from '../../src/vehicles/physics';
import { longitudinalProfile, longitudinalValues } from './longitudinal-reference';
import { createLongitudinalTargetFixture } from './longitudinal-target-fixture';

export const DRIVING_LIMITS = Object.freeze({ ticks: 1800, initialSpeedMps: 15, obstacleM: 75 });
export interface LongitudinalDrivingRow {
  tick: number;
  speedMps: number;
  totalSpeedMps: number;
  command: VehicleCommand;
  accelerationMps2: number;
  phase: string;
  reason: string;
  brakeEventTick: number | null;
  reactionTicks: number;
  targetDecisionTick: number;
  position: PhysicsVector;
  velocity: PhysicsVector;
  rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
  obstacleImpulseNs: number;
}
export async function createLongitudinalDrivingEpisode(
  classId: 'sedan' | 'compact',
  surface: RoadSurfaceId,
  risky: boolean,
  obstacle = true,
  stopping = true,
) {
  const world = await createRapierProbe(undefined, surface);
  const scope = { sessionId: '047-driving', worldEpoch: 0 },
    context = { schemaVersion: 1 as const, units: 'SI' as const, ...scope };
  let controller: ReturnType<typeof createVehicleController> | undefined,
    policy: ReturnType<typeof createLongitudinalController> | undefined,
    targets: ReturnType<typeof createLongitudinalTargetFixture> | undefined;
  try {
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
    if (obstacle)
      world.addNamedBox(
        'obstacle',
        { x: 0, y: 1, z: DRIVING_LIMITS.obstacleM },
        { x: 5, y: 1, z: 0.25 },
      );
    for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
    const identity = world.bodyIdentity('car')!,
      actor = { id: 'car', incarnation: identity.generation };
    controller = createVehicleController(context, world);
    controller.register(identity);
    policy = createLongitudinalController(scope);
    policy.setActors([actor], scope);
    const profile = compileLongitudinalProfile(
      longitudinalProfile(longitudinalValues[risky ? 1 : 0], risky ? 1 : 0),
    );
    targets = createLongitudinalTargetFixture(profile.cruise, actor, scope);
    world.setVelocity('car', { x: 0, y: 0, z: stopping ? DRIVING_LIMITS.initialSpeedMps : 0 });
    const start = world.project('car'),
      trace: LongitudinalDrivingRow[] = [];
    let tick = 0,
      pathM = 0,
      previous = start.position,
      collisionImpulseNs = 0,
      complete = false;
    let target: CruiseTarget;
    function step() {
      if (complete || tick >= DRIVING_LIMITS.ticks) throw new Error('Driving episode complete');
      tick++;
      if (tick % 6 === 1) target = targets!.target(tick, stopping, classId, surface);
      const body = world.readBody(identity),
        q = body.transform.rotationQuaternion,
        v = body.velocityMps;
      const speed =
        v.x * 2 * (q.x * q.z + q.w * q.y) +
        v.y * 2 * (q.y * q.z - q.w * q.x) +
        v.z * (1 - 2 * (q.x * q.x + q.y * q.y));
      const realized = policy!.step({
        ...scope,
        actor,
        tick,
        authority: 'AUTO',
        profile,
        target,
        observation: {
          version: '047-observation-v1',
          units: 'SI',
          ...scope,
          actor,
          tick,
          longitudinalSpeedMps: speed,
          classId,
          classVersion: '023-mechanics-v1',
        },
      });
      controller!.step(
        { tick, dtSeconds: 1 / 60 },
        [{ identity, command: realized.command }],
        [],
        false,
      );
      const physical = world.project('car'),
        contacts = world.readCollisionContacts();
      for (const value of [
        ...Object.values(physical.position),
        ...Object.values(physical.velocity),
        ...Object.values(physical.rotation),
        realized.command.throttle,
        realized.command.brake,
        realized.accelerationMps2,
      ])
        if (!Number.isFinite(value)) throw new Error('Nonfinite047 physical/control state');
      const obstacleImpulse = contacts.contacts
        .filter((contact) => [contact.first.entityId, contact.second.entityId].includes('obstacle'))
        .reduce((sum, contact) => sum + contact.impulseNs, 0);
      collisionImpulseNs += obstacleImpulse;
      pathM += Math.hypot(physical.position.x - previous.x, physical.position.z - previous.z);
      previous = physical.position;
      const totalSpeed = Math.hypot(physical.velocity.x, physical.velocity.y, physical.velocity.z);
      complete = stopping
        ? (tick >= 30 && totalSpeed < 0.1) || tick === DRIVING_LIMITS.ticks
        : tick === 180;
      const row = {
        tick,
        speedMps: speed,
        totalSpeedMps: totalSpeed,
        command: realized.command,
        accelerationMps2: realized.accelerationMps2,
        phase: realized.phase,
        reason: realized.reason,
        brakeEventTick: realized.brakeEventTick,
        reactionTicks: realized.reactionTicks,
        targetDecisionTick: target.decisionTick,
        position: physical.position,
        velocity: physical.velocity,
        rotation: physical.rotation,
        obstacleImpulseNs: obstacleImpulse,
      };
      trace.push(row);
      return row;
    }
    return {
      step,
      get complete() {
        return complete;
      },
      visual() {
        return world.projectVisual!('car');
      },
      result() {
        return {
          classId,
          surface,
          risky,
          obstacle,
          initialSpeedMps: stopping ? 15 : 0,
          stopping,
          stimulusTick: 1,
          obstacleM: 75,
          ticks: tick,
          pathM,
          collisionImpulseNs,
          stopped: trace.at(-1)?.totalSpeedMps! < 0.1,
          mechanics: world.readVehicleMechanics('car'),
          trace,
        };
      },
      dispose() {
        const failures: unknown[] = [];
        for (const owned of [targets, policy, controller, world])
          try {
            owned!.dispose();
          } catch (error) {
            failures.push(error);
          }
        if (failures.length) throw new AggregateError(failures, '047 driving cleanup failed');
        return {
          body: world.bodyResources(),
          policy: policy!.getStats(),
          controller: controller!.getStats(),
        };
      },
    };
  } catch (error) {
    const failures: unknown[] = [error];
    for (const owned of [targets, policy, controller, world])
      try {
        owned?.dispose();
      } catch (cleanup) {
        failures.push(cleanup);
      }
    throw new AggregateError(failures, '047 driving setup failed');
  }
}
