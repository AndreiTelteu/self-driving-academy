import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WALKING_CHARACTER_VERSION,
  WALKING_SAVE_FORMAT_VERSION,
  WALKING_SAVE_LAUNCH,
  WalkingSaveError,
  canonicalizeJson,
  readWalkingCharacterState,
  readWalkingSave,
  restoreWalkingSave,
  sha256Hex,
  stampWalkingSaveChecksum,
  upgradeWalkingSave,
  walkingCharacterSnapshot,
  walkingSaveDigest,
  walkingSaveReload,
} from '../../src/persistence/index';
import type { WalkingSaveDocument } from '../../src/persistence/index';
import { ARCHIVE_PLAYER_ID, ARCHIVE_SESSION_ID } from './session-archive-fixture';
import {
  authoredSpawn,
  createWalkingArchive,
  exportLegacyArchive,
  exportWalkingArchive,
  saveWalkingEconomy,
  seatedFixture,
  slotOf,
  walkingFixture,
} from './walking-save-fixture';
import { realBuildingSpot, realWalkWorld } from '../character/walk-world';

/**
 * 200: the character slot, the version 3 envelope and the migration of older sessions.
 *
 * The tests use the real 135/215 archive stores, the real 192 walker, the real 193 arbiter, the real
 * 194 camera, the real 197 takeover and the real 198 segment model. A refused document is compared
 * before and after the call, so "nothing was migrated and nothing was written" is measured, not
 * assumed.
 */
const TICK = 40;
const createdAt = '2026-11-15T00:00:00.000Z';

const harnessPromise = createWalkingArchive({ tick: TICK, dbName: '200-walking-save-tests' });

async function sourceArchives(): Promise<{ v1: unknown; v2: unknown }> {
  const harness = await harnessPromise;
  const v1 = (await exportLegacyArchive(harness)).document;
  await saveWalkingEconomy(harness);
  const v2 = (await exportWalkingArchive(harness)).document;
  return { v1, v2 };
}

const sourcesPromise = sourceArchives();

function digest(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: 40 });
  if (canonical.status === 'REJECTED') throw new Error(canonical.rejection.message);
  return sha256Hex(canonical.text);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const MIGRATION = {
  createdAt,
  expect: { sessionId: ARCHIVE_SESSION_ID, playerId: ARCHIVE_PLAYER_ID },
};

async function migratedWalking(): Promise<WalkingSaveDocument> {
  const harness = await harnessPromise;
  const { v2 } = await sourcesPromise;
  const slot = slotOf(walkingFixture(harness.world, { tick: TICK }));
  const migration = upgradeWalkingSave(v2, {
    ...MIGRATION,
    catalog: harness.catalog,
    character: slot,
  });
  assert.equal(migration.status, 'ACCEPTED', JSON.stringify(migration));
  return migration.document;
}

test('200 a real V2 archive migrates to V3 with the session and economy slots byte-identical', async () => {
  const harness = await harnessPromise;
  const { v2 } = await sourcesPromise;
  const slot = slotOf(walkingFixture(harness.world, { tick: TICK }));
  const before = {
    session: digest((v2 as { components: { session: unknown } }).components.session),
    economy: digest((v2 as { components: { economy: unknown } }).components.economy),
  };
  const migration = upgradeWalkingSave(JSON.stringify(v2), {
    ...MIGRATION,
    catalog: harness.catalog,
    character: slot,
  });
  assert.equal(migration.status, 'ACCEPTED', JSON.stringify(migration));
  if (migration.status !== 'ACCEPTED') return;
  const document = migration.document;
  assert.equal(document.formatVersion, WALKING_SAVE_FORMAT_VERSION);
  assert.equal(document.schemaVersion, 3);
  assert.match(document.checksum.value, /^[0-9a-f]{64}$/);
  // Bit identity: the very same canonical bytes for the two delivered slots.
  assert.equal(digest(document.components.session), before.session);
  assert.equal(digest(document.components.economy), before.economy);
  assert.deepEqual(document.components.character, slot);
  // The economy counters are the delivered ones: 100,5 XP, level 2, one daily reward, 3 settlements.
  assert.equal(migration.counts.xpBalance, 100.5);
  assert.equal(migration.counts.xpBalanceMicroXp, 100_500_000);
  assert.equal(migration.counts.level, 2);
  assert.equal(migration.counts.dailyRewards, 1);
  assert.equal(migration.counts.settlements, 3);
});

test('200 the migrated document round-trips through JSON and its sizes match the measurement', async () => {
  const harness = await harnessPromise;
  const document = await migratedWalking();
  const read = readWalkingSave(JSON.stringify(document), {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds: document.components.character.vehicleIds,
  });
  assert.equal(read.status, 'ACCEPTED', JSON.stringify(read));
  if (read.status !== 'ACCEPTED') return;
  assert.deepEqual(read.sizes, document.sizes);
  assert.equal(read.checksumVerified, true);
  assert.equal(walkingSaveDigest(read.document), walkingSaveDigest(document));
});

test('200 a session without a character slot receives the documented default state', async () => {
  const harness = await harnessPromise;
  const { v2 } = await sourcesPromise;
  const migration = upgradeWalkingSave(v2, {
    ...MIGRATION,
    catalog: harness.catalog,
    spawn: authoredSpawn(),
    walkWorld: realWalkWorld().world,
    characterId: 'character:player-1',
  });
  assert.equal(migration.status, 'ACCEPTED', JSON.stringify(migration));
  if (migration.status !== 'ACCEPTED') return;
  const character = migration.document.components.character;
  assert.equal(character.source, 'MIGRATION_DEFAULT');
  assert.equal(character.version, WALKING_CHARACTER_VERSION);
  assert.deepEqual(character.authority.authority, {
    consumer: 'CHARACTER',
    characterId: 'character:player-1',
  });
  assert.equal(character.camera.entityId, 'character:player-1');
  assert.equal(character.camera.tick, character.tick);
  assert.equal(character.camera.positionM, null);
  assert.equal(character.segments.open, null);
  assert.equal(character.segments.counters.walkingTicks, 0);
  assert.equal(character.segments.counters.closedSegments, 0);
  assert.equal(character.fleet.character.entityId, 'character:player-1');
  assert.equal(character.fleet.suspended, null);
  // The spawn is the authored sidewalk point, copied bit for bit.
  const spawn = authoredSpawn();
  assert.deepEqual(character.fleet.character.positionM, spawn.positionM);
  assert.equal(character.fleet.character.yawRad, spawn.yawRad);
  // The vehicles come from the real 206 checkpoint of the session.
  assert.equal(character.vehicleIds.length, harness.world.vehicles.length);
  assert.deepEqual(
    character.vehicleIds,
    harness.world.vehicles.map((vehicle) => vehicle.entityId).sort(),
  );
  // The segment target is the session's own profile generation.
  assert.equal(character.segments.target.profileId, 'profile-1');
  assert.equal(character.segments.target.baseVersionId, 'profile-1@2');
  assert.equal(character.segments.target.learningEligible, false);
});

test('200 a blocked spawn is refused instead of writing a character inside a wall', async () => {
  const harness = await harnessPromise;
  const { v2 } = await sourcesPromise;
  const building = realBuildingSpot();
  const migration = upgradeWalkingSave(v2, {
    ...MIGRATION,
    catalog: harness.catalog,
    // One metre inside the first authored building: the real 192 walker refuses this point.
    spawn: {
      positionM: { x: building.faceX, y: building.start.y, z: building.faceZ + 1 },
      yawRad: 0,
    },
    walkWorld: realWalkWorld().world,
    characterId: 'character:player-1',
  });
  assert.equal(migration.status, 'REJECTED');
  if (migration.status !== 'REJECTED') return;
  assert.equal(migration.rejection.code, 'SPAWN_BLOCKED');
});

test('200 reload while walking starts paused with a coherent authority and camera and no duplicates', async () => {
  const harness = await harnessPromise;
  const fixture = walkingFixture(harness.world, { tick: TICK });
  const document = await migratedWalking();
  const restored = restoreWalkingSave(JSON.stringify(document), {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds: fixture.vehicleIds,
  });
  assert.equal(restored.status, 'ACCEPTED', JSON.stringify(restored));
  if (restored.status !== 'ACCEPTED') return;
  const reload = restored.reload;
  assert.deepEqual(reload.launch, WALKING_SAVE_LAUNCH);
  assert.equal(reload.launch.mode, 'PAUSED_AUTO');
  assert.equal(reload.launch.paused, true);
  assert.equal(reload.launch.inputReleased, true);
  assert.deepEqual(reload.authority, { consumer: 'CHARACTER', characterId: 'character:player-1' });
  assert.equal(reload.cameraEntityId, 'character:player-1');
  assert.equal(reload.entities.characters, 1);
  assert.equal(reload.entities.vehicles, fixture.vehicleIds.length);
  assert.equal(reload.entities.total, fixture.vehicleIds.length + 1);
  assert.equal(reload.entities.created, 0);
  assert.equal(reload.body.entityId, 'character:player-1');
  assert.equal(reload.counts.xpBalance, 100.5);
  assert.equal(reload.counts.dailyRewards, 1);
  assert.equal(reload.counts.settlements, 3);
  // The throttle held while saving is neutralised by 193's own restore rule.
  assert.equal(reload.neutralizedKeys, 1);
  assert.equal(reload.launch.heldKeysActive, 0);
  // A second reload of the same bytes credits nothing twice.
  const again = restoreWalkingSave(JSON.stringify(document), {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds: fixture.vehicleIds,
  });
  assert.equal(again.status, 'ACCEPTED');
  if (again.status !== 'ACCEPTED') return;
  assert.deepEqual(again.reload.counts, reload.counts);
  assert.equal(walkingSaveDigest(again.validation.document), walkingSaveDigest(document));
});

test('200 reload inside the taxi keeps the car authority, the camera transition and the open segment', async () => {
  const harness = await harnessPromise;
  const fixture = seatedFixture(harness.world, { tick: TICK });
  const { v2 } = await sourcesPromise;
  const migration = upgradeWalkingSave(v2, {
    ...MIGRATION,
    catalog: harness.catalog,
    character: slotOf(fixture),
  });
  assert.equal(migration.status, 'ACCEPTED', JSON.stringify(migration));
  if (migration.status !== 'ACCEPTED') return;
  const document = migration.document;
  const read = readWalkingSave(JSON.stringify(document), {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds: fixture.vehicleIds,
  });
  assert.equal(read.status, 'ACCEPTED', JSON.stringify(read));
  if (read.status !== 'ACCEPTED') return;
  const reload = walkingSaveReload(read, { vehicleIds: fixture.vehicleIds });
  assert.deepEqual(reload.authority, {
    consumer: 'VEHICLE',
    vehicleId: 'vehicle:taxi-197',
  });
  assert.equal(reload.cameraEntityId, 'vehicle:taxi-197');
  assert.equal(reload.segments.openKind, 'MANUAL');
  assert.equal(reload.segments.openSegmentId, 'player:130:segment:1');
  assert.notEqual(reload.suspendedBodyM, null);
  assert.equal(reload.launch.paused, true);
  // The camera was saved mid-transition: 17 of the 18 ticks remain, exactly as 194 wrote them.
  assert.equal(read.character.camera.transition?.remainingTicks, 17);
  assert.equal(read.character.camera.transition?.toEntityId, 'vehicle:taxi-197');
  // The suspended body is the same body, bit for bit.
  assert.deepEqual(reload.suspendedBodyM, read.character.fleet.character.positionM);
});

test('200 reload refuses a live vehicle set that differs from the saved one', async () => {
  const harness = await harnessPromise;
  const document = await migratedWalking();
  const vehicleIds = document.components.character.vehicleIds;
  const read = readWalkingSave(JSON.stringify(document), {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds,
  });
  assert.equal(read.status, 'ACCEPTED');
  if (read.status !== 'ACCEPTED') return;
  assert.throws(
    () => walkingSaveReload(read, { vehicleIds: [...vehicleIds, 'vehicle:extra'] }),
    (error: unknown) => error instanceof WalkingSaveError && error.code === 'ENTITY_SET_MISMATCH',
  );
});

test('200 integrity is fail-closed: checksum, slot, version, JSON and nested components', async () => {
  const harness = await harnessPromise;
  const document = await migratedWalking();
  const expect = {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds: document.components.character.vehicleIds,
  };
  const cases: readonly {
    readonly name: string;
    readonly input: unknown;
    readonly code: string;
  }[] = [
    {
      name: 'checksum',
      input: {
        ...clone(document),
        checksum: { ...document.checksum, value: `${'0'.repeat(63)}1` },
      },
      code: 'CHECKSUM_MISMATCH',
    },
    {
      name: 'missing slot',
      input: stampWalkingSaveChecksum(
        (() => {
          const draft = clone(document) as unknown as {
            components: Record<string, unknown>;
          };
          delete draft.components.character;
          return draft as unknown as WalkingSaveDocument;
        })(),
      ),
      code: 'MISSING_FIELD',
    },
    {
      name: 'future format',
      input: stampWalkingSaveChecksum({
        ...clone(document),
        formatVersion: 4,
      } as unknown as WalkingSaveDocument),
      code: 'FORMAT_VERSION_TOO_NEW',
    },
    {
      name: 'broken JSON',
      input: JSON.stringify(document).slice(0, 80),
      code: 'PARSE_ERROR',
    },
    {
      name: 'duplicate key',
      input: JSON.stringify(document).replace('{', '{"format":"x","format":"y",'),
      code: 'DUPLICATE_KEY',
    },
    {
      name: 'legacy archive',
      input: JSON.stringify((await sourcesPromise).v2),
      code: 'LEGACY_WALKING_SAVE',
    },
  ];
  for (const entry of cases) {
    const before = digest(entry.input);
    const result = readWalkingSave(entry.input, expect);
    assert.equal(result.status, 'REJECTED', `${entry.name} must be refused`);
    if (result.status !== 'REJECTED') continue;
    assert.equal(result.rejection.code, entry.code, entry.name);
    assert.equal(digest(entry.input), before, `${entry.name} must not modify the input`);
  }
  // A re-stamped nested XP change is refused by the 215/213 owner, not by this envelope.
  const tampered = clone(document) as unknown as {
    components: { economy: { components: { player: { accountedThroughMs: number } } } };
  };
  tampered.components.economy.components.player.accountedThroughMs += 1;
  const reStamped = stampWalkingSaveChecksum(tampered as unknown as WalkingSaveDocument);
  const read = readWalkingSave(reStamped, expect);
  assert.equal(read.status, 'REJECTED');
  if (read.status === 'REJECTED') assert.equal(read.rejection.code, 'CHECKSUM_MISMATCH');
});

test('200 the character slot refuses an inconsistent camera, authority or tick', async () => {
  const document = await migratedWalking();
  const character = document.components.character;
  const expect = {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    worldEpoch: document.session.worldEpoch,
  };
  const cameraOff = {
    ...clone(character),
    camera: { ...clone(character.camera), entityId: 'vehicle:other' },
  };
  assert.throws(
    () => readWalkingCharacterState(cameraOff, expect),
    (error: unknown) => error instanceof WalkingSaveError && error.code === 'CHARACTER_INVALID',
  );
  const authorityOff = {
    ...clone(character),
    fleet: clone(character.fleet),
    authority: { ...clone(character.authority), tick: character.tick + 1 },
  };
  assert.throws(
    () => readWalkingCharacterState(authorityOff, expect),
    (error: unknown) => error instanceof WalkingSaveError && error.code === 'TICK_MISMATCH',
  );
  const fleetOff = clone(character) as unknown as {
    fleet: { authority: Record<string, unknown> };
  };
  fleetOff.fleet.authority = { consumer: 'CHARACTER', characterId: 'character:other' };
  assert.throws(
    () => readWalkingCharacterState(fleetOff, expect),
    (error: unknown) => error instanceof WalkingSaveError && error.code === 'AUTHORITY_MISMATCH',
  );
  const versionOff = { ...clone(character), version: '200-walking-character-v9' };
  assert.throws(
    () => readWalkingCharacterState(versionOff, expect),
    (error: unknown) => error instanceof WalkingSaveError && error.code === 'CHARACTER_INVALID',
  );
  assert.throws(
    () => readWalkingCharacterState(character, { ...expect, sessionId: 'session-other' }),
    (error: unknown) => error instanceof WalkingSaveError && error.code === 'SESSION_MISMATCH',
  );
});

test('200 the character builder refuses a walker and a fleet body that disagree', async () => {
  const harness = await harnessPromise;
  const fixture = walkingFixture(harness.world, { tick: TICK });
  assert.throws(
    () =>
      walkingCharacterSnapshot({
        sessionId: ARCHIVE_SESSION_ID,
        playerId: ARCHIVE_PLAYER_ID,
        worldEpoch: 1,
        tick: fixture.tick,
        character: {
          entityId: fixture.walker.entityId,
          tick: fixture.walker.state.tick,
          positionM: { ...fixture.walker.state.positionM, x: fixture.walker.state.positionM.x + 1 },
          yawRad: fixture.walker.state.yawRad,
        },
        authority: fixture.arbiter.snapshot(),
        camera: fixture.cameraSnapshot(),
        segments: fixture.segmentsState(),
        fleet: fixture.fleet,
        vehicleIds: fixture.vehicleIds,
      }),
    (error: unknown) => error instanceof WalkingSaveError && error.code === 'BODY_MISMATCH',
  );
});

test('200 a version 1 archive becomes version 3 and keeps the 135 document untouched', async () => {
  const harness = await harnessPromise;
  const { v1 } = await sourcesPromise;
  const before = digest(v1);
  const migration = upgradeWalkingSave(v1, {
    ...MIGRATION,
    catalog: harness.catalog,
    spawn: authoredSpawn(),
    walkWorld: realWalkWorld().world,
    characterId: 'character:player-1',
  });
  assert.equal(migration.status, 'ACCEPTED', JSON.stringify(migration));
  if (migration.status !== 'ACCEPTED') return;
  assert.equal(digest(migration.document.components.session), before);
  assert.equal(migration.document.components.economy, null);
  const read = readWalkingSave(migration.document, {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
  });
  assert.equal(read.status, 'ACCEPTED');
  if (read.status !== 'ACCEPTED') return;
  assert.equal(read.counts.xpBalance, 0);
  assert.equal(read.counts.settlements, 0);
});

test('200 a version 3 archive is refused as already current', async () => {
  const harness = await harnessPromise;
  const document = await migratedWalking();
  const result = upgradeWalkingSave(document, { ...MIGRATION, catalog: harness.catalog });
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') assert.equal(result.rejection.code, 'ALREADY_CURRENT');
});

test('200 the migration is deterministic and does not write anything', async () => {
  const harness = await harnessPromise;
  const { v2 } = await sourcesPromise;
  const slot = slotOf(walkingFixture(harness.world, { tick: TICK }));
  const before = digest(v2);
  const first = upgradeWalkingSave(v2, { ...MIGRATION, catalog: harness.catalog, character: slot });
  const second = upgradeWalkingSave(v2, {
    ...MIGRATION,
    catalog: harness.catalog,
    character: slot,
  });
  assert.equal(first.status, 'ACCEPTED');
  assert.equal(second.status, 'ACCEPTED');
  if (first.status !== 'ACCEPTED' || second.status !== 'ACCEPTED') return;
  assert.equal(first.checksum, second.checksum);
  assert.equal(walkingSaveDigest(first.document), walkingSaveDigest(second.document));
  // The source document is untouched, and the real store still exports the same bytes.
  assert.equal(digest(v2), before);
  const reExported = await exportWalkingArchive(harness);
  assert.equal(digest(reExported.document), before);
});
