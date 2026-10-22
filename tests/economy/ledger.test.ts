import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEDGER_VERSION, createFleetLedger, quoteFare } from '../../src/economy';
import type { LedgerFacts } from '../../src/economy';

const PLAN = Object.freeze({
  plannedDistanceMeters: 1_027,
  referenceTripDurationSeconds: 84,
});
const QUOTE = quoteFare(PLAN);

function facts(overrides: Partial<LedgerFacts> = {}): LedgerFacts {
  return {
    eventId: 'ride-settled:ride-1',
    rideId: 'ride-1',
    requestId: 'request-1',
    taxiId: 'taxi-1',
    vehicleKind: 'TAXI',
    terminalState: 'COMPLETED',
    terminalTick: 1_000,
    passengerAboard: true,
    plannedDistanceMeters: PLAN.plannedDistanceMeters,
    referenceTripDurationSeconds: PLAN.referenceTripDurationSeconds,
    ...overrides,
  };
}

test('209 ledger: one completion charges the quoted fare exactly once', () => {
  const ledger = createFleetLedger(),
    result = ledger.ingest(facts());
  assert.equal(result.status, 'ACCEPTED');
  assert.equal(result.reason, null);
  assert.equal(result.settlement?.quotedMinorUnits, QUOTE.totalMinorUnits);
  assert.equal(result.settlement?.netMinorUnits, QUOTE.totalMinorUnits);
  assert.equal(result.settlement?.refundEntryId, null);
  const totals = ledger.totals();
  assert.equal(totals.settlements, 1);
  assert.equal(totals.completedRides, 1);
  assert.equal(totals.netRevenueMinorUnits, QUOTE.totalMinorUnits);
  assert.equal(totals.completedRevenueMinorUnits, QUOTE.totalMinorUnits);
  assert.equal(LEDGER_VERSION, ledger.version);
  ledger.dispose();
});

test('209 ledger: the same economic event replayed never charges twice', () => {
  const ledger = createFleetLedger(),
    first = ledger.ingest(facts()),
    replay = ledger.ingest(facts());
  assert.equal(replay.status, 'DUPLICATE');
  assert.equal(replay.duplicateReason, 'EVENT_REPLAY');
  assert.equal(replay.settlement?.settlementId, first.settlement?.settlementId);
  assert.equal(ledger.totals().settlements, 1);
  assert.equal(ledger.totals().netRevenueMinorUnits, QUOTE.totalMinorUnits);
  assert.equal(ledger.getStats().duplicates, 1);
  ledger.dispose();
});

test('209 ledger: a second terminal event with another id is refused for the same ride', () => {
  const ledger = createFleetLedger();
  ledger.ingest(facts());
  const other = ledger.ingest(facts({ eventId: 'ride-settled:ride-1:again' }));
  assert.equal(other.status, 'DUPLICATE');
  assert.equal(other.duplicateReason, 'RIDE_ALREADY_SETTLED');
  assert.equal(ledger.totals().settlements, 1);
  ledger.dispose();
});

test('209 ledger: a civilian terminal outcome is refused before any quote exists', () => {
  const ledger = createFleetLedger(),
    result = ledger.ingest(facts({ vehicleKind: 'CIVILIAN', rideId: 'civilian-1' }));
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'CIVILIAN_NOT_BILLABLE');
  assert.equal(result.settlement, null);
  assert.equal(ledger.totals().civilianOutcomesRejected, 1);
  assert.equal(ledger.totals().settlements, 0);
  assert.equal(ledger.totals().netRevenueMinorUnits, 0);
  // A rejected civilian event id is not remembered, so it can never shadow a real ride.
  assert.equal(ledger.getStats().retainedSettlements, 0);
  ledger.dispose();
});

test('209 ledger: a failure books a charge and an explicit refund that references it', () => {
  const ledger = createFleetLedger(),
    result = ledger.ingest(facts({ terminalState: 'FAILED', passengerAboard: true }));
  assert.equal(result.settlement?.rule, 'FAILED_FULL_REFUND');
  assert.equal(result.settlement?.netMinorUnits, 0);
  assert.equal(result.settlement?.refundedMinorUnits, QUOTE.totalMinorUnits);
  const snapshot = ledger.snapshot(1_000),
    charge = snapshot.entries.find((entry) => entry.entryId === result.settlement?.chargeEntryId),
    refund = snapshot.entries.find((entry) => entry.entryId === result.settlement?.refundEntryId);
  assert.equal(charge?.kind, 'CHARGE');
  assert.equal(charge?.amountMinorUnits, QUOTE.totalMinorUnits);
  assert.equal(refund?.kind, 'REFUND');
  assert.equal(refund?.cause, 'RIDE_FAILED_REFUND');
  assert.equal(refund?.referencesEntryId, charge?.entryId);
  assert.equal(ledger.totals().failedRevenueMinorUnits, 0);
  ledger.dispose();
});

test('209 ledger: the two cancellations keep different, explicit amounts', () => {
  const before = createFleetLedger(),
    beforeResult = before.ingest(
      facts({
        rideId: 'ride-before',
        eventId: 'e-before',
        passengerAboard: false,
        terminalState: 'CANCELLED',
      }),
    );
  assert.equal(beforeResult.settlement?.rule, 'CANCELLED_BEFORE_PASSENGER_FULL_REFUND');
  assert.equal(beforeResult.settlement?.netMinorUnits, 0);

  const after = createFleetLedger(),
    afterResult = after.ingest(
      facts({
        rideId: 'ride-after',
        eventId: 'e-after',
        passengerAboard: true,
        terminalState: 'CANCELLED',
      }),
    );
  assert.equal(afterResult.settlement?.rule, 'CANCELLED_WITH_PASSENGER_SERVICE_FEE');
  assert.equal(
    afterResult.settlement?.netMinorUnits,
    Math.round((QUOTE.totalMinorUnits * 3_000) / 10_000),
  );
  assert.equal(after.totals().cancellationRevenueMinorUnits, afterResult.settlement?.netMinorUnits);
  before.dispose();
  after.dispose();
});

test('209 ledger: malformed or unknown facts are rejected without touching the totals', () => {
  const ledger = createFleetLedger(),
    unknown = ledger.ingest({ ...facts(), tip: 100 }),
    missing = ledger.ingest({ eventId: 'x' });
  assert.equal(unknown.status, 'REJECTED');
  assert.equal(unknown.reason, 'INVALID_SHAPE');
  assert.equal(missing.status, 'REJECTED');
  assert.equal(ledger.totals().settlements, 0);
  assert.equal(ledger.getStats().rejected, 2);
  ledger.dispose();
});

test('209 ledger: retention is bounded and a read never rescans the history', () => {
  const ledger = createFleetLedger({ retainedSettlements: 1 });
  ledger.ingest(facts());
  ledger.ingest(facts({ rideId: 'ride-2', eventId: 'e-2', terminalTick: 2_000 }));
  const stats = ledger.getStats(),
    snapshot = ledger.snapshot(2_000);
  assert.equal(stats.retainedSettlements, 1);
  assert.equal(stats.droppedSettlements, 1);
  assert.equal(snapshot.settlements.length, 1);
  assert.equal(snapshot.settlements[0]?.rideId, 'ride-2');
  assert.equal(snapshot.historyScans, 0);
  // Totals survive eviction: the retired settlement was already counted.
  assert.equal(snapshot.totals.settlements, 2);
  ledger.dispose();
});

test('209 ledger: reset clears the money but keeps the instance usable', () => {
  const ledger = createFleetLedger();
  ledger.ingest(facts());
  ledger.reset();
  assert.equal(ledger.totals().settlements, 0);
  assert.equal(ledger.snapshot(0).entries.length, 0);
  assert.equal(ledger.ingest(facts()).status, 'ACCEPTED');
  ledger.dispose();
  assert.throws(() => ledger.ingest(facts()), /disposed/);
});
