/**
 * PBI 195 — deterministic evidence suite for taking over any car within reach.
 *
 * Everything is derived from delivered contracts: the walking body is a real PBI 192 walker on the
 * real PBI 042 city, the cars carry the real PBI 022/145 collider and the PBI 024/061/057 state,
 * the authority proof drives the real PBI 193 arbiter and the camera proof drives the real PBI 194
 * camera. No number below is a free parameter of the transition.
 *
 * Criterion 1 is measured with both sides: a civilian and a taxi already on a ride are accepted,
 * and every real refusal is produced by its own geometry — out of reach, a building corner between
 * the character and the door, a bollard covering the door and another car's body covering it.
 *
 * Criterion 2 has two independent proofs. (a) The 193 authority becomes the single `VEHICLE:<id>`,
 * the character is refused delivery and the second delivery of the tick is refused, while the body
 * count stays the same and the character keeps its exact position bits. (b) Every preserved vehicle
 * field is compared as IEEE-754 bytes before and after: only `state.controlMode` changes, to MANUAL.
 */
import { createHash } from 'node:crypto';
import {
  CHARACTER_CAMERA_POLICY,
  ENTER_VEHICLE_CONTRACT_VERSION,
  VEHICLE_ENTRY_POLICY,
  characterPositionBits,
  createCharacterAsset,
  createCharacterCamera,
  createRectanglePolygon,
  createWalker,
  decideVehicleEntry,
  vehicleEntryBits,
  vehicleEntryDoor,
  type CharacterCameraTarget,
  type CharacterPoint,
  type VehicleEntryDecision,
  type VehicleEntryRefusalCode,
  type VehicleEntryRequest,
  type VehicleEntryVehicle,
  type Walker,
  type WalkBlocker,
  type WalkWorld,
} from '../../src/character';
import { createInputAuthorityArbiter, type AuthorityCommand } from '../../src/input';
import type { ControlMode } from '../../src/vehicles';
import { realCurbSpot, realWalkWorld, sedanWalkFootprint } from './walk-world';
import { cameraControl } from './character-camera-suite';

export const ENTER_REPORT_CONTRACT = ENTER_VEHICLE_CONTRACT_VERSION;
export const ENTER_REPORT_COMMAND = 'npm run enter:report';
const ENTRY_TICK = 120;
/** One tick after the preserved vehicle state tick, so the proofs stay a real sequence. */
const PROOF_TICK = 43;
const SESSION_CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-195-enter',
  worldEpoch: 0,
});

interface VehicleStateOverrides {
  readonly controlMode?: ControlMode;
  readonly velocityMps?: CharacterPoint;
  readonly laneId?: string | null;
  readonly maneuverState?: VehicleEntryVehicle['state']['maneuverState'];
  readonly routeLaneIds?: readonly string[];
  readonly rideId?: string | null;
  readonly rideProgressM?: number;
  readonly appliedProfileVersion?: string;
  readonly tick?: number;
}

export function entryVehicle(
  vehicleId: string,
  driverKind: VehicleEntryVehicle['driverKind'],
  positionM: CharacterPoint,
  yawRad: number,
  overrides: VehicleStateOverrides = {},
): VehicleEntryVehicle {
  const footprint = sedanWalkFootprint();
  return Object.freeze({
    vehicleId,
    driverKind,
    classId: footprint.classId,
    positionM: Object.freeze({ x: positionM.x, y: positionM.y, z: positionM.z }),
    yawRad,
    halfExtentsM: footprint.halfExtentsM,
    bottomM: footprint.bottomM,
    topM: footprint.topM,
    availability: 'AVAILABLE' as const,
    state: Object.freeze({
      tick: overrides.tick ?? ENTRY_TICK - 1,
      controlMode: overrides.controlMode ?? ('AUTO' as const),
      velocityMps: overrides.velocityMps ?? Object.freeze({ x: 0, y: 0, z: 0 }),
      laneId: overrides.laneId ?? null,
      maneuverState: overrides.maneuverState ?? ('IDLE' as const),
      routeLaneIds: Object.freeze([...(overrides.routeLaneIds ?? [])]),
      rideId: overrides.rideId ?? null,
      rideProgressM: overrides.rideProgressM ?? 0,
      appliedProfileVersion: overrides.appliedProfileVersion ?? 'profile-1',
    }),
  });
}

interface StreetFixture {
  readonly world: WalkWorld;
  readonly walker: Walker;
  readonly character: VehicleEntryRequest['character'];
  readonly vehicle: VehicleEntryVehicle;
  readonly doorM: CharacterPoint;
  readonly outwardM: Readonly<{ x: number; z: number }>;
}

/** Unit outward direction of the sidewalk spot, read from the fixture instead of being typed. */
function spotOutward(): Readonly<{ x: number; z: number }> {
  const spot = realCurbSpot();
  const dx = spot.outside.x - spot.inside.x;
  const dz = spot.outside.z - spot.inside.z;
  const length = Math.hypot(dx, dz);
  return Object.freeze({ x: dx / length, z: dz / length });
}

/**
 * A car parked in the near lane, its driver door 0.30 m from a character standing on the real
 * roadway. The character is a real 192 walker, so the body and the capsule are the delivered ones.
 */
export function streetFixture(
  vehicleId = 'vehicle:civil-195',
  driverKind: VehicleEntryVehicle['driverKind'] = 'CIVILIAN',
  overrides: VehicleStateOverrides = {},
): StreetFixture {
  const { world } = realWalkWorld();
  const spot = realCurbSpot();
  const outward = spotOutward();
  const anchor = spot.outside;
  const doorM = Object.freeze({
    x: anchor.x + outward.x * 0.3,
    y: anchor.y,
    z: anchor.z + outward.z * 0.3,
  });
  const footprint = sedanWalkFootprint();
  const center = Object.freeze({
    x: doorM.x + outward.x * footprint.halfExtentsM.x,
    y: doorM.y,
    z: doorM.z + outward.z * footprint.halfExtentsM.x,
  });
  // The left flank must face the character: local −X points back along the outward direction.
  const yawRad = Math.atan2(-outward.z, outward.x);
  const walker = createWalker({
    world,
    start: { positionM: Object.freeze({ x: anchor.x, y: anchor.y, z: anchor.z }), yawRad },
  });
  const vehicle = entryVehicle(vehicleId, driverKind, center, yawRad, overrides);
  const door = vehicleEntryDoor(vehicle, walker.state.positionM);
  if (door.side !== 'LEFT')
    throw new Error(`Street fixture expected the LEFT flank, measured ${door.side}`);
  if (Math.abs(door.distanceM - 0.3) > 1e-9)
    throw new Error(`Street fixture door distance is ${door.distanceM}, expected 0.3 m`);
  for (let step = 0; step <= 20; step += 1) {
    const t = step / 20;
    const x = center.x + (doorM.x - center.x) * t;
    const z = center.z + (doorM.z - center.z) * t;
    if (world.blockingAt(x, z).length > 0)
      throw new Error('Street fixture is not clear of the authored solids');
  }
  return Object.freeze({
    world,
    walker,
    character: Object.freeze({
      entityId: walker.entityId,
      positionM: walker.state.positionM,
      yawRad: walker.state.yawRad,
      radiusM: walker.capsule.radiusM,
      heightM: walker.capsule.heightM,
    }),
    vehicle,
    doorM,
    outwardM: outward,
  });
}

export function entryRequest(
  fixture: StreetFixture,
  overrides: Partial<VehicleEntryRequest> = {},
): VehicleEntryRequest {
  return Object.freeze({
    tick: ENTRY_TICK,
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: fixture.walker.entityId,
    }),
    character: fixture.character,
    intent: Object.freeze({ vehicleId: fixture.vehicle.vehicleId }),
    vehicles: Object.freeze([fixture.vehicle]),
    blockers: fixture.world.blockers,
    previousEntry: null,
    ...overrides,
  });
}

interface CornerFixture {
  readonly world: WalkWorld;
  readonly walker: Walker;
  readonly character: VehicleEntryRequest['character'];
  readonly vehicle: VehicleEntryVehicle;
  readonly buildingId: string;
  readonly cornerM: Readonly<{ x: number; z: number }>;
  readonly doorM: CharacterPoint;
  readonly decision: VehicleEntryDecision;
}

/** Samples every edge of a car body; the corner fixture only admits real solids it never touches. */
function bodyClearOfBlockers(world: WalkWorld, vehicle: VehicleEntryVehicle): boolean {
  for (let step = 0; step <= 40; step += 1) {
    const t = step / 40;
    const localZ = -vehicle.halfExtentsM.z + 2 * vehicle.halfExtentsM.z * t;
    for (const localX of [-vehicle.halfExtentsM.x, 0, vehicle.halfExtentsM.x]) {
      const cos = Math.cos(vehicle.yawRad);
      const sin = Math.sin(vehicle.yawRad);
      const x = vehicle.positionM.x + localX * cos + localZ * sin;
      const z = vehicle.positionM.z - localX * sin + localZ * cos;
      if (world.blockingAt(x, z).length > 0) return false;
    }
  }
  return true;
}

/**
 * A real building corner between the character and the car door. The character stands 0.10 m west
 * of the west face; the door is 0.10 m south of the south face, 0.71 m away diagonally — inside the
 * arm reach, but the straight line passes through the building, so the only access is walking
 * around the block.
 */
function cornerFixture(): CornerFixture {
  const { layout, world } = realWalkWorld();
  for (const element of layout.elements) {
    if (element.kind !== 'BUILDING') continue;
    const xs = element.footprintM.map((vertex) => vertex.x);
    const zs = element.footprintM.map((vertex) => vertex.z);
    const minX = Math.min(...xs);
    const minZ = Math.min(...zs);
    const position = Object.freeze({
      x: minX - 0.1,
      y: world.surfaceAt(minX - 0.1, minZ + 0.4),
      z: minZ + 0.4,
    });
    const doorM = Object.freeze({ x: minX + 0.4, y: 0, z: minZ - 0.1 });
    if (world.blockingAt(position.x, position.z).length > 0) continue;
    if (world.blockingAt(doorM.x, doorM.z).length > 0) continue;
    const footprint = sedanWalkFootprint();
    const center = Object.freeze({
      x: doorM.x,
      y: 0,
      z: doorM.z - footprint.halfExtentsM.x,
    });
    const vehicle = entryVehicle('vehicle:wall-195', 'CIVILIAN', center, Math.PI / 2);
    const door = vehicleEntryDoor(vehicle, position);
    if (door.side !== 'LEFT' || Math.abs(door.positionM.x - doorM.x) > 1e-9) continue;
    if (door.distanceM > VEHICLE_ENTRY_POLICY.interactionRadiusM) continue;
    if (!bodyClearOfBlockers(world, vehicle)) continue;
    const walker = createWalker({
      world,
      start: { positionM: position, yawRad: 0 },
    });
    const body = Object.freeze({
      entityId: walker.entityId,
      positionM: walker.state.positionM,
      yawRad: walker.state.yawRad,
      radiusM: walker.capsule.radiusM,
      heightM: walker.capsule.heightM,
    });
    const decision = decideVehicleEntry({
      tick: ENTRY_TICK,
      authority: Object.freeze({ consumer: 'CHARACTER' as const, characterId: walker.entityId }),
      character: body,
      intent: Object.freeze({ vehicleId: vehicle.vehicleId }),
      vehicles: Object.freeze([vehicle]),
      blockers: world.blockers,
      previousEntry: null,
    });
    if (decision.accepted || decision.code !== 'PATH_BLOCKED' || decision.blockerId !== element.id)
      continue;
    return Object.freeze({
      world,
      walker,
      character: body,
      vehicle,
      buildingId: element.id,
      cornerM: Object.freeze({ x: minX, z: minZ }),
      doorM,
      decision,
    });
  }
  throw new Error(
    'The authored city has no corner where a building really stands between a door and a body',
  );
}

/** A real PBI 165 obstacle box (position + half sizes) covering the door of the parked car. */
export function doorObstacle(doorM: CharacterPoint): WalkBlocker {
  const halfSize = 0.2;
  const heightM = 1;
  const center = { x: doorM.x, z: doorM.z };
  return Object.freeze({
    id: 'hazard:obstacle-01',
    kind: 'OBSTACLE' as const,
    bottomM: 0,
    topM: heightM,
    marginM: 0.05,
    polygon: createRectanglePolygon('hazard:obstacle-01', center, {
      x: halfSize,
      z: halfSize,
    }),
  });
}

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly expected: VehicleEntryRefusalCode | 'ACCEPTED';
  readonly request: VehicleEntryRequest;
  readonly decision: VehicleEntryDecision;
}

function streetScenarios(): readonly Scenario[] {
  const civil = streetFixture();
  const accepted = decideVehicleEntry(entryRequest(civil));

  const taxiState: VehicleStateOverrides = {
    controlMode: 'LEARNING',
    velocityMps: Object.freeze({ x: 0, y: 0, z: 8.5 }),
    laneId: 'lane:avenue:southbound',
    maneuverState: 'FOLLOWING',
    routeLaneIds: ['lane:avenue:southbound', 'lane:junction', 'lane:street:dropoff'],
    rideId: 'ride-061-7',
    rideProgressM: 412.5,
    appliedProfileVersion: 'profile-version-195',
  };
  const taxi = streetFixture('vehicle:taxi-195', 'TAXI', taxiState);
  const taxiAccepted = decideVehicleEntry(entryRequest(taxi));

  const occupied = decideVehicleEntry(
    entryRequest(civil, {
      authority: Object.freeze({ consumer: 'VEHICLE' as const, vehicleId: 'vehicle:taxi-195' }),
    }),
  );
  const doubleEntry = decideVehicleEntry(
    entryRequest(civil, {
      previousEntry: Object.freeze({ tick: ENTRY_TICK, vehicleId: 'vehicle:taxi-195' }),
    }),
  );
  const far = streetFixture('vehicle:far-195');
  // Three metres along the roadway, parallel to the curb: the line is clear, the door is not.
  const along = Object.freeze({ x: far.outwardM.z, z: -far.outwardM.x });
  const farAnchor = Object.freeze({
    x: far.walker.state.positionM.x + along.x * 3,
    y: far.walker.state.positionM.y,
    z: far.walker.state.positionM.z + along.z * 3,
  });
  const outOfRange = decideVehicleEntry(
    entryRequest(far, {
      character: Object.freeze({ ...far.character, positionM: farAnchor }),
    }),
  );
  const immobilizedVehicle = Object.freeze({
    ...civil.vehicle,
    availability: 'IMMOBILIZED' as const,
  });
  const unavailable = decideVehicleEntry(
    entryRequest(civil, { vehicles: Object.freeze([immobilizedVehicle]) }),
  );
  const unknown = decideVehicleEntry(
    entryRequest(civil, { intent: Object.freeze({ vehicleId: 'vehicle:missing-195' }) }),
  );
  const obstacle = doorObstacle(civil.doorM);
  const doorBlocked = decideVehicleEntry(
    entryRequest(civil, { blockers: Object.freeze([...civil.world.blockers, obstacle]) }),
  );

  return Object.freeze([
    {
      id: 'civil-open',
      label: 'Civil parked in the near lane, character on the roadway at the door',
      expected: 'ACCEPTED',
      request: entryRequest(civil),
      decision: accepted,
    },
    {
      id: 'taxi-in-ride',
      label: 'Taxi already on a ride, same reach; the ride and the progress must survive',
      expected: 'ACCEPTED',
      request: entryRequest(taxi),
      decision: taxiAccepted,
    },
    {
      id: 'seat-occupied',
      label: 'The single player seat already holds another car',
      expected: 'VEHICLE_OCCUPIED',
      request: entryRequest(civil, {
        authority: Object.freeze({ consumer: 'VEHICLE' as const, vehicleId: 'vehicle:taxi-195' }),
      }),
      decision: occupied,
    },
    {
      id: 'same-tick-second-entry',
      label: 'A second entry in the tick that already accepted one',
      expected: 'DOUBLE_ENTRY_REFUSED',
      request: entryRequest(civil, {
        previousEntry: Object.freeze({ tick: ENTRY_TICK, vehicleId: 'vehicle:taxi-195' }),
      }),
      decision: doubleEntry,
    },
    {
      id: 'out-of-range',
      label: 'Character three metres away from the door, clear line',
      expected: 'OUT_OF_RANGE',
      request: entryRequest(far, {
        character: Object.freeze({ ...far.character, positionM: farAnchor }),
      }),
      decision: outOfRange,
    },
    {
      id: 'door-blocked',
      label: 'A real obstacle box covers the door',
      expected: 'PATH_BLOCKED',
      request: entryRequest(civil, {
        blockers: Object.freeze([...civil.world.blockers, obstacle]),
      }),
      decision: doorBlocked,
    },
    {
      id: 'immobilized',
      label: 'Vehicle availability is IMMOBILIZED in the PBI 023 damage state',
      expected: 'VEHICLE_UNAVAILABLE',
      request: entryRequest(civil, { vehicles: Object.freeze([immobilizedVehicle]) }),
      decision: unavailable,
    },
    {
      id: 'unknown-vehicle',
      label: 'Intent names a car that is not in the fleet snapshot',
      expected: 'UNKNOWN_VEHICLE',
      request: entryRequest(civil, { intent: Object.freeze({ vehicleId: 'vehicle:missing-195' }) }),
      decision: unknown,
    },
  ]);
}

/** A second parked car whose body covers the target door, proving cars block each other too. */
function vehicleBlockedScenario(): Scenario {
  const civil = streetFixture();
  const footprint = sedanWalkFootprint();
  const neighborCenter = Object.freeze({
    x: civil.doorM.x + civil.outwardM.x * (footprint.halfExtentsM.x - 0.05),
    y: civil.doorM.y,
    z: civil.doorM.z + civil.outwardM.z * (footprint.halfExtentsM.x - 0.05),
  });
  const neighbor = entryVehicle(
    'vehicle:neighbour-195',
    'CIVILIAN',
    neighborCenter,
    civil.vehicle.yawRad,
  );
  const request = entryRequest(civil, {
    vehicles: Object.freeze([civil.vehicle, neighbor]),
  });
  return Object.freeze({
    id: 'vehicle-at-door',
    label: 'Another car body covers the target door',
    expected: 'PATH_BLOCKED',
    request,
    decision: decideVehicleEntry(request),
  });
}

function wallScenario(): Scenario {
  const corner = cornerFixture();
  const request = Object.freeze({
    tick: ENTRY_TICK,
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: corner.walker.entityId,
    }),
    character: corner.character,
    intent: Object.freeze({ vehicleId: corner.vehicle.vehicleId }),
    vehicles: Object.freeze([corner.vehicle]),
    blockers: corner.world.blockers,
    previousEntry: null,
  });
  return Object.freeze({
    id: 'wall-between',
    label: `Building ${corner.buildingId} corner between the character and the door`,
    expected: 'PATH_BLOCKED',
    request,
    decision: corner.decision,
  });
}

export interface EnterScenarioRow {
  readonly id: string;
  readonly label: string;
  readonly vehicleId: string;
  readonly driverKind: string;
  readonly distanceM: number | null;
  readonly doorSide: string | null;
  readonly access: 'ACCEPTED' | 'REFUSED';
  readonly code: string | null;
  readonly blockerId: string | null;
  readonly detail: string | null;
  readonly verdict: 'PASS' | 'FAIL';
}

function scenarioRow(scenario: Scenario): EnterScenarioRow {
  const decision = scenario.decision;
  const expected =
    scenario.expected === 'ACCEPTED'
      ? decision.accepted
      : !decision.accepted && decision.code === scenario.expected;
  return Object.freeze({
    id: scenario.id,
    label: scenario.label,
    vehicleId: decision.vehicleId ?? scenario.request.intent.vehicleId,
    driverKind:
      scenario.request.vehicles.find(
        (vehicle) =>
          vehicle.vehicleId === (decision.vehicleId ?? scenario.request.intent.vehicleId),
      )?.driverKind ?? 'UNKNOWN',
    distanceM: decision.accepted ? decision.door.distanceM : decision.distanceM,
    doorSide: decision.accepted ? decision.door.side : null,
    access: decision.accepted ? 'ACCEPTED' : 'REFUSED',
    code: decision.accepted ? null : decision.code,
    blockerId: decision.accepted ? null : decision.blockerId,
    detail: decision.accepted ? null : decision.detail,
    verdict: expected ? 'PASS' : 'FAIL',
  });
}

interface AuthorityProof {
  readonly authorityConsumer: string;
  readonly vehicleId: string;
  readonly commandConsumer: string;
  readonly characterCommandsBefore: number;
  readonly vehicleCommandsAfter: number;
  readonly characterCommandsAfter: number;
  readonly characterDeliveryRefused: boolean;
  readonly characterRefusalCode: string;
  readonly doubleDeliveryRefused: boolean;
  readonly doubleDeliveryCode: string;
  readonly neutralizedActions: readonly string[];
  readonly transitions: number;
  readonly entityCountBefore: number;
  readonly entityCountAfter: number;
  readonly characterBodyRetained: boolean;
  readonly characterPositionBitsBefore: string;
  readonly characterPositionBitsAfter: string;
  readonly characterPositionUnchanged: boolean;
  readonly secondEntrySameTickRefused: boolean;
  readonly secondEntrySameTickCode: string;
  readonly reEntryWithoutJournalCode: string;
}

function authorityProof(): AuthorityProof {
  const fixture = streetFixture();
  const request = entryRequest(fixture, { tick: PROOF_TICK });
  const decision = decideVehicleEntry(request);
  if (!decision.accepted) throw new Error(`Authority proof entry refused: ${decision.code}`);
  if (decision.authority.consumer !== 'VEHICLE')
    throw new Error('The entry did not produce a VEHICLE authority');

  const delivered: AuthorityCommand[] = [];
  const ports = Object.freeze({
    character: (command: AuthorityCommand) => delivered.push(command),
    vehicle: (command: AuthorityCommand) => delivered.push(command),
  });
  const arbiter = createInputAuthorityArbiter({
    context: SESSION_CONTEXT,
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: fixture.walker.entityId,
    }),
  });
  arbiter.setAction('throttle', true);
  for (let tick = 1; tick < decision.tick; tick += 1) {
    const result = arbiter.step({ tick, characterYawRad: fixture.walker.state.yawRad });
    arbiter.deliver(result, 'CHARACTER', ports);
  }
  const characterCommandsBefore = delivered.length;

  const transitioned = arbiter.setAuthority(decision.authority);
  if (!transitioned) throw new Error('The authority did not change on entry');
  const afterTick = arbiter.step({
    tick: decision.tick,
    characterYawRad: fixture.walker.state.yawRad,
  });

  // The character is not the active consumer any more: its delivery is refused before any command
  // reaches it. The refusal is the first delivery of the tick, so it is not a double delivery.
  let characterRefusalCode = '';
  try {
    arbiter.deliver(afterTick, 'CHARACTER', ports);
  } catch (error) {
    characterRefusalCode = (error as { code?: string }).code ?? 'UNKNOWN';
  }
  arbiter.deliver(afterTick, 'VEHICLE', ports);
  const vehicleCommandsAfter = delivered.length - characterCommandsBefore;
  let doubleDeliveryCode = '';
  try {
    arbiter.deliver(afterTick, 'VEHICLE', ports);
  } catch (error) {
    doubleDeliveryCode = (error as { code?: string }).code ?? 'UNKNOWN';
  }

  const secondEntry = decideVehicleEntry({
    ...request,
    tick: decision.tick,
    authority: decision.authority,
    previousEntry: decision.journal,
  });
  const reEntry = decideVehicleEntry({
    ...request,
    tick: decision.tick,
    authority: decision.authority,
  });
  const positionBitsBefore = characterPositionBits(fixture.walker.state.positionM);
  const positionBitsAfter = characterPositionBits(decision.character.positionM);
  return Object.freeze({
    authorityConsumer: decision.authority.consumer,
    vehicleId: decision.authority.vehicleId,
    commandConsumer: afterTick.command.consumer,
    characterCommandsBefore,
    vehicleCommandsAfter,
    characterCommandsAfter: delivered.length - characterCommandsBefore - vehicleCommandsAfter,
    characterDeliveryRefused: characterRefusalCode === 'INACTIVE_CONSUMER_REFUSED',
    characterRefusalCode,
    doubleDeliveryRefused: doubleDeliveryCode === 'DOUBLE_DELIVERY_REFUSED',
    doubleDeliveryCode,
    neutralizedActions: afterTick.neutralized,
    transitions: arbiter.getStats().transitions,
    entityCountBefore: decision.entities.before,
    entityCountAfter: decision.entities.after,
    characterBodyRetained: decision.character.entityId === fixture.walker.entityId,
    characterPositionBitsBefore: positionBitsBefore,
    characterPositionBitsAfter: positionBitsAfter,
    characterPositionUnchanged: positionBitsBefore === positionBitsAfter,
    secondEntrySameTickRefused:
      !secondEntry.accepted && secondEntry.code === 'DOUBLE_ENTRY_REFUSED',
    secondEntrySameTickCode: secondEntry.accepted ? 'ACCEPTED' : secondEntry.code,
    reEntryWithoutJournalCode: reEntry.accepted ? 'ACCEPTED' : reEntry.code,
  });
}

interface PreservedField {
  readonly field: string;
  readonly before: string;
  readonly after: string;
  readonly identical: boolean;
}

interface PreservedProof {
  readonly vehicleId: string;
  readonly previousMode: string;
  readonly mode: string;
  readonly bitsBefore: string;
  readonly bitsAfter: string;
  readonly bitsIdentical: boolean;
  readonly rideId: string | null;
  readonly routeLaneIds: readonly string[];
  readonly rideProgressM: number;
  readonly fields: readonly PreservedField[];
}

function preservedField(field: string, before: unknown, after: unknown): PreservedField {
  const left = JSON.stringify(before);
  const right = JSON.stringify(after);
  return Object.freeze({ field, before: left, after: right, identical: left === right });
}

function preservedProof(): readonly PreservedProof[] {
  const civil = streetFixture();
  const taxi = streetFixture('vehicle:taxi-195', 'TAXI', {
    controlMode: 'LEARNING',
    velocityMps: Object.freeze({ x: 0, y: 0, z: 8.5 }),
    laneId: 'lane:avenue:southbound',
    maneuverState: 'FOLLOWING',
    routeLaneIds: ['lane:avenue:southbound', 'lane:junction', 'lane:street:dropoff'],
    rideId: 'ride-061-7',
    rideProgressM: 412.5,
    appliedProfileVersion: 'profile-version-195',
  });
  return Object.freeze(
    [
      { fixture: civil, request: entryRequest(civil) },
      { fixture: taxi, request: entryRequest(taxi) },
    ].map(({ fixture, request }) => {
      const decision = decideVehicleEntry(request);
      if (!decision.accepted) throw new Error(`Preserved proof entry refused: ${decision.code}`);
      const before = fixture.vehicle;
      const after = decision.vehicle;
      const fields = Object.freeze([
        preservedField('positionM', before.positionM, after.positionM),
        preservedField('yawRad', before.yawRad, after.yawRad),
        preservedField('halfExtentsM', before.halfExtentsM, after.halfExtentsM),
        preservedField('bottomM', before.bottomM, after.bottomM),
        preservedField('topM', before.topM, after.topM),
        preservedField('availability', before.availability, after.availability),
        preservedField('driverKind', before.driverKind, after.driverKind),
        preservedField('classId', before.classId, after.classId),
        preservedField('state.tick', before.state.tick, after.state.tick),
        preservedField('state.velocityMps', before.state.velocityMps, after.state.velocityMps),
        preservedField('state.laneId', before.state.laneId, after.state.laneId),
        preservedField(
          'state.maneuverState',
          before.state.maneuverState,
          after.state.maneuverState,
        ),
        preservedField('state.routeLaneIds', before.state.routeLaneIds, after.state.routeLaneIds),
        preservedField('state.rideId', before.state.rideId, after.state.rideId),
        preservedField(
          'state.rideProgressM',
          before.state.rideProgressM,
          after.state.rideProgressM,
        ),
        preservedField(
          'state.appliedProfileVersion',
          before.state.appliedProfileVersion,
          after.state.appliedProfileVersion,
        ),
      ]);
      return Object.freeze({
        vehicleId: decision.vehicleId,
        previousMode: decision.previousMode,
        mode: decision.mode,
        bitsBefore: vehicleEntryBits(before),
        bitsAfter: vehicleEntryBits(after),
        bitsIdentical: decision.bits.before === decision.bits.after,
        rideId: after.state.rideId,
        routeLaneIds: after.state.routeLaneIds,
        rideProgressM: after.state.rideProgressM,
        fields,
      });
    }),
  );
}

interface CameraProof {
  readonly tick: number;
  readonly previousEntityId: string;
  readonly authorityEntityId: string;
  readonly frameEntityId: string;
  readonly sameTick: boolean;
  readonly transitioning: boolean;
  readonly remainingStart: number;
  readonly transitionFrames: number;
  readonly remainingEnd: number;
  readonly everyFrameIsAuthority: boolean;
  readonly transitions: number;
  readonly transitionTicks: number;
  readonly entityClones: number;
  readonly targetWrites: number;
}

function cameraProof(): CameraProof {
  const fixture = streetFixture();
  const request = entryRequest(fixture, { tick: PROOF_TICK });
  const decision = decideVehicleEntry(request);
  if (!decision.accepted) throw new Error(`Camera proof entry refused: ${decision.code}`);
  const world = Object.freeze({ minX: -400, maxX: 400, minZ: -400, maxZ: 400, groundM: 0 });
  const camera = createCharacterCamera({ world, control: cameraControl() });
  const characterTarget: CharacterCameraTarget = Object.freeze({
    entityId: fixture.walker.entityId,
    kind: 'CHARACTER' as const,
    positionM: fixture.walker.state.positionM,
    yawRad: fixture.walker.state.yawRad,
    anchorHeightM: createCharacterAsset().measured.eyeHeightM,
  });
  const vehicleTarget: CharacterCameraTarget = Object.freeze({
    entityId: decision.vehicleId,
    kind: 'VEHICLE' as const,
    positionM: decision.vehicle.positionM,
    yawRad: decision.vehicle.yawRad,
    anchorHeightM: (decision.vehicle.topM - decision.vehicle.bottomM) / 2,
  });
  const targets = Object.freeze([characterTarget, vehicleTarget]);
  for (let tick = 1; tick < decision.tick; tick += 1) {
    camera.step({
      tick,
      authorityEntityId: fixture.walker.entityId,
      targets,
      groundM: fixture.walker.state.groundHeightM,
    });
  }
  const frame = camera.step({
    tick: decision.tick,
    authorityEntityId: decision.camera.authorityEntityId,
    targets,
    groundM: fixture.walker.state.groundHeightM,
  });
  let transitionFrames = 0;
  let everyFrameIsAuthority = frame.entityId === decision.vehicleId;
  if (frame.transitioning) transitionFrames += 1;
  let remainingEnd = frame.transitionRemainingTicks;
  for (let index = 1; index < CHARACTER_CAMERA_POLICY.transitionTicks; index += 1) {
    const next = camera.step({
      tick: decision.tick + index,
      authorityEntityId: decision.camera.authorityEntityId,
      targets,
      groundM: fixture.walker.state.groundHeightM,
    });
    if (next.entityId !== decision.vehicleId) everyFrameIsAuthority = false;
    if (next.transitioning) transitionFrames += 1;
    remainingEnd = next.transitionRemainingTicks;
  }
  return Object.freeze({
    tick: decision.tick,
    previousEntityId: decision.camera.previousEntityId,
    authorityEntityId: decision.camera.authorityEntityId,
    frameEntityId: frame.entityId,
    sameTick: frame.tick === decision.tick,
    transitioning: frame.transitioning,
    remainingStart: frame.transitionRemainingTicks,
    transitionFrames,
    remainingEnd,
    everyFrameIsAuthority,
    transitions: camera.stats.transitions,
    transitionTicks: CHARACTER_CAMERA_POLICY.transitionTicks,
    entityClones: camera.stats.entityClones,
    targetWrites: camera.stats.targetWrites,
  });
}

export interface EnterReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly tickHz: number;
  readonly policy: typeof VEHICLE_ENTRY_POLICY;
  readonly reference: Readonly<{
    mapId: string;
    cityElements: number;
    surfaces: number;
    blockers: number;
    cornerBuildingId: string;
    cornerM: Readonly<{ x: number; z: number }>;
    characterReachM: number;
    vehicleColliderHalfExtentsM: Readonly<{ x: number; z: number }>;
  }>;
  readonly scenarios: readonly EnterScenarioRow[];
  readonly authority: AuthorityProof;
  readonly preserved: readonly PreservedProof[];
  readonly camera: CameraProof;
  readonly summary: Readonly<{
    scenarios: number;
    scenariosPassed: number;
    criterion1: boolean;
    criterion2a: boolean;
    criterion2b: boolean;
    camera: boolean;
    pass: boolean;
  }>;
  readonly determinism: Readonly<{ runs: number; identical: boolean; digest: string }>;
  readonly limitations: readonly string[];
}

function buildReport(): Omit<EnterReport, 'determinism'> {
  const real = realWalkWorld();
  const corner = cornerFixture();
  const sedan = sedanWalkFootprint();
  const scenarios = Object.freeze([...streetScenarios(), vehicleBlockedScenario(), wallScenario()]);
  const rows = Object.freeze(scenarios.map((scenario) => scenarioRow(scenario)));
  const authority = authorityProof();
  const preserved = preservedProof();
  const camera = cameraProof();
  const scenariosPassed = rows.filter((row) => row.verdict === 'PASS').length;

  const civil = rows.find((row) => row.id === 'civil-open')!;
  const taxi = rows.find((row) => row.id === 'taxi-in-ride')!;
  const criterion1 =
    civil.access === 'ACCEPTED' &&
    taxi.access === 'ACCEPTED' &&
    rows.every((row) => row.verdict === 'PASS') &&
    rows.some((row) => row.code === 'OUT_OF_RANGE') &&
    rows.filter((row) => row.code === 'PATH_BLOCKED').length >= 2 &&
    rows.some((row) => row.code === 'UNKNOWN_VEHICLE') &&
    rows.some((row) => row.code === 'VEHICLE_OCCUPIED') &&
    rows.some((row) => row.code === 'VEHICLE_UNAVAILABLE');

  const criterion2a =
    authority.authorityConsumer === 'VEHICLE' &&
    authority.commandConsumer === 'VEHICLE' &&
    authority.characterDeliveryRefused &&
    authority.characterRefusalCode === 'INACTIVE_CONSUMER_REFUSED' &&
    authority.doubleDeliveryRefused &&
    authority.doubleDeliveryCode === 'DOUBLE_DELIVERY_REFUSED' &&
    authority.characterCommandsAfter === 0 &&
    authority.vehicleCommandsAfter === 1 &&
    authority.neutralizedActions.includes('throttle') &&
    authority.transitions === 1 &&
    authority.entityCountBefore === authority.entityCountAfter &&
    authority.characterBodyRetained &&
    authority.characterPositionUnchanged &&
    authority.secondEntrySameTickRefused &&
    authority.reEntryWithoutJournalCode === 'VEHICLE_OCCUPIED';

  const criterion2b =
    preserved.length === 2 &&
    preserved.every(
      (entry) =>
        entry.bitsIdentical &&
        entry.mode === 'MANUAL' &&
        entry.fields.every((field) => field.identical),
    ) &&
    preserved.some(
      (entry) =>
        entry.rideId !== null &&
        entry.routeLaneIds.length > 0 &&
        entry.fields.some((field) => field.field === 'state.rideProgressM' && field.before !== '0'),
    );

  const cameraOk =
    camera.sameTick &&
    camera.frameEntityId === camera.authorityEntityId &&
    camera.transitioning &&
    camera.remainingStart === camera.transitionTicks - 1 &&
    camera.transitionFrames === camera.transitionTicks &&
    camera.remainingEnd === 0 &&
    camera.everyFrameIsAuthority &&
    camera.transitions === 1 &&
    camera.entityClones === 0 &&
    camera.targetWrites === 0;

  return {
    generatedBy: 'scripts/run-v3-enter-report.mjs',
    command: ENTER_REPORT_COMMAND,
    contract: ENTER_REPORT_CONTRACT,
    tickHz: VEHICLE_ENTRY_POLICY.tickHz,
    policy: VEHICLE_ENTRY_POLICY,
    reference: {
      mapId: real.mapId,
      cityElements: real.elementCount,
      surfaces: real.world.stats.surfaces,
      blockers: real.world.stats.blockers,
      cornerBuildingId: corner.buildingId,
      cornerM: corner.cornerM,
      characterReachM: VEHICLE_ENTRY_POLICY.interactionRadiusM,
      vehicleColliderHalfExtentsM: sedan.halfExtentsM,
    },
    scenarios: rows,
    authority,
    preserved,
    camera,
    summary: {
      scenarios: rows.length,
      scenariosPassed,
      criterion1,
      criterion2a,
      criterion2b,
      camera: cameraOk,
      pass: criterion1 && criterion2a && criterion2b && cameraOk,
    },
    limitations: [
      'Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri; compunerea (input 066, camera 194, vehiculul 024) aplică decizia în tick-ul curent.',
      'Accesul este planar, ca fizica 192: distanța se măsoară în X/Z, iar solidele contează doar dacă se suprapun vertical cu corpul personajului. Un portal, o trapă sau o ușă deschisă nu sunt modelate.',
      'Ușa este mijlocul flancului caroseriei (amprenta reală 0,85 × 2,00 m), nu un mâner modelat; un vehicul cu o ușă în altă poziție ar cere un câmp de contract suplimentar.',
      '„Ocupat” este singurul scaun de jucător din 068 (un vehicul primește inputul), nu al doilea jucător: contractul nu are noțiunea de alt șofer uman.',
      'Indisponibilitatea folosește regula reală din 023 (`IMMOBILIZED` = accelerație zero și frână maximă); 068 nu are o misiune care să interzică preluarea, deci nu a fost inventată una.',
      'Proba este deterministă și headless; feel-ul intrării, animația `enter-vehicle` din 191 și validarea în browser rămân la integrarea 195/196.',
    ],
  };
}

/** Stable SHA-256 over the report payload, excluding the digest field itself. */
export function enterReportDigest(report: Omit<EnterReport, 'determinism'>): string {
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
        authority: report.authority,
        preserved: report.preserved,
        camera: report.camera,
        summary: report.summary,
        limitations: report.limitations,
      }),
    )
    .digest('hex');
}

export function runEnterReport(): EnterReport {
  const first = buildReport();
  const second = buildReport();
  const identical = JSON.stringify(first) === JSON.stringify(second);
  return { ...first, determinism: { runs: 2, identical, digest: enterReportDigest(first) } };
}
