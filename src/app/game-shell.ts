/**
 * PBI 260 — composition root-ul Academiei jucabile.
 *
 * Shell-ul este singurul proprietar al tick-ului autoritar. El nu simulează nimic: avansează o
 * singură dată lumea atașată (compunerea V3 existentă) și apelează porturile explicite ale
 * sistemelor care se integrează în 261–286 în ordinea declarată. Un port care nu a fost livrat de
 * taskul dependent este raportat `ABSENT`; shell-ul nu îl înlocuiește cu o simulare paralelă.
 *
 * Regulile de compunere sunt verificabile:
 * - un singur tick, strict următorul, fără re-intrare și fără tick în timpul suspendării;
 * - o singură lume activă; o a doua atașare este refuzată până la detașare;
 * - pauza, focusul și panourile trec prin owner-ul 070, nu prin starea locală a UI-ului;
 * - costul tick-ului și al prezentării sunt măsurate separat, cu ceas injectat.
 *
 * Modulul este pur: fără DOM, fără Babylon, fără ceas de perete implicit în teste.
 */
import {
  createPauseFocusOwner,
  type PauseFocusCause,
  type PauseFocusMode,
  type PauseFocusOwner,
  type PauseFocusState,
  type PauseFocusStats,
  type PauseFocusSurface,
} from './pause-focus';

export const GAME_SHELL_VERSION = '260-game-shell-v1' as const;
export const GAME_SHELL_TICK_HZ = 60 as const;
export const GAME_SHELL_DT_SECONDS = 1 / GAME_SHELL_TICK_HZ;
/** Fereastra de cost: suficientă pentru p50/p95 fără istoric nelimitat. */
const COST_SAMPLES = 600;
const MAX_PANEL_ID_LENGTH = 64;

export type GameMode = PauseFocusMode;
/** Faza declarată a unui sistem în jurul pasului autoritar al lumii. */
export type GameSystemPhase = 'PRE_WORLD' | 'WORLD' | 'POST_WORLD' | 'PERSISTENCE' | 'PRESENTATION';

export interface GameSystemDeclaration {
  readonly id: string;
  readonly phase: GameSystemPhase;
  readonly owner: string;
  readonly title: string;
}

/**
 * Ordinea declarată a tick-ului. Ea urmează contractul din Docs/02 (intenții → reguli de lume →
 * autonomie → fizică/lume → evenimente semantice → telemetrie → persistență → prezentare) și
 * numește owner-ul fiecărui sistem viitor. `world` este pasul autoritar existent, nu un port.
 */
export const GAME_SYSTEMS = [
  {
    id: 'settings',
    phase: 'PRE_WORLD',
    owner: '279',
    title: 'Setări runtime și remapare',
  },
  { id: 'sessions', phase: 'PRE_WORLD', owner: '261', title: 'Sesiuni Academie/Haos' },
  { id: 'control', phase: 'PRE_WORLD', owner: '271', title: 'Moduri AUTO/MANUAL/LEARNING' },
  { id: 'fleet', phase: 'PRE_WORLD', owner: '262–263', title: 'Flota live și selecția' },
  {
    id: 'traffic',
    phase: 'PRE_WORLD',
    owner: '283–284',
    title: 'Reguli de trafic și civili autonomi',
  },
  {
    id: 'pedestrians',
    phase: 'PRE_WORLD',
    owner: '286',
    title: 'Pietoni, treceri și pericole V2',
  },
  { id: 'world', phase: 'WORLD', owner: '260/282', title: 'Lumea autoritară V3 (fizică)' },
  {
    id: 'rides',
    phase: 'POST_WORLD',
    owner: '264–265',
    title: 'Curse, pickup/dropoff și pasageri',
  },
  {
    id: 'economy',
    phase: 'POST_WORLD',
    owner: '266–270',
    title: 'Economie, KPI și companie',
  },
  {
    id: 'missions',
    phase: 'POST_WORLD',
    owner: '275–277',
    title: 'Campanie, daily/XP și provocări',
  },
  { id: 'telemetry', phase: 'POST_WORLD', owner: '272', title: 'Telemetrie și oportunități' },
  { id: 'learning', phase: 'POST_WORLD', owner: '273–274', title: 'Learning și profil' },
  {
    id: 'destruction',
    phase: 'POST_WORLD',
    owner: '285',
    title: 'Decor destructibil, audio și replay',
  },
  { id: 'persistence', phase: 'PERSISTENCE', owner: '278', title: 'Autosave și checkpoint' },
  { id: 'camera', phase: 'PRESENTATION', owner: '280', title: 'Camera first-person' },
  { id: 'hud', phase: 'PRESENTATION', owner: '281', title: 'Minimapa și HUD complet' },
] as const satisfies readonly GameSystemDeclaration[];

export type GameSystemId = (typeof GAME_SYSTEMS)[number]['id'];
/** Porturile nu pot revendica pasul lumii: acela aparține compunerii atașate. */
export type GamePortId = Exclude<GameSystemId, 'world'>;

export interface GameTickContext {
  readonly version: typeof GAME_SHELL_VERSION;
  readonly tick: number;
  readonly dtSeconds: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly mode: GameMode;
}

export interface GameTickPort {
  /** Trebuie să coincidă cu cheia din `ports`; un port neidentificat este refuzat. */
  readonly id: GamePortId;
  readonly version?: string;
  step(context: GameTickContext): void;
}

export type GameTickPorts = Readonly<Partial<Record<GamePortId, GameTickPort>>>;

/** Lumea autoritară existentă (compunerea V3); shell-ul nu o clonează și nu o recreează. */
export interface GameShellWorld {
  readonly version: string;
  /** Tick-ul curent al lumii; atașarea pornește shell-ul de la el. */
  currentTick(): number;
  step(tick: number): void;
  present(): void;
}

export interface GameShellCostSummary {
  readonly samples: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export interface GameSystemStatus {
  readonly order: number;
  readonly id: GameSystemId;
  readonly phase: GameSystemPhase;
  readonly owner: string;
  readonly title: string;
  readonly status: 'PRESENT' | 'ABSENT';
  readonly steps: number;
}

export interface GameShellWorldStatus {
  readonly attached: boolean;
  readonly tick: number;
  readonly attachments: number;
  readonly activeWorlds: number;
  readonly maxActiveWorlds: number;
}

export interface GameShellTick {
  readonly version: typeof GAME_SHELL_VERSION;
  readonly tick: number;
  readonly mode: GameMode;
  readonly portsCalled: number;
  readonly portsAbsent: number;
  readonly stages: number;
}

export interface GameShellStatus {
  readonly version: typeof GAME_SHELL_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly started: boolean;
  readonly paused: boolean;
  readonly cause: PauseFocusCause | null;
  readonly mode: GameMode;
  readonly surfaces: PauseFocusState['surfaces'];
  readonly panelOpen: boolean;
  readonly activePanelId: string | null;
  readonly systems: readonly GameSystemStatus[];
  readonly portsPresent: number;
  readonly portsAbsent: number;
  readonly tickOrder: readonly GameSystemId[];
  readonly world: GameShellWorldStatus;
  readonly ticks: number;
  readonly refusedTicks: number;
  readonly reentrantTicks: number;
  /** Un port sau lumea a eșuat într-un tick; shell-ul refuză orice pas până la o lume nouă. */
  readonly fault: string | null;
  readonly pause: PauseFocusStats;
  readonly costs: Readonly<{ tick: GameShellCostSummary; present: GameShellCostSummary }>;
  readonly disposed: boolean;
}

export interface GameShellOptions {
  readonly context: Readonly<{ sessionId: string; worldEpoch: number }>;
  /**
   * Porturile deja livrate. Cheile absente sunt raportate explicit; shell-ul nu inventează
   * implementări pentru ele.
   */
  readonly ports?: GameTickPorts;
  /** Owner-ul 070 decide suspendarea; aceste porturi o aplică pe bucla 012. */
  readonly suspend: (cause: PauseFocusCause) => void;
  readonly resume: (cause: PauseFocusCause) => void;
  readonly resetHeldCommands?: () => void;
  readonly now?: () => number;
}

export interface GameShell {
  readonly version: typeof GAME_SHELL_VERSION;
  readonly tickOrder: readonly GameSystemId[];
  attachWorld(world: GameShellWorld): void;
  detachWorld(): void;
  start(): boolean;
  step(tick: number): GameShellTick;
  present(): void;
  setMode(mode: GameMode): void;
  setFocusLost(lost: boolean): void;
  setMenuOpen(open: boolean): void;
  openPanel(panelId: string): boolean;
  closePanel(): boolean;
  requestResume(): boolean;
  pauseState(): PauseFocusState;
  costs(): Readonly<{ tick: GameShellCostSummary; present: GameShellCostSummary }>;
  status(): GameShellStatus;
  dispose(): void;
}

function requireString(value: unknown, label: string, max = 256): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max)
    throw new Error(`Game shell: ${label} invalid.`);
  return value;
}

function summarise(samples: readonly number[]): GameShellCostSummary {
  if (samples.length === 0)
    return Object.freeze({ samples: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))]!;
  return Object.freeze({
    samples: sorted.length,
    meanMs: sorted.reduce((total, value) => total + value, 0) / sorted.length,
    p50Ms: at(0.5),
    p95Ms: Math.max(at(0.95), at(0.5)),
    maxMs: sorted[sorted.length - 1]!,
  });
}

const SYSTEM_BY_ID = new Map<string, (typeof GAME_SYSTEMS)[number]>(
  GAME_SYSTEMS.map((system) => [system.id, system]),
);

function portRegistry(ports: GameTickPorts | undefined): Map<GamePortId, GameTickPort> {
  const registry = new Map<GamePortId, GameTickPort>();
  if (ports === undefined) return registry;
  for (const key of Object.keys(ports)) {
    const declaration = SYSTEM_BY_ID.get(key);
    if (declaration === undefined || declaration.id === 'world')
      throw new Error(`Game shell: unknown port ${key}.`);
    const port = ports[key as GamePortId];
    if (port === undefined) continue;
    if (port.id !== key) throw new Error(`Game shell: port id mismatch for ${key}.`);
    if (typeof port.step !== 'function') throw new Error(`Game shell: port ${key} has no step.`);
    registry.set(key as GamePortId, port);
  }
  return registry;
}

export function createGameShell(options: GameShellOptions): GameShell {
  if (options === undefined || options === null || typeof options !== 'object')
    throw new Error('Game shell: options are required.');
  const sessionId = requireString(options.context?.sessionId, 'sessionId');
  const worldEpoch = options.context?.worldEpoch;
  if (!Number.isSafeInteger(worldEpoch) || worldEpoch < 0)
    throw new Error('Game shell: worldEpoch invalid.');
  if (typeof options.suspend !== 'function' || typeof options.resume !== 'function')
    throw new Error('Game shell: suspend/resume ports are required.');
  const now = options.now ?? (() => performance.now());
  const registry = portRegistry(options.ports);
  const pauseFocus: PauseFocusOwner = createPauseFocusOwner({
    suspend: options.suspend,
    resume: options.resume,
    ...(options.resetHeldCommands === undefined
      ? {}
      : { resetHeldCommands: options.resetHeldCommands }),
  });

  let attached: GameShellWorld | null = null;
  let disposed = false;
  let started = false;
  let stepping = false;
  let lastTick = 0;
  let mode: GameMode = 'AUTO';
  let activePanelId: string | null = null;
  let ticks = 0;
  let refusedTicks = 0;
  let reentrantTicks = 0;
  let fault: string | null = null;
  let worldAttachments = 0;
  let activeWorlds = 0;
  let maxActiveWorlds = 0;
  const systemSteps = new Map<GameSystemId, number>();
  for (const system of GAME_SYSTEMS) systemSteps.set(system.id, 0);
  const tickSamples: number[] = [];
  const presentSamples: number[] = [];

  const requireActive = (): void => {
    if (disposed) throw new Error('Game shell is disposed.');
  };
  const sample = (samples: number[], startedAt: number): void => {
    if (samples.length >= COST_SAMPLES) samples.shift();
    samples.push(Math.max(0, now() - startedAt));
  };
  const statusOf = (): GameShellStatus => {
    const pause = pauseFocus.getState();
    const systems = GAME_SYSTEMS.map((system, index) =>
      Object.freeze({
        order: index + 1,
        id: system.id,
        phase: system.phase,
        owner: system.owner,
        title: system.title,
        status:
          system.id === 'world'
            ? ('PRESENT' as const)
            : registry.has(system.id as GamePortId)
              ? ('PRESENT' as const)
              : ('ABSENT' as const),
        steps: systemSteps.get(system.id) ?? 0,
      }),
    );
    const portsPresent = systems.filter(
      (system) => system.id !== 'world' && system.status === 'PRESENT',
    ).length;
    return Object.freeze({
      version: GAME_SHELL_VERSION,
      sessionId,
      worldEpoch,
      tick: lastTick,
      started,
      paused: pause.suspended,
      cause: pause.cause,
      mode,
      surfaces: pause.surfaces,
      panelOpen: activePanelId !== null,
      activePanelId,
      systems: Object.freeze(systems),
      portsPresent,
      portsAbsent: systems.length - 1 - portsPresent,
      tickOrder: Object.freeze(GAME_SYSTEMS.map((system) => system.id)),
      world: Object.freeze({
        attached: attached !== null,
        tick: attached?.currentTick() ?? lastTick,
        attachments: worldAttachments,
        activeWorlds,
        maxActiveWorlds,
      }),
      ticks,
      refusedTicks,
      reentrantTicks,
      fault,
      pause: pauseFocus.getStats(),
      costs: Object.freeze({ tick: summarise(tickSamples), present: summarise(presentSamples) }),
      disposed,
    });
  };

  const api: GameShell = {
    version: GAME_SHELL_VERSION,
    tickOrder: Object.freeze(GAME_SYSTEMS.map((system) => system.id)),
    attachWorld(world: GameShellWorld): void {
      requireActive();
      if (world === null || typeof world !== 'object')
        throw new Error('Game shell: world is required.');
      requireString(world.version, 'world.version');
      if (typeof world.currentTick !== 'function' || typeof world.step !== 'function')
        throw new Error('Game shell: world contract invalid.');
      if (typeof world.present !== 'function')
        throw new Error('Game shell: world.present is required.');
      if (attached !== null) throw new Error('Game shell: a world is already attached.');
      const tick = world.currentTick();
      if (!Number.isSafeInteger(tick) || tick < 0)
        throw new Error('Game shell: world tick invalid.');
      attached = world;
      lastTick = tick;
      started = false;
      fault = null;
      worldAttachments += 1;
      activeWorlds = 1;
      maxActiveWorlds = Math.max(maxActiveWorlds, activeWorlds);
    },
    detachWorld(): void {
      if (attached === null) return;
      attached = null;
      activeWorlds = 0;
    },
    start(): boolean {
      requireActive();
      started = true;
      return !pauseFocus.getState().suspended;
    },
    step(tick: number): GameShellTick {
      requireActive();
      if (fault !== null)
        throw new Error(`Game shell: faulted (${fault}); attach a new world before stepping.`);
      if (stepping) {
        reentrantTicks += 1;
        throw new Error('Game shell: reentrant tick refused.');
      }
      if (!Number.isSafeInteger(tick) || tick < 1)
        throw new Error('Game shell: tick must be a positive safe integer.');
      if (pauseFocus.getState().suspended)
        throw new Error('Game shell: the shell is suspended; no tick is admitted.');
      const world = attached;
      if (world === null) throw new Error('Game shell: no world is attached.');
      if (tick !== lastTick + 1) {
        refusedTicks += 1;
        throw new Error(`Game shell: expected tick ${lastTick + 1}, received ${tick}.`);
      }
      const context: GameTickContext = Object.freeze({
        version: GAME_SHELL_VERSION,
        tick,
        dtSeconds: GAME_SHELL_DT_SECONDS,
        sessionId,
        worldEpoch,
        mode,
      });
      stepping = true;
      const startedAt = now();
      let portsCalled = 0;
      let portsAbsent = 0;
      try {
        for (const system of GAME_SYSTEMS) {
          if (system.id === 'world') {
            world.step(tick);
            systemSteps.set('world', (systemSteps.get('world') ?? 0) + 1);
            continue;
          }
          const port = registry.get(system.id as GamePortId);
          if (port === undefined) {
            portsAbsent += 1;
            continue;
          }
          port.step(context);
          portsCalled += 1;
          systemSteps.set(system.id, (systemSteps.get(system.id) ?? 0) + 1);
        }
        lastTick = tick;
        ticks += 1;
        started = true;
      } catch (error: unknown) {
        // Lumea poate fi deja avansată când un port eșuează; tick-ul nu este comis, iar shell-ul
        // refuză pași suplimentari până când composition root-ul atașează o lume nouă.
        fault = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        stepping = false;
        sample(tickSamples, startedAt);
      }
      return Object.freeze({
        version: GAME_SHELL_VERSION,
        tick,
        mode,
        portsCalled,
        portsAbsent,
        stages: GAME_SYSTEMS.length,
      });
    },
    present(): void {
      if (disposed) return;
      const world = attached;
      if (world === null) return;
      const startedAt = now();
      try {
        world.present();
      } finally {
        sample(presentSamples, startedAt);
      }
    },
    setMode(next: GameMode): void {
      requireActive();
      mode = next;
      pauseFocus.setMode(next);
    },
    setFocusLost(lost: boolean): void {
      requireActive();
      pauseFocus.setFocusLost(lost);
    },
    setMenuOpen(open: boolean): void {
      requireActive();
      pauseFocus.setSurface('menu', open);
    },
    openPanel(panelId: string): boolean {
      requireActive();
      const id = requireString(panelId, 'panelId', MAX_PANEL_ID_LENGTH);
      if (activePanelId === null) pauseFocus.setSurface('panel', true);
      // Un singur panou este deschis: înlocuirea îi schimbă doar identitatea, fără o tranziție
      // artificială de suspendare și reluare între cele două panouri.
      activePanelId = id;
      return true;
    },
    closePanel(): boolean {
      requireActive();
      if (activePanelId === null) return false;
      activePanelId = null;
      pauseFocus.setSurface('panel', false);
      return true;
    },
    requestResume(): boolean {
      requireActive();
      return pauseFocus.requestResume();
    },
    pauseState: () => pauseFocus.getState(),
    costs: () =>
      Object.freeze({ tick: summarise(tickSamples), present: summarise(presentSamples) }),
    status: statusOf,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      attached = null;
      activeWorlds = 0;
      registry.clear();
      pauseFocus.dispose();
    },
  };
  return Object.freeze(api);
}

/** Numele stabile ale suprafețelor 070; shell-ul montează doar gazda, nu panourile de sistem. */
export const GAME_SHELL_SURFACES: readonly PauseFocusSurface[] = Object.freeze([
  'panel',
  'menu',
  'diagnostic',
]);
