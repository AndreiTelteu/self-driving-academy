import type {
  TutorialPanelAction,
  TutorialPanelProjection,
  TutorialPanelSnapshot,
} from './mission-tutorial-format';
import {
  TUTORIAL_PANEL_LIMITS,
  TUTORIAL_PANEL_VERSION,
  parseTutorialPanelSnapshot,
  projectTutorialPanel,
} from './mission-tutorial-format';

export interface TutorialPanelIntents {
  readonly pause: () => void;
  readonly resume: () => void;
  readonly skipStep: () => void;
  readonly skipAll: () => void;
}

/**
 * 117 tutorial panel. It renders one accepted tutorial snapshot into a native, focusable panel and
 * forwards four explicit intentions. Every action is a native `<button>`: the browser activates it
 * with a mouse click, with Enter or with Space when focused, so no global key listener is installed
 * and the driving keys are never captured. The panel never starts, skips or resumes the tutorial
 * itself; the host applies the intention and renders the next accepted snapshot.
 */
export function createMissionTutorialPanel(host: HTMLElement, intents: TutorialPanelIntents) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Tutorial panel requires an owned document');
  for (const action of ['pause', 'resume', 'skipStep', 'skipAll'] as const)
    if (typeof intents[action] !== 'function') throw new Error('Tutorial panel intent port');
  const root = doc.createElement('section'),
    heading = doc.createElement('h2'),
    instruction = doc.createElement('p'),
    progress = doc.createElement('p'),
    status = doc.createElement('p'),
    taxi = doc.createElement('p'),
    learning = doc.createElement('p'),
    access = doc.createElement('p');
  root.className = 'mission-tutorial';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Tutorial primul taxi');
  instruction.setAttribute('aria-live', 'polite');
  status.setAttribute('role', 'status');
  const buttons = new Map<
    TutorialPanelAction,
    { readonly node: HTMLButtonElement; readonly onClick: () => void }
  >();
  const bind = (action: TutorialPanelAction, label: string) => {
    const node = doc.createElement('button'),
      onClick = () => emit(action);
    node.setAttribute('type', 'button');
    node.textContent = label;
    node.setAttribute('aria-keyshortcuts', 'Enter Space');
    node.addEventListener('click', onClick);
    buttons.set(action, { node, onClick });
    return node;
  };
  const nodes = [
    bind('PAUSE', 'Pauză'),
    bind('RESUME', 'Reia'),
    bind('SKIP_STEP', 'Sari peste pas'),
    bind('SKIP_ALL', 'Sari peste tutorial'),
  ];
  root.append(heading, instruction, progress, status, taxi, learning, access, ...nodes);
  host.append(root);

  let disposed = false,
    busy = false,
    emitting = false,
    lastClock = -Infinity,
    lastWrite = -Infinity,
    lastSignature = '',
    writes = 0,
    updates = 0,
    skipped = 0,
    emitted = 0,
    current: TutorialPanelSnapshot | null = null;

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Tutorial panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const set = (node: HTMLElement, value: string) => {
    if (node.textContent === value) return;
    node.textContent = value;
    writes += 1;
  };
  const attribute = (node: HTMLElement, name: string, value: string) => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
    writes += 1;
  };
  const invoke: Readonly<Record<TutorialPanelAction, () => void>> = Object.freeze({
    PAUSE: intents.pause,
    RESUME: intents.resume,
    SKIP_STEP: intents.skipStep,
    SKIP_ALL: intents.skipAll,
  });
  const emit = (action: TutorialPanelAction) => {
    if (disposed || emitting) return;
    const entry = buttons.get(action);
    if (entry === undefined || current === null) return;
    if (entry.node.getAttribute('disabled') !== null) return;
    emitting = true;
    emitted += 1;
    try {
      invoke[action]();
    } finally {
      emitting = false;
    }
  };
  const render = (projection: TutorialPanelProjection) => {
    set(heading, projection.heading);
    set(instruction, projection.instruction);
    set(progress, projection.progress);
    set(status, projection.status);
    set(taxi, projection.taxi);
    set(learning, projection.learning);
    set(access, projection.taxiAccess);
    attribute(root, 'aria-label', projection.ariaLabel);
    attribute(root, 'data-state', current === null ? 'ACTIVE' : current.state);
    attribute(root, 'data-complete', projection.complete ? 'true' : 'false');
    for (const button of projection.buttons) {
      const entry = buttons.get(button.action);
      if (entry === undefined) continue;
      const disabled = button.disabled;
      if (disabled && entry.node.getAttribute('disabled') === null) {
        entry.node.setAttribute('disabled', '');
        writes += 1;
      } else if (!disabled && entry.node.getAttribute('disabled') !== null) {
        entry.node.removeAttribute('disabled');
        writes += 1;
      }
      attribute(entry.node, 'aria-disabled', disabled ? 'true' : 'false');
    }
    lastSignature = projection.signature;
    updates += 1;
  };

  return Object.freeze({
    update(candidate: TutorialPanelSnapshot, nowMs: number) {
      mutate(() => {
        if (disposed) throw new Error('Tutorial panel disposed');
        const snapshot = parseTutorialPanelSnapshot(candidate);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Tutorial panel clock');
        if (
          current !== null &&
          current.sessionId === snapshot.sessionId &&
          current.worldEpoch === snapshot.worldEpoch &&
          snapshot.tick < current.tick
        )
          throw new Error('Stale tutorial panel snapshot');
        lastClock = nowMs;
        const previous = current;
        current = snapshot;
        const projection = projectTutorialPanel(snapshot);
        const bypass =
          previous === null ||
          previous.state !== snapshot.state ||
          previous.stepId !== snapshot.stepId ||
          previous.stepIndex !== snapshot.stepIndex;
        if (projection.signature === lastSignature) {
          skipped += 1;
          return;
        }
        if (!bypass && nowMs - lastWrite < 1000 / TUTORIAL_PANEL_LIMITS.maximumHz) {
          skipped += 1;
          return;
        }
        lastWrite = nowMs;
        render(projection);
      });
    },
    getStats: () =>
      Object.freeze({
        version: TUTORIAL_PANEL_VERSION,
        elements: disposed ? 0 : TUTORIAL_PANEL_LIMITS.elements,
        textNodes: disposed ? 0 : TUTORIAL_PANEL_LIMITS.textNodes,
        listeners: disposed ? 0 : TUTORIAL_PANEL_LIMITS.listeners,
        globalListeners: TUTORIAL_PANEL_LIMITS.globalListeners,
        updates,
        writes,
        skipped,
        emitted,
        retainedProjections: disposed || current === null ? 0 : 1,
        disposed,
      }),
    /** The retained snapshot; `null` before the first accepted update. */
    getSnapshot: () => (disposed ? null : current),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const entry of buttons.values()) {
          entry.node.removeEventListener('click', entry.onClick);
          entry.node.remove();
        }
        buttons.clear();
        current = null;
        root.remove();
      });
    },
  });
}

export type MissionTutorialPanel = ReturnType<typeof createMissionTutorialPanel>;
