import { formatDuration } from './taxi-hud-format';

/**
 * 082 city dashboard contract. The dashboard is a read model over the real 061 rides, 028 collision
 * incidents and 065 fleet health history: it aggregates metrics, lists incidents and turns one
 * selected incident into a map-focus intention.
 *
 * Two rules are structural, not cosmetic:
 *
 * 1. Unavailable is never zero. An unavailable metric/exposure carries `value: null` and a closed
 *    reason; a real zero stays `AVAILABLE` with `value: 0` and is displayed as "0".
 * 2. Selecting an incident only produces a `focus` intent with the incident's own position. It never
 *    imports, reads or writes a profile, camera mode, authority or physics state.
 */
export const CITY_DASHBOARD_VERSION = '082-city-dashboard-v1' as const;

export const CITY_DASHBOARD_LIMITS = Object.freeze({
  version: CITY_DASHBOARD_VERSION,
  /** Metric/exposure/list write ceiling. Independent of the authoritative simulation tick. */
  maximumHz: 10,
  /** The closed metric set; the dashboard never invents an eighth metric. */
  metrics: 7,
  /** Bounded incident list retained from the real sources. */
  incidents: 500,
  /** Code units per identity (session, incident, vehicle, ride). */
  idCodeUnits: 512,
  /** Code units per incident label. */
  labelCodeUnits: 96,
  /** Code units per incident detail. */
  detailCodeUnits: 512,
  /** Code units per source metric label. */
  metricLabelCodeUnits: 96,
  /** Code units per closed metric unit token. */
  unitCodeUnits: 24,
  retainedViews: 1,
  history: 0,
});

/** Closed metric identity: exactly the indicators named by the 082 objective. */
export const CITY_METRIC_IDS = [
  'completedRides',
  'averageRideSeconds',
  'totalDistanceM',
  'violations',
  'collisions',
  'blockages',
  'comfortScore',
] as const;
export type CityMetricId = (typeof CITY_METRIC_IDS)[number];

/** Closed unavailable vocabulary. `null` is used only on an available metric. */
export const CITY_METRIC_REASONS = ['NO_EXPOSURE', 'SOURCE_MISSING', 'NOT_CERTIFIED'] as const;
export type CityMetricReason = (typeof CITY_METRIC_REASONS)[number];

/** Closed display units; the value itself is always SI. */
export const CITY_METRIC_UNITS = ['rides', 's', 'm', 'count', 'score'] as const;
export type CityMetricUnit = (typeof CITY_METRIC_UNITS)[number];

export const CITY_METRIC_STATES = ['AVAILABLE', 'UNAVAILABLE'] as const;
export type CityMetricState = (typeof CITY_METRIC_STATES)[number];

export const CITY_INCIDENT_KINDS = ['COLLISION', 'BLOCKAGE', 'VIOLATION', 'COMFORT'] as const;
export type CityIncidentKind = (typeof CITY_INCIDENT_KINDS)[number];

export const CITY_INCIDENT_SEVERITIES = ['MINOR', 'MODERATE', 'SEVERE'] as const;
export type CityIncidentSeverity = (typeof CITY_INCIDENT_SEVERITIES)[number];

/** Closed focus reasons. A map focus needs an incident and a real position, never a guess. */
export const CITY_FOCUS_UNAVAILABLE_REASONS = ['MISSING_INCIDENT', 'MISSING_POSITION'] as const;
export type CityFocusUnavailableReason = (typeof CITY_FOCUS_UNAVAILABLE_REASONS)[number];

export const CITY_METRIC_LABELS: Readonly<Record<CityMetricId, string>> = Object.freeze({
  completedRides: 'Curse finalizate',
  averageRideSeconds: 'Durată medie cursă',
  totalDistanceM: 'Distanță parcursă',
  violations: 'Încălcări',
  collisions: 'Coliziuni',
  blockages: 'Blocaje',
  comfortScore: 'Confort',
});

/** The unit each closed metric identity is allowed to carry. */
export const CITY_METRIC_UNIT_BY_ID: Readonly<Record<CityMetricId, CityMetricUnit>> = Object.freeze(
  {
    completedRides: 'rides',
    averageRideSeconds: 's',
    totalDistanceM: 'm',
    violations: 'count',
    collisions: 'count',
    blockages: 'count',
    comfortScore: 'score',
  },
);

export const CITY_METRIC_UNIT_LABELS: Readonly<Record<CityMetricUnit, string>> = Object.freeze({
  rides: 'curse',
  s: 'secunde',
  m: 'metri',
  count: 'evenimente',
  score: 'puncte',
});

export const CITY_METRIC_REASON_LABELS: Readonly<Record<CityMetricReason, string>> = Object.freeze({
  NO_EXPOSURE: 'Fără expunere',
  SOURCE_MISSING: 'Sursă lipsă',
  NOT_CERTIFIED: 'Necertificat',
});

export const CITY_METRIC_STATE_LABELS: Readonly<Record<CityMetricState, string>> = Object.freeze({
  AVAILABLE: 'Disponibil',
  UNAVAILABLE: 'Indisponibil',
});

export const CITY_INCIDENT_KIND_LABELS: Readonly<Record<CityIncidentKind, string>> = Object.freeze({
  COLLISION: 'Coliziune',
  BLOCKAGE: 'Blocaj',
  VIOLATION: 'Încălcare',
  COMFORT: 'Confort',
});

export const CITY_INCIDENT_SEVERITY_LABELS: Readonly<Record<CityIncidentSeverity, string>> =
  Object.freeze({
    MINOR: 'Minor',
    MODERATE: 'Moderat',
    SEVERE: 'Sever',
  });

/** Text used wherever an incident has no real position; it is never replaced by a fake point. */
export const CITY_DASHBOARD_UNAVAILABLE_POSITION = 'Poziție indisponibilă';
export const CITY_DASHBOARD_UNAVAILABLE_VALUE = 'Indisponibil';
export const CITY_DASHBOARD_NO_INCIDENT = 'Niciun incident selectat';

export interface CityIncidentPositionM {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * One metric. `value` is `null` exactly when the state is `UNAVAILABLE`; a real zero is
 * `state: 'AVAILABLE'`, `value: 0`.
 */
export interface CityMetric {
  readonly id: CityMetricId;
  readonly label: string;
  readonly unit: CityMetricUnit;
  readonly state: CityMetricState;
  readonly value: number | null;
  readonly sampleSize: number | null;
  readonly reason: CityMetricReason | null;
}

/** One metric observation produced by a real provider (for example the 137 comfort/violation source). */
export interface CityMetricObservation {
  readonly state: CityMetricState;
  readonly value: number | null;
  readonly sampleSize: number | null;
  readonly reason: CityMetricReason | null;
}

/** Observation window for every rate in the dashboard; the same unavailable-vs-zero rule applies. */
export interface CityExposure {
  readonly state: CityMetricState;
  readonly windows: number | null;
  readonly observations: number | null;
  readonly durationSeconds: number | null;
  readonly reason: CityMetricReason | null;
}

/**
 * One real incident. `positionM` is `null` when the source does not provide a coordinate; an
 * incident without a position cannot be located on the map.
 */
export interface CityIncident {
  readonly incidentId: string;
  readonly kind: CityIncidentKind;
  readonly tick: number;
  readonly vehicleId: string;
  readonly rideId: string | null;
  readonly severity: CityIncidentSeverity;
  readonly positionM: CityIncidentPositionM | null;
  readonly label: string;
  readonly detail: string;
}

/** One accepted dashboard frame. Every value is a read model; the dashboard invents none of them. */
export interface CityDashboardSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof CITY_DASHBOARD_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly metrics: readonly CityMetric[];
  /** Deterministically ordered by `tick` descending, then `incidentId` ascending. */
  readonly incidents: readonly CityIncident[];
  readonly selectedIncidentId: string | null;
  readonly exposure: CityExposure;
}

/** The only effect of selecting an incident: a map focus, or an explicit reason why it cannot focus. */
export type CityFocusIntent =
  | {
      readonly status: 'AVAILABLE';
      readonly incidentId: string;
      readonly positionM: CityIncidentPositionM;
    }
  | { readonly status: 'UNAVAILABLE'; readonly reason: CityFocusUnavailableReason };

export interface CityMetricView {
  readonly id: CityMetricId;
  readonly label: string;
  readonly unit: CityMetricUnit;
  readonly state: CityMetricState;
  readonly stateLabel: string;
  /** "0" for a real zero, "Indisponibil" when unavailable; never a fabricated number. */
  readonly valueLabel: string;
  readonly unitLabel: string;
  readonly sampleLabel: string;
  readonly reason: CityMetricReason | null;
  readonly reasonLabel: string;
  readonly description: string;
}

export interface CityExposureView {
  readonly state: CityMetricState;
  readonly stateLabel: string;
  readonly windowsLabel: string;
  readonly observationsLabel: string;
  readonly durationLabel: string;
  readonly reason: CityMetricReason | null;
  readonly reasonLabel: string;
  readonly summary: string;
  readonly description: string;
}

export interface CityIncidentRow {
  readonly incidentId: string;
  readonly kind: CityIncidentKind;
  readonly kindLabel: string;
  readonly severity: CityIncidentSeverity;
  readonly severityLabel: string;
  readonly tick: number;
  readonly tickLabel: string;
  readonly vehicleId: string;
  readonly rideId: string | null;
  readonly rideLabel: string;
  /** "x 12.3 m, z -4.0 m" or "Poziție indisponibilă". */
  readonly positionLabel: string;
  /** `true` exactly when `positionM` is a finite point; only then can the map focus. */
  readonly located: boolean;
  readonly selected: boolean;
  readonly label: string;
  readonly description: string;
}

export type CityDrilldownStatus = 'AVAILABLE' | 'UNAVAILABLE';
export type CityDrilldownReason = CityFocusUnavailableReason | 'NO_SELECTION';

export interface CityIncidentDrilldown {
  readonly status: CityDrilldownStatus;
  readonly reason: CityDrilldownReason | null;
  readonly incidentId: string | null;
  readonly title: string;
  readonly positionLabel: string;
  /** Metric context lines; an unavailable metric keeps its "Indisponibil" text here. */
  readonly metricLines: readonly string[];
  readonly detailLines: readonly string[];
  readonly summary: string;
}

export interface CityIncidentSelection {
  readonly incidentId: string;
  /** The projected row, or `null` when the id is not in this frame. */
  readonly row: CityIncidentRow | null;
  readonly focus: CityFocusIntent;
  readonly drilldown: CityIncidentDrilldown;
}

export interface CityDashboardCounts {
  readonly metrics: number;
  readonly availableMetrics: number;
  readonly unavailableMetrics: number;
  readonly incidents: number;
  readonly collisions: number;
  readonly blockages: number;
  readonly violations: number;
  readonly comfort: number;
  readonly located: number;
  readonly unlocated: number;
  readonly selected: number;
}

export interface CityDashboardView {
  readonly tick: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly metrics: readonly CityMetricView[];
  readonly exposure: CityExposureView;
  readonly rows: readonly CityIncidentRow[];
  readonly counts: CityDashboardCounts;
  readonly drilldown: CityIncidentDrilldown;
  /** Human-readable summary published in the polite live region. */
  readonly summary: string;
  /** Deterministic change signature; an identical frame writes nothing. */
  readonly signature: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plain(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be plain data`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const data = plain(value, label),
    names = Reflect.ownKeys(data);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail(`${label} fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(`${label} descriptors`);
  }
  return data;
}

function identity(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > CITY_DASHBOARD_LIMITS.idCodeUnits
  )
    fail(`${label} identity`);
  return value;
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(`${label} text`);
  return value;
}

function count(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${label} must be a nonnegative integer`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value))
    fail(`${label} choice`);
  return value as T;
}

function parsePosition(value: unknown): CityIncidentPositionM | null {
  if (value === null) return null;
  const point = exact(value, ['x', 'y', 'z'], 'City incident position');
  return Object.freeze({
    x: finite(point.x, 'City incident position x'),
    y: finite(point.y, 'City incident position y'),
    z: finite(point.z, 'City incident position z'),
  });
}

/**
 * A metric is either a certified number or an explicit unavailable value. The parser rejects the
 * two forbidden shortcuts: `UNAVAILABLE` carrying a value (a fake zero) and `AVAILABLE` without one.
 */
function parseMetric(value: unknown): CityMetric {
  const entry = exact(
      value,
      ['id', 'label', 'unit', 'state', 'value', 'sampleSize', 'reason'],
      'City metric',
    ),
    id = choice(entry.id, CITY_METRIC_IDS, 'City metric id'),
    unit = choice(entry.unit, CITY_METRIC_UNITS, 'City metric unit'),
    state = choice(entry.state, CITY_METRIC_STATES, 'City metric state');
  if (unit !== CITY_METRIC_UNIT_BY_ID[id]) fail('City metric unit does not match its identity');
  const label = boundedText(entry.label, CITY_DASHBOARD_LIMITS.metricLabelCodeUnits, 'City metric');
  const sampleSize =
    entry.sampleSize === null ? null : count(entry.sampleSize, 'City metric sample');
  if (state === 'UNAVAILABLE') {
    if (entry.value !== null) fail('City unavailable metric must not carry a value');
    const reason = choice(entry.reason, CITY_METRIC_REASONS, 'City metric reason');
    return Object.freeze({
      id,
      label,
      unit,
      state,
      value: null,
      sampleSize,
      reason,
    });
  }
  if (entry.reason !== null) fail('City available metric must not carry a reason');
  const number = finite(entry.value, 'City metric value');
  if (number < 0) fail('City metric value must be nonnegative');
  if ((unit === 'rides' || unit === 'count') && !Number.isSafeInteger(number))
    fail('City count metric must be an integer');
  return Object.freeze({ id, label, unit, state, value: number, sampleSize, reason: null });
}

function parseExposure(value: unknown): CityExposure {
  const entry = exact(
      value,
      ['state', 'windows', 'observations', 'durationSeconds', 'reason'],
      'City exposure',
    ),
    state = choice(entry.state, CITY_METRIC_STATES, 'City exposure state');
  if (state === 'UNAVAILABLE') {
    if (entry.windows !== null || entry.observations !== null || entry.durationSeconds !== null)
      fail('City unavailable exposure must not carry a value');
    return Object.freeze({
      state,
      windows: null,
      observations: null,
      durationSeconds: null,
      reason: choice(entry.reason, CITY_METRIC_REASONS, 'City exposure reason'),
    });
  }
  if (entry.reason !== null) fail('City available exposure must not carry a reason');
  const durationSeconds = finite(entry.durationSeconds, 'City exposure duration');
  if (durationSeconds < 0) fail('City exposure duration must be nonnegative');
  return Object.freeze({
    state,
    windows: count(entry.windows, 'City exposure windows'),
    observations: count(entry.observations, 'City exposure observations'),
    durationSeconds,
    reason: null,
  });
}

function parseIncident(value: unknown): CityIncident {
  const entry = exact(
      value,
      [
        'incidentId',
        'kind',
        'tick',
        'vehicleId',
        'rideId',
        'severity',
        'positionM',
        'label',
        'detail',
      ],
      'City incident',
    ),
    label = boundedText(entry.label, CITY_DASHBOARD_LIMITS.labelCodeUnits, 'City incident'),
    detail = boundedText(entry.detail, CITY_DASHBOARD_LIMITS.detailCodeUnits, 'City incident');
  return Object.freeze({
    incidentId: identity(entry.incidentId, 'City incident'),
    kind: choice(entry.kind, CITY_INCIDENT_KINDS, 'City incident kind'),
    tick: count(entry.tick, 'City incident tick'),
    vehicleId: identity(entry.vehicleId, 'City incident vehicle'),
    rideId: entry.rideId === null ? null : identity(entry.rideId, 'City incident ride'),
    severity: choice(entry.severity, CITY_INCIDENT_SEVERITIES, 'City incident severity'),
    positionM: parsePosition(entry.positionM),
    label,
    detail,
  });
}

/**
 * Incident order is part of the contract: newest tick first, then the stable incident id. The parser
 * re-orders any accepted frame, so the DOM order never depends on the source array order.
 */
export function compareCityIncidents(left: CityIncident, right: CityIncident): number {
  return right.tick - left.tick || compareText(left.incidentId, right.incidentId);
}

/** Validates, normalizes and freezes one frame before any DOM work happens. */
export function parseCityDashboardSnapshot(value: unknown): CityDashboardSnapshot {
  const data = exact(
    value,
    [
      'schemaVersion',
      'units',
      'version',
      'sessionId',
      'worldEpoch',
      'tick',
      'metrics',
      'incidents',
      'selectedIncidentId',
      'exposure',
    ],
    'City dashboard snapshot',
  );
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== CITY_DASHBOARD_VERSION)
    fail('City dashboard contract');
  if (!Array.isArray(data.metrics)) fail('City dashboard metric list');
  if (data.metrics.length > CITY_DASHBOARD_LIMITS.metrics) fail('City dashboard metric ceiling');
  if (!Array.isArray(data.incidents)) fail('City dashboard incident list');
  if (data.incidents.length > CITY_DASHBOARD_LIMITS.incidents)
    fail('City dashboard incident ceiling');
  const parsedMetrics = data.metrics.map(parseMetric),
    metricsById = new Map<CityMetricId, CityMetric>();
  for (const metric of parsedMetrics) {
    if (metricsById.has(metric.id)) fail('City dashboard duplicate metric');
    metricsById.set(metric.id, metric);
  }
  const metrics = Object.freeze(
      CITY_METRIC_IDS.filter((id) => metricsById.has(id)).map((id) => metricsById.get(id)!),
    ),
    parsedIncidents = data.incidents.map(parseIncident),
    seen = new Set<string>();
  for (const incident of parsedIncidents) {
    if (seen.has(incident.incidentId)) fail('City dashboard duplicate incident');
    seen.add(incident.incidentId);
  }
  const incidents = Object.freeze(parsedIncidents.slice().sort(compareCityIncidents));
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: CITY_DASHBOARD_VERSION,
    sessionId: identity(data.sessionId, 'City dashboard session'),
    worldEpoch: count(data.worldEpoch, 'City dashboard world epoch'),
    tick: count(data.tick, 'City dashboard tick'),
    metrics,
    incidents,
    selectedIncidentId:
      data.selectedIncidentId === null
        ? null
        : identity(data.selectedIncidentId, 'City dashboard selected incident'),
    exposure: parseExposure(data.exposure),
  });
}

function metricValueLabel(metric: CityMetric): string {
  if (metric.state === 'UNAVAILABLE' || metric.value === null)
    return CITY_DASHBOARD_UNAVAILABLE_VALUE;
  switch (metric.unit) {
    case 's':
      return formatDuration(metric.value);
    case 'm':
      return `${Math.round(metric.value)} m`;
    case 'score':
      return String(Number(metric.value.toFixed(1)));
    default:
      return String(metric.value);
  }
}

/** Unavailable is text plus `data-state`, never colour alone. */
export function cityMetricView(metric: CityMetric): CityMetricView {
  const valueLabel = metricValueLabel(metric),
    stateLabel = CITY_METRIC_STATE_LABELS[metric.state],
    reasonLabel = metric.reason === null ? '' : CITY_METRIC_REASON_LABELS[metric.reason],
    sampleLabel =
      metric.sampleSize === null ? 'eșantion indisponibil' : `eșantion ${metric.sampleSize}`,
    unitLabel = CITY_METRIC_UNIT_LABELS[metric.unit],
    description =
      metric.state === 'AVAILABLE'
        ? `${metric.label}: ${valueLabel} ${unitLabel}, ${stateLabel}, ${sampleLabel}.`
        : `${metric.label}: ${valueLabel}, motiv ${reasonLabel}.`;
  return Object.freeze({
    id: metric.id,
    label: metric.label,
    unit: metric.unit,
    state: metric.state,
    stateLabel,
    valueLabel,
    unitLabel,
    sampleLabel,
    reason: metric.reason,
    reasonLabel,
    description,
  });
}

export function cityExposureView(exposure: CityExposure): CityExposureView {
  const stateLabel = CITY_METRIC_STATE_LABELS[exposure.state],
    reasonLabel = exposure.reason === null ? '' : CITY_METRIC_REASON_LABELS[exposure.reason];
  if (exposure.state === 'UNAVAILABLE' || exposure.windows === null)
    return Object.freeze({
      state: 'UNAVAILABLE' as const,
      stateLabel,
      windowsLabel: CITY_DASHBOARD_UNAVAILABLE_VALUE,
      observationsLabel: CITY_DASHBOARD_UNAVAILABLE_VALUE,
      durationLabel: CITY_DASHBOARD_UNAVAILABLE_VALUE,
      reason: exposure.reason,
      reasonLabel,
      summary: `Expunere: ${CITY_DASHBOARD_UNAVAILABLE_VALUE}, motiv ${reasonLabel}.`,
      description: `Expunere indisponibilă, motiv ${reasonLabel}. Valorile lipsă nu sunt zero.`,
    });
  const windowsLabel = String(exposure.windows ?? 0),
    observationsLabel = String(exposure.observations ?? 0),
    durationLabel = formatDuration(exposure.durationSeconds ?? 0);
  return Object.freeze({
    state: 'AVAILABLE' as const,
    stateLabel,
    windowsLabel,
    observationsLabel,
    durationLabel,
    reason: null,
    reasonLabel,
    summary: `Expunere: ${windowsLabel} ferestre, ${observationsLabel} observații, ${durationLabel}.`,
    description: `Expunere observată: ${windowsLabel} ferestre, ${observationsLabel} observații, ${durationLabel}.`,
  });
}

function positionLabelOf(positionM: CityIncidentPositionM | null): string {
  if (positionM === null) return CITY_DASHBOARD_UNAVAILABLE_POSITION;
  return `x ${positionM.x.toFixed(1)} m, z ${positionM.z.toFixed(1)} m`;
}

export function cityIncidentRow(incident: CityIncident, selected: boolean): CityIncidentRow {
  const kindLabel = CITY_INCIDENT_KIND_LABELS[incident.kind],
    severityLabel = CITY_INCIDENT_SEVERITY_LABELS[incident.severity],
    tickLabel = `tick ${incident.tick}`,
    rideLabel = incident.rideId === null ? 'fără cursă' : incident.rideId,
    positionLabel = positionLabelOf(incident.positionM),
    located = incident.positionM !== null,
    label = `${kindLabel} · ${severityLabel} · ${incident.vehicleId}`,
    description = [
      `${kindLabel} ${incident.incidentId}`,
      severityLabel,
      tickLabel,
      `vehicul ${incident.vehicleId}`,
      `cursă ${rideLabel}`,
      positionLabel,
      located ? 'localizabil pe hartă' : 'nu poate fi localizat',
      selected ? 'incident selectat' : 'neselectat',
    ].join('; ');
  return Object.freeze({
    incidentId: incident.incidentId,
    kind: incident.kind,
    kindLabel,
    severity: incident.severity,
    severityLabel,
    tick: incident.tick,
    tickLabel,
    vehicleId: incident.vehicleId,
    rideId: incident.rideId,
    rideLabel,
    positionLabel,
    located,
    selected,
    label,
    description,
  });
}

function metricContextLines(snapshot: CityDashboardSnapshot): readonly string[] {
  return Object.freeze(
    snapshot.metrics.map((metric) => {
      const view = cityMetricView(metric);
      return view.state === 'AVAILABLE'
        ? `${view.label}: ${view.valueLabel}`
        : `${view.label}: ${CITY_DASHBOARD_UNAVAILABLE_VALUE} (${view.reasonLabel})`;
    }),
  );
}

function unavailableDrilldown(
  reason: CityDrilldownReason,
  incidentId: string | null,
  metricLines: readonly string[],
): CityIncidentDrilldown {
  const title =
    reason === 'NO_SELECTION'
      ? CITY_DASHBOARD_NO_INCIDENT
      : reason === 'MISSING_INCIDENT'
        ? 'Incidentul selectat nu mai există în cadru'
        : CITY_DASHBOARD_UNAVAILABLE_POSITION;
  const reasonText =
    reason === 'NO_SELECTION'
      ? 'Selectează un incident din listă pentru a-l localiza pe hartă.'
      : reason === 'MISSING_INCIDENT'
        ? 'Selectarea nu schimbă profilul; incidentul nu poate fi localizat.'
        : 'Incidentul nu are o poziție reală, deci nu este trimisă nicio intenție de hartă.';
  return Object.freeze({
    status: 'UNAVAILABLE' as const,
    reason,
    incidentId,
    title,
    positionLabel: CITY_DASHBOARD_UNAVAILABLE_POSITION,
    metricLines,
    detailLines: Object.freeze([reasonText]),
    summary: `${title}. ${reasonText}`,
  });
}

/**
 * Pure incident selection. It never touches a profile, camera mode, authority or physics: the whole
 * result is the selected view plus (at most) one map-focus intent for an incident with a real point.
 */
export function selectIncident(
  snapshot: CityDashboardSnapshot,
  incidentId: string,
): CityIncidentSelection {
  const metricLines = metricContextLines(snapshot);
  if (typeof incidentId !== 'string' || !incidentId.trim())
    return Object.freeze({
      incidentId: '',
      row: null,
      focus: Object.freeze({ status: 'UNAVAILABLE' as const, reason: 'MISSING_INCIDENT' as const }),
      drilldown: unavailableDrilldown('MISSING_INCIDENT', null, metricLines),
    });
  const incident = snapshot.incidents.find((entry) => entry.incidentId === incidentId) ?? null;
  if (incident === null)
    return Object.freeze({
      incidentId,
      row: null,
      focus: Object.freeze({ status: 'UNAVAILABLE' as const, reason: 'MISSING_INCIDENT' as const }),
      drilldown: unavailableDrilldown('MISSING_INCIDENT', incidentId, metricLines),
    });
  const row = cityIncidentRow(incident, true),
    positionM = incident.positionM;
  if (positionM === null)
    return Object.freeze({
      incidentId,
      row,
      focus: Object.freeze({ status: 'UNAVAILABLE' as const, reason: 'MISSING_POSITION' as const }),
      drilldown: Object.freeze({
        status: 'UNAVAILABLE' as const,
        reason: 'MISSING_POSITION' as const,
        incidentId,
        title: `${row.kindLabel} · ${row.severityLabel}`,
        positionLabel: CITY_DASHBOARD_UNAVAILABLE_POSITION,
        metricLines,
        detailLines: Object.freeze([
          `${row.tickLabel} · vehicul ${row.vehicleId}`,
          `cursă ${row.rideLabel}`,
          incident.detail,
        ]),
        summary: `${row.kindLabel} ${row.severityLabel}, ${row.tickLabel}, vehicul ${row.vehicleId}, ${CITY_DASHBOARD_UNAVAILABLE_POSITION}. Nu este trimisă nicio intenție de hartă.`,
      }),
    });
  return Object.freeze({
    incidentId,
    row,
    focus: Object.freeze({ status: 'AVAILABLE' as const, incidentId, positionM }),
    drilldown: Object.freeze({
      status: 'AVAILABLE' as const,
      reason: null,
      incidentId,
      title: `${row.kindLabel} · ${row.severityLabel}`,
      positionLabel: row.positionLabel,
      metricLines,
      detailLines: Object.freeze([
        `${row.tickLabel} · vehicul ${row.vehicleId}`,
        `cursă ${row.rideLabel}`,
        incident.detail,
      ]),
      summary: `${row.kindLabel} ${row.severityLabel}, ${row.tickLabel}, vehicul ${row.vehicleId}, poziție ${row.positionLabel}. Selectarea nu schimbă profilul.`,
    }),
  });
}

/**
 * Pure projection shared by the DOM adapter, the tests and the evidence report. Incident rows are
 * re-ordered deterministically, so a source array order never leaks into the DOM.
 */
export function projectCityDashboard(snapshot: CityDashboardSnapshot): CityDashboardView {
  const metrics = Object.freeze(snapshot.metrics.map(cityMetricView)),
    exposure = cityExposureView(snapshot.exposure),
    selection =
      snapshot.selectedIncidentId === null
        ? null
        : selectIncident(snapshot, snapshot.selectedIncidentId),
    ordered = snapshot.incidents.slice().sort(compareCityIncidents),
    rows = Object.freeze(
      ordered.map((incident) =>
        cityIncidentRow(incident, snapshot.selectedIncidentId === incident.incidentId),
      ),
    );
  let collisions = 0,
    blockages = 0,
    violations = 0,
    comfort = 0,
    located = 0,
    selectedRows = 0;
  for (const row of rows) {
    if (row.kind === 'COLLISION') collisions += 1;
    else if (row.kind === 'BLOCKAGE') blockages += 1;
    else if (row.kind === 'VIOLATION') violations += 1;
    else comfort += 1;
    if (row.located) located += 1;
    if (row.selected) selectedRows += 1;
  }
  const availableMetrics = metrics.filter((metric) => metric.state === 'AVAILABLE').length,
    counts: CityDashboardCounts = Object.freeze({
      metrics: metrics.length,
      availableMetrics,
      unavailableMetrics: metrics.length - availableMetrics,
      incidents: rows.length,
      collisions,
      blockages,
      violations,
      comfort,
      located,
      unlocated: rows.length - located,
      selected: selectedRows,
    }),
    drilldown =
      selection === null
        ? unavailableDrilldown('NO_SELECTION', null, metricContextLines(snapshot))
        : selection.drilldown,
    summary =
      `Tabloul orașului: ${counts.availableMetrics} din ${counts.metrics} indicatori disponibili, ` +
      `${exposure.summary}` +
      ` ${counts.incidents} evenimente, ${counts.located} localizabile; ` +
      (selection === null ? CITY_DASHBOARD_NO_INCIDENT + '.' : `selectat ${selection.incidentId}.`),
    signature = JSON.stringify([
      CITY_DASHBOARD_VERSION,
      snapshot.sessionId,
      snapshot.worldEpoch,
      snapshot.tick,
      metrics.map((metric) => [
        metric.id,
        metric.state,
        metric.valueLabel,
        metric.sampleLabel,
        metric.reason,
      ]),
      [exposure.state, exposure.windowsLabel, exposure.observationsLabel, exposure.durationLabel],
      rows.map((row) => [
        row.incidentId,
        row.kind,
        row.severity,
        row.tick,
        row.positionLabel,
        row.selected,
      ]),
      drilldown.status,
      drilldown.reason,
      drilldown.title,
      drilldown.positionLabel,
      drilldown.detailLines,
      drilldown.metricLines,
    ]);
  return Object.freeze({
    tick: snapshot.tick,
    sessionId: snapshot.sessionId,
    worldEpoch: snapshot.worldEpoch,
    metrics,
    exposure,
    rows,
    counts,
    drilldown,
    summary,
    signature,
  });
}

/**
 * Incident-set fingerprint used by the adapter to bypass the write ceiling when an incident appears,
 * disappears or changes its locatable state. Selection is part of it, so a selection is immediate.
 */
export function cityDashboardIncidentSignature(snapshot: CityDashboardSnapshot): string {
  return JSON.stringify([
    snapshot.selectedIncidentId,
    snapshot.incidents.map((incident) => [
      incident.incidentId,
      incident.kind,
      incident.tick,
      incident.positionM === null ? null : [incident.positionM.x, incident.positionM.y],
    ]),
  ]);
}
