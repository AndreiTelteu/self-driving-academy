import { createRapierProbe } from '../../src/vehicles/rapier';
import { createVehicleController } from '../../src/vehicles/controller';
import { compileFollowingProfile, evaluateFollowingTarget } from '../../src/autonomy/following';
import { createLongitudinalController } from '../../src/autonomy/longitudinal-control';
import type { FollowingTarget } from '../../src/autonomy/following';
import { followingProfile } from './following-reference';
import { createFollowingTargetFixture } from './following-target-fixture';

/** Short actual Rapier/024 queue episode. Leader is a stationary physical car, not a wall. */
export async function createFollowingDrivingEpisode(classId: 'sedan' | 'compact' = 'sedan') {
  const world = await createRapierProbe(),
    scope = { sessionId: '048-driving', worldEpoch: 0 },
    identityScope = { schemaVersion: 1 as const, units: 'SI' as const, ...scope };
  let fixture: ReturnType<typeof createFollowingTargetFixture> | undefined,
    controller: ReturnType<typeof createVehicleController> | undefined,
    policy: ReturnType<typeof createLongitudinalController> | undefined;
  try {
    const profile = compileFollowingProfile(followingProfile());
    // Obtain authored044 lane geometry before body identity exists.
    const layout = createFollowingTargetFixture(
        profile.longitudinal.cruise,
        { id: 'car', incarnation: 1 },
        scope,
      ),
      start = layout.position(20),
      leaderPosition = layout.position(40),
      yaw = layout.yaw;
    layout.dispose();
    world.addClassCar('car', start, classId);
    world.addClassCar('leader', leaderPosition, 'sedan');
    const car = world.bodyIdentity('car')!,
      leader = world.bodyIdentity('leader')!;
    const rotationQuaternion = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    for (const token of [car, leader]) {
      const body = world.readBody(token);
      world.setPose(token, { positionM: body.transform.positionM, rotationQuaternion });
    }
    for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
    const actor = { id: 'car', incarnation: car.generation };
    fixture = createFollowingTargetFixture(profile.longitudinal.cruise, actor, scope);
    controller = createVehicleController(identityScope, world);
    controller.register(car);
    controller.register(leader);
    policy = createLongitudinalController(scope);
    policy.setActors([actor], scope);
    world.setVelocity('car', { x: 5 * Math.sin(yaw), y: 0, z: 5 * Math.cos(yaw) });
    const origin = fixture.position(0),
      rows: {
        tick: number;
        speedMps: number;
        gapM: number;
        targetMps: number;
        desiredGapM: number | null;
        reason: string;
        position: { x: number; y: number; z: number };
        brake: number;
        throttle: number;
      }[] = [];
    let tick = 0,
      target: FollowingTarget;
    function step() {
      if (tick >= 600) throw new Error('Following episode complete');
      tick++;
      const body = world.readBody(car),
        leaderBody = world.readBody(leader),
        v = body.velocityMps;
      const speed = v.x * Math.sin(yaw) + v.z * Math.cos(yaw),
        leaderSpeed = Math.max(
          0,
          leaderBody.velocityMps.x * Math.sin(yaw) + leaderBody.velocityMps.z * Math.cos(yaw),
        );
      const distance =
        (body.transform.positionM.x - origin.x) * Math.sin(yaw) +
        (body.transform.positionM.z - origin.z) * Math.cos(yaw);
      const gap = Math.max(
        0,
        (leaderBody.transform.positionM.x - body.transform.positionM.x) * Math.sin(yaw) +
          (leaderBody.transform.positionM.z - body.transform.positionM.z) * Math.cos(yaw) -
          2.4,
      );
      if (tick % 6 === 1) {
        const input = fixture!.input(
          tick,
          speed,
          gap,
          leaderSpeed,
          'leader',
          leader.generation,
          distance,
        );
        target = evaluateFollowingTarget({
          cruiseInput: {
            ...input.cruiseInput,
            mechanics: { ...input.cruiseInput.mechanics, classId },
          },
          roadContext: input.roadContext,
          observation: input.observation,
          profile,
        });
      }
      const result = policy!.step({
        ...scope,
        actor,
        tick,
        authority: 'AUTO',
        profile: profile.longitudinal,
        target: target.target,
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
        [
          { identity: car, command: result.command },
          {
            identity: leader,
            command: { ...result.command, vehicleId: 'leader', throttle: 0, brake: 1 },
          },
        ],
        [],
        false,
      );
      const physical = world.project('car');
      for (const value of [...Object.values(physical.position), speed, gap, result.command.brake])
        if (!Number.isFinite(value)) throw new Error('Nonfinite following driving');
      const row = {
        tick,
        speedMps: speed,
        gapM: gap,
        targetMps: target.target.targetMps,
        desiredGapM: target.desiredGapM,
        reason: target.reason,
        position: physical.position,
        brake: result.command.brake,
        throttle: result.command.throttle,
      };
      rows.push(row);
      return row;
    }
    return {
      step,
      get complete() {
        return tick >= 600;
      },
      visual() {
        return [world.projectVisual!('car'), world.projectVisual!('leader')];
      },
      result() {
        return { classId, ticks: tick, rows };
      },
      dispose() {
        const failures: unknown[] = [];
        for (const owner of [fixture, policy, controller, world])
          try {
            owner?.dispose();
          } catch (error) {
            failures.push(error);
          }
        if (failures.length) throw new AggregateError(failures, 'Following cleanup');
        return {
          body: world.bodyResources(),
          policy: policy!.getStats(),
          controller: controller!.getStats(),
        };
      },
    };
  } catch (error) {
    const failures: unknown[] = [error];
    for (const owner of [fixture, policy, controller, world])
      try {
        owner?.dispose();
      } catch (cleanup) {
        failures.push(cleanup);
      }
    throw new AggregateError(failures, 'Following setup failed');
  }
}
