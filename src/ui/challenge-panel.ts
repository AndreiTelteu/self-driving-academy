import type {
  ChallengePanelAction,
  ChallengePanelActionView,
  ChallengePanelSnapshot,
  ChallengePanelView,
} from './challenge-panel-format';
import {
  CHALLENGE_PANEL_ACTION_LABELS,
  CHALLENGE_PANEL_TEXT,
  CHALLENGE_PANEL_VERSION,
  emptyChallengePanelView,
  parseChallengePanelSnapshot,
  projectChallengePanel,
} from './challenge-panel-format';

export interface ChallengePanelOptions {
  /**
   * Host-composed read of the real 231/232/233 contracts (`composeChallengePanelSnapshot`). The
   * panel never reads the director, the ledger or the record store itself.
   */
  readonly read: () => ChallengePanelSnapshot | null;
  /**
   * The host owns every action; the panel only sends the intent. It never accepts, declines,
   * restarts or credits anything.
   */
  readonly onAction?: (action: ChallengePanelAction) => void;
  /**
   * 070 pause surface port, exactly like the 126/210 panels: the host passes `pauseFocus.setSurface`.
   */
  readonly setSurface?: (open: boolean) => void;
  readonly open?: boolean;
  readonly idPrefix?: string;
}

export interface ChallengePanelStats {
  readonly version: typeof CHALLENGE_PANEL_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: number;
  /** Always 0: every listener lives on the trigger, the close button, an action or the dialog. */
  readonly globalListeners: 0;
  readonly opens: number;
  readonly closes: number;
  readonly renders: number;
  /** Reads of the host port: one per open and one per accepted refresh. */
  readonly reads: number;
  readonly skippedClosed: number;
  readonly skippedUnchanged: number;
  readonly escapes: number;
  readonly tabWraps: number;
  readonly focusMoves: number;
  readonly focusRestores: number;
  readonly surfaceCalls: number;
  readonly actions: number;
  readonly acceptActions: number;
  readonly declineActions: number;
  readonly retryActions: number;
  readonly continueActions: number;
  readonly records: number;
  readonly dailyPicks: number;
  readonly open: boolean;
  readonly empty: boolean;
  readonly disposed: boolean;
}

export type ChallengePanelRefreshStatus = 'RENDERED' | 'SKIPPED_CLOSED' | 'SKIPPED_UNCHANGED';

export interface ChallengePanel {
  readonly version: typeof CHALLENGE_PANEL_VERSION;
  open(): boolean;
  close(): boolean;
  toggle(): boolean;
  /** Explicit re-read. A closed panel returns `SKIPPED_CLOSED` and touches nothing. */
  refresh(): ChallengePanelRefreshStatus;
  isOpen(): boolean;
  getView(): ChallengePanelView | null;
  getSnapshot(): ChallengePanelSnapshot | null;
  getTrigger(): HTMLButtonElement;
  getPanel(): HTMLElement;
  getStats(): ChallengePanelStats;
  dispose(): void;
}

const TRIGGER_STYLE =
  'appearance:none;border:1px solid #4a3f2d;border-radius:0.375rem;background:#332b1c;' +
  'color:#f3f7fb;padding:0.35rem 0.75rem;font:inherit;cursor:pointer;';
const DIALOG_STYLE =
  'position:fixed;inset:0;margin:auto;width:min(92vw,46rem);max-height:min(90vh,40rem);' +
  'overflow:auto;padding:1rem 1.25rem 1.5rem;background:#17130df2;color:#f3f7fb;' +
  'border:1px solid #4a3f2d;border-radius:0.5rem;z-index:40;box-shadow:0 12px 40px #00000080;';
const BODY_STYLE = 'max-height:min(58vh,26rem);overflow:auto;padding-right:0.25rem;';
const CLOSE_STYLE =
  'appearance:none;border:1px solid #e0c79e;border-radius:0.375rem;background:transparent;' +
  'color:#f3f7fb;padding:0.25rem 0.6rem;font:inherit;cursor:pointer;';
const ACTION_STYLE =
  'appearance:none;border:1px solid #e0c79e;border-radius:0.375rem;background:#2a2318;' +
  'color:#f3f7fb;padding:0.3rem 0.75rem;font:inherit;cursor:pointer;';
const SECTION_STYLE =
  'border:1px solid #4a3f2d;border-radius:0.375rem;padding:0.5rem 0.65rem;margin:0 0 0.6rem;';
const NOTE_STYLE = 'font-size:0.8125rem;color:#d6c4a4;';
const LINE_STYLE = 'margin:0.15rem 0;font-size:0.8125rem;';
const LIST_STYLE = 'list-style:none;margin:0.25rem 0 0;padding:0;';
const ITEM_STYLE = 'padding:0.15rem 0;font-size:0.8125rem;';

function countTree(node: HTMLElement): { elements: number; textNodes: number } {
  let elements = 1,
    textNodes = 0;
  for (const child of [...node.children] as HTMLElement[]) {
    const nested = countTree(child);
    elements += nested.elements;
    textNodes += nested.textNodes;
  }
  if (node.children.length === 0 && (node.textContent ?? '').length > 0) textNodes += 1;
  return { elements, textNodes };
}

/**
 * 233 challenge panel.
 *
 * One native `<button type="button">Provocări</button>` opens one `role="dialog"` surface. The panel
 * renders exactly one accepted snapshot: the visible offer with its authored premise, objective and
 * reward; the live attempt; the last result with its comic reaction, record and XP statement; the
 * discovered personal records; and the three-challenge daily set.
 *
 * The four actions stay accessible and label their host intent: Acceptă/Refuză for an offer,
 * Mai încearcă/Continuă condusul for a result. The panel never performs them: it only calls
 * `onAction`, so it cannot accept a challenge, consume an attempt or credit XP.
 *
 * Focus moves into the dialog on open, Tab/Shift+Tab stay inside, Escape closes it and the previous
 * focus is restored. Every listener is attached to an owned element, never to the global window, so
 * the driving keys keep reaching the game. There is no per-tick path: the panel reads the host port
 * once per open and once per explicit `refresh()`, and it never joins the 3D loop.
 */
export function createChallengePanel(
  host: HTMLElement,
  options: ChallengePanelOptions,
): ChallengePanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Challenge panel requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('Challenge panel requires the 231/232/233 host read port');
  if (typeof options.onAction !== 'function' && options.onAction !== undefined)
    throw new Error('Challenge panel action port must be a function');
  if (typeof options.setSurface !== 'function' && options.setSurface !== undefined)
    throw new Error('Challenge panel surface port must be a function');
  const prefix = options.idPrefix ?? 'challenge-panel';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 48)
    throw new Error('Challenge panel id prefix is invalid');
  const panelId = `${prefix}-dialog`,
    titleId = `${prefix}-title`,
    descriptionId = `${prefix}-description`,
    bodyId = `${prefix}-body`,
    noteId = `${prefix}-note`;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);
  const line = (className: string): HTMLElement => {
    const node = element('p');
    node.className = className;
    node.setAttribute('style', LINE_STYLE);
    return node;
  };
  const section = (heading: string): { readonly root: HTMLElement; readonly body: HTMLElement } => {
    const root = element('section'),
      title = element('h3'),
      body = element('div');
    root.className = 'challenge-panel__section';
    root.setAttribute('style', SECTION_STYLE);
    title.textContent = heading;
    body.className = 'challenge-panel__section-body';
    root.append(title, body);
    return { root, body };
  };

  const root = element('div'),
    trigger = element('button'),
    panel = element('section'),
    header = element('header'),
    title = element('h2'),
    closeButton = element('button'),
    description = element('p'),
    status = element('p'),
    summary = element('p'),
    actionBar = element('div'),
    body = element('div'),
    offerSection = section(CHALLENGE_PANEL_TEXT.offerHeading),
    activeSection = section(CHALLENGE_PANEL_TEXT.activeHeading),
    resultSection = section(CHALLENGE_PANEL_TEXT.resultHeading),
    reactionSection = section(CHALLENGE_PANEL_TEXT.reactionHeading),
    recordsSection = section(CHALLENGE_PANEL_TEXT.recordsHeading),
    dailySection = section(CHALLENGE_PANEL_TEXT.dailyHeading),
    note = element('p');

  const offerLines = {
    title: line('challenge-panel__offer-title'),
    premise: line('challenge-panel__offer-premise'),
    objective: line('challenge-panel__offer-objective'),
    reward: line('challenge-panel__offer-reward'),
    limits: line('challenge-panel__offer-limits'),
  };
  const activeLines = {
    title: line('challenge-panel__active-title'),
    objective: line('challenge-panel__active-objective'),
    reward: line('challenge-panel__active-reward'),
    remaining: line('challenge-panel__active-remaining'),
  };
  const resultLines = {
    title: line('challenge-panel__result-title'),
    status: line('challenge-panel__result-status'),
    progress: line('challenge-panel__result-progress'),
    reward: line('challenge-panel__result-reward'),
    record: line('challenge-panel__result-record'),
    xp: line('challenge-panel__result-xp'),
  };
  const reactionLines = {
    headline: line('challenge-panel__reaction-headline'),
    text: line('challenge-panel__reaction-text'),
    statement: line('challenge-panel__reaction-statement'),
  };
  const recordsList = element('ul'),
    dailyList = element('ul'),
    recordsEmpty = line('challenge-panel__records-empty'),
    dailyEmpty = line('challenge-panel__daily-empty');

  root.className = 'challenge-panel';
  root.setAttribute('data-version', CHALLENGE_PANEL_VERSION);
  trigger.className = 'challenge-panel__trigger';
  trigger.setAttribute('type', 'button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panelId);
  trigger.setAttribute('aria-label', CHALLENGE_PANEL_TEXT.triggerDescription);
  trigger.setAttribute('style', TRIGGER_STYLE);
  trigger.textContent = CHALLENGE_PANEL_TEXT.trigger;
  panel.className = 'challenge-panel__dialog';
  panel.setAttribute('id', panelId);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);
  panel.setAttribute('aria-describedby', descriptionId);
  panel.setAttribute('hidden', '');
  panel.setAttribute('data-version', CHALLENGE_PANEL_VERSION);
  panel.setAttribute('data-reads', '0');
  panel.setAttribute('style', DIALOG_STYLE);
  header.className = 'challenge-panel__header';
  title.className = 'challenge-panel__title';
  title.setAttribute('id', titleId);
  title.textContent = CHALLENGE_PANEL_TEXT.title;
  closeButton.className = 'challenge-panel__close';
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', CHALLENGE_PANEL_TEXT.closeDescription);
  closeButton.setAttribute('style', CLOSE_STYLE);
  closeButton.textContent = CHALLENGE_PANEL_TEXT.close;
  description.className = 'challenge-panel__description';
  description.setAttribute('id', descriptionId);
  description.textContent = CHALLENGE_PANEL_TEXT.description;
  status.className = 'challenge-panel__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  summary.className = 'challenge-panel__summary';
  actionBar.className = 'challenge-panel__actions';
  actionBar.setAttribute('role', 'group');
  actionBar.setAttribute('aria-label', 'Acțiuni pentru provocarea curentă');
  actionBar.setAttribute('style', 'display:flex;flex-wrap:wrap;gap:0.4rem;margin:0.5rem 0;');
  body.className = 'challenge-panel__body';
  body.setAttribute('id', bodyId);
  body.tabIndex = 0;
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', CHALLENGE_PANEL_TEXT.bodyLabel);
  body.setAttribute('aria-describedby', noteId);
  body.setAttribute('style', BODY_STYLE);
  recordsList.className = 'challenge-panel__records';
  recordsList.setAttribute('style', LIST_STYLE);
  dailyList.className = 'challenge-panel__daily';
  dailyList.setAttribute('style', LIST_STYLE);
  recordsSection.body.append(recordsEmpty, recordsList);
  dailySection.body.append(dailyEmpty, dailyList);
  offerSection.body.append(
    offerLines.title,
    offerLines.premise,
    offerLines.objective,
    offerLines.reward,
    offerLines.limits,
  );
  activeSection.body.append(
    activeLines.title,
    activeLines.objective,
    activeLines.reward,
    activeLines.remaining,
  );
  resultSection.body.append(
    resultLines.title,
    resultLines.status,
    resultLines.progress,
    resultLines.reward,
    resultLines.record,
    resultLines.xp,
  );
  reactionSection.body.append(reactionLines.headline, reactionLines.text, reactionLines.statement);
  note.className = 'challenge-panel__note';
  note.setAttribute('id', noteId);
  note.setAttribute('style', NOTE_STYLE);
  note.textContent = CHALLENGE_PANEL_TEXT.readonlyNote;
  body.append(
    offerSection.root,
    activeSection.root,
    resultSection.root,
    reactionSection.root,
    recordsSection.root,
    dailySection.root,
  );
  header.append(title, closeButton);
  panel.append(header, description, status, summary, actionBar, body, note);
  root.append(trigger, panel);
  host.append(root);

  let opened = options.open === true,
    disposed = false,
    busy = false,
    previousFocus: HTMLElement | null = null,
    view: ChallengePanelView | null = null,
    snapshot: ChallengePanelSnapshot | null = null,
    lastSignature = '',
    opens = 0,
    closes = 0,
    renders = 0,
    reads = 0,
    skippedClosed = 0,
    skippedUnchanged = 0,
    escapes = 0,
    tabWraps = 0,
    focusMoves = 0,
    focusRestores = 0,
    surfaceCalls = 0,
    actions = 0,
    acceptActions = 0,
    declineActions = 0,
    retryActions = 0,
    continueActions = 0,
    listeners = 0;
  const actionButtons = new Map<ChallengePanelAction, HTMLButtonElement>();
  let visibleActions: readonly ChallengePanelActionView[] = [];

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Challenge panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Challenge panel disposed');
  };
  const set = (node: HTMLElement, value: string) => {
    if (node.textContent === value) return;
    node.textContent = value;
  };
  const attribute = (node: HTMLElement, name: string, value: string) => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
  };
  const clear = (node: HTMLElement) => {
    for (const child of [...node.children]) child.remove();
  };
  const canFocus = (node: unknown): node is HTMLElement =>
    typeof node === 'object' &&
    node !== null &&
    typeof (node as HTMLElement).focus === 'function' &&
    typeof (node as HTMLElement).getAttribute === 'function';
  const focus = (node: HTMLElement) => {
    if (typeof node.focus === 'function') node.focus();
  };
  const show = (node: HTMLElement, visible: boolean) => {
    if (visible) {
      if (node.getAttribute('hidden') !== null) node.removeAttribute('hidden');
    } else if (node.getAttribute('hidden') === null) node.setAttribute('hidden', '');
  };

  function actionButton(action: ChallengePanelAction): HTMLButtonElement {
    const existing = actionButtons.get(action);
    if (existing !== undefined) return existing;
    const button = element('button');
    button.className = 'challenge-panel__action';
    button.setAttribute('type', 'button');
    button.setAttribute('data-action', action);
    button.setAttribute('aria-label', CHALLENGE_PANEL_ACTION_LABELS[action]);
    button.setAttribute('style', ACTION_STYLE);
    button.textContent = CHALLENGE_PANEL_ACTION_LABELS[action];
    const onClick = () => {
      if (disposed || !opened) return;
      const entry = visibleActions.find((candidate) => candidate.action === action);
      if (entry === undefined || !entry.enabled) return;
      actions += 1;
      if (action === 'ACCEPT') acceptActions += 1;
      else if (action === 'DECLINE') declineActions += 1;
      else if (action === 'RETRY') retryActions += 1;
      else continueActions += 1;
      set(
        status,
        `${CHALLENGE_PANEL_ACTION_LABELS[action]} · ${CHALLENGE_PANEL_TEXT.readonlyNote}`,
      );
      options.onAction?.(action);
    };
    button.addEventListener('click', onClick);
    listeners += 1;
    actionButtons.set(action, button);
    actionBar.append(button);
    return button;
  }

  const renderActions = (entries: readonly ChallengePanelActionView[]) => {
    visibleActions = entries;
    for (const [action, button] of actionButtons) {
      const entry = entries.find((candidate) => candidate.action === action);
      if (entry === undefined) {
        show(button, false);
        continue;
      }
      show(button, true);
      set(button, entry.label);
      attribute(button, 'aria-disabled', entry.enabled ? 'false' : 'true');
      attribute(button, 'data-enabled', entry.enabled ? 'true' : 'false');
      attribute(
        button,
        'aria-label',
        entry.reason === null ? entry.label : `${entry.label}. ${entry.reason}`,
      );
      attribute(button, 'title', entry.reason ?? '');
    }
    for (const entry of entries) actionButton(entry.action);
    for (const [action, button] of actionButtons) {
      const entry = entries.find((candidate) => candidate.action === action);
      show(button, entry !== undefined);
    }
  };

  const render = (next: ChallengePanelView) => {
    view = next;
    show(offerSection.root, next.offer !== null);
    show(activeSection.root, next.active !== null);
    show(resultSection.root, next.result !== null);
    show(reactionSection.root, next.result !== null && next.result.reactionText.length > 0);
    show(recordsSection.root, true);
    show(dailySection.root, next.daily !== null);
    if (next.offer !== null) {
      set(offerLines.title, `${next.offer.title} · ${next.offer.templateId}`);
      set(offerLines.premise, `${CHALLENGE_PANEL_TEXT.labels.premise}: ${next.offer.premise}`);
      set(
        offerLines.objective,
        `${CHALLENGE_PANEL_TEXT.labels.objective}: ${next.offer.objectiveLabel} · ${CHALLENGE_PANEL_TEXT.labels.progress} ${next.offer.progressLabel}`,
      );
      set(offerLines.reward, `${CHALLENGE_PANEL_TEXT.labels.reward}: ${next.offer.rewardLabel}`);
      set(
        offerLines.limits,
        `${CHALLENGE_PANEL_TEXT.labels.incidents}: ${next.offer.incidentsLabel} · ${CHALLENGE_PANEL_TEXT.labels.session}: ${next.offer.sessionLabel} · ${CHALLENGE_PANEL_TEXT.labels.control}: ${next.offer.controlLabel} · ${CHALLENGE_PANEL_TEXT.labels.expires}: ${next.offer.expiresLabel}`,
      );
    }
    if (next.active !== null) {
      set(activeLines.title, next.active.title);
      set(
        activeLines.objective,
        `${CHALLENGE_PANEL_TEXT.labels.objective}: ${next.active.objectiveLabel} · ${CHALLENGE_PANEL_TEXT.labels.progress} ${next.active.progressLabel}`,
      );
      set(
        activeLines.reward,
        `${CHALLENGE_PANEL_TEXT.labels.reward}: ${next.active.rewardLabel} · ${CHALLENGE_PANEL_TEXT.labels.deadline}: ${next.active.deadlineLabel}`,
      );
      set(
        activeLines.remaining,
        `${CHALLENGE_PANEL_TEXT.labels.deadline}: ${next.active.remainingLabel}`,
      );
    }
    if (next.result !== null) {
      set(resultLines.title, next.result.title);
      set(
        resultLines.status,
        `${CHALLENGE_PANEL_TEXT.labels.status}: ${next.result.statusLabel} · ${CHALLENGE_PANEL_TEXT.labels.reason}: ${next.result.reasonLabel}`,
      );
      set(
        resultLines.progress,
        `${CHALLENGE_PANEL_TEXT.labels.progress}: ${next.result.progressLabel}`,
      );
      set(resultLines.reward, `${CHALLENGE_PANEL_TEXT.labels.reward}: ${next.result.rewardLabel}`);
      set(resultLines.record, `${CHALLENGE_PANEL_TEXT.labels.record}: ${next.result.recordLabel}`);
      set(resultLines.xp, next.result.xpLabel);
      set(reactionLines.headline, next.result.reactionHeadline);
      set(reactionLines.text, next.result.reactionText);
      set(reactionLines.statement, next.result.xpStatementLabel);
    }
    clear(recordsList);
    for (const record of next.records) {
      const item = element('li');
      item.className = 'challenge-panel__record';
      item.setAttribute('data-record-id', record.recordId);
      item.setAttribute('style', ITEM_STYLE);
      item.textContent = `${record.title} · ${record.familyLabel} · ${record.bestLabel} · ${record.attemptsLabel} · ${record.lastResultLabel}`;
      recordsList.append(item);
    }
    show(recordsEmpty, next.records.length === 0);
    clear(dailyList);
    if (next.daily !== null) {
      for (const pick of next.daily.picks) {
        const item = element('li');
        item.className = 'challenge-panel__daily-pick';
        item.setAttribute('data-slot', String(pick.slot));
        item.setAttribute('data-template-id', pick.templateId);
        item.setAttribute('style', ITEM_STYLE);
        item.textContent = `${pick.slot}. ${pick.title} · ${pick.familyLabel} · ${pick.controlLabel} · ${pick.bridgeLabel}`;
        dailyList.append(item);
      }
    }
    show(dailyEmpty, next.daily === null);
    renderActions(next.actions);
    set(
      summary,
      next.daily === null
        ? `${next.sessionLabel} · ${next.records.length} recorduri`
        : `${next.sessionLabel} · ${next.records.length} recorduri · ${next.daily.summary}`,
    );
    set(status, `${next.notice} ${CHALLENGE_PANEL_TEXT.readonlyNote}`);
    attribute(panel, 'data-tick', String(next.tick));
    attribute(panel, 'data-records', String(next.counts.records));
    attribute(panel, 'data-discovered', String(next.counts.discovered));
    attribute(panel, 'data-daily-picks', String(next.counts.dailyPicks));
    attribute(panel, 'data-completions', String(next.counts.completions));
    attribute(panel, 'data-credited-xp', String(next.counts.creditedXp));
    attribute(panel, 'data-offer', next.offer === null ? 'none' : next.offer.templateId);
    attribute(panel, 'data-result', next.result === null ? 'none' : next.result.status);
    attribute(panel, 'data-actions', String(next.actions.length));
    attribute(panel, 'data-empty', next.empty ? 'true' : 'false');
    attribute(panel, 'data-reads', String(reads));
    lastSignature = next.signature;
    renders += 1;
  };

  const readView = (): ChallengePanelView => {
    const next = options.read();
    reads += 1;
    snapshot = next === null ? null : parseChallengePanelSnapshot(next);
    if (snapshot === null) return emptyChallengePanelView();
    return projectChallengePanel(snapshot);
  };

  const focusables = (): HTMLElement[] => [
    closeButton,
    ...visibleActions
      .filter((entry) => entry.enabled)
      .map((entry) => actionButtons.get(entry.action))
      .filter((entry): entry is HTMLButtonElement => entry !== undefined),
    body,
  ];

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || !opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      escapes += 1;
      closePanel();
      return;
    }
    if (event.key !== 'Tab') return;
    const stops = focusables(),
      index = stops.indexOf(doc.activeElement as HTMLElement);
    event.preventDefault();
    if (stops.length === 0) return;
    const direction = event.shiftKey ? -1 : 1,
      next =
        index === -1
          ? direction === 1
            ? 0
            : stops.length - 1
          : (index + direction + stops.length) % stops.length;
    if ((index === stops.length - 1 && direction === 1) || (index === 0 && direction === -1))
      tabWraps += 1;
    focus(stops[next]!);
  }

  function openPanel(): boolean {
    let changed = false;
    mutate(() => {
      assertLive();
      if (opened) return;
      previousFocus = canFocus(doc.activeElement) ? doc.activeElement : null;
      render(readView());
      opened = true;
      opens += 1;
      panel.removeAttribute('hidden');
      attribute(trigger, 'aria-expanded', 'true');
      surfaceCalls += 1;
      options.setSurface?.(true);
      const firstEnabled = visibleActions.find((entry) => entry.enabled);
      const target =
        (firstEnabled === undefined ? undefined : actionButtons.get(firstEnabled.action)) ??
        closeButton;
      focus(target);
      focusMoves += 1;
      changed = true;
    });
    return changed;
  }

  function closePanel(): boolean {
    let changed = false;
    mutate(() => {
      assertLive();
      if (!opened) return;
      opened = false;
      closes += 1;
      panel.setAttribute('hidden', '');
      attribute(trigger, 'aria-expanded', 'false');
      surfaceCalls += 1;
      options.setSurface?.(false);
      const target = canFocus(previousFocus) ? previousFocus : trigger;
      previousFocus = null;
      focus(target);
      focusRestores += 1;
      changed = true;
    });
    return changed;
  }

  const onTriggerClick = () => {
    if (disposed) return;
    if (opened) closePanel();
    else openPanel();
  };
  const onCloseClick = () => {
    if (disposed) return;
    closePanel();
  };
  trigger.addEventListener('click', onTriggerClick);
  closeButton.addEventListener('click', onCloseClick);
  panel.addEventListener('keydown', onKeyDown);
  listeners += 3;
  if (opened) {
    opened = false;
    openPanel();
  } else {
    render(emptyChallengePanelView());
    panel.setAttribute('hidden', '');
  }

  return Object.freeze({
    version: CHALLENGE_PANEL_VERSION,
    open: openPanel,
    close: closePanel,
    toggle(): boolean {
      return opened ? closePanel() : openPanel();
    },
    refresh(): ChallengePanelRefreshStatus {
      let result: ChallengePanelRefreshStatus = 'SKIPPED_CLOSED';
      mutate(() => {
        assertLive();
        if (!opened) {
          skippedClosed += 1;
          result = 'SKIPPED_CLOSED';
          return;
        }
        const next = readView();
        if (next.signature === lastSignature) {
          skippedUnchanged += 1;
          result = 'SKIPPED_UNCHANGED';
          return;
        }
        render(next);
        result = 'RENDERED';
      });
      return result;
    },
    isOpen: () => opened,
    getView: () => (disposed ? null : view),
    getSnapshot: () => (disposed ? null : snapshot),
    getTrigger: () => trigger,
    getPanel: () => panel,
    getStats(): ChallengePanelStats {
      const measured = disposed ? { elements: 0, textNodes: 0 } : countTree(root);
      return Object.freeze({
        version: CHALLENGE_PANEL_VERSION,
        elements: measured.elements,
        textNodes: measured.textNodes,
        listeners: disposed ? 0 : listeners,
        globalListeners: 0 as const,
        opens,
        closes,
        renders,
        reads,
        skippedClosed,
        skippedUnchanged,
        escapes,
        tabWraps,
        focusMoves,
        focusRestores,
        surfaceCalls,
        actions,
        acceptActions,
        declineActions,
        retryActions,
        continueActions,
        records: view?.counts.records ?? 0,
        dailyPicks: view?.counts.dailyPicks ?? 0,
        open: opened,
        empty: view?.empty ?? true,
        disposed,
      });
    },
    dispose(): void {
      mutate(() => {
        if (disposed) return;
        if (opened) {
          opened = false;
          surfaceCalls += 1;
          options.setSurface?.(false);
        }
        disposed = true;
        trigger.removeEventListener('click', onTriggerClick);
        closeButton.removeEventListener('click', onCloseClick);
        panel.removeEventListener('keydown', onKeyDown);
        for (const button of actionButtons.values()) button.remove();
        actionButtons.clear();
        listeners = 0;
        view = null;
        snapshot = null;
        root.remove();
      });
    },
  });
}

export type ChallengePanelAdapter = ReturnType<typeof createChallengePanel>;
