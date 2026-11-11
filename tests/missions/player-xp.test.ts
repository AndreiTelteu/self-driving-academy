import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  LEVEL_STEP_XP,
  MAX_PLAYER_LEVEL,
  PLAYER_PROGRESS_LIMITS,
  PLAYER_PROGRESS_VERSION,
  PLAYER_XP_POLICY,
  XP_LEVEL_VERSION,
  XP_MICRO_PER_XP,
  XP_PER_ACTIVE_MINUTE,
  XP_RULE_VERSION,
  activeTimeCreditId,
  activeTimeMicroXp,
  activeTimeSkipReasons,
  createPlayerProgress,
  levelForXpMicro,
  levelThresholdMicroXp,
  levelThresholdXp,
  microXpToXp,
  parsePlayerProgress,
  playerControlModes,
  playerTimeScopes,
  xpCauseTypes,
  xpCreditOutcomes,
  xpEntryId,
  xpSkipReasons,
} from '../../src/missions';
import { createMissionRewardsLedger, recordDailyReward } from '../../src/missions';
import type { MissionCompletionResult, MissionSettledReward } from '../../src/missions';
import {
  XP_FIXTURE_PLAYER,
  XP_FIXTURE_PROFILE_ID,
  XP_FIXTURE_START_MS,
  activeWindow,
  advanceDaily,
  completedMissionSettlement,
  createXpProfileStore,
  createXpProgress,
  dailyReward,
  failingEconomy,
  replaySettlement,
  xpProfileParameters,
} from './player-xp-fixture';
import { createMissionTestCatalog, createMissionTestTracker, testMission } from './mission-fixture';
import { runPlayerXpReport } from './player-xp-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '213-player-xp', 'report.json');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function refuses(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

function xpRewardOf(settlement: MissionCompletionResult): MissionSettledReward | undefined {
  return settlement.rewards.find((row) => row.kind === 'XP');
}

test('213 contract vocabulary, thresholds and limits are closed', () => {
  assert.equal(PLAYER_PROGRESS_VERSION, '213-player-progress-v1');
  assert.equal(XP_RULE_VERSION, '213-xp-rules-v1');
  assert.equal(XP_LEVEL_VERSION, '213-xp-levels-v1');
  assert.equal(XP_MICRO_PER_XP, 1_000_000);
  assert.equal(XP_PER_ACTIVE_MINUTE, 1);
  assert.equal(MAX_PLAYER_LEVEL, 50);
  assert.equal(LEVEL_STEP_XP, 100);
  assert.equal(PLAYER_PROGRESS_LIMITS.entries, 8_192);
  assert.equal(PLAYER_PROGRESS_LIMITS.maximumLevel, MAX_PLAYER_LEVEL);
  assert.deepEqual([...xpCauseTypes], ['MISSION_REWARD', 'DAILY_REWARD', 'ACTIVE_TIME']);
  assert.deepEqual([...playerTimeScopes], ['ACADEMY', 'REPLAY', 'EXPERIMENT', 'HAOS']);
  assert.deepEqual([...playerControlModes], ['MANUAL', 'LEARNING', 'AUTO']);
  assert.deepEqual([...xpCreditOutcomes], ['CREDITED', 'DUPLICATE', 'SKIPPED']);
  assert.deepEqual(
    [...activeTimeSkipReasons],
    [
      'PAUSED',
      'NOT_FOCUSED',
      'BACKGROUND',
      'AFK',
      'OUTSIDE_ACADEMY',
      'WINDOW_TOO_LONG',
      'ZERO_DURATION',
      'STALE_WINDOW',
    ],
  );
  assert.deepEqual(
    [...xpSkipReasons],
    ['NO_XP_REWARD', 'REWARD_ALREADY_GRANTED', 'DUPLICATE_DELIVERY', 'ZERO_AMOUNT'],
  );
  assert.equal(PLAYER_XP_POLICY.timeXp.xpPerActiveMinute, 1);
  assert.equal(PLAYER_XP_POLICY.timeXp.rounding, 'NONE');
  assert.equal(PLAYER_XP_POLICY.timeXp.fractions, 'PRESERVED');
  assert.equal(PLAYER_XP_POLICY.counts.auto, true);
  for (const excluded of [
    'paused',
    'background',
    'focusLost',
    'afk',
    'replay',
    'experiments',
    'offline',
    'haos',
  ] as const)
    assert.equal(PLAYER_XP_POLICY.counts[excluded], false, excluded);
  assert.equal(PLAYER_XP_POLICY.monotone.debits, 0);
  assert.equal(PLAYER_XP_POLICY.monotone.negativeCredits, false);
  assert.equal(PLAYER_XP_POLICY.monotone.penalties, 'NONE');
});

test('213 the level table is a monotone derivation of the balance', () => {
  assert.equal(levelThresholdXp(1), 0);
  assert.equal(levelThresholdXp(2), 100);
  assert.equal(levelThresholdXp(3), 300);
  assert.equal(levelThresholdXp(4), 600);
  assert.equal(levelThresholdXp(50), 122_500);
  for (let level = 2; level <= MAX_PLAYER_LEVEL; level += 1)
    assert.ok(levelThresholdMicroXp(level) > levelThresholdMicroXp(level - 1));
  assert.equal(levelForXpMicro(0), 1);
  assert.equal(levelForXpMicro(99_999_999), 1);
  assert.equal(levelForXpMicro(100 * XP_MICRO_PER_XP), 2);
  assert.equal(levelForXpMicro(299 * XP_MICRO_PER_XP), 2);
  assert.equal(levelForXpMicro(300 * XP_MICRO_PER_XP), 3);
  assert.equal(levelForXpMicro(levelThresholdMicroXp(50)), 50);
  assert.equal(levelForXpMicro(levelThresholdMicroXp(50) * 4), 50);
  refuses(() => levelThresholdXp(0), /outside the 213 threshold table/);
  refuses(() => levelThresholdXp(51), /outside the 213 threshold table/);
});

test('213 active time accrual is exact integer micro-XP and keeps fractions', () => {
  assert.equal(activeTimeMicroXp(0), 0);
  assert.equal(activeTimeMicroXp(1), 16);
  assert.equal(activeTimeMicroXp(3), 50);
  assert.equal(activeTimeMicroXp(30_000), 500_000);
  assert.equal(activeTimeMicroXp(60_000), XP_PER_ACTIVE_MINUTE * XP_MICRO_PER_XP);
  assert.equal(activeTimeMicroXp(70_000), 1_166_666);
  assert.equal(microXpToXp(500_000), 0.5);
  assert.equal(microXpToXp(1_166_666), 1.166666);
});

test('213 mission XP is paid once through the 125 identity and never on replay', () => {
  const scenario = completedMissionSettlement();
  const progress = createXpProgress();
  const reward = xpRewardOf(scenario.settlement);
  assert.ok(reward !== undefined);
  assert.equal(reward.kind, 'XP');
  assert.equal(scenario.settlement.xpGranted, 100);
  assert.equal(scenario.settlement.profileWrites, 0);

  const credited = progress.creditMission({
    settlement: scenario.settlement,
    observedAtMs: XP_FIXTURE_START_MS,
  });
  assert.equal(credited.status, 'CREDITED');
  assert.equal(credited.credited, 1);
  assert.equal(credited.creditedXp, 100);
  assert.equal(credited.rows.length, 1);
  assert.equal(credited.rows[0]?.causeId, reward.rewardId);
  assert.equal(
    credited.rows[0]?.entryId,
    xpEntryId(XP_FIXTURE_PLAYER, 'MISSION_REWARD', reward.rewardId),
  );

  let read = progress.read();
  assert.equal(read.xpBalance, 100);
  assert.equal(read.xpBalanceMicroXp, 100 * XP_MICRO_PER_XP);
  assert.equal(read.level, 2);
  assert.equal(read.entries.length, 1);
  const missionEntry = read.entries[0];
  assert.ok(missionEntry !== undefined);
  assert.equal(missionEntry.evidence.source, 'MISSION_REWARD');
  if (missionEntry.evidence.source === 'MISSION_REWARD') {
    assert.equal(missionEntry.evidence.missionId, scenario.settlement.missionId);
    assert.equal(missionEntry.evidence.completionId, scenario.settlement.completionId);
    assert.equal(missionEntry.evidence.definitionRewardId, reward.definitionRewardId);
    assert.equal(missionEntry.evidence.namespace, scenario.settlement.namespace);
  }
  assert.equal(missionEntry.tick, scenario.settlement.completedTick);

  // The same settlement delivered twice is a duplicate, both at the XP ledger and at the 125 ledger.
  const repeated = scenario.ledger.settle({ instance: scenario.instance });
  assert.equal(repeated.status, 'DUPLICATE');
  const again = progress.creditMission({
    settlement: repeated,
    observedAtMs: XP_FIXTURE_START_MS + 1_000,
  });
  assert.equal(again.status, 'SKIPPED');
  assert.equal(again.creditedXp, 0);
  assert.equal(again.rows[0]?.reason, 'REWARD_ALREADY_GRANTED');
  read = progress.read();
  assert.equal(read.xpBalance, 100);
  assert.equal(read.entries.length, 1);
  assert.equal(read.counters.creditSkips.REWARD_ALREADY_GRANTED, 1);

  // A real 116 replay produces a new completion but the same authored reward identity: zero XP.
  const replay = replaySettlement(scenario);
  assert.notEqual(replay.completionId, scenario.settlement.completionId);
  assert.equal(replay.xpGranted, 0);
  const replayed = progress.creditMission({
    settlement: replay,
    observedAtMs: XP_FIXTURE_START_MS + 2_000,
  });
  assert.equal(replayed.creditedXp, 0);
  assert.equal(replayed.rows[0]?.reason, 'REWARD_ALREADY_GRANTED');
  assert.equal(progress.read().xpBalance, 100);
  assert.equal(progress.read().level, 2);
});

test('213 daily XP is paid once by the 211 reward identity', () => {
  const daily = dailyReward();
  const progress = createXpProgress();
  const credited = progress.creditDaily({ record: daily.record, instance: daily.instance });
  assert.equal(credited.status, 'CREDITED');
  assert.equal(credited.creditedXp, 100);
  assert.equal(credited.rows[0]?.causeId, daily.record.rewardId);
  const read = progress.read();
  assert.equal(read.xpBalance, 100);
  const dailyEntry = read.entries[0];
  assert.ok(dailyEntry !== undefined);
  assert.equal(dailyEntry.causeType, 'DAILY_REWARD');
  assert.equal(dailyEntry.realTimeMs, daily.record.grantedAtMs);
  assert.equal(dailyEntry.evidence.source, 'DAILY_REWARD');
  if (dailyEntry.evidence.source === 'DAILY_REWARD') {
    assert.equal(dailyEntry.evidence.instanceId, daily.instance.instanceId);
    assert.equal(dailyEntry.evidence.dailyDate, daily.record.dailyDate);
    assert.equal(dailyEntry.evidence.rewardXp, 100);
  }

  const rewardedAgain = recordDailyReward({
    state: daily.state,
    instanceId: daily.instance.instanceId,
    grantedAtMs: daily.record.grantedAtMs + 5_000,
  });
  assert.equal(rewardedAgain.granted, false);
  assert.equal(rewardedAgain.duplicate, true);
  assert.equal(rewardedAgain.record.rewardId, daily.record.rewardId);
  const repeated = progress.creditDaily({
    record: rewardedAgain.record,
    instance: daily.instance,
  });
  assert.equal(repeated.status, 'DUPLICATE');
  assert.equal(repeated.creditedXp, 0);
  assert.equal(progress.read().xpBalance, 100);
  assert.equal(progress.read().entries.length, 1);
});

test('213 active minutes preserve fractions and the running balance is their exact sum', () => {
  const progress = createXpProgress();
  const windows: number[] = [];
  let start = XP_FIXTURE_START_MS;
  for (let index = 0; index < 7; index += 1) {
    const result = progress.observeActiveTime(activeWindow(start, 10_000));
    assert.equal(result.status, 'CREDITED');
    assert.equal(result.creditedMs, 10_000);
    windows.push(result.creditedMicroXp);
    start += 10_000;
  }
  const read = progress.read();
  assert.equal(read.activePlayMs, 70_000);
  assert.equal(read.activePlaySeconds, 70);
  assert.equal(read.xpBalanceMicroXp, 1_166_666);
  assert.equal(read.xpBalance, 1.166666);
  assert.equal(
    windows.reduce((total, micro) => total + micro, 0),
    activeTimeMicroXp(70_000),
  );
  assert.equal(
    read.entries.reduce((total, entry) => total + entry.amountMicroXp, 0),
    read.xpBalanceMicroXp,
  );
  let running = 0;
  for (const entry of read.entries) {
    running += entry.amountMicroXp;
    assert.equal(entry.balanceAfterMicroXp, running);
    assert.equal(entry.amountXp, microXpToXp(entry.amountMicroXp));
  }
  assert.equal(running, read.xpBalanceMicroXp);
  assert.equal(read.level, 1);
  assert.equal(read.byCause.find((row) => row.causeType === 'ACTIVE_TIME')?.entries, 7);

  // Half a minute is exactly half an XP: no rounding to whole minutes.
  const half = createXpProgress();
  const credited = half.observeActiveTime(activeWindow(XP_FIXTURE_START_MS, 30_000));
  assert.equal(credited.creditedMicroXp, 500_000);
  assert.equal(credited.creditedXp, 0.5);
  assert.equal(half.read().levelProgress, 0.005);
});

test('213 pause, focus loss, background, AFK, replay, experiments and Haos never pay', () => {
  const progress = createXpProgress();
  const cases = [
    { overrides: { paused: true }, reason: 'PAUSED' },
    { overrides: { focused: false }, reason: 'NOT_FOCUSED' },
    { overrides: { visible: false }, reason: 'BACKGROUND' },
    { overrides: { afk: true }, reason: 'AFK' },
    { overrides: { scope: 'REPLAY' }, reason: 'OUTSIDE_ACADEMY' },
    { overrides: { scope: 'EXPERIMENT' }, reason: 'OUTSIDE_ACADEMY' },
    { overrides: { scope: 'HAOS' }, reason: 'OUTSIDE_ACADEMY' },
  ] as const;
  let start = XP_FIXTURE_START_MS;
  for (const entry of cases) {
    const result = progress.observeActiveTime(
      activeWindow(start, 30_000, entry.overrides as Record<string, unknown>),
    );
    assert.equal(result.status, 'SKIPPED', entry.reason);
    assert.equal(result.reason, entry.reason);
    assert.equal(result.creditedMs, 0);
    start += 30_000;
  }
  let read = progress.read();
  assert.equal(read.xpBalanceMicroXp, 0);
  assert.equal(read.activePlayMs, 0);
  assert.equal(read.entries.length, 0);
  assert.equal(read.counters.timeSkips.PAUSED, 1);
  assert.equal(read.counters.timeSkips.NOT_FOCUSED, 1);
  assert.equal(read.counters.timeSkips.BACKGROUND, 1);
  assert.equal(read.counters.timeSkips.AFK, 1);
  assert.equal(read.counters.timeSkips.OUTSIDE_ACADEMY, 3);
  assert.equal(read.counters.skippedWindowMs, 7 * 30_000);

  // Offline time is a gap that no window covers: only the observed window is credited.
  const first = progress.observeActiveTime(activeWindow(start, 30_000));
  assert.equal(first.status, 'CREDITED');
  const offlineStart = start + 3_600_000;
  const second = progress.observeActiveTime(activeWindow(offlineStart, 30_000));
  assert.equal(second.status, 'CREDITED');
  assert.equal(second.creditedMs, 30_000);
  assert.equal(second.gapMs, 3_600_000 - 30_000);
  assert.equal(second.offlineGap, true);
  read = progress.read();
  assert.equal(read.activePlayMs, 60_000);
  assert.equal(read.counters.unobservedMs, 3_600_000 - 30_000);
  assert.equal(read.counters.offlineGaps, 1);

  // A single long window is refused instead of being credited as if it were observed.
  const long = progress.observeActiveTime(activeWindow(offlineStart + 30_000, 3_600_000));
  assert.equal(long.status, 'SKIPPED');
  assert.equal(long.reason, 'WINDOW_TOO_LONG');
  assert.equal(long.creditedMs, 0);
  const empty = progress.observeActiveTime(activeWindow(offlineStart + 3_600_000, 0));
  assert.equal(empty.reason, 'ZERO_DURATION');
  assert.equal(progress.read().activePlayMs, 60_000);
});

test('213 AUTO counts while the player observes the Academy, and the mode is evidence', () => {
  const progress = createXpProgress();
  const auto = progress.observeActiveTime(
    activeWindow(XP_FIXTURE_START_MS, 30_000, { controlMode: 'AUTO' }),
  );
  assert.equal(auto.status, 'CREDITED');
  assert.equal(auto.creditedMicroXp, 500_000);
  const learning = progress.observeActiveTime(
    activeWindow(XP_FIXTURE_START_MS + 30_000, 30_000, { controlMode: 'LEARNING' }),
  );
  assert.equal(learning.status, 'CREDITED');
  const manual = progress.observeActiveTime(
    activeWindow(XP_FIXTURE_START_MS + 60_000, 30_000, { controlMode: 'MANUAL' }),
  );
  assert.equal(manual.status, 'CREDITED');
  const read = progress.read();
  assert.deepEqual(
    read.entries.map((entry) =>
      entry.evidence.source === 'ACTIVE_TIME' ? entry.evidence.controlMode : null,
    ),
    ['AUTO', 'LEARNING', 'MANUAL'],
  );
  assert.equal(read.xpBalanceMicroXp, 1_500_000);
});

test('213 a reload never pays the same period twice', () => {
  function run(reload: boolean) {
    const progress = createXpProgress();
    const first = activeWindow(XP_FIXTURE_START_MS);
    const second = activeWindow(XP_FIXTURE_START_MS + 30_000);
    const third = activeWindow(XP_FIXTURE_START_MS + 60_000);
    progress.observeActiveTime(first);
    let current = progress;
    if (reload) {
      current = parsePlayerProgress(clone(progress.checkpoint()));
      assert.equal(current.observeActiveTime(first).status, 'DUPLICATE');
      assert.equal(
        current.observeActiveTime(activeWindow(XP_FIXTURE_START_MS - 30_000)).status,
        'SKIPPED',
      );
    }
    current.observeActiveTime(second);
    current.observeActiveTime(third);
    const read = current.read();
    return {
      balance: read.xpBalanceMicroXp,
      activePlayMs: read.activePlayMs,
      causes: read.entries.map((entry) => entry.causeId),
      level: read.level,
    };
  }

  const straight = run(false);
  const reloaded = run(true);
  assert.deepEqual(reloaded, straight);
  assert.equal(straight.activePlayMs, 90_000);
  assert.equal(straight.balance, activeTimeMicroXp(90_000));
  assert.equal(straight.balance, 1_500_000);
  assert.deepEqual(straight.causes, [
    activeTimeCreditId(XP_FIXTURE_PLAYER, XP_FIXTURE_START_MS, XP_FIXTURE_START_MS + 30_000),
    activeTimeCreditId(
      XP_FIXTURE_PLAYER,
      XP_FIXTURE_START_MS + 30_000,
      XP_FIXTURE_START_MS + 60_000,
    ),
    activeTimeCreditId(
      XP_FIXTURE_PLAYER,
      XP_FIXTURE_START_MS + 60_000,
      XP_FIXTURE_START_MS + 90_000,
    ),
  ]);
  assert.equal(straight.level, 1);
});

type RawCheckpoint = {
  entries: {
    entryId: string;
    causeType: string;
    amountXp: number;
    balanceAfterMicroXp: number;
  }[];
  accountedThroughMs: number;
  [key: string]: unknown;
};

test('213 a checkpoint stores proofs, not XP: the balance is recomputed from the entries', () => {
  const progress = createXpProgress();
  const scenario = completedMissionSettlement();
  progress.creditMission({ settlement: scenario.settlement, observedAtMs: XP_FIXTURE_START_MS });
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS));
  const checkpoint = progress.checkpoint();
  const rawCheckpoint = clone(checkpoint) as unknown as RawCheckpoint;
  assert.equal('xpBalance' in rawCheckpoint, false);
  assert.equal('xpBalanceMicroXp' in rawCheckpoint, false);
  assert.equal('level' in rawCheckpoint, false);
  assert.equal(rawCheckpoint.entries.length, 2);

  const restored = parsePlayerProgress(rawCheckpoint);
  assert.deepEqual(restored.read(), progress.read());
  assert.equal(restored.stats().xpBalanceMicroXp, progress.stats().xpBalanceMicroXp);

  const driftedAmount = clone(rawCheckpoint);
  driftedAmount.entries[0]!.amountXp = 5;
  refuses(() => parsePlayerProgress(driftedAmount), /amount drifted/);

  const driftedBalance = clone(rawCheckpoint);
  driftedBalance.entries[0]!.balanceAfterMicroXp += 1;
  refuses(() => parsePlayerProgress(driftedBalance), /running balance/);

  const forgedIdentity = clone(rawCheckpoint);
  forgedIdentity.entries[0]!.entryId = 'id-v1:forged';
  refuses(() => parsePlayerProgress(forgedIdentity), /XP entry identity/);

  const tamperedEvidence = clone(rawCheckpoint);
  tamperedEvidence.entries[1]!.causeType = 'MISSION_REWARD';
  refuses(() => parsePlayerProgress(tamperedEvidence), /evidence source|identity/);

  const outsideCursor = clone(rawCheckpoint);
  outsideCursor.accountedThroughMs = XP_FIXTURE_START_MS;
  refuses(() => parsePlayerProgress(outsideCursor), /accounting cursor/);

  const extraField = clone(rawCheckpoint);
  extraField.xpBalance = 1_000_000;
  refuses(() => parsePlayerProgress(extraField), /Unknown player progress checkpoint field/);
});

test('213 a reset, import or new driving profile never resets XP', () => {
  const store = createXpProfileStore();
  const progress = createXpProgress();
  const scenario = completedMissionSettlement();
  progress.creditMission({ settlement: scenario.settlement, observedAtMs: XP_FIXTURE_START_MS });
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS));
  const before = progress.read();
  const saved = clone(progress.checkpoint());
  assert.equal(before.profileWrites, 0);

  // The real 109 store loses every version, then a different base version is imported.
  store.clear();
  const reimported = store.createBase({
    profileId: XP_FIXTURE_PROFILE_ID,
    versionId: 'profile-213-imported',
    parameters: xpProfileParameters(),
    sourceSegmentIds: [],
    createdAt: '2026-11-12T00:00:00.000Z',
  });
  assert.equal(reimported.status, 'ACCEPTED');
  assert.equal(store.listVersions(XP_FIXTURE_PROFILE_ID).length, 1);
  assert.equal(store.listVersions(XP_FIXTURE_PROFILE_ID)[0]?.versionId, 'profile-213-imported');

  const restored = parsePlayerProgress(saved);
  const after = restored.read();
  assert.equal(after.xpBalanceMicroXp, before.xpBalanceMicroXp);
  assert.equal(after.level, before.level);
  assert.deepEqual(
    after.entries.map((entry) => entry.entryId),
    before.entries.map((entry) => entry.entryId),
  );
  assert.deepEqual(after.counters, before.counters);

  // The progress module has no profile dependency at all: its public surface is closed.
  assert.deepEqual(Object.keys(progress).sort(), [
    'checkpoint',
    'creditDaily',
    'creditMission',
    'entry',
    'observeActiveTime',
    'playerId',
    'read',
    'ruleVersion',
    'stats',
    'version',
  ]);
  assert.ok(Object.isFrozen(progress));
});

test('213 revenue, ratings, incidents, failed or refused missions and a missed day never lower XP', () => {
  const progress = createXpProgress();
  const scenario = completedMissionSettlement();
  progress.creditMission({ settlement: scenario.settlement, observedAtMs: XP_FIXTURE_START_MS });
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS));
  const daily = dailyReward();
  progress.creditDaily({ record: daily.record, instance: daily.instance });
  const before = progress.read();
  assert.equal(before.xpBalance, 200.5);
  assert.equal(before.level, 2);

  // a) A real 209 failed ride: revenue and rating drop in the KPI, the player progress does not move.
  const economy = failingEconomy();
  try {
    assert.equal(economy.snapshot.days[0]?.failedRides, 1);
    assert.equal(economy.snapshot.days[0]?.completedRides, 0);
    assert.ok((economy.rating ?? 5) < 2, `rating ${String(economy.rating)}`);
    assert.equal(economy.settlement.netMinorUnits, 0);
  } finally {
    economy.dispose();
  }

  // b) A real 116 mission that failed on its evaluation window can never produce a 125 settlement.
  const failedTracker = createMissionTestTracker({
    catalog: createMissionTestCatalog([testMission({ windowTicks: 600 })]),
  });
  failedTracker.start({ missionId: 'test-mission', tick: 100 });
  const failedId = failedTracker.advance(1_000).expired[0];
  assert.ok(failedId !== undefined);
  const failedInstance = failedTracker.instance(failedId);
  assert.equal(failedInstance?.state, 'FAILED');
  assert.equal(failedInstance?.failureReason, 'EVALUATION_WINDOW_EXPIRED');
  const settlementLedger = createMissionRewardsLedger({ catalog: failedTracker.catalog() });
  refuses(
    () => settlementLedger.settle({ instance: failedInstance }),
    /completed 116 instance, not FAILED/,
  );

  // c) A refused daily reward is a duplicate at 211 and pays nothing at 213.
  const refused = recordDailyReward({
    state: daily.state,
    instanceId: daily.instance.instanceId,
    grantedAtMs: daily.record.grantedAtMs,
  });
  assert.equal(refused.duplicate, true);
  const refusedCredit = progress.creditDaily({
    record: refused.record,
    instance: daily.instance,
  });
  assert.equal(refusedCredit.creditedXp, 0);

  // d) A missed day generates only the current day and grants no offline XP.
  const missed = advanceDaily(daily.state, '2026-11-13');
  assert.equal(missed.action, 'FORWARD_JUMP');
  assert.equal(missed.skippedDays, 1);
  assert.equal(missed.set?.instances.length, 3);
  assert.equal(missed.state.rewards.length, 1);

  const after = progress.read();
  assert.equal(after.xpBalanceMicroXp, before.xpBalanceMicroXp);
  assert.equal(after.level, before.level);
  assert.deepEqual(
    after.entries.map((entry) => entry.entryId),
    before.entries.map((entry) => entry.entryId),
  );
  assert.equal(after.counters.creditSkips.DUPLICATE_DELIVERY, 1);

  // The only movement is upward: a new valid credit after all these paths adds XP.
  const grown = progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS + 30_000));
  assert.equal(grown.status, 'CREDITED');
  assert.ok(progress.read().xpBalanceMicroXp > after.xpBalanceMicroXp);
});

test('213 negative or malformed credits are refused, never debited', () => {
  const progress = createXpProgress();
  const scenario = completedMissionSettlement();
  const negative = clone(scenario.settlement) as unknown as {
    rewards: { amount: number; kind: string }[];
  };
  const row = negative.rewards.find((entry) => entry.kind === 'XP');
  assert.ok(row !== undefined);
  row.amount = -5;
  refuses(
    () => progress.creditMission({ settlement: negative, observedAtMs: XP_FIXTURE_START_MS }),
    /Expected finite number in range/,
  );
  assert.equal(progress.read().xpBalanceMicroXp, 0);

  refuses(
    () =>
      progress.creditMission({
        settlement: scenario.settlement,
        observedAtMs: XP_FIXTURE_START_MS,
        extra: true,
      }),
    /Unknown mission XP input field/,
  );
  refuses(() => createPlayerProgress({ playerId: '' }), /Expected nonempty string/);
  refuses(
    () => progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS, 30_000, { scope: 'MOON' })),
    /Unknown world scope/,
  );
  refuses(
    () =>
      progress.observeActiveTime(
        activeWindow(XP_FIXTURE_START_MS, 30_000, { paused: 'no' as unknown as boolean }),
      ),
    /must be a boolean/,
  );
});

test('213 report transcript is deterministic and matches the saved evidence', async () => {
  const report = runPlayerXpReport();
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.equal, true);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, readFileSync(EVIDENCE, 'utf8'));
});
