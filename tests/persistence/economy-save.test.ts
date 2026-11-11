import assert from 'node:assert/strict';
import test from 'node:test';
import { PersistenceError } from '../../src/persistence/index';
import type {
  EconomySaveDocument,
  SessionArchiveTransactionRunner,
} from '../../src/persistence/index';
import {
  canonicalizeJson,
  createSessionArchiveEconomyStore,
  readSessionArchive,
  readSessionArchiveWithEconomy,
  upgradeSessionArchive,
} from '../../src/persistence/index';
import {
  advanceDailyCalendar,
  recordDailyReward,
  restoreDailyProgress,
} from '../../src/missions/index';
import { calendarInput, fullCapabilities } from '../missions/mission-daily-fixture';
import { openRepository } from './progress-save-fixture';
import { openTransactionRunner } from './session-archive-fixture';
import {
  ECONOMY_SAVE_DAILY_DATE,
  ECONOMY_SAVE_DB_NAME,
  ECONOMY_SAVE_PLAYER_ID,
  ECONOMY_SAVE_SESSION_ID,
  ECONOMY_SAVE_TARGET_DB_NAME,
  createEconomy215Harness,
  createEconomyComponents,
  exportFixtureArchive,
  saveFixtureEconomy,
} from './economy-save-fixture';
import type { Economy215Harness } from './economy-save-fixture';
import {
  ARCHIVE_PLAYER_ID,
  ARCHIVE_SESSION_ID,
  exportArchive,
  sessionFingerprint,
} from './session-archive-fixture';

/**
 * PBI 215: the economy, daily and XP bundle of a session survives export, import and a reload.
 *
 * Every scenario compares real numbers produced by 209/211/212/213 with the numbers read back from
 * the database, so "identical" is a comparison and never a "does not throw".
 */

function canonical(value: unknown): string {
  const result = canonicalizeJson(value, { maxDepth: 64 });
  if (result.status === 'REJECTED') throw new Error(result.rejection.message);
  return result.text;
}

async function loadedDocument(harness: Economy215Harness): Promise<EconomySaveDocument> {
  const loaded = await harness.economy.load({
    sessionId: ECONOMY_SAVE_SESSION_ID,
    playerId: ECONOMY_SAVE_PLAYER_ID,
  });
  assert.equal(loaded.status, 'FOUND');
  if (loaded.status !== 'FOUND') throw new Error('unreachable');
  return loaded.document;
}

test('215 export and import keep XP, level, KPI buckets, reviews and the daily calendar identical', async () => {
  const source = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(source);
    const before = await loadedDocument(source);
    const exported = await exportFixtureArchive(source);
    assert.equal(exported.document.formatVersion, 2);
    assert.equal(exported.document.schemaVersion, 2);

    const target = await createEconomy215Harness({
      dbName: ECONOMY_SAVE_TARGET_DB_NAME,
      components: source.components,
    });
    try {
      const imported = await target.archiveStore.import({
        sessionId: ECONOMY_SAVE_SESSION_ID,
        playerId: ECONOMY_SAVE_PLAYER_ID,
        document: JSON.parse(JSON.stringify(exported.document)),
      });
      assert.equal(imported.status, 'COMMITTED');
      if (imported.status !== 'COMMITTED') return;
      assert.equal(imported.replacement.economy, 'WRITTEN');
      assert.equal(imported.legacy, false);

      const after = await loadedDocument(target);
      assert.equal(canonical(after), canonical(before));
      assert.equal(canonical(after), canonical(exported.document.components.economy));
      assert.equal(after.components.player?.entries.length, 2);
      assert.equal(imported.counts.xpBalanceMicroXp, 100_500_000);
      assert.equal(imported.counts.xpBalance, 100.5);
      assert.equal(imported.counts.level, 2);
      assert.equal(imported.counts.settlements, 3);
      assert.equal(imported.counts.reviews, 1);
      assert.equal(imported.counts.dailyRewards, 1);
      assert.equal(imported.counts.kpiDays, 1);
    } finally {
      target.archive.repository.close();
    }
  } finally {
    source.archive.repository.close();
  }
});

test('215 a stored bundle reports identical bucket arithmetic before and after the round trip', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const exported = await exportFixtureArchive(harness);
    const economy = exported.document.components.economy;
    assert.ok(economy !== null);
    if (economy === null) return;
    const bundle = economy.components.economy;
    assert.ok(bundle !== null);
    if (bundle === null) return;
    const day = bundle.kpi.days[0];
    assert.ok(day !== undefined);
    if (day === undefined) return;
    assert.equal(bundle.ledger.historyScans, 0);
    assert.equal(bundle.reviews.historyScans, 0);
    assert.equal(bundle.kpi.historyScans, 0);
    assert.equal(day.terminalRides, 3);
    assert.equal(day.revenueMinorUnits, day.chargedMinorUnits - day.refundedMinorUnits);
    assert.equal(day.averageRating, Math.round((day.ratingSum / day.reviewCount) * 1e6) / 1e6);

    const reimported = await harness.archiveStore.import({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      document: exported.document,
    });
    assert.equal(reimported.status, 'COMMITTED');
    const reloaded = await loadedDocument(harness);
    assert.equal(canonical(reloaded), canonical(economy));
    const reloadedDay = reloaded.components.economy?.kpi.days[0];
    assert.equal(reloadedDay?.revenueMinorUnits, day.revenueMinorUnits);
    assert.equal(reloadedDay?.ratingSum, day.ratingSum);
    assert.equal(reloadedDay?.reviewCount, day.reviewCount);
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a version 1 archive is readable, reported LEGACY and never touches the economy row', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const stored = await loadedDocument(harness);
    const legacy = await exportArchive(harness.archive);

    const read = readSessionArchiveWithEconomy(legacy.document, {
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      catalog: harness.archive.catalog,
    });
    assert.equal(read.status, 'LEGACY');
    if (read.status !== 'LEGACY') return;
    assert.equal(read.counts.xpBalance, 0);
    assert.equal(read.counts.settlements, 0);

    const imported = await harness.archiveStore.import({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      document: legacy.document,
    });
    assert.equal(imported.status, 'COMMITTED');
    if (imported.status !== 'COMMITTED') return;
    assert.equal(imported.legacy, true);
    assert.equal(imported.replacement.economy, 'UNCHANGED');
    assert.equal(canonical(await loadedDocument(harness)), canonical(stored));
  } finally {
    harness.archive.repository.close();
  }
});

test('215 upgrading a version 1 archive is additive: every 135 component stays byte identical', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const legacy = await exportArchive(harness.archive);
    const upgraded = upgradeSessionArchive(legacy.document, {
      createdAt: legacy.document.createdAt,
      catalog: harness.archive.catalog,
    });
    assert.equal(upgraded.status, 'ACCEPTED');
    if (upgraded.status !== 'ACCEPTED') return;
    assert.equal(upgraded.document.components.economy, null);
    assert.equal(canonical(upgraded.document.components.session), canonical(legacy.document));
    const read = readSessionArchiveWithEconomy(upgraded.document, {
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      catalog: harness.archive.catalog,
    });
    assert.equal(read.status, 'ACCEPTED');
    if (read.status !== 'ACCEPTED') return;
    assert.equal(read.economy, null);
    assert.equal(read.counts.settlements, 0);
    assert.equal(
      readSessionArchive(legacy.document, {
        sessionId: ARCHIVE_SESSION_ID,
        playerId: ARCHIVE_PLAYER_ID,
        catalog: harness.archive.catalog,
      }).status,
      'ACCEPTED',
    );
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a newer format and a modified checksum are closed refusals', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const exported = await exportFixtureArchive(harness);
    const newer = readSessionArchiveWithEconomy(
      { ...exported.document, formatVersion: 3 },
      { sessionId: ECONOMY_SAVE_SESSION_ID, playerId: ECONOMY_SAVE_PLAYER_ID, catalog: null },
    );
    assert.equal(newer.status, 'REJECTED');
    if (newer.status === 'REJECTED') assert.equal(newer.rejection.code, 'FORMAT_VERSION_TOO_NEW');

    const economy = exported.document.components.economy;
    assert.ok(economy !== null);
    if (economy === null) return;
    const player = economy.components.player;
    assert.ok(player !== null);
    if (player === null) return;
    const tampered = JSON.parse(JSON.stringify(exported.document)) as typeof exported.document;
    const target = tampered.components.economy?.components.economy?.ledger.totals;
    assert.ok(target !== null && target !== undefined);
    if (target === null || target === undefined) return;
    // A field that passes every structural invariant: only the envelope checksum can catch it.
    (target as unknown as { quotedMinorUnits: number }).quotedMinorUnits += 1;
    const modified = readSessionArchiveWithEconomy(tampered, {
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      catalog: harness.archive.catalog,
    });
    assert.equal(modified.status, 'REJECTED');
    if (modified.status === 'REJECTED') assert.equal(modified.rejection.code, 'CHECKSUM_MISMATCH');
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a component above its budget is refused explicitly, never truncated', async () => {
  const harness = await createEconomy215Harness();
  try {
    const components = createEconomyComponents();
    const template = components.economy.kpi.days[0];
    assert.ok(template !== undefined);
    if (template === undefined) return;
    // A synthetic KPI history above the 512 KiB component budget: many well-formed day buckets.
    const days = Array.from({ length: 3_000 }, (_, position) =>
      Object.freeze({
        ...template,
        periodId: `DAY:${String(position).padStart(6, '0')}`,
        startTick: position * 72_000,
        endTick: (position + 1) * 72_000,
        profileActivationMarkers: [`marker:${position}:${'x'.repeat(80)}`],
        lastTick: position * 72_000,
      }),
    );
    const saved = await harness.economy.save({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      worldEpoch: components.daily.worldEpoch,
      createdAt: '2026-11-11T00:00:00.000Z',
      daily: components.daily,
      economy: Object.freeze({
        ...components.economy,
        kpi: Object.freeze({
          ...components.economy.kpi,
          days: Object.freeze(days),
          currentDay: null,
          currentMonth: null,
        }),
      }),
      player: components.player,
    });
    assert.equal(saved.status, 'REJECTED');
    if (saved.status === 'REJECTED') assert.equal(saved.rejection.code, 'COMPONENT_TOO_LARGE');
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a second import of the same archive does not duplicate XP or a daily reward', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const exported = await exportFixtureArchive(harness);
    const first = await harness.archiveStore.import({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      document: exported.document,
    });
    assert.equal(first.status, 'COMMITTED');
    const afterFirst = await loadedDocument(harness);
    const second = await harness.archiveStore.import({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      document: exported.document,
    });
    assert.equal(second.status, 'COMMITTED');
    if (second.status !== 'COMMITTED') return;
    const afterSecond = await loadedDocument(harness);
    assert.equal(canonical(afterSecond), canonical(afterFirst));
    assert.equal(afterSecond.components.player?.entries.length, 2);
    assert.equal(afterSecond.components.daily?.calendar.rewards.length, 1);
    const rewards = afterSecond.components.daily?.calendar.rewards ?? [];
    assert.deepEqual(
      rewards.map((reward) => reward.rewardId),
      harness.components.daily.calendar.rewards.map((reward) => reward.rewardId),
    );
    assert.equal(second.counts.xpBalanceMicroXp, first.counts.xpBalanceMicroXp);
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a clock rollback after the reload keeps the set and never re-awards', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const exported = await exportFixtureArchive(harness);
    const imported = await harness.archiveStore.import({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      document: exported.document,
    });
    assert.equal(imported.status, 'COMMITTED');
    const stored = await loadedDocument(harness);
    const daily = stored.components.daily;
    assert.ok(daily !== null);
    if (daily === null) return;
    const restored = restoreDailyProgress(daily, {
      sessionId: ECONOMY_SAVE_SESSION_ID,
      worldEpoch: daily.worldEpoch,
    });
    const before = restored.progress.set().instances.map((instance) => instance.instanceId);
    // A clock rollback is decided by 211: nothing is regenerated, nothing is lowered, nothing pays.
    const rolledBack = advanceDailyCalendar({
      state: restored.progress.calendarState(),
      playerId: ECONOMY_SAVE_PLAYER_ID,
      calendar: calendarInput('2026-11-10'),
      capabilities: fullCapabilities(),
      generatedAtMs: calendarInput('2026-11-10').observedAtMs,
    });
    assert.equal(rolledBack.action, 'ROLLBACK');
    assert.equal(rolledBack.regenerated, false);
    assert.equal(rolledBack.state.highestObservedDate, ECONOMY_SAVE_DAILY_DATE);
    assert.equal(rolledBack.state.rewards.length, 1);
    assert.equal(rolledBack.set, null);
    assert.deepEqual(
      restored.progress.set().instances.map((instance) => instance.instanceId),
      before,
    );
    // Reloading the same reward identity is a duplicate: it never adds a second credit.
    const firstInstance = before[0];
    assert.ok(firstInstance !== undefined);
    if (firstInstance === undefined) return;
    const duplicate = recordDailyReward({
      state: restored.progress.calendarState(),
      instanceId: firstInstance,
      grantedAtMs: calendarInput(ECONOMY_SAVE_DAILY_DATE).observedAtMs,
    });
    assert.equal(duplicate.granted, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.state.rewards.length, 1);
    // The day after the stored one is a new generation, not a rollback.
    const next = restored.progress.advance({
      calendar: calendarInput('2026-11-12'),
      capabilities: fullCapabilities(),
      generatedAtMs: calendarInput('2026-11-12').observedAtMs,
    });
    assert.equal(next.action, 'NEW_DAY');
    assert.equal(restored.progress.calendarState().rewards.length, 1);
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a refused import leaves the session and the economy row byte for byte unchanged', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const exported = await exportFixtureArchive(harness);
    const before = canonical(await loadedDocument(harness));
    const fingerprint = await sessionFingerprint(harness.archive.repository);
    const imported = await harness.archiveStore.import({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      document: exported.document,
      hooks: {
        beforeCommit: () => {
          throw new PersistenceError('TRANSACTION_ABORTED', 'injected failure before commit');
        },
      },
    });
    assert.equal(imported.status, 'REJECTED');
    assert.equal(canonical(await loadedDocument(harness)), before);
    assert.equal(await sessionFingerprint(harness.archive.repository), fingerprint);
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a full storage rolls the whole replacement back, including the session rows', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const exported = await exportFixtureArchive(harness);
    const before = canonical(await loadedDocument(harness));
    const fingerprint = await sessionFingerprint(harness.archive.repository);
    const failing: SessionArchiveTransactionRunner = {
      transact: (stores, work) =>
        harness.archive.transactions.transact(stores, (transaction) =>
          work({
            get: (store, key) => transaction.get(store, key),
            getAll: (store) => transaction.getAll(store),
            getAllByIndex: (store, index, key) => transaction.getAllByIndex(store, index, key),
            put: (store, value) => {
              if (store === 'meta') {
                throw new PersistenceError('STORAGE_FULL', 'The origin quota is exhausted');
              }
              return transaction.put(store, value);
            },
            delete: (store, key) => transaction.delete(store, key),
          }),
        ),
    };
    const store = createSessionArchiveEconomyStore({
      repository: harness.archive.repository,
      transactions: failing,
      catalog: harness.archive.catalog,
    });
    const imported = await store.import({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      document: exported.document,
    });
    assert.equal(imported.status, 'REJECTED');
    if (imported.status === 'REJECTED') {
      assert.equal(imported.rejection.code, 'STORAGE_FULL');
    }
    assert.equal(canonical(await loadedDocument(harness)), before);
    assert.equal(await sessionFingerprint(harness.archive.repository), fingerprint);
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a second tab is refused with WRITER_REQUIRED and writes nothing', async () => {
  const harness = await createEconomy215Harness();
  try {
    await saveFixtureEconomy(harness);
    const exported = await exportFixtureArchive(harness);
    const second = await openRepository(
      harness.archive.factory,
      harness.archive.locks,
      'tab-b',
      ECONOMY_SAVE_DB_NAME,
    );
    try {
      assert.equal(second.status().role, 'READ_ONLY');
      const transactions = await openTransactionRunner(
        harness.archive.factory,
        ECONOMY_SAVE_DB_NAME,
      );
      const store = createSessionArchiveEconomyStore({
        repository: second,
        transactions,
        catalog: harness.archive.catalog,
      });
      const imported = await store.import({
        sessionId: ECONOMY_SAVE_SESSION_ID,
        playerId: ECONOMY_SAVE_PLAYER_ID,
        document: exported.document,
      });
      assert.equal(imported.status, 'REJECTED');
      if (imported.status === 'REJECTED') assert.equal(imported.rejection.code, 'WRITER_REQUIRED');
    } finally {
      second.close();
    }
  } finally {
    harness.archive.repository.close();
  }
});

test('215 a negative XP credit and a mismatched session are refused by the bundle', async () => {
  const harness = await createEconomy215Harness();
  try {
    const components = createEconomyComponents();
    const negative = JSON.parse(JSON.stringify(components.player)) as unknown as {
      entries: { amountMicroXp: number; amountXp: number; balanceAfterMicroXp: number }[];
    };
    const first = negative.entries[0];
    assert.ok(first !== undefined);
    if (first === undefined) return;
    first.amountMicroXp = -1_000_000;
    first.amountXp = -1;
    first.balanceAfterMicroXp = -1_000_000;

    const built = await harness.economy.save({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      worldEpoch: components.daily.worldEpoch,
      createdAt: '2026-11-11T00:00:00.000Z',
      daily: components.daily,
      economy: components.economy,
      player: negative,
    });
    assert.equal(built.status, 'REJECTED');
    if (built.status === 'REJECTED') assert.equal(built.rejection.code, 'PLAYER_INVALID');

    const wrongSession = await harness.economy.save({
      sessionId: 'session:215-other',
      playerId: ECONOMY_SAVE_PLAYER_ID,
      worldEpoch: components.daily.worldEpoch,
      createdAt: '2026-11-11T00:00:00.000Z',
      daily: components.daily,
      economy: components.economy,
      player: components.player,
    });
    assert.equal(wrongSession.status, 'REJECTED');
    if (wrongSession.status === 'REJECTED')
      assert.equal(wrongSession.rejection.code, 'SESSION_MISMATCH');
  } finally {
    harness.archive.repository.close();
  }
});
