import type { TaxiHudProjection, TaxiHudSnapshot } from './taxi-hud-format';
import {
  parseTaxiHudSnapshot,
  projectTaxiHud,
  TAXI_HUD_LIMITS,
  TAXI_HUD_VERSION,
} from './taxi-hud-format';

/**
 * 073 HUD: speed, mode, taxi identity and real ride/ETA progress. The host supplies one accepted
 * 005/057/061/064 snapshot per tick; the adapter only formats it and writes changed text.
 */
export function createTaxiHud(host: HTMLElement) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Taxi HUD requires an owned document');
  let elementCount = 0;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    elementCount += 1;
    return node;
  };
  const leaf = (tag: 'span' | 'dt' | 'dd', text: string): HTMLElement => {
    const node = element(tag);
    node.textContent = text;
    return node;
  };
  const root = element('section'),
    speedRow = element('div'),
    speedCaption = leaf('span', 'Viteză'),
    speedValue = element('output'),
    speedUnit = leaf('span', 'km/h'),
    modeRow = element('div'),
    modeSymbol = leaf('span', ''),
    modeLabel = leaf('span', ''),
    taxiRow = element('div'),
    taxiCaption = leaf('span', 'Taxi'),
    taxiValue = leaf('span', ''),
    rideList = element('dl'),
    stageLabel = leaf('dt', 'Etapă'),
    stageValue = leaf('dd', ''),
    objectiveLabel = leaf('dt', 'Obiectiv'),
    objectiveValue = leaf('dd', ''),
    routeLabel = leaf('dt', 'Rută'),
    routeValue = leaf('dd', ''),
    etaLabel = leaf('dt', 'ETA'),
    etaValue = leaf('dd', ''),
    progressLabel = leaf('dt', 'Progres'),
    progressValue = leaf('dd', ''),
    serviceLabel = leaf('dt', 'Serviciu'),
    serviceValue = leaf('dd', ''),
    details = element('details'),
    detailsSummary = element('summary'),
    detailsList = element('dl');
  detailsSummary.textContent = 'Detalii';
  root.className = 'taxi-hud';
  root.setAttribute('aria-label', 'HUD de condus');
  speedRow.className = 'taxi-hud__speed';
  modeRow.className = 'taxi-hud__mode';
  modeRow.setAttribute('role', 'status');
  modeRow.setAttribute('aria-live', 'polite');
  modeSymbol.setAttribute('aria-hidden', 'true');
  modeSymbol.className = 'taxi-hud__symbol';
  taxiRow.className = 'taxi-hud__taxi';
  rideList.className = 'taxi-hud__ride';
  details.className = 'taxi-hud__details';
  speedValue.setAttribute('aria-live', 'off');
  speedUnit.className = 'taxi-hud__unit';
  speedRow.append(speedCaption, speedValue, speedUnit);
  modeRow.append(modeSymbol, modeLabel);
  taxiRow.append(taxiCaption, taxiValue);
  rideList.append(
    stageLabel,
    stageValue,
    objectiveLabel,
    objectiveValue,
    routeLabel,
    routeValue,
    etaLabel,
    etaValue,
    progressLabel,
    progressValue,
    serviceLabel,
    serviceValue,
  );
  const DETAIL_LABELS = [
    'Taxi',
    'Clasă',
    'Profil',
    'Versiune profil',
    'Cursă',
    'Etapă tehnică',
    'Interval ETA',
    'Distanță rămasă',
    'Motiv ETA',
  ] as const;
  const detailLabels: HTMLElement[] = [],
    detailValues: HTMLElement[] = [];
  for (const label of DETAIL_LABELS) {
    const term = leaf('dt', label),
      value = leaf('dd', '—');
    detailLabels.push(term);
    detailValues.push(value);
    detailsList.append(term, value);
  }
  details.append(detailsSummary, detailsList);
  root.append(speedRow, modeRow, taxiRow, rideList, details);
  host.append(root);

  let disposed = false,
    busy = false,
    lastClock = -Infinity,
    lastWrite = -Infinity,
    updates = 0,
    writes = 0,
    skipped = 0,
    current: TaxiHudSnapshot | null = null;
  const textNodes = [
    speedCaption,
    speedValue,
    speedUnit,
    modeSymbol,
    modeLabel,
    taxiCaption,
    taxiValue,
    stageLabel,
    stageValue,
    objectiveLabel,
    objectiveValue,
    routeLabel,
    routeValue,
    etaLabel,
    etaValue,
    progressLabel,
    progressValue,
    serviceLabel,
    serviceValue,
    detailsSummary,
    ...detailLabels,
    ...detailValues,
  ];
  const mutate = (action: () => void) => {
    if (busy) throw new Error('Taxi HUD reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const set = (node: HTMLElement, value: string) => {
    if (node.textContent === value) return;
    node.textContent = value;
    writes += 1;
  };
  const attribute = (node: HTMLElement, name: string, value: string) => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
    writes += 1;
  };
  const render = (view: TaxiHudSnapshot) => {
    const p: TaxiHudProjection = projectTaxiHud(view);
    set(speedValue, p.speed.value);
    set(speedUnit, p.speed.unit);
    attribute(speedValue, 'aria-label', p.speed.accessible);
    set(modeSymbol, p.mode.symbol);
    set(modeLabel, p.mode.label);
    attribute(modeRow, 'aria-label', `Mod de control: ${view.mode}. ${p.mode.label}`);
    attribute(root, 'data-mode', view.mode);
    set(taxiValue, p.taxi);
    attribute(taxiValue, 'aria-label', p.taxiAccessible);
    set(stageValue, p.stage);
    set(objectiveValue, p.objective);
    set(routeValue, p.route);
    set(etaValue, p.eta);
    attribute(etaValue, 'aria-label', p.etaAccessible);
    set(progressValue, p.progress);
    set(serviceValue, p.service);
    attribute(root, 'data-ride', p.rideKey);
    attribute(root, 'data-stance', p.foreign ? 'FOREIGN' : p.terminal ? 'TERMINAL' : 'ACTIVE');
    attribute(root, 'data-service', view.ride?.eta.serviceState ?? 'NONE');
    attribute(root, 'aria-label', `HUD de condus · ${p.mode.label} · ${p.taxi} · ${p.stage}`);
    const values = p.details.map((detail) => detail.value);
    for (let index = 0; index < detailValues.length; index += 1)
      set(detailValues[index]!, values[index] ?? '—');
  };
  return Object.freeze({
    update(candidate: TaxiHudSnapshot, nowMs: number) {
      mutate(() => {
        if (disposed) throw new Error('Taxi HUD disposed');
        const view = parseTaxiHudSnapshot(candidate);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Taxi HUD clock');
        if (
          current &&
          current.sessionId === view.sessionId &&
          current.worldEpoch === view.worldEpoch &&
          view.tick < current.tick
        )
          throw new Error('Stale taxi HUD snapshot');
        lastClock = nowMs;
        const changedIdentity =
          current === null ||
          current.mode !== view.mode ||
          (current.taxi?.vehicleId ?? null) !== (view.taxi?.vehicleId ?? null) ||
          (current.ride?.rideId ?? null) !== (view.ride?.rideId ?? null) ||
          (current.ride?.state ?? null) !== (view.ride?.state ?? null);
        current = view;
        if (!changedIdentity && nowMs - lastWrite < 1000 / TAXI_HUD_LIMITS.maximumHz) {
          skipped += 1;
          return;
        }
        lastWrite = nowMs;
        updates += 1;
        render(view);
      });
    },
    getStats: () =>
      Object.freeze({
        version: TAXI_HUD_VERSION,
        elements: disposed ? 0 : elementCount,
        textNodes: disposed ? 0 : textNodes.reduce((n, node) => n + node.childNodes.length, 0),
        listeners: 0,
        updates,
        writes,
        skipped,
        disposed,
        retainedProjections: current ? 1 : 0,
      }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        current = null;
        detailLabels.length = 0;
        detailValues.length = 0;
        root.remove();
      });
    },
  });
}
