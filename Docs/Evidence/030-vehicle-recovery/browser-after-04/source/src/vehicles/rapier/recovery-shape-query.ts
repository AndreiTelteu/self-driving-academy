interface OwnedRaw {
  free(): void;
}

/** Private synchronous Rapier boundary: candidate buffers never survive one inspection.
 * Allocation is lazy so an inspection with no eligible collider acquires nothing.
 */
export function withRecoveryShapeQuery<
  P extends OwnedRaw,
  R extends OwnedRaw,
  S extends OwnedRaw,
  T,
>(
  ports: {
    position(): P;
    rotation(): R;
    shape(): S;
    intersects(handle: number, position: P, rotation: R, shape: S): boolean;
  },
  inspect: (intersects: (handle: number) => boolean) => T,
): T {
  const owned: OwnedRaw[] = [];
  let position!: P;
  let rotation!: R;
  let shape!: S;
  let attempted = false,
    acquisitionFailed = false,
    acquisitionError: unknown,
    closed = false;
  const intersects = (handle: number) => {
    if (closed) throw new Error('Recovery inspection query closed');
    if (!attempted) {
      attempted = true;
      try {
        position = ports.position();
        owned.push(position);
        rotation = ports.rotation();
        owned.push(rotation);
        shape = ports.shape();
        owned.push(shape);
      } catch (error) {
        acquisitionFailed = true;
        acquisitionError = error;
      }
    }
    // A failed acquisition is terminal for this inspection, never retried per collider.
    // The caller still visits/counts every collider and defers this original error.
    if (acquisitionFailed) throw acquisitionError;
    return ports.intersects(handle, position, rotation, shape);
  };
  let value!: T,
    failed = false,
    primary: unknown;
  const cleanup: unknown[] = [];
  try {
    value = inspect(intersects);
  } catch (error) {
    failed = true;
    primary = error;
  } finally {
    closed = true;
    for (const resource of owned) {
      try {
        resource.free();
      } catch (error) {
        cleanup.push(error);
      }
    }
  }
  if (!failed && acquisitionFailed) {
    failed = true;
    primary = acquisitionError;
  }
  if (cleanup.length)
    throw new AggregateError(
      failed ? [primary, ...cleanup] : cleanup,
      'Recovery inspection query cleanup failed',
    );
  if (failed) throw primary;
  return value;
}
