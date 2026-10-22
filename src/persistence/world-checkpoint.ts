import { PERSISTENCE_LIMITS, PersistenceError, boundedText } from './contracts';
import type {
  CheckpointRecord,
  PersistenceReasonCode,
  RepositoryRole,
  RepositoryState,
  WriteResult,
} from './contracts';
import type { LocalRepository } from './repository';
import { captureWorldSnapshot, readWorldSnapshot, restoreWorldState } from './world-snapshot';
import type {
  WorldCaptureInput,
  WorldResumePlan,
  WorldSnapshot,
  WorldSnapshotRejectionCode,
  WorldSnapshotState,
  WorldTickBoundary,
} from './world-snapshot';

/**
 * Capture coordinator for the complete world checkpoint (PBI 206).
 *
 * The snapshot document and its checksum live in `world-snapshot.ts`. This module owns the parts
 * Docs/15 and Docs/25 make operational:
 *
 * 1. **One coherent tick.** The source declares its tick and boundary; the capture is refused
 *    while the fixed-tick loop is inside a step, and every subsystem tick must equal that tree.
 * 2. **One writer.** A page owns the repository writer lock (127). A second tab can read but this
 *    writer refuses to capture with `WRITER_REQUIRED`; a capture carries the writer token that
 *    produced it, so another page cannot commit it.
 * 3. **One preparing and one committing generation.** A redundant request for the same tick is
 *    coalesced, a newer tick replaces the prepared one, an older one is refused, and a second
 *    concurrent commit is refused instead of opening a second transaction.
 * 4. **Honest cost.** Reading the world is timed synchronously; canonicalization/checking is timed
 *    separately; the IndexedDB commit is timed around the write. The asynchronous storage never
 *    hides the synchronous copy.
 * 5. **Device loss.** A lost GPU does not discard the world: the same capture comes from RAM,
 *    stays prepared, refuses a durable commit with `DEVICE_LOST` and is committed by
 *    `commitDeferred()` after the recovery is integrated.
 */

export const WORLD_CHECKPOINT_VERSION = '206-world-checkpoint-v1' as const;

export const worldCheckpointRejectionCodes = [
  'WRITER_REQUIRED',
  'WRITER_MISMATCH',
  'COMMIT_IN_PROGRESS',
  'NOTHING_PREPARED',
  'STALE_TICK',
  'STALE_GENERATION',
  'TICK_NOT_BOUNDARY',
  'CAPTURE_TICK_MISMATCH',
  'DEVICE_LOST',
  'DEVICE_NOT_INTEGRATED',
  'CRASHED_BEFORE_COMMIT',
  'REPOSITORY_CLOSED',
  'INVALID_CAPTURE',
  'INCOMPATIBLE_VERSION',
  'TICK_MISMATCH',
  'PROFILE_MISMATCH',
  'LEARNING_EPOCH_MISMATCH',
] as const;
export type WorldCheckpointWriterCode = (typeof worldCheckpointRejectionCodes)[number];

export type WorldCheckpointRejectionCode =
  WorldCheckpointWriterCode | WorldSnapshotRejectionCode | PersistenceReasonCode;

export interface WorldCheckpointRejection {
  readonly code: WorldCheckpointRejectionCode;
  readonly message: string;
  readonly path: string;
}

export interface WorldCheckpointVersions {
  readonly engineVersion: string;
  readonly physicsVersion: string;
  readonly mapVersion: string;
}

export type WorldWriterCaptureDevice = 'GPU' | 'RAM';
export type WorldWriterDevice = WorldWriterCaptureDevice | 'LOST' | 'INTEGRATED';

export const worldDeviceLossReasons = [
  'GPU_DEVICE_LOST',
  'CONTEXT_LOST',
  'DEVICE_REMOVED',
] as const;
export type WorldDeviceLossReason = (typeof worldDeviceLossReasons)[number];

export const worldDiscardReasons = ['SUPERSEDED', 'SHUTDOWN', 'INVALIDATED'] as const;
export type WorldDiscardReason = (typeof worldDiscardReasons)[number];

/** The live world, read synchronously at a fixed-tick boundary. */
export interface WorldSnapshotSource {
  /** Authoritative tick at the moment the source is asked to capture. */
  readonly tick: number;
  /** `BOUNDARY` outside the fixed step; the capture refuses to read during a step. */
  readonly boundary: WorldTickBoundary;
  /** Returns a complete copy; the capture never reads the live world again. */
  capture(): WorldCaptureInput;
}

export interface WorldCaptureIdentity {
  readonly checkpointId: string;
  readonly sessionId: string;
  /** Monotonic checkpoint generation for this writer; a lower one never replaces a higher one. */
  readonly generation: number;
}

export interface WorldCapture {
  readonly token: string;
  readonly writerId: string;
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly generation: number;
  readonly tick: number;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly profileId: string;
  readonly snapshot: WorldSnapshot;
  readonly body: Readonly<Record<string, unknown>>;
  readonly bytes: number;
  readonly checksum: string;
  readonly device: WorldWriterCaptureDevice;
  /** Synchronous world copy, measured on its own. */
  readonly captureMs: number;
  /** Validation, canonicalization and checksum, measured after the copy. */
  readonly encodeMs: number;
  readonly capturedAt: string;
}

export interface WorldCommitSummary {
  readonly tick: number;
  readonly generation: number;
  readonly bytes: number;
  readonly checksum: string;
  readonly at: string;
  readonly device: WorldWriterCaptureDevice;
}

export interface WorldCheckpointWriterStatus {
  readonly writerId: string;
  readonly state: RepositoryState;
  readonly role: RepositoryRole;
  readonly device: WorldWriterDevice;
  readonly deviceLostTick: number | null;
  readonly deviceLossReason: WorldDeviceLossReason | null;
  readonly preparedTick: number | null;
  readonly preparedGeneration: number | null;
  readonly preparedDevice: WorldWriterCaptureDevice | null;
  readonly preparedToken: string | null;
  readonly committing: string | null;
  readonly captures: number;
  readonly coalesced: number;
  readonly replaced: number;
  readonly commits: number;
  readonly rejections: number;
  readonly deviceLosses: number;
  readonly discarded: number;
  readonly lastDiscardReason: WorldDiscardReason | null;
  readonly lastCommit: WorldCommitSummary | null;
}

export interface WorldCapturePrepared {
  readonly status: 'PREPARED';
  readonly capture: WorldCapture;
  readonly coalesced: boolean;
  readonly replaced: boolean;
}

export interface WorldCaptureRefused {
  readonly status: 'REJECTED';
  readonly capture: null;
  readonly rejection: WorldCheckpointRejection;
}

export type WorldCaptureResult = WorldCapturePrepared | WorldCaptureRefused;

export interface WorldCommitHooks {
  /** Runs after every check but before the transaction; a throw leaves no durable row. */
  readonly beforeCommit?: (capture: WorldCapture) => void | Promise<void>;
  /** Runs after the transaction committed; a throw models a process death after durability. */
  readonly afterCommit?: (capture: WorldCapture) => void;
}

export interface WorldCommitCommitted {
  readonly status: 'COMMITTED';
  readonly value: CheckpointRecord;
  readonly capture: WorldCapture;
  readonly commitMs: number;
}

export interface WorldCommitCrashedAfterCommit {
  readonly status: 'CRASHED_AFTER_COMMIT';
  readonly value: CheckpointRecord;
  readonly capture: WorldCapture;
  readonly commitMs: number;
}

export interface WorldCommitRefused {
  readonly status: 'REJECTED';
  readonly value: null;
  readonly capture: WorldCapture | null;
  readonly rejection: WorldCheckpointRejection;
}

export type WorldCommitResult =
  WorldCommitCommitted | WorldCommitCrashedAfterCommit | WorldCommitRefused;

export interface WorldCheckpointWriter {
  status(): WorldCheckpointWriterStatus;
  /** Captures the world at `source.tick`; returns the prepared generation. */
  captureAtTick(source: WorldSnapshotSource, identity: WorldCaptureIdentity): WorldCaptureResult;
  /** Publishes one prepared generation. The durable row is the checkpoint envelope of 127/129. */
  commitCapture(capture: WorldCapture, hooks?: WorldCommitHooks): Promise<WorldCommitResult>;
  /** Commits the RAM capture kept across a device loss, after recovery was integrated. */
  commitDeferred(hooks?: WorldCommitHooks): Promise<WorldCommitResult>;
  /** Drops a prepared generation that the caller no longer wants to publish. */
  discardPrepared(reason: WorldDiscardReason): boolean;
  /** The renderer is gone; captures keep using RAM and durable commits wait for integration. */
  deviceLoss(reason: WorldDeviceLossReason): WorldCheckpointWriterStatus;
  integrateRecovery(): WorldCheckpointWriterStatus;
}

export interface WorldCheckpointWriterOptions {
  readonly repository: LocalRepository;
  readonly writerId: string;
  readonly versions: WorldCheckpointVersions;
  /** Monotonic milliseconds; injected so the cost transcript is deterministic in tests. */
  readonly monotonic?: () => number;
  readonly now?: () => string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The world checkpoint operation failed';
}

function defaultMonotonic(): number {
  if (typeof performance === 'object' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function rejection(
  code: WorldCheckpointRejectionCode,
  text: string,
  path = 'checkpoint',
): WorldCheckpointRejection {
  return Object.freeze({ code, message: text, path });
}

function refused(
  code: WorldCheckpointRejectionCode,
  text: string,
  path = 'checkpoint',
): WorldCaptureRefused {
  return Object.freeze({
    status: 'REJECTED' as const,
    capture: null,
    rejection: rejection(code, text, path),
  });
}

function refusedCommit(
  code: WorldCheckpointRejectionCode,
  text: string,
  capture: WorldCapture | null,
  path = 'checkpoint',
): WorldCommitRefused {
  return Object.freeze({
    status: 'REJECTED' as const,
    value: null,
    capture,
    rejection: rejection(code, text, path),
  });
}

function elapsed(start: number, end: number): number {
  const value = end - start;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function createWorldCheckpointWriter(
  options: WorldCheckpointWriterOptions,
): WorldCheckpointWriter {
  const repository = options.repository;
  const writerId = boundedText(options.writerId, 'writerId', PERSISTENCE_LIMITS.maxIdCodeUnits);
  const versions = Object.freeze({
    engineVersion: boundedText(
      options.versions.engineVersion,
      'engineVersion',
      PERSISTENCE_LIMITS.maxTextCodeUnits,
    ),
    physicsVersion: boundedText(
      options.versions.physicsVersion,
      'physicsVersion',
      PERSISTENCE_LIMITS.maxTextCodeUnits,
    ),
    mapVersion: boundedText(
      options.versions.mapVersion,
      'mapVersion',
      PERSISTENCE_LIMITS.maxTextCodeUnits,
    ),
  });
  const monotonic = options.monotonic ?? defaultMonotonic;
  const now = options.now ?? (() => new Date().toISOString());

  let prepared: WorldCapture | null = null;
  let committing: string | null = null;
  let device: WorldWriterDevice = 'GPU';
  let deviceLostTick: number | null = null;
  let deviceLossReason: WorldDeviceLossReason | null = null;
  let lastCommit: WorldCommitSummary | null = null;
  let lastDiscardReason: WorldDiscardReason | null = null;
  let sequence = 0;
  const counters = {
    captures: 0,
    coalesced: 0,
    replaced: 0,
    commits: 0,
    rejections: 0,
    deviceLosses: 0,
    discarded: 0,
  };

  function status(): WorldCheckpointWriterStatus {
    const repositoryStatus = repository.status();
    return Object.freeze({
      writerId,
      state: repositoryStatus.state,
      role: repositoryStatus.role,
      device,
      deviceLostTick,
      deviceLossReason,
      preparedTick: prepared?.tick ?? null,
      preparedGeneration: prepared?.generation ?? null,
      preparedDevice: prepared?.device ?? null,
      preparedToken: prepared?.token ?? null,
      committing,
      captures: counters.captures,
      coalesced: counters.coalesced,
      replaced: counters.replaced,
      commits: counters.commits,
      rejections: counters.rejections,
      deviceLosses: counters.deviceLosses,
      discarded: counters.discarded,
      lastDiscardReason,
      lastCommit,
    });
  }

  function clearPrepared(capture: WorldCapture): void {
    if (prepared !== null && prepared.token === capture.token) prepared = null;
  }

  function captureAtTick(
    source: WorldSnapshotSource,
    identity: WorldCaptureIdentity,
  ): WorldCaptureResult {
    const repositoryStatus = repository.status();
    if (repositoryStatus.state !== 'READY') {
      counters.rejections += 1;
      return refused('REPOSITORY_CLOSED', `The repository is ${repositoryStatus.state}`);
    }
    if (repositoryStatus.role !== 'WRITER') {
      counters.rejections += 1;
      return refused(
        'WRITER_REQUIRED',
        'This page does not own the writer lock; a second tab never starts a concurrent capture',
      );
    }
    let checkpointId: string;
    let sessionId: string;
    try {
      checkpointId = boundedText(
        identity.checkpointId,
        'checkpointId',
        PERSISTENCE_LIMITS.maxIdCodeUnits,
      );
      sessionId = boundedText(identity.sessionId, 'sessionId', PERSISTENCE_LIMITS.maxIdCodeUnits);
    } catch (error) {
      counters.rejections += 1;
      return refused('INVALID_CAPTURE', message(error), 'checkpoint.identity');
    }
    if (!Number.isSafeInteger(identity.generation) || identity.generation < 0) {
      counters.rejections += 1;
      return refused(
        'STALE_GENERATION',
        'The checkpoint generation must be a nonnegative safe integer',
        'checkpoint.generation',
      );
    }
    if (lastCommit !== null && identity.generation <= lastCommit.generation) {
      counters.rejections += 1;
      return refused(
        'STALE_GENERATION',
        `Generation ${identity.generation} is not newer than the committed ${lastCommit.generation}`,
        'checkpoint.generation',
      );
    }
    if (lastCommit !== null && source.tick < lastCommit.tick) {
      counters.rejections += 1;
      return refused(
        'STALE_TICK',
        `Tick ${source.tick} is older than the committed tick ${lastCommit.tick}`,
        'checkpoint.tick',
      );
    }
    if (source.boundary !== 'BOUNDARY') {
      counters.rejections += 1;
      return refused(
        'TICK_NOT_BOUNDARY',
        'The fixed-tick loop is inside a step; the capture waits for the boundary',
        'checkpoint.boundary',
      );
    }
    if (prepared !== null) {
      if (prepared.tick === source.tick && prepared.generation === identity.generation) {
        counters.coalesced += 1;
        return Object.freeze({
          status: 'PREPARED' as const,
          capture: prepared,
          coalesced: true,
          replaced: false,
        });
      }
      if (source.tick < prepared.tick) {
        counters.rejections += 1;
        return refused(
          'STALE_TICK',
          `Tick ${source.tick} is older than the prepared tick ${prepared.tick}`,
          'checkpoint.tick',
        );
      }
      if (source.tick === prepared.tick && identity.generation < prepared.generation) {
        counters.rejections += 1;
        return refused(
          'STALE_GENERATION',
          `Generation ${identity.generation} is older than the prepared ${prepared.generation}`,
          'checkpoint.generation',
        );
      }
    }

    const start = monotonic();
    let input: WorldCaptureInput;
    try {
      input = source.capture();
    } catch (error) {
      counters.rejections += 1;
      return refused('INVALID_CAPTURE', message(error), 'checkpoint.capture');
    }
    const captureMs = elapsed(start, monotonic());
    if (input.tick !== source.tick) {
      counters.rejections += 1;
      return refused(
        'CAPTURE_TICK_MISMATCH',
        `The source ticks at ${source.tick} but the captured tree is at tick ${input.tick}`,
        'checkpoint.tick',
      );
    }

    const encodeStart = monotonic();
    const encoded = captureWorldSnapshot(input);
    const encodeMs = elapsed(encodeStart, monotonic());
    if (encoded.status === 'REJECTED') {
      counters.rejections += 1;
      return Object.freeze({
        status: 'REJECTED' as const,
        capture: null,
        rejection: Object.freeze({
          code: encoded.rejection.code,
          message: encoded.rejection.message,
          path: encoded.rejection.path,
        }),
      });
    }

    sequence += 1;
    const capture: WorldCapture = Object.freeze({
      token: `${writerId}:${sequence}`,
      writerId,
      checkpointId,
      sessionId,
      generation: identity.generation,
      tick: encoded.snapshot.tick,
      worldEpoch: encoded.snapshot.worldEpoch,
      learningEpoch: encoded.snapshot.learning.learningEpoch,
      profileId: encoded.snapshot.profile.profileId,
      snapshot: encoded.snapshot,
      body: encoded.body,
      bytes: encoded.bytes,
      checksum: encoded.checksum,
      device: device === 'GPU' ? 'GPU' : 'RAM',
      captureMs,
      encodeMs,
      capturedAt: now(),
    });
    const replaced = prepared !== null;
    if (replaced) counters.replaced += 1;
    prepared = capture;
    counters.captures += 1;
    return Object.freeze({
      status: 'PREPARED' as const,
      capture,
      coalesced: false,
      replaced,
    });
  }

  function recordFor(capture: WorldCapture) {
    return {
      schemaVersion: 1 as const,
      checkpointId: capture.checkpointId,
      sessionId: capture.sessionId,
      profileId: capture.profileId,
      worldEpoch: capture.worldEpoch,
      tick: capture.tick,
      generation: capture.generation,
      learningEpoch: capture.learningEpoch,
      engineVersion: versions.engineVersion,
      physicsVersion: versions.physicsVersion,
      mapVersion: versions.mapVersion,
      createdAt: now(),
      body: capture.body,
    };
  }

  async function commitCapture(
    capture: WorldCapture,
    hooks: WorldCommitHooks = {},
  ): Promise<WorldCommitResult> {
    if (committing !== null) {
      counters.rejections += 1;
      return refusedCommit(
        'COMMIT_IN_PROGRESS',
        'Another checkpoint generation is already being committed',
        capture,
      );
    }
    if (capture.writerId !== writerId || !capture.token.startsWith(`${writerId}:`)) {
      counters.rejections += 1;
      return refusedCommit(
        'WRITER_MISMATCH',
        'The capture belongs to another writer and cannot be published by this page',
        capture,
        'checkpoint.token',
      );
    }
    if (device === 'LOST') {
      counters.rejections += 1;
      return refusedCommit(
        'DEVICE_LOST',
        'The GPU is lost; the capture stays in RAM until the recovery is integrated',
        capture,
        'checkpoint.device',
      );
    }
    if (lastCommit !== null && capture.generation <= lastCommit.generation) {
      counters.rejections += 1;
      return refusedCommit(
        'STALE_GENERATION',
        `Generation ${capture.generation} was already published`,
        capture,
        'checkpoint.generation',
      );
    }
    const repositoryStatus = repository.status();
    if (repositoryStatus.state !== 'READY') {
      counters.rejections += 1;
      return refusedCommit(
        'REPOSITORY_CLOSED',
        `The repository is ${repositoryStatus.state}`,
        capture,
      );
    }
    if (repositoryStatus.role !== 'WRITER') {
      counters.rejections += 1;
      return refusedCommit(
        'WRITER_REQUIRED',
        'This page does not own the writer lock',
        capture,
        'writer',
      );
    }

    committing = capture.token;
    try {
      if (hooks.beforeCommit !== undefined) {
        try {
          await hooks.beforeCommit(capture);
        } catch (error) {
          counters.rejections += 1;
          clearPrepared(capture);
          return refusedCommit('CRASHED_BEFORE_COMMIT', message(error), capture);
        }
      }
      const commitStart = monotonic();
      let written: WriteResult<CheckpointRecord>;
      try {
        written = await repository.putCheckpoint(recordFor(capture));
      } catch (error) {
        counters.rejections += 1;
        clearPrepared(capture);
        const code: WorldCheckpointRejectionCode =
          error instanceof PersistenceError ? error.code : 'TRANSACTION_ABORTED';
        return refusedCommit(code, message(error), capture);
      }
      const commitMs = elapsed(commitStart, monotonic());
      if (written.status === 'REJECTED') {
        counters.rejections += 1;
        clearPrepared(capture);
        return Object.freeze({
          status: 'REJECTED' as const,
          value: null,
          capture,
          rejection: Object.freeze({
            code: written.rejection.code,
            message: written.rejection.message,
            path: written.rejection.path ?? 'checkpoint',
          }),
        });
      }
      counters.commits += 1;
      lastCommit = Object.freeze({
        tick: capture.tick,
        generation: capture.generation,
        bytes: written.bytes,
        checksum: capture.checksum,
        at: now(),
        device: capture.device,
      });
      clearPrepared(capture);
      const committed: WorldCommitCommitted = Object.freeze({
        status: 'COMMITTED' as const,
        value: written.value,
        capture,
        commitMs,
      });
      if (hooks.afterCommit !== undefined) {
        try {
          hooks.afterCommit(capture);
        } catch {
          // The transaction already committed: the row is durable even if the caller died.
          return Object.freeze({
            status: 'CRASHED_AFTER_COMMIT' as const,
            value: written.value,
            capture,
            commitMs,
          });
        }
      }
      return committed;
    } finally {
      committing = null;
    }
  }

  async function commitDeferred(hooks: WorldCommitHooks = {}): Promise<WorldCommitResult> {
    if (device !== 'INTEGRATED') {
      counters.rejections += 1;
      return refusedCommit(
        'DEVICE_NOT_INTEGRATED',
        'No recovery was integrated; the RAM capture cannot be published yet',
        prepared,
        'checkpoint.device',
      );
    }
    if (prepared === null) {
      counters.rejections += 1;
      return refusedCommit('NOTHING_PREPARED', 'No checkpoint generation is prepared', null);
    }
    return commitCapture(prepared, hooks);
  }

  function discardPrepared(reason: WorldDiscardReason): boolean {
    if (!(worldDiscardReasons as readonly string[]).includes(reason)) {
      throw new PersistenceError(
        'INVALID_RECORD',
        `Unsupported discard reason: ${String(reason)}`,
        'checkpoint.discard',
      );
    }
    if (prepared === null) return false;
    prepared = null;
    counters.discarded += 1;
    lastDiscardReason = reason;
    return true;
  }

  function deviceLoss(reason: WorldDeviceLossReason): WorldCheckpointWriterStatus {
    if (!(worldDeviceLossReasons as readonly string[]).includes(reason)) {
      throw new PersistenceError(
        'INVALID_RECORD',
        `Unsupported device loss reason: ${String(reason)}`,
        'checkpoint.device',
      );
    }
    if (device !== 'LOST') {
      device = 'LOST';
      counters.deviceLosses += 1;
      deviceLostTick = prepared?.tick ?? lastCommit?.tick ?? null;
      deviceLossReason = reason;
      if (prepared !== null && prepared.device === 'GPU') {
        // The prepared capture is already an immutable plain-data copy in the JS heap, so it
        // survives the GPU loss; it is published from RAM once the recovery is integrated.
        prepared = Object.freeze({ ...prepared, device: 'RAM' as const });
      }
    }
    return status();
  }

  function integrateRecovery(): WorldCheckpointWriterStatus {
    if (device === 'LOST') {
      device = 'INTEGRATED';
      deviceLossReason = null;
    }
    return status();
  }

  return Object.freeze({
    status,
    captureAtTick,
    commitCapture,
    commitDeferred,
    discardPrepared,
    deviceLoss,
    integrateRecovery,
  });
}

/* ---------------------------------------------------------- checkpoint load */

export interface WorldCheckpointLoadOptions {
  readonly versions: WorldCheckpointVersions;
  /** Current tick, used only to report the age of the checkpoint. */
  readonly currentTick?: number;
  readonly currentProfileId?: string;
  readonly currentLearningEpoch?: number;
}

export interface WorldCheckpointEmpty {
  readonly status: 'EMPTY';
  readonly checkpoint: null;
}

export interface WorldCheckpointResumable {
  readonly status: 'RESUMABLE';
  readonly checkpoint: CheckpointRecord;
  readonly snapshot: WorldSnapshot;
  readonly state: WorldSnapshotState;
  readonly resume: WorldResumePlan;
  readonly tick: number;
  readonly generation: number;
  readonly bytes: number;
  readonly checksum: string;
  readonly ageTicks: number | null;
}

export interface WorldCheckpointIncompatible {
  readonly status: 'INCOMPATIBLE';
  readonly checkpoint: CheckpointRecord;
  readonly snapshot: WorldSnapshot;
  readonly stored: WorldCheckpointVersions;
  readonly current: WorldCheckpointVersions;
  readonly reason: 'INCOMPATIBLE_VERSION';
  readonly detail: string;
  readonly tick: number;
  readonly generation: number;
}

export interface WorldCheckpointLoadRejected {
  readonly status: 'REJECTED';
  readonly checkpoint: CheckpointRecord | null;
  readonly rejection: WorldCheckpointRejection;
}

export type WorldCheckpointLoadResult =
  | WorldCheckpointEmpty
  | WorldCheckpointResumable
  | WorldCheckpointIncompatible
  | WorldCheckpointLoadRejected;

function loadRejected(
  code: WorldCheckpointRejectionCode,
  text: string,
  checkpoint: CheckpointRecord | null,
  path = 'checkpoint',
): WorldCheckpointLoadRejected {
  return Object.freeze({
    status: 'REJECTED' as const,
    checkpoint,
    rejection: rejection(code, text, path),
  });
}

/**
 * Reads the latest checkpoint of a session and decides whether the world can continue in it.
 * An incompatible engine/physics/map version is explicit: the caller may still export the
 * checkpoint, but this function never promises that the old world will continue.
 */
export async function loadLatestWorldCheckpoint(
  repository: LocalRepository,
  sessionId: string,
  options: WorldCheckpointLoadOptions,
): Promise<WorldCheckpointLoadResult> {
  let checkpoint: CheckpointRecord | null;
  try {
    const key = boundedText(sessionId, 'sessionId', PERSISTENCE_LIMITS.maxIdCodeUnits);
    checkpoint = await repository.latestCheckpoint(key);
  } catch (error) {
    return loadRejected(
      error instanceof PersistenceError ? error.code : 'TRANSACTION_ABORTED',
      message(error),
      null,
    );
  }
  if (checkpoint === null) return Object.freeze({ status: 'EMPTY' as const, checkpoint: null });

  const read = readWorldSnapshot(checkpoint.body);
  if (read.status === 'REJECTED') {
    return loadRejected(
      read.rejection.code,
      read.rejection.message,
      checkpoint,
      read.rejection.path,
    );
  }
  const snapshot = read.snapshot;
  if (snapshot.tick !== checkpoint.tick) {
    return loadRejected(
      'TICK_MISMATCH',
      `The envelope is at tick ${checkpoint.tick} but the snapshot is at ${snapshot.tick}`,
      checkpoint,
      'checkpoint.tick',
    );
  }
  if (snapshot.profile.profileId !== checkpoint.profileId) {
    return loadRejected(
      'PROFILE_MISMATCH',
      `The envelope names profile ${checkpoint.profileId} but the snapshot names ${snapshot.profile.profileId}`,
      checkpoint,
      'checkpoint.profileId',
    );
  }
  if (snapshot.learning.learningEpoch !== checkpoint.learningEpoch) {
    return loadRejected(
      'LEARNING_EPOCH_MISMATCH',
      `The envelope is in learning epoch ${checkpoint.learningEpoch} but the snapshot is in ${snapshot.learning.learningEpoch}`,
      checkpoint,
      'checkpoint.learningEpoch',
    );
  }

  const stored: WorldCheckpointVersions = Object.freeze({
    engineVersion: checkpoint.engineVersion,
    physicsVersion: checkpoint.physicsVersion,
    mapVersion: checkpoint.mapVersion,
  });
  const current: WorldCheckpointVersions = Object.freeze({
    engineVersion: options.versions.engineVersion,
    physicsVersion: options.versions.physicsVersion,
    mapVersion: options.versions.mapVersion,
  });
  const incompatible = (['engineVersion', 'physicsVersion', 'mapVersion'] as const).filter(
    (field) => stored[field] !== current[field],
  );
  if (incompatible.length > 0) {
    return Object.freeze({
      status: 'INCOMPATIBLE' as const,
      checkpoint,
      snapshot,
      stored,
      current,
      reason: 'INCOMPATIBLE_VERSION' as const,
      detail: incompatible
        .map((field) => `${field}: stored ${stored[field]}, current ${current[field]}`)
        .join('; '),
      tick: checkpoint.tick,
      generation: checkpoint.generation,
    });
  }

  const restored = restoreWorldState(snapshot, {
    currentProfileId: options.currentProfileId,
    currentLearningEpoch: options.currentLearningEpoch,
  });
  const ageTicks =
    options.currentTick === undefined ? null : Math.max(0, options.currentTick - checkpoint.tick);
  return Object.freeze({
    status: 'RESUMABLE' as const,
    checkpoint,
    snapshot,
    state: restored.state,
    resume: restored.resume,
    tick: checkpoint.tick,
    generation: checkpoint.generation,
    bytes: read.bytes,
    checksum: read.checksum,
    ageTicks,
  });
}
