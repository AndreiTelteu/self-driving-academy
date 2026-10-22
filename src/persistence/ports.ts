import type {
  IndexDefinition,
  PersistenceIndexName,
  PersistenceReasonCode,
  PersistenceStoreName,
  SchemaStep,
  StoreDefinition,
} from './contracts';

/**
 * Narrow ports over the storage primitives the repository needs.
 *
 * Two adapters implement them: the real IndexedDB adapter (`indexeddb.ts`) and the in-memory
 * double (`memory-idb.ts`) used by the Node test suite. Keeping the port small is what makes the
 * double honest: it models versions, upgrade blocking, transaction rollback and structured-clone
 * semantics, and nothing else.
 */
export type TransactionMode = 'readonly' | 'readwrite';

export interface TransactionPort {
  /** `undefined` when the key is absent; the value is a structured clone, never a live reference. */
  get(store: PersistenceStoreName, key: string): Promise<unknown>;
  /** All rows of one store in primary-key order. */
  getAll(store: PersistenceStoreName): Promise<readonly unknown[]>;
  /** Rows whose index key equals `key`, ordered by index key then primary key. */
  getAllByIndex(
    store: PersistenceStoreName,
    index: PersistenceIndexName,
    key: string,
  ): Promise<readonly unknown[]>;
  put(store: PersistenceStoreName, value: unknown): Promise<void>;
  delete(store: PersistenceStoreName, key: string): Promise<void>;
}

export interface VersionChangeEvent {
  readonly fromVersion: number;
  readonly toVersion: number;
}

export interface DatabasePort {
  readonly version: number;
  /**
   * Runs `work` inside one transaction. The callback may only await port operations: awaiting
   * timers or unrelated promises would let a real IndexedDB transaction auto-commit early.
   */
  transact<T>(
    stores: readonly PersistenceStoreName[],
    mode: TransactionMode,
    work: (transaction: TransactionPort) => Promise<T> | T,
  ): Promise<T>;
  close(): void;
  /** Notifies this connection that another tab requests a newer schema version. */
  onVersionChange(listener: (event: VersionChangeEvent) => void): () => void;
}

export interface OpenRequest {
  readonly name: string;
  readonly version: number;
  /**
   * Called inside the upgrade with the on-disk version and returns the steps to apply. Planning
   * inside the upgrade is what IndexedDB guarantees: `oldVersion` is only known there.
   */
  readonly plan: (fromVersion: number) => readonly SchemaStep[];
  /** Clock used by schema bookkeeping (the format marker), injected by the repository. */
  readonly now: () => string;
}

export interface OpenOpened {
  readonly status: 'OPENED';
  readonly database: DatabasePort;
  readonly previousVersion: number;
  readonly appliedMigrations: readonly string[];
}

/**
 * A newer version is requested while another connection still holds the database. The state is
 * explicit and cancellable; `whenUnblocked` settles when the blocking connection closes.
 */
export interface OpenBlocked {
  readonly status: 'BLOCKED';
  readonly requestedVersion: number;
  readonly currentVersion: number;
  readonly whenUnblocked: () => Promise<OpenOutcome>;
  readonly cancel: () => void;
}

export interface OpenFailed {
  readonly status: 'FAILED';
  readonly code: PersistenceReasonCode;
  readonly message: string;
}

export type OpenOutcome = OpenOpened | OpenBlocked | OpenFailed;

export interface FactoryPort {
  open(request: OpenRequest): Promise<OpenOutcome>;
  deleteDatabase(name: string): Promise<void>;
}

/** Schema operations available inside an upgrade; no data reads, so no async transform. */
export interface SchemaUpgrader {
  hasStore(name: PersistenceStoreName): boolean;
  createStore(definition: StoreDefinition): void;
  deleteStore(name: PersistenceStoreName): void;
  createIndex(store: PersistenceStoreName, index: IndexDefinition): void;
  /** Seeds a record inside the upgrade transaction (the schema marker uses this). */
  put(store: PersistenceStoreName, value: unknown): void;
}

export interface LockOptions {
  readonly mode: 'exclusive';
  /** When the lock is held by someone else, the callback still runs with `held: false`. */
  readonly ifAvailable: boolean;
  readonly signal?: AbortSignal;
}

/**
 * The Web Locks shape, narrowed to what the writer authority uses. `callback` receives `held`
 * and keeps the lock until its returned promise settles.
 */
export interface LockManagerPort {
  readonly available: boolean;
  request(
    name: string,
    options: LockOptions,
    callback: (held: boolean) => Promise<void>,
  ): Promise<void>;
}
