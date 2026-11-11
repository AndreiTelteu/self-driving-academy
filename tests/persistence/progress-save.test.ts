import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROGRESS_SAVE_VERSION,
  PersistenceError,
  createCampaignProgressRecorder,
  restoreMissionProgress,
  summarizeTracker,
  trackerFacts,
} from '../../src/persistence/index';
import type { PersistedRecord, PlayerSaveRows } from '../../src/persistence/index';
import { createDefaultSettings } from '../../src/settings/index';
import { campaignOrder } from '../../src/missions/index';
import type { MissionInstance, MissionTracker } from '../../src/missions/index';
import { completeMission, completionTick } from '../missions/mission-rewards-fixture';
import { upgradedCampaignCatalog } from '../missions/mission-rewards-fixture';
import { createRewardsTracker } from '../missions/mission-rewards-fixture';
import {
  SAVE_PLAYER_ID,
  SAVE_SESSION_ID,
  SAVE_WORLD_EPOCH,
  createSaveFactory,
  createSaveHarness,
  createSaveLocks,
  customSettings,
  openRepository,
  reopen,
  saveInput,
  startActiveMission,
  trackerWithFailure,
} from './progress-save-fixture';
import { activation, profileVersion } from './fixtures';

function rowsFingerprint(rows: PlayerSaveRows): string {
  return JSON.stringify({ progress: rows.progress, settings: rows.settings });
}

/** Replays a terminal attempt and completes the next one through the real 116 lifecycle. */
function nextAttempt(tracker: MissionTracker, instance: MissionInstance): MissionInstance {
  const startTick = Math.max(completionTick(instance) + 10, tracker.stats().tick + 10);
  tracker.replay({ instanceId: instance.instanceId, tick: startTick });
  return completeMission(tracker, instance.missionId, startTick);
}

test('130 a reload restores the mission tracker, the settings and the campaign', async () => {
  const harness = await createSaveHarness();
  const activeId = startActiveMission(harness.tracker, harness.run.nextTick);
  const factsBefore = trackerFacts(harness.tracker.snapshot());
  const liveRewards = harness.campaign.ledger.rewards();
  const liveUnlocks = harness.campaign.ledger.unlocks();
  const liveProgress = harness.campaign.ledger.progress();
  const saved = await harness.store.save(saveInput(harness));
  assert.equal(saved.status, 'COMMITTED');
  assert.deepEqual(saved.status === 'COMMITTED' ? saved.value.categories : [], [
    'SETTINGS',
    'CAMPAIGN',
    'PROGRESS',
  ]);
  harness.repository.close();

  const second = await reopen({
    factory: harness.factory,
    locks: harness.locks,
    catalog: harness.catalog,
  });
  try {
    const opened = await second.store.open({
      sessionId: SAVE_SESSION_ID,
      playerId: SAVE_PLAYER_ID,
    });
    assert.equal(opened.restored, true);
    assert.equal(opened.save.empty, false);
    assert.deepEqual(opened.save.categories, { settings: true, campaign: true, progress: true });
    assert.deepEqual(opened.save.settings, customSettings());
    assert.equal(opened.save.settingsSource, 'STORED');
    assert.deepEqual(trackerFacts(opened.tracker.snapshot()), factsBefore);
    assert.equal(opened.instances.length, harness.tracker.instances().length);
    assert.deepEqual(
      opened.tracker.instances().map((instance) => instance.state),
      harness.tracker.instances().map((instance) => instance.state),
    );
    assert.equal(opened.tracker.instance(activeId)?.state, 'ACTIVE');
    assert.equal(opened.instances.filter((instance) => instance.state === 'COMPLETED').length, 3);

    const campaign = opened.save.campaign;
    assert.notEqual(campaign, null);
    if (campaign === null) return;
    assert.equal(campaign.rewards.totals.xp, liveRewards.totals.xp);
    assert.equal(campaign.rewards.totals.granted, liveRewards.totals.granted);
    assert.equal(campaign.unlocks.counts.granted, liveUnlocks.counts.granted);
    assert.deepEqual(campaign.progress.completedMissionIds, liveProgress.completedMissionIds);
    assert.deepEqual(campaign.progress.availableMissionIds, liveProgress.availableMissionIds);
    assert.equal(campaign.counts.completed, 3);
    assert.equal(campaign.counts.resets, 0);
    assert.equal(campaign.digest.length, 64);
  } finally {
    second.repository.close();
  }
});

test('130 the same completion cannot pay twice after a reload', async () => {
  const harness = await createSaveHarness();
  const firstCompletion = harness.run.completions[0]!;
  const xpBefore = harness.campaign.ledger.rewards().totals.xp;
  const grantsBefore = harness.campaign.ledger.rewards().totals.granted;
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  harness.repository.close();

  const second = await reopen({
    factory: harness.factory,
    locks: harness.locks,
    catalog: harness.catalog,
  });
  try {
    const opened = await second.store.open({
      sessionId: SAVE_SESSION_ID,
      playerId: SAVE_PLAYER_ID,
    });
    assert.notEqual(opened.save.campaign, null);
    const ledger = opened.save.campaign!.ledger;
    assert.equal(ledger.rewards().totals.xp, xpBefore);

    // The very same completed 116 instance is delivered again after the reload.
    const repeated = ledger.settle({ instance: firstCompletion.instance });
    assert.equal(repeated.status, 'DUPLICATE');
    assert.equal(repeated.xpGranted, 0);
    assert.equal(repeated.rewardsGranted, 0);
    assert.deepEqual(repeated.duplicateReasons, ['COMPLETION_ALREADY_SETTLED']);
    assert.equal(ledger.rewards().totals.xp, xpBefore);
    assert.equal(ledger.rewards().totals.granted, grantsBefore);

    // A real replay creates attempt 2: a new completion, but the authored reward is the same one.
    const replayed = nextAttempt(opened.tracker, firstCompletion.instance);
    const settlement = ledger.settle({ instance: replayed });
    assert.equal(settlement.status, 'NO_REWARD');
    assert.equal(settlement.xpGranted, 0);
    assert.equal(settlement.rewardsGranted, 0);
    assert.deepEqual(settlement.duplicateReasons, ['REWARD_ALREADY_GRANTED']);
    assert.equal(ledger.rewards().totals.xp, xpBefore);
    assert.equal(ledger.rewards().totals.granted, grantsBefore);
    assert.equal(ledger.stats().completions, 4);
  } finally {
    second.repository.close();
  }
});

test('130 a failed mission keeps its verdict, version and reason after a reload', async () => {
  const harness = await createSaveHarness();
  const failing = trackerWithFailure();
  assert.equal(failing.instances()[0]!.state, 'FAILED');
  const saved = await harness.store.save(
    saveInput(harness, {
      tracker: failing.snapshot(),
      campaign: { ledger: harness.campaign.ledger, events: harness.campaign.events() },
    }),
  );
  assert.equal(saved.status, 'COMMITTED');
  harness.repository.close();

  const second = await reopen({
    factory: harness.factory,
    locks: harness.locks,
    catalog: harness.catalog,
  });
  try {
    const opened = await second.store.open({
      sessionId: SAVE_SESSION_ID,
      playerId: SAVE_PLAYER_ID,
    });
    const restored = opened.tracker.instances()[0]!;
    assert.equal(restored.state, 'FAILED');
    assert.equal(restored.failureReason, 'PLAYER_ABANDONED');
    assert.equal(restored.failedTick, 20);
    assert.equal(restored.missionVersion, failing.catalog().missions[0]!.version);
    assert.deepEqual(
      trackerFacts(opened.tracker.snapshot()).instances[0]!.objectives,
      trackerFacts(failing.snapshot()).instances[0]!.objectives,
    );
  } finally {
    second.repository.close();
  }
});

test('130 settings reset keeps the campaign ledger and the mission progress', async () => {
  const harness = await createSaveHarness();
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  const before = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  assert.deepEqual(before.settings, customSettings());

  const reset = await harness.store.reset({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    category: 'SETTINGS',
  });
  assert.equal(reset.status, 'COMMITTED');
  if (reset.status !== 'COMMITTED') return;
  assert.equal(reset.value.deleted.tracker, false);
  assert.equal(reset.value.deleted.campaign, false);
  assert.equal(reset.value.kept.tracker, true);
  assert.equal(reset.value.kept.campaign, true);
  assert.equal(reset.value.kept.settings, true);
  assert.equal(reset.value.settingsChanged, true);

  const after = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  assert.deepEqual(after.settings, createDefaultSettings(SAVE_PLAYER_ID, 5));
  assert.equal(after.settings.input.bindings.throttle, 'KeyW');
  assert.equal(after.settings.input.bindings.camera, 'KeyC');
  assert.equal(after.settings.units.speed, 'km/h');
  assert.equal(after.settings.quality.preset, 'MEDIUM');
  assert.equal(after.settings.audio.muted, false);
  assert.equal(after.tracker?.digest, before.tracker?.digest);
  assert.equal(after.campaign?.digest, before.campaign?.digest);
  assert.deepEqual(after.campaign?.counts, before.campaign?.counts);
  harness.repository.close();

  // The reset survives a reload: settings stay at the documented defaults.
  const second = await reopen({
    factory: harness.factory,
    locks: harness.locks,
    catalog: harness.catalog,
  });
  try {
    const opened = await second.store.open({
      sessionId: SAVE_SESSION_ID,
      playerId: SAVE_PLAYER_ID,
    });
    assert.deepEqual(opened.save.settings, createDefaultSettings(SAVE_PLAYER_ID, 5));
    assert.equal(opened.restored, true);
    assert.equal(opened.save.campaign?.counts.completed, 3);
  } finally {
    second.repository.close();
  }
});

test('130 campaign reset keeps the settings and the mission progress', async () => {
  const harness = await createSaveHarness();
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  const before = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  const reset = await harness.store.reset({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    category: 'CAMPAIGN',
  });
  assert.equal(reset.status, 'COMMITTED');
  if (reset.status === 'COMMITTED') {
    assert.equal(reset.value.deleted.campaign, true);
    assert.equal(reset.value.deleted.tracker, false);
    assert.equal(reset.value.kept.tracker, true);
    assert.equal(reset.value.kept.settings, true);
  }
  const after = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  assert.equal(after.campaign, null);
  assert.deepEqual(after.settings, before.settings);
  assert.equal(after.tracker?.digest, before.tracker?.digest);
  assert.deepEqual(after.categories, { settings: true, campaign: false, progress: true });
  harness.repository.close();
});

test('130 progress reset keeps the settings and the campaign ledger', async () => {
  const harness = await createSaveHarness();
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  const before = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  const reset = await harness.store.reset({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    category: 'PROGRESS',
  });
  assert.equal(reset.status, 'COMMITTED');
  if (reset.status === 'COMMITTED') {
    assert.equal(reset.value.deleted.tracker, true);
    assert.equal(reset.value.deleted.campaign, false);
    assert.equal(reset.value.kept.campaign, true);
    assert.equal(reset.value.kept.settings, true);
  }
  const after = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  assert.equal(after.tracker, null);
  assert.deepEqual(after.settings, before.settings);
  assert.equal(after.campaign?.digest, before.campaign?.digest);
  const restored = restoreMissionProgress({ save: after, catalog: harness.catalog });
  assert.equal(restored.restored, false);
  assert.equal(restored.instances.length, 0);
  harness.repository.close();
});

test('130 no category reset deletes a profile', async () => {
  const harness = await createSaveHarness();
  const profile = profileVersion();
  const seeded = await harness.repository.commitProfileActivation({
    profile,
    activation: activation(),
  });
  assert.equal(seeded.status, 'COMMITTED');
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  for (const category of ['SETTINGS', 'CAMPAIGN', 'PROGRESS'] as const) {
    const outcome = await harness.store.reset({
      sessionId: SAVE_SESSION_ID,
      playerId: SAVE_PLAYER_ID,
      category,
    });
    assert.equal(outcome.status, 'COMMITTED');
  }
  assert.equal((await harness.repository.getProfile('profile-1@1'))?.checksum, profile.checksum);
  assert.equal((await harness.repository.getActivation('profile-1'))?.versionId, 'profile-1@1');
  const stats = await harness.repository.stats();
  assert.equal(stats.counts.profiles, 1);
  assert.equal(stats.counts.profileActivations, 1);
  assert.equal(stats.counts.progress, 0);
  harness.repository.close();
});

test('130 a failure before the commit leaves every row exactly as it was', async () => {
  const harness = await createSaveHarness();
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  const before = rowsFingerprint(
    await harness.repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID),
  );
  const revisionsBefore = (
    await harness.repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID)
  ).progress.map((row) => (row as PersistedRecord).revision);

  startActiveMission(harness.tracker, harness.run.nextTick);
  const failed = await harness.store.save(
    saveInput(harness, {
      settings: createDefaultSettings(SAVE_PLAYER_ID),
      tracker: harness.tracker.snapshot(),
    }),
    {
      beforeCommit: () => {
        throw new Error('simulated crash before commit');
      },
    },
  );
  assert.equal(failed.status, 'REJECTED');
  assert.equal(failed.status === 'REJECTED' ? failed.rejection.code : null, 'TRANSACTION_ABORTED');
  const after = rowsFingerprint(
    await harness.repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID),
  );
  assert.equal(after, before);
  const revisionsAfter = (
    await harness.repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID)
  ).progress.map((row) => (row as PersistedRecord).revision);
  assert.deepEqual(revisionsAfter, revisionsBefore);
  harness.repository.close();
});

test('130 the campaign log must replay into the live 125 ledger', async () => {
  const harness = await createSaveHarness();
  const events = harness.campaign.events();
  const tampered = events.slice(0, -1);
  const saved = await harness.store.save(
    saveInput(harness, { campaign: { ledger: harness.campaign.ledger, events: tampered } }),
  );
  assert.equal(saved.status, 'REJECTED');
  assert.equal(saved.status === 'REJECTED' ? saved.rejection.code : null, 'LEDGER_REPLAY_MISMATCH');
  const stats = await harness.repository.stats();
  assert.equal(stats.counts.progress, 0);
  assert.equal(stats.counts.settings, 0);
  harness.repository.close();
});

test('130 a campaign log from another catalog is refused on load', async () => {
  const harness = await createSaveHarness();
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  harness.repository.close();
  const second = await reopen({
    factory: harness.factory,
    locks: harness.locks,
    catalog: upgradedCampaignCatalog(),
  });
  try {
    await assert.rejects(
      second.store.load({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID }),
      (error: unknown) => error instanceof PersistenceError && error.code === 'CATALOG_MISMATCH',
    );
  } finally {
    second.repository.close();
  }
});

test('130 a snapshot the 116 tracker cannot restore is refused', async () => {
  const harness = await createSaveHarness();
  const snapshot = harness.tracker.snapshot();
  const saved = await harness.store.save(saveInput(harness, { tracker: { ...snapshot, tick: 0 } }));
  assert.equal(saved.status, 'REJECTED');
  assert.equal(
    saved.status === 'REJECTED' ? saved.rejection.code : null,
    'TRACKER_SNAPSHOT_INVALID',
  );
  const stats = await harness.repository.stats();
  assert.equal(stats.counts.progress, 0);
  harness.repository.close();
});

test('130 an empty save and an unknown reset category are refused', async () => {
  const harness = await createSaveHarness();
  const empty = await harness.store.save({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    worldEpoch: SAVE_WORLD_EPOCH,
    catalog: harness.catalog,
  });
  assert.equal(empty.status, 'REJECTED');
  assert.equal(empty.status === 'REJECTED' ? empty.rejection.code : null, 'SAVE_EMPTY');
  const unknown = await harness.store.reset({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
    category: 'EVERYTHING' as never,
  });
  assert.equal(unknown.status, 'REJECTED');
  assert.equal(
    unknown.status === 'REJECTED' ? unknown.rejection.code : null,
    'SAVE_CATEGORY_UNKNOWN',
  );
  harness.repository.close();
});

test('130 saving the same state twice keeps the content and moves the revision', async () => {
  const harness = await createSaveHarness();
  const first = await harness.store.save(saveInput(harness));
  const second = await harness.store.save(saveInput(harness));
  assert.equal(first.status, 'COMMITTED');
  assert.equal(second.status, 'COMMITTED');
  if (first.status !== 'COMMITTED' || second.status !== 'COMMITTED') return;
  assert.equal(first.value.tracker?.revision, 1);
  assert.equal(second.value.tracker?.revision, 2);
  assert.equal(first.value.campaign?.revision, 1);
  assert.equal(second.value.campaign?.revision, 2);
  assert.equal(first.value.tracker?.digest, second.value.tracker?.digest);
  const loaded = await harness.store.load({
    sessionId: SAVE_SESSION_ID,
    playerId: SAVE_PLAYER_ID,
  });
  assert.equal(loaded.tracker?.digest, first.value.tracker?.digest);
  assert.equal(loaded.campaign?.counts.completed, 3);
  harness.repository.close();
});

test('130 a page without the writer lock cannot save', async () => {
  const factory = createSaveFactory();
  const locks = createSaveLocks();
  const first = await openRepository(factory, locks, 'tab-a');
  const second = await openRepository(factory, locks, 'tab-b');
  const catalog = createRewardsTracker().catalog();
  const tracker = createRewardsTracker();
  const campaign = createCampaignProgressRecorder({ catalog });
  try {
    const outcome = await second.commitPlayerSave(
      saveInput(
        { tracker, campaign, catalog },
        { campaign: { ledger: campaign.ledger, events: [] } },
      ),
    );
    assert.equal(outcome.status, 'REJECTED');
    assert.equal(outcome.status === 'REJECTED' ? outcome.rejection.code : null, 'WRITER_REQUIRED');
    const stats = await first.stats();
    assert.equal(stats.counts.progress, 0);
    assert.equal(stats.counts.settings, 0);
  } finally {
    first.close();
    second.close();
  }
});

test('130 one save only reads back its own session', async () => {
  const harness = await createSaveHarness();
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  assert.equal(
    (
      await harness.store.save({
        sessionId: 'session-130-other',
        playerId: SAVE_PLAYER_ID,
        worldEpoch: SAVE_WORLD_EPOCH,
        catalog: harness.catalog,
        campaign: { ledger: harness.campaign.ledger, events: harness.campaign.events() },
      })
    ).status,
    'COMMITTED',
  );
  const own = await harness.store.load({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID });
  assert.equal(own.categories.campaign, true);
  assert.equal(own.campaign?.counts.completed, 3);
  const other = await harness.store.load({
    sessionId: 'session-130-other',
    playerId: SAVE_PLAYER_ID,
  });
  assert.equal(other.categories.campaign, true);
  assert.equal(other.campaign?.counts.completed, 3);
  assert.equal(other.tracker, null);
  harness.repository.close();
});

test('130 a player without stored settings receives the documented defaults', async () => {
  const harness = await createSaveHarness();
  const loaded = await harness.store.load({
    sessionId: 'session-empty',
    playerId: 'player:empty',
  });
  assert.equal(loaded.empty, true);
  assert.equal(loaded.settingsSource, 'DEFAULTS');
  assert.deepEqual(loaded.settings, createDefaultSettings('player:empty'));
  assert.equal(loaded.tracker, null);
  assert.equal(loaded.campaign, null);
  assert.equal(loaded.worldEpoch, null);
  harness.repository.close();
});

test('130 the tracker summary is derived from the stored snapshot', async () => {
  const harness = await createSaveHarness();
  startActiveMission(harness.tracker, harness.run.nextTick);
  const summary = summarizeTracker(harness.tracker.snapshot(), harness.catalog);
  assert.equal(summary.missions, campaignOrder(harness.catalog).length);
  assert.equal(summary.instances, 4);
  assert.equal(summary.active, 1);
  assert.equal(summary.completed, 3);
  assert.equal(summary.failed, 0);
  assert.equal(summary.status, 'ACTIVE');
  assert.equal(summary.attempts, 4);
  assert.deepEqual(summary.completedMissionIds, [
    'campaign-1-first-taxi',
    'campaign-2-first-demonstration',
    'campaign-3-following-distance',
  ]);
  const saved = await harness.store.save(saveInput(harness));
  assert.equal(saved.status, 'COMMITTED');
  if (saved.status === 'COMMITTED') {
    assert.equal(saved.value.tracker?.status, 'ACTIVE');
    assert.equal(saved.value.version, PROGRESS_SAVE_VERSION);
    assert.equal(saved.value.campaign?.status, 'ACTIVE');
  }
  harness.repository.close();
});

test('130 the recorder keeps the real 125 answers while it records the log', async () => {
  const harness = await createSaveHarness();
  const recorder = createCampaignProgressRecorder({ catalog: harness.catalog });
  const completion = harness.run.completions[0]!;
  const result = recorder.settleInstance(completion.instance);
  assert.equal(result.status, 'GRANTED');
  assert.equal(result.xpGranted > 0, true);
  assert.equal(recorder.events().length, 1);
  assert.equal(recorder.events()[0]!.kind, 'SETTLE');
  assert.equal(recorder.ledger.rewards().totals.xp, result.xpGranted);
  assert.equal(recorder.ledger.progress().counts.completed, 1);
  harness.repository.close();
});

test('130 a new completion settles after a reload but the same one does not', async () => {
  const harness = await createSaveHarness();
  const fresh = completeMission(
    harness.tracker,
    'campaign-4-stops-and-signals',
    harness.run.nextTick,
  );
  const settlement = harness.campaign.settleInstance(fresh);
  assert.equal(settlement.status, 'GRANTED');
  const xp = harness.campaign.ledger.rewards().totals.xp;
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  harness.repository.close();

  const second = await reopen({
    factory: harness.factory,
    locks: harness.locks,
    catalog: harness.catalog,
  });
  try {
    const opened = await second.store.open({
      sessionId: SAVE_SESSION_ID,
      playerId: SAVE_PLAYER_ID,
    });
    assert.equal(opened.save.campaign?.rewards.totals.xp, xp);
    const outcome = opened.save.campaign!.ledger.settle({ instance: fresh });
    assert.equal(outcome.status, 'DUPLICATE');
    assert.equal(opened.save.campaign!.ledger.rewards().totals.xp, xp);
  } finally {
    second.repository.close();
  }
});

test('130 a stored campaign row that no longer replays is refused', async () => {
  const harness = await createSaveHarness();
  assert.equal((await harness.store.save(saveInput(harness))).status, 'COMMITTED');
  const rows = await harness.repository.readPlayerSave(SAVE_SESSION_ID, SAVE_PLAYER_ID);
  const campaignRow = rows.progress.find(
    (row) => (row as PersistedRecord).body.kind === 'CAMPAIGN_LEDGER',
  ) as PersistedRecord;
  assert.notEqual(campaignRow, undefined);
  const broken = {
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
  assert.equal((await harness.repository.putProgress(broken)).status, 'COMMITTED');
  await assert.rejects(
    harness.store.load({ sessionId: SAVE_SESSION_ID, playerId: SAVE_PLAYER_ID }),
    (error: unknown) =>
      error instanceof PersistenceError && error.code === 'LEDGER_REPLAY_MISMATCH',
  );
  harness.repository.close();
});
