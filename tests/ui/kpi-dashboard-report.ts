import { readCityDashboardSnapshot, readKpiHistory, readKpiImpact } from '../../src/app';
import {
  CITY_DASHBOARD_PANEL_VERSION,
  createCityDashboardPanel,
  projectKpiHistory,
} from '../../src/ui';
import { createCityDashboardWorld } from '../app/city-dashboard-world';
import { bothDown, revenueUpRatingDown } from '../economy/kpi-impact-fixture';
import { byKpiClass, createKpiDocument, createKpiHistoryScenario } from './kpi-history-fixture';
import { createKpiHistoryHarness } from './kpi-history-fixture';
import { simulateHud } from './kpi-impact-fixture';
import type { KpiElement } from './kpi-history-fixture';

export interface KpiDashboardReportCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export const KPI_DASHBOARD_REPORT_VERSION = '267-kpi-dashboard-report-v1' as const;

function check(name: string, pass: boolean, detail: string): KpiDashboardReportCheck {
  return Object.freeze({ name, pass, detail });
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Deterministic 267 transcript: the real 210 selection and popup, the real 214 consequence HUD and
 * the real 082/061/028/065 city dashboard. It measures reads, renders and history scans, not wall
 * time or GPU; the integrated browser gate remains 287.
 */
export function runKpiDashboardReport() {
  const scenario = createKpiHistoryScenario(),
    selection = readKpiHistory({ kpi: scenario.snapshot() }),
    view = projectKpiHistory(selection),
    statsBefore = scenario.kpi.getStats(),
    meanOfMeans =
      selection.months
        .filter((month) => month.averageRating !== null)
        .reduce(
          (total, month, _index, rows) => total + (month.averageRating ?? 0) / rows.length,
          0,
        ) || 0,
    monthTable = view.tables.find((table) => table.key === 'months'),
    dayTable = view.tables.find((table) => table.key === 'days'),
    distributionTable = view.tables.find((table) => table.key === 'distribution'),
    missing = selection.months[3],
    zero = selection.months[6],
    partial = selection.months[11];

  const harness = createKpiHistoryHarness({
      scenario,
      mode: 'MANUAL',
      selection: () => readKpiHistory({ kpi: scenario.snapshot() }),
    }),
    closedRefresh = harness.panel.refresh(),
    closedStats = harness.panel.getStats(),
    trigger = harness.trigger(),
    dialog = harness.dialog(),
    close = byKpiClass(dialog, 'kpi-history__close')[0]!,
    body = byKpiClass(dialog, 'kpi-history__body')[0]!;
  trigger.focus();
  trigger.send('click');
  const openedFocus = harness.document.activeElement === close,
    openedStats = harness.panel.getStats(),
    readsAfterOpen = harness.reads();
  dialog.send('keydown', { key: 'Tab' });
  const tabMoved = harness.document.activeElement === body;
  dialog.send('keydown', { key: 'Tab', shiftKey: true });
  const shiftTabMoved = harness.document.activeElement === close;
  harness.closeByEscape();
  const escapeStats = harness.panel.getStats(),
    focusRestored = harness.document.activeElement === trigger,
    dialogs = dialog.getAttribute('role');
  const readsAfterClose = harness.reads(),
    statsAfter = scenario.kpi.getStats();

  const beforeImpact = readKpiImpact({
      kpi: revenueUpRatingDown().snapshot(),
      sessionId: 'session:267',
      worldEpoch: 1,
      namespace: 'city:economy',
      controlMode: 'AUTO',
      lastReview: null,
    }),
    afterImpact = readKpiImpact({
      kpi: bothDown().snapshot(),
      sessionId: 'session:267',
      worldEpoch: 1,
      namespace: 'city:economy',
      controlMode: 'AUTO',
      lastReview: null,
    }),
    hud = simulateHud({ frames: 600, changeAt: 300, before: beforeImpact, after: afterImpact });

  const cityWorld = createCityDashboardWorld(),
    citySnapshot = readCityDashboardSnapshot(
      {
        context: cityWorld.context,
        lifecycle: cityWorld.health.scenario.lifecycle,
        health: cityWorld.health.scenario.health,
        collisions: cityWorld.collisionLog,
        positions: cityWorld.positions,
      },
      { tick: cityWorld.health.tick + 100, selectedIncidentId: null },
    ),
    cityDocument = createKpiDocument(),
    cityHost = cityDocument.createElement('div');
  let cityReads = 0;
  const cityPanel = createCityDashboardPanel(cityHost as unknown as HTMLElement, {
    read: () => {
      cityReads += 1;
      return citySnapshot;
    },
    now: () => 1_000,
  });
  cityPanel.open();
  const cityRoot = cityPanel.getElement() as unknown as KpiElement,
    cityCards = byKpiClass(cityRoot, 'city-dashboard__metric'),
    cityStats = cityPanel.getStats(),
    cityRenders = cityStats.dashboard.renders;
  cityRoot.send('keydown', { key: 'Escape' });
  const cityEscaped = !cityPanel.isOpen(),
    cityClosedReads = cityReads;
  cityPanel.update(2_000);
  const cityClosedNoReads = cityReads === cityClosedReads;
  cityPanel.dispose();
  cityWorld.dispose();

  const checks: KpiDashboardReportCheck[] = [
    check(
      'twelve-month-window',
      selection.months.length === 12 && monthTable?.rows.length === 12,
      `${selection.months.length} luni în selecție, ${monthTable?.rows.length ?? 0} rânduri în tabel`,
    ),
    check(
      'partial-month-projection',
      partial?.state === 'PARTIAL' &&
        selection.projection.status === 'PROJECTED' &&
        selection.projection.minimumTerminalRides === 10 &&
        selection.projection.minimumExposureSeconds === 300,
      `${partial?.periodId} PARTIAL, proiecție ${selection.projection.status}, praguri ${selection.projection.minimumTerminalRides}/${selection.projection.minimumExposureSeconds}`,
    ),
    check(
      'no-data-is-not-zero',
      missing?.state === 'NO_DATA' &&
        missing.revenueMinorUnits === null &&
        missing.averageRating === null &&
        zero?.state === 'COMPLETE' &&
        zero.revenueMinorUnits === 0 &&
        zero.terminalRides === 30,
      `luna 3 ${missing?.state} null, luna 6 ${zero?.state} revenue ${zero?.revenueMinorUnits} cu ${zero?.terminalRides} curse`,
    ),
    check(
      'weighted-rating-not-mean-of-means',
      selection.totals.averageRating === round(725 / scenario.reviews) &&
        Math.abs(meanOfMeans - (selection.totals.averageRating ?? 0)) > 0.01,
      `ponderat ${selection.totals.averageRating}, media mediilor ${round(meanOfMeans)}`,
    ),
    check(
      'daily-points-and-distribution',
      dayTable?.rows.length === selection.daily.visualPoints &&
        selection.daily.exactPoints === 310 &&
        distributionTable?.rows.length === 6 &&
        [...selection.distribution.counts].join('/') === '49/45/45/45/45/55',
      `${selection.daily.exactPoints} zile exacte → ${selection.daily.visualPoints} puncte, distribuție ${selection.distribution.counts.join('/')}`,
    ),
    check(
      'closed-popup-reads-nothing',
      closedRefresh === 'SKIPPED_CLOSED' && closedStats.reads === 0 && closedStats.renders === 0,
      `${closedRefresh}, citiri ${closedStats.reads}, randări ${closedStats.renders}`,
    ),
    check(
      'open-reads-once-and-focuses',
      readsAfterOpen === 1 && openedFocus && openedStats.opens === 1 && dialogs === 'dialog',
      `${readsAfterOpen} citire, focus ${openedFocus ? 'în dialog' : 'ratat'}, rol ${dialogs}`,
    ),
    check(
      'tab-and-escape',
      tabMoved && shiftTabMoved && escapeStats.escapes === 1 && focusRestored,
      `Tab ${tabMoved}, Shift+Tab ${shiftTabMoved}, Escape ${escapeStats.escapes}, focus restaurat ${focusRestored}`,
    ),
    check(
      'closed-after-escape-reads-nothing',
      readsAfterClose === readsAfterOpen && escapeStats.closes === 1,
      `${readsAfterClose} citiri după închidere, ${escapeStats.closes} închideri`,
    ),
    check(
      'history-scans-stay-zero',
      statsBefore.historyScans === 0 &&
        statsAfter.historyScans === 0 &&
        statsAfter.settlements === statsBefore.settlements &&
        statsAfter.reviews === statsBefore.reviews,
      `historyScans ${statsBefore.historyScans}/${statsAfter.historyScans}, settle ${statsBefore.settlements}→${statsAfter.settlements}, review ${statsBefore.reviews}→${statsAfter.reviews}`,
    ),
    check(
      'impact-three-planes-no-xp',
      beforeImpact.service.historyScans === 0 &&
        beforeImpact.service.xp.debits === 0 &&
        beforeImpact.service.xp.credits === 0 &&
        beforeImpact.mission.state === 'NONE' &&
        beforeImpact.mission.xpGranted === 0,
      `serviciu ${beforeImpact.service.state}, XP ${beforeImpact.service.xp.debits}/${beforeImpact.service.xp.credits}, misiune ${beforeImpact.mission.state}`,
    ),
    check(
      'impact-hud-10hz',
      hud.stats.ticks === 600 &&
        hud.stats.reads === 100 &&
        hud.stats.renders === 2 &&
        hud.stats.planeUpdates === 4 &&
        hud.stats.globalListeners === 0 &&
        hud.stats.historyRebuilds === 0,
      `${hud.stats.ticks} tick-uri → ${hud.stats.reads} citiri, ${hud.stats.renders} randări, ${hud.stats.planeUpdates} scrieri`,
    ),
    check(
      'city-seven-indicators',
      cityCards.length === 7 && cityStats.dashboard.rows === 2 && cityRenders === 1,
      `${cityCards.length} indicatori, ${cityStats.dashboard.rows} incidente, ${cityReads} citiri`,
    ),
    check(
      'city-real-incidents',
      citySnapshot.incidents.length === 2 &&
        citySnapshot.incidents.some((incident) => incident.kind === 'COLLISION') &&
        citySnapshot.incidents.some((incident) => incident.kind === 'BLOCKAGE'),
      citySnapshot.incidents
        .map((incident) => `${incident.kind}:${incident.incidentId}`)
        .join(', '),
    ),
    check(
      'city-panel-escape-and-closed-read',
      cityEscaped &&
        cityClosedNoReads &&
        CITY_DASHBOARD_PANEL_VERSION === '267-city-dashboard-panel-v1',
      `Escape ${cityEscaped}, citire când închis ${cityClosedNoReads ? 'absentă' : 'prezentă'}`,
    ),
  ];
  const passed = checks.filter((entry) => entry.pass).length;

  return Object.freeze({
    version: KPI_DASHBOARD_REPORT_VERSION,
    generatedFrom: 'real 209/210/214/082 fixtures and the delivered UI adapters',
    kpi: Object.freeze({
      tick: selection.tick,
      months: selection.months.length,
      monthsWithData: selection.totals.monthsWithData,
      monthsWithoutData: selection.totals.monthsWithoutData,
      partialMonths: selection.totals.partialMonths,
      revenueMinorUnits: selection.totals.revenueMinorUnits,
      reviewCount: selection.totals.reviewCount,
      averageRating: selection.totals.averageRating,
      meanOfMonthlyMeans: round(meanOfMeans),
      distribution: selection.distribution.counts,
      exactPoints: selection.daily.exactPoints,
      visualPoints: selection.daily.visualPoints,
      projection: selection.projection.status,
      popupReads: escapeStats.reads,
      popupRenders: escapeStats.renders,
      historyScans: statsAfter.historyScans,
    }),
    impact: Object.freeze({
      serviceState: beforeImpact.service.state,
      revenueDirection: beforeImpact.service.delta.revenueDirection,
      ratingDirection: beforeImpact.service.delta.ratingDirection,
      hudTicks: hud.stats.ticks,
      hudReads: hud.stats.reads,
      hudRenders: hud.stats.renders,
      hudPlaneUpdates: hud.stats.planeUpdates,
      xp: beforeImpact.service.xp,
    }),
    city: Object.freeze({
      metrics: citySnapshot.metrics.map((metric) => ({
        id: metric.id,
        state: metric.state,
        value: metric.value,
      })),
      incidents: citySnapshot.incidents.map((incident) => ({
        incidentId: incident.incidentId,
        kind: incident.kind,
        tick: incident.tick,
      })),
      reads: cityReads,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

export type KpiDashboardReport = ReturnType<typeof runKpiDashboardReport>;

export function kpiDashboardReportMarkdown(report: KpiDashboardReport): string {
  const rows = report.checks
    .map(
      (entry) =>
        `| ${entry.pass ? 'PASS' : 'FAIL'} | \`${entry.name}\` | ${entry.detail.replaceAll('|', '\\|')} |`,
    )
    .join('\n');
  return `# 267 — KPI, city dashboard și consecințe

Generat determinist de \`npm run kpi:dashboard\` peste read model-urile reale 209/210/214 și
compoziția reală 082/061/028/065. Nu măsoară timp de perete, FPS sau GPU.

| Rezultat | Verificare | Detaliu |
| --- | --- | --- |
${rows}

Rezumat: ${report.summary.passed}/${report.summary.checks} verificări, overall ${report.summary.pass ? 'PASS' : 'FAIL'}.

- KPI: ${report.kpi.months} luni (${report.kpi.monthsWithoutData} fără date), venit
  ${report.kpi.revenueMinorUnits} SDA, ${report.kpi.reviewCount} review-uri, medie ponderată
  ${report.kpi.averageRating} față de ${report.kpi.meanOfMonthlyMeans} media mediilor, distribuție
  ${report.kpi.distribution.join('/')}; ${report.kpi.exactPoints} zile exacte → ${report.kpi.visualPoints}
  puncte; proiecție ${report.kpi.projection}; popup ${report.kpi.popupReads} citiri /
  ${report.kpi.popupRenders} randări; \`historyScans\` ${report.kpi.historyScans}.
- Impact: ${report.impact.hudTicks} tick-uri → ${report.impact.hudReads} citiri,
  ${report.impact.hudRenders} randări, ${report.impact.hudPlaneUpdates} scrieri; XP
  ${report.impact.xp.debits}/${report.impact.xp.credits}.
- Oraș: ${report.city.metrics.filter((metric) => metric.state === 'AVAILABLE').length}/7 indicatori
  disponibili, ${report.city.incidents.length} incidente reale, ${report.city.reads} citiri ale
  panoului.
`;
}
