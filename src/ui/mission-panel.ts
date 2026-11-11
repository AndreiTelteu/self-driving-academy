import type {
  MissionPanelMissionView,
  MissionPanelObjectiveView,
  MissionPanelSnapshot,
  MissionPanelView,
} from './mission-panel-format';
import {
  MISSION_PANEL_TEXT,
  MISSION_PANEL_VERSION,
  emptyMissionPanelView,
  parseMissionPanelSnapshot,
  projectMissionPanel,
} from './mission-panel-format';

export interface MissionPanelOptions {
  /**
   * Host-composed read of the real 116/125 contracts (`composeMissionPanelSnapshot`). The panel
   * never reads the tracker or the ledger itself, so it cannot advance, reset or re-judge anything.
   */
  readonly read: () => MissionPanelSnapshot | null;
  /**
   * 070 pause surface port, exactly like the 210 popup: the host passes
   * `pauseFocus.setSurface('panel', open)`. The panel never pauses, resumes or changes the mode.
   */
  readonly setSurface?: (open: boolean) => void;
  readonly open?: boolean;
  readonly idPrefix?: string;
}

export interface MissionPanelStats {
  readonly version: typeof MISSION_PANEL_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: number;
  /** Always 0: every listener lives on the trigger, the close button, a mission button or the dialog. */
  readonly globalListeners: 0;
  readonly opens: number;
  readonly closes: number;
  readonly renders: number;
  /** Reads of the host port: one per open and one per accepted refresh. */
  readonly reads: number;
  /** Pure view changes (`selectMission`); they never read and never write a contract. */
  readonly inspections: number;
  readonly skippedClosed: number;
  readonly skippedUnchanged: number;
  readonly escapes: number;
  readonly tabWraps: number;
  readonly focusMoves: number;
  readonly focusRestores: number;
  readonly surfaceCalls: number;
  readonly missions: number;
  readonly objectives: number;
  readonly locked: number;
  readonly available: number;
  readonly completed: number;
  readonly active: number;
  readonly failed: number;
  readonly selectedMissionId: string | null;
  readonly open: boolean;
  readonly empty: boolean;
  readonly disposed: boolean;
}

export type MissionPanelRefreshStatus = 'RENDERED' | 'SKIPPED_CLOSED' | 'SKIPPED_UNCHANGED';

export interface MissionPanel {
  readonly version: typeof MISSION_PANEL_VERSION;
  open(): boolean;
  close(): boolean;
  toggle(): boolean;
  /** Explicit re-read. A closed panel returns `SKIPPED_CLOSED` and touches nothing. */
  refresh(): MissionPanelRefreshStatus;
  isOpen(): boolean;
  /** Inspect one mission. A pure view change: no read, no progress, no attempt, no reset. */
  selectMission(missionId: string): boolean;
  getSelectedMissionId(): string | null;
  getView(): MissionPanelView | null;
  getSnapshot(): MissionPanelSnapshot | null;
  getTrigger(): HTMLButtonElement;
  getPanel(): HTMLElement;
  getStats(): MissionPanelStats;
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
const ITEM_STYLE = 'border:1px solid #2d4a3f;border-radius:0.375rem;padding:0.35rem 0.5rem;';
const SELECT_STYLE =
  'appearance:none;border:0;background:transparent;color:#f3f7fb;font:inherit;text-align:left;' +
  'width:100%;padding:0.25rem 0;cursor:pointer;display:flex;justify-content:space-between;gap:0.5rem;';
const DETAILS_STYLE = 'padding:0.25rem 0 0.35rem;border-top:1px solid #2d4a3f;margin-top:0.35rem;';
const OBJECTIVES_STYLE = 'list-style:none;margin:0.25rem 0 0.5rem;padding:0;';
const OBJECTIVE_STYLE = 'margin:0 0 0.4rem;';
const BAR_STYLE = 'height:0.35rem;background:#1c332b;border-radius:0.2rem;overflow:hidden;';
const FILL_STYLE = 'height:100%;background:#9edbb5;';
const NOTE_STYLE = 'font-size:0.8125rem;color:#b9cfc5;';
const LINE_STYLE = 'margin:0.15rem 0;font-size:0.8125rem;';

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

interface MissionNodes {
  readonly item: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly title: HTMLElement;
  readonly state: HTMLElement;
  readonly details: HTMLElement;
  readonly meta: HTMLElement;
  readonly attempt: HTMLElement;
  readonly attempts: HTMLElement;
  readonly prerequisites: HTMLElement;
  readonly failure: HTMLElement;
  readonly objectivesHeading: HTMLElement;
  readonly objectives: HTMLElement;
  readonly limits: HTMLElement;
  readonly replay: HTMLElement;
  readonly rewards: HTMLElement;
  readonly onClick: () => void;
  mounted: boolean;
}

/**
 * 126 mission panel.
 *
 * One native `<button type="button">Misiuni</button>` opens one `role="dialog"` surface. The panel
 * renders exactly one accepted snapshot and offers no mutation at all: `selectMission` only moves a
 * local pointer, so inspecting a locked mission cannot complete it, consume an attempt or reset a
 * ledger entry. Focus moves into the dialog on open, Tab/Shift+Tab stay inside it, Escape closes it
 * and the previous focus is restored. Every listener is attached to an owned element, never to
 * `window` or `document`, so the driving keys keep reaching the game.
 *
 * There is no per-tick path: the panel reads the host port once per open and once per explicit
 * `refresh()`, and it never joins the 3D loop.
 */
export function createMissionPanel(host: HTMLElement, options: MissionPanelOptions): MissionPanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Mission panel requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('Mission panel requires the 116/125 host read port');
  if (typeof options.setSurface !== 'function' && options.setSurface !== undefined)
    throw new Error('Mission panel surface port must be a function');
  const prefix = options.idPrefix ?? 'mission-panel';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 48)
    throw new Error('Mission panel id prefix is invalid');
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
    summary = element('p'),
    note = element('p'),
    body = element('div'),
    list = element('ul');

  root.className = 'mission-panel';
  root.setAttribute('data-version', MISSION_PANEL_VERSION);
  trigger.className = 'mission-panel__trigger';
  trigger.setAttribute('type', 'button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panelId);
  trigger.setAttribute('aria-label', MISSION_PANEL_TEXT.triggerDescription);
  trigger.setAttribute('style', TRIGGER_STYLE);
  trigger.textContent = MISSION_PANEL_TEXT.trigger;
  panel.className = 'mission-panel__dialog';
  panel.setAttribute('id', panelId);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);
  panel.setAttribute('aria-describedby', descriptionId);
  panel.setAttribute('hidden', '');
  panel.setAttribute('data-version', MISSION_PANEL_VERSION);
  panel.setAttribute('data-reads', '0');
  panel.setAttribute('style', DIALOG_STYLE);
  header.className = 'mission-panel__header';
  title.className = 'mission-panel__title';
  title.setAttribute('id', titleId);
  title.textContent = MISSION_PANEL_TEXT.title;
  closeButton.className = 'mission-panel__close';
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', MISSION_PANEL_TEXT.closeDescription);
  closeButton.setAttribute('style', CLOSE_STYLE);
  closeButton.textContent = MISSION_PANEL_TEXT.close;
  description.className = 'mission-panel__description';
  description.setAttribute('id', descriptionId);
  description.textContent = MISSION_PANEL_TEXT.description;
  status.className = 'mission-panel__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  summary.className = 'mission-panel__summary';
  note.className = 'mission-panel__note';
  note.setAttribute('id', noteId);
  note.setAttribute('style', NOTE_STYLE);
  note.textContent = MISSION_PANEL_TEXT.blockedNote;
  body.className = 'mission-panel__body';
  body.setAttribute('id', bodyId);
  body.tabIndex = 0;
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', MISSION_PANEL_TEXT.bodyLabel);
  body.setAttribute('aria-describedby', noteId);
  body.setAttribute('style', BODY_STYLE);
  list.className = 'mission-panel__missions';
  list.setAttribute('style', LIST_STYLE);
  body.append(list);
  header.append(title, closeButton);
  panel.append(header, description, status, summary, body, note);
  root.append(trigger, panel);
  host.append(root);

  let opened = options.open === true,
    disposed = false,
    busy = false,
    previousFocus: HTMLElement | null = null,
    view: MissionPanelView | null = null,
    snapshot: MissionPanelSnapshot | null = null,
    selectedMissionId: string | null = null,
    lastSignature = '',
    opens = 0,
    closes = 0,
    renders = 0,
    reads = 0,
    inspections = 0,
    skippedClosed = 0,
    skippedUnchanged = 0,
    escapes = 0,
    tabWraps = 0,
    focusMoves = 0,
    focusRestores = 0,
    surfaceCalls = 0,
    listeners = 0;

  const missions = new Map<string, MissionNodes>();

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Mission panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Mission panel disposed');
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

  const createMission = (missionId: string): MissionNodes => {
    const item = element('li'),
      button = element('button'),
      titleNode = element('span'),
      stateNode = element('span'),
      details = element('div'),
      meta = line('mission-panel__meta'),
      attempt = line('mission-panel__attempt'),
      attempts = line('mission-panel__attempts'),
      prerequisites = line('mission-panel__prerequisites'),
      failure = line('mission-panel__failure'),
      objectivesHeading = element('h3'),
      objectives = element('ul'),
      limits = line('mission-panel__limits'),
      replay = line('mission-panel__replay'),
      rewards = line('mission-panel__rewards');
    item.className = 'mission-panel__mission';
    item.setAttribute('data-mission-id', missionId);
    item.setAttribute('style', ITEM_STYLE);
    button.className = 'mission-panel__select';
    button.setAttribute('type', 'button');
    button.setAttribute('data-mission-id', missionId);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `${prefix}-details-${missionId}`);
    button.setAttribute('style', SELECT_STYLE);
    titleNode.className = 'mission-panel__mission-title';
    stateNode.className = 'mission-panel__mission-state';
    button.append(titleNode, stateNode);
    details.className = 'mission-panel__details';
    details.setAttribute('id', `${prefix}-details-${missionId}`);
    details.setAttribute('role', 'group');
    details.setAttribute('aria-label', `Detaliile misiunii ${missionId}`);
    details.setAttribute('style', DETAILS_STYLE);
    objectivesHeading.className = 'mission-panel__objectives-heading';
    objectivesHeading.textContent = MISSION_PANEL_TEXT.objectivesHeading;
    objectives.className = 'mission-panel__objectives';
    objectives.setAttribute('style', OBJECTIVES_STYLE);
    failure.className = 'mission-panel__failure';
    replay.className = 'mission-panel__replay';
    details.append(
      meta,
      attempt,
      attempts,
      prerequisites,
      failure,
      objectivesHeading,
      objectives,
      limits,
      replay,
      rewards,
    );
    item.append(button, details);
    const onClick = () => {
      selectMission(missionId);
    };
    button.addEventListener('click', onClick);
    listeners += 1;
    return {
      item,
      button,
      title: titleNode,
      state: stateNode,
      details,
      meta,
      attempt,
      attempts,
      prerequisites,
      failure,
      objectivesHeading,
      objectives,
      limits,
      replay,
      rewards,
      onClick,
      mounted: false,
    };
  };

  const objectiveNode = (objective: MissionPanelObjectiveView): HTMLElement => {
    const item = element('li'),
      label = element('span'),
      state = element('span'),
      bar = element('div'),
      fill = element('span');
    item.className = 'mission-panel__objective';
    item.setAttribute('data-objective-id', objective.objectiveId);
    item.setAttribute('data-kind', objective.kind);
    item.setAttribute(
      'data-state',
      objective.satisfied === null ? 'UNEVALUATED' : objective.satisfied ? 'SATISFIED' : 'PENDING',
    );
    item.setAttribute('style', OBJECTIVE_STYLE);
    label.className = 'mission-panel__objective-label';
    label.textContent = `${objective.kindLabel} · ${objective.label} · ${objective.progressLabel}`;
    state.className = 'mission-panel__objective-state';
    state.textContent = objective.stateLabel;
    bar.className = 'mission-panel__objective-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', objective.description);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(objective.target));
    if (objective.progress === null) bar.setAttribute('aria-valuetext', objective.stateLabel);
    else bar.setAttribute('aria-valuenow', String(objective.progress));
    bar.setAttribute('style', BAR_STYLE);
    fill.className = 'mission-panel__objective-fill';
    fill.setAttribute('aria-hidden', 'true');
    fill.setAttribute('style', `${FILL_STYLE}width:${objective.percent ?? 0}%;`);
    bar.append(fill);
    item.append(label, state, bar);
    return item;
  };

  const renderMission = (nodes: MissionNodes, mission: MissionPanelMissionView) => {
    set(nodes.title, mission.title);
    set(nodes.state, mission.statusLabel);
    attribute(nodes.button, 'aria-label', `${mission.orderLabel}. ${mission.description}`);
    attribute(nodes.button, 'data-state', mission.state);
    attribute(nodes.button, 'data-attempt-state', mission.attemptState ?? 'NONE');
    attribute(
      nodes.button,
      'data-failure',
      mission.failureReason === null ? '' : mission.failureReason,
    );
    attribute(nodes.button, 'data-replay', mission.replayAvailable ? 'true' : 'false');
    attribute(nodes.item, 'data-state', mission.state);
    attribute(nodes.item, 'data-attempt-state', mission.attemptState ?? 'NONE');
    attribute(
      nodes.item,
      'data-failure',
      mission.failureReason === null ? '' : mission.failureReason,
    );
    attribute(nodes.item, 'data-replay', mission.replayAvailable ? 'true' : 'false');
    set(nodes.meta, `${mission.orderLabel} · ${mission.versionLabel}`);
    set(
      nodes.attempt,
      `${MISSION_PANEL_TEXT.labels.attempt}: ${mission.attemptStateLabel} · ${mission.progressLabel}`,
    );
    set(
      nodes.attempts,
      `${MISSION_PANEL_TEXT.labels.attempts}: ${mission.attemptsLabel} · ${mission.nextAttemptLabel}`,
    );
    set(
      nodes.prerequisites,
      mission.missingPrerequisitesLabel.length === 0
        ? `${MISSION_PANEL_TEXT.labels.prerequisites}: ${mission.prerequisitesLabel}`
        : `${MISSION_PANEL_TEXT.labels.prerequisites}: ${mission.prerequisitesLabel} · ${mission.missingPrerequisitesLabel}`,
    );
    if (mission.failureLabel === null) {
      set(nodes.failure, `${MISSION_PANEL_TEXT.labels.failure}: ${MISSION_PANEL_TEXT.none}`);
      nodes.failure.removeAttribute('data-failure');
    } else {
      set(nodes.failure, `${MISSION_PANEL_TEXT.labels.failure}: ${mission.failureLabel}`);
      attribute(nodes.failure, 'data-failure', mission.failureReason ?? '');
      nodes.failure.setAttribute('role', 'note');
    }
    set(nodes.limits, mission.limitsLabel);
    set(nodes.replay, `${MISSION_PANEL_TEXT.labels.replay}: ${mission.replayLabel}`);
    set(nodes.rewards, `${MISSION_PANEL_TEXT.labels.rewards}: ${mission.rewardsLabel}`);
    clear(nodes.objectives);
    for (const objective of mission.objectives) nodes.objectives.append(objectiveNode(objective));
  };

  const applySelection = () => {
    for (const [missionId, nodes] of missions) {
      const selected = missionId === selectedMissionId;
      if (selected) nodes.details.removeAttribute('hidden');
      else if (nodes.details.getAttribute('hidden') === null)
        nodes.details.setAttribute('hidden', '');
      attribute(nodes.button, 'aria-expanded', selected ? 'true' : 'false');
      attribute(nodes.item, 'data-selected', selected ? 'true' : 'false');
    }
    if (view !== null) set(status, `${view.summary} ${MISSION_PANEL_TEXT.readonlyNote}`);
  };

  const render = (next: MissionPanelView) => {
    view = next;
    if (selectedMissionId !== null && !next.missions.some((m) => m.missionId === selectedMissionId))
      selectedMissionId = null;
    if (selectedMissionId === null && next.missions.length > 0)
      selectedMissionId = next.missions[0]!.missionId;
    const ids = new Set(next.missions.map((mission) => mission.missionId));
    for (const [missionId, nodes] of missions) {
      if (ids.has(missionId)) continue;
      nodes.button.removeEventListener('click', nodes.onClick);
      listeners -= 1;
      nodes.item.remove();
      missions.delete(missionId);
    }
    for (const mission of next.missions) {
      let nodes = missions.get(mission.missionId);
      if (nodes === undefined) {
        nodes = createMission(mission.missionId);
        missions.set(mission.missionId, nodes);
      }
      if (!nodes.mounted) {
        list.append(nodes.item);
        nodes.mounted = true;
      }
      renderMission(nodes, mission);
    }
    attribute(panel, 'data-tick', String(snapshot?.tick ?? 0));
    attribute(panel, 'data-missions', String(next.counts.missions));
    attribute(panel, 'data-locked', String(next.counts.locked));
    attribute(panel, 'data-available', String(next.counts.available));
    attribute(panel, 'data-completed', String(next.counts.completed));
    attribute(panel, 'data-active', String(next.counts.active));
    attribute(panel, 'data-failed', String(next.counts.failed));
    attribute(panel, 'data-replayable', String(next.counts.replayable));
    attribute(panel, 'data-empty', next.empty ? 'true' : 'false');
    attribute(panel, 'data-reads', String(reads));
    set(summary, next.summary);
    applySelection();
    lastSignature = next.signature;
    renders += 1;
  };

  const readView = (): MissionPanelView => {
    const next = options.read();
    reads += 1;
    snapshot = next === null ? null : parseMissionPanelSnapshot(next);
    if (snapshot === null) {
      selectedMissionId = null;
      return emptyMissionPanelView();
    }
    // Resolve the selection before projecting, so a re-read of the same campaign produces the same
    // signature and an unchanged refresh is really skipped.
    if (
      selectedMissionId === null ||
      !snapshot.missions.some((mission) => mission.missionId === selectedMissionId)
    )
      selectedMissionId = snapshot.missions[0]?.missionId ?? null;
    return projectMissionPanel(snapshot, { selectedMissionId });
  };

  const focusables = (): HTMLElement[] => [
    closeButton,
    ...[...missions.values()].map((nodes) => nodes.button),
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
      const target =
        (selectedMissionId === null ? undefined : missions.get(selectedMissionId)?.button) ??
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

  function selectMission(missionId: string): boolean {
    let changed = false;
    mutate(() => {
      if (disposed || !opened || view === null) return;
      if (!view.missions.some((mission) => mission.missionId === missionId)) return;
      inspections += 1;
      if (selectedMissionId === missionId) {
        applySelection();
        return;
      }
      selectedMissionId = missionId;
      if (snapshot === null) return;
      render(projectMissionPanel(snapshot, { selectedMissionId }));
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
    version: MISSION_PANEL_VERSION,
    open: openPanel,
    close: closePanel,
    toggle(): boolean {
      return opened ? closePanel() : openPanel();
    },
    refresh(): MissionPanelRefreshStatus {
      let result: MissionPanelRefreshStatus = 'SKIPPED_CLOSED';
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
    selectMission,
    getSelectedMissionId: () => (disposed ? null : selectedMissionId),
    getView: () => (disposed ? null : view),
    getSnapshot: () => (disposed ? null : snapshot),
    getTrigger: () => trigger,
    getPanel: () => panel,
    getStats(): MissionPanelStats {
      const measured = disposed ? { elements: 0, textNodes: 0 } : countTree(root);
      return Object.freeze({
        version: MISSION_PANEL_VERSION,
        elements: measured.elements,
        textNodes: measured.textNodes,
        listeners: disposed ? 0 : listeners,
        globalListeners: 0 as const,
        opens,
        closes,
        renders,
        reads,
        inspections,
        skippedClosed,
        skippedUnchanged,
        escapes,
        tabWraps,
        focusMoves,
        focusRestores,
        surfaceCalls,
        missions: view?.counts.missions ?? 0,
        objectives: view?.counts.evaluatedObjectives ?? 0,
        locked: view?.counts.locked ?? 0,
        available: view?.counts.available ?? 0,
        completed: view?.counts.completed ?? 0,
        active: view?.counts.active ?? 0,
        failed: view?.counts.failed ?? 0,
        selectedMissionId,
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
        for (const nodes of missions.values()) {
          nodes.button.removeEventListener('click', nodes.onClick);
          nodes.item.remove();
        }
        missions.clear();
        view = null;
        snapshot = null;
        selectedMissionId = null;
        root.remove();
      });
    },
  });
}

export type MissionPanelAdapter = ReturnType<typeof createMissionPanel>;
