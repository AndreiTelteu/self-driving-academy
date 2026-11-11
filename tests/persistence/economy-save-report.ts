import { PersistenceError } from '../../src/persistence/index';
import type { SessionArchiveTransactionRunner } from '../../src/persistence/index';
import {
  createSessionArchiveEconomyStore,
  readSessionArchive,
  readSessionArchiveWithEconomy,
  upgradeSessionArchive,
} from '../../src/persistence/index';
import { canonicalizeJson } from '../../src/persistence/index';
import { openRepository } from './progress-save-fixture';
import { openTransactionRunner, exportArchive } from './session-archive-fixture';
import {
  ECONOMY_SAVE_CREATED_AT,
  ECONOMY_SAVE_DB_NAME,
  ECONOMY_SAVE_PLAYER_ID,
  ECONOMY_SAVE_SESSION_ID,
  ECONOMY_SAVE_TARGET_DB_NAME,
  createEconomy215Harness,
  exportFixtureArchive,
} from './economy-save-fixture';
import type { Economy215Harness } from './economy-save-fixture';

/**
 * Deterministic transcript of the PBI 215 economy/daily/XP persistence contract.
 *
 * There is no wall clock, no browser and no random source: the moments come from the 211 fixture, the
 * rides from explicit ticks and the campaign from real modules. The same build produces the same
 * `report.json` byte for byte, which is what `npm run save:economy -- --check` verifies.
 */
export const SAVE_ECONOMY_REPORT_VERSION = '215-save-economy-report-v1';

export interface SaveEconomyCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface SaveEconomyReport {
  readonly version: string;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly structure: {
    readonly formatVersion: number;
    readonly schemaVersion: number;
    readonly bundleVersion: string;
    readonly sessionId: string;
    readonly playerId: string;
    readonly worldEpoch: number;
    readonly createdAt: string;
    readonly checksumLength: number;
    readonly bundleBytes: number;
    readonly bundleSizes: {
      readonly daily: number;
      readonly economy: number;
      readonly player: number;
      readonly total: number;
      readonly limit: number;
    };
    readonly archiveSizes: {
      readonly session: number;
      readonly economy: number;
      readonly total: number;
      readonly limit: number;
    };
    readonly row: { readonly bytes: number; readonly budget: number };
    readonly counts: {
      readonly settlements: number;
      readonly reviews: number;
      readonly kpiDays: number;
      readonly kpiMonths: number;
      readonly xpBalance: number;
      readonly xpBalanceMicroXp: number;
      readonly level: number;
      readonly xpEntries: number;
      readonly dailyRewards: number;
    };
    readonly kpi: {
      readonly revenueMinorUnits: number;
      readonly completedRides: number;
      readonly failedRides: number;
      readonly cancelledRides: number;
      readonly reviewCount: number;
      readonly ratingSum: number;
      readonly averageRating: number | null;
      readonly historyScans: number;
    };
  };
  readonly roundTrip: {
    readonly imported: string;
    readonly bundleIdentical: boolean;
    readonly xpBefore: number;
    readonly xpAfter: number;
    readonly xpMicroBefore: number;
    readonly xpMicroAfter: number;
    readonly levelBefore: number;
    readonly levelAfter: number;
    readonly entriesBefore: number;
    readonly entriesAfter: number;
    readonly settlementsAfter: number;
    readonly reviewsAfter: number;
    readonly kpiDaysAfter: number;
    readonly dailyRewardsAfter: number;
    readonly historyScansAfter: number;
  };
  readonly replacements: {
    readonly secondImportStatus: string;
    readonly xpMicroFirst: number;
    readonly xpMicroSecond: number;
    readonly xpDelta: number;
    readonly dailyRewardsFirst: number;
    readonly dailyRewardsSecond: number;
    readonly entriesAfterSecondImport: number;
    readonly rowRevisionAfterSecondImport: number;
  };
  readonly refusals: {
    readonly newerFormat: string;
    readonly modifiedChecksum: string;
    readonly overBudgetComponent: string;
    readonly negativeCredit: string;
    readonly foreignSession: string;
    readonly storageFull: string;
    readonly secondTab: string;
    readonly storageFullRolledBack: boolean;
    readonly secondTabWroteNothing: boolean;
  };
  readonly legacy: {
    readonly readable: boolean;
    readonly status: string;
    readonly economyAfterImport: string;
    readonly bundleIdentical: boolean;
    readonly upgradedComponents: boolean;
  };
  readonly budgets: {
    readonly source: string;
    readonly recordBudget: number;
    readonly totalBudget: number;
    readonly componentBudgets: {
      readonly daily: number;
      readonly economy: number;
      readonly player: number;
    };
    readonly archiveTotalBudget: number;
    readonly measuredShare: number;
  };
  readonly checks: readonly SaveEconomyCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly scenarios: number;
    readonly pass: boolean;
  };
}

function canonical(value: unknown): string {
  const result = canonicalizeJson(value, { maxDepth: 64 });
  if (result.status === 'REJECTED') throw new Error(result.rejection.message);
  return result.text;
}

function check(
  checks: SaveEconomyCheck[],
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
      pass: canonical(expected) === canonical(actual),
      detail,
    }),
  );
}

async function loadBundle(harness: Economy215Harness) {
  const loaded = await harness.economy.load({
    sessionId: ECONOMY_SAVE_SESSION_ID,
    playerId: ECONOMY_SAVE_PLAYER_ID,
  });
  if (loaded.status !== 'FOUND') throw new Error('215 report expects a stored bundle');
  return loaded;
}

export async function runSaveEconomyReport(): Promise<SaveEconomyReport> {
  const checks: SaveEconomyCheck[] = [];
  const source = await createEconomy215Harness();
  try {
    const saved = await source.economy.save({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      worldEpoch: source.components.daily.worldEpoch,
      createdAt: ECONOMY_SAVE_CREATED_AT,
      daily: source.components.daily,
      economy: source.components.economy,
      player: source.components.player,
    });
    if (saved.status === 'REJECTED') {
      throw new Error(`215 report bundle refused: ${saved.rejection.code}`);
    }
    const before = await loadBundle(source);
    const exported = await exportFixtureArchive(source);
    const economyDocument = exported.document.components.economy;
    if (economyDocument === null) throw new Error('215 report expects an economy component');
    const bundle = economyDocument.components.economy;
    if (bundle === null) throw new Error('215 report expects a 209 bundle');
    const day = bundle.kpi.days[0];
    if (day === undefined) throw new Error('215 report expects one KPI day');

    const target = await createEconomy215Harness({
      dbName: ECONOMY_SAVE_TARGET_DB_NAME,
      components: source.components,
    });
    let roundTrip: SaveEconomyReport['roundTrip'];
    let replacements: SaveEconomyReport['replacements'];
    let refusals: SaveEconomyReport['refusals'];
    try {
      const imported = await target.archiveStore.import({
        sessionId: ECONOMY_SAVE_SESSION_ID,
        playerId: ECONOMY_SAVE_PLAYER_ID,
        document: exported.document,
      });
      const after = await loadBundle(target);
      const first = imported.status === 'COMMITTED' ? imported : null;
      const second = await target.archiveStore.import({
        sessionId: ECONOMY_SAVE_SESSION_ID,
        playerId: ECONOMY_SAVE_PLAYER_ID,
        document: exported.document,
      });
      const reloaded = await loadBundle(target);
      roundTrip = Object.freeze({
        imported: imported.status,
        bundleIdentical: canonical(after.document) === canonical(before.document),
        xpBefore: before.counts.xpBalance,
        xpAfter: after.counts.xpBalance,
        xpMicroBefore: before.counts.xpBalanceMicroXp,
        xpMicroAfter: after.counts.xpBalanceMicroXp,
        levelBefore: before.counts.level,
        levelAfter: after.counts.level,
        entriesBefore: before.document.components.player?.entries.length ?? 0,
        entriesAfter: after.document.components.player?.entries.length ?? 0,
        settlementsAfter: after.counts.settlements,
        reviewsAfter: after.counts.reviews,
        kpiDaysAfter: after.counts.kpiDays,
        dailyRewardsAfter: after.counts.dailyRewards,
        historyScansAfter: after.counts.historyScans,
      });
      replacements = Object.freeze({
        secondImportStatus: second.status,
        xpMicroFirst: first === null ? 0 : first.counts.xpBalanceMicroXp,
        xpMicroSecond: second.status === 'COMMITTED' ? second.counts.xpBalanceMicroXp : 0,
        xpDelta:
          first !== null && second.status === 'COMMITTED'
            ? second.counts.xpBalanceMicroXp - first.counts.xpBalanceMicroXp
            : 0,
        dailyRewardsFirst: first === null ? 0 : first.counts.dailyRewards,
        dailyRewardsSecond: second.status === 'COMMITTED' ? second.counts.dailyRewards : 0,
        entriesAfterSecondImport: reloaded.document.components.player?.entries.length ?? 0,
        rowRevisionAfterSecondImport: reloaded.revision,
      });

      const newer = readSessionArchiveWithEconomy(
        { ...exported.document, formatVersion: 3 },
        { sessionId: ECONOMY_SAVE_SESSION_ID, playerId: ECONOMY_SAVE_PLAYER_ID, catalog: null },
      );
      const tampered = JSON.parse(JSON.stringify(exported.document)) as typeof exported.document;
      const totals = tampered.components.economy?.components.economy?.ledger.totals;
      if (totals !== undefined) {
        (totals as unknown as { quotedMinorUnits: number }).quotedMinorUnits += 1;
      }
      const modified = readSessionArchiveWithEconomy(tampered, {
        sessionId: ECONOMY_SAVE_SESSION_ID,
        playerId: ECONOMY_SAVE_PLAYER_ID,
        catalog: target.archive.catalog,
      });
      const overBudget = await source.economy.save({
        sessionId: ECONOMY_SAVE_SESSION_ID,
        playerId: ECONOMY_SAVE_PLAYER_ID,
        worldEpoch: source.components.daily.worldEpoch,
        createdAt: ECONOMY_SAVE_CREATED_AT,
        daily: source.components.daily,
        economy: Object.freeze({
          ...source.components.economy,
          kpi: Object.freeze({
            ...source.components.economy.kpi,
            days: Object.freeze(
              Array.from({ length: 3_000 }, (_, position) =>
                Object.freeze({
                  ...day,
                  periodId: `DAY:${String(position).padStart(6, '0')}`,
                  startTick: position * 72_000,
                  endTick: (position + 1) * 72_000,
                  profileActivationMarkers: [`marker:${position}:${'x'.repeat(80)}`],
                  lastTick: position * 72_000,
                }),
              ),
            ),
            currentDay: null,
            currentMonth: null,
          }),
        }),
        player: source.components.player,
      });
      const negative = JSON.parse(JSON.stringify(source.components.player)) as unknown as {
        entries: { amountMicroXp: number; amountXp: number; balanceAfterMicroXp: number }[];
      };
      const negativeEntry = negative.entries[0];
      if (negativeEntry !== undefined) {
        negativeEntry.amountMicroXp = -1_000_000;
        negativeEntry.amountXp = -1;
        negativeEntry.balanceAfterMicroXp = -1_000_000;
      }
      const negativeSave = await source.economy.save({
        sessionId: ECONOMY_SAVE_SESSION_ID,
        playerId: ECONOMY_SAVE_PLAYER_ID,
        worldEpoch: source.components.daily.worldEpoch,
        createdAt: ECONOMY_SAVE_CREATED_AT,
        daily: source.components.daily,
        economy: source.components.economy,
        player: negative,
      });
      const foreign = await source.economy.save({
        sessionId: 'session:215-foreign',
        playerId: ECONOMY_SAVE_PLAYER_ID,
        worldEpoch: source.components.daily.worldEpoch,
        createdAt: ECONOMY_SAVE_CREATED_AT,
        daily: source.components.daily,
        economy: source.components.economy,
        player: source.components.player,
      });

      // A full storage aborts the transaction: the session and the bundle stay as they were.
      const fingerprintBefore = canonical(await loadBundle(source));
      const failing: SessionArchiveTransactionRunner = {
        transact: (stores, work) =>
          source.archive.transactions.transact(stores, (transaction) =>
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
      const fullStore = createSessionArchiveEconomyStore({
        repository: source.archive.repository,
        transactions: failing,
        catalog: source.archive.catalog,
      });
      const storageFull = await fullStore.import({
        sessionId: ECONOMY_SAVE_SESSION_ID,
        playerId: ECONOMY_SAVE_PLAYER_ID,
        document: exported.document,
      });

      // A second tab holds no writer lock and writes nothing.
      const secondTab = await openRepository(
        source.archive.factory,
        source.archive.locks,
        'tab-b',
        ECONOMY_SAVE_DB_NAME,
      );
      let secondTabCode = 'NOT_APPLIED';
      try {
        const transactions = await openTransactionRunner(
          source.archive.factory,
          ECONOMY_SAVE_DB_NAME,
        );
        const store = createSessionArchiveEconomyStore({
          repository: secondTab,
          transactions,
          catalog: source.archive.catalog,
        });
        const attempted = await store.import({
          sessionId: ECONOMY_SAVE_SESSION_ID,
          playerId: ECONOMY_SAVE_PLAYER_ID,
          document: exported.document,
        });
        secondTabCode =
          attempted.status === 'REJECTED' ? attempted.rejection.code : attempted.status;
      } finally {
        secondTab.close();
      }
      const fingerprintAfter = canonical(await loadBundle(source));

      refusals = Object.freeze({
        newerFormat: newer.status === 'REJECTED' ? newer.rejection.code : newer.status,
        modifiedChecksum:
          modified.status === 'REJECTED' ? modified.rejection.code : modified.status,
        overBudgetComponent:
          overBudget.status === 'REJECTED' ? overBudget.rejection.code : overBudget.status,
        negativeCredit:
          negativeSave.status === 'REJECTED' ? negativeSave.rejection.code : negativeSave.status,
        foreignSession: foreign.status === 'REJECTED' ? foreign.rejection.code : foreign.status,
        storageFull:
          storageFull.status === 'REJECTED' ? storageFull.rejection.code : storageFull.status,
        secondTab: secondTabCode,
        storageFullRolledBack: fingerprintBefore === fingerprintAfter,
        secondTabWroteNothing: fingerprintBefore === fingerprintAfter,
      });
    } finally {
      target.archive.repository.close();
    }

    // A version 1 archive stays readable and never touches the stored bundle.
    const legacyArchive = await exportArchive(source.archive);
    const legacyRead = readSessionArchiveWithEconomy(legacyArchive.document, {
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      catalog: source.archive.catalog,
    });
    const upgraded = upgradeSessionArchive(legacyArchive.document, {
      createdAt: legacyArchive.document.createdAt,
      catalog: source.archive.catalog,
    });
    const legacyImport = await source.archiveStore.import({
      sessionId: ECONOMY_SAVE_SESSION_ID,
      playerId: ECONOMY_SAVE_PLAYER_ID,
      document: legacyArchive.document,
    });
    const afterLegacy = await loadBundle(source);
    const legacy = Object.freeze({
      readable:
        readSessionArchive(legacyArchive.document, {
          sessionId: ECONOMY_SAVE_SESSION_ID,
          playerId: ECONOMY_SAVE_PLAYER_ID,
          catalog: source.archive.catalog,
        }).status === 'ACCEPTED',
      status: legacyRead.status,
      economyAfterImport:
        legacyImport.status === 'COMMITTED'
          ? legacyImport.replacement.economy
          : legacyImport.status,
      bundleIdentical: canonical(afterLegacy.document) === canonical(before.document),
      upgradedComponents:
        upgraded.status === 'ACCEPTED'
          ? canonical(upgraded.document.components.session) === canonical(legacyArchive.document)
          : false,
    });

    const structure = Object.freeze({
      formatVersion: exported.document.formatVersion,
      schemaVersion: exported.document.schemaVersion,
      bundleVersion: '215-economy-save-v1',
      sessionId: exported.document.session.sessionId,
      playerId: exported.document.session.playerId,
      worldEpoch: exported.document.session.worldEpoch,
      createdAt: exported.document.createdAt,
      checksumLength: exported.document.checksum.value.length,
      bundleBytes: canonical(economyDocument).length,
      bundleSizes: Object.freeze({
        daily: economyDocument.sizes.daily,
        economy: economyDocument.sizes.economy,
        player: economyDocument.sizes.player,
        total: economyDocument.sizes.total,
        limit: economyDocument.sizes.limit,
      }),
      archiveSizes: Object.freeze({
        session: exported.sizes.session,
        economy: exported.sizes.economy,
        total: exported.sizes.total,
        limit: exported.sizes.limit,
      }),
      row: Object.freeze({
        bytes: saved.bytes,
        budget: 1_048_576,
      }),
      counts: Object.freeze({
        settlements: before.counts.settlements,
        reviews: before.counts.reviews,
        kpiDays: before.counts.kpiDays,
        kpiMonths: before.counts.kpiMonths,
        xpBalance: before.counts.xpBalance,
        xpBalanceMicroXp: before.counts.xpBalanceMicroXp,
        level: before.counts.level,
        xpEntries: before.counts.xpEntries,
        dailyRewards: before.counts.dailyRewards,
      }),
      kpi: Object.freeze({
        revenueMinorUnits: day.revenueMinorUnits,
        completedRides: day.completedRides,
        failedRides: day.failedRides,
        cancelledRides: day.cancelledRides,
        reviewCount: day.reviewCount,
        ratingSum: day.ratingSum,
        averageRating: day.averageRating,
        historyScans: bundle.kpi.historyScans,
      }),
    });

    const budgets = Object.freeze({
      source: 'PERSISTENCE_LIMITS.maxRecordBytes / maxBodyBytes (127)',
      recordBudget: 1_048_576,
      totalBudget: economyDocument.sizes.limit,
      componentBudgets: Object.freeze({
        daily: 262_144,
        economy: 524_288,
        player: 262_144,
      }),
      archiveTotalBudget: exported.sizes.limit,
      measuredShare: Math.round((saved.bytes / 1_048_576) * 10_000) / 10_000,
    });

    check(checks, 'bundle-row-within-record-budget', true, saved.bytes <= 1_048_576, 'bytes');
    check(checks, 'bundle-daily-bytes', 4_919, structure.bundleSizes.daily, 'bytes');
    check(checks, 'bundle-economy-bytes', 7_341, structure.bundleSizes.economy, 'bytes');
    check(checks, 'bundle-player-bytes', 1_745, structure.bundleSizes.player, 'bytes');
    check(checks, 'archive-version', 2, structure.formatVersion, 'format version');
    check(checks, 'xp-identical', roundTrip.xpBefore, roundTrip.xpAfter, 'sold XP');
    check(
      checks,
      'xp-micro-identical',
      roundTrip.xpMicroBefore,
      roundTrip.xpMicroAfter,
      'micro XP',
    );
    check(checks, 'level-identical', roundTrip.levelBefore, roundTrip.levelAfter, 'nivel');
    check(checks, 'entries-identical', roundTrip.entriesBefore, roundTrip.entriesAfter, 'intrari');
    check(checks, 'settlements', 3, roundTrip.settlementsAfter, 'settle-uri');
    check(checks, 'reviews', 1, roundTrip.reviewsAfter, 'review-uri');
    check(checks, 'kpi-days', 1, roundTrip.kpiDaysAfter, 'zile KPI');
    check(checks, 'daily-rewards', 1, roundTrip.dailyRewardsAfter, 'recompense daily');
    check(checks, 'history-scans', 0, roundTrip.historyScansAfter, 'historyScans');
    check(checks, 'bundle-identical', true, roundTrip.bundleIdentical, 'bytes canonici');
    check(checks, 'xp-not-doubled', 0, replacements.xpDelta, 'delta micro XP');
    check(checks, 'daily-rewards-not-doubled', 1, replacements.dailyRewardsSecond, 'recompense');
    check(checks, 'row-revision', 2, replacements.rowRevisionAfterSecondImport, 'revizie');
    check(checks, 'refusal-newer-format', 'FORMAT_VERSION_TOO_NEW', refusals.newerFormat, 'cod');
    check(checks, 'refusal-checksum', 'CHECKSUM_MISMATCH', refusals.modifiedChecksum, 'cod');
    check(
      checks,
      'refusal-component-budget',
      'COMPONENT_TOO_LARGE',
      refusals.overBudgetComponent,
      'cod',
    );
    check(checks, 'refusal-negative-xp', 'PLAYER_INVALID', refusals.negativeCredit, 'cod');
    check(checks, 'refusal-foreign-session', 'SESSION_MISMATCH', refusals.foreignSession, 'cod');
    check(checks, 'refusal-storage-full', 'STORAGE_FULL', refusals.storageFull, 'cod');
    check(checks, 'refusal-second-tab', 'WRITER_REQUIRED', refusals.secondTab, 'cod');
    check(checks, 'storage-full-rollback', true, refusals.storageFullRolledBack, 'amprenta');
    check(checks, 'second-tab-untouched', true, refusals.secondTabWroteNothing, 'amprenta');
    check(checks, 'legacy-readable', true, legacy.readable, '135 reader');
    check(checks, 'legacy-status', 'LEGACY', legacy.status, 'stare');
    check(checks, 'legacy-economy-unchanged', 'UNCHANGED', legacy.economyAfterImport, 'slot');
    check(checks, 'legacy-bundle-identical', true, legacy.bundleIdentical, 'bytes canonici');
    check(checks, 'upgrade-additive', true, legacy.upgradedComponents, 'componente 135');

    const passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: SAVE_ECONOMY_REPORT_VERSION,
      generatedBy: 'npm run save:economy',
      oracleRule:
        'Fiecare componenta este citita de parserul proprietarului (212 restore, 213 parse, 209 structural); valorile de business nu sunt recalculate.',
      structure,
      roundTrip,
      replacements,
      refusals,
      legacy,
      budgets,
      checks: Object.freeze(checks),
      summary: Object.freeze({
        checks: checks.length,
        passed,
        scenarios: 8,
        pass: passed === checks.length,
      }),
    });
  } finally {
    source.archive.repository.close();
  }
}

function cells(rows: readonly (readonly [string, unknown])[]): string {
  return [
    '| Câmp | Valoare |',
    '| --- | --- |',
    ...rows.map(([name, value]) => `| \`${name}\` | ${String(value)} |`),
  ].join('\n');
}

export function saveEconomyReportMarkdown(report: SaveEconomyReport): string {
  const structure = cells([
    ['formatVersion', report.structure.formatVersion],
    ['schemaVersion', report.structure.schemaVersion],
    ['sessionId', report.structure.sessionId],
    ['playerId', report.structure.playerId],
    ['worldEpoch', report.structure.worldEpoch],
    ['createdAt', report.structure.createdAt],
    ['checksum', `${report.structure.checksumLength} caractere`],
    ['bundleBytes', report.structure.bundleBytes],
    ['rowBytes', report.structure.row.bytes],
    ['bundle.daily', report.structure.bundleSizes.daily],
    ['bundle.economy', report.structure.bundleSizes.economy],
    ['bundle.player', report.structure.bundleSizes.player],
    ['bundle.total', report.structure.bundleSizes.total],
    ['archive.session', report.structure.archiveSizes.session],
    ['archive.economy', report.structure.archiveSizes.economy],
    ['archive.total', report.structure.archiveSizes.total],
  ]);
  const roundTrip = cells([
    ['import', report.roundTrip.imported],
    ['xp inainte', report.roundTrip.xpBefore],
    ['xp dupa', report.roundTrip.xpAfter],
    ['micro XP inainte', report.roundTrip.xpMicroBefore],
    ['micro XP dupa', report.roundTrip.xpMicroAfter],
    ['nivel inainte', report.roundTrip.levelBefore],
    ['nivel dupa', report.roundTrip.levelAfter],
    ['intrari XP', report.roundTrip.entriesAfter],
    ['settle-uri', report.roundTrip.settlementsAfter],
    ['review-uri', report.roundTrip.reviewsAfter],
    ['zile KPI', report.roundTrip.kpiDaysAfter],
    ['recompense daily', report.roundTrip.dailyRewardsAfter],
    ['historyScans', report.roundTrip.historyScansAfter],
    ['bundle identic', report.roundTrip.bundleIdentical],
  ]);
  const replacements = cells([
    ['al doilea import', report.replacements.secondImportStatus],
    ['micro XP primul', report.replacements.xpMicroFirst],
    ['micro XP al doilea', report.replacements.xpMicroSecond],
    ['delta XP', report.replacements.xpDelta],
    ['recompense daily', report.replacements.dailyRewardsSecond],
    ['revizie rând', report.replacements.rowRevisionAfterSecondImport],
  ]);
  const refusals = cells([
    ['format nou', report.refusals.newerFormat],
    ['checksum modificat', report.refusals.modifiedChecksum],
    ['componenta peste buget', report.refusals.overBudgetComponent],
    ['credit XP negativ', report.refusals.negativeCredit],
    ['sesiune straină', report.refusals.foreignSession],
    ['quota plină', report.refusals.storageFull],
    ['al doilea tab', report.refusals.secondTab],
    ['rollback pe quota', report.refusals.storageFullRolledBack],
  ]);
  const legacy = cells([
    ['arhiva v1 citibila', report.legacy.readable],
    ['stare', report.legacy.status],
    ['slot economic dupa import', report.legacy.economyAfterImport],
    ['bundle identic', report.legacy.bundleIdentical],
    ['migrare aditiva', report.legacy.upgradedComponents],
  ]);
  const budgets = cells([
    ['sursa', report.budgets.source],
    ['buget rând', report.budgets.recordBudget],
    ['buget total bundle', report.budgets.totalBudget],
    ['buget daily', report.budgets.componentBudgets.daily],
    ['buget economy', report.budgets.componentBudgets.economy],
    ['buget player', report.budgets.componentBudgets.player],
    ['buget arhiva v2', report.budgets.archiveTotalBudget],
    ['pondere masurata', report.budgets.measuredShare],
  ]);
  const checks = cells(
    report.checks.map((entry) => [entry.name, entry.pass ? 'PASS' : 'FAIL'] as const),
  );
  return [
    '# Raport 215 - persistența pentru KPI, daily și XP',
    '',
    `Versiune raport: \`${report.version}\`. Generat de \`${report.generatedBy}\`.`,
    '',
    report.oracleRule,
    '',
    '## Structura',
    '',
    structure,
    '',
    '## Round-trip',
    '',
    roundTrip,
    '',
    '## Înlocuire, nu adunare',
    '',
    replacements,
    '',
    '## Refuzuri',
    '',
    refusals,
    '',
    '## Arhivă veche și migrare aditivă',
    '',
    legacy,
    '',
    '## Bugete',
    '',
    budgets,
    '',
    '## Verificări',
    '',
    checks,
    '',
    '## Sumar',
    '',
    `Verificări: ${report.summary.passed}/${report.summary.checks}; scenarii: ${report.summary.scenarios}; overall: ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
    '',
  ].join('\n');
}

/** Kept for callers that need the fixture components the report used. */
