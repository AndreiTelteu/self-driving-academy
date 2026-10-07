import type { InputPreferences } from '../settings';
import type { ModeAction, ModeControls } from './mode-controls';
import { modeFields, modeText, requireMode } from './mode-boundary';
const actions = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'handbrake',
  'manualMode',
  'learningMode',
  'kpis',
  'fleet',
  'signalLeft',
  'signalRight',
  'camera',
  'profile',
  'pause',
  'recover',
] as const;
function codes(value: unknown) {
  const d = modeFields(value, actions),
    seen = new Set<string>();
  for (const action of actions) {
    const code = modeText(d[action], 32);
    requireMode(
      /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|Escape|Enter|Backspace|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|F([1-9]|1[0-2]))$/.test(
        code,
      ) && !seen.has(code),
      'Invalid/conflicting mode bindings',
    );
    seen.add(code);
  }
  return Object.freeze({ M: d.manualMode as string, L: d.learningMode as string });
}
export function bindModeKeyboard(options: {
  readonly surface: HTMLElement;
  readonly bindings: InputPreferences['bindings'];
  readonly port: Pick<ModeControls, 'enqueue' | 'clear'>;
  readonly enabled?: () => boolean;
  readonly onFocusLost?: () => void;
}) {
  const doc = options.surface.ownerDocument,
    win = doc.defaultView;
  requireMode(!!win, 'Mode keyboard requires live window');
  requireMode(
    typeof options.port.enqueue === 'function' && typeof options.port.clear === 'function',
    'Mode keyboard port',
  );
  requireMode(
    (options.enabled === undefined || typeof options.enabled === 'function') &&
      (options.onFocusLost === undefined || typeof options.onFocusLost === 'function'),
    'Synchronous keyboard callbacks required',
  );
  let mapping = codes(options.bindings),
    disposed = false,
    busy = false;
  const held = new Set<string>();
  const mutate = (f: () => void) => {
    requireMode(!busy, 'Mode keyboard reentrant');
    busy = true;
    try {
      f();
    } finally {
      busy = false;
    }
  };
  const blocked = (target: EventTarget | null) =>
    target instanceof win.HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"],[role="textbox"]',
      ) !== null);
  const allowed = () => {
    if (disposed || doc.hidden || !doc.hasFocus()) return false;
    const enabled = options.enabled === undefined ? true : options.enabled();
    requireMode(typeof enabled === 'boolean', 'Mode keyboard enabled synchronous boolean');
    return (
      enabled &&
      !blocked(doc.activeElement) &&
      doc.querySelector('dialog[open],[role="dialog"][aria-modal="true"]') === null
    );
  };
  const clear = () => {
    held.clear();
    requireMode(options.port.clear() === undefined, 'Mode clear synchronous void');
  };
  const keys = (event: KeyboardEvent) =>
    mutate(() => {
      if (disposed) return;
      const key: ModeAction | null =
        event.code === mapping.M ? 'M' : event.code === mapping.L ? 'L' : null;
      if (!key) return;
      if (event.type === 'keyup') {
        held.delete(event.code);
        return;
      }
      const ownShift = /^Shift(Left|Right)$/.test(event.code),
        ownControl = /^Control(Left|Right)$/.test(event.code),
        ownAlt = /^Alt(Left|Right)$/.test(event.code);
      if (
        event.isComposing ||
        event.metaKey ||
        (event.shiftKey && !ownShift) ||
        (event.ctrlKey && !ownControl) ||
        (event.altKey && !ownAlt)
      ) {
        clear();
        return;
      }
      if (event.repeat || held.has(event.code)) return;
      if (blocked(event.target) || !allowed()) {
        clear();
        return;
      }
      held.add(event.code);
      try {
        const accepted = options.port.enqueue(key);
        requireMode(typeof accepted === 'boolean', 'Mode enqueue synchronous boolean');
        if (accepted) event.preventDefault();
        else held.delete(event.code);
      } catch (error) {
        held.clear();
        throw error;
      }
    });
  const focus = () =>
    mutate(() => {
      if (!allowed()) clear();
    });
  const lost = () =>
    mutate(() => {
      if (disposed) return;
      clear();
      requireMode(options.onFocusLost?.() === undefined, 'Mode focus callback synchronous void');
    });
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
    sync() {
      let enabled = false;
      mutate(() => {
        enabled = allowed();
        if (!enabled && !disposed) clear();
      });
      return enabled;
    },
    remap(bindings: InputPreferences['bindings']) {
      mutate(() => {
        requireMode(!disposed, 'Mode keyboard disposed');
        const next = codes(bindings);
        clear();
        mapping = next;
      });
    },
    getStats: () => Object.freeze({ listeners: disposed ? 0 : 6, heldCodes: held.size, disposed }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        try {
          clear();
        } finally {
          disposed = true;
          doc.removeEventListener('keydown', keys);
          doc.removeEventListener('keyup', keys);
          doc.removeEventListener('focusin', focus);
          doc.removeEventListener('visibilitychange', visibility);
          win.removeEventListener('blur', lost);
          win.removeEventListener('pagehide', lost);
        }
      });
    },
  });
}
