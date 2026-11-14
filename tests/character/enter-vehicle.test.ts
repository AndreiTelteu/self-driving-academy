/**
 * PBI 195 — behaviour of the vehicle entry transition.
 *
 * The fixtures are the delivered ones: a sedan with the real 022/145 collider, the real PBI 042
 * walk world, the real PBI 191 capsule and the PBI 193 authority. The tests cover the accepted
 * transitions, every real refusal with its own geometry, the bit identity of the preserved state,
 * the closed refusal vocabulary and the fail-closed input validation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTER_VEHICLE_CONTRACT_VERSION,
  VEHICLE_ENTRY_POLICY,
  VEHICLE_ENTRY_REFUSAL_CODES,
  characterPositionBits,
  createCharacterAsset,
  createOrientedRectanglePolygon,
  decideVehicleEntry,
  vehicleEntryBits,
  vehicleEntryDoor,
  type VehicleEntryCharacterBody,
  type VehicleEntryRefusal,
  type VehicleEntryRequest,
  type VehicleEntryVehicle,
  type WalkBlocker,
} from '../../src/character';
import { doorObstacle, entryRequest, entryVehicle, streetFixture } from './enter-vehicle-suite';
import { sedanWalkFootprint } from './walk-world';

const TICK = 120;

function characterBody(
  positionM: { x: number; y: number; z: number },
  yawRad = 0,
): VehicleEntryCharacterBody {
  const measured = createCharacterAsset().measured;
  return Object.freeze({
    entityId: 'player-character',
    positionM: Object.freeze({ x: positionM.x, y: positionM.y, z: positionM.z }),
    yawRad,
    radiusM: Math.max(measured.footprintWidthM, measured.footprintDepthM) / 2,
    heightM: measured.heightM,
  });
}

function refusal(decision: ReturnType<typeof decideVehicleEntry>): VehicleEntryRefusal {
  assert.equal(decision.accepted, false);
  return decision as VehicleEntryRefusal;
}

test('preia civilul, păstrează starea bit-identic și schimbă doar modul în MANUAL', () => {
  const fixture = streetFixture();
  const request = entryRequest(fixture);
  const before = JSON.stringify(request);
  const decision = decideVehicleEntry(request);
  assert.equal(JSON.stringify(request), before, 'request-ul primit nu este mutat');
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;

  assert.equal(decision.tick, TICK);
  assert.equal(decision.vehicleId, fixture.vehicle.vehicleId);
  assert.deepEqual(decision.authority, {
    consumer: 'VEHICLE',
    vehicleId: fixture.vehicle.vehicleId,
  });
  assert.deepEqual(decision.previousAuthority, {
    consumer: 'CHARACTER',
    characterId: fixture.walker.entityId,
  });
  assert.equal(decision.previousMode, 'AUTO');
  assert.equal(decision.mode, 'MANUAL');
  assert.equal(decision.vehicle.state.controlMode, 'MANUAL');
  assert.equal(decision.bits.before, decision.bits.after);
  assert.equal(decision.bits.before, vehicleEntryBits(fixture.vehicle));

  assert.equal(decision.entities.before, 2);
  assert.equal(decision.entities.after, 2);
  assert.equal(decision.entities.characters, 1);
  assert.equal(decision.entities.vehicles, 1);
  assert.equal(decision.character.entityId, fixture.walker.entityId);
  assert.deepEqual(decision.character.positionM, fixture.walker.state.positionM);
  assert.equal(
    characterPositionBits(decision.character.positionM),
    fixture.walker.positionBits(),
    'corpul personajului rămâne exact la poziția autoritară',
  );
  assert.equal(fixture.walker.state.tick, 0, 'decizia nu pașește walker-ul');

  assert.equal(decision.camera.tick, decision.tick);
  assert.equal(decision.camera.authorityEntityId, decision.vehicleId);
  assert.equal(decision.camera.previousEntityId, fixture.walker.entityId);
  assert.deepEqual(decision.journal, { tick: TICK, vehicleId: decision.vehicleId });

  assert.ok(Object.isFrozen(decision));
  assert.ok(Object.isFrozen(decision.vehicle));
  assert.ok(Object.isFrozen(decision.vehicle.state));
  assert.ok(Object.isFrozen(decision.vehicle.state.routeLaneIds));
  assert.ok(Object.isFrozen(decision.door));
  assert.ok(Object.isFrozen(decision.entities));
  assert.ok(Object.isFrozen(decision.camera));
});

test('taxiul aflat în cursă își păstrează ruta, cursa și progresul; LEARNING devine MANUAL', () => {
  const state = {
    controlMode: 'LEARNING' as const,
    velocityMps: Object.freeze({ x: 0, y: 0, z: 8.5 }),
    laneId: 'lane:avenue:southbound',
    maneuverState: 'FOLLOWING' as const,
    routeLaneIds: ['lane:avenue:southbound', 'lane:junction', 'lane:street:dropoff'],
    rideId: 'ride-061-7',
    rideProgressM: 412.5,
    appliedProfileVersion: 'profile-version-195',
  };
  const fixture = streetFixture('vehicle:taxi-195', 'TAXI', state);
  const decision = decideVehicleEntry(entryRequest(fixture));
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.previousMode, 'LEARNING');
  assert.equal(decision.mode, 'MANUAL');
  assert.equal(decision.vehicle.driverKind, 'TAXI');
  assert.equal(decision.vehicle.state.rideId, state.rideId);
  assert.deepEqual(decision.vehicle.state.routeLaneIds, state.routeLaneIds);
  assert.equal(decision.vehicle.state.rideProgressM, state.rideProgressM);
  assert.equal(decision.vehicle.state.velocityMps.z, 8.5);
  assert.equal(decision.vehicle.state.appliedProfileVersion, state.appliedProfileVersion);
  assert.equal(decision.bits.before, decision.bits.after);
});

test('alege ușa din flancul din care se poate intra', () => {
  const fixture = streetFixture();
  const farSide = Object.freeze({
    x: fixture.doorM.x + fixture.outwardM.x * 2,
    y: fixture.doorM.y,
    z: fixture.doorM.z + fixture.outwardM.z * 2,
  });
  const body = characterBody(farSide);
  const door = vehicleEntryDoor(fixture.vehicle, body.positionM);
  assert.equal(door.side, 'RIGHT');
  assert.ok(Math.abs(door.distanceM - 0.3) < 1e-9);
  const decision = decideVehicleEntry(
    entryRequest(fixture, { character: body, previousEntry: null }),
  );
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.door.side, 'RIGHT');
});

test('refuză cu cod fiecare condiție reală de acces', () => {
  const fixture = streetFixture();
  const footprint = sedanWalkFootprint();

  const unknown = refusal(
    decideVehicleEntry(entryRequest(fixture, { intent: { vehicleId: 'vehicle:missing' } })),
  );
  assert.equal(unknown.code, 'UNKNOWN_VEHICLE');
  assert.equal(unknown.vehicleId, 'vehicle:missing');

  const occupied = refusal(
    decideVehicleEntry(
      entryRequest(fixture, { authority: { consumer: 'VEHICLE', vehicleId: 'vehicle:other' } }),
    ),
  );
  assert.equal(occupied.code, 'VEHICLE_OCCUPIED');
  assert.equal(occupied.blockerId, 'vehicle:other');

  const immobilized = refusal(
    decideVehicleEntry(
      entryRequest(fixture, {
        vehicles: [{ ...fixture.vehicle, availability: 'IMMOBILIZED' }],
      }),
    ),
  );
  assert.equal(immobilized.code, 'VEHICLE_UNAVAILABLE');

  const along = Object.freeze({ x: fixture.outwardM.z, z: -fixture.outwardM.x });
  const far = characterBody({
    x: fixture.walker.state.positionM.x + along.x * 3,
    y: fixture.walker.state.positionM.y,
    z: fixture.walker.state.positionM.z + along.z * 3,
  });
  const outOfRange = refusal(decideVehicleEntry(entryRequest(fixture, { character: far })));
  assert.equal(outOfRange.code, 'OUT_OF_RANGE');
  assert.ok(outOfRange.distanceM !== null && outOfRange.distanceM > 3);
  assert.ok(outOfRange.doorM !== null);

  const obstacle = doorObstacle(fixture.doorM);
  const doorBlocked = refusal(
    decideVehicleEntry(entryRequest(fixture, { blockers: [...fixture.world.blockers, obstacle] })),
  );
  assert.equal(doorBlocked.code, 'PATH_BLOCKED');
  assert.equal(doorBlocked.blockerId, obstacle.id);

  const neighbourCenter = Object.freeze({
    x: fixture.doorM.x + fixture.outwardM.x * (footprint.halfExtentsM.x - 0.05),
    y: fixture.doorM.y,
    z: fixture.doorM.z + fixture.outwardM.z * (footprint.halfExtentsM.x - 0.05),
  });
  const neighbour = entryVehicle(
    'vehicle:neighbour',
    'CIVILIAN',
    neighbourCenter,
    fixture.vehicle.yawRad,
  );
  const vehicleBlocked = refusal(
    decideVehicleEntry(entryRequest(fixture, { vehicles: [fixture.vehicle, neighbour] })),
  );
  assert.equal(vehicleBlocked.code, 'PATH_BLOCKED');
  assert.equal(vehicleBlocked.blockerId, 'vehicle:vehicle:neighbour');

  const inside = characterBody(fixture.vehicle.positionM);
  const embedded = refusal(decideVehicleEntry(entryRequest(fixture, { character: inside })));
  assert.equal(embedded.code, 'PATH_BLOCKED');
  assert.equal(embedded.blockerId, fixture.vehicle.vehicleId);

  for (const decision of [
    unknown,
    occupied,
    immobilized,
    outOfRange,
    doorBlocked,
    vehicleBlocked,
    embedded,
  ])
    assert.ok((VEHICLE_ENTRY_REFUSAL_CODES as readonly string[]).includes(decision.code));
});

test('a doua intrare în același tick este refuzată, una într-un tick ulterior nu', () => {
  const fixture = streetFixture();
  const first = decideVehicleEntry(entryRequest(fixture));
  assert.equal(first.accepted, true);
  if (!first.accepted) return;

  const sameTick = refusal(
    decideVehicleEntry({
      ...entryRequest(fixture),
      tick: first.tick,
      authority: first.authority,
      previousEntry: first.journal,
    }),
  );
  assert.equal(sameTick.code, 'DOUBLE_ENTRY_REFUSED');
  assert.equal(sameTick.vehicleId, first.vehicleId);

  const laterTick = decideVehicleEntry({
    ...entryRequest(fixture),
    tick: first.tick + 1,
    authority: first.authority,
    previousEntry: first.journal,
  });
  // The seat is still the earlier car: without a release (196) the entry is refused as occupied.
  assert.equal(laterTick.accepted, false);
  if (laterTick.accepted) return;
  assert.equal(laterTick.code, 'VEHICLE_OCCUPIED');
});

test('amprenta pe biți detectează orice câmp păstrat și ignoră doar modul', () => {
  const vehicle = streetFixture('vehicle:taxi-195', 'TAXI', {
    rideId: 'ride-061-7',
    routeLaneIds: ['lane:a', 'lane:b'],
    rideProgressM: 12.5,
    velocityMps: Object.freeze({ x: 0.25, y: -1e-9, z: 8.5 }),
  }).vehicle;
  const bits = vehicleEntryBits(vehicle);
  assert.equal(
    bits,
    vehicleEntryBits({ ...vehicle, state: { ...vehicle.state, controlMode: 'MANUAL' } }),
  );
  assert.equal(
    bits,
    vehicleEntryBits({ ...vehicle, state: { ...vehicle.state, controlMode: 'LEARNING' } }),
  );
  assert.notEqual(
    bits,
    vehicleEntryBits({
      ...vehicle,
      state: { ...vehicle.state, rideProgressM: vehicle.state.rideProgressM + 1e-12 },
    }),
  );
  assert.notEqual(
    bits,
    vehicleEntryBits({
      ...vehicle,
      positionM: { ...vehicle.positionM, x: vehicle.positionM.x + 1e-12 },
    }),
  );
  assert.notEqual(
    bits,
    vehicleEntryBits({ ...vehicle, state: { ...vehicle.state, rideId: 'ride-other' } }),
  );
  assert.notEqual(
    bits,
    vehicleEntryBits({ ...vehicle, state: { ...vehicle.state, routeLaneIds: ['lane:a'] } }),
  );
  assert.notEqual(bits, vehicleEntryBits({ ...vehicle, availability: 'DAMAGED' }));
});

test('refuză inputurile invalide cu cod de contract', () => {
  const fixture = streetFixture();
  const valid = entryRequest(fixture);
  const expectCode = (code: string, run: () => unknown): void => {
    assert.throws(
      run,
      (error: unknown) => (error as { code?: string }).code === code,
      `expected ${code}`,
    );
  };

  expectCode('INVALID_ENTRY_TICK', () => decideVehicleEntry({ ...valid, tick: -1 }));
  expectCode('INVALID_ENTRY_TICK', () => decideVehicleEntry({ ...valid, tick: 1.5 }));
  expectCode('INVALID_ENTRY_INPUT', () =>
    decideVehicleEntry({ ...valid, authority: { consumer: 'NOBODY' } as never }),
  );
  expectCode('INVALID_ENTRY_INPUT', () =>
    decideVehicleEntry({ ...valid, character: { ...valid.character, radiusM: 0 } }),
  );
  expectCode('INVALID_ENTRY_INPUT', () =>
    decideVehicleEntry({
      ...valid,
      character: { ...valid.character, positionM: { x: NaN, y: 0, z: 0 } },
    }),
  );
  expectCode('INVALID_ENTRY_INPUT', () =>
    decideVehicleEntry({ ...valid, intent: { vehicleId: '' } }),
  );
  expectCode('INVALID_ENTRY_VEHICLE', () =>
    decideVehicleEntry({
      ...valid,
      vehicles: [valid.vehicles[0]!, valid.vehicles[0]!],
    }),
  );
  expectCode('INVALID_ENTRY_VEHICLE', () =>
    decideVehicleEntry({
      ...valid,
      vehicles: [{ ...valid.vehicles[0]!, halfExtentsM: { x: 0, z: 1 } }],
    }),
  );
  expectCode('INVALID_ENTRY_VEHICLE', () =>
    decideVehicleEntry({
      ...valid,
      vehicles: [
        {
          ...valid.vehicles[0]!,
          state: { ...valid.vehicles[0]!.state, controlMode: 'PILOT' as never },
        },
      ],
    }),
  );
  expectCode('INVALID_ENTRY_VEHICLE', () =>
    decideVehicleEntry({
      ...valid,
      vehicles: [{ ...valid.vehicles[0]!, availability: 'WRECKED' as never }],
    }),
  );
  expectCode('INVALID_ENTRY_WORLD', () =>
    decideVehicleEntry({
      ...valid,
      blockers: [
        {
          id: 'broken',
          kind: 'BUILDING',
          bottomM: 1,
          topM: 0,
          marginM: 0,
          polygon: { id: 'broken', vertices: [], bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } },
        } as unknown as WalkBlocker,
      ],
    }),
  );
  expectCode('INVALID_ENTRY_INPUT', () =>
    decideVehicleEntry({ ...valid, previousEntry: { tick: 1.5, vehicleId: 'x' } }),
  );
});

test('aceleași date produc exact aceeași decizie', () => {
  const fixture = streetFixture();
  const request = entryRequest(fixture);
  const first = decideVehicleEntry(request);
  const second = decideVehicleEntry(request);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(ENTER_VEHICLE_CONTRACT_VERSION, '195-enter-vehicle-v1');
  assert.equal(VEHICLE_ENTRY_POLICY.entryMode, 'MANUAL');
  assert.equal(VEHICLE_ENTRY_POLICY.tickHz, 60);
  assert.ok(VEHICLE_ENTRY_POLICY.interactionRadiusM > 0.3);
});

test('decizia nu depinde de ordinea vehiculelor în listă', () => {
  const fixture = streetFixture();
  const other = entryVehicle(
    'vehicle:other-195',
    'CIVILIAN',
    Object.freeze({ x: fixture.vehicle.positionM.x + 30, y: 0, z: fixture.vehicle.positionM.z }),
    0,
  );
  const forward = decideVehicleEntry(entryRequest(fixture, { vehicles: [fixture.vehicle, other] }));
  const reverse = decideVehicleEntry(entryRequest(fixture, { vehicles: [other, fixture.vehicle] }));
  assert.equal(JSON.stringify(forward), JSON.stringify(reverse));
  const blocked = decideVehicleEntry(
    entryRequest(fixture, {
      vehicles: [fixture.vehicle, other],
      blockers: [...fixture.world.blockers, doorObstacle(fixture.doorM)],
    }),
  );
  assert.equal(blocked.accepted, false);
  if (blocked.accepted) return;
  assert.equal(blocked.doorM !== null, true);
  // A polygon built from the same body is exactly what the contract uses for other cars.
  const body = createOrientedRectanglePolygon(
    'probe',
    fixture.vehicle.positionM,
    fixture.vehicle.halfExtentsM,
    fixture.vehicle.yawRad,
  );
  assert.equal(body.vertices.length, 4);
});

test('păstrează starea chiar dacă apelantul modifică intrarea după decizie', () => {
  const fixture = streetFixture('vehicle:taxi-195', 'TAXI', {
    rideId: 'ride-061-7',
    routeLaneIds: ['lane:a', 'lane:b'],
    rideProgressM: 12.5,
  });
  const mutableVehicle = JSON.parse(JSON.stringify(fixture.vehicle)) as VehicleEntryVehicle;
  const mutableCharacter = JSON.parse(
    JSON.stringify(fixture.character),
  ) as VehicleEntryCharacterBody;
  const request: VehicleEntryRequest = {
    tick: TICK,
    authority: { consumer: 'CHARACTER', characterId: mutableCharacter.entityId },
    character: mutableCharacter,
    intent: { vehicleId: mutableVehicle.vehicleId },
    vehicles: [mutableVehicle],
    blockers: [...fixture.world.blockers],
    previousEntry: null,
  };
  const decision = decideVehicleEntry(request);
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  const snapshot = JSON.stringify(decision);
  (mutableVehicle.state.routeLaneIds as string[]).push('lane:injected');
  (mutableVehicle.state as { rideProgressM: number }).rideProgressM = 999;
  (request.blockers as WalkBlocker[]).push(doorObstacle(fixture.doorM));
  assert.equal(JSON.stringify(decision), snapshot, 'rezultatul este o copie înghețată');
  assert.notEqual(JSON.stringify(mutableVehicle), JSON.stringify(decision.vehicle));
});
