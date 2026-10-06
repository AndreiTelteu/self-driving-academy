import { createFixedTickLoop } from '../simulation';
import type { FixedTickFrame, FixedTickLoop, FixedTickOptions } from '../simulation';
import type { BackendPreference } from '../rendering';
import type { RenderSession } from './rendering-lifecycle';

export type ApplicationState =
  | { readonly kind: 'LOADING' | 'DISPOSED' }
  | { readonly kind: 'READY' | 'PLAYING'; readonly rendererKind: string }
  | {
      readonly kind: 'PAUSED';
      readonly rendererKind: string;
      readonly reason: 'manual' | 'background' | 'overload';
    }
  | { readonly kind: 'ERROR'; readonly message: string };

export interface LifecycleServices<T, View> {
  createBackend(preference: BackendPreference): Promise<RenderSession>;
  createSimulation(): FixedTickOptions<T, View>;
  /** Presentation receives only frozen snapshots/projection; no authoritative writes. */
  present?(frame: FixedTickFrame<T, View>): void;
  show(state: ApplicationState): void;
  now(): number;
  scheduleFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  subscribeResize(callback: () => void): () => void;
  subscribeVisibility(callback: (hidden: boolean) => void): () => void;
  isHidden(): boolean;
}

/** One owner for RAF, backend, simulation and browser subscriptions per loaded session. */
export function createApplicationLifecycle<T, View>(services: LifecycleServices<T, View>) {
  let state: ApplicationState = { kind: 'LOADING' };
  let backend: RenderSession | undefined;
  let loop: FixedTickLoop<T, View> | undefined;
  let pending: Promise<void> | undefined;
  let frame: number | undefined;
  let disposers: (() => void)[] = [];
  let disposed = false;
  const show = (next: ApplicationState): void => {
    state = Object.freeze(next);
    services.show(state);
  };
  const release = (): void => {
    const cleanup = disposers;
    disposers = [];
    const ownedBackend = backend;
    const ownedLoop = loop;
    const ownedFrame = frame;
    backend = undefined;
    loop = undefined;
    frame = undefined;
    const errors: unknown[] = [];
    for (const dispose of [
      () => {
        if (ownedFrame !== undefined) services.cancelFrame(ownedFrame);
      },
      ...cleanup,
      () => ownedLoop?.dispose(),
      () => ownedBackend?.dispose(),
    ]) {
      try {
        dispose();
      } catch (error: unknown) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Application cleanup failed');
  };
  const fail = (error: unknown): void => {
    try {
      release();
    } catch {
      /* Every owner was attempted; preserve original fault. */
    }
    if (!disposed)
      show({ kind: 'ERROR', message: error instanceof Error ? error.message : String(error) });
  };
  const pause = (reason: 'manual' | 'background' = 'manual'): void => {
    if (state.kind !== 'PLAYING' || !loop || !backend) return;
    try {
      loop.pause(services.now(), reason);
      show({ kind: 'PAUSED', rendererKind: backend.rendererKind, reason });
    } catch (error: unknown) {
      fail(error);
    }
  };
  const play = (): void => {
    if ((state.kind !== 'READY' && state.kind !== 'PAUSED') || !loop || !backend) return;
    if (services.isHidden()) return;
    try {
      loop.resume(services.now());
      show({ kind: 'PLAYING', rendererKind: backend.rendererKind });
    } catch (error: unknown) {
      fail(error);
    }
  };
  const render = (): void => {
    frame = undefined;
    if (disposed || !backend || !loop) return;
    try {
      // READY/PAUSED still render, without calling the tick loop or admitting time.
      if (state.kind === 'PLAYING') {
        const result = loop.frame(services.now());
        if (result.state.fault) throw result.state.fault.error;
        services.present?.(result);
        if (result.state.status === 'overload') {
          show({ kind: 'PAUSED', rendererKind: backend.rendererKind, reason: 'overload' });
        }
      }
      backend.render();
      frame = services.scheduleFrame(render);
    } catch (error: unknown) {
      fail(error);
    }
  };
  return {
    load(preference: BackendPreference = 'AUTO'): Promise<void> {
      if (disposed) return Promise.resolve();
      if (pending) return pending;
      try {
        release();
      } catch (error: unknown) {
        fail(error);
        return Promise.resolve();
      }
      show({ kind: 'LOADING' });
      pending = Promise.resolve().then(async () => {
        try {
          const created = await services.createBackend(preference);
          if (disposed) {
            created.dispose();
            return;
          }
          backend = created;
          loop = createFixedTickLoop(services.createSimulation());
          loop.pause(services.now());
          disposers.push(
            services.subscribeResize(() => {
              try {
                backend?.resize();
              } catch (error: unknown) {
                fail(error);
              }
            }),
          );
          disposers.push(
            services.subscribeVisibility((hidden) => {
              if (hidden) pause('background');
              else if (state.kind === 'PAUSED' && state.reason === 'background') play();
            }),
          );
          backend.resize();
          backend.render();
          show({ kind: 'READY', rendererKind: backend.rendererKind });
          frame = services.scheduleFrame(render);
        } catch (error: unknown) {
          fail(error);
        } finally {
          pending = undefined;
        }
      });
      return pending;
    },
    play,
    pause,
    getState: (): ApplicationState => state,
    getSimulationState: () => loop?.getState() ?? null,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try {
        release();
      } finally {
        show({ kind: 'DISPOSED' });
      }
    },
  };
}
