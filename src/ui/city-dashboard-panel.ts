import type { CityDashboardSnapshot, CityIncidentPositionM } from './city-dashboard-format';
import { CITY_DASHBOARD_LIMITS } from './city-dashboard-format';
import { createCityDashboard } from './city-dashboard';

/**
 * 267 host surface for the delivered 082 city dashboard.
 *
 * The 082 adapter owns the seven indicators, the incidents and the drilldown; this wrapper only
 * gives it a real open/close surface for the live game: a native close button, focus moved into the
 * dashboard, Tab/Shift+Tab kept inside, Escape closing and the previous focus restored. It adds no
 * metric, incident or simulation state.
 *
 * The panel is a projection: while it is closed it neither reads the host port nor writes the DOM.
 * While it is open the host read is capped at 10 Hz, and a visible 082 frame is the only thing
 * written. No listener is attached to `window` or `document`.
 */
export const CITY_DASHBOARD_PANEL_VERSION = '267-city-dashboard-panel-v1' as const;
export const CITY_DASHBOARD_PANEL_REFRESH_MS = 100;

export interface CityDashboardPanelOptions {
  readonly read: () => CityDashboardSnapshot | null;
  readonly setSurface?: (open: boolean) => void;
  readonly onClose?: () => void;
  readonly now?: () => number;
  readonly maximumHz?: number;
  readonly focus?: (incidentId: string, positionM: CityIncidentPositionM) => boolean;
  readonly idPrefix?: string;
}

export type CityDashboardPanelStatus =
  'RENDERED' | 'SKIPPED_CLOSED' | 'SKIPPED_EMPTY' | 'THROTTLED';

export interface CityDashboardPanelStats {
  readonly version: typeof CITY_DASHBOARD_PANEL_VERSION;
  readonly open: boolean;
  readonly reads: number;
  readonly opens: number;
  readonly closes: number;
  readonly renders: number;
  readonly skippedClosed: number;
  readonly skippedEmpty: number;
  readonly throttled: number;
  readonly escapes: number;
  readonly tabWraps: number;
  readonly focusMoves: number;
  readonly focusRestores: number;
  readonly surfaceCalls: number;
  readonly listeners: number;
  readonly globalListeners: 0;
  readonly dashboard: ReturnType<ReturnType<typeof createCityDashboard>['getStats']>;
  readonly disposed: boolean;
}

export interface CityDashboardPanel {
  readonly version: typeof CITY_DASHBOARD_PANEL_VERSION;
  open(): boolean;
  close(): boolean;
  toggle(): boolean;
  /** Host refresh; a closed panel returns `SKIPPED_CLOSED` and reads nothing. */
  update(nowMs: number): CityDashboardPanelStatus;
  refresh(nowMs?: number): CityDashboardPanelStatus;
  isOpen(): boolean;
  getElement(): HTMLElement;
  getDashboard(): ReturnType<typeof createCityDashboard>;
  getStats(): CityDashboardPanelStats;
  dispose(): void;
}

const PANEL_STYLE =
  'position:fixed;inset:0;margin:auto;width:min(92vw,58rem);max-height:min(90vh,46rem);' +
  'overflow:hidden;padding:0;background:#0d1714f2;color:#f3f7fb;border:1px solid #2d4a3f;' +
  'border-radius:0.5rem;z-index:40;box-shadow:0 12px 40px #00000080;';
const HEADER_STYLE =
  'display:flex;align-items:center;justify-content:space-between;gap:0.75rem;' +
  'padding:0.75rem 1rem 0.5rem;border-bottom:1px solid #2d4a3f;';
const BODY_STYLE = 'max-height:min(76vh,38rem);overflow:auto;padding:0.75rem 1rem 1rem;';
const CLOSE_STYLE =
  'appearance:none;border:1px solid #9edbb5;border-radius:0.375rem;background:transparent;' +
  'color:#f3f7fb;padding:0.25rem 0.6rem;font:inherit;cursor:pointer;';

function canFocus(node: unknown): node is HTMLElement {
  return (
    typeof node === 'object' &&
    node !== null &&
    typeof (node as HTMLElement).focus === 'function' &&
    typeof (node as HTMLElement).getAttribute === 'function'
  );
}

/** Native tab stops of the dashboard in DOM order, recomputed after every render. */
function focusableButtons(root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  const visit = (node: HTMLElement): void => {
    if (node.tagName?.toLowerCase() === 'button') {
      if (node.hasAttribute('disabled') || node.hidden) return;
      if (node.getAttribute('tabindex') === '-1') return;
      if (node.getAttribute('aria-hidden') === 'true') return;
      found.push(node);
    }
    for (const child of [...(node.children ?? [])] as HTMLElement[]) visit(child);
  };
  visit(root);
  return found;
}

export function createCityDashboardPanel(
  host: HTMLElement,
  options: CityDashboardPanelOptions,
): CityDashboardPanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('City dashboard panel requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('City dashboard panel requires the 082 read port');
  if (options.setSurface !== undefined && typeof options.setSurface !== 'function')
    throw new Error('City dashboard panel surface port must be a function');
  if (options.onClose !== undefined && typeof options.onClose !== 'function')
    throw new Error('City dashboard panel close port must be a function');
  const prefix = options.idPrefix ?? 'city-dashboard';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 48)
    throw new Error('City dashboard panel id prefix is invalid');
  const maximumHz = options.maximumHz ?? 10;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('City dashboard panel write rate');
  if (maximumHz > CITY_DASHBOARD_LIMITS.maximumHz)
    throw new Error('City dashboard panel rate exceeds the 082 ceiling');
  const now = options.now ?? (() => performance.now());
  const interval = 1000 / maximumHz;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    closeButton = element('button'),
    body = element('div'),
    dashboardHost = element('div'),
    titleId = `${prefix}-title`,
    descriptionId = `${prefix}-description`,
    description = element('p');
  root.className = 'city-dashboard-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', titleId);
  root.setAttribute('aria-describedby', descriptionId);
  root.setAttribute('data-version', CITY_DASHBOARD_PANEL_VERSION);
  root.setAttribute('hidden', '');
  root.setAttribute('data-history-scans', '0');
  root.setAttribute('style', PANEL_STYLE);
  header.className = 'city-dashboard-panel__header';
  header.setAttribute('style', HEADER_STYLE);
  title.className = 'city-dashboard-panel__title';
  title.setAttribute('id', titleId);
  title.textContent = 'Tabloul orașului';
  closeButton.className = 'city-dashboard-panel__close';
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', 'Închide tabloul orașului');
  closeButton.setAttribute('style', CLOSE_STYLE);
  closeButton.textContent = 'Închide';
  body.className = 'city-dashboard-panel__body';
  body.setAttribute('style', BODY_STYLE);
  dashboardHost.className = 'city-dashboard-panel__dashboard';
  description.className = 'city-dashboard-panel__description';
  description.setAttribute('id', descriptionId);
  description.textContent =
    'Tabloul citește exclusiv read model-urile reale: curse 061, incidente 028 și sănătatea 065. ' +
    'Indisponibil nu este zero, iar selectarea unui incident nu schimbă profilul, camera sau fizica.';
  header.append(title, closeButton);
  dashboardHost.append(description);
  body.append(dashboardHost);
  root.append(header, body);
  host.append(root);

  const dashboard = createCityDashboard(dashboardHost, {
    ...(options.maximumHz === undefined ? {} : { maximumHz: options.maximumHz }),
    ...(options.focus === undefined ? {} : { focus: options.focus }),
  });

  let opened = false,
    disposed = false,
    busy = false,
    previousFocus: HTMLElement | null = null,
    lastReadAt: number | null = null,
    lastDashboardRenders = 0,
    reads = 0,
    opens = 0,
    closes = 0,
    renders = 0,
    skippedClosed = 0,
    skippedEmpty = 0,
    throttled = 0,
    escapes = 0,
    tabWraps = 0,
    focusMoves = 0,
    focusRestores = 0,
    surfaceCalls = 0;

  const mutate = (action: () => void) => {
    if (busy) throw new Error('City dashboard panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('City dashboard panel disposed');
  };
  const focusStops = (): HTMLElement[] => [closeButton, ...focusableButtons(dashboardHost)];

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || !opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      escapes += 1;
      closePanel(true);
      return;
    }
    if (event.key !== 'Tab') return;
    const stops = focusStops(),
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

  const readAndRender = (): CityDashboardPanelStatus => {
    const snapshot = options.read();
    reads += 1;
    if (snapshot === null) {
      skippedEmpty += 1;
      return 'SKIPPED_EMPTY';
    }
    dashboard.update(snapshot, now());
    const dashboardStats = dashboard.getStats();
    if (dashboardStats.renders !== lastDashboardRenders) {
      lastDashboardRenders = dashboardStats.renders;
      renders += 1;
      return 'RENDERED';
    }
    return 'THROTTLED';
  };

  function openPanel(): boolean {
    let changed = false;
    mutate(() => {
      assertLive();
      if (opened) return;
      previousFocus = canFocus(doc.activeElement) ? doc.activeElement : null;
      opened = true;
      opens += 1;
      lastReadAt = null;
      root.removeAttribute('hidden');
      surfaceCalls += 1;
      options.setSurface?.(true);
      readAndRender();
      lastReadAt = now();
      closeButton.focus();
      focusMoves += 1;
      changed = true;
    });
    return changed;
  }

  function closePanel(restoreFocus: boolean): boolean {
    let changed = false;
    mutate(() => {
      assertLive();
      if (!opened) return;
      opened = false;
      closes += 1;
      root.setAttribute('hidden', '');
      surfaceCalls += 1;
      options.setSurface?.(false);
      if (restoreFocus) {
        const target = canFocus(previousFocus) ? previousFocus : null;
        if (target !== null) {
          target.focus();
          focusRestores += 1;
        }
      }
      previousFocus = null;
      options.onClose?.();
      changed = true;
    });
    return changed;
  }

  const onCloseClick = () => {
    if (disposed) return;
    closePanel(true);
  };
  closeButton.addEventListener('click', onCloseClick);
  root.addEventListener('keydown', onKeyDown);

  return Object.freeze({
    version: CITY_DASHBOARD_PANEL_VERSION,
    open: openPanel,
    close(): boolean {
      return closePanel(true);
    },
    toggle(): boolean {
      return opened ? closePanel(true) : openPanel();
    },
    update(nowMs: number): CityDashboardPanelStatus {
      if (disposed) throw new Error('City dashboard panel disposed');
      if (!opened) {
        skippedClosed += 1;
        return 'SKIPPED_CLOSED';
      }
      if (!Number.isFinite(nowMs)) throw new Error('City dashboard panel clock');
      if (lastReadAt !== null && nowMs - lastReadAt < interval) {
        throttled += 1;
        return 'THROTTLED';
      }
      lastReadAt = nowMs;
      return readAndRender();
    },
    refresh(nowMs?: number): CityDashboardPanelStatus {
      if (disposed) throw new Error('City dashboard panel disposed');
      if (!opened) {
        skippedClosed += 1;
        return 'SKIPPED_CLOSED';
      }
      const at = nowMs ?? now();
      if (!Number.isFinite(at)) throw new Error('City dashboard panel clock');
      lastReadAt = at;
      return readAndRender();
    },
    isOpen: () => opened,
    getElement: () => root,
    getDashboard: () => dashboard,
    getStats(): CityDashboardPanelStats {
      return Object.freeze({
        version: CITY_DASHBOARD_PANEL_VERSION,
        open: opened,
        reads,
        opens,
        closes,
        renders,
        skippedClosed,
        skippedEmpty,
        throttled,
        escapes,
        tabWraps,
        focusMoves,
        focusRestores,
        surfaceCalls,
        listeners: disposed ? 0 : 2 + dashboard.getStats().listeners,
        globalListeners: 0 as const,
        dashboard: dashboard.getStats(),
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
        closeButton.removeEventListener('click', onCloseClick);
        root.removeEventListener('keydown', onKeyDown);
        dashboard.dispose();
        root.remove();
        previousFocus = null;
      });
    },
  });
}

export type CityDashboardPanelAdapter = ReturnType<typeof createCityDashboardPanel>;
