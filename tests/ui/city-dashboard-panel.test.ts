import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CITY_DASHBOARD_PANEL_VERSION,
  createCityDashboardPanel,
  type CityDashboardSnapshot,
} from '../../src/ui';
import type { HudElement } from './hud-dom';
import { byKpiClass, createKpiDocument, type KpiElement } from './kpi-history-fixture';
import { cityIncident, sevenMetricSnapshot } from './city-dashboard-fixture';

function fixture(snapshot: CityDashboardSnapshot = sevenMetricSnapshot()) {
  const document = createKpiDocument(),
    host = document.createElement('div'),
    opener = document.createElement('button'),
    surfaces: boolean[] = [];
  let reads = 0,
    closes = 0,
    current: CityDashboardSnapshot | null = snapshot,
    clock = 0;
  host.append(opener);
  opener.focus();
  const panel = createCityDashboardPanel(host as unknown as HTMLElement, {
    read: () => {
      reads += 1;
      return current;
    },
    setSurface: (open) => surfaces.push(open),
    onClose: () => {
      closes += 1;
    },
    now: () => clock,
  });
  return {
    document,
    host,
    opener,
    panel,
    surfaces,
    reads: () => reads,
    closes: () => closes,
    clock: (value: number) => {
      clock = value;
    },
    setSnapshot: (value: CityDashboardSnapshot | null) => {
      current = value;
    },
  };
}

test('267 city panel is closed by default and reads nothing while closed', () => {
  const f = fixture();
  assert.equal(CITY_DASHBOARD_PANEL_VERSION, '267-city-dashboard-panel-v1');
  assert.equal(f.panel.isOpen(), false);
  assert.equal(f.panel.update(100), 'SKIPPED_CLOSED');
  assert.equal(f.panel.refresh(200), 'SKIPPED_CLOSED');
  assert.equal(f.reads(), 0);
  assert.equal(f.panel.getStats().renders, 0);
  assert.equal(f.panel.getStats().globalListeners, 0);
  assert.deepEqual(f.surfaces, []);
});

test('267 city panel opens the seven indicators and real incidents', () => {
  const incident = cityIncident(),
    f = fixture(sevenMetricSnapshot({ incidents: Object.freeze([incident]) }));
  assert.equal(f.panel.open(), true);
  assert.equal(f.panel.isOpen(), true);
  assert.equal(f.reads(), 1);
  const root = f.panel.getElement() as unknown as HudElement,
    cards = byKpiClass(root, 'city-dashboard__metric'),
    rows = byKpiClass(root, 'city-dashboard__incident-row');
  assert.equal(cards.length, 7);
  assert.deepEqual(
    cards.map((card) => card.getAttribute('data-metric-id')),
    [
      'completedRides',
      'averageRideSeconds',
      'totalDistanceM',
      'violations',
      'collisions',
      'blockages',
      'comfortScore',
    ],
  );
  assert.equal(cards[0]?.getAttribute('data-state'), 'AVAILABLE');
  assert.equal(cards[3]?.getAttribute('data-state'), 'UNAVAILABLE');
  assert.equal(cards[4]?.getAttribute('data-state'), 'AVAILABLE');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.getAttribute('data-incident-id'), incident.incidentId);
  assert.equal(f.panel.getStats().dashboard.rows, 1);
  assert.deepEqual(f.surfaces, [true]);
});

test('267 city panel keeps Tab inside, Escape closes and restores focus', () => {
  const f = fixture(sevenMetricSnapshot({ incidents: Object.freeze([cityIncident()]) }));
  f.panel.open();
  const root = f.panel.getElement() as unknown as KpiElement,
    close = byKpiClass(root, 'city-dashboard-panel__close')[0]!,
    row = byKpiClass(root, 'city-dashboard__incident-row')[0]!;
  assert.equal(f.document.activeElement, close);
  root.send('keydown', { key: 'Tab' });
  assert.equal(f.document.activeElement, row);
  root.send('keydown', { key: 'Tab' });
  assert.equal(f.document.activeElement, close);
  assert.equal(f.panel.getStats().tabWraps, 1);
  root.send('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(f.document.activeElement, row);
  root.send('keydown', { key: 'Escape' });
  assert.equal(f.panel.isOpen(), false);
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.closes(), 1);
  assert.equal(f.panel.getStats().escapes, 1);
  assert.deepEqual(f.surfaces, [true, false]);
  assert.equal(root.hasAttribute('hidden'), true);
});

test('267 city panel caps host reads at 10 Hz and does not read a closed panel', () => {
  const f = fixture();
  f.clock(0);
  f.panel.open();
  assert.equal(f.reads(), 1);
  f.clock(50);
  assert.equal(f.panel.update(50), 'THROTTLED');
  assert.equal(f.reads(), 1);
  f.clock(100);
  f.panel.update(100);
  assert.equal(f.reads(), 2);
  f.panel.close();
  const reads = f.reads();
  f.clock(1_000);
  assert.equal(f.panel.update(1_000), 'SKIPPED_CLOSED');
  assert.equal(f.reads(), reads);
  assert.equal(f.panel.getStats().globalListeners, 0);
});

test('267 city panel handles a missing read model without inventing metrics', () => {
  const f = fixture();
  f.setSnapshot(null);
  f.panel.open();
  assert.equal(f.panel.isOpen(), true);
  assert.equal(f.panel.getStats().skippedEmpty, 1);
  assert.equal(
    byKpiClass(f.panel.getElement() as unknown as HudElement, 'city-dashboard__metric').length,
    0,
  );
  f.panel.dispose();
  assert.equal(f.panel.getStats().listeners, 0);
  assert.equal(f.panel.getStats().disposed, true);
});
