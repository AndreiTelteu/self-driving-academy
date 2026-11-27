import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIVE_PERSISTENCE_INTERVAL_TICKS,
  createLiveDailyProgress,
  createLivePersistence,
  restoreLiveCompany,
  type LiveDailyProgress,
  type LivePersistenceStorage,
} from '../../src/app';
import { createLiveChallengeHarness } from '../missions/live-challenges-fixture';
import { dailyCapabilities } from '../../src/missions';
import type { PlayerProgress } from '../../src/missions';
import {
  createLiveCompanyEvolution,
  createLiveCompanyFinance,
  type LiveCompanyEvolution,
  type LiveCompanyFinance,
} from '../../src/economy';
import {
  LIVE_FIXTURE_EPOCH,
  LIVE_FIXTURE_SESSION,
  LIVE_FIXTURE_TAXI,
} from '../missions/live-challenges-fixture';
import { liveSaveFingerprint } from '../../src/persistence';
import type { LiveSaveFingerprints } from '../../src/persistence';

const PLAYER = 'player:278:live' as const;
const NOW_MS = 1_760_000_000_000 as const;
const NOW = '2026-11-27T18:20:31.000Z' as const;
const NAMESPACE = 'test:278:company' as const;

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

interface OwnerFixture {
  readonly identity: () => {
    sessionKind: 'ACADEMY';
    sessionId: string;
    playerId: string;
    profileId: string;
    activeVersionId: string;
    worldEpoch: number;
    learningEpoch: number;
    tick: number;
    mode: 'MANUAL' | 'AUTO' | 'LEARNING';
    vehicles: number;
    manualVehicles: number;
  };
  readonly daily: LiveDailyProgress;
  readonly challenges: ReturnType<typeof createLiveChallengeHarness>;
  readonly company: { company: LiveCompanyFinance; evolution: LiveCompanyEvolution };
  readonly profile: { value: { versionId: string; profileId: string; checksum: string } };
  readonly segments: {
    open: () => readonly { segmentId: string; vehicleId: string; mode: string }[];
  };
  readonly tick: { value: number };
  readonly fingerprints: () => LiveSaveFingerprints;
  readonly storage: LivePersistenceStorage & { value: string | null };
  readonly openSegments: { value: { segmentId: string; vehicleId: string; mode: string }[] };
}

function owners(storage = memoryStorage()): OwnerFixture {
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
  const challenges = createLiveChallengeHarness({
    ledger: daily.playerProgress() as PlayerProgress,
  });
  const company = createLiveCompanyFinance({ namespace: NAMESPACE });
  const evolution = createLiveCompanyEvolution({ finance: company, namespace: NAMESPACE });
  const holder = { company, evolution };
  const profile = {
    value: { versionId: 'profile-278@1', profileId: 'profile-278', checksum: 'c'.repeat(64) },
  };
  const openSegments = {
    value: [{ segmentId: 'segment-open', vehicleId: LIVE_FIXTURE_TAXI, mode: 'MANUAL' }],
  };
  const identity = () => ({
    sessionKind: 'ACADEMY' as const,
    sessionId: LIVE_FIXTURE_SESSION,
    playerId: PLAYER,
    profileId: profile.value.profileId,
    activeVersionId: profile.value.versionId,
    worldEpoch: LIVE_FIXTURE_EPOCH,
    learningEpoch: 0,
    tick: tick.value,
    mode: 'MANUAL' as const,
    vehicles: 3,
    manualVehicles: 1,
  });
  const fingerprints = (): LiveSaveFingerprints => {
    const companyState =
      holder.company.snapshot(tick.value) === null
        ? null
        : {
            finance: holder.company.read(),
            ledger: holder.company.snapshot(tick.value),
            evolution: holder.evolution.snapshot(),
          };
    return {
      xp: daily.status().xpFingerprint,
      kpi: liveSaveFingerprint({ kpi: holder.company.read()?.totals ?? null }),
      company: companyState === null ? 'none' : liveSaveFingerprint(companyState),
      profile: profile.value.checksum,
      daily: liveSaveFingerprint(daily.checkpoint()),
      challenges: liveSaveFingerprint(challenges.live.checkpoint()),
    };
  };
  return {
    identity,
    daily,
    challenges,
    company: holder,
    profile,
    segments: { open: () => openSegments.value },
    tick,
    fingerprints,
    storage,
    openSegments,
  };
}

function persistenceOf(
  owner: OwnerFixture,
  options: Partial<Parameters<typeof createLivePersistence>[0]> = {},
) {
  return createLivePersistence({
    identity: owner.identity,
    versions: { engine: 'engine-278', physics: 'physics-278', map: 'map-278' },
    profile: {
      capture: () => owner.profile.value,
      restore: (value) => {
        owner.profile.value = value as OwnerFixture['profile']['value'];
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
      capture: () => {
        const ledger = owner.company.company.snapshot(owner.tick.value);
        if (ledger === null) return null;
        return {
          finance: owner.company.company.read(),
          ledger,
          evolution: owner.company.evolution.snapshot(),
        };
      },
      restore: (value) => {
        const clock = owner.company.company.ledger.clock;
        if (value === null) {
          const company = createLiveCompanyFinance({ namespace: NAMESPACE, clock });
          const evolution = createLiveCompanyEvolution({
            finance: company,
            namespace: NAMESPACE,
            clock,
          });
          owner.company.company.dispose();
          owner.company.evolution.dispose();
          owner.company.company = company;
          owner.company.evolution = evolution;
          return;
        }
        const restored = restoreLiveCompany({ namespace: NAMESPACE, clock, state: value });
        owner.company.company.dispose();
        owner.company.evolution.dispose();
        owner.company.company = restored.company;
        owner.company.evolution = restored.evolution;
      },
    },
    economy: {
      capture: () => ({ kpi: { totals: { revenueMinorUnits: 0 }, days: [] } }),
    },
    segments: owner.segments,
    fingerprints: owner.fingerprints,
    storage: owner.storage,
    now: () => NOW,
    monotonic: () => 0,
    intervalTicks: 3,
    ...options,
  });
}

function creditXp(owner: OwnerFixture, windows = 2, offsetMs = 0): void {
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

function companyFingerprint(owner: OwnerFixture): string {
  return liveSaveFingerprint(companySnapshot(owner));
}
function companySnapshot(owner: OwnerFixture) {
  return {
    finance: owner.company.company.read(),
    ledger: owner.company.company.snapshot(owner.tick.value),
    evolution: owner.company.evolution.snapshot(),
  };
}

test('278 live persistence: periodic autosave commits one generation and reports simulated and save time separately', async () => {
  const owner = owners();
  let clock = 40;
  const runtime = persistenceOf(owner, {
    intervalTicks: 3,
    now: () => NOW,
    monotonic: () => clock,
  });
  try {
    assert.equal(runtime.restore().status, 'EMPTY');
    assert.equal(runtime.onTick(1).status, 'SKIPPED');
    assert.equal(runtime.onTick(2).status, 'SKIPPED');
    owner.tick.value = 3;
    clock = 40;
    const decision = runtime.onTick(3);
    assert.equal(decision.status, 'SCHEDULED');
    await runtime.flush();
    const status = runtime.status();
    assert.equal(status.simulated.tick, 3);
    assert.equal(status.simulated.lastSavedTick, 3);
    assert.equal(status.simulated.unsavedTicks, 0);
    assert.equal(status.simulated.nextDueTick, 6);
    assert.equal(status.saveTime.lastAttemptAt, NOW);
    assert.equal(status.saveTime.lastSuccessAt, NOW);
    assert.ok(status.saveTime.lastCommitMs !== null);
    assert.ok(status.lastCycle !== null);
    assert.equal(status.lastCycle?.generation, status.simulated.generation);
    assert.equal(status.counters.commits, 1);
    assert.equal(status.view.claimsCompletedSave, true);
    assert.equal(status.intervalTicks, 3);
    assert.equal(LIVE_PERSISTENCE_INTERVAL_TICKS, 900);
  } finally {
    runtime.dispose();
  }
});

test('278 live persistence: export, preview, explicit confirmation and a second import do not duplicate XP, daily or revenue', async () => {
  const owner = owners();
  const runtime = persistenceOf(owner);
  try {
    assert.equal(runtime.restore().status, 'EMPTY');
    creditXp(owner);
    owner.company.company.ledger.accrueFixedCosts({ tick: 4 });
    owner.company.company.ledger.postRide({
      rideId: 'ride-278-1',
      requestId: 'request-278-1',
      taxiId: LIVE_FIXTURE_TAXI,
      tick: 5,
      terminalState: 'COMPLETED',
      passengerAboard: true,
      plannedDistanceMeters: 1_200,
      revenueMinorUnits: 9_000,
      revenueSettlementId: 'settlement-278-1',
    });
    owner.tick.value = 5;
    const exported = runtime.exportFile();
    assert.equal(exported.status, 'ACCEPTED');
    const beforeXp = owner.daily.read().player.xpBalance;
    const beforeRewards = owner.daily.calendarState().rewards.length;
    const beforeCompanyState = companySnapshot(owner);
    const beforeCompany = liveSaveFingerprint(beforeCompanyState);
    assert.ok(beforeXp > 0);
    assert.equal(beforeRewards, 0);

    creditXp(owner, 2, 60_000);
    owner.company.company.ledger.accrueFixedCosts({ tick: 10 });
    owner.company.company.ledger.postRide({
      rideId: 'ride-278-2',
      requestId: 'request-278-2',
      taxiId: LIVE_FIXTURE_TAXI,
      tick: 11,
      terminalState: 'COMPLETED',
      passengerAboard: true,
      plannedDistanceMeters: 800,
      revenueMinorUnits: 5_000,
      revenueSettlementId: 'settlement-278-2',
    });
    owner.tick.value = 11;
    assert.notEqual(owner.daily.read().player.xpBalance, beforeXp);
    assert.notEqual(companyFingerprint(owner), beforeCompany);

    const preview = runtime.preview(exported.text);
    assert.equal(preview.status, 'ACCEPTED');
    assert.equal(preview.previewId, exported.checksum);
    assert.equal(preview.summary.xp, beforeXp);
    assert.equal(preview.summary.companyRevenueMinorUnits, 9_000);

    const required = await runtime.importFile(exported.text);
    assert.equal(required.status, 'REJECTED');
    assert.equal(required.rejection.code, 'LIVE_SAVE_PREVIEW_REQUIRED');
    const stale = await runtime.importFile(exported.text, { previewId: 'f'.repeat(64) });
    assert.equal(stale.status, 'REJECTED');
    assert.equal(stale.rejection.code, 'LIVE_SAVE_PREVIEW_STALE');
    assert.equal(owner.daily.read().player.xpBalance, beforeXp + 1);

    const committed = await runtime.importFile(exported.text, { previewId: preview.previewId });
    assert.equal(committed.status, 'COMMITTED');
    owner.tick.value = committed.summary.tick;
    assert.equal(owner.daily.read().player.xpBalance, beforeXp);
    assert.equal(owner.daily.calendarState().rewards.length, beforeRewards);
    assert.equal(companyFingerprint(owner), beforeCompany);
    assert.equal(committed.rewards.settled, 0);
    assert.equal(committed.rewards.granted, 0);
    assert.equal(committed.previousSegment, 'INCOMPLETE');
    assert.deepEqual(committed.openSegmentIds, ['segment-open']);
    assert.equal(committed.launch.launch, 'PAUSED_AUTO');
    assert.equal(committed.launch.offlineIncome, 0);
    assert.equal(committed.launch.offlineXp, 0);
    assert.ok(committed.xpDelta < 0);

    const secondPreview = runtime.preview(exported.text);
    assert.equal(secondPreview.status, 'ACCEPTED');
    const second = await runtime.importFile(exported.text, { previewId: secondPreview.previewId });
    assert.equal(second.status, 'COMMITTED');
    assert.equal(second.xpDelta, 0);
    assert.equal(second.dailyRewardsDelta, 0);
    assert.equal(second.companyFingerprint, committed.companyFingerprint);
    assert.equal(second.summary.checksum, committed.checksum);
  } finally {
    runtime.dispose();
  }
});

test('278 live persistence: an invalid file or a bad checksum preserves the current session and the stored row', async () => {
  const owner = owners();
  const runtime = persistenceOf(owner);
  try {
    assert.equal(runtime.restore().status, 'EMPTY');
    creditXp(owner);
    owner.tick.value = 3;
    await runtime.saveNow(3);
    const stored = owner.storage.value;
    assert.ok(stored !== null);
    const xpBefore = owner.daily.read().player.xpBalance;
    const companyBefore = companyFingerprint(owner);
    const exported = runtime.exportFile();
    assert.equal(exported.status, 'ACCEPTED');
    const modified = exported.text!.replace('"checksum":"', '"checksum":"0');
    const preview = runtime.preview(modified);
    assert.equal(preview.status, 'REJECTED');
    assert.equal(preview.rejection.code, 'CHECKSUM_MISMATCH');
    assert.equal(owner.daily.read().player.xpBalance, xpBefore);
    assert.equal(companyFingerprint(owner), companyBefore);
    assert.equal(owner.storage.value, stored);

    const wrongSession = runtime.preview(
      exported.text!.replace(LIVE_FIXTURE_SESSION, 'session-other-278'),
    );
    assert.equal(wrongSession.status, 'REJECTED');
    assert.equal(wrongSession.rejection.code, 'CHECKSUM_MISMATCH');
    assert.equal(owner.daily.read().player.xpBalance, xpBefore);
  } finally {
    runtime.dispose();
  }
});

test('278 live persistence: a reload restores XP, daily rewards, company and the profile together, paused/AUTO and with no offline income', async () => {
  const storage = memoryStorage();
  const first = owners(storage);
  const firstRuntime = persistenceOf(first);
  assert.equal(firstRuntime.restore().status, 'EMPTY');
  let savedXp = 0;
  let savedCompany = '';
  let savedChecksum = '';
  try {
    creditXp(first);
    first.company.company.ledger.accrueFixedCosts({ tick: 4 });
    first.company.company.ledger.postRide({
      rideId: 'ride-278-reload',
      requestId: 'request-278-reload',
      taxiId: LIVE_FIXTURE_TAXI,
      tick: 5,
      terminalState: 'COMPLETED',
      passengerAboard: true,
      plannedDistanceMeters: 1_500,
      revenueMinorUnits: 8_000,
      revenueSettlementId: 'settlement-278-reload',
    });
    first.tick.value = 5;
    savedXp = first.daily.read().player.xpBalance;
    savedCompany = companyFingerprint(first);
    const saved = firstRuntime.exportFile();
    assert.equal(saved.status, 'ACCEPTED');
    savedChecksum = saved.checksum!;
    first.storage.save(saved.text!);
    assert.ok(storage.value !== null);
  } finally {
    firstRuntime.dispose();
  }

  // A fresh page: owners are empty, the autosave row is the only source.
  const second = owners(storage);
  const secondRuntime = persistenceOf(second);
  try {
    const restored = secondRuntime.restore();
    assert.equal(restored.status, 'RESTORED');
    assert.equal(restored.summary?.checksum, savedChecksum);
    assert.equal(restored.launch?.launch, 'PAUSED_AUTO');
    assert.equal(restored.launch?.offlineIncome, 0);
    assert.equal(restored.launch?.offlineXp, 0);
    assert.equal(restored.launch?.previousSegment, 'INCOMPLETE');
    assert.deepEqual(restored.launch?.openSegmentIds, ['segment-open']);
    assert.equal(second.daily.read().player.xpBalance, savedXp);
    second.tick.value = restored.summary!.tick;
    assert.equal(companyFingerprint(second), savedCompany);
    assert.equal(second.daily.kind, 'ACADEMY');
    assert.equal(second.profile.value.versionId, 'profile-278@1');

    // No offline income: the restored company revenue is exactly the saved ledger, and the next
    // status has not credited anything.
    const read = second.company.company.read();
    assert.equal(read?.totals.revenueMinorUnits, 8_000);
    assert.equal(secondRuntime.status().simulated.lastSavedTick, 5);
    assert.equal(secondRuntime.status().restored?.checksum, savedChecksum);
  } finally {
    secondRuntime.dispose();
  }
});
