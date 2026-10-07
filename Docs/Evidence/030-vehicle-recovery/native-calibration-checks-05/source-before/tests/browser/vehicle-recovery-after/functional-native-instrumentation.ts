import RAPIER from '@dimforge/rapier3d-compat';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import type { BodyIdentity } from '../../../src/vehicles/body-port';
import { functionalCheck as check } from './functional-proof';
/** Explicit actual-native fault instrumentation, no execution on import.
 * Factory interception is scoped to this single fixture acquisition and restored in finally.
 * This is not a forged placement result or a product rollback mechanism.
 */
export async function acquireFunctionalNative() {
  const prototype = RAPIER.World.prototype,
    original = prototype.createRigidBody;
  const acquired: RAPIER.RigidBody[] = [];
  prototype.createRigidBody = function (...args: Parameters<typeof original>) {
    const body = original.apply(this, args);
    acquired.push(body);
    return body;
  };
  let world: Awaited<ReturnType<typeof createRapierProbe>>;
  try {
    world = await createRapierProbe();
  } finally {
    prototype.createRigidBody = original;
  }
  const actual = world;
  const observed = Object.freeze({
    ...actual,
    addClassCar(...args: Parameters<typeof actual.addClassCar>) {
      const previous = prototype.createRigidBody;
      prototype.createRigidBody = function (...parameters: Parameters<typeof original>) {
        const body = previous.apply(this, parameters);
        acquired.push(body);
        return body;
      };
      try {
        return actual.addClassCar(...args);
      } finally {
        prototype.createRigidBody = previous;
      }
    },
  });
  return {
    world: observed,
    injectRotationFailure(
      identity: BodyIdentity,
      own: (label: string, release: () => unknown) => () => unknown,
    ) {
      const token = world.bodyIdentity(identity.entityId);
      check(token === identity, 'Actual native fault exact live token');
      const body = acquired.find((value) => value.handle === identity.handle);
      check(body, 'Acquired actual native body handle');
      const setter = body.setRotation;
      let attempts = 0;
      const restore = own('actualNativeRotationSetter', () => {
        body.setRotation = setter;
      });
      body.setRotation = () => {
        attempts++;
        throw new Error('030 explicitly injected actual native rotation setter failure');
      };
      return { restore, readAttempts: () => attempts };
    },
  };
}
