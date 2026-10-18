import type { ContractContext } from '../sessions';
import type { BodyIdentity, ControlMode } from '../vehicles';
type ModeAction = 'M' | 'L';
export interface ControlModeHudView extends ContractContext {
  readonly version: '067-control-mode-view-v1';
  readonly tick: number;
  readonly identity: BodyIdentity | null;
  readonly actionIdentity: BodyIdentity | null;
  readonly mode: ControlMode;
  readonly learningEligible: boolean | null;
  readonly suspended: boolean;
  readonly fault: string | null;
}
import type { InputPreferences } from '../settings';

function data(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('HUD plain data required');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw Error('HUD plain data required');
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some((k) => typeof k !== 'string' || !keys.includes(k)))
    throw Error('HUD data fields');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) throw Error('HUD data descriptor');
    result[key] = d.value;
  }
  return result;
}
type HudSnapshot = ControlModeHudView & { readonly actionSubject: string | null };
function hudView(value: unknown): HudSnapshot {
  const d = data(value, [
    'schemaVersion',
    'units',
    'sessionId',
    'worldEpoch',
    'version',
    'tick',
    'identity',
    'actionIdentity',
    'mode',
    'learningEligible',
    'suspended',
    'fault',
  ]);
  if (
    d.schemaVersion !== 1 ||
    d.units !== 'SI' ||
    typeof d.sessionId !== 'string' ||
    !d.sessionId.trim() ||
    d.sessionId.length > 256 ||
    typeof d.worldEpoch !== 'number' ||
    !Number.isSafeInteger(d.worldEpoch) ||
    d.worldEpoch < 0 ||
    typeof d.suspended !== 'boolean' ||
    !(d.fault === null || (typeof d.fault === 'string' && d.fault.length <= 256))
  )
    throw Error('HUD context');
  for (const key of ['identity', 'actionIdentity'] as const) {
    if (d[key] !== null) {
      const i = data(d[key], ['entityId', 'handle', 'generation']);
      if (
        typeof i.entityId !== 'string' ||
        !i.entityId.trim() ||
        i.entityId.length > 256 ||
        typeof i.handle !== 'number' ||
        !Number.isFinite(i.handle) ||
        typeof i.generation !== 'number' ||
        !Number.isSafeInteger(i.generation) ||
        i.generation <= 0
      )
        throw Error('HUD identity');
      if (key === 'identity') d.identity = Object.freeze(i);
      else d.actionSubject = i.entityId;
    }
  }
  if (d.actionIdentity === null) d.actionSubject = null;
  return Object.freeze(d) as unknown as HudSnapshot;
}

function bindingPair(value: unknown) {
  const d = data(value, ['manualMode', 'learningMode']);
  for (const code of [d.manualMode, d.learningMode])
    if (
      typeof code !== 'string' ||
      !/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|Escape|Enter|Backspace|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|F([1-9]|1[0-2]))$/.test(
        code,
      )
    )
      throw Error('Mode HUD bindings');
  if (d.manualMode === d.learningMode) throw Error('Mode HUD binding conflict');
  return d as { manualMode: string; learningMode: string };
}

function shortcutName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Shift(Left|Right)$/.test(code)) return 'Shift';
  if (/^Control(Left|Right)$/.test(code)) return 'Control';
  if (/^Alt(Left|Right)$/.test(code)) return 'Alt';
  if (code === 'Space') return 'Space';
  return /^(Arrow(Up|Down|Left|Right)|Tab|Escape|Enter|Backspace|F([1-9]|1[0-2]))$/.test(code)
    ? code
    : null;
}

export const CONTROL_MODE_HUD_LIMITS = Object.freeze({
  elements: 8,
  maximumTextNodes: 7,
  listeners: 2,
  maximumHz: 10,
  retainedProjections: 1,
});
export function createControlModeHud(
  host: HTMLElement,
  options: {
    readonly intent: (action: ModeAction, expectedIdentity: BodyIdentity) => boolean;
    readonly bindings: Pick<InputPreferences['bindings'], 'manualMode' | 'learningMode'>;
  },
) {
  if (typeof options.intent !== 'function') throw Error('Mode HUD intent port');
  bindingPair(options.bindings);
  const doc = host.ownerDocument,
    root = doc.createElement('section'),
    symbol = doc.createElement('span'),
    label = doc.createElement('span'),
    subject = doc.createElement('span'),
    actionSubject = doc.createElement('span'),
    eligibility = doc.createElement('span'),
    manual = doc.createElement('button'),
    learning = doc.createElement('button');
  root.setAttribute('aria-label', 'Mod de control');
  label.setAttribute('role', 'status');
  manual.type = learning.type = 'button';
  root.append(symbol, label, subject, eligibility, actionSubject, manual, learning);
  host.append(root);
  let disposed = false,
    busy = false,
    last = -Infinity,
    lastClock = -Infinity,
    writes = 0,
    updates = 0,
    current: HudSnapshot | null = null,
    renderedTarget: BodyIdentity | null = null;
  const mutate = (f: () => void) => {
    if (busy) throw Error('Mode HUD reentrant');
    busy = true;
    try {
      f();
    } finally {
      busy = false;
    }
  };
  const set = (node: HTMLElement, value: string) => {
    if (node.textContent !== value) {
      node.textContent = value;
      writes++;
    }
  };
  const bindings = (value: typeof options.bindings) => {
    const pair = bindingPair(value);
    set(manual, 'M · Manual / Auto (' + pair.manualMode + ')');
    set(learning, 'L · Learning / Manual (' + pair.learningMode + ')');
    for (const [node, code] of [
      [manual, pair.manualMode],
      [learning, pair.learningMode],
    ] as const) {
      const shortcut = shortcutName(code);
      if (shortcut) node.setAttribute('aria-keyshortcuts', shortcut);
      else node.removeAttribute('aria-keyshortcuts');
    }
  };
  const click = (key: ModeAction) =>
    mutate(() => {
      if (
        disposed ||
        !current ||
        current.suspended ||
        current.fault ||
        !current.actionIdentity ||
        !renderedTarget ||
        current.actionIdentity !== renderedTarget
      )
        return;
      const accepted = options.intent(key, renderedTarget);
      if (typeof accepted !== 'boolean') throw Error('Mode HUD intent must be synchronous');
    });
  const onManual = () => click('M'),
    onLearning = () => click('L');
  manual.addEventListener('click', onManual);
  learning.addEventListener('click', onLearning);
  bindings(options.bindings);
  manual.disabled = learning.disabled = true;
  return Object.freeze({
    update(candidate: ControlModeHudView, nowMs: number) {
      mutate(() => {
        if (disposed) throw Error('Mode HUD disposed');
        const view = hudView(candidate);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw Error('Mode HUD clock');
        if (
          view.version !== '067-control-mode-view-v1' ||
          !['AUTO', 'MANUAL', 'LEARNING'].includes(view.mode) ||
          (!['LEARNING'].includes(view.mode) && view.learningEligible !== false) ||
          !(view.learningEligible === null || typeof view.learningEligible === 'boolean')
        )
          throw Error('Invalid mode HUD projection');
        if (view.tick < 0 || !Number.isSafeInteger(view.tick))
          throw Error('Invalid accepted HUD tick');
        if (
          current &&
          current.sessionId === view.sessionId &&
          current.worldEpoch === view.worldEpoch &&
          view.tick < current.tick
        )
          throw Error('Stale mode HUD projection');
        lastClock = nowMs;
        current = Object.freeze({ ...view });
        if (nowMs - last < 100) return;
        last = nowMs;
        updates++;
        set(symbol, view.mode === 'AUTO' ? 'A' : view.mode === 'MANUAL' ? 'M' : 'L');
        set(
          label,
          view.mode === 'AUTO'
            ? 'Conduce AI-ul'
            : view.mode === 'MANUAL'
              ? 'Conduci · învățare oprită'
              : 'Conduci · orașul învață',
        );
        renderedTarget = view.actionIdentity;
        set(
          actionSubject,
          view.actionSubject
            ? 'Butoanele M/L: ' + view.actionSubject
            : 'Butoanele M/L: niciun vehicul',
        );
        set(subject, view.identity ? 'Vehicul: ' + view.identity.entityId : 'Niciun vehicul');
        root.setAttribute(
          'aria-label',
          'Mod de control · ' + (view.identity?.entityId ?? 'niciun vehicul'),
        );
        set(
          eligibility,
          view.learningEligible === null
            ? 'Eligibilitate indisponibilă'
            : view.learningEligible
              ? 'Eligibil pentru învățare'
              : 'Învățare neeligibilă',
        );
        manual.disabled = learning.disabled =
          view.suspended || view.fault !== null || view.actionIdentity === null;
        if (view.fault) root.setAttribute('data-fault', view.fault);
        else root.removeAttribute('data-fault');
      });
    },
    remap(value: typeof options.bindings) {
      mutate(() => {
        if (disposed) throw Error('Mode HUD disposed');
        bindings(value);
      });
    },
    getStats: () =>
      Object.freeze({
        elements: disposed ? 0 : 8,
        textNodes: disposed
          ? 0
          : [symbol, label, subject, eligibility, actionSubject, manual, learning].reduce(
              (n, node) => n + node.childNodes.length,
              0,
            ),
        listeners: disposed ? 0 : 2,
        updates,
        writes,
        disposed,
        retainedProjections: current ? 1 : 0,
      }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        current = null;
        renderedTarget = null;
        manual.removeEventListener('click', onManual);
        learning.removeEventListener('click', onLearning);
        root.remove();
      });
    },
  });
}
