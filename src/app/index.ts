import { createBootstrapSimulation } from '../simulation';
import type { SnapshotStore } from '../persistence';
import type { Renderer } from '../rendering';
export { createRenderingLifecycle, type RenderingState } from './rendering-lifecycle';

export interface ApplicationServices {
  readonly renderer: Renderer;
  readonly snapshotStore: SnapshotStore;
}

export interface Application {
  start(): void;
  saveSnapshot(): Promise<void>;
  dispose(): void;
}

/** Composition/lifecycle owns adapters; domain modules do not know them. */
export function createApplication(services: ApplicationServices): Application {
  const simulation = createBootstrapSimulation();
  let started = false;
  let disposed = false;
  const assertActive = (): void => {
    if (disposed) throw new Error('Aplicația este deja eliberată.');
  };
  return {
    start: () => {
      assertActive();
      if (started) return;
      services.renderer.present(simulation.getSnapshot());
      started = true;
    },
    saveSnapshot: () => {
      assertActive();
      return services.snapshotStore.save(simulation.getSnapshot());
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      services.renderer.dispose();
    },
  };
}
