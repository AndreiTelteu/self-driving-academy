import { createCityDashboard } from '../../src/ui';
import type {
  CityDashboardSnapshot,
  CityExposure,
  CityIncident,
  CityIncidentPositionM,
  CityMetric,
} from '../../src/ui';
import { CITY_DASHBOARD_VERSION } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

export function cityPosition(x = 1, y = 0, z = 2): CityIncidentPositionM {
  return Object.freeze({ x, y, z });
}

export function cityMetric(overrides: Partial<CityMetric> = {}): CityMetric {
  return Object.freeze({
    id: 'completedRides',
    label: 'Curse finalizate',
    unit: 'rides',
    state: 'AVAILABLE',
    value: 0,
    sampleSize: 0,
    reason: null,
    ...overrides,
  } as CityMetric);
}

export function cityIncident(overrides: Partial<CityIncident> = {}): CityIncident {
  return Object.freeze({
    incidentId: 'collision:082:1',
    kind: 'COLLISION',
    tick: 40,
    vehicleId: 'taxi:082:01',
    rideId: null,
    severity: 'MODERATE',
    positionM: cityPosition(),
    label: 'Coliziune · taxi:082:01',
    detail: 'impuls 1200 N·s cu obstacle:082:1',
    ...overrides,
  });
}

export function cityExposure(overrides: Partial<CityExposure> = {}): CityExposure {
  return Object.freeze({
    state: 'AVAILABLE',
    windows: 0,
    observations: 0,
    durationSeconds: 0,
    reason: null,
    ...overrides,
  } as CityExposure);
}

/** A neutral frame: real zeros where the count exists, explicit unavailable everywhere else. */
export function citySnapshot(
  overrides: Partial<CityDashboardSnapshot> = {},
): CityDashboardSnapshot {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: CITY_DASHBOARD_VERSION,
    sessionId: 'session:082',
    worldEpoch: 3,
    tick: 480,
    metrics: Object.freeze([
      cityMetric(),
      cityMetric({
        id: 'averageRideSeconds',
        label: 'Durată medie cursă',
        unit: 's',
        state: 'UNAVAILABLE',
        value: null,
        sampleSize: null,
        reason: 'NO_EXPOSURE',
      }),
      cityMetric({
        id: 'comfortScore',
        label: 'Confort',
        unit: 'score',
        state: 'UNAVAILABLE',
        value: null,
        sampleSize: null,
        reason: 'SOURCE_MISSING',
      }),
    ]),
    incidents: Object.freeze([]),
    selectedIncidentId: null,
    exposure: cityExposure(),
    ...overrides,
  });
}

/** The full closed metric set, used by the report and the projection tests. */
export function sevenMetricSnapshot(
  overrides: Partial<CityDashboardSnapshot> = {},
): CityDashboardSnapshot {
  return citySnapshot({
    metrics: Object.freeze([
      cityMetric({ value: 7, sampleSize: 7 }),
      cityMetric({
        id: 'averageRideSeconds',
        label: 'Durată medie cursă',
        unit: 's',
        value: 91,
        sampleSize: 7,
      }),
      cityMetric({
        id: 'totalDistanceM',
        label: 'Distanță parcursă',
        unit: 'm',
        value: 1240,
        sampleSize: 7,
      }),
      cityMetric({
        id: 'violations',
        label: 'Încălcări',
        unit: 'count',
        state: 'UNAVAILABLE',
        value: null,
        sampleSize: null,
        reason: 'SOURCE_MISSING',
      }),
      cityMetric({
        id: 'collisions',
        label: 'Coliziuni',
        unit: 'count',
        value: 0,
        sampleSize: 0,
      }),
      cityMetric({ id: 'blockages', label: 'Blocaje', unit: 'count', value: 2, sampleSize: 2 }),
      cityMetric({
        id: 'comfortScore',
        label: 'Confort',
        unit: 'score',
        state: 'UNAVAILABLE',
        value: null,
        sampleSize: null,
        reason: 'NOT_CERTIFIED',
      }),
    ]),
    exposure: cityExposure({ windows: 9, observations: 7, durationSeconds: 637 }),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------------------------
// Fake-DOM harness
// ---------------------------------------------------------------------------------------------

export interface CityDashboardHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly panel: ReturnType<typeof createCityDashboard>;
  readonly focuses: { incidentId: string; positionM: CityIncidentPositionM }[];
  root(): HudElement;
  metric(metricId: string): HudElement;
  metrics(): HudElement[];
  rows(): HudElement[];
  row(incidentId: string): HudElement;
  incidentButton(incidentId: string): HudElement;
  drilldown(): HudElement;
  exposure(): HudElement;
  status(): HudElement;
  dom(): string;
}

export function byClass(root: HudElement, className: string): HudElement | null {
  if (root.className.split(' ').includes(className)) return root;
  for (const child of root.children) {
    const found = byClass(child, className);
    if (found !== null) return found;
  }
  return null;
}

export function createCityDashboardHarness(
  options: Readonly<{ maximumHz?: number; acceptFocus?: boolean }> = {},
): CityDashboardHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    focuses: { incidentId: string; positionM: CityIncidentPositionM }[] = [],
    panel = createCityDashboard(host as unknown as HTMLElement, {
      ...(options.maximumHz === undefined ? {} : { maximumHz: options.maximumHz }),
      focus: (incidentId, positionM) => {
        focuses.push({ incidentId, positionM });
        return options.acceptFocus ?? true;
      },
    }),
    requireRoot = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('City dashboard root is missing');
      return element;
    },
    select = (className: string): HudElement => {
      const element = byClass(requireRoot(), className);
      if (element === null) throw new Error(`City dashboard node is missing: ${className}`);
      return element;
    },
    metrics = (): HudElement[] => [...select('city-dashboard__metrics').children],
    rows = (): HudElement[] => [...select('city-dashboard__incidents').children],
    row = (incidentId: string): HudElement => {
      for (const item of rows())
        if (item.getAttribute('data-incident-id') === incidentId) return item;
      throw new Error(`City dashboard incident row is missing: ${incidentId}`);
    };
  return {
    doc,
    host,
    panel,
    focuses,
    root: requireRoot,
    metric: (metricId: string) => {
      for (const item of metrics())
        if (item.getAttribute('data-metric-id') === metricId) return item;
      throw new Error(`City dashboard metric is missing: ${metricId}`);
    },
    metrics,
    rows,
    row,
    incidentButton: (incidentId: string) => {
      const button = row(incidentId).children[0];
      if (!button) throw new Error(`City dashboard incident button is missing: ${incidentId}`);
      return button;
    },
    drilldown: () => select('city-dashboard__drilldown'),
    exposure: () => select('city-dashboard__exposure'),
    status: () => select('city-dashboard__status'),
    dom: () => serializeHud(requireRoot()),
  };
}
