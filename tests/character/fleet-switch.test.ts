import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FleetSwitchError,
  FLEET_SWITCH_CONTRACT_VERSION,
  FLEET_SWITCH_POLICY,
  characterPointCheck,
  characterPositionBits,
  createFleetSwitchState,
  createWalkWorld,
  createWalker,
  decideFleetFocus,
  decideFleetReturn,
  decideFleetTake,
  fleetSwitchProjection,
  fleetSwitchSnapshot,
  parseFleetSwitchState,
  validateFleetSwitchProjection,
  type CharacterPoint,
  type FleetSwitchState,
  type VehicleEntryVehicle,
} from '../../src/character';
import { entryVehicle } from './enter-vehicle-suite';
import {
  distantFixture,
  nearFixture,
  returnBranch,
  seatedStateOf,
  stateOf,
} from './fleet-switch-suite';

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

function codeOf(run: () => unknown): string {
  try {
    run();
    return 'ACCEPTED';
  } catch (error) {
    return error instanceof FleetSwitchError ? error.code : 'UNKNOWN';
  }
}

function twoCarLot(): Readonly<{
  world: ReturnType<typeof createWalkWorld>;
  a: VehicleEntryVehicle;
  aAuto: VehicleEntryVehicle;
  b: VehicleEntryVehicle;
  character: Readonly<{ entityId: string; positionM: CharacterPoint; yawRad: number }>;
}> {
  const world = createWalkWorld({
    surfaces: [
      {
        id: 'fixture:lot',
        kind: 'STREET',
        topM: 0,
        vertices: [
          { x: -40, z: -40 },
          { x: 40, z: -40 },
          { x: 40, z: 40 },
          { x: -40, z: 40 },
        ],
      },
    ],
    blockers: [],
    defaultGroundM: 0,
  });
  const walker = createWalker({ world, start: { positionM: point(3, 0, 0), yawRad: 0 } });
  return Object.freeze({
    world,
    a: entryVehicle('vehicle:a-197', 'TAXI', point(0, 0, 0), 0, { controlMode: 'MANUAL' }),
    aAuto: entryVehicle('vehicle:a-197', 'TAXI', point(0, 0, 0), 0),
    b: entryVehicle('vehicle:b-197', 'TAXI', point(-2.25, 0, 0), 0),
    character: Object.freeze({
      entityId: walker.entityId,
      positionM: walker.state.positionM,
      yawRad: walker.state.yawRad,
    }),
  });
}

test('FOCUS mută doar camera: poziția personajului rămâne bit-identică', () => {
  const fixture = distantFixture();
  const state = stateOf(fixture);
  const decision = decideFleetFocus({
    tick: 500,
    state,
    vehicleId: 'vehicle:far-197',
    vehicles: fixture.vehicles,
  });
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.focus.distanceM, FLEET_SWITCH_POLICY.focusProofDistanceM);
  assert.deepEqual(decision.authority, state.authority);
  assert.deepEqual(decision.previousAuthority, state.authority);
  assert.equal(decision.bits.identical, true);
  assert.equal(decision.character.positionBits, characterPositionBits(fixture.character.positionM));
  assert.deepEqual(decision.character.positionM, fixture.character.positionM);
  assert.equal(decision.entities.before, decision.entities.after);
  assert.equal(decision.entities.before, 2);
  assert.equal(decision.camera.trackedEntityId, 'vehicle:far-197');
  assert.equal(decision.camera.authorityEntityId, fixture.character.entityId);
  assert.equal(decision.camera.diverged, true);
  assert.equal(decision.camera.changed, true);
  assert.equal(decision.camera.transitionTicks, 18);
  assert.equal(decision.verdict.characterMoved, false);
  assert.equal(decision.verdict.characterCloned, false);
  assert.equal(decision.verdict.authorityChanged, false);
  assert.equal(Object.isFrozen(decision), true);
  const again = decideFleetFocus({
    tick: 500,
    state,
    vehicleId: 'vehicle:far-197',
    vehicles: fixture.vehicles,
  });
  assert.equal(JSON.stringify(again), JSON.stringify(decision));
});

test('FOCUS refuză id-ul necunoscut, aceeași entitate și a doua comandă din tick', () => {
  const fixture = distantFixture();
  const state = stateOf(fixture);
  const unknown = decideFleetFocus({
    tick: 500,
    state,
    vehicleId: 'vehicle:ghost-197',
    vehicles: fixture.vehicles,
  });
  assert.deepEqual(unknown.accepted ? null : { code: unknown.code }, { code: 'UNKNOWN_VEHICLE' });
  const accepted = decideFleetFocus({
    tick: 500,
    state,
    vehicleId: 'vehicle:far-197',
    vehicles: fixture.vehicles,
  });
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  const same = decideFleetFocus({
    tick: 510,
    state: accepted.state,
    vehicleId: 'vehicle:far-197',
    vehicles: fixture.vehicles,
  });
  assert.equal(same.accepted, false);
  if (same.accepted) return;
  assert.equal(same.code, 'SAME_ENTITY');
  const double = decideFleetTake({
    tick: 500,
    state: accepted.state,
    vehicleId: 'vehicle:far-197',
    vehicles: fixture.vehicles,
    world: fixture.world,
  });
  assert.equal(double.accepted, false);
  if (double.accepted) return;
  assert.equal(double.code, 'DOUBLE_SWITCH_REFUSED');
});

test('TAKE pe un taxi distant este refuzat de regula reală 195, fără nicio schimbare', () => {
  const fixture = distantFixture();
  const state = stateOf(fixture);
  const decision = decideFleetTake({
    tick: 560,
    state,
    vehicleId: 'vehicle:far-197',
    vehicles: fixture.vehicles,
    world: fixture.world,
  });
  assert.equal(decision.accepted, false);
  if (decision.accepted) return;
  assert.equal(decision.code, 'TAKE_REFUSED');
  assert.equal(decision.cause, 'OUT_OF_RANGE');
  assert.equal(decision.exit, null);
  assert.equal(decision.entry !== null && decision.entry.accepted, false);
  assert.equal(state.authority.consumer, 'CHARACTER');
});

test('TAKE aproape este intrarea 195: autoritatea pe taxi, corpul nemișcat', () => {
  const fixture = nearFixture();
  const state = stateOf(fixture);
  const decision = decideFleetTake({
    tick: 560,
    state,
    vehicleId: 'vehicle:taxi-197',
    vehicles: fixture.vehicles,
    world: fixture.world,
  });
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.authority.consumer, 'VEHICLE');
  assert.equal(decision.exit, null);
  assert.equal(decision.entry.mode, 'MANUAL');
  assert.equal(decision.entry.vehicle.state.controlMode, 'MANUAL');
  assert.equal(decision.entities.before, decision.entities.after);
  assert.equal(decision.bits.identical, true);
  assert.equal(
    characterPositionBits(decision.character.positionM),
    characterPositionBits(fixture.character.positionM),
  );
  assert.deepEqual(decision.suspended.positionM, fixture.character.positionM);
  assert.equal(decision.state.authority.consumer, 'VEHICLE');
  assert.equal(decision.state.focusEntityId, null);
  assert.deepEqual(decision.state.previousEntry, decision.entry.journal);
});

test('TAKE dintr-o mașină compune 196 + 195 atomic, iar mașina veche revine în AUTO', () => {
  const lot = twoCarLot();
  const state = createFleetSwitchState({
    tick: 500,
    authority: Object.freeze({ consumer: 'VEHICLE' as const, vehicleId: 'vehicle:a-197' }),
    character: lot.character,
    suspended: Object.freeze({
      positionM: lot.character.positionM,
      yawRad: lot.character.yawRad,
      tick: 500,
    }),
  });
  const vehicles = Object.freeze([lot.a, lot.b]);
  const decision = decideFleetTake({
    tick: 560,
    state,
    vehicleId: 'vehicle:b-197',
    vehicles,
    world: Object.freeze({
      surfaces: lot.world.surfaces,
      blockers: lot.world.blockers,
      defaultGroundM: lot.world.defaultGroundM,
    }),
    controlled: Object.freeze({ vehicle: lot.a, preTakeover: lot.aAuto }),
  });
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.exit !== null, true);
  assert.equal(decision.exit!.accepted, true);
  assert.equal(decision.exit!.vehicle.state.controlMode, 'AUTO');
  assert.equal(decision.exit!.vehicle.vehicleId, 'vehicle:a-197');
  assert.equal(decision.authority.consumer, 'VEHICLE');
  assert.equal(
    decision.authority.consumer === 'VEHICLE' && decision.authority.vehicleId,
    'vehicle:b-197',
  );
  assert.equal(decision.entry.vehicle.state.controlMode, 'MANUAL');
  assert.deepEqual(decision.character.positionM, decision.exit!.start.positionM);
  assert.deepEqual(decision.suspended.positionM, decision.exit!.start.positionM);
  assert.equal(decision.entities.before, decision.entities.after);
  assert.equal(decision.state.previousExit?.vehicleId, 'vehicle:a-197');
});

test('RETURN reia poziția veche când este încă validă, cu biți identici', () => {
  const branch = returnBranch('resume');
  const returned = branch.returned;
  assert.equal(returned.resume.source, 'PREVIOUS_POSITION');
  assert.equal(returned.resume.identical, true);
  assert.equal(returned.resume.positionBits, returned.resume.previousBits);
  assert.equal(
    returned.resume.positionBits,
    characterPositionBits(branch.fixture.character.positionM),
  );
  assert.equal(returned.authority.consumer, 'CHARACTER');
  assert.equal(returned.exit.vehicle.state.controlMode, 'AUTO');
  assert.equal(returned.camera.trackedEntityId, branch.fixture.character.entityId);
  assert.equal(returned.camera.diverged, false);
  assert.equal(returned.entities.before, returned.entities.after);
  assert.equal(returned.state.suspended, null);
  assert.equal(returned.state.focusEntityId, null);
  const roundTrip = parseFleetSwitchState(
    JSON.parse(JSON.stringify(fleetSwitchSnapshot(returned.state))),
  );
  assert.equal(JSON.stringify(roundTrip), JSON.stringify(fleetSwitchSnapshot(returned.state)));
});

test('RETURN cu zid peste poziția veche folosește ieșirea validă, fără teleport', () => {
  const branch = returnBranch('wall');
  const returned = branch.returned;
  assert.equal(returned.resume.source, 'EXIT_POINT');
  assert.equal(returned.resume.identical, false);
  assert.equal(returned.resume.rejected?.code, 'CLEARANCE');
  assert.equal(returned.resume.positionBits, characterPositionBits(returned.exit.start.positionM));
  assert.notEqual(returned.resume.positionBits, returned.resume.previousBits);
  assert.equal(returned.exit.vehicle.state.controlMode, 'AUTO');
  assert.equal(returned.authority.consumer, 'CHARACTER');
  assert.equal(branch.wallId, 'wall:built-over-body-197');
});

test('RETURN fără mașină este refuzat cu NOT_CONTROLLED', () => {
  const fixture = nearFixture();
  const state = stateOf(fixture);
  const decision = decideFleetReturn({
    tick: 620,
    state,
    vehicles: fixture.vehicles,
    world: fixture.world,
    controlled: Object.freeze({
      vehicle: fixture.vehicles[0]!,
      preTakeover: fixture.vehicles[0]!,
    }),
  });
  assert.equal(decision.accepted, false);
  if (decision.accepted) return;
  assert.equal(decision.code, 'NOT_CONTROLLED');
});

test('characterPointCheck folosește aceleași reguli fizice ca ieșirea 196', () => {
  const fixture = nearFixture();
  const released = fixture.vehicles;
  const valid = characterPointCheck(
    fixture.world,
    released,
    fixture.character.positionM,
    fixture.character.yawRad,
  );
  assert.equal(valid.valid, true);
  assert.ok(valid.clearanceM >= 0);
  const inside = characterPointCheck(
    fixture.world,
    released,
    fixture.vehicles[0]!.positionM,
    fixture.character.yawRad,
  );
  assert.equal(inside.valid, false);
  assert.equal(inside.code, 'CLEARANCE');
  assert.equal(inside.nearestBlockerId, 'vehicle:vehicle:taxi-197');
});

test('proiecția UI este coerentă și garda refuză combinațiile inconsistente', () => {
  const fixture = nearFixture();
  const state = stateOf(fixture);
  const projection = fleetSwitchProjection({ state, vehicles: fixture.vehicles });
  assert.equal(projection.controlled.label, 'CHARACTER:player-character');
  assert.equal(projection.controlled.mode, 'MANUAL');
  assert.equal(projection.controlled.modeSource, 'CHARACTER');
  assert.equal(projection.camera.trackedEntityId, 'player-character');
  assert.equal(projection.camera.diverged, false);
  assert.equal(projection.camera.divergenceReason, null);
  assert.equal(
    validateFleetSwitchProjection(projection, { state, vehicles: fixture.vehicles }),
    projection,
  );

  const focused = decideFleetFocus({
    tick: 500,
    state,
    vehicleId: 'vehicle:taxi-197',
    vehicles: fixture.vehicles,
  });
  assert.equal(focused.accepted, true);
  if (!focused.accepted) return;
  const focusedProjection = fleetSwitchProjection({
    state: focused.state,
    vehicles: fixture.vehicles,
  });
  assert.equal(focusedProjection.camera.diverged, true);
  assert.equal(focusedProjection.camera.divergenceReason, 'FOCUS');
  assert.equal(focusedProjection.camera.focusSinceTick, 500);

  const seated = seatedStateOf(fixture, 'vehicle:taxi-197', 560);
  const manual = Object.freeze({
    ...fixture.vehicles[0]!,
    state: Object.freeze({ ...fixture.vehicles[0]!.state, controlMode: 'MANUAL' as const }),
  });
  const auto = Object.freeze({
    ...fixture.vehicles[0]!,
    state: Object.freeze({ ...fixture.vehicles[0]!.state, controlMode: 'AUTO' as const }),
  });
  const seatedProjection = fleetSwitchProjection({
    state: seated,
    vehicles: Object.freeze([manual]),
  });
  assert.equal(seatedProjection.controlled.label, 'VEHICLE:vehicle:taxi-197');
  assert.equal(seatedProjection.controlled.mode, 'MANUAL');
  assert.equal(
    validateFleetSwitchProjection(seatedProjection, {
      state: seated,
      vehicles: Object.freeze([manual]),
    }),
    seatedProjection,
  );

  const inconsistent = Object.freeze({
    ...seatedProjection,
    camera: Object.freeze({
      ...seatedProjection.camera,
      trackedEntityId: 'player-character',
      trackedKind: 'CHARACTER' as const,
      diverged: false,
      divergenceReason: null,
      focusSinceTick: null,
    }),
  });
  assert.equal(
    codeOf(() =>
      validateFleetSwitchProjection(inconsistent, {
        state: seated,
        vehicles: Object.freeze([manual]),
      }),
    ),
    'INCONSISTENT_PROJECTION',
  );
  const autoProjection = fleetSwitchProjection({ state: seated, vehicles: Object.freeze([auto]) });
  assert.equal(
    codeOf(() =>
      validateFleetSwitchProjection(autoProjection, {
        state: seated,
        vehicles: Object.freeze([auto]),
      }),
    ),
    'INCONSISTENT_PROJECTION',
  );
});

test('intrările invalide sunt refuzate fail-closed, nu aproximate', () => {
  const fixture = distantFixture();
  const state = stateOf(fixture);
  assert.equal(
    codeOf(() =>
      decideFleetFocus({
        tick: -1,
        state,
        vehicleId: 'vehicle:far-197',
        vehicles: fixture.vehicles,
      }),
    ),
    'INVALID_SWITCH_TICK',
  );
  assert.equal(
    codeOf(() =>
      decideFleetFocus({
        tick: 500,
        state,
        vehicleId: 'vehicle:far-197',
        vehicles: Object.freeze([fixture.vehicles[0]!, fixture.vehicles[0]!]),
      }),
    ),
    'INVALID_SWITCH_VEHICLE',
  );
  assert.equal(
    codeOf(() =>
      decideFleetFocus({
        tick: 500,
        state: Object.freeze({ ...state, version: 'other' }) as unknown as FleetSwitchState,
        vehicleId: 'vehicle:far-197',
        vehicles: fixture.vehicles,
      }),
    ),
    'INVALID_SWITCH_STATE',
  );
  assert.equal(
    codeOf(() => parseFleetSwitchState({ ...state, version: 'other' })),
    'INVALID_SWITCH_STATE',
  );
  assert.equal(
    codeOf(() =>
      createFleetSwitchState({
        authority: Object.freeze({
          consumer: 'CHARACTER' as const,
          characterId: 'player-character',
        }),
        character: Object.freeze({
          entityId: 'player-character',
          positionM: point(0, 0, 0),
          yawRad: 0,
        }),
        focusEntityId: 'player-character',
        focusSinceTick: 1,
      }),
    ),
    'INVALID_SWITCH_STATE',
  );

  const near = nearFixture();
  const nearState = stateOf(near);
  const seated = seatedStateOf(near, 'vehicle:taxi-197', 500);
  const other = entryVehicle('vehicle:other-197', 'TAXI', point(0, 0, 50), 0);
  assert.equal(
    codeOf(() =>
      decideFleetTake({
        tick: 560,
        state: seated,
        vehicleId: 'vehicle:other-197',
        vehicles: Object.freeze([near.vehicles[0]!, other]),
        world: near.world,
        controlled: null,
      }),
    ),
    'INVALID_SWITCH_INPUT',
  );
  assert.equal(
    codeOf(() =>
      decideFleetTake({
        tick: 560,
        state: nearState,
        vehicleId: 'vehicle:taxi-197',
        vehicles: near.vehicles,
        world: near.world,
        controlled: Object.freeze({
          vehicle: near.vehicles[0]!,
          preTakeover: near.vehicles[0]!,
        }),
      }),
    ),
    'INVALID_SWITCH_INPUT',
  );
  assert.equal(
    codeOf(() =>
      decideFleetReturn({
        tick: 620,
        state: seated,
        vehicles: near.vehicles,
        world: Object.freeze({
          ...near.world,
          defaultGroundM: 'zero',
        }) as unknown as typeof near.world,
        controlled: Object.freeze({
          vehicle: near.vehicles[0]!,
          preTakeover: near.vehicles[0]!,
        }),
      }),
    ),
    'INVALID_SWITCH_WORLD',
  );
});

test('starea este serializabilă și parserul strict refuză o stare incoerentă', () => {
  const fixture = nearFixture();
  const state = stateOf(fixture);
  const focus = decideFleetFocus({
    tick: 500,
    state,
    vehicleId: 'vehicle:taxi-197',
    vehicles: fixture.vehicles,
  });
  assert.equal(focus.accepted, true);
  if (!focus.accepted) return;
  const snapshot = fleetSwitchSnapshot(focus.state);
  assert.equal(snapshot.version, FLEET_SWITCH_CONTRACT_VERSION);
  const restored = parseFleetSwitchState(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored, snapshot);
  assert.equal(
    codeOf(() =>
      parseFleetSwitchState({ ...snapshot, lastCommand: { ...snapshot.lastCommand!, tick: 1 } }),
    ),
    'INVALID_SWITCH_STATE',
  );
  assert.equal(
    codeOf(() =>
      parseFleetSwitchState({
        ...snapshot,
        previousExit: { tick: 999, vehicleId: 'vehicle:taxi-197' },
      }),
    ),
    'INVALID_SWITCH_STATE',
  );
  assert.equal(
    codeOf(() =>
      parseFleetSwitchState({
        ...snapshot,
        focusEntityId: null,
        focusSinceTick: null,
        character: { ...snapshot.character, yawRad: 'zero' },
      }),
    ),
    'INVALID_SWITCH_STATE',
  );
});
