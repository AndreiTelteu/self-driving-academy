import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AMBIENT_TRAFFIC_POLICY,
  createAmbientTraffic,
  createCityStyleProfile,
  createCompositionWorld,
  createV3Composition,
  type AmbientTraffic,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';
import type { CompositionFrame } from '../../src/app';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '256-browser-ai-traffic',
  worldEpoch: 1,
});

function fixture(seed = 256): {
  readonly world: ReturnType<typeof createCompositionWorld>;
  readonly ambient: AmbientTraffic;
  readonly composition: ReturnType<typeof createV3Composition>;
} {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  });
  const composition = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('256-test').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    traffic: ambient.traffic,
  });
  return { world, ambient, composition };
}

function aiVehicles(frame: CompositionFrame) {
  return frame.vehicles.filter(
    (vehicle) => vehicle.vehicleId !== 'taxi-01' && vehicle.vehicleId !== 'civil-01',
  );
}

test('256: compunerea publică cel puțin 20 de mașini AI cu rute READY și spawn vizibil', () => {
  const { world, ambient, composition } = fixture();
  try {
    const actors = ambient.traffic.list();
    assert.equal(actors.length, AMBIENT_TRAFFIC_POLICY.civilians);
    assert.ok(actors.length >= 20);
    assert.equal(new Set(actors.map((actor) => actor.vehicleId)).size, actors.length);
    const lanes = new Set<string>();
    for (const actor of actors) {
      assert.equal(actor.route.status, 'READY');
      assert.equal(actor.route.source, '041-route-planner');
      assert.ok(actor.route.path.length > 0);
      assert.ok(Number.isFinite(actor.positionM.x));
      assert.ok(Number.isFinite(actor.positionM.z));
      assert.ok(Math.abs(actor.positionM.x) < 10_000);
      assert.ok(Math.abs(actor.positionM.z) < 10_000);
      lanes.add(actor.laneId);
    }
    assert.equal(lanes.size, actors.length, 'fiecare actor pornește pe o bandă proprie');
    const nearest = Math.min(
      ...actors.map((actor) =>
        Math.hypot(actor.positionM.x - world.spawn.x, actor.positionM.z - world.spawn.z),
      ),
    );
    assert.ok(
      nearest <= AMBIENT_TRAFFIC_POLICY.nearSpawnRadiusM,
      `cel mai apropiat AI: ${nearest}`,
    );
    assert.ok(nearest >= AMBIENT_TRAFFIC_POLICY.spawnClearanceM, `spawn prea aproape: ${nearest}`);
    const east = actors.find((actor) => actor.laneId === 'lane:00E0');
    assert.ok(east, 'banda estică de lângă spawn are un actor vizibil');
    assert.ok(
      east.positionM.x > world.spawn.x + 5,
      `actorul estic pornește în față: ${east.positionM.x} vs ${world.spawn.x}`,
    );
    assert.equal(ambient.style.profileId, ambient.registry.configuration.profile.profileId);
    const frame = composition.step({ tick: 1 });
    assert.equal(aiVehicles(frame).length, AMBIENT_TRAFFIC_POLICY.civilians);
    assert.equal(frame.vehicles.length, AMBIENT_TRAFFIC_POLICY.civilians + 2);
  } finally {
    composition.dispose();
    ambient.dispose();
  }
});

test('256: mașinile AI se deplasează pe tick-uri consecutive, cu heading coerent', () => {
  const { composition } = fixture();
  try {
    let frame = composition.step({ tick: 1 });
    const initial = new Map(aiVehicles(frame).map((vehicle) => [vehicle.vehicleId, vehicle]));
    const north = [...initial.values()].find((vehicle) => vehicle.laneId === 'lane:00N0');
    assert.ok(north, 'banda de nord de lângă spawn este folosită de un actor vizibil');

    for (let tick = 2; tick <= 300; tick += 1) frame = composition.step({ tick });
    const current = new Map(aiVehicles(frame).map((vehicle) => [vehicle.vehicleId, vehicle]));
    assert.equal(current.size, initial.size);

    let moved = 0;
    for (const [id, start] of initial) {
      const end = current.get(id)!;
      assert.ok(Number.isFinite(end.positionM.x));
      assert.ok(Number.isFinite(end.positionM.z));
      assert.ok(Number.isFinite(end.yawRad));
      assert.ok(end.speedMps >= 0 && end.speedMps <= 30);
      const distance = Math.hypot(
        end.positionM.x - start.positionM.x,
        end.positionM.z - start.positionM.z,
      );
      if (distance > 5) moved += 1;
    }
    assert.ok(
      moved >= Math.ceil(initial.size * 0.8),
      `${moved}/${initial.size} mașini AI s-au deplasat peste 5 m în 300 tick-uri`,
    );

    const northEnd = current.get(north.vehicleId)!;
    assert.ok(northEnd.positionM.z > north.positionM.z + 5, 'actorul de nord avansează pe +Z');
    assert.ok(Math.abs(northEnd.positionM.x - north.positionM.x) < 1, 'actorul rămâne pe bandă');
    assert.ok(Math.abs(northEnd.yawRad) < 0.2, 'yaw-ul compunerii este 0 pe direcția +Z');
  } finally {
    composition.dispose();
  }
});

test('256: o mașină AI nu poate fi preluată și nu își schimbă autoritatea', () => {
  const { composition } = fixture();
  try {
    const frame = composition.step({ tick: 1 });
    const actor = aiVehicles(frame)[0]!;
    composition.requestEntry(actor.vehicleId);
    const refused = composition.step({ tick: 2 });
    assert.equal(refused.authority.consumer, 'CHARACTER');
    assert.equal(refused.authority.characterId, 'player-character');
    const event = refused.events.at(-1);
    assert.equal(event?.kind, 'ENTER_REFUSED');
    assert.match(event?.detail ?? '', /AI_TRAFFIC/);
    assert.equal(refused.stats.entryAttempts, 1);
    // Compoziția fără trafic rămâne exact cele două vehicule din lumea 236.
    const plainWorld = createCompositionWorld();
    const plain = createV3Composition({
      layout: plainWorld.layout,
      start: plainWorld.spawn,
      control: createDefaultSettings('256-plain').input.control,
      context: CONTEXT,
      vehicles: plainWorld.vehicles,
    });
    try {
      assert.equal(plain.step({ tick: 1 }).vehicles.length, 2);
    } finally {
      plain.dispose();
    }
  } finally {
    composition.dispose();
  }
});

test('256: același seed produce aceleași poziții AI, iar stilul este comun și BASE', () => {
  const first = fixture(256);
  const second = fixture(256);
  try {
    const left = first.ambient.traffic.list();
    const right = second.ambient.traffic.list();
    assert.deepEqual(
      left.map((actor) => [actor.vehicleId, actor.laneId, actor.positionM.x, actor.positionM.z]),
      right.map((actor) => [actor.vehicleId, actor.laneId, actor.positionM.x, actor.positionM.z]),
    );
    const style = createCityStyleProfile();
    assert.equal(style.profileId, 'v3-city-style');
    for (const value of Object.values(style.provenanceByParameter)) {
      assert.ok(value === 'BASE', 'valorile implicite nu sunt pretinse ca LEARNED');
    }
  } finally {
    first.composition.dispose();
    first.ambient.dispose();
    second.composition.dispose();
    second.ambient.dispose();
  }
});
