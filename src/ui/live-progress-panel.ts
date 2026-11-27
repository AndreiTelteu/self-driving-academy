import {
  LIVE_PROGRESS_UI_VERSION,
  emptyLiveProgressView,
  parseLiveProgressSnapshot,
  projectLiveProgressPanel,
  type LiveProgressPanelView,
  type LiveProgressSnapshot,
  type ParsedLiveProgressSnapshot,
} from './live-progress-format';

export interface LiveProgressPanelOptions {
  /** Host-composed read of the 276 composition; the panel never counts, grants or advances anything. */
  readonly read: () => LiveProgressSnapshot | null;
  readonly setSurface?: (open: boolean) => void;
  readonly open?: boolean;
  readonly idPrefix?: string;
}

export interface LiveProgressPanelStats {
  readonly version: typeof LIVE_PROGRESS_UI_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: number;
  readonly globalListeners: 0;
  readonly opens: number;
  readonly closes: number;
  readonly renders: number;
  readonly reads: number;
  readonly skippedClosed: number;
  readonly skippedUnchanged: number;
  readonly escapes: number;
  readonly tabWraps: number;
  readonly focusMoves: number;
  readonly focusRestores: number;
  readonly surfaceCalls: number;
  readonly xpBalance: number;
  readonly level: number;
  readonly historyRows: number;
  readonly instances: number;
  readonly completed: number;
  readonly expired: number;
  readonly open: boolean;
  readonly empty: boolean;
  readonly disposed: boolean;
}

export type LiveProgressRefreshStatus = 'RENDERED' | 'SKIPPED_CLOSED' | 'SKIPPED_UNCHANGED';

export interface LiveProgressPanel {
  readonly version: typeof LIVE_PROGRESS_UI_VERSION;
  open(): boolean;
  close(): boolean;
  toggle(): boolean;
  refresh(): LiveProgressRefreshStatus;
  isOpen(): boolean;
  getView(): LiveProgressPanelView | null;
  getSnapshot(): ParsedLiveProgressSnapshot | null;
  getTrigger(): HTMLButtonElement;
  getPanel(): HTMLElement;
  getStats(): LiveProgressPanelStats;
  dispose(): void;
}

const TRIGGER_STYLE =
  'appearance:none;border:1px solid #2d4a3f;border-radius:0.375rem;background:#1c332b;' +
  'color:#f3f7fb;padding:0.35rem 0.75rem;font:inherit;cursor:pointer;';
const DIALOG_STYLE =
  'position:fixed;inset:0;margin:auto;width:min(94vw,56rem);max-height:min(92vh,48rem);' +
  'overflow:auto;padding:1rem 1.25rem 1.5rem;background:#0d1714f2;color:#f3f7fb;' +
  'border:1px solid #2d4a3f;border-radius:0.5rem;z-index:40;box-shadow:0 12px 40px #00000080;';
const CLOSE_STYLE =
  'appearance:none;border:1px solid #9edbb5;border-radius:0.375rem;background:transparent;' +
  'color:#f3f7fb;padding:0.25rem 0.6rem;font:inherit;cursor:pointer;';
const BODY_STYLE = 'max-height:min(64vh,30rem);overflow:auto;padding-right:0.25rem;';
const SECTION_STYLE = 'border-top:1px solid #2d4a3f;margin-top:0.8rem;padding-top:0.7rem;';
const HEADING_STYLE = 'font-size:0.95rem;color:#9fe0c5;margin:0 0 0.35rem;';
const LINE_STYLE = 'margin:0.15rem 0;font-size:0.8125rem;color:#d7e6de;';
const NOTE_STYLE = 'font-size:0.8125rem;color:#b9cfc5;';
const LIST_STYLE =
  'list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.5rem;';
const ITEM_STYLE = 'border:1px solid #2d4a3f;border-radius:0.375rem;padding:0.35rem 0.55rem;';
const HEAD_STYLE = 'display:flex;justify-content:space-between;gap:0.5rem;font-weight:600;';
const BAR_STYLE = 'height:0.35rem;background:#1c332b;border-radius:0.2rem;overflow:hidden;';
const FILL_STYLE = 'height:100%;background:#9edbb5;';

const STATE_COLORS: Readonly<Record<string, string>> = Object.freeze({
  ACTIVE: '#ffd479',
  COMPLETED: '#9edbb5',
  EXPIRED: '#c0c8cc',
  INELIGIBLE: '#ff9f9f',
});

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

export function createLiveProgressPanel(
  host: HTMLElement,
  options: LiveProgressPanelOptions,
): LiveProgressPanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Live progress panel requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('Live progress panel requires the 276 host read port');
  if (typeof options.setSurface !== 'function' && options.setSurface !== undefined)
    throw new Error('Live progress panel surface port must be a function');
  const prefix = options.idPrefix ?? 'live-progress';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 48)
    throw new Error('Live progress panel id prefix is invalid');
  const panelId = `${prefix}-dialog`,
    titleId = `${prefix}-title`,
    descriptionId = `${prefix}-description`,
    bodyId = `${prefix}-body`;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);
  const line = (className: string): HTMLElement => {
    const node = element('p');
    node.className = className;
    node.setAttribute('style', LINE_STYLE);
    return node;
  };

  const root = element('div'),
    trigger = element('button'),
    panel = element('section'),
    header = element('header'),
    title = element('h2'),
    closeButton = element('button'),
    description = element('p'),
    status = element('p'),
    body = element('div'),
    xpSection = element('section'),
    xpHeading = element('h3'),
    xpLevel = element('p'),
    nextLevel = line('live-progress__next-level'),
    activeTime = line('live-progress__active-time'),
    levelBar = element('div'),
    levelFill = element('span'),
    historyHeading = element('h4'),
    historySummary = line('live-progress__history-summary'),
    historyList = element('ol'),
    dailySection = element('section'),
    dailyHeading = element('h3'),
    day = line('live-progress__day'),
    windowLine = line('live-progress__window'),
    reset = line('live-progress__reset'),
    dailySummary = line('live-progress__daily-summary'),
    objectiveList = element('ul'),
    note = element('p');

  root.className = 'live-progress';
  root.setAttribute('data-version', LIVE_PROGRESS_UI_VERSION);
  trigger.className = 'live-progress__trigger';
  trigger.setAttribute('type', 'button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panelId);
  trigger.setAttribute('aria-label', 'Deschide progresul și misiunile zilnice');
  trigger.setAttribute('style', TRIGGER_STYLE);
  trigger.textContent = 'Progres';
  panel.className = 'live-progress__dialog';
  panel.setAttribute('id', panelId);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);
  panel.setAttribute('aria-describedby', descriptionId);
  panel.setAttribute('hidden', '');
  panel.setAttribute('data-version', LIVE_PROGRESS_UI_VERSION);
  panel.setAttribute('style', DIALOG_STYLE);
  header.className = 'live-progress__header';
  title.className = 'live-progress__title';
  title.setAttribute('id', titleId);
  title.textContent = 'Progres și misiuni zilnice';
  closeButton.className = 'live-progress__close';
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', 'Închide progresul');
  closeButton.setAttribute('style', CLOSE_STYLE);
  closeButton.textContent = 'Închide';
  description.className = 'live-progress__description';
  description.setAttribute('id', descriptionId);
  description.textContent =
    'Soldul XP, nivelul, istoricul și cele trei obiective ale zilei; XP nu scade niciodată.';
  status.className = 'live-progress__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  body.className = 'live-progress__body';
  body.setAttribute('id', bodyId);
  body.tabIndex = 0;
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', 'Conținutul progresului');
  body.setAttribute('style', BODY_STYLE);

  xpSection.className = 'live-progress__xp';
  xpSection.setAttribute('style', SECTION_STYLE);
  xpSection.setAttribute('aria-labelledby', `${prefix}-xp-title`);
  xpHeading.className = 'live-progress__xp-title';
  xpHeading.setAttribute('id', `${prefix}-xp-title`);
  xpHeading.setAttribute('style', HEADING_STYLE);
  xpHeading.textContent = 'Experiență';
  xpLevel.className = 'live-progress__xp-level';
  xpLevel.setAttribute(
    'style',
    'margin:0.15rem 0;font-size:1.05rem;font-weight:600;color:#f3f7fb;',
  );
  levelBar.className = 'live-progress__level-bar';
  levelBar.setAttribute('role', 'progressbar');
  levelBar.setAttribute('aria-label', 'Progresul nivelului curent');
  levelBar.setAttribute('aria-valuemin', '0');
  levelBar.setAttribute('aria-valuemax', '100');
  levelBar.setAttribute('style', BAR_STYLE);
  levelFill.className = 'live-progress__level-fill';
  levelFill.setAttribute('aria-hidden', 'true');
  levelFill.setAttribute('style', FILL_STYLE);
  levelBar.append(levelFill);
  historyHeading.className = 'live-progress__history-title';
  historyHeading.setAttribute('style', HEADING_STYLE);
  historyHeading.textContent = 'Istoric XP';
  historyList.className = 'live-progress__history';
  historyList.setAttribute('style', LIST_STYLE);
  xpSection.append(
    xpHeading,
    xpLevel,
    nextLevel,
    activeTime,
    levelBar,
    historyHeading,
    historySummary,
    historyList,
  );

  dailySection.className = 'live-progress__daily';
  dailySection.setAttribute('style', SECTION_STYLE);
  dailySection.setAttribute('aria-labelledby', `${prefix}-daily-title`);
  dailyHeading.className = 'live-progress__daily-title';
  dailyHeading.setAttribute('id', `${prefix}-daily-title`);
  dailyHeading.setAttribute('style', HEADING_STYLE);
  dailyHeading.textContent = 'Misiunile zilei';
  objectiveList.className = 'live-progress__objectives';
  objectiveList.setAttribute('style', LIST_STYLE);
  dailySection.append(dailyHeading, day, windowLine, reset, dailySummary, objectiveList);

  note.className = 'live-progress__note';
  note.setAttribute('style', NOTE_STYLE);
  note.textContent =
    'XP se acordă o singură dată pe identitate și nu scade la KPI, accident, misiune eșuată sau zi ratată. Pauza, background-ul, focusul pierdut, AFK și Haos nu acordă XP Academie.';
  header.append(title, closeButton);
  body.append(xpSection, dailySection, note);
  panel.append(header, description, status, body);
  root.append(trigger, panel);
  host.append(root);

  let opened = options.open === true,
    disposed = false,
    busy = false,
    previousFocus: HTMLElement | null = null,
    view: LiveProgressPanelView | null = null,
    snapshot: ParsedLiveProgressSnapshot | null = null,
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
    listeners = 0;

  const historyRows = new Map<string, HTMLElement>();
  const objectives = new Map<string, HTMLElement>();

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Live progress panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Live progress panel disposed');
  };
  const set = (node: HTMLElement, value: string) => {
    if (node.textContent === value) return;
    node.textContent = value;
  };
  const attribute = (node: HTMLElement, name: string, value: string) => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
  };
  const focus = (node: HTMLElement) => {
    if (typeof node.focus === 'function') node.focus();
  };
  const canFocus = (node: unknown): node is HTMLElement =>
    typeof node === 'object' &&
    node !== null &&
    typeof (node as HTMLElement).focus === 'function' &&
    typeof (node as HTMLElement).getAttribute === 'function';

  interface ObjectiveNodes {
    readonly item: HTMLElement;
    readonly title: HTMLElement;
    readonly state: HTMLElement;
    readonly bar: HTMLElement;
    readonly fill: HTMLElement;
    readonly objective: HTMLElement;
    readonly progress: HTMLElement;
    readonly control: HTMLElement;
    readonly limits: HTMLElement;
    readonly xp: HTMLElement;
    readonly reason: HTMLElement;
  }

  const objectiveItemFills = new Map<string, ObjectiveNodes>();

  const createObjective = (instanceId: string): HTMLElement => {
    const item = element('li'),
      head = element('div'),
      titleNode = element('span'),
      stateNode = element('span'),
      bar = element('div'),
      fill = element('span'),
      objective = line('live-progress__objective'),
      progress = line('live-progress__progress'),
      control = line('live-progress__control'),
      limits = line('live-progress__limits'),
      xp = line('live-progress__instance-xp'),
      reason = line('live-progress__reason');
    item.className = 'live-progress__objective-item';
    item.setAttribute('data-instance-id', instanceId);
    item.setAttribute('style', ITEM_STYLE);
    head.className = 'live-progress__objective-head';
    head.setAttribute('style', HEAD_STYLE);
    titleNode.className = 'live-progress__objective-title';
    stateNode.className = 'live-progress__objective-state';
    head.append(titleNode, stateNode);
    bar.className = 'live-progress__objective-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('style', BAR_STYLE);
    fill.className = 'live-progress__objective-fill';
    fill.setAttribute('aria-hidden', 'true');
    fill.setAttribute('style', FILL_STYLE);
    bar.append(fill);
    item.append(head, bar, objective, progress, control, limits, xp, reason);
    objectiveItemFills.set(instanceId, {
      item,
      title: titleNode,
      state: stateNode,
      bar,
      fill,
      objective,
      progress,
      control,
      limits,
      xp,
      reason,
    });
    return item;
  };

  const renderObjective = (instance: LiveProgressPanelView['daily']['instances'][number]) => {
    let nodes = objectiveItemFills.get(instance.instanceId);
    if (nodes === undefined) {
      const item = createObjective(instance.instanceId);
      objectiveList.append(item);
      nodes = objectiveItemFills.get(instance.instanceId)!;
      objectives.set(instance.instanceId, item);
    }
    set(nodes.title, `${instance.orderLabel} · ${instance.title}`);
    set(nodes.state, instance.stateLabel);
    attribute(nodes.item, 'data-state', instance.state);
    attribute(nodes.item, 'data-reason', instance.reason ?? '');
    attribute(nodes.item, 'data-satisfied', instance.satisfied ? 'true' : 'false');
    nodes.state.setAttribute('style', `color:${STATE_COLORS[instance.state] ?? '#d7e6de'};`);
    nodes.bar.setAttribute('aria-label', instance.description);
    nodes.bar.setAttribute('aria-valuemin', '0');
    nodes.bar.setAttribute('aria-valuemax', String(instance.target));
    nodes.bar.setAttribute('aria-valuenow', String(instance.progress));
    nodes.bar.setAttribute('aria-valuetext', `${instance.progressLabel} · ${instance.stateLabel}`);
    nodes.fill.setAttribute('style', `${FILL_STYLE}width:${instance.percent}%;`);
    set(nodes.objective, `${instance.objectiveLabel} · țintă ${instance.target}`);
    set(nodes.progress, `Progres: ${instance.progressLabel} · ${instance.stateLabel}`);
    set(nodes.control, `Control: ${instance.controlLabel}`);
    set(nodes.limits, `Fereastră: ${instance.limitsLabel}`);
    set(nodes.xp, `${instance.xpLabel} · ${instance.rewardLabel}`);
    if (instance.reasonLabel === null) {
      set(nodes.reason, 'Motiv: niciunul');
      nodes.reason.removeAttribute('data-reason');
    } else {
      set(nodes.reason, `Motiv: ${instance.reasonLabel} (${instance.reason ?? ''})`);
      attribute(nodes.reason, 'data-reason', instance.reason ?? '');
      nodes.reason.setAttribute('role', 'note');
    }
  };

  const renderHistory = (next: LiveProgressPanelView) => {
    const ids = new Set(next.history.map((row) => row.entryId));
    for (const [entryId, node] of historyRows) {
      if (ids.has(entryId)) continue;
      node.remove();
      historyRows.delete(entryId);
    }
    for (const row of next.history) {
      let node = historyRows.get(row.entryId);
      if (node === undefined) {
        node = element('li');
        node.className = 'live-progress__history-row';
        node.setAttribute('data-entry-id', row.entryId);
        node.setAttribute('style', ITEM_STYLE);
        historyList.append(node);
        historyRows.set(row.entryId, node);
      }
      node.textContent = `${row.causeLabel} · ${row.amountLabel} · sold ${row.balanceLabel} · ${row.timeLabel}`;
      node.setAttribute('data-cause', row.causeLabel);
    }
    attribute(panel, 'data-history', String(next.history.length));
  };

  const render = (next: LiveProgressPanelView) => {
    view = next;
    const objectiveIds = new Set(next.daily.instances.map((instance) => instance.instanceId));
    for (const [instanceId, item] of objectives) {
      if (objectiveIds.has(instanceId)) continue;
      item.remove();
      objectives.delete(instanceId);
      objectiveItemFills.delete(instanceId);
    }
    for (const instance of next.daily.instances) renderObjective(instance);
    renderHistory(next);
    set(status, next.summary);
    set(xpLevel, `${next.levelLabel} · ${next.xpLabel}`);
    set(nextLevel, next.nextLevelLabel);
    set(activeTime, next.activeTimeLabel);
    set(historySummary, next.historySummary);
    set(day, next.daily.dayLabel);
    set(windowLine, next.daily.windowLabel);
    set(reset, next.daily.resetLabel);
    set(dailySummary, `${next.daily.summary} · ${next.daily.timeZoneLabel}`);
    levelBar.setAttribute('aria-valuenow', String(next.levelPercent));
    levelBar.setAttribute('aria-valuetext', `${next.levelLabel}, ${next.xpLabel}`);
    levelFill.setAttribute('style', `${FILL_STYLE}width:${next.levelPercent}%;`);
    attribute(panel, 'data-xp-balance', next.xpLabel);
    attribute(panel, 'data-level', String(snapshot?.player.level ?? 0));
    attribute(panel, 'data-daily-phase', next.daily.phase);
    attribute(panel, 'data-instances', String(next.daily.counts.instances));
    attribute(panel, 'data-completed', String(next.daily.counts.completed));
    attribute(panel, 'data-expired', String(next.daily.counts.expired));
    attribute(panel, 'data-reads', String(reads));
    attribute(panel, 'data-empty', next.empty ? 'true' : 'false');
    lastSignature = next.signature;
    renders += 1;
  };

  const readView = (): LiveProgressPanelView => {
    const next = options.read();
    reads += 1;
    snapshot = next === null ? null : parseLiveProgressSnapshot(next);
    if (snapshot === null) return emptyLiveProgressView();
    return projectLiveProgressPanel(snapshot);
  };

  const focusables = (): HTMLElement[] => [closeButton, body];

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
      focus(closeButton);
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
  }

  return Object.freeze({
    version: LIVE_PROGRESS_UI_VERSION,
    open: openPanel,
    close: closePanel,
    toggle(): boolean {
      return opened ? closePanel() : openPanel();
    },
    refresh(): LiveProgressRefreshStatus {
      let result: LiveProgressRefreshStatus = 'SKIPPED_CLOSED';
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
    getStats(): LiveProgressPanelStats {
      const measured = disposed ? { elements: 0, textNodes: 0 } : countTree(root);
      return Object.freeze({
        version: LIVE_PROGRESS_UI_VERSION,
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
        xpBalance: snapshot?.player.xpBalance ?? 0,
        level: snapshot?.player.level ?? 1,
        historyRows: historyRows.size,
        instances: view?.daily.counts.instances ?? 0,
        completed: view?.daily.counts.completed ?? 0,
        expired: view?.daily.counts.expired ?? 0,
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
        listeners = 0;
        historyRows.clear();
        objectives.clear();
        objectiveItemFills.clear();
        view = null;
        snapshot = null;
        root.remove();
      });
    },
  });
}

export type LiveProgressPanelAdapter = ReturnType<typeof createLiveProgressPanel>;
