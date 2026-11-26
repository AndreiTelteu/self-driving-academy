import assert from 'node:assert/strict';
import test from 'node:test';
import { readLiveFleetSelectionSnapshot } from '../../src/app';
import type { CompositionVehicle } from '../../src/app';
import { createCompositionWorld } from '../../src/app';
import { readMinimapGeometry } from '../../src/app';
import type { MinimapContext } from '../../src/ui';
import { createFleetSelectionPanel } from '../../src/ui';
import {
  parseFleetSelectionSnapshot,
  projectFleetSelection,
  type FleetSelectionSnapshot,
  type FleetSelectionVehicle,
} from '../../src/ui';
import { createHudDocument } from './hud-dom';

function vehicle(
  vehicleId: string,
  kind: 'TAXI' | 'CIVIL',
  overrides: Partial<FleetSelectionVehicle> = {},
): FleetSelectionVehicle {
  return Object.freeze({
    vehicleId,
    kind,
    slot: kind === 'TAXI' ? 1 : 101,
    label: kind === 'TAXI' ? `Taxi #1` : `Civil #1`,
    classId: 'sedan',
    controlMode: 'AUTO',
    positionM: Object.freeze({ x: 1, y: 0, z: 2 }),
    headingRad: 0,
    available: true,
    inRide: false,
    blocked: false,
    rideId: null,
    routeLaneCount: 3,
    appliedProfileVersion: 'profile@1',
    selected: false,
    playerControlled: false,
    ...overrides,
  });
}

function snapshot(
  vehicles: readonly FleetSelectionVehicle[],
  selectedVehicleId: string | null = null,
  playerVehicleId: string | null = null,
): FleetSelectionSnapshot {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: '263-ui',
    worldEpoch: 1,
    tick: 10,
    selectedVehicleId,
    playerVehicleId,
    vehicles: Object.freeze([...vehicles]),
  });
}

const AVAILABLE = vehicle('taxi-1', 'TAXI');
const IN_RIDE = vehicle('civil-1', 'CIVIL', {
  slot: 101,
  label: 'Civil #101',
  available: false,
  inRide: true,
  rideId: 'ride-1',
  routeLaneCount: 5,
});
const BLOCKED = vehicle('taxi-2', 'TAXI', {
  slot: 2,
  label: 'Taxi #2',
  available: false,
  blocked: true,
});
const PLAYER = vehicle('taxi-3', 'TAXI', {
  slot: 3,
  label: 'Taxi #3',
  available: false,
  controlMode: 'MANUAL',
  playerControlled: true,
});

test('263: the fleet snapshot parser rejects duplicate ids and unknown fields', () => {
  assert.equal(parseFleetSelectionSnapshot(snapshot([AVAILABLE])).vehicles.length, 1);
  assert.throws(
    () => parseFleetSelectionSnapshot(snapshot([AVAILABLE, AVAILABLE])),
    /duplicate vehicle/,
  );
  assert.throws(
    () =>
      parseFleetSelectionSnapshot({
        ...snapshot([AVAILABLE]),
        extra: true,
      } as unknown),
    /fields/,
  );
  assert.throws(
    () => parseFleetSelectionSnapshot({ ...snapshot([AVAILABLE]), tick: -1 } as unknown),
    /non-negative/,
  );
});

test('263: filters pin the camera target and the PLAYER seat without duplicating rows', () => {
  const input = snapshot([AVAILABLE, IN_RIDE, BLOCKED, PLAYER], 'taxi-2', 'taxi-3');
  const all = projectFleetSelection(input, { filter: 'ALL' });
  assert.equal(all.rows.length, 4);
  assert.deepEqual(
    all.rows.map((row) => row.rowId),
    ['taxi-1', 'taxi-2', 'taxi-3', 'civil-1'],
  );
  const available = projectFleetSelection(input, { filter: 'AVAILABLE' });
  assert.deepEqual(
    available.rows.map((row) => row.rowId),
    ['taxi-1', 'taxi-2', 'taxi-3'],
  );
  assert.equal(available.counts.pinned, 2);
  const blocked = projectFleetSelection(input, { filter: 'BLOCKED' });
  assert.deepEqual(
    blocked.rows.map((row) => row.rowId),
    ['taxi-2', 'taxi-3'],
  );
  assert.equal(blocked.counts.pinned, 1);
  const inRide = projectFleetSelection(input, { filter: 'IN_RIDE' });
  assert.deepEqual(
    inRide.rows.map((row) => row.rowId),
    ['taxi-2', 'taxi-3', 'civil-1'],
  );
  const blockedRow = all.rows.find((row) => row.rowId === 'taxi-2')!;
  assert.equal(blockedRow.selected, true);
  assert.equal(blockedRow.state, 'BLOCKED');
  assert.match(blockedRow.description, /ținta camerei/);
  const playerRow = all.rows.find((row) => row.rowId === 'taxi-3')!;
  assert.equal(playerRow.state, 'PLAYER');
  assert.match(playerRow.description, /condus de tine/);
  assert.equal(all.counts.available, 1);
  assert.equal(all.counts.inRide, 1);
  assert.equal(all.counts.blocked, 1);
  assert.equal(all.counts.player, 1);
});

test('263: the panel only emits selection on a row click, keeps Tab/Escape and zero global listeners', () => {
  const doc = createHudDocument();
  const host = doc.createElement('div');
  const calls = { select: [] as string[], takeover: [] as string[], release: 0, close: 0 };
  const panel = createFleetSelectionPanel(host as unknown as HTMLElement, {
    select: (vehicleId) => {
      calls.select.push(vehicleId);
      return true;
    },
    takeover: (vehicleId) => {
      calls.takeover.push(vehicleId);
      return true;
    },
    release: () => {
      calls.release += 1;
      return true;
    },
    onClose: () => {
      calls.close += 1;
    },
    now: () => 0,
  });
  const input = snapshot([AVAILABLE, IN_RIDE, BLOCKED], 'taxi-1', null);
  panel.update(
    {
      fleet: input,
      map: {
        schemaVersion: 1,
        units: 'SI',
        version: '076-map-selection-v1',
        sessionId: input.sessionId,
        worldEpoch: input.worldEpoch,
        tick: input.tick,
        followedVehicleId: 'taxi-1',
        vehicles: input.vehicles.map((entry) => ({
          vehicleId: entry.vehicleId,
          kind: entry.kind,
          slot: entry.slot,
          label: entry.label,
          positionM: entry.positionM,
          headingRad: entry.headingRad,
          available: entry.available,
          selectable: true,
        })),
      },
    },
    0,
  );
  panel.open();
  assert.equal(panel.isOpen(), true);
  assert.equal(panel.getStats().rows, 3);
  assert.equal(panel.getStats().globalListeners, 0);
  const list = host.children[0]!.children[2]!.children[0]!;
  const firstRow = list.children[0]!.children[0]!;
  assert.equal(firstRow.getAttribute('aria-selected'), 'true');
  firstRow.dispatchEvent('click');
  assert.deepEqual(calls.select, ['taxi-1']);
  assert.deepEqual(calls.takeover, []);
  assert.equal(calls.release, 0);

  const actions = host.children[0]!.children[3]!;
  const takeover = actions.children[0]!;
  const release = actions.children[2]!;
  takeover.dispatchEvent('click');
  assert.deepEqual(calls.takeover, ['taxi-1']);
  // An accepted takeover closes the panel so a suspended MANUAL world resumes.
  assert.equal(panel.isOpen(), false);
  assert.equal(calls.close, 1);
  panel.open();
  release.dispatchEvent('click');
  assert.equal(calls.release, 1);
  assert.equal(panel.isOpen(), false);
  assert.equal(calls.close, 2);

  panel.open();
  const escape = host.children[0]!.dispatchEvent('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(panel.isOpen(), false);
  assert.equal(calls.close, 3);

  panel.open();
  host.children[0]!.dispatchEvent('keydown', { key: 'Tab' });
  assert.equal(panel.getStats().tabTraps, 1);
  assert.equal(panel.isOpen(), true);
  // A driving key is not captured by the panel.
  host.children[0]!.dispatchEvent('keydown', { code: 'KeyM', key: 'm' });
  assert.equal(panel.getStats().selects, 1);
  panel.dispose();
  assert.equal(panel.getStats().disposed, true);
});

test('263: panel writes are capped at 10 Hz and a camera change bypasses the cap', () => {
  const doc = createHudDocument();
  const host = doc.createElement('div');
  const panel = createFleetSelectionPanel(host as unknown as HTMLElement, {
    select: () => true,
    takeover: () => true,
    release: () => true,
    onClose: () => {},
    now: () => 0,
  });
  const input = snapshot([AVAILABLE, IN_RIDE]);
  const mapFor = (source: FleetSelectionSnapshot, followedVehicleId: string | null) => ({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: '076-map-selection-v1' as const,
    sessionId: source.sessionId,
    worldEpoch: source.worldEpoch,
    tick: source.tick,
    followedVehicleId,
    vehicles: source.vehicles.map((entry) => ({
      vehicleId: entry.vehicleId,
      kind: entry.kind,
      slot: entry.slot,
      label: entry.label,
      positionM: entry.positionM,
      headingRad: entry.headingRad,
      available: true,
      selectable: true,
    })),
  });
  try {
    panel.update({ fleet: input, map: mapFor(input, null) }, 0);
    assert.equal(panel.getStats().updates, 1);
    for (let frame = 1; frame <= 60; frame += 1)
      panel.update({ fleet: input, map: mapFor(input, null) }, frame);
    assert.equal(panel.getStats().updates, 1);
    assert.ok(panel.getStats().skipped >= 60);
    const selected = snapshot([AVAILABLE, IN_RIDE], 'civil-1');
    panel.update({ fleet: selected, map: mapFor(selected, 'civil-1') }, 61);
    assert.equal(panel.getStats().updates, 2);
    const list = host.children[0]!.children[2]!.children[0]!;
    assert.ok(
      list.children.some((item) => item.children[0]!.getAttribute('data-selected') === 'true'),
    );
  } finally {
    panel.dispose();
  }
});

test('263: the panel map reuses the 076 markers and a marker click selects only the camera', () => {
  const world = createCompositionWorld();
  const geometry = readMinimapGeometry({ map: world.map, graph: world.graph });
  const doc = createHudDocument();
  const host = doc.createElement('div');
  const selected: string[] = [];
  let strokes = 0;
  const context: MinimapContext = {
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {
      strokes += 1;
    },
    fill: () => {},
    arc: () => {},
    fillText: () => {},
    setLineDash: () => {},
    strokeStyle: null,
    fillStyle: null,
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'top',
  };
  const panel = createFleetSelectionPanel(host as unknown as HTMLElement, {
    select: (vehicleId) => {
      selected.push(vehicleId);
      return true;
    },
    takeover: () => true,
    release: () => false,
    onClose: () => {},
    geometry,
    context,
    now: () => 0,
  });
  try {
    const input = snapshot([AVAILABLE, IN_RIDE], 'taxi-1', null);
    panel.update(
      {
        fleet: input,
        map: {
          schemaVersion: 1,
          units: 'SI',
          version: '076-map-selection-v1',
          sessionId: input.sessionId,
          worldEpoch: input.worldEpoch,
          tick: input.tick,
          followedVehicleId: 'taxi-1',
          vehicles: input.vehicles.map((entry) => ({
            vehicleId: entry.vehicleId,
            kind: entry.kind,
            slot: entry.slot,
            label: entry.label,
            positionM: entry.positionM,
            headingRad: entry.headingRad,
            available: true,
            selectable: true,
          })),
        },
      },
      0,
    );
    panel.open();
    assert.equal(panel.getStats().mapMarkers, 2);
    assert.ok(strokes > 0);
    const mapHost = host.children[0]!.children[2]!.children[1]!.children[0]!.children[1]!;
    const overlay = mapHost.children[0]!;
    const marker = overlay.children.find(
      (child) => child.getAttribute('data-vehicle-id') === 'taxi-1',
    )!;
    marker.dispatchEvent('click');
    assert.deepEqual(selected, ['taxi-1']);
  } finally {
    panel.dispose();
  }
});

test('263: the app read model carries all live taxis and civilians into list and map', () => {
  const vehicles: CompositionVehicle[] = [
    {
      vehicleId: 'taxi-01',
      driverKind: 'TAXI',
      classId: 'sedan',
      slot: null,
      positionM: { x: 0, y: 0, z: 0 },
      yawRad: 0,
      speedMps: 0,
      speedLimitMps: 11.2,
      controlMode: 'AUTO',
      halfExtentsM: { x: 0.9, z: 2 },
      bottomM: 0,
      topM: 1.6,
      laneId: 'lane:1',
      routeLaneIds: ['lane:1'],
      rideId: null,
      rideProgressM: 0,
      appliedProfileVersion: 'p@1',
      maneuverState: 'IDLE',
      blocked: false,
    },
    {
      vehicleId: 'civil-01',
      driverKind: 'CIVILIAN',
      classId: 'compact',
      slot: 7,
      positionM: { x: 10, y: 0, z: 5 },
      yawRad: Math.PI / 2,
      speedMps: 0,
      speedLimitMps: 11.2,
      controlMode: 'AUTO',
      halfExtentsM: { x: 0.9, z: 2 },
      bottomM: 0,
      topM: 1.6,
      laneId: 'lane:2',
      routeLaneIds: ['lane:2', 'lane:3'],
      rideId: 'ride-2',
      rideProgressM: 4,
      appliedProfileVersion: 'p@1',
      maneuverState: 'IDLE',
      blocked: false,
    },
  ];
  const snapshotValue = readLiveFleetSelectionSnapshot({
    tick: 5,
    sessionId: '263-app',
    worldEpoch: 2,
    vehicles,
    authority: { consumer: 'CHARACTER', characterId: 'player-character' },
    cameraEntityId: 'civil-01',
    characterEntityId: 'player-character',
    selectedVehicleId: 'civil-01',
    playerVehicleId: null,
  });
  assert.equal(snapshotValue.fleet.vehicles.length, 2);
  assert.equal(snapshotValue.map.vehicles.length, 2);
  const seeded = snapshotValue.fleet.vehicles.find((entry) => entry.vehicleId === 'taxi-01')!;
  assert.equal(seeded.slot, 9998);
  assert.equal(seeded.kind, 'TAXI');
  const civil = snapshotValue.fleet.vehicles.find((entry) => entry.vehicleId === 'civil-01')!;
  assert.equal(civil.inRide, true);
  assert.equal(civil.selected, true);
  assert.equal(snapshotValue.map.followedVehicleId, 'civil-01');
  const parsed = parseFleetSelectionSnapshot(snapshotValue.fleet);
  assert.equal(parsed.tick, 5);
});
