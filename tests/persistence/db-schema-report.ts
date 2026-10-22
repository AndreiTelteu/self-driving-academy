import {
  PERSISTENCE_DB_NAME,
  PERSISTENCE_LIMITS,
  PERSISTENCE_SCHEMA_STEPS,
  PERSISTENCE_SCHEMA_VERSION,
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  measureJsonBytes,
  planUpgrade,
  schemaStores,
} from '../../src/persistence/index';
import type {
  DatabasePort,
  LocalRepository,
  MemoryIdbFactory,
  OpenOutcome,
} from '../../src/persistence/index';
import {
  activation,
  checkpointRecord,
  fixedClock,
  profileVersion,
  progressRecord,
  scenarioRecord,
  segmentRecord,
  settingsSnapshot,
} from './fixtures';

/**
 * Deterministic transcript of PBI 127.
 *
 * Every row is the result of a real run against the in-memory IndexedDB double: no wall clock, no
 * random ids, no timing values. `npm run` is not used by the report itself, so the same input
 * always produces the same bytes and the committed evidence can be verified with `--check`.
 */
export interface SchemaCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface DbSchemaReport {
  readonly version: '127-db-schema-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  /** The stable name the game uses; the report itself works on a sandbox name. */
  readonly productionDatabase: string;
  readonly sandboxDatabase: string;
  readonly schema: {
    readonly currentVersion: number;
    readonly steps: readonly {
      readonly version: number;
      readonly id: string;
      readonly creates: readonly string[];
      readonly indexes: readonly string[];
      readonly drops: readonly string[];
    }[];
    readonly stores: readonly {
      readonly name: string;
      readonly keyPath: string;
      readonly indexes: readonly {
        readonly name: string;
        readonly keyPath: string;
        readonly unique: boolean;
      }[];
    }[];
  };
  readonly freshDatabase: {
    readonly status: string;
    readonly version: number | null;
    readonly previousVersion: number | null;
    readonly appliedMigrations: readonly string[];
    readonly role: string;
    readonly stores: readonly string[];
    readonly marker: unknown;
  };
  readonly upgrade: {
    readonly fromVersion: number;
    readonly toVersion: number;
    readonly appliedMigrations: readonly string[];
    readonly rowsBefore: number;
    readonly rowsAfter: number;
    readonly addedStores: readonly string[];
    readonly addedIndexes: readonly string[];
    readonly indexHits: number;
  };
  readonly blockedUpgrade: {
    readonly repositoryState: string;
    readonly reason: string | null;
    readonly requestedVersion: number;
    readonly currentVersion: number;
    readonly openConnectionsWhileBlocked: number;
    readonly afterCloseStatus: string;
    readonly afterCloseVersion: number | null;
  };
  readonly versionChange: {
    readonly state: string;
    readonly reason: string | null;
    readonly role: string;
    readonly initialStatus: string;
    readonly openConnectionsAfter: number;
    readonly writeAfterRelease: string;
    readonly reopenedStatus: string;
  };
  readonly writer: {
    readonly firstTabRole: string;
    readonly secondTabRole: string;
    readonly secondTabReason: string | null;
    readonly waitingRole: string;
    readonly transferRole: string;
    readonly writeDeniedBeforeTransfer: string;
    readonly writeCommittedAfterTransfer: string;
    readonly previousWriterRole: string;
  };
  readonly openFailure: {
    readonly status: string;
    readonly code: string | null;
    readonly repositoryState: string;
  };
  readonly unavailableLocks: {
    readonly role: string;
    readonly writeResult: string;
  };
  readonly transactions: {
    readonly committedStores: number;
    readonly rolledBackSegments: number;
    readonly rolledBackProgress: number;
    readonly orphanActivation: string;
    readonly activationRowsAfterOrphan: number;
    readonly staleRevision: string;
    readonly immutableProfile: string;
    readonly checksumMismatch: string;
    readonly idempotentProfile: string;
    readonly oversizedBody: string;
    readonly listLimit: string;
  };
  readonly bounds: {
    readonly bodyBytes: number;
    readonly maxBodyBytes: number;
    readonly maxRecordBytes: number;
    readonly maxListEntries: number;
    readonly maxBodyDepth: number;
  };
  readonly checks: readonly SchemaCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

const NOW = fixedClock();
const DB = '127-report-db';

function sequence(): {
  factory: MemoryIdbFactory;
  locks: ReturnType<typeof createMemoryLockManager>;
} {
  return { factory: createMemoryIdbFactory(), locks: createMemoryLockManager() };
}

function tab(
  origin: { factory: MemoryIdbFactory; locks: ReturnType<typeof createMemoryLockManager> },
  tabId: string,
  maxListEntries?: number,
): LocalRepository {
  return createLocalRepository({
    factory: origin.factory,
    locks: origin.locks,
    dbName: DB,
    tabId,
    now: NOW,
    ...(maxListEntries === undefined ? {} : { maxListEntries }),
  });
}

async function openAtVersion(factory: MemoryIdbFactory, version: number): Promise<DatabasePort> {
  const outcome: OpenOutcome = await factory.open({
    name: DB,
    version,
    plan: (fromVersion) => planUpgrade(fromVersion, version),
    now: NOW,
  });
  if (outcome.status !== 'OPENED') throw new Error(`open v${version} failed: ${outcome.status}`);
  return outcome.database;
}

export async function runDbSchemaReport(): Promise<DbSchemaReport> {
  const checks: SchemaCheck[] = [];
  const check = (name: string, expected: unknown, actual: unknown, detail: string): void => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    checks.push({ name, expected, actual, pass, detail });
  };

  // 1. Declarations.
  const schema = {
    currentVersion: PERSISTENCE_SCHEMA_VERSION,
    steps: PERSISTENCE_SCHEMA_STEPS.map((step) => ({
      version: step.version,
      id: step.id,
      creates: step.create.map((definition) => definition.name),
      indexes: step.indexes.map((entry) => `${entry.store}.${entry.index.name}`),
      drops: [...step.drop],
    })),
    stores: schemaStores().map((definition) => ({
      name: definition.name,
      keyPath: definition.keyPath,
      indexes: definition.indexes.map((entry) => ({
        name: entry.name,
        keyPath: entry.keyPath,
        unique: entry.unique,
      })),
    })),
  };

  // 2. A fresh database.
  const fresh = sequence();
  const freshRepository = tab(fresh, 'tab-fresh');
  const freshOpen = await freshRepository.open();
  const freshInspection = fresh.factory.inspect(DB);
  const freshMarker = await fresh.factory.open({
    name: DB,
    version: PERSISTENCE_SCHEMA_VERSION,
    plan: (fromVersion) => planUpgrade(fromVersion),
    now: NOW,
  });
  let marker: unknown = null;
  if (freshMarker.status === 'OPENED') {
    marker = await freshMarker.database.transact(['meta'], 'readonly', (transaction) =>
      transaction.get('meta', 'schema'),
    );
    freshMarker.database.close();
  }
  freshRepository.close();

  // 3. Upgrade from the version 1 layout with existing rows.
  const upgradeOrigin = sequence();
  const legacy = await openAtVersion(upgradeOrigin.factory, 1);
  await legacy.transact(['segments'], 'readwrite', (transaction) =>
    transaction.put('segments', segmentRecord()),
  );
  const rowsBefore = await legacy
    .transact(['segments'], 'readonly', (transaction) => transaction.getAll('segments'))
    .then((rows) => rows.length);
  legacy.close();
  const upgradedRepository = tab(upgradeOrigin, 'tab-upgrade');
  const upgradedOpen = await upgradedRepository.open();
  const upgradeInspection = upgradeOrigin.factory.inspect(DB);
  const upgradedRows = await upgradedRepository.listSegments('session-1');
  const upgradeIndexHits = (await upgradedRepository.listSegmentsByStatus('OPEN')).length;
  const addedStores = (upgradeInspection?.stores ?? [])
    .map((store) => store.name)
    .filter((name) => !schemaStores(1).some((definition) => definition.name === name));
  upgradedRepository.close();

  // 4. A blocked upgrade with a second connection still open.
  const blockedOrigin = sequence();
  const blocking = await openAtVersion(blockedOrigin.factory, 1);
  const blockedRepository = tab(blockedOrigin, 'tab-blocked');
  const blockedReport = await blockedRepository.open();
  const blockedStatus = blockedRepository.status();
  const connectionsWhileBlocked = blockedOrigin.factory.openConnections(DB);
  blocking.close();
  const afterClose = await blockedRepository.retryBlockedUpgrade();
  blockedRepository.close();

  // 5. A version change requested by a newer tab.
  const changeOrigin = sequence();
  const changedRepository = tab(changeOrigin, 'tab-change');
  const changeOpen = await changedRepository.open();
  changeOrigin.factory.notifyVersionChange(DB, PERSISTENCE_SCHEMA_VERSION + 1);
  const changedStatus = changedRepository.status();
  const writeAfterRelease = await changedRepository.putSegment(segmentRecord());
  const openConnectionsAfter = changeOrigin.factory.openConnections(DB);
  const reopened = await changedRepository.open();
  changedRepository.close();

  // 6. Two tabs and an explicit transfer of the writer role.
  const writerOrigin = sequence();
  const firstTab = tab(writerOrigin, 'tab-a');
  const firstOpen = await firstTab.open();
  const secondTab = tab(writerOrigin, 'tab-b');
  const secondOpen = await secondTab.open();
  const secondTabReason = secondTab.status().reason;
  const deniedBeforeTransfer = await secondTab.putScenario(scenarioRecord());
  const waiting = secondTab.waitForWriter();
  const waitingRole = secondTab.status().role;
  const previousWriter = firstTab.releaseWriter();
  const transferred = await waiting;
  const committedAfterTransfer = await secondTab.putScenario(scenarioRecord());
  const previousWriterWrite = await firstTab.putScenario(scenarioRecord());
  firstTab.close();
  secondTab.close();

  // 7. An open failure injected by the browser surface.
  const failureOrigin = sequence();
  failureOrigin.factory.failNextOpen();
  const failingRepository = tab(failureOrigin, 'tab-failing');
  const failedOpen = await failingRepository.open();
  const failedStatus = failingRepository.status();
  failingRepository.close();

  // 8. Web Locks unavailable: read-only page, no unsafe fallback.
  const unlockedOrigin = {
    factory: createMemoryIdbFactory(),
    locks: createMemoryLockManager({ available: false }),
  };
  const unlockedRepository = tab(unlockedOrigin, 'tab-unlocked');
  const unlockedOpen = await unlockedRepository.open();
  const unlockedWrite = await unlockedRepository.putSegment(segmentRecord());
  unlockedRepository.close();

  // 9. Transactions: one commit, one rollback and the guarded writes.
  const transactionOrigin = sequence();
  const transactional = tab(transactionOrigin, 'tab-transactions');
  await transactional.open();
  await transactional.putProfile(profileVersion());
  const idempotent = await transactional.putProfile(profileVersion());
  const immutable = await transactional.putProfile(profileVersion({ parameters: { speed: 11 } }));
  const corrupt = await transactional.putProfile({
    ...profileVersion(),
    checksum: 'fnv1a64:0000000000000000',
  });
  const orphan = await transactional.activateProfile(activation({ versionId: 'profile-1@9' }));
  const activationRowsAfterOrphan = (await transactional.stats()).counts.profileActivations;
  await transactional.putSegment(segmentRecord({ revision: 2 }));
  const staleRevision = await transactional.putSegment(segmentRecord({ revision: 2 }));
  const oversized = await transactional.putScenario(
    scenarioRecord({ body: { blob: 'x'.repeat(PERSISTENCE_LIMITS.maxBodyBytes + 1024) } }),
  );
  const boundedOrigin = sequence();
  const boundedRepository = tab(boundedOrigin, 'tab-bounded', 2);
  await boundedRepository.open();
  for (const id of ['a', 'b', 'c']) {
    await boundedRepository.putSegment(segmentRecord({ recordId: `segment-${id}`, body: { id } }));
  }
  let listLimit = 'NO_ERROR';
  try {
    await boundedRepository.listSegments('session-1');
  } catch (error) {
    listLimit = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';
  }
  boundedRepository.close();
  await transactional.putSettings(settingsSnapshot());
  await transactional.putProgress(progressRecord());
  await transactional.putCheckpoint(checkpointRecord());
  const transactionalStats = await transactional.stats();
  transactional.close();

  const rollbackOrigin = sequence();
  const rollbackDatabase = await openAtVersion(rollbackOrigin.factory, PERSISTENCE_SCHEMA_VERSION);
  await rollbackDatabase
    .transact(['segments', 'progress'], 'readwrite', async (transaction) => {
      await transaction.put('segments', segmentRecord());
      await transaction.put('progress', progressRecord());
      throw new Error('injected halfway failure');
    })
    .catch(() => undefined);
  const rollbackCounts = await rollbackDatabase.transact(
    ['segments', 'progress'],
    'readonly',
    async (transaction) => ({
      segments: (await transaction.getAll('segments')).length,
      progress: (await transaction.getAll('progress')).length,
    }),
  );
  rollbackDatabase.close();

  const sampleBody = segmentRecord().body;
  const report: DbSchemaReport = {
    version: '127-db-schema-v1',
    generatedBy: 'node --import ./scripts/register-typescript.mjs scripts/run-db-schema-report.mjs',
    oracleRule:
      'Every row is a real run of src/persistence against the in-memory IndexedDB double; the expected value is the documented contract, never a copy of the actual one.',
    productionDatabase: PERSISTENCE_DB_NAME,
    sandboxDatabase: DB,
    schema,
    freshDatabase: {
      status: freshOpen.status,
      version: freshOpen.version,
      previousVersion: freshOpen.previousVersion,
      appliedMigrations: freshOpen.appliedMigrations,
      role: freshOpen.role,
      stores: (freshInspection?.stores ?? []).map((store) => store.name),
      marker,
    },
    upgrade: {
      fromVersion: 1,
      toVersion: upgradedOpen.version ?? 0,
      appliedMigrations: upgradedOpen.appliedMigrations,
      rowsBefore,
      rowsAfter: upgradedRows.length,
      addedStores,
      addedIndexes: ['segments.byStatus', 'progress.byStatus'],
      indexHits: upgradeIndexHits,
    },
    blockedUpgrade: {
      repositoryState: blockedStatus.state,
      reason: blockedReport.rejection?.code ?? null,
      requestedVersion: 2,
      currentVersion: 1,
      openConnectionsWhileBlocked: connectionsWhileBlocked,
      afterCloseStatus: afterClose.status,
      afterCloseVersion: afterClose.version,
    },
    versionChange: {
      state: changedStatus.state,
      reason: changedStatus.reason,
      role: changedStatus.role,
      initialStatus: changeOpen.status,
      openConnectionsAfter,
      writeAfterRelease: writeAfterRelease.status,
      reopenedStatus: reopened.status,
    },
    writer: {
      firstTabRole: firstOpen.role,
      secondTabRole: secondOpen.role,
      secondTabReason: secondTabReason,
      waitingRole,
      transferRole: transferred.role,
      writeDeniedBeforeTransfer: deniedBeforeTransfer.status,
      writeCommittedAfterTransfer: committedAfterTransfer.status,
      previousWriterRole: previousWriter.role,
    },
    openFailure: {
      status: failedOpen.status,
      code: failedOpen.rejection?.code ?? null,
      repositoryState: failedStatus.state,
    },
    unavailableLocks: {
      role: unlockedOpen.role,
      writeResult: unlockedWrite.status,
    },
    transactions: {
      committedStores: Object.values(transactionalStats.counts).filter((count) => count > 0).length,
      rolledBackSegments: rollbackCounts.segments,
      rolledBackProgress: rollbackCounts.progress,
      orphanActivation: orphan.status === 'REJECTED' ? orphan.rejection.code : orphan.status,
      activationRowsAfterOrphan,
      staleRevision:
        staleRevision.status === 'REJECTED' ? staleRevision.rejection.code : staleRevision.status,
      immutableProfile:
        immutable.status === 'REJECTED' ? immutable.rejection.code : immutable.status,
      checksumMismatch: corrupt.status === 'REJECTED' ? corrupt.rejection.code : corrupt.status,
      idempotentProfile: idempotent.status,
      oversizedBody: oversized.status === 'REJECTED' ? oversized.rejection.code : oversized.status,
      listLimit,
    },
    bounds: {
      bodyBytes: measureJsonBytes(sampleBody),
      maxBodyBytes: PERSISTENCE_LIMITS.maxBodyBytes,
      maxRecordBytes: PERSISTENCE_LIMITS.maxRecordBytes,
      maxListEntries: PERSISTENCE_LIMITS.maxListEntries,
      maxBodyDepth: PERSISTENCE_LIMITS.maxBodyDepth,
    },
    checks: [],
    summary: { checks: 0, passed: 0, pass: false },
  };

  const observed = { ...report } as DbSchemaReport;
  check('schema-version', 2, schema.currentVersion, 'Current on-disk schema version');
  check('step-count', 2, schema.steps.length, 'One step per declared version');
  check('store-count', 8, schema.stores.length, 'Stores at the current version');
  check(
    'checkpoints-store',
    'checkpointId',
    schema.stores.find((store) => store.name === 'checkpoints')?.keyPath ?? null,
    'Checkpoint key path',
  );
  check('fresh-status', 'READY', freshOpen.status, 'Fresh database open status');
  check('fresh-version', 2, freshOpen.version, 'Fresh database version');
  check('fresh-migrations', 2, freshOpen.appliedMigrations.length, 'Applied migration steps');
  check('fresh-role', 'WRITER', freshOpen.role, 'Only tab, so it owns the writer lock');
  check(
    'fresh-marker',
    'self-driving-academy-local',
    (marker as { value?: { format?: string } } | null)?.value?.format ?? null,
    'Format marker written inside the upgrade',
  );
  check('upgrade-applied', 1, upgradedOpen.appliedMigrations.length, 'Steps for 1 to 2');
  check('upgrade-rows', rowsBefore, upgradedRows.length, 'Rows preserved across the upgrade');
  check('upgrade-added-stores', ['checkpoints'], addedStores, 'Stores added by version 2');
  check('upgrade-index-hits', 1, upgradeIndexHits, 'New byStatus index returns the stored row');
  check('blocked-state', 'BLOCKED_UPGRADE', blockedStatus.state, 'Blocked upgrade is explicit');
  check('blocked-connections', 1, connectionsWhileBlocked, 'The blocking tab keeps its connection');
  check('blocked-role', 'NONE', blockedStatus.role, 'A blocked page cannot write');
  check('blocked-after-close', 'READY', afterClose.status, 'Retry after the tab closed');
  check(
    'version-change-initial',
    'READY',
    changeOpen.status,
    'The page was ready before the change',
  );
  check(
    'version-change-state',
    'RELEASED_FOR_UPGRADE',
    changedStatus.state,
    'Version change stops the page',
  );
  check('version-change-reason', 'VERSION_CHANGE', changedStatus.reason, 'Closed reason code');
  check('version-change-connections', 0, openConnectionsAfter, 'Database closed for the upgrade');
  check('version-change-write', 'REJECTED', writeAfterRelease.status, 'Writes stop after release');
  check(
    'version-change-reopen',
    'READY',
    reopened.status,
    'The page can reopen at the same version',
  );
  check('writer-first', 'WRITER', firstOpen.role, 'First tab owns the writer lock');
  check('writer-second', 'READ_ONLY', secondOpen.role, 'Second tab is explicitly read-only');
  check(
    'writer-second-reason',
    'WRITER_HELD_BY_OTHER_TAB',
    report.writer.secondTabReason,
    'Reason is closed',
  );
  check('writer-waiting', 'WAITING', waitingRole, 'Queued transfer is explicit');
  check('writer-transfer', 'WRITER', transferred.role, 'Transfer grants the writer role');
  check(
    'writer-denied-before',
    'REJECTED',
    deniedBeforeTransfer.status,
    'Second tab cannot write yet',
  );
  check('writer-committed-after', 'COMMITTED', committedAfterTransfer.status, 'New writer commits');
  check('writer-previous-released', 'RELEASED', previousWriter.role, 'Previous writer released');
  check(
    'writer-previous-denied',
    'REJECTED',
    previousWriterWrite.status,
    'Previous writer cannot write',
  );
  check('open-failure-status', 'FAILED', failedOpen.status, 'Open failure is a state');
  check(
    'open-failure-code',
    'OPEN_FAILED',
    failedOpen.rejection?.code ?? null,
    'Closed failure code',
  );
  check(
    'locks-unavailable',
    'READ_ONLY',
    unlockedOpen.role,
    'No unsafe fallback without Web Locks',
  );
  check('locks-unavailable-write', 'REJECTED', unlockedWrite.status, 'Writes are refused');
  check(
    'tx-committed-stores',
    6,
    report.transactions.committedStores,
    'Stores committed by the run, including the schema marker',
  );
  check('tx-rollback-segments', 0, rollbackCounts.segments, 'Segment rolled back');
  check('tx-rollback-progress', 0, rollbackCounts.progress, 'Progress rolled back');
  check(
    'tx-orphan',
    'REFERENCE_MISSING',
    report.transactions.orphanActivation,
    'Activation needs its version',
  );
  check('tx-orphan-rows', 0, activationRowsAfterOrphan, 'No orphan activation row');
  check('tx-stale', 'STALE_REVISION', report.transactions.staleRevision, 'Older revision rejected');
  check(
    'tx-immutable',
    'IMMUTABLE_RECORD',
    report.transactions.immutableProfile,
    'A stored version cannot change content',
  );
  check(
    'tx-checksum',
    'PROFILE_CHECKSUM_MISMATCH',
    report.transactions.checksumMismatch,
    'The 109 checksum is verified before commit',
  );
  check(
    'tx-idempotent',
    'COMMITTED',
    report.transactions.idempotentProfile,
    'Re-putting the same version is idempotent',
  );
  check(
    'tx-oversized',
    'BODY_TOO_LARGE',
    report.transactions.oversizedBody,
    'Body budget enforced',
  );
  check('tx-list-limit', 'LIST_LIMIT', listLimit, 'List budget enforced');
  check(
    'bounds-body',
    new TextEncoder().encode('{"controlMode":"MANUAL","samples":0,"startTick":0}').length,
    report.bounds.bodyBytes,
    'Sample body size matches a hand-written canonical oracle',
  );
  check('bounds-record', 1_048_576, report.bounds.maxRecordBytes, 'Record budget from contracts');

  const passed = checks.filter((entry) => entry.pass).length;
  return {
    ...observed,
    checks: Object.freeze(checks),
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
