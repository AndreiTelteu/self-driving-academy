import { requireContract, text, tick } from '../sessions';
import type { RideSettlement } from './ledger';
import type { RideReview } from './reviews';

/**
 * 209 incremental KPI buckets.
 *
 * Every terminal ride and every review updates its simulated day bucket and its simulated month
 * bucket in the same call. A read returns the retained counters; it never walks the ledger, so
 * `historyScans` is structurally `0` and opening the KPI popup cannot replay the history.
 *
 * The economy clock is versioned and independent of the physics clock: a simulated day is a fixed
 * number of simulated seconds, and the compressed calendar is reporting only. The current period is
 * marked `PARTIAL`, and a month projection is reported only above the published minimum sample, with
 * its window and its observed duration. Missing reviews are `null`, never a perfect score.
 */
export const KPI_VERSION = '209-fleet-kpi-v1' as const;
export const ECONOMY_CLOCK_VERSION = '209-economy-clock-v1' as const;

export interface EconomyClock {
  readonly version: string;
  readonly secondsPerDay: number;
  readonly daysPerMonth: number;
  /** Authoritative simulation rate the tick values are expressed in. */
  readonly tickHz: number;
}

/** The module 22 proposal: one simulated day is 1 200 simulated seconds, one month is 30 days. */
export const ECONOMY_CLOCK: EconomyClock = Object.freeze({
  version: ECONOMY_CLOCK_VERSION,
  secondsPerDay: 1_200,
  daysPerMonth: 30,
  tickHz: 60,
});

export const KPI_GRANULARITIES = ['DAY', 'MONTH'] as const;
export type KpiGranularity = (typeof KPI_GRANULARITIES)[number];

export const kpiCompleteness = ['COMPLETE', 'PARTIAL'] as const;
export type KpiCompleteness = (typeof kpiCompleteness)[number];

/** Minimum sample before a month revenue projection is shown at all. */
export const KPI_PROJECTION_MINIMUM = Object.freeze({
  terminalRides: 10,
  exposureSeconds: 300,
});

export const KPI_LIMITS = Object.freeze({
  version: KPI_VERSION,
  /** Retained day buckets; the oldest simulated day is retired first. */
  retainedDays: 4_096,
  /** Retained month buckets. */
  retainedMonths: 512,
  /** Retained activation markers per bucket. */
  retainedMarkers: 32,
  maximumSum: Number.MAX_SAFE_INTEGER,
});

export function parseEconomyClock(value: unknown): EconomyClock {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Economy clock must be an object',
  );
  const data = value as Record<string, unknown>;
  const allowed = ['version', 'secondsPerDay', 'daysPerMonth', 'tickHz'] as const;
  requireContract(
    Object.keys(data).length === allowed.length && allowed.every((key) => Object.hasOwn(data, key)),
    'Missing or unknown economy clock field',
  );
  requireContract(
    typeof data.version === 'string' && data.version.trim().length > 0,
    'Invalid economy clock version',
  );
  const secondsPerDay = data.secondsPerDay,
    daysPerMonth = data.daysPerMonth,
    tickHz = data.tickHz;
  requireContract(
    typeof secondsPerDay === 'number' &&
      Number.isSafeInteger(secondsPerDay) &&
      secondsPerDay > 0 &&
      typeof daysPerMonth === 'number' &&
      Number.isSafeInteger(daysPerMonth) &&
      daysPerMonth > 0 &&
      typeof tickHz === 'number' &&
      Number.isSafeInteger(tickHz) &&
      tickHz > 0,
    'Economy clock values are invalid',
  );
  return Object.freeze({ version: data.version, secondsPerDay, daysPerMonth, tickHz });
}

export function ticksPerDay(clock: EconomyClock): number {
  return clock.secondsPerDay * clock.tickHz;
}

export function ticksPerMonth(clock: EconomyClock): number {
  return ticksPerDay(clock) * clock.daysPerMonth;
}

export interface KpiPeriod {
  readonly granularity: KpiGranularity;
  readonly index: number;
  readonly periodId: string;
  readonly startTick: number;
  readonly endTick: number;
}

function periodId(granularity: KpiGranularity, index: number): string {
  return `${granularity === 'DAY' ? 'd' : 'm'}${String(index).padStart(4, '0')}`;
}

export function economyPeriod(
  atTick: number,
  granularity: KpiGranularity,
  clock: EconomyClock = ECONOMY_CLOCK,
): KpiPeriod {
  const at = tick(atTick);
  requireContract(
    (KPI_GRANULARITIES as readonly string[]).includes(granularity),
    'Unknown KPI granularity',
  );
  const dayTicks = ticksPerDay(clock),
    index = Math.floor(at / dayTicks),
    startTick = index * dayTicks;
  if (granularity === 'DAY')
    return Object.freeze({
      granularity,
      index,
      periodId: periodId('DAY', index),
      startTick,
      endTick: startTick + dayTicks,
    });
  const monthIndex = Math.floor(index / clock.daysPerMonth),
    monthStart = monthIndex * clock.daysPerMonth * dayTicks;
  return Object.freeze({
    granularity,
    index: monthIndex,
    periodId: periodId('MONTH', monthIndex),
    startTick: monthStart,
    endTick: monthStart + clock.daysPerMonth * dayTicks,
  });
}

export interface FleetKpiBucket {
  readonly periodId: string;
  readonly granularity: KpiGranularity;
  readonly startTick: number;
  readonly endTick: number;
  readonly economyClockVersion: string;
  readonly currency: string;
  readonly quotedMinorUnits: number;
  readonly chargedMinorUnits: number;
  readonly refundedMinorUnits: number;
  /** Revenue after refunds; civilians never contribute a term. */
  readonly revenueMinorUnits: number;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly terminalRides: number;
  readonly reviewCount: number;
  readonly ratingSum: number;
  /** `ratingSum / reviewCount`; `null` without a review. */
  readonly averageRating: number | null;
  /** Counts for the six integer ratings 0–5. */
  readonly ratingHistogram: readonly number[];
  /** Simulated seconds observed between the first and the last economic event. */
  readonly exposureSeconds: number;
  readonly profileActivationMarkers: readonly string[];
  readonly completeness: KpiCompleteness;
  readonly lastTick: number | null;
}

export type RevenueProjection =
  | {
      readonly status: 'INSUFFICIENT_DATA';
      readonly reason: 'FEW_RIDES' | 'SHORT_EXPOSURE' | 'NO_MONTH';
      readonly terminalRides: number;
      readonly exposureSeconds: number;
    }
  | {
      readonly status: 'PROJECTED';
      readonly windowStartTick: number;
      readonly windowEndTick: number;
      readonly observedSeconds: number;
      readonly terminalRides: number;
      readonly revenueMinorUnits: number;
      readonly monthSeconds: number;
      readonly projectedRevenueMinorUnits: number;
    };

export interface FleetKpiSnapshot {
  readonly version: string;
  readonly tick: number;
  readonly clock: EconomyClock;
  readonly days: readonly FleetKpiBucket[];
  readonly months: readonly FleetKpiBucket[];
  readonly currentDay: FleetKpiBucket | null;
  readonly currentMonth: FleetKpiBucket | null;
  /** Completed months only; the current month is partial and never compared as a total. */
  readonly completedMonths: number;
  readonly projection: RevenueProjection;
  /** Structural proof that a KPI read never rescanned the ledger. */
  readonly historyScans: 0;
}

export interface FleetKpiStats {
  readonly version: string;
  readonly settlements: number;
  readonly reviews: number;
  readonly revisions: number;
  readonly activations: number;
  readonly retainedDays: number;
  readonly retainedMonths: number;
  readonly droppedDays: number;
  readonly historyScans: 0;
  readonly disposed: boolean;
}

export interface FleetKpiOptions {
  readonly clock?: EconomyClock;
  readonly currency?: string;
  readonly retainedDays?: number;
  readonly retainedMonths?: number;
}

export interface FleetKpi {
  readonly version: string;
  readonly clock: EconomyClock;
  applySettlement(settlement: RideSettlement): void;
  applyReview(review: RideReview): void;
  applyReviewRevision(previous: RideReview, next: RideReview): void;
  noteProfileActivation(atTick: number, marker: unknown): void;
  snapshot(atTick: number): FleetKpiSnapshot;
  getStats(): FleetKpiStats;
  reset(): void;
  dispose(): void;
}

interface MutableBucket {
  readonly granularity: KpiGranularity;
  readonly index: number;
  readonly startTick: number;
  readonly endTick: number;
  quotedMinorUnits: number;
  chargedMinorUnits: number;
  refundedMinorUnits: number;
  revenueMinorUnits: number;
  completedRides: number;
  failedRides: number;
  cancelledRides: number;
  reviewCount: number;
  ratingSum: number;
  readonly ratingHistogram: number[];
  firstTick: number | null;
  lastTick: number | null;
  readonly markers: string[];
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function mutableBucket(period: KpiPeriod): MutableBucket {
  return {
    granularity: period.granularity,
    index: period.index,
    startTick: period.startTick,
    endTick: period.endTick,
    quotedMinorUnits: 0,
    chargedMinorUnits: 0,
    refundedMinorUnits: 0,
    revenueMinorUnits: 0,
    completedRides: 0,
    failedRides: 0,
    cancelledRides: 0,
    reviewCount: 0,
    ratingSum: 0,
    ratingHistogram: [0, 0, 0, 0, 0, 0],
    firstTick: null,
    lastTick: null,
    markers: [],
  };
}

function bump(current: number, delta: number, label: string): number {
  const next = current + delta;
  requireContract(
    Number.isSafeInteger(next) && next >= 0 && next <= KPI_LIMITS.maximumSum,
    `${label} exceeds the KPI bucket limit`,
  );
  return next;
}

function freezeBucket(
  bucket: MutableBucket,
  clock: EconomyClock,
  currency: string,
  atTick: number,
): FleetKpiBucket {
  const exposureSeconds =
    bucket.firstTick === null || bucket.lastTick === null
      ? 0
      : (bucket.lastTick - bucket.firstTick) / clock.tickHz;
  return Object.freeze({
    periodId: periodId(bucket.granularity, bucket.index),
    granularity: bucket.granularity,
    startTick: bucket.startTick,
    endTick: bucket.endTick,
    economyClockVersion: clock.version,
    currency,
    quotedMinorUnits: bucket.quotedMinorUnits,
    chargedMinorUnits: bucket.chargedMinorUnits,
    refundedMinorUnits: bucket.refundedMinorUnits,
    revenueMinorUnits: bucket.revenueMinorUnits,
    completedRides: bucket.completedRides,
    failedRides: bucket.failedRides,
    cancelledRides: bucket.cancelledRides,
    terminalRides: bucket.completedRides + bucket.failedRides + bucket.cancelledRides,
    reviewCount: bucket.reviewCount,
    ratingSum: bucket.ratingSum,
    averageRating: bucket.reviewCount === 0 ? null : round(bucket.ratingSum / bucket.reviewCount),
    ratingHistogram: Object.freeze([...bucket.ratingHistogram]),
    exposureSeconds: round(exposureSeconds),
    profileActivationMarkers: Object.freeze([...bucket.markers]),
    completeness: atTick < bucket.endTick ? 'PARTIAL' : 'COMPLETE',
    lastTick: bucket.lastTick,
  });
}

/** The incremental KPI aggregation; it owns no clock, ledger, store or renderer. */
export function createFleetKpi(options: FleetKpiOptions = {}): FleetKpi {
  const clock = options.clock === undefined ? ECONOMY_CLOCK : parseEconomyClock(options.clock),
    currency = text(options.currency ?? 'SDA'),
    retainedDays = options.retainedDays ?? KPI_LIMITS.retainedDays,
    retainedMonths = options.retainedMonths ?? KPI_LIMITS.retainedMonths;
  requireContract(
    Number.isSafeInteger(retainedDays) &&
      retainedDays >= 1 &&
      retainedDays <= KPI_LIMITS.retainedDays,
    'KPI day retention capacity is invalid',
  );
  requireContract(
    Number.isSafeInteger(retainedMonths) &&
      retainedMonths >= 1 &&
      retainedMonths <= KPI_LIMITS.retainedMonths,
    'KPI month retention capacity is invalid',
  );
  requireContract(currency.length > 0 && currency.length <= 16, 'Invalid KPI currency label');
  const days = new Map<string, MutableBucket>(),
    months = new Map<string, MutableBucket>();
  let settlements = 0,
    reviews = 0,
    revisions = 0,
    activations = 0,
    droppedDays = 0,
    initialised = false,
    baseTick = 0,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Fleet KPI disposed');
  }

  function bucketFor(atTick: number): { day: MutableBucket; month: MutableBucket } {
    requireContract(
      !initialised || atTick >= baseTick,
      'KPI buckets refuse an event before the scenario boundary',
    );
    const dayPeriod = economyPeriod(atTick, 'DAY', clock),
      monthPeriod = economyPeriod(atTick, 'MONTH', clock);
    let day = days.get(dayPeriod.periodId),
      month = months.get(monthPeriod.periodId);
    if (day === undefined) {
      day = mutableBucket(dayPeriod);
      days.set(dayPeriod.periodId, day);
      while (days.size > retainedDays) {
        const oldest = days.keys().next().value;
        if (oldest === undefined) break;
        days.delete(oldest);
        droppedDays += 1;
      }
    }
    if (month === undefined) {
      month = mutableBucket(monthPeriod);
      months.set(monthPeriod.periodId, month);
      while (months.size > retainedMonths) {
        const oldest = months.keys().next().value;
        if (oldest === undefined) break;
        months.delete(oldest);
      }
    }
    if (!initialised) {
      initialised = true;
      baseTick = dayPeriod.startTick;
    }
    return { day, month };
  }

  function noteRange(bucket: MutableBucket, atTick: number): void {
    bucket.firstTick = bucket.firstTick === null ? atTick : Math.min(bucket.firstTick, atTick);
    bucket.lastTick = bucket.lastTick === null ? atTick : Math.max(bucket.lastTick, atTick);
  }

  function applySettlement(settlement: RideSettlement): void {
    assertLive();
    const { day, month } = bucketFor(settlement.tick);
    for (const bucket of [day, month]) {
      bucket.quotedMinorUnits = bump(
        bucket.quotedMinorUnits,
        settlement.quotedMinorUnits,
        'Quoted',
      );
      bucket.chargedMinorUnits = bump(
        bucket.chargedMinorUnits,
        settlement.chargedMinorUnits,
        'Charged',
      );
      bucket.refundedMinorUnits = bump(
        bucket.refundedMinorUnits,
        settlement.refundedMinorUnits,
        'Refunded',
      );
      bucket.revenueMinorUnits = bump(
        bucket.revenueMinorUnits,
        settlement.netMinorUnits,
        'Revenue',
      );
      if (settlement.terminalState === 'COMPLETED')
        bucket.completedRides = bump(bucket.completedRides, 1, 'Completed rides');
      else if (settlement.terminalState === 'FAILED')
        bucket.failedRides = bump(bucket.failedRides, 1, 'Failed rides');
      else bucket.cancelledRides = bump(bucket.cancelledRides, 1, 'Cancelled rides');
      noteRange(bucket, settlement.tick);
    }
    settlements += 1;
  }

  function applyReview(review: RideReview): void {
    assertLive();
    requireContract(
      review.rating >= 0 && review.rating <= 5,
      'Review rating is outside the 0–5 scale',
    );
    const { day, month } = bucketFor(review.tick);
    for (const bucket of [day, month]) {
      bucket.reviewCount = bump(bucket.reviewCount, 1, 'Review count');
      bucket.ratingSum = bump(bucket.ratingSum, review.rating, 'Rating sum');
      bucket.ratingHistogram[review.rating] = (bucket.ratingHistogram[review.rating] ?? 0) + 1;
      noteRange(bucket, review.tick);
    }
    reviews += 1;
  }

  function applyReviewRevision(previous: RideReview, next: RideReview): void {
    assertLive();
    requireContract(
      previous.rideId === next.rideId && previous.tick === next.tick,
      'A review revision must keep the ride and its economic tick',
    );
    const { day, month } = bucketFor(previous.tick);
    for (const bucket of [day, month]) {
      bucket.ratingSum = bump(bucket.ratingSum, next.rating - previous.rating, 'Rating sum');
      bucket.ratingHistogram[previous.rating] = (bucket.ratingHistogram[previous.rating] ?? 0) - 1;
      bucket.ratingHistogram[next.rating] = (bucket.ratingHistogram[next.rating] ?? 0) + 1;
    }
    revisions += 1;
  }

  function noteProfileActivation(atTick: number, marker: unknown): void {
    assertLive();
    const label = text(marker);
    requireContract(label.length <= 128, 'Profile activation marker is too long');
    const { day, month } = bucketFor(tick(atTick));
    for (const bucket of [day, month]) {
      if (bucket.markers.includes(label)) continue;
      if (bucket.markers.length >= KPI_LIMITS.retainedMarkers) continue;
      bucket.markers.push(label);
    }
    activations += 1;
  }

  function projectionFor(month: MutableBucket | null): RevenueProjection {
    const monthSeconds = clock.daysPerMonth * clock.secondsPerDay;
    if (month === null || month.firstTick === null || month.lastTick === null)
      return Object.freeze({
        status: 'INSUFFICIENT_DATA' as const,
        reason: 'NO_MONTH' as const,
        terminalRides: 0,
        exposureSeconds: 0,
      });
    const terminalRides = month.completedRides + month.failedRides + month.cancelledRides;
    const observedSeconds = (month.lastTick - month.firstTick) / clock.tickHz;
    if (terminalRides < KPI_PROJECTION_MINIMUM.terminalRides)
      return Object.freeze({
        status: 'INSUFFICIENT_DATA' as const,
        reason: 'FEW_RIDES' as const,
        terminalRides,
        exposureSeconds: round(observedSeconds),
      });
    if (observedSeconds < KPI_PROJECTION_MINIMUM.exposureSeconds)
      return Object.freeze({
        status: 'INSUFFICIENT_DATA' as const,
        reason: 'SHORT_EXPOSURE' as const,
        terminalRides,
        exposureSeconds: round(observedSeconds),
      });
    return Object.freeze({
      status: 'PROJECTED' as const,
      windowStartTick: month.firstTick,
      windowEndTick: month.lastTick,
      observedSeconds: round(observedSeconds),
      terminalRides,
      revenueMinorUnits: month.revenueMinorUnits,
      monthSeconds,
      projectedRevenueMinorUnits: Math.round(
        (month.revenueMinorUnits / observedSeconds) * monthSeconds,
      ),
    });
  }

  return Object.freeze({
    version: KPI_VERSION,
    clock,
    applySettlement,
    applyReview,
    applyReviewRevision,
    noteProfileActivation,
    snapshot(atTick: number): FleetKpiSnapshot {
      assertLive();
      const at = tick(atTick);
      const sorted = (source: Map<string, MutableBucket>): readonly FleetKpiBucket[] =>
        Object.freeze(
          [...source.values()]
            .sort((left, right) => left.index - right.index)
            .map((bucket) => freezeBucket(bucket, clock, currency, at)),
        );
      const dayBuckets = sorted(days),
        monthBuckets = sorted(months);
      const currentDayPeriod = economyPeriod(at, 'DAY', clock),
        currentMonthPeriod = economyPeriod(at, 'MONTH', clock);
      const currentDay =
          dayBuckets.find((bucket) => bucket.periodId === currentDayPeriod.periodId) ?? null,
        currentMonth =
          monthBuckets.find((bucket) => bucket.periodId === currentMonthPeriod.periodId) ?? null;
      let completedMonths = 0;
      for (const bucket of monthBuckets) if (at >= bucket.endTick) completedMonths += 1;
      const mutableMonth = months.get(currentMonthPeriod.periodId) ?? null;
      return Object.freeze({
        version: KPI_VERSION,
        tick: at,
        clock,
        days: dayBuckets,
        months: monthBuckets,
        currentDay,
        currentMonth,
        completedMonths,
        projection: projectionFor(mutableMonth),
        historyScans: 0 as const,
      });
    },
    getStats(): FleetKpiStats {
      return Object.freeze({
        version: KPI_VERSION,
        settlements: disposed ? 0 : settlements,
        reviews: disposed ? 0 : reviews,
        revisions: disposed ? 0 : revisions,
        activations: disposed ? 0 : activations,
        retainedDays: disposed ? 0 : days.size,
        retainedMonths: disposed ? 0 : months.size,
        droppedDays: disposed ? 0 : droppedDays,
        historyScans: 0 as const,
        disposed,
      });
    },
    reset(): void {
      assertLive();
      days.clear();
      months.clear();
      settlements = 0;
      reviews = 0;
      revisions = 0;
      activations = 0;
      droppedDays = 0;
      initialised = false;
      baseTick = 0;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      days.clear();
      months.clear();
      settlements = 0;
      reviews = 0;
      revisions = 0;
      activations = 0;
      droppedDays = 0;
      initialised = false;
      baseTick = 0;
    },
  });
}
