import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS_CONFIG, SEDAN } from '../physics';
import type { CarTuning, PhysicsInput, PhysicsProbe, PhysicsVector } from '../physics';
import { copyBodyTransform, copyBodyVector } from '../body-port';
import type { BodyIdentity, BodyState } from '../body-port';
import { PhysicsBodyRegistry } from '../body-registry';
import { tractiveForceN, vehicleClass } from '../vehicle-classes';
import type { VehicleClassId } from '../vehicle-classes';
import { COLLISION_LIMITS, CollisionRegistry } from '../collision-port';
import type { CollisionContact, CollisionIdentity, CollisionBoxOptions } from '../collision-port';
import { boolean, fields, number, record, requireContract } from '../../sessions';
import { contextFields, readContext } from '../../sessions';
import type { ContractContext } from '../../sessions';
import type { PhysicsRecoveryPort } from '../recovery-port';
import { tick } from '../../sessions';
import type { WheelGeometry } from '../vehicle-classes';
import { recoveryIdentity, recoveryTransform } from '../recovery-port';
import type { RecoveryInspection, RecoveryNativeState, RecoveryPlacement } from '../recovery-port';
import { recoveryFootprintFits, requireRecoveryRoad } from '../recovery-road';

/** Private Rapier composition: every callback below belongs to the same probe, never game caller. */
function createNativeRecoveryPort(
  world: RAPIER.World,
  ground: RAPIER.Collider,
  context: ContractContext,
  ports: {
    guard<T>(work: () => T): T;
    current(identity: BodyIdentity): void;
    body(identity: BodyIdentity): RAPIER.RigidBody;
    wheels(identity: BodyIdentity): WheelGeometry;
    serial(): number;
    released(): void;
  },
): PhysicsRecoveryPort {
  const bound = Object.freeze(readContext(fields(context, contextFields)));
  requireContract(bound.sessionId.length <= 256, 'Recovery context capacity');
  let released = false;
  const live = () => requireContract(!released, 'Recovery port released');
  const state = (identity: BodyIdentity): RecoveryNativeState => {
    ports.current(identity);
    const body = ports.body(identity);
    return Object.freeze({
      identity,
      physicsStepSerial: ports.serial(),
      transform: copyBodyTransform({
        positionM: body.translation(),
        rotationQuaternion: body.rotation(),
      }),
      velocityMps: copyBodyVector(body.linvel()),
      angularVelocityRadS: copyBodyVector(body.angvel()),
    });
  };
  const requestData = (request: RecoveryPlacement) => {
    const d = fields(request, [
      'identity',
      'context',
      'expectedPhysicsSerial',
      'transform',
      'road',
    ]);
    const supplied = readContext(fields(d.context, contextFields));
    requireContract(JSON.stringify(supplied) === JSON.stringify(bound), 'Foreign recovery world');
    const identity = recoveryIdentity(d.identity),
      serial = tick(d.expectedPhysicsSerial);
    const pose = recoveryTransform(d.transform),
      road = requireRecoveryRoad(d.road as RecoveryPlacement['road']);
    ports.current(identity);
    requireContract(serial === ports.serial(), 'Recovery physics serial changed');
    return { identity, serial, pose, road };
  };
  const inspect = (d: ReturnType<typeof requestData>): RecoveryInspection => {
    world.propagateModifiedBodyPositionsToColliders();
    const wheels = ports.wheels(d.identity);
    const halfX = Math.max(0.85, wheels.trackM / 2 + wheels.radiusM);
    const halfZ = Math.max(2, wheels.wheelbaseM / 2 + wheels.radiusM);
    const tolerance = number(
      world.integrationParameters.normalizedAllowedLinearError *
        world.integrationParameters.lengthUnit,
      0,
    );
    const groundPosition = ground.translation(),
      groundRotation = ground.rotation(),
      groundShape = ground.shape;
    const groundValid =
      !ground.isSensor() &&
      ground.parent() === null &&
      groundShape instanceof RAPIER.Cuboid &&
      groundPosition.x === 0 &&
      groundPosition.y === -0.5 &&
      groundPosition.z === 0 &&
      groundRotation.x === 0 &&
      groundRotation.y === 0 &&
      groundRotation.z === 0 &&
      groundRotation.w === 1 &&
      groundShape.halfExtents.x === 500 &&
      groundShape.halfExtents.y === 0.5 &&
      groundShape.halfExtents.z === 500;
    const invalid =
      !groundValid ||
      !recoveryFootprintFits(d.road, d.pose, halfX, halfZ) ||
      d.pose.positionM.y - 0.3 < -tolerance ||
      d.pose.positionM.y - 0.15 - 0.35 - 0.2 - wheels.radiusM > tolerance;
    if (invalid)
      return Object.freeze({
        status: 'INVALID_SUPPORT',
        physicsStepSerial: ports.serial(),
        colliderCount: 0,
        blockingColliderHandle: null,
      });
    const bottom = -0.15 - 0.35 - 0.2 - wheels.radiusM,
      top = 0.3;
    const shape = new RAPIER.Cuboid(halfX, (top - bottom) / 2, halfZ);
    const centre = { ...d.pose.positionM, y: d.pose.positionM.y + (top + bottom) / 2 };
    let count = 0,
      blocking: number | null = null,
      failed = false,
      failure: unknown;
    world.forEachCollider((other) => {
      // Deferred errors keep borrowed native callback resources balanced.
      try {
        if (++count > PHYSICS_CONFIG.colliders) throw new RangeError('Recovery collider capacity');
        if (
          other.handle === ground.handle ||
          other.parent()?.handle === d.identity.handle ||
          other.isSensor()
        )
          return;
        // Retain original fresh finite native-position/rotation rejection even though
        // the public collider query reads its current geometry directly in native code.
        const p = other.translation();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))
          throw new RangeError('Invalid body vector');
        const q = other.rotation();
        if (
          !Number.isFinite(q.x) ||
          !Number.isFinite(q.y) ||
          !Number.isFinite(q.z) ||
          !Number.isFinite(q.w)
        )
          throw new Error('Invalid native collider rotation');
        if (other.intersectsShape(shape, centre, d.pose.rotationQuaternion) && blocking === null)
          blocking = other.handle;
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    });
    if (failed) throw failure;
    requireContract(count === world.colliders.len(), 'Incomplete recovery collider traversal');
    ports.current(d.identity);
    requireContract(ports.serial() === d.serial, 'Recovery native serial changed');
    return Object.freeze({
      status: blocking === null ? 'SAFE' : 'BLOCKED',
      physicsStepSerial: ports.serial(),
      colliderCount: count,
      blockingColliderHandle: blocking,
    });
  };
  return Object.freeze({
    readNative(identity: BodyIdentity) {
      return ports.guard(() => {
        live();
        recoveryIdentity(identity);
        return state(identity);
      });
    },
    inspectPlacement(request: RecoveryPlacement) {
      return ports.guard(() => {
        live();
        return inspect(requestData(request));
      });
    },
    applyPlacement(request: RecoveryPlacement) {
      return ports.guard(() => {
        live();
        const d = requestData(request),
          before = state(d.identity),
          inspection = inspect(d);
        if (inspection.status !== 'SAFE')
          return Object.freeze({
            inspection,
            before,
            after: before,
            attempted: 0,
            completed: 0,
            failure: null,
          });
        const body = ports.body(d.identity);
        let attempted = 0,
          completed = 0,
          failure: string | null = null;
        try {
          attempted++;
          body.setTranslation(d.pose.positionM, true);
          completed++;
          attempted++;
          body.setRotation(d.pose.rotationQuaternion, true);
          completed++;
          attempted++;
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          completed++;
          attempted++;
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          completed++;
          attempted++;
          world.propagateModifiedBodyPositionsToColliders();
          completed++;
        } catch (error) {
          failure =
            error instanceof Error
              ? error.name + ': ' + error.message.slice(0, 512)
              : 'Native setter threw';
        }
        let after: RecoveryNativeState | null = null;
        try {
          after = state(d.identity);
        } catch (error) {
          failure =
            (failure ? failure + '; ' : '') +
            (error instanceof Error ? error.name : 'Native readback threw');
        }
        return Object.freeze({ inspection, before, after, attempted, completed, failure });
      });
    },
    release() {
      if (released) return;
      ports.guard(() => {
        released = true;
        ports.released();
      });
    },
  });
}

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
  const ground = world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0).setFriction(0.8),
  );
  const cars = new Map<
    string,
    {
      body: RAPIER.RigidBody;
      controller: RAPIER.DynamicRayCastVehicleController;
      tuning: CarTuning;
      classId: VehicleClassId | null;
      mechanicsVersion: string;
      collider: RAPIER.Collider;
    }
  >();
  const dynamicColliders: RAPIER.Collider[] = [];
  const registry = new PhysicsBodyRegistry();
  const collisionRegistry = new CollisionRegistry();
  const namedBoxes = new Map<CollisionIdentity, RAPIER.Collider>();
  let collisionBusy = false;
  let physicsStepSerial = 0;
  let publication: object | undefined;
  let lastPublicationTick = -1;
  let obstacles = 0,
    disposed = false;
  let recoveryContext: ContractContext | null = null;
  let recoveryPort: PhysicsRecoveryPort | null = null;
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const assertAlive = () => {
    if (disposed) throw new Error('Physics world disposed');
  };
  const assertMutable = () => {
    assertAlive();
    if (collisionBusy) throw new Error('Native collision readback/validation is busy');
  };
  const car = (id: string) => {
    assertAlive();
    const item = cars.get(id);
    if (!item) throw new Error('Unknown vehicle');
    return item;
  };
  const admit = (body: boolean) => {
    assertMutable();
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
  const readBody = (identity: BodyIdentity): BodyState => {
    assertAlive();
    registry.assertCurrent(identity);
    const { body } = car(identity.entityId);
    return Object.freeze({
      identity,
      transform: copyBodyTransform({
        positionM: body.translation(),
        rotationQuaternion: body.rotation(),
      }),
      velocityMps: copyBodyVector(body.linvel()),
    });
  };
  const allocateBox = (
    position: PhysicsVector,
    halfSize: PhysicsVector,
    dynamic: boolean,
    sensor = false,
  ) => {
    const desc = RAPIER.ColliderDesc.cuboid(halfSize.x, halfSize.y, halfSize.z)
      .setFriction(0.8)
      .setRestitution(0)
      .setSensor(sensor);
    if (!dynamic)
      return world.createCollider(desc.setTranslation(position.x, position.y, position.z));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCcdEnabled(true),
    );
    try {
      const collider = world.createCollider(desc.setMass(40), body);
      dynamicColliders.push(collider);
      return collider;
    } catch (error) {
      world.removeRigidBody(body);
      throw error;
    }
  };
  const ownedVector = (value: PhysicsVector) => {
    const data = fields(value, ['x', 'y', 'z']);
    return Object.freeze({
      x: number(data.x, -10000, 10000),
      y: number(data.y, -10000, 10000),
      z: number(data.z, -10000, 10000),
    });
  };
  const tuningNumber = (value: unknown, minimum: number, maximum: number) => {
    if (typeof value !== 'number') throw new RangeError('Invalid physics value');
    finite(value, minimum, maximum);
    return value;
  };
  const probe: PhysicsProbe = {
    collisionSource: Object.freeze({
      isCurrent: (identity: CollisionIdentity) => collisionRegistry.isCurrent(identity),
    }),
    collisionIdentity: (id) => collisionRegistry.identity(id),
    collisionForColliderHandle: (handle) => collisionRegistry.forHandle(handle),
    collisionStepSerial: () => {
      assertAlive();
      return physicsStepSerial;
    },
    collisionResources: () => collisionRegistry.getStats(),
    addCar(id, position, tuning = SEDAN) {
      admit(true);
      registry.admit(id);
      collisionRegistry.admit(id, 'VEHICLE');
      if (!id || cars.has(id) || cars.size >= PHYSICS_CONFIG.vehicles)
        throw new RangeError('Vehicle identity/capacity');
      let p: PhysicsVector, config: CarTuning, customMechanics: boolean;
      collisionBusy = true;
      try {
        p = ownedVector(position);
        const data = record(tuning);
        const geometry = fields(data.wheels ?? { radiusM: 0.32, wheelbaseM: 2.7, trackM: 1.8 }, [
          'radiusM',
          'wheelbaseM',
          'trackM',
        ]);
        const wheels = Object.freeze({
          radiusM: tuningNumber(geometry.radiusM, 0.2, 0.6),
          wheelbaseM: tuningNumber(geometry.wheelbaseM, 1.5, 3.8),
          trackM: tuningNumber(geometry.trackM, 1.2, 2.4),
        });
        const powerW =
          data.powerW === undefined ? undefined : tuningNumber(data.powerW, 1000, 500000);
        config = Object.freeze({
          massKg: tuningNumber(data.massKg, 600, 4000),
          grip: tuningNumber(data.grip, 0.1, 4),
          brakeAcceleration: tuningNumber(data.brakeAcceleration, 1, 12),
          engineForceN: tuningNumber(data.engineForceN, 0, 20000),
          steeringRadians: tuningNumber(data.steeringRadians, 0.05, 0.7),
          suspensionStiffness: tuningNumber(data.suspensionStiffness, 10, 100),
          ...(powerW === undefined ? {} : { powerW }),
          wheels,
        });
        customMechanics = data.powerW !== undefined || data.wheels !== undefined;
      } finally {
        collisionBusy = false;
      }
      // Boundary reflection cannot interleave lifecycle changes; re-admit immediately before WASM allocation.
      admit(true);
      registry.admit(id);
      collisionRegistry.admit(id, 'VEHICLE');
      const wheels = config.wheels!;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.y, p.z)
          .setCcdEnabled(true)
          .setLinearDamping(0.015)
          .setAngularDamping(0.3),
      );
      let controller: RAPIER.DynamicRayCastVehicleController | undefined;
      let collider: RAPIER.Collider | undefined;
      try {
        collider = world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.85, 0.3, 2)
            .setMass(config.massKg)
            .setFriction(0.5)
            .setRestitution(0),
          body,
        );
        dynamicColliders.push(collider);
        controller = world.createVehicleController(body);
        controller.indexUpAxis = 1;
        controller.setIndexForwardAxis = 2;
        for (const z of [wheels.wheelbaseM / 2, -wheels.wheelbaseM / 2])
          for (const x of [-wheels.trackM / 2, wheels.trackM / 2]) {
            const i = controller.numWheels();
            controller.addWheel(
              { x, y: -0.15, z },
              { x: 0, y: -1, z: 0 },
              { x: -1, y: 0, z: 0 },
              0.35,
              wheels.radiusM,
            );
            controller.setWheelSuspensionStiffness(i, config.suspensionStiffness);
            controller.setWheelSuspensionCompression(i, 4.4);
            controller.setWheelSuspensionRelaxation(i, 5.2);
            controller.setWheelMaxSuspensionTravel(i, 0.2);
            controller.setWheelMaxSuspensionForce(i, config.massKg * 9.81);
            controller.setWheelFrictionSlip(i, config.grip);
            controller.setWheelSideFrictionStiffness(i, 1);
          }
        cars.set(id, {
          body,
          controller,
          tuning: config,
          classId: null,
          mechanicsVersion: customMechanics ? '023-custom-mechanics-v1' : PHYSICS_CONFIG.version,
          collider,
        });
        registry.register(id, body.handle);
        collisionRegistry.register(id, 'VEHICLE', collider.handle);
      } catch (error) {
        const registeredBody = registry.identity(id);
        if (registeredBody) registry.remove(registeredBody);
        const registeredCollider = collisionRegistry.identity(id);
        if (registeredCollider) collisionRegistry.remove(registeredCollider);
        cars.delete(id);
        for (let i = dynamicColliders.length - 1; i >= 0; i--)
          if (dynamicColliders[i]!.parent()?.handle === body.handle) dynamicColliders.splice(i, 1);
        if (controller) world.removeVehicleController(controller);
        world.removeRigidBody(body);
        throw error;
      }
    },
    addClassCar(id, position, classId, version) {
      const config = vehicleClass(classId, version);
      probe.addCar(id, position, config);
      car(id).classId = classId;
    },
    readVehicleMechanics(id) {
      const { body, controller, tuning, classId, mechanicsVersion } = car(id);
      const wheels = Object.freeze({
        radiusM: controller.wheelRadius(0)!,
        wheelbaseM:
          controller.wheelChassisConnectionPointCs(0)!.z -
          controller.wheelChassisConnectionPointCs(2)!.z,
        trackM:
          controller.wheelChassisConnectionPointCs(1)!.x -
          controller.wheelChassisConnectionPointCs(0)!.x,
      });
      return Object.freeze({
        classId,
        version: classId ? vehicleClass(classId).version : mechanicsVersion,
        massKg: body.mass(),
        powerW: tuning.powerW ?? null,
        grip: controller.wheelFrictionSlip(0)!,
        brakeAccelerationMps2: tuning.brakeAcceleration,
        wheels,
        turningRadiusM: wheels.wheelbaseM / Math.tan(tuning.steeringRadians),
        appliedEngineForceN: Object.freeze(
          Array.from({ length: 4 }, (_, i) => controller.wheelEngineForce(i)!),
        ),
        appliedSteeringRadians: Object.freeze(
          Array.from({ length: 4 }, (_, i) => controller.wheelSteering(i)!),
        ),
        wheelBrakeImpulseLimitNs: Object.freeze(
          Array.from({ length: 4 }, (_, i) => controller.wheelBrake(i)!),
        ),
      });
    },
    addBox(position, halfSize, dynamic = false) {
      admit(dynamic);
      vector(position);
      vector(halfSize);
      for (const k of ['x', 'y', 'z'] as const) finite(halfSize[k], 0.01, 500);
      if (obstacles >= PHYSICS_CONFIG.obstacles) throw new RangeError('Obstacle capacity');
      allocateBox(position, halfSize, dynamic);
      obstacles++;
    },
    addNamedBox(id, position, halfSize, options: CollisionBoxOptions = {}) {
      assertMutable();
      let p: PhysicsVector, half: PhysicsVector, dynamic: boolean, sensor: boolean;
      collisionBusy = true;
      try {
        p = ownedVector(position);
        half = ownedVector(halfSize);
        for (const k of ['x', 'y', 'z'] as const) finite(half[k], 0.01, 500);
        const data = record(options);
        requireContract(
          Object.keys(data).every((key) => key === 'dynamic' || key === 'sensor'),
          'Named box options',
        );
        dynamic = Object.hasOwn(data, 'dynamic') ? boolean(data.dynamic) : false;
        sensor = Object.hasOwn(data, 'sensor') ? boolean(data.sensor) : false;
      } finally {
        collisionBusy = false;
      }
      admit(dynamic);
      if (obstacles >= PHYSICS_CONFIG.obstacles) throw new RangeError('Obstacle capacity');
      collisionRegistry.admit(id, 'OBSTACLE');
      const collider = allocateBox(p, half, dynamic, sensor);
      try {
        const identity = collisionRegistry.register(id, 'OBSTACLE', collider.handle);
        namedBoxes.set(identity, collider);
        obstacles++;
        return identity;
      } catch (error) {
        const body = collider.parent();
        const index = dynamicColliders.indexOf(collider);
        if (index >= 0) dynamicColliders.splice(index, 1);
        if (body) world.removeRigidBody(body);
        else world.removeCollider(collider, true);
        throw error;
      }
    },
    removeCollisionEntity(identity) {
      assertMutable();
      if (!collisionRegistry.isCurrent(identity)) return false;
      if (identity.kind === 'VEHICLE')
        return probe.removeBody(registry.identity(identity.entityId)!);
      const collider = namedBoxes.get(identity)!;
      collisionRegistry.remove(identity);
      namedBoxes.delete(identity);
      obstacles--;
      const body = collider.parent();
      const index = dynamicColliders.indexOf(collider);
      if (index >= 0) dynamicColliders.splice(index, 1);
      if (body) world.removeRigidBody(body);
      else world.removeCollider(collider, true);
      return true;
    },
    readCollisionContacts() {
      assertMutable();
      collisionBusy = true;
      const contacts: CollisionContact[] = [];
      let candidatePairs = 0,
        manifoldContacts = 0,
        ignoredGroundPairs = 0,
        ignoredSensorPairs = 0,
        ignoredUnmappedPairs = 0;
      let failed = false;
      let failure: unknown;
      let contactToleranceM = 0;
      const fail = (error: unknown) => {
        if (!failed) {
          failed = true;
          failure = error;
        }
      };
      try {
        contactToleranceM = number(
          world.integrationParameters.normalizedAllowedLinearError *
            world.integrationParameters.lengthUnit,
          0,
        );
        for (const [id, { collider }] of cars) {
          const first = collisionRegistry.identity(id)!;
          world.contactPairsWith(collider, (other) => {
            // No user callback runs here. Always return normally so Rapier frees borrowed manifolds.
            try {
              if (failed) return;
              const second = collisionRegistry.forHandle(other.handle);
              if (second?.kind === 'VEHICLE' && second.serial < first.serial) return;
              if (
                ++candidatePairs >
                (PHYSICS_CONFIG.colliders * (PHYSICS_CONFIG.colliders - 1)) / 2
              ) {
                fail(new RangeError('Collision candidate capacity'));
                return;
              }
              if (other.isSensor() || collider.isSensor()) {
                ignoredSensorPairs++;
                return;
              }
              if (other.handle === ground.handle) {
                ignoredGroundPairs++;
                return;
              }
              if (!second) {
                ignoredUnmappedPairs++;
                return;
              }
              let touching = false,
                impulseNs = 0;
              world.contactPair(collider, other, (manifold) => {
                try {
                  if (failed) return;
                  const count = manifold.numContacts();
                  if (
                    !Number.isSafeInteger(count) ||
                    count < 0 ||
                    manifoldContacts + count > COLLISION_LIMITS.contacts
                  ) {
                    fail(new RangeError('Collision manifold contact capacity'));
                    return;
                  }
                  manifoldContacts += count;
                  for (let index = 0; index < count; index++) {
                    const distance = manifold.contactDist(index),
                      impulse = manifold.contactImpulse(index);
                    if (!Number.isFinite(distance) || !Number.isFinite(impulse) || impulse < 0) {
                      fail(new RangeError('Invalid native collision contact'));
                      return;
                    }
                    // Rapier can apply a real normal impulse at a positive predictive gap;
                    // resting contacts also retain the solver's allowed separation error.
                    if (distance <= contactToleranceM || impulse > 0) {
                      touching = true;
                      impulseNs += impulse;
                    }
                    if (!Number.isFinite(impulseNs)) {
                      fail(new RangeError('Collision impulse overflow'));
                      return;
                    }
                  }
                } catch (error) {
                  fail(error);
                }
              });
              if (failed || !touching) return;
              if (contacts.length >= COLLISION_LIMITS.pairs) {
                fail(new RangeError('Collision mapped pair capacity'));
                return;
              }
              contacts.push(Object.freeze({ first, second, impulseNs }));
            } catch (error) {
              fail(error);
            }
          });
        }
        if (failed) throw failure;
        return Object.freeze({
          physicsStepSerial,
          contactToleranceM,
          contacts: Object.freeze(contacts),
          candidatePairs,
          manifoldContacts,
          ignoredGroundPairs,
          ignoredSensorPairs,
          ignoredUnmappedPairs,
          ignoredObstaclePairs: 0,
        });
      } finally {
        collisionBusy = false;
      }
    },
    setVelocity(id, velocity) {
      assertMutable();
      vector(velocity);
      car(id).body.setLinvel(velocity, true);
    },
    recoveryResources: () =>
      Object.freeze({
        activePorts: recoveryPort === null || disposed ? 0 : 1,
        worldBound: recoveryContext !== null,
        disposed,
      }),
    createRecoveryPort(context) {
      assertMutable();
      collisionBusy = true;
      try {
        const bound = Object.freeze(readContext(fields(context, contextFields)));
        if (recoveryContext)
          requireContract(
            JSON.stringify(bound) === JSON.stringify(recoveryContext),
            'Recovery world already bound',
          );
        if (!recoveryPort) {
          recoveryPort = createNativeRecoveryPort(world, ground, bound, {
            guard(work) {
              assertMutable();
              collisionBusy = true;
              try {
                return work();
              } finally {
                collisionBusy = false;
              }
            },
            current: (identity) => registry.assertCurrent(identity),
            body: (identity) => car(identity.entityId).body,
            wheels: (identity) => car(identity.entityId).tuning.wheels!,
            serial: () => physicsStepSerial,
            released: () => {
              recoveryPort = null;
            },
          });
          recoveryContext = bound;
        }
        return recoveryPort;
      } finally {
        collisionBusy = false;
      }
    },
    bodyIdentity: (id) => registry.identity(id),
    entityForBodyHandle: (handle) => registry.forHandle(handle),
    readBody,
    setPose(identity, transform) {
      assertMutable();
      registry.assertCurrent(identity);
      const pose = copyBodyTransform(transform);
      vector(pose.positionM);
      const { body } = car(identity.entityId);
      body.setTranslation(pose.positionM, true);
      body.setRotation(pose.rotationQuaternion, true);
    },
    setBodyVelocity(identity, velocity) {
      assertMutable();
      registry.assertCurrent(identity);
      vector(velocity);
      car(identity.entityId).body.setLinvel(velocity, true);
    },
    removeBody(identity) {
      assertMutable();
      if (!registry.isCurrent(identity)) return false;
      const { body, controller } = car(identity.entityId);
      // Invalidate callbacks before releasing native handles, which Rapier may reuse.
      registry.remove(identity);
      const collisionIdentity = collisionRegistry.identity(identity.entityId);
      if (collisionIdentity) collisionRegistry.remove(collisionIdentity);
      cars.delete(identity.entityId);
      for (let i = dynamicColliders.length - 1; i >= 0; i--)
        if (dynamicColliders[i]!.parent()?.handle === body.handle) dynamicColliders.splice(i, 1);
      world.removeVehicleController(controller);
      world.removeRigidBody(body); // Rapier also removes every attached collider.
      return true;
    },
    subscribeBody: (identity, listener) => registry.subscribe(identity, listener),
    publishBodies(tick, measure = true) {
      assertAlive();
      if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Invalid body tick');
      if (tick < lastPublicationTick) return { readbackMs: 0, dispatchMs: 0, bodies: 0 };
      lastPublicationTick = tick;
      const batchPublication = {};
      publication = batchPublication;
      const now = measure ? clock : () => 0;
      const start = now();
      const states = [...cars.keys()].map((id) => readBody(registry.identity(id)!));
      const readbackEnd = now();
      for (const state of states) {
        if (disposed || publication !== batchPublication) break;
        registry.publish(state, tick);
      }
      return {
        readbackMs: readbackEnd - start,
        dispatchMs: now() - readbackEnd,
        bodies: states.length,
      };
    },
    bodyResources: () => registry.counts(),
    step(inputs, measure = true) {
      assertMutable();
      if (physicsStepSerial >= Number.MAX_SAFE_INTEGER)
        throw new RangeError('Physics step serial capacity');
      assertAlive();
      const now = measure ? clock : () => 0;
      const start = now();
      // Validate the entire command batch before mutating any body.
      for (const [id, input] of inputs) {
        car(id);
        finite(input.throttle, -1, 1);
        finite(input.brake, 0, 1);
        finite(input.steering, -1, 1);
        if (input.handbrake !== undefined && typeof input.handbrake !== 'boolean')
          throw new TypeError('Physics handbrake must be boolean');
      }
      let bridgeCalls = 0;
      for (const [id, { body, controller, tuning }] of cars) {
        const input: PhysicsInput = inputs.get(id) ?? zero;
        if (input.throttle || input.brake || input.steering || input.handbrake) body.wakeUp();
        let force = tuning.engineForceN;
        if (tuning.powerW !== undefined) {
          // Current velocity in the chassis forward axis; controller's cached speed may
          // still describe the previous tick after setPose/setVelocity or a collision.
          const v = body.linvel(),
            q = body.rotation();
          const speed =
            v.x * 2 * (q.x * q.z + q.w * q.y) +
            v.y * 2 * (q.y * q.z - q.w * q.x) +
            v.z * (1 - 2 * (q.x * q.x + q.y * q.y));
          force = tractiveForceN(
            { powerW: tuning.powerW, engineForceN: tuning.engineForceN },
            speed,
          );
          bridgeCalls += 2;
        }
        for (let i = 0; i < 4; i++) {
          controller.setWheelEngineForce(i, i >= 2 ? (input.throttle * force) / 2 : 0);
          controller.setWheelBrake(
            i,
            (Math.max(input.brake, i >= 2 && input.handbrake ? 1 : 0) *
              tuning.massKg *
              tuning.brakeAcceleration) /
              PHYSICS_CONFIG.hz /
              4,
          );
          controller.setWheelSteering(i, i < 2 ? input.steering * tuning.steeringRadians : 0);
          bridgeCalls += 3;
        }
        // No dynamic-body exclusion: wheels may contact another car or debris.
        controller.updateVehicle(world.timestep, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      }
      const controllerEnd = now();
      world.step();
      physicsStepSerial++;
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
      assertMutable();
      disposed = true;
      collisionRegistry.dispose();
      namedBoxes.clear();
      registry.dispose();
      for (const { controller } of cars.values()) world.removeVehicleController(controller);
      cars.clear();
      dynamicColliders.length = 0;
      world.free();
      activeWorlds--;
    },
  };
  return probe;
}
