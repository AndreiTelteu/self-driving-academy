import { randomUnit } from '../sessions';
import { PERSISTENCE_LIMITS, PersistenceError } from './contracts';
import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  sha256Hex,
} from './canonical-json';
import { measureJsonBytes } from './records';

/**
 * Complete world snapshot for PBI 206.
 *
 * Docs/15 keeps the snapshot of the physical world and the game's own states separate from
 * progress saves. This module owns the snapshot document, not the storage envelope: it validates
 * every subsystem against one tick boundary, hashes the canonical form and restores it into an
 * explicit resume plan. `world-checkpoint.ts` owns capture timing, the single writer and the
 * durable commit, so the snapshot stays a pure, deterministic data contract.
 *
 * Coherence is structural, not a promise: the capture carries the tick of each subsystem and is
 * refused unless all of them are the tick that was read from the fixed-tick loop. The RNG is a
 * keyed stream cursor, not `Math.random`, so a restored world continues the exact same sequence.
 */

export const WORLD_SNAPSHOT_VERSION = '206-world-snapshot-v1' as const;
export const WORLD_RESUME_VERSION = '206-world-resume-v1' as const;
export const WORLD_SNAPSHOT_UNITS = 'SI' as const;

export const WORLD_SNAPSHOT_LIMITS = Object.freeze({
  maxVehicles: 128,
  maxControllers: 128,
  maxRides: 128,
  maxPassengers: 128,
  maxSegments: 256,
  maxOpportunities: 4096,
  maxSignals: 128,
  maxDispatchJobs: 256,
  maxLearningJobs: 256,
  maxObservations: 4096,
  maxDedupEvents: 4096,
  maxMemoryEntries: 64,
  maxIdCodeUnits: PERSISTENCE_LIMITS.maxIdCodeUnits,
  maxTextCodeUnits: PERSISTENCE_LIMITS.maxTextCodeUnits,
  /** Same body budget as every other local record; a larger snapshot is rejected, not truncated. */
  maxBodyBytes: PERSISTENCE_LIMITS.maxBodyBytes,
});

export const worldControlModes = ['MANUAL', 'LEARNING', 'AUTO'] as const;
export type WorldControlMode = (typeof worldControlModes)[number];

export const worldVehicleClasses = ['TAXI', 'CIVILIAN'] as const;
export type WorldVehicleClass = (typeof worldVehicleClasses)[number];

export const worldRideStates = [
  'REQUESTED',
  'ASSIGNED',
  'PICKUP',
  'ONBOARD',
  'DROPOFF',
  'COMPLETED',
] as const;
export type WorldRideStatus = (typeof worldRideStates)[number];

export const worldPassengerStates = ['WAITING', 'PICKED_UP', 'DELIVERED'] as const;
export type WorldPassengerStatus = (typeof worldPassengerStates)[number];

export const worldSegmentStatuses = ['OPEN', 'CLOSED', 'INCOMPLETE'] as const;
export type WorldSegmentStatus = (typeof worldSegmentStatuses)[number];

export const worldSignalPhases = ['GREEN', 'YELLOW', 'RED'] as const;
export type WorldSignalPhase = (typeof worldSignalPhases)[number];

export const worldOpportunityVerdicts = ['ALLOW', 'DENY', 'DEFER'] as const;
export type WorldOpportunityVerdict = (typeof worldOpportunityVerdicts)[number];

export const worldRngStreams = ['traffic', 'rideDemand', 'opportunities'] as const;
export type WorldRngStream = (typeof worldRngStreams)[number];

export const worldSnapshotRejectionCodes = [
  'INVALID_SNAPSHOT',
  'MISSING_FIELD',
  'UNKNOWN_FIELD',
  'TICK_NOT_BOUNDARY',
  'SUBSYSTEM_TICK_MISMATCH',
  'DUPLICATE_ENTITY',
  'DANGLING_REFERENCE',
  'NON_FINITE_NUMBER',
  'SNAPSHOT_TOO_LARGE',
  'INCOMPATIBLE_VERSION',
  'CHECKSUM_MISMATCH',
] as const;
export type WorldSnapshotRejectionCode = (typeof worldSnapshotRejectionCodes)[number];

export interface WorldSnapshotRejection {
  readonly code: WorldSnapshotRejectionCode;
  readonly message: string;
  readonly path: string;
}

export class WorldSnapshotError extends Error {
  readonly code: WorldSnapshotRejectionCode;
  readonly path: string;

  constructor(code: WorldSnapshotRejectionCode, message: string, path: string) {
    super(message);
    this.name = 'WorldSnapshotError';
    this.code = code;
    this.path = path;
  }
}

export interface WorldVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WorldQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface WorldProfileState {
  readonly profileId: string;
  readonly activeVersionId: string;
  readonly activationSequence: number;
}

export interface WorldVehicleState {
  /** Game entity identity, stable across reloads. */
  readonly entityId: string;
  /** Rapier body/handle at the capture tick; stored so entityId↔handle survives the reload. */
  readonly handle: number;
  readonly vehicleClass: WorldVehicleClass;
  readonly position: WorldVector3;
  readonly rotation: WorldQuaternion;
  readonly linearVelocity: WorldVector3;
  readonly angularVelocity: WorldVector3;
  readonly controlMode: WorldControlMode;
  readonly fsmState: string;
  readonly routeId: string;
  readonly routeNodeIndex: number;
  readonly routeProgress: number;
  readonly segmentId: string | null;
  readonly rideId: string | null;
  readonly passengerIds: readonly string[];
}

export interface WorldControllerState {
  readonly entityId: string;
  readonly fsmState: string;
  readonly fsmStateTick: number;
  readonly controlMode: WorldControlMode;
  readonly targetSpeed: number;
  readonly laneOffset: number;
  /** Numeric controller/FSM memory (integrators, timers); bounded and hashed like the rest. */
  readonly memory: Readonly<Record<string, number>>;
}

export interface WorldRideState {
  readonly rideId: string;
  readonly vehicleId: string;
  readonly passengerId: string;
  readonly state: WorldRideStatus;
  readonly pickupNodeId: string;
  readonly dropoffNodeId: string;
  readonly requestedTick: number;
  readonly acceptedTick: number | null;
}

export interface WorldPassengerState {
  readonly passengerId: string;
  readonly rideId: string | null;
  readonly state: WorldPassengerStatus;
  readonly waitingSinceTick: number;
  readonly patience: number;
}

export interface WorldSegmentState {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly controlMode: WorldControlMode;
  readonly status: WorldSegmentStatus;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly sampleCount: number;
}

export interface WorldOpportunityState {
  readonly opportunityKey: string;
  readonly evaluatedTick: number;
  readonly seed: number;
  readonly evaluated: boolean;
  readonly verdict: WorldOpportunityVerdict | null;
}

export interface WorldSignalState {
  readonly signalId: string;
  readonly phase: WorldSignalPhase;
  readonly remainingTicks: number;
  readonly cycleIndex: number;
}

export interface WorldDispatchJobState {
  readonly jobId: string;
  readonly vehicleId: string;
  readonly rideId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly state: 'PENDING';
  readonly requestedTick: number;
}

export interface WorldDispatchAcceptedState {
  readonly jobId: string;
  readonly acceptedTick: number;
  readonly rewardCredits: number;
}

export interface WorldDispatchState {
  readonly pending: readonly WorldDispatchJobState[];
  readonly acceptedResults: readonly WorldDispatchAcceptedState[];
}

export interface WorldLearningJobState {
  readonly jobId: string;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly state: 'PENDING' | 'COMPLETED';
  readonly resultKey: string | null;
}

export interface WorldLearningObservationState {
  readonly observationId: string;
  readonly segmentId: string;
  readonly kind: 'LEARNING';
  readonly state: 'COMPLETED';
  readonly resultKey: string;
}

export interface WorldLearningState {
  readonly learningEpoch: number;
  readonly pendingJobs: readonly WorldLearningJobState[];
  readonly completedObservations: readonly WorldLearningObservationState[];
  /** Results already accepted; reload never applies their reward again. */
  readonly acceptedResultKeys: readonly string[];
}

export interface WorldRngState {
  readonly seed: number;
  /** Next sample index of each keyed stream; the value is the cursor, not a mutable generator. */
  readonly streams: Readonly<Record<WorldRngStream, number>>;
}

export interface WorldDedupState {
  readonly lastEventSequence: number;
  readonly seenEventIds: readonly string[];
}

export interface WorldSubsystemTicks {
  readonly physics: number;
  readonly controllers: number;
  readonly rides: number;
  readonly passengers: number;
  readonly opportunities: number;
  readonly signals: number;
  readonly dispatch: number;
  readonly learning: number;
  readonly rng: number;
}

export type WorldTickBoundary = 'BOUNDARY' | 'IN_STEP';

export interface WorldCaptureInput {
  readonly tick: number;
  readonly tickBoundary: WorldTickBoundary;
  /** Ticks reported by every subsystem; all must equal `tick`. */
  readonly subsystemTicks: WorldSubsystemTicks;
  readonly worldEpoch: number;
  readonly profile: WorldProfileState;
  readonly vehicles: readonly WorldVehicleState[];
  readonly controllers: readonly WorldControllerState[];
  readonly rides: readonly WorldRideState[];
  readonly passengers: readonly WorldPassengerState[];
  readonly segments: readonly WorldSegmentState[];
  readonly opportunities: readonly WorldOpportunityState[];
  readonly signals: readonly WorldSignalState[];
  readonly dispatch: WorldDispatchState;
  readonly learning: WorldLearningState;
  readonly rng: WorldRngState;
  readonly dedup: WorldDedupState;
}

/** Validated snapshot payload. Every array is frozen and every object is plain data. */
export interface WorldSnapshotState {
  readonly snapshotVersion: typeof WORLD_SNAPSHOT_VERSION;
  readonly units: typeof WORLD_SNAPSHOT_UNITS;
  readonly tick: number;
  readonly worldEpoch: number;
  readonly profile: WorldProfileState;
  readonly vehicles: readonly WorldVehicleState[];
  readonly controllers: readonly WorldControllerState[];
  readonly rides: readonly WorldRideState[];
  readonly passengers: readonly WorldPassengerState[];
  readonly segments: readonly WorldSegmentState[];
  readonly opportunities: readonly WorldOpportunityState[];
  readonly signals: readonly WorldSignalState[];
  readonly dispatch: WorldDispatchState;
  readonly learning: WorldLearningState;
  readonly rng: WorldRngState;
  readonly dedup: WorldDedupState;
}

export interface WorldSnapshot extends WorldSnapshotState {
  readonly checksum: string;
}

export interface WorldSnapshotCaptureAccepted {
  readonly status: 'CAPTURED';
  readonly snapshot: WorldSnapshot;
  readonly body: Readonly<Record<string, unknown>>;
  readonly bytes: number;
  readonly checksum: string;
}

export interface WorldSnapshotCaptureRejected {
  readonly status: 'REJECTED';
  readonly rejection: WorldSnapshotRejection;
}

export type WorldSnapshotCaptureResult =
  WorldSnapshotCaptureAccepted | WorldSnapshotCaptureRejected;

export interface WorldSnapshotReadAccepted {
  readonly status: 'ACCEPTED';
  readonly snapshot: WorldSnapshot;
  readonly bytes: number;
  readonly checksum: string;
}

export interface WorldSnapshotReadRejected {
  readonly status: 'REJECTED';
  readonly rejection: WorldSnapshotRejection;
}

export type WorldSnapshotReadResult = WorldSnapshotReadAccepted | WorldSnapshotReadRejected;

export interface WorldResumeSegment {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly previousStatus: WorldSegmentStatus;
  readonly nextStatus: 'INCOMPLETE';
  readonly reason: 'RELOAD';
}

export interface WorldResumeVehicle {
  readonly vehicleId: string;
  readonly previousControlMode: WorldControlMode;
  readonly controlMode: 'AUTO';
  readonly inputReleased: true;
  readonly fsmState: string;
}

export type WorldResumeJobStatus = 'RELAUNCH' | 'INVALIDATED';
export type WorldResumeJobReason =
  'PROFILE_MISMATCH' | 'LEARNING_EPOCH_MISMATCH' | 'PROFILE_AND_EPOCH_MISMATCH';

export interface WorldResumeJob {
  readonly source: 'LEARNING' | 'DISPATCH';
  readonly jobId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly status: WorldResumeJobStatus;
  readonly reason: WorldResumeJobReason | null;
}

export interface WorldResumeObservation {
  readonly observationId: string;
  readonly segmentId: string;
  readonly idempotencyKey: string;
  readonly status: 'REPLAY';
  readonly replay: true;
  readonly alreadyRewarded: boolean;
}

/**
 * What a reload is allowed to do with the restored world. The session opens paused, no vehicle
 * keeps manual control, open manual segments become INCOMPLETE and only completed LEARNING
 * observations may be replayed, keyed so a repeat cannot reward twice.
 */
export interface WorldResumePlan {
  readonly version: typeof WORLD_RESUME_VERSION;
  readonly mode: 'PAUSED_AUTO';
  readonly paused: true;
  readonly auto: true;
  readonly inputReleased: true;
  readonly tick: number;
  readonly worldEpoch: number;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly segments: readonly WorldResumeSegment[];
  readonly vehicles: readonly WorldResumeVehicle[];
  readonly jobs: readonly WorldResumeJob[];
  readonly observations: readonly WorldResumeObservation[];
  readonly acceptedResultsPreserved: number;
  readonly rewardsReapplied: 0;
}

export interface WorldRestoreOptions {
  readonly currentProfileId?: string;
  readonly currentLearningEpoch?: number;
}

export interface WorldRestoreResult {
  readonly state: WorldSnapshotState;
  readonly resume: WorldResumePlan;
}

export interface WorldRngAdvance {
  readonly value: number;
  readonly rng: WorldRngState;
}

/* ------------------------------------------------------------- validation */

const STATUS_TOKEN = /^[A-Z][A-Z0-9_]*$/;
const CHECKSUM_HEX = /^[0-9a-f]{64}$/;
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const payloadFields = [
  'snapshotVersion',
  'units',
  'tick',
  'worldEpoch',
  'profile',
  'vehicles',
  'controllers',
  'rides',
  'passengers',
  'segments',
  'opportunities',
  'signals',
  'dispatch',
  'learning',
  'rng',
  'dedup',
] as const;

const subsystemTickFields = [
  'physics',
  'controllers',
  'rides',
  'passengers',
  'opportunities',
  'signals',
  'dispatch',
  'learning',
  'rng',
] as const;

function invalid(code: WorldSnapshotRejectionCode, message: string, path: string): never {
  throw new WorldSnapshotError(code, message, path);
}

function readObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid('INVALID_SNAPSHOT', 'Expected a plain object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid('INVALID_SNAPSHOT', 'Expected plain data, not a class instance', path);
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (RESERVED_KEYS.has(key)) invalid('INVALID_SNAPSHOT', `Reserved key: ${key}`, path);
    result[key] = (value as Record<string, unknown>)[key];
  }
  for (const key of Object.keys(result)) {
    if (!allowed.includes(key)) {
      invalid('UNKNOWN_FIELD', `Unknown field: ${key}`, `${path}.${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(result, key)) {
      invalid('MISSING_FIELD', `Missing field: ${key}`, `${path}.${key}`);
    }
  }
  return result;
}

function readArray<T>(
  value: unknown,
  path: string,
  maximum: number,
  decode: (entry: unknown, entryPath: string) => T,
): readonly T[] {
  if (!Array.isArray(value)) invalid('INVALID_SNAPSHOT', 'Expected an array', path);
  if (value.length > maximum) {
    invalid('SNAPSHOT_TOO_LARGE', `Expected at most ${maximum} entries`, path);
  }
  const entries: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index))
      invalid('INVALID_SNAPSHOT', 'Sparse arrays are unsupported', path);
    entries.push(decode(value[index], `${path}[${index}]`));
  }
  return Object.freeze(entries);
}

function readId(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > WORLD_SNAPSHOT_LIMITS.maxIdCodeUnits ||
    value.trim() !== value
  ) {
    invalid('INVALID_SNAPSHOT', 'Expected a bounded identity', path);
  }
  return value;
}

function readText(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > WORLD_SNAPSHOT_LIMITS.maxTextCodeUnits ||
    value.trim() !== value
  ) {
    invalid('INVALID_SNAPSHOT', 'Expected bounded text', path);
  }
  return value;
}

function readToken(value: unknown, path: string): string {
  if (typeof value !== 'string' || !STATUS_TOKEN.test(value)) {
    invalid('INVALID_SNAPSHOT', 'Expected an uppercase status token', path);
  }
  return value;
}

function readFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid('NON_FINITE_NUMBER', 'Expected a finite number', path);
  }
  return value;
}

function readCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid('INVALID_SNAPSHOT', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function readUnit(value: unknown, path: string): number {
  const number = readFinite(value, path);
  if (number < 0 || number > 1) invalid('INVALID_SNAPSHOT', 'Expected a unit value', path);
  return number;
}

function readUint32(value: unknown, path: string): number {
  const number = readCount(value, path);
  if (number > 0xffff_ffff) invalid('INVALID_SNAPSHOT', 'Expected a uint32', path);
  return number;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    invalid('INVALID_SNAPSHOT', `Expected one of ${allowed.join(', ')}`, path);
  }
  return value as T;
}

function readVector3(value: unknown, path: string): WorldVector3 {
  const data = readObject(value, path, ['x', 'y', 'z']);
  return Object.freeze({
    x: readFinite(data.x, `${path}.x`),
    y: readFinite(data.y, `${path}.y`),
    z: readFinite(data.z, `${path}.z`),
  });
}

function readQuaternion(value: unknown, path: string): WorldQuaternion {
  const data = readObject(value, path, ['x', 'y', 'z', 'w']);
  return Object.freeze({
    x: readFinite(data.x, `${path}.x`),
    y: readFinite(data.y, `${path}.y`),
    z: readFinite(data.z, `${path}.z`),
    w: readFinite(data.w, `${path}.w`),
  });
}

function readProfile(value: unknown, path: string): WorldProfileState {
  const data = readObject(value, path, ['profileId', 'activeVersionId', 'activationSequence']);
  return Object.freeze({
    profileId: readId(data.profileId, `${path}.profileId`),
    activeVersionId: readId(data.activeVersionId, `${path}.activeVersionId`),
    activationSequence: readCount(data.activationSequence, `${path}.activationSequence`),
  });
}

function readVehicle(value: unknown, path: string): WorldVehicleState {
  const data = readObject(value, path, [
    'entityId',
    'handle',
    'vehicleClass',
    'position',
    'rotation',
    'linearVelocity',
    'angularVelocity',
    'controlMode',
    'fsmState',
    'routeId',
    'routeNodeIndex',
    'routeProgress',
    'segmentId',
    'rideId',
    'passengerIds',
  ]);
  return Object.freeze({
    entityId: readId(data.entityId, `${path}.entityId`),
    handle: readCount(data.handle, `${path}.handle`),
    vehicleClass: readEnum(data.vehicleClass, worldVehicleClasses, `${path}.vehicleClass`),
    position: readVector3(data.position, `${path}.position`),
    rotation: readQuaternion(data.rotation, `${path}.rotation`),
    linearVelocity: readVector3(data.linearVelocity, `${path}.linearVelocity`),
    angularVelocity: readVector3(data.angularVelocity, `${path}.angularVelocity`),
    controlMode: readEnum(data.controlMode, worldControlModes, `${path}.controlMode`),
    fsmState: readToken(data.fsmState, `${path}.fsmState`),
    routeId: readId(data.routeId, `${path}.routeId`),
    routeNodeIndex: readCount(data.routeNodeIndex, `${path}.routeNodeIndex`),
    routeProgress: readUnit(data.routeProgress, `${path}.routeProgress`),
    segmentId: data.segmentId === null ? null : readId(data.segmentId, `${path}.segmentId`),
    rideId: data.rideId === null ? null : readId(data.rideId, `${path}.rideId`),
    passengerIds: readArray(data.passengerIds, `${path}.passengerIds`, 16, (entry, entryPath) =>
      readId(entry, entryPath),
    ),
  });
}

function readController(value: unknown, path: string): WorldControllerState {
  const data = readObject(value, path, [
    'entityId',
    'fsmState',
    'fsmStateTick',
    'controlMode',
    'targetSpeed',
    'laneOffset',
    'memory',
  ]);
  if (typeof data.memory !== 'object' || data.memory === null || Array.isArray(data.memory)) {
    invalid('INVALID_SNAPSHOT', 'Expected a plain object', `${path}.memory`);
  }
  const memoryPrototype: unknown = Object.getPrototypeOf(data.memory);
  if (memoryPrototype !== Object.prototype && memoryPrototype !== null) {
    invalid('INVALID_SNAPSHOT', 'Expected plain data, not a class instance', `${path}.memory`);
  }
  const memory: Record<string, number> = {};
  const keys = Object.keys(data.memory);
  if (keys.length > WORLD_SNAPSHOT_LIMITS.maxMemoryEntries) {
    invalid('SNAPSHOT_TOO_LARGE', 'Controller memory has too many entries', `${path}.memory`);
  }
  for (const key of keys) {
    if (!/^[a-z][a-z0-9_]*$/.test(key) || RESERVED_KEYS.has(key)) {
      invalid('INVALID_SNAPSHOT', `Invalid memory key: ${key}`, `${path}.memory`);
    }
    memory[key] = readFinite(
      (data.memory as Record<string, unknown>)[key],
      `${path}.memory.${key}`,
    );
  }
  return Object.freeze({
    entityId: readId(data.entityId, `${path}.entityId`),
    fsmState: readToken(data.fsmState, `${path}.fsmState`),
    fsmStateTick: readCount(data.fsmStateTick, `${path}.fsmStateTick`),
    controlMode: readEnum(data.controlMode, worldControlModes, `${path}.controlMode`),
    targetSpeed: readFinite(data.targetSpeed, `${path}.targetSpeed`),
    laneOffset: readFinite(data.laneOffset, `${path}.laneOffset`),
    memory: Object.freeze(memory),
  });
}

function readRide(value: unknown, path: string): WorldRideState {
  const data = readObject(value, path, [
    'rideId',
    'vehicleId',
    'passengerId',
    'state',
    'pickupNodeId',
    'dropoffNodeId',
    'requestedTick',
    'acceptedTick',
  ]);
  return Object.freeze({
    rideId: readId(data.rideId, `${path}.rideId`),
    vehicleId: readId(data.vehicleId, `${path}.vehicleId`),
    passengerId: readId(data.passengerId, `${path}.passengerId`),
    state: readEnum(data.state, worldRideStates, `${path}.state`),
    pickupNodeId: readId(data.pickupNodeId, `${path}.pickupNodeId`),
    dropoffNodeId: readId(data.dropoffNodeId, `${path}.dropoffNodeId`),
    requestedTick: readCount(data.requestedTick, `${path}.requestedTick`),
    acceptedTick:
      data.acceptedTick === null ? null : readCount(data.acceptedTick, `${path}.acceptedTick`),
  });
}

function readPassenger(value: unknown, path: string): WorldPassengerState {
  const data = readObject(value, path, [
    'passengerId',
    'rideId',
    'state',
    'waitingSinceTick',
    'patience',
  ]);
  return Object.freeze({
    passengerId: readId(data.passengerId, `${path}.passengerId`),
    rideId: data.rideId === null ? null : readId(data.rideId, `${path}.rideId`),
    state: readEnum(data.state, worldPassengerStates, `${path}.state`),
    waitingSinceTick: readCount(data.waitingSinceTick, `${path}.waitingSinceTick`),
    patience: readFinite(data.patience, `${path}.patience`),
  });
}

function readSegment(value: unknown, path: string): WorldSegmentState {
  const data = readObject(value, path, [
    'segmentId',
    'vehicleId',
    'controlMode',
    'status',
    'startTick',
    'endTick',
    'sampleCount',
  ]);
  return Object.freeze({
    segmentId: readId(data.segmentId, `${path}.segmentId`),
    vehicleId: readId(data.vehicleId, `${path}.vehicleId`),
    controlMode: readEnum(data.controlMode, worldControlModes, `${path}.controlMode`),
    status: readEnum(data.status, worldSegmentStatuses, `${path}.status`),
    startTick: readCount(data.startTick, `${path}.startTick`),
    endTick: data.endTick === null ? null : readCount(data.endTick, `${path}.endTick`),
    sampleCount: readCount(data.sampleCount, `${path}.sampleCount`),
  });
}

function readOpportunity(value: unknown, path: string): WorldOpportunityState {
  const data = readObject(value, path, [
    'opportunityKey',
    'evaluatedTick',
    'seed',
    'evaluated',
    'verdict',
  ]);
  if (typeof data.evaluated !== 'boolean') {
    invalid('INVALID_SNAPSHOT', 'Expected a boolean', `${path}.evaluated`);
  }
  const verdict =
    data.verdict === null
      ? null
      : readEnum(data.verdict, worldOpportunityVerdicts, `${path}.verdict`);
  if (data.evaluated && verdict === null) {
    invalid('INVALID_SNAPSHOT', 'An evaluated opportunity needs a verdict', `${path}.verdict`);
  }
  return Object.freeze({
    opportunityKey: readId(data.opportunityKey, `${path}.opportunityKey`),
    evaluatedTick: readCount(data.evaluatedTick, `${path}.evaluatedTick`),
    seed: readUint32(data.seed, `${path}.seed`),
    evaluated: data.evaluated,
    verdict,
  });
}

function readSignal(value: unknown, path: string): WorldSignalState {
  const data = readObject(value, path, ['signalId', 'phase', 'remainingTicks', 'cycleIndex']);
  return Object.freeze({
    signalId: readId(data.signalId, `${path}.signalId`),
    phase: readEnum(data.phase, worldSignalPhases, `${path}.phase`),
    remainingTicks: readCount(data.remainingTicks, `${path}.remainingTicks`),
    cycleIndex: readCount(data.cycleIndex, `${path}.cycleIndex`),
  });
}

function readDispatchJob(value: unknown, path: string): WorldDispatchJobState {
  const data = readObject(value, path, [
    'jobId',
    'vehicleId',
    'rideId',
    'profileId',
    'learningEpoch',
    'state',
    'requestedTick',
  ]);
  if (data.state !== 'PENDING') {
    invalid('INVALID_SNAPSHOT', 'Only pending dispatch jobs are stored here', `${path}.state`);
  }
  return Object.freeze({
    jobId: readId(data.jobId, `${path}.jobId`),
    vehicleId: readId(data.vehicleId, `${path}.vehicleId`),
    rideId: readId(data.rideId, `${path}.rideId`),
    profileId: readId(data.profileId, `${path}.profileId`),
    learningEpoch: readCount(data.learningEpoch, `${path}.learningEpoch`),
    state: 'PENDING' as const,
    requestedTick: readCount(data.requestedTick, `${path}.requestedTick`),
  });
}

function readDispatch(value: unknown, path: string): WorldDispatchState {
  const data = readObject(value, path, ['pending', 'acceptedResults']);
  const pending = readArray(
    data.pending,
    `${path}.pending`,
    WORLD_SNAPSHOT_LIMITS.maxDispatchJobs,
    readDispatchJob,
  );
  const acceptedResults = readArray(
    data.acceptedResults,
    `${path}.acceptedResults`,
    WORLD_SNAPSHOT_LIMITS.maxDispatchJobs,
    (entry, entryPath) => {
      const accepted = readObject(entry, entryPath, ['jobId', 'acceptedTick', 'rewardCredits']);
      return Object.freeze({
        jobId: readId(accepted.jobId, `${entryPath}.jobId`),
        acceptedTick: readCount(accepted.acceptedTick, `${entryPath}.acceptedTick`),
        rewardCredits: readFinite(accepted.rewardCredits, `${entryPath}.rewardCredits`),
      });
    },
  );
  return Object.freeze({ pending, acceptedResults });
}

function readLearningJob(value: unknown, path: string): WorldLearningJobState {
  const data = readObject(value, path, [
    'jobId',
    'segmentId',
    'vehicleId',
    'profileId',
    'learningEpoch',
    'state',
    'resultKey',
  ]);
  const state = readEnum(data.state, ['PENDING', 'COMPLETED'] as const, `${path}.state`);
  const resultKey = data.resultKey === null ? null : readText(data.resultKey, `${path}.resultKey`);
  if (state === 'PENDING' && resultKey !== null) {
    invalid('INVALID_SNAPSHOT', 'A pending job has no accepted result', `${path}.resultKey`);
  }
  if (state === 'COMPLETED' && resultKey === null) {
    invalid('INVALID_SNAPSHOT', 'A completed job needs its result key', `${path}.resultKey`);
  }
  return Object.freeze({
    jobId: readId(data.jobId, `${path}.jobId`),
    segmentId: readId(data.segmentId, `${path}.segmentId`),
    vehicleId: readId(data.vehicleId, `${path}.vehicleId`),
    profileId: readId(data.profileId, `${path}.profileId`),
    learningEpoch: readCount(data.learningEpoch, `${path}.learningEpoch`),
    state,
    resultKey,
  });
}

function readObservation(value: unknown, path: string): WorldLearningObservationState {
  const data = readObject(value, path, [
    'observationId',
    'segmentId',
    'kind',
    'state',
    'resultKey',
  ]);
  if (data.kind !== 'LEARNING' || data.state !== 'COMPLETED') {
    invalid('INVALID_SNAPSHOT', 'Only completed LEARNING observations may be replayed', path);
  }
  return Object.freeze({
    observationId: readId(data.observationId, `${path}.observationId`),
    segmentId: readId(data.segmentId, `${path}.segmentId`),
    kind: 'LEARNING' as const,
    state: 'COMPLETED' as const,
    resultKey: readText(data.resultKey, `${path}.resultKey`),
  });
}

function readLearning(value: unknown, path: string): WorldLearningState {
  const data = readObject(value, path, [
    'learningEpoch',
    'pendingJobs',
    'completedObservations',
    'acceptedResultKeys',
  ]);
  return Object.freeze({
    learningEpoch: readCount(data.learningEpoch, `${path}.learningEpoch`),
    pendingJobs: readArray(
      data.pendingJobs,
      `${path}.pendingJobs`,
      WORLD_SNAPSHOT_LIMITS.maxLearningJobs,
      readLearningJob,
    ),
    completedObservations: readArray(
      data.completedObservations,
      `${path}.completedObservations`,
      WORLD_SNAPSHOT_LIMITS.maxObservations,
      readObservation,
    ),
    acceptedResultKeys: readArray(
      data.acceptedResultKeys,
      `${path}.acceptedResultKeys`,
      WORLD_SNAPSHOT_LIMITS.maxObservations,
      (entry, entryPath) => readText(entry, entryPath),
    ),
  });
}

function readRng(value: unknown, path: string): WorldRngState {
  const data = readObject(value, path, ['seed', 'streams']);
  const streamsData = readObject(data.streams, `${path}.streams`, worldRngStreams);
  const streams = {} as Record<WorldRngStream, number>;
  for (const stream of worldRngStreams) {
    streams[stream] = readCount(streamsData[stream], `${path}.streams.${stream}`);
  }
  return Object.freeze({
    seed: readUint32(data.seed, `${path}.seed`),
    streams: Object.freeze(streams),
  });
}

function readDedup(value: unknown, path: string): WorldDedupState {
  const data = readObject(value, path, ['lastEventSequence', 'seenEventIds']);
  const seenEventIds = readArray(
    data.seenEventIds,
    `${path}.seenEventIds`,
    WORLD_SNAPSHOT_LIMITS.maxDedupEvents,
    (entry, entryPath) => readId(entry, entryPath),
  );
  assertUnique(seenEventIds, `${path}.seenEventIds`);
  return Object.freeze({
    lastEventSequence: readCount(data.lastEventSequence, `${path}.lastEventSequence`),
    seenEventIds,
  });
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    invalid('DUPLICATE_ENTITY', 'Duplicate identities are not allowed', path);
  }
}

function readSubsystemTicks(value: unknown, path: string, tick: number): WorldSubsystemTicks {
  const data = readObject(value, path, subsystemTickFields);
  const ticks: { -readonly [Field in keyof WorldSubsystemTicks]: number } = {
    physics: 0,
    controllers: 0,
    rides: 0,
    passengers: 0,
    opportunities: 0,
    signals: 0,
    dispatch: 0,
    learning: 0,
    rng: 0,
  };
  for (const field of subsystemTickFields) {
    const read = readCount(data[field], `${path}.${field}`);
    if (read !== tick) {
      invalid(
        'SUBSYSTEM_TICK_MISMATCH',
        `${field} is at tick ${read}, the capture is at ${tick}`,
        `${path}.${field}`,
      );
    }
    ticks[field] = read;
  }
  return Object.freeze(ticks);
}

function normalizeState(data: Record<string, unknown>): WorldSnapshotState {
  const snapshotVersion = data.snapshotVersion;
  if (snapshotVersion !== WORLD_SNAPSHOT_VERSION) {
    invalid(
      'INCOMPATIBLE_VERSION',
      `Expected snapshot version ${WORLD_SNAPSHOT_VERSION}`,
      'snapshot.snapshotVersion',
    );
  }
  if (data.units !== WORLD_SNAPSHOT_UNITS) {
    invalid('INVALID_SNAPSHOT', 'Only SI units are stored', 'snapshot.units');
  }
  const tick = readCount(data.tick, 'snapshot.tick');
  const worldEpoch = readCount(data.worldEpoch, 'snapshot.worldEpoch');
  const profile = readProfile(data.profile, 'snapshot.profile');
  const vehicles = readArray(
    data.vehicles,
    'snapshot.vehicles',
    WORLD_SNAPSHOT_LIMITS.maxVehicles,
    readVehicle,
  );
  const controllers = readArray(
    data.controllers,
    'snapshot.controllers',
    WORLD_SNAPSHOT_LIMITS.maxControllers,
    readController,
  );
  const rides = readArray(data.rides, 'snapshot.rides', WORLD_SNAPSHOT_LIMITS.maxRides, readRide);
  const passengers = readArray(
    data.passengers,
    'snapshot.passengers',
    WORLD_SNAPSHOT_LIMITS.maxPassengers,
    readPassenger,
  );
  const segments = readArray(
    data.segments,
    'snapshot.segments',
    WORLD_SNAPSHOT_LIMITS.maxSegments,
    readSegment,
  );
  const opportunities = readArray(
    data.opportunities,
    'snapshot.opportunities',
    WORLD_SNAPSHOT_LIMITS.maxOpportunities,
    readOpportunity,
  );
  const signals = readArray(
    data.signals,
    'snapshot.signals',
    WORLD_SNAPSHOT_LIMITS.maxSignals,
    readSignal,
  );
  const dispatch = readDispatch(data.dispatch, 'snapshot.dispatch');
  const learning = readLearning(data.learning, 'snapshot.learning');
  const rng = readRng(data.rng, 'snapshot.rng');
  const dedup = readDedup(data.dedup, 'snapshot.dedup');

  assertUnique(
    vehicles.map((entry) => entry.entityId),
    'snapshot.vehicles.entityId',
  );
  assertUnique(
    vehicles.map((entry) => String(entry.handle)),
    'snapshot.vehicles.handle',
  );
  assertUnique(
    controllers.map((entry) => entry.entityId),
    'snapshot.controllers.entityId',
  );
  assertUnique(
    rides.map((entry) => entry.rideId),
    'snapshot.rides.rideId',
  );
  assertUnique(
    passengers.map((entry) => entry.passengerId),
    'snapshot.passengers.passengerId',
  );
  assertUnique(
    segments.map((entry) => entry.segmentId),
    'snapshot.segments.segmentId',
  );
  assertUnique(
    opportunities.map((entry) => entry.opportunityKey),
    'snapshot.opportunities.opportunityKey',
  );
  assertUnique(
    signals.map((entry) => entry.signalId),
    'snapshot.signals.signalId',
  );
  assertUnique(
    dispatch.pending.map((entry) => entry.jobId),
    'snapshot.dispatch.pending.jobId',
  );
  assertUnique(
    dispatch.acceptedResults.map((entry) => entry.jobId),
    'snapshot.dispatch.acceptedResults.jobId',
  );
  assertUnique(
    learning.pendingJobs.map((entry) => entry.jobId),
    'snapshot.learning.pendingJobs.jobId',
  );
  assertUnique(
    learning.completedObservations.map((entry) => entry.observationId),
    'snapshot.learning.completedObservations.observationId',
  );
  assertUnique(learning.acceptedResultKeys, 'snapshot.learning.acceptedResultKeys');

  const vehicleIds = new Set(vehicles.map((entry) => entry.entityId));
  const rideIds = new Set(rides.map((entry) => entry.rideId));
  const passengerIds = new Set(passengers.map((entry) => entry.passengerId));
  const segmentIds = new Set(segments.map((entry) => entry.segmentId));
  const controllerIds = new Set(controllers.map((entry) => entry.entityId));
  const acceptedJobIds = new Set(dispatch.acceptedResults.map((entry) => entry.jobId));

  for (const vehicle of vehicles) {
    if (vehicle.segmentId !== null && !segmentIds.has(vehicle.segmentId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Vehicle ${vehicle.entityId} names an unknown segment`,
        'snapshot.vehicles.segmentId',
      );
    }
    if (vehicle.rideId !== null && !rideIds.has(vehicle.rideId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Vehicle ${vehicle.entityId} names an unknown ride`,
        'snapshot.vehicles.rideId',
      );
    }
    if (vehicle.rideId === null && vehicle.passengerIds.length > 0) {
      invalid(
        'INVALID_SNAPSHOT',
        'A vehicle without a ride cannot carry passengers',
        'snapshot.vehicles.passengerIds',
      );
    }
    for (const passengerId of vehicle.passengerIds) {
      if (!passengerIds.has(passengerId)) {
        invalid(
          'DANGLING_REFERENCE',
          `Unknown passenger ${passengerId}`,
          'snapshot.vehicles.passengerIds',
        );
      }
    }
    if (!controllerIds.has(vehicle.entityId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Vehicle ${vehicle.entityId} has no controller state`,
        'snapshot.controllers',
      );
    }
  }
  for (const controller of controllers) {
    if (!vehicleIds.has(controller.entityId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Controller ${controller.entityId} has no vehicle`,
        'snapshot.controllers.entityId',
      );
    }
    if (controller.fsmStateTick > tick) {
      invalid(
        'INVALID_SNAPSHOT',
        'A controller state cannot come from a future tick',
        'snapshot.controllers.fsmStateTick',
      );
    }
  }
  for (const segment of segments) {
    if (!vehicleIds.has(segment.vehicleId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Segment ${segment.segmentId} names an unknown vehicle`,
        'snapshot.segments.vehicleId',
      );
    }
    if (segment.startTick > tick || (segment.endTick !== null && segment.endTick > tick)) {
      invalid(
        'INVALID_SNAPSHOT',
        'A segment cannot end after the capture tick',
        'snapshot.segments',
      );
    }
    if (segment.status === 'OPEN' && segment.endTick !== null) {
      invalid('INVALID_SNAPSHOT', 'An open segment has no end tick', 'snapshot.segments.endTick');
    }
    if (segment.status !== 'OPEN' && segment.endTick === null) {
      invalid(
        'INVALID_SNAPSHOT',
        'A finished segment needs its end tick',
        'snapshot.segments.endTick',
      );
    }
  }
  for (const ride of rides) {
    if (!vehicleIds.has(ride.vehicleId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Ride ${ride.rideId} names an unknown vehicle`,
        'snapshot.rides.vehicleId',
      );
    }
    if (!passengerIds.has(ride.passengerId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Ride ${ride.rideId} names an unknown passenger`,
        'snapshot.rides.passengerId',
      );
    }
    if (ride.requestedTick > tick || (ride.acceptedTick !== null && ride.acceptedTick > tick)) {
      invalid('INVALID_SNAPSHOT', 'A ride cannot come from a future tick', 'snapshot.rides');
    }
  }
  for (const passenger of passengers) {
    if (passenger.rideId !== null && !rideIds.has(passenger.rideId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Passenger ${passenger.passengerId} names an unknown ride`,
        'snapshot.passengers.rideId',
      );
    }
    if (passenger.waitingSinceTick > tick) {
      invalid(
        'INVALID_SNAPSHOT',
        'A passenger cannot wait since a future tick',
        'snapshot.passengers.waitingSinceTick',
      );
    }
  }
  for (const opportunity of opportunities) {
    if (opportunity.evaluated && opportunity.evaluatedTick > tick) {
      invalid(
        'INVALID_SNAPSHOT',
        'An opportunity cannot be evaluated in the future',
        'snapshot.opportunities.evaluatedTick',
      );
    }
  }
  for (const job of dispatch.pending) {
    if (job.requestedTick > tick) {
      invalid('INVALID_SNAPSHOT', 'A job cannot be requested in the future', 'snapshot.dispatch');
    }
    if (!vehicleIds.has(job.vehicleId) || !rideIds.has(job.rideId)) {
      invalid(
        'DANGLING_REFERENCE',
        `Dispatch job ${job.jobId} names an unknown vehicle or ride`,
        'snapshot.dispatch.pending',
      );
    }
    if (acceptedJobIds.has(job.jobId)) {
      invalid(
        'INVALID_SNAPSHOT',
        `Dispatch job ${job.jobId} is both pending and accepted`,
        'snapshot.dispatch',
      );
    }
  }
  for (const accepted of dispatch.acceptedResults) {
    if (accepted.acceptedTick > tick) {
      invalid(
        'INVALID_SNAPSHOT',
        'An accepted result cannot come from a future tick',
        'snapshot.dispatch.acceptedResults',
      );
    }
  }
  for (const job of learning.pendingJobs) {
    if (job.state !== 'PENDING') {
      invalid(
        'INVALID_SNAPSHOT',
        'Only pending learning jobs are stored here',
        'snapshot.learning',
      );
    }
  }

  return Object.freeze({
    snapshotVersion: WORLD_SNAPSHOT_VERSION,
    units: WORLD_SNAPSHOT_UNITS,
    tick,
    worldEpoch,
    profile,
    vehicles,
    controllers,
    rides,
    passengers,
    segments,
    opportunities,
    signals,
    dispatch,
    learning,
    rng,
    dedup,
  });
}

/* ----------------------------------------------------------- checksum */

function snapshotPayload(state: WorldSnapshotState): Record<string, unknown> {
  return {
    snapshotVersion: state.snapshotVersion,
    units: state.units,
    tick: state.tick,
    worldEpoch: state.worldEpoch,
    profile: state.profile,
    vehicles: state.vehicles,
    controllers: state.controllers,
    rides: state.rides,
    passengers: state.passengers,
    segments: state.segments,
    opportunities: state.opportunities,
    signals: state.signals,
    dispatch: state.dispatch,
    learning: state.learning,
    rng: state.rng,
    dedup: state.dedup,
  };
}

/**
 * The `SHA-256` checksum of the snapshot payload, over the same `SDA-CJSON-1` canonical form as
 * the savefile (Docs/29). The checksum field itself is never part of the hashed payload.
 */
export function computeWorldSnapshotChecksum(state: WorldSnapshotState | WorldSnapshot): string {
  const canonical = canonicalizeJson(snapshotPayload(state), { maxDepth: 24 });
  if (canonical.status === 'REJECTED') {
    throw new WorldSnapshotError(
      canonical.rejection.code === 'NON_FINITE_NUMBER' ? 'NON_FINITE_NUMBER' : 'INVALID_SNAPSHOT',
      canonical.rejection.message,
      canonical.rejection.path,
    );
  }
  return sha256Hex(canonical.text);
}

function rejected(error: unknown): WorldSnapshotCaptureRejected {
  if (error instanceof WorldSnapshotError) {
    return Object.freeze({
      status: 'REJECTED' as const,
      rejection: Object.freeze({
        code: error.code,
        message: error.message,
        path: error.path,
      }),
    });
  }
  if (error instanceof PersistenceError) {
    // The shared body writer enforces the same byte budget and a global entry budget; both are
    // size limits of the snapshot, not a malformed document.
    const sizeLimit =
      error.code === 'BODY_TOO_LARGE' ||
      (error.code === 'BODY_INVALID' && /too many entries|nested too deeply/.test(error.message));
    return Object.freeze({
      status: 'REJECTED' as const,
      rejection: Object.freeze({
        code: sizeLimit ? ('SNAPSHOT_TOO_LARGE' as const) : ('INVALID_SNAPSHOT' as const),
        message: error.message,
        path: error.path ?? 'snapshot',
      }),
    });
  }
  const message = error instanceof Error ? error.message : 'The snapshot could not be captured';
  return Object.freeze({
    status: 'REJECTED' as const,
    rejection: Object.freeze({
      code: 'INVALID_SNAPSHOT' as const,
      message,
      path: 'snapshot',
    }),
  });
}

/**
 * Captures one snapshot. The input is copied field by field, validated and frozen, so the caller
 * can mutate its live world immediately afterwards; nothing here reads the world again.
 */
export function captureWorldSnapshot(input: WorldCaptureInput): WorldSnapshotCaptureResult {
  try {
    if (input.tickBoundary !== 'BOUNDARY') {
      invalid(
        'TICK_NOT_BOUNDARY',
        'A checkpoint may only be captured on a tick boundary',
        'snapshot.tickBoundary',
      );
    }
    const tick = readCount(input.tick, 'snapshot.tick');
    const worldEpoch = readCount(input.worldEpoch, 'snapshot.worldEpoch');
    readSubsystemTicks(input.subsystemTicks, 'snapshot.subsystemTicks', tick);
    const data: Record<string, unknown> = {
      snapshotVersion: WORLD_SNAPSHOT_VERSION,
      units: WORLD_SNAPSHOT_UNITS,
      tick,
      worldEpoch,
      profile: input.profile,
      vehicles: input.vehicles,
      controllers: input.controllers,
      rides: input.rides,
      passengers: input.passengers,
      segments: input.segments,
      opportunities: input.opportunities,
      signals: input.signals,
      dispatch: input.dispatch,
      learning: input.learning,
      rng: input.rng,
      dedup: input.dedup,
    };
    const state = normalizeState(data);
    const checksum = computeWorldSnapshotChecksum(state);
    const body: Readonly<Record<string, unknown>> = Object.freeze({ ...state, checksum });
    const bytes = measureJsonBytes(body, 'checkpoint.body');
    if (bytes > WORLD_SNAPSHOT_LIMITS.maxBodyBytes) {
      invalid(
        'SNAPSHOT_TOO_LARGE',
        `The snapshot is ${bytes} bytes, above the ${WORLD_SNAPSHOT_LIMITS.maxBodyBytes} byte budget`,
        'snapshot',
      );
    }
    const snapshot: WorldSnapshot = Object.freeze({ ...state, checksum });
    return Object.freeze({
      status: 'CAPTURED' as const,
      snapshot,
      body,
      bytes,
      checksum,
    });
  } catch (error) {
    return rejected(error);
  }
}

/**
 * Reads and verifies a stored snapshot. The checksum is checked before anything is used, and every
 * reference is resolved against the data that is really stored, not against live objects.
 */
export function readWorldSnapshot(value: unknown): WorldSnapshotReadResult {
  try {
    const data = readObject(value, 'snapshot', [...payloadFields, 'checksum']);
    const checksum = data.checksum;
    if (typeof checksum !== 'string' || !CHECKSUM_HEX.test(checksum)) {
      invalid('CHECKSUM_MISMATCH', 'Expected a lowercase SHA-256 checksum', 'snapshot.checksum');
    }
    const payload: Record<string, unknown> = {};
    for (const field of payloadFields) payload[field] = data[field];
    const state = normalizeState(payload);
    const computed = computeWorldSnapshotChecksum(state);
    if (computed !== checksum) {
      invalid(
        'CHECKSUM_MISMATCH',
        'The stored snapshot does not match its checksum',
        'snapshot.checksum',
      );
    }
    const snapshot: WorldSnapshot = Object.freeze({ ...state, checksum });
    const bytes = measureJsonBytes(snapshot, 'snapshot');
    return Object.freeze({
      status: 'ACCEPTED' as const,
      snapshot,
      bytes,
      checksum,
    });
  } catch (error) {
    const failure = rejected(error);
    return Object.freeze({ status: 'REJECTED' as const, rejection: failure.rejection });
  }
}

function snapshotStateOf(snapshot: WorldSnapshot): WorldSnapshotState {
  return Object.freeze({
    snapshotVersion: snapshot.snapshotVersion,
    units: snapshot.units,
    tick: snapshot.tick,
    worldEpoch: snapshot.worldEpoch,
    profile: snapshot.profile,
    vehicles: snapshot.vehicles,
    controllers: snapshot.controllers,
    rides: snapshot.rides,
    passengers: snapshot.passengers,
    segments: snapshot.segments,
    opportunities: snapshot.opportunities,
    signals: snapshot.signals,
    dispatch: snapshot.dispatch,
    learning: snapshot.learning,
    rng: snapshot.rng,
    dedup: snapshot.dedup,
  });
}

function resumeReason(
  job: { readonly profileId: string; readonly learningEpoch: number },
  profileId: string,
  learningEpoch: number,
): WorldResumeJobReason | null {
  const profileMismatch = job.profileId !== profileId;
  const epochMismatch = job.learningEpoch !== learningEpoch;
  if (profileMismatch && epochMismatch) return 'PROFILE_AND_EPOCH_MISMATCH';
  if (profileMismatch) return 'PROFILE_MISMATCH';
  if (epochMismatch) return 'LEARNING_EPOCH_MISMATCH';
  return null;
}

/**
 * Restores the snapshot into a resume plan. Nothing is guessed: open segments are named with the
 * exact reason they become incomplete, every pending job is relaunched only when it still matches
 * the active profile and learning epoch, and accepted results are counted as preserved.
 */
export function restoreWorldState(
  snapshot: WorldSnapshot,
  options: WorldRestoreOptions = {},
): WorldRestoreResult {
  const profileId = options.currentProfileId ?? snapshot.profile.profileId;
  const learningEpoch = options.currentLearningEpoch ?? snapshot.learning.learningEpoch;
  const segments: WorldResumeSegment[] = snapshot.segments
    .filter((segment) => segment.status === 'OPEN')
    .map((segment) =>
      Object.freeze({
        segmentId: segment.segmentId,
        vehicleId: segment.vehicleId,
        previousStatus: segment.status,
        nextStatus: 'INCOMPLETE' as const,
        reason: 'RELOAD' as const,
      }),
    );
  const vehicles: WorldResumeVehicle[] = snapshot.vehicles.map((vehicle) =>
    Object.freeze({
      vehicleId: vehicle.entityId,
      previousControlMode: vehicle.controlMode,
      controlMode: 'AUTO' as const,
      inputReleased: true as const,
      fsmState: vehicle.fsmState,
    }),
  );
  const jobs: WorldResumeJob[] = [
    ...snapshot.learning.pendingJobs.map((job) => {
      const reason = resumeReason(job, profileId, learningEpoch);
      return Object.freeze({
        source: 'LEARNING' as const,
        jobId: job.jobId,
        profileId: job.profileId,
        learningEpoch: job.learningEpoch,
        status: reason === null ? ('RELAUNCH' as const) : ('INVALIDATED' as const),
        reason,
      });
    }),
    ...snapshot.dispatch.pending.map((job) => {
      const reason = resumeReason(job, profileId, learningEpoch);
      return Object.freeze({
        source: 'DISPATCH' as const,
        jobId: job.jobId,
        profileId: job.profileId,
        learningEpoch: job.learningEpoch,
        status: reason === null ? ('RELAUNCH' as const) : ('INVALIDATED' as const),
        reason,
      });
    }),
  ];
  const observations: WorldResumeObservation[] = snapshot.learning.completedObservations.map(
    (observation) =>
      Object.freeze({
        observationId: observation.observationId,
        segmentId: observation.segmentId,
        idempotencyKey: `${observation.segmentId}:${observation.observationId}`,
        status: 'REPLAY' as const,
        replay: true as const,
        alreadyRewarded: snapshot.learning.acceptedResultKeys.includes(observation.resultKey),
      }),
  );
  const resume: WorldResumePlan = Object.freeze({
    version: WORLD_RESUME_VERSION,
    mode: 'PAUSED_AUTO',
    paused: true,
    auto: true,
    inputReleased: true,
    tick: snapshot.tick,
    worldEpoch: snapshot.worldEpoch,
    profileId,
    learningEpoch,
    segments: Object.freeze(segments),
    vehicles: Object.freeze(vehicles),
    jobs: Object.freeze(jobs),
    observations: Object.freeze(observations),
    acceptedResultsPreserved:
      snapshot.dispatch.acceptedResults.length + snapshot.learning.acceptedResultKeys.length,
    rewardsReapplied: 0,
  });
  return Object.freeze({ state: snapshotStateOf(snapshot), resume });
}

/**
 * Advances one keyed RNG stream and returns the value together with the next cursor. The cursor is
 * part of the checkpoint, so a restored world sees exactly the values the original would have seen.
 */
export function advanceWorldRng(rng: WorldRngState, stream: WorldRngStream): WorldRngAdvance {
  const index = rng.streams[stream];
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new WorldSnapshotError(
      'INVALID_SNAPSHOT',
      'The RNG stream cursor must be a nonnegative safe integer',
      `snapshot.rng.streams.${stream}`,
    );
  }
  const value = randomUnit(rng.seed, `world:${stream}`, index);
  const streams = { ...rng.streams, [stream]: index + 1 };
  return Object.freeze({
    value,
    rng: Object.freeze({ seed: rng.seed, streams: Object.freeze(streams) }),
  });
}

/** Exposed so a reader can name the canonicalization it compares against. */
export const WORLD_SNAPSHOT_INTEGRITY = Object.freeze({
  algorithm: CHECKSUM_ALGORITHM,
  canonicalization: CANONICALIZATION_VERSION,
});
