import { choice, number, record, requireContract, text, tick as readTick } from '../sessions';
import { learningSegmentModes, validateCandidateDelta } from '../learning';
import type {
  ConfidenceCandidate,
  LearningAdmission,
  LearningComposition,
  LearningJob,
  LearningSegmentMode,
  ParameterEvidenceReadModel,
  ProfileBlendEpisode,
} from '../learning';
import { getParameterDefinition } from '../profiles';
import type {
  ParameterKey,
  ProfileDeltaRequest,
  ProfileDeltaValidator,
  ProfileStore,
  ProfileVersion,
} from '../profiles';
import type { ProfileActivation, ProfileActivationCommand } from '../fleet';

/**
 * End-to-end learning publication pipeline for PBI 112.
 *
 * One closed LEARNING segment goes through the real modules in order: the 103 serial estimator
 * queue (admission, worker proposal, serial recomposition, 102 composition gate), the 109 immutable
 * profile store (explicit parent, one version per changed segment, idempotent retry) and the 110
 * fleet activation (one command for the next common tick). MANUAL/AUTO and ineligible LEARNING
 * segments never reach the queue, and a composed result without an actual value change never
 * produces a version. The pipeline recomposes nothing itself: the queue's latest composition is
 * the only source of values, and a composition that no longer covers the accepted chain is a stale
 * job instead of a silent overwrite of another intervention.
 */
export const PROFILE_PIPELINE_VERSION = '112-profile-pipeline-v1' as const;

export const PROFILE_PIPELINE_LIMITS = Object.freeze({
  /** Retained results; older entries are dropped, never merged. */
  history: 16,
  maxConfiguredHistory: 64,
  /** Retained segment ledger used for idempotent replays. */
  ledger: 64,
  reasonCodeUnits: 240,
});

/** Closed result vocabulary. A skipped path can never become a publication. */
export const profilePipelineStatuses = [
  'COMPOSED',
  'RECOMPOSED',
  'NO_CHANGE',
  'DEDUPLICATED',
  'SKIPPED_MANUAL',
  'SKIPPED_INELIGIBLE',
  'STALE_JOB',
  'FAILED',
] as const;
export type ProfilePipelineStatus = (typeof profilePipelineStatuses)[number];

/** Closed pipeline reasons; domain codes from 102/103/109/110 stay in `result.code`. */
export const profilePipelineReasons = [
  'MANUAL_SEGMENT_NOT_LEARNABLE',
  'AUTO_SEGMENT_NOT_LEARNABLE',
  'SEGMENT_INELIGIBLE',
  'SEGMENT_NOT_FOUND',
  'DUPLICATE_SEGMENT',
  'NO_CHANGE',
  'EPOCH_MISMATCH',
  'BASE_MISMATCH',
  'BASE_SUPERSEDED',
  'LEARNING_JOB_REJECTED',
  'LEARNING_JOB_FAILED',
  'COMPOSITION_REJECTED',
  'DELTA_REJECTED',
  'STORE_REJECTED',
  'PIPELINE_DISPOSED',
] as const;
export type ProfilePipelineReason = (typeof profilePipelineReasons)[number];

/**
 * One closed 069/103 segment. Only `segmentId` is required when a `segments` source is injected;
 * everything else is the job payload the 103 queue validates again.
 */
export interface ProfileLearningSegment {
  readonly segmentId: string;
  readonly mode: LearningSegmentMode;
  readonly eligible: boolean;
  readonly order: number;
  readonly key: ParameterKey;
  readonly baseValue: number;
  readonly evidence: ParameterEvidenceReadModel;
  readonly episodes: readonly ProfileBlendEpisode[];
  readonly candidate: ConfidenceCandidate;
  /** Epoch the segment was observed in; a different epoch is a stale job, not a retry. */
  readonly learningEpoch?: number;
  /** Base the segment was observed against; an accepted ancestor is a valid recomposition base. */
  readonly baseVersionId?: string;
  readonly interventionId?: string;
  readonly reason?: string;
}

/** 069/103 job source: resolves a segment by id when the caller only has its identity. */
export interface ProfileSegmentSource {
  read(segmentId: string): ProfileLearningSegment | null;
}

/** Structural view of the 103 `LearningEstimatorQueue`; the real class satisfies it. */
export interface ProfilePipelineQueue {
  submit(value: unknown): LearningAdmission;
}

/** Optional 111 observation port. It never repairs, rolls back or rewrites a version. */
export interface ProfilePipelineContinuityInput {
  readonly profileId: string;
  readonly versionId: string;
  readonly tick: number;
  readonly activateAtTick: number;
  readonly appliedAtTick: number;
}

export interface ProfilePipelineContinuityResult {
  readonly status: string;
  readonly violations: readonly string[];
}

export interface ProfilePipelineContinuity {
  verify(input: ProfilePipelineContinuityInput): ProfilePipelineContinuityResult;
}

export interface ProfilePipelineServices {
  readonly engineVersion: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  /** Real 103 serial estimator queue. */
  readonly queue: ProfilePipelineQueue;
  /** Real 109 immutable profile store. */
  readonly store: ProfileStore;
  /** Optional 110 fleet activation controller. */
  readonly activation?: ProfileActivation;
  /** Optional 111 continuity guard, observed after an applied activation. */
  readonly continuity?: ProfilePipelineContinuity;
  /** 102 numeric gate used before a version is derived; defaults to `validateCandidateDelta`. */
  readonly delta?: ProfileDeltaValidator;
  /** Optional 069/103 segment source for calls that only carry a segment identity. */
  readonly segments?: ProfileSegmentSource;
  /** Fixed-tick readback; a publication always targets `tick() + 1`. */
  readonly tick: () => number;
  /** Host tick driver used between consecutive interventions; the game loop owns ticks. */
  readonly advanceTick?: () => number;
  /** Starting head when the store already holds a history; defaults to the store tip. */
  readonly baseVersionId?: string;
  /** Bounded retained result count; defaults to 16. */
  readonly history?: number;
}

export interface ProfilePipelineCompositionRecord {
  readonly key: string;
  readonly baseVersionId: string;
  readonly profileVersionId: string;
  readonly baseValue: number;
  readonly value: number;
  readonly appliedSegments: readonly string[];
  readonly appliedOrders: readonly number[];
  /** True when the 103 ledger folded more than one proposal or a newer base was accepted. */
  readonly recomposed: boolean;
}

export interface ProfilePipelineActivationRecord {
  readonly commandId: string | null;
  readonly status: 'PENDING' | 'REJECTED';
  readonly duplicate: boolean;
  readonly versionId: string;
  readonly publishedAtTick: number;
  readonly activateAtTick: number | null;
  /** Closed 110 publication reason when the command was refused. */
  readonly code: string | null;
  readonly message: string | null;
}

export interface ProfilePipelineResult {
  readonly version: typeof PROFILE_PIPELINE_VERSION;
  readonly segmentId: string;
  readonly mode: string;
  readonly status: ProfilePipelineStatus;
  readonly reason: ProfilePipelineReason | null;
  /** Closed domain code from 102/103/109/110, or null. */
  readonly code: string | null;
  readonly detail: string | null;
  readonly order: number;
  readonly learningEpoch: number;
  /** Generation base used by the 103 job, or null when no job was submitted. */
  readonly baseVersionId: string | null;
  /** Parent recorded by the 109 store, or null when no version exists. */
  readonly parentVersionId: string | null;
  readonly versionId: string | null;
  readonly jobSubmitted: boolean;
  readonly deduplicated: boolean;
  readonly tick: number;
  readonly composition: ProfilePipelineCompositionRecord | null;
  readonly activation: ProfilePipelineActivationRecord | null;
}

export interface ProfilePipelineActivationStep {
  readonly version: typeof PROFILE_PIPELINE_VERSION;
  readonly status: string;
  readonly tick: number;
  readonly versionId: string | null;
  readonly activationTick: number | null;
  readonly appliedTick: number | null;
  readonly updated: number;
  readonly continuity: ProfilePipelineContinuityResult | null;
}

export interface ProfilePipelineStats {
  readonly version: typeof PROFILE_PIPELINE_VERSION;
  readonly disposed: boolean;
  readonly segments: number;
  readonly jobs: number;
  readonly versions: number;
  readonly noChange: number;
  readonly manualSkipped: number;
  readonly ineligibleSkipped: number;
  readonly failed: number;
  readonly stale: number;
  readonly recomposed: number;
  readonly deduplicated: number;
  readonly activationsPublished: number;
  readonly activationsApplied: number;
  readonly activationRejected: number;
  readonly history: number;
  readonly dropped: number;
  readonly headVersionId: string;
}

export interface ProfilePipeline {
  readonly version: typeof PROFILE_PIPELINE_VERSION;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly engineVersion: string;
  /** Current accepted head; never a composition key. */
  head(): string;
  /** One closed segment; resolves with the real queue outcome and publication decision. */
  onSegmentClosed(segment: unknown): Promise<ProfilePipelineResult>;
  /** Consecutive interventions, processed in order and separated by one host tick. */
  processInterventions(segments: readonly unknown[]): Promise<readonly ProfilePipelineResult[]>;
  /** Applies a pending 110 command at the current fixed tick; never creates a version. */
  advance(): ProfilePipelineActivationStep | null;
  history(): readonly ProfilePipelineResult[];
  stats(): ProfilePipelineStats;
  dispose(): void;
}

interface SegmentRequest {
  readonly segmentId: string;
  readonly mode: LearningSegmentMode;
  readonly eligible: boolean;
  readonly order: number;
  readonly key: ParameterKey;
  readonly baseValue: number;
  readonly evidence: ParameterEvidenceReadModel;
  readonly episodes: readonly ProfileBlendEpisode[];
  readonly candidate: ConfidenceCandidate;
  readonly learningEpoch: number | null;
  readonly baseVersionId: string | null;
  readonly interventionId: string | null;
  readonly reason: string | null;
}

interface ResultDraft {
  segmentId: string;
  mode: string;
  status: ProfilePipelineStatus;
  reason: ProfilePipelineReason | null;
  code: string | null;
  detail: string | null;
  order: number;
  learningEpoch: number;
  baseVersionId: string | null;
  parentVersionId: string | null;
  versionId: string | null;
  jobSubmitted: boolean;
  deduplicated: boolean;
  tick: number;
  composition: ProfilePipelineCompositionRecord | null;
  activation: ProfilePipelineActivationRecord | null;
}

interface TerminalRecord {
  readonly result: ProfilePipelineResult;
  readonly request: ProfileDeltaRequest | null;
}

const serviceFields = [
  'engineVersion',
  'playerId',
  'profileId',
  'learningEpoch',
  'sessionId',
  'worldEpoch',
  'queue',
  'store',
  'activation',
  'continuity',
  'delta',
  'segments',
  'tick',
  'advanceTick',
  'baseVersionId',
  'history',
] as const;

const segmentFields = [
  'segmentId',
  'mode',
  'eligible',
  'order',
  'key',
  'baseValue',
  'evidence',
  'episodes',
  'candidate',
  'learningEpoch',
  'baseVersionId',
  'interventionId',
  'reason',
] as const;

function bounded(value: string, maximum: number): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function optionalText(value: unknown): string | null {
  return value === undefined || value === null ? null : text(value);
}

function segmentOf(value: unknown): SegmentRequest {
  const data = record(value);
  const allowed = new Set<string>(segmentFields);
  for (const key of Object.keys(data))
    requireContract(allowed.has(key), `Unknown learning segment field: ${key}`);
  const segmentId = text(data.segmentId);
  const mode = choice(data.mode, learningSegmentModes);
  requireContract(
    typeof data.eligible === 'boolean',
    'A learning segment must declare eligibility explicitly',
  );
  const order = readTick(data.order);
  requireContract(
    typeof data.key === 'string' && data.key.length > 0,
    'A learning segment needs a parameter key',
  );
  const definition = getParameterDefinition(data.key);
  const baseValue = number(data.baseValue, definition.min, definition.max);
  requireContract(
    typeof data.evidence === 'object' && data.evidence !== null,
    'A learning segment needs the 093 evidence read model',
  );
  requireContract(Array.isArray(data.episodes), 'A learning segment needs its episodes');
  requireContract(
    typeof data.candidate === 'object' && data.candidate !== null,
    'A learning segment needs an estimator candidate',
  );
  return {
    segmentId,
    mode,
    eligible: data.eligible,
    order,
    key: definition.key as ParameterKey,
    baseValue,
    evidence: data.evidence as ParameterEvidenceReadModel,
    episodes: data.episodes as readonly ProfileBlendEpisode[],
    candidate: data.candidate as ConfidenceCandidate,
    learningEpoch: data.learningEpoch === undefined ? null : readTick(data.learningEpoch),
    baseVersionId: optionalText(data.baseVersionId),
    interventionId: optionalText(data.interventionId),
    reason: optionalText(data.reason),
  };
}

function versionIdFor(segmentId: string): string {
  const suffix = '~112';
  const maximum = 120;
  return segmentId.length + suffix.length <= maximum
    ? `${segmentId}${suffix}`
    : `${segmentId.slice(0, maximum - suffix.length)}${suffix}`;
}

/** A closed 110 publication reason, recorded without turning an existing version into a failure. */
function activationRejection(
  versionId: string,
  atTick: number,
  code: string,
  message: string,
): ProfilePipelineActivationRecord {
  return Object.freeze({
    commandId: null,
    status: 'REJECTED' as const,
    duplicate: false,
    versionId,
    publishedAtTick: atTick,
    activateAtTick: null,
    code,
    message: bounded(message, PROFILE_PIPELINE_LIMITS.reasonCodeUnits),
  });
}

function activationCommand(
  command: ProfileActivationCommand,
  duplicate: boolean,
): ProfilePipelineActivationRecord {
  return Object.freeze({
    commandId: command.commandId,
    status: command.status === 'REJECTED' ? ('REJECTED' as const) : ('PENDING' as const),
    duplicate,
    versionId: command.versionId,
    publishedAtTick: command.publishedAtTick,
    activateAtTick: command.activateAtTick,
    code: null,
    message: null,
  });
}

function compositionOf(composition: LearningComposition): ProfilePipelineCompositionRecord {
  return Object.freeze({
    key: composition.key,
    baseVersionId: composition.baseVersionId,
    profileVersionId: composition.profileVersionId,
    baseValue: composition.baseValue,
    value: composition.value,
    appliedSegments: Object.freeze([...composition.appliedSegments]),
    appliedOrders: Object.freeze([...composition.appliedOrders]),
    recomposed: composition.recomposed,
  });
}

/**
 * Composes the pipeline over injected real services. The factory never mutates the store or the
 * fleet; it only resolves the accepted head and validates the service contracts.
 */
export function createProfilePipeline(services: ProfilePipelineServices): ProfilePipeline {
  const data = record(services);
  const allowed = new Set<string>(serviceFields);
  for (const key of Object.keys(data))
    requireContract(allowed.has(key), `Unknown profile pipeline service: ${key}`);

  const engineVersion = text(data.engineVersion);
  const playerId = text(data.playerId);
  const profileId = text(data.profileId);
  const sessionId = text(data.sessionId);
  const learningEpoch = readTick(data.learningEpoch);
  const worldEpoch = readTick(data.worldEpoch);
  requireContract(
    typeof data.queue === 'object' &&
      data.queue !== null &&
      typeof (data.queue as ProfilePipelineQueue).submit === 'function',
    'The profile pipeline requires the real 103 learning queue',
  );
  const queue = data.queue as ProfilePipelineQueue;
  requireContract(
    typeof data.store === 'object' &&
      data.store !== null &&
      typeof (data.store as ProfileStore).derive === 'function' &&
      typeof (data.store as ProfileStore).getVersion === 'function' &&
      typeof (data.store as ProfileStore).getHistory === 'function' &&
      typeof (data.store as ProfileStore).getInterventionVersion === 'function' &&
      typeof (data.store as ProfileStore).engineVersion === 'string',
    'The profile pipeline requires the real 109 profile store',
  );
  const store = data.store as ProfileStore;
  requireContract(store.engineVersion === engineVersion, 'Pipeline engine and store engine differ');
  requireContract(
    data.activation === undefined ||
      (typeof data.activation === 'object' &&
        data.activation !== null &&
        typeof (data.activation as ProfileActivation).publish === 'function' &&
        typeof (data.activation as ProfileActivation).applyAt === 'function'),
    'The profile pipeline activation must be a real 110 controller',
  );
  const activation = data.activation as ProfileActivation | undefined;
  requireContract(
    data.continuity === undefined ||
      (typeof data.continuity === 'object' &&
        data.continuity !== null &&
        typeof (data.continuity as ProfilePipelineContinuity).verify === 'function'),
    'The profile pipeline continuity guard must expose verify',
  );
  const continuity = data.continuity as ProfilePipelineContinuity | undefined;
  requireContract(
    data.delta === undefined || typeof data.delta === 'function',
    'The profile pipeline delta gate must be a validator',
  );
  const deltaValidator = (data.delta ?? validateCandidateDelta) as ProfileDeltaValidator;
  requireContract(
    data.segments === undefined ||
      (typeof data.segments === 'object' &&
        data.segments !== null &&
        typeof (data.segments as ProfileSegmentSource).read === 'function'),
    'The profile pipeline segment source must expose read',
  );
  const segments = data.segments as ProfileSegmentSource | undefined;
  requireContract(
    typeof data.tick === 'function',
    'The profile pipeline needs a fixed-tick readback',
  );
  const tick = data.tick as () => number;
  requireContract(
    data.advanceTick === undefined || typeof data.advanceTick === 'function',
    'The profile pipeline tick driver must be a function',
  );
  const advanceTick = data.advanceTick as (() => number) | undefined;

  const configuredHistory =
    data.history === undefined ? PROFILE_PIPELINE_LIMITS.history : data.history;
  requireContract(
    typeof configuredHistory === 'number' &&
      Number.isSafeInteger(configuredHistory) &&
      configuredHistory >= 1 &&
      configuredHistory <= PROFILE_PIPELINE_LIMITS.maxConfiguredHistory,
    'Invalid profile pipeline history limit',
  );
  const historyLimit = configuredHistory;

  const initialHead =
    data.baseVersionId === undefined
      ? (store.getHistory(profileId).at(-1)?.versionId ?? null)
      : text(data.baseVersionId);
  requireContract(initialHead !== null, 'The profile pipeline needs a base profile version');
  const initialVersion = store.getVersion(initialHead);
  requireContract(initialVersion !== null, `Unknown profile pipeline base version: ${initialHead}`);
  requireContract(
    initialVersion.profileId === profileId,
    'The base version belongs to another profile',
  );
  requireContract(
    initialVersion.engineVersion === engineVersion,
    'The base version targets another engine version',
  );

  let headVersionId = initialHead;
  let disposed = false;
  let dropped = 0;
  const retained: ProfilePipelineResult[] = [];
  const terminal = new Map<string, TerminalRecord>();
  const counters = {
    segments: 0,
    jobs: 0,
    versions: 0,
    noChange: 0,
    manualSkipped: 0,
    ineligibleSkipped: 0,
    failed: 0,
    stale: 0,
    recomposed: 0,
    deduplicated: 0,
    activationsPublished: 0,
    activationsApplied: 0,
    activationRejected: 0,
  };

  function currentTick(): number {
    return readTick(tick());
  }

  function remember(result: ProfilePipelineResult, request: ProfileDeltaRequest | null): void {
    if (terminal.size >= PROFILE_PIPELINE_LIMITS.ledger) {
      const oldest = terminal.keys().next();
      if (!oldest.done) terminal.delete(oldest.value);
    }
    terminal.set(result.segmentId, Object.freeze({ result, request }));
  }

  function push(result: ProfilePipelineResult): ProfilePipelineResult {
    retained.push(result);
    while (retained.length > historyLimit) {
      retained.shift();
      dropped += 1;
    }
    return result;
  }

  function baseResult(segment: SegmentRequest, atTick: number): ResultDraft {
    return {
      segmentId: segment.segmentId,
      mode: segment.mode,
      status: 'FAILED',
      reason: null,
      code: null,
      detail: null,
      order: segment.order,
      learningEpoch,
      baseVersionId: null,
      parentVersionId: null,
      versionId: null,
      jobSubmitted: false,
      deduplicated: false,
      tick: atTick,
      composition: null,
      activation: null,
    };
  }

  function finish(draft: ResultDraft): ProfilePipelineResult {
    return Object.freeze({ version: PROFILE_PIPELINE_VERSION, ...draft });
  }

  function skip(
    segment: SegmentRequest,
    atTick: number,
    status: ProfilePipelineStatus,
    reason: ProfilePipelineReason,
    detail: string,
  ): ProfilePipelineResult {
    return push(finish({ ...baseResult(segment, atTick), status, reason, detail }));
  }

  function failure(
    segment: SegmentRequest,
    atTick: number,
    reason: ProfilePipelineReason,
    code: string | null,
    detail: string,
    extra: {
      readonly baseVersionId?: string | null;
      readonly jobSubmitted?: boolean;
      readonly composition?: ProfilePipelineCompositionRecord | null;
    } = {},
  ): ProfilePipelineResult {
    return push(
      finish({
        ...baseResult(segment, atTick),
        status: 'FAILED',
        reason,
        code,
        detail: bounded(detail, PROFILE_PIPELINE_LIMITS.reasonCodeUnits),
        baseVersionId: extra.baseVersionId ?? null,
        jobSubmitted: extra.jobSubmitted ?? false,
        composition: extra.composition ?? null,
      }),
    );
  }

  /** Optional 110 publication of one already-stored version at the next common tick. */
  function publishVersion(
    version: ProfileVersion,
    segment: SegmentRequest,
  ): ProfilePipelineActivationRecord | null {
    if (activation === undefined) return null;
    const atTick = currentTick();
    if (activation.profileId !== profileId) {
      counters.activationRejected += 1;
      return activationRejection(
        version.versionId,
        atTick,
        'PROFILE_MISMATCH',
        `The activation belongs to ${activation.profileId}, not ${profileId}`,
      );
    }
    const pending = activation.pending();
    if (pending !== null) {
      counters.activationRejected += 1;
      return activationRejection(
        version.versionId,
        atTick,
        'ACTIVATION_PENDING',
        `Activation ${pending.commandId} is still scheduled for tick ${pending.activateAtTick}`,
      );
    }
    const reason = bounded(
      segment.reason ?? `segment ${segment.segmentId} accepted`,
      PROFILE_PIPELINE_LIMITS.reasonCodeUnits,
    );
    const publication = activation.publish({
      profileId,
      versionId: version.versionId,
      engineVersion,
      publishedAtTick: atTick,
      activateAtTick: atTick + 1,
      reason,
      origin: 'LEARNED',
      idempotencyKey: version.versionId,
    });
    if (publication.status === 'ACCEPTED' && publication.command !== null) {
      counters.activationsPublished += 1;
      return activationCommand(publication.command, publication.duplicate);
    }
    counters.activationRejected += 1;
    return activationRejection(
      version.versionId,
      atTick,
      publication.rejection?.code ?? 'INVALID_VERSION',
      publication.rejection?.message ?? 'The profile activation rejected the publication',
    );
  }

  function advance(): ProfilePipelineActivationStep | null {
    if (activation === undefined) return null;
    const atTick = currentTick();
    const report = activation.applyAt(atTick);
    if (report.status === 'APPLIED') counters.activationsApplied += 1;
    let observed: ProfilePipelineContinuityResult | null = null;
    if (
      continuity !== undefined &&
      report.status === 'APPLIED' &&
      report.versionId !== null &&
      report.appliedTick !== null &&
      report.activationTick !== null
    ) {
      observed = continuity.verify({
        profileId,
        versionId: report.versionId,
        tick: atTick,
        activateAtTick: report.activationTick,
        appliedAtTick: report.appliedTick,
      });
    }
    return Object.freeze({
      version: PROFILE_PIPELINE_VERSION,
      status: report.status,
      tick: atTick,
      versionId: report.versionId,
      activationTick: report.activationTick,
      appliedTick: report.appliedTick,
      updated: report.updated.length,
      continuity: observed,
    });
  }

  /**
   * Replays the accepted derive so the 109 store answers with its own existing version. Returns
   * null when the store no longer knows the intervention, which means an explicit fresh attempt.
   */
  function deduplicate(
    known: TerminalRecord,
    segment: SegmentRequest,
    atTick: number,
  ): ProfilePipelineResult | null {
    const prior = known.result;
    if (known.request === null) {
      return push(
        finish({
          ...baseResult(segment, atTick),
          status: prior.status,
          reason: 'DUPLICATE_SEGMENT',
          detail: 'This segment already produced its closed result',
          baseVersionId: prior.baseVersionId,
          parentVersionId: prior.parentVersionId,
          versionId: prior.versionId,
          deduplicated: true,
          composition: prior.composition,
        }),
      );
    }
    const replayed = store.derive(known.request);
    if (replayed.status === 'ACCEPTED') {
      counters.deduplicated += 1;
      return push(
        finish({
          ...baseResult(segment, atTick),
          status: 'DEDUPLICATED',
          reason: 'DUPLICATE_SEGMENT',
          code: replayed.deduplicated ? '109_DEDUPLICATED' : null,
          detail: `Segment ${segment.segmentId} already produced version ${replayed.versionId}`,
          baseVersionId: known.request.parentVersionId,
          parentVersionId: known.request.parentVersionId,
          versionId: replayed.versionId,
          deduplicated: true,
          composition: prior.composition,
        }),
      );
    }
    const existing = store.getInterventionVersion(profileId, segment.segmentId);
    if (existing !== null) {
      counters.deduplicated += 1;
      return push(
        finish({
          ...baseResult(segment, atTick),
          status: 'DEDUPLICATED',
          reason: 'DUPLICATE_SEGMENT',
          detail: `Segment ${segment.segmentId} already produced version ${existing}`,
          parentVersionId: prior.parentVersionId,
          versionId: existing,
          deduplicated: true,
          composition: prior.composition,
        }),
      );
    }
    terminal.delete(segment.segmentId);
    return null;
  }

  async function submitJob(
    segment: SegmentRequest,
    atTick: number,
    jobBase: string,
  ): Promise<ProfilePipelineResult> {
    const job: LearningJob = Object.freeze({
      playerId,
      profileId,
      learningEpoch,
      baseVersionId: jobBase,
      segmentId: segment.segmentId,
      mode: segment.mode,
      eligible: true,
      order: segment.order,
      sessionId,
      worldEpoch,
      key: segment.key,
      baseValue: segment.baseValue,
      evidence: segment.evidence,
      episodes: segment.episodes,
      candidate: segment.candidate,
    });
    counters.jobs += 1;
    let admission: LearningAdmission;
    try {
      admission = queue.submit(job);
    } catch (error: unknown) {
      counters.failed += 1;
      return failure(
        segment,
        atTick,
        'LEARNING_JOB_REJECTED',
        'QUEUE_SUBMIT_FAILED',
        error instanceof Error ? error.message : 'The 103 queue refused the submission',
        { baseVersionId: jobBase, jobSubmitted: true },
      );
    }
    if (admission.status !== 'QUEUED' || admission.ticket === null) {
      counters.failed += 1;
      return failure(
        segment,
        atTick,
        'LEARNING_JOB_REJECTED',
        admission.reason,
        admission.detail ?? `The 103 queue answered ${admission.status}`,
        { baseVersionId: jobBase, jobSubmitted: true },
      );
    }
    const outcome = await admission.ticket.outcome;
    if (outcome.status !== 'composed' || outcome.composition === null) {
      counters.failed += 1;
      return failure(
        segment,
        atTick,
        'LEARNING_JOB_FAILED',
        outcome.reason,
        outcome.detail ?? `The 103 job ended as ${outcome.status}`,
        { baseVersionId: jobBase, jobSubmitted: true },
      );
    }
    return commitComposition(segment, atTick, jobBase, outcome.composition);
  }

  function commitComposition(
    segment: SegmentRequest,
    atTick: number,
    jobBase: string,
    composition: LearningComposition,
  ): ProfilePipelineResult {
    const compositionRecord = compositionOf(composition);
    if (composition.learningEpoch !== learningEpoch || composition.baseVersionId !== jobBase) {
      counters.stale += 1;
      return push(
        finish({
          ...baseResult(segment, atTick),
          status: 'STALE_JOB',
          reason: composition.learningEpoch !== learningEpoch ? 'EPOCH_MISMATCH' : 'BASE_MISMATCH',
          detail: 'The composition belongs to another generation',
          baseVersionId: jobBase,
          jobSubmitted: true,
          composition: compositionRecord,
        }),
      );
    }
    const parent = store.getVersion(headVersionId);
    if (parent === null || parent.profileId !== profileId) {
      counters.failed += 1;
      return failure(
        segment,
        atTick,
        'STORE_REJECTED',
        'PARENT_NOT_FOUND',
        `Accepted head ${headVersionId} is not in the profile store`,
        { baseVersionId: jobBase, jobSubmitted: true, composition: compositionRecord },
      );
    }
    const chain = store.getHistory(profileId, parent.versionId);
    const baseIndex = chain.findIndex((version) => version.versionId === jobBase);
    if (baseIndex < 0) {
      counters.stale += 1;
      return push(
        finish({
          ...baseResult(segment, atTick),
          status: 'STALE_JOB',
          reason: 'BASE_MISMATCH',
          detail: `The job base ${jobBase} is not an ancestor of ${parent.versionId}`,
          baseVersionId: jobBase,
          jobSubmitted: true,
          composition: compositionRecord,
        }),
      );
    }
    const intervening = chain
      .slice(baseIndex + 1)
      .map((version) => version.provenance.delta?.segmentId ?? null)
      .filter((id): id is string => id !== null && id !== segment.segmentId);
    const applied = new Set(composition.appliedSegments);
    const uncovered = intervening.filter((id) => !applied.has(id));
    if (uncovered.length > 0) {
      counters.stale += 1;
      return push(
        finish({
          ...baseResult(segment, atTick),
          status: 'STALE_JOB',
          reason: 'BASE_SUPERSEDED',
          detail: `The composition does not cover ${uncovered.join(', ')}`,
          baseVersionId: jobBase,
          jobSubmitted: true,
          composition: compositionRecord,
        }),
      );
    }
    if (composition.validation.status !== 'ACCEPTED') {
      counters.failed += 1;
      return failure(
        segment,
        atTick,
        'COMPOSITION_REJECTED',
        'COMPOSITION_REJECTED',
        'The 103 composition is not an accepted 102 delta',
        { baseVersionId: jobBase, jobSubmitted: true, composition: compositionRecord },
      );
    }
    const values = composition.validation.delta.values
      .filter((row) => parent.parameters[row.key] !== row.value)
      .map((row) => ({ key: row.key, unit: row.unit, value: row.value }));
    if (values.length === 0) {
      counters.noChange += 1;
      const result = push(
        finish({
          ...baseResult(segment, atTick),
          status: 'NO_CHANGE',
          reason: 'NO_CHANGE',
          detail: `The composition keeps ${composition.key} at ${composition.value}`,
          baseVersionId: jobBase,
          jobSubmitted: true,
          composition: compositionRecord,
        }),
      );
      remember(result, null);
      return result;
    }
    const versionId = versionIdFor(segment.segmentId);
    const delta = {
      profileVersionId: versionId,
      parentVersionId: parent.versionId,
      engineVersion,
      schemaVersion: 1,
      units: 'SI',
      values,
    };
    const validated = deltaValidator(delta, { baseVersionId: parent.versionId, engineVersion });
    if (validated.status !== 'ACCEPTED') {
      counters.failed += 1;
      const code = validated.rejections[0]?.code ?? 'DELTA_EMPTY';
      return failure(
        segment,
        atTick,
        'DELTA_REJECTED',
        code,
        `The 102 delta gate rejected the recomposed values: ${code}`,
        { baseVersionId: jobBase, jobSubmitted: true, composition: compositionRecord },
      );
    }
    const reason = bounded(
      segment.reason ?? `segment ${segment.segmentId} accepted`,
      PROFILE_PIPELINE_LIMITS.reasonCodeUnits,
    );
    const request: ProfileDeltaRequest = Object.freeze({
      profileId,
      versionId,
      parentVersionId: parent.versionId,
      segmentId: segment.segmentId,
      interventionId: segment.interventionId,
      reason,
      delta,
    });
    const derived = store.derive(request);
    if (derived.status === 'REJECTED') {
      counters.failed += 1;
      return failure(
        segment,
        atTick,
        'STORE_REJECTED',
        derived.rejection.code,
        derived.rejection.message,
        { baseVersionId: jobBase, jobSubmitted: true, composition: compositionRecord },
      );
    }
    headVersionId = derived.versionId;
    if (derived.created) counters.versions += 1;
    if (derived.deduplicated) counters.deduplicated += 1;
    const recomposed =
      composition.recomposed ||
      composition.appliedSegments.length > 1 ||
      jobBase !== parent.versionId;
    if (recomposed) counters.recomposed += 1;
    const activationRecord = derived.created
      ? publishVersion(derived.profileVersion, segment)
      : null;
    const result = push(
      finish({
        ...baseResult(segment, atTick),
        status: derived.deduplicated ? 'DEDUPLICATED' : recomposed ? 'RECOMPOSED' : 'COMPOSED',
        reason: derived.deduplicated ? 'DUPLICATE_SEGMENT' : null,
        detail: derived.deduplicated
          ? `Segment ${segment.segmentId} already produced version ${derived.versionId}`
          : null,
        baseVersionId: jobBase,
        parentVersionId: parent.versionId,
        versionId: derived.versionId,
        jobSubmitted: true,
        deduplicated: derived.deduplicated,
        composition: compositionRecord,
        activation: activationRecord,
      }),
    );
    remember(result, request);
    return result;
  }

  function identityOf(value: unknown): { segmentId: string; mode: string } {
    const raw = record(value);
    return {
      segmentId:
        typeof raw.segmentId === 'string' && raw.segmentId.length > 0 ? raw.segmentId : 'unknown',
      mode: typeof raw.mode === 'string' ? raw.mode : 'LEARNING',
    };
  }

  function bareFailure(
    value: unknown,
    atTick: number,
    reason: ProfilePipelineReason,
    detail: string,
  ): ProfilePipelineResult {
    const identity = identityOf(value);
    return push(
      finish({
        segmentId: identity.segmentId,
        mode: identity.mode,
        status: 'FAILED',
        reason,
        code: null,
        detail,
        order: 0,
        learningEpoch,
        baseVersionId: null,
        parentVersionId: null,
        versionId: null,
        jobSubmitted: false,
        deduplicated: false,
        tick: atTick,
        composition: null,
        activation: null,
      }),
    );
  }

  function resolveSegment(value: unknown): SegmentRequest | null {
    if (segments === undefined) return segmentOf(value);
    const raw = record(value);
    if (Object.keys(raw).length === 1 && typeof raw.segmentId === 'string') {
      const stored = segments.read(raw.segmentId);
      return stored === null ? null : segmentOf(stored);
    }
    return segmentOf(value);
  }

  async function onSegmentClosed(value: unknown): Promise<ProfilePipelineResult> {
    const atTick = currentTick();
    if (disposed) {
      counters.segments += 1;
      counters.failed += 1;
      return bareFailure(value, atTick, 'PIPELINE_DISPOSED', 'The profile pipeline was disposed');
    }
    const resolved = resolveSegment(value);
    if (resolved === null) {
      counters.segments += 1;
      counters.failed += 1;
      return bareFailure(
        value,
        atTick,
        'SEGMENT_NOT_FOUND',
        'The segment source has no record for this identity',
      );
    }
    const segment = resolved;
    counters.segments += 1;
    const known = terminal.get(segment.segmentId);
    if (known !== undefined) {
      const deduplicated = deduplicate(known, segment, atTick);
      if (deduplicated !== null) return deduplicated;
    }
    if (segment.mode !== 'LEARNING') {
      counters.manualSkipped += 1;
      return skip(
        segment,
        atTick,
        'SKIPPED_MANUAL',
        segment.mode === 'MANUAL' ? 'MANUAL_SEGMENT_NOT_LEARNABLE' : 'AUTO_SEGMENT_NOT_LEARNABLE',
        segment.mode === 'MANUAL'
          ? 'MANUAL observations never update the profile'
          : 'AUTO observations are not a learning source',
      );
    }
    if (!segment.eligible) {
      counters.ineligibleSkipped += 1;
      return skip(
        segment,
        atTick,
        'SKIPPED_INELIGIBLE',
        'SEGMENT_INELIGIBLE',
        'The segment windows are not eligible for learning',
      );
    }
    if (segment.learningEpoch !== null && segment.learningEpoch !== learningEpoch) {
      counters.stale += 1;
      return push(
        finish({
          ...baseResult(segment, atTick),
          status: 'STALE_JOB',
          reason: 'EPOCH_MISMATCH',
          detail: `Segment epoch ${segment.learningEpoch} is not the pipeline epoch ${learningEpoch}`,
        }),
      );
    }
    const head = store.getVersion(headVersionId);
    if (head === null || head.profileId !== profileId) {
      counters.failed += 1;
      return failure(
        segment,
        atTick,
        'STORE_REJECTED',
        'PARENT_NOT_FOUND',
        `Accepted head ${headVersionId} is not in the profile store`,
      );
    }
    let jobBase = head.versionId;
    if (segment.baseVersionId !== null) {
      const chain = store.getHistory(profileId, head.versionId);
      if (!chain.some((version) => version.versionId === segment.baseVersionId)) {
        counters.stale += 1;
        return push(
          finish({
            ...baseResult(segment, atTick),
            status: 'STALE_JOB',
            reason: 'BASE_MISMATCH',
            detail: `Segment base ${segment.baseVersionId} is not an ancestor of ${head.versionId}`,
          }),
        );
      }
      jobBase = segment.baseVersionId;
    }
    advance();
    return submitJob(segment, atTick, jobBase);
  }

  async function processInterventions(
    input: readonly unknown[],
  ): Promise<readonly ProfilePipelineResult[]> {
    requireContract(Array.isArray(input), 'processInterventions expects an ordered segment list');
    const results: ProfilePipelineResult[] = [];
    for (const [index, segment] of input.entries()) {
      if (index > 0 && advanceTick !== undefined) {
        const before = currentTick();
        const after = readTick(advanceTick());
        requireContract(after > before, 'The profile pipeline tick driver must advance the tick');
      }
      results.push(await onSegmentClosed(segment));
    }
    return Object.freeze(results);
  }

  return Object.freeze({
    version: PROFILE_PIPELINE_VERSION,
    profileId,
    learningEpoch,
    engineVersion,
    head: (): string => headVersionId,
    onSegmentClosed,
    processInterventions,
    advance,
    history: (): readonly ProfilePipelineResult[] => Object.freeze(retained.slice()),
    stats: (): ProfilePipelineStats =>
      Object.freeze({
        version: PROFILE_PIPELINE_VERSION,
        disposed,
        segments: counters.segments,
        jobs: counters.jobs,
        versions: counters.versions,
        noChange: counters.noChange,
        manualSkipped: counters.manualSkipped,
        ineligibleSkipped: counters.ineligibleSkipped,
        failed: counters.failed,
        stale: counters.stale,
        recomposed: counters.recomposed,
        deduplicated: counters.deduplicated,
        activationsPublished: counters.activationsPublished,
        activationsApplied: counters.activationsApplied,
        activationRejected: counters.activationRejected,
        history: retained.length,
        dropped,
        headVersionId,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      retained.length = 0;
      terminal.clear();
    },
  });
}
