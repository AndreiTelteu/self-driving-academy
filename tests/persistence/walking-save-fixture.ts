import {
  createEconomySaveStore,
  createSessionArchiveEconomyStore,
  createSessionArchiveStore,
  createWorldCheckpointWriter,
  walkingCharacterSnapshot,
} from '../../src/persistence/index';
import type {
  EconomySaveStore,
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
  PersistedRecordInput,
  ProgressSaveStore,
  SessionArchiveEconomyStore,
  SessionArchiveStore,
  SessionArchiveTransactionRunner,
  WalkingSaveCharacterState,
  WorldCheckpointVersions,
} from '../../src/persistence/index';
import {
  createCharacterCamera,
  createFleetSwitchState,
  createWalker,
  createWalkingSegments,
  decideFleetTake,
  type CharacterCameraSnapshot,
  type CharacterPoint,
  type FleetSwitchState,
  type WalkWorld,
  type Walker,
  type WalkingSegments,
  type WalkingSegmentsState,
  type WalkingSegmentsTarget,
} from '../../src/character';
import { createInputAuthorityArbiter, type InputAuthorityArbiter } from '../../src/input';
import type { RuntimeSettings } from '../../src/settings/index';
import type { MissionCatalog } from '../../src/missions/index';
import {
  ARCHIVE_ACTIVATION_SEQUENCE,
  ARCHIVE_CREATED_AT,
  ARCHIVE_PLAYER_ID,
  ARCHIVE_PROFILE_ID,
  ARCHIVE_SESSION_ID,
  ARCHIVE_VERSION_ID,
  ARCHIVE_VERSIONS,
  ARCHIVE_WORLD_EPOCH,
  openTransactionRunner,
} from './session-archive-fixture';
import { createSaveHarness, customSettings, saveInput } from './progress-save-fixture';
import { createEconomyComponents } from './economy-save-fixture';
import { activation, derivedProfile, fixedClock, profileVersion, scenarioRecord } from './fixtures';
import { createWorldFixture, worldSource } from './world-checkpoint-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';
import {
  cameraControl,
  characterTarget,
  cityCameraObstacles,
  cityCameraWorld,
  vehicleTarget,
} from '../character/character-camera-suite';
import { nearFixture, stateOf, takeRequest } from '../character/fleet-switch-suite';
import { realCurbSpot, realWalkWorld } from '../character/walk-world';

/**
 * 200 fixture: one real session (135 + 215) whose world checkpoint is captured at the character tick
 * of the scenario, plus the two real character states the reload tests need — a session in which the
 * player is walking and a session in which the player is sitting in a taxi.
 *
 * Nothing here authors a position, a reward or a world state: the body comes from the real 192
 * walker on the real authored city, the authority from the real 193 arbiter, the camera from the real
 * 194 camera, the segment from the real 198 model and the takeover from the real 197 decision (which
 * calls the delivered 195/196 decisions).
 */
export const WALKING_SAVE_TICK = 40;
export const WALKING_SAVE_CHARACTER_ID = 'character:player-1';
export const WALKING_SAVE_DB_NAME = '200-walking-save-db';

const WORLD_VERSIONS: WorldCheckpointVersions = Object.freeze({
  engineVersion: ARCHIVE_VERSIONS.engine,
  physicsVersion: ARCHIVE_VERSIONS.physics,
  mapVersion: ARCHIVE_VERSIONS.map,
});

export interface WalkingArchiveHarness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly dbName: string;
  readonly repository: LocalRepository;
  readonly catalog: MissionCatalog;
  readonly store: ProgressSaveStore;
  readonly transactions: SessionArchiveTransactionRunner;
  readonly archive: SessionArchiveStore;
  readonly economy: EconomySaveStore;
  readonly economyArchive: SessionArchiveEconomyStore;
  readonly world: MutableWorld;
  readonly settings: RuntimeSettings;
  readonly tick: number;
}

/**
 * A real 135 + 215 session at `tick`: profile generation, save rows, an explicit scenario, the world
 * checkpoint of that same tick, the economy store and the version 2 archive store on the writer
 * transaction boundary of the same origin.
 */
export async function createWalkingArchive(
  options: { readonly tick?: number; readonly dbName?: string } = {},
): Promise<WalkingArchiveHarness> {
  const tick = options.tick ?? WALKING_SAVE_TICK;
  const dbName = options.dbName ?? `${WALKING_SAVE_DB_NAME}-${tick}`;
  const harness = await createSaveHarness({ dbName, tabId: 'tab-200' });
  await harness.repository.putProfile(profileVersion());
  await harness.repository.putProfile(derivedProfile());
  await harness.repository.activateProfile(
    activation({
      playerId: ARCHIVE_PLAYER_ID,
      versionId: ARCHIVE_VERSION_ID,
      sequence: ARCHIVE_ACTIVATION_SEQUENCE,
    }),
  );
  const world = createWorldFixture();
  world.tick = tick;
  world.profile = Object.freeze({
    profileId: ARCHIVE_PROFILE_ID,
    activeVersionId: ARCHIVE_VERSION_ID,
    activationSequence: ARCHIVE_ACTIVATION_SEQUENCE,
  });
  const writer = createWorldCheckpointWriter({
    repository: harness.repository,
    writerId: 'writer-200',
    versions: WORLD_VERSIONS,
    now: fixedClock(),
  });
  const prepared = writer.captureAtTick(worldSource(world), {
    checkpointId: 'checkpoint-200',
    sessionId: ARCHIVE_SESSION_ID,
    generation: 1,
  });
  if (prepared.status !== 'PREPARED') {
    throw new Error(`200 fixture capture refused: ${prepared.rejection.code}`);
  }
  const committed = await writer.commitCapture(prepared.capture);
  if (committed.status !== 'COMMITTED') {
    throw new Error(`200 fixture checkpoint commit is ${committed.status}`);
  }
  const saved = await harness.store.save(saveInput(harness));
  if (saved.status !== 'COMMITTED') throw new Error(`200 fixture save is ${saved.status}`);
  const scenario: PersistedRecordInput = scenarioRecord({
    recordId: 'scenario-200-1',
    sessionId: ARCHIVE_SESSION_ID,
    worldEpoch: ARCHIVE_WORLD_EPOCH,
    body: { mapVersion: ARCHIVE_VERSIONS.map, seed: 7, vehicleClass: 'TAXI' },
  });
  await harness.repository.putScenario(scenario);
  const transactions = await openTransactionRunner(harness.factory, dbName);
  const archive = createSessionArchiveStore({
    repository: harness.repository,
    catalog: harness.catalog,
    transactions,
  });
  const economy = createEconomySaveStore({ transactions });
  const economyArchive = createSessionArchiveEconomyStore({
    repository: harness.repository,
    transactions,
    catalog: harness.catalog,
  });
  return {
    factory: harness.factory,
    locks: harness.locks,
    dbName,
    repository: harness.repository,
    catalog: harness.catalog,
    store: harness.store,
    transactions,
    archive,
    economy,
    economyArchive,
    world,
    settings: customSettings(ARCHIVE_PLAYER_ID),
    tick,
  };
}

export interface WalkingCharacterFixture {
  readonly characterId: string;
  readonly walker: Walker;
  readonly camera: ReturnType<typeof createCharacterCamera>;
  readonly arbiter: InputAuthorityArbiter;
  readonly segments: WalkingSegments;
  readonly fleet: FleetSwitchState;
  readonly vehicleIds: readonly string[];
  readonly tick: number;
  readonly cameraSnapshot: () => CharacterCameraSnapshot;
  readonly segmentsState: () => WalkingSegmentsState;
  readonly world: WalkWorld;
}

function worldVehicleIds(world: MutableWorld): readonly string[] {
  return Object.freeze(world.vehicles.map((vehicle) => vehicle.entityId).sort());
}

function segmentsTarget(): WalkingSegmentsTarget {
  return Object.freeze({
    sessionId: ARCHIVE_SESSION_ID,
    worldEpoch: ARCHIVE_WORLD_EPOCH,
    playerId: ARCHIVE_PLAYER_ID,
    profileId: ARCHIVE_PROFILE_ID,
    baseVersionId: ARCHIVE_VERSION_ID,
    learningEpoch: 4,
    learningEligible: false,
  });
}

/**
 * A player who has been walking on the real authored sidewalk for `tick` ticks: the real 192 walker
 * advanced by the real 193 character command, the real 194 camera following it, the real 198 model
 * counting the real walking distance, and the 197 body holding exactly the walker position.
 */
export function walkingFixture(
  world: MutableWorld,
  options: { readonly tick?: number } = {},
): WalkingCharacterFixture {
  const tick = options.tick ?? WALKING_SAVE_TICK;
  const { world: walkWorld } = realWalkWorld();
  const spot = realCurbSpot();
  const walker = createWalker({
    world: walkWorld,
    start: { positionM: spot.inside, yawRad: spot.alongYawRad },
    entityId: WALKING_SAVE_CHARACTER_ID,
  });
  const arbiter = createInputAuthorityArbiter({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: ARCHIVE_SESSION_ID,
      worldEpoch: ARCHIVE_WORLD_EPOCH,
    }),
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: WALKING_SAVE_CHARACTER_ID,
    }),
  });
  const camera = createCharacterCamera({ world: cityCameraWorld(), control: cameraControl() });
  const obstacles = cityCameraObstacles();
  const segments = createWalkingSegments({
    ownerId: ARCHIVE_PLAYER_ID,
    characterId: WALKING_SAVE_CHARACTER_ID,
    target: segmentsTarget(),
  });
  for (let index = 0; index < tick; index += 1) {
    walkingTick({ walker, arbiter, camera, segments, obstacles });
  }
  const fleet = createFleetSwitchState({
    tick,
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: WALKING_SAVE_CHARACTER_ID,
    }),
    character: Object.freeze({
      entityId: walker.entityId,
      positionM: walker.state.positionM,
      yawRad: walker.state.yawRad,
    }),
  });
  return Object.freeze({
    characterId: WALKING_SAVE_CHARACTER_ID,
    walker,
    camera,
    arbiter,
    segments,
    fleet,
    vehicleIds: worldVehicleIds(world),
    tick,
    cameraSnapshot: () => camera.snapshot(),
    segmentsState: () => segments.snapshot(),
    world: walkWorld,
  });
}

/**
 * A player who took the taxi at tick `tick`: the real 197 TAKE of a real taxi, the real 193 authority
 * switched to the car, the real 194 camera mid-transition onto it and the real 198 model with one
 * open MANUAL segment.
 */
export function seatedFixture(
  world: MutableWorld,
  options: { readonly tick?: number; readonly vehicleId?: string } = {},
): WalkingCharacterFixture {
  const tick = options.tick ?? WALKING_SAVE_TICK;
  const vehicleId = options.vehicleId ?? 'vehicle:taxi-197';
  const fixture = nearFixture(vehicleId);
  const take = decideFleetTake(takeRequest(fixture, stateOf(fixture, 0), vehicleId, tick));
  if (!take.accepted) throw new Error(`200 fixture TAKE refused: ${take.code}`);
  const walker = createWalker({
    world: fixture.walkWorld,
    start: { positionM: fixture.character.positionM, yawRad: fixture.character.yawRad },
    entityId: fixture.character.entityId,
  });
  const arbiter = createInputAuthorityArbiter({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: ARCHIVE_SESSION_ID,
      worldEpoch: ARCHIVE_WORLD_EPOCH,
    }),
    authority: Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: fixture.character.entityId,
    }),
  });
  const camera = createCharacterCamera({ world: cityCameraWorld(), control: cameraControl() });
  const obstacles = cityCameraObstacles();
  const segments = createWalkingSegments({
    ownerId: ARCHIVE_PLAYER_ID,
    characterId: fixture.character.entityId,
    target: segmentsTarget(),
  });
  const onFoot = characterTarget(
    fixture.character.entityId,
    fixture.character.positionM,
    fixture.character.yawRad,
  );
  for (let tickNow = 1; tickNow < tick; tickNow += 1) {
    arbiter.step({ tick: tickNow, characterYawRad: walker.state.yawRad });
    camera.step({
      tick: tickNow,
      authorityEntityId: fixture.character.entityId,
      targets: [onFoot],
      obstacles,
    });
    segments.step({
      tick: tickNow,
      transition: 'WALK',
      authority: Object.freeze({
        consumer: 'CHARACTER' as const,
        characterId: fixture.character.entityId,
      }),
      distanceM: 0,
    });
  }
  const taxi = fixture.vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);
  if (taxi === undefined) throw new Error(`200 fixture has no ${vehicleId}`);
  arbiter.setAuthority(take.authority);
  arbiter.step({ tick, characterYawRad: walker.state.yawRad });
  camera.step({
    tick,
    authorityEntityId: vehicleId,
    targets: [onFoot, vehicleTarget(vehicleId, taxi.positionM, taxi.yawRad)],
    obstacles,
  });
  segments.step({
    tick,
    transition: 'ENTER',
    authority: take.authority,
    previousAuthority: take.previousAuthority,
    vehicleId,
    mode: 'MANUAL',
    maneuverState: null,
  });
  return Object.freeze({
    characterId: fixture.character.entityId,
    walker,
    camera,
    arbiter,
    segments,
    fleet: take.state,
    vehicleIds: Object.freeze([...new Set([...worldVehicleIds(world), vehicleId])].sort()),
    tick,
    cameraSnapshot: () => camera.snapshot(),
    segmentsState: () => segments.snapshot(),
    world: fixture.walkWorld,
  });
}

interface WalkTickParts {
  readonly walker: Walker;
  readonly arbiter: InputAuthorityArbiter;
  readonly camera: ReturnType<typeof createCharacterCamera>;
  readonly segments: WalkingSegments;
  readonly obstacles: ReturnType<typeof cityCameraObstacles>;
}

function walkingTick(parts: WalkTickParts): void {
  const { walker, arbiter, camera, segments, obstacles } = parts;
  const tick = arbiter.snapshot().tick + 1;
  arbiter.setAction('throttle', true);
  const command = arbiter.step({ tick, characterYawRad: walker.state.yawRad });
  if (command.command.consumer !== 'CHARACTER') throw new Error('expected a CHARACTER command');
  const before = walker.state.positionM;
  const stepped = walker.step({ tick: walker.state.tick + 1, input: command.command.input });
  const distanceM = Math.hypot(
    stepped.state.positionM.x - before.x,
    stepped.state.positionM.z - before.z,
  );
  camera.step({
    tick,
    authorityEntityId: walker.entityId,
    targets: [characterTarget(walker.entityId, stepped.state.positionM, stepped.state.yawRad)],
    obstacles,
  });
  segments.step({
    tick,
    transition: 'WALK',
    authority: Object.freeze({ consumer: 'CHARACTER' as const, characterId: walker.entityId }),
    distanceM,
  });
}

/** The character slot of a fixture, captured through the real builder. */
export function slotOf(fixture: WalkingCharacterFixture): WalkingSaveCharacterState {
  return walkingCharacterSnapshot({
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    worldEpoch: ARCHIVE_WORLD_EPOCH,
    tick: fixture.tick,
    character: {
      entityId: fixture.walker.entityId,
      tick: fixture.walker.state.tick,
      positionM: fixture.walker.state.positionM,
      yawRad: fixture.walker.state.yawRad,
    },
    authority: fixture.arbiter.snapshot(),
    camera: fixture.cameraSnapshot(),
    segments: fixture.segmentsState(),
    fleet: fixture.fleet,
    vehicleIds: fixture.vehicleIds,
  });
}

/** The real position of the authored walk spawn, used by the migration-default test. */
export function authoredSpawn(): Readonly<{ positionM: CharacterPoint; yawRad: number }> {
  const spot = realCurbSpot();
  return Object.freeze({ positionM: spot.inside, yawRad: spot.alongYawRad });
}

/** Stores the real 215 economy bundle of the harness session. */
export async function saveWalkingEconomy(
  harness: WalkingArchiveHarness,
): Promise<ReturnType<typeof createEconomyComponents>> {
  const components = createEconomyComponents();
  const saved = await harness.economy.save({
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    worldEpoch: ARCHIVE_WORLD_EPOCH,
    createdAt: ARCHIVE_CREATED_AT,
    daily: components.daily,
    economy: components.economy,
    player: components.player,
  });
  if (saved.status === 'REJECTED') {
    throw new Error(`200 fixture economy refused: ${saved.rejection.code}`);
  }
  return components;
}

/** Exports the version 1 (135) archive of the harness session. */
export async function exportLegacyArchive(harness: WalkingArchiveHarness) {
  const exported = await harness.archive.export({
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    createdAt: ARCHIVE_CREATED_AT,
  });
  if (exported.status === 'REJECTED') {
    throw new Error(`200 fixture legacy archive refused: ${exported.rejection.code}`);
  }
  return exported;
}

/** Exports the version 2 archive of the harness session. */
export async function exportWalkingArchive(harness: WalkingArchiveHarness) {
  const exported = await harness.economyArchive.export({
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    createdAt: ARCHIVE_CREATED_AT,
    catalog: harness.catalog,
  });
  if (exported.status === 'REJECTED') {
    throw new Error(`200 fixture archive refused: ${exported.rejection.code}`);
  }
  return exported;
}
