import test from 'node:test';
import assert from 'node:assert/strict';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createServiceZoneCatalog } from '../../src/world/service-zones';
import { createServiceZoneAvailability } from '../../src/app/service-zones';
import { serviceReferenceFixture } from '../browser/service-zones/road-fixture';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference';

for (const classId of ['sedan', 'compact'] as const)
  test(`040 actual ${classId} readonly service/recovery occupancy, support and same-serial moving/anonymous blockers`, async () => {
    const world = await createRapierProbe();
    const owned: { dispose(): void }[] = [world];
    let primary: unknown,
      failed = false;
    try {
      world.addClassCar('subject', { x: 0, y: 0.8, z: 0 }, classId);
      world.addClassCar('other', { x: 8, y: 0.8, z: 0 }, classId);
      for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
      const fixture = serviceReferenceFixture(),
        catalog = createServiceZoneCatalog(fixture.map, fixture.graph);
      owned.push(catalog);
      const native = world.createRecoveryPort!(CONTROLLER_CONTEXT);
      owned.push({ dispose: () => native.release() });
      const feature = createServiceZoneAvailability({
        context: CONTROLLER_CONTEXT,
        catalog,
        physics: world,
        native,
      });
      owned.push(feature);
      const identity = world.bodyIdentity('subject')!,
        other = world.bodyIdentity('other')!,
        serial = world.collisionStepSerial!(),
        before = world.readBody(identity),
        priorOther = world.readBody(other),
        mechanics = world.readVehicleMechanics('subject');
      const query = {
        category: 'RECOVERY' as const,
        id: 'point-safe',
        fromLaneId: 'lane-2',
        access: 'TAXI' as const,
        purpose: 'PICKUP' as const,
      };
      const clear = feature.inspect(query, identity);
      assert.equal(clear.status, 'AVAILABLE');
      assert.equal(clear.native!.colliderCount, 3);
      assert.equal(
        feature.inspect({ ...query, category: 'SERVICE', id: 'service' }, identity).status,
        'AVAILABLE',
      );
      assert.deepEqual(world.readBody(identity), before);
      assert.deepEqual(world.readBody(other), priorOther);
      assert.equal(world.collisionStepSerial!(), serial);
      assert.deepEqual(world.readVehicleMechanics('subject'), mechanics);
      world.setPose(other, {
        positionM: { x: 0, y: priorOther.transform.positionM.y, z: -12 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      });
      const movedOther = world.readBody(other);
      assert.equal(feature.inspect(query, identity).status, 'OCCUPIED');
      assert.deepEqual(world.readBody(other), movedOther);
      assert.deepEqual(world.readBody(identity), before);
      assert.equal(world.collisionStepSerial!(), serial);
      world.setPose(other, priorOther.transform);
      assert.equal(feature.inspect(query, identity).status, 'AVAILABLE');
      world.addBox({ x: 0, y: 0.6, z: -12 }, { x: 1.5, y: 0.6, z: 1 });
      const blocked = feature.inspect(query, identity);
      assert.equal(blocked.status, 'OCCUPIED');
      assert.equal(blocked.native!.colliderCount, 4);
      assert.notEqual(blocked.native!.blockingColliderHandle, null);
      assert.equal(world.collisionStepSerial!(), serial);
      world.setPose(identity, {
        positionM: { ...before.transform.positionM, y: 2 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      });
      const unsupported = feature.inspect(query, identity);
      assert.equal(unsupported.status, 'INVALID_SUPPORT');
      assert.equal(unsupported.native!.colliderCount, 0);
      world.removeBody(identity);
      world.addClassCar('subject', { x: 0, y: 0.8, z: 0 }, classId);
      assert.throws(() => feature.inspect(query, identity));
    } catch (error) {
      failed = true;
      primary = error;
    }
    const errors: unknown[] = failed ? [primary] : [];
    for (const resource of owned.reverse())
      try {
        resource.dispose();
      } catch (error) {
        errors.push(error);
      }
    try {
      assert.equal(world.bodyResources().entities, 0);
      assert.equal(world.bodyResources().subscriptions, 0);
      assert.equal(world.collisionResources!().colliders, 0);
      assert.equal(world.recoveryResources!().activePorts, 0);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, '040 primary/native cleanup retained');
  });
