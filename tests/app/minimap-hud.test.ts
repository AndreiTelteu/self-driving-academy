import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { readMinimapFrame, readMinimapIncidents } from '../../src/app';
import { readTaxiHudSnapshot } from '../../src/app';
import { createHealthWorld, disposeHealthWorld } from '../fleet/fleet-health-fixture';
import { createMinimapScene, createMinimapTransform, MINIMAP_VERSION } from '../../src/ui';
import { sceneOf } from '../ui/minimap-fixture';
import { minimalMap } from '../world/fixture';
import { liveHudReportMarkdown, runLiveHudReport } from './minimap-hud-report';

test('281 incident markers come from a real 065 collision fact with stable identity', () => {
  const world = createHealthWorld({
    taxiCount: 20,
    civilianCount: 20,
    assign: 1,
    beginRides: false,
  });
  try {
    const registry = world.scenario.registry,
      taxi = registry.list().find((vehicle) => vehicle.driverKind === 'TAXI')!,
      positions = new Map([[taxi.vehicleId, { x: 12.5, z: -3.25 }]]);
    assert.equal(
      readMinimapIncidents(
        { health: world.scenario.health },
        {
          sessionId: '281-incidents',
          worldEpoch: 1,
          tick: 60,
          positions: (vehicleId) => positions.get(vehicleId) ?? null,
        },
      ).incidents.length,
      0,
      'an available fleet has no incident marker',
    );
    world.scenario.health.apply({
      taxiId: taxi.vehicleId,
      fact: 'COLLISION_DAMAGE',
      factId: '281:collision:1',
      tick: 61,
    });
    const snapshot = readMinimapIncidents(
      { health: world.scenario.health },
      {
        sessionId: '281-incidents',
        worldEpoch: 1,
        tick: 61,
        positions: (vehicleId) => positions.get(vehicleId) ?? null,
      },
    );
    assert.equal(snapshot.health, 'AVAILABLE');
    assert.equal(snapshot.incidents.length, 1);
    assert.equal(snapshot.incidents[0]!.incidentId, '281:collision:1');
    assert.equal(snapshot.incidents[0]!.vehicleId, taxi.vehicleId);
    assert.deepEqual(snapshot.incidents[0]!.positionM, { x: 12.5, z: -3.25 });
    positions.set(taxi.vehicleId, { x: 13.5, z: -2.25 });
    const moved = readMinimapIncidents(
      { health: world.scenario.health },
      {
        sessionId: '281-incidents',
        worldEpoch: 1,
        tick: 62,
        positions: (vehicleId) => positions.get(vehicleId) ?? null,
      },
    );
    assert.equal(moved.incidents[0]!.incidentId, '281:collision:1');
    assert.deepEqual(moved.incidents[0]!.positionM, { x: 13.5, z: -2.25 });
    positions.clear();
    assert.equal(
      readMinimapIncidents(
        { health: world.scenario.health },
        {
          sessionId: '281-incidents',
          worldEpoch: 1,
          tick: 63,
          positions: () => null,
        },
      ).incidents.length,
      0,
      'a missing position is omitted instead of being placed at zero',
    );
    world.scenario.health.apply({
      taxiId: taxi.vehicleId,
      fact: 'RECOVERY',
      factId: '281:recovery:1',
      tick: 64,
    });
    assert.equal(
      readMinimapIncidents(
        { health: world.scenario.health },
        {
          sessionId: '281-incidents',
          worldEpoch: 1,
          tick: 64,
          positions: () => ({ x: 0, z: 0 }),
        },
      ).incidents.length,
      0,
    );
    const unavailable = readMinimapIncidents(
      { health: undefined },
      { sessionId: '281-incidents', worldEpoch: 1, tick: 65, positions: () => null },
    );
    assert.equal(unavailable.health, 'UNAVAILABLE');
    assert.equal(unavailable.incidents.length, 0);
  } finally {
    disposeHealthWorld(world);
  }
});

test('281 a composition car outside the 057 registry keeps a presentation-only slot', () => {
  const scene = sceneOf(minimalMap()),
    world = createHealthWorld({ taxiCount: 20, civilianCount: 20 }),
    sources = {
      fleet: world.scenario.registry,
      lifecycle: world.scenario.lifecycle,
      eta: world.scenario.eta,
    };
  try {
    const frame = readMinimapFrame(sources, {
      taxiId: 'taxi-01',
      taxiSlot: 9998,
      tick: 5,
      positionM: { x: 0, y: 0, z: 0 },
      headingRad: 0,
    });
    assert.equal(frame.taxi?.vehicleId, 'taxi-01');
    assert.equal(frame.taxi?.slot, 9998);
    assert.equal(frame.ride, null);
    assert.equal(frame.route.status, 'NO_ROUTE');
    assert.equal(frame.version, MINIMAP_VERSION);
    const missing = readMinimapFrame(sources, {
      taxiId: 'taxi-unknown',
      tick: 6,
      positionM: null,
    });
    assert.equal(missing.taxi, null);
    assert.equal(missing.positionM, null);
    assert.ok(createMinimapScene(scene.geometry).transform.scale > 0);
    assert.equal(createMinimapTransform(scene.geometry.bounds).widthPx, 240);
  } finally {
    disposeHealthWorld(world);
  }
});

test('281 HUD shows the real session, objective and ride state without inventing zero', () => {
  const world = createHealthWorld({
    taxiCount: 20,
    civilianCount: 20,
    assign: 1,
    beginRides: true,
  });
  try {
    const registry = world.scenario.registry,
      ride = world.scenario.lifecycle.active()[0]!,
      sources = {
        fleet: registry,
        lifecycle: world.scenario.lifecycle,
        eta: world.scenario.eta,
      },
      snapshot = readTaxiHudSnapshot(sources, {
        taxiId: ride.taxiId,
        mode: 'AUTO',
        sessionKind: 'ACADEMY',
        tick: 60,
        speedMps: 8,
      });
    assert.equal(snapshot.session.kind, 'ACADEMY');
    assert.equal(snapshot.session.id, world.scenario.registry.context().sessionId);
    assert.ok(snapshot.ride !== null);
    assert.ok(snapshot.ride!.pickupZoneId.length > 0);
    const empty = readTaxiHudSnapshot(sources, {
      taxiId: 'missing-taxi',
      mode: 'AUTO',
      tick: 61,
      speedMps: null,
    });
    assert.equal(empty.taxi, null);
    assert.equal(empty.speedMps, null);
    assert.equal(empty.ride, null);
  } finally {
    disposeHealthWorld(world);
  }
});

test('281 committed minimap and HUD evidence is the current deterministic transcript', () => {
  const report = runLiveHudReport();
  assert.equal(report.summary.pass, true);
  const directory = join(process.cwd(), 'Docs', 'Evidence', '281-minimap-hud');
  assert.equal(
    readFileSync(join(directory, 'report.json'), 'utf8'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  assert.equal(readFileSync(join(directory, 'report.md'), 'utf8'), liveHudReportMarkdown(report));
});
