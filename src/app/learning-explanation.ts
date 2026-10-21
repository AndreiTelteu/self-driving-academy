import type {
  LearningComposition,
  LearningJob,
  LearningJobOutcome,
  ParameterEvidenceReadModel,
} from '../learning';
import { assessEvidenceConfidence, CANDIDATE_LEARNING_KEYS } from '../learning';
import { getParameterDefinition } from '../profiles';
import {
  LEARNING_EXPLANATION_LIMITS,
  createLearningExplanationSnapshot,
  formatLearningExplanationNumber,
} from '../ui';
import type {
  LearningExplanationChange,
  LearningExplanationConfidenceState,
  LearningExplanationFrame,
  LearningExplanationSnapshot,
  LearningExplanationUncertainty,
} from '../ui';

/**
 * 104 composition root: maps real 103 queue outcomes onto the explanation contract.
 *
 * - `composed` with a real value change → `CHANGED` with the composition `profileVersionId` and the
 *   100 evidence/confidence of the same job (effective episodes, contexts, quality, uncertainty);
 * - `composed` with identical values → `NO_CHANGE`, `versionId: null`, and a reason derived from the
 *   real evidence state (`NO_NEW_EVIDENCE`, `WEAK_EVIDENCE`, `BELOW_THRESHOLD`,
 *   `UNCHANGED_ESTIMATE`);
 * - `error`/`rejected`/`invalidated`/`cancelled` → `ERROR`/`REJECTED` with the real closed reason and
 *   detail, zero changes and no version;
 * - a composed change without usable evidence or context is never shown as a change: the whole frame
 *   becomes `INSUFFICIENT_EVIDENCE` with explicit `missingContexts`, so no value, count or context is
 *   invented;
 * - a late or foreign job (different segment/job/epoch/session/world/generation) becomes a closed
 *   `STALE_JOB` error and never the current result.
 *
 * The function is pure: it does not publish, mutate a profile, write a store or run the estimator.
 * 079 notifications remain the owner of the transient messages.
 */
export const LEARNING_EXPLANATION_ADAPTER_VERSION = '104-learning-explanation-app-v1' as const;

export interface LearningExplanationSource {
  readonly job: LearningJob;
  readonly outcome: LearningJobOutcome;
}

/** The job the frame must still belong to; supplied by the host. */
export interface LearningExplanationCurrent {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  readonly jobKey: string;
  readonly learningEpoch: number;
}

export interface LearningExplanationInput {
  /** Authoritative tick at which the host observed the result. */
  readonly tick: number;
  /** Optional echo of the job session; a different value is a closed `STALE_JOB` error. */
  readonly sessionId?: string;
  /** Optional echo of the job world epoch; a different value is a closed `STALE_JOB` error. */
  readonly worldEpoch?: number;
  /** Optional current job binding; a late/foreign result is never shown as current. */
  readonly current?: LearningExplanationCurrent | null;
}

/** Closed read errors. The function never guesses a job, a key or a value. */
export const LEARNING_EXPLANATION_READ_ERRORS = Object.freeze({
  EMPTY: 'Learning explanation requires at least one learning result',
  JOB: 'Learning explanation job must be an eligible LEARNING job',
  KEY: 'Learning explanation job key is not a learning target',
  EVIDENCE: 'Learning explanation evidence is invalid for the job key',
});

const STALE_JOB = 'STALE_JOB';

function fail(message: string, detail: string): never {
  throw new Error(`${message}: ${detail}`);
}

function bounded(value: string, maximum: number): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function boundedDetail(value: string | null): string | null {
  return value === null ? null : bounded(value, LEARNING_EXPLANATION_LIMITS.detailCodeUnits);
}

/** Queue job identity carried by the explanation header. */
export function learningExplanationJobKey(job: LearningJob): string {
  return `job:104:${job.segmentId}:${job.order}`;
}

/** 103 generation identity: profile, learning epoch and base version. */
export function learningExplanationGenerationKey(job: LearningJob): string {
  return `gen:104:${job.profileId}:${job.learningEpoch}:${job.baseVersionId}`;
}

/** The identity an explanation must still match to be shown as the current result. */
export function learningExplanationCurrentJob(job: LearningJob): LearningExplanationCurrent {
  return Object.freeze({
    sessionId: job.sessionId,
    worldEpoch: job.worldEpoch,
    segmentId: job.segmentId,
    jobKey: learningExplanationJobKey(job),
    learningEpoch: job.learningEpoch,
  });
}

interface EvidenceExplanation {
  readonly key: string;
  readonly contexts: readonly string[];
  readonly evidenceCount: number;
  readonly quality: number;
  readonly uncertainty: LearningExplanationUncertainty;
  readonly confidence: LearningExplanationConfidenceState;
  readonly distinctEpisodes: number;
  readonly requiredEpisodes: number;
}

function contextsOf(evidence: ParameterEvidenceReadModel): readonly string[] {
  const contexts: string[] = [];
  for (const row of evidence.contextBreakdown) {
    const label = bounded(row.label, LEARNING_EXPLANATION_LIMITS.contextCodeUnits);
    if (!label || contexts.includes(label)) continue;
    contexts.push(label);
    if (contexts.length >= LEARNING_EXPLANATION_LIMITS.contextsPerChange) break;
  }
  return Object.freeze(contexts);
}

function evidenceOf(job: LearningJob): EvidenceExplanation {
  const assessment = assessEvidence(job);
  if (assessment.key !== job.key) fail(LEARNING_EXPLANATION_READ_ERRORS.EVIDENCE, assessment.key);
  return {
    key: job.key,
    contexts: contextsOf(job.evidence),
    evidenceCount: assessment.effectiveEpisodeCount,
    quality: assessment.quality,
    uncertainty: assessment.uncertainty,
    confidence: assessment.state,
    distinctEpisodes: assessment.distinctEpisodeCount,
    requiredEpisodes: assessment.requiredEffectiveEpisodes,
  };
}

function assessEvidence(job: LearningJob): ReturnType<typeof assessEvidenceConfidence> {
  try {
    return assessEvidenceConfidence({
      key: job.key,
      evidence: job.evidence,
      episodes: job.episodes,
      candidate: job.candidate,
    });
  } catch (error) {
    return fail(
      LEARNING_EXPLANATION_READ_ERRORS.EVIDENCE,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function missingText(evidence: EvidenceExplanation, reason: string): string {
  const count = `${formatLearningExplanationNumber(evidence.evidenceCount)} episoade efective`,
    distinct = `${evidence.distinctEpisodes} distincte`;
  return bounded(
    `${evidence.key}: ${reason} (${count}, ${distinct})`,
    LEARNING_EXPLANATION_LIMITS.contextCodeUnits,
  );
}

function readErrorReason(
  outcome: LearningJobOutcome,
): { status: 'ERROR' | 'REJECTED'; reason: string } | null {
  switch (outcome.status) {
    case 'composed':
      return null;
    case 'error':
      return { status: 'ERROR', reason: outcome.reason ?? 'RESULT_INVALID' };
    case 'rejected':
      return { status: 'REJECTED', reason: outcome.reason ?? 'COMPOSITION_REJECTED' };
    case 'invalidated':
      return { status: 'REJECTED', reason: outcome.reason ?? 'GENERATION_INVALIDATED' };
    case 'cancelled':
      return { status: 'REJECTED', reason: 'CANCELLED' };
  }
}

function baseFrameOf(
  head: LearningJob,
  input: LearningExplanationInput,
  status: LearningExplanationFrame['status'],
): LearningExplanationFrame {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: input.sessionId ?? head.sessionId,
    worldEpoch: input.worldEpoch ?? head.worldEpoch,
    tick: input.tick,
    segmentId: head.segmentId,
    jobKey: learningExplanationJobKey(head),
    generationKey: learningExplanationGenerationKey(head),
    profileId: head.profileId,
    learningEpoch: head.learningEpoch,
    mode: head.mode,
    order: head.order,
    status,
    versionId: null,
    changes: [],
    noChangeReason: null,
    missingContexts: [],
    detail: null,
  };
}

function failureFrame(
  head: LearningJob,
  input: LearningExplanationInput,
  status: 'ERROR' | 'REJECTED',
  reason: string,
  detail: string | null,
): LearningExplanationSnapshot {
  return createLearningExplanationSnapshot(
    {
      ...baseFrameOf(head, input, status),
      status,
      noChangeReason: bounded(reason, LEARNING_EXPLANATION_LIMITS.reasonCodeUnits),
      detail: boundedDetail(detail),
    },
    CANDIDATE_LEARNING_KEYS,
  );
}

/** A foreign/late job is a closed error, never the current explanation. */
function staleFrame(
  head: LearningJob,
  input: LearningExplanationInput,
  detail: string,
): LearningExplanationSnapshot {
  return failureFrame(head, input, 'ERROR', STALE_JOB, bounded(detail, 240));
}

function isStale(
  job: LearningJob,
  input: LearningExplanationInput,
  current: LearningExplanationCurrent | null,
): string | null {
  if (input.sessionId !== undefined && input.sessionId !== job.sessionId)
    return 'Sesiunea cadrului nu corespunde jobului.';
  if (input.worldEpoch !== undefined && input.worldEpoch !== job.worldEpoch)
    return 'Lumea cadrului nu corespunde jobului.';
  if (current === null) return null;
  if (
    current.sessionId !== job.sessionId ||
    current.worldEpoch !== job.worldEpoch ||
    current.segmentId !== job.segmentId ||
    current.jobKey !== learningExplanationJobKey(job) ||
    current.learningEpoch !== job.learningEpoch
  )
    return 'Rezultatul nu mai aparține jobului curent.';
  return null;
}

function checkJob(job: LearningJob): void {
  if (job.mode !== 'LEARNING' || job.eligible !== true)
    fail(LEARNING_EXPLANATION_READ_ERRORS.JOB, job.segmentId);
  if (!CANDIDATE_LEARNING_KEYS.includes(job.key))
    fail(LEARNING_EXPLANATION_READ_ERRORS.KEY, job.key);
}

interface ComposedRow {
  readonly source: LearningExplanationSource;
  readonly composition: LearningComposition;
  readonly evidence: EvidenceExplanation;
  readonly changed: boolean;
}

function noChangeReasonOf(
  rows: readonly ComposedRow[],
): 'NO_NEW_EVIDENCE' | 'WEAK_EVIDENCE' | 'BELOW_THRESHOLD' | 'UNCHANGED_ESTIMATE' {
  if (rows.every((row) => row.evidence.confidence === 'UNOBSERVED')) return 'NO_NEW_EVIDENCE';
  if (rows.some((row) => row.evidence.confidence === 'WEAK')) return 'WEAK_EVIDENCE';
  if (
    rows.some(
      (row) =>
        row.evidence.evidenceCount <= 0 ||
        row.evidence.requiredEpisodes <= 0 ||
        row.evidence.quality < 0.6,
    )
  )
    return 'BELOW_THRESHOLD';
  return 'UNCHANGED_ESTIMATE';
}

function missingForNoChange(rows: readonly ComposedRow[], reason: string): readonly string[] {
  if (reason === 'UNCHANGED_ESTIMATE') return Object.freeze([]);
  const relevant =
    reason === 'WEAK_EVIDENCE'
      ? rows.filter((row) => row.evidence.confidence !== 'OBSERVED')
      : rows;
  return Object.freeze(
    relevant
      .map((row) => missingText(row.evidence, reason))
      .slice(0, LEARNING_EXPLANATION_LIMITS.missingContexts),
  );
}

function changeOf(row: ComposedRow): LearningExplanationChange {
  const definition = getParameterDefinition(row.source.job.key),
    next = row.composition.value,
    previous = row.composition.baseValue;
  return {
    key: row.source.job.key,
    label: definition.description,
    unit: definition.unit,
    previous,
    next,
    delta: next - previous,
    evidenceCount: row.evidence.evidenceCount,
    contexts: row.evidence.contexts,
    quality: row.evidence.quality,
    uncertainty: row.evidence.uncertainty,
    confidence: row.evidence.confidence,
    sourceSegmentIds: row.composition.appliedSegments,
    reason: row.evidence.confidence === 'ZERO' ? 'ZERO_OBSERVED' : 'EVIDENCE_APPLIED',
  };
}

/**
 * Reads one or more real 103 results and returns the explanation frame. Multi-key aggregation folds
 * several composed outcomes deterministically (one change per key, ordered by key) and never shows a
 * partial success: one failed job makes the whole frame a failure.
 */
export function readLearningExplanation(
  sources: LearningExplanationSource | readonly LearningExplanationSource[],
  input: LearningExplanationInput,
): LearningExplanationSnapshot {
  const list = Array.isArray(sources)
    ? (sources as readonly LearningExplanationSource[])
    : [sources as LearningExplanationSource];
  if (list.length === 0) throw new Error(LEARNING_EXPLANATION_READ_ERRORS.EMPTY);
  for (const source of list) {
    if (!source || !source.job || !source.outcome)
      fail(LEARNING_EXPLANATION_READ_ERRORS.JOB, 'source');
    checkJob(source.job);
  }
  if (!Number.isFinite(input.tick) || input.tick < 0)
    fail(LEARNING_EXPLANATION_READ_ERRORS.JOB, 'tick');

  const ordered = [...list].sort(
      (left, right) =>
        left.job.order - right.job.order ||
        (left.job.segmentId < right.job.segmentId
          ? -1
          : left.job.segmentId > right.job.segmentId
            ? 1
            : 0),
    ),
    headSource = ordered[ordered.length - 1]!,
    head = headSource.job,
    current = input.current ?? null;

  for (const source of ordered) {
    const job = source.job,
      // The aggregate is one result: `current` must match the head job; the other sources are
      // part of the same aggregate, not independent late results.
      stale = isStale(job, input, source === headSource ? current : null);
    if (stale !== null) return staleFrame(job, input, stale);
    if (
      job.profileId !== head.profileId ||
      job.learningEpoch !== head.learningEpoch ||
      job.baseVersionId !== head.baseVersionId ||
      job.sessionId !== head.sessionId ||
      job.worldEpoch !== head.worldEpoch
    )
      return staleFrame(job, input, 'Rezultatul aparține altei generații de învățare.');
  }

  // One failed job makes the aggregate a failure: no partial success and no invented version.
  for (const source of ordered) {
    const failure = readErrorReason(source.outcome);
    if (failure === null) continue;
    return failureFrame(
      source.job,
      input,
      failure.status,
      failure.reason,
      boundedDetail(source.outcome.detail),
    );
  }

  const rows: ComposedRow[] = [];
  for (const source of ordered) {
    const composition = source.outcome.composition;
    if (composition === null)
      return failureFrame(
        source.job,
        input,
        'ERROR',
        'RESULT_INVALID',
        'Rezultatul compus nu conține o compunere.',
      );
    if (
      composition.key !== source.job.key ||
      composition.baseVersionId !== source.job.baseVersionId ||
      composition.learningEpoch !== source.job.learningEpoch
    )
      return failureFrame(
        source.job,
        input,
        'ERROR',
        STALE_JOB,
        'Compunerea nu corespunde jobului.',
      );
    if ((composition.validation as { status: string }).status !== 'ACCEPTED')
      return failureFrame(
        source.job,
        input,
        'REJECTED',
        'COMPOSITION_REJECTED',
        'Compunerea nu a trecut poarta de validare 102.',
      );
    rows.push({
      source,
      composition,
      evidence: evidenceOf(source.job),
      changed: composition.value !== composition.baseValue,
    });
  }

  // A later composition already folds the earlier one for the same key; keep the head only.
  const byKey = new Map<string, ComposedRow>();
  for (const row of rows) byKey.set(row.source.job.key, row);
  const uniqueRows = Object.freeze([...byKey.values()]),
    changedRows = uniqueRows.filter((row) => row.changed);

  if (changedRows.length === 0) {
    const reason = noChangeReasonOf(uniqueRows);
    return createLearningExplanationSnapshot(
      {
        ...baseFrameOf(head, input, 'NO_CHANGE'),
        status: 'NO_CHANGE',
        noChangeReason: reason,
        missingContexts: missingForNoChange(uniqueRows, reason),
      },
      CANDIDATE_LEARNING_KEYS,
    );
  }

  const unexplained = changedRows.filter(
    (row) =>
      row.evidence.confidence === 'UNOBSERVED' ||
      row.evidence.evidenceCount <= 0 ||
      row.evidence.contexts.length === 0,
  );
  if (unexplained.length > 0) {
    const noEvidence = unexplained.every(
        (row) => row.evidence.confidence === 'UNOBSERVED' || row.evidence.evidenceCount <= 0,
      ),
      reason = noEvidence ? 'NO_NEW_EVIDENCE' : 'WEAK_EVIDENCE';
    return createLearningExplanationSnapshot(
      {
        ...baseFrameOf(head, input, 'INSUFFICIENT_EVIDENCE'),
        status: 'INSUFFICIENT_EVIDENCE',
        noChangeReason: reason,
        missingContexts: Object.freeze(
          unexplained
            .map((row) =>
              row.evidence.contexts.length === 0
                ? missingText(row.evidence, 'CONTEXT_MISSING')
                : missingText(row.evidence, reason),
            )
            .slice(0, LEARNING_EXPLANATION_LIMITS.missingContexts),
        ),
      },
      CANDIDATE_LEARNING_KEYS,
    );
  }

  const changes = changedRows
    .map(changeOf)
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return createLearningExplanationSnapshot(
    {
      ...baseFrameOf(head, input, 'CHANGED'),
      status: 'CHANGED',
      versionId: headSource.outcome.composition?.profileVersionId ?? null,
      changes,
    },
    CANDIDATE_LEARNING_KEYS,
  );
}
