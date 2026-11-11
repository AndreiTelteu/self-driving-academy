import type { KpiImpactRead } from '../economy';
import type { MissionCompletionResult } from '../missions';

/**
 * 214 short feedback of the commercial consequences.
 *
 * The feedback is a read-only projection of three **separate** planes:
 *
 * - **mission** — the result of the real 116/125 settlement (completed, failed, refused), which
 *   never debits progress: a failure or a repeated delivery carries `xpGranted: 0`;
 * - **fidelity** — the control mode and the real 139 comfort evidence of the ride;
 * - **service** — the 209 KPI read model (`KpiImpactRead`), copied field by field.
 *
 * The module never reads a ledger, recomputes a KPI or invents a consequence: the service numbers
 * are the retained 209 buckets, and the validator refuses a snapshot whose sums, average, histogram
 * or directions contradict those numbers. No plane and no attribute may promise an XP loss; the
 * closed fragment list is asserted over the generated text and exposed for the tests and the report.
 */
export const KPI_IMPACT_UI_VERSION = '214-kpi-impact-feedback-v1' as const;
/** Mirror of the 214 economy contract; the tests assert equality with `KPI_IMPACT_VERSION`. */
export const KPI_IMPACT_SERVICE_VERSION = '214-kpi-impact-v1' as const;

export const KPI_IMPACT_PLANES = ['MISSION', 'FIDELITY', 'SERVICE'] as const;
export type KpiImpactPlane = (typeof KPI_IMPACT_PLANES)[number];

export const KPI_IMPACT_MISSION_STATES = ['COMPLETED', 'FAILED', 'REFUSED', 'NONE'] as const;
export type KpiImpactMissionState = (typeof KPI_IMPACT_MISSION_STATES)[number];

export const KPI_IMPACT_CONTROL_MODES = ['MANUAL', 'LEARNING', 'AUTO'] as const;
export type KpiImpactControlMode = (typeof KPI_IMPACT_CONTROL_MODES)[number];

export const KPI_IMPACT_DIRECTIONS = ['UP', 'DOWN', 'FLAT', 'UNKNOWN'] as const;
export type KpiImpactDirection = (typeof KPI_IMPACT_DIRECTIONS)[number];

export const KPI_IMPACT_STATES = ['COMPARABLE', 'NO_BASELINE', 'NO_EVENT'] as const;
export type KpiImpactState = (typeof KPI_IMPACT_STATES)[number];

export const KPI_IMPACT_RATING_AVAILABILITY = [
  'AVAILABLE',
  'CURRENT_EMPTY',
  'BASELINE_EMPTY',
  'NO_BASELINE',
] as const;
export type KpiImpactRatingAvailability = (typeof KPI_IMPACT_RATING_AVAILABILITY)[number];

export const KPI_IMPACT_INCIDENT_STATES = ['NONE', 'PRESENT', 'INCREASED'] as const;
export type KpiImpactIncidentState = (typeof KPI_IMPACT_INCIDENT_STATES)[number];

export const KPI_IMPACT_TONES = ['POSITIVE', 'NEUTRAL', 'MIXED', 'NEGATIVE'] as const;
export type KpiImpactTone = (typeof KPI_IMPACT_TONES)[number];

/**
 * Closed fragments that would promise a loss of progress. They must never appear in a consequence
 * message or in a `data-*` attribute; the report asserts this over every generated string.
 */
export const KPI_IMPACT_FORBIDDEN_FRAGMENTS = Object.freeze([
  '-xp',
  'pierdere',
  'penalizare',
  'penalty',
  'xp negativ',
]);

export const KPI_IMPACT_LIMITS = Object.freeze({
  version: KPI_IMPACT_UI_VERSION,
  /** Feedback planes; the UI never merges them into one message. */
  planes: 3,
  /** Code units per session, namespace and mission identity. */
  idCodeUnits: 256,
  /** Code units per generated line. */
  lineCodeUnits: 512,
  /** Bounded evidence numbers of the fidelity plane. */
  controlIntervals: 1_000_000,
  /** The 0–5 review scale. */
  maximumRating: 5,
  /** Whole XP one settlement can grant, mirroring the 213 authored ceiling. */
  maximumXp: 1_000_000,
  globalListeners: 0,
  historyScans: 0,
});

export const KPI_IMPACT_TEXT = Object.freeze({
  heading: 'Consecințele cursei',
  description:
    'Trei planuri separate: rezultatul misiunii, fidelitatea stilului și consecințele de serviciu. ' +
    'Cifrele de serviciu sunt agregatele 209 reale, citite fără rescanarea ledgerului; nicio ' +
    'consecință nu modifică XP sau nivelul.',
  empty: 'Nicio consecință de afișat încă.',
  none: 'Niciuna',
  unavailable: 'indisponibil',
  planes: Object.freeze({
    MISSION: 'Rezultatul misiunii',
    FIDELITY: 'Fidelitatea stilului',
    SERVICE: 'Consecințele de serviciu',
  }),
  missionStates: Object.freeze({
    COMPLETED: 'Finalizată',
    FAILED: 'Eșuată',
    REFUSED: 'Refuzată',
    NONE: 'Fără misiune',
  }),
  modes: Object.freeze({
    MANUAL: 'MANUAL',
    LEARNING: 'LEARNING',
    AUTO: 'AUTO',
  }),
  directions: Object.freeze({
    UP: 'în creștere',
    DOWN: 'în scădere',
    FLAT: 'staționar',
    UNKNOWN: 'fără comparație',
  }),
  availability: Object.freeze({
    AVAILABLE: 'comparație disponibilă',
    CURRENT_EMPTY: 'ziua curentă nu are review-uri',
    BASELINE_EMPTY: 'ziua precedentă nu are review-uri',
    NO_BASELINE: 'ziua precedentă nu are date',
  }),
  incidents: Object.freeze({
    NONE: 'fără incidente',
    PRESENT: 'incidente prezente',
    INCREASED: 'incidente în creștere',
  }),
  states: Object.freeze({
    COMPARABLE: 'comparație cu ziua precedentă',
    NO_BASELINE: 'prima zi cu date',
    NO_EVENT: 'fără evenimente comerciale',
  }),
  labels: Object.freeze({
    mission: 'Misiune',
    attempt: 'Încercare',
    reward: 'Recompensă',
    duplicate: 'Livrare repetată',
    mode: 'Mod de control',
    intervals: 'Intervale de confort',
    comfort: 'Confort evaluat',
    revenue: 'Venit',
    rating: 'Rating',
    reviews: 'Review-uri',
    incidents: 'Incidente de serviciu',
    lowRatings: 'Review-uri cu nota 2 sau mai mică',
    previousDay: 'Ziua precedentă',
    currentDay: 'Ziua curentă',
  }),
});

export interface KpiImpactServiceDay {
  readonly periodId: string;
  readonly index: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly completeness: 'COMPLETE' | 'PARTIAL';
  readonly currency: string;
  readonly revenueMinorUnits: number;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly terminalRides: number;
  readonly incidentRides: number;
  readonly reviewCount: number;
  readonly ratingSum: number;
  readonly averageRating: number | null;
  readonly lowRatingReviews: number;
  readonly ratingHistogram: readonly number[];
}

export interface KpiImpactServiceDelta {
  readonly revenueMinorUnits: number;
  readonly revenueDirection: KpiImpactDirection;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly terminalRides: number;
  readonly incidentRides: number;
  readonly incidentState: KpiImpactIncidentState;
  readonly reviewCount: number;
  readonly ratingDelta: number | null;
  readonly ratingDirection: KpiImpactDirection;
  readonly ratingAvailability: KpiImpactRatingAvailability;
  readonly lowRatingReviews: number;
  readonly lowRatingDelta: number;
}

/** The 209 read model, copied verbatim from `selectKpiImpact`. */
export interface KpiImpactServiceRead {
  readonly version: string;
  readonly tick: number;
  readonly currency: string;
  readonly state: KpiImpactState;
  readonly currentDayMatchesTick: boolean;
  readonly current: KpiImpactServiceDay | null;
  readonly previous: KpiImpactServiceDay | null;
  readonly delta: KpiImpactServiceDelta;
  readonly xp: Readonly<{ debits: 0; credits: 0; negativeCredits: false }>;
  readonly historyScans: 0;
}

export interface KpiImpactMissionResult {
  readonly state: KpiImpactMissionState;
  readonly missionId: string | null;
  readonly attempt: number | null;
  /** Whole XP the real 125 settlement granted; never negative. A failure or refusal carries `0`. */
  readonly xpGranted: number;
  /** A repeated delivery pays nothing; the field is kept to prove it. */
  readonly duplicateXp: number;
}

export interface KpiImpactFidelity {
  readonly controlMode: KpiImpactControlMode;
  /** Real 139 passenger intervals the comfort term came from; `0` without telemetry. */
  readonly controlIntervals: number;
  /** Real 139 comfort term in review points, `0..5`; `null` without passenger telemetry. */
  readonly comfortPenalty: number | null;
}

export interface KpiImpactSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof KPI_IMPACT_UI_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly namespace: string;
  readonly mission: KpiImpactMissionResult;
  readonly fidelity: KpiImpactFidelity;
  readonly service: KpiImpactServiceRead;
}

export interface KpiImpactMetricView {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface KpiImpactPlaneView {
  readonly plane: KpiImpactPlane;
  readonly title: string;
  readonly state: string;
  readonly stateLabel: string;
  readonly headline: string;
  readonly details: readonly string[];
  readonly metrics: readonly KpiImpactMetricView[];
  readonly tone: KpiImpactTone;
  readonly text: string;
}

export interface KpiImpactView {
  readonly signature: string;
  readonly tick: number;
  readonly heading: string;
  readonly description: string;
  readonly empty: boolean;
  readonly ariaLabel: string;
  readonly mission: KpiImpactPlaneView;
  readonly fidelity: KpiImpactPlaneView;
  readonly service: KpiImpactPlaneView;
  /** The three planes in a stable order; they are never merged into one message. */
  readonly planes: readonly KpiImpactPlaneView[];
  /** Directions of the 209 deltas, copied so the HUD can expose them as attributes. */
  readonly directions: Readonly<{
    readonly revenue: KpiImpactDirection;
    readonly rating: KpiImpactDirection;
    readonly incidents: KpiImpactIncidentState;
  }>;
  readonly text: string;
  readonly xp: Readonly<{ debits: 0; credits: 0; negativeCredits: false }>;
  readonly historyScans: 0;
}

// ---------------------------------------------------------------------------------------------
// Strict plain-data readers. The UI cannot import the domain validators, so it validates the
// composed snapshot itself and refuses anything the 209 read model cannot report.
// ---------------------------------------------------------------------------------------------

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(`${label} must be plain data`);
  const data: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new Error(`${label} keys`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error(`${label} descriptors`);
    data[key] = descriptor.value;
  }
  return data;
}

function fields(data: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(data))
    if (!allowed.includes(key)) throw new Error(`${label} has an unknown field: ${key}`);
  for (const key of allowed)
    if (!Object.prototype.hasOwnProperty.call(data, key))
      throw new Error(`${label} is missing the field: ${key}`);
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > KPI_IMPACT_LIMITS.idCodeUnits
  )
    throw new Error(`KPI impact ${label} identity`);
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error(`KPI impact ${label} number`);
  return value;
}

function nonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`KPI impact ${label} number`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`KPI impact ${label} number`);
  return value;
}

function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value))
    throw new Error(`KPI impact ${label} vocabulary`);
  return value as T;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function directionOf(delta: number): KpiImpactDirection {
  if (delta > 0) return 'UP';
  if (delta < 0) return 'DOWN';
  return 'FLAT';
}

const serviceDayFields = [
  'periodId',
  'index',
  'startTick',
  'endTick',
  'completeness',
  'currency',
  'revenueMinorUnits',
  'completedRides',
  'failedRides',
  'cancelledRides',
  'terminalRides',
  'incidentRides',
  'reviewCount',
  'ratingSum',
  'averageRating',
  'lowRatingReviews',
  'ratingHistogram',
] as const;

const serviceDeltaFields = [
  'revenueMinorUnits',
  'revenueDirection',
  'completedRides',
  'failedRides',
  'cancelledRides',
  'terminalRides',
  'incidentRides',
  'incidentState',
  'reviewCount',
  'ratingDelta',
  'ratingDirection',
  'ratingAvailability',
  'lowRatingReviews',
  'lowRatingDelta',
] as const;

const serviceFields = [
  'version',
  'tick',
  'currency',
  'state',
  'currentDayMatchesTick',
  'current',
  'previous',
  'delta',
  'xp',
  'historyScans',
] as const;

const missionFields = ['state', 'missionId', 'attempt', 'xpGranted', 'duplicateXp'] as const;
const fidelityFields = ['controlMode', 'controlIntervals', 'comfortPenalty'] as const;
const snapshotFields = [
  'schemaVersion',
  'units',
  'version',
  'sessionId',
  'worldEpoch',
  'tick',
  'namespace',
  'mission',
  'fidelity',
  'service',
] as const;

function parseServiceDay(value: unknown): KpiImpactServiceDay {
  const data = record(value, 'KPI impact service day');
  fields(data, serviceDayFields, 'KPI impact service day');
  const index = integer(data.index, 0, Number.MAX_SAFE_INTEGER, 'day index'),
    revenueMinorUnits = integer(data.revenueMinorUnits, 0, Number.MAX_SAFE_INTEGER, 'day revenue'),
    completedRides = integer(
      data.completedRides,
      0,
      Number.MAX_SAFE_INTEGER,
      'day completed rides',
    ),
    failedRides = integer(data.failedRides, 0, Number.MAX_SAFE_INTEGER, 'day failed rides'),
    cancelledRides = integer(
      data.cancelledRides,
      0,
      Number.MAX_SAFE_INTEGER,
      'day cancelled rides',
    ),
    terminalRides = integer(data.terminalRides, 0, Number.MAX_SAFE_INTEGER, 'day terminal rides'),
    incidentRides = integer(data.incidentRides, 0, Number.MAX_SAFE_INTEGER, 'day incident rides'),
    reviewCount = integer(data.reviewCount, 0, Number.MAX_SAFE_INTEGER, 'day review count'),
    ratingSum = integer(data.ratingSum, 0, Number.MAX_SAFE_INTEGER, 'day rating sum'),
    lowRatingReviews = integer(
      data.lowRatingReviews,
      0,
      Number.MAX_SAFE_INTEGER,
      'day low ratings',
    );
  if (terminalRides !== completedRides + failedRides + cancelledRides)
    throw new Error('KPI impact day terminal rides are not the sum of its states');
  if (incidentRides !== failedRides + cancelledRides)
    throw new Error('KPI impact day incidents are not its failed and cancelled rides');
  if (!Array.isArray(data.ratingHistogram) || data.ratingHistogram.length !== 6)
    throw new Error('KPI impact day histogram is invalid');
  const ratingHistogram = Object.freeze(
    data.ratingHistogram.map((count) => integer(count, 0, Number.MAX_SAFE_INTEGER, 'histogram')),
  );
  const histogramTotal = ratingHistogram.reduce((total, count) => total + count, 0);
  if (histogramTotal !== reviewCount)
    throw new Error('KPI impact day histogram does not match the review count');
  const expectedLow =
    (ratingHistogram[0] ?? 0) + (ratingHistogram[1] ?? 0) + (ratingHistogram[2] ?? 0);
  if (lowRatingReviews !== expectedLow)
    throw new Error('KPI impact day low ratings do not match the histogram');
  const averageRating =
    data.averageRating === null ? null : nonNegative(data.averageRating, 'day average rating');
  if (averageRating === null ? reviewCount !== 0 : averageRating !== round(ratingSum / reviewCount))
    throw new Error('KPI impact day average is not ratingSum / reviewCount');
  const completeness = choice(data.completeness, ['COMPLETE', 'PARTIAL'] as const, 'day state');
  return Object.freeze({
    periodId: identifier(data.periodId, 'day'),
    index,
    startTick: integer(data.startTick, 0, Number.MAX_SAFE_INTEGER, 'day start'),
    endTick: integer(data.endTick, 0, Number.MAX_SAFE_INTEGER, 'day end'),
    completeness,
    currency: identifier(data.currency, 'currency'),
    revenueMinorUnits,
    completedRides,
    failedRides,
    cancelledRides,
    terminalRides,
    incidentRides,
    reviewCount,
    ratingSum,
    averageRating,
    lowRatingReviews,
    ratingHistogram,
  });
}

function parseServiceDelta(value: unknown): KpiImpactServiceDelta {
  const data = record(value, 'KPI impact service delta');
  fields(data, serviceDeltaFields, 'KPI impact service delta');
  const state = choice(data.incidentState, KPI_IMPACT_INCIDENT_STATES, 'incident state'),
    revenueDirection = choice(data.revenueDirection, KPI_IMPACT_DIRECTIONS, 'revenue direction'),
    ratingDirection = choice(data.ratingDirection, KPI_IMPACT_DIRECTIONS, 'rating direction'),
    ratingAvailability = choice(
      data.ratingAvailability,
      KPI_IMPACT_RATING_AVAILABILITY,
      'rating availability',
    ),
    ratingDelta = data.ratingDelta === null ? null : finiteNumber(data.ratingDelta, 'rating delta');
  return Object.freeze({
    revenueMinorUnits: integer(
      data.revenueMinorUnits,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      'revenue delta',
    ),
    revenueDirection,
    completedRides: integer(
      data.completedRides,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      'completed delta',
    ),
    failedRides: integer(
      data.failedRides,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      'failed delta',
    ),
    cancelledRides: integer(
      data.cancelledRides,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      'cancelled delta',
    ),
    terminalRides: integer(
      data.terminalRides,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      'terminal delta',
    ),
    incidentRides: integer(
      data.incidentRides,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      'incident delta',
    ),
    incidentState: state,
    reviewCount: integer(
      data.reviewCount,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      'review delta',
    ),
    ratingDelta,
    ratingDirection,
    ratingAvailability,
    lowRatingReviews: integer(
      data.lowRatingReviews,
      0,
      Number.MAX_SAFE_INTEGER,
      'low rating count',
    ),
    lowRatingDelta: integer(
      data.lowRatingDelta,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      'low rating delta',
    ),
  });
}

function parseService(value: unknown): KpiImpactServiceRead {
  const data = record(value, 'KPI impact service read');
  fields(data, serviceFields, 'KPI impact service read');
  if (data.version !== KPI_IMPACT_SERVICE_VERSION)
    throw new Error('KPI impact service read is not the 214 read model');
  const state = choice(data.state, KPI_IMPACT_STATES, 'service state');
  const current = data.current === null ? null : parseServiceDay(data.current);
  const previous = data.previous === null ? null : parseServiceDay(data.previous);
  if (state === 'NO_EVENT' && current !== null)
    throw new Error('KPI impact NO_EVENT read cannot carry a current day');
  if (state !== 'NO_EVENT' && current === null)
    throw new Error('KPI impact read without an event must be NO_EVENT');
  if (state === 'NO_BASELINE' && previous !== null)
    throw new Error('KPI impact NO_BASELINE read cannot carry a previous day');
  if (state === 'COMPARABLE' && previous === null)
    throw new Error('KPI impact COMPARABLE read requires a previous day');
  if (current !== null && previous !== null && current.index !== previous.index + 1)
    throw new Error('KPI impact comparison is not consecutive simulated days');
  const delta = parseServiceDelta(data.delta);
  const expectedRevenue = (current?.revenueMinorUnits ?? 0) - (previous?.revenueMinorUnits ?? 0);
  if (delta.revenueMinorUnits !== expectedRevenue)
    throw new Error('KPI impact revenue delta is not the difference of the two days');
  if (delta.revenueDirection !== (state === 'NO_EVENT' ? 'UNKNOWN' : directionOf(expectedRevenue)))
    throw new Error('KPI impact revenue direction contradicts its delta');
  if (delta.terminalRides !== (current?.terminalRides ?? 0) - (previous?.terminalRides ?? 0))
    throw new Error('KPI impact terminal delta is not the difference of the two days');
  if (delta.incidentRides !== (current?.incidentRides ?? 0) - (previous?.incidentRides ?? 0))
    throw new Error('KPI impact incident delta is not the difference of the two days');
  if (delta.lowRatingReviews !== (current?.lowRatingReviews ?? 0))
    throw new Error('KPI impact low rating count is not the current day');
  const expectedRating =
    current === null || previous === null || current.averageRating === null
      ? null
      : previous.averageRating === null
        ? null
        : round(current.averageRating - previous.averageRating);
  if (delta.ratingAvailability === 'AVAILABLE') {
    if (expectedRating === null)
      throw new Error('KPI impact rating is available without two real averages');
    if (delta.ratingDelta !== expectedRating)
      throw new Error('KPI impact rating delta is not the difference of the two averages');
    if (delta.ratingDirection !== directionOf(expectedRating))
      throw new Error('KPI impact rating direction contradicts its delta');
  } else if (delta.ratingDelta !== null || delta.ratingDirection !== 'UNKNOWN')
    throw new Error('KPI impact rating direction without a comparable average');
  const xp = record(data.xp, 'KPI impact service xp');
  fields(xp, ['debits', 'credits', 'negativeCredits'] as const, 'KPI impact service xp');
  if (xp.debits !== 0 || xp.credits !== 0 || xp.negativeCredits !== false)
    throw new Error('KPI impact read model cannot debit or credit XP');
  if (data.historyScans !== 0) throw new Error('KPI impact read model must not scan the ledger');
  if (typeof data.currentDayMatchesTick !== 'boolean')
    throw new Error('KPI impact current-day flag is invalid');
  return Object.freeze({
    version: KPI_IMPACT_SERVICE_VERSION,
    tick: integer(data.tick, 0, Number.MAX_SAFE_INTEGER, 'service tick'),
    currency: identifier(data.currency, 'currency'),
    state,
    currentDayMatchesTick: data.currentDayMatchesTick,
    current,
    previous,
    delta,
    xp: Object.freeze({ debits: 0 as const, credits: 0 as const, negativeCredits: false as const }),
    historyScans: 0 as const,
  });
}

function parseMission(value: unknown): KpiImpactMissionResult {
  const data = record(value, 'KPI impact mission result');
  fields(data, missionFields, 'KPI impact mission result');
  const state = choice(data.state, KPI_IMPACT_MISSION_STATES, 'mission state');
  const xpGranted = integer(data.xpGranted, 0, KPI_IMPACT_LIMITS.maximumXp, 'granted XP');
  const duplicateXp = integer(data.duplicateXp, 0, KPI_IMPACT_LIMITS.maximumXp, 'duplicate XP');
  if (duplicateXp !== 0) throw new Error('KPI impact duplicate delivery cannot grant XP');
  if (state === 'NONE') {
    if (data.missionId !== null || data.attempt !== null)
      throw new Error('KPI impact empty mission result cannot name a mission');
    if (xpGranted !== 0) throw new Error('KPI impact empty mission result cannot grant XP');
    return Object.freeze({ state, missionId: null, attempt: null, xpGranted: 0, duplicateXp: 0 });
  }
  const missionId = identifier(data.missionId, 'mission'),
    attempt = integer(data.attempt, 1, 8, 'attempt');
  if ((state === 'FAILED' || state === 'REFUSED') && xpGranted !== 0)
    throw new Error('KPI impact a failed or refused mission cannot grant XP');
  return Object.freeze({ state, missionId, attempt, xpGranted, duplicateXp: 0 });
}

function parseFidelity(value: unknown): KpiImpactFidelity {
  const data = record(value, 'KPI impact fidelity');
  fields(data, fidelityFields, 'KPI impact fidelity');
  const comfortPenalty =
    data.comfortPenalty === null ? null : nonNegative(data.comfortPenalty, 'comfort term');
  if (comfortPenalty !== null && comfortPenalty > KPI_IMPACT_LIMITS.maximumRating)
    throw new Error('KPI impact comfort term is outside the 0–5 scale');
  return Object.freeze({
    controlMode: choice(data.controlMode, KPI_IMPACT_CONTROL_MODES, 'control mode'),
    controlIntervals: integer(
      data.controlIntervals,
      0,
      KPI_IMPACT_LIMITS.controlIntervals,
      'control intervals',
    ),
    comfortPenalty,
  });
}

/** Validates one composed snapshot; a number the 209 read model cannot report is refused. */
export function parseKpiImpactSnapshot(value: unknown): KpiImpactSnapshot {
  const data = record(value, 'KPI impact snapshot');
  fields(data, snapshotFields, 'KPI impact snapshot');
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== KPI_IMPACT_UI_VERSION)
    throw new Error('KPI impact snapshot contract version');
  const service = parseService(data.service);
  const at = integer(data.tick, 0, Number.MAX_SAFE_INTEGER, 'snapshot tick');
  if (service.tick !== at)
    throw new Error('KPI impact service read is not the tick of its snapshot');
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: KPI_IMPACT_UI_VERSION,
    sessionId: identifier(data.sessionId, 'session'),
    worldEpoch: integer(data.worldEpoch, 0, Number.MAX_SAFE_INTEGER, 'world epoch'),
    tick: at,
    namespace: identifier(data.namespace, 'namespace'),
    mission: parseMission(data.mission),
    fidelity: parseFidelity(data.fidelity),
    service,
  });
}

export interface KpiImpactSources {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly namespace: string;
  readonly service: KpiImpactRead;
  readonly mission: KpiImpactMissionResult;
  readonly fidelity: KpiImpactFidelity;
}

/** Composes the three planes. The service plane is the 209 read model, copied without changes. */
export function composeKpiImpactSnapshot(sources: KpiImpactSources): KpiImpactSnapshot {
  return parseKpiImpactSnapshot({
    schemaVersion: 1,
    units: 'SI',
    version: KPI_IMPACT_UI_VERSION,
    sessionId: sources.sessionId,
    worldEpoch: sources.worldEpoch,
    tick: sources.tick,
    namespace: sources.namespace,
    mission: {
      state: sources.mission.state,
      missionId: sources.mission.missionId,
      attempt: sources.mission.attempt,
      xpGranted: sources.mission.xpGranted,
      duplicateXp: sources.mission.duplicateXp,
    },
    fidelity: {
      controlMode: sources.fidelity.controlMode,
      controlIntervals: sources.fidelity.controlIntervals,
      comfortPenalty: sources.fidelity.comfortPenalty,
    },
    service: sources.service,
  });
}

/** Derives the mission plane from one real 125 settlement; a repeat is `REFUSED`, never negative. */
export function missionResultFromSettlement(
  settlement: MissionCompletionResult,
): KpiImpactMissionResult {
  return Object.freeze({
    state: settlement.status === 'DUPLICATE' ? 'REFUSED' : 'COMPLETED',
    missionId: settlement.missionId,
    attempt: settlement.attempt,
    xpGranted: settlement.xpGranted,
    duplicateXp: 0,
  });
}

// ---------------------------------------------------------------------------------------------
// Projection: three separate planes, deterministic text, no promise of lost XP.
// ---------------------------------------------------------------------------------------------

export function formatKpiImpactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value));
}

function signed(value: number): string {
  const text = formatKpiImpactNumber(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : '0';
}

function missionPlane(mission: KpiImpactMissionResult): KpiImpactPlaneView {
  const title = KPI_IMPACT_TEXT.planes.MISSION,
    stateLabel = KPI_IMPACT_TEXT.missionStates[mission.state],
    tone: KpiImpactTone =
      mission.state === 'COMPLETED'
        ? 'POSITIVE'
        : mission.state === 'FAILED'
          ? 'NEGATIVE'
          : 'NEUTRAL';
  const details: string[] = [];
  if (mission.state === 'NONE') details.push(KPI_IMPACT_TEXT.empty);
  else {
    details.push(
      `${KPI_IMPACT_TEXT.labels.mission}: ${mission.missionId ?? KPI_IMPACT_TEXT.none} · ` +
        `${KPI_IMPACT_TEXT.labels.attempt}: ${mission.attempt ?? 0}`,
    );
    details.push(
      `${KPI_IMPACT_TEXT.labels.reward}: ${formatKpiImpactNumber(mission.xpGranted)} XP`,
    );
    if (mission.state === 'FAILED')
      details.push(
        'Obiectivul nu a fost îndeplinit: recompensa rămâne 0 XP, iar soldul de XP nu se modifică.',
      );
    if (mission.state === 'REFUSED')
      details.push(
        'Livrarea repetată a aceleiași recompense acordă 0 XP; soldul de XP nu se modifică.',
      );
  }
  const headline = `${title}: ${stateLabel}`;
  const metrics = Object.freeze([
    Object.freeze({ key: 'mission-state', label: title, value: stateLabel }),
    Object.freeze({
      key: 'mission-reward',
      label: KPI_IMPACT_TEXT.labels.reward,
      value: `${formatKpiImpactNumber(mission.xpGranted)} XP`,
    }),
  ]);
  return Object.freeze({
    plane: 'MISSION',
    title,
    state: mission.state,
    stateLabel,
    headline,
    details: Object.freeze(details),
    metrics,
    tone,
    text: [headline, ...details].join(' '),
  });
}

function fidelityPlane(
  fidelity: KpiImpactFidelity,
  mission: KpiImpactMissionResult,
): KpiImpactPlaneView {
  const title = KPI_IMPACT_TEXT.planes.FIDELITY,
    stateLabel = KPI_IMPACT_TEXT.modes[fidelity.controlMode],
    comfort =
      fidelity.comfortPenalty === null
        ? KPI_IMPACT_TEXT.unavailable
        : `${formatKpiImpactNumber(fidelity.comfortPenalty)} puncte`,
    details = [
      `${KPI_IMPACT_TEXT.labels.mode}: ${stateLabel} · ${mission.missionId ?? KPI_IMPACT_TEXT.none}`,
      `${KPI_IMPACT_TEXT.labels.intervals}: ${formatKpiImpactNumber(fidelity.controlIntervals)} · ` +
        `${KPI_IMPACT_TEXT.labels.comfort}: ${comfort}`,
    ],
    headline = `${title}: ${stateLabel}`,
    metrics = Object.freeze([
      Object.freeze({
        key: 'fidelity-mode',
        label: KPI_IMPACT_TEXT.labels.mode,
        value: stateLabel,
      }),
      Object.freeze({
        key: 'fidelity-intervals',
        label: KPI_IMPACT_TEXT.labels.intervals,
        value: formatKpiImpactNumber(fidelity.controlIntervals),
      }),
      Object.freeze({
        key: 'fidelity-comfort',
        label: KPI_IMPACT_TEXT.labels.comfort,
        value: comfort,
      }),
    ]);
  return Object.freeze({
    plane: 'FIDELITY',
    title,
    state: fidelity.controlMode,
    stateLabel,
    headline,
    details: Object.freeze(details),
    metrics,
    tone: 'NEUTRAL' as const,
    text: [headline, ...details].join(' '),
  });
}

function serviceTone(delta: KpiImpactServiceDelta, state: KpiImpactState): KpiImpactTone {
  if (state === 'NO_EVENT') return 'NEUTRAL';
  const revenue = delta.revenueDirection,
    rating = delta.ratingDirection,
    incidents = delta.incidentState;
  if ((revenue === 'UP' && rating === 'DOWN') || (revenue === 'DOWN' && rating === 'UP'))
    return 'MIXED';
  if (rating === 'DOWN' || revenue === 'DOWN' || incidents === 'INCREASED') return 'NEGATIVE';
  if (rating === 'UP' || revenue === 'UP') return 'POSITIVE';
  return 'NEUTRAL';
}

function ratingLine(service: KpiImpactServiceRead): string {
  if (service.current === null || service.previous === null)
    return `${KPI_IMPACT_TEXT.labels.rating}: ${KPI_IMPACT_TEXT.availability[service.delta.ratingAvailability]}`;
  const before = service.previous.averageRating,
    after = service.current.averageRating;
  if (before === null || after === null)
    return `${KPI_IMPACT_TEXT.labels.rating}: ${KPI_IMPACT_TEXT.availability[service.delta.ratingAvailability]}`;
  return (
    `${KPI_IMPACT_TEXT.labels.rating}: ${formatKpiImpactNumber(before)} → ` +
    `${formatKpiImpactNumber(after)} (${signed(service.delta.ratingDelta ?? 0)}) · ` +
    `${formatKpiImpactNumber(service.delta.reviewCount)} ${KPI_IMPACT_TEXT.labels.reviews.toLowerCase()}`
  );
}

function servicePlane(service: KpiImpactServiceRead): KpiImpactPlaneView {
  const title = KPI_IMPACT_TEXT.planes.SERVICE,
    stateLabel = KPI_IMPACT_TEXT.states[service.state],
    tone = serviceTone(service.delta, service.state),
    details: string[] = [];
  if (service.state === 'NO_EVENT') details.push(KPI_IMPACT_TEXT.empty);
  else if (service.current !== null) {
    const before = service.previous?.revenueMinorUnits ?? 0,
      after = service.current.revenueMinorUnits;
    details.push(
      `${KPI_IMPACT_TEXT.labels.revenue}: ${signed(service.delta.revenueMinorUnits)} ` +
        `${service.currency} (${KPI_IMPACT_TEXT.directions[service.delta.revenueDirection]}) · ` +
        `${formatKpiImpactNumber(before)} → ${formatKpiImpactNumber(after)} ${service.currency}`,
    );
    details.push(ratingLine(service));
    details.push(
      `${KPI_IMPACT_TEXT.labels.incidents}: ${formatKpiImpactNumber(service.current.incidentRides)} ` +
        `(${KPI_IMPACT_TEXT.incidents[service.delta.incidentState]}) · ` +
        `${KPI_IMPACT_TEXT.labels.lowRatings}: ` +
        `${formatKpiImpactNumber(service.current.lowRatingReviews)}`,
    );
    details.push(
      `${KPI_IMPACT_TEXT.labels.previousDay}: ${service.previous?.periodId ?? KPI_IMPACT_TEXT.none} · ` +
        `${KPI_IMPACT_TEXT.labels.currentDay}: ${service.current.periodId}`,
    );
  }
  const headline = `${title}: ${stateLabel}`,
    metrics = Object.freeze([
      Object.freeze({
        key: 'service-revenue',
        label: KPI_IMPACT_TEXT.labels.revenue,
        value: `${signed(service.delta.revenueMinorUnits)} ${service.currency}`,
      }),
      Object.freeze({
        key: 'service-rating',
        label: KPI_IMPACT_TEXT.labels.rating,
        value:
          service.current?.averageRating === null || service.current === null
            ? KPI_IMPACT_TEXT.unavailable
            : formatKpiImpactNumber(service.current.averageRating),
      }),
      Object.freeze({
        key: 'service-incidents',
        label: KPI_IMPACT_TEXT.labels.incidents,
        value: `${formatKpiImpactNumber(service.current?.incidentRides ?? 0)}`,
      }),
    ]);
  return Object.freeze({
    plane: 'SERVICE',
    title,
    state: service.state,
    stateLabel,
    headline,
    details: Object.freeze(details),
    metrics,
    tone,
    text: [headline, ...details].join(' '),
  });
}

/** Deterministic view of one parsed snapshot; nothing is recomputed from the ledgers. */
export function projectKpiImpact(snapshot: KpiImpactSnapshot): KpiImpactView {
  if (snapshot.version !== KPI_IMPACT_UI_VERSION)
    throw new Error('KPI impact projection requires the 214 snapshot');
  const mission = missionPlane(snapshot.mission),
    fidelity = fidelityPlane(snapshot.fidelity, snapshot.mission),
    service = servicePlane(snapshot.service),
    planes = Object.freeze([mission, fidelity, service]),
    empty = snapshot.mission.state === 'NONE' && snapshot.service.state === 'NO_EVENT',
    text = planes.map((plane) => plane.text).join(' ');
  return Object.freeze({
    signature: JSON.stringify([
      snapshot.tick,
      [
        snapshot.mission.state,
        snapshot.mission.missionId,
        snapshot.mission.attempt,
        snapshot.mission.xpGranted,
      ],
      [
        snapshot.fidelity.controlMode,
        snapshot.fidelity.controlIntervals,
        snapshot.fidelity.comfortPenalty,
      ],
      [
        snapshot.service.state,
        snapshot.service.current?.periodId ?? null,
        snapshot.service.previous?.periodId ?? null,
        snapshot.service.delta.revenueMinorUnits,
        snapshot.service.delta.revenueDirection,
        snapshot.service.delta.ratingDirection,
        snapshot.service.delta.incidentState,
        snapshot.service.delta.reviewCount,
      ],
    ]),
    tick: snapshot.tick,
    heading: KPI_IMPACT_TEXT.heading,
    description: KPI_IMPACT_TEXT.description,
    empty,
    ariaLabel: `${KPI_IMPACT_TEXT.heading} · ${planes.map((plane) => plane.headline).join(' · ')}`,
    mission,
    fidelity,
    service,
    planes,
    directions: Object.freeze({
      revenue: snapshot.service.delta.revenueDirection,
      rating: snapshot.service.delta.ratingDirection,
      incidents: snapshot.service.delta.incidentState,
    }),
    text,
    xp: snapshot.service.xp,
    historyScans: 0 as const,
  });
}

/** Empty view used before the host has a real read; it claims nothing about consequences. */
export function emptyKpiImpactView(): KpiImpactView {
  const mission: KpiImpactPlaneView = Object.freeze({
      plane: 'MISSION' as const,
      title: KPI_IMPACT_TEXT.planes.MISSION,
      state: 'NONE',
      stateLabel: KPI_IMPACT_TEXT.missionStates.NONE,
      headline: `${KPI_IMPACT_TEXT.planes.MISSION}: ${KPI_IMPACT_TEXT.missionStates.NONE}`,
      details: Object.freeze([KPI_IMPACT_TEXT.empty]),
      metrics: Object.freeze([]),
      tone: 'NEUTRAL' as const,
      text: `${KPI_IMPACT_TEXT.planes.MISSION}: ${KPI_IMPACT_TEXT.missionStates.NONE} ${KPI_IMPACT_TEXT.empty}`,
    }),
    fidelity: KpiImpactPlaneView = Object.freeze({
      plane: 'FIDELITY' as const,
      title: KPI_IMPACT_TEXT.planes.FIDELITY,
      state: 'NONE',
      stateLabel: KPI_IMPACT_TEXT.none,
      headline: `${KPI_IMPACT_TEXT.planes.FIDELITY}: ${KPI_IMPACT_TEXT.none}`,
      details: Object.freeze([KPI_IMPACT_TEXT.empty]),
      metrics: Object.freeze([]),
      tone: 'NEUTRAL' as const,
      text: `${KPI_IMPACT_TEXT.planes.FIDELITY}: ${KPI_IMPACT_TEXT.none}`,
    }),
    service: KpiImpactPlaneView = Object.freeze({
      plane: 'SERVICE' as const,
      title: KPI_IMPACT_TEXT.planes.SERVICE,
      state: 'NO_EVENT',
      stateLabel: KPI_IMPACT_TEXT.states.NO_EVENT,
      headline: `${KPI_IMPACT_TEXT.planes.SERVICE}: ${KPI_IMPACT_TEXT.states.NO_EVENT}`,
      details: Object.freeze([KPI_IMPACT_TEXT.empty]),
      metrics: Object.freeze([]),
      tone: 'NEUTRAL' as const,
      text: `${KPI_IMPACT_TEXT.planes.SERVICE}: ${KPI_IMPACT_TEXT.states.NO_EVENT} ${KPI_IMPACT_TEXT.empty}`,
    });
  return Object.freeze({
    signature: JSON.stringify(['EMPTY']),
    tick: 0,
    heading: KPI_IMPACT_TEXT.heading,
    description: KPI_IMPACT_TEXT.description,
    empty: true,
    ariaLabel: `${KPI_IMPACT_TEXT.heading} · ${KPI_IMPACT_TEXT.empty}`,
    mission,
    fidelity,
    service,
    planes: Object.freeze([mission, fidelity, service]),
    directions: Object.freeze({
      revenue: 'UNKNOWN' as const,
      rating: 'UNKNOWN' as const,
      incidents: 'NONE' as const,
    }),
    text: [mission.text, fidelity.text, service.text].join(' '),
    xp: Object.freeze({ debits: 0 as const, credits: 0 as const, negativeCredits: false as const }),
    historyScans: 0 as const,
  });
}

/** Collects every string a screen reader or a tooltip can expose, attributes included. */
export function kpiImpactTexts(view: KpiImpactView): readonly string[] {
  const values: string[] = [view.heading, view.description, view.ariaLabel, view.text];
  for (const plane of view.planes) {
    values.push(plane.headline, plane.stateLabel, plane.text, ...plane.details);
    for (const metric of plane.metrics) values.push(metric.label, metric.value);
  }
  return Object.freeze(values);
}

/** Structural proof that no message promises a loss of progress. Throws on the first fragment. */
export function assertNoXpLossMessages(view: KpiImpactView): true {
  for (const value of kpiImpactTexts(view)) {
    const lower = value.toLowerCase();
    for (const fragment of KPI_IMPACT_FORBIDDEN_FRAGMENTS)
      if (lower.includes(fragment))
        throw new Error(`KPI impact feedback promises a lost XP: "${value}" (${fragment})`);
  }
  return true;
}
