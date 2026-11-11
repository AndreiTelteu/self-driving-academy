import {
  PERSISTENCE_LIMITS,
  PersistenceError,
  SESSION_ARCHIVE_LIMITS,
  createSessionArchiveStore,
  decodePlayerSave,
  parsePersistedRecord,
  readSessionArchive,
  stampSessionArchiveChecksum,
} from '../../src/persistence/index';
import type {
  LoadedPlayerSave,
  SessionArchiveComponents,
  SessionArchiveDocument,
} from '../../src/persistence/index';
import { activation, derivedProfile, profileVersion, scenarioRecord } from './fixtures';
import { openRepository } from './progress-save-fixture';
import {
  ARCHIVE_ACTIVATION_SEQUENCE,
  ARCHIVE_CHECKPOINT_ID,
  ARCHIVE_DB_NAME,
  ARCHIVE_PLAYER_ID,
  ARCHIVE_SESSION_ID,
  ARCHIVE_VERSIONS,
  ARCHIVE_WORLD_EPOCH,
  createArchiveHarness,
  exportArchive,
  openTransactionRunner,
  restamp,
  sessionFingerprint,
} from './session-archive-fixture';
import type { ArchiveHarness } from './session-archive-fixture';

/**
 * Deterministic transcript of the PBI 135 session archive contract.
 *
 * There is no wall clock, no browser and no random source: every timestamp is injected by the
 * fixture, the world is the deterministic 206 fixture and the campaign is completed by the real
 * 116/125 modules. The same build therefore produces the same `report.json` byte for byte, which is
 * what `npm run save:session-archive -- --check` verifies.
 */
export const SESSION_ARCHIVE_REPORT_VERSION = '135-session-archive-report-v1';

export interface ArchiveReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ArchiveReportSizes {
  readonly checkpoint: number;
  readonly progress: number;
  readonly campaign: number;
  readonly settings: number;
  readonly profile: number;
  readonly scenarios: number;
  readonly total: number;
  readonly limit: number;
}

export interface ArchiveReportRow {
  readonly recordId: string;
  readonly revision: number;
  readonly bodyBytes: number;
}

export interface SessionArchiveReport {
  readonly version: string;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly structure: {
    readonly format: string;
    readonly sessionId: string;
    readonly playerId: string;
    readonly worldEpoch: number;
    readonly checkpointId: string;
    readonly checkpointTick: number;
    readonly engineVersion: string;
    readonly profileId: string;
    readonly activeVersionId: string;
    readonly activationSequence: number;
    readonly sizes: ArchiveReportSizes;
    readonly checksumLength: number;
    readonly canonicalBytes: number;
    readonly counts: {
      readonly trackerInstances: number;
      readonly trackerRewards: number;
      readonly campaignEvents: number;
      readonly campaignCompleted: number;
      readonly xp: number;
      readonly rewardsGranted: number;
      readonly scenarios: number;
    };
    readonly digests: {
      readonly tracker: string | null;
      readonly campaign: string | null;
    };
    readonly rows: readonly ArchiveReportRow[];
  };
  readonly roundTrip: {
    readonly checksumVerified: boolean;
    readonly canonicalBytesSame: boolean;
    readonly trackerDigestSame: boolean;
    readonly campaignDigestSame: boolean;
    readonly settingsSame: boolean;
    readonly xpBefore: number;
    readonly xpAfter: number;
    readonly completedAfter: number;
    readonly instancesAfter: number;
    readonly scenariosAfter: number;
    readonly checkpointTickAfter: number;
    readonly checkpointSame: boolean;
    readonly afterDigests: {
      readonly tracker: string | null;
      readonly campaign: string | null;
    };
    readonly revisionsBefore: readonly number[];
    readonly revisionsAfter: readonly number[];
    readonly replaced: {
      readonly progress: number;
      readonly scenarios: number;
      readonly checkpoints: number;
      readonly settings: boolean;
    };
  };
  readonly rewards: {
    readonly targetXpBefore: number;
    readonly targetCompletedBefore: number;
    readonly archiveXp: number;
    readonly archiveGranted: number;
    readonly afterXp: number;
    readonly afterGranted: number;
    readonly afterCompleted: number;
    readonly notAdded: boolean;
    readonly duplicateStatus: string;
    readonly duplicateXp: number;
    readonly secondImportXp: number;
    readonly secondImportGranted: number;
  };
  readonly refusals: {
    readonly checksum: string;
    readonly checksumLeftSessionUntouched: boolean;
    readonly campaignDigest: string;
    readonly campaignDigestLeftSessionUntouched: boolean;
    readonly mixedSession: string;
    readonly archiveGeneration: string;
    readonly storedGeneration: string;
    readonly missingVersion: string;
    readonly componentBudget: string;
    readonly declaredTotal: string;
    readonly declaredSize: string;
    readonly duplicateKey: string;
    readonly newerFormat: string;
    readonly wrongSession: string;
    readonly secondTab: string;
    readonly rollback: string;
    readonly rollbackLeftSessionUntouched: boolean;
    readonly emptyArchive: string;
  };
  readonly checks: readonly ArchiveReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly scenarios: number;
    readonly pass: boolean;
  };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readSave(harness: ArchiveHarness): Promise<LoadedPlayerSave> {
  const rows = await harness.repository.readPlayerSave(ARCHIVE_SESSION_ID, ARCHIVE_PLAYER_ID);
  return decodePlayerSave({
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    rows,
  });
}

function revisions(rows: { readonly progress: readonly unknown[] }): readonly number[] {
  return rows.progress.map((row) => parsePersistedRecord(row, 'PROGRESS').revision);
}

async function rowsOf(harness: ArchiveHarness): Promise<readonly ArchiveReportRow[]> {
  const rows = await harness.repository.readPlayerSave(ARCHIVE_SESSION_ID, ARCHIVE_PLAYER_ID);
  return rows.progress.map((row) => {
    const record = parsePersistedRecord(row, 'PROGRESS');
    return {
      recordId: record.recordId,
      revision: record.revision,
      bodyBytes: record.bodyBytes,
    };
  });
}

async function checksumRefusal(
  harness: ArchiveHarness,
  document: SessionArchiveDocument,
): Promise<{ readonly code: string; readonly untouched: boolean }> {
  const before = await sessionFingerprint(harness.repository);
  const tampered = {
    ...document,
    components: {
      ...document.components,
      campaign: {
        ...document.components.campaign,
        body: { ...(document.components.campaign?.body ?? {}), digest: 'f'.repeat(64) },
      },
    },
  };
  const imported = await harness.archive.import({
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    document: tampered,
  });
  const after = await sessionFingerprint(harness.repository);
  return {
    code: imported.status === 'REJECTED' ? imported.rejection.code : 'ACCEPTED',
    untouched: before === after,
  };
}

async function campaignRefusal(
  harness: ArchiveHarness,
  document: SessionArchiveDocument,
): Promise<{ readonly code: string; readonly untouched: boolean }> {
  const before = await sessionFingerprint(harness.repository);
  const campaign = document.components.campaign;
  const body = (campaign?.body ?? {}) as { counts?: { xp?: number } };
  const components: SessionArchiveComponents = {
    ...document.components,
    campaign: {
      ...campaign,
      body: {
        ...(campaign?.body ?? {}),
        counts: { ...(body.counts ?? {}), xp: (body.counts?.xp ?? 0) + 1_000 },
      },
    },
  } as SessionArchiveComponents;
  const imported = await harness.archive.import({
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    document: restamp(document, components),
  });
  return {
    code: imported.status === 'REJECTED' ? imported.rejection.code : 'ACCEPTED',
    untouched: before === (await sessionFingerprint(harness.repository)),
  };
}

async function roundTripScenario() {
  const harness = await createArchiveHarness();
  try {
    const exported = await exportArchive(harness);
    const document = exported.document;
    const text = JSON.stringify(document);
    const validated = readSessionArchive(text, {
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      catalog: harness.catalog,
      versions: ARCHIVE_VERSIONS,
    });
    if (validated.status !== 'ACCEPTED') {
      throw new Error(`135 report validation refused: ${validated.rejection.code}`);
    }
    const beforeSave = await readSave(harness);
    const revisionsBefore = revisions(
      await harness.repository.readPlayerSave(ARCHIVE_SESSION_ID, ARCHIVE_PLAYER_ID),
    );
    const imported = await harness.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: text,
    });
    if (imported.status === 'REJECTED') {
      throw new Error(`135 report import refused: ${imported.rejection.code}`);
    }
    const afterSave = await readSave(harness);
    const revisionsAfter = revisions(
      await harness.repository.readPlayerSave(ARCHIVE_SESSION_ID, ARCHIVE_PLAYER_ID),
    );
    const checkpoint = await harness.repository.latestCheckpoint(ARCHIVE_SESSION_ID);
    const scenarios = await harness.repository.listScenarios(ARCHIVE_SESSION_ID);
    const sizes = exported.sizes;
    return {
      harness,
      structure: {
        format: document.format,
        sessionId: document.session.sessionId,
        playerId: document.session.playerId,
        worldEpoch: document.session.worldEpoch,
        checkpointId: document.components.checkpoint?.checkpointId ?? 'ABSENT',
        checkpointTick: document.components.checkpoint?.tick ?? -1,
        engineVersion: document.versions.engine,
        profileId: document.components.profile?.profileId ?? 'ABSENT',
        activeVersionId: document.components.profile?.activeVersionId ?? 'ABSENT',
        activationSequence: document.components.profile?.activationSequence ?? -1,
        sizes: {
          checkpoint: sizes.checkpoint,
          progress: sizes.progress,
          campaign: sizes.campaign,
          settings: sizes.settings,
          profile: sizes.profile,
          scenarios: sizes.scenarios,
          total: sizes.total,
          limit: sizes.limit,
        },
        checksumLength: document.checksum.value.length,
        canonicalBytes: exported.bytes,
        counts: {
          trackerInstances: exported.counts.trackerInstances,
          trackerRewards: exported.counts.trackerRewards,
          campaignEvents: exported.counts.campaignEvents,
          campaignCompleted: exported.counts.campaignCompleted,
          xp: exported.counts.xp,
          rewardsGranted: exported.counts.rewardsGranted,
          scenarios: exported.counts.scenarios,
        },
        digests: {
          tracker: exported.document.components.progress?.body.digest as string | null,
          campaign: exported.document.components.campaign?.body.digest as string | null,
        },
        rows: await rowsOf(harness),
      },
      roundTrip: {
        checksumVerified: validated.checksumVerified,
        canonicalBytesSame: validated.bytes === exported.bytes,
        trackerDigestSame: beforeSave.tracker?.digest === afterSave.tracker?.digest,
        campaignDigestSame: beforeSave.campaign?.digest === afterSave.campaign?.digest,
        settingsSame: same(beforeSave.settings, afterSave.settings),
        xpBefore: beforeSave.campaign?.rewards.totals.xp ?? 0,
        xpAfter: afterSave.campaign?.rewards.totals.xp ?? 0,
        completedAfter: afterSave.campaign?.counts.completed ?? 0,
        instancesAfter: afterSave.tracker?.snapshot.instances.length ?? 0,
        scenariosAfter: scenarios.length,
        checkpointTickAfter: checkpoint?.tick ?? -1,
        checkpointSame: checkpoint?.checkpointId === ARCHIVE_CHECKPOINT_ID,
        afterDigests: {
          tracker: afterSave.tracker?.digest ?? null,
          campaign: afterSave.campaign?.digest ?? null,
        },
        revisionsBefore,
        revisionsAfter,
        replaced: imported.replacement.replaced,
      },
      refusals: {
        checksum: await checksumRefusal(harness, document),
        campaignDigest: await campaignRefusal(harness, document),
      },
    };
  } finally {
    harness.repository.close();
  }
}

async function refusalScenario() {
  const harness = await createArchiveHarness();
  try {
    const exported = await exportArchive(harness);
    const document = exported.document;
    const expect = {
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      catalog: harness.catalog,
      versions: ARCHIVE_VERSIONS,
    };
    const progress = document.components.progress;
    const profile = document.components.profile;
    if (progress === null || profile === null) throw new Error('135 report fixture is incomplete');

    const mixed = readSessionArchive(
      restamp(document, {
        ...document.components,
        progress: { ...progress, sessionId: 'session-135-other', recordId: 'tracker:other' },
      }),
      expect,
    );
    const archiveGeneration = readSessionArchive(
      restamp(document, {
        ...document.components,
        profile: { ...profile, activeVersionId: 'profile-1@1' },
      }),
      expect,
    );

    const bigRows = [0, 1, 2].map((index) =>
      parsePersistedRecord(
        scenarioRecord({
          recordId: `scenario-135-big-${index}`,
          sessionId: ARCHIVE_SESSION_ID,
          worldEpoch: ARCHIVE_WORLD_EPOCH,
          body: { payload: 'x'.repeat(200_000), seed: index },
        }),
        'SCENARIO',
      ),
    );
    const componentBudget = readSessionArchive(
      restamp(document, { ...document.components, scenarios: bigRows }),
      expect,
    );
    const declaredTotal = readSessionArchive(
      stampSessionArchiveChecksum({
        ...document,
        sizes: { ...document.sizes, total: SESSION_ARCHIVE_LIMITS.maxTotalBytes + 1 },
      }),
      expect,
    );
    const declaredSize = readSessionArchive(
      stampSessionArchiveChecksum({
        ...document,
        sizes: { ...document.sizes, progress: document.sizes.progress + 1 },
      }),
      expect,
    );
    const duplicateKey = readSessionArchive(
      JSON.stringify(document).replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1'),
      expect,
    );
    const newerFormat = readSessionArchive({ ...document, formatVersion: 2 }, expect);
    const wrongSession = readSessionArchive(document, { ...expect, sessionId: 'session-other' });

    const staleTarget = await createArchiveHarness({
      dbName: '135-report-stale-generation',
      profile: false,
      checkpoint: false,
      scenarios: 0,
    });
    try {
      await staleTarget.repository.putProfile(profileVersion());
      await staleTarget.repository.putProfile(derivedProfile());
      await staleTarget.repository.activateProfile(
        activation({ playerId: ARCHIVE_PLAYER_ID, versionId: 'profile-1@1', sequence: 1 }),
      );
      const storedGeneration = await staleTarget.archive.import({
        sessionId: ARCHIVE_SESSION_ID,
        playerId: ARCHIVE_PLAYER_ID,
        document,
      });
      const missingTarget = await createArchiveHarness({
        dbName: '135-report-missing-profile',
        profile: false,
        checkpoint: false,
        save: false,
        scenarios: 0,
      });
      try {
        const missingVersion = await missingTarget.archive.import({
          sessionId: ARCHIVE_SESSION_ID,
          playerId: ARCHIVE_PLAYER_ID,
          document,
        });
        const emptyExport = await missingTarget.archive.export({
          sessionId: ARCHIVE_SESSION_ID,
          playerId: ARCHIVE_PLAYER_ID,
          createdAt: '2026-11-11T15:00:00.000Z',
          versions: ARCHIVE_VERSIONS,
        });

        const second = await openRepository(
          harness.factory,
          harness.locks,
          'tab-b',
          ARCHIVE_DB_NAME,
        );
        let secondTab = 'ABSENT';
        try {
          const store = createSessionArchiveStore({
            repository: second,
            catalog: harness.catalog,
            transactions: await openTransactionRunner(harness.factory, ARCHIVE_DB_NAME),
          });
          const imported = await store.import({
            sessionId: ARCHIVE_SESSION_ID,
            playerId: ARCHIVE_PLAYER_ID,
            document,
          });
          secondTab = imported.status === 'REJECTED' ? imported.rejection.code : 'ACCEPTED';
        } finally {
          second.close();
        }

        const beforeRollback = await sessionFingerprint(harness.repository);
        const rollback = await harness.archive.import({
          sessionId: ARCHIVE_SESSION_ID,
          playerId: ARCHIVE_PLAYER_ID,
          document,
          hooks: {
            beforeCommit: () => {
              throw new PersistenceError('TRANSACTION_ABORTED', 'injected failure before commit');
            },
          },
        });
        const afterRollback = await sessionFingerprint(harness.repository);
        return {
          mixedSession: mixed.status === 'REJECTED' ? mixed.rejection.code : 'ACCEPTED',
          archiveGeneration:
            archiveGeneration.status === 'REJECTED' ? archiveGeneration.rejection.code : 'ACCEPTED',
          storedGeneration:
            storedGeneration.status === 'REJECTED' ? storedGeneration.rejection.code : 'ACCEPTED',
          missingVersion:
            missingVersion.status === 'REJECTED' ? missingVersion.rejection.code : 'ACCEPTED',
          componentBudget:
            componentBudget.status === 'REJECTED' ? componentBudget.rejection.code : 'ACCEPTED',
          declaredTotal:
            declaredTotal.status === 'REJECTED' ? declaredTotal.rejection.code : 'ACCEPTED',
          declaredSize:
            declaredSize.status === 'REJECTED' ? declaredSize.rejection.code : 'ACCEPTED',
          duplicateKey:
            duplicateKey.status === 'REJECTED' ? duplicateKey.rejection.code : 'ACCEPTED',
          newerFormat: newerFormat.status === 'REJECTED' ? newerFormat.rejection.code : 'ACCEPTED',
          wrongSession:
            wrongSession.status === 'REJECTED' ? wrongSession.rejection.code : 'ACCEPTED',
          secondTab,
          rollback: rollback.status === 'REJECTED' ? rollback.rejection.code : 'ACCEPTED',
          rollbackUntouched: beforeRollback === afterRollback,
          emptyArchive: emptyExport.status === 'REJECTED' ? emptyExport.rejection.code : 'ACCEPTED',
        };
      } finally {
        missingTarget.repository.close();
      }
    } finally {
      staleTarget.repository.close();
    }
  } finally {
    harness.repository.close();
  }
}

async function rewardsScenario() {
  const source = await createArchiveHarness({
    dbName: '135-report-source',
    through: 'campaign-3-following-distance',
  });
  const target = await createArchiveHarness({
    dbName: '135-report-target',
    through: 'campaign-6-city-copies-you',
  });
  try {
    const exported = await exportArchive(source);
    const before = await readSave(target);
    const imported = await target.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: exported.document,
    });
    if (imported.status === 'REJECTED') {
      throw new Error(`135 report rewards import refused: ${imported.rejection.code}`);
    }
    const after = await readSave(target);
    const ledger = after.campaign?.ledger;
    if (ledger === undefined) throw new Error('135 report rewards fixture has no campaign');
    const completion = source.run.completions[0];
    if (completion === undefined) throw new Error('135 report rewards fixture has no completion');
    const duplicate = ledger.settle({ instance: completion.instance });
    const second = await target.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: exported.document,
    });
    const afterSecond = await readSave(target);
    return {
      targetXpBefore: before.campaign?.rewards.totals.xp ?? 0,
      targetCompletedBefore: before.campaign?.counts.completed ?? 0,
      archiveXp: exported.counts.xp,
      archiveGranted: exported.counts.rewardsGranted,
      afterXp: after.campaign?.rewards.totals.xp ?? 0,
      afterGranted: after.campaign?.rewards.totals.granted ?? 0,
      afterCompleted: after.campaign?.counts.completed ?? 0,
      notAdded:
        (after.campaign?.rewards.totals.xp ?? 0) !==
        (before.campaign?.rewards.totals.xp ?? 0) + exported.counts.xp,
      duplicateStatus: duplicate.status,
      duplicateXp: duplicate.xpGranted,
      secondImportXp: afterSecond.campaign?.rewards.totals.xp ?? 0,
      secondImportGranted: afterSecond.campaign?.rewards.totals.granted ?? 0,
      secondOk: second.status === 'COMMITTED',
    };
  } finally {
    source.repository.close();
    target.repository.close();
  }
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): ArchiveReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: same(expected, actual),
    detail,
  });
}

export async function runSessionArchiveReport(): Promise<SessionArchiveReport> {
  const round = await roundTripScenario();
  const refusals = {
    checksum: round.refusals.checksum,
    campaignDigest: round.refusals.campaignDigest,
    ...(await refusalScenario()),
  };
  const rewards = await rewardsScenario();
  const sizes = round.structure.sizes;
  const checks: ArchiveReportCheck[] = [
    check(
      'format marker',
      'self-driving-academy-session-archive',
      round.structure.format,
      'The reader accepts exactly one envelope format.',
    ),
    check(
      'session identity',
      ARCHIVE_SESSION_ID,
      round.structure.sessionId,
      'The archive carries the session it replaces.',
    ),
    check(
      'player identity',
      ARCHIVE_PLAYER_ID,
      round.structure.playerId,
      'The settings and the activation belong to the same player.',
    ),
    check(
      'world epoch',
      ARCHIVE_WORLD_EPOCH,
      round.structure.worldEpoch,
      'Every component belongs to one world epoch.',
    ),
    check(
      'checkpoint identity',
      ARCHIVE_CHECKPOINT_ID,
      round.structure.checkpointId,
      'The 206 checkpoint has its own slot.',
    ),
    check(
      'checkpoint tick',
      4_000,
      round.structure.checkpointTick,
      'The world is captured on its tick boundary.',
    ),
    check(
      'profile reference',
      'profile-1@2',
      round.structure.activeVersionId,
      'The checkpoint names a stored 109 version.',
    ),
    check(
      'activation sequence',
      ARCHIVE_ACTIVATION_SEQUENCE,
      round.structure.activationSequence,
      'The checkpoint and the 110 activation are one generation.',
    ),
    check(
      'campaign completions',
      3,
      round.structure.counts.campaignCompleted,
      'The fixture completes three real missions.',
    ),
    check(
      'tracker instances',
      3,
      round.structure.counts.trackerInstances,
      'The tracker stores three real instances.',
    ),
    check(
      'scenario rows',
      1,
      round.structure.counts.scenarios,
      'Scenarios are explicit rows, not a free field.',
    ),
    check(
      'component ledger sum',
      sizes.total,
      sizes.checkpoint +
        sizes.progress +
        sizes.campaign +
        sizes.settings +
        sizes.profile +
        sizes.scenarios,
      'The declared total is the sum of the components.',
    ),
    check(
      'archive limit',
      SESSION_ARCHIVE_LIMITS.maxTotalBytes,
      sizes.limit,
      'The document declares the build limit.',
    ),
    check(
      'checksum length',
      64,
      round.structure.checksumLength,
      'The envelope checksum is a full SHA-256.',
    ),
    check(
      'canonical bytes',
      true,
      round.roundTrip.canonicalBytesSame,
      'The validated document is the exported document byte for byte.',
    ),
    check(
      'checksum verified',
      true,
      round.roundTrip.checksumVerified,
      'The reader recomputes the envelope checksum.',
    ),
    check(
      'tracker digest after import',
      round.structure.digests.tracker,
      round.roundTrip.afterDigests.tracker,
      'The stored tracker digest is the archived one.',
    ),
    check(
      'campaign digest after import',
      round.structure.digests.campaign,
      round.roundTrip.afterDigests.campaign,
      'The stored campaign digest is the archived one.',
    ),
    check(
      'settings restored',
      true,
      round.roundTrip.settingsSame,
      'The 009 preferences survive the replacement.',
    ),
    check(
      'xp after import',
      round.roundTrip.xpBefore,
      round.roundTrip.xpAfter,
      'The replacement keeps the archived XP.',
    ),
    check(
      'completions after import',
      3,
      round.roundTrip.completedAfter,
      'The campaign keeps its three completions.',
    ),
    check(
      'instances after import',
      3,
      round.roundTrip.instancesAfter,
      'The tracker keeps its three instances.',
    ),
    check(
      'scenarios after import',
      1,
      round.roundTrip.scenariosAfter,
      'The explicit scenario rows are replaced, not merged.',
    ),
    check(
      'checkpoint after import',
      4_000,
      round.roundTrip.checkpointTickAfter,
      'The latest checkpoint is the archived world.',
    ),
    check(
      'checkpoint replaced',
      true,
      round.roundTrip.checkpointSame,
      'The archived checkpoint is the latest one.',
    ),
    check(
      'progress rows replaced',
      2,
      round.roundTrip.replaced.progress,
      'Both 130 rows of the previous session are replaced.',
    ),
    check(
      'scenarios replaced',
      1,
      round.roundTrip.replaced.scenarios,
      'The previous scenario rows are replaced.',
    ),
    check(
      'checkpoints replaced',
      1,
      round.roundTrip.replaced.checkpoints,
      'The previous checkpoint generation is replaced.',
    ),
    check(
      'settings replaced',
      true,
      round.roundTrip.replaced.settings,
      'The previous settings row is replaced.',
    ),
    check(
      'target completed before',
      6,
      rewards.targetCompletedBefore,
      'The target session is further into the campaign.',
    ),
    check(
      'target had more xp',
      true,
      rewards.targetXpBefore > rewards.archiveXp,
      'The target XP is above the archived XP.',
    ),
    check(
      'xp replaced, not added',
      rewards.archiveXp,
      rewards.afterXp,
      'The import replaces the XP total.',
    ),
    check(
      'xp not summed',
      true,
      rewards.notAdded,
      'The result is not the previous XP plus the archive.',
    ),
    check(
      'rewards granted replaced',
      rewards.archiveGranted,
      rewards.afterGranted,
      'The granted reward count is the archived one.',
    ),
    check('completions replaced', 3, rewards.afterCompleted, 'The campaign is the archived one.'),
    check(
      'duplicate settlement',
      'DUPLICATE',
      rewards.duplicateStatus,
      'The same 116 completion cannot pay again.',
    ),
    check('duplicate xp', 0, rewards.duplicateXp, 'A duplicate grants zero XP.'),
    check(
      'second import xp',
      rewards.archiveXp,
      rewards.secondImportXp,
      'A second import is idempotent.',
    ),
    check(
      'second import granted',
      rewards.archiveGranted,
      rewards.secondImportGranted,
      'A second import grants nothing.',
    ),
    check(
      'checksum refusal',
      'CHECKSUM_MISMATCH',
      refusals.checksum.code,
      'A modified file is refused before parsing.',
    ),
    check(
      'checksum refusal untouched',
      true,
      refusals.checksum.untouched,
      'The current session is byte-identical after a refused file.',
    ),
    check(
      'campaign digest refusal',
      'CAMPAIGN_INVALID',
      refusals.campaignDigest.code,
      'A re-stamped file still cannot forge the 125 ledger.',
    ),
    check(
      'campaign digest untouched',
      true,
      refusals.campaignDigest.untouched,
      'A forged ledger leaves the session untouched.',
    ),
    check(
      'mixed session refusal',
      'SESSION_MISMATCH',
      refusals.mixedSession,
      'A row of another session is refused.',
    ),
    check(
      'archive generation refusal',
      'PROFILE_GENERATION_MISMATCH',
      refusals.archiveGeneration,
      'A checkpoint naming another version is refused.',
    ),
    check(
      'stored generation refusal',
      'PROFILE_GENERATION_MISMATCH',
      refusals.storedGeneration,
      'A target profile generation that moved on is refused.',
    ),
    check(
      'missing version refusal',
      'PROFILE_VERSION_MISSING',
      refusals.missingVersion,
      'A profile import is a separate action.',
    ),
    check(
      'component budget refusal',
      'COMPONENT_TOO_LARGE',
      refusals.componentBudget,
      'A component over its budget is refused.',
    ),
    check(
      'declared total refusal',
      'ARCHIVE_TOO_LARGE',
      refusals.declaredTotal,
      'A declared total over the limit is refused.',
    ),
    check(
      'declared size refusal',
      'SIZE_MISMATCH',
      refusals.declaredSize,
      'A wrong declared size is refused.',
    ),
    check(
      'duplicate key refusal',
      'DUPLICATE_KEY',
      refusals.duplicateKey,
      'The strict parser rejects duplicated keys.',
    ),
    check(
      'newer format refusal',
      'FORMAT_VERSION_TOO_NEW',
      refusals.newerFormat,
      'A newer layout is refused before the checksum.',
    ),
    check(
      'wrong session refusal',
      'SESSION_MISMATCH',
      refusals.wrongSession,
      'The file must belong to the requested session.',
    ),
    check(
      'second tab refusal',
      'WRITER_REQUIRED',
      refusals.secondTab,
      'Only the writer page imports.',
    ),
    check(
      'rollback refusal',
      'TRANSACTION_ABORTED',
      refusals.rollback,
      'A failure before commit aborts the transaction.',
    ),
    check(
      'rollback untouched',
      true,
      refusals.rollbackUntouched,
      'The session is byte-identical after a rollback.',
    ),
    check(
      'empty archive refusal',
      'ARCHIVE_EMPTY',
      refusals.emptyArchive,
      'An archive replaces a session with a session.',
    ),
    check(
      'progress bytes inside the 127 row budget',
      true,
      sizes.progress < PERSISTENCE_LIMITS.maxRecordBytes,
      'Every component is written back through a 127 row.',
    ),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: SESSION_ARCHIVE_REPORT_VERSION,
    generatedBy: 'npm run save:session-archive',
    oracleRule:
      'Arhiva este dovedită prin ciclu complet: snapshotul 206 este capturat de writerul real, rândurile 130 sunt scrise de store-ul de progres, campania este finalizată de modulele reale 116/125, iar fiecare valoare așteptată este contractul documentat. Refuzurile sunt măsurate pe aceeași bază în memorie, cu amprentă byte cu byte înainte și după fiecare fișier respins; nu există ceas de perete și nici Math.random.',
    structure: round.structure,
    roundTrip: round.roundTrip,
    rewards: {
      targetXpBefore: rewards.targetXpBefore,
      targetCompletedBefore: rewards.targetCompletedBefore,
      archiveXp: rewards.archiveXp,
      archiveGranted: rewards.archiveGranted,
      afterXp: rewards.afterXp,
      afterGranted: rewards.afterGranted,
      afterCompleted: rewards.afterCompleted,
      notAdded: rewards.notAdded,
      duplicateStatus: rewards.duplicateStatus,
      duplicateXp: rewards.duplicateXp,
      secondImportXp: rewards.secondImportXp,
      secondImportGranted: rewards.secondImportGranted,
    },
    refusals: {
      checksum: refusals.checksum.code,
      checksumLeftSessionUntouched: refusals.checksum.untouched,
      campaignDigest: refusals.campaignDigest.code,
      campaignDigestLeftSessionUntouched: refusals.campaignDigest.untouched,
      mixedSession: refusals.mixedSession,
      archiveGeneration: refusals.archiveGeneration,
      storedGeneration: refusals.storedGeneration,
      missingVersion: refusals.missingVersion,
      componentBudget: refusals.componentBudget,
      declaredTotal: refusals.declaredTotal,
      declaredSize: refusals.declaredSize,
      duplicateKey: refusals.duplicateKey,
      newerFormat: refusals.newerFormat,
      wrongSession: refusals.wrongSession,
      secondTab: refusals.secondTab,
      rollback: refusals.rollback,
      rollbackLeftSessionUntouched: refusals.rollbackUntouched,
      emptyArchive: refusals.emptyArchive,
    },
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      scenarios: 3,
      pass: passed === checks.length,
    }),
  });
}

function rows(entries: readonly (readonly [string, unknown])[]): string {
  return [
    '| Măsură | Valoare |',
    '| --- | --- |',
    ...entries.map(([name, value]) => `| ${name} | ${String(value)} |`),
  ].join('\n');
}

/** Human-readable transcript rendered next to `report.json`; it is generated, never hand-written. */
export function sessionArchiveReportMarkdown(report: SessionArchiveReport): string {
  const sizes = report.structure.sizes;
  const structure = rows([
    ['sesiune', report.structure.sessionId],
    ['jucător', report.structure.playerId],
    ['world epoch', report.structure.worldEpoch],
    ['checkpoint', report.structure.checkpointId],
    ['tick checkpoint', report.structure.checkpointTick],
    ['engine/fizică/hartă', report.structure.engineVersion],
    ['profil', report.structure.profileId],
    ['versiune activă', report.structure.activeVersionId],
    ['secvență activare', report.structure.activationSequence],
    ['bytes checkpoint', sizes.checkpoint],
    ['bytes progres', sizes.progress],
    ['bytes campanie', sizes.campaign],
    ['bytes setări', sizes.settings],
    ['bytes referință profil', sizes.profile],
    ['bytes scenarii', sizes.scenarios],
    ['bytes total', sizes.total],
    ['plafon total', sizes.limit],
    ['lungime checksum', report.structure.checksumLength],
    ['bytes canonici document', report.structure.canonicalBytes],
    ['instanțe tracker', report.structure.counts.trackerInstances],
    ['recompense tracker', report.structure.counts.trackerRewards],
    ['evenimente campanie', report.structure.counts.campaignEvents],
    ['misiuni finalizate', report.structure.counts.campaignCompleted],
    ['XP', report.structure.counts.xp],
    ['recompense acordate', report.structure.counts.rewardsGranted],
    ['scenarii', report.structure.counts.scenarios],
  ]);
  const roundTrip = rows([
    ['checksum verificat', report.roundTrip.checksumVerified],
    ['document canonic identic', report.roundTrip.canonicalBytesSame],
    ['digest tracker identic', report.roundTrip.trackerDigestSame],
    ['digest campanie identic', report.roundTrip.campaignDigestSame],
    ['setări identice', report.roundTrip.settingsSame],
    ['XP înainte/după', `${report.roundTrip.xpBefore}/${report.roundTrip.xpAfter}`],
    ['misiuni după', report.roundTrip.completedAfter],
    ['instanțe după', report.roundTrip.instancesAfter],
    ['scenarii după', report.roundTrip.scenariosAfter],
    ['tick checkpoint după', report.roundTrip.checkpointTickAfter],
    ['revizii înainte', report.roundTrip.revisionsBefore.join(',')],
    ['revizii după', report.roundTrip.revisionsAfter.join(',')],
    ['rânduri progres înlocuite', report.roundTrip.replaced.progress],
    ['scenarii înlocuite', report.roundTrip.replaced.scenarios],
    ['checkpointuri înlocuite', report.roundTrip.replaced.checkpoints],
    ['setări înlocuite', report.roundTrip.replaced.settings],
  ]);
  const rewards = rows([
    ['XP țintă înainte', report.rewards.targetXpBefore],
    ['misiuni țintă înainte', report.rewards.targetCompletedBefore],
    ['XP arhivă', report.rewards.archiveXp],
    ['recompense arhivă', report.rewards.archiveGranted],
    ['XP după import', report.rewards.afterXp],
    ['recompense după import', report.rewards.afterGranted],
    ['misiuni după import', report.rewards.afterCompleted],
    ['înlocuit, nu adunat', report.rewards.notAdded],
    ['a doua finalizare', report.rewards.duplicateStatus],
    ['XP pentru duplicat', report.rewards.duplicateXp],
    ['XP după al doilea import', report.rewards.secondImportXp],
    ['recompense după al doilea import', report.rewards.secondImportGranted],
  ]);
  const refusals = rows([
    ['checksum modificat', report.refusals.checksum],
    ['sesiune neatinsă după checksum', report.refusals.checksumLeftSessionUntouched],
    ['jurnal de campanie rescris', report.refusals.campaignDigest],
    ['sesiune neatinsă după jurnal', report.refusals.campaignDigestLeftSessionUntouched],
    ['rând din altă sesiune', report.refusals.mixedSession],
    ['generație în arhivă', report.refusals.archiveGeneration],
    ['generație stocată', report.refusals.storedGeneration],
    ['versiune lipsă', report.refusals.missingVersion],
    ['componentă peste buget', report.refusals.componentBudget],
    ['total declarat peste plafon', report.refusals.declaredTotal],
    ['mărime declarată greșită', report.refusals.declaredSize],
    ['chei duplicate', report.refusals.duplicateKey],
    ['format mai nou', report.refusals.newerFormat],
    ['altă sesiune cerută', report.refusals.wrongSession],
    ['al doilea tab', report.refusals.secondTab],
    ['eșec înainte de commit', report.refusals.rollback],
    ['sesiune neatinsă după rollback', report.refusals.rollbackLeftSessionUntouched],
    ['arhivă fără componente', report.refusals.emptyArchive],
  ]);
  const checks = [
    '| Verificare | Așteptat | Real | Rezultat |',
    '| --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| ${entry.name} | ${JSON.stringify(entry.expected)} | ${JSON.stringify(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    ),
  ].join('\n');
  return [
    '# Raport 135 — arhiva de sesiune',
    '',
    `Versiune raport: \`${report.version}\`.`,
    '',
    `Generat de: \`${report.generatedBy}\`.`,
    '',
    `Regulă oracol: ${report.oracleRule}`,
    '',
    '## Structura arhivei',
    '',
    structure,
    '',
    '## Round-trip',
    '',
    roundTrip,
    '',
    '## Recompense înlocuite, nu adunate',
    '',
    rewards,
    '',
    '## Refuzuri',
    '',
    refusals,
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
