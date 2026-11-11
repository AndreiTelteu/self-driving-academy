import {
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  createWorldCheckpointWriter,
} from '../../src/persistence/index';
import type {
  CheckpointRecord,
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
  WorldCapture,
  WorldCheckpointVersions,
  WorldCheckpointWriter,
} from '../../src/persistence/index';
import { FIXED_NOW, fixedClock, progressRecord } from './fixtures';
import {
  WORLD_FIXTURE,
  captureInput,
  createWorldFixture,
  runWorld,
  worldSource,
} from './world-checkpoint-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';

/**
 * 136 fixture: the real 206 writer commits a valid generation, then a newer generation is written
 * with a tampered body, and the real 129/130 rows of the same session are stored next to it.
 *
 * Nothing here authors a reward or a world: the snapshot comes from the deterministic 70-vehicle
 * fixture, and the checkpoint envelope is the one the writer itself produces.
 */
export const RESTORE_DB = '136-session-restore-db';
export const RESTORE_SESSION = 'session-136';
export const RESTORE_PROFILE = WORLD_FIXTURE.profileId;
export const RESTORE_LEARNING_EPOCH = WORLD_FIXTURE.learningEpoch;
export const RESTORE_WORLD_EPOCH = WORLD_FIXTURE.worldEpoch;

export const RESTORE_VERSIONS: WorldCheckpointVersions = Object.freeze({
  engineVersion: 'engine-206',
  physicsVersion: 'rapier-0.21.0',
  mapVersion: 'provisional-v1',
});

export const VALID_CHECKPOINT = 'checkpoint-136-valid';
export const INVALID_CHECKPOINT = 'checkpoint-136-invalid-newest';
export const VALID_TICK = WORLD_FIXTURE.captureTick;
export const INVALID_TICK = WORLD_FIXTURE.captureTick + 60;

export interface RestoreHarness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly repository: LocalRepository;
  readonly writer: WorldCheckpointWriter;
  readonly world: MutableWorld;
  readonly valid: WorldCapture;
}

function envelopeOf(
  capture: WorldCapture,
  checkpointId: string,
  versions: WorldCheckpointVersions = RESTORE_VERSIONS,
): Omit<CheckpointRecord, 'bodyBytes'> {
  return {
    schemaVersion: 1,
    checkpointId,
    sessionId: RESTORE_SESSION,
    profileId: capture.profileId,
    worldEpoch: capture.worldEpoch,
    tick: capture.tick,
    generation: capture.generation,
    learningEpoch: capture.learningEpoch,
    engineVersion: versions.engineVersion,
    physicsVersion: versions.physicsVersion,
    mapVersion: versions.mapVersion,
    createdAt: FIXED_NOW,
    body: capture.body,
  };
}

export async function openRestoreRepository(
  factory: MemoryIdbFactory,
  locks: MemoryLockManager,
  options: { readonly dbName?: string; readonly tabId?: string } = {},
): Promise<LocalRepository> {
  const repository = createLocalRepository({
    factory,
    locks,
    dbName: options.dbName ?? RESTORE_DB,
    tabId: options.tabId ?? 'tab-136',
    now: fixedClock(),
  });
  const report = await repository.open();
  if (report.status !== 'READY') {
    throw new Error(`136 fixture repository is ${report.status}`);
  }
  return repository;
}

function newWriter(repository: LocalRepository): WorldCheckpointWriter {
  return createWorldCheckpointWriter({
    repository,
    writerId: 'tab-136',
    versions: RESTORE_VERSIONS,
    monotonic: () => 0,
    now: fixedClock(),
  });
}

/**
 * Stores the durable rows of the session: one tracker row and one campaign row. They are the 130
 * ledger the restart must continue, and the restore must never rewrite them.
 */
export async function storeLedgerRows(repository: LocalRepository): Promise<void> {
  const tracker = await repository.putProgress(
    progressRecord({
      recordId: `tracker:${RESTORE_SESSION}`,
      sessionId: RESTORE_SESSION,
      worldEpoch: RESTORE_WORLD_EPOCH,
      status: 'ACTIVE',
      body: { instances: 1, rewards: { granted: 3, xp: 120 }, digest: 'tracker-digest' },
    }),
  );
  if (tracker.status !== 'COMMITTED') throw new Error('the tracker row was refused');
  const campaign = await repository.putProgress(
    progressRecord({
      recordId: `campaign:${RESTORE_SESSION}`,
      sessionId: RESTORE_SESSION,
      worldEpoch: RESTORE_WORLD_EPOCH,
      status: 'ACTIVE',
      body: { events: 2, counts: { completed: 1, xp: 120, granted: 3 }, digest: 'campaign-digest' },
    }),
  );
  if (campaign.status !== 'COMMITTED') throw new Error('the campaign row was refused');
}

/** A valid generation, then a newer generation whose body checksum no longer matches. */
export async function createRestoreHarness(
  options: { readonly dbName?: string; readonly ledger?: boolean } = {},
): Promise<RestoreHarness> {
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const repository = await openRestoreRepository(factory, locks, { dbName: options.dbName });
  const writer = newWriter(repository);
  const world = createWorldFixture();
  runWorld(world, VALID_TICK);

  const validAttempt = writer.captureAtTick(worldSource(world), {
    checkpointId: VALID_CHECKPOINT,
    sessionId: RESTORE_SESSION,
    generation: 1,
  });
  if (validAttempt.status !== 'PREPARED') {
    throw new Error(`the valid checkpoint was refused: ${validAttempt.rejection.code}`);
  }
  const committed = await writer.commitCapture(validAttempt.capture);
  if (committed.status !== 'COMMITTED') {
    throw new Error(`the valid checkpoint was not committed: ${committed.status}`);
  }

  runWorld(world, VALID_TICK);
  const invalidAttempt = writer.captureAtTick(worldSource(world), {
    checkpointId: INVALID_CHECKPOINT,
    sessionId: RESTORE_SESSION,
    generation: 2,
  });
  if (invalidAttempt.status !== 'PREPARED') {
    throw new Error(`the invalid checkpoint was refused: ${invalidAttempt.rejection.code}`);
  }
  const tampered = JSON.parse(JSON.stringify(invalidAttempt.capture.body)) as {
    vehicles: { position: { x: number } }[];
  };
  const firstVehicle = tampered.vehicles[0];
  if (firstVehicle !== undefined) firstVehicle.position.x = firstVehicle.position.x + 5;
  const stored = await repository.putCheckpoint({
    ...envelopeOf(invalidAttempt.capture, INVALID_CHECKPOINT),
    body: tampered,
  });
  if (stored.status !== 'COMMITTED') {
    throw new Error(`the tampered checkpoint was refused: ${stored.rejection.code}`);
  }
  if (options.ledger !== false) await storeLedgerRows(repository);

  return Object.freeze({
    factory,
    locks,
    repository,
    writer,
    world,
    valid: validAttempt.capture,
  });
}

/** A session whose only generation is the valid one. */
export async function createSingleCheckpointHarness(): Promise<RestoreHarness> {
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const repository = await openRestoreRepository(factory, locks, {
    dbName: '136-session-restore-single',
  });
  const writer = newWriter(repository);
  const world = createWorldFixture();
  runWorld(world, VALID_TICK);
  const attempt = writer.captureAtTick(worldSource(world), {
    checkpointId: VALID_CHECKPOINT,
    sessionId: RESTORE_SESSION,
    generation: 1,
  });
  if (attempt.status !== 'PREPARED') throw new Error('the single checkpoint was refused');
  const committed = await writer.commitCapture(attempt.capture);
  if (committed.status !== 'COMMITTED') throw new Error('the single checkpoint was not committed');
  return Object.freeze({
    factory,
    locks,
    repository,
    writer,
    world,
    valid: attempt.capture,
  });
}

/** A session whose only generation cannot be decoded (tampered body). */
export async function createInvalidOnlyHarness(): Promise<RestoreHarness> {
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const repository = await openRestoreRepository(factory, locks, {
    dbName: '136-session-restore-invalid',
  });
  const writer = newWriter(repository);
  const world = createWorldFixture();
  runWorld(world, VALID_TICK);
  const attempt = writer.captureAtTick(worldSource(world), {
    checkpointId: INVALID_CHECKPOINT,
    sessionId: RESTORE_SESSION,
    generation: 1,
  });
  if (attempt.status !== 'PREPARED') throw new Error('the invalid-only checkpoint was refused');
  const tampered = JSON.parse(JSON.stringify(attempt.capture.body)) as {
    vehicles: { position: { x: number } }[];
  };
  const firstVehicle = tampered.vehicles[0];
  if (firstVehicle !== undefined) firstVehicle.position.x = firstVehicle.position.x + 5;
  const stored = await repository.putCheckpoint({
    ...envelopeOf(attempt.capture, INVALID_CHECKPOINT),
    body: tampered,
  });
  if (stored.status !== 'COMMITTED') throw new Error('the invalid-only checkpoint was refused');
  return Object.freeze({ factory, locks, repository, writer, world, valid: attempt.capture });
}

/** Envelope-level incoherence: the envelope claims another learning epoch than the snapshot. */
export async function storeEnvelopeMismatch(
  repository: LocalRepository,
  harness: RestoreHarness,
): Promise<void> {
  const stored = await repository.putCheckpoint({
    ...envelopeOf(harness.valid, 'checkpoint-136-epoch-mismatch'),
    generation: 3,
    tick: VALID_TICK,
    learningEpoch: RESTORE_LEARNING_EPOCH + 1,
  });
  if (stored.status !== 'COMMITTED') throw new Error('the mismatched envelope was refused');
}

/** The exact rows a restart must keep: the ledger digest of the harness. */
export async function ledgerRows(repository: LocalRepository): Promise<readonly unknown[]> {
  return repository.listProgress(RESTORE_SESSION);
}

/** Canonical description of the database used to prove a read-only restore. */
export async function repositoryFingerprint(repository: LocalRepository): Promise<string> {
  return JSON.stringify({
    progress: (await repository.listProgress(RESTORE_SESSION)).map((row) => [
      row.recordId,
      row.revision,
      row.bodyBytes,
    ]),
    segments: (await repository.listSegments(RESTORE_SESSION)).map((row) => [
      row.recordId,
      row.status,
      row.revision,
    ]),
    checkpoints: (await repository.listCheckpoints(RESTORE_SESSION)).map((row) => [
      row.checkpointId,
      row.tick,
      row.generation,
    ]),
  });
}

/** The canonical capture of the world at the given tick, for the resume assertions. */
export function captureAt(world: MutableWorld): ReturnType<typeof captureInput> {
  return captureInput(world);
}
