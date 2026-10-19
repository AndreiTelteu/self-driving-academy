import { requireContract } from '../sessions';

/** 070 pause/focus arbitration. See Docs/pause-focus.md for the surface table and ownership. */
export const PAUSE_FOCUS_VERSION = '070-pause-focus-v1';
/** Held commands are a bounded set; overflow rejects the newest command instead of growing unbounded. */
export const PAUSE_FOCUS_MAX_HELD_COMMANDS = 16;
const MAX_ID_LENGTH = 64;

export type PauseFocusMode = 'AUTO' | 'MANUAL' | 'LEARNING';
/** A UI surface that can be open while the world runs. */
export type PauseFocusSurface = 'panel' | 'menu' | 'diagnostic';
/**
 * Why the authoritative clock is suspended. Ordered by the documented precedence
 * `focus` > `menu` > `panel`; the first satisfied rule wins.
 */
export type PauseFocusCause = 'focus' | 'menu' | 'panel';

export interface PauseFocusState {
  readonly version: typeof PAUSE_FOCUS_VERSION;
  readonly mode: PauseFocusMode;
  readonly surfaces: Readonly<Record<PauseFocusSurface, boolean>>;
  readonly focusLost: boolean;
  /** Held driving commands by opaque host id (keyboard codes, panel actions). */
  readonly heldCommands: readonly string[];
  /** A panel action that is pressed and not yet released; cleared on resume. */
  readonly heldPanelAction: string | null;
  readonly suspended: boolean;
  readonly cause: PauseFocusCause | null;
  /** Increments only on a real suspension change, never on an idempotent re-evaluation. */
  readonly revision: number;
}

export interface PauseFocusStats {
  readonly version: typeof PAUSE_FOCUS_VERSION;
  readonly disposed: boolean;
  /** Real 0 → suspended edges actuated through the port. */
  readonly suspensions: number;
  /** Real suspended → 0 edges actuated through the port. */
  readonly resumes: number;
  /** Explicit resume requests refused because a surface still demands suspension. */
  readonly refusedResumes: number;
  readonly heldResets: number;
  /** Re-evaluations that did not change the suspension state (no port call). */
  readonly noopReconciles: number;
  readonly surfacesOpen: number;
  /** Whether the host supplied the held-command reset port for this session. */
  readonly heldResetPort: boolean;
}

/**
 * Caller-supplied actuators. The owner decides *whether* to suspend; these ports perform it.
 * `suspend`/`resume` are edge-triggered and must not be called by the caller directly for panels.
 */
export interface PauseFocusPorts {
  /** 012 owns the clock: this must pause the authoritative fixed-tick loop. */
  readonly suspend: (cause: PauseFocusCause) => void;
  /** 012 owns the clock: this must resume it, excluding all wall time spent suspended. */
  readonly resume: (cause: PauseFocusCause) => void;
  /**
   * 025 owns held key state: this must clear every held driving command and its filter ramps.
   * Supply it whenever the session composes a held-command source; a session that composes none
   * may omit it, and `getStats().heldResetPort` then reports `false` so a reader can tell.
   */
  readonly resetHeldCommands?: () => void;
}

const modes: readonly PauseFocusMode[] = ['AUTO', 'MANUAL', 'LEARNING'];
const surfaceNames: readonly PauseFocusSurface[] = ['panel', 'menu', 'diagnostic'];

function requireMode(value: unknown): PauseFocusMode {
  requireContract(modes.includes(value as PauseFocusMode), 'Unsupported pause-focus mode');
  return value as PauseFocusMode;
}

function requireSurface(value: unknown): PauseFocusSurface {
  requireContract(
    surfaceNames.includes(value as PauseFocusSurface),
    'Unsupported pause-focus surface',
  );
  return value as PauseFocusSurface;
}

function requireId(value: unknown): string {
  requireContract(
    typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH,
    'Bounded held-command id required',
  );
  return value;
}

export interface PauseFocusOwner {
  getState(): PauseFocusState;
  getStats(): PauseFocusStats;
  /** Authority mode is an input fact; the owner never claims PLAYER authority itself. */
  setMode(mode: PauseFocusMode): void;
  setSurface(surface: PauseFocusSurface, open: boolean): void;
  setFocusLost(lost: boolean): void;
  holdCommand(id: string): void;
  releaseCommand(id: string): void;
  holdPanelAction(id: string | null): void;
  /** Explicit user resume: refused (false) while a surface or focus loss still demands suspension. */
  requestResume(): boolean;
  dispose(): void;
}

/**
 * Owns the pause decision only. It never touches the clock, authority, physics or DOM; the
 * composition root supplies the actuators and reports mode/surface/focus facts.
 */
export function createPauseFocusOwner(ports: PauseFocusPorts): PauseFocusOwner {
  requireContract(
    typeof ports?.suspend === 'function' &&
      typeof ports.resume === 'function' &&
      (ports.resetHeldCommands === undefined || typeof ports.resetHeldCommands === 'function'),
    'Pause-focus ports must be synchronous functions',
  );
  let mode: PauseFocusMode = 'AUTO';
  const open: Record<PauseFocusSurface, boolean> = {
    panel: false,
    menu: false,
    diagnostic: false,
  };
  let focusLost = false;
  const held = new Set<string>();
  let heldPanelAction: string | null = null;
  let suspended = false;
  let cause: PauseFocusCause | null = null;
  let revision = 0;
  let busy = false;
  let disposed = false;
  let suspensions = 0;
  let resumes = 0;
  let refusedResumes = 0;
  let heldResets = 0;
  let noopReconciles = 0;

  const decide = (): PauseFocusCause | null => {
    if (focusLost) return 'focus';
    if (open.menu) return 'menu';
    if (open.panel && mode !== 'AUTO') return 'panel';
    return null;
  };
  const stateOf = (): PauseFocusState =>
    Object.freeze({
      version: PAUSE_FOCUS_VERSION,
      mode,
      surfaces: Object.freeze({ ...open }),
      focusLost,
      heldCommands: Object.freeze([...held]),
      heldPanelAction,
      suspended,
      cause,
      revision,
    });
  const clearHeld = (): void => {
    held.clear();
    heldPanelAction = null;
  };
  /** Edge-triggered in both directions; idempotent re-evaluations never call the ports. */
  const reconcile = (): void => {
    const next = decide();
    if ((next !== null) === suspended) {
      cause = next;
      noopReconciles += 1;
      return;
    }
    if (next !== null) {
      suspended = true;
      cause = next;
      revision += 1;
      suspensions += 1;
      ports.suspend(next);
      return;
    }
    const previous = cause ?? 'panel';
    suspended = false;
    cause = null;
    revision += 1;
    resumes += 1;
    clearHeld();
    heldResets += 1;
    ports.resetHeldCommands?.();
    ports.resume(previous);
  };
  const mutate = (change: () => void): void => {
    requireContract(!disposed, 'Pause-focus owner disposed');
    requireContract(!busy, 'Reentrant pause-focus mutation');
    busy = true;
    try {
      change();
      reconcile();
    } finally {
      busy = false;
    }
  };
  return Object.freeze({
    getState: stateOf,
    getStats: () =>
      Object.freeze({
        version: PAUSE_FOCUS_VERSION,
        disposed,
        suspensions,
        resumes,
        refusedResumes,
        heldResets,
        noopReconciles,
        surfacesOpen: surfaceNames.filter((name) => open[name]).length,
        heldResetPort: typeof ports.resetHeldCommands === 'function',
      }),
    setMode(next: PauseFocusMode) {
      mutate(() => {
        mode = requireMode(next);
      });
    },
    setSurface(surface: PauseFocusSurface, isOpen: boolean) {
      mutate(() => {
        const name = requireSurface(surface);
        requireContract(typeof isOpen === 'boolean', 'Surface open flag must be boolean');
        open[name] = isOpen;
      });
    },
    setFocusLost(lost: boolean) {
      mutate(() => {
        requireContract(typeof lost === 'boolean', 'Focus flag must be boolean');
        focusLost = lost;
      });
    },
    holdCommand(id: string) {
      mutate(() => {
        const command = requireId(id);
        requireContract(
          held.has(command) || held.size < PAUSE_FOCUS_MAX_HELD_COMMANDS,
          'Held command capacity exceeded',
        );
        held.add(command);
      });
    },
    releaseCommand(id: string) {
      mutate(() => {
        held.delete(requireId(id));
      });
    },
    holdPanelAction(id: string | null) {
      mutate(() => {
        heldPanelAction = id === null ? null : requireId(id);
      });
    },
    requestResume(): boolean {
      requireContract(!disposed, 'Pause-focus owner disposed');
      const required = decide();
      if (required !== null) {
        requireContract(!busy, 'Reentrant pause-focus mutation');
        cause = required;
        refusedResumes += 1;
        return false;
      }
      if (suspended) mutate(() => {});
      return true;
    },
    dispose() {
      if (disposed) return;
      requireContract(!busy, 'Reentrant pause-focus disposal');
      disposed = true;
      clearHeld();
    },
  });
}
