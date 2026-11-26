import {
  COMPANY_EVOLUTION_VERSION,
  COMPANY_LEDGER_VERSION,
  type CompanyEvolutionRead,
} from '../../src/economy';
import {
  COMPANY_DASHBOARD_PANEL_VERSION,
  COMPANY_DASHBOARD_TEXT,
  COMPANY_DASHBOARD_UI_VERSION,
  COMPANY_DASHBOARD_WINDOW_MONTHS,
  projectCompanyDashboard,
} from '../../src/ui';
import {
  COMPANY_OFFER,
  COMPANY_UPGRADE,
  createCompanyDashboardHarness,
  createCompanyDashboardScenario,
} from './company-dashboard-fixture';

export const COMPANY_DASHBOARD_REPORT_VERSION = '270-company-dashboard-report-v1' as const;

export interface CompanyDashboardReportCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly actual: string;
  readonly expected: string;
  readonly note: string;
}

export interface CompanyDashboardReport {
  readonly version: typeof COMPANY_DASHBOARD_REPORT_VERSION;
  readonly generatedBy: 'npm run company:dashboard';
  readonly contract: {
    readonly pbi: '270';
    readonly ledger: typeof COMPANY_LEDGER_VERSION;
    readonly evolution: typeof COMPANY_EVOLUTION_VERSION;
    readonly ui: typeof COMPANY_DASHBOARD_UI_VERSION;
    readonly panel: typeof COMPANY_DASHBOARD_PANEL_VERSION;
    readonly windowMonths: number;
    readonly refreshHz: number;
  };
  readonly metrics: {
    readonly tick: number;
    readonly revenueMinorUnits: number;
    readonly costMinorUnits: number;
    readonly profitMinorUnits: number;
    readonly cashMinorUnits: number;
    readonly fleetValueMinorUnits: number;
    readonly companyLevel: number;
    readonly companyLevelMax: number;
    readonly months: number;
    readonly monthsWithData: number;
    readonly monthsWithoutData: number;
    readonly missingMonth: string;
    readonly missingMonthRevenue: string | null;
    readonly zeroRevenueMonth: string;
    readonly zeroRevenueLabel: string;
    readonly negativeProfitMonth: string;
    readonly negativeProfitLabel: string;
    readonly historyScansBefore: number;
    readonly historyScansAfter: number;
  };
  readonly purchase: {
    readonly offerId: string;
    readonly costMinorUnits: number;
    readonly cashBeforeMinorUnits: number;
    readonly cashAfterMinorUnits: number;
    readonly taxisBefore: number;
    readonly taxisAfter: number;
    readonly levelBefore: number;
    readonly levelAfter: number;
    readonly state: string;
    readonly confirmationVisible: boolean;
  };
  readonly upgrade: {
    readonly upgradeId: string;
    readonly costMinorUnits: number;
    readonly category: string;
    readonly basisPoints: number;
    readonly effectivePeriod: string;
    readonly pendingBefore: boolean;
    readonly pendingAfter: number;
    readonly monthZeroServiceMinorUnits: number;
    readonly nextMonthServiceMinorUnits: number;
    readonly nextMonthRevenueMinorUnits: number;
    readonly nextMonthProfitMinorUnits: number;
    readonly state: string;
  };
  readonly refusals: {
    readonly insufficientCashState: string;
    readonly insufficientCashReason: string;
    readonly insufficientCashBlocked: boolean;
    readonly insufficientCashUnchanged: boolean;
    readonly levelRequiredState: string;
    readonly levelRequiredReason: string;
    readonly duplicateUiReason: string;
    readonly duplicateBlocked: boolean;
  };
  readonly ui: {
    readonly elements: number;
    readonly textNodes: number;
    readonly listeners: number;
    readonly globalListeners: number;
    readonly opens: number;
    readonly closes: number;
    readonly renders: number;
    readonly reads: number;
    readonly skippedClosed: number;
    readonly skippedThrottled: number;
    readonly skippedUnchanged: number;
    readonly bars: number;
    readonly tableRows: number;
    readonly offers: number;
    readonly upgrades: number;
    readonly escapes: number;
    readonly tabWraps: number;
    readonly focusMoves: number;
    readonly focusRestores: number;
    readonly surfaceCalls: number;
    readonly closedReads: number;
    readonly lastHistoryScans: number;
  };
  readonly checks: readonly CompanyDashboardReportCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
  readonly determinism: { readonly runs: number; readonly equal: boolean };
}

function check(
  name: string,
  pass: boolean,
  actual: string | number | boolean | null,
  expected: string | number | boolean | null,
  note: string,
): CompanyDashboardReportCheck {
  return Object.freeze({
    name,
    pass,
    actual: actual === null ? 'null' : String(actual),
    expected: expected === null ? 'null' : String(expected),
    note,
  });
}

function signatureOf(read: CompanyEvolutionRead): string {
  return projectCompanyDashboard(read).signature;
}

/**
 * Deterministic 270 evidence driver: the real 268 ledger, the real 269 evolution and the real panel
 * adapter over the deterministic focus DOM. It proves the projection, the zero-versus-missing rule,
 * the shared chart/table aggregates, confirmation, insufficient funds, duplicate refusal and the
 * closed-panel cost structurally. It does not measure wall time, FPS or GPU.
 */
export function runCompanyDashboardReport(): CompanyDashboardReport {
  const scenario = createCompanyDashboardScenario(),
    historyScansBefore = scenario.read().historyScans,
    read = scenario.read(),
    view = projectCompanyDashboard(read),
    missing = view.months.find((month) => month.index === 1),
    zero = view.months.find((month) => month.index === 2),
    original = scenario.read(),
    harness = createCompanyDashboardHarness({ scenario }),
    closedUpdate = harness.panel.update(1_000),
    closedRefresh = harness.panel.refresh();
  let purchaseCashBefore = 0,
    purchaseCashAfter = 0,
    taxisBefore = 0,
    taxisAfter = 0,
    levelBefore = 0,
    levelAfter = 0,
    purchaseState = '',
    confirmationVisible = false,
    upgradeState = '',
    pendingBefore = false,
    pendingAfter = 0,
    nextMonthService = 0,
    nextMonthRevenue = 0,
    nextMonthProfit = 0;
  try {
    harness.trigger.focus();
    harness.panel.open();
    const openedStats = harness.panel.getStats(),
      purchaseCard = harness.card('purchase', `offer:${COMPANY_OFFER.offerId}`),
      purchaseButton = purchaseCard?.children[1] as
        (HTMLElement & { readonly disabled?: boolean }) | undefined;
    purchaseCashBefore = scenario.ledger.totals().cashMinorUnits;
    taxisBefore = scenario.fleet.counts().taxis;
    levelBefore = scenario.read().companyLevel.level;
    harness.clickAction('purchase', `offer:${COMPANY_OFFER.offerId}`);
    const confirmation = harness.panel
      .getView()
      ?.offers.find((offer) => offer.offerId === COMPANY_OFFER.offerId)?.confirmationLabel;
    confirmationVisible = (confirmation ?? '').length > 0;
    harness.confirm();
    const afterPurchase = harness.panel.getView();
    purchaseCashAfter = scenario.ledger.totals().cashMinorUnits;
    taxisAfter = scenario.fleet.counts().taxis;
    levelAfter = scenario.read().companyLevel.level;
    purchaseState =
      afterPurchase?.offers.find((offer) => offer.offerId === COMPANY_OFFER.offerId)?.state ?? '';

    const staleAfterPurchase = scenario.read(),
      upgradeCard = harness.card('upgrade', `upgrade:${COMPANY_UPGRADE.upgradeId}`),
      upgradeButton = upgradeCard?.children[1] as
        (HTMLElement & { readonly disabled?: boolean }) | undefined;
    pendingBefore =
      (staleAfterPurchase.pendingEffects.find((effect) => effect.category === 'SERVICE') ??
        null) !== null;
    harness.clickAction('upgrade', `upgrade:${COMPANY_UPGRADE.upgradeId}`);
    harness.confirm();
    const afterUpgrade = harness.panel.getView(),
      upgrade = afterUpgrade?.upgrades.find(
        (candidate) => candidate.upgradeId === COMPANY_UPGRADE.upgradeId,
      );
    upgradeState = upgrade?.state ?? '';
    pendingAfter = afterUpgrade?.pendingEffects.length ?? 0;
    scenario.addNextMonthActivity();
    harness.panel.refresh();
    const next = harness.panel.getView(),
      monthZero = next?.months.find((month) => month.index === 0),
      nextMonth = next?.months.find((month) => month.index === 3),
      nextReport = scenario.evolution.read(scenario.clock.tick).finance.month;
    nextMonthService = nextReport?.costByCategory.SERVICE ?? 0;
    nextMonthRevenue = nextMonth?.revenueMinorUnits ?? 0;
    nextMonthProfit = nextMonth?.profitMinorUnits ?? 0;

    const stats = harness.panel.getStats(),
      levelScenario = createCompanyDashboardScenario({
        initialCashMinorUnits: 10_000,
        withHistory: false,
      }),
      levelHarness = createCompanyDashboardHarness({ scenario: levelScenario });
    let insufficientCashState = '',
      insufficientCashReason = '',
      insufficientCashBlocked = false,
      insufficientCashUnchanged = false,
      levelRequiredState = '',
      levelRequiredReason = '',
      duplicateUiReason = '',
      duplicateBlocked = false;
    try {
      levelHarness.panel.open();
      const poor = levelHarness.card('purchase', `offer:${COMPANY_OFFER.offerId}`),
        poorResult = levelHarness.panel.requestPurchase(COMPANY_OFFER.offerId);
      insufficientCashState = poor?.getAttribute('data-state') ?? '';
      insufficientCashReason = poor?.textContent ?? '';
      insufficientCashBlocked = poorResult.status === 'BLOCKED';
      insufficientCashUnchanged =
        levelScenario.ledger.totals().cashMinorUnits === 10_000 &&
        levelScenario.fleet.counts().taxis === 20;
      const locked = levelHarness.card('purchase', 'offer:offer-city-sedan-1');
      levelRequiredState = locked?.getAttribute('data-state') ?? '';
      levelRequiredReason = locked?.textContent ?? '';
    } finally {
      levelHarness.panel.dispose();
      levelScenario.dispose();
    }
    const duplicate = harness.panel.requestUpgrade(COMPANY_UPGRADE.upgradeId);
    duplicateBlocked = duplicate.status === 'BLOCKED';
    duplicateUiReason = duplicate.reason ?? '';

    const historyScansAfter = scenario.read().historyScans,
      monthZeroService =
        original.finance.months.find((month) => month.periodId === 'm0000')?.costByCategory
          .SERVICE ?? 0,
      runs = [signatureOf(original), signatureOf(original), signatureOf(scenario.read())],
      determinism = runs[0] === runs[1];

    const checks: CompanyDashboardReportCheck[] = [
      check(
        'projection-revenue',
        view.metrics.revenueMinorUnits === original.finance.totals.revenueMinorUnits,
        view.metrics.revenueMinorUnits,
        original.finance.totals.revenueMinorUnits,
        'panel revenue equals the 268 ledger revenue',
      ),
      check(
        'projection-cost',
        view.metrics.costMinorUnits === original.finance.totals.netCostMinorUnits,
        view.metrics.costMinorUnits,
        original.finance.totals.netCostMinorUnits,
        'panel costs equal net cost, including signed adjustments',
      ),
      check(
        'projection-profit',
        view.metrics.profitMinorUnits === original.finance.totals.profitMinorUnits,
        view.metrics.profitMinorUnits,
        original.finance.totals.profitMinorUnits,
        'panel profit equals the 268 profit',
      ),
      check(
        'projection-cash',
        view.metrics.cashMinorUnits === original.cash.cashMinorUnits,
        view.metrics.cashMinorUnits,
        original.cash.cashMinorUnits,
        'panel cash equals the 269 cash formula',
      ),
      check(
        'projection-fleet-value',
        view.metrics.fleetValueMinorUnits === original.fleet.fleetValueMinorUnits,
        view.metrics.fleetValueMinorUnits,
        original.fleet.fleetValueMinorUnits,
        'panel fleet value is the acquisition value of purchased vehicles',
      ),
      check(
        'projection-level',
        view.metrics.companyLevel === original.companyLevel.level,
        view.metrics.companyLevel,
        original.companyLevel.level,
        'panel level is the company level, not XP',
      ),
      check(
        'missing-month',
        missing?.state === 'NO_DATA',
        missing?.state ?? 'null',
        'NO_DATA',
        'a month without a bucket is not zero',
      ),
      check(
        'missing-month-labels',
        missing?.revenueLabel === COMPANY_DASHBOARD_TEXT.noData &&
          missing?.profitLabel === COMPANY_DASHBOARD_TEXT.noData,
        `${missing?.revenueLabel ?? 'null'}/${missing?.profitLabel ?? 'null'}`,
        `${COMPANY_DASHBOARD_TEXT.noData}/${COMPANY_DASHBOARD_TEXT.noData}`,
        'a missing month prints fără date, never 0 SDA',
      ),
      check(
        'zero-revenue',
        zero?.revenueMinorUnits === 0 && zero?.revenueLabel === '0 SDA',
        zero?.revenueLabel ?? 'null',
        '0 SDA',
        'a real zero revenue stays zero',
      ),
      check(
        'negative-profit',
        zero?.profitMinorUnits === -4_000 && zero?.negativeProfit === true,
        zero?.profitLabel ?? 'null',
        '-4000 SDA',
        'a real negative profit is visible and marked',
      ),
      check(
        'chart-table-aggregates',
        view.months.every((month, index) => {
          const group = view.chart.groups[index],
            row = view.tables[0]?.rows[index];
          return (
            group?.bars.map((bar) => bar.value).join('|') ===
              [month.revenueMinorUnits, month.costMinorUnits, month.profitMinorUnits].join('|') &&
            row?.[4] === month.profitLabel
          );
        }),
        true,
        true,
        'chart bars and monthly table rows use the same aggregates',
      ),
      check(
        'closed-update',
        closedUpdate === 'SKIPPED_CLOSED',
        closedUpdate,
        'SKIPPED_CLOSED',
        'closed panel update does not read',
      ),
      check(
        'closed-refresh',
        closedRefresh === 'SKIPPED_CLOSED',
        closedRefresh,
        'SKIPPED_CLOSED',
        'closed panel explicit refresh does not read',
      ),
      check(
        'closed-reads',
        openedStats.reads === 1,
        openedStats.reads,
        1,
        'opening the panel reads exactly once',
      ),
      check(
        'purchase-card',
        purchaseCard !== null && purchaseButton?.disabled === false,
        purchaseCard !== null,
        true,
        'available offer has an enabled button',
      ),
      check(
        'purchase-confirmation',
        confirmationVisible,
        confirmationVisible,
        true,
        'purchase asks for confirmation with cost and effect',
      ),
      check(
        'purchase-accepted',
        purchaseState === 'OWNED' &&
          purchaseCashAfter === purchaseCashBefore - COMPANY_OFFER.costMinorUnits,
        `${purchaseState}/${purchaseCashAfter}`,
        `OWNED/${purchaseCashBefore - COMPANY_OFFER.costMinorUnits}`,
        'purchase spends real cash in the same ledger',
      ),
      check(
        'purchase-fleet',
        taxisAfter === taxisBefore + 1,
        `${taxisBefore}->${taxisAfter}`,
        `${taxisBefore}->${taxisBefore + 1}`,
        'purchase adds the real 057 taxi',
      ),
      check(
        'purchase-level',
        levelBefore === 1 && levelAfter === 2,
        `${levelBefore}->${levelAfter}`,
        '1->2',
        'reinvested purchase profit raises the company level',
      ),
      check(
        'upgrade-card',
        upgradeCard !== null && upgradeButton?.disabled === false,
        upgradeCard !== null,
        true,
        'level 2 makes the service upgrade available',
      ),
      check(
        'upgrade-pending-before',
        pendingBefore === false,
        pendingBefore,
        false,
        'no pending service effect before buying',
      ),
      check(
        'upgrade-owned',
        upgradeState === 'OWNED',
        upgradeState,
        'OWNED',
        'upgrade ownership is rendered',
      ),
      check(
        'upgrade-pending-after',
        pendingAfter === 1,
        pendingAfter,
        1,
        'the next-period effect is listed once',
      ),
      check(
        'upgrade-next-service',
        nextMonthService === 80,
        nextMonthService,
        80,
        'four rides at 40 SDA become four at 20 SDA in the next month',
      ),
      check(
        'upgrade-next-profit',
        nextMonthRevenue === 5_200 &&
          nextMonthProfit === 700 &&
          (monthZero?.costMinorUnits ?? 0) === 6_900,
        `${nextMonthRevenue}/${nextMonthProfit}`,
        '5200/700',
        'next-month profit reflects the halved service cost (5200 - 4500)',
      ),
      check(
        'insufficient-cash',
        insufficientCashState === 'INSUFFICIENT_CASH' &&
          insufficientCashBlocked &&
          insufficientCashUnchanged,
        `${insufficientCashState}/${insufficientCashBlocked}/${insufficientCashUnchanged}`,
        'INSUFFICIENT_CASH/true/true',
        'insufficient funds block the purchase and change nothing',
      ),
      check(
        'insufficient-cash-message',
        /Fonduri insuficiente/.test(insufficientCashReason) &&
          /cash 10000 SDA/.test(insufficientCashReason),
        insufficientCashReason,
        'contains Fonduri insuficiente and cash 10000 SDA',
        'the refusal names the missing cash explicitly',
      ),
      check(
        'level-required',
        levelRequiredState === 'LEVEL_REQUIRED' && /Nivel insuficient/.test(levelRequiredReason),
        levelRequiredState,
        'LEVEL_REQUIRED',
        'a level-locked offer is blocked with the required level text',
      ),
      check(
        'duplicate-upgrade',
        duplicateBlocked && /Deținut/.test(duplicateUiReason),
        duplicateUiReason,
        'Deținut',
        'an owned upgrade is refused explicitly',
      ),
      check(
        'no-history-scans',
        historyScansAfter === 0,
        historyScansAfter,
        0,
        'company read model keeps historyScans 0',
      ),
      check(
        'listeners',
        stats.listeners === 2,
        stats.listeners,
        2,
        'only the dialog keydown and click listeners',
      ),
      check(
        'global-listeners',
        stats.globalListeners === 0,
        stats.globalListeners,
        0,
        'no window/document listener',
      ),
      check(
        'determinism',
        determinism,
        determinism,
        true,
        'two projections of the same read are identical',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: COMPANY_DASHBOARD_REPORT_VERSION,
      generatedBy: 'npm run company:dashboard',
      contract: {
        pbi: '270' as const,
        ledger: COMPANY_LEDGER_VERSION,
        evolution: COMPANY_EVOLUTION_VERSION,
        ui: COMPANY_DASHBOARD_UI_VERSION,
        panel: COMPANY_DASHBOARD_PANEL_VERSION,
        windowMonths: COMPANY_DASHBOARD_WINDOW_MONTHS,
        refreshHz: 10,
      },
      metrics: {
        tick: original.tick,
        revenueMinorUnits: view.metrics.revenueMinorUnits,
        costMinorUnits: view.metrics.costMinorUnits,
        profitMinorUnits: view.metrics.profitMinorUnits,
        cashMinorUnits: view.metrics.cashMinorUnits,
        fleetValueMinorUnits: view.metrics.fleetValueMinorUnits,
        companyLevel: view.metrics.companyLevel,
        companyLevelMax: view.metrics.companyLevelMax,
        months: view.months.length,
        monthsWithData: view.months.filter((month) => month.hasData).length,
        monthsWithoutData: view.months.filter((month) => !month.hasData).length,
        missingMonth: missing?.label ?? '',
        missingMonthRevenue: missing?.revenueLabel ?? null,
        zeroRevenueMonth: zero?.label ?? '',
        zeroRevenueLabel: zero?.revenueLabel ?? '',
        negativeProfitMonth: zero?.label ?? '',
        negativeProfitLabel: zero?.profitLabel ?? '',
        historyScansBefore,
        historyScansAfter,
      },
      purchase: {
        offerId: COMPANY_OFFER.offerId,
        costMinorUnits: COMPANY_OFFER.costMinorUnits,
        cashBeforeMinorUnits: purchaseCashBefore,
        cashAfterMinorUnits: purchaseCashAfter,
        taxisBefore,
        taxisAfter,
        levelBefore,
        levelAfter,
        state: purchaseState,
        confirmationVisible,
      },
      upgrade: {
        upgradeId: COMPANY_UPGRADE.upgradeId,
        costMinorUnits: COMPANY_UPGRADE.costMinorUnits,
        category: COMPANY_UPGRADE.effect.category,
        basisPoints: COMPANY_UPGRADE.effect.basisPoints,
        effectivePeriod: 'm0003',
        pendingBefore,
        pendingAfter,
        monthZeroServiceMinorUnits: monthZeroService,
        nextMonthServiceMinorUnits: nextMonthService,
        nextMonthRevenueMinorUnits: nextMonthRevenue,
        nextMonthProfitMinorUnits: nextMonthProfit,
        state: upgradeState,
      },
      refusals: {
        insufficientCashState,
        insufficientCashReason,
        insufficientCashBlocked,
        insufficientCashUnchanged,
        levelRequiredState,
        levelRequiredReason,
        duplicateUiReason,
        duplicateBlocked,
      },
      ui: {
        elements: stats.elements,
        textNodes: stats.textNodes,
        listeners: stats.listeners,
        globalListeners: stats.globalListeners,
        opens: stats.opens,
        closes: stats.closes,
        renders: stats.renders,
        reads: stats.reads,
        skippedClosed: stats.skippedClosed,
        skippedThrottled: stats.skippedThrottled,
        skippedUnchanged: stats.skippedUnchanged,
        bars: stats.bars,
        tableRows: stats.tableRows,
        offers: stats.offers,
        upgrades: stats.upgrades,
        escapes: stats.escapes,
        tabWraps: stats.tabWraps,
        focusMoves: stats.focusMoves,
        focusRestores: stats.focusRestores,
        surfaceCalls: stats.surfaceCalls,
        closedReads: stats.closedReads,
        lastHistoryScans: stats.lastHistoryScans,
      },
      checks: Object.freeze(checks),
      summary: { checks: checks.length, passed, pass: passed === checks.length },
      determinism: { runs: 2, equal: determinism },
    });
  } finally {
    harness.panel.dispose();
    scenario.dispose();
  }
}

export function companyDashboardReportMarkdown(report: CompanyDashboardReport): string {
  const checks = report.checks
    .map(
      (entry) =>
        `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — actual ${entry.actual}, expected ${entry.expected}. ${entry.note}`,
    )
    .join('\n');
  return `# 270 — raport determinist panoul companiei

Generat de \`npm run company:dashboard\` peste ledgerul real 268 și evoluția reală 269, cu panoul
real montat pe DOM-ul determinist. Nu măsoară timp de perete, FPS sau GPU.

| Metric | Value |
| --- | ---: |
| Company level | ${report.metrics.companyLevel} / ${report.metrics.companyLevelMax} |
| Revenue / cost / profit | ${report.metrics.revenueMinorUnits} / ${report.metrics.costMinorUnits} / ${report.metrics.profitMinorUnits} SDA |
| Cash / fleet value | ${report.metrics.cashMinorUnits} / ${report.metrics.fleetValueMinorUnits} SDA |
| Months (data / missing) | ${report.metrics.monthsWithData} / ${report.metrics.monthsWithoutData} |
| Missing month | ${report.metrics.missingMonth} = ${report.metrics.missingMonthRevenue} |
| Real zero month | ${report.metrics.zeroRevenueMonth} = ${report.metrics.zeroRevenueLabel} |
| Negative profit month | ${report.metrics.negativeProfitMonth} = ${report.metrics.negativeProfitLabel} |
| historyScans before / after | ${report.metrics.historyScansBefore} / ${report.metrics.historyScansAfter} |

## Achiziție și upgrade

| Metric | Value |
| --- | ---: |
| Offer / cost | \`${report.purchase.offerId}\` / ${report.purchase.costMinorUnits} SDA |
| Cash before / after | ${report.purchase.cashBeforeMinorUnits} / ${report.purchase.cashAfterMinorUnits} SDA |
| Taxis before / after | ${report.purchase.taxisBefore} / ${report.purchase.taxisAfter} |
| Level before / after | ${report.purchase.levelBefore} / ${report.purchase.levelAfter} |
| Upgrade / cost | \`${report.upgrade.upgradeId}\` / ${report.upgrade.costMinorUnits} SDA |
| Effect | ${report.upgrade.category} × ${report.upgrade.basisPoints} bp from ${report.upgrade.effectivePeriod} |
| Service month 0 → next month | ${report.upgrade.monthZeroServiceMinorUnits} → ${report.upgrade.nextMonthServiceMinorUnits} SDA |
| Next month revenue / profit | ${report.upgrade.nextMonthRevenueMinorUnits} / ${report.upgrade.nextMonthProfitMinorUnits} SDA |
| Pending effects before / after | ${report.upgrade.pendingBefore} / ${report.upgrade.pendingAfter} |

## Refuzuri

- fonduri insuficiente: \`${report.refusals.insufficientCashState}\` blocked=${report.refusals.insufficientCashBlocked} unchanged=${report.refusals.insufficientCashUnchanged} — ${report.refusals.insufficientCashReason}
- nivel insuficient: \`${report.refusals.levelRequiredState}\` — ${report.refusals.levelRequiredReason}
- upgrade duplicat: blocked=${report.refusals.duplicateBlocked} — ${report.refusals.duplicateUiReason}

## Cost UI

- elemente / noduri text: ${report.ui.elements} / ${report.ui.textNodes}
- listeneri / listeneri globali: ${report.ui.listeners} / ${report.ui.globalListeners}
- citiri închis: ${report.ui.closedReads}; citiri totale: ${report.ui.reads}
- randări: ${report.ui.renders}; bare: ${report.ui.bars}; rânduri de tabel: ${report.ui.tableRows}
- oferte / upgrade-uri: ${report.ui.offers} / ${report.ui.upgrades}
- Escape / Tab wraps / focus / restore: ${report.ui.escapes} / ${report.ui.tabWraps} / ${report.ui.focusMoves} / ${report.ui.focusRestores}

## Verificări

${checks}

**Rezultat:** ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.pass ? 'PASS' : 'FAIL'}.
`;
}
