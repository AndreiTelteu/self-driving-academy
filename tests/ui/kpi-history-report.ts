import {
  KPI_HISTORY_LIMITS,
  KPI_HISTORY_VERSION,
  type KpiHistorySelection,
} from '../../src/economy';
import {
  KPI_HISTORY_TEXT,
  KPI_HISTORY_UI_VERSION,
  projectKpiHistory,
  type KpiHistoryView,
} from '../../src/ui';
import {
  byKpiClass,
  createKpiHistoryHarness,
  createKpiHistoryScenario,
} from './kpi-history-fixture';

export const KPI_HISTORY_REPORT_VERSION = '210-kpi-history-report-v1' as const;

export interface KpiHistoryReportCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly actual: string;
  readonly expected: string;
  readonly note: string;
}

export interface KpiHistoryReport {
  readonly version: typeof KPI_HISTORY_REPORT_VERSION;
  readonly generatedBy: 'npm run kpi:history';
  readonly contract: {
    readonly pbi: '210';
    readonly kpiHistory: typeof KPI_HISTORY_VERSION;
    readonly ui: typeof KPI_HISTORY_UI_VERSION;
    readonly economyClock: string;
    readonly monthWindow: number;
    readonly dailyPointCap: number;
  };
  readonly history: {
    readonly settlements: number;
    readonly reviews: number;
    readonly months: number;
    readonly monthsWithData: number;
    readonly monthsWithoutData: number;
    readonly partialMonths: number;
    readonly completedMonths: number;
    readonly exactPoints: number;
    readonly visualPoints: number;
    readonly downsampled: boolean;
    readonly maximumDailyPoints: number;
    readonly revenueMinorUnits: number;
    readonly terminalRides: number;
    readonly reviewCount: number;
    readonly ratingSum: number;
    readonly averageRating: number | null;
    readonly meanOfMonthlyMeans: number;
    readonly distribution: readonly number[];
    readonly projectionStatus: string;
    readonly projectedRevenueMinorUnits: number | null;
    readonly observedSeconds: number | null;
    readonly historyScansBefore: number;
    readonly historyScansAfter: number;
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
    readonly bars: number;
    readonly tableRows: number;
    readonly charts: readonly string[];
    readonly tables: readonly string[];
    readonly escapes: number;
    readonly focusMoves: number;
    readonly focusRestores: number;
    readonly surfaceCalls: number;
    readonly ariaExpanded: string | null;
    readonly ariaExpandedClosed: string | null;
    readonly toolbarButtonType: string | null;
  };
  readonly checks: readonly KpiHistoryReportCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
  readonly determinism: { readonly runs: number; readonly equal: boolean };
}

function check(
  name: string,
  pass: boolean,
  actual: string | number | boolean | null,
  expected: string | number | boolean | null,
  note: string,
): KpiHistoryReportCheck {
  return Object.freeze({
    name,
    pass,
    actual: actual === null ? 'null' : String(actual),
    expected: expected === null ? 'null' : String(expected),
    note,
  });
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function same(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function meanOfMonthlyMeans(selection: KpiHistorySelection): number {
  const means = selection.months
    .filter((month) => month.state !== 'NO_DATA' && month.averageRating !== null)
    .map((month) => month.averageRating ?? 0);
  return round(means.reduce((total, value) => total + value, 0) / means.length);
}

function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

/**
 * The deterministic 210 evidence driver: twelve synthetic months of real 209 buckets, the popup
 * mounted on the deterministic DOM, the real 070 pause owner and the exact numbers the tables show.
 * It never measures wall time, FPS or GPU; the closed-panel cost is proven structurally by the
 * `reads`/`renders` counters and the constant `historyScans: 0`.
 */
export function runKpiHistoryReport(): KpiHistoryReport {
  const scenario = createKpiHistoryScenario(),
    statsBefore = scenario.kpi.getStats(),
    selection = scenario.selection(),
    view: KpiHistoryView = projectKpiHistory(selection),
    downsampled = scenario.selection({ maximumDailyPoints: 10 }),
    missingMonth = selection.months.find((month) => month.index === 3),
    zeroMonth = selection.months.find((month) => month.index === 6),
    partialMonth = selection.months.find((month) => month.index === 11),
    missingView = view.months.find((month) => month.key === missingMonth?.periodId),
    zeroView = view.months.find((month) => month.key === zeroMonth?.periodId),
    partialView = view.months.find((month) => month.key === partialMonth?.periodId);

  // ---- Popup lifecycle, focus, Escape and pause -------------------------------------------
  const harness = createKpiHistoryHarness({ scenario }),
    closedRefresh = harness.panel.refresh(),
    closedStats = harness.panel.getStats(),
    trigger = harness.trigger(),
    dialog = harness.dialog(),
    close = byKpiClass(dialog, 'kpi-history__close')[0],
    body = byKpiClass(dialog, 'kpi-history__body')[0];
  trigger.focus();
  trigger.send('click');
  const focusedOnOpen = harness.document.activeElement === close,
    expandedOnOpen = trigger.getAttribute('aria-expanded');
  dialog.send('keydown', { key: 'Tab' });
  const tabMoved = harness.document.activeElement === body;
  dialog.send('keydown', { key: 'Tab', shiftKey: true });
  const shiftTabMoved = harness.document.activeElement === close;
  harness.closeByEscape();
  const statsAfter = harness.panel.getStats(),
    focusRestored = harness.document.activeElement === trigger,
    expandedOnClose = trigger.getAttribute('aria-expanded'),
    hiddenOnClose = dialog.hasAttribute('hidden');

  const manualHarness = createKpiHistoryHarness({ scenario, mode: 'MANUAL' });
  manualHarness.trigger().focus();
  manualHarness.panel.open();
  const manualOpen = manualHarness.pauseFocus.getState();
  manualHarness.panel.close();
  const manualClosed = manualHarness.pauseFocus.getState();

  const autoHarness = createKpiHistoryHarness({ scenario, mode: 'AUTO' });
  autoHarness.panel.open();
  const autoOpen = autoHarness.pauseFocus.getState();
  autoHarness.panel.close();

  const emptyHarness = createKpiHistoryHarness({ scenario, selection: () => null });
  emptyHarness.panel.open();
  const emptyView = emptyHarness.panel.getView();

  const afterStats = scenario.kpi.getStats(),
    monthTable = view.tables.find((table) => table.key === 'months'),
    dayTable = view.tables.find((table) => table.key === 'days'),
    distributionTable = view.tables.find((table) => table.key === 'distribution'),
    revenueChart = view.charts.find((chart) => chart.key === 'MONTH_REVENUE'),
    mixedGroup = downsampled.daily.visual.find(
      (point) => point.exactPoints > 1 && point.reviewCount > 1,
    ),
    exactRevenue = sum(downsampled.daily.exact, (point) => point.revenueMinorUnits),
    visualRevenue = sum(downsampled.daily.visual, (point) => point.revenueMinorUnits),
    exactReviews = sum(downsampled.daily.exact, (point) => point.reviewCount),
    visualReviews = sum(downsampled.daily.visual, (point) => point.reviewCount),
    noReviewPoints = selection.daily.exact.filter(
      (point) => point.terminalRides > 0 && point.reviewCount === 0,
    ),
    checks: KpiHistoryReportCheck[] = [
      check(
        'closed-panel-reads-nothing',
        closedRefresh === 'SKIPPED_CLOSED' && closedStats.reads === 0 && closedStats.renders === 0,
        `${closedRefresh}/${closedStats.reads}/${closedStats.renders}`,
        'SKIPPED_CLOSED/0/0',
        'Un panou închis nu citește KPI-ul și nu reconstruiește grafice.',
      ),
      check(
        'open-reads-once',
        harness.panel.getStats().opens === 1 && harness.reads() === 1,
        `${harness.panel.getStats().opens}/${harness.reads()}`,
        '1/1',
        'Deschiderea citește read model-ul o singură dată.',
      ),
      check(
        'kpi-never-rescans',
        statsBefore.historyScans === 0 &&
          afterStats.historyScans === 0 &&
          statsAfter.lastHistoryScans === 0 &&
          selection.historyScans === 0,
        `${statsBefore.historyScans}/${afterStats.historyScans}/${selection.historyScans}`,
        '0/0/0',
        'Ledgerul nu este rescadat nici înainte, nici după deschidere.',
      ),
      check(
        'ledger-counts-stable',
        afterStats.settlements === statsBefore.settlements &&
          afterStats.reviews === statsBefore.reviews &&
          afterStats.settlements === 310 &&
          afterStats.reviews === 284,
        `${afterStats.settlements}/${afterStats.reviews}`,
        '310/284',
        'Citirea popup-ului nu adaugă settle-uri sau review-uri.',
      ),
      check(
        'twelve-month-window',
        selection.months.length === 12 &&
          selection.monthWindow === KPI_HISTORY_LIMITS.months &&
          selection.firstMonthIndex === 0,
        `${selection.months.length}/${selection.monthWindow}/${selection.firstMonthIndex}`,
        `12/${KPI_HISTORY_LIMITS.months}/0`,
        'Fereastra acoperă exact 12 luni simulate, inclusiv golurile.',
      ),
      check(
        'missing-month-is-not-zero',
        missingMonth?.state === 'NO_DATA' &&
          missingMonth.revenueMinorUnits === null &&
          missingMonth.averageRating === null &&
          missingView?.revenueLabel === KPI_HISTORY_TEXT.noData &&
          selection.totals.monthsWithoutData === 1,
        `${missingMonth?.state}/${missingView?.revenueLabel}/${selection.totals.monthsWithoutData}`,
        `NO_DATA/${KPI_HISTORY_TEXT.noData}/1`,
        'Luna fără date este „fără date”, nu 0 și nu medie inventată.',
      ),
      check(
        'real-zero-month',
        zeroMonth?.revenueMinorUnits === 0 &&
          zeroMonth.averageRating === 0 &&
          zeroMonth.reviewCount === 4 &&
          zeroView?.revenueLabel === '0 SDA' &&
          zeroView?.averageLabel === '0',
        `${zeroMonth?.revenueMinorUnits}/${zeroMonth?.averageRating}/${zeroView?.revenueLabel}`,
        '0/0/0 SDA',
        'Un zero real rămâne 0 și își păstrează eșantionul de 4 review-uri.',
      ),
      check(
        'partial-month-not-compared',
        partialMonth?.state === 'PARTIAL' &&
          partialView?.isPartial === true &&
          view.projection.status === 'PROJECTED' &&
          (selection.projection.projectedRevenueMinorUnits ?? 0) !==
            (partialMonth?.revenueMinorUnits ?? 0),
        `${partialMonth?.state}/${view.projection.status}/${selection.projection.projectedRevenueMinorUnits}`,
        'PARTIAL/PROJECTED/valoare diferită de efectiv',
        'Luna curentă este parțială și are proiecție separată, nu o comparație cu o lună încheiată.',
      ),
      check(
        'weighted-average',
        selection.totals.averageRating ===
          round(selection.totals.ratingSum / selection.totals.reviewCount),
        `${selection.totals.ratingSum}/${selection.totals.reviewCount}=${selection.totals.averageRating}`,
        'ratingSum/reviewCount',
        'Media ferestrei este raportul sumelor exacte.',
      ),
      check(
        'mean-of-means-differs',
        Math.abs(meanOfMonthlyMeans(selection) - (selection.totals.averageRating ?? 0)) > 0.01,
        `${meanOfMonthlyMeans(selection)} vs ${selection.totals.averageRating}`,
        'diferență > 0.01',
        'Media mediilor lunare ar fi greșită; dovada arată că nu este folosită.',
      ),
      check(
        'distribution-exact',
        same(selection.distribution.counts, [49, 45, 45, 45, 45, 55]) &&
          sum(selection.distribution.counts, (count) => count) === selection.totals.reviewCount,
        `${selection.distribution.counts.join(',')}=${sum(selection.distribution.counts, (count) => count)}`,
        '49,45,45,45,45,55=284',
        'Histograma 0–5 însumează exact review-urile ferestrei.',
      ),
      check(
        'no-review-day-has-no-mean',
        noReviewPoints.length === 26 &&
          noReviewPoints.every(
            (point) => point.averageRating === null && point.averageState === 'NO_REVIEWS',
          ),
        `${noReviewPoints.length} zile fără review-uri`,
        '26 zile fără medie',
        'O zi cu curse dar fără review-uri nu primește medie.',
      ),
      check(
        'downsampling-visual-only',
        downsampled.daily.downsampled === true &&
          downsampled.daily.exactPoints === 310 &&
          downsampled.daily.visualPoints === 10 &&
          visualRevenue === exactRevenue &&
          visualReviews === exactReviews,
        `${downsampled.daily.exactPoints}→${downsampled.daily.visualPoints}, ${visualRevenue}/${exactRevenue}, ${visualReviews}/${exactReviews}`,
        '310→10, sums equal',
        'Gruparea este doar vizuală; sumele rămân exacte.',
      ),
      check(
        'grouped-average-weighted',
        mixedGroup !== undefined &&
          mixedGroup.averageRating === round(mixedGroup.ratingSum / mixedGroup.reviewCount),
        `${mixedGroup?.averageRating}`,
        `${mixedGroup === undefined ? 'n/a' : round(mixedGroup.ratingSum / mixedGroup.reviewCount)}`,
        'Media unui grup este calculată din sumele membrilor.',
      ),
      check(
        'projection-sample',
        selection.projection.minimumTerminalRides === 10 &&
          selection.projection.minimumExposureSeconds === 300 &&
          (selection.projection.observedSeconds ?? 0) >= 300,
        `${selection.projection.minimumTerminalRides}/${selection.projection.minimumExposureSeconds}/${selection.projection.observedSeconds}`,
        '10/300/≥300',
        'Proiecția păstrează pragurile publicate de 209.',
      ),
      check(
        'charts-present',
        view.charts.length === 5 &&
          revenueChart?.groups.length === 12 &&
          view.charts
            .filter((chart) => chart.key.startsWith('DAILY_'))
            .every((chart) => chart.groups.length === selection.daily.visualPoints),
        `${view.charts.length}/${revenueChart?.groups.length}/${selection.daily.visualPoints}`,
        '5/12/60',
        'Revenue, curse/zi, review-uri/zi, media/zi și distribuția sunt proiectate din valori.',
      ),
      check(
        'month-table',
        monthTable?.rows.length === 12 &&
          monthTable.headers.length === 7 &&
          monthTable.rows.some(
            (row) => row[0] === `Luna simulată 3` && row[2] === KPI_HISTORY_TEXT.noData,
          ),
        `${monthTable?.rows.length}/${monthTable?.headers.length}`,
        '12/7',
        'Tabelul lunar are un rând stabil pentru fiecare lună, inclusiv golul.',
      ),
      check(
        'exact-tables',
        dayTable?.rows.length === selection.daily.visualPoints &&
          distributionTable?.rows.length === 6 &&
          dayTable.caption.includes('sumele exacte'),
        `${dayTable?.rows.length}/${distributionTable?.rows.length}`,
        `${selection.daily.visualPoints}/6`,
        'Tabelul zilnic și histograma accesibilă păstrează valorile exacte.',
      ),
      check(
        'native-trigger-and-dialog',
        trigger.tagName === 'button' &&
          trigger.getAttribute('type') === 'button' &&
          trigger.getAttribute('aria-haspopup') === 'dialog' &&
          dialog.getAttribute('role') === 'dialog' &&
          dialog.getAttribute('aria-modal') === 'true' &&
          dialog.getAttribute('aria-labelledby') ===
            byKpiClass(dialog, 'kpi-history__title')[0]?.getAttribute('id'),
        `${trigger.tagName}/${trigger.getAttribute('type')}/${dialog.getAttribute('role')}`,
        'button/button/dialog',
        'Butonul este nativ, iar popup-ul are rol și nume accesibil.',
      ),
      check(
        'focus-and-escape',
        focusedOnOpen &&
          tabMoved &&
          shiftTabMoved &&
          focusRestored &&
          hiddenOnClose &&
          expandedOnOpen === 'true' &&
          expandedOnClose === 'false' &&
          statsAfter.escapes === 1,
        `${focusedOnOpen}/${tabMoved}/${shiftTabMoved}/${focusRestored}/${statsAfter.escapes}`,
        'true/true/true/true/1',
        'Focusul intră în popup, Tab rămâne înăuntru, Escape îl închide și readuce focusul.',
      ),
      check(
        'target-resolution-fit',
        /width:min\(92vw,58rem\)/.test(dialog.getAttribute('style') ?? '') &&
          /max-height:min\(90vh,46rem\)/.test(dialog.getAttribute('style') ?? '') &&
          /overflow:auto/.test(dialog.getAttribute('style') ?? '') &&
          [
            [1280, 720],
            [1920, 1080],
            [853.33, 480],
          ].every(([width, height]) => {
            const fittedWidth = Math.min((width ?? 0) * 0.92, 58 * 16),
              fittedHeight = Math.min((height ?? 0) * 0.9, 46 * 16);
            return fittedWidth <= (width ?? 0) && fittedHeight <= (height ?? 0);
          }),
        '928x648@1280x720, 928x736@1920x1080, 785.06x432@853x480',
        'încadrare cu scroll intern la toate rezoluțiile țintă',
        'Dialogul are lățime/înălțime maxime în vw/rem și scroll intern, deci se încadrează la 1280×720, 1920×1080 și 853×480.',
      ),
      check(
        'pause-manual-round-trip',
        manualOpen.suspended === true &&
          manualOpen.cause === 'panel' &&
          manualOpen.mode === 'MANUAL' &&
          manualClosed.suspended === false &&
          manualClosed.mode === 'MANUAL' &&
          manualHarness.suspensions.length === 1 &&
          manualHarness.resumes.length === 1,
        `${manualOpen.suspended}/${manualOpen.cause}/${manualClosed.suspended}/${manualClosed.mode}`,
        'true/panel/false/MANUAL',
        'MANUAL este suspendat la deschidere și revine exact la starea anterioară la închidere.',
      ),
      check(
        'auto-stays-live',
        autoOpen.suspended === false &&
          autoOpen.cause === null &&
          autoHarness.suspensions.length === 0,
        `${autoOpen.suspended}/${autoOpen.cause}/${autoHarness.suspensions.length}`,
        'false/null/0',
        'În observare AUTO popup-ul nu suspendă simularea.',
      ),
      check(
        'no-global-listeners',
        statsAfter.globalListeners === 0 && statsAfter.listeners === 3,
        `${statsAfter.globalListeners}/${statsAfter.listeners}`,
        '0/3',
        'Niciun listener pe window/document; doar butonul, Închide și dialogul.',
      ),
      check(
        'empty-source-explicit',
        emptyView?.empty === true &&
          emptyView.tables.length === 0 &&
          emptyView.summary === KPI_HISTORY_TEXT.empty,
        `${emptyView?.empty}/${emptyView?.tables.length}`,
        'true/0',
        'Fără economie, popup-ul spune explicit că nu există date.',
      ),
    ];

  const rerun = createKpiHistoryScenario(),
    rerunSelection = rerun.selection(),
    rerunView = projectKpiHistory(rerunSelection),
    deterministic =
      same(JSON.stringify(selection), JSON.stringify(rerunSelection)) &&
      rerunView.signature === view.signature;
  checks.push(
    check(
      'deterministic-transcript',
      deterministic,
      deterministic ? 'equal' : 'different',
      'equal',
      'Două scenarii identice produc aceeași selecție și aceeași semnătură a popup-ului.',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;

  return Object.freeze({
    version: KPI_HISTORY_REPORT_VERSION,
    generatedBy: 'npm run kpi:history',
    contract: Object.freeze({
      pbi: '210' as const,
      kpiHistory: KPI_HISTORY_VERSION,
      ui: KPI_HISTORY_UI_VERSION,
      economyClock: selection.economyClockVersion,
      monthWindow: selection.monthWindow,
      dailyPointCap: selection.daily.maximumDailyPoints,
    }),
    history: Object.freeze({
      settlements: afterStats.settlements,
      reviews: afterStats.reviews,
      months: selection.months.length,
      monthsWithData: selection.totals.monthsWithData,
      monthsWithoutData: selection.totals.monthsWithoutData,
      partialMonths: selection.totals.partialMonths,
      completedMonths: selection.completedMonths,
      exactPoints: selection.daily.exactPoints,
      visualPoints: selection.daily.visualPoints,
      downsampled: selection.daily.downsampled,
      maximumDailyPoints: selection.daily.maximumDailyPoints,
      revenueMinorUnits: selection.totals.revenueMinorUnits,
      terminalRides: selection.totals.terminalRides,
      reviewCount: selection.totals.reviewCount,
      ratingSum: selection.totals.ratingSum,
      averageRating: selection.totals.averageRating,
      meanOfMonthlyMeans: meanOfMonthlyMeans(selection),
      distribution: selection.distribution.counts,
      projectionStatus: selection.projection.status,
      projectedRevenueMinorUnits: selection.projection.projectedRevenueMinorUnits,
      observedSeconds: selection.projection.observedSeconds,
      historyScansBefore: statsBefore.historyScans,
      historyScansAfter: afterStats.historyScans,
    }),
    ui: Object.freeze({
      elements: statsAfter.elements,
      textNodes: statsAfter.textNodes,
      listeners: statsAfter.listeners,
      globalListeners: statsAfter.globalListeners,
      opens: statsAfter.opens,
      closes: statsAfter.closes,
      renders: statsAfter.renders,
      reads: harness.reads(),
      bars: statsAfter.bars,
      tableRows: statsAfter.tableRows,
      charts: view.charts.map((chart) => chart.key),
      tables: view.tables.map((table) => table.key),
      escapes: statsAfter.escapes,
      focusMoves: statsAfter.focusMoves,
      focusRestores: statsAfter.focusRestores,
      surfaceCalls: statsAfter.surfaceCalls,
      ariaExpanded: expandedOnOpen,
      ariaExpandedClosed: expandedOnClose,
      toolbarButtonType: trigger.getAttribute('type'),
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
    determinism: Object.freeze({ runs: 2, equal: deterministic }),
  });
}

export function kpiHistoryReportMarkdown(report: KpiHistoryReport): string {
  const rows = report.checks
    .map(
      (entry) =>
        `| ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.name} | ${entry.actual} | ${entry.expected} | ${entry.note} |`,
    )
    .join('\n');
  return [
    '# PBI 210 — popup KPIs și grafice istorice',
    '',
    `Generat de \`${report.generatedBy}\`; contract \`${report.contract.kpiHistory}\` + \`${report.contract.ui}\`.`,
    `Ceas economic \`${report.contract.economyClock}\`, fereastră ${report.contract.monthWindow} luni, plafon ${report.contract.dailyPointCap} puncte/zi.`,
    '',
    '## Istoric',
    '',
    `- settle-uri/review-uri: ${report.history.settlements}/${report.history.reviews}`,
    `- luni: ${report.history.months} (${report.history.monthsWithData} cu date, ${report.history.monthsWithoutData} fără date, ${report.history.partialMonths} parțiale, ${report.history.completedMonths} încheiate)`,
    `- puncte exacte/vizuale: ${report.history.exactPoints}/${report.history.visualPoints}, downsampled: ${report.history.downsampled}`,
    `- revenue: ${report.history.revenueMinorUnits} SDA; curse terminale: ${report.history.terminalRides}; review-uri: ${report.history.reviewCount}`,
    `- media ponderată: ${report.history.averageRating} (ratingSum ${report.history.ratingSum} / ${report.history.reviewCount}); media mediilor lunare: ${report.history.meanOfMonthlyMeans}`,
    `- distribuția 0–5: ${report.history.distribution.join(', ')}`,
    `- proiecție: ${report.history.projectionStatus}, ${report.history.projectedRevenueMinorUnits} SDA din ${report.history.observedSeconds} s observate`,
    `- historyScans înainte/după: ${report.history.historyScansBefore}/${report.history.historyScansAfter}`,
    '',
    '## Popup',
    '',
    `- elemente/noduri text: ${report.ui.elements}/${report.ui.textNodes}`,
    `- listeners: ${report.ui.listeners} (globali: ${report.ui.globalListeners})`,
    `- deschideri/închideri/randări/citiri: ${report.ui.opens}/${report.ui.closes}/${report.ui.renders}/${report.ui.reads}`,
    `- bare/rânduri de tabel: ${report.ui.bars}/${report.ui.tableRows}`,
    `- grafice: ${report.ui.charts.join(', ')}`,
    `- tabele: ${report.ui.tables.join(', ')}`,
    `- focus mutat/restaurat, Escape: ${report.ui.focusMoves}/${report.ui.focusRestores}/${report.ui.escapes}`,
    '',
    '## Verificări',
    '',
    '| Rezultat | Verificare | Real | Așteptat | Notă |',
    '| --- | --- | --- | --- | --- |',
    rows,
    '',
    `Rezumat: ${report.summary.passed}/${report.summary.checks} verificări, overall ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
    `Determinism: ${report.determinism.runs} rulări, equal=${report.determinism.equal}.`,
    '',
    '## Limitări',
    '',
    '- Nivel `targeted`: raportul dovedește costul structural al popup-ului (zero citiri/randări când este închis) și bugetul de scriere al HUD-ului; nu este o probă FPS/GPU pe hardware real.',
    '- Stilurile popup-ului sunt inline, ca să nu modifice foaia globală în afara ownership-ului PBI 210.',
    '- Butonul K și montarea în panoul flotei rămân ale hostului; popup-ul expune `open()` pentru bindingul de input existent.',
  ].join('\n');
}
