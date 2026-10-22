import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRideEconomicOutcome } from '../../src/economy';
import {
  beginRide,
  cancelRide,
  comfortSnapshot,
  completeRide,
  createEconomyWorld,
  failRide,
  rideOf,
} from './economy-fixture';

test('209 economy: a completed taxi ride settles once and produces a review', () => {
  const fixture = createEconomyWorld({ requestCount: 2 }),
    begun = beginRide(fixture, 0, { boarded: true }),
    completed = completeRide(fixture, begun),
    ride = rideOf(fixture, begun),
    graph = fixture.world.dispatcherWorld.graph,
    quote = fixture.economy.quote(ride, graph),
    result = fixture.economy.ingestRideOutcome({
      ride,
      graph,
      comfort: comfortSnapshot(begun),
    });
  assert.equal(result.status, 'ACCEPTED');
  assert.equal(result.settlement.settlement?.terminalState, 'COMPLETED');
  assert.equal(result.settlement.settlement?.quotedMinorUnits, quote.totalMinorUnits);
  assert.equal(result.settlement.settlement?.netMinorUnits, quote.totalMinorUnits);
  assert.equal(result.settlement.settlement?.refundEntryId, null);
  assert.equal(result.review?.status, 'ACCEPTED');
  assert.equal(result.review?.review?.rating, 5);
  assert.equal(result.outcome.plannedDistanceSource, 'LANE_GRAPH');
  assert.ok(result.outcome.plannedDistanceMeters > 1_000);
  assert.ok(result.outcome.routeLanes > 0);
  assert.equal(result.outcome.referenceTripDurationSeconds, ride.tripCostSeconds);
  assert.ok((result.outcome.actualTripDurationSeconds ?? 0) > 0);
  assert.ok(completed.terminalTick > begun.pickupTick);

  const snapshot = fixture.economy.snapshot(completed.terminalTick);
  assert.equal(snapshot.ledger.totals.settlements, 1);
  assert.equal(snapshot.ledger.totals.netRevenueMinorUnits, quote.totalMinorUnits);
  assert.equal(snapshot.reviews.reviewCount, 1);
  assert.equal(snapshot.kpi.currentDay?.terminalRides, 1);
  assert.equal(snapshot.kpi.currentDay?.reviewCount, 1);
  assert.equal(snapshot.historyScans, 0);
  assert.equal(snapshot.ledger.historyScans, 0);
  assert.equal(snapshot.reviews.historyScans, 0);
  assert.equal(snapshot.kpi.historyScans, 0);
  fixture.dispose();
});

test('209 economy: a failure refunds the quote and explains the failure', () => {
  const fixture = createEconomyWorld({ requestCount: 1 }),
    begun = beginRide(fixture, 0, { boarded: true }),
    failed = failRide(fixture, begun),
    ride = rideOf(fixture, begun),
    graph = fixture.world.dispatcherWorld.graph,
    result = fixture.economy.ingestRideOutcome({
      ride,
      graph,
      comfort: comfortSnapshot(begun),
    });
  assert.equal(result.settlement.settlement?.rule, 'FAILED_FULL_REFUND');
  assert.equal(result.settlement.settlement?.netMinorUnits, 0);
  assert.equal(
    result.settlement.settlement?.refundedMinorUnits,
    result.settlement.settlement?.quotedMinorUnits,
  );
  assert.equal(result.review?.status, 'ACCEPTED');
  assert.ok(result.review?.review?.reasonCodes.includes('RIDE_FAILED'));
  assert.equal(fixture.economy.snapshot(failed.terminalTick).kpi.currentDay?.failedRides, 1);
  assert.equal(fixture.economy.snapshot(failed.terminalTick).kpi.currentDay?.revenueMinorUnits, 0);
  fixture.dispose();
});

test('209 economy: cancellation before boarding is free and produces no invented review', () => {
  const fixture = createEconomyWorld({ requestCount: 1 }),
    begun = beginRide(fixture, 0),
    cancelled = cancelRide(fixture, begun),
    ride = rideOf(fixture, begun),
    graph = fixture.world.dispatcherWorld.graph,
    result = fixture.economy.ingestRideOutcome({ ride, graph });
  assert.equal(result.settlement.settlement?.rule, 'CANCELLED_BEFORE_PASSENGER_FULL_REFUND');
  assert.equal(result.settlement.settlement?.netMinorUnits, 0);
  assert.equal(
    result.settlement.settlement?.refundedMinorUnits,
    result.settlement.settlement?.quotedMinorUnits,
  );
  assert.equal(result.review?.status, 'NOT_ELIGIBLE');
  assert.equal(result.review?.reason, 'NO_PASSENGER_EXPERIENCE');
  assert.equal(result.outcome.passengerAboard, false);
  assert.equal(result.outcome.actualTripDurationSeconds, null);
  assert.equal(fixture.economy.snapshot(cancelled.terminalTick).reviews.reviewCount, 0);
  fixture.dispose();
});

test('209 economy: cancellation with the passenger keeps only the service fee and a review', () => {
  const fixture = createEconomyWorld({ requestCount: 1 }),
    begun = beginRide(fixture, 0, { boarded: true }),
    cancelled = cancelRide(fixture, begun),
    ride = rideOf(fixture, begun),
    graph = fixture.world.dispatcherWorld.graph,
    result = fixture.economy.ingestRideOutcome({
      ride,
      graph,
      comfort: comfortSnapshot(begun),
    });
  assert.equal(result.settlement.settlement?.rule, 'CANCELLED_WITH_PASSENGER_SERVICE_FEE');
  assert.equal(
    result.settlement.settlement?.netMinorUnits,
    Math.round(((result.settlement.settlement?.quotedMinorUnits ?? 0) * 3_000) / 10_000),
  );
  assert.ok((result.settlement.settlement?.refundedMinorUnits ?? 0) > 0);
  assert.equal(result.review?.status, 'ACCEPTED');
  assert.ok(result.review?.review?.reasonCodes.includes('RIDE_CANCELLED'));
  assert.equal(fixture.economy.snapshot(cancelled.terminalTick).kpi.currentDay?.cancelledRides, 1);
  fixture.dispose();
});

test('209 economy: a civilian vehicle never enters revenue, rides or reviews', () => {
  const fixture = createEconomyWorld({ requestCount: 1 }),
    begun = beginRide(fixture, 0, { boarded: true }),
    completed = completeRide(fixture, begun),
    ride = rideOf(fixture, begun),
    graph = fixture.world.dispatcherWorld.graph,
    comfort = comfortSnapshot(begun),
    civilian = fixture.economy.ingestRideOutcome({
      ride,
      graph,
      comfort,
      vehicleKind: 'CIVILIAN',
    });
  assert.equal(civilian.status, 'REJECTED');
  assert.equal(civilian.settlement.reason, 'CIVILIAN_NOT_BILLABLE');
  assert.equal(civilian.review, null);
  const afterCivilian = fixture.economy.snapshot(completed.terminalTick);
  assert.equal(afterCivilian.ledger.totals.settlements, 0);
  assert.equal(afterCivilian.ledger.totals.netRevenueMinorUnits, 0);
  assert.equal(afterCivilian.reviews.reviewCount, 0);

  const taxi = fixture.economy.ingestRideOutcome({ ride, graph, comfort });
  assert.equal(taxi.status, 'ACCEPTED');
  const afterTaxi = fixture.economy.snapshot(completed.terminalTick);
  assert.equal(afterTaxi.ledger.totals.civilianOutcomesRejected, 1);
  assert.equal(afterTaxi.ledger.totals.settlements, 1);
  assert.equal(afterTaxi.reviews.reviewCount, 1);
  fixture.dispose();
});

test('209 economy: a real impact is visible in the review and absent from the comfort term', () => {
  const smooth = createEconomyWorld({ requestCount: 1 }),
    harsh = createEconomyWorld({ requestCount: 1 }),
    smoothBegun = beginRide(smooth, 0, { boarded: true }),
    harshBegun = beginRide(harsh, 0, { boarded: true }),
    smoothRide = completeRide(smooth, smoothBegun),
    harshRide = completeRide(harsh, harshBegun),
    smoothResult = smooth.economy.ingestRideOutcome({
      ride: rideOf(smooth, smoothBegun),
      graph: smooth.world.dispatcherWorld.graph,
      comfort: comfortSnapshot(smoothBegun, { accelerationMps2: 1 }),
    }),
    harshResult = harsh.economy.ingestRideOutcome({
      ride: rideOf(harsh, harshBegun),
      graph: harsh.world.dispatcherWorld.graph,
      comfort: comfortSnapshot(harshBegun, { accelerationMps2: 1, impacts: 1 }),
    });
  assert.equal(smoothResult.review?.status, 'ACCEPTED');
  assert.equal(harshResult.review?.status, 'ACCEPTED');
  assert.equal(
    harshResult.review?.review?.evidence.comfortPenalty,
    smoothResult.review?.review?.evidence.comfortPenalty,
  );
  assert.ok((harshResult.review?.review?.penalties.incident ?? 0) > 0);
  assert.ok((harshResult.review?.review?.evidence.impacts ?? 0) > 0);
  assert.ok((harshResult.review?.review?.rating ?? 5) < (smoothResult.review?.review?.rating ?? 0));
  assert.ok(harshRide.terminalTick >= harshBegun.pickupTick);
  assert.ok(smoothRide.terminalTick >= smoothBegun.pickupTick);
  smooth.dispose();
  harsh.dispose();
});

test('209 economy: a detour raises the delay penalty but never the price', () => {
  const onTime = createEconomyWorld({ requestCount: 1 }),
    detour = createEconomyWorld({ requestCount: 1 }),
    onTimeBegun = beginRide(onTime, 0, { boarded: true }),
    detourBegun = beginRide(detour, 0, { boarded: true }),
    onTimeCompleted = completeRide(onTime, onTimeBegun),
    detourCompleted = completeRide(detour, detourBegun, 300),
    onTimeResult = onTime.economy.ingestRideOutcome({
      ride: rideOf(onTime, onTimeBegun),
      graph: onTime.world.dispatcherWorld.graph,
      comfort: comfortSnapshot(onTimeBegun),
    }),
    detourResult = detour.economy.ingestRideOutcome({
      ride: rideOf(detour, detourBegun),
      graph: detour.world.dispatcherWorld.graph,
      comfort: comfortSnapshot(detourBegun),
    });
  assert.equal(
    detourResult.settlement.settlement?.quotedMinorUnits,
    onTimeResult.settlement.settlement?.quotedMinorUnits,
  );
  assert.equal(
    detourResult.settlement.settlement?.netMinorUnits,
    onTimeResult.settlement.settlement?.netMinorUnits,
  );
  assert.equal(
    detourResult.outcome.plannedDistanceMeters,
    onTimeResult.outcome.plannedDistanceMeters,
  );
  assert.ok((detourResult.review?.review?.evidence.delaySeconds ?? 0) > 300);
  assert.ok(
    (detourResult.review?.review?.penalties.delay ?? 0) >
      (onTimeResult.review?.review?.penalties.delay ?? 0),
  );
  assert.ok(
    (detourResult.review?.review?.rating ?? 5) < (onTimeResult.review?.review?.rating ?? 0),
  );
  assert.ok(detourCompleted.terminalTick > onTimeCompleted.terminalTick);
  onTime.dispose();
  detour.dispose();
});

test('209 economy: repeated outcomes are idempotent, whatever the event id', () => {
  const fixture = createEconomyWorld({ requestCount: 1 }),
    begun = beginRide(fixture, 0, { boarded: true }),
    completed = completeRide(fixture, begun),
    ride = rideOf(fixture, begun),
    graph = fixture.world.dispatcherWorld.graph,
    comfort = comfortSnapshot(begun),
    first = fixture.economy.ingestRideOutcome({ ride, graph, comfort }),
    replay = fixture.economy.ingestRideOutcome({ ride, graph, comfort }),
    otherId = fixture.economy.ingestRideOutcome({
      ride,
      graph,
      comfort,
      eventId: 'ride-settled:explicit-second-id',
    });
  assert.equal(first.status, 'ACCEPTED');
  assert.equal(replay.status, 'DUPLICATE');
  assert.equal(replay.settlement.duplicateReason, 'EVENT_REPLAY');
  assert.equal(otherId.status, 'DUPLICATE');
  assert.equal(otherId.settlement.duplicateReason, 'RIDE_ALREADY_SETTLED');
  const snapshot = fixture.economy.snapshot(completed.terminalTick);
  assert.equal(snapshot.ledger.totals.settlements, 1);
  assert.equal(
    snapshot.ledger.totals.netRevenueMinorUnits,
    first.settlement.settlement?.netMinorUnits,
  );
  assert.equal(snapshot.reviews.reviewCount, 1);
  assert.equal(snapshot.kpi.currentDay?.terminalRides, 1);
  assert.equal(snapshot.kpi.currentDay?.reviewCount, 1);
  fixture.dispose();
});

test('209 economy: two styles on the same request settle the same fare with different ratings', () => {
  const efficient = createEconomyWorld({ requestCount: 1 }),
    aggressive = createEconomyWorld({ requestCount: 1 }),
    efficientBegun = beginRide(efficient, 0, { boarded: true }),
    aggressiveBegun = beginRide(aggressive, 0, { boarded: true }),
    efficientCompleted = completeRide(efficient, efficientBegun),
    aggressiveCompleted = completeRide(aggressive, aggressiveBegun, 45),
    efficientResult = efficient.economy.ingestRideOutcome({
      ride: rideOf(efficient, efficientBegun),
      graph: efficient.world.dispatcherWorld.graph,
      comfort: comfortSnapshot(efficientBegun, { accelerationMps2: 0.5 }),
    }),
    aggressiveResult = aggressive.economy.ingestRideOutcome({
      ride: rideOf(aggressive, aggressiveBegun),
      graph: aggressive.world.dispatcherWorld.graph,
      comfort: comfortSnapshot(aggressiveBegun, {
        accelerationMps2: 2.5,
        impacts: 1,
      }),
    });
  assert.equal(efficientBegun.assignment.requestId, aggressiveBegun.assignment.requestId);
  assert.equal(
    efficientResult.settlement.settlement?.quotedMinorUnits,
    aggressiveResult.settlement.settlement?.quotedMinorUnits,
  );
  assert.equal(efficientResult.review?.review?.rating, 5);
  assert.ok((aggressiveResult.review?.review?.rating ?? 5) <= 3);
  assert.ok((aggressiveResult.review?.review?.reasonCodes ?? []).includes('HARD_BRAKING'));
  assert.ok((aggressiveResult.review?.review?.reasonCodes ?? []).includes('COLLISION'));
  assert.ok(aggressiveCompleted.terminalTick > efficientCompleted.terminalTick);
  efficient.dispose();
  aggressive.dispose();
});

test('209 economy: an explicit reissue replaces the review and adjusts the KPI without a double', () => {
  const fixture = createEconomyWorld({ requestCount: 1 }),
    begun = beginRide(fixture, 0, { boarded: true }),
    completed = completeRide(fixture, begun),
    ride = rideOf(fixture, begun),
    graph = fixture.world.dispatcherWorld.graph,
    first = fixture.economy.ingestRideOutcome({
      ride,
      graph,
      comfort: comfortSnapshot(begun),
    }),
    reissued = fixture.economy.reissueReview({
      ride,
      graph,
      eventId: 'review-reissue:1',
      reviewModelVersion: '209-review-v2',
      comfort: comfortSnapshot(begun, { accelerationMps2: 2.5, impacts: 1 }),
    });
  assert.equal(first.review?.review?.rating, 5);
  assert.equal(reissued.review.status, 'REISSUED');
  assert.equal(reissued.review.review?.revision, 1);
  assert.equal(reissued.review.review?.reviewModelVersion, '209-review-v2');
  assert.equal(reissued.review.supersedesReviewId, first.review?.review?.reviewId);
  const snapshot = fixture.economy.snapshot(completed.terminalTick);
  assert.equal(snapshot.reviews.reviewCount, 1);
  assert.equal(snapshot.reviews.reissuedReviews, 1);
  assert.equal(snapshot.kpi.currentDay?.reviewCount, 1);
  assert.equal(snapshot.kpi.currentDay?.ratingSum, reissued.review.review?.rating);
  const second = fixture.economy.reissueReview({
    ride,
    graph,
    eventId: 'review-reissue:1',
    reviewModelVersion: '209-review-v3',
  });
  assert.equal(second.review.status, 'DUPLICATE');
  assert.equal(fixture.economy.snapshot(completed.terminalTick).reviews.reviewCount, 1);
  fixture.dispose();
});

test('209 economy: the adapter refuses an open ride and a missing route lane', () => {
  const fixture = createEconomyWorld({ requestCount: 1 }),
    begun = beginRide(fixture, 0, { boarded: true }),
    graph = fixture.world.dispatcherWorld.graph,
    ride = rideOf(fixture, begun);
  assert.throws(() => readRideEconomicOutcome(ride, graph), /Only a terminal ride/);
  const completed = completeRide(fixture, begun),
    terminal = rideOf(fixture, begun);
  assert.ok(completed.terminalTick > 0);
  assert.throws(
    () => readRideEconomicOutcome({ ...terminal, tripRouteLaneIds: ['lane:missing'] }, graph),
    /unknown to the lane graph/,
  );
  assert.throws(
    () => readRideEconomicOutcome({ ...terminal, tripRouteLaneIds: [] }, graph),
    /planned route/,
  );
  fixture.dispose();
});

test('209 economy: profile activations are reported on the day bucket, not mixed into revenue', () => {
  const fixture = createEconomyWorld({ requestCount: 1 }),
    begun = beginRide(fixture, 0, { boarded: true }),
    completed = completeRide(fixture, begun),
    ride = rideOf(fixture, begun),
    graph = fixture.world.dispatcherWorld.graph;
  fixture.economy.ingestRideOutcome({ ride, graph, comfort: comfortSnapshot(begun) });
  fixture.economy.noteProfileActivation(completed.terminalTick, 'profile:city:common:v1');
  const snapshot = fixture.economy.snapshot(completed.terminalTick);
  assert.deepEqual(snapshot.kpi.currentDay?.profileActivationMarkers, ['profile:city:common:v1']);
  assert.equal(
    snapshot.kpi.currentDay?.revenueMinorUnits,
    snapshot.ledger.totals.netRevenueMinorUnits,
  );
  fixture.dispose();
});
