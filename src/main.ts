import {
  compositionSnapshot,
  createAmbientTraffic,
  createApplicationLifecycle,
  createCompositionWorld,
  createGameShell,
  createRendererRecovery,
  createSessionFlow,
  type GameTickPort,
  type RecoveryRenderer,
  type SessionFlow,
  type SessionFlowMenu,
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
import {
  createRenderingView,
  createDiagnosticsPanel,
  createFpsCounter,
  createGameShellHost,
} from './ui';
import { computeProfileVersionChecksum } from './profiles';
import type { ProfileVersion, ProfileVersionContent } from './profiles';
import { copyProfileForChaos } from './persistence';
import type { SessionKind, SessionWorldPort } from './persistence';
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
/** PBI 261: cele două sesiuni au identități stabile, distincte; shell-ul le adoptă la tranziție. */
const ACADEMY_SESSION_ID = 'session-261-academy' as const;
const CHAOS_SESSION_ID = 'session-261-chaos' as const;
const sessionBootedAt = new Date().toISOString();
const compositionContext = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: ACADEMY_SESSION_ID,
  worldEpoch: 1,
  learningEpoch: 0,
});
let composition: V3BrowserComposition | undefined;
let diagnostics: BabylonDiagnostics | undefined;
let inspectScene: (() => Promise<boolean>) | undefined;
let releaseCapture: (() => void) | undefined;
/** PBI 261: fluxul de sesiuni este compus după lifecycle, dar UI-ul îl interoghează de la început. */
const sessionModules: { flow: SessionFlow | undefined } = { flow: undefined };
let sessionNotice: string | null = null;
const EMPTY_SESSION_MENU: SessionFlowMenu = Object.freeze({
  version: '261-session-flow-v1',
  live: null,
  choices: Object.freeze([]),
  ledgerIsolation: false,
});
/** PBI 261: portul PRE_WORLD verifică în fiecare tick identitatea adoptată de flux. */
const sessionTickPort: GameTickPort = {
  id: 'sessions',
  version: '261-session-flow-v1',
  step(context) {
    const flow = sessionModules.flow;
    if (!flow) return;
    if (!flow.observeTick(context))
      throw new Error(
        `Sesiunea din tick (${context.sessionId}/${context.worldEpoch}/${context.learningEpoch}) nu este cea live.`,
      );
  },
};
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
/**
 * PBI 260: composition root-ul deține tick-ul autoritar, pauza/focusul și ordinea porturilor.
 * Porturile sistemelor 261–286 nu sunt încă livrate; shell-ul le raportează explicit ca absente
 * și nu le înlocuiește cu simulări paralele.
 */
const shell = createGameShell({
  context: compositionContext,
  ports: { sessions: sessionTickPort },
  suspend: (cause) => application.pause(cause),
  resume: (cause) => {
    const state = application.getState();
    if (state.kind === 'PAUSED' && state.reason === cause) {
      application.play();
      // 025 blochează tastele cât timp un buton are focusul; reluarea readuce focusul pe canvas.
      if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
    }
  },
  resetHeldCommands: () => composition?.composition.releaseInput(),
});
/** Singura gazdă UI a shell-ului: start, pauză, reluare și panoul de integrare. */
const shellHost = createGameShellHost({
  root: app,
  snapshot: () => shell.status(),
  onStart: () => startSession(),
  onPause: () => shell.setMenuOpen(true),
  onResume: () => resumeSession(),
  sessionMenu: () => sessionModules.flow?.menu() ?? EMPTY_SESSION_MENU,
  onChooseSession: (kind) => {
    void chooseSession(kind as SessionKind);
  },
  onResetWorld: () => {
    void resetSessionWorld();
  },
  onOpenPanel: () => shell.openPanel('integration'),
  onClosePanel: () => {
    shell.closePanel();
    if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
  },
});
/** Fiecare tranziție de sesiune ajunge și în gazda shell-ului, nu doar în view-ul de randare. */
const showView = (state: Parameters<typeof view.show>[0]): void => {
  view.show(state);
  shellHost.setSessionState(state.kind);
};
/** Browser alt-tab/blur only *reports*; the authoritative suspension stays a 070 decision. */
const focusBinding = bindPauseFocusInput({
  surface: app,
  onFocusLost: () => shell.setFocusLost(true),
  onFocusGained: () => shell.setFocusLost(false),
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
        if (state.kind === 'RECOVERING') showView({ kind: 'LOADING' });
        else if (state.kind === 'ERROR') showView({ kind: 'ERROR', message: state.message });
        else if (state.kind === 'READY') showView(application.getState());
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
        /** Shell-ul refuză o a doua lume activă; detașarea este perechea fiecărei atașări. */
        let attachedShellWorld = false;
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
          // PBI 260: compunerea V3 este singura lume autoritară a shell-ului. Nicio a doua
          // simulare nu este creată aici; shell-ul doar o atașează și o pașește pe tick.
          const ownedWorld = ownedComposition;
          shell.attachWorld({
            version: ownedWorld.version,
            currentTick: () => ownedWorld.composition.frame.tick,
            step: (tick) => ownedWorld.step(tick),
            present: () => ownedWorld.present(),
          });
          attachedShellWorld = true;
          shell.setMode(ownedComposition.composition.frame.hud.mode);
          // PBI 252: capturile pot fixa ora din zi; jocul obișnuit pornește la amiază și T o schimbă.
          if (captureConfig) ownedComposition.setTimeOfDay(captureConfig.time);
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
            if (attachedShellWorld) {
              attachedShellWorld = false;
              shell.detachWorld();
            }
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
                if (attachedShellWorld) {
                  attachedShellWorld = false;
                  shell.detachWorld();
                }
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
    // Compunerea a afișat deja tick-ul curent la inițializare; bucla pornește de la el.
    initialTick: Math.max(1, shell.status().world.tick),
    captureSnapshot: captureCompositionSnapshot,
    step: (step) => {
      if (!composition) throw new Error('Compunerea V3 nu este inițializată.');
      // PBI 260: singurul pas autoritar trece prin shell, care avansează lumea V3 o dată și
      // apelează porturile declarate. Aici nu există un al doilea `composition.step`.
      shell.step(step.tick);
      const frame = composition.composition.frame;
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
    const frame = composition?.composition.frame;
    if (frame !== undefined) shell.setMode(frame.hud.mode);
    shell.present();
    shellHost.refresh();
  },
  show: showView,
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
/** PBI 261: profilul de lucru al Academiei și copia explicită, independentă, a Haos. */
function sessionProfile(profileId: string, versionId: string): ProfileVersion {
  const content: ProfileVersionContent = {
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId,
    parentVersionId: null,
    engineVersion: 'engine-261',
    parameters: Object.freeze({ speed_delta_urban: 0, following_time_headway: 1.8 }),
    provenance: Object.freeze({
      origin: 'BASE',
      sourceSegmentIds: Object.freeze([] as string[]),
      sourceInterventionIds: Object.freeze([] as string[]),
      delta: null,
    }),
    sourceSegmentIds: Object.freeze([] as string[]),
    depth: 0,
    createdAt: sessionBootedAt,
  };
  return Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) });
}
const academyProfile = sessionProfile('profile-261-academy', 'profile-261-academy@1');
const chaosCopy = copyProfileForChaos({
  source: academyProfile,
  copyId: 'haos-261',
  sessionId: CHAOS_SESSION_ID,
  learningEpoch: 0,
  copiedAt: sessionBootedAt,
});
if (chaosCopy.status !== 'COPIED')
  throw new Error(`Copia Haos a profilului a fost refuzată: ${chaosCopy.rejection.code}`);
/**
 * Portul lumii vii pentru 225: o singură compunere V3, fără o a doua simulare. Captura este
 * citirea la limita de tick, iar pornirea adoptă identitatea în shell și readuce scena în
 * pauză/AUTO. Segmentul și joburile live aparțin 271/272; aici nu sunt inventate.
 */
const sessionWorld: SessionWorldPort = {
  capture(identity) {
    const frame = composition?.composition.frame;
    const tick = frame?.tick ?? shell.status().world.tick;
    const mode = frame?.hud.mode ?? 'AUTO';
    return Object.freeze({
      tick,
      vehicles: composition?.stats().vehicles ?? 0,
      manualVehicles: mode === 'MANUAL' ? 1 : 0,
      body: Object.freeze({
        sessionId: identity.sessionId,
        worldEpoch: identity.worldEpoch,
        learningEpoch: identity.learningEpoch,
        tick,
        mode,
        launch: 'PAUSED_AUTO' as const,
        composition: composition?.read() ?? null,
      }),
    });
  },
  closeSegment() {
    // Owner-ul segmentului live este 272; până atunci nu există un segment de închis.
    return 0;
  },
  invalidateJobs() {
    // Owner-ul joburilor live este 272/278; un număr inventat ar ascunde lipsa lor.
    return 0;
  },
  releaseInput() {
    if (composition === undefined) return 0;
    composition.composition.releaseInput();
    return 1;
  },
  start(identity) {
    shell.setSessionContext(identity);
    composition?.composition.releaseInput();
    // Sesiunea nouă nu moștenește poziția fizică a celei vechi; restaurarea completă a
    // snapshotului rămâne la 278.
    composition?.reset();
    composition?.setVehicleMode('AUTO');
    shell.setMode('AUTO');
  },
  stop() {
    composition?.composition.releaseInput();
  },
  residentJobs() {
    return 0;
  },
  listeners() {
    return composition === undefined ? 0 : 1;
  },
};
sessionModules.flow = createSessionFlow({
  world: sessionWorld,
  academyProfile,
  chaosProfile: chaosCopy.copy,
  academySessionId: ACADEMY_SESSION_ID,
  chaosSessionId: CHAOS_SESSION_ID,
  now: () => new Date().toISOString(),
  onLaunch: () => {
    shell.setMode('AUTO');
    shell.setMenuOpen(true);
    if (application.getState().kind === 'PLAYING') application.pause('menu');
    shellHost.refreshSession();
  },
});
/** PBI 261: alegerea explicită a sesiunii; shell-ul este suspendat înainte de orice captură. */
async function chooseSession(kind: SessionKind): Promise<void> {
  const flow = sessionModules.flow;
  if (!flow) return;
  shell.setMenuOpen(true);
  const result = await flow.choose(kind);
  sessionNotice = result.status === 'REJECTED' ? `${result.code}: ${result.message}` : null;
  shellHost.setSessionState(application.getState().kind);
  shellHost.refreshSession();
}
/** PBI 261: resetul aceleiași sesiuni, cu checkpoint înainte de epoci; stilul rămâne activ. */
async function resetSessionWorld(): Promise<void> {
  const flow = sessionModules.flow;
  if (!flow) return;
  shell.setMenuOpen(true);
  const result = await flow.resetWorld();
  sessionNotice = result.status === 'REJECTED' ? `${result.code}: ${result.message}` : null;
  shellHost.setSessionState(application.getState().kind);
  shellHost.refreshSession();
}
/** Reluare explicită: refuzată cât timp o suprafață sau focusul cere suspendarea (070). */
function resumeSession(): void {
  shell.setMenuOpen(false);
  if (!shell.requestResume()) return;
  if (activeRecovery?.getState().kind === 'READY') {
    application.play();
    // Butonul rămâne elementul activ după click; inputul 066 cere focus în afara butoanelor.
    view.getCanvas().focus();
  }
}
/** Start/reluare din orice control al shell-ului; owner-ul rămâne 070 + 012. */
function startSession(): void {
  shell.start();
  resumeSession();
}
view.onRetry(() => {
  if (!activeRecovery || !application.getSimulationState()) void application.load(preference);
  else if (activeRecovery.getState().kind === 'ERROR' && activeRecovery.getSnapshot())
    void activeRecovery.retry();
  else void activeRecovery.recover('User requested renderer reload');
});
view.onPlay(() => startSession());
view.onPause(() => shell.setMenuOpen(true));
view.onMode(() => {
  composition?.toggleVehicleMode();
  // Butonul HUD nu trebuie să rămână activ: altfel 025 blochează W/M în dialoguri/butoane.
  view.getCanvas().focus();
});
void application.load(preference);
// Academia este alegerea implicită, dar meniul rămâne explicit pentru Haos sau revenire.
void chooseSession('ACADEMY');

/** Diagnostice read-only pentru probele de browser; nu expun nicio scriere de autoritate. */
interface V3DebugGlobal {
  ready(): boolean;
  read(): unknown;
  backend(): unknown;
  stats(): unknown;
  /** PBI 260: starea composition root-ului, porturilor și costurile tick/prezentare. */
  shell(): unknown;
  shellHost(): unknown;
  /** PBI 261: sesiunile Academie/Haos, checkpointurile și identitatea stabilă. */
  session(): unknown;
  sessionMenu(): unknown;
  sessionNotice(): string | null;
  /** PBI 260: starea read-only a lifecycle-ului 012, pentru diagnosticul probei de browser. */
  lifecycle(): unknown;
  /** PBI 241: starea AA/post-procesării (cine aplică tone mappingul, HDR, efecte). */
  postProcessing(): unknown;
  /** PBI 241 (numai DEV, `?capture` sau `?debug`): comutare live de preset prin `applyPreferences`. */
  setPreset?(preset: 'LOW' | 'MEDIUM' | 'HIGH'): void;
  /** PBI 241 (numai DEV, `?capture` sau `?debug`): scena Babylon, pentru resurse și calibrare. */
  scene?(): unknown;
  /** PBI 244 (numai DEV, `?capture` sau `?debug`): daylight, pentru statistici de umbre/AO și efecte on/off. */
  daylight?(): unknown;
  /** PBI 252 (numai DEV, `?capture` sau `?debug`): ora din zi, fără atingerea simulării. */
  setTimeOfDay?(name: 'morning' | 'noon' | 'sunset' | 'night'): unknown;
  timeOfDay?(): unknown;
  reset(): void;
  probeDoubleDelivery(): string;
}
const debugGlobal: V3DebugGlobal = {
  ready: () => composition !== undefined,
  read: () => composition?.read() ?? null,
  backend: () => composition?.backendInfo() ?? null,
  stats: () => composition?.stats() ?? null,
  shell: () => shell.status(),
  shellHost: () => shellHost.getStats(),
  session: () => sessionModules.flow?.status() ?? null,
  sessionMenu: () => sessionModules.flow?.menu() ?? EMPTY_SESSION_MENU,
  sessionNotice: () => sessionNotice,
  lifecycle: () => application.getState(),
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
  debugGlobal.setTimeOfDay = (name) => composition?.view.setTimeOfDay(name) ?? null;
  debugGlobal.timeOfDay = () => composition?.view.getTimeOfDay() ?? null;
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
    shellHost.dispose();
    shell.dispose();
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
