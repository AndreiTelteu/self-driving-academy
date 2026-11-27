import {
  LIVE_PERSISTENCE_INTERVAL_TICKS,
  LIVE_PERSISTENCE_VERSION,
  createLiveDailyProgress,
  createLivePersistence,
  restoreLiveCompany,
  type LiveDailyProgress,
  type LivePersistenceStorage,
} from '../../src/app';
import {
  createLiveCompanyEvolution,
  createLiveCompanyFinance,
  type LiveCompanyEvolution,
  type LiveCompanyFinance,
} from '../../src/economy';
import { dailyCapabilities } from '../../src/missions';
import { liveSaveFingerprint } from '../../src/persistence';
import type { LiveSaveFingerprints } from '../../src/persistence';
import {
  createLiveChallengeHarness,
  LIVE_FIXTURE_EPOCH,
  LIVE_FIXTURE_SESSION,
  LIVE_FIXTURE_TAXI,
} from '../missions/live-challenges-fixture';
import { createLiveEconomyFixture } from '../economy/live-economy-fixture';

export const LIVE_PERSISTENCE_REPORT_VERSION = '278-live-persistence-report-v1' as const;
const NOW_MS = 1_760_000_000_000;
const NOW = '2026-11-27T18:20:31.000Z';
const PLAYER = 'player:278:report';
const NAMESPACE = 'report:278:company';

export interface LivePersistenceCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LivePersistenceReport {
  readonly version: typeof LIVE_PERSISTENCE_REPORT_VERSION;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly contract: typeof LIVE_PERSISTENCE_VERSION;
  readonly numbers: Readonly<{
    intervalTicks: number;
    generation: number;
    checkpointTick: number;
    createdAt: string;
    checksum: string;
    bytes: number;
    bodyBytes: number;
    maxFileBytes: number;
    maxBodyBytes: number;
    commitMs: number;
    simulatedTick: number;
    lastSavedTick: number;
    unsavedTicks: number;
    nextDueTick: number;
    previewId: string;
    firstImportXpDelta: number;
    secondImportXpDelta: number;
    secondImportDailyRewardsDelta: number;
    dailyRewards: number;
    xp: number;
    level: number;
    kpiDays: number;
    kpiRevenueMinorUnits: number;
    companyCashMinorUnits: number;
    companyRevenueMinorUnits: number;
    companyProfitMinorUnits: number;
    previousSegment: string;
    openSegments: readonly string[];
    offlineIncome: number;
    offlineXp: number;
    refusals: readonly Readonly<{ case: string; code: string }>[];
  }>;
  readonly fingerprints: Readonly<{
    xp: string;
    daily: string;
    kpi: string;
    company: string;
    profile: string;
    challenges: string;
    afterReloadXp: string;
    afterReloadKpi: string;
    afterReloadCompany: string;
    afterSecondImportXp: string;
    afterSecondImportCompany: string;
  }>;
  readonly checks: readonly LivePersistenceCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function memoryStorage(initial: string | null = null): LivePersistenceStorage & {
  value: string | null;
} {
  const box = {
    value: initial,
    load: () => box.value,
    save: (value: string) => {
      box.value = value;
    },
    clear: () => {
      box.value = null;
    },
  };
  return box;
}

function capabilities() {
  return dailyCapabilities({
    learningKeys: ['speed_delta_urban'],
    zones: ['zone:center'],
    vehicleClasses: ['sedan'],
    controlModes: ['AUTO', 'LEARNING', 'MANUAL'],
    campaignCompleted: [],
    unlocks: [],
  });
}

interface OwnerSet {
  readonly daily: LiveDailyProgress;
  readonly challenges: ReturnType<typeof createLiveChallengeHarness>;
  company: { company: LiveCompanyFinance; evolution: LiveCompanyEvolution };
  profile: { value: { versionId: string; profileId: string; checksum: string } };
  readonly tick: { value: number };
  readonly openSegments: { value: { segmentId: string; vehicleId: string; mode: string }[] };
  readonly storage: LivePersistenceStorage & { value: string | null };
  readonly economySnapshot: { value: unknown };
}

function owners(
  storage: LivePersistenceStorage & { value: string | null },
  withEconomy: boolean,
): OwnerSet {
  const tick = { value: 3 };
  const daily = createLiveDailyProgress({
    playerId: PLAYER,
    timeZone: 'Europe/Bucharest',
    sessionId: LIVE_FIXTURE_SESSION,
    worldEpoch: LIVE_FIXTURE_EPOCH,
    kind: 'ACADEMY',
    capabilities: capabilities(),
    now: () => NOW_MS,
  });
  const challenges = createLiveChallengeHarness({ ledger: daily.playerProgress() });
  const company = createLiveCompanyFinance({ namespace: NAMESPACE });
  const evolution = createLiveCompanyEvolution({ finance: company, namespace: NAMESPACE });
  let economySnapshot: unknown = null;
  if (withEconomy) {
    const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 278 });
    fixture.runTo(60);
    const target = fixture.firstTarget();
    fixture.board(target);
    fixture.complete(target);
    const result = fixture.economyResult();
    if (result !== null) company.step({ atTick: result.tick, settlements: result.settlements });
    economySnapshot = fixture.economy.snapshot(fixture.currentTick());
  }
  return {
    daily,
    challenges,
    company: { company, evolution },
    profile: {
      value: { versionId: 'profile-278@1', profileId: 'profile-278', checksum: 'c'.repeat(64) },
    },
    tick,
    openSegments: {
      value: [{ segmentId: 'segment-report', vehicleId: LIVE_FIXTURE_TAXI, mode: 'MANUAL' }],
    },
    storage,
    economySnapshot: { value: economySnapshot },
  };
}

function companyState(owner: OwnerSet): unknown {
  const ledger = owner.company.company.snapshot(owner.tick.value);
  return ledger === null
    ? null
    : {
        finance: owner.company.company.read(),
        ledger,
        evolution: owner.company.evolution.snapshot(),
      };
}

function companyFingerprint(owner: OwnerSet): string {
  return liveSaveFingerprint(companyState(owner));
}

function fingerprintsOf(owner: OwnerSet): LiveSaveFingerprints {
  return {
    xp: owner.daily.status().xpFingerprint,
    kpi: liveSaveFingerprint(owner.economySnapshot.value),
    company: companyFingerprint(owner),
    profile: owner.profile.value.checksum,
    daily: liveSaveFingerprint(owner.daily.checkpoint()),
    challenges: liveSaveFingerprint(owner.challenges.live.checkpoint()),
  };
}

function runtimeFor(owner: OwnerSet, clock: { value: number }) {
  return createLivePersistence({
    identity: () => ({
      sessionKind: 'ACADEMY',
      sessionId: LIVE_FIXTURE_SESSION,
      playerId: PLAYER,
      profileId: owner.profile.value.profileId,
      activeVersionId: owner.profile.value.versionId,
      worldEpoch: LIVE_FIXTURE_EPOCH,
      learningEpoch: 0,
      tick: owner.tick.value,
      mode: 'MANUAL',
      vehicles: 3,
      manualVehicles: 1,
    }),
    versions: { engine: 'engine-278', physics: 'physics-278', map: 'map-278' },
    profile: {
      capture: () => owner.profile.value,
      restore: (value) => {
        owner.profile.value = value as OwnerSet['profile']['value'];
      },
    },
    daily: {
      capture: () => owner.daily.checkpoint(),
      restore: (value) => owner.daily.restore(value as never),
    },
    metrics: () => {
      const read = owner.daily.read();
      return {
        xp: read.player.xpBalance,
        xpMicroXp: read.player.xpBalanceMicroXp,
        level: read.player.level,
        dailyRewards: read.daily.rewards,
      };
    },
    challenges: {
      capture: () => owner.challenges.live.checkpoint(),
      restore: (value) => owner.challenges.live.restore(value),
    },
    company: {
      capture: () => companyState(owner),
      restore: (value) => {
        const restored = restoreLiveCompany({
          namespace: NAMESPACE,
          clock: owner.company.company.ledger.clock,
          state: value,
        });
        owner.company.company.dispose();
        owner.company.evolution.dispose();
        owner.company.company = restored.company;
        owner.company.evolution = restored.evolution;
      },
    },
    economy: { capture: () => owner.economySnapshot.value },
    segments: { open: () => owner.openSegments.value },
    fingerprints: () => fingerprintsOf(owner),
    storage: owner.storage,
    now: () => NOW,
    monotonic: () => (clock.value += 3),
    intervalTicks: 3,
  });
}

function credit(owner: OwnerSet, windows: number, offsetMs: number): void {
  const start = NOW_MS - windows * 30_000 - 60_000 + offsetMs;
  for (let index = 0; index < windows; index += 1) {
    owner.daily.observeActiveWindow({
      startedAtMs: start + index * 30_000,
      endedAtMs: start + (index + 1) * 30_000,
      controlMode: 'MANUAL',
      paused: false,
      focused: true,
      visible: true,
      afk: false,
    });
  }
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): LivePersistenceCheck {
  return {
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  };
}

export async function runLivePersistenceReport(): Promise<LivePersistenceReport> {
  const storage = memoryStorage();
  const owner = owners(storage, true);
  const runtime = runtimeFor(owner, { value: 0 });
  if (runtime.restore().status !== 'EMPTY') throw new Error('Initial restore was not empty');
  const refusals: { case: string; code: string }[] = [];
  credit(owner, 2, 0);

  owner.tick.value = 3;
  runtime.onTick(3);
  await runtime.flush();
  const autosave = runtime.status();

  owner.tick.value = 5;
  const exported = runtime.exportFile();
  if (exported.status !== 'ACCEPTED') throw new Error(`Export refused: ${exported.rejection.code}`);
  const preview = runtime.preview(exported.text);
  if (preview.status !== 'ACCEPTED') throw new Error(`Preview refused: ${preview.rejection.code}`);
  const beforeXp = owner.daily.read().player.xpBalance;
  const beforeRewards = owner.daily.calendarState().rewards.length;
  const beforeCompany = companyFingerprint(owner);

  const invalid = runtime.preview(exported.text.replace('"checksum":"', '"checksum":"0'));
  if (invalid.status === 'REJECTED')
    refusals.push({ case: 'CHECKSUM', code: invalid.rejection.code });
  const noConfirmation = await runtime.importFile(exported.text);
  if (noConfirmation.status === 'REJECTED')
    refusals.push({ case: 'NO_CONFIRMATION', code: noConfirmation.rejection.code });

  credit(owner, 2, 60_000);
  owner.company.company.ledger.accrueFixedCosts({ tick: 10 });
  owner.company.company.ledger.postRide({
    rideId: 'ride-278-report-extra',
    requestId: 'request-278-report-extra',
    taxiId: LIVE_FIXTURE_TAXI,
    tick: 11,
    terminalState: 'COMPLETED',
    passengerAboard: true,
    plannedDistanceMeters: 800,
    revenueMinorUnits: 5_000,
    revenueSettlementId: 'settlement-278-report-extra',
  });
  owner.tick.value = 11;

  const committed = await runtime.importFile(exported.text, { previewId: preview.previewId });
  if (committed.status === 'REJECTED')
    throw new Error(`Import refused: ${committed.rejection.code}`);
  owner.tick.value = committed.summary.tick;
  const secondPreview = runtime.preview(exported.text);
  if (secondPreview.status !== 'ACCEPTED') throw new Error('Second preview refused');
  const second = await runtime.importFile(exported.text, { previewId: secondPreview.previewId });
  if (second.status === 'REJECTED')
    throw new Error(`Second import refused: ${second.rejection.code}`);

  storage.save(exported.text);
  const reloadOwner = owners(storage, false);
  const reloadRuntime = runtimeFor(reloadOwner, { value: 0 });
  const restored = reloadRuntime.restore();
  if (restored.status !== 'RESTORED') throw new Error(`Restore refused: ${restored.status}`);
  reloadOwner.tick.value = restored.summary!.tick;
  const reloadCompany = companyFingerprint(reloadOwner);

  const checks: LivePersistenceCheck[] = [
    check('contract', LIVE_PERSISTENCE_VERSION, runtime.version, '278 live persistence contract'),
    check('interval', 3, autosave.intervalTicks, 'deterministic report interval'),
    check('autosave simulated tick', 3, autosave.simulated.tick, 'simulated time'),
    check('autosave last saved tick', 3, autosave.simulated.lastSavedTick, 'durable tick'),
    check('autosave unsaved ticks', 0, autosave.simulated.unsavedTicks, 'nothing unsaved'),
    check(
      'autosave save time is separate',
      true,
      (autosave.saveTime.lastCommitMs ?? 0) > 0,
      'commit cost in ms',
    ),
    check('export accepted', 'ACCEPTED', exported.status, 'one coherent generation'),
    check('checksum length', 64, exported.checksum.length, 'SHA-256 lowercase hex'),
    check('file within budget', true, exported.bytes <= 1_048_576, 'file budget'),
    check('body within budget', true, exported.summary.bodyBytes <= 262_144, '225 body budget'),
    check('preview identity', exported.checksum, preview.previewId, 'confirmation names the file'),
    check('preview XP', beforeXp, preview.summary.xp, 'owner XP appears in the summary'),
    check(
      'checksum refusal',
      'CHECKSUM_MISMATCH',
      invalid.status === 'REJECTED' ? invalid.rejection.code : null,
      'edited file refused',
    ),
    check(
      'confirmation required',
      'LIVE_SAVE_PREVIEW_REQUIRED',
      noConfirmation.status === 'REJECTED' ? noConfirmation.rejection.code : null,
      'no implicit replacement',
    ),
    check('first import restores XP', true, committed.xpDelta < 0, 'modified state rolled back'),
    check(
      'first import restores company',
      beforeCompany,
      committed.companyFingerprint,
      'company together',
    ),
    check('first import restores daily rewards', 0, committed.dailyRewardsDelta, 'daily retained'),
    check('second import XP delta', 0, second.xpDelta, 'no duplicate XP'),
    check('second import daily delta', 0, second.dailyRewardsDelta, 'no duplicate reward'),
    check(
      'second import company',
      committed.companyFingerprint,
      second.companyFingerprint,
      'no duplicate revenue',
    ),
    check('restore status', 'RESTORED', restored.status, 'autosave row restored'),
    check('restored checksum', exported.checksum, restored.summary?.checksum, 'same generation'),
    check('restored XP', beforeXp, reloadOwner.daily.read().player.xpBalance, 'XP together'),
    check('restored company', beforeCompany, reloadCompany, 'company together'),
    check(
      'restored KPI fingerprint',
      exported.summary.fingerprints.kpi,
      restored.summary?.fingerprints.kpi,
      'KPI snapshot in the file',
    ),
    check(
      'restored daily rewards',
      beforeRewards,
      reloadOwner.daily.calendarState().rewards.length,
      'daily together',
    ),
    check(
      'restored profile',
      'profile-278@1',
      reloadOwner.profile.value.versionId,
      'active style together',
    ),
    check('launch', 'PAUSED_AUTO', restored.launch?.launch, 'paused reload'),
    check('previous segment', 'INCOMPLETE', restored.launch?.previousSegment, 'open segment named'),
    check('offline income', 0, restored.launch?.offlineIncome, 'no offline income'),
    check('offline XP', 0, restored.launch?.offlineXp, 'no offline XP'),
  ];
  const passed = checks.filter((entry) => entry.pass).length;

  return {
    version: LIVE_PERSISTENCE_REPORT_VERSION,
    generatedBy: 'npm run save:live',
    oracleRule:
      'One 225 checkpoint + 278 envelope generation; the same owner snapshots restore, an edited file is refused and a second import adds no XP, daily reward or company revenue.',
    contract: LIVE_PERSISTENCE_VERSION,
    numbers: {
      intervalTicks: LIVE_PERSISTENCE_INTERVAL_TICKS,
      generation: exported.summary.generation,
      checkpointTick: exported.summary.tick,
      createdAt: exported.summary.createdAt,
      checksum: exported.summary.checksum,
      bytes: exported.summary.bytes,
      bodyBytes: exported.summary.bodyBytes,
      maxFileBytes: 1_048_576,
      maxBodyBytes: 262_144,
      commitMs: autosave.saveTime.lastCommitMs ?? 0,
      simulatedTick: autosave.simulated.tick ?? 0,
      lastSavedTick: autosave.simulated.lastSavedTick ?? 0,
      unsavedTicks: autosave.simulated.unsavedTicks ?? 0,
      nextDueTick: autosave.simulated.nextDueTick ?? 0,
      previewId: preview.previewId,
      firstImportXpDelta: committed.xpDelta,
      secondImportXpDelta: second.xpDelta,
      secondImportDailyRewardsDelta: second.dailyRewardsDelta,
      dailyRewards: exported.summary.dailyRewards,
      xp: exported.summary.xp,
      level: exported.summary.level,
      kpiDays: exported.summary.kpiDays,
      kpiRevenueMinorUnits: exported.summary.kpiRevenueMinorUnits ?? 0,
      companyCashMinorUnits: exported.summary.companyCashMinorUnits ?? 0,
      companyRevenueMinorUnits: exported.summary.companyRevenueMinorUnits ?? 0,
      companyProfitMinorUnits: exported.summary.companyProfitMinorUnits ?? 0,
      previousSegment: exported.summary.resume.previousSegment,
      openSegments: exported.summary.resume.openSegmentIds,
      offlineIncome: exported.summary.resume.offlineIncome,
      offlineXp: exported.summary.resume.offlineXp,
      refusals: Object.freeze(refusals),
    },
    fingerprints: {
      xp: exported.summary.fingerprints.xp,
      daily: exported.summary.fingerprints.daily,
      kpi: exported.summary.fingerprints.kpi,
      company: exported.summary.fingerprints.company,
      profile: exported.summary.fingerprints.profile,
      challenges: exported.summary.fingerprints.challenges,
      afterReloadXp: reloadOwner.daily.status().xpFingerprint,
      afterReloadKpi: restored.summary?.fingerprints.kpi ?? 'MISSING',
      afterReloadCompany: reloadCompany,
      afterSecondImportXp: second.summary.fingerprints.xp,
      afterSecondImportCompany: second.companyFingerprint ?? 'MISSING',
    },
    checks: Object.freeze(checks),
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
