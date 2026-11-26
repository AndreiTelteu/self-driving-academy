import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMPANY_EVOLUTION_VERSION,
  COMPANY_LEVEL_THRESHOLDS,
  COMPANY_UPGRADES,
  COMPANY_VEHICLE_OFFERS,
  DEFAULT_COMPANY_COST_SCHEDULE,
  ECONOMY_CLOCK,
  companyLevelFor,
  createCompanyEvolution,
  createCompanyLedger,
  createLiveCompanyEvolution,
  ticksPerMonth,
  type CompanyEvolution,
  type CompanyEvolutionSnapshot,
  type CompanyLedger,
} from '../../src/economy';
import { createFleetRegistry, type FleetRegistry } from '../../src/fleet';
import { createPlayerProgress } from '../../src/missions';
import { createCityStyleProfile } from '../../src/app';

const MONTH_TICKS = ticksPerMonth(ECONOMY_CLOCK);
const NEXT_MONTH = MONTH_TICKS;

function createFleet(namespace = 'test:company:evolution:fleet'): FleetRegistry {
  return createFleetRegistry({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-269',
    worldEpoch: 1,
    scenarioId: 'scenario-269',
    seed: 269,
    namespace,
    taxiCount: 20,
    civilianCount: 20,
    profile: { profileId: 'v3-city-style', versionId: 'v3-city-style-v1' },
  });
}

function ride(
  ledger: CompanyLedger,
  rideId: string,
  atTick: number,
  overrides: Record<string, unknown> = {},
): void {
  const outcome = ledger.postRide({
    rideId,
    requestId: `request:${rideId}`,
    taxiId: 'taxi-269',
    tick: atTick,
    terminalState: 'COMPLETED',
    passengerAboard: true,
    plannedDistanceMeters: 5_000,
    revenueMinorUnits: 1_000,
    revenueSettlementId: `settlement:${rideId}`,
    ...overrides,
  });
  assert.equal(outcome.status, 'ACCEPTED', `ride ${rideId} was not accepted`);
}

function creditProfit(ledger: CompanyLedger, rides: number, startTick = 100): void {
  for (let index = 0; index < rides; index += 1)
    ride(ledger, `ride-269-profit-${startTick}-${index}`, startTick + index);
}

function createEvolution(
  ledger: CompanyLedger,
  fleet: FleetRegistry | null,
  namespace = 'test:company:evolution',
): CompanyEvolution {
  return createCompanyEvolution({
    ledger,
    ...(fleet === null ? {} : { fleet }),
    namespace,
  });
}

test('269 levels are a monotonic function of reinvested profit, separate from XP', () => {
  assert.deepEqual(
    COMPANY_LEVEL_THRESHOLDS.map((entry) => entry.minimumReinvestedProfitMinorUnits),
    [0, 5_000, 15_000, 35_000, 70_000, 120_000],
  );
  for (let index = 1; index < COMPANY_LEVEL_THRESHOLDS.length; index += 1)
    assert.ok(
      COMPANY_LEVEL_THRESHOLDS[index]!.minimumReinvestedProfitMinorUnits >
        COMPANY_LEVEL_THRESHOLDS[index - 1]!.minimumReinvestedProfitMinorUnits,
    );
  assert.equal(companyLevelFor(0), 1);
  assert.equal(companyLevelFor(4_999), 1);
  assert.equal(companyLevelFor(5_000), 2);
  assert.equal(companyLevelFor(14_999), 2);
  assert.equal(companyLevelFor(15_000), 3);
  assert.equal(companyLevelFor(120_000), 6);

  const fleet = createFleet(),
    ledger = createCompanyLedger({ namespace: 'test:company:level' }),
    evolution = createEvolution(ledger, fleet),
    player = createPlayerProgress({ playerId: 'player:269:level' });
  try {
    const xpBefore = player.read();
    assert.equal(evolution.read(0).companyLevel.level, 1);
    assert.equal(evolution.read(0).companyLevel.xpLevelUsed, false);

    creditProfit(ledger, 12);
    // Profit alone is not "reinvested": the level waits for a real investment outflow.
    assert.equal(evolution.read(200).companyLevel.level, 1);
    assert.equal(evolution.read(200).companyLevel.reinvestedProfitMinorUnits, 0);
    assert.equal(evolution.purchase(COMPANY_VEHICLE_OFFERS[0]!.offerId, 250).status, 'ACCEPTED');
    assert.equal(evolution.read(250).companyLevel.level, 2);
    assert.equal(evolution.read(250).companyLevel.reinvestedProfitMinorUnits, 5_220);
    assert.equal(evolution.read(250).counters.xpWrites, 0);
    assert.deepEqual(player.read(), xpBefore);

    // A loss never lowers the level and never touches XP.
    ride(ledger, 'ride-269-big-loss', 300, {
      revenueMinorUnits: 0,
      plannedDistanceMeters: 400_000,
    });
    assert.ok(ledger.totals().profitMinorUnits < 0);
    assert.equal(evolution.read(300).companyLevel.level, 2);
    assert.equal(evolution.read(300).companyLevel.reinvestedProfitMinorUnits, 5_220);
    assert.deepEqual(player.read(), xpBefore);
  } finally {
    evolution.dispose();
    ledger.dispose();
    fleet.dispose();
  }
});

test('269 a purchase adds the real fleet vehicle, spends cash and respects the slot', () => {
  const fleet = createFleet(),
    ledger = createCompanyLedger({ namespace: 'test:company:purchase' }),
    evolution = createEvolution(ledger, fleet);
  try {
    const offer = COMPANY_VEHICLE_OFFERS[0]!;
    const before = evolution.read(100);
    assert.equal(before.fleet.taxis, 20);
    assert.equal(before.fleet.purchasedTaxis, 0);
    assert.equal(before.cash.cashMinorUnits, 50_000);
    assert.equal(before.companyLevel.level, 1);

    const outcome = evolution.purchase(offer.offerId, 100);
    assert.equal(outcome.status, 'ACCEPTED');
    assert.ok(outcome.purchase !== null);
    const purchase = outcome.purchase!;
    assert.equal(purchase.costMinorUnits, offer.costMinorUnits);
    assert.equal(purchase.slot, 21);
    assert.equal(purchase.classId, offer.classId);
    assert.equal(fleet.get(purchase.vehicleId)?.slot, 21);
    assert.equal(fleet.get(purchase.vehicleId)?.classId, offer.classId);
    assert.equal(fleet.counts().taxis, 21);
    assert.equal(fleet.counts().vehicles, 41);
    assert.equal(evolution.fleet, fleet);
    assert.equal(outcome.read.cash.investmentMinorUnits, offer.costMinorUnits);
    assert.equal(outcome.read.cash.cashMinorUnits, 50_000 - offer.costMinorUnits);
    assert.equal(outcome.read.fleet.purchasedTaxis, 1);
    assert.equal(outcome.read.fleet.purchased[0]?.vehicleId, purchase.vehicleId);
    assert.equal(outcome.read.fleet.purchased[0]?.slot, 21);
    assert.equal(outcome.read.counters.investmentWrites, 1);

    const duplicate = evolution.purchase(offer.offerId, 101);
    assert.equal(duplicate.status, 'REJECTED');
    assert.equal(duplicate.reason, 'ALREADY_OWNED');
    assert.equal(fleet.counts().taxis, 21);
    assert.equal(ledger.totals().investmentMinorUnits, offer.costMinorUnits);
    assert.equal(evolution.read(101).refusals.byReason.ALREADY_OWNED, 1);
    const stale = evolution.purchase(COMPANY_VEHICLE_OFFERS[1]!.offerId, 50);
    assert.equal(stale.status, 'REJECTED');
    assert.equal(stale.reason, 'INVALID_INPUT');
    assert.equal(fleet.counts().taxis, 21);
  } finally {
    evolution.dispose();
    ledger.dispose();
    fleet.dispose();
  }
});

test('269 insufficient cash and level refusals change nothing', () => {
  const fleet = createFleet(),
    lowCash = createCompanyLedger({
      namespace: 'test:company:low-cash',
      schedule: { ...DEFAULT_COMPANY_COST_SCHEDULE, initialCashMinorUnits: 10_000 },
    }),
    company = createEvolution(lowCash, fleet);
  try {
    const offer = COMPANY_VEHICLE_OFFERS[0]!;
    const before = company.read(100);
    const outcome = company.purchase(offer.offerId, 100);
    assert.equal(outcome.status, 'REJECTED');
    assert.equal(outcome.reason, 'INSUFFICIENT_CASH');
    assert.equal(fleet.counts().taxis, 20);
    assert.equal(lowCash.totals().investmentMinorUnits, 0);
    assert.equal(lowCash.totals().cashMinorUnits, 10_000);
    assert.deepEqual(company.read(100).cash, before.cash);
    assert.equal(company.read(100).refusals.byReason.INSUFFICIENT_CASH, 1);
  } finally {
    company.dispose();
    lowCash.dispose();
    fleet.dispose();
  }

  const richFleet = createFleet('test:company:evolution:fleet:level'),
    richLedger = createCompanyLedger({ namespace: 'test:company:level-required' }),
    richCompany = createEvolution(richLedger, richFleet);
  try {
    const locked = COMPANY_VEHICLE_OFFERS.find((entry) => entry.requiredLevel === 2)!;
    const outcome = richCompany.purchase(locked.offerId, 100);
    assert.equal(outcome.status, 'REJECTED');
    assert.equal(outcome.reason, 'LEVEL_REQUIRED');
    assert.equal(richFleet.counts().taxis, 20);
    assert.equal(richLedger.totals().investmentMinorUnits, 0);
    assert.equal(richCompany.read(100).refusals.byReason.LEVEL_REQUIRED, 1);
  } finally {
    richCompany.dispose();
    richLedger.dispose();
    richFleet.dispose();
  }
});

test('269 an upgrade has a declared next-period effect and a duplicate is refused', () => {
  const fleet = createFleet(),
    ledger = createCompanyLedger({ namespace: 'test:company:upgrade' }),
    evolution = createEvolution(ledger, fleet),
    upgrade = COMPANY_UPGRADES.find((entry) => entry.upgradeId === 'upgrade-service-contract')!;
  try {
    creditProfit(ledger, 12);
    ride(ledger, 'ride-269-before-upgrade', 300);
    const before = ledger.entry('ride-269-before-upgrade')!;
    assert.equal(before.lines.find((line) => line.category === 'SERVICE')!.amountMinorUnits, 40);
    // The first purchase is what turns the 5 220 SDA of realized profit into reinvested profit.
    assert.equal(evolution.purchase(COMPANY_VEHICLE_OFFERS[0]!.offerId, 350).status, 'ACCEPTED');
    assert.equal(evolution.read(350).companyLevel.level, 2);

    const outcome = evolution.upgrade(upgrade.upgradeId, 400);
    assert.equal(outcome.status, 'ACCEPTED');
    assert.ok(outcome.upgrade !== null);
    assert.equal(outcome.upgrade!.effectiveFromTick, NEXT_MONTH);
    assert.equal(outcome.upgrade!.effectiveFromPeriodId, 'm0001');
    assert.equal(outcome.upgrade!.basisPoints, 5_000);
    assert.equal(
      outcome.read.upgrades.find((view) => view.upgrade.upgradeId === upgrade.upgradeId)?.effective,
      false,
    );
    assert.equal(outcome.read.pendingEffects[0]?.category, 'SERVICE');
    assert.equal(outcome.read.pendingEffects[0]?.basisPoints, 5_000);

    // Same period: the already declared cost is still the base cost.
    ride(ledger, 'ride-269-same-period', 500);
    const same = ledger.entry('ride-269-same-period')!;
    assert.equal(same.lines.find((line) => line.category === 'SERVICE')!.amountMinorUnits, 40);

    // Next period: the stored effect is visible and the old entry is untouched.
    ride(ledger, 'ride-269-next-period', NEXT_MONTH);
    const next = ledger.entry('ride-269-next-period')!;
    const service = next.lines.find((line) => line.category === 'SERVICE')!;
    assert.equal(service.baseAmountMinorUnits, 40);
    assert.equal(service.amountMinorUnits, 20);
    assert.equal(service.appliedBasisPoints, 5_000);
    assert.equal(service.appliedModifierId, outcome.upgrade!.modifierId);
    assert.equal(service.appliedModifierVersion, upgrade.version);
    assert.equal(
      ledger.entry('ride-269-before-upgrade')!.grossCostMinorUnits,
      before.grossCostMinorUnits,
    );
    assert.equal(
      evolution
        .read(NEXT_MONTH)
        .upgrades.find((view) => view.upgrade.upgradeId === upgrade.upgradeId)?.effective,
      true,
    );
    assert.equal(evolution.read(NEXT_MONTH).pendingEffects.length, 0);
    assert.ok(
      evolution.read(NEXT_MONTH).finance.months.some((month) => month.periodId === 'm0001'),
    );

    // A cancellation refunds the applied service line, not the undiscounted base rate.
    const cancelled = ledger.postRide({
      rideId: 'ride-269-next-period-cancelled',
      requestId: 'request:ride-269-next-period-cancelled',
      taxiId: 'taxi-269',
      tick: NEXT_MONTH + 1,
      terminalState: 'CANCELLED',
      passengerAboard: false,
      plannedDistanceMeters: 5_000,
      revenueMinorUnits: 0,
      revenueSettlementId: 'settlement:ride-269-next-period-cancelled',
    });
    assert.equal(cancelled.status, 'ACCEPTED');
    assert.equal(
      cancelled.entry!.lines.find((line) => line.category === 'SERVICE')!.amountMinorUnits,
      20,
    );
    assert.equal(cancelled.adjustment!.amountMinorUnits, -20);

    const duplicate = evolution.upgrade(upgrade.upgradeId, NEXT_MONTH + 1);
    assert.equal(duplicate.status, 'REJECTED');
    assert.equal(duplicate.reason, 'ALREADY_OWNED');
    assert.equal(ledger.totals().investments, 2);
    assert.equal(
      ledger.totals().investmentMinorUnits,
      COMPANY_VEHICLE_OFFERS[0]!.costMinorUnits + upgrade.costMinorUnits,
    );
  } finally {
    evolution.dispose();
    ledger.dispose();
    fleet.dispose();
  }
});

test('269 purchase and upgrade snapshots restore level, cash and the real fleet slot', () => {
  const fleetA = createFleet('test:company:evolution:fleet:restore'),
    ledgerA = createCompanyLedger({ namespace: 'test:company:restore' }),
    companyA = createEvolution(ledgerA, fleetA, 'test:company:evolution:restore');
  let snapshot: CompanyEvolutionSnapshot | null = null;
  try {
    creditProfit(ledgerA, 12);
    const purchase = companyA.purchase(COMPANY_VEHICLE_OFFERS[0]!.offerId, 500);
    assert.equal(purchase.status, 'ACCEPTED');
    const upgrade = companyA.upgrade(
      COMPANY_UPGRADES.find((entry) => entry.upgradeId === 'upgrade-service-contract')!.upgradeId,
      600,
    );
    assert.equal(upgrade.status, 'ACCEPTED');
    snapshot = companyA.snapshot(700);
    assert.equal(snapshot.purchases.length, 1);
    assert.equal(snapshot.upgrades.length, 1);
    assert.equal(snapshot.companyLevel.level, 2);
    assert.equal(snapshot.ledger.cashMinorUnits, 35_220);
  } finally {
    companyA.dispose();
    ledgerA.dispose();
    fleetA.dispose();
  }

  const fleetB = createFleet('test:company:evolution:fleet:restore'),
    ledgerB = createCompanyLedger({ namespace: 'test:company:restore' }),
    companyB = createEvolution(ledgerB, fleetB, 'test:company:evolution:restore');
  try {
    // Simulate the 278 handoff: the 268 operating ledger is restored first (same rides, same
    // high-water), then the 269 journal is replayed against the empty investment journal.
    creditProfit(ledgerB, 12);
    const restored = companyB.restore(snapshot);
    assert.equal(restored.restored, true);
    assert.equal(restored.purchases, 1);
    assert.equal(restored.upgrades, 1);
    const readA = companyB.read(700);
    assert.equal(readA.companyLevel.level, 2);
    assert.equal(readA.companyLevel.reinvestedProfitMinorUnits, 5_220);
    assert.equal(readA.cash.cashMinorUnits, 35_220);
    assert.equal(readA.cash.investmentMinorUnits, 20_000);
    assert.equal(readA.fleet.purchasedTaxis, 1);
    const purchase = readA.offers.find((view) => view.state === 'OWNED')!.purchase!;
    assert.equal(purchase.slot, 21);
    assert.equal(fleetB.get(purchase.vehicleId)?.slot, 21);
    assert.equal(fleetB.counts().taxis, 21);
    assert.equal(
      readA.upgrades.find((view) => view.state === 'OWNED')?.ownership?.effectiveFromTick,
      NEXT_MONTH,
    );
    assert.equal(readA.counters.xpWrites, 0);
    assert.equal(readA.counters.profileWrites, 0);
    assert.equal(readA.counters.styleOverrides, 0);
  } finally {
    companyB.dispose();
    ledgerB.dispose();
    fleetB.dispose();
  }
});

test('269 restore adopts a fleet already restored by 278 instead of adding a duplicate', () => {
  const fleetA = createFleet('test:company:evolution:fleet:adopt'),
    ledgerA = createCompanyLedger({ namespace: 'test:company:adopt' }),
    companyA = createEvolution(ledgerA, fleetA, 'test:company:evolution:adopt');
  let snapshot: CompanyEvolutionSnapshot | null = null;
  try {
    creditProfit(ledgerA, 12);
    companyA.purchase(COMPANY_VEHICLE_OFFERS[0]!.offerId, 500);
    companyA.upgrade(
      COMPANY_UPGRADES.find((entry) => entry.upgradeId === 'upgrade-service-contract')!.upgradeId,
      600,
    );
    snapshot = companyA.snapshot(700);
  } finally {
    companyA.dispose();
    ledgerA.dispose();
    fleetA.dispose();
  }

  const fleetB = createFleet('test:company:evolution:fleet:adopt'),
    ledgerB = createCompanyLedger({ namespace: 'test:company:adopt' }),
    companyB = createEvolution(ledgerB, fleetB, 'test:company:evolution:adopt');
  try {
    creditProfit(ledgerB, 12);
    const saved = snapshot.purchases[0]!;
    fleetB.addVehicle('TAXI', saved.classId, { tick: saved.tick });
    assert.equal(fleetB.counts().taxis, 21);
    const restored = companyB.restore(snapshot);
    assert.equal(restored.purchases, 1);
    assert.equal(fleetB.counts().taxis, 21);
    assert.equal(companyB.read(700).fleet.purchasedTaxis, 1);
    assert.equal(companyB.read(700).fleet.purchased[0]?.vehicleId, saved.vehicleId);
  } finally {
    companyB.dispose();
    ledgerB.dispose();
    fleetB.dispose();
  }
});

test('269 restore adopts an already persisted ledger without replaying the cash outflow', () => {
  const fleetA = createFleet('test:company:evolution:fleet:persisted'),
    ledgerA = createCompanyLedger({ namespace: 'test:company:persisted' }),
    companyA = createEvolution(ledgerA, fleetA, 'test:company:evolution:persisted'),
    offer = COMPANY_VEHICLE_OFFERS[0]!,
    upgrade = COMPANY_UPGRADES.find((entry) => entry.upgradeId === 'upgrade-service-contract')!;
  let snapshot: CompanyEvolutionSnapshot | null = null;
  try {
    creditProfit(ledgerA, 12);
    companyA.purchase(offer.offerId, 500);
    companyA.upgrade(upgrade.upgradeId, 600);
    snapshot = companyA.snapshot(700);
  } finally {
    companyA.dispose();
    ledgerA.dispose();
    fleetA.dispose();
  }

  const fleetB = createFleet('test:company:evolution:fleet:persisted'),
    ledgerB = createCompanyLedger({ namespace: 'test:company:persisted' }),
    companyB = createEvolution(ledgerB, fleetB, 'test:company:evolution:persisted');
  try {
    creditProfit(ledgerB, 12);
    const investment = ledgerB.invest({
        kind: 'VEHICLE_PURCHASE',
        referenceId: offer.offerId,
        amountMinorUnits: offer.costMinorUnits,
        tick: 500,
      }),
      effect = ledgerB.invest({
        kind: 'UPGRADE',
        referenceId: upgrade.upgradeId,
        amountMinorUnits: upgrade.costMinorUnits,
        tick: 600,
        effect: {
          version: upgrade.version,
          category: upgrade.effect.category,
          basisPoints: upgrade.effect.basisPoints,
          effectiveFromTick: NEXT_MONTH,
        },
      });
    assert.equal(investment.status, 'ACCEPTED');
    assert.equal(effect.status, 'ACCEPTED');
    fleetB.addVehicle('TAXI', offer.classId, { tick: 500 });
    const before = ledgerB.totals();
    const restored = companyB.restore(snapshot);
    assert.equal(restored.purchases, 1);
    assert.equal(restored.upgrades, 1);
    assert.equal(ledgerB.totals().cashMinorUnits, before.cashMinorUnits);
    assert.equal(companyB.read(700).fleet.purchasedTaxis, 1);
    assert.equal(fleetB.counts().taxis, 21);
  } finally {
    companyB.dispose();
    ledgerB.dispose();
    fleetB.dispose();
  }
});

test('269 restore refuses a ledger that was not restored and changes nothing', () => {
  const fleetA = createFleet('test:company:evolution:fleet:restore-guard'),
    ledgerA = createCompanyLedger({ namespace: 'test:company:restore-guard' }),
    companyA = createEvolution(ledgerA, fleetA, 'test:company:evolution:restore-guard');
  let snapshot: CompanyEvolutionSnapshot | null = null;
  try {
    creditProfit(ledgerA, 12);
    companyA.purchase(COMPANY_VEHICLE_OFFERS[0]!.offerId, 500);
    snapshot = companyA.snapshot(600);
  } finally {
    companyA.dispose();
    ledgerA.dispose();
    fleetA.dispose();
  }

  const fleetB = createFleet('test:company:evolution:fleet:restore-guard'),
    ledgerB = createCompanyLedger({ namespace: 'test:company:restore-guard' }),
    companyB = createEvolution(ledgerB, fleetB, 'test:company:evolution:restore-guard');
  try {
    assert.throws(() => companyB.restore(snapshot));
    assert.equal(fleetB.counts().taxis, 20);
    assert.equal(ledgerB.totals().investmentMinorUnits, 0);
    assert.equal(companyB.read(0).counters.purchases, 0);
  } finally {
    companyB.dispose();
    ledgerB.dispose();
    fleetB.dispose();
  }
});

test('269 purchases and upgrades leave XP and the driving style untouched', () => {
  const fleet = createFleet(),
    ledger = createCompanyLedger({ namespace: 'test:company:xp-separation' }),
    evolution = createEvolution(ledger, fleet),
    player = createPlayerProgress({ playerId: 'player:269:separation' }),
    style = createCityStyleProfile('profile:269', 'profile:269:v1');
  try {
    creditProfit(ledger, 12);
    const xpBefore = player.read(),
      styleBefore = JSON.stringify(style);
    assert.equal(evolution.purchase(COMPANY_VEHICLE_OFFERS[0]!.offerId, 500).status, 'ACCEPTED');
    assert.equal(
      evolution.upgrade(
        COMPANY_UPGRADES.find((entry) => entry.upgradeId === 'upgrade-service-contract')!.upgradeId,
        600,
      ).status,
      'ACCEPTED',
    );
    assert.deepEqual(player.read(), xpBefore);
    assert.equal(JSON.stringify(style), styleBefore);
    const read = evolution.read(700);
    assert.equal(read.counters.xpWrites, 0);
    assert.equal(read.counters.profileWrites, 0);
    assert.equal(read.counters.styleOverrides, 0);
    assert.equal(read.companyLevel.xpLevelUsed, false);
    assert.equal(read.historyScans, 0);
  } finally {
    evolution.dispose();
    ledger.dispose();
    fleet.dispose();
  }
});

test('269 live port reads the authoritative finance tick and exposes the same journal', () => {
  const fleet = createFleet(),
    ledger = createCompanyLedger({ namespace: 'test:company:live-evolution' }),
    live = createLiveCompanyEvolution({
      finance: {
        ledger,
        read: () => ledger.read(120),
      },
      fleet,
      namespace: 'test:company:live-evolution',
    });
  try {
    assert.equal(live.version, '269-live-company-evolution-v1');
    const outcome = live.purchase(COMPANY_VEHICLE_OFFERS[0]!.offerId);
    assert.equal(outcome.status, 'ACCEPTED');
    assert.equal(outcome.purchase?.tick, 120);
    const read = live.read();
    assert.equal(read.version, COMPANY_EVOLUTION_VERSION);
    assert.equal(read.fleet.purchasedTaxis, 1);
    assert.equal(read.fleet.purchased[0]?.simulated, null);
    assert.equal(live.snapshot().tick, 120);
    assert.equal(live.stats().tick, 120);
    assert.equal(live.stats().xpWrites, 0);
  } finally {
    live.dispose();
    ledger.dispose();
    fleet.dispose();
  }
});
