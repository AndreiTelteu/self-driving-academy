import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCompositionWorld,
  createV3Composition,
  vehicleBodiesOverlap,
  type CompositionWorld,
  type V3Composition,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '257-mode-hud',
  worldEpoch: 1,
});

function composition(world: CompositionWorld): V3Composition {
  return createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('257-test').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    map: world.map,
    graph: world.graph,
  });
}

function taxiOf(model: V3Composition) {
  return model.frame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
}

function normalizeAngle(rad: number): number {
  return ((((rad + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

/** A sidewalk point just outside a tall building, facing away from it. */
function cameraBlockedStart(world: CompositionWorld) {
  for (const blocker of world.walkWorld.blockers) {
    if (blocker.kind !== 'BUILDING' || blocker.topM < 3) continue;
    const bounds = blocker.polygon.bounds;
    const candidates = [
      { x: (bounds.minX + bounds.maxX) / 2, z: bounds.minZ - 1.2, yawRad: Math.PI },
      { x: (bounds.minX + bounds.maxX) / 2, z: bounds.maxZ + 1.2, yawRad: 0 },
      { x: bounds.minX - 1.2, z: (bounds.minZ + bounds.maxZ) / 2, yawRad: -Math.PI / 2 },
      { x: bounds.maxX + 1.2, z: (bounds.minZ + bounds.maxZ) / 2, yawRad: Math.PI / 2 },
    ] as const;
    for (const candidate of candidates) {
      if (world.walkWorld.blockingAt(candidate.x, candidate.z).length > 0) continue;
      if (world.walkWorld.surfaceAt(candidate.x, candidate.z) > 0.2) continue;
      return Object.freeze(candidate);
    }
  }
  throw new Error('No building-adjacent sidewalk for the camera test');
}

test('257: OBB SAT separates parallel and rotated bodies and detects real overlap', () => {
  const sedan = Object.freeze({ halfX: 0.85, halfZ: 2 });
  assert.equal(
    vehicleBodiesOverlap({ x: 0, z: 0, yawRad: 0 }, sedan, { x: 1.5, z: 0, yawRad: 0 }, sedan),
    true,
  );
  assert.equal(
    vehicleBodiesOverlap({ x: 0, z: 0, yawRad: 0 }, sedan, { x: 2.5, z: 0, yawRad: 0 }, sedan),
    false,
  );
  assert.equal(
    vehicleBodiesOverlap(
      { x: 0, z: 0, yawRad: 0 },
      sedan,
      { x: 0, z: 2.5, yawRad: Math.PI / 2 },
      sedan,
    ),
    true,
  );
  assert.equal(
    vehicleBodiesOverlap(
      { x: 0, z: 0, yawRad: 0 },
      sedan,
      { x: 0, z: 3.2, yawRad: Math.PI / 2 },
      sedan,
    ),
    false,
  );
});

test('257: M comută MANUAL/AUTO, AUTO conduce pe rută, iar MANUAL readuce inputul', () => {
  const world = createCompositionWorld();
  const model = composition(world);
  try {
    model.step({ tick: 1 });
    model.requestEntry('taxi-01');
    model.step({ tick: 2 });
    assert.equal(model.vehicleMode(), 'MANUAL');
    const start = taxiOf(model).positionM;
    assert.equal(model.toggleVehicleMode(), 'AUTO');
    let frame = model.frame;
    for (let tick = 3; tick <= 140; tick += 1) frame = model.step({ tick });
    const autoTaxi = taxiOf(model);
    assert.equal(frame.hud.mode, 'AUTO');
    assert.equal(model.vehicleMode(), 'AUTO');
    assert.ok(frame.hud.speedMps > 0, 'HUD-ul primește viteza AUTO');
    assert.ok(
      Math.hypot(autoTaxi.positionM.x - start.x, autoTaxi.positionM.z - start.z) > 1,
      'taxiul AUTO s-a deplasat pe rută',
    );
    assert.ok(autoTaxi.laneId !== null);
    assert.ok(autoTaxi.routeLaneIds.length > 0);

    assert.equal(model.toggleVehicleMode(), 'MANUAL');
    model.port.setAction('throttle', true);
    for (let tick = 141; tick <= 200; tick += 1) frame = model.step({ tick });
    model.port.setAction('throttle', false);
    assert.equal(frame.hud.mode, 'MANUAL');
    assert.ok(taxiOf(model).speedMps > 0, 'inputul manual este din nou autoritar');
    assert.ok(frame.hud.speedMps > 0);
  } finally {
    model.dispose();
  }
});

test('257: orbita camerei revine în spate după ce obstacolul este depășit', () => {
  const world = createCompositionWorld();
  const start = cameraBlockedStart(world);
  const model = createV3Composition({
    layout: world.layout,
    start,
    control: createDefaultSettings('257-camera').input.control,
    context: CONTEXT,
    vehicles: [],
  });
  try {
    let frame = model.step({ tick: 1 });
    assert.ok(frame.camera.obstructedBy !== null, 'camera pornește blocată de clădire');
    assert.ok(frame.camera.distanceM < 2, 'camera este retrasă lângă ancoră');
    for (let tick = 2; tick <= 20; tick += 1) frame = model.step({ tick });
    const rotated = frame.camera.yawRad;
    assert.ok(
      Math.abs(normalizeAngle(rotated - (frame.character.yawRad + Math.PI))) > 0.5,
      'obstacolul a rotit orbita',
    );
    model.port.setAction('throttle', true);
    for (let tick = 21; tick <= 220; tick += 1) frame = model.step({ tick });
    model.port.setAction('throttle', false);
    assert.equal(frame.camera.obstructedBy, null);
    assert.ok(frame.camera.distanceM > 3, 'camera revine la distanța completă');
    assert.ok(
      Math.abs(normalizeAngle(frame.camera.yawRad - (frame.character.yawRad + Math.PI))) < 0.1,
      `camera a revenit în spate: ${frame.camera.yawRad}`,
    );
  } finally {
    model.dispose();
  }
});

test('257: mașina condusă se oprește la caroseria civilului static, fără să treacă prin ea', () => {
  const world = createCompositionWorld();
  const model = composition(world);
  try {
    model.step({ tick: 1 });
    model.requestEntry('taxi-01');
    model.step({ tick: 2 });
    model.port.setAction('throttle', true);
    for (let tick = 3; tick <= 1200; tick += 1) model.step({ tick });
    model.port.setAction('throttle', false);
    const taxi = taxiOf(model);
    const parked = model.frame.vehicles.find((vehicle) => vehicle.vehicleId === 'civil-01')!;
    assert.ok(
      taxi.positionM.x <= parked.positionM.x - 3.99,
      `taxiul ${taxi.positionM.x} nu a intrat în civilul ${parked.positionM.x}`,
    );
    assert.equal(taxi.speedMps, 0);
  } finally {
    model.dispose();
  }
});
