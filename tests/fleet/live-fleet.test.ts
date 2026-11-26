import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  AMBIENT_TRAFFIC_POLICY,
  AMBIENT_TRAFFIC_VERSION,
  createAmbientTraffic,
  createCityStyleProfile,
} from '../../src/app';
import {
  CIVIL_TRAFFIC_LIMITS,
  FLEET_LIMITS,
  createCivilTraffic,
  createFleetRegistry,
} from '../../src/fleet';
import { createCompositionWorld } from '../../src/app';
import { LIVE_FLEET_REPORT_VERSION, runLiveFleetReport } from './live-fleet-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '262-live-fleet', 'report.json');

function configuration(
  profile: ReturnType<typeof createCityStyleProfile>,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: '262-test',
    worldEpoch: 1,
    scenarioId: 'v3-composition-city',
    seed: 262,
    namespace: 'v3:city:fleet',
    taxiCount: 30,
    civilianCount: 40,
    profile: { profileId: profile.profileId, versionId: profile.versionId },
  };
}

test('262 both taxi and civilian registry vehicles become real 041 actors', () => {
  const world = createCompositionWorld(),
    style = createCityStyleProfile(),
    registry = createFleetRegistry(configuration(style)),
    traffic = createCivilTraffic({
      registry,
      map: world.map,
      graph: world.graph,
      style,
      seed: 262,
      driverKinds: ['TAXI', 'CIVILIAN'],
    });
  try {
    const actors = traffic.list();
    assert.equal(actors.length, 70);
    assert.equal(actors.filter((actor) => actor.driverKind === 'TAXI').length, 30);
    assert.equal(actors.filter((actor) => actor.driverKind === 'CIVILIAN').length, 40);
    assert.equal(new Set(actors.map((actor) => actor.vehicleId)).size, 70);
    for (const actor of actors) {
      assert.equal(actor.route.status, 'READY');
      assert.equal(actor.route.source, '041-route-planner');
      assert.equal(actor.route.access, actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL');
      assert.ok(actor.route.path.length > 0);
      assert.equal(actor.authority, 'AUTO');
      assert.equal(actor.styleProfileId, style.profileId);
      assert.equal(actor.styleVersionId, style.versionId);
    }
    traffic.step({ tick: 1, dtSeconds: 1 / 60 });
    for (const actor of actors) {
      const state = registry.state(actor.vehicleId)!;
      assert.equal(state.tick, 1);
      assert.equal(state.appliedProfileVersion, style.versionId);
      assert.equal(state.controlMode, 'AUTO');
    }
    assert.equal(traffic.report().vehicles, 70);
    assert.equal(traffic.report().routesFromPlanner, 70);
  } finally {
    traffic.dispose();
    registry.dispose();
  }
});

test('262 per-kind spawn lanes keep taxis and civilians visible without sharing a lane', () => {
  const world = createCompositionWorld(),
    style = createCityStyleProfile(),
    registry = createFleetRegistry(configuration(style));
  const graph = world.graph,
    lane = (id: string) => graph.getDirectedPath(id) !== null;
  assert.ok(lane('lane:00N0') && lane('lane:00E0'));
  const traffic = createCivilTraffic({
    registry,
    map: world.map,
    graph,
    style,
    seed: 262,
    driverKinds: ['TAXI', 'CIVILIAN'],
    spawnLanesByKind: { TAXI: ['lane:00N0'], CIVILIAN: ['lane:00E0'] },
    spawnOffsetsMByKind: { TAXI: [10], CIVILIAN: [10] },
  });
  try {
    const taxi = traffic
      .list()
      .find((actor) => actor.driverKind === 'TAXI' && actor.laneId === 'lane:00N0');
    const civilian = traffic
      .list()
      .find((actor) => actor.driverKind === 'CIVILIAN' && actor.laneId === 'lane:00E0');
    assert.ok(taxi);
    assert.ok(civilian);
    assert.equal(new Set(traffic.list().map((actor) => actor.laneId)).size, 70);
  } finally {
    traffic.dispose();
    registry.dispose();
  }
});

test('262 ambient live fleet uses the documented normal population and public contract', () => {
  assert.equal(AMBIENT_TRAFFIC_VERSION, '262-live-fleet-v1');
  assert.equal(AMBIENT_TRAFFIC_POLICY.taxis, 24);
  assert.equal(AMBIENT_TRAFFIC_POLICY.civilians, 32);
  assert.ok(AMBIENT_TRAFFIC_POLICY.taxis >= FLEET_LIMITS.taxisMinimum);
  assert.ok(AMBIENT_TRAFFIC_POLICY.civilians >= FLEET_LIMITS.civiliansMinimum);
  assert.equal(FLEET_LIMITS.vehicles, 70);
  assert.equal(CIVIL_TRAFFIC_LIMITS.frameVehicles, 110);
  const world = createCompositionWorld(),
    ambient = createAmbientTraffic({
      map: world.map,
      graph: world.graph,
      context: { schemaVersion: 1, units: 'SI', sessionId: '262-contract', worldEpoch: 1 },
      seed: 262,
      focus: { x: world.spawn.x, z: world.spawn.z },
    });
  try {
    const report = ambient.report();
    assert.equal(report.version, AMBIENT_TRAFFIC_VERSION);
    assert.equal(report.counts.taxis, 24);
    assert.equal(report.counts.civilians, 32);
    assert.equal(report.routes.ready, 56);
    assert.equal(report.routes.fromPlanner, 56);
    assert.equal(report.byAuthority.AUTO, 56);
    assert.equal(report.routes.replans, 0);
  } finally {
    ambient.dispose();
  }
});

test('262 deterministic live fleet report matches the committed evidence', () => {
  const report = runLiveFleetReport(),
    saved = readFileSync(EVIDENCE, 'utf8');
  assert.equal(report.version, LIVE_FLEET_REPORT_VERSION);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.ok(report.summary.checks >= 20);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, saved);
  assert.equal(report.offCamera.outsideMoved, report.offCamera.outsideWindow);
  assert.equal(report.offCamera.allMoved, 56);
  assert.equal(report.profile.newTaxiVersion, 'v3-city-style-v2');
  assert.equal(report.spawn.overlappingPairs, 0);
  assert.ok(report.spawn.minimumDecorGapM > 0);
});
