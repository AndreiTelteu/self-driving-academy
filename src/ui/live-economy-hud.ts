import type { LiveEconomySnapshot } from '../economy';
import {
  LIVE_ECONOMY_TEXT,
  LIVE_ECONOMY_UI_VERSION,
  emptyLiveEconomyView,
  projectLiveEconomy,
  type LiveEconomyView,
} from './live-economy-format';

/**
 * 266 compact live economy HUD.
 *
 * It is a visibility layer, not the 267 KPI popup: it shows the current simulated day/month revenue,
 * rides, rating and exposure, plus the last settlement. The port is read at most 10 Hz, only the
 * changed lines are written and the adapter installs no listener, so driving keys never reach it.
 *
 * Every value comes from the accepted 266 read model. A day without a bucket stays "fără date"; a
 * bucket without reviews keeps the rating unavailable. The HUD never rebuilds the ledger or the
 * chart history (`historyScans` remains structural `0`).
 */
export const LIVE_ECONOMY_HUD_REFRESH_MS = 100;

export type LiveEconomyHudStatus = 'RENDERED' | 'SKIPPED_THROTTLED' | 'SKIPPED_UNCHANGED';

export interface LiveEconomyHudOptions {
  readonly read: () => LiveEconomySnapshot | null;
  readonly now?: () => number;
  readonly visible?: boolean;
}

export interface LiveEconomyHudStats {
  readonly version: typeof LIVE_ECONOMY_UI_VERSION;
  readonly disposed: boolean;
  readonly visible: boolean;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: 0;
  readonly globalListeners: 0;
  readonly updates: number;
  readonly reads: number;
  readonly renders: number;
  readonly writes: number;
  readonly skippedThrottled: number;
  readonly skippedUnchanged: number;
  readonly empty: boolean;
  readonly lastTick: number | null;
  readonly historyScans: 0;
}

export interface LiveEconomyHud {
  readonly version: typeof LIVE_ECONOMY_UI_VERSION;
  /** Called once per presented frame; the 10 Hz interval decides whether the port is read. */
  update(nowMs?: number): LiveEconomyHudStatus;
  refresh(nowMs?: number): LiveEconomyHudStatus;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  getView(): LiveEconomyView | null;
  getElement(): HTMLElement;
  getStats(): LiveEconomyHudStats;
  dispose(): void;
}

const ROOT_STYLE =
  'display:flex;flex-direction:column;gap:0.15rem;' +
  'padding:0.4rem 0.6rem;border-radius:0.4rem;background:rgba(8,20,26,0.78);color:#f3f7fb;' +
  'font:600 11px/1.35 ui-monospace,Consolas,monospace;pointer-events:none;user-select:none;' +
  'white-space:pre-wrap;';
const TITLE_STYLE = 'color:#9fe0c5;font-size:11px;letter-spacing:0.02em;';
const MUTED_STYLE = 'color:#b9cfc5;font-size:10px;font-weight:500;';

export function createLiveEconomyHud(
  host: HTMLElement,
  options: LiveEconomyHudOptions,
): LiveEconomyHud {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Live economy HUD requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('Live economy HUD requires the read port');
  const now = options.now ?? (() => performance.now());

  const root = doc.createElement('section');
  root.className = 'live-economy-hud';
  root.setAttribute('data-live-economy', LIVE_ECONOMY_UI_VERSION);
  root.setAttribute('data-history-scans', '0');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'false');
  root.setAttribute('aria-label', LIVE_ECONOMY_TEXT.heading);
  root.setAttribute('style', ROOT_STYLE);

  const title = doc.createElement('p'),
    day = doc.createElement('p'),
    dayRides = doc.createElement('p'),
    dayRating = doc.createElement('p'),
    dayExtra = doc.createElement('p'),
    month = doc.createElement('p'),
    total = doc.createElement('p'),
    counters = doc.createElement('p'),
    last = doc.createElement('p'),
    empty = doc.createElement('p');
  title.setAttribute('style', TITLE_STYLE);
  title.textContent = LIVE_ECONOMY_TEXT.heading;
  for (const node of [dayRides, dayRating, dayExtra, month, total, counters, last, empty]) {
    node.setAttribute(
      'style',
      node === empty || node === last || node === counters ? MUTED_STYLE : '',
    );
  }
  root.append(title, empty, day, dayRides, dayRating, dayExtra, month, total, counters, last);
  host.append(root);

  let visible = options.visible !== false,
    disposed = false,
    view: LiveEconomyView | null = null,
    lastSignature = '',
    lastWrite = -Infinity,
    updates = 0,
    reads = 0,
    renders = 0,
    writes = 0,
    skippedThrottled = 0,
    skippedUnchanged = 0;

  const applyVisibility = (): void => {
    root.hidden = !visible;
    root.setAttribute('aria-hidden', String(!visible));
  };

  const set = (node: HTMLElement, value: string): void => {
    if (node.textContent === value) return;
    node.textContent = value;
    writes += 1;
  };

  const render = (next: LiveEconomyView): void => {
    view = next;
    lastSignature = next.signature;
    renders += 1;
    root.setAttribute('data-tick', String(next.tick));
    root.setAttribute('data-empty', next.empty ? 'true' : 'false');
    root.setAttribute('data-epoch', next.epoch);
    empty.hidden = !next.empty;
    day.hidden = next.empty;
    dayRides.hidden = next.empty;
    dayRating.hidden = next.empty;
    dayExtra.hidden = next.empty;
    month.hidden = next.empty;
    total.hidden = next.empty;
    counters.hidden = next.empty;
    last.hidden = next.last === null;
    if (next.empty) {
      set(empty, LIVE_ECONOMY_TEXT.empty);
    } else {
      set(empty, '');
      set(day, `${next.day.label} · ${next.day.revenue}`);
      set(dayRides, next.day.rides);
      set(dayRating, next.day.rating);
      set(dayExtra, `${next.day.exposure} · ${next.epoch}`);
      set(month, `${next.month.label} · ${next.month.revenue} · ${next.month.rating}`);
    }
    set(total, next.total);
    set(counters, next.counters);
    set(last, next.last ?? '');
  };

  const readAndRender = (): LiveEconomyHudStatus => {
    reads += 1;
    const raw = options.read();
    const next = raw === null ? emptyLiveEconomyView() : projectLiveEconomy(raw);
    if (next.signature === lastSignature) {
      skippedUnchanged += 1;
      return 'SKIPPED_UNCHANGED';
    }
    render(next);
    return 'RENDERED';
  };

  applyVisibility();

  return Object.freeze({
    version: LIVE_ECONOMY_UI_VERSION,
    update(nowMs?: number): LiveEconomyHudStatus {
      if (disposed) throw new Error('Live economy HUD disposed');
      updates += 1;
      const at = nowMs ?? now();
      if (!Number.isFinite(at)) throw new Error('Live economy HUD clock is invalid');
      if (at - lastWrite < LIVE_ECONOMY_HUD_REFRESH_MS) {
        skippedThrottled += 1;
        return 'SKIPPED_THROTTLED';
      }
      lastWrite = at;
      return readAndRender();
    },
    refresh(nowMs?: number): LiveEconomyHudStatus {
      if (disposed) throw new Error('Live economy HUD disposed');
      const at = nowMs ?? now();
      if (!Number.isFinite(at)) throw new Error('Live economy HUD clock is invalid');
      lastWrite = at;
      return readAndRender();
    },
    show(): void {
      if (disposed) throw new Error('Live economy HUD disposed');
      if (visible) return;
      visible = true;
      applyVisibility();
    },
    hide(): void {
      if (disposed) throw new Error('Live economy HUD disposed');
      if (!visible) return;
      visible = false;
      applyVisibility();
    },
    isVisible: () => !disposed && visible,
    getView: () => (disposed ? null : view),
    getElement: () => root,
    getStats(): LiveEconomyHudStats {
      const lines = [
        title,
        empty,
        day,
        dayRides,
        dayRating,
        dayExtra,
        month,
        total,
        counters,
        last,
      ];
      return Object.freeze({
        version: LIVE_ECONOMY_UI_VERSION,
        disposed,
        visible,
        elements: disposed ? 0 : lines.length + 1,
        textNodes: disposed
          ? 0
          : lines.filter((node) => (node.textContent ?? '').length > 0).length,
        listeners: 0 as const,
        globalListeners: 0 as const,
        updates,
        reads,
        renders,
        writes,
        skippedThrottled,
        skippedUnchanged,
        empty: view?.empty ?? true,
        lastTick: view === null ? null : view.tick,
        historyScans: 0 as const,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      view = null;
      root.remove();
    },
  });
}
