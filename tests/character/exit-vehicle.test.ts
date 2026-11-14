/**
 * PBI 196 — behaviour of the vehicle exit transition.
 *
 * The fixtures are the delivered ones: the real PBI 042 city, the real PBI 022/145 sedan collider,
 * the PBI 191 capsule, the PBI 024/061 state and the PBI 193 authority. The tests cover the valid
 * point (including a case where the obvious door candidate is invalid and the next valid one is
 * chosen), every real refusal with its own geometry, the closed vocabulary, the numeric collision
 * proof, the 192 walker start rejection, the route restoration and the fail-closed validation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXIT_CANDIDATE_REFUSAL_CODES,
  EXIT_VEHICLE_CONTRACT_VERSION,
  VEHICLE_EXIT_POLICY,
  VEHICLE_EXIT_REFUSAL_CODES,
  characterPositionBits,
  createWalker,
  decideVehicleExit,
  vehicleExitRouteBits,
  type VehicleExitAcceptance,
  type VehicleExitDecision,
  type VehicleExitRefusal,
  type VehicleExitRequest,
} from '../../src/character';
import {
  boxedInExit,
  exitWorldOf,
  ledgeExit,
  manual,
  obstacleBlockingExit,
  occupiedExit,
  pitExit,
  rearExit,
  requestOf,
  streetExit,
  taxiExit,
  walkWorldOf,
  wallExit,
  withState,
  type ExitFixture,
} from './exit-vehicle-suite';
import { measurePenetration, realWalkWorld } from './walk-world';

const TICK = 240;

function acceptance(decision: VehicleExitDecision): VehicleExitAcceptance {
  assert.equal(decision.accepted, true);
  return decision as VehicleExitAcceptance;
}

function refusal(decision: VehicleExitDecision): VehicleExitRefusal {
  assert.equal(decision.accepted, false);
  return decision as VehicleExitRefusal;
}

function walkerCode(
  fixture: ExitFixture,
  positionM: Readonly<{ x: number; y: number; z: number }>,
): string {
  try {
    createWalker({
      world: walkWorldOf(fixture.world, fixture.vehicles),
      start: { positionM, yawRad: 0 },
    });
    return 'ACCEPTED';
  } catch (error) {
    return (error as { code?: string }).code ?? 'UNKNOWN';
  }
}

test('eliberează mașina, mută corpul în afara caroseriei și readuce autoritatea', () => {
  const fixture = streetExit();
  const request = requestOf(fixture);
  const before = JSON.stringify(request);
  const decision = acceptance(decideVehicleExit(request));
  assert.equal(JSON.stringify(request), before, 'request-ul primit nu este mutat');

  assert.equal(decision.tick, TICK);
  assert.equal(decision.vehicleId, fixture.vehicle.vehicleId);
  assert.deepEqual(decision.authority, { consumer: 'CHARACTER', characterId: 'player-character' });
  assert.deepEqual(decision.previousAuthority, {
    consumer: 'VEHICLE',
    vehicleId: fixture.vehicle.vehicleId,
  });
  assert.equal(decision.previousMode, 'MANUAL');
  assert.equal(decision.baselineMode, 'AUTO');
  assert.equal(decision.mode, 'AUTO');
  assert.equal(decision.vehicle.state.controlMode, 'AUTO');
  assert.equal(decision.bits.identical, true);
  assert.equal(
    vehicleExitRouteBits(decision.vehicle.state),
    vehicleExitRouteBits(fixture.preTakeover.state),
  );

  assert.equal(decision.entities.before, 2);
  assert.equal(decision.entities.after, 2);
  assert.equal(decision.entities.vehicles, 1);
  assert.equal(decision.entities.characters, 1);
  assert.equal(decision.character.entityId, 'player-character');
  assert.deepEqual(decision.character.positionM, decision.start.positionM);
  assert.deepEqual(decision.journal, { tick: TICK, vehicleId: fixture.vehicle.vehicleId });
  assert.equal(decision.camera.tick, decision.tick);
  assert.equal(decision.camera.authorityEntityId, 'player-character');
  assert.equal(decision.camera.previousEntityId, fixture.vehicle.vehicleId);

  assert.equal(decision.exit.candidateId, 'LEFT:R0');
  assert.equal(decision.exit.attempts, 1);
  assert.equal(decision.exit.ring, 0);
  assert.ok(Math.abs(decision.exit.offsetM - 1.05) < 1e-12);

  assert.ok(Object.isFrozen(decision));
  assert.ok(Object.isFrozen(decision.vehicle));
  assert.ok(Object.isFrozen(decision.vehicle.state));
  assert.ok(Object.isFrozen(decision.candidates));
  assert.ok(Object.isFrozen(decision.start));
  assert.ok(Object.isFrozen(decision.character));
  assert.ok(Object.isFrozen(decision.camera));
  assert.ok(Object.isFrozen(decision.bits));
});

test('candidatul evident de lângă ușă e invalid și este ales următorul valid', () => {
  const fixture = streetExit();
  const obstacle = obstacleBlockingExit('hazard:exit-196', fixture.anchorM, fixture.outwardM);
  const blockedFixture = {
    ...fixture,
    world: exitWorldOf(realWalkWorld().world, [obstacle]),
  };
  const blocked = requestOf(blockedFixture);
  const decision = acceptance(decideVehicleExit(blocked));
  assert.equal(decision.candidates.length, 2);
  assert.equal(decision.candidates[0]!.id, 'LEFT:R0');
  assert.equal(decision.candidates[0]!.valid, false);
  assert.equal(decision.candidates[0]!.code, 'SOLID');
  assert.equal(decision.candidates[0]!.blockerId, obstacle.id);
  assert.equal(decision.candidates[1]!.id, 'RIGHT:R0');
  assert.equal(decision.candidates[1]!.valid, true);
  assert.equal(decision.exit.candidateId, 'RIGHT:R0');
  assert.equal(decision.exit.side, 'RIGHT');

  // The rejected "obvious" point is really a blocked walker start; the chosen one is not.
  assert.equal(walkerCode(blockedFixture, decision.candidates[0]!.positionM), 'WALK_START_BLOCKED');
  assert.equal(walkerCode(blockedFixture, decision.start.positionM), 'ACCEPTED');
});

test('un zid real de clădire blochează ușa stângă și este ales flancul drept', () => {
  const fixture = wallExit();
  const decision = acceptance(decideVehicleExit(requestOf(fixture)));
  assert.equal(decision.candidates[0]!.id, 'LEFT:R0');
  assert.equal(decision.candidates[0]!.code, 'SOLID');
  assert.equal(decision.candidates[0]!.blockerId, fixture.buildingId);
  assert.equal(decision.exit.candidateId, 'RIGHT:R0');
  assert.ok(decision.candidates[0]!.clearanceM < 0);
  assert.ok(decision.exit.clearanceM >= 0);
});

test('fără niciun candidat valid refuză ieșirea și nu mută corpul', () => {
  const fixture = boxedInExit();
  const decision = refusal(decideVehicleExit(requestOf(fixture)));
  assert.equal(decision.code, 'NO_VALID_EXIT');
  assert.equal(decision.candidates.length, 8);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.id),
    ['LEFT:R0', 'RIGHT:R0', 'REAR:R0', 'FRONT:R0', 'LEFT:R1', 'RIGHT:R1', 'REAR:R1', 'FRONT:R1'],
  );
  for (const candidate of decision.candidates) {
    assert.equal(candidate.valid, false);
    assert.ok((EXIT_CANDIDATE_REFUSAL_CODES as readonly string[]).includes(candidate.code!));
    // The real 192 walker would refuse every one of these starts: no teleport into a wall.
    assert.equal(walkerCode(fixture, candidate.positionM), 'WALK_START_BLOCKED');
  }
  assert.ok(!Object.hasOwn(decision, 'character'));
  assert.ok(!Object.hasOwn(decision, 'start'));
});

test('criteriul 1 — după ieșire, corpul nu penetrează nimic și stă pe sol', () => {
  const fixtures = [streetExit(), wallExit(), occupiedExit(), rearExit()];
  for (const fixture of fixtures) {
    const decision = acceptance(decideVehicleExit(requestOf(fixture)));
    const world = walkWorldOf(fixture.world);
    const measured = measurePenetration(
      world,
      decision.start.positionM,
      fixture.character.radiusM,
      fixture.character.heightM,
      fixture.vehicles,
    );
    assert.equal(measured.maxPenetrationM, 0, 'nicio penetrare');
    assert.ok(measured.minClearanceM >= 0, `marjă liberă ${measured.minClearanceM}`);
    assert.equal(measured.insideSolid, false);
    const ground = world.surfaceAt(decision.start.positionM.x, decision.start.positionM.z);
    assert.equal(decision.start.positionM.y, ground);
    assert.ok(decision.start.positionM.y >= ground);
    assert.ok(decision.exit.clearanceM >= 0);
  }
});

test('walker-ul primește exact punctul de ieșire și îl refuză pe cel blocat', () => {
  const fixture = streetExit();
  const decision = acceptance(decideVehicleExit(requestOf(fixture)));
  const walker = createWalker({
    world: walkWorldOf(fixture.world, fixture.vehicles),
    start: decision.start,
  });
  assert.deepEqual(walker.state.positionM, decision.start.positionM);
  assert.equal(walker.state.yawRad, decision.start.yawRad);
  assert.equal(walker.positionBits(), characterPositionBits(decision.start.positionM));
  assert.equal(walker.state.tick, 0);

  const boxedFixture = boxedInExit();
  const boxed = refusal(decideVehicleExit(requestOf(boxedFixture)));
  for (const candidate of boxed.candidates)
    assert.equal(walkerCode(boxedFixture, candidate.positionM), 'WALK_START_BLOCKED');
});

test('mașina în mișcare are o regulă explicită, cu pragul real al clipului de mers', () => {
  const base = streetExit();
  const fast = refusal(
    decideVehicleExit(
      requestOf({
        ...base,
        vehicle: withState(base.vehicle, { velocityMps: { x: 0, y: 0, z: 8.5 } }),
      }),
    ),
  );
  assert.equal(fast.code, 'VEHICLE_MOVING');
  assert.equal(fast.speedMps, 8.5);

  const slow = acceptance(
    decideVehicleExit(
      requestOf({
        ...base,
        vehicle: withState(base.vehicle, { velocityMps: { x: 0, y: 0, z: 0.3 } }),
      }),
    ),
  );
  assert.equal(slow.exit.candidateId, 'LEFT:R0');

  const atLimit = acceptance(
    decideVehicleExit(
      requestOf({
        ...base,
        vehicle: withState(base.vehicle, {
          velocityMps: { x: 0, y: 0, z: VEHICLE_EXIT_POLICY.maxExitSpeedMps },
        }),
      }),
    ),
  );
  assert.ok(atLimit.accepted);
  const above = refusal(
    decideVehicleExit(
      requestOf({
        ...base,
        vehicle: withState(base.vehicle, {
          velocityMps: { x: 0, y: 0, z: VEHICLE_EXIT_POLICY.maxExitSpeedMps + 1e-6 },
        }),
      }),
    ),
  );
  assert.equal(above.code, 'VEHICLE_MOVING');
});

test('refuză secvența și scaunul care nu mai ține mașina', () => {
  const fixture = streetExit();
  const decision = acceptance(decideVehicleExit(requestOf(fixture)));

  const sameTick = refusal(
    decideVehicleExit({
      ...requestOf(fixture),
      tick: decision.tick,
      authority: decision.authority,
      previousExit: decision.journal,
    }),
  );
  assert.equal(sameTick.code, 'DOUBLE_EXIT_REFUSED');
  assert.equal(sameTick.vehicleId, decision.vehicleId);

  const character = refusal(
    decideVehicleExit(
      requestOf(fixture, {
        authority: { consumer: 'CHARACTER', characterId: 'player-character' },
      }),
    ),
  );
  assert.equal(character.code, 'NOT_CONTROLLED');

  // A stale VEHICLE authority over the already released AUTO car is not a held seat.
  const stale = refusal(
    decideVehicleExit({
      ...requestOf(fixture),
      tick: decision.tick + 1,
      vehicle: decision.vehicle,
      vehicles: [decision.vehicle],
      previousExit: decision.journal,
    }),
  );
  assert.equal(stale.code, 'NOT_CONTROLLED');

  const otherCar = refusal(
    decideVehicleExit(
      requestOf(fixture, {
        authority: { consumer: 'VEHICLE', vehicleId: 'vehicle:other' },
      }),
    ),
  );
  assert.equal(otherCar.code, 'NOT_CONTROLLED');
});

test('criteriul 2b — ruta, banda, cursa și progresul de dinainte de preluare sunt restaurate', () => {
  const taxi = taxiExit();
  const drift = manual(taxi.preTakeover, {
    tick: TICK - 1,
    laneId: 'lane:manual-drift',
    routeLaneIds: ['lane:manual-drift-a', 'lane:manual-drift-b'],
    rideProgressM: 449.75,
    velocityMps: { x: 0, y: 0, z: 0.5 },
  });
  const decision = acceptance(
    decideVehicleExit({
      ...requestOf(taxi),
      vehicle: drift,
      vehicles: [drift],
    }),
  );
  assert.equal(decision.previousMode, 'MANUAL');
  assert.equal(decision.baselineMode, 'LEARNING');
  assert.equal(decision.mode, 'AUTO');
  assert.equal(decision.vehicle.state.controlMode, 'AUTO');
  assert.equal(decision.vehicle.state.laneId, taxi.preTakeover.state.laneId);
  assert.deepEqual(decision.vehicle.state.routeLaneIds, taxi.preTakeover.state.routeLaneIds);
  assert.equal(decision.vehicle.state.rideId, taxi.preTakeover.state.rideId);
  assert.equal(decision.vehicle.state.rideProgressM, taxi.preTakeover.state.rideProgressM);
  assert.notEqual(decision.vehicle.state.laneId, drift.state.laneId);
  assert.notEqual(decision.vehicle.state.rideProgressM, drift.state.rideProgressM);
  assert.equal(decision.bits.identical, true);
  assert.equal(decision.bits.baseline, vehicleExitRouteBits(taxi.preTakeover.state));
  assert.equal(decision.bits.released, vehicleExitRouteBits(decision.vehicle.state));
});

test('ordinea candidaților este deterministă și aceleași date dau aceeași decizie', () => {
  const fixture = boxedInExit();
  const request = requestOf(fixture);
  const first = decideVehicleExit(request);
  const second = decideVehicleExit(request);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.id),
    ['LEFT:R0', 'RIGHT:R0', 'REAR:R0', 'FRONT:R0', 'LEFT:R1', 'RIGHT:R1', 'REAR:R1', 'FRONT:R1'],
  );
  assert.ok(
    first.candidates.every((candidate) => candidate.ring === (candidate.id.endsWith('R0') ? 0 : 1)),
  );
});

test('decizia este o copie înghețată, independentă de obiectele primite', () => {
  const fixture = taxiExit();
  const mutable = JSON.parse(JSON.stringify(requestOf(fixture))) as {
    vehicles: { state: { routeLaneIds: string[]; rideProgressM: number } }[];
    world: { blockers: unknown[] };
  };
  const decision = acceptance(decideVehicleExit(mutable as unknown as VehicleExitRequest));
  const snapshot = JSON.stringify(decision);
  mutable.vehicles[0]!.state.routeLaneIds.push('lane:injected');
  mutable.vehicles[0]!.state.rideProgressM = 999;
  mutable.world.blockers.push({ broken: true });
  assert.equal(JSON.stringify(decision), snapshot);
  assert.ok(!decision.vehicle.state.routeLaneIds.includes('lane:injected'));
});

test('refuză inputurile invalide cu cod de contract', () => {
  const fixture = streetExit();
  const valid = requestOf(fixture);
  const expectCode = (code: string, run: () => unknown): void => {
    assert.throws(
      run,
      (error: unknown) => (error as { code?: string }).code === code,
      `expected ${code}`,
    );
  };

  expectCode('INVALID_EXIT_TICK', () => decideVehicleExit({ ...valid, tick: -1 }));
  expectCode('INVALID_EXIT_TICK', () => decideVehicleExit({ ...valid, tick: 1.5 }));
  expectCode('INVALID_EXIT_INPUT', () =>
    decideVehicleExit({ ...valid, authority: { consumer: 'NOBODY' } as never }),
  );
  expectCode('INVALID_EXIT_INPUT', () =>
    decideVehicleExit({ ...valid, character: { ...valid.character, radiusM: 0 } }),
  );
  expectCode('INVALID_EXIT_INPUT', () =>
    decideVehicleExit({
      ...valid,
      preTakeover: { ...valid.preTakeover, vehicleId: 'vehicle:other' },
    }),
  );
  expectCode('INVALID_EXIT_VEHICLE', () =>
    decideVehicleExit({ ...valid, vehicles: [valid.vehicles[0]!, valid.vehicles[0]!] }),
  );
  expectCode('INVALID_EXIT_VEHICLE', () =>
    decideVehicleExit({
      ...valid,
      vehicles: [{ ...valid.vehicles[0]!, halfExtentsM: { x: 0, z: 1 } }],
    }),
  );
  expectCode('INVALID_EXIT_VEHICLE', () =>
    decideVehicleExit({
      ...valid,
      vehicles: [
        {
          ...valid.vehicles[0]!,
          state: { ...valid.vehicles[0]!.state, controlMode: 'PILOT' as never },
        },
      ],
    }),
  );
  expectCode('INVALID_EXIT_WORLD', () =>
    decideVehicleExit({
      ...valid,
      world: {
        ...valid.world,
        blockers: [
          ...valid.world.blockers,
          {
            id: 'broken',
            kind: 'BUILDING',
            bottomM: 1,
            topM: 0,
            marginM: 0,
            polygon: { id: 'broken', vertices: [], bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } },
          },
        ],
      } as never,
    }),
  );
  expectCode('INVALID_EXIT_WORLD', () =>
    decideVehicleExit({
      ...valid,
      world: {
        ...valid.world,
        surfaces: [valid.world.surfaces[0]!, valid.world.surfaces[0]!],
      },
    }),
  );
  expectCode('INVALID_EXIT_INPUT', () =>
    decideVehicleExit({ ...valid, previousExit: { tick: 1.5, vehicleId: 'x' } }),
  );
});

test('contractul, politica și vocabularul sunt cele declarate', () => {
  assert.equal(EXIT_VEHICLE_CONTRACT_VERSION, '196-exit-vehicle-v1');
  assert.equal(VEHICLE_EXIT_POLICY.tickHz, 60);
  assert.equal(VEHICLE_EXIT_POLICY.releaseMode, 'AUTO');
  assert.equal(VEHICLE_EXIT_POLICY.clearanceM, 0.05);
  assert.equal(VEHICLE_EXIT_POLICY.stepOutM, 0.6);
  assert.equal(VEHICLE_EXIT_POLICY.maxGroundStepM, 0.14);
  assert.ok(
    Math.abs(VEHICLE_EXIT_POLICY.maxExitSpeedMps - 1.370967741935484) < 1e-12,
    `maxExitSpeedMps ${VEHICLE_EXIT_POLICY.maxExitSpeedMps}`,
  );
  assert.equal(VEHICLE_EXIT_POLICY.cameraTransitionTicks, 18);
  assert.deepEqual(
    [...VEHICLE_EXIT_REFUSAL_CODES],
    ['NOT_CONTROLLED', 'UNKNOWN_VEHICLE', 'VEHICLE_MOVING', 'NO_VALID_EXIT', 'DOUBLE_EXIT_REFUSED'],
  );
  assert.deepEqual(
    [...EXIT_CANDIDATE_REFUSAL_CODES],
    ['SOLID', 'OTHER_VEHICLE', 'STEP_TOO_HIGH', 'BELOW_MAP'],
  );
});

test('treapta prea înaltă și groapa de sub hartă sunt motive reale, nu decor', () => {
  const ledge = acceptance(decideVehicleExit(requestOf(ledgeExit())));
  assert.equal(ledge.candidates[0]!.code, 'STEP_TOO_HIGH');
  assert.ok(Math.abs(ledge.candidates[0]!.groundStepM - 0.6) < 1e-12);
  assert.equal(ledge.exit.candidateId, 'RIGHT:R0');
  assert.equal(ledge.exit.groundM, 0);

  const pit = acceptance(decideVehicleExit(requestOf(pitExit())));
  assert.equal(pit.candidates[0]!.code, 'BELOW_MAP');
  assert.equal(pit.exit.candidateId, 'RIGHT:R0');
  assert.ok(pit.candidates[0]!.groundM < 0);
});
