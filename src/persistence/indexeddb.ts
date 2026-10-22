import { requireContract } from '../sessions';
import { PersistenceError } from './contracts';
import type {
  PersistenceIndexName,
  PersistenceReasonCode,
  PersistenceStoreName,
} from './contracts';
import { applySchemaStep } from './schema';
import type {
  DatabasePort,
  FactoryPort,
  OpenOutcome,
  OpenRequest,
  SchemaUpgrader,
  TransactionMode,
  TransactionPort,
  VersionChangeEvent,
} from './ports';

/**
 * Production adapter over the real IndexedDB API.
 *
 * The declarations below are structural on purpose: `src/persistence` is imported by the Node test
 * suite, which type-checks without the DOM library, so the adapter describes the exact IDB surface
 * it uses instead of naming DOM types. No behaviour is simulated here beyond mapping events to the
 * port promises; PBI 235 verifies this adapter inside a browser.
 */
interface IdbRequestLike<T> {
  onsuccess: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readonly result: T;
  readonly error: unknown;
}

interface IdbOpenRequestLike extends IdbRequestLike<IdbDatabaseLike> {
  onupgradeneeded: ((event: unknown) => void) | null;
  onblocked: ((event: unknown) => void) | null;
  readonly transaction: IdbTransactionLike | null;
}

interface IdbIndexLike {
  getAll(key: string): IdbRequestLike<unknown[]>;
}

interface IdbObjectStoreLike {
  put(value: unknown): IdbRequestLike<unknown>;
  get(key: string): IdbRequestLike<unknown>;
  getAll(): IdbRequestLike<unknown[]>;
  delete(key: string): IdbRequestLike<unknown>;
  index(name: string): IdbIndexLike;
  createIndex(name: string, keyPath: string, options?: { unique?: boolean }): unknown;
}

interface IdbTransactionLike {
  objectStore(name: string): IdbObjectStoreLike;
  abort(): void;
  readonly error: unknown;
  oncomplete: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onabort: ((event: unknown) => void) | null;
}

interface IdbDatabaseLike {
  readonly version: number;
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options: { keyPath: string }): IdbObjectStoreLike;
  deleteObjectStore(name: string): void;
  transaction(stores: string | readonly string[], mode: string): IdbTransactionLike;
  close(): void;
  onversionchange: ((event: unknown) => void) | null;
}

interface IdbFactoryLike {
  open(name: string, version?: number): IdbOpenRequestLike;
  deleteDatabase(name: string): IdbRequestLike<unknown>;
}

function reasonFromError(error: unknown): PersistenceReasonCode {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';
  if (name === 'QuotaExceededError') return 'STORAGE_FULL';
  if (name === 'VersionError') return 'SCHEMA_TOO_NEW';
  if (name === 'AbortError') return 'TRANSACTION_ABORTED';
  return 'OPEN_FAILED';
}

function mapError(error: unknown, fallback: PersistenceReasonCode): PersistenceError {
  const code = reasonFromError(error);
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : 'IndexedDB operation failed';
  return new PersistenceError(code === 'OPEN_FAILED' ? fallback : code, message);
}

function isFactory(value: unknown): value is IdbFactoryLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { open?: unknown }).open === 'function' &&
    typeof (value as { deleteDatabase?: unknown }).deleteDatabase === 'function'
  );
}

/** Reads `globalThis.indexedDB` lazily so importing this module never touches a browser global. */
export function browserIndexedDbFactory(source?: unknown): IdbFactoryLike {
  const candidate = source ?? (globalThis as { indexedDB?: unknown }).indexedDB;
  if (!isFactory(candidate)) {
    throw new PersistenceError(
      'INDEXEDDB_UNAVAILABLE',
      'IndexedDB is not available in this environment',
    );
  }
  return candidate;
}

function requestPromise<T>(request: IdbRequestLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(mapError(request.error, 'TRANSACTION_ABORTED'));
  });
}

function transactionPromise(transaction: IdbTransactionLike): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(mapError(transaction.error, 'TRANSACTION_ABORTED'));
    transaction.onabort = () =>
      reject(new PersistenceError('TRANSACTION_ABORTED', 'The IndexedDB transaction aborted'));
  });
}

export function createIndexedDbFactory(source?: unknown): FactoryPort {
  const factory = browserIndexedDbFactory(source);

  function upgrader(database: IdbDatabaseLike, transaction: IdbTransactionLike): SchemaUpgrader {
    const cached = new Map<PersistenceStoreName, IdbObjectStoreLike>();
    const store = (name: PersistenceStoreName): IdbObjectStoreLike => {
      const existing = cached.get(name);
      if (existing !== undefined) return existing;
      const created = transaction.objectStore(name);
      cached.set(name, created);
      return created;
    };
    return {
      hasStore: (name) => database.objectStoreNames.contains(name),
      createStore: (definition) => {
        requireContract(!database.objectStoreNames.contains(definition.name), 'Store exists');
        const created = database.createObjectStore(definition.name, {
          keyPath: definition.keyPath,
        });
        for (const entry of definition.indexes) {
          created.createIndex(entry.name, entry.keyPath, { unique: entry.unique });
        }
        cached.set(definition.name, created);
      },
      deleteStore: (name) => {
        database.deleteObjectStore(name);
        cached.delete(name);
      },
      createIndex: (name, definition) => {
        store(name).createIndex(definition.name, definition.keyPath, {
          unique: definition.unique,
        });
      },
      put: (name, value) => {
        store(name).put(value);
      },
    };
  }

  function connect(database: IdbDatabaseLike): DatabasePort {
    const listeners = new Set<(event: VersionChangeEvent) => void>();
    database.onversionchange = (event: unknown) => {
      const change = (event ?? {}) as { oldVersion?: unknown; newVersion?: unknown };
      const fromVersion =
        typeof change.oldVersion === 'number' ? change.oldVersion : database.version;
      const toVersion = typeof change.newVersion === 'number' ? change.newVersion : 0;
      for (const listener of [...listeners]) listener({ fromVersion, toVersion });
    };
    const requireStore = (name: PersistenceStoreName, stores: readonly PersistenceStoreName[]) => {
      requireContract(stores.includes(name), `Store ${name} is not part of this transaction`);
    };
    return {
      version: database.version,
      transact: async <T>(
        stores: readonly PersistenceStoreName[],
        mode: TransactionMode,
        work: (transaction: TransactionPort) => Promise<T> | T,
      ): Promise<T> => {
        const transaction = database.transaction([...stores], mode);
        let finished = false;
        const port: TransactionPort = {
          get: async (name, key) => {
            requireStore(name, stores);
            return requestPromise(transaction.objectStore(name).get(key));
          },
          getAll: async (name) => {
            requireStore(name, stores);
            return requestPromise(transaction.objectStore(name).getAll());
          },
          getAllByIndex: async (name, index: PersistenceIndexName, key) => {
            requireStore(name, stores);
            return requestPromise(transaction.objectStore(name).index(index).getAll(key));
          },
          put: async (name, value) => {
            requireStore(name, stores);
            await requestPromise(transaction.objectStore(name).put(value));
          },
          delete: async (name, key) => {
            requireStore(name, stores);
            await requestPromise(transaction.objectStore(name).delete(key));
          },
        };
        const completed = transactionPromise(transaction);
        try {
          const result = await work(port);
          finished = true;
          await completed;
          return result;
        } catch (error) {
          if (!finished) {
            try {
              transaction.abort();
            } catch {
              // The transaction already aborted or completed; the outcome below is still correct.
            }
          }
          throw error;
        }
      },
      close: () => {
        database.close();
        listeners.clear();
      },
      onVersionChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  return {
    open: (request: OpenRequest) =>
      new Promise<OpenOutcome>((resolve) => {
        let openRequest: IdbOpenRequestLike;
        try {
          openRequest = factory.open(request.name, request.version);
        } catch (error) {
          resolve({
            status: 'FAILED',
            code: 'OPEN_FAILED',
            message: error instanceof Error ? error.message : 'indexedDB.open threw',
          });
          return;
        }
        let previousVersion = 0;
        let applied: readonly string[] = Object.freeze([]);
        let upgradeError: unknown = null;
        let cancelled = false;
        let blockedResolved = false;
        let settleBlocked: ((outcome: OpenOutcome) => void) | null = null;
        const blockedPromise = new Promise<OpenOutcome>((resolveBlocked) => {
          settleBlocked = resolveBlocked;
        });
        openRequest.onupgradeneeded = (event: unknown) => {
          const target = openRequest.result;
          const change = (event ?? {}) as { oldVersion?: unknown };
          previousVersion = typeof change.oldVersion === 'number' ? change.oldVersion : 0;
          const transaction = openRequest.transaction;
          if (transaction === null) {
            upgradeError = new PersistenceError(
              'MIGRATION_FAILED',
              'The upgrade transaction is missing',
            );
            return;
          }
          try {
            const writer = upgrader(target, transaction);
            const steps = request.plan(previousVersion);
            for (const step of steps) applySchemaStep(writer, step, request.now);
            applied = Object.freeze(steps.map((step) => step.id));
          } catch (error) {
            upgradeError = error;
            try {
              transaction.abort();
            } catch {
              // Aborting is best effort; the open request reports the failure either way.
            }
          }
        };
        openRequest.onblocked = () => {
          blockedResolved = true;
          resolve({
            status: 'BLOCKED',
            requestedVersion: request.version,
            currentVersion: previousVersion,
            whenUnblocked: () => blockedPromise,
            cancel: () => {
              cancelled = true;
              settleBlocked?.({
                status: 'FAILED',
                code: 'UPGRADE_ABORTED',
                message: 'The blocked upgrade was cancelled',
              });
            },
          });
        };
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          if (cancelled) {
            database.close();
            return;
          }
          if (blockedResolved) {
            settleBlocked?.({
              status: 'OPENED',
              database: connect(database),
              previousVersion,
              appliedMigrations: applied,
            });
            return;
          }
          resolve({
            status: 'OPENED',
            database: connect(database),
            previousVersion,
            appliedMigrations: applied,
          });
        };
        openRequest.onerror = () => {
          const failure: OpenOutcome = {
            status: 'FAILED',
            code:
              upgradeError instanceof PersistenceError
                ? upgradeError.code
                : upgradeError === null
                  ? 'OPEN_FAILED'
                  : 'MIGRATION_FAILED',
            message:
              upgradeError instanceof Error
                ? upgradeError.message
                : mapError(openRequest.error, 'OPEN_FAILED').message,
          };
          if (blockedResolved) {
            settleBlocked?.(failure);
            return;
          }
          resolve(failure);
        };
      }),
    deleteDatabase: (name: string) =>
      new Promise<void>((resolve, reject) => {
        const request = factory.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(mapError(request.error, 'OPEN_FAILED'));
      }),
  };
}
