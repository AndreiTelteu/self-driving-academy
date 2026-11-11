import assert from 'node:assert/strict';
import test from 'node:test';
import { readExperimentComparison } from '../../src/experiments';
import type { ExperimentCompareReady } from '../../src/experiments';
import {
  EXPERIMENT_COMPARE_TEXT,
  EXPERIMENT_COMPARE_UI_VERSION,
  createExperimentComparePanel,
  emptyExperimentCompareView,
  formatExperimentCompareNumber,
  formatExperimentCompareShare,
  projectExperimentCompare,
} from '../../src/ui';
import type {
  ExperimentComparePanel,
  ExperimentComparePanelOptions,
  ExperimentCompareView,
} from '../../src/ui';
import { compareRequest, createCompareFixture } from '../experiments/experiment-compare-fixture';
import {
  type KpiElement,
  type KpiDocument,
  byKpiClass,
  createKpiDocument,
} from './kpi-history-fixture';

/**
 * PBI 143 UI tests. The view is projected from the real 143 read model (the six real 142 cohorts), so
 * the panel is asserted on the numbers the contract produces, never on hand-written ones.
 */

const fixture = createCompareFixture();
const result = readExperimentComparison(compareRequest(fixture));
if (result.status !== 'READY') throw new Error('143 UI fixture: the comparison refused');
const read: ExperimentCompareReady = result;
const view = projectExperimentCompare(read);

interface PanelHarness {
  readonly document: KpiDocument;
  readonly host: KpiElement;
  readonly panel: ExperimentComparePanel;
  readonly surfaces: boolean[];
  setRead(value: ExperimentCompareReady | null): void;
  trigger(): KpiElement;
  dialog(): KpiElement;
}

function createHarness(options: Partial<ExperimentComparePanelOptions> = {}): PanelHarness {
  const document = createKpiDocument();
  const host = document.createElement('div');
  const surfaces: boolean[] = [];
  let current: ExperimentCompareReady | null = read;
  const panel = createExperimentComparePanel(host as unknown as HTMLElement, {
    read: () => current,
    setSurface: (open) => {
      surfaces.push(open);
    },
    ...options,
  });
  return Object.freeze({
    document,
    host,
    panel,
    surfaces,
    setRead: (value: ExperimentCompareReady | null) => {
      current = value;
    },
    trigger: () => host.children[0]?.children[0] as unknown as KpiElement,
    dialog: () => host.children[0]?.children[1] as unknown as KpiElement,
  });
}

function tableOf(root: KpiElement, key: string): KpiElement {
  const table = byKpiClass(root, 'experiment-compare__table').find(
    (candidate) => candidate.getAttribute('data-table') === key,
  );
  if (table === undefined) throw new Error(`Missing table ${key}`);
  return table;
}

function rowsOf(table: KpiElement): KpiElement[] {
  const body = table.children.find((child) => child.tagName === 'tbody');
  return (body?.children ?? []) as KpiElement[];
}

function cellTexts(row: KpiElement): string[] {
  return row.children.map((cell) => cell.textContent);
}

test('143 UI the panel is one native trigger and one accessible dialog with no global listener', () => {
  const harness = createHarness();
  const trigger = harness.trigger();
  const dialog = harness.dialog();
  assert.equal(trigger.tagName, 'button');
  assert.equal(trigger.getAttribute('type'), 'button');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(trigger.getAttribute('aria-controls'), 'experiment-compare-dialog');
  assert.equal(trigger.textContent, EXPERIMENT_COMPARE_TEXT.trigger);
  assert.equal(dialog.tagName, 'section');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'experiment-compare-title');
  assert.equal(dialog.getAttribute('aria-describedby'), 'experiment-compare-description');
  assert.equal(dialog.hasAttribute('hidden'), true);
  assert.equal(dialog.getAttribute('data-version'), EXPERIMENT_COMPARE_UI_VERSION);
  const stats = harness.panel.getStats();
  assert.equal(stats.listeners, 3);
  assert.equal(stats.globalListeners, 0);
  assert.equal(stats.open, false);
  assert.equal(stats.reads, 0);
});

test('143 UI opening reads once, moves focus, calls the surface port and renders the counts', () => {
  const harness = createHarness();
  harness.trigger().focus();
  assert.equal(harness.panel.open(), true);
  assert.equal(harness.panel.open(), false);
  assert.equal(harness.panel.isOpen(), true);
  assert.ok(harness.document.activeElement !== null);
  assert.equal(harness.document.activeElement?.className, 'experiment-compare__close');
  const stats = harness.panel.getStats();
  assert.equal(stats.reads, 1);
  assert.equal(stats.renders, 1);
  assert.equal(stats.focusMoves, 1);
  assert.equal(stats.surfaceCalls, 1);
  assert.deepEqual(harness.surfaces, [true]);
  assert.equal(harness.trigger().getAttribute('aria-expanded'), 'true');
  assert.equal(harness.dialog().hasAttribute('hidden'), false);
  const dialog = harness.dialog();
  assert.equal(dialog.getAttribute('data-empty'), 'false');
  assert.equal(dialog.getAttribute('data-divergent'), '43');
  assert.equal(dialog.getAttribute('data-decisions'), '144');
  assert.equal(dialog.getAttribute('data-cohorts'), '6');
  assert.equal(dialog.getAttribute('data-visible'), '96');
  assert.equal(dialog.getAttribute('data-invisible'), '192');
  assert.equal(dialog.getAttribute('data-seeds'), '3');
  assert.equal(dialog.getAttribute('data-coexisting'), '3');
  assert.equal(dialog.getAttribute('data-charts'), '4');
  assert.equal(dialog.getAttribute('data-tables'), '9');
  assert.equal(stats.charts, 4);
  assert.equal(stats.tables, 9);
  assert.equal(stats.empty, false);
});

test('143 UI the cause, parameter and category tables keep every distribution row', () => {
  const harness = createHarness({ open: true });
  const dialog = harness.dialog();
  const causes = rowsOf(tableOf(dialog, 'causes'));
  assert.equal(causes.length, 4);
  assert.deepEqual(
    causes.map((row) => cellTexts(row).slice(0, 2)),
    [
      ['Prag de probabilitate', '37'],
      ['Parametru de geometrie', '6'],
      ['Divergență de seed', '0'],
      ['Neatribuită', '0'],
    ],
  );
  const parameters = rowsOf(tableOf(dialog, 'parameters'));
  assert.equal(parameters.length, 4);
  assert.deepEqual(
    parameters.map((row) => cellTexts(row)),
    [
      ['Probabilitate de oprire la roșu', '20', '46,5%'],
      ['Probabilitate de oprire completă', '17', '39,5%'],
      ['Durată a opririi complete', '4', '9,3%'],
      ['Distanță de oprire înaintea liniei', '2', '4,7%'],
    ],
  );
  const categories = rowsOf(tableOf(dialog, 'categories'));
  assert.equal(categories.length, 2);
  assert.deepEqual(
    categories.map((row) => cellTexts(row)),
    [
      ['Semafoare', '72', '144', '22'],
      ['STOP', '72', '144', '21'],
    ],
  );
  const divergences = rowsOf(tableOf(dialog, 'divergences'));
  assert.equal(divergences.length, 43);
  assert.equal(view.distribution.parameters.length, 4);
});

test('143 UI exposure is printed as counts on the real tick window', () => {
  const harness = createHarness({ open: true });
  const dialog = harness.dialog();
  const exposure = rowsOf(tableOf(dialog, 'exposure'));
  assert.equal(exposure.length, 6);
  assert.deepEqual(cellTexts(exposure[0] as KpiElement), [
    'identical-pair',
    '61–84 (24 tickuri)',
    'CONTROLLED_FIXTURE',
    '48',
    '16',
    '32',
  ]);
  assert.equal(view.exposure.evaluations, 288);
  assert.equal(view.exposure.visible, 96);
  assert.equal(view.exposure.invisible, 192);
  assert.equal(view.exposure.visibleFraction, 0.333333);
  const note = byKpiClass(dialog, 'experiment-compare__exposure')[0];
  assert.equal(note?.textContent, '288 evaluări: 96 vizibile, 192 invizibile.');
});

test('143 UI the seed count and the declared uncertainty are shown, not hidden', () => {
  const harness = createHarness({ open: true });
  const dialog = harness.dialog();
  const seeds = rowsOf(tableOf(dialog, 'seeds'));
  assert.equal(seeds.length, 3);
  assert.deepEqual(
    seeds.map((row) => cellTexts(row).slice(0, 3)),
    [
      ['142000', '00022ab0', '51107408'],
      ['142001', '00022ab1', '620e6961'],
      ['142002', '00022ab2', '75183992'],
    ],
  );
  const status = byKpiClass(dialog, 'experiment-compare__uncertainty-status')[0];
  assert.equal(status?.textContent, 'Eșantion cu mai multe seed-uri');
  const statement = byKpiClass(dialog, 'experiment-compare__uncertainty')[0];
  assert.match(statement?.textContent ?? '', /3 seed-uri distincte/);
  assert.match(statement?.textContent ?? '', /nu se raportează un interval de încredere/);
  const limitations = byKpiClass(dialog, 'experiment-compare__limitations')[0];
  assert.equal(limitations?.children.length, 4);
  const spread = byKpiClass(dialog, 'experiment-compare__uncertainty-spread')[0];
  assert.equal(spread?.textContent, 'Diferențe pe seed: minim 10, maxim 20, spread 10.');
  assert.equal(view.counts.seeds, 3);
});

test('143 UI the isolated scenarios show that only the target parameter moved', () => {
  const harness = createHarness({ open: true });
  const dialog = harness.dialog();
  const isolated = rowsOf(tableOf(dialog, 'isolated'));
  assert.equal(isolated.length, 2);
  assert.deepEqual(cellTexts(isolated[0] as KpiElement), [
    'isolated-red-stop-probability',
    'Probabilitate de oprire la roșu (probability)',
    '1 → 0',
    '10',
    'doar red_stop_probability se schimbă',
  ]);
  assert.equal(isolated[0]?.getAttribute('data-state'), 'ISOLATED');
  assert.deepEqual(cellTexts(isolated[1] as KpiElement).slice(0, 4), [
    'isolated-red-stop-line-offset',
    'Distanță de oprire înaintea liniei (m)',
    '1,2 → 5',
    '2',
  ]);
});

test('143 UI coexisting causes are rendered as two causes on one opportunity', () => {
  const harness = createHarness({ open: true });
  const dialog = harness.dialog();
  const coexistence = rowsOf(tableOf(dialog, 'coexistence'));
  assert.equal(coexistence.length, 3);
  assert.deepEqual(cellTexts(coexistence[1] as KpiElement), [
    'opportunity-15',
    'Semafoare',
    'Prag de probabilitate + Parametru de geometrie',
    'Probabilitate de oprire la roșu + Distanță de oprire înaintea liniei',
  ]);
  assert.equal(coexistence[1]?.getAttribute('data-state'), 'COEXISTS');
  assert.equal(view.counts.coexisting, 3);
});

test('143 UI a 138/139 delta is shown with its real values and an unavailable one keeps its reason', () => {
  const harness = createHarness({ open: true });
  const dialog = harness.dialog();
  const metrics = rowsOf(tableOf(dialog, 'metrics'));
  assert.equal(metrics.length, 2);
  assert.deepEqual(cellTexts(metrics[0] as KpiElement), [
    'overall.violationRate (%)',
    'Comportament 138',
    '0',
    '50',
    '+50',
    'DELTA',
  ]);
  assert.deepEqual(cellTexts(metrics[1] as KpiElement), [
    'overall.meanAccelerationAbsMps2 (m/s²)',
    'Confort 139',
    '1,2',
    '2,1',
    '+0,9',
    'DELTA',
  ]);
  const projected = projectExperimentCompare({
    ...read,
    metrics: [
      {
        ...(read.metrics[0] as NonNullable<(typeof read.metrics)[0]>),
        left: null,
        delta: null,
        state: 'UNAVAILABLE',
        reason: 'LEFT_UNAVAILABLE',
        direction: null,
      },
    ],
  });
  assert.equal(projected.metrics[0]?.deltaLabel, EXPERIMENT_COMPARE_TEXT.unavailable);
  assert.equal(projected.metrics[0]?.reasonLabel, 'valoarea din stânga este indisponibilă');
  assert.equal(projected.metrics[0]?.state, 'UNAVAILABLE');
});

test('143 UI the summary names the distribution instead of one parameter', () => {
  const harness = createHarness({ open: true });
  const dialog = harness.dialog();
  const summary = byKpiClass(dialog, 'experiment-compare__summary-detail')[0];
  assert.match(summary?.textContent ?? '', /4 parametri/);
  assert.match(
    summary?.textContent ?? '',
    /restul diferențelor sunt distribuite pe 3 alți parametri/,
  );
  assert.match(summary?.textContent ?? '', /0 neatribuite/);
  const attribution = byKpiClass(dialog, 'experiment-compare__attribution')[0];
  assert.equal(attribution?.textContent, 'Distribuție: Semafoare 22/144, STOP 21/144.');
});

test('143 UI Tab stays inside the dialog and Escape closes and restores the focus', () => {
  const harness = createHarness();
  harness.trigger().focus();
  harness.trigger().send('click');
  assert.equal(harness.panel.isOpen(), true);
  const dialog = harness.dialog();
  assert.equal(harness.document.activeElement?.className, 'experiment-compare__close');
  dialog.send('keydown', { key: 'Tab' });
  assert.equal(harness.document.activeElement?.className, 'experiment-compare__body');
  dialog.send('keydown', { key: 'Tab' });
  assert.equal(harness.document.activeElement?.className, 'experiment-compare__close');
  dialog.send('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(harness.document.activeElement?.className, 'experiment-compare__body');
  dialog.send('keydown', { key: 'Escape' });
  assert.equal(harness.panel.isOpen(), false);
  assert.equal(harness.document.activeElement?.className, 'experiment-compare__trigger');
  assert.equal(harness.dialog().hasAttribute('hidden'), true);
  assert.equal(harness.trigger().getAttribute('aria-expanded'), 'false');
  assert.deepEqual(harness.surfaces, [true, false]);
  const stats = harness.panel.getStats();
  assert.equal(stats.escapes, 1);
  assert.equal(stats.focusRestores, 1);
  assert.equal(stats.tabWraps, 2);
  assert.equal(stats.globalListeners, 0);
});

test('143 UI a closed or unchanged panel re-reads nothing', () => {
  const harness = createHarness();
  assert.equal(harness.panel.refresh(), 'SKIPPED_CLOSED');
  assert.equal(harness.panel.getStats().reads, 0);
  harness.panel.open();
  assert.equal(harness.panel.refresh(), 'SKIPPED_UNCHANGED');
  assert.equal(harness.panel.getStats().reads, 2);
  assert.equal(harness.panel.getStats().renders, 1);
  harness.setRead(null);
  assert.equal(harness.panel.refresh(), 'RENDERED');
  assert.equal(harness.panel.getStats().renders, 2);
  assert.equal(harness.dialog().getAttribute('data-empty'), 'true');
  assert.equal(harness.dialog().getAttribute('data-divergent'), '0');
  const empty = byKpiClass(harness.dialog(), 'experiment-compare__empty')[0];
  assert.equal(empty?.hasAttribute('hidden'), false);
  assert.equal(empty?.textContent, EXPERIMENT_COMPARE_TEXT.empty);
});

test('143 UI the empty view is closed, deterministic and invents no numbers', () => {
  const empty = emptyExperimentCompareView();
  assert.equal(empty.empty, true);
  assert.equal(empty.signature, 'empty');
  assert.equal(empty.counts.divergent, 0);
  assert.equal(empty.counts.seeds, 0);
  assert.deepEqual([...empty.charts], []);
  assert.equal(empty.exposure.visibleFraction, null);
  assert.deepEqual([...empty.exposure.windows], []);
  assert.equal(empty.distribution.criterionSatisfied, true);
  assert.equal(empty.uncertainty.limitations.length, 0);
  assert.equal(formatExperimentCompareNumber(null), EXPERIMENT_COMPARE_TEXT.unavailable);
  assert.equal(formatExperimentCompareNumber(0.9), '0,9');
  assert.equal(formatExperimentCompareShare(null), '—');
  assert.equal(formatExperimentCompareShare(1 / 3), '33,3%');
});

test('143 UI dispose removes every listener and the owned tree', () => {
  const harness = createHarness({ open: true });
  harness.panel.dispose();
  const stats = harness.panel.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.listeners, 0);
  assert.equal(stats.elements, 0);
  assert.equal(harness.panel.getView(), null);
  assert.equal(harness.host.children.length, 0);
  assert.throws(() => harness.panel.open(), /disposed/);
  assert.deepEqual(harness.surfaces, [true, false]);
});

test('143 UI invalid options are refused before mounting anything', () => {
  const document = createKpiDocument();
  const host = document.createElement('div') as unknown as HTMLElement;
  assert.throws(
    () =>
      createExperimentComparePanel(host, {
        read: null as unknown as () => ExperimentCompareReady | null,
      }),
    /read port/,
  );
  assert.throws(
    () =>
      createExperimentComparePanel(host, {
        read: () => null,
        setSurface: 'nope' as unknown as (open: boolean) => void,
      }),
    /surface port/,
  );
  assert.throws(
    () => createExperimentComparePanel(host, { read: () => null, idPrefix: '' }),
    /id prefix/,
  );
  assert.equal(host.children.length, 0);
});

test('143 UI the view keeps the real chart series and bar heights', () => {
  const causeChart = view.charts.find((chart) => chart.key === 'CAUSE_DISTRIBUTION');
  assert.ok(causeChart !== undefined);
  assert.equal(causeChart.groups.length, 4);
  assert.deepEqual(
    causeChart.groups.map((group) => [group.key, group.bars[0]?.value, group.bars[0]?.percent]),
    [
      ['PROBABILITY_THRESHOLD', 37, 100],
      ['GEOMETRY_PARAMETER', 6, 16.2],
      ['SEED_DIVERGENCE', 0, 0],
      ['UNCLASSIFIED', 0, 0],
    ],
  );
  const exposureChart = view.charts.find((chart) => chart.key === 'EXPOSURE');
  assert.ok(exposureChart !== undefined);
  assert.deepEqual(
    exposureChart.groups[0]?.bars.map((bar) => [bar.series, bar.value, bar.percent]),
    [
      ['VISIBLE', 96, 50],
      ['INVISIBLE', 192, 100],
    ],
  );
  const harness = createHarness({ open: true });
  const bars = byKpiClass(harness.dialog(), 'experiment-compare__chart-bar');
  assert.equal(bars.length, 12);
  assert.equal(byKpiClass(harness.dialog(), 'experiment-compare__chart').length, 4);
  const projected: ExperimentCompareView = projectExperimentCompare(read);
  assert.equal(projected.signature, read.signature);
});
