import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  readWorldSnapshot,
  sha256Hex,
} from '../persistence';
import type {
  WorldControlMode,
  WorldSignalPhase,
  WorldSnapshot,
  WorldVehicleClass,
} from '../persistence';
import type { SimulationEvent } from '../simulation';

/**
 * World replay recorder (PBI 207).
 *
 * Docs/14 keeps the visual replay of the world separate from LEARNING telemetry: every taxi and
 * civilian is recorded, including the ones outside the camera and the ones in AUTO, and the
 * recorder never produces a learning job, a profile version or a LEARNING observation. This module
 * owns that contract; it is not a renderer, an experiment runner or a persistence adapter.
 *
 * Three properties are structural, not conventions:
 *
 * 1. **Exact ticks.** Every retained transform row and every event carries the tick of the real
 *    source. Transforms are decimated to 20 Hz and interpolation is declared in the chunk
 *    (`sampling.interpolation`), while events keep the tick at which they were published. Nothing
 *    stores an interpolated or rounded tick.
 * 2. **Bounded resources.** The ring is a fixed-capacity circular buffer whose charged bytes are
 *    capped by `ramByteCap`, the sustained write rate is capped per simulated second, incident
 *    chunks have a byte cap and a count/byte cap of their own, and the pinned chunk rate is capped
 *    per simulated minute. Every refusal is counted; the recorder never throws on capacity and
 *    never blocks the simulation.
 * 3. **Declared partials.** A window that started before capture, ended after capture, lost rows to
 *    pressure or was trimmed to the byte cap is reported as `PARTIAL` with a closed reason list and
 *    the exact missing ranges, never as a complete clip.
 *
 * Chunk integrity reuses the checkpoint contract of PBI 206 (`SDA-CJSON-1` canonicalization plus
 * `SHA-256`, over the payload without the checksum field) and each chunk anchors its replay on a
 * complete 206 world snapshot, so a chunk is never rebuilt only from visual transforms.
 */

export const WORLD_RECORDER_VERSION = '207-world-recorder-v1' as const;
export const WORLD_REPLAY_CHUNK_VERSION = '207-world-replay-chunk-v1' as const;

/** Same algorithm and canonicalization as the 206 snapshot and the savefile (Docs/29). */
export const WORLD_REPLAY_INTEGRITY = Object.freeze({
  algorithm: CHECKSUM_ALGORITHM,
  canonicalization: CANONICALIZATION_VERSION,
});

/** Capacities of Docs/performance-budgets.json that bound this contract. */
export const WORLD_RECORDER_BUDGET = Object.freeze({
  recorderRamBytes: 33_554_432,
  optionalReplayStorageBytes: 134_217_728,
});

/**
 * Defaults. The RAM cap covers the ring, the retained events and the sealed chunks together; the
 * pinned chunk reserve is subtracted from the ring cap so the total can never exceed the cap.
 */
export const WORLD_RECORDER_DEFAULTS = Object.freeze({
  tickHz: 60,
  sampleHz: 20,
  retentionSeconds: 120,
  pinBeforeSeconds: 15,
  pinAfterSeconds: 15,
  ramByteCap: 24 * 1024 * 1024,
  pinnedChunkBytes: 8 * 1024 * 1024,
  eventByteCap: 1024 * 1024,
  /** A chunk is capped at half the pinned reserve so retained chunks can never evict the newest. */
  chunkByteCap: 4 * 1024 * 1024,
  sampleRateBytesPerSecond: 512 * 1024,
  maxIncidentsPerMinute: 6,
  maxPinnedChunks: 8,
  maxEntities: 128,
  maxSignals: 128,
  maxEvents: 4096,
  maxEventsPerChunk: 1024,
  maxLifecycleFacts: 4096,
  maxCheckpoints: 8,
  maxSampleGaps: 64,
  anchorMaxAgeSeconds: 10,
  /** Closed identity vocabularies of the chunk tables; overflow is refused, never collapsed. */
  maxFsmStates: 255,
  maxRides: 4096,
});

/** Declared quantization of the compact chunk rows (physical values are stored as integers). */
export const WORLD_REPLAY_QUANTIZATION = Object.freeze({
  positionM: 0.01,
  rotationUnit: 0.0001,
});

/**
 * Owned-data accounting per retained entry. This is an ownership counter, never a heap reading:
 * it is deliberately larger than the packed row so the cap over-reserves instead of under-reserving.
 */
export const WORLD_REPLAY_CHARGE_BYTES = Object.freeze({
  sampleBase: 64,
  vehicle: 96,
  signal: 24,
  event: 320,
  lifecycleFact: 64,
});

/** Row layout of `WorldReplaySample.vehicles`; the comment is the contract for every reader. */
export const replayVehicleRowFields = [
  'entitySlot',
  'xCm',
  'yCm',
  'zCm',
  'qx',
  'qy',
  'qz',
  'qw',
  'modeCode',
  'fsmCode',
  'rideCode',
  'cameraCode',
] as const;

/** Row layout of `WorldReplaySample.signals`. */
export const replaySignalRowFields = ['signalSlot', 'phaseCode', 'remainingTicks'] as const;

export const worldRecorderRejectionCodes = [
  'INVALID_FRAME',
  'INVALID_EVENT',
  'FOREIGN_EVENT',
  'TICK_ORDER',
  'ENTITY_CAPACITY',
  'IDENTITY_CAPACITY',
  'ENTITY_IDENTITY_CONFLICT',
  'EVENT_CAPACITY',
  'STATE_NOT_RECORDING',
  'UNKNOWN_INCIDENT',
  'SEAL_BEFORE_INCIDENT',
  'CHUNK_EVICTED',
  'LEARNING_ARTIFACT',
  'CHUNK_TOO_LARGE',
  'INVALID_CHUNK',
  'CHECKSUM_MISMATCH',
  'INCOMPATIBLE_VERSION',
  'ANCHOR_MISMATCH',
  'SAMPLE_TICK_MISMATCH',
  'EVENT_TICK_MISMATCH',
  'COMPLETENESS_UNDECLARED',
] as const;
export type WorldRecorderRejectionCode = (typeof worldRecorderRejectionCodes)[number];

export interface WorldRecorderRejection {
  readonly code: WorldRecorderRejectionCode;
  readonly message: string;
  readonly path: string;
}

/** Closed vocabulary for a declared partial window. */
export const worldReplayPartialReasons = [
  'CAPTURE_STARTED_LATE',
  'CAPTURE_FINALIZED_EARLY',
  'SEALED_BEFORE_WINDOW_COMPLETE',
  'PRESSURED_ROWS_EVICTED',
  'RATE_LIMITED_ROWS',
  'CHUNK_BYTE_CAP',
  'EVENT_LIMIT',
  'CHECKPOINT_MISSING',
  'CHECKPOINT_STALE',
  'WORLD_DISCONTINUITY',
] as const;
export type WorldReplayPartialReason = (typeof worldReplayPartialReasons)[number];

export const replayControlModeCodes = ['AUTO', 'MANUAL', 'LEARNING'] as const;
export const replayPhaseCodes = ['GREEN', 'YELLOW', 'RED'] as const;
export const replayVehicleClassCodes = ['TAXI', 'CIVILIAN'] as const;
export type ReplayIncidentVisibility = 'OUTSIDE_CAMERA' | 'IN_CAMERA' | 'MIXED' | 'UNKNOWN';

/* ------------------------------------------------------------------ inputs */

export interface ReplayVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ReplayQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** One real vehicle of the authoritative world at this tick, whatever the camera sees. */
export interface ReplayVehicleObservation {
  readonly entityId: string;
  readonly handle: number;
  readonly vehicleClass: WorldVehicleClass;
  readonly controlMode: WorldControlMode;
  readonly position: ReplayVector3;
  readonly rotation: ReplayQuaternion;
  readonly linearVelocity: ReplayVector3;
  readonly fsmState: string;
  readonly rideId: string | null;
  readonly passengerIds: readonly string[];
  /** Whether the player camera currently sees the vehicle; recorded, never used as a filter. */
  readonly inCamera: boolean;
}

export interface ReplaySignalObservation {
  readonly signalId: string;
  readonly phase: WorldSignalPhase;
  readonly remainingTicks: number;
}

export interface ReplayLifecycleFactInput {
  readonly entityId: string;
  readonly vehicleClass: WorldVehicleClass;
  /** Rapier handle when the world knows it; `null`/omitted when the fact comes without physics. */
  readonly handle?: number;
  readonly tick: number;
}

/** One authoritative tick offered by the world: lifecycle is exact, transforms are decimated. */
export interface ReplayTickFrame {
  readonly tick: number;
  readonly vehicles: readonly ReplayVehicleObservation[];
  readonly signals: readonly ReplaySignalObservation[];
  readonly created?: readonly ReplayLifecycleFactInput[];
  readonly removed?: readonly ReplayLifecycleFactInput[];
}

export interface WorldRecorderVersions {
  readonly engineVersion: string;
  readonly physicsVersion: string;
  readonly mapVersion: string;
}

export interface WorldRecorderOptions {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly versions: WorldRecorderVersions;
  readonly tickHz?: number;
  readonly sampleHz?: number;
  readonly retentionSeconds?: number;
  readonly pinBeforeSeconds?: number;
  readonly pinAfterSeconds?: number;
  readonly ramByteCap?: number;
  readonly pinnedChunkBytes?: number;
  readonly eventByteCap?: number;
  readonly chunkByteCap?: number;
  readonly sampleRateBytesPerSecond?: number;
  readonly maxIncidentsPerMinute?: number;
  readonly maxPinnedChunks?: number;
  readonly maxEntities?: number;
  readonly maxSignals?: number;
  readonly maxEvents?: number;
  readonly maxEventsPerChunk?: number;
  readonly maxLifecycleFacts?: number;
  readonly maxCheckpoints?: number;
  readonly maxSampleGaps?: number;
  readonly anchorMaxAgeSeconds?: number;
  /** Injected so a chunk's `createdAt` never leaks an uncontrolled wall clock into a report. */
  readonly now?: () => string;
}

/* ----------------------------------------------------------------- results */

export type WorldTickStatus =
  'SAMPLED' | 'CADENCE_SKIPPED' | 'RATE_LIMITED' | 'PRESSURE_DROPPED' | 'REJECTED';

export interface WorldTickResult {
  readonly status: WorldTickStatus;
  readonly tick: number | null;
  readonly sampled: boolean;
  readonly sampleBytes: number;
  readonly vehicles: number;
  readonly code: WorldRecorderRejectionCode | null;
  readonly detail: string | null;
}

export type WorldEventStatus = 'RECORDED' | 'DUPLICATE' | 'REJECTED';

export interface WorldEventResult {
  readonly status: WorldEventStatus;
  readonly eventId: string | null;
  readonly tick: number | null;
  readonly code: WorldRecorderRejectionCode | null;
  readonly incidentId: string | null;
  readonly incident: 'PINNED' | 'RATE_LIMITED' | null;
  readonly detail: string | null;
}

/* ------------------------------------------------------------ chunk model */

/** One compact transform row: position in cm, rotation in 1/10000 units, codes for state. */
export type ReplayVehicleRow = readonly number[];

export interface WorldReplaySample {
  readonly tick: number;
  /** Exactly `replayVehicleRowFields`, in order; the camera flag is recorded, never filtered on. */
  readonly vehicles: readonly ReplayVehicleRow[];
  /** Exactly `replaySignalRowFields`, in order. */
  readonly signals: readonly ReplayVehicleRow[];
}

export interface WorldReplayEntityIdentity {
  readonly slot: number;
  readonly entityId: string;
  readonly vehicleClass: WorldVehicleClass;
  /** Rapier handle at the first observed tick, so a replay can map back to the 206 anchor. */
  readonly handle: number;
}

export interface WorldReplaySignalIdentity {
  readonly slot: number;
  readonly signalId: string;
}

export interface WorldReplayEventFact {
  readonly eventId: string;
  readonly tick: number;
  readonly type: string;
  readonly entityIds: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sessionId: string;
  readonly worldEpoch: number;
}

export interface WorldReplayLifecycleFact {
  readonly tick: number;
  readonly kind: 'CREATED' | 'REMOVED';
  readonly entityId: string;
  readonly vehicleClass: WorldVehicleClass;
  /** True when the sample stream is the only evidence; declared, never silent. */
  readonly inferred: boolean;
}

export interface WorldReplayIncident {
  readonly incidentId: string;
  readonly kind: 'COLLISION';
  readonly eventId: string;
  readonly tick: number;
  readonly entityIds: readonly string[];
  readonly controlModes: readonly (WorldControlMode | 'UNKNOWN')[];
  readonly autoOnly: boolean;
  readonly visibility: ReplayIncidentVisibility;
  readonly outsideCamera: boolean;
  /**
   * The sampled tick the mode/camera classification was read from, or null when no sample at or
   * before the incident existed. Declared so a replay never presents a guess as the incident tick.
   */
  readonly classifiedFromTick: number | null;
  readonly pinnedFromTick: number;
  readonly pinnedToTick: number;
}

export interface WorldReplayWindowCoverage {
  readonly requestedTicks: number;
  readonly recordedTicks: number;
  readonly coverage: number;
  readonly startTick: number;
  readonly endTick: number;
}

export interface WorldReplayGap {
  readonly fromTick: number;
  readonly toTick: number;
}

export interface WorldReplayCompleteness {
  readonly status: 'COMPLETE' | 'PARTIAL';
  readonly declaredPartial: boolean;
  readonly reasons: readonly WorldReplayPartialReason[];
  readonly before: WorldReplayWindowCoverage;
  readonly after: WorldReplayWindowCoverage;
  readonly droppedSamples: number;
  readonly sampleGaps: readonly WorldReplayGap[];
  readonly omittedGaps: number;
  readonly anchor: 'PRESENT' | 'MISSING' | 'STALE';
  readonly anchorAgeTicks: number | null;
}

export interface WorldReplaySamplingDeclaration {
  readonly tickHz: number;
  readonly sampleHz: number;
  readonly cadenceTicks: number;
  readonly interpolation: 'LINEAR';
  readonly rotationInterpolation: 'NLERP';
  readonly interpolationScope: 'TRANSFORMS';
  /** Sample ticks are `tick % cadenceTicks === 0`; declared so a reader can verify any row. */
  readonly alignmentTick: 0;
  readonly eventTicksExact: true;
  readonly observedTicksOnly: true;
  readonly physicsFidelity: false;
  readonly fields: readonly string[];
  readonly notSampled: readonly string[];
  readonly quantization: typeof WORLD_REPLAY_QUANTIZATION;
}

/** The recorder is not a LEARNING producer; these values are structurally zero. */
export interface WorldReplayLearningDeclaration {
  readonly producesArtifacts: false;
  readonly eligible: false;
  readonly jobs: 0;
  readonly observations: 0;
  readonly profileVersions: 0;
}

export interface WorldReplayCameraDeclaration {
  readonly filterApplied: false;
  readonly recordedVehicles: number;
  readonly outOfCameraVehicles: number;
}

export interface WorldReplayTables {
  readonly entities: readonly WorldReplayEntityIdentity[];
  readonly fsmStates: readonly string[];
  readonly rides: readonly string[];
  readonly signals: readonly WorldReplaySignalIdentity[];
  readonly controlModes: typeof replayControlModeCodes;
  readonly phases: typeof replayPhaseCodes;
  readonly vehicleClasses: typeof replayVehicleClassCodes;
}

export interface WorldReplayCheckpointReference {
  readonly checkpointId: string;
  readonly tick: number;
  readonly checksum: string;
}

export interface WorldReplayChunk {
  readonly chunkVersion: typeof WORLD_REPLAY_CHUNK_VERSION;
  readonly integrity: typeof WORLD_REPLAY_INTEGRITY;
  readonly chunkId: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly versions: WorldRecorderVersions;
  readonly createdAt: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly incident: WorldReplayIncident;
  readonly pinned: true;
  readonly checkpoint: WorldReplayCheckpointReference | null;
  readonly anchor: WorldSnapshot | null;
  readonly sampling: WorldReplaySamplingDeclaration;
  readonly completeness: WorldReplayCompleteness;
  readonly camera: WorldReplayCameraDeclaration;
  readonly learning: WorldReplayLearningDeclaration;
  readonly tables: WorldReplayTables;
  readonly lifecycle: {
    readonly created: readonly WorldReplayLifecycleFact[];
    readonly removed: readonly WorldReplayLifecycleFact[];
  };
  readonly samples: readonly WorldReplaySample[];
  readonly events: readonly WorldReplayEventFact[];
  /** The tick at which the window was closed, declared so a trimmed clip is never presented whole. */
  readonly sealTick: number;
  readonly bytes: number;
  readonly checksum: string;
}

export interface WorldReplayChunkAccepted {
  readonly status: 'ACCEPTED';
  readonly chunk: WorldReplayChunk;
  readonly bytes: number;
  readonly checksum: string;
}

export interface WorldReplayChunkRejected {
  readonly status: 'REJECTED';
  readonly rejection: WorldRecorderRejection;
}

export type WorldReplayChunkReadResult = WorldReplayChunkAccepted | WorldReplayChunkRejected;

export interface WorldSealAccepted {
  readonly status: 'SEALED' | 'SEALED_PARTIAL';
  readonly chunk: WorldReplayChunk;
}

export interface WorldSealRejected {
  readonly status: 'REJECTED';
  readonly chunk: null;
  readonly rejection: WorldRecorderRejection;
}

export type WorldSealResult = WorldSealAccepted | WorldSealRejected;

export interface WorldFinalizeResult {
  readonly status: 'FINALIZED';
  readonly reason: WorldFinalizeReason;
  readonly lastTick: number | null;
  readonly sealed: readonly string[];
  readonly partial: readonly string[];
  readonly stats: WorldRecorderStats;
}

export const worldFinalizeReasons = [
  'SESSION_END',
  'WORLD_RESET',
  'STATE_CHANGE',
  'CAPACITY',
  'DISPOSED',
] as const;
export type WorldFinalizeReason = (typeof worldFinalizeReasons)[number];

export interface WorldRecorderStats {
  readonly version: typeof WORLD_RECORDER_VERSION;
  readonly state: WorldRecorderState;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly firstTick: number | null;
  readonly lastTick: number | null;
  readonly firstSampleTick: number | null;
  readonly lastSampleTick: number | null;
  readonly retainedSamples: number;
  readonly retainedSeconds: number;
  readonly retainedVehicles: number;
  readonly sampledVehicleRows: number;
  readonly outOfCameraRows: number;
  readonly autoRows: number;
  readonly ticksAccepted: number;
  readonly ticksCadenceSkipped: number;
  readonly ticksRejected: number;
  readonly samplesRecorded: number;
  readonly samplesDroppedRate: number;
  readonly samplesDroppedPressure: number;
  readonly samplesEvicted: number;
  readonly samplesDroppedEntityCapacity: number;
  readonly eventsRecorded: number;
  readonly eventsDuplicate: number;
  readonly eventsEvicted: number;
  readonly eventsRejected: number;
  readonly incidentsRegistered: number;
  readonly incidentsRateLimited: number;
  readonly incidentsSealed: number;
  readonly incidentsOpen: number;
  readonly chunksRetained: number;
  readonly chunksEvicted: number;
  readonly chunksTransferred: number;
  readonly chunksTooLarge: number;
  readonly entitiesKnown: number;
  readonly entitiesCreated: number;
  readonly entitiesRemoved: number;
  readonly inferredCreated: number;
  readonly inferredRemoved: number;
  readonly lifecycleEvicted: number;
  readonly checkpointsKnown: number;
  readonly ringBytes: number;
  readonly eventBytes: number;
  readonly sealedChunkBytes: number;
  readonly chargedBytes: number;
  readonly ramByteCap: number;
  readonly ringByteCap: number;
  readonly pinnedChunkBytesCap: number;
  readonly eventByteCap: number;
  readonly peakChargedBytes: number;
  readonly lastRateBytes: number;
  readonly peakRateBytes: number;
  readonly sampleRateBytesPerSecond: number;
  readonly chunksPerMinute: number;
  readonly maxChunksPerMinute: number;
  readonly learningArtifacts: 0;
  readonly learningJobs: 0;
  readonly learningObservations: 0;
  readonly profileVersions: 0;
  readonly learningEligible: false;
}

export type WorldRecorderState = 'RECORDING' | 'FINALIZED' | 'DISPOSED';

export interface WorldRecorder {
  readonly version: typeof WORLD_RECORDER_VERSION;
  recordTick(frame: ReplayTickFrame): WorldTickResult;
  /** Ingests one already validated 007 event; exact tick, idempotent by `eventId`. */
  recordEvent(event: SimulationEvent): WorldEventResult;
  /** Anchors chunks on a complete 206 snapshot captured by the 206 checkpoint writer. */
  recordCheckpoint(input: {
    readonly checkpointId: string;
    readonly snapshot: WorldSnapshot;
  }): boolean;
  sealIncident(incidentId: string, sealTick?: number): WorldSealResult;
  sealReadyIncidents(): readonly string[];
  takeChunk(sequence: number): WorldReplayChunk | null;
  listChunks(): readonly {
    readonly sequence: number;
    readonly chunkId: string;
    readonly incidentId: string;
    readonly startTick: number;
    readonly endTick: number;
    readonly bytes: number;
    readonly status: WorldReplayCompleteness['status'];
  }[];
  finalize(reason: WorldFinalizeReason): WorldFinalizeResult;
  dispose(): void;
  getStats(): WorldRecorderStats;
}

/* ------------------------------------------------------------- validation */

class RecorderError extends Error {
  readonly code: WorldRecorderRejectionCode;
  readonly path: string;

  constructor(code: WorldRecorderRejectionCode, message: string, path: string) {
    super(message);
    this.name = 'RecorderError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: WorldRecorderRejectionCode, message: string, path: string): never {
  throw new RecorderError(code, message, path);
}

const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const STATE_TOKEN = /^[A-Z][A-Z0-9_]*$/;
const CHECKSUM_HEX = /^[0-9a-f]{64}$/;

function readTick(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_FRAME', 'Expected a nonnegative safe integer tick', path);
  }
  return value;
}

function readCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_FRAME', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function readId(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value
  ) {
    fail('INVALID_FRAME', 'Expected a bounded identity', path);
  }
  return value;
}

function readToken(value: unknown, path: string): string {
  if (typeof value !== 'string' || !STATE_TOKEN.test(value) || value.length > 64) {
    fail('INVALID_FRAME', 'Expected an uppercase state token', path);
  }
  return value;
}

function readFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_FRAME', 'Expected a finite number', path);
  }
  return value;
}

function readUnit(value: unknown, path: string): number {
  const number = readFinite(value, path);
  if (number < -1 || number > 1) fail('INVALID_FRAME', 'Expected a unit value', path);
  return number;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail('INVALID_FRAME', `Expected one of ${allowed.join(', ')}`, path);
  }
  return value as T;
}

function readObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_FRAME', 'Expected a plain object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_FRAME', 'Expected plain data, not a class instance', path);
  }
  return value as Record<string, unknown>;
}

function readVector3(value: unknown, path: string): ReplayVector3 {
  const data = readObject(value, path);
  return Object.freeze({
    x: readFinite(data.x, `${path}.x`),
    y: readFinite(data.y, `${path}.y`),
    z: readFinite(data.z, `${path}.z`),
  });
}

function readQuaternion(value: unknown, path: string): ReplayQuaternion {
  const data = readObject(value, path);
  return Object.freeze({
    x: readUnit(data.x, `${path}.x`),
    y: readUnit(data.y, `${path}.y`),
    z: readUnit(data.z, `${path}.z`),
    w: readUnit(data.w, `${path}.w`),
  });
}

function readVehicleObservation(value: unknown, path: string): ReplayVehicleObservation {
  const data = readObject(value, path);
  if (!Array.isArray(data.passengerIds) || data.passengerIds.length > 16) {
    fail('INVALID_FRAME', 'Expected at most 16 passenger identities', `${path}.passengerIds`);
  }
  const passengerIds = data.passengerIds.map((entry, index) =>
    readId(entry, `${path}.passengerIds[${index}]`),
  );
  if (new Set(passengerIds).size !== passengerIds.length) {
    fail('INVALID_FRAME', 'Duplicate passenger identities', `${path}.passengerIds`);
  }
  if (typeof data.inCamera !== 'boolean') {
    fail('INVALID_FRAME', 'Expected a boolean camera flag', `${path}.inCamera`);
  }
  return Object.freeze({
    entityId: readId(data.entityId, `${path}.entityId`),
    handle: readCount(data.handle, `${path}.handle`),
    vehicleClass: readEnum(data.vehicleClass, replayVehicleClassCodes, `${path}.vehicleClass`),
    controlMode: readEnum(data.controlMode, replayControlModeCodes, `${path}.controlMode`),
    position: readVector3(data.position, `${path}.position`),
    rotation: readQuaternion(data.rotation, `${path}.rotation`),
    linearVelocity: readVector3(data.linearVelocity, `${path}.linearVelocity`),
    fsmState: readToken(data.fsmState, `${path}.fsmState`),
    rideId: data.rideId === null ? null : readId(data.rideId, `${path}.rideId`),
    passengerIds: Object.freeze(passengerIds),
    inCamera: data.inCamera,
  });
}

function readSignalObservation(value: unknown, path: string): ReplaySignalObservation {
  const data = readObject(value, path);
  return Object.freeze({
    signalId: readId(data.signalId, `${path}.signalId`),
    phase: readEnum(data.phase, replayPhaseCodes, `${path}.phase`),
    remainingTicks: readCount(data.remainingTicks, `${path}.remainingTicks`),
  });
}

function readLifecycleFact(value: unknown, path: string, tick: number): ReplayLifecycleFactInput {
  const data = readObject(value, path);
  const factTick = readTick(data.tick, `${path}.tick`);
  if (factTick !== tick) {
    fail(
      'INVALID_FRAME',
      `Lifecycle fact tick ${factTick} is not the offered tick ${tick}`,
      `${path}.tick`,
    );
  }
  return Object.freeze({
    entityId: readId(data.entityId, `${path}.entityId`),
    vehicleClass: readEnum(data.vehicleClass, replayVehicleClassCodes, `${path}.vehicleClass`),
    handle: data.handle === undefined ? undefined : readCount(data.handle, `${path}.handle`),
    tick: factTick,
  });
}

function readFrame(value: unknown): ReplayTickFrame {
  const data = readObject(value, 'frame');
  const tick = readTick(data.tick, 'frame.tick');
  if (!Array.isArray(data.vehicles))
    fail('INVALID_FRAME', 'Expected vehicle rows', 'frame.vehicles');
  if (!Array.isArray(data.signals)) fail('INVALID_FRAME', 'Expected signal rows', 'frame.signals');
  const vehicles = data.vehicles.map((entry, index) =>
    readVehicleObservation(entry, `frame.vehicles[${index}]`),
  );
  const signals = data.signals.map((entry, index) =>
    readSignalObservation(entry, `frame.signals[${index}]`),
  );
  const seenVehicles = new Set<string>();
  for (const vehicle of vehicles) {
    if (seenVehicles.has(vehicle.entityId)) {
      fail('INVALID_FRAME', `Duplicate vehicle ${vehicle.entityId}`, 'frame.vehicles');
    }
    seenVehicles.add(vehicle.entityId);
  }
  const seenSignals = new Set<string>();
  for (const signal of signals) {
    if (seenSignals.has(signal.signalId)) {
      fail('INVALID_FRAME', `Duplicate signal ${signal.signalId}`, 'frame.signals');
    }
    seenSignals.add(signal.signalId);
  }
  const lifecycle = (field: 'created' | 'removed'): readonly ReplayLifecycleFactInput[] => {
    const raw = data[field];
    if (raw === undefined) return Object.freeze([]);
    if (!Array.isArray(raw)) fail('INVALID_FRAME', 'Expected lifecycle facts', `frame.${field}`);
    return Object.freeze(
      raw.map((entry, index) => readLifecycleFact(entry, `frame.${field}[${index}]`, tick)),
    );
  };
  return Object.freeze({
    tick,
    vehicles: Object.freeze(vehicles),
    signals: Object.freeze(signals),
    created: lifecycle('created'),
    removed: lifecycle('removed'),
  });
}

/** Bounded plain-data copy of an event payload; anything that is not data is refused. */
function copyJson(value: unknown, depth: number, path: string): unknown {
  if (depth > 8) fail('INVALID_EVENT', 'Event payload is nested too deeply', path);
  if (value === null) return null;
  if (typeof value === 'string') {
    if (value.length > 512) fail('INVALID_EVENT', 'Event text is too long', path);
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_EVENT', 'Event numbers must be finite', path);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) fail('INVALID_EVENT', 'Event array is too long', path);
    return Object.freeze(
      value.map((entry, index) => copyJson(entry, depth + 1, `${path}[${index}]`)),
    );
  }
  const data = readObject(value, path);
  const result: Record<string, unknown> = {};
  const keys = Object.keys(data);
  if (keys.length > 32) fail('INVALID_EVENT', 'Event object is too large', path);
  for (const key of keys) {
    if (RESERVED_KEYS.has(key)) fail('INVALID_EVENT', `Reserved key: ${key}`, path);
    if (key.length > 64) fail('INVALID_EVENT', 'Event key is too long', path);
    result[key] = copyJson(data[key], depth + 1, `${path}.${key}`);
  }
  return Object.freeze(result);
}

function readEventFact(value: SimulationEvent): WorldReplayEventFact {
  const data = readObject(value, 'event');
  const sessionId = readId(data.sessionId, 'event.sessionId');
  const worldEpoch = readTick(data.worldEpoch, 'event.worldEpoch');
  const eventId = readId(data.eventId, 'event.eventId');
  const tick = readTick(data.tick, 'event.tick');
  const type = readEnum(data.type, worldReplayEventTypes, 'event.type');
  if (!Array.isArray(data.entityIds) || data.entityIds.length > 32) {
    fail('INVALID_EVENT', 'Expected at most 32 event entities', 'event.entityIds');
  }
  const entityIds = data.entityIds.map((entry, index) =>
    readId(entry, `event.entityIds[${index}]`),
  );
  const payload = copyJson(data.payload, 0, 'event.payload') as Readonly<Record<string, unknown>>;
  return Object.freeze({
    eventId,
    tick,
    type,
    entityIds: Object.freeze(entityIds),
    payload,
    sessionId,
    worldEpoch,
  });
}

export const worldReplayEventTypes = [
  'MANUAL_START',
  'MANUAL_END',
  'LEADER_ACQUIRED',
  'SIGNAL_CHANGED',
  'SIGNAL_PHASE_CHANGED',
  'STOP_APPROACH',
  'STOP_LINE_CROSSED',
  'FULL_STOP',
  'LANE_CHANGE_STARTED',
  'LANE_CHANGE_COMPLETED',
  'COLLISION',
  'PICKUP',
  'DROPOFF',
  'PROFILE_ACTIVATE',
  'VEHICLE_RECOVERED',
  'WORLD_RESET',
  'DESTRUCTIBLE_BROKEN',
] as const;
export type WorldReplayEventType = (typeof worldReplayEventTypes)[number];

/** The events that pin a replay window. AUTO collisions are the acceptance case. */
export const worldRecorderIncidentEventTypes: readonly WorldReplayEventType[] = Object.freeze([
  'COLLISION',
]);

/** The shared readers speak in frame codes; a refused event is always an event rejection. */
function eventCode(code: WorldRecorderRejectionCode): WorldRecorderRejectionCode {
  return code === 'INVALID_FRAME' ? 'INVALID_EVENT' : code;
}
export const worldRecorderDiscontinuityEventTypes: readonly WorldReplayEventType[] = Object.freeze([
  'WORLD_RESET',
]);

/* --------------------------------------------------------------- internals */

interface RingVehicle {
  readonly slot: number;
  readonly xCm: number;
  readonly yCm: number;
  readonly zCm: number;
  readonly qx: number;
  readonly qy: number;
  readonly qz: number;
  readonly qw: number;
  readonly mode: number;
  readonly fsm: number;
  readonly ride: number;
  readonly inCamera: boolean;
}

interface RingSignal {
  readonly slot: number;
  readonly phase: number;
  readonly remainingTicks: number;
}

interface RingSample {
  readonly tick: number;
  readonly vehicles: readonly RingVehicle[];
  readonly signals: readonly RingSignal[];
  readonly bytes: number;
}

interface IncidentPlan {
  incidentId: string;
  /** The exact collision fact, owned by the plan so event eviction can never lose the pin. */
  fact: WorldReplayEventFact;
  eventId: string;
  tick: number;
  entityIds: readonly string[];
  fromTick: number;
  toTick: number;
  controlModes: readonly (WorldControlMode | 'UNKNOWN')[];
  visibility: ReplayIncidentVisibility;
  autoOnly: boolean;
  outsideCamera: boolean;
  classifiedFromTick: number | null;
  pressureLoss: boolean;
  sealed: boolean;
  sealTick: number | null;
  /** Completeness of the chunk this plan produced, or null when the seal produced no chunk. */
  chunkStatus: WorldReplayCompleteness['status'] | null;
}

interface RetainedChunk {
  readonly sequence: number;
  readonly chunkId: string;
  readonly incidentId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly bytes: number;
  readonly status: WorldReplayCompleteness['status'];
  readonly chunk: WorldReplayChunk;
}

interface CheckpointAnchor {
  readonly checkpointId: string;
  readonly tick: number;
  readonly checksum: string;
  readonly snapshot: WorldSnapshot;
}

interface RecorderConfig {
  readonly tickHz: number;
  readonly sampleHz: number;
  readonly cadenceTicks: number;
  readonly retentionSeconds: number;
  readonly pinBeforeTicks: number;
  readonly pinAfterTicks: number;
  readonly maxSamples: number;
  readonly ramByteCap: number;
  readonly ringByteCap: number;
  readonly pinnedChunkBytes: number;
  readonly eventByteCap: number;
  readonly chunkByteCap: number;
  readonly sampleRateBytesPerSecond: number;
  readonly maxIncidentsPerMinute: number;
  readonly maxPinnedChunks: number;
  readonly maxEntities: number;
  readonly maxSignals: number;
  readonly maxFsmStates: number;
  readonly maxRides: number;
  readonly maxEvents: number;
  readonly maxEventsPerChunk: number;
  readonly maxLifecycleFacts: number;
  readonly maxCheckpoints: number;
  readonly maxSampleGaps: number;
  readonly anchorMaxAgeTicks: number;
}

function positiveInteger(value: number, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RecorderError(
      'INVALID_FRAME',
      `${name} must be a positive integer ≤ ${maximum}`,
      name,
    );
  }
  return value;
}

function configure(options: WorldRecorderOptions): RecorderConfig {
  const tickHz = positiveInteger(options.tickHz ?? WORLD_RECORDER_DEFAULTS.tickHz, 'tickHz', 240);
  const sampleHz = positiveInteger(
    options.sampleHz ?? WORLD_RECORDER_DEFAULTS.sampleHz,
    'sampleHz',
    tickHz,
  );
  if (tickHz % sampleHz !== 0) {
    throw new RecorderError(
      'INVALID_FRAME',
      'sampleHz must divide tickHz so every sample lands on a real tick',
      'sampleHz',
    );
  }
  const retentionSeconds = positiveInteger(
    options.retentionSeconds ?? WORLD_RECORDER_DEFAULTS.retentionSeconds,
    'retentionSeconds',
    600,
  );
  const pinBeforeSeconds = positiveInteger(
    options.pinBeforeSeconds ?? WORLD_RECORDER_DEFAULTS.pinBeforeSeconds,
    'pinBeforeSeconds',
    60,
  );
  const pinAfterSeconds = positiveInteger(
    options.pinAfterSeconds ?? WORLD_RECORDER_DEFAULTS.pinAfterSeconds,
    'pinAfterSeconds',
    60,
  );
  const ramByteCap = positiveInteger(
    options.ramByteCap ?? WORLD_RECORDER_DEFAULTS.ramByteCap,
    'ramByteCap',
    WORLD_RECORDER_BUDGET.recorderRamBytes,
  );
  const pinnedChunkBytes = positiveInteger(
    options.pinnedChunkBytes ?? WORLD_RECORDER_DEFAULTS.pinnedChunkBytes,
    'pinnedChunkBytes',
    WORLD_RECORDER_BUDGET.recorderRamBytes,
  );
  const eventByteCap = positiveInteger(
    options.eventByteCap ?? WORLD_RECORDER_DEFAULTS.eventByteCap,
    'eventByteCap',
    WORLD_RECORDER_BUDGET.recorderRamBytes,
  );
  if (pinnedChunkBytes + eventByteCap + 1024 * 1024 > ramByteCap) {
    throw new RecorderError(
      'INVALID_FRAME',
      'The RAM cap must cover the pinned chunk reserve, the event reserve and the ring',
      'ramByteCap',
    );
  }
  const chunkByteCap = positiveInteger(
    options.chunkByteCap ?? WORLD_RECORDER_DEFAULTS.chunkByteCap,
    'chunkByteCap',
    WORLD_RECORDER_BUDGET.recorderRamBytes,
  );
  const sampleRateBytesPerSecond = positiveInteger(
    options.sampleRateBytesPerSecond ?? WORLD_RECORDER_DEFAULTS.sampleRateBytesPerSecond,
    'sampleRateBytesPerSecond',
    64 * 1024 * 1024,
  );
  const maxIncidentsPerMinute = positiveInteger(
    options.maxIncidentsPerMinute ?? WORLD_RECORDER_DEFAULTS.maxIncidentsPerMinute,
    'maxIncidentsPerMinute',
    240,
  );
  const maxPinnedChunks = positiveInteger(
    options.maxPinnedChunks ?? WORLD_RECORDER_DEFAULTS.maxPinnedChunks,
    'maxPinnedChunks',
    64,
  );
  const maxEntities = positiveInteger(
    options.maxEntities ?? WORLD_RECORDER_DEFAULTS.maxEntities,
    'maxEntities',
    512,
  );
  const maxSignals = positiveInteger(
    options.maxSignals ?? WORLD_RECORDER_DEFAULTS.maxSignals,
    'maxSignals',
    512,
  );
  const maxEvents = positiveInteger(
    options.maxEvents ?? WORLD_RECORDER_DEFAULTS.maxEvents,
    'maxEvents',
    65_536,
  );
  const maxEventsPerChunk = positiveInteger(
    options.maxEventsPerChunk ?? WORLD_RECORDER_DEFAULTS.maxEventsPerChunk,
    'maxEventsPerChunk',
    8192,
  );
  const maxLifecycleFacts = positiveInteger(
    options.maxLifecycleFacts ?? WORLD_RECORDER_DEFAULTS.maxLifecycleFacts,
    'maxLifecycleFacts',
    65_536,
  );
  const maxCheckpoints = positiveInteger(
    options.maxCheckpoints ?? WORLD_RECORDER_DEFAULTS.maxCheckpoints,
    'maxCheckpoints',
    64,
  );
  const maxSampleGaps = positiveInteger(
    options.maxSampleGaps ?? WORLD_RECORDER_DEFAULTS.maxSampleGaps,
    'maxSampleGaps',
    512,
  );
  const anchorMaxAgeSeconds = positiveInteger(
    options.anchorMaxAgeSeconds ?? WORLD_RECORDER_DEFAULTS.anchorMaxAgeSeconds,
    'anchorMaxAgeSeconds',
    120,
  );
  return Object.freeze({
    tickHz,
    sampleHz,
    cadenceTicks: tickHz / sampleHz,
    retentionSeconds,
    pinBeforeTicks: pinBeforeSeconds * tickHz,
    pinAfterTicks: pinAfterSeconds * tickHz,
    maxSamples: retentionSeconds * sampleHz,
    ramByteCap,
    ringByteCap: ramByteCap - pinnedChunkBytes - eventByteCap,
    pinnedChunkBytes,
    eventByteCap,
    chunkByteCap,
    sampleRateBytesPerSecond,
    maxIncidentsPerMinute,
    maxPinnedChunks,
    maxEntities,
    maxSignals,
    maxFsmStates: WORLD_RECORDER_DEFAULTS.maxFsmStates,
    maxRides: WORLD_RECORDER_DEFAULTS.maxRides,
    maxEvents,
    maxEventsPerChunk,
    maxLifecycleFacts,
    maxCheckpoints,
    maxSampleGaps,
    anchorMaxAgeTicks: anchorMaxAgeSeconds * tickHz,
  });
}

function sampleCharge(vehicles: number, signals: number): number {
  return (
    WORLD_REPLAY_CHARGE_BYTES.sampleBase +
    vehicles * WORLD_REPLAY_CHARGE_BYTES.vehicle +
    signals * WORLD_REPLAY_CHARGE_BYTES.signal
  );
}

const utf8 = new TextEncoder();

/** Real UTF-8 byte length; every byte cap in this module is measured in bytes, never code units. */
function byteLength(text: string): number {
  return utf8.encode(text).byteLength;
}

function quantize(value: number, scale: number): number {
  return Math.round(value * scale);
}

function modeCode(mode: WorldControlMode): number {
  const index = replayControlModeCodes.indexOf(mode);
  if (index < 0)
    fail('INVALID_FRAME', `Unknown control mode ${mode}`, 'frame.vehicles.controlMode');
  return index;
}

function phaseCode(phase: WorldSignalPhase): number {
  const index = replayPhaseCodes.indexOf(phase);
  if (index < 0) fail('INVALID_FRAME', `Unknown signal phase ${phase}`, 'frame.signals.phase');
  return index;
}

/* ---------------------------------------------------------------- recorder */

export function createWorldRecorder(options: WorldRecorderOptions): WorldRecorder {
  const config = configure(options);
  if (typeof options.sessionId !== 'string' || options.sessionId.trim() !== options.sessionId) {
    throw new RecorderError('INVALID_FRAME', 'Expected a session identity', 'sessionId');
  }
  const sessionId = readId(options.sessionId, 'sessionId');
  const worldEpoch = readTick(options.worldEpoch, 'worldEpoch');
  const versions: WorldRecorderVersions = Object.freeze({
    engineVersion: readId(options.versions.engineVersion, 'versions.engineVersion'),
    physicsVersion: readId(options.versions.physicsVersion, 'versions.physicsVersion'),
    mapVersion: readId(options.versions.mapVersion, 'versions.mapVersion'),
  });
  const now = options.now ?? (() => new Date().toISOString());

  let state: WorldRecorderState = 'RECORDING';
  let firstTick: number | null = null;
  let lastTick: number | null = null;
  let firstSampleTick: number | null = null;
  let lastSampleTick: number | null = null;
  let sampledVehicleRows = 0;
  let outOfCameraRows = 0;
  let autoRows = 0;
  let ringBytes = 0;
  let eventBytes = 0;
  let sealedChunkBytes = 0;
  let peakChargedBytes = 0;
  let rateSecond = -1;
  let rateBytes = 0;
  let peakRateBytes = 0;
  let sequence = 0;
  let disposed = false;

  /* ring */
  const ring: (RingSample | undefined)[] = new Array<RingSample | undefined>(config.maxSamples);
  let ringStart = 0;
  let ringLength = 0;

  /* identity tables */
  const entitySlots = new Map<string, number>();
  const entities: {
    entityId: string;
    vehicleClass: WorldVehicleClass;
    handle: number;
  }[] = [];
  const fsmStates: string[] = [];
  const fsmIndex = new Map<string, number>();
  const rides: string[] = ['-'];
  const rideIndex = new Map<string, number>();
  const signalSlots = new Map<string, number>();
  const signalsTable: { signalId: string }[] = [];

  /* facts */
  const events: WorldReplayEventFact[] = [];
  const eventIds = new Set<string>();
  const lifecycle: WorldReplayLifecycleFact[] = [];
  const checkpoints: CheckpointAnchor[] = [];
  const incidentTicks: number[] = [];
  const incidents = new Map<string, IncidentPlan>();
  const retainedChunks: RetainedChunk[] = [];
  const knownEntities = new Set<string>();
  const previousSampleEntities = new Set<string>();
  let lastDiscontinuityTick: number | null = null;

  /* counters */
  const counters = {
    ticksAccepted: 0,
    ticksCadenceSkipped: 0,
    ticksRejected: 0,
    samplesRecorded: 0,
    samplesDroppedRate: 0,
    samplesDroppedPressure: 0,
    samplesEvicted: 0,
    samplesDroppedEntityCapacity: 0,
    eventsRecorded: 0,
    eventsDuplicate: 0,
    eventsEvicted: 0,
    eventsRejected: 0,
    incidentsRegistered: 0,
    incidentsRateLimited: 0,
    incidentsSealed: 0,
    chunksEvicted: 0,
    chunksTransferred: 0,
    chunksTooLarge: 0,
    entitiesCreated: 0,
    entitiesRemoved: 0,
    inferredCreated: 0,
    inferredRemoved: 0,
    lifecycleEvicted: 0,
  };

  function chargedBytes(): number {
    return ringBytes + eventBytes + sealedChunkBytes;
  }

  function notePeak(): void {
    const total = chargedBytes();
    if (total > peakChargedBytes) peakChargedBytes = total;
  }

  function entitySlot(entityId: string, vehicleClass: WorldVehicleClass, handle: number): number {
    const existing = entitySlots.get(entityId);
    if (existing !== undefined) {
      const identity = entities[existing];
      if (identity !== undefined && identity.vehicleClass !== vehicleClass) {
        fail(
          'ENTITY_IDENTITY_CONFLICT',
          `${entityId} was recorded as ${identity.vehicleClass} and is now ${vehicleClass}`,
          'frame.vehicles.vehicleClass',
        );
      }
      return existing;
    }
    if (entities.length >= config.maxEntities) {
      fail(
        'ENTITY_CAPACITY',
        `The identity table is full at ${config.maxEntities}`,
        'frame.vehicles',
      );
    }
    const slot = entities.length;
    entities.push({ entityId, vehicleClass, handle });
    entitySlots.set(entityId, slot);
    return slot;
  }

  /** FSM and ride tables are closed vocabularies: an overflow is refused, never collapsed to slot 0. */
  function fsmSlot(fsmState: string): number {
    const existing = fsmIndex.get(fsmState);
    if (existing !== undefined) return existing;
    if (fsmStates.length >= config.maxFsmStates) {
      fail(
        'IDENTITY_CAPACITY',
        `The FSM table is full at ${config.maxFsmStates}`,
        'frame.vehicles.fsmState',
      );
    }
    fsmStates.push(fsmState);
    fsmIndex.set(fsmState, fsmStates.length - 1);
    return fsmStates.length - 1;
  }

  function rideSlot(rideId: string | null): number {
    if (rideId === null) return 0;
    const existing = rideIndex.get(rideId);
    if (existing !== undefined) return existing;
    if (rides.length >= config.maxRides) {
      fail(
        'IDENTITY_CAPACITY',
        `The ride table is full at ${config.maxRides}`,
        'frame.vehicles.rideId',
      );
    }
    rides.push(rideId);
    rideIndex.set(rideId, rides.length - 1);
    return rides.length - 1;
  }

  function signalSlot(signalId: string): number {
    const existing = signalSlots.get(signalId);
    if (existing !== undefined) return existing;
    if (signalsTable.length >= config.maxSignals) {
      fail('ENTITY_CAPACITY', `The signal table is full at ${config.maxSignals}`, 'frame.signals');
    }
    const slot = signalsTable.length;
    signalsTable.push({ signalId });
    signalSlots.set(signalId, slot);
    return slot;
  }

  function pushLifecycle(fact: WorldReplayLifecycleFact): void {
    if (lifecycle.length >= config.maxLifecycleFacts) {
      lifecycle.shift();
      counters.lifecycleEvicted += 1;
    }
    lifecycle.push(fact);
    if (fact.kind === 'CREATED') {
      if (fact.inferred) counters.inferredCreated += 1;
      else counters.entitiesCreated += 1;
      knownEntities.add(fact.entityId);
    } else {
      if (fact.inferred) counters.inferredRemoved += 1;
      else counters.entitiesRemoved += 1;
      knownEntities.delete(fact.entityId);
    }
  }

  function ringAt(index: number): RingSample {
    const sample = ring[(ringStart + index) % config.maxSamples];
    if (sample === undefined) throw new RecorderError('INVALID_CHUNK', 'Ring index gap', 'ring');
    return sample;
  }

  /** Rows inside a still-open pin window are pinned; they are the evidence a chunk depends on. */
  function isPinnedTick(tick: number): boolean {
    for (const plan of incidents.values()) {
      if (!plan.sealed && tick >= plan.fromTick && tick <= plan.toTick) return true;
    }
    return false;
  }

  /**
   * Evicts the oldest row that no open incident pins. The ring is ordered by tick, so scanning from
   * the oldest end is deterministic. Returns false only when every retained row is pinned, in which
   * case the caller must drop the incoming row instead of destroying evidence.
   */
  function evictOldestEvictable(): boolean {
    for (let index = 0; index < ringLength; index += 1) {
      const slot = (ringStart + index) % config.maxSamples;
      const sample = ring[slot];
      if (sample === undefined) continue;
      if (isPinnedTick(sample.tick)) continue;
      ring[slot] = undefined;
      if (index === 0) {
        ringStart = (ringStart + 1) % config.maxSamples;
      } else {
        /* Shift the prefix above the hole so the ring stays contiguous from `ringStart`. */
        for (let move = index; move > 0; move -= 1) {
          const from = (ringStart + move - 1) % config.maxSamples;
          const to = (ringStart + move) % config.maxSamples;
          ring[to] = ring[from];
        }
        ring[ringStart] = undefined;
        ringStart = (ringStart + 1) % config.maxSamples;
      }
      ringLength -= 1;
      ringBytes -= sample.bytes;
      counters.samplesEvicted += 1;
      for (const plan of incidents.values()) {
        if (!plan.sealed && sample.tick >= plan.fromTick && sample.tick <= plan.toTick) {
          plan.pressureLoss = true;
          counters.samplesDroppedPressure += 1;
        }
      }
      return true;
    }
    return false;
  }

  /** Returns false when the row could not be retained; nothing is ever silently lost. */
  function pushSample(sample: RingSample): boolean {
    while (ringLength >= config.maxSamples || ringBytes + sample.bytes > config.ringByteCap) {
      if (ringLength === 0) break;
      if (!evictOldestEvictable()) {
        counters.samplesDroppedPressure += 1;
        for (const plan of incidents.values()) {
          if (!plan.sealed && sample.tick >= plan.fromTick && sample.tick <= plan.toTick) {
            plan.pressureLoss = true;
          }
        }
        return false;
      }
    }
    ring[(ringStart + ringLength) % config.maxSamples] = sample;
    ringLength += 1;
    ringBytes += sample.bytes;
    notePeak();
    return true;
  }

  function rateAllow(bytes: number, tick: number): boolean {
    const second = Math.floor(tick / config.tickHz);
    if (second !== rateSecond) {
      if (rateBytes > peakRateBytes) peakRateBytes = rateBytes;
      rateSecond = second;
      rateBytes = 0;
    }
    if (rateBytes + bytes > config.sampleRateBytesPerSecond) return false;
    rateBytes += bytes;
    return true;
  }

  function latestSampleAt(tick: number): RingSample | null {
    for (let index = ringLength - 1; index >= 0; index -= 1) {
      const sample = ringAt(index);
      if (sample.tick <= tick) return sample;
    }
    return null;
  }

  /** Nearest retained sample at or after the tick, used for the post-incident window edges. */
  function nearestSampleAt(tick: number): RingSample | null {
    const before = latestSampleAt(tick);
    if (before !== null) return before;
    for (let index = 0; index < ringLength; index += 1) {
      const sample = ringAt(index);
      if (sample.tick >= tick) return sample;
    }
    return null;
  }

  function incidentBudgetAvailable(tick: number): boolean {
    const windowStart = tick - config.tickHz * 60;
    let recent = 0;
    for (const candidate of incidentTicks)
      if (candidate > windowStart && candidate <= tick) recent += 1;
    return recent < config.maxIncidentsPerMinute;
  }

  /**
   * Registers a pin window around one collision. The mode/camera classification is read from the
   * nearest retained sample and the sampled tick is declared, so a replay never presents a guess as
   * the incident tick. The collision fact is owned by the plan, so event eviction cannot unpin it.
   */
  function registerIncident(event: WorldReplayEventFact): 'PINNED' | 'RATE_LIMITED' {
    const fromTick = Math.max(0, event.tick - config.pinBeforeTicks);
    const toTick = event.tick + config.pinAfterTicks;
    if (!incidentBudgetAvailable(event.tick)) {
      counters.incidentsRateLimited += 1;
      incidentTicks.push(event.tick);
      return 'RATE_LIMITED';
    }
    const sample = nearestSampleAt(event.tick);
    const modes: (WorldControlMode | 'UNKNOWN')[] = [];
    const visibility: boolean[] = [];
    for (const entityId of event.entityIds) {
      let mode: WorldControlMode | 'UNKNOWN' = 'UNKNOWN';
      let inCamera: boolean | null = null;
      if (sample !== null) {
        for (const vehicle of sample.vehicles) {
          if (entities[vehicle.slot]?.entityId === entityId) {
            mode = replayControlModeCodes[vehicle.mode] ?? 'UNKNOWN';
            inCamera = vehicle.inCamera;
            break;
          }
        }
      }
      modes.push(mode);
      if (inCamera !== null) visibility.push(inCamera);
    }
    const knownModes = modes.filter((mode) => mode !== 'UNKNOWN');
    const autoOnly = knownModes.length > 0 && knownModes.every((mode) => mode === 'AUTO');
    let visibilityLabel: ReplayIncidentVisibility = 'UNKNOWN';
    if (visibility.length > 0) {
      if (visibility.every((value) => !value)) visibilityLabel = 'OUTSIDE_CAMERA';
      else if (visibility.every((value) => value)) visibilityLabel = 'IN_CAMERA';
      else visibilityLabel = 'MIXED';
    }
    const incidentId = `${sessionId}:incident:${event.eventId}`;
    incidents.set(incidentId, {
      incidentId,
      fact: event,
      eventId: event.eventId,
      tick: event.tick,
      entityIds: Object.freeze([...event.entityIds]),
      fromTick,
      toTick,
      controlModes: Object.freeze(modes),
      visibility: visibilityLabel,
      autoOnly,
      outsideCamera: visibilityLabel === 'OUTSIDE_CAMERA',
      classifiedFromTick: sample === null ? null : sample.tick,
      pressureLoss: false,
      sealed: false,
      sealTick: null,
      chunkStatus: null,
    });
    counters.incidentsRegistered += 1;
    incidentTicks.push(event.tick);
    return 'PINNED';
  }

  function recordEvent(event: SimulationEvent): WorldEventResult {
    if (state !== 'RECORDING') {
      counters.eventsRejected += 1;
      return Object.freeze({
        status: 'REJECTED',
        eventId: null,
        tick: null,
        code: 'STATE_NOT_RECORDING',
        incidentId: null,
        incident: null,
        detail: `The recorder is ${state}`,
      });
    }
    let fact: WorldReplayEventFact;
    try {
      fact = readEventFact(event);
    } catch (error) {
      counters.eventsRejected += 1;
      const failure = error instanceof RecorderError ? error : null;
      return Object.freeze({
        status: 'REJECTED',
        eventId: null,
        tick: null,
        code: failure === null ? 'INVALID_EVENT' : eventCode(failure.code),
        incidentId: null,
        incident: null,
        detail: failure?.message ?? 'The event could not be read',
      });
    }
    if (fact.sessionId !== sessionId || fact.worldEpoch !== worldEpoch) {
      counters.eventsRejected += 1;
      return Object.freeze({
        status: 'REJECTED',
        eventId: fact.eventId,
        tick: fact.tick,
        code: 'FOREIGN_EVENT',
        incidentId: null,
        incident: null,
        detail: `Expected ${sessionId}/${worldEpoch}, got ${fact.sessionId}/${fact.worldEpoch}`,
      });
    }
    if (eventIds.has(fact.eventId)) {
      counters.eventsDuplicate += 1;
      return Object.freeze({
        status: 'DUPLICATE',
        eventId: fact.eventId,
        tick: fact.tick,
        code: null,
        incidentId: null,
        incident: null,
        detail: 'The event identity was already recorded',
      });
    }
    const bytes = WORLD_REPLAY_CHARGE_BYTES.event;
    while (
      (events.length >= config.maxEvents || eventBytes + bytes > config.eventByteCap) &&
      events.length > 0
    ) {
      const removed = events.shift();
      if (removed !== undefined) eventIds.delete(removed.eventId);
      eventBytes -= bytes;
      counters.eventsEvicted += 1;
    }
    events.push(fact);
    eventIds.add(fact.eventId);
    eventBytes += bytes;
    counters.eventsRecorded += 1;
    notePeak();
    if (worldRecorderDiscontinuityEventTypes.includes(fact.type as WorldReplayEventType)) {
      lastDiscontinuityTick = fact.tick;
    }
    const isIncident = worldRecorderIncidentEventTypes.includes(fact.type as WorldReplayEventType);
    const incident = isIncident ? registerIncident(fact) : null;
    return Object.freeze({
      status: 'RECORDED',
      eventId: fact.eventId,
      tick: fact.tick,
      code: null,
      incidentId: isIncident ? `${sessionId}:incident:${fact.eventId}` : null,
      incident,
      detail: isIncident ? 'The event pinned a replay window' : null,
    });
  }

  function recordCheckpoint(input: {
    readonly checkpointId: string;
    readonly snapshot: WorldSnapshot;
  }): boolean {
    if (state !== 'RECORDING') return false;
    const read = readWorldSnapshot(input.snapshot);
    if (read.status === 'REJECTED') return false;
    let checkpointId: string;
    try {
      checkpointId = readId(input.checkpointId, 'checkpoint.checkpointId');
    } catch {
      return false;
    }
    const existing = checkpoints.findIndex((entry) => entry.tick === read.snapshot.tick);
    if (existing >= 0) {
      checkpoints[existing] = Object.freeze({
        checkpointId,
        tick: read.snapshot.tick,
        checksum: read.checksum,
        snapshot: read.snapshot,
      });
    } else {
      checkpoints.push(
        Object.freeze({
          checkpointId,
          tick: read.snapshot.tick,
          checksum: read.checksum,
          snapshot: read.snapshot,
        }),
      );
      checkpoints.sort((a, b) => a.tick - b.tick);
      while (checkpoints.length > config.maxCheckpoints) {
        checkpoints.shift();
      }
    }
    notePeak();
    return true;
  }

  function anchorFor(startTick: number): {
    readonly reference: WorldReplayCheckpointReference | null;
    readonly snapshot: WorldSnapshot | null;
    readonly ageTicks: number | null;
  } {
    let chosen: CheckpointAnchor | null = null;
    for (const anchor of checkpoints) if (anchor.tick <= startTick) chosen = anchor;
    if (chosen === null) return Object.freeze({ reference: null, snapshot: null, ageTicks: null });
    return Object.freeze({
      reference: Object.freeze({
        checkpointId: chosen.checkpointId,
        tick: chosen.tick,
        checksum: chosen.checksum,
      }),
      snapshot: chosen.snapshot,
      ageTicks: startTick - chosen.tick,
    });
  }

  function buildSample(frame: ReplayTickFrame, removedThisTick: ReadonlySet<string>): RingSample {
    const seen = new Set<string>();
    const vehicles: RingVehicle[] = [];
    for (const vehicle of frame.vehicles) {
      const slot = entitySlot(vehicle.entityId, vehicle.vehicleClass, vehicle.handle);
      const fsm = fsmSlot(vehicle.fsmState);
      vehicles.push(
        Object.freeze({
          slot,
          xCm: quantize(vehicle.position.x, 1 / WORLD_REPLAY_QUANTIZATION.positionM),
          yCm: quantize(vehicle.position.y, 1 / WORLD_REPLAY_QUANTIZATION.positionM),
          zCm: quantize(vehicle.position.z, 1 / WORLD_REPLAY_QUANTIZATION.positionM),
          qx: quantize(vehicle.rotation.x, 1 / WORLD_REPLAY_QUANTIZATION.rotationUnit),
          qy: quantize(vehicle.rotation.y, 1 / WORLD_REPLAY_QUANTIZATION.rotationUnit),
          qz: quantize(vehicle.rotation.z, 1 / WORLD_REPLAY_QUANTIZATION.rotationUnit),
          qw: quantize(vehicle.rotation.w, 1 / WORLD_REPLAY_QUANTIZATION.rotationUnit),
          mode: modeCode(vehicle.controlMode),
          fsm,
          ride: rideSlot(vehicle.rideId),
          inCamera: vehicle.inCamera,
        }),
      );
      seen.add(vehicle.entityId);
      /* An entity removed on this very tick keeps its exact removal fact; it is not re-created. */
      if (!knownEntities.has(vehicle.entityId) && !removedThisTick.has(vehicle.entityId)) {
        pushLifecycle(
          Object.freeze({
            tick: frame.tick,
            kind: 'CREATED',
            entityId: vehicle.entityId,
            vehicleClass: vehicle.vehicleClass,
            inferred: true,
          }),
        );
      }
    }
    for (const entityId of previousSampleEntities) {
      if (seen.has(entityId)) continue;
      const identity = entities[entitySlots.get(entityId) ?? -1];
      if (identity === undefined) continue;
      /* An entity that a lifecycle fact already removed is not removed a second time by inference. */
      if (!knownEntities.has(entityId)) continue;
      pushLifecycle(
        Object.freeze({
          tick: frame.tick,
          kind: 'REMOVED',
          entityId,
          vehicleClass: identity.vehicleClass,
          inferred: true,
        }),
      );
    }
    previousSampleEntities.clear();
    for (const entityId of seen) previousSampleEntities.add(entityId);
    const signals: RingSignal[] = [];
    for (const signal of frame.signals) {
      signals.push(
        Object.freeze({
          slot: signalSlot(signal.signalId),
          phase: phaseCode(signal.phase),
          remainingTicks: signal.remainingTicks,
        }),
      );
    }
    return Object.freeze({
      tick: frame.tick,
      vehicles: Object.freeze(vehicles),
      signals: Object.freeze(signals),
      bytes: sampleCharge(vehicles.length, signals.length),
    });
  }

  function recordTick(frameInput: ReplayTickFrame): WorldTickResult {
    if (state !== 'RECORDING') {
      counters.ticksRejected += 1;
      return Object.freeze({
        status: 'REJECTED',
        tick: null,
        sampled: false,
        sampleBytes: 0,
        vehicles: 0,
        code: 'STATE_NOT_RECORDING',
        detail: `The recorder is ${state}`,
      });
    }
    let frame: ReplayTickFrame;
    try {
      frame = readFrame(frameInput);
      if (lastTick !== null && frame.tick <= lastTick) {
        fail('TICK_ORDER', `Tick ${frame.tick} is not after ${lastTick}`, 'frame.tick');
      }
    } catch (error) {
      counters.ticksRejected += 1;
      const failure = error instanceof RecorderError ? error : null;
      return Object.freeze({
        status: 'REJECTED',
        tick: failure === null ? null : safeTick(frameInput),
        sampled: false,
        sampleBytes: 0,
        vehicles: 0,
        code: failure?.code ?? 'INVALID_FRAME',
        detail: failure?.message ?? 'The tick frame could not be read',
      });
    }
    /* Lifecycle facts are exact even when the transforms of this tick are not sampled. */
    const removedThisTick = new Set<string>();
    try {
      for (const fact of frame.created ?? []) {
        entitySlot(fact.entityId, fact.vehicleClass, fact.handle ?? 0);
        if (!knownEntities.has(fact.entityId)) {
          pushLifecycle(
            Object.freeze({
              tick: frame.tick,
              kind: 'CREATED',
              entityId: fact.entityId,
              vehicleClass: fact.vehicleClass,
              inferred: false,
            }),
          );
        }
      }
      for (const fact of frame.removed ?? []) {
        entitySlot(fact.entityId, fact.vehicleClass, fact.handle ?? 0);
        if (knownEntities.has(fact.entityId)) {
          removedThisTick.add(fact.entityId);
          pushLifecycle(
            Object.freeze({
              tick: frame.tick,
              kind: 'REMOVED',
              entityId: fact.entityId,
              vehicleClass: fact.vehicleClass,
              inferred: false,
            }),
          );
        }
      }
    } catch (error) {
      counters.ticksRejected += 1;
      const failure = error instanceof RecorderError ? error : null;
      return Object.freeze({
        status: 'REJECTED',
        tick: frame.tick,
        sampled: false,
        sampleBytes: 0,
        vehicles: frame.vehicles.length,
        code: failure?.code ?? 'INVALID_FRAME',
        detail: failure?.message ?? 'The lifecycle facts could not be read',
      });
    }

    /* Only a frame that was read, ordered and admitted advances the recorder's clock. */
    counters.ticksAccepted += 1;
    if (firstTick === null) firstTick = frame.tick;
    lastTick = frame.tick;

    if (frame.tick % config.cadenceTicks !== 0) {
      counters.ticksCadenceSkipped += 1;
      return Object.freeze({
        status: 'CADENCE_SKIPPED',
        tick: frame.tick,
        sampled: false,
        sampleBytes: 0,
        vehicles: frame.vehicles.length,
        code: null,
        detail: `Transforms are sampled every ${config.cadenceTicks} ticks; lifecycle and events keep the exact tick`,
      });
    }

    let sample: RingSample;
    try {
      const bytes = sampleCharge(frame.vehicles.length, frame.signals.length);
      if (!rateAllow(bytes, frame.tick)) {
        counters.samplesDroppedRate += 1;
        return Object.freeze({
          status: 'RATE_LIMITED',
          tick: frame.tick,
          sampled: false,
          sampleBytes: bytes,
          vehicles: frame.vehicles.length,
          code: null,
          detail: `The ${config.sampleRateBytesPerSecond} bytes/second cap refused this row`,
        });
      }
      sample = buildSample(frame, removedThisTick);
    } catch (error) {
      counters.ticksRejected += 1;
      const failure = error instanceof RecorderError ? error : null;
      if (failure?.code === 'ENTITY_CAPACITY' || failure?.code === 'IDENTITY_CAPACITY') {
        counters.samplesDroppedEntityCapacity += 1;
      }
      return Object.freeze({
        status: 'REJECTED',
        tick: frame.tick,
        sampled: false,
        sampleBytes: 0,
        vehicles: frame.vehicles.length,
        code: failure?.code ?? 'INVALID_FRAME',
        detail: failure?.message ?? 'The sample could not be built',
      });
    }
    if (!pushSample(sample)) {
      /* Every retained row belongs to an open pin window: the row is refused, never evidence lost. */
      return Object.freeze({
        status: 'PRESSURE_DROPPED',
        tick: frame.tick,
        sampled: false,
        sampleBytes: sample.bytes,
        vehicles: sample.vehicles.length,
        code: null,
        detail: 'The ring is entirely pinned by open incident windows',
      });
    }
    counters.samplesRecorded += 1;
    sampledVehicleRows += sample.vehicles.length;
    for (const vehicle of sample.vehicles) {
      if (!vehicle.inCamera) outOfCameraRows += 1;
      if (vehicle.mode === modeCode('AUTO')) autoRows += 1;
    }
    if (firstSampleTick === null) firstSampleTick = frame.tick;
    lastSampleTick = frame.tick;
    sealReadyIncidents();
    return Object.freeze({
      status: 'SAMPLED',
      tick: frame.tick,
      sampled: true,
      sampleBytes: sample.bytes,
      vehicles: sample.vehicles.length,
      code: null,
      detail: null,
    });
  }

  /**
   * Exact coverage of the declared sample cadence inside `[fromTick, toTick]`. Both windows and gap
   * lists use this one enumeration, so a declared `COMPLETE` window and an empty gap list can never
   * disagree. Cadence slots outside the observed capture range count as missing and are declared.
   */
  function windowTicks(
    fromTick: number,
    toTick: number,
  ): {
    readonly expected: number;
    readonly present: readonly number[];
  } {
    const present: number[] = [];
    if (toTick < fromTick) return Object.freeze({ expected: 0, present: Object.freeze([]) });
    const alignedStart = Math.ceil(fromTick / config.cadenceTicks) * config.cadenceTicks;
    const alignedEnd = Math.floor(toTick / config.cadenceTicks) * config.cadenceTicks;
    const expected =
      alignedEnd < alignedStart ? 0 : (alignedEnd - alignedStart) / config.cadenceTicks + 1;
    for (let index = 0; index < ringLength; index += 1) {
      const tick = ringAt(index).tick;
      if (tick < fromTick || tick > toTick) continue;
      present.push(tick);
    }
    return Object.freeze({ expected, present: Object.freeze(present) });
  }

  function coverageOf(fromTick: number, toTick: number): WorldReplayWindowCoverage {
    const window = windowTicks(fromTick, toTick);
    const recorded = window.present.length;
    return Object.freeze({
      requestedTicks: window.expected * config.cadenceTicks,
      recordedTicks: recorded * config.cadenceTicks,
      coverage: window.expected === 0 ? 1 : Number((recorded / window.expected).toFixed(4)),
      startTick: fromTick,
      endTick: toTick,
    });
  }

  function sampleGaps(
    fromTick: number,
    toTick: number,
  ): {
    readonly gaps: readonly WorldReplayGap[];
    readonly omitted: number;
    readonly dropped: number;
    readonly first: number | null;
    readonly last: number | null;
  } {
    const window = windowTicks(fromTick, toTick);
    const present = new Set(window.present);
    const alignedStart = Math.ceil(fromTick / config.cadenceTicks) * config.cadenceTicks;
    const alignedEnd = Math.floor(toTick / config.cadenceTicks) * config.cadenceTicks;
    const gaps: WorldReplayGap[] = [];
    let dropped = 0;
    let open: { fromTick: number; toTick: number } | null = null;
    for (let tick = alignedStart; tick <= alignedEnd; tick += config.cadenceTicks) {
      if (present.has(tick)) {
        if (open !== null) {
          gaps.push(Object.freeze({ ...open }));
          open = null;
        }
      } else {
        dropped += 1;
        if (open === null) open = { fromTick: tick, toTick: tick };
        else open.toTick = tick;
      }
    }
    if (open !== null) gaps.push(Object.freeze({ ...open }));
    const omitted = Math.max(0, gaps.length - config.maxSampleGaps);
    const first = window.present.length === 0 ? null : Math.min(...window.present);
    const last = window.present.length === 0 ? null : Math.max(...window.present);
    return Object.freeze({
      gaps: Object.freeze(gaps.slice(0, config.maxSampleGaps)),
      omitted,
      dropped,
      first,
      last,
    });
  }

  function assembleChunk(
    plan: IncidentPlan,
    sealTick: number,
    fromTick: number,
    toTick: number,
    reasons: WorldReplayPartialReason[],
  ): {
    payload: Record<string, unknown>;
    samples: WorldReplaySample[];
    events: WorldReplayEventFact[];
  } {
    /* The anchor is chosen for the window that is really stored, after any late start or trim. */
    const anchor = anchorFor(fromTick);
    const samples: WorldReplaySample[] = [];
    for (let index = 0; index < ringLength; index += 1) {
      const sample = ringAt(index);
      if (sample.tick < fromTick || sample.tick > toTick) continue;
      samples.push(
        Object.freeze({
          tick: sample.tick,
          vehicles: Object.freeze(
            sample.vehicles.map((vehicle) =>
              Object.freeze([
                vehicle.slot,
                vehicle.xCm,
                vehicle.yCm,
                vehicle.zCm,
                vehicle.qx,
                vehicle.qy,
                vehicle.qz,
                vehicle.qw,
                vehicle.mode,
                vehicle.fsm,
                vehicle.ride,
                vehicle.inCamera ? 1 : 0,
              ]),
            ),
          ),
          signals: Object.freeze(
            sample.signals.map((signal) =>
              Object.freeze([signal.slot, signal.phase, signal.remainingTicks]),
            ),
          ),
        }),
      );
    }
    const windowEvents: WorldReplayEventFact[] = [];
    for (const event of events) {
      if (event.tick < fromTick || event.tick > toTick) continue;
      windowEvents.push(event);
    }
    /* The pinned collision owns its own fact, so event eviction can never drop the evidence. */
    if (!windowEvents.some((event) => event.eventId === plan.fact.eventId)) {
      windowEvents.push(plan.fact);
      windowEvents.sort((a, b) => a.tick - b.tick || (a.eventId < b.eventId ? -1 : 1));
    }
    const omittedEvents = Math.max(0, windowEvents.length - config.maxEventsPerChunk);
    const keptEvents = windowEvents.slice(0, config.maxEventsPerChunk);
    if (omittedEvents > 0 && !reasons.includes('EVENT_LIMIT')) reasons.push('EVENT_LIMIT');
    if (
      lastDiscontinuityTick !== null &&
      lastDiscontinuityTick >= fromTick &&
      lastDiscontinuityTick <= toTick
    ) {
      if (!reasons.includes('WORLD_DISCONTINUITY')) reasons.push('WORLD_DISCONTINUITY');
    }
    const coverageBefore = coverageOf(fromTick, plan.tick);
    const coverageAfter = coverageOf(plan.tick, toTick);
    const gaps = sampleGaps(fromTick, toTick);
    if (gaps.dropped > 0) {
      if (plan.pressureLoss) {
        if (!reasons.includes('PRESSURED_ROWS_EVICTED')) reasons.push('PRESSURED_ROWS_EVICTED');
      } else if (!reasons.includes('RATE_LIMITED_ROWS')) {
        /* Rows can only be missing because the rate cap refused them, the ring evicted them under
         * pressure, or the capture started late; the recorder never reorders or hides a gap. */
        reasons.push('RATE_LIMITED_ROWS');
      }
    }
    const lifecycleFacts = lifecycle.filter((fact) => fact.tick >= fromTick && fact.tick <= toTick);
    const created = lifecycleFacts.filter((fact) => fact.kind === 'CREATED');
    const removed = lifecycleFacts.filter((fact) => fact.kind === 'REMOVED');
    const distinctSlots = new Set<number>();
    let outOfCameraVehicles = 0;
    for (const sample of samples) {
      for (const vehicle of sample.vehicles) {
        distinctSlots.add(vehicle[0] ?? -1);
        if (vehicle[11] === 0) outOfCameraVehicles += 1;
      }
    }
    const recordedVehicles = distinctSlots.size;
    const anchorState =
      anchor.reference === null
        ? 'MISSING'
        : anchor.ageTicks !== null && anchor.ageTicks > config.anchorMaxAgeTicks
          ? 'STALE'
          : 'PRESENT';
    if (anchorState === 'MISSING' && !reasons.includes('CHECKPOINT_MISSING')) {
      reasons.push('CHECKPOINT_MISSING');
    }
    if (anchorState === 'STALE' && !reasons.includes('CHECKPOINT_STALE')) {
      reasons.push('CHECKPOINT_STALE');
    }
    /* Every expected cadence slot of the requested window must be present for a COMPLETE claim. */
    const expectedTicks = coverageBefore.requestedTicks + coverageAfter.requestedTicks;
    const complete =
      reasons.length === 0 &&
      gaps.dropped === 0 &&
      coverageBefore.recordedTicks === coverageBefore.requestedTicks &&
      coverageAfter.recordedTicks === coverageAfter.requestedTicks &&
      expectedTicks > 0;
    const completeness: WorldReplayCompleteness = Object.freeze({
      status: complete ? 'COMPLETE' : 'PARTIAL',
      declaredPartial: !complete,
      reasons: Object.freeze([...new Set(reasons)].sort()),
      before: coverageBefore,
      after: coverageAfter,
      droppedSamples: gaps.dropped,
      sampleGaps: gaps.gaps,
      omittedGaps: gaps.omitted,
      anchor: anchorState,
      anchorAgeTicks: anchor.ageTicks,
    });
    const incident: WorldReplayIncident = Object.freeze({
      incidentId: plan.incidentId,
      kind: 'COLLISION',
      eventId: plan.eventId,
      tick: plan.tick,
      entityIds: plan.entityIds,
      controlModes: plan.controlModes,
      autoOnly: plan.autoOnly,
      visibility: plan.visibility,
      outsideCamera: plan.outsideCamera,
      classifiedFromTick: plan.classifiedFromTick,
      pinnedFromTick: plan.fromTick,
      pinnedToTick: plan.toTick,
    });
    const tables: WorldReplayTables = Object.freeze({
      entities: Object.freeze(
        entities.map((identity, slot) =>
          Object.freeze({
            slot,
            entityId: identity.entityId,
            vehicleClass: identity.vehicleClass,
            handle: identity.handle,
          }),
        ),
      ),
      fsmStates: Object.freeze([...fsmStates]),
      rides: Object.freeze([...rides]),
      signals: Object.freeze(
        signalsTable.map((signal, slot) => Object.freeze({ slot, signalId: signal.signalId })),
      ),
      controlModes: replayControlModeCodes,
      phases: replayPhaseCodes,
      vehicleClasses: replayVehicleClassCodes,
    });
    const sampling: WorldReplaySamplingDeclaration = Object.freeze({
      tickHz: config.tickHz,
      sampleHz: config.sampleHz,
      cadenceTicks: config.cadenceTicks,
      interpolation: 'LINEAR',
      rotationInterpolation: 'NLERP',
      interpolationScope: 'TRANSFORMS',
      alignmentTick: 0,
      eventTicksExact: true,
      observedTicksOnly: true,
      physicsFidelity: false,
      fields: Object.freeze([
        'position',
        'rotation',
        'controlMode',
        'fsmState',
        'rideId',
        'signalPhase',
        'inCamera',
      ]),
      notSampled: Object.freeze(['linearVelocity', 'angularVelocity', 'controllerMemory']),
      quantization: WORLD_REPLAY_QUANTIZATION,
    });
    const payload: Record<string, unknown> = {
      chunkVersion: WORLD_REPLAY_CHUNK_VERSION,
      integrity: WORLD_REPLAY_INTEGRITY,
      chunkId: plan.incidentId,
      sequence: sequence + 1,
      sessionId,
      worldEpoch,
      versions,
      createdAt: now(),
      startTick: fromTick,
      endTick: toTick,
      incident,
      pinned: true,
      checkpoint: anchor.reference,
      anchor: anchor.snapshot,
      sampling,
      completeness,
      camera: Object.freeze({
        filterApplied: false,
        recordedVehicles,
        outOfCameraVehicles,
      }),
      learning: Object.freeze({
        producesArtifacts: false,
        eligible: false,
        jobs: 0,
        observations: 0,
        profileVersions: 0,
      }),
      tables,
      lifecycle: Object.freeze({
        created: Object.freeze(created),
        removed: Object.freeze(removed),
      }),
      samples: Object.freeze(samples),
      events: Object.freeze(keptEvents),
      sealTick,
    };
    return { payload, samples, events: keptEvents };
  }

  /** Byte size of the canonical payload, which is exactly what the chunk stores and caps. */
  function canonicalBytes(payload: Record<string, unknown>): number | null {
    const canonical = canonicalizeJson(payload, { maxDepth: 24 });
    return canonical.status === 'REJECTED' ? null : byteLength(canonical.text);
  }

  function sealPlan(plan: IncidentPlan, sealTick: number): WorldSealResult {
    const reasons: WorldReplayPartialReason[] = [];
    if (plan.fromTick < (firstTick ?? plan.tick)) reasons.push('CAPTURE_STARTED_LATE');
    if (plan.pressureLoss) reasons.push('PRESSURED_ROWS_EVICTED');
    /* A seal that lands inside the requested post-incident window is a declared partial clip. */
    if (sealTick < plan.toTick) reasons.push('CAPTURE_FINALIZED_EARLY');
    let fromTick = plan.fromTick;
    const toTick = Math.min(plan.toTick, Math.max(sealTick, plan.tick));
    if (firstSampleTick !== null && fromTick < firstSampleTick) {
      fromTick = firstSampleTick;
      /* The pin asked for rows the capture never observed, so the clip is declared partial. */
      if (!reasons.includes('CAPTURE_STARTED_LATE')) reasons.push('CAPTURE_STARTED_LATE');
    }
    if (firstSampleTick !== null && toTick < firstSampleTick) {
      reasons.push('SEALED_BEFORE_WINDOW_COMPLETE');
    }

    let assembled = assembleChunk(plan, sealTick, fromTick, toTick, [...reasons]);
    let size = canonicalBytes(assembled.payload);
    let trimmingAttempts = 0;
    /* The byte cap trims the oldest rows and declares it; a chunk is never silently oversized. */
    while (size !== null && size > config.chunkByteCap && trimmingAttempts < 512) {
      const next = fromTick + config.cadenceTicks;
      if (next > plan.tick) break;
      fromTick = next;
      trimmingAttempts += 1;
      const trimmedReasons: WorldReplayPartialReason[] = [
        ...new Set<WorldReplayPartialReason>([...reasons, 'CHUNK_BYTE_CAP']),
      ];
      assembled = assembleChunk(plan, sealTick, fromTick, toTick, trimmedReasons);
      size = canonicalBytes(assembled.payload);
    }
    if (size === null || size > config.chunkByteCap) {
      counters.chunksTooLarge += 1;
      plan.sealed = true;
      plan.sealTick = sealTick;
      counters.incidentsSealed += 1;
      return Object.freeze({
        status: 'REJECTED' as const,
        chunk: null,
        rejection: Object.freeze({
          code: 'CHUNK_TOO_LARGE' as const,
          message:
            size === null
              ? 'The incident window is not canonical JSON'
              : `The incident window is ${size} bytes, above the ${config.chunkByteCap} byte cap`,
          path: 'chunk.samples',
        }),
      });
    }
    const canonical = canonicalizeJson(assembled.payload, { maxDepth: 24 });
    if (canonical.status === 'REJECTED') {
      counters.chunksTooLarge += 1;
      plan.sealed = true;
      plan.sealTick = sealTick;
      counters.incidentsSealed += 1;
      return Object.freeze({
        status: 'REJECTED' as const,
        chunk: null,
        rejection: Object.freeze({
          code: 'CHUNK_TOO_LARGE' as const,
          message: canonical.rejection.message,
          path: canonical.rejection.path,
        }),
      });
    }
    const checksum = sha256Hex(canonical.text);
    sequence += 1;
    const chunk: WorldReplayChunk = Object.freeze({
      ...(assembled.payload as unknown as Omit<WorldReplayChunk, 'bytes' | 'checksum'>),
      bytes: size,
      checksum,
    });
    plan.sealed = true;
    plan.sealTick = sealTick;
    plan.chunkStatus = chunk.completeness.status;
    counters.incidentsSealed += 1;
    retainedChunks.push(
      Object.freeze({
        sequence: chunk.sequence,
        chunkId: chunk.chunkId,
        incidentId: plan.incidentId,
        startTick: chunk.startTick,
        endTick: chunk.endTick,
        bytes: chunk.bytes,
        status: chunk.completeness.status,
        chunk,
      }),
    );
    sealedChunkBytes += chunk.bytes;
    notePeak();
    enforceChunkCap();
    return Object.freeze({
      status:
        chunk.completeness.status === 'COMPLETE'
          ? ('SEALED' as const)
          : ('SEALED_PARTIAL' as const),
      chunk,
    });
  }

  function enforceChunkCap(): void {
    while (retainedChunks.length > config.maxPinnedChunks) {
      const evicted = retainedChunks.shift();
      if (evicted === undefined) break;
      sealedChunkBytes -= evicted.bytes;
      counters.chunksEvicted += 1;
    }
    while (sealedChunkBytes > config.pinnedChunkBytes && retainedChunks.length > 0) {
      const evicted = retainedChunks.shift();
      if (evicted === undefined) break;
      sealedChunkBytes -= evicted.bytes;
      counters.chunksEvicted += 1;
    }
    if (sealedChunkBytes < 0) sealedChunkBytes = 0;
  }

  function sealReadyIncidents(): readonly string[] {
    if (lastTick === null) return Object.freeze([]);
    const sealed: string[] = [];
    for (const plan of incidents.values()) {
      if (plan.sealed) continue;
      if (lastTick < plan.toTick) continue;
      const result = sealPlan(plan, plan.toTick);
      if (result.status !== 'REJECTED') sealed.push(plan.incidentId);
    }
    return Object.freeze(sealed);
  }

  function sealIncident(incidentId: string, sealTick?: number): WorldSealResult {
    const plan = incidents.get(incidentId);
    if (plan === undefined) {
      return Object.freeze({
        status: 'REJECTED' as const,
        chunk: null,
        rejection: Object.freeze({
          code: 'UNKNOWN_INCIDENT' as const,
          message: `No incident ${incidentId} was registered`,
          path: 'incident.incidentId',
        }),
      });
    }
    if (plan.sealed) {
      const retained = retainedChunks.find((entry) => entry.incidentId === incidentId);
      if (retained !== undefined) {
        return Object.freeze({ status: 'SEALED' as const, chunk: retained.chunk });
      }
      /* The rows behind a sealed clip may already be evicted; re-sealing would invent a new clip. */
      return Object.freeze({
        status: 'REJECTED' as const,
        chunk: null,
        rejection: Object.freeze({
          code: 'CHUNK_EVICTED' as const,
          message: `The chunk of ${incidentId} was already sealed and has been evicted from the RAM reserve`,
          path: 'incident.incidentId',
        }),
      });
    }
    const at = sealTick ?? lastTick;
    if (at === null) {
      return Object.freeze({
        status: 'REJECTED' as const,
        chunk: null,
        rejection: Object.freeze({
          code: 'SEAL_BEFORE_INCIDENT' as const,
          message: 'No tick was recorded yet',
          path: 'incident.tick',
        }),
      });
    }
    if (at < plan.tick) {
      return Object.freeze({
        status: 'REJECTED' as const,
        chunk: null,
        rejection: Object.freeze({
          code: 'SEAL_BEFORE_INCIDENT' as const,
          message: `Seal tick ${at} precedes the incident at ${plan.tick}`,
          path: 'incident.tick',
        }),
      });
    }
    return sealPlan(plan, at);
  }

  function takeChunk(chunkSequence: number): WorldReplayChunk | null {
    const index = retainedChunks.findIndex((entry) => entry.sequence === chunkSequence);
    if (index < 0) return null;
    const [entry] = retainedChunks.splice(index, 1);
    if (entry === undefined) return null;
    sealedChunkBytes -= entry.bytes;
    if (sealedChunkBytes < 0) sealedChunkBytes = 0;
    counters.chunksTransferred += 1;
    return entry.chunk;
  }

  function finalize(reason: WorldFinalizeReason): WorldFinalizeResult {
    if (state === 'DISPOSED') {
      return Object.freeze({
        status: 'FINALIZED' as const,
        reason,
        lastTick,
        sealed: Object.freeze([]),
        partial: Object.freeze([]),
        stats: getStats(),
      });
    }
    const sealed: string[] = [];
    const partial: string[] = [];
    if (state === 'RECORDING') {
      const available = lastTick ?? null;
      for (const plan of incidents.values()) {
        if (plan.sealed || available === null) continue;
        sealPlan(plan, available);
      }
      state = 'FINALIZED';
    }
    /* Report the real incident set: a repeated finalize tells the same truth, not an empty list. */
    for (const plan of incidents.values()) {
      if (plan.chunkStatus === null) continue;
      sealed.push(plan.incidentId);
      if (plan.chunkStatus === 'PARTIAL') partial.push(plan.incidentId);
    }
    return Object.freeze({
      status: 'FINALIZED' as const,
      reason,
      lastTick,
      sealed: Object.freeze(sealed),
      partial: Object.freeze(partial),
      stats: getStats(),
    });
  }

  function dispose(): void {
    if (disposed) return;
    if (state === 'RECORDING') finalize('DISPOSED');
    ring.fill(undefined);
    ringStart = 0;
    ringLength = 0;
    ringBytes = 0;
    events.length = 0;
    eventIds.clear();
    eventBytes = 0;
    lifecycle.length = 0;
    checkpoints.length = 0;
    retainedChunks.length = 0;
    sealedChunkBytes = 0;
    incidents.clear();
    state = 'DISPOSED';
    disposed = true;
  }

  function chunksPerMinuteNow(): number {
    if (lastTick === null) return 0;
    const windowStart = lastTick - config.tickHz * 60;
    let recent = 0;
    for (const tick of incidentTicks) if (tick > windowStart) recent += 1;
    return recent;
  }

  function getStats(): WorldRecorderStats {
    return Object.freeze({
      version: WORLD_RECORDER_VERSION,
      state,
      sessionId,
      worldEpoch,
      firstTick,
      lastTick,
      firstSampleTick,
      lastSampleTick,
      retainedSamples: ringLength,
      retainedSeconds:
        ringLength === 0
          ? 0
          : Number(((ringAt(ringLength - 1).tick - ringAt(0).tick) / config.tickHz).toFixed(2)),
      retainedVehicles: ringLength === 0 ? 0 : ringAt(0).vehicles.length,
      sampledVehicleRows,
      outOfCameraRows,
      autoRows,
      ticksAccepted: counters.ticksAccepted,
      ticksCadenceSkipped: counters.ticksCadenceSkipped,
      ticksRejected: counters.ticksRejected,
      samplesRecorded: counters.samplesRecorded,
      samplesDroppedRate: counters.samplesDroppedRate,
      samplesDroppedPressure: counters.samplesDroppedPressure,
      samplesEvicted: counters.samplesEvicted,
      samplesDroppedEntityCapacity: counters.samplesDroppedEntityCapacity,
      eventsRecorded: counters.eventsRecorded,
      eventsDuplicate: counters.eventsDuplicate,
      eventsEvicted: counters.eventsEvicted,
      eventsRejected: counters.eventsRejected,
      incidentsRegistered: counters.incidentsRegistered,
      incidentsRateLimited: counters.incidentsRateLimited,
      incidentsSealed: counters.incidentsSealed,
      incidentsOpen: [...incidents.values()].filter((plan) => !plan.sealed).length,
      chunksRetained: retainedChunks.length,
      chunksEvicted: counters.chunksEvicted,
      chunksTransferred: counters.chunksTransferred,
      chunksTooLarge: counters.chunksTooLarge,
      entitiesKnown: entities.length,
      entitiesCreated: counters.entitiesCreated,
      entitiesRemoved: counters.entitiesRemoved,
      inferredCreated: counters.inferredCreated,
      inferredRemoved: counters.inferredRemoved,
      lifecycleEvicted: counters.lifecycleEvicted,
      checkpointsKnown: checkpoints.length,
      ringBytes,
      eventBytes,
      sealedChunkBytes,
      chargedBytes: chargedBytes(),
      ramByteCap: config.ramByteCap,
      ringByteCap: config.ringByteCap,
      pinnedChunkBytesCap: config.pinnedChunkBytes,
      eventByteCap: config.eventByteCap,
      peakChargedBytes,
      lastRateBytes: rateBytes,
      peakRateBytes,
      sampleRateBytesPerSecond: config.sampleRateBytesPerSecond,
      chunksPerMinute: chunksPerMinuteNow(),
      maxChunksPerMinute: config.maxIncidentsPerMinute,
      learningArtifacts: 0,
      learningJobs: 0,
      learningObservations: 0,
      profileVersions: 0,
      learningEligible: false,
    });
  }

  return Object.freeze({
    version: WORLD_RECORDER_VERSION,
    recordTick,
    recordEvent,
    recordCheckpoint,
    sealIncident,
    sealReadyIncidents,
    takeChunk,
    listChunks(): readonly {
      readonly sequence: number;
      readonly chunkId: string;
      readonly incidentId: string;
      readonly startTick: number;
      readonly endTick: number;
      readonly bytes: number;
      readonly status: WorldReplayCompleteness['status'];
    }[] {
      return Object.freeze(
        retainedChunks.map((entry) =>
          Object.freeze({
            sequence: entry.sequence,
            chunkId: entry.chunkId,
            incidentId: entry.incidentId,
            startTick: entry.startTick,
            endTick: entry.endTick,
            bytes: entry.bytes,
            status: entry.status,
          }),
        ),
      );
    },
    finalize,
    dispose,
    getStats,
  });
}

function safeTick(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const tick = (value as Record<string, unknown>).tick;
  return typeof tick === 'number' && Number.isSafeInteger(tick) && tick >= 0 ? tick : null;
}

/* ----------------------------------------------------------------- reading */

function canonicalChunk(payload: Record<string, unknown>): {
  readonly text: string;
  readonly bytes: number;
  readonly checksum: string;
} | null {
  const canonical = canonicalizeJson(payload, { maxDepth: 24 });
  if (canonical.status === 'REJECTED') return null;
  return Object.freeze({
    text: canonical.text,
    bytes: byteLength(canonical.text),
    checksum: sha256Hex(canonical.text),
  });
}

export function computeWorldReplayChunkChecksum(payload: Record<string, unknown>): string {
  const canonical = canonicalChunk(payload);
  if (canonical === null) {
    throw new RecorderError('INVALID_CHUNK', 'The chunk is not canonical JSON', 'chunk');
  }
  return canonical.checksum;
}

function chunkRejected(
  code: WorldRecorderRejectionCode,
  message: string,
  path: string,
): WorldReplayChunkRejected {
  return Object.freeze({
    status: 'REJECTED' as const,
    rejection: Object.freeze({ code, message, path }),
  });
}

/**
 * Reads a chunk and verifies it before any value is used: the `SHA-256` checksum is recomputed over
 * the `SDA-CJSON-1` canonical payload without the checksum and byte fields, the stored byte count
 * must be the canonical one, the 206 anchor is re-read with `readWorldSnapshot`, sample ticks must
 * be the exact observed cadence, event ticks must be inside the window, a `PARTIAL` window must say
 * so and a chunk may never declare a LEARNING artifact.
 */
export function readWorldReplayChunk(value: unknown): WorldReplayChunkReadResult {
  try {
    const data = readObject(value, 'chunk');
    if (data.chunkVersion !== WORLD_REPLAY_CHUNK_VERSION) {
      return chunkRejected(
        'INCOMPATIBLE_VERSION',
        `Expected ${WORLD_REPLAY_CHUNK_VERSION}`,
        'chunk.chunkVersion',
      );
    }
    if (data.pinned !== true) {
      return chunkRejected(
        'INVALID_CHUNK',
        'Only pinned incident chunks are stored',
        'chunk.pinned',
      );
    }
    const integrity: unknown = data.integrity;
    if (
      typeof integrity !== 'object' ||
      integrity === null ||
      (integrity as Record<string, unknown>).algorithm !== WORLD_REPLAY_INTEGRITY.algorithm ||
      (integrity as Record<string, unknown>).canonicalization !==
        WORLD_REPLAY_INTEGRITY.canonicalization
    ) {
      return chunkRejected(
        'INVALID_CHUNK',
        `Expected ${WORLD_REPLAY_INTEGRITY.algorithm} over ${WORLD_REPLAY_INTEGRITY.canonicalization}`,
        'chunk.integrity',
      );
    }
    const checksum = data.checksum;
    if (typeof checksum !== 'string' || !CHECKSUM_HEX.test(checksum)) {
      return chunkRejected('CHECKSUM_MISMATCH', 'Expected a lowercase SHA-256', 'chunk.checksum');
    }
    const payload: Record<string, unknown> = { ...data };
    delete payload.checksum;
    delete payload.bytes;
    const computed = canonicalChunk(payload);
    if (computed === null) {
      return chunkRejected('INVALID_CHUNK', 'The chunk is not canonical JSON', 'chunk');
    }
    if (computed.checksum !== checksum) {
      return chunkRejected(
        'CHECKSUM_MISMATCH',
        'The stored chunk does not match its checksum',
        'chunk.checksum',
      );
    }
    const chunk = data as unknown as WorldReplayChunk;
    if (chunk.bytes !== computed.bytes) {
      return chunkRejected(
        'INVALID_CHUNK',
        `The chunk declares ${String(chunk.bytes)} bytes, the canonical payload has ${computed.bytes}`,
        'chunk.bytes',
      );
    }
    if (
      !Array.isArray(chunk.samples) ||
      !Array.isArray(chunk.events) ||
      !Array.isArray(chunk.tables.entities) ||
      !Array.isArray(chunk.tables.signals) ||
      !Array.isArray(chunk.tables.fsmStates) ||
      !Array.isArray(chunk.tables.rides) ||
      !Array.isArray(chunk.lifecycle.created) ||
      !Array.isArray(chunk.lifecycle.removed)
    ) {
      return chunkRejected('INVALID_CHUNK', 'Expected the declared chunk tables', 'chunk');
    }
    if (chunk.startTick > chunk.endTick || chunk.sealTick > chunk.endTick) {
      return chunkRejected(
        'INVALID_CHUNK',
        'The window is closed before it opens',
        'chunk.startTick',
      );
    }
    if (chunk.incident.tick < chunk.startTick || chunk.incident.tick > chunk.endTick) {
      return chunkRejected(
        'INVALID_CHUNK',
        'The incident is outside its own pinned window',
        'chunk.incident.tick',
      );
    }
    if (
      chunk.learning.producesArtifacts !== false ||
      chunk.learning.eligible !== false ||
      chunk.learning.jobs !== 0 ||
      chunk.learning.observations !== 0 ||
      chunk.learning.profileVersions !== 0
    ) {
      return chunkRejected(
        'LEARNING_ARTIFACT',
        'A world replay chunk may never declare a LEARNING artifact',
        'chunk.learning',
      );
    }
    if (chunk.camera.filterApplied !== false) {
      return chunkRejected(
        'INVALID_CHUNK',
        'The camera may never filter the recorded world',
        'chunk.camera.filterApplied',
      );
    }
    if (chunk.checkpoint === null) {
      if (chunk.anchor !== null) {
        return chunkRejected(
          'ANCHOR_MISMATCH',
          'An anchor without a 206 checkpoint reference is not trustworthy',
          'chunk.anchor',
        );
      }
    } else {
      if (chunk.anchor === null) {
        return chunkRejected(
          'ANCHOR_MISMATCH',
          'A checkpoint reference needs its anchor',
          'chunk.anchor',
        );
      }
      if (!Number.isSafeInteger(chunk.checkpoint.tick) || chunk.checkpoint.tick > chunk.startTick) {
        return chunkRejected(
          'ANCHOR_MISMATCH',
          'The anchor must come from a tick at or before the window',
          'chunk.checkpoint.tick',
        );
      }
      const stored = readWorldSnapshot(chunk.anchor);
      if (stored.status === 'REJECTED') {
        /* The 206 vocabulary is wider than 207's, so it is mapped, never cast: a bad anchor is an
           ANCHOR_MISMATCH, except the two codes that mean the same thing in both contracts. */
        const code: WorldRecorderRejectionCode =
          stored.rejection.code === 'CHECKSUM_MISMATCH'
            ? 'CHECKSUM_MISMATCH'
            : stored.rejection.code === 'INCOMPATIBLE_VERSION'
              ? 'INCOMPATIBLE_VERSION'
              : 'ANCHOR_MISMATCH';
        return chunkRejected(code, stored.rejection.message, 'chunk.anchor');
      }
      if (
        stored.checksum !== chunk.checkpoint.checksum ||
        stored.snapshot.tick !== chunk.checkpoint.tick
      ) {
        return chunkRejected(
          'ANCHOR_MISMATCH',
          'The anchor does not match the referenced 206 checkpoint',
          'chunk.checkpoint',
        );
      }
    }
    const cadence = chunk.sampling.cadenceTicks;
    if (
      !Number.isSafeInteger(cadence) ||
      cadence <= 0 ||
      chunk.sampling.tickHz % chunk.sampling.sampleHz !== 0 ||
      chunk.sampling.tickHz / chunk.sampling.sampleHz !== cadence
    ) {
      return chunkRejected(
        'SAMPLE_TICK_MISMATCH',
        'The declared sample cadence is inconsistent',
        'chunk.sampling',
      );
    }
    let previousTick = -1;
    for (const sample of chunk.samples) {
      if (sample.tick % cadence !== 0) {
        return chunkRejected(
          'SAMPLE_TICK_MISMATCH',
          `Sample tick ${sample.tick} is not on the declared ${cadence}-tick cadence`,
          'chunk.samples',
        );
      }
      if (sample.tick <= previousTick) {
        return chunkRejected('SAMPLE_TICK_MISMATCH', 'Sample ticks must increase', 'chunk.samples');
      }
      if (sample.tick < chunk.startTick || sample.tick > chunk.endTick) {
        return chunkRejected(
          'SAMPLE_TICK_MISMATCH',
          `Sample tick ${sample.tick} is outside ${chunk.startTick}..${chunk.endTick}`,
          'chunk.samples',
        );
      }
      previousTick = sample.tick;
    }
    const seenEvents = new Set<string>();
    for (const event of chunk.events) {
      if (event.tick < chunk.startTick || event.tick > chunk.endTick) {
        return chunkRejected(
          'EVENT_TICK_MISMATCH',
          `Event ${event.eventId} is outside the window`,
          'chunk.events',
        );
      }
      if (seenEvents.has(event.eventId)) {
        return chunkRejected('EVENT_TICK_MISMATCH', 'Duplicate event identity', 'chunk.events');
      }
      seenEvents.add(event.eventId);
    }
    if (chunk.completeness.status === 'PARTIAL' && !chunk.completeness.declaredPartial) {
      return chunkRejected(
        'COMPLETENESS_UNDECLARED',
        'A partial window must be declared as partial',
        'chunk.completeness',
      );
    }
    if (chunk.completeness.status === 'COMPLETE' && chunk.completeness.reasons.length > 0) {
      return chunkRejected(
        'COMPLETENESS_UNDECLARED',
        'A complete window cannot carry partial reasons',
        'chunk.completeness',
      );
    }
    return Object.freeze({
      status: 'ACCEPTED' as const,
      chunk,
      bytes: computed.bytes,
      checksum,
    });
  } catch (error) {
    const failure = error instanceof RecorderError ? error : null;
    return chunkRejected(
      failure?.code ?? 'INVALID_CHUNK',
      failure?.message ?? 'The chunk could not be read',
      failure?.path ?? 'chunk',
    );
  }
}

/** Decoded vehicle row of a chunk; this is what a replay view interpolates between. */
export interface DecodedReplayVehicle {
  readonly entityId: string;
  readonly vehicleClass: WorldVehicleClass;
  readonly controlMode: WorldControlMode;
  readonly fsmState: string;
  readonly rideId: string | null;
  readonly inCamera: boolean;
  readonly position: ReplayVector3;
  readonly rotation: ReplayQuaternion;
}

export interface DecodedReplaySignal {
  readonly signalId: string;
  readonly phase: WorldSignalPhase;
  readonly remainingTicks: number;
}

export interface DecodedReplaySample {
  readonly tick: number;
  readonly vehicles: readonly DecodedReplayVehicle[];
  readonly signals: readonly DecodedReplaySignal[];
}

/** Decodes one row without inventing values: a missing table entry is refused, not defaulted. */
export function readReplaySample(
  chunk: WorldReplayChunk,
  tick: number,
): DecodedReplaySample | null {
  const sample = chunk.samples.find((entry) => entry.tick === tick);
  if (sample === undefined) return null;
  const vehicles: DecodedReplayVehicle[] = [];
  for (const row of sample.vehicles) {
    const [slot, xCm, yCm, zCm, qx, qy, qz, qw, mode, fsm, ride, camera] = row;
    const identity = chunk.tables.entities.find((entry) => entry.slot === slot);
    const fsmState = chunk.tables.fsmStates[fsm ?? 0];
    const rideId = ride === undefined || ride === 0 ? null : chunk.tables.rides[ride];
    const controlMode = chunk.tables.controlModes[mode ?? 0];
    if (identity === undefined || fsmState === undefined || controlMode === undefined) return null;
    vehicles.push(
      Object.freeze({
        entityId: identity.entityId,
        vehicleClass: identity.vehicleClass,
        controlMode,
        fsmState,
        rideId: rideId ?? null,
        inCamera: camera === 1,
        position: Object.freeze({
          x: (xCm ?? 0) * WORLD_REPLAY_QUANTIZATION.positionM,
          y: (yCm ?? 0) * WORLD_REPLAY_QUANTIZATION.positionM,
          z: (zCm ?? 0) * WORLD_REPLAY_QUANTIZATION.positionM,
        }),
        rotation: Object.freeze({
          x: (qx ?? 0) * WORLD_REPLAY_QUANTIZATION.rotationUnit,
          y: (qy ?? 0) * WORLD_REPLAY_QUANTIZATION.rotationUnit,
          z: (qz ?? 0) * WORLD_REPLAY_QUANTIZATION.rotationUnit,
          w: (qw ?? 0) * WORLD_REPLAY_QUANTIZATION.rotationUnit,
        }),
      }),
    );
  }
  const signals: DecodedReplaySignal[] = [];
  for (const row of sample.signals) {
    const [slot, phase, remainingTicks] = row;
    const identity = chunk.tables.signals.find((entry) => entry.slot === slot);
    const phaseName = chunk.tables.phases[phase ?? 0];
    if (identity === undefined || phaseName === undefined) return null;
    signals.push(
      Object.freeze({
        signalId: identity.signalId,
        phase: phaseName,
        remainingTicks: remainingTicks ?? 0,
      }),
    );
  }
  return Object.freeze({
    tick: sample.tick,
    vehicles: Object.freeze(vehicles),
    signals: Object.freeze(signals),
  });
}

/** Linear interpolation between two observed rows; the caller must declare it as replay, not physics. */
export function interpolateReplayTransform(
  from: DecodedReplayVehicle,
  to: DecodedReplayVehicle,
  alpha: number,
): ReplayVector3 {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RecorderError('INVALID_FRAME', 'Interpolation alpha must be inside [0, 1]', 'alpha');
  }
  if (from.entityId !== to.entityId) {
    throw new RecorderError(
      'INVALID_FRAME',
      'Interpolation needs two observations of the same entity',
      'entityId',
    );
  }
  return Object.freeze({
    x: from.position.x + (to.position.x - from.position.x) * alpha,
    y: from.position.y + (to.position.y - from.position.y) * alpha,
    z: from.position.z + (to.position.z - from.position.z) * alpha,
  });
}

/**
 * Normalized linear interpolation of two observed rotations. It is declared as `NLERP` in the chunk
 * because it is a replay convenience, not the physics step that produced the two observed poses.
 */
export function interpolateReplayRotation(
  from: DecodedReplayVehicle,
  to: DecodedReplayVehicle,
  alpha: number,
): ReplayQuaternion {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RecorderError('INVALID_FRAME', 'Interpolation alpha must be inside [0, 1]', 'alpha');
  }
  if (from.entityId !== to.entityId) {
    throw new RecorderError(
      'INVALID_FRAME',
      'Interpolation needs two observations of the same entity',
      'entityId',
    );
  }
  const mix = (a: number, b: number): number => a + (b - a) * alpha;
  let x = mix(from.rotation.x, to.rotation.x);
  let y = mix(from.rotation.y, to.rotation.y);
  let z = mix(from.rotation.z, to.rotation.z);
  let w = mix(from.rotation.w, to.rotation.w);
  const length = Math.hypot(x, y, z, w);
  if (!Number.isFinite(length) || length === 0) {
    throw new RecorderError(
      'INVALID_FRAME',
      'The interpolated rotation cannot be normalized',
      'rotation',
    );
  }
  x /= length;
  y /= length;
  z /= length;
  w /= length;
  return Object.freeze({ x, y, z, w });
}

/** Declared replay pose: linear position and normalized-linear rotation between two observations. */
export interface ReplayPose {
  readonly tick: number;
  readonly interpolation: 'LINEAR' | 'NLERP';
  readonly position: ReplayVector3;
  readonly rotation: ReplayQuaternion;
  readonly physicsFidelity: false;
}

/** One declared pose at `alpha` between two observed rows of the same entity. */
export function interpolateReplayPose(
  from: DecodedReplaySample,
  to: DecodedReplaySample,
  entityId: string,
  alpha: number,
): ReplayPose | null {
  const a = from.vehicles.find((vehicle) => vehicle.entityId === entityId);
  const b = to.vehicles.find((vehicle) => vehicle.entityId === entityId);
  if (a === undefined || b === undefined) return null;
  return Object.freeze({
    tick: from.tick,
    interpolation: 'LINEAR',
    position: interpolateReplayTransform(a, b, alpha),
    rotation: interpolateReplayRotation(a, b, alpha),
    physicsFidelity: false,
  });
}

/** Bounded helper for the 007 bus: the recorder only ever sees already validated events. */
export function subscribeWorldRecorder(
  bus: {
    subscribe(
      listener: (event: SimulationEvent) => undefined,
      options?: { order?: number },
    ): () => void;
  },
  recorder: WorldRecorder,
): () => void {
  return bus.subscribe((event) => {
    recorder.recordEvent(event);
    return undefined;
  });
}
