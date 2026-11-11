import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KPI_HISTORY_LIMITS,
  KPI_HISTORY_VERSION,
  createFleetKpi,
  selectKpiHistory,
  type FleetKpiSnapshot,
  type KpiHistoryPoint,
  type KpiHistorySelection,
} from '../../src/economy';
import {
  KPI_HISTORY_TEXT,
  KPI_HISTORY_UI_VERSION,
  emptyKpiHistoryView,
  formatKpiHistoryAverage,
  projectKpiHistory,
} from '../../src/ui';
import {
  KPI_HISTORY_DAY_TICKS,
  byKpiClass,
  createKpiHistoryHarness,
  createKpiHistoryScenario,
  type KpiElement,
} from './kpi-history-fixture';

const scenario = createKpiHistoryScenario();
const selection = scenario.selection();
const view = projectKpiHistory(selection);

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function tableOf(dialog: KpiElement, key: string): KpiElement {
  const table = byKpiClass(dialog, 'kpi-history__table').find(
    (candidate) => candidate.getAttribute('data-table') === key,
  );
  if (table === undefined) throw new Error(`Missing table ${key}`);
  return table;
}

function monthOf(selected: KpiHistorySelection, index: number) {
  const month = selected.months.find((candidate) => candidate.index === index);
  if (month === undefined) throw new Error(`Missing month ${index}`);
  return month;
}

test('210 the selector fills the 12-month window and marks the missing month as NO_DATA', () => {
  assert.equal(selection.version, KPI_HISTORY_VERSION);
  assert.equal(selection.monthWindow, KPI_HISTORY_LIMITS.months);
  assert.equal(selection.months.length, 12);
  assert.deepEqual(
    selection.months.map((month) => month.index),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
  const missing = monthOf(selection, 3);
  assert.equal(missing.state, 'NO_DATA');
  assert.equal(missing.revenueMinorUnits, null);
  assert.equal(missing.terminalRides, null);
  assert.equal(missing.reviewCount, null);
  assert.equal(missing.averageRating, null);
  assert.equal(missing.averageState, 'NO_DATA');
  const missingView = view.months.find((month) => month.key === missing.periodId);
  assert.equal(missingView?.revenueLabel, KPI_HISTORY_TEXT.noData);
  assert.equal(missingView?.state, 'NO_DATA');
  assert.equal(missingView?.averageLabel, KPI_HISTORY_TEXT.noData);
  assert.notEqual(missingView?.revenueLabel, '0 SDA');
  assert.equal(selection.totals.monthsWithoutData, 1);
  assert.equal(selection.totals.monthsWithData, 11);
});

test('210 a real zero month stays zero and keeps its own sample', () => {
  const zero = monthOf(selection, 6);
  assert.equal(zero.state, 'COMPLETE');
  assert.equal(zero.revenueMinorUnits, 0);
  assert.equal(zero.terminalRides, 30);
  assert.equal(zero.reviewCount, 4);
  assert.equal(zero.ratingSum, 0);
  assert.equal(zero.averageRating, 0);
  assert.equal(zero.averageState, 'AVAILABLE');
  const zeroView = view.months.find((month) => month.key === zero.periodId);
  assert.equal(zeroView?.revenueLabel, '0 SDA');
  assert.equal(zeroView?.averageLabel, '0');
  assert.equal(zeroView?.sampleLabel, '4 review-uri');
  assert.equal(zeroView?.stateLabel, KPI_HISTORY_TEXT.complete);
});

test('210 the window mean is ratingSum / reviewCount, not the mean of monthly means', () => {
  assert.equal(selection.totals.reviewCount, scenario.reviews);
  assert.equal(selection.totals.ratingSum, 725);
  assert.equal(selection.totals.averageRating, round(725 / scenario.reviews));
  const monthlyMeans = selection.months
      .filter((month) => month.state !== 'NO_DATA' && month.averageRating !== null)
      .map((month) => month.averageRating ?? 0),
    meanOfMeans = monthlyMeans.reduce((total, value) => total + value, 0) / monthlyMeans.length;
  assert.notEqual(round(meanOfMeans), selection.totals.averageRating);
  assert.ok(Math.abs(meanOfMeans - (selection.totals.averageRating ?? 0)) > 0.01);
  assert.equal(
    view.totals.averageLabel,
    formatKpiHistoryAverage(selection.totals.averageRating, selection.totals.averageState),
  );
  const distributionTotal = selection.distribution.counts.reduce(
    (total, count) => total + count,
    0,
  );
  assert.equal(distributionTotal, selection.totals.reviewCount);
  assert.deepEqual([...selection.distribution.counts], [49, 45, 45, 45, 45, 55]);
  assert.equal(selection.distribution.state, 'AVAILABLE');
});

test('210 the partial month is marked, projected and never compared with a completed month', () => {
  const current = monthOf(selection, 11);
  assert.equal(current.state, 'PARTIAL');
  assert.equal(selection.totals.partialMonths, 1);
  assert.equal(selection.completedMonths, 10);
  for (let index = 0; index <= 10; index += 1)
    if (index !== 3) assert.equal(monthOf(selection, index).state, 'COMPLETE');
  assert.equal(selection.projection.status, 'PROJECTED');
  assert.ok((selection.projection.observedSeconds ?? 0) > 300);
  assert.ok((selection.projection.projectedRevenueMinorUnits ?? 0) > 0);
  assert.notEqual(selection.projection.projectedRevenueMinorUnits, current.revenueMinorUnits);
  const currentView = view.months.find((month) => month.key === current.periodId);
  assert.equal(currentView?.isPartial, true);
  assert.equal(currentView?.note, KPI_HISTORY_TEXT.partialNote);
  assert.equal(view.projection.status, 'PROJECTED');
  assert.match(view.projection.headline, /Proiecție pentru luna curentă/);
  assert.match(view.projection.windowLabel, /Fereastră: tick/);

  const revenue = view.charts.find((chart) => chart.key === 'MONTH_REVENUE');
  assert.ok(revenue !== undefined);
  const currentGroup = revenue.groups.find((group) => group.key === current.periodId);
  assert.deepEqual(
    currentGroup?.bars.map((bar) => bar.series),
    ['ACTUAL', 'PROJECTED'],
  );
  const completedGroup = revenue.groups.find(
    (group) => group.key === monthOf(selection, 10).periodId,
  );
  assert.deepEqual(
    completedGroup?.bars.map((bar) => bar.series),
    ['ACTUAL'],
  );
});

test('210 insufficient projection data names the closed reason and the minimum', () => {
  const kpi = createFleetKpi();
  for (let index = 0; index < 2; index += 1) {
    const tick = index * 600;
    kpi.applySettlement({
      settlementId: `small-${index}`,
      rideId: `small-ride-${index}`,
      requestId: `small-request-${index}`,
      taxiId: 'taxi-01',
      terminalState: 'COMPLETED',
      passengerAboard: true,
      tick,
      currency: 'SDA',
      pricingVersion: '209-tariff-v1',
      policyVersion: '209-policy-v1',
      rule: 'COMPLETED_FULL_FARE',
      quotedMinorUnits: 500,
      chargedMinorUnits: 500,
      refundedMinorUnits: 0,
      netMinorUnits: 500,
      chargeEntryId: `small-charge-${index}`,
      refundEntryId: null,
    });
  }
  const small = selectKpiHistory(kpi.snapshot(1_200));
  assert.equal(small.projection.status, 'INSUFFICIENT_DATA');
  assert.equal(small.projection.reason, 'FEW_RIDES');
  assert.equal(small.projection.terminalRides, 2);
  assert.equal(small.projection.minimumTerminalRides, 10);
  const smallView = projectKpiHistory(small);
  assert.equal(smallView.projection.headline, KPI_HISTORY_TEXT.insufficient);
  assert.match(smallView.projection.detail, /2 curse terminale/);
  assert.match(smallView.projection.detail, /minimumul de 10/);
  const revenue = smallView.charts.find((chart) => chart.key === 'MONTH_REVENUE');
  const projected = revenue?.groups
    .flatMap((group) => group.bars)
    .find((bar) => bar.series === 'PROJECTED');
  assert.equal(projected?.state, 'INSUFFICIENT');
  assert.equal(projected?.display, KPI_HISTORY_TEXT.noProjection);
});

test('210 a day without reviews has no mean, while a real zero rating is kept', () => {
  const noReview = selection.daily.exact.find(
    (point) => point.reviewCount === 0 && point.terminalRides > 0,
  );
  assert.ok(noReview !== undefined);
  assert.equal(noReview.averageRating, null);
  assert.equal(noReview.averageState, 'NO_REVIEWS');
  const zeroRating = selection.daily.exact.find(
    (point) => point.reviewCount === 1 && point.ratingSum === 0,
  );
  assert.ok(zeroRating !== undefined);
  assert.equal(zeroRating.averageRating, 0);
  assert.equal(zeroRating.averageState, 'AVAILABLE');
  const ratingChart = view.charts.find((chart) => chart.key === 'DAILY_RATING');
  const missingBar = ratingChart?.groups
    .flatMap((group) => group.bars)
    .find((bar) => bar.state === 'NO_REVIEWS');
  assert.equal(missingBar?.display, KPI_HISTORY_TEXT.noReviews);
  assert.equal(missingBar?.percent, 0);
});

test('210 downsampling is visual only: groups keep exact sums and the weighted mean', () => {
  const downsampled = scenario.selection({ maximumDailyPoints: 10 });
  assert.equal(downsampled.daily.downsampled, true);
  assert.equal(downsampled.daily.exactPoints, 310);
  assert.equal(downsampled.daily.visualPoints, 10);
  assert.ok(downsampled.daily.visual.length <= 10);
  const exactRevenue = downsampled.daily.exact.reduce(
      (total, point) => total + point.revenueMinorUnits,
      0,
    ),
    visualRevenue = downsampled.daily.visual.reduce(
      (total, point) => total + point.revenueMinorUnits,
      0,
    ),
    exactReviews = downsampled.daily.exact.reduce((total, point) => total + point.reviewCount, 0),
    visualReviews = downsampled.daily.visual.reduce((total, point) => total + point.reviewCount, 0);
  assert.equal(visualRevenue, exactRevenue);
  assert.equal(visualReviews, exactReviews);
  assert.equal(
    downsampled.daily.visual.reduce((total, point) => total + point.exactPoints, 0),
    downsampled.daily.exactPoints,
  );
  const mixed = downsampled.daily.visual.find(
    (point) => point.exactPoints > 1 && point.reviewCount > 1,
  );
  assert.ok(mixed !== undefined);
  assert.equal(mixed.averageRating, round(mixed.ratingSum / mixed.reviewCount));
  const members = downsampled.daily.exact.filter(
      (point: KpiHistoryPoint) => point.index >= mixed.firstIndex && point.index <= mixed.lastIndex,
    ),
    naiveMean =
      members.reduce((total, point) => total + (point.averageRating ?? 0), 0) / members.length;
  assert.ok(Math.abs(naiveMean - (mixed.averageRating ?? 0)) > 1e-9);
  const downsampledView = projectKpiHistory(downsampled);
  assert.equal(downsampledView.downsampling.downsampled, true);
  assert.equal(downsampledView.downsampling.visualPoints, 10);
  assert.match(downsampledView.downsampling.label, /10 puncte/);
});

test('210 the closed popup reads nothing and rebuilds no chart', () => {
  const harness = createKpiHistoryHarness();
  const before = harness.panel.getStats();
  assert.equal(before.open, false);
  assert.equal(before.reads, 0);
  assert.equal(before.renders, 0);
  assert.equal(harness.reads(), 0);
  assert.equal(harness.panel.refresh(), 'SKIPPED_CLOSED');
  assert.equal(harness.panel.getStats().reads, 0);
  assert.equal(harness.panel.getStats().renders, 0);
  assert.equal(harness.reads(), 0);
  assert.equal(harness.dialog().hasAttribute('hidden'), true);

  assert.equal(harness.panel.open(), true);
  const afterOpen = harness.panel.getStats();
  assert.equal(afterOpen.open, true);
  assert.equal(afterOpen.reads, 1);
  assert.equal(afterOpen.renders, 1);
  assert.equal(harness.reads(), 1);
  assert.equal(harness.dialog().hasAttribute('hidden'), false);

  assert.equal(harness.panel.refresh(), 'SKIPPED_UNCHANGED');
  assert.equal(harness.panel.getStats().renders, 1);
  assert.equal(harness.panel.getStats().reads, 2);
});

test('210 opening the popup never rescans the ledger', () => {
  const harness = createKpiHistoryHarness();
  const before = harness.scenario.kpi.getStats();
  assert.equal(before.historyScans, 0);
  assert.equal(before.settlements, 310);
  assert.equal(before.reviews, 284);
  harness.panel.open();
  const after = harness.scenario.kpi.getStats();
  assert.equal(after.historyScans, 0);
  assert.equal(after.settlements, before.settlements);
  assert.equal(after.reviews, before.reviews);
  assert.equal(after.retainedDays, before.retainedDays);
  assert.equal(harness.panel.getStats().lastHistoryScans, 0);
  assert.equal(harness.panel.getView()?.historyScans, 0);
  assert.equal(harness.reads(), 1);
  harness.panel.refresh();
  assert.equal(harness.scenario.kpi.getStats().settlements, 310);
  assert.equal(harness.scenario.kpi.getStats().historyScans, 0);
});

test('210 the popup reads fresh data only on an explicit refresh', () => {
  let current: KpiHistorySelection | null = scenario.selection();
  const harness = createKpiHistoryHarness({ selection: () => current });
  harness.panel.open();
  const firstSignature = harness.panel.getView()?.signature;
  assert.ok(firstSignature !== undefined);
  current = scenario.selection({ maximumDailyPoints: 10 });
  assert.equal(harness.panel.refresh(), 'RENDERED');
  const second = harness.panel.getView();
  assert.notEqual(second?.signature, firstSignature);
  assert.equal(second?.downsampling.downsampled, true);
  assert.equal(harness.panel.getStats().renders, 2);
  current = null;
  assert.equal(harness.panel.refresh(), 'RENDERED');
  assert.equal(harness.panel.getView()?.empty, true);
  assert.equal(harness.panel.getStats().renders, 3);
});

test('210 the trigger is a native button and the dialog has a real accessible name', () => {
  const harness = createKpiHistoryHarness();
  const trigger = harness.trigger(),
    dialog = harness.dialog();
  assert.equal(trigger.tagName, 'button');
  assert.equal(trigger.getAttribute('type'), 'button');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.getAttribute('aria-controls'), dialog.getAttribute('id'));
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(dialog.tagName, 'section');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  const labelId = trigger.getAttribute('aria-controls') ?? '',
    title = byKpiClass(dialog, 'kpi-history__title')[0];
  assert.equal(dialog.getAttribute('aria-labelledby'), title?.getAttribute('id'));
  assert.equal(dialog.getAttribute('id'), labelId);
  assert.equal(title?.textContent, KPI_HISTORY_TEXT.title);
  assert.ok((dialog.getAttribute('aria-describedby') ?? '').length > 0);
  const stats = harness.panel.getStats();
  assert.equal(stats.globalListeners, 0);
  assert.equal(stats.listeners, 3);
});

test('210 focus moves into the dialog, Tab stays inside and closing restores the trigger', () => {
  const harness = createKpiHistoryHarness();
  const trigger = harness.trigger(),
    dialog = harness.dialog(),
    close = byKpiClass(dialog, 'kpi-history__close')[0],
    body = byKpiClass(dialog, 'kpi-history__body')[0];
  assert.ok(close !== undefined && body !== undefined);
  trigger.focus();
  trigger.send('click');
  assert.equal(harness.document.activeElement, close);
  assert.equal(close.focusCount, 1);
  assert.equal(body.tabIndex, 0);

  dialog.send('keydown', { key: 'Tab' });
  assert.equal(harness.document.activeElement, body);
  dialog.send('keydown', { key: 'Tab' });
  assert.equal(harness.document.activeElement, close);
  assert.equal(harness.panel.getStats().tabWraps, 1);
  dialog.send('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(harness.document.activeElement, body);

  close.send('click');
  assert.equal(harness.document.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(dialog.hasAttribute('hidden'), true);
  assert.equal(harness.panel.getStats().focusRestores, 1);
});

test('210 Escape closes the dialog and restores the previous focus', () => {
  const harness = createKpiHistoryHarness();
  const trigger = harness.trigger();
  trigger.focus();
  harness.panel.open();
  assert.equal(harness.panel.isOpen(), true);
  harness.closeByEscape();
  assert.equal(harness.panel.isOpen(), false);
  assert.equal(harness.panel.getStats().escapes, 1);
  assert.equal(harness.panel.getStats().closes, 1);
  assert.equal(harness.document.activeElement, trigger);
  assert.equal(harness.dialog().hasAttribute('hidden'), true);
});

test('210 MANUAL and LEARNING pause on open and resume the previous mode on close', () => {
  for (const mode of ['MANUAL', 'LEARNING'] as const) {
    const harness = createKpiHistoryHarness({ mode });
    assert.deepEqual(harness.suspensions, []);
    harness.trigger().focus();
    harness.panel.open();
    let state = harness.pauseFocus.getState();
    assert.equal(state.mode, mode);
    assert.equal(state.suspended, true);
    assert.equal(state.cause, 'panel');
    assert.deepEqual(harness.suspensions, ['panel']);
    harness.panel.close();
    state = harness.pauseFocus.getState();
    assert.equal(state.mode, mode);
    assert.equal(state.suspended, false);
    assert.equal(state.cause, null);
    assert.deepEqual(harness.resumes, ['panel']);
    assert.equal(harness.panel.getStats().surfaceCalls, 2);
  }
});

test('210 observation AUTO stays live while the popup is open', () => {
  const harness = createKpiHistoryHarness({ mode: 'AUTO' });
  harness.panel.open();
  const state = harness.pauseFocus.getState();
  assert.equal(state.mode, 'AUTO');
  assert.equal(state.suspended, false);
  assert.equal(state.cause, null);
  assert.deepEqual(harness.suspensions, []);
  harness.panel.close();
  assert.deepEqual(harness.resumes, []);
});

test('210 tables are accessible and carry the exact values', () => {
  const harness = createKpiHistoryHarness();
  harness.panel.open();
  const dialog = harness.dialog(),
    months = tableOf(dialog, 'months');
  assert.equal(months.tagName, 'table');
  assert.ok(months.children.some((child) => child.tagName === 'caption'));
  assert.equal(months.children[0]?.tagName, 'caption');
  const head = months.children.find((child) => child.tagName === 'thead'),
    body = months.children.find((child) => child.tagName === 'tbody');
  assert.ok(head !== undefined && body !== undefined);
  const headCells = head.children[0]?.children ?? [];
  assert.equal(headCells.length, 7);
  for (const cell of headCells) assert.equal(cell.getAttribute('scope'), 'col');
  assert.equal(body.children.length, 12);
  for (const row of body.children) {
    assert.equal(row.children[0]?.tagName, 'th');
    assert.equal(row.children[0]?.getAttribute('scope'), 'row');
  }
  const missingRow = body.children.find(
    (row) => row.getAttribute('data-key') === monthOf(selection, 3).periodId,
  );
  assert.equal(missingRow?.getAttribute('data-state'), 'NO_DATA');
  assert.equal(missingRow?.children[2]?.textContent, KPI_HISTORY_TEXT.noData);

  const days = tableOf(dialog, 'days'),
    daysCaption = days.children[0]?.textContent ?? '';
  assert.match(daysCaption, /sumele exacte/);
  const daysBody = days.children.find((child) => child.tagName === 'tbody');
  assert.equal(daysBody?.children.length, selection.daily.visualPoints);

  const distribution = tableOf(dialog, 'distribution'),
    distributionBody = distribution.children.find((child) => child.tagName === 'tbody');
  assert.equal(distributionBody?.children.length, 6);
  assert.equal(distributionBody?.children[0]?.children[0]?.textContent, 'Nota 0');
  assert.equal(distributionBody?.children[0]?.children[1]?.textContent, '49');
});

test('210 the dialog fits the target resolutions and scrolls internally', () => {
  const harness = createKpiHistoryHarness();
  harness.panel.open();
  const style = harness.dialog().getAttribute('style') ?? '',
    body = byKpiClass(harness.dialog(), 'kpi-history__body')[0];
  assert.match(style, /width:min\(92vw,58rem\)/);
  assert.match(style, /max-height:min\(90vh,46rem\)/);
  assert.match(style, /overflow:auto/);
  assert.match(body?.getAttribute('style') ?? '', /max-height:min\(64vh,30rem\)/);
  const box = (width: number, height: number) => ({
    width: Math.min(width * 0.92, 58 * 16),
    height: Math.min(height * 0.9, 46 * 16),
  });
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
    [853.33, 480],
  ]) {
    const fitted = box(width, height);
    assert.ok(fitted.width <= width, `${fitted.width} > ${width}`);
    assert.ok(fitted.height <= height, `${fitted.height} > ${height}`);
  }
  const compact = box(853.33, 480);
  assert.ok(Math.abs(compact.width - 785.0636) < 1e-9);
  assert.equal(compact.height, 432);
  const standard = box(1280, 720);
  assert.equal(standard.width, 928);
  assert.equal(standard.height, 648);
  const large = box(1920, 1080);
  assert.equal(large.width, 928);
  assert.equal(large.height, 736);
});

test('210 the empty source shows explicit empty text, not zero charts', () => {
  const harness = createKpiHistoryHarness({ selection: () => null });
  harness.panel.open();
  const empty = harness.panel.getView();
  assert.ok(empty !== null);
  assert.equal(empty.empty, true);
  assert.equal(empty.months.length, 0);
  assert.equal(empty.tables.length, 0);
  assert.equal(harness.dialog().getAttribute('data-empty'), 'true');
  const note = byKpiClass(harness.dialog(), 'kpi-history__empty')[0];
  assert.equal(note?.textContent, KPI_HISTORY_TEXT.empty);
  assert.equal(note?.hasAttribute('hidden'), false);
  assert.equal(emptyKpiHistoryView().empty, true);
  assert.equal(emptyKpiHistoryView().charts.length, 5);
  for (const chart of emptyKpiHistoryView().charts) assert.equal(chart.state, 'NO_DATA');
});

test('210 the projection is deterministic and the committed view carries the panel version', () => {
  const first = projectKpiHistory(selection),
    second = projectKpiHistory(scenario.selection());
  assert.equal(first.signature, second.signature);
  assert.deepEqual(first, second);
  assert.equal(first.version, KPI_HISTORY_UI_VERSION);
  assert.equal(first.historyScans, 0);
  assert.equal(first.months.length, 12);
  assert.deepEqual(
    first.charts.map((chart) => chart.key),
    ['MONTH_REVENUE', 'DAILY_RIDES', 'DAILY_REVIEWS', 'DAILY_RATING', 'RATING_DISTRIBUTION'],
  );
});

test('210 the selector rejects a foreign or malformed snapshot', () => {
  assert.throws(
    () => selectKpiHistory({ version: '209-fleet-kpi-v0' } as unknown as FleetKpiSnapshot),
    /209/,
  );
  const snapshot = scenario.snapshot();
  assert.throws(
    () => selectKpiHistory({ ...snapshot, historyScans: 1 } as unknown as FleetKpiSnapshot),
    /scan-free/,
  );
  assert.throws(
    () =>
      selectKpiHistory(
        {
          ...snapshot,
          months: [{ ...snapshot.months[0]!, ratingHistogram: [0, 0, 0, 0, 0, 1] }],
        } as FleetKpiSnapshot,
        { months: 12 },
      ),
    /histogram/,
  );
  assert.throws(() => selectKpiHistory(snapshot, { months: 0 }), /month window/);
  assert.throws(() => selectKpiHistory(snapshot, { maximumDailyPoints: 0 }), /daily point cap/);
});

test('210 the day window keeps the exact tick start of the first simulated day', () => {
  const first = selection.daily.exact[0];
  assert.ok(first !== undefined);
  assert.equal(first.startTick, 0);
  assert.equal(first.endTick, KPI_HISTORY_DAY_TICKS);
  assert.equal(first.completeness, 'COMPLETE');
  const last = selection.daily.exact[selection.daily.exact.length - 1];
  assert.equal(last?.completeness, 'COMPLETE');
  assert.equal(last?.index, 11 * 30 + 9);
  assert.equal(last?.startTick, (11 * 30 + 9) * KPI_HISTORY_DAY_TICKS);
  assert.ok((last?.endTick ?? 0) < selection.tick);
});
