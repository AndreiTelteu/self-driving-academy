import { FIXED_TICK_HZ } from '../simulation';
import { BOUNDED_PIPELINE_BUDGET, createBoundedPipeline } from './bounded-pipeline';
import type {
  BoundedGeneration,
  BoundedPipeline,
  BoundedPipelineRejectionCode,
  BoundedPipelineStats,
  BoundedPipelineStore,
  BoundedStageCost,
  BoundedStoreCommit,
  BoundedVersions,
} from './bounded-pipeline';
import { PERSISTENCE_LIMITS, PersistenceError, boundedText } from './contracts';
import type { PersistenceReasonCode } from './contracts';
import type { PlayerSaveCommit, PlayerSaveRequest, ProgressSaveStore } from './progress-save';
import type { PlayerSaveOutcome } from './repository';
import type { WorldSnapshotSource } from './world-checkpoint';

/**
 * Periodic autosave and the session close contract (PBI 131).
 *
 * This module is the seam between the two contracts already delivered and does not re-implement
 * either of them:
 *
 * - the periodic save is a **222** bounded generation (`createBoundedPipeline`): the world copy is
 *   the only work that runs inside the tick boundary, encode/copy/commit run after it, there is at
 *   most one generation preparing and one committing, and redundant requests are coalesced;
 * - the player state is the **130** progress save (`ProgressSaveStore.save`): the mission tracker,
 *   the campaign ledger and the settings, in one transaction over `progress` + `settings`.
 *
 * One cycle is therefore `progress rows → checkpoint row`. The order is the same rule 222 uses for
 * its protected ledger: the durable facts (rewards, mission verdicts, settings) reach the store
 * before the checkpoint that would prove them, so a crash between the two never loses a reward and
 * never activates a half-written generation. A failed progress write stops the checkpoint write on
 * purpose: publishing a newer world over stale rewards would be a silent inconsistency.
 *
 * **Interval.** The autosave is periodic **in ticks**, never in milliseconds: every
 * `AUTOSAVE_INTERVAL_TICKS` (900 ticks = 15 s at the 60 Hz fixed tick, the value proposed by
 * Docs/15). A tick that is not due costs one comparison and zero clock reads; it can never write.
 *
 * **Coalescing.** While a generation is preparing or committing, the due request is kept in one
 * `deferred` slot instead of starting a second capture. When the pipeline returns to `IDLE`, the
 * newest deferred tick is offered once; nothing queues without a bound. The 222 pipeline still owns
 * its own single pending slot and its protected ledger, so coalescing never drops a protected fact.
 *
 * **Close.** `close()` freezes periodic offers, drains the in-flight generation (it never opens a
 * second writer), writes the 130 progress rows, then publishes the final checkpoint generation at
 * the close tick. A failure is reported as `PARTIAL`/`FAILED` with the code, the durable tick and
 * `retryable: true`; the payload stays in RAM for `retryClose()`. Shutdown does not guarantee a
 * final commit (Docs/15 and Docs/25 say so): after a failed close the recovery base is the last
 * confirmed commit, and the status view never claims a completed save.
 *
 * **Honest cost.** The module reports the five 222 stages plus the `progressMs`/`checkpointMs` split
 * of the commit, measured with the injected monotonic clock. No wall clock, no timer and no
 * `Math.random` is used: the status timestamps come from the injected `now`.
 */

export const SESSION_AUTOSAVE_VERSION = '131-autosave-v1' as const;

/** Docs/15 proposes a save every 15 s; the authoritative loop runs at 60 Hz. */
export const AUTOSAVE_INTERVAL_TICKS = 900 as const;
export const AUTOSAVE_INTERVAL_SECONDS = AUTOSAVE_INTERVAL_TICKS / FIXED_TICK_HZ;

/** Budgets this contract consumes; the values come from the manifest, not from this file. */
export const AUTOSAVE_BUDGET = Object.freeze({
  budgetVersion: BOUNDED_PIPELINE_BUDGET.budgetVersion,
  source: BOUNDED_PIPELINE_BUDGET.source,
  /** Production interval, in authoritative ticks (never in milliseconds). */
  intervalTicks: AUTOSAVE_INTERVAL_TICKS,
  intervalSeconds: AUTOSAVE_INTERVAL_SECONDS,
  tickHz: FIXED_TICK_HZ,
  /** At most one capture per interval: 1 snapshot per 900 ticks. */
  capturesPerInterval: 1,
  preparingGenerations: BOUNDED_PIPELINE_BUDGET.preparingCheckpoints,
  committingGenerations: BOUNDED_PIPELINE_BUDGET.committingCheckpoints,
  /** Transfer ingress of one generation (222). */
  transferIngressBytes: BOUNDED_PIPELINE_BUDGET.pendingWorkerPayloadBytes,
  /** One checkpoint row plus one progress row set per cycle. */
  maxCheckpointBytes: PERSISTENCE_LIMITS.maxRecordBytes,
  maxProgressBodyBytes: PERSISTENCE_LIMITS.maxBodyBytes,
  recorderRamBytes: BOUNDED_PIPELINE_BUDGET.recorderRamBytes,
});

export const sessionAutosaveCodes = [
  'AUTOSAVE_CLOSING',
  'AUTOSAVE_CLOSED',
  'AUTOSAVE_DISPOSED',
  'AUTOSAVE_INVALID_INTERVAL',
  'AUTOSAVE_INVALID_REQUEST',
  'AUTOSAVE_TICK_REGRESSION',
  'AUTOSAVE_PROGRESS_UNAVAILABLE',
  'AUTOSAVE_PROGRESS_REJECTED',
  'AUTOSAVE_CHECKPOINT_REJECTED',
] as const;
export type SessionAutosaveCode = (typeof sessionAutosaveCodes)[number];
export type SessionAutosaveRejectionCode = SessionAutosaveCode | BoundedPipelineRejectionCode;

export const autosavePhases = ['IDLE', 'PENDING', 'SUCCESS', 'ERROR', 'CLOSING', 'CLOSED'] as const;
export type AutosavePhase = (typeof autosavePhases)[number];

/** The three states the UI must distinguish; no fourth "maybe saved" state exists. */
export const autosaveViewLabels = [
  'NOT_SAVED_YET',
  'SAVING',
  'SAVED',
  'SAVE_FAILED',
  'CLOSED',
] as const;
export type AutosaveViewLabel = (typeof autosaveViewLabels)[number];

export const autosaveTickStatuses = [
  'SKIPPED',
  'CAPTURED',
  'DEFERRED',
  'COALESCED',
  'REJECTED',
] as const;
export type AutosaveTickStatus = (typeof autosaveTickStatuses)[number];

export const autosaveRequestReasons = ['PERIODIC', 'MANUAL', 'CATCH_UP'] as const;
export type AutosaveRequestReason = (typeof autosaveRequestReasons)[number];

export interface AutosaveTickDecision {
  readonly status: AutosaveTickStatus;
  readonly tick: number | null;
  readonly reason: AutosaveRequestReason | null;
  readonly generation: number | null;
  readonly code: SessionAutosaveRejectionCode | null;
  readonly message: string | null;
  /** Ticks the 222 pipeline coalesced so far; stated instead of hidden. */
  readonly coalescedTicks: number;
}

/** The five 222 stages plus the two sub-stages of the commit, all in injected-clock milliseconds. */
export interface AutosaveStageCost extends BoundedStageCost {
  readonly progressMs: number;
  readonly checkpointMs: number;
}

export type AutosaveErrorStage = 'CAPTURE' | 'PROGRESS' | 'CHECKPOINT';

export interface AutosaveError {
  readonly code: SessionAutosaveRejectionCode;
  readonly message: string;
  readonly stage: AutosaveErrorStage;
  readonly tick: number | null;
  /** Wall-clock timestamp from the injected `now`; never mixed into the simulated tick. */
  readonly at: string;
}

export interface AutosaveProgressResult {
  readonly tick: number;
  readonly status: 'COMMITTED' | 'CRASHED_AFTER_COMMIT' | 'REJECTED' | 'NOT_REQUESTED';
  readonly revision: number | null;
  readonly bytes: number;
  readonly code: PersistenceReasonCode | null;
  readonly message: string | null;
}

export interface AutosaveCycleReport {
  readonly generation: number;
  readonly tick: number;
  readonly progress: AutosaveProgressResult;
  readonly checkpoint: 'COMMITTED' | 'REJECTED' | 'NOT_RUN';
  readonly progressMs: number;
  readonly checkpointMs: number;
  readonly checkpointBytes: number;
  readonly at: string;
}

export interface AutosaveSimulatedTime {
  readonly tick: number | null;
  readonly lastSavedTick: number | null;
  /** Simulation ticks that are not durable yet; `0` only after a confirmed commit at `tick`. */
  readonly unsavedTicks: number | null;
  /** The 222 commit age in ticks (same value, kept explicit for the HUD contract). */
  readonly commitAgeTicks: number | null;
  readonly nextDueTick: number | null;
  readonly deferredTick: number | null;
}

export interface AutosaveSaveTime {
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastErrorAt: string | null;
  readonly lastCost: AutosaveStageCost | null;
}

export interface AutosaveView {
  readonly phase: AutosavePhase;
  readonly label: AutosaveViewLabel;
  /** True only for a confirmed commit that left nothing unsaved. */
  readonly claimsCompletedSave: boolean;
  readonly detail: string;
}

export interface SessionAutosaveCounters {
  readonly ticks: number;
  readonly requests: number;
  readonly skippedTicks: number;
  readonly deferredRequests: number;
  readonly catchUpRequests: number;
  readonly captured: number;
  readonly coalesced: number;
  readonly refused: number;
  readonly commits: number;
  readonly failures: number;
  readonly progressCommits: number;
  readonly progressRejections: number;
  readonly closeAttempts: number;
  readonly closeFailures: number;
}

export interface SessionAutosaveStatus {
  readonly version: typeof SESSION_AUTOSAVE_VERSION;
  readonly sessionId: string;
  readonly intervalTicks: number;
  readonly intervalSeconds: number;
  readonly phase: AutosavePhase;
  readonly view: AutosaveView;
  readonly simulated: AutosaveSimulatedTime;
  readonly saveTime: AutosaveSaveTime;
  readonly pending: boolean;
  readonly deferred: boolean;
  readonly lastDecision: AutosaveTickDecision | null;
  readonly lastCycle: AutosaveCycleReport | null;
  readonly lastProgress: AutosaveProgressResult | null;
  readonly lastError: AutosaveError | null;
  readonly lastClose: SessionCloseResult | null;
  readonly counters: SessionAutosaveCounters;
  readonly pipeline: BoundedPipelineStats;
}

export const sessionCloseStatuses = [
  'SAVED',
  'PARTIAL',
  'FAILED',
  'NOTHING_TO_SAVE',
  'ALREADY_CLOSED',
] as const;
export type SessionCloseStatus = (typeof sessionCloseStatuses)[number];

export type SessionCheckpointOutcome =
  'COMMITTED' | 'ALREADY_DURABLE' | 'REJECTED' | 'NOT_REQUESTED' | 'SKIPPED';

export type SessionProgressOutcome =
  'COMMITTED' | 'CRASHED_AFTER_COMMIT' | 'REJECTED' | 'NOT_REQUESTED' | 'SKIPPED';

export interface SessionCloseRequest {
  /** The authoritative world at the last tick; omitted when no final capture is required. */
  readonly source?: WorldSnapshotSource | null;
  /** The 130 save payload; omitted or `null` when this session has no player state. */
  readonly progress?: PlayerSaveRequest | null;
  /** Reported verbatim, never interpreted. */
  readonly reason?: string;
}

export interface SessionCloseResult {
  readonly version: typeof SESSION_AUTOSAVE_VERSION;
  readonly status: SessionCloseStatus;
  readonly reason: string | null;
  readonly attempt: number;
  readonly closeTick: number | null;
  readonly progress: SessionProgressOutcome;
  readonly checkpoint: SessionCheckpointOutcome;
  readonly durableTick: number | null;
  readonly durableGeneration: number | null;
  readonly unsavedTicks: number | null;
  readonly progressRevision: number | null;
  readonly code: SessionAutosaveRejectionCode | null;
  readonly message: string | null;
  /** A failed close can be retried while the page is alive; the payload is retained in RAM. */
  readonly retryable: boolean;
  readonly cost: AutosaveStageCost | null;
  /** Wall-clock timestamp from the injected `now`, separate from `closeTick`. */
  readonly at: string;
}

export interface SessionAutosaveOptions {
  /** The durable 222 store (`createRepositoryPipelineStore` in production and in tests). */
  readonly store: BoundedPipelineStore;
  readonly sessionId: string;
  readonly checkpointId: string;
  readonly versions: BoundedVersions;
  /** The 130 store; required as soon as a progress payload exists. */
  readonly progressStore?: ProgressSaveStore | null;
  /** Reads the current 130 payload; a `null` answer means "nothing to save this cycle". */
  readonly inventory?: (() => PlayerSaveRequest | null) | null;
  /** Periodic interval in authoritative ticks; defaults to `AUTOSAVE_INTERVAL_TICKS`. */
  readonly intervalTicks?: number;
  /** Last durable generation from `recoverBoundedPipeline` for a resumed session. */
  readonly startGeneration?: number;
  /** Monotonic milliseconds; injected so stage costs are deterministic in tests. */
  readonly monotonic?: () => number;
  /** Wall-clock timestamps for the status view; never used for scheduling. */
  readonly now?: () => string;
  readonly preparingByteCap?: number;
  readonly transferByteCap?: number;
  readonly protectedByteCap?: number;
}

export interface SessionAutosave {
  readonly version: typeof SESSION_AUTOSAVE_VERSION;
  readonly intervalTicks: number;
  /** Called once per authoritative tick boundary; only the due tick pays a capture. */
  onTick(source: WorldSnapshotSource): AutosaveTickDecision;
  /** Forces one cycle now; still coalesced by the single 222 lane. */
  saveNow(source: WorldSnapshotSource): AutosaveTickDecision;
  /** Settles every scheduled prepare and commit; resolves when the pipeline is quiescent. */
  flush(): Promise<void>;
  status(): SessionAutosaveStatus;
  /** Progress first, then the final checkpoint generation; explicit result, never a promise. */
  close(request?: SessionCloseRequest): Promise<SessionCloseResult>;
  /** Retries a failed close while the page is alive, using the retained payload. */
  retryClose(request?: SessionCloseRequest): Promise<SessionCloseResult>;
  dispose(): void;
}

/* ------------------------------------------------------------------ helpers */

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'The autosave operation failed';
}

function elapsed(start: number, end: number): number {
  const value = end - start;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function defaultMonotonic(): number {
  if (typeof performance === 'object' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function readInterval(value: unknown): number {
  if (value === undefined) return AUTOSAVE_INTERVAL_TICKS;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new PersistenceError(
      'INVALID_RECORD',
      'AUTOSAVE_INVALID_INTERVAL: The autosave interval must be a positive safe integer number of ticks',
      'intervalTicks',
    );
  }
  return value;
}

function readTick(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PersistenceError(
      'INVALID_RECORD',
      `AUTOSAVE_INVALID_REQUEST: ${field} must be a nonnegative safe integer tick`,
      field,
    );
  }
  return value;
}

function rejectedCommit(
  generation: BoundedGeneration,
  code: BoundedPipelineRejectionCode,
  message: string,
): BoundedStoreCommit {
  return Object.freeze({
    status: 'REJECTED' as const,
    generation: generation.generation,
    code,
    message,
    bytes: 0,
    factsDurable: 0,
  });
}

/* ------------------------------------------------------- progress-aware store */

interface CycleRecord {
  readonly generation: number;
  readonly tick: number;
  readonly progress: AutosaveProgressResult;
  checkpoint: 'COMMITTED' | 'REJECTED' | 'NOT_RUN';
  readonly progressMs: number;
  checkpointMs: number;
  checkpointBytes: number;
  code: SessionAutosaveRejectionCode | null;
  message: string | null;
  stage: AutosaveErrorStage | null;
}

/**
 * Wraps the 222 store so one generation carries one 130 progress write before its checkpoint row.
 *
 * `handoff` is the synchronous ingress of 222; it defers the whole cycle to a microtask so the
 * transfer stage measures only the hand-over and the commit stage measures the two transactions.
 */
function createProgressAwareStore(input: {
  readonly base: BoundedPipelineStore;
  readonly progressStore: ProgressSaveStore | null;
  readonly inventory: (() => PlayerSaveRequest | null) | null;
  readonly monotonic: () => number;
  readonly cycles: Map<number, CycleRecord>;
  readonly onProgress: (result: AutosaveProgressResult) => void;
}): BoundedPipelineStore {
  const base = input.base;
  const progressStore = input.progressStore;
  const inventory = input.inventory;

  async function writeProgress(tick: number): Promise<{
    readonly failed: BoundedStoreCommit | null;
    readonly result: AutosaveProgressResult;
    readonly ms: number;
  }> {
    if (progressStore === null || inventory === null) {
      return {
        failed: null,
        result: Object.freeze({
          tick,
          status: 'NOT_REQUESTED' as const,
          revision: null,
          bytes: 0,
          code: null,
          message: null,
        }),
        ms: 0,
      };
    }
    let payload: PlayerSaveRequest | null;
    try {
      payload = inventory();
    } catch (error) {
      return {
        failed: null,
        result: Object.freeze({
          tick,
          status: 'REJECTED' as const,
          revision: null,
          bytes: 0,
          code: 'TRANSACTION_ABORTED' as const,
          message: describe(error),
        }),
        ms: 0,
      };
    }
    if (payload === null) {
      return {
        failed: null,
        result: Object.freeze({
          tick,
          status: 'NOT_REQUESTED' as const,
          revision: null,
          bytes: 0,
          code: null,
          message: null,
        }),
        ms: 0,
      };
    }
    const start = input.monotonic();
    let outcome: PlayerSaveOutcome;
    try {
      outcome = await progressStore.save(payload);
    } catch (error) {
      outcome = {
        status: 'REJECTED' as const,
        value: null,
        rejection: {
          code: error instanceof PersistenceError ? error.code : 'TRANSACTION_ABORTED',
          message: describe(error),
          path: 'progress',
        },
      };
    }
    const ms = elapsed(start, input.monotonic());
    if (outcome.status === 'REJECTED') {
      return {
        failed: null,
        result: Object.freeze({
          tick,
          status: 'REJECTED' as const,
          revision: null,
          bytes: 0,
          code: outcome.rejection.code,
          message: outcome.rejection.message,
        }),
        ms,
      };
    }
    const commit: PlayerSaveCommit = outcome.value;
    return {
      failed: null,
      result: Object.freeze({
        tick,
        status: outcome.status,
        revision: commit.tracker?.revision ?? null,
        bytes: commit.bytes,
        code: null,
        message: null,
      }),
      ms,
    };
  }

  async function writeCycle(generation: BoundedGeneration): Promise<BoundedStoreCommit> {
    const progress = await writeProgress(generation.tick);
    input.onProgress(progress.result);
    const record: CycleRecord = {
      generation: generation.generation,
      tick: generation.tick,
      progress: progress.result,
      checkpoint: 'NOT_RUN',
      progressMs: progress.ms,
      checkpointMs: 0,
      checkpointBytes: 0,
      code: null,
      message: null,
      stage: null,
    };
    input.cycles.set(generation.generation, record);

    if (progress.result.status === 'REJECTED') {
      record.code = progress.result.code;
      record.message = progress.result.message;
      record.stage = 'PROGRESS';
      return rejectedCommit(
        generation,
        progress.result.code ?? 'TRANSACTION_ABORTED',
        progress.result.message ??
          'The 130 progress write was rejected; the checkpoint was not written',
      );
    }

    const start = input.monotonic();
    let result: BoundedStoreCommit;
    try {
      result = await base.handoff(generation);
    } catch (error) {
      result = rejectedCommit(
        generation,
        error instanceof PersistenceError ? error.code : 'TRANSACTION_ABORTED',
        describe(error),
      );
    }
    record.checkpointMs = elapsed(start, input.monotonic());
    record.checkpointBytes = result.bytes;
    if (result.status === 'COMMITTED') {
      record.checkpoint = 'COMMITTED';
    } else {
      record.checkpoint = 'REJECTED';
      record.code = result.code;
      record.message = result.message;
      record.stage = 'CHECKPOINT';
    }
    return result;
  }

  return Object.freeze({
    handoff(generation: BoundedGeneration): Promise<BoundedStoreCommit> {
      // Nothing but the hand-over runs synchronously: the tick is already over, and the commit
      // stage of 222 will include the progress transaction and the checkpoint transaction.
      return Promise.resolve().then(() => writeCycle(generation));
    },
  });
}

/* ------------------------------------------------------------------- autosave */

export function createSessionAutosave(options: SessionAutosaveOptions): SessionAutosave {
  const sessionId = boundedText(options.sessionId, 'sessionId', PERSISTENCE_LIMITS.maxIdCodeUnits);
  const checkpointId = boundedText(
    options.checkpointId,
    'checkpointId',
    PERSISTENCE_LIMITS.maxIdCodeUnits,
  );
  const intervalTicks = readInterval(options.intervalTicks);
  const progressStore = options.progressStore ?? null;
  const inventory = options.inventory ?? null;
  const monotonic = options.monotonic ?? defaultMonotonic;
  const now = options.now ?? (() => new Date().toISOString());

  let state: 'OPEN' | 'CLOSING' | 'CLOSED' | 'DISPOSED' = 'OPEN';
  let lastTick: number | null = null;
  let nextDueTick: number | null = null;
  let deferredTick: number | null = null;
  let lastDecision: AutosaveTickDecision | null = null;
  let lastCycle: AutosaveCycleReport | null = null;
  let lastProgress: AutosaveProgressResult | null = null;
  let lastError: AutosaveError | null = null;
  let lastAttemptAt: string | null = null;
  let lastSuccessAt: string | null = null;
  let lastErrorAt: string | null = null;
  let lastCost: AutosaveStageCost | null = null;
  let lastClose: SessionCloseResult | null = null;
  let pendingClose: {
    source: WorldSnapshotSource | null;
    progress: PlayerSaveRequest | null;
    reason: string | null;
  } | null = null;

  const counters = {
    ticks: 0,
    requests: 0,
    skippedTicks: 0,
    deferredRequests: 0,
    catchUpRequests: 0,
    captured: 0,
    coalesced: 0,
    refused: 0,
    commits: 0,
    failures: 0,
    progressCommits: 0,
    progressRejections: 0,
    closeAttempts: 0,
    closeFailures: 0,
  };

  /** One entry per handed generation; the commit observer removes it, so the map stays bounded. */
  const cycles = new Map<number, CycleRecord>();

  const store = createProgressAwareStore({
    base: options.store,
    progressStore,
    inventory,
    monotonic,
    cycles,
    onProgress: (result) => {
      lastProgress = result;
      if (result.status === 'COMMITTED' || result.status === 'CRASHED_AFTER_COMMIT') {
        counters.progressCommits += 1;
      } else if (result.status === 'REJECTED') {
        counters.progressRejections += 1;
      }
    },
  });

  const pipeline: BoundedPipeline = createBoundedPipeline({
    store,
    sessionId,
    checkpointId,
    versions: options.versions,
    monotonic,
    now,
    ...(options.startGeneration === undefined ? {} : { startGeneration: options.startGeneration }),
    ...(options.preparingByteCap === undefined
      ? {}
      : { preparingByteCap: options.preparingByteCap }),
    ...(options.transferByteCap === undefined ? {} : { transferByteCap: options.transferByteCap }),
    ...(options.protectedByteCap === undefined
      ? {}
      : { protectedByteCap: options.protectedByteCap }),
    onCommit: (report) => {
      const stages = report.stages;
      const record = cycles.get(report.generation);
      if (record !== undefined) cycles.delete(report.generation);
      lastCost = Object.freeze({
        captureMs: stages.captureMs,
        encodeMs: stages.encodeMs,
        copyMs: stages.copyMs,
        transferMs: stages.transferMs,
        commitMs: stages.commitMs,
        totalMs: stages.totalMs,
        progressMs: record?.progressMs ?? 0,
        checkpointMs: record?.checkpointMs ?? 0,
      });
      if (record !== undefined) {
        lastCycle = Object.freeze({
          generation: report.generation,
          tick: report.tick,
          progress: record.progress,
          checkpoint:
            report.status === 'COMMITTED' ? ('COMMITTED' as const) : ('REJECTED' as const),
          progressMs: record.progressMs,
          checkpointMs: record.checkpointMs,
          checkpointBytes: record.checkpointBytes,
          at: now(),
        });
        lastProgress = record.progress;
      }
      if (report.status === 'COMMITTED') {
        counters.commits += 1;
        lastSuccessAt = now();
        lastError = null;
        lastErrorAt = null;
      } else {
        counters.failures += 1;
        lastErrorAt = now();
        const stage: AutosaveErrorStage = record?.stage ?? 'CHECKPOINT';
        lastError = Object.freeze({
          code:
            report.code ??
            (stage === 'PROGRESS' ? 'AUTOSAVE_PROGRESS_REJECTED' : 'AUTOSAVE_CHECKPOINT_REJECTED'),
          message: report.message ?? 'The autosave cycle was rejected',
          stage,
          tick: report.tick,
          at: lastErrorAt,
        });
      }
    },
  });

  function pipelineBusy(): boolean {
    const stats = pipeline.stats();
    return (
      stats.phase === 'PREPARING' ||
      stats.phase === 'COMMITTING' ||
      stats.generations.pendingTick !== null
    );
  }

  function decision(
    status: AutosaveTickStatus,
    tick: number | null,
    reason: AutosaveRequestReason | null,
    code: SessionAutosaveRejectionCode | null = null,
    message: string | null = null,
    generation: number | null = null,
  ): AutosaveTickDecision {
    const value = Object.freeze({
      status,
      tick,
      reason,
      generation,
      code,
      message,
      coalescedTicks: pipeline.stats().generations.coalescedTicks,
    });
    lastDecision = value;
    return value;
  }

  function refusal(
    tick: number | null,
    code: SessionAutosaveCode,
    message: string,
  ): AutosaveTickDecision {
    counters.refused += 1;
    return decision('REJECTED', tick, null, code, message);
  }

  function offer(source: WorldSnapshotSource, reason: AutosaveRequestReason): AutosaveTickDecision {
    const tick = readTick(source.tick, 'source.tick');
    counters.requests += 1;
    lastAttemptAt = now();
    const result = pipeline.offerTick(source);
    if (result.status === 'CAPTURED') {
      counters.captured += 1;
      return decision('CAPTURED', tick, reason, null, null, result.generation);
    }
    if (result.status === 'COALESCED') {
      counters.coalesced += 1;
      return decision('COALESCED', tick, reason, null, result.message, result.generation);
    }
    counters.refused += 1;
    lastErrorAt = now();
    lastError = Object.freeze({
      code: result.code ?? 'AUTOSAVE_INVALID_REQUEST',
      message: result.message ?? 'The capture was refused',
      stage: 'CAPTURE' as const,
      tick,
      at: lastErrorAt,
    });
    return decision('REJECTED', tick, reason, result.code, result.message);
  }

  function onTick(source: WorldSnapshotSource): AutosaveTickDecision {
    if (state === 'DISPOSED')
      return refusal(null, 'AUTOSAVE_DISPOSED', 'The autosave was disposed');
    if (state === 'CLOSED') return refusal(null, 'AUTOSAVE_CLOSED', 'The session is closed');
    if (state === 'CLOSING') return refusal(null, 'AUTOSAVE_CLOSING', 'The session is closing');
    let tick: number;
    try {
      tick = readTick(source.tick, 'source.tick');
    } catch (error) {
      return refusal(null, 'AUTOSAVE_INVALID_REQUEST', describe(error));
    }
    if (lastTick !== null && tick < lastTick) {
      return refusal(
        tick,
        'AUTOSAVE_TICK_REGRESSION',
        `Tick ${tick} is older than the last observed tick ${lastTick}`,
      );
    }
    counters.ticks += 1;
    lastTick = tick;

    if (nextDueTick === null) {
      // Windows are anchored to absolute ticks: the first window closes at the first multiple of
      // the interval, so a session that starts at tick 0 saves at 900, 1800 and so on.
      nextDueTick = intervalTicks;
    }

    if (deferredTick !== null) {
      if (pipelineBusy()) {
        deferredTick = tick;
        counters.skippedTicks += 1;
        return decision(
          'DEFERRED',
          tick,
          null,
          null,
          'The previous generation is still being written',
        );
      }
      deferredTick = null;
      counters.catchUpRequests += 1;
      nextDueTick = (Math.floor(tick / intervalTicks) + 1) * intervalTicks;
      return offer(source, 'CATCH_UP');
    }

    if (tick < nextDueTick) {
      counters.skippedTicks += 1;
      return decision('SKIPPED', tick, null);
    }
    nextDueTick = (Math.floor(tick / intervalTicks) + 1) * intervalTicks;
    if (pipelineBusy()) {
      deferredTick = tick;
      counters.deferredRequests += 1;
      return decision(
        'DEFERRED',
        tick,
        null,
        null,
        'A generation is preparing or committing; the newest tick waits in one bounded slot',
      );
    }
    return offer(source, 'PERIODIC');
  }

  function saveNow(source: WorldSnapshotSource): AutosaveTickDecision {
    if (state === 'DISPOSED')
      return refusal(null, 'AUTOSAVE_DISPOSED', 'The autosave was disposed');
    if (state === 'CLOSED') return refusal(null, 'AUTOSAVE_CLOSED', 'The session is closed');
    if (state === 'CLOSING') return refusal(null, 'AUTOSAVE_CLOSING', 'The session is closing');
    let tick: number;
    try {
      tick = readTick(source.tick, 'source.tick');
    } catch (error) {
      return refusal(null, 'AUTOSAVE_INVALID_REQUEST', describe(error));
    }
    if (lastTick !== null && tick < lastTick) {
      return refusal(
        tick,
        'AUTOSAVE_TICK_REGRESSION',
        `Tick ${tick} is older than the last observed tick ${lastTick}`,
      );
    }
    lastTick = tick;
    nextDueTick = (Math.floor(tick / intervalTicks) + 1) * intervalTicks;
    // A manual request is offered immediately: the 222 pipeline already coalesces the same tick
    // and replaces a prepared generation with a newer one, so a second writer can never start.
    const result = offer(source, 'MANUAL');
    if (result.status === 'CAPTURED' || result.status === 'COALESCED') deferredTick = null;
    return result;
  }

  function closeResult(input: {
    readonly status: SessionCloseStatus;
    readonly reason: string | null;
    readonly attempt: number;
    readonly closeTick: number | null;
    readonly progress: SessionProgressOutcome;
    readonly checkpoint: SessionCheckpointOutcome;
    readonly progressRevision: number | null;
    readonly code: SessionAutosaveRejectionCode | null;
    readonly message: string | null;
    readonly cost: AutosaveStageCost | null;
  }): SessionCloseResult {
    const stats = pipeline.stats();
    const durableTick = stats.generations.lastCommittedTick;
    const closeTick = input.closeTick;
    return Object.freeze({
      version: SESSION_AUTOSAVE_VERSION,
      status: input.status,
      reason: input.reason,
      attempt: input.attempt,
      closeTick,
      progress: input.progress,
      checkpoint: input.checkpoint,
      durableTick,
      durableGeneration: stats.generations.lastCommittedGeneration,
      unsavedTicks: closeTick === null ? null : Math.max(0, closeTick - (durableTick ?? 0)),
      progressRevision: input.progressRevision,
      code: input.code,
      message: input.message,
      retryable: input.status !== 'SAVED' && input.status !== 'ALREADY_CLOSED',
      cost: input.cost,
      at: now(),
    });
  }

  async function runClose(): Promise<SessionCloseResult> {
    const pending = pendingClose;
    if (pending === null) {
      return closeResult({
        status: state === 'CLOSED' ? 'ALREADY_CLOSED' : 'NOTHING_TO_SAVE',
        reason: null,
        attempt: counters.closeAttempts,
        closeTick: lastTick,
        progress: 'NOT_REQUESTED',
        checkpoint: 'NOT_REQUESTED',
        progressRevision: null,
        code: null,
        message: null,
        cost: null,
      });
    }
    counters.closeAttempts += 1;
    const attempt = counters.closeAttempts;
    lastAttemptAt = now();
    let closeTick = lastTick;
    if (pending.source !== null && pending.source !== undefined) {
      try {
        closeTick = readTick(pending.source.tick, 'source.tick');
      } catch {
        closeTick = lastTick;
      }
    }

    // 1. Settle what is already running. The close never opens a second writer: it waits for the
    //    single 222 lane, so a close during an in-flight write is written after that commit.
    await pipeline.drain();

    // 2. The 130 progress rows (SETTINGS, CAMPAIGN, PROGRESS in one transaction).
    let progressOutcome: SessionProgressOutcome = 'NOT_REQUESTED';
    let progressRevision: number | null = null;
    let progressError: AutosaveError | null = null;
    let cost: AutosaveStageCost | null = null;
    if (pending.progress !== null) {
      if (progressStore === null) {
        progressError = Object.freeze({
          code: 'AUTOSAVE_PROGRESS_UNAVAILABLE' as const,
          message: 'A progress payload was given but no 130 progress store is wired',
          stage: 'PROGRESS' as const,
          tick: lastTick,
          at: now(),
        });
        progressOutcome = 'REJECTED';
      } else {
        const start = monotonic();
        let outcome: PlayerSaveOutcome;
        try {
          outcome = await progressStore.save(pending.progress);
        } catch (error) {
          outcome = {
            status: 'REJECTED' as const,
            value: null,
            rejection: {
              code: error instanceof PersistenceError ? error.code : 'TRANSACTION_ABORTED',
              message: describe(error),
              path: 'progress',
            },
          };
        }
        const progressMs = elapsed(start, monotonic());
        cost = Object.freeze({
          captureMs: 0,
          encodeMs: 0,
          copyMs: 0,
          transferMs: 0,
          commitMs: 0,
          totalMs: 0,
          progressMs,
          checkpointMs: 0,
        });
        if (outcome.status === 'REJECTED') {
          counters.progressRejections += 1;
          progressOutcome = 'REJECTED';
          progressError = Object.freeze({
            code: outcome.rejection.code,
            message: outcome.rejection.message,
            stage: 'PROGRESS' as const,
            tick: lastTick,
            at: now(),
          });
        } else {
          counters.progressCommits += 1;
          progressOutcome = outcome.status;
          progressRevision = outcome.value.tracker?.revision ?? null;
          lastProgress = Object.freeze({
            tick: lastTick ?? 0,
            status: outcome.status,
            revision: progressRevision,
            bytes: outcome.value.bytes,
            code: null,
            message: null,
          });
        }
      }
    }

    // 3. The final world checkpoint, only after the progress rows are durable. A failed progress
    //    write deliberately skips this step: the previous coherent pair stays the recovery base.
    let checkpointOutcome: SessionCheckpointOutcome = 'NOT_REQUESTED';
    let checkpointError: AutosaveError | null = null;
    if (progressError !== null) {
      checkpointOutcome = 'SKIPPED';
    } else if (pending.source !== undefined && pending.source !== null) {
      let tick: number;
      try {
        tick = readTick(pending.source.tick, 'source.tick');
      } catch (error) {
        tick = -1;
        checkpointOutcome = 'REJECTED';
        checkpointError = Object.freeze({
          code: 'AUTOSAVE_INVALID_REQUEST' as const,
          message: describe(error),
          stage: 'CHECKPOINT' as const,
          tick: lastTick,
          at: now(),
        });
      }
      if (tick >= 0) {
        if (lastTick !== null && tick < lastTick) {
          checkpointOutcome = 'REJECTED';
          checkpointError = Object.freeze({
            code: 'AUTOSAVE_TICK_REGRESSION' as const,
            message: `The close source is at tick ${tick}, older than the observed ${lastTick}`,
            stage: 'CHECKPOINT' as const,
            tick,
            at: now(),
          });
        } else {
          const decisionValue = pipeline.offerTick(pending.source);
          await pipeline.drain();
          const stats = pipeline.stats();
          if (
            stats.generations.lastCommittedTick !== null &&
            stats.generations.lastCommittedTick >= tick
          ) {
            checkpointOutcome =
              decisionValue.status === 'COALESCED' ? 'ALREADY_DURABLE' : 'COMMITTED';
          } else {
            checkpointOutcome = 'REJECTED';
            checkpointError = Object.freeze({
              code: decisionValue.code ?? stats.storage.lastCode ?? 'AUTOSAVE_CHECKPOINT_REJECTED',
              message:
                decisionValue.message ??
                stats.storage.lastMessage ??
                'The final checkpoint generation was not committed',
              stage: 'CHECKPOINT' as const,
              tick,
              at: now(),
            });
          }
        }
      }
    }

    const error = progressError ?? checkpointError;
    const progressRequested = pending.progress !== null;
    const checkpointRequested = pending.source !== undefined && pending.source !== null;
    const progressOk =
      !progressRequested ||
      progressOutcome === 'COMMITTED' ||
      progressOutcome === 'CRASHED_AFTER_COMMIT';
    const checkpointOk =
      !checkpointRequested ||
      checkpointOutcome === 'COMMITTED' ||
      checkpointOutcome === 'ALREADY_DURABLE';
    const anyOk = (progressRequested && progressOk) || (checkpointRequested && checkpointOk);
    const status: SessionCloseStatus =
      progressOk && checkpointOk ? 'SAVED' : anyOk ? 'PARTIAL' : 'FAILED';

    if (status === 'SAVED') {
      state = 'CLOSED';
      pendingClose = null;
      lastError = null;
      lastErrorAt = null;
      lastSuccessAt = now();
    } else {
      counters.closeFailures += 1;
      lastErrorAt = now();
      lastError = error ?? {
        code: 'AUTOSAVE_CHECKPOINT_REJECTED',
        message: 'The close did not persist every requested part',
        stage: 'CHECKPOINT',
        tick: closeTick,
        at: lastErrorAt,
      };
    }

    const result = closeResult({
      status,
      reason: pending.reason,
      attempt,
      closeTick,
      progress: progressOutcome,
      checkpoint: checkpointOutcome,
      progressRevision,
      code: error?.code ?? null,
      message: error?.message ?? null,
      cost,
    });
    lastClose = result;
    return result;
  }

  function close(request: SessionCloseRequest = {}): Promise<SessionCloseResult> {
    if (state === 'DISPOSED') {
      lastClose = closeResult({
        status: 'FAILED',
        reason: request.reason ?? null,
        attempt: counters.closeAttempts,
        closeTick: lastTick,
        progress: 'NOT_REQUESTED',
        checkpoint: 'NOT_REQUESTED',
        progressRevision: null,
        code: 'AUTOSAVE_DISPOSED',
        message: 'The autosave was disposed before closing',
        cost: null,
      });
      return Promise.resolve(lastClose);
    }
    if (state === 'CLOSED') {
      lastClose = closeResult({
        status: 'ALREADY_CLOSED',
        reason: request.reason ?? null,
        attempt: counters.closeAttempts,
        closeTick: lastTick,
        progress: 'NOT_REQUESTED',
        checkpoint: 'NOT_REQUESTED',
        progressRevision: null,
        code: null,
        message: null,
        cost: null,
      });
      return Promise.resolve(lastClose);
    }
    state = 'CLOSING';
    deferredTick = null;
    pendingClose = {
      source: request.source ?? pendingClose?.source ?? null,
      progress: request.progress ?? pendingClose?.progress ?? null,
      reason: request.reason ?? pendingClose?.reason ?? null,
    };
    if (pendingClose.source === null && pendingClose.progress === null) {
      state = 'CLOSED';
      pendingClose = null;
      lastClose = closeResult({
        status: 'NOTHING_TO_SAVE',
        reason: request.reason ?? null,
        attempt: counters.closeAttempts,
        closeTick: lastTick,
        progress: 'NOT_REQUESTED',
        checkpoint: 'NOT_REQUESTED',
        progressRevision: null,
        code: null,
        message: null,
        cost: null,
      });
      return Promise.resolve(lastClose);
    }
    return runClose();
  }

  function retryClose(request: SessionCloseRequest = {}): Promise<SessionCloseResult> {
    if (state === 'DISPOSED') {
      lastClose = closeResult({
        status: 'FAILED',
        reason: request.reason ?? null,
        attempt: counters.closeAttempts,
        closeTick: lastTick,
        progress: 'NOT_REQUESTED',
        checkpoint: 'NOT_REQUESTED',
        progressRevision: null,
        code: 'AUTOSAVE_DISPOSED',
        message: 'The autosave was disposed before closing',
        cost: null,
      });
      return Promise.resolve(lastClose);
    }
    if (state === 'CLOSED') {
      lastClose = closeResult({
        status: 'ALREADY_CLOSED',
        reason: request.reason ?? null,
        attempt: counters.closeAttempts,
        closeTick: lastTick,
        progress: 'NOT_REQUESTED',
        checkpoint: 'NOT_REQUESTED',
        progressRevision: null,
        code: null,
        message: null,
        cost: null,
      });
      return Promise.resolve(lastClose);
    }
    state = 'CLOSING';
    pendingClose = {
      source: request.source ?? pendingClose?.source ?? null,
      progress: request.progress ?? pendingClose?.progress ?? null,
      reason: request.reason ?? pendingClose?.reason ?? null,
    };
    return runClose();
  }

  function phaseOf(): AutosavePhase {
    if (state === 'DISPOSED') return 'CLOSED';
    if (state === 'CLOSED') return 'CLOSED';
    if (state === 'CLOSING') return lastError === null ? 'CLOSING' : 'ERROR';
    if (pipelineBusy() || deferredTick !== null) return 'PENDING';
    if (lastError !== null) return 'ERROR';
    if (counters.commits > 0) return 'SUCCESS';
    return 'IDLE';
  }

  function status(): SessionAutosaveStatus {
    const stats = pipeline.stats();
    const phase = phaseOf();
    const durableTick = stats.generations.lastCommittedTick;
    const unsavedTicks = lastTick === null ? null : Math.max(0, lastTick - (durableTick ?? 0));
    const claimsCompletedSave =
      phase === 'SUCCESS' && unsavedTicks === 0 && !pipelineBusy() && deferredTick === null;
    const label: AutosaveViewLabel =
      phase === 'PENDING' || phase === 'CLOSING'
        ? 'SAVING'
        : phase === 'SUCCESS'
          ? 'SAVED'
          : phase === 'ERROR'
            ? 'SAVE_FAILED'
            : phase === 'CLOSED'
              ? 'CLOSED'
              : 'NOT_SAVED_YET';
    const detail =
      phase === 'PENDING'
        ? 'O salvare este în curs; progresul nu este încă durabil.'
        : phase === 'SUCCESS'
          ? 'Ultima salvare a fost confirmată de stocare.'
          : phase === 'ERROR'
            ? (lastError?.message ?? 'Ultima salvare a eșuat.')
            : phase === 'CLOSING'
              ? 'Sesiunea se închide; salvare finală în curs.'
              : phase === 'CLOSED'
                ? 'Sesiunea este închisă.'
                : 'Nu s-a salvat încă nimic în această sesiune.';
    return Object.freeze({
      version: SESSION_AUTOSAVE_VERSION,
      sessionId,
      intervalTicks,
      intervalSeconds: intervalTicks / FIXED_TICK_HZ,
      phase,
      view: Object.freeze({ phase, label, claimsCompletedSave, detail }),
      simulated: Object.freeze({
        tick: lastTick,
        lastSavedTick: durableTick,
        unsavedTicks,
        commitAgeTicks: stats.storage.commitAgeTicks,
        nextDueTick,
        deferredTick,
      }),
      saveTime: Object.freeze({ lastAttemptAt, lastSuccessAt, lastErrorAt, lastCost }),
      pending: pipelineBusy() || deferredTick !== null,
      deferred: deferredTick !== null,
      lastDecision,
      lastCycle,
      lastProgress,
      lastError,
      lastClose,
      counters: Object.freeze({ ...counters }),
      pipeline: stats,
    });
  }

  async function flush(): Promise<void> {
    await pipeline.drain();
  }

  function dispose(): void {
    if (state === 'DISPOSED') return;
    state = 'DISPOSED';
    deferredTick = null;
    pendingClose = null;
    cycles.clear();
    pipeline.dispose();
  }

  return Object.freeze({
    version: SESSION_AUTOSAVE_VERSION,
    intervalTicks,
    onTick,
    saveNow,
    flush,
    status,
    close,
    retryClose,
    dispose,
  });
}
