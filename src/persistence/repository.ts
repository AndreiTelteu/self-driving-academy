import { ContractValidationError } from '../sessions';
import type { ProfileVersion } from '../profiles';
import type { RuntimeSettings } from '../settings';
import {
  PERSISTENCE_DB_NAME,
  PERSISTENCE_LIMITS,
  PERSISTENCE_SCHEMA_VERSION,
  PersistenceError,
  persistenceRejection,
} from './contracts';
import type {
  ActivationRecord,
  CheckpointRecord,
  OpenReport,
  PersistedRecord,
  PersistenceReasonCode,
  PersistenceRejection,
  PersistenceStoreName,
  RepositoryRole,
  RepositoryState,
  RepositoryStats,
  RepositoryStatusSnapshot,
  WriteResult,
} from './contracts';
import {
  measureJsonBytes,
  parseActivationRecord,
  parseCheckpointRecord,
  parsePersistedRecord,
  parseProfileRecord,
  parseSettingsRecord,
  storageKey,
} from './records';
import { planUpgrade } from './schema';
import { buildProfileHistory, commitProfileActivationRows } from './profile-transaction';
import type {
  ProfileActivationCommit,
  ProfileHistory,
  ProfileTransactionHooks,
} from './profile-transaction';
import { createWriterAuthority } from './writer';
import type { WriterAuthority } from './writer';
import type {
  DatabasePort,
  FactoryPort,
  LockManagerPort,
  OpenBlocked,
  OpenOutcome,
  TransactionPort,
} from './ports';

/**
 * Local repository for PBI 127.
 *
 * Responsibilities:
 * 1. Open the shared database at the current schema version and apply migrations inside the
 *    upgrade (never after the fact).
 * 2. Keep exactly one writer page: writes are refused with `WRITER_REQUIRED` for every other
 *    role, so a second tab cannot start a concurrent autosave.
 * 3. Validate and measure every record before it reaches a transaction; a failure halfway through
 *    a multi-store transaction leaves no partial state (the transaction rolls back).
 * 4. Report unexpected storage states (`BLOCKED_UPGRADE`, `RELEASED_FOR_UPGRADE`, `FAILED`) instead
 *    of throwing or looping.
 *
 * Reads throw `PersistenceError` when stored data is invalid; writes return a rejection object.
 */
export interface LocalRepositoryOptions {
  readonly factory: FactoryPort;
  /** Without a lock manager the page can read but never write (no unsafe fallback). */
  readonly locks?: LockManagerPort;
  readonly dbName?: string;
  readonly tabId?: string;
  readonly now?: () => string;
  readonly openTimeoutMs?: number;
  readonly maxListEntries?: number;
}

export interface LocalRepository {
  readonly database: string;
  status(): RepositoryStatusSnapshot;
  open(): Promise<OpenReport>;
  /** Re-checks a blocked upgrade after the blocking tab closed. */
  retryBlockedUpgrade(): Promise<OpenReport>;
  close(): void;
  claimWriter(): Promise<RepositoryStatusSnapshot>;
  waitForWriter(): Promise<RepositoryStatusSnapshot>;
  releaseWriter(): RepositoryStatusSnapshot;
  stats(): Promise<RepositoryStats>;
  getProfile(versionId: string): Promise<ProfileVersion | null>;
  listProfiles(profileId?: string): Promise<readonly ProfileVersion[]>;
  getActivation(profileId: string): Promise<ActivationRecord | null>;
  /** Stored history of one profile: chain, active version and provenance classification. */
  getProfileHistory(profileId: string): Promise<ProfileHistory>;
  getSegment(segmentId: string): Promise<PersistedRecord | null>;
  listSegments(sessionId: string): Promise<readonly PersistedRecord[]>;
  listSegmentsByStatus(status: string): Promise<readonly PersistedRecord[]>;
  getScenario(scenarioId: string): Promise<PersistedRecord | null>;
  listScenarios(sessionId: string): Promise<readonly PersistedRecord[]>;
  getProgress(progressId: string): Promise<PersistedRecord | null>;
  listProgress(sessionId: string): Promise<readonly PersistedRecord[]>;
  getSettings(playerId: string): Promise<RuntimeSettings | null>;
  getCheckpoint(checkpointId: string): Promise<CheckpointRecord | null>;
  latestCheckpoint(sessionId: string): Promise<CheckpointRecord | null>;
  putProfile(profile: unknown): Promise<WriteResult<ProfileVersion>>;
  activateProfile(activation: unknown): Promise<WriteResult<ActivationRecord>>;
  /**
   * Publishes one version and its activation in a single multi-store transaction (PBI 128).
   *
   * `CRASHED_AFTER_COMMIT` means the fault hook fired after the transaction committed: the rows
   * are durable even though the caller did not receive a plain success.
   */
  commitProfileActivation(
    input: ProfileActivationInput,
    hooks?: ProfileTransactionHooks,
  ): Promise<ProfileActivationOutcome>;
  putSegment(record: unknown): Promise<WriteResult<PersistedRecord>>;
  putScenario(record: unknown): Promise<WriteResult<PersistedRecord>>;
  putProgress(record: unknown): Promise<WriteResult<PersistedRecord>>;
  putSettings(settings: unknown): Promise<WriteResult<RuntimeSettings>>;
  putCheckpoint(checkpoint: unknown): Promise<WriteResult<CheckpointRecord>>;
  deleteCheckpoint(
    checkpointId: string,
  ): Promise<WriteResult<{ readonly checkpointId: string; readonly deleted: boolean }>>;
  deleteRecord(
    store: 'segments' | 'scenarios' | 'progress',
    recordId: string,
  ): Promise<WriteResult<{ readonly recordId: string; readonly deleted: boolean }>>;
}

/** The two rows published by one atomic transaction. */
export interface ProfileActivationInput {
  readonly profile: unknown;
  readonly activation: unknown;
}

/** Outcome of the atomic version+activation transaction. */
export type ProfileActivationOutcome =
  | {
      readonly status: 'COMMITTED';
      readonly value: ProfileActivationCommit;
    }
  | {
      readonly status: 'CRASHED_AFTER_COMMIT';
      readonly value: ProfileActivationCommit;
    }
  | {
      readonly status: 'REJECTED';
      readonly value: null;
      readonly rejection: PersistenceRejection;
    };

const ALL_STORES: readonly PersistenceStoreName[] = [
  'meta',
  'profiles',
  'profileActivations',
  'segments',
  'scenarios',
  'progress',
  'settings',
  'checkpoints',
];

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Persistence operation failed';
}

export function createLocalRepository(options: LocalRepositoryOptions): LocalRepository {
  const factory = options.factory;
  const databaseName = options.dbName ?? PERSISTENCE_DB_NAME;
  const now = options.now ?? (() => new Date().toISOString());
  const openTimeoutMs = options.openTimeoutMs ?? PERSISTENCE_LIMITS.openTimeoutMs;
  const maxListEntries = options.maxListEntries ?? PERSISTENCE_LIMITS.maxListEntries;
  const writer: WriterAuthority | null =
    options.locks === undefined
      ? null
      : createWriterAuthority({
          locks: options.locks,
          tabId: options.tabId ?? `tab-${nextTabOrdinal()}`,
          now,
        });

  let database: DatabasePort | null = null;
  let unsubscribeVersionChange: (() => void) | null = null;
  let state: RepositoryState = 'CLOSED';
  let reason: PersistenceReasonCode | null = null;
  let detail: string | null = null;
  let version: number | null = null;
  let blocked: OpenBlocked | null = null;
  let lastApplied: readonly string[] = Object.freeze([]);
  let lastPreviousVersion: number | null = null;
  const disposed = false;
  const counters = {
    writes: 0,
    rejections: 0,
    transactions: 0,
    versionChanges: 0,
    blockedUpgrades: 0,
  };

  function writerRole(): RepositoryRole {
    return writer === null ? 'NONE' : writer.state().role;
  }

  function setState(
    next: RepositoryState,
    code: PersistenceReasonCode | null,
    text: string | null,
  ) {
    state = next;
    reason = code;
    detail = text;
  }

  function status(): RepositoryStatusSnapshot {
    const writerState = writer === null ? null : writer.state();
    const ready = state === 'READY';
    return Object.freeze({
      state,
      role: ready ? (writerState?.role ?? 'NONE') : 'NONE',
      database: databaseName,
      version,
      // While opening/blocked the schema reason is the important one; once ready, the writer role
      // explains why a page cannot write (for example WRITER_HELD_BY_OTHER_TAB).
      reason: ready ? (writerState?.reason ?? null) : reason,
      detail: ready ? (writerState?.detail ?? null) : detail,
    });
  }

  function report(
    statusText: OpenReport['status'],
    rejection: PersistenceRejection | null,
  ): OpenReport {
    return Object.freeze({
      status: statusText,
      version,
      previousVersion: lastPreviousVersion,
      appliedMigrations: lastApplied,
      role: state === 'READY' ? writerRole() : 'NONE',
      rejection,
    });
  }

  function rejectionFor(error: unknown): PersistenceRejection {
    if (error instanceof PersistenceError) {
      return persistenceRejection(error.code, error.message, error.path);
    }
    if (error instanceof ContractValidationError) {
      return persistenceRejection('INVALID_RECORD', error.message);
    }
    return persistenceRejection('TRANSACTION_ABORTED', message(error));
  }

  function rejectionOf(error: unknown): WriteResult<never> {
    const rejection = rejectionFor(error);
    counters.rejections += 1;
    return Object.freeze({
      status: 'REJECTED' as const,
      value: null,
      rejection,
    });
  }

  function requireDatabase(): DatabasePort {
    if (disposed) throw new PersistenceError('REPOSITORY_DISPOSED', 'The repository was disposed');
    if (database === null || state !== 'READY') {
      throw new PersistenceError('REPOSITORY_CLOSED', `The repository is ${state}`);
    }
    return database;
  }

  function releaseDatabase(): void {
    unsubscribeVersionChange?.();
    unsubscribeVersionChange = null;
    if (database !== null) {
      database.close();
      database = null;
    }
  }

  function adopt(outcome: OpenOutcome): OpenReport {
    if (outcome.status === 'FAILED') {
      lastApplied = Object.freeze([]);
      setState('FAILED', outcome.code, outcome.message);
      return report('FAILED', persistenceRejection(outcome.code, outcome.message));
    }
    if (outcome.status === 'BLOCKED') {
      blocked = outcome;
      counters.blockedUpgrades += 1;
      setState(
        'BLOCKED_UPGRADE',
        'UPGRADE_BLOCKED',
        `Schema ${outcome.requestedVersion} waits for ${outcome.currentVersion}`,
      );
      return report(
        'BLOCKED_UPGRADE',
        persistenceRejection(
          'UPGRADE_BLOCKED',
          `A newer schema (${outcome.requestedVersion}) is blocked by an open connection`,
        ),
      );
    }
    blocked = null;
    database = outcome.database;
    version = outcome.database.version;
    lastApplied = outcome.appliedMigrations;
    lastPreviousVersion = outcome.previousVersion;
    unsubscribeVersionChange = outcome.database.onVersionChange(() => {
      counters.versionChanges += 1;
      writer?.release();
      releaseDatabase();
      setState(
        'RELEASED_FOR_UPGRADE',
        'VERSION_CHANGE',
        'Another tab requested a newer schema; this page closed the database and released the writer lock',
      );
    });
    setState('READY', null, null);
    return report('READY', null);
  }

  async function requestOpen(): Promise<OpenOutcome> {
    const opening = factory.open({
      name: databaseName,
      version: PERSISTENCE_SCHEMA_VERSION,
      plan: (fromVersion) => planUpgrade(fromVersion),
      now,
    });
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<OpenOutcome>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve(
          Object.freeze({
            status: 'FAILED' as const,
            code: 'OPEN_TIMEOUT' as const,
            message: `indexedDB.open did not settle within ${openTimeoutMs} ms`,
          }),
        );
      }, openTimeoutMs);
    });
    try {
      const outcome = await Promise.race([opening, timeout]);
      if (timedOut) {
        void opening.then(
          (late) => {
            if (late.status === 'OPENED') late.database.close();
          },
          () => undefined,
        );
      }
      return outcome;
    } catch (error) {
      return Object.freeze({
        status: 'FAILED' as const,
        code: 'OPEN_FAILED' as const,
        message: message(error),
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function open(): Promise<OpenReport> {
    if (disposed) {
      setState('DISPOSED', 'REPOSITORY_DISPOSED', 'The repository was disposed');
      return report(
        'FAILED',
        persistenceRejection('REPOSITORY_DISPOSED', 'The repository was disposed'),
      );
    }
    if (state === 'READY') return report('READY', null);
    if (state === 'BLOCKED_UPGRADE') return retryBlockedUpgrade();
    setState('OPENING', null, null);
    const outcome = await requestOpen();
    const adopted = adopt(outcome);
    if (adopted.status === 'READY' && writer !== null) {
      await writer.claim();
      return report('READY', null);
    }
    return adopted;
  }

  async function retryBlockedUpgrade(): Promise<OpenReport> {
    if (blocked === null) return open();
    const pending = blocked;
    blocked = null;
    const outcome = await pending.whenUnblocked();
    const adopted = adopt(outcome);
    if (adopted.status === 'READY' && writer !== null) {
      await writer.claim();
      return report('READY', null);
    }
    return adopted;
  }

  function close(): void {
    writer?.dispose();
    releaseDatabase();
    blocked = null;
    setState('CLOSED', null, null);
  }

  async function claimWriter(): Promise<RepositoryStatusSnapshot> {
    if (writer !== null) await writer.claim();
    return status();
  }

  async function waitForWriter(): Promise<RepositoryStatusSnapshot> {
    if (writer !== null) await writer.wait();
    return status();
  }

  function releaseWriter(): RepositoryStatusSnapshot {
    writer?.release();
    return status();
  }

  async function read<T>(
    stores: readonly PersistenceStoreName[],
    work: (transaction: TransactionPort) => Promise<T>,
  ): Promise<T> {
    const db = requireDatabase();
    counters.transactions += 1;
    return db.transact(stores, 'readonly', work);
  }

  async function write<T>(
    stores: readonly PersistenceStoreName[],
    work: (transaction: TransactionPort) => Promise<{ readonly value: T; readonly bytes: number }>,
  ): Promise<WriteResult<T>> {
    try {
      if (disposed)
        throw new PersistenceError('REPOSITORY_DISPOSED', 'The repository was disposed');
      if (state !== 'READY' || database === null) {
        throw new PersistenceError('REPOSITORY_CLOSED', `The repository is ${state}`);
      }
      if (writerRole() !== 'WRITER') {
        counters.rejections += 1;
        return Object.freeze({
          status: 'REJECTED' as const,
          value: null,
          rejection: persistenceRejection(
            'WRITER_REQUIRED',
            'This page does not own the writer lock',
            'writer',
          ),
        });
      }
      counters.transactions += 1;
      const result = await database.transact(stores, 'readwrite', work);
      counters.writes += 1;
      return Object.freeze({
        status: 'COMMITTED' as const,
        value: result.value,
        bytes: result.bytes,
      });
    } catch (error) {
      return rejectionOf(error);
    }
  }

  function bounded<T>(rows: readonly T[], label: string): readonly T[] {
    if (rows.length > maxListEntries) {
      throw new PersistenceError(
        'LIST_LIMIT',
        `${label} returned ${rows.length} rows, above the ${maxListEntries} row budget`,
        label,
      );
    }
    return Object.freeze([...rows]);
  }

  function parseAll<T>(rows: readonly unknown[], decode: (value: unknown) => T): readonly T[] {
    return rows.map((row) => decode(row));
  }

  async function getProfile(versionId: string): Promise<ProfileVersion | null> {
    const key = storageKey(versionId, 'versionId');
    const stored = await read(['profiles'], (transaction) => transaction.get('profiles', key));
    return stored === undefined ? null : parseProfileRecord(stored);
  }

  async function listProfiles(profileId?: string): Promise<readonly ProfileVersion[]> {
    const rows = await read(['profiles'], (transaction) =>
      profileId === undefined
        ? transaction.getAll('profiles')
        : transaction.getAllByIndex('profiles', 'byProfile', storageKey(profileId, 'profileId')),
    );
    return bounded(parseAll(rows, parseProfileRecord), 'profiles');
  }

  async function getActivation(profileId: string): Promise<ActivationRecord | null> {
    const key = storageKey(profileId, 'profileId');
    const stored = await read(['profileActivations'], (transaction) =>
      transaction.get('profileActivations', key),
    );
    return stored === undefined ? null : parseActivationRecord(stored);
  }

  async function getProfileHistory(profileId: string): Promise<ProfileHistory> {
    const key = storageKey(profileId, 'profileId');
    const [versions, activation] = await Promise.all([
      read(['profiles'], (transaction) =>
        transaction.getAllByIndex('profiles', 'byProfile', key),
      ).then((rows) => bounded(parseAll(rows, parseProfileRecord), 'profiles')),
      read(['profileActivations'], (transaction) =>
        transaction.get('profileActivations', key),
      ).then((stored) => (stored === undefined ? null : parseActivationRecord(stored))),
    ]);
    return buildProfileHistory(profileId, versions, activation);
  }

  function persistedReader(
    store: 'segments' | 'scenarios' | 'progress',
    kind: 'SEGMENT' | 'SCENARIO' | 'PROGRESS',
  ) {
    return async (recordId: string): Promise<PersistedRecord | null> => {
      const key = storageKey(recordId, 'recordId');
      const stored = await read([store], (transaction) => transaction.get(store, key));
      return stored === undefined ? null : parsePersistedRecord(stored, kind);
    };
  }

  function persistedLister(
    store: 'segments' | 'scenarios' | 'progress',
    kind: 'SEGMENT' | 'SCENARIO' | 'PROGRESS',
  ) {
    return async (sessionId: string): Promise<readonly PersistedRecord[]> => {
      const key = storageKey(sessionId, 'sessionId');
      const rows = await read([store], (transaction) =>
        transaction.getAllByIndex(store, 'bySession', key),
      );
      return bounded(
        parseAll(rows, (row) => parsePersistedRecord(row, kind)),
        store,
      );
    };
  }

  async function listSegmentsByStatus(status: string): Promise<readonly PersistedRecord[]> {
    const rows = await read(['segments'], (transaction) =>
      transaction.getAllByIndex('segments', 'byStatus', storageKey(status, 'status')),
    );
    return bounded(
      parseAll(rows, (row) => parsePersistedRecord(row, 'SEGMENT')),
      'segments',
    );
  }

  async function getSettings(playerId: string): Promise<RuntimeSettings | null> {
    const key = storageKey(playerId, 'playerId');
    const stored = await read(['settings'], (transaction) => transaction.get('settings', key));
    return stored === undefined ? null : parseSettingsRecord(stored);
  }

  async function getCheckpoint(checkpointId: string): Promise<CheckpointRecord | null> {
    const key = storageKey(checkpointId, 'checkpointId');
    const stored = await read(['checkpoints'], (transaction) =>
      transaction.get('checkpoints', key),
    );
    return stored === undefined ? null : parseCheckpointRecord(stored);
  }

  async function latestCheckpoint(sessionId: string): Promise<CheckpointRecord | null> {
    const key = storageKey(sessionId, 'sessionId');
    const rows = await read(['checkpoints'], (transaction) =>
      transaction.getAllByIndex('checkpoints', 'bySession', key),
    );
    const checkpoints = bounded(parseAll(rows, parseCheckpointRecord), 'checkpoints');
    let latest: CheckpointRecord | null = null;
    for (const checkpoint of checkpoints) {
      if (
        latest === null ||
        checkpoint.tick > latest.tick ||
        (checkpoint.tick === latest.tick && checkpoint.generation > latest.generation)
      ) {
        latest = checkpoint;
      }
    }
    return latest;
  }

  async function putProfile(profile: unknown): Promise<WriteResult<ProfileVersion>> {
    try {
      const record = parseProfileRecord(profile);
      const bytes = recordBytes(record);
      return await write(['profiles'], async (transaction) => {
        const existing = await transaction.get('profiles', record.versionId);
        if (existing !== undefined) {
          const stored = parseProfileRecord(existing);
          if (stored.checksum !== record.checksum) {
            throw new PersistenceError(
              'IMMUTABLE_RECORD',
              `Profile version ${record.versionId} is immutable`,
              'profiles',
            );
          }
          return { value: stored, bytes };
        }
        await transaction.put('profiles', record);
        return { value: record, bytes };
      });
    } catch (error) {
      return rejectionOf(error);
    }
  }

  async function activateProfile(activation: unknown): Promise<WriteResult<ActivationRecord>> {
    try {
      const record = parseActivationRecord(activation);
      const bytes = recordBytes(record);
      return await write(['profiles', 'profileActivations'], async (transaction) => {
        const stored = await transaction.get('profiles', record.versionId);
        if (stored === undefined) {
          throw new PersistenceError(
            'REFERENCE_MISSING',
            `Profile version ${record.versionId} is not stored`,
            'activation.versionId',
          );
        }
        const profile = parseProfileRecord(stored);
        if (profile.profileId !== record.profileId) {
          throw new PersistenceError(
            'REFERENCE_MISSING',
            `Profile version ${record.versionId} belongs to ${profile.profileId}`,
            'activation.profileId',
          );
        }
        const existing = await transaction.get('profileActivations', record.profileId);
        if (existing !== undefined) {
          const current = parseActivationRecord(existing);
          if (current.sequence > record.sequence) {
            throw new PersistenceError(
              'STALE_REVISION',
              `Activation sequence ${record.sequence} is older than ${current.sequence}`,
              'activation.sequence',
            );
          }
          if (current.sequence === record.sequence) {
            if (current.versionId !== record.versionId) {
              throw new PersistenceError(
                'STALE_REVISION',
                'The same activation sequence points at another version',
                'activation.sequence',
              );
            }
            return { value: current, bytes };
          }
        }
        await transaction.put('profileActivations', record);
        return { value: record, bytes };
      });
    } catch (error) {
      return rejectionOf(error);
    }
  }

  async function commitProfileActivation(
    input: ProfileActivationInput,
    hooks: ProfileTransactionHooks = {},
  ): Promise<ProfileActivationOutcome> {
    try {
      if (disposed)
        throw new PersistenceError('REPOSITORY_DISPOSED', 'The repository was disposed');
      if (state !== 'READY' || database === null) {
        throw new PersistenceError('REPOSITORY_CLOSED', `The repository is ${state}`);
      }
      if (writerRole() !== 'WRITER') {
        counters.rejections += 1;
        return Object.freeze({
          status: 'REJECTED' as const,
          value: null,
          rejection: persistenceRejection(
            'WRITER_REQUIRED',
            'This page does not own the writer lock',
            'writer',
          ),
        });
      }
      counters.transactions += 1;
      const value = await database.transact(
        ['profiles', 'profileActivations'],
        'readwrite',
        (transaction) => commitProfileActivationRows(transaction, input, hooks),
      );
      counters.writes += 1;
      try {
        hooks.afterCommit?.();
      } catch {
        // The transaction already committed: the rows are durable even though the caller died.
        return Object.freeze({ status: 'CRASHED_AFTER_COMMIT' as const, value });
      }
      return Object.freeze({ status: 'COMMITTED' as const, value });
    } catch (error) {
      counters.rejections += 1;
      return Object.freeze({
        status: 'REJECTED' as const,
        value: null,
        rejection: rejectionFor(error),
      });
    }
  }

  function persistedWriter(
    store: 'segments' | 'scenarios' | 'progress',
    kind: 'SEGMENT' | 'SCENARIO' | 'PROGRESS',
  ) {
    return async (input: unknown): Promise<WriteResult<PersistedRecord>> => {
      try {
        const record = parsePersistedRecord(input, kind);
        const bytes = recordBytes(record);
        return await write([store], async (transaction) => {
          const existing = await transaction.get(store, record.recordId);
          if (existing !== undefined) {
            const current = parsePersistedRecord(existing, kind);
            if (record.revision <= current.revision) {
              throw new PersistenceError(
                'STALE_REVISION',
                `Revision ${record.revision} is not newer than the stored ${current.revision}`,
                `${store}.revision`,
              );
            }
          }
          await transaction.put(store, record);
          return { value: record, bytes };
        });
      } catch (error) {
        return rejectionOf(error);
      }
    };
  }

  async function putSettings(settings: unknown): Promise<WriteResult<RuntimeSettings>> {
    try {
      const record = parseSettingsRecord(settings);
      const bytes = recordBytes(record);
      return await write(['settings'], async (transaction) => {
        await transaction.put('settings', record);
        return { value: record, bytes };
      });
    } catch (error) {
      return rejectionOf(error);
    }
  }

  async function putCheckpoint(checkpoint: unknown): Promise<WriteResult<CheckpointRecord>> {
    try {
      const record = parseCheckpointRecord(checkpoint);
      const bytes = recordBytes(record);
      return await write(['checkpoints'], async (transaction) => {
        const existing = await transaction.get('checkpoints', record.checkpointId);
        if (existing !== undefined) {
          const current = parseCheckpointRecord(existing);
          if (current.generation > record.generation) {
            throw new PersistenceError(
              'STALE_REVISION',
              `Checkpoint generation ${record.generation} is older than ${current.generation}`,
              'checkpoint.generation',
            );
          }
        }
        await transaction.put('checkpoints', record);
        return { value: record, bytes };
      });
    } catch (error) {
      return rejectionOf(error);
    }
  }

  async function deleteCheckpoint(
    checkpointId: string,
  ): Promise<WriteResult<{ readonly checkpointId: string; readonly deleted: boolean }>> {
    try {
      const key = storageKey(checkpointId, 'checkpointId');
      return await write(['checkpoints'], async (transaction) => {
        const existing = await transaction.get('checkpoints', key);
        if (existing !== undefined) await transaction.delete('checkpoints', key);
        return { value: { checkpointId: key, deleted: existing !== undefined }, bytes: 0 };
      });
    } catch (error) {
      return rejectionOf(error);
    }
  }

  async function deleteRecord(
    store: 'segments' | 'scenarios' | 'progress',
    recordId: string,
  ): Promise<WriteResult<{ readonly recordId: string; readonly deleted: boolean }>> {
    try {
      const key = storageKey(recordId, 'recordId');
      return await write([store], async (transaction) => {
        const existing = await transaction.get(store, key);
        if (existing !== undefined) await transaction.delete(store, key);
        return { value: { recordId: key, deleted: existing !== undefined }, bytes: 0 };
      });
    } catch (error) {
      return rejectionOf(error);
    }
  }

  async function stats(): Promise<RepositoryStats> {
    const counts: Record<PersistenceStoreName, number> = {
      meta: 0,
      profiles: 0,
      profileActivations: 0,
      segments: 0,
      scenarios: 0,
      progress: 0,
      settings: 0,
      checkpoints: 0,
    };
    if (state === 'READY' && database !== null) {
      counters.transactions += 1;
      await database.transact(ALL_STORES, 'readonly', async (transaction) => {
        for (const store of ALL_STORES) {
          counts[store] = (await transaction.getAll(store)).length;
        }
      });
    }
    return Object.freeze({
      state,
      role: state === 'READY' ? writerRole() : 'NONE',
      version,
      counts: Object.freeze(counts),
      writes: counters.writes,
      rejections: counters.rejections,
      transactions: counters.transactions,
      versionChanges: counters.versionChanges,
      blockedUpgrades: counters.blockedUpgrades,
    });
  }

  return Object.freeze({
    database: databaseName,
    status,
    open,
    retryBlockedUpgrade,
    close,
    claimWriter,
    waitForWriter,
    releaseWriter,
    stats,
    getProfile,
    listProfiles,
    getActivation,
    getProfileHistory,
    getSegment: persistedReader('segments', 'SEGMENT'),
    listSegments: persistedLister('segments', 'SEGMENT'),
    listSegmentsByStatus,
    getScenario: persistedReader('scenarios', 'SCENARIO'),
    listScenarios: persistedLister('scenarios', 'SCENARIO'),
    getProgress: persistedReader('progress', 'PROGRESS'),
    listProgress: persistedLister('progress', 'PROGRESS'),
    getSettings,
    getCheckpoint,
    latestCheckpoint,
    putProfile,
    activateProfile,
    commitProfileActivation,
    putSegment: persistedWriter('segments', 'SEGMENT'),
    putScenario: persistedWriter('scenarios', 'SCENARIO'),
    putProgress: persistedWriter('progress', 'PROGRESS'),
    putSettings,
    putCheckpoint,
    deleteCheckpoint,
    deleteRecord,
  });
}

let tabOrdinal = 0;

function nextTabOrdinal(): number {
  tabOrdinal += 1;
  return tabOrdinal;
}

function recordBytes(record: unknown): number {
  // Measured with the same canonical rule as the body budget; failures surface as rejections.
  return measureJsonBytes(record, 'record');
}
