import { createCompanyDashboard } from '../../src/ui';
import {
  COMPANY_OFFER,
  COMPANY_UPGRADE,
  createCompanyDashboardScenario,
} from './company-dashboard-fixture';

/**
 * PBI 270 browser fixture: the real 268 ledger, the real 269 evolution and the real 270 panel in a
 * real Chrome page. The probe clicks the same native controls the shell host mounts, buys a real
 * vehicle, buys the real service upgrade, advances to the next simulated month and checks that the
 * next month's service cost and profit reflect the versioned modifier.
 */
const host = document.querySelector<HTMLDivElement>('#company-host');
const trigger = document.querySelector<HTMLButtonElement>('#company-trigger');
if (host === null || trigger === null) throw new Error('Company dashboard fixture host is missing');

const scenario = createCompanyDashboardScenario(),
  surface = { open: false };
const panel = createCompanyDashboard(host, {
  read: () => scenario.read(),
  purchase: (offerId) => scenario.purchase(offerId),
  upgrade: (upgradeId) => scenario.upgrade(upgradeId),
  setSurface: (open) => {
    surface.open = open;
    document.body.setAttribute('data-company-surface', open ? 'open' : 'closed');
  },
  onClose: () => trigger.focus(),
  now: () => performance.now(),
});
trigger.addEventListener('click', () => panel.open());

function snapshot() {
  const read = scenario.read(),
    view = panel.getView(),
    service = read.finance.month?.costByCategory.SERVICE ?? null,
    month = read.finance.month;
  return Object.freeze({
    ready: true,
    open: panel.isOpen(),
    surfaceOpen: surface.open,
    stats: panel.getStats(),
    view,
    tick: read.tick,
    cashMinorUnits: read.cash.cashMinorUnits,
    level: read.companyLevel.level,
    fleetTaxis: read.fleet.taxis,
    fleetValueMinorUnits: read.fleet.fleetValueMinorUnits,
    month:
      month === null
        ? null
        : {
            periodId: month.periodId,
            revenue: month.revenueMinorUnits,
            profit: month.profitMinorUnits,
            service,
          },
    serviceMonth0:
      read.finance.months.find((entry) => entry.periodId === 'm0000')?.costByCategory.SERVICE ??
      null,
    pendingEffects: read.pendingEffects,
    offers: read.offers.map((offer) => ({
      offerId: offer.offer.offerId,
      state: offer.state,
      costMinorUnits: offer.offer.costMinorUnits,
    })),
    upgrades: read.upgrades.map((upgrade) => ({
      upgradeId: upgrade.upgrade.upgradeId,
      state: upgrade.state,
      effective: upgrade.effective,
    })),
    historyScans: read.historyScans,
    xpWrites: read.counters.xpWrites,
    economyWrites: read.counters.economyWrites,
    profileWrites: read.counters.profileWrites,
  });
}

declare global {
  interface Window {
    __companyDashboardProbe?: Readonly<{
      ready: true;
      snapshot: () => ReturnType<typeof snapshot>;
      nextMonth: () => ReturnType<typeof snapshot>;
      offerId: string;
      upgradeId: string;
      dispose: () => void;
    }>;
  }
}

window.__companyDashboardProbe = Object.freeze({
  ready: true as const,
  snapshot,
  nextMonth(): ReturnType<typeof snapshot> {
    scenario.addNextMonthActivity();
    panel.refresh();
    return snapshot();
  },
  offerId: COMPANY_OFFER.offerId,
  upgradeId: COMPANY_UPGRADE.upgradeId,
  dispose(): void {
    panel.dispose();
    scenario.dispose();
  },
});
