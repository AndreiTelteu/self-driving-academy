import {
  compositionSnapshot,
  createAmbientTraffic,
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
  installVisualCapture,
  loadGlbModelLibrary,
  readCaptureConfig,
  showDevelopmentInspector,
  type BabylonDiagnostics,
  type GlbModelLibrary,
  type RecoverySceneSnapshot,
  type V3BrowserComposition,
} from './rendering/babylon';
import { observeDisplaySurface, readDisplayMetrics } from './rendering';
import { createRenderingView, createDiagnosticsPanel, createFpsCounter } from './ui';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Containerul aplicației #app lipsește.');
const view = createRenderingView(app);
const world = createCompositionWorld();
/** PBI 239: `?capture=1` pornește harnessul de capturi; fără steag este `null` și nimic nu se schimbă. */
const captureConfig = readCaptureConfig(window.location.search);
/** Contor FPS permanent (stânga-sus), independent de diagnostic; omis în capturile deterministe. */
if (!captureConfig) createFpsCounter(app);
const defaultSettings = createDefaultSettings('v3-composition');
const settings = captureConfig
  ? {
      ...defaultSettings,
      quality: {
        ...defaultSettings.quality,
        preset: captureConfig.preset,
        preferredBackend: captureConfig.backend,
      },
    }
  : defaultSettings;
/** Calitatea curentă a sesiunii: pornește din setări și urmează comutările de preset live (PBI 241). */
let sessionQuality = settings.quality;
const compositionContext = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'v3-composition-236',
  worldEpoch: 1,
});
let composition: V3BrowserComposition | undefined;
let diagnostics: BabylonDiagnostics | undefined;
let inspectScene: (() => Promise<boolean>) | undefined;
let releaseCapture: (() => void) | undefined;
const diagnosticsPanel = createDiagnosticsPanel(app, {
  report: () => diagnostics?.report() ?? null,
  // Calitatea adaptivă are nevoie de eșantioane chiar și cu panoul închis.
  setEnabled: (enabled) => diagnostics?.setEnabled(enabled || sessionQuality.adaptive),
  resolution: () => {
    const state = composition?.view.daylight.getResolutionState();
    if (!state) return null;
    const scale = Number(state.effectiveScale.toFixed(2));
    return `${state.internalWidth}×${state.internalHeight} · DPR ${state.effectiveDpr} · scară ${scale}${state.factor < 1 ? ` (adaptiv ×${state.factor})` : ''}`;
  },
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
        let ownedTraffic: ReturnType<typeof createAmbientTraffic> | undefined;
        let owned: BabylonDiagnostics | undefined;
        let releaseSurface: (() => void) | undefined;
        let models: GlbModelLibrary | undefined;
        try {
          const canvas = view.getCanvas();
          canvas.tabIndex = 0;
          // PBI 240: canvasul umple fereastra (CSS `.game-canvas`); rezoluția internă urmează
          // dimensiunea CSS reală × min(DPR, maxDpr) × scara, nu o dimensiune fixă.
          const initialMetrics = readDisplayMetrics(canvas, window);
          // PBI 254: modelele realiste se decodează o dată, înainte de construirea scenelor.
          // `?capture=1&models=procedural` păstrează rig-ul vechi pentru dovada înainte/după.
          if (captureConfig?.models !== 'procedural') {
            models = await loadGlbModelLibrary(backend.scene);
          }
          // PBI 256: trafic proaspăt pentru fiecare backend; recuperarea GPU nu refolosește tick-ul 058.
          ownedTraffic = createAmbientTraffic({
            map: world.map,
            graph: world.graph,
            context: compositionContext,
            seed: 256,
            focus: { x: world.spawn.x, z: world.spawn.z },
            avoid: [
              { x: world.spawn.x, z: world.spawn.z },
              ...world.vehicles.map((vehicle) => ({
                x: vehicle.positionM.x,
                z: vehicle.positionM.z,
              })),
            ],
          });
          ownedComposition = createV3BrowserComposition({
            scene: backend.scene,
            surface: app,
            hudRoot: app,
            layout: world.layout,
            settings,
            context: compositionContext,
            spawn: world.spawn,
            vehicles: world.vehicles,
            traffic: ownedTraffic.traffic,
            map: world.map,
            graph: world.graph,
            rendererKind: backend.rendererKind,
            preset: settings.quality.preset,
            viewport: initialMetrics,
            enabled: () => application.getState().kind === 'PLAYING',
            models,
          });
          composition = ownedComposition;
          const surface = ownedComposition;
          releaseSurface = observeDisplaySurface({
            canvas,
            env: window,
            onChange: (metrics) => surface.resize(metrics),
          }).dispose;
          // Rezoluția exactă a canvasului după setarea nivelului hardware (la creare).
          backend.resize();
          if (captureConfig) {
            releaseCapture?.();
            releaseCapture = installVisualCapture({
              composition: ownedComposition,
              canvas,
              config: captureConfig,
            });
          }
          owned = diagnoseBackend(backend, {
            enabled: diagnosticsPanel.root.open || sessionQuality.adaptive,
            // Calitatea adaptivă (rezoluție întâi, apoi preset) numai când jucătorul a cerut-o.
            onSample: (sample) => {
              // Pauzele și tab-urile ascunse produc intervale uriașe: nu reprezintă costul cadrului.
              if (!sessionQuality.adaptive || sample.frameMs > 1000) return;
              ownedComposition?.view.daylight.observe(sample, performance.now());
            },
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
          releaseSurface?.();
          try {
            ownedComposition?.dispose();
          } finally {
            try {
              ownedTraffic?.dispose();
            } finally {
              try {
                models?.dispose();
              } finally {
                backend.dispose();
              }
            }
          }
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
              releaseSurface?.();
              releaseSurface = undefined;
              try {
                ownedComposition?.dispose();
              } finally {
                // PBI 256: compunerea nu deține traficul; registry-ul și actorii 058 se eliberează aici.
                ownedTraffic?.dispose();
                if (composition === ownedComposition) composition = undefined;
                if (diagnostics === owned) {
                  diagnostics = undefined;
                  inspectScene = undefined;
                }
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
      const frame = composition.step(step.tick);
      // PBI 257: HUD-ul central se actualizează din frame-ul autoritativ, la ~10 Hz.
      if (step.tick % 6 === 0)
        view.updatePlayHud({
          speedMps: frame.hud.speedMps,
          mode: frame.hud.mode,
          controlledKind: frame.hud.controlledKind,
          canToggle: frame.hud.controlledKind === 'VEHICLE',
        });
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
view.onMode(() => {
  composition?.toggleVehicleMode();
  // Butonul HUD nu trebuie să rămână activ: altfel 025 blochează W/M în dialoguri/butoane.
  view.getCanvas().focus();
});
void application.load(preference);

/** Diagnostice read-only pentru proba de browser 236; nu expun nicio scriere de autoritate. */
interface V3DebugGlobal {
  ready(): boolean;
  read(): unknown;
  backend(): unknown;
  stats(): unknown;
  /** PBI 241: starea AA/post-procesării (cine aplică tone mappingul, HDR, efecte). */
  postProcessing(): unknown;
  /** PBI 241 (numai DEV, `?capture` sau `?debug`): comutare live de preset prin `applyPreferences`. */
  setPreset?(preset: 'LOW' | 'MEDIUM' | 'HIGH'): void;
  /** PBI 241 (numai DEV, `?capture` sau `?debug`): scena Babylon, pentru resurse și calibrare. */
  scene?(): unknown;
  /** PBI 244 (numai DEV, `?capture` sau `?debug`): daylight, pentru statistici de umbre/AO și efecte on/off. */
  daylight?(): unknown;
  reset(): void;
  probeDoubleDelivery(): string;
}
const debugGlobal: V3DebugGlobal = {
  ready: () => composition !== undefined,
  read: () => composition?.read() ?? null,
  backend: () => composition?.backendInfo() ?? null,
  stats: () => composition?.stats() ?? null,
  postProcessing: () => composition?.view.daylight.getPostProcessingState() ?? null,
  reset: () => composition?.reset(),
  probeDoubleDelivery: () => composition?.probeDoubleDelivery() ?? 'NO_COMPOSITION',
};
// Producția păstrează contractul numai-citire; scrierile de prezentare apar doar în DEV, cu
// `?capture` sau `?debug`. Niciuna nu scrie în simulare.
if (
  import.meta.env.DEV ||
  captureConfig ||
  new URLSearchParams(window.location.search).has('debug')
) {
  debugGlobal.setPreset = (preset) => {
    if (!composition) return;
    sessionQuality = { ...sessionQuality, preset };
    composition.view.daylight.applyPreferences(sessionQuality);
  };
  debugGlobal.scene = () => composition?.view.scene ?? null;
  debugGlobal.daylight = () => composition?.view.daylight ?? null;
}
(globalThis as unknown as { __v3Composition?: V3DebugGlobal }).__v3Composition = debugGlobal;

const dispose = (): void => {
  try {
    focusBinding.dispose();
    application.dispose();
  } finally {
    composition = undefined;
    releaseCapture?.();
    releaseCapture = undefined;
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
