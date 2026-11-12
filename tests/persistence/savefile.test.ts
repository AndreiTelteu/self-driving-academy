import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAVEFILE_LIMITS,
  PersistenceError,
  buildSaveFile,
  canonicalizeJson,
  createLocalRepository,
  createSaveFileJob,
  createSaveFileStore,
  exportSaveFile,
  loadEconomySave,
  migrateSessionArchiveToSaveFile,
  readSaveFile,
  saveFileView,
  saveFileName,
  stampSaveFileChecksum,
} from '../../src/persistence/index';
import type {
  SaveFileAccepted,
  SaveFileBuildResult,
  SaveFileDocument,
  SaveFileImportResult,
  SaveFilePreview,
  TransactionPort,
} from '../../src/persistence/index';
import {
  ACADEMY_SPEC,
  CHAOS_SPEC,
  SAVEFILE_CREATED_AT,
  createSaveFileSessions,
  createSaveFileTarget,
  targetFingerprint,
} from './savefile-fixture';
import type { SaveFileSessions } from './savefile-fixture';
import { ARCHIVE_VERSIONS } from './session-archive-fixture';
import { fixedClock } from './fixtures';

/* --------------------------------------------------------------------- helpers */

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

let sessionsPromise: Promise<SaveFileSessions> | null = null;

function sessions(): Promise<SaveFileSessions> {
  sessionsPromise ??= createSaveFileSessions();
  return sessionsPromise;
}

function accepted(result: SaveFileBuildResult): SaveFileAccepted {
  if (result.status !== 'ACCEPTED') {
    assert.fail(
      `Expected an accepted savefile, got ${result.rejection.code}: ${result.rejection.message}`,
    );
  }
  return result;
}

function catalogOf(context: SaveFileSessions) {
  return context.academy.harness.catalog;
}

async function buildFixture(
  overrides: {
    readonly sessions?: Partial<Record<'ACADEMY' | 'CHAOS', unknown | null>>;
    readonly decor?: Partial<Record<'ACADEMY' | 'CHAOS', unknown | null>>;
    readonly activeSession?: 'ACADEMY' | 'CHAOS';
    readonly replays?: readonly unknown[];
  } = {},
): Promise<{ readonly context: SaveFileSessions; readonly built: SaveFileAccepted }> {
  const context = await sessions();
  const built = accepted(
    buildSaveFile({
      createdAt: SAVEFILE_CREATED_AT,
      activeSession: overrides.activeSession ?? 'ACADEMY',
      versions: ARCHIVE_VERSIONS,
      catalog: catalogOf(context),
      sessions: overrides.sessions ?? {
        ACADEMY: context.academy.archive.document,
        CHAOS: context.chaos.archive.document,
      },
      decor: overrides.decor ?? {
        ACADEMY: context.academy.decor,
        CHAOS: context.chaos.decor,
      },
      replays: overrides.replays ?? [
        { replayId: 'replay:234', encoding: 'base64', data: 'U0RBLTIzNA==', bytes: 7 },
      ],
    }),
  );
  return { context, built };
}

function cloneOf(document: SaveFileDocument): Mutable<SaveFileDocument> {
  return structuredClone(document) as Mutable<SaveFileDocument>;
}

function codeOf(result: ReturnType<typeof readSaveFile>): string {
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') return result.rejection.code;
  return 'ACCEPTED';
}

function importCode(result: SaveFileImportResult): string {
  return result.status === 'REJECTED' ? result.rejection.code : result.status;
}

function previewAccepted(result: SaveFilePreview) {
  if (result.status !== 'ACCEPTED') {
    assert.fail(`Expected an accepted preview, got ${result.rejection.code}`);
  }
  return result;
}

/* ---------------------------------------------------------------- format rules */

test('234 a complete savefile carries both sessions, decor, replays and a real checksum', async () => {
  const { context, built } = await buildFixture();
  const document = built.document;
  assert.equal(document.format, 'self-driving-academy-save');
  assert.equal(document.formatVersion, 1);
  assert.equal(document.integrityVersion, 1);
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.checksum.algorithm, 'SHA-256');
  assert.equal(document.checksum.canonicalization, 'SDA-CJSON-1');
  assert.match(document.checksum.value, /^[0-9a-f]{64}$/);
  assert.equal(document.payload.versions.schema, '234-savefile-schema-1');
  assert.notEqual(document.payload.sessions.ACADEMY, null);
  assert.notEqual(document.payload.sessions.CHAOS, null);
  assert.notEqual(document.payload.decor.ACADEMY, null);
  assert.notEqual(document.payload.decor.CHAOS, null);
  assert.equal(document.payload.optional.replays.length, 1);
  assert.equal(built.summary.sessionsPresent, 2);
  assert.equal(built.summary.sessions.ACADEMY?.xp, 100.5);
  assert.equal(built.summary.sessions.ACADEMY?.xpMicroXp, 100_500_000);
  assert.equal(built.summary.sessions.ACADEMY?.level, 2);
  assert.equal(built.summary.sessions.ACADEMY?.dailyRewards, 1);
  assert.equal(built.summary.sessions.ACADEMY?.checkpointTick, ACADEMY_SPEC.tick);
  assert.equal(built.summary.sessions.CHAOS?.checkpointTick, CHAOS_SPEC.tick);
  assert.equal(built.summary.sessions.ACADEMY?.decorObjects, context.academy.decor.objects.length);
  assert.equal(built.summary.totalXp, 201);
  assert.equal(built.summary.replays.bytes, 7);
  assert.ok(built.sizes.sessions.ACADEMY > 0 && built.sizes.sessions.ACADEMY <= built.sizes.limit);
  assert.equal(
    saveFileName(SAVEFILE_CREATED_AT),
    'self-driving-academy-20261022T090000000Z.sdasave',
  );

  const read = readSaveFile(JSON.stringify(built.document), { catalog: catalogOf(context) });
  assert.equal(read.status, 'ACCEPTED');
  if (read.status !== 'ACCEPTED') return;
  assert.equal(read.checksumVerified, true);
  assert.equal(read.summary.checksum, built.checksum);
  assert.deepEqual(read.sessions.ACADEMY?.session, {
    sessionId: ACADEMY_SPEC.sessionId,
    playerId: ACADEMY_SPEC.playerId,
    worldEpoch: ACADEMY_SPEC.worldEpoch,
  });
  assert.deepEqual(read.sessions.CHAOS?.session, {
    sessionId: CHAOS_SPEC.sessionId,
    playerId: CHAOS_SPEC.playerId,
    worldEpoch: CHAOS_SPEC.worldEpoch,
  });
  assert.equal(read.replays[0]?.encoding, 'base64');
});

test('234 SDA-CJSON-1 vectors cover unicode, numbers, key order, arrays and -0', () => {
  const vector = canonicalizeJson({
    z: 1,
    '😀': true,
    é: 'Ștefan',
    n: 0.1,
    a: [3, -0, 2],
    e: 'ăâîșț',
  });
  assert.equal(vector.status, 'ACCEPTED');
  if (vector.status !== 'ACCEPTED') return;
  assert.equal(vector.text, '{"a":[3,0,2],"e":"ăâîșț","n":0.1,"z":1,"é":"Ștefan","😀":true}');
  const duplicate = canonicalizeJson({ a: 1, b: [2, { c: null }] });
  assert.equal(duplicate.status, 'ACCEPTED');
  if (duplicate.status !== 'ACCEPTED') return;
  assert.equal(duplicate.text, '{"a":1,"b":[2,{"c":null}]}');
  assert.equal(canonicalizeJson({ value: Number.POSITIVE_INFINITY }).status, 'REJECTED');
});

test('234 whitespace and key order do not change the verified checksum', async () => {
  const { context, built } = await buildFixture();
  const reordered = {
    checksum: built.document.checksum,
    payload: built.document.payload,
    createdAt: built.document.createdAt,
    schemaVersion: built.document.schemaVersion,
    integrityVersion: built.document.integrityVersion,
    formatVersion: built.document.formatVersion,
    format: built.document.format,
  };
  const result = readSaveFile(JSON.stringify(reordered, null, 2), {
    catalog: catalogOf(context),
  });
  assert.equal(result.status, 'ACCEPTED');
  if (result.status !== 'ACCEPTED') return;
  assert.equal(result.summary.checksum, built.checksum);
});

test('234 an edit without a new checksum is refused', async () => {
  const { context, built } = await buildFixture();
  const clone = cloneOf(built.document);
  clone.payload.activeSession = 'CHAOS';
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(clone), { catalog: catalogOf(context) })),
    'CHECKSUM_MISMATCH',
  );

  const xpEdit = cloneOf(built.document);
  const chaos = xpEdit.payload.sessions.CHAOS;
  assert.notEqual(chaos, null);
  if (chaos === null || chaos.formatVersion !== 2) assert.fail('Expected the 215 CHAOS slot');
  const economy = chaos.components.economy;
  assert.notEqual(economy, null);
  if (economy === null) return;
  const player = economy.components.player;
  assert.notEqual(player, null);
  if (player === null) return;
  player.entries[0]!.amountMicroXp += 1_000_000;
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(xpEdit), { catalog: catalogOf(context) })),
    'CHECKSUM_MISMATCH',
  );
});

test('234 duplicate keys are refused before hashing', async () => {
  const { context, built } = await buildFixture();
  const text = JSON.stringify(built.document);
  const duplicated = text.replace('{', '{"format":"self-driving-academy-save",');
  assert.equal(codeOf(readSaveFile(duplicated, { catalog: catalogOf(context) })), 'DUPLICATE_KEY');
});

test('234 checksum verification precedes the schema gate', async () => {
  const { context, built } = await buildFixture();
  const newer = cloneOf(built.document);
  newer.schemaVersion = 2 as never;
  const restamped = stampSaveFileChecksum(newer);
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(restamped), { catalog: catalogOf(context) })),
    'SCHEMA_TOO_NEW',
  );
  const corrupt = cloneOf(built.document);
  corrupt.schemaVersion = 2 as never;
  corrupt.checksum.value = '0'.repeat(64);
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(corrupt), { catalog: catalogOf(context) })),
    'CHECKSUM_MISMATCH',
  );
  const invalidSchema = cloneOf(built.document);
  invalidSchema.payload.versions.schema = '999-savefile-schema';
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(invalidSchema)), {
        catalog: catalogOf(context),
      }),
    ),
    'UNSUPPORTED_SCHEMA',
  );
});

test('234 missing or unknown integrity is a closed refusal', async () => {
  const { context, built } = await buildFixture();
  const missing = cloneOf(built.document) as unknown as Record<string, unknown>;
  delete missing.checksum;
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(missing), { catalog: catalogOf(context) })),
    'MISSING_FIELD',
  );
  const algorithm = cloneOf(built.document);
  algorithm.checksum.algorithm = 'SHA-1' as never;
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(algorithm), { catalog: catalogOf(context) })),
    'UNSUPPORTED_ALGORITHM',
  );
  const canonicalization = cloneOf(built.document);
  canonicalization.checksum.canonicalization = 'SDA-CJSON-0' as never;
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(canonicalization), { catalog: catalogOf(context) })),
    'UNSUPPORTED_CANONICALIZATION',
  );
  const integrity = cloneOf(built.document);
  integrity.integrityVersion = 2 as never;
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(integrity), { catalog: catalogOf(context) })),
    'UNSUPPORTED_INTEGRITY',
  );
});

test('234 a corrupted, truncated or oversized file is refused before use', async () => {
  const { context, built } = await buildFixture();
  const text = JSON.stringify(built.document);
  assert.equal(
    codeOf(readSaveFile(text.slice(0, text.length - 40), { catalog: catalogOf(context) })),
    'PARSE_ERROR',
  );
  assert.equal(
    codeOf(readSaveFile(`${text} trailing`, { catalog: catalogOf(context) })),
    'TRAILING_CONTENT',
  );
  assert.equal(
    codeOf(
      readSaveFile('x'.repeat(SAVEFILE_LIMITS.maxFileBytes + 1), { catalog: catalogOf(context) }),
    ),
    'FILE_TOO_LARGE',
  );
});

test('234 a newer format version is refused before the checksum is interpreted', async () => {
  const { context, built } = await buildFixture();
  const newer = cloneOf(built.document);
  newer.formatVersion = 2 as never;
  newer.checksum.value = 'f'.repeat(64);
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(newer), { catalog: catalogOf(context) })),
    'FORMAT_VERSION_TOO_NEW',
  );
});

test('234 safe integers and finite numbers are enforced in the payload', async () => {
  const { context, built } = await buildFixture();
  const unsafe = cloneOf(built.document);
  unsafe.payload.sessions.ACADEMY!.session.worldEpoch = 2 ** 53;
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(unsafe)), { catalog: catalogOf(context) }),
    ),
    'INVALID_COUNTER',
  );
  const huge = JSON.stringify(built.document).replace('"worldEpoch":1', '"worldEpoch":1e400');
  assert.equal(codeOf(readSaveFile(huge, { catalog: catalogOf(context) })), 'INVALID_NUMBER');
  const notANumber = cloneOf(built.document);
  notANumber.payload.decor.ACADEMY!.objects[0]!.damageNs = '0' as never;
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(notANumber)), {
        catalog: catalogOf(context),
      }),
    ),
    'INVALID_NUMBER',
  );
});

test('234 replay payloads are base64, size-checked and bounded', async () => {
  const context = await sessions();
  const invalid = accepted(
    buildSaveFile({
      createdAt: SAVEFILE_CREATED_AT,
      activeSession: 'ACADEMY',
      versions: ARCHIVE_VERSIONS,
      catalog: catalogOf(context),
      sessions: { ACADEMY: context.academy.archive.document },
    }),
  );
  const bad = cloneOf(invalid.document);
  bad.payload.optional.replays = [
    { replayId: 'replay:bad', encoding: 'base64', data: 'not base64!!!', bytes: 1 },
  ];
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(bad)), { catalog: catalogOf(context) }),
    ),
    'REPLAY_INVALID',
  );
  const mismatch = cloneOf(invalid.document);
  mismatch.payload.optional.replays = [
    { replayId: 'replay:size', encoding: 'base64', data: 'U0RBLTIzNA==', bytes: 8 },
  ];
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(mismatch)), {
        catalog: catalogOf(context),
      }),
    ),
    'REPLAY_INVALID',
  );
  const tooMany = cloneOf(invalid.document);
  tooMany.payload.optional.replays = Array.from(
    { length: SAVEFILE_LIMITS.maxReplayEntries + 1 },
    (_, index) => ({
      replayId: `replay:${index}`,
      encoding: 'base64' as const,
      data: 'U0RBLTIzNA==',
      bytes: 7,
    }),
  );
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(tooMany)), {
        catalog: catalogOf(context),
      }),
    ),
    'REPLAY_TOO_LARGE',
  );
});

test('234 decor must belong to the session of its slot', async () => {
  const { context, built } = await buildFixture();
  const swapped = cloneOf(built.document);
  swapped.payload.decor.CHAOS!.sessionId = swapped.payload.sessions.ACADEMY!.session.sessionId;
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(swapped)), { catalog: catalogOf(context) }),
    ),
    'DECOR_SESSION_MISMATCH',
  );
});

test('234 duplicate session identities, missing active slot and empty file are refused', async () => {
  const context = await sessions();
  const duplicate = buildSaveFile({
    createdAt: SAVEFILE_CREATED_AT,
    activeSession: 'ACADEMY',
    versions: ARCHIVE_VERSIONS,
    catalog: catalogOf(context),
    sessions: {
      ACADEMY: context.academy.archive.document,
      CHAOS: context.academy.archive.document,
    },
  });
  assert.equal(duplicate.status, 'REJECTED');
  if (duplicate.status === 'REJECTED') assert.equal(duplicate.rejection.code, 'DUPLICATE_SESSION');
  const missing = buildSaveFile({
    createdAt: SAVEFILE_CREATED_AT,
    activeSession: 'ACADEMY',
    versions: ARCHIVE_VERSIONS,
    catalog: catalogOf(context),
    sessions: { CHAOS: context.chaos.archive.document },
  });
  assert.equal(missing.status, 'REJECTED');
  if (missing.status === 'REJECTED') assert.equal(missing.rejection.code, 'ACTIVE_SESSION_MISSING');
  const empty = buildSaveFile({
    createdAt: SAVEFILE_CREATED_AT,
    activeSession: 'ACADEMY',
    versions: ARCHIVE_VERSIONS,
    catalog: catalogOf(context),
    sessions: { ACADEMY: null, CHAOS: null },
  });
  assert.equal(empty.status, 'REJECTED');
  if (empty.status === 'REJECTED') assert.equal(empty.rejection.code, 'SAVEFILE_EMPTY');
});

test('234 a legacy session archive is refused by the reader and migrated explicitly', async () => {
  const context = await sessions();
  const legacy = context.chaos.archive.document;
  assert.equal(
    codeOf(readSaveFile(JSON.stringify(legacy), { catalog: catalogOf(context) })),
    'LEGACY_SAVEFILE',
  );
  const migrated = accepted(
    migrateSessionArchiveToSaveFile(legacy, {
      createdAt: SAVEFILE_CREATED_AT,
      catalog: catalogOf(context),
      sessionKind: 'CHAOS',
      activeSession: 'CHAOS',
    }),
  );
  const read = readSaveFile(JSON.stringify(migrated.document), { catalog: catalogOf(context) });
  assert.equal(read.status, 'ACCEPTED');
  if (read.status !== 'ACCEPTED') return;
  assert.equal(read.sessions.CHAOS?.session.sessionId, CHAOS_SPEC.sessionId);
  assert.equal(read.sessions.ACADEMY, null);

  const v1 = context.academy.archive.document.components.session;
  const fromV1 = accepted(
    migrateSessionArchiveToSaveFile(v1, {
      createdAt: SAVEFILE_CREATED_AT,
      catalog: catalogOf(context),
    }),
  );
  const v1Read = readSaveFile(JSON.stringify(fromV1.document), { catalog: catalogOf(context) });
  assert.equal(v1Read.status, 'ACCEPTED');
  if (v1Read.status !== 'ACCEPTED') return;
  assert.equal(v1Read.summary.sessions.ACADEMY?.innerFormatVersion, 1);
});

/* ------------------------------------------------------------------- the file */

test('234 export writes a real file document from the durable repository', async () => {
  const context = await sessions();
  const job = createSaveFileJob(4);
  const exported = accepted(
    await exportSaveFile(context.academy.harness.repository, context.academy.transactions, {
      sessions: {
        ACADEMY: { sessionId: ACADEMY_SPEC.sessionId, playerId: ACADEMY_SPEC.playerId },
      },
      activeSession: 'ACADEMY',
      createdAt: SAVEFILE_CREATED_AT,
      catalog: catalogOf(context),
      decor: { ACADEMY: context.academy.decor },
      replays: [],
      progress: job,
    }),
  );
  assert.equal(exported.summary.sessionsPresent, 1);
  assert.equal(job.status().phase, 'DONE');
  assert.equal(job.status().fraction, 1);
  assert.equal(saveFileView(job.status(), 'FILE').label, 'FILE_READY');
  const read = readSaveFile(JSON.stringify(exported.document), {
    catalog: catalogOf(context),
  });
  assert.equal(read.status, 'ACCEPTED');
  if (read.status !== 'ACCEPTED') return;
  assert.equal(read.summary.sessions.ACADEMY?.xp, 100.5);
  assert.equal(read.summary.sessions.ACADEMY?.decorObjects, context.academy.decor.objects.length);
});

test('234 progress and status distinguish a prepared file from a browser autosave', () => {
  const job = createSaveFileJob(4);
  assert.equal(saveFileView(job.status(), 'FILE').label, 'NOT_STARTED');
  job.advance('PREPARE');
  assert.equal(saveFileView(job.status(), 'FILE').label, 'PREPARING_FILE');
  job.advance('VALIDATE');
  assert.equal(saveFileView(job.status(), 'FILE').label, 'VALIDATING');
  job.advance('COMMIT');
  assert.equal(saveFileView(job.status(), 'FILE').label, 'REPLACING');
  job.advance('DONE');
  assert.equal(saveFileView(job.status(), 'FILE').label, 'FILE_READY');
  assert.equal(saveFileView(job.status(), 'AUTOSAVE').label, 'AUTOSAVE_SAVED');
  assert.equal(saveFileView(job.status(), 'FILE').claimsBrowserWrite, false);
  assert.equal(saveFileView(job.status(), 'FILE').autosaveSeparate, true);
  const other = createSaveFileJob(4);
  other.cancel();
  assert.equal(saveFileView(other.status(), 'FILE').label, 'CANCELLED');
});

/* ------------------------------------------------------------- the replacement */

test('234 preview precedes the replacement and a successful import replaces both sessions', async () => {
  const { context, built } = await buildFixture();
  const target = await createSaveFileTarget({ dbName: '234-savefile-atomic' });
  const before = await targetFingerprint(target);
  const preview = previewAccepted(await target.store.preview({ document: built.document }));
  assert.equal(preview.previewId, built.checksum);
  assert.equal(preview.current.totalXp, 0);
  assert.equal(preview.current.sessions.ACADEMY?.economy, 'EMPTY');
  assert.equal(await targetFingerprint(target), before);

  const noConfirmation = await target.store.import({ document: built.document });
  assert.equal(importCode(noConfirmation), 'PREVIEW_REQUIRED');
  const stale = await target.store.import({
    document: built.document,
    confirmation: { previewId: 'a'.repeat(64) },
  });
  assert.equal(importCode(stale), 'PREVIEW_STALE');
  assert.equal(await targetFingerprint(target), before);

  const committed = await target.store.import({
    document: built.document,
    confirmation: { previewId: preview.previewId },
  });
  assert.equal(committed.status, 'COMMITTED');
  if (committed.status !== 'COMMITTED') return;
  assert.equal(committed.launch.mode, 'PAUSED_AUTO');
  assert.equal(committed.launch.paused, true);
  assert.equal(committed.launch.auto, true);
  assert.equal(committed.launch.inputReleased, true);
  assert.equal(committed.launch.manualVehicles, 0);
  assert.equal(committed.rewards.settled, 0);
  assert.equal(committed.rewards.granted, 0);
  assert.equal(committed.replacement.ACADEMY?.xp, 100.5);
  assert.equal(committed.replacement.CHAOS?.xp, 100.5);
  assert.equal(committed.replacement.ACADEMY?.xpMicroXp, 100_500_000);
  assert.equal(committed.replacement.ACADEMY?.economy, 'WRITTEN');
  assert.equal(committed.replacement.CHAOS?.checkpointTick, CHAOS_SPEC.tick);
  assert.equal(target.world.state.committed, 1);
  assert.equal(target.world.state.prepared, 1);
  assert.equal(target.world.state.restoredDecor, 2);

  const stored = await target.transactions.transact(['meta'], (transaction) =>
    Promise.all([
      loadEconomySave(transaction, {
        sessionId: ACADEMY_SPEC.sessionId,
        playerId: ACADEMY_SPEC.playerId,
      }),
      loadEconomySave(transaction, {
        sessionId: CHAOS_SPEC.sessionId,
        playerId: CHAOS_SPEC.playerId,
      }),
    ]),
  );
  const [academyStored, chaosStored] = stored;
  assert.equal(academyStored.status, 'FOUND');
  assert.equal(chaosStored.status, 'FOUND');
  if (academyStored.status === 'FOUND') {
    assert.equal(academyStored.counts.xpBalance, 100.5);
    assert.equal(academyStored.counts.dailyRewards, 1);
  }
  if (chaosStored.status === 'FOUND') {
    assert.equal(chaosStored.counts.xpBalance, 100.5);
    assert.equal(chaosStored.counts.dailyRewards, 1);
  }

  const second = previewAccepted(await target.store.preview({ document: built.document }));
  const again = await target.store.import({
    document: built.document,
    confirmation: { previewId: second.previewId },
  });
  assert.equal(again.status, 'COMMITTED');
  if (again.status !== 'COMMITTED') return;
  assert.equal(again.rewards.xpDelta, 0);
  assert.equal(again.replacement.ACADEMY?.xp, 100.5);
  assert.equal(again.replacement.CHAOS?.xp, 100.5);
  assert.equal(context.academy.archive.counts.xpBalance, 100.5);
});

test('234 a corrupt, truncated or rejected file leaves the target byte-identical', async () => {
  const { built } = await buildFixture();
  const target = await createSaveFileTarget({ dbName: '234-savefile-refusals' });
  const before = await targetFingerprint(target);
  const preview = previewAccepted(await target.store.preview({ document: built.document }));
  const tampered = cloneOf(built.document);
  tampered.payload.activeSession = 'CHAOS';
  assert.equal(
    importCode(
      await target.store.import({
        document: tampered,
        confirmation: { previewId: built.checksum },
      }),
    ),
    'CHECKSUM_MISMATCH',
  );
  assert.equal(
    importCode(
      await target.store.import({
        document: JSON.stringify(built.document).slice(0, 500),
        confirmation: { previewId: preview.previewId },
      }),
    ),
    'PARSE_ERROR',
  );
  assert.equal(await targetFingerprint(target), before);
  assert.equal(target.world.state.prepared, 0);
});

test('234 cancelling before the commit rolls the whole replacement back', async () => {
  const { built } = await buildFixture();
  const target = await createSaveFileTarget({ dbName: '234-savefile-cancel' });
  const before = await targetFingerprint(target);
  const preview = previewAccepted(await target.store.preview({ document: built.document }));
  const job = createSaveFileJob(4);
  job.cancel();
  const result = await target.store.import({
    document: built.document,
    confirmation: { previewId: preview.previewId },
    progress: job,
  });
  assert.equal(importCode(result), 'CANCELLED');
  assert.equal(target.world.state.discarded, 1);
  assert.equal(await targetFingerprint(target), before);
});

test('234 a cancellation raised before the commit aborts the transaction', async () => {
  const { built } = await buildFixture();
  const target = await createSaveFileTarget({ dbName: '234-savefile-cancel-tx' });
  const before = await targetFingerprint(target);
  const preview = previewAccepted(await target.store.preview({ document: built.document }));
  const job = createSaveFileJob(4);
  const result = await target.store.import({
    document: built.document,
    confirmation: { previewId: preview.previewId },
    progress: job,
    hooks: {
      beforeCommit: () => {
        job.cancel();
      },
    },
  });
  assert.equal(importCode(result), 'CANCELLED');
  assert.equal(await targetFingerprint(target), before);
  assert.equal(target.world.state.committed, 0);
});

test('234 a tampered decor snapshot is refused by the world staging before any write', async () => {
  const { built } = await buildFixture();
  const target = await createSaveFileTarget({ dbName: '234-savefile-decor' });
  const before = await targetFingerprint(target);
  const tampered = cloneOf(built.document);
  tampered.payload.decor.ACADEMY!.objects[0]!.positionM.x += 1;
  const restamped = stampSaveFileChecksum(tampered);
  const read = readSaveFile(JSON.stringify(restamped), { catalog: target.catalog });
  assert.equal(read.status, 'ACCEPTED');
  const preview = previewAccepted(await target.store.preview({ document: restamped }));
  const result = await target.store.import({
    document: restamped,
    confirmation: { previewId: preview.previewId },
  });
  assert.equal(importCode(result), 'WORLD_PREPARE_FAILED');
  assert.equal(await targetFingerprint(target), before);
  assert.equal(target.world.state.committed, 0);
});

test('234 the second tab cannot replace the session', async () => {
  const { built } = await buildFixture();
  const target = await createSaveFileTarget({ dbName: '234-savefile-writer' });
  const readOnly = createLocalRepository({
    factory: target.harness.factory,
    locks: target.harness.locks,
    dbName: '234-savefile-writer',
    tabId: 'tab-234-readonly',
    now: fixedClock(),
  });
  const opened = await readOnly.open();
  assert.equal(opened.status, 'READY');
  try {
    assert.equal(readOnly.status().role, 'READ_ONLY');
    const store = createSaveFileStore({
      repository: readOnly,
      transactions: target.transactions,
      catalog: target.catalog,
    });
    const preview = previewAccepted(await store.preview({ document: built.document }));
    const result = await store.import({
      document: built.document,
      confirmation: { previewId: preview.previewId },
    });
    assert.equal(importCode(result), 'WRITER_REQUIRED');
  } finally {
    readOnly.close();
  }
});

test('234 an exhausted quota aborts the replacement and keeps the previous bytes', async () => {
  const { built } = await buildFixture();
  const target = await createSaveFileTarget({ dbName: '234-savefile-quota' });
  const before = await targetFingerprint(target);
  const quotaTransactions = {
    transact: <T>(
      stores: Parameters<typeof target.transactions.transact>[0],
      work: (transaction: TransactionPort) => Promise<T>,
    ) =>
      target.transactions.transact(stores, (transaction: TransactionPort) =>
        work({
          get: (store, key) => transaction.get(store, key),
          getAll: (store) => transaction.getAll(store),
          getAllByIndex: (store, index, key) => transaction.getAllByIndex(store, index, key),
          put: (store, value) => {
            if (store === 'meta') {
              return Promise.reject(
                new PersistenceError('STORAGE_FULL', 'The origin quota is exhausted'),
              );
            }
            return transaction.put(store, value);
          },
          delete: (store, key) => transaction.delete(store, key),
        }),
      ),
  };
  const store = createSaveFileStore({
    repository: target.harness.repository,
    transactions: quotaTransactions,
    catalog: target.catalog,
  });
  const preview = previewAccepted(await store.preview({ document: built.document }));
  const result = await store.import({
    document: built.document,
    confirmation: { previewId: preview.previewId },
  });
  assert.equal(importCode(result), 'STORAGE_FULL');
  assert.equal(await targetFingerprint(target), before);
  assert.equal(target.world.state.committed, 0);
});

test('234 the declared size ledger must match the measured payload', async () => {
  const { context, built } = await buildFixture();
  const wrong = cloneOf(built.document);
  wrong.payload.sizes.total += 1;
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(wrong)), { catalog: catalogOf(context) }),
    ),
    'SIZE_MISMATCH',
  );
  const wrongLimit = cloneOf(built.document);
  wrongLimit.payload.sizes.limit -= 1;
  assert.equal(
    codeOf(
      readSaveFile(JSON.stringify(stampSaveFileChecksum(wrongLimit)), {
        catalog: catalogOf(context),
      }),
    ),
    'SIZE_MISMATCH',
  );
});
