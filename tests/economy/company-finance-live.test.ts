import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIVE_COMPANY_FINANCE_VERSION,
  createLiveCompanyFinance,
  type LiveCompanyStepResult,
} from '../../src/economy';
import { createPlayerProgress } from '../../src/missions';
import { createLiveEconomyFixture, type LiveEconomyFixture } from './live-economy-fixture';

function feed(fixture: LiveEconomyFixture, company: ReturnType<typeof createLiveCompanyFinance>) {
  const result = fixture.economyResult();
  if (result === null) return null;
  return company.step({ atTick: result.tick, settlements: result.settlements });
}

function xpFingerprint(player: ReturnType<typeof createPlayerProgress>) {
  const read = player.read();
  return {
    balanceMicroXp: read.xpBalanceMicroXp,
    balanceXp: read.xpBalance,
    level: read.level,
    entries: read.entries.length,
    debits: read.debits,
  };
}

test('268 live company: a real completed ride is costed once and never writes 209 or XP', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 268 }),
    company = createLiveCompanyFinance({
      namespace: 'test:live-company:268',
      clock: fixture.economy.clock,
    });
  const player = createPlayerProgress({ playerId: 'player:268:live' });
  try {
    fixture.runTo(60);
    const opening = feed(fixture, company);
    assert.ok(opening !== null);
    assert.equal(opening!.fixedCostsApplied, 3);

    const target = fixture.firstTarget();
    fixture.board(target);
    fixture.complete(target);
    const terminal = fixture.economyResult();
    assert.ok(terminal !== null);
    const settlementResult = terminal!.settlements.find(
      (entry) => entry.outcome.rideId === target.rideId,
    );
    assert.ok(settlementResult !== undefined);
    assert.equal(settlementResult!.settlement.status, 'ACCEPTED');
    const settlement = settlementResult!.settlement.settlement;
    assert.ok(settlement !== null);

    const economyBefore = fixture.economy.read();
    const xpBefore = xpFingerprint(player);
    const applied = feed(fixture, company);
    assert.ok(applied !== null);
    assert.equal(applied!.version, LIVE_COMPANY_FINANCE_VERSION);
    assert.equal(applied!.applied, 1);
    assert.equal(applied!.duplicates, 0);
    const economyAfter = fixture.economy.read();
    assert.deepEqual(economyAfter!.totals, economyBefore!.totals);
    assert.deepEqual(economyAfter!.counters, economyBefore!.counters);
    assert.deepEqual(xpFingerprint(player), xpBefore);

    const read = company.read();
    assert.ok(read !== null);
    assert.equal(read!.version, '268-company-finance-v1');
    assert.equal(read!.totals.rideCostEntries, 1);
    assert.equal(read!.totals.revenueMinorUnits, settlement!.netMinorUnits);
    assert.ok(read!.totals.grossCostMinorUnits > 0);
    assert.ok(read!.totals.netCostMinorUnits > 0);
    assert.equal(
      read!.totals.profitMinorUnits,
      read!.totals.revenueMinorUnits - read!.totals.netCostMinorUnits,
    );
    assert.equal(read!.counters.xpWrites, 0);
    assert.equal(read!.counters.economyWrites, 0);
    assert.equal(read!.counters.investmentWrites, 0);
    assert.equal(read!.historyScans, 0);
    assert.ok(read!.month !== null);
    assert.equal(read!.month!.terminalRides, 1);
    assert.equal(read!.month!.fixedCostsApplied, true);
    assert.equal(read!.month!.fixedCostMinorUnits, 4_000);
    assert.ok(read!.month!.revenueMinorUnits > 0);

    const entry = company.ledger.entry(target.rideId);
    assert.ok(entry !== undefined);
    assert.equal(entry!.revenueMinorUnits, settlement!.netMinorUnits);
    assert.equal(entry!.revenueSettlementId, settlement!.settlementId);
    assert.ok(entry!.plannedDistanceMeters > 0);
    assert.ok(entry!.lines.find((line) => line.category === 'ENERGY')!.amountMinorUnits > 0);
    assert.ok(entry!.lines.find((line) => line.category === 'MAINTENANCE')!.amountMinorUnits > 0);
    assert.equal(entry!.lines.find((line) => line.category === 'SERVICE')!.amountMinorUnits, 40);

    const duplicate = feed(fixture, company) as LiveCompanyStepResult;
    assert.equal(duplicate.applied, 0);
    assert.equal(duplicate.duplicates, 1);
    assert.equal(company.read()!.totals.revenueMinorUnits, read!.totals.revenueMinorUnits);
    assert.equal(company.read()!.totals.rideCostEntries, 1);

    const snapshot = company.snapshot();
    assert.ok(snapshot !== null);
    assert.equal(snapshot!.historyScans, 0);
    assert.equal(snapshot!.rideEntries.length, 1);
    assert.equal(snapshot!.fixedEntries.length, 3);
    assert.equal(Object.hasOwn(company.ledger, 'purchase'), false);
    assert.equal(Object.hasOwn(company.ledger, 'upgrade'), false);
    assert.equal(company.stats().xpWrites, 0);
    assert.equal(company.stats().economyWrites, 0);
    assert.equal(company.stats().investmentWrites, 0);
  } finally {
    company.dispose();
    fixture.dispose();
  }
});

test('268 live company: a real collision adds incident cost from the review evidence', () => {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 268 }),
    company = createLiveCompanyFinance({
      namespace: 'test:live-company:collision',
      clock: fixture.economy.clock,
    });
  try {
    fixture.runTo(60);
    feed(fixture, company);
    const target = fixture.firstTarget();
    fixture.board(target);
    fixture.runTo(fixture.currentTick() + 60);
    const collisionTick = fixture.currentTick() + 1;
    fixture.collisions.push({
      incidentId: 'incident-268-company',
      vehicleId: target.taxiId,
      otherEntityId: 'wall:268:company',
      tick: collisionTick,
      impulseNs: 4_400,
    });
    fixture.step(collisionTick);
    fixture.complete(target);
    feed(fixture, company);
    const read = company.read();
    assert.ok(read !== null);
    assert.equal(read!.counters.refundedRides, 0);
    const entry = company.ledger.entry(target.rideId);
    assert.ok(entry !== undefined);
    const incident = entry!.lines.find((line) => line.category === 'INCIDENT')!;
    assert.equal(incident.quantity, 1);
    assert.equal(incident.amountMinorUnits, 2_500);
    assert.ok(entry!.grossProfitMinorUnits < 0);
    assert.ok(read!.month!.profitMinorUnits < 0);
    assert.ok(read!.month!.costByCategory.INCIDENT >= 2_500);
    assert.equal(read!.counters.xpWrites, 0);
  } finally {
    company.dispose();
    fixture.dispose();
  }
});
