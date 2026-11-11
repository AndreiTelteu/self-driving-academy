import { PERSISTENCE_LIMITS, PersistenceError, boundedText } from './contracts';
import type { PersistenceReasonCode } from './contracts';
import { canonicalizeJson } from './canonical-json';
import { measureJsonBytes } from './records';
import { captureWorldSnapshot } from './world-snapshot';
import type { WorldCaptureInput, WorldSnapshot } from './world-snapshot';
import type { WorldSnapshotSource } from './world-checkpoint';

/**
 * Bounded pipeline for the world recorder, the checkpoint and the autosave (PBI 222).
 *
 * Docs/15 and Docs/25 ask for one thing that a plain `await` in the tick loop cannot give: the
 * synchronous world read must be measured and payed on the tick, while encode, copy, transfer and
 * the durable commit must happen outside it, with at most one generation in preparation and one in
 * commit. This module owns that contract; the snapshot document stays with PBI 206 and the replay
 * chunk stays with PBI 207.
 *
 * Five stages are measured separately, with the injected monotonic clock:
 *
 * 1. **capture** — the synchronous read of the authoritative world at the tick boundary
 *    (`source.capture()`). It is the only stage that runs inside the tick.
 * 2. **encode** — validation, normalization, canonicalization (`SDA-CJSON-1`) and `SHA-256` of the
 *    captured copy, through the 206 `captureWorldSnapshot`. Deferred to a microtask, never in the
 *    tick.
 * 3. **copy** — the pipeline copies the encoded payload into the owned byte image it charges and
 *    hands over (a `Uint8Array` whose length must equal the encoded `bytes`). A mismatch is a
 *    contract error, not a rounding detail.
 * 4. **transfer** — the synchronous ingress of the store adapter (`handoff`): it takes ownership of
 *    the byte image and returns the durable promise. Its bytes are charged against
 *    `pendingWorkerPayloadBytes`.
 * 5. **commit** — the `await` on that promise. Bytes stay charged to `pendingWorkerPayloadBytes`,
 *    the transaction is short and never waits for a worker message.
 *
 * The state machine is explicit: `IDLE` → `PREPARING` → `COMMITTING` → `IDLE`, with `DISPOSED` as
 * the terminal state. `PREPARING` covers the generation that is being encoded and the prepared
 * generation waiting for the single commit lane; `COMMITTING` wins while a commit runs, and the
 * preparing slot may fill at the same time (exactly one of each, never two).
 *
 * Coalescing never loses protected data. Commercial events, rewards, learning invalidations and the
 * ticks where opportunities were evaluated live in a byte-capped ledger that is independent of the
 * snapshot and of the replay buffer. They are attached to the next prepared generation (only the
 * facts at or before its tick) and are released only after the store reports them durable; a
 * rejected commit keeps them pending.
 *
 * The replay chunks are integrated through their declared bounded bytes: the pipeline retains them
 * in a byte-capped window, evicts the oldest sequence deterministically when the cap is reached and
 * declares the replay partial. Eviction never touches the protected ledger or the checkpoint.
 */

export const BOUNDED_PIPELINE_VERSION = '222-bounded-pipeline-v1' as const;

/** Capacities of `Docs/performance-budgets.json` that bound this contract; no value is invented. */
export const BOUNDED_PIPELINE_BUDGET = Object.freeze({
  budgetVersion: '203-initial-1',
  source: 'Docs/performance-budgets.json',
  recorderRamBytes: 33_554_432,
  pendingWorkerPayloadBytes: 16_777_216,
  optionalReplayStorageBytes: 134_217_728,
  preparingCheckpoints: 1,
  committingCheckpoints: 1,
  heavyBackgroundJobs: 1,
  /** A proposal of the 221 worker contract; reported as a diagnostic, not applied as a gate here. */
  sliceMaximumMs: 10,
});

/**
 * Capacities the manifest declares but does not fix. They are reported as gaps and never replaced
 * by a made-up value: the pipeline measures them and leaves the admission decision to the owner.
 */
export const boundedPipelineBudgetGaps = Object.freeze([
  Object.freeze({
    key: 'twoSessionCheckpointBytes',
    owner: '222/228/234',
    status: 'UNCALIBRATED',
    handling: 'MEASURED_AND_REPORTED_NOT_ENFORCED',
  }),
  Object.freeze({
    key: 'totalHeapBytes',
    owner: '203/218/224',
    status: 'NOT_AVAILABLE',
    handling: 'OWNERSHIP_COUNTERS_ONLY',
  }),
]);

export const boundedPipelineCodes = [
  'TICK_NOT_BOUNDARY',
  'TICK_ORDER',
  'TICK_MISMATCH',
  'INVALID_REQUEST',
  'INVALID_CAPTURE',
  'ENCODE_REJECTED',
  'ENCODE_TOO_LARGE',
  'ENCODE_MISMATCH',
  'TRANSFER_OVERFLOW',
  'PROTECTED_OVERFLOW',
  'PROTECTED_INVALID',
  'CHUNK_TOO_LARGE',
  'CHUNK_CAPACITY',
  'PIPELINE_DISPOSED',
  'COMMIT_IN_PROGRESS',
] as const;
export type BoundedPipelineCode = (typeof boundedPipelineCodes)[number];
export type BoundedPipelineRejectionCode = BoundedPipelineCode | PersistenceReasonCode;

export const boundedPipelinePhases = ['IDLE', 'PREPARING', 'COMMITTING', 'DISPOSED'] as const;
export type BoundedPipelinePhase = (typeof boundedPipelinePhases)[number];

export const boundedPipelineStages = ['capture', 'encode', 'copy', 'transfer', 'commit'] as const;
export type BoundedPipelineStage = (typeof boundedPipelineStages)[number];

/** The five stage costs of one generation, in milliseconds of the injected monotonic clock. */
export interface BoundedStageCost {
  readonly captureMs: number;
  readonly encodeMs: number;
  readonly copyMs: number;
  readonly transferMs: number;
  readonly commitMs: number;
  readonly totalMs: number;
}

/** Costs collected while preparing; transfer and commit are only known at the commit. */
export interface BoundedPrepareCost {
  readonly captureMs: number;
  readonly encodeMs: number;
  readonly copyMs: number;
}

/* ------------------------------------------------------------- protected data */

/**
 * The closed vocabulary of data that coalescing may never drop. The checkpoint body cannot carry
 * them (206 validates a fixed payload), so they travel with the generation and become their own
 * rows.
 */
export const protectedFactKinds = [
  'COMMERCIAL_EVENT',
  'REWARD',
  'LEARNING_INVALIDATION',
  'OPPORTUNITY_TICK',
] as const;
export type ProtectedFactKind = (typeof protectedFactKinds)[number];

export interface ProtectedFactInput {
  readonly factId: string;
  readonly kind: ProtectedFactKind;
  readonly tick: number;
  readonly entityId?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ProtectedFact {
  readonly factId: string;
  readonly kind: ProtectedFactKind;
  readonly tick: number;
  readonly entityId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Canonical bytes of `{ kind, tick, entityId, payload }`, charged against the ledger cap. */
  readonly bytes: number;
}

export type BoundedProtectedDecision =
  | {
      readonly status: 'ACCEPTED' | 'DUPLICATE';
      readonly factId: string;
      readonly bytes: number;
      readonly pendingFacts: number;
      readonly pendingBytes: number;
    }
  | {
      readonly status: 'REJECTED';
      readonly factId: string;
      readonly code: BoundedPipelineCode;
      readonly message: string;
      readonly pendingBytes: number;
      readonly byteCap: number;
    };

/* -------------------------------------------------------------- replay chunks */

/**
 * A sealed 207 chunk, reduced to the metadata this contract bounds. `chunk` is the opaque payload
 * the injected store adapter persists; the pipeline never reads inside it, so it cannot re-invent a
 * replay contract it does not own.
 */
export interface BoundedReplayChunk {
  readonly chunkId: string;
  readonly sequence: number;
  readonly incidentId: string;
  readonly startTick: number;
  readonly endTick: number;
  /** Declared canonical bytes of the sealed chunk. */
  readonly bytes: number;
  readonly status: 'COMPLETE' | 'PARTIAL';
  readonly chunk: unknown;
}

export type BoundedChunkDecision =
  | {
      readonly status: 'STAGED';
      readonly chunkId: string;
      readonly bytes: number;
      readonly evicted: number;
      readonly evictedBytes: number;
    }
  | {
      readonly status: 'REJECTED';
      readonly chunkId: string;
      readonly code: BoundedPipelineCode;
      readonly message: string;
    };

/* ---------------------------------------------------------------- generations */

export interface BoundedGenerationSummary {
  readonly generation: number;
  readonly tick: number;
  readonly bytes: number;
  readonly checksum: string;
}

/** The envelope versions of PBI 206; they travel unchanged into the checkpoint row. */
export interface BoundedVersions {
  readonly engineVersion: string;
  readonly physicsVersion: string;
  readonly mapVersion: string;
}

export interface BoundedGeneration extends BoundedGenerationSummary {
  readonly sessionId: string;
  readonly checkpointId: string;
  readonly versions: BoundedVersions;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly profileId: string;
  readonly snapshot: WorldSnapshot;
  readonly body: Readonly<Record<string, unknown>>;
  /**
   * The owned canonical byte image of `body`. The adapter receives it at `handoff` and owns it from
   * that point; the pipeline never reads or mutates it again.
   */
  readonly payload: Uint8Array;
  readonly protectedFacts: readonly ProtectedFact[];
  readonly protectedBytes: number;
  readonly cost: BoundedPrepareCost;
  readonly capturedAt: string;
}

export interface BoundedCommitReport {
  readonly status: 'COMMITTED' | 'REJECTED';
  readonly generation: number;
  readonly tick: number;
  readonly bytes: number;
  readonly checksum: string;
  readonly stages: BoundedStageCost;
  readonly protectedAttached: number;
  readonly protectedReleased: number;
  readonly protectedDurable: number;
  readonly code: BoundedPipelineRejectionCode | null;
  readonly message: string | null;
  readonly committedAt: string | null;
}

export type BoundedTickStatus = 'CAPTURED' | 'COALESCED' | 'REJECTED';

export interface BoundedTickDecision {
  readonly status: BoundedTickStatus;
  readonly tick: number | null;
  /** The generation that received this tick, when the decision produced or kept one. */
  readonly generation: number | null;
  readonly code: BoundedPipelineRejectionCode | null;
  readonly message: string | null;
  readonly coalescedTicks: number;
}

/* --------------------------------------------------------------------- store */

export interface BoundedStoreCommit {
  readonly status: 'COMMITTED' | 'REJECTED';
  readonly generation: number | null;
  readonly code: BoundedPipelineRejectionCode | null;
  readonly message: string | null;
  readonly bytes: number;
  /** Facts that reached durable storage before the checkpoint reference did. */
  readonly factsDurable: number;
}

/**
 * Storage port. `handoff` is synchronous ingress: the adapter builds every record and takes
 * ownership of `generation.payload`, then returns the promise of the durable commit. Chunk
 * persistence is optional because the 127 schema has no replay store yet; without it the replay
 * window is RAM-only and declared as such.
 */
export interface BoundedPipelineStore {
  handoff(generation: BoundedGeneration): Promise<BoundedStoreCommit>;
  handoffChunk?(chunk: BoundedReplayChunk): Promise<BoundedStoreCommit>;
}

/* -------------------------------------------------------------------- status */

export interface BoundedPipelineStats {
  readonly version: typeof BOUNDED_PIPELINE_VERSION;
  readonly phase: BoundedPipelinePhase;
  readonly sessionId: string;
  readonly checkpointId: string;
  readonly latestTick: number | null;
  readonly generations: {
    readonly captured: number;
    readonly prepared: number;
    readonly committed: number;
    readonly replaced: number;
    readonly commitRejections: number;
    readonly prepareRejections: number;
    readonly coalescedTicks: number;
    readonly staleRefusals: number;
    readonly lastGeneration: number | null;
    readonly lastCommittedGeneration: number | null;
    readonly lastCommittedTick: number | null;
    readonly preparedTick: number | null;
    readonly preparedBytes: number;
    readonly committingTick: number | null;
    readonly committingBytes: number;
    readonly pendingTick: number | null;
  };
  readonly cost: BoundedStageCost | null;
  readonly buffers: {
    readonly preparingBytes: number;
    readonly preparingByteCap: number;
    readonly transferringBytes: number;
    readonly transferByteCap: number;
    readonly peakTransferBytes: number;
    readonly protectedBytes: number;
    readonly protectedByteCap: number;
    readonly peakProtectedBytes: number;
    readonly replayBytes: number;
    readonly replayByteCap: number;
    readonly replayChunks: number;
  };
  readonly protected: {
    readonly pending: number;
    readonly committed: number;
    readonly refused: number;
    readonly duplicates: number;
    readonly suspended: boolean;
    readonly overflowTick: number | null;
  };
  readonly replay: {
    readonly staged: number;
    readonly committed: number;
    readonly evictedChunks: number;
    readonly evictedBytes: number;
    readonly tooLarge: number;
    readonly failed: number;
    readonly partial: boolean;
    readonly durable: boolean;
  };
  readonly storage: {
    readonly commitAgeTicks: number | null;
    readonly unsavedTicks: number | null;
    readonly lastCode: BoundedPipelineRejectionCode | null;
    readonly lastMessage: string | null;
  };
  readonly lastCommit: BoundedCommitReport | null;
}

export interface BoundedPipelineOptions {
  readonly store: BoundedPipelineStore;
  readonly sessionId: string;
  /** One durable checkpoint row per session; every generation replaces it with a newer one. */
  readonly checkpointId: string;
  readonly versions: BoundedVersions;
  /**
   * Last generation known before this instance started. A restarted session must pass the durable
   * generation from `recoverBoundedPipeline` so a new process never reuses a number that is already
   * on disk; a fresh session starts at 0.
   */
  readonly startGeneration?: number;
  /** Monotonic milliseconds; injected so the stage transcript is deterministic in tests. */
  readonly monotonic?: () => number;
  readonly now?: () => string;
  /** Bytes of one prepared generation; default is the shared record budget (1 MiB). */
  readonly preparingByteCap?: number;
  /** Bytes in the transfer ingress; default is `pendingWorkerPayloadBytes` (16 MiB). */
  readonly transferByteCap?: number;
  /** Bytes of the protected ledger; default is the shared body budget (256 KiB). */
  readonly protectedByteCap?: number;
  /** Bytes of the retained replay chunks; default is `optionalReplayStorageBytes` (128 MiB). */
  readonly replayByteCap?: number;
  /** Set to false to keep chunks only in the bounded RAM window. */
  readonly commitReplayChunks?: boolean;
  /** Observes every finished generation commit; used by the report and the HUD. */
  readonly onCommit?: (report: BoundedCommitReport) => void;
}

export interface BoundedPipeline {
  readonly version: typeof BOUNDED_PIPELINE_VERSION;
  /** Offers the authoritative tick; the only stage that runs before this call returns is capture. */
  offerTick(source: WorldSnapshotSource): BoundedTickDecision;
  /** Adds protected data that no coalescing may drop. */
  recordProtected(fact: ProtectedFactInput): BoundedProtectedDecision;
  /** Retains a sealed replay chunk inside the bounded window and commits it when possible. */
  stageChunk(chunk: BoundedReplayChunk): BoundedChunkDecision;
  /** Settles every scheduled prepare and commit; resolves when the pipeline is quiescent. */
  drain(): Promise<void>;
  stats(): BoundedPipelineStats;
  /** Clears an explicit suspension after the caller exported or cleaned the protected data. */
  resume(): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ helpers */

const ENCODER = new TextEncoder();

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The bounded pipeline operation failed';
}

function elapsed(start: number, end: number): number {
  const value = end - start;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function defaultMonotonic(): number {
  if (typeof performance === 'object' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function invalid(code: string, text: string, path: string): never {
  throw new PersistenceError('INVALID_RECORD', `${code}: ${text}`, path);
}

function readCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid('INVALID_REQUEST', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function readFactKind(value: unknown, path: string): ProtectedFactKind {
  if (typeof value !== 'string' || !(protectedFactKinds as readonly string[]).includes(value)) {
    invalid('PROTECTED_INVALID', `Expected one of ${protectedFactKinds.join(', ')}`, path);
  }
  return value as ProtectedFactKind;
}

function readPlainObject(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid('PROTECTED_INVALID', 'Expected a plain object payload', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid('PROTECTED_INVALID', 'Expected plain data, not a class instance', path);
  }
  return value as Record<string, unknown>;
}

/**
 * Owned, frozen copy of protected data. A fact that the caller mutates afterwards must not change
 * the bytes the ledger charged or the row the store writes.
 */
function copyPlain(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => copyPlain(entry)));
  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      copy[key] = copyPlain((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(copy);
  }
  return value;
}

interface PreparingGeneration {
  readonly generation: number;
  readonly tick: number;
  input: WorldCaptureInput | null;
  readonly captureMs: number;
  encodeMs: number;
  copyMs: number;
  prepared: BoundedGeneration | null;
}

interface PendingTick {
  readonly source: WorldSnapshotSource;
  readonly tick: number;
}

/* ------------------------------------------------------------ the pipeline */

export function createBoundedPipeline(options: BoundedPipelineOptions): BoundedPipeline {
  if (options.store === null || typeof options.store !== 'object') {
    invalid('INVALID_REQUEST', 'The pipeline needs a store adapter', 'store');
  }
  const store = options.store;
  if (typeof store.handoff !== 'function') {
    invalid('INVALID_REQUEST', 'The store adapter must implement handoff', 'store.handoff');
  }
  const sessionId = boundedText(options.sessionId, 'sessionId', PERSISTENCE_LIMITS.maxIdCodeUnits);
  const checkpointId = boundedText(
    options.checkpointId,
    'checkpointId',
    PERSISTENCE_LIMITS.maxIdCodeUnits,
  );
  const versions: BoundedVersions = Object.freeze({
    engineVersion: boundedText(
      options.versions.engineVersion,
      'engineVersion',
      PERSISTENCE_LIMITS.maxTextCodeUnits,
    ),
    physicsVersion: boundedText(
      options.versions.physicsVersion,
      'physicsVersion',
      PERSISTENCE_LIMITS.maxTextCodeUnits,
    ),
    mapVersion: boundedText(
      options.versions.mapVersion,
      'mapVersion',
      PERSISTENCE_LIMITS.maxTextCodeUnits,
    ),
  });
  if (BOUNDED_PIPELINE_BUDGET.preparingCheckpoints !== 1) {
    invalid('INVALID_REQUEST', 'This contract owns exactly one preparing slot', 'budget');
  }
  if (BOUNDED_PIPELINE_BUDGET.committingCheckpoints !== 1) {
    invalid('INVALID_REQUEST', 'This contract owns exactly one committing slot', 'budget');
  }

  const monotonic = options.monotonic ?? defaultMonotonic;
  const now = options.now ?? (() => new Date().toISOString());
  const preparingByteCap = options.preparingByteCap ?? PERSISTENCE_LIMITS.maxRecordBytes;
  const transferByteCap =
    options.transferByteCap ?? BOUNDED_PIPELINE_BUDGET.pendingWorkerPayloadBytes;
  const protectedByteCap = options.protectedByteCap ?? PERSISTENCE_LIMITS.maxBodyBytes;
  const replayByteCap = options.replayByteCap ?? BOUNDED_PIPELINE_BUDGET.optionalReplayStorageBytes;
  const commitReplayChunks = options.commitReplayChunks !== false;
  const chunkCommits = commitReplayChunks && typeof store.handoffChunk === 'function';

  let phase: BoundedPipelinePhase = 'IDLE';
  let disposed = false;
  let generationCounter =
    options.startGeneration === undefined
      ? 0
      : readCount(options.startGeneration, 'startGeneration');
  let latestTick: number | null = null;
  let lastOfferedTick: number | null = null;

  /** The one preparing slot: the generation being encoded or the prepared one awaiting its commit. */
  let preparing: PreparingGeneration | null = null;
  let prepareTask: Promise<void> | null = null;
  /** The one committing slot. */
  let committing: BoundedGeneration | null = null;
  /** The single commit lane also carries chunk commits, so there is never a second writer. */
  let lane: Promise<void> | null = null;
  let committingChunk: BoundedReplayChunk | null = null;
  let pending: PendingTick | null = null;

  const counters = {
    captured: 0,
    prepared: 0,
    committed: 0,
    replaced: 0,
    commitRejections: 0,
    prepareRejections: 0,
    coalescedTicks: 0,
    staleRefusals: 0,
  };
  let lastCommittedGeneration: number | null = null;
  let lastCommittedTick: number | null = null;
  let lastCommit: BoundedCommitReport | null = null;
  let lastCost: BoundedStageCost | null = null;
  let lastCode: BoundedPipelineRejectionCode | null = null;
  let lastMessage: string | null = null;

  const ledger: ProtectedFact[] = [];
  const ledgerIds = new Set<string>();
  let protectedBytes = 0;
  let peakProtectedBytes = 0;
  let protectedCommitted = 0;
  let protectedRefused = 0;
  let protectedDuplicates = 0;
  let suspended = false;
  let overflowTick: number | null = null;

  const replay: BoundedReplayChunk[] = [];
  let replayBytes = 0;
  let replayStaged = 0;
  let replayCommitted = 0;
  let replayEvictedChunks = 0;
  let replayEvictedBytes = 0;
  let replayTooLarge = 0;
  let replayFailed = 0;
  let replayPartial = false;

  let peakTransferBytes = 0;

  function updatePhase(): void {
    if (disposed) {
      phase = 'DISPOSED';
      return;
    }
    if (committing !== null || committingChunk !== null) phase = 'COMMITTING';
    else if (preparing !== null) phase = 'PREPARING';
    else phase = 'IDLE';
  }

  function preparedOf(): BoundedGeneration | null {
    return preparing === null ? null : preparing.prepared;
  }

  function transferBytes(): number {
    return (committing?.bytes ?? 0) + (preparedOf()?.bytes ?? 0);
  }

  function observeTransferCharge(): void {
    const charged = transferBytes();
    if (charged > peakTransferBytes) peakTransferBytes = charged;
  }

  function decide(
    status: BoundedTickStatus,
    tick: number | null,
    generation: number | null,
    code: BoundedPipelineRejectionCode | null = null,
    detail: string | null = null,
  ): BoundedTickDecision {
    return Object.freeze({
      status,
      tick,
      generation,
      code,
      message: detail,
      coalescedTicks: counters.coalescedTicks,
    });
  }

  function refuse(
    code: BoundedPipelineRejectionCode,
    detail: string,
    tick: number | null,
  ): BoundedTickDecision {
    lastCode = code;
    lastMessage = detail;
    return decide('REJECTED', tick, null, code, detail);
  }

  /* ------------------------------------------------------------- protected */

  function recordProtected(input: ProtectedFactInput): BoundedProtectedDecision {
    const fact: Partial<ProtectedFactInput> = input ?? {};
    const factId = typeof fact.factId === 'string' ? fact.factId : '';
    const pendingFacts = ledger.length;
    try {
      if (disposed) {
        return Object.freeze({
          status: 'REJECTED' as const,
          factId,
          code: 'PIPELINE_DISPOSED' as const,
          message: 'The pipeline was disposed',
          pendingBytes: protectedBytes,
          byteCap: protectedByteCap,
        });
      }
      if (factId.length === 0 || factId.trim() !== factId) {
        invalid('PROTECTED_INVALID', 'The factId must be non-empty and not padded', 'fact.factId');
      }
      if (factId.length > PERSISTENCE_LIMITS.maxIdCodeUnits) {
        invalid('PROTECTED_INVALID', 'The factId is too long', 'fact.factId');
      }
      const kind = readFactKind(fact.kind, 'fact.kind');
      const tick = readCount(fact.tick, 'fact.tick');
      const entityId = fact.entityId ?? null;
      if (entityId !== null && (typeof entityId !== 'string' || entityId.length === 0)) {
        invalid('PROTECTED_INVALID', 'Expected a bounded entity id or null', 'fact.entityId');
      }
      if (entityId !== null && entityId.length > PERSISTENCE_LIMITS.maxIdCodeUnits) {
        invalid('PROTECTED_INVALID', 'The entityId is too long', 'fact.entityId');
      }
      const payload = copyPlain(readPlainObject(fact.payload, 'fact.payload')) as Readonly<
        Record<string, unknown>
      >;
      const bytes = measureJsonBytes({ kind, tick, entityId, payload }, 'fact');
      if (ledgerIds.has(factId)) {
        protectedDuplicates += 1;
        return Object.freeze({
          status: 'DUPLICATE' as const,
          factId,
          bytes,
          pendingFacts,
          pendingBytes: protectedBytes,
        });
      }
      if (protectedBytes + bytes > protectedByteCap) {
        protectedRefused += 1;
        suspended = true;
        if (overflowTick === null) overflowTick = tick;
        lastCode = 'PROTECTED_OVERFLOW';
        lastMessage = `The protected ledger holds ${protectedBytes} of ${protectedByteCap} bytes`;
        return Object.freeze({
          status: 'REJECTED' as const,
          factId,
          code: 'PROTECTED_OVERFLOW' as const,
          message: lastMessage,
          pendingBytes: protectedBytes,
          byteCap: protectedByteCap,
        });
      }
      const record: ProtectedFact = Object.freeze({ factId, kind, tick, entityId, payload, bytes });
      ledger.push(record);
      ledgerIds.add(factId);
      protectedBytes += bytes;
      if (protectedBytes > peakProtectedBytes) peakProtectedBytes = protectedBytes;
      return Object.freeze({
        status: 'ACCEPTED' as const,
        factId,
        bytes,
        pendingFacts: ledger.length,
        pendingBytes: protectedBytes,
      });
    } catch (error) {
      protectedRefused += 1;
      lastCode = 'PROTECTED_INVALID';
      lastMessage = message(error);
      return Object.freeze({
        status: 'REJECTED' as const,
        factId,
        code: 'PROTECTED_INVALID' as const,
        message: lastMessage,
        pendingBytes: protectedBytes,
        byteCap: protectedByteCap,
      });
    }
  }

  function factsUpTo(tick: number): readonly ProtectedFact[] {
    return Object.freeze(ledger.filter((fact) => fact.tick <= tick));
  }

  function releaseProtected(facts: readonly ProtectedFact[], durable: number): number {
    let released = 0;
    for (const fact of facts) {
      if (released >= durable) break;
      const index = ledger.findIndex((entry) => entry.factId === fact.factId);
      if (index < 0) continue;
      const [removed] = ledger.splice(index, 1);
      ledgerIds.delete(fact.factId);
      if (removed !== undefined) protectedBytes = Math.max(0, protectedBytes - removed.bytes);
      released += 1;
      protectedCommitted += 1;
    }
    return released;
  }

  /* ----------------------------------------------------------------- replay */

  function oldestChunkIndex(): number {
    let index = -1;
    let sequence = Number.POSITIVE_INFINITY;
    for (let position = 0; position < replay.length; position += 1) {
      const entry = replay[position];
      if (entry === undefined) continue;
      if (entry.sequence < sequence) {
        sequence = entry.sequence;
        index = position;
      }
    }
    return index;
  }

  function stageChunk(input: BoundedReplayChunk): BoundedChunkDecision {
    const chunk: Partial<BoundedReplayChunk> = input ?? {};
    const chunkId = typeof chunk.chunkId === 'string' ? chunk.chunkId : 'chunk';
    if (disposed) {
      return Object.freeze({
        status: 'REJECTED' as const,
        chunkId,
        code: 'PIPELINE_DISPOSED' as const,
        message: 'The pipeline was disposed',
      });
    }
    let bytes: number;
    try {
      bytes = readCount(chunk.bytes, 'chunk.bytes');
      if (chunkId.length === 0 || chunkId.trim() !== chunkId) {
        invalid('INVALID_REQUEST', 'The chunkId must be non-empty and not padded', 'chunk.chunkId');
      }
    } catch (error) {
      lastCode = 'INVALID_REQUEST';
      lastMessage = message(error);
      return Object.freeze({
        status: 'REJECTED' as const,
        chunkId,
        code: 'INVALID_REQUEST' as const,
        message: lastMessage,
      });
    }
    if (bytes > replayByteCap) {
      replayTooLarge += 1;
      replayPartial = true;
      lastCode = 'CHUNK_TOO_LARGE';
      lastMessage = `The chunk is ${bytes} bytes, above the ${replayByteCap} byte replay cap`;
      return Object.freeze({
        status: 'REJECTED' as const,
        chunkId,
        code: 'CHUNK_TOO_LARGE' as const,
        message: lastMessage,
      });
    }
    let evicted = 0;
    let evictedBytes = 0;
    while (replayBytes + bytes > replayByteCap) {
      const index = oldestChunkIndex();
      if (index < 0) break;
      const [removed] = replay.splice(index, 1);
      if (removed === undefined) break;
      replayBytes = Math.max(0, replayBytes - removed.bytes);
      evicted += 1;
      evictedBytes += removed.bytes;
    }
    if (replayBytes + bytes > replayByteCap) {
      lastCode = 'CHUNK_CAPACITY';
      lastMessage = `The replay window cannot hold ${bytes} bytes of ${replayByteCap}`;
      return Object.freeze({
        status: 'REJECTED' as const,
        chunkId,
        code: 'CHUNK_CAPACITY' as const,
        message: lastMessage,
      });
    }
    replay.push(Object.freeze({ ...input, bytes }));
    replayBytes += bytes;
    replayStaged += 1;
    if (evicted > 0) {
      replayEvictedChunks += evicted;
      replayEvictedBytes += evictedBytes;
      replayPartial = true;
    }
    startLane();
    return Object.freeze({
      status: 'STAGED' as const,
      chunkId,
      bytes,
      evicted,
      evictedBytes,
    });
  }

  /* ------------------------------------------------------------------ tick */

  function captureRequest(source: WorldSnapshotSource): BoundedTickDecision {
    const tick = source.tick;
    if (!Number.isSafeInteger(tick) || tick < 0) {
      return refuse('INVALID_REQUEST', 'The source does not report a valid tick', null);
    }
    if (source.boundary !== 'BOUNDARY') {
      return refuse(
        'TICK_NOT_BOUNDARY',
        'The fixed-tick loop is inside a step; capture waits for the boundary',
        tick,
      );
    }
    if (lastCommittedTick !== null && tick < lastCommittedTick) {
      counters.staleRefusals += 1;
      return refuse(
        'TICK_ORDER',
        `Tick ${tick} is older than the committed tick ${lastCommittedTick}`,
        tick,
      );
    }
    if (committing !== null && tick < committing.tick) {
      counters.staleRefusals += 1;
      return refuse(
        'TICK_ORDER',
        `Tick ${tick} is older than the committing tick ${committing.tick}`,
        tick,
      );
    }
    if (latestTick === null || tick > latestTick) latestTick = tick;
    if (pending !== null && pending.tick <= tick) pending = null;

    let input: WorldCaptureInput;
    const start = monotonic();
    try {
      input = source.capture();
    } catch (error) {
      counters.prepareRejections += 1;
      return refuse('INVALID_CAPTURE', message(error), tick);
    }
    const captureMs = elapsed(start, monotonic());
    if (input.tick !== tick) {
      counters.prepareRejections += 1;
      return refuse(
        'TICK_MISMATCH',
        `The source ticks at ${tick} but the captured tree is at tick ${input.tick}`,
        tick,
      );
    }

    generationCounter += 1;
    const record: PreparingGeneration = {
      generation: generationCounter,
      tick,
      input,
      captureMs,
      encodeMs: 0,
      copyMs: 0,
      prepared: null,
    };
    preparing = record;
    counters.captured += 1;
    updatePhase();
    schedulePrepare(record);
    return decide('CAPTURED', tick, record.generation);
  }

  function dropPrepared(): void {
    if (preparing === null) return;
    if (preparing.prepared !== null) counters.replaced += 1;
    preparing.prepared = null;
    preparing = null;
    observeTransferCharge();
    updatePhase();
  }

  function offerTick(source: WorldSnapshotSource): BoundedTickDecision {
    if (disposed) {
      return refuse('PIPELINE_DISPOSED', 'The pipeline was disposed', null);
    }
    const tick = source.tick;
    if (!Number.isSafeInteger(tick) || tick < 0) {
      return refuse('INVALID_REQUEST', 'The source does not report a valid tick', null);
    }
    if (lastOfferedTick !== null && tick < lastOfferedTick) {
      counters.staleRefusals += 1;
      return refuse(
        'TICK_ORDER',
        `Tick ${tick} is older than the offered tick ${lastOfferedTick}`,
        tick,
      );
    }
    lastOfferedTick = tick;
    if (latestTick === null || tick > latestTick) latestTick = tick;

    const handledHere =
      (preparing !== null && preparing.tick >= tick) ||
      (committing !== null && committing.tick >= tick) ||
      (lastCommittedTick !== null && lastCommittedTick >= tick);
    if (handledHere) {
      counters.coalescedTicks += 1;
      return decide(
        'COALESCED',
        tick,
        preparing?.generation ?? committing?.generation ?? null,
        null,
        'A generation at this tick is already captured, prepared or committed',
      );
    }
    if (preparing !== null) {
      // The prepared generation has not started its commit (the committing one is held separately),
      // so the newer tick replaces it — the 206 rule — and the pending slot is only used while the
      // encode is still running.
      if (preparing.prepared !== null) {
        dropPrepared();
        return captureRequest(source);
      }
      pending = { source, tick };
      counters.coalescedTicks += 1;
      return decide(
        'COALESCED',
        tick,
        preparing.generation,
        null,
        'The generation in preparation is not ready yet; the newest tick is kept pending',
      );
    }
    return captureRequest(source);
  }

  /* --------------------------------------------------------------- prepare */

  function schedulePrepare(record: PreparingGeneration): void {
    prepareTask = Promise.resolve()
      .then(() => {
        prepareGeneration(record);
      })
      .catch((error: unknown) => {
        lastCode = 'ENCODE_REJECTED';
        lastMessage = message(error);
        counters.prepareRejections += 1;
      })
      .finally(() => {
        prepareTask = null;
      });
  }

  function prepareGeneration(record: PreparingGeneration): void {
    if (disposed || preparing !== record) return;
    const input = record.input;
    record.input = null;
    if (input === null) return;

    const encodeStart = monotonic();
    const encoded = captureWorldSnapshot(input);
    record.encodeMs = elapsed(encodeStart, monotonic());
    if (encoded.status === 'REJECTED') {
      counters.prepareRejections += 1;
      lastCode = 'INVALID_CAPTURE';
      lastMessage = encoded.rejection.message;
      preparing = null;
      updatePhase();
      afterLane();
      return;
    }
    if (encoded.bytes > preparingByteCap) {
      counters.prepareRejections += 1;
      lastCode = 'ENCODE_TOO_LARGE';
      lastMessage = `The generation is ${encoded.bytes} bytes, above the ${preparingByteCap} byte cap`;
      preparing = null;
      updatePhase();
      afterLane();
      return;
    }

    const copyStart = monotonic();
    const canonical = canonicalizeJson(encoded.body, { maxDepth: 24 });
    const payload =
      canonical.status === 'ACCEPTED' ? ENCODER.encode(canonical.text) : new Uint8Array(0);
    record.copyMs = elapsed(copyStart, monotonic());
    if (canonical.status !== 'ACCEPTED') {
      counters.prepareRejections += 1;
      lastCode = 'ENCODE_MISMATCH';
      lastMessage = canonical.rejection.message;
      preparing = null;
      updatePhase();
      afterLane();
      return;
    }
    if (payload.byteLength !== encoded.bytes) {
      counters.prepareRejections += 1;
      lastCode = 'ENCODE_MISMATCH';
      lastMessage = `The owned image is ${payload.byteLength} bytes but the encoded body is ${encoded.bytes}`;
      preparing = null;
      updatePhase();
      afterLane();
      return;
    }
    const charged = transferBytes();
    if (charged + payload.byteLength > transferByteCap) {
      counters.prepareRejections += 1;
      lastCode = 'TRANSFER_OVERFLOW';
      lastMessage = `The transfer ingress would hold ${charged + payload.byteLength} of ${transferByteCap} bytes`;
      preparing = null;
      updatePhase();
      afterLane();
      return;
    }

    const facts = factsUpTo(record.tick);
    const generation: BoundedGeneration = Object.freeze({
      generation: record.generation,
      tick: record.tick,
      bytes: encoded.bytes,
      checksum: encoded.checksum,
      sessionId,
      checkpointId,
      versions,
      worldEpoch: encoded.snapshot.worldEpoch,
      learningEpoch: encoded.snapshot.learning.learningEpoch,
      profileId: encoded.snapshot.profile.profileId,
      snapshot: encoded.snapshot,
      body: encoded.body,
      payload,
      protectedFacts: facts,
      protectedBytes: facts.reduce((sum, fact) => sum + fact.bytes, 0),
      cost: Object.freeze({
        captureMs: record.captureMs,
        encodeMs: record.encodeMs,
        copyMs: record.copyMs,
      }),
      capturedAt: now(),
    });
    record.prepared = generation;
    counters.prepared += 1;
    observeTransferCharge();
    updatePhase();
    startLane();
  }

  /* ---------------------------------------------------------------- commit */

  function startLane(): void {
    if (disposed || lane !== null) return;
    if (preparedOf() === null && (!chunkCommits || replay.length === 0)) return;
    lane = Promise.resolve()
      .then(runLane)
      .catch((error: unknown) => {
        lastCode = 'ENCODE_REJECTED';
        lastMessage = message(error);
      })
      .finally(() => {
        lane = null;
        afterLane();
      });
  }

  function supersedePending(): boolean {
    const preparedGeneration = preparedOf();
    if (
      preparedGeneration === null ||
      pending === null ||
      pending.tick <= preparedGeneration.tick
    ) {
      return false;
    }
    // A newer tick arrived while the lane was busy: keep the freshest checkpoint instead of writing
    // a generation the world has already left behind. This costs one encode per commit cycle.
    dropPrepared();
    const request = pending;
    pending = null;
    captureRequest(request.source);
    return true;
  }

  async function runLane(): Promise<void> {
    for (;;) {
      if (disposed) return;
      if (committing === null && supersedePending()) return;
      const generation = committing === null ? preparedOf() : null;
      if (generation !== null) {
        await commitGeneration(generation);
        continue;
      }
      if (committingChunk === null && chunkCommits && replay.length > 0) {
        const next = replay[0];
        if (next === undefined) return;
        await commitChunk(next);
        continue;
      }
      return;
    }
  }

  function afterLane(): void {
    if (disposed) return;
    if (supersedePending()) return;
    if (preparing === null && pending !== null) {
      const request = pending;
      pending = null;
      captureRequest(request.source);
      return;
    }
    updatePhase();
    if (preparedOf() !== null && committing === null) startLane();
  }

  function reportOf(
    generation: BoundedGeneration,
    transferMs: number,
    commitMs: number,
    status: 'COMMITTED' | 'REJECTED',
    code: BoundedPipelineRejectionCode | null,
    detail: string | null,
    released: number,
    durable: number,
  ): BoundedCommitReport {
    const cost: BoundedStageCost = Object.freeze({
      captureMs: generation.cost.captureMs,
      encodeMs: generation.cost.encodeMs,
      copyMs: generation.cost.copyMs,
      transferMs,
      commitMs,
      totalMs:
        generation.cost.captureMs +
        generation.cost.encodeMs +
        generation.cost.copyMs +
        transferMs +
        commitMs,
    });
    lastCost = cost;
    return Object.freeze({
      status,
      generation: generation.generation,
      tick: generation.tick,
      bytes: generation.bytes,
      checksum: generation.checksum,
      stages: cost,
      protectedAttached: generation.protectedFacts.length,
      protectedReleased: released,
      protectedDurable: durable,
      code,
      message: detail,
      committedAt: status === 'COMMITTED' ? now() : null,
    });
  }

  function rejectedCommit(
    generation: BoundedGeneration | null,
    code: BoundedPipelineRejectionCode,
    detail: string,
    factsDurable = 0,
  ): BoundedStoreCommit {
    return Object.freeze({
      status: 'REJECTED' as const,
      generation: generation?.generation ?? null,
      code,
      message: detail,
      bytes: 0,
      factsDurable,
    });
  }

  async function commitGeneration(generation: BoundedGeneration): Promise<void> {
    if (committing !== null) return;
    committing = generation;
    if (preparing !== null && preparing.prepared === generation) preparing = null;
    observeTransferCharge();
    updatePhase();

    const transferStart = monotonic();
    let handoff: Promise<BoundedStoreCommit>;
    try {
      handoff = store.handoff(generation);
    } catch (error) {
      handoff = Promise.resolve(rejectedCommit(generation, 'TRANSACTION_ABORTED', message(error)));
    }
    const transferMs = elapsed(transferStart, monotonic());
    const commitStart = monotonic();
    let result: BoundedStoreCommit;
    try {
      result = await handoff;
    } catch (error) {
      result = rejectedCommit(
        generation,
        error instanceof PersistenceError ? error.code : 'TRANSACTION_ABORTED',
        message(error),
      );
    }
    const commitMs = elapsed(commitStart, monotonic());

    const durable = Math.max(0, Math.min(result.factsDurable, generation.protectedFacts.length));
    const released =
      result.status === 'COMMITTED'
        ? releaseProtected(generation.protectedFacts, generation.protectedFacts.length)
        : releaseProtected(generation.protectedFacts, durable);
    const report = reportOf(
      generation,
      transferMs,
      commitMs,
      result.status,
      result.code,
      result.message,
      released,
      durable,
    );
    lastCommit = report;
    if (result.status === 'COMMITTED') {
      counters.committed += 1;
      lastCommittedGeneration = generation.generation;
      lastCommittedTick = generation.tick;
    } else {
      counters.commitRejections += 1;
      lastCode = result.code;
      lastMessage = result.message;
    }
    try {
      options.onCommit?.(report);
    } catch {
      lastCode = 'COMMIT_IN_PROGRESS';
      lastMessage = 'The commit observer threw; the durable result is unchanged';
    }
    committing = null;
    observeTransferCharge();
    updatePhase();
  }

  async function commitChunk(chunk: BoundedReplayChunk): Promise<void> {
    const handoffChunk = store.handoffChunk;
    if (handoffChunk === undefined) return;
    committingChunk = chunk;
    updatePhase();
    const transferStart = monotonic();
    let handoff: Promise<BoundedStoreCommit>;
    try {
      handoff = handoffChunk.call(store, chunk);
    } catch (error) {
      handoff = Promise.resolve(rejectedCommit(null, 'TRANSACTION_ABORTED', message(error)));
    }
    const transferMs = elapsed(transferStart, monotonic());
    const commitStart = monotonic();
    let result: BoundedStoreCommit;
    try {
      result = await handoff;
    } catch (error) {
      result = rejectedCommit(
        null,
        error instanceof PersistenceError ? error.code : 'TRANSACTION_ABORTED',
        message(error),
      );
    }
    const commitMs = elapsed(commitStart, monotonic());
    lastCost = Object.freeze({
      captureMs: 0,
      encodeMs: 0,
      copyMs: 0,
      transferMs,
      commitMs,
      totalMs: transferMs + commitMs,
    });
    const position = replay.indexOf(chunk);
    if (position >= 0) {
      const [removed] = replay.splice(position, 1);
      if (removed !== undefined) replayBytes = Math.max(0, replayBytes - removed.bytes);
    }
    if (result.status === 'COMMITTED') {
      replayCommitted += 1;
    } else {
      replayFailed += 1;
      replayPartial = true;
      lastCode = result.code;
      lastMessage = result.message;
    }
    committingChunk = null;
    updatePhase();
  }

  /* --------------------------------------------------------------- settle */

  async function drain(): Promise<void> {
    for (;;) {
      const task = prepareTask ?? lane;
      if (task !== null) {
        await task.catch(() => undefined);
        continue;
      }
      if (preparing === null && pending !== null) {
        const request = pending;
        pending = null;
        captureRequest(request.source);
        continue;
      }
      if (preparedOf() !== null || (chunkCommits && replay.length > 0)) {
        startLane();
        continue;
      }
      return;
    }
  }

  function stats(): BoundedPipelineStats {
    const commitAgeTicks =
      latestTick === null || lastCommittedTick === null
        ? null
        : Math.max(0, latestTick - lastCommittedTick);
    const unsavedTicks =
      latestTick === null ? null : Math.max(0, latestTick - (lastCommittedTick ?? 0));
    return Object.freeze({
      version: BOUNDED_PIPELINE_VERSION,
      phase,
      sessionId,
      checkpointId,
      latestTick,
      generations: Object.freeze({
        captured: counters.captured,
        prepared: counters.prepared,
        committed: counters.committed,
        replaced: counters.replaced,
        commitRejections: counters.commitRejections,
        prepareRejections: counters.prepareRejections,
        coalescedTicks: counters.coalescedTicks,
        staleRefusals: counters.staleRefusals,
        lastGeneration: generationCounter === 0 ? null : generationCounter,
        lastCommittedGeneration,
        lastCommittedTick,
        preparedTick: preparedOf()?.tick ?? null,
        preparedBytes: preparedOf()?.bytes ?? 0,
        committingTick: committing?.tick ?? null,
        committingBytes: committing?.bytes ?? 0,
        pendingTick: pending?.tick ?? null,
      }),
      cost: lastCost,
      buffers: Object.freeze({
        preparingBytes: preparedOf()?.bytes ?? 0,
        preparingByteCap,
        transferringBytes: transferBytes(),
        transferByteCap,
        peakTransferBytes,
        protectedBytes,
        protectedByteCap,
        peakProtectedBytes,
        replayBytes,
        replayByteCap,
        replayChunks: replay.length,
      }),
      protected: Object.freeze({
        pending: ledger.length,
        committed: protectedCommitted,
        refused: protectedRefused,
        duplicates: protectedDuplicates,
        suspended,
        overflowTick,
      }),
      replay: Object.freeze({
        staged: replayStaged,
        committed: replayCommitted,
        evictedChunks: replayEvictedChunks,
        evictedBytes: replayEvictedBytes,
        tooLarge: replayTooLarge,
        failed: replayFailed,
        partial: replayPartial,
        durable: chunkCommits,
      }),
      storage: Object.freeze({
        commitAgeTicks,
        unsavedTicks,
        lastCode,
        lastMessage,
      }),
      lastCommit,
    });
  }

  function resume(): void {
    suspended = false;
    overflowTick = null;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    preparing = null;
    committing = null;
    committingChunk = null;
    pending = null;
    replay.length = 0;
    replayBytes = 0;
    updatePhase();
  }

  return Object.freeze({
    version: BOUNDED_PIPELINE_VERSION,
    offerTick,
    recordProtected,
    stageChunk,
    drain,
    stats,
    resume,
    dispose,
  });
}
