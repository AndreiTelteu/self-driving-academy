import { requireContract } from '../sessions';

/**
 * Local IndexedDB schema and repository contracts for PBI 127.
 *
 * The schema is data, not logic: stores, key paths and indexes are declared here so the same
 * declarations drive the browser adapter, the in-memory test double, the migrations and the
 * evidence report. Domain records stay owned by their modules (005 identity, 009 settings,
 * 109 profile versions, 069 segments, 116 missions); this module only owns how they are stored,
 * bounded and committed atomically.
 */
export const PERSISTENCE_FORMAT = 'self-driving-academy-local' as const;

/** One database per origin. The name is stable because 132/136 migrate data in place. */
export const PERSISTENCE_DB_NAME = 'self-driving-academy' as const;

/** Current schema version. Version 1 remains declared so an older database upgrades in place. */
export const PERSISTENCE_SCHEMA_VERSION = 2 as const;

export const persistenceStoreNames = [
  'meta',
  'profiles',
  'profileActivations',
  'segments',
  'scenarios',
  'progress',
  'settings',
  'checkpoints',
] as const;
export type PersistenceStoreName = (typeof persistenceStoreNames)[number];

/** Nouns-only index names; the store plus the index name is the global identity. */
export const persistenceIndexNames = [
  'byProfile',
  'bySession',
  'byStatus',
  'byGeneration',
] as const;
export type PersistenceIndexName = (typeof persistenceIndexNames)[number];

export interface IndexDefinition {
  readonly name: PersistenceIndexName;
  readonly keyPath: string;
  readonly unique: boolean;
}

export interface StoreDefinition {
  readonly name: PersistenceStoreName;
  readonly keyPath: string;
  readonly indexes: readonly IndexDefinition[];
}

export interface SchemaStep {
  readonly version: number;
  readonly id: string;
  /** Stores created by this step. Re-creating an existing store is a migration error. */
  readonly create: readonly StoreDefinition[];
  /** Indexes added to stores created by an earlier step. */
  readonly indexes: readonly {
    readonly store: PersistenceStoreName;
    readonly index: IndexDefinition;
  }[];
  readonly drop: readonly PersistenceStoreName[];
}

/**
 * Fixed budgets. A caller, a payload or a page cannot grow these values: every write is validated
 * and measured before it reaches a transaction, and every read is bounded by `maxListEntries`.
 */
export const PERSISTENCE_LIMITS = Object.freeze({
  /** Canonical UTF-8 bytes of one record body. */
  maxBodyBytes: 262_144,
  /** Canonical UTF-8 bytes of one complete stored record. */
  maxRecordBytes: 1_048_576,
  maxBodyDepth: 24,
  maxBodyEntries: 20_000,
  /** Rows returned by one list call; a larger result is an explicit LIST_LIMIT rejection. */
  maxListEntries: 512,
  maxIdCodeUnits: 256,
  maxTextCodeUnits: 512,
  maxTagCodeUnits: 48,
  maxReasonCodeUnits: 240,
  /** `open()` waits this long for a blocked upgrade before reporting OPEN_TIMEOUT. */
  openTimeoutMs: 15_000,
});

export const persistenceRecordKinds = ['SEGMENT', 'SCENARIO', 'PROGRESS'] as const;
export type PersistenceRecordKind = (typeof persistenceRecordKinds)[number];

/** Closed reasons; the same vocabulary is used for open states and rejected writes. */
export const persistenceReasonCodes = [
  'OPEN_FAILED',
  'OPEN_TIMEOUT',
  'SCHEMA_TOO_NEW',
  'MIGRATION_FAILED',
  'UPGRADE_BLOCKED',
  'UPGRADE_ABORTED',
  'VERSION_CHANGE',
  'INDEXEDDB_UNAVAILABLE',
  'WEB_LOCKS_UNAVAILABLE',
  'WRITER_REQUIRED',
  'WRITER_HELD_BY_OTHER_TAB',
  'WRITER_RELEASED',
  'REPOSITORY_CLOSED',
  'REPOSITORY_DISPOSED',
  'INVALID_RECORD',
  'RECORD_TOO_LARGE',
  'BODY_INVALID',
  'BODY_TOO_LARGE',
  'PROFILE_CHECKSUM_MISMATCH',
  'REFERENCE_MISSING',
  'IMMUTABLE_RECORD',
  'STALE_REVISION',
  'UNKNOWN_STORE',
  'UNKNOWN_INDEX',
  'STORAGE_FULL',
  'TRANSACTION_ABORTED',
  'LIST_LIMIT',
] as const;
export type PersistenceReasonCode = (typeof persistenceReasonCodes)[number];

export interface PersistenceRejection {
  readonly code: PersistenceReasonCode;
  readonly message: string;
  readonly path: string | null;
}

export class PersistenceError extends Error {
  readonly code: PersistenceReasonCode;
  readonly path: string | null;

  constructor(code: PersistenceReasonCode, message: string, path: string | null = null) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    this.path = path;
  }
}

export function persistenceRejection(
  code: PersistenceReasonCode,
  message: string,
  path: string | null = null,
): PersistenceRejection {
  return Object.freeze({ code, message, path });
}

export type RepositoryState =
  | 'CLOSED'
  | 'OPENING'
  | 'READY'
  | 'BLOCKED_UPGRADE'
  | 'RELEASED_FOR_UPGRADE'
  | 'FAILED'
  | 'DISPOSED';

/** Writer role of this page. Reads are allowed for every role except NONE. */
export type RepositoryRole = 'NONE' | 'WRITER' | 'READ_ONLY' | 'WAITING' | 'RELEASED';

export interface RepositoryStatusSnapshot {
  readonly state: RepositoryState;
  readonly role: RepositoryRole;
  readonly database: string;
  readonly version: number | null;
  readonly reason: PersistenceReasonCode | null;
  readonly detail: string | null;
}

export interface OpenReport {
  readonly status: 'READY' | 'BLOCKED_UPGRADE' | 'FAILED';
  readonly version: number | null;
  readonly previousVersion: number | null;
  readonly appliedMigrations: readonly string[];
  readonly role: RepositoryRole;
  readonly rejection: PersistenceRejection | null;
}

export interface WriteCommitted<T> {
  readonly status: 'COMMITTED';
  readonly value: T;
  readonly bytes: number;
}

export interface WriteRejected {
  readonly status: 'REJECTED';
  readonly value: null;
  readonly rejection: PersistenceRejection;
}

export type WriteResult<T> = WriteCommitted<T> | WriteRejected;

/**
 * Bounded, queryable envelope shared by segments, scenarios and progress.
 *
 * `body` is the domain payload (069 segment record, 040 scenario snapshot, 116 tracker entry).
 * It is stored as validated plain JSON data with a measured size, so a later export (135/234) can
 * canonicalize exactly what is in the database instead of re-serializing live objects.
 */
export interface PersistedRecord {
  readonly schemaVersion: 1;
  readonly recordKind: PersistenceRecordKind;
  readonly recordId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  /** Lifecycle token used by the `byStatus` index; `null` when the record has no lifecycle. */
  readonly status: string | null;
  /** Monotonic per record; a lower or equal revision never replaces a stored one. */
  readonly revision: number;
  readonly createdAt: string;
  /** Measured canonical bytes of `body`; derived on write and re-checked on read. */
  readonly bodyBytes: number;
  readonly body: Readonly<Record<string, unknown>>;
}

export type PersistedRecordInput = Omit<PersistedRecord, 'bodyBytes'> & {
  readonly bodyBytes?: number;
};

/** Activation pointer; the 128 transaction writes it together with the profile version. */
export interface ActivationRecord {
  readonly schemaVersion: 1;
  readonly playerId: string;
  readonly profileId: string;
  readonly versionId: string;
  readonly sequence: number;
  readonly activatedAt: string;
}

/**
 * Durable checkpoint envelope. The complete world state is owned by 206; this record guarantees
 * the identity, version and generation fields 136 needs before trusting a payload.
 */
export interface CheckpointRecord {
  readonly schemaVersion: 1;
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly profileId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  /** Coherent generation committed as one unit; a partial generation is never activated. */
  readonly generation: number;
  readonly learningEpoch: number;
  readonly engineVersion: string;
  readonly physicsVersion: string;
  readonly mapVersion: string;
  readonly createdAt: string;
  readonly bodyBytes: number;
  readonly body: Readonly<Record<string, unknown>>;
}

export type CheckpointRecordInput = Omit<CheckpointRecord, 'bodyBytes'> & {
  readonly bodyBytes?: number;
};

/** Small key/value row used for the format marker and migration bookkeeping. */
export interface MetaRecord {
  readonly key: string;
  readonly value: unknown;
}

export const META_SCHEMA_KEY = 'schema' as const;

export interface RepositoryStats {
  readonly state: RepositoryState;
  readonly role: RepositoryRole;
  readonly version: number | null;
  readonly counts: Readonly<Record<PersistenceStoreName, number>>;
  readonly writes: number;
  readonly rejections: number;
  readonly transactions: number;
  readonly versionChanges: number;
  readonly blockedUpgrades: number;
}

export function isPersistenceRecordKind(value: unknown): value is PersistenceRecordKind {
  return typeof value === 'string' && (persistenceRecordKinds as readonly string[]).includes(value);
}

/** Bounded identity text; trims are rejected so two ids can never mean the same row. */
export function boundedText(value: unknown, field: string, maximum: number): string {
  requireContract(typeof value === 'string' && value.length > 0, `Expected ${field}`);
  requireContract(value.trim() === value, `${field} must not be padded`);
  requireContract(value.length <= maximum, `${field} exceeds ${maximum} code units`);
  return value;
}
