import type { FleetKpiBucket, LiveEconomySnapshot } from '../economy';

/**
 * 266 compact live economy projection for the HUD.
 *
 * The projection is pure and read-only: it validates the accepted live read model, then formats the
 * current simulated day and month without rebuilding history or calculating a second KPI. The
 * numbers are exactly the 209 bucket values (`revenueMinorUnits`, rides, `ratingSum`, review count,
 * histogram, exposure). Missing data stays explicit: a day/month without a bucket is "fără date",
 * and a bucket with rides but no reviews has an unavailable rating, never a perfect score.
 */
export const LIVE_ECONOMY_UI_VERSION = '266-live-economy-hud-v1' as const;

/** Mirror of the 266 service contract; the test asserts equality with `LIVE_ECONOMY_VERSION`. */
export const LIVE_ECONOMY_SERVICE_VERSION = '266-live-economy-v1' as const;

export const LIVE_ECONOMY_TEXT = Object.freeze({
  heading: 'Economie live',
  empty: 'Economie live: fără date încă. Închide o cursă pentru revenue și rating.',
  dayLabel: 'Ziua simulată',
  monthLabel: 'Luna simulată',
  noData: 'fără date',
  noReviews: 'indisponibil',
  revenue: 'Venit',
  rides: 'Curse',
  rating: 'Rating',
  exposure: 'Expunere',
  total: 'Total sesiune',
  counters: 'Settle-uri',
  duplicate: 'duplicate',
  rejected: 'respinse',
  last: 'Ultima cursă',
});

export interface LiveEconomyPeriodView {
  readonly label: string;
  readonly revenue: string;
  readonly rides: string;
  readonly rating: string;
  readonly exposure: string;
  readonly completeness: string | null;
}

export interface LiveEconomyView {
  readonly version: typeof LIVE_ECONOMY_UI_VERSION;
  readonly tick: number;
  readonly epoch: string;
  readonly empty: boolean;
  readonly day: LiveEconomyPeriodView;
  readonly month: LiveEconomyPeriodView;
  readonly total: string;
  readonly counters: string;
  readonly last: string | null;
  readonly signature: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    throw new Error(`Live economy ${label} is invalid`);
  return value;
}

function numeric(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`Live economy ${label} is invalid`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Live economy ${label} is invalid`);
  return value;
}

function readBucket(value: unknown, granularity: 'DAY' | 'MONTH'): FleetKpiBucket {
  if (!isRecord(value)) throw new Error('Live economy bucket is invalid');
  if (value.granularity !== granularity) throw new Error('Live economy bucket granularity');
  const reviewCount = integer(value.reviewCount, 'review count'),
    ratingSum = integer(value.ratingSum, 'rating sum'),
    ratingHistogram = value.ratingHistogram;
  if (!Array.isArray(ratingHistogram) || ratingHistogram.length !== 6)
    throw new Error('Live economy histogram is invalid');
  const histogramTotal = ratingHistogram.reduce<number>(
    (total, entry) => total + integer(entry, 'histogram entry'),
    0,
  );
  if (histogramTotal !== reviewCount) throw new Error('Live economy histogram disagrees');
  const averageRating = value.averageRating;
  if (reviewCount === 0) {
    if (averageRating !== null) throw new Error('Live economy average without reviews');
  } else {
    if (typeof averageRating !== 'number' || !Number.isFinite(averageRating))
      throw new Error('Live economy average is invalid');
    if (Math.abs(averageRating - ratingSum / reviewCount) > 1e-6)
      throw new Error('Live economy average disagrees with the sum');
  }
  const completedRides = integer(value.completedRides, 'completed rides'),
    failedRides = integer(value.failedRides, 'failed rides'),
    cancelledRides = integer(value.cancelledRides, 'cancelled rides'),
    terminalRides = integer(value.terminalRides, 'terminal rides');
  if (terminalRides !== completedRides + failedRides + cancelledRides)
    throw new Error('Live economy terminal ride count disagrees');
  const bucket: FleetKpiBucket = {
    periodId: text(value.periodId, 'period id'),
    granularity,
    startTick: integer(value.startTick, 'start tick'),
    endTick: integer(value.endTick, 'end tick'),
    economyClockVersion: text(value.economyClockVersion, 'clock version'),
    currency: text(value.currency, 'currency'),
    quotedMinorUnits: integer(value.quotedMinorUnits, 'quoted minor units'),
    chargedMinorUnits: integer(value.chargedMinorUnits, 'charged minor units'),
    refundedMinorUnits: integer(value.refundedMinorUnits, 'refunded minor units'),
    revenueMinorUnits: integer(value.revenueMinorUnits, 'revenue minor units'),
    completedRides,
    failedRides,
    cancelledRides,
    terminalRides,
    reviewCount,
    ratingSum,
    averageRating: reviewCount === 0 ? null : (averageRating as number),
    ratingHistogram: Object.freeze([...ratingHistogram] as number[]),
    exposureSeconds: numeric(value.exposureSeconds, 'exposure'),
    profileActivationMarkers: Object.freeze(
      Array.isArray(value.profileActivationMarkers)
        ? value.profileActivationMarkers.map((entry) => text(entry, 'activation marker'))
        : [],
    ),
    completeness: value.completeness === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL',
    lastTick: value.lastTick === null ? null : integer(value.lastTick, 'last tick'),
  };
  if (bucket.endTick <= bucket.startTick) throw new Error('Live economy bucket range is invalid');
  return Object.freeze(bucket);
}

/**
 * Validates the live read model. It accepts only the closed 266 shape; the bucket invariants above
 * are the same ones the 209 owner guarantees, so a corrupted projection can never reach the HUD.
 */
export function parseLiveEconomySnapshot(value: unknown): LiveEconomySnapshot {
  if (!isRecord(value)) throw new Error('Live economy snapshot is invalid');
  if (value.version !== LIVE_ECONOMY_SERVICE_VERSION)
    throw new Error('Live economy snapshot version is invalid');
  if (value.historyScans !== 0) throw new Error('Live economy snapshot rescanned history');
  const tick = integer(value.tick, 'tick');
  if (!isRecord(value.epoch)) throw new Error('Live economy epoch is invalid');
  const epochIndex = integer(value.epoch.index, 'epoch index', 1),
    epochStartTick = integer(value.epoch.startTick, 'epoch start'),
    epochResets = integer(value.epoch.resets, 'epoch resets');
  if (epochResets !== epochIndex - 1) throw new Error('Live economy epoch counters disagree');
  if (epochStartTick > tick) throw new Error('Live economy epoch starts after the tick');
  if (!isRecord(value.clock)) throw new Error('Live economy clock is invalid');
  if (
    value.clock.secondsPerDay !== 1_200 ||
    value.clock.daysPerMonth !== 30 ||
    value.clock.tickHz !== 60
  )
    throw new Error('Live economy clock is not the 1200 s/30 day contract');
  if (!isRecord(value.totals)) throw new Error('Live economy totals are invalid');
  const totals = Object.freeze({
    currency: text(value.totals.currency, 'totals currency'),
    pricingVersion: text(value.totals.pricingVersion, 'pricing version'),
    quotedMinorUnits: integer(value.totals.quotedMinorUnits, 'total quoted'),
    chargedMinorUnits: integer(value.totals.chargedMinorUnits, 'total charged'),
    refundedMinorUnits: integer(value.totals.refundedMinorUnits, 'total refunded'),
    netRevenueMinorUnits: integer(value.totals.netRevenueMinorUnits, 'total revenue'),
    settlements: integer(value.totals.settlements, 'total settlements'),
    completedRides: integer(value.totals.completedRides, 'total completed'),
    failedRides: integer(value.totals.failedRides, 'total failed'),
    cancelledRides: integer(value.totals.cancelledRides, 'total cancelled'),
    completedRevenueMinorUnits: integer(
      value.totals.completedRevenueMinorUnits,
      'completed revenue',
    ),
    failedRevenueMinorUnits: integer(value.totals.failedRevenueMinorUnits, 'failed revenue'),
    cancellationRevenueMinorUnits: integer(
      value.totals.cancellationRevenueMinorUnits,
      'cancellation revenue',
    ),
    civilianOutcomesRejected: integer(value.totals.civilianOutcomesRejected, 'civilian outcomes'),
  });
  if (totals.netRevenueMinorUnits !== totals.chargedMinorUnits - totals.refundedMinorUnits)
    throw new Error('Live economy revenue is not the net charge');
  if (!isRecord(value.counters)) throw new Error('Live economy counters are invalid');
  const counters = Object.freeze({
    terminalRides: integer(value.counters.terminalRides, 'terminal rides'),
    settlements: integer(value.counters.settlements, 'settlements'),
    duplicates: integer(value.counters.duplicates, 'duplicates'),
    rejected: integer(value.counters.rejected, 'rejected'),
    reviews: integer(value.counters.reviews, 'reviews'),
    civilians: integer(value.counters.civilians, 'civilians'),
    comfortSamples: integer(value.counters.comfortSamples, 'comfort samples'),
    comfortIntervals: integer(value.counters.comfortIntervals, 'comfort intervals'),
  });
  if (counters.settlements + counters.duplicates + counters.rejected > counters.terminalRides)
    throw new Error('Live economy counters exceed the terminal rides');
  if (counters.reviews > counters.settlements)
    throw new Error('Live economy reviews exceed settle');
  return Object.freeze({
    version: LIVE_ECONOMY_SERVICE_VERSION,
    tick,
    epoch: Object.freeze({ index: epochIndex, startTick: epochStartTick, resets: epochResets }),
    clock: Object.freeze({
      version: text(value.clock.version, 'clock version'),
      secondsPerDay: 1_200,
      daysPerMonth: 30,
      tickHz: 60,
    }),
    totals,
    today: value.today === null ? null : readBucket(value.today, 'DAY'),
    month: value.month === null ? null : readBucket(value.month, 'MONTH'),
    projection: value.projection as LiveEconomySnapshot['projection'],
    lastSettlement: value.lastSettlement as LiveEconomySnapshot['lastSettlement'],
    lastReview: value.lastReview as LiveEconomySnapshot['lastReview'],
    counters,
    historyScans: 0,
  });
}

function money(amount: number, currency: string): string {
  return `${amount} ${currency}`;
}

function ratingText(bucket: FleetKpiBucket): string {
  if (bucket.reviewCount === 0)
    return `${LIVE_ECONOMY_TEXT.rating}: ${LIVE_ECONOMY_TEXT.noReviews} (0 review-uri)`;
  return `${LIVE_ECONOMY_TEXT.rating}: ${(bucket.averageRating ?? 0).toFixed(2)} (${bucket.reviewCount} review-uri)`;
}

function periodView(
  bucket: FleetKpiBucket | null,
  prefix: string,
  granularity: 'DAY' | 'MONTH',
): LiveEconomyPeriodView {
  if (bucket === null)
    return Object.freeze({
      label: `${prefix} — ${LIVE_ECONOMY_TEXT.noData}`,
      revenue: `${LIVE_ECONOMY_TEXT.revenue}: ${LIVE_ECONOMY_TEXT.noData}`,
      rides: `${LIVE_ECONOMY_TEXT.rides}: ${LIVE_ECONOMY_TEXT.noData}`,
      rating: `${LIVE_ECONOMY_TEXT.rating}: ${LIVE_ECONOMY_TEXT.noReviews}`,
      exposure: `${LIVE_ECONOMY_TEXT.exposure}: —`,
      completeness: null,
    });
  if (bucket.granularity !== granularity) throw new Error('Live economy period granularity');
  return Object.freeze({
    label: `${prefix} ${bucket.periodId}${bucket.completeness === 'PARTIAL' ? ' (parțială)' : ''}`,
    revenue: `${LIVE_ECONOMY_TEXT.revenue}: ${money(bucket.revenueMinorUnits, bucket.currency)}`,
    rides:
      `${LIVE_ECONOMY_TEXT.rides}: ${bucket.terminalRides} ` +
      `(${bucket.completedRides} finalizate, ${bucket.failedRides} eșuate, ${bucket.cancelledRides} anulate)`,
    rating: ratingText(bucket),
    exposure: `${LIVE_ECONOMY_TEXT.exposure}: ${bucket.exposureSeconds.toFixed(1)} s`,
    completeness: bucket.completeness,
  });
}

function lastLine(snapshot: LiveEconomySnapshot): string | null {
  const settlement = snapshot.lastSettlement;
  if (settlement === null) return null;
  const review = snapshot.lastReview;
  return (
    `${LIVE_ECONOMY_TEXT.last}: ${settlement.terminalState} · ` +
    `${money(settlement.netMinorUnits, settlement.currency)}` +
    (review === null ? '' : ` · rating ${review.rating}`)
  );
}

/** Projects one accepted live snapshot into the HUD text; a null input is the empty state. */
export function projectLiveEconomy(value: unknown | null): LiveEconomyView {
  if (value === null) return emptyLiveEconomyView();
  const snapshot = parseLiveEconomySnapshot(value);
  const day = periodView(snapshot.today, `${LIVE_ECONOMY_TEXT.dayLabel}`, 'DAY'),
    month = periodView(snapshot.month, `${LIVE_ECONOMY_TEXT.monthLabel}`, 'MONTH'),
    total =
      `${LIVE_ECONOMY_TEXT.total}: ${money(snapshot.totals.netRevenueMinorUnits, snapshot.totals.currency)} · ` +
      `${snapshot.totals.settlements} curse decontate`,
    counters =
      `${LIVE_ECONOMY_TEXT.counters}: ${snapshot.counters.settlements} · ` +
      `${snapshot.counters.duplicates} ${LIVE_ECONOMY_TEXT.duplicate} · ` +
      `${snapshot.counters.rejected} ${LIVE_ECONOMY_TEXT.rejected} · ` +
      `${snapshot.counters.reviews} review-uri`,
    last = lastLine(snapshot),
    view = Object.freeze({
      version: LIVE_ECONOMY_UI_VERSION,
      tick: snapshot.tick,
      epoch: `Epoca economică ${snapshot.epoch.index} (de la tick ${snapshot.epoch.startTick})`,
      empty:
        snapshot.today === null && snapshot.month === null && snapshot.totals.settlements === 0,
      day,
      month,
      total,
      counters,
      last,
      signature: JSON.stringify([
        snapshot.tick,
        snapshot.epoch.index,
        day,
        month,
        total,
        counters,
        last,
      ]),
    });
  return view;
}

/** The explicit empty projection: no bucket, no invented zero revenue or perfect rating. */
export function emptyLiveEconomyView(): LiveEconomyView {
  return Object.freeze({
    version: LIVE_ECONOMY_UI_VERSION,
    tick: 0,
    epoch: '',
    empty: true,
    day: periodView(null, LIVE_ECONOMY_TEXT.dayLabel, 'DAY'),
    month: periodView(null, LIVE_ECONOMY_TEXT.monthLabel, 'MONTH'),
    total: `${LIVE_ECONOMY_TEXT.total}: ${LIVE_ECONOMY_TEXT.noData}`,
    counters: `${LIVE_ECONOMY_TEXT.counters}: ${LIVE_ECONOMY_TEXT.noData}`,
    last: null,
    signature: 'empty',
  });
}
