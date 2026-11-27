import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DAILY_MISSION_XP,
  DAILY_MISSIONS_PER_DAY,
  dailyCalendarContinuity,
  dailyCapabilities,
  type DailyMissionSet,
} from '../../src/missions';
import {
  LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION,
  LIVE_DAILY_PROGRESS_POLICY,
  LIVE_DAILY_PROGRESS_VERSION,
  createLiveDailyProgress,
  resolveLocalDailyDay,
  zoneOffsetSeconds,
  type LiveDailyProgress,
  type LiveDailyProgressOptions,
} from '../../src/app';
import type { SimulationEvent } from '../../src/simulation';
import { completedMissionSettlement, failingEconomy, replaySettlement } from './player-xp-fixture';

const PLAYER = 'player:276-daily' as const;
const SESSION = 'session-276-daily' as const;
const ZONE = 'Europe/Bucharest' as const;
const DAY = '2026-11-27' as const;

function capabilities() {
  return dailyCapabilities({
    learningKeys: ['speed_delta_urban'],
    zones: ['zone:center', 'zone:airport'],
    vehicleClasses: ['compact', 'sedan'],
    controlModes: ['AUTO', 'LEARNING', 'MANUAL'],
    campaignCompleted: [],
    unlocks: [],
  });
}

/** Three deterministic families, one of each control path, each satisfiable by one real ride. */
function catalog(): unknown {
  return {
    schemaVersion: 1,
    units: 'SI',
    version: '276-test-daily-v1',
    families: [
      {
        familyId: 'daily-276-manual',
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
        familyId: 'daily-276-clean',
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
        familyId: 'daily-276-learning',
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

interface Harness {
  readonly runtime: LiveDailyProgress;
  readonly clock: { value: number };
}

function harnessAt(instantMs: number, options: Partial<LiveDailyProgressOptions> = {}): Harness {
  const clock = { value: instantMs };
  const runtime = createLiveDailyProgress({
    playerId: PLAYER,
    timeZone: ZONE,
    sessionId: SESSION,
    worldEpoch: 1,
    kind: 'ACADEMY',
    capabilities: capabilities(),
    catalog: catalog(),
    now: () => clock.value,
    ...options,
  });
  return { runtime, clock };
}

function msAt(date: string, hour = 12): number {
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
  eventId: string,
  worldEpoch = 1,
): SimulationEvent {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: SESSION,
    worldEpoch,
    eventId,
    tick,
    entityIds: ['taxi:276'],
    type,
    payload,
  } as unknown as SimulationEvent;
}

function rideEvents(
  tick: number,
  rideId = 'ride:276',
  vehicleId = 'taxi:276',
): readonly SimulationEvent[] {
  return Object.freeze([
    envelope('MANUAL_START', tick, { vehicleId, controlMode: 'MANUAL' }, `276:manual:${tick}`),
    envelope('PICKUP', tick + 1, { vehicleId, rideId }, `276:pickup:${tick}`),
    envelope('DROPOFF', tick + 2, { vehicleId, rideId }, `276:dropoff:${tick}`),
  ]);
}

function ingestRide(runtime: LiveDailyProgress, atMs: number, tick: number, rideId?: string): void {
  for (const event of rideEvents(tick, rideId)) runtime.observeEvent(event, atMs);
}

function idsOf(set: DailyMissionSet): readonly string[] {
  return set.instances.map((instance) => instance.instanceId).sort();
}

test('276 exactly three daily missions on first entry, at least one MANUAL without learning', () => {
  const instant = msAt(DAY);
  const h = harnessAt(instant);
  try {
    const set = h.runtime.dailySet();
    assert.equal(set.instances.length, DAILY_MISSIONS_PER_DAY);
    assert.deepEqual(set.instances.map((instance) => instance.slot).sort(), [1, 2, 3]);
    assert.ok(
      set.instances.some((instance) => instance.allowsManual && instance.learningKey === null),
      'at least one objective is playable in MANUAL without learning',
    );
    assert.equal(new Set(set.instances.map((instance) => instance.instanceId)).size, 3);
    const read = h.runtime.read(instant);
    assert.equal(read.daily.instances.length, 3);
    assert.equal(read.daily.phase, 'ACTIVE');
    assert.equal(read.daily.dailyDate, DAY);
    assert.equal(read.debits, 0);
    assert.equal(read.negativeCredits, false);
  } finally {
    h.runtime.dispose();
  }
});

test('276 the same local day is stable across re-entry, capability drift and reload', () => {
  const instant = msAt(DAY);
  const storage = memoryStorage();
  const h = harnessAt(instant, { storage });
  try {
    const firstIds = idsOf(h.runtime.dailySet());
    const firstRead = h.runtime.read(instant);
    h.runtime.beginSession({
      sessionId: SESSION,
      worldEpoch: 1,
      tick: 10,
      kind: 'ACADEMY',
      capabilities: {
        ...capabilities(),
        zones: ['zone:center', 'zone:airport', 'zone:suburb'],
      },
    });
    assert.deepEqual(idsOf(h.runtime.dailySet()), firstIds);
    assert.equal(h.runtime.read(instant).daily.dailyDate, firstRead.daily.dailyDate);

    const reloadStorage = memoryStorage(storage.raw());
    const reloaded = createLiveDailyProgress({
      playerId: PLAYER,
      timeZone: ZONE,
      sessionId: SESSION,
      worldEpoch: 1,
      kind: 'ACADEMY',
      capabilities: capabilities(),
      catalog: catalog(),
      now: () => instant,
      storage: reloadStorage,
    });
    try {
      assert.deepEqual(idsOf(reloaded.dailySet()), firstIds);
      assert.equal(reloaded.read(instant).restore.restored, true);
      assert.equal(reloaded.read(instant).player.xpBalance, 0);
      assert.equal(reloaded.read(instant).daily.rewards, 0);
    } finally {
      reloaded.dispose();
    }
  } finally {
    h.runtime.dispose();
  }
});

test('276 DST keeps 23 h and 25 h days and adjacent windows tile exactly', () => {
  const spring = resolveLocalDailyDay(Date.parse('2026-03-29T12:00:00+03:00'), ZONE);
  const fall = resolveLocalDailyDay(Date.parse('2026-10-25T12:00:00+02:00'), ZONE);
  assert.equal(spring.dayLengthSeconds, 82_800);
  assert.equal(fall.dayLengthSeconds, 90_000);
  assert.equal(spring.expiresAtMs - spring.dayStartMs, 82_800_000);
  assert.equal(fall.expiresAtMs - fall.dayStartMs, 90_000_000);
  assert.equal(zoneOffsetSeconds(spring.dayStartMs, ZONE), 7_200);
  assert.equal(zoneOffsetSeconds(fall.dayStartMs, ZONE), 10_800);

  const h = harnessAt(Date.parse('2026-03-29T12:00:00+03:00'));
  try {
    const springSet = h.runtime.dailySet();
    h.clock.value = Date.parse('2026-03-30T12:00:00+03:00');
    const next = h.runtime.read(h.clock.value);
    const nextSet = h.runtime.dailySet();
    const continuity = dailyCalendarContinuity(springSet, nextSet);
    assert.equal(continuity.gapMs, 0);
    assert.equal(next.dayAction?.action, 'NEW_DAY');
    assert.equal(nextSet.dayStartMs, springSet.expiresAtMs);
  } finally {
    h.runtime.dispose();
  }
});

test('276 a clock rollback never regenerates the retained day and never re-awards XP', () => {
  const instant = msAt(DAY);
  const h = harnessAt(instant, { storage: memoryStorage() });
  try {
    const original = idsOf(h.runtime.dailySet());
    ingestRide(h.runtime, instant, 100);
    const read = h.runtime.read(instant);
    assert.equal(read.player.xpBalance, 2 * DAILY_MISSION_XP);
    assert.equal(read.daily.rewards, 2);

    h.clock.value = msAt('2026-11-26');
    const rolledBack = h.runtime.read(h.clock.value);
    assert.deepEqual(idsOf(h.runtime.dailySet()), original);
    assert.equal(rolledBack.player.xpBalance, 2 * DAILY_MISSION_XP);
    assert.equal(rolledBack.daily.rewards, 2);
    assert.equal(rolledBack.daily.phase, 'PENDING');

    h.clock.value = instant;
    const back = h.runtime.read(instant);
    assert.deepEqual(idsOf(h.runtime.dailySet()), original);
    assert.equal(back.player.xpBalance, 2 * DAILY_MISSION_XP);
    assert.equal(back.daily.rewards, 2);
    for (const event of rideEvents(100)) h.runtime.observeEvent(event, instant);
    assert.equal(h.runtime.read(instant).player.xpBalance, 2 * DAILY_MISSION_XP);
  } finally {
    h.runtime.dispose();
  }
});

test('276 the exclusive expiry admits the last millisecond and rejects the boundary', () => {
  const day = resolveLocalDailyDay(msAt(DAY), ZONE);
  const last = day.expiresAtMs - 1;
  const h = harnessAt(last - 3_000, { calendarSyncMs: 60_000 });
  try {
    ingestRide(h.runtime, last - 1_000, 500);
    const read = h.runtime.read(last);
    assert.equal(read.daily.phase, 'ACTIVE');
    assert.equal(read.daily.rewards, 2);
    assert.equal(read.player.xpBalance, 2 * DAILY_MISSION_XP);

    const rejected = h.runtime.observeEvent(
      envelope('PICKUP', 600, { vehicleId: 'taxi:276', rideId: 'ride:late' }, '276:late:pickup'),
      day.expiresAtMs,
    );
    assert.equal(rejected?.status, 'REJECTED');
    assert.equal(rejected?.reason, 'OUTSIDE_DAY');
    assert.equal(h.runtime.read(last).player.xpBalance, 2 * DAILY_MISSION_XP);

    const expired = h.runtime.read(day.expiresAtMs);
    assert.equal(expired.daily.phase, 'EXPIRED');
    const learning = expired.daily.instances.find(
      (instance) => instance.objectiveKind === 'LEARNING_ACTIVATIONS',
    );
    assert.equal(learning?.state, 'EXPIRED');
    assert.equal(learning?.reason, 'EXPIRED');
  } finally {
    h.runtime.dispose();
  }
});

test('276 duplicate events and duplicate daily rewards credit XP exactly once', () => {
  const instant = msAt(DAY);
  const h = harnessAt(instant, { storage: memoryStorage() });
  try {
    const events = rideEvents(200);
    for (const event of events) h.runtime.observeEvent(event, instant);
    assert.equal(h.runtime.read(instant).player.xpBalance, 2 * DAILY_MISSION_XP);
    const duplicate = h.runtime.observeEvent(events[2]!, instant);
    assert.equal(duplicate?.status, 'DUPLICATE');
    assert.equal(h.runtime.read(instant).player.xpBalance, 2 * DAILY_MISSION_XP);

    const after = h.runtime
      .read(instant)
      .daily.instances.find((instance) => instance.objectiveKind === 'MANUAL_DROPOFFS');
    assert.equal(after?.state, 'COMPLETED');
    assert.equal(after?.afterCompletionEvents, 0);
    const newEvents = [
      envelope(
        'PICKUP',
        210,
        { vehicleId: 'taxi:276', rideId: 'ride:276-second' },
        '276:new-pickup',
      ),
      envelope(
        'DROPOFF',
        211,
        { vehicleId: 'taxi:276', rideId: 'ride:276-second' },
        '276:new-dropoff',
      ),
    ];
    for (const event of newEvents) h.runtime.observeEvent(event, instant);
    const completed = h.runtime
      .read(instant)
      .daily.instances.find((instance) => instance.objectiveKind === 'MANUAL_DROPOFFS');
    assert.equal(completed?.afterCompletionEvents, 1);
    assert.equal(h.runtime.read(instant).player.xpBalance, 2 * DAILY_MISSION_XP);
  } finally {
    h.runtime.dispose();
  }
});

test('276 active time preserves exact fractions and excludes pause, focus, background, AFK and Haos', () => {
  const instant = msAt(DAY);
  const h = harnessAt(instant);
  try {
    h.runtime.observeActiveWindow({
      startedAtMs: instant,
      endedAtMs: instant + 30_000,
      controlMode: 'AUTO',
      paused: false,
      focused: true,
      visible: true,
      afk: false,
    });
    h.runtime.observeActiveWindow({
      startedAtMs: instant + 30_000,
      endedAtMs: instant + 60_000,
      controlMode: 'MANUAL',
      paused: false,
      focused: true,
      visible: true,
      afk: false,
    });
    h.runtime.observeActiveWindow({
      startedAtMs: instant + 60_000,
      endedAtMs: instant + 70_000,
      controlMode: 'LEARNING',
      paused: false,
      focused: true,
      visible: true,
      afk: false,
    });
    const credited = h.runtime.read(instant + 70_000);
    assert.equal(credited.player.xpBalanceMicroXp, 1_166_666);
    assert.equal(credited.player.xpBalance, 1.166666);
    assert.equal(credited.player.activePlayMs, 70_000);
    assert.equal(credited.player.level, 1);

    for (const [index, [reason, flags]] of (
      [
        ['PAUSED', { paused: true }],
        ['NOT_FOCUSED', { focused: false }],
        ['BACKGROUND', { visible: false }],
        ['AFK', { afk: true }],
      ] as const
    ).entries()) {
      const start = instant + 100_000 + index * 30_000;
      const result = h.runtime.observeActiveWindow({
        startedAtMs: start,
        endedAtMs: start + 30_000,
        controlMode: 'AUTO',
        paused: false,
        focused: true,
        visible: true,
        afk: false,
        ...flags,
      });
      assert.equal(result.status, 'SKIPPED');
      assert.equal(result.reason, reason);
      assert.equal(result.creditedMicroXp, 0);
    }
    assert.equal(h.runtime.read(instant + 220_000).player.xpBalance, 1.166666);
    for (const entry of h.runtime.read(instant + 220_000).player.entries)
      assert.ok(entry.amountXp >= 0);

    const chaos = harnessAt(instant, { kind: 'CHAOS' });
    try {
      const result = chaos.runtime.observeActiveWindow({
        startedAtMs: instant,
        endedAtMs: instant + 30_000,
        controlMode: 'AUTO',
        paused: false,
        focused: true,
        visible: true,
        afk: false,
      });
      assert.equal(result.status, 'SKIPPED');
      assert.equal(result.reason, 'OUTSIDE_ACADEMY');
      assert.equal(chaos.runtime.read(instant + 30_000).player.xpBalance, 0);
      assert.equal(chaos.runtime.observeEvent(rideEvents(10)[0]!, instant), null);
    } finally {
      chaos.runtime.dispose();
    }
  } finally {
    h.runtime.dispose();
  }
});

test('276 mission settlement XP is idempotent, a replay pays nothing and a failed KPI does not touch it', () => {
  const instant = msAt(DAY);
  const h = harnessAt(instant);
  const scenario = completedMissionSettlement();
  const economy = failingEconomy();
  try {
    const first = h.runtime.observeMissionSettlement(scenario.settlement, instant);
    assert.equal(first?.status, 'CREDITED');
    assert.equal(first?.creditedXp, 100);
    assert.equal(h.runtime.read(instant).player.level, 2);
    const fingerprint = h.runtime.read(instant).xpFingerprint;
    const balance = h.runtime.read(instant).player.xpBalance;

    const duplicate = h.runtime.observeMissionSettlement(scenario.settlement, instant);
    assert.equal(duplicate?.status, 'DUPLICATE');
    assert.equal(duplicate?.creditedXp, 0);

    const replay = h.runtime.observeMissionSettlement(replaySettlement(scenario), instant);
    assert.equal(replay?.status, 'SKIPPED');
    assert.equal(replay?.creditedXp, 0);

    assert.equal(economy.snapshot.days[0]?.completedRides, 0);
    assert.equal(h.runtime.read(instant).xpFingerprint, fingerprint);
    assert.equal(h.runtime.read(instant).player.xpBalance, balance);
    assert.equal(h.runtime.read(instant).player.debits, 0);
    assert.equal(h.runtime.read(instant).player.profileWrites, 0);
  } finally {
    economy.dispose();
    h.runtime.dispose();
  }
});

test('276 reload checkpoint restores the same set, the same XP and no duplicate reward', () => {
  const instant = msAt(DAY);
  const storage = memoryStorage();
  const h = harnessAt(instant, { storage });
  let checkpoint = '';
  try {
    ingestRide(h.runtime, instant, 300);
    const before = h.runtime.read(instant);
    assert.equal(before.player.xpBalance, 2 * DAILY_MISSION_XP);
    checkpoint = JSON.stringify(h.runtime.checkpoint(instant));
    assert.match(checkpoint, new RegExp(LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION));
  } finally {
    h.runtime.dispose();
  }

  const reloadStorage = memoryStorage(checkpoint);
  const reloaded = createLiveDailyProgress({
    playerId: PLAYER,
    timeZone: ZONE,
    sessionId: SESSION,
    worldEpoch: 1,
    kind: 'ACADEMY',
    capabilities: capabilities(),
    catalog: catalog(),
    now: () => instant,
    storage: reloadStorage,
  });
  try {
    const read = reloaded.read(instant);
    assert.equal(read.restore.restored, true);
    assert.equal(read.player.xpBalance, 2 * DAILY_MISSION_XP);
    assert.equal(read.daily.rewards, 2);
    assert.equal(read.daily.instances.filter((entry) => entry.state === 'COMPLETED').length, 2);
    const originalDropoff = rideEvents(300)[2]!;
    assert.equal(reloaded.observeEvent(originalDropoff, instant)?.status, 'DUPLICATE');
    assert.equal(reloaded.read(instant).player.xpBalance, 2 * DAILY_MISSION_XP);
    assert.equal(reloaded.read(instant).daily.counters.duplicates >= 1, true);
  } finally {
    reloaded.dispose();
  }
});

test('276 the published policy keeps zero debits, zero negative credits and zero profile writes', () => {
  assert.equal(LIVE_DAILY_PROGRESS_VERSION, '276-live-daily-progress-v1');
  assert.equal(LIVE_DAILY_PROGRESS_POLICY.missionsPerDay, 3);
  assert.equal(LIVE_DAILY_PROGRESS_POLICY.dailyMissionXp, 100);
  assert.equal(LIVE_DAILY_PROGRESS_POLICY.debits, 0);
  assert.equal(LIVE_DAILY_PROGRESS_POLICY.negativeCredits, false);
  assert.equal(LIVE_DAILY_PROGRESS_POLICY.profileWrites, 0);
  assert.equal(LIVE_DAILY_PROGRESS_POLICY.activeWindowMs, 10_000);
});
