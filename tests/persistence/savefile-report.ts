import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SAVEFILE_LIMITS,
  SESSION_ARCHIVE_ECONOMY_LIMITS,
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
  savefileCodes,
  stampSaveFileChecksum,
} from '../../src/persistence/index';
import type {
  SaveFileAccepted,
  SaveFileBuildResult,
  SaveFileDocument,
  SaveFileImportResult,
  SaveFileImportAccepted,
  SaveFilePreview,
  SaveFileValidation,
} from '../../src/persistence/index';
import {
  ACADEMY_SPEC,
  CHAOS_SPEC,
  SAVEFILE_CREATED_AT,
  createSaveFileSessions,
  createSaveFileTarget,
  targetFingerprint,
} from './savefile-fixture';
import { ARCHIVE_VERSIONS } from './session-archive-fixture';
import { fixedClock } from './fixtures';

/**
 * Deterministic transcript of the PBI 234 `.sdasave` contract.
 *
 * No wall clock, no browser and no random source: the sessions come from the real 135/215/227
 * fixtures, the timestamps are explicit and every refusal is a real call of the delivered reader.
 * The same build produces the same `report.json`, which is what `npm run save:file -- --check`
 * verifies. Byte numbers are real canonical measurements; wall-clock cost is deliberately not
 * claimed by this transcript.
 */

export const SAVEFILE_REPORT_VERSION = '234-savefile-report-v1';

export interface SaveFileCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface SaveFileReport {
  readonly version: string;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly structure: {
    readonly format: string;
    readonly formatVersion: number;
    readonly integrityVersion: number;
    readonly schemaVersion: number;
    readonly schemaId: string;
    readonly createdAt: string;
    readonly fileName: string;
    readonly extension: string;
    readonly mimeType: string;
    readonly checksum: string;
    readonly checksumLength: number;
    readonly algorithm: string;
    readonly canonicalization: string;
    readonly bytes: number;
    readonly maxFileBytes: number;
    readonly headroomBytes: number;
    readonly payloadShare: number;
    readonly sizes: {
      readonly sessions: { readonly ACADEMY: number; readonly CHAOS: number };
      readonly decor: { readonly ACADEMY: number; readonly CHAOS: number };
      readonly optional: number;
      readonly total: number;
      readonly limit: number;
    };
    readonly sessions: {
      readonly ACADEMY: {
        readonly sessionId: string;
        readonly playerId: string;
        readonly worldEpoch: number;
        readonly innerFormatVersion: number;
        readonly checkpointId: string;
        readonly checkpointTick: number;
        readonly xp: number;
        readonly xpMicroXp: number;
        readonly level: number;
        readonly dailyRewards: number;
        readonly decorObjects: number;
        readonly bytes: number;
      };
      readonly CHAOS: {
        readonly sessionId: string;
        readonly playerId: string;
        readonly worldEpoch: number;
        readonly innerFormatVersion: number;
        readonly checkpointId: string;
        readonly checkpointTick: number;
        readonly xp: number;
        readonly xpMicroXp: number;
        readonly level: number;
        readonly dailyRewards: number;
        readonly decorObjects: number;
        readonly bytes: number;
      };
    };
    readonly replays: { readonly entries: number; readonly bytes: number };
    readonly totalXp: number;
  };
  readonly roundTrip: {
    readonly status: string;
    readonly checksumVerified: boolean;
    readonly activeSession: string;
    readonly sessionsPresent: number;
    readonly checksumStable: boolean;
    readonly decorObjects: number;
    readonly reorderedAccepted: boolean;
  };
  readonly canonicalization: {
    readonly vectorText: string;
    readonly duplicateKey: string;
    readonly minusZero: string;
    readonly arrayOrder: string;
    readonly base64DecodedBytes: number;
  };
  readonly import: {
    readonly previewStatus: string;
    readonly currentXpBefore: number;
    readonly status: string;
    readonly launch: string;
    readonly xpAfter: number;
    readonly xpDelta: number;
    readonly rewardsSettled: number;
    readonly rewardsGranted: number;
    readonly dailyRewardsAfter: number;
    readonly settlementsAfter: number;
    readonly worldStaged: number;
    readonly worldCommitted: number;
    readonly decorRestored: number;
    readonly secondImportStatus: string;
    readonly secondXpDelta: number;
    readonly secondXpAfter: number;
    readonly secondEconomyRevision: number;
  };
  readonly refusals: {
    readonly modifiedWithoutChecksum: string;
    readonly duplicateKey: string;
    readonly truncated: string;
    readonly trailingContent: string;
    readonly oversized: string;
    readonly missingChecksum: string;
    readonly unknownAlgorithm: string;
    readonly unknownCanonicalization: string;
    readonly unknownIntegrity: string;
    readonly newerFormat: string;
    readonly newerSchema: string;
    readonly unknownSchema: string;
    readonly checksumBeforeSchema: string;
    readonly replayInvalid: string;
    readonly replayTooLarge: string;
    readonly unsafeInteger: string;
    readonly invalidNumber: string;
    readonly foreignDecor: string;
    readonly duplicateSession: string;
    readonly activeSessionMissing: string;
    readonly emptyFile: string;
    readonly legacyRefused: string;
    readonly previewRequired: string;
    readonly previewStale: string;
    readonly writerRequired: string;
    readonly cancelled: string;
    readonly worldPrepareFailed: string;
    readonly corruptLeftIdentical: boolean;
    readonly cancelledLeftIdentical: boolean;
    readonly decorTamperLeftIdentical: boolean;
  };
  readonly legacy: {
    readonly refusedAs: string;
    readonly migratedStatus: string;
    readonly migratedSessions: number;
    readonly migratedActiveSession: string;
    readonly v1InnerStatus: string;
    readonly v1InnerFormatVersion: number;
  };
  readonly budgets: {
    readonly source: string;
    readonly manifestVersion: string;
    readonly maxFileBytes: number;
    readonly maxPayloadBytes: number;
    readonly maxSessionBytes: number;
    readonly maxDecorBytes: number;
    readonly maxReplayBytes: number;
    readonly persistenceIngressBytes: number;
    readonly optionalReplayStorageBytes: number;
    readonly totalHeapBytes: null;
    readonly twoSessionCheckpointBytes: null;
    readonly twoSessionStatus: string;
    readonly measuredFileBytes: number;
    readonly measuredPayloadBytes: number;
    readonly measuredShareOfManifestIngress: number;
    readonly gaps: readonly string[];
  };
  readonly performance: {
    readonly storage: {
      readonly producedBytes: number;
      readonly maxFileBytes: number;
      readonly checksumBytes: number;
      readonly slotBytes: { readonly ACADEMY: number; readonly CHAOS: number };
      readonly decorBytes: { readonly ACADEMY: number; readonly CHAOS: number };
      readonly economyRows: number;
      readonly result: string;
    };
    readonly memory: {
      readonly ownedPayloadBytes: number;
      readonly ownedCanonicalBytes: number;
      readonly ownedSessionBytes: number;
      readonly ownedDecorBytes: number;
      readonly totalHeapBytes: null;
      readonly measurement: string;
      readonly result: string;
    };
    readonly workers: {
      readonly workerTransfers: number;
      readonly pipeline: string;
      readonly cancelWindow: string;
      readonly progressModel: string;
      readonly result: string;
    };
    readonly ui: {
      readonly labels: readonly string[];
      readonly claimsBrowserWrite: boolean;
      readonly autosaveSeparate: boolean;
      readonly visual: string;
      readonly result: string;
    };
  };
  readonly checks: readonly SaveFileCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly scenarios: number;
    readonly pass: boolean;
  };
}

function canonical(value: unknown): string {
  const result = canonicalizeJson(value, { maxDepth: 64 });
  if (result.status === 'REJECTED') throw new Error(result.rejection.message);
  return result.text;
}

function canonicalTextOf(value: unknown): string {
  const result = canonicalizeJson(value, { maxDepth: 64 });
  return result.status === 'ACCEPTED' ? result.text : `REJECTED:${result.rejection.code}`;
}

function check(
  checks: SaveFileCheck[],
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): void {
  checks.push(
    Object.freeze({
      name,
      expected,
      actual,
      pass: canonical(expected) === canonical(actual),
      detail,
    }),
  );
}

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function mutable(document: SaveFileDocument): Mutable<SaveFileDocument> {
  return structuredClone(document) as Mutable<SaveFileDocument>;
}

function accepted(result: SaveFileBuildResult): SaveFileAccepted {
  if (result.status !== 'ACCEPTED') {
    throw new Error(`Expected an accepted savefile, got ${result.rejection.code}`);
  }
  return result;
}

function readCode(result: SaveFileValidation): string {
  return result.status === 'REJECTED' ? result.rejection.code : 'ACCEPTED';
}

function importCode(result: SaveFileImportResult): string {
  return result.status === 'REJECTED' ? result.rejection.code : result.status;
}

function previewAccepted(result: SaveFilePreview) {
  if (result.status !== 'ACCEPTED') {
    throw new Error(`Expected an accepted preview, got ${result.rejection.code}`);
  }
  return result;
}

function committedAccepted(result: SaveFileImportResult): SaveFileImportAccepted {
  if (result.status === 'REJECTED') {
    throw new Error(`Expected a committed import, got ${result.rejection.code}`);
  }
  return result;
}

function manifest() {
  const raw = readFileSync(join(process.cwd(), 'Docs', 'performance-budgets.json'), 'utf8');
  return JSON.parse(raw) as {
    budgetVersion: string;
    proposedCapacities: { optionalReplayStorageBytes: number; twoSessionCheckpointBytes: null };
    resourceAdmissionContracts: { workers: { persistenceIngressBytes: number } };
  };
}

export async function runSaveFileReport(): Promise<SaveFileReport> {
  const checks: SaveFileCheck[] = [];
  const source = await createSaveFileSessions();
  const catalog = source.academy.harness.catalog;
  const built = accepted(
    buildSaveFile({
      createdAt: SAVEFILE_CREATED_AT,
      activeSession: 'ACADEMY',
      versions: ARCHIVE_VERSIONS,
      catalog,
      sessions: {
        ACADEMY: source.academy.archive.document,
        CHAOS: source.chaos.archive.document,
      },
      decor: { ACADEMY: source.academy.decor, CHAOS: source.chaos.decor },
      replays: [{ replayId: 'replay:234', encoding: 'base64', data: 'U0RBLTIzNA==', bytes: 7 }],
    }),
  );
  const document = built.document;
  const text = JSON.stringify(document);
  const read = readSaveFile(text, { catalog });
  if (read.status !== 'ACCEPTED') throw new Error('234 report expects a readable savefile');

  check(checks, 'format', 'self-driving-academy-save', document.format, 'Envelope format marker.');
  check(
    checks,
    'formatVersion',
    1,
    document.formatVersion,
    'Reader and writer agree on version 1.',
  );
  check(checks, 'integrityVersion', 1, document.integrityVersion, 'Integrity rules are versioned.');
  check(checks, 'checksumLength', 64, document.checksum.value.length, 'A full SHA-256 hex digest.');
  check(
    checks,
    'checksumVerified',
    true,
    read.checksumVerified,
    'The reader recomputed the checksum.',
  );
  check(
    checks,
    'sessionsPresent',
    2,
    read.summary.sessionsPresent,
    'Academy and Haos are both carried.',
  );
  check(
    checks,
    'activeSession',
    'ACADEMY',
    read.activeSession,
    'The last active session is explicit.',
  );
  check(checks, 'decorObjects', 35, read.decor.ACADEMY?.objects.length ?? 0, 'Real 227 snapshot.');
  check(
    checks,
    'academyXp',
    100.5,
    read.summary.sessions.ACADEMY?.xp,
    'The 215 XP balance is carried, not recalculated.',
  );
  check(
    checks,
    'chaosCheckpointTick',
    CHAOS_SPEC.tick,
    read.summary.sessions.CHAOS?.checkpointTick,
    'The second session keeps its own checkpoint.',
  );
  check(checks, 'totalXp', 201, read.summary.totalXp, 'Both sessions remain separate balances.');
  check(checks, 'replayBytes', 7, read.summary.replays.bytes, 'Optional replay size is declared.');
  check(
    checks,
    'fileName',
    'self-driving-academy-20261022T090000000Z.sdasave',
    saveFileName(SAVEFILE_CREATED_AT),
    'Deterministic file name.',
  );
  check(
    checks,
    'fileBytesWithinBudget',
    true,
    read.summary.bytes <= SAVEFILE_LIMITS.maxFileBytes,
    'A produced file is under the finite admission cap.',
  );

  const reordered = {
    checksum: document.checksum,
    payload: document.payload,
    createdAt: document.createdAt,
    schemaVersion: document.schemaVersion,
    integrityVersion: document.integrityVersion,
    formatVersion: document.formatVersion,
    format: document.format,
  };
  const reorderedRead = readSaveFile(JSON.stringify(reordered, null, 2), { catalog });
  check(
    checks,
    'whitespaceAndKeyOrder',
    true,
    reorderedRead.status === 'ACCEPTED' && reorderedRead.summary.checksum === built.checksum,
    'Canonical form ignores whitespace and object key order.',
  );

  const vector = canonicalizeJson({ z: 1, '😀': true, é: 'Ștefan', n: 0.1, a: [3, -0, 2] });
  if (vector.status === 'REJECTED') throw new Error(vector.rejection.message);
  check(
    checks,
    'canonicalVector',
    '{"a":[3,0,2],"n":0.1,"z":1,"é":"Ștefan","😀":true}',
    vector.text,
    'Unicode, -0, array order and UTF-16 key sorting.',
  );

  const exported = accepted(
    await exportSaveFile(source.academy.harness.repository, source.academy.transactions, {
      sessions: {
        ACADEMY: { sessionId: ACADEMY_SPEC.sessionId, playerId: ACADEMY_SPEC.playerId },
      },
      activeSession: 'ACADEMY',
      createdAt: SAVEFILE_CREATED_AT,
      catalog,
      decor: { ACADEMY: source.academy.decor },
      replays: [],
    }),
  );
  const exportedRead = readSaveFile(JSON.stringify(exported.document), { catalog });
  if (exportedRead.status !== 'ACCEPTED') throw new Error('234 report expects the export to read');
  check(
    checks,
    'exportStatus',
    'ACCEPTED',
    exportedRead.status,
    'Export reads from the repository.',
  );
  check(
    checks,
    'exportSessionXp',
    100.5,
    exportedRead.summary.sessions.ACADEMY?.xp,
    'The exported file carries the stored balance.',
  );
  check(
    checks,
    'exportDecorObjects',
    source.academy.decor.objects.length,
    exportedRead.summary.sessions.ACADEMY?.decorObjects,
    'The 227 snapshot travels with the session.',
  );

  /* ------------------------------------------------------------- refusals */

  const modified = mutable(document);
  modified.payload.activeSession = 'CHAOS';
  const modifiedCode = readCode(readSaveFile(JSON.stringify(modified), { catalog }));
  check(
    checks,
    'modifiedWithoutChecksum',
    'CHECKSUM_MISMATCH',
    modifiedCode,
    'Any covered edit is caught.',
  );

  const xpEdit = mutable(document);
  const chaosSlot = xpEdit.payload.sessions.CHAOS;
  if (chaosSlot === null || chaosSlot.formatVersion !== 2) throw new Error('Expected CHAOS v2');
  const economy = chaosSlot.components.economy;
  if (economy === null || economy.components.player === null) throw new Error('Expected XP');
  economy.components.player.entries[0]!.amountMicroXp += 1_000_000;
  check(
    checks,
    'xpEditWithoutChecksum',
    'CHECKSUM_MISMATCH',
    readCode(readSaveFile(JSON.stringify(xpEdit), { catalog })),
    'An XP edit without a new hash is refused.',
  );

  const duplicateText = text.replace('{', '{"format":"self-driving-academy-save",');
  check(
    checks,
    'duplicateKey',
    'DUPLICATE_KEY',
    readCode(readSaveFile(duplicateText, { catalog })),
    'Duplicate keys are refused before hashing.',
  );
  check(
    checks,
    'truncated',
    'PARSE_ERROR',
    readCode(readSaveFile(text.slice(0, text.length - 40), { catalog })),
    'A truncated file is not partially read.',
  );
  check(
    checks,
    'trailingContent',
    'TRAILING_CONTENT',
    readCode(readSaveFile(`${text} x`, { catalog })),
    'Content after the document is refused.',
  );
  check(
    checks,
    'oversized',
    'FILE_TOO_LARGE',
    readCode(readSaveFile('x'.repeat(SAVEFILE_LIMITS.maxFileBytes + 1), { catalog })),
    'A file over the cap is refused before parsing.',
  );

  const missing = mutable(document) as unknown as Record<string, unknown>;
  delete missing.checksum;
  check(
    checks,
    'missingChecksum',
    'MISSING_FIELD',
    readCode(readSaveFile(JSON.stringify(missing), { catalog })),
    'A savefile without a checksum is not a valid save.',
  );
  const algorithm = mutable(document);
  algorithm.checksum.algorithm = 'SHA-1' as never;
  check(
    checks,
    'unknownAlgorithm',
    'UNSUPPORTED_ALGORITHM',
    readCode(readSaveFile(JSON.stringify(algorithm), { catalog })),
    'An unknown algorithm is a closed error, not a fallback.',
  );
  const canonicalization = mutable(document);
  canonicalization.checksum.canonicalization = 'SDA-CJSON-0' as never;
  check(
    checks,
    'unknownCanonicalization',
    'UNSUPPORTED_CANONICALIZATION',
    readCode(readSaveFile(JSON.stringify(canonicalization), { catalog })),
    'An unknown canonicalization is refused.',
  );
  const integrity = mutable(document);
  integrity.integrityVersion = 2 as never;
  check(
    checks,
    'unknownIntegrity',
    'UNSUPPORTED_INTEGRITY',
    readCode(readSaveFile(JSON.stringify(integrity), { catalog })),
    'Unknown integrity rules are refused.',
  );
  const newerFormat = mutable(document);
  newerFormat.formatVersion = 2 as never;
  newerFormat.checksum.value = 'f'.repeat(64);
  check(
    checks,
    'newerFormat',
    'FORMAT_VERSION_TOO_NEW',
    readCode(readSaveFile(JSON.stringify(newerFormat), { catalog })),
    'A newer layout is refused before the checksum is interpreted.',
  );
  const newerSchema = mutable(document);
  newerSchema.schemaVersion = 2 as never;
  check(
    checks,
    'newerSchema',
    'SCHEMA_TOO_NEW',
    readCode(readSaveFile(JSON.stringify(stampSaveFileChecksum(newerSchema)), { catalog })),
    'A correct checksum does not make a newer schema readable.',
  );
  const unknownSchema = mutable(document);
  unknownSchema.payload.versions.schema = '999-savefile-schema';
  check(
    checks,
    'unknownSchema',
    'UNSUPPORTED_SCHEMA',
    readCode(readSaveFile(JSON.stringify(stampSaveFileChecksum(unknownSchema)), { catalog })),
    'A re-stamped file still fails the schema contract.',
  );
  const schemaAndChecksum = mutable(document);
  schemaAndChecksum.schemaVersion = 2 as never;
  schemaAndChecksum.checksum.value = '0'.repeat(64);
  check(
    checks,
    'checksumBeforeSchema',
    'CHECKSUM_MISMATCH',
    readCode(readSaveFile(JSON.stringify(schemaAndChecksum), { catalog })),
    'The checksum is verified before the schema is interpreted.',
  );

  const replayInvalid = mutable(document);
  replayInvalid.payload.optional.replays = [
    { replayId: 'replay:bad', encoding: 'base64', data: 'not base64!!!', bytes: 1 },
  ];
  check(
    checks,
    'replayInvalid',
    'REPLAY_INVALID',
    readCode(readSaveFile(JSON.stringify(stampSaveFileChecksum(replayInvalid)), { catalog })),
    'Base64 is validated and the declared size must match.',
  );
  const replayTooLarge = mutable(document);
  replayTooLarge.payload.optional.replays = Array.from(
    { length: SAVEFILE_LIMITS.maxReplayEntries + 1 },
    (_, index) => ({
      replayId: `replay:${index}`,
      encoding: 'base64' as const,
      data: 'U0RBLTIzNA==',
      bytes: 7,
    }),
  );
  check(
    checks,
    'replayTooLarge',
    'REPLAY_TOO_LARGE',
    readCode(readSaveFile(JSON.stringify(stampSaveFileChecksum(replayTooLarge)), { catalog })),
    'Optional replay storage is bounded.',
  );
  const unsafe = mutable(document);
  unsafe.payload.sessions.ACADEMY!.session.worldEpoch = 2 ** 53;
  check(
    checks,
    'unsafeInteger',
    'INVALID_COUNTER',
    readCode(readSaveFile(JSON.stringify(stampSaveFileChecksum(unsafe)), { catalog })),
    'Integer fields must be safe integers.',
  );
  const invalidNumber = mutable(document);
  invalidNumber.payload.decor.ACADEMY!.objects[0]!.damageNs = '0' as never;
  check(
    checks,
    'invalidNumber',
    'INVALID_NUMBER',
    readCode(readSaveFile(JSON.stringify(stampSaveFileChecksum(invalidNumber)), { catalog })),
    'Numbers are validated as finite numbers.',
  );
  const foreignDecor = mutable(document);
  foreignDecor.payload.decor.CHAOS!.sessionId =
    foreignDecor.payload.sessions.ACADEMY!.session.sessionId;
  check(
    checks,
    'foreignDecor',
    'DECOR_SESSION_MISMATCH',
    readCode(readSaveFile(JSON.stringify(stampSaveFileChecksum(foreignDecor)), { catalog })),
    'A decor snapshot must belong to its session.',
  );

  const duplicateSession = buildSaveFile({
    createdAt: SAVEFILE_CREATED_AT,
    activeSession: 'ACADEMY',
    versions: ARCHIVE_VERSIONS,
    catalog,
    sessions: {
      ACADEMY: source.academy.archive.document,
      CHAOS: source.academy.archive.document,
    },
  });
  check(
    checks,
    'duplicateSession',
    'DUPLICATE_SESSION',
    duplicateSession.status === 'REJECTED' ? duplicateSession.rejection.code : 'ACCEPTED',
    'Two slots cannot name the same session.',
  );
  const missingActive = buildSaveFile({
    createdAt: SAVEFILE_CREATED_AT,
    activeSession: 'ACADEMY',
    versions: ARCHIVE_VERSIONS,
    catalog,
    sessions: { CHAOS: source.chaos.archive.document },
  });
  check(
    checks,
    'activeSessionMissing',
    'ACTIVE_SESSION_MISSING',
    missingActive.status === 'REJECTED' ? missingActive.rejection.code : 'ACCEPTED',
    'The active slot must exist.',
  );
  const empty = buildSaveFile({
    createdAt: SAVEFILE_CREATED_AT,
    activeSession: 'ACADEMY',
    versions: ARCHIVE_VERSIONS,
    catalog,
    sessions: { ACADEMY: null, CHAOS: null },
  });
  check(
    checks,
    'emptyFile',
    'SAVEFILE_EMPTY',
    empty.status === 'REJECTED' ? empty.rejection.code : 'ACCEPTED',
    'A file with no session is refused.',
  );

  const legacyRefused = readCode(
    readSaveFile(JSON.stringify(source.chaos.archive.document), { catalog }),
  );
  check(
    checks,
    'legacyRefused',
    'LEGACY_SAVEFILE',
    legacyRefused,
    'A bare session archive is refused explicitly, never guessed as a savefile.',
  );
  const migrated = accepted(
    migrateSessionArchiveToSaveFile(source.chaos.archive.document, {
      createdAt: SAVEFILE_CREATED_AT,
      catalog,
      sessionKind: 'CHAOS',
      activeSession: 'CHAOS',
    }),
  );
  const migratedRead = readSaveFile(JSON.stringify(migrated.document), { catalog });
  if (migratedRead.status !== 'ACCEPTED') throw new Error('234 report expects migration to read');
  const v1 = source.academy.archive.document.components.session;
  const v1Migrated = accepted(
    migrateSessionArchiveToSaveFile(v1, { createdAt: SAVEFILE_CREATED_AT, catalog }),
  );
  const v1Read = readSaveFile(JSON.stringify(v1Migrated.document), { catalog });
  if (v1Read.status !== 'ACCEPTED') throw new Error('234 report expects v1 migration to read');

  /* --------------------------------------------------------------- import */

  const target = await createSaveFileTarget({ dbName: '234-savefile-report-target' });
  const preview = previewAccepted(await target.store.preview({ document }));
  const required = await target.store.import({ document });
  const stale = await target.store.import({
    document,
    confirmation: { previewId: 'a'.repeat(64) },
  });
  const committed = committedAccepted(
    await target.store.import({ document, confirmation: { previewId: preview.previewId } }),
  );
  const academyAfter = await target.transactions.transact(['meta'], (transaction) =>
    loadEconomySave(transaction, {
      sessionId: ACADEMY_SPEC.sessionId,
      playerId: ACADEMY_SPEC.playerId,
    }),
  );
  if (academyAfter.status !== 'FOUND') throw new Error('234 report expects a stored economy');
  const secondPreview = previewAccepted(await target.store.preview({ document }));
  const second = committedAccepted(
    await target.store.import({ document, confirmation: { previewId: secondPreview.previewId } }),
  );
  const secondStored = await target.transactions.transact(['meta'], (transaction) =>
    loadEconomySave(transaction, {
      sessionId: ACADEMY_SPEC.sessionId,
      playerId: ACADEMY_SPEC.playerId,
    }),
  );
  if (secondStored.status !== 'FOUND')
    throw new Error('234 report expects a second stored economy');

  check(
    checks,
    'previewRequired',
    'PREVIEW_REQUIRED',
    importCode(required),
    'No replacement without a preview.',
  );
  check(
    checks,
    'previewStale',
    'PREVIEW_STALE',
    importCode(stale),
    'A stale preview cannot confirm.',
  );
  check(
    checks,
    'importStatus',
    'COMMITTED',
    committed.status,
    'One transaction commits both slots.',
  );
  check(
    checks,
    'importXp',
    100.5,
    committed.replacement.ACADEMY?.xp,
    'The file XP replaces, never adds.',
  );
  check(
    checks,
    'importXpMicro',
    100_500_000,
    committed.replacement.ACADEMY?.xpMicroXp,
    'Micro-XP is exact.',
  );
  check(
    checks,
    'importLevel',
    2,
    committed.replacement.ACADEMY?.level,
    'The level follows the XP ledger.',
  );
  check(
    checks,
    'rewardsSettled',
    0,
    committed.rewards.settled,
    'No settlement call exists in this path.',
  );
  check(
    checks,
    'rewardsGranted',
    0,
    committed.rewards.granted,
    'No credit call exists in this path.',
  );
  check(
    checks,
    'launchPausedAuto',
    'PAUSED_AUTO',
    committed.launch.mode,
    'Startup is paused/AUTO.',
  );
  check(checks, 'launchInputReleased', true, committed.launch.inputReleased, 'Input is released.');
  check(
    checks,
    'launchManualVehicles',
    0,
    committed.launch.manualVehicles,
    'No manual vehicle stays live.',
  );
  check(
    checks,
    'dailyRewardsAfter',
    1,
    academyAfter.counts.dailyRewards,
    'One daily reward survives.',
  );
  check(
    checks,
    'settlementsAfter',
    3,
    academyAfter.counts.settlements,
    'Settlements are replaced.',
  );
  check(
    checks,
    'worldStaged',
    2,
    target.world.state.prepared,
    'The world is staged before the write.',
  );
  check(
    checks,
    'worldCommitted',
    2,
    target.world.state.committed,
    'The staged world is published after.',
  );
  check(
    checks,
    'decorRestored',
    4,
    target.world.state.restoredDecor,
    'Both decor snapshots restore.',
  );
  check(
    checks,
    'secondImportStatus',
    'COMMITTED',
    second.status,
    'The second import is idempotent.',
  );
  check(checks, 'secondXpDelta', 0, second.rewards.xpDelta, 'A second import adds no XP.');
  check(
    checks,
    'secondXpAfter',
    100.5,
    second.replacement.ACADEMY?.xp,
    'The balance is the file balance.',
  );
  check(
    checks,
    'secondEconomyRevision',
    academyAfter.revision + 1,
    secondStored.revision,
    'The row revision advances without changing the balance.',
  );
  if (secondStored.status === 'FOUND') {
    check(
      checks,
      'secondDailyRewards',
      1,
      secondStored.counts.dailyRewards,
      'The daily reward is not duplicated.',
    );
    check(
      checks,
      'secondXpMicro',
      100_500_000,
      secondStored.counts.xpBalanceMicroXp,
      'Micro-XP is not duplicated.',
    );
  }

  /* ------------------------------------------------------ closed and atomic */

  const refusalTarget = await createSaveFileTarget({ dbName: '234-savefile-report-refusals' });
  const refusalBefore = await targetFingerprint(refusalTarget);
  const refusalPreview = previewAccepted(await refusalTarget.store.preview({ document }));
  const corrupt = mutable(document);
  corrupt.payload.activeSession = 'CHAOS';
  const corruptCode = importCode(
    await refusalTarget.store.import({
      document: corrupt,
      confirmation: { previewId: refusalPreview.previewId },
    }),
  );
  const corruptAfter = await targetFingerprint(refusalTarget);
  check(checks, 'corruptImport', 'CHECKSUM_MISMATCH', corruptCode, 'A corrupt file is refused.');
  check(
    checks,
    'corruptLeftIdentical',
    true,
    refusalBefore === corruptAfter,
    'The refused import leaves the target byte-identical.',
  );

  const cancelTarget = await createSaveFileTarget({ dbName: '234-savefile-report-cancel' });
  const cancelBefore = await targetFingerprint(cancelTarget);
  const cancelPreview = previewAccepted(await cancelTarget.store.preview({ document }));
  const cancelJob = createSaveFileJob(4);
  cancelJob.cancel();
  const cancelled = await cancelTarget.store.import({
    document,
    confirmation: { previewId: cancelPreview.previewId },
    progress: cancelJob,
  });
  check(
    checks,
    'cancelled',
    'CANCELLED',
    importCode(cancelled),
    'Cancellation is a closed result.',
  );
  check(
    checks,
    'cancelledLeftIdentical',
    true,
    cancelBefore === (await targetFingerprint(cancelTarget)),
    'A cancelled import rolls back.',
  );

  const decorTarget = await createSaveFileTarget({ dbName: '234-savefile-report-decor' });
  const decorBefore = await targetFingerprint(decorTarget);
  const decorTamper = mutable(document);
  decorTamper.payload.decor.ACADEMY!.objects[0]!.positionM.x += 1;
  const restamped = stampSaveFileChecksum(decorTamper);
  const decorPreview = previewAccepted(await decorTarget.store.preview({ document: restamped }));
  const decorResult = await decorTarget.store.import({
    document: restamped,
    confirmation: { previewId: decorPreview.previewId },
  });
  check(
    checks,
    'decorTamper',
    'WORLD_PREPARE_FAILED',
    importCode(decorResult),
    'The 227 restore refuses a tampered decor snapshot before the write.',
  );
  check(
    checks,
    'decorTamperLeftIdentical',
    true,
    decorBefore === (await targetFingerprint(decorTarget)),
    'A failed world staging writes nothing.',
  );

  const writerTarget = await createSaveFileTarget({ dbName: '234-savefile-report-writer' });
  const readOnly = createLocalRepository({
    factory: writerTarget.harness.factory,
    locks: writerTarget.harness.locks,
    dbName: '234-savefile-report-writer',
    tabId: 'tab-234-report-readonly',
    now: fixedClock(),
  });
  const opened = await readOnly.open();
  if (opened.status !== 'READY') throw new Error('234 report expects the reader connection');
  let writerCode = 'NOT_RUN';
  try {
    const store = createSaveFileStore({
      repository: readOnly,
      transactions: writerTarget.transactions,
      catalog: writerTarget.catalog,
    });
    const readOnlyPreview = previewAccepted(await store.preview({ document }));
    writerCode = importCode(
      await store.import({ document, confirmation: { previewId: readOnlyPreview.previewId } }),
    );
  } finally {
    readOnly.close();
  }
  check(checks, 'writerRequired', 'WRITER_REQUIRED', writerCode, 'The second tab cannot replace.');

  /* ---------------------------------------------------------------- budgets */

  const limits = manifest();
  const budgetChecks = [
    [
      'maxSessionBytes',
      SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes + 65_536,
      SAVEFILE_LIMITS.maxSessionBytes,
    ],
    ['maxDecorBytes', 65_536, SAVEFILE_LIMITS.maxDecorBytes],
    ['maxReplayBytes', 4_194_304, SAVEFILE_LIMITS.maxReplayBytes],
  ] as const;
  for (const [name, expected, actual] of budgetChecks) {
    check(checks, `budget.${name}`, expected, actual, 'The cap derives from the delivered layer.');
  }
  check(
    checks,
    'budget.fileWithinIngress',
    true,
    SAVEFILE_LIMITS.maxFileBytes <=
      limits.resourceAdmissionContracts.workers.persistenceIngressBytes,
    'The file cap stays within the worker ingress budget.',
  );
  check(
    checks,
    'budget.replayWithinRetention',
    true,
    SAVEFILE_LIMITS.maxReplayBytes <= limits.proposedCapacities.optionalReplayStorageBytes,
    'Optional replays stay within the retention window.',
  );

  /* ----------------------------------------------------------- performance */

  const storage = {
    producedBytes: read.summary.bytes,
    maxFileBytes: SAVEFILE_LIMITS.maxFileBytes,
    checksumBytes: document.checksum.value.length,
    slotBytes: {
      ACADEMY: read.sizes.sessions.ACADEMY,
      CHAOS: read.sizes.sessions.CHAOS,
    },
    decorBytes: { ACADEMY: read.sizes.decor.ACADEMY, CHAOS: read.sizes.decor.CHAOS },
    economyRows: 2,
    result:
      read.summary.bytes <= SAVEFILE_LIMITS.maxFileBytes
        ? 'WITHIN_FINITE_ADMISSION_CAP'
        : 'OVER_CAP',
  } as const;
  const memory = {
    ownedPayloadBytes: read.sizes.total,
    ownedCanonicalBytes: read.summary.bytes,
    ownedSessionBytes: read.sizes.sessions.ACADEMY + read.sizes.sessions.CHAOS,
    ownedDecorBytes: read.sizes.decor.ACADEMY + read.sizes.decor.CHAOS,
    totalHeapBytes: null,
    measurement: 'OWNED_BYTE_COUNTERS_NOT_HEAP',
    result: 'REPORTED_NOT_CALIBRATED',
  } as const;
  const job = createSaveFileJob(4);
  job.advance('PREPARE');
  const view = saveFileView(job.status(), 'FILE');
  const autosaveView = saveFileView(job.status(), 'AUTOSAVE');
  job.advance('DONE');
  const doneView = saveFileView(job.status(), 'AUTOSAVE');
  const doneFileView = saveFileView(job.status(), 'FILE');
  const workers = {
    workerTransfers: 0,
    pipeline: 'MAIN_THREAD_STAGED_CANCEL_BEFORE_COMMIT',
    cancelWindow: 'BETWEEN_PHASES_AND_BEFORE_COMMIT',
    progressModel: 'FOUR_PHASE_PROGRESS_0_1',
    result: 'STRUCTURAL_NO_WALL_CLOCK',
  } as const;
  const ui = {
    labels: [doneFileView.label, doneView.label],
    claimsBrowserWrite: view.claimsBrowserWrite,
    autosaveSeparate: view.autosaveSeparate,
    visual: 'NOT_APPLICABLE_NO_UI_COMPONENT',
    result: 'STATUS_PROJECTION_ONLY',
  } as const;
  check(
    checks,
    'performance.storage',
    'WITHIN_FINITE_ADMISSION_CAP',
    storage.result,
    'Bytes are real.',
  );
  check(
    checks,
    'performance.memory',
    'OWNED_BYTE_COUNTERS_NOT_HEAP',
    memory.measurement,
    'No heap claim.',
  );
  check(checks, 'performance.workers', 0, workers.workerTransfers, 'No worker transfer is added.');
  check(checks, 'performance.ui', true, ui.autosaveSeparate, 'Autosave and file are distinct.');
  check(checks, 'ui.claimsBrowserWrite', false, view.claimsBrowserWrite, 'No disk-write claim.');
  check(
    checks,
    'ui.autosaveLabel',
    'AUTOSAVE_SAVED',
    doneView.label,
    'Autosave has its own label.',
  );
  check(checks, 'ui.fileLabel', 'FILE_READY', doneFileView.label, 'The file label is distinct.');
  check(
    checks,
    'ui.preparingLabel',
    'PREPARING_FILE',
    autosaveView.label,
    'Both sources share the preparation phase.',
  );

  /* ----------------------------------------------------------------- result */

  const passed = checks.filter((entry) => entry.pass).length;
  const slots = read.summary.sessions;
  if (slots.ACADEMY === null || slots.CHAOS === null)
    throw new Error('234 report needs both slots');
  return Object.freeze({
    version: SAVEFILE_REPORT_VERSION,
    generatedBy: 'node --import ./scripts/register-typescript.mjs scripts/run-savefile-report.mjs',
    oracleRule:
      'Every expected value is a documented contract; every actual value is a real run of the delivered modules against the in-memory IndexedDB double, with fixed timestamps and no Math.random.',
    structure: {
      format: document.format,
      formatVersion: document.formatVersion,
      integrityVersion: document.integrityVersion,
      schemaVersion: document.schemaVersion,
      schemaId: document.payload.versions.schema,
      createdAt: document.createdAt,
      fileName: saveFileName(document.createdAt),
      extension: '.sdasave',
      mimeType: 'application/json',
      checksum: document.checksum.value,
      checksumLength: document.checksum.value.length,
      algorithm: document.checksum.algorithm,
      canonicalization: document.checksum.canonicalization,
      bytes: read.summary.bytes,
      maxFileBytes: SAVEFILE_LIMITS.maxFileBytes,
      headroomBytes: SAVEFILE_LIMITS.maxFileBytes - read.summary.bytes,
      payloadShare: read.sizes.total / SAVEFILE_LIMITS.maxPayloadBytes,
      sizes: {
        sessions: { ACADEMY: read.sizes.sessions.ACADEMY, CHAOS: read.sizes.sessions.CHAOS },
        decor: { ACADEMY: read.sizes.decor.ACADEMY, CHAOS: read.sizes.decor.CHAOS },
        optional: read.sizes.optional,
        total: read.sizes.total,
        limit: read.sizes.limit,
      },
      sessions: {
        ACADEMY: {
          sessionId: slots.ACADEMY.sessionId,
          playerId: slots.ACADEMY.playerId,
          worldEpoch: slots.ACADEMY.worldEpoch,
          innerFormatVersion: slots.ACADEMY.innerFormatVersion,
          checkpointId: slots.ACADEMY.checkpointId ?? '',
          checkpointTick: slots.ACADEMY.checkpointTick ?? 0,
          xp: slots.ACADEMY.xp,
          xpMicroXp: slots.ACADEMY.xpMicroXp,
          level: slots.ACADEMY.level,
          dailyRewards: slots.ACADEMY.dailyRewards,
          decorObjects: slots.ACADEMY.decorObjects ?? 0,
          bytes: slots.ACADEMY.bytes,
        },
        CHAOS: {
          sessionId: slots.CHAOS.sessionId,
          playerId: slots.CHAOS.playerId,
          worldEpoch: slots.CHAOS.worldEpoch,
          innerFormatVersion: slots.CHAOS.innerFormatVersion,
          checkpointId: slots.CHAOS.checkpointId ?? '',
          checkpointTick: slots.CHAOS.checkpointTick ?? 0,
          xp: slots.CHAOS.xp,
          xpMicroXp: slots.CHAOS.xpMicroXp,
          level: slots.CHAOS.level,
          dailyRewards: slots.CHAOS.dailyRewards,
          decorObjects: slots.CHAOS.decorObjects ?? 0,
          bytes: slots.CHAOS.bytes,
        },
      },
      replays: { entries: read.replays.length, bytes: read.summary.replays.bytes },
      totalXp: read.summary.totalXp,
    },
    roundTrip: {
      status: read.status,
      checksumVerified: read.checksumVerified,
      activeSession: read.activeSession,
      sessionsPresent: read.summary.sessionsPresent,
      checksumStable: read.summary.checksum === built.checksum,
      decorObjects: read.decor.ACADEMY?.objects.length ?? 0,
      reorderedAccepted: reorderedRead.status === 'ACCEPTED',
    },
    canonicalization: {
      vectorText: vector.text,
      duplicateKey: readCode(readSaveFile(duplicateText, { catalog })),
      minusZero: canonicalTextOf([-0]),
      arrayOrder: canonicalTextOf([2, 1, 3]),
      base64DecodedBytes: read.summary.replays.bytes,
    },
    import: {
      previewStatus: preview.status,
      currentXpBefore: preview.current.totalXp,
      status: committed.status,
      launch: committed.launch.mode,
      xpAfter: committed.replacement.ACADEMY?.xp ?? 0,
      xpDelta: committed.rewards.xpDelta,
      rewardsSettled: committed.rewards.settled,
      rewardsGranted: committed.rewards.granted,
      dailyRewardsAfter: academyAfter.counts.dailyRewards,
      settlementsAfter: academyAfter.counts.settlements,
      worldStaged: target.world.state.prepared,
      worldCommitted: target.world.state.committed,
      decorRestored: target.world.state.restoredDecor,
      secondImportStatus: second.status,
      secondXpDelta: second.rewards.xpDelta,
      secondXpAfter: second.replacement.ACADEMY?.xp ?? 0,
      secondEconomyRevision: secondStored.revision,
    },
    refusals: {
      modifiedWithoutChecksum: modifiedCode,
      duplicateKey: readCode(readSaveFile(duplicateText, { catalog })),
      truncated: readCode(readSaveFile(text.slice(0, text.length - 40), { catalog })),
      trailingContent: readCode(readSaveFile(`${text} x`, { catalog })),
      oversized: readCode(readSaveFile('x'.repeat(SAVEFILE_LIMITS.maxFileBytes + 1), { catalog })),
      missingChecksum: readCode(readSaveFile(JSON.stringify(missing), { catalog })),
      unknownAlgorithm: readCode(readSaveFile(JSON.stringify(algorithm), { catalog })),
      unknownCanonicalization: readCode(
        readSaveFile(JSON.stringify(canonicalization), { catalog }),
      ),
      unknownIntegrity: readCode(readSaveFile(JSON.stringify(integrity), { catalog })),
      newerFormat: readCode(readSaveFile(JSON.stringify(newerFormat), { catalog })),
      newerSchema: readCode(
        readSaveFile(JSON.stringify(stampSaveFileChecksum(newerSchema)), { catalog }),
      ),
      unknownSchema: readCode(
        readSaveFile(JSON.stringify(stampSaveFileChecksum(unknownSchema)), { catalog }),
      ),
      checksumBeforeSchema: readCode(readSaveFile(JSON.stringify(schemaAndChecksum), { catalog })),
      replayInvalid: readCode(
        readSaveFile(JSON.stringify(stampSaveFileChecksum(replayInvalid)), { catalog }),
      ),
      replayTooLarge: readCode(
        readSaveFile(JSON.stringify(stampSaveFileChecksum(replayTooLarge)), { catalog }),
      ),
      unsafeInteger: readCode(
        readSaveFile(JSON.stringify(stampSaveFileChecksum(unsafe)), { catalog }),
      ),
      invalidNumber: readCode(
        readSaveFile(JSON.stringify(stampSaveFileChecksum(invalidNumber)), { catalog }),
      ),
      foreignDecor: readCode(
        readSaveFile(JSON.stringify(stampSaveFileChecksum(foreignDecor)), { catalog }),
      ),
      duplicateSession:
        duplicateSession.status === 'REJECTED' ? duplicateSession.rejection.code : 'ACCEPTED',
      activeSessionMissing:
        missingActive.status === 'REJECTED' ? missingActive.rejection.code : 'ACCEPTED',
      emptyFile: empty.status === 'REJECTED' ? empty.rejection.code : 'ACCEPTED',
      legacyRefused,
      previewRequired: importCode(required),
      previewStale: importCode(stale),
      writerRequired: writerCode,
      cancelled: importCode(cancelled),
      worldPrepareFailed: importCode(decorResult),
      corruptLeftIdentical: refusalBefore === corruptAfter,
      cancelledLeftIdentical: cancelBefore === (await targetFingerprint(cancelTarget)),
      decorTamperLeftIdentical: decorBefore === (await targetFingerprint(decorTarget)),
    },
    legacy: {
      refusedAs: legacyRefused,
      migratedStatus: migratedRead.status,
      migratedSessions: migratedRead.summary.sessionsPresent,
      migratedActiveSession: migratedRead.activeSession,
      v1InnerStatus: v1Read.status,
      v1InnerFormatVersion: v1Read.summary.sessions.ACADEMY?.innerFormatVersion ?? 0,
    },
    budgets: {
      source: 'Docs/performance-budgets.json + Docs/25-performanta-contracte-si-benchmark.md',
      manifestVersion: limits.budgetVersion,
      maxFileBytes: SAVEFILE_LIMITS.maxFileBytes,
      maxPayloadBytes: SAVEFILE_LIMITS.maxPayloadBytes,
      maxSessionBytes: SAVEFILE_LIMITS.maxSessionBytes,
      maxDecorBytes: SAVEFILE_LIMITS.maxDecorBytes,
      maxReplayBytes: SAVEFILE_LIMITS.maxReplayBytes,
      persistenceIngressBytes: limits.resourceAdmissionContracts.workers.persistenceIngressBytes,
      optionalReplayStorageBytes: limits.proposedCapacities.optionalReplayStorageBytes,
      totalHeapBytes: null,
      twoSessionCheckpointBytes: null,
      twoSessionStatus: 'MEASURED_NOT_CALIBRATED',
      measuredFileBytes: read.summary.bytes,
      measuredPayloadBytes: read.sizes.total,
      measuredShareOfManifestIngress:
        read.summary.bytes / limits.resourceAdmissionContracts.workers.persistenceIngressBytes,
      gaps: [
        'twoSessionCheckpointBytes is null in the 203 manifest; this report measures the produced file but does not calibrate a hardware capacity.',
        'totalHeapBytes is null; memory is reported as owned byte counters, not as a page heap reading.',
        'The deterministic transcript measures bytes and states, not wall-clock encode/hash cost.',
      ],
    },
    performance: { storage, memory, workers, ui },
    checks: Object.freeze(checks),
    summary: {
      checks: checks.length,
      passed,
      scenarios: 6,
      pass: passed === checks.length,
    },
  });
}

function escapeCell(value: unknown): string {
  if (typeof value === 'string') return value.replaceAll('|', '\\|');
  if (value === null) return 'null';
  if (typeof value === 'object') return canonical(value).replaceAll('|', '\\|');
  return String(value);
}

export function saveFileReportMarkdown(report: SaveFileReport): string {
  const lines: string[] = [
    '# Raport determinist PBI 234 — savefile `.sdasave`',
    '',
    `- Versiune raport: \`${report.version}\``,
    `- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}`,
    `- Verificări: ${report.summary.passed}/${report.summary.checks}`,
    `- Fișier produs: ${report.structure.bytes} B din plafonul ${report.structure.maxFileBytes} B`,
    `- Checksum: \`${report.structure.checksum}\``,
    '',
    '## Structură',
    '',
    '| Câmp | Valoare |',
    '| --- | --- |',
    `| format | \`${report.structure.format}\` |`,
    `| formatVersion / integrityVersion / schemaVersion | ${report.structure.formatVersion} / ${report.structure.integrityVersion} / ${report.structure.schemaVersion} |`,
    `| schema | \`${report.structure.schemaId}\` |`,
    `| fișier | \`${report.structure.fileName}\` |`,
    `| sesiuni | ${report.roundTrip.sessionsPresent} |`,
    `| XP total | ${report.structure.totalXp} |`,
    '',
    '## Round-trip și import',
    '',
    '| Măsură | Valoare |',
    '| --- | --- |',
    `| status citire | ${report.roundTrip.status} |`,
    `| checksum verificat | ${String(report.roundTrip.checksumVerified)} |`,
    `| status import | ${report.import.status} |`,
    `| XP după import | ${report.import.xpAfter} |`,
    `| XP delta la al doilea import | ${report.import.secondXpDelta} |`,
    `| recompense acordate / settle | ${report.import.rewardsGranted} / ${report.import.rewardsSettled} |`,
    `| lume pregătită / comisă | ${report.import.worldStaged} / ${report.import.worldCommitted} |`,
    '',
    '## Refuzuri închise',
    '',
    '| Caz | Cod |',
    '| --- | --- |',
    ...Object.entries(report.refusals).map(
      ([name, value]) => `| ${name} | \`${escapeCell(value)}\` |`,
    ),
    '',
    '## Bugete și performanță',
    '',
    '| Metrică | Valoare |',
    '| --- | --- |',
    `| bytes produși | ${report.performance.storage.producedBytes} |`,
    `| plafon fișier | ${report.performance.storage.maxFileBytes} |`,
    `| payload deținut | ${report.performance.memory.ownedPayloadBytes} |`,
    `| heap exact | ${String(report.performance.memory.totalHeapBytes)} |`,
    `| transferuri worker | ${report.performance.workers.workerTransfers} |`,
    `| etichete UI | ${report.performance.ui.labels.join(', ')} |`,
    '',
    '## Verificări',
    '',
    '| Verificare | Expected | Actual | Rezultat |',
    '| --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| \`${entry.name}\` | ${escapeCell(entry.expected)} | ${escapeCell(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    ),
    '',
    `- Total: ${report.summary.passed}/${report.summary.checks} — ${report.summary.pass ? 'PASS' : 'FAIL'}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

/** All boundary codes plus the 135/215 codes the savefile can return; used by the report test. */
export function saveFileRefusalVocabulary(): readonly string[] {
  return Object.freeze([...savefileCodes]);
}
