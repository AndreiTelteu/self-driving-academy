import { requireContract } from '../sessions';
import { PERSISTENCE_SCHEMA_VERSION, PersistenceError, persistenceStoreNames } from './contracts';
import type { PersistenceReasonCode, PersistenceStoreName, SchemaStep } from './contracts';
import { applySchemaStep, indexDefinition } from './schema';
import type {
  DatabasePort,
  FactoryPort,
  LockManagerPort,
  LockOptions,
  OpenBlocked,
  OpenOutcome,
  OpenRequest,
  SchemaUpgrader,
  TransactionMode,
  TransactionPort,
  VersionChangeEvent,
} from './ports';

/**
 * In-memory double for the IndexedDB and Web Locks surfaces PBI 127 uses.
 *
 * It is not a general IndexedDB shim. It models exactly the behaviour the repository relies on:
 * on-disk versions and upgrade steps, `versionchange` notification, a blocked upgrade that stays
 * pending until the last connection closes, transaction rollback, single-connection ordering,
 * structured-clone copies and FIFO Web Locks queues. No dependency is added to `package.json`.
 */

interface MemoryStore {
  readonly keyPath: string;
  readonly indexes: Map<string, { readonly keyPath: string; readonly unique: boolean }>;
  rows: Map<string, unknown>;
}

interface MemoryDatabase {
  version: number;
  readonly stores: Map<PersistenceStoreName, MemoryStore>;
}

export interface MemoryIdbOptions {
  /** Simulates a browser that refuses `indexedDB.open` (private mode, security policy). */
  readonly failOpens?: number;
  /** Simulates a migration that throws halfway through the upgrade. */
  readonly failUpgrades?: number;
}

export interface MemoryDatabaseInspection {
  readonly name: string;
  readonly version: number;
  readonly stores: readonly {
    readonly name: PersistenceStoreName;
    readonly keyPath: string;
    readonly indexes: readonly { readonly name: string; readonly keyPath: string }[];
    readonly entries: number;
  }[];
}

export interface MemoryIdbFactory extends FactoryPort {
  inspect(name: string): MemoryDatabaseInspection | null;
  openConnections(name?: string): number;
  databaseNames(): readonly string[];
  /** Test hook: fires `versionchange` on every open connection, like a newer tab would. */
  notifyVersionChange(name: string, toVersion: number): void;
  /** Test hook: the next `count` opens fail like a refused `indexedDB.open`. */
  failNextOpen(count?: number): void;
  /** Test hook: the next `count` upgrades throw after applying their steps. */
  failNextUpgrade(count?: number): void;
}

export function cloneValue(value: unknown): unknown {
  const clone = (globalThis as { structuredClone?: (input: unknown) => unknown }).structuredClone;
  if (typeof clone !== 'function') {
    throw new PersistenceError('INVALID_RECORD', 'structuredClone is unavailable', 'value');
  }
  try {
    return clone(value);
  } catch {
    throw new PersistenceError(
      'INVALID_RECORD',
      'Value cannot be structured-cloned into IndexedDB',
      'value',
    );
  }
}

function cloneDatabase(state: MemoryDatabase): MemoryDatabase {
  const stores = new Map<PersistenceStoreName, MemoryStore>();
  for (const [name, store] of state.stores) {
    const rows = new Map<string, unknown>();
    for (const [key, value] of store.rows) rows.set(key, cloneValue(value));
    stores.set(name, {
      keyPath: store.keyPath,
      indexes: new Map(
        [...store.indexes].map(([indexName, entry]) => [
          indexName,
          { keyPath: entry.keyPath, unique: entry.unique },
        ]),
      ),
      rows,
    });
  }
  return { version: state.version, stores };
}

function sortedKeys(rows: ReadonlyMap<string, unknown>): readonly string[] {
  return [...rows.keys()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function failed(code: PersistenceReasonCode, message: string): OpenOutcome {
  return Object.freeze({ status: 'FAILED' as const, code, message });
}

export function createMemoryIdbFactory(options: MemoryIdbOptions = {}): MemoryIdbFactory {
  const databases = new Map<string, MemoryDatabase>();
  const connections = new Set<MemoryConnection>();
  const blockedRequests: {
    readonly name: string;
    readonly version: number;
    readonly plan: (fromVersion: number) => readonly SchemaStep[];
    readonly now: () => string;
    readonly settle: (outcome: OpenOutcome) => void;
  }[] = [];
  let remainingOpenFailures = options.failOpens ?? 0;
  let remainingUpgradeFailures = options.failUpgrades ?? 0;

  interface MemoryConnection {
    readonly databaseName: string;
    readonly state: MemoryDatabase;
    readonly listeners: Set<(event: VersionChangeEvent) => void>;
    closed: boolean;
    readonly queue: { tail: Promise<void> };
  }

  function upgradeState(
    state: MemoryDatabase,
    steps: readonly SchemaStep[],
    now: () => string,
  ): readonly string[] {
    const failing = remainingUpgradeFailures > 0;
    if (failing) remainingUpgradeFailures -= 1;
    const upgrader: SchemaUpgrader = {
      hasStore: (name) => state.stores.has(name),
      createStore: (definition) => {
        if (state.stores.has(definition.name)) {
          throw new PersistenceError(
            'MIGRATION_FAILED',
            `Store ${definition.name} already exists`,
            definition.name,
          );
        }
        state.stores.set(definition.name, {
          keyPath: definition.keyPath,
          indexes: new Map(
            definition.indexes.map((entry) => [
              entry.name,
              { keyPath: entry.keyPath, unique: entry.unique },
            ]),
          ),
          rows: new Map(),
        });
      },
      deleteStore: (name) => {
        state.stores.delete(name);
      },
      createIndex: (name, definition) => {
        const store = state.stores.get(name);
        if (store === undefined) {
          throw new PersistenceError('MIGRATION_FAILED', `Cannot index ${name}`, name);
        }
        store.indexes.set(definition.name, {
          keyPath: definition.keyPath,
          unique: definition.unique,
        });
      },
      put: (name, value) => {
        const store = state.stores.get(name);
        if (store === undefined) {
          throw new PersistenceError('MIGRATION_FAILED', `Cannot seed ${name}`, name);
        }
        const key = recordKey(store, value);
        store.rows.set(key, cloneValue(value));
      },
    };
    const applied: string[] = [];
    for (const step of steps) {
      applySchemaStep(upgrader, step, now);
      applied.push(step.id);
      if (failing) {
        // Fails *after* applying, so the rollback path is exercised with a dirty draft.
        throw new PersistenceError(
          'MIGRATION_FAILED',
          `Injected migration failure after ${step.id}`,
          'upgrade',
        );
      }
    }
    return Object.freeze(applied);
  }

  function recordKey(store: MemoryStore, value: unknown): string {
    if (typeof value !== 'object' || value === null) {
      throw new PersistenceError('INVALID_RECORD', 'Stored values must be objects', 'value');
    }
    const key: unknown = (value as Record<string, unknown>)[store.keyPath];
    if (typeof key !== 'string' || key.length === 0) {
      throw new PersistenceError(
        'INVALID_RECORD',
        `Expected a string key path ${store.keyPath}`,
        store.keyPath,
      );
    }
    return key;
  }

  function connectionFor(name: string, state: MemoryDatabase): DatabasePort {
    const connection: MemoryConnection = {
      databaseName: name,
      state,
      listeners: new Set(),
      closed: false,
      queue: { tail: Promise.resolve() },
    };
    connections.add(connection);
    return {
      version: state.version,
      transact: (stores, mode, work) => runTransaction(connection, stores, mode, work),
      close: () => {
        if (connection.closed) return;
        connection.closed = true;
        connection.listeners.clear();
        connections.delete(connection);
        releaseBlockedRequests(name);
      },
      onVersionChange: (listener) => {
        connection.listeners.add(listener);
        return () => connection.listeners.delete(listener);
      },
    };
  }

  function runTransaction<T>(
    connection: MemoryConnection,
    stores: readonly PersistenceStoreName[],
    mode: TransactionMode,
    work: (transaction: TransactionPort) => Promise<T> | T,
  ): Promise<T> {
    if (connection.closed) {
      return Promise.reject(
        new PersistenceError('REPOSITORY_CLOSED', 'The database connection is closed'),
      );
    }
    if (stores.length === 0) {
      return Promise.reject(new PersistenceError('UNKNOWN_STORE', 'A transaction needs a store'));
    }
    for (const name of stores) {
      if (!(persistenceStoreNames as readonly string[]).includes(name)) {
        return Promise.reject(new PersistenceError('UNKNOWN_STORE', `Unknown store ${name}`));
      }
      if (!connection.state.stores.has(name)) {
        return Promise.reject(new PersistenceError('UNKNOWN_STORE', `Store ${name} is absent`));
      }
    }
    const run = async (): Promise<T> => {
      const snapshot = new Map<PersistenceStoreName, Map<string, unknown>>();
      if (mode === 'readwrite') {
        for (const name of stores) {
          const store = connection.state.stores.get(name);
          if (store === undefined) continue;
          const rows = new Map<string, unknown>();
          for (const [key, value] of store.rows) rows.set(key, cloneValue(value));
          snapshot.set(name, rows);
        }
      }
      const storesByName = new Map(stores.map((name) => [name, connection.state.stores.get(name)]));
      const requireStore = (name: PersistenceStoreName, writable: boolean): MemoryStore => {
        const store = storesByName.get(name);
        if (store === undefined) {
          throw new PersistenceError(
            'UNKNOWN_STORE',
            `Store ${name} is not part of this transaction`,
            name,
          );
        }
        if (writable && mode !== 'readwrite') {
          throw new PersistenceError('WRITER_REQUIRED', 'The transaction is read-only', name);
        }
        return store;
      };
      const transaction: TransactionPort = {
        get: (name, key) => {
          const store = requireStore(name, false);
          return Promise.resolve(store.rows.get(key)).then((value) =>
            value === undefined ? undefined : cloneValue(value),
          );
        },
        getAll: (name) => {
          const store = requireStore(name, false);
          const rows = sortedKeys(store.rows).map((key) => cloneValue(store.rows.get(key)));
          return Promise.resolve(Object.freeze(rows));
        },
        getAllByIndex: (name, indexName, key) => {
          const store = requireStore(name, false);
          const definition = indexDefinition(name, indexName, connection.state.version);
          if (definition === null) {
            return Promise.reject(
              new PersistenceError(
                'UNKNOWN_INDEX',
                `Unknown index ${name}.${indexName}`,
                indexName,
              ),
            );
          }
          const rows = sortedKeys(store.rows)
            .filter((primaryKey) => {
              const value: unknown = store.rows.get(primaryKey);
              if (typeof value !== 'object' || value === null) return false;
              return (value as Record<string, unknown>)[definition.keyPath] === key;
            })
            .map((primaryKey) => cloneValue(store.rows.get(primaryKey)));
          return Promise.resolve(Object.freeze(rows));
        },
        put: (name, value) => {
          try {
            const store = requireStore(name, true);
            const key = recordKey(store, value);
            for (const [indexName, entry] of store.indexes) {
              if (!entry.unique) continue;
              const candidate = (value as Record<string, unknown>)[entry.keyPath];
              for (const [existingKey, existing] of store.rows) {
                if (existingKey === key) continue;
                if (
                  typeof existing === 'object' &&
                  existing !== null &&
                  (existing as Record<string, unknown>)[entry.keyPath] === candidate
                ) {
                  throw new PersistenceError(
                    'TRANSACTION_ABORTED',
                    `Unique index ${indexName} is already used`,
                    indexName,
                  );
                }
              }
            }
            store.rows.set(key, cloneValue(value));
            return Promise.resolve();
          } catch (error) {
            return Promise.reject(error);
          }
        },
        delete: (name, key) => {
          try {
            requireStore(name, true).rows.delete(key);
            return Promise.resolve();
          } catch (error) {
            return Promise.reject(error);
          }
        },
      };
      try {
        const result = await work(transaction);
        return result;
      } catch (error) {
        if (mode === 'readwrite') {
          for (const [name, rows] of snapshot) {
            const store = connection.state.stores.get(name);
            if (store !== undefined) store.rows = rows;
          }
        }
        throw error;
      }
    };
    const pending = connection.queue.tail.then(run, run);
    connection.queue.tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  function notifyVersionChange(name: string, currentVersion: number, nextVersion: number): void {
    for (const connection of [...connections]) {
      if (connection.databaseName !== name || connection.closed) continue;
      for (const listener of [...connection.listeners]) {
        listener({ fromVersion: currentVersion, toVersion: nextVersion });
      }
    }
  }

  function openConnectionsFor(name: string): MemoryConnection[] {
    return [...connections].filter((entry) => entry.databaseName === name && !entry.closed);
  }

  function upgradeAndOpen(
    name: string,
    version: number,
    plan: (fromVersion: number) => readonly SchemaStep[],
    now: () => string,
  ): OpenOutcome {
    const existing = databases.get(name);
    const previousVersion = existing?.version ?? 0;
    const draft: MemoryDatabase =
      existing === undefined ? { version: 0, stores: new Map() } : cloneDatabase(existing);
    let applied: readonly string[];
    try {
      applied = upgradeState(draft, plan(previousVersion), now);
      draft.version = version;
    } catch (error) {
      const code = error instanceof PersistenceError ? error.code : 'MIGRATION_FAILED';
      return failed(
        code === 'SCHEMA_TOO_NEW' ? code : 'MIGRATION_FAILED',
        error instanceof Error ? error.message : 'Migration failed',
      );
    }
    databases.set(name, draft);
    return Object.freeze({
      status: 'OPENED' as const,
      database: connectionFor(name, draft),
      previousVersion,
      appliedMigrations: applied,
    });
  }

  function releaseBlockedRequests(name: string): void {
    if (openConnectionsFor(name).length > 0) return;
    const waiting = blockedRequests.filter((entry) => entry.name === name);
    for (const entry of waiting) {
      const index = blockedRequests.indexOf(entry);
      if (index >= 0) blockedRequests.splice(index, 1);
      const outcome = upgradeAndOpen(name, entry.version, entry.plan, entry.now);
      entry.settle(outcome);
      serveBlockedRequests(name, outcome.status === 'OPENED' ? outcome.database.version : null);
    }
  }

  /** After an upgrade, pending requests for the same or an older version also succeed. */
  function serveBlockedRequests(name: string, currentVersion: number | null): void {
    if (currentVersion === null) return;
    const state = databases.get(name);
    if (state === undefined) return;
    const waiting = blockedRequests.filter(
      (entry) => entry.name === name && entry.version <= currentVersion,
    );
    for (const entry of waiting) {
      const index = blockedRequests.indexOf(entry);
      if (index >= 0) blockedRequests.splice(index, 1);
      entry.settle(
        Object.freeze({
          status: 'OPENED' as const,
          database: connectionFor(name, state),
          previousVersion: currentVersion,
          appliedMigrations: Object.freeze([]),
        }),
      );
    }
  }

  async function open(request: OpenRequest): Promise<OpenOutcome> {
    requireContract(typeof request.name === 'string' && request.name.length > 0, 'Expected a name');
    requireContract(
      Number.isSafeInteger(request.version) && request.version >= 1,
      'Expected a schema version',
    );
    if (remainingOpenFailures > 0) {
      remainingOpenFailures -= 1;
      return failed('OPEN_FAILED', 'Injected IndexedDB open failure');
    }
    if (request.version > PERSISTENCE_SCHEMA_VERSION) {
      return failed('SCHEMA_TOO_NEW', 'Requested schema is newer than this build');
    }
    const existing = databases.get(request.name);
    if (existing !== undefined && request.version < existing.version) {
      return failed(
        'SCHEMA_TOO_NEW',
        `Local database schema ${existing.version} is newer than ${request.version}`,
      );
    }
    if (existing !== undefined && request.version === existing.version) {
      return Object.freeze({
        status: 'OPENED' as const,
        database: connectionFor(request.name, existing),
        previousVersion: existing.version,
        appliedMigrations: Object.freeze([]),
      });
    }
    notifyVersionChange(request.name, existing?.version ?? 0, request.version);
    if (openConnectionsFor(request.name).length > 0) {
      let settled = false;
      let settle: (outcome: OpenOutcome) => void = () => undefined;
      const pending = new Promise<OpenOutcome>((resolve) => {
        settle = (outcome) => {
          if (settled) return;
          settled = true;
          resolve(outcome);
        };
      });
      const entry = {
        name: request.name,
        version: request.version,
        plan: request.plan,
        now: request.now,
        settle,
      };
      blockedRequests.push(entry);
      const blocked: OpenBlocked = Object.freeze({
        status: 'BLOCKED' as const,
        requestedVersion: request.version,
        currentVersion: existing?.version ?? 0,
        whenUnblocked: () => pending,
        cancel: () => {
          if (settled) return;
          const index = blockedRequests.indexOf(entry);
          if (index >= 0) blockedRequests.splice(index, 1);
          settle(failed('UPGRADE_ABORTED', 'The blocked upgrade was cancelled'));
        },
      });
      return blocked;
    }
    return upgradeAndOpen(request.name, request.version, request.plan, request.now);
  }

  return Object.freeze({
    open,
    deleteDatabase: async (name: string) => {
      for (const connection of openConnectionsFor(name)) {
        connection.closed = true;
        connection.listeners.clear();
        connections.delete(connection);
      }
      databases.delete(name);
    },
    inspect: (name: string): MemoryDatabaseInspection | null => {
      const state = databases.get(name);
      if (state === undefined) return null;
      return Object.freeze({
        name,
        version: state.version,
        stores: Object.freeze(
          [...state.stores].map(([storeName, store]) =>
            Object.freeze({
              name: storeName,
              keyPath: store.keyPath,
              indexes: Object.freeze(
                [...store.indexes].map(([indexName, entry]) =>
                  Object.freeze({ name: indexName, keyPath: entry.keyPath }),
                ),
              ),
              entries: store.rows.size,
            }),
          ),
        ),
      });
    },
    openConnections: (name?: string) =>
      connections.size === 0
        ? 0
        : [...connections].filter(
            (connection) =>
              !connection.closed && (name === undefined || connection.databaseName === name),
          ).length,
    databaseNames: () => Object.freeze([...databases.keys()]),
    notifyVersionChange: (name: string, toVersion: number) => {
      const state = databases.get(name);
      if (state === undefined) return;
      notifyVersionChange(name, state.version, toVersion);
    },
    failNextOpen: (count = 1) => {
      remainingOpenFailures = count;
    },
    failNextUpgrade: (count = 1) => {
      remainingUpgradeFailures = count;
    },
  });
}

/** Minimal FIFO exclusive-lock manager with the same callback contract as Web Locks. */
export interface MemoryLockManager extends LockManagerPort {
  pending(name: string): number;
  holders(name: string): number;
}

interface QueueEntry {
  readonly options: LockOptions;
  readonly callback: (held: boolean) => Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  granted: boolean;
  readonly detach: () => void;
}

function abortError(): Error {
  const error = new Error('The lock request was aborted');
  error.name = 'AbortError';
  return error;
}

export function createMemoryLockManager(
  options: { readonly available?: boolean } = {},
): MemoryLockManager {
  const states = new Map<string, { held: boolean; readonly queue: QueueEntry[] }>();
  const stateFor = (name: string) => {
    let state = states.get(name);
    if (state === undefined) {
      state = { held: false, queue: [] };
      states.set(name, state);
    }
    return state;
  };
  function pump(name: string): void {
    const state = stateFor(name);
    if (state.held) return;
    const entry = state.queue.shift();
    if (entry === undefined) return;
    state.held = true;
    entry.granted = true;
    Promise.resolve()
      .then(() => entry.callback(true))
      .then(
        () => {
          state.held = false;
          entry.detach();
          entry.resolve();
          pump(name);
        },
        (error: unknown) => {
          state.held = false;
          entry.detach();
          entry.reject(error);
          pump(name);
        },
      );
  }
  return Object.freeze({
    available: options.available ?? true,
    request: (name: string, lockOptions: LockOptions, callback: (held: boolean) => Promise<void>) =>
      new Promise<void>((resolve, reject) => {
        const state = stateFor(name);
        const signal = lockOptions.signal;
        let detached = false;
        const entry: QueueEntry = {
          options: lockOptions,
          callback,
          resolve,
          reject,
          granted: false,
          detach: () => {
            detached = true;
            signal?.removeEventListener('abort', onAbort);
          },
        };
        const onAbort = () => {
          if (detached || entry.granted) return;
          const index = state.queue.indexOf(entry);
          if (index >= 0) state.queue.splice(index, 1);
          entry.detach();
          reject(abortError());
          pump(name);
        };
        if (signal?.aborted === true) {
          reject(abortError());
          return;
        }
        signal?.addEventListener('abort', onAbort);
        if (lockOptions.ifAvailable && state.held) {
          Promise.resolve()
            .then(() => callback(false))
            .then(
              () => {
                entry.detach();
                resolve();
              },
              (error: unknown) => {
                entry.detach();
                reject(error);
              },
            );
          return;
        }
        state.queue.push(entry);
        pump(name);
      }),
    pending: (name: string) => stateFor(name).queue.length,
    holders: (name: string) => (stateFor(name).held ? 1 : 0),
  });
}
