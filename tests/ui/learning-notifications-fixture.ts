import { validateCandidateDelta } from '../../src/learning';
import type {
  LearningComposition,
  LearningJob,
  LearningJobOutcome,
  LearningQueueMeasurement,
  LearningQueueState,
  ParameterEvidenceReadModel,
} from '../../src/learning';
import { getParameterDefinition } from '../../src/profiles';
import { createLearningNotifications } from '../../src/ui';
import type { LearningNotificationsOptions } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

export const NOTIFICATION_SESSION = 'session:079';
export const NOTIFICATION_WORLD_EPOCH = 3;
export const NOTIFICATION_ENGINE = 'engine:079.1';

const READY_EVIDENCE: ParameterEvidenceReadModel = Object.freeze({
  key: 'following_time_headway',
  status: 'READY',
  distinctEpisodes: 4,
  contextBreakdown: Object.freeze([
    Object.freeze({ label: 'LEADER', roadType: 'urban', speedBand: 'MID', episodes: 4 }),
  ]),
  sampleCount: 240,
  quality: 1,
  uncertainty: 'MODERATE',
  unchanged: true,
  noEstimate: null,
});

export interface LearningJobOverrides {
  readonly key?: LearningJob['key'];
  readonly segmentId?: string;
  readonly order?: number;
  readonly learningEpoch?: number;
  readonly baseVersionId?: string;
  readonly baseValue?: number;
  readonly sessionId?: string;
  readonly worldEpoch?: number;
  readonly profileId?: string;
  readonly mode?: LearningJob['mode'];
}

/** One real 103 learning job for `following_time_headway` (1.8 s base). */
export function learningJob(overrides: LearningJobOverrides = {}): LearningJob {
  const key = overrides.key ?? 'following_time_headway',
    definition = getParameterDefinition(key);
  return Object.freeze({
    playerId: 'player:079',
    profileId: overrides.profileId ?? 'style:079',
    learningEpoch: overrides.learningEpoch ?? 4,
    baseVersionId: overrides.baseVersionId ?? 'style:079:v2',
    segmentId: overrides.segmentId ?? 'segment:079:headway',
    mode: overrides.mode ?? 'LEARNING',
    eligible: true,
    order: overrides.order ?? 7,
    sessionId: overrides.sessionId ?? NOTIFICATION_SESSION,
    worldEpoch: overrides.worldEpoch ?? NOTIFICATION_WORLD_EPOCH,
    key,
    baseValue: overrides.baseValue ?? 1.8,
    evidence: READY_EVIDENCE,
    episodes: Object.freeze([
      Object.freeze({
        opportunityId: 'opp:079:a',
        occurrence: 0,
        observedTicks: 90,
        value: 1.7,
        speedMps: 12,
        ageSeconds: 30,
      }),
      Object.freeze({
        opportunityId: 'opp:079:b',
        occurrence: 0,
        observedTicks: 120,
        value: 1.45,
        speedMps: 18,
        ageSeconds: 60,
      }),
    ]),
    candidate: Object.freeze({
      key,
      status: 'CANDIDATE',
      value: definition.default,
      interval: null,
    }),
  });
}

/** A real 093 read model with an explicit status and distinct episode count. */
export function evidenceRead(
  key: string,
  status: ParameterEvidenceReadModel['status'],
  distinctEpisodes: number,
): ParameterEvidenceReadModel {
  return Object.freeze({
    key: key as ParameterEvidenceReadModel['key'],
    status,
    distinctEpisodes,
    contextBreakdown: Object.freeze([]),
    sampleCount: distinctEpisodes * 60,
    quality: status === 'READY' ? 1 : 0,
    uncertainty: status === 'READY' ? 'LOW' : distinctEpisodes === 0 ? 'NONE' : 'HIGH',
    unchanged: true,
    noEstimate: status === 'READY' ? 'ESTIMATOR_NOT_IMPLEMENTED' : 'NO_QUALIFYING_EVIDENCE',
  });
}

function measurementOf(job: LearningJob, status: LearningQueueState): LearningQueueMeasurement {
  return Object.freeze({
    segmentId: job.segmentId,
    order: job.order,
    learningEpoch: job.learningEpoch,
    status,
    queueMs: 2,
    serviceMs: 3,
    endToEndMs: 5,
    governorQueueMs: 1,
    governorServiceMs: 3,
    recomposed: false,
    payloadBytes: 1024,
  });
}

/** A real composition that passed the 102 validation gate. */
export function composedOutcome(job: LearningJob, value: number): LearningJobOutcome {
  const definition = getParameterDefinition(job.key),
    profileVersionId = `${job.baseVersionId}~103.${job.order}`,
    validation = validateCandidateDelta(
      {
        profileVersionId,
        parentVersionId: job.baseVersionId,
        engineVersion: NOTIFICATION_ENGINE,
        schemaVersion: 1,
        units: 'SI',
        values: [{ key: job.key, value, unit: definition.unit }],
      },
      { baseVersionId: job.baseVersionId, engineVersion: NOTIFICATION_ENGINE },
    );
  if (validation.status !== 'ACCEPTED')
    throw new Error(
      `Fixture composition was rejected: ${validation.rejections[0]?.code ?? 'unknown'}`,
    );
  const composition: LearningComposition = Object.freeze({
    version: '103-learning-composition-v1',
    key: job.key,
    baseVersionId: job.baseVersionId,
    profileVersionId,
    learningEpoch: job.learningEpoch,
    baseValue: job.baseValue,
    value,
    appliedSegments: Object.freeze([job.segmentId]),
    appliedOrders: Object.freeze([job.order]),
    recomposed: false,
    validation,
    published: false,
    learned: false,
  });
  return Object.freeze({
    status: 'composed',
    reason: null,
    detail: null,
    composition,
    measurement: measurementOf(job, 'COMPOSED'),
  });
}

/** A terminal, non-success outcome with its real closed reason code. */
export function failedOutcome(
  job: LearningJob,
  status: 'error' | 'rejected' | 'invalidated' | 'cancelled',
  reason: LearningJobOutcome['reason'] = 'RESULT_INVALID',
  detail: string | null = null,
): LearningJobOutcome {
  return Object.freeze({
    status,
    reason: status === 'cancelled' ? null : reason,
    detail,
    composition: null,
    measurement: measurementOf(job, status.toUpperCase() as LearningQueueState),
  });
}

export interface LearningNotificationsHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly notifications: ReturnType<typeof createLearningNotifications>;
  root(): HudElement;
  items(): HudElement[];
  itemFor(eventId: string): HudElement;
  summary(): HudElement;
  missingOf(eventId: string): HudElement[];
  dom(): string;
}

export function createLearningNotificationsHarness(
  options: LearningNotificationsOptions = {},
): LearningNotificationsHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    notifications = createLearningNotifications(host as unknown as HTMLElement, options),
    requireRoot = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('Learning notification root is missing');
      return element;
    },
    items = (): HudElement[] => {
      const list = requireRoot().children.find((child) => child.tagName === 'ol');
      if (!list) throw new Error('Learning notification list is missing');
      return list.children;
    },
    itemFor = (eventId: string): HudElement => {
      for (const item of items()) if (item.getAttribute('data-event') === eventId) return item;
      throw new Error(`Learning notification is missing: ${eventId}`);
    },
    summary = (): HudElement => {
      const paragraph = requireRoot().children.find((child) => child.tagName === 'p');
      if (!paragraph) throw new Error('Learning notification summary is missing');
      return paragraph;
    },
    missingOf = (eventId: string): HudElement[] => {
      const item = itemFor(eventId),
        list = item.children.find((child) => child.className.endsWith('__missing'));
      return list ? list.children : [];
    };
  return {
    doc,
    host,
    notifications,
    root: requireRoot,
    items,
    itemFor,
    summary,
    missingOf,
    dom: () => serializeHud(requireRoot()),
  };
}
