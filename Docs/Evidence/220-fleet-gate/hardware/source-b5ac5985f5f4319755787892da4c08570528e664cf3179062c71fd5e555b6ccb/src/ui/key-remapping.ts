import type {
  KeyRemappingAction,
  KeyRemappingDraft,
  KeyRemappingProjection,
  KeyRemappingRow,
  KeyRemappingSaveState,
} from './key-remapping-format';
import {
  KEY_REMAPPING_ACTIONS,
  KEY_REMAPPING_LABELS,
  KEY_REMAPPING_LIMITS,
  KEY_REMAPPING_REJECTION_LABELS,
  KEY_REMAPPING_VERSION,
  formatKeyCode,
  keyRemappingBindings,
  parseKeyRemappingDraft,
  projectKeyRemapping,
  resetBindings,
  revertBindings,
  setBinding,
} from './key-remapping-format';

export const KEY_REMAPPING_NOTE = 'Setări dispozitiv · separat de profilul învățat';
export const KEY_REMAPPING_CAPTURE_PROMPT = 'Apasă o tastă…';
export const KEY_REMAPPING_RESET_LABEL = 'Resetează la implicite';
export const KEY_REMAPPING_RESET_CONFIRM_LABEL = 'Confirmă resetarea la implicite';
export const KEY_REMAPPING_SAVE_LABEL = 'Salvează';
export const KEY_REMAPPING_CANCEL_LABEL = 'Renunță';

export interface KeyRemappingPanelOptions {
  /** Called after every accepted local draft change (capture, reset, cancel). */
  readonly onChange?: (draft: KeyRemappingDraft) => void;
  /** One save intention per click; the panel never persists settings itself. */
  readonly save?: (bindings: Readonly<Record<KeyRemappingAction, string>>) => void;
  /** Called after „Renunță” restored the persisted bindings locally. */
  readonly cancel?: (draft: KeyRemappingDraft) => void;
}

interface RowNodes {
  readonly item: HTMLElement;
  readonly label: HTMLElement;
  readonly current: HTMLElement;
  readonly key: HTMLButtonElement;
  readonly defaultKey: HTMLElement;
  readonly state: HTMLElement;
  readonly message: HTMLElement;
  readonly onClick: () => void;
}

const DESCRIPTION_ID = 'key-remapping-description';
const CHROME_ELEMENTS = 11;
const CHROME_TEXT_NODES = 7;
const ROW_ELEMENTS = 7;
const ROW_TEXT_NODES = 6;

/**
 * 080 remapping panel adapter.
 *
 * It builds the DOM once, keeps one stable row per action and installs a `keydown` listener on one
 * button *only* while that button is capturing. No listener is attached to `window`, `document` or
 * the host, so the module never interprets driving keys. The host owns persistence: a save click
 * emits exactly one `save(bindings)` intention through the injected port.
 */
export function createKeyRemappingPanel(
  host: HTMLElement,
  draft: KeyRemappingDraft,
  options: KeyRemappingPanelOptions = {},
) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Key remapping requires an owned document');
  const initial = parseKeyRemappingDraft(draft),
    player = initial.playerId;
  if (options.onChange !== undefined && typeof options.onChange !== 'function')
    throw new Error('Key remapping change port');
  if (options.save !== undefined && typeof options.save !== 'function')
    throw new Error('Key remapping save port');
  if (options.cancel !== undefined && typeof options.cancel !== 'function')
    throw new Error('Key remapping cancel port');

  let elementCount = 0;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    elementCount += 1;
    return node;
  };

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    note = element('p'),
    description = element('p'),
    list = element('ul'),
    live = element('p'),
    actions = element('div'),
    resetButton = element('button'),
    saveButton = element('button'),
    cancelButton = element('button');
  root.className = 'key-remapping';
  root.setAttribute('aria-label', 'Remapare comenzi');
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  header.className = 'key-remapping__header';
  title.className = 'key-remapping__title';
  note.className = 'key-remapping__note';
  description.className = 'key-remapping__description';
  description.id = DESCRIPTION_ID;
  list.className = 'key-remapping__rows';
  list.setAttribute('aria-label', 'Comenzi și taste');
  live.className = 'key-remapping__live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  actions.className = 'key-remapping__actions';
  resetButton.className = 'key-remapping__reset';
  saveButton.className = 'key-remapping__save';
  cancelButton.className = 'key-remapping__cancel';
  for (const button of [resetButton, saveButton, cancelButton])
    button.setAttribute('type', 'button');
  title.textContent = 'Remapare comenzi';
  note.textContent = KEY_REMAPPING_NOTE;
  description.textContent =
    'Toate cele 15 comenzi sunt listate mereu. O tastă folosită de două comenzi este conflict și blochează salvarea; o comandă fără tastă validă rămâne vizibilă și invalidă. Valorile propuse se păstrează numai prin butonul Salvează, în setările dispozitivului, separat de profilul învățat.';
  resetButton.textContent = KEY_REMAPPING_RESET_LABEL;
  saveButton.textContent = KEY_REMAPPING_SAVE_LABEL;
  cancelButton.textContent = KEY_REMAPPING_CANCEL_LABEL;
  header.append(title, note);
  actions.append(resetButton, saveButton, cancelButton);
  root.append(header, description, list, live, actions);
  host.append(root);

  const rows = new Map<KeyRemappingAction, RowNodes>();
  for (const action of KEY_REMAPPING_ACTIONS) {
    const item = element('li'),
      label = element('span'),
      current = element('kbd'),
      key = element('button'),
      defaultKey = element('span'),
      state = element('span'),
      message = element('span');
    item.className = 'key-remapping__item';
    item.setAttribute('data-action', action);
    label.className = 'key-remapping__label';
    current.className = 'key-remapping__current';
    key.className = 'key-remapping__key';
    key.setAttribute('type', 'button');
    key.setAttribute('data-action', action);
    defaultKey.className = 'key-remapping__default';
    state.className = 'key-remapping__state';
    message.className = 'key-remapping__message';
    item.append(label, current, key, defaultKey, state, message);
    list.append(item);
    const onClick = () => beginCapture(action);
    key.addEventListener('click', onClick);
    rows.set(action, { item, label, current, key, defaultKey, state, message, onClick });
  }

  let disposed = false,
    busy = false,
    emitting = false,
    capturing: KeyRemappingAction | null = null,
    resetPending = false,
    current = initial,
    view: KeyRemappingProjection = projectKeyRemapping(initial),
    lastSignature = '',
    lastClock = -Infinity,
    listeners = KEY_REMAPPING_ACTIONS.length + 3,
    redraws = 0,
    writes = 0,
    skipped = 0,
    updates = 0,
    renders = 0,
    captures = 0,
    cancelledCaptures = 0,
    saves = 0,
    resets = 0;

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Key remapping reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Key remapping disposed');
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
  const removeAttribute = (node: HTMLElement, name: string) => {
    if (!node.hasAttribute(name)) return;
    node.removeAttribute(name);
    writes += 1;
  };
  const announce = (text: string) => set(live, text);
  const rowView = (action: KeyRemappingAction): KeyRemappingRow => {
    const row = view.rows.find((entry) => entry.action === action);
    if (row === undefined) throw new Error('Key remapping row');
    return row;
  };
  const renderRow = (action: KeyRemappingAction, row: KeyRemappingRow) => {
    const nodes = rows.get(action);
    if (nodes === undefined) throw new Error('Key remapping row nodes');
    set(nodes.label, row.label);
    set(nodes.current, `Acum: ${row.currentLabel}`);
    set(nodes.key, capturing === action ? KEY_REMAPPING_CAPTURE_PROMPT : row.proposedLabel);
    set(nodes.defaultKey, `Implicit: ${row.defaultLabel}`);
    set(nodes.state, `${row.stateSymbol} ${row.stateLabel}`);
    set(nodes.message, row.message ?? '');
    attribute(nodes.item, 'data-state', row.state);
    attribute(nodes.item, 'data-capturing', capturing === action ? 'true' : 'false');
    attribute(nodes.item, 'data-critical', row.critical ? 'true' : 'false');
    attribute(
      nodes.key,
      'aria-label',
      `${row.label}: schimbă tasta; acum ${row.currentLabel}, propusă ${row.proposedLabel}`,
    );
    attribute(nodes.key, 'data-state', row.state);
    attribute(nodes.key, 'data-capturing', capturing === action ? 'true' : 'false');
    attribute(nodes.item, 'aria-label', row.description);
    if (nodes.message.textContent === '') attribute(nodes.message, 'hidden', '');
    else removeAttribute(nodes.message, 'hidden');
  };
  const renderLive = () => {
    const details = view.conflicts.map((conflict) => conflict.message).join(' ');
    announce([view.summary, details].filter((part) => part !== '').join(' '));
  };
  const render = (projected: KeyRemappingProjection) => {
    for (const action of KEY_REMAPPING_ACTIONS) renderRow(action, rowView(action));
    attribute(root, 'data-save-state', projected.saveState);
    attribute(root, 'data-changed', String(projected.changed));
    if (projected.canSave) removeAttribute(saveButton, 'disabled');
    else attribute(saveButton, 'disabled', '');
    renderLive();
    lastSignature = projected.signature;
    renders += 1;
    redraws += 1;
  };
  const applyDraft = (next: KeyRemappingDraft, notify: boolean) => {
    const parsed = parseKeyRemappingDraft(next);
    if (parsed.playerId !== player) throw new Error('Key remapping belongs to another player');
    const projected = projectKeyRemapping(parsed),
      identical = projected.signature === lastSignature;
    current = parsed;
    view = projected;
    if (identical) {
      skipped += 1;
      return;
    }
    render(projected);
    if (notify && options.onChange !== undefined && !emitting) {
      emitting = true;
      try {
        options.onChange(current);
      } finally {
        emitting = false;
      }
    }
  };
  const onCaptureKey = (event: KeyboardEvent) => {
    if (disposed || capturing === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    const action = capturing;
    if (event.code === 'Escape') {
      cancelledCaptures += 1;
      finishCapture(null, 'Remapare anulată. Panoul rămâne deschis.');
      return;
    }
    const result = setBinding(current, action, event.code),
      label = KEY_REMAPPING_LABELS[action];
    if (result.status === 'REJECTED')
      finishCapture(
        result.draft,
        `${label}: ${KEY_REMAPPING_REJECTION_LABELS[result.reason ?? 'EMPTY']}`,
      );
    else
      finishCapture(
        result.draft,
        `${label}: tasta ${formatKeyCode(result.draft.proposed[action])} propusă.`,
      );
  };
  const endCaptureListener = () => {
    if (capturing === null) return null;
    const action = capturing,
      nodes = rows.get(action);
    capturing = null;
    if (nodes !== undefined) {
      nodes.key.removeEventListener('keydown', onCaptureKey);
      removeAttribute(nodes.item, 'data-capturing');
      removeAttribute(nodes.key, 'data-capturing');
    }
    listeners -= 1;
    return action;
  };
  function finishCapture(next: KeyRemappingDraft | null, announcement: string) {
    const action = endCaptureListener();
    if (action === null) return;
    if (next === null) {
      render(view);
      announce(announcement);
      return;
    }
    applyDraft(next, true);
    announce(announcement);
  }
  function beginCapture(action: KeyRemappingAction) {
    mutate(() => {
      assertLive();
      if (capturing !== null) {
        cancelledCaptures += 1;
        endCaptureListener();
      }
      resetPending = false;
      set(resetButton, KEY_REMAPPING_RESET_LABEL);
      capturing = action;
      const nodes = rows.get(action);
      if (nodes === undefined) throw new Error('Key remapping row nodes');
      nodes.key.addEventListener('keydown', onCaptureKey);
      listeners += 1;
      captures += 1;
      attribute(nodes.item, 'data-capturing', 'true');
      attribute(nodes.key, 'data-capturing', 'true');
      set(nodes.key, KEY_REMAPPING_CAPTURE_PROMPT);
      announce(
        `Apasă o tastă pentru ${KEY_REMAPPING_LABELS[action]}. Escape anulează remaparea; Tab, Enter și Space sunt taste valide.`,
      );
    });
  }
  const cancelCapture = () => {
    if (disposed || capturing === null) return;
    cancelledCaptures += 1;
    finishCapture(null, 'Remapare anulată. Panoul rămâne deschis.');
  };
  const save = () =>
    mutate(() => {
      assertLive();
      if (view.saveState !== 'DIRTY') {
        announce(
          view.saveState === 'UNCHANGED'
            ? 'Nicio modificare de salvat.'
            : 'Corectează conflictele sau tastele invalide înainte de salvare.',
        );
        return;
      }
      resetPending = false;
      set(resetButton, KEY_REMAPPING_RESET_LABEL);
      const bindings = keyRemappingBindings(current);
      saves += 1;
      if (options.save !== undefined && !emitting) {
        emitting = true;
        try {
          options.save(bindings);
        } finally {
          emitting = false;
        }
      }
    });
  const requestReset = () => {
    mutate(() => {
      assertLive();
      cancelCapture();
      if (!resetPending) {
        resetPending = true;
        set(resetButton, KEY_REMAPPING_RESET_CONFIRM_LABEL);
        announce(
          'Resetarea propune valorile implicite local. Apasă din nou pe buton pentru confirmare; salvarea rămâne explicită.',
        );
        return;
      }
      resetPending = false;
      set(resetButton, KEY_REMAPPING_RESET_LABEL);
      resets += 1;
      applyDraft(resetBindings(current), true);
      announce(
        'Valorile implicite sunt propuse local. Salvează pentru a le păstra; nimic nu a fost scris încă.',
      );
    });
  };
  const requestCancel = () => {
    mutate(() => {
      assertLive();
      cancelCapture();
      resetPending = false;
      set(resetButton, KEY_REMAPPING_RESET_LABEL);
      applyDraft(revertBindings(current), true);
      announce('Modificările locale au fost renunțate; setările salvate rămân neschimbate.');
      if (options.cancel !== undefined && !emitting) {
        emitting = true;
        try {
          options.cancel(current);
        } finally {
          emitting = false;
        }
      }
    });
  };
  resetButton.addEventListener('click', requestReset);
  saveButton.addEventListener('click', save);
  cancelButton.addEventListener('click', requestCancel);
  render(view);

  return Object.freeze({
    update(candidate: KeyRemappingDraft, nowMs: number) {
      mutate(() => {
        assertLive();
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Key remapping clock');
        lastClock = nowMs;
        updates += 1;
        applyDraft(candidate, false);
      });
    },
    setDraft(candidate: KeyRemappingDraft) {
      mutate(() => {
        assertLive();
        updates += 1;
        applyDraft(candidate, false);
      });
    },
    getDraft: () => current,
    getView: () => view,
    isCapturing: () => capturing !== null,
    cancelCapture,
    getStats: () =>
      Object.freeze({
        version: KEY_REMAPPING_VERSION,
        elements: disposed ? 0 : CHROME_ELEMENTS + KEY_REMAPPING_ACTIONS.length * ROW_ELEMENTS,
        textNodes: disposed ? 0 : CHROME_TEXT_NODES + KEY_REMAPPING_ACTIONS.length * ROW_TEXT_NODES,
        rows: disposed ? 0 : KEY_REMAPPING_ACTIONS.length,
        retainedRows: rows.size,
        listeners: disposed ? 0 : listeners,
        baseListeners: disposed ? 0 : KEY_REMAPPING_ACTIONS.length + 3,
        captureListeners: disposed || capturing === null ? 0 : 1,
        writes,
        redraws,
        skipped,
        updates,
        renders,
        captures,
        cancelledCaptures,
        saves,
        resets,
        saveState: view.saveState as KeyRemappingSaveState,
        capturing,
        disposed,
      }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        if (capturing !== null) {
          const nodes = rows.get(capturing);
          capturing = null;
          if (nodes !== undefined) nodes.key.removeEventListener('keydown', onCaptureKey);
        }
        disposed = true;
        for (const nodes of rows.values()) {
          nodes.key.removeEventListener('click', nodes.onClick);
        }
        resetButton.removeEventListener('click', requestReset);
        saveButton.removeEventListener('click', save);
        cancelButton.removeEventListener('click', requestCancel);
        listeners = 0;
        rows.clear();
        root.remove();
      });
    },
  });
}

export type KeyRemappingPanel = ReturnType<typeof createKeyRemappingPanel>;

/** Bounded contract facts for evidence; no profile or learning value appears here. */
export const KEY_REMAPPING_PANEL_LIMITS = Object.freeze({
  version: KEY_REMAPPING_VERSION,
  actions: KEY_REMAPPING_LIMITS.actions,
  elements: CHROME_ELEMENTS + KEY_REMAPPING_ACTIONS.length * ROW_ELEMENTS,
  textNodes: CHROME_TEXT_NODES + KEY_REMAPPING_ACTIONS.length * ROW_TEXT_NODES,
  baseListeners: KEY_REMAPPING_ACTIONS.length + 3,
  captureListeners: 1,
  retainedDrafts: KEY_REMAPPING_LIMITS.retainedDrafts,
});
