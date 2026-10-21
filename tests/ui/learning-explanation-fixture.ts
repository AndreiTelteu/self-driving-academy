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
import { createLearningExplanationPanel } from '../../src/ui';
import type { LearningExplanationPanelOptions, LearningExplanationSnapshot } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

export const EXPLANATION_SESSION = 'session:104';
export const EXPLANATION_WORLD_EPOCH = 2;
export const EXPLANATION_ENGINE = 'engine:104.1';

export const HEADWAY_EPISODES = Object.freeze([
  Object.freeze({
    opportunityId: 'opp:104:headway:a',
    occurrence: 0,
    observedTicks: 90,
    value: 1.7,
    speedMps: 4,
    ageSeconds: 30,
  }),
  Object.freeze({
    opportunityId: 'opp:104:headway:b',
    occurrence: 0,
    observedTicks: 120,
    value: 1.5,
    speedMps: 12,
    ageSeconds: 60,
  }),
  Object.freeze({
    opportunityId: 'opp:104:headway:c',
    occurrence: 0,
    observedTicks: 150,
    value: 1.4,
    speedMps: 18,
    ageSeconds: 90,
  }),
]);

export const STOP_EPISODES = Object.freeze([
  Object.freeze({
    opportunityId: 'opp:104:stop:a',
    occurrence: 0,
    observedTicks: 60,
    ageSeconds: 30,
  }),
  Object.freeze({
    opportunityId: 'opp:104:stop:b',
    occurrence: 0,
    observedTicks: 60,
    ageSeconds: 60,
  }),
  Object.freeze({
    opportunityId: 'opp:104:stop:c',
    occurrence: 0,
    observedTicks: 60,
    ageSeconds: 90,
  }),
]);

/** A real 093 read model with its real context breakdown. */
export function explanationEvidence(
  key: string,
  status: ParameterEvidenceReadModel['status'],
  distinctEpisodes: number,
  contexts: readonly string[] = status === 'NO_EVIDENCE' ? [] : ['LEADER'],
): ParameterEvidenceReadModel {
  return Object.freeze({
    key: key as ParameterEvidenceReadModel['key'],
    status,
    distinctEpisodes,
    contextBreakdown: Object.freeze(
      contexts.map((label) =>
        Object.freeze({ label, roadType: 'urban', speedBand: 'MID', episodes: distinctEpisodes }),
      ),
    ),
    sampleCount: distinctEpisodes * 60,
    quality: status === 'READY' ? 1 : 0,
    uncertainty: status === 'READY' ? 'MODERATE' : distinctEpisodes === 0 ? 'NONE' : 'HIGH',
    unchanged: true,
    noEstimate: status === 'READY' ? null : 'NO_QUALIFYING_EVIDENCE',
  });
}

export interface ExplanationJobOverrides {
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
  readonly evidence?: ParameterEvidenceReadModel;
  readonly episodes?: LearningJob['episodes'];
  readonly candidate?: LearningJob['candidate'];
}

/** One real 103 learning job. Defaults: `following_time_headway`, 1.8 s base, three episodes. */
export function explanationJob(overrides: ExplanationJobOverrides = {}): LearningJob {
  const key = overrides.key ?? 'following_time_headway',
    definition = getParameterDefinition(key),
    episodes: LearningJob['episodes'] =
      overrides.episodes ?? (key === 'stop_full_probability' ? STOP_EPISODES : HEADWAY_EPISODES),
    evidence =
      overrides.evidence ??
      explanationEvidence(key, 'READY', episodes.length, [
        key === 'stop_full_probability' ? 'FREE_TRAFFIC' : 'LEADER',
      ]);
  return Object.freeze({
    playerId: 'player:104',
    profileId: overrides.profileId ?? 'style:104',
    learningEpoch: overrides.learningEpoch ?? 4,
    baseVersionId: overrides.baseVersionId ?? 'style:104:v2',
    segmentId: overrides.segmentId ?? 'segment:104:headway',
    mode: overrides.mode ?? 'LEARNING',
    eligible: true,
    order: overrides.order ?? 7,
    sessionId: overrides.sessionId ?? EXPLANATION_SESSION,
    worldEpoch: overrides.worldEpoch ?? EXPLANATION_WORLD_EPOCH,
    key,
    baseValue: overrides.baseValue ?? definition.default,
    evidence,
    episodes,
    candidate:
      overrides.candidate ??
      Object.freeze({ key, status: 'CANDIDATE', value: definition.default, interval: null }),
  });
}

/** A job whose real estimator candidate is `value`; used to keep the 100 state truthful. */
export function withEstimate(job: LearningJob, value: number | null): LearningJob {
  return Object.freeze({
    ...job,
    candidate: Object.freeze({ ...job.candidate, value }),
  });
}

/** A job with no eligible evidence at all: `UNOBSERVED`, not a fabricated zero. */
export function noEvidenceJob(overrides: ExplanationJobOverrides = {}): LearningJob {
  const key = overrides.key ?? 'following_time_headway';
  return explanationJob({
    ...overrides,
    evidence: explanationEvidence(key, 'NO_EVIDENCE', 0, []),
    episodes: Object.freeze([]),
    candidate: Object.freeze({ key, status: 'NO_DATA', value: null, interval: null }),
  });
}

/** A job below the evidence threshold: `WEAK`, distinct from both zero and unobserved. */
export function weakEvidenceJob(overrides: ExplanationJobOverrides = {}): LearningJob {
  const key = overrides.key ?? 'following_time_headway';
  return explanationJob({
    ...overrides,
    evidence: explanationEvidence(key, 'INSUFFICIENT', 2),
    episodes: HEADWAY_EPISODES.slice(0, 2),
    candidate: Object.freeze({ key, status: 'CANDIDATE', value: 1.5, interval: null }),
  });
}

/** A ready job whose read model carries no context breakdown: the context is genuinely missing. */
export function noContextJob(overrides: ExplanationJobOverrides = {}): LearningJob {
  return explanationJob({
    ...overrides,
    evidence: explanationEvidence(overrides.key ?? 'following_time_headway', 'READY', 3, []),
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
export function explanationOutcome(job: LearningJob, value: number): LearningJobOutcome {
  const definition = getParameterDefinition(job.key),
    profileVersionId = `${job.baseVersionId}~103.${job.order}`,
    validation = validateCandidateDelta(
      {
        profileVersionId,
        parentVersionId: job.baseVersionId,
        engineVersion: EXPLANATION_ENGINE,
        schemaVersion: 1,
        units: 'SI',
        values: [{ key: job.key, value, unit: definition.unit }],
      },
      { baseVersionId: job.baseVersionId, engineVersion: EXPLANATION_ENGINE },
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
export function explanationFailure(
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

/** The producer frame of an accepted snapshot, for negative parser cases. */
export function frameOf(snapshot: LearningExplanationSnapshot) {
  const { version, summary, signature, ...frame } = snapshot;
  void version;
  void summary;
  void signature;
  return frame;
}

export interface LearningExplanationHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly panel: ReturnType<typeof createLearningExplanationPanel>;
  root(): HudElement;
  section(className: string): HudElement;
  rows(): HudElement[];
  rowFor(key: string): HudElement;
  fieldOf(key: string, caption: string): HudElement;
  missingItems(): HudElement[];
  versionLine(): HudElement;
  noChange(): HudElement;
  failure(): HudElement;
  summary(): HudElement;
  identityValue(caption: string): HudElement;
  dom(): string;
}

export function createLearningExplanationHarness(
  options: LearningExplanationPanelOptions = {},
): LearningExplanationHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    panel = createLearningExplanationPanel(host as unknown as HTMLElement, options),
    requireRoot = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('Learning explanation root is missing');
      return element;
    },
    section = (className: string): HudElement => {
      for (const child of requireRoot().children) {
        if (child.className === `learning-explanation__${className}`) return child;
      }
      throw new Error(`Learning explanation section is missing: ${className}`);
    },
    rows = (): HudElement[] => {
      const list = section('changes').children.find((child) => child.tagName === 'ul');
      if (!list) throw new Error('Learning explanation rows are missing');
      return list.children;
    },
    rowFor = (key: string): HudElement => {
      for (const row of rows()) if (row.getAttribute('data-key') === key) return row;
      throw new Error(`Learning explanation row is missing: ${key}`);
    },
    fieldOf = (key: string, caption: string): HudElement => {
      const list = rowFor(key).children[0];
      if (!list) throw new Error('Learning explanation row fields are missing');
      for (let index = 0; index < list.children.length; index += 2) {
        if (list.children[index]!.textContent === caption) return list.children[index + 1]!;
      }
      throw new Error(`Learning explanation field is missing: ${caption}`);
    },
    identityValue = (caption: string): HudElement => {
      const identity = section('identity');
      for (let index = 0; index < identity.children.length; index += 2) {
        if (identity.children[index]!.textContent === caption) return identity.children[index + 1]!;
      }
      throw new Error(`Learning explanation identity is missing: ${caption}`);
    };
  return {
    doc,
    host,
    panel,
    root: requireRoot,
    section,
    rows,
    rowFor,
    fieldOf,
    identityValue,
    missingItems: () => {
      const list = section('missing-section').children.find((child) => child.tagName === 'ul');
      return list ? list.children : [];
    },
    versionLine: () => section('version'),
    noChange: () => section('no-change'),
    failure: () => section('failure'),
    summary: () => section('summary'),
    dom: () => serializeHud(requireRoot()),
  };
}
