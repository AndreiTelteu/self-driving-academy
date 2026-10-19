/** Private normal-disposal seam. Only the probe's admitted owners are supplied. */
export function createProbeDisposer<Controller>(
  assertMutable: () => void,
  invalidate: () => void,
  owners: {
    collisionRegistry: { dispose(): void };
    namedBoxes: { clear(): void };
    registry: { dispose(): void };
    cars: { values(): IterableIterator<{ controller: Controller }>; clear(): void };
    dynamicColliders: { length: number };
    removeController: (controller: Controller) => void;
    freeWorld: () => void;
  },
): () => void {
  let attempted = false;
  return () => {
    if (attempted) return;
    assertMutable();
    // Fence before invalidation/release callbacks; rejected admission remains retryable.
    attempted = true;
    invalidate();
    const errors: unknown[] = [];
    const attempt = (release: () => void) => {
      try {
        release();
      } catch (error: unknown) {
        errors.push(error);
      }
    };
    attempt(() => owners.collisionRegistry.dispose());
    attempt(() => owners.namedBoxes.clear());
    attempt(() => owners.registry.dispose());
    // Production cars is a private Map bounded by PHYSICS_CONFIG.vehicles.
    for (const { controller } of owners.cars.values())
      attempt(() => owners.removeController(controller));
    attempt(() => owners.cars.clear());
    attempt(() => { owners.dynamicColliders.length = 0; });
    attempt(owners.freeWorld);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Physics disposal failed');
  };
}
