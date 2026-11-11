import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERSISTENCE_SCHEMA_VERSION,
  SAVE_MIGRATION_EXPORT_FORMAT,
  SAVE_MIGRATION_EXPORT_FORMAT_VERSION,
  SAVE_MIGRATION_VERSION,
  buildSaveMigrationExport,
  createMemoryIdbFactory,
  migrateSaveDatabase,
  readSaveMigrationExport,
  recoverSaveMigration,
  saveMigrationPlan,
  saveMigrationRowsDigest,
  saveMigrationStores,
  storeDefinition,
} from '../../src/persistence/index';
import type {
  FactoryPort,
  MemoryIdbFactory,
  OpenOutcome,
  SaveMigrationExport,
  SaveMigrationStoreRows,
} from '../../src/persistence/index';
import { FIXED_NOW, fixedClock, segmentRecord, settingsSnapshot } from './fixtures';

/**
 * PBI 136 migration tests: every supported transition is exercised, a newer database is refused,
 * a failed upgrade leaves the rows byte-identical, the pre-migration export is a real recovery
 * source, and recovery into a non-empty target is refused.
 */

const DB = '136-save-migration-db';

async function openRaw(
  factory: FactoryPort,
  dbName: string,
  version: number,
): Promise<OpenOutcome> {
  return factory.open({
    name: dbName,
    version,
    plan: (fromVersion) => saveMigrationPlan(fromVersion).filter((step) => step.version <= version),
    now: fixedClock(),
  });
}

async function readAll(
  factory: FactoryPort,
  dbName: string,
  version: number,
): Promise<readonly SaveMigrationStoreRows[]> {
  const opened = await openRaw(factory, dbName, version);
  if (opened.status !== 'OPENED') throw new Error(`open at ${version} failed: ${opened.status}`);
  try {
    const stores = saveMigrationStores(version);
    return await opened.database.transact(stores, 'readonly', async (transaction) => {
      const result: SaveMigrationStoreRows[] = [];
      for (const name of stores) {
        const rows = await transaction.getAll(name);
        const kept =
          name === 'meta'
            ? rows.filter((row) => {
                if (typeof row !== 'object' || row === null) return true;
                return (row as Record<string, unknown>).key !== 'schema';
              })
            : rows;
        result.push(
          Object.freeze({
            name,
            keyPath: storeDefinition(name, version)?.keyPath ?? name,
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

/** Creates a real version-1 database with rows in four stores, exactly as an older build left it. */
async function seedVersionOne(factory: MemoryIdbFactory, dbName = DB): Promise<void> {
  const opened = await openRaw(factory, dbName, 1);
  if (opened.status !== 'OPENED') throw new Error(`seed open failed: ${opened.status}`);
  try {
    await opened.database.transact(
      ['meta', 'profiles', 'segments', 'settings'],
      'readwrite',
      async (transaction) => {
        await transaction.put('meta', {
          key: 'schema',
          value: {
            format: 'self-driving-academy-local',
            schemaVersion: 1,
            createdAt: FIXED_NOW,
          },
        });
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

test('the migration plan is explicit and refuses a newer database', () => {
  assert.deepEqual(
    saveMigrationPlan(0).map((step) => [step.version, step.id]),
    [
      [1, '127-v1-base-layout'],
      [2, '127-v2-checkpoints-and-lifecycle-indexes'],
    ],
  );
  assert.deepEqual(
    saveMigrationPlan(1).map((step) => [step.version, step.id]),
    [[2, '127-v2-checkpoints-and-lifecycle-indexes']],
  );
  assert.deepEqual(saveMigrationPlan(PERSISTENCE_SCHEMA_VERSION), []);
  assert.throws(() => saveMigrationPlan(3), /newer than 2/);
  assert.equal(saveMigrationStores(1).includes('checkpoints'), false);
  assert.equal(saveMigrationStores(2).includes('checkpoints'), true);
  assert.equal(SAVE_MIGRATION_VERSION, '136-save-migration-v1');
});

test('a fresh database is created at the build version in two declared steps', async () => {
  const factory = createMemoryIdbFactory();
  const result = await migrateSaveDatabase({ factory, database: DB, now: fixedClock() });
  assert.equal(result.status, 'CREATED');
  assert.equal(result.fromVersion, 0);
  assert.equal(result.toVersion, PERSISTENCE_SCHEMA_VERSION);
  assert.deepEqual(result.applied, [
    '127-v1-base-layout',
    '127-v2-checkpoints-and-lifecycle-indexes',
  ]);
  assert.equal(result.counts.rows, 0);
  assert.equal(result.export?.format, SAVE_MIGRATION_EXPORT_FORMAT);
  assert.equal(result.export?.formatVersion, SAVE_MIGRATION_EXPORT_FORMAT_VERSION);
  assert.equal(result.export?.counts.stores, 7);
  assert.equal(factory.inspect(DB)?.version, PERSISTENCE_SCHEMA_VERSION);
});

test('a version-1 save migrates in place and every row survives byte for byte', async () => {
  const factory = createMemoryIdbFactory();
  await seedVersionOne(factory);
  const before = await readAll(factory, DB, 1);
  const digestBefore = saveMigrationRowsDigest(before);
  const result = await migrateSaveDatabase({ factory, database: DB, now: fixedClock() });
  assert.equal(result.status, 'MIGRATED');
  assert.equal(result.fromVersion, 1);
  assert.deepEqual(result.applied, ['127-v2-checkpoints-and-lifecycle-indexes']);
  assert.equal(result.counts.stores, 7);
  assert.equal(result.counts.rows, 3);
  assert.equal(result.export?.sourceSchemaVersion, 1);
  assert.equal(result.export?.targetSchemaVersion, 2);
  assert.equal(result.export?.digest, digestBefore);
  assert.equal(factory.inspect(DB)?.version, PERSISTENCE_SCHEMA_VERSION);

  const after = await readAll(factory, DB, 2);
  const kept = after.filter((store) => store.name !== 'checkpoints');
  assert.equal(saveMigrationRowsDigest(kept), digestBefore);
  assert.equal(after.find((store) => store.name === 'checkpoints')?.rows.length, 0);
  assert.equal(
    (after.find((store) => store.name === 'segments')?.rows[0] as { recordId?: string }).recordId,
    'segment-1',
  );
});

test('a database already at the build version is CURRENT with zero steps', async () => {
  const factory = createMemoryIdbFactory();
  await seedVersionOne(factory);
  await migrateSaveDatabase({ factory, database: DB, now: fixedClock() });
  const rowsBefore = await readAll(factory, DB, 2);
  const digestBefore = saveMigrationRowsDigest(rowsBefore);

  const second = await migrateSaveDatabase({ factory, database: DB, now: fixedClock() });
  assert.equal(second.status, 'CURRENT');
  assert.equal(second.fromVersion, PERSISTENCE_SCHEMA_VERSION);
  assert.deepEqual(second.applied, []);
  assert.equal(second.export, null);
  assert.equal(saveMigrationRowsDigest(await readAll(factory, DB, 2)), digestBefore);
});

test('a database newer than the build is refused instead of being opened', async () => {
  const result = await migrateSaveDatabase({
    factory: newerFactory(),
    database: DB,
    now: fixedClock(),
  });
  assert.equal(result.status, 'FAILED');
  if (result.status === 'FAILED') {
    assert.equal(result.code, 'SCHEMA_TOO_NEW');
    assert.equal(result.export, null);
    assert.equal(result.untouched, false);
    assert.match(result.message, /newer than this build/);
  }
});

test('a failed migration leaves the version and rows untouched and still exports them', async () => {
  const factory = createMemoryIdbFactory();
  await seedVersionOne(factory);
  const before = await readAll(factory, DB, 1);
  const digestBefore = saveMigrationRowsDigest(before);

  factory.failNextUpgrade(1);
  const result = await migrateSaveDatabase({ factory, database: DB, now: fixedClock() });
  assert.equal(result.status, 'FAILED');
  if (result.status !== 'FAILED') return;
  assert.equal(result.code, 'MIGRATION_FAILED');
  assert.equal(result.fromVersion, 1);
  assert.equal(result.untouched, true);
  assert.notEqual(result.export, null);
  assert.equal(result.export?.digest, digestBefore);
  assert.equal(factory.inspect(DB)?.version, 1);
  assert.equal(
    factory.inspect(DB)?.stores.some((store) => store.name === 'checkpoints'),
    false,
  );
  assert.equal(saveMigrationRowsDigest(await readAll(factory, DB, 1)), digestBefore);

  // The failure is not a dead end: the export is a real recovery source.
  const restored = await recoverSaveMigration(result.export, {
    factory: createMemoryIdbFactory(),
    database: '136-save-migration-recovered',
    now: fixedClock(),
  });
  assert.equal(restored.status, 'RECOVERED');
  if (restored.status === 'RECOVERED') {
    assert.equal(restored.verified, true);
    assert.equal(restored.digest, digestBefore);
    assert.equal(restored.counts.rows, 3);
    assert.equal(restored.checksum.length, 64);
  }
});

test('recovered rows reproduce the exported state and the database is usable', async () => {
  const source = createMemoryIdbFactory();
  await seedVersionOne(source);
  const exported = await migrateSaveDatabase({ factory: source, database: DB, now: fixedClock() });
  assert.equal(exported.status, 'MIGRATED');
  if (exported.status !== 'MIGRATED' || exported.export === null) return;

  const factory = createMemoryIdbFactory();
  const recovered = await recoverSaveMigration(exported.export, {
    factory,
    database: '136-save-migration-target',
    now: fixedClock(),
  });
  assert.equal(recovered.status, 'RECOVERED');
  const restoredRows = await readAll(factory, '136-save-migration-target', 2);
  const exportedNames = new Set(exported.export.stores.map((store) => store.name));
  assert.equal(
    saveMigrationRowsDigest(restoredRows.filter((store) => exportedNames.has(store.name))),
    exported.export.digest,
  );
  assert.equal(
    (restoredRows.find((store) => store.name === 'settings')?.rows[0] as { playerId?: string })
      .playerId,
    'player-1',
  );

  const second = await migrateSaveDatabase({
    factory,
    database: '136-save-migration-target',
    now: fixedClock(),
  });
  assert.equal(second.status, 'CURRENT');
});

test('recovery refuses a non-empty target', async () => {
  const source = createMemoryIdbFactory();
  await seedVersionOne(source);
  const exported = await migrateSaveDatabase({ factory: source, database: DB, now: fixedClock() });
  assert.equal(exported.status, 'MIGRATED');
  if (exported.status !== 'MIGRATED' || exported.export === null) return;

  const factory = createMemoryIdbFactory();
  const first = await recoverSaveMigration(exported.export, {
    factory,
    database: DB,
    now: fixedClock(),
  });
  assert.equal(first.status, 'RECOVERED');
  const second = await recoverSaveMigration(exported.export, {
    factory,
    database: DB,
    now: fixedClock(),
  });
  assert.equal(second.status, 'FAILED');
  if (second.status === 'FAILED') assert.equal(second.code, 'RECOVERY_TARGET_NOT_EMPTY');
});

test('an edited export is refused before any row is written', async () => {
  const source = createMemoryIdbFactory();
  await seedVersionOne(source);
  const exported = await migrateSaveDatabase({ factory: source, database: DB, now: fixedClock() });
  assert.equal(exported.status, 'MIGRATED');
  if (exported.status !== 'MIGRATED' || exported.export === null) return;
  const document = exported.export;

  const edited: SaveMigrationExport = {
    ...document,
    stores: document.stores.map((store) =>
      store.name === 'segments'
        ? {
            ...store,
            rows: [{ ...(store.rows[0] as Record<string, unknown>), revision: 99 }],
          }
        : store,
    ),
  };
  const read = readSaveMigrationExport(edited);
  assert.equal(read.status, 'REJECTED');
  if (read.status === 'REJECTED') assert.equal(read.code, 'EXPORT_CHECKSUM_MISMATCH');

  const factory = createMemoryIdbFactory();
  const recovered = await recoverSaveMigration(edited, {
    factory,
    database: DB,
    now: fixedClock(),
  });
  assert.equal(recovered.status, 'FAILED');
  if (recovered.status === 'FAILED') assert.equal(recovered.code, 'EXPORT_CHECKSUM_MISMATCH');
  assert.equal(factory.inspect(DB), null);
});

test('an export written by a newer schema is refused', () => {
  const result = readSaveMigrationExport({
    format: SAVE_MIGRATION_EXPORT_FORMAT,
    formatVersion: SAVE_MIGRATION_EXPORT_FORMAT_VERSION,
    formatId: 'self-driving-academy-local',
    database: DB,
    sourceSchemaVersion: 3,
    targetSchemaVersion: 3,
    createdAt: FIXED_NOW,
    digest: 'a'.repeat(64),
    counts: { stores: 0, rows: 0 },
    stores: [],
    checksum: {
      algorithm: 'SHA-256',
      canonicalization: 'SDA-CJSON-1',
      value: 'b'.repeat(64),
    },
  });
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') assert.equal(result.code, 'SCHEMA_TOO_NEW');
});

test('the export carries a canonical checksum a reader recomputes', async () => {
  const factory = createMemoryIdbFactory();
  await seedVersionOne(factory);
  const rows = await readAll(factory, DB, 1);
  const built = buildSaveMigrationExport({
    database: DB,
    sourceSchemaVersion: 1,
    targetSchemaVersion: PERSISTENCE_SCHEMA_VERSION,
    createdAt: FIXED_NOW,
    stores: rows,
  });
  assert.equal(built.status, 'ACCEPTED');
  if (built.status !== 'ACCEPTED') return;
  const text = JSON.stringify(built.document);
  const read = readSaveMigrationExport(text);
  assert.equal(read.status, 'ACCEPTED');
  if (read.status === 'ACCEPTED') {
    assert.equal(read.document.checksum.value, built.document.checksum.value);
    assert.equal(read.document.digest, built.digest);
    assert.equal(read.bytes, text.length);
  }
});
