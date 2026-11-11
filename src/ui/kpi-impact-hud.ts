import type { KpiImpactPlaneView, KpiImpactSnapshot, KpiImpactView } from './kpi-impact-format';
import {
  KPI_IMPACT_TEXT,
  KPI_IMPACT_UI_VERSION,
  assertNoXpLossMessages,
  emptyKpiImpactView,
  parseKpiImpactSnapshot,
  projectKpiImpact,
} from './kpi-impact-format';

/**
 * 214 capped HUD feedback.
 *
 * The HUD entry point is called once per simulated tick, but it is **not** a per-frame reader:
 *
 * - it reads the host port at most once every `minimumReadIntervalTicks` (default `6`, i.e. 10 Hz at
 *   the 60 Hz authoritative tick, inside the 5–10 Hz contract of Docs/25) and never on the frames in
 *   between;
 * - it writes only the planes whose projected text changed, so an unchanged KPI mutates no node;
 * - it never rebuilds the KPI history: the port returns the compact 214 read model, and the adapter
 *   has no history, ledger or chart API at all (`historyRebuilds: 0` structural).
 *
 * The adapter owns no listener: it is a projection of the HUD, not a panel, so the driving keys never
 * reach it. Every generated string passes `assertNoXpLossMessages` before it reaches the DOM.
 */
export interface KpiImpactHudOptions {
  /** Host-composed 214 read. It must return the compact read model, never a history selection. */
  readonly read: () => KpiImpactSnapshot | null;
  /**
   * Minimum simulated ticks between two reads. `6` at 60 Hz is 10 Hz, the documented HUD ceiling;
   * the value is bounded so a caller cannot turn the HUD into a per-frame reader.
   */
  readonly minimumReadIntervalTicks?: number;
  /** Authoritative tick rate of the values, used only to report the real read rate. */
  readonly tickHz?: number;
  readonly idPrefix?: string;
  readonly visible?: boolean;
}

export type KpiImpactHudStatus =
  'RENDERED' | 'SKIPPED_THROTTLED' | 'SKIPPED_UNCHANGED' | 'SKIPPED_EMPTY' | 'SKIPPED_HIDDEN';

export interface KpiImpactHudStats {
  readonly version: typeof KPI_IMPACT_UI_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: 0;
  readonly globalListeners: 0;
  /** Every `update` call, one per simulated tick. */
  readonly ticks: number;
  /** Accepted reads of the host port (`ticks / minimumReadIntervalTicks`, rounded up). */
  readonly reads: number;
  /** Explicit `refresh()` reads; they bypass the interval but stay bounded. */
  readonly forcedReads: number;
  /** Accepted renders: one per changed projection, never one per tick. */
  readonly renders: number;
  /** Plane writes; only the planes whose text changed are written. */
  readonly planeUpdates: number;
  readonly skippedThrottled: number;
  readonly skippedUnchanged: number;
  readonly skippedEmpty: number;
  readonly skippedHidden: number;
  readonly minimumReadIntervalTicks: number;
  readonly tickHz: number;
  /** Read rate the interval really allows, in Hz. */
  readonly maximumReadHz: number;
  readonly planes: number;
  readonly visible: boolean;
  readonly empty: boolean;
  readonly historyRebuilds: 0;
  readonly xpLossMessages: 0;
  readonly disposed: boolean;
}

export interface KpiImpactHud {
  readonly version: typeof KPI_IMPACT_UI_VERSION;
  /** One call per simulated tick; the interval decides whether it reads. */
  update(atTick: number): KpiImpactHudStatus;
  /** Explicit, forced re-read (open, resize, a deliberate inspection). Still one projection. */
  refresh(atTick?: number): KpiImpactHudStatus;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  getView(): KpiImpactView | null;
  getElement(): HTMLElement;
  getStats(): KpiImpactHudStats;
  dispose(): void;
}

const HUD_STYLE =
  'display:flex;flex-direction:column;gap:0.35rem;padding:0.5rem 0.75rem;background:#0d1714e6;' +
  'color:#f3f7fb;border:1px solid #2d4a3f;border-radius:0.5rem;max-width:min(92vw,34rem);';
const PLANE_STYLE = 'display:flex;flex-direction:column;gap:0.1rem;';
const TITLE_STYLE = 'margin:0;font-size:0.75rem;letter-spacing:0.02em;color:#b9cfc5;';
const HEADLINE_STYLE = 'margin:0;font-size:0.875rem;font-weight:600;';
const DETAILS_STYLE = 'margin:0;padding-left:1rem;font-size:0.75rem;color:#d8e6df;';
const EMPTY_STYLE = 'margin:0;font-size:0.8125rem;color:#b9cfc5;';
const TONE_COLOURS: Readonly<Record<string, string>> = Object.freeze({
  POSITIVE: '#9edbb5',
  NEGATIVE: '#f2b2a0',
  MIXED: '#f0d48a',
  NEUTRAL: '#f3f7fb',
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

interface PlaneNodes {
  readonly section: HTMLElement;
  readonly title: HTMLElement;
  readonly headline: HTMLElement;
  readonly details: HTMLElement;
}

export function createKpiImpactHud(host: HTMLElement, options: KpiImpactHudOptions): KpiImpactHud {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('KPI impact HUD requires an owned document');
  if (typeof options?.read !== 'function')
    throw new Error('KPI impact HUD requires the 214 read port');
  const prefix = options.idPrefix ?? 'kpi-impact';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 48)
    throw new Error('KPI impact HUD id prefix is invalid');
  const interval = options.minimumReadIntervalTicks ?? 6,
    tickHz = options.tickHz ?? 60;
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 600)
    throw new Error('KPI impact HUD read interval is invalid');
  if (!Number.isFinite(tickHz) || tickHz < 1 || tickHz > 1_000)
    throw new Error('KPI impact HUD tick rate is invalid');

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);

  const root = element('section'),
    empty = element('p'),
    planesHost = element('div');

  root.className = 'kpi-impact-hud';
  root.setAttribute('data-version', KPI_IMPACT_UI_VERSION);
  root.setAttribute('data-planes', '3');
  root.setAttribute('data-read-interval-ticks', String(interval));
  root.setAttribute('data-history-rebuilds', '0');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'false');
  root.setAttribute('aria-label', KPI_IMPACT_TEXT.heading);
  root.setAttribute('style', HUD_STYLE);
  empty.className = 'kpi-impact-hud__empty';
  empty.setAttribute('style', EMPTY_STYLE);
  empty.textContent = KPI_IMPACT_TEXT.empty;
  planesHost.className = 'kpi-impact-hud__planes';
  planesHost.setAttribute('style', 'display:flex;flex-direction:column;gap:0.3rem;');
  root.append(empty, planesHost);
  host.append(root);

  const planeNodes = new Map<string, PlaneNodes>();
  const planeSignatures = new Map<string, string>();
  for (const key of ['MISSION', 'FIDELITY', 'SERVICE'] as const) {
    const section = element('section'),
      title = element('h4'),
      headline = element('p'),
      details = element('ul');
    section.className = 'kpi-impact-hud__plane';
    section.setAttribute('data-plane', key);
    section.setAttribute('style', PLANE_STYLE);
    title.className = 'kpi-impact-hud__plane-title';
    title.setAttribute('style', TITLE_STYLE);
    title.textContent = KPI_IMPACT_TEXT.planes[key];
    headline.className = 'kpi-impact-hud__plane-headline';
    headline.setAttribute('style', HEADLINE_STYLE);
    details.className = 'kpi-impact-hud__plane-details';
    details.setAttribute('style', DETAILS_STYLE);
    section.append(title, headline, details);
    planesHost.append(section);
    planeNodes.set(key, { section, title, headline, details });
  }

  let visible = options.visible !== false,
    disposed = false,
    view: KpiImpactView | null = null,
    lastSignature = '',
    lastReadTick: number | null = null,
    ticks = 0,
    reads = 0,
    forcedReads = 0,
    renders = 0,
    planeUpdates = 0,
    skippedThrottled = 0,
    skippedUnchanged = 0,
    skippedEmpty = 0,
    skippedHidden = 0;

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
  const applyVisibility = () => {
    if (visible) root.removeAttribute('hidden');
    else root.setAttribute('hidden', '');
  };

  const planeSignature = (plane: KpiImpactPlaneView): string =>
    JSON.stringify([plane.state, plane.headline, plane.details, plane.tone]);

  const renderPlane = (plane: KpiImpactPlaneView): void => {
    const nodes = planeNodes.get(plane.plane);
    if (nodes === undefined) throw new Error('KPI impact HUD has no plane node');
    const signature = planeSignature(plane);
    if (planeSignatures.get(plane.plane) === signature) return;
    planeSignatures.set(plane.plane, signature);
    planeUpdates += 1;
    attribute(nodes.section, 'data-state', plane.state);
    attribute(nodes.section, 'data-tone', plane.tone);
    attribute(nodes.section, 'data-no-xp-loss', 'true');
    nodes.headline.setAttribute('style', `${HEADLINE_STYLE}color:${TONE_COLOURS[plane.tone]};`);
    set(nodes.headline, plane.headline);
    if (nodes.details.children.length !== plane.details.length) {
      clear(nodes.details);
      for (let index = 0; index < plane.details.length; index += 1) {
        const item = element('li');
        item.setAttribute('data-detail', String(index));
        nodes.details.append(item);
      }
    }
    const items = [...nodes.details.children] as HTMLElement[];
    for (let index = 0; index < plane.details.length; index += 1)
      set(items[index]!, plane.details[index] ?? '');
    attribute(nodes.title, 'data-label', plane.stateLabel);
  };

  const render = (next: KpiImpactView): void => {
    assertNoXpLossMessages(next);
    view = next;
    lastSignature = next.signature;
    renders += 1;
    if (next.empty) empty.removeAttribute('hidden');
    else empty.setAttribute('hidden', '');
    attribute(root, 'data-tick', String(next.tick));
    attribute(root, 'data-service-state', next.service.state);
    attribute(root, 'data-revenue-direction', next.directions.revenue);
    attribute(root, 'data-rating-direction', next.directions.rating);
    attribute(root, 'data-incident-state', next.directions.incidents);
    attribute(root, 'data-mission-state', next.mission.state);
    attribute(root, 'data-has-xp-loss', 'false');
    attribute(root, 'data-empty', next.empty ? 'true' : 'false');
    for (const plane of next.planes) renderPlane(plane);
  };

  const readAndRender = (atTick: number, forced: boolean): KpiImpactHudStatus => {
    const raw = options.read();
    reads += 1;
    if (forced) forcedReads += 1;
    lastReadTick = atTick;
    if (raw === null) {
      skippedEmpty += 1;
      view = emptyKpiImpactView();
      root.setAttribute('hidden', '');
      return 'SKIPPED_EMPTY';
    }
    root.removeAttribute('hidden');
    const next = projectKpiImpact(parseKpiImpactSnapshot(raw));
    if (next.signature === lastSignature) {
      skippedUnchanged += 1;
      return 'SKIPPED_UNCHANGED';
    }
    render(next);
    return 'RENDERED';
  };

  applyVisibility();

  return Object.freeze({
    version: KPI_IMPACT_UI_VERSION,
    update(atTick: number): KpiImpactHudStatus {
      if (disposed) throw new Error('KPI impact HUD disposed');
      if (typeof atTick !== 'number' || !Number.isSafeInteger(atTick) || atTick < 0)
        throw new Error('KPI impact HUD tick is invalid');
      ticks += 1;
      if (!visible) {
        skippedHidden += 1;
        return 'SKIPPED_HIDDEN';
      }
      // A world reset moves the tick backwards: it is a new window, not a throttle hit.
      if (lastReadTick !== null && atTick < lastReadTick) lastReadTick = null;
      if (lastReadTick !== null && atTick - lastReadTick < interval) {
        skippedThrottled += 1;
        return 'SKIPPED_THROTTLED';
      }
      return readAndRender(atTick, false);
    },
    refresh(atTick?: number): KpiImpactHudStatus {
      if (disposed) throw new Error('KPI impact HUD disposed');
      const at = atTick ?? lastReadTick ?? 0;
      if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 0)
        throw new Error('KPI impact HUD tick is invalid');
      if (!visible) {
        skippedHidden += 1;
        return 'SKIPPED_HIDDEN';
      }
      return readAndRender(at, true);
    },
    show(): void {
      if (disposed) throw new Error('KPI impact HUD disposed');
      if (visible) return;
      visible = true;
      applyVisibility();
    },
    hide(): void {
      if (disposed) throw new Error('KPI impact HUD disposed');
      if (!visible) return;
      visible = false;
      applyVisibility();
    },
    isVisible: () => !disposed && visible,
    getView: () => (disposed ? null : view),
    getElement: () => root,
    getStats(): KpiImpactHudStats {
      const measured = disposed ? { elements: 0, textNodes: 0 } : countTree(root);
      return Object.freeze({
        version: KPI_IMPACT_UI_VERSION,
        elements: measured.elements,
        textNodes: measured.textNodes,
        listeners: 0 as const,
        globalListeners: 0 as const,
        ticks,
        reads,
        forcedReads,
        renders,
        planeUpdates,
        skippedThrottled,
        skippedUnchanged,
        skippedEmpty,
        skippedHidden,
        minimumReadIntervalTicks: interval,
        tickHz,
        maximumReadHz: Math.round((tickHz / interval) * 1e6) / 1e6,
        planes: planeNodes.size,
        visible,
        empty: view?.empty ?? true,
        historyRebuilds: 0 as const,
        xpLossMessages: 0 as const,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      view = null;
      planeNodes.clear();
      planeSignatures.clear();
      root.remove();
    },
  });
}

export type KpiImpactHudAdapter = ReturnType<typeof createKpiImpactHud>;
