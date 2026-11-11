import { requireContract } from '../sessions';
import {
  KPI_PROJECTION_MINIMUM,
  KPI_VERSION,
  economyPeriod,
  type FleetKpiBucket,
  type FleetKpiSnapshot,
  type KpiCompleteness,
  type RevenueProjection,
} from './kpi';

/**
 * 210 read-only history selection over the 209 incremental KPI buckets.
 *
 * The selector never walks the ledger: its only input is a `FleetKpiSnapshot`, whose
 * `historyScans` is structurally `0`. It fills the retained 12-month window slot by slot, so a
 * month without a bucket is an explicit `NO_DATA` slot and never a fabricated zero or average.
 * Averages are always `ratingSum / reviewCount` over the exact sums; monthly and grouped totals
 * add `ratingSum` and `reviewCount`, never mean-of-means. Daily points are downsampled **only** for
 * the chart, and every visual group keeps the exact sums of its member days plus how many days it
 * covers, so the table and the tooltip can still show exact numbers.
 */
export const KPI_HISTORY_VERSION = '210-kpi-history-v1' as const;

export const KPI_HISTORY_LIMITS = Object.freeze({
  version: KPI_HISTORY_VERSION,
  /** Read window of the popup, in simulated months. */
  months: 12,
  /** Hard ceiling of the retained window; never more than the 209 month buckets. */
  maximumMonths: 24,
  /** Visual points of a daily chart; the exact points remain available. */
  maximumDailyPoints: 90,
  defaultDailyPoints: 60,
  /** Retained day buckets that can be read in one snapshot (209 `retainedDays`). */
  maximumExactPoints: 4_096,
});

export const kpiHistoryStates = ['COMPLETE', 'PARTIAL', 'NO_DATA'] as const;
export type KpiHistoryState = (typeof kpiHistoryStates)[number];

export const kpiHistoryAverageStates = ['AVAILABLE', 'NO_REVIEWS', 'NO_DATA'] as const;
export type KpiHistoryAverageState = (typeof kpiHistoryAverageStates)[number];

export const kpiHistoryDistributionStates = ['AVAILABLE', 'NO_REVIEWS', 'NO_DATA'] as const;
export type KpiHistoryDistributionState = (typeof kpiHistoryDistributionStates)[number];

export interface KpiHistoryMonth {
  /** Slot identity; a missing month keeps the same `m####` label with `NO_DATA`. */
  readonly periodId: string;
  readonly index: number;
  readonly state: KpiHistoryState;
  readonly startTick: number | null;
  readonly endTick: number | null;
  readonly currency: string | null;
  readonly revenueMinorUnits: number | null;
  readonly completedRides: number | null;
  readonly failedRides: number | null;
  readonly cancelledRides: number | null;
  readonly terminalRides: number | null;
  readonly reviewCount: number | null;
  readonly ratingSum: number | null;
  readonly averageRating: number | null;
  readonly averageState: KpiHistoryAverageState;
  readonly ratingHistogram: readonly number[] | null;
  readonly exposureSeconds: number | null;
}

export interface KpiHistoryPoint {
  readonly periodId: string;
  readonly index: number;
  readonly firstIndex: number;
  readonly lastIndex: number;
  /** Exact day buckets covered by this point; `> 1` only for a visual group. */
  readonly exactPoints: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly currency: string;
  readonly revenueMinorUnits: number;
  readonly terminalRides: number;
  readonly reviewCount: number;
  readonly ratingSum: number;
  readonly averageRating: number | null;
  readonly averageState: KpiHistoryAverageState;
  readonly exposureSeconds: number;
  readonly completeness: KpiCompleteness;
}

export interface KpiHistoryDistribution {
  readonly counts: readonly number[];
  readonly reviewCount: number;
  readonly state: KpiHistoryDistributionState;
  readonly maximumCount: number;
}

export interface KpiHistoryProjection {
  readonly status: RevenueProjection['status'];
  readonly reason: 'FEW_RIDES' | 'SHORT_EXPOSURE' | 'NO_MONTH' | null;
  readonly terminalRides: number;
  readonly exposureSeconds: number;
  readonly minimumTerminalRides: number;
  readonly minimumExposureSeconds: number;
  readonly monthSeconds: number;
  readonly windowStartTick: number | null;
  readonly windowEndTick: number | null;
  readonly observedSeconds: number | null;
  readonly revenueMinorUnits: number | null;
  readonly projectedRevenueMinorUnits: number | null;
}

export interface KpiHistoryTotals {
  readonly months: number;
  readonly monthsWithData: number;
  readonly monthsWithoutData: number;
  readonly partialMonths: number;
  readonly revenueMinorUnits: number;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly terminalRides: number;
  readonly reviewCount: number;
  readonly ratingSum: number;
  /** Exact weighted mean of the window; `null` when the window has no review at all. */
  readonly averageRating: number | null;
  readonly averageState: KpiHistoryAverageState;
  readonly exposureSeconds: number;
}

export interface KpiHistoryDaily {
  /** Every retained simulated day, exact. */
  readonly exact: readonly KpiHistoryPoint[];
  /** Chart points only: exact days or grouped days, never averaged. */
  readonly visual: readonly KpiHistoryPoint[];
  readonly downsampled: boolean;
  readonly exactPoints: number;
  readonly visualPoints: number;
  readonly maximumDailyPoints: number;
}

export interface KpiHistorySelection {
  readonly version: typeof KPI_HISTORY_VERSION;
  readonly tick: number;
  readonly currency: string;
  readonly economyClockVersion: string;
  readonly monthWindow: number;
  readonly firstMonthIndex: number;
  readonly currentMonthIndex: number;
  /** Completed months reported by 209, independent of the displayed window. */
  readonly completedMonths: number;
  readonly months: readonly KpiHistoryMonth[];
  readonly totals: KpiHistoryTotals;
  readonly daily: KpiHistoryDaily;
  readonly distribution: KpiHistoryDistribution;
  readonly projection: KpiHistoryProjection;
  /** Structural proof that building this selection read no ledger entry. */
  readonly historyScans: 0;
}

export interface KpiHistoryOptions {
  readonly months?: number;
  readonly maximumDailyPoints?: number;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function nonNegativeInteger(value: unknown, label: string): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    `KPI history ${label} is invalid`,
  );
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  requireContract(
    typeof value === 'number' && Number.isFinite(value) && value >= 0,
    `KPI history ${label} is invalid`,
  );
  return value;
}

function boundedSum(current: number, delta: number, label: string): number {
  const next = current + delta;
  requireContract(
    Number.isSafeInteger(next) && next >= 0,
    `KPI history ${label} exceeds the retained range`,
  );
  return next;
}

/** Exposure is a rounded fraction of a second, so it is bounded but not integer. */
function boundedSeconds(current: number, delta: number, label: string): number {
  const next = round(current + delta);
  requireContract(Number.isFinite(next) && next >= 0, `KPI history ${label} is invalid`);
  return next;
}

function averageOf(ratingSum: number, reviewCount: number, state: KpiHistoryAverageState) {
  if (state !== 'AVAILABLE' || reviewCount === 0) return null;
  return round(ratingSum / reviewCount);
}

function periodIdFor(index: number): string {
  return `m${String(index).padStart(4, '0')}`;
}

function readSource(snapshot: unknown): FleetKpiSnapshot {
  requireContract(
    typeof snapshot === 'object' && snapshot !== null && !Array.isArray(snapshot),
    'KPI history requires a KPI snapshot',
  );
  const source = snapshot as FleetKpiSnapshot;
  requireContract(
    source.version === KPI_VERSION,
    'KPI history requires the 209 incremental KPI snapshot',
  );
  requireContract(
    typeof source.tick === 'number' && Number.isSafeInteger(source.tick) && source.tick >= 0,
    'KPI history snapshot tick is invalid',
  );
  requireContract(
    Array.isArray(source.days) && Array.isArray(source.months),
    'KPI history snapshot is missing its buckets',
  );
  requireContract(
    typeof source.clock === 'object' && source.clock !== null,
    'KPI history snapshot is missing its economy clock',
  );
  requireContract(source.historyScans === 0, 'KPI history requires a scan-free KPI snapshot');
  return source;
}

/** A 209 bucket plus the index its `periodId` carries; the snapshot itself does not expose it. */
interface ReadBucket extends FleetKpiBucket {
  readonly index: number;
}

function readBucket(bucket: unknown): ReadBucket {
  requireContract(
    typeof bucket === 'object' && bucket !== null && !Array.isArray(bucket),
    'KPI history bucket is invalid',
  );
  const source = bucket as FleetKpiBucket;
  requireContract(
    typeof source.periodId === 'string' && source.periodId.length > 0,
    'KPI history bucket identity is invalid',
  );
  const period = /^([dm])(\d{4,})$/.exec(source.periodId);
  requireContract(period !== null, 'KPI history bucket identity is invalid');
  const index = nonNegativeInteger(Number(period[2]), 'bucket index'),
    startTick = nonNegativeInteger(source.startTick, 'bucket start'),
    endTick = nonNegativeInteger(source.endTick, 'bucket end');
  requireContract(endTick > startTick, 'KPI history bucket period is empty');
  const revenueMinorUnits = nonNegativeInteger(source.revenueMinorUnits, 'bucket revenue'),
    completedRides = nonNegativeInteger(source.completedRides, 'bucket completed rides'),
    failedRides = nonNegativeInteger(source.failedRides, 'bucket failed rides'),
    cancelledRides = nonNegativeInteger(source.cancelledRides, 'bucket cancelled rides'),
    reviewCount = nonNegativeInteger(source.reviewCount, 'bucket review count'),
    ratingSum = nonNegativeInteger(source.ratingSum, 'bucket rating sum'),
    exposureSeconds = nonNegativeNumber(source.exposureSeconds, 'bucket exposure');
  requireContract(
    Array.isArray(source.ratingHistogram) && source.ratingHistogram.length === 6,
    'KPI history rating histogram is invalid',
  );
  const ratingHistogram = source.ratingHistogram.map((count) =>
    nonNegativeInteger(count, 'bucket rating count'),
  );
  const histogramTotal = ratingHistogram.reduce((total, count) => total + count, 0);
  requireContract(
    histogramTotal === reviewCount,
    'KPI history rating histogram does not match the review count',
  );
  requireContract(
    (kpiHistoryStates as readonly string[]).includes(source.completeness),
    'KPI history completeness is invalid',
  );
  requireContract(
    typeof source.currency === 'string' && source.currency.length > 0,
    'KPI history currency is invalid',
  );
  return Object.freeze({
    ...source,
    index,
    startTick,
    endTick,
    revenueMinorUnits,
    completedRides,
    failedRides,
    cancelledRides,
    reviewCount,
    ratingSum,
    exposureSeconds,
    ratingHistogram: Object.freeze(ratingHistogram),
  });
}

function monthRow(index: number, bucket: ReadBucket | undefined): KpiHistoryMonth {
  if (bucket === undefined)
    return Object.freeze({
      periodId: periodIdFor(index),
      index,
      state: 'NO_DATA' as const,
      startTick: null,
      endTick: null,
      currency: null,
      revenueMinorUnits: null,
      completedRides: null,
      failedRides: null,
      cancelledRides: null,
      terminalRides: null,
      reviewCount: null,
      ratingSum: null,
      averageRating: null,
      averageState: 'NO_DATA' as const,
      ratingHistogram: null,
      exposureSeconds: null,
    });
  const terminalRides = bucket.completedRides + bucket.failedRides + bucket.cancelledRides,
    averageState: KpiHistoryAverageState = bucket.reviewCount === 0 ? 'NO_REVIEWS' : 'AVAILABLE';
  return Object.freeze({
    periodId: bucket.periodId,
    index,
    state: bucket.completeness,
    startTick: bucket.startTick,
    endTick: bucket.endTick,
    currency: bucket.currency,
    revenueMinorUnits: bucket.revenueMinorUnits,
    completedRides: bucket.completedRides,
    failedRides: bucket.failedRides,
    cancelledRides: bucket.cancelledRides,
    terminalRides,
    reviewCount: bucket.reviewCount,
    ratingSum: bucket.ratingSum,
    averageRating: averageOf(bucket.ratingSum, bucket.reviewCount, averageState),
    averageState,
    ratingHistogram: bucket.ratingHistogram,
    exposureSeconds: bucket.exposureSeconds,
  });
}

function pointOf(bucket: ReadBucket): KpiHistoryPoint {
  const averageState: KpiHistoryAverageState =
    bucket.reviewCount === 0 ? 'NO_REVIEWS' : 'AVAILABLE';
  return Object.freeze({
    periodId: bucket.periodId,
    index: bucket.index,
    firstIndex: bucket.index,
    lastIndex: bucket.index,
    exactPoints: 1,
    startTick: bucket.startTick,
    endTick: bucket.endTick,
    currency: bucket.currency,
    revenueMinorUnits: bucket.revenueMinorUnits,
    terminalRides: bucket.completedRides + bucket.failedRides + bucket.cancelledRides,
    reviewCount: bucket.reviewCount,
    ratingSum: bucket.ratingSum,
    averageRating: averageOf(bucket.ratingSum, bucket.reviewCount, averageState),
    averageState,
    exposureSeconds: bucket.exposureSeconds,
    completeness: bucket.completeness,
  });
}

/** Groups consecutive exact days; the group keeps exact sums, so its mean stays weighted. */
function groupPoints(points: readonly KpiHistoryPoint[], size: number): KpiHistoryPoint[] {
  const groups: KpiHistoryPoint[] = [];
  for (let start = 0; start < points.length; start += size) {
    const members = points.slice(start, start + size),
      first = members[0]!,
      last = members[members.length - 1]!;
    let revenueMinorUnits = 0,
      terminalRides = 0,
      reviewCount = 0,
      ratingSum = 0,
      exposureSeconds = 0,
      completeness: KpiCompleteness = 'COMPLETE';
    for (const member of members) {
      revenueMinorUnits = boundedSum(revenueMinorUnits, member.revenueMinorUnits, 'revenue');
      terminalRides = boundedSum(terminalRides, member.terminalRides, 'rides');
      reviewCount = boundedSum(reviewCount, member.reviewCount, 'reviews');
      ratingSum = boundedSum(ratingSum, member.ratingSum, 'rating sum');
      exposureSeconds = boundedSeconds(exposureSeconds, member.exposureSeconds, 'exposure');
      if (member.completeness === 'PARTIAL') completeness = 'PARTIAL';
    }
    const averageState: KpiHistoryAverageState = reviewCount === 0 ? 'NO_REVIEWS' : 'AVAILABLE';
    groups.push(
      Object.freeze({
        periodId: `g${first.index}-${last.index}`,
        index: first.index,
        firstIndex: first.index,
        lastIndex: last.index,
        exactPoints: members.length,
        startTick: first.startTick,
        endTick: last.endTick,
        currency: first.currency,
        revenueMinorUnits,
        terminalRides,
        reviewCount,
        ratingSum,
        averageRating: averageOf(ratingSum, reviewCount, averageState),
        averageState,
        exposureSeconds,
        completeness,
      }),
    );
  }
  return groups;
}

function projectionOf(projection: RevenueProjection): KpiHistoryProjection {
  if (projection.status === 'PROJECTED')
    return Object.freeze({
      status: 'PROJECTED' as const,
      reason: null,
      terminalRides: projection.terminalRides,
      exposureSeconds: projection.observedSeconds,
      minimumTerminalRides: KPI_PROJECTION_MINIMUM.terminalRides,
      minimumExposureSeconds: KPI_PROJECTION_MINIMUM.exposureSeconds,
      monthSeconds: projection.monthSeconds,
      windowStartTick: projection.windowStartTick,
      windowEndTick: projection.windowEndTick,
      observedSeconds: projection.observedSeconds,
      revenueMinorUnits: projection.revenueMinorUnits,
      projectedRevenueMinorUnits: projection.projectedRevenueMinorUnits,
    });
  return Object.freeze({
    status: 'INSUFFICIENT_DATA' as const,
    reason: projection.reason,
    terminalRides: projection.terminalRides,
    exposureSeconds: projection.exposureSeconds,
    minimumTerminalRides: KPI_PROJECTION_MINIMUM.terminalRides,
    minimumExposureSeconds: KPI_PROJECTION_MINIMUM.exposureSeconds,
    monthSeconds: 0,
    windowStartTick: null,
    windowEndTick: null,
    observedSeconds: null,
    revenueMinorUnits: null,
    projectedRevenueMinorUnits: null,
  });
}

/**
 * The single 210 read: buckets in, view model out. `historyScans` stays `0` because no ledger,
 * settlement or review is touched.
 */
export function selectKpiHistory(
  snapshot: FleetKpiSnapshot,
  options: KpiHistoryOptions = {},
): KpiHistorySelection {
  const source = readSource(snapshot),
    months = options.months ?? KPI_HISTORY_LIMITS.months,
    maximumDailyPoints = options.maximumDailyPoints ?? KPI_HISTORY_LIMITS.defaultDailyPoints;
  requireContract(
    Number.isSafeInteger(months) && months >= 1 && months <= KPI_HISTORY_LIMITS.maximumMonths,
    'KPI history month window is invalid',
  );
  requireContract(
    Number.isSafeInteger(maximumDailyPoints) &&
      maximumDailyPoints >= 1 &&
      maximumDailyPoints <= KPI_HISTORY_LIMITS.maximumDailyPoints,
    'KPI history daily point cap is invalid',
  );
  const dayBuckets = source.days.map(readBucket),
    monthBuckets = source.months.map(readBucket),
    currency =
      monthBuckets[0]?.currency ?? dayBuckets[0]?.currency ?? source.currentDay?.currency ?? 'SDA',
    economyClockVersion =
      monthBuckets[0]?.economyClockVersion ??
      dayBuckets[0]?.economyClockVersion ??
      source.clock.version;
  const currentMonthIndex = economyPeriod(source.tick, 'MONTH', source.clock).index;
  let latestMonthIndex = currentMonthIndex;
  const byIndex = new Map<number, ReadBucket>();
  for (const bucket of monthBuckets) {
    byIndex.set(bucket.index, bucket);
    if (bucket.index > latestMonthIndex) latestMonthIndex = bucket.index;
  }
  const firstMonthIndex = Math.max(0, latestMonthIndex - months + 1),
    monthRows: KpiHistoryMonth[] = [];
  for (let index = firstMonthIndex; index <= latestMonthIndex; index += 1)
    monthRows.push(monthRow(index, byIndex.get(index)));

  const histogram = [0, 0, 0, 0, 0, 0];
  let monthsWithData = 0,
    partialMonths = 0,
    revenueMinorUnits = 0,
    completedRides = 0,
    failedRides = 0,
    cancelledRides = 0,
    terminalRides = 0,
    reviewCount = 0,
    ratingSum = 0,
    exposureSeconds = 0;
  for (const row of monthRows) {
    if (row.state === 'NO_DATA') continue;
    monthsWithData += 1;
    if (row.state === 'PARTIAL') partialMonths += 1;
    revenueMinorUnits = boundedSum(revenueMinorUnits, row.revenueMinorUnits ?? 0, 'window revenue');
    completedRides = boundedSum(completedRides, row.completedRides ?? 0, 'window completed rides');
    failedRides = boundedSum(failedRides, row.failedRides ?? 0, 'window failed rides');
    cancelledRides = boundedSum(cancelledRides, row.cancelledRides ?? 0, 'window cancelled rides');
    terminalRides = boundedSum(terminalRides, row.terminalRides ?? 0, 'window terminal rides');
    reviewCount = boundedSum(reviewCount, row.reviewCount ?? 0, 'window review count');
    ratingSum = boundedSum(ratingSum, row.ratingSum ?? 0, 'window rating sum');
    exposureSeconds = boundedSeconds(exposureSeconds, row.exposureSeconds ?? 0, 'window exposure');
    for (let rating = 0; rating < 6; rating += 1)
      histogram[rating] = boundedSum(
        histogram[rating] ?? 0,
        row.ratingHistogram?.[rating] ?? 0,
        'window rating histogram',
      );
  }
  const totalsAverageState: KpiHistoryAverageState =
    monthsWithData === 0 ? 'NO_DATA' : reviewCount === 0 ? 'NO_REVIEWS' : 'AVAILABLE';
  const totals: KpiHistoryTotals = Object.freeze({
    months: monthRows.length,
    monthsWithData,
    monthsWithoutData: monthRows.length - monthsWithData,
    partialMonths,
    revenueMinorUnits,
    completedRides,
    failedRides,
    cancelledRides,
    terminalRides,
    reviewCount,
    ratingSum,
    averageRating: averageOf(ratingSum, reviewCount, totalsAverageState),
    averageState: totalsAverageState,
    exposureSeconds,
  });

  const exact = Object.freeze(dayBuckets.map(pointOf)),
    size = exact.length <= maximumDailyPoints ? 1 : Math.ceil(exact.length / maximumDailyPoints),
    visual = size === 1 ? exact : Object.freeze(groupPoints(exact, size)),
    daily: KpiHistoryDaily = Object.freeze({
      exact,
      visual,
      downsampled: size > 1,
      exactPoints: exact.length,
      visualPoints: visual.length,
      maximumDailyPoints,
    });

  const distributionState: KpiHistoryDistributionState =
    monthsWithData === 0 ? 'NO_DATA' : reviewCount === 0 ? 'NO_REVIEWS' : 'AVAILABLE';
  const distribution: KpiHistoryDistribution = Object.freeze({
    counts: Object.freeze([...histogram]),
    reviewCount,
    state: distributionState,
    maximumCount: histogram.reduce((maximum, count) => (count > maximum ? count : maximum), 0),
  });

  return Object.freeze({
    version: KPI_HISTORY_VERSION,
    tick: source.tick,
    currency,
    economyClockVersion,
    monthWindow: months,
    firstMonthIndex,
    currentMonthIndex,
    completedMonths: nonNegativeInteger(source.completedMonths, 'completed months'),
    months: Object.freeze(monthRows),
    totals,
    daily,
    distribution,
    projection: projectionOf(source.projection),
    historyScans: 0 as const,
  });
}
