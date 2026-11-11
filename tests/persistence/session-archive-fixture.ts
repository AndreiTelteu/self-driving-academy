import {
  PERSISTENCE_SCHEMA_VERSION,
  createSessionArchiveStore,
  createSessionArchiveTransactionRunner,
  createWorldCheckpointWriter,
  sessionArchiveSizes,
  stampSessionArchiveChecksum,
} from '../../src/persistence/index';
import type {
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
  PersistedRecordInput,
  SessionArchiveComponents,
  SessionArchiveDocument,
  SessionArchiveExportAccepted,
  SessionArchiveStore,
  SessionArchiveTransactionRunner,
  SessionArchiveVersions,
  WorldCheckpointVersions,
} from '../../src/persistence/index';
import type { MissionCatalog, MissionTracker } from '../../src/missions/index';
import type { CampaignRun } from '../missions/mission-rewards-fixture';
import {
  SAVE_PLAYER_ID,
  SAVE_SESSION_ID,
  SAVE_WORLD_EPOCH,
  createSaveHarness,
  customSettings,
  saveInput,
} from './progress-save-fixture';
import type { ProgressSaveStore } from '../../src/persistence/index';
import {
  FIXED_NOW,
  activation,
  derivedProfile,
  fixedClock,
  profileVersion,
  scenarioRecord,
} from './fixtures';
import type { RuntimeSettings } from '../../src/settings/index';
import { createWorldFixture, worldSource } from './world-checkpoint-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';

/**
 * 135 fixture: one real session with a real 206 world checkpoint, the real 130 save rows, a real
 * 109/110 profile generation and explicit 127 scenario rows.
 *
 * Nothing here authors a reward, a world state or a profile checksum: the campaign is completed by
 * the real 116/125 modules, the checkpoint is captured and committed by the real 206 writer, and the
 * profile versions are the real 109 records. The archive only reads what those modules stored.
 *
 * The transaction boundary is a second connection on the same origin, which is what a page holding
 * the writer lock would give the import. The same in-memory database state is shared, so the
 * replacement is a real transaction and a real rollback, not a simulation.
 */
export const ARCHIVE_SESSION_ID = SAVE_SESSION_ID;
export const ARCHIVE_PLAYER_ID = SAVE_PLAYER_ID;
export const ARCHIVE_WORLD_EPOCH = SAVE_WORLD_EPOCH;
export const ARCHIVE_PROFILE_ID = 'profile-1';
export const ARCHIVE_VERSION_ID = 'profile-1@2';
export const ARCHIVE_ACTIVATION_SEQUENCE = 3;
export const ARCHIVE_CHECKPOINT_ID = 'checkpoint-135';
export const ARCHIVE_CHECKPOINT_TICK = 4_000;
export const ARCHIVE_DB_NAME = '135-session-archive-db';
export const ARCHIVE_TARGET_DB_NAME = '135-session-archive-target';
export const ARCHIVE_CREATED_AT = FIXED_NOW;

export const ARCHIVE_VERSIONS: SessionArchiveVersions = Object.freeze({
  engine: 'engine-127',
  physics: 'rapier-0.21.0',
  map: 'provisional-v1',
});

const WORLD_VERSIONS: WorldCheckpointVersions = Object.freeze({
  engineVersion: ARCHIVE_VERSIONS.engine,
  physicsVersion: ARCHIVE_VERSIONS.physics,
  mapVersion: ARCHIVE_VERSIONS.map,
});

export interface ArchiveHarness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly repository: LocalRepository;
  readonly catalog: MissionCatalog;
  readonly tracker: MissionTracker;
  readonly store: ProgressSaveStore;
  readonly run: CampaignRun;
  readonly settings: RuntimeSettings;
  readonly world: MutableWorld;
  readonly transactions: SessionArchiveTransactionRunner;
  readonly archive: SessionArchiveStore;
}

export interface ArchiveHarnessOptions {
  readonly factory?: MemoryIdbFactory;
  readonly locks?: MemoryLockManager;
  readonly dbName?: string;
  readonly through?: string;
  /** Seeds the real 109 versions and the 110 activation the checkpoint names. */
  readonly profile?: boolean;
  /** Captures and commits the real 206 world checkpoint. */
  readonly checkpoint?: boolean;
  /** Writes the real 130 rows through the 130 store. */
  readonly save?: boolean;
  /** Explicit scenario rows of the session. */
  readonly scenarios?: number;
}

function scenarioRow(index: number): PersistedRecordInput {
  return scenarioRecord({
    recordId: `scenario-135-${index + 1}`,
    sessionId: ARCHIVE_SESSION_ID,
    worldEpoch: ARCHIVE_WORLD_EPOCH,
    body: {
      mapVersion: ARCHIVE_VERSIONS.map,
      seed: index + 1,
      vehicleClass: 'TAXI',
    },
  });
}

/** Opens the transaction boundary of the same origin, as the writer page would expose it. */
export async function openTransactionRunner(
  factory: MemoryIdbFactory,
  dbName: string,
): Promise<SessionArchiveTransactionRunner> {
  const connection = await factory.open({
    name: dbName,
    version: PERSISTENCE_SCHEMA_VERSION,
    plan: () => [],
    now: fixedClock(),
  });
  if (connection.status !== 'OPENED') {
    throw new Error(`135 fixture connection is ${connection.status}`);
  }
  return createSessionArchiveTransactionRunner(connection.database);
}

export async function createArchiveHarness(
  options: ArchiveHarnessOptions = {},
): Promise<ArchiveHarness> {
  const dbName = options.dbName ?? ARCHIVE_DB_NAME;
  const harness = await createSaveHarness({
    factory: options.factory,
    locks: options.locks,
    dbName,
    tabId: 'tab-a',
    through: options.through,
  });
  if (options.profile !== false) {
    await harness.repository.putProfile(profileVersion());
    await harness.repository.putProfile(derivedProfile());
    await harness.repository.activateProfile(
      activation({
        playerId: ARCHIVE_PLAYER_ID,
        versionId: ARCHIVE_VERSION_ID,
        sequence: ARCHIVE_ACTIVATION_SEQUENCE,
      }),
    );
  }
  const world = createWorldFixture();
  world.tick = ARCHIVE_CHECKPOINT_TICK;
  world.profile = {
    profileId: ARCHIVE_PROFILE_ID,
    activeVersionId: ARCHIVE_VERSION_ID,
    activationSequence: ARCHIVE_ACTIVATION_SEQUENCE,
  };
  if (options.checkpoint !== false) {
    const writer = createWorldCheckpointWriter({
      repository: harness.repository,
      writerId: 'writer-135',
      versions: WORLD_VERSIONS,
      now: fixedClock(),
    });
    const prepared = writer.captureAtTick(worldSource(world), {
      checkpointId: ARCHIVE_CHECKPOINT_ID,
      sessionId: ARCHIVE_SESSION_ID,
      generation: 1,
    });
    if (prepared.status !== 'PREPARED') {
      throw new Error(`135 fixture capture refused: ${prepared.rejection.code}`);
    }
    const committed = await writer.commitCapture(prepared.capture);
    if (committed.status !== 'COMMITTED') {
      throw new Error(`135 fixture checkpoint commit is ${committed.status}`);
    }
  }
  const settings = customSettings(ARCHIVE_PLAYER_ID);
  if (options.save !== false) {
    const saved = await harness.store.save(saveInput(harness));
    if (saved.status !== 'COMMITTED') {
      throw new Error(`135 fixture save is ${saved.status}`);
    }
  }
  const scenarios = options.scenarios ?? 1;
  for (let index = 0; index < scenarios; index += 1) {
    await harness.repository.putScenario(scenarioRow(index));
  }
  const transactions = await openTransactionRunner(harness.factory, dbName);
  const archive = createSessionArchiveStore({
    repository: harness.repository,
    catalog: harness.catalog,
    transactions,
  });
  return {
    factory: harness.factory,
    locks: harness.locks,
    repository: harness.repository,
    catalog: harness.catalog,
    tracker: harness.tracker,
    store: harness.store,
    run: harness.run,
    settings,
    world,
    transactions,
    archive,
  };
}

/** Exports the harness session and fails loudly when the export refuses; tests read the code. */
export async function exportArchive(
  harness: ArchiveHarness,
  overrides: {
    readonly createdAt?: string;
    readonly sessionId?: string;
    readonly playerId?: string;
  } = {},
): Promise<SessionArchiveExportAccepted> {
  const result = await harness.archive.export({
    sessionId: overrides.sessionId ?? ARCHIVE_SESSION_ID,
    playerId: overrides.playerId ?? ARCHIVE_PLAYER_ID,
    createdAt: overrides.createdAt ?? ARCHIVE_CREATED_AT,
  });
  if (result.status !== 'ACCEPTED') {
    throw new Error(`135 fixture export refused: ${JSON.stringify(result.rejection)}`);
  }
  return result;
}

/** Rebuilds a document with another component set and a correct envelope checksum. */
export function restamp(
  document: SessionArchiveDocument,
  components: SessionArchiveComponents,
): SessionArchiveDocument {
  return stampSessionArchiveChecksum({
    ...document,
    components,
    sizes: sessionArchiveSizes(components),
  });
}

/** Byte fingerprint of the stored session; a refused import must leave it identical. */
export async function sessionFingerprint(
  repository: LocalRepository,
  sessionId: string = ARCHIVE_SESSION_ID,
  playerId: string = ARCHIVE_PLAYER_ID,
): Promise<string> {
  const rows = await repository.readPlayerSave(sessionId, playerId);
  const scenarios = await repository.listScenarios(sessionId);
  const checkpoint = await repository.latestCheckpoint(sessionId);
  return JSON.stringify({
    progress: rows.progress,
    settings: rows.settings,
    scenarios,
    checkpoint,
  });
}
