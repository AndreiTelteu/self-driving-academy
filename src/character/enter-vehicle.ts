/**
 * PBI 195 — taking over any car that is physically within reach.
 *
 * The transition is a pure contract: no clock, no DOM, no Babylon, no `Math.random` and no
 * simulation service. It receives the walking body of PBI 192, the cars with their footprint and
 * their whole preserved state, the current PBI 193 authority and the explicit intent, and it
 * returns either one accepted transition or one refusal with a code from a closed vocabulary.
 * Nothing it receives is mutated: every returned record is a fresh frozen copy.
 *
 * Criterion 1 is the physical access rule, not a menu. A car is boardable when the character can
 * really reach the middle of one of its flanks: the planar distance to the door is within the arm
 * reach measured on the PBI 191 asset, the straight line to the door does not cross a solid of the
 * PBI 192 walk world or another car body, and the door itself is not covered by an obstacle. The
 * real refusals are `OUT_OF_RANGE`, `PATH_BLOCKED`, `UNKNOWN_VEHICLE`, `VEHICLE_OCCUPIED` and
 * `VEHICLE_UNAVAILABLE`; a second entry at the same fixed tick is `DOUBLE_ENTRY_REFUSED`.
 *
 * Criterion 2 is structural. The acceptance carries the single PBI 193 authority
 * (`VEHICLE:<vehicleId>`), the exact 194 camera request for the same tick, the unchanged character
 * body and the same entity count, plus the car with only `state.controlMode` set to `MANUAL`.
 * Every other preserved field is copied bit for bit and fingerprinted with IEEE-754 bytes, so a
 * single changed bit is detectable instead of being described as "preserved".
 */
import type { FleetDriverKind } from '../fleet';
import type { InputAuthority } from '../input';
import type { ControlMode, VehicleAvailability, VehicleState } from '../vehicles';
import { createCharacterAsset } from './asset';
import { CHARACTER_SAMPLING_HZ } from './clips';
import type { CharacterPoint } from './skeleton';
import {
  createOrientedRectanglePolygon,
  walkPolygonContains,
  type WalkPolygon,
} from './walk-geometry';
import type { WalkBlocker } from './walk-world';

export const ENTER_VEHICLE_CONTRACT_VERSION = '195-enter-vehicle-v1' as const;

/** Arm reach measured on the real PBI 191 asset: a person touches the door handle, not the car. */
const CHARACTER_REACH_M = createCharacterAsset().measured.armSpanM / 2;

export const VEHICLE_ENTRY_POLICY = Object.freeze({
  contract: ENTER_VEHICLE_CONTRACT_VERSION,
  /** Same fixed tick as the walker (192), the input authority (193) and the camera (194). */
  tickHz: CHARACTER_SAMPLING_HZ,
  /**
   * Planar reach from the feet centre to the middle of the flank. It is the half arm span of the
   * measured 191 asset (0.89 m), so a character standing on the roadway next to the door is inside
   * the radius and a character across the lane is not.
   */
  interactionRadiusM: CHARACTER_REACH_M,
  /** The only mode an entry may impose; the vehicle owner keeps AUTO and LEARNING untouched. */
  entryMode: 'MANUAL' as const,
});

/** Real-world refusals. The first five are the physical access rule; the last is the tick rule. */
export const VEHICLE_ENTRY_REFUSAL_CODES = Object.freeze([
  'OUT_OF_RANGE',
  'PATH_BLOCKED',
  'UNKNOWN_VEHICLE',
  'VEHICLE_OCCUPIED',
  'VEHICLE_UNAVAILABLE',
  'DOUBLE_ENTRY_REFUSED',
] as const);
export type VehicleEntryRefusalCode = (typeof VEHICLE_ENTRY_REFUSAL_CODES)[number];

/** Contract violations are thrown, never reported as a normal refusal. */
export const VEHICLE_ENTRY_ERROR_CODES = Object.freeze([
  'INVALID_ENTRY_INPUT',
  'INVALID_ENTRY_TICK',
  'INVALID_ENTRY_WORLD',
  'INVALID_ENTRY_VEHICLE',
  'INVALID_ENTRY_STATE',
] as const);
export type VehicleEntryErrorCode = (typeof VEHICLE_ENTRY_ERROR_CODES)[number];

export class VehicleEntryError extends Error {
  readonly code: VehicleEntryErrorCode;

  constructor(code: VehicleEntryErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'VehicleEntryError';
    this.code = code;
  }
}

export type VehicleEntryDoorSide = 'LEFT' | 'RIGHT';

/** The 192 walking body. The character keeps it after the entry; it is never cloned or removed. */
export interface VehicleEntryCharacterBody {
  readonly entityId: string;
  /** Authoritative feet-centre position from the walker. */
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  /** Capsule radius/height measured by 192; used for the vertical overlap of the solids. */
  readonly radiusM: number;
  readonly heightM: number;
}

/**
 * The state a car keeps across the transition, field by field from the contracts that own it:
 * `tick`, `controlMode`, `velocityMps`, `laneId` and `maneuverState` from the PBI 024 vehicle
 * state, `routeLaneIds`/`rideId` from the PBI 061 ride, the along-route progress used by 065/eta and
 * the applied profile version from the PBI 057 fleet registry.
 */
export interface VehicleEntryState {
  readonly tick: number;
  readonly controlMode: ControlMode;
  readonly velocityMps: CharacterPoint;
  readonly laneId: string | null;
  readonly maneuverState: VehicleState['maneuverState'];
  readonly routeLaneIds: readonly string[];
  readonly rideId: string | null;
  /** Distance already travelled along the ride route, in metres. */
  readonly rideProgressM: number;
  readonly appliedProfileVersion: string;
}

/** A car with its real collider (022/145) and its whole preserved state. */
export interface VehicleEntryVehicle {
  readonly vehicleId: string;
  readonly driverKind: FleetDriverKind;
  readonly classId: string;
  /** Authoritative ground contact from the vehicle owner. */
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  /** Half sizes of the real body box: 0.85 × 2.00 m for the sedan. */
  readonly halfExtentsM: Readonly<{ x: number; z: number }>;
  readonly bottomM: number;
  readonly topM: number;
  readonly availability: VehicleAvailability;
  readonly state: VehicleEntryState;
}

export interface VehicleEntryDoor {
  readonly side: VehicleEntryDoorSide;
  readonly positionM: CharacterPoint;
  /** Planar distance from the character feet centre to the door, in metres. */
  readonly distanceM: number;
}

export interface VehicleEntryEntityCounts {
  /** Bodies known before the transition: the character plus every car in the request. */
  readonly before: number;
  readonly after: number;
  readonly vehicles: number;
  readonly characters: number;
}

/** Exactly the PBI 194 step fields that carry the new authority in the entry tick. */
export interface VehicleEntryCameraRequest {
  readonly tick: number;
  /** The 194 `authorityEntityId`: the vehicle id carried by the 193 authority. */
  readonly authorityEntityId: string;
  readonly previousEntityId: string;
}

export interface VehicleEntryAcceptance {
  readonly accepted: true;
  readonly tick: number;
  readonly vehicleId: string;
  /** The single PBI 193 authority after the transition. */
  readonly authority: InputAuthority;
  readonly previousAuthority: InputAuthority;
  /** Mode the car had; the only field the entry changes. */
  readonly previousMode: ControlMode;
  readonly mode: 'MANUAL';
  /** The car with every preserved field copied and only `state.controlMode` replaced. */
  readonly vehicle: VehicleEntryVehicle;
  /** The character body, unchanged and still a body of the world. */
  readonly character: VehicleEntryCharacterBody;
  readonly door: VehicleEntryDoor;
  readonly entities: VehicleEntryEntityCounts;
  readonly camera: VehicleEntryCameraRequest;
  /** Bit fingerprint of the preserved fields, before and after, excluding the control mode. */
  readonly bits: Readonly<{ before: string; after: string }>;
  /** Journal entry a caller feeds back as `previousEntry` on the next tick. */
  readonly journal: Readonly<{ tick: number; vehicleId: string }>;
}

export interface VehicleEntryRefusal {
  readonly accepted: false;
  readonly tick: number;
  readonly vehicleId: string | null;
  readonly code: VehicleEntryRefusalCode;
  readonly detail: string;
  readonly distanceM: number | null;
  readonly doorM: CharacterPoint | null;
  /** Solid that blocked the path or the door; null for the other refusals. */
  readonly blockerId: string | null;
}

export type VehicleEntryDecision = VehicleEntryAcceptance | VehicleEntryRefusal;

export interface VehicleEntryRequest {
  /** The fixed tick of the entry; any non-negative safe integer is admitted. */
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly character: VehicleEntryCharacterBody;
  readonly intent: Readonly<{ vehicleId: string }>;
  readonly vehicles: readonly VehicleEntryVehicle[];
  /** Solids of the PBI 192 walk world; the surfaces are not needed for the access rule. */
  readonly blockers: readonly WalkBlocker[];
  /** The last accepted transition, used to refuse a second entry in the same tick. */
  readonly previousEntry: Readonly<{ tick: number; vehicleId: string }> | null;
}

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

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(code: VehicleEntryErrorCode, detail: string): never {
  throw new VehicleEntryError(code, detail);
}

function finite(value: unknown, label: string, code: VehicleEntryErrorCode): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(code, `${label} must be finite`);
  return value;
}

function text(value: unknown, label: string, code: VehicleEntryErrorCode): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    fail(code, `${label} must be a non-empty string`);
  return value;
}

function nullableText(value: unknown, label: string, code: VehicleEntryErrorCode): string | null {
  if (value === null || value === undefined) return null;
  return text(value, label, code);
}

function tickOf(value: unknown, label: string, code: VehicleEntryErrorCode): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(code, `${label} must be a safe non-negative integer`);
  return value;
}

function memberOf<T extends string>(
  value: unknown,
  admitted: readonly T[],
  label: string,
  code: VehicleEntryErrorCode,
): T {
  if (typeof value !== 'string' || !(admitted as readonly string[]).includes(value))
    fail(code, `${label} must be one of ${admitted.join(', ')}`);
  return value as T;
}

function readPoint(value: unknown, label: string, code: VehicleEntryErrorCode): CharacterPoint {
  if (!isRecord(value)) fail(code, `${label} must be a point`);
  return point(
    finite(value.x, `${label}.x`, code),
    finite(value.y, `${label}.y`, code),
    finite(value.z, `${label}.z`, code),
  );
}

function readAuthority(value: unknown): InputAuthority {
  if (!isRecord(value)) fail('INVALID_ENTRY_INPUT', 'authority must be a plain object');
  if (value.consumer === 'CHARACTER')
    return Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: text(value.characterId, 'authority.characterId', 'INVALID_ENTRY_INPUT'),
    });
  if (value.consumer === 'VEHICLE')
    return Object.freeze({
      consumer: 'VEHICLE' as const,
      vehicleId: text(value.vehicleId, 'authority.vehicleId', 'INVALID_ENTRY_INPUT'),
    });
  return fail('INVALID_ENTRY_INPUT', 'authority.consumer must be CHARACTER or VEHICLE');
}

function readCharacter(value: unknown): VehicleEntryCharacterBody {
  if (!isRecord(value)) fail('INVALID_ENTRY_INPUT', 'character body is required');
  const radiusM = finite(value.radiusM, 'character.radiusM', 'INVALID_ENTRY_INPUT');
  const heightM = finite(value.heightM, 'character.heightM', 'INVALID_ENTRY_INPUT');
  if (radiusM <= 0 || heightM <= 0)
    fail('INVALID_ENTRY_INPUT', 'the character capsule must be positive');
  return Object.freeze({
    entityId: text(value.entityId, 'character.entityId', 'INVALID_ENTRY_INPUT'),
    positionM: readPoint(value.positionM, 'character.positionM', 'INVALID_ENTRY_INPUT'),
    yawRad: finite(value.yawRad, 'character.yawRad', 'INVALID_ENTRY_INPUT'),
    radiusM,
    heightM,
  });
}

function readState(value: unknown, vehicleId: string): VehicleEntryState {
  if (!isRecord(value))
    fail('INVALID_ENTRY_VEHICLE', `state of vehicle ${vehicleId} must be a plain object`);
  if (!Array.isArray(value.routeLaneIds))
    fail('INVALID_ENTRY_VEHICLE', `state of vehicle ${vehicleId} needs routeLaneIds`);
  const routeLaneIds = Object.freeze(
    value.routeLaneIds.map((laneId, index) =>
      text(laneId, `state of vehicle ${vehicleId} routeLaneIds[${index}]`, 'INVALID_ENTRY_VEHICLE'),
    ),
  );
  const progressM = finite(
    value.rideProgressM,
    `state of vehicle ${vehicleId} rideProgressM`,
    'INVALID_ENTRY_VEHICLE',
  );
  if (progressM < 0)
    fail('INVALID_ENTRY_VEHICLE', `state of vehicle ${vehicleId} has negative ride progress`);
  return Object.freeze({
    tick: tickOf(value.tick, `state of vehicle ${vehicleId} tick`, 'INVALID_ENTRY_VEHICLE'),
    controlMode: memberOf(
      value.controlMode,
      CONTROL_MODES,
      `state of vehicle ${vehicleId} controlMode`,
      'INVALID_ENTRY_VEHICLE',
    ),
    velocityMps: readPoint(
      value.velocityMps,
      `state of vehicle ${vehicleId} velocityMps`,
      'INVALID_ENTRY_VEHICLE',
    ),
    laneId: nullableText(
      value.laneId,
      `state of vehicle ${vehicleId} laneId`,
      'INVALID_ENTRY_VEHICLE',
    ),
    maneuverState: memberOf(
      value.maneuverState,
      MANEUVER_STATES,
      `state of vehicle ${vehicleId} maneuverState`,
      'INVALID_ENTRY_VEHICLE',
    ),
    routeLaneIds,
    rideId: nullableText(
      value.rideId,
      `state of vehicle ${vehicleId} rideId`,
      'INVALID_ENTRY_VEHICLE',
    ),
    rideProgressM: progressM,
    appliedProfileVersion: text(
      value.appliedProfileVersion,
      `state of vehicle ${vehicleId} appliedProfileVersion`,
      'INVALID_ENTRY_VEHICLE',
    ),
  });
}

function readVehicle(value: unknown): VehicleEntryVehicle {
  if (!isRecord(value)) fail('INVALID_ENTRY_VEHICLE', 'vehicle must be a plain object');
  const vehicleId = text(value.vehicleId, 'vehicle.vehicleId', 'INVALID_ENTRY_VEHICLE');
  const halfExtents = isRecord(value.halfExtentsM) ? value.halfExtentsM : null;
  if (!halfExtents) fail('INVALID_ENTRY_VEHICLE', `vehicle ${vehicleId} needs halfExtentsM`);
  const halfX = finite(halfExtents.x, `vehicle ${vehicleId} half x`, 'INVALID_ENTRY_VEHICLE');
  const halfZ = finite(halfExtents.z, `vehicle ${vehicleId} half z`, 'INVALID_ENTRY_VEHICLE');
  if (halfX <= 0 || halfZ <= 0)
    fail('INVALID_ENTRY_VEHICLE', `vehicle ${vehicleId} has no footprint`);
  const bottomM = finite(value.bottomM, `vehicle ${vehicleId} bottomM`, 'INVALID_ENTRY_VEHICLE');
  const topM = finite(value.topM, `vehicle ${vehicleId} topM`, 'INVALID_ENTRY_VEHICLE');
  if (topM <= bottomM) fail('INVALID_ENTRY_VEHICLE', `vehicle ${vehicleId} has no vertical extent`);
  return Object.freeze({
    vehicleId,
    driverKind: memberOf(
      value.driverKind,
      DRIVER_KINDS,
      `vehicle ${vehicleId} driverKind`,
      'INVALID_ENTRY_VEHICLE',
    ),
    classId: text(value.classId, `vehicle ${vehicleId} classId`, 'INVALID_ENTRY_VEHICLE'),
    positionM: readPoint(
      value.positionM,
      `vehicle ${vehicleId} positionM`,
      'INVALID_ENTRY_VEHICLE',
    ),
    yawRad: finite(value.yawRad, `vehicle ${vehicleId} yawRad`, 'INVALID_ENTRY_VEHICLE'),
    halfExtentsM: Object.freeze({ x: halfX, z: halfZ }),
    bottomM,
    topM,
    availability: memberOf(
      value.availability,
      AVAILABILITIES,
      `vehicle ${vehicleId} availability`,
      'INVALID_ENTRY_VEHICLE',
    ),
    state: readState(value.state, vehicleId),
  });
}

function readBlocker(value: unknown): WalkBlocker {
  if (!isRecord(value)) fail('INVALID_ENTRY_WORLD', 'blocker must be a plain object');
  const id = text(value.id, 'blocker.id', 'INVALID_ENTRY_WORLD');
  const bottomM = finite(value.bottomM, `blocker ${id} bottomM`, 'INVALID_ENTRY_WORLD');
  const topM = finite(value.topM, `blocker ${id} topM`, 'INVALID_ENTRY_WORLD');
  if (topM <= bottomM) fail('INVALID_ENTRY_WORLD', `blocker ${id} has no vertical extent`);
  const polygon = isRecord(value.polygon) ? value.polygon : null;
  if (!polygon || !Array.isArray(polygon.vertices) || polygon.vertices.length < 3)
    fail('INVALID_ENTRY_WORLD', `blocker ${id} needs a polygon`);
  const vertices = Object.freeze(
    polygon.vertices.map((vertex, index) => {
      if (!isRecord(vertex))
        fail('INVALID_ENTRY_WORLD', `blocker ${id} vertex ${index} must be a point`);
      return Object.freeze({
        x: finite(vertex.x, `blocker ${id} vertex ${index} x`, 'INVALID_ENTRY_WORLD'),
        z: finite(vertex.z, `blocker ${id} vertex ${index} z`, 'INVALID_ENTRY_WORLD'),
      });
    }),
  );
  return Object.freeze({
    id,
    kind: value.kind === 'BUILDING' ? ('BUILDING' as const) : ('OBSTACLE' as const),
    bottomM,
    topM,
    marginM: finite(value.marginM, `blocker ${id} marginM`, 'INVALID_ENTRY_WORLD'),
    polygon: Object.freeze({
      id,
      vertices,
      bounds: Object.freeze({
        minX: Math.min(...vertices.map((vertex) => vertex.x)),
        maxX: Math.max(...vertices.map((vertex) => vertex.x)),
        minZ: Math.min(...vertices.map((vertex) => vertex.z)),
        maxZ: Math.max(...vertices.map((vertex) => vertex.z)),
      }),
    }) as WalkPolygon,
  }) as WalkBlocker;
}

function readRequest(request: unknown): Required<VehicleEntryRequest> {
  if (!isRecord(request)) fail('INVALID_ENTRY_INPUT', 'entry request is required');
  const tick = tickOf(request.tick, 'tick', 'INVALID_ENTRY_TICK');
  const authority = readAuthority(request.authority);
  const character = readCharacter(request.character);
  if (!isRecord(request.intent)) fail('INVALID_ENTRY_INPUT', 'intent is required');
  const intent = Object.freeze({
    vehicleId: text(request.intent.vehicleId, 'intent.vehicleId', 'INVALID_ENTRY_INPUT'),
  });
  if (!Array.isArray(request.vehicles)) fail('INVALID_ENTRY_INPUT', 'vehicles must be an array');
  const vehicles: VehicleEntryVehicle[] = [];
  const seen = new Set<string>();
  for (const entry of request.vehicles) {
    const vehicle = readVehicle(entry);
    if (seen.has(vehicle.vehicleId))
      fail('INVALID_ENTRY_VEHICLE', `duplicate vehicle ${vehicle.vehicleId}`);
    seen.add(vehicle.vehicleId);
    vehicles.push(vehicle);
  }
  if (!Array.isArray(request.blockers)) fail('INVALID_ENTRY_WORLD', 'blockers must be an array');
  const blockers = request.blockers.map((blocker) => readBlocker(blocker));
  let previousEntry: Readonly<{ tick: number; vehicleId: string }> | null = null;
  if (request.previousEntry !== null && request.previousEntry !== undefined) {
    if (!isRecord(request.previousEntry))
      fail('INVALID_ENTRY_INPUT', 'previousEntry must be a plain object or null');
    previousEntry = Object.freeze({
      tick: tickOf(request.previousEntry.tick, 'previousEntry.tick', 'INVALID_ENTRY_INPUT'),
      vehicleId: text(
        request.previousEntry.vehicleId,
        'previousEntry.vehicleId',
        'INVALID_ENTRY_INPUT',
      ),
    });
  }
  return {
    tick,
    authority,
    character,
    intent,
    vehicles: Object.freeze(vehicles),
    blockers: Object.freeze(blockers),
    previousEntry,
  };
}

const planarDistance = (from: CharacterPoint, to: CharacterPoint): number =>
  Math.hypot(to.x - from.x, to.z - from.z);

/** Same frame as the 023 chassis and the 192 collider: +Z forward, +X right, yaw about +Y. */
function localToWorld(
  vehicle: VehicleEntryVehicle,
  localX: number,
  localZ: number,
): CharacterPoint {
  const cos = Math.cos(vehicle.yawRad);
  const sin = Math.sin(vehicle.yawRad);
  return point(
    vehicle.positionM.x + localX * cos + localZ * sin,
    vehicle.positionM.y,
    vehicle.positionM.z - localX * sin + localZ * cos,
  );
}

/** The boardable door is the middle of the cabin flank, derived from the real collider. */
export function vehicleEntryDoor(
  vehicle: VehicleEntryVehicle,
  characterPositionM: CharacterPoint,
): VehicleEntryDoor {
  const left = localToWorld(vehicle, -vehicle.halfExtentsM.x, 0);
  const right = localToWorld(vehicle, vehicle.halfExtentsM.x, 0);
  const leftDistance = planarDistance(characterPositionM, left);
  const rightDistance = planarDistance(characterPositionM, right);
  // The nearer flank wins; an exact tie stays on the driver side, so the result is deterministic.
  const side: VehicleEntryDoorSide = rightDistance < leftDistance ? 'RIGHT' : 'LEFT';
  const positionM = side === 'RIGHT' ? right : left;
  return Object.freeze({
    side,
    positionM,
    distanceM: planarDistance(characterPositionM, positionM),
  });
}

interface Solid {
  readonly id: string;
  readonly polygon: WalkPolygon;
  readonly bottomM: number;
  readonly topM: number;
}

function cross(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

/**
 * Exact segment versus convex counter-clockwise polygon test in the X/Z plane. The closed polygon
 * counts: a door line that only grazes a solid is still blocked, which is the fail-closed side.
 */
function segmentCrossesPolygon(
  polygon: WalkPolygon,
  from: CharacterPoint,
  to: CharacterPoint,
): boolean {
  const { vertices } = polygon;
  const epsilon = 1e-9;
  let entry = 0;
  let exit = 1;
  for (let index = 0; index < vertices.length; index += 1) {
    const first = vertices[index]!;
    const second = vertices[(index + 1) % vertices.length]!;
    const dx = second.x - first.x;
    const dz = second.z - first.z;
    const start = cross(dx, dz, from.x - first.x, from.z - first.z);
    const end = cross(dx, dz, to.x - first.x, to.z - first.z);
    if (Math.abs(end - start) < epsilon) {
      if (start < -epsilon) return false;
      continue;
    }
    const at = -start / (end - start);
    if (end > start) {
      if (at > entry) entry = at;
    } else if (at < exit) exit = at;
    if (entry > exit) return false;
  }
  return exit >= 0 && entry <= 1;
}

/** The first solid whose body would stand between the character and the door, or cover the door. */
function blockingSolid(
  solids: readonly Solid[],
  character: VehicleEntryCharacterBody,
  door: CharacterPoint,
): Solid | null {
  for (const solid of solids) {
    // Exactly the 192 solver rule: a solid outside the body's vertical span does not block.
    if (
      solid.topM <= character.positionM.y ||
      solid.bottomM >= character.positionM.y + character.heightM
    )
      continue;
    if (walkPolygonContains(solid.polygon, door.x, door.z)) return solid;
    if (segmentCrossesPolygon(solid.polygon, character.positionM, door)) return solid;
  }
  return null;
}

function refuse(
  tick: number,
  vehicleId: string | null,
  code: VehicleEntryRefusalCode,
  detail: string,
  door: VehicleEntryDoor | null,
  blockerId: string | null,
): VehicleEntryRefusal {
  return Object.freeze({
    accepted: false,
    tick,
    vehicleId,
    code,
    detail,
    distanceM: door?.distanceM ?? null,
    doorM: door?.positionM ?? null,
    blockerId,
  });
}

/** IEEE-754 bytes for every number and code points for every string, in a fixed field order. */
export function vehicleEntryBits(vehicle: VehicleEntryVehicle): string {
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
  pushText(vehicle.vehicleId);
  pushText(vehicle.driverKind);
  pushText(vehicle.classId);
  pushNumber(vehicle.positionM.x);
  pushNumber(vehicle.positionM.y);
  pushNumber(vehicle.positionM.z);
  pushNumber(vehicle.yawRad);
  pushNumber(vehicle.halfExtentsM.x);
  pushNumber(vehicle.halfExtentsM.z);
  pushNumber(vehicle.bottomM);
  pushNumber(vehicle.topM);
  pushText(vehicle.availability);
  pushNumber(vehicle.state.tick);
  // `state.controlMode` is deliberately not hashed: it is the one field the entry changes.
  pushNumber(vehicle.state.velocityMps.x);
  pushNumber(vehicle.state.velocityMps.y);
  pushNumber(vehicle.state.velocityMps.z);
  pushText(vehicle.state.laneId ?? '\u0000');
  pushText(vehicle.state.maneuverState);
  pushText(`${vehicle.state.routeLaneIds.length}`);
  for (const laneId of vehicle.state.routeLaneIds) pushText(laneId);
  pushText(vehicle.state.rideId ?? '\u0000');
  pushNumber(vehicle.state.rideProgressM);
  pushText(vehicle.state.appliedProfileVersion);
  return parts.join('|');
}

/**
 * The single entry decision. Inputs are validated fail-closed; real-world conditions return a
 * refusal with a code, never an exception.
 */
export function decideVehicleEntry(request: VehicleEntryRequest): VehicleEntryDecision {
  const parsed = readRequest(request);
  const { tick, authority, character, intent, vehicles, blockers, previousEntry } = parsed;

  if (previousEntry !== null && previousEntry.tick === tick)
    return refuse(
      tick,
      previousEntry.vehicleId,
      'DOUBLE_ENTRY_REFUSED',
      `tick ${tick} already accepted an entry into ${previousEntry.vehicleId}`,
      null,
      null,
    );

  // PBI 068 keeps exactly one player seat: while it holds any car, another entry is not admitted.
  if (authority.consumer === 'VEHICLE')
    return refuse(
      tick,
      authority.vehicleId,
      'VEHICLE_OCCUPIED',
      `the player seat already holds ${authority.vehicleId}`,
      null,
      authority.vehicleId,
    );

  const vehicle = vehicles.find((candidate) => candidate.vehicleId === intent.vehicleId) ?? null;
  if (vehicle === null)
    return refuse(
      tick,
      intent.vehicleId,
      'UNKNOWN_VEHICLE',
      `vehicle ${intent.vehicleId} is not part of the fleet snapshot`,
      null,
      null,
    );

  // PBI 023 immobilisation is the real unavailability rule: zero throttle and full brake.
  if (vehicle.availability === 'IMMOBILIZED')
    return refuse(
      tick,
      vehicle.vehicleId,
      'VEHICLE_UNAVAILABLE',
      `vehicle ${vehicle.vehicleId} is IMMOBILIZED and cannot be driven`,
      null,
      null,
    );

  const door = vehicleEntryDoor(vehicle, character.positionM);
  if (door.distanceM > VEHICLE_ENTRY_POLICY.interactionRadiusM)
    return refuse(
      tick,
      vehicle.vehicleId,
      'OUT_OF_RANGE',
      `door is ${door.distanceM.toFixed(4)} m away, beyond the ${VEHICLE_ENTRY_POLICY.interactionRadiusM.toFixed(4)} m reach`,
      door,
      null,
    );

  const body = createOrientedRectanglePolygon(
    `vehicle:${vehicle.vehicleId}`,
    vehicle.positionM,
    vehicle.halfExtentsM,
    vehicle.yawRad,
  );
  if (walkPolygonContains(body, character.positionM.x, character.positionM.z))
    return refuse(
      tick,
      vehicle.vehicleId,
      'PATH_BLOCKED',
      `the character body is inside vehicle ${vehicle.vehicleId}`,
      door,
      vehicle.vehicleId,
    );

  const solids: Solid[] = [
    ...blockers.map((blocker) => ({
      id: blocker.id,
      polygon: blocker.polygon,
      bottomM: blocker.bottomM,
      topM: blocker.topM,
    })),
    ...vehicles
      .filter((candidate) => candidate.vehicleId !== vehicle.vehicleId)
      .map((candidate) => ({
        id: `vehicle:${candidate.vehicleId}`,
        polygon: createOrientedRectanglePolygon(
          `vehicle:${candidate.vehicleId}`,
          candidate.positionM,
          candidate.halfExtentsM,
          candidate.yawRad,
        ),
        bottomM: candidate.bottomM,
        topM: candidate.topM,
      })),
  ];
  const blocker = blockingSolid(solids, character, door.positionM);
  if (blocker !== null)
    return refuse(
      tick,
      vehicle.vehicleId,
      'PATH_BLOCKED',
      `solid ${blocker.id} stands between the character and the door`,
      door,
      blocker.id,
    );

  const before = vehicleEntryBits(vehicle);
  const entered: VehicleEntryVehicle = Object.freeze({
    ...vehicle,
    state: Object.freeze({
      ...vehicle.state,
      controlMode: VEHICLE_ENTRY_POLICY.entryMode,
    }),
  });
  const after = vehicleEntryBits(entered);
  // Structural self-check: if one preserved bit moved, the transition is refused loudly.
  if (before !== after) fail('INVALID_ENTRY_STATE', 'entry changed a preserved vehicle field');

  const count = vehicles.length + 1;
  return Object.freeze({
    accepted: true,
    tick,
    vehicleId: vehicle.vehicleId,
    authority: Object.freeze({ consumer: 'VEHICLE' as const, vehicleId: vehicle.vehicleId }),
    previousAuthority: authority,
    previousMode: vehicle.state.controlMode,
    mode: VEHICLE_ENTRY_POLICY.entryMode,
    vehicle: entered,
    character,
    door,
    entities: Object.freeze({
      before: count,
      after: count,
      vehicles: vehicles.length,
      characters: 1,
    }),
    camera: Object.freeze({
      tick,
      authorityEntityId: vehicle.vehicleId,
      previousEntityId: character.entityId,
    }),
    bits: Object.freeze({ before, after }),
    journal: Object.freeze({ tick, vehicleId: vehicle.vehicleId }),
  });
}
