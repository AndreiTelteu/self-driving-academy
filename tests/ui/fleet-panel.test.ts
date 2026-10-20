import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  createFleetPanelSelectPort,
  readFleetPanelSnapshot,
  type FleetPanelSources,
} from '../../src/app';
import {
  FLEET_PANEL_LIMITS,
  FLEET_PANEL_VERSION,
  parseFleetPanelSnapshot,
  projectFleetPanel,
} from '../../src/ui';
import type { FleetPanelFilter, FleetPanelRow, FleetPanelSnapshot } from '../../src/ui';
import { createEtaWorld, disposeEtaWorld, etaObservation, rideOf } from '../fleet/eta-fixture';
import type { EtaWorld } from '../fleet/eta-fixture';
import { runFleetPanelReport } from '../app/fleet-panel-report';
import {
  createFleetPanelHarness,
  panelTaxi,
  taxiIdOf,
  thirtyTaxiSnapshot,
  viewOf,
} from './fleet-panel-fixture';

function idsOf(rows: readonly FleetPanelRow[]): string[] {
  return rows.map((row) => row.rowId);
}

function slotsOf(rows: readonly FleetPanelRow[]): number[] {
  return rows.map((row) => row.slot);
}

function disposeWorld(world: EtaWorld | null): void {
  if (world !== null) disposeEtaWorld(world);
}

test('075 parser rejects malformed, duplicated, over-capacity and contradictory frames', () => {
  const valid = thirtyTaxiSnapshot();
  assert.equal(parseFleetPanelSnapshot(valid).taxis.length, 30);
  assert.deepEqual(parseFleetPanelSnapshot(valid).tick, 10);

  assert.throws(() => parseFleetPanelSnapshot({ ...valid, version: '074-minimap-v1' }), /contract/);
  assert.throws(() => parseFleetPanelSnapshot({ ...valid, units: 'IMPERIAL' }), /contract/);
  assert.throws(() => parseFleetPanelSnapshot({ ...valid, tick: -1 }), /tick/);
  assert.throws(() => parseFleetPanelSnapshot({ ...valid, tick: 1.5 }), /tick/);
  assert.throws(() => parseFleetPanelSnapshot({ ...valid, extra: true }), /fields/);
  assert.throws(
    () => parseFleetPanelSnapshot({ ...valid, sessionId: 'x'.repeat(513) }),
    /session identity/,
  );
  const duplicate = Object.freeze([valid.taxis[0]!, valid.taxis[0]!]);
  assert.throws(() => parseFleetPanelSnapshot({ ...valid, taxis: duplicate }), /duplicate taxi/);
  const tooMany = Object.freeze(
    Array.from({ length: FLEET_PANEL_LIMITS.maxTaxis + 1 }, (_, index) =>
      panelTaxi({ vehicleId: `taxi:075:extra:${index}`, slot: index + 1 }),
    ),
  );
  assert.throws(() => parseFleetPanelSnapshot({ ...valid, taxis: tooMany }), /taxi ceiling/);
  assert.throws(
    () => parseFleetPanelSnapshot({ ...valid, taxis: [panelTaxi({ slot: 0 })] }),
    /slot/,
  );
  assert.throws(
    () =>
      parseFleetPanelSnapshot({
        ...valid,
        taxis: [panelTaxi({ blocked: true, serviceState: null })],
      }),
    /blocked flag/,
  );
  assert.throws(
    () =>
      parseFleetPanelSnapshot({
        ...valid,
        taxis: [
          panelTaxi({
            ride: {
              rideId: 'ride:075:bad',
              state: 'TO_PICKUP',
              pickupZoneId: 'zone:p',
              dropoffZoneId: 'zone:d',
              eta: {
                status: 'ESTIMATED',
                reason: null,
                serviceState: 'FREE_FLOW',
                seconds: 90,
                minSeconds: 200,
                maxSeconds: 100,
                progressFraction: 0.5,
                remainingDistanceM: 10,
              },
            },
          }),
        ],
      }),
    /inverted/,
  );
  assert.throws(
    () =>
      parseFleetPanelSnapshot({
        ...valid,
        taxis: [
          panelTaxi({
            ride: {
              rideId: 'ride:075:bad',
              state: 'TO_PICKUP',
              pickupZoneId: 'zone:p',
              dropoffZoneId: 'zone:d',
              eta: {
                status: 'UNAVAILABLE',
                reason: 'SERVICE_BLOCKED',
                serviceState: 'BLOCKED',
                seconds: 5,
                minSeconds: null,
                maxSeconds: null,
                progressFraction: null,
                remainingDistanceM: null,
              },
            },
          }),
        ],
      }),
    /must not carry a value/,
  );
});

test('075 all 30 taxis are listed with stable identity, slot text and accessible rows', () => {
  const harness = createFleetPanelHarness();
  harness.panel.update(thirtyTaxiSnapshot(), 0);
  const rows = harness.rows(),
    stats = harness.panel.getStats();
  assert.equal(rows.length, 30);
  assert.equal(stats.rows, 30);
  assert.equal(stats.createdRows, 30);
  assert.equal(stats.retainedRows, 30);
  assert.equal(stats.elements, 21 + 30 * 8);
  assert.equal(stats.textNodes, 13 + 30 * 6);
  assert.equal(stats.listeners, 2 + 30);
  assert.equal(stats.retainedViews, 1);
  assert.equal(harness.root().getAttribute('role'), null);
  const list = harness.root().children[2]!;
  assert.equal(list.getAttribute('role'), 'listbox');
  const first = rows[0]!,
    button = first.children[0]!;
  assert.equal(first.getAttribute('role'), 'presentation');
  assert.equal(button.tagName, 'button');
  assert.equal(button.getAttribute('role'), 'option');
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.children[0]!.textContent, 'Taxi #1');
  for (const item of rows) {
    const rowButton = item.children[0]!;
    assert.equal(rowButton.children.length, 6);
    for (const cell of rowButton.children) assert.ok(cell.textContent.trim().length > 0);
    assert.ok((rowButton.getAttribute('aria-label') ?? '').includes('Taxi #'));
    assert.match(item.getAttribute('data-state') ?? '', /^(BLOCKED|BUSY|FREE)$/);
  }
  const ids = rows.map((item) => item.getAttribute('data-vehicle-id'));
  assert.equal(new Set(ids).size, 30);
  assert.equal(ids[11], taxiIdOf(12));
  harness.panel.dispose();
});

test('075 filters never hide the followed taxi or the first blockage', () => {
  const snapshot = thirtyTaxiSnapshot(),
    all = projectFleetPanel(snapshot, { filter: 'ALL' }),
    busy = projectFleetPanel(snapshot, { filter: 'BUSY' }),
    free = projectFleetPanel(snapshot, { filter: 'FREE' }),
    blocked = projectFleetPanel(snapshot, { filter: 'BLOCKED' });
  assert.deepEqual(all.counts, {
    total: 30,
    visible: 30,
    pinned: 0,
    hidden: 0,
    busy: 10,
    free: 10,
    blocked: 10,
    followed: 1,
  });
  // BUSY also includes the five blocked taxis that still own an active ride.
  assert.equal(busy.counts.visible, 17);
  assert.equal(busy.counts.pinned, 2);
  assert.equal(free.counts.visible, 15);
  assert.equal(free.counts.pinned, 0);
  assert.equal(blocked.counts.visible, 11);
  assert.equal(blocked.counts.pinned, 1);
  const followed = busy.rows.find((row) => row.followed);
  assert.ok(followed);
  assert.equal(followed.slot, 12);
  assert.equal(followed.pinned, true, 'the followed free taxi survives the BUSY filter');
  assert.equal(followed.rideState, null);
  const anchor = busy.rows.find((row) => row.slot === 21);
  assert.ok(anchor, 'the first blockage survives the BUSY filter');
  assert.equal(anchor.blocked, true);
  assert.equal(anchor.pinned, true);
  assert.equal(free.rows.filter((row) => row.blocked).length, 5, 'every blocked taxi is visible');
  assert.equal(blocked.rows.find((row) => row.followed)?.pinned, true);
  assert.equal(busy.rows.filter((row) => row.pinned).length, 2);
  const adapter = createFleetPanelHarness();
  adapter.panel.update(snapshot, 0);
  adapter.panel.setFilter('BUSY');
  assert.equal(adapter.rows().length, 17);
  assert.equal(adapter.panel.getView()?.counts.pinned, 2);
  assert.equal(adapter.root().getAttribute('data-visible'), '17');
  for (const filter of ['ALL', 'BUSY', 'FREE', 'BLOCKED'] as FleetPanelFilter[]) {
    adapter.panel.setFilter(filter);
    const view = adapter.panel.getView()!;
    assert.equal(view.rows.length, adapter.rows().length);
    assert.equal(new Set(idsOf(view.rows)).size, view.rows.length);
    assert.ok(
      view.rows.some((row) => row.followed),
      `followed row missing under ${filter}`,
    );
    assert.ok(
      view.rows.some((row) => row.blocked),
      `blocked row missing under ${filter}`,
    );
  }
  adapter.panel.dispose();
});

test('075 sorting is stable, never duplicates or drops, and keeps deterministic order', () => {
  const snapshot = thirtyTaxiSnapshot(),
    slot = projectFleetPanel(snapshot, { sort: 'SLOT' }),
    state = projectFleetPanel(snapshot, { sort: 'STATE' }),
    eta = projectFleetPanel(snapshot, { sort: 'ETA' });
  assert.deepEqual(
    slotsOf(slot.rows),
    Array.from({ length: 30 }, (_, index) => index + 1),
  );
  for (const view of [slot, state, eta]) {
    assert.equal(view.rows.length, 30);
    assert.equal(new Set(idsOf(view.rows)).size, 30);
    assert.deepEqual(
      new Set(idsOf(view.rows)),
      new Set(idsOf(slot.rows)),
      'every sort keeps exactly the same identities',
    );
  }
  assert.deepEqual(
    slotsOf(state.rows),
    [
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 4, 8, 1, 5, 9, 2, 6, 10, 3, 7, 11, 12, 13, 14, 15, 16,
      17, 18, 19, 20,
    ],
  );
  assert.deepEqual(
    slotsOf(eta.rows),
    [
      10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30,
    ],
  );
  const etaSeconds = eta.rows
    .filter((row) => row.etaSeconds !== null)
    .map((row) => row.etaSeconds!);
  assert.deepEqual(etaSeconds, [30, 37, 44, 51, 58, 65, 72, 79, 86, 93]);
  assert.equal(
    eta.rows.slice(10).every((row) => row.etaSeconds === null),
    true,
  );
  const adapter = createFleetPanelHarness();
  adapter.panel.update(snapshot, 0);
  adapter.panel.setSort('ETA');
  assert.deepEqual(
    adapter.rows().map((item) => Number(item.getAttribute('data-vehicle-id')!.slice(-2))),
    slotsOf(eta.rows),
  );
  adapter.panel.setSort('STATE');
  assert.deepEqual(
    adapter.rows().map((item) => Number(item.getAttribute('data-vehicle-id')!.slice(-2))),
    slotsOf(state.rows),
  );
  assert.equal(adapter.panel.getStats().createdRows, 30, 'reordering reuses every row element');
  assert.equal(adapter.panel.getStats().moves > 0, true);
  adapter.panel.dispose();
});

test('075 a closed panel keeps its rows and reopening recreates nothing', () => {
  const harness = createFleetPanelHarness({ open: false });
  assert.equal(harness.root().getAttribute('hidden'), '');
  harness.panel.update(thirtyTaxiSnapshot(), 0);
  const created = harness.panel.getStats().createdRows,
    rowRefs = harness.rows(),
    rowTexts = rowRefs.map((item) => item.textContent);
  assert.equal(rowRefs.length, 30);
  harness.panel.close();
  assert.equal(harness.root().getAttribute('hidden'), '');
  assert.equal(harness.rows().length, 30, 'closing only hides, it never clears rows');
  harness.panel.open();
  assert.equal(harness.root().hasAttribute('hidden'), false);
  assert.equal(harness.panel.getStats().createdRows, created);
  assert.ok(
    harness.rows().every((item, index) => item === rowRefs[index]),
    'reopening reuses the exact row elements',
  );
  assert.deepEqual(
    harness.rows().map((item) => item.textContent),
    rowTexts,
    'reopening the same snapshot rewrites no row text',
  );
  // A filter change while closed still updates the retained rows, not a rebuilt list.
  harness.panel.close();
  const writes = harness.panel.getStats().writes;
  harness.panel.setFilter('BLOCKED');
  assert.equal(harness.rows().length, 11);
  assert.equal(harness.panel.getStats().createdRows, created);
  assert.ok((harness.panel.getStats().writes as number) > (writes as number));
  harness.panel.open();
  assert.equal(harness.rows().length, 11);
  assert.equal(harness.panel.getStats().createdRows, created);
  harness.panel.dispose();
});

test('075 writes are capped at 10 Hz while identity changes bypass the ceiling', () => {
  const harness = createFleetPanelHarness(),
    base = thirtyTaxiSnapshot();
  harness.panel.update(base, 0);
  const firstWrites = harness.panel.getStats().writes;
  for (let index = 0; index < 60; index += 1) {
    harness.panel.update(
      { ...base, tick: 11 + index, followedTaxiId: base.followedTaxiId },
      (index + 1) * 16,
    );
  }
  const stats = harness.panel.getStats();
  assert.ok((stats.updates as number) <= 10, `updates ${stats.updates}`);
  assert.ok((stats.updates as number) >= 2);
  assert.ok((stats.skipped as number) >= 45);
  assert.ok((stats.writes as number) > (firstWrites as number));
  const beforeBypass = harness.panel.getStats().updates as number;
  harness.panel.update({ ...base, tick: 200, followedTaxiId: taxiIdOf(3) }, 960);
  assert.equal(harness.panel.getStats().updates as number, beforeBypass + 1);
  assert.equal(harness.root().getAttribute('data-followed'), taxiIdOf(3));
  const beforeBlocked = harness.panel.getStats().updates as number,
    blockedBase = thirtyTaxiSnapshot().taxis.map((taxi) =>
      taxi.slot === 5 ? panelTaxi({ ...taxi, serviceState: 'BLOCKED', blocked: true }) : taxi,
    );
  harness.panel.update(
    { ...base, tick: 201, followedTaxiId: taxiIdOf(3), taxis: Object.freeze(blockedBase) },
    970,
  );
  assert.equal(harness.panel.getStats().updates as number, beforeBlocked + 1);
  assert.equal(harness.panel.getView()?.rows.find((row) => row.slot === 5)?.state, 'BLOCKED');
  const beforeFilter = harness.panel.getStats().writes as number;
  harness.panel.setFilter('BUSY');
  assert.ok((harness.panel.getStats().writes as number) > beforeFilter);
  const beforeSort = harness.panel.getStats().writes as number;
  harness.panel.setSort('ETA');
  assert.ok((harness.panel.getStats().writes as number) > beforeSort);
  harness.panel.dispose();
});

test('075 an identical frame writes nothing and a throttled frame still advances the tick', () => {
  const harness = createFleetPanelHarness(),
    snapshot = thirtyTaxiSnapshot();
  harness.panel.update(snapshot, 0);
  const writes = harness.panel.getStats().writes,
    updates = harness.panel.getStats().updates;
  harness.panel.update(snapshot, 50);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().updates, updates);
  assert.equal(harness.panel.getStats().skipped, 1);
  harness.panel.update({ ...snapshot, tick: 11 }, 60);
  assert.equal(harness.panel.getStats().skipped, 2, 'inside the ceiling window nothing is written');
  assert.equal(harness.panel.getStats().writes, writes);
  harness.panel.update({ ...snapshot, tick: 12 }, 120);
  assert.equal(harness.panel.getStats().updates, updates + 1);
  assert.equal(harness.root().getAttribute('data-tick'), '12');
  assert.ok((harness.panel.getStats().writes as number) > (writes as number));
  harness.panel.dispose();
});

test('075 clicking a row emits the selection intent and aria-selected tracks the followed taxi', () => {
  const harness = createFleetPanelHarness(),
    snapshot = thirtyTaxiSnapshot();
  harness.panel.update(snapshot, 0);
  const followedButton = harness.buttonFor(taxiIdOf(12));
  assert.equal(followedButton.getAttribute('aria-selected'), 'true');
  assert.match(followedButton.getAttribute('aria-label') ?? '', /taxi urmărit/);
  const otherButton = harness.buttonFor(taxiIdOf(3));
  assert.equal(otherButton.getAttribute('aria-selected'), 'false');
  otherButton.dispatch('click');
  followedButton.dispatch('click');
  assert.deepEqual(harness.selections, [taxiIdOf(3), taxiIdOf(12)]);
  const status = harness.status();
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.match(status.textContent, /Filtru Toate, sortare Slot: 30 din 30 taxiuri/);
  // No global/root key listener exists; only the row buttons and the two selects are interactive.
  assert.equal(harness.host.listenerCount, 0);
  assert.equal(harness.root().listenerCount, 0);
  assert.equal(harness.root().children[2]!.listenerCount, 0);
  assert.equal(harness.panel.getStats().listeners, 2 + 30);
  harness.panel.dispose();
});

test('075 selecting through the filter/sort controls keeps state and row texts in sync', () => {
  const harness = createFleetPanelHarness(),
    snapshot = thirtyTaxiSnapshot();
  harness.panel.update(snapshot, 0);
  const filterSelect = harness.filterSelect(),
    sortSelect = harness.sortSelect();
  filterSelect.value = 'BLOCKED';
  filterSelect.dispatch('change');
  assert.equal(harness.panel.getView()?.filter, 'BLOCKED');
  assert.equal(harness.rows().length, 11);
  assert.equal(harness.root().getAttribute('data-filter'), 'BLOCKED');
  sortSelect.value = 'STATE';
  sortSelect.dispatch('change');
  assert.equal(harness.panel.getView()?.sort, 'STATE');
  assert.equal(harness.root().getAttribute('data-sort'), 'STATE');
  assert.equal(harness.rows()[0]!.getAttribute('data-vehicle-id'), taxiIdOf(21));
  filterSelect.value = 'NOT_A_FILTER';
  filterSelect.dispatch('change');
  assert.equal(harness.panel.getView()?.filter, 'BLOCKED', 'an unknown control value is ignored');
  harness.panel.dispose();
});

test('075 malformed, stale and out-of-clock frames never touch the DOM', () => {
  const harness = createFleetPanelHarness(),
    snapshot = thirtyTaxiSnapshot();
  harness.panel.update(snapshot, 0);
  const dom = harness.dom(),
    writes = harness.panel.getStats().writes;
  assert.throws(
    () =>
      harness.panel.update(
        { ...snapshot, version: '074-minimap-v1' } as unknown as FleetPanelSnapshot,
        10,
      ),
    /contract/,
  );
  assert.throws(() => harness.panel.update({ ...snapshot, tick: 9 }, 10), /Stale/);
  assert.throws(() => harness.panel.update({ ...snapshot, tick: 11 }, -1), /clock/);
  assert.throws(
    () => harness.panel.update({ ...snapshot, tick: 11, sessionId: '' }, 10),
    /session identity/,
  );
  assert.equal(harness.dom(), dom);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().updates, 1);
  harness.panel.dispose();
});

test('075 lifecycle is bounded, idempotent and owns every node and listener', () => {
  const harness = createFleetPanelHarness();
  harness.panel.update(thirtyTaxiSnapshot(), 0);
  assert.equal(harness.host.children.length, 1);
  harness.panel.dispose();
  harness.panel.dispose();
  assert.equal(harness.host.children.length, 0);
  assert.equal(harness.panel.getStats().elements, 0);
  assert.equal(harness.panel.getStats().textNodes, 0);
  assert.equal(harness.panel.getStats().rows, 0);
  assert.equal(harness.panel.getStats().listeners, 0);
  assert.equal(harness.panel.getStats().retainedViews, 0);
  assert.equal(harness.panel.getStats().disposed, true);
  assert.throws(() => harness.panel.update(thirtyTaxiSnapshot(), 10), /disposed/);
  assert.throws(() => harness.panel.setFilter('BUSY'), /disposed/);
  for (let index = 0; index < 20; index += 1) {
    const local = createFleetPanelHarness();
    local.panel.update(thirtyTaxiSnapshot(), 0);
    local.panel.dispose();
    assert.equal(local.host.children.length, 0);
    assert.equal(local.panel.getStats().createdRows, 30);
    assert.equal(local.panel.getStats().listeners, 0);
  }
});

test('075 real 057/061/064 binding lists taxis only and carries the certified ride and ETA', () => {
  const world = createEtaWorld();
  try {
    const ride = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry,
      sources: FleetPanelSources = {
        fleet: registry,
        lifecycle: world.rideWorld.lifecycle,
        eta: world.eta,
      },
      estimate = world.eta.observe(etaObservation(world, { speedMps: 8 }));
    registry.updateState(ride.taxiId, { tick: 10, controlMode: 'MANUAL' });
    const snapshot = readFleetPanelSnapshot(sources, {
        tick: 10,
        followedTaxiId: ride.taxiId,
      }),
      assigned = snapshot.taxis.find((taxi) => taxi.vehicleId === ride.taxiId);
    assert.equal(snapshot.version, FLEET_PANEL_VERSION);
    assert.equal(snapshot.sessionId, registry.context().sessionId);
    assert.equal(snapshot.taxis.length, registry.counts().taxis);
    assert.equal(snapshot.taxis.length, 24);
    for (const taxi of snapshot.taxis) {
      assert.equal(registry.get(taxi.vehicleId)?.driverKind, 'TAXI');
      assert.equal(taxi.profileId, registry.get(taxi.vehicleId)?.profileId);
    }
    assert.ok(assigned);
    assert.equal(assigned.controlMode, 'MANUAL');
    assert.equal(
      assigned.appliedProfileVersion,
      registry.state(ride.taxiId)?.appliedProfileVersion,
    );
    assert.equal(assigned.ride?.rideId, ride.rideId);
    assert.equal(assigned.ride?.state, ride.state);
    assert.equal(assigned.ride?.pickupZoneId, ride.pickupZoneId);
    assert.equal(assigned.ride?.dropoffZoneId, ride.dropoffZoneId);
    assert.equal(assigned.ride?.eta.status, 'ESTIMATED');
    assert.equal(assigned.ride?.eta.seconds, estimate.etaSeconds);
    assert.equal(assigned.blocked, false);
    const free = snapshot.taxis.find((taxi) => taxi.ride === null)!;
    assert.equal(free.serviceState, null);
    const harness = createFleetPanelHarness();
    harness.panel.update(snapshot, 0);
    const button = harness.buttonFor(ride.taxiId);
    assert.equal(button.getAttribute('aria-selected'), 'true');
    assert.match(button.children[4]!.textContent, /^~\d/);
    assert.match(button.children[2]!.textContent, /^M · Conduci/);
    harness.panel.dispose();
  } finally {
    disposeWorld(world);
  }
});

test('075 an ETA that no longer matches the ride leg is dropped instead of shown stale', () => {
  const world = createEtaWorld();
  try {
    const ride = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry,
      sources: FleetPanelSources = {
        fleet: registry,
        lifecycle: world.rideWorld.lifecycle,
        eta: world.eta,
      };
    world.eta.observe(etaObservation(world, { speedMps: 8 }));
    const before = readFleetPanelSnapshot(sources, {
      tick: 10,
      followedTaxiId: ride.taxiId,
    });
    assert.equal(
      before.taxis.find((taxi) => taxi.vehicleId === ride.taxiId)?.ride?.eta.status,
      'ESTIMATED',
    );
    world.rideWorld.lifecycle.apply({
      rideId: ride.rideId,
      eventId: 'panel:arrived-pickup',
      event: 'ARRIVED_PICKUP',
      tick: 12,
    });
    const after = readFleetPanelSnapshot(sources, { tick: 12, followedTaxiId: ride.taxiId }),
      assigned = after.taxis.find((taxi) => taxi.vehicleId === ride.taxiId)!;
    assert.equal(assigned.ride?.state, 'PICKUP');
    assert.equal(assigned.ride?.eta.status, 'NOT_OBSERVED');
    assert.equal(assigned.ride?.eta.seconds, null);
    const view = projectFleetPanel(after, { filter: 'ALL', sort: 'ETA' });
    const row = view.rows.find((entry) => entry.vehicleId === ride.taxiId)!;
    assert.equal(row.etaLabel, 'Fără estimare');
    assert.notEqual(row.etaLabel, '0 s');
  } finally {
    disposeWorld(world);
  }
});

test('075 a certified BLOCKED service marks the taxi blocked and is never hidden', () => {
  const world = createEtaWorld();
  try {
    const ride = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry,
      sources: FleetPanelSources = {
        fleet: registry,
        lifecycle: world.rideWorld.lifecycle,
        eta: world.eta,
      };
    world.eta.observe(etaObservation(world, { tick: 10, speedMps: 8 }));
    world.eta.setServiceState('BLOCKED');
    const estimate = world.eta.observe(etaObservation(world, { tick: 11, speedMps: 5 }));
    assert.equal(estimate.reason, 'SERVICE_BLOCKED');
    const snapshot = readFleetPanelSnapshot(sources, { tick: 11, followedTaxiId: null }),
      assigned = snapshot.taxis.find((taxi) => taxi.vehicleId === ride.taxiId)!;
    assert.equal(assigned.serviceState, 'BLOCKED');
    assert.equal(assigned.blocked, true);
    const view = projectFleetPanel(snapshot, { filter: 'FREE', sort: 'SLOT' }),
      row = view.rows.find((entry) => entry.vehicleId === ride.taxiId)!;
    assert.equal(row.state, 'BLOCKED');
    assert.equal(row.stateLabel, 'Blocat');
    assert.equal(row.pinned, true);
    assert.equal(view.counts.pinned, 1);
    assert.equal(row.etaLabel, 'Indisponibil');
  } finally {
    disposeWorld(world);
  }
});

test('075 the selection adapter maps a row to a FLEET intent and never invents an identity', () => {
  const enqueued: { identity: unknown; source: string }[] = [],
    identity = Object.freeze({ entityId: taxiIdOf(4), handle: 7, generation: 2 }),
    select = createFleetPanelSelectPort({
      bodyIdentity: (vehicleId) => (vehicleId === taxiIdOf(4) ? identity : undefined),
      selection: {
        enqueue: (target, source) => {
          enqueued.push({ identity: target, source });
          return true;
        },
      },
    });
  assert.equal(select(taxiIdOf(4)), true);
  assert.deepEqual(enqueued, [{ identity, source: 'FLEET' }]);
  assert.equal(select(taxiIdOf(5)), false);
  assert.equal(enqueued.length, 1);
  const harness = createFleetPanelHarness();
  harness.panel.update(thirtyTaxiSnapshot(), 0);
  harness.buttonFor(taxiIdOf(4)).dispatch('click');
  assert.deepEqual(harness.selections, [taxiIdOf(4)], 'a click emits one bounded identity');
  harness.panel.dispose();
});

test('075 snapshot without a followed taxi pins only the blockage and stays deterministic', () => {
  const snapshot: FleetPanelSnapshot = thirtyTaxiSnapshot({ followedTaxiId: null }),
    free = projectFleetPanel(snapshot, { filter: 'FREE' }),
    busy = projectFleetPanel(snapshot, { filter: 'BUSY' }),
    again = projectFleetPanel(snapshot, { filter: 'FREE' });
  assert.equal(free.counts.followed, 0);
  assert.equal(free.counts.pinned, 0);
  assert.equal(busy.counts.pinned, 1);
  assert.equal(busy.rows.find((row) => row.pinned)?.slot, 21);
  assert.equal(free.signature, again.signature, 'the signature is deterministic');
  assert.notEqual(free.signature, busy.signature);
  const civilian = thirtyTaxiSnapshot({ followedTaxiId: 'vehicle:civil:01' }),
    filtered = projectFleetPanel(civilian, { filter: 'BLOCKED' });
  assert.equal(filtered.counts.followed, 0, 'a civilian selection pins no taxi row');
  assert.equal(filtered.counts.pinned, 0);
});

test('075 committed evidence report is the current deterministic transcript', () => {
  const report = runFleetPanelReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '075-fleet-panel', 'report.json'),
      'utf8',
    );
  assert.equal(report.summary.pass, true);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.scenarios.length >= 7);
  assert.ok(report.checks.length >= 25);
});

test('075 view accessor exposes the retained projection without owning selection state', () => {
  const harness = createFleetPanelHarness();
  assert.equal(harness.panel.getView(), null);
  harness.panel.update(thirtyTaxiSnapshot(), 0);
  const view = viewOf(harness.panel);
  assert.equal(view.rows.length, 30);
  assert.equal(view.filter, 'ALL');
  assert.equal(view.summary, 'Filtru Toate, sortare Slot: 30 din 30 taxiuri.');
  assert.equal(Object.isFrozen(view), true);
  assert.throws(() => {
    (view as unknown as { filter: string }).filter = 'BUSY';
  }, TypeError);
  harness.panel.dispose();
  assert.equal(harness.panel.getView(), null);
});
