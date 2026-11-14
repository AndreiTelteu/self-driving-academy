/**
 * PBI 192 — collision, sidewalk, steps, obstacle and vehicle contact.
 *
 * Every scenario runs on the real authored city unless the policy boundary (a ledge above the curb)
 * does not exist there; those fixtures are declared in `./walk-world`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { WALKER_GAIT_SPEEDS_MPS, WALKER_POLICY, createWalker } from '../../src/character';
import {
  SIDEWALK_ELEVATION_M,
  WALK_PENETRATION_TOLERANCE_M,
  characterCapsule,
  dropFixtureWorld,
  measurePenetration,
  obstacleFixtureWorld,
  realBuildingSpot,
  realCurbSpot,
  realWalkWorld,
  runTicks,
  stepFixtureWorld,
  walkVehicle,
} from './walk-world';

const capsule = characterCapsule();

test('mersul în zid oprește personajul fără penetrare', () => {
  const { world } = realWalkWorld();
  const spot = realBuildingSpot();
  const walker = createWalker({
    world,
    start: { positionM: spot.start, yawRad: 0 },
    entityId: 'walker-wall',
  });
  const run = runTicks(walker, 240, { headingRad: 0, gait: 'RUN', intensity: 1 });

  assert.equal(run.samples.length, 240);
  for (const sample of run.samples) {
    assert.ok(
      sample.maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M,
      `tick ${sample.tick} penetrates the building`,
    );
    assert.equal(sample.insideSolid, false);
    assert.equal(sample.positionM.y, SIDEWALK_ELEVATION_M);
  }
  // The face is a wall: the cylinder centre stops exactly one radius in front of it.
  const final = run.finalState.positionM;
  assert.ok(final.z < spot.faceZ, 'the character stays in front of the building face');
  assert.ok(
    Math.abs(spot.faceZ - final.z - capsule.radiusM) <= 1e-9,
    `expected a ${capsule.radiusM} m gap, measured ${spot.faceZ - final.z}`,
  );
  assert.ok(run.stats.blockedTicks > 0);
  assert.ok(run.stats.distanceM > 1.5, 'the character really walked before hitting the wall');
});

test('mersul pe trotuar rămâne pe trotuar', () => {
  const { world } = realWalkWorld();
  const spot = realCurbSpot();
  const walker = createWalker({
    world,
    start: { positionM: spot.inside, yawRad: spot.alongYawRad },
    entityId: 'walker-sidewalk',
  });
  const run = runTicks(walker, 120, {
    headingRad: spot.alongYawRad,
    gait: 'WALK',
    intensity: 1,
  });

  for (const sample of run.samples) {
    assert.equal(sample.positionM.y, SIDEWALK_ELEVATION_M, `tick ${sample.tick} left the slab`);
    const surface = world.surfaceElementAt(sample.positionM.x, sample.positionM.z);
    assert.ok(surface, `tick ${sample.tick} is off every slab`);
    assert.ok(
      surface.kind === 'SIDEWALK' || surface.kind === 'COURT',
      `tick ${sample.tick} ended on ${surface.kind} (${surface.id})`,
    );
    assert.ok(sample.maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M);
  }
  // The character really moved along the strip, it did not walk in place.
  const travelled = Math.hypot(
    run.finalState.positionM.x - spot.inside.x,
    run.finalState.positionM.z - spot.inside.z,
  );
  assert.ok(travelled > 2.5, `travelled ${travelled} m`);
  assert.equal(run.stats.blockedTicks, 0);
});

test('treapta reală de 0,14 m (bordură) este urcată', () => {
  const { world } = realWalkWorld();
  const spot = realCurbSpot();
  assert.equal(spot.curbRiseM, WALKER_POLICY.stepCeilingM);
  const walker = createWalker({
    world,
    start: { positionM: spot.outside, yawRad: spot.inwardYawRad },
    entityId: 'walker-curb',
  });
  const run = runTicks(walker, 120, {
    headingRad: spot.inwardYawRad,
    gait: 'WALK',
    intensity: 1,
  });

  const climbs = run.events.filter((event) => event.kind === 'STEP_UP');
  assert.equal(climbs.length, 1, 'exactly one step up is recorded');
  assert.equal(climbs[0]!.riseM, spot.curbRiseM);
  assert.equal(climbs[0]!.ceilingM, WALKER_POLICY.stepCeilingM);
  assert.equal(run.finalState.positionM.y, SIDEWALK_ELEVATION_M);
  assert.equal(run.finalState.clipId, 'walk');
  for (const sample of run.samples)
    assert.ok(sample.maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M);
  assert.equal(run.stats.stepRefusals, 0);
});

test('o treaptă peste plafon este refuzată, nu escaladată', () => {
  const riseM = WALKER_POLICY.stepCeilingM * 2 + 0.02;
  const world = stepFixtureWorld(riseM);
  const walker = createWalker({
    world,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
    entityId: 'walker-step-refused',
  });
  const run = runTicks(walker, 120, { headingRad: 0, gait: 'RUN', intensity: 1 });

  const refusals = run.events.filter((event) => event.kind === 'STEP_REFUSED_ASCENT');
  assert.equal(refusals.length, 1, 'the refusal is reported once');
  assert.equal(refusals[0]!.riseM, riseM);
  assert.equal(refusals[0]!.ceilingM, WALKER_POLICY.stepCeilingM);
  assert.equal(run.finalState.positionM.y, 0, 'the character never gains the refused height');
  assert.ok(run.finalState.positionM.z < 2, 'the ledge is never entered');
  assert.ok(
    Math.abs(2 - run.finalState.positionM.z - capsule.radiusM) <= 1e-9,
    `expected a ${capsule.radiusM} m gap to the ledge, measured ${2 - run.finalState.positionM.z}`,
  );
  for (const sample of run.samples)
    assert.ok(sample.maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M);
});

test('coborârea se tratează la fel: 0,14 m coborât, peste plafon refuzat', () => {
  const { world } = realWalkWorld();
  const spot = realCurbSpot();
  const downWalker = createWalker({
    world,
    start: { positionM: spot.inside, yawRad: spot.inwardYawRad + Math.PI },
    entityId: 'walker-curb-down',
  });
  const down = runTicks(downWalker, 120, {
    headingRad: spot.inwardYawRad + Math.PI,
    gait: 'WALK',
    intensity: 1,
  });
  const drops = down.events.filter((event) => event.kind === 'STEP_DOWN');
  assert.equal(drops.length, 1);
  assert.equal(drops[0]!.riseM, -spot.curbRiseM);
  assert.equal(down.finalState.positionM.y, 0, 'the character steps down to the street');

  const cliffWorld = dropFixtureWorld(WALKER_POLICY.stepCeilingM * 2);
  const cliffWalker = createWalker({
    world: cliffWorld,
    start: { positionM: { x: 0, y: 0.14, z: 0 }, yawRad: 0 },
    entityId: 'walker-drop-refused',
  });
  const cliff = runTicks(cliffWalker, 120, { headingRad: 0, gait: 'RUN', intensity: 1 });
  const refusals = cliff.events.filter((event) => event.kind === 'STEP_REFUSED_DESCENT');
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0]!.riseM, -WALKER_POLICY.stepCeilingM * 2);
  assert.equal(cliff.finalState.positionM.y, 0.14, 'the character does not fall off the ledge');
  assert.ok(cliff.finalState.positionM.z < 2);
  for (const sample of cliff.samples)
    assert.ok(sample.maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M);
});

test('obstacolul oprește mersul fără traversare', () => {
  const world = obstacleFixtureWorld();
  const walker = createWalker({
    world,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
    entityId: 'walker-obstacle',
  });
  const run = runTicks(walker, 180, { headingRad: 0, gait: 'RUN', intensity: 1 });

  const obstacle = world.blockers[0]!;
  let deepest = 0;
  for (const sample of run.samples) {
    deepest = Math.max(deepest, sample.maxPenetrationM);
    assert.equal(sample.insideSolid, false, `tick ${sample.tick} is inside the obstacle`);
  }
  assert.ok(deepest <= WALK_PENETRATION_TOLERANCE_M);
  assert.ok(run.stats.blockedTicks > 0, 'the obstacle really stopped the requested motion');
  const final = run.finalState.positionM;
  // Zero traversal: the character is still on the near side of the obstacle, touching its margin.
  assert.ok(final.z < 2.6, `the character crossed to z=${final.z}`);
  assert.ok(
    Math.abs(2.6 - final.z - (capsule.radiusM + obstacle.marginM)) <= 1e-9,
    `expected the obstacle margin to hold, measured ${2.6 - final.z}`,
  );
  assert.equal(run.finalState.clipId, 'idle', 'a blocked walker is idle, whatever was requested');
});

test('contactul cu mașina oprește la distanța fizică, fără intrare în collider', () => {
  const { world } = realWalkWorld();
  const vehicle = walkVehicle('sedan-192', { x: 90, y: 0, z: 1.8 }, Math.PI / 2);
  const walker = createWalker({
    world,
    start: { positionM: { x: 90, y: world.surfaceAt(90, -1), z: -1 }, yawRad: 0 },
    entityId: 'walker-vehicle',
  });
  const run = runTicks(walker, 180, { headingRad: 0, gait: 'RUN', intensity: 1 }, [
    vehicle.snapshot,
  ]);

  const expectedCentreDistance =
    capsule.radiusM + vehicle.footprint.halfExtentsM.x + WALKER_POLICY.vehicleContactMarginM;
  const flankZ = 1.8 - vehicle.footprint.halfExtentsM.x;
  const contacts = run.events.filter((event) => event.kind === 'VEHICLE_CONTACT');
  assert.equal(contacts.length, 1, 'one contact is reported for the approach');
  assert.equal(contacts[0]!.blockerId, 'sedan-192');
  assert.equal(contacts[0]!.clearanceM, WALKER_POLICY.vehicleContactMarginM);
  for (const sample of run.samples) {
    assert.ok(
      sample.maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M,
      `tick ${sample.tick} entered the vehicle collider`,
    );
    assert.ok(
      sample.minClearanceM >= WALKER_POLICY.vehicleContactMarginM - 1e-9,
      `tick ${sample.tick} kept only ${sample.minClearanceM} m`,
    );
  }
  const final = run.finalState.positionM;
  assert.ok(
    Math.abs(1.8 - final.z - expectedCentreDistance) <= 1e-9,
    `expected ${expectedCentreDistance} m from the vehicle centre line, measured ${1.8 - final.z}`,
  );
  assert.ok(
    Math.abs(flankZ - final.z - (capsule.radiusM + WALKER_POLICY.vehicleContactMarginM)) <= 1e-9,
    `expected ${capsule.radiusM + WALKER_POLICY.vehicleContactMarginM} m from the flank, measured ${flankZ - final.z}`,
  );
  assert.ok(final.z < flankZ, 'the character stays outside the collider');
  assert.equal(run.finalState.clipId, 'idle');
  assert.ok(run.stats.vehicleContacts >= 1);
  // The walking tick reads the vehicle; it never gains speed by standing against it.
  assert.equal(run.finalState.speedMps, 0);
});

test('viteza reală decide clipul, nu comanda de intrare', () => {
  const world = stepFixtureWorld(0);
  const blocked = createWalker({
    world,
    start: { positionM: { x: 0, y: 0, z: -1.9 }, yawRad: 0 },
    entityId: 'walker-clip-blocked',
  });
  runTicks(blocked, 60, { headingRad: 0, gait: 'RUN', intensity: 1 });
  const wall = stepFixtureWorld(0.6);
  const intoWall = createWalker({
    world: wall,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
    entityId: 'walker-clip-wall',
  });
  runTicks(intoWall, 60, { headingRad: 0, gait: 'RUN', intensity: 1 });
  assert.equal(intoWall.state.clipId, 'idle', 'a blocked run uses the idle clip');

  const open = stepFixtureWorld(0);
  const running = createWalker({
    world: open,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
    entityId: 'walker-clip-run',
  });
  runTicks(running, 60, { headingRad: 0, gait: 'RUN', intensity: 1 });
  assert.equal(running.state.clipId, 'run');
  assert.ok(running.state.speedMps > WALKER_GAIT_SPEEDS_MPS.WALK);

  const walking = createWalker({
    world: open,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
    entityId: 'walker-clip-walk',
  });
  runTicks(walking, 60, { headingRad: 0, gait: 'WALK', intensity: 1 });
  assert.equal(walking.state.clipId, 'walk');

  const standing = createWalker({
    world: open,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
    entityId: 'walker-clip-idle',
  });
  runTicks(standing, 60, { headingRad: 0.7, gait: 'NONE', intensity: 0 });
  assert.equal(standing.state.clipId, 'idle');
  assert.equal(standing.state.positionM.z, 0);
  assert.equal(standing.state.yawRad, 0, 'a gait without input does not spin the character');
});

test('startul în interiorul unui solid este refuzat explicit', () => {
  const { world } = realWalkWorld();
  const spot = realBuildingSpot();
  const insideBuilding = { x: spot.faceX, y: spot.start.y, z: spot.faceZ + 1 };
  assert.throws(
    () =>
      createWalker({
        world,
        start: { positionM: insideBuilding, yawRad: 0 },
        entityId: 'walker-inside',
      }),
    (error: unknown) =>
      (error as { code?: string }).code === 'WALK_START_BLOCKED' &&
      /inside/.test((error as Error).message),
  );
});

test('măsurătoarea de penetrare nu este tautologică', () => {
  const { world } = realWalkWorld();
  const spot = realBuildingSpot();
  // A point one metre inside the building must be measured as penetrating, not as clear.
  const inside = { x: spot.faceX, y: SIDEWALK_ELEVATION_M, z: spot.faceZ + 1 };
  const measured = measurePenetration(world, inside, capsule.radiusM, capsule.heightM);
  assert.ok(measured.maxPenetrationM > capsule.radiusM);
  assert.equal(measured.insideSolid, true);
  const outside = measurePenetration(world, spot.start, capsule.radiusM, capsule.heightM);
  assert.equal(outside.maxPenetrationM, 0);
});
