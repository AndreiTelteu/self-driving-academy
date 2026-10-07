import type { BodyIdentity, RecoverySeatPort } from '../vehicles';
import type { ContractContext } from '../sessions';
import type { InputPreferences } from '../settings';
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
function recoveryCode(value: InputPreferences['bindings']): string {
  const data = modeFields(value, actions),
    used = new Set<string>();
  for (const action of actions) {
    const code = modeText(data[action], 32);
    requireMode(
      /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|Escape|Enter|Backspace|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|F([1-9]|1[0-2]))$/.test(
        code,
      ) && !used.has(code),
      'Invalid/conflicting recovery binding',
    );
    used.add(code);
  }
  return data.recover as string;
}
export interface RecoveryIntentPort {
  request(request: {
    readonly context: ContractContext;
    readonly identity: BodyIdentity;
    readonly mode: 'MANUAL' | 'LEARNING';
    readonly tick: number;
    readonly origin: 'R' | 'HUD';
  }): string;
  clearPending(): void;
}
/** R captures the actual066 PLAYER seat at the key boundary, never camera/selection. */
export function bindRecoveryInput(options: {
  readonly surface: HTMLElement;
  readonly bindings: InputPreferences['bindings'];
  readonly authority: RecoverySeatPort;
  readonly port: RecoveryIntentPort;
  readonly enabled?: () => boolean;
  /** Exact connected button created by this feature; keyboard never receives this exception. */
  readonly hudFocus?: () => HTMLElement | null;
}) {
  const doc = options.surface.ownerDocument,
    win = doc.defaultView;
  requireMode(!!win, 'Recovery input requires live window');
  let code = recoveryCode(options.bindings),
    held = false,
    disposed = false,
    busy = false;
  const blocked = (target: EventTarget | null) =>
    target instanceof win.HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"],[role="textbox"]',
      ) !== null);
  const allowed = (origin: 'R' | 'HUD' = 'R') => {
    const ownHud = origin === 'HUD' ? options.hudFocus?.() : null;
    const focusedOwnHud =
      ownHud instanceof win.HTMLElement &&
      ownHud.isConnected &&
      ownHud.ownerDocument === doc &&
      doc.activeElement === ownHud;
    if (
      disposed ||
      doc.hidden ||
      !doc.hasFocus() ||
      (blocked(doc.activeElement) && !focusedOwnHud) ||
      doc.querySelector('dialog[open],[role="dialog"][aria-modal="true"]')
    )
      return false;
    const enabled = options.enabled?.() ?? true;
    requireMode(typeof enabled === 'boolean', 'Recovery enabled must be synchronous boolean');
    return enabled;
  };
  const mutate = (work: () => void) => {
    requireMode(!busy, 'Recovery input reentrant');
    busy = true;
    try {
      work();
    } finally {
      busy = false;
    }
  };
  const clear = () => {
    held = false;
    requireMode(options.port.clearPending() === undefined, 'Recovery clear synchronous void');
  };
  const submit = (origin: 'R' | 'HUD', expected?: BodyIdentity) => {
    if (!allowed(origin)) return false;
    const actual = options.authority.getStats(),
      seat = actual.seat;
    if (
      actual.disposed ||
      actual.suspended ||
      actual.fault ||
      !seat ||
      (expected !== undefined && expected !== seat.identity)
    )
      return false;
    const operation = options.port.request({
      context: actual.context,
      identity: seat.identity,
      mode: seat.mode,
      tick: actual.tick,
      origin,
    });
    requireMode(typeof operation === 'string', 'Recovery request must be synchronous operation ID');
    return true;
  };
  const keys = (event: KeyboardEvent) =>
    mutate(() => {
      if (disposed || event.code !== code) return;
      if (event.type === 'keyup') {
        held = false;
        return;
      }
      if (event.repeat || held) return;
      const ownShift = /^Shift(Left|Right)$/.test(code),
        ownControl = /^Control(Left|Right)$/.test(code),
        ownAlt = /^Alt(Left|Right)$/.test(code);
      if (
        event.isComposing ||
        event.metaKey ||
        (event.shiftKey && !ownShift) ||
        (event.ctrlKey && !ownControl) ||
        (event.altKey && !ownAlt) ||
        blocked(event.target) ||
        !allowed()
      ) {
        clear();
        return;
      }
      if (submit('R')) {
        held = true;
        event.preventDefault();
      }
    });
  const focus = () =>
    mutate(() => {
      if (!disposed && !allowed()) clear();
    });
  const lost = () =>
    mutate(() => {
      if (!disposed) clear();
    });
  const visibility = () => {
    if (doc.hidden) lost();
  };
  const acquired: (() => void)[] = [];
  const add = (target: EventTarget, name: string, listener: EventListener) => {
    target.addEventListener(name, listener);
    acquired.push(() => target.removeEventListener(name, listener));
  };
  try {
    add(doc, 'keydown', keys as EventListener);
    add(doc, 'keyup', keys as EventListener);
    add(doc, 'focusin', focus);
    add(doc, 'visibilitychange', visibility);
    add(win, 'blur', lost);
    add(win, 'pagehide', lost);
  } catch (error) {
    const errors: unknown[] = [error];
    for (const release of acquired.splice(0))
      try {
        release();
      } catch (failure) {
        errors.push(failure);
      }
    throw new AggregateError(errors, 'Recovery input acquisition failed');
  }
  return Object.freeze({
    sync() {
      let enabled = false;
      mutate(() => {
        enabled = allowed('HUD');
        if (!enabled && !disposed) clear();
      });
      return enabled;
    },
    /** HUD must pass exact visible PLAYER seat token; stale button projections reject. */
    click(expected: BodyIdentity) {
      let accepted = false;
      mutate(() => {
        accepted = submit('HUD', expected);
      });
      return accepted;
    },
    remap(bindings: InputPreferences['bindings']) {
      mutate(() => {
        requireMode(!disposed, 'Recovery input disposed');
        const next = recoveryCode(bindings);
        clear();
        code = next;
      });
    },
    getStats: () => Object.freeze({ listeners: acquired.length, held, disposed }),
    dispose() {
      if (disposed) return;
      mutate(() => {
        const errors: unknown[] = [];
        try {
          clear();
        } catch (error) {
          errors.push(error);
        }
        disposed = true;
        for (const release of acquired.splice(0))
          try {
            release();
          } catch (error) {
            errors.push(error);
          }
        if (errors.length) throw new AggregateError(errors, 'Recovery input cleanup failed');
      });
    },
  });
}
