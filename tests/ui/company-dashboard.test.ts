import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameShell } from '../../src/app/game-shell';
import { createGameShellHost } from '../../src/ui/game-shell-host';
import {
  COMPANY_DASHBOARD_TEXT,
  COMPANY_DASHBOARD_UI_VERSION,
  projectCompanyDashboard,
} from '../../src/ui';
import { createHudDocument, type HudElement } from './hud-dom';
import {
  COMPANY_LOCKED_OFFER,
  COMPANY_OFFER,
  COMPANY_UPGRADE,
  byCompanyClass,
  createCompanyDashboardHarness,
  createCompanyDashboardScenario,
  createCompanyZeroProfitScenario,
} from './company-dashboard-fixture';

test('270 the panel projects revenue, costs, profit, cash, fleet value and company level', () => {
  const scenario = createCompanyDashboardScenario();
  try {
    const read = scenario.read(),
      view = projectCompanyDashboard(read),
      totals = read.finance.totals;
    assert.equal(view.version, COMPANY_DASHBOARD_UI_VERSION);
    assert.equal(view.empty, false);
    assert.equal(view.metrics.revenueMinorUnits, totals.revenueMinorUnits);
    assert.equal(view.metrics.costMinorUnits, totals.netCostMinorUnits);
    assert.equal(view.metrics.profitMinorUnits, totals.profitMinorUnits);
    assert.equal(view.metrics.cashMinorUnits, read.cash.cashMinorUnits);
    assert.equal(view.metrics.fleetValueMinorUnits, read.fleet.fleetValueMinorUnits);
    assert.equal(view.metrics.companyLevel, read.companyLevel.level);
    assert.equal(view.metrics.companyLevel, 1);
    assert.equal(view.metrics.revenueLabel, '16000 SDA');
    assert.equal(view.metrics.profitLabel, '5100 SDA');
    assert.equal(view.metrics.cashLabel, '55100 SDA');
    assert.equal(view.metrics.fleetValueLabel, '0 SDA');
    assert.equal(view.metrics.levelLabel, '1 / 6');
    assert.match(view.metrics.levelDetail, /mai lipsesc 5000 SDA până la nivelul 2/);
    assert.match(view.summary, /Revenue 16000 SDA/);
  } finally {
    scenario.dispose();
  }
});

test('270 a missing month is null / "fără date", while a real zero and a negative profit stay real', () => {
  const scenario = createCompanyDashboardScenario();
  try {
    const view = projectCompanyDashboard(scenario.read()),
      missing = view.months.find((month) => month.index === 1),
      negative = view.months.find((month) => month.index === 2);
    assert.ok(missing !== undefined);
    assert.ok(negative !== undefined);
    assert.equal(missing.state, 'NO_DATA');
    assert.equal(missing.revenueMinorUnits, null);
    assert.equal(missing.costMinorUnits, null);
    assert.equal(missing.profitMinorUnits, null);
    assert.equal(missing.revenueLabel, COMPANY_DASHBOARD_TEXT.noData);
    assert.equal(missing.profitLabel, COMPANY_DASHBOARD_TEXT.noData);
    assert.equal(missing.hasData, false);
    assert.equal(negative.state, 'PARTIAL');
    assert.equal(negative.revenueMinorUnits, 0);
    assert.equal(negative.revenueLabel, '0 SDA');
    assert.equal(negative.profitMinorUnits, -4_000);
    assert.equal(negative.profitLabel, '-4000 SDA');
    assert.equal(negative.negativeProfit, true);

    const missingGroup = view.chart.groups.find((group) => group.key === missing.key);
    assert.deepEqual(
      missingGroup?.bars.map((bar) => bar.state),
      ['NO_DATA', 'NO_DATA', 'NO_DATA'],
    );
    const negativeGroup = view.chart.groups.find((group) => group.key === negative.key);
    assert.equal(negativeGroup?.bars.find((bar) => bar.series === 'REVENUE')?.state, 'ZERO');
    assert.equal(negativeGroup?.bars.find((bar) => bar.series === 'REVENUE')?.display, '0 SDA');
    assert.equal(negativeGroup?.bars.find((bar) => bar.series === 'PROFIT')?.state, 'NEGATIVE');
    assert.equal(negativeGroup?.bars.find((bar) => bar.series === 'PROFIT')?.display, '-4000 SDA');
  } finally {
    scenario.dispose();
  }
});

test('270 a real zero-profit month is shown as 0, not as missing data', () => {
  const scenario = createCompanyZeroProfitScenario();
  try {
    const view = projectCompanyDashboard(scenario.read()),
      month = view.months[0];
    assert.ok(month !== undefined);
    assert.equal(month.hasData, true);
    assert.equal(month.revenueMinorUnits, 145);
    assert.equal(month.costMinorUnits, 145);
    assert.equal(month.profitMinorUnits, 0);
    assert.equal(month.profitLabel, '0 SDA');
    assert.equal(month.negativeProfit, false);
    const group = view.chart.groups[0];
    assert.equal(group?.bars.find((bar) => bar.series === 'PROFIT')?.state, 'ZERO');
    assert.equal(view.tables[0]?.rows[0]?.[4], '0 SDA');
  } finally {
    scenario.dispose();
  }
});

test('270 chart and table print the same monthly aggregates, without averages of averages', () => {
  const scenario = createCompanyDashboardScenario();
  try {
    const view = projectCompanyDashboard(scenario.read()),
      table = view.tables.find((candidate) => candidate.key === 'months');
    assert.ok(table !== undefined);
    for (const month of view.months) {
      const row: readonly string[] = table.rows[table.rowKeys.indexOf(month.key)] ?? [],
        group = view.chart.groups.find((candidate) => candidate.key === month.key);
      assert.ok(row !== undefined);
      assert.ok(group !== undefined);
      assert.equal(row[1], month.stateLabel);
      assert.equal(row[2], month.revenueLabel);
      assert.equal(row[3], month.costLabel);
      assert.equal(row[4], month.profitLabel);
      assert.equal(row[5], month.ridesLabel);
      assert.deepEqual(
        group.bars.map((bar) => bar.value),
        [month.revenueMinorUnits, month.costMinorUnits, month.profitMinorUnits],
      );
    }
    const costs = view.tables.find((candidate) => candidate.key === 'costs');
    assert.ok(costs !== undefined);
    assert.equal(costs.rows.length, 7);
    assert.equal(costs.rows[0]?.[0], 'Energie');
    assert.notEqual(costs.rows[0]?.[1], COMPANY_DASHBOARD_TEXT.noData);
    assert.equal(view.tables[0]?.rows[1]?.[4], COMPANY_DASHBOARD_TEXT.noData);
  } finally {
    scenario.dispose();
  }
});

test('270 a purchase requires confirmation, spends real cash and adds the real taxi', () => {
  const harness = createCompanyDashboardHarness();
  try {
    harness.trigger.focus();
    assert.equal(harness.panel.open(), true);
    assert.equal(harness.document.activeElement, harness.closeButton());
    assert.deepEqual(harness.suspensions, ['panel']);
    assert.equal(harness.panel.getStats().listeners, 2);
    assert.equal(harness.panel.getStats().globalListeners, 0);

    const card = harness.card('purchase', `offer:${COMPANY_OFFER.offerId}`);
    assert.ok(card !== null);
    const button = card.children[1] as HudElement & { disabled: boolean };
    assert.equal(button.disabled, false);
    assert.match(card.textContent, /12000 SDA/);
    assert.match(card.textContent, /Adaugă un taxi compact în flota live/);

    assert.equal(harness.clickAction('purchase', `offer:${COMPANY_OFFER.offerId}`), true);
    const confirmation = byCompanyClass(harness.dialog(), 'company-dashboard__confirmation')[0];
    assert.ok(confirmation !== undefined);
    assert.equal(confirmation.hidden, false);
    assert.match(confirmation.textContent, /Confirmă cumpărarea/);
    assert.match(confirmation.textContent, /12000 SDA/);
    assert.equal(harness.document.activeElement?.getAttribute('data-company-action'), 'confirm');

    harness.confirm();
    const stats = harness.panel.getStats(),
      view = harness.panel.getView();
    assert.equal(stats.acceptedPurchases, 1);
    assert.equal(stats.commands, 1);
    assert.equal(stats.renders, 2);
    assert.equal(harness.scenario.fleet.counts().taxis, 21);
    assert.equal(harness.scenario.ledger.totals().cashMinorUnits, 43_100);
    assert.equal(view?.metrics.cashMinorUnits, 43_100);
    assert.equal(view?.metrics.fleetValueMinorUnits, 12_000);
    assert.equal(view?.metrics.companyLevel, 2);
    assert.equal(
      view?.offers.find((offer) => offer.offerId === COMPANY_OFFER.offerId)?.state,
      'OWNED',
    );
    assert.match(
      view?.offers.find((offer) => offer.offerId === COMPANY_OFFER.offerId)?.reasonLabel ?? '',
      /Deținut deja/,
    );
    assert.equal(harness.panel.getStats().globalListeners, 0);
  } finally {
    harness.panel.dispose();
    harness.scenario.dispose();
  }
});

test('270 the upgrade confirmation buys the real effect and the next month profit reflects it', () => {
  const harness = createCompanyDashboardHarness();
  try {
    harness.panel.open();
    harness.clickAction('purchase', `offer:${COMPANY_OFFER.offerId}`);
    harness.confirm();
    assert.equal(
      harness.scenario.evolution.read(harness.scenario.clock.tick).companyLevel.level,
      2,
    );
    assert.equal(harness.clickAction('upgrade', `upgrade:${COMPANY_UPGRADE.upgradeId}`), true);
    const confirmation = byCompanyClass(harness.dialog(), 'company-dashboard__confirmation')[0];
    assert.match(confirmation?.textContent ?? '', /upgrade-ul „Contract de service”/);
    assert.match(confirmation?.textContent ?? '', /8000 SDA/);
    assert.match(confirmation?.textContent ?? '', /Reduce costul Serviciu cu 50%/);
    harness.confirm();
    let stats = harness.panel.getStats(),
      view = harness.panel.getView();
    assert.equal(stats.acceptedUpgrades, 1);
    assert.equal(stats.commands, 2);
    assert.equal(view?.pendingEffects[0]?.categoryLabel, 'Serviciu');
    assert.equal(view?.pendingEffects[0]?.reductionLabel, '50%');
    assert.equal(
      view?.upgrades.find((upgrade) => upgrade.upgradeId === COMPANY_UPGRADE.upgradeId)?.state,
      'OWNED',
    );
    assert.match(
      view?.upgrades.find((upgrade) => upgrade.upgradeId === COMPANY_UPGRADE.upgradeId)
        ?.reasonLabel ?? '',
      /Upgrade deținut/,
    );

    harness.scenario.addNextMonthActivity();
    const result = harness.panel.refresh();
    assert.equal(result, 'RENDERED');
    view = harness.panel.getView();
    const month0 = view?.months.find((month) => month.index === 0),
      nextMonth = view?.months.find((month) => month.index === 3);
    assert.ok(month0 !== undefined);
    assert.ok(nextMonth !== undefined);
    assert.equal(month0.costMinorUnits, 6_900);
    assert.equal(nextMonth.revenueMinorUnits, 5_200);
    assert.equal(nextMonth.profitMinorUnits, 700);
    assert.equal(nextMonth.profitLabel, '700 SDA');
    const nextReport = harness.scenario.evolution.read(harness.scenario.clock.tick).finance.month;
    assert.equal(nextReport?.periodId, 'm0003');
    assert.equal(nextReport?.costByCategory.SERVICE, 80);
    assert.equal(
      harness.scenario.evolution.read(harness.scenario.clock.tick).pendingEffects.length,
      0,
    );

    stats = harness.panel.getStats();
    assert.equal(stats.escapes, 0);
    assert.equal(stats.closedReads, 0);
  } finally {
    harness.panel.dispose();
    harness.scenario.dispose();
  }
});

test('270 insufficient funds and level requirements block the action with explicit text', () => {
  const lowCash = createCompanyDashboardScenario({
    initialCashMinorUnits: 10_000,
    withHistory: false,
  });
  try {
    const harness = createCompanyDashboardHarness({ scenario: lowCash });
    try {
      harness.panel.open();
      const card = harness.card('purchase', `offer:${COMPANY_OFFER.offerId}`);
      assert.ok(card !== null);
      assert.match(card.textContent, /Fonduri insuficiente/);
      assert.match(card.textContent, /cost 12000 SDA, cash 10000 SDA/);
      const button = card.children[1] as HudElement & { disabled: boolean };
      assert.equal(button.disabled, true);
      const before = harness.panel.getStats();
      const result = harness.panel.requestPurchase(COMPANY_OFFER.offerId);
      assert.equal(result.status, 'BLOCKED');
      assert.match(result.reason ?? '', /Fonduri insuficiente/);
      assert.equal(harness.panel.getStats().commands, before.commands);
      assert.equal(harness.panel.getStats().blockedCommands, 1);
      assert.equal(harness.scenario.ledger.totals().cashMinorUnits, 10_000);
      assert.equal(harness.scenario.fleet.counts().taxis, 20);
    } finally {
      harness.panel.dispose();
    }
  } finally {
    lowCash.dispose();
  }

  const levelScenario = createCompanyDashboardScenario();
  const levelHarness = createCompanyDashboardHarness({ scenario: levelScenario });
  try {
    levelHarness.panel.open();
    const locked = levelHarness.card('purchase', `offer:${COMPANY_LOCKED_OFFER.offerId}`);
    assert.ok(locked !== null);
    assert.match(locked.textContent, /Nivel insuficient/);
    assert.match(locked.textContent, /cere nivelul 2, compania are nivelul 1/);
    const result = levelHarness.panel.requestPurchase(COMPANY_LOCKED_OFFER.offerId);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(levelHarness.scenario.ledger.totals().investmentMinorUnits, 0);
  } finally {
    levelHarness.panel.dispose();
    levelScenario.dispose();
  }
});

test('270 a duplicate upgrade from a stale view is refused by the real port and shown explicitly', () => {
  const scenario = createCompanyDashboardScenario();
  try {
    assert.equal(scenario.purchase(COMPANY_OFFER.offerId).status, 'ACCEPTED');
    const stale = scenario.read();
    assert.equal(
      stale.upgrades.find((upgrade) => upgrade.upgrade.upgradeId === COMPANY_UPGRADE.upgradeId)
        ?.state,
      'AVAILABLE',
    );
    assert.equal(scenario.upgrade(COMPANY_UPGRADE.upgradeId).status, 'ACCEPTED');
    const harness = createCompanyDashboardHarness({ scenario, read: () => stale });
    try {
      harness.panel.open();
      assert.equal(harness.clickAction('upgrade', `upgrade:${COMPANY_UPGRADE.upgradeId}`), true);
      harness.confirm();
      const stats = harness.panel.getStats(),
        status = byCompanyClass(harness.dialog(), 'company-dashboard__status')[0];
      assert.equal(stats.refusals, 1);
      assert.equal(stats.acceptedUpgrades, 0);
      assert.match(status?.textContent ?? '', /Refuzat: ALREADY_OWNED/);
      assert.equal(
        harness.panel
          .getView()
          ?.upgrades.find((upgrade) => upgrade.upgradeId === COMPANY_UPGRADE.upgradeId)?.state,
        'OWNED',
      );
      assert.equal(harness.scenario.ledger.totals().investmentMinorUnits, 20_000);
      assert.equal(harness.scenario.evolution.read(scenario.clock.tick).refusals.total, 1);
    } finally {
      harness.panel.dispose();
    }
  } finally {
    scenario.dispose();
  }
});

test('270 focus, Tab, Escape and the pause surface follow the other panels without global listeners', () => {
  const harness = createCompanyDashboardHarness();
  try {
    harness.trigger.focus();
    harness.panel.open();
    assert.equal(harness.document.activeElement, harness.closeButton());
    assert.deepEqual(harness.suspensions, ['panel']);
    const dialog = harness.dialog();
    dialog.send('keydown', { key: 'Tab' });
    assert.equal(harness.document.activeElement, harness.body());
    dialog.send('keydown', { key: 'Tab' });
    assert.equal(harness.document.activeElement?.getAttribute('data-company-action'), 'purchase');
    harness.closeButton().focus();
    dialog.send('keydown', { key: 'Tab', shiftKey: true });
    assert.equal(harness.panel.getStats().tabWraps, 1);
    assert.notEqual(harness.document.activeElement, harness.closeButton());

    harness.closeByEscape();
    assert.equal(harness.panel.isOpen(), false);
    assert.equal(harness.panel.getStats().escapes, 1);
    assert.deepEqual(harness.resumes, ['panel']);
    assert.equal(harness.document.activeElement, harness.trigger);
    assert.equal(harness.closes, 1);
    assert.equal(harness.dialog().hidden, true);
    assert.equal(harness.dialog().getAttribute('role'), null);
    assert.equal(harness.dialog().getAttribute('aria-modal'), null);

    harness.setMode('AUTO');
    harness.panel.open();
    assert.deepEqual(harness.suspensions, ['panel']);
    harness.panel.close();
    assert.deepEqual(harness.resumes, ['panel']);
    assert.equal(harness.panel.getStats().listeners, 2);
    assert.equal(harness.panel.getStats().globalListeners, 0);
  } finally {
    harness.panel.dispose();
    harness.scenario.dispose();
  }
});

test('270 the closed panel never reads or renders; open updates are throttled to 10 Hz', () => {
  const harness = createCompanyDashboardHarness();
  try {
    assert.equal(harness.panel.update(1_000), 'SKIPPED_CLOSED');
    assert.equal(harness.panel.refresh(), 'SKIPPED_CLOSED');
    let stats = harness.panel.getStats();
    assert.equal(stats.reads, 0);
    assert.equal(stats.renders, 0);
    assert.equal(stats.skippedClosed, 2);
    assert.equal(stats.closedReads, 0);

    harness.setNow(1_000);
    harness.panel.open();
    stats = harness.panel.getStats();
    assert.equal(stats.reads, 1);
    assert.equal(stats.renders, 1);

    harness.setNow(1_050);
    assert.equal(harness.panel.update(1_050), 'SKIPPED_THROTTLED');
    assert.equal(harness.panel.getStats().reads, 1);

    harness.setNow(1_100);
    assert.equal(harness.panel.update(1_100), 'SKIPPED_UNCHANGED');
    assert.equal(harness.panel.getStats().reads, 2);
    assert.equal(harness.panel.getStats().renders, 1);

    harness.scenario.clock.tick += 1;
    harness.setNow(1_200);
    assert.equal(harness.panel.update(1_200), 'RENDERED');
    assert.equal(harness.panel.getStats().reads, 3);
    assert.equal(harness.panel.getStats().renders, 2);

    harness.panel.close();
    harness.setNow(1_300);
    assert.equal(harness.panel.update(1_300), 'SKIPPED_CLOSED');
    assert.equal(harness.panel.getStats().reads, 3);
    assert.equal(harness.panel.getStats().renders, 2);
    assert.equal(harness.panel.getStats().lastHistoryScans, 0);
  } finally {
    harness.panel.dispose();
    harness.scenario.dispose();
  }
});

test('270 shell host mounts a native Company button that opens through its own port', () => {
  const doc = createHudDocument(),
    root = doc.createElement('div'),
    shell = createGameShell({
      context: { sessionId: '270-host-test', worldEpoch: 1 },
      suspend: () => {},
      resume: () => {},
      now: () => 0,
    });
  let opens = 0;
  shell.attachWorld({
    version: '270-host-test-world',
    currentTick: () => 1,
    step: () => {},
    present: () => {},
  });
  shell.start();
  shell.step(2);
  const host = createGameShellHost({
    root: root as unknown as HTMLElement,
    snapshot: () => shell.status(),
    onStart: () => {},
    onPause: () => {},
    onResume: () => {},
    onOpenPanel: () => shell.openPanel('integration'),
    onClosePanel: () => shell.closePanel(),
    onOpenCompany: () => {
      opens += 1;
      return true;
    },
    now: () => 0,
  });
  try {
    host.setSessionState('PLAYING');
    const bar = (root.children[0] as HudElement).children[0]!;
    const button = bar.children.find(
      (child) => child.getAttribute('data-shell-action') === 'company',
    );
    assert.ok(button !== undefined);
    assert.equal(button.textContent, 'Companie');
    assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
    button.dispatchEvent('click');
    assert.equal(opens, 1);
    assert.equal(host.getStats().listeners, 7);
    assert.equal(host.getStats().globalListeners, 0);
  } finally {
    host.dispose();
    shell.dispose();
  }
});
