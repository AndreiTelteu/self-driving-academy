import type { KpiHistorySelection } from '../economy';
import type { KpiHistoryChart, KpiHistoryTable, KpiHistoryView } from './kpi-history-format';
import {
  KPI_HISTORY_TEXT,
  KPI_HISTORY_UI_VERSION,
  emptyKpiHistoryView,
  projectKpiHistory,
} from './kpi-history-format';

export interface KpiHistoryPanelOptions {
  /** The host-composed 209 read: it must return the 210 selection, never a ledger scan. */
  readonly read: () => KpiHistorySelection | null;
  /**
   * 070 panel surface port. The host passes `pauseFocus.setSurface('panel', open)`, so the panel
   * pauses only in MANUAL/LEARNING and stays live in observation AUTO; the popup never pauses the
   * clock itself and never changes the control mode.
   */
  readonly setSurface?: (open: boolean) => void;
  readonly open?: boolean;
  readonly idPrefix?: string;
}

export interface KpiHistoryPanelStats {
  readonly version: typeof KPI_HISTORY_UI_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: number;
  /** Always 0: every listener lives on the trigger, the close button or the dialog itself. */
  readonly globalListeners: 0;
  readonly opens: number;
  readonly closes: number;
  readonly renders: number;
  /** Reads of the 209 read model; one per open and one per accepted refresh. */
  readonly reads: number;
  readonly skippedClosed: number;
  readonly skippedUnchanged: number;
  readonly escapes: number;
  readonly tabWraps: number;
  readonly focusMoves: number;
  readonly focusRestores: number;
  readonly surfaceCalls: number;
  readonly bars: number;
  readonly tableRows: number;
  readonly exactPoints: number;
  readonly visualPoints: number;
  readonly downsampled: boolean;
  readonly open: boolean;
  readonly empty: boolean;
  readonly lastHistoryScans: 0;
  readonly disposed: boolean;
}

export type KpiHistoryRefreshStatus = 'RENDERED' | 'SKIPPED_CLOSED' | 'SKIPPED_UNCHANGED';

export interface KpiHistoryPanel {
  readonly version: typeof KPI_HISTORY_UI_VERSION;
  open(): boolean;
  close(): boolean;
  toggle(): boolean;
  /** Explicit re-read. A closed panel returns `SKIPPED_CLOSED` and touches nothing. */
  refresh(): KpiHistoryRefreshStatus;
  isOpen(): boolean;
  getView(): KpiHistoryView | null;
  getTrigger(): HTMLButtonElement;
  getPanel(): HTMLElement;
  getStats(): KpiHistoryPanelStats;
  dispose(): void;
}

const TRIGGER_STYLE =
  'appearance:none;border:1px solid #2d4a3f;border-radius:0.375rem;background:#1c332b;' +
  'color:#f3f7fb;padding:0.35rem 0.75rem;font:inherit;cursor:pointer;';
const PANEL_STYLE =
  'position:fixed;inset:0;margin:auto;width:min(92vw,58rem);max-height:min(90vh,46rem);' +
  'overflow:auto;padding:1rem 1.25rem 1.5rem;background:#0d1714f2;color:#f3f7fb;' +
  'border:1px solid #2d4a3f;border-radius:0.5rem;z-index:40;box-shadow:0 12px 40px #00000080;';
const BODY_STYLE = 'max-height:min(64vh,30rem);overflow:auto;padding-right:0.25rem;';
const CLOSE_STYLE =
  'appearance:none;border:1px solid #9edbb5;border-radius:0.375rem;background:transparent;' +
  'color:#f3f7fb;padding:0.25rem 0.6rem;font:inherit;cursor:pointer;';
const PLOT_STYLE = 'display:flex;gap:0.25rem;align-items:flex-end;height:6rem;margin:0.25rem 0;';
const CELL_STYLE = 'text-align:left;padding:0.2rem 0.4rem;border-bottom:1px solid #2d4a3f;';
const TABLE_STYLE = 'border-collapse:collapse;width:100%;font-size:0.8125rem;margin:0.5rem 0 1rem;';
const FIGURE_STYLE = 'margin:0 0 1rem;';
const CAPTION_STYLE = 'font-size:0.8125rem;color:#b9cfc5;';
const GROUP_STYLE = 'flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:0.15rem;';
const GROUP_BARS_STYLE = 'display:flex;gap:0.1rem;align-items:flex-end;height:5rem;';
const GROUP_LABEL_STYLE =
  'font-size:0.6875rem;color:#b9cfc5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
const GROUP_VALUE_STYLE = 'font-size:0.6875rem;color:#f3f7fb;';

/** Actual bar: solid token accent; projected bar: outlined, so the series differ beyond colour. */
const ACTUAL_BAR_STYLE = 'flex:1 1 0;min-height:1px;background:#9edbb5;';
const PROJECTED_BAR_STYLE =
  'flex:1 1 0;min-height:1px;background:transparent;border:1px dashed #9edbb5;';
const MISSING_BAR_STYLE =
  'flex:1 1 0;min-height:1px;background:transparent;border-top:1px dotted #b9cfc5;';

function barStyle(state: string): string {
  if (state === 'PROJECTED') return PROJECTED_BAR_STYLE;
  if (state === 'NO_DATA' || state === 'NO_REVIEWS' || state === 'INSUFFICIENT')
    return MISSING_BAR_STYLE;
  return ACTUAL_BAR_STYLE;
}

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
 * 210 KPI popup adapter. It mounts one native `<button type="button">KPIs</button>` and one
 * `role="dialog"` surface, both built once. The popup has no per-tick path at all: it reads the
 * 209 history exactly once when it opens and only again on an explicit `refresh()` while open, so a
 * closed panel re-reads nothing and rebuilds no chart.
 *
 * Focus moves into the dialog on open, Tab/Shift+Tab stay inside it, Escape closes it and the
 * previous focus (the trigger or whatever opened it) is restored. Every listener is attached to an
 * owned element, never to `window` or `document`, so driving keys keep reaching the game.
 */
export function createKpiHistoryPanel(
  host: HTMLElement,
  options: KpiHistoryPanelOptions,
): KpiHistoryPanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('KPI history popup requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('KPI history popup requires the 209 read port');
  if (typeof options.setSurface !== 'function' && options.setSurface !== undefined)
    throw new Error('KPI history popup surface port must be a function');
  const prefix = options.idPrefix ?? 'kpi-history';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 48)
    throw new Error('KPI history popup id prefix is invalid');
  const panelId = `${prefix}-dialog`,
    titleId = `${prefix}-title`,
    descriptionId = `${prefix}-description`,
    bodyId = `${prefix}-body`;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);

  const root = element('div'),
    trigger = element('button'),
    panel = element('section'),
    header = element('header'),
    title = element('h2'),
    closeButton = element('button'),
    description = element('p'),
    body = element('div'),
    status = element('p'),
    summary = element('p'),
    projection = element('p'),
    projectionDetail = element('p'),
    downsampling = element('p'),
    emptyNote = element('p'),
    chartsHost = element('div'),
    tablesHost = element('div');

  root.className = 'kpi-history';
  root.setAttribute('data-version', KPI_HISTORY_UI_VERSION);
  trigger.className = 'kpi-history__trigger';
  trigger.setAttribute('type', 'button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panelId);
  trigger.setAttribute('aria-label', KPI_HISTORY_TEXT.triggerDescription);
  trigger.setAttribute('style', TRIGGER_STYLE);
  trigger.textContent = KPI_HISTORY_TEXT.trigger;
  panel.className = 'kpi-history__panel';
  panel.setAttribute('id', panelId);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);
  panel.setAttribute('aria-describedby', descriptionId);
  panel.setAttribute('hidden', '');
  panel.setAttribute('data-version', KPI_HISTORY_UI_VERSION);
  panel.setAttribute('data-history-scans', '0');
  panel.setAttribute('style', PANEL_STYLE);
  header.className = 'kpi-history__header';
  title.className = 'kpi-history__title';
  title.setAttribute('id', titleId);
  title.textContent = KPI_HISTORY_TEXT.title;
  closeButton.className = 'kpi-history__close';
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', KPI_HISTORY_TEXT.closeDescription);
  closeButton.setAttribute('style', CLOSE_STYLE);
  closeButton.textContent = KPI_HISTORY_TEXT.close;
  description.className = 'kpi-history__description';
  description.setAttribute('id', descriptionId);
  description.textContent = KPI_HISTORY_TEXT.description;
  body.className = 'kpi-history__body';
  body.setAttribute('id', bodyId);
  body.tabIndex = 0;
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', KPI_HISTORY_TEXT.bodyLabel);
  body.setAttribute('style', BODY_STYLE);
  status.className = 'kpi-history__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  summary.className = 'kpi-history__summary';
  projection.className = 'kpi-history__projection';
  projection.setAttribute('role', 'note');
  projectionDetail.className = 'kpi-history__projection-detail';
  downsampling.className = 'kpi-history__downsampling';
  emptyNote.className = 'kpi-history__empty';
  emptyNote.setAttribute('hidden', '');
  emptyNote.textContent = KPI_HISTORY_TEXT.empty;
  chartsHost.className = 'kpi-history__charts';
  tablesHost.className = 'kpi-history__tables';
  header.append(title, closeButton);
  body.append(
    status,
    summary,
    projection,
    projectionDetail,
    downsampling,
    emptyNote,
    chartsHost,
    tablesHost,
  );
  panel.append(header, description, body);
  root.append(trigger, panel);
  host.append(root);

  let opened = options.open === true,
    disposed = false,
    busy = false,
    previousFocus: HTMLElement | null = null,
    view: KpiHistoryView | null = null,
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

  const mutate = (action: () => void) => {
    if (busy) throw new Error('KPI history popup reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('KPI history popup disposed');
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

  const chartFigure = (chart: KpiHistoryChart): HTMLElement => {
    const figure = element('figure'),
      caption = element('figcaption'),
      plot = element('div'),
      note = element('p');
    figure.className = 'kpi-history__chart';
    figure.setAttribute('data-chart', chart.key);
    figure.setAttribute('style', FIGURE_STYLE);
    caption.className = 'kpi-history__chart-caption';
    caption.textContent = `${chart.title} · ${chart.unitLabel}`;
    plot.className = 'kpi-history__chart-plot';
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', `${chart.title}. ${chart.summary}`);
    plot.setAttribute('data-chart', chart.key);
    plot.setAttribute('data-state', chart.state);
    plot.setAttribute('data-groups', String(chart.groups.length));
    plot.setAttribute('style', PLOT_STYLE);
    for (const group of chart.groups) {
      const groupNode = element('div'),
        label = element('span'),
        bars = element('div'),
        values = element('span');
      groupNode.className = 'kpi-history__chart-group';
      groupNode.setAttribute('data-key', group.key);
      groupNode.setAttribute('style', GROUP_STYLE);
      label.className = 'kpi-history__chart-group-label';
      label.setAttribute('style', GROUP_LABEL_STYLE);
      label.textContent = group.label;
      bars.className = 'kpi-history__chart-bars';
      bars.setAttribute('style', GROUP_BARS_STYLE);
      for (const bar of group.bars) {
        const node = element('span');
        node.className = 'kpi-history__chart-bar';
        node.setAttribute('data-series', bar.series);
        node.setAttribute('data-state', bar.state);
        node.setAttribute('data-value', bar.value === null ? '' : String(bar.value));
        node.setAttribute('aria-hidden', 'true');
        node.setAttribute('title', bar.title);
        node.setAttribute('style', `${barStyle(bar.state)}height:${bar.percent}%;`);
        bars.append(node);
      }
      values.className = 'kpi-history__chart-group-value';
      values.setAttribute('style', GROUP_VALUE_STYLE);
      values.textContent = group.bars.map((bar) => bar.display).join(' / ');
      if (group.note.length > 0) label.setAttribute('title', group.note);
      groupNode.append(label, bars, values);
      plot.append(groupNode);
    }
    note.className = 'kpi-history__chart-note';
    note.setAttribute('style', CAPTION_STYLE);
    note.textContent = chart.caption;
    figure.append(caption, plot, note);
    return figure;
  };

  const tableNode = (table: KpiHistoryTable): HTMLElement => {
    const node = element('table'),
      caption = element('caption'),
      head = element('thead'),
      headRow = element('tr'),
      tbody = element('tbody');
    node.className = 'kpi-history__table';
    node.setAttribute('data-table', table.key);
    node.setAttribute('style', TABLE_STYLE);
    caption.className = 'kpi-history__table-caption';
    caption.setAttribute('style', CAPTION_STYLE);
    caption.textContent = table.caption;
    headRow.className = 'kpi-history__table-head';
    for (const header of table.headers) {
      const cell = element('th');
      cell.setAttribute('scope', 'col');
      cell.setAttribute('style', CELL_STYLE);
      cell.textContent = header;
      headRow.append(cell);
    }
    head.append(headRow);
    for (let index = 0; index < table.rows.length; index += 1) {
      const row = table.rows[index]!,
        rowKey = table.rowKeys[index] ?? String(index),
        rowState = table.rowStates[index] ?? '',
        rowNode = element('tr');
      rowNode.className = 'kpi-history__table-row';
      rowNode.setAttribute('data-key', rowKey);
      rowNode.setAttribute('data-state', rowState);
      for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
        const cell = element(cellIndex === 0 ? 'th' : 'td');
        if (cellIndex === 0) cell.setAttribute('scope', 'row');
        cell.setAttribute('style', CELL_STYLE);
        cell.textContent = row[cellIndex] ?? '';
        rowNode.append(cell);
      }
      tbody.append(rowNode);
    }
    node.append(caption, head, tbody);
    return node;
  };

  const render = (next: KpiHistoryView) => {
    view = next;
    lastSignature = next.signature;
    renders += 1;
    set(status, next.summary);
    set(summary, next.empty ? KPI_HISTORY_TEXT.empty : next.totals.monthsLabel);
    set(projection, `${next.projection.headline} · ${next.projection.projectedLabel}`);
    set(projectionDetail, `${next.projection.detail} ${next.projection.windowLabel}`);
    set(downsampling, next.downsampling.label);
    if (next.empty) emptyNote.removeAttribute('hidden');
    else emptyNote.setAttribute('hidden', '');
    clear(chartsHost);
    clear(tablesHost);
    for (const chart of next.charts) chartsHost.append(chartFigure(chart));
    for (const table of next.tables) tablesHost.append(tableNode(table));
    attribute(panel, 'data-tick', String(next.tick));
    attribute(panel, 'data-months', String(next.months.length));
    attribute(panel, 'data-exact-points', String(next.downsampling.exactPoints));
    attribute(panel, 'data-visual-points', String(next.downsampling.visualPoints));
    attribute(panel, 'data-downsampled', next.downsampling.downsampled ? 'true' : 'false');
    attribute(panel, 'data-empty', next.empty ? 'true' : 'false');
    attribute(panel, 'data-projection', next.projection.status);
    attribute(panel, 'data-history-scans', String(next.historyScans));
  };

  const readSelection = (): KpiHistoryView => {
    const selection = options.read();
    reads += 1;
    return selection === null ? emptyKpiHistoryView() : projectKpiHistory(selection);
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
    stops[next]?.focus();
  }

  function openPanel(): boolean {
    let changed = false;
    mutate(() => {
      assertLive();
      if (opened) return;
      previousFocus = canFocus(doc.activeElement) ? doc.activeElement : null;
      const next = readSelection();
      render(next);
      opened = true;
      opens += 1;
      panel.removeAttribute('hidden');
      attribute(trigger, 'aria-expanded', 'true');
      surfaceCalls += 1;
      options.setSurface?.(true);
      closeButton.focus();
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
      target.focus();
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
  listeners = 3;
  if (opened) {
    opened = false;
    openPanel();
  }

  return Object.freeze({
    version: KPI_HISTORY_UI_VERSION,
    open: openPanel,
    close: closePanel,
    toggle(): boolean {
      return opened ? closePanel() : openPanel();
    },
    refresh(): KpiHistoryRefreshStatus {
      let result: KpiHistoryRefreshStatus = 'SKIPPED_CLOSED';
      mutate(() => {
        assertLive();
        if (!opened) {
          skippedClosed += 1;
          result = 'SKIPPED_CLOSED';
          return;
        }
        const next = readSelection();
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
    getTrigger: () => trigger,
    getPanel: () => panel,
    getStats(): KpiHistoryPanelStats {
      const measured = disposed ? { elements: 0, textNodes: 0 } : countTree(root);
      return Object.freeze({
        version: KPI_HISTORY_UI_VERSION,
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
        bars:
          view === null
            ? 0
            : view.charts.reduce(
                (total, chart) =>
                  total + chart.groups.reduce((count, group) => count + group.bars.length, 0),
                0,
              ),
        tableRows:
          view === null ? 0 : view.tables.reduce((total, table) => total + table.rows.length, 0),
        exactPoints: view?.downsampling.exactPoints ?? 0,
        visualPoints: view?.downsampling.visualPoints ?? 0,
        downsampled: view?.downsampling.downsampled ?? false,
        open: opened,
        empty: view?.empty ?? true,
        lastHistoryScans: 0 as const,
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
        view = null;
        root.remove();
      });
    },
  });
}

export type KpiHistoryPanelAdapter = ReturnType<typeof createKpiHistoryPanel>;
