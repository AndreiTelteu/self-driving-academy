import {
  COMPANY_EVOLUTION_VERSION,
  COMPANY_LEDGER_VERSION,
  COMPANY_LEVEL_TABLE_VERSION,
  COMPANY_LEVEL_THRESHOLDS,
  COMPANY_UPGRADES,
  COMPANY_UPGRADE_CATALOG_VERSION,
  COMPANY_VEHICLE_CATALOG_VERSION,
  COMPANY_VEHICLE_OFFERS,
  DEFAULT_COMPANY_COST_SCHEDULE,
  ECONOMY_CLOCK,
  LIVE_COMPANY_EVOLUTION_VERSION,
  companyLevelFor,
  createCompanyEvolution,
  createCompanyLedger,
  createLiveCompanyEvolution,
  ticksPerMonth,
  type CompanyEvolution,
  type CompanyLedger,
} from '../../src/economy';
import { createFleetRegistry, type FleetRegistry } from '../../src/fleet';
import { createPlayerProgress } from '../../src/missions';
import { createCityStyleProfile } from '../../src/app';

export const COMPANY_EVOLUTION_REPORT_VERSION = '269-company-evolution-report-v1' as const;

const MONTH_TICKS = ticksPerMonth(ECONOMY_CLOCK);
const NEXT_MONTH = MONTH_TICKS;
const FLEET_NAMESPACE = 'report:company:evolution:fleet';
const OFFER = COMPANY_VEHICLE_OFFERS[0]!;
const UPGRADE = COMPANY_UPGRADES.find((entry) => entry.upgradeId === 'upgrade-service-contract')!;

export interface CompanyEvolutionReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | string[] | null;
  readonly actual: string | number | boolean | string[] | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CompanyEvolutionReport {
  readonly version: typeof COMPANY_EVOLUTION_REPORT_VERSION;
  readonly contract: typeof COMPANY_EVOLUTION_VERSION;
  readonly ledgerContract: typeof COMPANY_LEDGER_VERSION;
  readonly liveContract: typeof LIVE_COMPANY_EVOLUTION_VERSION;
  readonly levelTable: Readonly<{
    version: typeof COMPANY_LEVEL_TABLE_VERSION;
    thresholds: readonly Readonly<{ level: number; minimumReinvestedProfitMinorUnits: number }>[];
    monotonic: boolean;
  }>;
  readonly catalogs: Readonly<{
    vehicles: typeof COMPANY_VEHICLE_CATALOG_VERSION;
    upgrades: typeof COMPANY_UPGRADE_CATALOG_VERSION;
    vehicleOffers: number;
    upgradeDefinitions: number;
    boundedEffects: boolean;
  }>;
  readonly purchase: Readonly<{
    offerId: string;
    costMinorUnits: number;
    cashBeforeMinorUnits: number;
    cashAfterMinorUnits: number;
    fleetTaxisBefore: number;
    fleetTaxisAfter: number;
    vehicleId: string;
    slot: number;
    classId: string;
    simulated: boolean | null;
    levelBefore: number;
    levelAfter: number;
    investmentMinorUnits: number;
  }>;
  readonly insufficientCash: Readonly<{
    offerId: string;
    cashMinorUnits: number;
    costMinorUnits: number;
    reason: string | null;
    fleetTaxis: number;
    investments: number;
    changed: boolean;
  }>;
  readonly levelRequired: Readonly<{
    offerId: string;
    requiredLevel: number;
    currentLevel: number;
    reason: string | null;
    fleetTaxis: number;
    investments: number;
    changed: boolean;
  }>;
  readonly duplicates: Readonly<{
    purchaseReason: string | null;
    upgradeReason: string | null;
    investmentsBefore: number;
    investmentsAfter: number;
    fleetTaxis: number;
  }>;
  readonly upgrade: Readonly<{
    upgradeId: string;
    costMinorUnits: number;
    basisPoints: number;
    effectiveFromTick: number;
    effectiveFromPeriodId: string;
    currentPeriodServiceMinorUnits: number;
    nextPeriodServiceMinorUnits: number;
    nextPeriodBaseMinorUnits: number;
    nextPeriodAppliedBasisPoints: number;
    modifierId: string;
    modifierVersion: string;
    historyEntryUnchanged: boolean;
    pendingBefore: boolean;
    effectiveAfter: boolean;
  }>;
  readonly cash: Readonly<{
    initialCashMinorUnits: number;
    revenueMinorUnits: number;
    profitMinorUnits: number;
    cashBeforeInvestmentMinorUnits: number;
    investmentMinorUnits: number;
    vehicleInvestmentMinorUnits: number;
    upgradeInvestmentMinorUnits: number;
    cashMinorUnits: number;
    uncoveredLossMinorUnits: number;
    formula: 'initialCash + profit - investments, clamped at zero';
  }>;
  readonly fleet: Readonly<{
    taxis: number;
    civilians: number;
    vehicles: number;
    purchasedTaxis: number;
    capacityTaxis: number;
    capacityRemaining: number;
    fleetValueMinorUnits: number;
    sameRegistry: boolean;
  }>;
  readonly reload: Readonly<{
    snapshotPurchases: number;
    snapshotUpgrades: number;
    restoredPurchases: number;
    restoredUpgrades: number;
    levelBefore: number;
    levelAfter: number;
    cashBefore: number;
    cashAfter: number;
    slotBefore: number;
    slotAfter: number;
    guardRefused: boolean;
  }>;
  readonly xp: Readonly<{
    balanceBefore: number;
    balanceAfter: number;
    levelBefore: number;
    levelAfter: number;
    entriesBefore: number;
    entriesAfter: number;
    same: boolean;
  }>;
  readonly style: Readonly<{
    profileId: string;
    versionId: string;
    checksum: string;
    same: boolean;
  }>;
  readonly boundary: Readonly<{
    xpWrites: 0;
    profileWrites: 0;
    styleOverrides: 0;
    economyWrites: 0;
    investmentWrites: number;
    historyScans: 0;
    purchaseSurface: boolean;
    upgradeSurface: boolean;
    secondFleet: boolean;
  }>;
  readonly checks: readonly CompanyEvolutionReportCheck[];
  readonly summary: Readonly<{
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: CompanyEvolutionReportCheck['expected'],
  actual: CompanyEvolutionReportCheck['actual'],
  detail: string,
): CompanyEvolutionReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function createFleet(): FleetRegistry {
  return createFleetRegistry({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-269-report',
    worldEpoch: 1,
    scenarioId: 'scenario-269-report',
    seed: 269,
    namespace: FLEET_NAMESPACE,
    taxiCount: 20,
    civilianCount: 20,
    profile: { profileId: 'v3-city-style', versionId: 'v3-city-style-v1' },
  });
}

function postRides(ledger: CompanyLedger, count: number, prefix: string): void {
  for (let index = 0; index < count; index += 1) {
    const outcome = ledger.postRide({
      rideId: `${prefix}-${index}`,
      requestId: `request:${prefix}-${index}`,
      taxiId: 'taxi-269-report',
      tick: 100 + index,
      terminalState: 'COMPLETED',
      passengerAboard: true,
      plannedDistanceMeters: 5_000,
      revenueMinorUnits: 1_000,
      revenueSettlementId: `settlement:${prefix}-${index}`,
    });
    if (outcome.status !== 'ACCEPTED') throw new Error(`Report ride ${index} was not accepted`);
  }
}

function evolution(
  ledger: CompanyLedger,
  fleet: FleetRegistry | null,
  namespace = 'report:company:evolution',
): CompanyEvolution {
  return createCompanyEvolution({
    ledger,
    ...(fleet === null ? {} : { fleet }),
    namespace,
  });
}

function mdCheck(entry: CompanyEvolutionReportCheck): string {
  return `| ${entry.name} | ${JSON.stringify(entry.expected)} | ${JSON.stringify(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`;
}

export function companyEvolutionReportMarkdown(report: CompanyEvolutionReport): string {
  const checks = report.checks.map(mdCheck).join('\n');
  return `# 269 — evoluția companiei

Raport determinist generat de \`npm run company:evolution\`.

Contract \`${report.contract}\` / \`${report.liveContract}\`; ledger \`${report.ledgerContract}\`.
Pragurile, costurile și efectele sunt propuneri de calibrare, nu valori economice reale.

## Nivel companie

Pragurile sunt cumulative pe profitul reinvestit, separate de XP. Nivelul crește numai după o
investiție reală și nu scade după o pierdere.

| Nivel | Prag reinvestit (SDA) |
| ---: | ---: |
${report.levelTable.thresholds.map((entry) => `| ${entry.level} | ${entry.minimumReinvestedProfitMinorUnits} |`).join('\n')}

## Achiziție reală

| Metric | Value |
| --- | ---: |
| Ofertă | \`${report.purchase.offerId}\` |
| Cost | ${report.purchase.costMinorUnits} SDA |
| Cash înainte | ${report.purchase.cashBeforeMinorUnits} SDA |
| Cash după | ${report.purchase.cashAfterMinorUnits} SDA |
| Taxiuri înainte/după | ${report.purchase.fleetTaxisBefore}/${report.purchase.fleetTaxisAfter} |
| Vehicul | \`${report.purchase.vehicleId}\` slot ${report.purchase.slot} (${report.purchase.classId}) |
| Simulat live | ${report.purchase.simulated} |
| Nivel înainte/după | ${report.purchase.levelBefore}/${report.purchase.levelAfter} |

## Upgrade cu efect în perioada următoare

\`${report.upgrade.upgradeId}\` costă ${report.upgrade.costMinorUnits} SDA și aplică
${report.upgrade.basisPoints}/10000 din costul \`SERVICE\` de la tick-ul
${report.upgrade.effectiveFromTick} (${report.upgrade.effectiveFromPeriodId}). Costul serviciului:
${report.upgrade.currentPeriodServiceMinorUnits} SDA în perioada curentă, apoi
${report.upgrade.nextPeriodServiceMinorUnits} SDA din baza de
${report.upgrade.nextPeriodBaseMinorUnits} SDA. Intrarea istorică rămâne neschimbată:
${report.upgrade.historyEntryUnchanged}. Efectul este vizibil: ${report.upgrade.effectiveAfter}.

## Refuzuri închise

- Cash insuficient: \`${report.insufficientCash.reason}\`, cash ${report.insufficientCash.cashMinorUnits}, cost ${report.insufficientCash.costMinorUnits}, schimbare ${report.insufficientCash.changed}.
- Nivel insuficient: \`${report.levelRequired.reason}\`, nivel ${report.levelRequired.currentLevel} < ${report.levelRequired.requiredLevel}, schimbare ${report.levelRequired.changed}.
- Duplicate: achiziție \`${report.duplicates.purchaseReason}\`, upgrade \`${report.duplicates.upgradeReason}\`.

## Cash și flotă

- Cash inițial: ${report.cash.initialCashMinorUnits} SDA
- Revenue: ${report.cash.revenueMinorUnits} SDA
- Profit: ${report.cash.profitMinorUnits} SDA
- Cash înainte de investiții: ${report.cash.cashBeforeInvestmentMinorUnits} SDA
- Investiții: ${report.cash.investmentMinorUnits} SDA (vehicule ${report.cash.vehicleInvestmentMinorUnits}, upgrade-uri ${report.cash.upgradeInvestmentMinorUnits})
- Cash: ${report.cash.cashMinorUnits} SDA (${report.cash.formula})
- Pierdere neacoperită: ${report.cash.uncoveredLossMinorUnits} SDA
- Flotă: ${report.fleet.taxis} taxiuri + ${report.fleet.civilians} civili = ${report.fleet.vehicles}; capacitate taxi ${report.fleet.capacityTaxis}, rămasă ${report.fleet.capacityRemaining}; valoare ${report.fleet.fleetValueMinorUnits} SDA.
- Același registry, fără o a doua flotă: ${report.fleet.sameRegistry}.

## Reload și import

Snapshot: ${report.reload.snapshotPurchases} achiziții, ${report.reload.snapshotUpgrades} upgrade-uri.
Restore: ${report.reload.restoredPurchases}/${report.reload.restoredUpgrades}; nivel ${report.reload.levelBefore}→${report.reload.levelAfter}; cash ${report.reload.cashBefore}→${report.reload.cashAfter}; slot ${report.reload.slotBefore}→${report.reload.slotAfter}. Un ledger ne-restaurat este refuzat: ${report.reload.guardRefused}. Persistarea fișierului după reload rămâne 278.

## Separarea de XP și stil

- XP: sold ${report.xp.balanceBefore}/${report.xp.balanceAfter}, nivel ${report.xp.levelBefore}/${report.xp.levelAfter}, intrări ${report.xp.entriesBefore}/${report.xp.entriesAfter}; identic ${report.xp.same}.
- Stil: \`${report.style.profileId}\`/\`${report.style.versionId}\`, checksum \`${report.style.checksum}\`, identic ${report.style.same}.
- Contoare: XP ${report.boundary.xpWrites}, profil ${report.boundary.profileWrites}, override stil ${report.boundary.styleOverrides}, 209 ${report.boundary.economyWrites}, investiții ${report.boundary.investmentWrites}, historyScans ${report.boundary.historyScans}.
- Suprafață purchase/upgrade: ${report.boundary.purchaseSurface}/${report.boundary.upgradeSurface}; a doua flotă: ${report.boundary.secondFleet}.

## Verificări

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checks}

## Rezumat

${report.summary.passed}/${report.summary.checks} verificări au trecut; overall ${report.summary.pass ? 'PASS' : 'FAIL'}.
`;
}

export function runCompanyEvolutionReport(): CompanyEvolutionReport {
  const fleet = createFleet(),
    ledger = createCompanyLedger({ namespace: 'report:company:evolution' }),
    company = evolution(ledger, fleet, 'report:company:evolution'),
    player = createPlayerProgress({ playerId: 'player:269:report' }),
    style = createCityStyleProfile('profile:269:report', 'profile:269:report:v1');
  try {
    const xpBefore = player.read(),
      styleBefore = JSON.stringify(style),
      initial = company.read(0);

    postRides(ledger, 12, 'ride-269-report-profit');
    const beforePurchase = company.read(300),
      levelBefore = beforePurchase.companyLevel.level;
    const purchaseOutcome = company.purchase(OFFER.offerId, 350);
    if (purchaseOutcome.status !== 'ACCEPTED' || purchaseOutcome.purchase === null)
      throw new Error('The report purchase was not accepted');
    const purchase = purchaseOutcome.purchase,
      afterPurchase = purchaseOutcome.read;

    const currentPeriodRide = ledger.postRide({
      rideId: 'ride-269-report-current-period',
      requestId: 'request:ride-269-report-current-period',
      taxiId: 'taxi-269-report',
      tick: 400,
      terminalState: 'COMPLETED',
      passengerAboard: true,
      plannedDistanceMeters: 5_000,
      revenueMinorUnits: 1_000,
      revenueSettlementId: 'settlement:ride-269-report-current-period',
    });
    if (currentPeriodRide.status !== 'ACCEPTED' || currentPeriodRide.entry === null)
      throw new Error('The report current-period ride was not accepted');
    const currentService = currentPeriodRide.entry.lines.find(
      (line) => line.category === 'SERVICE',
    )!.amountMinorUnits;

    const upgradeOutcome = company.upgrade(UPGRADE.upgradeId, 450);
    if (upgradeOutcome.status !== 'ACCEPTED' || upgradeOutcome.upgrade === null)
      throw new Error('The report upgrade was not accepted');
    const ownership = upgradeOutcome.upgrade,
      snapshot = company.snapshot(460),
      snapshotRead = company.read(460);

    const nextRide = ledger.postRide({
      rideId: 'ride-269-report-next-period',
      requestId: 'request:ride-269-report-next-period',
      taxiId: 'taxi-269-report',
      tick: NEXT_MONTH,
      terminalState: 'COMPLETED',
      passengerAboard: true,
      plannedDistanceMeters: 5_000,
      revenueMinorUnits: 1_000,
      revenueSettlementId: 'settlement:ride-269-report-next-period',
    });
    if (nextRide.status !== 'ACCEPTED' || nextRide.entry === null)
      throw new Error('The report next-period ride was not accepted');
    const nextServiceLine = nextRide.entry.lines.find((line) => line.category === 'SERVICE')!,
      serviceAfter = nextServiceLine.amountMinorUnits,
      historyEntryUnchanged =
        currentPeriodRide.entry.grossCostMinorUnits ===
        ledger.entry('ride-269-report-current-period')!.grossCostMinorUnits;

    const duplicatePurchase = company.purchase(OFFER.offerId, 500),
      duplicateUpgrade = company.upgrade(UPGRADE.upgradeId, 500),
      beforeDuplicates = ledger.totals();
    const finalRead = company.read(NEXT_MONTH + 1),
      totals = ledger.totals(),
      live = createLiveCompanyEvolution({
        finance: { ledger, read: () => ledger.read(600) },
        fleet,
        namespace: 'report:company:evolution:live',
      });
    const liveRead = live.read();
    live.dispose();

    // A refused purchase with insufficient cash changes nothing.
    const poorFleet = createFleet(),
      poorLedger = createCompanyLedger({
        namespace: 'report:company:evolution:poor',
        schedule: { ...DEFAULT_COMPANY_COST_SCHEDULE, initialCashMinorUnits: 10_000 },
      }),
      poorCompany = evolution(poorLedger, poorFleet, 'report:company:evolution:poor');
    const poorBefore = poorCompany.read(100),
      poorOutcome = poorCompany.purchase(OFFER.offerId, 100),
      poorAfter = poorCompany.read(100);
    const poorUnchanged =
      JSON.stringify(poorBefore.cash) === JSON.stringify(poorAfter.cash) &&
      poorFleet.counts().taxis === 20 &&
      poorLedger.totals().investmentMinorUnits === 0;
    poorCompany.dispose();
    poorLedger.dispose();
    poorFleet.dispose();

    // A level-locked offer is refused without a fleet change.
    const lockedFleet = createFleet(),
      lockedLedger = createCompanyLedger({ namespace: 'report:company:evolution:locked' }),
      lockedCompany = evolution(lockedLedger, lockedFleet, 'report:company:evolution:locked');
    const lockedOffer = COMPANY_VEHICLE_OFFERS.find((entry) => entry.requiredLevel === 2)!,
      lockedOutcome = lockedCompany.purchase(lockedOffer.offerId, 100),
      lockedLevel = lockedCompany.read(100).companyLevel.level,
      lockedUnchanged =
        lockedFleet.counts().taxis === 20 && lockedLedger.totals().investmentMinorUnits === 0;
    lockedCompany.dispose();
    lockedLedger.dispose();
    lockedFleet.dispose();

    // Snapshot + restore into the same 268 operating state and a fresh real fleet.
    const reloadFleet = createFleet(),
      reloadLedger = createCompanyLedger({ namespace: 'report:company:evolution' }),
      reloadCompany = evolution(reloadLedger, reloadFleet, 'report:company:evolution');
    postRides(reloadLedger, 12, 'ride-269-report-profit');
    const reloadCurrent = reloadLedger.postRide({
      rideId: 'ride-269-report-current-period',
      requestId: 'request:ride-269-report-current-period',
      taxiId: 'taxi-269-report',
      tick: 400,
      terminalState: 'COMPLETED',
      passengerAboard: true,
      plannedDistanceMeters: 5_000,
      revenueMinorUnits: 1_000,
      revenueSettlementId: 'settlement:ride-269-report-current-period',
    });
    if (reloadCurrent.status !== 'ACCEPTED')
      throw new Error('The report reload ride was not accepted');
    const restored = reloadCompany.restore(snapshot),
      reloadRead = reloadCompany.read(600),
      restoredPurchase = reloadRead.offers.find((view) => view.state === 'OWNED')!.purchase!,
      reloadMatches =
        reloadRead.companyLevel.level === snapshotRead.companyLevel.level &&
        reloadRead.cash.cashMinorUnits === snapshotRead.cash.cashMinorUnits &&
        reloadRead.upgrades.find((view) => view.state === 'OWNED')?.ownership?.effectiveFromTick ===
          ownership.effectiveFromTick;
    reloadCompany.dispose();
    reloadLedger.dispose();
    reloadFleet.dispose();

    const guardFleet = createFleet(),
      guardLedger = createCompanyLedger({ namespace: 'report:company:evolution' }),
      guardCompany = evolution(guardLedger, guardFleet, 'report:company:evolution');
    let guardRefused = false;
    try {
      guardCompany.restore(snapshot);
    } catch {
      guardRefused = true;
    }
    guardCompany.dispose();
    guardLedger.dispose();
    guardFleet.dispose();

    const xpAfter = player.read(),
      styleAfter = JSON.stringify(style),
      checks: CompanyEvolutionReportCheck[] = [
        check('contract', COMPANY_EVOLUTION_VERSION, company.version, 'the evolution contract'),
        check('ledger-contract', COMPANY_LEDGER_VERSION, ledger.version, 'the same 268 ledger'),
        check(
          'level-table',
          COMPANY_LEVEL_TABLE_VERSION,
          COMPANY_LEVEL_THRESHOLDS.length > 0 ? COMPANY_LEVEL_TABLE_VERSION : null,
          'the versioned level table',
        ),
        check(
          'level-monotonic',
          true,
          COMPANY_LEVEL_THRESHOLDS.every(
            (entry, index, list) =>
              index === 0 ||
              entry.minimumReinvestedProfitMinorUnits >
                list[index - 1]!.minimumReinvestedProfitMinorUnits,
          ),
          'strictly increasing thresholds',
        ),
        check('level-1-zero', 1, companyLevelFor(0), 'level 1 at zero reinvested profit'),
        check('level-2-5000', 2, companyLevelFor(5_000), 'level 2 at 5 000 SDA'),
        check('level-3-15000', 3, companyLevelFor(15_000), 'level 3 at 15 000 SDA'),
        check('level-not-xp', false, initial.companyLevel.xpLevelUsed, 'XP is never an input'),
        check('initial-level', 1, initial.companyLevel.level, 'a new company is level 1'),
        check(
          'profit-not-reinvested',
          1,
          levelBefore,
          '12 rides of profit alone do not raise the level before an investment',
        ),
        check('catalog-offers', 6, COMPANY_VEHICLE_OFFERS.length, 'six one-time vehicle offers'),
        check('catalog-upgrades', 5, COMPANY_UPGRADES.length, 'five versioned upgrades'),
        check(
          'effects-bounded',
          true,
          COMPANY_UPGRADES.every(
            (entry) => entry.effect.basisPoints >= 5_000 && entry.effect.basisPoints <= 10_000,
          ),
          'no upgrade raises a cost or discounts more than 50%',
        ),
        check('purchase-accepted', 'ACCEPTED', purchaseOutcome.status, `bought ${OFFER.offerId}`),
        check('purchase-cost', OFFER.costMinorUnits, purchase.costMinorUnits, 'declared cost'),
        check(
          'purchase-cash',
          beforePurchase.cash.cashMinorUnits - OFFER.costMinorUnits,
          afterPurchase.cash.cashMinorUnits,
          'cash is reduced by exactly the cost',
        ),
        check(
          'purchase-fleet',
          beforePurchase.fleet.taxis + 1,
          afterPurchase.fleet.taxis,
          'the same registry grows by one taxi',
        ),
        check('purchase-slot', 21, purchase.slot, 'the next real 057 slot is respected'),
        check('purchase-class', OFFER.classId, purchase.classId, 'the offer class is real'),
        check(
          'purchase-vehicle-real',
          true,
          fleet.get(purchase.vehicleId)?.vehicleId === purchase.vehicleId,
          'the returned vehicle exists in the live registry',
        ),
        check(
          'purchase-level',
          2,
          afterPurchase.companyLevel.level,
          'reinvested profit raises level',
        ),
        check(
          'purchase-investment',
          OFFER.costMinorUnits,
          afterPurchase.cash.investmentMinorUnits,
          'the purchase is one investment entry',
        ),
        check(
          'purchase-live-simulated',
          null,
          liveRead.fleet.purchased[0]?.simulated ?? null,
          'the report registry port has no actor probe; the 058 growth test and browser probe prove the actor',
        ),
        check(
          'insufficient-cash',
          'INSUFFICIENT_CASH',
          poorOutcome.reason,
          'a purchase beyond cash is refused',
        ),
        check('insufficient-unchanged', true, poorUnchanged, 'cash, fleet and investment journal'),
        check(
          'level-required',
          'LEVEL_REQUIRED',
          lockedOutcome.reason,
          `level ${lockedLevel} is below ${lockedOffer.requiredLevel}`,
        ),
        check('level-required-unchanged', true, lockedUnchanged, 'no fleet or cash change'),
        check(
          'duplicate-purchase',
          'ALREADY_OWNED',
          duplicatePurchase.reason,
          'the same offer cannot be bought twice',
        ),
        check(
          'duplicate-upgrade',
          'ALREADY_OWNED',
          duplicateUpgrade.reason,
          'the same upgrade cannot be bought twice',
        ),
        check(
          'duplicates-stable',
          beforeDuplicates.investments,
          ledger.totals().investments,
          'duplicates do not add investment entries',
        ),
        check('upgrade-accepted', 'ACCEPTED', upgradeOutcome.status, `bought ${UPGRADE.upgradeId}`),
        check('upgrade-cost', UPGRADE.costMinorUnits, ownership.costMinorUnits, 'declared cost'),
        check('upgrade-basis-points', 5_000, ownership.basisPoints, 'the declared bounded effect'),
        check(
          'upgrade-next-period',
          NEXT_MONTH,
          ownership.effectiveFromTick,
          'the effect starts at the next simulated month',
        ),
        check('upgrade-period', 'm0001', ownership.effectiveFromPeriodId, 'next period identity'),
        check('service-before', 40, currentService, 'the current period keeps the base price'),
        check('service-after', 20, serviceAfter, 'the next period applies the declared effect'),
        check(
          'service-base',
          40,
          nextServiceLine.baseAmountMinorUnits,
          'the base amount stays visible',
        ),
        check(
          'service-basis-points',
          5_000,
          nextServiceLine.appliedBasisPoints,
          'the applied basis points are recorded',
        ),
        check(
          'history-unchanged',
          true,
          historyEntryUnchanged,
          'the earlier ride entry is never rewritten',
        ),
        check(
          'pending-before',
          true,
          upgradeOutcome.read.pendingEffects.some((entry) => entry.category === 'SERVICE'),
          'the next-period effect is visible before it applies',
        ),
        check(
          'effective-after',
          true,
          finalRead.upgrades.find((view) => view.upgrade.upgradeId === UPGRADE.upgradeId)!
            .effective,
          'the effect is visible in the next period read model',
        ),
        check(
          'cash-before-investment',
          finalRead.cash.initialCashMinorUnits + finalRead.cash.profitMinorUnits,
          finalRead.cash.cashBeforeInvestmentMinorUnits,
          'operating cash uses the unchanged 268 formula',
        ),
        check(
          'cash-formula',
          Math.max(
            0,
            finalRead.cash.initialCashMinorUnits +
              finalRead.cash.profitMinorUnits -
              finalRead.cash.investmentMinorUnits,
          ),
          finalRead.cash.cashMinorUnits,
          'cash = initial + profit - investments, clamped at zero',
        ),
        check(
          'investment-split',
          OFFER.costMinorUnits + UPGRADE.costMinorUnits,
          totals.vehiclePurchaseMinorUnits + totals.upgradeInvestmentMinorUnits,
          'vehicle and upgrade investment are separate',
        ),
        check(
          'fleet-value',
          totals.vehiclePurchaseMinorUnits,
          finalRead.fleet.fleetValueMinorUnits,
          'fleet value is the real purchase value',
        ),
        check(
          'same-registry',
          true,
          company.fleet === fleet,
          'the evolution uses the one live 057 registry',
        ),
        check(
          'reload-purchases',
          snapshot.purchases.length,
          restored.purchases,
          'the purchase journal is restored',
        ),
        check(
          'reload-upgrades',
          snapshot.upgrades.length,
          restored.upgrades,
          'the upgrade journal is restored',
        ),
        check(
          'reload-state',
          true,
          reloadMatches,
          'level, cash and next-period effect survive restore',
        ),
        check(
          'reload-slot',
          purchase.slot,
          restoredPurchase.slot,
          'the real fleet slot is restored',
        ),
        check(
          'reload-guard',
          true,
          guardRefused,
          'a ledger restored without its 268 state is refused',
        ),
        check('xp-balance', xpBefore.xpBalanceMicroXp, xpAfter.xpBalanceMicroXp, 'XP is untouched'),
        check('xp-level', xpBefore.level, xpAfter.level, 'the player level is untouched'),
        check(
          'xp-entries',
          xpBefore.entries.length,
          xpAfter.entries.length,
          'the XP ledger is untouched',
        ),
        check(
          'style-identity',
          true,
          JSON.stringify(style) === styleAfter,
          'the style is untouched',
        ),
        check('boundary-xp', 0, finalRead.counters.xpWrites, 'no XP write surface'),
        check('boundary-profile', 0, finalRead.counters.profileWrites, 'no profile write surface'),
        check(
          'boundary-style',
          0,
          finalRead.counters.styleOverrides,
          'no hidden driving-style override',
        ),
        check('boundary-economy', 0, finalRead.counters.economyWrites, 'no 209 write surface'),
        check(
          'boundary-investment',
          2,
          finalRead.counters.investmentWrites,
          'both outflows are in the same ledger',
        ),
        check('boundary-history', 0, finalRead.historyScans, 'reads use incremental totals'),
        check(
          'purchase-surface',
          true,
          Object.hasOwn(company, 'purchase'),
          '269 adds the purchase command',
        ),
        check(
          'upgrade-surface',
          true,
          Object.hasOwn(company, 'upgrade'),
          '269 adds the upgrade command',
        ),
        check('no-second-fleet', false, company.fleet !== fleet, 'no second fleet is created'),
        check(
          'live-contract',
          LIVE_COMPANY_EVOLUTION_VERSION,
          live.version,
          'the live evolution port is exposed',
        ),
      ],
      passed = checks.filter((entry) => entry.pass).length;

    return Object.freeze({
      version: COMPANY_EVOLUTION_REPORT_VERSION,
      contract: COMPANY_EVOLUTION_VERSION,
      ledgerContract: COMPANY_LEDGER_VERSION,
      liveContract: LIVE_COMPANY_EVOLUTION_VERSION,
      levelTable: Object.freeze({
        version: COMPANY_LEVEL_TABLE_VERSION,
        thresholds: Object.freeze(
          COMPANY_LEVEL_THRESHOLDS.map((entry) => Object.freeze({ ...entry })),
        ),
        monotonic: COMPANY_LEVEL_THRESHOLDS.every(
          (entry, index, list) =>
            index === 0 ||
            entry.minimumReinvestedProfitMinorUnits >
              list[index - 1]!.minimumReinvestedProfitMinorUnits,
        ),
      }),
      catalogs: Object.freeze({
        vehicles: COMPANY_VEHICLE_CATALOG_VERSION,
        upgrades: COMPANY_UPGRADE_CATALOG_VERSION,
        vehicleOffers: COMPANY_VEHICLE_OFFERS.length,
        upgradeDefinitions: COMPANY_UPGRADES.length,
        boundedEffects: COMPANY_UPGRADES.every(
          (entry) => entry.effect.basisPoints >= 5_000 && entry.effect.basisPoints <= 10_000,
        ),
      }),
      purchase: Object.freeze({
        offerId: OFFER.offerId,
        costMinorUnits: OFFER.costMinorUnits,
        cashBeforeMinorUnits: beforePurchase.cash.cashMinorUnits,
        cashAfterMinorUnits: afterPurchase.cash.cashMinorUnits,
        fleetTaxisBefore: beforePurchase.fleet.taxis,
        fleetTaxisAfter: afterPurchase.fleet.taxis,
        vehicleId: purchase.vehicleId,
        slot: purchase.slot,
        classId: purchase.classId,
        simulated: liveRead.fleet.purchased[0]?.simulated ?? null,
        levelBefore: levelBefore,
        levelAfter: afterPurchase.companyLevel.level,
        investmentMinorUnits: afterPurchase.cash.investmentMinorUnits,
      }),
      insufficientCash: Object.freeze({
        offerId: OFFER.offerId,
        cashMinorUnits: poorBefore.cash.cashMinorUnits,
        costMinorUnits: OFFER.costMinorUnits,
        reason: poorOutcome.reason,
        fleetTaxis: poorAfter.fleet.taxis,
        investments: poorLedger.totals().investments,
        changed: !poorUnchanged,
      }),
      levelRequired: Object.freeze({
        offerId: lockedOffer.offerId,
        requiredLevel: lockedOffer.requiredLevel,
        currentLevel: lockedLevel,
        reason: lockedOutcome.reason,
        fleetTaxis: lockedFleet.counts().taxis,
        investments: lockedLedger.totals().investments,
        changed: !lockedUnchanged,
      }),
      duplicates: Object.freeze({
        purchaseReason: duplicatePurchase.reason,
        upgradeReason: duplicateUpgrade.reason,
        investmentsBefore: beforeDuplicates.investments,
        investmentsAfter: ledger.totals().investments,
        fleetTaxis: fleet.counts().taxis,
      }),
      upgrade: Object.freeze({
        upgradeId: UPGRADE.upgradeId,
        costMinorUnits: UPGRADE.costMinorUnits,
        basisPoints: ownership.basisPoints,
        effectiveFromTick: ownership.effectiveFromTick,
        effectiveFromPeriodId: ownership.effectiveFromPeriodId,
        currentPeriodServiceMinorUnits: currentService,
        nextPeriodServiceMinorUnits: serviceAfter,
        nextPeriodBaseMinorUnits: nextServiceLine.baseAmountMinorUnits,
        nextPeriodAppliedBasisPoints: nextServiceLine.appliedBasisPoints,
        modifierId: ownership.modifierId,
        modifierVersion: UPGRADE.version,
        historyEntryUnchanged,
        pendingBefore: upgradeOutcome.read.pendingEffects.some(
          (entry) => entry.category === 'SERVICE',
        ),
        effectiveAfter: finalRead.upgrades.find(
          (view) => view.upgrade.upgradeId === UPGRADE.upgradeId,
        )!.effective,
      }),
      cash: Object.freeze({
        initialCashMinorUnits: totals.initialCashMinorUnits,
        revenueMinorUnits: totals.revenueMinorUnits,
        profitMinorUnits: totals.profitMinorUnits,
        cashBeforeInvestmentMinorUnits: totals.cashBeforeInvestmentMinorUnits,
        investmentMinorUnits: totals.investmentMinorUnits,
        vehicleInvestmentMinorUnits: totals.vehiclePurchaseMinorUnits,
        upgradeInvestmentMinorUnits: totals.upgradeInvestmentMinorUnits,
        cashMinorUnits: totals.cashMinorUnits,
        uncoveredLossMinorUnits: totals.uncoveredLossMinorUnits,
        formula: 'initialCash + profit - investments, clamped at zero' as const,
      }),
      fleet: Object.freeze({
        taxis: finalRead.fleet.taxis,
        civilians: finalRead.fleet.civilians,
        vehicles: finalRead.fleet.vehicles,
        purchasedTaxis: finalRead.fleet.purchasedTaxis,
        capacityTaxis: finalRead.fleet.capacityTaxis,
        capacityRemaining: finalRead.fleet.capacityRemaining,
        fleetValueMinorUnits: finalRead.fleet.fleetValueMinorUnits,
        sameRegistry: company.fleet === fleet,
      }),
      reload: Object.freeze({
        snapshotPurchases: snapshot.purchases.length,
        snapshotUpgrades: snapshot.upgrades.length,
        restoredPurchases: restored.purchases,
        restoredUpgrades: restored.upgrades,
        levelBefore: snapshotRead.companyLevel.level,
        levelAfter: reloadRead.companyLevel.level,
        cashBefore: snapshotRead.cash.cashMinorUnits,
        cashAfter: reloadRead.cash.cashMinorUnits,
        slotBefore: purchase.slot,
        slotAfter: restoredPurchase.slot,
        guardRefused,
      }),
      xp: Object.freeze({
        balanceBefore: xpBefore.xpBalanceMicroXp,
        balanceAfter: xpAfter.xpBalanceMicroXp,
        levelBefore: xpBefore.level,
        levelAfter: xpAfter.level,
        entriesBefore: xpBefore.entries.length,
        entriesAfter: xpAfter.entries.length,
        same:
          xpBefore.xpBalanceMicroXp === xpAfter.xpBalanceMicroXp &&
          xpBefore.level === xpAfter.level &&
          xpBefore.entries.length === xpAfter.entries.length,
      }),
      style: Object.freeze({
        profileId: style.profileId,
        versionId: style.versionId,
        checksum: style.checksum,
        same: styleBefore === styleAfter,
      }),
      boundary: Object.freeze({
        xpWrites: 0 as const,
        profileWrites: 0 as const,
        styleOverrides: 0 as const,
        economyWrites: 0 as const,
        investmentWrites: finalRead.counters.investmentWrites,
        historyScans: 0 as const,
        purchaseSurface: Object.hasOwn(company, 'purchase'),
        upgradeSurface: Object.hasOwn(company, 'upgrade'),
        secondFleet: company.fleet !== fleet,
      }),
      checks: Object.freeze(checks),
      summary: Object.freeze({
        checks: checks.length,
        passed,
        pass: passed === checks.length,
      }),
    });
  } finally {
    company.dispose();
    ledger.dispose();
    fleet.dispose();
  }
}
