import {
  PERSISTENCE_LIMITS,
  PersistenceError,
  boundedText,
  persistenceRejection,
} from './contracts';
import type {
  CheckpointRecord,
  CheckpointRecordInput,
  PersistedRecord,
  PersistedRecordInput,
  PersistenceRejection,
  WriteResult,
} from './contracts';
import type { LocalRepository } from './repository';
import type {
  BoundedGeneration,
  BoundedPipelineRejectionCode,
  BoundedPipelineStore,
  BoundedStoreCommit,
  ProtectedFact,
} from './bounded-pipeline';

/**
 * Durable store adapter for the bounded pipeline (PBI 222).
 *
 * The pipeline owns the staging, the byte caps and the commit lane; this adapter only turns one
 * prepared generation into the rows PBI 127/206 already define:
 *
 * 1. every protected fact becomes its own `progress` row with a stable `recordId` and the generation
 *    as its revision, so a retry overwrites the same row instead of duplicating a reward;
 * 2. the checkpoint reference is the single `checkpoints` row of the session, written last.
 *
 * The order is deliberate: protected rows are durable before the checkpoint that would prove them.
 * A crash between the two leaves the facts durable and the previous checkpoint intact, which is
 * exactly what `recoverBoundedPipeline` reports; the reverse order would lose a reward on a crash.
 * The checkpoint row is written in one transaction, so there is never a partially activated
 * generation.
 */

export const BOUNDED_PIPELINE_FACT_RECORD_PREFIX = 'bounded-pipeline-fact:' as const;

/** Stable row identity of one protected fact; the same fact never becomes a second row. */
export function boundedPipelineFactRecordId(factId: string): string {
  return `${BOUNDED_PIPELINE_FACT_RECORD_PREFIX}${boundedText(
    factId,
    'factId',
    PERSISTENCE_LIMITS.maxIdCodeUnits,
  )}`;
}

export interface RepositoryPipelineStoreOptions {
  readonly repository: LocalRepository;
  /** `false` commits only the checkpoint reference; protected facts stay pending. */
  readonly recordFacts?: boolean;
  readonly now?: () => string;
}

function rejectionOf(error: unknown): PersistenceRejection {
  return error instanceof PersistenceError
    ? persistenceRejection(error.code, error.message, error.path)
    : persistenceRejection(
        'TRANSACTION_ABORTED',
        error instanceof Error ? error.message : 'The pipeline write failed',
        'pipeline',
      );
}

function rejected(
  generation: BoundedGeneration,
  rejection: PersistenceRejection,
  factsDurable: number,
): BoundedStoreCommit {
  return Object.freeze({
    status: 'REJECTED' as const,
    generation: generation.generation,
    code: rejection.code as BoundedPipelineRejectionCode,
    message: rejection.message,
    bytes: 0,
    factsDurable,
  });
}

/** One protected fact as a bounded `progress` row; the generation is the row revision. */
export function protectedFactRecord(
  fact: ProtectedFact,
  generation: BoundedGeneration,
  createdAt: string,
): PersistedRecordInput {
  return {
    schemaVersion: 1,
    recordKind: 'PROGRESS',
    recordId: boundedPipelineFactRecordId(fact.factId),
    sessionId: generation.sessionId,
    worldEpoch: generation.worldEpoch,
    // The 127 lifecycle vocabulary is closed; the exact fact kind stays in the body. A credit that
    // happened is COMPLETED, an invalidated learning artifact is FAILED and an evaluated
    // opportunity is still ACTIVE.
    status: protectedFactStatus(fact.kind),
    revision: generation.generation,
    createdAt,
    body: {
      factId: fact.factId,
      kind: fact.kind,
      tick: fact.tick,
      entityId: fact.entityId,
      generation: generation.generation,
      payload: fact.payload,
    },
  };
}

/** The declared lifecycle status of a protected fact, from the closed 127 vocabulary. */
export function protectedFactStatus(
  kind: ProtectedFact['kind'],
): 'ACTIVE' | 'COMPLETED' | 'FAILED' {
  switch (kind) {
    case 'COMMERCIAL_EVENT':
    case 'REWARD':
      return 'COMPLETED';
    case 'LEARNING_INVALIDATION':
      return 'FAILED';
    case 'OPPORTUNITY_TICK':
      return 'ACTIVE';
  }
}

/** The one checkpoint row of the session; the 206 body and checksum travel unchanged. */
export function pipelineCheckpointRecord(
  generation: BoundedGeneration,
  createdAt: string,
): CheckpointRecordInput {
  return {
    schemaVersion: 1,
    checkpointId: generation.checkpointId,
    sessionId: generation.sessionId,
    profileId: generation.profileId,
    worldEpoch: generation.worldEpoch,
    tick: generation.tick,
    generation: generation.generation,
    learningEpoch: generation.learningEpoch,
    engineVersion: generation.versions.engineVersion,
    physicsVersion: generation.versions.physicsVersion,
    mapVersion: generation.versions.mapVersion,
    createdAt,
    body: generation.body,
  };
}

async function writeGeneration(
  repository: LocalRepository,
  generation: BoundedGeneration,
  facts: readonly PersistedRecordInput[],
  checkpoint: CheckpointRecordInput,
): Promise<BoundedStoreCommit> {
  let factsDurable = 0;
  for (const fact of facts) {
    let written: WriteResult<PersistedRecord>;
    try {
      written = await repository.putProgress(fact);
    } catch (error) {
      return rejected(generation, rejectionOf(error), factsDurable);
    }
    if (written.status === 'REJECTED') {
      return rejected(generation, written.rejection, factsDurable);
    }
    factsDurable += 1;
  }
  let written: WriteResult<CheckpointRecord>;
  try {
    written = await repository.putCheckpoint(checkpoint);
  } catch (error) {
    return rejected(generation, rejectionOf(error), factsDurable);
  }
  if (written.status === 'REJECTED') {
    return rejected(generation, written.rejection, factsDurable);
  }
  return Object.freeze({
    status: 'COMMITTED' as const,
    generation: generation.generation,
    code: null,
    message: null,
    bytes: written.bytes,
    factsDurable,
  });
}

/**
 * Default adapter. It deliberately has no `handoffChunk`: the 127 schema has no replay store, so the
 * replay window stays in RAM (bounded by `optionalReplayStorageBytes`) and the pipeline reports
 * `replay.durable: false` instead of pretending the chunks were persisted.
 */
export function createRepositoryPipelineStore(
  options: RepositoryPipelineStoreOptions,
): BoundedPipelineStore {
  const repository = options.repository;
  const recordFacts = options.recordFacts !== false;
  const now = options.now ?? (() => new Date().toISOString());
  const store: BoundedPipelineStore = {
    handoff(generation: BoundedGeneration): Promise<BoundedStoreCommit> {
      const createdAt = now();
      const facts = recordFacts
        ? generation.protectedFacts.map((fact) => protectedFactRecord(fact, generation, createdAt))
        : [];
      return writeGeneration(
        repository,
        generation,
        facts,
        pipelineCheckpointRecord(generation, createdAt),
      );
    },
  };
  return Object.freeze(store);
}

/* ------------------------------------------------------------------ recovery */

export interface BoundedRecoverySnapshot {
  readonly sessionId: string;
  readonly lastDurableGeneration: number | null;
  readonly lastDurableTick: number | null;
  readonly lastDurableBytes: number | null;
  readonly lastDurableChecksum: string | null;
  /** Protected rows found in the store, or `null` when the listing was refused. */
  readonly factRows: number | null;
  /**
   * Durable facts whose generation was never published as the checkpoint. They are not lost: the
   * caller reconciles them by not re-emitting the same fact id.
   */
  readonly orphanFacts: number | null;
  readonly orphanGenerations: readonly number[];
  /** A generation is one checkpoint row in one transaction; a partial one cannot exist. */
  readonly partialGenerations: 0;
  readonly detail: string;
}

function bodyGeneration(body: Readonly<Record<string, unknown>>): number | null {
  const value = body.generation;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function bodyChecksum(body: Readonly<Record<string, unknown>>): string | null {
  const value = body.checksum;
  return typeof value === 'string' ? value : null;
}

/**
 * Reads what survived a crash between generations. The last published generation is whatever the
 * checkpoint row says; prepared-but-uncommitted work lived in RAM and is gone by definition. The
 * only thing that can outlive it is a protected fact written just before the crash, and it is
 * reported rather than silently attributed to the previous checkpoint.
 */
export async function recoverBoundedPipeline(
  repository: LocalRepository,
  sessionId: string,
): Promise<BoundedRecoverySnapshot> {
  const key = boundedText(sessionId, 'sessionId', PERSISTENCE_LIMITS.maxIdCodeUnits);
  const checkpoint = await repository.latestCheckpoint(key);
  let rows: readonly PersistedRecord[] | null;
  try {
    rows = await repository.listProgress(key);
  } catch {
    rows = null;
  }
  const facts =
    rows === null
      ? null
      : rows.filter((row) => row.recordId.startsWith(BOUNDED_PIPELINE_FACT_RECORD_PREFIX));
  const lastGeneration = checkpoint === null ? null : checkpoint.generation;
  const orphans =
    facts === null
      ? null
      : facts.filter((row) => {
          const generation = bodyGeneration(row.body);
          return generation !== null && (lastGeneration === null || generation > lastGeneration);
        });
  const generations =
    orphans === null
      ? null
      : [...new Set(orphans.map((row) => bodyGeneration(row.body)))].filter(
          (value): value is number => value !== null,
        );
  const detail =
    checkpoint === null
      ? 'No generation was ever published for this session; a prepared generation and its facts lived in RAM and are gone'
      : `Generation ${checkpoint.generation} at tick ${checkpoint.tick} is durable; prepared work in RAM and any later fact row are reported as unpublished`;
  return Object.freeze({
    sessionId: key,
    lastDurableGeneration: lastGeneration,
    lastDurableTick: checkpoint === null ? null : checkpoint.tick,
    lastDurableBytes: checkpoint === null ? null : checkpoint.bodyBytes,
    lastDurableChecksum: checkpoint === null ? null : bodyChecksum(checkpoint.body),
    factRows: facts === null ? null : facts.length,
    orphanFacts: orphans === null ? null : orphans.length,
    orphanGenerations: Object.freeze(generations === null ? [] : generations),
    partialGenerations: 0,
    detail,
  });
}
