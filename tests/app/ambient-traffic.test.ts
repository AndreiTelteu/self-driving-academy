import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  AMBIENT_TRAFFIC_POLICY,
  createAmbientTraffic,
  createCityStyleProfile,
  createCompositionWorld,
  createV3Composition,
  vehicleBodiesOverlap,
  type AmbientTraffic,
} from '../../src/app';
import { FLEET_LIMITS } from '../../src/fleet';
import { CIVIL_TRAFFIC_LIMITS } from '../../src/fleet';
import type { DrivingProfile } from '../../src/profiles';
import { VEHICLE_COLLISION_HALF_EXTENTS_M, createCityDecorPlan } from '../../src/rendering';
import { createDefaultSettings } from '../../src/settings';
import type { CompositionFrame } from '../../src/app';
import { laneSample } from '../fleet/civil-traffic-fixture';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '262-live-fleet',
  worldEpoch: 1,
});
const STEP = 1 / 60;
const SOURCE = join(process.cwd(), 'src', 'app', 'ambient-traffic.ts');

function fixture(
  seed = 262,
  counts: Readonly<{ taxis?: number; civilians?: number }> = {},
  styleSource?: { activeStyle(): DrivingProfile },
): {
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
    ...counts,
    ...(styleSource === undefined ? {} : { styleSource }),
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
    control: createDefaultSettings('262-test').input.control,
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

function compositionYaw(headingRad: number): number {
  const angle = Math.PI / 2 - headingRad;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Exact distance from a decor clearance centre to the rotated vehicle rectangle. */
function rectanglePointGap(
  actor: Readonly<{ positionM: Readonly<{ x: number; z: number }>; headingRad: number }>,
  point: Readonly<{ x: number; z: number }>,
): number {
  const yaw = compositionYaw(actor.headingRad),
    rightX = Math.cos(yaw),
    rightZ = -Math.sin(yaw),
    forwardX = Math.sin(yaw),
    forwardZ = Math.cos(yaw),
    dx = point.x - actor.positionM.x,
    dz = point.z - actor.positionM.z,
    localX = dx * rightX + dz * rightZ,
    localZ = dx * forwardX + dz * forwardZ,
    excessX = Math.max(0, Math.abs(localX) - VEHICLE_COLLISION_HALF_EXTENTS_M.x),
    excessZ = Math.max(0, Math.abs(localZ) - VEHICLE_COLLISION_HALF_EXTENTS_M.z);
  return Math.hypot(excessX, excessZ);
}

test('262: compunerea publică 24 de taxiuri și 32 de civili, cu ID-uri, clase și rute reale', () => {
  const { world, ambient, composition } = fixture();
  try {
    const actors = ambient.list();
    assert.equal(actors.length, AMBIENT_TRAFFIC_POLICY.taxis + AMBIENT_TRAFFIC_POLICY.civilians);
    assert.equal(actors.length, 56);
    const taxis = actors.filter((actor) => actor.driverKind === 'TAXI');
    const civilians = actors.filter((actor) => actor.driverKind === 'CIVILIAN');
    assert.equal(taxis.length, AMBIENT_TRAFFIC_POLICY.taxis);
    assert.equal(civilians.length, AMBIENT_TRAFFIC_POLICY.civilians);
    assert.ok(taxis.length >= FLEET_LIMITS.taxisMinimum);
    assert.ok(civilians.length >= FLEET_LIMITS.civiliansMinimum);
    assert.equal(new Set(actors.map((actor) => actor.vehicleId)).size, actors.length);
    assert.equal(new Set(actors.map((actor) => actor.laneId)).size, actors.length);
    for (const actor of actors) {
      const vehicle = ambient.registry.get(actor.vehicleId);
      assert.ok(vehicle, `missing registry vehicle ${actor.vehicleId}`);
      assert.equal(vehicle.driverKind, actor.driverKind);
      assert.equal(vehicle.classId, actor.classId);
      assert.ok(vehicle.classId === 'sedan' || vehicle.classId === 'compact');
      assert.equal(actor.authority, 'AUTO');
      assert.equal(actor.route.source, '041-route-planner');
      assert.equal(actor.route.status, 'READY');
      assert.equal(actor.route.access, actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL');
      assert.ok(actor.route.path.length > 0);
      assert.equal(actor.route.path[0], actor.route.originLaneId);
      assert.equal(actor.route.path.at(-1), actor.route.destinationLaneId);
      assert.equal(actor.styleProfileId, ambient.style.profileId);
      assert.equal(actor.styleVersionId, ambient.style.versionId);
      assert.ok(Number.isFinite(actor.positionM.x));
      assert.ok(Number.isFinite(actor.positionM.z));
    }
    const report = ambient.report();
    assert.equal(report.counts.vehicles, 56);
    assert.equal(report.counts.taxis, 24);
    assert.equal(report.counts.civilians, 32);
    assert.deepEqual(report.routes.byKind, { TAXI: 24, CIVILIAN: 32 });
    assert.equal(report.routes.ready, 56);
    assert.equal(report.routes.fromPlanner, 56);
    assert.equal(report.routes.blocked, 0);
    assert.deepEqual(report.byAuthority, { AUTO: 56, MANUAL: 0, LEARNING: 0 });
    assert.equal(report.population.byDriverKind.TAXI, 24);
    assert.equal(report.population.byDriverKind.CIVILIAN, 32);

    const nearest = Math.min(
      ...actors.map((actor) =>
        Math.hypot(actor.positionM.x - world.spawn.x, actor.positionM.z - world.spawn.z),
      ),
    );
    assert.ok(nearest <= AMBIENT_TRAFFIC_POLICY.nearSpawnRadiusM, `nearest ${nearest}`);
    assert.ok(nearest >= AMBIENT_TRAFFIC_POLICY.spawnClearanceM, `nearest ${nearest}`);
    const near = actors.filter(
      (actor) =>
        Math.hypot(actor.positionM.x - world.spawn.x, actor.positionM.z - world.spawn.z) <=
        AMBIENT_TRAFFIC_POLICY.nearSpawnRadiusM,
    );
    assert.ok(near.some((actor) => actor.driverKind === 'TAXI'));
    assert.ok(near.some((actor) => actor.driverKind === 'CIVILIAN'));
    assert.ok(near.some((actor) => actor.laneId === 'lane:00N0'));
    assert.ok(near.some((actor) => actor.laneId === 'lane:00E0'));

    const frame = composition.step({ tick: 1 });
    assert.equal(aiVehicles(frame).length, 56);
    assert.equal(frame.vehicles.length, 58);
    assert.equal(aiVehicles(frame).filter((vehicle) => vehicle.driverKind === 'TAXI').length, 24);
    assert.equal(
      aiVehicles(frame).filter((vehicle) => vehicle.driverKind === 'CIVILIAN').length,
      32,
    );
  } finally {
    composition.dispose();
    ambient.dispose();
  }
});

test('262: taxiurile și civilii rămân simulați în afara camerei și pe tick-uri consecutive', () => {
  const { world, ambient, composition } = fixture();
  try {
    let frame = composition.step({ tick: 1 });
    const initial = new Map(ambient.list().map((actor) => [actor.vehicleId, actor]));
    const initialComposition = new Map(
      aiVehicles(frame).map((vehicle) => [vehicle.vehicleId, vehicle]),
    );
    assert.equal(initial.size, 56);
    for (let tick = 2; tick <= 600; tick += 1) frame = composition.step({ tick });
    const current = new Map(ambient.list().map((actor) => [actor.vehicleId, actor]));
    assert.equal(current.size, initial.size);
    assert.equal(aiVehicles(frame).length, 56);
    let outside = 0,
      outsideMoved = 0,
      moved = 0,
      minimumOutsideMoveM = Number.POSITIVE_INFINITY;
    for (const [id, start] of initial) {
      const end = current.get(id)!,
        moveM = Math.hypot(
          end.positionM.x - start.positionM.x,
          end.positionM.z - start.positionM.z,
        );
      if (moveM > 1) moved += 1;
      const distanceM = Math.hypot(
        start.positionM.x - world.spawn.x,
        start.positionM.z - world.spawn.z,
      );
      if (distanceM > AMBIENT_TRAFFIC_POLICY.outsideWindowM) {
        outside += 1;
        if (moveM > 1) outsideMoved += 1;
        minimumOutsideMoveM = Math.min(minimumOutsideMoveM, moveM);
      }
      assert.equal(ambient.registry.state(id)!.tick, 600);
      assert.equal(ambient.registry.state(id)!.controlMode, 'AUTO');
    }
    assert.equal(moved, 56, 'all 56 actors move');
    assert.ok(outside >= 40, `${outside}/56 actors start outside the 80 m window`);
    assert.equal(outsideMoved, outside, 'every off-camera actor moves');
    assert.ok(minimumOutsideMoveM > 1, `minimum off-camera move ${minimumOutsideMoveM} m`);

    const north = initialComposition.get('lane:00N0');
    if (north) {
      const end = current.get(north.vehicleId)!;
      assert.ok(end.positionM.z > north.positionM.z + 5);
      assert.ok(Math.abs(end.positionM.x - north.positionM.x) < 1);
      assert.ok(Math.abs(compositionYaw(end.headingRad)) < 0.2);
    }
  } finally {
    composition.dispose();
    ambient.dispose();
  }
});

test('262: profilul comun activ este citit de flota existentă și de un vehicul nou', () => {
  let active = createCityStyleProfile('v3-city-style', 'v3-city-style-v1');
  const source = { activeStyle: () => active };
  const { ambient } = fixture(262, {}, source);
  try {
    assert.equal(ambient.styleReference().versionId, 'v3-city-style-v1');
    for (const actor of ambient.list()) assert.equal(actor.styleVersionId, 'v3-city-style-v1');
    ambient.traffic.step({ tick: 1, dtSeconds: STEP });
    for (const actor of ambient.list()) {
      assert.equal(
        ambient.registry.state(actor.vehicleId)!.appliedProfileVersion,
        'v3-city-style-v1',
      );
      assert.equal(ambient.registry.state(actor.vehicleId)!.tick, 1);
    }
    active = createCityStyleProfile('v3-city-style', 'v3-city-style-v2');
    for (const actor of ambient.list()) assert.equal(actor.styleVersionId, 'v3-city-style-v1');
    const refreshed = ambient.refreshStyle();
    assert.equal(refreshed.profileId, 'v3-city-style');
    assert.equal(refreshed.versionId, 'v3-city-style-v2');
    for (const actor of ambient.list()) {
      assert.equal(actor.styleVersionId, 'v3-city-style-v2');
      const state = ambient.registry.state(actor.vehicleId)!;
      assert.equal(state.appliedProfileVersion, 'v3-city-style-v2');
      assert.equal(state.tick, 1);
      assert.equal(state.controlMode, 'AUTO');
    }
    const newTaxi = ambient.registry.addVehicle('TAXI', undefined, { tick: 2 });
    const newCivilian = ambient.registry.addVehicle('CIVILIAN', undefined, { tick: 2 });
    for (const vehicle of [newTaxi, newCivilian]) {
      assert.equal(vehicle.profileId, 'v3-city-style');
      assert.equal(
        ambient.registry.state(vehicle.vehicleId)!.appliedProfileVersion,
        'v3-city-style-v2',
      );
    }
  } finally {
    ambient.dispose();
  }
});

test('262: spawn-ul este determinist și nu suprapune jucătorul, vehiculele statice sau decorul', () => {
  const left = fixture(262),
    right = fixture(262);
  try {
    const actors = left.ambient.list(),
      repeated = right.ambient.list();
    assert.deepEqual(
      actors.map((actor) => [actor.vehicleId, actor.laneId, actor.positionM.x, actor.positionM.z]),
      repeated.map((actor) => [
        actor.vehicleId,
        actor.laneId,
        actor.positionM.x,
        actor.positionM.z,
      ]),
    );
    for (const actor of actors) {
      for (const vehicle of left.world.vehicles) {
        const distanceM = Math.hypot(
          actor.positionM.x - vehicle.positionM.x,
          actor.positionM.z - vehicle.positionM.z,
        );
        assert.ok(distanceM >= AMBIENT_TRAFFIC_POLICY.spawnClearanceM, `vehicle ${distanceM}`);
      }
      const playerDistanceM = Math.hypot(
        actor.positionM.x - left.world.spawn.x,
        actor.positionM.z - left.world.spawn.z,
      );
      assert.ok(playerDistanceM >= AMBIENT_TRAFFIC_POLICY.spawnClearanceM);
    }
    for (let i = 0; i < actors.length; i += 1)
      for (let j = i + 1; j < actors.length; j += 1) {
        const first = actors[i]!,
          second = actors[j]!;
        assert.equal(
          vehicleBodiesOverlap(
            {
              x: first.positionM.x,
              z: first.positionM.z,
              yawRad: compositionYaw(first.headingRad),
            },
            {
              halfX: VEHICLE_COLLISION_HALF_EXTENTS_M.x,
              halfZ: VEHICLE_COLLISION_HALF_EXTENTS_M.z,
            },
            {
              x: second.positionM.x,
              z: second.positionM.z,
              yawRad: compositionYaw(second.headingRad),
            },
            {
              halfX: VEHICLE_COLLISION_HALF_EXTENTS_M.x,
              halfZ: VEHICLE_COLLISION_HALF_EXTENTS_M.z,
            },
          ),
          false,
          `${first.vehicleId} overlaps ${second.vehicleId}`,
        );
      }
    const decor = createCityDecorPlan(left.world.layout).items;
    let minimumGapM = Number.POSITIVE_INFINITY;
    for (const actor of actors)
      for (const item of decor)
        minimumGapM = Math.min(minimumGapM, rectanglePointGap(actor, item) - item.radiusM);
    assert.ok(minimumGapM > 0, `decor gap ${minimumGapM}`);
  } finally {
    left.composition.dispose();
    left.ambient.dispose();
    right.composition.dispose();
    right.ambient.dispose();
  }
});

test('262: un taxi extern rămâne lider fizic între deciziile 044 de 10 Hz', () => {
  const { world, ambient } = fixture();
  try {
    ambient.traffic.step({ tick: 1, dtSeconds: STEP });
    const actorId = ambient.list().find((actor) => actor.driverKind === 'CIVILIAN')!.vehicleId;
    let sawTaxiLeader = false,
      minimumGapM = Number.POSITIVE_INFINITY;
    for (let tick = 2; tick <= 90; tick += 1) {
      const actor = ambient.get(actorId)!,
        projection = world.graph.projectOnLane(actor.laneId, {
          positionM: actor.positionM,
          access: actor.route.access,
        });
      assert.ok(projection !== null);
      const local = projection.longitudinalM;
      const ahead = laneSample(world.graph, actor.laneId, local + 12);
      const frame = ambient.traffic.step({
        tick,
        dtSeconds: STEP,
        vehicles: [
          {
            vehicleId: 'external-play-taxi',
            driverKind: 'TAXI',
            positionM: ahead.positionM,
            headingRad: ahead.headingRad,
            speedMps: 0,
          },
        ],
      });
      const followed = frame.actors.find((candidate) => candidate.vehicleId === actorId)!;
      if (followed.leader !== null) {
        assert.equal(followed.leader.leaderKind, 'TAXI');
        sawTaxiLeader = true;
        minimumGapM = Math.min(minimumGapM, followed.leader.gapM);
      }
    }
    assert.equal(sawTaxiLeader, true);
    assert.ok(minimumGapM >= CIVIL_TRAFFIC_LIMITS.minimumGapM);
  } finally {
    ambient.dispose();
  }
});

test('262: o mașină AI, taxi sau civil, nu poate fi preluată de jucător', () => {
  const { composition } = fixture();
  try {
    const frame = composition.step({ tick: 1 });
    const taxi = aiVehicles(frame).find((vehicle) => vehicle.driverKind === 'TAXI');
    const civilian = aiVehicles(frame).find((vehicle) => vehicle.driverKind === 'CIVILIAN');
    assert.ok(taxi);
    assert.ok(civilian);
    composition.requestEntry(taxi.vehicleId);
    const taxiRefused = composition.step({ tick: 2 });
    assert.equal(taxiRefused.authority.consumer, 'CHARACTER');
    assert.match(taxiRefused.events.at(-1)?.detail ?? '', /AI_TRAFFIC/);
    composition.requestEntry(civilian.vehicleId);
    const civilianRefused = composition.step({ tick: 3 });
    assert.equal(civilianRefused.authority.consumer, 'CHARACTER');
    assert.match(civilianRefused.events.at(-1)?.detail ?? '', /AI_TRAFFIC/);
  } finally {
    composition.dispose();
  }
});

test('262: dispose readuce ownership-ul la zero, fără listeners sau corpuri orfane', () => {
  const { world, ambient, composition } = fixture();
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(source, /@babylonjs|from 'three'|document\.|window\.|addEventListener/i);
  composition.dispose();
  ambient.dispose();
  ambient.dispose();
  assert.deepEqual(ambient.traffic.getStats(), {
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
  assert.deepEqual(ambient.registry.counts(), { vehicles: 0, taxis: 0, civilians: 0 });
  assert.equal(ambient.report().counts.vehicles, 0);
  assert.throws(() => ambient.traffic.step({ tick: 1, dtSeconds: STEP }), /disposed/i);
  assert.ok(world.vehicles.length >= 2);
});

test('262: fixture-ul 20/24/30 taxiuri și 20–40 civili este respectat', () => {
  for (const [taxis, civilians] of [
    [20, 20],
    [24, 32],
    [30, 40],
  ] as const) {
    const world = createCompositionWorld();
    const ambient = createAmbientTraffic({
      map: world.map,
      graph: world.graph,
      context: { ...CONTEXT, sessionId: `262-fixture-${taxis}-${civilians}` },
      seed: 262,
      taxiCount: taxis,
      civilianCount: civilians,
      focus: { x: world.spawn.x, z: world.spawn.z },
      avoid: [
        { x: world.spawn.x, z: world.spawn.z },
        ...world.vehicles.map((vehicle) => ({
          x: vehicle.positionM.x,
          z: vehicle.positionM.z,
        })),
      ],
    });
    try {
      const report = ambient.report();
      assert.equal(report.counts.taxis, taxis);
      assert.equal(report.counts.civilians, civilians);
      assert.equal(report.counts.vehicles, taxis + civilians);
      assert.equal(report.routes.ready, taxis + civilians);
      assert.equal(report.routes.fromPlanner, taxis + civilians);
    } finally {
      ambient.dispose();
    }
  }
});

test('269: a company taxi added after creation enters the same live composition frame', () => {
  const { ambient, composition } = fixture();
  try {
    const initial = composition.step({ tick: 1 }),
      before = initial.vehicles.length;
    const vehicle = ambient.registry.addVehicle('TAXI', 'compact', { tick: 1 });
    const actor = ambient.addVehicle(vehicle.vehicleId);
    assert.equal(actor.vehicleId, vehicle.vehicleId);
    const frame = composition.step({ tick: 2 });
    const found = frame.vehicles.find((entry) => entry.vehicleId === vehicle.vehicleId);
    assert.ok(found !== undefined);
    assert.equal(found!.driverKind, 'TAXI');
    assert.equal(found!.slot, 25);
    assert.equal(found!.classId, 'compact');
    assert.equal(frame.vehicles.length, before + 1);
  } finally {
    composition.dispose();
    ambient.dispose();
  }
});
