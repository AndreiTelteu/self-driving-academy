import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERSISTENCE_LIMITS,
  PERSISTENCE_SCHEMA_STEPS,
  PERSISTENCE_SCHEMA_VERSION,
  PersistenceError,
  applySchemaStep,
  createMemoryIdbFactory,
  indexDefinition,
  measureJsonBytes,
  parseCheckpointRecord,
  parsePersistedRecord,
  parseProfileRecord,
  parseSettingsRecord,
  planUpgrade,
  schemaStores,
  storeDefinition,
  verifySchemaDeclaration,
} from '../../src/persistence/index';
import type { DatabasePort, FactoryPort, OpenOutcome } from '../../src/persistence/index';
import {
  FIXED_NOW,
  checkpointRecord,
  fixedClock,
  profileVersion,
  scenarioRecord,
  segmentRecord,
  settingsSnapshot,
} from './fixtures';

function throwsCode(action: () => unknown, code: string): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof PersistenceError && error.code === code;
  }
}

function openRequest(factory: FactoryPort, version: number = PERSISTENCE_SCHEMA_VERSION) {
  return factory.open({
    name: 'schema-db',
    version,
    plan: (fromVersion) => planUpgrade(fromVersion, version),
    now: fixedClock(),
  });
}

async function expectOpened(outcome: Promise<OpenOutcome> | OpenOutcome): Promise<DatabasePort> {
  const resolved = await outcome;
  assert.equal(resolved.status, 'OPENED');
  if (resolved.status !== 'OPENED') throw new Error('expected an opened database');
  return resolved.database;
}

test('127 schema declaration is contiguous and matches the documented stores and indexes', () => {
  assert.deepEqual(verifySchemaDeclaration(), []);
  assert.equal(PERSISTENCE_SCHEMA_VERSION, 2);
  assert.deepEqual(
    PERSISTENCE_SCHEMA_STEPS.map((step) => step.id),
    ['127-v1-base-layout', '127-v2-checkpoints-and-lifecycle-indexes'],
  );
  assert.deepEqual(
    schemaStores(1).map((definition) => definition.name),
    ['meta', 'profiles', 'profileActivations', 'segments', 'scenarios', 'progress', 'settings'],
  );
  assert.deepEqual(
    schemaStores(2).map((definition) => definition.name),
    [
      'meta',
      'profiles',
      'profileActivations',
      'segments',
      'scenarios',
      'progress',
      'settings',
      'checkpoints',
    ],
  );
  assert.equal(storeDefinition('profiles')?.keyPath, 'versionId');
  assert.equal(storeDefinition('settings')?.keyPath, 'playerId');
  assert.equal(storeDefinition('checkpoints')?.keyPath, 'checkpointId');
  assert.equal(indexDefinition('segments', 'bySession')?.keyPath, 'sessionId');
  assert.equal(indexDefinition('segments', 'byStatus')?.keyPath, 'status');
  assert.equal(indexDefinition('progress', 'byStatus')?.keyPath, 'status');
  assert.equal(indexDefinition('checkpoints', 'byGeneration')?.keyPath, 'generation');
  assert.equal(storeDefinition('segments', 1)?.indexes.length, 1);
  assert.equal(storeDefinition('segments', 2)?.indexes.length, 2);
});

test('127 planUpgrade is explicit, ordered and refuses a newer on-disk schema', () => {
  assert.deepEqual(
    planUpgrade(0).map((step) => step.version),
    [1, 2],
  );
  assert.deepEqual(
    planUpgrade(1).map((step) => step.version),
    [2],
  );
  assert.deepEqual(planUpgrade(2), []);
  assert(throwsCode(() => planUpgrade(3), 'SCHEMA_TOO_NEW'));
  assert.throws(() => planUpgrade(-1), /nonnegative/i);
  assert.throws(() => planUpgrade(1, 3), /Unsupported target schema version/);
});

test('127 a fresh database is created at the current version with every store and the marker', async () => {
  const factory = createMemoryIdbFactory();
  const database = await expectOpened(openRequest(factory));
  assert.equal(database.version, 2);
  const inspection = factory.inspect('schema-db');
  assert.equal(inspection?.version, 2);
  assert.deepEqual(
    inspection?.stores.map((store) => store.name),
    schemaStores().map((definition) => definition.name),
  );
  assert.deepEqual(
    inspection?.stores
      .find((store) => store.name === 'segments')
      ?.indexes.map((entry) => entry.name),
    ['bySession', 'byStatus'],
  );
  const marker = await database.transact(['meta'], 'readonly', (transaction) =>
    transaction.get('meta', 'schema'),
  );
  assert.deepEqual(marker, {
    key: 'schema',
    value: { format: 'self-driving-academy-local', schemaVersion: 1, createdAt: FIXED_NOW },
  });
  database.close();
});

test('127 upgrading from version 1 keeps rows and adds checkpoints plus lifecycle indexes', async () => {
  const factory = createMemoryIdbFactory();
  const version1 = await expectOpened(openRequest(factory, 1));
  assert.equal(version1.version, 1);
  await version1.transact(['segments'], 'readwrite', (transaction) =>
    transaction.put('segments', segmentRecord()),
  );
  version1.close();

  const outcome = await openRequest(factory);
  assert.equal(outcome.status, 'OPENED');
  if (outcome.status !== 'OPENED') return;
  assert.equal(outcome.database.version, 2);
  assert.equal(outcome.previousVersion, 1);
  assert.deepEqual(outcome.appliedMigrations, ['127-v2-checkpoints-and-lifecycle-indexes']);
  const rows = await outcome.database.transact(['segments'], 'readonly', (transaction) =>
    transaction.getAll('segments'),
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(
    factory
      .inspect('schema-db')
      ?.stores.map((store) => store.name)
      .at(-1),
    'checkpoints',
  );
  const byStatus = await outcome.database.transact(['segments'], 'readonly', (transaction) =>
    transaction.getAllByIndex('segments', 'byStatus', 'OPEN'),
  );
  assert.equal(byStatus.length, 1);
  outcome.database.close();
});

test('127 a blocked upgrade is explicit and completes when the blocking tab closes', async () => {
  const factory = createMemoryIdbFactory();
  const first = await expectOpened(openRequest(factory, 1));
  await first.transact(['segments'], 'readwrite', (transaction) =>
    transaction.put('segments', segmentRecord()),
  );

  const blocked = await openRequest(factory);
  assert.equal(blocked.status, 'BLOCKED');
  if (blocked.status !== 'BLOCKED') return;
  assert.equal(blocked.requestedVersion, 2);
  assert.equal(blocked.currentVersion, 1);
  assert.equal(factory.openConnections('schema-db'), 1);

  first.close();
  const upgraded = await blocked.whenUnblocked();
  assert.equal(upgraded.status, 'OPENED');
  if (upgraded.status !== 'OPENED') return;
  assert.equal(upgraded.database.version, 2);
  const rows = await upgraded.database.transact(['segments'], 'readonly', (transaction) =>
    transaction.getAll('segments'),
  );
  assert.equal(rows.length, 1);
  upgraded.database.close();
});

test('127 a cancelled blocked upgrade reports UPGRADE_ABORTED instead of hanging', async () => {
  const factory = createMemoryIdbFactory();
  const first = await expectOpened(openRequest(factory, 1));
  const blocked = await openRequest(factory);
  assert.equal(blocked.status, 'BLOCKED');
  if (blocked.status !== 'BLOCKED') return;
  blocked.cancel();
  const outcome = await blocked.whenUnblocked();
  assert.equal(outcome.status, 'FAILED');
  if (outcome.status !== 'FAILED') return;
  assert.equal(outcome.code, 'UPGRADE_ABORTED');
  first.close();
});

test('127 a failed migration keeps the previous version and its rows', async () => {
  const factory = createMemoryIdbFactory();
  const version1 = await expectOpened(openRequest(factory, 1));
  await version1.transact(['scenarios'], 'readwrite', (transaction) =>
    transaction.put('scenarios', scenarioRecord()),
  );
  version1.close();
  factory.failNextUpgrade();

  const failed = await openRequest(factory);
  assert.equal(failed.status, 'FAILED');
  if (failed.status !== 'FAILED') return;
  assert.equal(failed.code, 'MIGRATION_FAILED');
  const inspection = factory.inspect('schema-db');
  assert.equal(inspection?.version, 1);
  assert.equal(inspection?.stores.find((store) => store.name === 'scenarios')?.entries, 1);
  assert.equal(
    inspection?.stores.some((store) => store.name === 'checkpoints'),
    false,
  );

  const recovered = await expectOpened(openRequest(factory));
  assert.equal(recovered.version, 2);
  recovered.close();
});

test('127 an IndexedDB open error is reported as a state, not an exception', async () => {
  const factory = createMemoryIdbFactory({ failOpens: 1 });
  const outcome = await openRequest(factory);
  assert.equal(outcome.status, 'FAILED');
  if (outcome.status !== 'FAILED') return;
  assert.equal(outcome.code, 'OPEN_FAILED');
  assert.match(outcome.message, /Injected IndexedDB open failure/);
});

test('127 an older build cannot open a newer database', async () => {
  const factory = createMemoryIdbFactory();
  const database = await expectOpened(openRequest(factory));
  database.close();
  const outcome = await openRequest(factory, 1);
  assert.equal(outcome.status, 'FAILED');
  if (outcome.status !== 'FAILED') return;
  assert.equal(outcome.code, 'SCHEMA_TOO_NEW');
});

test('127 a failing transaction rolls back every store it touched', async () => {
  const factory = createMemoryIdbFactory();
  const database = await expectOpened(openRequest(factory));
  await database
    .transact(['segments', 'progress'], 'readwrite', async (transaction) => {
      await transaction.put('segments', segmentRecord());
      await transaction.put('progress', {
        ...segmentRecord(),
        recordKind: 'PROGRESS',
        recordId: 'p-1',
        status: 'ACTIVE',
      });
      throw new PersistenceError('TRANSACTION_ABORTED', 'halfway failure');
    })
    .catch((error: unknown) => {
      assert(error instanceof PersistenceError);
    });
  const rows = await database.transact(
    ['segments', 'progress'],
    'readonly',
    async (transaction) => ({
      segments: (await transaction.getAll('segments')).length,
      progress: (await transaction.getAll('progress')).length,
    }),
  );
  assert.deepEqual(rows, { segments: 0, progress: 0 });
  database.close();
});

test('127 a read-only transaction cannot write and unknown stores are refused', async () => {
  const factory = createMemoryIdbFactory();
  const database = await expectOpened(openRequest(factory));
  await assert.rejects(
    database.transact(['segments'], 'readonly', (transaction) =>
      transaction.put('segments', segmentRecord()),
    ),
    (error: unknown) => error instanceof PersistenceError && error.code === 'WRITER_REQUIRED',
  );
  await assert.rejects(
    database.transact(['segments'], 'readonly', (transaction) =>
      transaction.getAllByIndex('segments', 'byGeneration', '1'),
    ),
    (error: unknown) => error instanceof PersistenceError && error.code === 'UNKNOWN_INDEX',
  );
  database.close();
  await assert.rejects(
    database.transact(['segments'], 'readonly', (transaction) => transaction.getAll('segments')),
    (error: unknown) => error instanceof PersistenceError && error.code === 'REPOSITORY_CLOSED',
  );
});

test('127 schema steps refuse to re-create a store or index a missing one', () => {
  const created: string[] = [];
  const upgrader = {
    hasStore: (name: string) => created.includes(name),
    createStore: (definition: { name: string }) => {
      created.push(definition.name);
    },
    deleteStore: () => undefined,
    createIndex: () => undefined,
    put: () => undefined,
  };
  const step = PERSISTENCE_SCHEMA_STEPS[0];
  applySchemaStep(upgrader, step, fixedClock());
  assert.deepEqual(
    created,
    schemaStores(1).map((definition) => definition.name),
  );
  assert.throws(() => applySchemaStep(upgrader, step, fixedClock()), /already exists/);
});

test('127 record envelopes reject unknown fields, non-JSON data and invalid lifecycles', () => {
  assert(
    throwsCode(
      () => parsePersistedRecord({ ...segmentRecord(), extra: true }, 'SEGMENT'),
      'INVALID_RECORD',
    ),
  );
  assert(
    throwsCode(
      () => parsePersistedRecord({ ...segmentRecord(), status: 'ACTIVE' }, 'SEGMENT'),
      'INVALID_RECORD',
    ),
  );
  assert(
    throwsCode(
      () => parsePersistedRecord({ ...scenarioRecord(), status: 'OPEN' }, 'SCENARIO'),
      'INVALID_RECORD',
    ),
  );
  assert(
    throwsCode(
      () => parsePersistedRecord({ ...segmentRecord(), recordKind: 'PROGRESS' }, 'SEGMENT'),
      'INVALID_RECORD',
    ),
  );
  assert(
    throwsCode(
      () =>
        parsePersistedRecord(
          {
            ...segmentRecord(),
            body: JSON.parse('{"__proto__":{"polluted":true}}') as unknown,
          },
          'SEGMENT',
        ),
      'BODY_INVALID',
    ),
  );
  assert(
    throwsCode(
      () =>
        parsePersistedRecord(
          { ...segmentRecord(), body: { sample: () => undefined } as unknown },
          'SEGMENT',
        ),
      'BODY_INVALID',
    ),
  );
  assert(
    throwsCode(
      () => parsePersistedRecord({ ...segmentRecord(), createdAt: 'yesterday' }, 'SEGMENT'),
      'INVALID_RECORD',
    ),
  );
  assert(
    throwsCode(
      () =>
        parsePersistedRecord(
          { ...segmentRecord(), body: { value: Number.POSITIVE_INFINITY } },
          'SEGMENT',
        ),
      'BODY_INVALID',
    ),
  );
  assert(
    throwsCode(
      () =>
        parsePersistedRecord(
          { ...segmentRecord(), body: { text: 'x'.repeat(PERSISTENCE_LIMITS.maxBodyBytes) } },
          'SEGMENT',
        ),
      'BODY_TOO_LARGE',
    ),
  );
  let deep: Record<string, unknown> = { leaf: 1 };
  for (let depth = 0; depth < PERSISTENCE_LIMITS.maxBodyDepth + 2; depth += 1) {
    deep = { nested: deep };
  }
  assert(
    throwsCode(
      () => parsePersistedRecord({ ...segmentRecord(), body: deep }, 'SEGMENT'),
      'BODY_INVALID',
    ),
  );
  const parsed = parsePersistedRecord(
    { ...segmentRecord(), bodyBytes: measureJsonBytes(segmentRecord().body) },
    'SEGMENT',
  );
  assert.equal(parsed.bodyBytes, measureJsonBytes(parsed.body));
  assert(
    throwsCode(
      () => parsePersistedRecord({ ...segmentRecord(), bodyBytes: 1 }, 'SEGMENT'),
      'BODY_INVALID',
    ),
  );
});

test('127 the stored profile version must still match its 109 checksum', () => {
  const profile = profileVersion();
  assert.equal(parseProfileRecord(profile).checksum, profile.checksum);
  assert(
    throwsCode(
      () => parseProfileRecord({ ...profile, checksum: 'fnv1a64:0000000000000000' }),
      'PROFILE_CHECKSUM_MISMATCH',
    ),
  );
  assert(
    throwsCode(
      () =>
        parseProfileRecord({
          ...profile,
          provenance: {
            origin: 'BASE',
            sourceSegmentIds: [],
            sourceInterventionIds: [],
            delta: null,
          },
          parentVersionId: 'profile-1@0',
          depth: 0,
        }),
      'INVALID_RECORD',
    ),
  );
});

test('127 checkpoint and settings records carry the metadata later PBIs rely on', () => {
  const checkpoint = parseCheckpointRecord(checkpointRecord());
  assert.equal(checkpoint.checkpointId, 'checkpoint-1');
  assert.equal(checkpoint.tick, 120);
  assert.equal(checkpoint.generation, 1);
  assert.equal(checkpoint.bodyBytes, measureJsonBytes(checkpoint.body));
  assert(
    throwsCode(
      () => parseCheckpointRecord({ ...checkpointRecord(), generation: -1 }),
      'INVALID_RECORD',
    ),
  );
  assert(
    throwsCode(
      () => parseCheckpointRecord({ ...checkpointRecord(), engineVersion: '' }),
      'INVALID_RECORD',
    ),
  );
  const settings = parseSettingsRecord(settingsSnapshot());
  assert.equal(settings.playerId, 'player-1');
  assert.equal(settings.input.control.mappingVersion, '025-keyboard-v1');
  assert.throws(() => parseSettingsRecord({ playerId: 'player-1' }), /fields|Missing/i);
});
