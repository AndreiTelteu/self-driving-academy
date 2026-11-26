import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMPANY_LEDGER_VERSION,
  DEFAULT_COMPANY_COST_SCHEDULE,
  ECONOMY_CLOCK,
  createCompanyLedger,
  ticksPerMonth,
} from '../../src/economy';

const MONTH_TICKS = ticksPerMonth(ECONOMY_CLOCK);
const monthTick = (index: number): number => index * MONTH_TICKS + 1;

function completedRide(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rideId: 'ride-268-completed',
    requestId: 'request-268',
    taxiId: 'taxi-268',
    tick: 120,
    terminalState: 'COMPLETED',
    passengerAboard: true,
    plannedDistanceMeters: 5_000,
    revenueMinorUnits: 1_000,
    revenueSettlementId: 'settlement-268',
    ...overrides,
  };
}

test('268 company ledger: profit, cost and cash are separate and additive', () => {
  const ledger = createCompanyLedger({ namespace: 'test:company:profit' });
  try {
    const outcome = ledger.postRide(completedRide());
    assert.equal(outcome.status, 'ACCEPTED');
    assert.ok(outcome.entry !== null);
    const entry = outcome.entry!;
    assert.equal(entry.grossCostMinorUnits, 565);
    assert.equal(entry.grossProfitMinorUnits, 435);
    assert.deepEqual(
      entry.lines.map((line) => [line.category, line.amountMinorUnits]),
      [
        ['ENERGY', 300],
        ['MAINTENANCE', 225],
        ['INCIDENT', 0],
        ['SERVICE', 40],
      ],
    );
    const totals = ledger.totals();
    assert.equal(totals.revenueMinorUnits, 1_000);
    assert.equal(totals.grossCostMinorUnits, 565);
    assert.equal(totals.netCostMinorUnits, 565);
    assert.equal(totals.profitMinorUnits, 435);
    assert.equal(totals.cashMinorUnits, 50_435);
    assert.equal(totals.initialCashMinorUnits, 50_000);
    assert.equal(totals.terminalRides, 1);
    assert.equal(totals.historyScans, 0);

    const read = ledger.read(120);
    assert.equal(read.version, '268-company-finance-v1');
    assert.ok(read.month !== null);
    assert.equal(read.month!.revenueMinorUnits, 1_000);
    assert.equal(read.month!.rideCostMinorUnits, 565);
    assert.equal(read.month!.totalCostMinorUnits, 565);
    assert.equal(read.month!.profitMinorUnits, 435);
    assert.equal(read.month!.terminalRides, 1);
    assert.equal(read.month!.hasRideData, true);
    assert.equal(read.counters.xpWrites, 0);
    assert.equal(read.counters.economyWrites, 0);
    assert.equal(read.counters.investmentWrites, 0);
  } finally {
    ledger.dispose();
  }
});

test('268 company ledger: one terminal ride is one idempotent cost entry', () => {
  const ledger = createCompanyLedger({ namespace: 'test:company:duplicate' });
  try {
    const first = ledger.postRide(completedRide()),
      second = ledger.postRide(completedRide({ revenueMinorUnits: 9_999 }));
    assert.equal(first.status, 'ACCEPTED');
    assert.equal(second.status, 'DUPLICATE');
    assert.equal(second.duplicateReason, 'RIDE_ALREADY_COSTED');
    assert.equal(second.entry?.entryId, first.entry?.entryId);
    assert.equal(second.entry?.revenueMinorUnits, 1_000);
    const totals = ledger.totals();
    assert.equal(totals.rideCostEntries, 1);
    assert.equal(totals.revenueMinorUnits, 1_000);
    assert.equal(totals.profitMinorUnits, 435);
    assert.equal(ledger.snapshot(120).rideEntries.length, 1);
  } finally {
    ledger.dispose();
  }
});

test('268 company ledger: fixed monthly costs are applied once and make a real loss', () => {
  const ledger = createCompanyLedger({ namespace: 'test:company:fixed' });
  try {
    assert.equal(ledger.accrueFixedCosts({ tick: monthTick(1) }).status, 'ACCEPTED');
    const duplicate = ledger.accrueFixedCosts({ tick: monthTick(1) });
    assert.equal(duplicate.status, 'DUPLICATE');
    assert.equal(duplicate.duplicateReason, 'FIXED_COST_ALREADY_APPLIED');
    assert.equal(duplicate.applied, 0);
    const read = ledger.read(monthTick(1));
    assert.ok(read.month !== null);
    assert.equal(read.month!.terminalRides, 0);
    assert.equal(read.month!.hasRideData, false);
    assert.equal(read.month!.fixedCostsApplied, true);
    assert.equal(read.month!.fixedCostMinorUnits, 4_000);
    assert.equal(read.month!.totalCostMinorUnits, 4_000);
    assert.equal(read.month!.profitMinorUnits, -4_000);
    assert.equal(read.month!.completeness, 'PARTIAL');
    assert.equal(read.totals.profitMinorUnits, -4_000);
    assert.equal(read.totals.cashMinorUnits, 46_000);
    // A month without any entry is absent, not a fabricated zero.
    assert.equal(ledger.read(monthTick(2)).month, null);
    assert.equal(ledger.totals().fixedCostEntries, 3);
    assert.equal(ledger.totals().costByCategory.INSURANCE, 1_200);
    assert.equal(ledger.totals().costByCategory.SALARIES, 2_400);
    assert.equal(ledger.totals().costByCategory.LICENSES, 400);
  } finally {
    ledger.dispose();
  }
});

test('268 company ledger: a negative balance never makes cash negative', () => {
  const schedule = {
    ...DEFAULT_COMPANY_COST_SCHEDULE,
    initialCashMinorUnits: 0,
  };
  const ledger = createCompanyLedger({
    namespace: 'test:company:uncovered',
    schedule,
  });
  try {
    ledger.accrueFixedCosts({ tick: monthTick(1) });
    const totals = ledger.totals();
    assert.equal(totals.profitMinorUnits, -4_000);
    assert.equal(totals.cashMinorUnits, 0);
    assert.equal(totals.uncoveredLossMinorUnits, 4_000);
  } finally {
    ledger.dispose();
  }
});

test('268 company ledger: cancellation adjusts cost without rewriting the ride entry', () => {
  const ledger = createCompanyLedger({ namespace: 'test:company:cancellation' });
  try {
    const outcome = ledger.postRide({
      ...completedRide({ rideId: 'ride-268-cancelled' }),
      tick: 240,
      terminalState: 'CANCELLED',
      passengerAboard: false,
      plannedDistanceMeters: 5_000,
      revenueMinorUnits: 0,
    });
    assert.equal(outcome.status, 'ACCEPTED');
    assert.ok(outcome.entry !== null && outcome.adjustment !== null);
    assert.equal(outcome.entry!.grossCostMinorUnits, 40);
    assert.equal(
      outcome.entry!.lines.find((line) => line.category === 'ENERGY')!.amountMinorUnits,
      0,
    );
    assert.equal(outcome.adjustment!.amountMinorUnits, -40);
    assert.equal(outcome.adjustment!.cause, 'SERVICE_NOT_DELIVERED');
    assert.equal(outcome.adjustment!.referencesEntryId, outcome.entry!.entryId);
    assert.equal(ledger.entry('ride-268-cancelled')!.grossCostMinorUnits, 40);
    assert.equal(ledger.adjustmentsFor('ride-268-cancelled').length, 1);
    const totals = ledger.totals();
    assert.equal(totals.grossCostMinorUnits, 40);
    assert.equal(totals.adjustmentMinorUnits, -40);
    assert.equal(totals.netCostMinorUnits, 0);
    assert.equal(totals.profitMinorUnits, 0);
    assert.equal(totals.refundedRides, 1);
  } finally {
    ledger.dispose();
  }
});

test('268 company ledger: an explicit refund is a new adjustment, not a rewrite', () => {
  const ledger = createCompanyLedger({ namespace: 'test:company:refund' });
  try {
    const ride = ledger.postRide(completedRide({ rideId: 'ride-268-refund' }));
    assert.equal(ride.status, 'ACCEPTED');
    const gross = ride.entry!.grossCostMinorUnits;
    const refund = ledger.adjustRide({
      rideId: ride.entry!.rideId,
      cause: 'RIDE_REFUND',
      category: 'SERVICE',
      amountMinorUnits: -40,
      tick: 300,
    });
    assert.equal(refund.status, 'ACCEPTED');
    assert.equal(refund.adjustment!.referencesEntryId, ride.entry!.entryId);
    assert.equal(ledger.entry(ride.entry!.rideId)!.grossCostMinorUnits, gross);
    assert.equal(ledger.adjustmentsFor(ride.entry!.rideId).length, 1);
    const duplicate = ledger.adjustRide({
      rideId: ride.entry!.rideId,
      cause: 'RIDE_REFUND',
      category: 'SERVICE',
      amountMinorUnits: -40,
      tick: 301,
    });
    assert.equal(duplicate.status, 'DUPLICATE');
    assert.equal(duplicate.duplicateReason, 'ADJUSTMENT_ALREADY_APPLIED');
    assert.equal(ledger.adjustmentsFor(ride.entry!.rideId).length, 1);
    assert.equal(ledger.totals().netCostMinorUnits, gross - 40);
    assert.equal(ledger.totals().adjustmentMinorUnits, -40);
    assert.equal(
      ledger.adjustRide({
        rideId: 'missing-ride',
        cause: 'RIDE_REFUND',
        category: 'SERVICE',
        amountMinorUnits: -1,
        tick: 301,
      }).reason,
      'UNKNOWN_RIDE',
    );
  } finally {
    ledger.dispose();
  }
});

test('268 company ledger: invalid shapes are rejected without changing anything', () => {
  const ledger = createCompanyLedger({ namespace: 'test:company:invalid' });
  try {
    assert.equal(ledger.postRide({}).status, 'REJECTED');
    assert.equal(ledger.postRide({ ...completedRide(), unknown: true }).status, 'REJECTED');
    assert.equal(
      ledger.postRide({ ...completedRide(), terminalState: 'COMPLETED', passengerAboard: false })
        .status,
      'REJECTED',
    );
    assert.equal(ledger.totals().rideCostEntries, 0);
    assert.equal(ledger.totals().revenueMinorUnits, 0);
    assert.equal(ledger.getStats().rejectedRides, 3);
    assert.equal(ledger.getStats().lastRejection, 'INVALID_SHAPE');
  } finally {
    ledger.dispose();
  }
});

test('268 company ledger: no purchase, upgrade, XP or 209 write surface exists', () => {
  const ledger = createCompanyLedger({ namespace: 'test:company:boundary' });
  try {
    assert.equal(ledger.version, COMPANY_LEDGER_VERSION);
    assert.equal(Object.hasOwn(ledger, 'purchase'), false);
    assert.equal(Object.hasOwn(ledger, 'upgrade'), false);
    assert.equal(Object.hasOwn(ledger, 'buyVehicle'), false);
    assert.equal(ledger.read(0).counters.xpWrites, 0);
    assert.equal(ledger.read(0).counters.economyWrites, 0);
    assert.equal(ledger.read(0).counters.investmentWrites, 0);
    assert.equal(ledger.getStats().xpWrites, 0);
    assert.equal(ledger.getStats().economyWrites, 0);
    assert.equal(ledger.getStats().investmentWrites, 0);
  } finally {
    ledger.dispose();
  }
});

test('268 company ledger: reset clears the ledger and keeps the versioned schedule', () => {
  const ledger = createCompanyLedger({ namespace: 'test:company:reset' });
  try {
    ledger.postRide(completedRide());
    ledger.accrueFixedCosts({ tick: monthTick(1) });
    assert.ok(ledger.totals().rideCostEntries > 0);
    ledger.reset();
    const totals = ledger.totals();
    assert.equal(totals.rideCostEntries, 0);
    assert.equal(totals.revenueMinorUnits, 0);
    assert.equal(totals.fixedCostEntries, 0);
    assert.equal(totals.profitMinorUnits, 0);
    assert.equal(ledger.schedule.version, DEFAULT_COMPANY_COST_SCHEDULE.version);
  } finally {
    ledger.dispose();
  }
});
