import { requireMode } from './mode-boundary';

/**
 * 070 browser focus adapter. It only *reports* focus transitions into the composition root; it
 * never pauses the simulation itself, so an authoritative suspension stays a 070-owner decision.
 * Notifications are edge-triggered: repeated blur/visibility events never flap the owner.
 */
export interface PauseFocusInputOptions {
  readonly surface: HTMLElement;
  /** Synchronous and side-effect free; the owner decides what suspension to apply. */
  readonly onFocusLost: () => void;
  readonly onFocusGained: () => void;
}
export interface PauseFocusInputBinding {
  /** Reconciles the real focus state before a physical tick; returns whether the surface has focus. */
  sync(): boolean;
  getStats(): { readonly listeners: number; readonly disposed: boolean };
  dispose(): void;
}

export function bindPauseFocusInput(options: PauseFocusInputOptions): PauseFocusInputBinding {
  const doc = options.surface.ownerDocument,
    win = doc.defaultView;
  requireMode(!!win, 'Pause/focus input requires a live window');
  requireMode(
    typeof options.onFocusLost === 'function' && typeof options.onFocusGained === 'function',
    'Pause/focus callbacks must be synchronous functions',
  );
  let disposed = false;
  let last: boolean | null = null;
  function notify(next: boolean): boolean {
    if (disposed) return last === true;
    if (next !== last) {
      last = next;
      requireMode(
        (next ? options.onFocusGained() : options.onFocusLost()) === undefined,
        'Pause/focus callbacks must return void',
      );
    }
    return next;
  }
  const lost = () => {
    notify(false);
  };
  const gained = () => {
    notify(true);
  };
  const visibility = () => {
    notify(!doc.hidden);
  };
  const sync = () => (disposed ? false : notify(!doc.hidden && doc.hasFocus()));
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('blur', lost);
  win.addEventListener('focus', gained);
  win.addEventListener('pagehide', lost);
  return Object.freeze({
    sync,
    getStats: () => Object.freeze({ listeners: disposed ? 0 : 4, disposed }),
    dispose() {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('visibilitychange', visibility);
      win.removeEventListener('blur', lost);
      win.removeEventListener('focus', gained);
      win.removeEventListener('pagehide', lost);
      last = null;
    },
  });
}
