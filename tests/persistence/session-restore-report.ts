import {
  PERSISTENCE_SCHEMA_VERSION,
  SAVE_MIGRATION_EXPORT_FORMAT,
  SAVE_MIGRATION_VERSION,
  createMemoryIdbFactory,
  migrateSaveDatabase,
  readSaveMigrationExport,
  recoverSaveMigration,
  restoreSession,
  saveMigrationPlan,
  saveMigrationRowsDigest,
  saveMigrationStores,
  storeDefinition,
} from '../../src/persistence/index';
import type {
  FactoryPort,
  MemoryIdbFactory,
  SaveMigrationExport,
  SaveMigrationStoreRows,
} from '../../src/persistence/index';
import { FIXED_NOW, fixedClock, segmentRecord, settingsSnapshot } from './fixtures';
import {
  RESTORE_LEARNING_EPOCH,
  RESTORE_SESSION,
  RESTORE_VERSIONS,
  VALID_CHECKPOINT,
  VALID_TICK,
  createInvalidOnlyHarness,
  createRestoreHarness,
  storeEnvelopeMismatch,
} from './session-restore-fixture';

/**
 * Deterministic transcript of the PBI 136 contracts.
 *
 * There is no wall clock, no browser and no random source: the timestamps come from the injected
 * fixed clock, the world is the deterministic 70-vehicle 206 fixture, the momentum clock of the
 * checkpoint writer is stubbed, and every expected value is a documented contract. The same build
 * therefore produces the same `report.json` byte for byte.
 */
export const SESSION_RESTORE_REPORT_VERSION = '136-session-restore-report-v1';

export interface RestoreReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MigrationReport {
  readonly version: string;
  readonly exportFormat: string;
  readonly currentSchemaVersion: number;
  readonly transitions: readonly {
    readonly from: number;
    readonly to: number;
    readonly steps: readonly string[];
  }[];
  readonly migrated: {
    readonly status: string;
    readonly fromVersion: number;
    readonly applied: readonly string[];
    readonly stores: number;
    readonly rows: number;
    readonly exportBytes: number;
    readonly digest: string;
    readonly rowsUnchanged: boolean;
    readonly versionAfter: number | null;
    readonly storesAfter: number;
  };
  readonly fresh: {
    readonly status: string;
    readonly applied: readonly string[];
    readonly rows: number;
    readonly versionAfter: number | null;
  };
  readonly current: {
    readonly status: string;
    readonly applied: readonly string[];
  };
  readonly tooNew: {
    readonly plan: string;
    readonly migration: string;
    readonly untouched: boolean;
  };
  readonly failed: {
    readonly code: string;
    readonly untouched: boolean;
    readonly versionAfter: number | null;
    readonly hasCheckpointStore: boolean;
    readonly exportRows: number;
    readonly digestSameAsBefore: boolean;
  };
  readonly recovery: {
    readonly status: string;
    readonly verified: boolean;
    readonly rows: number;
    readonly digestMatchesExport: boolean;
    readonly secondTarget: string;
    readonly tampered: string;
  };
}

export interface RestoreReport {
  readonly version: string;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly world: {
    readonly vehicles: number;
    readonly rides: number;
    readonly passengers: number;
    readonly segments: number;
    readonly learningJobs: number;
    readonly dispatchJobs: number;
    readonly observations: number;
  };
  readonly selected: {
    readonly checkpointId: string;
    readonly tick: number;
    readonly generation: number;
    readonly bytes: number;
    readonly checksumLength: number;
    readonly skipped: readonly { readonly checkpointId: string; readonly code: string }[];
    readonly candidates: number;
  };
  readonly launch: {
    readonly mode: string;
    readonly paused: boolean;
    readonly auto: boolean;
    readonly inputReleased: boolean;
    readonly manualVehicles: number;
    readonly vehiclesInAuto: number;
    readonly previousManualVehicles: number;
  };
  readonly segments: {
    readonly open: number;
    readonly incomplete: number;
    readonly entries: readonly {
      readonly segmentId: string;
      readonly from: string;
      readonly to: string;
      readonly reason: string;
    }[];
  };
  readonly jobs: {
    readonly relaunched: number;
    readonly invalidated: number;
    readonly relaunchedIds: readonly string[];
    readonly reasons: readonly string[];
  };
  readonly observations: {
    readonly replayed: number;
    readonly alreadyRewarded: number;
    readonly idempotencyKeys: readonly string[];
  };
  readonly ledger: {
    readonly rows: number;
    readonly digest: string;
    readonly rewardsReapplied: number;
  };
  readonly cases: {
    readonly epochInvalid: {
      readonly relaunched: number;
      readonly invalidated: number;
      readonly reasons: readonly string[];
    };
    readonly profileChanged: {
      readonly relaunched: number;
      readonly invalidated: number;
    };
    readonly envelopeMismatch: {
      readonly candidates: number;
      readonly skipped: readonly string[];
      readonly selected: string;
    };
    readonly empty: string;
    readonly brokenOnly: {
      readonly status: string;
      readonly code: string;
      readonly skipped: string;
    };
    readonly incompatible: {
      readonly status: string;
      readonly code: string;
    };
    readonly readOnly: boolean;
  };
  readonly checks: readonly RestoreReportCheck[];
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

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): RestoreReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: same(expected, actual),
    detail,
  });
}

/* ------------------------------------------------------------- migration */

async function openAt(factory: FactoryPort, name: string, version: number) {
  return factory.open({
    name,
    version,
    plan: (fromVersion) => saveMigrationPlan(fromVersion).filter((step) => step.version <= version),
    now: fixedClock(),
  });
}

async function readAll(
  factory: FactoryPort,
  name: string,
  version: number,
): Promise<readonly SaveMigrationStoreRows[]> {
  const opened = await openAt(factory, name, version);
  if (opened.status !== 'OPENED') throw new Error(`report open ${version} failed`);
  try {
    const stores = saveMigrationStores(version);
    return await opened.database.transact(stores, 'readonly', async (transaction) => {
      const result: SaveMigrationStoreRows[] = [];
      for (const store of stores) {
        const rows = await transaction.getAll(store);
        const kept =
          store === 'meta'
            ? rows.filter((row) => {
                if (typeof row !== 'object' || row === null) return true;
                return (row as Record<string, unknown>).key !== 'schema';
              })
            : rows;
        result.push(
          Object.freeze({
            name: store,
            keyPath: storeDefinition(store, version)?.keyPath ?? store,
            rows: Object.freeze([...kept]),
          }),
        );
      }
      return Object.freeze(result);
    });
  } finally {
    opened.database.close();
  }
}

async function seedVersionOne(factory: MemoryIdbFactory, name: string): Promise<void> {
  const opened = await openAt(factory, name, 1);
  if (opened.status !== 'OPENED') throw new Error('report seed failed');
  try {
    await opened.database.transact(
      ['profiles', 'segments', 'settings'],
      'readwrite',
      async (transaction) => {
        await transaction.put('profiles', {
          schemaVersion: 1,
          units: 'SI',
          profileId: 'profile-1',
          versionId: 'profile-1@1',
          parentVersionId: null,
          engineVersion: 'engine-206',
          parameters: { speed: 12.5 },
          provenance: {
            origin: 'BASE',
            sourceSegmentIds: [],
            sourceInterventionIds: [],
            delta: null,
          },
          sourceSegmentIds: [],
          depth: 0,
          createdAt: FIXED_NOW,
          checksum: 'legacy-checksum-kept-as-data',
        });
        await transaction.put('segments', segmentRecord());
        await transaction.put('settings', settingsSnapshot());
      },
    );
  } finally {
    opened.database.close();
  }
}

function newerFactory(): FactoryPort {
  return {
    open: () =>
      Promise.resolve({
        status: 'FAILED',
        code: 'SCHEMA_TOO_NEW',
        message: 'Local database schema 3 is newer than this build',
      }),
    deleteDatabase: () => Promise.resolve(),
  } as FactoryPort;
}

async function migrationSection(): Promise<MigrationReport> {
  const freshFactory = createMemoryIdbFactory();
  const fresh = await migrateSaveDatabase({
    factory: freshFactory,
    database: '136-report-fresh',
    now: fixedClock(),
  });

  const factory = createMemoryIdbFactory();
  await seedVersionOne(factory, '136-report-v1');
  const before = saveMigrationRowsDigest(await readAll(factory, '136-report-v1', 1));
  const migrated = await migrateSaveDatabase({
    factory,
    database: '136-report-v1',
    now: fixedClock(),
  });
  if (migrated.status !== 'MIGRATED' || migrated.export === null) {
    throw new Error(`136 report migration failed: ${migrated.status}`);
  }
  const after = await readAll(factory, '136-report-v1', 2);
  const exportedNames = new Set(migrated.export.stores.map((store) => store.name));
  const unchangedAfter =
    saveMigrationRowsDigest(after.filter((store) => exportedNames.has(store.name))) === before;

  const current = await migrateSaveDatabase({
    factory,
    database: '136-report-v1',
    now: fixedClock(),
  });

  const tooNewPlugin = await migrateSaveDatabase({
    factory: newerFactory(),
    database: '136-report-future',
    now: fixedClock(),
  });
  let planRefusal = 'ACCEPTED';
  try {
    saveMigrationPlan(3);
  } catch (error) {
    planRefusal =
      error instanceof Error && error.message.includes('newer than') ? 'SCHEMA_TOO_NEW' : 'OTHER';
  }

  const failing = createMemoryIdbFactory();
  await seedVersionOne(failing, '136-report-failed');
  const failedBefore = saveMigrationRowsDigest(await readAll(failing, '136-report-failed', 1));
  failing.failNextUpgrade(1);
  const failedResult = await migrateSaveDatabase({
    factory: failing,
    database: '136-report-failed',
    now: fixedClock(),
  });
  if (failedResult.status !== 'FAILED' || failedResult.export === null) {
    throw new Error(`136 report failure path did not fail: ${failedResult.status}`);
  }
  const exported: SaveMigrationExport = failedResult.export;

  const recovered = await recoverSaveMigration(exported, {
    factory: createMemoryIdbFactory(),
    database: '136-report-recovered',
    now: fixedClock(),
  });
  const secondFactory = createMemoryIdbFactory();
  await recoverSaveMigration(exported, {
    factory: secondFactory,
    database: '136-report-recovered-twice',
    now: fixedClock(),
  });
  const twice = await recoverSaveMigration(exported, {
    factory: secondFactory,
    database: '136-report-recovered-twice',
    now: fixedClock(),
  });
  const tampered = readSaveMigrationExport({
    ...exported,
    stores: exported.stores.map((store) =>
      store.name === 'segments'
        ? { ...store, rows: [{ ...(store.rows[0] as Record<string, unknown>), revision: 9 }] }
        : store,
    ),
  });

  return Object.freeze({
    version: SAVE_MIGRATION_VERSION,
    exportFormat: SAVE_MIGRATION_EXPORT_FORMAT,
    currentSchemaVersion: PERSISTENCE_SCHEMA_VERSION,
    transitions: Object.freeze([
      Object.freeze({
        from: 1,
        to: 2,
        steps: Object.freeze(saveMigrationPlan(1).map((step) => step.id)),
      }),
      Object.freeze({
        from: 2,
        to: 2,
        steps: Object.freeze(saveMigrationPlan(2).map((step) => step.id)),
      }),
    ]),
    migrated: Object.freeze({
      status: migrated.status,
      fromVersion: migrated.fromVersion,
      applied: migrated.applied,
      stores: migrated.counts.stores,
      rows: migrated.counts.rows,
      exportBytes: migrated.export.counts.rows === 0 ? 0 : JSON.stringify(migrated.export).length,
      digest: migrated.export.digest,
      rowsUnchanged: unchangedAfter,
      versionAfter: factory.inspect('136-report-v1')?.version ?? null,
      storesAfter: factory.inspect('136-report-v1')?.stores.length ?? 0,
    }),
    fresh: Object.freeze({
      status: fresh.status,
      applied: fresh.status === 'FAILED' ? Object.freeze([]) : fresh.applied,
      rows: fresh.status === 'FAILED' ? -1 : fresh.counts.rows,
      versionAfter: freshFactory.inspect('136-report-fresh')?.version ?? null,
    }),
    current: Object.freeze({
      status: current.status,
      applied: current.applied,
    }),
    tooNew: Object.freeze({
      plan: planRefusal,
      migration: tooNewPlugin.status === 'FAILED' ? tooNewPlugin.code : 'ACCEPTED',
      untouched: tooNewPlugin.status === 'FAILED' ? tooNewPlugin.untouched : false,
    }),
    failed: Object.freeze({
      code: failedResult.code,
      untouched: failedResult.untouched,
      versionAfter: failing.inspect('136-report-failed')?.version ?? null,
      hasCheckpointStore:
        failing
          .inspect('136-report-failed')
          ?.stores.some((store) => store.name === 'checkpoints') ?? true,
      exportRows: exported.counts.rows,
      digestSameAsBefore:
        saveMigrationRowsDigest(await readAll(failing, '136-report-failed', 1)) === failedBefore,
    }),
    recovery: Object.freeze({
      status: recovered.status,
      verified: recovered.status === 'RECOVERED' ? recovered.verified : false,
      rows: recovered.status === 'RECOVERED' ? recovered.rows : 0,
      digestMatchesExport:
        recovered.status === 'RECOVERED' ? recovered.digest === exported.digest : false,
      secondTarget: twice.status === 'FAILED' ? twice.code : 'ACCEPTED',
      tampered: tampered.status === 'REJECTED' ? tampered.code : 'ACCEPTED',
    }),
  });
}

/* --------------------------------------------------------------- restore */

async function restoreSection() {
  const harness = await createRestoreHarness();
  try {
    const first = await restoreSession(harness.repository, RESTORE_SESSION, {
      versions: RESTORE_VERSIONS,
      currentTick: VALID_TICK + 30,
    });
    if (first.status !== 'RESUMABLE') throw new Error(`136 report restore: ${first.status}`);
    const snapshotRows = first.state;

    const epochInvalid = await restoreSession(harness.repository, RESTORE_SESSION, {
      versions: RESTORE_VERSIONS,
      currentLearningEpoch: RESTORE_LEARNING_EPOCH + 1,
    });
    if (epochInvalid.status !== 'RESUMABLE') throw new Error('136 report epoch restore failed');

    const profileChanged = await restoreSession(harness.repository, RESTORE_SESSION, {
      versions: RESTORE_VERSIONS,
      currentProfileId: 'profile-2',
    });
    if (profileChanged.status !== 'RESUMABLE') throw new Error('136 report profile restore failed');

    await storeEnvelopeMismatch(harness.repository, harness);
    const withMismatch = await restoreSession(harness.repository, RESTORE_SESSION, {
      versions: RESTORE_VERSIONS,
    });
    if (withMismatch.status !== 'RESUMABLE') throw new Error('136 report mismatch restore failed');

    const empty = await restoreSession(harness.repository, 'session-136-empty', {
      versions: RESTORE_VERSIONS,
    });

    const fingerprintBefore = JSON.stringify({
      progress: (await harness.repository.listProgress(RESTORE_SESSION)).map((row) => row.recordId),
      segments: (await harness.repository.listSegments(RESTORE_SESSION)).map((row) => row.recordId),
      checkpoints: (await harness.repository.listCheckpoints(RESTORE_SESSION)).map(
        (row) => row.checkpointId,
      ),
    });
    await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS });
    const fingerprintAfter = JSON.stringify({
      progress: (await harness.repository.listProgress(RESTORE_SESSION)).map((row) => row.recordId),
      segments: (await harness.repository.listSegments(RESTORE_SESSION)).map((row) => row.recordId),
      checkpoints: (await harness.repository.listCheckpoints(RESTORE_SESSION)).map(
        (row) => row.checkpointId,
      ),
    });

    const selected = {
      checkpointId: first.checkpointId,
      tick: first.tick,
      generation: first.generation,
      bytes: first.bytes,
      checksumLength: first.checksum.length,
      skipped: Object.freeze(
        first.skipped.map((skip) =>
          Object.freeze({ checkpointId: skip.checkpointId, code: String(skip.code) }),
        ),
      ),
      candidates: first.counts.candidates,
    };
    const launch = {
      mode: first.launch.mode,
      paused: first.launch.paused,
      auto: first.launch.auto,
      inputReleased: first.launch.inputReleased,
      manualVehicles: first.launch.manualVehicles,
      vehiclesInAuto: first.launch.vehiclesInAuto,
      previousManualVehicles: first.launch.previousManualVehicles,
    };
    const segments = {
      open: first.counts.openSegments,
      incomplete: first.counts.incompleteSegments,
      entries: Object.freeze(
        first.segments.map((segment) =>
          Object.freeze({
            segmentId: segment.segmentId,
            from: segment.previousStatus,
            to: segment.nextStatus,
            reason: segment.reason,
          }),
        ),
      ),
    };
    const jobs = {
      relaunched: first.counts.jobsRelaunched,
      invalidated: first.counts.jobsInvalidated,
      relaunchedIds: Object.freeze(
        first.jobs
          .filter((job) => job.status === 'RELAUNCH')
          .map((job) => job.jobId)
          .sort(),
      ),
      reasons: Object.freeze(
        [
          ...new Set(
            first.jobs.filter((job) => job.reason !== null).map((job) => String(job.reason)),
          ),
        ].sort(),
      ),
    };
    const observations = {
      replayed: first.counts.observationsReplayed,
      alreadyRewarded: first.counts.observationsAlreadyRewarded,
      idempotencyKeys: Object.freeze(
        first.resume.observations.map((entry) => entry.idempotencyKey),
      ),
    };
    const ledger = {
      rows: first.ledger.rows,
      digest: first.ledger.digest,
      rewardsReapplied: first.resume.rewardsReapplied,
    };
    const epochCase = {
      relaunched: epochInvalid.counts.jobsRelaunched,
      invalidated: epochInvalid.counts.jobsInvalidated,
      reasons: Object.freeze(
        [...new Set(epochInvalid.jobs.map((job) => String(job.reason ?? 'NONE')))].sort(),
      ),
    };
    const profileCase = {
      relaunched: profileChanged.counts.jobsRelaunched,
      invalidated: profileChanged.counts.jobsInvalidated,
    };
    const mismatchCase = {
      candidates: withMismatch.counts.candidates,
      skipped: Object.freeze(withMismatch.skipped.map((skip) => String(skip.code))),
      selected: withMismatch.checkpointId,
    };
    const broken = await createInvalidOnlyHarness();
    let brokenCase: { readonly status: string; readonly code: string; readonly skipped: string };
    let incompatibleCase: { readonly status: string; readonly code: string };
    try {
      const result = await restoreSession(broken.repository, RESTORE_SESSION, {
        versions: RESTORE_VERSIONS,
      });
      brokenCase = {
        status: result.status,
        code: result.status === 'BLOCKED' ? String(result.code) : 'NONE',
        skipped: result.skipped[0] === undefined ? 'NONE' : String(result.skipped[0].code),
      };
      const incompatible = await restoreSession(broken.repository, RESTORE_SESSION, {
        versions: { ...RESTORE_VERSIONS, physicsVersion: 'rapier-0.22.0' },
      });
      incompatibleCase = {
        status: incompatible.status,
        code: incompatible.status === 'BLOCKED' ? String(incompatible.code) : 'NONE',
      };
    } finally {
      broken.repository.close();
    }

    const world = {
      vehicles: snapshotRows.vehicles.length,
      rides: snapshotRows.rides.length,
      passengers: snapshotRows.passengers.length,
      segments: snapshotRows.segments.length,
      learningJobs: snapshotRows.learning.pendingJobs.length,
      dispatchJobs: snapshotRows.dispatch.pending.length,
      observations: snapshotRows.learning.completedObservations.length,
    };

    return {
      world: Object.freeze(world),
      selected: Object.freeze(selected),
      launch: Object.freeze(launch),
      segments: Object.freeze(segments),
      jobs: Object.freeze(jobs),
      observations: Object.freeze(observations),
      ledger: Object.freeze(ledger),
      cases: Object.freeze({
        epochInvalid: Object.freeze(epochCase),
        profileChanged: Object.freeze(profileCase),
        envelopeMismatch: Object.freeze(mismatchCase),
        empty: empty.status,
        brokenOnly: Object.freeze(brokenCase),
        incompatible: Object.freeze(incompatibleCase),
        readOnly: fingerprintBefore === fingerprintAfter,
      }),
    };
  } finally {
    harness.repository.close();
  }
}

export async function runSessionRestoreReport(): Promise<
  RestoreReport & { readonly migration: MigrationReport }
> {
  const migration = await migrationSection();
  const restore = await restoreSection();

  const checks: RestoreReportCheck[] = [
    check('migration version', SAVE_MIGRATION_VERSION, migration.version, 'The contract is named.'),
    check(
      'migration current schema',
      2,
      migration.currentSchemaVersion,
      'The build schema version is the target of every step.',
    ),
    check(
      'migration transition 1->2',
      ['127-v2-checkpoints-and-lifecycle-indexes'],
      migration.transitions[0]?.steps,
      'Every supported transition is declared, not computed.',
    ),
    check(
      'migration transition 2->2',
      [],
      migration.transitions[1]?.steps,
      'A database already at the build version needs no step.',
    ),
    check(
      'migration status',
      'MIGRATED',
      migration.migrated.status,
      'An older save is migrated in place.',
    ),
    check(
      'migration source version',
      1,
      migration.migrated.fromVersion,
      'The source version is discovered.',
    ),
    check(
      'migration applied step',
      ['127-v2-checkpoints-and-lifecycle-indexes'],
      migration.migrated.applied,
      'Exactly the missing step ran.',
    ),
    check('migration stores', 7, migration.migrated.stores, 'Every version-1 store is exported.'),
    check('migration rows', 3, migration.migrated.rows, 'The three user rows survive the export.'),
    check(
      'migration version after',
      2,
      migration.migrated.versionAfter,
      'The database ends at the build version.',
    ),
    check(
      'migration stores after',
      8,
      migration.migrated.storesAfter,
      'The checkpoints store is added.',
    ),
    check(
      'fresh database',
      'CREATED',
      migration.fresh.status,
      'A new installation is created explicitly.',
    ),
    check(
      'fresh applied steps',
      ['127-v1-base-layout', '127-v2-checkpoints-and-lifecycle-indexes'],
      migration.fresh.applied,
      'Both declared steps ran on the fresh database.',
    ),
    check('fresh rows', 0, migration.fresh.rows, 'Nothing user-authored exists yet.'),
    check(
      'current database',
      'CURRENT',
      migration.current.status,
      'A database at the build version is not touched.',
    ),
    check('current steps', [], migration.current.applied, 'No step is applied twice.'),
    check(
      'plan refuses newer',
      'SCHEMA_TOO_NEW',
      migration.tooNew.plan,
      'A newer plan is refused.',
    ),
    check(
      'migration refuses newer',
      'SCHEMA_TOO_NEW',
      migration.tooNew.migration,
      'A newer database is refused before any layout is used.',
    ),
    check(
      'failure code',
      'MIGRATION_FAILED',
      migration.failed.code,
      'A failed upgrade is a closed code.',
    ),
    check(
      'failure untouched',
      true,
      migration.failed.untouched,
      'The row digest still matches the export.',
    ),
    check(
      'failure version',
      1,
      migration.failed.versionAfter,
      'A failed upgrade keeps the old version.',
    ),
    check(
      'failure has no checkpoint store',
      false,
      migration.failed.hasCheckpointStore,
      'A failed upgrade leaves no half-created store.',
    ),
    check(
      'failure export',
      3,
      migration.failed.exportRows,
      'The pre-migration export holds every row.',
    ),
    check(
      'failure digest',
      true,
      migration.failed.digestSameAsBefore,
      'The rows are byte-identical.',
    ),
    check(
      'recovery status',
      'RECOVERED',
      migration.recovery.status,
      'The export is a real recovery path.',
    ),
    check(
      'recovery verified',
      true,
      migration.recovery.verified,
      'Recovery verifies its own write.',
    ),
    check('recovery rows', 3, migration.recovery.rows, 'Every exported row is written.'),
    check(
      'recovery digest',
      true,
      migration.recovery.digestMatchesExport,
      'The recovered rows reproduce the export digest.',
    ),
    check(
      'recovery non-empty target',
      'RECOVERY_TARGET_NOT_EMPTY',
      migration.recovery.secondTarget,
      'Recovery never merges into existing rows.',
    ),
    check(
      'tampered export',
      'EXPORT_CHECKSUM_MISMATCH',
      migration.recovery.tampered,
      'An edited export is refused before writing.',
    ),
    check(
      'world vehicles',
      70,
      restore.world.vehicles,
      'The 206 fixture is 30 taxis + 40 civilians.',
    ),
    check('world rides', 30, restore.world.rides, 'Every passenger has a ride.'),
    check('world learning jobs', 3, restore.world.learningJobs, 'The learning queue is real.'),
    check('world dispatch jobs', 3, restore.world.dispatchJobs, 'The dispatch queue is real.'),
    check(
      'selected checkpoint',
      VALID_CHECKPOINT,
      restore.selected.checkpointId,
      'The last valid checkpoint wins over the newer broken one.',
    ),
    check('selected tick', VALID_TICK, restore.selected.tick, 'The valid tick is restored.'),
    check('candidates', 2, restore.selected.candidates, 'Both generations are considered.'),
    check(
      'skipped newest',
      [{ checkpointId: 'checkpoint-136-invalid-newest', code: 'CHECKSUM_MISMATCH' }],
      restore.selected.skipped,
      'The broken newer generation is reported, not hidden.',
    ),
    check(
      'checksum length',
      64,
      restore.selected.checksumLength,
      'The selected payload is verified.',
    ),
    check('launch mode', 'PAUSED_AUTO', restore.launch.mode, 'The restart opens paused/AUTO.'),
    check('launch paused', true, restore.launch.paused, 'The session starts paused.'),
    check('launch auto', true, restore.launch.auto, 'Every vehicle is AUTO.'),
    check('launch input released', true, restore.launch.inputReleased, 'The input is released.'),
    check(
      'launch manual vehicles',
      0,
      restore.launch.manualVehicles,
      'No vehicle stays in MANUAL.',
    ),
    check(
      'launch vehicles in auto',
      70,
      restore.launch.vehiclesInAuto,
      'All 70 vehicles are AUTO.',
    ),
    check(
      'previous manual vehicles',
      1,
      restore.launch.previousManualVehicles,
      'The previous MANUAL taxi is reported, not restored as control.',
    ),
    check('open segments', 1, restore.segments.open, 'The open manual segment is named.'),
    check(
      'incomplete segments',
      1,
      restore.segments.incomplete,
      'The open segment becomes INCOMPLETE.',
    ),
    check(
      'segment transition',
      [{ segmentId: 'segment-taxi-01', from: 'OPEN', to: 'INCOMPLETE', reason: 'RELOAD' }],
      restore.segments.entries,
      'The transition carries its exact reason.',
    ),
    check('jobs relaunched', 2, restore.jobs.relaunched, 'Only matching jobs relaunch.'),
    check('jobs invalidated', 4, restore.jobs.invalidated, 'The other jobs are invalidated.'),
    check(
      'relaunched identities',
      ['dispatch-01', 'learning-01'],
      restore.jobs.relaunchedIds,
      'The relaunched jobs are the ones in the active profile and epoch.',
    ),
    check(
      'invalidation reasons',
      ['LEARNING_EPOCH_MISMATCH', 'PROFILE_MISMATCH'],
      restore.jobs.reasons,
      'Every invalidation names its reason.',
    ),
    check(
      'observations replayed',
      2,
      restore.observations.replayed,
      'Completed observations replay.',
    ),
    check(
      'observations already rewarded',
      1,
      restore.observations.alreadyRewarded,
      'An accepted result is recognised, not paid again.',
    ),
    check(
      'ledger rows',
      2,
      restore.ledger.rows,
      'The tracker and campaign rows of the same session are read.',
    ),
    check('ledger digest length', 64, restore.ledger.digest.length, 'The ledger is digested.'),
    check('rewards reapplied', 0, restore.ledger.rewardsReapplied, 'A restart pays nothing twice.'),
    check(
      'invalid epoch',
      {
        relaunched: 0,
        invalidated: 6,
        reasons: ['LEARNING_EPOCH_MISMATCH', 'PROFILE_AND_EPOCH_MISMATCH'],
      },
      restore.cases.epochInvalid,
      'With a changed epoch every job is invalidated explicitly.',
    ),
    check(
      'changed profile',
      { relaunched: 2, invalidated: 4 },
      restore.cases.profileChanged,
      'A changed profile relaunches only its own jobs.',
    ),
    check(
      'incoherent envelope',
      {
        candidates: 3,
        skipped: ['CHECKSUM_MISMATCH', 'LEARNING_EPOCH_MISMATCH'],
        selected: VALID_CHECKPOINT,
      },
      restore.cases.envelopeMismatch,
      'An envelope mismatch is skipped with its own code.',
    ),
    check('empty session', 'EMPTY', restore.cases.empty, 'No checkpoint is not an error.'),
    check(
      'broken only',
      { status: 'BLOCKED', code: 'CHECKPOINT_INVALID', skipped: 'CHECKSUM_MISMATCH' },
      restore.cases.brokenOnly,
      'A session with no valid generation is blocked with the exact skip.',
    ),
    check(
      'incompatible versions',
      { status: 'BLOCKED', code: 'CHECKPOINT_INVALID' },
      restore.cases.incompatible,
      'Another physics version never resumes the old world.',
    ),
    check('read only', true, restore.cases.readOnly, 'Restore writes no row.'),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: SESSION_RESTORE_REPORT_VERSION,
    generatedBy: 'npm run restore:session',
    oracleRule:
      'Migrarea este dovedită pe o bază reală în memorie (versiunea 1 cu rânduri, upgrade eșuat injectat, export, recuperare și refuz), iar reluarea pe checkpointul real al writerului 206, cu o generație mai nouă coruptă intenționată; fiecare valoare așteptată este contractul documentat, fără ceas de perete și fără Math.random.',
    ...restore,
    migration,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      scenarios: 8,
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

/** Human-readable transcript rendered next to `report.json`; generated, never hand-written. */
export function sessionRestoreReportMarkdown(
  report: RestoreReport & { readonly migration: MigrationReport },
): string {
  const migration = report.migration;
  const migrationTable = rows([
    ['versiune contract', migration.version],
    ['format export', migration.exportFormat],
    ['versiune schemă curentă', migration.currentSchemaVersion],
    ['tranziție 1→2', migration.transitions[0]?.steps.join(', ')],
    [
      'tranziție 2→2',
      migration.transitions[1]?.steps.length === 0
        ? 'niciun pas'
        : migration.transitions[1]?.steps.join(', '),
    ],
    ['migrare', migration.migrated.status],
    ['pași aplicați', migration.migrated.applied.join(', ')],
    ['store-uri exportate', migration.migrated.stores],
    ['rânduri exportate', migration.migrated.rows],
    ['versiune după', migration.migrated.versionAfter],
    ['store-uri după', migration.migrated.storesAfter],
    ['bază nouă', migration.fresh.status],
    ['bază curentă', migration.current.status],
    ['plan prea nou', migration.tooNew.plan],
    ['bază prea nouă', migration.tooNew.migration],
    ['eșec', migration.failed.code],
    ['rânduri neatinse', migration.failed.untouched],
    ['versiune după eșec', migration.failed.versionAfter],
    ['store checkpoints după eșec', migration.failed.hasCheckpointStore],
    ['export pre-migrare (rânduri)', migration.failed.exportRows],
    ['digest neschimbat', migration.failed.digestSameAsBefore],
    ['recuperare', migration.recovery.status],
    ['recuperare verificată', migration.recovery.verified],
    ['rânduri recuperate', migration.recovery.rows],
    ['digest recuperat = export', migration.recovery.digestMatchesExport],
    ['recuperare peste date', migration.recovery.secondTarget],
    ['export modificat', migration.recovery.tampered],
  ]);
  const restoreTable = rows([
    ['vehicule', report.world.vehicles],
    ['curse', report.world.rides],
    ['pasageri', report.world.passengers],
    ['segmente', report.world.segments],
    ['joburi learning', report.world.learningJobs],
    ['joburi dispatch', report.world.dispatchJobs],
    ['observații finalizate', report.world.observations],
    ['checkpoint ales', report.selected.checkpointId],
    ['tick', report.selected.tick],
    ['generație', report.selected.generation],
    ['bytes', report.selected.bytes],
    ['candidați', report.selected.candidates],
    [
      'generații sărite',
      report.selected.skipped.map((entry) => `${entry.checkpointId}:${entry.code}`).join(', '),
    ],
    ['mod de pornire', report.launch.mode],
    ['input eliberat', report.launch.inputReleased],
    ['vehicule MANUAL', report.launch.manualVehicles],
    ['vehicule AUTO', report.launch.vehiclesInAuto],
    ['MANUAL anterior', report.launch.previousManualVehicles],
    ['segmente deschise', report.segments.open],
    ['segmente incomplete', report.segments.incomplete],
    ['joburi reluate', report.jobs.relaunched],
    ['joburi anulate', report.jobs.invalidated],
    ['observații reluate', report.observations.replayed],
    ['observații deja recompensate', report.observations.alreadyRewarded],
    ['rânduri ledger', report.ledger.rows],
    ['digest ledger', report.ledger.digest],
    ['recompense reaplicate', report.ledger.rewardsReapplied],
  ]);
  const casesTable = rows([
    ['epoch invalid', JSON.stringify(report.cases.epochInvalid)],
    ['profil schimbat', JSON.stringify(report.cases.profileChanged)],
    ['plic incoerent', JSON.stringify(report.cases.envelopeMismatch)],
    ['sesiune goală', report.cases.empty],
    ['doar generație coruptă', JSON.stringify(report.cases.brokenOnly)],
    ['versiuni incompatibile', JSON.stringify(report.cases.incompatible)],
    ['restaurare read-only', report.cases.readOnly],
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
    '# Raport 136 — migrare și restaurare după restart',
    '',
    `Versiune raport: \`${report.version}\`.`,
    '',
    `Generat de: \`${report.generatedBy}\`.`,
    '',
    `Regulă oracol: ${report.oracleRule}`,
    '',
    '## Migrarea schemei',
    '',
    migrationTable,
    '',
    '## Reluarea sesiunii',
    '',
    restoreTable,
    '',
    '## Scenarii',
    '',
    casesTable,
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
