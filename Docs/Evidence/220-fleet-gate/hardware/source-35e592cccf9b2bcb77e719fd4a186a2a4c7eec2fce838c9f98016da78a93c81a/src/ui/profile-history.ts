import type {
  ProfileHistoryChangeRow,
  ProfileHistoryRow,
  ProfileHistorySnapshot,
  ProfileHistoryView,
} from './profile-history-format';
import {
  PROFILE_HISTORY_CONFIRM_LABEL,
  PROFILE_HISTORY_CONFIRM_RULE,
  PROFILE_HISTORY_EMPTY_DETAIL,
  PROFILE_HISTORY_EMPTY_TEXT,
  PROFILE_HISTORY_LIMITS,
  PROFILE_HISTORY_NO_CHANGES,
  PROFILE_HISTORY_NOT_CONNECTED,
  PROFILE_HISTORY_PREVIEW_EMPTY,
  PROFILE_HISTORY_RESTORE_LABEL,
  PROFILE_HISTORY_VERSION,
  parseProfileHistorySnapshot,
  projectProfileHistory,
} from './profile-history-format';

/** Outcome reported by the injected restore port; the panel only displays it. */
export interface ProfileHistoryRestoreResult {
  readonly accepted: boolean;
  /** Host rejection text or closed reason; never invented by the panel. */
  readonly reason: string | null;
}

export interface ProfileHistoryOptions {
  /** Text/attribute write ceiling. Defaults to 10 Hz; never tied to the tick rate. */
  readonly maximumHz?: number;
  /**
   * Real 092 reserved (R/`extension`) keys. When supplied, a frame that carries a reserved preview
   * change is rejected; production composition always passes them.
   */
  readonly reservedKeys?: readonly string[];
  /** Selection intent. The panel never restores, activates or edits a version itself. */
  readonly select?: (versionId: string) => boolean;
  /** Explicit restore intent, invoked only after the visible confirmation step. */
  readonly restore?: (versionId: string) => ProfileHistoryRestoreResult;
  /** Build the panel closed; `open()` renders the retained view without rebuilding rows. */
  readonly open?: boolean;
}

interface RowNodes {
  readonly item: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly version: HTMLElement;
  readonly state: HTMLElement;
  readonly engine: HTMLElement;
  readonly source: HTMLElement;
  readonly onClick: () => void;
}

interface ChangeNodes {
  readonly item: HTMLElement;
  readonly key: HTMLElement;
  readonly change: HTMLElement;
  readonly reason: HTMLElement;
}

/** Elements owned by one version row: `li`, `button` and four `span`s. */
const ROW_ELEMENTS = 6;
/** Elements owned by one preview row: `li` and three `span`s. */
const CHANGE_ELEMENTS = 4;
const DESCRIPTION_ID = 'profile-history-description';

/**
 * 078 profile history adapter. The DOM is built once and one version row is kept per `versionId`,
 * so a selection, a current-version change or a new frame never recreates or renumbers rows.
 *
 * Selection is not restoration: a row click only emits the injected `select` intent. Restoration is
 * a second, explicit action: the restore button opens a visible confirmation state and only the
 * `Confirmă restaurarea` click emits the injected `restore` intent. The adapter never reads or writes
 * the profile store, never edits a version and installs no global key listener.
 */
export function createProfileHistoryPanel(host: HTMLElement, options: ProfileHistoryOptions = {}) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Profile history requires an owned document');
  const maximumHz = options.maximumHz ?? PROFILE_HISTORY_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('Profile history write rate');
  const reservedKeys = options.reservedKeys,
    interval = 1000 / maximumHz;
  let elementCount = 0,
    created = 0,
    writes = 0,
    skipped = 0,
    updates = 0,
    renders = 0,
    listeners = 2,
    disposed = false,
    busy = false,
    emitting = false,
    confirming = false,
    opened = options.open === true,
    current: ProfileHistorySnapshot | null = null,
    view: ProfileHistoryView | null = null,
    lastSignature = '',
    lastClock = -Infinity,
    lastWrite = -Infinity;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    elementCount += 1;
    return node;
  };
  const leaf = (text: string): HTMLElement => {
    const node = element('span');
    node.textContent = text;
    return node;
  };
  const mutate = (action: () => void) => {
    if (busy) throw new Error('Profile history reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Profile history disposed');
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
  const toggle = (node: HTMLElement, name: string, value: boolean) => {
    if (node.hasAttribute(name) === value) return;
    if (value) node.setAttribute(name, '');
    else node.removeAttribute(name);
    writes += 1;
  };

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    countValue = element('span'),
    identity = element('dl'),
    empty = element('p'),
    emptyTitle = element('strong'),
    emptyDetail = element('span'),
    list = element('ul'),
    previewSection = element('section'),
    previewTitle = element('h3'),
    previewSummary = element('p'),
    previewEmpty = element('p'),
    changeList = element('ul'),
    restoreSection = element('section'),
    restoreTitle = element('h3'),
    restoreReason = element('p'),
    actions = element('div'),
    restoreButton = element('button'),
    confirmButton = element('button'),
    status = element('p'),
    description = element('p');
  root.className = 'profile-history';
  root.setAttribute('aria-label', 'Istoricul profilului');
  root.setAttribute('data-open', opened ? 'true' : 'false');
  root.setAttribute('data-confirming', 'false');
  header.className = 'profile-history__header';
  title.className = 'profile-history__title';
  title.textContent = 'Istoric profil';
  countValue.className = 'profile-history__count';
  identity.className = 'profile-history__identity';
  empty.className = 'profile-history__empty';
  empty.setAttribute('data-state', 'EMPTY');
  emptyTitle.className = 'profile-history__empty-title';
  emptyTitle.textContent = PROFILE_HISTORY_EMPTY_TEXT;
  emptyDetail.className = 'profile-history__empty-detail';
  emptyDetail.textContent = PROFILE_HISTORY_EMPTY_DETAIL;
  list.className = 'profile-history__versions';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Versiuni de profil');
  previewSection.className = 'profile-history__preview';
  previewTitle.textContent = 'Previzualizare modificări';
  previewSummary.className = 'profile-history__preview-summary';
  previewEmpty.className = 'profile-history__preview-empty';
  previewEmpty.textContent = PROFILE_HISTORY_PREVIEW_EMPTY;
  changeList.className = 'profile-history__changes';
  changeList.setAttribute('aria-label', 'Modificări previzualizate');
  restoreSection.className = 'profile-history__restore';
  restoreTitle.textContent = 'Restaurare versiune';
  restoreReason.className = 'profile-history__reason';
  restoreReason.setAttribute('role', 'note');
  actions.className = 'profile-history__actions';
  restoreButton.className = 'profile-history__restore-button';
  restoreButton.setAttribute('type', 'button');
  restoreButton.setAttribute('disabled', '');
  restoreButton.setAttribute('aria-disabled', 'true');
  restoreButton.textContent = PROFILE_HISTORY_RESTORE_LABEL;
  confirmButton.className = 'profile-history__confirm-button';
  confirmButton.setAttribute('type', 'button');
  confirmButton.setAttribute('hidden', '');
  confirmButton.textContent = PROFILE_HISTORY_CONFIRM_LABEL;
  status.className = 'profile-history__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  description.className = 'profile-history__description';
  description.id = DESCRIPTION_ID;
  description.textContent =
    'Istoricul afișează versiunile imuabile ale profilului, de la bază la vârf. ' +
    'Selectarea unei versiuni doar o marchează și actualizează previzualizarea; nu restaurează. ' +
    'Restaurarea cere butonul „Restaurează” și un al doilea clic de confirmare. ' +
    'Cheile R sunt rezervate și nu apar ca modificări învățabile.';
  const identityValues = new Map<string, HTMLElement>();
  for (const caption of ['ID profil', 'Versiune curentă', 'Versiune selectată']) {
    const term = element('dt'),
      value = element('dd');
    term.textContent = caption;
    identityValues.set(caption, value);
    identity.append(term, value);
  }
  restoreButton.addEventListener('click', onRestoreClick);
  confirmButton.addEventListener('click', onConfirmClick);
  actions.append(restoreButton, confirmButton);
  restoreSection.append(restoreTitle, restoreReason, actions);
  previewSection.append(previewTitle, previewSummary, previewEmpty, changeList);
  empty.append(emptyTitle, emptyDetail);
  header.append(title, countValue);
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  root.append(header, identity, empty, list, previewSection, restoreSection, status, description);
  if (!opened) root.setAttribute('hidden', '');
  host.append(root);
  const baseElements = elementCount;

  const rows = new Map<string, RowNodes>(),
    changes = new Map<string, ChangeNodes>();

  const restoreKey = (snapshot: ProfileHistorySnapshot): string =>
    [
      snapshot.currentVersionId ?? '—',
      snapshot.selectedVersionId ?? '—',
      snapshot.restore.action,
      snapshot.restore.reason ?? '—',
    ].join('|');
  const confirmPrompt = (snapshot: ProfileHistorySnapshot): string =>
    `Apasă „${PROFILE_HISTORY_CONFIRM_LABEL}” pentru versiunea ${
      snapshot.selectedVersionId ?? 'selectată'
    }. ${PROFILE_HISTORY_CONFIRM_RULE}`;

  function emitSelect(versionId: string): void {
    if (disposed || emitting || options.select === undefined) return;
    emitting = true;
    try {
      options.select(versionId);
    } finally {
      emitting = false;
    }
  }

  const createRow = (versionId: string): RowNodes => {
    const item = element('li'),
      button = element('button'),
      version = leaf(''),
      state = leaf(''),
      engine = leaf(''),
      source = leaf('');
    item.className = 'profile-history__item';
    item.setAttribute('role', 'presentation');
    item.setAttribute('data-version-id', versionId);
    button.className = 'profile-history__row';
    button.setAttribute('type', 'button');
    button.setAttribute('role', 'option');
    button.setAttribute('data-version-id', versionId);
    button.setAttribute('aria-selected', 'false');
    version.className = 'profile-history__version';
    state.className = 'profile-history__state';
    engine.className = 'profile-history__engine';
    source.className = 'profile-history__source';
    button.append(version, state, engine, source);
    item.append(button);
    const onClick = () => emitSelect(versionId);
    button.addEventListener('click', onClick);
    listeners += 1;
    created += 1;
    return { item, button, version, state, engine, source, onClick };
  };
  const renderRow = (nodes: RowNodes, row: ProfileHistoryRow) => {
    set(nodes.version, row.versionId);
    set(nodes.state, row.stateLabel);
    set(nodes.engine, row.engineVersion);
    set(nodes.source, row.sourceLabel);
    attribute(nodes.button, 'aria-label', row.description);
    attribute(nodes.button, 'aria-selected', row.selected ? 'true' : 'false');
    attribute(nodes.item, 'data-origin', row.origin);
    attribute(nodes.item, 'data-current', row.current ? 'true' : 'false');
    attribute(nodes.item, 'data-selected', row.selected ? 'true' : 'false');
    attribute(nodes.item, 'data-compatible', row.compatible ? 'true' : 'false');
  };
  const createChange = (key: string): ChangeNodes => {
    const item = element('li'),
      label = leaf(''),
      change = leaf(''),
      reason = leaf('');
    item.className = 'profile-history__change';
    item.setAttribute('data-key', key);
    label.className = 'profile-history__change-key';
    change.className = 'profile-history__change-value';
    reason.className = 'profile-history__change-reason';
    item.append(label, change, reason);
    return { item, key: label, change, reason };
  };
  const renderChange = (nodes: ChangeNodes, row: ProfileHistoryChangeRow) => {
    set(nodes.key, row.key);
    set(nodes.change, row.changeLabel);
    set(nodes.reason, row.reason);
    attribute(nodes.item, 'aria-label', row.description);
    attribute(nodes.item, 'data-source', row.source);
  };
  const renderConfirm = () => {
    const blocked = view?.restore.available !== true;
    toggle(restoreButton, 'disabled', blocked);
    attribute(restoreButton, 'aria-disabled', blocked ? 'true' : 'false');
    toggle(confirmButton, 'hidden', !confirming);
    attribute(root, 'data-confirming', confirming ? 'true' : 'false');
  };
  const renderRows = (projected: ProfileHistoryView) => {
    const liveIds = new Set(projected.rows.map((row) => row.rowId));
    for (const [versionId, nodes] of rows) {
      if (liveIds.has(versionId)) continue;
      nodes.button.removeEventListener('click', nodes.onClick);
      listeners -= 1;
      nodes.item.remove();
      rows.delete(versionId);
    }
    for (let index = 0; index < projected.rows.length; index += 1) {
      const row = projected.rows[index]!;
      let nodes = rows.get(row.rowId);
      if (nodes === undefined) {
        nodes = createRow(row.rowId);
        rows.set(row.rowId, nodes);
      }
      const reference = list.children[index] ?? null;
      if (reference !== nodes.item) list.insertBefore(nodes.item, reference);
      renderRow(nodes, row);
    }
  };
  const renderPreview = (projected: ProfileHistoryView) => {
    const preview = projected.preview;
    if (preview === null || preview.rows.length === 0) {
      toggle(changeList, 'hidden', true);
      toggle(previewEmpty, 'hidden', false);
      set(previewSummary, preview === null ? '—' : preview.summary);
      set(
        previewEmpty,
        preview === null ? projected.previewEmptyLabel : PROFILE_HISTORY_NO_CHANGES,
      );
      for (const [key, nodes] of changes) {
        nodes.item.remove();
        changes.delete(key);
      }
      return;
    }
    toggle(changeList, 'hidden', false);
    toggle(previewEmpty, 'hidden', true);
    set(previewSummary, preview.summary);
    for (let index = 0; index < preview.rows.length; index += 1) {
      const row = preview.rows[index]!;
      let nodes = changes.get(row.rowId);
      if (nodes === undefined) {
        nodes = createChange(row.rowId);
        changes.set(row.rowId, nodes);
      }
      const reference = changeList.children[index] ?? null;
      if (reference !== nodes.item) changeList.insertBefore(nodes.item, reference);
      renderChange(nodes, row);
    }
    const liveKeys = new Set(preview.rows.map((row) => row.rowId));
    for (const [key, nodes] of changes) {
      if (liveKeys.has(key)) continue;
      nodes.item.remove();
      changes.delete(key);
    }
  };
  const render = (projected: ProfileHistoryView, snapshot: ProfileHistorySnapshot) => {
    renderRows(projected);
    renderPreview(projected);
    set(identityValues.get('ID profil')!, projected.profileId);
    set(identityValues.get('Versiune curentă')!, projected.currentVersionId ?? '—');
    set(identityValues.get('Versiune selectată')!, projected.selectedVersionId ?? '—');
    set(countValue, `${projected.counts.entries} versiuni`);
    toggle(empty, 'hidden', !projected.empty);
    toggle(list, 'hidden', projected.empty);
    set(restoreReason, projected.restore.reasonLabel);
    view = projected;
    renderConfirm();
    set(status, confirming ? confirmPrompt(snapshot) : projected.summary);
    attribute(root, 'data-tick', String(snapshot.tick));
    attribute(root, 'data-entries', String(projected.counts.entries));
    attribute(root, 'data-changes', String(projected.counts.changes));
    attribute(root, 'data-current', projected.currentVersionId ?? '');
    attribute(root, 'data-selected', projected.selectedVersionId ?? '');
    attribute(root, 'data-restore', projected.restore.action);
    attribute(root, 'data-empty', projected.empty ? 'true' : 'false');
    attribute(
      root,
      'aria-label',
      `Istoricul profilului ${projected.profileId} · ${projected.counts.entries} versiuni · ` +
        `curent ${projected.currentVersionId ?? '—'} · restaurare ${
          projected.restore.available ? 'disponibilă' : 'indisponibilă'
        }`,
    );
    lastSignature = projected.signature;
    renders += 1;
  };

  function onRestoreClick() {
    if (disposed || busy || current === null || view === null) return;
    if (!view.restore.available || confirming) return;
    confirming = true;
    renderConfirm();
    set(status, confirmPrompt(current));
  }

  function onConfirmClick() {
    if (disposed || busy || current === null || !confirming) return;
    const versionId = current.selectedVersionId;
    confirming = false;
    renderConfirm();
    if (versionId === null) {
      set(status, PROFILE_HISTORY_PREVIEW_EMPTY);
      return;
    }
    const port = options.restore;
    if (port === undefined) {
      set(status, PROFILE_HISTORY_NOT_CONNECTED);
      return;
    }
    let result: ProfileHistoryRestoreResult;
    try {
      result = port(versionId);
    } catch {
      set(status, `Restaurare refuzată pentru ${versionId}.`);
      return;
    }
    set(
      status,
      result.accepted
        ? `Restaurare solicitată pentru ${versionId}.`
        : `Restaurare refuzată pentru ${versionId}: ${result.reason ?? 'motiv nespecificat'}.`,
    );
  }

  function setOpen(next: boolean) {
    mutate(() => {
      assertLive();
      if (opened === next) return;
      opened = next;
      toggle(root, 'hidden', !opened);
      attribute(root, 'data-open', opened ? 'true' : 'false');
      if (opened && current !== null) {
        const projected = projectProfileHistory(current);
        if (projected.signature === lastSignature) view = projected;
        else render(projected, current);
      }
    });
  }

  return Object.freeze({
    update(candidate: ProfileHistorySnapshot, nowMs: number) {
      mutate(() => {
        assertLive();
        const snapshot = parseProfileHistorySnapshot(candidate, reservedKeys);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Profile history clock');
        if (
          current !== null &&
          current.sessionId === snapshot.sessionId &&
          current.worldEpoch === snapshot.worldEpoch &&
          snapshot.tick < current.tick
        )
          throw new Error('Stale profile history snapshot');
        lastClock = nowMs;
        const previous = current,
          restoreChanged = previous === null || restoreKey(previous) !== restoreKey(snapshot),
          wasConfirming = confirming;
        current = snapshot;
        if (restoreChanged) confirming = false;
        const projected = projectProfileHistory(snapshot),
          bypass =
            previous === null ||
            previous.selectedVersionId !== snapshot.selectedVersionId ||
            previous.currentVersionId !== snapshot.currentVersionId ||
            previous.restore.action !== snapshot.restore.action ||
            previous.restore.reason !== snapshot.restore.reason;
        if (projected.signature === lastSignature) {
          view = projected;
          if (wasConfirming && restoreChanged) renderConfirm();
          skipped += 1;
          return;
        }
        if (!bypass && nowMs - lastWrite < interval) {
          skipped += 1;
          return;
        }
        lastWrite = nowMs;
        updates += 1;
        render(projected, snapshot);
      });
    },
    setOpen,
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    isOpen: () => opened,
    getStats: () =>
      Object.freeze({
        version: PROFILE_HISTORY_VERSION,
        elements: disposed
          ? 0
          : baseElements + rows.size * ROW_ELEMENTS + changes.size * CHANGE_ELEMENTS,
        rows: disposed ? 0 : rows.size,
        created,
        changeRows: disposed ? 0 : changes.size,
        writes,
        skipped,
        updates,
        renders,
        listeners: disposed ? 0 : listeners,
        confirming: disposed ? false : confirming,
        retainedViews: disposed || view === null ? 0 : 1,
        open: opened,
        disposed,
      }),
    /** The last rendered projection; `null` before the first accepted update. */
    getView: () => (disposed ? null : view),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const nodes of rows.values()) {
          nodes.button.removeEventListener('click', nodes.onClick);
          nodes.item.remove();
        }
        rows.clear();
        for (const nodes of changes.values()) nodes.item.remove();
        changes.clear();
        restoreButton.removeEventListener('click', onRestoreClick);
        confirmButton.removeEventListener('click', onConfirmClick);
        listeners = 0;
        current = null;
        view = null;
        root.remove();
      });
    },
  });
}

export type ProfileHistoryPanel = ReturnType<typeof createProfileHistoryPanel>;
