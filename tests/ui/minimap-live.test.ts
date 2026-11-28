import assert from 'node:assert/strict';
import test from 'node:test';
import { MAP_SELECTION_VERSION } from '../../src/ui';
import type {
  MapSelectionSnapshot,
  MapSelectionVehicle,
  MinimapIncidentSnapshot,
} from '../../src/ui';
import { createLiveMinimap, MINIMAP_INCIDENTS_VERSION } from '../../src/ui';
import type { LiveMinimap } from '../../src/ui';
import { createHudDocument, createHudHost } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';
import {
  createRecordingContext,
  frame as minimapFrame,
  readyRoute,
  sceneOf,
  twoZoneMap,
} from './minimap-fixture';
import type { MapScene } from './minimap-fixture';

interface LiveHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly live: LiveMinimap;
  readonly scene: MapScene;
  readonly selected: string[];
}

function harness(): LiveHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    scene = sceneOf(twoZoneMap()),
    selected: string[] = [],
    live = createLiveMinimap(host as unknown as HTMLElement, {
      geometry: scene.geometry,
      select: (vehicleId) => selected.push(vehicleId),
      contexts: {
        static: createRecordingContext().context,
        dynamic: createRecordingContext().context,
      },
    });
  return { doc, host, live, scene, selected };
}

function vehicle(
  vehicleId: string,
  kind: 'TAXI' | 'CIVIL',
  slot: number,
  x: number,
  z: number,
): MapSelectionVehicle {
  return Object.freeze({
    vehicleId,
    kind,
    slot,
    label: null,
    positionM: Object.freeze({ x, y: 0, z }),
    headingRad: 0,
    available: true,
    selectable: true,
  });
}

function selection(
  vehicles: readonly MapSelectionVehicle[],
  followedVehicleId: string | null = null,
  tick = 10,
): MapSelectionSnapshot {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: MAP_SELECTION_VERSION,
    sessionId: 'session:281',
    worldEpoch: 1,
    tick,
    followedVehicleId,
    vehicles: Object.freeze(vehicles),
  });
}

function incidents(
  entries: readonly {
    incidentId: string;
    vehicleId: string;
    x: number;
    z: number;
    tick?: number;
  }[] = [],
  tick = 10,
  health: 'AVAILABLE' | 'UNAVAILABLE' = 'AVAILABLE',
): MinimapIncidentSnapshot {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: MINIMAP_INCIDENTS_VERSION,
    sessionId: 'session:281',
    worldEpoch: 1,
    tick,
    health,
    incidents: Object.freeze(
      entries.map((entry) =>
        Object.freeze({
          incidentId: entry.incidentId,
          vehicleId: entry.vehicleId,
          kind: 'COLLISION_DAMAGE' as const,
          positionM: Object.freeze({ x: entry.x, z: entry.z }),
          tick: entry.tick ?? tick,
          label: entry.vehicleId,
        }),
      ),
    ),
  });
}

function mapFrame(tick = 10) {
  return minimapFrame({
    tick,
    taxi: { vehicleId: 'taxi-1', slot: 1 },
    positionM: { x: 0, y: 0, z: 0 },
    headingRad: 0,
    ride: {
      rideId: 'ride-1',
      taxiId: 'taxi-1',
      state: 'TO_PICKUP',
      pickupZoneId: 'service',
      dropoffZoneId: 'service-2',
    },
    route: readyRoute(['lane-a', 'lane-b', 'lane-c']),
  });
}

function rootOf(value: LiveHarness): HudElement {
  const root = value.live.getRoot();
  assert.ok(root);
  return root as unknown as HudElement;
}

function markersOf(value: LiveHarness): string[] {
  const found: string[] = [];
  const walk = (node: HudElement): void => {
    for (const child of node.children) {
      const id = child.getAttribute('data-vehicle-id');
      if (child.className === 'map-selection__marker' && id !== null) found.push(id);
      walk(child);
    }
  };
  walk(rootOf(value));
  return found.sort();
}

test('281 live minimap mounts 074, 076 and incidents over one exact map box', () => {
  const value = harness();
  try {
    value.live.update(
      mapFrame(),
      selection([vehicle('taxi-1', 'TAXI', 1, 0, 0), vehicle('civil-1', 'CIVIL', 2, 9, 0)]),
      incidents([{ incidentId: 'fact-1', vehicleId: 'taxi-1', x: 0, z: 0 }]),
      0,
    );
    const root = rootOf(value),
      stats = value.live.getStats();
    assert.equal(root.className, 'minimap');
    assert.ok(value.live.getMapHost() !== null);
    assert.equal(root.children[0]!.className, 'minimap__map');
    assert.equal(stats.map.dynamicPaints, 1);
    assert.equal(stats.map.routeLanes, 3);
    assert.equal(stats.selection.markers, 2);
    assert.equal(stats.incidents.markers, 1);
    assert.equal(stats.selection.globalListeners, 0);
    assert.equal(stats.listeners, 2, 'only the two native marker click listeners');
    assert.deepEqual(markersOf(value), ['civil-1', 'taxi-1']);
  } finally {
    value.live.dispose();
  }
});

test('281 marker identity survives movement and a click only emits the selection intention', () => {
  const value = harness();
  try {
    value.live.update(
      mapFrame(),
      selection([vehicle('taxi-1', 'TAXI', 1, 0, 0), vehicle('civil-1', 'CIVIL', 2, 9, 0)]),
      incidents(),
      0,
    );
    const first = value.live.getView()!;
    value.live.update(
      mapFrame(11),
      selection(
        [vehicle('taxi-1', 'TAXI', 1, 4, 1), vehicle('civil-1', 'CIVIL', 2, 10, 1)],
        'taxi-1',
        11,
      ),
      incidents(),
      500,
    );
    const second = value.live.getView()!,
      stats = value.live.getStats();
    assert.equal(stats.selection.created, 2);
    assert.equal(stats.selection.removed, 0);
    assert.deepEqual(markersOf(value), ['civil-1', 'taxi-1']);
    assert.notDeepEqual(
      first.selection!.markers.map((marker) => [marker.x, marker.y]),
      second.selection!.markers.map((marker) => [marker.x, marker.y]),
    );
    assert.equal(
      second.selection!.markers.find((marker) => marker.markerId === 'taxi-1')?.selected,
      true,
    );
    assert.deepEqual(value.selected, []);
    const button = findMarkerButton(rootOf(value), 'civil-1');
    assert.ok(button);
    button!.dispatch('click');
    assert.deepEqual(value.selected, ['civil-1'], 'one click emits exactly one camera-only intent');
  } finally {
    value.live.dispose();
  }
});

test('281 incident markers reuse the 065 fact identity and are removed with it', () => {
  const value = harness();
  try {
    value.live.update(
      mapFrame(),
      selection([vehicle('taxi-1', 'TAXI', 1, 0, 0)]),
      incidents([{ incidentId: 'fact-1', vehicleId: 'taxi-1', x: 0, z: 0 }]),
      0,
    );
    assert.equal(value.live.getStats().incidents.created, 1);
    value.live.update(
      mapFrame(11),
      selection([vehicle('taxi-1', 'TAXI', 1, 2, 2)], null, 11),
      incidents([{ incidentId: 'fact-1', vehicleId: 'taxi-1', x: 2, z: 2, tick: 11 }], 11),
      200,
    );
    assert.equal(value.live.getStats().incidents.created, 1);
    assert.equal(value.live.getStats().incidents.removed, 0);
    assert.equal(value.live.getView()!.incidents!.markers[0]!.incidentId, 'fact-1');
    value.live.update(
      mapFrame(12),
      selection([vehicle('taxi-1', 'TAXI', 1, 2, 2)], null, 12),
      incidents([], 12),
      300,
    );
    assert.equal(value.live.getStats().incidents.markers, 0);
    assert.equal(value.live.getStats().incidents.removed, 1);
    value.live.update(
      mapFrame(13),
      selection([vehicle('taxi-1', 'TAXI', 1, 2, 2)], null, 13),
      incidents([], 13, 'UNAVAILABLE'),
      400,
    );
    assert.match(value.live.getView()!.incidents!.snapshot.health, /UNAVAILABLE/);
  } finally {
    value.live.dispose();
  }
});

test('281 the three layers never write faster than 10 Hz and dispose is idempotent', () => {
  const value = harness();
  try {
    for (let index = 0; index < 61; index += 1) {
      const tick = 10 + index;
      value.live.update(
        mapFrame(tick),
        selection([vehicle('taxi-1', 'TAXI', 1, index * 0.1, 0)], null, tick),
        incidents([], tick),
        index * (1000 / 60),
      );
    }
    const stats = value.live.getStats();
    assert.ok(stats.map.dynamicPaints <= 11, `dynamic paints ${stats.map.dynamicPaints}`);
    assert.ok(stats.selection.updates <= 11, `selection updates ${stats.selection.updates}`);
    assert.ok(stats.incidents.updates <= 11, `incident updates ${stats.incidents.updates}`);
    value.live.dispose();
    value.live.dispose();
    assert.equal(value.live.getStats().disposed, true);
    assert.equal(value.host.children.length, 0);
    assert.throws(
      () => value.live.update(mapFrame(), selection([]), incidents(), 1000),
      /disposed/,
    );
  } finally {
    if (!value.live.getStats().disposed) value.live.dispose();
  }
});

function findMarkerButton(root: HudElement, vehicleId: string): HudElement | null {
  for (const child of root.children) {
    if (
      child.className === 'map-selection__marker' &&
      child.getAttribute('data-vehicle-id') === vehicleId
    )
      return child;
    const nested = findMarkerButton(child, vehicleId);
    if (nested !== null) return nested;
  }
  return null;
}
