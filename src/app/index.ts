import { createBootstrapSimulation } from '../simulation';
export { createVehicleRecoveryFeature } from './vehicle-recovery';
import type { SnapshotStore } from '../persistence';
import type { Renderer } from '../rendering';
export { createRenderingLifecycle, type RenderingState } from './rendering-lifecycle';
export {
  createRendererRecovery,
  ownRecoverySnapshot,
  type RecoveryRenderer,
  type RendererRecoveryState,
  type RendererRecoveryServices,
} from './renderer-recovery';

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
export {
  createApplicationLifecycle,
  type ApplicationPauseReason,
  type ApplicationState,
} from './application-lifecycle';
export {
  createPauseFocusOwner,
  PAUSE_FOCUS_MAX_HELD_COMMANDS,
  PAUSE_FOCUS_VERSION,
  type PauseFocusCause,
  type PauseFocusMode,
  type PauseFocusOwner,
  type PauseFocusPorts,
  type PauseFocusState,
  type PauseFocusStats,
  type PauseFocusSurface,
} from './pause-focus';
export { createManualSegmentBridge, type ManualSegmentStepCause } from './manual-segment-bridge';
