import { governorLimits } from '../workers';
import type { Admission, JobOutcome, Packet, WorkerResourceGovernor } from '../workers';
import { getParameterDefinition } from '../profiles';
import type { ParameterKey } from '../profiles';
import { CANDIDATE_LEARNING_KEYS, validateCandidateDelta } from './candidate-validation';
import type { CandidateValidationAccepted } from './candidate-validation';
import type { ConfidenceCandidate } from './evidence-confidence';
import {
  decodeLearningEstimateResult,
  encodeLearningEstimateRequest,
  learningEstimateLimits,
  LEARNING_ESTIMATE_VERSION,
} from './estimator-task';
import type { LearningEstimateRequest, LearningEstimateResult } from './estimator-task';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import type { ProfileBlendEpisode } from './profile-blend';

export const LEARNING_ESTIMATOR_QUEUE_VERSION = '103-learning-estimator-queue-v1' as const;

export const learningSegmentModes = ['LEARNING', 'MANUAL', 'AUTO'] as const;
export type LearningSegmentMode = (typeof learningSegmentModes)[number];

/**
 * Closed admission/outcome vocabulary. Manually tuned and automatic segments are rejected with
 * their own code instead of being silently dropped, and every runtime failure maps to one code.
 */
export const learningJobRejectionCodes = [
  'JOB_INVALID',
  'IDENTITY_INVALID',
  'MODE_INVALID',
  'MANUAL_SEGMENT_NOT_LEARNABLE',
  'AUTO_SEGMENT_NOT_LEARNABLE',
  'SEGMENT_INELIGIBLE',
  'EPOCH_INVALID',
  'ORDER_INVALID',
  'PARAMETER_UNKNOWN',
  'PARAMETER_NOT_LEARNING_TARGET',
  'BASE_VALUE_INVALID',
  'EVIDENCE_INVALID',
  'EPISODES_INVALID',
  'CANDIDATE_INVALID',
  'REQUEST_INVALID',
  'PAYLOAD_TOO_LARGE',
  'QUEUE_FULL',
  'QUEUE_BYTES',
  'SEGMENT_DUPLICATE',
  'ORDER_CONFLICT',
  'PROFILE_OWNER_MISMATCH',
  'BASE_VALUE_MISMATCH',
  'GOVERNOR_REFUSED',
  'JOB_EXPIRED',
  'RESULT_INVALID',
  'RESULT_IDENTITY_MISMATCH',
  'COMPOSITION_REJECTED',
  'GENERATION_INVALIDATED',
  'QUEUE_DISPOSED',
] as const;
export type LearningJobRejectionCode = (typeof learningJobRejectionCodes)[number];

const learningStage = new Set<string>(CANDIDATE_LEARNING_KEYS);
const evidenceStatuses = new Set(['NO_EVIDENCE', 'INSUFFICIENT', 'READY', 'EXCLUDED']);

export interface LearningJob {
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly mode: LearningSegmentMode;
  /** 069/087 eligibility: only a segment whose windows are eligible may be learned from. */
  readonly eligible: boolean;
  /** Intervention/segment order inside the learning epoch; the serial queue sorts by it. */
  readonly order: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly key: ParameterKey;
  /** Value of `key` at the epoch base version, used for serial recomposition. */
  readonly baseValue: number;
  readonly evidence: ParameterEvidenceReadModel;
  readonly episodes: readonly ProfileBlendEpisode[];
  readonly candidate: ConfidenceCandidate;
}

export type LearningJobParse =
  | { readonly status: 'VALID'; readonly job: LearningJob }
  | {
      readonly status: 'REJECTED';
      readonly reason: LearningJobRejectionCode;
      readonly detail: string;
    };

function rejected(reason: LearningJobRejectionCode, detail: string): LearningJobParse {
  return { status: 'REJECTED', reason, detail };
}

function requiredText(
  value: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; detail: string } {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128)
    return { ok: false, detail: `${field} must be a non-empty string of at most 128 characters` };
  return { ok: true, value };
}

function requiredInteger(
  value: unknown,
  field: string,
): { ok: true; value: number } | { ok: false; detail: string } {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    return { ok: false, detail: `${field} must be a non-negative integer` };
  return { ok: true, value: value as number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates one learning job before it can touch the queue or the 221 governor.
 *
 * A job is admissible only when it carries the full identity, declares `mode: 'LEARNING'`, is
 * marked eligible and targets one of the 24 initial learning parameters. MANUAL and AUTO are
 * rejected with distinct closed reasons; they never become a no-op learning attempt.
 */
export function parseLearningJob(value: unknown): LearningJobParse {
  if (!isRecord(value)) return rejected('JOB_INVALID', 'The job must be a plain object');

  const playerId = requiredText(value.playerId, 'playerId');
  if (!playerId.ok) return rejected('IDENTITY_INVALID', playerId.detail);
  const profileId = requiredText(value.profileId, 'profileId');
  if (!profileId.ok) return rejected('IDENTITY_INVALID', profileId.detail);
  const baseVersionId = requiredText(value.baseVersionId, 'baseVersionId');
  if (!baseVersionId.ok) return rejected('IDENTITY_INVALID', baseVersionId.detail);
  const segmentId = requiredText(value.segmentId, 'segmentId');
  if (!segmentId.ok) return rejected('IDENTITY_INVALID', segmentId.detail);
  const sessionId = requiredText(value.sessionId, 'sessionId');
  if (!sessionId.ok) return rejected('IDENTITY_INVALID', sessionId.detail);

  const learningEpoch = requiredInteger(value.learningEpoch, 'learningEpoch');
  if (!learningEpoch.ok) return rejected('EPOCH_INVALID', learningEpoch.detail);
  const worldEpoch = requiredInteger(value.worldEpoch, 'worldEpoch');
  if (!worldEpoch.ok) return rejected('EPOCH_INVALID', worldEpoch.detail);
  const order = requiredInteger(value.order, 'order');
  if (!order.ok) return rejected('ORDER_INVALID', order.detail);

  if (
    typeof value.mode !== 'string' ||
    !learningSegmentModes.includes(value.mode as LearningSegmentMode)
  )
    return rejected('MODE_INVALID', 'mode must be LEARNING, MANUAL or AUTO');
  const mode = value.mode as LearningSegmentMode;
  if (mode === 'MANUAL')
    return rejected('MANUAL_SEGMENT_NOT_LEARNABLE', 'MANUAL observations never update the profile');
  if (mode === 'AUTO')
    return rejected('AUTO_SEGMENT_NOT_LEARNABLE', 'AUTO observations are not a learning source');

  if (typeof value.eligible !== 'boolean')
    return rejected('SEGMENT_INELIGIBLE', 'eligible must be an explicit boolean');
  if (!value.eligible)
    return rejected('SEGMENT_INELIGIBLE', 'The segment windows are not eligible for learning');

  const key = requiredText(value.key, 'key');
  if (!key.ok) return rejected('PARAMETER_UNKNOWN', key.detail);
  let definition;
  try {
    definition = getParameterDefinition(key.value);
  } catch {
    return rejected('PARAMETER_UNKNOWN', `Unknown parameter: ${key.value}`);
  }
  if (!learningStage.has(definition.key))
    return rejected(
      'PARAMETER_NOT_LEARNING_TARGET',
      `${definition.key} is not an initial learning target`,
    );

  if (typeof value.baseValue !== 'number' || !Number.isFinite(value.baseValue))
    return rejected('BASE_VALUE_INVALID', 'baseValue must be a finite number');

  if (!isRecord(value.evidence))
    return rejected('EVIDENCE_INVALID', 'evidence must be a 093 read model');
  if (value.evidence.key !== definition.key)
    return rejected('EVIDENCE_INVALID', 'evidence.key must match the job key');
  if (!evidenceStatuses.has(value.evidence.status as string))
    return rejected('EVIDENCE_INVALID', 'evidence.status must be a known 093 status');
  if (
    !Number.isSafeInteger(value.evidence.distinctEpisodes) ||
    (value.evidence.distinctEpisodes as number) < 0
  )
    return rejected('EVIDENCE_INVALID', 'evidence.distinctEpisodes must be a non-negative integer');

  if (!Array.isArray(value.episodes))
    return rejected('EPISODES_INVALID', 'episodes must be an array');
  if (value.episodes.length > learningEstimateLimits.maxEpisodes)
    return rejected('EPISODES_INVALID', 'episodes exceed the estimator bound');

  if (!isRecord(value.candidate))
    return rejected('CANDIDATE_INVALID', 'candidate must be an estimator candidate');
  if (value.candidate.key !== definition.key)
    return rejected('CANDIDATE_INVALID', 'candidate.key must match the job key');
  if (typeof value.candidate.status !== 'string')
    return rejected('CANDIDATE_INVALID', 'candidate.status must be a string');
  if (
    value.candidate.value !== null &&
    (typeof value.candidate.value !== 'number' || !Number.isFinite(value.candidate.value))
  )
    return rejected('CANDIDATE_INVALID', 'candidate.value must be null or a finite number');

  return {
    status: 'VALID',
    job: Object.freeze({
      playerId: playerId.value,
      profileId: profileId.value,
      learningEpoch: learningEpoch.value,
      baseVersionId: baseVersionId.value,
      segmentId: segmentId.value,
      mode,
      eligible: true,
      order: order.value,
      sessionId: sessionId.value,
      worldEpoch: worldEpoch.value,
      key: definition.key as ParameterKey,
      baseValue: value.baseValue,
      evidence: value.evidence as unknown as ParameterEvidenceReadModel,
      episodes: value.episodes as unknown as readonly ProfileBlendEpisode[],
      candidate: value.candidate as unknown as ConfidenceCandidate,
    }),
  };
}

export type LearningQueueState =
  | 'QUEUED'
  | 'DISPATCHING'
  | 'RUNNING'
  | 'COMPOSED'
  | 'CANCELLED'
  | 'ERROR'
  | 'INVALIDATED'
  | 'REJECTED';

export interface LearningQueueMeasurement {
  readonly segmentId: string;
  readonly order: number;
  readonly learningEpoch: number;
  readonly status: LearningQueueState;
  /** Time spent inside this serial queue before the 221 governor accepted the attempt. */
  readonly queueMs: number;
  /** Time from governor dispatch to the terminal outcome. */
  readonly serviceMs: number;
  /** Submit-to-outcome latency: queue + governor admission + governor queue + service. */
  readonly endToEndMs: number;
  /** 221 governor queue time for the same transport ticket, when it is observable. */
  readonly governorQueueMs: number | null;
  readonly governorServiceMs: number | null;
  readonly recomposed: boolean;
  /** Encoded estimator request owned by this queue while the job is pending/running. */
  readonly payloadBytes: number;
}

export interface LearningComposition {
  readonly version: '103-learning-composition-v1';
  readonly key: ParameterKey;
  readonly baseVersionId: string;
  readonly profileVersionId: string;
  readonly learningEpoch: number;
  readonly baseValue: number;
  readonly value: number;
  readonly appliedSegments: readonly string[];
  readonly appliedOrders: readonly number[];
  /** True when the composition folded more than one proposal, including a stale arrival. */
  readonly recomposed: boolean;
  readonly validation: CandidateValidationAccepted;
  readonly published: false;
  readonly learned: false;
}

export interface LearningJobOutcome {
  readonly status: 'composed' | 'cancelled' | 'error' | 'invalidated' | 'rejected';
  readonly reason: LearningJobRejectionCode | null;
  readonly detail: string | null;
  readonly composition: LearningComposition | null;
  readonly measurement: LearningQueueMeasurement;
}

export interface LearningJobTicket {
  readonly segmentId: string;
  readonly generationKey: string;
  readonly state: LearningQueueState;
  readonly outcome: Promise<LearningJobOutcome>;
}

export interface LearningAdmission {
  readonly status: 'QUEUED' | 'REJECTED' | 'BACKPRESSURE';
  readonly reason: LearningJobRejectionCode | null;
  readonly detail: string | null;
  readonly ticket: LearningJobTicket | null;
}

export interface LearningEstimatorQueueOptions {
  readonly governor: WorkerResourceGovernor;
  /** Application/build engine version used by the 102 delta compatibility gate. */
  readonly engineVersion: string;
  readonly now?: () => number;
  readonly maxPending?: number;
  readonly maxBytes?: number;
  readonly maxProposals?: number;
  readonly history?: number;
}

interface LearningProposal {
  readonly segmentId: string;
  readonly order: number;
  readonly key: ParameterKey;
  readonly baseValue: number;
  readonly estimate: number | null;
  readonly learningWeight: number;
  readonly resolution: string;
}

interface LearningGeneration {
  readonly key: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly baseValues: Map<ParameterKey, number>;
  readonly proposals: Map<string, LearningProposal>;
  readonly orders: Map<number, string>;
  values: Map<ParameterKey, number>;
  headVersionId: string;
  recompositions: number;
}

interface Entry {
  readonly job: LearningJob;
  readonly packet: Packet;
  readonly bytes: number;
  readonly sequence: number;
  readonly generationKey: string;
  readonly admittedAt: number;
  readonly ticket: LearningJobTicket;
  readonly resolve: (outcome: LearningJobOutcome) => void;
  state: LearningQueueState;
  dispatchAt: number | null;
  cancelRequested: boolean;
  invalidated: boolean;
  ticketKey: string | null;
  settled: boolean;
}

const generationKeyOf = (job: {
  playerId: string;
  profileId: string;
  learningEpoch: number;
  baseVersionId: string;
}): string => JSON.stringify([job.playerId, job.profileId, job.learningEpoch, job.baseVersionId]);

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Serial recomposition of one key: the same instance that produced the estimate/weight folds the
 * proposals in intervention order. It never runs two compositions concurrently.
 */
function foldProposals(baseValue: number, proposals: readonly LearningProposal[]): number {
  let value = baseValue;
  for (const proposal of proposals) {
    if (proposal.estimate === null || proposal.learningWeight === 0) continue;
    value = round(value + proposal.learningWeight * (proposal.estimate - value));
  }
  return value;
}

/**
 * Serial learning estimator queue.
 *
 * One job runs at a time through the shared 221 `WorkerResourceGovernor` with operation
 * `learning`. Dispatch is coalesced into one microtask so jobs submitted in the same turn are
 * sorted by intervention order, not arrival. A late proposal from the same generation is not
 * dropped: the whole epoch ledger is recomposed in intervention order. A different
 * `playerId/profileId/learningEpoch/baseVersionId` is a new generation, so the old jobs and results
 * are invalidated and its late outcomes cannot overwrite the new profile.
 */
export class LearningEstimatorQueue {
  private governor: WorkerResourceGovernor;
  private engineVersion: string;
  private now: () => number;
  private maxPending: number;
  private maxBytes: number;
  private maxProposals: number;
  private historyLimit: number;
  private pending: Entry[] = [];
  private active: Entry | null = null;
  private generation: LearningGeneration | null = null;
  private profileOwners = new Map<string, string>();
  private samples: LearningQueueMeasurement[] = [];
  private idleWaiters: (() => void)[] = [];
  private sequence = 0;
  private jobSequence = 0;
  private pumpScheduled = false;
  private disposed = false;

  constructor(options: LearningEstimatorQueueOptions) {
    if (!options.engineVersion) throw new Error('Learning queue requires an engine version');
    this.governor = options.governor;
    this.engineVersion = options.engineVersion;
    this.now = options.now ?? (() => performance.now());
    this.maxPending = Math.max(1, options.maxPending ?? governorLimits.jobs);
    this.maxBytes = Math.max(1, options.maxBytes ?? governorLimits.payloadBytes);
    this.maxProposals = Math.max(1, options.maxProposals ?? 256);
    this.historyLimit = Math.max(1, options.history ?? governorLimits.history);
  }

  get measurements(): readonly LearningQueueMeasurement[] {
    return this.samples.slice();
  }

  get usage() {
    const generation = this.generation;
    return Object.freeze({
      version: LEARNING_ESTIMATOR_QUEUE_VERSION,
      pending: this.pending.length,
      active: this.active ? 1 : 0,
      bytes:
        this.pending.reduce((total, entry) => total + entry.bytes, 0) + (this.active?.bytes ?? 0),
      maxPending: this.maxPending,
      maxBytes: this.maxBytes,
      history: this.samples.length,
      generation:
        generation === null
          ? null
          : Object.freeze({
              playerId: generation.playerId,
              profileId: generation.profileId,
              learningEpoch: generation.learningEpoch,
              baseVersionId: generation.baseVersionId,
              headVersionId: generation.headVersionId,
              proposals: generation.proposals.size,
              recompositions: generation.recompositions,
            }),
      governor: this.governor.usage,
    });
  }

  /**
   * Synchronous admission; the returned ticket resolves asynchronously. Dispatch is coalesced so
   * two interventions submitted in the same turn are ordered by `order`, not by arrival.
   */
  submit(value: unknown): LearningAdmission {
    if (this.disposed)
      return {
        status: 'REJECTED',
        reason: 'QUEUE_DISPOSED',
        detail: 'The learning queue was disposed',
        ticket: null,
      };
    const parsed = parseLearningJob(value);
    if (parsed.status === 'REJECTED')
      return {
        status: 'REJECTED',
        reason: parsed.reason,
        detail: parsed.detail,
        ticket: null,
      };
    const job = parsed.job;
    let request: LearningEstimateRequest;
    let buffer: ArrayBuffer;
    try {
      request = {
        version: LEARNING_ESTIMATE_VERSION,
        key: job.key,
        baseVersionId: job.baseVersionId,
        segmentId: job.segmentId,
        learningEpoch: job.learningEpoch,
        baseValue: job.baseValue,
        evidence: job.evidence,
        episodes: job.episodes,
        candidate: job.candidate,
      };
      buffer = encodeLearningEstimateRequest(request);
    } catch (error) {
      return {
        status: 'REJECTED',
        reason: 'REQUEST_INVALID',
        detail: error instanceof Error ? error.message : 'The estimator request is invalid',
        ticket: null,
      };
    }
    if (buffer.byteLength > governorLimits.payloadBytes)
      return {
        status: 'REJECTED',
        reason: 'PAYLOAD_TOO_LARGE',
        detail: `The estimator payload exceeds ${governorLimits.payloadBytes} bytes`,
        ticket: null,
      };

    // A new generation invalidates the previous jobs and results before this job is queued.
    if (this.generation === null || this.generation.key !== generationKeyOf(job)) {
      const owner = this.profileOwners.get(job.profileId);
      if (owner !== undefined && owner !== job.playerId)
        return {
          status: 'REJECTED',
          reason: 'PROFILE_OWNER_MISMATCH',
          detail: 'This profile already belongs to another player',
          ticket: null,
        };
      this.invalidateGeneration('GENERATION_INVALIDATED', 'A new learningEpoch started');
      this.profileOwners.set(job.profileId, job.playerId);
      this.generation = {
        key: generationKeyOf(job),
        playerId: job.playerId,
        profileId: job.profileId,
        learningEpoch: job.learningEpoch,
        baseVersionId: job.baseVersionId,
        baseValues: new Map(),
        proposals: new Map(),
        orders: new Map(),
        values: new Map(),
        headVersionId: job.baseVersionId,
        recompositions: 0,
      };
    }
    const generation = this.generation!;
    if (
      this.pending.some((entry) => entry.job.segmentId === job.segmentId) ||
      this.active?.job.segmentId === job.segmentId ||
      generation.proposals.has(job.segmentId)
    )
      return {
        status: 'REJECTED',
        reason: 'SEGMENT_DUPLICATE',
        detail: 'This segment is already queued or running',
        ticket: null,
      };
    if (generation.orders.has(job.order))
      return {
        status: 'REJECTED',
        reason: 'ORDER_CONFLICT',
        detail: 'Another segment already owns this intervention order',
        ticket: null,
      };
    const knownBase = generation.baseValues.get(job.key);
    if (knownBase !== undefined && knownBase !== job.baseValue)
      return {
        status: 'REJECTED',
        reason: 'BASE_VALUE_MISMATCH',
        detail: 'The epoch base value for this key differs from the rest of the generation',
        ticket: null,
      };
    if (generation.proposals.size >= this.maxProposals)
      return {
        status: 'REJECTED',
        reason: 'QUEUE_FULL',
        detail: 'The epoch proposal ledger reached its explicit bound',
        ticket: null,
      };

    const pendingBytes = this.pending.reduce((total, entry) => total + entry.bytes, 0);
    if (this.pending.length >= this.maxPending)
      return {
        status: 'BACKPRESSURE',
        reason: 'QUEUE_FULL',
        detail: `The serial queue already holds ${this.maxPending} waiting jobs`,
        ticket: null,
      };
    if (pendingBytes + buffer.byteLength > this.maxBytes)
      return {
        status: 'BACKPRESSURE',
        reason: 'QUEUE_BYTES',
        detail: `Waiting payloads would exceed ${this.maxBytes} bytes`,
        ticket: null,
      };

    let resolve!: Entry['resolve'];
    const outcome = new Promise<LearningJobOutcome>((done) => {
      resolve = done;
    });
    const jobId = String(++this.jobSequence);
    const packet: Packet = Object.freeze({
      jobId,
      segmentId: job.segmentId,
      baseVersionId: job.baseVersionId,
      profileId: job.profileId,
      learningEpoch: job.learningEpoch,
      sessionId: job.sessionId,
      worldEpoch: job.worldEpoch,
      type: 'start',
      sequence: 0,
      payloadBytes: buffer.byteLength,
      ownership: 'copy',
      priority: 'interactive',
      buffer,
    });
    const entry: Entry = {
      job,
      packet,
      bytes: buffer.byteLength,
      sequence: ++this.sequence,
      generationKey: generation.key,
      admittedAt: this.now(),
      state: 'QUEUED',
      dispatchAt: null,
      cancelRequested: false,
      invalidated: false,
      ticketKey: null,
      settled: false,
      resolve,
      ticket: {
        segmentId: job.segmentId,
        generationKey: generation.key,
        outcome,
        get state() {
          return entry.state;
        },
      },
    };
    generation.orders.set(job.order, job.segmentId);
    if (!generation.baseValues.has(job.key)) generation.baseValues.set(job.key, job.baseValue);
    this.pending.push(entry);
    this.schedulePump();
    return { status: 'QUEUED', reason: null, detail: null, ticket: entry.ticket };
  }

  /** Cancel one queued/running segment. The next job stays runnable either way. */
  cancel(segmentId: string): boolean {
    const pending = this.pending.find((entry) => entry.job.segmentId === segmentId);
    if (pending) {
      this.pending = this.pending.filter((entry) => entry !== pending);
      this.releaseOrder(pending);
      this.settle(pending, 'CANCELLED', null, null);
      this.schedulePump();
      return true;
    }
    const active = this.active;
    if (!active || active.job.segmentId !== segmentId || active.settled) return false;
    active.cancelRequested = true;
    if (active.ticketKey !== null) this.governor.cancel(active.ticketKey);
    return true;
  }

  /** Resolves when no job is waiting or running. */
  whenIdle(): Promise<void> {
    if (!this.active && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of [...this.pending]) this.settle(entry, 'ERROR', 'QUEUE_DISPOSED', null);
    this.pending = [];
    const active = this.active;
    if (active && !active.settled) {
      active.invalidated = true;
      if (active.ticketKey !== null) this.governor.cancel(active.ticketKey);
    }
  }

  private releaseOrder(entry: Entry): void {
    const generation = this.generation;
    if (generation && generation.key === entry.generationKey)
      generation.orders.delete(entry.job.order);
  }

  private invalidateGeneration(reason: LearningJobRejectionCode, detail: string): void {
    if (this.generation === null) return;
    const old = this.generation;
    this.generation = null;
    for (const entry of [...this.pending]) {
      this.pending = this.pending.filter((candidate) => candidate !== entry);
      this.settle(entry, 'INVALIDATED', reason, detail);
    }
    const active = this.active;
    if (active && active.generationKey === old.key && !active.settled) {
      active.invalidated = true;
      if (active.ticketKey !== null) this.governor.cancel(active.ticketKey);
    }
  }

  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  private pump(): void {
    if (this.disposed || this.active) return;
    const next = [...this.pending].sort(
      (a, b) => a.job.order - b.job.order || a.sequence - b.sequence,
    )[0];
    if (!next) {
      this.resolveIdle();
      return;
    }
    this.pending = this.pending.filter((entry) => entry !== next);
    this.active = next;
    next.state = 'DISPATCHING';
    next.dispatchAt = this.now();
    let admission: Promise<Admission>;
    try {
      admission = this.governor.submit(next.packet, 'learning');
    } catch {
      admission = Promise.reject(new Error('Governor submission threw'));
    }
    void admission.then(
      (result) => this.onAdmission(next, result, null),
      (error: unknown) =>
        this.onAdmission(next, null, error instanceof Error ? error.message : 'Governor rejected'),
    );
  }

  private onAdmission(entry: Entry, admission: Admission | null, failure: string | null): void {
    if (entry.settled) {
      if (admission?.ticket) this.governor.cancel(admission.ticket.key);
      return;
    }
    if (!admission || admission.status !== 'PENDING' || !admission.ticket) {
      if (entry.cancelRequested) {
        this.settle(entry, 'CANCELLED', null, null);
        this.schedulePump();
        return;
      }
      if (entry.invalidated) {
        this.settle(
          entry,
          'INVALIDATED',
          'GENERATION_INVALIDATED',
          'A newer learning generation invalidated this attempt',
        );
        this.schedulePump();
        return;
      }
      this.settle(
        entry,
        'ERROR',
        'GOVERNOR_REFUSED',
        admission?.reason ?? failure ?? 'The governor did not admit the job',
      );
      this.schedulePump();
      return;
    }
    entry.ticketKey = admission.ticket.key;
    entry.state = 'RUNNING';
    if (entry.cancelRequested || entry.invalidated || this.disposed)
      this.governor.cancel(admission.ticket.key);
    void admission.ticket.outcome.then((outcome) => this.onOutcome(entry, outcome));
  }

  private onOutcome(entry: Entry, outcome: JobOutcome): void {
    if (entry.settled) return;
    const ended = this.now();
    if (this.active === entry) this.active = null;
    if (entry.invalidated) {
      this.settle(
        entry,
        'INVALIDATED',
        'GENERATION_INVALIDATED',
        'A newer learning generation invalidated this attempt',
        null,
        ended,
      );
      this.schedulePump();
      return;
    }
    if (entry.cancelRequested || outcome.status === 'cancelled') {
      this.settle(entry, 'CANCELLED', null, null, null, ended);
      this.schedulePump();
      return;
    }
    if (outcome.status === 'result' && outcome.packet) {
      this.composeResult(entry, outcome.packet, ended);
      this.schedulePump();
      return;
    }
    this.settle(
      entry,
      'ERROR',
      outcome.status === 'stale' ? 'JOB_EXPIRED' : 'RESULT_INVALID',
      outcome.reason ?? 'The estimator did not return a result',
      null,
      ended,
    );
    this.schedulePump();
  }

  /**
   * Applies one worker proposal to the epoch ledger and recomposes the whole ledger serially in
   * intervention order. A same-epoch late proposal is therefore folded in its proper position
   * instead of being dropped or applied as a parallel last-write-wins overwrite.
   */
  private composeResult(entry: Entry, packet: Packet, ended: number): void {
    const generation = this.generation;
    if (generation === null || generation.key !== entry.generationKey) {
      this.settle(
        entry,
        'INVALIDATED',
        'GENERATION_INVALIDATED',
        'The learning generation changed before the result arrived',
        null,
        ended,
      );
      return;
    }
    let result: LearningEstimateResult;
    try {
      result = decodeLearningEstimateResult(packet.buffer);
    } catch (error) {
      this.settle(
        entry,
        'ERROR',
        'RESULT_INVALID',
        error instanceof Error ? error.message : 'Malformed estimator result',
        null,
        ended,
      );
      return;
    }
    if (
      result.key !== entry.job.key ||
      result.segmentId !== entry.job.segmentId ||
      result.baseVersionId !== entry.job.baseVersionId ||
      result.learningEpoch !== entry.job.learningEpoch
    ) {
      this.settle(
        entry,
        'ERROR',
        'RESULT_IDENTITY_MISMATCH',
        'The estimator result does not match the admitted job identity',
        null,
        ended,
      );
      return;
    }
    const definition = getParameterDefinition(entry.job.key);
    if (result.min !== definition.min || result.max !== definition.max) {
      this.settle(
        entry,
        'ERROR',
        'RESULT_INVALID',
        'The estimator result does not match the 092 parameter bounds',
        null,
        ended,
      );
      return;
    }
    generation.proposals.set(entry.job.segmentId, {
      segmentId: entry.job.segmentId,
      order: entry.job.order,
      key: entry.job.key,
      baseValue: entry.job.baseValue,
      estimate: result.estimate,
      learningWeight: result.learningWeight,
      resolution: result.resolution,
    });
    if (!generation.baseValues.has(entry.job.key))
      generation.baseValues.set(entry.job.key, entry.job.baseValue);

    const recomposed = this.recompose(generation, entry.job.key);
    if (recomposed.status === 'REJECTED') {
      generation.proposals.delete(entry.job.segmentId);
      if (![...generation.proposals.values()].some((row) => row.key === entry.job.key))
        generation.baseValues.delete(entry.job.key);
      this.settle(
        entry,
        'REJECTED',
        'COMPOSITION_REJECTED',
        `${recomposed.code}: ${recomposed.detail}`,
        null,
        ended,
      );
      return;
    }
    this.settle(entry, 'COMPOSED', null, null, recomposed.composition, ended);
  }

  private recompose(
    generation: LearningGeneration,
    composedKey: ParameterKey,
  ):
    | { readonly status: 'COMPOSED'; readonly composition: LearningComposition }
    | { readonly status: 'REJECTED'; readonly code: string; readonly detail: string } {
    const byKey = new Map<ParameterKey, LearningProposal[]>();
    for (const proposal of generation.proposals.values()) {
      const rows = byKey.get(proposal.key) ?? [];
      rows.push(proposal);
      byKey.set(proposal.key, rows);
    }
    const values: { key: ParameterKey; value: number; unit: string }[] = [];
    for (const [key, rows] of byKey) {
      rows.sort((a, b) => a.order - b.order || a.segmentId.localeCompare(b.segmentId));
      values.push({
        key,
        value: foldProposals(rows[0].baseValue, rows),
        unit: getParameterDefinition(key).unit,
      });
    }
    values.sort((a, b) => a.key.localeCompare(b.key));
    const applied = [...generation.proposals.values()].sort(
      (a, b) => a.order - b.order || a.segmentId.localeCompare(b.segmentId),
    );
    const appliedOrders = applied.map((row) => row.order);
    const profileVersionId = `${generation.baseVersionId}~103.${appliedOrders.join('.')}`;
    const validation = validateCandidateDelta(
      {
        profileVersionId,
        parentVersionId: generation.baseVersionId,
        engineVersion: this.engineVersion,
        schemaVersion: 1,
        units: 'SI',
        values,
      },
      { baseVersionId: generation.baseVersionId, engineVersion: this.engineVersion },
    );
    if (validation.status !== 'ACCEPTED') {
      const first = validation.rejections[0];
      return {
        status: 'REJECTED',
        code: first?.code ?? 'DELTA_EMPTY',
        detail: first?.message ?? 'The composed delta was rejected',
      };
    }
    generation.values = new Map(values.map((row) => [row.key, row.value]));
    generation.headVersionId = profileVersionId;
    generation.recompositions++;
    const definition = getParameterDefinition(composedKey);
    return {
      status: 'COMPOSED',
      composition: Object.freeze({
        version: '103-learning-composition-v1',
        key: composedKey,
        baseVersionId: generation.baseVersionId,
        profileVersionId,
        learningEpoch: generation.learningEpoch,
        baseValue: generation.baseValues.get(composedKey) ?? definition.default,
        value: generation.values.get(composedKey) ?? definition.default,
        appliedSegments: Object.freeze(applied.map((row) => row.segmentId)),
        appliedOrders: Object.freeze(appliedOrders),
        recomposed: applied.length > 1,
        validation,
        published: false,
        learned: false,
      }),
    };
  }

  private governorSample(ticketKey: string | null): { queueMs: number; serviceMs: number } | null {
    if (ticketKey === null) return null;
    const samples = this.governor.measurements;
    for (let index = samples.length - 1; index >= 0; index--) {
      const sample = samples[index];
      if (sample.key === ticketKey) return { queueMs: sample.queueMs, serviceMs: sample.serviceMs };
    }
    return null;
  }

  private settle(
    entry: Entry,
    state: 'COMPOSED' | 'CANCELLED' | 'ERROR' | 'INVALIDATED' | 'REJECTED',
    reason: LearningJobRejectionCode | null,
    detail: string | null,
    composition: LearningComposition | null = null,
    ended: number = this.now(),
  ): void {
    if (entry.settled) return;
    entry.settled = true;
    entry.state = state;
    if (this.active === entry) this.active = null;
    this.pending = this.pending.filter((candidate) => candidate !== entry);
    if (state !== 'COMPOSED') this.releaseOrder(entry);
    if (state !== 'COMPOSED') {
      const generation = this.generation;
      if (
        generation &&
        generation.key === entry.generationKey &&
        !generation.proposals.has(entry.job.segmentId) &&
        ![...generation.proposals.values()].some((row) => row.key === entry.job.key)
      )
        generation.baseValues.delete(entry.job.key);
    }
    const governor = this.governorSample(entry.ticketKey);
    const dispatchAt = entry.dispatchAt;
    const measurement: LearningQueueMeasurement = Object.freeze({
      segmentId: entry.job.segmentId,
      order: entry.job.order,
      learningEpoch: entry.job.learningEpoch,
      status: state,
      queueMs: Math.max(0, (dispatchAt ?? ended) - entry.admittedAt),
      serviceMs: dispatchAt === null ? 0 : Math.max(0, ended - dispatchAt),
      endToEndMs: Math.max(0, ended - entry.admittedAt),
      governorQueueMs: governor?.queueMs ?? null,
      governorServiceMs: governor?.serviceMs ?? null,
      recomposed: composition?.recomposed ?? false,
      payloadBytes: entry.bytes,
    });
    this.samples.push(measurement);
    if (this.samples.length > this.historyLimit) this.samples.shift();
    entry.resolve(
      Object.freeze({
        status:
          state === 'COMPOSED'
            ? 'composed'
            : state === 'CANCELLED'
              ? 'cancelled'
              : state === 'INVALIDATED'
                ? 'invalidated'
                : state === 'REJECTED'
                  ? 'rejected'
                  : 'error',
        reason,
        detail,
        composition,
        measurement,
      }),
    );
    this.resolveIdle();
  }

  private resolveIdle(): void {
    if (this.active || this.pending.length > 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}
