import type {
  DailyProgressInstanceView,
  DailyProgressPanelState,
  DailyProgressPanelView,
  DailyProgressSnapshot,
} from './daily-progress-format';
import {
  DAILY_PROGRESS_PANEL_VERSION,
  DAILY_PROGRESS_TEXT,
  emptyDailyProgressView,
  parseDailyProgressSnapshot,
  projectDailyProgressPanel,
} from './daily-progress-format';

export interface DailyProgressPanelOptions {
  /**
   * Host-composed read of the delivered 212 consumer (`readDailyProgress`). The panel never counts an
   * event and never grants a reward itself, so it cannot advance, complete or re-award anything.
   */
  readonly read: () => DailyProgressSnapshot | null;
  /**
   * 070 pause surface port, exactly like the 126/210 panels: the host passes
   * `pauseFocus.setSurface('panel', open)`. The panel never pauses, resumes or changes the mode.
   */
  readonly setSurface?: (open: boolean) => void;
  readonly open?: boolean;
  readonly idPrefix?: string;
}

export interface DailyProgressPanelStats {
  readonly version: typeof DAILY_PROGRESS_PANEL_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: number;
  /** Always 0: every listener lives on the trigger, the close button or the dialog. */
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
  readonly instances: number;
  readonly active: number;
  readonly completed: number;
  readonly expired: number;
  readonly ineligible: number;
  readonly rejected: number;
  readonly open: boolean;
  readonly empty: boolean;
  readonly disposed: boolean;
}

export type DailyProgressRefreshStatus = 'RENDERED' | 'SKIPPED_CLOSED' | 'SKIPPED_UNCHANGED';

export interface DailyProgressPanel {
  readonly version: typeof DAILY_PROGRESS_PANEL_VERSION;
  open(): boolean;
  close(): boolean;
  toggle(): boolean;
  /** Explicit re-read. A closed panel returns `SKIPPED_CLOSED` and touches nothing. */
  refresh(): DailyProgressRefreshStatus;
  isOpen(): boolean;
  getView(): DailyProgressPanelView | null;
  getSnapshot(): DailyProgressSnapshot | null;
  getTrigger(): HTMLButtonElement;
  getPanel(): HTMLElement;
  getStats(): DailyProgressPanelStats;
  dispose(): void;
}

const TRIGGER_STYLE =
  'appearance:none;border:1px solid #2d4a3f;border-radius:0.375rem;background:#1c332b;' +
  'color:#f3f7fb;padding:0.35rem 0.75rem;font:inherit;cursor:pointer;';
const DIALOG_STYLE =
  'position:fixed;inset:0;margin:auto;width:min(92vw,52rem);max-height:min(90vh,44rem);' +
  'overflow:auto;padding:1rem 1.25rem 1.5rem;background:#0d1714f2;color:#f3f7fb;' +
  'border:1px solid #2d4a3f;border-radius:0.5rem;z-index:40;box-shadow:0 12px 40px #00000080;';
const BODY_STYLE = 'max-height:min(62vh,28rem);overflow:auto;padding-right:0.25rem;';
const CLOSE_STYLE =
  'appearance:none;border:1px solid #9edbb5;border-radius:0.375rem;background:transparent;' +
  'color:#f3f7fb;padding:0.25rem 0.6rem;font:inherit;cursor:pointer;';
const LIST_STYLE =
  'list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.5rem;';
const ITEM_STYLE = 'border:1px solid #2d4a3f;border-radius:0.375rem;padding:0.35rem 0.55rem;';
const HEAD_STYLE = 'display:flex;justify-content:space-between;gap:0.5rem;font-weight:600;';
const BAR_STYLE = 'height:0.35rem;background:#1c332b;border-radius:0.2rem;overflow:hidden;';
const FILL_STYLE = 'height:100%;background:#9edbb5;';
const LINE_STYLE = 'margin:0.15rem 0;font-size:0.8125rem;color:#d7e6de;';
const NOTE_STYLE = 'font-size:0.8125rem;color:#b9cfc5;';

const STATE_COLORS: Readonly<Record<DailyProgressPanelState, string>> = Object.freeze({
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

interface InstanceNodes {
  readonly item: HTMLElement;
  readonly title: HTMLElement;
  readonly state: HTMLElement;
  readonly bar: HTMLElement;
  readonly fill: HTMLElement;
  readonly objective: HTMLElement;
  readonly progress: HTMLElement;
  readonly control: HTMLElement;
  readonly modes: HTMLElement;
  readonly ride: HTMLElement;
  readonly limits: HTMLElement;
  readonly xp: HTMLElement;
  readonly eligibility: HTMLElement;
  readonly reason: HTMLElement;
  mounted: boolean;
}

/**
 * 212 daily mission panel.
 *
 * One native `<button type="button">Misiunile zilei</button>` opens one `role="dialog"` surface. The
 * panel renders exactly one accepted read model and offers no mutation: there is no control that
 * counts an event, completes an objective or activates a reward. Focus moves into the dialog on open,
 * Tab/Shift+Tab stay inside it, Escape closes it and the previous focus is restored. Every listener is
 * attached to an owned element, never to `window` or `document`, so the driving keys keep reaching the
 * game.
 *
 * There is no per-tick path: the panel reads the host port once per open and once per explicit
 * `refresh()`, and it never joins the 3D loop.
 */
export function createDailyProgressPanel(
  host: HTMLElement,
  options: DailyProgressPanelOptions,
): DailyProgressPanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Daily progress panel requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('Daily progress panel requires the 212 host read port');
  if (typeof options.setSurface !== 'function' && options.setSurface !== undefined)
    throw new Error('Daily progress panel surface port must be a function');
  const prefix = options.idPrefix ?? 'daily-progress';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 48)
    throw new Error('Daily progress panel id prefix is invalid');
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

  const root = element('div'),
    trigger = element('button'),
    panel = element('section'),
    header = element('header'),
    title = element('h2'),
    closeButton = element('button'),
    description = element('p'),
    status = element('p'),
    day = line('daily-progress__day'),
    windowLine = line('daily-progress__window'),
    reset = line('daily-progress__reset'),
    xp = line('daily-progress__xp'),
    rejections = line('daily-progress__rejections'),
    body = element('div'),
    list = element('ul'),
    note = element('p');

  root.className = 'daily-progress';
  root.setAttribute('data-version', DAILY_PROGRESS_PANEL_VERSION);
  trigger.className = 'daily-progress__trigger';
  trigger.setAttribute('type', 'button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panelId);
  trigger.setAttribute('aria-label', DAILY_PROGRESS_TEXT.triggerDescription);
  trigger.setAttribute('style', TRIGGER_STYLE);
  trigger.textContent = DAILY_PROGRESS_TEXT.trigger;
  panel.className = 'daily-progress__dialog';
  panel.setAttribute('id', panelId);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);
  panel.setAttribute('aria-describedby', descriptionId);
  panel.setAttribute('hidden', '');
  panel.setAttribute('data-version', DAILY_PROGRESS_PANEL_VERSION);
  panel.setAttribute('data-reads', '0');
  panel.setAttribute('style', DIALOG_STYLE);
  header.className = 'daily-progress__header';
  title.className = 'daily-progress__title';
  title.setAttribute('id', titleId);
  title.textContent = DAILY_PROGRESS_TEXT.title;
  closeButton.className = 'daily-progress__close';
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', DAILY_PROGRESS_TEXT.closeDescription);
  closeButton.setAttribute('style', CLOSE_STYLE);
  closeButton.textContent = DAILY_PROGRESS_TEXT.close;
  description.className = 'daily-progress__description';
  description.setAttribute('id', descriptionId);
  description.textContent = DAILY_PROGRESS_TEXT.description;
  status.className = 'daily-progress__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  body.className = 'daily-progress__body';
  body.setAttribute('id', bodyId);
  body.tabIndex = 0;
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', DAILY_PROGRESS_TEXT.bodyLabel);
  body.setAttribute('style', BODY_STYLE);
  list.className = 'daily-progress__objectives';
  list.setAttribute('style', LIST_STYLE);
  body.append(list);
  note.className = 'daily-progress__note';
  note.setAttribute('id', noteId);
  note.setAttribute('style', NOTE_STYLE);
  note.textContent = DAILY_PROGRESS_TEXT.readonlyNote;
  header.append(title, closeButton);
  panel.append(header, description, status, day, windowLine, reset, xp, rejections, body, note);
  root.append(trigger, panel);
  host.append(root);

  let opened = options.open === true,
    disposed = false,
    busy = false,
    previousFocus: HTMLElement | null = null,
    view: DailyProgressPanelView | null = null,
    snapshot: DailyProgressSnapshot | null = null,
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

  const instances = new Map<string, InstanceNodes>();

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Daily progress panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Daily progress panel disposed');
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

  const createInstance = (instanceId: string): InstanceNodes => {
    const item = element('li'),
      head = element('div'),
      titleNode = element('span'),
      stateNode = element('span'),
      bar = element('div'),
      fill = element('span'),
      objective = line('daily-progress__objective'),
      progress = line('daily-progress__progress'),
      control = line('daily-progress__control'),
      modes = line('daily-progress__modes'),
      ride = line('daily-progress__ride'),
      limits = line('daily-progress__limits'),
      xpLine = line('daily-progress__instance-xp'),
      eligibility = line('daily-progress__eligibility'),
      reason = line('daily-progress__reason');
    item.className = 'daily-progress__objective-item';
    item.setAttribute('data-instance-id', instanceId);
    item.setAttribute('style', ITEM_STYLE);
    head.className = 'daily-progress__objective-head';
    head.setAttribute('style', HEAD_STYLE);
    titleNode.className = 'daily-progress__objective-title';
    stateNode.className = 'daily-progress__objective-state';
    head.append(titleNode, stateNode);
    bar.className = 'daily-progress__objective-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('style', BAR_STYLE);
    fill.className = 'daily-progress__objective-fill';
    fill.setAttribute('aria-hidden', 'true');
    fill.setAttribute('style', FILL_STYLE);
    bar.append(fill);
    item.append(
      head,
      bar,
      objective,
      progress,
      control,
      modes,
      ride,
      limits,
      xpLine,
      eligibility,
      reason,
    );
    return {
      item,
      title: titleNode,
      state: stateNode,
      bar,
      fill,
      objective,
      progress,
      control,
      modes,
      ride,
      limits,
      xp: xpLine,
      eligibility,
      reason,
      mounted: false,
    };
  };

  const renderInstance = (nodes: InstanceNodes, instance: DailyProgressInstanceView) => {
    set(nodes.title, `${instance.orderLabel} · ${instance.title}`);
    set(nodes.state, instance.stateLabel);
    attribute(nodes.item, 'data-state', instance.state);
    attribute(nodes.item, 'data-reason', instance.reason ?? '');
    attribute(nodes.item, 'data-satisfied', instance.satisfied ? 'true' : 'false');
    attribute(nodes.item, 'data-slot', String(instance.slot));
    nodes.state.setAttribute('style', `color:${STATE_COLORS[instance.state]};`);
    nodes.bar.setAttribute('aria-label', instance.description);
    nodes.bar.setAttribute('aria-valuemin', '0');
    nodes.bar.setAttribute('aria-valuemax', String(instance.target));
    nodes.bar.setAttribute('aria-valuenow', String(instance.progress));
    nodes.bar.setAttribute('aria-valuetext', `${instance.progressLabel} · ${instance.stateLabel}`);
    nodes.fill.setAttribute('style', `${FILL_STYLE}width:${instance.percent}%;`);
    set(nodes.objective, `${instance.objectiveLabel} · țintă ${instance.target}`);
    set(
      nodes.progress,
      `${DAILY_PROGRESS_TEXT.labels.progress}: ${instance.progressLabel} · ${instance.stateLabel}`,
    );
    set(nodes.control, `${DAILY_PROGRESS_TEXT.labels.control}: ${instance.controlLabel}`);
    set(nodes.modes, `${DAILY_PROGRESS_TEXT.labels.mode}: ${instance.modeLabel}`);
    set(nodes.ride, `${DAILY_PROGRESS_TEXT.labels.ride}: ${instance.rideLabel}`);
    set(nodes.limits, `${DAILY_PROGRESS_TEXT.labels.window}: ${instance.limitsLabel}`);
    set(nodes.xp, `${DAILY_PROGRESS_TEXT.labels.reward}: ${instance.rewardLabel}`);
    set(
      nodes.eligibility,
      `${DAILY_PROGRESS_TEXT.labels.eligibility}: ${instance.eligibilityLabel}`,
    );
    if (instance.reasonLabel === null) {
      set(nodes.reason, `${DAILY_PROGRESS_TEXT.labels.reason}: ${DAILY_PROGRESS_TEXT.none}`);
      nodes.reason.removeAttribute('data-reason');
    } else {
      set(
        nodes.reason,
        `${DAILY_PROGRESS_TEXT.labels.reason}: ${instance.reasonLabel} (${instance.reason ?? ''})`,
      );
      attribute(nodes.reason, 'data-reason', instance.reason ?? '');
      nodes.reason.setAttribute('role', 'note');
    }
  };

  const render = (next: DailyProgressPanelView) => {
    view = next;
    const ids = new Set(next.instances.map((instance) => instance.instanceId));
    for (const [instanceId, nodes] of instances) {
      if (ids.has(instanceId)) continue;
      nodes.item.remove();
      instances.delete(instanceId);
    }
    for (const instance of next.instances) {
      let nodes = instances.get(instance.instanceId);
      if (nodes === undefined) {
        nodes = createInstance(instance.instanceId);
        instances.set(instance.instanceId, nodes);
      }
      if (!nodes.mounted) {
        list.append(nodes.item);
        nodes.mounted = true;
      }
      renderInstance(nodes, instance);
    }
    attribute(panel, 'data-date', next.instances.length === 0 ? '' : (snapshot?.dailyDate ?? ''));
    attribute(panel, 'data-phase', next.phase);
    attribute(panel, 'data-instances', String(next.counts.instances));
    attribute(panel, 'data-active', String(next.counts.active));
    attribute(panel, 'data-completed', String(next.counts.completed));
    attribute(panel, 'data-expired', String(next.counts.expired));
    attribute(panel, 'data-ineligible', String(next.counts.ineligible));
    attribute(panel, 'data-rewards', String(next.counts.rewards));
    attribute(panel, 'data-promised-xp', String(snapshot?.promisedXp ?? 0));
    attribute(panel, 'data-granted-xp', String(snapshot?.grantedXp ?? 0));
    attribute(panel, 'data-rejections', String(next.counts.rejections));
    attribute(panel, 'data-last-rejection', snapshot?.lastRejection?.reason ?? '');
    attribute(panel, 'data-empty', next.empty ? 'true' : 'false');
    attribute(panel, 'data-reads', String(reads));
    set(status, `${next.summary} ${DAILY_PROGRESS_TEXT.readonlyNote}`);
    set(day, next.dayLabel);
    set(windowLine, next.windowLabel);
    set(reset, next.resetLabel);
    set(xp, next.xpLabel);
    set(rejections, next.rejectionLabel);
    lastSignature = next.signature;
    renders += 1;
  };

  const readView = (): DailyProgressPanelView => {
    const next = options.read();
    reads += 1;
    snapshot = next === null ? null : parseDailyProgressSnapshot(next);
    if (snapshot === null) return emptyDailyProgressView();
    return projectDailyProgressPanel(snapshot);
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
    version: DAILY_PROGRESS_PANEL_VERSION,
    open: openPanel,
    close: closePanel,
    toggle(): boolean {
      return opened ? closePanel() : openPanel();
    },
    refresh(): DailyProgressRefreshStatus {
      let result: DailyProgressRefreshStatus = 'SKIPPED_CLOSED';
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
    getStats(): DailyProgressPanelStats {
      const measured = disposed ? { elements: 0, textNodes: 0 } : countTree(root);
      return Object.freeze({
        version: DAILY_PROGRESS_PANEL_VERSION,
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
        instances: view?.counts.instances ?? 0,
        active: view?.counts.active ?? 0,
        completed: view?.counts.completed ?? 0,
        expired: view?.counts.expired ?? 0,
        ineligible: view?.counts.ineligible ?? 0,
        rejected: view?.counts.rejections ?? 0,
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
        for (const nodes of instances.values()) nodes.item.remove();
        instances.clear();
        view = null;
        snapshot = null;
        clear(list);
        root.remove();
      });
    },
  });
}

export type DailyProgressPanelAdapter = ReturnType<typeof createDailyProgressPanel>;
