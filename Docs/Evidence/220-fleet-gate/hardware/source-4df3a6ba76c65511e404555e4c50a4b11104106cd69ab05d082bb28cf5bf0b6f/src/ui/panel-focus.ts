import {
  drivingBlockReason,
  panelDescriptor,
  type AccessibilityMode,
} from './accessibility-format';

/**
 * 083 panel focus controller. See Docs/ui-accessibility.md.
 *
 * A reusable modal/panel focus manager: it remembers the previous focus, moves focus to the first
 * focusable control, traps Tab/Shift+Tab inside the panel element, closes through an injected port on
 * Escape and restores the previous focus. Every listener is attached to the panel element itself,
 * never to `window` or `document`, so driving keys are never swallowed by a global handler.
 *
 * Native controls keep their own Enter/Space activation: the controller never emits a synthetic
 * click. If a panel has no focusable control it fails closed with a visible reason instead of
 * pretending to be keyboard operable.
 */
export const PANEL_FOCUS_VERSION = '083-panel-focus-v1';

/** Native, tab-reachable controls. `tabindex="-1"` controls are intentionally excluded. */
export const PANEL_FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

const MAX_ID_LENGTH = 64;

export interface PanelFocusOptions {
  /** Host close port. Called once when Escape is pressed inside the open panel. */
  readonly close: (panelId: string) => void;
  /** Defaults to `true`; a focus manager always traps while a panel is open. */
  readonly trapFocus?: boolean;
}

export interface PanelFocusStats {
  readonly version: typeof PANEL_FOCUS_VERSION;
  readonly disposed: boolean;
  readonly open: boolean;
  readonly activePanelId: string | null;
  /** Current number of tab stops inside the open panel. */
  readonly focusables: number;
  readonly opens: number;
  readonly closes: number;
  readonly wraps: number;
  readonly escapes: number;
  readonly restores: number;
  /** Listeners currently attached by the controller (0 or 1, always to the panel element). */
  readonly listeners: number;
  /** Always 0: the controller never listens on `window` or `document`. */
  readonly globalListeners: 0;
  readonly failures: number;
  readonly lastFailure: string | null;
}

export interface PanelFocusController {
  open(panelId: string, element: HTMLElement): boolean;
  close(): boolean;
  isOpen(): boolean;
  activePanelId(): string | null;
  shouldSuspendDriving(mode: AccessibilityMode): boolean;
  getStats(): PanelFocusStats;
  dispose(): void;
}

interface ActivePanel {
  readonly panelId: string;
  readonly element: HTMLElement;
  readonly previousFocus: HTMLElement | null;
  focusables: HTMLElement[];
}

function requirePanelId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_ID_LENGTH)
    throw new Error('Bounded panel id required');
  return value;
}

function canFocus(node: unknown): node is HTMLElement {
  return (
    typeof node === 'object' && node !== null && typeof (node as HTMLElement).focus === 'function'
  );
}

/** Native tab stops inside the panel, in DOM order, excluding hidden/disabled/aria-hidden nodes. */
export function focusableControls(element: HTMLElement): HTMLElement[] {
  if (typeof element.querySelectorAll !== 'function') return [];
  const nodes: HTMLElement[] = [],
    matches = element.querySelectorAll<HTMLElement>(PANEL_FOCUSABLE_SELECTOR);
  for (let index = 0; index < matches.length; index += 1) {
    const node = matches[index];
    if (!node) continue;
    if (node.hasAttribute('disabled')) continue;
    if (node.getAttribute('tabindex') === '-1') continue;
    if (node.getAttribute('aria-hidden') === 'true') continue;
    if (node.hidden) continue;
    nodes.push(node);
  }
  return nodes;
}

/**
 * Owns focus for one open panel at a time. It never drives, pauses or resumes anything itself: the
 * host asks `shouldSuspendDriving` and 070 owns the real suspension.
 */
export function createPanelFocusController(
  host: HTMLElement,
  options: PanelFocusOptions,
): PanelFocusController {
  if (typeof options?.close !== 'function')
    throw new Error('Panel focus controller needs a close port');
  if (!host || typeof host.addEventListener !== 'function')
    throw new Error('Panel focus controller needs a host element');
  const doc = host.ownerDocument;
  if (!doc || typeof doc.createElement !== 'function')
    throw new Error('Panel focus controller needs an owned document');

  let active: ActivePanel | null = null,
    disposed = false,
    opens = 0,
    closes = 0,
    wraps = 0,
    escapes = 0,
    restores = 0,
    failures = 0,
    lastFailure: string | null = null;
  const failureNotes = new Map<string, HTMLElement>();

  const removeFailureNote = (panelId: string): void => {
    const note = failureNotes.get(panelId);
    if (note === undefined) return;
    note.remove();
    failureNotes.delete(panelId);
  };

  const clearFailure = (element: HTMLElement, panelId: string): void => {
    removeFailureNote(panelId);
    element.removeAttribute('data-focus-state');
    element.removeAttribute('data-focus-reason');
  };

  /** Visible, screen-reader reachable reason, so a failed open is never silent. */
  const failClosed = (panelId: string, element: HTMLElement): void => {
    let name = panelId;
    try {
      name = panelDescriptor(panelId).name;
    } catch {
      name = panelId;
    }
    const reason = `Panoul „${name}” nu are niciun control focalizabil; operarea din tastatură este oprită.`;
    element.setAttribute('data-focus-state', 'NO_FOCUSABLE');
    element.setAttribute('data-focus-reason', reason);
    removeFailureNote(panelId);
    if (typeof element.append === 'function') {
      const note = doc.createElement('p');
      note.className = 'ui-focus-error';
      note.setAttribute('role', 'alert');
      note.setAttribute('data-panel-focus-error', panelId);
      note.textContent = reason;
      element.append(note);
      failureNotes.set(panelId, note);
    }
    failures += 1;
    lastFailure = `NO_FOCUSABLE: ${panelId}`;
  };

  const detach = (current: ActivePanel): void => {
    current.element.removeEventListener('keydown', onKeyDown);
  };

  const afterClose = (current: ActivePanel, restore: boolean): void => {
    detach(current);
    active = null;
    closes += 1;
    if (restore && canFocus(current.previousFocus)) {
      current.previousFocus.focus();
      restores += 1;
    }
  };

  const moveFocus = (current: ActivePanel, direction: 1 | -1): void => {
    const list = focusableControls(current.element);
    current.focusables = list;
    if (list.length === 0) {
      lastFailure = `NO_FOCUSABLE: ${current.panelId}`;
      return;
    }
    const focused = doc.activeElement,
      index = list.indexOf(focused as HTMLElement);
    if (index === -1) {
      const edge = direction === 1 ? 0 : list.length - 1;
      list[edge]!.focus();
      return;
    }
    const next = (index + direction + list.length) % list.length;
    if (next === 0 && index === list.length - 1) wraps += 1;
    if (next === list.length - 1 && index === 0) wraps += 1;
    list[next]!.focus();
  };

  function onKeyDown(event: KeyboardEvent): void {
    const current = active;
    if (current === null) return;
    if (event.key === 'Tab') {
      if (options.trapFocus === false) return;
      event.preventDefault();
      moveFocus(current, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'Escape') {
      const panelId = current.panelId;
      event.preventDefault();
      escapes += 1;
      afterClose(current, true);
      options.close(panelId);
    }
    // Enter and Space are deliberately untouched: the browser activates the focused native control.
  }

  const controller: PanelFocusController = {
    open(panelId: string, element: HTMLElement): boolean {
      if (disposed) throw new Error('Panel focus controller disposed');
      const id = requirePanelId(panelId);
      panelDescriptor(id);
      if (!element || typeof element.addEventListener !== 'function')
        throw new Error('Panel focus controller needs a panel element');
      if (active !== null) {
        if (active.panelId === id && active.element === element) {
          const list = focusableControls(element);
          active.focusables = list;
          return list.length > 0;
        }
        afterClose(active, false);
      }
      clearFailure(element, id);
      const list = focusableControls(element);
      if (list.length === 0) {
        failClosed(id, element);
        return false;
      }
      active = {
        panelId: id,
        element,
        previousFocus: canFocus(doc.activeElement) ? (doc.activeElement as HTMLElement) : null,
        focusables: list,
      };
      element.addEventListener('keydown', onKeyDown);
      element.setAttribute('data-focus-state', 'OPEN');
      opens += 1;
      lastFailure = null;
      list[0]!.focus();
      return true;
    },
    close(): boolean {
      if (active === null) return false;
      afterClose(active, true);
      return true;
    },
    isOpen: () => active !== null,
    activePanelId: () => (active === null ? null : active.panelId),
    shouldSuspendDriving(mode: AccessibilityMode): boolean {
      return active === null ? false : drivingBlockReason(active.panelId, true, mode) !== null;
    },
    getStats: () =>
      Object.freeze({
        version: PANEL_FOCUS_VERSION,
        disposed,
        open: active !== null,
        activePanelId: active === null ? null : active.panelId,
        focusables: active === null ? 0 : active.focusables.length,
        opens,
        closes,
        wraps,
        escapes,
        restores,
        listeners: active === null ? 0 : 1,
        globalListeners: 0 as const,
        failures,
        lastFailure,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (active !== null) detach(active);
      active = null;
      for (const note of failureNotes.values()) note.remove();
      failureNotes.clear();
    },
  };
  return Object.freeze(controller);
}
