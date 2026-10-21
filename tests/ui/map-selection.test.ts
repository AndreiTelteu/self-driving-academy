import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  createMapSelectionPort,
  readMapSelectionSnapshot,
  type MapSelectionSources,
} from '../../src/app';
import {
  hitTestMapMarker,
  MAP_SELECTION_LIMITS,
  MAP_SELECTION_VERSION,
  parseMapSelectionSnapshot,
  projectMapSelection,
  projectMinimapPoint,
} from '../../src/ui';
import type { MapSelectionSnapshot, MapSelectionVehicle } from '../../src/ui';
import { createEtaWorld, disposeEtaWorld, rideOf } from '../fleet/eta-fixture';
import { runMapSelectionReport } from '../app/map-selection-report';
import {
  civilIdOf,
  createMapSelectionHarness,
  fleetMapSnapshot,
  gridPosition,
  mapSnapshot,
  mapTransform,
  mapVehicle,
  taxiIdOf,
} from './map-selection-fixture';

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function shiftingFrames(base: MapSelectionSnapshot, frames: number): MapSelectionSnapshot[] {
  const framesOut: MapSelectionSnapshot[] = [];
  for (let index = 0; index < frames; index += 1) {
    const vehicles = base.vehicles.map((vehicle, position) =>
      position === 0 && vehicle.positionM !== null
        ? { ...vehicle, positionM: { ...vehicle.positionM, x: vehicle.positionM.x + index * 0.1 } }
        : vehicle,
    );
    framesOut.push({ ...base, tick: base.tick + 1 + index, vehicles: Object.freeze(vehicles) });
  }
  return framesOut;
}

test('076 parser rejects malformed, duplicated, over-capacity and contradictory frames', () => {
  const valid = mapSnapshot();
  assert.equal(parseMapSelectionSnapshot(valid).vehicles.length, 1);
  assert.equal(parseMapSelectionSnapshot(valid).version, MAP_SELECTION_VERSION);
  assert.throws(
    () => parseMapSelectionSnapshot({ ...valid, version: '075-fleet-panel-v1' }),
    /contract/,
  );
  assert.throws(() => parseMapSelectionSnapshot({ ...valid, units: 'IMPERIAL' }), /contract/);
  assert.throws(() => parseMapSelectionSnapshot({ ...valid, tick: -1 }), /tick/);
  assert.throws(() => parseMapSelectionSnapshot({ ...valid, tick: 1.5 }), /tick/);
  assert.throws(() => parseMapSelectionSnapshot({ ...valid, extra: true }), /fields/);
  assert.throws(
    () => parseMapSelectionSnapshot({ ...valid, sessionId: 'x'.repeat(513) }),
    /session identity/,
  );
  assert.throws(
    () => parseMapSelectionSnapshot({ ...valid, followedVehicleId: ' '.repeat(3) }),
    /followed vehicle identity/,
  );
  const duplicate = Object.freeze([valid.vehicles[0]!, valid.vehicles[0]!]);
  assert.throws(() => parseMapSelectionSnapshot({ ...valid, vehicles: duplicate }), /duplicate/);
  const tooMany = Object.freeze(
    Array.from({ length: MAP_SELECTION_LIMITS.vehicles + 1 }, (_, index) =>
      mapVehicle({ vehicleId: `vehicle:076:extra:${index}`, slot: index + 1 }),
    ),
  );
  assert.throws(() => parseMapSelectionSnapshot({ ...valid, vehicles: tooMany }), /ceiling/);
  assert.throws(
    () => parseMapSelectionSnapshot({ ...valid, vehicles: [mapVehicle({ slot: 0 })] }),
    /slot/,
  );
  assert.throws(
    () =>
      parseMapSelectionSnapshot({
        ...valid,
        vehicles: [mapVehicle({ kind: 'TRUCK' as unknown as MapSelectionVehicle['kind'] })],
      }),
    /kind/,
  );
  assert.throws(
    () =>
      parseMapSelectionSnapshot({
        ...valid,
        vehicles: [mapVehicle({ positionM: { x: Number.NaN, y: 0, z: 0 } })],
      }),
    /position x must be finite/,
  );
  assert.throws(
    () => parseMapSelectionSnapshot({ ...valid, vehicles: [mapVehicle({ available: false })] }),
    /availability/,
  );
  assert.throws(
    () =>
      parseMapSelectionSnapshot({
        ...valid,
        vehicles: [mapVehicle({ positionM: null, available: false, selectable: true })],
      }),
    /selectable requires/,
  );
  assert.throws(
    () =>
      parseMapSelectionSnapshot({
        ...valid,
        vehicles: [
          mapVehicle({
            label: 'x'.repeat(MAP_SELECTION_LIMITS.labelCodeUnits + 1),
          }),
        ],
      }),
    /label/,
  );
  assert.throws(
    () =>
      parseMapSelectionSnapshot({
        ...valid,
        vehicles: [
          mapVehicle({ positionM: null, available: false, headingRad: 0, selectable: false }),
        ],
      }),
    /heading requires/,
  );
  const parked = parseMapSelectionSnapshot({
    ...valid,
    vehicles: [mapVehicle({ positionM: null, available: false, selectable: false })],
  });
  assert.equal(parked.vehicles[0]?.available, false);
  assert.equal(parked.vehicles[0]?.selectable, false);
});

test('076 taxi, civilian and distant civilian project through the real 074 transform', () => {
  const transform = mapTransform(),
    snapshot = mapSnapshot({
      vehicles: Object.freeze([
        mapVehicle({
          vehicleId: taxiIdOf(3),
          kind: 'TAXI',
          slot: 3,
          positionM: { x: 10, y: 0, z: 10 },
        }),
        mapVehicle({
          vehicleId: civilIdOf(7),
          kind: 'CIVIL',
          slot: 7,
          positionM: { x: 2, y: 0, z: 14 },
        }),
        mapVehicle({
          vehicleId: civilIdOf(41),
          kind: 'CIVIL',
          slot: 41,
          positionM: { x: -9.5, y: 0, z: -9.5 },
        }),
      ]),
    }),
    projection = projectMapSelection(transform, snapshot),
    taxi = projection.markers.find((marker) => marker.vehicleId === taxiIdOf(3))!,
    civilian = projection.markers.find((marker) => marker.vehicleId === civilIdOf(7))!,
    distant = projection.markers.find((marker) => marker.vehicleId === civilIdOf(41))!;
  assert.equal(projection.markers.length, 3);
  assert.deepEqual(projection.counts, {
    total: 3,
    taxis: 1,
    civilians: 2,
    selectable: 3,
    selected: 0,
    removed: 0,
  });
  const taxiPoint = projectMinimapPoint(transform, { x: 10, z: 10 }),
    civilianPoint = projectMinimapPoint(transform, { x: 2, z: 14 }),
    distantPoint = projectMinimapPoint(transform, { x: -9.5, z: -9.5 });
  near(taxi.x, taxiPoint.x);
  near(taxi.y, taxiPoint.y);
  near(civilian.x, civilianPoint.x);
  near(civilian.y, civilianPoint.y);
  near(distant.x, distantPoint.x);
  near(distant.y, distantPoint.y);
  assert.equal(taxi.symbol, 'T');
  assert.equal(civilian.symbol, 'C');
  assert.equal(distant.symbol, 'C');
  assert.equal(taxi.label, 'Taxi #3');
  assert.equal(distant.label, 'Civil #41');
  assert.equal(taxi.markerId, taxi.vehicleId, 'the marker identity is the stable vehicle id');
  assert.equal(taxi.sizePx, MAP_SELECTION_LIMITS.markerSizePx);
  assert.equal(taxi.hitRadiusPx, MAP_SELECTION_LIMITS.hitRadiusPx);
  assert.match(taxi.description, /^Taxi #3 \(vehicle:076:TAXI:03\); simbol T/);
  assert.match(distant.description, /simbol C/);
  assert.match(projection.description, /1 taxiuri și 2 mașini civile/);
  assert.match(projection.description, /schimbă doar ținta camerei/);
  const sortedIds = projection.markers.map((marker) => marker.markerId);
  assert.deepEqual(sortedIds, [...sortedIds].sort());
});

test('076 a marker keeps its identity across position, label and kind updates', () => {
  const harness = createMapSelectionHarness(),
    first = mapSnapshot({
      vehicles: [mapVehicle({ vehicleId: taxiIdOf(5), slot: 5, positionM: { x: 0, z: 0, y: 0 } })],
    });
  harness.overlay.update(first, 0);
  const button = harness.markerFor(taxiIdOf(5)),
    firstStyle = button.getAttribute('style'),
    created = harness.overlay.getStats().created;
  assert.equal(button.textContent, 'T');
  assert.equal(button.getAttribute('data-kind'), 'TAXI');
  harness.overlay.update(
    mapSnapshot({
      tick: 11,
      vehicles: [
        mapVehicle({
          vehicleId: taxiIdOf(5),
          slot: 5,
          kind: 'CIVIL',
          label: 'Client fidel',
          positionM: { x: 20, z: 25, y: 0 },
          headingRad: Math.PI / 2,
        }),
      ],
    }),
    1000,
  );
  assert.equal(harness.overlay.getStats().created, created, 'no second element is created');
  assert.equal(harness.markerFor(taxiIdOf(5)), button, 'the exact same button is reused');
  assert.equal(button.textContent, 'C');
  assert.equal(button.getAttribute('data-kind'), 'CIVIL');
  assert.equal(button.getAttribute('data-label'), 'Client fidel');
  assert.notEqual(button.getAttribute('style'), firstStyle);
  assert.match(button.getAttribute('aria-label') ?? '', /Client fidel/);
  assert.match(button.getAttribute('aria-label') ?? '', /direcție 90°/);
  assert.equal(harness.overlay.getStats().markers, 1);
  harness.overlay.dispose();
});

test('076 a removed vehicle loses its marker and listener, the rest keep their elements', () => {
  const harness = createMapSelectionHarness(),
    base = mapSnapshot({
      vehicles: [
        mapVehicle({ vehicleId: taxiIdOf(1), slot: 1, positionM: { x: 0, y: 0, z: 0 } }),
        mapVehicle({ vehicleId: taxiIdOf(2), slot: 2, positionM: { x: 4, y: 0, z: 0 } }),
        mapVehicle({
          vehicleId: civilIdOf(3),
          kind: 'CIVIL',
          slot: 3,
          positionM: { x: 8, y: 0, z: 0 },
        }),
      ],
    });
  harness.overlay.update(base, 0);
  const kept = harness.markerFor(taxiIdOf(1)),
    listeners = harness.overlay.getStats().listeners;
  assert.equal(harness.overlay.getStats().markers, 3);
  harness.overlay.update(
    { ...base, tick: 11, vehicles: Object.freeze(base.vehicles.filter((v) => v.slot !== 2)) },
    500,
  );
  assert.equal(harness.overlay.getStats().markers, 2);
  assert.equal(harness.overlay.getStats().removed, 1);
  assert.equal(harness.overlay.getStats().listeners, listeners - 1);
  assert.equal(harness.markerFor(taxiIdOf(1)), kept);
  assert.throws(() => harness.markerFor(taxiIdOf(2)), /missing/);
  const projection = projectMapSelection(harness.transform, base),
    after = projectMapSelection(
      harness.transform,
      {
        ...base,
        vehicles: Object.freeze(base.vehicles.filter((v) => v.slot !== 2)),
      },
      { previous: projection.markers },
    );
  assert.equal(after.counts.removed, 1);
  assert.equal(
    projectMapSelection(harness.transform, {
      ...base,
      vehicles: Object.freeze(base.vehicles.filter((v) => v.slot !== 2)),
    }).counts.removed,
    0,
    'without a previous projection no removal is claimed',
  );
  harness.overlay.dispose();
});

test('076 hit testing is nearest, ties break by vehicle id, and invalid markers are ignored', () => {
  const transform = mapTransform(),
    snapshot = mapSnapshot({
      vehicles: [
        mapVehicle({ vehicleId: taxiIdOf(1), slot: 1, positionM: { x: 8, y: 0, z: 10 } }),
        mapVehicle({ vehicleId: taxiIdOf(2), slot: 2, positionM: { x: 12, y: 0, z: 10 } }),
        mapVehicle({
          vehicleId: civilIdOf(3),
          kind: 'CIVIL',
          slot: 3,
          positionM: { x: 10, y: 0, z: 10 },
        }),
      ],
    }),
    markers = projectMapSelection(transform, snapshot).markers,
    centre = projectMinimapPoint(transform, { x: 10, z: 10 });
  // The civilian is exactly at the centre and one pixel nearer than both taxis.
  assert.deepEqual(hitTestMapMarker(markers, { x: centre.x + 1, y: centre.y }), {
    vehicleId: civilIdOf(3),
    kind: 'CIVIL',
  });
  // Exactly halfway between the two taxis is a tie broken by the stable identity, not array order.
  const reversed = [...markers].reverse();
  assert.deepEqual(
    hitTestMapMarker(
      reversed.filter((marker) => marker.kind === 'TAXI'),
      centre,
    ),
    { vehicleId: taxiIdOf(1), kind: 'TAXI' },
  );
  assert.equal(hitTestMapMarker(markers, { x: -500, y: -500 }), null, 'outside the radius');
  assert.equal(hitTestMapMarker(markers, { x: Number.NaN, y: 0 }), null, 'invalid point');
  assert.equal(hitTestMapMarker([], centre), null);
  const invalid = { ...markers[0]!, x: Number.POSITIVE_INFINITY } as (typeof markers)[number],
    nonSelectable = { ...markers[0]!, selectable: false, x: centre.x, y: centre.y };
  assert.equal(hitTestMapMarker([invalid], centre), null, 'invalid coordinates are ignored');
  assert.equal(
    hitTestMapMarker([nonSelectable], centre),
    null,
    'a non-selectable marker is ignored',
  );
  assert.throws(() => hitTestMapMarker(markers, centre, { hitRadiusPx: 0 }), /hit radius/);
  const far = { ...markers[0]!, x: centre.x + 100, y: centre.y };
  assert.equal(
    hitTestMapMarker([far], centre, { hitRadiusPx: MAP_SELECTION_LIMITS.maximumHitRadiusPx }),
    null,
    'the radius is bounded even when the caller asks for more',
  );
});

test('076 a click emits exactly one WORLD selection intention', () => {
  const harness = createMapSelectionHarness(),
    base = fleetMapSnapshot();
  harness.overlay.update(base, 0);
  const retained = harness.overlay.getView()?.snapshot,
    updatesBefore = harness.overlay.getStats().updates;
  harness.markerFor(taxiIdOf(3)).dispatch('click');
  assert.deepEqual(harness.selections, [taxiIdOf(3)]);
  assert.equal(
    harness.overlay.getView()?.snapshot,
    retained,
    'a click does not rewrite the retained frame or any vehicle position',
  );
  assert.equal(harness.overlay.getStats().updates, updatesBefore, 'a click redraws nothing');
  harness.markerFor(civilIdOf(41)).dispatch('click');
  assert.deepEqual(harness.selections, [taxiIdOf(3), civilIdOf(41)]);
  const silent = createMapSelectionHarness();
  silent.overlay.dispose();
  assert.deepEqual(silent.selections, []);
  const notSelectable = createMapSelectionHarness(),
    snapshot = mapSnapshot({
      vehicles: [
        mapVehicle({ vehicleId: taxiIdOf(9), slot: 9 }),
        mapVehicle({
          vehicleId: civilIdOf(9),
          kind: 'CIVIL',
          slot: 9,
          selectable: false,
          positionM: { x: 4, y: 0, z: 0 },
        }),
      ],
    });
  notSelectable.overlay.update(snapshot, 0);
  const disabled = notSelectable.markerFor(civilIdOf(9));
  assert.equal(disabled.getAttribute('disabled'), '');
  disabled.dispatch('click');
  assert.deepEqual(notSelectable.selections, [], 'a non-selectable marker emits nothing');
  harness.overlay.dispose();
  notSelectable.overlay.dispose();
});

test('076 the followed marker is pressed and data-selected without colour alone', () => {
  const harness = createMapSelectionHarness(),
    base = fleetMapSnapshot();
  harness.overlay.update(base, 0);
  const followed = harness.markerFor(taxiIdOf(12)),
    other = harness.markerFor(taxiIdOf(11));
  assert.equal(followed.getAttribute('aria-pressed'), 'true');
  assert.equal(followed.getAttribute('data-selected'), 'true');
  assert.equal(other.getAttribute('aria-pressed'), 'false');
  assert.equal(other.getAttribute('data-selected'), 'false');
  assert.match(followed.getAttribute('aria-label') ?? '', /vehicul urmărit de cameră/);
  harness.overlay.setFollowed(taxiIdOf(11));
  assert.equal(followed.getAttribute('aria-pressed'), 'false');
  assert.equal(harness.markerFor(taxiIdOf(11)).getAttribute('aria-pressed'), 'true');
  harness.overlay.setFollowed(null);
  assert.equal(harness.markerFor(taxiIdOf(11)).getAttribute('aria-pressed'), 'false');
  assert.equal(harness.root().getAttribute('data-followed'), '');
  harness.overlay.dispose();
});

test('076 writes are capped at 10 Hz while followed and kind changes bypass the ceiling', () => {
  const harness = createMapSelectionHarness(),
    base = fleetMapSnapshot();
  harness.overlay.update(base, 0);
  const frames = shiftingFrames(base, 60);
  for (let index = 0; index < frames.length; index += 1)
    harness.overlay.update(frames[index]!, (index + 1) * 16);
  const stats = harness.overlay.getStats();
  assert.ok((stats.updates as number) <= 10, `updates ${stats.updates}`);
  assert.ok((stats.updates as number) >= 2);
  assert.ok((stats.skipped as number) >= 45, `skipped ${stats.skipped}`);
  const last = frames[frames.length - 1]!,
    beforeFollow = harness.overlay.getStats().updates as number;
  harness.overlay.update({ ...last, tick: 500, followedVehicleId: taxiIdOf(2) }, 960);
  assert.equal(harness.overlay.getStats().updates as number, beforeFollow + 1);
  const beforeKind = harness.overlay.getStats().updates as number,
    vehicles = last.vehicles.map((vehicle) =>
      vehicle.vehicleId === taxiIdOf(1) ? { ...vehicle, kind: 'CIVIL' as const } : vehicle,
    );
  harness.overlay.update(
    { ...last, tick: 501, followedVehicleId: taxiIdOf(2), vehicles: Object.freeze(vehicles) },
    970,
  );
  assert.equal(harness.overlay.getStats().updates as number, beforeKind + 1);
  assert.equal(harness.markerFor(taxiIdOf(1)).textContent, 'C');
  harness.overlay.dispose();
});

test('076 an identical frame writes nothing and keeps the DOM byte-identical', () => {
  const harness = createMapSelectionHarness(),
    base = fleetMapSnapshot();
  harness.overlay.update(base, 0);
  const dom = harness.dom(),
    writes = harness.overlay.getStats().writes,
    updates = harness.overlay.getStats().updates;
  harness.overlay.update(base, 50);
  assert.equal(harness.overlay.getStats().writes, writes);
  assert.equal(harness.overlay.getStats().updates, updates);
  assert.equal(harness.overlay.getStats().skipped, 1);
  assert.equal(harness.dom(), dom);
  harness.overlay.dispose();
});

test('076 malformed, stale and out-of-clock frames never touch the DOM', () => {
  const harness = createMapSelectionHarness(),
    base = fleetMapSnapshot();
  harness.overlay.update(base, 0);
  const dom = harness.dom(),
    writes = harness.overlay.getStats().writes;
  assert.throws(
    () =>
      harness.overlay.update(
        { ...base, version: '075-fleet-panel-v1' } as unknown as MapSelectionSnapshot,
        10,
      ),
    /contract/,
  );
  assert.throws(() => harness.overlay.update({ ...base, tick: 9 }, 10), /Stale/);
  assert.throws(() => harness.overlay.update({ ...base, tick: 11 }, -1), /clock/);
  assert.throws(
    () => harness.overlay.update({ ...base, tick: 11, sessionId: '' }, 10),
    /session identity/,
  );
  assert.equal(harness.dom(), dom);
  assert.equal(harness.overlay.getStats().writes, writes);
  assert.equal(harness.overlay.getStats().updates, 1);
  harness.overlay.dispose();
});

test('076 lifecycle is bounded, installs no global listener and is idempotent', () => {
  const harness = createMapSelectionHarness(),
    base = fleetMapSnapshot();
  harness.overlay.update(base, 0);
  assert.equal(harness.host.children.length, 1);
  assert.equal(harness.host.listenerCount, 0);
  assert.equal(harness.root().listenerCount, 0);
  assert.equal(harness.overlay.getStats().globalListeners, 0);
  assert.equal(
    harness.overlay.getStats().listeners,
    base.vehicles.length,
    'exactly one click listener per retained marker',
  );
  assert.equal(
    harness.overlay.getStats().elements,
    MAP_SELECTION_LIMITS.fixedElements + base.vehicles.length,
  );
  harness.overlay.dispose();
  harness.overlay.dispose();
  assert.equal(harness.host.children.length, 0);
  assert.equal(harness.overlay.getStats().elements, 0);
  assert.equal(harness.overlay.getStats().markers, 0);
  assert.equal(harness.overlay.getStats().listeners, 0);
  assert.equal(harness.overlay.getStats().retainedFrames, 0);
  assert.equal(harness.overlay.getStats().disposed, true);
  assert.throws(() => harness.overlay.update(base, 10), /disposed/);
  assert.throws(() => harness.overlay.setFollowed(null), /disposed/);
});

test('076 real 057 fleet binding lists taxis and civilians and omits unknown positions', () => {
  const world = createEtaWorld();
  try {
    const ride = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry,
      vehicles = registry.list(),
      omitted = vehicles[5]!.vehicleId,
      known = new Map(
        vehicles.map((vehicle, index) => [vehicle.vehicleId, gridPosition(index)] as const),
      ),
      sources: MapSelectionSources = {
        fleet: registry,
        camera: { followedVehicleId: () => ride.taxiId },
      },
      snapshot = readMapSelectionSnapshot(sources, {
        tick: 10,
        positions: (vehicleId) => {
          if (vehicleId === omitted) return null;
          const position = known.get(vehicleId);
          return position === undefined ? null : position;
        },
      });
    assert.equal(snapshot.version, MAP_SELECTION_VERSION);
    assert.equal(snapshot.sessionId, registry.context().sessionId);
    assert.equal(snapshot.followedVehicleId, ride.taxiId);
    assert.equal(snapshot.vehicles.length, vehicles.length - 1);
    assert.equal(
      snapshot.vehicles.some((vehicle) => vehicle.vehicleId === omitted),
      false,
      'a vehicle without a known position is omitted, not invented',
    );
    for (const vehicle of snapshot.vehicles) {
      const real = registry.get(vehicle.vehicleId);
      assert.ok(real);
      assert.equal(vehicle.kind, real.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL');
      assert.equal(vehicle.slot, real.slot);
      assert.equal(vehicle.available, true);
      assert.equal(vehicle.selectable, true);
      assert.ok(vehicle.positionM);
    }
    assert.equal(
      snapshot.vehicles.filter((vehicle) => vehicle.kind === 'TAXI').length,
      registry.counts().taxis - (registry.get(omitted)?.driverKind === 'TAXI' ? 1 : 0),
    );
    assert.equal(
      snapshot.vehicles.filter((vehicle) => vehicle.kind === 'CIVIL').length,
      registry.counts().civilians - (registry.get(omitted)?.driverKind === 'CIVILIAN' ? 1 : 0),
    );
    const explicit = readMapSelectionSnapshot(sources, {
        tick: 11,
        followedVehicleId: null,
        positions: (vehicleId) => known.get(vehicleId) ?? null,
      }),
      invalid = readMapSelectionSnapshot(sources, {
        tick: 12,
        followedVehicleId: null,
        positions: (vehicleId) =>
          vehicleId === vehicles[0]!.vehicleId
            ? { x: Number.NaN, y: 0, z: 0 }
            : (known.get(vehicleId) ?? null),
      });
    assert.equal(explicit.followedVehicleId, null);
    assert.equal(explicit.vehicles.length, vehicles.length);
    assert.equal(invalid.vehicles.length, vehicles.length - 1);
    const projection = projectMapSelection(mapTransform(), snapshot);
    assert.equal(projection.markers.length, snapshot.vehicles.length);
    assert.equal(projection.counts.civilians > 0, true);
    const enqueued: { identity: unknown; source: string }[] = [],
      identity = Object.freeze({ entityId: ride.taxiId, handle: 4, generation: 2 }),
      select = createMapSelectionPort({
        bodyIdentity: (vehicleId) => (vehicleId === ride.taxiId ? identity : undefined),
        selection: {
          enqueue: (target, source) => {
            enqueued.push({ identity: target, source });
            return true;
          },
        },
      });
    assert.equal(select(ride.taxiId), true);
    assert.deepEqual(enqueued, [{ identity, source: 'WORLD' }]);
    assert.equal(select('vehicle:unknown'), false);
    assert.equal(enqueued.length, 1, 'an unknown identity never enqueues');
  } finally {
    disposeEtaWorld(world);
  }
});

test('076 committed evidence report is the current deterministic transcript', () => {
  const report = runMapSelectionReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '076-map-selection', 'report.json'),
      'utf8',
    );
  assert.equal(report.summary.pass, true);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.scenarios.length >= 7);
  assert.ok(report.checks.length >= 25);
});
