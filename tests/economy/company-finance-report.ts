import {
  COMPANY_LEDGER_VERSION,
  DEFAULT_COMPANY_COST_SCHEDULE,
  ECONOMY_CLOCK,
  LIVE_COMPANY_FINANCE_VERSION,
  createCompanyLedger,
  createLiveCompanyFinance,
  ticksPerMonth,
  type LiveCompanyStepResult,
} from '../../src/economy';
import { createPlayerProgress } from '../../src/missions';
import { createLiveEconomyFixture, type LiveEconomyFixture } from './live-economy-fixture';

export const COMPANY_FINANCE_REPORT_VERSION = '268-company-finance-report-v1' as const;

const MONTH_TICKS = ticksPerMonth(ECONOMY_CLOCK);
const EMPTY_MONTH_TICK = MONTH_TICKS + 1;

export interface CompanyFinanceReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CompanyFinanceReport {
  readonly version: typeof COMPANY_FINANCE_REPORT_VERSION;
  readonly contract: typeof COMPANY_LEDGER_VERSION;
  readonly liveContract: typeof LIVE_COMPANY_FINANCE_VERSION;
  readonly schedule: Readonly<{
    version: string;
    currency: string;
    initialCashMinorUnits: number;
    energyPerKmMinorUnits: number;
    maintenancePerKmMinorUnits: number;
    incidentMinorUnits: number;
    servicePerRideMinorUnits: number;
    fixedMonthlyMinorUnits: number;
    insuranceMinorUnits: number;
    salariesMinorUnits: number;
    licensesMinorUnits: number;
  }>;
  readonly profitableRide: Readonly<{
    rideId: string;
    requestId: string;
    taxiId: string;
    terminalState: string;
    passengerAboard: boolean;
    plannedDistanceMeters: number;
    revenueMinorUnits: number;
    energyMinorUnits: number;
    maintenanceMinorUnits: number;
    incidentMinorUnits: number;
    serviceMinorUnits: number;
    grossCostMinorUnits: number;
    grossProfitMinorUnits: number;
    rating: number | null;
    reasons: readonly string[];
  }>;
  readonly lossRide: Readonly<{
    rideId: string;
    taxiId: string;
    revenueMinorUnits: number;
    incidentMinorUnits: number;
    grossCostMinorUnits: number;
    grossProfitMinorUnits: number;
    reviewImpacts: number | null;
    rating: number | null;
    reasons: readonly string[];
  }>;
  readonly cancellation: Readonly<{
    rideId: string;
    terminalState: string;
    passengerAboard: boolean;
    revenueMinorUnits: number;
    entryGrossCostMinorUnits: number;
    entryGrossCostAfterAdjustment: number;
    adjustmentMinorUnits: number;
    adjustmentCause: string;
    adjustmentsForRide: number;
    netCostMinorUnits: number;
    serviceRefunded: boolean;
  }>;
  readonly duplicate: Readonly<{
    applied: number;
    duplicates: number;
    entriesBefore: number;
    entriesAfter: number;
    revenueBefore: number;
    revenueAfter: number;
  }>;
  readonly monthWithRides: Readonly<{
    periodId: string;
    revenueMinorUnits: number;
    rideCostMinorUnits: number;
    fixedCostMinorUnits: number;
    totalCostMinorUnits: number;
    profitMinorUnits: number;
    terminalRides: number;
    fixedCostsApplied: boolean;
    hasRideData: boolean;
    completeness: string;
  }>;
  readonly emptyMonth: Readonly<{
    periodId: string;
    revenueMinorUnits: number;
    fixedCostMinorUnits: number;
    totalCostMinorUnits: number;
    profitMinorUnits: number;
    terminalRides: number;
    hasRideData: boolean;
    fixedCostsApplied: boolean;
    completeness: string;
    monthPresent: boolean;
    cashMinorUnits: number;
    uncoveredLossMinorUnits: number;
  }>;
  readonly fixedCosts: Readonly<{
    applied: number;
    duplicateApplied: number;
    duplicateReason: string | null;
    totalFixedCostMinorUnits: number;
    categories: readonly string[];
  }>;
  readonly cash: Readonly<{
    initialCashMinorUnits: number;
    revenueMinorUnits: number;
    grossCostMinorUnits: number;
    adjustmentMinorUnits: number;
    netCostMinorUnits: number;
    profitMinorUnits: number;
    cashMinorUnits: number;
    uncoveredLossMinorUnits: number;
    formula: 'initialCash + profit, clamped at zero';
  }>;
  readonly kpi: Readonly<{
    revenueBefore: number;
    revenueAfter: number;
    settlementsBefore: number;
    settlementsAfter: number;
    reviewsBefore: number;
    reviewsAfter: number;
    dayRevenueBefore: number;
    dayRevenueAfter: number;
    historyScansBefore: number;
    historyScansAfter: number;
    same: boolean;
  }>;
  readonly xp: Readonly<{
    balanceBefore: number;
    balanceAfter: number;
    levelBefore: number;
    levelAfter: number;
    entriesBefore: number;
    entriesAfter: number;
    debits: number;
    same: boolean;
  }>;
  readonly boundary: Readonly<{
    xpWrites: 0;
    economyWrites: 0;
    investmentWrites: 0;
    purchaseSurface: boolean;
    upgradeSurface: boolean;
    historyScans: 0;
  }>;
  readonly checks: readonly CompanyFinanceReportCheck[];
  readonly summary: Readonly<{
    version: typeof COMPANY_FINANCE_REPORT_VERSION;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: CompanyFinanceReportCheck['expected'],
  actual: CompanyFinanceReportCheck['actual'],
  detail: string,
): CompanyFinanceReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function stepCompany(
  fixture: LiveEconomyFixture,
  company: ReturnType<typeof createLiveCompanyFinance>,
): LiveCompanyStepResult {
  const result = fixture.economyResult();
  if (result === null) throw new Error('Missing live economy step');
  return company.step({ atTick: result.tick, settlements: result.settlements });
}

function cancelBeforeBoarding(fixture: LiveEconomyFixture, rideId: string): void {
  const tick = fixture.currentTick() + 1;
  fixture.composition.lifecycle.lifecycle.apply({
    rideId,
    eventId: `company-cancel:${rideId}:${tick}`,
    event: 'CANCELLED',
    tick,
    reason: 'PASSENGER_CANCELLED',
  });
  fixture.step(tick);
}

function lineAmount(
  entry: Readonly<{ lines: readonly Readonly<{ category: string; amountMinorUnits: number }>[] }>,
  category: string,
): number {
  return entry.lines.find((line) => line.category === category)?.amountMinorUnits ?? 0;
}

/** Deterministic 268 report over the real 265 lifecycle, the unchanged 209 economy and the company ledger. */
export function companyFinanceReportMarkdown(report: CompanyFinanceReport): string {
  const checks = report.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${JSON.stringify(entry.expected)} | ${JSON.stringify(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
    )
    .join('\n');
  return `# 268 — modelul financiar al companiei

Raport determinist generat de \`npm run company:finance\`.

Contract \`${report.contract}\` / \`${report.liveContract}\`; schedule \`${report.schedule.version}\`.
Valorile de cost sunt propuneri de calibrare, nu rezultate economice reale.

## Scenarii

| Scenariu | Revenue | Cost | Profit | Detaliu |
| --- | ---: | ---: | ---: | --- |
| Cursă profitabilă \`${report.profitableRide.rideId}\` | ${report.profitableRide.revenueMinorUnits} | ${report.profitableRide.grossCostMinorUnits} | ${report.profitableRide.grossProfitMinorUnits} | ${report.profitableRide.plannedDistanceMeters} m, energie ${report.profitableRide.energyMinorUnits}, mentenanță ${report.profitableRide.maintenanceMinorUnits}, serviciu ${report.profitableRide.serviceMinorUnits} |
| Cursă în pierdere \`${report.lossRide.rideId}\` | ${report.lossRide.revenueMinorUnits} | ${report.lossRide.grossCostMinorUnits} | ${report.lossRide.grossProfitMinorUnits} | incident ${report.lossRide.incidentMinorUnits}, impacturi ${report.lossRide.reviewImpacts} |
| Anulare \`${report.cancellation.rideId}\` | ${report.cancellation.revenueMinorUnits} | ${report.cancellation.entryGrossCostMinorUnits} → ${report.cancellation.entryGrossCostAfterAdjustment} | ${-report.cancellation.netCostMinorUnits} | ajustare ${report.cancellation.adjustmentMinorUnits}, cauză \`${report.cancellation.adjustmentCause}\` |
| Lună fără curse | ${report.emptyMonth.revenueMinorUnits} | ${report.emptyMonth.totalCostMinorUnits} | ${report.emptyMonth.profitMinorUnits} | ${report.emptyMonth.terminalRides} curse, cost fix ${report.emptyMonth.fixedCostMinorUnits}, ${report.emptyMonth.completeness} |

## Costuri fixe lunare

Asigurări ${report.schedule.insuranceMinorUnits}, salarii ${report.schedule.salariesMinorUnits}, licențe ${report.schedule.licensesMinorUnits}; total ${report.schedule.fixedMonthlyMinorUnits} SDA pe lună simulată.
Aplicarea este idempotentă: ${report.fixedCosts.applied} intrări noi, ${report.fixedCosts.duplicateApplied} duplicate la a doua aplicare.

## Cash și profit

- Revenue: ${report.cash.revenueMinorUnits} SDA
- Cost brut: ${report.cash.grossCostMinorUnits} SDA
- Ajustări: ${report.cash.adjustmentMinorUnits} SDA
- Cost net: ${report.cash.netCostMinorUnits} SDA
- Profit: ${report.cash.profitMinorUnits} SDA
- Cash: ${report.cash.cashMinorUnits} SDA (${report.cash.formula})
- Pierdere neacoperită: ${report.cash.uncoveredLossMinorUnits} SDA

## Separarea de 209 și XP

- KPI înainte/după: revenue ${report.kpi.revenueBefore}/${report.kpi.revenueAfter}, settle-uri ${report.kpi.settlementsBefore}/${report.kpi.settlementsAfter}, review-uri ${report.kpi.reviewsBefore}/${report.kpi.reviewsAfter}, historyScans ${report.kpi.historyScansBefore}/${report.kpi.historyScansAfter}.
- XP înainte/după: sold ${report.xp.balanceBefore}/${report.xp.balanceAfter}, nivel ${report.xp.levelBefore}/${report.xp.levelAfter}, intrări ${report.xp.entriesBefore}/${report.xp.entriesAfter}.
- Scrieri structurale: XP ${report.boundary.xpWrites}, 209 ${report.boundary.economyWrites}, investiții ${report.boundary.investmentWrites}; suprafață purchase/upgrade ${report.boundary.purchaseSurface}/${report.boundary.upgradeSurface}.

## Verificări

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checks}

## Rezumat

${report.summary.passed}/${report.summary.checks} verificări au trecut; overall ${report.summary.pass ? 'PASS' : 'FAIL'}.
`;
}

export function runCompanyFinanceReport(): CompanyFinanceReport {
  const completedFixture = createLiveEconomyFixture({
      dwellTicks: 24,
      civilianCount: 20,
      seed: 268,
    }),
    lossFixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 268 }),
    cancellationFixture = createLiveEconomyFixture({
      dwellTicks: 24,
      civilianCount: 20,
      seed: 269,
    }),
    completedCompany = createLiveCompanyFinance({
      namespace: 'report:company:completed',
      clock: completedFixture.economy.clock,
    }),
    lossCompany = createLiveCompanyFinance({
      namespace: 'report:company:loss',
      clock: lossFixture.economy.clock,
    }),
    cancellationCompany = createLiveCompanyFinance({
      namespace: 'report:company:cancellation',
      clock: cancellationFixture.economy.clock,
    }),
    emptyCompany = createCompanyLedger({ namespace: 'report:company:empty' }),
    player = createPlayerProgress({ playerId: 'player:268:report' });
  try {
    // A profitable completed ride from the real 265 lifecycle.
    completedFixture.runTo(60);
    stepCompany(completedFixture, completedCompany);
    const completedTarget = completedFixture.firstTarget();
    completedFixture.board(completedTarget);
    completedFixture.complete(completedTarget);
    const economyBefore = completedFixture.economy.read(),
      xpBefore = player.read(),
      completedStep = stepCompany(completedFixture, completedCompany),
      economyAfter = completedFixture.economy.read(),
      completedRead = completedCompany.read(),
      completedEntry = completedCompany.ledger.entry(completedTarget.rideId),
      completedReview = completedFixture.economy.economy.review(completedTarget.rideId),
      completedSettlement = completedFixture.economy.economy.settlement(completedTarget.rideId);
    if (
      completedRead === null ||
      completedEntry === undefined ||
      completedSettlement === null ||
      completedSettlement === undefined
    )
      throw new Error('The completed company scenario is missing its entry');
    if (completedStep.applied !== 1) throw new Error('The completed ride was not costed once');

    // A real 028 incident makes the same deterministic ride a real loss.
    lossFixture.runTo(60);
    stepCompany(lossFixture, lossCompany);
    const lossTarget = lossFixture.firstTarget();
    lossFixture.board(lossTarget);
    lossFixture.runTo(lossFixture.currentTick() + 60);
    const collisionTick = lossFixture.currentTick() + 1;
    lossFixture.collisions.push({
      incidentId: 'incident-268-report',
      vehicleId: lossTarget.taxiId,
      otherEntityId: 'wall:268:report',
      tick: collisionTick,
      impulseNs: 4_400,
    });
    lossFixture.step(collisionTick);
    lossFixture.complete(lossTarget);
    stepCompany(lossFixture, lossCompany);
    const lossRead = lossCompany.read(),
      lossEntry = lossCompany.ledger.entry(lossTarget.rideId),
      lossReview = lossFixture.economy.economy.review(lossTarget.rideId),
      lossSettlement = lossFixture.economy.economy.settlement(lossTarget.rideId);
    if (
      lossRead === null ||
      lossEntry === undefined ||
      lossSettlement === null ||
      lossSettlement === undefined
    )
      throw new Error('The loss company scenario is missing its entry');

    // A cancellation before boarding is a gross service entry plus an explicit refund adjustment.
    cancellationFixture.runTo(60);
    stepCompany(cancellationFixture, cancellationCompany);
    const cancellationTarget = cancellationFixture.firstTarget();
    cancelBeforeBoarding(cancellationFixture, cancellationTarget.rideId);
    stepCompany(cancellationFixture, cancellationCompany);
    const cancellationRead = cancellationCompany.read(),
      cancellationEntry = cancellationCompany.ledger.entry(cancellationTarget.rideId),
      cancellationAdjustments = cancellationCompany.ledger.adjustmentsFor(
        cancellationTarget.rideId,
      ),
      cancellationSettlement = cancellationFixture.economy.economy.settlement(
        cancellationTarget.rideId,
      );
    if (
      cancellationRead === null ||
      cancellationEntry === undefined ||
      cancellationAdjustments.length !== 1 ||
      cancellationSettlement === null ||
      cancellationSettlement === undefined
    )
      throw new Error('The cancellation company scenario is missing its adjustment');

    // The same terminal result delivered again is a duplicate and changes nothing.
    const beforeDuplicate = completedCompany.read();
    const duplicateStep = stepCompany(completedFixture, completedCompany);
    const afterDuplicate = completedCompany.read();
    if (beforeDuplicate === null || afterDuplicate === null)
      throw new Error('The duplicate company scenario is missing its read');

    // A month with fixed costs and zero rides is a real result, not missing data.
    const fixedCosts = emptyCompany.accrueFixedCosts({ tick: EMPTY_MONTH_TICK }),
      duplicateFixedCosts = emptyCompany.accrueFixedCosts({ tick: EMPTY_MONTH_TICK }),
      emptyRead = emptyCompany.read(EMPTY_MONTH_TICK),
      emptyTotals = emptyCompany.totals();
    if (emptyRead.month === null) throw new Error('The empty month was not materialised');

    const xpAfter = player.read(),
      completedMonth = completedRead.month!,
      emptyMonth = emptyRead.month!,
      completedEnergy = lineAmount(completedEntry, 'ENERGY'),
      completedMaintenance = lineAmount(completedEntry, 'MAINTENANCE'),
      completedIncident = lineAmount(completedEntry, 'INCIDENT'),
      completedService = lineAmount(completedEntry, 'SERVICE'),
      lossIncident = lineAmount(lossEntry, 'INCIDENT'),
      cancellationAdjustment = cancellationAdjustments[0]!,
      cancellationNetCost =
        cancellationRead.month!.rideCostMinorUnits + cancellationRead.month!.adjustmentMinorUnits;

    const checks: CompanyFinanceReportCheck[] = [
      check(
        'contract',
        COMPANY_LEDGER_VERSION,
        completedCompany.ledger.version,
        'the company ledger version',
      ),
      check(
        'live-contract',
        LIVE_COMPANY_FINANCE_VERSION,
        completedCompany.version,
        'the live company port version',
      ),
      check(
        'schedule-version',
        DEFAULT_COMPANY_COST_SCHEDULE.version,
        completedRead.totals.costModelVersion,
        'the versioned cost schedule',
      ),
      check(
        'profitable-terminal',
        'COMPLETED',
        completedEntry.terminalState,
        'the real 061 ride completed',
      ),
      check(
        'profitable-passenger',
        true,
        completedEntry.passengerAboard,
        'a completed ride carried the passenger',
      ),
      check(
        'profitable-revenue',
        completedSettlement.netMinorUnits,
        completedEntry.revenueMinorUnits,
        'revenue is copied from the 209 settlement',
      ),
      check(
        'profitable-distance',
        true,
        completedEntry.plannedDistanceMeters > 0,
        `${completedEntry.plannedDistanceMeters} planned metres`,
      ),
      check('profitable-energy', true, completedEnergy > 0, `${completedEnergy} SDA energy`),
      check(
        'profitable-maintenance',
        true,
        completedMaintenance > 0,
        `${completedMaintenance} SDA maintenance`,
      ),
      check('profitable-service', 40, completedService, 'the per-ride service cost'),
      check('profitable-incident', 0, completedIncident, 'no incident on the clean ride'),
      check(
        'profitable-gross-profit',
        true,
        completedEntry.grossProfitMinorUnits > 0,
        `${completedEntry.grossProfitMinorUnits} SDA before fixed costs`,
      ),
      check(
        'one-cost-entry',
        1,
        completedRead.totals.rideCostEntries,
        'one cost entry for the terminal ride',
      ),
      check(
        'profit-formula',
        completedRead.totals.revenueMinorUnits - completedRead.totals.netCostMinorUnits,
        completedRead.totals.profitMinorUnits,
        'profit = revenue - net cost',
      ),
      check(
        'cash-formula',
        Math.max(
          0,
          completedRead.totals.initialCashMinorUnits + completedRead.totals.profitMinorUnits,
        ),
        completedRead.totals.cashMinorUnits,
        'cash is initial cash plus profit, clamped at zero',
      ),
      check(
        'month-with-rides',
        true,
        completedMonth.terminalRides === 1,
        `${completedMonth.terminalRides} terminal ride(s)`,
      ),
      check(
        'month-fixed-costs',
        4_000,
        completedMonth.fixedCostMinorUnits,
        'the month carries the fixed monthly cost',
      ),
      check(
        'empty-month-present',
        true,
        emptyRead.month !== null,
        'a month with fixed costs is materialised',
      ),
      check('empty-month-no-rides', 0, emptyMonth.terminalRides, 'zero terminal rides'),
      check(
        'empty-month-fixed-costs',
        4_000,
        emptyMonth.fixedCostMinorUnits,
        'fixed costs are real',
      ),
      check(
        'empty-month-negative-profit',
        true,
        emptyMonth.profitMinorUnits < 0,
        `${emptyMonth.profitMinorUnits} SDA real loss`,
      ),
      check(
        'empty-month-not-missing',
        false,
        emptyMonth.hasRideData,
        'no ride data, but the month is not NO_DATA',
      ),
      check(
        'empty-month-partial',
        'PARTIAL',
        emptyMonth.completeness,
        'the current simulated month is partial',
      ),
      check(
        'fixed-costs-idempotent',
        0,
        duplicateFixedCosts.applied,
        `${duplicateFixedCosts.duplicates} duplicate fixed entries`,
      ),
      check('fixed-cost-count', 3, fixedCosts.applied, 'insurance, salaries and licences'),
      check(
        'loss-incident-cost',
        2_500,
        lossIncident,
        'a real 028 impact adds the versioned incident cost',
      ),
      check(
        'loss-real-review',
        1,
        lossReview?.evidence.impacts ?? null,
        'the review carries the real impact count',
      ),
      check(
        'loss-ride-negative',
        true,
        lossEntry.grossProfitMinorUnits < 0,
        `${lossEntry.grossProfitMinorUnits} SDA ride loss`,
      ),
      check(
        'cancellation-adjustment',
        'SERVICE_NOT_DELIVERED',
        cancellationAdjustment.cause,
        'a cancellation is an adjustment',
      ),
      check(
        'cancellation-adjustment-amount',
        -40,
        cancellationAdjustment.amountMinorUnits,
        'the service cost is refunded explicitly',
      ),
      check(
        'cancellation-entry-immutable',
        40,
        cancellationEntry.grossCostMinorUnits,
        'the original cost entry is not rewritten',
      ),
      check(
        'cancellation-net-cost',
        0,
        cancellationNetCost,
        'the ride cost nets to zero after the adjustment',
      ),
      check(
        'cancellation-no-revenue',
        0,
        cancellationSettlement.netMinorUnits,
        'a pre-boarding cancellation keeps no fare',
      ),
      check(
        'duplicate-no-entry',
        0,
        duplicateStep.applied,
        'a re-delivered terminal result is not costed twice',
      ),
      check(
        'duplicate-counted',
        1,
        duplicateStep.duplicates,
        'the duplicate is reported explicitly',
      ),
      check(
        'duplicate-stable',
        beforeDuplicate.totals.revenueMinorUnits,
        afterDuplicate.totals.revenueMinorUnits,
        'revenue is unchanged by the duplicate',
      ),
      check(
        'duplicate-entries-stable',
        beforeDuplicate.totals.rideCostEntries,
        afterDuplicate.totals.rideCostEntries,
        'the cost entry count is unchanged',
      ),
      check(
        'kpi-revenue',
        economyBefore?.totals.netRevenueMinorUnits ?? null,
        economyAfter?.totals.netRevenueMinorUnits ?? null,
        'the 209 revenue is unchanged by the company read',
      ),
      check(
        'kpi-settlements',
        economyBefore?.totals.settlements ?? null,
        economyAfter?.totals.settlements ?? null,
        'the 209 settlements are unchanged',
      ),
      check(
        'kpi-reviews',
        economyBefore?.counters.reviews ?? null,
        economyAfter?.counters.reviews ?? null,
        'the 209 reviews are unchanged',
      ),
      check(
        'kpi-history-scans',
        0,
        economyAfter?.historyScans ?? null,
        'the 209 read model still never scans history',
      ),
      check(
        'xp-balance',
        xpBefore.xpBalanceMicroXp,
        xpAfter.xpBalanceMicroXp,
        'negative profit never withdraws XP',
      ),
      check('xp-level', xpBefore.level, xpAfter.level, 'the player level is unchanged'),
      check(
        'xp-entries',
        xpBefore.entries.length,
        xpAfter.entries.length,
        'the XP ledger is untouched',
      ),
      check('boundary-xp', 0, completedRead.counters.xpWrites, 'no XP write surface'),
      check('boundary-economy', 0, completedRead.counters.economyWrites, 'no 209 write surface'),
      check(
        'boundary-investment',
        0,
        completedRead.counters.investmentWrites,
        'no purchase or upgrade surface',
      ),
      check(
        'boundary-history',
        0,
        completedRead.historyScans,
        'company reads use incremental totals',
      ),
      check(
        'no-purchase',
        false,
        Object.hasOwn(completedCompany.ledger, 'purchase'),
        'PBI 269 owns purchases',
      ),
      check(
        'no-upgrade',
        false,
        Object.hasOwn(completedCompany.ledger, 'upgrade'),
        'PBI 269 owns upgrades',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;

    const report: CompanyFinanceReport = Object.freeze({
      version: COMPANY_FINANCE_REPORT_VERSION,
      contract: COMPANY_LEDGER_VERSION,
      liveContract: LIVE_COMPANY_FINANCE_VERSION,
      schedule: Object.freeze({
        version: completedRead.totals.costModelVersion,
        currency: completedRead.totals.currency,
        initialCashMinorUnits: completedRead.totals.initialCashMinorUnits,
        energyPerKmMinorUnits: DEFAULT_COMPANY_COST_SCHEDULE.categories.ENERGY.amountMinorUnits,
        maintenancePerKmMinorUnits:
          DEFAULT_COMPANY_COST_SCHEDULE.categories.MAINTENANCE.amountMinorUnits,
        incidentMinorUnits: DEFAULT_COMPANY_COST_SCHEDULE.categories.INCIDENT.amountMinorUnits,
        servicePerRideMinorUnits: DEFAULT_COMPANY_COST_SCHEDULE.categories.SERVICE.amountMinorUnits,
        fixedMonthlyMinorUnits:
          DEFAULT_COMPANY_COST_SCHEDULE.categories.INSURANCE.amountMinorUnits +
          DEFAULT_COMPANY_COST_SCHEDULE.categories.SALARIES.amountMinorUnits +
          DEFAULT_COMPANY_COST_SCHEDULE.categories.LICENSES.amountMinorUnits,
        insuranceMinorUnits: DEFAULT_COMPANY_COST_SCHEDULE.categories.INSURANCE.amountMinorUnits,
        salariesMinorUnits: DEFAULT_COMPANY_COST_SCHEDULE.categories.SALARIES.amountMinorUnits,
        licensesMinorUnits: DEFAULT_COMPANY_COST_SCHEDULE.categories.LICENSES.amountMinorUnits,
      }),
      profitableRide: Object.freeze({
        rideId: completedEntry.rideId,
        requestId: completedEntry.requestId,
        taxiId: completedEntry.taxiId,
        terminalState: completedEntry.terminalState,
        passengerAboard: completedEntry.passengerAboard,
        plannedDistanceMeters: completedEntry.plannedDistanceMeters,
        revenueMinorUnits: completedEntry.revenueMinorUnits,
        energyMinorUnits: completedEnergy,
        maintenanceMinorUnits: completedMaintenance,
        incidentMinorUnits: completedIncident,
        serviceMinorUnits: completedService,
        grossCostMinorUnits: completedEntry.grossCostMinorUnits,
        grossProfitMinorUnits: completedEntry.grossProfitMinorUnits,
        rating: completedReview?.rating ?? null,
        reasons: completedReview?.reasonCodes ?? [],
      }),
      lossRide: Object.freeze({
        rideId: lossEntry.rideId,
        taxiId: lossEntry.taxiId,
        revenueMinorUnits: lossEntry.revenueMinorUnits,
        incidentMinorUnits: lossIncident,
        grossCostMinorUnits: lossEntry.grossCostMinorUnits,
        grossProfitMinorUnits: lossEntry.grossProfitMinorUnits,
        reviewImpacts: lossReview?.evidence.impacts ?? null,
        rating: lossReview?.rating ?? null,
        reasons: lossReview?.reasonCodes ?? [],
      }),
      cancellation: Object.freeze({
        rideId: cancellationEntry.rideId,
        terminalState: cancellationEntry.terminalState,
        passengerAboard: cancellationEntry.passengerAboard,
        revenueMinorUnits: cancellationEntry.revenueMinorUnits,
        entryGrossCostMinorUnits: cancellationEntry.grossCostMinorUnits,
        entryGrossCostAfterAdjustment: cancellationNetCost,
        adjustmentMinorUnits: cancellationAdjustment.amountMinorUnits,
        adjustmentCause: cancellationAdjustment.cause,
        adjustmentsForRide: cancellationAdjustments.length,
        netCostMinorUnits: cancellationNetCost,
        serviceRefunded: cancellationAdjustment.amountMinorUnits === -40,
      }),
      duplicate: Object.freeze({
        applied: duplicateStep.applied,
        duplicates: duplicateStep.duplicates,
        entriesBefore: beforeDuplicate.totals.rideCostEntries,
        entriesAfter: afterDuplicate.totals.rideCostEntries,
        revenueBefore: beforeDuplicate.totals.revenueMinorUnits,
        revenueAfter: afterDuplicate.totals.revenueMinorUnits,
      }),
      monthWithRides: Object.freeze({
        periodId: completedMonth.periodId,
        revenueMinorUnits: completedMonth.revenueMinorUnits,
        rideCostMinorUnits: completedMonth.rideCostMinorUnits,
        fixedCostMinorUnits: completedMonth.fixedCostMinorUnits,
        totalCostMinorUnits: completedMonth.totalCostMinorUnits,
        profitMinorUnits: completedMonth.profitMinorUnits,
        terminalRides: completedMonth.terminalRides,
        fixedCostsApplied: completedMonth.fixedCostsApplied,
        hasRideData: completedMonth.hasRideData,
        completeness: completedMonth.completeness,
      }),
      emptyMonth: Object.freeze({
        periodId: emptyMonth.periodId,
        revenueMinorUnits: emptyMonth.revenueMinorUnits,
        fixedCostMinorUnits: emptyMonth.fixedCostMinorUnits,
        totalCostMinorUnits: emptyMonth.totalCostMinorUnits,
        profitMinorUnits: emptyMonth.profitMinorUnits,
        terminalRides: emptyMonth.terminalRides,
        hasRideData: emptyMonth.hasRideData,
        fixedCostsApplied: emptyMonth.fixedCostsApplied,
        completeness: emptyMonth.completeness,
        monthPresent: emptyRead.month !== null,
        cashMinorUnits: emptyTotals.cashMinorUnits,
        uncoveredLossMinorUnits: emptyTotals.uncoveredLossMinorUnits,
      }),
      fixedCosts: Object.freeze({
        applied: fixedCosts.applied,
        duplicateApplied: duplicateFixedCosts.applied,
        duplicateReason: duplicateFixedCosts.duplicateReason,
        totalFixedCostMinorUnits:
          emptyMonth.costByCategory.INSURANCE +
          emptyMonth.costByCategory.SALARIES +
          emptyMonth.costByCategory.LICENSES,
        categories: Object.freeze(['INSURANCE', 'SALARIES', 'LICENSES']),
      }),
      cash: Object.freeze({
        initialCashMinorUnits: completedRead.totals.initialCashMinorUnits,
        revenueMinorUnits: completedRead.totals.revenueMinorUnits,
        grossCostMinorUnits: completedRead.totals.grossCostMinorUnits,
        adjustmentMinorUnits: completedRead.totals.adjustmentMinorUnits,
        netCostMinorUnits: completedRead.totals.netCostMinorUnits,
        profitMinorUnits: completedRead.totals.profitMinorUnits,
        cashMinorUnits: completedRead.totals.cashMinorUnits,
        uncoveredLossMinorUnits: completedRead.totals.uncoveredLossMinorUnits,
        formula: 'initialCash + profit, clamped at zero' as const,
      }),
      kpi: Object.freeze({
        revenueBefore: economyBefore?.totals.netRevenueMinorUnits ?? 0,
        revenueAfter: economyAfter?.totals.netRevenueMinorUnits ?? 0,
        settlementsBefore: economyBefore?.totals.settlements ?? 0,
        settlementsAfter: economyAfter?.totals.settlements ?? 0,
        reviewsBefore: economyBefore?.counters.reviews ?? 0,
        reviewsAfter: economyAfter?.counters.reviews ?? 0,
        dayRevenueBefore: economyBefore?.today?.revenueMinorUnits ?? 0,
        dayRevenueAfter: economyAfter?.today?.revenueMinorUnits ?? 0,
        historyScansBefore: economyBefore?.historyScans ?? 0,
        historyScansAfter: economyAfter?.historyScans ?? 0,
        same:
          economyBefore?.totals.netRevenueMinorUnits ===
            economyAfter?.totals.netRevenueMinorUnits &&
          economyBefore?.totals.settlements === economyAfter?.totals.settlements &&
          economyBefore?.counters.reviews === economyAfter?.counters.reviews,
      }),
      xp: Object.freeze({
        balanceBefore: xpBefore.xpBalanceMicroXp,
        balanceAfter: xpAfter.xpBalanceMicroXp,
        levelBefore: xpBefore.level,
        levelAfter: xpAfter.level,
        entriesBefore: xpBefore.entries.length,
        entriesAfter: xpAfter.entries.length,
        debits: xpAfter.debits,
        same:
          xpBefore.xpBalanceMicroXp === xpAfter.xpBalanceMicroXp &&
          xpBefore.level === xpAfter.level &&
          xpBefore.entries.length === xpAfter.entries.length,
      }),
      boundary: Object.freeze({
        xpWrites: 0 as const,
        economyWrites: 0 as const,
        investmentWrites: 0 as const,
        purchaseSurface: Object.hasOwn(completedCompany.ledger, 'purchase'),
        upgradeSurface: Object.hasOwn(completedCompany.ledger, 'upgrade'),
        historyScans: 0 as const,
      }),
      checks: Object.freeze(checks),
      summary: Object.freeze({
        version: COMPANY_FINANCE_REPORT_VERSION,
        checks: checks.length,
        passed,
        pass: passed === checks.length,
      }),
    });
    return report;
  } finally {
    completedCompany.dispose();
    lossCompany.dispose();
    cancellationCompany.dispose();
    emptyCompany.dispose();
    completedFixture.dispose();
    lossFixture.dispose();
    cancellationFixture.dispose();
  }
}
