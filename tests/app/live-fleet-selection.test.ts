import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAmbientTraffic,
  createCompositionWorld,
  createV3Composition,
  readLiveFleetSelectionSnapshot,
  type AmbientTraffic,
  type CompositionWorld,
  type V3Composition,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '263-live-selection',
  worldEpoch: 1,
});

interface Fixture {
  readonly world: CompositionWorld;
  readonly ambient: AmbientTraffic;
  readonly model: V3Composition;
}

function fixture(): Fixture {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed: 263,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  });
  const model = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('263-test').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    traffic: ambient.traffic,
    map: world.map,
    graph: world.graph,
  });
  return { world, ambient, model };
}

function close(fixtureValue: Fixture): void {
  fixtureValue.model.dispose();
  fixtureValue.ambient.dispose();
}

function snapshotOf(fixtureValue: Fixture) {
  const frame = fixtureValue.model.frame;
  return readLiveFleetSelectionSnapshot({
    tick: frame.tick,
    sessionId: CONTEXT.sessionId,
    worldEpoch: CONTEXT.worldEpoch,
    vehicles: frame.vehicles,
    authority: frame.authority,
    cameraEntityId: frame.camera.entityId,
    characterEntityId: frame.character.entityId,
    selectedVehicleId: frame.selectedVehicleId,
    playerVehicleId: frame.playerVehicleId,
  });
}

function modeCount(model: V3Composition, mode: 'MANUAL' | 'LEARNING'): number {
  return model.frame.vehicles.filter((vehicle) => vehicle.controlMode === mode).length;
}

test('263: the live list and map contain every taxi, civilian and seeded car with stable ids', () => {
  const f = fixture();
  try {
    f.model.step({ tick: 1 });
    const snapshot = snapshotOf(f);
    assert.equal(snapshot.fleet.vehicles.length, 58);
    assert.equal(snapshot.map.vehicles.length, 58);
    assert.equal(snapshot.fleet.vehicles.filter((vehicle) => vehicle.kind === 'TAXI').length, 25);
    assert.equal(snapshot.fleet.vehicles.filter((vehicle) => vehicle.kind === 'CIVIL').length, 33);
    assert.equal(
      new Set(snapshot.fleet.vehicles.map((vehicle) => vehicle.vehicleId)).size,
      snapshot.fleet.vehicles.length,
    );
    for (const vehicle of snapshot.fleet.vehicles) {
      assert.equal(vehicle.available, true);
      assert.equal(vehicle.inRide, false);
      assert.equal(vehicle.blocked, false);
      assert.ok(vehicle.slot >= 1);
      assert.ok(Number.isFinite(vehicle.headingRad));
    }
    for (const vehicle of snapshot.map.vehicles) {
      assert.equal(vehicle.selectable, true);
      assert.ok(vehicle.positionM !== null);
      assert.equal(vehicle.label?.includes(vehicle.vehicleId) ?? false, vehicle.slot > 9000);
    }
    const first = snapshot.fleet.vehicles[0]!;
    f.model.step({ tick: 2 });
    const second = snapshotOf(f).fleet.vehicles.find(
      (vehicle) => vehicle.vehicleId === first.vehicleId,
    )!;
    assert.equal(second.vehicleId, first.vehicleId);
    assert.equal(second.kind, first.kind);
  } finally {
    close(f);
  }
});

test('263: selecting any car moves only the camera; the car stays AUTO until M', () => {
  const f = fixture();
  try {
    f.model.step({ tick: 1 });
    const target = f.ambient.list().find((actor) => actor.driverKind === 'CIVILIAN')!;
    assert.equal(f.model.selectVehicle(target.vehicleId), true);
    let frame = f.model.step({ tick: 2 });
    assert.equal(frame.authority.consumer, 'CHARACTER');
    assert.equal(frame.camera.entityId, target.vehicleId);
    assert.equal(frame.selectedVehicleId, target.vehicleId);
    assert.equal(frame.playerVehicleId, null);
    assert.equal(
      frame.vehicles.find((vehicle) => vehicle.vehicleId === target.vehicleId)!.controlMode,
      'AUTO',
    );
    assert.equal(modeCount(f.model, 'MANUAL'), 0);
    const selectedBefore = snapshotOf(f).fleet.vehicles.find(
      (vehicle) => vehicle.vehicleId === target.vehicleId,
    )!;
    assert.equal(selectedBefore.selected, true);
    assert.equal(selectedBefore.available, true);

    f.model.step({ tick: 3 });
    frame = f.model.step({ tick: 4 });
    assert.equal(frame.authority.consumer, 'CHARACTER');
    assert.equal(
      frame.vehicles.find((vehicle) => vehicle.vehicleId === target.vehicleId)!.controlMode,
      'AUTO',
    );
    assert.equal(f.model.selectVehicle('missing-vehicle'), false);
    f.model.selectVehicle(null);
    frame = f.model.step({ tick: 5 });
    assert.equal(frame.selectedVehicleId, null);
    assert.equal(frame.camera.entityId, frame.character.entityId);
  } finally {
    close(f);
  }
});

test('263: explicit takeover keeps one PLAYER seat and reconciles the live AI route', () => {
  const f = fixture();
  try {
    f.model.step({ tick: 1 });
    const target = f.ambient.list().find((actor) => actor.driverKind === 'CIVILIAN')!;
    const targetRouteBefore = f.ambient.get(target.vehicleId)!.route;
    const targetPositionBefore = { ...target.positionM };
    f.model.selectVehicle(target.vehicleId);
    assert.equal(f.model.requestTakeover(target.vehicleId, 'MANUAL'), true);
    let tick = 2;
    let frame = f.model.step({ tick });
    assert.equal(frame.authority.consumer, 'VEHICLE');
    assert.equal(
      frame.authority.consumer === 'VEHICLE' ? frame.authority.vehicleId : null,
      target.vehicleId,
    );
    assert.equal(frame.playerVehicleId, target.vehicleId);
    assert.equal(frame.stats.takeovers, 1);
    assert.equal(frame.stats.takeoverAttempts, 1);
    assert.equal(frame.hud.mode, 'MANUAL');
    assert.equal(modeCount(f.model, 'MANUAL'), 1);
    const taken = frame.vehicles.find((vehicle) => vehicle.vehicleId === target.vehicleId)!;
    const locked = f.ambient.get(target.vehicleId)!;
    // PBI 271: the transition keeps the physical speed, so the takeover tick advances one normal
    // step instead of teleporting to a zero-speed state.
    const expectedStepM = Math.abs(target.speedMps) / 60;
    assert.ok(
      Math.hypot(taken.positionM.x - locked.positionM.x, taken.positionM.z - locked.positionM.z) <=
        expectedStepM + 1e-6,
    );
    assert.deepEqual(f.ambient.get(target.vehicleId)!.route.path, targetRouteBefore.path);

    f.model.port.setAction('throttle', true);
    for (let nextTick = 3; nextTick <= 100; nextTick += 1) {
      tick = nextTick;
      frame = f.model.step({ tick });
    }
    f.model.port.setAction('throttle', false);
    const driven = frame.vehicles.find((vehicle) => vehicle.vehicleId === target.vehicleId)!;
    const drivenPosition = { ...driven.positionM };
    assert.ok(
      Math.hypot(
        drivenPosition.x - targetPositionBefore.x,
        drivenPosition.z - targetPositionBefore.z,
      ) > 2,
    );
    assert.equal(modeCount(f.model, 'MANUAL'), 1);

    const next = f.ambient
      .list()
      .find((actor) => actor.vehicleId !== target.vehicleId && actor.driverKind === 'TAXI')!;
    const nextRouteBefore = f.ambient.get(next.vehicleId)!.route;
    f.model.selectVehicle(next.vehicleId);
    assert.equal(f.model.requestTakeover(next.vehicleId, 'MANUAL'), true);
    for (let index = 0; index < 2; index += 1) {
      tick += 1;
      frame = f.model.step({ tick });
    }
    assert.equal(frame.authority.consumer, 'VEHICLE');
    assert.equal(
      frame.authority.consumer === 'VEHICLE' ? frame.authority.vehicleId : null,
      next.vehicleId,
    );
    assert.equal(frame.playerVehicleId, next.vehicleId);
    assert.equal(modeCount(f.model, 'MANUAL'), 1);
    const released = frame.vehicles.find((vehicle) => vehicle.vehicleId === target.vehicleId)!;
    assert.equal(released.controlMode, 'AUTO');
    assert.ok(f.ambient.get(target.vehicleId)!.authority === 'AUTO');
    assert.deepEqual(f.ambient.get(target.vehicleId)!.route.path, targetRouteBefore.path);
    assert.ok(
      Math.hypot(released.positionM.x - drivenPosition.x, released.positionM.z - drivenPosition.z) <
        2,
      'released car stays at the driven point instead of snapping back',
    );
    const takenNext = frame.vehicles.find((vehicle) => vehicle.vehicleId === next.vehicleId)!;
    const lockedNext = f.ambient.get(next.vehicleId)!;
    assert.ok(
      Math.hypot(
        takenNext.positionM.x - lockedNext.positionM.x,
        takenNext.positionM.z - lockedNext.positionM.z,
      ) <=
        Math.abs(next.speedMps) / 60 + 1e-6,
    );
    assert.deepEqual(f.ambient.get(next.vehicleId)!.route.path, nextRouteBefore.path);

    const snapshot = snapshotOf(f);
    assert.equal(snapshot.fleet.playerVehicleId, next.vehicleId);
    assert.equal(snapshot.fleet.vehicles.filter((vehicle) => vehicle.playerControlled).length, 1);
    assert.equal(
      snapshot.fleet.vehicles.find((vehicle) => vehicle.vehicleId === target.vehicleId)!
        .playerControlled,
      false,
    );
    assert.equal(snapshot.map.followedVehicleId, next.vehicleId);

    assert.equal(f.model.requestRelease(), true);
    tick += 1;
    frame = f.model.step({ tick });
    assert.equal(frame.playerVehicleId, null);
    assert.equal(frame.authority.consumer, 'VEHICLE');
    assert.equal(
      frame.authority.consumer === 'VEHICLE' ? frame.authority.vehicleId : null,
      next.vehicleId,
    );
    assert.equal(
      frame.vehicles.find((vehicle) => vehicle.vehicleId === next.vehicleId)!.controlMode,
      'AUTO',
    );
    assert.equal(modeCount(f.model, 'MANUAL'), 0);
    assert.equal(frame.stats.releases, 1);
    assert.equal(frame.camera.entityId, next.vehicleId);
    assert.match(frame.events.at(-1)?.detail ?? '', /AUTO, route kept/);
  } finally {
    close(f);
  }
});

test('263: the seeded parked taxi can be taken over and released to its AUTO route', () => {
  const f = fixture();
  try {
    f.model.step({ tick: 1 });
    const parked = f.model.frame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
    const parkedPosition = { ...parked.positionM };
    assert.equal(f.model.selectVehicle('taxi-01'), true);
    assert.equal(f.model.requestTakeover('taxi-01', 'MANUAL'), true);
    let frame = f.model.step({ tick: 2 });
    assert.equal(frame.authority.consumer, 'VEHICLE');
    assert.equal(
      frame.authority.consumer === 'VEHICLE' ? frame.authority.vehicleId : null,
      'taxi-01',
    );
    const taken = frame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
    assert.equal(taken.controlMode, 'MANUAL');
    assert.ok(
      Math.hypot(taken.positionM.x - parkedPosition.x, taken.positionM.z - parkedPosition.z) < 1e-9,
    );
    assert.equal(f.model.requestRelease(), true);
    frame = f.model.step({ tick: 3 });
    assert.equal(frame.playerVehicleId, null);
    assert.equal(
      frame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!.controlMode,
      'AUTO',
    );
    for (let nextTick = 4; nextTick <= 160; nextTick += 1) frame = f.model.step({ tick: nextTick });
    const released = frame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
    assert.equal(released.controlMode, 'AUTO');
    assert.ok(
      Math.hypot(released.positionM.x - parkedPosition.x, released.positionM.z - parkedPosition.z) >
        1,
      'AUTO driver continues from the parked point',
    );
    assert.ok(released.routeLaneIds.length > 0);
    assert.equal(frame.stats.releases, 1);
  } finally {
    close(f);
  }
});

test('263/271: L selects LEARNING with one PLAYER seat; the seat does not move twice', () => {
  const f = fixture();
  try {
    f.model.step({ tick: 1 });
    const target = f.ambient.list().find((actor) => actor.driverKind === 'TAXI')!;
    f.model.selectVehicle(target.vehicleId);
    assert.equal(f.model.takeOverSelected('LEARNING'), true);
    const frame = f.model.step({ tick: 2 });
    assert.equal(frame.authority.consumer, 'VEHICLE');
    assert.equal(frame.playerVehicleId, target.vehicleId);
    assert.equal(frame.hud.mode, 'LEARNING');
    assert.equal(frame.stats.takeovers, 1);
    assert.equal(modeCount(f.model, 'LEARNING'), 1);
    assert.equal(modeCount(f.model, 'MANUAL'), 0);
    const accepted = frame.events.find((event) => event.kind === 'MODE_ACCEPTED');
    assert.ok(accepted);
    assert.match(accepted.detail, /LEARNING/);
  } finally {
    close(f);
  }
});
