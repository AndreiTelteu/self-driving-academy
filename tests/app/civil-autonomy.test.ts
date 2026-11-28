import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAmbientTraffic,
  createCompositionWorld,
  createV3Composition,
  createCityStyleProfile,
  type AmbientTraffic,
  type CompositionWorld,
  type V3Composition,
} from '../../src/app';
import type { CivilActorSnapshot } from '../../src/fleet';
import { createDefaultSettings } from '../../src/settings';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '284-civil-autonomy',
  worldEpoch: 1,
});

const CLEARANCE_M = 6;

function compositionYaw(headingRad: number): number {
  const angle = Math.PI / 2 - headingRad;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function worldFixture(styleSource?: { activeStyle(): ReturnType<typeof createCityStyleProfile> }) {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed: 284,
    liveRules: true,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
    ...(styleSource === undefined ? {} : { styleSource }),
  });
  return { world, ambient };
}

/** A character start 1.15 m beside a real civil actor, on the door side. */
function startBeside(
  world: CompositionWorld,
  ambient: AmbientTraffic,
  actor: CivilActorSnapshot,
): Readonly<{ x: number; z: number; yawRad: number }> | null {
  const yawRad = compositionYaw(actor.headingRad),
    rightX = Math.cos(yawRad),
    rightZ = -Math.sin(yawRad);
  for (const side of [1, -1] as const)
    for (const offset of [1.15, 1.05] as const) {
      const x = actor.positionM.x + rightX * offset * side,
        z = actor.positionM.z + rightZ * offset * side;
      if (Math.hypot(x - world.spawn.x, z - world.spawn.z) < 0.5) continue;
      if (world.walkWorld.blockingAt(x, z).length > 0) continue;
      const clear = ambient
        .list()
        .filter((candidate) => candidate.vehicleId !== actor.vehicleId)
        .every((candidate) => Math.hypot(x - candidate.positionM.x, z - candidate.positionM.z) > 3);
      if (!clear) continue;
      if (
        world.vehicles.some(
          (vehicle) => Math.hypot(x - vehicle.positionM.x, z - vehicle.positionM.z) <= 2.5,
        )
      )
        continue;
      return Object.freeze({ x, z, yawRad });
    }
  return null;
}

interface NearCivilFixture {
  readonly world: CompositionWorld;
  readonly ambient: AmbientTraffic;
  readonly composition: V3Composition;
  readonly targetId: string;
  tick: number;
}

function fixtureBesideCivil(): NearCivilFixture {
  const { world, ambient } = worldFixture();
  try {
    for (const actor of ambient.list().filter((candidate) => candidate.driverKind === 'CIVILIAN')) {
      const start = startBeside(world, ambient, actor);
      if (start === null) continue;
      let composition: V3Composition;
      try {
        composition = createV3Composition({
          layout: world.layout,
          start,
          control: createDefaultSettings('284-test').input.control,
          context: CONTEXT,
          vehicles: world.vehicles,
          traffic: ambient.traffic,
          map: world.map,
          graph: world.graph,
        });
      } catch {
        continue;
      }
      return { world, ambient, composition, targetId: actor.vehicleId, tick: 0 };
    }
    throw new Error('No civil actor had a reachable door-side start.');
  } catch (error) {
    ambient.dispose();
    throw error;
  }
}

function close(fixture: NearCivilFixture): void {
  fixture.composition.dispose();
  fixture.ambient.dispose();
}

function play(fixture: NearCivilFixture, ticks: number): ReturnType<V3Composition['step']> {
  let frame: ReturnType<V3Composition['step']> | null = null;
  for (let index = 0; index < ticks; index += 1) {
    fixture.tick += 1;
    frame = fixture.composition.step({ tick: fixture.tick });
  }
  if (frame === null) throw new Error('play requires at least one tick');
  return frame;
}

test('284: G enters a civil AI, suspends its route, and exit resumes AUTO without teleport', () => {
  const fixture = fixtureBesideCivil();
  try {
    let frame = play(fixture, 1);
    const before = fixture.ambient.get(fixture.targetId)!;
    const routeBefore = JSON.stringify(before.route.path);
    const destinationBefore = before.route.destinationLaneId;
    const positionBefore = { ...before.positionM };
    fixture.composition.requestEntry(fixture.targetId);
    frame = play(fixture, 1);
    assert.equal(frame.playerVehicleId, fixture.targetId);
    assert.equal(frame.authority.consumer, 'VEHICLE');
    assert.equal(
      frame.authority.consumer === 'VEHICLE' ? frame.authority.vehicleId : null,
      fixture.targetId,
    );
    assert.equal(frame.events.at(-1)?.kind, 'ENTER_ACCEPTED');
    assert.equal(frame.vehicles.filter((entry) => entry.vehicleId === fixture.targetId).length, 1);
    assert.equal(frame.stats.entryAttempts, 1);
    assert.equal(frame.stats.takeovers, 0);
    const frozen = fixture.ambient.get(fixture.targetId)!;
    assert.equal(frozen.authority, 'MANUAL');
    assert.equal(fixture.ambient.registry.state(fixture.targetId)!.controlMode, 'MANUAL');
    assert.equal(JSON.stringify(frozen.route.path), routeBefore);
    const frozenDistance = frozen.distanceAlongRouteM;

    // The 058 route is suspended: the actor neither advances nor disappears behind the seat.
    frame = play(fixture, 60);
    const suspended = fixture.ambient.get(fixture.targetId)!;
    assert.equal(suspended.authority, 'MANUAL');
    assert.equal(suspended.distanceAlongRouteM, frozenDistance);
    assert.equal(JSON.stringify(suspended.route.path), routeBefore);
    assert.equal(frame.vehicles.filter((entry) => entry.vehicleId === fixture.targetId).length, 1);

    fixture.composition.port.setAction('throttle', true);
    frame = play(fixture, 90);
    fixture.composition.port.setAction('throttle', false);
    const driven = frame.vehicles.find((entry) => entry.vehicleId === fixture.targetId)!;
    const drivenActor = fixture.ambient.get(fixture.targetId)!;
    assert.ok(
      Math.hypot(driven.positionM.x - positionBefore.x, driven.positionM.z - positionBefore.z) > 1,
      'the player actually drove the taken-over civil',
    );
    assert.ok(
      drivenActor.distanceAlongRouteM > frozenDistance,
      'the driven pose is reconciled on the suspended route',
    );
    assert.equal(JSON.stringify(drivenActor.route.path), routeBefore);

    for (let index = 0; index < 180; index += 1) {
      fixture.composition.port.setAction('brake', true);
      frame = play(fixture, 1);
      const speedMps =
        frame.vehicles.find((entry) => entry.vehicleId === fixture.targetId)?.speedMps ?? 0;
      if (Math.abs(speedMps) <= 0.05) break;
    }
    fixture.composition.port.setAction('brake', false);
    const beforeExit = fixture.ambient.get(fixture.targetId)!;
    const exitPosition = { ...beforeExit.positionM };
    const exitDistance = beforeExit.distanceAlongRouteM;
    fixture.composition.requestExit();
    frame = play(fixture, 1);
    assert.equal(frame.playerVehicleId, null, JSON.stringify(frame.events.slice(-2)));
    assert.equal(frame.authority.consumer, 'CHARACTER');
    assert.equal(frame.events.at(-1)?.kind, 'EXIT_ACCEPTED');
    const resumed = fixture.ambient.get(fixture.targetId)!;
    assert.equal(resumed.authority, 'AUTO');
    assert.equal(fixture.ambient.registry.state(fixture.targetId)!.controlMode, 'AUTO');
    assert.equal(JSON.stringify(resumed.route.path), routeBefore);
    assert.equal(resumed.route.destinationLaneId, destinationBefore);
    assert.ok(
      Math.hypot(resumed.positionM.x - exitPosition.x, resumed.positionM.z - exitPosition.z) < 1,
      'exit does not teleport the car to the pre-takeover point',
    );
    assert.ok(Math.abs(resumed.distanceAlongRouteM - exitDistance) < 1);
    const resumedDistance = resumed.distanceAlongRouteM;

    frame = play(fixture, 120);
    const moving = fixture.ambient.get(fixture.targetId)!;
    assert.equal(moving.authority, 'AUTO');
    assert.ok(
      moving.distanceAlongRouteM > resumedDistance,
      'AUTO resumes the same route from the driven point',
    );
    assert.equal(moving.route.destinationLaneId, destinationBefore);
    assert.ok(
      frame.vehicles.filter((entry) => entry.vehicleId === fixture.targetId).length === 1,
      'no duplicate actor was created by takeover',
    );
  } finally {
    close(fixture);
  }
});

test('284: G without an id resolves the nearest live AI actor before the tick', () => {
  const fixture = fixtureBesideCivil();
  try {
    play(fixture, 1);
    fixture.composition.requestEntry();
    const frame = play(fixture, 1);
    assert.equal(frame.playerVehicleId, fixture.targetId);
    assert.equal(frame.authority.consumer, 'VEHICLE');
    assert.equal(frame.stats.entryAttempts, 1);
    assert.equal(frame.stats.takeovers, 0);
  } finally {
    close(fixture);
  }
});

test('284: the common city profile applies identically to taxis and civilians, including new cars', () => {
  let active = createCityStyleProfile('v3-city-style', 'v3-city-style-v1');
  const { world, ambient } = worldFixture({ activeStyle: () => active });
  try {
    ambient.traffic.step({ tick: 1, dtSeconds: 1 / 60 });
    assert.deepEqual(
      new Set(ambient.list().map((actor) => actor.driverKind)),
      new Set(['TAXI', 'CIVILIAN']),
    );
    for (const actor of ambient.list()) {
      assert.equal(actor.styleProfileId, 'v3-city-style');
      assert.equal(actor.styleVersionId, 'v3-city-style-v1');
      assert.equal(
        ambient.registry.state(actor.vehicleId)!.appliedProfileVersion,
        'v3-city-style-v1',
      );
    }
    active = createCityStyleProfile('v3-city-style', 'v3-city-style-v2');
    ambient.refreshStyle();
    for (const actor of ambient.list()) assert.equal(actor.styleVersionId, 'v3-city-style-v2');

    const avoid = [{ x: world.spawn.x, z: world.spawn.z, radiusM: 1 }];
    for (const kind of ['TAXI', 'CIVILIAN'] as const) {
      const vehicle = ambient.registry.addVehicle(kind, undefined, { tick: 2 });
      const added = ambient.addVehicle(vehicle.vehicleId, { avoid, clearanceM: CLEARANCE_M });
      assert.equal(added.driverKind, kind);
      assert.equal(added.styleVersionId, 'v3-city-style-v2');
      assert.equal(
        ambient.registry.state(vehicle.vehicleId)!.appliedProfileVersion,
        'v3-city-style-v2',
      );
    }
  } finally {
    ambient.dispose();
  }
});

test('284: a newly created vehicle keeps its unique id and does not spawn on the player', () => {
  const { world, ambient } = worldFixture();
  try {
    ambient.traffic.step({ tick: 1, dtSeconds: 1 / 60 });
    const before = ambient.list().length;
    const vehicle = ambient.registry.addVehicle('CIVILIAN', undefined, { tick: 2 });
    const actor = ambient.addVehicle(vehicle.vehicleId, {
      avoid: [
        { x: world.spawn.x, z: world.spawn.z, radiusM: 1 },
        ...ambient.list().map((entry) => ({
          x: entry.positionM.x,
          z: entry.positionM.z,
          radiusM: 2.5,
        })),
      ],
      clearanceM: CLEARANCE_M,
    });
    assert.equal(actor.vehicleId, vehicle.vehicleId);
    assert.equal(ambient.list().length, before + 1);
    assert.equal(ambient.list().filter((entry) => entry.vehicleId === vehicle.vehicleId).length, 1);
    assert.equal(
      new Set(ambient.registry.list().map((entry) => entry.vehicleId)).size,
      ambient.registry.list().length,
    );
    const playerClearanceM =
      Math.hypot(actor.positionM.x - world.spawn.x, actor.positionM.z - world.spawn.z) - 1;
    assert.ok(playerClearanceM >= CLEARANCE_M, `player clearance ${playerClearanceM} m`);

    // Re-adding the same id is idempotent, never a second actor.
    ambient.addVehicle(vehicle.vehicleId);
    assert.equal(ambient.list().length, before + 1);
    assert.equal(ambient.list().filter((entry) => entry.vehicleId === vehicle.vehicleId).length, 1);
  } finally {
    ambient.dispose();
  }
});
