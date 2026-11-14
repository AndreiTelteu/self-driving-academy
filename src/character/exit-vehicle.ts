/**
 * PBI 196 — leaving the car at a point that is physically valid for the walking body.
 *
 * The transition is a pure contract: no clock, no DOM, no Babylon, no `Math.random` and no
 * simulation service. It receives the car held by the player seat (PBI 068), the snapshot the car
 * had before the 195 takeover, the walking body of PBI 191/192, every other car and the walk world
 * of PBI 192, and it returns either one accepted release or one refusal with a code from a closed
 * vocabulary. Nothing it receives is mutated: every returned record is a fresh frozen copy.
 *
 * Criterion 1 is the exit point, not "somewhere near the car". A candidate is a point outside the
 * body, tested in a fixed order: the two flanks of the real 0.85 × 2.00 m collider, then the rear
 * and the front, each at the contact clearance first and one short step (0.60 m) further out only
 * when the whole first ring fails. A candidate is admitted only when the real 0.300 × 0.260 m
 * footprint (radius 0.150 m) keeps its free gap to the car body, to every other car and to every
 * authored solid, when the ground under it is the authored surface (never a hole below the map
 * plane), and when the step onto that ground is within the real 0.14 m curb ceiling of 192. The
 * refusals per candidate are `SOLID`, `OTHER_VEHICLE`, `STEP_TOO_HIGH` and `BELOW_MAP`; when no
 * candidate survives, the exit itself is refused with `NO_VALID_EXIT` and the body is not moved
 * anywhere.
 *
 * Criterion 2 is structural. The acceptance carries the single PBI 193 authority back to the
 * character (`CHARACTER:<id>`), the exact 194 camera request for the same tick, the released car
 * with `controlMode` set to `AUTO` and the route assignment it had before the takeover (lane,
 * route lanes, ride id and ride progress), fingerprinted with IEEE-754 bytes so a single changed
 * bit is detectable. A second exit at the same fixed tick is `DOUBLE_EXIT_REFUSED`, and a car that
 * is already `AUTO` or moving faster than the 191 walk clip is refused with `NOT_CONTROLLED` or
 * `VEHICLE_MOVING` instead of producing a teleport.
 */
import type { InputAuthority } from '../input';
import type { ControlMode, VehicleState } from '../vehicles';
import { CHARACTER_CAMERA_POLICY } from './character-camera';
import { CHARACTER_SAMPLING_HZ } from './clips';
import type { VehicleEntryState, VehicleEntryVehicle } from './enter-vehicle';
import type { CharacterPoint } from './skeleton';
import {
  createOrientedRectanglePolygon,
  walkPolygonContains,
  walkPolygonDistanceM,
  type WalkPolygon,
} from './walk-geometry';
import {
  WALK_BLOCKER_KINDS,
  WALK_SURFACE_KINDS,
  type WalkBlocker,
  type WalkSurface,
} from './walk-world';
import { WALKER_GAIT_SPEEDS_MPS, WALKER_POLICY } from './walker';

export const EXIT_VEHICLE_CONTRACT_VERSION = '196-exit-vehicle-v1' as const;

export const VEHICLE_EXIT_POLICY = Object.freeze({
  contract: EXIT_VEHICLE_CONTRACT_VERSION,
  /** Same fixed tick as the walker (192), the input authority (193), the camera (194) and 195. */
  tickHz: CHARACTER_SAMPLING_HZ,
  /** The only mode a release may impose; the vehicle owner keeps MANUAL and LEARNING untouched. */
  releaseMode: 'AUTO' as const,
  /** Free gap kept between the 191 footprint and a car body, exactly the 192 vehicle margin. */
  clearanceM: WALKER_POLICY.vehicleContactMarginM,
  /** Second candidate ring: one short step further out than the contact clearance. */
  stepOutM: 0.6,
  /** Longest rise/drop admitted when stepping onto the exit ground: the real 0.14 m curb. */
  maxGroundStepM: WALKER_POLICY.stepCeilingM,
  /** Above the real 191 walk clip speed a body may not step out of a moving car. */
  maxExitSpeedMps: WALKER_GAIT_SPEEDS_MPS.WALK,
  /** The existing 194 transition length; the camera proof reuses it instead of inventing one. */
  cameraTransitionTicks: CHARACTER_CAMERA_POLICY.transitionTicks,
});

/** Real-world refusals. The last one is the tick rule; the others are physical conditions. */
export const VEHICLE_EXIT_REFUSAL_CODES = Object.freeze([
  'NOT_CONTROLLED',
  'UNKNOWN_VEHICLE',
  'VEHICLE_MOVING',
  'NO_VALID_EXIT',
  'DOUBLE_EXIT_REFUSED',
] as const);
export type VehicleExitRefusalCode = (typeof VEHICLE_EXIT_REFUSAL_CODES)[number];

/** Why one candidate point was not admitted. It is a closed vocabulary, recorded per attempt. */
export const EXIT_CANDIDATE_REFUSAL_CODES = Object.freeze([
  'SOLID',
  'OTHER_VEHICLE',
  'STEP_TOO_HIGH',
  'BELOW_MAP',
] as const);
export type ExitCandidateRefusalCode = (typeof EXIT_CANDIDATE_REFUSAL_CODES)[number];

/** Contract violations are thrown, never reported as a normal refusal. */
export const VEHICLE_EXIT_ERROR_CODES = Object.freeze([
  'INVALID_EXIT_INPUT',
  'INVALID_EXIT_TICK',
  'INVALID_EXIT_WORLD',
  'INVALID_EXIT_VEHICLE',
  'INVALID_EXIT_STATE',
] as const);
export type VehicleExitErrorCode = (typeof VEHICLE_EXIT_ERROR_CODES)[number];

export class VehicleExitError extends Error {
  readonly code: VehicleExitErrorCode;

  constructor(code: VehicleExitErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'VehicleExitError';
    this.code = code;
  }
}

/** The same preserved vehicle state 195 reads and writes; it is not a second contract. */
export type VehicleExitState = VehicleEntryState;
export type VehicleExitVehicle = VehicleEntryVehicle;

export const VEHICLE_EXIT_SIDES = Object.freeze(['LEFT', 'RIGHT', 'REAR', 'FRONT'] as const);
export type VehicleExitSide = (typeof VEHICLE_EXIT_SIDES)[number];

/** The 192 walking body, without a position: the exit point is what this contract computes. */
export interface VehicleExitCharacterBody {
  readonly entityId: string;
  /** Capsule radius/height measured by 192 from the PBI 191 footprint and height. */
  readonly radiusM: number;
  readonly heightM: number;
}

/** The walk world of 192 as plain data; the same surfaces and solids the walker was created with. */
export interface VehicleExitWorld {
  readonly surfaces: readonly WalkSurface[];
  readonly blockers: readonly WalkBlocker[];
  /** Map plane used where no slab was authored; a slab below it is a hole, not an exit. */
  readonly defaultGroundM: number;
}

export interface VehicleExitRequest {
  /** The fixed tick of the exit; any non-negative safe integer is admitted. */
  readonly tick: number;
  /** The PBI 193 authority for this tick; it must hold exactly the car being left. */
  readonly authority: InputAuthority;
  readonly character: VehicleExitCharacterBody;
  /** The car as the PBI 068 owner holds it in this tick; it must be MANUAL or LEARNING. */
  readonly vehicle: VehicleExitVehicle;
  /** The preserved snapshot taken before the 195 takeover: the route the car must resume. */
  readonly preTakeover: VehicleExitVehicle;
  /** Every car in the fleet snapshot; the exit point may not appear inside another body. */
  readonly vehicles: readonly VehicleExitVehicle[];
  readonly world: VehicleExitWorld;
  /** The last accepted exit, used to refuse a second exit in the same tick. */
  readonly previousExit: Readonly<{ tick: number; vehicleId: string }> | null;
}

export interface VehicleExitCandidate {
  readonly index: number;
  /** Stable id such as `LEFT:R0` or `REAR:R1`. */
  readonly id: string;
  readonly side: VehicleExitSide;
  /** 0 is the contact-clearance ring, 1 is the step-out ring. */
  readonly ring: 0 | 1;
  /** Distance from the flank or end face to the candidate centre, in metres. */
  readonly offsetM: number;
  /** Candidate feet centre; `y` is the authored ground under the point, never below it. */
  readonly positionM: CharacterPoint;
  readonly groundM: number;
  /** Ground minus the car ground contact: the step the 192 walker would take. */
  readonly groundStepM: number;
  readonly valid: boolean;
  readonly code: ExitCandidateRefusalCode | null;
  readonly blockerId: string | null;
  readonly detail: string;
  /** Smallest free gap to a solid, after the solid's own 192 margin; infinite when none is near. */
  readonly clearanceM: number;
  readonly nearestBlockerId: string | null;
}

/** Exactly the PBI 194 step fields that carry the new authority in the exit tick. */
export interface VehicleExitCameraRequest {
  readonly tick: number;
  /** The 194 `authorityEntityId`: the character id carried by the 193 authority. */
  readonly authorityEntityId: string;
  readonly previousEntityId: string;
}

export interface VehicleExitEntityCounts {
  readonly before: number;
  readonly after: number;
  readonly vehicles: number;
  readonly characters: number;
}

/** The exact PBI 192 `WalkerOptions.start` the release hands to the walker. */
export interface VehicleExitStart {
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
}

export interface VehicleExitAcceptance {
  readonly accepted: true;
  readonly tick: number;
  readonly vehicleId: string;
  /** The single PBI 193 authority after the transition. */
  readonly authority: InputAuthority;
  readonly previousAuthority: InputAuthority;
  /** The character body moved to the exit point; the same entity, no clone. */
  readonly character: VehicleExitCharacterBody &
    Readonly<{ positionM: CharacterPoint; yawRad: number }>;
  readonly start: VehicleExitStart;
  /** The car with `controlMode` set to AUTO and the pre-takeover route assignment restored. */
  readonly vehicle: VehicleExitVehicle;
  readonly previousMode: ControlMode;
  readonly baselineMode: ControlMode;
  readonly mode: 'AUTO';
  readonly exit: Readonly<{
    candidateId: string;
    side: VehicleExitSide;
    ring: 0 | 1;
    offsetM: number;
    positionM: CharacterPoint;
    groundM: number;
    groundStepM: number;
    clearanceM: number;
    nearestBlockerId: string | null;
    attempts: number;
  }>;
  /** Every candidate tested, in order, up to and including the chosen one. */
  readonly candidates: readonly VehicleExitCandidate[];
  readonly entities: VehicleExitEntityCounts;
  readonly camera: VehicleExitCameraRequest;
  /** Route fingerprint of the pre-takeover snapshot and of the released car; they must match. */
  readonly bits: Readonly<{ baseline: string; released: string; identical: boolean }>;
  /** Journal entry a caller feeds back as `previousExit` on the next tick. */
  readonly journal: Readonly<{ tick: number; vehicleId: string }>;
}

export interface VehicleExitRefusal {
  readonly accepted: false;
  readonly tick: number;
  readonly vehicleId: string | null;
  readonly code: VehicleExitRefusalCode;
  readonly detail: string;
  /** Planar speed of the car at the refusal tick; null when the car was not even resolved. */
  readonly speedMps: number | null;
  /** Candidates tested before the refusal; empty for the refusals decided before the point. */
  readonly candidates: readonly VehicleExitCandidate[];
}

export type VehicleExitDecision = VehicleExitAcceptance | VehicleExitRefusal;

const CONTROL_MODES = Object.freeze(['AUTO', 'MANUAL', 'LEARNING'] as const);
const MANEUVER_STATES = Object.freeze([
  'IDLE',
  'FOLLOWING',
  'STOPPING',
  'TURNING',
  'LANE_CHANGING',
  'RECOVERING',
] as const satisfies readonly VehicleState['maneuverState'][]);
const DRIVER_KINDS = Object.freeze(['TAXI', 'CIVILIAN'] as const);
const AVAILABILITIES = Object.freeze(['AVAILABLE', 'DAMAGED', 'IMMOBILIZED'] as const);
const RINGS = Object.freeze([0, 1] as const);

interface SideSpec {
  readonly side: VehicleExitSide;
  /** Unit direction in the car frame: +X right, +Z forward, exactly the 023 chassis frame. */
  readonly localX: number;
  readonly localZ: number;
  /** Which half size of the real collider the ring starts from. */
  readonly extent: 'x' | 'z';
}

/** Fixed order: the two PBI 195 doors first, then rear and front; ring 0 before ring 1. */
const EXIT_SIDES: readonly SideSpec[] = Object.freeze([
  Object.freeze({ side: 'LEFT' as const, localX: -1, localZ: 0, extent: 'x' as const }),
  Object.freeze({ side: 'RIGHT' as const, localX: 1, localZ: 0, extent: 'x' as const }),
  Object.freeze({ side: 'REAR' as const, localX: 0, localZ: -1, extent: 'z' as const }),
  Object.freeze({ side: 'FRONT' as const, localX: 0, localZ: 1, extent: 'z' as const }),
]);

const EPSILON = 1e-9;

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(code: VehicleExitErrorCode, detail: string): never {
  throw new VehicleExitError(code, detail);
}

function finite(value: unknown, label: string, code: VehicleExitErrorCode): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(code, `${label} must be finite`);
  return value;
}

function text(value: unknown, label: string, code: VehicleExitErrorCode): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    fail(code, `${label} must be a non-empty string`);
  return value;
}

function nullableText(value: unknown, label: string, code: VehicleExitErrorCode): string | null {
  if (value === null || value === undefined) return null;
  return text(value, label, code);
}

function tickOf(value: unknown, label: string, code: VehicleExitErrorCode): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(code, `${label} must be a safe non-negative integer`);
  return value;
}

function memberOf<T extends string>(
  value: unknown,
  admitted: readonly T[],
  label: string,
  code: VehicleExitErrorCode,
): T {
  if (typeof value !== 'string' || !(admitted as readonly string[]).includes(value))
    fail(code, `${label} must be one of ${admitted.join(', ')}`);
  return value as T;
}

function readPoint(value: unknown, label: string, code: VehicleExitErrorCode): CharacterPoint {
  if (!isRecord(value)) fail(code, `${label} must be a point`);
  return point(
    finite(value.x, `${label}.x`, code),
    finite(value.y, `${label}.y`, code),
    finite(value.z, `${label}.z`, code),
  );
}

function readAuthority(value: unknown): InputAuthority {
  if (!isRecord(value)) fail('INVALID_EXIT_INPUT', 'authority must be a plain object');
  if (value.consumer === 'CHARACTER')
    return Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: text(value.characterId, 'authority.characterId', 'INVALID_EXIT_INPUT'),
    });
  if (value.consumer === 'VEHICLE')
    return Object.freeze({
      consumer: 'VEHICLE' as const,
      vehicleId: text(value.vehicleId, 'authority.vehicleId', 'INVALID_EXIT_INPUT'),
    });
  return fail('INVALID_EXIT_INPUT', 'authority.consumer must be CHARACTER or VEHICLE');
}

function readCharacter(value: unknown): VehicleExitCharacterBody {
  if (!isRecord(value)) fail('INVALID_EXIT_INPUT', 'character body is required');
  const radiusM = finite(value.radiusM, 'character.radiusM', 'INVALID_EXIT_INPUT');
  const heightM = finite(value.heightM, 'character.heightM', 'INVALID_EXIT_INPUT');
  if (radiusM <= 0 || heightM <= 0)
    fail('INVALID_EXIT_INPUT', 'the character capsule must be positive');
  return Object.freeze({
    entityId: text(value.entityId, 'character.entityId', 'INVALID_EXIT_INPUT'),
    radiusM,
    heightM,
  });
}

function readPolygon(value: unknown, label: string, code: VehicleExitErrorCode): WalkPolygon {
  if (!isRecord(value)) fail(code, `${label} must be a polygon`);
  const vertices = Array.isArray(value.vertices) ? value.vertices : null;
  if (!vertices || vertices.length < 3) fail(code, `${label} needs three vertices`);
  const points = vertices.map((vertex, index) => {
    if (!isRecord(vertex)) fail(code, `${label} vertex ${index} must be a point`);
    return Object.freeze({
      x: finite(vertex.x, `${label} vertex ${index} x`, code),
      z: finite(vertex.z, `${label} vertex ${index} z`, code),
    });
  });
  return Object.freeze({
    id: label,
    vertices: Object.freeze(points),
    bounds: Object.freeze({
      minX: Math.min(...points.map((vertex) => vertex.x)),
      maxX: Math.max(...points.map((vertex) => vertex.x)),
      minZ: Math.min(...points.map((vertex) => vertex.z)),
      maxZ: Math.max(...points.map((vertex) => vertex.z)),
    }),
  });
}

function readSurface(value: unknown): WalkSurface {
  if (!isRecord(value)) fail('INVALID_EXIT_WORLD', 'surface must be a plain object');
  const id = text(value.id, 'surface.id', 'INVALID_EXIT_WORLD');
  return Object.freeze({
    id,
    kind: memberOf(value.kind, WALK_SURFACE_KINDS, `surface ${id} kind`, 'INVALID_EXIT_WORLD'),
    topM: finite(value.topM, `surface ${id} topM`, 'INVALID_EXIT_WORLD'),
    polygon: readPolygon(value.polygon, id, 'INVALID_EXIT_WORLD'),
  });
}

function readBlocker(value: unknown): WalkBlocker {
  if (!isRecord(value)) fail('INVALID_EXIT_WORLD', 'blocker must be a plain object');
  const id = text(value.id, 'blocker.id', 'INVALID_EXIT_WORLD');
  const bottomM = finite(value.bottomM, `blocker ${id} bottomM`, 'INVALID_EXIT_WORLD');
  const topM = finite(value.topM, `blocker ${id} topM`, 'INVALID_EXIT_WORLD');
  if (topM <= bottomM) fail('INVALID_EXIT_WORLD', `blocker ${id} has no vertical extent`);
  const marginM = finite(value.marginM, `blocker ${id} marginM`, 'INVALID_EXIT_WORLD');
  if (marginM < 0) fail('INVALID_EXIT_WORLD', `blocker ${id} margin is negative`);
  return Object.freeze({
    id,
    kind: memberOf(value.kind, WALK_BLOCKER_KINDS, `blocker ${id} kind`, 'INVALID_EXIT_WORLD'),
    bottomM,
    topM,
    marginM,
    polygon: readPolygon(value.polygon, id, 'INVALID_EXIT_WORLD'),
  });
}

function readWorld(value: unknown): VehicleExitWorld {
  if (!isRecord(value)) fail('INVALID_EXIT_WORLD', 'world must be a plain object');
  if (!Array.isArray(value.surfaces)) fail('INVALID_EXIT_WORLD', 'surfaces must be an array');
  if (!Array.isArray(value.blockers)) fail('INVALID_EXIT_WORLD', 'blockers must be an array');
  const surfaces: WalkSurface[] = [];
  const seenSurfaces = new Set<string>();
  for (const entry of value.surfaces) {
    const surface = readSurface(entry);
    if (seenSurfaces.has(surface.id)) fail('INVALID_EXIT_WORLD', `duplicate surface ${surface.id}`);
    seenSurfaces.add(surface.id);
    surfaces.push(surface);
  }
  const blockers: WalkBlocker[] = [];
  const seenBlockers = new Set<string>();
  for (const entry of value.blockers) {
    const blocker = readBlocker(entry);
    if (seenBlockers.has(blocker.id)) fail('INVALID_EXIT_WORLD', `duplicate blocker ${blocker.id}`);
    seenBlockers.add(blocker.id);
    blockers.push(blocker);
  }
  return Object.freeze({
    surfaces: Object.freeze(surfaces),
    blockers: Object.freeze(blockers),
    defaultGroundM: finite(value.defaultGroundM, 'world.defaultGroundM', 'INVALID_EXIT_WORLD'),
  });
}

function readState(value: unknown, vehicleId: string): VehicleExitState {
  if (!isRecord(value))
    fail('INVALID_EXIT_VEHICLE', `state of vehicle ${vehicleId} must be a plain object`);
  if (!Array.isArray(value.routeLaneIds))
    fail('INVALID_EXIT_VEHICLE', `state of vehicle ${vehicleId} needs routeLaneIds`);
  const routeLaneIds = Object.freeze(
    value.routeLaneIds.map((laneId, index) =>
      text(laneId, `state of vehicle ${vehicleId} routeLaneIds[${index}]`, 'INVALID_EXIT_VEHICLE'),
    ),
  );
  const progressM = finite(
    value.rideProgressM,
    `state of vehicle ${vehicleId} rideProgressM`,
    'INVALID_EXIT_VEHICLE',
  );
  if (progressM < 0)
    fail('INVALID_EXIT_VEHICLE', `state of vehicle ${vehicleId} has negative ride progress`);
  return Object.freeze({
    tick: tickOf(value.tick, `state of vehicle ${vehicleId} tick`, 'INVALID_EXIT_VEHICLE'),
    controlMode: memberOf(
      value.controlMode,
      CONTROL_MODES,
      `state of vehicle ${vehicleId} controlMode`,
      'INVALID_EXIT_VEHICLE',
    ),
    velocityMps: readPoint(
      value.velocityMps,
      `state of vehicle ${vehicleId} velocityMps`,
      'INVALID_EXIT_VEHICLE',
    ),
    laneId: nullableText(
      value.laneId,
      `state of vehicle ${vehicleId} laneId`,
      'INVALID_EXIT_VEHICLE',
    ),
    maneuverState: memberOf(
      value.maneuverState,
      MANEUVER_STATES,
      `state of vehicle ${vehicleId} maneuverState`,
      'INVALID_EXIT_VEHICLE',
    ),
    routeLaneIds,
    rideId: nullableText(
      value.rideId,
      `state of vehicle ${vehicleId} rideId`,
      'INVALID_EXIT_VEHICLE',
    ),
    rideProgressM: progressM,
    appliedProfileVersion: text(
      value.appliedProfileVersion,
      `state of vehicle ${vehicleId} appliedProfileVersion`,
      'INVALID_EXIT_VEHICLE',
    ),
  });
}

function readVehicle(value: unknown): VehicleExitVehicle {
  if (!isRecord(value)) fail('INVALID_EXIT_VEHICLE', 'vehicle must be a plain object');
  const vehicleId = text(value.vehicleId, 'vehicle.vehicleId', 'INVALID_EXIT_VEHICLE');
  const halfExtents = isRecord(value.halfExtentsM) ? value.halfExtentsM : null;
  if (!halfExtents) fail('INVALID_EXIT_VEHICLE', `vehicle ${vehicleId} needs halfExtentsM`);
  const halfX = finite(halfExtents.x, `vehicle ${vehicleId} half x`, 'INVALID_EXIT_VEHICLE');
  const halfZ = finite(halfExtents.z, `vehicle ${vehicleId} half z`, 'INVALID_EXIT_VEHICLE');
  if (halfX <= 0 || halfZ <= 0)
    fail('INVALID_EXIT_VEHICLE', `vehicle ${vehicleId} has no footprint`);
  const bottomM = finite(value.bottomM, `vehicle ${vehicleId} bottomM`, 'INVALID_EXIT_VEHICLE');
  const topM = finite(value.topM, `vehicle ${vehicleId} topM`, 'INVALID_EXIT_VEHICLE');
  if (topM <= bottomM) fail('INVALID_EXIT_VEHICLE', `vehicle ${vehicleId} has no vertical extent`);
  return Object.freeze({
    vehicleId,
    driverKind: memberOf(
      value.driverKind,
      DRIVER_KINDS,
      `vehicle ${vehicleId} driverKind`,
      'INVALID_EXIT_VEHICLE',
    ),
    classId: text(value.classId, `vehicle ${vehicleId} classId`, 'INVALID_EXIT_VEHICLE'),
    positionM: readPoint(value.positionM, `vehicle ${vehicleId} positionM`, 'INVALID_EXIT_VEHICLE'),
    yawRad: finite(value.yawRad, `vehicle ${vehicleId} yawRad`, 'INVALID_EXIT_VEHICLE'),
    halfExtentsM: Object.freeze({ x: halfX, z: halfZ }),
    bottomM,
    topM,
    availability: memberOf(
      value.availability,
      AVAILABILITIES,
      `vehicle ${vehicleId} availability`,
      'INVALID_EXIT_VEHICLE',
    ),
    state: readState(value.state, vehicleId),
  });
}

function readRequest(request: unknown): Required<VehicleExitRequest> {
  if (!isRecord(request)) fail('INVALID_EXIT_INPUT', 'exit request is required');
  const tick = tickOf(request.tick, 'tick', 'INVALID_EXIT_TICK');
  const authority = readAuthority(request.authority);
  const character = readCharacter(request.character);
  const vehicle = readVehicle(request.vehicle);
  const preTakeover = readVehicle(request.preTakeover);
  if (preTakeover.vehicleId !== vehicle.vehicleId)
    fail(
      'INVALID_EXIT_INPUT',
      `preTakeover names ${preTakeover.vehicleId}, not the released ${vehicle.vehicleId}`,
    );
  if (!Array.isArray(request.vehicles)) fail('INVALID_EXIT_INPUT', 'vehicles must be an array');
  const vehicles: VehicleExitVehicle[] = [];
  const seen = new Set<string>();
  for (const entry of request.vehicles) {
    const candidate = readVehicle(entry);
    if (seen.has(candidate.vehicleId))
      fail('INVALID_EXIT_VEHICLE', `duplicate vehicle ${candidate.vehicleId}`);
    seen.add(candidate.vehicleId);
    vehicles.push(candidate);
  }
  const world = readWorld(request.world);
  let previousExit: Readonly<{ tick: number; vehicleId: string }> | null = null;
  if (request.previousExit !== null && request.previousExit !== undefined) {
    if (!isRecord(request.previousExit))
      fail('INVALID_EXIT_INPUT', 'previousExit must be a plain object or null');
    previousExit = Object.freeze({
      tick: tickOf(request.previousExit.tick, 'previousExit.tick', 'INVALID_EXIT_INPUT'),
      vehicleId: text(
        request.previousExit.vehicleId,
        'previousExit.vehicleId',
        'INVALID_EXIT_INPUT',
      ),
    });
  }
  return {
    tick,
    authority,
    character,
    vehicle,
    preTakeover,
    vehicles: Object.freeze(vehicles),
    world,
    previousExit,
  };
}

/** Same frame as the 023 chassis and the 192 collider: +Z forward, +X right, yaw about +Y. */
function localToWorld(vehicle: VehicleExitVehicle, localX: number, localZ: number): CharacterPoint {
  const cos = Math.cos(vehicle.yawRad);
  const sin = Math.sin(vehicle.yawRad);
  return point(
    vehicle.positionM.x + localX * cos + localZ * sin,
    vehicle.positionM.y,
    vehicle.positionM.z - localX * sin + localZ * cos,
  );
}

/** Exactly the 192 surface rule: the highest slab covering the point, else the map plane. */
function surfaceHeightM(world: VehicleExitWorld, x: number, z: number): number {
  let best: WalkSurface | null = null;
  for (const surface of world.surfaces)
    if (walkPolygonContains(surface.polygon, x, z) && (best === null || surface.topM > best.topM))
      best = surface;
  return best === null ? world.defaultGroundM : best.topM;
}

/** Exactly the 192 vertical rule: a solid outside the body's span cannot block the exit. */
function verticalOverlap(
  solid: Readonly<{ bottomM: number; topM: number }>,
  feetM: number,
  heightM: number,
): boolean {
  return solid.topM > feetM && solid.bottomM < feetM + heightM;
}

interface Solid {
  readonly id: string;
  readonly kind: 'RELEASED_CAR' | 'BUILDING' | 'OBSTACLE' | 'OTHER_VEHICLE';
  readonly polygon: WalkPolygon;
  readonly bottomM: number;
  readonly topM: number;
  readonly marginM: number;
}

const SOLID_LABELS = Object.freeze({
  RELEASED_CAR: 'the released car',
  BUILDING: 'building',
  OBSTACLE: 'obstacle',
  OTHER_VEHICLE: 'parked car',
} as const);

/**
 * Tested candidates, in the fixed order, up to and including the first valid one. The function
 * stops at the first valid point, so the returned list is exactly the work the contract did.
 */
function planCandidates(
  vehicle: VehicleExitVehicle,
  character: VehicleExitCharacterBody,
  vehicles: readonly VehicleExitVehicle[],
  world: VehicleExitWorld,
): readonly VehicleExitCandidate[] {
  const body = createOrientedRectanglePolygon(
    `vehicle:${vehicle.vehicleId}`,
    vehicle.positionM,
    vehicle.halfExtentsM,
    vehicle.yawRad,
  );
  const others: Solid[] = vehicles
    .filter((candidate) => candidate.vehicleId !== vehicle.vehicleId)
    .map((candidate) => ({
      id: `vehicle:${candidate.vehicleId}`,
      kind: 'OTHER_VEHICLE' as const,
      polygon: createOrientedRectanglePolygon(
        `vehicle:${candidate.vehicleId}`,
        candidate.positionM,
        candidate.halfExtentsM,
        candidate.yawRad,
      ),
      bottomM: candidate.bottomM,
      topM: candidate.topM,
      marginM: VEHICLE_EXIT_POLICY.clearanceM,
    }));
  const solids: Solid[] = [
    // The car being left is a solid like any other: the footprint may not appear inside it.
    {
      id: vehicle.vehicleId,
      kind: 'RELEASED_CAR',
      polygon: body,
      bottomM: vehicle.bottomM,
      topM: vehicle.topM,
      marginM: 0,
    },
    ...others,
    ...world.blockers.map((blocker) => ({
      id: blocker.id,
      kind: blocker.kind === 'BUILDING' ? ('BUILDING' as const) : ('OBSTACLE' as const),
      polygon: blocker.polygon,
      bottomM: blocker.bottomM,
      topM: blocker.topM,
      marginM: blocker.marginM,
    })),
  ];

  const candidates: VehicleExitCandidate[] = [];
  for (const ring of RINGS) {
    for (const spec of EXIT_SIDES) {
      const extentM = spec.extent === 'x' ? vehicle.halfExtentsM.x : vehicle.halfExtentsM.z;
      const offsetM =
        extentM +
        character.radiusM +
        VEHICLE_EXIT_POLICY.clearanceM +
        ring * VEHICLE_EXIT_POLICY.stepOutM;
      const centre = localToWorld(vehicle, spec.localX * offsetM, spec.localZ * offsetM);
      const groundM = surfaceHeightM(world, centre.x, centre.z);
      const groundStepM = groundM - vehicle.positionM.y;
      const positionM = point(centre.x, groundM, centre.z);

      let code: ExitCandidateRefusalCode | null = null;
      let blockerId: string | null = null;
      let detail = 'valid exit point';
      let clearanceM = Number.POSITIVE_INFINITY;
      let nearestBlockerId: string | null = null;

      const gapTo = (
        solid: Readonly<{ id: string; polygon: WalkPolygon; marginM: number }>,
      ): number => {
        const gap =
          walkPolygonDistanceM(solid.polygon, positionM.x, positionM.z) -
          character.radiusM -
          solid.marginM;
        if (gap < clearanceM) {
          clearanceM = gap;
          nearestBlockerId = solid.id;
        }
        return gap;
      };

      if (groundM < world.defaultGroundM - EPSILON) {
        code = 'BELOW_MAP';
        detail = `ground ${groundM.toFixed(4)} m is below the map plane ${world.defaultGroundM.toFixed(4)} m`;
      } else if (Math.abs(groundStepM) > VEHICLE_EXIT_POLICY.maxGroundStepM + EPSILON) {
        code = 'STEP_TOO_HIGH';
        detail = `step of ${groundStepM.toFixed(4)} m exceeds the ${VEHICLE_EXIT_POLICY.maxGroundStepM.toFixed(4)} m curb ceiling`;
      } else {
        for (const solid of solids) {
          if (!verticalOverlap(solid, groundM, character.heightM)) continue;
          const gap = gapTo(solid);
          if (gap < -EPSILON) {
            code = solid.kind === 'OTHER_VEHICLE' ? 'OTHER_VEHICLE' : 'SOLID';
            blockerId = solid.id;
            detail = `${SOLID_LABELS[solid.kind]} ${solid.id} leaves ${gap.toFixed(4)} m of free gap`;
            break;
          }
        }
      }

      candidates.push(
        Object.freeze({
          index: candidates.length,
          id: `${spec.side}:R${ring}`,
          side: spec.side,
          ring,
          offsetM,
          positionM,
          groundM,
          groundStepM,
          valid: code === null,
          code,
          blockerId,
          detail,
          clearanceM,
          nearestBlockerId,
        }),
      );
      if (code === null) return Object.freeze(candidates);
    }
  }
  return Object.freeze(candidates);
}

/** Outward facing at the chosen point: the walker starts facing away from the car. */
function outwardYawRad(vehicle: VehicleExitVehicle, side: VehicleExitSide): number {
  const spec = EXIT_SIDES.find((entry) => entry.side === side)!;
  const x = spec.localX * Math.cos(vehicle.yawRad) + spec.localZ * Math.sin(vehicle.yawRad);
  const z = -spec.localX * Math.sin(vehicle.yawRad) + spec.localZ * Math.cos(vehicle.yawRad);
  return Math.atan2(x, z);
}

/** IEEE-754 bytes of the route assignment: lane, route lanes, ride id and ride progress. */
export function vehicleExitRouteBits(state: VehicleExitState): string {
  const parts: string[] = [];
  const pushNumber = (value: number): void => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value);
    parts.push(
      Array.from(new Uint8Array(view.buffer), (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      ),
    );
  };
  const pushText = (value: string): void => {
    const codes = Array.from(value, (character) => character.codePointAt(0)!.toString(16));
    parts.push(`${codes.length}:${codes.join('.')}`);
  };
  pushText(state.laneId ?? '\u0000');
  pushText(`${state.routeLaneIds.length}`);
  for (const laneId of state.routeLaneIds) pushText(laneId);
  pushText(state.rideId ?? '\u0000');
  pushNumber(state.rideProgressM);
  return parts.join('|');
}

function refuse(
  tick: number,
  vehicleId: string | null,
  code: VehicleExitRefusalCode,
  detail: string,
  speedMps: number | null,
  candidates: readonly VehicleExitCandidate[],
): VehicleExitRefusal {
  return Object.freeze({
    accepted: false,
    tick,
    vehicleId,
    code,
    detail,
    speedMps,
    candidates,
  });
}

/**
 * The single exit decision. Inputs are validated fail-closed; real-world conditions return a
 * refusal with a code, never an exception, and no candidate ever moves the body into a solid.
 */
export function decideVehicleExit(request: VehicleExitRequest): VehicleExitDecision {
  const parsed = readRequest(request);
  const { tick, authority, character, vehicle, preTakeover, vehicles, world, previousExit } =
    parsed;

  if (previousExit !== null && previousExit.tick === tick)
    return refuse(
      tick,
      previousExit.vehicleId,
      'DOUBLE_EXIT_REFUSED',
      `tick ${tick} already accepted an exit from ${previousExit.vehicleId}`,
      null,
      Object.freeze([]),
    );

  // PBI 068 holds one player seat, and PBI 193 names it. Only that exact seat may be released.
  if (authority.consumer !== 'VEHICLE')
    return refuse(
      tick,
      vehicle.vehicleId,
      'NOT_CONTROLLED',
      `the input authority is ${authority.consumer}, so no car is held`,
      null,
      Object.freeze([]),
    );
  if (authority.vehicleId !== vehicle.vehicleId)
    return refuse(
      tick,
      authority.vehicleId,
      'NOT_CONTROLLED',
      `the input authority holds ${authority.vehicleId}, not ${vehicle.vehicleId}`,
      null,
      Object.freeze([]),
    );
  if (!vehicles.some((candidate) => candidate.vehicleId === vehicle.vehicleId))
    return refuse(
      tick,
      vehicle.vehicleId,
      'UNKNOWN_VEHICLE',
      `vehicle ${vehicle.vehicleId} is not part of the fleet snapshot`,
      null,
      Object.freeze([]),
    );

  // A car already in AUTO has no player seat to release; the exit would be a fake transition.
  if (vehicle.state.controlMode === VEHICLE_EXIT_POLICY.releaseMode)
    return refuse(
      tick,
      vehicle.vehicleId,
      'NOT_CONTROLLED',
      `vehicle ${vehicle.vehicleId} is already in ${VEHICLE_EXIT_POLICY.releaseMode}`,
      null,
      Object.freeze([]),
    );

  const speedMps = Math.hypot(vehicle.state.velocityMps.x, vehicle.state.velocityMps.z);
  if (speedMps > VEHICLE_EXIT_POLICY.maxExitSpeedMps + EPSILON)
    return refuse(
      tick,
      vehicle.vehicleId,
      'VEHICLE_MOVING',
      `vehicle ${vehicle.vehicleId} moves at ${speedMps.toFixed(4)} m/s, above the ${VEHICLE_EXIT_POLICY.maxExitSpeedMps.toFixed(4)} m/s step-out limit`,
      speedMps,
      Object.freeze([]),
    );

  const candidates = planCandidates(vehicle, character, vehicles, world);
  // Planning stops at the first valid point, so only the last tested candidate can be the chosen one.
  const lastCandidate = candidates[candidates.length - 1];
  const chosen = lastCandidate !== undefined && lastCandidate.valid ? lastCandidate : null;
  if (chosen === null)
    return refuse(
      tick,
      vehicle.vehicleId,
      'NO_VALID_EXIT',
      `all ${candidates.length} exit candidates around ${vehicle.vehicleId} are blocked; the character stays inside`,
      speedMps,
      candidates,
    );

  const released: VehicleExitVehicle = Object.freeze({
    ...vehicle,
    state: Object.freeze({
      ...vehicle.state,
      tick,
      controlMode: VEHICLE_EXIT_POLICY.releaseMode,
      laneId: preTakeover.state.laneId,
      routeLaneIds: preTakeover.state.routeLaneIds,
      rideId: preTakeover.state.rideId,
      rideProgressM: preTakeover.state.rideProgressM,
    }),
  });
  const baselineBits = vehicleExitRouteBits(preTakeover.state);
  const releasedBits = vehicleExitRouteBits(released.state);
  // Structural self-check: if the route assignment moved, the release is refused loudly.
  if (baselineBits !== releasedBits)
    fail('INVALID_EXIT_STATE', 'the released car did not resume the pre-takeover route');

  const yawRad = outwardYawRad(vehicle, chosen.side);
  const start: VehicleExitStart = Object.freeze({
    positionM: chosen.positionM,
    yawRad,
  });
  const count = vehicles.length + 1;
  return Object.freeze({
    accepted: true,
    tick,
    vehicleId: vehicle.vehicleId,
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: character.entityId,
    }),
    previousAuthority: authority,
    character: Object.freeze({
      entityId: character.entityId,
      radiusM: character.radiusM,
      heightM: character.heightM,
      positionM: chosen.positionM,
      yawRad,
    }),
    start,
    vehicle: released,
    previousMode: vehicle.state.controlMode,
    baselineMode: preTakeover.state.controlMode,
    mode: VEHICLE_EXIT_POLICY.releaseMode,
    exit: Object.freeze({
      candidateId: chosen.id,
      side: chosen.side,
      ring: chosen.ring,
      offsetM: chosen.offsetM,
      positionM: chosen.positionM,
      groundM: chosen.groundM,
      groundStepM: chosen.groundStepM,
      clearanceM: chosen.clearanceM,
      nearestBlockerId: chosen.nearestBlockerId,
      attempts: candidates.length,
    }),
    candidates,
    entities: Object.freeze({
      before: count,
      after: count,
      vehicles: vehicles.length,
      characters: 1,
    }),
    camera: Object.freeze({
      tick,
      authorityEntityId: character.entityId,
      previousEntityId: vehicle.vehicleId,
    }),
    bits: Object.freeze({
      baseline: baselineBits,
      released: releasedBits,
      identical: baselineBits === releasedBits,
    }),
    journal: Object.freeze({ tick, vehicleId: vehicle.vehicleId }),
  });
}
