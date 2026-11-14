/**
 * PBI 196 — deterministic evidence suite for leaving the car at a physically valid point.
 *
 * Everything is derived from delivered contracts: the released car carries the real PBI 022/145
 * collider and the PBI 024/061 state, the body is the PBI 191 capsule the 192 walker uses, the
 * world is the real PBI 042 city (or an explicit policy fixture for a ledge or a hole), the
 * authority proof drives the real PBI 193 arbiter and the camera proof drives the real PBI 194
 * camera. No number below is a free parameter of the transition.
 *
 * Criterion 1 is measured with both sides: an accepted exit is verified independently against
 * every solid and every car, and every candidate the contract rejected for a collider is handed to
 * the real 192 walker, which must refuse it with `WALK_START_BLOCKED`. One scenario makes the
 * obvious door candidate invalid so the next valid candidate has to be chosen.
 *
 * Criterion 2 has two independent proofs. (a) The 193 authority becomes `CHARACTER:<id>` in the
 * exit tick, the character receives the single command, the vehicle delivery is refused, the
 * second delivery of the tick is refused and a second exit is refused. (b) The released car is
 * compared field by field against the snapshot taken before the 195 takeover: the lane, the route
 * lanes, the ride id and the ride progress are restored bit for bit, and only the mode becomes
 * AUTO.
 */
import { createHash } from 'node:crypto';
import {
  CHARACTER_CAMERA_POLICY,
  EXIT_VEHICLE_CONTRACT_VERSION,
  VEHICLE_EXIT_POLICY,
  characterPositionBits,
  createCharacterAsset,
  createCharacterCamera,
  createOrientedRectanglePolygon,
  createRectanglePolygon,
  createWalkWorld,
  createWalker,
  decideVehicleExit,
  vehicleExitRouteBits,
  type CharacterCameraTarget,
  type CharacterPoint,
  type VehicleExitAcceptance,
  type VehicleExitCandidate,
  type VehicleExitDecision,
  type VehicleExitRefusalCode,
  type VehicleExitRequest,
  type VehicleExitVehicle,
  type VehicleExitWorld,
  type WalkBlocker,
  type WalkWorld,
} from '../../src/character';
import {
  createInputAuthorityArbiter,
  isCharacterCommandEmpty,
  type AuthorityCommand,
} from '../../src/input';
import {
  measurePenetration,
  realWalkWorld,
  SIDEWALK_ELEVATION_M,
  sedanWalkFootprint,
} from './walk-world';
import { entryVehicle, streetFixture } from './enter-vehicle-suite';
import { cameraControl } from './character-camera-suite';

export const EXIT_REPORT_CONTRACT = EXIT_VEHICLE_CONTRACT_VERSION;
export const EXIT_REPORT_COMMAND = 'npm run exit:report';

const EXIT_TICK = 240;
/** One tick after the preserved vehicle state tick, so the proofs stay a real sequence. */
const PROOF_TICK = 211;
const CHARACTER_ID = 'player-character';
const SESSION_CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-196-exit',
  worldEpoch: 0,
});

const MEASURED = createCharacterAsset().measured;
const CAPSULE = Object.freeze({
  radiusM: Math.max(MEASURED.footprintWidthM, MEASURED.footprintDepthM) / 2,
  heightM: MEASURED.heightM,
});

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

const CHARACTER = Object.freeze({
  entityId: CHARACTER_ID,
  radiusM: CAPSULE.radiusM,
  heightM: CAPSULE.heightM,
});

/** The walk world of 192 as the plain data the exit contract reads. */
export function exitWorldOf(
  world: WalkWorld,
  extraBlockers: readonly WalkBlocker[] = [],
): VehicleExitWorld {
  return Object.freeze({
    surfaces: world.surfaces,
    blockers: Object.freeze([...world.blockers, ...extraBlockers]),
    defaultGroundM: world.defaultGroundM,
  });
}

/** Rebuilds a real 192 walk world, with every car body as a solid the walker could not start in. */
export function walkWorldOf(
  world: VehicleExitWorld,
  vehicles: readonly VehicleExitVehicle[] = [],
): WalkWorld {
  return createWalkWorld({
    surfaces: world.surfaces.map((surface) => ({
      id: surface.id,
      kind: surface.kind,
      topM: surface.topM,
      vertices: surface.polygon.vertices,
    })),
    blockers: [
      ...world.blockers.map((blocker) => ({
        id: blocker.id,
        kind: blocker.kind,
        bottomM: blocker.bottomM,
        topM: blocker.topM,
        marginM: blocker.marginM,
        vertices: blocker.polygon.vertices,
      })),
      ...vehicles.map((vehicle) => ({
        id: `vehicle:${vehicle.vehicleId}`,
        kind: 'OBSTACLE' as const,
        bottomM: vehicle.bottomM,
        topM: vehicle.topM,
        marginM: VEHICLE_EXIT_POLICY.clearanceM,
        vertices: createOrientedRectanglePolygon(
          `vehicle:${vehicle.vehicleId}`,
          vehicle.positionM,
          vehicle.halfExtentsM,
          vehicle.yawRad,
        ).vertices,
      })),
    ],
    defaultGroundM: world.defaultGroundM,
  });
}

export interface ExitFixture {
  readonly world: VehicleExitWorld;
  readonly preTakeover: VehicleExitVehicle;
  readonly vehicle: VehicleExitVehicle;
  readonly vehicles: readonly VehicleExitVehicle[];
  readonly character: VehicleExitRequest['character'];
}

export function withState(
  vehicle: VehicleExitVehicle,
  patch: Partial<VehicleExitVehicle['state']>,
): VehicleExitVehicle {
  return Object.freeze({
    ...vehicle,
    state: Object.freeze({ ...vehicle.state, ...patch }),
  });
}

export function manual(
  vehicle: VehicleExitVehicle,
  patch: Partial<VehicleExitVehicle['state']> = {},
): VehicleExitVehicle {
  return withState(vehicle, { controlMode: 'MANUAL' as const, ...patch });
}

function fixtureOf(
  world: VehicleExitWorld,
  preTakeover: VehicleExitVehicle,
  vehicle: VehicleExitVehicle,
  vehicles: readonly VehicleExitVehicle[] = [vehicle],
): ExitFixture {
  return Object.freeze({
    world,
    preTakeover,
    vehicle,
    vehicles: Object.freeze(vehicles),
    character: CHARACTER,
  });
}

export function requestOf(
  fixture: ExitFixture,
  overrides: Partial<VehicleExitRequest> = {},
): VehicleExitRequest {
  return Object.freeze({
    tick: EXIT_TICK,
    authority: Object.freeze({
      consumer: 'VEHICLE' as const,
      vehicleId: fixture.vehicle.vehicleId,
    }),
    character: fixture.character,
    vehicle: fixture.vehicle,
    preTakeover: fixture.preTakeover,
    vehicles: fixture.vehicles,
    world: fixture.world,
    previousExit: null,
    ...overrides,
  });
}

/** A flat open lot: the policy fixture for a car parked next to another car or boxed in. */
function parkingWorld(): WalkWorld {
  return createWalkWorld({
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
}

/** Half-plane street with a real 0.60 m platform on the east side. */
function ledgeWorld(): WalkWorld {
  return createWalkWorld({
    surfaces: [
      {
        id: 'fixture:street',
        kind: 'STREET',
        topM: 0,
        vertices: [
          { x: -40, z: -40 },
          { x: 0, z: -40 },
          { x: 0, z: 40 },
          { x: -40, z: 40 },
        ],
      },
      {
        id: 'fixture:platform',
        kind: 'PLATFORM',
        topM: 0.6,
        vertices: [
          { x: 0, z: -40 },
          { x: 40, z: -40 },
          { x: 40, z: 40 },
          { x: 0, z: 40 },
        ],
      },
    ],
    blockers: [],
    defaultGroundM: 0,
  });
}

/** Half-plane street with a hole at −0.50 m east of the kerb: below the map plane. */
function pitWorld(): WalkWorld {
  return createWalkWorld({
    surfaces: [
      {
        id: 'fixture:street',
        kind: 'STREET',
        topM: 0,
        vertices: [
          { x: -40, z: -40 },
          { x: 0, z: -40 },
          { x: 0, z: 40 },
          { x: -40, z: 40 },
        ],
      },
      {
        id: 'fixture:pit',
        kind: 'STREET',
        topM: -0.5,
        vertices: [
          { x: 0, z: -40 },
          { x: 40, z: -40 },
          { x: 40, z: 40 },
          { x: 0, z: 40 },
        ],
      },
    ],
    blockers: [],
    defaultGroundM: 0,
  });
}

/** A real 165 obstacle box on the exit side of a parked car. */
function obstacleAt(
  id: string,
  centreM: Readonly<{ x: number; z: number }>,
  halfX: number,
  halfZ: number,
): WalkBlocker {
  return Object.freeze({
    id,
    kind: 'OBSTACLE' as const,
    bottomM: 0,
    topM: 1,
    marginM: 0.05,
    polygon: createRectanglePolygon(id, centreM, { x: halfX, z: halfZ }),
  });
}

export function obstacleBlockingExit(
  id: string,
  anchorM: CharacterPoint,
  outwardM: Readonly<{ x: number; z: number }>,
): WalkBlocker {
  // Covers the contact ring (0.20 m from the flank) and the step-out ring (0.80 m), with a real
  // 0.15 m gap to the car body so the car itself is not the blocker.
  const centre = { x: anchorM.x - outwardM.x * 0.2, z: anchorM.z - outwardM.z * 0.2 };
  const along = Math.abs(outwardM.x) > 0.5;
  return obstacleAt(id, centre, along ? 0.35 : 0.6, along ? 0.6 : 0.35);
}

export interface StreetExitFixture extends ExitFixture {
  readonly anchorM: CharacterPoint;
  readonly outwardM: Readonly<{ x: number; z: number }>;
}

/** The 195 street car, now held by the player: same real collider, same real kerb spot. */
export function streetExit(
  vehicleId = 'vehicle:civil-196',
  driverKind: VehicleExitVehicle['driverKind'] = 'CIVILIAN',
  overrides: Partial<VehicleExitVehicle['state']> = {},
): StreetExitFixture {
  const base = streetFixture(vehicleId, driverKind, overrides);
  const preTakeover = base.vehicle;
  const vehicle = manual(preTakeover, { tick: EXIT_TICK - 1 });
  return Object.freeze({
    world: exitWorldOf(base.world),
    preTakeover,
    vehicle,
    vehicles: Object.freeze([vehicle]),
    character: CHARACTER,
    anchorM: base.walker.state.positionM,
    outwardM: base.outwardM,
  });
}

/** A real block court car parked 0.02 m from a real building: the obvious left door is a wall. */
export function wallExit(): ExitFixture & Readonly<{ buildingId: string }> {
  const { layout, world } = realWalkWorld();
  const footprint = sedanWalkFootprint();
  for (const element of layout.elements) {
    if (element.kind !== 'BUILDING') continue;
    const xs = element.footprintM.map((vertex) => vertex.x);
    const minX = Math.min(...xs);
    const zs = element.footprintM.map((vertex) => vertex.z);
    const zCentre = (Math.min(...zs) + Math.max(...zs)) / 2;
    const centre = { x: minX - 0.87, z: zCentre };
    // +X points west at yaw π, so the LEFT flank (local −X) faces the building to the east.
    const yawRad = Math.PI;
    const vehicle = entryVehicle(
      'vehicle:wall-196',
      'CIVILIAN',
      point(centre.x, SIDEWALK_ELEVATION_M, centre.z),
      yawRad,
    );
    const current = manual(vehicle, { tick: EXIT_TICK - 1 });
    const fixture = fixtureOf(exitWorldOf(world), vehicle, current);
    const bodyClear = (() => {
      for (let step = 0; step <= 40; step += 1) {
        const t = step / 40;
        const localZ = -footprint.halfExtentsM.z + 2 * footprint.halfExtentsM.z * t;
        for (const localX of [-footprint.halfExtentsM.x, 0, footprint.halfExtentsM.x]) {
          const x = centre.x + localX * Math.cos(yawRad) + localZ * Math.sin(yawRad);
          const z = centre.z - localX * Math.sin(yawRad) + localZ * Math.cos(yawRad);
          if (world.blockingAt(x, z).length > 0) return false;
        }
      }
      return true;
    })();
    if (!bodyClear) continue;
    if (Math.abs(world.surfaceAt(centre.x, centre.z) - SIDEWALK_ELEVATION_M) > 1e-12) continue;
    const decision = decideVehicleExit(requestOf(fixture));
    if (!decision.accepted) continue;
    if (decision.exit.side !== 'RIGHT') continue;
    const first = decision.candidates[0]!;
    if (first.code !== 'SOLID' || first.blockerId !== element.id) continue;
    return Object.freeze({ ...fixture, buildingId: element.id });
  }
  throw new Error('The authored city has no wall where the left door of a parked car is blocked');
}

/** A car parked 0.10 m from another car: the gap is too narrow for the 0.30 × 0.26 m footprint. */
export function occupiedExit(): ExitFixture & Readonly<{ neighbourId: string }> {
  const world = parkingWorld();
  const footprint = sedanWalkFootprint();
  const target = entryVehicle('vehicle:target-196', 'CIVILIAN', point(0, 0, 0), 0);
  const neighbour = entryVehicle(
    'vehicle:neighbour-196',
    'CIVILIAN',
    point(-(footprint.halfExtentsM.x * 2 + 0.1), 0, 0),
    0,
  );
  const current = manual(target, { tick: EXIT_TICK - 1 });
  return Object.freeze({
    ...fixtureOf(exitWorldOf(world), target, current, [current, neighbour]),
    neighbourId: neighbour.vehicleId,
  });
}

/** Both doors boxed in; the rear is still open, so the fixed order has to move on. */
export function rearExit(): ExitFixture {
  const world = parkingWorld();
  const target = entryVehicle('vehicle:target-196', 'CIVILIAN', point(0, 0, 0), 0);
  const current = manual(target, { tick: EXIT_TICK - 1 });
  const blockers = [
    obstacleAt('fixture:left', { x: -1.325, z: 0 }, 0.425, 2.3),
    obstacleAt('fixture:right', { x: 1.325, z: 0 }, 0.425, 2.3),
  ];
  return fixtureOf(exitWorldOf(world, blockers), target, current);
}

/** Boxed in on all four sides: no candidate survives, so the character may not be moved. */
export function boxedInExit(): ExitFixture {
  const world = parkingWorld();
  const target = entryVehicle('vehicle:target-196', 'CIVILIAN', point(0, 0, 0), 0);
  const current = manual(target, { tick: EXIT_TICK - 1 });
  const blockers = [
    obstacleAt('fixture:left', { x: -1.325, z: 0 }, 0.425, 2.3),
    obstacleAt('fixture:right', { x: 1.325, z: 0 }, 0.425, 2.3),
    obstacleAt('fixture:rear', { x: 0, z: -2.5 }, 1.2, 0.45),
    obstacleAt('fixture:front', { x: 0, z: 2.5 }, 1.2, 0.45),
  ];
  return fixtureOf(exitWorldOf(world, blockers), target, current);
}

/** A 0.60 m platform where the obvious door is: above the real 0.14 m step ceiling. */
export function ledgeExit(): ExitFixture {
  const world = ledgeWorld();
  const target = entryVehicle('vehicle:ledge-196', 'CIVILIAN', point(-0.95, 0, 0), Math.PI);
  const current = manual(target, { tick: EXIT_TICK - 1 });
  return fixtureOf(exitWorldOf(world), target, current);
}

/** A hole 0.50 m below the map plane where the obvious door is. */
export function pitExit(): ExitFixture {
  const world = pitWorld();
  const target = entryVehicle('vehicle:pit-196', 'CIVILIAN', point(-0.95, 0, 0), Math.PI);
  const current = manual(target, { tick: EXIT_TICK - 1 });
  return fixtureOf(exitWorldOf(world), target, current);
}

/** The taxi on a real ride: learning before the takeover, manual in this tick, auto after. */
export function taxiExit(): StreetExitFixture {
  const base = streetExit('vehicle:taxi-196', 'TAXI', {
    controlMode: 'LEARNING' as const,
    laneId: 'lane:avenue:southbound',
    maneuverState: 'FOLLOWING' as const,
    routeLaneIds: ['lane:avenue:southbound', 'lane:junction', 'lane:street:dropoff'],
    rideId: 'ride-061-196',
    rideProgressM: 412.5,
    appliedProfileVersion: 'profile-version-196',
  });
  return base;
}

interface Expectation {
  readonly accepted: boolean;
  readonly code?: VehicleExitRefusalCode;
  readonly candidateId?: string;
  readonly side?: 'LEFT' | 'RIGHT' | 'REAR' | 'FRONT';
}

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly fixture: ExitFixture;
  readonly request: VehicleExitRequest;
  readonly expected: Expectation;
  readonly decision: VehicleExitDecision;
}

function scenario(
  id: string,
  label: string,
  fixture: ExitFixture,
  expected: Expectation,
  overrides: Partial<VehicleExitRequest> = {},
): Scenario {
  const request = requestOf(fixture, overrides);
  return Object.freeze({
    id,
    label,
    fixture,
    request,
    expected,
    decision: decideVehicleExit(request),
  });
}

function scenarios(): readonly Scenario[] {
  const open = streetExit();
  const door = streetExit();
  const occupied = occupiedExit();
  const rear = rearExit();
  const wall = wallExit();
  const ledge = ledgeExit();
  const pit = pitExit();
  const boxed = boxedInExit();
  const slowBase = streetExit();
  const slowVehicle = withState(slowBase.vehicle, {
    velocityMps: Object.freeze({ x: 0, y: 0, z: 0.3 }),
  });
  const slow = fixtureOf(slowBase.world, slowBase.preTakeover, slowVehicle);
  const fastBase = streetExit();
  const fastVehicle = withState(fastBase.vehicle, {
    velocityMps: Object.freeze({ x: 0, y: 0, z: 8.5 }),
  });
  const fast = fixtureOf(fastBase.world, fastBase.preTakeover, fastVehicle);
  const outOfSeat = streetExit();
  const twice = streetExit();

  return Object.freeze([
    scenario(
      'open-street',
      'Civil parked at the real kerb; the left door leads to the roadway',
      open,
      {
        accepted: true,
        candidateId: 'LEFT:R0',
        side: 'LEFT',
      },
    ),
    scenario(
      'door-obstacle',
      'A real 165 obstacle box covers the left door; the next valid point must be chosen',
      {
        ...door,
        world: exitWorldOf(realWalkWorld().world, [
          obstacleBlockingExit('hazard:exit-196', door.anchorM, door.outwardM),
        ]),
      },
      { accepted: true, candidateId: 'RIGHT:R0', side: 'RIGHT' },
    ),
    scenario(
      'occupied-by-car',
      'Another parked car 0.10 m away leaves no room for the 191 footprint',
      occupied,
      { accepted: true, candidateId: 'RIGHT:R0', side: 'RIGHT' },
    ),
    scenario('rear-only', 'Both doors boxed in; the rear ring is the next valid point', rear, {
      accepted: true,
      candidateId: 'REAR:R0',
      side: 'REAR',
    }),
    scenario(
      'real-wall',
      `Real building ${wall.buildingId} covers the left door; the right side is on the court`,
      wall,
      { accepted: true, candidateId: 'RIGHT:R0', side: 'RIGHT' },
    ),
    scenario(
      'step-too-high',
      'A 0.60 m platform covers the left door, above the real 0.14 m curb ceiling',
      ledge,
      { accepted: true, candidateId: 'RIGHT:R0', side: 'RIGHT' },
    ),
    scenario(
      'below-map',
      'A hole 0.50 m below the map plane covers the left door; the body may not appear there',
      pit,
      { accepted: true, candidateId: 'RIGHT:R0', side: 'RIGHT' },
    ),
    scenario('moving-slow', 'A creeping 0.30 m/s car may still be left at the contact ring', slow, {
      accepted: true,
      candidateId: 'LEFT:R0',
      side: 'LEFT',
    }),
    scenario(
      'moving-fast',
      'An 8.50 m/s car may not be left: the explicit stop rule refuses it',
      fast,
      { accepted: false, code: 'VEHICLE_MOVING' },
    ),
    scenario(
      'no-valid-exit',
      'All four sides and both rings are blocked; no teleport is allowed',
      boxed,
      {
        accepted: false,
        code: 'NO_VALID_EXIT',
      },
    ),
    scenario(
      'seat-not-controlled',
      'The authority is already the character, so no car seat can be released',
      outOfSeat,
      { accepted: false, code: 'NOT_CONTROLLED' },
      {
        authority: Object.freeze({ consumer: 'CHARACTER' as const, characterId: CHARACTER_ID }),
      },
    ),
    scenario(
      'second-exit',
      'A second exit in the same fixed tick is refused by the journal',
      twice,
      { accepted: false, code: 'DOUBLE_EXIT_REFUSED' },
      {
        previousExit: Object.freeze({
          tick: EXIT_TICK,
          vehicleId: twice.vehicle.vehicleId,
        }),
      },
    ),
  ]);
}

interface CandidateRow {
  readonly id: string;
  readonly side: string;
  readonly ring: number;
  readonly valid: boolean;
  readonly code: string | null;
  readonly blockerId: string | null;
  readonly detail: string;
  readonly groundM: number;
  readonly groundStepM: number;
  readonly clearanceM: number | null;
  readonly nearestBlockerId: string | null;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
}

function candidateRow(candidate: VehicleExitCandidate): CandidateRow {
  return Object.freeze({
    id: candidate.id,
    side: candidate.side,
    ring: candidate.ring,
    valid: candidate.valid,
    code: candidate.code,
    blockerId: candidate.blockerId,
    detail: candidate.detail,
    groundM: candidate.groundM,
    groundStepM: candidate.groundStepM,
    clearanceM: Number.isFinite(candidate.clearanceM) ? candidate.clearanceM : null,
    nearestBlockerId: candidate.nearestBlockerId,
    positionM: candidate.positionM,
  });
}

interface ScenarioRow {
  readonly id: string;
  readonly label: string;
  readonly result: 'ACCEPTED' | 'REFUSED';
  readonly code: string | null;
  readonly speedMps: number | null;
  readonly attempts: number;
  readonly candidates: readonly CandidateRow[];
  readonly chosen: Readonly<{
    id: string;
    side: string;
    ring: number;
    groundM: number;
    groundStepM: number;
    clearanceM: number;
    nearestBlockerId: string | null;
  }> | null;
  readonly measured: Readonly<{
    maxPenetrationM: number;
    minClearanceM: number;
    insideSolid: boolean;
    groundClearanceM: number;
  }> | null;
  readonly walkerStart: string;
  readonly walkerPositionBits: Readonly<{
    exit: string;
    walker: string;
    identical: boolean;
  }> | null;
  readonly colliderRefusals: Readonly<{ candidates: number; refusedByWalker: number }>;
  readonly contractOnlyRefusals: number;
  readonly mode: string | null;
  readonly previousMode: string | null;
  readonly baselineMode: string | null;
  readonly routeBitsIdentical: boolean;
  readonly verdict: 'PASS' | 'FAIL';
}

function startOutcome(world: WalkWorld, positionM: CharacterPoint, yawRad: number): string {
  try {
    createWalker({ world, start: { positionM, yawRad } });
    return 'ACCEPTED';
  } catch (error) {
    return (error as { code?: string }).code ?? 'UNKNOWN';
  }
}

function createWalkerAt(fixture: ExitFixture, positionM: CharacterPoint, yawRad: number) {
  return createWalker({
    world: walkWorldOf(fixture.world, fixture.vehicles),
    start: { positionM, yawRad },
  });
}

function scenarioRow(scenarioValue: Scenario): ScenarioRow {
  const { decision, fixture, expected } = scenarioValue;
  const candidates = decision.candidates.map(candidateRow);
  const colliderCandidates = decision.candidates.filter(
    (candidate) => candidate.code === 'SOLID' || candidate.code === 'OTHER_VEHICLE',
  );
  const contractOnlyRefusals = decision.candidates.filter(
    (candidate) => candidate.code === 'STEP_TOO_HIGH' || candidate.code === 'BELOW_MAP',
  ).length;
  const walkerWorld = walkWorldOf(fixture.world, fixture.vehicles);
  const refusedByWalker = colliderCandidates.filter(
    (candidate) => startOutcome(walkerWorld, candidate.positionM, 0) === 'WALK_START_BLOCKED',
  ).length;

  if (!decision.accepted) {
    const verdict =
      !expected.accepted && decision.code === expected.code && decision.tick === EXIT_TICK
        ? 'PASS'
        : 'FAIL';
    return Object.freeze({
      id: scenarioValue.id,
      label: scenarioValue.label,
      result: 'REFUSED',
      code: decision.code,
      speedMps: decision.speedMps,
      attempts: decision.candidates.length,
      candidates,
      chosen: null,
      measured: null,
      walkerStart: 'NOT_APPLICABLE',
      walkerPositionBits: null,
      colliderRefusals: Object.freeze({
        candidates: colliderCandidates.length,
        refusedByWalker,
      }),
      contractOnlyRefusals,
      mode: null,
      previousMode: null,
      baselineMode: null,
      routeBitsIdentical: false,
      verdict,
    });
  }

  const accepted = decision as VehicleExitAcceptance;
  const staticWorld = walkWorldOf(fixture.world);
  const measured = measurePenetration(
    staticWorld,
    accepted.start.positionM,
    CAPSULE.radiusM,
    CAPSULE.heightM,
    fixture.vehicles,
  );
  const groundClearanceM =
    accepted.start.positionM.y -
    staticWorld.surfaceAt(accepted.start.positionM.x, accepted.start.positionM.z);
  const startCode = startOutcome(walkerWorld, accepted.start.positionM, accepted.start.yawRad);
  const exitBits = characterPositionBits(accepted.start.positionM);
  const walkerBits =
    startCode === 'ACCEPTED'
      ? createWalkerAt(fixture, accepted.start.positionM, accepted.start.yawRad).positionBits()
      : '';
  const matchesExpected =
    expected.accepted &&
    (expected.candidateId === undefined || accepted.exit.candidateId === expected.candidateId) &&
    (expected.side === undefined || accepted.exit.side === expected.side);
  const verdict =
    matchesExpected &&
    measured.maxPenetrationM === 0 &&
    measured.minClearanceM >= 0 &&
    groundClearanceM === 0 &&
    startCode === 'ACCEPTED' &&
    exitBits === walkerBits &&
    accepted.mode === 'AUTO' &&
    accepted.entities.before === accepted.entities.after &&
    accepted.bits.identical
      ? 'PASS'
      : 'FAIL';

  return Object.freeze({
    id: scenarioValue.id,
    label: scenarioValue.label,
    result: 'ACCEPTED',
    code: null,
    speedMps: Math.hypot(fixture.vehicle.state.velocityMps.x, fixture.vehicle.state.velocityMps.z),
    attempts: decision.candidates.length,
    candidates,
    chosen: Object.freeze({
      id: accepted.exit.candidateId,
      side: accepted.exit.side,
      ring: accepted.exit.ring,
      groundM: accepted.exit.groundM,
      groundStepM: accepted.exit.groundStepM,
      clearanceM: accepted.exit.clearanceM,
      nearestBlockerId: accepted.exit.nearestBlockerId,
    }),
    measured: Object.freeze({
      maxPenetrationM: measured.maxPenetrationM,
      minClearanceM: measured.minClearanceM,
      insideSolid: measured.insideSolid,
      groundClearanceM,
    }),
    walkerStart: startCode,
    walkerPositionBits: Object.freeze({
      exit: exitBits,
      walker: walkerBits,
      identical: exitBits === walkerBits,
    }),
    colliderRefusals: Object.freeze({
      candidates: colliderCandidates.length,
      refusedByWalker,
    }),
    contractOnlyRefusals,
    mode: accepted.mode,
    previousMode: accepted.previousMode,
    baselineMode: accepted.baselineMode,
    routeBitsIdentical: accepted.bits.identical,
    verdict,
  });
}

interface AuthorityProof {
  readonly authorityConsumer: string;
  readonly commandConsumer: string;
  readonly characterId: string;
  readonly vehicleCommandsBefore: number;
  readonly characterCommandsAfter: number;
  readonly vehicleCommandsAfter: number;
  readonly vehicleDeliveryRefused: boolean;
  readonly vehicleRefusalCode: string;
  readonly doubleDeliveryRefused: boolean;
  readonly doubleDeliveryCode: string;
  readonly neutralizedActions: readonly string[];
  readonly characterCommandEmpty: boolean;
  readonly transitions: number;
  readonly entityCountBefore: number;
  readonly entityCountAfter: number;
  readonly secondExitSameTickRefused: boolean;
  readonly secondExitSameTickCode: string;
  readonly reExitAfterReleaseCode: string;
  readonly startAccepted: boolean;
  readonly startPositionBits: string;
}

function authorityProof(): AuthorityProof {
  const fixture = streetExit();
  const request = requestOf(fixture, { tick: PROOF_TICK });
  const decision = decideVehicleExit(request);
  if (!decision.accepted) throw new Error(`Authority proof exit refused: ${decision.code}`);

  const delivered: AuthorityCommand[] = [];
  const ports = Object.freeze({
    character: (command: AuthorityCommand) => delivered.push(command),
    vehicle: (command: AuthorityCommand) => delivered.push(command),
  });
  const arbiter = createInputAuthorityArbiter({
    context: SESSION_CONTEXT,
    authority: Object.freeze({
      consumer: 'VEHICLE' as const,
      vehicleId: fixture.vehicle.vehicleId,
    }),
  });
  arbiter.setAction('throttle', true);
  for (let tick = 1; tick < decision.tick; tick += 1) {
    const result = arbiter.step({ tick, characterYawRad: 0 });
    arbiter.deliver(result, 'VEHICLE', ports);
  }
  const vehicleCommandsBefore = delivered.length;

  const transitioned = arbiter.setAuthority(decision.authority);
  if (!transitioned) throw new Error('The authority did not return to the character');
  const afterTick = arbiter.step({
    tick: decision.tick,
    characterYawRad: decision.start.yawRad,
  });
  // The vehicle is not the active consumer any more: its delivery is refused before any command
  // reaches it. It is the first delivery of the tick, so the refusal is the target check, not the
  // double-delivery gate.
  let vehicleRefusalCode = '';
  try {
    arbiter.deliver(afterTick, 'VEHICLE', ports);
  } catch (error) {
    vehicleRefusalCode = (error as { code?: string }).code ?? 'UNKNOWN';
  }
  arbiter.deliver(afterTick, 'CHARACTER', ports);
  const characterCommandsAfter = delivered.length - vehicleCommandsBefore;
  const vehicleCommandsAfter = delivered.length - vehicleCommandsBefore - characterCommandsAfter;
  let doubleDeliveryCode = '';
  try {
    arbiter.deliver(afterTick, 'CHARACTER', ports);
  } catch (error) {
    doubleDeliveryCode = (error as { code?: string }).code ?? 'UNKNOWN';
  }

  const secondExit = decideVehicleExit({
    ...request,
    tick: decision.tick,
    authority: decision.authority,
    previousExit: decision.journal,
  });
  const reExit = decideVehicleExit({
    ...request,
    tick: decision.tick,
    authority: decision.authority,
  });
  const startWorld = walkWorldOf(fixture.world, fixture.vehicles);
  let startAccepted = true;
  try {
    createWalker({ world: startWorld, start: decision.start });
  } catch {
    startAccepted = false;
  }
  return Object.freeze({
    authorityConsumer: decision.authority.consumer,
    commandConsumer: afterTick.command.consumer,
    characterId: decision.authority.consumer === 'CHARACTER' ? decision.authority.characterId : '',
    vehicleCommandsBefore,
    characterCommandsAfter,
    vehicleCommandsAfter,
    vehicleDeliveryRefused: vehicleRefusalCode === 'INACTIVE_CONSUMER_REFUSED',
    vehicleRefusalCode,
    doubleDeliveryRefused: doubleDeliveryCode === 'DOUBLE_DELIVERY_REFUSED',
    doubleDeliveryCode,
    neutralizedActions: afterTick.neutralized,
    characterCommandEmpty:
      afterTick.command.consumer === 'CHARACTER' && isCharacterCommandEmpty(afterTick.command),
    transitions: arbiter.getStats().transitions,
    entityCountBefore: decision.entities.before,
    entityCountAfter: decision.entities.after,
    secondExitSameTickRefused: !secondExit.accepted && secondExit.code === 'DOUBLE_EXIT_REFUSED',
    secondExitSameTickCode: secondExit.accepted ? 'ACCEPTED' : secondExit.code,
    reExitAfterReleaseCode: reExit.accepted ? 'ACCEPTED' : reExit.code,
    startAccepted,
    startPositionBits: characterPositionBits(decision.start.positionM),
  });
}

interface ResumeField {
  readonly field: string;
  readonly baseline: string;
  readonly released: string;
  readonly identical: boolean;
}

interface ResumeProof {
  readonly vehicleId: string;
  readonly baselineMode: string;
  readonly previousMode: string;
  readonly mode: string;
  readonly bitsBaseline: string;
  readonly bitsReleased: string;
  readonly bitsIdentical: boolean;
  readonly fields: readonly ResumeField[];
}

function resumeField(field: string, baseline: unknown, released: unknown): ResumeField {
  const left = JSON.stringify(baseline);
  const right = JSON.stringify(released);
  return Object.freeze({ field, baseline: left, released: right, identical: left === right });
}

function resumeProof(): readonly ResumeProof[] {
  const civilBase = streetExit();
  const civilManual = manual(civilBase.preTakeover, {
    tick: EXIT_TICK - 1,
    laneId: 'lane:manual-drift',
    routeLaneIds: ['lane:manual-drift-a', 'lane:manual-drift-b'],
    rideProgressM: 37.5,
  });
  const taxiBase = taxiExit();
  const taxiManual = manual(taxiBase.preTakeover, {
    tick: EXIT_TICK - 1,
    laneId: 'lane:manual-drift',
    routeLaneIds: ['lane:manual-drift-a'],
    rideProgressM: 449.75,
  });

  return Object.freeze(
    [
      { fixture: fixtureOf(civilBase.world, civilBase.preTakeover, civilManual), id: 'civil' },
      { fixture: fixtureOf(taxiBase.world, taxiBase.preTakeover, taxiManual), id: 'taxi' },
    ].map(({ fixture }) => {
      const decision = decideVehicleExit(requestOf(fixture));
      if (!decision.accepted) throw new Error(`Resume proof exit refused: ${decision.code}`);
      const baseline = fixture.preTakeover;
      const released = decision.vehicle;
      const fields = Object.freeze([
        resumeField('state.laneId', baseline.state.laneId, released.state.laneId),
        resumeField('state.routeLaneIds', baseline.state.routeLaneIds, released.state.routeLaneIds),
        resumeField('state.rideId', baseline.state.rideId, released.state.rideId),
        resumeField(
          'state.rideProgressM',
          baseline.state.rideProgressM,
          released.state.rideProgressM,
        ),
      ]);
      return Object.freeze({
        vehicleId: released.vehicleId,
        baselineMode: decision.baselineMode,
        previousMode: decision.previousMode,
        mode: decision.mode,
        bitsBaseline: vehicleExitRouteBits(baseline.state),
        bitsReleased: vehicleExitRouteBits(released.state),
        bitsIdentical: decision.bits.identical,
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
  const fixture = streetExit();
  const request = requestOf(fixture, { tick: PROOF_TICK });
  const decision = decideVehicleExit(request);
  if (!decision.accepted) throw new Error(`Camera proof exit refused: ${decision.code}`);
  const world = Object.freeze({ minX: -400, maxX: 400, minZ: -400, maxZ: 400, groundM: 0 });
  const camera = createCharacterCamera({ world, control: cameraControl() });
  const vehicleTarget: CharacterCameraTarget = Object.freeze({
    entityId: fixture.vehicle.vehicleId,
    kind: 'VEHICLE' as const,
    positionM: fixture.vehicle.positionM,
    yawRad: fixture.vehicle.yawRad,
    anchorHeightM: (fixture.vehicle.topM - fixture.vehicle.bottomM) / 2,
  });
  const characterTarget: CharacterCameraTarget = Object.freeze({
    entityId: CHARACTER_ID,
    kind: 'CHARACTER' as const,
    positionM: decision.character.positionM,
    yawRad: decision.character.yawRad,
    anchorHeightM: MEASURED.eyeHeightM,
  });
  const targets = Object.freeze([vehicleTarget, characterTarget]);
  for (let tick = 1; tick < decision.tick; tick += 1) {
    camera.step({
      tick,
      authorityEntityId: fixture.vehicle.vehicleId,
      targets,
      groundM: decision.exit.groundM,
    });
  }
  const frame = camera.step({
    tick: decision.tick,
    authorityEntityId: decision.camera.authorityEntityId,
    targets,
    groundM: decision.exit.groundM,
  });
  let transitionFrames = frame.transitioning ? 1 : 0;
  let everyFrameIsAuthority = frame.entityId === CHARACTER_ID;
  let remainingEnd = frame.transitionRemainingTicks;
  for (let index = 1; index < CHARACTER_CAMERA_POLICY.transitionTicks; index += 1) {
    const next = camera.step({
      tick: decision.tick + index,
      authorityEntityId: decision.camera.authorityEntityId,
      targets,
      groundM: decision.exit.groundM,
    });
    if (next.entityId !== CHARACTER_ID) everyFrameIsAuthority = false;
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

export interface ExitReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly tickHz: number;
  readonly policy: typeof VEHICLE_EXIT_POLICY;
  readonly reference: Readonly<{
    mapId: string;
    cityElements: number;
    surfaces: number;
    blockers: number;
    characterRadiusM: number;
    characterHeightM: number;
    vehicleColliderHalfExtentsM: Readonly<{ x: number; z: number }>;
    sidewalkElevationM: number;
  }>;
  readonly scenarios: readonly ScenarioRow[];
  readonly authority: AuthorityProof;
  readonly resumption: readonly ResumeProof[];
  readonly camera: CameraProof;
  readonly summary: Readonly<{
    scenarios: number;
    scenariosPassed: number;
    criterion1: boolean;
    criterion2a: boolean;
    criterion2b: boolean;
    camera: boolean;
    walkerStart: boolean;
    pass: boolean;
  }>;
  readonly determinism: Readonly<{ runs: number; identical: boolean; digest: string }>;
  readonly limitations: readonly string[];
}

function buildReport(): Omit<ExitReport, 'determinism'> {
  const real = realWalkWorld();
  const sedan = sedanWalkFootprint();
  const rows = Object.freeze(scenarios().map((scenarioValue) => scenarioRow(scenarioValue)));
  const authority = authorityProof();
  const resumption = resumeProof();
  const camera = cameraProof();
  const scenariosPassed = rows.filter((row) => row.verdict === 'PASS').length;

  const accepted = rows.filter((row) => row.result === 'ACCEPTED');
  const nextValid = rows.some(
    (row) =>
      row.result === 'ACCEPTED' &&
      row.candidates.length > 1 &&
      row.candidates.some((candidate) => !candidate.valid) &&
      row.candidates[row.candidates.length - 1]!.valid,
  );
  const colliderRefusals = rows.reduce(
    (total, row) => ({
      candidates: total.candidates + row.colliderRefusals.candidates,
      refusedByWalker: total.refusedByWalker + row.colliderRefusals.refusedByWalker,
    }),
    { candidates: 0, refusedByWalker: 0 },
  );
  const criterion1 =
    rows.every((row) => row.verdict === 'PASS') &&
    accepted.length >= 7 &&
    nextValid &&
    rows.some((row) => row.code === 'NO_VALID_EXIT') &&
    rows.some((row) => row.code === 'VEHICLE_MOVING') &&
    rows.some((row) => row.code === 'NOT_CONTROLLED') &&
    rows.some((row) => row.code === 'DOUBLE_EXIT_REFUSED') &&
    accepted.every(
      (row) =>
        row.measured !== null &&
        row.measured.maxPenetrationM === 0 &&
        row.measured.minClearanceM >= 0 &&
        row.measured.groundClearanceM === 0 &&
        row.walkerStart === 'ACCEPTED',
    );

  const criterion2a =
    authority.authorityConsumer === 'CHARACTER' &&
    authority.commandConsumer === 'CHARACTER' &&
    authority.characterCommandsAfter === 1 &&
    authority.vehicleCommandsAfter === 0 &&
    authority.vehicleDeliveryRefused &&
    authority.vehicleRefusalCode === 'INACTIVE_CONSUMER_REFUSED' &&
    authority.doubleDeliveryRefused &&
    authority.doubleDeliveryCode === 'DOUBLE_DELIVERY_REFUSED' &&
    authority.neutralizedActions.includes('throttle') &&
    authority.characterCommandEmpty &&
    authority.transitions === 1 &&
    authority.entityCountBefore === authority.entityCountAfter &&
    authority.secondExitSameTickRefused &&
    authority.reExitAfterReleaseCode === 'NOT_CONTROLLED' &&
    authority.startAccepted;

  const criterion2b =
    resumption.length === 2 &&
    resumption.every(
      (entry) =>
        entry.mode === 'AUTO' &&
        entry.bitsIdentical &&
        entry.fields.every((field) => field.identical),
    ) &&
    resumption.some((entry) => entry.baselineMode === 'LEARNING') &&
    resumption.some(
      (entry) =>
        entry.fields.some((field) => field.field === 'state.rideId' && field.baseline !== 'null') &&
        entry.fields.some(
          (field) => field.field === 'state.rideProgressM' && field.baseline !== '0',
        ),
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

  const walkerStart =
    colliderRefusals.candidates > 0 &&
    colliderRefusals.refusedByWalker === colliderRefusals.candidates &&
    accepted.every((row) => row.walkerStart === 'ACCEPTED');

  return {
    generatedBy: 'scripts/run-v3-exit-report.mjs',
    command: EXIT_REPORT_COMMAND,
    contract: EXIT_REPORT_CONTRACT,
    tickHz: VEHICLE_EXIT_POLICY.tickHz,
    policy: VEHICLE_EXIT_POLICY,
    reference: {
      mapId: real.mapId,
      cityElements: real.elementCount,
      surfaces: real.world.stats.surfaces,
      blockers: real.world.stats.blockers,
      characterRadiusM: CAPSULE.radiusM,
      characterHeightM: CAPSULE.heightM,
      vehicleColliderHalfExtentsM: sedan.halfExtentsM,
      sidewalkElevationM: SIDEWALK_ELEVATION_M,
    },
    scenarios: rows,
    authority,
    resumption,
    camera,
    summary: {
      scenarios: rows.length,
      scenariosPassed,
      criterion1,
      criterion2a,
      criterion2b,
      camera: cameraOk,
      walkerStart,
      pass: criterion1 && criterion2a && criterion2b && cameraOk && walkerStart,
    },
    limitations: [
      'Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri; compunerea (input 066, camera 194, vehiculul 024) aplică decizia în tick-ul curent.',
      'Punctul de ieșire este planar, ca fizica 192: se măsoară în X/Z, iar verticalitatea intră doar prin înălțimea suprafeței și prin plafonul real de 0,14 m. Un portal, o trapă sau un gard suspendat nu sunt modelate.',
      'Punctul este mijlocul flancului sau al capului caroseriei, nu un mâner modelat; inelul al doilea este la 0,60 m, deci o mașină parcată la mai puțin de 0,80 m de un zid nu are o ieșire „prin” zid.',
      'Registrul 068 scrie doar `tick`, `controlMode` și `appliedProfileVersion`; ruta, banda, cursa și progresul restaurate sunt returnate ca date și trebuie aplicate de proprietarul 061/044. Contractul compară datele returnate bit-identic cu snapshot-ul de dinainte de preluare, dar nu poate muta singur registrul flotei.',
      'Progresul pe rută este cel de dinainte de preluare, nu cel condus manual: segmentul MANUAL/LEARNING se închide separat (069), iar poziția fizică a mașinii rămâne cea reală. Dacă designul cere ca progresul manual să continue cursa, baseline-ul trebuie să fie starea curentă și contractul nu este locul potrivit.',
      'Regula mașinii în mișcare este explicită: peste viteza nominală a clipului de mers din 191 (1,3710 m/s) ieșirea este refuzată cu `VEHICLE_MOVING`; sub ea, punctul se calculează din poza mașinii din același tick.',
      'Mapa este planul de sol implicit: o suprafață sub el este refuzată cu `BELOW_MAP`. O hartă autorată cu alt plan de bază trebuie să își declare propriul `defaultGroundM`.',
      'Proba este deterministă și headless; feel-ul ieșirii, animația `exit-vehicle` din 191 și validarea în browser rămân la integrarea 196.',
    ],
  };
}

/** Stable SHA-256 over the report payload, excluding the digest field itself. */
export function exitReportDigest(report: Omit<ExitReport, 'determinism'>): string {
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
        resumption: report.resumption,
        camera: report.camera,
        summary: report.summary,
        limitations: report.limitations,
      }),
    )
    .digest('hex');
}

export function runExitReport(): ExitReport {
  const first = buildReport();
  const second = buildReport();
  const identical = JSON.stringify(first) === JSON.stringify(second);
  return { ...first, determinism: { runs: 2, identical, digest: exitReportDigest(first) } };
}
