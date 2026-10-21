import {
  DEFAULT_FLEET_COUNTS,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { FleetRegistry, ProfileActivation } from '../../src/fleet';
import { createCandidateProfileStore } from '../../src/learning';
import type { LearningSegmentMode } from '../../src/learning';
import type { ParameterKey, ProfileDeltaValidator, ProfileStore } from '../../src/profiles';
import {
  createProfilePipeline,
  type ProfileLearningSegment,
  type ProfilePipeline,
  type ProfilePipelineContinuity,
  type ProfileSegmentSource,
} from '../../src/app';
import { createLearningQueueHarness, type LearningQueueHarness } from './learning-queue-harness';
import {
  learningCandidate,
  learningEpisodes,
  learningEvidence,
} from './learning-estimator-fixture';

/** Stable identity shared by the pipeline fixture, its evidence and its reports. */
export const PIPELINE_ENGINE = 'engine-1';
export const PIPELINE_PROFILE_ID = 'city-profile';
export const PIPELINE_BASE_VERSION = 'profile-v1';
export const PIPELINE_PLAYER_ID = 'player-1';
export const PIPELINE_SESSION_ID = 'session-112';
export const PIPELINE_WORLD_EPOCH = 1;
export const PIPELINE_NOW = '2026-10-21T00:00:00Z';

const BASE_PARAMETERS = Object.freeze({
  speed_delta_urban: 1.5,
  following_time_headway: 1.8,
  stop_full_probability: 0.6,
});

export interface PipelineWorldOptions {
  readonly profileId?: string;
  readonly engineVersion?: string;
  readonly baseVersionId?: string;
  readonly learningEpoch?: number;
  readonly baseParameters?: Readonly<Record<string, number>>;
  /** When false the pipeline runs without the 110 controller. */
  readonly withActivation?: boolean;
  readonly history?: number;
  readonly delta?: ProfileDeltaValidator;
  readonly continuity?: ProfilePipelineContinuity;
  readonly segments?: ProfileSegmentSource;
}

export interface PipelineWorld {
  readonly store: ProfileStore;
  readonly registry: FleetRegistry;
  readonly activation: ProfileActivation;
  readonly pipeline: ProfilePipeline;
  readonly queue: LearningQueueHarness;
  readonly tick: { value: number };
  /** Host tick: increments the fixed clock and returns the new accepted tick. */
  advanceTick(): number;
  /** Current fleet profile versions, sorted and de-duplicated. */
  fleetVersions(): readonly string[];
  dispose(): void;
}

function configuration(profileId: string, baseVersionId: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: PIPELINE_SESSION_ID,
    worldEpoch: PIPELINE_WORLD_EPOCH,
    scenarioId: 'city-fixture',
    seed: 20261021,
    namespace: 'city:harness:pipeline',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId, versionId: baseVersionId },
  };
}

/** Real 103 queue + 109 store + 110 activation, wired exactly like the production composition. */
export function createPipelineWorld(options: PipelineWorldOptions = {}): PipelineWorld {
  const engineVersion = options.engineVersion ?? PIPELINE_ENGINE;
  const profileId = options.profileId ?? PIPELINE_PROFILE_ID;
  const baseVersionId = options.baseVersionId ?? PIPELINE_BASE_VERSION;
  const clock = { value: 0 };
  const store = createCandidateProfileStore({
    engineVersion,
    now: () => PIPELINE_NOW,
  });
  const created = store.createBase({
    profileId,
    versionId: baseVersionId,
    parameters: options.baseParameters ?? BASE_PARAMETERS,
    createdAt: PIPELINE_NOW,
  });
  if (created.status !== 'ACCEPTED')
    throw new Error(`Base version rejected: ${created.rejection.code}`);
  const source = createProfileActivationSource({ profileId, versionId: baseVersionId });
  const registry = createFleetRegistry(configuration(profileId, baseVersionId), {
    profileSource: source,
  });
  const activation = createProfileActivation({
    registry,
    source,
    engineVersion,
    clock: () => clock.value,
    now: () => PIPELINE_NOW,
  });
  const queue = createLearningQueueHarness({ engineVersion });
  const pipeline = createProfilePipeline({
    engineVersion,
    playerId: PIPELINE_PLAYER_ID,
    profileId,
    learningEpoch: options.learningEpoch ?? 1,
    sessionId: PIPELINE_SESSION_ID,
    worldEpoch: PIPELINE_WORLD_EPOCH,
    queue: queue.queue,
    store,
    ...(options.withActivation === false ? {} : { activation }),
    ...(options.delta === undefined ? {} : { delta: options.delta }),
    ...(options.continuity === undefined ? {} : { continuity: options.continuity }),
    ...(options.segments === undefined ? {} : { segments: options.segments }),
    ...(options.history === undefined ? {} : { history: options.history }),
    tick: () => clock.value,
    advanceTick: () => {
      clock.value += 1;
      return clock.value;
    },
  });
  return {
    store,
    registry,
    activation,
    pipeline,
    queue,
    tick: clock,
    advanceTick(): number {
      clock.value += 1;
      return clock.value;
    },
    fleetVersions(): readonly string[] {
      return [
        ...new Set(
          registry
            .list()
            .map((vehicle) => registry.state(vehicle.vehicleId)!.appliedProfileVersion),
        ),
      ].sort();
    },
    dispose(): void {
      pipeline.dispose();
      queue.dispose();
      activation.dispose();
      registry.dispose();
    },
  };
}

export interface PipelineSegmentOptions {
  readonly segmentId: string;
  readonly order: number;
  readonly mode?: LearningSegmentMode;
  readonly eligible?: boolean;
  readonly key?: ParameterKey;
  readonly baseValue?: number;
  readonly candidateValue?: number;
  readonly episodeCount?: number;
  readonly learningEpoch?: number;
  readonly baseVersionId?: string;
  readonly interventionId?: string;
  readonly reason?: string;
}

/** Builds one closed 069/103 segment with real 093/100/101 inputs. */
export function pipelineSegment(options: PipelineSegmentOptions): ProfileLearningSegment {
  const key = options.key ?? 'speed_delta_urban';
  const candidateValue = options.candidateValue ?? 4;
  const episodeCount = options.episodeCount ?? 16;
  return {
    segmentId: options.segmentId,
    mode: options.mode ?? 'LEARNING',
    eligible: options.eligible ?? true,
    order: options.order,
    key,
    baseValue: options.baseValue ?? 1.5,
    evidence: learningEvidence(key, episodeCount),
    episodes: learningEpisodes(episodeCount, candidateValue, options.segmentId),
    candidate: learningCandidate(key, candidateValue),
    ...(options.learningEpoch === undefined ? {} : { learningEpoch: options.learningEpoch }),
    ...(options.baseVersionId === undefined ? {} : { baseVersionId: options.baseVersionId }),
    ...(options.interventionId === undefined ? {} : { interventionId: options.interventionId }),
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  };
}

/** The 101 fold with 16 repeated episodes: weight 0.6, so this is the accepted composition value. */
export function pipelineFold(base: number, estimate: number): number {
  return Math.round((base + 0.6 * (estimate - base)) * 1e4) / 1e4;
}
