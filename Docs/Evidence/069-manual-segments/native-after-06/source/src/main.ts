import { createApplicationLifecycle, createRendererRecovery, type RecoveryRenderer } from './app';
import { createDefaultSettings } from './settings';
import {
  createBabylonRecoverySession,
  diagnoseBackend,
  showDevelopmentInspector,
  type BabylonDiagnostics,
  type RecoverySceneSnapshot,
} from './rendering/babylon';
import { createRenderingView, createDiagnosticsPanel } from './ui';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Containerul aplicației #app lipsește.');
const view = createRenderingView(app);
let diagnostics: BabylonDiagnostics | undefined;
let inspectScene: (() => Promise<boolean>) | undefined;
const diagnosticsPanel = createDiagnosticsPanel(app, {
  report: () => diagnostics?.report() ?? null,
  setEnabled: (enabled) => diagnostics?.setEnabled(enabled),
  ...(import.meta.env.DEV ? { inspector: () => inspectScene?.() ?? Promise.resolve(false) } : {}),
});
const preference = createDefaultSettings('local-bootstrap').quality.preferredBackend;
interface BootstrapCheckpoint {
  readonly tick: number;
  readonly scene: RecoverySceneSnapshot;
}
let activeRecovery: ReturnType<typeof createRendererRecovery<BootstrapCheckpoint>> | undefined;
const application = createApplicationLifecycle({
  createBackend: async (selected): Promise<RecoveryRenderer> => {
    const recovery = createRendererRecovery<BootstrapCheckpoint>({
      suspendSimulation: () => application.pause(),
      captureSnapshot: (): BootstrapCheckpoint => {
        const state = application.getSimulationState();
        const tick = state?.snapshots?.current.tick ?? state?.tick ?? 0;
        return {
          tick,
          scene: {
            render: { sessionId: 'local-bootstrap', worldEpoch: 0, tick, vehicles: [] },
            assets: [],
            bindings: [],
          },
        };
      },
      show: (state) => {
        if (activeRecovery !== recovery || !application.getSimulationState()) return;
        if (state.kind === 'RECOVERING') view.show({ kind: 'LOADING' });
        else if (state.kind === 'ERROR') view.show({ kind: 'ERROR', message: state.message });
        else if (state.kind === 'READY') view.show(application.getState());
      },
      createRenderer: async (checkpoint, kind, onLost) => {
        const backend = await createBabylonRecoverySession(
          view.getCanvas(),
          kind,
          checkpoint.scene,
          onLost,
        );
        let owned: BabylonDiagnostics;
        try {
          owned = diagnoseBackend(backend, {
            enabled: diagnosticsPanel.root.open,
            counters: () => {
              const state = application.getSimulationState();
              return {
                tick: state?.tick ?? null,
                debtMs: state ? state.debtSeconds * 1000 : null,
                pendingBytes: null,
                queuedJobs: null,
                entityCount: null,
                profileVersion: null,
                workerState: null,
              };
            },
          });
        } catch (error: unknown) {
          backend.dispose();
          throw error;
        }
        diagnostics = owned;
        if (import.meta.env.DEV) inspectScene = () => showDevelopmentInspector(backend.scene);
        return {
          ...owned.backend,
          render: () => {
            owned.backend.render();
            diagnosticsPanel.refresh();
          },
          dispose: () => {
            try {
              owned.backend.dispose();
            } finally {
              if (diagnostics === owned) {
                diagnostics = undefined;
                inspectScene = undefined;
              }
            }
          },
        };
      },
    });
    activeRecovery = recovery;
    await recovery.start(selected);
    const state = recovery.getState();
    if (state.kind !== 'READY') {
      recovery.dispose();
      throw new Error(state.kind === 'ERROR' ? state.message : 'Renderer recovery interrupted');
    }
    return {
      get rendererKind() {
        return recovery.getRenderer()?.rendererKind ?? selected;
      },
      render: recovery.render,
      resize: recovery.resize,
      dispose: () => {
        try {
          recovery.dispose();
        } finally {
          if (activeRecovery === recovery) activeRecovery = undefined;
        }
      },
    };
  },
  createSimulation: () => {
    let tick = 0;
    return {
      captureSnapshot: () => ({ tick }),
      step: (step) => {
        tick = step.tick;
      },
      interpolate: (_previous, current) => ({ tick: current.tick }),
    };
  },
  show: view.show,
  now: () => performance.now(),
  scheduleFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  subscribeResize: (callback) => {
    window.addEventListener('resize', callback);
    return () => window.removeEventListener('resize', callback);
  },
  isHidden: () => document.hidden || activeRecovery?.getState().kind !== 'READY',
  subscribeVisibility: (callback) => {
    const changed = (): void => callback(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  },
});
view.onRetry(() => {
  if (!activeRecovery || !application.getSimulationState()) void application.load(preference);
  else if (activeRecovery.getState().kind === 'ERROR' && activeRecovery.getSnapshot())
    void activeRecovery.retry();
  else void activeRecovery.recover('User requested renderer reload');
});
view.onPlay(() => {
  if (activeRecovery?.getState().kind === 'READY') application.play();
});
view.onPause(() => application.pause());
void application.load(preference);
const dispose = (): void => {
  try {
    application.dispose();
  } finally {
    diagnosticsPanel.dispose();
    view.dispose();
  }
};
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('pagehide', dispose);
    dispose();
  });
}
