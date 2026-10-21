import {
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { FleetRegistry, ProfileActivation } from '../../src/fleet';
import { createLearningEpochBarrier } from '../../src/app';
import type {
  LearningEpochBarrier,
  LearningEpochSegmentPort,
  ProfileRestoreBarrierInput,
  ProfileRestoreProgressionPorts,
  ProfileRestoreServices,
} from '../../src/app';
import { parameterDefinitions } from '../../src/profiles';
import type { ProfileStore, ProfileVersion } from '../../src/profiles';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PLAYER_ID,
  PIPELINE_PROFILE_ID,
  PIPELINE_SESSION_ID,
  PIPELINE_WORLD_EPOCH,
  createPipelineWorld,
  pipelineSegment,
} from '../harness/profile-pipeline-fixture';
import type { LearningQueueHarness } from '../harness/learning-queue-harness';

export const RESTORE_TARGET = 'profile-v2';
export const RESTORE_OTHER = 'profile-v3';
export const RESTORE_IMPORTED = 'import-v4';
export const RESTORE_SECOND_PROFILE = 'profile-b';
export const RESTORE_NOW = '2026-10-21T00:00:00Z';

export interface RestoreSegmentRecord {
  readonly segmentId: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly openedTick: number;
  readonly status: 'OPEN' | 'CLOSED';
  readonly closeReason: 'PROFILE_CHANGE' | null;
}

export interface RestoreSegments {
  readonly port: LearningEpochSegmentPort;
  readonly records: readonly RestoreSegmentRecord[];
  readonly physical: { x: number; speed: number; heading: number };
  readonly closeCalls: () => number;
  readonly openCalls: () => number;
}

export interface RestoreProgressionSpy extends ProfileRestoreProgressionPorts {
  readonly calls: () => number;
  readonly names: () => readonly string[];
}

export interface ProfileRestoreWorld {
  readonly store: ProfileStore;
  readonly activation: ProfileActivation;
  readonly registry: FleetRegistry;
  readonly queue: LearningQueueHarness;
  readonly tick: { value: number };
  readonly barrier: LearningEpochBarrier;
  readonly segments: RestoreSegments;
  readonly services: ProfileRestoreServices;
  readonly progression: RestoreProgressionSpy;
  readonly targetVersionId: string;
  readonly otherVersionId: string;
  readonly baseVersionId: string;
  readonly otherProfileVersionId: string;
  advanceTick(): number;
  fleetVersions(): readonly string[];
  versions(profileId?: string): readonly string[];
  checksums(profileId?: string): readonly string[];
  job(overrides: { readonly segmentId: string; readonly order: number }): Record<string, unknown>;
  importedProfile(overrides?: {
    readonly versionId?: string;
    readonly profileId?: string;
    readonly engineVersion?: string;
    readonly parameters?: Readonly<Record<string, number>>;
    readonly checksum?: string;
  }): Record<string, unknown>;
  dispose(): void;
}

function configuration(
  base: FleetRegistry,
  profileId: string,
  versionId: string,
): Record<string, unknown> {
  return {
    ...base.configuration,
    profile: { profileId, versionId },
  };
}

function createSegments(
  initial: Omit<RestoreSegmentRecord, 'status' | 'closeReason'>,
): RestoreSegments {
  const records: RestoreSegmentRecord[] = [{ ...initial, status: 'OPEN', closeReason: null }];
  const physical = { x: 12, speed: 9.5, heading: 0.25 };
  let closeCalls = 0;
  let openCalls = 0;

  function find(segmentId: string): RestoreSegmentRecord | null {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (records[index].segmentId === segmentId) return records[index];
    }
    return null;
  }

  const port: LearningEpochSegmentPort = {
    physical: () => JSON.stringify([physical.x, physical.speed, physical.heading]),
    close(request) {
      closeCalls += 1;
      const record = find(request.segmentId);
      if (record === null || record.status !== 'OPEN')
        throw new Error(`Cannot close segment ${request.segmentId}`);
      records[records.indexOf(record)] = {
        ...record,
        status: 'CLOSED',
        closeReason: request.reason,
        openedTick: record.openedTick,
      };
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
        status: 'OPEN',
        closeReason: null,
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
  };
}

function deriveVersion(
  store: ProfileStore,
  versionId: string,
  parentVersionId: string,
  value: number,
): void {
  const definition = parameterDefinitions.find((entry) => entry.key === 'speed_delta_urban');
  if (definition === undefined) throw new Error('Missing speed_delta_urban definition');
  const derived = store.derive({
    profileId: PIPELINE_PROFILE_ID,
    versionId,
    parentVersionId,
    segmentId: `fixture-${versionId}`,
    reason: 'fixture version',
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

function importedPayload(
  store: ProfileStore,
  base: ProfileVersion,
  overrides: {
    readonly versionId?: string;
    readonly profileId?: string;
    readonly engineVersion?: string;
    readonly parameters?: Readonly<Record<string, number>>;
    readonly checksum?: string;
  } = {},
): Record<string, unknown> {
  const profileId = overrides.profileId ?? base.profileId;
  const parameters = overrides.parameters ?? {
    speed_delta_urban: 2.75,
    following_time_headway: 2.2,
  };
  const unitsByParameter: Record<string, string> = Object.create(null);
  const provenanceByParameter: Record<string, string> = Object.create(null);
  const evidenceByParameter: Record<string, null> = Object.create(null);
  for (const key of Object.keys(parameters)) {
    const definition = parameterDefinitions.find((entry) => entry.key === key);
    if (definition === undefined) throw new Error(`Unknown import key: ${key}`);
    unitsByParameter[key] = definition.unit;
    provenanceByParameter[key] = 'IMPORTED';
    evidenceByParameter[key] = null;
  }
  const versionId = overrides.versionId ?? RESTORE_IMPORTED;
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId,
    parentVersionId: base.versionId,
    engineVersion: overrides.engineVersion ?? store.engineVersion,
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [],
    createdAt: RESTORE_NOW,
    checksum: overrides.checksum ?? `import:${versionId}`,
  };
}

/** Real 103 queue + real 109 store + real 110 activation(s) + in-memory 069 segment port. */
export function createProfileRestoreWorld(): ProfileRestoreWorld {
  const pipeline = createPipelineWorld({ learningEpoch: 1 });
  deriveVersion(pipeline.store, RESTORE_TARGET, PIPELINE_BASE_VERSION, 2.5);
  deriveVersion(pipeline.store, RESTORE_OTHER, RESTORE_TARGET, 3.5);

  const otherProfileBase = pipeline.store.createBase({
    profileId: RESTORE_SECOND_PROFILE,
    versionId: 'base-profile-b',
    parameters: { speed_delta_urban: 1.25 },
    createdAt: RESTORE_NOW,
  });
  if (otherProfileBase.status !== 'ACCEPTED')
    throw new Error(`Second profile base rejected: ${otherProfileBase.rejection.code}`);

  const segments = createSegments({
    segmentId: 'segment-g1',
    playerId: PIPELINE_PLAYER_ID,
    profileId: PIPELINE_PROFILE_ID,
    learningEpoch: 1,
    baseVersionId: PIPELINE_BASE_VERSION,
    openedTick: pipeline.tick.value,
  });
  const progressionCalls: string[] = [];
  const progression: RestoreProgressionSpy = {
    awardXp: () => progressionCalls.push('awardXp'),
    completeMission: () => progressionCalls.push('completeMission'),
    resetProgress: () => progressionCalls.push('resetProgress'),
    mutate: () => progressionCalls.push('mutate'),
    calls: () => progressionCalls.length,
    names: () => Object.freeze([...progressionCalls]),
  };

  const barrier = createLearningEpochBarrier({
    playerId: PIPELINE_PLAYER_ID,
    profileId: PIPELINE_PROFILE_ID,
    engineVersion: PIPELINE_ENGINE,
    learningEpoch: 1,
    baseVersionId: PIPELINE_BASE_VERSION,
    segmentId: 'segment-g1',
    openedTick: pipeline.tick.value,
    queue: pipeline.queue.queue,
    store: pipeline.store,
    activation: pipeline.activation,
    segments: segments.port,
    tick: () => pipeline.tick.value,
  });

  const extraBarriers = new Map<string, LearningEpochBarrier>();
  const extraActivations: ProfileActivation[] = [];
  const extraRegistries: FleetRegistry[] = [];
  const extraSegments: RestoreSegments[] = [];

  function barrierFor(input: ProfileRestoreBarrierInput): LearningEpochBarrier {
    const key = `${input.profileId}|${input.fromVersionId}`;
    const cached = extraBarriers.get(key);
    if (cached !== undefined) return cached;
    const source = createProfileActivationSource({
      profileId: input.profileId,
      versionId: input.fromVersionId,
    });
    const registry = createFleetRegistry(
      configuration(pipeline.registry, input.profileId, input.fromVersionId),
      { profileSource: source },
    );
    const activation = createProfileActivation({
      registry,
      source,
      engineVersion: PIPELINE_ENGINE,
      clock: () => pipeline.tick.value,
      now: () => RESTORE_NOW,
    });
    const extra = createSegments({
      segmentId: input.segmentId,
      playerId: input.playerId,
      profileId: input.profileId,
      learningEpoch: 1,
      baseVersionId: input.fromVersionId,
      openedTick: input.openedTick,
    });
    const created = createLearningEpochBarrier({
      playerId: input.playerId,
      profileId: input.profileId,
      engineVersion: PIPELINE_ENGINE,
      learningEpoch: 1,
      baseVersionId: input.fromVersionId,
      segmentId: input.segmentId,
      openedTick: input.openedTick,
      queue: pipeline.queue.queue,
      store: pipeline.store,
      activation,
      segments: extra.port,
      tick: () => pipeline.tick.value,
    });
    extraBarriers.set(key, created);
    extraActivations.push(activation);
    extraRegistries.push(registry);
    extraSegments.push(extra);
    return created;
  }

  const services: ProfileRestoreServices = {
    playerId: PIPELINE_PLAYER_ID,
    profileId: PIPELINE_PROFILE_ID,
    engineVersion: PIPELINE_ENGINE,
    store: pipeline.store,
    barrier,
    activation: pipeline.activation,
    barrierFor,
    progression,
    tick: () => pipeline.tick.value,
    now: () => RESTORE_NOW,
  };

  return {
    store: pipeline.store,
    activation: pipeline.activation,
    registry: pipeline.registry,
    queue: pipeline.queue,
    tick: pipeline.tick,
    barrier,
    segments,
    services,
    progression,
    targetVersionId: RESTORE_TARGET,
    otherVersionId: RESTORE_OTHER,
    baseVersionId: PIPELINE_BASE_VERSION,
    otherProfileVersionId: 'base-profile-b',
    advanceTick: () => pipeline.advanceTick(),
    fleetVersions: () => pipeline.fleetVersions(),
    versions(profileId = PIPELINE_PROFILE_ID) {
      return Object.freeze(pipeline.store.listVersions(profileId).map((entry) => entry.versionId));
    },
    checksums(profileId = PIPELINE_PROFILE_ID) {
      return Object.freeze(pipeline.store.listVersions(profileId).map((entry) => entry.checksum));
    },
    job(overrides) {
      const segment = pipelineSegment({
        segmentId: overrides.segmentId,
        order: overrides.order,
      });
      return {
        playerId: PIPELINE_PLAYER_ID,
        profileId: PIPELINE_PROFILE_ID,
        learningEpoch: 1,
        baseVersionId: PIPELINE_BASE_VERSION,
        segmentId: segment.segmentId,
        mode: segment.mode,
        eligible: segment.eligible,
        order: segment.order,
        sessionId: PIPELINE_SESSION_ID,
        worldEpoch: PIPELINE_WORLD_EPOCH,
        key: segment.key,
        baseValue: segment.baseValue,
        evidence: segment.evidence,
        episodes: segment.episodes,
        candidate: segment.candidate,
      };
    },
    importedProfile(overrides) {
      return importedPayload(
        pipeline.store,
        pipeline.store.getVersion(PIPELINE_BASE_VERSION) as ProfileVersion,
        overrides,
      );
    },
    dispose(): void {
      barrier.dispose();
      for (const entry of extraBarriers.values()) entry.dispose();
      for (const entry of extraActivations) entry.dispose();
      for (const entry of extraRegistries) entry.dispose();
      pipeline.dispose();
    },
  };
}
