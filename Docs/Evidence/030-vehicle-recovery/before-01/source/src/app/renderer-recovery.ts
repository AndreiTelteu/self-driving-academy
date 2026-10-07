import type { BackendPreference } from '../rendering';
import type { SnapshotReadonly } from '../simulation';

export interface RecoveryRenderer {
  readonly rendererKind: string;
  render(): void;
  resize(): void;
  dispose(): void;
}
export type RendererRecoveryState =
  | { readonly kind: 'READY' | 'RECOVERING' | 'DISPOSED'; readonly generation: number }
  | {
      readonly kind: 'ERROR';
      readonly generation: number;
      readonly message: string;
      readonly retryAvailable: boolean;
    };
export interface RendererRecoveryServices<T> {
  captureSnapshot(): T;
  /** Stops ticks before capture. Recovery never advances or reinstantiates the simulation. */
  suspendSimulation(): void;
  createRenderer(
    snapshot: SnapshotReadonly<T>,
    preference: BackendPreference,
    onLost: (reason: unknown) => void,
  ): Promise<RecoveryRenderer>;
  show(state: RendererRecoveryState): void;
}

/** Own one finite plain-data RAM checkpoint; reject accessors/prototypes and bound capture size. */
export function ownRecoverySnapshot<T>(
  input: T,
  maxNodes = 100000,
  maxEstimatedBytes = 32 * 1024 * 1024,
): SnapshotReadonly<T> {
  let nodes = 0;
  let estimatedBytes = 0;
  const charge = (bytes: number) => {
    estimatedBytes += bytes;
    if (estimatedBytes > maxEstimatedBytes)
      throw new Error('Recovery snapshot byte capacity exceeded');
  };
  const ancestors = new Set<object>();
  const copy = (value: unknown, depth: number): unknown => {
    if (++nodes > maxNodes || depth > 64) throw new Error('Recovery snapshot capacity exceeded');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      charge(typeof value === 'string' ? value.length * 2 + 8 : 4);
      return value;
    }
    if (typeof value === 'number') {
      charge(8);
      if (!Number.isFinite(value)) throw new Error('Nonfinite recovery snapshot');
      return value;
    }
    if (typeof value !== 'object' || value === null || ancestors.has(value))
      throw new Error('Invalid recovery snapshot tree');
    const array = Array.isArray(value),
      proto = Object.getPrototypeOf(value);
    if (proto !== (array ? Array.prototype : Object.prototype) && proto !== null)
      throw new Error('Invalid recovery snapshot prototype');
    ancestors.add(value);
    charge(24);
    const keys = Reflect.ownKeys(value);
    const result: Record<string, unknown> | unknown[] = array ? [] : {};
    if (array && keys.length !== value.length + 1)
      throw new Error('Sparse or extended snapshot array');
    if (
      array &&
      keys.some(
        (key) =>
          key !== 'length' &&
          (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length),
      )
    )
      throw new Error('Sparse or extended snapshot array');
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== 'string' ||
        !descriptor ||
        !('value' in descriptor) ||
        !descriptor.enumerable
      )
        throw new Error('Snapshot accessor or hidden field');
      charge(key.length * 2 + 16);
      Object.defineProperty(result, key, {
        value: copy(descriptor.value, depth + 1),
        enumerable: true,
      });
    }
    ancestors.delete(value);
    return Object.freeze(result);
  };
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1) throw new Error('Invalid snapshot capacity');
  if (!Number.isSafeInteger(maxEstimatedBytes) || maxEstimatedBytes < 1)
    throw new Error('Invalid snapshot byte capacity');
  return copy(input, 0) as SnapshotReadonly<T>;
}

/** No RAF or persistence ownership: root lifecycle drives render/resize and explicit resume. */
export function createRendererRecovery<T>(services: RendererRecoveryServices<T>) {
  let renderer: RecoveryRenderer | undefined, pending: Promise<void> | undefined;
  let snapshot: SnapshotReadonly<T> | null = null,
    state: RendererRecoveryState = { kind: 'RECOVERING', generation: 0 };
  let generation = 0,
    disposed = false,
    preference: BackendPreference = 'AUTO';
  const show = (next: RendererRecoveryState) => {
    state = Object.freeze(next);
    services.show(state);
  };
  const release = () => {
    const owned = renderer;
    renderer = undefined;
    owned?.dispose();
  };
  const fail = (error: unknown) => {
    try {
      release();
    } catch {
      /* Preserve original error; remaining owners belong to renderer disposal. */
    }
    if (!disposed)
      show({
        kind: 'ERROR',
        generation,
        message: error instanceof Error ? error.message : String(error),
        retryAvailable: snapshot !== null,
      });
  };
  const rebuild = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    const ticket = ++generation;
    let lostDuringCreation: unknown = null;
    show({ kind: 'RECOVERING', generation });
    pending = Promise.resolve().then(async () => {
      try {
        release();
        if (!snapshot) throw new Error('RAM snapshot unavailable');
        const created = await services.createRenderer(snapshot, preference, (reason) => {
          if (disposed || ticket !== generation) return;
          if (pending) {
            lostDuringCreation = reason ?? new Error('GPU lost during reconstruction');
            return;
          }
          void recover(reason);
        });
        if (disposed || ticket !== generation) {
          created.dispose();
          return;
        }
        renderer = created;
        if (lostDuringCreation !== null) throw lostDuringCreation;
        renderer.resize();
        renderer.render();
        if (lostDuringCreation !== null) throw lostDuringCreation;
        show({ kind: 'READY', generation });
      } catch (error: unknown) {
        fail(error);
      } finally {
        pending = undefined;
      }
    });
    return pending;
  };
  const capture = () => {
    snapshot = null;
    services.suspendSimulation();
    if (disposed) return;
    const captured = ownRecoverySnapshot(services.captureSnapshot());
    if (!disposed) snapshot = captured;
  };
  const recover = (_reason?: unknown): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    try {
      capture();
    } catch (error: unknown) {
      fail(error);
      return Promise.resolve();
    }
    return rebuild();
  };
  return {
    start(nextPreference: BackendPreference = 'AUTO'): Promise<void> {
      if (disposed) return Promise.resolve();
      if (pending) return pending;
      preference = nextPreference;
      return recover();
    },
    recover,
    /** Reuses exactly the retained checkpoint after repeated failure; no recapture or reset. */
    retry(): Promise<void> {
      if (disposed || state.kind === 'READY') return Promise.resolve();
      return rebuild();
    },
    resize(): void {
      if (disposed) return;
      try {
        renderer?.resize();
      } catch (error: unknown) {
        void recover(error);
      }
    },
    render(): void {
      if (disposed || state.kind !== 'READY') return;
      try {
        renderer?.render();
      } catch (error: unknown) {
        void recover(error);
      }
    },
    getState: () => state,
    getSnapshot: () => snapshot,
    getRenderer: () => renderer,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      generation++;
      snapshot = null;
      try {
        release();
      } finally {
        show({ kind: 'DISPOSED', generation });
      }
    },
  };
}
