import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createVehicleController } from '../../src/vehicles/controller';
import { createVehicleDamage } from '../../src/vehicles/damage-state';
import { createVehicleRecovery } from '../../src/vehicles/recovery-state';
import { createCollisionEpisodes } from '../../src/vehicles/collision-episodes';
import { createControlAuthority } from '../../src/input/control-authority';
import { createEventBus } from '../../src/simulation/event-bus';
import { createRecoveryRoadProvider } from '../../src/app/vehicle-recovery-road';
import { createRecoverySegmentBoundary } from '../../src/app/vehicle-recovery-segment';
import { parseInterventionSegment } from '../../src/telemetry';
import { vehicleClass } from '../../src/vehicles/vehicle-classes';
import { recoveryRoadFixture } from '../browser/vehicle-recovery/road-fixture';
import { segment } from '../contracts/fixtures';
import { CONTROLLER_CONTEXT } from './controller-reference';

/** SOURCE DRAFT: not yet executed. Synthetic explicit R intent, not trusted keyboard proof.
 * Acquisitions register cleanup immediately; every independent owner is attempted once.
 */
async function ownedNative(run: (world: Awaited<ReturnType<typeof createRapierProbe>>,
  own: (dispose: () => void) => void) => void) {
  const disposers: (() => void)[] = [];
  let acquiredWorld: Awaited<ReturnType<typeof createRapierProbe>> | null = null;
  let failed = false, primary: unknown;
  try {
    const world = await createRapierProbe();
    acquiredWorld = world;
    disposers.push(() => world.dispose());
    run(world, dispose => { disposers.push(dispose); });
  } catch (error) { failed = true; primary = error; }
  const cleanup: unknown[] = [];
  for (const dispose of disposers.reverse()) {
    try { dispose(); } catch (error) { cleanup.push(error); }
  }
  if (acquiredWorld !== null) {
    try {
      assert.deepEqual(acquiredWorld.bodyResources(), { entities: 0, subscriptions: 0 });
      assert.equal(acquiredWorld.collisionResources().disposed, true);
      assert.equal(acquiredWorld.collisionResources().colliders, 0);
      assert.equal(acquiredWorld.recoveryResources!().activePorts, 0);
    } catch (error) { cleanup.push(error); }
  }
  if (failed || cleanup.length) throw new AggregateError(
    [...(failed ? [primary] : []), ...cleanup], 'Actual native functional/setup/cleanup failure');
}

for (const classId of ['sedan', 'compact'] as const) {
  test(`030 ${classId} actual wall impulse -> explicit R ->005 close ->029 retained prefix ->007 once`, async () => {
    await ownedNative((world, own) => {
      world.addClassCar('subject', { x: 0, y: .75, z: 0 }, classId);
      world.addClassCar('other', { x: 8, y: .75, z: 0 }, classId);
      world.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: .05 });
      for (let i = 0; i < 180; i++) world.step(new Map(), false);
      const identity = world.bodyIdentity('subject')!, other = world.bodyIdentity('other')!;
      const damage = createVehicleDamage(CONTROLLER_CONTEXT, world); own(() => damage.dispose());
      damage.register(identity, vehicleClass(classId).massKg);
      const controller = createVehicleController(CONTROLLER_CONTEXT, world, 0, { availability: damage });
      own(() => controller.dispose());
      const authority = createControlAuthority(CONTROLLER_CONTEXT, controller, world);
      own(() => authority.dispose()); authority.register(identity);
      const episodes = createCollisionEpisodes(CONTROLLER_CONTEXT, world.collisionSource);
      own(() => episodes.dispose());
      const bus = createEventBus(CONTROLLER_CONTEXT); own(() => bus.dispose());
      const order: string[] = [];
      let currentSegment = parseInterventionSegment({ ...segment(), ...CONTROLLER_CONTEXT,
        vehicleId: 'subject', controlMode: 'MANUAL', learningEligible: false,
        startTick: 0, endTick: null, closeReason: null, completeness: 'OPEN', samples: [], events: [] });
      const initialSegment = currentSegment;
      const route = Object.freeze(['lane-0', 'lane-1']), trip = Object.freeze({ rideId: 'ride-kept' });
      const segmentBoundary = createRecoverySegmentBoundary(CONTROLLER_CONTEXT, {
        read: token => { assert.equal(token, identity); return currentSegment; },
        write: (token, closed) => {
          assert.equal(token, identity); order.push('005');
          assert.equal(controller.readControl(identity), undefined);
          // Damage restoration must occur after accepted005 closure.
          assert.notEqual(damage.readDamage(identity).availability, 'AVAILABLE');
          currentSegment = closed;
        },
      });
      const invalidate = controller.invalidateRealization!.bind(controller);
      // Instrumented forwarding facade; actual authority/controller state and exact tokens remain shared.
      const observedController = Object.freeze({ ...controller,
        invalidateRealization: (...args: Parameters<NonNullable<typeof controller.invalidateRealization>>) => {
          order.push('027'); invalidate(...args);
        } });
      let delivered = 0;
      bus.subscribe(event => {
        if (event.type !== 'VEHICLE_RECOVERED') return;
        order.push('007'); delivered++;
        assert.equal(currentSegment.closeReason, 'RECOVERY');
        assert.equal(damage.readDamage(identity).availability, 'AVAILABLE');
      });
      const recovery = createVehicleRecovery(CONTROLLER_CONTEXT, { physics: world, controller: observedController,
        authority, damage, eventBus: bus, segments: segmentBoundary,
        road: createRecoveryRoadProvider(recoveryRoadFixture().graph),
        clearAddressedInput: token => { assert.equal(token, identity); order.push('input'); } });
      own(() => recovery.dispose()); recovery.register(identity, 'TAXI');
      let at = 0;
      const step = () => {
        at++;
        authority.step({ ...CONTROLLER_CONTEXT, version: '066-control-authority-v1',
          tick: at, dtSeconds: 1/60 }, [], at === 1 ? [{ identity, mode: 'MANUAL' }] : []);
        const contacts = world.readCollisionContacts();
        episodes.update(at, contacts.contacts);
        const drain = episodes.drain(incident => { damage.applyIncident(incident); });
        assert.equal(drain.status, 'drained');
        recovery.observe(at);
        return contacts;
      };
      for (let i = 0; i < 6; i++) step();
      assert(recovery.readProjection()!.pointId, 'Actual four-wheel support must produce a candidate');
      // Explicit fixture setup collision launch;030 never writes velocity to create an incident.
      world.setVelocity('subject', { x: 0, y: 0, z: 45 });
      let maxImpulse = 0;
      for (let i = 0; i < 180; i++) {
        const contacts = step();
        for (const contact of contacts.contacts) maxImpulse = Math.max(maxImpulse, contact.impulseNs);
      }
      assert(maxImpulse > 0, 'Real native manifold impulse required, not authored incident');
      const prefix = damage.readHistory();
      assert(prefix.length > 0); assert.notEqual(damage.readDamage(identity).availability, 'AVAILABLE');
      const priorOther = world.readBody(other), serial = world.collisionStepSerial();
      const incidentId = damage.readDamage(identity).lastIncidentId;
      const op = recovery.request({ context: CONTROLLER_CONTEXT, identity, tick: at,
        mode: 'MANUAL', origin: 'R' });
      const result = recovery.commit(at);
      assert(result && typeof result === 'object'); assert.equal(result.status, 'COMPLETED');
      assert.equal(result.learningEligible, false); assert.equal(result.placement!.completed, 5);
      assert.equal(world.collisionStepSerial(), serial); assert.deepEqual(world.readBody(other), priorOther);
      assert.equal(currentSegment.endTick, at); assert.equal(currentSegment.completeness, 'CLOSED');
      assert.deepEqual({ ...currentSegment, endTick: null, closeReason: null, completeness: 'OPEN' }, initialSegment);
      assert.deepEqual(route, ['lane-0', 'lane-1']); assert.deepEqual(trip, { rideId: 'ride-kept' });
      assert.deepEqual(damage.readHistory().slice(0, prefix.length), prefix);
      assert.equal(damage.readDamage(identity).lastIncidentId, incidentId);
      assert.equal(damage.readHistory().at(-1)!.operationId, op);
      assert.deepEqual(order, ['027', 'input', '005', '007']); assert.equal(delivered, 1);
      recovery.request({ context: CONTROLLER_CONTEXT, identity, tick: at, mode: 'MANUAL', origin: 'R' });
      recovery.commit(at); assert.equal(delivered, 1); assert.equal(world.collisionStepSerial(), serial);
      assert.equal(damage.readHistory().length, prefix.length + 1);
    });
  });

  test(`030 ${classId} actual full wheel support and named dynamic/other-car occupancy cannot be bypassed`, async () => {
    await ownedNative((world, own) => {
      world.addClassCar('subject', { x: 0, y: .75, z: 0 }, classId);
      world.addClassCar('other', { x: 8, y: .75, z: 0 }, classId);
      for (let i = 0; i < 180; i++) world.step(new Map(), false);
      const identity = world.bodyIdentity('subject')!, other = world.bodyIdentity('other')!;
      const native = world.createRecoveryPort!(CONTROLLER_CONTEXT); own(() => native.release());
      const projection = world.project('subject');
      assert.equal(projection.wheelContacts, 4);
      assert.equal(projection.suspension.length, 4); assert(projection.suspension.every(Number.isFinite));
      const transform = { positionM: projection.position, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } };
      const road = createRecoveryRoadProvider(recoveryRoadFixture().graph).locate(transform, 'TAXI')!;
      const request = { identity, context: CONTROLLER_CONTEXT, expectedPhysicsSerial: world.collisionStepSerial(), transform, road };
      assert.equal(native.inspectPlacement(request).status, 'SAFE');
      for (const dynamic of [false, true]) {
        const blocker = world.addNamedBox('named-'+dynamic, { ...projection.position }, { x: .2, y: .2, z: .2 }, { dynamic });
        const result = native.applyPlacement(request);
        assert.equal(result.inspection.status, 'BLOCKED'); assert.equal(result.attempted, 0);
        assert.equal(result.inspection.blockingColliderHandle, blocker.colliderHandle);
        assert.equal(world.removeCollisionEntity(blocker), true);
      }
      world.setPose(other, transform); // Explicit fixture mutation without native step.
      world.setBodyVelocity(other, { x: 3, y: 0, z: 0 });
      assert.equal(world.readBody(other).velocityMps.x, 3);
      assert.equal(native.applyPlacement(request).inspection.status, 'BLOCKED');
      world.setPose(other, { ...transform, positionM: { x: 8, y: projection.position.y, z: 0 } });
      assert.equal(native.inspectPlacement(request).status, 'SAFE');
      for (const y of [-1, 10]) assert.equal(native.inspectPlacement({ ...request,
        transform: { ...transform, positionM: { ...projection.position, y } } }).status, 'INVALID_SUPPORT');
      assert.throws(() => native.inspectPlacement({ ...request, transform: { ...transform,
        rotationQuaternion: { x: Math.sin(.01), y: 0, z: 0, w: Math.cos(.01) } } }), /upright yaw/);
      assert.equal(world.collisionStepSerial(), request.expectedPhysicsSerial);
    });
  });
}
