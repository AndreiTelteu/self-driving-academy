/**
 * PBI 197 — quick taxi switching from the fleet list and the return to walking.
 *
 * The contract is pure, headless and fail-closed: no clock, no DOM, no Babylon, no `Math.random`
 * and no simulation service. It receives the fleet list of PBI 057/075 as plain data, the single
 * PBI 193 authority, the walking body of PBI 191/192, the cars with their whole preserved state and
 * the PBI 192 walk world, and it composes the delivered transitions instead of re-implementing them.
 * Nothing it receives is mutated: every returned record is a fresh frozen copy.
 *
 * The defect this contract exists to prevent is the single "select" verb whose meaning depends on
 * the context. There are two explicit commands, and they never do each other's work:
 *
 * 1. `decideFleetFocus` — FOCUS. A taxi picked from the list becomes the camera target and nothing
 *    else. The 193 authority is copied unchanged, the walking body is not moved (its IEEE-754
 *    position bits are identical before and after) and the entity count is unchanged; a taxi 200 m
 *    away is a perfectly valid focus. The camera follows the chosen `entityId` with the existing
 *    194 transition of 18 ticks. FOCUS never zones, never teleports and never enters a car.
 *
 * 2. `decideFleetTake` — TAKE. A real takeover with the rules of PBI 195/196. From the character it
 *    is exactly `decideVehicleEntry`; from another car it is a valid 196 exit (the old car returns
 *    to AUTO with its pre-takeover route) followed by the 195 entry into the new car. The two
 *    decisions are composed atomically: if the entry is refused, the exit is reported but not
 *    applied, so no intermediate state with the authority on a non-existent entity can exist. A
 *    distant taxi is refused by the real 195 reach rule (`OUT_OF_RANGE`), not by a new one.
 *
 * 3. `decideFleetReturn` — the return to walking. It always releases the car through the valid 196
 *    exit and then restores the physical body: the position the character had before the takeover
 *    when that point is still physically valid (bit-identical resume), otherwise the 196 exit point.
 *    A wall built over the remembered point in the meantime cannot be walked through, because the
 *    remembered point is tested with the same clearance, ground and step rules and is confirmed by
 *    the real 192 walker; the fallback is the valid exit, never a teleport.
 *
 * Criterion 2 is the UI projection: `fleetSwitchProjection` returns the controlled entity, its
 * mode, the camera target and an explicit divergence flag, and `validateFleetSwitchProjection`
 * refuses an incoherent record (a VEHICLE controlled in AUTO, a camera on the character while a car
 * is controlled with no FOCUS reason, a divergence flag that disagrees with the ids, an unknown
 * entity). The state is plain data, serialisable for PBI 200 and replayable byte for byte.
 */
import type { InputAuthority } from '../input';
import type { ControlMode } from '../vehicles';
import { createCharacterAsset } from './asset';
import { characterPositionBits } from './authority';
import { CHARACTER_CAMERA_POLICY } from './character-camera';
import { CHARACTER_SAMPLING_HZ } from './clips';
import {
  decideVehicleEntry,
  VEHICLE_ENTRY_POLICY,
  type VehicleEntryDecision,
  type VehicleEntryRefusalCode,
  type VehicleEntryState,
  type VehicleEntryVehicle,
} from './enter-vehicle';
import {
  decideVehicleExit,
  type VehicleExitDecision,
  type VehicleExitRefusalCode,
  type VehicleExitVehicle,
  type VehicleExitWorld,
} from './exit-vehicle';
import type { CharacterPoint } from './skeleton';
import {
  createOrientedRectanglePolygon,
  walkPolygonDistanceM,
  type WalkPolygon,
} from './walk-geometry';
import { createWalkWorld, type WalkWorld } from './walk-world';
import { createWalker, WALKER_POLICY } from './walker';

export const FLEET_SWITCH_CONTRACT_VERSION = '197-fleet-switch-v1' as const;
export const FLEET_SWITCH_PROJECTION_VERSION = '197-fleet-switch-projection-v1' as const;

/**
 * The policy reads delivered values only: the 60 Hz fixed tick of 192/193/194/195/196, the existing
 * 194 transition length, the 196 clearance and step ceiling, and the 195 reach for TAKE. The 200 m
 * focus proof distance is an evidence parameter, not a rule: FOCUS has no distance limit.
 */
export const FLEET_SWITCH_POLICY = Object.freeze({
  contract: FLEET_SWITCH_CONTRACT_VERSION,
  tickHz: CHARACTER_SAMPLING_HZ,
  cameraTransitionTicks: CHARACTER_CAMERA_POLICY.transitionTicks,
  focusProofDistanceM: 200,
  /** Exactly the PBI 195 reach: TAKE invents no second interaction radius. */
  takeReachM: VEHICLE_ENTRY_POLICY.interactionRadiusM,
  minimumClearanceM: WALKER_POLICY.vehicleContactMarginM,
  maxGroundStepM: WALKER_POLICY.stepCeilingM,
});

/** Every fleet command is a separate verb; there is deliberately no generic "select". */
export const FLEET_SWITCH_COMMANDS = Object.freeze(['FOCUS', 'TAKE', 'RETURN'] as const);
export type FleetSwitchCommand = (typeof FLEET_SWITCH_COMMANDS)[number];

/** Why a command was refused. The cause of a composed 195/196 refusal is carried separately. */
export const FLEET_SWITCH_REFUSAL_CODES = Object.freeze([
  'UNKNOWN_VEHICLE',
  'SAME_ENTITY',
  'SAME_VEHICLE',
  'NOT_CONTROLLED',
  'TAKE_REFUSED',
  'RETURN_REFUSED',
  'DOUBLE_SWITCH_REFUSED',
] as const);
export type FleetSwitchRefusalCode = (typeof FLEET_SWITCH_REFUSAL_CODES)[number];

/** The delivered refusal that caused a composed TAKE or RETURN refusal. */
export type FleetSwitchCause = VehicleEntryRefusalCode | VehicleExitRefusalCode;

/** Contract violations are thrown, never reported as a normal refusal. */
export const FLEET_SWITCH_ERROR_CODES = Object.freeze([
  'INVALID_SWITCH_INPUT',
  'INVALID_SWITCH_TICK',
  'INVALID_SWITCH_VEHICLE',
  'INVALID_SWITCH_WORLD',
  'INVALID_SWITCH_STATE',
  'INCONSISTENT_PROJECTION',
] as const);
export type FleetSwitchErrorCode = (typeof FLEET_SWITCH_ERROR_CODES)[number];

export class FleetSwitchError extends Error {
  readonly code: FleetSwitchErrorCode;

  constructor(code: FleetSwitchErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'FleetSwitchError';
    this.code = code;
  }
}

/** Why the remembered body position could not be resumed; recorded for the wall branch. */
export const FLEET_RESUME_REJECTION_CODES = Object.freeze([
  'OFF_SURFACE',
  'BELOW_MAP',
  'CLEARANCE',
  'START_BLOCKED',
] as const);
export type FleetResumeRejectionCode = (typeof FLEET_RESUME_REJECTION_CODES)[number];

export const FLEET_SWITCH_CONTROL_MODES = Object.freeze(['AUTO', 'MANUAL', 'LEARNING'] as const);

const CONTROL_MODES: readonly ControlMode[] = FLEET_SWITCH_CONTROL_MODES;
const DRIVER_KINDS = Object.freeze(['TAXI', 'CIVILIAN'] as const);
const AVAILABILITIES = Object.freeze(['AVAILABLE', 'DAMAGED', 'IMMOBILIZED'] as const);
const MANEUVER_STATES = Object.freeze([
  'IDLE',
  'FOLLOWING',
  'STOPPING',
  'TURNING',
  'LANE_CHANGING',
  'RECOVERING',
] as const satisfies readonly VehicleEntryState['maneuverState'][]);
const TRACKED_KINDS = Object.freeze(['CHARACTER', 'VEHICLE'] as const);

const EPSILON = 1e-9;

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(code: FleetSwitchErrorCode, detail: string): never {
  throw new FleetSwitchError(code, detail);
}

function finite(value: unknown, label: string, code: FleetSwitchErrorCode): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(code, `${label} must be finite`);
  return value;
}

function text(value: unknown, label: string, code: FleetSwitchErrorCode): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    fail(code, `${label} must be a non-empty string`);
  return value;
}

function nullableText(value: unknown, label: string, code: FleetSwitchErrorCode): string | null {
  if (value === null || value === undefined) return null;
  return text(value, label, code);
}

function tickOf(value: unknown, label: string, code: FleetSwitchErrorCode): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(code, `${label} must be a safe non-negative integer`);
  return value;
}

function memberOf<T extends string>(
  value: unknown,
  admitted: readonly T[],
  label: string,
  code: FleetSwitchErrorCode,
): T {
  if (typeof value !== 'string' || !(admitted as readonly string[]).includes(value))
    fail(code, `${label} must be one of ${admitted.join(', ')}`);
  return value as T;
}

function readPoint(value: unknown, label: string, code: FleetSwitchErrorCode): CharacterPoint {
  if (!isRecord(value)) fail(code, `${label} must be a point`);
  return point(
    finite(value.x, `${label}.x`, code),
    finite(value.y, `${label}.y`, code),
    finite(value.z, `${label}.z`, code),
  );
}

function readAuthority(value: unknown): InputAuthority {
  if (!isRecord(value)) fail('INVALID_SWITCH_INPUT', 'authority must be a plain object');
  if (value.consumer === 'CHARACTER')
    return Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: text(value.characterId, 'authority.characterId', 'INVALID_SWITCH_INPUT'),
    });
  if (value.consumer === 'VEHICLE')
    return Object.freeze({
      consumer: 'VEHICLE' as const,
      vehicleId: text(value.vehicleId, 'authority.vehicleId', 'INVALID_SWITCH_INPUT'),
    });
  return fail('INVALID_SWITCH_INPUT', 'authority.consumer must be CHARACTER or VEHICLE');
}

/** The authoritative feet-centre + yaw of the walking body, exactly the 192 state shape. */
export interface FleetCharacterBody {
  readonly entityId: string;
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
}

export interface FleetSuspendedBody {
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  /** Tick of the TAKE that suspended the body. */
  readonly tick: number;
}

export interface FleetSwitchJournal {
  readonly tick: number;
  readonly vehicleId: string;
}

/** Serialisable state for PBI 200: focus, authority, body, journals and counters. */
export interface FleetSwitchState {
  readonly version: typeof FLEET_SWITCH_CONTRACT_VERSION;
  /** Tick of the last accepted command. */
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly character: FleetCharacterBody;
  /** Camera target of the last FOCUS; null means "the camera follows the controlled entity". */
  readonly focusEntityId: string | null;
  readonly focusSinceTick: number | null;
  /** Body position the last TAKE suspended; what RETURN tries to resume first. */
  readonly suspended: FleetSuspendedBody | null;
  readonly previousEntry: FleetSwitchJournal | null;
  readonly previousExit: FleetSwitchJournal | null;
  readonly lastCommand: Readonly<{
    tick: number;
    command: FleetSwitchCommand;
    entityId: string;
  }> | null;
  readonly counts: Readonly<{ focus: number; take: number; return: number }>;
}

export interface FleetSwitchStateOptions {
  readonly tick?: number;
  readonly authority: InputAuthority;
  readonly character: FleetCharacterBody;
  readonly focusEntityId?: string | null;
  readonly focusSinceTick?: number | null;
  readonly suspended?: FleetSuspendedBody | null;
  readonly previousEntry?: FleetSwitchJournal | null;
  readonly previousExit?: FleetSwitchJournal | null;
  readonly lastCommand?: FleetSwitchState['lastCommand'];
  readonly counts?: FleetSwitchState['counts'];
}

function readCharacterBody(value: unknown, code: FleetSwitchErrorCode): FleetCharacterBody {
  if (!isRecord(value)) fail(code, 'character body must be a plain object');
  const yawRad = finite(value.yawRad, 'character.yawRad', code);
  return Object.freeze({
    entityId: text(value.entityId, 'character.entityId', code),
    positionM: readPoint(value.positionM, 'character.positionM', code),
    yawRad,
  });
}

function readSuspended(value: unknown): FleetSuspendedBody | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) fail('INVALID_SWITCH_STATE', 'suspended must be a plain object or null');
  return Object.freeze({
    positionM: readPoint(value.positionM, 'suspended.positionM', 'INVALID_SWITCH_STATE'),
    yawRad: finite(value.yawRad, 'suspended.yawRad', 'INVALID_SWITCH_STATE'),
    tick: tickOf(value.tick, 'suspended.tick', 'INVALID_SWITCH_STATE'),
  });
}

function readJournal(value: unknown, label: string): FleetSwitchJournal | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) fail('INVALID_SWITCH_STATE', `${label} must be a plain object or null`);
  return Object.freeze({
    tick: tickOf(value.tick, `${label}.tick`, 'INVALID_SWITCH_STATE'),
    vehicleId: text(value.vehicleId, `${label}.vehicleId`, 'INVALID_SWITCH_STATE'),
  });
}

function readCounts(value: unknown): FleetSwitchState['counts'] {
  if (!isRecord(value)) fail('INVALID_SWITCH_STATE', 'counts must be a plain object');
  const focus = tickOf(value.focus, 'counts.focus', 'INVALID_SWITCH_STATE');
  const take = tickOf(value.take, 'counts.take', 'INVALID_SWITCH_STATE');
  const returned = tickOf(value.return, 'counts.return', 'INVALID_SWITCH_STATE');
  return Object.freeze({ focus, take, return: returned });
}

/** Creates the initial serialisable state of the fleet switch. */
export function createFleetSwitchState(options: FleetSwitchStateOptions): FleetSwitchState {
  if (!isRecord(options)) fail('INVALID_SWITCH_INPUT', 'state options are required');
  const tick = tickOf(options.tick ?? 0, 'state.tick', 'INVALID_SWITCH_STATE');
  const authority = readAuthority(options.authority);
  const character = readCharacterBody(options.character, 'INVALID_SWITCH_INPUT');
  const focusEntityId = nullableText(
    options.focusEntityId ?? null,
    'focusEntityId',
    'INVALID_SWITCH_STATE',
  );
  const focusSinceTick =
    options.focusSinceTick === null || options.focusSinceTick === undefined
      ? null
      : tickOf(options.focusSinceTick, 'focusSinceTick', 'INVALID_SWITCH_STATE');
  if ((focusEntityId === null) !== (focusSinceTick === null))
    fail('INVALID_SWITCH_STATE', 'focusEntityId and focusSinceTick must be null together');
  if (focusEntityId === character.entityId)
    fail('INVALID_SWITCH_STATE', 'focus on the character is not a focus, it is the default camera');
  return Object.freeze({
    version: FLEET_SWITCH_CONTRACT_VERSION,
    tick,
    authority,
    character,
    focusEntityId,
    focusSinceTick,
    suspended: readSuspended(options.suspended ?? null),
    previousEntry: readJournal(options.previousEntry ?? null, 'previousEntry'),
    previousExit: readJournal(options.previousExit ?? null, 'previousExit'),
    lastCommand:
      options.lastCommand === null || options.lastCommand === undefined
        ? null
        : Object.freeze({
            tick: tickOf(options.lastCommand.tick, 'lastCommand.tick', 'INVALID_SWITCH_STATE'),
            command: memberOf(
              options.lastCommand.command,
              FLEET_SWITCH_COMMANDS,
              'lastCommand.command',
              'INVALID_SWITCH_STATE',
            ),
            entityId: text(
              options.lastCommand.entityId,
              'lastCommand.entityId',
              'INVALID_SWITCH_STATE',
            ),
          }),
    counts: readCounts(options.counts ?? Object.freeze({ focus: 0, take: 0, return: 0 })),
  });
}

function readLastCommand(value: unknown): FleetSwitchState['lastCommand'] {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) fail('INVALID_SWITCH_STATE', 'lastCommand must be a plain object or null');
  return Object.freeze({
    tick: tickOf(value.tick, 'lastCommand.tick', 'INVALID_SWITCH_STATE'),
    command: memberOf(
      value.command,
      FLEET_SWITCH_COMMANDS,
      'lastCommand.command',
      'INVALID_SWITCH_STATE',
    ),
    entityId: text(value.entityId, 'lastCommand.entityId', 'INVALID_SWITCH_STATE'),
  });
}

function readState(value: unknown): FleetSwitchState {
  if (!isRecord(value)) fail('INVALID_SWITCH_STATE', 'fleet switch state must be a plain object');
  if (value.version !== FLEET_SWITCH_CONTRACT_VERSION)
    fail('INVALID_SWITCH_STATE', 'unsupported fleet switch state version');
  if (!isRecord(value.character)) fail('INVALID_SWITCH_STATE', 'state.character is required');
  const focusSinceTick =
    value.focusSinceTick === null || value.focusSinceTick === undefined
      ? null
      : tickOf(value.focusSinceTick, 'state.focusSinceTick', 'INVALID_SWITCH_STATE');
  const state = createFleetSwitchState({
    tick: tickOf(value.tick, 'state.tick', 'INVALID_SWITCH_STATE'),
    authority: readAuthority(value.authority),
    character: readCharacterBody(value.character, 'INVALID_SWITCH_STATE'),
    focusEntityId: nullableText(value.focusEntityId, 'state.focusEntityId', 'INVALID_SWITCH_STATE'),
    focusSinceTick,
    suspended: readSuspended(value.suspended),
    previousEntry: readJournal(value.previousEntry, 'previousEntry'),
    previousExit: readJournal(value.previousExit, 'previousExit'),
    lastCommand: readLastCommand(value.lastCommand),
    counts: readCounts(value.counts),
  });
  if (state.previousEntry !== null && state.previousEntry.tick > state.tick)
    fail('INVALID_SWITCH_STATE', 'previousEntry is in the future');
  if (state.previousExit !== null && state.previousExit.tick > state.tick)
    fail('INVALID_SWITCH_STATE', 'previousExit is in the future');
  if (state.lastCommand !== null && state.lastCommand.tick !== state.tick)
    fail('INVALID_SWITCH_STATE', 'lastCommand must belong to the state tick');
  return state;
}

/** JSON-serialisable, frozen snapshot; the strict parser above is its inverse. */
export function fleetSwitchSnapshot(state: FleetSwitchState): FleetSwitchState {
  return readState(state);
}

/** The strict inverse of `fleetSwitchSnapshot`, used by PBI 200 on load. */
export function parseFleetSwitchState(value: unknown): FleetSwitchState {
  return readState(value);
}

/**
 * The cars of the fleet list. 195/196 validate the whole vehicle record when they are called; here
 * only the fields this contract itself reads are checked, so a malformed list fails at its boundary.
 */
function readFleet(value: unknown): readonly VehicleEntryVehicle[] {
  if (!Array.isArray(value)) fail('INVALID_SWITCH_INPUT', 'vehicles must be an array');
  const seen = new Set<string>();
  const vehicles: VehicleEntryVehicle[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) fail('INVALID_SWITCH_VEHICLE', 'vehicle must be a plain object');
    const vehicleId = text(entry.vehicleId, 'vehicle.vehicleId', 'INVALID_SWITCH_VEHICLE');
    if (seen.has(vehicleId)) fail('INVALID_SWITCH_VEHICLE', `duplicate vehicle ${vehicleId}`);
    seen.add(vehicleId);
    memberOf(
      entry.driverKind,
      DRIVER_KINDS,
      `vehicle ${vehicleId} driverKind`,
      'INVALID_SWITCH_VEHICLE',
    );
    memberOf(
      entry.availability,
      AVAILABILITIES,
      `vehicle ${vehicleId} availability`,
      'INVALID_SWITCH_VEHICLE',
    );
    if (!isRecord(entry.state))
      fail('INVALID_SWITCH_VEHICLE', `vehicle ${vehicleId} needs a state`);
    memberOf(
      entry.state.controlMode,
      CONTROL_MODES,
      `vehicle ${vehicleId} controlMode`,
      'INVALID_SWITCH_VEHICLE',
    );
    readPoint(entry.positionM, `vehicle ${vehicleId} positionM`, 'INVALID_SWITCH_VEHICLE');
    finite(entry.yawRad, `vehicle ${vehicleId} yawRad`, 'INVALID_SWITCH_VEHICLE');
    vehicles.push(entry as unknown as VehicleEntryVehicle);
  }
  return Object.freeze(vehicles);
}

function readWorld(value: unknown): VehicleExitWorld {
  if (!isRecord(value)) fail('INVALID_SWITCH_WORLD', 'world must be a plain object');
  if (!Array.isArray(value.surfaces))
    fail('INVALID_SWITCH_WORLD', 'world.surfaces must be an array');
  if (!Array.isArray(value.blockers))
    fail('INVALID_SWITCH_WORLD', 'world.blockers must be an array');
  const surfaces = value.surfaces.map((surface, index) => {
    if (!isRecord(surface)) fail('INVALID_SWITCH_WORLD', `surface ${index} must be an object`);
    if (!isRecord(surface.polygon) || !Array.isArray(surface.polygon.vertices))
      fail('INVALID_SWITCH_WORLD', `surface ${index} needs a polygon`);
    return surface as unknown as VehicleExitWorld['surfaces'][number];
  });
  const blockers = value.blockers.map((blocker, index) => {
    if (!isRecord(blocker)) fail('INVALID_SWITCH_WORLD', `blocker ${index} must be an object`);
    if (!isRecord(blocker.polygon) || !Array.isArray(blocker.polygon.vertices))
      fail('INVALID_SWITCH_WORLD', `blocker ${index} needs a polygon`);
    return blocker as unknown as VehicleExitWorld['blockers'][number];
  });
  return Object.freeze({
    surfaces: Object.freeze(surfaces),
    blockers: Object.freeze(blockers),
    defaultGroundM: finite(value.defaultGroundM, 'world.defaultGroundM', 'INVALID_SWITCH_WORLD'),
  });
}

function readControlled(
  value: unknown,
): Readonly<{ vehicle: VehicleExitVehicle; preTakeover: VehicleExitVehicle }> | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) fail('INVALID_SWITCH_INPUT', 'controlled must be a plain object or null');
  const vehicle = readSeatedVehicle(value.vehicle, 'controlled.vehicle');
  const preTakeover = readSeatedVehicle(value.preTakeover, 'controlled.preTakeover');
  if (preTakeover.vehicleId !== vehicle.vehicleId)
    fail(
      'INVALID_SWITCH_INPUT',
      `preTakeover names ${preTakeover.vehicleId}, not the controlled ${vehicle.vehicleId}`,
    );
  return Object.freeze({ vehicle, preTakeover });
}

function readSeatedVehicle(value: unknown, label: string): VehicleExitVehicle {
  if (!isRecord(value)) fail('INVALID_SWITCH_INPUT', `${label} must be a plain object`);
  const vehicleId = text(value.vehicleId, `${label}.vehicleId`, 'INVALID_SWITCH_INPUT');
  return Object.freeze({
    vehicleId,
    driverKind: memberOf(
      value.driverKind,
      DRIVER_KINDS,
      `${label}.driverKind`,
      'INVALID_SWITCH_INPUT',
    ),
    classId: text(value.classId, `${label}.classId`, 'INVALID_SWITCH_INPUT'),
    positionM: readPoint(value.positionM, `${label}.positionM`, 'INVALID_SWITCH_INPUT'),
    yawRad: finite(value.yawRad, `${label}.yawRad`, 'INVALID_SWITCH_INPUT'),
    halfExtentsM: readHalfExtents(value.halfExtentsM, `${label}.halfExtentsM`),
    bottomM: finite(value.bottomM, `${label}.bottomM`, 'INVALID_SWITCH_INPUT'),
    topM: finite(value.topM, `${label}.topM`, 'INVALID_SWITCH_INPUT'),
    availability: memberOf(
      value.availability,
      AVAILABILITIES,
      `${label}.availability`,
      'INVALID_SWITCH_INPUT',
    ),
    state: readSeatedState(value.state, label),
  });
}

function readHalfExtents(value: unknown, label: string): Readonly<{ x: number; z: number }> {
  if (!isRecord(value)) fail('INVALID_SWITCH_INPUT', `${label} must be a plain object`);
  const x = finite(value.x, `${label}.x`, 'INVALID_SWITCH_INPUT');
  const z = finite(value.z, `${label}.z`, 'INVALID_SWITCH_INPUT');
  if (x <= 0 || z <= 0) fail('INVALID_SWITCH_INPUT', `${label} must be positive`);
  return Object.freeze({ x, z });
}

function readSeatedState(value: unknown, label: string): VehicleExitVehicle['state'] {
  if (!isRecord(value)) fail('INVALID_SWITCH_INPUT', `${label}.state must be a plain object`);
  if (!Array.isArray(value.routeLaneIds))
    fail('INVALID_SWITCH_INPUT', `${label}.state.routeLaneIds must be an array`);
  return Object.freeze({
    tick: tickOf(value.tick, `${label}.state.tick`, 'INVALID_SWITCH_INPUT'),
    controlMode: memberOf(
      value.controlMode,
      CONTROL_MODES,
      `${label}.state.controlMode`,
      'INVALID_SWITCH_INPUT',
    ),
    velocityMps: readPoint(value.velocityMps, `${label}.state.velocityMps`, 'INVALID_SWITCH_INPUT'),
    laneId: nullableText(value.laneId, `${label}.state.laneId`, 'INVALID_SWITCH_INPUT'),
    maneuverState: memberOf(
      value.maneuverState,
      MANEUVER_STATES,
      `${label}.state.maneuverState`,
      'INVALID_SWITCH_INPUT',
    ),
    routeLaneIds: Object.freeze(
      value.routeLaneIds.map((laneId, index) =>
        text(laneId, `${label}.state.routeLaneIds[${index}]`, 'INVALID_SWITCH_INPUT'),
      ),
    ),
    rideId: nullableText(value.rideId, `${label}.state.rideId`, 'INVALID_SWITCH_INPUT'),
    rideProgressM: finite(
      value.rideProgressM,
      `${label}.state.rideProgressM`,
      'INVALID_SWITCH_INPUT',
    ),
    appliedProfileVersion: text(
      value.appliedProfileVersion,
      `${label}.state.appliedProfileVersion`,
      'INVALID_SWITCH_INPUT',
    ),
  });
}

/** The capsule measured by PBI 191, exactly what the 192 walker uses by default. */
const CAPSULE = (() => {
  const measured = createCharacterAsset().measured;
  return Object.freeze({
    radiusM: Math.max(measured.footprintWidthM, measured.footprintDepthM) / 2,
    heightM: measured.heightM,
  });
})();

const entityIdOf = (authority: InputAuthority): string =>
  authority.consumer === 'CHARACTER' ? authority.characterId : authority.vehicleId;

const planarDistance = (from: CharacterPoint, to: CharacterPoint): number =>
  Math.hypot(to.x - from.x, to.z - from.z);

export interface FleetEntityCounts {
  readonly before: number;
  readonly after: number;
  readonly vehicles: number;
  readonly characters: number;
}

export type FleetTrackedKind = (typeof TRACKED_KINDS)[number];

/** Exactly the fields the composition hands to the existing PBI 194 step for this tick. */
export interface FleetCameraRequest {
  readonly tick: number;
  /** What the 194 step receives as the entity of the tick: the focused entity or the authority. */
  readonly trackedEntityId: string;
  readonly trackedKind: FleetTrackedKind;
  /** The entity the PBI 193 authority names after the command. */
  readonly authorityEntityId: string;
  readonly previousTrackedEntityId: string;
  /** True when the camera target differs from the authority, which only FOCUS may do. */
  readonly diverged: boolean;
  readonly changed: boolean;
  /** The existing 194 transition length; a changed target starts exactly this many frames. */
  readonly transitionTicks: number;
}

function cameraRequest(
  tick: number,
  trackedEntityId: string,
  trackedKind: FleetTrackedKind,
  authority: InputAuthority,
  previousTrackedEntityId: string,
): FleetCameraRequest {
  const authorityEntityId = entityIdOf(authority);
  return Object.freeze({
    tick,
    trackedEntityId,
    trackedKind,
    authorityEntityId,
    previousTrackedEntityId,
    diverged: trackedEntityId !== authorityEntityId,
    changed: trackedEntityId !== previousTrackedEntityId,
    transitionTicks: FLEET_SWITCH_POLICY.cameraTransitionTicks,
  });
}

function currentTrackedEntityId(state: FleetSwitchState): string {
  return state.focusEntityId ?? entityIdOf(state.authority);
}

function duplicateRefusal(
  command: 'FOCUS',
  tick: number,
  vehicleId: string | null,
  state: FleetSwitchState,
): FleetFocusRefusal;
function duplicateRefusal(
  command: 'TAKE',
  tick: number,
  vehicleId: string | null,
  state: FleetSwitchState,
): FleetTakeRefusal;
function duplicateRefusal(
  command: 'RETURN',
  tick: number,
  vehicleId: string | null,
  state: FleetSwitchState,
): FleetReturnRefusal;
function duplicateRefusal(
  command: FleetSwitchCommand,
  tick: number,
  vehicleId: string | null,
  state: FleetSwitchState,
): FleetFocusRefusal | FleetTakeRefusal | FleetReturnRefusal {
  const previous = state.lastCommand;
  if (previous === null || previous.tick !== tick)
    fail('INVALID_SWITCH_STATE', 'a duplicate refusal needs a command in the same tick');
  const detail = `tick ${tick} already accepted ${previous.command} on ${previous.entityId}; one fleet command per tick`;
  if (command === 'FOCUS')
    return Object.freeze({
      kind: 'FOCUS' as const,
      accepted: false as const,
      tick,
      vehicleId,
      code: 'DOUBLE_SWITCH_REFUSED' as const,
      detail,
    });
  if (command === 'TAKE')
    return Object.freeze({
      kind: 'TAKE' as const,
      accepted: false as const,
      tick,
      vehicleId,
      code: 'DOUBLE_SWITCH_REFUSED' as const,
      cause: null,
      detail,
      exit: null,
      entry: null,
    });
  return Object.freeze({
    kind: 'RETURN' as const,
    accepted: false as const,
    tick,
    vehicleId,
    code: 'DOUBLE_SWITCH_REFUSED' as const,
    cause: null,
    detail,
    exit: null,
  });
}

function isDuplicate(tick: number, state: FleetSwitchState): boolean {
  return state.lastCommand !== null && state.lastCommand.tick === tick;
}

function entityCounts(vehicles: number): FleetEntityCounts {
  const total = vehicles + 1;
  return Object.freeze({ before: total, after: total, vehicles, characters: 1 });
}

/**
 * The walk world of PBI 192, rebuilt from the plain 196 shape. Every car is a solid with the real
 * 0.05 m vehicle margin, exactly like the walker's own vehicle snapshots, so a remembered body point
 * cannot be restored inside a car body.
 */
function walkWorldOf(world: VehicleExitWorld, vehicles: readonly VehicleExitVehicle[]): WalkWorld {
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
        marginM: FLEET_SWITCH_POLICY.minimumClearanceM,
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

interface Solid {
  readonly id: string;
  readonly polygon: WalkPolygon;
  readonly bottomM: number;
  readonly topM: number;
  readonly marginM: number;
}

function verticalOverlap(solid: Solid, feetM: number, heightM: number): boolean {
  return solid.topM > feetM && solid.bottomM < feetM + heightM;
}

/**
 * Is the remembered body point still a legal physical position? The same four rules as the PBI 196
 * candidate test (authored surface, not below the map plane, free clearance to every solid and every
 * car) plus the real PBI 192 walker as the final word. Returns the first real reason, never a guess.
 */
export function characterPointCheck(
  world: VehicleExitWorld,
  vehicles: readonly VehicleExitVehicle[],
  positionM: CharacterPoint,
  yawRad: number,
): Readonly<{
  valid: boolean;
  code: FleetResumeRejectionCode | null;
  detail: string;
  clearanceM: number;
  nearestBlockerId: string | null;
}> {
  const walkWorld = walkWorldOf(world, vehicles);
  const groundM = walkWorld.surfaceAt(positionM.x, positionM.z);
  if (groundM < world.defaultGroundM - EPSILON)
    return Object.freeze({
      valid: false,
      code: 'BELOW_MAP' as const,
      detail: `ground ${groundM.toFixed(4)} m is below the map plane ${world.defaultGroundM.toFixed(4)} m`,
      clearanceM: Number.POSITIVE_INFINITY,
      nearestBlockerId: null,
    });
  if (Math.abs(positionM.y - groundM) > EPSILON)
    return Object.freeze({
      valid: false,
      code: 'OFF_SURFACE' as const,
      detail: `body at ${positionM.y.toFixed(4)} m does not stand on the surface ${groundM.toFixed(4)} m`,
      clearanceM: Number.POSITIVE_INFINITY,
      nearestBlockerId: null,
    });

  const solids: Solid[] = [
    ...walkWorld.blockers.map((blocker) => ({
      id: blocker.id,
      polygon: blocker.polygon,
      bottomM: blocker.bottomM,
      topM: blocker.topM,
      marginM: blocker.marginM,
    })),
  ];
  let clearanceM = Number.POSITIVE_INFINITY;
  let nearestBlockerId: string | null = null;
  for (const solid of solids) {
    if (!verticalOverlap(solid, groundM, CAPSULE.heightM)) continue;
    const gap =
      walkPolygonDistanceM(solid.polygon, positionM.x, positionM.z) -
      CAPSULE.radiusM -
      solid.marginM;
    if (gap < clearanceM) {
      clearanceM = gap;
      nearestBlockerId = solid.id;
    }
    if (gap < -EPSILON)
      return Object.freeze({
        valid: false,
        code: 'CLEARANCE' as const,
        detail: `solid ${solid.id} leaves ${gap.toFixed(4)} m of free gap`,
        clearanceM: gap,
        nearestBlockerId: solid.id,
      });
  }

  try {
    createWalker({ world: walkWorld, start: { positionM, yawRad } });
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'UNKNOWN';
    return Object.freeze({
      valid: false,
      code: 'START_BLOCKED' as const,
      detail: `the PBI 192 walker refused the start: ${code}`,
      clearanceM,
      nearestBlockerId,
    });
  }
  return Object.freeze({
    valid: true,
    code: null,
    detail: 'the body point is still physically valid',
    clearanceM,
    nearestBlockerId,
  });
}

// ---------------------------------------------------------------------------------------------
// FOCUS — only the camera moves.
// ---------------------------------------------------------------------------------------------

export interface FleetFocusRequest {
  readonly tick: number;
  readonly state: FleetSwitchState;
  readonly vehicleId: string;
  readonly vehicles: readonly VehicleEntryVehicle[];
}

export interface FleetFocusAcceptance {
  readonly kind: 'FOCUS';
  readonly accepted: true;
  readonly tick: number;
  readonly vehicleId: string;
  /** The 193 authority is copied, not replaced: FOCUS never changes who receives input. */
  readonly authority: InputAuthority;
  readonly previousAuthority: InputAuthority;
  readonly character: FleetCharacterBody & Readonly<{ positionBits: string }>;
  readonly previousFocusEntityId: string | null;
  readonly focus: Readonly<{ entityId: string; distanceM: number; sinceTick: number }>;
  readonly camera: FleetCameraRequest;
  readonly entities: FleetEntityCounts;
  /** IEEE-754 proof: the body did not move by a single bit. */
  readonly bits: Readonly<{ before: string; after: string; identical: boolean }>;
  readonly state: FleetSwitchState;
  readonly verdict: Readonly<{
    characterMoved: false;
    characterCloned: false;
    authorityChanged: false;
    entityCountChanged: false;
  }>;
}

export interface FleetFocusRefusal {
  readonly kind: 'FOCUS';
  readonly accepted: false;
  readonly tick: number;
  readonly vehicleId: string | null;
  readonly code: FleetSwitchRefusalCode;
  readonly detail: string;
}

export type FleetFocusDecision = FleetFocusAcceptance | FleetFocusRefusal;

/**
 * FOCUS: the selected taxi becomes the camera target. No distance rule, no reach test, no entry,
 * no movement, no clone: the character stays exactly where it was and keeps the input authority.
 */
export function decideFleetFocus(request: FleetFocusRequest): FleetFocusDecision {
  if (!isRecord(request)) fail('INVALID_SWITCH_INPUT', 'focus request is required');
  const tick = tickOf(request.tick, 'tick', 'INVALID_SWITCH_TICK');
  const state = readState(request.state);
  const vehicles = readFleet(request.vehicles);
  const vehicleId = text(request.vehicleId, 'vehicleId', 'INVALID_SWITCH_INPUT');

  const duplicate = isDuplicate(tick, state);
  if (duplicate) return duplicateRefusal('FOCUS', tick, vehicleId, state);

  const target = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId) ?? null;
  if (target === null)
    return Object.freeze({
      kind: 'FOCUS' as const,
      accepted: false as const,
      tick,
      vehicleId,
      code: 'UNKNOWN_VEHICLE' as const,
      detail: `vehicle ${vehicleId} is not part of the fleet list`,
    });

  const previousFocusEntityId = state.focusEntityId;
  if (currentTrackedEntityId(state) === vehicleId)
    return Object.freeze({
      kind: 'FOCUS' as const,
      accepted: false as const,
      tick,
      vehicleId,
      code: 'SAME_ENTITY' as const,
      detail: `the camera already follows ${vehicleId}`,
    });

  const beforeBits = characterPositionBits(state.character.positionM);
  const afterBits = characterPositionBits(state.character.positionM);
  // Structural self-check: FOCUS owns no body write, so the bits cannot differ.
  if (beforeBits !== afterBits)
    fail('INVALID_SWITCH_STATE', 'FOCUS changed the character position');
  if (vehicleId === state.character.entityId)
    fail('INVALID_SWITCH_STATE', 'a vehicle may not carry the character entity id');

  const nextState = Object.freeze({
    ...state,
    tick,
    focusEntityId: vehicleId,
    focusSinceTick: tick,
    lastCommand: Object.freeze({ tick, command: 'FOCUS' as const, entityId: vehicleId }),
    counts: Object.freeze({ ...state.counts, focus: state.counts.focus + 1 }),
  });

  return Object.freeze({
    kind: 'FOCUS' as const,
    accepted: true as const,
    tick,
    vehicleId,
    authority: state.authority,
    previousAuthority: state.authority,
    character: Object.freeze({
      entityId: state.character.entityId,
      positionM: state.character.positionM,
      yawRad: state.character.yawRad,
      positionBits: afterBits,
    }),
    previousFocusEntityId,
    focus: Object.freeze({
      entityId: vehicleId,
      distanceM: planarDistance(state.character.positionM, target.positionM),
      sinceTick: tick,
    }),
    camera: cameraRequest(
      tick,
      vehicleId,
      'VEHICLE',
      state.authority,
      currentTrackedEntityId(state),
    ),
    entities: entityCounts(vehicles.length),
    bits: Object.freeze({
      before: beforeBits,
      after: afterBits,
      identical: beforeBits === afterBits,
    }),
    state: nextState,
    verdict: Object.freeze({
      characterMoved: false as const,
      characterCloned: false as const,
      authorityChanged: false as const,
      entityCountChanged: false as const,
    }),
  });
}

// ---------------------------------------------------------------------------------------------
// TAKE — a real takeover with the 195/196 rules.
// ---------------------------------------------------------------------------------------------

export interface FleetTakeRequest {
  readonly tick: number;
  readonly state: FleetSwitchState;
  readonly vehicleId: string;
  readonly vehicles: readonly VehicleEntryVehicle[];
  readonly world: VehicleExitWorld;
  /** The car currently held by the player seat; required exactly when the authority is a vehicle. */
  readonly controlled?: FleetTakeControlled | null;
}

export interface FleetTakeControlled {
  readonly vehicle: VehicleExitVehicle;
  readonly preTakeover: VehicleExitVehicle;
}

export interface FleetTakeAcceptance {
  readonly kind: 'TAKE';
  readonly accepted: true;
  readonly tick: number;
  readonly vehicleId: string;
  readonly authority: InputAuthority;
  readonly previousAuthority: InputAuthority;
  /** The delivered 195 acceptance, unchanged. */
  readonly entry: VehicleEntryDecision & Readonly<{ accepted: true }>;
  /** The delivered 196 acceptance that released the previous car, or null when on foot. */
  readonly exit: (VehicleExitDecision & Readonly<{ accepted: true }>) | null;
  /** The character body after the command; the same entity, never a clone. */
  readonly character: FleetCharacterBody & Readonly<{ positionBits: string }>;
  /** What RETURN will try to resume: the body position before the takeover. */
  readonly suspended: FleetSuspendedBody;
  readonly camera: FleetCameraRequest;
  readonly entities: FleetEntityCounts;
  readonly bits: Readonly<{ before: string; after: string; identical: boolean }>;
  readonly state: FleetSwitchState;
}

export interface FleetTakeRefusal {
  readonly kind: 'TAKE';
  readonly accepted: false;
  readonly tick: number;
  readonly vehicleId: string | null;
  readonly code: FleetSwitchRefusalCode;
  /** The delivered 195/196 refusal code that caused this refusal, when there is one. */
  readonly cause: FleetSwitchCause | null;
  readonly detail: string;
  /** Both composed decisions, kept for the report even when nothing was applied. */
  readonly exit: VehicleExitDecision | null;
  readonly entry: VehicleEntryDecision | null;
}

export type FleetTakeDecision = FleetTakeAcceptance | FleetTakeRefusal;

/**
 * TAKE: the real takeover. From the character this is exactly the PBI 195 entry; from another car it
 * is the PBI 196 exit composed with that entry. The composition is atomic: an accepted exit is only
 * applied when the entry is also accepted, so the authority never points at a car the player is not
 * in and the old car is never released into AUTO for a takeover that did not happen.
 */
export function decideFleetTake(request: FleetTakeRequest): FleetTakeDecision {
  if (!isRecord(request)) fail('INVALID_SWITCH_INPUT', 'take request is required');
  const tick = tickOf(request.tick, 'tick', 'INVALID_SWITCH_TICK');
  const state = readState(request.state);
  const vehicles = readFleet(request.vehicles);
  const world = readWorld(request.world);
  const vehicleId = text(request.vehicleId, 'vehicleId', 'INVALID_SWITCH_INPUT');
  const controlled = readControlled(request.controlled ?? null);

  const duplicate = isDuplicate(tick, state);
  if (duplicate) return duplicateRefusal('TAKE', tick, vehicleId, state);

  const target = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId) ?? null;
  if (target === null)
    return takeRefusal(
      tick,
      vehicleId,
      'UNKNOWN_VEHICLE',
      null,
      `vehicle ${vehicleId} is not part of the fleet list`,
      null,
      null,
    );
  if (state.authority.consumer === 'VEHICLE' && state.authority.vehicleId === vehicleId)
    return takeRefusal(
      tick,
      vehicleId,
      'SAME_VEHICLE',
      null,
      `the player seat already holds ${vehicleId}`,
      null,
      null,
    );
  if (state.authority.consumer === 'VEHICLE') {
    if (controlled === null)
      fail(
        'INVALID_SWITCH_INPUT',
        'a held car needs its current snapshot and its pre-takeover state',
      );
    if (controlled.vehicle.vehicleId !== state.authority.vehicleId)
      fail(
        'INVALID_SWITCH_INPUT',
        `controlled names ${controlled.vehicle.vehicleId}, not the held ${state.authority.vehicleId}`,
      );
  } else if (controlled !== null)
    fail('INVALID_SWITCH_INPUT', 'a walking character holds no car, so controlled must be null');

  let exit: (VehicleExitDecision & Readonly<{ accepted: true }>) | null = null;
  let character: FleetCharacterBody = state.character;
  let fleet: readonly VehicleEntryVehicle[] = vehicles;
  if (state.authority.consumer === 'VEHICLE' && controlled !== null) {
    const exitDecision = decideVehicleExit({
      tick,
      authority: state.authority,
      character: Object.freeze({
        entityId: state.character.entityId,
        radiusM: CAPSULE.radiusM,
        heightM: CAPSULE.heightM,
      }),
      vehicle: controlled.vehicle,
      preTakeover: controlled.preTakeover,
      vehicles,
      world,
      previousExit: state.previousExit,
    });
    if (!exitDecision.accepted)
      return takeRefusal(
        tick,
        vehicleId,
        'TAKE_REFUSED',
        exitDecision.code,
        `the current car ${state.authority.vehicleId} cannot be left: ${exitDecision.detail}`,
        exitDecision,
        null,
      );
    exit = exitDecision;
    character = Object.freeze({
      entityId: exitDecision.character.entityId,
      positionM: exitDecision.start.positionM,
      yawRad: exitDecision.start.yawRad,
    });
    fleet = vehicles.map((vehicle) =>
      vehicle.vehicleId === exitDecision.vehicle.vehicleId ? exitDecision.vehicle : vehicle,
    );
  }

  const entryDecision = decideVehicleEntry({
    tick,
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: state.character.entityId,
    }),
    character: Object.freeze({
      entityId: character.entityId,
      positionM: character.positionM,
      yawRad: character.yawRad,
      radiusM: CAPSULE.radiusM,
      heightM: CAPSULE.heightM,
    }),
    intent: Object.freeze({ vehicleId }),
    vehicles: fleet,
    blockers: world.blockers,
    previousEntry: state.previousEntry,
  });
  if (!entryDecision.accepted)
    return takeRefusal(
      tick,
      vehicleId,
      'TAKE_REFUSED',
      entryDecision.code,
      `vehicle ${vehicleId} cannot be taken over: ${entryDecision.detail}`,
      exit,
      entryDecision,
    );

  const beforeBits = characterPositionBits(state.character.positionM);
  const afterBits = characterPositionBits(entryDecision.character.positionM);
  // Structural self-check: from the character the body is copied; from a car 196 moved it to its
  // valid exit point, which is a real move and never a clone.
  if (exit === null && beforeBits !== afterBits)
    fail('INVALID_SWITCH_STATE', 'the entry moved the character body');
  if (entryDecision.character.entityId !== state.character.entityId)
    fail('INVALID_SWITCH_STATE', 'the entry replaced the character entity');

  const suspended = Object.freeze({
    positionM: character.positionM,
    yawRad: character.yawRad,
    tick,
  });
  const previousTrackedEntityId = currentTrackedEntityId(state);
  const nextState = Object.freeze({
    ...state,
    tick,
    authority: entryDecision.authority,
    character: Object.freeze({
      entityId: state.character.entityId,
      positionM: entryDecision.character.positionM,
      yawRad: entryDecision.character.yawRad,
    }),
    // The camera target is the controlled car now, so the focus record is consumed.
    focusEntityId: null,
    focusSinceTick: null,
    suspended,
    previousEntry: entryDecision.journal,
    previousExit: exit === null ? state.previousExit : exit.journal,
    lastCommand: Object.freeze({ tick, command: 'TAKE' as const, entityId: vehicleId }),
    counts: Object.freeze({ ...state.counts, take: state.counts.take + 1 }),
  });

  return Object.freeze({
    kind: 'TAKE' as const,
    accepted: true as const,
    tick,
    vehicleId,
    authority: entryDecision.authority,
    previousAuthority: state.authority,
    entry: entryDecision,
    exit,
    character: Object.freeze({
      entityId: entryDecision.character.entityId,
      positionM: entryDecision.character.positionM,
      yawRad: entryDecision.character.yawRad,
      positionBits: afterBits,
    }),
    suspended,
    camera: cameraRequest(
      tick,
      vehicleId,
      'VEHICLE',
      entryDecision.authority,
      previousTrackedEntityId,
    ),
    entities: Object.freeze({
      before: vehicles.length + 1,
      after: entryDecision.entities.after,
      vehicles: vehicles.length,
      characters: 1,
    }),
    bits: Object.freeze({
      before: beforeBits,
      after: afterBits,
      identical: beforeBits === afterBits,
    }),
    state: nextState,
  });
}

function takeRefusal(
  tick: number,
  vehicleId: string | null,
  code: FleetSwitchRefusalCode,
  cause: FleetSwitchCause | null,
  detail: string,
  exit: VehicleExitDecision | null,
  entry: VehicleEntryDecision | null,
): FleetTakeRefusal {
  return Object.freeze({
    kind: 'TAKE' as const,
    accepted: false as const,
    tick,
    vehicleId,
    code,
    cause,
    detail,
    exit,
    entry,
  });
}

// ---------------------------------------------------------------------------------------------
// RETURN — leave the car at a valid point and restore the physical body.
// ---------------------------------------------------------------------------------------------

export interface FleetReturnRequest {
  readonly tick: number;
  readonly state: FleetSwitchState;
  readonly vehicles: readonly VehicleEntryVehicle[];
  readonly world: VehicleExitWorld;
  readonly controlled: FleetTakeControlled;
}

export interface FleetResumeRecord {
  readonly source: 'PREVIOUS_POSITION' | 'EXIT_POINT';
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  readonly positionBits: string;
  /** The suspended body point when there is one; null when the contract started in the car. */
  readonly previous: Readonly<{ positionM: CharacterPoint; yawRad: number }> | null;
  readonly previousBits: string | null;
  /** True only when the remembered point was resumed bit for bit. */
  readonly identical: boolean;
  /** Why the remembered point was not resumed; null when it was resumed or never existed. */
  readonly rejected: Readonly<{ code: FleetResumeRejectionCode; detail: string }> | null;
  /** The real 192 walker accepted the chosen start; asserted by the contract, not promised. */
  readonly walkerStart: 'ACCEPTED';
}

export interface FleetReturnAcceptance {
  readonly kind: 'RETURN';
  readonly accepted: true;
  readonly tick: number;
  readonly vehicleId: string;
  readonly authority: InputAuthority;
  readonly previousAuthority: InputAuthority;
  readonly exit: VehicleExitDecision & Readonly<{ accepted: true }>;
  readonly resume: FleetResumeRecord;
  readonly character: FleetCharacterBody & Readonly<{ positionBits: string }>;
  readonly camera: FleetCameraRequest;
  readonly entities: FleetEntityCounts;
  readonly state: FleetSwitchState;
}

export interface FleetReturnRefusal {
  readonly kind: 'RETURN';
  readonly accepted: false;
  readonly tick: number;
  readonly vehicleId: string | null;
  readonly code: FleetSwitchRefusalCode;
  readonly cause: FleetSwitchCause | null;
  readonly detail: string;
  readonly exit: VehicleExitDecision | null;
}

export type FleetReturnDecision = FleetReturnAcceptance | FleetReturnRefusal;

/**
 * RETURN: the valid PBI 196 exit, then the physical body. The remembered point wins when it is still
 * a legal position; otherwise the contract keeps the valid exit point. The car is always released
 * through 196, so it resumes its pre-takeover route in AUTO even when the body resumes elsewhere.
 */
export function decideFleetReturn(request: FleetReturnRequest): FleetReturnDecision {
  if (!isRecord(request)) fail('INVALID_SWITCH_INPUT', 'return request is required');
  const tick = tickOf(request.tick, 'tick', 'INVALID_SWITCH_TICK');
  const state = readState(request.state);
  const vehicles = readFleet(request.vehicles);
  const world = readWorld(request.world);
  const controlled = readControlled(request.controlled);
  if (controlled === null)
    fail('INVALID_SWITCH_INPUT', 'the return needs the held car and its pre-takeover state');

  if (state.authority.consumer !== 'VEHICLE')
    return Object.freeze({
      kind: 'RETURN' as const,
      accepted: false as const,
      tick,
      vehicleId: null,
      code: 'NOT_CONTROLLED' as const,
      cause: null,
      detail: `the input authority is ${state.authority.consumer}, so there is no car to leave`,
      exit: null,
    });
  if (controlled.vehicle.vehicleId !== state.authority.vehicleId)
    fail(
      'INVALID_SWITCH_INPUT',
      `controlled names ${controlled.vehicle.vehicleId}, not the held ${state.authority.vehicleId}`,
    );

  const duplicate = isDuplicate(tick, state);
  if (duplicate) return duplicateRefusal('RETURN', tick, controlled.vehicle.vehicleId, state);

  const exitDecision = decideVehicleExit({
    tick,
    authority: state.authority,
    character: Object.freeze({
      entityId: state.character.entityId,
      radiusM: CAPSULE.radiusM,
      heightM: CAPSULE.heightM,
    }),
    vehicle: controlled.vehicle,
    preTakeover: controlled.preTakeover,
    vehicles,
    world,
    previousExit: state.previousExit,
  });
  if (!exitDecision.accepted)
    return Object.freeze({
      kind: 'RETURN' as const,
      accepted: false as const,
      tick,
      vehicleId: controlled.vehicle.vehicleId,
      code: 'RETURN_REFUSED' as const,
      cause: exitDecision.code,
      detail: `the car ${controlled.vehicle.vehicleId} cannot be left: ${exitDecision.detail}`,
      exit: exitDecision,
    });

  // The released car is a solid like any other: the remembered point is tested against the fleet
  // after the release, not against the snapshot from before it.
  const releasedFleet = vehicles.map((vehicle) =>
    vehicle.vehicleId === exitDecision.vehicle.vehicleId ? exitDecision.vehicle : vehicle,
  );
  const previous = state.suspended;
  const previousCheck =
    previous === null
      ? null
      : characterPointCheck(world, releasedFleet, previous.positionM, previous.yawRad);

  let resume: FleetResumeRecord;
  if (previous !== null && previousCheck !== null && previousCheck.valid) {
    const previousBits = characterPositionBits(previous.positionM);
    const resumedBits = characterPositionBits(previous.positionM);
    if (previousBits !== resumedBits)
      fail('INVALID_SWITCH_STATE', 'the resumed body point changed while being resumed');
    resume = Object.freeze({
      source: 'PREVIOUS_POSITION' as const,
      positionM: previous.positionM,
      yawRad: previous.yawRad,
      positionBits: resumedBits,
      previous: Object.freeze({ positionM: previous.positionM, yawRad: previous.yawRad }),
      previousBits,
      identical: true,
      rejected: null,
      walkerStart: 'ACCEPTED' as const,
    });
  } else {
    const startBits = characterPositionBits(exitDecision.start.positionM);
    const startCheck = characterPointCheck(
      world,
      releasedFleet,
      exitDecision.start.positionM,
      exitDecision.start.yawRad,
    );
    // 196 promised a valid point; if the walker disagrees the contract is broken, not the caller.
    if (!startCheck.valid)
      fail(
        'INVALID_SWITCH_STATE',
        `the 196 exit point is not a valid walker start: ${startCheck.detail}`,
      );
    resume = Object.freeze({
      source: 'EXIT_POINT' as const,
      positionM: exitDecision.start.positionM,
      yawRad: exitDecision.start.yawRad,
      positionBits: startBits,
      previous:
        previous === null
          ? null
          : Object.freeze({ positionM: previous.positionM, yawRad: previous.yawRad }),
      previousBits: previous === null ? null : characterPositionBits(previous.positionM),
      identical: false,
      rejected:
        previous !== null && previousCheck !== null && previousCheck.code !== null
          ? Object.freeze({ code: previousCheck.code, detail: previousCheck.detail })
          : null,
      walkerStart: 'ACCEPTED' as const,
    });
  }

  const nextState = Object.freeze({
    ...state,
    tick,
    authority: exitDecision.authority,
    character: Object.freeze({
      entityId: state.character.entityId,
      positionM: resume.positionM,
      yawRad: resume.yawRad,
    }),
    focusEntityId: null,
    focusSinceTick: null,
    suspended: null,
    previousExit: exitDecision.journal,
    lastCommand: Object.freeze({
      tick,
      command: 'RETURN' as const,
      entityId: controlled.vehicle.vehicleId,
    }),
    counts: Object.freeze({ ...state.counts, return: state.counts.return + 1 }),
  });

  return Object.freeze({
    kind: 'RETURN' as const,
    accepted: true as const,
    tick,
    vehicleId: controlled.vehicle.vehicleId,
    authority: exitDecision.authority,
    previousAuthority: state.authority,
    exit: exitDecision,
    resume,
    character: Object.freeze({
      entityId: state.character.entityId,
      positionM: resume.positionM,
      yawRad: resume.yawRad,
      positionBits: resume.positionBits,
    }),
    camera: cameraRequest(
      tick,
      state.character.entityId,
      'CHARACTER',
      exitDecision.authority,
      currentTrackedEntityId(state),
    ),
    entities: Object.freeze({
      before: vehicles.length + 1,
      after: exitDecision.entities.after,
      vehicles: vehicles.length,
      characters: 1,
    }),
    state: nextState,
  });
}

// ---------------------------------------------------------------------------------------------
// The UI projection and its coherence guard.
// ---------------------------------------------------------------------------------------------

export interface FleetSwitchProjection {
  readonly version: typeof FLEET_SWITCH_PROJECTION_VERSION;
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly controlled: Readonly<{
    kind: FleetTrackedKind;
    entityId: string;
    /** The exact token the UI shows: `CHARACTER:<id>` or `VEHICLE:<id>`. */
    label: string;
    mode: ControlMode;
    /** Where the mode comes from: the 024 state of the car or the manually driven character. */
    modeSource: 'CHARACTER' | 'VEHICLE';
  }>;
  readonly camera: Readonly<{
    trackedEntityId: string;
    trackedKind: FleetTrackedKind;
    diverged: boolean;
    divergenceReason: 'FOCUS' | null;
    focusSinceTick: number | null;
  }>;
  readonly entities: number;
}

export interface FleetSwitchProjectionInput {
  readonly state: FleetSwitchState;
  readonly vehicles: readonly VehicleEntryVehicle[];
}

/**
 * The one projection the UI reads. For the character the mode is MANUAL because the player drives
 * the walking body manually through PBI 193; the three 024 modes stay the car's own field.
 */
export function fleetSwitchProjection(input: FleetSwitchProjectionInput): FleetSwitchProjection {
  if (!isRecord(input)) fail('INVALID_SWITCH_INPUT', 'projection input is required');
  const state = readState(input.state);
  const vehicles = readFleet(input.vehicles);
  const trackedEntityId = currentTrackedEntityId(state);
  const authority = state.authority;
  const authorityEntityId = entityIdOf(authority);
  let mode: ControlMode;
  let modeSource: 'CHARACTER' | 'VEHICLE';
  if (authority.consumer === 'CHARACTER') {
    mode = 'MANUAL';
    modeSource = 'CHARACTER';
  } else {
    const heldVehicleId = authority.vehicleId;
    const held = vehicles.find((vehicle) => vehicle.vehicleId === heldVehicleId) ?? null;
    if (held === null)
      fail(
        'INCONSISTENT_PROJECTION',
        `the authority holds ${heldVehicleId}, which is not in the fleet list`,
      );
    mode = held.state.controlMode;
    modeSource = 'VEHICLE';
  }
  const trackedKind: FleetTrackedKind =
    trackedEntityId === state.character.entityId
      ? 'CHARACTER'
      : vehicles.some((vehicle) => vehicle.vehicleId === trackedEntityId)
        ? 'VEHICLE'
        : 'CHARACTER';

  return Object.freeze({
    version: FLEET_SWITCH_PROJECTION_VERSION,
    tick: state.tick,
    authority,
    controlled: Object.freeze({
      kind: authority.consumer,
      entityId: authorityEntityId,
      label: `${authority.consumer}:${authorityEntityId}`,
      mode,
      modeSource,
    }),
    camera: Object.freeze({
      trackedEntityId,
      trackedKind,
      diverged: trackedEntityId !== authorityEntityId,
      divergenceReason: trackedEntityId !== authorityEntityId ? 'FOCUS' : null,
      focusSinceTick: state.focusSinceTick,
    }),
    entities: vehicles.length + 1,
  });
}

/**
 * The coherence guard: an inconsistent record is refused with `INCONSISTENT_PROJECTION` instead of
 * being rendered. It is what makes criterion 2 structural rather than a formatting promise.
 */
export function validateFleetSwitchProjection(
  projection: unknown,
  input: FleetSwitchProjectionInput,
): FleetSwitchProjection {
  if (!isRecord(projection))
    fail('INCONSISTENT_PROJECTION', 'the projection must be a plain object');
  const state = readState(input.state);
  const vehicles = readFleet(input.vehicles);
  const characterId = state.character.entityId;
  const authorityEntityId = entityIdOf(state.authority);
  const vehicleIds = vehicles.map((vehicle) => vehicle.vehicleId);

  if (projection.version !== FLEET_SWITCH_PROJECTION_VERSION)
    fail('INCONSISTENT_PROJECTION', 'unsupported projection version');
  const tick = tickOf(projection.tick, 'projection.tick', 'INCONSISTENT_PROJECTION');
  if (tick !== state.tick)
    fail('INCONSISTENT_PROJECTION', `projection tick ${tick} is not the state tick ${state.tick}`);
  if (!isRecord(projection.authority))
    fail('INCONSISTENT_PROJECTION', 'the projection needs the authority');
  const authority = readAuthority(projection.authority);
  if (
    entityIdOf(authority) !== authorityEntityId ||
    authority.consumer !== state.authority.consumer
  )
    fail('INCONSISTENT_PROJECTION', 'the projection authority differs from the state authority');

  if (!isRecord(projection.controlled))
    fail('INCONSISTENT_PROJECTION', 'the projection needs the controlled entity');
  const controlled = projection.controlled;
  const kind = memberOf(
    controlled.kind,
    TRACKED_KINDS,
    'controlled.kind',
    'INCONSISTENT_PROJECTION',
  );
  const controlledId = text(controlled.entityId, 'controlled.entityId', 'INCONSISTENT_PROJECTION');
  const label = text(controlled.label, 'controlled.label', 'INCONSISTENT_PROJECTION');
  const mode = memberOf(
    controlled.mode,
    FLEET_SWITCH_CONTROL_MODES,
    'controlled.mode',
    'INCONSISTENT_PROJECTION',
  );
  const modeSource = memberOf(
    controlled.modeSource,
    ['CHARACTER', 'VEHICLE'] as const,
    'controlled.modeSource',
    'INCONSISTENT_PROJECTION',
  );
  if (label !== `${kind}:${controlledId}`)
    fail('INCONSISTENT_PROJECTION', 'the controlled label disagrees with its kind and id');
  if (kind !== state.authority.consumer || controlledId !== authorityEntityId)
    fail('INCONSISTENT_PROJECTION', 'the controlled entity is not the state authority');
  if (kind === 'CHARACTER') {
    if (controlledId !== characterId)
      fail('INCONSISTENT_PROJECTION', 'the controlled character is not the character body');
    if (modeSource !== 'CHARACTER' || mode !== 'MANUAL')
      fail(
        'INCONSISTENT_PROJECTION',
        'a controlled character is manually driven, not a 024 car mode',
      );
  } else {
    const held = vehicles.find((vehicle) => vehicle.vehicleId === controlledId) ?? null;
    if (held === null)
      fail(
        'INCONSISTENT_PROJECTION',
        `the controlled car ${controlledId} is not in the fleet list`,
      );
    if (modeSource !== 'VEHICLE' || mode !== held.state.controlMode)
      fail(
        'INCONSISTENT_PROJECTION',
        `the controlled car shows ${mode} but its 024 state is ${held.state.controlMode}`,
      );
    if (mode === 'AUTO')
      fail(
        'INCONSISTENT_PROJECTION',
        `a car in AUTO cannot be the controlled entity; ${controlledId} is driven by its policy`,
      );
  }

  if (!isRecord(projection.camera))
    fail('INCONSISTENT_PROJECTION', 'the projection needs the camera target');
  const camera = projection.camera;
  const trackedId = text(
    camera.trackedEntityId,
    'camera.trackedEntityId',
    'INCONSISTENT_PROJECTION',
  );
  const trackedKind = memberOf(
    camera.trackedKind,
    TRACKED_KINDS,
    'camera.trackedKind',
    'INCONSISTENT_PROJECTION',
  );
  const known = trackedId === characterId || vehicleIds.includes(trackedId);
  if (!known) fail('INCONSISTENT_PROJECTION', `the camera follows unknown entity ${trackedId}`);
  const expectedKind: FleetTrackedKind = trackedId === characterId ? 'CHARACTER' : 'VEHICLE';
  if (trackedKind !== expectedKind)
    fail('INCONSISTENT_PROJECTION', `the camera target ${trackedId} is not a ${trackedKind}`);
  const diverged = camera.diverged;
  if (typeof diverged !== 'boolean')
    fail('INCONSISTENT_PROJECTION', 'camera.diverged must be a boolean');
  if (diverged !== (trackedId !== controlledId))
    fail('INCONSISTENT_PROJECTION', 'camera.diverged disagrees with the two entity ids');
  const reason = camera.divergenceReason;
  const focusSinceTick = camera.focusSinceTick;
  if (diverged) {
    if (reason !== 'FOCUS')
      fail(
        'INCONSISTENT_PROJECTION',
        `the camera follows ${trackedId} while ${controlledId} is controlled, so the reason must be FOCUS`,
      );
    if (
      typeof focusSinceTick !== 'number' ||
      !Number.isSafeInteger(focusSinceTick) ||
      focusSinceTick < 0
    )
      fail('INCONSISTENT_PROJECTION', 'a divergence needs the FOCUS tick');
    if (state.focusEntityId !== trackedId || state.focusSinceTick !== focusSinceTick)
      fail('INCONSISTENT_PROJECTION', 'the projection focus disagrees with the state focus');
  } else {
    if (reason !== null)
      fail('INCONSISTENT_PROJECTION', 'a camera on the controlled entity has no divergence reason');
    if (focusSinceTick !== null)
      fail('INCONSISTENT_PROJECTION', 'a camera on the controlled entity carries no FOCUS tick');
    if (state.focusEntityId !== null)
      fail('INCONSISTENT_PROJECTION', 'the state still records a FOCUS on another entity');
  }
  const entities = tickOf(projection.entities, 'projection.entities', 'INCONSISTENT_PROJECTION');
  if (entities !== vehicles.length + 1)
    fail('INCONSISTENT_PROJECTION', 'the entity count disagrees with the fleet list');

  return projection as unknown as FleetSwitchProjection;
}
