import type { InputPreferences } from '../settings';
import type { KeyboardDriveAction, KeyboardDrivePort } from '../vehicles';

export interface KeyboardDriveInputOptions {
  readonly surface: HTMLElement;
  readonly bindings: InputPreferences['bindings'];
  readonly port: KeyboardDrivePort;
  readonly enabled?: () => boolean;
  /** Composition root owns pause/resume and controller suspension. */
  readonly onFocusLost?: () => void;
}
export interface KeyboardDriveBinding {
  /** Root calls before a physical tick and after panel/authority changes. */
  sync(): boolean;
  getStats(): { readonly listeners: number; readonly disposed: boolean };
  dispose(): void;
}

/** Captures only driving intents. No domain service invocation, clock, RAF or key-event queue. */
export function bindKeyboardDriveInput(options: KeyboardDriveInputOptions): KeyboardDriveBinding {
  const doc = options.surface.ownerDocument,
    win = doc.defaultView;
  if (!win) throw new Error('Keyboard input requires a live window');
  if (typeof options.port.setAction !== 'function' || typeof options.port.clear !== 'function')
    throw new Error('Keyboard input port required');
  const actions: readonly KeyboardDriveAction[] = [
    'throttle',
    'brake',
    'steerLeft',
    'steerRight',
    'handbrake',
    'signalLeft',
    'signalRight',
  ];
  const codes = new Map<string, KeyboardDriveAction>();
  for (const action of actions) {
    const code = options.bindings[action];
    if (typeof code !== 'string' || code.length > 32 || codes.has(code))
      throw new Error('Invalid driving key bindings');
    codes.set(code, action);
  }
  let disposed = false;
  const blocked = (target: EventTarget | null) =>
    target instanceof win.HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"],[role="textbox"]',
      ) !== null);
  const allowed = () =>
    !disposed &&
    !doc.hidden &&
    doc.hasFocus() &&
    (options.enabled?.() ?? true) &&
    !blocked(doc.activeElement) &&
    doc.querySelector('dialog[open],[role="dialog"][aria-modal="true"]') === null;
  const flush = () => {
    if (!disposed) options.port.clear();
  };
  const lost = () => {
    flush();
    options.onFocusLost?.();
  };
  const sync = () => {
    const enabled = allowed();
    if (!enabled) flush();
    return enabled;
  };
  const keys = (event: KeyboardEvent) => {
    const action = codes.get(event.code);
    if (!action) return;
    if (event.type === 'keyup') {
      options.port.setAction(action, false);
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing) {
      flush();
      return;
    }
    if (event.repeat || blocked(event.target) || !sync()) {
      if (!allowed()) flush();
      return;
    }
    event.preventDefault();
    options.port.setAction(action, true);
  };
  const focus = () => {
    if (!allowed()) flush();
  };
  const visibility = () => {
    if (doc.hidden) lost();
  };
  doc.addEventListener('keydown', keys);
  doc.addEventListener('keyup', keys);
  doc.addEventListener('focusin', focus);
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('blur', lost);
  win.addEventListener('pagehide', lost);
  return Object.freeze({
    sync,
    getStats: () => Object.freeze({ listeners: disposed ? 0 : 6, disposed }),
    dispose() {
      if (disposed) return;
      try {
        flush();
      } finally {
        disposed = true;
        doc.removeEventListener('keydown', keys);
        doc.removeEventListener('keyup', keys);
        doc.removeEventListener('focusin', focus);
        doc.removeEventListener('visibilitychange', visibility);
        win.removeEventListener('blur', lost);
        win.removeEventListener('pagehide', lost);
      }
    },
  });
}
