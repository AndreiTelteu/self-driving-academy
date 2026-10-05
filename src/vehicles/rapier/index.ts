import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS_CONFIG, SEDAN } from '../physics';
import type { CarTuning, PhysicsInput, PhysicsProbe, PhysicsVector } from '../physics';

let initialized: Promise<void> | undefined;
let activeWorlds = 0;
const zero = Object.freeze({ throttle: 0, brake: 0, steering: 0 });
function finite(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError('Invalid physics value');
}
function vector(v: PhysicsVector) {
  for (const k of ['x', 'y', 'z'] as const) finite(v[k], -10000, 10000);
}

/** One world owns every admitted body; visibility/FPS cannot change solver, CCD or dt. */
export async function createRapierProbe(
  clock: () => number = () => performance.now(),
): Promise<PhysicsProbe> {
  await (initialized ??= RAPIER.init());
  if (activeWorlds >= PHYSICS_CONFIG.worlds)
    throw new RangeError('Physics world admission capacity');
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  activeWorlds++;
  world.timestep = 1 / PHYSICS_CONFIG.hz;
  world.numSolverIterations = PHYSICS_CONFIG.solverIterations;
  world.maxCcdSubsteps = PHYSICS_CONFIG.ccdSubsteps;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0).setFriction(0.8),
  );
  const cars = new Map<
    string,
    {
      body: RAPIER.RigidBody;
      controller: RAPIER.DynamicRayCastVehicleController;
      tuning: CarTuning;
    }
  >();
  const dynamicColliders: RAPIER.Collider[] = [];
  let obstacles = 0,
    disposed = false;
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const assertAlive = () => {
    if (disposed) throw new Error('Physics world disposed');
  };
  const car = (id: string) => {
    assertAlive();
    const item = cars.get(id);
    if (!item) throw new Error('Unknown vehicle');
    return item;
  };
  const admit = (body: boolean) => {
    assertAlive();
    if (
      world.colliders.len() >= PHYSICS_CONFIG.colliders ||
      (body && world.bodies.len() >= PHYSICS_CONFIG.bodies)
    )
      throw new RangeError('Physics admission capacity');
  };
  const snapshot = (id: string) => {
    const { body, controller } = car(id);
    const v = body.linvel();
    return Object.freeze({
      id,
      position: Object.freeze(body.translation()),
      rotation: Object.freeze(body.rotation()),
      velocity: Object.freeze(v),
      speed: Math.hypot(v.x, v.z),
      suspension: Object.freeze(
        Array.from({ length: 4 }, (_, i) => controller.wheelSuspensionLength(i) ?? 0),
      ),
      wheelContacts: [0, 1, 2, 3].filter((i) => controller.wheelIsInContact(i)).length,
    });
  };
  return {
    addCar(id, position, tuning = SEDAN) {
      admit(true);
      vector(position);
      if (!id || cars.has(id) || cars.size >= PHYSICS_CONFIG.vehicles)
        throw new RangeError('Vehicle identity/capacity');
      finite(tuning.massKg, 600, 4000);
      finite(tuning.grip, 0.1, 4);
      finite(tuning.brakeAcceleration, 1, 12);
      finite(tuning.engineForceN, 0, 20000);
      finite(tuning.steeringRadians, 0.05, 0.7);
      finite(tuning.suspensionStiffness, 10, 100);
      const config = Object.freeze({ ...tuning });
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(position.x, position.y, position.z)
          .setCcdEnabled(true)
          .setLinearDamping(0.015)
          .setAngularDamping(0.3),
      );
      dynamicColliders.push(
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.85, 0.3, 2)
            .setMass(config.massKg)
            .setFriction(0.5)
            .setRestitution(0),
          body,
        ),
      );
      const controller = world.createVehicleController(body);
      controller.indexUpAxis = 1;
      controller.setIndexForwardAxis = 2;
      for (const z of [1.35, -1.35])
        for (const x of [-0.9, 0.9]) {
          const i = controller.numWheels();
          controller.addWheel(
            { x, y: -0.15, z },
            { x: 0, y: -1, z: 0 },
            { x: -1, y: 0, z: 0 },
            0.35,
            0.32,
          );
          controller.setWheelSuspensionStiffness(i, config.suspensionStiffness);
          controller.setWheelSuspensionCompression(i, 4.4);
          controller.setWheelSuspensionRelaxation(i, 5.2);
          controller.setWheelMaxSuspensionTravel(i, 0.2);
          controller.setWheelMaxSuspensionForce(i, config.massKg * 9.81);
          controller.setWheelFrictionSlip(i, config.grip);
          controller.setWheelSideFrictionStiffness(i, 1);
        }
      cars.set(id, { body, controller, tuning: config });
    },
    addBox(position, halfSize, dynamic = false) {
      admit(dynamic);
      vector(position);
      vector(halfSize);
      for (const k of ['x', 'y', 'z'] as const) finite(halfSize[k], 0.01, 500);
      if (obstacles >= PHYSICS_CONFIG.obstacles) throw new RangeError('Obstacle capacity');
      const desc = RAPIER.ColliderDesc.cuboid(halfSize.x, halfSize.y, halfSize.z)
        .setFriction(0.8)
        .setRestitution(0);
      if (dynamic) {
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z)
            .setCcdEnabled(true),
        );
        dynamicColliders.push(world.createCollider(desc.setMass(40), body));
      } else world.createCollider(desc.setTranslation(position.x, position.y, position.z));
      obstacles++;
    },
    setVelocity(id, velocity) {
      vector(velocity);
      car(id).body.setLinvel(velocity, true);
    },
    step(inputs, measure = true) {
      assertAlive();
      const now = measure ? clock : () => 0;
      const start = now();
      // Validate the entire command batch before mutating any body.
      for (const [id, input] of inputs) {
        car(id);
        finite(input.throttle, -1, 1);
        finite(input.brake, 0, 1);
        finite(input.steering, -1, 1);
      }
      let bridgeCalls = 0;
      for (const [id, { body, controller, tuning }] of cars) {
        const input: PhysicsInput = inputs.get(id) ?? zero;
        if (input.throttle || input.brake || input.steering) body.wakeUp();
        for (let i = 0; i < 4; i++) {
          controller.setWheelEngineForce(
            i,
            i >= 2 ? (input.throttle * tuning.engineForceN) / 2 : 0,
          );
          controller.setWheelBrake(
            i,
            (input.brake * tuning.massKg * tuning.brakeAcceleration) / PHYSICS_CONFIG.hz / 4,
          );
          controller.setWheelSteering(i, i < 2 ? input.steering * tuning.steeringRadians : 0);
          bridgeCalls += 3;
        }
        // No dynamic-body exclusion: wheels may contact another car or debris.
        controller.updateVehicle(world.timestep, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      }
      const controllerEnd = now();
      world.step();
      const stepEnd = now();
      for (const { body } of cars.values()) {
        const p = body.translation();
        ray.origin.x = p.x;
        ray.origin.y = p.y;
        ray.origin.z = p.z;
        world.castRay(
          ray,
          5,
          true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          body,
        );
      }
      const queryEnd = now();
      // Separate representative read-back crossings, excluding controllers/queries and solver.
      for (const { body, controller } of cars.values()) {
        body.translation();
        body.rotation();
        body.linvel();
        for (let i = 0; i < 4; i++) {
          controller.wheelSuspensionLength(i);
          controller.wheelIsInContact(i);
        }
        bridgeCalls += 11;
      }
      const end = now();
      return {
        controllerMs: controllerEnd - start,
        stepMs: stepEnd - controllerEnd,
        queryMs: queryEnd - stepEnd,
        bridgeMs: end - queryEnd,
        totalMs: end - start,
        queryCount: cars.size,
        bridgeCalls,
      };
    },
    project: snapshot,
    contacts() {
      assertAlive();
      let count = 0;
      for (const collider of dynamicColliders)
        world.contactPairsWith(collider, (other) => {
          if (other.handle < collider.handle && other.parent() !== null) return;
          world.contactPair(collider, other, (manifold) => {
            count += manifold.numSolverContacts();
          });
        });
      return count;
    },
    counts() {
      assertAlive();
      return { vehicles: cars.size, bodies: world.bodies.len(), colliders: world.colliders.len() };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { controller } of cars.values()) world.removeVehicleController(controller);
      cars.clear();
      dynamicColliders.length = 0;
      world.free();
      activeWorlds--;
    },
  };
}
