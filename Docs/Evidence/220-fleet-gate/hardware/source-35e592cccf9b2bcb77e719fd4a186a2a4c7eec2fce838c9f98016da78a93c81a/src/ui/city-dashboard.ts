import type {
  CityDashboardSnapshot,
  CityDashboardView,
  CityIncidentPositionM,
  CityIncidentRow,
  CityMetricView,
} from './city-dashboard-format';
import {
  CITY_DASHBOARD_LIMITS,
  CITY_DASHBOARD_VERSION,
  cityDashboardIncidentSignature,
  parseCityDashboardSnapshot,
  projectCityDashboard,
  selectIncident,
} from './city-dashboard-format';

export interface CityDashboardOptions {
  /** Metric/list write ceiling. Defaults to 10 Hz; never tied to the tick rate. */
  readonly maximumHz?: number;
  /**
   * Map drilldown intention. It is the only effect of selecting an incident: the dashboard never
   * edits a profile, changes the camera mode, takes authority or moves a vehicle.
   */
  readonly focus?: (incidentId: string, positionM: CityIncidentPositionM) => boolean;
}

interface MetricNodes {
  readonly item: HTMLElement;
  readonly label: HTMLElement;
  readonly value: HTMLElement;
  readonly sample: HTMLElement;
  readonly reason: HTMLElement;
}

interface IncidentNodes {
  readonly item: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly kind: HTMLElement;
  readonly label: HTMLElement;
  readonly place: HTMLElement;
  readonly onClick: () => void;
  mounted: boolean;
}

/** Elements owned by one metric card: `li` + four `span`s. */
const METRIC_ELEMENTS = 5;
/** Leaf text nodes owned by one metric card. */
const METRIC_TEXT_NODES = 4;
/** Elements owned by one incident row: `li` + `button` + three `span`s. */
const INCIDENT_ELEMENTS = 5;
/** Leaf text nodes owned by one incident row. */
const INCIDENT_TEXT_NODES = 3;

const DESCRIPTION_ID = 'city-dashboard-description';

/**
 * 082 city dashboard adapter. It builds the DOM once, keeps one card per metric id and one
 * `<button role="option">` per incident id, and rewrites only the values that actually changed.
 *
 * Unavailable data is written as text ("Indisponibil" + reason + `data-state="UNAVAILABLE"`), while a
 * real zero is written as "0" with `data-state="AVAILABLE"`; colour is never the only difference. A
 * click (or the native Enter/Space activation) on a located incident emits exactly one injected focus
 * intention. An incident without a position reports "Poziție indisponibilă" and emits nothing. No
 * global key listener is installed, so driving keys keep working.
 */
export function createCityDashboard(host: HTMLElement, options: CityDashboardOptions = {}) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('City dashboard requires an owned document');
  const maximumHz = options.maximumHz ?? CITY_DASHBOARD_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('City dashboard write rate');
  const interval = 1000 / maximumHz;
  let elementCount = 0;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    elementCount += 1;
    return node;
  };
  const leaf = (tag: 'span' | 'dd', text: string): HTMLElement => {
    const node = element(tag);
    node.textContent = text;
    return node;
  };
  const term = (text: string): HTMLElement => {
    const node = element('dt');
    node.textContent = text;
    return node;
  };

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    countValue = element('span'),
    metricsList = element('ul'),
    exposure = element('div'),
    exposureTitle = element('h3'),
    exposureSummary = element('p'),
    exposureGrid = element('dl'),
    windowsTerm = term('Ferestre'),
    windowsValue = leaf('dd', ''),
    observationsTerm = term('Observații'),
    observationsValue = leaf('dd', ''),
    durationTerm = term('Durată'),
    durationValue = leaf('dd', ''),
    incidentList = element('ul'),
    drilldown = element('section'),
    drilldownTitle = element('h3'),
    drilldownHeading = element('p'),
    drilldownPosition = element('p'),
    drilldownDetails = element('p'),
    drilldownMetrics = element('p'),
    status = element('p'),
    description = element('p');
  title.textContent = 'Tabloul orașului';
  root.className = 'city-dashboard';
  root.setAttribute('aria-label', 'Tabloul orașului');
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  header.className = 'city-dashboard__header';
  title.className = 'city-dashboard__title';
  countValue.className = 'city-dashboard__count';
  metricsList.className = 'city-dashboard__metrics';
  metricsList.setAttribute('role', 'list');
  metricsList.setAttribute('aria-label', 'Indicatori');
  exposure.className = 'city-dashboard__exposure';
  exposureTitle.className = 'city-dashboard__section-title';
  exposureTitle.textContent = 'Expunere';
  exposureSummary.className = 'city-dashboard__exposure-summary';
  exposureGrid.className = 'city-dashboard__exposure-grid';
  windowsValue.className = 'city-dashboard__exposure-value';
  observationsValue.className = 'city-dashboard__exposure-value';
  durationValue.className = 'city-dashboard__exposure-value';
  incidentList.className = 'city-dashboard__incidents';
  incidentList.setAttribute('role', 'listbox');
  incidentList.setAttribute('aria-label', 'Evenimente');
  drilldown.className = 'city-dashboard__drilldown';
  drilldown.setAttribute('aria-label', 'Detalii incident');
  drilldownTitle.className = 'city-dashboard__section-title';
  drilldownTitle.textContent = 'Detaliu incident';
  drilldownHeading.className = 'city-dashboard__drilldown-title';
  drilldownPosition.className = 'city-dashboard__drilldown-position';
  drilldownDetails.className = 'city-dashboard__drilldown-detail';
  drilldownMetrics.className = 'city-dashboard__drilldown-metrics';
  status.className = 'city-dashboard__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  description.className = 'city-dashboard__description';
  description.id = DESCRIPTION_ID;
  description.textContent =
    'Tabloul orașului citește cursele 061, incidentele 028 și istoricul de sănătate 065. ' +
    'O valoare indisponibilă este afișată „Indisponibil” și nu este niciodată zero; un zero real rămâne „0”. ' +
    'Selectarea unui incident trimite doar o intenție de focalizare a hărții și nu schimbă profilul, ' +
    'modul camerei, autoritatea sau fizica.';
  exposureGrid.append(
    windowsTerm,
    windowsValue,
    observationsTerm,
    observationsValue,
    durationTerm,
    durationValue,
  );
  exposure.append(exposureTitle, exposureSummary, exposureGrid);
  drilldown.append(
    drilldownTitle,
    drilldownHeading,
    drilldownPosition,
    drilldownDetails,
    drilldownMetrics,
  );
  header.append(title, countValue);
  root.append(header, metricsList, exposure, incidentList, drilldown, status, description);
  host.append(root);
  const baseElements = elementCount,
    chromeText: readonly HTMLElement[] = [
      countValue,
      exposureSummary,
      windowsValue,
      observationsValue,
      durationValue,
      drilldownHeading,
      drilldownPosition,
      drilldownDetails,
      drilldownMetrics,
      status,
      description,
    ];

  const metricCards = new Map<string, MetricNodes>(),
    incidentRows = new Map<string, IncidentNodes>();
  let disposed = false,
    busy = false,
    emitting = false,
    current: CityDashboardSnapshot | null = null,
    view: CityDashboardView | null = null,
    selection: string | null = null,
    hostSelection: string | null = null,
    lastSignature = '',
    lastIncidentSignature = '',
    lastClock = -Infinity,
    lastWrite = -Infinity,
    createdRows = 0,
    moves = 0,
    removedRows = 0,
    writes = 0,
    skipped = 0,
    updates = 0,
    renders = 0,
    focusEmits = 0,
    focusAccepted = 0,
    focusSkipped = 0,
    listeners = 0;

  const mutate = (action: () => void) => {
    if (busy) throw new Error('City dashboard reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('City dashboard disposed');
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
  const emit = (incidentId: string, positionM: CityIncidentPositionM) => {
    if (disposed || emitting) return;
    if (options.focus === undefined) {
      focusSkipped += 1;
      return;
    }
    focusEmits += 1;
    emitting = true;
    try {
      if (options.focus(incidentId, positionM) === true) focusAccepted += 1;
    } finally {
      emitting = false;
    }
  };
  const withSelection = (
    snapshot: CityDashboardSnapshot,
    incidentId: string | null,
  ): CityDashboardSnapshot =>
    snapshot.selectedIncidentId === incidentId
      ? snapshot
      : Object.freeze({ ...snapshot, selectedIncidentId: incidentId });
  const createMetricCard = (metricId: string): MetricNodes => {
    const item = element('li'),
      label = leaf('span', ''),
      value = leaf('span', ''),
      sample = leaf('span', ''),
      reason = leaf('span', '');
    item.className = 'city-dashboard__metric';
    item.setAttribute('data-metric-id', metricId);
    item.setAttribute('data-state', 'UNAVAILABLE');
    label.className = 'city-dashboard__metric-label';
    value.className = 'city-dashboard__metric-value';
    sample.className = 'city-dashboard__metric-sample';
    reason.className = 'city-dashboard__metric-reason';
    item.append(label, value, sample, reason);
    return { item, label, value, sample, reason };
  };
  const renderMetric = (nodes: MetricNodes, metric: CityMetricView) => {
    set(nodes.label, metric.label);
    set(nodes.value, metric.valueLabel);
    set(nodes.sample, metric.sampleLabel);
    set(nodes.reason, metric.reasonLabel);
    attribute(nodes.item, 'data-state', metric.state);
    attribute(nodes.item, 'data-reason', metric.reason ?? '');
    attribute(nodes.item, 'aria-label', metric.description);
  };
  const createIncidentRow = (incidentId: string): IncidentNodes => {
    const item = element('li'),
      button = element('button'),
      kind = leaf('span', ''),
      label = leaf('span', ''),
      place = leaf('span', ''),
      onClick = () => {
        select(incidentId);
      };
    item.className = 'city-dashboard__incident';
    item.setAttribute('role', 'presentation');
    item.setAttribute('data-incident-id', incidentId);
    button.className = 'city-dashboard__incident-row';
    button.setAttribute('type', 'button');
    button.setAttribute('role', 'option');
    button.setAttribute('data-incident-id', incidentId);
    button.setAttribute('aria-selected', 'false');
    kind.className = 'city-dashboard__incident-kind';
    label.className = 'city-dashboard__incident-label';
    place.className = 'city-dashboard__incident-place';
    button.append(kind, label, place);
    button.addEventListener('click', onClick);
    listeners += 1;
    createdRows += 1;
    item.append(button);
    return { item, button, kind, label, place, onClick, mounted: false };
  };
  const renderIncidentRow = (nodes: IncidentNodes, row: CityIncidentRow) => {
    set(nodes.kind, row.kindLabel);
    set(nodes.label, `${row.severityLabel} · ${row.tickLabel} · ${row.vehicleId}`);
    set(nodes.place, row.positionLabel);
    attribute(nodes.button, 'aria-label', row.description);
    attribute(nodes.button, 'aria-selected', row.selected ? 'true' : 'false');
    attribute(nodes.item, 'data-kind', row.kind);
    attribute(nodes.item, 'data-selected', row.selected ? 'true' : 'false');
    attribute(nodes.item, 'data-located', row.located ? 'true' : 'false');
  };
  const render = (projected: CityDashboardView, snapshot: CityDashboardSnapshot) => {
    const metricIds = new Set<string>(projected.metrics.map((metric) => metric.id));
    for (const [metricId, nodes] of metricCards) {
      if (metricIds.has(metricId)) continue;
      nodes.item.remove();
      metricCards.delete(metricId);
    }
    for (let index = 0; index < projected.metrics.length; index += 1) {
      const metric = projected.metrics[index]!;
      let nodes = metricCards.get(metric.id);
      if (nodes === undefined) {
        nodes = createMetricCard(metric.id);
        metricCards.set(metric.id, nodes);
      }
      const reference = metricsList.children[index] ?? null;
      if (reference !== nodes.item) metricsList.insertBefore(nodes.item, reference);
      renderMetric(nodes, metric);
    }
    const wanted = new Set(projected.rows.map((row) => row.incidentId));
    for (const [incidentId, nodes] of incidentRows) {
      if (wanted.has(incidentId)) continue;
      nodes.button.removeEventListener('click', nodes.onClick);
      listeners -= 1;
      nodes.item.remove();
      incidentRows.delete(incidentId);
      removedRows += 1;
    }
    for (let index = 0; index < projected.rows.length; index += 1) {
      const row = projected.rows[index]!;
      let nodes = incidentRows.get(row.incidentId);
      if (nodes === undefined) {
        nodes = createIncidentRow(row.incidentId);
        incidentRows.set(row.incidentId, nodes);
      }
      const reference = incidentList.children[index] ?? null,
        attached = nodes.mounted;
      if (reference !== nodes.item) {
        incidentList.insertBefore(nodes.item, reference);
        if (attached) moves += 1;
      }
      nodes.mounted = true;
      renderIncidentRow(nodes, row);
    }
    const exposureView = projected.exposure;
    set(exposureSummary, exposureView.summary);
    set(windowsValue, exposureView.windowsLabel);
    set(observationsValue, exposureView.observationsLabel);
    set(durationValue, exposureView.durationLabel);
    attribute(exposure, 'data-state', exposureView.state);
    attribute(exposure, 'data-reason', exposureView.reason ?? '');
    attribute(exposure, 'aria-label', exposureView.description);
    const detail = projected.drilldown;
    set(drilldownHeading, detail.title);
    set(drilldownPosition, detail.positionLabel);
    set(drilldownDetails, detail.detailLines.join(' · '));
    set(drilldownMetrics, detail.metricLines.join(' · '));
    attribute(drilldown, 'data-status', detail.status);
    attribute(drilldown, 'data-reason', detail.reason ?? '');
    set(status, projected.summary);
    set(
      countValue,
      `${projected.counts.availableMetrics}/${projected.counts.metrics} indicatori` +
        ` · ${projected.counts.incidents} evenimente` +
        ` · ${projected.counts.located} localizabile`,
    );
    attribute(root, 'data-tick', String(snapshot.tick));
    attribute(root, 'data-metrics', String(projected.counts.metrics));
    attribute(root, 'data-incidents', String(projected.counts.incidents));
    attribute(root, 'data-located', String(projected.counts.located));
    attribute(root, 'data-selected', selection ?? '');
    attribute(
      root,
      'aria-label',
      `Tabloul orașului · ${projected.counts.incidents} evenimente · ${projected.counts.located} localizabile`,
    );
    view = projected;
    renders += 1;
  };

  function select(incidentId: string) {
    let accepted = false;
    mutate(() => {
      assertLive();
      if (current === null) return;
      const result = selectIncident(current, incidentId);
      if (result.row === null || selection === incidentId) return;
      selection = incidentId;
      accepted = true;
      const effective = withSelection(current, selection),
        projected = projectCityDashboard(effective);
      lastWrite = lastClock;
      lastSignature = projected.signature;
      lastIncidentSignature = cityDashboardIncidentSignature(effective);
      render(projected, effective);
      set(status, result.drilldown.summary);
      if (result.focus.status === 'AVAILABLE')
        emit(result.focus.incidentId, result.focus.positionM);
      else focusSkipped += 1;
      updates += 1;
    });
    return accepted;
  }

  return Object.freeze({
    update(candidate: CityDashboardSnapshot, nowMs: number) {
      mutate(() => {
        assertLive();
        const snapshot = parseCityDashboardSnapshot(candidate);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('City dashboard clock');
        if (
          current !== null &&
          current.sessionId === snapshot.sessionId &&
          current.worldEpoch === snapshot.worldEpoch &&
          snapshot.tick < current.tick
        )
          throw new Error('Stale city dashboard snapshot');
        lastClock = nowMs;
        const previous = current;
        current = snapshot;
        const nextHostSelection = snapshot.selectedIncidentId;
        let adopted = false;
        if (previous === null || nextHostSelection !== hostSelection) {
          adopted = true;
          hostSelection = nextHostSelection;
          selection = nextHostSelection;
        }
        const effective = withSelection(snapshot, selection),
          projected = projectCityDashboard(effective),
          incidentSignature = cityDashboardIncidentSignature(effective),
          bypass = previous === null || adopted || incidentSignature !== lastIncidentSignature;
        lastIncidentSignature = incidentSignature;
        if (projected.signature === lastSignature) {
          view = projected;
          skipped += 1;
          return;
        }
        if (!bypass && nowMs - lastWrite < interval) {
          skipped += 1;
          return;
        }
        lastWrite = nowMs;
        lastSignature = projected.signature;
        updates += 1;
        render(projected, effective);
      });
    },
    /** Programmatic selection; identical to a click on the incident row. */
    select,
    getStats: () =>
      Object.freeze({
        version: CITY_DASHBOARD_VERSION,
        elements: disposed
          ? 0
          : baseElements +
            metricCards.size * METRIC_ELEMENTS +
            incidentRows.size * INCIDENT_ELEMENTS,
        textNodes: disposed
          ? 0
          : chromeText.length +
            metricCards.size * METRIC_TEXT_NODES +
            incidentRows.size * INCIDENT_TEXT_NODES,
        metrics: metricCards.size,
        cards: metricCards.size,
        rows: disposed ? 0 : incidentList.children.length,
        retainedRows: incidentRows.size,
        createdRows,
        removedRows,
        moves,
        writes,
        skipped,
        updates,
        renders,
        listeners,
        focusEmits,
        focusAccepted,
        focusSkipped,
        selectedIncidentId: selection,
        retainedViews: disposed || current === null ? 0 : 1,
        disposed,
      }),
    /** The retained frame and its current projection; `null` before the first accepted update. */
    getView: () => (disposed ? null : view),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const nodes of incidentRows.values()) {
          nodes.button.removeEventListener('click', nodes.onClick);
          nodes.item.remove();
        }
        incidentRows.clear();
        for (const nodes of metricCards.values()) nodes.item.remove();
        metricCards.clear();
        listeners = 0;
        current = null;
        view = null;
        selection = null;
        hostSelection = null;
        root.remove();
      });
    },
  });
}

export type CityDashboard = ReturnType<typeof createCityDashboard>;
