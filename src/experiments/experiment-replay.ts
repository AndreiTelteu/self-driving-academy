import type {
  ExperimentLedgerFingerprint,
  ExperimentLedgerPort,
} from './experiment-ledger-isolation';

/**
 * 141 visual replay of recorded states.
 *
 * Docs/14 keeps two different functions apart: the **visual replay** reads the states that were
 * recorded, while the **rerun** simulates commands or a policy again. This module owns the first
 * one. It consumes a sealed `207-world-replay-chunk-v1` (which is itself anchored on a complete
 * 206 snapshot) and projects it: it never steps the fixed-tick loop, never evaluates a controller,
 * never interpolates an unobserved row into existence and never writes a live ledger.
 *
 * The contract is built around five properties:
 *
 * 1. **Recorded states only.** The source is the 207 chunk; the tick grid, the sample rows, the
 *    signal phases and the lifecycle facts all come from it. Nothing is re-derived from physics or
 *    from the driving policy, so `rerunsPolicy` is structurally `false`.
 * 2. **Absence is declared.** A cadence tick without a sample row is reported as a named absence
 *    (`TICK_NOT_OBSERVED`, `WINDOW_TRUNCATED_BEFORE`, `WINDOW_TRUNCATED_AFTER`) instead of being
 *    filled in. `readReplaySample` returns `null` for such a tick and the projector keeps the
 *    absence in every position, frame and run it returns.
 * 3. **Seek is exact and reported.** `seek()` lands on an observed tick, reports the requested
 *    tick, the landed tick, the requested/stored window and every absence between them. The
 *    default target is the incident tick, so "seek la incident" is one call.
 * 4. **Pause only freezes.** `pause()` flips one flag: the tick, the index, the frame and every
 *    immutable fingerprint stay byte-identical, and `play()` while paused answers `PAUSED` without
 *    moving.
 * 5. **Lifecycle beats interpolation.** A vehicle removed inside the window is gone from the
 *    removal tick onwards and is never resurrected by interpolation; a vehicle created inside the
 *    window does not exist before its creation tick, and a pose is only interpolated between two
 *    *adjacent* observed samples of the same entity.
 *
 * The immutable surface is the existing one, not a second format: the live ledgers are the 140
 * `ExperimentLedgerPort` (learning evidence 093, mission rewards 125, KPI 137) reused verbatim, and
 * the profile identity is the profile contract's own checksum (`computeProfileVersionChecksum`).
 * `experimentReplayImmutableCoverage` states where each fact named by the criterion (profile,
 * revenue, ratings, missions, XP) is fingerprinted.
 */

export const EXPERIMENT_REPLAY_VERSION = '141-experiment-replay-v1' as const;

/** The source contracts the projection consumes; no field is re-derived from a policy. */
export const EXPERIMENT_REPLAY_SOURCE = Object.freeze({
  chunk: '207-world-replay-chunk-v1' as const,
  anchor: '206-world-snapshot-v1' as const,
});

export const experimentReplayStages = ['REQUEST', 'SOURCE', 'IDENTITY', 'WINDOW', 'SEEK'] as const;
export type ExperimentReplayStage = (typeof experimentReplayStages)[number];

export const experimentReplayRejectionCodes = [
  /** The request itself is not a well formed replay request. */
  'INVALID_REQUEST',
  /** The stored chunk was refused by the 207 reader. */
  'INVALID_SOURCE',
  /** The stored chunk does not match its own checksum or byte count. */
  'CHECKSUM_MISMATCH',
  /** The chunk was recorded for another session or another world epoch. */
  'FOREIGN_SOURCE',
  /** The stored window does not contain its own incident. */
  'INCIDENT_OUTSIDE_WINDOW',
  /** The requested seek target is outside the stored window. */
  'SEEK_OUT_OF_WINDOW',
  /** The stored window has no observed transform row at all. */
  'SOURCE_EMPTY',
] as const;
export type ExperimentReplayRejectionCode = (typeof experimentReplayRejectionCodes)[number];

export class ExperimentReplayRequestError extends Error {
  readonly code: 'INVALID_REQUEST';
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = 'ExperimentReplayRequestError';
    this.code = 'INVALID_REQUEST';
    this.path = path;
  }
}

/* ------------------------------------------------------------------ source */

export interface ExperimentReplayVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ExperimentReplayQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export type ExperimentReplayControlMode = 'AUTO' | 'MANUAL' | 'LEARNING';
export type ExperimentReplayVehicleClass = 'TAXI' | 'CIVILIAN';
export type ExperimentReplayPhase = 'GREEN' | 'YELLOW' | 'RED';
export type ExperimentReplayVisibility = 'OUTSIDE_CAMERA' | 'IN_CAMERA' | 'MIXED' | 'UNKNOWN';

/** One decoded vehicle row: exactly what the replay draws, with the camera flag recorded. */
export interface ExperimentReplayVehicle {
  readonly entityId: string;
  readonly vehicleClass: ExperimentReplayVehicleClass;
  readonly controlMode: ExperimentReplayControlMode;
  readonly fsmState: string;
  readonly rideId: string | null;
  readonly inCamera: boolean;
  readonly position: ExperimentReplayVector;
  readonly rotation: ExperimentReplayQuaternion;
}

export interface ExperimentReplaySignal {
  readonly signalId: string;
  readonly phase: ExperimentReplayPhase;
  readonly remainingTicks: number;
}

/** The decoded sample of one observed tick (`readReplaySample` of 207). */
export interface ExperimentReplaySample {
  readonly tick: number;
  readonly vehicles: readonly ExperimentReplayVehicle[];
  readonly signals: readonly ExperimentReplaySignal[];
}

export interface ExperimentReplayLifecycleFact {
  readonly tick: number;
  readonly kind: 'CREATED' | 'REMOVED';
  readonly entityId: string;
  readonly vehicleClass: ExperimentReplayVehicleClass;
  readonly inferred: boolean;
}

export interface ExperimentReplayEntityIdentity {
  readonly slot: number;
  readonly entityId: string;
  readonly vehicleClass: ExperimentReplayVehicleClass;
}

export interface ExperimentReplayIncidentSource {
  readonly incidentId: string;
  readonly kind: 'COLLISION';
  readonly eventId: string;
  readonly tick: number;
  readonly entityIds: readonly string[];
  readonly controlModes: readonly (ExperimentReplayControlMode | 'UNKNOWN')[];
  readonly autoOnly: boolean;
  readonly visibility: ExperimentReplayVisibility;
  readonly outsideCamera: boolean;
  readonly classifiedFromTick: number | null;
  readonly pinnedFromTick: number;
  readonly pinnedToTick: number;
}

export interface ExperimentReplayCoverage {
  readonly requestedTicks: number;
  readonly recordedTicks: number;
  readonly coverage: number;
  readonly startTick: number;
  readonly endTick: number;
}

export interface ExperimentReplayGap {
  readonly fromTick: number;
  readonly toTick: number;
}

export interface ExperimentReplayCompleteness {
  readonly status: 'COMPLETE' | 'PARTIAL';
  readonly declaredPartial: boolean;
  readonly reasons: readonly string[];
  readonly before: ExperimentReplayCoverage;
  readonly after: ExperimentReplayCoverage;
  readonly droppedSamples: number;
  readonly sampleGaps: readonly ExperimentReplayGap[];
  readonly omittedGaps: number;
  readonly anchor: 'PRESENT' | 'MISSING' | 'STALE';
  readonly anchorAgeTicks: number | null;
}

export interface ExperimentReplaySampling {
  readonly tickHz: number;
  readonly sampleHz: number;
  readonly cadenceTicks: number;
  readonly interpolation: 'LINEAR';
  readonly rotationInterpolation: 'NLERP';
  readonly eventTicksExact: boolean;
  readonly observedTicksOnly: boolean;
  readonly physicsFidelity: boolean;
}

export interface ExperimentReplayCamera {
  readonly filterApplied: boolean;
  readonly recordedVehicles: number;
  readonly outOfCameraVehicles: number;
}

export interface ExperimentReplayLearningDeclaration {
  readonly producesArtifacts: false;
  readonly eligible: false;
  readonly jobs: 0;
  readonly observations: 0;
  readonly profileVersions: 0;
}

/**
 * The 207 chunk fields the projector reads. It is a structural view, not a second chunk format:
 * the composition layer passes the real chunk, and the test suite pins
 * `WorldReplayChunk extends ExperimentReplayChunkView` so a change in 207 cannot drift silently.
 */
export interface ExperimentReplayChunkView {
  readonly chunkVersion: string;
  readonly chunkId: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly versions: Readonly<{
    engineVersion: string;
    physicsVersion: string;
    mapVersion: string;
  }>;
  readonly startTick: number;
  readonly endTick: number;
  readonly sealTick: number;
  readonly incident: ExperimentReplayIncidentSource;
  readonly completeness: ExperimentReplayCompleteness;
  readonly sampling: ExperimentReplaySampling;
  readonly camera: ExperimentReplayCamera;
  readonly learning: ExperimentReplayLearningDeclaration;
  readonly lifecycle: Readonly<{
    created: readonly ExperimentReplayLifecycleFact[];
    removed: readonly ExperimentReplayLifecycleFact[];
  }>;
  readonly tables: Readonly<{ entities: readonly ExperimentReplayEntityIdentity[] }>;
  readonly bytes: number;
  readonly checksum: string;
}

export type ExperimentReplayChunkRead =
  | {
      readonly status: 'ACCEPTED';
      readonly chunk: ExperimentReplayChunkView;
      readonly checksum: string;
      readonly bytes: number;
    }
  | {
      readonly status: 'REJECTED';
      readonly code: string;
      readonly message: string;
      readonly path: string;
    };

/**
 * The real 207 reader and sample decoder, injected so the domain module never imports the replay
 * adapter module. `readSample` must return `null` for an unobserved tick — that `null` is the
 * contract this module relies on to declare absence instead of inventing a pose.
 */
export interface ExperimentReplaySourcePort {
  readonly readChunk: (value: unknown) => ExperimentReplayChunkRead;
  readonly readSample: (
    chunk: ExperimentReplayChunkView,
    tick: number,
  ) => ExperimentReplaySample | null;
}

/* --------------------------------------------------------------- isolation */

/**
 * The facts the acceptance criterion names. Each one is fingerprinted by the existing surface
 * below; this module only declares the mapping, it never hashes anything itself.
 */
export const experimentReplayImmutableFacts = [
  'profile',
  'revenue',
  'ratings',
  'missions',
  'xp',
] as const;
export type ExperimentReplayImmutableFact = (typeof experimentReplayImmutableFacts)[number];

/**
 * Where each fact is fingerprinted. `profile` is the profile contract's own version checksum; the
 * other four live in the 140 ledger fingerprints (`kpi` = 137/22 read models, `rewards` = 125
 * rewards and XP).
 */
export const experimentReplayImmutableCoverage: Readonly<
  Record<ExperimentReplayImmutableFact, 'PROFILE' | 'REWARDS' | 'KPI'>
> = Object.freeze({
  profile: 'PROFILE',
  revenue: 'KPI',
  ratings: 'KPI',
  missions: 'REWARDS',
  xp: 'REWARDS',
});

/** The live profile identity: the store's profile/version ids and its canonical checksum. */
export interface ExperimentReplayProfileIdentity {
  readonly profileId: string;
  readonly versionId: string;
  readonly checksum: string;
}

export interface ExperimentReplayProfilePort {
  identity(): ExperimentReplayProfileIdentity;
}

/**
 * The read-only view of everything a replay must not touch. The ledger port is the 140 contract,
 * reused verbatim; the profile port exposes only the store's own identity and checksum.
 */
export interface ExperimentReplayIsolationPort {
  readonly ledger: ExperimentLedgerPort;
  readonly profile: ExperimentReplayProfilePort;
}

export const experimentReplayChangedLabels = ['PROFILE', 'LEARNING', 'REWARDS', 'KPI'] as const;
export type ExperimentReplayChangedLabel = (typeof experimentReplayChangedLabels)[number];

export type ExperimentReplayOperation = 'SEEK' | 'PLAY' | 'PAUSE' | 'RESUME' | 'REPLAY';

export interface ExperimentReplayIsolationCheck {
  readonly operation: ExperimentReplayOperation;
  readonly ledgerBefore: ExperimentLedgerFingerprint;
  readonly ledgerAfter: ExperimentLedgerFingerprint;
  readonly profileBefore: ExperimentReplayProfileIdentity;
  readonly profileAfter: ExperimentReplayProfileIdentity;
  readonly unchanged: boolean;
  readonly changed: readonly ExperimentReplayChangedLabel[];
  readonly liveWrites: 0;
}

export interface ExperimentReplayIsolationVerification {
  readonly facts: typeof experimentReplayImmutableFacts;
  readonly coverage: typeof experimentReplayImmutableCoverage;
  readonly checks: readonly ExperimentReplayIsolationCheck[];
  readonly unchanged: boolean;
  readonly changed: readonly ExperimentReplayChangedLabel[];
  readonly liveWrites: 0;
}

/* ---------------------------------------------------------------- absence */

export const experimentReplayAbsenceReasons = [
  /** A cadence tick of the window without a recorded transform row. */
  'TICK_NOT_OBSERVED',
  /** The pin wanted ticks before the first row the capture ever observed. */
  'WINDOW_TRUNCATED_BEFORE',
  /** The pin wanted ticks after the last row the capture ever observed. */
  'WINDOW_TRUNCATED_AFTER',
  /** The entity is created later in the window; it must not exist before that tick. */
  'ENTITY_NOT_YET_CREATED',
  /** The entity was removed at or before this tick; it is never resurrected. */
  'ENTITY_REMOVED',
  /** The entity identity is not in the chunk tables. */
  'ENTITY_UNKNOWN',
  /** The entity exists in the tables but no sample row carries it at the reading tick. */
  'ENTITY_NOT_OBSERVED',
  /** The tick is outside the stored window. */
  'OUT_OF_WINDOW',
] as const;
export type ExperimentReplayAbsenceReason = (typeof experimentReplayAbsenceReasons)[number];

export interface ExperimentReplayAbsence {
  readonly reason: ExperimentReplayAbsenceReason;
  readonly fromTick: number;
  readonly toTick: number;
  readonly detail: string;
}

/* ---------------------------------------------------------------- request */

export interface ExperimentReplayRequest {
  readonly experimentId: string;
  /** The sealed 207 chunk exactly as stored; it is re-read, never trusted. */
  readonly source: unknown;
  /** The session the experiment belongs to; a chunk of another session is refused. */
  readonly expectedSessionId: string;
  readonly expectedWorldEpoch: number;
  /** Optional explicit target; defaults to the incident tick. */
  readonly seekTick?: number;
  readonly isolation: ExperimentReplayIsolationPort;
}

/* ----------------------------------------------------------------- result */

export interface ExperimentReplayWindow {
  /** The window the incident pinned (15 s before and after by default). */
  readonly fromTick: number;
  readonly toTick: number;
  /** The window the stored chunk really covers. */
  readonly storedFromTick: number;
  readonly storedToTick: number;
  readonly incidentTick: number;
}

export interface ExperimentReplaySourceSummary {
  readonly chunkId: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly versions: ExperimentReplayChunkView['versions'];
  readonly checksum: string;
  readonly bytes: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly sealTick: number;
  readonly completeness: ExperimentReplayCompleteness;
  readonly sampling: ExperimentReplaySampling;
  readonly camera: ExperimentReplayCamera;
  readonly learning: ExperimentReplayLearningDeclaration;
  /** Structural: the projection never re-runs the driving policy or the physics step. */
  readonly declaration: ExperimentReplayDeclaration;
}

export interface ExperimentReplayDeclaration {
  readonly version: typeof EXPERIMENT_REPLAY_VERSION;
  readonly source: typeof EXPERIMENT_REPLAY_SOURCE;
  readonly projectsRecordedStates: true;
  readonly rerunsPolicy: false;
  readonly recalculatesPhysics: false;
  readonly inventsUnobservedTicks: false;
  readonly interpolatesOnlyBetweenAdjacentSamples: true;
  readonly writesLiveState: false;
  readonly learningArtifacts: 0;
}

export interface ExperimentReplayIncidentEntity {
  readonly entityId: string;
  readonly vehicleClass: ExperimentReplayVehicleClass | 'UNKNOWN';
  readonly controlMode: ExperimentReplayControlMode | 'UNKNOWN';
  /** `null` when the classified tick carried no row for this entity: unknown, never guessed. */
  readonly inCamera: boolean | null;
  readonly createdTick: number | null;
  readonly removedTick: number | null;
  readonly observedInWindow: boolean;
}

export interface ExperimentReplayIncidentView {
  readonly incidentId: string;
  readonly kind: 'COLLISION';
  readonly eventId: string;
  readonly tick: number;
  readonly entityIds: readonly string[];
  readonly controlModes: readonly (ExperimentReplayControlMode | 'UNKNOWN')[];
  readonly autoOnly: boolean;
  readonly visibility: ExperimentReplayVisibility;
  readonly outsideCamera: boolean;
  /** True when every involved entity is outside the player camera at the classified tick. */
  readonly invisible: boolean;
  readonly classifiedFromTick: number | null;
  readonly entities: readonly ExperimentReplayIncidentEntity[];
  readonly createdInWindow: readonly ExperimentReplayLifecycleFact[];
  readonly removedInWindow: readonly ExperimentReplayLifecycleFact[];
}

export interface ExperimentReplayPosition {
  readonly tick: number;
  readonly index: number;
  readonly observedTicks: number;
  readonly firstObservedTick: number;
  readonly lastObservedTick: number;
  /** The last explicit seek landed on the incident seek target. */
  readonly atIncident: boolean;
  readonly paused: boolean;
  readonly span: ExperimentReplayWindow;
  readonly missing: readonly ExperimentReplayAbsence[];
  readonly completeness: ExperimentReplayCompleteness;
}

export interface ExperimentReplayFrame {
  readonly tick: number;
  readonly observed: true;
  readonly vehicles: readonly ExperimentReplayVehicle[];
  readonly signals: readonly ExperimentReplaySignal[];
  /** Entity ids created exactly at this tick. */
  readonly created: readonly string[];
  /** Entity ids removed exactly at this tick; they are already absent from `vehicles`. */
  readonly removed: readonly string[];
  /** Declared absences between the previous observed tick and this one. */
  readonly missing: readonly ExperimentReplayAbsence[];
  readonly interpolation: 'NONE';
}

export interface ExperimentReplaySeekResult {
  readonly status: 'SEEKED' | 'REFUSED';
  readonly code: ExperimentReplayRejectionCode | null;
  readonly requestedTick: number;
  readonly landedTick: number | null;
  /** `requestedTick === landedTick`, i.e. no absence had to be declared for the landing. */
  readonly exact: boolean;
  readonly atIncident: boolean;
  readonly span: ExperimentReplayWindow;
  readonly missing: readonly ExperimentReplayAbsence[];
  readonly detail: string;
  readonly position: ExperimentReplayPosition | null;
  readonly isolation: ExperimentReplayIsolationCheck;
}

export type ExperimentReplayStepStatus = 'ADVANCED' | 'AT_END' | 'PAUSED' | 'RESUMED';

export interface ExperimentReplayStep {
  readonly status: ExperimentReplayStepStatus;
  readonly frame: ExperimentReplayFrame;
  readonly advancedTicks: number;
  readonly skipped: readonly ExperimentReplayAbsence[];
  readonly position: ExperimentReplayPosition;
  readonly isolation: ExperimentReplayIsolationCheck;
}

export interface ExperimentReplayPauseResult {
  readonly status: 'PAUSED' | 'ALREADY_PAUSED';
  readonly frame: ExperimentReplayFrame;
  readonly position: ExperimentReplayPosition;
  readonly isolation: ExperimentReplayIsolationCheck;
}

export interface ExperimentReplayRun {
  readonly status: 'REPLAYED';
  readonly frames: readonly ExperimentReplayFrame[];
  readonly ticks: number;
  readonly missing: readonly ExperimentReplayAbsence[];
  readonly position: ExperimentReplayPosition;
  readonly isolation: ExperimentReplayIsolationCheck;
}

export type ExperimentReplayPoseResult =
  | {
      readonly status: 'OBSERVED';
      readonly tick: number;
      readonly entityId: string;
      readonly position: ExperimentReplayVector;
      readonly rotation: ExperimentReplayQuaternion;
      readonly interpolation: 'NONE';
    }
  | {
      readonly status: 'INTERPOLATED';
      readonly tick: number;
      readonly entityId: string;
      readonly fromTick: number;
      readonly toTick: number;
      readonly alpha: number;
      readonly position: ExperimentReplayVector;
      readonly rotation: ExperimentReplayQuaternion;
      /** The interpolation the chunk itself declares; declared, never a physics step. */
      readonly interpolation: 'LINEAR';
    }
  | {
      readonly status: 'ABSENT';
      readonly tick: number;
      readonly entityId: string;
      readonly reason: ExperimentReplayAbsenceReason;
      readonly detail: string;
    };

export interface ExperimentReplayPlayer {
  readonly version: typeof EXPERIMENT_REPLAY_VERSION;
  readonly experimentId: string;
  readonly declaration: ExperimentReplayDeclaration;
  readonly source: ExperimentReplaySourceSummary;
  readonly incident: ExperimentReplayIncidentView;
  position(): ExperimentReplayPosition;
  frame(): ExperimentReplayFrame;
  seek(tick?: number): ExperimentReplaySeekResult;
  play(): ExperimentReplayStep;
  pause(): ExperimentReplayPauseResult;
  resume(): ExperimentReplayStep;
  poseAt(tick: number, entityId: string): ExperimentReplayPoseResult;
  replay(): ExperimentReplayRun;
  isolation(): ExperimentReplayIsolationVerification;
}

export interface ExperimentReplayReady {
  readonly status: 'READY';
  readonly version: typeof EXPERIMENT_REPLAY_VERSION;
  readonly experimentId: string;
  readonly source: ExperimentReplaySourceSummary;
  readonly player: ExperimentReplayPlayer;
  readonly position: ExperimentReplayPosition;
}

export interface ExperimentReplayRefused {
  readonly status: 'REFUSED';
  readonly version: typeof EXPERIMENT_REPLAY_VERSION;
  readonly experimentId: string | null;
  readonly stage: ExperimentReplayStage;
  readonly codes: readonly ExperimentReplayRejectionCode[];
  readonly detail: string;
}

export type ExperimentReplayResult = ExperimentReplayReady | ExperimentReplayRefused;

/* ------------------------------------------------------------- validation */

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new ExperimentReplayRequestError('Expected bounded text', path);
  }
  return value;
}

function requireTick(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ExperimentReplayRequestError('Expected a nonnegative safe integer', path);
  }
  return value;
}

function requireLedgerFingerprint(value: unknown): ExperimentLedgerFingerprint {
  if (!isPlainRecord(value)) {
    throw new ExperimentReplayRequestError('Expected a ledger fingerprint', 'isolation.ledger');
  }
  const read = (field: 'learning' | 'rewards' | 'kpi'): string => {
    const digest = value[field];
    if (typeof digest !== 'string' || digest.length === 0) {
      throw new ExperimentReplayRequestError(
        `The ${field} ledger fingerprint is missing`,
        `isolation.ledger.${field}`,
      );
    }
    return digest;
  };
  return Object.freeze({ learning: read('learning'), rewards: read('rewards'), kpi: read('kpi') });
}

function requireProfileIdentity(value: unknown): ExperimentReplayProfileIdentity {
  if (!isPlainRecord(value)) {
    throw new ExperimentReplayRequestError('Expected a profile identity', 'isolation.profile');
  }
  return Object.freeze({
    profileId: requireText(value.profileId, 'isolation.profile.profileId'),
    versionId: requireText(value.versionId, 'isolation.profile.versionId'),
    checksum: requireText(value.checksum, 'isolation.profile.checksum'),
  });
}

/* ------------------------------------------------------------- internals */

interface ObservedTick {
  readonly tick: number;
  readonly sample: ExperimentReplaySample;
}

interface Projection {
  readonly observed: readonly ObservedTick[];
  readonly absences: readonly ExperimentReplayAbsence[];
  readonly gapBefore: readonly (readonly ExperimentReplayAbsence[])[];
  readonly seenEntities: ReadonlySet<string>;
  readonly firstTick: number;
  readonly lastTick: number;
}

function alignedTicks(fromTick: number, toTick: number, cadence: number): readonly number[] {
  const start = Math.ceil(fromTick / cadence) * cadence;
  const end = Math.floor(toTick / cadence) * cadence;
  const ticks: number[] = [];
  for (let tick = start; tick <= end; tick += cadence) ticks.push(tick);
  return ticks;
}

function absence(
  reason: ExperimentReplayAbsenceReason,
  fromTick: number,
  toTick: number,
  detail: string,
): ExperimentReplayAbsence {
  return Object.freeze({ reason, fromTick, toTick, detail });
}

function contiguous(
  ticks: readonly number[],
  cadence: number,
  reason: ExperimentReplayAbsenceReason,
  detail: (fromTick: number, toTick: number, count: number) => string,
): ExperimentReplayAbsence[] {
  const ranges: ExperimentReplayAbsence[] = [];
  let openFrom: number | null = null;
  let openTo: number | null = null;
  let count = 0;
  for (const tick of ticks) {
    if (openFrom === null) {
      openFrom = tick;
      openTo = tick;
      count = 1;
      continue;
    }
    if (openTo !== null && tick === openTo + cadence) {
      openTo = tick;
      count += 1;
      continue;
    }
    if (openFrom !== null && openTo !== null)
      ranges.push(absence(reason, openFrom, openTo, detail(openFrom, openTo, count)));
    openFrom = tick;
    openTo = tick;
    count = 1;
  }
  if (openFrom !== null && openTo !== null)
    ranges.push(absence(reason, openFrom, openTo, detail(openFrom, openTo, count)));
  return ranges;
}

function buildProjection(
  chunk: ExperimentReplayChunkView,
  ports: ExperimentReplaySourcePort,
): Projection {
  const cadence = chunk.sampling.cadenceTicks;
  const grid = alignedTicks(chunk.startTick, chunk.endTick, cadence);
  const observed: ObservedTick[] = [];
  const observedTicks: number[] = [];
  const seen = new Set<string>();
  for (const tick of grid) {
    const sample = ports.readSample(chunk, tick);
    if (sample === null) continue;
    observed.push(Object.freeze({ tick, sample }));
    observedTicks.push(tick);
    for (const vehicle of sample.vehicles) seen.add(vehicle.entityId);
  }
  const present = new Set(observedTicks);
  const missing = grid.filter((tick) => !present.has(tick));
  const absences: ExperimentReplayAbsence[] = [];
  if (chunk.startTick > chunk.incident.pinnedFromTick) {
    absences.push(
      absence(
        'WINDOW_TRUNCATED_BEFORE',
        chunk.incident.pinnedFromTick,
        chunk.startTick - 1,
        `The stored clip starts at ${chunk.startTick}, ${chunk.startTick - chunk.incident.pinnedFromTick} tick(s) before the pinned start are not available`,
      ),
    );
  }
  const before: number[] = [];
  const inner: number[] = [];
  const after: number[] = [];
  const first = observedTicks[0] ?? null;
  const last = observedTicks[observedTicks.length - 1] ?? null;
  for (const tick of missing) {
    if (first === null || tick < first) before.push(tick);
    else if (last !== null && tick > last) after.push(tick);
    else inner.push(tick);
  }
  absences.push(
    ...contiguous(
      before,
      cadence,
      'WINDOW_TRUNCATED_BEFORE',
      (fromTick, toTick, count) =>
        `${count} cadence tick(s) before the first observed row (${fromTick}..${toTick})`,
    ),
    ...contiguous(
      inner,
      cadence,
      'TICK_NOT_OBSERVED',
      (fromTick, toTick, count) =>
        `${count} cadence tick(s) inside the clip have no recorded row (${fromTick}..${toTick}); the state is absent, not interpolated`,
    ),
    ...contiguous(
      after,
      cadence,
      'WINDOW_TRUNCATED_AFTER',
      (fromTick, toTick, count) =>
        `${count} cadence tick(s) after the last observed row (${fromTick}..${toTick})`,
    ),
  );
  if (chunk.endTick < chunk.incident.pinnedToTick) {
    absences.push(
      absence(
        'WINDOW_TRUNCATED_AFTER',
        chunk.endTick + 1,
        chunk.incident.pinnedToTick,
        `The stored clip ends at ${chunk.endTick}, ${chunk.incident.pinnedToTick - chunk.endTick} tick(s) before the pinned end are not available`,
      ),
    );
  }
  const gapBefore: ExperimentReplayAbsence[][] = observed.map(() => []);
  for (const range of absences) {
    const index = observed.findIndex((entry) => entry.tick > range.toTick);
    if (index >= 0) gapBefore[index]?.push(range);
  }
  return Object.freeze({
    observed: Object.freeze(observed),
    absences: Object.freeze(absences),
    gapBefore: Object.freeze(gapBefore.map((entry) => Object.freeze(entry))),
    seenEntities: seen,
    firstTick: first ?? chunk.startTick,
    lastTick: last ?? chunk.endTick,
  });
}

function emptyDeclaration(): ExperimentReplayDeclaration {
  return Object.freeze({
    version: EXPERIMENT_REPLAY_VERSION,
    source: EXPERIMENT_REPLAY_SOURCE,
    projectsRecordedStates: true as const,
    rerunsPolicy: false as const,
    recalculatesPhysics: false as const,
    inventsUnobservedTicks: false as const,
    interpolatesOnlyBetweenAdjacentSamples: true as const,
    writesLiveState: false as const,
    learningArtifacts: 0 as const,
  });
}

/* ------------------------------------------------------------------- run */

function refused(
  experimentId: string | null,
  stage: ExperimentReplayStage,
  codes: readonly ExperimentReplayRejectionCode[],
  detail: string,
): ExperimentReplayRefused {
  return Object.freeze({
    status: 'REFUSED' as const,
    version: EXPERIMENT_REPLAY_VERSION,
    experimentId,
    stage,
    codes: Object.freeze([...codes]),
    detail,
  });
}

function readRequest(request: unknown): ExperimentReplayRequest {
  if (!isPlainRecord(request)) {
    throw new ExperimentReplayRequestError('Expected a request object', 'request');
  }
  const isolation = request.isolation;
  if (
    !isPlainRecord(isolation) ||
    !isPlainRecord(isolation.ledger) ||
    !isPlainRecord(isolation.profile)
  ) {
    throw new ExperimentReplayRequestError(
      'The isolation needs a ledger port and a profile port',
      'request.isolation',
    );
  }
  if (typeof isolation.ledger.fingerprint !== 'function') {
    throw new ExperimentReplayRequestError(
      'The ledger port must expose a fingerprint',
      'request.isolation.ledger',
    );
  }
  if (typeof isolation.profile.identity !== 'function') {
    throw new ExperimentReplayRequestError(
      'The profile port must expose an identity',
      'request.isolation.profile',
    );
  }
  const seekTick = request.seekTick;
  return {
    experimentId: requireText(request.experimentId, 'request.experimentId'),
    source: request.source,
    expectedSessionId: requireText(request.expectedSessionId, 'request.expectedSessionId'),
    expectedWorldEpoch: requireTick(request.expectedWorldEpoch, 'request.expectedWorldEpoch'),
    ...(seekTick === undefined ? {} : { seekTick: requireTick(seekTick, 'request.seekTick') }),
    isolation: request.isolation as unknown as ExperimentReplayIsolationPort,
  };
}

/**
 * Validates, re-reads and projects one sealed replay chunk.
 *
 * The source is refused before any projection when the 207 reader rejects it, when its checksum or
 * byte count disagrees with what the reader computed, when it was recorded for another session or
 * world epoch, or when its own incident is outside its window. A refused source never yields a
 * player: there is no "best effort" replay of a document that is not a real clip.
 */
export function createExperimentReplay(
  request: ExperimentReplayRequest,
  ports: ExperimentReplaySourcePort,
): ExperimentReplayResult {
  let valid: ExperimentReplayRequest;
  try {
    valid = readRequest(request);
  } catch (error) {
    const failure = error instanceof ExperimentReplayRequestError ? error : null;
    return refused(
      null,
      'REQUEST',
      ['INVALID_REQUEST'],
      failure === null ? 'The request could not be read' : `${failure.message} (${failure.path})`,
    );
  }
  if (
    typeof ports !== 'object' ||
    ports === null ||
    typeof ports.readChunk !== 'function' ||
    typeof ports.readSample !== 'function'
  ) {
    return refused(
      valid.experimentId,
      'REQUEST',
      ['INVALID_REQUEST'],
      'The 207 source port is missing',
    );
  }

  const read = ports.readChunk(valid.source);
  if (read.status === 'REJECTED') {
    const code: ExperimentReplayRejectionCode =
      read.code === 'CHECKSUM_MISMATCH' ? 'CHECKSUM_MISMATCH' : 'INVALID_SOURCE';
    return refused(
      valid.experimentId,
      'SOURCE',
      [code],
      `${read.code}: ${read.message} (${read.path})`,
    );
  }
  const chunk = read.chunk;
  if (read.checksum !== chunk.checksum || read.bytes !== chunk.bytes) {
    return refused(
      valid.experimentId,
      'SOURCE',
      ['CHECKSUM_MISMATCH'],
      `The reader reported ${read.checksum}/${read.bytes} bytes, the chunk declares ${chunk.checksum}/${chunk.bytes}`,
    );
  }
  if (
    chunk.sessionId !== valid.expectedSessionId ||
    chunk.worldEpoch !== valid.expectedWorldEpoch
  ) {
    return refused(
      valid.experimentId,
      'IDENTITY',
      ['FOREIGN_SOURCE'],
      `The chunk belongs to ${chunk.sessionId}/${chunk.worldEpoch}, the experiment to ${valid.expectedSessionId}/${valid.expectedWorldEpoch}`,
    );
  }
  if (chunk.incident.kind !== 'COLLISION') {
    return refused(
      valid.experimentId,
      'SOURCE',
      ['INVALID_SOURCE'],
      `The chunk records a ${String(chunk.incident.kind)} incident, not a collision`,
    );
  }
  if (
    chunk.startTick > chunk.endTick ||
    chunk.incident.tick < chunk.startTick ||
    chunk.incident.tick > chunk.endTick ||
    chunk.incident.tick < chunk.incident.pinnedFromTick ||
    chunk.incident.tick > chunk.incident.pinnedToTick
  ) {
    return refused(
      valid.experimentId,
      'WINDOW',
      ['INCIDENT_OUTSIDE_WINDOW'],
      `The incident at ${chunk.incident.tick} is outside ${chunk.startTick}..${chunk.endTick}`,
    );
  }

  const projection = buildProjection(chunk, ports);
  if (projection.observed.length === 0) {
    return refused(
      valid.experimentId,
      'SOURCE',
      ['SOURCE_EMPTY'],
      `The clip ${chunk.startTick}..${chunk.endTick} has no observed transform row`,
    );
  }

  const target = valid.seekTick ?? chunk.incident.tick;
  if (target < chunk.startTick || target > chunk.endTick) {
    return refused(
      valid.experimentId,
      'SEEK',
      ['SEEK_OUT_OF_WINDOW'],
      `The seek target ${target} is outside the stored clip ${chunk.startTick}..${chunk.endTick}`,
    );
  }

  const span = Object.freeze({
    fromTick: chunk.incident.pinnedFromTick,
    toTick: chunk.incident.pinnedToTick,
    storedFromTick: chunk.startTick,
    storedToTick: chunk.endTick,
    incidentTick: chunk.incident.tick,
  });

  const source: ExperimentReplaySourceSummary = Object.freeze({
    chunkId: chunk.chunkId,
    sequence: chunk.sequence,
    sessionId: chunk.sessionId,
    worldEpoch: chunk.worldEpoch,
    versions: Object.freeze({ ...chunk.versions }),
    checksum: chunk.checksum,
    bytes: chunk.bytes,
    startTick: chunk.startTick,
    endTick: chunk.endTick,
    sealTick: chunk.sealTick,
    completeness: Object.freeze({
      ...chunk.completeness,
      reasons: Object.freeze([...chunk.completeness.reasons]),
      sampleGaps: Object.freeze(
        chunk.completeness.sampleGaps.map((gap) => Object.freeze({ ...gap })),
      ),
      before: Object.freeze({ ...chunk.completeness.before }),
      after: Object.freeze({ ...chunk.completeness.after }),
    }),
    sampling: Object.freeze({ ...chunk.sampling }),
    camera: Object.freeze({ ...chunk.camera }),
    learning: Object.freeze({ ...chunk.learning }),
    declaration: emptyDeclaration(),
  });

  /* Every lifecycle fact of the clip, per entity and in order: a vehicle can be removed and later
     created again, so the projector never collapses the timeline to a single tick. */
  const createdTicks = new Map<string, number[]>();
  for (const fact of chunk.lifecycle.created) {
    const ticks = createdTicks.get(fact.entityId) ?? [];
    ticks.push(fact.tick);
    createdTicks.set(fact.entityId, ticks);
  }
  const removedTicks = new Map<string, number[]>();
  for (const fact of chunk.lifecycle.removed) {
    const ticks = removedTicks.get(fact.entityId) ?? [];
    ticks.push(fact.tick);
    removedTicks.set(fact.entityId, ticks);
  }
  for (const ticks of [...createdTicks.values(), ...removedTicks.values()]) {
    ticks.sort((left, right) => left - right);
  }
  const firstOf = (ticks: readonly number[] | undefined): number | null =>
    ticks === undefined || ticks.length === 0 ? null : (ticks[0] ?? null);
  const creationTick = (entityId: string): number | null => firstOf(createdTicks.get(entityId));
  const removalTick = (entityId: string): number | null => firstOf(removedTicks.get(entityId));

  /**
   * Presence from the lifecycle facts alone: a removal at tick R is authoritative for every tick
   * `>= R` until a later creation, and a creation at tick C is authoritative for every tick `< C`.
   * The function is the single place where "absent" is decided, so the frame filter, the pose and
   * the incident view cannot disagree.
   */
  function presenceAt(
    entityId: string,
    tick: number,
  ): 'PRESENT' | 'BEFORE_CREATION' | 'AFTER_REMOVAL' {
    const creations = createdTicks.get(entityId) ?? [];
    const removals = removedTicks.get(entityId) ?? [];
    let lastCreation: number | null = null;
    for (const fact of creations)
      if (fact <= tick && (lastCreation === null || fact > lastCreation)) lastCreation = fact;
    let lastRemoval: number | null = null;
    for (const fact of removals)
      if (fact <= tick && (lastRemoval === null || fact > lastRemoval)) lastRemoval = fact;
    if (lastRemoval !== null && (lastCreation === null || lastRemoval >= lastCreation)) {
      return 'AFTER_REMOVAL';
    }
    if (lastCreation === null && creations.length > 0) return 'BEFORE_CREATION';
    return 'PRESENT';
  }

  const classOf = new Map<string, ExperimentReplayVehicleClass>();
  for (const entity of chunk.tables.entities) classOf.set(entity.entityId, entity.vehicleClass);

  const classified =
    chunk.incident.classifiedFromTick === null
      ? null
      : ports.readSample(chunk, chunk.incident.classifiedFromTick);
  const incidentEntities: ExperimentReplayIncidentEntity[] = chunk.incident.entityIds.map(
    (entityId) =>
      Object.freeze({
        entityId,
        vehicleClass: classOf.get(entityId) ?? 'UNKNOWN',
        controlMode:
          classified?.vehicles.find((vehicle) => vehicle.entityId === entityId)?.controlMode ??
          'UNKNOWN',
        inCamera:
          classified?.vehicles.find((vehicle) => vehicle.entityId === entityId)?.inCamera ?? null,
        createdTick: creationTick(entityId),
        removedTick: removalTick(entityId),
        observedInWindow: projection.seenEntities.has(entityId),
      }),
  );
  const invisible =
    incidentEntities.length > 0 && incidentEntities.every((entity) => entity.inCamera === false);
  const incident: ExperimentReplayIncidentView = Object.freeze({
    incidentId: chunk.incident.incidentId,
    kind: chunk.incident.kind,
    eventId: chunk.incident.eventId,
    tick: chunk.incident.tick,
    entityIds: Object.freeze([...chunk.incident.entityIds]),
    controlModes: Object.freeze([...chunk.incident.controlModes]),
    autoOnly: chunk.incident.autoOnly,
    visibility: chunk.incident.visibility,
    outsideCamera: chunk.incident.outsideCamera,
    invisible,
    classifiedFromTick: chunk.incident.classifiedFromTick,
    entities: Object.freeze(incidentEntities),
    createdInWindow: Object.freeze(
      chunk.lifecycle.created
        .filter((fact) => fact.tick >= chunk.startTick && fact.tick <= chunk.endTick)
        .map((fact) => Object.freeze({ ...fact })),
    ),
    removedInWindow: Object.freeze(
      chunk.lifecycle.removed
        .filter((fact) => fact.tick >= chunk.startTick && fact.tick <= chunk.endTick)
        .map((fact) => Object.freeze({ ...fact })),
    ),
  });

  /* --------------------------------------------------------------- state */

  let index = 0;
  for (let candidate = 0; candidate < projection.observed.length; candidate += 1) {
    const entry = projection.observed[candidate];
    if (entry !== undefined && entry.tick <= target) index = candidate;
  }
  /* The incident anchor: the last observed row at or before the incident tick. The exact incident
     tick stays available as `span.incidentTick`; a sub-cadence tick is never invented. */
  let incidentIndex = 0;
  for (let candidate = 0; candidate < projection.observed.length; candidate += 1) {
    const entry = projection.observed[candidate];
    if (entry !== undefined && entry.tick <= chunk.incident.tick) incidentIndex = candidate;
  }
  let paused = false;
  const checks: ExperimentReplayIsolationCheck[] = [];
  let baseline = snapshotIsolation(valid.isolation);

  function snapshotIsolation(port: ExperimentReplayIsolationPort): {
    readonly ledger: ExperimentLedgerFingerprint;
    readonly profile: ExperimentReplayProfileIdentity;
  } {
    return Object.freeze({
      ledger: requireLedgerFingerprint(port.ledger.fingerprint()),
      profile: requireProfileIdentity(port.profile.identity()),
    });
  }

  function changedLabels(
    before: ReturnType<typeof snapshotIsolation>,
    after: ReturnType<typeof snapshotIsolation>,
  ): readonly ExperimentReplayChangedLabel[] {
    const changed: ExperimentReplayChangedLabel[] = [];
    if (
      before.profile.checksum !== after.profile.checksum ||
      before.profile.profileId !== after.profile.profileId ||
      before.profile.versionId !== after.profile.versionId
    ) {
      changed.push('PROFILE');
    }
    if (before.ledger.learning !== after.ledger.learning) changed.push('LEARNING');
    if (before.ledger.rewards !== after.ledger.rewards) changed.push('REWARDS');
    if (before.ledger.kpi !== after.ledger.kpi) changed.push('KPI');
    return Object.freeze(changed);
  }

  function verifyOperation(operation: ExperimentReplayOperation): ExperimentReplayIsolationCheck {
    const after = snapshotIsolation(valid.isolation);
    const changed = changedLabels(baseline, after);
    const check: ExperimentReplayIsolationCheck = Object.freeze({
      operation,
      ledgerBefore: baseline.ledger,
      ledgerAfter: after.ledger,
      profileBefore: baseline.profile,
      profileAfter: after.profile,
      unchanged: changed.length === 0,
      changed,
      liveWrites: 0 as const,
    });
    checks.push(check);
    baseline = after;
    return check;
  }

  function position(): ExperimentReplayPosition {
    const entry = projection.observed[index];
    if (entry === undefined) throw new Error('141 replay position is outside the observed ticks');
    return Object.freeze({
      tick: entry.tick,
      index,
      observedTicks: projection.observed.length,
      firstObservedTick: projection.firstTick,
      lastObservedTick: projection.lastTick,
      atIncident: index === incidentIndex,
      paused,
      span,
      missing: projection.absences,
      completeness: source.completeness,
    });
  }

  function createdAt(tick: number): readonly string[] {
    return Object.freeze(
      chunk.lifecycle.created
        .filter((fact) => fact.tick === tick)
        .map((fact) => fact.entityId)
        .sort(),
    );
  }

  function removedAt(tick: number): readonly string[] {
    return Object.freeze(
      chunk.lifecycle.removed
        .filter((fact) => fact.tick === tick)
        .map((fact) => fact.entityId)
        .sort(),
    );
  }

  function frameAt(position2: number): ExperimentReplayFrame {
    const entry = projection.observed[position2];
    if (entry === undefined) throw new Error('141 replay frame is outside the observed ticks');
    /* A lifecycle fact is authoritative: a row that survived into the sample of a removal tick is
       not drawn, so the vehicle is never resurrected after its exact removal tick. */
    const vehicles = entry.sample.vehicles.filter(
      (vehicle) => presenceAt(vehicle.entityId, entry.tick) === 'PRESENT',
    );
    return Object.freeze({
      tick: entry.tick,
      observed: true as const,
      vehicles: Object.freeze(vehicles.map((vehicle) => Object.freeze({ ...vehicle }))),
      signals: Object.freeze(entry.sample.signals.map((signal) => Object.freeze({ ...signal }))),
      created: createdAt(entry.tick),
      removed: removedAt(entry.tick),
      missing: Object.freeze([...(projection.gapBefore[position2] ?? [])]),
      interpolation: 'NONE' as const,
    });
  }

  function skippedBetween(from: number, to: number): readonly ExperimentReplayAbsence[] {
    return Object.freeze(
      projection.absences.filter((range) => range.fromTick > from && range.toTick < to),
    );
  }

  function seek(tick?: number): ExperimentReplaySeekResult {
    const requested = tick === undefined ? chunk.incident.tick : tick;
    if (
      typeof requested !== 'number' ||
      !Number.isSafeInteger(requested) ||
      requested < chunk.startTick ||
      requested > chunk.endTick
    ) {
      return Object.freeze({
        status: 'REFUSED' as const,
        code: 'SEEK_OUT_OF_WINDOW' as ExperimentReplayRejectionCode,
        requestedTick: typeof requested === 'number' ? requested : chunk.startTick,
        landedTick: null,
        exact: false,
        atIncident: index === incidentIndex,
        span,
        missing: Object.freeze([]),
        detail: `The seek target ${String(requested)} is outside the stored clip ${chunk.startTick}..${chunk.endTick}`,
        position: null,
        isolation: verifyOperation('SEEK'),
      });
    }
    let landed = 0;
    for (let candidate = 0; candidate < projection.observed.length; candidate += 1) {
      const entry = projection.observed[candidate];
      if (entry !== undefined && entry.tick <= requested) landed = candidate;
    }
    index = landed;
    const entry = projection.observed[landed];
    const landedTick = entry?.tick ?? null;
    /* Landing on the last observed row at or before the target proves that no observed row exists
       in (landed, requested]; the whole span is declared instead of being interpolated here. */
    const missing =
      landedTick === null || requested <= landedTick
        ? Object.freeze([] as ExperimentReplayAbsence[])
        : Object.freeze([
            absence(
              'TICK_NOT_OBSERVED',
              landedTick + 1,
              requested,
              `The seek target ${requested} has no recorded row; the replay lands on ${landedTick} and declares ${requested - landedTick} tick(s) absent`,
            ),
          ]);
    return Object.freeze({
      status: 'SEEKED' as const,
      code: null,
      requestedTick: requested,
      landedTick,
      exact: landedTick === requested,
      atIncident: landed === incidentIndex,
      span,
      missing,
      detail:
        landedTick === requested
          ? `Landed on the observed tick ${requested}`
          : `Landed on the last observed tick ${String(landedTick)} at or before ${requested}; the ticks in between are declared absent`,
      position: position(),
      isolation: verifyOperation('SEEK'),
    });
  }

  function play(): ExperimentReplayStep {
    if (paused) {
      return Object.freeze({
        status: 'PAUSED' as const,
        frame: frameAt(index),
        advancedTicks: 0,
        skipped: Object.freeze([]),
        position: position(),
        isolation: verifyOperation('PLAY'),
      });
    }
    if (index >= projection.observed.length - 1) {
      return Object.freeze({
        status: 'AT_END' as const,
        frame: frameAt(index),
        advancedTicks: 0,
        skipped: Object.freeze([]),
        position: position(),
        isolation: verifyOperation('PLAY'),
      });
    }
    const previous = projection.observed[index]?.tick ?? 0;
    index += 1;
    const current = projection.observed[index]?.tick ?? previous;
    return Object.freeze({
      status: 'ADVANCED' as const,
      frame: frameAt(index),
      advancedTicks: current - previous,
      skipped: skippedBetween(previous, current),
      position: position(),
      isolation: verifyOperation('PLAY'),
    });
  }

  function pause(): ExperimentReplayPauseResult {
    const already = paused;
    paused = true;
    return Object.freeze({
      status: already ? ('ALREADY_PAUSED' as const) : ('PAUSED' as const),
      frame: frameAt(index),
      position: position(),
      isolation: verifyOperation('PAUSE'),
    });
  }

  function resume(): ExperimentReplayStep {
    paused = false;
    return Object.freeze({
      status: 'RESUMED' as const,
      frame: frameAt(index),
      advancedTicks: 0,
      skipped: Object.freeze([]),
      position: position(),
      isolation: verifyOperation('RESUME'),
    });
  }

  function poseAt(tick: number, entityId: string): ExperimentReplayPoseResult {
    const absent = (
      reason: ExperimentReplayAbsenceReason,
      detail: string,
    ): ExperimentReplayPoseResult =>
      Object.freeze({ status: 'ABSENT' as const, tick, entityId, reason, detail });
    if (!Number.isSafeInteger(tick) || tick < chunk.startTick || tick > chunk.endTick) {
      return absent(
        'OUT_OF_WINDOW',
        `The tick ${String(tick)} is outside ${chunk.startTick}..${chunk.endTick}`,
      );
    }
    if (!classOf.has(entityId)) {
      return absent('ENTITY_UNKNOWN', `The entity ${entityId} is not in the chunk tables`);
    }
    const presence = presenceAt(entityId, tick);
    if (presence === 'BEFORE_CREATION') {
      return absent(
        'ENTITY_NOT_YET_CREATED',
        `The entity exists from tick ${String(creationTick(entityId))}`,
      );
    }
    if (presence === 'AFTER_REMOVAL') {
      return absent(
        'ENTITY_REMOVED',
        `The entity was removed at tick ${String(removalTick(entityId))} and stays removed`,
      );
    }
    let fromIndex = -1;
    let toIndex = -1;
    for (let candidate = 0; candidate < projection.observed.length; candidate += 1) {
      const entry = projection.observed[candidate];
      if (entry === undefined) continue;
      if (entry.tick <= tick) fromIndex = candidate;
      if (entry.tick >= tick && toIndex === -1) toIndex = candidate;
    }
    if (fromIndex < 0 || toIndex < 0) {
      return absent('TICK_NOT_OBSERVED', 'No observed tick brackets the requested tick');
    }
    const from = projection.observed[fromIndex];
    const to = projection.observed[toIndex];
    if (from === undefined || to === undefined) {
      return absent('TICK_NOT_OBSERVED', 'No observed tick brackets the requested tick');
    }
    const start = from.sample.vehicles.find((vehicle) => vehicle.entityId === entityId);
    const end = to.sample.vehicles.find((vehicle) => vehicle.entityId === entityId);
    if (start === undefined) {
      return absent(
        'ENTITY_NOT_OBSERVED',
        `No recorded row carries ${entityId} at tick ${from.tick}`,
      );
    }
    if (from.tick === tick) {
      return Object.freeze({
        status: 'OBSERVED' as const,
        tick,
        entityId,
        position: Object.freeze({ ...start.position }),
        rotation: Object.freeze({ ...start.rotation }),
        interpolation: 'NONE' as const,
      });
    }
    const adjacent = to.tick === from.tick + chunk.sampling.cadenceTicks;
    if (end === undefined) {
      /* The row disappears between two adjacent samples: the lifecycle fact that explains it is
         named instead of a generic "not observed". */
      const endPresence = presenceAt(entityId, to.tick);
      if (endPresence === 'AFTER_REMOVAL') {
        return absent(
          'ENTITY_REMOVED',
          `The entity was removed at tick ${String(removalTick(entityId))} and stays removed`,
        );
      }
      if (endPresence === 'BEFORE_CREATION') {
        return absent(
          'ENTITY_NOT_YET_CREATED',
          `The entity exists from tick ${String(creationTick(entityId))}`,
        );
      }
      return absent(
        'ENTITY_NOT_OBSERVED',
        `No recorded row carries ${entityId} at tick ${to.tick}`,
      );
    }
    if (!adjacent) {
      return absent(
        'TICK_NOT_OBSERVED',
        `The transforms at ${from.tick} and ${to.tick} are not two adjacent recorded rows, so no pose is interpolated`,
      );
    }
    const alpha = (tick - from.tick) / (to.tick - from.tick);
    const mix = (a: number, b: number): number => a + (b - a) * alpha;
    let x = mix(start.rotation.x, end.rotation.x);
    let y = mix(start.rotation.y, end.rotation.y);
    let z = mix(start.rotation.z, end.rotation.z);
    let w = mix(start.rotation.w, end.rotation.w);
    const length = Math.hypot(x, y, z, w);
    if (Number.isFinite(length) && length > 0) {
      x /= length;
      y /= length;
      z /= length;
      w /= length;
    }
    return Object.freeze({
      status: 'INTERPOLATED' as const,
      tick,
      entityId,
      fromTick: from.tick,
      toTick: to.tick,
      alpha,
      position: Object.freeze({
        x: mix(start.position.x, end.position.x),
        y: mix(start.position.y, end.position.y),
        z: mix(start.position.z, end.position.z),
      }),
      rotation: Object.freeze({ x, y, z, w }),
      interpolation: 'LINEAR' as const,
    });
  }

  function replay(): ExperimentReplayRun {
    const frames: ExperimentReplayFrame[] = [];
    const missing: ExperimentReplayAbsence[] = [];
    for (let candidate = index; candidate < projection.observed.length; candidate += 1) {
      frames.push(frameAt(candidate));
      for (const range of projection.gapBefore[candidate] ?? []) missing.push(range);
    }
    const end = Math.max(0, projection.observed.length - 1);
    index = end;
    return Object.freeze({
      status: 'REPLAYED' as const,
      frames: Object.freeze(frames),
      ticks: frames.length,
      missing: Object.freeze(missing),
      position: position(),
      isolation: verifyOperation('REPLAY'),
    });
  }

  function isolation(): ExperimentReplayIsolationVerification {
    const changed = new Set<ExperimentReplayChangedLabel>();
    for (const check of checks) for (const label of check.changed) changed.add(label);
    return Object.freeze({
      facts: experimentReplayImmutableFacts,
      coverage: experimentReplayImmutableCoverage,
      checks: Object.freeze([...checks]),
      unchanged: checks.every((check) => check.unchanged),
      changed: Object.freeze([...changed]),
      liveWrites: 0 as const,
    });
  }

  const player: ExperimentReplayPlayer = Object.freeze({
    version: EXPERIMENT_REPLAY_VERSION,
    experimentId: valid.experimentId,
    declaration: source.declaration,
    source,
    incident,
    position,
    frame: () => frameAt(index),
    seek,
    play,
    pause,
    resume,
    poseAt,
    replay,
    isolation,
  });

  return Object.freeze({
    status: 'READY' as const,
    version: EXPERIMENT_REPLAY_VERSION,
    experimentId: valid.experimentId,
    source,
    player,
    position: player.position(),
  });
}
