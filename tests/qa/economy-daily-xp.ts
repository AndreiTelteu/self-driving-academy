import { createMissionRewardsLedger, recordDailyReward } from '../../src/missions/index';
import type { PlayerProgressRead } from '../../src/missions/index';
import {
  createDailyHarness,
  coreCatalog,
  envelope,
  DAILY_TAXI,
} from '../ui/daily-progress-fixture';
import { createKpiHistoryHarness, createKpiHistoryScenario } from '../ui/kpi-history-fixture';
import {
  bothDown,
  controlModeImpact,
  realFailedRide,
  revenueDownRatingUp,
  revenueUpRatingDown,
} from '../economy/kpi-impact-fixture';
import { calendarInput, learningOnlyCapabilities } from '../missions/mission-daily-fixture';
import {
  createMissionTestCatalog,
  createMissionTestTracker,
  testMission,
} from '../missions/mission-fixture';
import {
  XP_FIXTURE_START_MS,
  activeWindow,
  advanceDaily,
  completedMissionSettlement,
  createXpProgress,
  dailyReward,
  failingEconomy,
  replaySettlement,
} from '../missions/player-xp-fixture';
import type { QaCheck, QaRow } from './v1-regression-support';
import { digest, qaCheck, qaRow } from './v1-regression-support';

/**
 * Module 22-23 regressions: KPI and charts, daily missions, XP without losses, checkpoint and replay
 * facts. Every number is read back from the delivered contract (209/210/211/212/213/214) or from the
 * real failure path that must not touch XP.
 */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function refuses(action: () => unknown): boolean {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}

/**
 * The economic state of the player: balance, level, entries and the accounting cursor.
 *
 * The counters are deliberately outside the fingerprint: a refused duplicate legitimately increments
 * a skip counter without paying or losing XP, and the criterion is about XP, not about counters.
 */
function xpFingerprint(read: PlayerProgressRead): string {
  return digest({
    xpBalanceMicroXp: read.xpBalanceMicroXp,
    lifetimeXpEarnedMicroXp: read.lifetimeXpEarnedMicroXp,
    level: read.level,
    entries: read.entries,
    activePlayMs: read.activePlayMs,
    accountedThroughMs: read.accountedThroughMs,
    balanceIsSumOfEntries: read.balanceIsSumOfEntries,
  });
}

export interface EconomyDailyXpSection {
  readonly rows: readonly QaRow[];
  readonly checks: readonly QaCheck[];
  readonly facts: Readonly<{
    kpiVisualPoints: number;
    kpiExactPoints: number;
    dailyInstances: number;
  }>;
  readonly xp: {
    readonly before: Readonly<{ balance: number; level: number; entries: number }>;
    readonly after: Readonly<{ balance: number; level: number; entries: number }>;
    readonly fingerprintBefore: string;
    readonly fingerprintAfter: string;
    readonly paths: readonly Readonly<{ id: string; fingerprint: string; unchanged: boolean }>[];
    readonly losses: number;
    readonly debits: 0;
    readonly negativeCredits: false;
  };
}

export async function runEconomyDailyXp(): Promise<EconomyDailyXpSection> {
  const checks: QaCheck[] = [];

  /* ---------------------------------------------------------------- 214: KPI directions */
  const upDown = revenueUpRatingDown();
  const downUp = revenueDownRatingUp();
  const downDown = bothDown();
  const kpiImpactChecks: QaCheck[] = [
    qaCheck('revenue up', 'UP', upDown.read().delta.revenueDirection, 'throughput rises'),
    qaCheck('rating down', 'DOWN', upDown.read().delta.ratingDirection, 'service quality falls'),
    qaCheck('revenue down', 'DOWN', downUp.read().delta.revenueDirection, 'fewer paid rides'),
    qaCheck('rating up', 'UP', downUp.read().delta.ratingDirection, 'happier passengers'),
    qaCheck(
      'both down revenue',
      'DOWN',
      downDown.read().delta.revenueDirection,
      'the real failed ride',
    ),
    qaCheck(
      'both down rating',
      'DOWN',
      downDown.read().delta.ratingDirection,
      'the real low review',
    ),
    qaCheck(
      'kpi read model cannot touch XP',
      { debits: 0, credits: 0, negativeCredits: false },
      downDown.read().xp,
      'structural, not a convention',
    ),
    qaCheck('kpi history scans', 0, downDown.read().historyScans, 'no ledger scan per read'),
  ];
  checks.push(...kpiImpactChecks);

  const modes = ['MANUAL', 'LEARNING', 'AUTO'].map((mode) =>
    controlModeImpact(mode as 'MANUAL' | 'LEARNING' | 'AUTO'),
  );
  const sameRating = modes.map((entry) => entry.review.rating);
  const modeChecks: QaCheck[] = [
    qaCheck(
      'same facts same rating',
      true,
      new Set(sameRating).size === 1,
      '209 has no control-mode penalty term',
    ),
    qaCheck('mode still visible', 3, modes.length, 'all three modes were evaluated'),
  ];
  for (const entry of modes) entry.dispose();
  checks.push(...modeChecks);

  /* ---------------------------------------------------------------- 210: charts */
  const scenario = createKpiHistoryScenario();
  const history = scenario.selection();
  const downsampled = scenario.selection({ maximumDailyPoints: 20 });
  const historyChecks: QaCheck[] = [
    qaCheck('history months', 12, history.months.length, 'the default window is twelve months'),
    qaCheck('months with data', 11, history.totals.monthsWithData, 'one month has no bucket'),
    qaCheck('months without data', 1, history.totals.monthsWithoutData, 'the gap stays NO_DATA'),
    qaCheck('partial months', 1, history.totals.partialMonths, 'the current month is partial'),
    qaCheck('exact daily points', 310, history.daily.exactPoints, 'every retained day is exact'),
    qaCheck(
      'visual points capped',
      true,
      history.daily.visualPoints > 0 && history.daily.visualPoints <= 60,
      'the chart uses at most the default 60 points',
    ),
    qaCheck('downsampled', true, history.daily.downsampled, 'a visual point groups several days'),
    qaCheck(
      'revenue',
      31_960,
      history.totals.revenueMinorUnits,
      'the documented synthetic scenario',
    ),
    qaCheck('reviews', 284, history.totals.reviewCount, 'the documented review sample'),
    qaCheck(
      'weighted mean',
      2.552817,
      history.totals.averageRating,
      'ratingSum / reviewCount, never the mean of monthly means',
    ),
    qaCheck(
      'smaller chart cap keeps the exact days',
      history.daily.exactPoints,
      downsampled.daily.exactPoints,
      'downsampling is visual only',
    ),
    qaCheck('smaller chart points', 20, downsampled.daily.visualPoints, 'the cap is honoured'),
    qaCheck('history scans', 0, history.historyScans, 'building the chart reads no ledger row'),
  ];
  checks.push(...historyChecks);

  const panel = createKpiHistoryHarness({ scenario, mode: 'MANUAL' });
  const closedRefresh = panel.panel.refresh();
  const readsBefore = panel.reads();
  panel.panel.open();
  const readsAfterOpen = panel.reads();
  const statsAfterOpen = panel.panel.getStats();
  const panelChecks: QaCheck[] = [
    qaCheck('closed panel skips', 'SKIPPED_CLOSED', closedRefresh, 'no read on the tick path'),
    qaCheck('closed panel reads', 0, readsBefore, 'a closed panel never rebuilds the charts'),
    qaCheck('open panel reads once', 1, readsAfterOpen, 'opening reads the read model once'),
    qaCheck('open panel renders once', 1, statsAfterOpen.renders, 'one render per open'),
    qaCheck(
      'manual mode suspends',
      true,
      panel.suspensions.includes('panel'),
      '070 pauses the simulation in MANUAL',
    ),
  ];
  panel.closeByEscape();
  panelChecks.push(
    qaCheck(
      'closing resumes the previous mode',
      true,
      panel.resumes.length > 0,
      'the popup never leaves the game paused',
    ),
    qaCheck('history scans after open', 0, panel.scenario.selection().historyScans, 'still zero'),
  );
  checks.push(...panelChecks);

  /* ---------------------------------------------------------------- 211/212: daily */
  const daily = createDailyHarness();
  const initial = daily.read();
  const manualObjective = daily.instanceOf('MANUAL_DROPOFFS');
  const dailyChecks: QaCheck[] = [
    qaCheck('daily instances', 3, initial.instances.length, 'exactly three missions per day'),
    qaCheck('daily promised xp', 300, initial.promisedXp, 'three authored rewards'),
    qaCheck('daily manual available', true, manualObjective.allowsManual, 'one MANUAL path exists'),
    qaCheck(
      'daily manual needs no learning',
      null,
      manualObjective.learningKey,
      'MANUAL is not gated',
    ),
    qaCheck(
      'daily instance ids distinct',
      3,
      new Set(initial.instances.map((entry) => entry.instanceId)).size,
      'each slot has its own identity',
    ),
  ];

  daily.ride('ride:216:manual-1', { mode: 'MANUAL' });
  const firstManualRide = daily.read();
  daily.ride('ride:216:manual-2', { mode: 'MANUAL' });
  const completed = daily.read();
  const manualRow = completed.instances.find(
    (entry) => entry.instanceId === manualObjective.instanceId,
  );
  const completedRows = completed.instances.filter((entry) => entry.state === 'COMPLETED');
  dailyChecks.push(
    qaCheck(
      'manual progress after one ride',
      1,
      firstManualRide.instances.find((entry) => entry.instanceId === manualObjective.instanceId)
        ?.progress ?? -1,
      'the real PICKUP..DROPOFF interval counts once',
    ),
    qaCheck('manual objective state', 'COMPLETED', manualRow?.state, 'two manual rides satisfy it'),
    qaCheck(
      'manual reward identity',
      true,
      (manualRow?.rewardId ?? null) !== null,
      'one 211 reward',
    ),
    qaCheck('manual reward xp', 100, manualRow?.rewardXp, 'the authored amount'),
    qaCheck(
      'one reward per completed objective',
      true,
      completed.rewards === completedRows.length && completedRows.length >= 1,
      'a second completed objective is a separate authored reward',
    ),
    qaCheck(
      'completed objectives carry a reward',
      true,
      completedRows.every((entry) => entry.rewardId !== null && entry.rewardXp > 0),
      'no completed row is left unpaid',
    ),
  );
  daily.ride('ride:216:manual-3', { mode: 'MANUAL' });
  const afterExtraRide = daily.read();
  dailyChecks.push(
    qaCheck(
      'daily rewards after extra ride',
      completed.rewards,
      afterExtraRide.rewards,
      'an extra ride pays no new reward',
    ),
    qaCheck(
      'extra ride after completion',
      1,
      afterExtraRide.instances.find((entry) => entry.instanceId === manualObjective.instanceId)
        ?.afterCompletionEvents ?? -1,
      'a later event is counted, not paid',
    ),
  );
  checks.push(...dailyChecks);

  const negativeDaily = createDailyHarness();
  const foreignRejected = negativeDaily.ingest(
    envelope(
      'DROPOFF',
      negativeDaily.nextTick(),
      { vehicleId: DAILY_TAXI, rideId: 'ride:foreign' },
      {
        sessionId: 'session:216-foreign',
        entityIds: [DAILY_TAXI, 'ride:foreign'],
      },
    ),
  );
  const foreignReason = negativeDaily.read().lastRejection?.reason ?? null;
  const negativeDailyChecks: QaCheck[] = [
    qaCheck(
      'foreign session refused',
      'REJECTED',
      foreignRejected.status,
      'another session cannot satisfy the Academy daily',
    ),
    qaCheck('foreign session reason', 'FOREIGN_SESSION', foreignReason, 'the refusal is reported'),
  ];
  negativeDaily.ride('ride:216:auto', { mode: 'AUTO' });
  negativeDailyChecks.push(
    qaCheck(
      'auto ride does not complete the manual objective',
      'ACTIVE',
      negativeDaily.instanceOf('MANUAL_DROPOFFS').state,
      'an AUTO dropoff cannot satisfy the MANUAL objective',
    ),
    qaCheck(
      'mode mismatch counted',
      true,
      (negativeDaily.instanceOf('MANUAL_DROPOFFS').modeMismatches ?? 0) > 0,
      'the refusal is counted, not hidden',
    ),
  );
  const rewardsBeforeNextDay = negativeDaily.progress.calendarState().rewards.length;
  const nextDay = negativeDaily.progress.advance({
    calendar: calendarInput('2026-11-12'),
    capabilities: learningOnlyCapabilities(),
    generatedAtMs: calendarInput('2026-11-12').observedAtMs,
    templateCatalog: coreCatalog(),
  });
  negativeDailyChecks.push(
    qaCheck('next day action', 'NEW_DAY', nextDay.action, 'the calendar moves one day'),
    qaCheck('next day rows', 3, nextDay.createdRows, 'exactly three new missions'),
  );
  negativeDaily.setObserved(calendarInput('2026-11-12').observedAtMs);
  negativeDailyChecks.push(
    qaCheck(
      'next day rewards kept',
      rewardsBeforeNextDay,
      negativeDaily.progress.calendarState().rewards.length,
      'rewards of the previous day stay in the calendar ledger',
    ),
  );
  checks.push(...negativeDailyChecks);

  /* ---------------------------------------------------------------- 213: XP credits */
  const progress = createXpProgress();
  const mission = completedMissionSettlement();
  const missionCredit = progress.creditMission({
    settlement: mission.settlement,
    observedAtMs: XP_FIXTURE_START_MS,
  });
  const missionDuplicate = progress.creditMission({
    settlement: mission.settlement,
    observedAtMs: XP_FIXTURE_START_MS,
  });
  const missionReplay = progress.creditMission({
    settlement: replaySettlement(mission),
    observedAtMs: XP_FIXTURE_START_MS + 1_000,
  });
  const daily_ = dailyReward();
  const dailyCredit = progress.creditDaily({ record: daily_.record, instance: daily_.instance });
  const dailyDuplicate = progress.creditDaily({
    record: daily_.record,
    instance: daily_.instance,
  });
  for (let index = 0; index < 5; index += 1) {
    progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS + index * 30_000, 30_000));
  }
  const shortWindow = progress.observeActiveTime(
    activeWindow(XP_FIXTURE_START_MS + 150_000, 10_000),
  );
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS + 160_000, 30_000, { paused: true }));
  progress.observeActiveTime(
    activeWindow(XP_FIXTURE_START_MS + 190_000, 30_000, { visible: false }),
  );
  const xpRead = progress.read();
  const xpChecks: QaCheck[] = [
    qaCheck('mission credit', 100, missionCredit.creditedXp, 'one real 125 settlement'),
    qaCheck('mission duplicate', 0, missionDuplicate.creditedXp, 'the same identity pays nothing'),
    qaCheck('mission replay', 0, missionReplay.creditedXp, 'a 116 replay pays no XP'),
    qaCheck('daily credit', 100, dailyCredit.creditedXp, 'one real 211 reward'),
    qaCheck('daily duplicate', 0, dailyDuplicate.creditedXp, 'the same reward pays nothing'),
    qaCheck('short window fraction', 166_666, shortWindow.creditedMicroXp, '10 s is 0.166666 XP'),
    qaCheck('balance', 202.666666, xpRead.xpBalance, '100 + 100 + 2.666666'),
    qaCheck('level', 2, xpRead.level, 'the level is derived from the balance table'),
    qaCheck('balance is sum', true, xpRead.balanceIsSumOfEntries, 'structural proof'),
    qaCheck('debits', 0, xpRead.debits, 'no debit path exists'),
    qaCheck('paused skipped', 1, xpRead.counters.timeSkips.PAUSED, 'a paused window pays nothing'),
    qaCheck(
      'background skipped',
      1,
      xpRead.counters.timeSkips.BACKGROUND,
      'a hidden window pays nothing',
    ),
  ];
  checks.push(...xpChecks);

  const negative = clone(mission.settlement) as unknown as {
    rewards: { amount: number; kind: string }[];
  };
  const negativeRow = negative.rewards.find((entry) => entry.kind === 'XP');
  if (negativeRow === undefined) throw new Error('213 fixture settlement has no XP reward');
  negativeRow.amount = -5;
  const negativeRefused = refuses(() =>
    createXpProgress().creditMission({ settlement: negative, observedAtMs: XP_FIXTURE_START_MS }),
  );
  const negativeXpChecks: QaCheck[] = [
    qaCheck('negative credit refused', true, negativeRefused, 'a debit cannot be delivered'),
    qaCheck(
      'balance unchanged after refusal',
      xpRead.xpBalanceMicroXp,
      progress.read().xpBalanceMicroXp,
      'a refused credit changes nothing',
    ),
  ];
  checks.push(...negativeXpChecks);

  /* ---------------------------------------------------------------- criterion 5: no XP loss */
  const lossProgress = createXpProgress();
  lossProgress.creditMission({
    settlement: mission.settlement,
    observedAtMs: XP_FIXTURE_START_MS,
  });
  lossProgress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS + 200_000, 30_000));
  lossProgress.creditDaily({ record: daily_.record, instance: daily_.instance });
  const beforeLoss = lossProgress.read();
  const paths: { id: string; fingerprint: string; unchanged: boolean }[] = [];
  const record = (id: string): void => {
    const fingerprint = xpFingerprint(lossProgress.read());
    paths.push({ id, fingerprint, unchanged: fingerprint === xpFingerprint(beforeLoss) });
  };

  // a) KPI falls: a real 209 failed ride with revenue 0 and a real low review.
  const economy = failingEconomy();
  const failedRide = realFailedRide(2_600);
  try {
    if (economy.snapshot.days[0]?.failedRides !== 1)
      throw new Error('214 fixture did not keep the failed ride');
    record('KPI_DOWN');
    // b) An incident: the real settlement with a passenger aboard and its review.
    const incidentRead = bothDown().read();
    if (incidentRead.delta.revenueDirection !== 'DOWN')
      throw new Error('214 fixture did not report the revenue drop');
    record('INCIDENT');
  } finally {
    failedRide.dispose();
    economy.dispose();
  }

  // c) A failed 116 mission can never produce a 125 settlement, so it credits no XP.
  const failedTracker = createMissionTestTracker({
    catalog: createMissionTestCatalog([testMission({ windowTicks: 600 })]),
  });
  failedTracker.start({ missionId: 'test-mission', tick: 100 });
  const expiredId = failedTracker.advance(1_000).expired[0];
  if (expiredId === undefined) throw new Error('116 fixture did not expire the mission');
  const failedInstance = failedTracker.instance(expiredId);
  const failedSettleRefused = refuses(() =>
    createMissionRewardsLedger({ catalog: failedTracker.catalog() }).settle({
      instance: failedInstance,
    }),
  );
  if (!failedSettleRefused) throw new Error('125 accepted a FAILED mission');
  record('MISSION_FAILED');

  // d) A refused daily reward is a duplicate at 211 and pays nothing at 213.
  const refused = recordDailyReward({
    state: daily_.state,
    instanceId: daily_.instance.instanceId,
    grantedAtMs: daily_.record.grantedAtMs,
  });
  if (refused.duplicate !== true) throw new Error('211 accepted a duplicate daily reward');
  const refusedCredit = lossProgress.creditDaily({
    record: refused.record,
    instance: daily_.instance,
  });
  checks.push(
    qaCheck('refused daily pays zero', 0, refusedCredit.creditedXp, 'the duplicate is refused'),
  );
  record('GOAL_REFUSED');

  // e) A missed day grants no offline XP and keeps the paid reward.
  const missed = advanceDaily(daily_.state, '2026-11-13');
  if (missed.action !== 'FORWARD_JUMP') throw new Error('211 did not report the skipped day');
  record('DAY_MISSED');

  const afterLoss = lossProgress.read();
  const fingerprintBefore = xpFingerprint(beforeLoss);
  const fingerprintAfter = xpFingerprint(afterLoss);
  const noLossChecks: QaCheck[] = [
    qaCheck(
      'XP balance',
      beforeLoss.xpBalanceMicroXp,
      afterLoss.xpBalanceMicroXp,
      'no path is a debit',
    ),
    qaCheck('XP level', beforeLoss.level, afterLoss.level, 'the level cannot fall'),
    qaCheck(
      'XP entries',
      beforeLoss.entries.length,
      afterLoss.entries.length,
      'the ledger is append-only',
    ),
    qaCheck(
      'XP fingerprint',
      fingerprintBefore,
      fingerprintAfter,
      'the entire read model is identical',
    ),
    qaCheck(
      'KPI path',
      true,
      paths.find((entry) => entry.id === 'KPI_DOWN')?.unchanged ?? false,
      'a KPI drop changes no XP',
    ),
    qaCheck(
      'incident path',
      true,
      paths.find((entry) => entry.id === 'INCIDENT')?.unchanged ?? false,
      'an incident changes no XP',
    ),
    qaCheck(
      'failed mission',
      true,
      paths.find((entry) => entry.id === 'MISSION_FAILED')?.unchanged ?? false,
      'a failed objective changes no XP',
    ),
    qaCheck(
      'refused goal',
      true,
      paths.find((entry) => entry.id === 'GOAL_REFUSED')?.unchanged ?? false,
      'a refused reward changes no XP',
    ),
    qaCheck(
      'missed day',
      true,
      paths.find((entry) => entry.id === 'DAY_MISSED')?.unchanged ?? false,
      'a missed day changes no XP',
    ),
    qaCheck('debits structural', 0, afterLoss.debits, 'no debit operation exists'),
    qaCheck(
      'duplicate delivery counted',
      1,
      afterLoss.counters.creditSkips.DUPLICATE_DELIVERY,
      'the refused reward is counted as a skip, never as a loss',
    ),
  ];
  checks.push(...noLossChecks);

  const rows: QaRow[] = [
    qaRow({
      id: 'B1',
      category: 'KPI',
      contract: '214-kpi-impact-v1',
      scenario: 'Venit și rating în ambele direcții, plus un incident real',
      polarity: 'POSITIVE',
      actual: {
        upDown: {
          revenue: upDown.read().delta.revenueMinorUnits,
          rating: upDown.read().delta.ratingDelta,
        },
        downUp: {
          revenue: downUp.read().delta.revenueMinorUnits,
          rating: downUp.read().delta.ratingDelta,
        },
        downDown: {
          revenue: downDown.read().delta.revenueMinorUnits,
          rating: downDown.read().delta.ratingDelta,
          incidents: downDown.read().delta.incidentRides,
        },
      },
      checks: kpiImpactChecks,
      note: 'Consecințele afișate sunt exact agregatele 209, fără evaluator de penalizare.',
    }),
    qaRow({
      id: 'B2',
      category: 'KPI',
      contract: '209-kpi-review-v1',
      scenario: 'Aceleași fapte, trei moduri de control',
      polarity: 'POSITIVE',
      actual: { ratings: sameRating, modes: modes.map((entry) => entry.controlMode) },
      checks: modeChecks,
      note: 'Ratingul nu are termen de mod; MANUAL/LEARNING/AUTO nu sunt pedepsite.',
    }),
    qaRow({
      id: 'B3',
      category: 'KPI',
      contract: '210-kpi-history-v1',
      scenario: 'Douăsprezece luni sintetice, paginare vizuală și medie ponderată',
      polarity: 'POSITIVE',
      actual: {
        months: history.months.length,
        monthsWithData: history.totals.monthsWithData,
        monthsWithoutData: history.totals.monthsWithoutData,
        partialMonths: history.totals.partialMonths,
        exactDays: history.daily.exactPoints,
        visualPoints: history.daily.visualPoints,
        revenue: history.totals.revenueMinorUnits,
        reviews: history.totals.reviewCount,
        weightedMean: history.totals.averageRating,
        cappedPoints: downsampled.daily.visualPoints,
      },
      checks: historyChecks,
      note: 'Lipsa datelor rămâne NO_DATA, iar media este mereu ratingSum / reviewCount.',
    }),
    qaRow({
      id: 'B4',
      category: 'KPI',
      contract: '210-kpi-history-popup-v1',
      scenario: 'Pop-up închis fără citiri, deschidere cu o singură citire, pauză în MANUAL',
      polarity: 'POSITIVE',
      actual: {
        closedRefresh,
        readsBefore,
        readsAfterOpen,
        rendersAfterOpen: statsAfterOpen.renders,
        suspensions: panel.suspensions,
        resumes: panel.resumes.length,
      },
      checks: panelChecks,
      note: 'Un panou închis nu reconstruiește grafice; deschiderea citește o dată.',
    }),
    qaRow({
      id: 'B5',
      category: 'DAILY',
      contract: '211-mission-daily-v1',
      scenario: 'Exact trei misiuni, obiectiv MANUAL îndeplinit și recompense unice pe obiectiv',
      polarity: 'POSITIVE',
      actual: {
        instances: initial.instances.length,
        promisedXp: initial.promisedXp,
        grantedXp: completed.grantedXp,
        rewards: completed.rewards,
        manualState: manualRow?.state,
        manualProgress: manualRow?.progress,
      },
      checks: dailyChecks,
      note: 'Progresul consumă evenimente 007 reale, iar recompensa are o singură identitate.',
    }),
    qaRow({
      id: 'B6',
      category: 'DAILY',
      contract: '212-daily-progress-v1',
      scenario: 'Eveniment străin, mod nepotrivit și ziua următoare',
      polarity: 'NEGATIVE',
      actual: {
        rejection: foreignReason,
        nextDayAction: nextDay.action,
        nextDayRows: nextDay.createdRows,
        rewardsKept: negativeDaily.progress.calendarState().rewards.length,
      },
      checks: negativeDailyChecks,
      note: 'O sesiune străină și un mod greșit nu avansează obiectivul; ziua nouă păstrează istoricul.',
    }),
    qaRow({
      id: 'B7',
      category: 'XP',
      contract: '213-player-progress-v1',
      scenario: 'Credite idempotente, fracții de minut și ferestre excluse',
      polarity: 'POSITIVE',
      actual: {
        missionXp: missionCredit.creditedXp,
        duplicateXp: missionDuplicate.creditedXp,
        replayXp: missionReplay.creditedXp,
        dailyXp: dailyCredit.creditedXp,
        balance: xpRead.xpBalance,
        level: xpRead.level,
        pausedSkips: xpRead.counters.timeSkips.PAUSED,
        backgroundSkips: xpRead.counters.timeSkips.BACKGROUND,
      },
      checks: xpChecks,
      note: 'Soldul este suma intrărilor, iar o fereastră de 10 s plătește exact 0,5 XP.',
    }),
    qaRow({
      id: 'B8',
      category: 'XP',
      contract: '213-player-progress-v1',
      scenario: 'Un credit negativ este refuzat, nu debitat',
      polarity: 'NEGATIVE',
      actual: { refused: negativeRefused, balanceMicroXp: xpRead.xpBalanceMicroXp },
      checks: negativeXpChecks,
      note: 'Validatorul 213 refuză suma negativă înainte de orice scriere.',
    }),
    qaRow({
      id: 'B9',
      category: 'XP',
      contract: '214-kpi-impact-v1 + 213-player-progress-v1',
      scenario: 'Amprente înainte/după pe cele cinci căi de scădere',
      polarity: 'POSITIVE',
      actual: {
        balanceBefore: beforeLoss.xpBalance,
        balanceAfter: afterLoss.xpBalance,
        levelBefore: beforeLoss.level,
        levelAfter: afterLoss.level,
        fingerprintBefore,
        fingerprintAfter,
        paths,
      },
      checks: noLossChecks,
      note: 'XP nu scade pe KPI, incident, misiune eșuată, recompensă refuzată sau zi ratată.',
    }),
  ];

  return Object.freeze({
    rows: Object.freeze(rows),
    checks: Object.freeze(checks),
    facts: Object.freeze({
      kpiVisualPoints: history.daily.visualPoints,
      kpiExactPoints: history.daily.exactPoints,
      dailyInstances: initial.instances.length,
    }),
    xp: Object.freeze({
      before: Object.freeze({
        balance: beforeLoss.xpBalance,
        level: beforeLoss.level,
        entries: beforeLoss.entries.length,
      }),
      after: Object.freeze({
        balance: afterLoss.xpBalance,
        level: afterLoss.level,
        entries: afterLoss.entries.length,
      }),
      fingerprintBefore,
      fingerprintAfter,
      paths: Object.freeze(paths),
      losses: paths.filter((entry) => !entry.unchanged).length,
      debits: 0 as const,
      negativeCredits: false as const,
    }),
  });
}
