import {
  createDailyProgress,
  createPlayerProgress,
  dailyMissionSetOrdered,
  recordDailyReward,
} from '../../src/missions';
import type {
  DailyMissionInstance,
  DailyProgressSnapshot,
  DailyRewardRecord,
  PlayerProgressCheckpoint,
} from '../../src/missions';
import {
  createEconomySaveStore,
  createSaveFileStore,
  createSessionArchiveEconomyStore,
  createWorldCheckpointWriter,
  loadEconomySave,
} from '../../src/persistence/index';
import type {
  EconomySaveBundle,
  EconomySaveStore,
  SaveFileStore,
  SaveFileWorldPort,
  SaveFileWorldPrepareInput,
  SessionArchiveEconomyExportAccepted,
  SessionArchiveEconomyStore,
  SessionArchiveTransactionRunner,
} from '../../src/persistence/index';
import { createDestructibleDecor } from '../../src/world';
import type { DestructibleDecor, DestructibleSnapshot } from '../../src/world';
import { createEventBus } from '../../src/simulation';
import type { MissionCatalog } from '../../src/missions/index';
import {
  ARCHIVE_VERSIONS,
  ARCHIVE_WORLD_EPOCH,
  openTransactionRunner,
} from './session-archive-fixture';
import { createSaveHarness, customSettings, saveInput } from './progress-save-fixture';
import type { SaveHarness } from './progress-save-fixture';
import { FIXED_NOW, activation, profileVersion, scenarioRecord } from './fixtures';
import { createWorldFixture, worldSource } from './world-checkpoint-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';
import { createEconomyBundle } from './economy-save-fixture';
import { calendarInput, fullCapabilities, step } from '../missions/mission-daily-fixture';
import { activeWindow } from '../missions/player-xp-fixture';
import { destructibleWorld, isolatedDefinition } from '../world/destructible-decor-fixture';

/**
 * 234 fixture: two real sessions of different kinds in separate databases, each with a real 206
 * checkpoint, real 130 progress rows, a real 215 economy bundle and a real 227 decor snapshot.
 *
 * Nothing here authors a reward, an XP balance, a world state or a decor checksum: the campaign is
 * completed by the real 116/125 modules, the checkpoint by the real 206 writer, the economy by the
 * real 209/211/212/213 modules and the decor by the real 227 contract. The savefile only packages
 * what those owners produced.
 */

export const SAVEFILE_DB_ACADEMY = '234-savefile-academy';
export const SAVEFILE_DB_CHAOS = '234-savefile-chaos';
export const SAVEFILE_DB_TARGET = '234-savefile-target';
export const SAVEFILE_ACADEMY_SESSION_ID = 'session:234:academy';
export const SAVEFILE_CHAOS_SESSION_ID = 'session:234:chaos';
export const SAVEFILE_ACADEMY_PLAYER_ID = 'player:234:academy';
export const SAVEFILE_CHAOS_PLAYER_ID = 'player:234:chaos';
export const SAVEFILE_ACADEMY_PROFILE_ID = 'profile:234:academy';
export const SAVEFILE_CHAOS_PROFILE_ID = 'profile:234:chaos';
export const SAVEFILE_ACADEMY_VERSION_ID = 'profile:234:academy@1';
export const SAVEFILE_CHAOS_VERSION_ID = 'profile:234:chaos@1';
export const SAVEFILE_ACADEMY_EPOCH = ARCHIVE_WORLD_EPOCH;
export const SAVEFILE_CHAOS_EPOCH = ARCHIVE_WORLD_EPOCH + 1;
export const SAVEFILE_ACADEMY_TICK = 4_000;
export const SAVEFILE_CHAOS_TICK = 2_500;
export const SAVEFILE_ACADEMY_CHECKPOINT = 'checkpoint:234:academy';
export const SAVEFILE_CHAOS_CHECKPOINT = 'checkpoint:234:chaos';
export const SAVEFILE_CREATED_AT = FIXED_NOW;
export const SAVEFILE_DAILY_DATE = '2026-11-11' as const;

const ACTIVE_START_MS = 1_794_475_260_000;
const ACTIVE_DURATION_MS = 30_000;

export interface SessionSpec {
  readonly kind: 'ACADEMY' | 'CHAOS';
  readonly dbName: string;
  readonly tabId: string;
  readonly sessionId: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly versionId: string;
  readonly sequence: number;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly checkpointId: string;
}

export const ACADEMY_SPEC: SessionSpec = Object.freeze({
  kind: 'ACADEMY',
  dbName: SAVEFILE_DB_ACADEMY,
  tabId: 'tab-234-academy',
  sessionId: SAVEFILE_ACADEMY_SESSION_ID,
  playerId: SAVEFILE_ACADEMY_PLAYER_ID,
  profileId: SAVEFILE_ACADEMY_PROFILE_ID,
  versionId: SAVEFILE_ACADEMY_VERSION_ID,
  sequence: 3,
  worldEpoch: SAVEFILE_ACADEMY_EPOCH,
  tick: SAVEFILE_ACADEMY_TICK,
  checkpointId: SAVEFILE_ACADEMY_CHECKPOINT,
});

export const CHAOS_SPEC: SessionSpec = Object.freeze({
  kind: 'CHAOS',
  dbName: SAVEFILE_DB_CHAOS,
  tabId: 'tab-234-chaos',
  sessionId: SAVEFILE_CHAOS_SESSION_ID,
  playerId: SAVEFILE_CHAOS_PLAYER_ID,
  profileId: SAVEFILE_CHAOS_PROFILE_ID,
  versionId: SAVEFILE_CHAOS_VERSION_ID,
  sequence: 1,
  worldEpoch: SAVEFILE_CHAOS_EPOCH,
  tick: SAVEFILE_CHAOS_TICK,
  checkpointId: SAVEFILE_CHAOS_CHECKPOINT,
});

export interface SessionFixture {
  readonly spec: SessionSpec;
  readonly harness: SaveHarness;
  readonly world: MutableWorld;
  readonly economy: EconomySaveStore;
  readonly archiveStore: SessionArchiveEconomyStore;
  readonly archive: SessionArchiveEconomyExportAccepted;
  readonly decor: DestructibleSnapshot;
  readonly daily: DailyProgressSnapshot;
  readonly instance: DailyMissionInstance;
  readonly record: DailyRewardRecord;
  readonly player: PlayerProgressCheckpoint;
  readonly transactions: SessionArchiveTransactionRunner;
}

function profileOf(spec: SessionSpec) {
  return profileVersion({
    profileId: spec.profileId,
    versionId: spec.versionId,
    engineVersion: ARCHIVE_VERSIONS.engine,
    parameters: { speed: spec.kind === 'CHAOS' ? 9 : 12 },
  });
}

function activationOf(spec: SessionSpec) {
  return activation({
    playerId: spec.playerId,
    profileId: spec.profileId,
    versionId: spec.versionId,
    sequence: spec.sequence,
  });
}

/** One real 211/212/213 bundle for the given session, with a real daily reward and 0,5 XP. */
function createEconomyFor(spec: SessionSpec): {
  readonly daily: DailyProgressSnapshot;
  readonly economy: EconomySaveBundle;
  readonly player: PlayerProgressCheckpoint;
  readonly instance: DailyMissionInstance;
  readonly record: DailyRewardRecord;
} {
  const observedAtMs = calendarInput(SAVEFILE_DAILY_DATE).observedAtMs;
  const first = step({
    playerId: spec.playerId,
    calendar: calendarInput(SAVEFILE_DAILY_DATE),
    capabilities: fullCapabilities(),
  });
  if (first.set === null) throw new Error('Expected a generated 211 daily set');
  const instance = dailyMissionSetOrdered(first.set)[0];
  if (instance === undefined) throw new Error('Expected a 211 daily instance');
  const rewarded = recordDailyReward({
    state: first.state,
    instanceId: instance.instanceId,
    grantedAtMs: observedAtMs,
  });
  if (!rewarded.granted) throw new Error('Expected the first 211 daily reward');
  const progress = createDailyProgress({
    playerId: spec.playerId,
    sessionId: spec.sessionId,
    worldEpoch: spec.worldEpoch,
    calendar: calendarInput(SAVEFILE_DAILY_DATE),
    capabilities: fullCapabilities(),
    generatedAtMs: observedAtMs,
    state: rewarded.state,
  });
  const player = createPlayerProgress({ playerId: spec.playerId });
  const credited = player.creditDaily({ record: rewarded.record, instance });
  if (credited.credited <= 0)
    throw new Error(`Expected the 213 daily credit, got ${credited.status}`);
  const window = player.observeActiveTime(activeWindow(ACTIVE_START_MS, ACTIVE_DURATION_MS));
  if (window.status !== 'CREDITED') {
    throw new Error(`Expected a credited 213 active window, got ${window.status}`);
  }
  return Object.freeze({
    daily: progress.snapshot(),
    economy: createEconomyBundle(),
    player: player.checkpoint(),
    instance,
    record: rewarded.record,
  });
}

function createRealDecor(spec: SessionSpec): DestructibleDecor {
  const { layout, plan } = destructibleWorld();
  return createDestructibleDecor({
    context: {
      schemaVersion: 1,
      units: 'SI',
      sessionId: spec.sessionId,
      worldEpoch: spec.worldEpoch,
    },
    eventBus: createEventBus({ sessionId: spec.sessionId, worldEpoch: spec.worldEpoch }),
    layout,
    plan,
    presentationPreset: 'LOW',
  });
}

/** Breaks one isolated cone through the real 227 impact path, then captures the state. */
function captureDecor(spec: SessionSpec): DestructibleSnapshot {
  const { plan } = destructibleWorld();
  const decor = createRealDecor(spec);
  try {
    const target = isolatedDefinition(plan, 'CONE');
    const result = decor.applyImpact({
      tick: spec.tick,
      objectId: target.objectId,
      impulseNs: target.impactThreshold.breakImpulseNs + 1,
      pointM: { x: 0, y: 0, z: 0 },
      instigatorId: 'taxi-01',
      controlSource: 'MANUAL',
    });
    if (result.state !== 'BROKEN') throw new Error(`Expected BROKEN decor, got ${result.state}`);
    return decor.capture();
  } finally {
    decor.dispose();
  }
}

export async function createSessionFixture(spec: SessionSpec): Promise<SessionFixture> {
  const harness = await createSaveHarness({ dbName: spec.dbName, tabId: spec.tabId });
  await harness.repository.putProfile(profileOf(spec));
  await harness.repository.activateProfile(activationOf(spec));
  const world = createWorldFixture();
  world.tick = spec.tick;
  world.worldEpoch = spec.worldEpoch;
  world.profile = {
    profileId: spec.profileId,
    activeVersionId: spec.versionId,
    activationSequence: spec.sequence,
  };
  const writer = createWorldCheckpointWriter({
    repository: harness.repository,
    writerId: `writer-234-${spec.kind}`,
    versions: {
      engineVersion: ARCHIVE_VERSIONS.engine,
      physicsVersion: ARCHIVE_VERSIONS.physics,
      mapVersion: ARCHIVE_VERSIONS.map,
    },
    now: () => FIXED_NOW,
  });
  const prepared = writer.captureAtTick(worldSource(world), {
    checkpointId: spec.checkpointId,
    sessionId: spec.sessionId,
    generation: 1,
  });
  if (prepared.status !== 'PREPARED') {
    throw new Error(`234 fixture capture refused: ${prepared.rejection.code}`);
  }
  const committed = await writer.commitCapture(prepared.capture);
  if (committed.status !== 'COMMITTED') {
    throw new Error(`234 fixture checkpoint commit is ${committed.status}`);
  }
  const saved = await harness.store.save(
    saveInput(harness, {
      sessionId: spec.sessionId,
      playerId: spec.playerId,
      worldEpoch: spec.worldEpoch,
      settings: customSettings(spec.playerId),
    }),
  );
  if (saved.status !== 'COMMITTED') {
    throw new Error(`234 fixture progress save is ${saved.status}`);
  }
  await harness.repository.putScenario(
    scenarioRecord({
      recordId: `scenario:234:${spec.kind}`,
      sessionId: spec.sessionId,
      worldEpoch: spec.worldEpoch,
      body: { mapVersion: ARCHIVE_VERSIONS.map, seed: spec.kind === 'CHAOS' ? 2 : 1 },
    }),
  );
  const transactions = await openTransactionRunner(harness.factory, spec.dbName);
  const bundle = createEconomyFor(spec);
  const economy = createEconomySaveStore({ transactions });
  const economySaved = await economy.save({
    sessionId: spec.sessionId,
    playerId: spec.playerId,
    worldEpoch: spec.worldEpoch,
    createdAt: FIXED_NOW,
    daily: bundle.daily,
    economy: bundle.economy,
    player: bundle.player,
  });
  if (economySaved.status === 'REJECTED') {
    throw new Error(
      `234 fixture economy refused: ${economySaved.rejection.code} at ${economySaved.rejection.path}`,
    );
  }
  const archiveStore = createSessionArchiveEconomyStore({
    repository: harness.repository,
    transactions,
    catalog: harness.catalog,
  });
  const archive = await archiveStore.export({
    sessionId: spec.sessionId,
    playerId: spec.playerId,
    createdAt: FIXED_NOW,
    catalog: harness.catalog,
  });
  if (archive.status !== 'ACCEPTED') {
    throw new Error(`234 fixture archive refused: ${archive.rejection.code}`);
  }
  return {
    spec,
    harness,
    world,
    economy,
    archiveStore,
    archive,
    decor: captureDecor(spec),
    daily: bundle.daily,
    instance: bundle.instance,
    record: bundle.record,
    player: bundle.player,
    transactions,
  };
}

export interface SaveFileSessions {
  readonly academy: SessionFixture;
  readonly chaos: SessionFixture;
}

export async function createSaveFileSessions(): Promise<SaveFileSessions> {
  return {
    academy: await createSessionFixture(ACADEMY_SPEC),
    chaos: await createSessionFixture(CHAOS_SPEC),
  };
}

/** The staged-world record a test can inspect; the live world is never touched before commit. */
export interface StagedWorldState {
  readonly prepared: number;
  readonly committed: number;
  readonly discarded: number;
  readonly lastInput: SaveFileWorldPrepareInput | null;
  readonly restoredDecor: number;
}

export interface TestWorldPort {
  readonly port: SaveFileWorldPort;
  readonly state: StagedWorldState;
}

/**
 * A world port that stages by restoring every decor snapshot through the real 227 contract.
 *
 * A snapshot whose internal checksum or state is inconsistent therefore fails before the database
 * transaction, exactly like a composition layer that restores the world on a fresh instance.
 */
export function createTestWorldPort(
  options: { readonly failPrepare?: boolean } = {},
): TestWorldPort {
  let prepared = 0;
  let committed = 0;
  let discarded = 0;
  let restoredDecor = 0;
  let lastInput: SaveFileWorldPrepareInput | null = null;
  let pending: (() => void) | null = null;
  const state: StagedWorldState = {
    get prepared() {
      return prepared;
    },
    get committed() {
      return committed;
    },
    get discarded() {
      return discarded;
    },
    get lastInput() {
      return lastInput;
    },
    get restoredDecor() {
      return restoredDecor;
    },
  };
  const port: SaveFileWorldPort = Object.freeze({
    prepare(input: SaveFileWorldPrepareInput) {
      if (options.failPrepare === true) {
        throw new Error('The composition layer could not stage the world');
      }
      lastInput = input;
      prepared += 1;
      for (const session of input.sessions) {
        if (session.decor === null) continue;
        const kind = session.sessionKind === 'CHAOS' ? CHAOS_SPEC : ACADEMY_SPEC;
        const decor = createRealDecor({
          ...kind,
          sessionId: session.sessionId,
          worldEpoch: session.worldEpoch,
        });
        try {
          decor.restore(session.decor);
          restoredDecor += 1;
        } finally {
          decor.dispose();
        }
      }
      pending = () => {
        committed += 1;
      };
      return Object.freeze({
        launch: {
          mode: 'PAUSED_AUTO' as const,
          paused: true as const,
          auto: true as const,
          inputReleased: true as const,
          manualVehicles: 0 as const,
        },
        commit() {
          pending?.();
          pending = null;
        },
        discard() {
          discarded += 1;
          pending = null;
        },
      });
    },
  });
  return { port, state };
}

export interface SaveFileTarget {
  readonly harness: SaveHarness;
  readonly transactions: SessionArchiveTransactionRunner;
  readonly store: SaveFileStore;
  readonly world: TestWorldPort;
  readonly catalog: MissionCatalog;
}

/** The import target: one database that already stores both profile generations. */
export async function createSaveFileTarget(
  options: {
    readonly dbName?: string;
    readonly failPrepare?: boolean;
    readonly withWorld?: boolean;
  } = {},
): Promise<SaveFileTarget> {
  const dbName = options.dbName ?? SAVEFILE_DB_TARGET;
  const harness = await createSaveHarness({ dbName, tabId: 'tab-234-target' });
  for (const spec of [ACADEMY_SPEC, CHAOS_SPEC]) {
    await harness.repository.putProfile(profileOf(spec));
    await harness.repository.activateProfile(activationOf(spec));
  }
  const transactions = await openTransactionRunner(harness.factory, dbName);
  const world = createTestWorldPort({ failPrepare: options.failPrepare === true });
  const store = createSaveFileStore({
    repository: harness.repository,
    transactions,
    catalog: harness.catalog,
    world: options.withWorld === false ? undefined : world.port,
  });
  return { harness, transactions, store, world, catalog: harness.catalog };
}

/** Byte fingerprint of the durable target; a refused replacement must leave it identical. */
export async function targetFingerprint(target: SaveFileTarget): Promise<string> {
  const parts: unknown[] = [];
  for (const spec of [ACADEMY_SPEC, CHAOS_SPEC]) {
    const rows = await target.harness.repository.readPlayerSave(spec.sessionId, spec.playerId);
    const scenarios = await target.harness.repository.listScenarios(spec.sessionId);
    const checkpoint = await target.harness.repository.latestCheckpoint(spec.sessionId);
    const economy = await target.transactions.transact(['meta'], (transaction) =>
      loadEconomySave(transaction, {
        sessionId: spec.sessionId,
        playerId: spec.playerId,
      }),
    );
    parts.push({
      sessionId: spec.sessionId,
      playerId: spec.playerId,
      rows,
      scenarios,
      checkpoint,
      economy,
    });
  }
  return JSON.stringify(parts);
}
