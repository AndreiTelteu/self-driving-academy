import { readCityDashboardSnapshot, readKpiHistory, readKpiImpact } from '../../src/app';
import {
  createCityDashboardPanel,
  createKpiHistoryPanel,
  createKpiImpactHud,
  type KpiImpactSnapshot,
} from '../../src/ui';
import { createCityDashboardWorld } from '../app/city-dashboard-world';
import { bothDown, revenueUpRatingDown } from '../economy/kpi-impact-fixture';
import { createKpiHistoryScenario } from './kpi-history-fixture';

/**
 * PBI 267 browser fixture.
 *
 * The page mounts the real 210 popup over the real 209 buckets, the real 082 city dashboard over the
 * real 061/028/065 world, and the real 214 consequence HUD. Every number is produced by the delivered
 * modules; the page only clicks the same native controls the live shell mounts.
 */
const scenario = createKpiHistoryScenario(),
  kpiHost = document.querySelector<HTMLDivElement>('#kpi-host'),
  kpiTrigger = document.querySelector<HTMLButtonElement>('#kpi-trigger'),
  cityHost = document.querySelector<HTMLDivElement>('#city-host'),
  cityTrigger = document.querySelector<HTMLButtonElement>('#city-trigger'),
  impactHost = document.querySelector<HTMLDivElement>('#impact-host'),
  impactButton = document.querySelector<HTMLButtonElement>('#impact-run');
if (
  kpiHost === null ||
  kpiTrigger === null ||
  cityHost === null ||
  cityTrigger === null ||
  impactHost === null ||
  impactButton === null
)
  throw new Error('KPI dashboard fixture hosts are missing');

const surface = { panel: false, city: false };
let kpiReads = 0,
  cityReads = 0;
const kpiPanel = createKpiHistoryPanel(kpiHost, {
  read: () => {
    kpiReads += 1;
    return readKpiHistory({ kpi: scenario.snapshot() });
  },
  setSurface: (open) => {
    surface.panel = open;
    document.body.setAttribute('data-kpi-surface', open ? 'open' : 'closed');
  },
});
kpiPanel.getTrigger().hidden = true;
kpiTrigger.addEventListener('click', () => kpiPanel.open());

const cityWorld = createCityDashboardWorld(),
  cityPanel = createCityDashboardPanel(cityHost, {
    read: () => {
      cityReads += 1;
      return readCityDashboardSnapshot(
        {
          context: cityWorld.context,
          lifecycle: cityWorld.health.scenario.lifecycle,
          health: cityWorld.health.scenario.health,
          collisions: cityWorld.collisionLog,
          positions: cityWorld.positions,
        },
        { tick: cityWorld.health.tick + 100, selectedIncidentId: null },
      );
    },
    setSurface: (open) => {
      surface.city = open;
      document.body.setAttribute('data-city-surface', open ? 'open' : 'closed');
    },
    now: () => performance.now(),
  });
cityTrigger.addEventListener('click', () => cityPanel.open());

const beforeImpact = readKpiImpact({
    kpi: revenueUpRatingDown().snapshot(),
    sessionId: 'session:267-browser',
    worldEpoch: 1,
    namespace: 'city:economy',
    controlMode: 'AUTO',
    lastReview: null,
  }),
  afterImpact = readKpiImpact({
    kpi: bothDown().snapshot(),
    sessionId: 'session:267-browser',
    worldEpoch: 1,
    namespace: 'city:economy',
    controlMode: 'AUTO',
    lastReview: null,
  });
let currentImpact: KpiImpactSnapshot = beforeImpact;
const impactHud = createKpiImpactHud(impactHost, { read: () => currentImpact });
function runImpact(): ReturnType<typeof impactHud.getStats> {
  for (let tick = 0; tick < 600; tick += 1) {
    if (tick === 300) currentImpact = afterImpact;
    impactHud.update(tick);
  }
  return impactHud.getStats();
}
impactButton.addEventListener('click', () => {
  runImpact();
});

function snapshot() {
  const view = kpiPanel.getView(),
    missing = view?.months.find((month) => month.key === 'm0003') ?? null,
    zero = view?.months.find((month) => month.key === 'm0006') ?? null;
  return Object.freeze({
    ready: true,
    kpi: {
      open: kpiPanel.isOpen(),
      reads: kpiPanel.getStats().reads,
      renders: kpiPanel.getStats().renders,
      skippedClosed: kpiPanel.getStats().skippedClosed,
      historyScans: kpiPanel.getStats().lastHistoryScans,
      months: view?.months.length ?? 0,
      missing:
        missing === null
          ? null
          : {
              state: missing.state,
              revenueLabel: missing.revenueLabel,
              averageLabel: missing.averageLabel,
            },
      zero:
        zero === null
          ? null
          : { state: zero.state, revenueLabel: zero.revenueLabel, ridesLabel: zero.ridesLabel },
      triggerHidden: kpiPanel.getTrigger().hidden,
      focusRestores: kpiPanel.getStats().focusRestores,
    },
    city: {
      open: cityPanel.isOpen(),
      reads: cityPanel.getStats().reads,
      renders: cityPanel.getStats().renders,
      metrics: cityPanel.getStats().dashboard.metrics,
      rows: cityPanel.getStats().dashboard.rows,
      focusRestores: cityPanel.getStats().focusRestores,
    },
    impact: impactHud.getStats(),
    surfaces: { ...surface },
    dom: {
      kpiMonthRows: kpiHost!.querySelectorAll('.kpi-history__table[data-table="months"] tbody tr')
        .length,
      cityCards: cityHost!.querySelectorAll('.city-dashboard__metric').length,
      cityRows: cityHost!.querySelectorAll('.city-dashboard__incident-row').length,
    },
  });
}

declare global {
  interface Window {
    __kpiDashboardProbe?: Readonly<{
      ready: true;
      snapshot: () => ReturnType<typeof snapshot>;
      runImpact: () => ReturnType<typeof impactHud.getStats>;
      dispose: () => void;
    }>;
  }
}

window.__kpiDashboardProbe = Object.freeze({
  ready: true as const,
  snapshot,
  runImpact,
  dispose(): void {
    kpiPanel.dispose();
    cityPanel.dispose();
    impactHud.dispose();
    cityWorld.dispose();
  },
});
