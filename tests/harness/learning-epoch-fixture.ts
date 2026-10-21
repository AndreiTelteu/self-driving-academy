import { createLearningEpochBarrier } from '../../src/app';
import type { LearningEpochBarrier, LearningEpochSegmentPort } from '../../src/app';
import type { LearningQueueHarness } from './learning-queue-harness';
import type { FleetRegistry, ProfileActivation } from '../../src/fleet';
import { getParameterDefinition } from '../../src/profiles';
import type { ProfileStore } from '../../src/profiles';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PLAYER_ID,
  PIPELINE_PROFILE_ID,
  PIPELINE_SESSION_ID,
  PIPELINE_WORLD_EPOCH,
  createPipelineWorld,
  pipelineSegment,
} from './profile-pipeline-fixture';

/** One segment as the host 069 binding would report it. Physical state is tracked separately. */
export interface LearningEpochSegmentRecord {
  readonly segmentId: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly openedTick: number;
  readonly closedTick: number | null;
  readonly closeReason: 'PROFILE_CHANGE' | null;
  readonly status: 'OPEN' | 'CLOSED';
}

export interface LearningEpochSegments {
  readonly port: LearningEpochSegmentPort;
  readonly records: readonly LearningEpochSegmentRecord[];
  readonly physical: { x: number; speed: number; heading: number };
  readonly closeCalls: () => number;
  readonly openCalls: () => number;
  /** Simulates a host that moves the body during the rotation (must be detected). */
  readonly mutatePhysical: () => void;
}

export interface EpochWorldOptions {
  readonly learningEpoch?: number;
  readonly history?: number;
  readonly targetVersionId?: string;
  readonly nextVersionId?: string;
  /** Derives `profile-v2`/`profile-v3`; disable when the caller only needs a rollback. */
  readonly withTargets?: boolean;
  readonly currentSegmentId?: string;
  readonly mutatePhysicalOnClose?: boolean;
}

export interface EpochWorld {
  readonly store: ProfileStore;
  readonly activation: ProfileActivation;
  readonly registry: FleetRegistry;
  readonly queue: LearningQueueHarness;
  readonly tick: { value: number };
  readonly barrier: LearningEpochBarrier;
  readonly segments: LearningEpochSegments;
  readonly targetVersionId: string;
  readonly nextVersionId: string;
  advanceTick(): number;
  fleetVersions(): readonly string[];
  /** A real 103 job payload for the current fixture identity. */
  job(overrides: {
    readonly segmentId: string;
    readonly order: number;
    readonly learningEpoch?: number;
    readonly baseVersionId?: string;
    readonly playerId?: string;
    readonly profileId?: string;
    readonly sessionId?: string;
    readonly worldEpoch?: number;
  }): Record<string, unknown>;
  dispose(): void;
}

function deriveVersion(
  store: ProfileStore,
  versionId: string,
  parentVersionId: string,
  value: number,
): void {
  const definition = getParameterDefinition('speed_delta_urban');
  const derived = store.derive({
    profileId: PIPELINE_PROFILE_ID,
    versionId,
    parentVersionId,
    segmentId: `fixture-${versionId}`,
    reason: 'fixture target version',
    delta: {
      profileVersionId: versionId,
      parentVersionId,
      engineVersion: PIPELINE_ENGINE,
      schemaVersion: 1,
      units: 'SI',
      values: [{ key: definition.key, unit: definition.unit, value }],
    },
  });
  if (derived.status !== 'ACCEPTED')
    throw new Error(`Fixture version ${versionId} rejected: ${derived.rejection.code}`);
}

function createSegments(
  initial: Omit<LearningEpochSegmentRecord, 'status' | 'closedTick' | 'closeReason'>,
  mutatePhysicalOnClose: boolean,
): LearningEpochSegments {
  const records: LearningEpochSegmentRecord[] = [
    { ...initial, status: 'OPEN', closedTick: null, closeReason: null },
  ];
  const physical = { x: 12, speed: 9.5, heading: 0.25 };
  let closeCalls = 0;
  let openCalls = 0;

  function currentRecord(segmentId: string): LearningEpochSegmentRecord | null {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (record.segmentId === segmentId) return record;
    }
    return null;
  }

  const port: LearningEpochSegmentPort = {
    physical: () => JSON.stringify([physical.x, physical.speed, physical.heading]),
    close(request) {
      closeCalls += 1;
      const record = currentRecord(request.segmentId);
      if (record === null || record.status !== 'OPEN')
        throw new Error(`Cannot close segment ${request.segmentId}`);
      const index = records.indexOf(record);
      records[index] = {
        ...record,
        status: 'CLOSED',
        closedTick: request.tick,
        closeReason: request.reason,
      };
      if (mutatePhysicalOnClose) physical.speed += 0.5;
      return Object.freeze({
        segmentId: request.segmentId,
        status: 'CLOSED' as const,
        reason: request.reason,
        tick: request.tick,
      });
    },
    open(request) {
      openCalls += 1;
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
      return Object.freeze({
        segmentId: request.segmentId,
        status: 'OPEN' as const,
        tick: request.tick,
      });
    },
  };

  return {
    port,
    records,
    physical,
    closeCalls: () => closeCalls,
    openCalls: () => openCalls,
    mutatePhysical: () => {
      physical.speed += 1;
    },
  };
}

/** Real 103 harness + real 109 store + real 110 controller + an in-memory 069 segment binding. */
export function createEpochWorld(options: EpochWorldOptions = {}): EpochWorld {
  const learningEpoch = options.learningEpoch ?? 1;
  const base = createPipelineWorld({ learningEpoch });
  const targetVersionId = options.targetVersionId ?? 'profile-v2';
  const nextVersionId = options.nextVersionId ?? 'profile-v3';
  if (options.withTargets !== false) {
    deriveVersion(base.store, targetVersionId, PIPELINE_BASE_VERSION, 2.5);
    deriveVersion(base.store, nextVersionId, targetVersionId, 3.5);
  }
  const currentSegmentId = options.currentSegmentId ?? 'segment-g1';
  const segments = createSegments(
    {
      segmentId: currentSegmentId,
      playerId: PIPELINE_PLAYER_ID,
      profileId: PIPELINE_PROFILE_ID,
      learningEpoch,
      baseVersionId: PIPELINE_BASE_VERSION,
      openedTick: base.tick.value,
    },
    options.mutatePhysicalOnClose ?? false,
  );
  const barrier = createLearningEpochBarrier({
    playerId: PIPELINE_PLAYER_ID,
    profileId: PIPELINE_PROFILE_ID,
    engineVersion: PIPELINE_ENGINE,
    learningEpoch,
    baseVersionId: PIPELINE_BASE_VERSION,
    segmentId: currentSegmentId,
    openedTick: base.tick.value,
    queue: base.queue.queue,
    store: base.store,
    activation: base.activation,
    segments: segments.port,
    tick: () => base.tick.value,
    ...(options.history === undefined ? {} : { history: options.history }),
  });
  return {
    store: base.store,
    activation: base.activation,
    registry: base.registry,
    queue: base.queue,
    tick: base.tick,
    barrier,
    segments,
    targetVersionId,
    nextVersionId,
    advanceTick: () => base.advanceTick(),
    fleetVersions: () => base.fleetVersions(),
    job(overrides) {
      const segment = pipelineSegment({
        segmentId: overrides.segmentId,
        order: overrides.order,
      });
      return {
        playerId: overrides.playerId ?? PIPELINE_PLAYER_ID,
        profileId: overrides.profileId ?? PIPELINE_PROFILE_ID,
        learningEpoch: overrides.learningEpoch ?? learningEpoch,
        baseVersionId: overrides.baseVersionId ?? PIPELINE_BASE_VERSION,
        segmentId: segment.segmentId,
        mode: segment.mode,
        eligible: segment.eligible,
        order: segment.order,
        sessionId: overrides.sessionId ?? PIPELINE_SESSION_ID,
        worldEpoch: overrides.worldEpoch ?? PIPELINE_WORLD_EPOCH,
        key: segment.key,
        baseValue: segment.baseValue,
        evidence: segment.evidence,
        episodes: segment.episodes,
        candidate: segment.candidate,
      };
    },
    dispose(): void {
      barrier.dispose();
      base.dispose();
    },
  };
}
