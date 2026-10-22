import { createProfileSnapshot } from '../profiles';
import type { SimulationSnapshot } from '../simulation';

/** Minimal adapter port, not the savefile or IndexedDB schema. */
export interface SnapshotStore {
  save(snapshot: SimulationSnapshot): Promise<void>;
  load(): Promise<SimulationSnapshot | null>;
}

/** Volatile bootstrap adapter; durable persistence belongs to later PBIs. */
export function createMemorySnapshotStore(): SnapshotStore {
  let saved: SimulationSnapshot | null = null;
  return {
    save: (snapshot) => {
      saved = Object.freeze({
        tick: snapshot.tick,
        profile: createProfileSnapshot(snapshot.profile),
      });
      return Promise.resolve();
    },
    load: () => Promise.resolve(saved),
  };
}

export {
  PERSISTENCE_DB_NAME,
  PERSISTENCE_FORMAT,
  PERSISTENCE_LIMITS,
  PERSISTENCE_SCHEMA_VERSION,
  META_SCHEMA_KEY,
  PersistenceError,
  boundedText,
  isPersistenceRecordKind,
  persistenceReasonCodes,
  persistenceRecordKinds,
  persistenceRejection,
  persistenceIndexNames,
  persistenceStoreNames,
} from './contracts';
export type {
  ActivationRecord,
  CheckpointRecord,
  CheckpointRecordInput,
  IndexDefinition,
  MetaRecord,
  OpenReport,
  PersistedRecord,
  PersistedRecordInput,
  PersistenceRecordKind,
  PersistenceReasonCode,
  PersistenceRejection,
  RepositoryRole,
  RepositoryState,
  RepositoryStats,
  RepositoryStatusSnapshot,
  SchemaStep,
  StoreDefinition,
  WriteCommitted,
  WriteRejected,
  WriteResult,
} from './contracts';
export {
  PERSISTENCE_SCHEMA_STEPS,
  PERSISTENCE_KEY_PATHS,
  applySchemaStep,
  indexDefinition,
  planUpgrade,
  schemaStores,
  storeDefinition,
  verifySchemaDeclaration,
} from './schema';
export {
  measureJsonBytes,
  parseActivationRecord,
  parseCheckpointRecord,
  parseMetaRecord,
  parsePersistedRecord,
  parseProfileRecord,
  parseSettingsRecord,
  storageKey,
} from './records';
export { cloneValue, createMemoryIdbFactory, createMemoryLockManager } from './memory-idb';
export type {
  MemoryDatabaseInspection,
  MemoryIdbFactory,
  MemoryIdbOptions,
  MemoryLockManager,
} from './memory-idb';
export { browserIndexedDbFactory, createIndexedDbFactory } from './indexeddb';
export { WRITER_LOCK_NAME, createWriterAuthority } from './writer';
export type { WriterAuthority, WriterAuthorityOptions, WriterAuthorityState } from './writer';
export { createLocalRepository } from './repository';
export type {
  LocalRepository,
  LocalRepositoryOptions,
  ProfileActivationOutcome,
} from './repository';
export {
  PROFILE_TRANSACTION_VERSION,
  buildProfileHistory,
  classifyProfileSource,
  commitProfileActivationRows,
} from './profile-transaction';
export type {
  ProfileActivationCommit,
  ProfileHistory,
  ProfileSourceKind,
  ProfileTransactionHooks,
} from './profile-transaction';
export {
  SEGMENT_DIGEST_ALGORITHM,
  SEGMENT_STORE_VERSION,
  digestEvents,
  normalizeSegmentInput,
  readSegment,
  segmentIncompleteReasons,
  writeSegment,
} from './segment-store';
export type {
  RecoveredSegment,
  SegmentCompleteness,
  SegmentEventFact,
  SegmentEventInput,
  SegmentIncompleteReason,
  SegmentSaveInput,
  SegmentWriteHooks,
  SegmentWriteOptions,
  SegmentWriteResult,
} from './segment-store';
export { createSegmentWriteQueue } from './write-queue';
export type {
  SegmentQueueResult,
  SegmentWriteQueue,
  SegmentWriteQueueOptions,
  SegmentWriteQueueStats,
} from './write-queue';
export {
  INTERVENTION_CHECKPOINT_VERSION,
  createInterventionCheckpoint,
  writeInterventionCheckpoint,
} from './intervention-checkpoint';
export type {
  InterventionCheckpoint,
  InterventionCheckpointInput,
} from './intervention-checkpoint';
export type {
  DatabasePort,
  FactoryPort,
  LockManagerPort,
  LockOptions,
  OpenBlocked,
  OpenFailed,
  OpenOpened,
  OpenOutcome,
  OpenRequest,
  SchemaUpgrader,
  TransactionMode,
  TransactionPort,
  VersionChangeEvent,
} from './ports';
