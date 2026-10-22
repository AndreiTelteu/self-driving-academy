import {
  DEFAULT_FLEET_COUNTS,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { FleetRegistry, ProfileActivation } from '../../src/fleet';
import {
  createLearningEpochBarrier,
  createStyleSlidersSession,
  restoreVersion,
} from '../../src/app';
import type {
  LearningEpochBarrier,
  LearningEpochSegmentPort,
  ProfileRestoreProgressionPorts,
  ProfileRestoreServices,
  StyleSlidersSession,
  StyleSlidersTarget,
} from '../../src/app';
import { STYLE_SLIDER_PARAMETER_KEYS } from '../../src/ui';
import { getParameterDefinition } from '../../src/profiles';
import type { ProfileStore } from '../../src/profiles';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PLAYER_ID,
  PIPELINE_PROFILE_ID,
  PIPELINE_WORLD_EPOCH,
  pipelineSegment,
} from '../harness/profile-pipeline-fixture';
import type { LearningQueueHarness } from '../harness/learning-queue-harness';
import { createLearningQueueHarness } from '../harness/learning-queue-harness';
import { createCandidateProfileStore } from '../../src/learning';

export const STYLE_NOW = '2026-10-22T00:00:00Z';
export const STYLE_ACADEMIA_SESSION = 'session-academia';
export const STYLE_HAOS_SESSION = 'session-haos';
export const STYLE_HAOS_PROFILE = 'haos-profile';

/** Real 092 defaults of the eight tuning keys, so every slider is available. */
export function styleBaseParameters(): Readonly<Record<string, number>> {
  const parameters: Record<string, number> = {};
  for (const key of STYLE_SLIDER_PARAMETER_KEYS)
    parameters[key] = getParameterDefinition(key).default;
  return Object.freeze(parameters);
}

export interface StyleSegmentRecord {
  readonly segmentId: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly openedTick: number;
  readonly status: 'OPEN' | 'CLOSED';
  readonly closeReason: 'PROFILE_CHANGE' | null;
}

export interface StyleSegments {
  readonly port: LearningEpochSegmentPort;
  readonly records: readonly StyleSegmentRecord[];
  readonly physical: { x: number; speed: number; heading: number };
  readonly closeCalls: () => number;
  readonly openCalls: () => number;
}

function createSegments(
  initial: Omit<StyleSegmentRecord, 'status' | 'closeReason'>,
): StyleSegments {
  const records: StyleSegmentRecord[] = [{ ...initial, status: 'OPEN', closeReason: null }];
  const physical = { x: 12, speed: 9.5, heading: 0.25 };
  let closeCalls = 0;
  let openCalls = 0;
  const port: LearningEpochSegmentPort = {
    physical: () => JSON.stringify([physical.x, physical.speed, physical.heading]),
    close(request) {
      closeCalls += 1;
      const record = records.find(
        (entry) => entry.segmentId === request.segmentId && entry.status === 'OPEN',
      );
      if (record === undefined) throw new Error(`Cannot close segment ${request.segmentId}`);
      records[records.indexOf(record)] = {
        ...record,
        status: 'CLOSED',
        closeReason: request.reason,
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
  return { port, records, physical, closeCalls: () => closeCalls, openCalls: () => openCalls };
}

export interface StyleProgressionSpy extends ProfileRestoreProgressionPorts {
  readonly calls: () => number;
}

export interface StyleWorldOptions {
  readonly profileId?: string;
  readonly sessionId?: string;
  readonly worldEpoch?: number;
  readonly baseVersionId?: string;
  readonly learningEpoch?: number;
  readonly baseParameters?: Readonly<Record<string, number>>;
}

export interface StyleWorld {
  readonly store: ProfileStore;
  readonly activation: ProfileActivation;
  readonly registry: FleetRegistry;
  readonly queue: LearningQueueHarness;
  readonly tick: { value: number };
  readonly barrier: LearningEpochBarrier;
  readonly segments: StyleSegments;
  readonly session: StyleSlidersSession;
  readonly restoreServices: ProfileRestoreServices;
  readonly progression: StyleProgressionSpy;
  readonly profileId: string;
  readonly sessionId: string;
  /** Mutable active-session readback, so a test can switch the session like a real host. */
  readonly target: { sessionId: string; worldEpoch: number; profileId: string };
  readonly baseVersionId: string;
  advanceTick(): number;
  fleetVersions(): readonly string[];
  versions(): readonly string[];
  job(segmentId: string, order: number): Record<string, unknown>;
  dispose(): void;
}

function configuration(profileId: string, baseVersionId: string, sessionId: string) {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId,
    worldEpoch: PIPELINE_WORLD_EPOCH,
    scenarioId: 'style-fixture',
    seed: 20261022,
    namespace: 'city:harness:style',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId, versionId: baseVersionId },
  };
}

/** Real 103 queue + real 109 store + real 110 activation + real 205 barrier + in-memory 069. */
export function createStyleWorld(options: StyleWorldOptions = {}): StyleWorld {
  const profileId = options.profileId ?? PIPELINE_PROFILE_ID,
    sessionId = options.sessionId ?? STYLE_ACADEMIA_SESSION,
    baseVersionId = options.baseVersionId ?? PIPELINE_BASE_VERSION,
    learningEpoch = options.learningEpoch ?? 1,
    clock = { value: 0 },
    store = createCandidateProfileStore({ engineVersion: PIPELINE_ENGINE, now: () => STYLE_NOW }),
    created = store.createBase({
      profileId,
      versionId: baseVersionId,
      parameters: options.baseParameters ?? styleBaseParameters(),
      createdAt: STYLE_NOW,
    });
  if (created.status !== 'ACCEPTED')
    throw new Error(`Style base version rejected: ${created.rejection.code}`);
  const source = createProfileActivationSource({ profileId, versionId: baseVersionId }),
    registry = createFleetRegistry(configuration(profileId, baseVersionId, sessionId), {
      profileSource: source,
    }),
    activation = createProfileActivation({
      registry,
      source,
      engineVersion: PIPELINE_ENGINE,
      clock: () => clock.value,
      now: () => STYLE_NOW,
    }),
    queue = createLearningQueueHarness({ engineVersion: PIPELINE_ENGINE }),
    segments = createSegments({
      segmentId: `${profileId}:g${learningEpoch}`,
      playerId: PIPELINE_PLAYER_ID,
      profileId,
      learningEpoch,
      baseVersionId,
      openedTick: clock.value,
    }),
    barrier = createLearningEpochBarrier({
      playerId: PIPELINE_PLAYER_ID,
      profileId,
      engineVersion: PIPELINE_ENGINE,
      learningEpoch,
      baseVersionId,
      segmentId: `${profileId}:g${learningEpoch}`,
      openedTick: clock.value,
      queue: queue.queue,
      store,
      activation,
      segments: segments.port,
      tick: () => clock.value,
    }),
    target = { sessionId, worldEpoch: PIPELINE_WORLD_EPOCH, profileId },
    progressionCalls: string[] = [],
    progression: StyleProgressionSpy = {
      awardXp: () => progressionCalls.push('awardXp'),
      completeMission: () => progressionCalls.push('completeMission'),
      resetProgress: () => progressionCalls.push('resetProgress'),
      mutate: () => progressionCalls.push('mutate'),
      calls: () => progressionCalls.length,
    },
    restoreServices: ProfileRestoreServices = {
      playerId: PIPELINE_PLAYER_ID,
      profileId,
      engineVersion: PIPELINE_ENGINE,
      store,
      barrier,
      activation,
      progression,
      tick: () => clock.value,
      now: () => STYLE_NOW,
    },
    session = createStyleSlidersSession({
      playerId: PIPELINE_PLAYER_ID,
      profileId,
      engineVersion: PIPELINE_ENGINE,
      store,
      barrier,
      activation,
      readTarget: (): StyleSlidersTarget => ({
        sessionId: target.sessionId,
        worldEpoch: target.worldEpoch,
        playerId: PIPELINE_PLAYER_ID,
        profileId: target.profileId,
        baseVersionId: barrier.current().baseVersionId,
        learningEpoch: barrier.current().learningEpoch,
      }),
      tick: () => clock.value,
      restore: (versionId, tick) => restoreVersion(restoreServices, { profileId, versionId, tick }),
      now: () => STYLE_NOW,
      operationPrefix: 'manual',
    });

  return {
    store,
    activation,
    registry,
    queue,
    tick: clock,
    barrier,
    segments,
    session,
    restoreServices,
    progression,
    profileId,
    sessionId,
    target,
    baseVersionId,
    advanceTick(): number {
      clock.value += 1;
      session.observeTick(clock.value);
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
    versions(): readonly string[] {
      return Object.freeze(store.listVersions(profileId).map((entry) => entry.versionId));
    },
    job(segmentId: string, order: number): Record<string, unknown> {
      const segment = pipelineSegment({ segmentId, order });
      return {
        playerId: PIPELINE_PLAYER_ID,
        profileId,
        learningEpoch: barrier.current().learningEpoch,
        baseVersionId: barrier.current().baseVersionId,
        segmentId: segment.segmentId,
        mode: segment.mode,
        eligible: segment.eligible,
        order: segment.order,
        sessionId,
        worldEpoch: PIPELINE_WORLD_EPOCH,
        key: segment.key,
        baseValue: segment.baseValue,
        evidence: segment.evidence,
        episodes: segment.episodes,
        candidate: segment.candidate,
      };
    },
    dispose(): void {
      session.dispose();
      barrier.dispose();
      queue.dispose();
      activation.dispose();
      registry.dispose();
    },
  };
}

/** Convenience: run the host tick loop until `applyAtTick` publishes, bounded to `limit` ticks. */
export function runSessionTicks(
  world: StyleWorld,
  session: StyleSlidersSession,
  limit = 6,
): ReturnType<StyleSlidersSession['applyAtTick']> {
  let last = session.applyAtTick(world.tick.value);
  for (let index = 0; index < limit; index += 1) {
    world.advanceTick();
    last = session.applyAtTick(world.tick.value);
    if (last.status === 'PUBLISHED' || last.status === 'REJECTED' || last.status === 'RESTORED')
      return last;
  }
  return last;
}

export function runTicks(
  world: StyleWorld,
  limit = 6,
): ReturnType<StyleSlidersSession['applyAtTick']> {
  return runSessionTicks(world, world.session, limit);
}

/** Advances the host clock until the published activation reaches the whole fleet. */
export function activateFleet(
  world: StyleWorld,
  session: StyleSlidersSession = world.session,
  limit = 4,
): boolean {
  const before = session.getStats().activated;
  let last = session.applyAtTick(world.tick.value);
  for (let index = 0; index < limit; index += 1) {
    if (session.getStats().activated > before) return true;
    world.advanceTick();
    last = session.applyAtTick(world.tick.value);
    if (session.getStats().activated > before) return true;
    if (last.status === 'REJECTED') return false;
  }
  return false;
}

/** A second editor of the same world, to simulate another intervention published meanwhile. */
export function createAdditionalEditor(world: StyleWorld, prefix: string): StyleSlidersSession {
  return createStyleSlidersSession({
    playerId: PIPELINE_PLAYER_ID,
    profileId: world.profileId,
    engineVersion: PIPELINE_ENGINE,
    store: world.store,
    barrier: world.barrier,
    activation: world.activation,
    readTarget: (): StyleSlidersTarget => ({
      sessionId: world.target.sessionId,
      worldEpoch: world.target.worldEpoch,
      playerId: PIPELINE_PLAYER_ID,
      profileId: world.target.profileId,
      baseVersionId: world.barrier.current().baseVersionId,
      learningEpoch: world.barrier.current().learningEpoch,
    }),
    tick: () => world.tick.value,
    restore: (versionId, tick) =>
      restoreVersion(world.restoreServices, { profileId: world.profileId, versionId, tick }),
    now: () => STYLE_NOW,
    operationPrefix: prefix,
  });
}

export const STYLE_HAOS: Readonly<{ profileId: string; sessionId: string }> = Object.freeze({
  profileId: STYLE_HAOS_PROFILE,
  sessionId: STYLE_HAOS_SESSION,
});
export const STYLE_ACADEMIA_PROFILE = PIPELINE_PROFILE_ID;
export const STYLE_PLAYER = PIPELINE_PLAYER_ID;
export const STYLE_ENGINE = PIPELINE_ENGINE;
export const STYLE_BASE = PIPELINE_BASE_VERSION;
