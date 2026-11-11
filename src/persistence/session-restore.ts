import { PERSISTENCE_LIMITS, PersistenceError, boundedText } from './contracts';
import type { CheckpointRecord, PersistenceReasonCode } from './contracts';
import { canonicalizeJson, sha256Hex } from './canonical-json';
import type { LocalRepository } from './repository';
import { decodeWorldCheckpoint } from './world-checkpoint';
import type { WorldCheckpointVersions } from './world-checkpoint';
import type {
  WorldResumeJob,
  WorldResumePlan,
  WorldResumeSegment,
  WorldSnapshotState,
} from './world-snapshot';

/**
 * Restart continuation (PBI 136).
 *
 * The world snapshot, the checksum and the resume plan are owned by 206; this module owns the
 * decision that a reload has to make with what is actually on disk:
 *
 * 1. **The last valid checkpoint wins, not the newest written one.** Every durable generation of
 *    the session is decoded with the same 206 rules. A checksum mismatch, an incoherent envelope or
 *    an incompatible engine/physics/map version is skipped and reported by identity and code, and
 *    the next older generation is tried. A newer but broken row never hides an older valid world.
 * 2. **The session opens paused.** The returned launch state is `PAUSED_AUTO`, every vehicle is
 *    `AUTO`, the input is released and no vehicle stays in `MANUAL`. The previous control modes are
 *    reported for the UI, never restored as live control.
 * 3. **Active segments are incomplete, not lost.** Every `OPEN` segment of the chosen snapshot is
 *    named with its `INCOMPLETE`/`RELOAD` transition.
 * 4. **Learning and dispatch jobs are relaunched only in a valid epoch.** A job is `RELAUNCH` only
 *    when its `profileId` and `learningEpoch` still match the active profile and epoch; otherwise it
 *    is `INVALIDATED` with the exact reason and counted. Completed observations are replayed
 *    idempotently and accepted results are preserved, so no reward is reapplied.
 * 5. **The ledgers continue with the world.** The durable 130 rows of the session are read and
 *    digested; a failed ledger read blocks the resume instead of promising a world whose rewards
 *    would be missing. Restore never writes a row.
 */

export const SESSION_RESTORE_VERSION = '136-session-restore-v1' as const;

export const sessionRestoreStatuses = ['RESUMABLE', 'BLOCKED', 'EMPTY'] as const;
export type SessionRestoreStatus = (typeof sessionRestoreStatuses)[number];

/** Reasons a candidate generation is skipped in favour of an older one. */
export const sessionRestoreSkipCodes = [
  'CHECKSUM_MISMATCH',
  'TICK_MISMATCH',
  'PROFILE_MISMATCH',
  'LEARNING_EPOCH_MISMATCH',
  'INCOMPATIBLE_VERSION',
  'SNAPSHOT_INVALID',
] as const;
export type SessionRestoreSkipCode = (typeof sessionRestoreSkipCodes)[number];

/** Closed vocabulary of the restore decision. */
export const sessionRestoreCodes = [
  'CHECKPOINT_INVALID',
  'INVALID_REQUEST',
  'LEDGER_UNREADABLE',
  'NO_CHECKPOINT',
  'LIST_FAILED',
] as const;
export type SessionRestoreCode =
  (typeof sessionRestoreCodes)[number] | SessionRestoreSkipCode | PersistenceReasonCode;

export interface SessionRestoreSkip {
  readonly checkpointId: string;
  readonly tick: number;
  readonly generation: number;
  readonly code: SessionRestoreCode;
  readonly message: string;
  readonly path: string;
}

export interface SessionRestoreLedger {
  readonly rows: number;
  readonly digest: string;
  readonly rewardsReapplied: 0;
}

/** What the host is allowed to start after a reload. It is never `MANUAL`. */
export interface SessionRestoreLaunch {
  readonly mode: 'PAUSED_AUTO';
  readonly paused: true;
  readonly auto: true;
  readonly inputReleased: true;
  readonly manualVehicles: 0;
  readonly vehiclesInAuto: number;
  readonly previousManualVehicles: number;
}

export interface SessionRestoreCounts {
  readonly candidates: number;
  readonly skipped: number;
  readonly openSegments: number;
  readonly incompleteSegments: number;
  readonly jobsRelaunched: number;
  readonly jobsInvalidated: number;
  readonly observationsReplayed: number;
  readonly observationsAlreadyRewarded: number;
  readonly acceptedResultsPreserved: number;
}

export interface SessionRestoreResumed {
  readonly status: 'RESUMABLE';
  readonly version: typeof SESSION_RESTORE_VERSION;
  readonly checkpointId: string;
  readonly generation: number;
  readonly tick: number;
  readonly worldEpoch: number;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly bytes: number;
  readonly checksum: string;
  /** Tick distance from the caller's current tick; `null` when the caller did not declare one. */
  readonly ageTicks: number | null;
  readonly state: WorldSnapshotState;
  readonly resume: WorldResumePlan;
  readonly launch: SessionRestoreLaunch;
  readonly segments: readonly WorldResumeSegment[];
  readonly jobs: readonly WorldResumeJob[];
  readonly ledger: SessionRestoreLedger;
  readonly counts: SessionRestoreCounts;
  readonly skipped: readonly SessionRestoreSkip[];
}

export interface SessionRestoreBlocked {
  readonly status: 'BLOCKED';
  readonly version: typeof SESSION_RESTORE_VERSION;
  readonly code: SessionRestoreCode;
  readonly message: string;
  readonly skipped: readonly SessionRestoreSkip[];
  readonly counts: SessionRestoreCounts;
}

export interface SessionRestoreEmpty {
  readonly status: 'EMPTY';
  readonly version: typeof SESSION_RESTORE_VERSION;
  readonly code: 'NO_CHECKPOINT';
  readonly skipped: readonly SessionRestoreSkip[];
  readonly counts: SessionRestoreCounts;
}

export type SessionRestoreResult =
  SessionRestoreResumed | SessionRestoreBlocked | SessionRestoreEmpty;

export interface SessionRestoreOptions {
  readonly versions: WorldCheckpointVersions;
  readonly currentProfileId?: string;
  readonly currentLearningEpoch?: number;
  /** Only used to report the age; the restore itself never reads a clock. */
  readonly currentTick?: number;
  /** Bound on decoded generations; defaults to the repository list budget. */
  readonly maxCandidates?: number;
}

function counts(options: {
  readonly candidates: number;
  readonly skipped: number;
  readonly segments: readonly WorldResumeSegment[];
  readonly jobs: readonly WorldResumeJob[];
  readonly observations: WorldResumePlan['observations'];
  readonly acceptedResultsPreserved: number;
}): SessionRestoreCounts {
  return Object.freeze({
    candidates: options.candidates,
    skipped: options.skipped,
    openSegments: options.segments.length,
    incompleteSegments: options.segments.filter((segment) => segment.nextStatus === 'INCOMPLETE')
      .length,
    jobsRelaunched: options.jobs.filter((job) => job.status === 'RELAUNCH').length,
    jobsInvalidated: options.jobs.filter((job) => job.status === 'INVALIDATED').length,
    observationsReplayed: options.observations.length,
    observationsAlreadyRewarded: options.observations.filter(
      (observation) => observation.alreadyRewarded,
    ).length,
    acceptedResultsPreserved: options.acceptedResultsPreserved,
  });
}

function emptyCounts(candidates: number, skipped: number): SessionRestoreCounts {
  return Object.freeze({
    candidates,
    skipped,
    openSegments: 0,
    incompleteSegments: 0,
    jobsRelaunched: 0,
    jobsInvalidated: 0,
    observationsReplayed: 0,
    observationsAlreadyRewarded: 0,
    acceptedResultsPreserved: 0,
  });
}

/** `SDA-CJSON-1`/SHA-256 digest of the durable ledger rows of the session. */
function ledgerDigest(rows: readonly unknown[]): string {
  const canonical = canonicalizeJson(rows, { maxDepth: 32 });
  if (canonical.status === 'REJECTED') {
    throw new PersistenceError(
      'SAVE_DIGEST_MISMATCH',
      `The stored ledger rows are not canonical: ${canonical.rejection.message}`,
      canonical.rejection.path,
    );
  }
  return sha256Hex(canonical.text);
}

function skipOf(
  checkpoint: CheckpointRecord,
  code: SessionRestoreCode,
  message: string,
  path: string,
): SessionRestoreSkip {
  return Object.freeze({
    checkpointId: checkpoint.checkpointId,
    tick: checkpoint.tick,
    generation: checkpoint.generation,
    code,
    message,
    path,
  });
}

/**
 * Restarts a session from the last valid checkpoint of `sessionId`.
 *
 * Nothing is written: the caller receives the restored state, the 206 resume plan and the launch
 * decision, and applies them. That is what keeps a restart from granting a second reward.
 */
export async function restoreSession(
  repository: LocalRepository,
  sessionId: string,
  options: SessionRestoreOptions,
): Promise<SessionRestoreResult> {
  let key: string;
  try {
    key = boundedText(sessionId, 'sessionId', PERSISTENCE_LIMITS.maxIdCodeUnits);
  } catch (error) {
    return Object.freeze({
      status: 'BLOCKED' as const,
      version: SESSION_RESTORE_VERSION,
      code: 'INVALID_REQUEST' as const,
      message: error instanceof Error ? error.message : 'Expected a session identity',
      skipped: Object.freeze([]),
      counts: emptyCounts(0, 0),
    });
  }
  const limit = options.maxCandidates ?? PERSISTENCE_LIMITS.maxListEntries;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    return Object.freeze({
      status: 'BLOCKED' as const,
      version: SESSION_RESTORE_VERSION,
      code: 'INVALID_REQUEST' as const,
      message: 'maxCandidates must be a positive safe integer',
      skipped: Object.freeze([]),
      counts: emptyCounts(0, 0),
    });
  }

  let candidates: readonly CheckpointRecord[];
  try {
    // The repository returns newest first (tick, then generation), so the first accepted candidate
    // is the last valid checkpoint by the same rule that defines "latest".
    const listed = await repository.listCheckpoints(key);
    candidates = listed.slice(0, limit);
  } catch (error) {
    return Object.freeze({
      status: 'BLOCKED' as const,
      version: SESSION_RESTORE_VERSION,
      code: 'LIST_FAILED' as const,
      message: error instanceof Error ? error.message : 'The checkpoint list could not be read',
      skipped: Object.freeze([]),
      counts: emptyCounts(0, 0),
    });
  }

  if (candidates.length === 0) {
    return Object.freeze({
      status: 'EMPTY' as const,
      version: SESSION_RESTORE_VERSION,
      code: 'NO_CHECKPOINT' as const,
      skipped: Object.freeze([]),
      counts: emptyCounts(0, 0),
    });
  }

  let ledger: SessionRestoreLedger;
  try {
    const rows = await repository.listProgress(key);
    for (const row of rows) {
      if (row.sessionId !== key) {
        throw new PersistenceError(
          'REFERENCE_MISSING',
          `Progress row ${row.recordId} belongs to session ${row.sessionId}`,
          'progress',
        );
      }
    }
    ledger = Object.freeze({
      rows: rows.length,
      digest: ledgerDigest(rows),
      rewardsReapplied: 0 as const,
    });
  } catch (error) {
    return Object.freeze({
      status: 'BLOCKED' as const,
      version: SESSION_RESTORE_VERSION,
      code: 'LEDGER_UNREADABLE' as const,
      message: error instanceof Error ? error.message : 'The session ledger could not be read',
      skipped: Object.freeze([]),
      counts: emptyCounts(candidates.length, 0),
    });
  }

  const skipped: SessionRestoreSkip[] = [];
  for (const checkpoint of candidates) {
    const decoded = decodeWorldCheckpoint(checkpoint, options);
    if (decoded.status === 'REJECTED') {
      skipped.push(
        skipOf(
          checkpoint,
          decoded.rejection.code as SessionRestoreCode,
          decoded.rejection.message,
          decoded.rejection.path,
        ),
      );
      continue;
    }
    if (decoded.status === 'INCOMPATIBLE') {
      skipped.push(
        skipOf(checkpoint, 'INCOMPATIBLE_VERSION', decoded.detail, 'checkpoint.versions'),
      );
      continue;
    }

    const resume = decoded.resume;
    const previousManualVehicles = resume.vehicles.filter(
      (vehicle) => vehicle.previousControlMode !== 'AUTO',
    ).length;
    const launch: SessionRestoreLaunch = Object.freeze({
      mode: 'PAUSED_AUTO',
      paused: true,
      auto: true,
      inputReleased: true,
      manualVehicles: 0,
      vehiclesInAuto: resume.vehicles.filter((vehicle) => vehicle.controlMode === 'AUTO').length,
      previousManualVehicles,
    });
    const ageTicks =
      options.currentTick === undefined
        ? null
        : Math.max(0, options.currentTick - decoded.checkpoint.tick);
    return Object.freeze({
      status: 'RESUMABLE' as const,
      version: SESSION_RESTORE_VERSION,
      checkpointId: decoded.checkpoint.checkpointId,
      generation: decoded.checkpoint.generation,
      tick: decoded.checkpoint.tick,
      worldEpoch: decoded.checkpoint.worldEpoch,
      profileId: resume.profileId,
      learningEpoch: resume.learningEpoch,
      bytes: decoded.bytes,
      checksum: decoded.checksum,
      ageTicks,
      state: decoded.state,
      resume,
      launch,
      segments: resume.segments,
      jobs: resume.jobs,
      ledger,
      counts: counts({
        candidates: candidates.length,
        skipped: skipped.length,
        segments: resume.segments,
        jobs: resume.jobs,
        observations: resume.observations,
        acceptedResultsPreserved: resume.acceptedResultsPreserved,
      }),
      skipped: Object.freeze(skipped),
    });
  }

  return Object.freeze({
    status: 'BLOCKED' as const,
    version: SESSION_RESTORE_VERSION,
    code: 'CHECKPOINT_INVALID' as const,
    message: `No checkpoint of session ${key} is resumable; ${skipped.length} generation(s) were skipped`,
    skipped: Object.freeze(skipped),
    counts: emptyCounts(candidates.length, skipped.length),
  });
}

/** True only for the launch state a restart is allowed to produce. */
export function isPausedAutoLaunch(launch: SessionRestoreLaunch): boolean {
  return (
    launch.mode === 'PAUSED_AUTO' &&
    launch.paused &&
    launch.auto &&
    launch.inputReleased &&
    launch.manualVehicles === 0
  );
}
