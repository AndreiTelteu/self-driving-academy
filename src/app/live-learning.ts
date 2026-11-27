import { record, requireContract, text, tick as readTick } from '../sessions';
import type { ContractContext } from '../sessions';
import { createLearningEpochBarrier } from './learning-epoch';
import type {
  LearningEpochBarrier,
  LearningEpochSegmentCloseRequest,
  LearningEpochSegmentCloseReceipt,
  LearningEpochSegmentOpenRequest,
  LearningEpochSegmentOpenReceipt,
  LearningEpochSegmentPort,
} from './learning-epoch';
import { createProfilePipeline } from './profile-pipeline';
import type {
  ProfileLearningSegment,
  ProfilePipeline,
  ProfilePipelineQueue,
  ProfilePipelineResult,
} from './profile-pipeline';
import { deriveLiveLearningPayload, LIVE_EVIDENCE_VERSION } from '../learning';
import type { LearningAdmission, LiveEvidencePayload } from '../learning';
import { getParameterDefinition, profileContentHash } from '../profiles';
import type {
  DrivingProfile,
  ParameterEvidence,
  ParameterKey,
  ProfileStore,
  ProfileVersion,
} from '../profiles';
import type { ProfileActivation } from '../fleet';
import type { LiveTelemetrySegmentRead, LiveTelemetrySegmentSummary } from '../telemetry';

/**
 * PBI 273 live learning pipeline.
 *
 * One closed eligible 272 LEARNING segment becomes one real 103 job. The job carries the 093
 * evidence, 101 episodes and the 094/098 candidate derived from the same live facts; the shared
 * 103 queue and 221 governor estimate, 102 validates, 109 stores an immutable version and 110
 * activates it at the next common tick. MANUAL, ineligible, incomplete, foreign-generation and
 * stale results never create a version.
 *
 * The module owns no simulation, estimator, queue, store, opportunity registry or driving segment.
 * It consumes `readClosedSegment` from 272 and writes only through the injected real services.
 */
export const LIVE_LEARNING_VERSION = '273-live-learning-v1' as const;

export const liveLearningStatuses = [
  'PENDING',
  'COMPOSED',
  'RECOMPOSED',
  'NO_CHANGE',
  'INSUFFICIENT_EVIDENCE',
  'DEDUPLICATED',
  'SKIPPED_MANUAL',
  'SKIPPED_INELIGIBLE',
  'SKIPPED_INCOMPLETE',
  'STALE_JOB',
  'FAILED',
] as const;
export type LiveLearningStatus = (typeof liveLearningStatuses)[number];

export const liveLearningReasons = [
  'MANUAL_SEGMENT_NOT_LEARNABLE',
  'AUTO_SEGMENT_NOT_LEARNABLE',
  'SEGMENT_INELIGIBLE',
  'SEGMENT_INCOMPLETE',
  'SEGMENT_NOT_FOUND',
  'EPOCH_MISMATCH',
  'PROFILE_MISMATCH',
  'NO_EVIDENCE',
  'INSUFFICIENT_EVIDENCE',
  'NO_CHANGE',
  'GENERATION_INVALIDATED',
  'BASE_SUPERSEDED',
  'COMPOSITION_REJECTED',
  'DELTA_REJECTED',
  'STORE_REJECTED',
  'ACTIVATION_PENDING',
  'PIPELINE_DISPOSED',
  'EVIDENCE_INVALID',
  'BARRIER_REJECTED',
  'BARRIER_ROLLED_BACK',
] as const;
export type LiveLearningReason = (typeof liveLearningReasons)[number];

export const LIVE_LEARNING_LIMITS = Object.freeze({
  history: 16,
  maxConfiguredHistory: 32,
  processedSegments: 128,
  evidencePayloads: 32,
  generationSegments: 64,
  reasonCodeUnits: 240,
});

/** Structural 103 queue plus the generation/acknowledge ports the pipeline needs. */
export interface LiveLearningQueue extends ProfilePipelineQueue {
  cancel(segmentId: string): boolean;
  acknowledge?(segmentId: string): Promise<boolean>;
}

/** The 272 read model, never a second telemetry store. */
export interface LiveLearningTelemetryPort {
  read(): { readonly closedSegments: readonly LiveTelemetrySegmentSummary[] };
  readClosedSegment(segmentId: string): LiveTelemetrySegmentRead | null;
}

/** The 271 segment owner accepts the new generation for segments opened after an epoch change. */
export interface LiveLearningModeGenerationPort {
  updateGeneration?(input: {
    readonly baseVersionId: string;
    readonly learningEpoch: number;
  }): void;
}

export interface LiveLearningServices {
  readonly context: ContractContext;
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly queue: LiveLearningQueue;
  readonly store: ProfileStore;
  readonly activation: ProfileActivation;
  readonly telemetry: LiveLearningTelemetryPort;
  readonly modeSegments?: LiveLearningModeGenerationPort;
  /** Fixed-tick readback owned by the shell; no wall clock participates. */
  readonly tick: () => number;
  /** Read-only physical snapshot used by the 205 barrier to detect a teleport/reset. */
  readonly physicalState: () => string;
  /** Applies the immutable version to the city style owner; never writes the store or a version. */
  readonly onActivated?: (input: {
    readonly versionId: string;
    readonly profile: DrivingProfile;
  }) => void;
  readonly history?: number;
  readonly now?: () => string;
}

export interface LiveLearningResult {
  readonly version: typeof LIVE_LEARNING_VERSION;
  readonly segmentId: string;
  readonly status: LiveLearningStatus;
  readonly reason: LiveLearningReason | null;
  readonly code: string | null;
  readonly detail: string | null;
  readonly tick: number;
  readonly segmentStartTick: number;
  readonly learningEpoch: number;
  readonly profileId: string;
  readonly baseVersionId: string | null;
  readonly key: ParameterKey | null;
  readonly candidateStatus: string | null;
  readonly candidateValue: number | null;
  readonly evidenceStatus: string | null;
  readonly episodes: number;
  readonly jobSubmitted: boolean;
  readonly versionId: string | null;
  readonly parentVersionId: string | null;
  readonly activationStatus: string | null;
  readonly activateAtTick: number | null;
  readonly evidenceReady: boolean;
  readonly candidateReady: boolean;
}

export interface LiveLearningStats {
  readonly version: typeof LIVE_LEARNING_VERSION;
  readonly disposed: boolean;
  readonly segments: number;
  readonly eligible: number;
  readonly manualSkipped: number;
  readonly ineligibleSkipped: number;
  readonly incompleteSkipped: number;
  readonly jobs: number;
  readonly versions: number;
  readonly noChange: number;
  readonly insufficientEvidence: number;
  readonly stale: number;
  readonly failed: number;
  readonly deduplicated: number;
  readonly activationsPublished: number;
  readonly activationsApplied: number;
  readonly activationRejected: number;
  readonly barriers: number;
  readonly epochChanges: number;
  readonly physicalPreserved: number;
  readonly history: number;
  readonly dropped: number;
  readonly headVersionId: string;
  readonly learningEpoch: number;
}

export interface LiveLearningActivationView {
  readonly versionId: string;
  readonly profileId: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly appliedAtTick: number;
}

export interface LiveLearningReadModel {
  readonly version: typeof LIVE_LEARNING_VERSION;
  readonly contract: typeof LIVE_LEARNING_VERSION;
  readonly disposed: boolean;
  readonly tick: number;
  readonly engineVersion: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly headVersionId: string;
  readonly lastStatus: LiveLearningStatus | null;
  readonly lastReason: LiveLearningReason | null;
  readonly stats: LiveLearningStats;
  readonly profile: Readonly<{
    versionId: string;
    checksum: string;
    fingerprint: string;
    parameters: Readonly<Record<string, number>>;
    sourceSegmentIds: readonly string[];
  }>;
  readonly cityStyle: LiveLearningActivationView | null;
  readonly barrier: ReturnType<LearningEpochBarrier['stats']>;
  readonly activation: ReturnType<ProfileActivation['stats']>;
  readonly history: readonly LiveLearningResult[];
  readonly pendingSegment: string | null;
  readonly pendingActivation: string | null;
  readonly evidenceKeys: readonly { readonly key: string; readonly status: string }[];
  readonly staleResults: number;
  readonly publishes: number;
  readonly lastError: string | null;
}

export interface LiveLearningPipeline {
  readonly version: typeof LIVE_LEARNING_VERSION;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly engineVersion: string;
  step(tick?: number): void;
  head(): string;
  /** PBI 279: the real 205 owner of this pipeline, reused by the manual tuning session. */
  epochBarrier(): LearningEpochBarrier;
  /** PBI 279: the real 110 owner this pipeline activates through. */
  activationOwner(): ProfileActivation;
  /** PBI 279: adopts the barrier generation after a manual tuning without rotating the 069 target. */
  refreshFromBarrier(): void;
  /** PBI 279: immutable 109 head as a presentation profile (manual tuning provenance). */
  profileForVersion(versionId: string): DrivingProfile | null;
  requestProfileChange(input: unknown): unknown;
  isCurrent(value: unknown): unknown;
  observeSegment(segmentId: string): Promise<LiveLearningResult>;
  read(): LiveLearningReadModel;
  history(): readonly LiveLearningResult[];
  stats(): LiveLearningStats;
  dispose(): void;
}

interface SegmentRecord {
  readonly segmentId: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly openedTick: number;
  closedTick: number | null;
  closeReason: 'PROFILE_CHANGE' | null;
  status: 'OPEN' | 'CLOSED';
}

function bounded(value: string, maximum: number): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function fingerprint(parameters: Readonly<Record<string, number>>): string {
  const rows = Object.keys(parameters)
    .sort()
    .map((key) => [key, parameters[key]] as const);
  return profileContentHash(JSON.stringify(rows));
}

function profileFromVersion(
  version: ProfileVersion,
  evidenceBySegment: ReadonlyMap<string, LiveEvidencePayload>,
  manualProvenance = false,
): DrivingProfile {
  const parameters: Record<string, number> = Object.create(null);
  const unitsByParameter: Record<string, DrivingProfile['unitsByParameter'][string]> =
    Object.create(null);
  const provenanceByParameter: Record<string, 'LEARNED' | 'MANUAL_TUNING' | 'BASE' | 'IMPORTED'> =
    Object.create(null);
  const evidenceByParameter: Record<string, ParameterEvidence | null> = Object.create(null);
  const changed = new Set(version.provenance.delta?.changes.map((change) => change.key) ?? []);
  for (const key of Object.keys(version.parameters)) {
    const definition = getParameterDefinition(key);
    const value = version.parameters[key]!;
    parameters[key] = value;
    unitsByParameter[key] = definition.unit;
    if (!changed.has(key)) {
      provenanceByParameter[key] = 'BASE';
      evidenceByParameter[key] = null;
      continue;
    }
    const delta = version.provenance.delta;
    const payload = delta === null ? undefined : evidenceBySegment.get(delta.segmentId);
    if (payload !== undefined && payload.key === key) {
      const evidence = payload.evidence;
      const contexts = evidence.contextBreakdown.map((row) => row.label);
      provenanceByParameter[key] = 'LEARNED';
      evidenceByParameter[key] = Object.freeze({
        key,
        effectiveCount: Math.max(1, evidence.distinctEpisodes),
        contexts: Object.freeze(contexts.length === 0 ? ['FREE_TRAFFIC'] : contexts),
        quality: evidence.quality,
        uncertainty:
          evidence.uncertainty === 'LOW'
            ? 0.1
            : evidence.uncertainty === 'MODERATE'
              ? 0.3
              : evidence.uncertainty === 'HIGH'
                ? 0.6
                : 0,
        sourceSegmentIds: Object.freeze([delta!.segmentId]),
        estimatorVersion: LIVE_EVIDENCE_VERSION,
      });
    } else {
      // A restored/imported target has no fresh local evidence; the immutable 109 version remains
      // the source of truth and the compiled city style is marked IMPORTED, never LEARNED.
      // A manual-tuning session owns a delta without observations, so its changed keys keep the
      // explicit MANUAL_TUNING provenance instead of being relabelled as an import.
      provenanceByParameter[key] = manualProvenance ? 'MANUAL_TUNING' : 'IMPORTED';
      evidenceByParameter[key] = null;
    }
  }
  const content = Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    profileId: version.profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters: Object.freeze(parameters),
    unitsByParameter: Object.freeze(unitsByParameter) as DrivingProfile['unitsByParameter'],
    provenanceByParameter: Object.freeze(provenanceByParameter),
    evidenceByParameter: Object.freeze(evidenceByParameter),
    sourceSegmentIds: Object.freeze([...version.sourceSegmentIds]),
    createdAt: version.createdAt,
    checksum: `273-live:${version.checksum}`,
  });
  return Object.freeze(content) as DrivingProfile;
}

export function createLiveLearningPipeline(services: LiveLearningServices): LiveLearningPipeline {
  const data = record(services);
  const allowed = new Set<string>([
    'context',
    'playerId',
    'profileId',
    'engineVersion',
    'learningEpoch',
    'baseVersionId',
    'sessionId',
    'worldEpoch',
    'queue',
    'store',
    'activation',
    'telemetry',
    'modeSegments',
    'tick',
    'physicalState',
    'onActivated',
    'history',
    'now',
  ]);
  for (const key of Object.keys(data))
    requireContract(allowed.has(key), `Unknown live learning service: ${key}`);
  const playerId = text(data.playerId);
  const profileId = text(data.profileId);
  const engineVersion = text(data.engineVersion);
  const sessionId = text(data.sessionId);
  const worldEpoch = readTick(data.worldEpoch);
  let learningEpoch = readTick(data.learningEpoch);
  let baseVersionId = text(data.baseVersionId);
  requireContract(typeof data.tick === 'function', 'Live learning needs a fixed-tick readback');
  const tick = data.tick as () => number;
  requireContract(
    typeof data.physicalState === 'function',
    'Live learning needs a physical readback for the 205 barrier',
  );
  const physicalState = data.physicalState as () => string;
  requireContract(
    data.onActivated === undefined || typeof data.onActivated === 'function',
    'Live learning activation callback must be a function',
  );
  const onActivated = data.onActivated as
    ((input: { readonly versionId: string; readonly profile: DrivingProfile }) => void) | undefined;
  requireContract(
    typeof data.queue === 'object' &&
      data.queue !== null &&
      typeof (data.queue as LiveLearningQueue).submit === 'function' &&
      typeof (data.queue as LiveLearningQueue).cancel === 'function',
    'Live learning needs the real 103 queue',
  );
  const queue = data.queue as LiveLearningQueue;
  requireContract(
    typeof data.store === 'object' &&
      data.store !== null &&
      typeof (data.store as ProfileStore).getVersion === 'function' &&
      typeof (data.store as ProfileStore).engineVersion === 'string',
    'Live learning needs the real 109 store',
  );
  const store = data.store as ProfileStore;
  requireContract(store.engineVersion === engineVersion, 'Live learning engine and store differ');
  requireContract(
    typeof data.activation === 'object' &&
      data.activation !== null &&
      typeof (data.activation as ProfileActivation).publish === 'function' &&
      (data.activation as ProfileActivation).profileId === profileId,
    'Live learning needs the real 110 activation for its profile',
  );
  const activation = data.activation as ProfileActivation;
  requireContract(
    typeof data.telemetry === 'object' &&
      data.telemetry !== null &&
      typeof (data.telemetry as LiveLearningTelemetryPort).read === 'function' &&
      typeof (data.telemetry as LiveLearningTelemetryPort).readClosedSegment === 'function',
    'Live learning needs the 272 telemetry readback',
  );
  const telemetry = data.telemetry as LiveLearningTelemetryPort;
  requireContract(
    data.modeSegments === undefined ||
      (typeof data.modeSegments === 'object' && data.modeSegments !== null),
    'Live learning mode generation port is invalid',
  );
  const modeSegments = data.modeSegments as LiveLearningModeGenerationPort | undefined;
  const historyLimit =
    data.history === undefined ? LIVE_LEARNING_LIMITS.history : Number(data.history);
  requireContract(
    Number.isSafeInteger(historyLimit) &&
      historyLimit >= 1 &&
      historyLimit <= LIVE_LEARNING_LIMITS.maxConfiguredHistory,
    'Invalid live learning history limit',
  );

  const initial = store.getVersion(baseVersionId);
  requireContract(initial !== null, `Unknown live learning base version: ${baseVersionId}`);
  requireContract(initial.profileId === profileId, 'The base version belongs to another profile');
  requireContract(
    initial.engineVersion === engineVersion,
    'The base version targets another engine',
  );

  let headVersionId = baseVersionId;
  let disposed = false;
  let processing = false;
  let awaitingActivation = false;
  let pendingSegmentId: string | null = null;
  let lastStatus: LiveLearningStatus | null = null;
  let lastReason: LiveLearningReason | null = null;
  let lastError: string | null = null;
  let cityStyle: LiveLearningActivationView | null = null;
  let staleResults = 0;
  let publishes = 0;
  let dropped = 0;
  const retained: LiveLearningResult[] = [];
  const processed = new Set<string>();
  const processedOrder: string[] = [];
  /** 272 materializes the 088 window after the recorder closes; give it a few ticks. */
  const deferred = new Map<string, number>();
  const evidenceBySegment = new Map<string, LiveEvidencePayload>();
  const segmentEvidenceOrder: string[] = [];

  const counters = {
    segments: 0,
    eligible: 0,
    manualSkipped: 0,
    ineligibleSkipped: 0,
    incompleteSkipped: 0,
    jobs: 0,
    versions: 0,
    noChange: 0,
    insufficientEvidence: 0,
    stale: 0,
    failed: 0,
    deduplicated: 0,
    activationsPublished: 0,
    activationsApplied: 0,
    activationRejected: 0,
    barriers: 0,
    epochChanges: 0,
    physicalPreserved: 0,
  };

  const generationSegmentId = (epoch: number): string => bounded(`${profileId}:g${epoch}`, 256);
  const records: SegmentRecord[] = [
    {
      segmentId: generationSegmentId(learningEpoch),
      playerId,
      profileId,
      learningEpoch,
      baseVersionId,
      openedTick: tick(),
      closedTick: null,
      closeReason: null,
      status: 'OPEN',
    },
  ];
  const segmentPort: LearningEpochSegmentPort = {
    physical: () => physicalState(),
    close(request: LearningEpochSegmentCloseRequest): LearningEpochSegmentCloseReceipt {
      const row = records.find((entry) => entry.segmentId === request.segmentId);
      if (row === undefined || row.status !== 'OPEN')
        throw new Error(`Cannot close live learning generation ${request.segmentId}`);
      row.status = 'CLOSED';
      row.closedTick = request.tick;
      row.closeReason = request.reason;
      return Object.freeze({
        segmentId: request.segmentId,
        status: 'CLOSED' as const,
        reason: request.reason,
        tick: request.tick,
      });
    },
    open(request: LearningEpochSegmentOpenRequest): LearningEpochSegmentOpenReceipt {
      records.push({
        segmentId: request.segmentId,
        playerId: request.playerId,
        profileId: request.profileId,
        learningEpoch: request.learningEpoch,
        baseVersionId: request.baseVersionId,
        openedTick: request.tick,
        closedTick: null,
        closeReason: null,
        status: 'OPEN',
      });
      while (records.length > LIVE_LEARNING_LIMITS.generationSegments) {
        const closed = records.findIndex((entry) => entry.status === 'CLOSED');
        if (closed < 0) break;
        records.splice(closed, 1);
      }
      return Object.freeze({
        segmentId: request.segmentId,
        status: 'OPEN' as const,
        tick: request.tick,
      });
    },
  };

  const barrier: LearningEpochBarrier = createLearningEpochBarrier({
    playerId,
    profileId,
    engineVersion,
    learningEpoch,
    baseVersionId,
    segmentId: generationSegmentId(learningEpoch),
    openedTick: tick(),
    queue,
    store,
    activation,
    segments: segmentPort,
    tick,
  });

  const trackedQueue: ProfilePipelineQueue = {
    submit(value: unknown): LearningAdmission {
      barrier.trackJob(value);
      return queue.submit(value);
    },
  };

  let pipeline: ProfilePipeline = createProfilePipeline({
    engineVersion,
    playerId,
    profileId,
    learningEpoch,
    sessionId,
    worldEpoch,
    queue: trackedQueue,
    store,
    activation,
    tick,
    baseVersionId,
    history: historyLimit,
  });

  function rememberPayload(segmentId: string, payload: LiveEvidencePayload): void {
    evidenceBySegment.set(segmentId, payload);
    segmentEvidenceOrder.push(segmentId);
    while (segmentEvidenceOrder.length > LIVE_LEARNING_LIMITS.evidencePayloads) {
      const oldest = segmentEvidenceOrder.shift();
      if (oldest !== undefined) evidenceBySegment.delete(oldest);
    }
  }

  function markProcessed(segmentId: string): void {
    processed.add(segmentId);
    processedOrder.push(segmentId);
    while (processedOrder.length > LIVE_LEARNING_LIMITS.processedSegments) {
      const oldest = processedOrder.shift();
      if (oldest !== undefined) processed.delete(oldest);
    }
  }

  function remember(result: LiveLearningResult): LiveLearningResult {
    retained.push(result);
    while (retained.length > historyLimit) {
      retained.shift();
      dropped += 1;
    }
    lastStatus = result.status;
    lastReason = result.reason;
    return result;
  }

  function resultOf(input: {
    readonly segmentId: string;
    readonly status: LiveLearningStatus;
    readonly reason: LiveLearningReason | null;
    readonly code?: string | null;
    readonly detail?: string | null;
    readonly segmentStartTick?: number;
    readonly epoch?: number;
    readonly base?: string | null;
    readonly key?: ParameterKey | null;
    readonly candidateStatus?: string | null;
    readonly candidateValue?: number | null;
    readonly evidenceStatus?: string | null;
    readonly episodes?: number;
    readonly jobSubmitted?: boolean;
    readonly versionId?: string | null;
    readonly parentVersionId?: string | null;
    readonly activationStatus?: string | null;
    readonly activateAtTick?: number | null;
    readonly evidenceReady?: boolean;
    readonly candidateReady?: boolean;
  }): LiveLearningResult {
    return Object.freeze({
      version: LIVE_LEARNING_VERSION,
      segmentId: input.segmentId,
      status: input.status,
      reason: input.reason,
      code: input.code ?? null,
      detail: bounded(input.detail ?? '', LIVE_LEARNING_LIMITS.reasonCodeUnits) || null,
      tick: tick(),
      segmentStartTick: input.segmentStartTick ?? 0,
      learningEpoch: input.epoch ?? learningEpoch,
      profileId,
      baseVersionId: input.base ?? null,
      key: input.key ?? null,
      candidateStatus: input.candidateStatus ?? null,
      candidateValue: input.candidateValue ?? null,
      evidenceStatus: input.evidenceStatus ?? null,
      episodes: input.episodes ?? 0,
      jobSubmitted: input.jobSubmitted ?? false,
      versionId: input.versionId ?? null,
      parentVersionId: input.parentVersionId ?? null,
      activationStatus: input.activationStatus ?? null,
      activateAtTick: input.activateAtTick ?? null,
      evidenceReady: input.evidenceReady ?? false,
      candidateReady: input.candidateReady ?? false,
    });
  }

  function fail(
    summary: LiveTelemetrySegmentSummary,
    status: LiveLearningStatus,
    reason: LiveLearningReason,
    detail: string,
    code: string | null = null,
  ): LiveLearningResult {
    return remember(
      resultOf({
        segmentId: summary.segmentId,
        status,
        reason,
        code,
        detail,
        segmentStartTick: summary.startTick,
        epoch: summary.learningEpoch,
        base: summary.baseVersionId,
      }),
    );
  }

  function applyVersion(versionId: string, appliedAtTick: number): void {
    const version = store.getVersion(versionId);
    if (version === null) {
      lastError = `Activated version ${versionId} is missing from the 109 store`;
      return;
    }
    cityStyle = Object.freeze({
      versionId,
      profileId: version.profileId,
      parameters: Object.freeze({ ...version.parameters }),
      appliedAtTick,
    });
    if (onActivated === undefined) return;
    try {
      onActivated({ versionId, profile: profileFromVersion(version, evidenceBySegment) });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  function advanceActivation(): boolean {
    const step = pipeline.advance();
    if (step === null) return false;
    if (step.status === 'APPLIED' && step.versionId !== null) {
      counters.activationsApplied += 1;
      applyVersion(step.versionId, step.appliedTick ?? step.tick);
      return true;
    }
    return false;
  }

  function adoptBarrier(result: ReturnType<LearningEpochBarrier['resolve']>): void {
    if (result.status !== 'APPLIED' || result.barrier === null) {
      if (result.status === 'ROLLED_BACK') counters.failed += 1;
      return;
    }
    const generation = barrier.current();
    const changed = generation.learningEpoch !== learningEpoch;
    learningEpoch = generation.learningEpoch;
    baseVersionId = generation.baseVersionId;
    headVersionId = generation.baseVersionId;
    counters.barriers += 1;
    if (changed) counters.epochChanges += 1;
    if (result.barrier.physicalPreserved) counters.physicalPreserved += 1;
    awaitingActivation = true;
    pipeline.dispose();
    pipeline = createProfilePipeline({
      engineVersion,
      playerId,
      profileId,
      learningEpoch,
      sessionId,
      worldEpoch,
      queue: trackedQueue,
      store,
      activation,
      tick,
      baseVersionId,
      history: historyLimit,
    });
    // PBI 279: a manual-tuning barrier belongs to the 230 style session. The fleet/city style
    // activation still applies, but the open 069 segment keeps its target until the next session or
    // segment boundary; rotating it in the same tick would invalidate the 069 fence.
    const manualTuning =
      store
        .getVersion(result.barrier.targetVersionId)
        ?.provenance.delta?.reason?.startsWith('MANUAL_TUNING') === true;
    if (!manualTuning) modeSegments?.updateGeneration?.({ baseVersionId, learningEpoch });
  }

  function handleResult(
    summary: LiveTelemetrySegmentSummary,
    payload: LiveEvidencePayload,
    result: ProfilePipelineResult,
    generation: number,
  ): LiveLearningResult {
    if (generation !== learningEpoch) {
      staleResults += 1;
      counters.stale += 1;
      return remember(
        resultOf({
          segmentId: summary.segmentId,
          status: 'STALE_JOB',
          reason: 'GENERATION_INVALIDATED',
          code: result.code,
          detail: 'The result belongs to a superseded learning generation',
          segmentStartTick: summary.startTick,
          epoch: generation,
          base: summary.baseVersionId,
          key: payload.key,
          candidateStatus: payload.candidate.status,
          candidateValue: payload.candidate.value,
          evidenceStatus: payload.evidence.status,
          episodes: payload.episodes.length,
          jobSubmitted: result.jobSubmitted,
          versionId: null,
          parentVersionId: null,
          evidenceReady: payload.evidenceReady,
          candidateReady: payload.candidateReady,
        }),
      );
    }
    const common = {
      segmentId: summary.segmentId,
      segmentStartTick: summary.startTick,
      epoch: generation,
      base: result.baseVersionId,
      key: payload.key,
      candidateStatus: payload.candidate.status,
      candidateValue: payload.candidate.value,
      evidenceStatus: payload.evidence.status,
      episodes: payload.episodes.length,
      jobSubmitted: result.jobSubmitted,
      evidenceReady: payload.evidenceReady,
      candidateReady: payload.candidateReady,
    } as const;
    if (result.status === 'COMPOSED' || result.status === 'RECOMPOSED') {
      if (result.versionId !== null) {
        headVersionId = result.versionId;
        counters.versions += 1;
        publishes += 1;
      }
      if (result.activation?.status === 'PENDING') counters.activationsPublished += 1;
      else if (result.activation?.status === 'REJECTED') counters.activationRejected += 1;
      return remember(
        resultOf({
          ...common,
          status: result.status === 'RECOMPOSED' ? 'RECOMPOSED' : 'COMPOSED',
          reason: null,
          code: result.code,
          detail: result.detail,
          versionId: result.versionId,
          parentVersionId: result.parentVersionId,
          activationStatus: result.activation?.status ?? null,
          activateAtTick: result.activation?.activateAtTick ?? null,
        }),
      );
    }
    if (result.status === 'NO_CHANGE') {
      counters.noChange += 1;
      if (payload.insufficient) counters.insufficientEvidence += 1;
      return remember(
        resultOf({
          ...common,
          status: payload.insufficient ? 'INSUFFICIENT_EVIDENCE' : 'NO_CHANGE',
          reason: payload.insufficient
            ? payload.evidenceReady
              ? 'NO_CHANGE'
              : 'INSUFFICIENT_EVIDENCE'
            : 'NO_CHANGE',
          code: result.code,
          detail:
            payload.reason ??
            result.detail ??
            `The composition keeps ${payload.key} at ${payload.baseValue}`,
          versionId: null,
        }),
      );
    }
    if (result.status === 'DEDUPLICATED') {
      counters.deduplicated += 1;
      return remember(
        resultOf({
          ...common,
          status: 'DEDUPLICATED',
          reason: 'NO_CHANGE',
          code: result.code,
          detail: result.detail,
          versionId: result.versionId,
          parentVersionId: result.parentVersionId,
        }),
      );
    }
    if (result.status === 'STALE_JOB') {
      counters.stale += 1;
      staleResults += 1;
      return remember(
        resultOf({
          ...common,
          status: 'STALE_JOB',
          reason: result.reason === 'BASE_SUPERSEDED' ? 'BASE_SUPERSEDED' : 'EPOCH_MISMATCH',
          code: result.code,
          detail: result.detail,
          versionId: null,
        }),
      );
    }
    if (result.status === 'SKIPPED_MANUAL') {
      counters.manualSkipped += 1;
      return remember(
        resultOf({
          ...common,
          status: 'SKIPPED_MANUAL',
          reason:
            result.reason === 'AUTO_SEGMENT_NOT_LEARNABLE'
              ? 'AUTO_SEGMENT_NOT_LEARNABLE'
              : 'MANUAL_SEGMENT_NOT_LEARNABLE',
          code: result.code,
          detail: result.detail,
        }),
      );
    }
    if (result.status === 'SKIPPED_INELIGIBLE') {
      counters.ineligibleSkipped += 1;
      return remember(
        resultOf({
          ...common,
          status: 'SKIPPED_INELIGIBLE',
          reason: 'SEGMENT_INELIGIBLE',
          code: result.code,
          detail: result.detail,
        }),
      );
    }
    counters.failed += 1;
    const generationInvalidated =
      result.code === 'GENERATION_INVALIDATED' ||
      result.code === 'QUEUE_DISPOSED' ||
      result.code === 'PROFILE_OWNER_MISMATCH';
    if (generationInvalidated) {
      counters.stale += 1;
      staleResults += 1;
    }
    return remember(
      resultOf({
        ...common,
        status: generationInvalidated ? 'STALE_JOB' : 'FAILED',
        reason: generationInvalidated ? 'GENERATION_INVALIDATED' : 'COMPOSITION_REJECTED',
        code: result.code,
        detail: result.detail ?? `The 112 pipeline answered ${result.status}`,
        versionId: null,
      }),
    );
  }

  async function runSegment(summary: LiveTelemetrySegmentSummary): Promise<LiveLearningResult> {
    const generation = learningEpoch;
    pendingSegmentId = summary.segmentId;
    processing = true;
    try {
      const read = telemetry.readClosedSegment(summary.segmentId);
      if (read === null)
        return fail(
          summary,
          'FAILED',
          'SEGMENT_NOT_FOUND',
          'The closed segment could not be materialized',
        );
      const base = store.getVersion(summary.baseVersionId) ?? store.getVersion(headVersionId);
      if (base === null)
        return fail(summary, 'FAILED', 'STORE_REJECTED', 'No base version for the segment');
      const payload = deriveLiveLearningPayload(read, {
        baseValue: (key: ParameterKey) => {
          const version =
            store.getVersion(summary.baseVersionId) ?? store.getVersion(headVersionId);
          const fallback = getParameterDefinition(key).default;
          return version?.parameters[key] ?? fallback;
        },
      });
      rememberPayload(summary.segmentId, payload);
      counters.eligible += 1;
      const job: ProfileLearningSegment = Object.freeze({
        segmentId: summary.segmentId,
        mode: 'LEARNING' as const,
        eligible: true,
        order: summary.startTick,
        key: payload.key,
        baseValue: payload.baseValue,
        evidence: payload.evidence,
        episodes: payload.episodes,
        candidate: payload.candidate,
        learningEpoch: generation,
        baseVersionId: summary.baseVersionId,
        interventionId: bounded(`273:${summary.segmentId}`, 256),
        reason: bounded(
          `live LEARNING segment ${summary.segmentId}`,
          LIVE_LEARNING_LIMITS.reasonCodeUnits,
        ),
      });
      counters.jobs += 1;
      const result = await pipeline.onSegmentClosed(job);
      return handleResult(summary, payload, result, generation);
    } catch (error) {
      counters.failed += 1;
      return fail(
        summary,
        'FAILED',
        'EVIDENCE_INVALID',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      processing = false;
      pendingSegmentId = null;
      if (queue.acknowledge !== undefined) {
        await queue.acknowledge(summary.segmentId).catch(() => false);
      }
    }
  }

  function handleClosedSegment(summary: LiveTelemetrySegmentSummary): void {
    if (processed.has(summary.segmentId)) return;
    const skipWithoutJob =
      summary.completeness !== 'CLOSED' ||
      summary.controlMode !== 'LEARNING' ||
      !summary.learningEligible ||
      summary.profileId !== profileId ||
      summary.learningEpoch !== learningEpoch;
    if (!skipWithoutJob && (processing || awaitingActivation)) return;
    if (!skipWithoutJob) {
      const read = telemetry.readClosedSegment(summary.segmentId);
      const needsMaterialization =
        read === null ||
        (summary.artifacts === 0 && read.artifactWindow === null) ||
        read.opportunities.length < summary.opportunities ||
        read.windows.length < summary.eligibleWindows ||
        read.opportunities.some(
          (opportunity) => summary.learningEligible && !opportunity.learningEligible,
        ) ||
        (summary.eligibleWindows > 0 &&
          !read.windows.some(
            (window) => window.segmentId === summary.segmentId && window.windowClass === 'ELIGIBLE',
          ));
      if (needsMaterialization) {
        const attempts = (deferred.get(summary.segmentId) ?? 0) + 1;
        if (attempts <= 30) {
          deferred.set(summary.segmentId, attempts);
          return;
        }
      }
      deferred.delete(summary.segmentId);
    }
    markProcessed(summary.segmentId);
    counters.segments += 1;
    if (summary.completeness !== 'CLOSED') {
      counters.incompleteSkipped += 1;
      remember(
        resultOf({
          segmentId: summary.segmentId,
          status: 'SKIPPED_INCOMPLETE',
          reason: 'SEGMENT_INCOMPLETE',
          detail: 'Only a closed segment can produce a learning job',
          segmentStartTick: summary.startTick,
          epoch: summary.learningEpoch,
          base: summary.baseVersionId,
        }),
      );
      return;
    }
    if (summary.controlMode !== 'LEARNING') {
      counters.manualSkipped += 1;
      remember(
        resultOf({
          segmentId: summary.segmentId,
          status: 'SKIPPED_MANUAL',
          reason:
            summary.controlMode === 'MANUAL'
              ? 'MANUAL_SEGMENT_NOT_LEARNABLE'
              : 'AUTO_SEGMENT_NOT_LEARNABLE',
          detail:
            summary.controlMode === 'MANUAL'
              ? 'MANUAL observations never update the profile'
              : 'AUTO observations are not a learning source',
          segmentStartTick: summary.startTick,
          epoch: summary.learningEpoch,
          base: summary.baseVersionId,
        }),
      );
      return;
    }
    if (!summary.learningEligible) {
      counters.ineligibleSkipped += 1;
      remember(
        resultOf({
          segmentId: summary.segmentId,
          status: 'SKIPPED_INELIGIBLE',
          reason: 'SEGMENT_INELIGIBLE',
          detail: 'The segment windows are not eligible for learning',
          segmentStartTick: summary.startTick,
          epoch: summary.learningEpoch,
          base: summary.baseVersionId,
        }),
      );
      return;
    }
    if (summary.profileId !== profileId) {
      counters.stale += 1;
      staleResults += 1;
      remember(
        resultOf({
          segmentId: summary.segmentId,
          status: 'STALE_JOB',
          reason: 'PROFILE_MISMATCH',
          detail: `The segment belongs to ${summary.profileId}`,
          segmentStartTick: summary.startTick,
          epoch: summary.learningEpoch,
          base: summary.baseVersionId,
        }),
      );
      return;
    }
    if (summary.learningEpoch !== learningEpoch) {
      counters.stale += 1;
      staleResults += 1;
      remember(
        resultOf({
          segmentId: summary.segmentId,
          status: 'STALE_JOB',
          reason: 'EPOCH_MISMATCH',
          detail: `Segment epoch ${summary.learningEpoch} is not generation ${learningEpoch}`,
          segmentStartTick: summary.startTick,
          epoch: summary.learningEpoch,
          base: summary.baseVersionId,
        }),
      );
      return;
    }
    void runSegment(summary);
  }

  function nextClosedSegment(): LiveTelemetrySegmentSummary | null {
    const rows = telemetry
      .read()
      .closedSegments.filter((summary) => !processed.has(summary.segmentId));
    rows.sort(
      (left, right) =>
        left.startTick - right.startTick || left.segmentId.localeCompare(right.segmentId),
    );
    return rows[0] ?? null;
  }

  function currentStats(): LiveLearningStats {
    return Object.freeze({
      version: LIVE_LEARNING_VERSION,
      disposed,
      segments: counters.segments,
      eligible: counters.eligible,
      manualSkipped: counters.manualSkipped,
      ineligibleSkipped: counters.ineligibleSkipped,
      incompleteSkipped: counters.incompleteSkipped,
      jobs: counters.jobs,
      versions: counters.versions,
      noChange: counters.noChange,
      insufficientEvidence: counters.insufficientEvidence,
      stale: counters.stale,
      failed: counters.failed,
      deduplicated: counters.deduplicated,
      activationsPublished: counters.activationsPublished,
      activationsApplied: counters.activationsApplied,
      activationRejected: counters.activationRejected,
      barriers: counters.barriers,
      epochChanges: counters.epochChanges,
      physicalPreserved: counters.physicalPreserved,
      history: retained.length,
      dropped,
      headVersionId,
      learningEpoch,
    });
  }

  const api: LiveLearningPipeline = {
    version: LIVE_LEARNING_VERSION,
    profileId,
    get learningEpoch() {
      return learningEpoch;
    },
    engineVersion,
    step(atTick?: number): void {
      if (disposed) return;
      if (atTick !== undefined) {
        const value = readTick(atTick);
        if (value !== tick()) return;
      }
      const pendingBarrier = barrier.pending();
      if (pendingBarrier !== null) {
        const resolved = barrier.resolve();
        adoptBarrier(resolved);
        if (resolved.status === 'APPLIED') {
          advanceActivation();
          return;
        }
        if (resolved.status === 'REJECTED' || resolved.status === 'ROLLED_BACK') {
          lastStatus = 'FAILED';
          lastReason =
            resolved.status === 'ROLLED_BACK' ? 'BARRIER_ROLLED_BACK' : 'BARRIER_REJECTED';
          lastError = resolved.detail;
        }
      }
      if (awaitingActivation) {
        const applied = advanceActivation();
        if (applied || activation.pending() === null) awaitingActivation = false;
        if (awaitingActivation) return;
      }
      advanceActivation();
      if (activation.pending() !== null) return;
      if (processing) return;
      const next = nextClosedSegment();
      if (next !== null) handleClosedSegment(next);
    },
    head: () => headVersionId,
    epochBarrier: () => barrier,
    activationOwner: () => activation,
    refreshFromBarrier(): void {
      const generation = barrier.current();
      learningEpoch = generation.learningEpoch;
      baseVersionId = generation.baseVersionId;
      headVersionId = generation.baseVersionId;
      awaitingActivation = true;
      pipeline.dispose();
      pipeline = createProfilePipeline({
        engineVersion,
        playerId,
        profileId,
        learningEpoch,
        sessionId,
        worldEpoch,
        queue: trackedQueue,
        store,
        activation,
        tick,
        baseVersionId,
        history: historyLimit,
      });
    },
    profileForVersion(versionId: string): DrivingProfile | null {
      const version = store.getVersion(versionId);
      return version === null
        ? null
        : profileFromVersion(version, new Map<string, LiveEvidencePayload>(), true);
    },
    requestProfileChange(input: unknown) {
      const result = barrier.requestChange(input);
      if (result.status === 'PENDING') lastStatus = 'PENDING';
      return result;
    },
    isCurrent: (value: unknown) => barrier.isCurrent(value),
    async observeSegment(segmentId: string): Promise<LiveLearningResult> {
      if (disposed)
        return remember(
          resultOf({
            segmentId,
            status: 'FAILED',
            reason: 'PIPELINE_DISPOSED',
            detail: 'The live learning pipeline was disposed',
          }),
        );
      const summary = telemetry.read().closedSegments.find((row) => row.segmentId === segmentId);
      if (summary === undefined)
        return remember(
          resultOf({
            segmentId,
            status: 'FAILED',
            reason: 'SEGMENT_NOT_FOUND',
            detail: 'The telemetry read model has no such closed segment',
          }),
        );
      if (processed.has(segmentId)) {
        const prior = retained.find((row) => row.segmentId === segmentId);
        if (prior !== undefined) return prior;
        return resultOf({
          segmentId,
          status: 'DEDUPLICATED',
          reason: 'NO_CHANGE',
          detail: 'This segment was already observed by the live learning pipeline',
        });
      }
      markProcessed(segmentId);
      counters.segments += 1;
      if (summary.controlMode !== 'LEARNING') {
        return remember(
          resultOf({
            segmentId,
            status: 'SKIPPED_MANUAL',
            reason:
              summary.controlMode === 'MANUAL'
                ? 'MANUAL_SEGMENT_NOT_LEARNABLE'
                : 'AUTO_SEGMENT_NOT_LEARNABLE',
            detail: 'The segment mode is not a learning source',
            segmentStartTick: summary.startTick,
            epoch: summary.learningEpoch,
            base: summary.baseVersionId,
          }),
        );
      }
      if (!summary.learningEligible)
        return remember(
          resultOf({
            segmentId,
            status: 'SKIPPED_INELIGIBLE',
            reason: 'SEGMENT_INELIGIBLE',
            detail: 'The segment windows are not eligible for learning',
            segmentStartTick: summary.startTick,
            epoch: summary.learningEpoch,
            base: summary.baseVersionId,
          }),
        );
      if (summary.learningEpoch !== learningEpoch)
        return remember(
          resultOf({
            segmentId,
            status: 'STALE_JOB',
            reason: 'EPOCH_MISMATCH',
            detail: 'The segment belongs to a foreign learning generation',
            segmentStartTick: summary.startTick,
            epoch: summary.learningEpoch,
            base: summary.baseVersionId,
          }),
        );
      return runSegment(summary);
    },
    read(): LiveLearningReadModel {
      const version = store.getVersion(headVersionId);
      const parameters = version === null ? {} : { ...version.parameters };
      let evidenceKeys: { key: string; status: string }[] = [];
      const lastPayload = retained
        .slice()
        .reverse()
        .map((row) => evidenceBySegment.get(row.segmentId))
        .find((payload): payload is LiveEvidencePayload => payload !== undefined);
      if (lastPayload !== undefined)
        evidenceKeys = lastPayload.candidates.map((row) => ({
          key: row.key,
          status: row.evidenceStatus,
        }));
      return Object.freeze({
        version: LIVE_LEARNING_VERSION,
        contract: LIVE_LEARNING_VERSION,
        disposed,
        tick: tick(),
        engineVersion,
        playerId,
        profileId,
        sessionId,
        worldEpoch,
        learningEpoch,
        baseVersionId,
        headVersionId,
        lastStatus,
        lastReason,
        stats: currentStats(),
        profile: Object.freeze({
          versionId: headVersionId,
          checksum: version?.checksum ?? '',
          fingerprint: fingerprint(parameters),
          parameters: Object.freeze(parameters),
          sourceSegmentIds: Object.freeze(version === null ? [] : [...version.sourceSegmentIds]),
        }),
        cityStyle,
        barrier: barrier.stats(),
        activation: activation.stats(),
        history: Object.freeze(retained.slice()),
        pendingSegment: pendingSegmentId,
        pendingActivation: activation.pending()?.commandId ?? null,
        evidenceKeys: Object.freeze(evidenceKeys),
        staleResults,
        publishes,
        lastError,
      });
    },
    history: () => Object.freeze(retained.slice()),
    stats: currentStats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (pendingSegmentId !== null) queue.cancel(pendingSegmentId);
      if (queue.acknowledge !== undefined) {
        for (const result of retained) {
          if (!result.jobSubmitted) continue;
          void queue.acknowledge(result.segmentId).catch(() => false);
        }
      }
      pipeline.dispose();
      barrier.dispose();
      retained.length = 0;
      processed.clear();
      processedOrder.length = 0;
      evidenceBySegment.clear();
      segmentEvidenceOrder.length = 0;
    },
  };

  return Object.freeze(api);
}
