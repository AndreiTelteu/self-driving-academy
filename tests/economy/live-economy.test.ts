import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLiveEconomyComposition } from '../../src/app';
import {
  LIVE_ECONOMY_VERSION,
  reviewReasonCodes,
  type LiveEconomySnapshot,
} from '../../src/economy';
import {
  createLiveEconomyFixture,
  type LiveEconomyFixture,
  type LiveEconomyTarget,
} from './live-economy-fixture';

function read(fixture: LiveEconomyFixture): LiveEconomySnapshot {
  const snapshot = fixture.economy.read();
  if (snapshot === null) throw new Error('Missing live economy read');
  return snapshot;
}

function assertClosedReview(snapshot: LiveEconomySnapshot): void {
  const review = snapshot.lastReview;
  if (review === null) return;
  for (const reason of review.reasonCodes)
    assert.ok(
      (reviewReasonCodes as readonly string[]).includes(reason),
      `Unknown review reason ${reason}`,
    );
  assert.ok(review.rating >= 0 && review.rating <= 5);
  assert.ok(snapshot.today !== null);
  const histogramTotal = snapshot.today!.ratingHistogram.reduce((sum, value) => sum + value, 0);
  assert.equal(histogramTotal, snapshot.today!.reviewCount);
}

function cancelRide(
  fixture: LiveEconomyFixture,
  target: LiveEconomyTarget,
  reason: 'PASSENGER_CANCELLED' | 'PLAYER_CANCELLED',
): void {
  const tick = fixture.currentTick() + 1;
  fixture.composition.lifecycle.lifecycle.apply({
    rideId: target.rideId,
    eventId: `live-cancel:${target.rideId}:${tick}`,
    event: 'CANCELLED',
    tick,
    reason,
  });
  fixture.step(tick);
}

test('266 live economy: a completed ride settles once, earns the full fare and one review', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 262 });
  try {
    fixture.runTo(60);
    const target = fixture.firstTarget(),
      boarded = fixture.board(target),
      completed = fixture.complete(target),
      snapshot = read(fixture),
      ride = fixture.composition.lifecycle.lifecycle.ride(target.rideId);
    assert.equal(completed.state, 'COMPLETED');
    assert.equal(boarded.boardingTick !== null, true);
    assert.ok(ride !== undefined && ride.terminal);
    assert.equal(snapshot.version, LIVE_ECONOMY_VERSION);
    assert.equal(snapshot.clock.secondsPerDay, 1_200);
    assert.equal(snapshot.clock.daysPerMonth, 30);
    assert.equal(snapshot.clock.tickHz, 60);
    assert.equal(snapshot.counters.terminalRides, 1);
    assert.equal(snapshot.counters.settlements, 1);
    assert.equal(snapshot.counters.reviews, 1);
    assert.equal(snapshot.totals.settlements, 1);
    assert.equal(snapshot.totals.completedRides, 1);
    assert.ok(snapshot.totals.netRevenueMinorUnits > 0);
    assert.equal(snapshot.totals.netRevenueMinorUnits, snapshot.totals.chargedMinorUnits);
    assert.equal(snapshot.totals.refundedMinorUnits, 0);
    assert.ok(snapshot.today !== null);
    assert.ok(snapshot.month !== null);
    assert.equal(snapshot.today!.terminalRides, 1);
    assert.equal(snapshot.today!.completedRides, 1);
    assert.equal(snapshot.today!.reviewCount, 1);
    assert.equal(snapshot.today!.revenueMinorUnits, snapshot.totals.netRevenueMinorUnits);
    assert.equal(snapshot.month!.revenueMinorUnits, snapshot.totals.netRevenueMinorUnits);
    assert.equal(snapshot.today!.periodId.startsWith('d'), true);
    assert.equal(snapshot.month!.periodId.startsWith('m'), true);
    assert.ok(snapshot.today!.exposureSeconds >= 0);
    assert.equal(
      snapshot.today!.ratingHistogram.reduce((sum, value) => sum + value, 0),
      1,
    );
    assert.ok((snapshot.today!.averageRating ?? -1) >= 0);
    assert.equal(snapshot.counters.comfortSamples > 0, true);
    assert.equal(snapshot.counters.comfortIntervals > 0, true);
    assert.equal(snapshot.historyScans, 0);

    const settlement = fixture.economy.economy.settlement(target.rideId),
      review = fixture.economy.economy.review(target.rideId),
      quote = fixture.economy.economy.quote(ride!, fixture.world.graph);
    assert.ok(settlement !== null && settlement !== undefined);
    assert.equal(settlement!.quotedMinorUnits, quote.totalMinorUnits);
    assert.equal(settlement!.netMinorUnits, quote.totalMinorUnits);
    assert.equal(settlement!.rule, 'COMPLETED_FARE');
    assert.ok(review !== null && review !== undefined);
    assert.equal(review!.rideId, target.rideId);
    assertClosedReview(snapshot);
    assert.equal(snapshot.lastSettlement?.rideId, target.rideId);
    assert.equal(snapshot.lastReview?.rideId, target.rideId);

    // The same tick delivered again is an explicit duplicate and changes nothing.
    const duplicate = fixture.economyStep(),
      afterDuplicate = read(fixture);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.settled, 0);
    assert.equal(afterDuplicate.totals.netRevenueMinorUnits, snapshot.totals.netRevenueMinorUnits);
    assert.equal(afterDuplicate.totals.settlements, 1);
    assert.equal(afterDuplicate.counters.reviews, 1);

    // Replaying the terminal ride through the owner is also a no-op.
    const replay = fixture.economy.economy.ingestRideOutcome({
      ride: ride!,
      graph: fixture.world.graph,
    });
    assert.equal(replay.status, 'DUPLICATE');
    assert.equal(read(fixture).totals.settlements, 1);
  } finally {
    fixture.dispose();
  }
});

test('266 live economy: a blocked ride refunds everything and invents no review', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 263 });
  try {
    fixture.runTo(60);
    const target = fixture.firstTarget();
    fixture.blocked.add(target.taxiId);
    fixture.step(fixture.currentTick() + 1);
    const snapshot = read(fixture),
      settlement = fixture.economy.economy.settlement(target.rideId);
    assert.equal(snapshot.totals.settlements, 1);
    assert.equal(snapshot.totals.failedRides, 1);
    assert.equal(snapshot.totals.netRevenueMinorUnits, 0);
    assert.equal(snapshot.totals.failedRevenueMinorUnits, 0);
    assert.equal(settlement?.rule, 'FAILED_FULL_REFUND');
    assert.equal(settlement?.netMinorUnits, 0);
    assert.equal(settlement?.refundedMinorUnits, settlement?.quotedMinorUnits);
    assert.equal(snapshot.today!.failedRides, 1);
    assert.equal(snapshot.today!.revenueMinorUnits, 0);
    assert.equal(snapshot.counters.reviews, 0);
    assert.equal(snapshot.lastReview, null);
  } finally {
    fixture.dispose();
  }
});

test('266 live economy: a cancellation before boarding keeps nothing and has no review', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 264 });
  try {
    fixture.runTo(60);
    const target = fixture.firstTarget();
    cancelRide(fixture, target, 'PASSENGER_CANCELLED');
    const snapshot = read(fixture),
      settlement = fixture.economy.economy.settlement(target.rideId);
    assert.equal(settlement?.rule, 'CANCELLED_BEFORE_PASSENGER_FULL_REFUND');
    assert.equal(settlement?.netMinorUnits, 0);
    assert.equal(settlement?.refundedMinorUnits, settlement?.quotedMinorUnits);
    assert.equal(snapshot.today!.cancelledRides, 1);
    assert.equal(snapshot.today!.revenueMinorUnits, 0);
    assert.equal(snapshot.counters.reviews, 0);
  } finally {
    fixture.dispose();
  }
});

test('266 live economy: a cancellation with the passenger keeps the versioned service fee', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 265 });
  try {
    fixture.runTo(60);
    const target = fixture.firstTarget();
    fixture.board(target);
    cancelRide(fixture, target, 'PASSENGER_CANCELLED');
    const snapshot = read(fixture),
      settlement = fixture.economy.economy.settlement(target.rideId);
    assert.equal(settlement?.rule, 'CANCELLED_WITH_PASSENGER_SERVICE_FEE');
    assert.ok((settlement?.netMinorUnits ?? 0) > 0);
    assert.equal(
      settlement?.netMinorUnits,
      Math.round(((settlement?.quotedMinorUnits ?? 0) * 3_000) / 10_000),
    );
    assert.ok((settlement?.refundedMinorUnits ?? 0) > 0);
    assert.equal(snapshot.today!.cancelledRides, 1);
    assert.equal(snapshot.counters.reviews, 1);
    assert.ok((snapshot.lastReview?.reasonCodes ?? []).includes('RIDE_CANCELLED'));
    assertClosedReview(snapshot);
  } finally {
    fixture.dispose();
  }
});

test('266 live economy: civilians never enter revenue, rides or reviews', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 266 });
  try {
    fixture.runTo(60);
    const target = fixture.firstTarget(),
      ridden = fixture.board(target);
    assert.ok(ridden.boardingTick !== null);
    const completed = fixture.complete(target),
      ride = fixture.composition.lifecycle.lifecycle.ride(target.rideId),
      before = read(fixture);
    assert.equal(completed.state, 'COMPLETED');
    assert.equal(before.totals.civilianOutcomesRejected, 0);
    assert.equal(before.counters.civilians, 0);
    assert.equal(before.totals.settlements, 1);
    const civilian = fixture.economy.economy.ingestRideOutcome({
      ride: ride!,
      graph: fixture.world.graph,
      vehicleKind: 'CIVILIAN',
    });
    assert.equal(civilian.status, 'REJECTED');
    assert.equal(civilian.settlement.reason, 'CIVILIAN_NOT_BILLABLE');
    assert.equal(civilian.review, null);
    const after = read(fixture);
    assert.equal(after.totals.netRevenueMinorUnits, before.totals.netRevenueMinorUnits);
    assert.equal(after.totals.settlements, before.totals.settlements);
    assert.equal(after.counters.reviews, before.counters.reviews);
    assert.equal(after.totals.civilianOutcomesRejected, 1);
  } finally {
    fixture.dispose();
  }
});

test('266 live economy: no step means no clock, no revenue and no review', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 267 });
  try {
    fixture.runTo(60);
    const target = fixture.firstTarget();
    fixture.board(target);
    fixture.complete(target);
    const before = read(fixture),
      tick = fixture.currentTick(),
      revenue = before.totals.netRevenueMinorUnits,
      settlements = before.totals.settlements,
      reviews = before.counters.reviews;
    // A pause/focus loss/offline period is exactly the absence of authoritative steps.
    for (let index = 0; index < 600; index += 1) {
      const snapshot = read(fixture);
      assert.equal(snapshot.tick, tick);
      assert.equal(snapshot.totals.netRevenueMinorUnits, revenue);
    }
    assert.equal(read(fixture).totals.settlements, settlements);
    assert.equal(read(fixture).counters.reviews, reviews);
    // Resuming with a real step advances the same clock and does not duplicate the settlement.
    fixture.step(tick + 1);
    const after = read(fixture);
    assert.equal(after.tick, tick + 1);
    assert.equal(after.totals.settlements, settlements);
    assert.equal(after.totals.netRevenueMinorUnits, revenue);
  } finally {
    fixture.dispose();
  }
});

test('266 live economy: a new session ledger starts empty and cannot inherit the old rides', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 269 });
  let second: ReturnType<typeof createLiveEconomyComposition> | undefined;
  try {
    fixture.runTo(60);
    const first = fixture.firstTarget();
    fixture.board(first);
    fixture.complete(first);
    const oldRevenue = read(fixture).totals.netRevenueMinorUnits,
      boundary = fixture.currentTick() + 1;
    fixture.step(boundary);
    fixture.economy.flush({ tick: boundary });
    fixture.composition.reset({ tick: boundary });
    second = createLiveEconomyComposition({
      lifecycle: fixture.composition.lifecycle.lifecycle,
      graph: fixture.world.graph,
      namespace: 'test:266:second-session',
    });
    second.step({ tick: boundary, vehicles: [] });
    const secondRead = second.read();
    assert.ok(secondRead !== null);
    assert.equal(secondRead!.totals.settlements, 0);
    assert.equal(secondRead!.totals.netRevenueMinorUnits, 0);
    assert.equal(secondRead!.counters.reviews, 0);
    assert.equal(secondRead!.epoch.index, 1);
    assert.equal(read(fixture).totals.netRevenueMinorUnits, oldRevenue);
  } finally {
    second?.dispose();
    fixture.dispose();
  }
});

test('266 live economy: a session reset starts a new epoch and preserves the history', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 268 });
  try {
    fixture.runTo(60);
    const first = fixture.firstTarget();
    fixture.board(first);
    fixture.complete(first);
    const before = read(fixture),
      tick = fixture.currentTick(),
      boundary = tick + 1;
    fixture.step(boundary);
    fixture.composition.reset({ tick: boundary });
    const epochResult = fixture.economy.beginEpoch({ tick: boundary }),
      afterEpoch = read(fixture);
    assert.deepEqual(epochResult.epoch, { index: 2, startTick: boundary, resets: 1 });
    assert.equal(epochResult.preservedRevenueMinorUnits, before.totals.netRevenueMinorUnits);
    assert.equal(epochResult.preservedSettlements, before.totals.settlements);
    assert.equal(epochResult.preservedReviews, before.counters.reviews);
    assert.equal(afterEpoch.epoch.index, 2);
    assert.equal(afterEpoch.totals.netRevenueMinorUnits, before.totals.netRevenueMinorUnits);
    assert.equal(afterEpoch.totals.settlements, before.totals.settlements);
    assert.equal(afterEpoch.counters.reviews, before.counters.reviews);
    assert.equal(afterEpoch.today?.reviewCount, before.today?.reviewCount);
    assert.equal(afterEpoch.historyScans, 0);

    // The next epoch adds new rides on top of the preserved series.
    fixture.runTo(boundary + 60);
    const next = fixture.firstTarget();
    fixture.board(next);
    fixture.complete(next);
    const afterSecond = read(fixture);
    assert.ok(afterSecond.totals.settlements > afterEpoch.totals.settlements);
    assert.ok(afterSecond.totals.netRevenueMinorUnits > afterEpoch.totals.netRevenueMinorUnits);
    assert.equal(afterSecond.epoch.index, 2);
    assert.equal(afterSecond.today!.reviewCount >= 1, true);
    assert.equal(afterSecond.historyScans, 0);
    assert.equal(afterSecond.totals.settlements, before.totals.settlements + 1);
  } finally {
    fixture.dispose();
  }
});
