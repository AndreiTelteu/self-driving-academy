import type {
  LearningAdmission,
  LearningJob,
  LearningJobOutcome,
  ParameterEvidenceReadModel,
} from '../learning';
import { getParameterDefinition } from '../profiles';
import {
  LEARNING_NOTIFICATION_LIMITS,
  isLearningNotificationStale,
  parseLearningNotificationEvent,
} from '../ui';
import type {
  LearningNotificationCurrentJob,
  LearningNotificationEvent,
  LearningNotificationMode,
  LearningNotificationMissingObservation,
  LearningNotificationMissingState,
} from '../ui';

/**
 * 079 composition root: maps the real 103 queue outcomes and the explicit 110 publication payload
 * onto the notification contract.
 *
 * Two rules are enforced here, not only in the UI:
 *
 * - a worker `composed` candidate becomes `RESULT` = „Candidat validat, nepublicat”; an `error`,
 *   `rejected`, `invalidated` or `cancelled` outcome is a matching non-success kind and can never
 *   become `PUBLISHED`;
 * - `PUBLISHED` exists only through `notificationFromPublication`, which requires `published: true`
 *   and a real publication version id.
 *
 * A late outcome (segment/job/epoch/session/world no longer current) is converted to the quiet
 * `STALE` kind. No count, value or evidence is invented: every number comes from the real 103
 * outcome or the real 093/100 read model.
 */
export const LEARNING_NOTIFICATION_ADAPTER_VERSION = '079-learning-notifications-app-v1' as const;

/** Code units kept from a closed 103 reason/detail; the full text stays in the outcome. */
const REASON_CODE_UNITS = 120;
const DETAIL_CODE_UNITS = 240;

export interface LearningNotificationContext {
  /** Stable, unique event id supplied by the host (for example `learningNotificationEventId`). */
  readonly eventId: string;
  /** Authoritative tick at which the host observed the outcome. */
  readonly tick: number;
  /** Optional echo of the job session; a different value is a closed error. */
  readonly sessionId?: string;
  /** Optional echo of the job world epoch; a different value is a closed error. */
  readonly worldEpoch?: number;
}

/** Queue job identity carried by every notification. */
export function learningNotificationJobKey(job: LearningJob): string {
  return `job:103:${job.segmentId}:${job.order}`;
}

/** 103 generation identity: profile, learning epoch and base version. */
export function learningNotificationGenerationKey(job: LearningJob): string {
  return `gen:103:${job.profileId}:${job.learningEpoch}:${job.baseVersionId}`;
}

/** Deterministic event id for one outcome of one job. */
export function learningNotificationEventId(job: LearningJob, suffix: string): string {
  return `079:${job.segmentId}:${job.order}:${suffix}`;
}

/** The identity a notification must still match to be shown as the current result. */
export function notificationCurrentJob(job: LearningJob): LearningNotificationCurrentJob {
  return Object.freeze({
    sessionId: job.sessionId,
    worldEpoch: job.worldEpoch,
    segmentId: job.segmentId,
    jobKey: learningNotificationJobKey(job),
    learningEpoch: job.learningEpoch,
  });
}

function bounded(value: string, maximum: number): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function boundedDetail(value: string | null): string | null {
  if (value === null) return null;
  return value.length > DETAIL_CODE_UNITS ? value.slice(0, DETAIL_CODE_UNITS) : value;
}

function baseOf(job: LearningJob, context: LearningNotificationContext) {
  const sessionId = context.sessionId ?? job.sessionId,
    worldEpoch = context.worldEpoch ?? job.worldEpoch;
  if (sessionId !== job.sessionId)
    throw new Error('Learning notification session does not match the job');
  if (worldEpoch !== job.worldEpoch)
    throw new Error('Learning notification world epoch does not match the job');
  return {
    eventId: context.eventId,
    sessionId,
    worldEpoch,
    segmentId: job.segmentId,
    jobKey: learningNotificationJobKey(job),
    generationKey: learningNotificationGenerationKey(job),
    profileId: job.profileId,
    learningEpoch: job.learningEpoch,
    tick: context.tick,
    mode: job.mode as LearningNotificationMode,
    key: job.key,
    order: job.order,
  };
}

function publishable(event: Record<string, unknown>): LearningNotificationEvent {
  return parseLearningNotificationEvent(event);
}

/**
 * The late-result event id differs from the original, so an already displayed result is never
 * confused with the quiet late message and cannot swallow it through duplicate suppression.
 */
function staleEventId(eventId: string): string {
  const suffix = ':stale',
    maximum = LEARNING_NOTIFICATION_LIMITS.eventIdCodeUnits;
  return eventId.length + suffix.length <= maximum
    ? `${eventId}${suffix}`
    : `${eventId.slice(0, maximum - suffix.length)}${suffix}`;
}

/** The quiet late-result kind; a publication is never reclassified. */
function staleFrom(event: LearningNotificationEvent, reason: string): LearningNotificationEvent {
  const { sessionId, worldEpoch, segmentId, jobKey, generationKey, profileId } = event,
    { learningEpoch, tick, mode, key, order } = event;
  return publishable({
    eventId: staleEventId(event.eventId),
    sessionId,
    worldEpoch,
    segmentId,
    jobKey,
    generationKey,
    profileId,
    learningEpoch,
    tick,
    mode,
    key,
    order,
    kind: 'STALE',
    reason,
    detail: `Rezultatul nu mai aparține jobului curent (${event.kind}).`,
  });
}

/** True when the event's binding no longer matches the current job. */
export function isStaleNotification(
  event: LearningNotificationEvent,
  current: LearningNotificationCurrentJob | null,
): boolean {
  return isLearningNotificationStale(event, current);
}

/**
 * Maps one real 103 queue outcome:
 * `composed` + accepted candidate → `RESULT` („Candidat validat, nepublicat”) or `NO_CHANGE`;
 * `error` → `ERROR` with the real 103 reason/detail; `rejected`/`invalidated`/`cancelled` → the
 * matching non-success kind. A late outcome becomes `STALE` when `current` is supplied.
 */
export function notificationFromOutcome(
  job: LearningJob,
  outcome: LearningJobOutcome,
  context: LearningNotificationContext,
  current: LearningNotificationCurrentJob | null = null,
): LearningNotificationEvent {
  const base = baseOf(job, context),
    definition = getParameterDefinition(job.key),
    label = definition.description,
    unit = definition.unit;
  let event: LearningNotificationEvent;
  switch (outcome.status) {
    case 'composed': {
      const composition = outcome.composition;
      if (composition === null)
        event = publishable({
          ...base,
          kind: 'ERROR',
          reason: 'RESULT_INVALID',
          detail: 'The composed outcome did not carry a composition.',
        });
      else if (composition.validation.status !== 'ACCEPTED')
        event = publishable({
          ...base,
          kind: 'REJECTED',
          reason: 'COMPOSITION_REJECTED',
          detail: 'The composed delta did not pass the 102 validation gate.',
        });
      else if (composition.value === composition.baseValue)
        event = publishable({ ...base, kind: 'NO_CHANGE', label });
      else
        event = publishable({
          ...base,
          kind: 'RESULT',
          label,
          unit,
          previousValue: composition.baseValue,
          value: composition.value,
        });
      break;
    }
    case 'error':
      event = publishable({
        ...base,
        kind: 'ERROR',
        reason: bounded(outcome.reason ?? 'RESULT_INVALID', REASON_CODE_UNITS),
        detail: boundedDetail(outcome.detail),
      });
      break;
    case 'rejected':
      event = publishable({
        ...base,
        kind: 'REJECTED',
        reason: bounded(outcome.reason ?? 'COMPOSITION_REJECTED', REASON_CODE_UNITS),
        detail: boundedDetail(outcome.detail),
      });
      break;
    case 'invalidated':
      event = publishable({
        ...base,
        kind: 'INVALIDATED',
        reason: bounded(outcome.reason ?? 'GENERATION_INVALIDATED', REASON_CODE_UNITS),
        detail: boundedDetail(outcome.detail),
      });
      break;
    case 'cancelled':
      event = publishable({
        ...base,
        kind: 'CANCELLED',
        detail: boundedDetail(outcome.detail),
      });
      break;
  }
  return event.kind !== 'PUBLISHED' && isStaleNotification(event, current)
    ? staleFrom(event, 'LATE_RESULT')
    : event;
}

/**
 * Maps the synchronous 103 admission: `QUEUED` is „analiză în curs”, `REJECTED`/`BACKPRESSURE`
 * carry the closed reason and stay a rejection, bound to the same segment and job.
 */
export function notificationFromAdmission(
  admission: LearningAdmission,
  job: LearningJob,
  context: LearningNotificationContext,
): LearningNotificationEvent {
  const base = baseOf(job, context);
  if (admission.status === 'QUEUED') return publishable({ ...base, kind: 'ANALYZING' });
  return publishable({
    ...base,
    kind: 'REJECTED',
    reason: bounded(
      admission.reason ?? (admission.status === 'BACKPRESSURE' ? 'QUEUE_FULL' : 'JOB_INVALID'),
      REASON_CODE_UNITS,
    ),
    detail: boundedDetail(admission.detail),
  });
}

/** `INSUFFICIENT_EVIDENCE` from a real bounded list of concrete missing observations. */
export function notificationFromMissingEvidence(
  job: LearningJob,
  missing: readonly LearningNotificationMissingObservation[],
  context: LearningNotificationContext,
): LearningNotificationEvent {
  if (missing.length === 0)
    throw new Error('Insufficient evidence requires at least one concrete missing observation');
  return publishable({
    ...baseOf(job, context),
    kind: 'INSUFFICIENT_EVIDENCE',
    missing: missing.map((row) => ({
      key: row.key,
      label: row.label,
      state: row.state,
      episodes: row.episodes,
    })),
  });
}

/** A real 093 read model or an explicit state from the 100 confidence layer. */
export interface LearningNotificationEvidenceSource {
  readonly key: string;
  readonly evidence?: ParameterEvidenceReadModel | null;
  readonly state?: string;
  readonly distinctEpisodes?: number;
}

export type LearningNotificationEvidenceInput =
  ParameterEvidenceReadModel | LearningNotificationEvidenceSource;

function isReadModel(row: LearningNotificationEvidenceInput): row is ParameterEvidenceReadModel {
  return 'status' in row && 'sampleCount' in row && 'contextBreakdown' in row;
}

/**
 * Concrete `UNOBSERVED`/`WEAK` observations, bounded and ordered by key. It names the real key and
 * the real distinct episode count; it never invents an episode count or a label.
 */
export function missingObservationsFromEvidence(
  rows: readonly LearningNotificationEvidenceInput[],
  limit: number = 4,
): readonly LearningNotificationMissingObservation[] {
  const maximum = Math.max(1, Math.min(4, Math.trunc(limit))),
    found = new Map<string, LearningNotificationMissingObservation>();
  for (const row of rows) {
    const read = isReadModel(row) ? row : (row.evidence ?? null),
      state: string | undefined = isReadModel(row) ? undefined : row.state,
      status = read?.status,
      distinct = isReadModel(row)
        ? row.distinctEpisodes
        : (row.distinctEpisodes ?? read?.distinctEpisodes);
    let missingState: LearningNotificationMissingState | null = null;
    if (state === 'UNOBSERVED' || state === 'WEAK') missingState = state;
    else if (status === 'NO_EVIDENCE') missingState = 'UNOBSERVED';
    else if (status === 'INSUFFICIENT') missingState = 'WEAK';
    if (missingState === null) continue;
    let definition;
    try {
      definition = getParameterDefinition(row.key);
    } catch {
      continue;
    }
    found.set(row.key, {
      key: definition.key,
      label: definition.description,
      state: missingState,
      episodes:
        distinct === undefined || distinct === null
          ? status === 'NO_EVIDENCE'
            ? 0
            : null
          : Math.max(0, Math.trunc(distinct)),
    });
  }
  return Object.freeze(
    [...found.values()]
      .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
      .slice(0, maximum)
      .map((row) => Object.freeze(row)),
  );
}

/**
 * An explicit 110/112 publication payload. This is the only input that can produce `PUBLISHED`;
 * `published` must be the literal `true` and the version id must be real.
 */
export interface LearningNotificationPublicationPayload {
  readonly publicationVersionId: string;
  readonly published: true;
  readonly profileId: string;
  readonly key: string;
  readonly previousValue: number | null;
  readonly value: number;
  readonly segmentId: string;
  readonly jobKey: string;
  readonly generationKey: string;
  readonly learningEpoch: number;
  readonly order: number;
  readonly mode: LearningNotificationMode;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
}

/** Maps a real publication event to the only kind allowed to say „Profil publicat”. */
export function notificationFromPublication(
  publication: LearningNotificationPublicationPayload,
  context: { readonly eventId: string },
): LearningNotificationEvent {
  if (publication.published !== true)
    throw new Error('A publication notification requires an explicit published payload');
  const definition = getParameterDefinition(publication.key);
  return publishable({
    eventId: context.eventId,
    sessionId: publication.sessionId,
    worldEpoch: publication.worldEpoch,
    segmentId: publication.segmentId,
    jobKey: publication.jobKey,
    generationKey: publication.generationKey,
    profileId: publication.profileId,
    learningEpoch: publication.learningEpoch,
    tick: publication.tick,
    mode: publication.mode,
    key: definition.key,
    order: publication.order,
    kind: 'PUBLISHED',
    label: definition.description,
    unit: definition.unit,
    previousValue: publication.previousValue,
    value: publication.value,
    publicationVersionId: publication.publicationVersionId,
    published: true,
  });
}
