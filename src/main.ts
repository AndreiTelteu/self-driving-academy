import {
  compositionSnapshot,
  createAmbientTraffic,
  createApplicationLifecycle,
  createCompositionWorld,
  createGameShell,
  createLiveEconomyComposition,
  createLiveDailyProgress,
  createLiveChallenges,
  createLiveChaos,
  createLiveChallengeRoutePort,
  createLiveChallengeZones,
  createLivePersistence,
  createLiveLearningPipeline,
  createLiveMissions,
  createLiveModeSegments,
  createLiveSettings,
  createLiveTelemetryComposition,
  createLiveRideComposition,
  createCityStyleProfile,
  createRecoveryRoadProvider,
  createRendererRecovery,
  createSessionFlow,
  dailyCalendarInputOf,
  LIVE_DAILY_PROGRESS_VERSION,
  LIVE_LEARNING_VERSION,
  LIVE_MISSIONS_VERSION,
  LIVE_PERSISTENCE_VERSION,
  LIVE_TELEMETRY_COMPOSITION_VERSION,
  LIVE_THREE_MODES_VERSION,
  readCityDashboardSnapshot,
  readKpiHistory,
  readKpiImpact,
  readLiveFleetSelectionSnapshot,
  readMinimapFrame,
  readMinimapGeometry,
  readMinimapIncidents,
  resolveLocalDailyDay,
  restoreLiveCompany,
  restoreVersion,
  rideTripDistanceM,
  LIVE_FLEET_PRESENTATION_SLOTS,
  mapHeadingFromCompositionYaw,
  type CompositionFrame,
  type GameTickPort,
  type LiveChallenges,
  type LiveChaos,
  type LiveChaosReaction,
  type LiveChallengeFrameFact,
  type LiveChallengeVehicleFact,
  type LiveDailyProgress,
  type LiveDailyReloadCheckpoint,
  type LiveEconomyComposition,
  type LiveLearningPipeline,
  type LiveMissions,
  type LiveModeSegments,
  type LivePersistence,
  type LiveRideComposition,
  type LiveSettings,
  type LiveSettingsStylePorts,
  type LiveTelemetryComposition,
  type ProfileRestoreServices,
  type RecoveryRenderer,
  type SessionFlow,
  type SessionFlowMenu,
  type StyleSlidersTickResult,
} from './app';
import {
  createLiveCompanyEvolution,
  createLiveCompanyFinance,
  type LiveCompanyEvolution,
  type LiveCompanyFinance,
} from './economy';
import { CIVIL_TRAFFIC_LIMITS, type CompanyFleetPort } from './fleet';
import {
  createDefaultSettings,
  createSettingsStore,
  readCameraModePreference,
  withCameraModePreference,
  writeCameraModePreference,
  type CameraModePreference,
  type CameraPreferenceStorage,
  type RuntimeSettings,
} from './settings';
import { bindPauseFocusInput } from './input';
import { createRoutePlanner } from './world';
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
  createCompanyDashboard,
  createDiagnosticsPanel,
  createFpsCounter,
  createGameShellHost,
  createCityDashboardPanel,
  createChallengePanel,
  createFleetSelectionPanel,
  createKpiHistoryPanel,
  createKpiImpactHud,
  createLiveEconomyHud,
  createLiveMinimap,
  createLiveRideMarkerLayer,
  createLiveRidesPanel,
  createLiveProgressPanel,
  createLiveSettingsPanel,
  createMissionPanel,
  createMissionTutorialPanel,
  createPassengerVisualPresenter,
  createTaxiHud,
  LIVE_PROGRESS_READ_VERSION,
  type GameShellFileResult,
  type LiveProgressSnapshot,
  type LiveSettingsPanel,
  type LiveSettingsTab,
} from './ui';
import {
  LIVE_RIDE_LIFECYCLE_VERSION,
  createFleetHealth,
  createLiveRides,
  createProfileActivation,
} from './fleet';
import type { FleetHealth, LiveRides, ProfileActivation } from './fleet';
import {
  createCandidateProfileStore,
  createLearningQueueRuntime,
  deriveLiveLearningPayload,
  type LearningQueueRuntime,
} from './learning';
import type { DrivingProfile, ProfileVersion } from './profiles';
import { parameterDefinitions, parseDrivingProfile } from './profiles';
import { PLAYER_XP_POLICY } from './missions';
import { VEHICLE_CLASSES, createLiveVehiclePhysics, type LiveVehiclePhysics } from './vehicles';
import { createAudioEngine, createWebAudioBackend, type AudioEngine } from './audio';
import { copyProfileForChaos, liveSaveFingerprint } from './persistence';
import type { SessionKind, SessionWorldPort } from './persistence';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Containerul aplicației #app lipsește.');
/** PBI283: the visible consequence of a real player violation, not a second metric store. */
const trafficViolationNotice = document.createElement('div');
trafficViolationNotice.id = 'traffic-violation-notice';
trafficViolationNotice.setAttribute('role', 'status');
trafficViolationNotice.setAttribute('aria-live', 'polite');
trafficViolationNotice.style.cssText = [
  'position:absolute',
  'top:12px',
  'right:12px',
  'z-index:30',
  'display:none',
  'max-width:360px',
  'padding:10px 12px',
  'border-radius:10px',
  'border:1px solid #ff7a6b',
  'background:rgba(52,8,8,0.92)',
  'color:#ffe5e0',
  'font:13px/1.4 system-ui,sans-serif',
  'box-shadow:0 2px 12px rgba(0,0,0,0.45)',
  'pointer-events:none',
].join(';');
app.append(trafficViolationNotice);
let lastTrafficViolationId: string | null = null;
let trafficViolationShownAt = 0;
/**
 * PBI 285: the visual twin of the destruction feedback. It is always written, including before the
 * audio gesture and when the browser refuses audio, so the material/intensity information never
 * depends on a played sound.
 */
const destructionNotice = document.createElement('div');
destructionNotice.id = 'destruction-notice';
destructionNotice.setAttribute('role', 'status');
destructionNotice.setAttribute('aria-live', 'polite');
destructionNotice.style.cssText = [
  'position:absolute',
  'left:12px',
  'bottom:12px',
  'z-index:30',
  'display:none',
  'max-width:420px',
  'padding:10px 12px',
  'border-radius:10px',
  'border:1px solid #e8b86b',
  'background:rgba(28,22,10,0.92)',
  'color:#fff1d6',
  'font:13px/1.4 system-ui,sans-serif',
  'box-shadow:0 2px 12px rgba(0,0,0,0.45)',
  'pointer-events:none',
].join(';');
app.append(destructionNotice);
let destructionNoticeTimer: number | null = null;
/** PBI 285: the live owners of this backend; a renderer reload releases them together. */
let liveChaos: LiveChaos | undefined;
let liveAudio: AudioEngine | undefined;
let releaseAudioGesture: (() => void) | undefined;

function showDestructionReaction(reaction: LiveChaosReaction): void {
  const fallback = reaction.audioPlayed
    ? 'audio'
    : `audio ${reaction.audioReason === 'AWAITING_GESTURE' ? 'după primul gest' : 'indisponibil'} · efect vizual`;
  destructionNotice.textContent = `${reaction.symbol} ${reaction.text} · ${fallback}`;
  destructionNotice.setAttribute('data-event', reaction.eventId);
  destructionNotice.setAttribute('data-object', reaction.objectId);
  destructionNotice.setAttribute('data-material', reaction.material);
  destructionNotice.setAttribute('data-intensity', reaction.intensity.tier);
  destructionNotice.setAttribute('data-variant', reaction.variant);
  destructionNotice.setAttribute(
    'data-audio',
    reaction.audioPlayed ? 'PLAYED' : reaction.audioReason,
  );
  destructionNotice.style.display = 'block';
  if (destructionNoticeTimer !== null) window.clearTimeout(destructionNoticeTimer);
  destructionNoticeTimer = window.setTimeout(() => {
    destructionNotice.style.display = 'none';
    destructionNoticeTimer = null;
  }, 3200);
}

function armAudioGesture(engine: AudioEngine): () => void {
  const unlock = (event: Event): void => {
    try {
      engine.startFromUserGesture(event.type === 'keydown' ? 'KEYBOARD' : 'POINTER');
    } catch {
      // The explicit visual fallback stays visible; no second audio path is created.
    }
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  return () => {
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
}
const view = createRenderingView(app);
const world = createCompositionWorld();
/** PBI 277: the real 041 planner and the mapped 032 zones the live challenge preflight reads. */
const challengePlanner = createRoutePlanner({
  graph: world.graph,
  map: world.map,
  graphVersion: '033-lane-graph-v1',
  costVersion: 'route-cost-v1',
});
const liveChallengeZones = createLiveChallengeZones({ map: world.map, graph: world.graph });
const liveTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Bucharest';
/** PBI 239: `?capture=1` pornește harnessul de capturi; fără steag este `null` și nimic nu se schimbă. */
const captureConfig = readCaptureConfig(window.location.search);
/** Probe-only: a headless browser loses focus when Playwright drives; this flag keeps the clock. */
const noFocusPause = new URLSearchParams(window.location.search).has('nofocuspause');
/** Contor FPS permanent (stânga-sus), independent de diagnostic; omis în capturile deterministe. */
if (!captureConfig) createFpsCounter(app);
/** PBI 280: only the camera presentation preference survives a reload; 278 is not extended. */
const cameraPreferenceStorage: CameraPreferenceStorage | undefined = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();
const defaultSettings = withCameraModePreference(
  createDefaultSettings('v3-composition'),
  readCameraModePreference(cameraPreferenceStorage),
);
const settingsStore = createSettingsStore(
  captureConfig
    ? {
        ...defaultSettings,
        quality: {
          ...defaultSettings.quality,
          preset: captureConfig.preset,
          preferredBackend: captureConfig.backend,
        },
      }
    : defaultSettings,
);
/** PBI 279: the one live 009 snapshot; device Settings replace it atomically. */
let settings = settingsStore.getSnapshot();
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
/**
 * PBI 265: portul POST_WORLD al curselor live. El citește cadrul compunerii după pasul autoritar și
 * trimite poziția și viteza reală a fiecărui actor către compunerea 061–064 peste revendicările 264.
 * Când modulul nu este montat, portul nu face nimic; nu inventează tick-uri sau poziții.
 */
const ridesModules: {
  composition: LiveRideComposition | undefined;
  hud: ReturnType<typeof createTaxiHud> | undefined;
} = { composition: undefined, hud: undefined };
/** PBI 277: the same 264 owner, exposed read-only to the live challenge frame port. */
const rideRuntimeModules: { live: LiveRides | undefined } = { live: undefined };
const ridesTickPort: GameTickPort = {
  id: 'rides',
  version: LIVE_RIDE_LIFECYCLE_VERSION,
  step(context) {
    const rideComposition = ridesModules.composition;
    if (rideComposition === undefined) return;
    const frame = composition?.composition.frame;
    if (frame === undefined) return;
    if (frame.tick !== context.tick)
      throw new Error(
        `Cadrul curselor (${frame.tick}) nu coincide cu tick-ul autoritar (${context.tick}).`,
      );
    rideComposition.step({
      tick: context.tick,
      vehicles: frame.vehicles.map((vehicle) => ({
        vehicleId: vehicle.vehicleId,
        driverKind: vehicle.driverKind,
        laneId: vehicle.laneId,
        blocked: vehicle.blocked,
        controlMode: vehicle.controlMode,
        positionM: {
          x: vehicle.positionM.x,
          y: vehicle.positionM.y,
          z: vehicle.positionM.z,
        },
        speedMps: Math.abs(vehicle.speedMps),
        headingRad: vehicle.yawRad,
      })),
      playerVehicleId: frame.playerVehicleId,
    });
  },
};
/**
 * PBI 266: portul economiei rulează imediat după `rides`, deci vede exact aceleași curse terminale
 * 061 și același cadru autoritar. El nu avansează ceasul când shell-ul este suspendat: un pas
 * lipsă înseamnă zero revenue, zero review și zero expunere economică.
 */
/** PBI 269: the single live fleet owned by the ambient traffic composition, never a second one. */
let liveFleet:
  | Readonly<{
      registry: ReturnType<typeof createAmbientTraffic>['registry'];
      traffic: ReturnType<typeof createAmbientTraffic>['traffic'];
      ambient: ReturnType<typeof createAmbientTraffic>;
    }>
  | undefined;
const economyModules: {
  compositions: Map<string, LiveEconomyComposition>;
  composition: LiveEconomyComposition | undefined;
  /** PBI 268: company ledger live, per sesiune, separat de revenue-ul 209. */
  companies: Map<string, LiveCompanyFinance>;
  company: LiveCompanyFinance | undefined;
  /** PBI 269: evolution over the same company ledger and the same live fleet. */
  evolutions: Map<string, LiveCompanyEvolution>;
  evolution: LiveCompanyEvolution | undefined;
} = {
  compositions: new Map(),
  composition: undefined,
  companies: new Map(),
  company: undefined,
  evolutions: new Map(),
  evolution: undefined,
};
/**
 * PBI 267: the city dashboard consumes the real 065 health owner of the same fleet. It records only
 * external facts; the current build has no 028/029 live producer yet, so an absent fact stays absent
 * instead of being invented as a zero.
 */
const dashboardModules: { health: FleetHealth | undefined } = { health: undefined };
/**
 * PBI 271: the live 069 owner. It is attached to the single V3 composition and reads the accepted
 * frame; no second mode, seat or segment model exists.
 */
const modeModules: { segments: LiveModeSegments | undefined } = { segments: undefined };
/**
 * PBI 272: the live telemetry writer. It reads the accepted frame and the 271 segment read model;
 * it never drives a vehicle, never estimates a style and never publishes a profile.
 */
const telemetryModules: { live: LiveTelemetryComposition | undefined } = { live: undefined };
/**
 * PBI 273: the live learning pipeline and the shared 103/221 runtime. The pipeline consumes the
 * closed 272 segments; the queue is created lazily once and reused across session/backend changes,
 * while the generation barrier invalidates jobs from an older epoch.
 */
const learningModules: {
  queue: LearningQueueRuntime | undefined;
  pipeline: LiveLearningPipeline | undefined;
  activation: ProfileActivation | undefined;
} = { queue: undefined, pipeline: undefined, activation: undefined };
/**
 * PBI 279: the live settings composition. It is created on demand because the style editor needs the
 * real 205 barrier and 110 activation mounted by 273; it is discarded with that pipeline and rebuilt
 * on the next open. Device settings still write only the one 009 store.
 */
const settingsModules: {
  runtime: LiveSettings | undefined;
  panel: LiveSettingsPanel | undefined;
} = { runtime: undefined, panel: undefined };
/**
 * The tick currently being prepared by the shell. The style barrier reads it so PRE_WORLD style
 * requests resolve against the same authoritative tick the shell is about to execute.
 */
let settingsTickAuthority: number | null = null;
const settingsTickPort: GameTickPort = {
  id: 'settings',
  version: '279-live-settings-v1',
  step(context) {
    // PRE_WORLD: a queued style change resolves through 205/110 before the world step of this tick.
    // The barrier shares this tick readback so a style request at tick N is not resolved against the
    // previous composition frame (which would leave the pipeline to consume it out of order).
    settingsTickAuthority = context.tick;
    settingsModules.runtime?.step(context.tick);
  },
};
/**
 * PBI 275: the single live mission owner. It composes the delivered 116 tracker, 117 tutorial and
 * 125 reward ledger over facts of the same live world; no second mission, XP or profile model is
 * created here.
 */
const missionModules: { runtime: LiveMissions | undefined } = { runtime: undefined };
/**
 * PBI 277: the single live random-challenge owner. It composes the 231 catalog/evaluators, the 232
 * director and the 233 experience over the real composition frame; it creates no second ledger.
 */
const challengeModules: { runtime: LiveChallenges | undefined } = { runtime: undefined };
/**
 * PBI 278: the single live persistence owner. It reads the real 276/277/268/269/109 owners and
 * commits one 225 checkpoint generation; it never creates a second simulation, ledger or store.
 */
const persistenceModules: { live: LivePersistence | undefined } = { live: undefined };
const persistenceTickPort: GameTickPort = {
  id: 'persistence',
  version: LIVE_PERSISTENCE_VERSION,
  step(context) {
    persistenceModules.live?.onTick(context.tick);
  },
};
/** Probe-only switch: the automatic offer door can be closed while a host-driven offer is tested. */
let challengeAutoOffersSuppressed = false;
/**
 * PBI 276: the live daily/XP vertical. It consumes the same validated events and the same 125
 * settlements as 275, plus real active-time windows; it creates no second mission model.
 */
const dailyModules: { runtime: LiveDailyProgress | undefined } = { runtime: undefined };
/** PBI 276: real user activity drives the AFK verdict; panels and the shell do not fake it. */
let lastXpActivityAtMs = Date.now();
const xpActivityBinding = (() => {
  const events = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;
  const mark = (): void => {
    lastXpActivityAtMs = Date.now();
  };
  for (const event of events) document.addEventListener(event, mark, { passive: true });
  return Object.freeze({
    dispose(): void {
      for (const event of events) document.removeEventListener(event, mark);
    },
  });
})();
/** PBI 276: a tab reload keeps the same day and the same credits; a savefile remains 278. */
const dailyProgressStorage = (() => {
  try {
    const storage = window.sessionStorage,
      key = '276-daily-xp-checkpoint';
    return Object.freeze({
      load: () => storage.getItem(key),
      save: (value: string) => storage.setItem(key, value),
      clear: () => storage.removeItem(key),
    });
  } catch {
    return undefined;
  }
})();
/** PBI 277: the challenge offer, instance and record survive a tab reload; a savefile is 278. */
const challengeProgressStorage = (() => {
  try {
    const storage = window.sessionStorage,
      key = '277-live-challenges-checkpoint';
    return Object.freeze({
      load: () => storage.getItem(key),
      save: (value: string) => storage.setItem(key, value),
      clear: () => storage.removeItem(key),
    });
  } catch {
    return undefined;
  }
})();
/** PBI 278 owns durable saves; this checkpoint is session-scoped and reversible by the host. */
function xpHostFacts(): { focused: boolean; visible: boolean; afk: boolean } {
  return {
    focused: document.hasFocus(),
    visible: !document.hidden,
    afk: Date.now() - lastXpActivityAtMs >= PLAYER_XP_POLICY.afkThresholdMs,
  };
}
function liveDailyCapabilities(campaignCompleted: readonly string[]) {
  const learningKeys = parameterDefinitions
    .filter((definition) => definition.implemented)
    .map((definition) => definition.key)
    .sort()
    .slice(0, 64);
  return {
    learningKeys,
    zones: world.map.serviceZones
      .map((zone) => zone.id)
      .sort()
      .slice(0, 64),
    vehicleClasses: Object.keys(VEHICLE_CLASSES).sort(),
    controlModes: ['AUTO', 'MANUAL', 'LEARNING'],
    campaignCompleted,
    unlocks: [],
  };
}
const missionsTickPort: GameTickPort = {
  id: 'missions',
  version: LIVE_MISSIONS_VERSION,
  step(context) {
    missionModules.runtime?.step({
      sessionId: context.sessionId,
      worldEpoch: context.worldEpoch,
      tick: context.tick,
    });
    dailyModules.runtime?.observeTick({
      tick: context.tick,
      nowMs: Date.now(),
      playing: true,
    });
    challengeModules.runtime?.step({ tick: context.tick, paused: false });
  },
};
const liveLearningEngineVersion = 'engine-273-live' as const;
/**
 * PBI 273: the active city style read by the one 057/058 fleet. The 109 store remains the only
 * writer of versions; this source is updated only after a real 110 activation has been applied.
 */
const liveCityStyleSource: {
  activeStyle(): DrivingProfile;
  set(profile: DrivingProfile): void;
} = (() => {
  let active = createCityStyleProfile('profile-261-academy', 'profile-261-academy@1');
  return {
    activeStyle: () => active,
    set(profile: DrivingProfile): void {
      active = profile;
    },
  };
})();
/** Exact read-only physical snapshot for the 205 barrier; it never advances a tick or moves a body. */
function livePhysicalState(): string {
  const frame = composition?.composition.frame;
  if (frame === undefined) return 'NO_WORLD';
  return JSON.stringify(
    frame.vehicles
      .map((vehicle) => [
        vehicle.vehicleId,
        vehicle.controlMode,
        vehicle.positionM.x,
        vehicle.positionM.y,
        vehicle.positionM.z,
        vehicle.yawRad,
        vehicle.speedMps,
        vehicle.appliedProfileVersion,
      ])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  );
}
const telemetryTickPort: GameTickPort = {
  id: 'telemetry',
  version: LIVE_TELEMETRY_COMPOSITION_VERSION,
  step(context) {
    const live = telemetryModules.live;
    if (live === undefined) return;
    const frame = composition?.composition.frame;
    if (frame === undefined) return;
    if (frame.tick !== context.tick)
      throw new Error(
        `Cadrul de telemetrie (${frame.tick}) nu coincide cu tick-ul autoritar (${context.tick}).`,
      );
    live.step(frame);
  },
};
const learningTickPort: GameTickPort = {
  id: 'learning',
  version: LIVE_LEARNING_VERSION,
  step(context) {
    learningModules.pipeline?.step(context.tick);
  },
};
const controlTickPort: GameTickPort = {
  id: 'control',
  version: LIVE_THREE_MODES_VERSION,
  step(context) {
    const segments = modeModules.segments;
    if (segments === undefined) return;
    const state = segments.observe();
    if (state.disposed) throw new Error('Owner-ul segmentelor 271 este eliberat.');
    if (state.acceptedTick !== context.tick - 1)
      throw new Error(
        `Segmentul 271 așteaptă tick-ul ${context.tick - 1}, are ${state.acceptedTick} și shell-ul cere ${context.tick}.`,
      );
    const frame = composition?.composition.frame;
    if (frame !== undefined && frame.tick !== context.tick - 1)
      throw new Error(
        `Cadrul 271 (${frame.tick}) nu coincide cu tick-ul anterior al shell-ului (${context.tick - 1}).`,
      );
    if (frame !== undefined) {
      const players = frame.vehicles.filter((vehicle) => vehicle.controlMode !== 'AUTO');
      if (players.length > 1)
        throw new Error(`Există ${players.length} scaune PLAYER în tick-ul ${frame.tick}.`);
      const player = players[0];
      if ((state.active?.vehicleId ?? null) !== (player?.vehicleId ?? null))
        throw new Error('Segmentul 271 nu aparține vehiculului controlat.');
      if (state.active !== null && state.active.mode !== player?.controlMode)
        throw new Error('Modul segmentului 271 nu coincide cu modul acceptat.');
    }
  },
};
/**
 * PBI284: every body currently in the live frame, plus the character when on foot. A purchased
 * vehicle must not appear on top of the player or an existing car.
 */
function liveSpawnAvoid(): readonly Readonly<{ x: number; z: number; radiusM: number }>[] {
  const frame = composition?.composition.frame;
  if (frame === undefined) return Object.freeze([]);
  const avoid: Readonly<{ x: number; z: number; radiusM: number }>[] = frame.vehicles.map(
    (vehicle) =>
      Object.freeze({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
        radiusM: 2.5,
      }),
  );
  if (frame.playerVehicleId === null)
    avoid.push(
      Object.freeze({
        x: frame.character.positionM.x,
        z: frame.character.positionM.z,
        radiusM: 0.5,
      }),
    );
  return Object.freeze(avoid);
}
/**
 * PBI 269 fleet port: a purchase adds the taxi to the one 057 registry and starts its real 058
 * actor, so the same live fleet and capacity grow without a second registry or composition.
 */
function companyFleetPort(): CompanyFleetPort | undefined {
  const fleet = liveFleet;
  if (fleet === undefined) return undefined;
  return {
    counts: () => fleet.registry.counts(),
    list: () => fleet.registry.list(),
    get: (vehicleId) => fleet.registry.get(vehicleId),
    addVehicle: (driverKind, classId, options) => {
      const vehicle = fleet.registry.addVehicle(driverKind, classId, options);
      try {
        fleet.ambient.addVehicle(vehicle.vehicleId, {
          avoid: liveSpawnAvoid(),
          clearanceM: CIVIL_TRAFFIC_LIMITS.spawnClearanceM,
        });
        return vehicle;
      } catch (error) {
        fleet.registry.removeVehicle(vehicle.vehicleId);
        throw error;
      }
    },
    removeVehicle: (vehicleId) => {
      fleet.traffic.removeVehicle(vehicleId);
      return fleet.registry.removeVehicle(vehicleId);
    },
    hasActor: (vehicleId) => fleet.traffic.get(vehicleId) !== undefined,
  };
}
function createEvolutionFor(sessionId: string, company: LiveCompanyFinance): LiveCompanyEvolution {
  const existing = economyModules.evolutions.get(sessionId);
  if (existing !== undefined) return existing;
  const fleet = companyFleetPort(),
    evolution = createLiveCompanyEvolution({
      finance: company,
      ...(fleet === undefined ? {} : { fleet }),
      namespace: `v3:company:evolution:${sessionId}`,
    });
  economyModules.evolutions.set(sessionId, evolution);
  return evolution;
}
/** Activează economia sesiunii cerute; o sesiune nouă pornește cu istoric propriu gol. */
function activateEconomy(sessionId: string): {
  economy: LiveEconomyComposition | undefined;
  created: boolean;
} {
  const rideComposition = ridesModules.composition;
  if (rideComposition === undefined) return { economy: undefined, created: false };
  const existing = economyModules.compositions.get(sessionId);
  if (existing !== undefined) {
    economyModules.composition = existing;
    economyModules.company =
      economyModules.companies.get(sessionId) ??
      createLiveCompanyFinance({
        namespace: `v3:company:${sessionId}`,
        clock: existing.clock,
      });
    economyModules.companies.set(sessionId, economyModules.company);
    economyModules.evolution = createEvolutionFor(sessionId, economyModules.company);
    return { economy: existing, created: false };
  }
  const economy = createLiveEconomyComposition({
    lifecycle: rideComposition.lifecycle.lifecycle,
    graph: world.graph,
    namespace: `v3:city:economy:${sessionId}`,
  });
  const company = createLiveCompanyFinance({
    namespace: `v3:company:${sessionId}`,
    clock: economy.clock,
  });
  economyModules.compositions.set(sessionId, economy);
  economyModules.composition = economy;
  economyModules.companies.set(sessionId, company);
  economyModules.company = company;
  economyModules.evolution = createEvolutionFor(sessionId, company);
  return { economy, created: true };
}
function disposeEconomies(): void {
  for (const economy of economyModules.compositions.values()) economy.dispose();
  for (const company of economyModules.companies.values()) company.dispose();
  for (const evolution of economyModules.evolutions.values()) evolution.dispose();
  economyModules.compositions.clear();
  economyModules.companies.clear();
  economyModules.evolutions.clear();
  economyModules.composition = undefined;
  economyModules.company = undefined;
  economyModules.evolution = undefined;
}
const economyTickPort: GameTickPort = {
  id: 'economy',
  version: '266-live-economy-composition-v1',
  step(context) {
    const economy = economyModules.composition;
    if (economy === undefined) return;
    const frame = composition?.composition.frame;
    if (frame === undefined) return;
    if (frame.tick !== context.tick)
      throw new Error(
        `Cadrul economiei (${frame.tick}) nu coincide cu tick-ul autoritar (${context.tick}).`,
      );
    const step = economy.step({
      tick: context.tick,
      vehicles: frame.vehicles.map((vehicle) => ({
        vehicleId: vehicle.vehicleId,
        speedMps: Math.abs(vehicle.speedMps),
        controlMode: vehicle.controlMode,
        classId: vehicle.classId,
        headingRad: vehicle.yawRad,
        // Real 058 blockage of the authoritative frame; the economy counts its seconds only while
        // the passenger is aboard. The optional 028 collision, 088 window and 137 blocked ports are
        // wired in the composition and will be supplied by their live owners (272/282); until then
        // the review keeps those terms at 0 instead of inventing a fact.
        blocked: vehicle.blocked,
      })),
    });
    // PBI 268: portul companiei citește exact settle-urile 209 deja acceptate. El nu scrie în
    // ledgerul de revenue/review/KPI și nu are cale către XP; doar copiază revenue-ul net și
    // înregistrează costul versionat al cursei.
    economyModules.company?.step({ atTick: step.tick, settlements: step.settlements });
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
  ports: {
    settings: settingsTickPort,
    sessions: sessionTickPort,
    control: controlTickPort,
    rides: ridesTickPort,
    economy: economyTickPort,
    missions: missionsTickPort,
    telemetry: telemetryTickPort,
    learning: learningTickPort,
    persistence: persistenceTickPort,
  },
  suspend: (cause) => application.pause(cause),
  resume: (cause) => {
    const state = application.getState();
    if (state.kind === 'PAUSED' && state.reason === cause) {
      application.play();
      // 025 blochează tastele cât timp un buton are focusul; reluarea readduce focusul pe canvas.
      if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
    }
  },
  resetHeldCommands: () => composition?.composition.releaseInput(),
});
/**
 * PBI 275: the mission runtime reads only the real owner read models. The ports below are the same
 * 265 rides, 271 segments, 065 health and 272 follow episodes mounted in this composition; they do
 * not create a parallel simulation or a second mission ledger.
 */
const liveMissions = createLiveMissions({
  onEvent: (event) => dailyModules.runtime?.observeEvent(event, Date.now()),
  onSettled: (settlement) => dailyModules.runtime?.observeMissionSettlement(settlement, Date.now()),
  ports: {
    modes: () => {
      const state = modeModules.segments?.observe();
      if (state === undefined) return null;
      return Object.freeze({
        segments: state.segments.map((segment) =>
          Object.freeze({
            segmentId: segment.segmentId,
            vehicleId: segment.vehicleId,
            mode: segment.mode,
            learningEligible: segment.learningEligible,
            startTick: segment.startTick,
            endTick: segment.endTick,
            completeness: segment.completeness,
          }),
        ),
      });
    },
    rides: () => {
      const snapshot = ridesModules.composition?.snapshot();
      if (snapshot === undefined) return null;
      return Object.freeze({
        rides: snapshot.rides.rides.map((ride) =>
          Object.freeze({
            rideId: ride.rideId,
            taxiId: ride.taxiId,
            boardingTick: ride.boardingTick,
            completionTick: ride.completionTick,
          }),
        ),
      });
    },
    health: () =>
      Object.freeze(
        (dashboardModules.health?.history() ?? []).map((entry) =>
          Object.freeze({
            factId: entry.factId,
            taxiId: entry.taxiId,
            fact: entry.fact,
            tick: entry.tick,
          }),
        ),
      ),
    follow: () =>
      Object.freeze(
        (telemetryModules.live?.readFollowEpisodes() ?? []).map((episode) =>
          Object.freeze({
            episodeId: episode.episodeId,
            vehicleId: episode.vehicleId,
            leaderId: episode.leaderId,
            startTick: episode.startTick,
            minGapM: episode.minGapM,
            maxGapM: episode.maxGapM,
          }),
        ),
      ),
    authority: () => {
      const authority = composition?.composition.modeAuthority();
      if (authority === undefined) return null;
      return Object.freeze({
        tick: authority.tick,
        playerVehicleId: authority.playerVehicleId,
        mode: authority.mode,
        suspended: shell.pauseState().suspended,
      });
    },
    selection: () => {
      const frame = composition?.composition.frame;
      if (frame === undefined) return null;
      const vehicleId = frame.playerVehicleId ?? frame.selectedVehicleId;
      if (vehicleId === null || vehicleId === undefined) return null;
      const state = liveFleet?.registry.get(vehicleId);
      return Object.freeze({
        vehicleId,
        kind: state?.driverKind === 'TAXI' ? ('TAXI' as const) : ('CIVIL' as const),
      });
    },
  },
});
missionModules.runtime = liveMissions;
/** PBI 276: the single live daily/XP owner. It starts with the current real day and the real
 * capability snapshot; `beginLiveMissions` rebinds it to the accepted session identity.
 */
const liveDaily = createLiveDailyProgress({
  playerId: 'v3-player',
  timeZone: liveTimeZone,
  sessionId: compositionContext.sessionId,
  worldEpoch: compositionContext.worldEpoch,
  kind: 'ACADEMY',
  capabilities: liveDailyCapabilities([]),
  hostFacts: xpHostFacts,
  ...(dailyProgressStorage === undefined ? {} : { storage: dailyProgressStorage }),
});
dailyModules.runtime = liveDaily;
/**
 * PBI 277: the live challenge frame is the accepted composition frame plus the real 265 claim and
 * passenger facts. The cache is one entry per authoritative tick, so the challenge step and its
 * offer preflight never rebuild the ride snapshot twice.
 */
let challengeFrameCache: {
  tick: number;
  value: LiveChallengeFrameFact | null;
} | null = null;
function liveChallengeFrame(): LiveChallengeFrameFact | null {
  const frame = composition?.composition.frame;
  if (frame === undefined) return null;
  if (challengeFrameCache?.tick === frame.tick) return challengeFrameCache.value;
  const liveRides = rideRuntimeModules.live;
  const rideSnapshot = ridesModules.composition?.lifecycle.snapshot() ?? null;
  const liveSnapshot = liveRides?.snapshot() ?? null;
  const playerId = frame.playerVehicleId;
  const assignmentRaw =
    playerId === null
      ? null
      : (liveSnapshot?.assignments.find((entry) => entry.taxiId === playerId) ?? null);
  const vehicles: LiveChallengeVehicleFact[] = frame.vehicles.map((vehicle) => {
    const taxiStatus =
      assignmentRaw !== null && assignmentRaw.taxiId === vehicle.vehicleId
        ? ('ASSIGNED' as const)
        : (liveRides?.healthStatus(vehicle.vehicleId) ?? 'AVAILABLE');
    const passengerAboard =
      rideSnapshot?.rides.some(
        (ride) => ride.taxiId === vehicle.vehicleId && !ride.terminal && ride.boardingTick !== null,
      ) ?? false;
    return Object.freeze({
      vehicleId: vehicle.vehicleId,
      driverKind: vehicle.driverKind,
      laneId: vehicle.laneId,
      positionM: Object.freeze({ x: vehicle.positionM.x, z: vehicle.positionM.z }),
      yawRad: vehicle.yawRad,
      speedMps: vehicle.speedMps,
      controlMode: vehicle.controlMode,
      classId: vehicle.classId,
      status: taxiStatus,
      passengerAboard,
    });
  });
  const value = Object.freeze({
    tick: frame.tick,
    paused: application.getState().kind !== 'PLAYING',
    playerVehicleId: frame.playerVehicleId,
    selectedVehicleId: frame.selectedVehicleId,
    vehicles: Object.freeze(vehicles),
    assignment:
      assignmentRaw === null
        ? null
        : Object.freeze({
            assignmentId: assignmentRaw.assignmentId,
            requestId: assignmentRaw.requestId,
            taxiId: assignmentRaw.taxiId,
            customerId: assignmentRaw.requestId,
          }),
    freeTaxis: liveSnapshot?.counts.availableTaxis ?? 0,
  });
  challengeFrameCache = { tick: frame.tick, value };
  return value;
}
/** The real lane under a taxi, including a manually driven car that left the lane id unset. */
function challengeLaneFor(frame: LiveChallengeFrameFact, taxiId: string): string | null {
  const taxi = frame.vehicles.find((entry) => entry.vehicleId === taxiId);
  if (taxi === undefined) return null;
  if (taxi.laneId !== null) return taxi.laneId;
  const located = world.graph.locateLane({
    positionM: { x: taxi.positionM.x, y: 0, z: taxi.positionM.z },
    access: 'TAXI',
  });
  return located?.lane.id ?? null;
}
challengeModules.runtime = createLiveChallenges({
  sessionId: compositionContext.sessionId,
  worldEpoch: compositionContext.worldEpoch,
  sessionKind: 'ACADEMY',
  playerId: 'v3-player',
  seed: 277_000,
  timeZone: liveTimeZone,
  ledger: liveDaily.playerProgress(),
  calendar: () => dailyCalendarInputOf(resolveLocalDailyDay(Date.now(), liveTimeZone)),
  now: () => Date.now(),
  ...(challengeProgressStorage === undefined ? {} : { storage: challengeProgressStorage }),
  ports: {
    frame: liveChallengeFrame,
    zones: () => liveChallengeZones,
    route: createLiveChallengeRoutePort({
      planner: challengePlanner,
      frame: liveChallengeFrame,
      laneFor: challengeLaneFor,
    }),
    incidents: () =>
      Object.freeze(
        (dashboardModules.health?.history() ?? [])
          .filter((entry) => entry.fact === 'COLLISION_DAMAGE')
          .map((entry) =>
            Object.freeze({
              factId: entry.factId,
              taxiId: entry.taxiId,
              tick: entry.tick,
            }),
          ),
      ),
    offersAllowed: () => !challengeAutoOffersSuppressed && !liveMissions.tutorialLearningBlocked(),
    campaignCompleted: () => liveMissions.status().campaign.completed,
    learningKeys: () =>
      parameterDefinitions
        .filter((definition) => definition.implemented)
        .map((definition) => definition.key)
        .sort()
        .slice(0, 64),
    vehicleClasses: () => Object.keys(VEHICLE_CLASSES).sort(),
  },
});
/** PBI 278: the browser localStorage row is the durable autosave; the file export is separate. */
const liveSaveStorage = (() => {
  let memory: string | null = null;
  const key = () => `278-live-save-autosave:${shell.status().sessionId}`;
  try {
    const store = window.localStorage;
    return Object.freeze({
      load: () => store.getItem(key()),
      save: (value: string) => store.setItem(key(), value),
      clear: () => store.removeItem(key()),
    });
  } catch {
    return Object.freeze({
      load: () => memory,
      save: (value: string) => {
        memory = value;
      },
      clear: () => {
        memory = null;
      },
    });
  }
})();
function livePersistenceTickNow(): number {
  return composition?.composition.frame.tick ?? shell.status().world.tick;
}
function livePersistenceProfile(): DrivingProfile {
  return liveCityStyleSource.activeStyle();
}
function livePersistenceCompany(): unknown | null {
  const company = economyModules.company,
    evolution = economyModules.evolution;
  if (company === undefined || evolution === undefined) return null;
  const tick = livePersistenceTickNow();
  const ledger = company.snapshot(tick);
  if (ledger === null) return null;
  return Object.freeze({
    finance: company.read(),
    ledger,
    evolution: evolution.snapshot(),
  });
}
function livePersistenceEconomy(): unknown | null {
  const economy = economyModules.composition;
  if (economy === undefined) return null;
  return economy.snapshot(livePersistenceTickNow());
}
function livePersistenceFingerprints() {
  const company = livePersistenceCompany(),
    economy = livePersistenceEconomy(),
    challenges = challengeModules.runtime?.checkpoint() ?? null;
  return Object.freeze({
    xp: liveDaily.status().xpFingerprint,
    kpi: economy === null ? 'none' : liveSaveFingerprint(economy),
    company: company === null ? 'none' : liveSaveFingerprint(company),
    profile: liveCityStyleSource.activeStyle().checksum,
    daily: liveSaveFingerprint(liveDaily.checkpoint()),
    challenges: challenges === null ? 'none' : liveSaveFingerprint(challenges),
  });
}
function replaceLiveCompanyState(value: unknown | null): void {
  const economy = economyModules.composition;
  if (economy === undefined)
    throw new Error('Compania nu poate fi restaurată înainte de economia live.');
  const sessionId = shell.status().sessionId,
    namespace = `v3:company:${sessionId}`,
    fleet = companyFleetPort();
  const oldCompany = economyModules.company,
    oldEvolution = economyModules.evolution;
  let company: LiveCompanyFinance, evolution: LiveCompanyEvolution;
  if (value === null) {
    company = createLiveCompanyFinance({ namespace, clock: economy.clock });
    evolution = createLiveCompanyEvolution({
      finance: company,
      ...(fleet === undefined ? {} : { fleet }),
      namespace,
      clock: economy.clock,
    });
  } else {
    const restored = restoreLiveCompany({
      namespace,
      clock: economy.clock,
      ...(fleet === undefined ? {} : { fleet }),
      state: value,
    });
    company = restored.company;
    evolution = restored.evolution;
  }
  economyModules.companies.set(sessionId, company);
  economyModules.evolutions.set(sessionId, evolution);
  economyModules.company = company;
  economyModules.evolution = evolution;
  if (oldEvolution !== evolution) oldEvolution?.dispose();
  if (oldCompany !== company) oldCompany?.dispose();
}
persistenceModules.live = createLivePersistence({
  identity: () => {
    const status = shell.status(),
      frame = composition?.composition.frame,
      profile = livePersistenceProfile();
    return {
      sessionKind: status.sessionId === CHAOS_SESSION_ID ? 'CHAOS' : 'ACADEMY',
      sessionId: status.sessionId,
      playerId: 'v3-player',
      profileId: profile.profileId,
      activeVersionId: profile.versionId,
      worldEpoch: status.worldEpoch,
      learningEpoch: status.learningEpoch,
      tick: livePersistenceTickNow(),
      mode: frame?.hud.mode ?? 'AUTO',
      vehicles: frame?.vehicles.length ?? 0,
      manualVehicles:
        frame?.vehicles.filter((vehicle) => vehicle.controlMode !== 'AUTO').length ?? 0,
    };
  },
  versions: Object.freeze({
    engine: 'engine-278-live',
    physics: 'physics-278-live',
    map: world.map.mapId,
  }),
  profile: {
    capture: () => livePersistenceProfile(),
    restore: (value) => {
      const profile = parseDrivingProfile(value);
      liveCityStyleSource.set(profile);
      liveFleet?.ambient.refreshStyle();
      modeModules.segments?.updateGeneration({
        baseVersionId: profile.versionId,
        learningEpoch: shell.status().learningEpoch,
      });
    },
  },
  metrics: () => {
    const read = liveDaily.read();
    return {
      xp: read.player.xpBalance,
      xpMicroXp: read.player.xpBalanceMicroXp,
      level: read.player.level,
      dailyRewards: read.daily.rewards,
    };
  },
  daily: {
    capture: () => liveDaily.checkpoint(),
    restore: (value) => liveDaily.restore(value as LiveDailyReloadCheckpoint),
  },
  challenges: {
    capture: () => challengeModules.runtime?.checkpoint() ?? null,
    restore: (value) =>
      challengeModules.runtime?.restore(value) ?? {
        status: 'REJECTED' as const,
        code: 'CHECKPOINT_INVALID',
        message: 'Owner-ul provocărilor nu este montat',
      },
  },
  company: {
    capture: () => livePersistenceCompany(),
    restore: (value) => replaceLiveCompanyState(value),
  },
  economy: { capture: () => livePersistenceEconomy() },
  segments: {
    open: () => {
      const state = modeModules.segments?.observe();
      if (state === undefined) return [];
      return state.segments
        .filter((segment) => segment.endTick === null)
        .map((segment) => ({
          segmentId: segment.segmentId,
          vehicleId: segment.vehicleId,
          mode: segment.mode,
        }));
    },
  },
  fingerprints: livePersistenceFingerprints,
  storage: liveSaveStorage,
});
/** PBI 275: the 126 panel is read-only; its own trigger is hidden because the shell owns the button. */
const missionPanel = createMissionPanel(app, {
  read: () => missionModules.runtime?.snapshot() ?? null,
  setSurface: (open) => {
    if (open) shell.openPanel('missions');
    else {
      shell.closePanel();
      refocusGame();
    }
  },
});
missionPanel.getTrigger().hidden = true;
/** PBI 276: the combined XP/daily panel is read-only and owns no ledger; the shell owns its button. */
const progressPanel = createLiveProgressPanel(app, {
  read: progressPanelSnapshot,
  setSurface: (open) => {
    if (open) shell.openPanel('progress');
    else {
      shell.closePanel();
      refocusGame();
    }
  },
});
progressPanel.getTrigger().hidden = true;
/**
 * PBI 277: the 233 challenge panel is read-only; the host executes its four intents against the live
 * 232/233 composition. Its trigger is hidden because the shell owns the `Provocări` button.
 */
const challengePanel = createChallengePanel(app, {
  read: () => challengeModules.runtime?.panelSnapshot() ?? null,
  onAction: (action) => {
    if (action === 'ACCEPT') challengeModules.runtime?.accept();
    else if (action === 'DECLINE') challengeModules.runtime?.decline();
    else if (action === 'RETRY') challengeModules.runtime?.retry();
    else if (action === 'CONTINUE') {
      challengePanel.close();
      refocusGame();
      return;
    }
    challengePanel.refresh();
  },
  setSurface: (open) => {
    if (open) shell.openPanel('challenges');
    else {
      shell.closePanel();
      refocusGame();
    }
  },
});
challengePanel.getTrigger().hidden = true;
/** PBI 275: the 117 tutorial panel stays separate from the campaign panel and from learning. */
const tutorialHost = document.createElement('div');
tutorialHost.className = 'live-mission-tutorial-host';
tutorialHost.style.cssText =
  'position:fixed;left:1rem;bottom:1rem;z-index:24;width:min(24rem,calc(100vw - 2rem));' +
  'max-height:min(50vh,26rem);overflow:auto;padding:0.7rem 0.8rem;background:#0b1a16f2;' +
  'border:1px solid #3d6b58;border-radius:0.55rem;color:#f3f7fb;' +
  'font:0.82rem/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;';
app.append(tutorialHost);
tutorialHost.hidden = true;
const missionTutorialStyle = document.createElement('style');
missionTutorialStyle.setAttribute('data-mission-tutorial-style', '117-mission-tutorial-ui-v1');
missionTutorialStyle.textContent = [
  '.live-mission-tutorial-host .mission-tutorial h2 { margin: 0 0 0.35rem; font-size: 0.95rem; color: #9fe0c5; }',
  '.live-mission-tutorial-host .mission-tutorial p { margin: 0.2rem 0; }',
  '.live-mission-tutorial-host .mission-tutorial button { margin: 0.35rem 0.3rem 0 0; font: inherit;',
  '  color: #f3f7fb; background: #17352b; border: 1px solid #3d6b58; border-radius: 0.35rem;',
  '  padding: 0.25rem 0.5rem; cursor: pointer; }',
  '.live-mission-tutorial-host .mission-tutorial button:hover { background: #22503f; }',
  '.live-mission-tutorial-host .mission-tutorial button:focus-visible { outline: 3px solid #9fe0c5;',
  '  outline-offset: 2px; }',
].join('\n');
app.ownerDocument.head?.append(missionTutorialStyle);
const tutorialPanel = createMissionTutorialPanel(tutorialHost, {
  pause: () => {
    liveMissions.tutorialPause(liveMissionTick());
    refocusGame();
  },
  resume: () => {
    liveMissions.tutorialResume(liveMissionTick());
    refocusGame();
  },
  skipStep: () => {
    liveMissions.tutorialSkipStep(liveMissionTick());
    refocusGame();
  },
  skipAll: () => {
    liveMissions.tutorialSkipAll(liveMissionTick());
    refocusGame();
  },
});
/** Geometria statică a hărții flotei; minima 074/281 rămâne separată de acest panou. */
const fleetMapGeometry = readMinimapGeometry({ map: world.map, graph: world.graph });
/**
 * PBI 281: minimapa live montează 074 + 076 + incidentele 281 peste exact aceeași geometrie 032/033.
 * Un click pe un marker cheamă doar `selectVehicle` din compunere (contractul 263) și readuce focusul
 * pe canvas, deci tastele de condus nu rămân captate de butonul markerului.
 */
const liveMinimap = createLiveMinimap(app, {
  geometry: fleetMapGeometry,
  select: (vehicleId) => {
    const accepted = composition?.composition.selectVehicle(vehicleId) ?? false;
    if (!accepted) return;
    liveMinimap.setFollowed(vehicleId);
    view.getCanvas().focus();
  },
});
if (liveMinimap.getRoot() !== null) liveMinimap.getRoot()!.hidden = true;
/**
 * PBI 263: read model-ul listei/hărții. Compunerea rămâne singurul owner al selecției, autorității
 * și stării vehiculelor; aici doar proiectăm cadrul acceptat.
 */
function liveFleetSnapshot() {
  const frame = composition?.composition.frame;
  if (frame === undefined) return null;
  const status = shell.status();
  return readLiveFleetSelectionSnapshot({
    tick: frame.tick,
    sessionId: status.sessionId,
    worldEpoch: status.worldEpoch,
    vehicles: frame.vehicles,
    authority: frame.authority,
    cameraEntityId: frame.camera.entityId,
    characterEntityId: frame.character.entityId,
    selectedVehicleId: frame.selectedVehicleId,
    playerVehicleId: frame.playerVehicleId,
  });
}
/**
 * PBI 281: the minimap follows the camera-selected vehicle, then the PLAYER seat, then the first
 * real active ride and finally the first taxi. A missing vehicle is not replaced with a fake one.
 */
function minimapVehicleOf(frame: CompositionFrame): CompositionFrame['vehicles'][number] | null {
  const selected =
    frame.selectedVehicleId === null
      ? undefined
      : frame.vehicles.find((vehicle) => vehicle.vehicleId === frame.selectedVehicleId);
  if (selected !== undefined) return selected;
  const player =
    frame.playerVehicleId === null
      ? undefined
      : frame.vehicles.find((vehicle) => vehicle.vehicleId === frame.playerVehicleId);
  if (player !== undefined) return player;
  const ride = ridesModules.composition?.lifecycle.lifecycle.active()[0],
    rideTaxi =
      ride === undefined
        ? undefined
        : frame.vehicles.find((vehicle) => vehicle.vehicleId === ride.taxiId);
  return rideTaxi ?? frame.vehicles.find((vehicle) => vehicle.driverKind === 'TAXI') ?? null;
}
function minimapTaxiSlot(vehicleId: string): number | undefined {
  const slot = liveFleet?.registry.get(vehicleId)?.slot;
  if (slot !== undefined) return slot;
  if (vehicleId.startsWith('taxi-')) return LIVE_FLEET_PRESENTATION_SLOTS.taxi;
  if (vehicleId.startsWith('civil-')) return LIVE_FLEET_PRESENTATION_SLOTS.civil;
  return undefined;
}
/**
 * PBI 281: one minimap/HUD frame over the real 032/033 geometry, 057 registry, 061/064 ride state
 * and 065 incidents. It advances no tick and creates no route or ride of its own.
 */
function updateLiveMinimap(frame: CompositionFrame, status: ReturnType<typeof shell.status>): void {
  const fleet = liveFleet,
    rideComposition = ridesModules.composition;
  if (fleet === undefined || rideComposition === undefined) return;
  const vehicle = minimapVehicleOf(frame),
    taxiSlot = vehicle === null ? undefined : minimapTaxiSlot(vehicle.vehicleId),
    now = performance.now(),
    selection = liveFleetSnapshot();
  if (selection === null) return;
  const positions = new Map(
      frame.vehicles.map((entry) => [
        entry.vehicleId,
        Object.freeze({ x: entry.positionM.x, z: entry.positionM.z }),
      ]),
    ),
    incidents = readMinimapIncidents(
      { health: dashboardModules.health },
      {
        sessionId: status.sessionId,
        worldEpoch: status.worldEpoch,
        tick: frame.tick,
        positions: (vehicleId) => positions.get(vehicleId) ?? null,
      },
    ),
    minimapFrame = readMinimapFrame(
      {
        fleet: fleet.registry,
        lifecycle: rideComposition.lifecycle.lifecycle,
        eta: rideComposition.lifecycle.eta,
      },
      {
        taxiId: vehicle?.vehicleId ?? '',
        ...(taxiSlot === undefined ? {} : { taxiSlot }),
        tick: frame.tick,
        positionM:
          vehicle === null
            ? null
            : Object.freeze({
                x: vehicle.positionM.x,
                y: vehicle.positionM.y,
                z: vehicle.positionM.z,
              }),
        headingRad: vehicle === null ? null : mapHeadingFromCompositionYaw(vehicle.yawRad),
      },
    );
  liveMinimap.update(minimapFrame, selection.map, incidents, now);
}
/**
 * PBI 267: the three panels read the same 209/061/065 owners. A read is only requested when the host
 * asks for it (popup open/refresh, dashboard open, HUD tick); no panel owns a ledger or a history.
 */
function currentKpiSnapshot() {
  const economy = economyModules.composition;
  if (economy === undefined) return null;
  const tick = composition?.composition.frame.tick ?? economy.stats().tick;
  return economy.economy.kpi.snapshot(tick);
}
function kpiHistorySelection() {
  const kpi = currentKpiSnapshot();
  return kpi === null ? null : readKpiHistory({ kpi });
}
function kpiImpactSnapshot() {
  const economy = economyModules.composition,
    frame = composition?.composition.frame,
    kpi = currentKpiSnapshot();
  if (economy === undefined || frame === undefined || kpi === null) return null;
  // Before the first commercial event there is no consequence to report; the HUD stays hidden.
  if (kpi.days.length === 0) return null;
  const status = shell.status(),
    read = economy.read();
  return readKpiImpact({
    kpi,
    sessionId: status.sessionId,
    worldEpoch: status.worldEpoch,
    namespace: economy.economy.namespace,
    controlMode: frame.hud.mode,
    lastReview: read?.lastReview ?? null,
  });
}
function cityDashboardSnapshot() {
  const rideComposition = ridesModules.composition,
    health = dashboardModules.health,
    frame = composition?.composition.frame;
  if (rideComposition === undefined || health === undefined || frame === undefined) return null;
  const status = shell.status();
  return readCityDashboardSnapshot(
    {
      context: { sessionId: status.sessionId, worldEpoch: status.worldEpoch },
      lifecycle: rideComposition.lifecycle.lifecycle,
      health,
      // Real planned trip distance of the same 033 lanes the tariff used; no invented metre.
      rideDistanceM: (ride) => rideTripDistanceM(world.graph, ride),
    },
    { tick: frame.tick, selectedIncidentId: null },
  );
}
/** PBI 276: the panel projection reads the one live daily/XP ledger, never a second balance. */
function progressPanelSnapshot(): LiveProgressSnapshot | null {
  const runtime = dailyModules.runtime;
  if (runtime === undefined) return null;
  const read = runtime.read(Date.now()),
    player = read.player;
  const entries = player.entries.slice(-16).map((entry) =>
    Object.freeze({
      entryId: entry.entryId,
      causeType: entry.causeType,
      amountXp: entry.amountXp,
      balanceAfterXp: entry.balanceAfterXp,
      realTimeMs: entry.realTimeMs,
      tick: entry.tick,
    }),
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: LIVE_PROGRESS_READ_VERSION,
    playerId: read.playerId,
    sessionId: read.sessionId,
    worldEpoch: read.worldEpoch,
    kind: read.kind,
    observedAtMs: read.observedAtMs,
    daily: read.daily,
    player: Object.freeze({
      playerId: player.playerId,
      xpBalance: player.xpBalance,
      xpBalanceMicroXp: player.xpBalanceMicroXp,
      level: player.level,
      nextLevelXp: player.nextLevelXp,
      levelProgress: player.levelProgress,
      activePlaySeconds: player.activePlaySeconds,
      entries: Object.freeze(entries),
      credits: player.counters.credits,
      duplicates: player.counters.duplicates,
      debits: 0 as const,
      balanceIsSumOfEntries: true as const,
    }),
    xpFingerprint: read.xpFingerprint,
  });
}
/** PBI 263: un singur panou live; click-ul selectează doar camera, preluarea este explicită. */
const fleetPanel = createFleetSelectionPanel(app, {
  select: (vehicleId) => composition?.composition.selectVehicle(vehicleId) ?? false,
  takeover: (vehicleId) => composition?.composition.requestTakeover(vehicleId, 'MANUAL') ?? false,
  learning: (vehicleId) => composition?.composition.requestTakeover(vehicleId, 'LEARNING') ?? false,
  release: () => composition?.composition.requestRelease() ?? false,
  onClose: () => {
    shell.closePanel();
    if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
  },
  geometry: fleetMapGeometry,
});
/** PBI 264: panoul read-only al cererilor și alocărilor; nu scrie în simulare. */
const ridesPanel = createLiveRidesPanel(app, {
  onClose: () => {
    shell.closePanel();
    if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
  },
});
/**
 * PBI 265: markerii 147 sunt proiectați în lume pe ancorele reale 032; presenterul nu citește
 * simularea și nu creează pasageri. Stratul este singurul port de markeri al browsereului.
 */
const rideMarkerLayer = createLiveRideMarkerLayer(app);
const passengerPresenter = createPassengerVisualPresenter(rideMarkerLayer.port);
/**
 * PBI 266: read model-ul economic compact, montat permanent. Nu este pop-up-ul KPI al 267: arată
 * doar ziua/luna simulată curentă și ultima decontare, citind portul la 10 Hz.
 */
const economyHud = createLiveEconomyHud(app, {
  read: () => economyModules.composition?.read() ?? null,
});
/**
 * PBI 267: KPI popup over the 210 selection. It reads only on open/refresh; the trigger mounted in
 * the shell bar is the single native button, so the inline 210 trigger is hidden instead of leaving
 * a second unreachable control.
 */
const kpiHistoryPanel = createKpiHistoryPanel(app, {
  read: kpiHistorySelection,
  setSurface: (open) => {
    if (open) shell.openPanel('kpis');
    else shell.closePanel();
  },
  onClose: () => {
    if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
  },
});
kpiHistoryPanel.getTrigger().hidden = true;
/** PBI 267: the 082 city dashboard inside a real host surface with focus, Tab and Escape. */
const cityDashboardPanel = createCityDashboardPanel(app, {
  read: cityDashboardSnapshot,
  setSurface: (open) => {
    if (open) shell.openPanel('city');
    else shell.closePanel();
  },
  onClose: () => {
    if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
  },
});
/** PBI 267: 214 consequence HUD, capped at 10 Hz by the adapter itself. */
const impactHost = document.createElement('div');
impactHost.className = 'kpi-impact-host';
impactHost.style.cssText =
  'position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:20;' +
  'max-width:min(92vw,34rem);pointer-events:none;';
app.append(impactHost);
const kpiImpactHud = createKpiImpactHud(impactHost, { read: kpiImpactSnapshot });
/** The KPI popup is live only while open in observation AUTO; its reads stay capped at 10 Hz. */
let lastKpiPanelRefresh = -Infinity;
/** PBI 275: the mission panel reads at 10 Hz only while open; the tutorial HUD at 10 Hz while live. */
let lastMissionPanelRefresh = -Infinity;
let lastProgressPanelRefresh = -Infinity;
let lastChallengePanelRefresh = -Infinity;
let lastTutorialPanelRefresh = -Infinity;
/**
 * PBI 270: panoul companiei citește exact read model-ul 269 și cheltuie cash-ul real prin
 * `purchase`/`upgrade`. El nu creează un al doilea ledger sau o a doua flotă; suprafața de pauză
 * rămâne a shell-ului (070), iar panoul închis nu citește nimic.
 */
const companyDashboard = createCompanyDashboard(app, {
  read: () => economyModules.evolution?.read() ?? null,
  purchase: (offerId) => economyModules.evolution?.purchase(offerId) ?? null,
  upgrade: (upgradeId) => economyModules.evolution?.upgrade(upgradeId) ?? null,
  setSurface: (open) => {
    if (open) shell.openPanel('company');
    else shell.closePanel();
  },
  onClose: () => {
    if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
  },
});
/** Ultimul taxi cu markere 147; schimbarea selecției nu lasă markerii vechi în urmă. */
let lastMarkerTaxiId: string | null = null;
/** PBI 281: 10 Hz wall-clock gate for the minimap and the complete HUD, independent of tick rate. */
let lastMinimapPaintAt = -Infinity;
let lastLiveHudPaintAt = -Infinity;
/** PBI 278: preview-ul afișat este singurul care poate fi confirmat. */
let pendingGameImport: { readonly previewId: string; readonly text: string } | null = null;
function persistenceStatusView(): {
  label: string;
  detail: string;
  tick: number | null;
  lastSavedTick: number | null;
} {
  const runtime = persistenceModules.live;
  if (runtime === undefined)
    return {
      label: 'NOT_SAVED_YET',
      detail: 'Persistența nu este montată',
      tick: null,
      lastSavedTick: null,
    };
  const status = runtime.status();
  return {
    label: status.view.label,
    detail: status.view.detail,
    tick: status.simulated.tick,
    lastSavedTick: status.simulated.lastSavedTick,
  };
}
async function saveGameToFile(): Promise<GameShellFileResult> {
  const runtime = persistenceModules.live;
  if (runtime === undefined)
    return { status: 'ERROR', message: 'Persistența nu este montată.', lines: [] };
  shell.setMenuOpen(true);
  if (application.getState().kind === 'PLAYING') application.pause('menu');
  await runtime.saveNow(livePersistenceTickNow());
  const exported = runtime.exportFile();
  if (exported.status === 'REJECTED')
    return {
      status: 'ERROR',
      message: `${exported.rejection.code}: ${exported.rejection.message}`,
      lines: [],
    };
  return {
    status: 'READY',
    message: 'Fișier pregătit pentru descărcare.',
    fileName: exported.fileName,
    text: exported.text,
    checksum: exported.checksum,
    lines: [
      `Sesiune ${exported.summary.sessionId} · tick ${exported.summary.tick} · generația ${exported.summary.generation}`,
      `XP ${exported.summary.xp} · nivel ${exported.summary.level} · daily ${exported.summary.dailyDate ?? '-'}`,
      `Companie cash ${exported.summary.companyCashMinorUnits ?? '-'} · profit ${exported.summary.companyProfitMinorUnits ?? '-'}`,
      `Checksum ${exported.checksum.slice(0, 16)}… · ${exported.bytes} bytes`,
    ],
  };
}
function previewGameFile(file: { fileName: string; text: string }): GameShellFileResult {
  const runtime = persistenceModules.live;
  if (runtime === undefined)
    return { status: 'ERROR', message: 'Persistența nu este montată.', lines: [] };
  const preview = runtime.preview(file.text);
  if (preview.status === 'REJECTED') {
    pendingGameImport = null;
    return {
      status: 'ERROR',
      message: `${preview.rejection.code}: ${preview.rejection.message}`,
      lines: [],
    };
  }
  pendingGameImport = { previewId: preview.previewId, text: file.text };
  return {
    status: 'PREVIEW',
    message: 'Fișier verificat. Confirmă înlocuirea sesiunii curente.',
    fileName: file.fileName,
    previewId: preview.previewId,
    checksum: preview.summary.checksum,
    lines: [
      `Fișier: ${file.fileName} · ${preview.summary.bytes} bytes`,
      `Sesiune ${preview.summary.sessionId} · tick ${preview.summary.tick} · generația ${preview.summary.generation}`,
      `XP ${preview.summary.xp} · nivel ${preview.summary.level} · daily ${preview.summary.dailyDate ?? '-'} (${preview.summary.dailyRewards} recompense)`,
      `Companie cash ${preview.summary.companyCashMinorUnits ?? '-'} · revenue ${preview.summary.companyRevenueMinorUnits ?? '-'}`,
      `KPI zile ${preview.summary.kpiDays} · profil ${preview.summary.profileVersionId}`,
      `Curent: XP ${preview.current?.xp ?? '-'} · nivel ${preview.current?.level ?? '-'}`,
      `Checksum ${preview.summary.checksum.slice(0, 16)}…`,
    ],
  };
}
async function confirmGameImport(): Promise<GameShellFileResult> {
  const runtime = persistenceModules.live,
    pending = pendingGameImport;
  if (runtime === undefined || pending === null)
    return { status: 'ERROR', message: 'Niciun preview validat de confirmat.', lines: [] };
  // The replacement is a paused operation: no tick is allowed between the preview and the atomic
  // owner replacement, and the session resumes in AUTO afterwards.
  shell.setMenuOpen(true);
  if (application.getState().kind === 'PLAYING') application.pause('menu');
  composition?.composition.releaseInput();
  const result = await runtime.importFile(pending.text, { previewId: pending.previewId });
  pendingGameImport = null;
  if (result.status === 'REJECTED')
    return {
      status: 'ERROR',
      message: `${result.rejection.code}: ${result.rejection.message}`,
      lines: result.rollback ? ['Sesiunea curentă a fost păstrată.'] : [],
    };
  composition?.setVehicleMode('AUTO');
  shell.setMode('AUTO');
  sessionNotice = `Fișier importat: tick ${result.summary.tick}, XP ${result.summary.xp}`;
  shellHost.refreshSession();
  return {
    status: 'COMMITTED',
    message: 'Fișier importat. Jocul pornește în pauză/AUTO.',
    checksum: result.checksum,
    lines: [
      `XP ${result.summary.xp} · nivel ${result.summary.level} · ΔXP ${result.xpDelta}`,
      `Recompense daily ${result.summary.dailyRewards} · Δ ${result.dailyRewardsDelta}`,
      `Companie ${result.companyFingerprint ?? '-'} · KPI ${result.kpiFingerprint}`,
      `Segment anterior ${result.previousSegment}${result.openSegmentIds.length > 0 ? ` (${result.openSegmentIds.join(', ')})` : ''}`,
      `Vânzări/XP adăugate: settle ${result.rewards.settled} · granted ${result.rewards.granted}`,
    ],
  };
}
/** Singura gazdă UI a shell-ului: start, pauză, reluare și panoul de integrare. */
const shellHost = createGameShellHost({
  root: app,
  snapshot: () => shell.status(),
  onStart: () => startSession(),
  onPause: () => {
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (kpiHistoryPanel.isOpen()) kpiHistoryPanel.close();
    if (cityDashboardPanel.isOpen()) cityDashboardPanel.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    shell.setMenuOpen(true);
  },
  onResume: () => resumeSession(),
  sessionMenu: () => sessionModules.flow?.menu() ?? EMPTY_SESSION_MENU,
  onChooseSession: (kind) => {
    void chooseSession(kind as SessionKind);
  },
  onResetWorld: () => {
    void resetSessionWorld();
  },
  onOpenPanel: () => {
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (kpiHistoryPanel.isOpen()) kpiHistoryPanel.close();
    if (cityDashboardPanel.isOpen()) cityDashboardPanel.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    return shell.openPanel('integration');
  },
  onClosePanel: () => {
    shell.closePanel();
    if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
  },
  onOpenFleet: () => {
    // The shell owns a single panel surface: a live panel is not left underneath another one.
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    if (!shell.openPanel('fleet')) return false;
    const snapshot = liveFleetSnapshot();
    if (snapshot !== null) fleetPanel.update(snapshot, performance.now());
    fleetPanel.open();
    return true;
  },
  onOpenRides: () => {
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    if (!shell.openPanel('rides')) return false;
    // The panel skips writes while closed; open it first, then project the current read model.
    ridesPanel.open();
    const snapshot = ridesModules.composition?.snapshot();
    if (snapshot !== undefined)
      ridesPanel.update(snapshot.live, performance.now(), snapshot.rides, snapshot.passenger);
    return true;
  },
  onOpenCompany: () => {
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    return companyDashboard.open();
  },
  onOpenKpis: () => {
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (cityDashboardPanel.isOpen()) cityDashboardPanel.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    return kpiHistoryPanel.open();
  },
  onOpenCity: () => {
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (kpiHistoryPanel.isOpen()) kpiHistoryPanel.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    return cityDashboardPanel.open();
  },
  onOpenMissions: () => {
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (kpiHistoryPanel.isOpen()) kpiHistoryPanel.close();
    if (cityDashboardPanel.isOpen()) cityDashboardPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    return missionPanel.open();
  },
  onOpenProgress: () => {
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (kpiHistoryPanel.isOpen()) kpiHistoryPanel.close();
    if (cityDashboardPanel.isOpen()) cityDashboardPanel.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (challengePanel.isOpen()) challengePanel.close();
    return progressPanel.open();
  },
  onOpenChallenges: () => {
    if (fleetPanel.isOpen()) fleetPanel.close();
    if (ridesPanel.isOpen()) ridesPanel.close();
    if (companyDashboard.isOpen()) companyDashboard.close();
    if (kpiHistoryPanel.isOpen()) kpiHistoryPanel.close();
    if (cityDashboardPanel.isOpen()) cityDashboardPanel.close();
    if (missionPanel.isOpen()) missionPanel.close();
    if (progressPanel.isOpen()) progressPanel.close();
    return challengePanel.open();
  },
  onOpenSettings: () => openSettings('GAME'),
  onSaveGame: saveGameToFile,
  onLoadGame: previewGameFile,
  onConfirmLoad: confirmGameImport,
  onCancelLoad: () => {
    pendingGameImport = null;
  },
  saveStatus: persistenceStatusView,
});
/** Fiecare tranziție de sesiune ajunge și în gazda shell-ului, nu doar în view-ul de randare. */
let telemetrySuspended = false;
const showView = (state: Parameters<typeof view.show>[0]): void => {
  // PBI 276: only an actually playing, visible Academy window credits time. Suspension closes the
  // window at the last real tick, so pause/menu/panel/focus never pay for the hidden interval.
  if (state.kind === 'PLAYING') dailyModules.runtime?.resume(Date.now());
  else dailyModules.runtime?.suspend(Date.now());
  // PBI 272: orice suspendare a ceasului (070 focus/meniu/panou sau background-ul browserului)
  // produce un artefact 088; reluarea închide intervalul, fără să inventeze tick-uri.
  if (state.kind === 'PAUSED' && !telemetrySuspended) {
    telemetrySuspended = true;
    noteLiveTelemetrySuspension(state.reason === 'focus' ? 'FOCUS_LOST' : 'PAUSE');
  } else if (state.kind === 'PLAYING' && telemetrySuspended) {
    telemetrySuspended = false;
    noteLiveTelemetryResume();
  }
  view.show(state);
  shellHost.setSessionState(state.kind);
  if (state.kind !== 'PLAYING') tutorialHost.hidden = true;
  // PBI 281: the minimap is a driving surface. A live panel may keep it during AUTO observation;
  // the start screen, pause menu and focus loss hide it instead of leaving a stale map on screen.
  const minimapRoot = liveMinimap.getRoot();
  if (minimapRoot !== null)
    minimapRoot.hidden = !(
      state.kind === 'PLAYING' ||
      (state.kind === 'PAUSED' && state.reason === 'panel')
    );
};
/** Browser alt-tab/blur only *reports*; the authoritative suspension stays a 070 decision. */
const focusBinding = bindPauseFocusInput({
  surface: app,
  onFocusLost: () => {
    if (!noFocusPause) shell.setFocusLost(true);
  },
  onFocusGained: () => {
    if (!noFocusPause) shell.setFocusLost(false);
  },
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
        let ownedPhysics: LiveVehiclePhysics | undefined;
        let ownedAudio: AudioEngine | undefined;
        let ownedChaos: LiveChaos | undefined;
        let ownedTraffic: ReturnType<typeof createAmbientTraffic> | undefined;
        let ownedRides: LiveRides | undefined;
        let ownedRideComposition: LiveRideComposition | undefined;
        let ownedHealth: FleetHealth | undefined;
        let ownedHud: ReturnType<typeof createTaxiHud> | undefined;
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
            styleSource: liveCityStyleSource,
            liveRules: true,
          });
          liveFleet = {
            registry: ownedTraffic.registry,
            traffic: ownedTraffic.traffic,
            ambient: ownedTraffic,
          };
          // PBI 282: one live Rapier world for the composition cars. Buildings are named 028
          // obstacles, so a wall impact is a real contact with a real 029 incident.
          ownedPhysics = await createLiveVehiclePhysics({
            context: compositionContext,
            initialTick: 0,
            staticBoxes: world.walkWorld.blockers.map((blocker) => {
              const bounds = blocker.polygon.bounds;
              return Object.freeze({
                id: blocker.id,
                centerM: Object.freeze({
                  x: (bounds.minX + bounds.maxX) / 2,
                  y: (blocker.bottomM + blocker.topM) / 2,
                  z: (bounds.minZ + bounds.maxZ) / 2,
                }),
                halfExtentsM: Object.freeze({
                  x: Math.max(0.05, (bounds.maxX - bounds.minX) / 2),
                  y: Math.max(0.05, (blocker.topM - blocker.bottomM) / 2),
                  z: Math.max(0.05, (bounds.maxZ - bounds.minZ) / 2),
                }),
              });
            }),
            recovery: createRecoveryRoadProvider(world.graph),
          });
          // PBI 285: one audio engine and one destruction composition over the same physics owner.
          // The engine creates its Web Audio context only from the first player gesture.
          ownedAudio = createAudioEngine({ backend: createWebAudioBackend() });
          releaseAudioGesture?.();
          releaseAudioGesture = armAudioGesture(ownedAudio);
          ownedChaos = createLiveChaos({
            context: compositionContext,
            layout: world.layout,
            engine: ownedAudio,
            physics: ownedPhysics,
            onReaction: showDestructionReaction,
            xpMicroXp: () => dailyModules.runtime?.read().player.xpBalanceMicroXp ?? 0,
            profileFingerprint: () => {
              const pipeline = learningModules.pipeline;
              return pipeline === undefined
                ? 'NO_LIVE_PROFILE'
                : `${pipeline.profileId}@${pipeline.head()}`;
            },
          });
          liveAudio = ownedAudio;
          liveChaos = ownedChaos;
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
            onCameraModeChanged: rememberCameraMode,
            physics: ownedPhysics,
            chaos: ownedChaos,
          });
          // PBI 271: the single 069 live boundary owner over this composition, before the first
          // shell tick. It closes/opens segments at the exact accepted tick without a second model.
          disposeLiveTelemetry('SESSION_CHANGE');
          disposeLiveModeSegments('SESSION_CHANGE');
          disposeLiveLearning();
          composition = ownedComposition;
          beginLiveMissions();
          mountLiveModeSegments();
          mountLiveTelemetry();
          mountLiveLearning();
          // PBI 264: cererile și dispecerizarea live peste exact aceleași 24 de taxiuri 057/058.
          // Plannerul 041 este al acestui modul; harta, graful și registry-ul rămân ale compunerii.
          ownedRides = createLiveRides({
            registry: ownedTraffic.registry,
            map: world.map,
            graph: world.graph,
            seed: ownedTraffic.seed,
            scenarioId: 'v3-live-city-264',
            namespace: 'v3:city:rides',
            keepPlayerClaims: true,
          });
          rideRuntimeModules.live = ownedRides;
          // PBI 265: aceleași revendicări 060 intră în lifecycle-ul 061, pickup 062, dropoff 063,
          // ETA 064 și pasagerul 147; niciun al doilea model de cursă nu este creat.
          ownedRideComposition = createLiveRideComposition({
            live: ownedRides,
            map: world.map,
            graph: world.graph,
            actors: ownedTraffic.traffic,
            sessionId: compositionContext.sessionId,
            worldEpoch: compositionContext.worldEpoch,
          });
          ridesModules.composition = ownedRideComposition;
          // PBI 267: the real 065 health owner of this same fleet. It starts with no external fact
          // because 028/029 live producers are not mounted yet; the dashboard reports that honestly
          // instead of inventing blockages or damages.
          ownedHealth = createFleetHealth({
            dispatcher: ownedRides.dispatcher,
            lifecycle: ownedRideComposition.lifecycle.lifecycle,
            demand: ownedRides.demand,
            eta: ownedRideComposition.lifecycle.eta,
            registry: ownedTraffic.registry,
          });
          dashboardModules.health = ownedHealth;
          // PBI 266: economia 209 peste exact aceleași închideri 061; niciun al doilea ledger sau
          // model de cursă. Portul `economy` rulează după `rides` în același cadru autoritar.
          disposeEconomies();
          const economyActivation = activateEconomy(shell.status().sessionId);
          if (economyActivation.created)
            economyActivation.economy?.flush({
              tick: ownedComposition.composition.frame.tick,
            });
          // PBI 278: the company restore needs the economy owner, which exists from here on.
          restoreLivePersistence();
          ownedHud = createTaxiHud(app);
          ridesModules.hud = ownedHud;
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
            disposeLiveTelemetry('SHUTDOWN');
            disposeLiveModeSegments('SHUTDOWN');
            disposeLiveLearning();
            learningModules.queue?.dispose();
            learningModules.queue = undefined;
            if (attachedShellWorld) {
              attachedShellWorld = false;
              shell.detachWorld();
            }
            disposeEconomies();
            ownedRideComposition?.dispose();
            if (ridesModules.composition === ownedRideComposition)
              ridesModules.composition = undefined;
            if (rideRuntimeModules.live === ownedRides) rideRuntimeModules.live = undefined;
            ownedRides?.dispose();
            ownedHealth?.dispose();
            if (dashboardModules.health === ownedHealth) dashboardModules.health = undefined;
            ownedHud?.dispose();
            if (ridesModules.hud === ownedHud) ridesModules.hud = undefined;
            ownedComposition?.dispose();
            ownedChaos?.dispose();
            if (liveChaos === ownedChaos) liveChaos = undefined;
            releaseAudioGesture?.();
            releaseAudioGesture = undefined;
            ownedAudio?.dispose();
            if (liveAudio === ownedAudio) liveAudio = undefined;
            ownedPhysics?.dispose();
          } finally {
            try {
              ownedTraffic?.dispose();
              if (ownedTraffic !== undefined && liveFleet?.traffic === ownedTraffic.traffic)
                liveFleet = undefined;
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
                disposeLiveTelemetry('SHUTDOWN');
                disposeLiveModeSegments('SHUTDOWN');
                disposeLiveLearning();
                learningModules.queue?.dispose();
                learningModules.queue = undefined;
                if (attachedShellWorld) {
                  attachedShellWorld = false;
                  shell.detachWorld();
                }
                disposeEconomies();
                ownedRideComposition?.dispose();
                if (ridesModules.composition === ownedRideComposition)
                  ridesModules.composition = undefined;
                if (rideRuntimeModules.live === ownedRides) rideRuntimeModules.live = undefined;
                ownedRides?.dispose();
                ownedHealth?.dispose();
                if (dashboardModules.health === ownedHealth) dashboardModules.health = undefined;
                ownedHud?.dispose();
                if (ridesModules.hud === ownedHud) ridesModules.hud = undefined;
                ownedComposition?.dispose();
                ownedChaos?.dispose();
                if (liveChaos === ownedChaos) liveChaos = undefined;
                releaseAudioGesture?.();
                releaseAudioGesture = undefined;
                ownedAudio?.dispose();
                if (liveAudio === ownedAudio) liveAudio = undefined;
                ownedPhysics?.dispose();
              } finally {
                // PBI 256: compunerea nu deține traficul; registry-ul și actorii 058 se eliberează aici.
                ownedTraffic?.dispose();
                if (ownedTraffic !== undefined && liveFleet?.traffic === ownedTraffic.traffic)
                  liveFleet = undefined;
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
      if (step.tick % 6 === 0) {
        const canControl =
          frame.hud.controlledKind === 'VEHICLE' || frame.selectedVehicleId !== null;
        const modeState = modeModules.segments?.observe();
        view.updatePlayHud({
          speedMps: frame.hud.speedMps,
          mode: frame.hud.mode,
          controlledKind: frame.hud.controlledKind,
          canToggle: canControl,
          canLearn: canControl,
          speedUnit: settings.units.speed,
          ...(modeState === undefined ? {} : { learningEligible: modeState.learning.eligible }),
        });
      }
    },
    interpolate: (_previous, current) => current,
  }),
  present: () => {
    const frame = composition?.composition.frame;
    if (frame !== undefined) shell.setMode(frame.hud.mode);
    shell.present();
    shellHost.refresh();
    // PBI 263: lista/harta consumă cadrul autoritar la ~10 Hz; panoul închis nu scrie nimic.
    if (fleetPanel.isOpen()) {
      const snapshot = liveFleetSnapshot();
      if (snapshot !== null) fleetPanel.update(snapshot, performance.now());
    }
    // PBI 264/265: panoul curselor citește read model-ul live + lifecycle + pasagerul 147.
    if (ridesPanel.isOpen()) {
      const snapshot = ridesModules.composition?.snapshot();
      if (snapshot !== undefined)
        ridesPanel.update(snapshot.live, performance.now(), snapshot.rides, snapshot.passenger);
    }
    // PBI 266: economia live are propriul read model, actualizat la 10 Hz cât timp este vizibil.
    economyHud.update(performance.now());
    // PBI 270: panoul companiei citește la 10 Hz numai cât timp este deschis; închis nu atinge portul.
    companyDashboard.update(performance.now());
    // PBI 267: pop-up-ul KPI se actualizează numai cât timp este deschis; orașul la fel.
    if (frame !== undefined) {
      const latestViolation = liveFleet?.ambient?.violations().at(-1) ?? null;
      const now = performance.now();
      if (latestViolation !== null && latestViolation.eventId !== lastTrafficViolationId) {
        lastTrafficViolationId = latestViolation.eventId;
        trafficViolationShownAt = now;
        trafficViolationNotice.textContent =
          latestViolation.kind === 'RED_LIGHT'
            ? `Încălcare: trecere pe roșu la ${latestViolation.stopLineId ?? 'linia de semnal'} (tic ${latestViolation.tick})`
            : `Încălcare: STOP fără oprire completă la ${latestViolation.stopLineId ?? 'linia STOP'} (tic ${latestViolation.tick})`;
      }
      const violationVisible =
        lastTrafficViolationId !== null && now - trafficViolationShownAt < 8000;
      trafficViolationNotice.style.display = violationVisible ? 'block' : 'none';
      kpiImpactHud.update(frame.tick);
      const at = performance.now();
      // PBI 281: minimap, route, fleet markers and incidents read the accepted frame at 10 Hz wall
      // clock, so a slow render loop cannot starve the map or the complete HUD.
      if (at - lastMinimapPaintAt >= 100) {
        lastMinimapPaintAt = at;
        updateLiveMinimap(frame, shell.status());
      }
      if (kpiHistoryPanel.isOpen() && at - lastKpiPanelRefresh >= 100) {
        lastKpiPanelRefresh = at;
        kpiHistoryPanel.refresh();
      }
      if (cityDashboardPanel.isOpen()) cityDashboardPanel.update(at);
      // PBI 275: the 126 panel reads the real 116/125 read models only while open, at 10 Hz.
      if (missionPanel.isOpen() && at - lastMissionPanelRefresh >= 100) {
        lastMissionPanelRefresh = at;
        missionPanel.refresh();
      }
      // PBI 276: the combined XP/daily panel reads at 10 Hz only while open; closed does nothing.
      if (progressPanel.isOpen() && at - lastProgressPanelRefresh >= 100) {
        lastProgressPanelRefresh = at;
        progressPanel.refresh();
      }
      // PBI 277: the challenge panel reads the real 232/233 contracts at 10 Hz only while open.
      if (challengePanel.isOpen() && at - lastChallengePanelRefresh >= 100) {
        lastChallengePanelRefresh = at;
        challengePanel.refresh();
      }
      // PBI 275: the 117 tutorial is a separate HUD; it is hidden once completed and never asks the
      // learning pipeline for anything.
      const tutorialSnapshot = liveMissions.tutorialSnapshot();
      if (tutorialSnapshot === null || tutorialSnapshot.state === 'COMPLETED') {
        tutorialHost.hidden = true;
      } else {
        tutorialHost.hidden = false;
        if (at - lastTutorialPanelRefresh >= 100) {
          lastTutorialPanelRefresh = at;
          tutorialPanel.update(tutorialSnapshot, at);
        }
      }
    }
    // PBI 265: HUD-ul 073 și markerii 147 citesc aceeași stare autoritară; nimic nu scrie în simulare.
    const rideComposition = ridesModules.composition;
    if (frame !== undefined && rideComposition !== undefined) {
      const taxiId = frame.playerVehicleId ?? frame.selectedVehicleId ?? lastMarkerTaxiId;
      if (taxiId !== null) {
        lastMarkerTaxiId = taxiId;
        passengerPresenter.update(rideComposition.passenger({ taxiId, tick: frame.tick }));
      }
      rideMarkerLayer.project({
        positionM: frame.camera.positionM,
        lookAtM: frame.camera.lookAtM,
        up: frame.camera.up,
        fovRadians: frame.camera.fovRadians,
        widthPx: window.innerWidth,
        heightPx: window.innerHeight,
      });
      const hud = ridesModules.hud;
      const hudNow = performance.now();
      if (hud !== undefined && hudNow - lastLiveHudPaintAt >= 100) {
        lastLiveHudPaintAt = hudNow;
        const hudVehicle =
          taxiId === null
            ? undefined
            : frame.vehicles.find((vehicle) => vehicle.vehicleId === taxiId);
        hud.update(
          rideComposition.hud({
            taxiId: taxiId ?? '',
            mode: hudVehicle?.controlMode ?? frame.hud.mode,
            tick: frame.tick,
            speedMps: Math.abs(hudVehicle?.speedMps ?? frame.hud.speedMps),
            sessionKind: shell.status().sessionId === CHAOS_SESSION_ID ? 'CHAOS' : 'ACADEMY',
          }),
          hudNow,
        );
      }
    }
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
/**
 * PBI 275: the shared host tick and focus helpers. They are read-only: mission actions never move a
 * vehicle, pause a surface or write a profile.
 */
function liveMissionTick(): number {
  return composition?.composition.frame.tick ?? shell.status().world.tick;
}
function beginLiveMissions(): void {
  const status = shell.status();
  // PBI 277: a session switch resets the authoritative tick; the one-entry frame cache must not
  // serve the previous world's frame for the same tick number.
  challengeFrameCache = null;
  liveMissions.beginSession({
    sessionId: status.sessionId,
    worldEpoch: status.worldEpoch,
    tick: liveMissionTick(),
    kind: status.sessionId === CHAOS_SESSION_ID ? 'CHAOS' : 'ACADEMY',
  });
  // PBI 276: the same session identity and the real campaign completions feed the daily capability
  // snapshot. A later completion never re-randomises the retained day; it applies to the next one.
  const completed =
    liveMissions
      .snapshot()
      ?.missions.filter((mission) => mission.state === 'COMPLETED')
      .map((mission) => mission.missionId) ?? [];
  dailyModules.runtime?.beginSession({
    sessionId: status.sessionId,
    worldEpoch: status.worldEpoch,
    tick: liveMissionTick(),
    kind: status.sessionId === CHAOS_SESSION_ID ? 'CHAOS' : 'ACADEMY',
    capabilities: liveDailyCapabilities(completed),
  });
  // PBI 277: the challenge owner adopts the same session identity. A real session change interrupts
  // the open offer/instance with the closed cancellation reason and starts a fresh director.
  challengeModules.runtime?.beginSession({
    sessionId: status.sessionId,
    worldEpoch: status.worldEpoch,
    sessionKind: status.sessionId === CHAOS_SESSION_ID ? 'CHAOS' : 'ACADEMY',
    tick: liveMissionTick(),
  });
}
function refocusGame(): void {
  if (application.getState().kind === 'PLAYING') view.getCanvas().focus();
}
/**
 * PBI 279: the live settings surface. It reuses the one 009 store, the real 109/205/110 style path
 * and the real 080/081 adapters. Opening it is a `menu` suspension through 070; closing it restores
 * the previous menu state (the pause menu stays open) and never starts the simulation by itself.
 */
let settingsOwnsMenu = false;
function liveSettingsRuntime(): LiveSettings | undefined {
  if (composition === undefined) return undefined;
  if (settingsModules.runtime !== undefined) return settingsModules.runtime;
  const pipeline = learningModules.pipeline;
  const style: LiveSettingsStylePorts | undefined =
    pipeline === undefined || shell.status().sessionId === CHAOS_SESSION_ID
      ? undefined
      : {
          playerId: 'v3-player',
          profileId: pipeline.profileId,
          engineVersion: liveLearningEngineVersion,
          store: liveLearningStore,
          barrier: pipeline.epochBarrier(),
          activation: pipeline.activationOwner(),
          readTarget: () => {
            const barrier = pipeline.epochBarrier().current();
            return {
              sessionId: shell.status().sessionId,
              worldEpoch: shell.status().worldEpoch,
              playerId: 'v3-player',
              profileId: pipeline.profileId,
              baseVersionId: barrier.baseVersionId,
              learningEpoch: barrier.learningEpoch,
            };
          },
          restore: (versionId, tick) => {
            const services: ProfileRestoreServices = {
              playerId: 'v3-player',
              profileId: pipeline.profileId,
              engineVersion: liveLearningEngineVersion,
              store: liveLearningStore,
              barrier: pipeline.epochBarrier(),
              activation: pipeline.activationOwner(),
              tick: liveMissionTick,
              now: () => new Date().toISOString(),
            };
            return restoreVersion(services, {
              profileId: pipeline.profileId,
              versionId,
              tick,
            });
          },
        };
  const runtime = createLiveSettings({
    store: settingsStore,
    playerId: settings.playerId,
    tick: liveMissionTick,
    ...(style === undefined ? {} : { style }),
    onSettingsSaved: applyLiveSettings,
    onStyleResult: applyLiveSettingsStyleResult,
  });
  settingsModules.runtime = runtime;
  return runtime;
}
function applyLiveSettings(saved: RuntimeSettings): void {
  settings = saved;
  sessionQuality = saved.quality;
  writeCameraModePreference(cameraPreferenceStorage, saved.input.cameraMode);
  try {
    composition?.applySettings(saved);
  } catch {
    // A disposed renderer is already being torn down; the settings record remains valid.
  }
  shellHost.refresh();
}
/**
 * PBI 280: a real C press changes only the 009 presentation field. The composition already switched
 * its live view; this keeps the store, the settings surface and the reload preference in sync.
 */
function rememberCameraMode(mode: CameraModePreference): void {
  try {
    settings = settingsStore.replace(withCameraModePreference(settingsStore.getSnapshot(), mode));
  } catch {
    // The live presentation already changed; a rejected store write must not revert it.
  }
  writeCameraModePreference(cameraPreferenceStorage, mode);
  shellHost.refresh();
}
function applyLiveSettingsStyleResult(result: StyleSlidersTickResult): void {
  if (
    result.status !== 'PUBLISHED' &&
    result.status !== 'RESTORED' &&
    result.status !== 'ACTIVATED'
  )
    return;
  const pipeline = learningModules.pipeline;
  const generation = pipeline?.epochBarrier().current();
  const versionId =
    result.versionId ?? (generation === undefined ? null : generation.baseVersionId);
  if ((result.status === 'PUBLISHED' || result.status === 'RESTORED') && pipeline !== undefined)
    pipeline.refreshFromBarrier();
  // The 271 lifecycle keeps its current 069 target stable; the barrier/activation advance is
  // applied to the fleet and city style here, and a later session/segment adopts the new base.
  if (result.status === 'ACTIVATED' && versionId !== null && pipeline !== undefined) {
    const profile = pipeline.profileForVersion(versionId);
    if (profile !== null) {
      liveCityStyleSource.set(profile);
      liveFleet?.ambient.refreshStyle();
    }
  }
  shellHost.refreshSession();
}
function openSettings(tab: LiveSettingsTab = 'GAME'): boolean {
  if (settingsModules.panel?.isOpen() === true) return true;
  if (composition === undefined || app === null) return false;
  const runtime = liveSettingsRuntime();
  if (runtime === undefined) return false;
  const opened = runtime.open();
  if (opened !== 'OPENED') return false;
  const state = runtime.getState();
  if (state.settingsDraft === null || state.keyDraft === null) {
    runtime.close();
    return false;
  }
  settingsOwnsMenu = !shell.pauseState().surfaces.menu;
  if (settingsOwnsMenu) shell.setMenuOpen(true);
  try {
    const panel = createLiveSettingsPanel(app, {
      settingsDraft: state.settingsDraft,
      keyDraft: state.keyDraft,
      styleDraft: state.styleDraft,
      styleUnavailableReason: state.styleReason,
      initialTab: tab,
      settings: {
        onChange: (draft) => runtime.adoptSettings(draft),
        save: (draft) => {
          const result = runtime.saveSettings(draft);
          if (result.status === 'SAVED') {
            const next = runtime.getSettingsDraft();
            if (next !== null)
              queueMicrotask(() => {
                if (panel.isOpen()) panel.setSettingsDraft(next);
              });
          }
          panel.announce(
            result.status === 'SAVED'
              ? runtime.getState().message
              : result.status === 'REJECTED'
                ? `Setările au fost refuzate: ${result.reason}.`
                : 'Nicio modificare de salvat.',
          );
        },
        cancel: () => {
          runtime.cancelSettings();
          panel.announce(runtime.getState().message);
        },
      },
      keys: {
        onChange: (draft) => runtime.adoptKeys(draft),
        save: () => {
          const draft = panel.getKeyDraft();
          const result = runtime.saveKeys(draft);
          if (result.status === 'SAVED') {
            const next = runtime.getKeyDraft();
            if (next !== null)
              queueMicrotask(() => {
                if (panel.isOpen()) panel.setKeyDraft(next);
              });
          }
          panel.announce(
            result.status === 'SAVED'
              ? runtime.getState().message
              : result.status === 'REJECTED'
                ? `Tastele au fost refuzate: ${result.reason}.`
                : 'Nicio modificare de salvat.',
          );
        },
        cancel: () => {
          runtime.cancelKeys();
          panel.announce(runtime.getState().message);
        },
      },
      style: {
        onChange: (draft) => {
          runtime.adoptStyle(draft);
        },
        apply: (draft) => {
          runtime.adoptStyle(draft);
          const status = runtime.queueStyleApply();
          panel.announce(runtime.getState().message);
          // Closing disposes the panel that is still inside its own apply handler; defer one
          // microtask so the 230 adapter leaves its mutation before the host tears it down.
          if (status === 'QUEUED') queueMicrotask(() => closeSettings());
        },
        cancel: (draft) => {
          runtime.adoptStyle(draft);
          runtime.withdrawStyle();
          panel.announce(runtime.getState().message);
        },
        reset: (draft) => {
          runtime.adoptStyle(draft);
          panel.announce(runtime.getState().message);
        },
        rebase: () => {
          const next = runtime.rebaseStyle();
          if (next !== null) panel.setStyleDraft(next);
          panel.announce(runtime.getState().message);
        },
        restore: (versionId) => {
          runtime.restoreStyle(versionId);
          panel.announce(runtime.getState().message);
        },
      },
      close: () => closeSettings(),
    });
    settingsModules.panel = panel;
    panel.openPanel();
    return true;
  } catch (error) {
    settingsModules.runtime?.close();
    if (settingsOwnsMenu) {
      settingsOwnsMenu = false;
      shell.setMenuOpen(false);
    }
    throw error;
  }
}
function closeSettings(): void {
  const panel = settingsModules.panel;
  settingsModules.panel = undefined;
  if (panel !== undefined) {
    if (panel.isOpen()) panel.closePanel();
    panel.dispose();
  }
  settingsModules.runtime?.close();
  if (settingsOwnsMenu) {
    settingsOwnsMenu = false;
    shell.setMenuOpen(false);
  }
  refocusGame();
}
function disposeLiveSettings(): void {
  const panel = settingsModules.panel;
  settingsModules.panel = undefined;
  if (panel !== undefined) {
    if (panel.isOpen()) panel.closePanel();
    panel.dispose();
  }
  settingsModules.runtime?.dispose();
  settingsModules.runtime = undefined;
  settingsOwnsMenu = false;
}
/** PBI 278: the autosave row is applied once, after the owners are mounted and before play resumes. */
let livePersistenceRestored = false;
let livePersistenceRestoreAttempts = 0;
function restoreLivePersistence(): void {
  if (livePersistenceRestored) return;
  livePersistenceRestoreAttempts += 1;
  const runtime = persistenceModules.live;
  if (runtime === undefined) return;
  const result = runtime.restore();
  if (result.status === 'RESTORED' && result.summary !== null) {
    livePersistenceRestored = true;
    composition?.composition.releaseInput();
    composition?.setVehicleMode('AUTO');
    shell.setMode('AUTO');
    const resume = result.launch;
    sessionNotice =
      `Autosave restaurat la tick ${result.summary.tick} (generația ${result.summary.generation})` +
      (resume?.previousSegment === 'INCOMPLETE'
        ? ` · segment anterior INCOMPLETE (${resume.openSegmentIds.join(', ')})`
        : ' · niciun segment deschis');
    shellHost.refreshSession();
  } else if (result.status === 'EMPTY') {
    livePersistenceRestored = true;
  } else if (result.status === 'REJECTED' && result.rejection !== null) {
    sessionNotice = `Autosave refuzat: ${result.rejection.code}: ${result.rejection.message}`;
    shellHost.refreshSession();
    // The company owner needs the live economy; the first start can run before it exists. Retry
    // once the backend has mounted the economy instead of declaring the save unusable.
    if (result.rejection.code !== 'LIVE_SAVE_RESTORE_FAILED' || livePersistenceRestoreAttempts > 2)
      livePersistenceRestored = true;
  }
}
/**
 * PBI 273: the Academy base profile is a real 109 version with the complete 092 catalog, so the
 * live city style can learn any key. The style source and the mode segments read the same identity;
 * the 109 store remains the only writer of versions. Haos is an explicit copy and is not learnable.
 */
const liveLearningStore = createCandidateProfileStore({
  engineVersion: liveLearningEngineVersion,
  now: () => sessionBootedAt,
});
const liveLearningBaseStyle = createCityStyleProfile(
  'profile-261-academy',
  'profile-261-academy@1',
);
const liveLearningBase = liveLearningStore.createBase({
  profileId: 'profile-261-academy',
  versionId: 'profile-261-academy@1',
  parameters: liveLearningBaseStyle.parameters,
  createdAt: sessionBootedAt,
});
if (liveLearningBase.status !== 'ACCEPTED')
  throw new Error(`Profilul de bază 273 a fost refuzat: ${liveLearningBase.rejection.code}`);
const academyProfileRecord = liveLearningStore.getVersion('profile-261-academy@1');
if (academyProfileRecord === null) throw new Error('Profilul de bază 273 lipsește din store.');
const academyProfile: ProfileVersion = academyProfileRecord;
const chaosCopy = copyProfileForChaos({
  source: academyProfile,
  copyId: 'haos-261',
  sessionId: CHAOS_SESSION_ID,
  learningEpoch: 0,
  copiedAt: sessionBootedAt,
});
if (chaosCopy.status !== 'COPIED')
  throw new Error(`Copia Haos a profilului a fost refuzată: ${chaosCopy.rejection.code}`);
const chaosProfile = chaosCopy.copy;
/**
 * PBI 271: mount the 069 live boundary owner over the one V3 composition. The context is the shell's
 * accepted session identity, so a session change retires the old segment and starts a new lifecycle.
 */
function mountLiveModeSegments(): void {
  const model = composition;
  if (model === undefined) return;
  const status = shell.status();
  const academyHead = liveLearningStore.getHistory('profile-261-academy').at(-1);
  const profile =
    status.sessionId === CHAOS_SESSION_ID ? chaosProfile.profile : (academyHead ?? academyProfile);
  const segments = createLiveModeSegments({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: status.sessionId,
      worldEpoch: status.worldEpoch,
    }),
    playerId: 'v3-player',
    profileId: profile.profileId,
    baseVersionId: profile.versionId,
    learningEpoch: status.learningEpoch,
    controlPreferencesVersion: `control-${settings.input.control.version}`,
    engineVersion: 'engine-271-live',
    mapVersion: world.map.mapId,
    learningEligible: status.sessionId !== CHAOS_SESSION_ID,
    readAuthority: () => {
      const authority = model.composition.modeAuthority();
      return {
        tick: authority.tick,
        playerVehicleId: authority.playerVehicleId,
        mode: authority.mode,
        suspended: shell.pauseState().suspended,
      };
    },
  });
  model.composition.attachModeSegments(segments);
  modeModules.segments = segments;
}
function disposeLiveModeSegments(reason: 'SESSION_CHANGE' | 'WORLD_RESET' | 'SHUTDOWN'): void {
  const segments = modeModules.segments;
  modeModules.segments = undefined;
  composition?.composition.attachModeSegments(null);
  if (segments === undefined) return;
  try {
    if (!segments.observe().disposed) segments.retire(reason);
  } finally {
    segments.dispose();
  }
}
/**
 * PBI 272: mount the live telemetry writer over the one composition and the one 271 segment owner.
 * It only reads the accepted frame; no second mode, seat, vehicle or clock is created here.
 */
function mountLiveTelemetry(): void {
  const model = composition;
  if (model === undefined) return;
  const status = shell.status();
  const live = createLiveTelemetryComposition({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: status.sessionId,
      worldEpoch: status.worldEpoch,
    }),
    map: world.map,
    graph: world.graph,
    playerId: 'v3-player',
    inputType: 'KEYBOARD',
    modeSegments: () => modeModules.segments,
  });
  telemetryModules.live = live;
}
function disposeLiveTelemetry(reason: 'SESSION_CHANGE' | 'WORLD_RESET' | 'SHUTDOWN'): void {
  const live = telemetryModules.live;
  telemetryModules.live = undefined;
  if (live === undefined) return;
  try {
    live.retire(reason);
  } finally {
    live.dispose();
  }
}
/**
 * PBI 273: the learning port runs after telemetry on the same authoritative tick. It owns the real
 * 103 queue/221 governor, the 109 store and the 110 activation; the gateway is the 272 closed
 * LEARNING segment. No second simulation is created.
 */
function ensureLearningActivation(): ProfileActivation | undefined {
  if (learningModules.activation !== undefined) return learningModules.activation;
  const fleet = liveFleet;
  if (fleet === undefined) return undefined;
  const activation = createProfileActivation({
    registry: fleet.registry,
    engineVersion: liveLearningEngineVersion,
    clock: () => composition?.composition.frame.tick ?? shell.status().world.tick,
    now: () => new Date().toISOString(),
  });
  learningModules.activation = activation;
  return activation;
}
function mountLiveLearning(): void {
  const model = composition;
  if (model === undefined) return;
  const status = shell.status();
  if (status.sessionId === CHAOS_SESSION_ID) return;
  settingsTickAuthority = null;
  const telemetry = telemetryModules.live;
  const segments = modeModules.segments;
  const activation = ensureLearningActivation();
  if (telemetry === undefined || activation === undefined) return;
  if (learningModules.queue === undefined)
    learningModules.queue = createLearningQueueRuntime({
      engineVersion: liveLearningEngineVersion,
    });
  const head =
    liveLearningStore.getHistory(academyProfile.profileId).at(-1)?.versionId ??
    academyProfile.versionId;
  const pipeline = createLiveLearningPipeline({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: status.sessionId,
      worldEpoch: status.worldEpoch,
    }),
    playerId: 'v3-player',
    profileId: academyProfile.profileId,
    engineVersion: liveLearningEngineVersion,
    learningEpoch: status.learningEpoch,
    baseVersionId: head,
    sessionId: status.sessionId,
    worldEpoch: status.worldEpoch,
    queue: learningModules.queue.queue,
    store: liveLearningStore,
    activation,
    // PBI 275: the tutorial is a learning-free classroom. While it is not finished, the host gate
    // answers the 273 port with ineligible segments, so no job or profile version can be produced.
    telemetry: {
      read: () => {
        const read = telemetry.read();
        if (!liveMissions.tutorialLearningBlocked()) return read;
        return Object.freeze({
          ...read,
          closedSegments: read.closedSegments.map((summary) =>
            summary.learningEligible
              ? Object.freeze({ ...summary, learningEligible: false as const })
              : summary,
          ),
        });
      },
      readClosedSegment: (segmentId: string) => {
        const read = telemetry.readClosedSegment(segmentId);
        if (read === null || !liveMissions.tutorialLearningBlocked()) return read;
        if (!read.summary.learningEligible) return read;
        return Object.freeze({
          ...read,
          summary: Object.freeze({ ...read.summary, learningEligible: false as const }),
        });
      },
    },
    ...(segments === undefined ? {} : { modeSegments: segments }),
    tick: () =>
      settingsTickAuthority ?? composition?.composition.frame.tick ?? shell.status().world.tick,
    physicalState: () => livePhysicalState(),
    onActivated: ({ versionId, profile }) => {
      liveCityStyleSource.set(profile);
      liveFleet?.ambient.refreshStyle();
      const activatedVersion = liveLearningStore.getVersion(versionId);
      const manualTuning =
        activatedVersion?.provenance.delta?.reason?.startsWith('MANUAL_TUNING') === true;
      const epoch = learningModules.pipeline?.learningEpoch ?? status.learningEpoch;
      // PBI 279: a manual style activation changes the fleet and the city style, but it is not a
      // learning milestone and must not rotate the 069 target under an open segment. The next
      // session/segment adopts the new base; LEARNING activations keep the existing rotation.
      if (!manualTuning) {
        modeModules.segments?.updateGeneration({ baseVersionId: versionId, learningEpoch: epoch });
        liveMissions.observeLearningActivation({
          profileId: profile.profileId,
          versionId,
          learningEpoch: epoch,
          activationTick: liveMissionTick() + 1,
          tick: liveMissionTick(),
        });
      }
    },
  });
  learningModules.pipeline = pipeline;
}
function disposeLiveLearning(): void {
  disposeLiveSettings();
  const pipeline = learningModules.pipeline;
  learningModules.pipeline = undefined;
  if (pipeline !== undefined) pipeline.dispose();
  const activation = learningModules.activation;
  learningModules.activation = undefined;
  if (activation !== undefined) activation.dispose();
}
/** PBI 272: a 070 suspension is a real artifact, never a fabricated slow reaction. */
function noteLiveTelemetrySuspension(
  cause: 'focus' | 'menu' | 'panel' | 'PAUSE' | 'FOCUS_LOST',
): void {
  const live = telemetryModules.live;
  if (live === undefined) return;
  const atTick = composition?.composition.frame.tick ?? shell.status().world.tick;
  live.noteSuspension(cause === 'focus' || cause === 'FOCUS_LOST' ? 'FOCUS_LOST' : 'PAUSE', atTick);
}
function noteLiveTelemetryResume(): void {
  const live = telemetryModules.live;
  if (live === undefined) return;
  const atTick = composition?.composition.frame.tick ?? shell.status().world.tick;
  live.noteResume(atTick);
}
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
      manualVehicles: mode === 'MANUAL' || mode === 'LEARNING' ? 1 : 0,
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
    // PBI 271: the live 069 owner closes the open segment with a terminal reason at the accepted
    // tick; no synthetic count is returned when no segment is open.
    const segments = modeModules.segments;
    if (segments === undefined || segments.observe().disposed) return 0;
    try {
      return segments.retire('SESSION_CHANGE') ? 1 : 0;
    } catch {
      return 0;
    } finally {
      telemetryModules.live?.retire('SESSION_CHANGE');
    }
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
    // PBI 265: granița de scenariu 065 pentru curse. Fiecare cursă activă este închisă întâi cu
    // SCENARIO_RESET prin 061, apoi 264 rewindează cererile/dispecerul fără revendicări duplicate.
    const boundaryTick = composition?.composition.frame.tick ?? shell.status().world.tick;
    // PBI 266: decontează întâi cursele terminale ale sesiunii care iese, apoi pornește economia
    // sesiunii cerute. O sesiune existentă primește o epocă nouă fără să-și piardă istoricul; una
    // nouă pornește cu ledgerul ei gol, deci cursele celeilalte sesiuni nu ajung niciodată în ea.
    const outgoing = economyModules.composition,
      outgoingFlush = outgoing?.flush({ tick: boundaryTick });
    if (outgoingFlush !== undefined)
      economyModules.company?.step({
        atTick: outgoingFlush.tick,
        settlements: outgoingFlush.settlements,
      });
    ridesModules.composition?.reset({ tick: boundaryTick });
    const activation = activateEconomy(identity.sessionId);
    if (!activation.created) activation.economy?.beginEpoch({ tick: boundaryTick });
    else activation.economy?.flush({ tick: boundaryTick });
    composition?.composition.releaseInput();
    // PBI 271: the old session's open segment is retired before the world identity changes, and a
    // fresh 069 lifecycle starts in AUTO for the new accepted session context.
    disposeLiveTelemetry('SESSION_CHANGE');
    disposeLiveModeSegments('SESSION_CHANGE');
    disposeLiveLearning();
    // Sesiunea nouă nu moștenește poziția fizică a celei vechi; restaurarea completă a
    // snapshotului rămâne la 278.
    // PBI 285: the destructible decor is restored and a real WORLD_RESET is recorded before the
    // scene is rebuilt. XP and the learned profile are only read, never written.
    if (liveChaos !== undefined && liveChaos.getStats().tick > 0) {
      liveChaos.reset(boundaryTick);
    }
    composition?.reset();
    composition?.setVehicleMode('AUTO');
    shell.setMode('AUTO');
    beginLiveMissions();
    mountLiveModeSegments();
    mountLiveTelemetry();
    mountLiveLearning();
    restoreLivePersistence();
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
  composition?.requestModeAction('M');
  // Butonul HUD nu trebuie să rămână activ: altfel 025 blochează W/M în dialoguri/butoane.
  view.getCanvas().focus();
});
view.onLearning(() => {
  composition?.requestModeAction('L');
  view.getCanvas().focus();
});
view.onSettings(() => {
  openSettings('GAME');
});
void application.load(preference);
// Academia este alegerea implicită, dar meniul rămâne explicit pentru Haos sau revenire.
void chooseSession('ACADEMY');

/**
 * PBI 267: the host owns the `K` hotkey, exactly like the other panel bindings. The popup itself
 * installs no global listener. `K` never fires while typing, while another dialog is visible or
 * while the application is not playing.
 */
function kpiHotkeyBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])') !==
      null
  );
}
function onKpiHotkey(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.repeat || event.isComposing) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.code !== 'KeyK' && event.key.toLowerCase() !== 'k') return;
  if (kpiHotkeyBlocked(event.target)) return;
  if (kpiHistoryPanel.isOpen()) {
    event.preventDefault();
    kpiHistoryPanel.close();
    return;
  }
  if (document.querySelector('[role="dialog"][aria-modal="true"]:not([hidden])') !== null) return;
  if (application.getState().kind !== 'PLAYING') return;
  if (kpiHistoryPanel.open()) event.preventDefault();
}
document.addEventListener('keydown', onKpiHotkey);

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
  /** PBI 263: lista/harta flotei, scaunul PLAYER și statisticile panoului. */
  fleet(): unknown;
  /** PBI 283: live signals/STOP/yield/lane-change/blocked counters and violations, read-only. */
  traffic(): unknown;
  /** PBI 283: every authored signal movement with its lane and stop-line anchor. */
  trafficSignalLanes(): unknown;
  /** PBI 281: minimapa live, ruta, markerii, incidentele și HUD-ul complet, read-only. */
  minimap(): unknown;
  /** PBI 271: the live 069 segments, LEARNING exposure and accepted mode. */
  modes(): unknown;
  /** PBI 282: live Rapier state, wheels, damage, recovery, contacts and separated costs. */
  physics(): unknown;
  /** PBI 285: live destructible states, reactions, caps, recorder and replay chunks, read-only. */
  destructibles(): unknown;
  /** PBI 285 (probe-only): an impact through the same 227/228/207 path, not a driven contact. */
  destructibleImpact?(objectId: string, impulseNs: number): unknown;
  /** PBI 285 (probe-only): the same reset the session flow performs, with the real owners read. */
  destructibleReset?(): unknown;
  /** PBI 285 (probe-only): replay the latest sealed chunk and compare the recorded order. */
  destructibleReplay?(): unknown;
  /** PBI 273: the live learning pipeline, its real 103/221 queue and the immutable profile. */
  learning(): unknown;
  /** PBI 264: cererile, coada, alocările și starea panoului de curse. */
  rides(): unknown;
  /** PBI 266: economia live, KPI-urile curente și read model-ul HUD. */
  economy(): unknown;
  /** PBI 267: panoul KPI, tabloul orașului și feedbackul consecințelor, read-only. */
  kpi(): unknown;
  /** PBI 268: ledgerul companiei, profitul, cash-ul și P&L-ul lunar, fără scriere în 209/XP. */
  company(): unknown;
  /** PBI 275: campania, tutorialul, recompensele și panoul de misiuni, read-only. */
  missions(): unknown;
  /** PBI 276: daily-ul, ledgerul XP, nivelul, istoricul și panoul de progres, read-only. */
  progress(): unknown;
  /** PBI 277: read-only live challenges, zones and panel state. */
  challenges(): unknown;
  /** PBI 278: autosave status, the durable generation and the last import. */
  persistence(): unknown;
  /** PBI 279: live settings drafts, style session and the untouched profile/XP fingerprints. */
  settings(): unknown;
  settingsOpen?(tab?: 'GAME' | 'KEYS' | 'STYLE'): unknown;
  settingsClose?(): unknown;
  persistenceExport?(): unknown;
  persistencePreview?(text: string): unknown;
  persistenceConfirm?(): Promise<unknown>;
  persistenceSaveNow?(tick?: number): Promise<unknown>;
  /** Probe-only: credits real 213 active-time windows, never a synthetic XP entry. */
  probeActiveXp?(seconds: number): unknown;
  challengeOffer?(templateId?: string, seed?: number): unknown;
  challengePreview?(templateId: string, seed: number): unknown;
  challengeAccept?(): unknown;
  challengeDecline?(): unknown;
  challengeRetry?(): unknown;
  challengeRoute?(zoneId: string): unknown;
  challengeSuppressAuto?(suppressed: boolean): unknown;
  /** PBI 269 (numai DEV/capture/debug): aceeași acțiune ca viitorul panou 270. */
  companyPurchase?(offerId: string): unknown;
  companyUpgrade?(upgradeId: string): unknown;
  /** PBI 275 (numai DEV/capture/debug): reluarea reală a unei misiuni terminale. */
  missionReplay?(missionId: string): unknown;
  /** PBI 265: geometria reală a benzinelor de rută, pentru proba de condus din browser. */
  lanePath(laneIds: readonly string[]): unknown;
  /** PBI 273 (numai DEV/capture/debug): liniile de semnal reale, pentru alegerea unei curse live. */
  signalLanes?(): unknown;
  /** PBI 273 (numai DEV/capture/debug): liniile STOP reale, pentru alegerea unei curse live. */
  stopLanes?(): unknown;
  /** PBI 265 (numai DEV/capture): fapt de sănătate real pentru proba terminală FAILED. */
  setTaxiHealth?(taxiId: string, status: 'AVAILABLE' | 'BLOCKED' | 'DAMAGED' | 'OFFLINE'): unknown;
  /** PBI 281 (numai DEV/capture/debug): un fapt 065 real COLLISION_DAMAGE pentru proba incidentului. */
  probeIncident?(taxiId: string): unknown;
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
  fleet: () => {
    const snapshot = liveFleetSnapshot();
    return {
      snapshot,
      open: fleetPanel.isOpen(),
      stats: fleetPanel.getStats(),
      selection: composition?.composition
        ? {
            selectedVehicleId: composition.composition.selectedVehicleId(),
            playerVehicleId: composition.composition.playerVehicleId(),
            authority: composition.composition.arbiter.snapshot().authority,
            lastEvent: composition.composition.frame.events.at(-1) ?? null,
          }
        : null,
    };
  },
  traffic: () => {
    const ambient = liveFleet?.ambient;
    if (ambient === undefined) return null;
    return {
      report: ambient.trafficRules(),
      violations: ambient.violations(),
      signals: ambient.rules?.frame()?.signals ?? [],
      actors: ambient.list().map((actor) => ({
        vehicleId: actor.vehicleId,
        driverKind: actor.driverKind,
        laneId: actor.laneId,
        routeLaneIndex: actor.routeLaneIndex,
        speedMps: actor.speedMps,
        positionM: actor.positionM,
        headingRad: actor.headingRad,
        authority: actor.authority,
        blocked: actor.blocked,
        leader: actor.leader,
      })),
    };
  },
  trafficSignalLanes: () => {
    const nodes = new Map(world.map.geometry.nodes.map((node) => [node.id, node.positionM])),
      junctions = new Map(
        world.map.intersections.map((intersection) => [intersection.id, intersection]),
      );
    return world.map.stopLines
      .filter(
        (line) => line.kind === 'SIGNAL' && line.intersectionId !== null && line.signalId !== null,
      )
      .flatMap((line) => {
        const movementList =
          junctions
            .get(line.intersectionId ?? '')
            ?.movements.filter((movement) => movement.fromLaneId === line.laneId) ?? [];
        const position = nodes.get(line.anchorNodeId) ?? null;
        return movementList.map((movement) => ({
          laneId: line.laneId,
          signalId: line.signalId,
          intersectionId: line.intersectionId,
          movementId: movement.id,
          positionM: position === null ? null : { x: position.x, y: position.y, z: position.z },
        }));
      });
  },
  minimap: () => {
    const frame = composition?.composition.frame;
    const view = liveMinimap.getView();
    return {
      rootHidden: liveMinimap.getRoot()?.hidden ?? true,
      stats: liveMinimap.getStats(),
      view,
      canvas: (() => {
        const root = liveMinimap.getRoot(),
          staticCanvas = root?.querySelector<HTMLCanvasElement>('.minimap__static') ?? null,
          dynamicCanvas = root?.querySelector<HTMLCanvasElement>('.minimap__dynamic') ?? null;
        return {
          staticWidth: staticCanvas?.width ?? 0,
          staticHeight: staticCanvas?.height ?? 0,
          dynamicWidth: dynamicCanvas?.width ?? 0,
          dynamicHeight: dynamicCanvas?.height ?? 0,
        };
      })(),
      hud: {
        hidden: document.querySelector<HTMLElement>('.taxi-hud')?.hidden ?? true,
        view: ridesModules.hud?.getView() ?? null,
        stats: ridesModules.hud?.getStats() ?? null,
      },
      frame:
        frame === undefined
          ? null
          : {
              tick: frame.tick,
              selectedVehicleId: frame.selectedVehicleId,
              playerVehicleId: frame.playerVehicleId,
              cameraEntityId: frame.camera.entityId,
              authority: frame.authority.consumer,
            },
    };
  },
  lanePath: (laneIds: readonly string[]): unknown =>
    laneIds.flatMap((laneId) => {
      const path = world.graph.getDirectedPath(laneId);
      return path === null
        ? []
        : path.points.map((point) => ({ x: point.x, y: point.y, z: point.z }));
    }),
  signalLanes: (): unknown => {
    const nodes = new Map(world.map.geometry.nodes.map((node) => [node.id, node.positionM]));
    const intersections = new Map(
      world.map.intersections.map((intersection) => [intersection.id, intersection]),
    );
    return world.map.stopLines
      .filter(
        (line) => line.kind === 'SIGNAL' && line.intersectionId !== null && line.signalId !== null,
      )
      .flatMap((line) => {
        const movement = intersections
          .get(line.intersectionId ?? '')
          ?.movements.find((candidate) => candidate.fromLaneId === line.laneId);
        if (movement === undefined) return [];
        const position = nodes.get(line.anchorNodeId) ?? null;
        return [
          {
            laneId: line.laneId,
            signalId: line.signalId,
            intersectionId: line.intersectionId,
            movementId: movement.id,
            positionM: position === null ? null : { x: position.x, y: position.y, z: position.z },
          },
        ];
      });
  },
  stopLanes: (): unknown => {
    const nodes = new Map(world.map.geometry.nodes.map((node) => [node.id, node.positionM]));
    return world.map.stopLines
      .filter((line) => line.kind === 'STOP')
      .map((line) => {
        const position = nodes.get(line.anchorNodeId) ?? null;
        return {
          laneId: line.laneId,
          stopLineId: line.id,
          positionM: position === null ? null : { x: position.x, y: position.y, z: position.z },
        };
      });
  },
  modes: () => {
    const segments = modeModules.segments;
    if (segments === undefined) return null;
    return {
      model: segments.observe(),
      learning: segments.learningExposure(),
      port: shell.status().systems.find((system) => system.id === 'control')?.status ?? null,
      hud: {
        mode: composition?.composition.frame.hud.mode ?? null,
        selectedVehicleId: composition?.composition.frame.selectedVehicleId ?? null,
        playerVehicleId: composition?.composition.frame.playerVehicleId ?? null,
      },
    };
  },
  physics: () => {
    const model = composition?.composition;
    if (model === undefined) return null;
    const stats = model.physicsStats();
    const frame = model.frame;
    return {
      stats,
      recovery: model.physics?.readRecovery() ?? null,
      recoveryHistory: model.physics?.readRecoveryHistory() ?? [],
      vehicles: frame.vehicles.map((vehicle) =>
        Object.freeze({
          vehicleId: vehicle.vehicleId,
          classId: vehicle.classId,
          positionM: vehicle.positionM,
          yawRad: vehicle.yawRad,
          speedMps: vehicle.speedMps,
          controlMode: vehicle.controlMode,
          wheelContacts: vehicle.wheelContacts ?? null,
          wheels: vehicle.wheels ?? [],
          suspensionLengthsM: vehicle.suspensionLengthsM ?? null,
          availability: vehicle.availability ?? null,
          lastIncidentId: model.physics?.readDamage(vehicle.vehicleId)?.lastIncidentId ?? null,
        }),
      ),
      costs: composition?.costs() ?? null,
    };
  },
  destructibles: () => {
    const chaos = liveChaos;
    if (chaos === undefined) return null;
    return {
      stats: chaos.getStats(),
      chunks: chaos.replayChunks(),
      plan: {
        definitions: chaos.plan.definitions.length,
        zones: chaos.plan.zones.length,
        objects: chaos.plan.definitions.slice(0, 8).map((definition) => ({
          objectId: definition.objectId,
          archetype: definition.archetype,
          positionM: definition.initialTransform.positionM,
        })),
      },
      scene: composition?.view.destructibles?.stats() ?? null,
    };
  },
  destructibleImpact: (objectId, impulseNs) => {
    const chaos = liveChaos;
    if (chaos === undefined) return null;
    const result = chaos.probeImpact({
      objectId,
      impulseNs,
      tick: chaos.getStats().tick,
      vehicleId: 'probe-vehicle',
      controlSource: 'MANUAL',
    });
    return {
      accepted: result !== null,
      state: result === null ? null : chaos.decor.getState(objectId).state,
      stats: chaos.getStats(),
    };
  },
  destructibleReset: () => {
    const chaos = liveChaos;
    if (chaos === undefined) return null;
    return chaos.reset(chaos.getStats().tick);
  },
  destructibleReplay: () => liveChaos?.checkReplay() ?? null,
  learning: () => {
    const pipeline = learningModules.pipeline;
    return {
      model: pipeline?.read() ?? null,
      activationCommands: pipeline?.activationOwner().commands() ?? [],
      queue: learningModules.queue?.queue.usage ?? null,
      measurements: learningModules.queue?.queue.measurements.slice(-8) ?? [],
      governor: learningModules.queue?.governor.usage ?? null,
      style: liveCityStyleSource.activeStyle(),
      telemetry: telemetryModules.live
        ? {
            closedSegments: telemetryModules.live.read().closedSegments,
            windows: telemetryModules.live.read().windows.map((window) => ({
              opportunityId: window.opportunityId,
              label: window.label,
              windowClass: window.windowClass,
              segmentId: window.segmentId,
              openedTick: window.openedTick,
              lastTick: window.lastTick,
            })),
            opportunities: telemetryModules.live.read().opportunities.map((record) => ({
              id: record.id,
              kind: record.kind,
              state: record.state,
              outcome: record.outcome,
              segmentIds: record.segmentIds,
              learningEligible: record.learningEligible,
            })),
            evidence: telemetryModules.live.read().evidence,
            closedRead: (() => {
              const live = telemetryModules.live;
              const last = live?.read().closedSegments.at(-1);
              if (live === undefined || last === undefined) return null;
              const read = live.readClosedSegment(last.segmentId);
              if (read === null) return null;
              return {
                segmentId: read.summary.segmentId,
                samples: read.samples.length,
                speedLimits: read.samples
                  .slice(0, 8)
                  .map((sample) => sample.observation.speedLimitMps),
                artifactWindow: read.artifactWindow,
                opportunities: read.opportunities.map((record) => ({
                  id: record.id,
                  kind: record.kind,
                  state: record.state,
                  outcome: record.outcome,
                  learningEligible: record.learningEligible,
                })),
                payload: (() => {
                  try {
                    const payload = deriveLiveLearningPayload(read, { baseValue: () => 0 });
                    return {
                      key: payload.key,
                      evidence: payload.evidence,
                      observations: payload.observations,
                      episodes: payload.episodes.length,
                      candidates: payload.candidates,
                      candidate: payload.candidate,
                      reason: payload.reason,
                    };
                  } catch (error) {
                    return { error: error instanceof Error ? error.message : String(error) };
                  }
                })(),
              };
            })(),
          }
        : null,
      port: shell.status().systems.find((system) => system.id === 'learning')?.status ?? null,
    };
  },
  lifecycle: () => application.getState(),
  rides: () => {
    const snapshot = ridesModules.composition?.snapshot();
    return {
      snapshot: snapshot?.live ?? null,
      rides: snapshot?.rides ?? null,
      passenger: snapshot?.passenger ?? null,
      actorRoutes: snapshot?.actorRoutes ?? null,
      stats: ridesModules.composition?.stats() ?? null,
      panelOpen: ridesPanel.isOpen(),
      panel: ridesPanel.getStats(),
      hud: ridesModules.hud?.getStats() ?? null,
      markers: rideMarkerLayer.getStats(),
      markerTaxiId: lastMarkerTaxiId,
    };
  },
  postProcessing: () => composition?.view.daylight.getPostProcessingState() ?? null,
  company: () => {
    const company = economyModules.company,
      evolution = economyModules.evolution;
    return {
      read: company?.read() ?? null,
      snapshot:
        company === undefined || composition === undefined
          ? null
          : company.snapshot(composition.composition.frame.tick),
      stats: company?.stats() ?? null,
      evolution: evolution?.read() ?? null,
      evolutionSnapshot: evolution?.snapshot() ?? null,
      evolutionStats: evolution?.stats() ?? null,
      panelOpen: companyDashboard.isOpen(),
      panel: companyDashboard.getStats(),
      panelView: companyDashboard.getView(),
      port: shell.status().systems.find((system) => system.id === 'economy')?.status ?? null,
    };
  },
  missions: () => {
    const runtime = missionModules.runtime;
    return {
      status: runtime?.status() ?? null,
      snapshot: runtime?.snapshot() ?? null,
      tutorial: runtime?.tutorialSnapshot() ?? null,
      tutorialInstance: runtime?.tutorialInstance() ?? null,
      panel: missionPanel.getStats(),
      panelOpen: missionPanel.isOpen(),
      tutorialPanel: tutorialPanel.getStats(),
      tutorialHostHidden: tutorialHost.hidden,
      port: shell.status().systems.find((system) => system.id === 'missions')?.status ?? null,
    };
  },
  progress: () => {
    const runtime = dailyModules.runtime;
    const read = runtime?.read(Date.now()) ?? null;
    return {
      version: LIVE_DAILY_PROGRESS_VERSION,
      read,
      status: runtime?.status() ?? null,
      panel: progressPanel.getStats(),
      panelOpen: progressPanel.isOpen(),
      panelView: progressPanel.getView(),
      port: shell.status().systems.find((system) => system.id === 'missions')?.status ?? null,
    };
  },
  challenges: () => {
    const runtime = challengeModules.runtime;
    return {
      read: runtime?.read() ?? null,
      panel: challengePanel.getStats(),
      panelOpen: challengePanel.isOpen(),
      panelView: challengePanel.getView(),
      zones: liveChallengeZones,
      port: shell.status().systems.find((system) => system.id === 'missions')?.status ?? null,
    };
  },
  persistence: () => ({
    status: persistenceModules.live?.status() ?? null,
    restored: persistenceModules.live?.status().restored ?? null,
    lastImport: persistenceModules.live?.status().lastImport ?? null,
    shell: shell.status().systems.find((system) => system.id === 'persistence')?.status ?? null,
  }),
  settings: () => {
    const runtime = settingsModules.runtime;
    const panel = settingsModules.panel;
    const learning = learningModules.pipeline?.read() ?? null;
    const xp = dailyModules.runtime?.read().xpFingerprint ?? null;
    const xpRead = dailyModules.runtime?.read().player ?? null;
    return {
      version: '279-live-settings-v1',
      open: panel?.isOpen() ?? false,
      tab: panel?.getTab() ?? null,
      store: settingsStore.getSnapshot(),
      state: runtime?.getState() ?? null,
      stats: runtime?.getStats() ?? null,
      panel: panel?.getStats() ?? null,
      style: runtime?.getStyleDraft() ?? null,
      styleVersion: runtime?.getStyleVersionSummary() ?? null,
      profileFingerprint: learning?.profile.fingerprint ?? null,
      profileVersionId: learning?.headVersionId ?? null,
      profileLearningEpoch: learning?.barrier.learningEpoch ?? null,
      profileVersions:
        liveLearningStore
          .listVersions(academyProfile.profileId)
          .map((version) => version.versionId) ?? [],
      xpFingerprint: xp,
      xpBalance: dailyModules.runtime?.read().player.xpBalance ?? null,
      xpEntries:
        xpRead === null
          ? []
          : xpRead.entries.map((entry) => ({
              entryId: entry.entryId,
              causeType: entry.causeType,
              causeId: entry.causeId,
              amountXp: entry.amountXp,
            })),
      port: shell.status().systems.find((system) => system.id === 'settings')?.status ?? null,
    };
  },
  challengeRoute: (zoneId: string) => {
    const frame = composition?.composition.frame;
    const vehicleId = frame?.playerVehicleId ?? frame?.selectedVehicleId ?? null;
    const taxi =
      vehicleId === null
        ? null
        : (frame?.vehicles.find((entry) => entry.vehicleId === vehicleId) ?? null);
    if (taxi === null || taxi === undefined) return [];
    let origin = taxi.laneId;
    if (origin === null) {
      const located = world.graph.locateLane({
        positionM: { x: taxi.positionM.x, y: 0, z: taxi.positionM.z },
        access: 'TAXI',
      });
      origin = located?.lane.id ?? null;
    }
    if (origin === null) return [];
    const plan = challengePlanner.findRoute({ origin, destination: zoneId, access: 'TAXI' });
    if (plan.status !== 'READY' || plan.path === null) return [];
    return plan.path.flatMap((id) => {
      const path = world.graph.getDirectedPath(id);
      return path === null
        ? []
        : path.points.map((point) => ({ x: point.x, y: point.y, z: point.z }));
    });
  },

  economy: () => {
    const economy = economyModules.composition;
    return {
      read: economy?.read() ?? null,
      snapshot:
        economy === undefined || composition === undefined
          ? null
          : economy.snapshot(composition.composition.frame.tick),
      stats: economy?.stats() ?? null,
      company: economyModules.company?.read() ?? null,
      companySnapshot:
        economyModules.company === undefined || composition === undefined
          ? null
          : economyModules.company.snapshot(composition.composition.frame.tick),
      companyStats: economyModules.company?.stats() ?? null,
      hud: economyHud.getStats(),
      hudView: economyHud.getView(),
      hudText: economyHud.getElement().textContent,
      port: shell.status().systems.find((system) => system.id === 'economy')?.status ?? null,
    };
  },
  kpi: () => ({
    panel: kpiHistoryPanel.getStats(),
    panelOpen: kpiHistoryPanel.isOpen(),
    triggerHidden: kpiHistoryPanel.getTrigger().hidden,
    city: cityDashboardPanel.getStats(),
    cityOpen: cityDashboardPanel.isOpen(),
    impact: kpiImpactHud.getStats(),
    historyScans: 0 as const,
  }),
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
  debugGlobal.setTaxiHealth = (taxiId, status) =>
    ridesModules.composition?.setTaxiStatus(taxiId, status) ?? null;
  debugGlobal.probeIncident = (taxiId) =>
    dashboardModules.health?.apply({
      taxiId,
      fact: 'COLLISION_DAMAGE',
      factId: `probe-281:collision:${taxiId}`,
      tick: liveMissionTick(),
    }) ?? null;
  debugGlobal.scene = () => composition?.view.scene ?? null;
  debugGlobal.daylight = () => composition?.view.daylight ?? null;
  debugGlobal.setTimeOfDay = (name) => composition?.view.setTimeOfDay(name) ?? null;
  debugGlobal.timeOfDay = () => composition?.view.getTimeOfDay() ?? null;
  debugGlobal.companyPurchase = (offerId) => economyModules.evolution?.purchase(offerId) ?? null;
  debugGlobal.companyUpgrade = (upgradeId) => economyModules.evolution?.upgrade(upgradeId) ?? null;
  debugGlobal.missionReplay = (missionId) =>
    missionModules.runtime?.replay(missionId, liveMissionTick()) ?? null;
  debugGlobal.challengeOffer = (templateId, seed) =>
    challengeModules.runtime?.offerNow({
      ...(templateId === undefined ? {} : { templateId }),
      ...(seed === undefined ? {} : { seed }),
    }) ?? null;
  debugGlobal.challengePreview = (templateId, seed) =>
    challengeModules.runtime?.preview(templateId, seed) ?? null;
  debugGlobal.challengeAccept = () => challengeModules.runtime?.accept() ?? null;
  debugGlobal.challengeDecline = () => challengeModules.runtime?.decline() ?? null;
  debugGlobal.challengeRetry = () => challengeModules.runtime?.retry() ?? null;
  debugGlobal.challengeSuppressAuto = (suppressed) => {
    challengeAutoOffersSuppressed = suppressed === true;
    return challengeAutoOffersSuppressed;
  };
  debugGlobal.persistenceExport = () => persistenceModules.live?.exportFile() ?? null;
  debugGlobal.persistencePreview = (text) =>
    previewGameFile({ fileName: 'probe-278.sdasave', text });
  debugGlobal.persistenceConfirm = () => confirmGameImport();
  debugGlobal.persistenceSaveNow = (tick) =>
    persistenceModules.live?.saveNow(tick ?? livePersistenceTickNow()) ?? Promise.resolve(null);
  debugGlobal.settingsOpen = (tab) => openSettings(tab ?? 'GAME');
  debugGlobal.settingsClose = () => {
    closeSettings();
    return true;
  };
  debugGlobal.probeActiveXp = (seconds) => {
    const totalMs = Math.max(0, Math.min(600_000, Math.floor(seconds * 1000)));
    const windows: unknown[] = [];
    const startedBase = Date.now() - totalMs - 120_000;
    for (let offset = 0; offset < totalMs; offset += 30_000) {
      const end = Math.min(totalMs, offset + 30_000);
      windows.push(
        dailyModules.runtime?.observeActiveWindow({
          startedAtMs: startedBase + offset,
          endedAtMs: startedBase + end,
          controlMode: 'MANUAL',
          paused: false,
          focused: true,
          visible: true,
          afk: false,
        }) ?? null,
      );
    }
    dailyModules.runtime?.save();
    return windows;
  };
}
(globalThis as unknown as { __v3Composition?: V3DebugGlobal }).__v3Composition = debugGlobal;

const dispose = (): void => {
  // PBI 278: shutdown does not force a new generation. The last periodic or imported row is the
  // coherent recovery point; capturing after disposal would overwrite it with an empty company.
  try {
    focusBinding.dispose();
    application.dispose();
  } finally {
    composition = undefined;
    releaseCapture?.();
    releaseCapture = undefined;
    (globalThis as unknown as { __v3Composition?: V3DebugGlobal }).__v3Composition = undefined;
    document.removeEventListener('keydown', onKpiHotkey);
    disposeLiveSettings();
    shellHost.dispose();
    fleetPanel.dispose();
    ridesPanel.dispose();
    companyDashboard.dispose();
    kpiHistoryPanel.dispose();
    cityDashboardPanel.dispose();
    missionPanel.dispose();
    progressPanel.dispose();
    challengePanel.dispose();
    tutorialPanel.dispose();
    missionTutorialStyle.remove();
    tutorialHost.remove();
    missionModules.runtime?.dispose();
    missionModules.runtime = undefined;
    challengeModules.runtime?.dispose();
    challengeModules.runtime = undefined;
    dailyModules.runtime?.dispose();
    dailyModules.runtime = undefined;
    xpActivityBinding.dispose();
    kpiImpactHud.dispose();
    passengerPresenter.dispose();
    rideMarkerLayer.dispose();
    economyHud.dispose();
    liveMinimap.dispose();
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
