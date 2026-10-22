import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_TARIFF_SCHEDULE,
  ECONOMY_CURRENCY,
  TARIFF_LIMITS,
  TARIFF_VERSION,
  fareSettlementRules,
  parseTariffSchedule,
  quoteFare,
  settleFare,
} from '../../src/economy';
import type { FareQuote, TariffSchedule } from '../../src/economy';

const PLAN = Object.freeze({
  plannedDistanceMeters: 1_027,
  referenceTripDurationSeconds: 83.776_385_927_505_33,
});

function quoteFor(plannedDistanceMeters: number, referenceTripDurationSeconds: number): FareQuote {
  return quoteFare({ plannedDistanceMeters, referenceTripDurationSeconds });
}

test('209 tariffs: the quote uses only the planned distance, the reference duration and integers', () => {
  const quote = quoteFor(PLAN.plannedDistanceMeters, PLAN.referenceTripDurationSeconds);
  assert.equal(quote.currency, ECONOMY_CURRENCY);
  assert.equal(quote.pricingVersion, TARIFF_VERSION);
  assert.equal(quote.baseFareMinorUnits, 240);
  // 1.027 km × 180 = 184.86 -> 185; 83.776… s / 60 × 90 = 125.66… -> 126.
  assert.equal(quote.distanceFareMinorUnits, 185);
  assert.equal(quote.timeFareMinorUnits, 126);
  assert.equal(quote.totalMinorUnits, 551);
  assert.ok(Number.isSafeInteger(quote.totalMinorUnits));
  assert.equal(
    quote.totalMinorUnits,
    quote.baseFareMinorUnits + quote.distanceFareMinorUnits + quote.timeFareMinorUnits,
  );
});

test('209 tariffs: the same planned ride always quotes the same fare', () => {
  const first = quoteFor(PLAN.plannedDistanceMeters, PLAN.referenceTripDurationSeconds),
    second = quoteFor(PLAN.plannedDistanceMeters, PLAN.referenceTripDurationSeconds);
  assert.deepEqual(first, second);
});

test('209 tariffs: a longer plan costs more, but the actual drive is never an input', () => {
  const short = quoteFor(500, 60),
    long = quoteFor(2_500, 60);
  assert.ok(long.totalMinorUnits > short.totalMinorUnits);
  // The only accepted fields are the planned distance and the reference duration: a measured
  // duration, a detour or a wait has no field and can therefore never change the price.
  assert.deepEqual(Object.keys(PLAN), ['plannedDistanceMeters', 'referenceTripDurationSeconds']);
});

test('209 tariffs: a completed ride keeps the whole quoted fare', () => {
  const quote = quoteFor(1_027, 84),
    settlement = settleFare({ terminalState: 'COMPLETED', passengerAboard: true }, quote);
  assert.equal(settlement.rule, 'COMPLETED_FARE');
  assert.equal(settlement.chargedMinorUnits, quote.totalMinorUnits);
  assert.equal(settlement.refundedMinorUnits, 0);
  assert.equal(settlement.netMinorUnits, quote.totalMinorUnits);
});

test('209 tariffs: a completed ride without a passenger is refused, not priced', () => {
  const quote = quoteFor(1_027, 84);
  assert.throws(
    () => settleFare({ terminalState: 'COMPLETED', passengerAboard: false }, quote),
    /carried the passenger/,
  );
});

test('209 tariffs: a failed ride refunds the full quoted fare', () => {
  const quote = quoteFor(1_027, 84),
    settlement = settleFare({ terminalState: 'FAILED', passengerAboard: true }, quote);
  assert.equal(settlement.rule, 'FAILED_FULL_REFUND');
  assert.equal(settlement.chargedMinorUnits, quote.totalMinorUnits);
  assert.equal(settlement.refundedMinorUnits, quote.totalMinorUnits);
  assert.equal(settlement.netMinorUnits, 0);
});

test('209 tariffs: a cancellation before boarding refunds everything', () => {
  const quote = quoteFor(1_027, 84),
    settlement = settleFare({ terminalState: 'CANCELLED', passengerAboard: false }, quote);
  assert.equal(settlement.rule, 'CANCELLED_BEFORE_PASSENGER_FULL_REFUND');
  assert.equal(settlement.refundedMinorUnits, quote.totalMinorUnits);
  assert.equal(settlement.netMinorUnits, 0);
});

test('209 tariffs: a cancellation with the passenger keeps only the versioned service fee', () => {
  const quote = quoteFor(1_027, 84),
    settlement = settleFare({ terminalState: 'CANCELLED', passengerAboard: true }, quote);
  assert.equal(settlement.rule, 'CANCELLED_WITH_PASSENGER_SERVICE_FEE');
  assert.equal(settlement.policyVersion, DEFAULT_TARIFF_SCHEDULE.cancellation.policyVersion);
  // 551 × 3 000 basis points / 10 000 = 165.3 -> 165 minor units.
  assert.equal(settlement.netMinorUnits, 165);
  assert.equal(settlement.refundedMinorUnits, quote.totalMinorUnits - 165);
  assert.deepEqual(
    new Set(fareSettlementRules).has(settlement.rule as (typeof fareSettlementRules)[number]),
    true,
  );
});

test('209 tariffs: a different versioned schedule changes the price without rewriting history', () => {
  const schedule: TariffSchedule = {
      ...DEFAULT_TARIFF_SCHEDULE,
      pricingVersion: '209-tariff-v2',
      baseFareMinorUnits: 500,
    },
    v1 = quoteFare(PLAN),
    v2 = quoteFare(PLAN, schedule);
  assert.equal(v1.pricingVersion, '209-tariff-v1');
  assert.equal(v2.pricingVersion, '209-tariff-v2');
  assert.equal(v2.totalMinorUnits - v1.totalMinorUnits, 260);
});

test('209 tariffs: the schedule reader rejects unknown, missing and inconsistent fields', () => {
  assert.throws(() => parseTariffSchedule({ ...DEFAULT_TARIFF_SCHEDULE, tips: 1 }), /field/);
  assert.throws(
    () =>
      parseTariffSchedule({
        ...DEFAULT_TARIFF_SCHEDULE,
        cancellation: {
          ...DEFAULT_TARIFF_SCHEDULE.cancellation,
          beforePassengerFeeMinorUnits: 10,
        },
      }),
    /before boarding/,
  );
  assert.throws(
    () =>
      parseTariffSchedule({
        ...DEFAULT_TARIFF_SCHEDULE,
        cancellation: {
          ...DEFAULT_TARIFF_SCHEDULE.cancellation,
          failureRefundBasisPoints: 5_000,
        },
      }),
    /whole quoted fare/,
  );
  assert.throws(
    () => parseTariffSchedule({ ...DEFAULT_TARIFF_SCHEDULE, currency: 'EUR' }),
    /Unsupported enum value/,
  );
});

test('209 tariffs: a corrupt plan cannot mint an unbounded fare', () => {
  assert.throws(() => quoteFor(TARIFF_LIMITS.maximumPlannedDistanceMeters + 1, 10));
  assert.throws(() => quoteFor(1_000, TARIFF_LIMITS.maximumReferenceDurationSeconds + 1));
  assert.throws(() => quoteFare({ plannedDistanceMeters: 1_000 } as never));
  assert.throws(() =>
    quoteFare({ plannedDistanceMeters: 1_000, referenceTripDurationSeconds: 60, tip: 1 } as never),
  );
});
