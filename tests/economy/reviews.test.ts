import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REVIEW_COEFFICIENTS,
  REVIEW_MAX_RATING,
  REVIEW_MODEL_VERSION,
  createReviewLedger,
  reviewPreferenceAdjustment,
} from '../../src/economy';
import type { ReviewFacts, ReviewLedger } from '../../src/economy';
import { comfortForRide } from './economy-fixture';

function facts(overrides: Partial<ReviewFacts> = {}): ReviewFacts {
  const rideId = overrides.rideId ?? 'ride-1';
  return {
    rideId,
    customerId: `customer:${rideId}`,
    terminalState: 'COMPLETED',
    terminalTick: 1_000,
    passengerAboard: true,
    referenceTripDurationSeconds: 84,
    actualTripDurationSeconds: 84,
    comfort: comfortForRide(rideId, 'taxi-1', 0, {}),
    ...overrides,
  };
}

function ledger(): ReviewLedger {
  return createReviewLedger({ retainedReviews: 16 });
}

test('209 reviews: a smooth on-time ride earns the top score with explicit reasons', () => {
  const store = ledger(),
    result = store.ingest({ eventId: 'review:1', facts: facts() });
  assert.equal(result.status, 'ACCEPTED');
  assert.equal(result.review?.rating, 5);
  assert.equal(result.review?.reviewModelVersion, REVIEW_MODEL_VERSION);
  assert.ok(result.review?.reasonCodes.includes('ON_TIME'));
  assert.ok(result.review?.reasonCodes.includes('SMOOTH_DRIVE'));
  assert.ok(result.review?.reasonCodes.includes('EFFICIENT_DELIVERY'));
  assert.equal(result.review?.penalties.delay, 0);
  assert.equal(result.review?.penalties.comfort, 0);
  assert.equal(result.review?.penalties.incident, 0);
  assert.ok(result.review?.exposureSeconds && result.review.exposureSeconds > 0);
  store.dispose();
});

test('209 reviews: delay is measured against the planned reference duration', () => {
  const store = ledger(),
    late = store.ingest({
      eventId: 'review:late',
      facts: facts({ actualTripDurationSeconds: 84 + 120 }),
    });
  assert.equal(late.status, 'ACCEPTED');
  assert.ok(late.review?.reasonCodes.includes('LATE_ARRIVAL'));
  assert.equal(late.review?.penalties.delay, 0.75);
  assert.equal(late.review?.evidence.delaySeconds, 120);
  assert.ok((late.review?.rating ?? 5) <= 5);

  const severe = store.ingest({
    eventId: 'review:severe',
    facts: facts({ rideId: 'ride-2', actualTripDurationSeconds: 84 + 240 }),
  });
  assert.ok(severe.review?.reasonCodes.includes('SEVERE_DELAY'));
  assert.ok((severe.review?.penalties.delay ?? 0) > (late.review?.penalties.delay ?? 0));
  store.dispose();
});

test('209 reviews: real comfort and real impacts lower the score with explainable reasons', () => {
  const smooth = ledger(),
    smoothResult = smooth.ingest({ eventId: 'review:smooth', facts: facts() }),
    harsh = ledger(),
    harshResult = harsh.ingest({
      eventId: 'review:harsh',
      facts: facts({
        comfort: comfortForRide('ride-1', 'taxi-1', 0, {
          accelerationMps2: 2.5,
          impacts: 1,
        }),
      }),
    });
  assert.equal(harshResult.status, 'ACCEPTED');
  assert.ok(harshResult.review?.reasonCodes.includes('HARD_BRAKING'));
  assert.ok(harshResult.review?.reasonCodes.includes('COLLISION'));
  assert.ok((harshResult.review?.penalties.comfort ?? 0) > 0);
  assert.ok((harshResult.review?.penalties.incident ?? 0) > 0);
  assert.ok((harshResult.review?.rating ?? 5) < (smoothResult.review?.rating ?? 0));
  assert.equal(harshResult.review?.evidence.impacts, 1);
  smooth.dispose();
  harsh.dispose();
});

test('209 reviews: impacts never enter the comfort term, only the incident term', () => {
  const base = comfortForRide('ride-1', 'taxi-1', 0, { accelerationMps2: 1 }),
    withImpact = comfortForRide('ride-2', 'taxi-1', 0, { accelerationMps2: 1, impacts: 1 }),
    store = ledger(),
    first = store.ingest({ eventId: 'review:a', facts: facts({ comfort: base }) }),
    second = store.ingest({
      eventId: 'review:b',
      facts: facts({ rideId: 'ride-2', comfort: withImpact }),
    });
  assert.equal(first.review?.evidence.comfortPenalty, second.review?.evidence.comfortPenalty);
  assert.ok((second.review?.penalties.incident ?? 0) > 0);
  store.dispose();
});

test('209 reviews: a waiting recovery is a service consequence, not an invented zero', () => {
  const store = ledger(),
    result = store.ingest({
      eventId: 'review:blocked',
      facts: facts({ blockedSeconds: 120 }),
    });
  assert.equal(result.status, 'ACCEPTED');
  assert.ok(result.review?.reasonCodes.includes('BLOCKED_ROUTE'));
  assert.equal(result.review?.penalties.incident, REVIEW_COEFFICIENTS.blockedPenaltyPoints);
  store.dispose();
});

test('209 reviews: a ride without a real passenger experience produces no review', () => {
  const store = ledger(),
    noPassenger = store.ingest({
      eventId: 'review:none',
      facts: facts({
        passengerAboard: false,
        terminalState: 'CANCELLED',
        actualTripDurationSeconds: null,
      }),
    }),
    noComfort = store.ingest({
      eventId: 'review:nocomfort',
      facts: facts({ rideId: 'ride-2', comfort: null }),
    }),
    foreignComfort = store.ingest({
      eventId: 'review:foreign',
      facts: facts({
        rideId: 'ride-3',
        comfort: comfortForRide('someone-else', 'taxi-9', 0, {}),
      }),
    });
  assert.equal(noPassenger.status, 'NOT_ELIGIBLE');
  assert.equal(noPassenger.reason, 'NO_PASSENGER_EXPERIENCE');
  assert.equal(noComfort.reason, 'NO_COMFORT_EXPOSURE');
  assert.equal(foreignComfort.reason, 'COMFORT_SCOPE_MISMATCH');
  assert.equal(store.snapshot(0).reviewCount, 0);
  assert.equal(store.snapshot(0).averageRating, null);
  store.dispose();
});

test('209 reviews: a failed ride keeps the passenger experience and explains the failure', () => {
  const store = ledger(),
    result = store.ingest({
      eventId: 'review:failed',
      facts: facts({ terminalState: 'FAILED', actualTripDurationSeconds: 40 }),
    });
  assert.equal(result.status, 'ACCEPTED');
  assert.ok(result.review?.reasonCodes.includes('RIDE_FAILED'));
  assert.equal(result.review?.penalties.failure, REVIEW_COEFFICIENTS.failurePenalty);
  assert.ok((result.review?.rating ?? 5) < REVIEW_MAX_RATING);
  store.dispose();
});

test('209 reviews: the rating is an integer on the 0–5 scale even when everything fails', () => {
  const store = ledger(),
    result = store.ingest({
      eventId: 'review:worst',
      facts: facts({
        terminalState: 'FAILED',
        actualTripDurationSeconds: 84 + 4_000,
        comfort: comfortForRide('ride-1', 'taxi-1', 0, {
          accelerationMps2: 4,
          lateralAccelerationMps2: 6,
          lateralLimitMps2: 2,
          impacts: 3,
          impulseNs: 10_000,
        }),
      }),
    });
  assert.equal(result.review?.rating, 0);
  assert.ok(Number.isInteger(result.review?.rating));
  assert.ok((result.review?.rating ?? 1) >= 0 && (result.review?.rating ?? 6) <= 5);
  store.dispose();
});

test('209 reviews: the same event replayed is a duplicate, not a second review', () => {
  const store = ledger();
  store.ingest({ eventId: 'review:1', facts: facts() });
  const replay = store.ingest({ eventId: 'review:1', facts: facts() });
  assert.equal(replay.status, 'DUPLICATE');
  assert.equal(store.snapshot(0).reviewCount, 1);
  store.dispose();
});

test('209 reviews: another event id never rewrites an existing review', () => {
  const store = ledger(),
    first = store.ingest({ eventId: 'review:1', facts: facts() }),
    second = store.ingest({
      eventId: 'review:1:again',
      facts: facts({
        comfort: comfortForRide('ride-1', 'taxi-1', 0, {
          accelerationMps2: 3,
          lateralAccelerationMps2: 5,
          lateralLimitMps2: 2,
          impacts: 2,
        }),
      }),
    });
  assert.equal(second.status, 'EXISTING');
  assert.equal(second.review?.reviewId, first.review?.reviewId);
  assert.equal(second.review?.rating, first.review?.rating);
  assert.equal(second.review?.revision, 0);
  assert.equal(store.snapshot(0).reviewCount, 1);
  store.dispose();
});

test('209 reviews: rewriting requires an explicit, acknowledged, versioned reissue', () => {
  const store = ledger(),
    first = store.ingest({ eventId: 'review:1', facts: facts() }),
    refused = store.reissue({ eventId: 'review:1:reissue', facts: facts() }),
    sameVersion = store.reissue({
      eventId: 'review:1:same',
      acknowledgeModelChange: true,
      facts: facts(),
    }),
    reissued = store.reissue({
      eventId: 'review:1:reissue',
      acknowledgeModelChange: true,
      reviewModelVersion: '209-review-v2',
      facts: facts({
        comfort: comfortForRide('ride-1', 'taxi-1', 0, { accelerationMps2: 2.5 }),
      }),
    });
  assert.equal(refused.status, 'REJECTED');
  assert.equal(refused.reason, 'MODEL_CHANGE_NOT_ACKNOWLEDGED');
  assert.equal(sameVersion.status, 'EXISTING');
  assert.equal(reissued.status, 'REISSUED');
  assert.equal(reissued.review?.revision, 1);
  assert.equal(reissued.review?.reviewModelVersion, '209-review-v2');
  assert.equal(reissued.supersedesReviewId, first.review?.reviewId);
  assert.notEqual(reissued.review?.reviewId, first.review?.reviewId);
  const snapshot = store.snapshot(0);
  assert.equal(snapshot.reviewCount, 1);
  assert.equal(snapshot.reissuedReviews, 1);
  assert.equal(store.getStats().reissued, 1);
  store.dispose();
});

test('209 reviews: a reissue of an unknown ride is refused', () => {
  const store = ledger(),
    result = store.reissue({
      eventId: 'review:unknown',
      acknowledgeModelChange: true,
      reviewModelVersion: '209-review-v2',
      facts: facts({ rideId: 'ride-unknown' }),
    });
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'UNKNOWN_RIDE');
  store.dispose();
});

test('209 reviews: preference is deterministic per ride and customer', () => {
  const first = reviewPreferenceAdjustment('ride-1:customer:request-1'),
    second = reviewPreferenceAdjustment('ride-1:customer:request-1'),
    other = reviewPreferenceAdjustment('ride-2:customer:request-2');
  assert.equal(first, second);
  assert.ok(Math.abs(first) <= REVIEW_COEFFICIENTS.preferenceRange);
  assert.notEqual(first, other);
});

test('209 reviews: pagination and the histogram are bounded and read-only', () => {
  const store = ledger();
  for (let index = 0; index < 4; index += 1)
    store.ingest({
      eventId: `review:${index}`,
      facts: facts({
        rideId: `ride-${index}`,
        customerId: `customer-${index}`,
        terminalTick: 1_000 + index,
      }),
    });
  const page = store.page(1, 2),
    snapshot = store.snapshot(2_000);
  assert.equal(page.total, 4);
  assert.equal(page.reviews.length, 2);
  assert.equal(snapshot.historyScans, 0);
  assert.equal(
    snapshot.ratingHistogram.reduce((sum, count) => sum + count, 0),
    snapshot.reviewCount,
  );
  assert.equal(
    snapshot.averageRating,
    Math.round((snapshot.ratingSum / snapshot.reviewCount) * 1e6) / 1e6,
  );
  assert.throws(() => store.page(0, 0), /page size/);
  assert.throws(() => store.page(0, 1_000), /page size/);
  store.dispose();
});
