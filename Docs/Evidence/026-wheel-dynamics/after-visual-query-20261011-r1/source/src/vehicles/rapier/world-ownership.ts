/** Internal synchronous handoff guard; World.free owns all its native children. */
export function initializeOwnedWorld<T>(
  world: { free(): void },
  releaseReservation: () => void,
  initialize: (freeWorld: () => void) => T,
): T {
  let attempted = false;
  const freeWorld = () => {
    if (attempted) return;
    attempted = true;
    world.free();
    // A throwing native free leaves ownership unknown and capacity reserved.
    releaseReservation();
  };
  try {
    return initialize(freeWorld);
  } catch (primary: unknown) {
    try {
      freeWorld();
    } catch (cleanup: unknown) {
      throw new AggregateError([primary, cleanup], 'Physics initialization and cleanup failed');
    }
    throw primary;
  }
}
