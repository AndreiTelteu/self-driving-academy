import type { CompanyEvolutionOutcome, CompanyEvolutionRead } from '../economy';
import type {
  CompanyDashboardChart,
  CompanyDashboardOfferCard,
  CompanyDashboardTable,
  CompanyDashboardUpgradeCard,
  CompanyDashboardView,
} from './company-dashboard-format';
import {
  COMPANY_DASHBOARD_REFRESH_MS,
  COMPANY_DASHBOARD_TEXT,
  COMPANY_DASHBOARD_UI_VERSION,
  emptyCompanyDashboardView,
  projectCompanyDashboard,
} from './company-dashboard-format';

/**
 * PBI 270 company dashboard adapter.
 *
 * The panel is a projection over the real 268/269 ports. It never owns a ledger, a fleet or a
 * second store: `read()` returns the existing `company().evolution` read model, and a purchase or
 * an upgrade is executed only by the injected `purchase`/`upgrade` commands of that same evolution.
 *
 * Cost rules:
 * - a closed panel never calls `read()` and never writes a node; `update()` reports
 *   `SKIPPED_CLOSED` without touching the view;
 * - while open it re-reads at most 10 Hz and skips a render when the signature is unchanged;
 * - every listener lives on the dialog itself; there is no `window`/`document` listener;
 * - the refresh throttle and the bounded 12-month/7-category/16-offer lists keep the per-update work
 *   bounded.
 *
 * Focus, Tab, Escape and pause follow the other panels: focus enters the dialog on open, Tab and
 * Shift+Tab wrap inside it, Escape closes through the injected surface port, and the previous focus
 * is restored on close.
 */
export const COMPANY_DASHBOARD_PANEL_VERSION = '270-company-dashboard-panel-v1' as const;

export type CompanyDashboardRefreshStatus =
  'RENDERED' | 'SKIPPED_CLOSED' | 'SKIPPED_THROTTLED' | 'SKIPPED_UNCHANGED';

export type CompanyDashboardActionStatus =
  'PENDING' | 'BLOCKED' | 'ACCEPTED' | 'REJECTED' | 'UNAVAILABLE' | 'CLOSED' | 'NONE' | 'CANCELLED';

export interface CompanyDashboardOptions {
  /** The existing `company().evolution` read model; never a ledger scan or a second source. */
  readonly read: () => CompanyEvolutionRead | null;
  /** The existing 269 purchase command; absent means the panel keeps the list read-only. */
  readonly purchase?: (offerId: string) => CompanyEvolutionOutcome | null;
  /** The existing 269 upgrade command; absent means the panel keeps the list read-only. */
  readonly upgrade?: (upgradeId: string) => CompanyEvolutionOutcome | null;
  /** 070 surface port, usually `(open) => shell.openPanel('company')` / `shell.closePanel()`. */
  readonly setSurface?: (open: boolean) => void;
  /** Called after the dialog is hidden and focus restored; the host may return focus to the canvas. */
  readonly onClose?: () => void;
  readonly now?: () => number;
  readonly refreshIntervalMs?: number;
  readonly idPrefix?: string;
}

export interface CompanyDashboardStats {
  readonly version: typeof COMPANY_DASHBOARD_PANEL_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: number;
  readonly globalListeners: 0;
  readonly opens: number;
  readonly closes: number;
  readonly renders: number;
  readonly reads: number;
  readonly skippedClosed: number;
  readonly skippedThrottled: number;
  readonly skippedUnchanged: number;
  readonly escapes: number;
  readonly tabWraps: number;
  readonly focusMoves: number;
  readonly focusRestores: number;
  readonly surfaceCalls: number;
  readonly commands: number;
  readonly acceptedPurchases: number;
  readonly acceptedUpgrades: number;
  readonly blockedCommands: number;
  readonly refusals: number;
  readonly bars: number;
  readonly tableRows: number;
  readonly offers: number;
  readonly upgrades: number;
  readonly pendingEffects: number;
  readonly open: boolean;
  readonly empty: boolean;
  readonly noHistory: boolean;
  readonly lastHistoryScans: 0;
  /** Structural proof: the closed branch never calls `read()`. */
  readonly closedReads: 0;
  readonly disposed: boolean;
}

export interface CompanyDashboardActionResult {
  readonly status: CompanyDashboardActionStatus;
  readonly reason: string | null;
  readonly detail: string | null;
}

export interface CompanyDashboard {
  readonly version: typeof COMPANY_DASHBOARD_PANEL_VERSION;
  open(): boolean;
  close(): boolean;
  toggle(): boolean;
  /** Explicit read; a closed panel returns `SKIPPED_CLOSED` without reading or rendering. */
  refresh(): CompanyDashboardRefreshStatus;
  /** Called once per presented frame; a closed panel is untouched. */
  update(nowMs?: number): CompanyDashboardRefreshStatus;
  isOpen(): boolean;
  getView(): CompanyDashboardView | null;
  getPanel(): HTMLElement;
  requestPurchase(offerId: string): CompanyDashboardActionResult;
  requestUpgrade(upgradeId: string): CompanyDashboardActionResult;
  confirm(): CompanyDashboardActionResult;
  cancel(): CompanyDashboardActionResult;
  getStats(): CompanyDashboardStats;
  dispose(): void;
}

const ID_PREFIX_MAX = 48;

const STYLE_TEXT = `
.company-dashboard { position: fixed; inset: 0; margin: auto; width: min(94vw, 72rem);
  max-height: min(92vh, 52rem); overflow: auto; padding: 1rem 1.25rem 1.5rem; background: #0d1714f2;
  color: #f3f7fb; border: 1px solid #2d4a3f; border-radius: 0.5rem; z-index: 45;
  box-shadow: 0 12px 40px #00000080; font: 0.84rem/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.company-dashboard[hidden] { display: none; }
.company-dashboard__header { display: flex; align-items: flex-start; gap: 0.75rem; }
.company-dashboard__header h2 { margin: 0; font-size: 1.1rem; }
.company-dashboard__close { margin-left: auto; }
.company-dashboard button { font: inherit; color: #f3f7fb; background: #17352b;
  border: 1px solid #3d6b58; border-radius: 0.35rem; padding: 0.3rem 0.6rem; cursor: pointer; }
.company-dashboard button:hover { background: #22503f; }
.company-dashboard button:disabled { color: #8aa197; background: #102a22; cursor: not-allowed; }
.company-dashboard button:focus-visible, .company-dashboard__body:focus-visible {
  outline: 3px solid #9edbb5; outline-offset: 2px; }
.company-dashboard__description, .company-dashboard__note, .company-dashboard__caption {
  color: #b9cfc5; font-size: 0.78rem; }
.company-dashboard__status { margin: 0.5rem 0; color: #ffd27f; }
.company-dashboard__status[data-tone="success"] { color: #9edbb5; }
.company-dashboard__status[data-tone="error"] { color: #ffb3a7; }
.company-dashboard__body { margin-top: 0.5rem; }
.company-dashboard h3 { margin: 1rem 0 0.35rem; font-size: 0.95rem; color: #9edbb5; }
.company-dashboard__metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.45rem; margin: 0; }
.company-dashboard__metric { padding: 0.4rem 0.55rem; background: #13251f;
  border: 1px solid #2d4a3f; border-radius: 0.35rem; }
.company-dashboard__metric dt { color: #b9cfc5; font-size: 0.75rem; }
.company-dashboard__metric dd { margin: 0.1rem 0 0; font-weight: 600; }
.company-dashboard__metric[data-negative="true"] dd { color: #ffb3a7; }
.company-dashboard__plot { display: flex; gap: 0.3rem; align-items: flex-end; height: 8rem;
  margin: 0.35rem 0; padding: 0.25rem; background: #10231d; border: 1px solid #2d4a3f;
  border-radius: 0.35rem; overflow-x: auto; }
.company-dashboard__group { flex: 1 1 0; min-width: 2.6rem; display: flex; flex-direction: column;
  gap: 0.2rem; height: 100%; justify-content: flex-end; }
.company-dashboard__bars { display: flex; gap: 0.1rem; align-items: flex-end; height: 5.5rem; }
.company-dashboard__bar { flex: 1 1 0; min-height: 1px; border-radius: 0.15rem 0.15rem 0 0; }
.company-dashboard__bar[data-series="REVENUE"] { background: #9edbb5; }
.company-dashboard__bar[data-series="COST"] { background: #ffd27f; }
.company-dashboard__bar[data-series="PROFIT"] { background: #7fd7ff; }
.company-dashboard__bar[data-state="NEGATIVE"] { background: #ffb3a7; }
.company-dashboard__bar[data-state="ZERO"] { background: #b9cfc5; min-height: 2px; }
.company-dashboard__bar[data-state="NO_DATA"] { background: transparent;
  border-top: 1px dotted #b9cfc5; }
.company-dashboard__group-label { color: #b9cfc5; font-size: 0.75rem; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.company-dashboard__group-value { color: #f3f7fb; font-size: 0.75rem; overflow-wrap: anywhere; }
.company-dashboard__table { width: 100%; border-collapse: collapse; font-size: 0.78rem;
  margin: 0.35rem 0 0.5rem; }
.company-dashboard__table caption { text-align: left; color: #b9cfc5; font-size: 0.76rem;
  padding-bottom: 0.2rem; }
.company-dashboard__table th, .company-dashboard__table td { text-align: left; padding: 0.22rem 0.35rem;
  border-bottom: 1px solid #2d4a3f; vertical-align: top; }
.company-dashboard__table th { color: #9edbb5; font-weight: 600; }
.company-dashboard__table tr[data-state="NO_DATA"] td { color: #b9cfc5; }
.company-dashboard__table tr[data-state="PARTIAL"] td { color: #ffd27f; }
.company-dashboard__list { list-style: none; margin: 0.25rem 0; padding: 0; display: grid; gap: 0.4rem; }
.company-dashboard__card { padding: 0.45rem 0.55rem; background: #13251f; border: 1px solid #2d4a3f;
  border-radius: 0.35rem; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.2rem 0.75rem; }
.company-dashboard__card-title { font-weight: 600; }
.company-dashboard__card-meta { color: #b9cfc5; font-size: 0.78rem; }
.company-dashboard__card-state { color: #ffd27f; font-size: 0.78rem; }
.company-dashboard__card[data-state="AVAILABLE"] .company-dashboard__card-state { color: #9edbb5; }
.company-dashboard__card[data-state="OWNED"] .company-dashboard__card-state { color: #7fd7ff; }
.company-dashboard__card button { align-self: start; }
.company-dashboard__confirmation { margin: 0.5rem 0; padding: 0.5rem 0.6rem; background: #1c332b;
  border: 1px solid #9edbb5; border-radius: 0.35rem; }
.company-dashboard__confirmation-actions { display: flex; gap: 0.5rem; margin-top: 0.35rem; }
.company-dashboard__effects { margin: 0.25rem 0; padding-left: 1.1rem; color: #c6dbd1; }
`;

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

function isDisabled(node: HTMLElement): boolean {
  return (node as HTMLButtonElement).disabled === true || node.hasAttribute('disabled');
}

function focusables(root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  const visit = (node: HTMLElement): void => {
    if (node.hidden) return;
    const tag = node.tagName.toLowerCase();
    if ((tag === 'button' || node.tabIndex >= 0) && !isDisabled(node)) found.push(node);
    for (const child of node.children) visit(child as HTMLElement);
  };
  visit(root);
  return found;
}

function parentOf(node: HTMLElement): HTMLElement | null {
  const withParent = node as HTMLElement & {
    parentElement?: HTMLElement | null;
    parent?: HTMLElement | null;
  };
  return withParent.parentElement ?? withParent.parent ?? null;
}

/**
 * Mounts only the dialog. The native `Companie` button belongs to the shell host, so there is a
 * single trigger and the shell owns the visible bar. The dialog is built once and re-rendered only
 * after an accepted read/command whose signature changed.
 */
export function createCompanyDashboard(
  host: HTMLElement,
  options: CompanyDashboardOptions,
): CompanyDashboard {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Company dashboard requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('Company dashboard requires the company read port');
  if (options.setSurface !== undefined && typeof options.setSurface !== 'function')
    throw new Error('Company dashboard surface port must be a function');
  if (options.purchase !== undefined && typeof options.purchase !== 'function')
    throw new Error('Company dashboard purchase port must be a function');
  if (options.upgrade !== undefined && typeof options.upgrade !== 'function')
    throw new Error('Company dashboard upgrade port must be a function');
  const prefix = options.idPrefix ?? 'company-dashboard';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > ID_PREFIX_MAX)
    throw new Error('Company dashboard id prefix is invalid');
  const refreshIntervalMs = options.refreshIntervalMs ?? COMPANY_DASHBOARD_REFRESH_MS;
  if (!Number.isFinite(refreshIntervalMs) || refreshIntervalMs < 0)
    throw new Error('Company dashboard refresh interval is invalid');
  const now = options.now ?? (() => performance.now());
  const titleId = `${prefix}-title`,
    descriptionId = `${prefix}-description`,
    bodyId = `${prefix}-body`,
    confirmationId = `${prefix}-confirmation`;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);

  const panel = element('section'),
    header = element('header'),
    title = element('h2'),
    closeButton = element('button'),
    description = element('p'),
    status = element('p'),
    confirmation = element('div'),
    confirmationText = element('p'),
    confirmationActions = element('div'),
    confirmButton = element('button'),
    cancelButton = element('button'),
    body = element('div'),
    metricsSection = element('section'),
    metricsTitle = element('h3'),
    metricsList = element('dl'),
    levelParagraph = element('p'),
    chartSection = element('section'),
    chartTitle = element('h3'),
    chartFigure = element('figure'),
    chartCaption = element('figcaption'),
    chartPlot = element('div'),
    chartNote = element('p'),
    tablesSection = element('section'),
    tablesTitle = element('h3'),
    tablesHost = element('div'),
    rideSection = element('section'),
    rideTitle = element('h3'),
    rideHost = element('div'),
    offersSection = element('section'),
    offersTitle = element('h3'),
    offersNote = element('p'),
    offersList = element('ul'),
    upgradesSection = element('section'),
    upgradesTitle = element('h3'),
    upgradesNote = element('p'),
    upgradesList = element('ul'),
    effectsSection = element('section'),
    effectsTitle = element('h3'),
    effectsList = element('ul'),
    refusalParagraph = element('p'),
    emptyNote = element('p'),
    historyNote = element('p');

  panel.className = 'company-dashboard';
  panel.setAttribute('id', `${prefix}-dialog`);
  panel.setAttribute('data-company-dashboard', COMPANY_DASHBOARD_UI_VERSION);
  panel.setAttribute('data-history-scans', '0');
  panel.setAttribute('aria-labelledby', titleId);
  panel.setAttribute('aria-describedby', descriptionId);
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('style', 'position:fixed;inset:0;margin:auto;');
  panel.hidden = true;
  header.className = 'company-dashboard__header';
  title.id = titleId;
  title.textContent = COMPANY_DASHBOARD_TEXT.title;
  closeButton.type = 'button';
  closeButton.className = 'company-dashboard__close';
  closeButton.textContent = COMPANY_DASHBOARD_TEXT.close;
  closeButton.setAttribute('aria-label', COMPANY_DASHBOARD_TEXT.closeDescription);
  closeButton.setAttribute('data-company-action', 'close');
  closeButton.setAttribute('data-company-focus', 'close');
  header.append(title, closeButton);
  description.id = descriptionId;
  description.className = 'company-dashboard__description';
  description.textContent = COMPANY_DASHBOARD_TEXT.description;
  status.className = 'company-dashboard__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  confirmation.id = confirmationId;
  confirmation.className = 'company-dashboard__confirmation';
  confirmation.setAttribute('role', 'group');
  confirmation.setAttribute('aria-labelledby', `${confirmationId}-text`);
  confirmation.hidden = true;
  confirmation.setAttribute('hidden', '');
  confirmationText.id = `${confirmationId}-text`;
  confirmationActions.className = 'company-dashboard__confirmation-actions';
  confirmButton.type = 'button';
  confirmButton.textContent = COMPANY_DASHBOARD_TEXT.confirm;
  confirmButton.setAttribute('data-company-action', 'confirm');
  confirmButton.setAttribute('data-company-focus', 'confirm');
  cancelButton.type = 'button';
  cancelButton.textContent = COMPANY_DASHBOARD_TEXT.cancel;
  cancelButton.setAttribute('data-company-action', 'cancel');
  cancelButton.setAttribute('data-company-focus', 'cancel');
  confirmationActions.append(confirmButton, cancelButton);
  confirmation.append(confirmationText, confirmationActions);
  body.className = 'company-dashboard__body';
  body.id = bodyId;
  body.tabIndex = 0;
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', COMPANY_DASHBOARD_TEXT.bodyLabel);
  body.setAttribute('data-company-focus', 'body');
  chartFigure.className = 'company-dashboard__figure';
  chartCaption.className = 'company-dashboard__caption';
  chartPlot.className = 'company-dashboard__plot';
  chartPlot.setAttribute('role', 'img');
  chartNote.className = 'company-dashboard__note';
  offersNote.className = 'company-dashboard__note';
  offersNote.textContent =
    'Ofertele sunt one-time și se plătesc din cash-ul real al companiei. O ofertă blocată nu poate fi cumpărată.';
  upgradesNote.className = 'company-dashboard__note';
  upgradesNote.textContent =
    'Upgrade-urile sunt versionate și reduc o singură categorie de cost de la începutul lunii următoare; istoricul nu este rescris.';
  offersList.className = 'company-dashboard__list';
  upgradesList.className = 'company-dashboard__list';
  effectsList.className = 'company-dashboard__effects';
  emptyNote.className = 'company-dashboard__note';
  historyNote.className = 'company-dashboard__note';
  metricsList.className = 'company-dashboard__metrics';
  metricsTitle.textContent = 'Indicatori companie';
  chartTitle.textContent = 'Grafic lunar';
  tablesTitle.textContent = 'Tabele';
  rideTitle.textContent = COMPANY_DASHBOARD_TEXT.lastRideLabel;
  offersTitle.textContent = COMPANY_DASHBOARD_TEXT.investmentsLabel;
  upgradesTitle.textContent = COMPANY_DASHBOARD_TEXT.upgradesLabel;
  effectsTitle.textContent = COMPANY_DASHBOARD_TEXT.pendingLabel;
  metricsSection.append(metricsTitle, metricsList, levelParagraph);
  chartFigure.append(chartCaption, chartPlot, chartNote);
  chartSection.append(chartTitle, chartFigure);
  tablesSection.append(tablesTitle, tablesHost);
  rideSection.append(rideTitle, rideHost);
  offersSection.append(offersTitle, offersNote, offersList);
  upgradesSection.append(upgradesTitle, upgradesNote, upgradesList);
  effectsSection.append(effectsTitle, effectsList);
  body.append(
    status,
    confirmation,
    emptyNote,
    historyNote,
    metricsSection,
    chartSection,
    tablesSection,
    rideSection,
    offersSection,
    upgradesSection,
    effectsSection,
    refusalParagraph,
  );
  panel.append(header, description, body);
  host.append(panel);

  let styleElement: HTMLElement | null = null;
  if (doc.head !== undefined && doc.head !== null) {
    styleElement = doc.createElement('style');
    styleElement.setAttribute('data-company-dashboard-style', COMPANY_DASHBOARD_PANEL_VERSION);
    styleElement.textContent = STYLE_TEXT;
    doc.head.append(styleElement);
  }

  let opened = false,
    disposed = false,
    busy = false,
    previousFocus: HTMLElement | null = null,
    view: CompanyDashboardView | null = null,
    lastSignature = '',
    lastReadAt = -Infinity,
    notice: string | null = null,
    noticeTone: 'info' | 'success' | 'error' = 'info',
    pending: { readonly kind: 'PURCHASE' | 'UPGRADE'; readonly id: string } | null = null,
    pendingTrigger: HTMLElement | null = null,
    focusNodes = new Map<string, HTMLElement>(),
    opens = 0,
    closes = 0,
    renders = 0,
    reads = 0,
    skippedClosed = 0,
    skippedThrottled = 0,
    skippedUnchanged = 0,
    escapes = 0,
    tabWraps = 0,
    focusMoves = 0,
    focusRestores = 0,
    surfaceCalls = 0,
    commands = 0,
    acceptedPurchases = 0,
    acceptedUpgrades = 0,
    blockedCommands = 0,
    refusals = 0,
    listeners = 0;

  const mutate = (action: () => void): void => {
    if (busy) throw new Error('Company dashboard reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = (): void => {
    if (disposed) throw new Error('Company dashboard disposed');
  };
  const canFocus = (node: unknown): node is HTMLElement =>
    typeof node === 'object' &&
    node !== null &&
    typeof (node as HTMLElement).focus === 'function' &&
    typeof (node as HTMLElement).getAttribute === 'function';
  const set = (node: HTMLElement, value: string): void => {
    if (node.textContent === value) return;
    node.textContent = value;
  };
  const clear = (node: HTMLElement): void => {
    for (const child of [...node.children]) child.remove();
  };
  const setNotice = (value: string | null, tone: 'info' | 'success' | 'error' = 'info'): void => {
    notice = value;
    noticeTone = tone;
    set(status, value ?? view?.summary ?? COMPANY_DASHBOARD_TEXT.empty);
    status.setAttribute('data-tone', tone);
  };
  const hideConfirmation = (): void => {
    pending = null;
    pendingTrigger = null;
    confirmation.hidden = true;
    confirmation.setAttribute('hidden', '');
    set(confirmationText, '');
  };
  const showConfirmation = (text: string, trigger: HTMLElement): void => {
    confirmation.hidden = false;
    confirmation.removeAttribute('hidden');
    set(confirmationText, text);
    pendingTrigger = trigger;
    confirmButton.focus();
    focusMoves += 1;
  };
  const actionFrom = (
    target: unknown,
  ): { action: string; key: string; node: HTMLElement } | null => {
    let node = target as HTMLElement | null;
    while (node !== null && node !== panel) {
      const action = node.getAttribute('data-company-action');
      if (action !== null)
        return {
          action,
          key: node.getAttribute('data-company-key') ?? '',
          node,
        };
      node = parentOf(node);
    }
    return null;
  };

  const metricCard = (label: string, value: string, negative = false): HTMLElement => {
    const card = element('div'),
      term = element('dt'),
      detail = element('dd');
    card.className = 'company-dashboard__metric';
    if (negative) card.setAttribute('data-negative', 'true');
    term.textContent = label;
    detail.textContent = value;
    card.append(term, detail);
    return card;
  };

  const chartNode = (chart: CompanyDashboardChart): void => {
    clear(chartPlot);
    chartPlot.setAttribute('aria-label', chart.summary);
    chartPlot.setAttribute('data-state', chart.state);
    chartCaption.textContent = `${chart.title} · ${chart.unitLabel}`;
    chartNote.textContent = chart.caption;
    for (const group of chart.groups) {
      const groupNode = element('div'),
        bars = element('div'),
        label = element('span'),
        value = element('span');
      groupNode.className = 'company-dashboard__group';
      groupNode.setAttribute('data-key', group.key);
      groupNode.setAttribute('data-state', group.state);
      bars.className = 'company-dashboard__bars';
      for (const bar of group.bars) {
        const node = element('span');
        node.className = 'company-dashboard__bar';
        node.setAttribute('data-series', bar.series);
        node.setAttribute('data-state', bar.state);
        node.setAttribute('data-value', bar.value === null ? '' : String(bar.value));
        node.setAttribute('aria-hidden', 'true');
        node.setAttribute('title', bar.title);
        node.style.height = `${bar.percent}%`;
        bars.append(node);
      }
      label.className = 'company-dashboard__group-label';
      label.textContent = group.label;
      if (group.state === 'PARTIAL')
        label.setAttribute('title', COMPANY_DASHBOARD_TEXT.partialNote);
      value.className = 'company-dashboard__group-value';
      value.textContent = group.bars.map((bar) => bar.display).join(' / ');
      groupNode.append(label, bars, value);
      chartPlot.append(groupNode);
    }
  };

  const tableNode = (table: CompanyDashboardTable): HTMLElement => {
    const node = element('table'),
      caption = element('caption'),
      head = element('thead'),
      headRow = element('tr'),
      tbody = element('tbody');
    node.className = 'company-dashboard__table';
    node.setAttribute('data-table', table.key);
    caption.textContent = table.caption;
    for (const headerText of table.headers) {
      const cell = element('th');
      cell.setAttribute('scope', 'col');
      cell.textContent = headerText;
      headRow.append(cell);
    }
    head.append(headRow);
    for (let index = 0; index < table.rows.length; index += 1) {
      const row = table.rows[index]!,
        tr = element('tr');
      tr.setAttribute('data-key', table.rowKeys[index] ?? String(index));
      tr.setAttribute('data-state', table.rowStates[index] ?? '');
      for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
        const cell = element(cellIndex === 0 ? 'th' : 'td');
        if (cellIndex === 0) cell.setAttribute('scope', 'row');
        cell.textContent = row[cellIndex] ?? '';
        tr.append(cell);
      }
      tbody.append(tr);
    }
    node.append(caption, head, tbody);
    return node;
  };

  const cardNode = (
    kind: 'purchase' | 'upgrade',
    card: CompanyDashboardOfferCard | CompanyDashboardUpgradeCard,
    portAvailable: boolean,
  ): HTMLElement => {
    const item = element('li'),
      titleNode = element('span'),
      meta = element('span'),
      state = element('span'),
      button = element('button');
    item.className = 'company-dashboard__card';
    item.setAttribute('data-key', card.key);
    item.setAttribute('data-state', card.state);
    titleNode.className = 'company-dashboard__card-title';
    titleNode.textContent = card.title;
    meta.className = 'company-dashboard__card-meta';
    meta.textContent = `${card.costLabel} · ${card.effectLabel}${
      'effective' in card && card.effective ? ' · efect activ' : ''
    }`;
    state.className = 'company-dashboard__card-state';
    state.textContent =
      card.reasonLabel === null ? card.stateLabel : `${card.stateLabel}: ${card.reasonLabel}`;
    button.type = 'button';
    button.textContent =
      kind === 'purchase' ? COMPANY_DASHBOARD_TEXT.buy : COMPANY_DASHBOARD_TEXT.activate;
    button.disabled = card.blocked || !portAvailable;
    if (button.disabled) button.setAttribute('disabled', '');
    button.setAttribute('data-company-action', kind);
    button.setAttribute('data-company-key', card.key);
    button.setAttribute('data-company-focus', card.key);
    button.setAttribute(
      'aria-label',
      `${kind === 'purchase' ? 'Cumpără' : 'Activează'} ${card.title} pentru ${card.costLabel}`,
    );
    item.append(titleNode, button, meta, state);
    return item;
  };

  const render = (next: CompanyDashboardView): void => {
    const active = doc.activeElement,
      activeKey = canFocus(active) ? active.getAttribute('data-company-focus') : null;
    view = next;
    lastSignature = next.signature;
    renders += 1;
    focusNodes = new Map();
    set(emptyNote, next.empty ? COMPANY_DASHBOARD_TEXT.empty : '');
    emptyNote.hidden = !next.empty;
    set(historyNote, next.noHistory ? COMPANY_DASHBOARD_TEXT.noHistory : '');
    historyNote.hidden = !next.noHistory;
    clear(metricsList);
    metricsList.append(
      metricCard(COMPANY_DASHBOARD_TEXT.revenueLabel, next.metrics.revenueLabel),
      metricCard(COMPANY_DASHBOARD_TEXT.costLabel, next.metrics.costLabel),
      metricCard(
        COMPANY_DASHBOARD_TEXT.profitLabel,
        next.metrics.profitLabel,
        next.metrics.profitNegative,
      ),
      metricCard(COMPANY_DASHBOARD_TEXT.cashLabel, next.metrics.cashLabel),
      metricCard(COMPANY_DASHBOARD_TEXT.fleetValueLabel, next.metrics.fleetValueLabel),
      metricCard(COMPANY_DASHBOARD_TEXT.companyLevelLabel, next.metrics.levelLabel, false),
    );
    set(levelParagraph, `${COMPANY_DASHBOARD_TEXT.levelLabel}: ${next.metrics.levelDetail}`);
    levelParagraph.className = 'company-dashboard__note';
    chartNode(next.chart);
    clear(tablesHost);
    for (const table of next.tables) tablesHost.append(tableNode(table));
    clear(rideHost);
    if (next.lastRide === null) {
      const note = element('p');
      note.className = 'company-dashboard__note';
      note.textContent = COMPANY_DASHBOARD_TEXT.noRide;
      rideHost.append(note);
    } else {
      const ride = next.lastRide,
        meta = element('p'),
        table = element('table'),
        caption = element('caption'),
        head = element('thead'),
        headRow = element('tr'),
        tbody = element('tbody');
      meta.className = 'company-dashboard__note';
      meta.textContent = `${ride.rideId} · tick ${ride.tick} · ${ride.stateLabel} · revenue ${ride.revenueLabel} · costuri ${ride.costLabel} · profit ${ride.profitLabel}`;
      table.className = 'company-dashboard__table';
      table.setAttribute('data-table', 'last-ride');
      caption.textContent = 'Detalierea ultimei curse costate, pe categorie';
      for (const headerText of ['Categorie', 'Cantitate', 'Cost']) {
        const cell = element('th');
        cell.setAttribute('scope', 'col');
        cell.textContent = headerText;
        headRow.append(cell);
      }
      head.append(headRow);
      for (const line of ride.lines) {
        const row = element('tr'),
          category = element('th'),
          quantity = element('td'),
          amount = element('td');
        category.setAttribute('scope', 'row');
        category.textContent = line.categoryLabel;
        quantity.textContent = line.quantityLabel;
        amount.textContent = line.amountLabel;
        row.append(category, quantity, amount);
        tbody.append(row);
      }
      table.append(caption, head, tbody);
      rideHost.append(meta, table);
    }
    clear(offersList);
    for (const card of next.offers) {
      offersList.append(cardNode('purchase', card, options.purchase !== undefined));
      const node = offersList.children[offersList.children.length - 1];
      if (node !== undefined && !card.blocked && options.purchase !== undefined)
        focusNodes.set(card.key, node.children[1] as HTMLElement);
    }
    clear(upgradesList);
    for (const card of next.upgrades) {
      upgradesList.append(cardNode('upgrade', card, options.upgrade !== undefined));
      const node = upgradesList.children[upgradesList.children.length - 1];
      if (node !== undefined && !card.blocked && options.upgrade !== undefined)
        focusNodes.set(card.key, node.children[1] as HTMLElement);
    }
    clear(effectsList);
    if (next.pendingEffects.length === 0) {
      const item = element('li');
      item.textContent = 'Nicio reducere programată.';
      effectsList.append(item);
    } else {
      for (const effect of next.pendingEffects) {
        const item = element('li');
        item.setAttribute('data-key', effect.key);
        item.textContent = `${effect.categoryLabel}: reducere ${effect.reductionLabel} din ${effect.periodLabel} (${effect.upgrades} upgrade-uri).`;
        effectsList.append(item);
      }
    }
    set(refusalParagraph, next.refusalsLabel);
    refusalParagraph.className = 'company-dashboard__note';
    set(status, notice ?? next.summary);
    status.setAttribute('data-tone', notice === null ? 'info' : noticeTone);
    panel.setAttribute('data-tick', String(next.tick));
    panel.setAttribute('data-empty', next.empty ? 'true' : 'false');
    panel.setAttribute('data-no-history', next.noHistory ? 'true' : 'false');
    panel.setAttribute('data-months', String(next.months.length));
    panel.setAttribute('data-offers', String(next.offers.length));
    panel.setAttribute('data-upgrades', String(next.upgrades.length));
    focusNodes.set('close', closeButton);
    focusNodes.set('body', body);
    if (confirmation.hidden) {
      focusNodes.delete('confirm');
      focusNodes.delete('cancel');
    } else {
      focusNodes.set('confirm', confirmButton);
      focusNodes.set('cancel', cancelButton);
    }
    if (activeKey !== null) {
      const node = focusNodes.get(activeKey);
      if (node !== undefined && !node.hidden && !isDisabled(node)) {
        node.focus();
        focusMoves += 1;
      }
    }
  };

  const readSelection = (): CompanyDashboardView => {
    reads += 1;
    const raw = options.read();
    return raw === null ? emptyCompanyDashboardView() : projectCompanyDashboard(raw);
  };

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || !opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      escapes += 1;
      closePanel();
      return;
    }
    if (event.key !== 'Tab') return;
    const stops = focusables(panel),
      active = doc.activeElement as HTMLElement | null,
      index = stops.indexOf(active as HTMLElement);
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

  const onPanelClick = (event: MouseEvent): void => {
    if (disposed || !opened) return;
    const found = actionFrom(event.target);
    if (found === null) return;
    if (found.action === 'close') {
      closePanel();
      return;
    }
    if (found.action === 'purchase') {
      requestPurchase(found.key.replace(/^offer:/, ''));
      return;
    }
    if (found.action === 'upgrade') {
      requestUpgrade(found.key.replace(/^upgrade:/, ''));
      return;
    }
    if (found.action === 'confirm') {
      confirm();
      return;
    }
    if (found.action === 'cancel') cancel();
  };

  const blocked = (reason: string, detail: string | null): CompanyDashboardActionResult => {
    blockedCommands += 1;
    setNotice(`Blocat: ${reason}`, 'error');
    return Object.freeze({ status: 'BLOCKED' as const, reason, detail });
  };

  const requestAction = (
    kind: 'PURCHASE' | 'UPGRADE',
    id: string,
  ): CompanyDashboardActionResult => {
    assertLive();
    if (!opened) {
      skippedClosed += 1;
      return Object.freeze({
        status: 'CLOSED' as const,
        reason: COMPANY_DASHBOARD_TEXT.closed,
        detail: null,
      });
    }
    if (view === null) {
      return Object.freeze({
        status: 'UNAVAILABLE' as const,
        reason: COMPANY_DASHBOARD_TEXT.unavailable,
        detail: null,
      });
    }
    const card =
      kind === 'PURCHASE'
        ? view.offers.find((candidate) => candidate.offerId === id)
        : view.upgrades.find((candidate) => candidate.upgradeId === id);
    if (card === undefined) return blocked('Oferta nu există', `Identitate necunoscută: ${id}`);
    if (card.blocked)
      return blocked(card.stateLabel, card.reasonLabel ?? COMPANY_DASHBOARD_TEXT.blocked);
    const port = kind === 'PURCHASE' ? options.purchase : options.upgrade;
    if (port === undefined) return blocked(COMPANY_DASHBOARD_TEXT.unavailable, null);
    pending = Object.freeze({ kind, id });
    showConfirmation(card.confirmationLabel, focusNodes.get(card.key) ?? closeButton);
    setNotice(`Confirmare necesară: ${card.title} · ${card.costLabel}`, 'info');
    focusNodes.set('confirm', confirmButton);
    focusNodes.set('cancel', cancelButton);
    return Object.freeze({
      status: 'PENDING' as const,
      reason: null,
      detail: card.confirmationLabel,
    });
  };

  const applyOutcome = (
    outcome: CompanyEvolutionOutcome | null,
    kind: 'PURCHASE' | 'UPGRADE',
  ): CompanyDashboardActionResult => {
    if (outcome === null) {
      hideConfirmation();
      setNotice(
        `${COMPANY_DASHBOARD_TEXT.unavailable}: portul ${kind.toLowerCase()} lipsește.`,
        'error',
      );
      return Object.freeze({
        status: 'UNAVAILABLE' as const,
        reason: COMPANY_DASHBOARD_TEXT.unavailable,
        detail: null,
      });
    }
    const next = projectCompanyDashboard(outcome.read),
      title =
        kind === 'PURCHASE'
          ? (next.offers.find((card) => card.offerId === outcome.purchase?.offerId)?.title ??
            outcome.purchase?.offerId ??
            'achiziție')
          : (next.upgrades.find((card) => card.upgradeId === outcome.upgrade?.upgradeId)?.title ??
            outcome.upgrade?.upgradeId ??
            'upgrade');
    hideConfirmation();
    render(next);
    closeButton.focus();
    focusMoves += 1;
    if (outcome.status === 'ACCEPTED') {
      if (kind === 'PURCHASE') acceptedPurchases += 1;
      else acceptedUpgrades += 1;
      setNotice(
        `${kind === 'PURCHASE' ? 'Achiziție acceptată' : 'Upgrade acceptat'}: ${title}.`,
        'success',
      );
      return Object.freeze({
        status: 'ACCEPTED' as const,
        reason: null,
        detail: title,
      });
    }
    refusals += 1;
    const reason = outcome.reason === null ? 'REFUSED' : outcome.reason,
      label =
        outcome.reason === null
          ? 'Comandă refuzată'
          : `${reason}${outcome.detail === null ? '' : `: ${outcome.detail}`}`;
    setNotice(`Refuzat: ${label}`, 'error');
    return Object.freeze({
      status: 'REJECTED' as const,
      reason,
      detail: outcome.detail,
    });
  };

  function requestPurchase(offerId: string): CompanyDashboardActionResult {
    return requestAction('PURCHASE', offerId);
  }

  function requestUpgrade(upgradeId: string): CompanyDashboardActionResult {
    return requestAction('UPGRADE', upgradeId);
  }

  function confirm(): CompanyDashboardActionResult {
    assertLive();
    if (!opened)
      return Object.freeze({
        status: 'CLOSED' as const,
        reason: COMPANY_DASHBOARD_TEXT.closed,
        detail: null,
      });
    if (pending === null)
      return Object.freeze({
        status: 'NONE' as const,
        reason: COMPANY_DASHBOARD_TEXT.pendingNone,
        detail: null,
      });
    const action = pending,
      port = action.kind === 'PURCHASE' ? options.purchase : options.upgrade;
    commands += 1;
    const outcome = port === undefined ? null : port(action.id);
    return applyOutcome(outcome, action.kind);
  }

  function cancel(): CompanyDashboardActionResult {
    assertLive();
    if (pending === null)
      return Object.freeze({
        status: 'NONE' as const,
        reason: COMPANY_DASHBOARD_TEXT.pendingNone,
        detail: null,
      });
    const trigger = pendingTrigger;
    hideConfirmation();
    setNotice('Acțiune anulată.', 'info');
    if (trigger !== null && canFocus(trigger) && !isDisabled(trigger)) {
      trigger.focus();
      focusMoves += 1;
    }
    return Object.freeze({ status: 'CANCELLED' as const, reason: null, detail: null });
  }

  function openPanel(): boolean {
    let changed = false;
    mutate(() => {
      assertLive();
      if (opened) return;
      previousFocus = canFocus(doc.activeElement) ? doc.activeElement : null;
      notice = null;
      const at = now();
      if (!Number.isFinite(at)) throw new Error('Company dashboard clock is invalid');
      const next = readSelection();
      opened = true;
      opens += 1;
      lastReadAt = at;
      panel.hidden = false;
      panel.removeAttribute('hidden');
      panel.setAttribute('aria-hidden', 'false');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      render(next);
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
      hideConfirmation();
      panel.hidden = true;
      panel.setAttribute('hidden', '');
      panel.setAttribute('aria-hidden', 'true');
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      surfaceCalls += 1;
      options.setSurface?.(false);
      const target = canFocus(previousFocus) ? previousFocus : null;
      previousFocus = null;
      if (target !== null) {
        target.focus();
        focusRestores += 1;
      }
      options.onClose?.();
      changed = true;
    });
    return changed;
  }

  const readAndRender = (at: number): CompanyDashboardRefreshStatus => {
    if (!opened) {
      skippedClosed += 1;
      return 'SKIPPED_CLOSED';
    }
    if (!Number.isFinite(at)) throw new Error('Company dashboard clock is invalid');
    lastReadAt = at;
    const next = readSelection();
    if (next.signature === lastSignature) {
      skippedUnchanged += 1;
      return 'SKIPPED_UNCHANGED';
    }
    render(next);
    return 'RENDERED';
  };

  panel.addEventListener('keydown', onKeyDown);
  panel.addEventListener('click', onPanelClick);
  listeners = 2;

  return Object.freeze({
    version: COMPANY_DASHBOARD_PANEL_VERSION,
    open: openPanel,
    close: closePanel,
    toggle(): boolean {
      return opened ? closePanel() : openPanel();
    },
    refresh(): CompanyDashboardRefreshStatus {
      let result: CompanyDashboardRefreshStatus = 'SKIPPED_CLOSED';
      mutate(() => {
        assertLive();
        result = readAndRender(now());
      });
      return result;
    },
    update(nowMs?: number): CompanyDashboardRefreshStatus {
      assertLive();
      if (!opened) {
        skippedClosed += 1;
        return 'SKIPPED_CLOSED';
      }
      const at = nowMs ?? now();
      if (!Number.isFinite(at)) throw new Error('Company dashboard clock is invalid');
      if (at - lastReadAt < refreshIntervalMs) {
        skippedThrottled += 1;
        return 'SKIPPED_THROTTLED';
      }
      let result: CompanyDashboardRefreshStatus = 'SKIPPED_CLOSED';
      mutate(() => {
        result = readAndRender(at);
      });
      return result;
    },
    isOpen: () => !disposed && opened,
    getView: () => (disposed ? null : view),
    getPanel: () => panel,
    requestPurchase,
    requestUpgrade,
    confirm,
    cancel,
    getStats(): CompanyDashboardStats {
      const measured = disposed ? { elements: 0, textNodes: 0 } : countTree(panel);
      return Object.freeze({
        version: COMPANY_DASHBOARD_PANEL_VERSION,
        elements: measured.elements,
        textNodes: measured.textNodes,
        listeners: disposed ? 0 : listeners,
        globalListeners: 0 as const,
        opens,
        closes,
        renders,
        reads,
        skippedClosed,
        skippedThrottled,
        skippedUnchanged,
        escapes,
        tabWraps,
        focusMoves,
        focusRestores,
        surfaceCalls,
        commands,
        acceptedPurchases,
        acceptedUpgrades,
        blockedCommands,
        refusals,
        bars:
          view === null
            ? 0
            : view.chart.groups.reduce((total, group) => total + group.bars.length, 0),
        tableRows:
          view === null ? 0 : view.tables.reduce((total, table) => total + table.rows.length, 0),
        offers: view?.offers.length ?? 0,
        upgrades: view?.upgrades.length ?? 0,
        pendingEffects: view?.pendingEffects.length ?? 0,
        open: opened,
        empty: view?.empty ?? true,
        noHistory: view?.noHistory ?? true,
        lastHistoryScans: 0 as const,
        closedReads: 0 as const,
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
        panel.removeEventListener('keydown', onKeyDown);
        panel.removeEventListener('click', onPanelClick);
        listeners = 0;
        view = null;
        focusNodes = new Map();
        hideConfirmation();
        panel.remove();
        styleElement?.remove();
        styleElement = null;
      });
    },
  });
}
