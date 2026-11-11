import {
  PersistenceError,
  canonicalizeJson,
  campaignLedgerDigest,
  createProgressSaveStore,
  restoreMissionProgress,
  summarizeTracker,
  trackerFacts,
} from '../../src/persistence/index';
import type {
  LoadedPlayerSave,
  PersistedRecord,
  PlayerSaveRows,
} from '../../src/persistence/index';
import { createDefaultSettings } from '../../src/settings/index';
import { completeMission, upgradedCampaignCatalog } from '../missions/mission-rewards-fixture';
import {
  SAVE_PLAYER_ID,
  SAVE_SESSION_ID,
  SAVE_WORLD_EPOCH,
  createSaveFactory,
  createSaveHarness,
  createSaveLocks,
  customSettings,
  openRepository,
  saveInput,
  startActiveMission,
} from './progress-save-fixture';

/**
 * Deterministic transcript of the PBI 130 save contract.
 *
 * There is no wall clock, no browser and no random source: the same build produces the same
 * `report.json` byte for byte, which is what `npm run save:progress -- --check` verifies.
 */
export const SAVE_REPORT_VERSION = '130-progress-save-report-v1';

export interface SaveReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface SaveReportRow {
  readonly recordId: string | null;
  readonly revision: number | null;
  readonly status: string | null;
  readonly bodyBytes: number | null;
  readonly digest: string | null;
}

export interface ProgressSaveReport {
  readonly version: string;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly reload: {
    readonly categories: Readonly<{ settings: boolean; campaign: boolean; progress: boolean }>;
    readonly instancesBefore: number;
    readonly instancesAfter: number;
    readonly completedBefore: number;
    readonly completedAfter: number;
    readonly activeBefore: number;
    readonly activeAfter: number;
    readonly xpBefore: number;
    readonly xpAfter: number;
    readonly unlocksBefore: number;
    readonly unlocksAfter: number;
    readonly rewardsBefore: number;
    readonly rewardsAfter: number;
    readonly settingsMatch: boolean;
    readonly rerampsRestored: string;
    readonly preferenceRestored: string;
    readonly trackerFactsMatch: boolean;
    readonly trackerDigestMatch: boolean;
    readonly campaignDigestMatch: boolean;
    readonly trackerRow: SaveReportRow;
    readonly campaignRow: SaveReportRow;
    readonly settingsSource: string;
    readonly rowsRead: number;
  };
  readonly uniqueReward: {
    readonly repeatStatus: string;
    readonly repeatXpGranted: number;
    readonly repeatReasons: readonly string[];
    readonly xpBeforeRepeat: number;
    readonly xpAfterRepeat: number;
    readonly grantedBeforeRepeat: number;
    readonly grantedAfterRepeat: number;
    readonly replayStatus: string;
    readonly replayXpGranted: number;
    readonly replayReasons: readonly string[];
    readonly xpAfterReplay: number;
    readonly completions: number;
  };
  readonly resetSettings: {
    readonly deletedTracker: boolean;
    readonly deletedCampaign: boolean;
    readonly keptTracker: boolean;
    readonly keptCampaign: boolean;
    readonly settingsChanged: boolean;
    readonly settingsAfter: string;
    readonly throttleAfter: string;
    readonly unitsAfter: string;
    readonly qualityAfter: string;
    readonly trackerDigestKept: boolean;
    readonly campaignDigestKept: boolean;
    readonly campaignCompletedKept: number;
    readonly settingsSurviveReload: boolean;
  };
  readonly resetCampaign: {
    readonly deletedCampaign: boolean;
    readonly deletedTracker: boolean;
    readonly keptTracker: boolean;
    readonly keptSettings: boolean;
    readonly campaignAfter: string;
    readonly trackerDigestKept: boolean;
    readonly settingsKept: boolean;
    readonly campaignCompletedAfter: number;
  };
  readonly resetProgress: {
    readonly deletedTracker: boolean;
    readonly deletedCampaign: boolean;
    readonly keptCampaign: boolean;
    readonly keptSettings: boolean;
    readonly trackerAfter: string;
    readonly campaignDigestKept: boolean;
    readonly settingsKept: boolean;
    readonly restoredInstances: number;
  };
  readonly failedWrite: {
    readonly status: string;
    readonly code: string;
    readonly rowsBefore: number;
    readonly rowsAfter: number;
    readonly fingerprintMatch: boolean;
    readonly revisionsMatch: boolean;
  };
  readonly defaults: {
    readonly settingsSource: string;
    readonly empty: boolean;
    readonly throttle: string;
    readonly brake: string;
    readonly units: string;
    readonly quality: string;
    readonly audioMuted: boolean;
  };
  readonly refusals: {
    readonly tamperedCampaign: string;
    readonly tamperedTracker: string;
    readonly otherCatalog: string;
    readonly emptySave: string;
    readonly unknownReset: string;
    readonly writerRequired: string;
  };
  readonly checks: readonly SaveReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly scenarios: number;
    readonly pass: boolean;
  };
}

function canonical(value: unknown): string {
  const result = canonicalizeJson(value);
  return result.status === 'ACCEPTED' ? result.text : 'REJECTED';
}

function same(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function rejectionCode(error: unknown): string {
  if (error instanceof PersistenceError) return error.code;
  return error instanceof Error ? `ERROR:${error.name}` : 'ERROR:unknown';
}

function rowSummary(
  row: {
    readonly recordId?: string;
    readonly revision?: number;
    readonly status?: string;
    readonly bodyBytes?: number;
    readonly digest?: string;
  } | null,
): SaveReportRow {
  return Object.freeze({
    recordId: row?.recordId ?? null,
    revision: row?.revision ?? null,
    status: row?.status ?? null,
    bodyBytes: row?.bodyBytes ?? null,
    digest: row?.digest ?? null,
  });
}

function fingerprint(rows: PlayerSaveRows): string {
  return JSON.stringify({ progress: rows.progress, settings: rows.settings });
}

function trackerStatement(save: LoadedPlayerSave): string {
  return save.tracker === null ? 'ABSENT' : save.tracker.summary.status;
}

async function scenario(): Promise<Awaited<ReturnType<typeof createSaveHarness>>> {
  return createSaveHarness({ factory: createSaveFactory(), locks: createSaveLocks() });
}

async function reloadScenario() {
  const harness = await scenario();
  startActiveMission(harness.tracker, harness.run.nextTick);
  const factsBefore = trackerFacts(harness.tracker.snapshot());
  const summaryBefore = summarizeTracker(harness.tracker.snapshot(), harness.catalog);
  const saved = await harness.store.save(saveInput(harness));
  const savedTrackerDigest =
    saved.status === 'COMMITTED' ? (saved.value.tracker?.digest ?? '') : '';
  const liveXp = harness.campaign.ledger.rewards().totals.xp;
  const liveGrants = harness.campaign.ledger.rewards().totals.granted;
  const liveUnlocks = harness.campaign.ledger.unlocks().counts.granted;
  const liveCampaignDigest = campaignLedgerDigest(harness.campaign.ledger);
  harness.repository.close();

  const repository = await openRepository(harness.factory, harness.locks, 'tab-b');
  const store = createProgressSaveStore({ repository, catalog: harness.catalog });
  const opened = await store.open({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID });
  const factsAfter = trackerFacts(opened.tracker.snapshot());
  const summaryAfter = summarizeTracker(opened.tracker.snapshot(), harness.catalog);
  const campaign = opened.save.campaign;
  const rows = await repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID);
  const settings = opened.save.settings;
  const result = {
    categories: opened.save.categories,
    instancesBefore: summaryBefore.instances,
    instancesAfter: summaryAfter.instances,
    completedBefore: summaryBefore.completed,
    completedAfter: summaryAfter.completed,
    activeBefore: summaryBefore.active,
    activeAfter: summaryAfter.active,
    xpBefore: liveXp,
    xpAfter: campaign?.rewards.totals.xp ?? -1,
    unlocksBefore: liveUnlocks,
    unlocksAfter: campaign?.unlocks.counts.granted ?? -1,
    rewardsBefore: liveGrants,
    rewardsAfter: campaign?.rewards.totals.granted ?? -1,
    settingsMatch: same(settings, customSettings()),
    rerampsRestored: `${settings.input.bindings.throttle}/${settings.input.bindings.brake}/${settings.input.bindings.camera}`,
    preferenceRestored: `${settings.units.speed}/${settings.quality.preset}/audio:${String(
      settings.audio.muted,
    )}/fov:${String(settings.input.control.fov)}`,
    trackerFactsMatch: same(factsBefore, factsAfter),
    trackerDigestMatch: savedTrackerDigest === opened.save.tracker?.digest,
    campaignDigestMatch: liveCampaignDigest === campaign?.digest,
    trackerRow: rowSummary(opened.save.tracker),
    campaignRow: rowSummary(campaign),
    settingsSource: opened.save.settingsSource,
    rowsRead: rows.progress.length,
  };
  repository.close();
  return result;
}

async function uniqueRewardScenario() {
  const harness = await scenario();
  const first = harness.run.completions[0]!;
  const xp = harness.campaign.ledger.rewards().totals.xp;
  const grants = harness.campaign.ledger.rewards().totals.granted;
  await harness.store.save(saveInput(harness));
  harness.repository.close();

  const repository = await openRepository(harness.factory, harness.locks, 'tab-b');
  const store = createProgressSaveStore({ repository, catalog: harness.catalog });
  const opened = await store.open({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID });
  const ledger = opened.save.campaign!.ledger;
  const repeat = ledger.settle({ instance: first.instance });
  const xpAfterRepeat = ledger.rewards().totals.xp;
  const grantsAfterRepeat = ledger.rewards().totals.granted;
  const startTick = Math.max(
    opened.tracker.stats().tick + 10,
    (first.instance.completedTick ?? 0) + 10,
  );
  opened.tracker.replay({ instanceId: first.instance.instanceId, tick: startTick });
  const replay = completeMission(opened.tracker, first.instance.missionId, startTick);
  const replaySettlement = ledger.settle({ instance: replay });
  const result = {
    repeatStatus: repeat.status,
    repeatXpGranted: repeat.xpGranted,
    repeatReasons: repeat.duplicateReasons,
    xpBeforeRepeat: xp,
    xpAfterRepeat,
    grantedBeforeRepeat: grants,
    grantedAfterRepeat: grantsAfterRepeat,
    replayStatus: replaySettlement.status,
    replayXpGranted: replaySettlement.xpGranted,
    replayReasons: replaySettlement.duplicateReasons,
    xpAfterReplay: ledger.rewards().totals.xp,
    completions: ledger.stats().completions,
  };
  repository.close();
  return result;
}

async function resetSettingsScenario() {
  const harness = await scenario();
  await harness.store.save(saveInput(harness));
  const before = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  const reset = await harness.store.reset({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    category: 'SETTINGS',
  });
  const value = reset.status === 'COMMITTED' ? reset.value : null;
  const after = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  const defaults = createDefaultSettings(SAVE_PLAYER_ID, 5);
  const result = {
    deletedTracker: value?.deleted.tracker ?? true,
    deletedCampaign: value?.deleted.campaign ?? true,
    keptTracker: value?.kept.tracker ?? false,
    keptCampaign: value?.kept.campaign ?? false,
    settingsChanged: value?.settingsChanged ?? false,
    settingsAfter: same(after.settings, defaults) ? 'DEFAULTS' : 'OTHER',
    throttleAfter: after.settings.input.bindings.throttle,
    unitsAfter: after.settings.units.speed,
    qualityAfter: after.settings.quality.preset,
    trackerDigestKept: after.tracker?.digest === before.tracker?.digest,
    campaignDigestKept: after.campaign?.digest === before.campaign?.digest,
    campaignCompletedKept: after.campaign?.counts.completed ?? -1,
    settingsSurviveReload: false,
  };
  harness.repository.close();

  const repository = await openRepository(harness.factory, harness.locks, 'tab-b');
  const store = createProgressSaveStore({ repository, catalog: harness.catalog });
  const reopened = await store.load({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID });
  repository.close();
  return { ...result, settingsSurviveReload: same(reopened.settings, defaults) };
}

async function resetCampaignScenario() {
  const harness = await scenario();
  await harness.store.save(saveInput(harness));
  const before = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  const reset = await harness.store.reset({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    category: 'CAMPAIGN',
  });
  const value = reset.status === 'COMMITTED' ? reset.value : null;
  const after = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  const result = {
    deletedCampaign: value?.deleted.campaign ?? false,
    deletedTracker: value?.deleted.tracker ?? true,
    keptTracker: value?.kept.tracker ?? false,
    keptSettings: value?.kept.settings ?? false,
    campaignAfter: after.campaign === null ? 'ABSENT' : 'PRESENT',
    trackerDigestKept: after.tracker?.digest === before.tracker?.digest,
    settingsKept: same(after.settings, before.settings),
    campaignCompletedAfter: after.campaign?.counts.completed ?? 0,
  };
  harness.repository.close();
  return result;
}

async function resetProgressScenario() {
  const harness = await scenario();
  await harness.store.save(saveInput(harness));
  const before = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  const reset = await harness.store.reset({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    category: 'PROGRESS',
  });
  const value = reset.status === 'COMMITTED' ? reset.value : null;
  const after = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  const restored = restoreMissionProgress({ save: after, catalog: harness.catalog });
  const result = {
    deletedTracker: value?.deleted.tracker ?? false,
    deletedCampaign: value?.deleted.campaign ?? true,
    keptCampaign: value?.kept.campaign ?? false,
    keptSettings: value?.kept.settings ?? false,
    trackerAfter: trackerStatement(after),
    campaignDigestKept: after.campaign?.digest === before.campaign?.digest,
    settingsKept: same(after.settings, before.settings),
    restoredInstances: restored.instances.length,
  };
  harness.repository.close();
  return result;
}

async function failedWriteScenario() {
  const harness = await scenario();
  await harness.store.save(saveInput(harness));
  const before = await harness.repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID);
  startActiveMission(harness.tracker, harness.run.nextTick);
  const failed = await harness.store.save(
    saveInput(harness, {
      settings: createDefaultSettings(SAVE_PLAYER_ID),
      tracker: harness.tracker.snapshot(),
    }),
    {
      beforeCommit: () => {
        throw new Error('injected failure before commit');
      },
    },
  );
  const after = await harness.repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID);
  const revisionsBefore = before.progress.map((row) => (row as PersistedRecord).revision);
  const revisionsAfter = after.progress.map((row) => (row as PersistedRecord).revision);
  const result = {
    status: failed.status,
    code: failed.status === 'REJECTED' ? failed.rejection.code : 'NONE',
    rowsBefore: before.progress.length,
    rowsAfter: after.progress.length,
    fingerprintMatch: fingerprint(before) === fingerprint(after),
    revisionsMatch: JSON.stringify(revisionsBefore) === JSON.stringify(revisionsAfter),
  };
  harness.repository.close();
  return result;
}

async function defaultsScenario() {
  const harness = await scenario();
  const loaded = await harness.store.load({ sessionId: 'session-empty', playerId: 'player:none' });
  const result = {
    settingsSource: loaded.settingsSource,
    empty: loaded.empty,
    throttle: loaded.settings.input.bindings.throttle,
    brake: loaded.settings.input.bindings.brake,
    units: `${loaded.settings.units.speed}/${loaded.settings.units.distance}`,
    quality: loaded.settings.quality.preset,
    audioMuted: loaded.settings.audio.muted,
  };
  harness.repository.close();
  return result;
}

async function refusalScenario() {
  const harness = await scenario();
  await harness.store.save(saveInput(harness));
  const rows = await harness.repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID);
  const campaignRow = rows.progress.find(
    (row) => (row as PersistedRecord).body.kind === 'CAMPAIGN_LEDGER',
  ) as PersistedRecord;
  const brokenCampaign = {
    schemaVersion: 1 as const,
    recordKind: 'PROGRESS' as const,
    recordId: campaignRow.recordId,
    sessionId: campaignRow.sessionId,
    worldEpoch: campaignRow.worldEpoch,
    status: campaignRow.status,
    revision: campaignRow.revision + 1,
    createdAt: campaignRow.createdAt,
    body: { ...campaignRow.body, digest: 'f'.repeat(64) },
  };
  await harness.repository.putProgress(brokenCampaign);
  let tamperedCampaign = 'ACCEPTED';
  try {
    await harness.store.load({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID });
  } catch (error) {
    tamperedCampaign = rejectionCode(error);
  }

  const trackerRow = rows.progress.find(
    (row) => (row as PersistedRecord).body.kind === 'MISSION_TRACKER',
  ) as PersistedRecord;
  const brokenTracker = {
    schemaVersion: 1 as const,
    recordKind: 'PROGRESS' as const,
    recordId: trackerRow.recordId,
    sessionId: trackerRow.sessionId,
    worldEpoch: trackerRow.worldEpoch,
    status: trackerRow.status,
    revision: trackerRow.revision + 1,
    createdAt: trackerRow.createdAt,
    body: { ...trackerRow.body, digest: 'e'.repeat(64) },
  };
  await harness.repository.putProgress(brokenTracker);
  let tamperedTracker = 'ACCEPTED';
  try {
    await harness.store.load({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID });
  } catch (error) {
    tamperedTracker = rejectionCode(error);
  }
  harness.repository.close();

  const otherCatalogHarness = await scenario();
  await otherCatalogHarness.store.save(saveInput(otherCatalogHarness));
  otherCatalogHarness.repository.close();
  const otherRepository = await openRepository(
    otherCatalogHarness.factory,
    otherCatalogHarness.locks,
    'tab-c',
  );
  const otherStore = createProgressSaveStore({
    repository: otherRepository,
    catalog: upgradedCampaignCatalog(),
  });
  let otherCatalog = 'ACCEPTED';
  try {
    await otherStore.load({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID });
  } catch (error) {
    otherCatalog = rejectionCode(error);
  }
  otherRepository.close();

  const emptyHarness = await scenario();
  const emptySave = await emptyHarness.store.save({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    worldEpoch: SAVE_WORLD_EPOCH,
    catalog: emptyHarness.catalog,
  });
  const unknownReset = await emptyHarness.store.reset({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    category: 'EVERYTHING' as never,
  });
  emptyHarness.repository.close();

  const lockFactory = createSaveFactory();
  const lockLocks = createSaveLocks();
  const writer = await openRepository(lockFactory, lockLocks, 'tab-a');
  const reader = await openRepository(lockFactory, lockLocks, 'tab-b');
  const lockHarness = await createSaveHarness({ factory: lockFactory, locks: lockLocks });
  lockHarness.repository.close();
  const writerRequired = await reader.commitPlayerSave(saveInput(lockHarness));
  writer.close();
  reader.close();

  return {
    tamperedCampaign,
    tamperedTracker,
    otherCatalog,
    emptySave: emptySave.status === 'REJECTED' ? emptySave.rejection.code : 'ACCEPTED',
    unknownReset: unknownReset.status === 'REJECTED' ? unknownReset.rejection.code : 'ACCEPTED',
    writerRequired:
      writerRequired.status === 'REJECTED' ? writerRequired.rejection.code : 'ACCEPTED',
  };
}

export async function runProgressSaveReport(): Promise<ProgressSaveReport> {
  const reload = await reloadScenario();
  const uniqueReward = await uniqueRewardScenario();
  const resetSettings = await resetSettingsScenario();
  const resetCampaign = await resetCampaignScenario();
  const resetProgress = await resetProgressScenario();
  const failedWrite = await failedWriteScenario();
  const defaults = await defaultsScenario();
  const refusals = await refusalScenario();

  const checks: SaveReportCheck[] = [];
  const check = (name: string, expected: unknown, actual: unknown, detail: string): void => {
    checks.push(
      Object.freeze({
        name,
        expected,
        actual,
        pass: canonical(expected) === canonical(actual),
        detail,
      }),
    );
  };

  // 1. Reload keeps the mission progress, the campaign and the settings.
  check(
    'reload.categories',
    { settings: true, campaign: true, progress: true },
    reload.categories,
    'All three categories read back.',
  );
  check('reload.instances', reload.instancesBefore, reload.instancesAfter, 'Instances restored.');
  check('reload.completed', reload.completedBefore, reload.completedAfter, 'Completions restored.');
  check(
    'reload.active',
    reload.activeBefore,
    reload.activeAfter,
    'The ACTIVE mission stays active.',
  );
  check('reload.xp', reload.xpBefore, reload.xpAfter, 'XP total identical after reload.');
  check('reload.unlocks', reload.unlocksBefore, reload.unlocksAfter, 'Unlock count identical.');
  check('reload.rewards', reload.rewardsBefore, reload.rewardsAfter, 'Granted rewards identical.');
  check('reload.settings', true, reload.settingsMatch, 'Every preference restored exactly.');
  check(
    'reload.remaps',
    'KeyI/ArrowDown/KeyV',
    reload.rerampsRestored,
    'Keyboard remaps restored.',
  );
  check(
    'reload.preferences',
    'mph/HIGH/audio:true/fov:92',
    reload.preferenceRestored,
    'Units, quality, audio and FOV restored.',
  );
  check(
    'reload.trackerFacts',
    true,
    reload.trackerFactsMatch,
    'Objectives, verdicts, versions and reasons identical.',
  );
  check(
    'reload.trackerDigest',
    true,
    reload.trackerDigestMatch,
    'Stored tracker digest equals the replayed one.',
  );
  check(
    'reload.campaignDigest',
    true,
    reload.campaignDigestMatch,
    'Campaign replay digest equals the live ledger.',
  );
  check('reload.trackerRow', 'ACTIVE', reload.trackerRow.status, 'Tracker row lifecycle status.');
  check('reload.rows', 2, reload.rowsRead, 'Two progress rows: one tracker, one campaign.');
  check(
    'reload.settingsSource',
    'STORED',
    reload.settingsSource,
    'Settings come from the stored row.',
  );

  // 2. The unique reward stays unique after a reload.
  check(
    'reward.repeatStatus',
    'DUPLICATE',
    uniqueReward.repeatStatus,
    'The same completion is a duplicate.',
  );
  check('reward.repeatXp', 0, uniqueReward.repeatXpGranted, 'A duplicate pays no XP.');
  check(
    'reward.repeatReasons',
    ['COMPLETION_ALREADY_SETTLED'],
    uniqueReward.repeatReasons,
    'Closed duplicate reason.',
  );
  check(
    'reward.xpAfterRepeat',
    uniqueReward.xpBeforeRepeat,
    uniqueReward.xpAfterRepeat,
    'XP unchanged by the duplicate.',
  );
  check(
    'reward.grantsAfterRepeat',
    uniqueReward.grantedBeforeRepeat,
    uniqueReward.grantedAfterRepeat,
    'Grant count unchanged.',
  );
  check(
    'reward.replayStatus',
    'NO_REWARD',
    uniqueReward.replayStatus,
    'A new attempt pays nothing.',
  );
  check('reward.replayXp', 0, uniqueReward.replayXpGranted, 'Reward identity already granted.');
  check(
    'reward.replayReasons',
    ['REWARD_ALREADY_GRANTED'],
    uniqueReward.replayReasons,
    'Closed replay reason.',
  );
  check(
    'reward.xpAfterReplay',
    uniqueReward.xpBeforeRepeat,
    uniqueReward.xpAfterReplay,
    'XP unchanged by the replay.',
  );
  check(
    'reward.completions',
    4,
    uniqueReward.completions,
    'Three completions plus the replayed attempt.',
  );

  // 3. Reset settings keeps the other categories.
  check(
    'resetSettings.deletedTracker',
    false,
    resetSettings.deletedTracker,
    'Mission progress untouched.',
  );
  check(
    'resetSettings.deletedCampaign',
    false,
    resetSettings.deletedCampaign,
    'Campaign untouched.',
  );
  check('resetSettings.keptTracker', true, resetSettings.keptTracker, 'Tracker row still stored.');
  check(
    'resetSettings.keptCampaign',
    true,
    resetSettings.keptCampaign,
    'Campaign row still stored.',
  );
  check(
    'resetSettings.changed',
    true,
    resetSettings.settingsChanged,
    'The reset really changed the settings.',
  );
  check(
    'resetSettings.values',
    'DEFAULTS',
    resetSettings.settingsAfter,
    'Documented 009 defaults restored.',
  );
  check(
    'resetSettings.bindings',
    'KeyW/km/h/MEDIUM',
    `${resetSettings.throttleAfter}/${resetSettings.unitsAfter}/${resetSettings.qualityAfter}`,
    'Defaults for remaps, units and quality.',
  );
  check(
    'resetSettings.trackerDigest',
    true,
    resetSettings.trackerDigestKept,
    'Tracker digest unchanged.',
  );
  check(
    'resetSettings.campaignDigest',
    true,
    resetSettings.campaignDigestKept,
    'Campaign digest unchanged.',
  );
  check(
    'resetSettings.completed',
    3,
    resetSettings.campaignCompletedKept,
    'Campaign keeps three completions.',
  );
  check(
    'resetSettings.reload',
    true,
    resetSettings.settingsSurviveReload,
    'The reset survives a reload.',
  );

  // 4. Reset campaign keeps settings and mission progress.
  check(
    'resetCampaign.deletedCampaign',
    true,
    resetCampaign.deletedCampaign,
    'Only the campaign row is deleted.',
  );
  check(
    'resetCampaign.deletedTracker',
    false,
    resetCampaign.deletedTracker,
    'Mission progress untouched.',
  );
  check('resetCampaign.keptTracker', true, resetCampaign.keptTracker, 'Tracker row still stored.');
  check(
    'resetCampaign.keptSettings',
    true,
    resetCampaign.keptSettings,
    'Settings row still stored.',
  );
  check(
    'resetCampaign.campaignAfter',
    'ABSENT',
    resetCampaign.campaignAfter,
    'No campaign row after the reset.',
  );
  check(
    'resetCampaign.trackerDigest',
    true,
    resetCampaign.trackerDigestKept,
    'Tracker digest unchanged.',
  );
  check('resetCampaign.settingsKept', true, resetCampaign.settingsKept, 'Settings identical.');
  check(
    'resetCampaign.completed',
    0,
    resetCampaign.campaignCompletedAfter,
    'No campaign completions remain.',
  );

  // 5. Reset progress keeps settings and the campaign.
  check(
    'resetProgress.deletedTracker',
    true,
    resetProgress.deletedTracker,
    'Only the tracker row is deleted.',
  );
  check(
    'resetProgress.deletedCampaign',
    false,
    resetProgress.deletedCampaign,
    'Campaign untouched.',
  );
  check(
    'resetProgress.keptCampaign',
    true,
    resetProgress.keptCampaign,
    'Campaign row still stored.',
  );
  check(
    'resetProgress.keptSettings',
    true,
    resetProgress.keptSettings,
    'Settings row still stored.',
  );
  check(
    'resetProgress.trackerAfter',
    'ABSENT',
    resetProgress.trackerAfter,
    'No tracker row after the reset.',
  );
  check(
    'resetProgress.campaignDigest',
    true,
    resetProgress.campaignDigestKept,
    'Campaign digest unchanged.',
  );
  check('resetProgress.settingsKept', true, resetProgress.settingsKept, 'Settings identical.');
  check(
    'resetProgress.restored',
    0,
    resetProgress.restoredInstances,
    'A reset progress opens an empty tracker.',
  );

  // 6. A failed write leaves the database exactly as it was.
  check('failedWrite.status', 'REJECTED', failedWrite.status, 'The write is reported as rejected.');
  check('failedWrite.code', 'TRANSACTION_ABORTED', failedWrite.code, 'The transaction aborted.');
  check('failedWrite.rows', failedWrite.rowsBefore, failedWrite.rowsAfter, 'No row was added.');
  check(
    'failedWrite.fingerprint',
    true,
    failedWrite.fingerprintMatch,
    'Stored rows byte-identical.',
  );
  check('failedWrite.revisions', true, failedWrite.revisionsMatch, 'Revisions did not move.');

  // 7. Missing preferences fall back to the documented defaults.
  check('defaults.source', 'DEFAULTS', defaults.settingsSource, 'No stored row means defaults.');
  check('defaults.empty', true, defaults.empty, 'An untouched session is empty.');
  check(
    'defaults.bindings',
    'KeyW/KeyS',
    `${defaults.throttle}/${defaults.brake}`,
    'Default remaps.',
  );
  check('defaults.units', 'km/h/m', defaults.units, 'Default units.');
  check('defaults.quality', 'MEDIUM', defaults.quality, 'Default quality preset.');
  check('defaults.audio', false, defaults.audioMuted, 'Default audio is not muted.');

  // 8. Closed refusals.
  check(
    'refusal.tamperedCampaign',
    'LEDGER_REPLAY_MISMATCH',
    refusals.tamperedCampaign,
    'A tampered campaign digest is refused.',
  );
  check(
    'refusal.tamperedTracker',
    'SAVE_DIGEST_MISMATCH',
    refusals.tamperedTracker,
    'A tampered tracker digest is refused.',
  );
  check(
    'refusal.otherCatalog',
    'CATALOG_MISMATCH',
    refusals.otherCatalog,
    'Another catalog cannot read the ledger.',
  );
  check(
    'refusal.emptySave',
    'SAVE_EMPTY',
    refusals.emptySave,
    'A save without a category is refused.',
  );
  check(
    'refusal.unknownReset',
    'SAVE_CATEGORY_UNKNOWN',
    refusals.unknownReset,
    'An unknown reset category is refused.',
  );
  check(
    'refusal.writerRequired',
    'WRITER_REQUIRED',
    refusals.writerRequired,
    'A page without the writer lock cannot save.',
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: SAVE_REPORT_VERSION,
    generatedBy: 'npm run save:progress',
    oracleRule:
      'Reîncărcarea este dovedită prin ciclu complet: trackerul este restaurat prin restore-ul real 116, jurnalul de campanie este reluat într-un ledger 125 proaspăt și comparat digest cu digest, iar aceeași finalizare este livrată din nou ledgerului restaurat. Izolarea unui reset de categorie este dovedită prin compararea celorlalte categorii byte cu byte.',
    reload,
    uniqueReward,
    resetSettings,
    resetCampaign,
    resetProgress,
    failedWrite,
    defaults,
    refusals,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      scenarios: 8,
      pass: passed === checks.length,
    }),
  });
}

function value(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  if (input === null) return 'null';
  return JSON.stringify(input);
}

function rows(entries: readonly (readonly [string, unknown])[]): string {
  return entries.map(([label, entry]) => `| ${label} | ${value(entry)} |`).join('\n');
}

export function progressSaveReportMarkdown(report: ProgressSaveReport): string {
  const checks = report.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${value(entry.expected)} | ${value(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
    )
    .join('\n');
  return `# 130 Raport de salvare a progresului

Transcript: [report.json](report.json). Generat de \`${report.generatedBy}\`;
transcriptul nu conține timp de perete și este determinist.

Versiune: \`${report.version}\`.

Regula de verificare: ${report.oracleRule}

## Reîncărcare completă

| Câmp | Valoare |
| --- | --- |
${rows([
  ['Categorii restaurate', report.reload.categories],
  ['Instanțe înainte/după', `${report.reload.instancesBefore}/${report.reload.instancesAfter}`],
  ['Finalizate înainte/după', `${report.reload.completedBefore}/${report.reload.completedAfter}`],
  ['Active înainte/după', `${report.reload.activeBefore}/${report.reload.activeAfter}`],
  ['XP înainte/după', `${report.reload.xpBefore}/${report.reload.xpAfter}`],
  ['Deblocări înainte/după', `${report.reload.unlocksBefore}/${report.reload.unlocksAfter}`],
  [
    'Recompense acordate înainte/după',
    `${report.reload.rewardsBefore}/${report.reload.rewardsAfter}`,
  ],
  ['Remapări restaurate', report.reload.rerampsRestored],
  ['Preferințe restaurate', report.reload.preferenceRestored],
  ['Fapte de tracker identice', report.reload.trackerFactsMatch],
  ['Sursa setărilor', report.reload.settingsSource],
  ['Rânduri de progres', report.reload.rowsRead],
])}

## Recompensa unică după reîncărcare

| Câmp | Valoare |
| --- | --- |
${rows([
  ['Aceeași finalizare', report.uniqueReward.repeatStatus],
  ['XP plătit', report.uniqueReward.repeatXpGranted],
  ['Motive', report.uniqueReward.repeatReasons],
  [
    'XP înainte/după duplicat',
    `${report.uniqueReward.xpBeforeRepeat}/${report.uniqueReward.xpAfterRepeat}`,
  ],
  [
    'Recompense înainte/după duplicat',
    `${report.uniqueReward.grantedBeforeRepeat}/${report.uniqueReward.grantedAfterRepeat}`,
  ],
  ['Reluare reală', report.uniqueReward.replayStatus],
  ['XP plătit la reluare', report.uniqueReward.replayXpGranted],
  ['Motive la reluare', report.uniqueReward.replayReasons],
  ['XP după reluare', report.uniqueReward.xpAfterReplay],
  ['Finalizări în ledger', report.uniqueReward.completions],
])}

## Reset de setări

| Câmp | Valoare |
| --- | --- |
${rows([
  ['Progres șters', report.resetSettings.deletedTracker],
  ['Campanie ștearsă', report.resetSettings.deletedCampaign],
  ['Progres păstrat', report.resetSettings.keptTracker],
  ['Campanie păstrată', report.resetSettings.keptCampaign],
  ['Setări schimbate', report.resetSettings.settingsChanged],
  ['Setări după reset', report.resetSettings.settingsAfter],
  [
    'Remapări/unități/calitate',
    `${report.resetSettings.throttleAfter}/${report.resetSettings.unitsAfter}/${report.resetSettings.qualityAfter}`,
  ],
  ['Digest progres păstrat', report.resetSettings.trackerDigestKept],
  ['Digest campanie păstrat', report.resetSettings.campaignDigestKept],
  ['Finalizări de campanie păstrate', report.resetSettings.campaignCompletedKept],
  ['Reset supraviețuiește reîncărcării', report.resetSettings.settingsSurviveReload],
])}

## Reset de campanie

| Câmp | Valoare |
| --- | --- |
${rows([
  ['Campanie ștearsă', report.resetCampaign.deletedCampaign],
  ['Progres șters', report.resetCampaign.deletedTracker],
  ['Progres păstrat', report.resetCampaign.keptTracker],
  ['Setări păstrate', report.resetCampaign.keptSettings],
  ['Campanie după reset', report.resetCampaign.campaignAfter],
  ['Digest progres păstrat', report.resetCampaign.trackerDigestKept],
  ['Setări identice', report.resetCampaign.settingsKept],
  ['Finalizări rămase', report.resetCampaign.campaignCompletedAfter],
])}

## Reset de progres

| Câmp | Valoare |
| --- | --- |
${rows([
  ['Progres șters', report.resetProgress.deletedTracker],
  ['Campanie ștearsă', report.resetProgress.deletedCampaign],
  ['Campanie păstrată', report.resetProgress.keptCampaign],
  ['Setări păstrate', report.resetProgress.keptSettings],
  ['Progres după reset', report.resetProgress.trackerAfter],
  ['Digest campanie păstrat', report.resetProgress.campaignDigestKept],
  ['Instanțe restaurate', report.resetProgress.restoredInstances],
])}

## Scriere eșuată la mijloc

| Câmp | Valoare |
| --- | --- |
${rows([
  ['Status', report.failedWrite.status],
  ['Cod', report.failedWrite.code],
  ['Rânduri înainte/după', `${report.failedWrite.rowsBefore}/${report.failedWrite.rowsAfter}`],
  ['Amprentă identică', report.failedWrite.fingerprintMatch],
  ['Revizii identice', report.failedWrite.revisionsMatch],
])}

## Valori implicite fără setări stocate

| Câmp | Valoare |
| --- | --- |
${rows([
  ['Sursa setărilor', report.defaults.settingsSource],
  ['Sesiune goală', report.defaults.empty],
  ['Remapări', `${report.defaults.throttle}/${report.defaults.brake}`],
  ['Unități', report.defaults.units],
  ['Calitate', report.defaults.quality],
  ['Audio mut', report.defaults.audioMuted],
])}

## Refuzuri închise

| Câmp | Valoare |
| --- | --- |
${rows([
  ['Campanie modificată', report.refusals.tamperedCampaign],
  ['Progres modificat', report.refusals.tamperedTracker],
  ['Alt catalog', report.refusals.otherCatalog],
  ['Salvare goală', report.refusals.emptySave],
  ['Categorie necunoscută', report.refusals.unknownReset],
  ['Fără lock de scriitor', report.refusals.writerRequired],
])}

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
${checks}

## Sumar

- Verificări: ${report.summary.passed}/${report.summary.checks}
- Scenarii: ${report.summary.scenarios}
- General: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
