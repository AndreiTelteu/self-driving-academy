import type {
  ConfidenceCandidate,
  LearningJob,
  ParameterEvidenceReadModel,
  ProfileBlendEpisode,
} from '../../src/learning';
import type { ParameterKey } from '../../src/profiles';

/** Stable synthetic learning identity; no world/Babylon dependency. */
export const learningTestIdentity = Object.freeze({
  playerId: 'player-1',
  profileId: 'profile-1',
  learningEpoch: 1,
  baseVersionId: 'profile-v1',
  sessionId: 'session-1',
  worldEpoch: 1,
});

export function learningEvidence(
  key: ParameterKey,
  distinctEpisodes = 16,
  status: ParameterEvidenceReadModel['status'] = 'READY',
): ParameterEvidenceReadModel {
  return {
    key,
    status,
    distinctEpisodes,
    contextBreakdown: [],
    sampleCount: distinctEpisodes,
    quality: status === 'READY' ? 1 : 0,
    uncertainty: status === 'READY' ? 'MODERATE' : 'HIGH',
    unchanged: true,
    noEstimate:
      status === 'NO_EVIDENCE'
        ? 'NO_QUALIFYING_EVIDENCE'
        : status === 'INSUFFICIENT'
          ? 'INSUFFICIENT_DISTINCT_EPISODES_OR_VARIATION'
          : null,
  } as ParameterEvidenceReadModel;
}

export function learningEpisodes(
  count: number,
  value: number,
  idPrefix = 'occ',
): ProfileBlendEpisode[] {
  return Array.from({ length: count }, (_, index) => ({
    opportunityId: `${idPrefix}-${index + 1}`,
    occurrence: 1,
    observedTicks: 600,
    ageSeconds: 0,
    value,
  }));
}

export function learningCandidate(key: ParameterKey, value: number | null): ConfidenceCandidate {
  return { key, status: 'CANDIDATE', value };
}

export interface LearningJobOptions {
  readonly segmentId: string;
  readonly order: number;
  readonly key?: ParameterKey;
  readonly candidateValue?: number;
  readonly baseValue?: number;
  readonly episodeCount?: number;
  readonly playerId?: string;
  readonly profileId?: string;
  readonly learningEpoch?: number;
  readonly baseVersionId?: string;
  readonly mode?: LearningJob['mode'];
  readonly eligible?: boolean;
}

/** Builds one job with 16 repeated episodes, which yields the 101 maximum weight of 0.6. */
export function learningTestJob(options: LearningJobOptions): LearningJob {
  const key = options.key ?? 'speed_delta_urban';
  const candidateValue = options.candidateValue ?? 4;
  const episodeCount = options.episodeCount ?? 16;
  return {
    playerId: options.playerId ?? learningTestIdentity.playerId,
    profileId: options.profileId ?? learningTestIdentity.profileId,
    learningEpoch: options.learningEpoch ?? learningTestIdentity.learningEpoch,
    baseVersionId: options.baseVersionId ?? learningTestIdentity.baseVersionId,
    segmentId: options.segmentId,
    mode: options.mode ?? 'LEARNING',
    eligible: options.eligible ?? true,
    order: options.order,
    sessionId: learningTestIdentity.sessionId,
    worldEpoch: learningTestIdentity.worldEpoch,
    key,
    baseValue: options.baseValue ?? 1.5,
    evidence: learningEvidence(key, episodeCount),
    episodes: learningEpisodes(episodeCount, candidateValue, options.segmentId),
    candidate: learningCandidate(key, candidateValue),
  };
}
