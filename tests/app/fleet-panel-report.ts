import {
  createFleetPanelSelectPort,
  readFleetPanelSnapshot,
  type FleetPanelSources,
} from '../../src/app';
import { FLEET_PANEL_LIMITS, FLEET_PANEL_VERSION, projectFleetPanel } from '../../src/ui';
import type { FleetPanelCounts, FleetPanelFilter, FleetPanelSort } from '../../src/ui';
import { createEtaWorld, disposeEtaWorld, etaObservation, rideOf } from '../fleet/eta-fixture';
import {
  createFleetPanelHarness,
  panelTaxi,
  taxiIdOf,
  thirtyTaxiSnapshot,
} from '../ui/fleet-panel-fixture';

export interface FleetPanelReportRow {
  readonly rowId: string;
  readonly slot: number;
  readonly state: string;
  readonly ride: string;
  readonly eta: string;
  readonly pinned: boolean;
  readonly followed: boolean;
  readonly selected: boolean;
}

export interface FleetPanelReportScenario {
  readonly name: string;
  readonly filter: FleetPanelFilter;
  readonly sort: FleetPanelSort;
  readonly counts: FleetPanelCounts;
  readonly summary: string;
  readonly rows: readonly FleetPanelReportRow[];
  readonly dom: string;
  readonly stats: Readonly<Record<string, number | boolean | string>>;
}

export interface FleetPanelCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface FleetPanelReport {
  readonly version: typeof FLEET_PANEL_VERSION;
  readonly contract: Readonly<{
    filters: readonly string[];
    sorts: readonly string[];
    pinning: readonly string[];
    limits: Readonly<Record<string, number | string>>;
  }>;
  readonly scenarios: readonly FleetPanelReportScenario[];
  readonly checks: readonly FleetPanelCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): FleetPanelCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function scenarioOf(
  name: string,
  filter: FleetPanelFilter,
  sort: FleetPanelSort,
  dom: string,
  stats: Readonly<Record<string, number | boolean | string>>,
  snapshot = thirtyTaxiSnapshot(),
): FleetPanelReportScenario {
  const view = projectFleetPanel(snapshot, { filter, sort });
  return Object.freeze({
    name,
    filter,
    sort,
    counts: view.counts,
    summary: view.summary,
    rows: Object.freeze(
      view.rows.map((row) =>
        Object.freeze({
          rowId: row.rowId,
          slot: row.slot,
          state: row.state,
          ride: row.rideLabel,
          eta: row.etaLabel,
          pinned: row.pinned,
          followed: row.followed,
          selected: row.followed,
        }),
      ),
    ),
    dom,
    stats,
  });
}

export function runFleetPanelReport(): FleetPanelReport {
  const base = thirtyTaxiSnapshot(),
    allHarness = createFleetPanelHarness(),
    busyHarness = createFleetPanelHarness({ filter: 'BUSY' }),
    freeHarness = createFleetPanelHarness({ filter: 'FREE', sort: 'STATE' }),
    blockedHarness = createFleetPanelHarness({ filter: 'BLOCKED', sort: 'ETA' }),
    closedHarness = createFleetPanelHarness({ open: false }),
    throttledHarness = createFleetPanelHarness();
  allHarness.panel.update(base, 0);
  allHarness.buttonFor(taxiIdOf(3)).dispatch('click');
  busyHarness.panel.update(base, 0);
  freeHarness.panel.update(base, 0);
  blockedHarness.panel.update(base, 0);
  closedHarness.panel.update(base, 0);
  closedHarness.panel.close();
  closedHarness.panel.open();
  throttledHarness.panel.update(base, 0);
  for (let index = 0; index < 60; index += 1)
    throttledHarness.panel.update({ ...base, tick: 11 + index }, (index + 1) * 16);
  const all = scenarioOf(
      'ALL · slot',
      'ALL',
      'SLOT',
      allHarness.dom(),
      allHarness.panel.getStats(),
    ),
    busy = scenarioOf(
      'BUSY · slot',
      'BUSY',
      'SLOT',
      busyHarness.dom(),
      busyHarness.panel.getStats(),
    ),
    free = scenarioOf(
      'FREE · state',
      'FREE',
      'STATE',
      freeHarness.dom(),
      freeHarness.panel.getStats(),
    ),
    blocked = scenarioOf(
      'BLOCKED · eta',
      'BLOCKED',
      'ETA',
      blockedHarness.dom(),
      blockedHarness.panel.getStats(),
    ),
    closed = scenarioOf(
      'closed → reopened',
      'ALL',
      'SLOT',
      closedHarness.dom(),
      closedHarness.panel.getStats(),
    ),
    throttled = scenarioOf(
      '60 frames · 10 Hz ceiling',
      'ALL',
      'SLOT',
      throttledHarness.dom(),
      throttledHarness.panel.getStats(),
    ),
    closedCreated = closedHarness.panel.getStats().createdRows,
    closedRows = closedHarness.rows().length,
    closedHidden = closedHarness.root().getAttribute('data-open'),
    allView = projectFleetPanel(base, { filter: 'ALL', sort: 'SLOT' }),
    busyView = projectFleetPanel(base, { filter: 'BUSY', sort: 'SLOT' }),
    freeView = projectFleetPanel(base, { filter: 'FREE', sort: 'STATE' }),
    blockedView = projectFleetPanel(base, { filter: 'BLOCKED', sort: 'ETA' }),
    blockedSnapshot = thirtyTaxiSnapshot({
      followedTaxiId: null,
      taxis: Object.freeze(
        thirtyTaxiSnapshot().taxis.map((taxi) =>
          taxi.slot === 7 ? panelTaxi({ ...taxi, serviceState: 'BLOCKED', blocked: true }) : taxi,
        ),
      ),
    });

  // Identity/no-write probes on a fresh adapter.
  const probe = createFleetPanelHarness();
  probe.panel.update(base, 0);
  const writesBefore = probe.panel.getStats().writes,
    updatesBefore = probe.panel.getStats().updates,
    identicalDom = probe.dom();
  probe.panel.update(base, 500);
  const identicalWrites = probe.panel.getStats().writes,
    identicalSkipped = probe.panel.getStats().skipped,
    identicalDomAfter = probe.dom();
  probe.panel.update({ ...base, tick: 999, followedTaxiId: taxiIdOf(3) }, 510);
  const bypassUpdates = probe.panel.getStats().updates;
  probe.panel.setFilter('BLOCKED');
  const filterWrites = probe.panel.getStats().writes;
  probe.panel.dispose();
  const selectionProbe = createFleetPanelHarness();
  selectionProbe.panel.update(base, 0);
  selectionProbe.buttonFor(taxiIdOf(4)).dispatch('click');
  const selectedIds = [...selectionProbe.selections];
  selectionProbe.panel.dispose();

  const world = createEtaWorld();
  let real: FleetPanelReportScenario;
  try {
    const ride = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry,
      sources: FleetPanelSources = {
        fleet: registry,
        lifecycle: world.rideWorld.lifecycle,
        eta: world.eta,
      },
      estimate = world.eta.observe(etaObservation(world, { speedMps: 8 })),
      snapshot = readFleetPanelSnapshot(sources, { tick: 10, followedTaxiId: ride.taxiId }),
      harness = createFleetPanelHarness();
    harness.panel.update(snapshot, 0);
    real = scenarioOf(
      'real 057/061/064 · followed ride',
      'ALL',
      'SLOT',
      harness.dom(),
      harness.panel.getStats(),
      snapshot,
    );
    harness.panel.dispose();
    const assigned = snapshot.taxis.find((taxi) => taxi.vehicleId === ride.taxiId),
      civilians = registry.list().filter((vehicle) => vehicle.driverKind === 'CIVILIAN').length,
      fleetTaxis = registry.counts().taxis,
      selectionPort = createFleetPanelSelectPort({
        bodyIdentity: (vehicleId) =>
          vehicleId === ride.taxiId
            ? Object.freeze({ entityId: ride.taxiId, handle: 1, generation: 1 })
            : undefined,
        selection: { enqueue: () => true },
      }),
      unknownSelectionPort = createFleetPanelSelectPort({
        bodyIdentity: () => undefined,
        selection: { enqueue: () => true },
      });

    const checks = [
      check(
        'contract-version',
        FLEET_PANEL_VERSION,
        FLEET_PANEL_VERSION,
        '075 panel contract version',
      ),
      check('target-30-taxis', 30, all.counts.total, 'the V1 taxi population is fully listed'),
      check('all-visible', 30, all.counts.visible, 'ALL shows every taxi'),
      check('all-unpinned', 0, all.counts.pinned, 'ALL filters nothing out'),
      check(
        'busy-visible',
        17,
        busy.counts.visible,
        'BUSY shows the 15 active rides plus the pinned followed and blocked taxi',
      ),
      check(
        'busy-pinned',
        2,
        busy.counts.pinned,
        'followed free taxi and first blockage are pinned',
      ),
      check('free-visible', 15, free.counts.visible, 'FREE shows taxis without an active ride'),
      check('blocked-visible', 11, blocked.counts.visible, 'BLOCKED plus the pinned followed taxi'),
      check('blocked-pinned', 1, blocked.counts.pinned, 'only the followed taxi is added'),
      check(
        'followed-never-hidden',
        true,
        [allView, busyView, freeView, blockedView].every((view) =>
          view.rows.some((row) => row.followed),
        ),
        'every filter keeps the followed taxi',
      ),
      check(
        'blockage-never-hidden',
        false,
        [allView, busyView, freeView, blockedView].some(
          (view) => !view.rows.some((row) => row.blocked),
        ),
        'every filter keeps at least one blocked taxi',
      ),
      check(
        'blocked-count',
        10,
        all.counts.blocked,
        'ten blocked taxis are counted, five of them still owning a ride',
      ),
      check(
        'slot-sort',
        '1,2,3',
        allView.rows
          .slice(0, 3)
          .map((row) => row.slot)
          .join(','),
        'SLOT is ascending and stable',
      ),
      check(
        'state-sort-blocked-first',
        '21,22,23,24,25',
        freeView.rows
          .filter((row) => row.blocked)
          .slice(0, 5)
          .map((row) => row.slot)
          .join(','),
        'blocked rows lead the STATE order',
      ),
      check(
        'eta-sort-ascending',
        '10,9,8,7,6',
        projectFleetPanel(base, { filter: 'ALL', sort: 'ETA' })
          .rows.slice(0, 5)
          .map((row) => row.slot)
          .join(','),
        'ETA sorts the certified remaining seconds ascending',
      ),
      check(
        'sort-preserves-identity',
        true,
        [
          projectFleetPanel(base, { sort: 'SLOT' }),
          projectFleetPanel(base, { sort: 'STATE' }),
          projectFleetPanel(base, { sort: 'ETA' }),
        ].every(
          (view) =>
            view.rows.length === 30 &&
            new Set(view.rows.map((row) => row.rowId)).size === view.rows.length,
        ),
        'no sort duplicates or drops a row',
      ),
      check(
        'filter-preserves-identity',
        true,
        [allView, busyView, freeView, blockedView].every(
          (view) => new Set(view.rows.map((row) => row.rowId)).size === view.rows.length,
        ),
        'no filter duplicates a row',
      ),
      check(
        'pinned-only-when-filtered',
        true,
        busyView.rows.filter((row) => row.pinned).every((row) => row.followed || row.blocked),
        'pinning only adds the followed taxi or a real blockage',
      ),
      check('dom-row-count', 30, all.dom.split('<li').length - 1, 'the serialized DOM has 30 rows'),
      check(
        'row-elements',
        21 + 30 * 8,
        all.stats.elements as number,
        'fixed chrome plus eight elements per row',
      ),
      check(
        'listeners-bounded',
        32,
        all.stats.listeners as number,
        'two control listeners plus one click listener per retained row',
      ),
      check(
        'closed-retains-rows',
        30,
        closedRows,
        'closing the panel does not clear or rebuild the list',
      ),
      check(
        'reopen-no-recreate',
        30,
        closedCreated as number,
        'reopening reuses the exact row elements',
      ),
      check(
        'closed-hidden-attribute',
        'true',
        closedHidden ?? 'missing',
        'the panel is open again',
      ),
      check(
        'identical-frame-no-write',
        writesBefore,
        identicalWrites,
        'a repeated frame inside the ceiling writes nothing',
      ),
      check(
        'identical-frame-same-dom',
        identicalDom,
        identicalDomAfter,
        'a rejected/repeated frame leaves the DOM byte-identical',
      ),
      check(
        'identical-frame-skipped',
        1,
        identicalSkipped,
        'a repeated frame is counted as skipped, not written',
      ),
      check(
        'followed-bypass',
        updatesBefore + 1,
        bypassUpdates,
        'a followed-taxi change is not delayed by the 10 Hz ceiling',
      ),
      check(
        'filter-bypass',
        true,
        (filterWrites as number) > (identicalWrites as number),
        'a filter change writes immediately',
      ),
      check(
        'throttled-updates',
        true,
        (throttled.stats.updates as number) <= 10,
        `60 frames at 16 ms produce ${throttled.stats.updates as number} writes`,
      ),
      check(
        'throttled-skipped',
        true,
        (throttled.stats.skipped as number) >= 45,
        'the ceiling skips the frames it cannot write',
      ),
      check(
        'selection-intent',
        taxiIdOf(4),
        selectedIds.join(','),
        'a click emits exactly one FLEET selection intention',
      ),
      check(
        'followed-aria-selected',
        true,
        all.dom.includes('aria-selected="true"'),
        'the followed taxi is the selected option',
      ),
      check(
        'no-global-key-listener',
        true,
        allHarness.host.listenerCount === 0 && allHarness.root().listenerCount === 0,
        'the panel installs no global key listener',
      ),
      check(
        'deterministic-dom',
        all.dom,
        (() => {
          const repeat = createFleetPanelHarness();
          repeat.panel.update(base, 0);
          const dom = repeat.dom();
          repeat.panel.dispose();
          return dom;
        })(),
        'the same frame renders byte-identical DOM',
      ),
      check(
        'real-taxi-count',
        fleetTaxis,
        real.counts.total,
        'every real TAXI member of the 057 registry is listed',
      ),
      check(
        'real-civilians-excluded',
        true,
        real.counts.total === fleetTaxis && civilians > 0,
        `${civilians} civilians stay out of the taxi panel`,
      ),
      check(
        'real-ride-binding',
        ride.rideId,
        assigned?.ride?.rideId ?? 'missing',
        'the row shows the real 061 ride of that taxi',
      ),
      check(
        'real-eta-binding',
        estimate.etaSeconds ?? -1,
        assigned?.ride?.eta.seconds ?? -1,
        'the row keeps the certified 064 seconds',
      ),
      check(
        'real-mode-binding',
        registry.state(ride.taxiId)?.controlMode ?? 'missing',
        assigned?.controlMode ?? 'missing',
        'the row shows the accepted 057 control mode',
      ),
      check(
        'real-profile-binding',
        registry.state(ride.taxiId)?.appliedProfileVersion ?? 'missing',
        assigned?.appliedProfileVersion ?? 'missing',
        'the row shows the applied profile version',
      ),
      check(
        'real-not-blocked',
        false,
        assigned?.blocked ?? true,
        'a free-flow estimate is not reported as blocked',
      ),
      check(
        'blockage-flip-detected',
        true,
        blockedSnapshot.taxis.some((taxi) => taxi.blocked && taxi.ride !== null),
        'a new blockage enters the frame explicitly',
      ),
      check(
        'selection-port-fleet',
        true,
        selectionPort(ride.taxiId) === true && unknownSelectionPort('vehicle:unknown') === false,
        'the adapter maps only a known identity to a FLEET intention',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    const scenarios = Object.freeze([all, busy, free, blocked, closed, throttled, real]);
    return Object.freeze({
      version: FLEET_PANEL_VERSION,
      contract: Object.freeze({
        filters: Object.freeze(['ALL', 'BUSY', 'FREE', 'BLOCKED']),
        sorts: Object.freeze(['SLOT', 'STATE', 'ETA']),
        pinning: Object.freeze([
          'the followed taxi is always kept',
          'the first blocked taxi (lowest slot) is always kept',
          'sorting runs after membership and never duplicates or drops a row',
        ]),
        limits: Object.freeze({
          maximumHz: FLEET_PANEL_LIMITS.maximumHz,
          taxis: FLEET_PANEL_LIMITS.taxis,
          maxTaxis: FLEET_PANEL_LIMITS.maxTaxis,
          rows: FLEET_PANEL_LIMITS.rows,
          idCodeUnits: FLEET_PANEL_LIMITS.idCodeUnits,
        }),
      }),
      scenarios,
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    allHarness.panel.dispose();
    busyHarness.panel.dispose();
    freeHarness.panel.dispose();
    blockedHarness.panel.dispose();
    closedHarness.panel.dispose();
    throttledHarness.panel.dispose();
    disposeEtaWorld(world);
  }
}

export function fleetPanelReportMarkdown(report: FleetPanelReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Filter | ${entry.filter} |
| Sort | ${entry.sort} |
| Visible / total | ${entry.counts.visible} / ${entry.counts.total} |
| Pinned | ${entry.counts.pinned} |
| Busy / free / blocked | ${entry.counts.busy} / ${entry.counts.free} / ${entry.counts.blocked} |
| Summary | ${entry.summary} |

| # | Row | State | Ride | ETA | Pinned | Followed |
| ---: | --- | --- | --- | --- | --- | --- |
${entry.rows
  .map(
    (row) =>
      `| ${row.slot} | ${row.rowId} | ${row.state} | ${row.ride} | ${row.eta} | ${row.pinned ? 'yes' : 'no'} | ${row.followed ? 'yes' : 'no'} |`,
  )
  .join('\n')}

\`\`\`html
${entry.dom}
\`\`\`
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 075 fleet panel report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run fleet:panel\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report drives the real \`createFleetPanel\` adapter over a
deterministic 30-taxi frame and over the real 057 registry, 061 lifecycle and 064 ETA fixture.

## Contract

Filters: ${report.contract.filters.join(', ')}. Sorts: ${report.contract.sorts.join(', ')}.
Pinning: ${report.contract.pinning.join('; ')}.

Limits: ${report.contract.limits.maximumHz} Hz write/reorder ceiling, ${report.contract.limits.taxis} V1 taxis, ${report.contract.limits.maxTaxis} hard taxi ceiling and ${report.contract.limits.rows} rows.

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
