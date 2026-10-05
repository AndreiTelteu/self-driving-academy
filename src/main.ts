import { createApplicationLifecycle } from './app';
import { createDefaultSettings } from './settings';
import {
  createRenderingBackend,
  diagnoseBackend,
  showDevelopmentInspector,
  type BabylonDiagnostics,
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
const application = createApplicationLifecycle({
  createBackend: async (selected) => {
    const backend = await createRenderingBackend(view.getCanvas(), selected);
    const owned = diagnoseBackend(backend, {
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
  isHidden: () => document.hidden,
  subscribeVisibility: (callback) => {
    const changed = (): void => callback(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  },
});
view.onRetry(() => {
  void application.load(preference);
});
view.onPlay(application.play);
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
