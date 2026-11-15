/**
 * PBI 201 — criteriul 1: fluxurile manual/AUTO rămân coerente după intrare și după ieșire.
 *
 * Lanțul este cel real, nu o machetă: personajul este `createWalker` (192) pe harta autorată,
 * intrarea și ieșirea sunt deciziile livrate 195/196 (prin 197 TAKE/RETURN), autoritatea este
 * arbitrul 193, camera este 194, iar segmentele sunt read model-ul 198. Fiecare mod de plecare
 * (AUTO, MANUAL, LEARNING) este trecut prin FOCUS → TAKE → mers în mașină → RETURN → mers pe jos.
 *
 * Ce se verifică, pe fiecare pas:
 * - există exact o autoritate, iar comanda livrată aparține exact acelei autorități;
 * - `deliver` către consumatorul inactiv și a doua livrare în același tick sunt refuzate;
 * - corpul personajului nu este clonat, mutat de intrare sau pierdut la ieșire;
 * - camera urmărește entitatea cerută de tranziție, fără entități inventate;
 * - mașina eliberată revine în AUTO, iar segmentul se închide cu modul și motivul real;
 * - după ieșire personajul chiar merge (walker real), nu doar „există".
 */
import { createHash } from 'node:crypto';
import {
  createCharacterCamera,
  createFleetSwitchState,
  createWalker,
  createWalkingSegments,
  decideFleetFocus,
  decideFleetReturn,
  decideFleetTake,
  type CharacterCameraTarget,
  type CharacterPoint,
  type FleetSwitchState,
  type VehicleEntryVehicle,
  type VehicleExitWorld,
  type WalkWorld,
  type Walker,
  type WalkingSegments,
  type WalkingSegmentsTarget,
} from '../../src/character';
import { createInputAuthorityArbiter, type InputAuthorityArbiter } from '../../src/input';
import type { ControlMode } from '../../src/vehicles';
import {
  cameraControl,
  characterTarget,
  cityCameraObstacles,
  cityCameraWorld,
  vehicleTarget,
} from '../character/character-camera-suite';
import { streetFixture } from '../character/enter-vehicle-suite';
import { exitWorldOf } from '../character/exit-vehicle-suite';

export const V3_FLOW_CONTRACT = '201-v3-validation-flow-v1';
export const V3_FLOW_SESSION = '201-validation';

const CHARACTER_ID = 'character:player-201';
const TAXI_ID = 'vehicle:taxi-201';
const WALK_TICKS_BEFORE = 0;
const SEATED_TICKS = 120;
const WALK_TICKS_AFTER = 60;

export type V3Mode = 'AUTO' | 'MANUAL' | 'LEARNING';

interface FlowFixture {
  readonly walkWorld: WalkWorld;
  readonly exitWorld: VehicleExitWorld;
  readonly character: Readonly<{ entityId: string; positionM: CharacterPoint; yawRad: number }>;
  readonly vehicles: readonly VehicleEntryVehicle[];
}

function fixtureFor(mode: ControlMode): FlowFixture {
  const street = streetFixture(TAXI_ID, 'TAXI', {
    tick: 0,
    controlMode: mode,
    velocityMps: { x: 0, y: 0, z: 0 },
    laneId: 'lane:avenue:southbound',
    maneuverState: 'IDLE',
    routeLaneIds: ['lane:avenue:southbound', 'lane:junction', 'lane:street:dropoff'],
    rideId: 'ride-201',
    rideProgressM: 0,
    appliedProfileVersion: 'profile-201',
  });
  return Object.freeze({
    walkWorld: street.world,
    exitWorld: exitWorldOf(street.world),
    character: Object.freeze({
      entityId: CHARACTER_ID,
      positionM: street.walker.state.positionM,
      yawRad: street.walker.state.yawRad,
    }),
    vehicles: Object.freeze([street.vehicle]),
  });
}

function target(): WalkingSegmentsTarget {
  return Object.freeze({
    sessionId: V3_FLOW_SESSION,
    worldEpoch: 1,
    playerId: 'player-201',
    profileId: 'profile-201',
    baseVersionId: 'style-201',
    learningEpoch: 1,
    learningEligible: true,
  });
}

const characterAuthority = () =>
  Object.freeze({ consumer: 'CHARACTER' as const, characterId: CHARACTER_ID });

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'UNKNOWN_ERROR';
}

interface CaseState {
  readonly id: V3Mode;
  readonly label: string;
  readonly failures: string[];
  readonly ticks: { value: number };
  walker: Walker;
  readonly arbiter: InputAuthorityArbiter;
  readonly camera: ReturnType<typeof createCharacterCamera>;
  readonly segments: WalkingSegments;
  readonly obstacles: ReturnType<typeof cityCameraObstacles>;
  readonly targets: CharacterCameraTarget[];
  fleet: FleetSwitchState;
  vehicle: VehicleEntryVehicle;
  walkerPositionM: CharacterPoint;
}

function expect(state: CaseState, condition: boolean, check: string): void {
  if (!condition) state.failures.push(check);
}

function nextTick(state: CaseState): number {
  state.ticks.value += 1;
  return state.ticks.value;
}

/** O comandă livrată exact o dată, consumatorul verificat de arbitru însuși. */
function deliver(
  state: CaseState,
  result: ReturnType<InputAuthorityArbiter['step']>,
  consumer: 'CHARACTER' | 'VEHICLE',
): void {
  const ports = Object.freeze({
    character: () => undefined,
    vehicle: () => undefined,
  });
  state.arbiter.deliver(result, consumer, ports);
}

function refuse(state: CaseState, action: () => void, expected: string, check: string): void {
  try {
    action();
    expect(state, false, `${check}: expected ${expected}, call succeeded`);
  } catch (error) {
    const code = errorCode(error);
    expect(state, code === expected, `${check}: expected ${expected}, got ${code}`);
  }
}

/** Corpul de flotă este exact cel al walker-ului, ca 195/196 să nu lucreze pe o poziție veche. */
function syncBody(
  fleet: FleetSwitchState,
  body: Readonly<{ positionM: CharacterPoint; yawRad: number }>,
): FleetSwitchState {
  return createFleetSwitchState({
    tick: fleet.tick,
    authority: fleet.authority,
    character: Object.freeze({
      entityId: fleet.character.entityId,
      positionM: body.positionM,
      yawRad: body.yawRad,
    }),
    focusEntityId: fleet.focusEntityId,
    focusSinceTick: fleet.focusSinceTick,
    suspended: fleet.suspended,
    previousEntry: fleet.previousEntry,
    previousExit: fleet.previousExit,
    lastCommand: fleet.lastCommand,
    counts: fleet.counts,
  });
}

function setCharacterTarget(state: CaseState, walker: Walker): void {
  const target = characterTarget(walker.entityId, walker.state.positionM, walker.state.yawRad);
  state.targets[0] = target;
}

/** Un tick de mers: 193 → 192 → 194 → 198, cu distanța reală măsurată. */
function walkTick(state: CaseState, probeDoubleDelivery = false): void {
  const tick = nextTick(state);
  state.arbiter.setAction('throttle', true);
  const result = state.arbiter.step({
    tick,
    characterYawRad: state.walker.state.yawRad,
  });
  expect(
    state,
    result.command.consumer === 'CHARACTER',
    `walk ${tick}: the authoritative command is not CHARACTER`,
  );
  if (result.command.consumer !== 'CHARACTER') return;
  deliver(state, result, 'CHARACTER');
  if (probeDoubleDelivery)
    refuse(
      state,
      () => deliver(state, result, 'VEHICLE'),
      'DOUBLE_DELIVERY_REFUSED',
      `walk ${tick}: a second delivery in the same tick`,
    );
  const before = state.walker.state.positionM;
  const stepped = state.walker.step({
    tick: state.walker.state.tick + 1,
    input: result.command.input,
  });
  const distanceM = Math.hypot(
    stepped.state.positionM.x - before.x,
    stepped.state.positionM.z - before.z,
  );
  state.walkerPositionM = stepped.state.positionM;
  setCharacterTarget(state, state.walker);
  state.camera.step({
    tick,
    authorityEntityId: state.walker.entityId,
    targets: state.targets,
    obstacles: state.obstacles,
  });
  const segments = state.segments.step({
    tick,
    transition: 'WALK',
    authority: characterAuthority(),
    distanceM,
  });
  expect(state, segments.closed === null, `walk ${tick}: walking closed a segment`);
  expect(state, segments.candidates.length === 0, `walk ${tick}: walking produced a candidate`);
}

/** Un tick în mașină: numai comanda 024 a vehiculului, corpul rămâne suspendat. */
function seatedTick(state: CaseState, vehicleId: string): void {
  const tick = nextTick(state);
  const walkerTick = state.walker.state.tick;
  const walkerPosition = state.walker.positionBits();
  state.arbiter.setAction('throttle', true);
  const result = state.arbiter.step({
    tick,
    characterYawRad: state.walker.state.yawRad,
  });
  expect(
    state,
    result.command.consumer === 'VEHICLE' && result.command.vehicleId === vehicleId,
    `seated ${tick}: the authoritative command is not ${vehicleId}`,
  );
  deliver(state, result, 'VEHICLE');
  state.camera.step({
    tick,
    authorityEntityId: vehicleId,
    targets: state.targets,
    obstacles: state.obstacles,
  });
  expect(
    state,
    state.walker.state.tick === walkerTick && state.walker.positionBits() === walkerPosition,
    `seated ${tick}: the suspended body was stepped or moved`,
  );
}

function runCase(id: V3Mode): V3CaseRow {
  const fixture = fixtureFor(id);
  const walkWorld = fixture.walkWorld;
  const start = { positionM: fixture.character.positionM, yawRad: fixture.character.yawRad };
  const walker = createWalker({ world: walkWorld, start, entityId: CHARACTER_ID });
  const arbiter = createInputAuthorityArbiter({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: V3_FLOW_SESSION,
      worldEpoch: 1,
    }),
    authority: characterAuthority(),
  });
  const camera = createCharacterCamera({ world: cityCameraWorld(), control: cameraControl() });
  const obstacles = cityCameraObstacles();
  const segments = createWalkingSegments({
    ownerId: '201',
    characterId: CHARACTER_ID,
    target: target(),
  });
  const taxi = fixture.vehicles[0]!;
  const targets: CharacterCameraTarget[] = [
    characterTarget(walker.entityId, walker.state.positionM, walker.state.yawRad),
    vehicleTarget(taxi.vehicleId, taxi.positionM, taxi.yawRad),
  ];
  const state: CaseState = {
    id,
    label: `mod de plecare ${id}`,
    failures: [],
    ticks: { value: 0 },
    walker,
    arbiter,
    camera,
    segments,
    obstacles,
    targets,
    fleet: createFleetSwitchState({
      tick: 0,
      authority: characterAuthority(),
      character: fixture.character,
    }),
    vehicle: taxi,
    walkerPositionM: walker.state.positionM,
  };

  // 1. Mers real înainte de orice tranziție.
  for (let index = 0; index < WALK_TICKS_BEFORE; index += 1) walkTick(state);
  const walkedBefore = state.walker.stats.distanceM;
  const bodyBeforeTake = state.walker.positionBits();
  // Corpul de flotă urmărește walker-ul real; altfel 195 ar primi o poziție veche.
  state.fleet = syncBody(state.fleet, state.walker.state);

  // 2. FOCUS: camera poate muta, autoritatea și corpul nu.
  const focus = decideFleetFocus({
    tick: nextTick(state),
    state: state.fleet,
    vehicleId: taxi.vehicleId,
    vehicles: fixture.vehicles,
  });
  expect(state, focus.accepted, `focus: refused ${focus.accepted ? '' : String(focus.code)}`);
  if (focus.accepted) {
    state.fleet = focus.state;
    expect(state, focus.bits.identical, 'focus: character position bits changed');
    expect(
      state,
      focus.authority.consumer === 'CHARACTER' && focus.authority.characterId === CHARACTER_ID,
      'focus: authority left the character',
    );
    expect(
      state,
      focus.camera.trackedEntityId === taxi.vehicleId,
      'focus: camera does not track the focused taxi',
    );
    const focusTick = focus.tick;
    const result = state.arbiter.step({
      tick: focusTick,
      characterYawRad: state.walker.state.yawRad,
    });
    deliver(state, result, 'CHARACTER');
    state.camera.step({
      tick: focusTick,
      authorityEntityId: focus.camera.trackedEntityId,
      targets: state.targets,
      obstacles: state.obstacles,
    });
    state.segments.step({
      tick: focusTick,
      transition: 'WALK',
      authority: characterAuthority(),
      distanceM: 0,
    });
  }

  // 3. TAKE = 197 care cheamă 195; mașina intră în MANUAL. Pentru LEARNING, alegerea explicită
  // 067/UI este cea care deschide segmentul LEARNING (198), nu o ghicire a lui 195.
  const segmentMode: 'MANUAL' | 'LEARNING' = id === 'LEARNING' ? 'LEARNING' : 'MANUAL';
  const takeTick = nextTick(state);
  const take = decideFleetTake({
    tick: takeTick,
    state: state.fleet,
    vehicleId: taxi.vehicleId,
    vehicles: fixture.vehicles,
    world: fixture.exitWorld,
    controlled: null,
  });
  expect(state, take.accepted, `take: refused ${take.accepted ? '' : String(take.code)}`);
  if (take.accepted) {
    state.fleet = take.state;
    state.vehicle = take.entry.vehicle;
    expect(state, take.entry.previousMode === id, `take: previousMode is not ${id}`);
    expect(state, take.entry.mode === 'MANUAL', 'take: 195 did not impose MANUAL');
    if (segmentMode === 'LEARNING') {
      // 067 aplică alegerea explicită în același tick; 195 nu a impus-o.
      state.vehicle = Object.freeze({
        ...take.entry.vehicle,
        state: Object.freeze({ ...take.entry.vehicle.state, controlMode: 'LEARNING' as const }),
      });
      expect(
        state,
        state.vehicle.state.controlMode === 'LEARNING',
        'learning: the explicit mode was not applied',
      );
    }
    expect(
      state,
      take.authority.consumer === 'VEHICLE' && take.authority.vehicleId === taxi.vehicleId,
      'take: authority did not move to the taxi',
    );
    expect(
      state,
      take.character.positionBits === bodyBeforeTake,
      'take: the entry moved the character body',
    );
    expect(
      state,
      take.entities.before === take.entities.after,
      'take: the entry changed the entity count',
    );
    expect(state, state.arbiter.setAuthority(take.authority), 'take: 193 did not transition');

    const command = state.arbiter.step({
      tick: takeTick,
      characterYawRad: state.walker.state.yawRad,
    });
    expect(
      state,
      command.command.consumer === 'VEHICLE' && command.command.vehicleId === taxi.vehicleId,
      'take: the entry tick still commands the character',
    );
    deliver(state, command, 'VEHICLE');
    refuse(
      state,
      () => deliver(state, command, 'CHARACTER'),
      'DOUBLE_DELIVERY_REFUSED',
      'take: a second delivery in the same tick',
    );
    state.camera.step({
      tick: takeTick,
      authorityEntityId: take.camera.trackedEntityId,
      targets: state.targets,
      obstacles: state.obstacles,
    });
    const opened = state.segments.step({
      tick: takeTick,
      transition: 'ENTER',
      authority: take.authority,
      previousAuthority: take.previousAuthority,
      vehicleId: taxi.vehicleId,
      mode: segmentMode,
      maneuverState: null,
    });
    expect(
      state,
      opened.opened?.kind === segmentMode,
      `take: the opened segment is not ${segmentMode}`,
    );
    expect(
      state,
      state.segments.getStats().openSegmentId === opened.opened?.segmentId,
      'take: the segment is not open after the entry',
    );
  }

  // 4. Conducerea nu avansează aici: 198 este un read model al tranzițiilor, deci primește exact
  // tick-ul intrării și tick-ul ieșirii. Comanda din tick-ul TAKE aparține exclusiv vehiculului,
  // iar o conducere lungă este dovedită separat de `runSeatedControl`.
  if (id === 'LEARNING') {
    // Comutarea explicită 067 are loc înainte de ieșire; 195 nu a impus niciodată LEARNING.
    state.vehicle = Object.freeze({
      ...state.vehicle,
      state: Object.freeze({ ...state.vehicle.state, controlMode: 'LEARNING' as const }),
    });
    expect(state, state.vehicle.state.controlMode === 'LEARNING', 'learning: mode change refused');
  }

  // 5. RETURN = 197 care cheamă 196; mașina revine în AUTO, personajul iese.
  const returnTick = nextTick(state);
  const returned = decideFleetReturn({
    tick: returnTick,
    state: state.fleet,
    vehicles: fixture.vehicles,
    world: fixture.exitWorld,
    controlled: Object.freeze({
      vehicle: state.vehicle,
      preTakeover: fixture.vehicles[0]!,
    }),
  });
  expect(
    state,
    returned.accepted,
    `return: refused ${returned.accepted ? '' : String(returned.code)}`,
  );
  let exitBits: string | null = null;
  let exitStart: Readonly<{ positionM: CharacterPoint; yawRad: number }> | null = null;
  if (returned.accepted) {
    state.fleet = returned.state;
    exitBits = returned.resume.positionBits;
    exitStart = Object.freeze({
      positionM: returned.resume.positionM,
      yawRad: returned.resume.yawRad,
    });
    expect(
      state,
      returned.exit.accepted && returned.exit.vehicle.state.controlMode === 'AUTO',
      'return: the released taxi is not AUTO',
    );
    expect(
      state,
      returned.exit.previousMode === state.vehicle.state.controlMode,
      'return: 196 reports another previous mode',
    );
    expect(
      state,
      returned.authority.consumer === 'CHARACTER' &&
        returned.authority.characterId === CHARACTER_ID,
      'return: authority did not return to the character',
    );
    expect(
      state,
      returned.entities.before === returned.entities.after,
      'return: the exit changed the entity count',
    );
    expect(state, state.arbiter.setAuthority(returned.authority), 'return: 193 did not transition');

    const command = state.arbiter.step({
      tick: returnTick,
      characterYawRad: state.walker.state.yawRad,
    });
    expect(
      state,
      command.command.consumer === 'CHARACTER',
      'return: the exit tick still commands the vehicle',
    );
    deliver(state, command, 'CHARACTER');
    refuse(
      state,
      () => deliver(state, command, 'VEHICLE'),
      'DOUBLE_DELIVERY_REFUSED',
      'return: a second delivery in the same tick',
    );
    state.camera.step({
      tick: returnTick,
      authorityEntityId: returned.camera.trackedEntityId,
      targets: state.targets,
      obstacles: state.obstacles,
    });
    const closed = state.segments.step({
      tick: returnTick,
      transition: 'EXIT',
      authority: returned.authority,
      previousAuthority: returned.previousAuthority,
      vehicleId: taxi.vehicleId,
      maneuverState: null,
    });
    const expectedKind = state.vehicle.state.controlMode;
    expect(
      state,
      closed.closed?.kind === expectedKind,
      `return: the closed segment is not ${expectedKind}`,
    );
    expect(
      state,
      closed.closed?.closeReason === 'RETURN_TO_AUTO',
      'return: the close reason is not RETURN_TO_AUTO',
    );
    expect(
      state,
      closed.candidates.length === (expectedKind === 'LEARNING' ? 1 : 0),
      `return: the ${expectedKind} candidate count is wrong`,
    );
    expect(state, closed.opened === null, 'return: an exit opened a new segment');
    expect(
      state,
      state.segments.getStats().openSegmentId === null,
      'return: a segment is still open',
    );
  }

  // 6. Imediat după ieșire, fluxul funcționează din nou: FOCUS + TAKE pe taxiul eliberat în AUTO,
  // urmat de o a doua ieșire. Corpul nu se mișcă între ele, deci 195 are aceeași poziție reală.
  let reentry = 'NOT_RUN';
  let exitStartFinal: Readonly<{ positionM: CharacterPoint; yawRad: number }> | null = exitStart;
  let exitBitsFinal = exitBits;
  if (returned.accepted) {
    const releasedVehicle = returned.exit.accepted ? returned.exit.vehicle : taxi;
    const releasedFleet = fixture.vehicles.map((vehicle) =>
      vehicle.vehicleId === releasedVehicle.vehicleId ? releasedVehicle : vehicle,
    );
    const focusTick2 = nextTick(state);
    const focusAgain = decideFleetFocus({
      tick: focusTick2,
      state: state.fleet,
      vehicleId: taxi.vehicleId,
      vehicles: releasedFleet,
    });
    expect(
      state,
      focusAgain.accepted,
      `re-entry: focus refused ${focusAgain.accepted ? '' : String(focusAgain.code)}`,
    );
    state.segments.step({
      tick: focusTick2,
      transition: 'WALK',
      authority: characterAuthority(),
      distanceM: 0,
    });
    state.arbiter.setAction('throttle', false);
    const focusCommand = state.arbiter.step({
      tick: focusTick2,
      characterYawRad: state.walker.state.yawRad,
    });
    deliver(state, focusCommand, 'CHARACTER');
    state.camera.step({
      tick: focusTick2,
      authorityEntityId: focusAgain.accepted
        ? focusAgain.camera.trackedEntityId
        : state.walker.entityId,
      targets: state.targets,
      obstacles: state.obstacles,
    });
    const againTick = nextTick(state);
    if (focusAgain.accepted) {
      const takeAgain = decideFleetTake({
        tick: againTick,
        state: focusAgain.state,
        vehicleId: taxi.vehicleId,
        vehicles: releasedFleet,
        world: fixture.exitWorld,
        controlled: null,
      });
      if (takeAgain.accepted) {
        state.fleet = takeAgain.state;
        expect(
          state,
          takeAgain.entry.previousMode === 'AUTO',
          're-entry: the AUTO car reports another previous mode',
        );
        expect(state, takeAgain.entry.mode === 'MANUAL', 're-entry: the car did not enter MANUAL');
        expect(
          state,
          takeAgain.authority.consumer === 'VEHICLE',
          're-entry: authority did not move to the car',
        );
        state.arbiter.setAuthority(takeAgain.authority);
        const command = state.arbiter.step({
          tick: againTick,
          characterYawRad: state.walker.state.yawRad,
        });
        deliver(state, command, 'VEHICLE');
        state.camera.step({
          tick: againTick,
          authorityEntityId: takeAgain.camera.trackedEntityId,
          targets: state.targets,
          obstacles: state.obstacles,
        });
        const opened = state.segments.step({
          tick: againTick,
          transition: 'ENTER',
          authority: takeAgain.authority,
          previousAuthority: takeAgain.previousAuthority,
          vehicleId: taxi.vehicleId,
          mode: takeAgain.entry.mode,
          maneuverState: null,
        });
        expect(
          state,
          opened.opened?.kind === 'MANUAL',
          're-entry: the reopened segment is not MANUAL',
        );
        reentry = 'ACCEPTED';

        const returnTick2 = nextTick(state);
        const returnedAgain = decideFleetReturn({
          tick: returnTick2,
          state: takeAgain.state,
          vehicles: releasedFleet,
          world: fixture.exitWorld,
          controlled: Object.freeze({
            vehicle: takeAgain.entry.vehicle,
            preTakeover: releasedVehicle,
          }),
        });
        expect(
          state,
          returnedAgain.accepted,
          `re-entry: the second return failed ${returnedAgain.accepted ? '' : String(returnedAgain.code)}`,
        );
        if (returnedAgain.accepted) {
          state.fleet = returnedAgain.state;
          exitBitsFinal = returnedAgain.resume.positionBits;
          exitStartFinal = Object.freeze({
            positionM: returnedAgain.resume.positionM,
            yawRad: returnedAgain.resume.yawRad,
          });
          expect(
            state,
            returnedAgain.exit.vehicle.state.controlMode === 'AUTO',
            're-entry: the second release is not AUTO',
          );
          state.arbiter.setAuthority(returnedAgain.authority);
          const back = state.arbiter.step({
            tick: returnTick2,
            characterYawRad: state.walker.state.yawRad,
          });
          expect(
            state,
            back.command.consumer === 'CHARACTER',
            're-entry: the second exit still commands the vehicle',
          );
          deliver(state, back, 'CHARACTER');
          state.camera.step({
            tick: returnTick2,
            authorityEntityId: returnedAgain.camera.trackedEntityId,
            targets: state.targets,
            obstacles: state.obstacles,
          });
          const closedAgain = state.segments.step({
            tick: returnTick2,
            transition: 'EXIT',
            authority: returnedAgain.authority,
            previousAuthority: returnedAgain.previousAuthority,
            vehicleId: taxi.vehicleId,
            maneuverState: null,
          });
          expect(
            state,
            closedAgain.closed?.kind === 'MANUAL' &&
              closedAgain.closed.closeReason === 'RETURN_TO_AUTO',
            're-entry: the second segment did not close MANUAL/RETURN_TO_AUTO',
          );
          expect(
            state,
            closedAgain.candidates.length === 0,
            're-entry: a MANUAL segment produced an estimator candidate',
          );
        }
      } else reentry = `REFUSED:${takeAgain.code}`;
    } else reentry = `FOCUS_REFUSED:${focusAgain.code}`;
  }
  expect(state, reentry === 'ACCEPTED', `re-entry: ${reentry}`);

  // 7. După ieșire, personajul chiar merge: walker real pornit din punctul 196. Acceleratorul ținut
  // peste tranziție este neutralizat de 193; eliberarea este evenimentul care îl reactivează.
  let walkedAfter = 0;
  if (exitStartFinal !== null) {
    state.walker = createWalker({
      world: walkWorld,
      start: exitStartFinal,
      entityId: CHARACTER_ID,
    });
    state.arbiter.releaseAll();
    state.targets[0] = characterTarget(
      state.walker.entityId,
      state.walker.state.positionM,
      state.walker.state.yawRad,
    );
    for (let index = 0; index < WALK_TICKS_AFTER; index += 1) walkTick(state, index === 0);
    walkedAfter = state.walker.stats.distanceM;
    expect(state, walkedAfter > 0, 'after exit: the character does not walk');
    expect(
      state,
      state.walker.positionBits() !== exitBitsFinal,
      'after exit: the character stayed at the exit point',
    );
  }

  return Object.freeze({
    id,
    label: state.label,
    verdict: state.failures.length === 0 ? 'PASS' : 'FAIL',
    failedChecks: Object.freeze([...state.failures]),
    ticks: state.ticks.value,
    walkedBeforeM: walkedBefore,
    walkedAfterM: walkedAfter,
    exitPositionBits: exitBits,
    reentry,
    counters: state.segments.getStats().counters,
    walker: Object.freeze({
      ticks: state.walker.stats.ticks,
      distanceM: state.walker.stats.distanceM,
      positionWrites: state.walker.stats.positionWrites,
      vehicleBodiesCreated: state.walker.stats.vehicleBodiesCreated,
    }),
    authority: Object.freeze({
      transitions: state.arbiter.getStats().transitions,
      delivered: state.arbiter.getStats().delivered,
      refused: state.arbiter.getStats().refused,
    }),
    camera: Object.freeze({
      transitions: state.camera.stats.transitions,
      entityClones: state.camera.stats.entityClones,
      targetWrites: state.camera.stats.targetWrites,
    }),
  });
}

/**
 * Conducere lungă, fără modelul de segmente: 193 + 194 pe 120 de tick-uri cu autoritatea pe mașină.
 * Dovedește că inputul rămâne singular și că corpul personajului nu este atins cât timp stă în scaun.
 */
function runSeatedControl(mode: V3Mode): V3SeatedRow {
  const fixture = fixtureFor(mode);
  const walker = createWalker({
    world: fixture.walkWorld,
    start: { positionM: fixture.character.positionM, yawRad: fixture.character.yawRad },
    entityId: CHARACTER_ID,
  });
  const arbiter = createInputAuthorityArbiter({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: V3_FLOW_SESSION,
      worldEpoch: 1,
    }),
    authority: characterAuthority(),
  });
  const camera = createCharacterCamera({ world: cityCameraWorld(), control: cameraControl() });
  const obstacles = cityCameraObstacles();
  const segments = createWalkingSegments({
    ownerId: '201-seated',
    characterId: CHARACTER_ID,
    target: target(),
  });
  const taxi = fixture.vehicles[0]!;
  const targets: CharacterCameraTarget[] = [
    characterTarget(walker.entityId, walker.state.positionM, walker.state.yawRad),
    vehicleTarget(taxi.vehicleId, taxi.positionM, taxi.yawRad),
  ];
  const state: CaseState = {
    id: mode,
    label: `conducere ${mode}`,
    failures: [],
    ticks: { value: 0 },
    walker,
    arbiter,
    camera,
    segments,
    obstacles,
    targets,
    fleet: createFleetSwitchState({
      tick: 0,
      authority: characterAuthority(),
      character: fixture.character,
    }),
    vehicle: taxi,
    walkerPositionM: walker.state.positionM,
  };
  const walkerTickBefore = walker.state.tick;
  const walkerBitsBefore = walker.positionBits();
  const takeTick = nextTick(state);
  const take = decideFleetTake({
    tick: takeTick,
    state: state.fleet,
    vehicleId: taxi.vehicleId,
    vehicles: fixture.vehicles,
    world: fixture.exitWorld,
    controlled: null,
  });
  expect(state, take.accepted, `seated ${mode}: TAKE refused`);
  if (!take.accepted)
    return Object.freeze({
      mode,
      verdict: 'FAIL',
      failedChecks: Object.freeze([...state.failures]),
      ticks: 0,
      vehicleCommands: 0,
      characterCommands: 0,
      inactiveRefusals: 0,
      walkerTicks: 0,
      cameraTransitions: 0,
    });
  state.fleet = take.state;
  state.vehicle =
    mode === 'LEARNING'
      ? Object.freeze({
          ...take.entry.vehicle,
          state: Object.freeze({ ...take.entry.vehicle.state, controlMode: 'LEARNING' as const }),
        })
      : take.entry.vehicle;
  state.arbiter.setAuthority(take.authority);
  const first = state.arbiter.step({ tick: takeTick, characterYawRad: walker.state.yawRad });
  deliver(state, first, 'VEHICLE');
  state.camera.step({
    tick: takeTick,
    authorityEntityId: take.camera.trackedEntityId,
    targets: state.targets,
    obstacles: state.obstacles,
  });
  for (let index = 0; index < SEATED_TICKS; index += 1) seatedTick(state, taxi.vehicleId);
  const refusalsBefore = state.arbiter.getStats().refused.inactiveConsumer;
  const probeTick = nextTick(state);
  const probe = state.arbiter.step({ tick: probeTick, characterYawRad: walker.state.yawRad });
  refuse(
    state,
    () => deliver(state, probe, 'CHARACTER'),
    'INACTIVE_CONSUMER_REFUSED',
    `seated ${mode}: the character is still active while seated`,
  );
  const seated = state.arbiter.getStats();
  expect(
    state,
    seated.delivered.CHARACTER === 0,
    `seated ${mode}: the character received a command while seated`,
  );
  expect(
    state,
    seated.delivered.VEHICLE === SEATED_TICKS + 1,
    `seated ${mode}: the vehicle command count is not ${SEATED_TICKS + 1}`,
  );
  expect(
    state,
    walker.state.tick === walkerTickBefore && walker.positionBits() === walkerBitsBefore,
    `seated ${mode}: the suspended body moved`,
  );
  expect(
    state,
    walker.stats.vehicleBodiesCreated === 0,
    `seated ${mode}: the walker created a body`,
  );
  return Object.freeze({
    mode,
    verdict: state.failures.length === 0 ? 'PASS' : 'FAIL',
    failedChecks: Object.freeze([...state.failures]),
    ticks: SEATED_TICKS + 2,
    vehicleCommands: seated.delivered.VEHICLE,
    characterCommands: seated.delivered.CHARACTER,
    inactiveRefusals: seated.refused.inactiveConsumer - refusalsBefore,
    walkerTicks: walker.state.tick - walkerTickBefore,
    cameraTransitions: state.camera.stats.transitions,
  });
}

export interface V3SeatedRow {
  readonly mode: V3Mode;
  readonly verdict: 'PASS' | 'FAIL';
  readonly failedChecks: readonly string[];
  readonly ticks: number;
  readonly vehicleCommands: number;
  readonly characterCommands: number;
  readonly inactiveRefusals: number;
  readonly walkerTicks: number;
  readonly cameraTransitions: number;
}

export interface V3CaseRow {
  readonly id: V3Mode;
  readonly label: string;
  readonly verdict: 'PASS' | 'FAIL';
  readonly failedChecks: readonly string[];
  readonly ticks: number;
  readonly walkedBeforeM: number;
  readonly walkedAfterM: number;
  readonly exitPositionBits: string | null;
  readonly reentry: string;
  readonly counters: ReturnType<WalkingSegments['getStats']>['counters'];
  readonly walker: Readonly<{
    ticks: number;
    distanceM: number;
    positionWrites: number;
    vehicleBodiesCreated: number;
  }>;
  readonly authority: Readonly<{
    transitions: number;
    delivered: Readonly<{ CHARACTER: number; VEHICLE: number }>;
    refused: Readonly<{ doubleDelivery: number; inactiveConsumer: number; staleResult: number }>;
  }>;
  readonly camera: Readonly<{
    transitions: number;
    entityClones: number;
    targetWrites: number;
  }>;
}

export interface V3FlowReport {
  readonly contract: string;
  readonly command: string;
  readonly session: string;
  readonly ticksPerCase: number;
  readonly cases: readonly V3CaseRow[];
  readonly seated: readonly V3SeatedRow[];
  readonly summary: Readonly<{
    cases: number;
    passed: number;
    seatedCases: number;
    seatedPassed: number;
    modes: readonly V3Mode[];
    pass: boolean;
    determinism: boolean;
    digest: string;
  }>;
  readonly limitations: readonly string[];
}

function build(): Omit<V3FlowReport, 'summary'> & { readonly basePass: boolean } {
  const cases = (['AUTO', 'MANUAL', 'LEARNING'] as const).map((mode) => runCase(mode));
  const seated = (['AUTO', 'MANUAL', 'LEARNING'] as const).map((mode) => runSeatedControl(mode));
  return {
    contract: V3_FLOW_CONTRACT,
    command: 'npm run qa:v3-validation',
    session: V3_FLOW_SESSION,
    ticksPerCase: WALK_TICKS_BEFORE + WALK_TICKS_AFTER + 6,
    cases,
    seated,
    basePass:
      cases.every((entry) => entry.verdict === 'PASS') &&
      seated.every((entry) => entry.verdict === 'PASS'),
    limitations: [
      'Lanțul este headless și determinist: nu creează scenă Babylon, GPU sau input uman; el dovedește contractele 192/193/194/195/196/197/198, nu feel-ul în browser.',
      'Modul LEARNING este comutat explicit în timpul conducerii, exact cum ar face-o controlul 067; contractul 195 nu impune niciodată LEARNING.',
      'Corpul personajului este suspendat cât timp autoritatea este pe mașină; la ieșire este reluat din punctul valid al lui 196, nu mutat pas cu pas.',
      'Viteza mașinii în scenariu este zero: ieșirea dintr-o mașină în mișcare are propriul refuz VEHICLE_MOVING, dovedit de PBI 196, și nu este rescris aici.',
    ],
  };
}

/** Două rulări identice; cifrele nu depind de timp de perete. */
export function runV3FlowValidation(): V3FlowReport {
  const first = build();
  const digest = createDigest(first);
  const second = build();
  const determinism = digest === createDigest(second) && first.basePass === second.basePass;
  return Object.freeze({
    contract: first.contract,
    command: first.command,
    session: first.session,
    ticksPerCase: first.ticksPerCase,
    cases: first.cases,
    seated: first.seated,
    limitations: first.limitations,
    summary: Object.freeze({
      cases: first.cases.length,
      passed: first.cases.filter((entry) => entry.verdict === 'PASS').length,
      seatedCases: first.seated.length,
      seatedPassed: first.seated.filter((entry) => entry.verdict === 'PASS').length,
      modes: Object.freeze(['AUTO', 'MANUAL', 'LEARNING'] as const),
      pass: first.basePass && determinism,
      determinism,
      digest,
    }),
  });
}

function createDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
