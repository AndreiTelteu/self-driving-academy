import {
  PLAYER_PROGRESS_VERSION,
  PLAYER_XP_POLICY,
  XP_LEVEL_VERSION,
  XP_RULE_VERSION,
  activeTimeMicroXp,
  levelForXpMicro,
  levelThresholdMicroXp,
  levelThresholdXp,
  parsePlayerProgress,
  xpEntryId,
} from '../../src/missions';
import { createMissionRewardsLedger, recordDailyReward } from '../../src/missions';
import type { PlayerProgress, PlayerProgressRead } from '../../src/missions';
import { createMissionTestCatalog, createMissionTestTracker, testMission } from './mission-fixture';
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

/**
 * Deterministic transcript of PBI 213.
 *
 * Every number comes from the delivered contracts: a real 116 completion settled by 125, a real 211
 * daily reward, real 209 KPI facts and real observation windows. Nothing reads a clock, a browser or
 * a random source, so two runs produce the same bytes.
 */
export interface PlayerXpCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface PlayerXpReport {
  readonly schemaVersion: 1;
  readonly version: typeof PLAYER_PROGRESS_VERSION;
  readonly ruleVersion: typeof XP_RULE_VERSION;
  readonly levelVersion: typeof XP_LEVEL_VERSION;
  readonly playerId: string;
  readonly checks: readonly PlayerXpCheck[];
  readonly mission: Readonly<{
    missionId: string;
    settlementStatus: string;
    xpGrantedBy125: number;
    creditedXp: number;
    causeIsRewardIdentity: boolean;
    duplicateDeliveryXp: number;
    replayCompletionDifferent: boolean;
    replayXp: number;
    balance: number;
    level: number;
    entries: number;
  }>;
  readonly daily: Readonly<{
    instanceId: string;
    dailyDate: string;
    rewardXp: number;
    duplicateXp: number;
    balance: number;
    causeIsRewardIdentity: boolean;
  }>;
  readonly time: Readonly<{
    windows: number;
    creditedMs: number;
    creditedMicroXp: number;
    creditedXp: number;
    halfMinuteXp: number;
    exactTotalMicroXp: number;
    sumOfEntriesMicroXp: number;
    skipped: readonly Readonly<{ reason: string; count: number }>[];
    skippedWindowMs: number;
    offlineGapMs: number;
    offlineGaps: number;
    unobservedMs: number;
    longWindowReason: string;
    autoCreditedXp: number;
  }>;
  readonly level: Readonly<{
    balance: number;
    level: number;
    levelThresholdXp: number;
    nextLevelXp: number | null;
    levelProgress: number;
    levelFromBalance: number;
  }>;
  readonly monotonicity: Readonly<{
    beforeBalance: number;
    afterBalance: number;
    beforeLevel: number;
    afterLevel: number;
    kpiFailedRides: number;
    kpiRevenueMinorUnits: number;
    kpiRating: number | null;
    failedMissionSettleRefused: boolean;
    refusedDailyCredit: number;
    missedDayAction: string;
    missedDaySkips: number;
    grewAfterValidCredit: boolean;
  }>;
  readonly reload: Readonly<{
    straightBalanceMicroXp: number;
    reloadedBalanceMicroXp: number;
    straightEntries: number;
    reloadedEntries: number;
    duplicateAfterReload: string;
    equal: boolean;
  }>;
  readonly profile: Readonly<{
    beforeBalanceMicroXp: number;
    afterResetBalanceMicroXp: number;
    beforeLevel: number;
    afterResetLevel: number;
    importedVersions: number;
    preserved: boolean;
  }>;
  readonly history: Readonly<{
    entries: number;
    balanceMicroXp: number;
    sumOfEntriesMicroXp: number;
    everyEntryExplained: boolean;
    checkpointOmitsBalance: boolean;
    tamperedCheckpointRefused: boolean;
  }>;
  readonly policy: Readonly<{
    xpPerActiveMinute: number;
    afkThresholdMs: number;
    maxObservationWindowMs: number;
    maxObservationGapMs: number;
    countsAuto: boolean;
    debits: 0;
    negativeCredits: boolean;
    excluded: readonly string[];
  }>;
  readonly summary: Readonly<{
    checks: number;
    passed: number;
    failed: number;
    pass: boolean;
  }>;
  readonly determinism: Readonly<{ runs: number; equal: boolean }>;
}

function readOf(progress: PlayerProgress): PlayerProgressRead {
  return progress.read();
}

function missionScenario() {
  const progress = createXpProgress();
  const scenario = completedMissionSettlement();
  const credited = progress.creditMission({
    settlement: scenario.settlement,
    observedAtMs: XP_FIXTURE_START_MS,
  });
  const reward = scenario.settlement.rewards.find((row) => row.kind === 'XP');
  const repeated = scenario.ledger.settle({ instance: scenario.instance });
  const duplicate = progress.creditMission({
    settlement: repeated,
    observedAtMs: XP_FIXTURE_START_MS + 1_000,
  });
  const replay = replaySettlement(scenario);
  const replayed = progress.creditMission({
    settlement: replay,
    observedAtMs: XP_FIXTURE_START_MS + 2_000,
  });
  return {
    credited,
    duplicate,
    replayed,
    replay,
    read: readOf(progress),
    settlementStatus: scenario.settlement.status,
    xpGrantedBy125: scenario.settlement.xpGranted,
    causeIsRewardIdentity:
      reward !== undefined &&
      credited.rows[0]?.causeId === reward.rewardId &&
      credited.rows[0]?.entryId === xpEntryId(XP_FIXTURE_PLAYER, 'MISSION_REWARD', reward.rewardId),
    replayCompletionDifferent: replay.completionId !== scenario.settlement.completionId,
  };
}

function dailyScenario() {
  const progress = createXpProgress();
  const daily = dailyReward();
  const credited = progress.creditDaily({ record: daily.record, instance: daily.instance });
  const again = recordDailyReward({
    state: daily.state,
    instanceId: daily.instance.instanceId,
    grantedAtMs: daily.record.grantedAtMs + 5_000,
  });
  const duplicate = progress.creditDaily({ record: again.record, instance: daily.instance });
  return {
    daily,
    credited,
    duplicate,
    read: readOf(progress),
    causeIsRewardIdentity: credited.rows[0]?.causeId === daily.record.rewardId,
  };
}

function timeScenario() {
  const progress = createXpProgress();
  const windowMs = 10_000;
  let start = XP_FIXTURE_START_MS;
  for (let index = 0; index < 7; index += 1) {
    progress.observeActiveTime(activeWindow(start, windowMs));
    start += windowMs;
  }
  const skips = [
    { overrides: { paused: true } },
    { overrides: { focused: false } },
    { overrides: { visible: false } },
    { overrides: { afk: true } },
    { overrides: { scope: 'REPLAY' } },
    { overrides: { scope: 'EXPERIMENT' } },
    { overrides: { scope: 'HAOS' } },
  ] as const;
  for (const entry of skips) {
    progress.observeActiveTime(
      activeWindow(start, 30_000, entry.overrides as Record<string, unknown>),
    );
    start += 30_000;
  }
  progress.observeActiveTime(activeWindow(start, 30_000));
  const offlineStart = start + 3_600_000;
  const second = progress.observeActiveTime(activeWindow(offlineStart, 30_000));
  const long = progress.observeActiveTime(activeWindow(offlineStart + 30_000, 3_600_000));
  const auto = progress.observeActiveTime(
    activeWindow(offlineStart + 30_000 + 3_600_000, 30_000, { controlMode: 'AUTO' }),
  );
  const read = readOf(progress);
  const half = createXpProgress();
  const halfResult = half.observeActiveTime(activeWindow(XP_FIXTURE_START_MS, 30_000));
  const reasons = (Object.keys(read.counters.timeSkips) as (keyof typeof read.counters.timeSkips)[])
    .filter((reason) => read.counters.timeSkips[reason] > 0)
    .map((reason) => Object.freeze({ reason, count: read.counters.timeSkips[reason] }));
  return { read, second, long, auto, halfResult, reasons };
}

function monotonicityScenario() {
  const progress = createXpProgress();
  const mission = completedMissionSettlement();
  progress.creditMission({ settlement: mission.settlement, observedAtMs: XP_FIXTURE_START_MS });
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS));
  const daily = dailyReward();
  progress.creditDaily({ record: daily.record, instance: daily.instance });
  const before = readOf(progress);

  const economy = failingEconomy();
  let kpiFailedRides = 0;
  let kpiRevenue = 0;
  let kpiRating: number | null = null;
  try {
    kpiFailedRides = economy.snapshot.days[0]?.failedRides ?? 0;
    kpiRevenue = economy.snapshot.days[0]?.revenueMinorUnits ?? 0;
    kpiRating = economy.rating;
  } finally {
    economy.dispose();
  }

  const failedTracker = createMissionTestTracker({
    catalog: createMissionTestCatalog([testMission({ windowTicks: 600 })]),
  });
  failedTracker.start({ missionId: 'test-mission', tick: 100 });
  const failedId = failedTracker.advance(1_000).expired[0] ?? '';
  const failedInstance = failedTracker.instance(failedId);
  const failedLedger = createMissionRewardsLedger({ catalog: failedTracker.catalog() });
  let refused = false;
  try {
    failedLedger.settle({ instance: failedInstance });
  } catch {
    refused = true;
  }

  const refusedReward = recordDailyReward({
    state: daily.state,
    instanceId: daily.instance.instanceId,
    grantedAtMs: daily.record.grantedAtMs,
  });
  const refusedCredit = progress.creditDaily({
    record: refusedReward.record,
    instance: daily.instance,
  });
  const missed = advanceDaily(daily.state, '2026-11-13');
  const after = readOf(progress);
  const grown = progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS + 30_000));
  return {
    before,
    after,
    grown,
    kpiFailedRides,
    kpiRevenue,
    kpiRating,
    refused,
    refusedCredit,
    missed,
  };
}

function reloadScenario() {
  function run(reload: boolean) {
    const progress = createXpProgress();
    const first = activeWindow(XP_FIXTURE_START_MS);
    const second = activeWindow(XP_FIXTURE_START_MS + 30_000);
    progress.observeActiveTime(first);
    let current = progress;
    let duplicateAfterReload = 'NOT_APPLIED';
    if (reload) {
      current = parsePlayerProgress(JSON.parse(JSON.stringify(progress.checkpoint())));
      duplicateAfterReload = current.observeActiveTime(first).status;
    }
    current.observeActiveTime(second);
    return { read: readOf(current), duplicateAfterReload };
  }
  const straight = run(false);
  const reloaded = run(true);
  return {
    straight: straight.read,
    reloaded: reloaded.read,
    duplicateAfterReload: reloaded.duplicateAfterReload,
    equal:
      straight.read.xpBalanceMicroXp === reloaded.read.xpBalanceMicroXp &&
      straight.read.activePlayMs === reloaded.read.activePlayMs &&
      straight.read.entries.length === reloaded.read.entries.length &&
      straight.read.entries.every(
        (entry, index) => entry.causeId === reloaded.read.entries[index]?.causeId,
      ),
  };
}

function profileScenario() {
  const store = createXpProfileStore();
  const progress = createXpProgress();
  const mission = completedMissionSettlement();
  progress.creditMission({ settlement: mission.settlement, observedAtMs: XP_FIXTURE_START_MS });
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS));
  const saved = JSON.parse(JSON.stringify(progress.checkpoint()));
  const before = readOf(progress);
  store.clear();
  const imported = store.createBase({
    profileId: XP_FIXTURE_PROFILE_ID,
    versionId: 'profile-213-imported',
    parameters: xpProfileParameters(),
    sourceSegmentIds: [],
    createdAt: '2026-11-12T00:00:00.000Z',
  });
  const versions = store.listVersions(XP_FIXTURE_PROFILE_ID).length;
  const after = readOf(parsePlayerProgress(saved));
  return {
    before,
    after,
    versions,
    importedStatus: imported.status,
    preserved:
      imported.status === 'ACCEPTED' &&
      after.xpBalanceMicroXp === before.xpBalanceMicroXp &&
      after.entries.length === before.entries.length &&
      after.level === before.level,
  };
}

function historyScenario() {
  const progress = createXpProgress();
  const mission = completedMissionSettlement();
  progress.creditMission({ settlement: mission.settlement, observedAtMs: XP_FIXTURE_START_MS });
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS));
  const daily = dailyReward();
  progress.creditDaily({ record: daily.record, instance: daily.instance });
  const read = readOf(progress);
  const checkpoint = JSON.parse(JSON.stringify(progress.checkpoint())) as Record<string, unknown>;
  const tampered = JSON.parse(JSON.stringify(checkpoint)) as {
    entries: { balanceAfterMicroXp: number }[];
  };
  if (tampered.entries[0] !== undefined) tampered.entries[0].balanceAfterMicroXp += 1;
  let refused = false;
  try {
    parsePlayerProgress(tampered);
  } catch {
    refused = true;
  }
  let explained = true;
  let running = 0;
  for (const entry of read.entries) {
    running += entry.amountMicroXp;
    if (
      entry.causeId.length === 0 ||
      entry.entryId !== xpEntryId(XP_FIXTURE_PLAYER, entry.causeType, entry.causeId) ||
      entry.amountMicroXp < 0 ||
      entry.balanceAfterMicroXp !== running ||
      entry.realTimeMs < 0
    )
      explained = false;
    if (
      entry.evidence.source === 'ACTIVE_TIME' &&
      (entry.evidence.activeMs <= 0 || entry.evidence.scope !== 'ACADEMY')
    )
      explained = false;
    if (entry.evidence.source === 'MISSION_REWARD' && entry.evidence.completionId.length === 0)
      explained = false;
    if (entry.evidence.source === 'DAILY_REWARD' && entry.evidence.rewardXp <= 0) explained = false;
  }
  return {
    read,
    checkpointOmitsBalance: !('xpBalance' in checkpoint) && !('level' in checkpoint),
    tamperedRefused: refused,
    explained,
  };
}

function buildReport(): PlayerXpReport {
  const mission = missionScenario();
  const daily = dailyScenario();
  const time = timeScenario();
  const empty = readOf(createXpProgress());
  const monotonicity = monotonicityScenario();
  const reload = reloadScenario();
  const profile = profileScenario();
  const history = historyScenario();
  const checks: PlayerXpCheck[] = [];
  const check = (name: string, pass: boolean, detail: string): void => {
    checks.push(Object.freeze({ name, pass, detail }));
  };
  const timeSum = time.read.entries.reduce((total, entry) => total + entry.amountMicroXp, 0);

  check(
    'contract version and policy are the published 213 ones',
    PLAYER_PROGRESS_VERSION === '213-player-progress-v1' &&
      PLAYER_XP_POLICY.monotone.debits === 0 &&
      PLAYER_XP_POLICY.monotone.negativeCredits === false,
    `${PLAYER_PROGRESS_VERSION}; debits 0; credite negative interzise`,
  );
  check(
    'level thresholds are monotone and derived from the balance',
    levelThresholdXp(2) === 100 &&
      levelThresholdXp(3) === 300 &&
      levelThresholdXp(50) === 122_500 &&
      levelForXpMicro(levelThresholdMicroXp(3)) === 3 &&
      levelForXpMicro(levelThresholdMicroXp(3) - 1) === 2,
    'nivel 2 = 100 XP, nivel 3 = 300 XP, nivel 50 = 122.500 XP',
  );
  check(
    'active time accrual is exact to the micro-XP',
    activeTimeMicroXp(30_000) === 500_000 &&
      activeTimeMicroXp(70_000) === 1_166_666 &&
      activeTimeMicroXp(1) === 16,
    '30 s = 500.000 micro-XP, 70 s = 1.166.666 micro-XP, 1 ms = 16 micro-XP',
  );
  check(
    'a real 125 settlement pays the authored XP once',
    mission.credited.status === 'CREDITED' &&
      mission.credited.creditedXp === 100 &&
      mission.xpGrantedBy125 === 100,
    `${mission.settlementStatus}: ${mission.credited.creditedXp} XP acordat din ${mission.xpGrantedBy125} autorat`,
  );
  check(
    'mission XP uses the 125 reward identity and the 213 entry identity',
    mission.causeIsRewardIdentity,
    'causeId = rewardId 125, entryId = xpEntryId(player, MISSION_REWARD, rewardId)',
  );
  check(
    'a repeated delivery of the same completion pays nothing',
    mission.duplicate.creditedXp === 0 && mission.read.xpBalance === 100,
    `0 XP, sold ${mission.read.xpBalance}`,
  );
  check(
    'a real 116 replay is a new completion with zero XP',
    mission.replayCompletionDifferent && mission.replayed.creditedXp === 0,
    `finalizare nouă, ${mission.replayed.creditedXp} XP`,
  );
  check(
    'a real 211 daily reward pays once',
    daily.credited.creditedXp === 100 && daily.causeIsRewardIdentity,
    `${daily.credited.creditedXp} XP, identitate 211 ${daily.causeIsRewardIdentity ? 'respectată' : 'diferită'}`,
  );
  check(
    'a duplicate 211 reward pays nothing',
    daily.duplicate.creditedXp === 0 && daily.read.xpBalance === 100,
    `0 XP, sold ${daily.read.xpBalance}`,
  );
  check(
    'fractions of a minute are preserved, not rounded',
    time.read.xpBalanceMicroXp === activeTimeMicroXp(time.read.activePlayMs) &&
      time.read.xpBalanceMicroXp === timeSum &&
      time.read.xpBalance === 2.666666,
    `${time.read.activePlayMs} ms = ${time.read.xpBalanceMicroXp} micro-XP = ${time.read.xpBalance} XP`,
  );
  check(
    'half a minute is exactly half an XP',
    time.halfResult.creditedMicroXp === 500_000 && time.halfResult.creditedXp === 0.5,
    `${time.halfResult.creditedMicroXp} micro-XP = ${time.halfResult.creditedXp} XP`,
  );
  for (const expected of [
    { reason: 'PAUSED', count: 1 },
    { reason: 'NOT_FOCUSED', count: 1 },
    { reason: 'BACKGROUND', count: 1 },
    { reason: 'AFK', count: 1 },
    { reason: 'OUTSIDE_ACADEMY', count: 3 },
  ]) {
    const entry = time.reasons.find((row) => row.reason === expected.reason);
    check(
      `window excluded: ${expected.reason}`,
      (entry?.count ?? 0) === expected.count,
      `${entry?.count ?? 0} fereastră/e, 0 XP`,
    );
  }
  check(
    'an offline gap is never credited',
    time.second.gapMs === 3_600_000 - 30_000 &&
      time.second.offlineGap &&
      time.read.counters.offlineGaps === 1 &&
      time.read.counters.unobservedMs === 3_600_000 - 30_000,
    `gol ${time.second.gapMs} ms neobservat, creditat doar ${time.second.creditedMs} ms`,
  );
  check(
    'a window longer than the calibration is refused',
    time.long.status === 'SKIPPED' && time.long.reason === 'WINDOW_TOO_LONG',
    `${time.long.windowMs} ms refuzați, 0 XP`,
  );
  check(
    'AUTO counts while the player observes the Academy',
    time.auto.status === 'CREDITED' &&
      time.auto.creditedMicroXp === 500_000 &&
      time.read.entries.some(
        (entry) => entry.evidence.source === 'ACTIVE_TIME' && entry.evidence.controlMode === 'AUTO',
      ),
    `AUTO creditat ${time.auto.creditedXp} XP cu focus, vizibilitate, fără pauză și fără AFK`,
  );
  check(
    'the history is the balance: every entry carries its source, moment, identity and amount',
    history.explained &&
      history.read.balanceIsSumOfEntries &&
      history.read.entries.reduce((total, entry) => total + entry.amountMicroXp, 0) ===
        history.read.xpBalanceMicroXp,
    `${history.read.entries.length} intrări, suma ${history.read.xpBalanceMicroXp} micro-XP`,
  );
  check(
    'a checkpoint stores proofs, not XP, and refuses a forged balance',
    history.checkpointOmitsBalance && history.tamperedRefused,
    'fără xpBalance/level în checkpoint; sold falsificat refuzat',
  );
  check(
    'revenue, ratings and KPI facts cannot lower the balance',
    monotonicity.kpiFailedRides === 1 &&
      monotonicity.kpiRevenue === 0 &&
      (monotonicity.kpiRating ?? 5) < 2 &&
      monotonicity.after.xpBalanceMicroXp === monotonicity.before.xpBalanceMicroXp,
    `KPI: ${monotonicity.kpiFailedRides} cursă eșuată, venit ${monotonicity.kpiRevenue}, rating ${monotonicity.kpiRating}; sold ${monotonicity.after.xpBalanceMicroXp}`,
  );
  check(
    'an incident, a failed mission and a refused reward cannot lower the balance',
    monotonicity.refused &&
      monotonicity.refusedCredit.creditedXp === 0 &&
      monotonicity.after.xpBalanceMicroXp === monotonicity.before.xpBalanceMicroXp,
    'instanță 116 FAILED fără settlement; recompensă refuzată 0 XP',
  );
  check(
    'a missed day grants no offline XP and keeps the balance',
    monotonicity.missed.action === 'FORWARD_JUMP' &&
      monotonicity.missed.skippedDays === 1 &&
      monotonicity.after.xpBalanceMicroXp === monotonicity.before.xpBalanceMicroXp,
    `${monotonicity.missed.action}, ${monotonicity.missed.skippedDays} zi sărită, sold neschimbat`,
  );
  check(
    'the level never falls on any of those paths',
    monotonicity.after.level === monotonicity.before.level,
    `nivel ${monotonicity.before.level} → ${monotonicity.after.level}`,
  );
  check(
    'the only movement is upward: a valid credit after them adds XP',
    monotonicity.grown.status === 'CREDITED' && monotonicity.before.xpBalanceMicroXp > 0,
    `${monotonicity.grown.creditedXp} XP adăugat după toate căile fără XP`,
  );
  check(
    'a reload never pays the same period twice',
    reload.equal &&
      reload.duplicateAfterReload === 'DUPLICATE' &&
      reload.straight.xpBalanceMicroXp === reload.reloaded.xpBalanceMicroXp,
    `direct ${reload.straight.xpBalanceMicroXp} = reload ${reload.reloaded.xpBalanceMicroXp} micro-XP`,
  );
  check(
    'a reset or an import of the driving style never resets XP',
    profile.preserved && profile.versions === 1,
    `sold ${profile.after.xpBalanceMicroXp} micro-XP păstrat, ${profile.versions} versiune 109 importată`,
  );
  check(
    'the level is derived from the balance only',
    empty.level === levelForXpMicro(empty.xpBalanceMicroXp) && empty.level === 1,
    `sold ${empty.xpBalance}, nivel ${empty.level}, prag ${empty.levelThresholdXp}`,
  );

  const failed = checks.filter((entry) => !entry.pass).length;
  return Object.freeze({
    schemaVersion: 1 as const,
    version: PLAYER_PROGRESS_VERSION,
    ruleVersion: XP_RULE_VERSION,
    levelVersion: XP_LEVEL_VERSION,
    playerId: XP_FIXTURE_PLAYER,
    checks: Object.freeze(checks),
    mission: Object.freeze({
      missionId: 'campaign-1-first-taxi',
      settlementStatus: mission.settlementStatus,
      xpGrantedBy125: mission.xpGrantedBy125,
      creditedXp: mission.credited.creditedXp,
      causeIsRewardIdentity: mission.causeIsRewardIdentity,
      duplicateDeliveryXp: mission.duplicate.creditedXp,
      replayCompletionDifferent: mission.replayCompletionDifferent,
      replayXp: mission.replayed.creditedXp,
      balance: mission.read.xpBalance,
      level: mission.read.level,
      entries: mission.read.entries.length,
    }),
    daily: Object.freeze({
      instanceId: daily.daily.instance.instanceId,
      dailyDate: daily.daily.record.dailyDate,
      rewardXp: daily.credited.creditedXp,
      duplicateXp: daily.duplicate.creditedXp,
      balance: daily.read.xpBalance,
      causeIsRewardIdentity: daily.causeIsRewardIdentity,
    }),
    time: Object.freeze({
      windows: time.read.byCause.find((row) => row.causeType === 'ACTIVE_TIME')?.entries ?? 0,
      creditedMs: time.read.activePlayMs,
      creditedMicroXp: time.read.xpBalanceMicroXp,
      creditedXp: time.read.xpBalance,
      halfMinuteXp: time.halfResult.creditedXp,
      exactTotalMicroXp: activeTimeMicroXp(time.read.activePlayMs),
      sumOfEntriesMicroXp: timeSum,
      skipped: Object.freeze(time.reasons),
      skippedWindowMs: time.read.counters.skippedWindowMs,
      offlineGapMs: time.second.gapMs,
      offlineGaps: time.read.counters.offlineGaps,
      unobservedMs: time.read.counters.unobservedMs,
      longWindowReason: time.long.reason ?? '',
      autoCreditedXp: time.auto.creditedXp,
    }),
    level: Object.freeze({
      balance: empty.xpBalance,
      level: empty.level,
      levelThresholdXp: empty.levelThresholdXp,
      nextLevelXp: empty.nextLevelXp,
      levelProgress: empty.levelProgress,
      levelFromBalance: levelForXpMicro(empty.xpBalanceMicroXp),
    }),
    monotonicity: Object.freeze({
      beforeBalance: monotonicity.before.xpBalance,
      afterBalance: monotonicity.after.xpBalance,
      beforeLevel: monotonicity.before.level,
      afterLevel: monotonicity.after.level,
      kpiFailedRides: monotonicity.kpiFailedRides,
      kpiRevenueMinorUnits: monotonicity.kpiRevenue,
      kpiRating: monotonicity.kpiRating,
      failedMissionSettleRefused: monotonicity.refused,
      refusedDailyCredit: monotonicity.refusedCredit.creditedXp,
      missedDayAction: monotonicity.missed.action,
      missedDaySkips: monotonicity.missed.skippedDays,
      grewAfterValidCredit: monotonicity.grown.status === 'CREDITED',
    }),
    reload: Object.freeze({
      straightBalanceMicroXp: reload.straight.xpBalanceMicroXp,
      reloadedBalanceMicroXp: reload.reloaded.xpBalanceMicroXp,
      straightEntries: reload.straight.entries.length,
      reloadedEntries: reload.reloaded.entries.length,
      duplicateAfterReload: reload.duplicateAfterReload,
      equal: reload.equal,
    }),
    profile: Object.freeze({
      beforeBalanceMicroXp: profile.before.xpBalanceMicroXp,
      afterResetBalanceMicroXp: profile.after.xpBalanceMicroXp,
      beforeLevel: profile.before.level,
      afterResetLevel: profile.after.level,
      importedVersions: profile.versions,
      preserved: profile.preserved,
    }),
    history: Object.freeze({
      entries: history.read.entries.length,
      balanceMicroXp: history.read.xpBalanceMicroXp,
      sumOfEntriesMicroXp: history.read.entries.reduce(
        (total, entry) => total + entry.amountMicroXp,
        0,
      ),
      everyEntryExplained: history.explained,
      checkpointOmitsBalance: history.checkpointOmitsBalance,
      tamperedCheckpointRefused: history.tamperedRefused,
    }),
    policy: Object.freeze({
      xpPerActiveMinute: PLAYER_XP_POLICY.timeXp.xpPerActiveMinute,
      afkThresholdMs: PLAYER_XP_POLICY.afkThresholdMs,
      maxObservationWindowMs: PLAYER_XP_POLICY.maxObservationWindowMs,
      maxObservationGapMs: PLAYER_XP_POLICY.maxObservationGapMs,
      countsAuto: PLAYER_XP_POLICY.counts.auto,
      debits: 0 as const,
      negativeCredits: PLAYER_XP_POLICY.monotone.negativeCredits,
      excluded: PLAYER_XP_POLICY.excluded,
    }),
    summary: Object.freeze({
      checks: checks.length,
      passed: checks.length - failed,
      failed,
      pass: failed === 0,
    }),
    determinism: Object.freeze({ runs: 2, equal: true }),
  });
}

export function runPlayerXpReport(): PlayerXpReport {
  const first = buildReport();
  const second = buildReport();
  const equal = JSON.stringify(first) === JSON.stringify(second);
  return Object.freeze({
    ...first,
    determinism: Object.freeze({ runs: 2, equal }),
    summary: Object.freeze({ ...first.summary, pass: first.summary.pass && equal }),
  });
}

export function playerXpReportMarkdown(report: PlayerXpReport): string {
  const rows = report.checks
    .map((entry) => `| ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.name} | ${entry.detail} |`)
    .join('\n');
  const skipped = report.time.skipped
    .map((entry) => `| ${entry.reason} | ${entry.count} |`)
    .join('\n');
  return `# Raport 213 — XP din misiuni și timp activ

Determinist, fără ceas de perete și fără browser. Contract: \`${report.version}\`, reguli
\`${report.ruleVersion}\`, praguri \`${report.levelVersion}\`. Politica: ${report.policy.xpPerActiveMinute}
XP/minut activ, prag AFK ${report.policy.afkThresholdMs} ms, fereastră de observare maximum
${report.policy.maxObservationWindowMs} ms, gol neobservat maximum ${report.policy.maxObservationGapMs} ms.

## Rezumat

- verificări: **${report.summary.passed}/${report.summary.checks}**, eșecuri ${report.summary.failed}, overall ${report.summary.pass ? 'PASS' : 'FAIL'};
- misiune 125: ${report.mission.creditedXp} XP acordat din ${report.mission.xpGrantedBy125} autorat, duplicat ${report.mission.duplicateDeliveryXp} XP, replay ${report.mission.replayXp} XP, sold ${report.mission.balance};
- daily 211: ${report.daily.rewardXp} XP acordat, duplicat ${report.daily.duplicateXp} XP, sold ${report.daily.balance};
- timp activ: ${report.time.creditedMs} ms creditați = ${report.time.creditedXp} XP (${report.time.creditedMicroXp} micro-XP), sumă verificabilă ${report.time.sumOfEntriesMicroXp};
- determinism: ${report.determinism.runs} rulări, egale ${report.determinism.equal}.

## Misiunea și zilele

Misiunea \`${report.mission.missionId}\` este finalizată de trackerul 116 și decontată de ledgerul 125.
XP-ul este cheia 125 a recompensei (\`causeId = rewardId\`), deci o livrare repetată și un replay real
116 raportează 0 XP. Sold după cele două livrări: ${report.mission.balance} XP, nivel ${report.mission.level},
${report.mission.entries} intrări în istoric.

Ziua ${report.daily.dailyDate} (\`${report.daily.instanceId}\`) acordă ${report.daily.rewardXp} XP prin
\`dailyRewardId\`; a doua livrare a aceleiași recompense acordă ${report.daily.duplicateXp} XP.

## Timpul activ

${report.time.windows} ferestre creditate (${report.time.creditedMs} ms). Fracțiile se păstrează:
${report.time.creditedMicroXp} micro-XP este exact \`activeTimeMicroXp(${report.time.creditedMs})\`
= ${report.time.exactTotalMicroXp}, iar jumătate de minut este ${report.time.halfMinuteXp} XP.

| Motiv | Ferestre |
| --- | --- |
${skipped}

Gol offline de ${report.time.offlineGapMs} ms necreditat (${report.time.offlineGaps} goluri,
${report.time.unobservedMs} ms neobservați în total); fereastră prea lungă refuzată cu
\`${report.time.longWindowReason}\`. AUTO a contat: ${report.time.autoCreditedXp} XP, pentru că fereastra
cere focus, vizibilitate, fără pauză și fără AFK.

## Monotonia și separarea de profil

- sold ${report.monotonicity.beforeBalance} → ${report.monotonicity.afterBalance}, nivel
  ${report.monotonicity.beforeLevel} → ${report.monotonicity.afterLevel};
- KPI 209: ${report.monotonicity.kpiFailedRides} cursă eșuată, venit ${report.monotonicity.kpiRevenueMinorUnits},
  rating ${report.monotonicity.kpiRating}; settlement de misiune eșuată refuzat:
  ${report.monotonicity.failedMissionSettleRefused}; recompensă refuzată:
  ${report.monotonicity.refusedDailyCredit} XP; zi ratată: ${report.monotonicity.missedDayAction}
  (${report.monotonicity.missedDaySkips} zi), credit valid ulterior:
  ${report.monotonicity.grewAfterValidCredit};
- reset/import de stil: ${report.profile.beforeBalanceMicroXp} → ${report.profile.afterResetBalanceMicroXp}
  micro-XP, ${report.profile.importedVersions} versiune 109 după import, nivel
  ${report.profile.beforeLevel} → ${report.profile.afterResetLevel}.

## Istoricul și checkpointul

${report.history.entries} intrări, sold ${report.history.balanceMicroXp} micro-XP, suma intrărilor
${report.history.sumOfEntriesMicroXp}; fiecare intrare explicată: ${report.history.everyEntryExplained};
checkpoint fără sold/nivel: ${report.history.checkpointOmitsBalance}; checkpoint falsificat refuzat:
${report.history.tamperedCheckpointRefused}.

## Verificări

| Rezultat | Verificare | Detaliu |
| --- | --- | --- |
${rows}
`;
}
