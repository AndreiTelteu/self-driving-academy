/**
 * PBI 192 — structural proofs for the two acceptance criteria and for the single authority.
 *
 * (a) The walking module creates zero vehicle bodies.
 * (b) A vehicle moved by its owner is not touched by walking ticks.
 * (c) Registering a vehicle body from the walking module is refused explicitly.
 *
 * Plus: the walker is the only writer of the character position, the render frame is bit-identical
 * to it, and the animation writer keeps refusing to move the entity.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WALKER_POLICY,
  applyCharacterPose,
  characterPositionBits,
  createCharacterAsset,
  createCharacterAuthority,
  createCharacterPoseWriter,
  createWalker,
  sampleCharacterPose,
  type WalkerVehicleSnapshot,
} from '../../src/character';
import { characterCapsule, realWalkWorld, runTicks, walkVehicle } from './walk-world';

const world = realWalkWorld().world;
const capsule = characterCapsule();
const start = { x: 90, y: world.surfaceAt(90, -1), z: -1 };
const skeleton = createCharacterAsset().skeleton;

function errorCode(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? null;
  }
}

function sedanAt(z: number): WalkerVehicleSnapshot {
  return walkVehicle('sedan-192', { x: 90, y: 0, z }, Math.PI / 2).snapshot;
}

/** Real sedan collider half width, read from the delivered PBI 022/145 contract. */
function vehicleHalfWidth(): number {
  return walkVehicle('probe', { x: 0, y: 0, z: 0 }, 0).footprint.halfExtentsM.x;
}

test('criteriul 2a: walker-ul creează 0 corpuri auto', () => {
  const walker = createWalker({ world, start: { positionM: start, yawRad: 0 } });
  assert.equal(walker.stats.vehicleBodiesCreated, 0);
  assert.equal(walker.registration.vehicleBodiesCreated, 0);
  // The walk world derived from the real city contains buildings only: no vehicle collider exists.
  assert.equal(world.stats.obstacles, 0);
  assert.ok(world.stats.buildings > 0);
  const run = runTicks(walker, 120, { headingRad: 0, gait: 'RUN', intensity: 1 }, [sedanAt(1.8)]);
  assert.equal(run.stats.vehicleBodiesCreated, 0);
  assert.equal(walker.registration.vehicleBodiesCreated, 0);
  // It did read the vehicle: the contact is what stopped it.
  assert.ok(run.stats.vehicleContacts >= 1);
  assert.ok(run.samples.every((sample) => sample.maxPenetrationM <= 1e-9));
});

test('criteriul 2c: înregistrarea unui corp auto din modulul de mers e refuzată explicit', () => {
  const walker = createWalker({ world, start: { positionM: start, yawRad: 0 } });
  const bodyRequest = {
    entityId: 'sedan-192',
    positionM: { x: 0, y: 0, z: 0 },
    halfSizeM: { x: 0.85, y: 0.3, z: 2 },
    dynamic: true,
  };
  assert.equal(
    errorCode(() => walker.registration.registerVehicleBody(bodyRequest)),
    'VEHICLE_BODY_WRITE_REFUSED',
  );
  assert.equal(
    errorCode(() => walker.registration.writeVehicleState({ vehicleId: 'sedan-192', throttle: 1 })),
    'VEHICLE_STATE_WRITE_REFUSED',
  );
  assert.equal(walker.registration.vehicleBodiesCreated, 0);
  // The refusal is not a silent no-op: the message names the owner of the authority.
  assert.throws(() => walker.registration.registerVehicleBody(bodyRequest), /PBI 022/);
  // A normal walking tick still works after the refused calls.
  const result = walker.step({
    tick: walker.state.tick + 1,
    input: { headingRad: 0, gait: 'WALK', intensity: 1 },
  });
  assert.equal(result.state.tick, 1);
});

test('criteriul 2b: un vehicul mutat de proprietar rămâne neschimbat de tick-urile de mers', () => {
  const walker = createWalker({ world, start: { positionM: start, yawRad: 0 } });
  const parked = sedanAt(1.8);
  assert.equal(Object.isFrozen(parked), true);
  assert.equal(Object.isFrozen(parked.positionM), true);
  const parkedBits = characterPositionBits(parked.positionM);

  runTicks(walker, 60, { headingRad: 0, gait: 'WALK', intensity: 1 }, [parked]);
  assert.equal(characterPositionBits(parked.positionM), parkedBits);
  assert.deepEqual(JSON.parse(JSON.stringify(parked)), JSON.parse(JSON.stringify(sedanAt(1.8))));
  const stoppedAtParked = walker.state.positionM.z;

  // The owner moves the car; the walking ticks must not undo, nudge or re-derive that position.
  const moved = sedanAt(4.5);
  const movedBits = characterPositionBits(moved.positionM);
  runTicks(walker, 120, { headingRad: 0, gait: 'RUN', intensity: 1 }, [moved]);
  assert.equal(characterPositionBits(moved.positionM), movedBits);
  assert.equal(moved.positionM.z, 4.5);
  // The walker reacted to the new position instead of keeping its old clearance.
  assert.ok(walker.state.positionM.z > stoppedAtParked + 1, 'the stop point followed the vehicle');
  const expected =
    4.5 - (vehicleHalfWidth() + capsule.radiusM + WALKER_POLICY.vehicleContactMarginM);
  assert.ok(Math.abs(walker.state.positionM.z - expected) <= 1e-9);
});

test('walker-ul este singurul writer al poziției, iar cadrul de render e bit-identic', () => {
  const walker = createWalker({ world, start: { positionM: start, yawRad: 0 } });
  const vehicle = sedanAt(1.8);
  const frames: string[] = [];
  for (let index = 0; index < 120; index += 1) {
    walker.step({
      tick: walker.state.tick + 1,
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
      vehicles: [vehicle],
    });
    const before = walker.positionBits();
    const frame = walker.renderFrame();
    assert.equal(characterPositionBits(frame.positionM), before);
    assert.equal(frame.positionM.x, walker.state.positionM.x);
    assert.equal(frame.positionM.y, walker.state.positionM.y);
    assert.equal(frame.positionM.z, walker.state.positionM.z);
    assert.equal(frame.yawRad, walker.state.yawRad);
    assert.equal(frame.entityId, walker.entityId);
    frames.push(characterPositionBits(frame.positionM));
    // Rendering is read-only: the authoritative bits do not move.
    assert.equal(walker.positionBits(), before);
  }
  assert.equal(walker.stats.renderFrames, 120);
  assert.ok(new Set(frames).size > 1, 'the frames are not frozen');

  // The animation channel still refuses to write the entity position, so there is no second writer.
  const writer = createCharacterPoseWriter(walker.authority());
  assert.equal(
    errorCode(() => writer.writeEntityPositionM({ x: 0, y: 0, z: 0 })),
    'AUTHORITY_WRITE_REFUSED',
  );
  assert.equal(
    errorCode(() => writer.writeRootMotionM({ x: 1, y: 0, z: 0 })),
    'AUTHORITY_WRITE_REFUSED',
  );
  const committed = writer.commit();
  assert.equal(characterPositionBits(committed.positionM), walker.positionBits());

  // A foreign authority cannot move the walker: the pose is local-only and copies its own authority.
  const pose = sampleCharacterPose(skeleton, walker.state.clipId, walker.state.tick);
  const foreign = createCharacterAuthority({
    entityId: 'intruder',
    positionM: { x: -999, y: 0, z: -999 },
    yawRad: 3,
  });
  const foreignFrame = applyCharacterPose(foreign, pose);
  assert.equal(foreignFrame.positionM.x, -999);
  assert.notEqual(characterPositionBits(foreignFrame.positionM), walker.positionBits());
  assert.equal(walker.positionBits(), characterPositionBits(walker.state.positionM));

  // The state object itself is immutable: no external assignment can create a second writer.
  assert.equal(Object.isFrozen(walker.state), true);
  assert.equal(Object.isFrozen(walker.state.positionM), true);
  assert.throws(() => {
    (walker.state as { positionM: unknown }).positionM = { x: 1, y: 2, z: 3 };
  }, TypeError);
});

test('poziția render este bit-identică și după N tick-uri de alergare', () => {
  const walker = createWalker({ world, start: { positionM: start, yawRad: 0 } });
  for (let index = 0; index < 180; index += 1)
    walker.step({
      tick: walker.state.tick + 1,
      input: { headingRad: 0.4, gait: 'RUN', intensity: 1 },
    });
  const frame = walker.renderFrame();
  assert.equal(characterPositionBits(frame.positionM), walker.positionBits());
  assert.equal(frame.positionM.y, walker.state.positionM.y);
  assert.equal(walker.state.yawRad, 0.4);
});

test('doi walkeri cu aceleași intrări produc aceiași biți', () => {
  const first = createWalker({ world, start: { positionM: start, yawRad: 0 } });
  const second = createWalker({ world, start: { positionM: start, yawRad: 0 } });
  for (let index = 0; index < 90; index += 1) {
    const input = {
      headingRad: 0.3,
      gait: index % 3 === 0 ? ('RUN' as const) : ('WALK' as const),
      intensity: 0.8,
    };
    first.step({ tick: first.state.tick + 1, input, vehicles: [sedanAt(1.8)] });
    second.step({ tick: second.state.tick + 1, input, vehicles: [sedanAt(1.8)] });
    assert.equal(first.positionBits(), second.positionBits());
  }
  assert.deepEqual(first.stats, second.stats);
});

test('intrările invalide sunt refuzate, nu aproximate', () => {
  const walker = createWalker({ world, start: { positionM: start, yawRad: 0 } });
  const tick = walker.state.tick + 1;
  assert.equal(
    errorCode(() =>
      walker.step({ tick: tick + 1, input: { headingRad: 0, gait: 'WALK', intensity: 1 } }),
    ),
    'INVALID_TICK',
  );
  assert.equal(
    errorCode(() =>
      walker.step({ tick, input: { headingRad: Number.NaN, gait: 'WALK', intensity: 1 } }),
    ),
    'INVALID_WALK_INPUT',
  );
  assert.equal(
    errorCode(() =>
      walker.step({ tick, input: { headingRad: 0, gait: 'SPRINT' as 'WALK', intensity: 1 } }),
    ),
    'INVALID_WALK_INPUT',
  );
  assert.equal(
    errorCode(() => walker.step({ tick, input: { headingRad: 0, gait: 'WALK', intensity: 1.5 } })),
    'INVALID_WALK_INPUT',
  );
  assert.equal(
    errorCode(() =>
      walker.step({
        tick,
        input: { headingRad: 0, gait: 'WALK', intensity: 1 },
        vehicles: [{ ...sedanAt(0), vehicleId: '' }],
      }),
    ),
    'INVALID_WALK_INPUT',
  );
  // The rejected calls did not advance the authoritative tick.
  assert.equal(walker.state.tick, 0);
  assert.equal(
    errorCode(() =>
      createWalker({
        world,
        start: { positionM: { x: start.x, y: start.y + 0.5, z: start.z }, yawRad: 0 },
      }),
    ),
    'INVALID_WALK_INPUT',
  );
});
