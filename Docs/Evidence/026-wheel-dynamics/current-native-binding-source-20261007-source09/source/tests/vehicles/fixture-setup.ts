import type { PhysicsInput, PhysicsProbe } from '../../src/vehicles';
/** Fixture owns the probe until synchronous setup returns successfully. */
export function setupOwned<T extends { dispose(): void }, R>(world: T, setup: (world: T) => R): R {
  try {
    return setup(world);
  } catch (primary) {
    try { world.dispose(); }
    catch (disposal) {
      throw new AggregateError([primary, disposal], 'Fixture setup and disposal failed', { cause: primary });
    }
    throw primary;
  }
}
export function disposeAfterFailure(world: { dispose(): void }, failed: boolean, primary: unknown) {
  try { world.dispose(); }
  catch (disposal) {
    if (failed) throw new AggregateError([primary, disposal], 'Calibration and cleanup failed', { cause: primary });
    throw disposal;
  }
}

export function setupManyContacts(world: Pick<PhysicsProbe, 'addCar' | 'addBox' | 'dispose'>, count: number) {
  return setupOwned(world, () => {
  const inputs = new Map<string, PhysicsInput>();
  for (let i = 0; i < count; i++) {
    const id = `car-${i}`;
    world.addCar(id, { x: (i % 10) * 2.2 - 10, y: 0.8, z: Math.floor(i / 10) * 4.15 });
    inputs.set(id, { throttle: i % 2 ? 0.65 : 1, brake: 0, steering: i % 2 ? 0.03 : -0.03 });
  }
  world.addBox({ x: 0, y: 1, z: 32 }, { x: 20, y: 1, z: 0.5 });
  world.addBox({ x: -12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
  world.addBox({ x: 12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
  for (let i = 0; i < 64; i++)
    world.addBox(
      { x: (i % 8) * 0.65 - 2.5, y: 0.35 + Math.floor(i / 8) * 0.62, z: 30 },
      { x: 0.3, y: 0.3, z: 0.3 },
      true,
    );
  return { world, inputs };
  });
}
