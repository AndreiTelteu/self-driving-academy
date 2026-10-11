import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { PHYSICS_CONFIG } from '../../src/vehicles/physics';
import { PhysicsBodyRegistry } from '../../src/vehicles/body-registry';
import { CollisionRegistry } from '../../src/vehicles/collision-port';

// Native draft. Run only under a separate serial native grant, never with pure checks.
test('actual Rapier pre-handoff ground/setter failures free their real world and restore admission', async () => {
  await RAPIER.init();
  const prototype = RAPIER.World.prototype;
  const originalCollider = prototype.createCollider;
  const originalFree = prototype.free;
  for (const failure of [
    'ground-before',
    'ground-after',
    'timestep',
    'numSolverIterations',
  ] as const) {
    const primary = new Error(`injected:${failure}`);
    const property = failure.startsWith('ground') ? undefined : failure;
    const descriptor = property && Object.getOwnPropertyDescriptor(prototype, property);
    let acquired: RAPIER.World | undefined;
    let frees = 0;
    let next: Awaited<ReturnType<typeof createRapierProbe>> | undefined;
    try {
      prototype.free = function () {
        if (this === acquired) frees++;
        return originalFree.call(this);
      };
      if (property) {
        assert(descriptor?.set, `Installed Rapier setter unavailable: ${property}`);
        Object.defineProperty(prototype, property, {
          ...descriptor,
          set(this: RAPIER.World, value: number) {
            acquired = this;
            descriptor.set!.call(this, value);
            throw primary;
          },
        });
      } else {
        prototype.createCollider = function (...args: Parameters<typeof originalCollider>) {
          acquired = this;
          if (failure === 'ground-after') originalCollider.apply(this, args);
          throw primary;
        };
      }
      await assert.rejects(createRapierProbe(), (error: unknown) => error === primary);
      assert(acquired instanceof RAPIER.World);
      assert.equal(frees, 1);
      // Restore injection before proving the next real world can use the unchanged capacity.
      prototype.createCollider = originalCollider;
      if (property && descriptor) Object.defineProperty(prototype, property, descriptor);
      next = await createRapierProbe();
      assert.deepEqual(next.counts(), { vehicles: 0, bodies: 0, colliders: 1 });
      assert.equal(PHYSICS_CONFIG.worlds, 1);
      await assert.rejects(createRapierProbe(), /Physics world admission capacity/);
      assert.equal(frees, 1);
    } finally {
      prototype.createCollider = originalCollider;
      if (property && descriptor) Object.defineProperty(prototype, property, descriptor);
      prototype.free = originalFree;
      next?.dispose();
    }
  }
});

// Patches are test-process seams only. Every actual World.free still calls native free.
test('actual normal disposal frees once after registry/controller faults, fences reentry and restores admission', async () => {
  await RAPIER.init();
  const prototype = RAPIER.World.prototype;
  const originalFree = prototype.free;
  const originalRemove = prototype.removeVehicleController;
  const originalCollision = CollisionRegistry.prototype.dispose;
  const originalRegistry = PhysicsBodyRegistry.prototype.dispose;
  for (const failure of [
    'none',
    'collision',
    'registry',
    'controller-before',
    'controller-after',
    'combined',
  ] as const) {
    const collisionError = new Error('collision cleanup');
    const registryError = new Error('registry cleanup');
    const controllerError = new Error('controller cleanup');
    let probe: Awaited<ReturnType<typeof createRapierProbe>> | undefined;
    let next: Awaited<ReturnType<typeof createRapierProbe>> | undefined;
    let frees = 0;
    let removes = 0;
    try {
      probe = await createRapierProbe();
      const current = probe;
      for (let i = 0; i < 3; i++) current.addCar(`car-${i}`, { x: i * 4, y: 3, z: 0 });
      const body = current.bodyIdentity('car-0')!;
      const collision = current.collisionIdentity('car-0')!;
      current.subscribeBody(body, () => {
        throw new Error('disposed subscription delivered');
      });
      CollisionRegistry.prototype.dispose = function () {
        current.dispose();
        assert.throws(() => current.addCar('reentrant', { x: 0, y: 3, z: 0 }), /disposed/);
        originalCollision.call(this);
        if (failure === 'collision' || failure === 'combined') throw collisionError;
      };
      PhysicsBodyRegistry.prototype.dispose = function () {
        current.dispose();
        originalRegistry.call(this);
        if (failure === 'registry' || failure === 'combined') throw registryError;
      };
      prototype.removeVehicleController = function (controller) {
        removes++;
        current.dispose();
        if (removes === 1 && (failure === 'controller-before' || failure === 'combined'))
          throw controllerError;
        originalRemove.call(this, controller);
        if (removes === 1 && failure === 'controller-after') throw controllerError;
      };
      prototype.free = function () {
        frees++;
        current.dispose();
        return originalFree.call(this);
      };
      if (failure === 'none') current.dispose();
      else
        assert.throws(
          () => current.dispose(),
          (actual: unknown) => {
            if (failure === 'combined') {
              assert(actual instanceof AggregateError);
              assert.equal(actual.errors.length, 3);
              assert.equal(actual.errors[0], collisionError);
              assert.equal(actual.errors[1], registryError);
              assert.equal(actual.errors[2], controllerError);
              return true;
            }
            return (
              actual ===
              (failure === 'collision'
                ? collisionError
                : failure === 'registry'
                  ? registryError
                  : controllerError)
            );
          },
        );
      current.dispose();
      assert.equal(frees, 1, failure);
      assert.equal(removes, 3, failure);
      assert.deepEqual(current.bodyResources(), { entities: 0, subscriptions: 0 });
      assert.equal(current.bodyIdentity(body.entityId), undefined);
      assert.equal(current.collisionSource.isCurrent(collision), false);
      assert.equal(current.collisionIdentity(collision.entityId), undefined);
      assert.throws(() => current.readBody(body), /disposed|Stale/);
      assert.throws(() => current.counts(), /disposed/);
      // Restore every fault/reentry seam before admitting the next real world.
      prototype.free = originalFree;
      prototype.removeVehicleController = originalRemove;
      CollisionRegistry.prototype.dispose = originalCollision;
      PhysicsBodyRegistry.prototype.dispose = originalRegistry;
      next = await createRapierProbe();
      assert.deepEqual(next.counts(), { vehicles: 0, bodies: 0, colliders: 1 });
      await assert.rejects(createRapierProbe(), /Physics world admission capacity/);
    } finally {
      prototype.free = originalFree;
      prototype.removeVehicleController = originalRemove;
      CollisionRegistry.prototype.dispose = originalCollision;
      PhysicsBodyRegistry.prototype.dispose = originalRegistry;
      probe?.dispose();
      next?.dispose();
    }
  }
});
