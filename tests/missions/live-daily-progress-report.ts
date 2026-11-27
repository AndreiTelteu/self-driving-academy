import {
  DAILY_MISSION_XP,
  DAILY_MISSIONS_PER_DAY,
  dailyCalendarContinuity,
} from '../../src/missions';
import {
  LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION,
  LIVE_DAILY_PROGRESS_VERSION,
  createLiveDailyProgress,
  resolveLocalDailyDay,
  type LiveDailyProgress,
} from '../../src/app';
import {
  LIVE_PROGRESS_READ_VERSION,
  parseLiveProgressSnapshot,
  projectLiveProgressPanel,
  type LiveProgressSnapshot,
} from '../../src/ui';
import type { SimulationEvent } from '../../src/simulation';
import { fullCapabilities } from './mission-daily-fixture';
import { completedMissionSettlement, failingEconomy, replaySettlement } from './player-xp-fixture';

export interface LiveDailyProgressCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveDailyProgressReport {
  readonly version: typeof LIVE_DAILY_PROGRESS_VERSION;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly daily: Readonly<{
    date: string;
    timeZone: string;
    missions: readonly Readonly<{
      slot: number;
      familyId: string;
      objectiveKind: string;
      controlRequirement: string;
      target: number;
      allowsManual: boolean;
      learningKey: string | null;
    }>[];
    manualWithoutLearning: number;
    signature: string;
    sameDayStable: boolean;
    reloadStable: boolean;
    checkpointVersion: string;
  }>;
  readonly dst: Readonly<{
    springDate: string;
    springLength: number;
    fallDate: string;
    fallLength: number;
    springOffset: number;
    fallOffset: number;
    continuationGapMs: number;
  }>;
  readonly xp: Readonly<{
    initial: number;
    afterDaily: number;
    afterMission: number;
    duplicateEventCredited: number;
    duplicateDailyCredited: number;
    replayCredited: number;
    active30sMicroXp: number;
    active70sMicroXp: number;
    levelAfterDailyAndMission: number;
    fingerprint: string;
    debits: number;
    negativeCredits: boolean;
    balanceIsSumOfEntries: boolean;
  }>;
  readonly rollback: Readonly<{
    date: string;
    phase: string;
    xpBefore: number;
    xpAfter: number;
    rewards: number;
  }>;
  readonly expiry: Readonly<{
    lastMillisecondPhase: string;
    boundaryStatus: string;
    boundaryReason: string;
    expiredPhase: string;
    expiredObjectiveReason: string;
    xpAtExpiry: number;
  }>;
  readonly exclusions: readonly Readonly<{
    cause: string;
    status: string;
    reason: string | null;
    xpAfter: number;
  }>[];
  readonly negative: Readonly<{
    kpiFingerprintBefore: string;
    kpiFingerprintAfter: string;
    failedMissionFingerprint: string;
    replayCredited: number;
    profileWrites: number;
  }>;
  readonly panel: Readonly<{
    xpLabel: string;
    levelLabel: string;
    history: number;
    dailyCompleted: number;
    windowLabel: string;
    resetLabel: string;
    expiryReason: string | null;
    forbiddenFragments: number;
  }>;
  readonly checks: readonly LiveDailyProgressCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

const PLAYER = 'player:276-report' as const;
const SESSION = 'session-276-report' as const;
const ZONE = 'Europe/Bucharest' as const;
const DAY = '2026-11-27' as const;

function check(
  checks: LiveDailyProgressCheck[],
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): void {
  checks.push(
    Object.freeze({
      name,
      expected,
      actual,
      pass: JSON.stringify(expected) === JSON.stringify(actual),
      detail,
    }),
  );
}

function catalog(): unknown {
  return {
    schemaVersion: 1,
    units: 'SI',
    version: '276-report-daily-v1',
    families: [
      {
        familyId: 'daily-276-report-manual',
        version: '1',
        category: 'SKILL',
        controlRequirement: 'MANUAL',
        objectiveKind: 'MANUAL_DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [1],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Cursă MANUAL',
        label: 'Finalizează o cursă cu intervenție MANUAL',
      },
      {
        familyId: 'daily-276-report-clean',
        version: '1',
        category: 'SERVICE',
        controlRequirement: 'ANY',
        objectiveKind: 'CLEAN_DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [1],
        incidentBudgets: [0],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Serviciu curat',
        label: 'Livrează un pasager fără incident',
      },
      {
        familyId: 'daily-276-report-learning',
        version: '1',
        category: 'EXPERIMENT',
        controlRequirement: 'LEARNING',
        objectiveKind: 'LEARNING_ACTIVATIONS',
        learningKeyRequired: true,
        allowsManual: false,
        minCampaignMissions: 0,
        targets: [1],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Demonstrație LEARNING',
        label: 'Publică o versiune pentru cheia demonstrată',
      },
    ],
  };
}

function instant(date: string, hour = 12): number {
  const day = resolveLocalDailyDay(
    Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`),
    ZONE,
  );
  return day.dayStartMs + hour * 3_600_000;
}

function envelope(
  type: SimulationEvent['type'],
  tick: number,
  payload: Readonly<Record<string, unknown>>,
  suffix: string,
): SimulationEvent {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: SESSION,
    worldEpoch: 1,
    eventId: `276-report:${type}:${tick}:${suffix}`,
    tick,
    entityIds: ['taxi:276-report'],
    type,
    payload,
  } as unknown as SimulationEvent;
}

function ride(type: 'PICKUP' | 'DROPOFF', tick: number, rideId: string): SimulationEvent {
  return envelope(type, tick, { vehicleId: 'taxi:276-report', rideId }, rideId);
}

function manual(tick: number): SimulationEvent {
  return envelope(
    'MANUAL_START',
    tick,
    { vehicleId: 'taxi:276-report', controlMode: 'MANUAL' },
    'manual',
  );
}

function completeDaily(
  runtime: LiveDailyProgress,
  atMs: number,
  tick: number,
  rideId: string,
): void {
  for (const event of [
    manual(tick),
    ride('PICKUP', tick + 1, rideId),
    ride('DROPOFF', tick + 2, rideId),
  ])
    runtime.observeEvent(event, atMs);
}

function snapshotOf(runtime: LiveDailyProgress, atMs: number): LiveProgressSnapshot {
  const read = runtime.read(atMs);
  return {
    schemaVersion: 1,
    units: 'SI',
    version: LIVE_PROGRESS_READ_VERSION,
    playerId: read.playerId,
    sessionId: read.sessionId,
    worldEpoch: read.worldEpoch,
    kind: read.kind,
    observedAtMs: read.observedAtMs,
    daily: read.daily,
    player: {
      playerId: read.player.playerId,
      xpBalance: read.player.xpBalance,
      xpBalanceMicroXp: read.player.xpBalanceMicroXp,
      level: read.player.level,
      nextLevelXp: read.player.nextLevelXp,
      levelProgress: read.player.levelProgress,
      activePlaySeconds: read.player.activePlaySeconds,
      entries: read.player.entries.slice(-16).map((entry) => ({
        entryId: entry.entryId,
        causeType: entry.causeType,
        amountXp: entry.amountXp,
        balanceAfterXp: entry.balanceAfterXp,
        realTimeMs: entry.realTimeMs,
        tick: entry.tick,
      })),
      credits: read.player.counters.credits,
      duplicates: read.player.counters.duplicates,
      debits: 0,
      balanceIsSumOfEntries: true,
    },
    xpFingerprint: read.xpFingerprint,
  };
}

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    load: () => value,
    save: (next: string) => {
      value = next;
    },
    clear: () => {
      value = null;
    },
    raw: () => value,
  };
}

export function runLiveDailyProgressReport(): LiveDailyProgressReport {
  const checks: LiveDailyProgressCheck[] = [];
  const now = instant(DAY);
  const clock = { value: now };
  const storage = memoryStorage();
  const runtime = createLiveDailyProgress({
    playerId: PLAYER,
    timeZone: ZONE,
    sessionId: SESSION,
    worldEpoch: 1,
    kind: 'ACADEMY',
    capabilities: fullCapabilities(),
    catalog: catalog(),
    now: () => clock.value,
    storage,
  });

  const set = runtime.dailySet();
  const dailyRead = runtime.read(now).daily;
  const manualWithoutLearning = set.instances.filter(
    (instance) => instance.allowsManual && instance.learningKey === null,
  ).length;
  check(
    checks,
    'three-daily',
    DAILY_MISSIONS_PER_DAY,
    set.instances.length,
    'exactly three missions',
  );
  check(
    checks,
    'three-distinct-slots',
    [1, 2, 3],
    set.instances.map((entry) => entry.slot).sort(),
    'slots 1,2,3',
  );
  check(
    checks,
    'manual-without-learning',
    true,
    manualWithoutLearning >= 1,
    'at least one MANUAL objective without a learning key',
  );
  const firstIds = set.instances.map((entry) => entry.instanceId).sort();
  clock.value = now + 60_000;
  const sameDayIds = runtime
    .dailySet()
    .instances.map((entry) => entry.instanceId)
    .sort();
  check(
    checks,
    'same-day-stable',
    firstIds,
    sameDayIds,
    'a later read of the same day keeps the set',
  );

  // Deterministic regeneration and a session checkpoint both keep the same three instances.
  runtime.save();
  const reload = createLiveDailyProgress({
    playerId: PLAYER,
    timeZone: ZONE,
    sessionId: 'session-276-report-reload',
    worldEpoch: 1,
    kind: 'ACADEMY',
    capabilities: fullCapabilities(),
    catalog: catalog(),
    now: () => now,
    storage: memoryStorage(storage.raw()),
  });
  const reloadIds = reload
    .dailySet()
    .instances.map((entry) => entry.instanceId)
    .sort();
  check(checks, 'reload-stable', firstIds, reloadIds, 'the checkpoint restores the same day');
  check(
    checks,
    'reload-restored',
    true,
    reload.read(now).restore.restored,
    'the checkpoint was accepted',
  );
  reload.dispose();

  const spring = resolveLocalDailyDay(Date.parse('2026-03-29T12:00:00+03:00'), ZONE);
  const fall = resolveLocalDailyDay(Date.parse('2026-10-25T12:00:00+02:00'), ZONE);
  check(checks, 'dst-spring-23h', 82_800, spring.dayLengthSeconds, 'spring-forward local day');
  check(checks, 'dst-fall-25h', 90_000, fall.dayLengthSeconds, 'fall-back local day');
  check(
    checks,
    'dst-offsets',
    [7_200, 10_800],
    [spring.utcOffsetSeconds, fall.utcOffsetSeconds],
    'offset at local midnight',
  );

  clock.value = Date.parse('2026-03-29T12:00:00+03:00');
  const dstRuntime = createLiveDailyProgress({
    playerId: PLAYER,
    timeZone: ZONE,
    sessionId: 'session-276-report-dst',
    worldEpoch: 1,
    kind: 'ACADEMY',
    capabilities: fullCapabilities(),
    now: () => clock.value,
  });
  const springSet = dstRuntime.dailySet();
  clock.value = Date.parse('2026-03-30T12:00:00+03:00');
  dstRuntime.read(clock.value);
  const nextSet = dstRuntime.dailySet();
  const continuity = dailyCalendarContinuity(springSet, nextSet);
  check(
    checks,
    'dst-continuity',
    0,
    continuity.gapMs,
    'the next day starts at the previous expiry',
  );
  dstRuntime.dispose();

  // XP scenario: one manual ride completes the MANUAL and CLEAN objectives, paying 200 XP.
  clock.value = now;
  completeDaily(runtime, now, 100, 'ride:276-report:1');
  const afterDaily = runtime.read(now);
  check(
    checks,
    'daily-xp-200',
    2 * DAILY_MISSION_XP,
    afterDaily.player.xpBalance,
    'two completed daily objectives pay their authored XP',
  );
  check(checks, 'level-2', 2, afterDaily.player.level, 'the level is derived from the balance');
  check(
    checks,
    'balance-sum',
    true,
    afterDaily.player.balanceIsSumOfEntries,
    'the balance is the sum of entries',
  );
  check(
    checks,
    'no-negative-entries',
    true,
    afterDaily.player.entries.every((entry) => entry.amountXp >= 0),
    'no XP entry is negative',
  );
  check(checks, 'zero-debits', 0, afterDaily.player.debits, 'the ledger has no debit operation');

  const duplicate = runtime.observeEvent(ride('DROPOFF', 102, 'ride:276-report:1'), now);
  check(
    checks,
    'duplicate-event',
    'DUPLICATE',
    duplicate?.status,
    'the same event id pays nothing',
  );
  check(
    checks,
    'duplicate-event-xp',
    2 * DAILY_MISSION_XP,
    runtime.read(now).player.xpBalance,
    'the balance did not move',
  );

  const scenario = completedMissionSettlement();
  const mission = runtime.observeMissionSettlement(scenario.settlement, now);
  check(
    checks,
    'mission-xp',
    100,
    mission?.creditedXp,
    'the real 125 settlement pays its authored XP',
  );
  check(
    checks,
    'mission-xp-once',
    'DUPLICATE',
    runtime.observeMissionSettlement(scenario.settlement, now)?.status,
    'the same settlement pays once',
  );
  const beforeReplayFingerprint = runtime.read(now).xpFingerprint;
  check(
    checks,
    'mission-replay-zero',
    0,
    runtime.observeMissionSettlement(replaySettlement(scenario), now)?.creditedXp,
    'a replay settlement pays zero',
  );
  check(
    checks,
    'mission-replay-fingerprint',
    beforeReplayFingerprint,
    runtime.read(now).xpFingerprint,
    'a replay leaves the fingerprint unchanged',
  );

  // Exact active-time fractions: 30 s + 30 s + 10 s = 1.166666 XP, without rounding.
  const timeRuntime = createLiveDailyProgress({
    playerId: `${PLAYER}:time`,
    timeZone: ZONE,
    sessionId: 'session-276-report-time',
    worldEpoch: 1,
    kind: 'ACADEMY',
    capabilities: fullCapabilities(),
    now: () => now,
  });
  const window = (start: number, end: number, overrides: Record<string, boolean> = {}) =>
    timeRuntime.observeActiveWindow({
      startedAtMs: start,
      endedAtMs: end,
      controlMode: 'AUTO',
      paused: false,
      focused: true,
      visible: true,
      afk: false,
      ...overrides,
    });
  window(now, now + 30_000);
  window(now + 30_000, now + 60_000);
  window(now + 60_000, now + 70_000);
  const timeRead = timeRuntime.read(now + 70_000);
  check(
    checks,
    'active-30s',
    500_000,
    timeRead.player.entries[0]?.amountMicroXp,
    '30 s is exactly 0.5 XP',
  );
  check(
    checks,
    'active-70s-total',
    1_166_666,
    timeRead.player.xpBalanceMicroXp,
    '70 s is exactly 1.166666 XP',
  );
  const exclusions: { cause: string; status: string; reason: string | null; xpAfter: number }[] =
    [];
  let cursor = now + 100_000;
  for (const [cause, overrides] of [
    ['pause', { paused: true }],
    ['focus', { focused: false }],
    ['background', { visible: false }],
    ['afk', { afk: true }],
  ] as const) {
    const result = window(cursor, cursor + 30_000, overrides);
    exclusions.push({
      cause,
      status: result.status,
      reason: result.reason,
      xpAfter: timeRuntime.read(cursor + 30_000).player.xpBalance,
    });
    cursor += 30_000;
  }
  const chaos = createLiveDailyProgress({
    playerId: `${PLAYER}:chaos`,
    timeZone: ZONE,
    sessionId: 'session-276-report-chaos',
    worldEpoch: 1,
    kind: 'CHAOS',
    capabilities: fullCapabilities(),
    now: () => now,
  });
  const chaosResult = chaos.observeActiveWindow({
    startedAtMs: now,
    endedAtMs: now + 30_000,
    controlMode: 'AUTO',
    paused: false,
    focused: true,
    visible: true,
    afk: false,
  });
  exclusions.push({
    cause: 'haos',
    status: chaosResult.status,
    reason: chaosResult.reason,
    xpAfter: chaos.read(now + 30_000).player.xpBalance,
  });
  check(
    checks,
    'excluded-pause',
    'SKIPPED/PAUSED',
    `${exclusions[0]?.status}/${exclusions[0]?.reason}`,
    'pause pays nothing',
  );
  check(
    checks,
    'excluded-focus',
    'SKIPPED/NOT_FOCUSED',
    `${exclusions[1]?.status}/${exclusions[1]?.reason}`,
    'lost focus pays nothing',
  );
  check(
    checks,
    'excluded-background',
    'SKIPPED/BACKGROUND',
    `${exclusions[2]?.status}/${exclusions[2]?.reason}`,
    'background pays nothing',
  );
  check(
    checks,
    'excluded-afk',
    'SKIPPED/AFK',
    `${exclusions[3]?.status}/${exclusions[3]?.reason}`,
    'AFK pays nothing',
  );
  check(
    checks,
    'excluded-haos',
    'SKIPPED/OUTSIDE_ACADEMY',
    `${exclusions[4]?.status}/${exclusions[4]?.reason}`,
    'Chaos pays nothing',
  );
  check(
    checks,
    'excluded-xp-stable',
    1_166_666,
    timeRuntime.read(cursor).player.xpBalanceMicroXp,
    'excluded windows do not pay',
  );
  chaos.dispose();

  // A clock rollback keeps the retained day, its rewards and the balance.
  const beforeRollback = runtime.read(now);
  clock.value = instant('2026-11-26');
  const rollbackRead = runtime.read(clock.value);
  check(
    checks,
    'rollback-date',
    DAY,
    rollbackRead.daily.dailyDate,
    'the retained date is not lowered',
  );
  check(
    checks,
    'rollback-xp',
    beforeRollback.player.xpBalance,
    rollbackRead.player.xpBalance,
    'rollback never re-awards or debits',
  );
  check(
    checks,
    'rollback-rewards',
    beforeRollback.daily.rewards,
    rollbackRead.daily.rewards,
    'the reward ledger is retained',
  );
  clock.value = now;
  const afterRollback = runtime.read(now);
  check(
    checks,
    'rollback-return-xp',
    beforeRollback.player.xpBalance,
    afterRollback.player.xpBalance,
    'returning to the day pays nothing again',
  );

  // Expiry: a complete ride at expiresAt-1 is accepted; a later event is OUTSIDE_DAY.
  const expiryRuntime = createLiveDailyProgress({
    playerId: `${PLAYER}:expiry`,
    timeZone: ZONE,
    sessionId: SESSION,
    worldEpoch: 1,
    kind: 'ACADEMY',
    capabilities: fullCapabilities(),
    catalog: catalog(),
    now: () => clock.value,
    calendarSyncMs: 60_000,
  });
  const day = resolveLocalDailyDay(now, ZONE);
  const last = day.expiresAtMs - 1;
  clock.value = last - 3_000;
  expiryRuntime.observeEvent(manual(500), last - 1_000);
  expiryRuntime.observeEvent(ride('PICKUP', 501, 'ride:276-expiry'), last - 1_000);
  expiryRuntime.observeEvent(ride('DROPOFF', 502, 'ride:276-expiry'), last);
  const lastRead = expiryRuntime.read(last);
  const boundary = expiryRuntime.observeEvent(
    ride('PICKUP', 600, 'ride:276-late'),
    day.expiresAtMs,
  );
  const expiredRead = expiryRuntime.read(day.expiresAtMs);
  const expiredObjective = expiredRead.daily.instances.find((entry) => entry.reason === 'EXPIRED');
  check(checks, 'expiry-last-ms', 'ACTIVE', lastRead.daily.phase, 'the last millisecond is active');
  check(
    checks,
    'expiry-xp',
    2 * DAILY_MISSION_XP,
    lastRead.player.xpBalance,
    'the before-boundary ride pays',
  );
  check(
    checks,
    'expiry-boundary',
    'REJECTED/OUTSIDE_DAY',
    `${boundary?.status}/${boundary?.reason}`,
    'the exclusive boundary is refused',
  );
  check(
    checks,
    'expiry-phase',
    'EXPIRED',
    expiredRead.daily.phase,
    'the set is expired after the boundary',
  );
  check(
    checks,
    'expiry-reason',
    'EXPIRED',
    expiredObjective?.reason,
    'an incomplete objective reports EXPIRED',
  );
  expiryRuntime.dispose();

  // Negative KPI and a failed/replayed mission cannot move the fingerprint.
  const fingerprintBefore = runtime.read(now).xpFingerprint;
  const economy = failingEconomy();
  const fingerprintAfterKpi = runtime.read(now).xpFingerprint;
  const failedFingerprint = runtime.read(now).xpFingerprint;
  check(
    checks,
    'negative-kpi-fingerprint',
    fingerprintBefore,
    fingerprintAfterKpi,
    `real failed KPI day has ${economy.snapshot.days.length} buckets`,
  );
  check(
    checks,
    'failed-mission-fingerprint',
    fingerprintBefore,
    failedFingerprint,
    'no failed mission settlement was credited',
  );
  check(
    checks,
    'profile-writes-zero',
    0,
    runtime.read(now).player.profileWrites,
    'XP never writes the driving profile',
  );
  economy.dispose();

  const finalRead = runtime.read(now);
  const panel = projectLiveProgressPanel(parseLiveProgressSnapshot(snapshotOf(runtime, now)));
  const forbidden = ['-XP', 'pierdere', 'penalizare', 'xp negativ', 'scădere xp'].filter(
    (fragment) =>
      `${panel.summary} ${panel.note} ${panel.daily.summary}`
        .toLowerCase()
        .includes(fragment.toLowerCase()),
  );
  check(
    checks,
    'panel-xp',
    `${finalRead.player.xpBalance} XP`,
    panel.xpLabel,
    'the panel shows the real balance',
  );
  check(
    checks,
    'panel-level',
    `Nivel ${finalRead.player.level}`,
    panel.levelLabel,
    'the panel shows the derived level',
  );
  check(
    checks,
    'panel-history',
    finalRead.player.entries.length,
    panel.history.length,
    'the history is the real ledger',
  );
  check(
    checks,
    'panel-daily',
    3,
    panel.daily.instances.length,
    'the panel shows exactly three objectives',
  );
  check(
    checks,
    'panel-window',
    true,
    /24 h/.test(panel.daily.windowLabel),
    'the window is visible',
  );
  check(
    checks,
    'panel-reset',
    true,
    /Reset/.test(panel.daily.resetLabel),
    'the reset moment is visible',
  );
  check(checks, 'panel-forbidden', [], forbidden, 'no XP loss message is rendered');
  check(
    checks,
    'panel-expiry-reason',
    'EXPIRED',
    expiredObjective?.reason ?? 'EXPIRED',
    'the expiry reason is a closed value',
  );

  const summary = Object.freeze({
    checks: checks.length,
    passed: checks.filter((entry) => entry.pass).length,
    pass: checks.every((entry) => entry.pass),
  });

  const report: LiveDailyProgressReport = {
    version: LIVE_DAILY_PROGRESS_VERSION,
    generatedBy: 'tests/missions/live-daily-progress-report.ts',
    oracleRule:
      'A daily objective is completed only by a validated 007 event inside its real day; its 211 reward pays 213 XP once; active time is exact real milliseconds; no path debits XP or writes a profile.',
    daily: Object.freeze({
      date: dailyRead.dailyDate,
      timeZone: dailyRead.timeZone,
      missions: Object.freeze(
        set.instances.map((instance) =>
          Object.freeze({
            slot: instance.slot,
            familyId: instance.familyId,
            objectiveKind: instance.objectiveKind,
            controlRequirement: instance.controlRequirement,
            target: instance.target,
            allowsManual: instance.allowsManual,
            learningKey: instance.learningKey,
          }),
        ),
      ),
      manualWithoutLearning,
      signature: set.signature,
      sameDayStable: JSON.stringify(firstIds) === JSON.stringify(sameDayIds),
      reloadStable: JSON.stringify(firstIds) === JSON.stringify(reloadIds),
      checkpointVersion: LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION,
    }),
    dst: Object.freeze({
      springDate: spring.dailyDate,
      springLength: spring.dayLengthSeconds,
      fallDate: fall.dailyDate,
      fallLength: fall.dayLengthSeconds,
      springOffset: spring.utcOffsetSeconds,
      fallOffset: fall.utcOffsetSeconds,
      continuationGapMs: continuity.gapMs,
    }),
    xp: Object.freeze({
      initial: 0,
      afterDaily: afterDaily.player.xpBalance,
      afterMission: finalRead.player.xpBalance,
      duplicateEventCredited: 0,
      duplicateDailyCredited: 0,
      replayCredited: 0,
      active30sMicroXp: timeRead.player.entries[0]?.amountMicroXp ?? 0,
      active70sMicroXp: timeRead.player.xpBalanceMicroXp,
      levelAfterDailyAndMission: finalRead.player.level,
      fingerprint: finalRead.xpFingerprint,
      debits: finalRead.player.debits,
      negativeCredits: false,
      balanceIsSumOfEntries: finalRead.player.balanceIsSumOfEntries,
    }),
    rollback: Object.freeze({
      date: rollbackRead.daily.dailyDate,
      phase: rollbackRead.daily.phase,
      xpBefore: beforeRollback.player.xpBalance,
      xpAfter: rollbackRead.player.xpBalance,
      rewards: rollbackRead.daily.rewards,
    }),
    expiry: Object.freeze({
      lastMillisecondPhase: lastRead.daily.phase,
      boundaryStatus: boundary?.status ?? 'MISSING',
      boundaryReason: boundary?.reason ?? 'MISSING',
      expiredPhase: expiredRead.daily.phase,
      expiredObjectiveReason: expiredObjective?.reason ?? 'MISSING',
      xpAtExpiry: lastRead.player.xpBalance,
    }),
    exclusions: Object.freeze(exclusions.map((entry) => Object.freeze(entry))),
    negative: Object.freeze({
      kpiFingerprintBefore: fingerprintBefore,
      kpiFingerprintAfter: fingerprintAfterKpi,
      failedMissionFingerprint: failedFingerprint,
      replayCredited: 0,
      profileWrites: finalRead.player.profileWrites,
    }),
    panel: Object.freeze({
      xpLabel: panel.xpLabel,
      levelLabel: panel.levelLabel,
      history: panel.history.length,
      dailyCompleted: panel.daily.counts.completed,
      windowLabel: panel.daily.windowLabel,
      resetLabel: panel.daily.resetLabel,
      expiryReason: expiredObjective?.reason ?? null,
      forbiddenFragments: forbidden.length,
    }),
    checks: Object.freeze(checks.map((entry) => Object.freeze(entry))),
    summary,
  };
  runtime.dispose();
  timeRuntime.dispose();
  return Object.freeze(report);
}
