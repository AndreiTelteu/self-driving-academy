import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ECONOMY_CLOCK,
  KPI_PROJECTION_MINIMUM,
  KPI_VERSION,
  createFleetKpi,
  economyPeriod,
  ticksPerDay,
} from '../../src/economy';
import type { FleetKpi, FleetKpiOptions, RideSettlement } from '../../src/economy';

function settlement(overrides: Partial<RideSettlement> = {}): RideSettlement {
  const rideId = overrides.rideId ?? 'ride-1';
  return {
    settlementId: `settlement:${rideId}`,
    rideId,
    requestId: `request:${rideId}`,
    taxiId: 'taxi-1',
    terminalState: 'COMPLETED',
    passengerAboard: true,
    tick: 100,
    currency: 'SDA',
    pricingVersion: '209-tariff-v1',
    policyVersion: '209-cancellation-v1',
    rule: 'COMPLETED_FARE',
    quotedMinorUnits: 551,
    chargedMinorUnits: 551,
    refundedMinorUnits: 0,
    netMinorUnits: 551,
    chargeEntryId: `charge:${rideId}`,
    refundEntryId: null,
    ...overrides,
  };
}

function review(rideId: string, rating: number, tick: number) {
  return {
    reviewId: `review:${rideId}`,
    rideId,
    customerId: `customer:${rideId}`,
    rating,
    reasonCodes: [],
    tick,
    reviewModelVersion: '209-review-v1',
    exposureSeconds: 8,
    controlIntervals: 8,
    profileVersions: [],
    preferenceAdjustment: 0,
    penalties: { delay: 0, comfort: 0, incident: 0, failure: 0 },
    evidence: {
      terminalState: 'COMPLETED' as const,
      passengerAboard: true,
      delaySeconds: 0,
      referenceTripDurationSeconds: 84,
      actualTripDurationSeconds: 84,
      comfortModelVersion: null,
      comfortPenalty: 0,
      impacts: 0,
      peakImpulseNs: 0,
      blockedSeconds: 0,
    },
    supersedesReviewId: null,
    revision: 0,
  };
}

function kpi(options: FleetKpiOptions = {}): FleetKpi {
  return createFleetKpi(options);
}

test('209 KPI: one settlement updates the day and the month in the same call', () => {
  const store = kpi();
  store.applySettlement(settlement());
  const snapshot = store.snapshot(100);
  assert.equal(snapshot.version, KPI_VERSION);
  assert.equal(snapshot.days.length, 1);
  assert.equal(snapshot.months.length, 1);
  assert.equal(snapshot.days[0]?.periodId, 'd0000');
  assert.equal(snapshot.months[0]?.periodId, 'm0000');
  assert.equal(snapshot.currentDay?.terminalRides, 1);
  assert.equal(snapshot.currentDay?.quotedMinorUnits, 551);
  assert.equal(snapshot.currentDay?.chargedMinorUnits, 551);
  assert.equal(snapshot.currentDay?.refundedMinorUnits, 0);
  assert.equal(snapshot.currentDay?.revenueMinorUnits, 551);
  assert.equal(snapshot.currentDay?.averageRating, null);
  assert.equal(snapshot.currentMonth?.terminalRides, 1);
  assert.equal(snapshot.historyScans, 0);
  assert.equal(store.getStats().historyScans, 0);
  store.dispose();
});

test('209 KPI: reviews update the count, the sum and the six-value histogram', () => {
  const store = kpi();
  store.applySettlement(settlement({ rideId: 'ride-1', tick: 100 }));
  store.applySettlement(settlement({ rideId: 'ride-2', tick: 200 }));
  store.applyReview(review('ride-1', 5, 100));
  store.applyReview(review('ride-2', 2, 200));
  const day = store.snapshot(300).currentDay!;
  assert.equal(day.reviewCount, 2);
  assert.equal(day.ratingSum, 7);
  assert.equal(day.averageRating, 3.5);
  assert.deepEqual(day.ratingHistogram, [0, 0, 1, 0, 0, 1]);
  assert.equal(day.completedRides, 2);
  assert.equal(day.exposureSeconds, Math.round((100 / ECONOMY_CLOCK.tickHz) * 1e6) / 1e6);
  store.dispose();
});

test('209 KPI: a review revision adjusts the sums without a second review', () => {
  const store = kpi();
  const first = review('ride-1', 5, 100),
    second = { ...first, rating: 3, revision: 1, supersedesReviewId: first.reviewId };
  store.applySettlement(settlement());
  store.applyReview(first);
  store.applyReviewRevision(first, second);
  const day = store.snapshot(200).currentDay!;
  assert.equal(day.reviewCount, 1);
  assert.equal(day.ratingSum, 3);
  assert.deepEqual(day.ratingHistogram, [0, 0, 0, 1, 0, 0]);
  store.dispose();
});

test('209 KPI: the day and the month boundaries are real period boundaries', () => {
  const store = kpi(),
    dayTicks = ticksPerDay(ECONOMY_CLOCK);
  assert.equal(economyPeriod(dayTicks - 1, 'DAY').index, 0);
  assert.equal(economyPeriod(dayTicks, 'DAY').index, 1);
  store.applySettlement(settlement({ rideId: 'ride-a', tick: dayTicks - 1 }));
  store.applySettlement(settlement({ rideId: 'ride-b', tick: dayTicks }));
  const snapshot = store.snapshot(dayTicks);
  assert.equal(snapshot.days.length, 2);
  assert.equal(snapshot.days[0]?.completeness, 'COMPLETE');
  assert.equal(snapshot.days[1]?.completeness, 'PARTIAL');
  assert.equal(snapshot.days[0]?.terminalRides, 1);
  assert.equal(snapshot.days[1]?.terminalRides, 1);
  store.dispose();
});

test('209 KPI: the month is partial until its last tick and is never compared as a total', () => {
  const store = kpi(),
    dayTicks = ticksPerDay(ECONOMY_CLOCK),
    monthTicks = dayTicks * ECONOMY_CLOCK.daysPerMonth;
  store.applySettlement(settlement({ rideId: 'ride-a', tick: dayTicks * 2 }));
  const partial = store.snapshot(dayTicks * 2);
  assert.equal(partial.completedMonths, 0);
  assert.equal(partial.currentMonth?.completeness, 'PARTIAL');
  store.applySettlement(settlement({ rideId: 'ride-b', tick: monthTicks }));
  const next = store.snapshot(monthTicks);
  assert.equal(next.completedMonths, 1);
  assert.equal(next.months[0]?.completeness, 'COMPLETE');
  assert.equal(next.currentMonth?.periodId, 'm0001');
  store.dispose();
});

test('209 KPI: a projection appears only above the published minimum sample', () => {
  const store = kpi(),
    empty = store.snapshot(0).projection;
  assert.equal(empty.status, 'INSUFFICIENT_DATA');
  assert.equal(empty.reason, 'NO_MONTH');

  for (let index = 0; index < KPI_PROJECTION_MINIMUM.terminalRides - 1; index += 1)
    store.applySettlement(settlement({ rideId: `ride-${index}`, tick: 100 + index }));
  const few = store.snapshot(1_000).projection;
  assert.equal(few.status, 'INSUFFICIENT_DATA');
  assert.equal(few.reason, 'FEW_RIDES');

  store.applySettlement(
    settlement({ rideId: 'ride-last', tick: 100 + KPI_PROJECTION_MINIMUM.terminalRides }),
  );
  const short = store.snapshot(1_000).projection;
  assert.equal(short.status, 'INSUFFICIENT_DATA');
  assert.equal(short.reason, 'SHORT_EXPOSURE');

  // A single long-duration event extends the observed window without inventing rides.
  store.applySettlement(settlement({ rideId: 'ride-late', tick: 100 + 60 * 400 }));
  const projected = store.snapshot(100 + 60 * 400).projection;
  assert.equal(projected.status, 'PROJECTED');
  if (projected.status !== 'PROJECTED') throw new Error('unreachable');
  assert.equal(projected.terminalRides, KPI_PROJECTION_MINIMUM.terminalRides + 1);
  assert.ok(projected.observedSeconds >= KPI_PROJECTION_MINIMUM.exposureSeconds);
  assert.equal(projected.monthSeconds, ECONOMY_CLOCK.daysPerMonth * ECONOMY_CLOCK.secondsPerDay);
  assert.equal(
    projected.projectedRevenueMinorUnits,
    Math.round((projected.revenueMinorUnits / projected.observedSeconds) * projected.monthSeconds),
  );
  store.dispose();
});

test('209 KPI: the three terminal outcomes are counted separately', () => {
  const store = kpi();
  store.applySettlement(settlement({ rideId: 'ride-c', tick: 100 }));
  store.applySettlement(
    settlement({
      rideId: 'ride-f',
      tick: 200,
      terminalState: 'FAILED',
      netMinorUnits: 0,
      refundedMinorUnits: 551,
    }),
  );
  store.applySettlement(
    settlement({
      rideId: 'ride-x',
      tick: 300,
      terminalState: 'CANCELLED',
      netMinorUnits: 165,
      refundedMinorUnits: 386,
    }),
  );
  const day = store.snapshot(400).currentDay!;
  assert.equal(day.completedRides, 1);
  assert.equal(day.failedRides, 1);
  assert.equal(day.cancelledRides, 1);
  assert.equal(day.terminalRides, 3);
  assert.equal(day.quotedMinorUnits, 1_653);
  assert.equal(day.chargedMinorUnits, 1_653);
  assert.equal(day.refundedMinorUnits, 937);
  assert.equal(day.revenueMinorUnits, 551 + 0 + 165);
  store.dispose();
});

test('209 KPI: activation markers are bounded and deduplicated per bucket', () => {
  const store = kpi();
  store.noteProfileActivation(100, 'profile:city:common:v1');
  store.noteProfileActivation(200, 'profile:city:common:v1');
  store.noteProfileActivation(300, 'profile:city:dynamic:v2');
  const day = store.snapshot(400).currentDay!;
  assert.deepEqual(day.profileActivationMarkers, [
    'profile:city:common:v1',
    'profile:city:dynamic:v2',
  ]);
  assert.equal(store.getStats().activations, 3);
  store.dispose();
});

test('209 KPI: day retention is bounded and drops the oldest bucket', () => {
  const store = kpi({ retainedDays: 1 }),
    dayTicks = ticksPerDay(ECONOMY_CLOCK);
  store.applySettlement(settlement({ rideId: 'ride-a', tick: 100 }));
  store.applySettlement(settlement({ rideId: 'ride-b', tick: dayTicks + 100 }));
  const stats = store.getStats(),
    snapshot = store.snapshot(dayTicks + 100);
  assert.equal(stats.retainedDays, 1);
  assert.equal(stats.droppedDays, 1);
  assert.equal(snapshot.days.length, 1);
  assert.equal(snapshot.days[0]?.periodId, 'd0001');
  store.dispose();
});

test('209 KPI: an event before the scenario boundary is refused', () => {
  const store = kpi(),
    dayTicks = ticksPerDay(ECONOMY_CLOCK);
  store.applySettlement(settlement({ rideId: 'ride-a', tick: dayTicks + 100 }));
  assert.throws(
    () => store.applySettlement(settlement({ rideId: 'ride-b', tick: 100 })),
    /scenario boundary/,
  );
  store.dispose();
});

test('209 KPI: reset keeps the instance usable and dispose refuses work', () => {
  const store = kpi();
  store.applySettlement(settlement());
  store.reset();
  assert.equal(store.snapshot(0).days.length, 0);
  store.dispose();
  assert.throws(() => store.snapshot(0), /disposed/);
  assert.equal(store.getStats().disposed, true);
});

test('209 KPI: the documented clock is the module 22 proposal', () => {
  assert.deepEqual(ECONOMY_CLOCK, {
    version: '209-economy-clock-v1',
    secondsPerDay: 1_200,
    daysPerMonth: 30,
    tickHz: 60,
  });
  assert.equal(ticksPerDay(ECONOMY_CLOCK), 72_000);
});
