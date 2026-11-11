import { requireContract, text, tick } from '../sessions';
import { KPI_VERSION } from './kpi';
import type { FleetKpiBucket, FleetKpiSnapshot } from './kpi';

/**
 * 214 read-only impact of the commercial consequences over the 209 KPI buckets.
 *
 * The selector answers one question with numbers that already exist: "what did the last simulated
 * day change in the service, compared with the previous simulated day?" It reads **only** the
 * retained `FleetKpiSnapshot` — the read model — and never the commercial ledger or the review
 * ledger, so `historyScans` is structurally `0` and a HUD refresh cannot replay history.
 *
 * Three rules are structural:
 *
 * 1. **Every number is a copy.** Revenue, completed/failed/cancelled rides, the review count, the
 *    rating sum and the 0–5 histogram are the exact retained buckets; a missing day is `null`, not a
 *    zero and not an invented average. The average is always `ratingSum / reviewCount`.
 * 2. **The comparison is explained.** The read reports both period identities, whether the current
 *    bucket still matches the snapshot tick and whether a comparable previous day exists at all, so
 *    the UI cannot present a first day as a fall or a missing baseline as a rise.
 * 3. **This module cannot move XP.** It has no ledger, no player, no level and no credit operation;
 *    `xp.debits` and `xp.credits` are `0` and `negativeCredits` is `false`. Revenue, ratings, failed
 *    rides and incidents can only be described, never charged to the player.
 */
export const KPI_IMPACT_VERSION = '214-kpi-impact-v1' as const;

export const KPI_IMPACT_LIMITS = Object.freeze({
  version: KPI_IMPACT_VERSION,
  /** The comparison reads at most the two simulated days it reports. */
  days: 2,
  /** 209 day retention: the ceiling of the buckets a snapshot can carry. */
  retainedDays: 4_096,
  /** Reviews at or below this integer rating are reported as low-rating consequences. */
  lowRatingMaximum: 2,
  /** Closed severity ceiling of one bucket counter read by the selector. */
  maximumSum: Number.MAX_SAFE_INTEGER,
  /** Structural: no ledger entry is ever read or replayed. */
  historyScans: 0,
});

export const kpiImpactDirections = ['UP', 'DOWN', 'FLAT', 'UNKNOWN'] as const;
export type KpiImpactDirection = (typeof kpiImpactDirections)[number];

export const kpiImpactStates = ['COMPARABLE', 'NO_BASELINE', 'NO_EVENT'] as const;
export type KpiImpactState = (typeof kpiImpactStates)[number];

export const kpiImpactRatingAvailability = [
  'AVAILABLE',
  'CURRENT_EMPTY',
  'BASELINE_EMPTY',
  'NO_BASELINE',
] as const;
export type KpiImpactRatingAvailability = (typeof kpiImpactRatingAvailability)[number];

export const kpiImpactIncidentStates = ['NONE', 'PRESENT', 'INCREASED'] as const;
export type KpiImpactIncidentState = (typeof kpiImpactIncidentStates)[number];

/** One simulated day, exactly as the 209 bucket reports it. */
export interface KpiImpactDaySide {
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
  /** Failed plus cancelled rides: the service incidents the day really produced. */
  readonly incidentRides: number;
  readonly reviewCount: number;
  readonly ratingSum: number;
  readonly averageRating: number | null;
  /** Reviews rated 0, 1 or 2; the low-rating consequence of real passenger experience. */
  readonly lowRatingReviews: number;
  readonly ratingHistogram: readonly number[];
}

export interface KpiImpactDelta {
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

export interface KpiImpactRead {
  readonly version: typeof KPI_IMPACT_VERSION;
  readonly tick: number;
  readonly currency: string;
  readonly state: KpiImpactState;
  /** The day the snapshot tick falls in; `false` when that day has no bucket and the last retained day is reported. */
  readonly currentDayMatchesTick: boolean;
  readonly current: KpiImpactDaySide | null;
  readonly previous: KpiImpactDaySide | null;
  readonly delta: KpiImpactDelta;
  /** Structural proof that this read model cannot debit or credit XP. */
  readonly xp: Readonly<{
    readonly debits: 0;
    readonly credits: 0;
    readonly negativeCredits: false;
  }>;
  readonly historyScans: 0;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function nonNegativeInteger(value: unknown, label: string): number {
  requireContract(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= KPI_IMPACT_LIMITS.maximumSum,
    `KPI impact ${label} is invalid`,
  );
  return value;
}

function directionOf(delta: number, tolerance = 0): KpiImpactDirection {
  if (delta > tolerance) return 'UP';
  if (delta < -tolerance) return 'DOWN';
  return 'FLAT';
}

function averageOf(ratingSum: number, reviewCount: number): number | null {
  return reviewCount === 0 ? null : round(ratingSum / reviewCount);
}

function lowRatings(histogram: readonly number[]): number {
  let count = 0;
  for (let rating = 0; rating <= KPI_IMPACT_LIMITS.lowRatingMaximum; rating += 1)
    count += histogram[rating] ?? 0;
  return count;
}

function readSnapshot(snapshot: unknown): FleetKpiSnapshot {
  requireContract(
    typeof snapshot === 'object' && snapshot !== null && !Array.isArray(snapshot),
    'KPI impact requires the 209 KPI snapshot',
  );
  const source = snapshot as FleetKpiSnapshot;
  requireContract(
    source.version === KPI_VERSION,
    'KPI impact requires the 209 incremental KPI read model',
  );
  requireContract(
    typeof source.tick === 'number' && Number.isSafeInteger(source.tick) && source.tick >= 0,
    'KPI impact snapshot tick is invalid',
  );
  requireContract(Array.isArray(source.days), 'KPI impact snapshot is missing its day buckets');
  requireContract(source.historyScans === 0, 'KPI impact requires a scan-free KPI snapshot');
  return source;
}

/** `d0001` → its numeric index; the snapshot bucket itself does not expose it. */
function bucketIndex(bucket: FleetKpiBucket): number {
  const match = /^d(\d{4,})$/.exec(bucket.periodId);
  requireContract(match !== null, 'KPI impact day bucket identity is invalid');
  return nonNegativeInteger(Number(match[1]), 'day index');
}

function daySide(bucket: FleetKpiBucket, index: number): KpiImpactDaySide {
  const revenueMinorUnits = nonNegativeInteger(bucket.revenueMinorUnits, 'day revenue'),
    completedRides = nonNegativeInteger(bucket.completedRides, 'day completed rides'),
    failedRides = nonNegativeInteger(bucket.failedRides, 'day failed rides'),
    cancelledRides = nonNegativeInteger(bucket.cancelledRides, 'day cancelled rides'),
    reviewCount = nonNegativeInteger(bucket.reviewCount, 'day review count'),
    ratingSum = nonNegativeInteger(bucket.ratingSum, 'day rating sum');
  requireContract(
    Array.isArray(bucket.ratingHistogram) && bucket.ratingHistogram.length === 6,
    'KPI impact day histogram is invalid',
  );
  const ratingHistogram = Object.freeze(
    bucket.ratingHistogram.map((count) => nonNegativeInteger(count, 'day rating count')),
  );
  requireContract(
    ratingHistogram.reduce((total, count) => total + count, 0) === reviewCount,
    'KPI impact day histogram does not match the review count',
  );
  requireContract(
    bucket.completeness === 'COMPLETE' || bucket.completeness === 'PARTIAL',
    'KPI impact day completeness is invalid',
  );
  return Object.freeze({
    periodId: text(bucket.periodId),
    index,
    startTick: nonNegativeInteger(bucket.startTick, 'day start'),
    endTick: nonNegativeInteger(bucket.endTick, 'day end'),
    completeness: bucket.completeness,
    currency: text(bucket.currency),
    revenueMinorUnits,
    completedRides,
    failedRides,
    cancelledRides,
    terminalRides: completedRides + failedRides + cancelledRides,
    incidentRides: failedRides + cancelledRides,
    reviewCount,
    ratingSum,
    averageRating: averageOf(ratingSum, reviewCount),
    lowRatingReviews: lowRatings(ratingHistogram),
    ratingHistogram,
  });
}

function deltaOf(
  current: KpiImpactDaySide | null,
  previous: KpiImpactDaySide | null,
  state: KpiImpactState,
): KpiImpactDelta {
  const before = previous === null ? 0 : previous.revenueMinorUnits,
    after = current === null ? 0 : current.revenueMinorUnits;
  const ratingAvailability: KpiImpactRatingAvailability =
    previous === null
      ? 'NO_BASELINE'
      : previous.averageRating === null
        ? 'BASELINE_EMPTY'
        : current === null || current.averageRating === null
          ? 'CURRENT_EMPTY'
          : 'AVAILABLE';
  const ratingDelta =
    ratingAvailability === 'AVAILABLE' &&
    current !== null &&
    current.averageRating !== null &&
    previous !== null &&
    previous.averageRating !== null
      ? round(current.averageRating - previous.averageRating)
      : null;
  const incidentBefore = previous === null ? 0 : previous.incidentRides,
    incidentAfter = current === null ? 0 : current.incidentRides;
  const incidentState: KpiImpactIncidentState =
    state === 'NO_EVENT'
      ? 'NONE'
      : previous !== null && incidentAfter > incidentBefore
        ? 'INCREASED'
        : incidentAfter > 0
          ? 'PRESENT'
          : 'NONE';
  return Object.freeze({
    revenueMinorUnits: after - before,
    revenueDirection: state === 'NO_EVENT' ? 'UNKNOWN' : directionOf(after - before),
    completedRides: (current?.completedRides ?? 0) - (previous?.completedRides ?? 0),
    failedRides: (current?.failedRides ?? 0) - (previous?.failedRides ?? 0),
    cancelledRides: (current?.cancelledRides ?? 0) - (previous?.cancelledRides ?? 0),
    terminalRides: (current?.terminalRides ?? 0) - (previous?.terminalRides ?? 0),
    incidentRides: incidentAfter - incidentBefore,
    incidentState,
    reviewCount: (current?.reviewCount ?? 0) - (previous?.reviewCount ?? 0),
    ratingDelta,
    ratingDirection: ratingDelta === null ? 'UNKNOWN' : directionOf(ratingDelta),
    ratingAvailability,
    lowRatingReviews: current?.lowRatingReviews ?? 0,
    lowRatingDelta: (current?.lowRatingReviews ?? 0) - (previous?.lowRatingReviews ?? 0),
  });
}

/**
 * The single 214 read: a 209 snapshot in, the consequences of its last simulated day out.
 *
 * The current day is the bucket of the snapshot tick; when that day has no event yet, the latest
 * retained day is reported and `currentDayMatchesTick` says so. The baseline is the immediately
 * preceding retained day, so a `NO_BASELINE` read never pretends to be a fall or a rise.
 */
export function selectKpiImpact(snapshot: FleetKpiSnapshot): KpiImpactRead {
  const source = readSnapshot(snapshot);
  const at = tick(source.tick);
  const indexed = source.days.map((bucket) => {
    const index = bucketIndex(bucket);
    return { index, bucket };
  });
  indexed.sort((left, right) => left.index - right.index);
  requireContract(
    indexed.length <= KPI_IMPACT_LIMITS.retainedDays,
    'KPI impact read window exceeds the retained 209 day buckets',
  );
  const currentDayIndex = Math.floor(at / (source.clock.secondsPerDay * source.clock.tickHz));
  const exact = indexed.find((entry) => entry.index === currentDayIndex) ?? null;
  const reported = exact ?? indexed[indexed.length - 1] ?? null;
  const reportedIndex = reported === null ? null : reported.index;
  const previousEntry =
    reportedIndex === null
      ? null
      : (indexed.find((entry) => entry.index === reportedIndex - 1) ?? null);
  const current = reported === null ? null : daySide(reported.bucket, reported.index);
  const previous =
    previousEntry === null ? null : daySide(previousEntry.bucket, previousEntry.index);
  const state: KpiImpactState =
    current === null ? 'NO_EVENT' : previous === null ? 'NO_BASELINE' : 'COMPARABLE';
  return Object.freeze({
    version: KPI_IMPACT_VERSION,
    tick: at,
    currency: current?.currency ?? previous?.currency ?? 'SDA',
    state,
    currentDayMatchesTick: exact !== null,
    current,
    previous,
    delta: deltaOf(current, previous, state),
    xp: Object.freeze({ debits: 0 as const, credits: 0 as const, negativeCredits: false as const }),
    historyScans: 0 as const,
  });
}
