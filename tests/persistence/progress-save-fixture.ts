import {
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  createProgressSaveStore,
} from '../../src/persistence/index';
import type {
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
  PlayerSaveRequest,
  ProgressSaveStore,
} from '../../src/persistence/index';
import { createDefaultSettings, parseRuntimeSettings } from '../../src/settings/index';
import type { RuntimeSettings } from '../../src/settings/index';
import {
  createMissionTestTracker,
  MISSION_SESSION_ID,
  MISSION_WORLD_EPOCH,
} from '../missions/mission-fixture';
import {
  completeCampaign,
  createRewardsTracker,
  replayMission,
} from '../missions/mission-rewards-fixture';
import type { CampaignRun } from '../missions/mission-rewards-fixture';
import { createCampaignProgressRecorder } from '../../src/persistence/index';
import type { CampaignProgressRecorder } from '../../src/persistence/index';
import type { MissionCatalog, MissionTracker } from '../../src/missions/index';
import { fixedClock } from './fixtures';

/**
 * 130 fixture: a real 116 tracker, a real 125 ledger wrapped by the 130 recorder and the real 009
 * settings contract. Nothing here authors a completion or a reward; the campaign is completed by
 * the real mission events. The save session and world epoch are the ones the tracker really uses,
 * because a reloaded tracker must accept the events of the same world.
 */
export const SAVE_SESSION_ID = MISSION_SESSION_ID;
export const SAVE_PLAYER_ID = 'player:130';
export const SAVE_WORLD_EPOCH = MISSION_WORLD_EPOCH;
export const SAVE_DB_NAME = '130-progress-save-db';

export interface SaveHarness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly repository: LocalRepository;
  readonly catalog: MissionCatalog;
  readonly tracker: MissionTracker;
  readonly campaign: CampaignProgressRecorder;
  readonly store: ProgressSaveStore;
  readonly run: CampaignRun;
}

export function createSaveFactory(): MemoryIdbFactory {
  return createMemoryIdbFactory();
}

export function createSaveLocks(): MemoryLockManager {
  return createMemoryLockManager();
}

export async function openRepository(
  factory: MemoryIdbFactory,
  locks: MemoryLockManager,
  tabId: string,
  dbName: string = SAVE_DB_NAME,
): Promise<LocalRepository> {
  const repository = createLocalRepository({
    factory,
    locks,
    dbName,
    tabId,
    now: fixedClock(),
  });
  const report = await repository.open();
  if (report.status !== 'READY') throw new Error(`130 fixture repository is ${report.status}`);
  return repository;
}

/** Defaults with real remaps and real preferences, so a reload can prove they are restored. */
export function customSettings(playerId: string = SAVE_PLAYER_ID): RuntimeSettings {
  const base = createDefaultSettings(playerId);
  return parseRuntimeSettings({
    ...base,
    input: {
      ...base.input,
      bindings: {
        ...base.input.bindings,
        throttle: 'KeyI',
        brake: 'ArrowDown',
        camera: 'KeyV',
      },
      cameraMode: 'FIRST_PERSON',
      control: {
        ...base.input.control,
        version: 4,
        steeringSensitivity: 72,
        returnRate: 38,
        fov: 92,
      },
    },
    units: { speed: 'mph', distance: 'ft' },
    quality: { preset: 'HIGH', preferredBackend: 'WEBGL2', resolutionScale: 0.75, adaptive: true },
    audio: { schemaVersion: 1, master: 0.4, engine: 0.5, impact: 0.6, ui: 0.3, muted: true },
  });
}

/**
 * Builds the live objects of one session: the campaign completed through mission 3, one mission
 * still active, and the recorder that remembers the real settlements.
 */
export async function createSaveHarness(
  options: {
    readonly factory?: MemoryIdbFactory;
    readonly locks?: MemoryLockManager;
    readonly tabId?: string;
    readonly dbName?: string;
    readonly through?: string;
    readonly startTick?: number;
  } = {},
): Promise<SaveHarness> {
  const factory = options.factory ?? createSaveFactory();
  const locks = options.locks ?? createSaveLocks();
  const repository = await openRepository(
    factory,
    locks,
    options.tabId ?? 'tab-a',
    options.dbName ?? SAVE_DB_NAME,
  );
  const tracker = createRewardsTracker();
  const catalog = tracker.catalog();
  const run = completeCampaign(tracker, {
    through: options.through ?? 'campaign-3-following-distance',
    ...(options.startTick === undefined ? {} : { startTick: options.startTick }),
  });
  const campaign = createCampaignProgressRecorder({ catalog });
  for (const completion of run.completions) campaign.settleInstance(completion.instance);
  const store = createProgressSaveStore({ repository, catalog });
  return { factory, locks, repository, catalog, tracker, campaign, store, run };
}

/** Starts the fourth campaign mission and leaves it ACTIVE: a real in-progress objective. */
export function startActiveMission(tracker: MissionTracker, tick: number): string {
  const instance = tracker.start({
    missionId: 'campaign-4-stops-and-signals',
    tick,
  }).instance;
  return instance.instanceId;
}

/** Reopens the same database as a new page: the real reload path of a tab. */
export async function reopen(options: {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly catalog: MissionCatalog;
  readonly dbName?: string;
}): Promise<{ readonly repository: LocalRepository; readonly store: ProgressSaveStore }> {
  const repository = await openRepository(
    options.factory,
    options.locks,
    'tab-b',
    options.dbName ?? SAVE_DB_NAME,
  );
  return { repository, store: createProgressSaveStore({ repository, catalog: options.catalog }) };
}

/** The exact save call used by tests and by the deterministic report. */
export function saveInput(
  harness: {
    readonly tracker: MissionTracker;
    readonly campaign: CampaignProgressRecorder;
    readonly catalog: MissionCatalog;
  },
  overrides: {
    readonly settings?: RuntimeSettings;
    readonly tracker?: unknown;
    readonly campaign?: unknown;
    readonly sessionId?: string;
    readonly playerId?: string;
    readonly worldEpoch?: number;
  } = {},
): PlayerSaveRequest {
  const campaign = overrides.campaign ?? {
    ledger: harness.campaign.ledger,
    events: harness.campaign.events(),
  };
  return {
    sessionId: overrides.sessionId ?? SAVE_SESSION_ID,
    playerId: overrides.playerId ?? SAVE_PLAYER_ID,
    worldEpoch: overrides.worldEpoch ?? SAVE_WORLD_EPOCH,
    catalog: harness.catalog,
    settings: overrides.settings ?? customSettings(overrides.playerId ?? SAVE_PLAYER_ID),
    tracker: overrides.tracker ?? harness.tracker.snapshot(),
    campaign: campaign as PlayerSaveRequest['campaign'],
  };
}

/** A tracker with one completed and one failed mission, used for the verdict reload test. */
export function trackerWithFailure(): MissionTracker {
  const tracker = createRewardsTracker();
  const instance = tracker.start({
    missionId: 'campaign-1-first-taxi',
    tick: 10,
  }).instance;
  tracker.fail({ instanceId: instance.instanceId, reason: 'PLAYER_ABANDONED', tick: 20 });
  return tracker;
}

export { createMissionTestTracker, replayMission };
