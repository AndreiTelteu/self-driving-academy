import { DEFAULT_FLEET_COUNTS, createFleetRegistry } from '../../src/fleet';
import type { FleetRegistry } from '../../src/fleet';
import { createCandidateProfileStore } from '../../src/learning';
import {
  MISSION_NAMESPACE,
  createMissionTestTracker,
  dropoff,
  fullStop,
  leaderAcquired,
  manualStart,
  profileActivate,
} from './mission-fixture';
import type { MissionInstance, MissionTracker } from '../../src/missions';
import {
  campaignOrder,
  createCampaignMissionCatalog,
  parseMissionCatalog,
} from '../../src/missions';
import type { MissionCatalog } from '../../src/missions';
import { parameterDefinitions } from '../../src/profiles';
import type { ProfileStore } from '../../src/profiles';

/**
 * Fixture for PBI 125.
 *
 * Every completion is produced by the real 116 tracker: the mission is started through the real
 * catalog, advanced by validated 007 events and completed by its authored objective. The fixture
 * authors only which real events happen and when — never the completion itself.
 *
 * The fleet is the real 057 registry (24 taxis and 40 civilians by default) and the profile is a
 * real 109 store seeded through its public API.
 */
export const REWARDS_FIXTURE_SESSION_ID = 'session-125-rewards';
export const REWARDS_FIXTURE_PROFILE_ID = 'profile:125';
export const REWARDS_FIXTURE_PROFILE_VERSION = 'profile-125-base';
export const REWARDS_FIXTURE_ENGINE_VERSION = 'engine-125';
export const REWARDS_FIXTURE_NOW = '2026-11-11T00:00:00.000Z';
export const REWARDS_FIXTURE_FLEET_NAMESPACE = 'fleet:125-rewards';
export const REWARDS_FIXTURE_SCENARIO = 'scenario:125-rewards';
export const REWARDS_FIXTURE_TAXI = 'taxi:125';
export const REWARDS_FIXTURE_OFFSET = 100;

type Envelope = ReturnType<typeof manualStart>;

/** The real 007 events that satisfy each authored campaign objective. */
export function campaignMissionEvents(missionId: string, startTick: number): readonly Envelope[] {
  const tick = startTick + 1;
  switch (missionId) {
    case 'campaign-1-first-taxi':
      return [
        manualStart(`125:manual-start:${tick}`, tick, REWARDS_FIXTURE_TAXI),
        dropoff(`125:dropoff:${tick + 1}`, tick + 1, REWARDS_FIXTURE_TAXI, 'ride:125:1'),
      ];
    case 'campaign-2-first-demonstration':
      return [
        profileActivate(`125:profile:${tick}`, tick, REWARDS_FIXTURE_PROFILE_ID, 'version-125:1'),
      ];
    case 'campaign-3-following-distance':
      return [
        leaderAcquired(`125:leader:${tick}`, tick, REWARDS_FIXTURE_TAXI, 'leader:125:1', 12),
        leaderAcquired(
          `125:leader:${tick + 1}`,
          tick + 1,
          REWARDS_FIXTURE_TAXI,
          'leader:125:2',
          20,
        ),
      ];
    case 'campaign-4-stops-and-signals':
      return [
        fullStop(`125:stop:${tick}`, tick, REWARDS_FIXTURE_TAXI, 'opportunity:125:1', 1.6),
        fullStop(`125:stop:${tick + 1}`, tick + 1, REWARDS_FIXTURE_TAXI, 'opportunity:125:2', 1.6),
      ];
    case 'campaign-5-passenger':
      return [dropoff(`125:dropoff:${tick}`, tick, REWARDS_FIXTURE_TAXI, 'ride:125:5')];
    case 'campaign-6-city-copies-you':
      return [
        profileActivate(`125:profile:${tick}`, tick, REWARDS_FIXTURE_PROFILE_ID, 'version-125:2'),
      ];
    case 'campaign-7-changing-a-habit':
      return [
        profileActivate(`125:profile:${tick}`, tick, REWARDS_FIXTURE_PROFILE_ID, 'version-125:3'),
        profileActivate(
          `125:profile:${tick + 1}`,
          tick + 1,
          REWARDS_FIXTURE_PROFILE_ID,
          'version-125:4',
        ),
      ];
    case 'campaign-8-fleet-challenge':
      return [
        dropoff(`125:dropoff:${tick}`, tick, REWARDS_FIXTURE_TAXI, 'ride:125:8a'),
        dropoff(`125:dropoff:${tick + 1}`, tick + 1, REWARDS_FIXTURE_TAXI, 'ride:125:8b'),
        dropoff(`125:dropoff:${tick + 2}`, tick + 2, REWARDS_FIXTURE_TAXI, 'ride:125:8c'),
      ];
    default:
      throw new Error(`No 125 fixture script for mission ${missionId}`);
  }
}

export function createRewardsTracker(): MissionTracker {
  return createMissionTestTracker();
}

export interface CompletedMission {
  readonly missionId: string;
  readonly instance: MissionInstance;
}

/** The authoritative tick of a completed instance; a completed 116 instance always has one. */
export function completionTick(instance: MissionInstance): number {
  if (instance.completedTick === null)
    throw new Error(`Mission instance ${instance.instanceId} has no completion tick`);
  return instance.completedTick;
}

function finishMission(
  tracker: MissionTracker,
  missionId: string,
  startTick: number,
): MissionInstance {
  let completedId: string | null = null;
  for (const event of campaignMissionEvents(missionId, startTick)) {
    const result = tracker.ingest(event);
    if (result.completed.length > 0) completedId = result.completed[0]!;
  }
  const instance = completedId === null ? undefined : tracker.instance(completedId);
  if (instance === undefined || instance.state !== 'COMPLETED')
    throw new Error(`Mission ${missionId} did not complete in the 125 fixture`);
  return instance;
}

/** Starts and completes one mission through the real 116 lifecycle and returns its real instance. */
export function completeMission(
  tracker: MissionTracker,
  missionId: string,
  startTick: number,
): MissionInstance {
  tracker.start({ missionId, tick: startTick });
  return finishMission(tracker, missionId, startTick);
}

/** Replays a terminal instance through the real 116 `replay` and completes the next attempt. */
export function replayMission(
  tracker: MissionTracker,
  instance: MissionInstance,
  startTick: number,
): MissionInstance {
  tracker.replay({ instanceId: instance.instanceId, tick: startTick });
  return finishMission(tracker, instance.missionId, startTick);
}

export interface CampaignRun {
  readonly completions: readonly CompletedMission[];
  readonly nextTick: number;
}

/**
 * Completes the campaign in prerequisite order, one mission at a time. `through` stops after that
 * mission; `startTick` is the first authoritative tick.
 */
export function completeCampaign(
  tracker: MissionTracker,
  options: { readonly through?: string; readonly startTick?: number } = {},
): CampaignRun {
  const ids = campaignOrder(tracker.catalog());
  const limit = options.through === undefined ? ids.length : ids.indexOf(options.through) + 1;
  if (limit <= 0) throw new Error(`Unknown campaign mission ${options.through}`);
  let nextTick = options.startTick ?? REWARDS_FIXTURE_OFFSET;
  const completions: CompletedMission[] = [];
  for (const missionId of ids.slice(0, limit)) {
    const instance = completeMission(tracker, missionId, nextTick);
    completions.push(Object.freeze({ missionId, instance }));
    nextTick = completionTick(instance) + 10;
  }
  return Object.freeze({ completions: Object.freeze(completions), nextTick });
}

/** Real 057 fleet: 24 taxis and 40 civilians by default. */
export function createRewardsFleet(overrides: { seed?: number } = {}): FleetRegistry {
  return createFleetRegistry({
    schemaVersion: 1,
    units: 'SI',
    sessionId: REWARDS_FIXTURE_SESSION_ID,
    worldEpoch: 1,
    scenarioId: REWARDS_FIXTURE_SCENARIO,
    seed: overrides.seed ?? 125,
    namespace: REWARDS_FIXTURE_FLEET_NAMESPACE,
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: 'city:common', versionId: 'profile-version:125' },
  });
}

/** Real 109 store with the 102 validator wired, carrying one base profile version. */
export function createRewardsProfileStore(): ProfileStore {
  const store = createCandidateProfileStore({
    engineVersion: REWARDS_FIXTURE_ENGINE_VERSION,
    now: () => REWARDS_FIXTURE_NOW,
  });
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  const created = store.createBase({
    profileId: REWARDS_FIXTURE_PROFILE_ID,
    versionId: REWARDS_FIXTURE_PROFILE_VERSION,
    parameters,
    sourceSegmentIds: [],
    createdAt: REWARDS_FIXTURE_NOW,
  });
  if (created.status !== 'ACCEPTED')
    throw new Error(`125 fixture profile rejected: ${created.rejection.code}`);
  return store;
}

/** The same campaign catalog with `campaign-1-first-taxi` re-authored as definition version 2. */
export function upgradedCampaignCatalog(): MissionCatalog {
  const base = createCampaignMissionCatalog();
  return parseMissionCatalog({
    schemaVersion: base.schemaVersion,
    units: base.units,
    version: base.version,
    namespace: base.namespace,
    missions: base.missions.map((mission) =>
      mission.missionId === 'campaign-1-first-taxi' ? { ...mission, version: '2' } : mission,
    ),
  });
}

export const REWARDS_FIXTURE_NAMESPACE = MISSION_NAMESPACE;
