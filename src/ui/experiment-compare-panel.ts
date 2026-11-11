import type { ExperimentCompareReady } from '../experiments';
import type {
  ExperimentCompareChart,
  ExperimentCompareTable,
  ExperimentCompareView,
} from './experiment-compare-format';
import {
  EXPERIMENT_COMPARE_TEXT,
  EXPERIMENT_COMPARE_UI_VERSION,
  emptyExperimentCompareView,
  projectExperimentCompare,
} from './experiment-compare-format';

export interface ExperimentComparePanelOptions {
  /** The finished 143 read model; it must never read a rerun or a ledger on open. */
  readonly read: () => ExperimentCompareReady | null;
  /**
   * 070 panel surface port. The host passes `pauseFocus.setSurface('panel', open)`, so the panel
   * pauses only in MANUAL/LEARNING and stays live in observation AUTO; the popup never pauses the
   * clock itself and never changes the control mode.
   */
  readonly setSurface?: (open: boolean) => void;
  readonly open?: boolean;
  readonly idPrefix?: string;
}

export interface ExperimentComparePanelStats {
  readonly version: typeof EXPERIMENT_COMPARE_UI_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: number;
  /** Always 0: every listener lives on the trigger, the close button or the dialog itself. */
  readonly globalListeners: 0;
  readonly opens: number;
  readonly closes: number;
  readonly renders: number;
  /** Reads of the comparison read model; one per open and one per accepted refresh. */
  readonly reads: number;
  readonly skippedClosed: number;
  readonly skippedUnchanged: number;
  readonly escapes: number;
  readonly tabWraps: number;
  readonly focusMoves: number;
  readonly focusRestores: number;
  readonly surfaceCalls: number;
  readonly charts: number;
  readonly bars: number;
  readonly tables: number;
  readonly tableRows: number;
  readonly coexisting: number;
  readonly seeds: number;
  readonly open: boolean;
  readonly empty: boolean;
  readonly disposed: boolean;
}

export type ExperimentCompareRefreshStatus = 'RENDERED' | 'SKIPPED_CLOSED' | 'SKIPPED_UNCHANGED';

export interface ExperimentComparePanel {
  readonly version: typeof EXPERIMENT_COMPARE_UI_VERSION;
  open(): boolean;
  close(): boolean;
  toggle(): boolean;
  /** Explicit re-read. A closed panel returns `SKIPPED_CLOSED` and touches nothing. */
  refresh(): ExperimentCompareRefreshStatus;
  isOpen(): boolean;
  getView(): ExperimentCompareView | null;
  getTrigger(): HTMLButtonElement;
  getPanel(): HTMLElement;
  getStats(): ExperimentComparePanelStats;
  dispose(): void;
}

const TRIGGER_STYLE =
  'appearance:none;border:1px solid #2d4a3f;border-radius:0.375rem;background:#1c332b;' +
  'color:#f3f7fb;padding:0.35rem 0.75rem;font:inherit;cursor:pointer;';
const PANEL_STYLE =
  'position:fixed;inset:0;margin:auto;width:min(94vw,64rem);max-height:min(90vh,48rem);' +
  'overflow:auto;padding:1rem 1.25rem 1.5rem;background:#0d1714f2;color:#f3f7fb;' +
  'border:1px solid #2d4a3f;border-radius:0.5rem;z-index:42;box-shadow:0 12px 40px #00000080;';
const BODY_STYLE = 'max-height:min(66vh,32rem);overflow:auto;padding-right:0.25rem;';
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
const SECTION_STYLE = 'margin:0 0 1rem;';
const SECTION_TITLE_STYLE = 'font-size:0.9375rem;margin:0.75rem 0 0.25rem;';
const LIMITATION_STYLE = 'font-size:0.8125rem;color:#b9cfc5;margin:0.15rem 0 0;';

/** A counted bar is solid; an invisible/zero bar is outlined, so the series differ beyond colour. */
const VALUE_BAR_STYLE = 'flex:1 1 0;min-height:1px;background:#9edbb5;';
const ZERO_BAR_STYLE =
  'flex:1 1 0;min-height:1px;background:transparent;border-top:1px dotted #b9cfc5;';
const INVISIBLE_BAR_STYLE =
  'flex:1 1 0;min-height:1px;background:transparent;border:1px dashed #9edbb5;';

function barStyle(series: string, state: string): string {
  if (state === 'ZERO') return ZERO_BAR_STYLE;
  return series === 'INVISIBLE' ? INVISIBLE_BAR_STYLE : VALUE_BAR_STYLE;
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
 * 143 comparison panel. It mounts one native `<button type="button">Comparație A/B</button>` and one
 * `role="dialog"` surface, both built once. The panel has no per-tick path: it reads the finished
 * comparison exactly once when it opens and only again on an explicit `refresh()` while open, so a
 * closed panel re-reads nothing and rebuilds no chart.
 *
 * Focus moves into the dialog on open, Tab/Shift+Tab stay inside it, Escape closes it and the
 * previous focus (the trigger or whatever opened it) is restored. Every listener is attached to an
 * owned element, never to `window` or `document`, so driving keys keep reaching the game.
 */
export function createExperimentComparePanel(
  host: HTMLElement,
  options: ExperimentComparePanelOptions,
): ExperimentComparePanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Experiment compare panel requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('Experiment compare panel requires the 143 read port');
  if (typeof options.setSurface !== 'function' && options.setSurface !== undefined)
    throw new Error('Experiment compare panel surface port must be a function');
  const prefix = options.idPrefix ?? 'experiment-compare';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 48)
    throw new Error('Experiment compare panel id prefix is invalid');
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
    summaryDetail = element('p'),
    windowNote = element('p'),
    seedNote = element('p'),
    exposureNote = element('p'),
    attributionNote = element('p'),
    uncertaintyStatus = element('p'),
    uncertaintyStatement = element('p'),
    uncertaintySpread = element('p'),
    limitations = element('ul'),
    coexistenceNote = element('p'),
    isolatedNote = element('p'),
    metricsNote = element('p'),
    emptyNote = element('p'),
    chartsHost = element('div'),
    tablesHost = element('div');

  root.className = 'experiment-compare';
  root.setAttribute('data-version', EXPERIMENT_COMPARE_UI_VERSION);
  trigger.className = 'experiment-compare__trigger';
  trigger.setAttribute('type', 'button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panelId);
  trigger.setAttribute('aria-label', EXPERIMENT_COMPARE_TEXT.triggerDescription);
  trigger.setAttribute('style', TRIGGER_STYLE);
  trigger.textContent = EXPERIMENT_COMPARE_TEXT.trigger;
  panel.className = 'experiment-compare__panel';
  panel.setAttribute('id', panelId);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);
  panel.setAttribute('aria-describedby', descriptionId);
  panel.setAttribute('hidden', '');
  panel.setAttribute('data-version', EXPERIMENT_COMPARE_UI_VERSION);
  panel.setAttribute('data-empty', 'true');
  panel.setAttribute('style', PANEL_STYLE);
  header.className = 'experiment-compare__header';
  title.className = 'experiment-compare__title';
  title.setAttribute('id', titleId);
  title.textContent = EXPERIMENT_COMPARE_TEXT.title;
  closeButton.className = 'experiment-compare__close';
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', EXPERIMENT_COMPARE_TEXT.closeDescription);
  closeButton.setAttribute('style', CLOSE_STYLE);
  closeButton.textContent = EXPERIMENT_COMPARE_TEXT.close;
  description.className = 'experiment-compare__description';
  description.setAttribute('id', descriptionId);
  description.textContent = EXPERIMENT_COMPARE_TEXT.description;
  body.className = 'experiment-compare__body';
  body.setAttribute('id', bodyId);
  body.tabIndex = 0;
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', EXPERIMENT_COMPARE_TEXT.bodyLabel);
  body.setAttribute('style', BODY_STYLE);
  status.className = 'experiment-compare__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  summary.className = 'experiment-compare__summary';
  summary.setAttribute('data-row', 'summary');
  summaryDetail.className = 'experiment-compare__summary-detail';
  windowNote.className = 'experiment-compare__window';
  windowNote.setAttribute('data-row', 'window');
  seedNote.className = 'experiment-compare__seeds';
  seedNote.setAttribute('data-row', 'seeds');
  exposureNote.className = 'experiment-compare__exposure';
  exposureNote.setAttribute('data-row', 'exposure');
  attributionNote.className = 'experiment-compare__attribution';
  attributionNote.setAttribute('data-row', 'attribution');
  uncertaintyStatus.className = 'experiment-compare__uncertainty-status';
  uncertaintyStatus.setAttribute('data-row', 'uncertainty-status');
  uncertaintyStatement.className = 'experiment-compare__uncertainty';
  uncertaintyStatement.setAttribute('data-row', 'uncertainty');
  uncertaintySpread.className = 'experiment-compare__uncertainty-spread';
  uncertaintySpread.setAttribute('data-row', 'uncertainty-spread');
  limitations.className = 'experiment-compare__limitations';
  limitations.setAttribute('data-row', 'limitations');
  coexistenceNote.className = 'experiment-compare__coexistence-note';
  coexistenceNote.setAttribute('data-row', 'coexistence-note');
  coexistenceNote.textContent = EXPERIMENT_COMPARE_TEXT.coexistenceNote;
  isolatedNote.className = 'experiment-compare__isolated-note';
  isolatedNote.setAttribute('data-row', 'isolated-note');
  isolatedNote.textContent = EXPERIMENT_COMPARE_TEXT.isolatedNote;
  metricsNote.className = 'experiment-compare__metrics-note';
  metricsNote.setAttribute('data-row', 'metrics-note');
  metricsNote.textContent = EXPERIMENT_COMPARE_TEXT.metricsNote;
  emptyNote.className = 'experiment-compare__empty';
  emptyNote.setAttribute('hidden', '');
  emptyNote.textContent = EXPERIMENT_COMPARE_TEXT.empty;
  chartsHost.className = 'experiment-compare__charts';
  chartsHost.setAttribute('data-host', 'charts');
  tablesHost.className = 'experiment-compare__tables';
  tablesHost.setAttribute('data-host', 'tables');
  header.append(title, closeButton);
  body.append(
    emptyNote,
    status,
    summary,
    summaryDetail,
    windowNote,
    seedNote,
    exposureNote,
    attributionNote,
    uncertaintyStatus,
    uncertaintyStatement,
    uncertaintySpread,
    limitations,
    coexistenceNote,
    isolatedNote,
    metricsNote,
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
    view: ExperimentCompareView | null = null,
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
    if (busy) throw new Error('Experiment compare panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Experiment compare panel disposed');
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

  const chartFigure = (chart: ExperimentCompareChart): HTMLElement => {
    const figure = element('figure'),
      caption = element('figcaption'),
      plot = element('div'),
      note = element('p');
    figure.className = 'experiment-compare__chart';
    figure.setAttribute('data-chart', chart.key);
    figure.setAttribute('style', FIGURE_STYLE);
    caption.className = 'experiment-compare__chart-caption';
    caption.textContent = `${chart.title} · ${chart.unitLabel}`;
    plot.className = 'experiment-compare__chart-plot';
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
      groupNode.className = 'experiment-compare__chart-group';
      groupNode.setAttribute('data-key', group.key);
      groupNode.setAttribute('style', GROUP_STYLE);
      label.className = 'experiment-compare__chart-group-label';
      label.setAttribute('style', GROUP_LABEL_STYLE);
      label.textContent = group.label;
      bars.className = 'experiment-compare__chart-bars';
      bars.setAttribute('style', GROUP_BARS_STYLE);
      for (const bar of group.bars) {
        const node = element('span');
        node.className = 'experiment-compare__chart-bar';
        node.setAttribute('data-series', bar.series);
        node.setAttribute('data-state', bar.state);
        node.setAttribute('data-value', String(bar.value));
        node.setAttribute('aria-hidden', 'true');
        node.setAttribute('title', bar.title);
        node.setAttribute('style', `${barStyle(bar.series, bar.state)}height:${bar.percent}%;`);
        bars.append(node);
      }
      values.className = 'experiment-compare__chart-group-value';
      values.setAttribute('style', GROUP_VALUE_STYLE);
      values.textContent = group.bars.map((bar) => bar.display).join(' / ');
      if (group.note.length > 0) label.setAttribute('title', group.note);
      groupNode.append(label, bars, values);
      plot.append(groupNode);
    }
    note.className = 'experiment-compare__chart-note';
    note.setAttribute('style', CAPTION_STYLE);
    note.textContent = chart.caption;
    figure.append(caption, plot, note);
    return figure;
  };

  const tableNode = (table: ExperimentCompareTable): HTMLElement => {
    const section = element('section'),
      heading = element('h3'),
      node = element('table'),
      caption = element('caption'),
      head = element('thead'),
      headRow = element('tr'),
      tbody = element('tbody');
    section.className = 'experiment-compare__section';
    section.setAttribute('data-section', table.key);
    section.setAttribute('style', SECTION_STYLE);
    heading.className = 'experiment-compare__section-title';
    heading.setAttribute('style', SECTION_TITLE_STYLE);
    heading.textContent = table.caption;
    node.className = 'experiment-compare__table';
    node.setAttribute('data-table', table.key);
    node.setAttribute('style', TABLE_STYLE);
    caption.className = 'experiment-compare__table-caption';
    caption.setAttribute('style', CAPTION_STYLE);
    caption.textContent = table.caption;
    headRow.className = 'experiment-compare__table-head';
    for (const headerCell of table.headers) {
      const cell = element('th');
      cell.setAttribute('scope', 'col');
      cell.setAttribute('style', CELL_STYLE);
      cell.textContent = headerCell;
      headRow.append(cell);
    }
    head.append(headRow);
    for (let index = 0; index < table.rows.length; index += 1) {
      const row = table.rows[index]!,
        rowKey = table.rowKeys[index] ?? String(index),
        rowState = table.rowStates[index] ?? '',
        rowNode = element('tr');
      rowNode.className = 'experiment-compare__table-row';
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
    section.append(heading, node);
    return section;
  };

  const render = (next: ExperimentCompareView) => {
    view = next;
    lastSignature = next.signature;
    renders += 1;
    set(status, next.summary.headline);
    set(summary, next.summary.headline);
    set(summaryDetail, next.summary.detail);
    set(windowNote, next.summary.windowLabel);
    set(seedNote, next.summary.seedLabel);
    set(exposureNote, next.summary.exposureLabel);
    set(attributionNote, next.summary.attributionLabel);
    set(uncertaintyStatus, next.uncertainty.statusLabel);
    set(uncertaintyStatement, next.uncertainty.statement);
    set(uncertaintySpread, next.uncertainty.spreadLabel);
    clear(limitations);
    for (const limitation of next.uncertainty.limitations) {
      const item = element('li');
      item.setAttribute('style', LIMITATION_STYLE);
      item.textContent = limitation;
      limitations.append(item);
    }
    if (next.empty) emptyNote.removeAttribute('hidden');
    else emptyNote.setAttribute('hidden', '');
    attribute(coexistenceNote, 'data-visible', next.coexistence.length > 0 ? 'true' : 'false');
    attribute(isolatedNote, 'data-visible', next.isolated.length > 0 ? 'true' : 'false');
    attribute(metricsNote, 'data-visible', next.metrics.length > 0 ? 'true' : 'false');
    clear(chartsHost);
    clear(tablesHost);
    for (const chart of next.charts) chartsHost.append(chartFigure(chart));
    for (const table of next.tables) tablesHost.append(tableNode(table));
    attribute(panel, 'data-empty', next.empty ? 'true' : 'false');
    attribute(panel, 'data-divergent', String(next.counts.divergent));
    attribute(panel, 'data-decisions', String(next.counts.decisions));
    attribute(panel, 'data-cohorts', String(next.counts.cohorts));
    attribute(panel, 'data-visible', String(next.counts.visible));
    attribute(panel, 'data-invisible', String(next.counts.invisible));
    attribute(panel, 'data-seeds', String(next.counts.seeds));
    attribute(panel, 'data-coexisting', String(next.counts.coexisting));
    attribute(panel, 'data-charts', String(next.charts.length));
    attribute(panel, 'data-tables', String(next.tables.length));
    attribute(panel, 'data-signature', next.signature);
    attribute(panel, 'data-uncertainty', next.uncertainty.statusLabel);
  };

  const readView = (): ExperimentCompareView => {
    const read = options.read();
    reads += 1;
    return read === null ? emptyExperimentCompareView() : projectExperimentCompare(read);
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
      const next = readView();
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
    version: EXPERIMENT_COMPARE_UI_VERSION,
    open: openPanel,
    close: closePanel,
    toggle(): boolean {
      return opened ? closePanel() : openPanel();
    },
    refresh(): ExperimentCompareRefreshStatus {
      let result: ExperimentCompareRefreshStatus = 'SKIPPED_CLOSED';
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
    getTrigger: () => trigger,
    getPanel: () => panel,
    getStats(): ExperimentComparePanelStats {
      const measured = disposed ? { elements: 0, textNodes: 0 } : countTree(root);
      return Object.freeze({
        version: EXPERIMENT_COMPARE_UI_VERSION,
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
        charts: view?.charts.length ?? 0,
        bars:
          view === null
            ? 0
            : view.charts.reduce(
                (total, chart) =>
                  total + chart.groups.reduce((count, group) => count + group.bars.length, 0),
                0,
              ),
        tables: view?.tables.length ?? 0,
        tableRows:
          view === null ? 0 : view.tables.reduce((total, table) => total + table.rows.length, 0),
        coexisting: view?.coexistence.length ?? 0,
        seeds: view?.counts.seeds ?? 0,
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
        view = null;
        root.remove();
      });
    },
  });
}

export type ExperimentComparePanelAdapter = ReturnType<typeof createExperimentComparePanel>;
