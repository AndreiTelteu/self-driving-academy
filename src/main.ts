import {
  compositionSnapshot,
  createApplicationLifecycle,
  createCompositionWorld,
  createPauseFocusOwner,
  createRendererRecovery,
  type RecoveryRenderer,
} from './app';
import { createDefaultSettings } from './settings';
import { bindPauseFocusInput } from './input';
import {
  createBabylonRecoverySession,
  createV3BrowserComposition,
  diagnoseBackend,
  showDevelopmentInspector,
  type BabylonDiagnostics,
  type RecoverySceneSnapshot,
  type V3BrowserComposition,
} from './rendering/babylon';
import { createRenderingView, createDiagnosticsPanel } from './ui';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Containerul aplicației #app lipsește.');
const view = createRenderingView(app);
const world = createCompositionWorld();
const settings = createDefaultSettings('v3-composition');
const compositionContext = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'v3-composition-236',
  worldEpoch: 1,
});
let composition: V3BrowserComposition | undefined;
let diagnostics: BabylonDiagnostics | undefined;
let inspectScene: (() => Promise<boolean>) | undefined;
const diagnosticsPanel = createDiagnosticsPanel(app, {
  report: () => diagnostics?.report() ?? null,
  setEnabled: (enabled) => diagnostics?.setEnabled(enabled),
  ...(import.meta.env.DEV ? { inspector: () => inspectScene?.() ?? Promise.resolve(false) } : {}),
});
const preference = settings.quality.preferredBackend;
interface BootstrapCheckpoint {
  readonly tick: number;
  readonly scene: RecoverySceneSnapshot;
}
let activeRecovery: ReturnType<typeof createRendererRecovery<BootstrapCheckpoint>> | undefined;
const pauseFocus = createPauseFocusOwner({
  suspend: (cause) => application.pause(cause),
  resume: (cause) => {
    const state = application.getState();
    if (state.kind === 'PAUSED' && state.reason === cause) application.play();
  },
});
/** Browser alt-tab/blur only *reports*; the authoritative suspension stays a 070 decision. */
const focusBinding = bindPauseFocusInput({
  surface: app,
  onFocusLost: () => pauseFocus.setFocusLost(true),
  onFocusGained: () => pauseFocus.setFocusLost(false),
});

/** Snapshot compact pentru bucla fixă; compunerea rămâne proprietarul stării. */
function captureCompositionSnapshot() {
  return composition
    ? compositionSnapshot(composition.composition)
    : ({ tick: 0, ready: false } as const);
}

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
        let ownedComposition: V3BrowserComposition | undefined;
        let owned: BabylonDiagnostics | undefined;
        try {
          const canvas = view.getCanvas();
          canvas.tabIndex = 0;
          // Suprafața de joc a compunerii: 16:9 în coloana aplicației (640×360 la 1440×900).
          canvas.style.width = '100%';
          canvas.style.height = '360px';
          canvas.style.maxWidth = '40rem';
          canvas.style.display = 'block';
          canvas.style.background = '#0b1f1a';
          backend.resize();
          const dpr = window.devicePixelRatio || 1;
          ownedComposition = createV3BrowserComposition({
            scene: backend.scene,
            surface: app,
            hudRoot: app,
            layout: world.layout,
            settings,
            context: compositionContext,
            spawn: world.spawn,
            vehicles: world.vehicles,
            rendererKind: backend.rendererKind,
            preset: settings.quality.preset,
            viewport: {
              width: Math.max(320, canvas.clientWidth || 1280),
              height: Math.max(240, canvas.clientHeight || 720),
              dpr,
            },
            enabled: () => application.getState().kind === 'PLAYING',
          });
          composition = ownedComposition;
          owned = diagnoseBackend(backend, {
            enabled: diagnosticsPanel.root.open,
            counters: () => {
              const state = application.getSimulationState();
              const stats = ownedComposition?.stats();
              return {
                tick: state?.tick ?? null,
                debtMs: state ? state.debtSeconds * 1000 : null,
                pendingBytes: null,
                queuedJobs: null,
                entityCount: stats ? 1 + stats.vehicles : null,
                profileVersion: null,
                workerState: null,
              };
            },
          });
        } catch (error: unknown) {
          ownedComposition?.dispose();
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
              ownedComposition?.dispose();
              if (composition === ownedComposition) composition = undefined;
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
  createSimulation: () => ({
    // Compunerea a afișat deja tick-ul 1 la inițializare; bucla pornește de la el.
    initialTick: 1,
    captureSnapshot: captureCompositionSnapshot,
    step: (step) => {
      if (!composition) throw new Error('Compunerea V3 nu este inițializată.');
      composition.step(step.tick);
    },
    interpolate: (_previous, current) => current,
  }),
  present: () => {
    composition?.present();
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
  // The owner refuses an explicit resume while a panel/menu/focus loss still demands suspension.
  if (!pauseFocus.requestResume()) return;
  if (activeRecovery?.getState().kind === 'READY') {
    application.play();
    // Butonul rămâne elementul activ după click; inputul 066 cere focus în afara butoanelor.
    view.getCanvas().focus();
  }
});
view.onPause(() => application.pause());
void application.load(preference);

/** Diagnostice read-only pentru proba de browser 236; nu expun nicio scriere de autoritate. */
interface V3DebugGlobal {
  ready(): boolean;
  read(): unknown;
  backend(): unknown;
  stats(): unknown;
  reset(): void;
  probeDoubleDelivery(): string;
}
const debugGlobal: V3DebugGlobal = {
  ready: () => composition !== undefined,
  read: () => composition?.read() ?? null,
  backend: () => composition?.backendInfo() ?? null,
  stats: () => composition?.stats() ?? null,
  reset: () => composition?.reset(),
  probeDoubleDelivery: () => composition?.probeDoubleDelivery() ?? 'NO_COMPOSITION',
};
(globalThis as unknown as { __v3Composition?: V3DebugGlobal }).__v3Composition = debugGlobal;

const dispose = (): void => {
  try {
    focusBinding.dispose();
    application.dispose();
  } finally {
    composition = undefined;
    (globalThis as unknown as { __v3Composition?: V3DebugGlobal }).__v3Composition = undefined;
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
