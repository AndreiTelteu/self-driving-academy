import assert from 'node:assert/strict';
import test from 'node:test';
import { readKpiHistory } from '../../src/app';
import { createKpiHistoryPanel } from '../../src/ui';
import {
  byKpiClass,
  createKpiDocument,
  createKpiHistoryScenario,
  type KpiElement,
} from './kpi-history-fixture';

function fixture() {
  const document = createKpiDocument(),
    host = document.createElement('div'),
    opener = document.createElement('button'),
    scenario = createKpiHistoryScenario();
  let reads = 0,
    closes = 0;
  host.append(opener);
  opener.focus();
  const panel = createKpiHistoryPanel(host as unknown as HTMLElement, {
    read: () => {
      reads += 1;
      return readKpiHistory({ kpi: scenario.snapshot() });
    },
    onClose: () => {
      closes += 1;
    },
  });
  panel.getTrigger().hidden = true;
  return {
    document,
    host,
    opener,
    panel,
    scenario,
    reads: () => reads,
    closes: () => closes,
    dialog: () => {
      const root = host.children.find((child) => child.className === 'kpi-history');
      if (root === undefined) throw new Error('KPI history root is missing');
      return root.children[1]! as unknown as KpiElement;
    },
  };
}

test('267 KPI popup mounts the 12-month selection over the real 209 snapshot', () => {
  const f = fixture(),
    before = f.scenario.kpi.getStats();
  assert.equal(f.panel.open(), true);
  assert.equal(f.reads(), 1);
  const dialog = f.dialog(),
    tables = byKpiClass(dialog, 'kpi-history__table'),
    months = tables.find((table) => table.getAttribute('data-table') === 'months')!,
    distribution = tables.find((table) => table.getAttribute('data-table') === 'distribution')!,
    body = months.children.find((child) => child.tagName === 'tbody')!;
  assert.equal(body.children.length, 12);
  assert.equal(
    distribution.children.find((child) => child.tagName === 'tbody')?.children.length,
    6,
  );
  assert.equal(dialog.getAttribute('data-months'), '12');
  assert.equal(dialog.getAttribute('data-projection'), 'PROJECTED');
  assert.equal(f.panel.getStats().lastHistoryScans, 0);
  assert.equal(f.scenario.kpi.getStats().historyScans, before.historyScans);
});

test('267 KPI popup keeps no-data distinct from a real zero after mounting', () => {
  const f = fixture();
  f.panel.open();
  const dialog = f.dialog(),
    tables = byKpiClass(dialog, 'kpi-history__table'),
    months = tables.find((table) => table.getAttribute('data-table') === 'months')!,
    body = months.children.find((child) => child.tagName === 'tbody')!;
  const noData = body.children[3],
    zero = body.children[6];
  assert.equal(noData?.getAttribute('data-state'), 'NO_DATA');
  assert.match(noData?.textContent ?? '', /fără date/);
  assert.equal(zero?.getAttribute('data-state'), 'COMPLETE');
  assert.match(zero?.textContent ?? '', /0 SDA/);
  assert.notEqual(noData?.textContent, zero?.textContent);
});

test('267 KPI popup restores focus, closes with Escape and reads nothing while closed', () => {
  const f = fixture();
  f.panel.open();
  const dialog = f.dialog(),
    reads = f.reads();
  dialog.send('keydown', { key: 'Escape' });
  assert.equal(f.panel.isOpen(), false);
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.closes(), 1);
  assert.equal(f.panel.getStats().escapes, 1);
  assert.equal(f.panel.refresh(), 'SKIPPED_CLOSED');
  assert.equal(f.reads(), reads);
  assert.equal(f.panel.getStats().renders, 1);
});

test('267 KPI trigger is a native hidden button and the dialog stays a real dialog', () => {
  const f = fixture();
  assert.equal(f.panel.getTrigger().tagName, 'button');
  assert.equal(f.panel.getTrigger().hidden, true);
  assert.equal(f.dialog().getAttribute('role'), 'dialog');
  assert.equal(f.dialog().getAttribute('aria-modal'), 'true');
  assert.equal(f.panel.getStats().listeners, 3);
  assert.equal(f.panel.getStats().globalListeners, 0);
});
