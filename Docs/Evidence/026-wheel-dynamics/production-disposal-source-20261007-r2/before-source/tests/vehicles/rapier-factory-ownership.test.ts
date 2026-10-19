import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { PHYSICS_CONFIG } from '../../src/vehicles/physics';

// Native draft. Run only under a separate serial native grant, never with pure checks.
test('actual Rapier pre-handoff ground/setter failures free their real world and restore admission', async () => {
  await RAPIER.init();
  const prototype = RAPIER.World.prototype;
  const originalCollider = prototype.createCollider;
  const originalFree = prototype.free;
  for (const failure of ['ground-before', 'ground-after', 'timestep', 'numSolverIterations'] as const) {
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
