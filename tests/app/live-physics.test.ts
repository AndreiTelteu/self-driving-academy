import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAmbientTraffic,
  createCompositionWorld,
  createRecoveryRoadProvider,
  createV3Composition,
  type CompositionFrame,
  type V3Composition,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';
import { createLiveVehiclePhysics, type LiveVehiclePhysics } from '../../src/vehicles';
import type { ContractContext } from '../../src/sessions';

const CONTEXT: ContractContext = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '282-live-composition-test',
  worldEpoch: 1,
});

interface Fixture {
  readonly composition: V3Composition;
  readonly physics: LiveVehiclePhysics;
  step(): CompositionFrame;
  vehicle(vehicleId: string): CompositionFrame['vehicles'][number];
}

async function withComposition<T>(work: (fixture: Fixture) => T | Promise<T>): Promise<T> {
  const world = createCompositionWorld();
  const traffic = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed: 256,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  });
  const physics = await createLiveVehiclePhysics({
    context: CONTEXT,
    initialTick: 0,
    staticBoxes: world.walkWorld.blockers.map((blocker) => {
      const bounds = blocker.polygon.bounds;
      return Object.freeze({
        id: blocker.id,
        centerM: Object.freeze({
          x: (bounds.minX + bounds.maxX) / 2,
          y: (blocker.bottomM + blocker.topM) / 2,
          z: (bounds.minZ + bounds.maxZ) / 2,
        }),
        halfExtentsM: Object.freeze({
          x: Math.max(0.05, (bounds.maxX - bounds.minX) / 2),
          y: Math.max(0.05, (blocker.topM - blocker.bottomM) / 2),
          z: Math.max(0.05, (bounds.maxZ - bounds.minZ) / 2),
        }),
      });
    }),
    recovery: createRecoveryRoadProvider(world.graph),
  });
  const composition = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('282-live-composition-test').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    traffic: traffic.traffic,
    map: world.map,
    graph: world.graph,
    physics,
  });
  let tick = 0;
  try {
    return await work({
      composition,
      physics,
      step: () => composition.step({ tick: ++tick }),
      vehicle: (vehicleId) => {
        const found = composition.frame.vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);
        assert(found !== undefined, `Missing composition vehicle ${vehicleId}`);
        return found;
      },
    });
  } finally {
    composition.dispose();
    physics.dispose();
    traffic.dispose();
  }
}

test('PLAYER drives a real Rapier car with wheels, suspension and contacts', async () => {
  await withComposition(({ composition, step, vehicle }) => {
    composition.requestEntry('taxi-01');
    step();
    composition.port.setAction('throttle', true);
    for (let index = 0; index < 90; index++) step();
    const taxi = vehicle('taxi-01');
    assert(taxi.speedMps > 3, `speed ${taxi.speedMps}`);
    assert(Math.hypot(taxi.positionM.x - 9.8, taxi.positionM.z - 2.05) > 2);
    assert.equal(taxi.wheelContacts, 4);
    assert.equal(taxi.wheels?.length, 4);
    assert(taxi.suspensionLengthsM?.every((length) => length >= 0 && length <= 0.6));
    assert.equal(taxi.availability, 'AVAILABLE');
    const stats = composition.physicsStats();
    assert(stats !== null);
    assert(stats!.native?.controller.vehicles === 2);
    assert(stats!.native?.controller.players === 1);
    assert(stats!.cost.samples > 0);
  });
});

test('MANUAL and AUTO preserve position, speed and yaw at the authority boundary', async () => {
  await withComposition(({ composition, step, vehicle }) => {
    composition.requestEntry('taxi-01');
    step();
    composition.port.setAction('throttle', true);
    for (let index = 0; index < 110; index++) step();
    composition.port.setAction('throttle', false);
    const before = vehicle('taxi-01');
    assert(before.speedMps > 4);
    composition.requestModeAction('M');
    step();
    const auto = vehicle('taxi-01');
    const autoDistance = Math.hypot(
      auto.positionM.x - before.positionM.x,
      auto.positionM.z - before.positionM.z,
    );
    assert(auto.controlMode === 'AUTO');
    assert(autoDistance <= before.speedMps / 60 + 0.05, `AUTO jumped ${autoDistance} m`);
    assert(Math.abs(auto.speedMps - before.speedMps) < 0.25);
    assert(Math.abs(auto.yawRad - before.yawRad) < 0.01);
    composition.requestModeAction('M');
    step();
    const manual = vehicle('taxi-01');
    const manualDistance = Math.hypot(
      manual.positionM.x - auto.positionM.x,
      manual.positionM.z - auto.positionM.z,
    );
    assert(manual.controlMode === 'MANUAL');
    assert(manualDistance <= auto.speedMps / 60 + 0.05, `MANUAL jumped ${manualDistance} m`);
    assert(Math.abs(manual.speedMps - auto.speedMps) < 0.25);
    assert(Math.abs(manual.yawRad - auto.yawRad) < 0.01);
  });
});

test('vehicle takeover keeps the target car pose, speed and yaw exactly', async () => {
  await withComposition(({ composition, step, vehicle }) => {
    composition.requestEntry('taxi-01');
    step();
    for (let index = 0; index < 60; index++) step();
    const civilBefore = vehicle('civil-01');
    assert(composition.requestTakeover('civil-01', 'MANUAL'));
    step();
    const civilAfter = vehicle('civil-01');
    assert.equal(composition.frame.playerVehicleId, 'civil-01');
    assert.equal(civilAfter.controlMode, 'MANUAL');
    assert(Math.abs(civilAfter.positionM.x - civilBefore.positionM.x) < 1e-9);
    assert(Math.abs(civilAfter.positionM.z - civilBefore.positionM.z) < 1e-9);
    assert(Math.abs(civilAfter.yawRad - civilBefore.yawRad) < 1e-9);
    assert(Math.abs(civilAfter.speedMps - civilBefore.speedMps) < 1e-9);
  });
});

test('impact damages the real cars and R recovery restores a physical car', async () => {
  await withComposition(({ composition, step, vehicle }) => {
    composition.requestEntry('taxi-01');
    step();
    composition.port.setAction('throttle', true);
    let damaged = false;
    for (let index = 0; index < 300 && !damaged; index++) {
      step();
      damaged = vehicle('taxi-01').availability !== 'AVAILABLE';
    }
    assert(damaged, 'taxi did not reach the parked car');
    composition.port.setAction('throttle', false);
    composition.port.setAction('brake', true);
    for (let index = 0; index < 120; index++) step();
    composition.port.setAction('brake', false);
    assert(composition.requestRecovery());
    step();
    const afterRecovery = vehicle('taxi-01');
    assert.equal(composition.physicsStats()?.recovery?.status, 'COMPLETED');
    assert(Math.abs(afterRecovery.speedMps) < 0.05);
    assert.equal(afterRecovery.availability, 'AVAILABLE');
    assert.equal(afterRecovery.wheelContacts, 4);
    const history = composition.physics?.readRecoveryHistory() ?? [];
    assert.equal(history.length, 1);
    assert.equal(history[0]?.kind, 'TELEPORT');
  });
});

test('AUTO drives the same car through the same controller at 60 Hz', async () => {
  await withComposition(({ composition, step, vehicle }) => {
    composition.requestEntry('taxi-01');
    step();
    composition.requestModeAction('M');
    step();
    assert.equal(vehicle('taxi-01').controlMode, 'AUTO');
    const origin = vehicle('taxi-01').positionM;
    for (let index = 0; index < 150; index++) step();
    const taxi = vehicle('taxi-01');
    assert(taxi.speedMps > 1.5, `AUTO speed ${taxi.speedMps}`);
    assert(Math.hypot(taxi.positionM.x - origin.x, taxi.positionM.z - origin.z) > 2);
    const stats = composition.physicsStats();
    assert(stats !== null);
    assert(stats!.native?.controller.players === 0);
    assert(stats!.native?.controller.targets >= 0);
    assert(stats!.contacts >= 0);
  });
});
