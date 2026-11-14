/**
 * PBI 197 — deterministic evidence suite for the quick taxi switch and the return to walking.
 *
 * Everything is derived from delivered contracts: the character is a real PBI 192 walker (on the
 * real PBI 042 city for the take/return fixtures and on an explicit open lot for the 200 m focus),
 * the cars carry the real PBI 022/145 collider and the PBI 024/061 state, and the camera proof drives
 * the real PBI 194 camera. The suite never re-implements a transition: TAKE and RETURN call the
 * delivered 195/196 decisions, and the report shows their own refusals.
 *
 * Criterion 1 is structural. The 200 m FOCUS row compares the character position as IEEE-754 bytes
 * before and after, counts the entities, and drives the real camera onto the new `entityId` for the
 * 18-tick transition; the distance the body could have moved is measured as zero.
 *
 * Criterion 2 is the projection. Every relevant combination is built and validated, and the
 * inconsistent ones are handed to the guard, which must refuse them.
 */
import { createHash } from 'node:crypto';
import {
  CHARACTER_CAMERA_POLICY,
  FLEET_SWITCH_CONTRACT_VERSION,
  FLEET_SWITCH_POLICY,
  characterPositionBits,
  createCharacterAsset,
  createCharacterCamera,
  createFleetSwitchState,
  createRectanglePolygon,
  createWalkWorld,
  createWalker,
  decideFleetFocus,
  decideFleetReturn,
  decideFleetTake,
  fleetSwitchProjection,
  fleetSwitchSnapshot,
  parseFleetSwitchState,
  validateFleetSwitchProjection,
  type CharacterCameraTarget,
  type CharacterPoint,
  type FleetSwitchProjection,
  type FleetSwitchState,
  type VehicleEntryVehicle,
  type VehicleExitWorld,
  type WalkBlocker,
  type WalkWorld,
} from '../../src/character';
import { exitWorldOf, manual, walkWorldOf } from './exit-vehicle-suite';
import { entryVehicle, streetFixture } from './enter-vehicle-suite';
import { cameraControl } from './character-camera-suite';
import {
  measurePenetration,
  realWalkWorld,
  sedanWalkFootprint,
  SIDEWALK_ELEVATION_M,
} from './walk-world';

export const FLEET_SWITCH_REPORT_CONTRACT = FLEET_SWITCH_CONTRACT_VERSION;
export const FLEET_SWITCH_REPORT_COMMAND = 'npm run fleet:switch';

const FOCUS_TICK = 500;
const TAKE_TICK = 560;
const RETURN_TICK = 620;
const LOT_HALF_M = 320;
const MEASURED = createCharacterAsset().measured;
const CAPSULE = Object.freeze({
  radiusM: Math.max(MEASURED.footprintWidthM, MEASURED.footprintDepthM) / 2,
  heightM: MEASURED.heightM,
});

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

/** An open street lot: the policy fixture for a car 200 m away or two cars parked side by side. */
function lotWorld(): WalkWorld {
  return createWalkWorld({
    surfaces: [
      {
        id: 'fixture:lot',
        kind: 'STREET',
        topM: 0,
        vertices: [
          { x: -LOT_HALF_M, z: -LOT_HALF_M },
          { x: LOT_HALF_M, z: -LOT_HALF_M },
          { x: LOT_HALF_M, z: LOT_HALF_M },
          { x: -LOT_HALF_M, z: LOT_HALF_M },
        ],
      },
    ],
    blockers: [],
    defaultGroundM: 0,
  });
}

function taxiState(overrides: Partial<VehicleEntryVehicle['state']> = {}) {
  return {
    controlMode: 'LEARNING' as const,
    laneId: 'lane:avenue:southbound',
    maneuverState: 'FOLLOWING' as const,
    routeLaneIds: ['lane:avenue:southbound', 'lane:junction', 'lane:street:dropoff'],
    rideId: 'ride-061-197',
    rideProgressM: 412.5,
    appliedProfileVersion: 'profile-version-197',
    ...overrides,
  };
}

interface FleetFixture {
  readonly world: VehicleExitWorld;
  readonly walkWorld: WalkWorld;
  readonly character: Readonly<{ entityId: string; positionM: CharacterPoint; yawRad: number }>;
  readonly vehicles: readonly VehicleEntryVehicle[];
}

/** The character on the real roadway 0.30 m from a taxi driver door, exactly as in PBI 195. */
export function nearFixture(id = 'vehicle:taxi-197'): FleetFixture {
  const street = streetFixture(id, 'TAXI', taxiState());
  return Object.freeze({
    world: exitWorldOf(street.world),
    walkWorld: street.world,
    character: Object.freeze({
      entityId: street.walker.entityId,
      positionM: street.walker.state.positionM,
      yawRad: street.walker.state.yawRad,
    }),
    vehicles: Object.freeze([street.vehicle]),
  });
}

/** The character on an open lot with a taxi exactly 200 m away: FOCUS must still work. */
export function distantFixture(): FleetFixture {
  const world = lotWorld();
  const walker = createWalker({ world, start: { positionM: point(0, 0, 0), yawRad: 0 } });
  const taxi = entryVehicle('vehicle:far-197', 'TAXI', point(0, 0, 200), 0, taxiState());
  return Object.freeze({
    world: exitWorldOf(world),
    walkWorld: world,
    character: Object.freeze({
      entityId: walker.entityId,
      positionM: walker.state.positionM,
      yawRad: walker.state.yawRad,
    }),
    vehicles: Object.freeze([taxi]),
  });
}

export function stateOf(fixture: FleetFixture, tick = 0): FleetSwitchState {
  return createFleetSwitchState({
    tick,
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: fixture.character.entityId,
    }),
    character: fixture.character,
  });
}

export function seatedStateOf(
  fixture: FleetFixture,
  vehicleId: string,
  tick = 0,
): FleetSwitchState {
  return createFleetSwitchState({
    tick,
    authority: Object.freeze({ consumer: 'VEHICLE' as const, vehicleId }),
    character: fixture.character,
    suspended: Object.freeze({
      positionM: fixture.character.positionM,
      yawRad: fixture.character.yawRad,
      tick,
    }),
  });
}

export function takeRequest(
  fixture: FleetFixture,
  state: FleetSwitchState,
  vehicleId: string,
  tick: number,
  controlled: Parameters<typeof decideFleetTake>[0]['controlled'] = null,
) {
  return Object.freeze({
    tick,
    state,
    vehicleId,
    vehicles: fixture.vehicles,
    world: fixture.world,
    controlled,
  });
}

export function returnRequest(
  fixture: FleetFixture,
  state: FleetSwitchState,
  controlled: Parameters<typeof decideFleetReturn>[0]['controlled'],
  tick: number,
) {
  return Object.freeze({
    tick,
    state,
    vehicles: fixture.vehicles,
    world: fixture.world,
    controlled,
  });
}

/** A building box over the remembered body point, between the car flank and the kerb. */
function wallOverBodyPoint(): Readonly<{ id: string; blocker: WalkBlocker }> {
  const street = streetFixture('vehicle:taxi-197', 'TAXI', taxiState());
  const outward = street.outwardM;
  const door = street.doorM;
  const along = Object.freeze({ x: outward.z, z: -outward.x });
  const halfOutM = 0.55;
  const halfAlongM = 3;
  const id = 'wall:built-over-body-197';
  const centre = Object.freeze({ x: door.x - outward.x * 0.65, z: door.z - outward.z * 0.65 });
  return Object.freeze({
    id,
    blocker: Object.freeze({
      id,
      kind: 'BUILDING' as const,
      bottomM: 0,
      topM: 4,
      marginM: 0.05,
      polygon: createRectanglePolygon(id, centre, {
        x: Math.abs(outward.x) * halfOutM + Math.abs(along.x) * halfAlongM,
        z: Math.abs(outward.z) * halfOutM + Math.abs(along.z) * halfAlongM,
      }),
    }),
  });
}

interface ReturnBranch {
  readonly id: 'resume' | 'wall';
  readonly fixture: FleetFixture;
  readonly wallId: string | null;
  readonly taken: Extract<ReturnType<typeof decideFleetTake>, { accepted: true }>;
  readonly returned: Extract<ReturnType<typeof decideFleetReturn>, { accepted: true }>;
}

/**
 * TAKE the taxi, then RETURN. In the wall branch a real building box is put over the remembered body
 * point in the meantime, so 196 has to leave through the other flank and the body may not resume.
 */
export function returnBranch(id: 'resume' | 'wall'): ReturnBranch {
  const base = nearFixture();
  const taken = decideFleetTake(takeRequest(base, stateOf(base), 'vehicle:taxi-197', TAKE_TICK));
  if (!taken.accepted)
    throw new Error(`Return fixture take refused: ${taken.code} / ${String(taken.cause)}`);
  let fixture = base;
  let wallId: string | null = null;
  if (id === 'wall') {
    const wall = wallOverBodyPoint();
    wallId = wall.id;
    fixture = Object.freeze({
      world: exitWorldOf(base.walkWorld, [wall.blocker]),
      walkWorld: base.walkWorld,
      character: taken.state.character,
      vehicles: base.vehicles,
    });
  }
  const controlled = Object.freeze({
    vehicle: taken.entry.vehicle,
    preTakeover: base.vehicles[0]!,
  });
  const returned = decideFleetReturn(returnRequest(fixture, taken.state, controlled, RETURN_TICK));
  if (!returned.accepted)
    throw new Error(`Return fixture refused: ${returned.code} / ${String(returned.cause)}`);
  return Object.freeze({ id, fixture, wallId, taken, returned });
}

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly command: 'FOCUS' | 'TAKE' | 'RETURN';
  readonly before: FleetSwitchState;
  readonly entitiesBefore: number;
  readonly decision:
    | ReturnType<typeof decideFleetFocus>
    | ReturnType<typeof decideFleetTake>
    | ReturnType<typeof decideFleetReturn>;
  readonly expected:
    | Readonly<{ accepted: true; resumeSource?: string }>
    | Readonly<{ accepted: false; code: string; cause?: string }>;
}

function scenarioList(): readonly Scenario[] {
  const near = nearFixture();
  const far = distantFixture();
  const nearState = stateOf(near);
  const farState = stateOf(far);
  const nearEntities = near.vehicles.length + 1;

  const focusedNear = decideFleetFocus({
    tick: FOCUS_TICK,
    state: nearState,
    vehicleId: 'vehicle:taxi-197',
    vehicles: near.vehicles,
  });
  const focusedFar = decideFleetFocus({
    tick: FOCUS_TICK,
    state: farState,
    vehicleId: 'vehicle:far-197',
    vehicles: far.vehicles,
  });
  const focusedTwice = focusedFar.accepted
    ? decideFleetFocus({
        tick: FOCUS_TICK + 10,
        state: focusedFar.state,
        vehicleId: 'vehicle:far-197',
        vehicles: far.vehicles,
      })
    : focusedFar;
  const focusedUnknown = decideFleetFocus({
    tick: FOCUS_TICK,
    state: farState,
    vehicleId: 'vehicle:missing-197',
    vehicles: far.vehicles,
  });
  const focusedThenTaken = focusedNear.accepted
    ? decideFleetTake(takeRequest(near, focusedNear.state, 'vehicle:taxi-197', TAKE_TICK))
    : focusedNear;
  const distantTake = decideFleetTake(takeRequest(far, farState, 'vehicle:far-197', TAKE_TICK));
  const immobilized = Object.freeze({
    ...near.vehicles[0]!,
    availability: 'IMMOBILIZED' as const,
  });
  const immobilizedTake = decideFleetTake(
    takeRequest(
      Object.freeze({ ...near, vehicles: Object.freeze([immobilized]) }),
      nearState,
      immobilized.vehicleId,
      TAKE_TICK,
    ),
  );
  const seatedState = seatedStateOf(near, 'vehicle:taxi-197', FOCUS_TICK);
  const sameVehicleTake = decideFleetTake(
    takeRequest(
      near,
      seatedState,
      'vehicle:taxi-197',
      TAKE_TICK,
      Object.freeze({
        vehicle: manual(near.vehicles[0]!, { tick: TAKE_TICK - 1 }),
        preTakeover: near.vehicles[0]!,
      }),
    ),
  );
  const resumed = returnBranch('resume');
  const walled = returnBranch('wall');
  const notControlled = decideFleetReturn(
    returnRequest(
      near,
      nearState,
      Object.freeze({
        vehicle: manual(near.vehicles[0]!, { tick: RETURN_TICK - 1 }),
        preTakeover: near.vehicles[0]!,
      }),
      RETURN_TICK,
    ),
  );
  const doubleCommand = focusedFar.accepted
    ? decideFleetTake(takeRequest(far, focusedFar.state, 'vehicle:far-197', FOCUS_TICK))
    : focusedFar;

  return Object.freeze([
    {
      id: 'focus-distant',
      label: 'FOCUS a taxi 200 m away; the camera may jump, the body may not',
      command: 'FOCUS',
      before: farState,
      entitiesBefore: 2,
      decision: focusedFar,
      expected: Object.freeze({ accepted: true as const }),
    },
    {
      id: 'focus-near',
      label: 'FOCUS the taxi at the kerb; the authority stays with the character',
      command: 'FOCUS',
      before: nearState,
      entitiesBefore: nearEntities,
      decision: focusedNear,
      expected: Object.freeze({ accepted: true as const }),
    },
    {
      id: 'focus-same',
      label: 'A second FOCUS on the already followed taxi is refused explicitly',
      command: 'FOCUS',
      before: focusedFar.accepted ? focusedFar.state : farState,
      entitiesBefore: 2,
      decision: focusedTwice,
      expected: Object.freeze({ accepted: false as const, code: 'SAME_ENTITY' }),
    },
    {
      id: 'focus-unknown',
      label: 'FOCUS on an id outside the fleet list is refused with a code',
      command: 'FOCUS',
      before: farState,
      entitiesBefore: 2,
      decision: focusedUnknown,
      expected: Object.freeze({ accepted: false as const, code: 'UNKNOWN_VEHICLE' }),
    },
    {
      id: 'take-after-focus',
      label: 'TAKE the focused taxi 60 ticks later: the real 195 entry, no extra camera move',
      command: 'TAKE',
      before: focusedNear.accepted ? focusedNear.state : nearState,
      entitiesBefore: nearEntities,
      decision: focusedThenTaken,
      expected: Object.freeze({ accepted: true as const }),
    },
    {
      id: 'take-distant',
      label: 'TAKE a taxi 200 m away is refused by the real 195 reach rule',
      command: 'TAKE',
      before: farState,
      entitiesBefore: 2,
      decision: distantTake,
      expected: Object.freeze({
        accepted: false as const,
        code: 'TAKE_REFUSED',
        cause: 'OUT_OF_RANGE',
      }),
    },
    {
      id: 'take-immobilized',
      label: 'TAKE an IMMOBILIZED taxi keeps the delivered 023 refusal',
      command: 'TAKE',
      before: nearState,
      entitiesBefore: nearEntities,
      decision: immobilizedTake,
      expected: Object.freeze({
        accepted: false as const,
        code: 'TAKE_REFUSED',
        cause: 'VEHICLE_UNAVAILABLE',
      }),
    },
    {
      id: 'take-same-vehicle',
      label: 'TAKE the car already held is refused as SAME_VEHICLE',
      command: 'TAKE',
      before: seatedState,
      entitiesBefore: nearEntities,
      decision: sameVehicleTake,
      expected: Object.freeze({ accepted: false as const, code: 'SAME_VEHICLE' }),
    },
    {
      id: 'return-resume',
      label: 'RETURN with a still valid remembered point resumes it bit for bit',
      command: 'RETURN',
      before: resumed.taken.state,
      entitiesBefore: nearEntities,
      decision: resumed.returned,
      expected: Object.freeze({ accepted: true as const, resumeSource: 'PREVIOUS_POSITION' }),
    },
    {
      id: 'return-wall',
      label: 'A building over the remembered point forces the valid 196 exit, no teleport',
      command: 'RETURN',
      before: walled.taken.state,
      entitiesBefore: nearEntities,
      decision: walled.returned,
      expected: Object.freeze({ accepted: true as const, resumeSource: 'EXIT_POINT' }),
    },
    {
      id: 'return-not-controlled',
      label: 'RETURN while walking is refused with NOT_CONTROLLED',
      command: 'RETURN',
      before: nearState,
      entitiesBefore: nearEntities,
      decision: notControlled,
      expected: Object.freeze({ accepted: false as const, code: 'NOT_CONTROLLED' }),
    },
    {
      id: 'second-command-same-tick',
      label: 'A second fleet command in the same fixed tick is refused',
      command: 'TAKE',
      before: focusedFar.accepted ? focusedFar.state : farState,
      entitiesBefore: 2,
      decision: doubleCommand,
      expected: Object.freeze({ accepted: false as const, code: 'DOUBLE_SWITCH_REFUSED' }),
    },
  ]);
}

interface ScenarioRow {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly result: 'ACCEPTED' | 'REFUSED';
  readonly code: string | null;
  readonly cause: string | null;
  readonly authorityBefore: string;
  readonly authorityAfter: string;
  readonly cameraBefore: string;
  readonly cameraAfter: string;
  readonly cameraDiverged: boolean;
  readonly entitiesBefore: number;
  readonly entitiesAfter: number;
  readonly characterMoved: boolean;
  readonly characterBitsIdentical: boolean;
  readonly resumeSource: string | null;
  readonly detail: string | null;
  readonly verdict: 'PASS' | 'FAIL';
}

const authorityLabel = (authority: { consumer: string } & Record<string, unknown>): string =>
  authority.consumer === 'CHARACTER'
    ? `CHARACTER:${String(authority.characterId)}`
    : `VEHICLE:${String(authority.vehicleId)}`;

const authorityIdOf = (state: FleetSwitchState): string =>
  state.authority.consumer === 'CHARACTER'
    ? state.authority.characterId
    : state.authority.vehicleId;

function trackedOf(state: FleetSwitchState): string {
  return state.focusEntityId ?? authorityIdOf(state);
}

function scenarioRow(scenario: Scenario): ScenarioRow {
  const decision = scenario.decision;
  const before = scenario.before;
  const matches = scenario.expected.accepted
    ? decision.accepted &&
      (scenario.expected.resumeSource === undefined ||
        (decision.kind === 'RETURN' && decision.resume.source === scenario.expected.resumeSource))
    : !decision.accepted &&
      decision.code === scenario.expected.code &&
      (scenario.expected.cause === undefined ||
        ('cause' in decision && decision.cause === scenario.expected.cause));
  const structural =
    scenario.command !== 'FOCUS' ||
    !decision.accepted ||
    (decision.kind === 'FOCUS' &&
      decision.bits.identical &&
      decision.entities.before === decision.entities.after &&
      authorityLabel({ ...decision.authority }) === authorityLabel({ ...before.authority }) &&
      authorityLabel({ ...decision.previousAuthority }) ===
        authorityLabel({ ...before.authority }));
  const beforeBits = characterPositionBits(before.character.positionM);
  const afterCharacter = decision.accepted ? decision.character : before.character;
  const afterBits = characterPositionBits(afterCharacter.positionM);
  const afterAuthority = decision.accepted ? decision.state.authority : before.authority;
  const cameraAfter = decision.accepted ? decision.camera.trackedEntityId : trackedOf(before);
  const afterState = decision.accepted ? decision.state : before;
  return Object.freeze({
    id: scenario.id,
    label: scenario.label,
    command: scenario.command,
    result: decision.accepted ? 'ACCEPTED' : 'REFUSED',
    code: 'code' in decision ? decision.code : null,
    cause: 'cause' in decision ? decision.cause : null,
    authorityBefore: authorityLabel({ ...before.authority }),
    authorityAfter: authorityLabel({ ...afterAuthority }),
    cameraBefore: trackedOf(before),
    cameraAfter,
    cameraDiverged: cameraAfter !== authorityIdOf(afterState),
    entitiesBefore: decision.accepted ? decision.entities.before : scenario.entitiesBefore,
    entitiesAfter: decision.accepted ? decision.entities.after : scenario.entitiesBefore,
    characterMoved: beforeBits !== afterBits,
    characterBitsIdentical: beforeBits === afterBits,
    resumeSource: decision.accepted && decision.kind === 'RETURN' ? decision.resume.source : null,
    detail: decision.accepted ? null : decision.detail,
    verdict: matches && structural ? 'PASS' : 'FAIL',
  });
}

interface FocusProof {
  readonly vehicleId: string;
  readonly distanceM: number;
  readonly authorityBefore: string;
  readonly authorityAfter: string;
  readonly characterBitsBefore: string;
  readonly characterBitsAfter: string;
  readonly positionBitsIdentical: boolean;
  readonly characterMovedM: number;
  readonly entitiesBefore: number;
  readonly entitiesAfter: number;
  readonly cameraTrackedEntityId: string;
  readonly cameraAuthorityEntityId: string;
  readonly cameraDiverged: boolean;
  readonly cameraTransitioning: boolean;
  readonly cameraRemainingStart: number;
  readonly cameraTransitionFrames: number;
  readonly cameraRemainingEnd: number;
  readonly cameraEveryFrameIsTracked: boolean;
  readonly cameraTransitions: number;
  readonly cameraTransitionTicks: number;
  readonly cameraEntityClones: number;
  readonly cameraTargetWrites: number;
  readonly stateRoundTrip: boolean;
  readonly projectionValid: boolean;
  readonly cameraSameEntityRefusal: string;
}

/** Drives the real 194 camera from the character onto the focused taxi, frame by frame. */
function driveCameraOnto(
  from: CharacterCameraTarget,
  to: CharacterCameraTarget,
  startTick: number,
): Readonly<{
  transitions: number;
  frames: number;
  remainingStart: number;
  remainingEnd: number;
  everyFrameIsTarget: boolean;
  clones: number;
  writes: number;
}> {
  const world = Object.freeze({ minX: -400, maxX: 400, minZ: -400, maxZ: 400, groundM: 0 });
  const camera = createCharacterCamera({ world, control: cameraControl() });
  const targets = Object.freeze([from, to]);
  for (let tick = 1; tick < startTick; tick += 1) {
    camera.step({ tick, authorityEntityId: from.entityId, targets, groundM: 0 });
  }
  const frame = camera.step({
    tick: startTick,
    authorityEntityId: to.entityId,
    targets,
    groundM: 0,
  });
  let frames = frame.transitioning ? 1 : 0;
  let everyFrameIsTarget = frame.entityId === to.entityId;
  let remainingEnd = frame.transitionRemainingTicks;
  for (let index = 1; index < CHARACTER_CAMERA_POLICY.transitionTicks; index += 1) {
    const next = camera.step({
      tick: startTick + index,
      authorityEntityId: to.entityId,
      targets,
      groundM: 0,
    });
    if (next.entityId !== to.entityId) everyFrameIsTarget = false;
    if (next.transitioning) frames += 1;
    remainingEnd = next.transitionRemainingTicks;
  }
  return Object.freeze({
    transitions: camera.stats.transitions,
    frames,
    remainingStart: frame.transitionRemainingTicks,
    remainingEnd,
    everyFrameIsTarget,
    clones: camera.stats.entityClones,
    writes: camera.stats.targetWrites,
  });
}

function focusProof(): FocusProof {
  const fixture = distantFixture();
  const state = stateOf(fixture);
  const taxi = fixture.vehicles[0]!;
  const accepted = decideFleetFocus({
    tick: FOCUS_TICK,
    state,
    vehicleId: taxi.vehicleId,
    vehicles: fixture.vehicles,
  });
  if (!accepted.accepted) throw new Error(`Focus proof refused: ${accepted.code}`);

  const characterTarget: CharacterCameraTarget = Object.freeze({
    entityId: fixture.character.entityId,
    kind: 'CHARACTER' as const,
    positionM: fixture.character.positionM,
    yawRad: fixture.character.yawRad,
    anchorHeightM: MEASURED.eyeHeightM,
  });
  const taxiTarget: CharacterCameraTarget = Object.freeze({
    entityId: taxi.vehicleId,
    kind: 'VEHICLE' as const,
    positionM: taxi.positionM,
    yawRad: taxi.yawRad,
    anchorHeightM: (taxi.topM - taxi.bottomM) / 2,
  });
  const driven = driveCameraOnto(characterTarget, taxiTarget, FOCUS_TICK);
  const twice = decideFleetFocus({
    tick: FOCUS_TICK + 10,
    state: accepted.state,
    vehicleId: taxi.vehicleId,
    vehicles: fixture.vehicles,
  });

  const projection = fleetSwitchProjection({ state: accepted.state, vehicles: fixture.vehicles });
  let projectionValid = true;
  try {
    validateFleetSwitchProjection(projection, {
      state: accepted.state,
      vehicles: fixture.vehicles,
    });
  } catch {
    projectionValid = false;
  }
  const snapshot = fleetSwitchSnapshot(accepted.state);
  const roundTrip = parseFleetSwitchState(JSON.parse(JSON.stringify(snapshot)));
  const before = characterPositionBits(fixture.character.positionM);
  const after = characterPositionBits(accepted.character.positionM);
  return Object.freeze({
    vehicleId: taxi.vehicleId,
    distanceM: accepted.focus.distanceM,
    authorityBefore: authorityLabel({ ...state.authority }),
    authorityAfter: authorityLabel({ ...accepted.authority }),
    characterBitsBefore: before,
    characterBitsAfter: after,
    positionBitsIdentical: before === after,
    characterMovedM: Math.hypot(
      accepted.character.positionM.x - fixture.character.positionM.x,
      accepted.character.positionM.y - fixture.character.positionM.y,
      accepted.character.positionM.z - fixture.character.positionM.z,
    ),
    entitiesBefore: accepted.entities.before,
    entitiesAfter: accepted.entities.after,
    cameraTrackedEntityId: accepted.camera.trackedEntityId,
    cameraAuthorityEntityId: accepted.camera.authorityEntityId,
    cameraDiverged: accepted.camera.diverged,
    cameraTransitioning: driven.frames > 0,
    cameraRemainingStart: driven.remainingStart,
    cameraTransitionFrames: driven.frames,
    cameraRemainingEnd: driven.remainingEnd,
    cameraEveryFrameIsTracked: driven.everyFrameIsTarget,
    cameraTransitions: driven.transitions,
    cameraTransitionTicks: CHARACTER_CAMERA_POLICY.transitionTicks,
    cameraEntityClones: driven.clones,
    cameraTargetWrites: driven.writes,
    stateRoundTrip: JSON.stringify(roundTrip) === JSON.stringify(snapshot),
    projectionValid,
    cameraSameEntityRefusal: twice.accepted ? 'ACCEPTED' : twice.code,
  });
}

interface ChainStep {
  readonly step: string;
  readonly tick: number;
  readonly authority: string;
  readonly trackedEntityId: string;
  readonly entities: number;
  readonly characterBits: string;
  readonly projectionValid: boolean;
  readonly authorityResolves: boolean;
  readonly cameraResolves: boolean;
}

interface ChainProof {
  readonly steps: readonly ChainStep[];
  readonly entitiesConstant: boolean;
  readonly authorityAlwaysResolves: boolean;
  readonly cameraAlwaysResolves: boolean;
  readonly projectionsValid: boolean;
  readonly cameraTransitions: number;
  readonly focusTransitionFrames: number;
  readonly takeTransitionFrames: number;
  readonly returnTransitionFrames: number;
  readonly everyReturnFrameIsCharacter: boolean;
  readonly characterResumed: boolean;
}

function resolveKind(
  id: string,
  characterId: string,
  vehicles: readonly VehicleEntryVehicle[],
): string | null {
  if (id === characterId) return 'CHARACTER';
  return vehicles.some((vehicle) => vehicle.vehicleId === id) ? 'VEHICLE' : null;
}

/** FOCUS -> TAKE -> RETURN in one real flow, with the camera driven through both transitions. */
function chainProof(): ChainProof {
  const fixture = nearFixture();
  const taxi = fixture.vehicles[0]!;
  const focus = decideFleetFocus({
    tick: FOCUS_TICK,
    state: stateOf(fixture),
    vehicleId: taxi.vehicleId,
    vehicles: fixture.vehicles,
  });
  if (!focus.accepted) throw new Error(`Chain focus refused: ${focus.code}`);
  const take = decideFleetTake(takeRequest(fixture, focus.state, taxi.vehicleId, TAKE_TICK));
  if (!take.accepted) throw new Error(`Chain take refused: ${take.code} / ${String(take.cause)}`);
  const controlled = Object.freeze({ vehicle: take.entry.vehicle, preTakeover: taxi });
  const returned = decideFleetReturn(returnRequest(fixture, take.state, controlled, RETURN_TICK));
  if (!returned.accepted)
    throw new Error(`Chain return refused: ${returned.code} / ${String(returned.cause)}`);

  const world = Object.freeze({ minX: -400, maxX: 400, minZ: -400, maxZ: 400, groundM: 0 });
  const camera = createCharacterCamera({ world, control: cameraControl() });
  const characterTarget: CharacterCameraTarget = Object.freeze({
    entityId: fixture.character.entityId,
    kind: 'CHARACTER' as const,
    positionM: fixture.character.positionM,
    yawRad: fixture.character.yawRad,
    anchorHeightM: MEASURED.eyeHeightM,
  });
  const taxiTarget: CharacterCameraTarget = Object.freeze({
    entityId: taxi.vehicleId,
    kind: 'VEHICLE' as const,
    positionM: taxi.positionM,
    yawRad: taxi.yawRad,
    anchorHeightM: (taxi.topM - taxi.bottomM) / 2,
  });
  const targets = Object.freeze([characterTarget, taxiTarget]);
  for (let tick = 1; tick < focus.tick; tick += 1) {
    camera.step({ tick, authorityEntityId: characterTarget.entityId, targets, groundM: 0 });
  }
  const focusFrame = camera.step({
    tick: focus.tick,
    authorityEntityId: focus.camera.trackedEntityId,
    targets,
    groundM: 0,
  });
  let focusFrames = focusFrame.transitioning ? 1 : 0;
  let everyFocusFrame = focusFrame.entityId === taxi.vehicleId;
  for (let index = 1; index < CHARACTER_CAMERA_POLICY.transitionTicks; index += 1) {
    const next = camera.step({
      tick: focus.tick + index,
      authorityEntityId: focus.camera.trackedEntityId,
      targets,
      groundM: 0,
    });
    if (next.entityId !== taxi.vehicleId) everyFocusFrame = false;
    if (next.transitioning) focusFrames += 1;
  }
  for (
    let tick = focus.tick + CHARACTER_CAMERA_POLICY.transitionTicks;
    tick < take.tick;
    tick += 1
  ) {
    camera.step({ tick, authorityEntityId: focus.camera.trackedEntityId, targets, groundM: 0 });
  }
  const takeFrame = camera.step({
    tick: take.tick,
    authorityEntityId: take.camera.trackedEntityId,
    targets,
    groundM: 0,
  });
  let takeFrames = takeFrame.transitioning ? 1 : 0;
  let everyTakeFrame = takeFrame.entityId === taxi.vehicleId;
  for (let index = 1; index < CHARACTER_CAMERA_POLICY.transitionTicks; index += 1) {
    const next = camera.step({
      tick: take.tick + index,
      authorityEntityId: take.camera.trackedEntityId,
      targets,
      groundM: 0,
    });
    if (next.entityId !== taxi.vehicleId) everyTakeFrame = false;
    if (next.transitioning) takeFrames += 1;
  }
  for (
    let tick = take.tick + CHARACTER_CAMERA_POLICY.transitionTicks;
    tick < returned.tick;
    tick += 1
  ) {
    camera.step({ tick, authorityEntityId: take.camera.trackedEntityId, targets, groundM: 0 });
  }
  const returnFrame = camera.step({
    tick: returned.tick,
    authorityEntityId: returned.camera.trackedEntityId,
    targets,
    groundM: 0,
  });
  let returnFrames = returnFrame.transitioning ? 1 : 0;
  let everyReturnFrame = returnFrame.entityId === fixture.character.entityId;
  for (let index = 1; index < CHARACTER_CAMERA_POLICY.transitionTicks; index += 1) {
    const next = camera.step({
      tick: returned.tick + index,
      authorityEntityId: returned.camera.trackedEntityId,
      targets,
      groundM: 0,
    });
    if (next.entityId !== fixture.character.entityId) everyReturnFrame = false;
    if (next.transitioning) returnFrames += 1;
  }

  const steps: ChainStep[] = [];
  const add = (step: string, tick: number, state: FleetSwitchState, tracked: string) => {
    const projection = fleetSwitchProjection({ state, vehicles: fixture.vehicles });
    let projectionValid = true;
    try {
      validateFleetSwitchProjection(projection, { state, vehicles: fixture.vehicles });
    } catch {
      projectionValid = false;
    }
    steps.push(
      Object.freeze({
        step,
        tick,
        authority: authorityLabel({ ...state.authority }),
        trackedEntityId: tracked,
        entities: fixture.vehicles.length + 1,
        characterBits: characterPositionBits(state.character.positionM),
        projectionValid,
        authorityResolves:
          resolveKind(authorityIdOf(state), fixture.character.entityId, fixture.vehicles) !== null,
        cameraResolves: resolveKind(tracked, fixture.character.entityId, fixture.vehicles) !== null,
      }),
    );
  };
  add('FOCUS', focus.tick, focus.state, focus.camera.trackedEntityId);
  add('TAKE', take.tick, take.state, take.camera.trackedEntityId);
  add('RETURN', returned.tick, returned.state, returned.camera.trackedEntityId);

  return Object.freeze({
    steps: Object.freeze(steps),
    entitiesConstant: steps.every((step) => step.entities === fixture.vehicles.length + 1),
    authorityAlwaysResolves: steps.every((step) => step.authorityResolves),
    cameraAlwaysResolves: steps.every((step) => step.cameraResolves),
    projectionsValid: steps.every((step) => step.projectionValid),
    cameraTransitions: camera.stats.transitions,
    focusTransitionFrames: everyFocusFrame ? focusFrames : -1,
    takeTransitionFrames: everyTakeFrame ? takeFrames : -1,
    returnTransitionFrames: everyReturnFrame ? returnFrames : -1,
    everyReturnFrameIsCharacter: everyReturnFrame,
    characterResumed: returned.resume.source === 'PREVIOUS_POSITION',
  });
}

interface ReturnProof {
  readonly branch: string;
  readonly label: string;
  readonly accepted: boolean;
  readonly resumeSource: string;
  readonly authorityAfter: string;
  readonly vehicleMode: string;
  readonly previousPositionBits: string | null;
  readonly resumedPositionBits: string;
  readonly identicalToPrevious: boolean;
  readonly exitPointBits: string;
  readonly resumeEqualsExitPoint: boolean;
  readonly rejectionCode: string | null;
  readonly rejectionDetail: string | null;
  readonly oldPointWalker: string;
  readonly exitPointWalker: string;
  readonly resumeClearanceM: number;
  readonly entitiesBefore: number;
  readonly entitiesAfter: number;
  readonly wallId: string | null;
  readonly verdict: 'PASS' | 'FAIL';
}

function walkerOutcome(
  world: VehicleExitWorld,
  vehicles: readonly VehicleEntryVehicle[],
  start: Readonly<{ positionM: CharacterPoint; yawRad: number }>,
): string {
  try {
    createWalker({ world: walkWorldOf(world, vehicles), start });
    return 'ACCEPTED';
  } catch (error) {
    return (error as { code?: string }).code ?? 'UNKNOWN';
  }
}

function returnProof(branch: ReturnBranch): ReturnProof {
  const returned = branch.returned;
  const released = returned.exit.vehicle;
  const releasedFleet = branch.fixture.vehicles.map((vehicle) =>
    vehicle.vehicleId === released.vehicleId ? released : vehicle,
  );
  const measured = measurePenetration(
    walkWorldOf(branch.fixture.world),
    returned.resume.positionM,
    CAPSULE.radiusM,
    CAPSULE.heightM,
    releasedFleet,
  );
  const oldWalker =
    returned.resume.previous === null
      ? 'NOT_APPLICABLE'
      : walkerOutcome(branch.fixture.world, releasedFleet, returned.resume.previous);
  const exitWalker = walkerOutcome(branch.fixture.world, releasedFleet, {
    positionM: returned.exit.start.positionM,
    yawRad: returned.exit.start.yawRad,
  });
  const exitBits = characterPositionBits(returned.exit.start.positionM);
  const expectedSource = branch.id === 'wall' ? 'EXIT_POINT' : 'PREVIOUS_POSITION';
  const branchProof =
    branch.id === 'wall'
      ? returned.resume.rejected !== null &&
        !returned.resume.identical &&
        returned.resume.positionBits === exitBits &&
        oldWalker === 'WALK_START_BLOCKED'
      : returned.resume.identical &&
        returned.resume.positionBits === returned.resume.previousBits &&
        oldWalker === 'ACCEPTED';
  const verdict =
    returned.resume.source === expectedSource &&
    branchProof &&
    returned.authority.consumer === 'CHARACTER' &&
    released.state.controlMode === 'AUTO' &&
    returned.entities.before === returned.entities.after &&
    exitWalker === 'ACCEPTED' &&
    measured.maxPenetrationM === 0 &&
    measured.minClearanceM >= 0
      ? 'PASS'
      : 'FAIL';
  return Object.freeze({
    branch: branch.id,
    label:
      branch.id === 'wall'
        ? 'A building was built over the remembered point in the meantime'
        : 'The remembered point is still free',
    accepted: returned.accepted,
    resumeSource: returned.resume.source,
    authorityAfter: authorityLabel({ ...returned.authority }),
    vehicleMode: released.state.controlMode,
    previousPositionBits: returned.resume.previousBits,
    resumedPositionBits: returned.resume.positionBits,
    identicalToPrevious: returned.resume.identical,
    exitPointBits: exitBits,
    resumeEqualsExitPoint: returned.resume.positionBits === exitBits,
    rejectionCode: returned.resume.rejected?.code ?? null,
    rejectionDetail: returned.resume.rejected?.detail ?? null,
    oldPointWalker: oldWalker,
    exitPointWalker: exitWalker,
    resumeClearanceM: measured.minClearanceM,
    entitiesBefore: returned.entities.before,
    entitiesAfter: returned.entities.after,
    wallId: branch.wallId,
    verdict,
  });
}

interface ProjectionCase {
  readonly id: string;
  readonly expected: 'ACCEPTED' | 'REFUSED';
  readonly accepted: boolean;
  readonly code: string | null;
  readonly controlledLabel: string | null;
  readonly mode: string | null;
  readonly modeSource: string | null;
  readonly trackedEntityId: string | null;
  readonly diverged: boolean | null;
  readonly divergenceReason: string | null;
  readonly verdict: 'PASS' | 'FAIL';
}

interface ProjectionProof {
  readonly cases: readonly ProjectionCase[];
  readonly accepted: number;
  readonly refused: number;
  readonly verdict: 'PASS' | 'FAIL';
}

function projectionCases(): readonly ProjectionCase[] {
  const fixture = nearFixture();
  const taxi = fixture.vehicles[0]!;
  const characterState = stateOf(fixture);
  const focused = decideFleetFocus({
    tick: FOCUS_TICK,
    state: characterState,
    vehicleId: taxi.vehicleId,
    vehicles: fixture.vehicles,
  });
  if (!focused.accepted) throw new Error(`Projection focus refused: ${focused.code}`);
  const seatedState = seatedStateOf(fixture, taxi.vehicleId, TAKE_TICK);
  const manualVehicle = manual(taxi, { tick: TAKE_TICK - 1 });
  const manualFleet = Object.freeze([manualVehicle]);
  const learningVehicle = Object.freeze({
    ...manualVehicle,
    state: Object.freeze({ ...manualVehicle.state, controlMode: 'LEARNING' as const }),
  });
  const learningFleet = Object.freeze([learningVehicle]);
  const autoVehicle = Object.freeze({
    ...manualVehicle,
    state: Object.freeze({ ...manualVehicle.state, controlMode: 'AUTO' as const }),
  });
  const autoFleet = Object.freeze([autoVehicle]);

  const valid = fleetSwitchProjection({ state: characterState, vehicles: fixture.vehicles });
  const focusedValid = fleetSwitchProjection({ state: focused.state, vehicles: fixture.vehicles });
  const manualValid = fleetSwitchProjection({ state: seatedState, vehicles: manualFleet });
  const learningValid = fleetSwitchProjection({ state: seatedState, vehicles: learningFleet });
  const autoValid = fleetSwitchProjection({ state: seatedState, vehicles: autoFleet });

  const cases: ProjectionCase[] = [];
  const check = (
    id: string,
    expected: 'ACCEPTED' | 'REFUSED',
    projection: FleetSwitchProjection,
    input: { state: FleetSwitchState; vehicles: readonly VehicleEntryVehicle[] },
  ) => {
    let accepted = true;
    let code: string | null = null;
    try {
      validateFleetSwitchProjection(projection, input);
    } catch (error) {
      accepted = false;
      code = (error as { code?: string }).code ?? 'UNKNOWN';
    }
    cases.push(
      Object.freeze({
        id,
        expected,
        accepted,
        code,
        controlledLabel: projection.controlled.label,
        mode: projection.controlled.mode,
        modeSource: projection.controlled.modeSource,
        trackedEntityId: projection.camera.trackedEntityId,
        diverged: projection.camera.diverged,
        divergenceReason: projection.camera.divergenceReason,
        verdict: expected === (accepted ? 'ACCEPTED' : 'REFUSED') ? 'PASS' : 'FAIL',
      }),
    );
  };

  check('character-default', 'ACCEPTED', valid, {
    state: characterState,
    vehicles: fixture.vehicles,
  });
  check('character-focus-taxi', 'ACCEPTED', focusedValid, {
    state: focused.state,
    vehicles: fixture.vehicles,
  });
  check('vehicle-manual', 'ACCEPTED', manualValid, {
    state: seatedState,
    vehicles: manualFleet,
  });
  check('vehicle-learning', 'ACCEPTED', learningValid, {
    state: seatedState,
    vehicles: learningFleet,
  });
  check('vehicle-auto', 'REFUSED', autoValid, { state: seatedState, vehicles: autoFleet });
  check(
    'vehicle-camera-on-character-without-focus',
    'REFUSED',
    Object.freeze({
      ...manualValid,
      camera: Object.freeze({
        ...manualValid.camera,
        trackedEntityId: fixture.character.entityId,
        trackedKind: 'CHARACTER' as const,
        diverged: false,
        divergenceReason: null,
        focusSinceTick: null,
      }),
    }),
    { state: seatedState, vehicles: manualFleet },
  );
  check(
    'divergence-flag-lies',
    'REFUSED',
    Object.freeze({
      ...manualValid,
      camera: Object.freeze({ ...manualValid.camera, diverged: true }),
    }),
    { state: seatedState, vehicles: manualFleet },
  );
  check(
    'unknown-camera-entity',
    'REFUSED',
    Object.freeze({
      ...manualValid,
      camera: Object.freeze({ ...manualValid.camera, trackedEntityId: 'vehicle:ghost-197' }),
    }),
    { state: seatedState, vehicles: manualFleet },
  );
  check(
    'wrong-mode',
    'REFUSED',
    Object.freeze({
      ...manualValid,
      controlled: Object.freeze({ ...manualValid.controlled, mode: 'LEARNING' as const }),
    }),
    { state: seatedState, vehicles: manualFleet },
  );
  check(
    'label-mismatch',
    'REFUSED',
    Object.freeze({
      ...manualValid,
      controlled: Object.freeze({ ...manualValid.controlled, label: 'CHARACTER:player-character' }),
    }),
    { state: seatedState, vehicles: manualFleet },
  );
  check(
    'entity-count-mismatch',
    'REFUSED',
    Object.freeze({ ...manualValid, entities: manualValid.entities + 1 }),
    { state: seatedState, vehicles: manualFleet },
  );
  check('state-focus-outside-list', 'REFUSED', focusedValid, {
    state: focused.state,
    vehicles: Object.freeze([]),
  });

  return Object.freeze(cases);
}

function projectionProof(): ProjectionProof {
  const cases = projectionCases();
  const accepted = cases.filter((entry) => entry.accepted).length;
  return Object.freeze({
    cases,
    accepted,
    refused: cases.length - accepted,
    verdict: cases.every((entry) => entry.verdict === 'PASS') ? 'PASS' : 'FAIL',
  });
}

export interface FleetSwitchReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly tickHz: number;
  readonly policy: typeof FLEET_SWITCH_POLICY;
  readonly reference: Readonly<{
    mapId: string;
    cityElements: number;
    surfaces: number;
    blockers: number;
    sidewalkElevationM: number;
    characterRadiusM: number;
    characterHeightM: number;
    vehicleColliderHalfExtentsM: Readonly<{ x: number; z: number }>;
    takeReachM: number;
  }>;
  readonly scenarios: readonly ScenarioRow[];
  readonly focus: FocusProof;
  readonly chain: ChainProof;
  readonly returns: readonly ReturnProof[];
  readonly projection: ProjectionProof;
  readonly summary: Readonly<{
    scenarios: number;
    scenariosPassed: number;
    focus: boolean;
    take: boolean;
    returnToWalking: boolean;
    chain: boolean;
    projection: boolean;
    pass: boolean;
  }>;
  readonly determinism: Readonly<{ runs: number; identical: boolean; digest: string }>;
  readonly limitations: readonly string[];
}

function buildReport(): Omit<FleetSwitchReport, 'determinism'> {
  const real = realWalkWorld();
  const sedan = sedanWalkFootprint();
  const rows = Object.freeze(scenarioList().map((scenario) => scenarioRow(scenario)));
  const focus = focusProof();
  const chain = chainProof();
  const returns = Object.freeze([
    returnProof(returnBranch('resume')),
    returnProof(returnBranch('wall')),
  ]);
  const projection = projectionProof();
  const scenariosPassed = rows.filter((row) => row.verdict === 'PASS').length;

  const focusOk =
    focus.distanceM === FLEET_SWITCH_POLICY.focusProofDistanceM &&
    focus.positionBitsIdentical &&
    focus.characterMovedM === 0 &&
    focus.entitiesBefore === focus.entitiesAfter &&
    focus.authorityBefore === focus.authorityAfter &&
    focus.cameraTrackedEntityId === focus.vehicleId &&
    focus.cameraAuthorityEntityId !== focus.cameraTrackedEntityId &&
    focus.cameraDiverged &&
    focus.cameraTransitioning &&
    focus.cameraRemainingStart === focus.cameraTransitionTicks - 1 &&
    focus.cameraTransitionFrames === focus.cameraTransitionTicks &&
    focus.cameraRemainingEnd === 0 &&
    focus.cameraEveryFrameIsTracked &&
    focus.cameraTransitions === 1 &&
    focus.cameraEntityClones === 0 &&
    focus.cameraTargetWrites === 0 &&
    focus.stateRoundTrip &&
    focus.projectionValid &&
    focus.cameraSameEntityRefusal === 'SAME_ENTITY';

  const takeOk =
    rows.some(
      (row) => row.id === 'take-after-focus' && row.result === 'ACCEPTED' && !row.characterMoved,
    ) &&
    rows.some(
      (row) =>
        row.id === 'take-distant' && row.code === 'TAKE_REFUSED' && row.cause === 'OUT_OF_RANGE',
    ) &&
    rows.some(
      (row) =>
        row.id === 'take-immobilized' &&
        row.code === 'TAKE_REFUSED' &&
        row.cause === 'VEHICLE_UNAVAILABLE',
    ) &&
    rows.some((row) => row.id === 'take-same-vehicle' && row.code === 'SAME_VEHICLE');

  const resumed = returns.find((entry) => entry.branch === 'resume')!;
  const walled = returns.find((entry) => entry.branch === 'wall')!;
  const returnOk =
    resumed.verdict === 'PASS' &&
    resumed.resumeSource === 'PREVIOUS_POSITION' &&
    resumed.identicalToPrevious &&
    resumed.previousPositionBits === resumed.resumedPositionBits &&
    resumed.oldPointWalker === 'ACCEPTED' &&
    resumed.vehicleMode === 'AUTO' &&
    walled.verdict === 'PASS' &&
    walled.resumeSource === 'EXIT_POINT' &&
    !walled.identicalToPrevious &&
    walled.resumeEqualsExitPoint &&
    walled.oldPointWalker === 'WALK_START_BLOCKED' &&
    walled.rejectionCode !== null &&
    walled.exitPointWalker === 'ACCEPTED' &&
    walled.resumeClearanceM >= 0 &&
    walled.entitiesBefore === walled.entitiesAfter &&
    walled.vehicleMode === 'AUTO';

  const chainOk =
    chain.steps.length === 3 &&
    chain.entitiesConstant &&
    chain.authorityAlwaysResolves &&
    chain.cameraAlwaysResolves &&
    chain.projectionsValid &&
    chain.cameraTransitions === 2 &&
    chain.focusTransitionFrames === CHARACTER_CAMERA_POLICY.transitionTicks &&
    chain.takeTransitionFrames === 0 &&
    chain.returnTransitionFrames === CHARACTER_CAMERA_POLICY.transitionTicks &&
    chain.everyReturnFrameIsCharacter &&
    chain.characterResumed;

  return {
    generatedBy: 'scripts/run-v3-fleet-switch-report.mjs',
    command: FLEET_SWITCH_REPORT_COMMAND,
    contract: FLEET_SWITCH_REPORT_CONTRACT,
    tickHz: FLEET_SWITCH_POLICY.tickHz,
    policy: FLEET_SWITCH_POLICY,
    reference: {
      mapId: real.mapId,
      cityElements: real.elementCount,
      surfaces: real.world.stats.surfaces,
      blockers: real.world.stats.blockers,
      sidewalkElevationM: SIDEWALK_ELEVATION_M,
      characterRadiusM: CAPSULE.radiusM,
      characterHeightM: CAPSULE.heightM,
      vehicleColliderHalfExtentsM: sedan.halfExtentsM,
      takeReachM: FLEET_SWITCH_POLICY.takeReachM,
    },
    scenarios: rows,
    focus,
    chain,
    returns,
    projection,
    summary: {
      scenarios: rows.length,
      scenariosPassed,
      focus: focusOk,
      take: takeOk,
      returnToWalking: returnOk,
      chain: chainOk,
      projection: projection.verdict === 'PASS',
      pass:
        rows.every((row) => row.verdict === 'PASS') &&
        focusOk &&
        takeOk &&
        returnOk &&
        chainOk &&
        projection.verdict === 'PASS',
    },
    limitations: [
      'Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri; compunerea (camera 194, input 066, vehicule 024) aplică cererile returnate în tick-ul curent.',
      'FOCUS nu are regulă de distanță: un taxi la 200 m este o țintă validă, iar dovada arată poziția bit-identică și numărul de entități neschimbat. „Aproape” rămâne o regulă exclusivă a lui TAKE, prin 195.',
      'TAKE dintr-o mașină compune 196 + 195 în același tick; dacă intrarea în noua mașină e refuzată, ieșirea este raportată dar nu aplicată, deci nu există un moment cu autoritatea pe o entitate fără corp.',
      'Poziția de revenire este cea a corpului suspendat la preluare, nu o poziție reconstruită: dacă acea poziție a rămas validă, este reluată bit-identic; altfel se folosește punctul valid al ieșirii 196. Contractul nu mută corpul pas cu pas înapoi.',
      'Proiecția de UI raportează MANUAL pentru personaj, pentru că 193 îl conduce manual; cele trei moduri 024 rămân exclusiv ale vehiculului. Etichetele vizuale rămân să fie formatate de UI.',
      'O singură comandă de flotă pe tick: FOCUS, TAKE și RETURN nu pot fi combinate în același tick, ca tranziția de cameră și schimbarea de autoritate să rămână observabile separat.',
      'Registrul 068 scrie doar tick, controlMode și appliedProfileVersion; mașina eliberată de 196 este returnată ca date și trebuie aplicată de proprietarul 061/044/068.',
      'Proba este deterministă și headless; feel-ul saltului de cameră și validarea în browser rămân la integrarea ulterioară.',
    ],
  };
}

/** Stable SHA-256 over the report payload, excluding the digest field itself. */
export function fleetSwitchReportDigest(report: Omit<FleetSwitchReport, 'determinism'>): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        generatedBy: report.generatedBy,
        command: report.command,
        contract: report.contract,
        tickHz: report.tickHz,
        policy: report.policy,
        reference: report.reference,
        scenarios: report.scenarios,
        focus: report.focus,
        chain: report.chain,
        returns: report.returns,
        projection: report.projection,
        summary: report.summary,
        limitations: report.limitations,
      }),
    )
    .digest('hex');
}

export function runFleetSwitchReport(): FleetSwitchReport {
  const first = buildReport();
  const second = buildReport();
  const identical = JSON.stringify(first) === JSON.stringify(second);
  return {
    ...first,
    determinism: { runs: 2, identical, digest: fleetSwitchReportDigest(first) },
  };
}
