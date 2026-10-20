import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CIVIL_TRAFFIC_LIMITS, CIVIL_TRAFFIC_VERSION, createCivilTraffic } from '../../src/fleet';
import type { CivilTraffic, CivilTrafficVehicleObservation } from '../../src/fleet';
import { parameterRegistry } from '../../src/profiles';
import { createLaneGraph, createRoutePlanner } from '../../src/world';
import type { RoutePlanner } from '../../src/world';
import {
  CIVIL_LIMIT,
  civilRegistry,
  civilStyle,
  createCivilWorld,
  laneSample,
} from './civil-traffic-fixture';
import { runCivilTrafficReport } from './civil-traffic-report';

const SOURCE = join(process.cwd(), 'src', 'fleet', 'civil-traffic.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '058-civil-traffic', 'report.json');
const STEP = 1 / 60;

function advance(
  traffic: CivilTraffic,
  count: number,
  startTick: number,
  vehicles: readonly CivilTrafficVehicleObservation[] = [],
) {
  let frame = traffic.list();
  for (let index = 0; index < count; index += 1)
    frame = traffic.step({ tick: startTick + index + 1, dtSeconds: STEP, vehicles }).actors;
  return frame;
}

function firstTaxiAhead(
  traffic: CivilTraffic,
  graph: ReturnType<typeof createLaneGraph>,
  gapM: number,
): CivilTrafficVehicleObservation {
  const actor = traffic.list()[0]!,
    sample = laneSample(
      graph,
      actor.laneId,
      Math.max(1, actor.routeLaneIndex === 0 ? actor.distanceAlongRouteM : 0) + gapM,
    );
  return {
    vehicleId: 'taxi-ahead-058',
    driverKind: 'TAXI',
    positionM: sample.positionM,
    headingRad: sample.headingRad,
    speedMps: 0,
    radiusM: CIVIL_TRAFFIC_LIMITS.vehicleRadiusM,
  };
}

test('058 spawns every 057 civilian with its own READY route and the common city style', () => {
  const world = createCivilWorld(),
    civilians = world.registry.list().filter((vehicle) => vehicle.driverKind === 'CIVILIAN'),
    actors = world.traffic.list();
  assert.equal(actors.length, CIVIL_LIMIT);
  assert.equal(actors.length, civilians.length);
  assert.deepEqual(
    actors.map((actor) => actor.vehicleId),
    civilians.map((vehicle) => vehicle.vehicleId),
  );
  assert.equal(new Set(actors.map((actor) => actor.vehicleId)).size, actors.length);
  for (const actor of actors) {
    assert.equal(actor.driverKind, 'CIVILIAN');
    assert.equal(actor.authority, 'AUTO');
    assert.equal(actor.route.source, '041-route-planner');
    assert.equal(actor.route.status, 'READY');
    assert.ok(actor.route.path.length > 0);
    assert.ok(actor.route.path.length <= CIVIL_TRAFFIC_LIMITS.routeLanes);
    assert.equal(actor.route.path[0], actor.route.originLaneId);
    assert.equal(actor.route.path[actor.route.path.length - 1], actor.route.destinationLaneId);
    assert.equal(actor.styleProfileId, 'city-profile');
    assert.equal(actor.styleVersionId, 'city-style-v1');
    assert.equal(actor.route.costVersion, 'route-cost-v1');
    assert.equal(actor.route.graphVersion, '033-lane-graph-v1');
    const projection = world.graph.projectOnLane(actor.laneId, {
      positionM: actor.positionM,
      access: 'CIVIL',
    });
    assert.ok(projection !== null);
    assert.ok(projection.distanceM < 0.001);
  }
  assert.equal(world.traffic.report().routesFromPlanner, CIVIL_LIMIT);
  world.traffic.dispose();
  world.registry.dispose();
});

test('058 routes are exactly the real PBI041 plans over CIVIL directed edges', () => {
  const registry = civilRegistry(),
    map = createCivilWorld({ registry, createTraffic: false }).map,
    graph = createLaneGraph(map),
    planner = createRoutePlanner({
      graph,
      map,
      graphVersion: '033-lane-graph-v1',
      costVersion: 'route-cost-v1',
    });
  let calls = 0;
  const spy: RoutePlanner = {
    ...planner,
    findRoute(query) {
      calls += 1;
      return planner.findRoute(query);
    },
  };
  const traffic = createCivilTraffic({ registry, map, graph, planner: spy, style: civilStyle() });
  assert.equal(calls, CIVIL_LIMIT);
  for (const actor of traffic.list()) {
    assert.equal(actor.route.source, '041-route-planner');
    const plan = planner.findRoute({
      origin: actor.route.originLaneId!,
      destination: actor.route.destinationLaneId!,
      access: 'CIVIL',
    });
    assert.equal(plan.status, 'READY');
    assert.deepEqual(plan.path, actor.route.path);
    assert.equal(plan.costSeconds, actor.route.costSeconds);
    for (let index = 1; index < actor.route.path.length; index += 1)
      assert.equal(
        graph.canTraverse(actor.route.path[index - 1]!, actor.route.path[index]!, 'CIVIL'),
        true,
      );
    for (const laneId of actor.route.path) assert.ok(graph.getLane(laneId, 'CIVIL') !== null);
  }
  traffic.dispose();
  registry.dispose();
});

test('058 creation is deterministic for the same seed and registry population', () => {
  const left = createCivilWorld(),
    right = createCivilWorld();
  assert.deepEqual(left.traffic.list(), right.traffic.list());
  assert.deepEqual(left.traffic.report(), right.traffic.report());
  const leftAfter = advance(left.traffic, 20, 0);
  const rightAfter = advance(right.traffic, 20, 0);
  assert.deepEqual(leftAfter, rightAfter);
  left.traffic.dispose();
  right.traffic.dispose();
  left.registry.dispose();
  right.registry.dispose();
});

test('058 every civilian consumes the common city style, never a per-player profile', () => {
  let active = civilStyle({ speed_delta_urban: 0 }, 'city-style-v1');
  const player = civilStyle({ speed_delta_urban: 9 }, 'player-style-v9');
  const world = createCivilWorld({
    styleSource: { activeStyle: () => active },
  });
  for (const actor of world.traffic.list()) {
    assert.equal(actor.styleProfileId, 'city-profile');
    assert.equal(actor.styleVersionId, 'city-style-v1');
    assert.notEqual(actor.styleVersionId, player.versionId);
  }
  const actorId = world.traffic.list()[0]!.vehicleId,
    routeBefore = world.traffic.get(actorId)!.route.path;
  advance(world.traffic, 5, 0);
  world.traffic.setAuthority(actorId, 'MANUAL', 5);
  active = civilStyle({ speed_delta_urban: 3 }, 'city-style-v2');
  assert.equal(world.traffic.get(actorId)!.styleVersionId, 'city-style-v1');
  const resumed = world.traffic.resume(actorId, 5);
  assert.deepEqual(resumed.route.path, routeBefore);
  assert.equal(resumed.styleProfileId, 'city-profile');
  assert.equal(resumed.styleVersionId, 'city-style-v2');
  assert.notEqual(resumed.styleVersionId, player.versionId);
  assert.equal(world.registry.state(actorId)!.appliedProfileVersion, 'city-style-v2');
  assert.equal(world.registry.state(actorId)!.controlMode, 'AUTO');
  world.traffic.dispose();
  world.registry.dispose();
});

test('058 releasing one civilian keeps its route and never mutates another civilian state', () => {
  const world = createCivilWorld(),
    actors = world.traffic.list(),
    first = actors[0]!,
    second = actors[1]!;
  advance(world.traffic, 180, 0);
  const firstBefore = world.traffic.get(first.vehicleId)!,
    secondBefore = world.traffic.get(second.vehicleId)!;
  assert.notEqual(firstBefore.positionM, secondBefore.positionM);
  assert.notEqual(firstBefore.route, secondBefore.route);
  world.traffic.setAuthority(first.vehicleId, 'MANUAL', 180);
  const released = world.traffic.get(first.vehicleId)!;
  const after = advance(world.traffic, 10, 180);
  const firstAfter = world.traffic.get(first.vehicleId)!,
    secondAfter = world.traffic.get(second.vehicleId)!;
  assert.deepEqual(firstAfter.route.path, released.route.path);
  assert.deepEqual(firstAfter.positionM, released.positionM);
  assert.equal(firstAfter.speedMps, 0);
  assert.ok(
    secondAfter.distanceAlongRouteM > secondBefore.distanceAlongRouteM ||
      after.some((actor) => actor.vehicleId !== first.vehicleId && actor.authority === 'AUTO'),
  );
  const resumed = world.traffic.resume(first.vehicleId, 190);
  assert.deepEqual(resumed.route.path, released.route.path);
  assert.equal(resumed.authority, 'AUTO');
  world.traffic.dispose();
  world.registry.dispose();
});

test('058 civilians stay on their directed route lanes while moving', () => {
  const world = createCivilWorld();
  for (let index = 0; index < 240; index += 1) {
    const frame = world.traffic.step({ tick: index + 1, dtSeconds: STEP });
    for (const actor of frame.actors) {
      assert.equal(actor.blocked, false);
      assert.equal(actor.laneId, actor.route.path[actor.routeLaneIndex]);
      const projection = world.graph.projectOnLane(actor.laneId, {
        positionM: actor.positionM,
        access: 'CIVIL',
      });
      assert.ok(projection !== null);
      assert.ok(projection.distanceM < 0.001);
      assert.ok(actor.speedMps >= 0 && actor.speedMps <= 30);
    }
  }
  world.traffic.dispose();
  world.registry.dispose();
});

test('058 a taxi ahead is a semantic 044 leader and a physical non-overlap constraint', () => {
  const moving = createCivilWorld({
      style: civilStyle({ desired_acceleration: 6, acceleration_jerk: 15 }),
    }),
    control = createCivilWorld({
      style: civilStyle({ desired_acceleration: 6, acceleration_jerk: 15 }),
    });
  advance(moving.traffic, 120, 0);
  advance(control.traffic, 120, 0);
  const taxi = firstTaxiAhead(moving.traffic, moving.graph, 12);
  let sawTaxiLeader = false,
    minimumGap = Infinity;
  for (let index = 0; index < 180; index += 1) {
    const frame = moving.traffic.step({ tick: 121 + index, dtSeconds: STEP, vehicles: [taxi] }),
      actor = frame.actors[0]!;
    if (actor.leader !== null) {
      sawTaxiLeader = true;
      assert.equal(actor.leader.leaderKind, 'TAXI');
      minimumGap = Math.min(minimumGap, actor.leader.gapM);
    }
    assert.ok(actor.speedMps >= 0);
  }
  const followed = moving.traffic.list()[0]!,
    uncontrolled = control.traffic.list()[0]!;
  assert.equal(sawTaxiLeader, true);
  assert.ok(minimumGap >= CIVIL_TRAFFIC_LIMITS.minimumGapM);
  assert.ok(followed.speedMps < uncontrolled.speedMps);
  assert.ok(moving.traffic.report().interactions > 0);
  moving.traffic.dispose();
  control.traffic.dispose();
  moving.registry.dispose();
  control.registry.dispose();
});

test('058 bounded tick, frame and actor capacities fail closed', () => {
  const world = createCivilWorld();
  assert.throws(
    () =>
      world.traffic.step({ tick: 1, dtSeconds: CIVIL_TRAFFIC_LIMITS.maximumStepSeconds + 0.01 }),
    /60 Hz|Exceeds|range|contract/i,
  );
  assert.throws(() => world.traffic.step({ tick: 1, dtSeconds: 0 }), /range|contract/i);
  world.traffic.step({ tick: 1, dtSeconds: STEP });
  assert.throws(() => world.traffic.step({ tick: 1, dtSeconds: STEP }), /consecutive/i);
  const tooMany = Array.from({ length: CIVIL_TRAFFIC_LIMITS.frameVehicles + 1 }, (_, index) => ({
    vehicleId: `taxi-${index}`,
    driverKind: 'TAXI' as const,
    positionM: { x: 0, y: 0, z: 0 },
    headingRad: 0,
    speedMps: 0,
  }));
  assert.throws(
    () => world.traffic.step({ tick: 2, dtSeconds: STEP, vehicles: tooMany }),
    /capacity/i,
  );
  assert.equal(world.traffic.list().length, CIVIL_LIMIT);
  world.traffic.dispose();
  world.registry.dispose();
});

test('058 has no camera, renderer or DOM dependency and exposes only simulation fields', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(source, /@babylonjs|from 'three'|document\.|window\.|renderer|camera/i);
  const world = createCivilWorld(),
    actor = world.traffic.list()[0]!;
  for (const key of ['camera', 'selection', 'selected', 'renderer', 'visible', 'mesh', 'screen'])
    assert.equal(Object.hasOwn(actor, key), false);
  assert.equal(Object.hasOwn(actor.route, 'cached'), false);
  world.traffic.dispose();
  world.registry.dispose();
});

test('058 disposal is idempotent, releases all owned state and rejects later mutation', () => {
  const world = createCivilWorld();
  advance(world.traffic, 10, 0);
  const stats = world.traffic.getStats();
  assert.equal(stats.actors, CIVIL_LIMIT);
  assert.equal(stats.longitudinalActors, CIVIL_LIMIT);
  assert.ok(stats.routeSearches >= CIVIL_LIMIT);
  world.traffic.dispose();
  world.traffic.dispose();
  const disposed = world.traffic.getStats();
  assert.deepEqual(disposed, {
    actors: 0,
    routeSearches: 0,
    interactions: 0,
    ticks: 0,
    styleVersionId: '',
    roadContextVehicles: 0,
    longitudinalActors: 0,
    retainedHistory: 0,
    disposed: true,
  });
  assert.throws(() => world.traffic.step({ tick: 11, dtSeconds: STEP }), /disposed/i);
  assert.throws(() => world.traffic.setAuthority(actorId(world), 'MANUAL'), /disposed/i);
  assert.equal(world.traffic.report().vehicles, 0);
  world.registry.dispose();
});

test('058 style keys are real 092 parameters and the traffic report matches the committed evidence', () => {
  for (const key of [
    'speed_delta_urban',
    'speed_delta_residential',
    'curve_lateral_accel',
    'intersection_approach_speed',
    'desired_acceleration',
    'comfort_deceleration',
    'acceleration_jerk',
    'brake_reaction_delay',
    'following_time_headway',
    'following_min_gap',
    'queue_standstill_gap',
    'following_speed_gain',
  ])
    assert.ok(Object.hasOwn(parameterRegistry, key));
  const report = runCivilTrafficReport(),
    saved = readFileSync(EVIDENCE, 'utf8');
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, saved);
  assert.equal(report.summary.pass, true);
  assert.equal(report.version, CIVIL_TRAFFIC_VERSION);
});

function actorId(world: ReturnType<typeof createCivilWorld>): string {
  return world.traffic.list()[0]?.vehicleId ?? 'missing';
}
