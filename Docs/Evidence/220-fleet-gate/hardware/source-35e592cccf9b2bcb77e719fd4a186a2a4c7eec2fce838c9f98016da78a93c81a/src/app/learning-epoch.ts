import { choice, fields, record, requireContract, text, tick as readTick } from '../sessions';

/**
 * Profile-change barrier for PBI 205.
 *
 * A `learningEpoch` is the monotone generation of the learning target, distinct from a profile
 * `versionId`. Every segment and every learning job carries `playerId`, `profileId`,
 * `learningEpoch`, `segmentId` and `baseVersionId`. A restore, a validated import or an explicit
 * new profile is resolved at the next tick boundary as one barrier: the current segment is closed
 * with `PROFILE_CHANGE`, the unpublished jobs of the old generation are cancelled, the old evidence
 * is marked `CANCELLED_BY_PROFILE_CHANGE`, the epoch advances monotonically, the target version is
 * published to the real 110 controller and a new segment opens with a new stable identity.
 *
 * The barrier is a composition module. It never estimates, composes, validates a delta, writes a
 * version, imports a savefile or moves a vehicle. It calls the injected real ports (103 cancel, 109
 * version readback, 110 publication, 069 segment lifecycle and the fixed tick readback) and it
 * reports closed statuses; a rollback is reported exactly, never repaired silently.
 */
export const LEARNING_EPOCH_VERSION = '205-learning-epoch-v1' as const;

export const LEARNING_EPOCH_LIMITS = Object.freeze({
  /** Retained barriers and retained cancelled generations; older entries are dropped, never merged. */
  history: 16,
  maxConfiguredHistory: 64,
  /** Tracked jobs of the current generation that a profile change can cancel. */
  trackedJobs: 64,
  /** Accepted result identities used to detect a second delivery of the same result. */
  seenResults: 128,
  /** Cancelled segment identities that keep a late result explicitly attributable. */
  cancelledSegments: 128,
  reasonCodeUnits: 240,
  idCodeUnits: 256,
});

export const learningChangeReasons = ['RESTORE', 'IMPORT', 'NEW_PROFILE'] as const;
export type LearningChangeReason = (typeof learningChangeReasons)[number];

export const learningGenerationStatuses = [
  'OPEN',
  'CLOSED',
  'CANCELLED_BY_PROFILE_CHANGE',
] as const;
export type LearningGenerationStatus = (typeof learningGenerationStatuses)[number];

export const learningBarrierStatuses = ['PENDING', 'COMMITTED', 'ROLLED_BACK'] as const;
export type LearningBarrierStatus = (typeof learningBarrierStatuses)[number];

/** Closed rejection vocabulary of a change request or of the barrier transaction. */
export const learningEpochRejectionCodes = [
  'IMPORT_INVALID',
  'CHANGE_PENDING',
  'SAME_TARGET',
  'TARGET_INVALID',
  'TARGET_PROFILE_MISMATCH',
  'TARGET_VERSION_NOT_FOUND',
  'TARGET_ENGINE_MISMATCH',
  'SEGMENT_STATE_UNREADABLE',
  'SEGMENT_CLOSE_FAILED',
  'SEGMENT_OPEN_FAILED',
  'PHYSICAL_STATE_CHANGED',
  'ACTIVATION_PENDING',
  'ACTIVATION_REJECTED',
  'ACTIVATION_FAILED',
  'TICK_NOT_ADVANCING',
  'BARRIER_DISPOSED',
] as const;
export type LearningEpochRejectionCode = (typeof learningEpochRejectionCodes)[number];

export const learningEpochDecisionStatuses = [
  'CURRENT',
  'STALE_GENERATION',
  'DUPLICATE',
  'LATE_RESULT',
  'INVALID',
] as const;
export type LearningEpochDecisionStatus = (typeof learningEpochDecisionStatuses)[number];

export const learningEpochDecisionReasons = [
  'PLAYER_MISMATCH',
  'PROFILE_MISMATCH',
  'EPOCH_MISMATCH',
  'BASE_MISMATCH',
  'SEGMENT_MISMATCH',
  'CANCELLED_BY_PROFILE_CHANGE',
  'DUPLICATE_RESULT',
  'RESULT_INVALID',
] as const;
export type LearningEpochDecisionReason = (typeof learningEpochDecisionReasons)[number];

/** One learning generation: the closed identity of a segment and of the jobs observed in it. */
export interface LearningGeneration {
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly segmentId: string;
  readonly baseVersionId: string;
  readonly openedTick: number;
  readonly closedTick: number | null;
  readonly status: LearningGenerationStatus;
}

export interface LearningEpochRollback {
  readonly segmentRestored: boolean;
  readonly activationPublished: boolean;
  readonly activationCommandId: string | null;
  /** Segment identities whose queued/running 103 job was cancelled before the failure. */
  readonly jobsCancelled: readonly string[];
  /** `true` only when no side effect survived the failed transaction. */
  readonly exact: boolean;
}

/** One barrier transaction. `graph` keeps the immutable from/to generations of the change. */
export interface LearningEpochBarrierRecord {
  readonly version: typeof LEARNING_EPOCH_VERSION;
  readonly barrierId: string;
  readonly reason: LearningChangeReason;
  readonly status: LearningBarrierStatus;
  readonly profileId: string;
  readonly targetProfileId: string;
  readonly targetVersionId: string;
  readonly fromLearningEpoch: number;
  readonly learningEpoch: number;
  readonly fromBaseVersionId: string;
  readonly baseVersionId: string;
  readonly fromSegmentId: string;
  readonly segmentId: string | null;
  readonly requestedAtTick: number;
  readonly resolveAtTick: number;
  readonly resolvedAtTick: number | null;
  readonly closedSegmentId: string | null;
  readonly closedTick: number | null;
  readonly openedTick: number | null;
  readonly cancelledJobs: readonly string[];
  readonly settledJobs: readonly string[];
  readonly invalidatedActivations: number;
  readonly settledActivations: readonly string[];
  readonly activationCommandId: string | null;
  readonly activationDuplicate: boolean;
  readonly activationTick: number | null;
  readonly physicalPreserved: boolean;
  readonly code: LearningEpochRejectionCode | null;
  readonly detail: string | null;
  readonly rollback: LearningEpochRollback | null;
}

export interface LearningEpochRequestResult {
  readonly version: typeof LEARNING_EPOCH_VERSION;
  readonly status: 'PENDING' | 'REJECTED' | 'DUPLICATE';
  readonly code: LearningEpochRejectionCode | null;
  readonly detail: string | null;
  readonly barrier: LearningEpochBarrierRecord | null;
  readonly generation: LearningGeneration;
}

export interface LearningEpochResolveResult {
  readonly version: typeof LEARNING_EPOCH_VERSION;
  readonly status: 'APPLIED' | 'ROLLED_BACK' | 'REJECTED' | 'NOTHING_PENDING' | 'TICK_NOT_REACHED';
  readonly code: LearningEpochRejectionCode | null;
  readonly detail: string | null;
  readonly barrier: LearningEpochBarrierRecord | null;
  readonly generation: LearningGeneration;
}

/**
 * Result of the generation gate. `accepted` is the only path that may continue towards 109; a
 * version is never created here and `versionId` is always null.
 */
export interface LearningEpochDecision {
  readonly version: typeof LEARNING_EPOCH_VERSION;
  readonly status: LearningEpochDecisionStatus;
  readonly reason: LearningEpochDecisionReason | null;
  readonly ignored: boolean;
  readonly accepted: boolean;
  readonly versionId: null;
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly detail: string;
}

export interface LearningEpochJobTracking {
  readonly status: 'TRACKED' | 'STALE_GENERATION' | 'INVALID';
  readonly reason: LearningEpochDecisionReason | null;
  readonly segmentId: string;
  readonly detail: string;
}

export interface LearningEpochStats {
  readonly version: typeof LEARNING_EPOCH_VERSION;
  readonly disposed: boolean;
  readonly changes: number;
  readonly rejected: number;
  readonly rollbacks: number;
  readonly invalidatedJobs: number;
  readonly invalidatedActivations: number;
  readonly duplicates: number;
  readonly duplicateRequests: number;
  readonly lateResults: number;
  readonly staleResults: number;
  readonly segmentsClosed: number;
  readonly segmentsOpened: number;
  readonly barriers: number;
  readonly droppedBarriers: number;
  readonly generations: number;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly trackedJobs: number;
}

/** Structural view of the real 103 `LearningEstimatorQueue` cancellation port. */
export interface LearningEpochQueuePort {
  cancel(segmentId: string): boolean;
}

/** Structural view of the real 109 store identity readback. */
export interface LearningEpochStorePort {
  readonly engineVersion: string;
  getVersion(versionId: string): {
    readonly versionId: string;
    readonly profileId: string;
    readonly engineVersion: string;
  } | null;
}

/** Structural view of the real 110 publication/apply controller. */
export interface LearningEpochActivationPort {
  readonly profileId: string;
  readonly engineVersion: string | null;
  pending(): {
    readonly commandId: string;
    readonly versionId: string;
    readonly activateAtTick: number;
  } | null;
  publish(input: unknown): {
    readonly status: 'ACCEPTED' | 'REJECTED';
    readonly command: {
      readonly commandId: string;
      readonly versionId: string;
      readonly activateAtTick: number;
    } | null;
    readonly duplicate: boolean;
    readonly rejection: { readonly code: string; readonly message: string } | null;
  };
  applyAt(tick: number): {
    readonly status: string;
    readonly versionId: string | null;
    readonly rejection: { readonly code: string; readonly message: string } | null;
    readonly failure: { readonly stage: string; readonly message: string } | null;
  };
}

export interface LearningEpochSegmentCloseRequest {
  readonly segmentId: string;
  readonly tick: number;
  readonly reason: 'PROFILE_CHANGE';
}

export interface LearningEpochSegmentCloseReceipt {
  readonly segmentId: string;
  readonly status: 'CLOSED';
  readonly reason: 'PROFILE_CHANGE';
  readonly tick: number;
}

export interface LearningEpochSegmentOpenRequest {
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly tick: number;
}

export interface LearningEpochSegmentOpenReceipt {
  readonly segmentId: string;
  readonly status: 'OPEN';
  readonly tick: number;
}

/**
 * 069 segment lifecycle port: close the current segment with `PROFILE_CHANGE`, open the next one
 * and expose a physical readback that must stay byte-identical across the rotation. The host
 * binding delegates to the real 069 record reservation; it never teleports a vehicle here.
 */
export interface LearningEpochSegmentPort {
  physical(): string;
  close(request: LearningEpochSegmentCloseRequest): LearningEpochSegmentCloseReceipt;
  open(request: LearningEpochSegmentOpenRequest): LearningEpochSegmentOpenReceipt;
}

export interface LearningEpochServices {
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  /** Current generation epoch; the first committed change advances it to this value + 1. */
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly openedTick?: number;
  readonly queue: LearningEpochQueuePort;
  readonly store: LearningEpochStorePort;
  readonly activation: LearningEpochActivationPort;
  readonly segments: LearningEpochSegmentPort;
  /** Fixed-tick readback owned by the host; the barrier never reads the wall clock. */
  readonly tick: () => number;
  readonly history?: number;
}

export interface LearningEpochBarrier {
  readonly version: typeof LEARNING_EPOCH_VERSION;
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  current(): LearningGeneration;
  generations(): readonly LearningGeneration[];
  barriers(): readonly LearningEpochBarrierRecord[];
  pending(): LearningEpochBarrierRecord | null;
  /** Requests an explicit change; it is resolved only at the next tick boundary. */
  requestChange(input: unknown): LearningEpochRequestResult;
  /** Resolves the pending change if the fixed tick reached its boundary. */
  resolve(): LearningEpochResolveResult;
  /** Captures a submitted 103 job so a profile change can cancel it. */
  trackJob(value: unknown): LearningEpochJobTracking;
  /** Generation gate for a job or a result; anything from another generation is ignored. */
  isCurrent(value: unknown): LearningEpochDecision;
  stats(): LearningEpochStats;
  dispose(): void;
}

interface GenerationState {
  playerId: string;
  profileId: string;
  learningEpoch: number;
  segmentId: string;
  baseVersionId: string;
  openedTick: number;
  closedTick: number | null;
  status: LearningGenerationStatus;
}

interface BarrierState {
  readonly barrierId: string;
  readonly reason: LearningChangeReason;
  status: LearningBarrierStatus;
  readonly targetProfileId: string;
  readonly targetVersionId: string;
  readonly requestedAtTick: number;
  readonly resolveAtTick: number;
  resolvedAtTick: number | null;
  readonly from: LearningGeneration;
  learningEpoch: number;
  closedSegmentId: string | null;
  closedTick: number | null;
  segmentId: string | null;
  openedTick: number | null;
  cancelledJobs: string[];
  settledJobs: string[];
  invalidatedActivations: number;
  settledActivations: string[];
  activationCommandId: string | null;
  activationDuplicate: boolean;
  activationTick: number | null;
  physicalPreserved: boolean;
  code: LearningEpochRejectionCode | null;
  detail: string | null;
  rollback: LearningEpochRollback | null;
}

interface Identity {
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly key: string | null;
}

const serviceFields = [
  'playerId',
  'profileId',
  'engineVersion',
  'learningEpoch',
  'baseVersionId',
  'segmentId',
  'openedTick',
  'queue',
  'store',
  'activation',
  'segments',
  'tick',
  'history',
] as const;

const requestFields = ['reason', 'targetProfileId', 'targetVersionId', 'importValid'] as const;

function bounded(value: string, maximum: number): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function boundedId(value: unknown, field: string): string {
  const id = text(value);
  requireContract(
    id.trim() === id && id.length <= LEARNING_EPOCH_LIMITS.idCodeUnits,
    `Invalid ${field}`,
  );
  return id;
}

function snapshot(generation: GenerationState): LearningGeneration {
  return Object.freeze({
    playerId: generation.playerId,
    profileId: generation.profileId,
    learningEpoch: generation.learningEpoch,
    segmentId: generation.segmentId,
    baseVersionId: generation.baseVersionId,
    openedTick: generation.openedTick,
    closedTick: generation.closedTick,
    status: generation.status,
  });
}

function segmentIdFor(profileId: string, learningEpoch: number): string {
  const suffix = `:g${learningEpoch}`;
  const room = LEARNING_EPOCH_LIMITS.idCodeUnits - suffix.length;
  return `${bounded(profileId, room)}${suffix}`;
}

function readIdentity(value: unknown): Identity {
  const data = record(value);
  const playerId = boundedId(data.playerId, 'playerId');
  const profileId = boundedId(data.profileId, 'profileId');
  const baseVersionId = boundedId(data.baseVersionId, 'baseVersionId');
  const segmentId = boundedId(data.segmentId, 'segmentId');
  const learningEpoch = readTick(data.learningEpoch);
  const key =
    typeof data.key === 'string' && data.key.length > 0 && data.key.length <= 128 ? data.key : null;
  return { playerId, profileId, learningEpoch, baseVersionId, segmentId, key };
}

/**
 * Creates the barrier over injected real ports. Construction validates the starting generation:
 * the base version must exist in the 109 store, belong to the profile and match the engine, and the
 * 110 controller must be pinned to the same profile/engine. The factory never writes a version and
 * never activates anything.
 */
export function createLearningEpochBarrier(services: LearningEpochServices): LearningEpochBarrier {
  const data = record(services);
  const allowed = new Set<string>(serviceFields);
  for (const key of Object.keys(data))
    requireContract(allowed.has(key), `Unknown learning epoch service: ${key}`);

  const playerId = boundedId(data.playerId, 'playerId');
  const profileId = boundedId(data.profileId, 'profileId');
  const engineVersion = boundedId(data.engineVersion, 'engineVersion');
  const learningEpoch = readTick(data.learningEpoch);
  const baseVersionId = boundedId(data.baseVersionId, 'baseVersionId');
  const segmentId = boundedId(data.segmentId, 'segmentId');
  requireContract(
    typeof data.queue === 'object' &&
      data.queue !== null &&
      typeof (data.queue as LearningEpochQueuePort).cancel === 'function',
    'The learning epoch barrier requires the real 103 learning queue',
  );
  const queue = data.queue as LearningEpochQueuePort;
  requireContract(
    typeof data.store === 'object' &&
      data.store !== null &&
      typeof (data.store as LearningEpochStorePort).getVersion === 'function' &&
      typeof (data.store as LearningEpochStorePort).engineVersion === 'string',
    'The learning epoch barrier requires the real 109 profile store',
  );
  const store = data.store as LearningEpochStorePort;
  requireContract(store.engineVersion === engineVersion, 'Barrier engine and store engine differ');
  requireContract(
    data.activation !== undefined &&
      typeof data.activation === 'object' &&
      data.activation !== null &&
      typeof (data.activation as LearningEpochActivationPort).publish === 'function' &&
      typeof (data.activation as LearningEpochActivationPort).applyAt === 'function' &&
      typeof (data.activation as LearningEpochActivationPort).pending === 'function',
    'The learning epoch barrier requires the real 110 profile activation',
  );
  const activation = data.activation as LearningEpochActivationPort;
  requireContract(
    activation.profileId === profileId,
    'The learning epoch barrier activation belongs to another profile',
  );
  requireContract(
    activation.engineVersion === null || activation.engineVersion === engineVersion,
    'The learning epoch barrier activation targets another engine',
  );
  requireContract(
    typeof data.segments === 'object' &&
      data.segments !== null &&
      typeof (data.segments as LearningEpochSegmentPort).close === 'function' &&
      typeof (data.segments as LearningEpochSegmentPort).open === 'function' &&
      typeof (data.segments as LearningEpochSegmentPort).physical === 'function',
    'The learning epoch barrier requires the 069 segment lifecycle',
  );
  const segments = data.segments as LearningEpochSegmentPort;
  requireContract(
    typeof data.tick === 'function',
    'The learning epoch barrier needs a fixed-tick readback',
  );
  const tick = data.tick as () => number;

  const configuredHistory =
    data.history === undefined ? LEARNING_EPOCH_LIMITS.history : data.history;
  requireContract(
    typeof configuredHistory === 'number' &&
      Number.isSafeInteger(configuredHistory) &&
      configuredHistory >= 1 &&
      configuredHistory <= LEARNING_EPOCH_LIMITS.maxConfiguredHistory,
    'Invalid learning epoch history limit',
  );
  const historyLimit = configuredHistory;

  const baseVersion = store.getVersion(baseVersionId);
  requireContract(baseVersion !== null, `Unknown barrier base version: ${baseVersionId}`);
  requireContract(
    baseVersion.profileId === profileId,
    'The barrier base version belongs to another profile',
  );
  requireContract(
    baseVersion.engineVersion === engineVersion,
    'The barrier base version targets another engine',
  );

  const openedTickInput = data.openedTick === undefined ? tick() : readTick(data.openedTick);
  let currentGeneration: GenerationState = {
    playerId,
    profileId,
    learningEpoch,
    segmentId,
    baseVersionId,
    openedTick: openedTickInput,
    closedTick: null,
    status: 'OPEN',
  };
  const pastGenerations: LearningGeneration[] = [];
  const records: BarrierState[] = [];
  let pendingState: BarrierState | null = null;
  let trackedJobs = new Set<string>();
  const seenResults = new Set<string>();
  const cancelledSegments = new Set<string>();
  let barrierSequence = 0;
  let disposed = false;
  let droppedBarriers = 0;
  const counters = {
    changes: 0,
    rejected: 0,
    rollbacks: 0,
    invalidatedJobs: 0,
    invalidatedActivations: 0,
    duplicates: 0,
    duplicateRequests: 0,
    lateResults: 0,
    staleResults: 0,
    segmentsClosed: 0,
    segmentsOpened: 0,
  };

  function now(): number {
    return readTick(tick());
  }

  function barrierRecord(state: BarrierState): LearningEpochBarrierRecord {
    return Object.freeze({
      version: LEARNING_EPOCH_VERSION,
      barrierId: state.barrierId,
      reason: state.reason,
      status: state.status,
      profileId,
      targetProfileId: state.targetProfileId,
      targetVersionId: state.targetVersionId,
      fromLearningEpoch: state.from.learningEpoch,
      learningEpoch: state.learningEpoch,
      fromBaseVersionId: state.from.baseVersionId,
      baseVersionId: state.targetVersionId,
      fromSegmentId: state.from.segmentId,
      segmentId: state.segmentId,
      requestedAtTick: state.requestedAtTick,
      resolveAtTick: state.resolveAtTick,
      resolvedAtTick: state.resolvedAtTick,
      closedSegmentId: state.closedSegmentId,
      closedTick: state.closedTick,
      openedTick: state.openedTick,
      cancelledJobs: Object.freeze([...state.cancelledJobs]),
      settledJobs: Object.freeze([...state.settledJobs]),
      invalidatedActivations: state.invalidatedActivations,
      settledActivations: Object.freeze([...state.settledActivations]),
      activationCommandId: state.activationCommandId,
      activationDuplicate: state.activationDuplicate,
      activationTick: state.activationTick,
      physicalPreserved: state.physicalPreserved,
      code: state.code,
      detail: state.detail,
      rollback: state.rollback,
    });
  }

  function trimRecords(): void {
    while (records.length > historyLimit) {
      const removed = records.shift();
      if (removed === undefined) return;
      if (removed === pendingState) pendingState = null;
      droppedBarriers += 1;
    }
  }

  function requestRejected(
    code: LearningEpochRejectionCode,
    detail: string,
  ): LearningEpochRequestResult {
    counters.rejected += 1;
    return Object.freeze({
      version: LEARNING_EPOCH_VERSION,
      status: 'REJECTED' as const,
      code,
      detail: bounded(detail, LEARNING_EPOCH_LIMITS.reasonCodeUnits),
      barrier: null,
      generation: snapshot(currentGeneration),
    });
  }

  function decision(
    status: LearningEpochDecisionStatus,
    reason: LearningEpochDecisionReason | null,
    identity: Identity,
    detail: string,
  ): LearningEpochDecision {
    return Object.freeze({
      version: LEARNING_EPOCH_VERSION,
      status,
      reason,
      ignored: status !== 'CURRENT',
      accepted: status === 'CURRENT',
      versionId: null as null,
      playerId: identity.playerId,
      profileId: identity.profileId,
      learningEpoch: identity.learningEpoch,
      baseVersionId: identity.baseVersionId,
      segmentId: identity.segmentId,
      detail,
    });
  }

  function emptyIdentity(): Identity {
    return {
      playerId,
      profileId,
      learningEpoch: currentGeneration.learningEpoch,
      baseVersionId: currentGeneration.baseVersionId,
      segmentId: currentGeneration.segmentId,
      key: null,
    };
  }

  function rememberCancelledSegment(segmentIdValue: string): void {
    if (cancelledSegments.has(segmentIdValue)) return;
    cancelledSegments.add(segmentIdValue);
    while (cancelledSegments.size > LEARNING_EPOCH_LIMITS.cancelledSegments) {
      const oldest = cancelledSegments.values().next();
      if (oldest.done) return;
      cancelledSegments.delete(oldest.value);
    }
  }

  function restoreOldSegment(atTick: number): boolean {
    try {
      segments.open({
        playerId,
        profileId,
        learningEpoch: currentGeneration.learningEpoch,
        baseVersionId: currentGeneration.baseVersionId,
        segmentId: currentGeneration.segmentId,
        tick: atTick,
      });
      return true;
    } catch {
      return false;
    }
  }

  function rollbackReject(
    state: BarrierState,
    code: LearningEpochRejectionCode,
    detail: string,
    segmentRestored: boolean,
  ): LearningEpochResolveResult {
    state.status = 'ROLLED_BACK';
    state.code = code;
    state.detail = bounded(detail, LEARNING_EPOCH_LIMITS.reasonCodeUnits);
    const exact =
      segmentRestored &&
      state.cancelledJobs.length === 0 &&
      state.activationCommandId === null &&
      state.invalidatedActivations === 0;
    state.rollback = Object.freeze({
      segmentRestored,
      activationPublished: state.activationCommandId !== null,
      activationCommandId: state.activationCommandId,
      jobsCancelled: Object.freeze([...state.cancelledJobs]),
      exact,
    });
    pendingState = null;
    counters.rejected += 1;
    counters.rollbacks += 1;
    return Object.freeze({
      version: LEARNING_EPOCH_VERSION,
      status: 'ROLLED_BACK' as const,
      code,
      detail: state.detail,
      barrier: barrierRecord(state),
      generation: snapshot(currentGeneration),
    });
  }

  function requestChange(input: unknown): LearningEpochRequestResult {
    const request = fields(input, requestFields);
    const reason = choice(request.reason, learningChangeReasons);
    const targetProfileId = boundedId(request.targetProfileId, 'targetProfileId');
    const targetVersionId = boundedId(request.targetVersionId, 'targetVersionId');
    const importValid = request.importValid;
    requireContract(typeof importValid === 'boolean', 'importValid must be a boolean');

    if (disposed)
      return requestRejected('BARRIER_DISPOSED', 'The learning epoch barrier was disposed');
    if (reason === 'IMPORT' && !importValid)
      return requestRejected(
        'IMPORT_INVALID',
        'The imported profile failed validation; the barrier was not opened',
      );
    if (targetProfileId !== profileId)
      return requestRejected(
        'TARGET_PROFILE_MISMATCH',
        `Target profile ${targetProfileId} is not the barrier profile ${profileId}`,
      );

    if (pendingState !== null) {
      if (
        pendingState.targetProfileId === targetProfileId &&
        pendingState.targetVersionId === targetVersionId
      ) {
        counters.duplicateRequests += 1;
        return Object.freeze({
          version: LEARNING_EPOCH_VERSION,
          status: 'DUPLICATE' as const,
          code: null,
          detail: `Barrier ${pendingState.barrierId} already covers ${targetVersionId}`,
          barrier: barrierRecord(pendingState),
          generation: snapshot(currentGeneration),
        });
      }
      return requestRejected(
        'CHANGE_PENDING',
        `Barrier ${pendingState.barrierId} for ${pendingState.targetVersionId} is still waiting for tick ${pendingState.resolveAtTick}`,
      );
    }

    const committed = records.find(
      (entry) =>
        entry.status === 'COMMITTED' &&
        entry.targetProfileId === targetProfileId &&
        entry.targetVersionId === targetVersionId,
    );
    if (committed !== undefined) {
      counters.duplicateRequests += 1;
      return Object.freeze({
        version: LEARNING_EPOCH_VERSION,
        status: 'DUPLICATE' as const,
        code: null,
        detail: `Barrier ${committed.barrierId} already covers ${targetVersionId}`,
        barrier: barrierRecord(committed),
        generation: snapshot(currentGeneration),
      });
    }

    if (targetVersionId === currentGeneration.baseVersionId)
      return requestRejected(
        'SAME_TARGET',
        `${targetVersionId} is already the base of generation ${currentGeneration.learningEpoch}`,
      );
    let stored;
    try {
      stored = store.getVersion(targetVersionId);
    } catch (error: unknown) {
      return requestRejected('TARGET_INVALID', messageOf(error));
    }
    if (stored === null)
      return requestRejected(
        'TARGET_VERSION_NOT_FOUND',
        `Target version ${targetVersionId} is not in the profile store`,
      );
    if (stored.profileId !== targetProfileId)
      return requestRejected(
        'TARGET_PROFILE_MISMATCH',
        `Target version ${targetVersionId} belongs to ${stored.profileId}, not ${targetProfileId}`,
      );
    if (stored.engineVersion !== engineVersion)
      return requestRejected(
        'TARGET_ENGINE_MISMATCH',
        `Target version ${targetVersionId} targets engine ${stored.engineVersion}, not ${engineVersion}`,
      );

    const atTick = now();
    if (atTick < currentGeneration.openedTick)
      return requestRejected(
        'TICK_NOT_ADVANCING',
        `Tick ${atTick} is behind the current generation opened at ${currentGeneration.openedTick}`,
      );
    barrierSequence += 1;
    const state: BarrierState = {
      barrierId: `barrier-${String(barrierSequence).padStart(4, '0')}`,
      reason,
      status: 'PENDING',
      targetProfileId,
      targetVersionId,
      requestedAtTick: atTick,
      resolveAtTick: atTick + 1,
      resolvedAtTick: null,
      from: snapshot(currentGeneration),
      learningEpoch: currentGeneration.learningEpoch + 1,
      closedSegmentId: null,
      closedTick: null,
      segmentId: null,
      openedTick: null,
      cancelledJobs: [],
      settledJobs: [],
      invalidatedActivations: 0,
      settledActivations: [],
      activationCommandId: null,
      activationDuplicate: false,
      activationTick: null,
      physicalPreserved: false,
      code: null,
      detail: null,
      rollback: null,
    };
    records.push(state);
    pendingState = state;
    trimRecords();
    return Object.freeze({
      version: LEARNING_EPOCH_VERSION,
      status: 'PENDING' as const,
      code: null,
      detail: null,
      barrier: barrierRecord(state),
      generation: snapshot(currentGeneration),
    });
  }

  function settlePendingActivation(
    state: BarrierState,
    atTick: number,
  ): { code: LearningEpochRejectionCode; detail: string } | null {
    const pendingActivation = activation.pending();
    if (pendingActivation === null || pendingActivation.versionId === state.targetVersionId)
      return null;
    let report;
    try {
      report = activation.applyAt(atTick);
    } catch (error: unknown) {
      return { code: 'ACTIVATION_FAILED', detail: messageOf(error) };
    }
    if (report.status === 'PENDING')
      return {
        code: 'ACTIVATION_PENDING',
        detail: `Activation ${pendingActivation.commandId} is still waiting for tick ${pendingActivation.activateAtTick}`,
      };
    state.invalidatedActivations += 1;
    state.settledActivations.push(pendingActivation.commandId);
    counters.invalidatedActivations += 1;
    return null;
  }

  function publishTarget(
    state: BarrierState,
    atTick: number,
  ):
    | { accepted: true; code: null; detail: null }
    | { accepted: false; code: LearningEpochRejectionCode; detail: string } {
    const pendingActivation = activation.pending();
    if (pendingActivation !== null && pendingActivation.versionId === state.targetVersionId) {
      state.activationCommandId = pendingActivation.commandId;
      state.activationDuplicate = true;
      state.activationTick = pendingActivation.activateAtTick;
      return { accepted: true, code: null, detail: null };
    }
    const origin =
      state.reason === 'RESTORE'
        ? ('RESTORE' as const)
        : state.reason === 'IMPORT'
          ? ('IMPORT' as const)
          : ('MANUAL_TUNING' as const);
    let publication;
    try {
      publication = activation.publish({
        profileId,
        versionId: state.targetVersionId,
        engineVersion,
        publishedAtTick: atTick,
        activateAtTick: atTick + 1,
        reason: bounded(`205 ${state.reason} -> ${state.targetVersionId}`, 200),
        origin,
        idempotencyKey: bounded(
          `205:${state.reason}:${state.learningEpoch}:${state.targetVersionId}`,
          LEARNING_EPOCH_LIMITS.idCodeUnits,
        ),
      });
    } catch (error: unknown) {
      return { accepted: false, code: 'ACTIVATION_FAILED', detail: messageOf(error) };
    }
    if (publication.status !== 'ACCEPTED' || publication.command === null)
      return {
        accepted: false,
        code: 'ACTIVATION_REJECTED',
        detail: `${publication.rejection?.code ?? 'REJECTED'}: ${publication.rejection?.message ?? 'The profile activation rejected the barrier publication'}`,
      };
    state.activationCommandId = publication.command.commandId;
    state.activationDuplicate = publication.duplicate;
    state.activationTick = publication.command.activateAtTick;
    return { accepted: true, code: null, detail: null };
  }

  function resolve(): LearningEpochResolveResult {
    if (disposed)
      return Object.freeze({
        version: LEARNING_EPOCH_VERSION,
        status: 'REJECTED' as const,
        code: 'BARRIER_DISPOSED' as const,
        detail: 'The learning epoch barrier was disposed',
        barrier: null,
        generation: snapshot(currentGeneration),
      });
    const state = pendingState;
    if (state === null)
      return Object.freeze({
        version: LEARNING_EPOCH_VERSION,
        status: 'NOTHING_PENDING' as const,
        code: null,
        detail: 'No profile change is waiting for the tick boundary',
        barrier: null,
        generation: snapshot(currentGeneration),
      });
    const atTick = now();
    if (atTick < state.resolveAtTick)
      return Object.freeze({
        version: LEARNING_EPOCH_VERSION,
        status: 'TICK_NOT_REACHED' as const,
        code: null,
        detail: `Barrier ${state.barrierId} resolves at tick ${state.resolveAtTick}`,
        barrier: barrierRecord(state),
        generation: snapshot(currentGeneration),
      });
    state.resolvedAtTick = atTick;

    let before: string;
    try {
      before = segments.physical();
    } catch (error: unknown) {
      return rollbackReject(state, 'SEGMENT_STATE_UNREADABLE', messageOf(error), false);
    }
    try {
      const receipt = segments.close({
        segmentId: currentGeneration.segmentId,
        tick: atTick,
        reason: 'PROFILE_CHANGE',
      });
      requireContract(
        receipt.segmentId === currentGeneration.segmentId &&
          receipt.status === 'CLOSED' &&
          receipt.reason === 'PROFILE_CHANGE' &&
          receipt.tick === atTick,
        'The segment close receipt does not match the barrier',
      );
    } catch (error: unknown) {
      return rollbackReject(state, 'SEGMENT_CLOSE_FAILED', messageOf(error), false);
    }
    state.closedSegmentId = currentGeneration.segmentId;
    state.closedTick = atTick;

    let after: string;
    try {
      after = segments.physical();
    } catch (error: unknown) {
      const restored = restoreOldSegment(atTick);
      return rollbackReject(state, 'SEGMENT_STATE_UNREADABLE', messageOf(error), restored);
    }
    if (after !== before) {
      const restored = restoreOldSegment(atTick);
      return rollbackReject(
        state,
        'PHYSICAL_STATE_CHANGED',
        'The segment rotation changed the physical readback',
        restored,
      );
    }
    state.physicalPreserved = true;

    const activationFailure = settlePendingActivation(state, atTick);
    if (activationFailure !== null) {
      const restored = restoreOldSegment(atTick);
      return rollbackReject(state, activationFailure.code, activationFailure.detail, restored);
    }

    const publication = publishTarget(state, atTick);
    if (!publication.accepted) {
      const restored = restoreOldSegment(atTick);
      return rollbackReject(state, publication.code, publication.detail, restored);
    }

    const cancelled: string[] = [];
    const settled: string[] = [];
    for (const jobSegmentId of trackedJobs) {
      let removed = false;
      try {
        removed = queue.cancel(jobSegmentId);
      } catch {
        removed = false;
      }
      if (removed) cancelled.push(jobSegmentId);
      else settled.push(jobSegmentId);
    }
    state.cancelledJobs = cancelled;
    state.settledJobs = settled;
    counters.invalidatedJobs += cancelled.length;

    const nextEpoch = state.learningEpoch;
    const nextSegmentId = segmentIdFor(profileId, nextEpoch);
    try {
      const receipt = segments.open({
        playerId,
        profileId,
        learningEpoch: nextEpoch,
        baseVersionId: state.targetVersionId,
        segmentId: nextSegmentId,
        tick: atTick,
      });
      requireContract(
        receipt.segmentId === nextSegmentId && receipt.status === 'OPEN' && receipt.tick === atTick,
        'The segment open receipt does not match the barrier',
      );
    } catch (error: unknown) {
      const restored = restoreOldSegment(atTick);
      return rollbackReject(state, 'SEGMENT_OPEN_FAILED', messageOf(error), restored);
    }
    state.segmentId = nextSegmentId;
    state.openedTick = atTick;

    pastGenerations.push(
      Object.freeze({
        ...snapshot(currentGeneration),
        status: 'CANCELLED_BY_PROFILE_CHANGE' as const,
        closedTick: atTick,
      }),
    );
    while (pastGenerations.length > historyLimit) pastGenerations.shift();
    rememberCancelledSegment(currentGeneration.segmentId);
    for (const jobSegmentId of cancelled) rememberCancelledSegment(jobSegmentId);
    for (const jobSegmentId of settled) rememberCancelledSegment(jobSegmentId);

    currentGeneration = {
      playerId,
      profileId,
      learningEpoch: nextEpoch,
      segmentId: nextSegmentId,
      baseVersionId: state.targetVersionId,
      openedTick: atTick,
      closedTick: null,
      status: 'OPEN',
    };
    trackedJobs = new Set();
    seenResults.clear();
    pendingState = null;
    state.status = 'COMMITTED';
    counters.changes += 1;
    counters.segmentsClosed += 1;
    counters.segmentsOpened += 1;
    return Object.freeze({
      version: LEARNING_EPOCH_VERSION,
      status: 'APPLIED' as const,
      code: null,
      detail: null,
      barrier: barrierRecord(state),
      generation: snapshot(currentGeneration),
    });
  }

  function trackJob(value: unknown): LearningEpochJobTracking {
    let identity: Identity;
    try {
      identity = readIdentity(value);
    } catch (error: unknown) {
      return Object.freeze({
        status: 'INVALID' as const,
        reason: 'RESULT_INVALID' as const,
        segmentId: '',
        detail: messageOf(error),
      });
    }
    if (disposed)
      return Object.freeze({
        status: 'INVALID' as const,
        reason: 'RESULT_INVALID' as const,
        segmentId: identity.segmentId,
        detail: 'The learning epoch barrier was disposed',
      });
    const mismatch =
      identity.playerId !== currentGeneration.playerId
        ? 'PLAYER_MISMATCH'
        : identity.profileId !== currentGeneration.profileId
          ? 'PROFILE_MISMATCH'
          : identity.learningEpoch !== currentGeneration.learningEpoch
            ? 'EPOCH_MISMATCH'
            : identity.baseVersionId !== currentGeneration.baseVersionId
              ? 'BASE_MISMATCH'
              : null;
    if (mismatch !== null)
      return Object.freeze({
        status: 'STALE_GENERATION' as const,
        reason: mismatch,
        segmentId: identity.segmentId,
        detail: 'The job belongs to another learning generation',
      });
    if (trackedJobs.size >= LEARNING_EPOCH_LIMITS.trackedJobs)
      return Object.freeze({
        status: 'INVALID' as const,
        reason: 'RESULT_INVALID' as const,
        segmentId: identity.segmentId,
        detail: 'The tracked job ledger reached its explicit bound',
      });
    trackedJobs.add(identity.segmentId);
    return Object.freeze({
      status: 'TRACKED' as const,
      reason: null,
      segmentId: identity.segmentId,
      detail: '',
    });
  }

  function isCurrent(value: unknown): LearningEpochDecision {
    let identity: Identity;
    try {
      identity = readIdentity(value);
    } catch (error: unknown) {
      return decision('INVALID', 'RESULT_INVALID', emptyIdentity(), messageOf(error));
    }
    if (disposed)
      return decision(
        'INVALID',
        'RESULT_INVALID',
        identity,
        'The learning epoch barrier was disposed',
      );
    if (cancelledSegments.has(identity.segmentId)) {
      counters.lateResults += 1;
      return decision(
        'LATE_RESULT',
        'CANCELLED_BY_PROFILE_CHANGE',
        identity,
        'The segment was cancelled by a profile change; its result cannot create a version',
      );
    }
    const mismatch =
      identity.playerId !== currentGeneration.playerId
        ? 'PLAYER_MISMATCH'
        : identity.profileId !== currentGeneration.profileId
          ? 'PROFILE_MISMATCH'
          : identity.learningEpoch !== currentGeneration.learningEpoch
            ? 'EPOCH_MISMATCH'
            : identity.baseVersionId !== currentGeneration.baseVersionId
              ? 'BASE_MISMATCH'
              : identity.segmentId !== currentGeneration.segmentId &&
                  !trackedJobs.has(identity.segmentId)
                ? 'SEGMENT_MISMATCH'
                : null;
    if (mismatch !== null) {
      counters.staleResults += 1;
      return decision(
        'STALE_GENERATION',
        mismatch,
        identity,
        'The result belongs to another learning generation and was ignored',
      );
    }
    const resultKey = `${identity.segmentId}|${identity.key ?? ''}`;
    if (seenResults.has(resultKey)) {
      counters.duplicates += 1;
      return decision(
        'DUPLICATE',
        'DUPLICATE_RESULT',
        identity,
        'This result identity was already accepted in the current generation',
      );
    }
    seenResults.add(resultKey);
    while (seenResults.size > LEARNING_EPOCH_LIMITS.seenResults) {
      const oldest = seenResults.values().next();
      if (oldest.done) break;
      seenResults.delete(oldest.value);
    }
    return decision('CURRENT', null, identity, '');
  }

  return Object.freeze({
    version: LEARNING_EPOCH_VERSION,
    playerId,
    profileId,
    engineVersion,
    current: (): LearningGeneration => snapshot(currentGeneration),
    generations: (): readonly LearningGeneration[] =>
      Object.freeze([...pastGenerations, snapshot(currentGeneration)]),
    barriers: (): readonly LearningEpochBarrierRecord[] =>
      Object.freeze(records.map((entry) => barrierRecord(entry))),
    pending: (): LearningEpochBarrierRecord | null =>
      pendingState === null ? null : barrierRecord(pendingState),
    requestChange,
    resolve,
    trackJob,
    isCurrent,
    stats: (): LearningEpochStats =>
      Object.freeze({
        version: LEARNING_EPOCH_VERSION,
        disposed,
        changes: counters.changes,
        rejected: counters.rejected,
        rollbacks: counters.rollbacks,
        invalidatedJobs: counters.invalidatedJobs,
        invalidatedActivations: counters.invalidatedActivations,
        duplicates: counters.duplicates,
        duplicateRequests: counters.duplicateRequests,
        lateResults: counters.lateResults,
        staleResults: counters.staleResults,
        segmentsClosed: counters.segmentsClosed,
        segmentsOpened: counters.segmentsOpened,
        barriers: records.length,
        droppedBarriers,
        generations: pastGenerations.length + 1,
        learningEpoch: currentGeneration.learningEpoch,
        baseVersionId: currentGeneration.baseVersionId,
        segmentId: currentGeneration.segmentId,
        trackedJobs: trackedJobs.size,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try {
        currentGeneration.status = 'CLOSED';
        currentGeneration.closedTick = now();
      } catch {
        currentGeneration.status = 'CLOSED';
      }
      if (pendingState !== null) {
        pendingState.status = 'ROLLED_BACK';
        pendingState.code = 'BARRIER_DISPOSED';
        pendingState.detail = 'The learning epoch barrier was disposed before the tick boundary';
        pendingState = null;
        counters.rejected += 1;
        counters.rollbacks += 1;
      }
      trackedJobs = new Set();
    },
  });
}
