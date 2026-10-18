import type { BackendPreference } from '../rendering';

export interface RenderSession {
  readonly rendererKind: string;
  render(): void;
  resize(): void;
  dispose(): void;
}
export type RenderingState =
  | { readonly kind: 'LOADING' }
  | { readonly kind: 'READY'; readonly rendererKind: string }
  | { readonly kind: 'ERROR'; readonly message: string };
export interface RenderingLifecycleServices {
  createBackend(preference: BackendPreference): Promise<RenderSession>;
  show(state: RenderingState): void;
  scheduleFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  subscribeResize(callback: () => void): () => void;
}
/** Serial retry and ownership also cover dispose while init is pending. */
export function createRenderingLifecycle(services: RenderingLifecycleServices) {
  let disposed = false;
  let pending: Promise<void> | undefined;
  let backend: RenderSession | undefined;
  let frame: number | undefined;
  let unsubscribe: (() => void) | undefined;
  const release = (): void => {
    const ownedFrame = frame;
    const ownedSubscription = unsubscribe;
    const ownedBackend = backend;
    frame = undefined;
    unsubscribe = undefined;
    backend = undefined;
    const errors: unknown[] = [];
    for (const cleanup of [
      () => {
        if (ownedFrame !== undefined) services.cancelFrame(ownedFrame);
      },
      () => ownedSubscription?.(),
      () => ownedBackend?.dispose(),
    ]) {
      try {
        cleanup();
      } catch (error: unknown) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Cleanup failed');
  };
  const fail = (error: unknown): void => {
    try {
      release();
    } finally {
      services.show({
        kind: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const render = (): void => {
    frame = undefined;
    if (disposed || !backend) return;
    try {
      backend.render();
      frame = services.scheduleFrame(render);
    } catch (error: unknown) {
      try {
        fail(error);
      } catch {
        /* State is already recoverable. */
      }
    }
  };
  return {
    start(preference: BackendPreference = 'AUTO'): Promise<void> {
      if (disposed) return Promise.resolve();
      if (pending) return pending;
      try {
        release();
      } catch (error: unknown) {
        services.show({
          kind: 'ERROR',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      services.show({ kind: 'LOADING' });
      pending = Promise.resolve().then(async () => {
        try {
          const created = await services.createBackend(preference);
          if (disposed) {
            created.dispose();
            return;
          }
          backend = created;
          unsubscribe = services.subscribeResize(() => {
            try {
              backend?.resize();
            } catch (error: unknown) {
              try {
                fail(error);
              } catch {
                /* All owners released. */
              }
            }
          });
          backend.resize();
          backend.render();
          services.show({ kind: 'READY', rendererKind: backend.rendererKind });
          frame = services.scheduleFrame(render);
        } catch (error: unknown) {
          if (!disposed) {
            try {
              fail(error);
            } catch {
              /* All owners released. */
            }
          }
        } finally {
          pending = undefined;
        }
      });
      return pending;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
