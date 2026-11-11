import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  sha256Hex,
} from './canonical-json';
import { PERSISTENCE_LIMITS, PersistenceError } from './contracts';
import type { PersistenceStoreName } from './contracts';
import {
  ECONOMY_SAVE_LIMITS,
  commitEconomySaveRows,
  deleteEconomySaveRows,
  economySaveCodes,
  loadEconomySave,
  readEconomySave,
} from './economy-save';
import type { EconomySaveCode, EconomySaveDocument, EconomySaveValidation } from './economy-save';
import type { TransactionPort } from './ports';
import type { ProfileTransactionHooks } from './profile-transaction';
import { measureJsonBytes } from './records';
import type { LocalRepository } from './repository';
import {
  SESSION_ARCHIVE_FORMAT,
  SESSION_ARCHIVE_LIMITS,
  SESSION_ARCHIVE_VERSION,
  SessionArchiveError,
  exportSessionArchive,
  readSessionArchive,
  sessionArchiveRejectionCodes,
} from './session-archive';
import type {
  SessionArchiveDocument,
  SessionArchiveExpectation,
  SessionArchiveRejectionCode,
  SessionArchiveSession,
  SessionArchiveValidation,
  SessionArchiveValidationAccepted,
  SessionArchiveVersions,
} from './session-archive';
import { SESSION_ARCHIVE_IMPORT_STORES, commitSessionArchiveRows } from './session-archive-import';
import type { SessionArchiveTransactionRunner } from './session-archive-import';

/**
 * Session archive format version 2: the 135 archive plus the 215 economy bundle (PBI 215).
 *
 * The 135 document is the session: checkpoint, progress, campaign, settings, profile reference and
 * scenarios. Format version 2 adds exactly one component — `economy` — and nothing else:
 *
 * 1. **Additive and versioned.** A version 1 document still goes through the 135 reader itself, so an
 *    older file is never interpreted with version 2 rules; it is reported as `LEGACY`. A version 2
 *    document is refused by an older build with `FORMAT_VERSION_TOO_NEW` instead of being read
 *    optimistically. The inner 135 document keeps its own checksum, component parsers and size
 *    ledger; the version 2 envelope adds only its own checksum over the pair.
 * 2. **One generation.** The inner session and the economy bundle must name the same session, player
 *    and world epoch. A bundle from another session is refused, not merged.
 * 3. **Replace, never merge.** The import runs one transaction over the 135 stores plus the `meta`
 *    store the bundle lives in: the 135 replacement writes the session components, then the bundle
 *    row is written or removed. A version 1 archive imports the session and leaves the economy row
 *    untouched (`UNCHANGED`), because that file never carried economy data.
 * 4. **No reward call exists here.** The XP ledger and the daily reward registry travel as documents;
 *    importing them twice writes the same bytes, so a second import cannot double XP or a reward.
 */

/** Contract id of the extended archive. */
export const SESSION_ARCHIVE_ECONOMY_VERSION = '215-session-archive-economy-v1' as const;

/** Format version 2 of the session archive family. */
export const SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION = 2 as const;
export const SESSION_ARCHIVE_ECONOMY_SCHEMA_VERSION = 2 as const;

/** The slots of the version 2 document. */
export const sessionArchiveEconomyComponents = ['session', 'economy'] as const;
export type SessionArchiveEconomyComponentName = (typeof sessionArchiveEconomyComponents)[number];

/**
 * Fixed budgets, derived from the delivered ones: the 135 archive keeps its total, the economy
 * bundle keeps its 127 record budget, and the version 2 envelope adds only the envelope itself.
 */
export const SESSION_ARCHIVE_ECONOMY_LIMITS = Object.freeze({
  /** Canonical UTF-16 code units of the whole version 2 document. */
  maxFileBytes:
    SESSION_ARCHIVE_LIMITS.maxTotalBytes + ECONOMY_SAVE_LIMITS.maxDocumentBytes + 65_536,
  /** Canonical UTF-8 bytes of the inner 135 document (its components plus its own envelope). */
  sessionBytes: SESSION_ARCHIVE_LIMITS.maxTotalBytes + 4_096,
  /** Canonical UTF-8 bytes of the economy bundle. */
  economyBytes: ECONOMY_SAVE_LIMITS.maxDocumentBytes,
  /** Sum of the two slots. */
  maxTotalBytes:
    SESSION_ARCHIVE_LIMITS.maxTotalBytes + 4_096 + ECONOMY_SAVE_LIMITS.maxDocumentBytes,
  maxDepth: Math.max(SESSION_ARCHIVE_LIMITS.maxDepth, ECONOMY_SAVE_LIMITS.maxDepth) + 2,
});

/** Closed refusal vocabulary: every 135 and 215 economy code plus the version 2 boundary. */
export type SessionArchiveEconomyCode =
  | SessionArchiveRejectionCode
  | EconomySaveCode
  | 'LEGACY_ARCHIVE'
  | 'ARCHIVE_FORMAT_MISMATCH'
  | 'ECONOMY_READ_FAILED'
  | 'ECONOMY_WRITE_FAILED'
  | 'ECONOMY_IMPORT_MISMATCH'
  | 'WRITER_REQUIRED'
  | 'REPOSITORY_CLOSED'
  | 'IMPORT_WRITE_FAILED'
  | 'STORAGE_FULL'
  | 'TRANSACTION_ABORTED';

export const sessionArchiveEconomyCodes: readonly SessionArchiveEconomyCode[] = Object.freeze([
  ...new Set<string>([
    ...sessionArchiveRejectionCodes,
    ...economySaveCodes,
    'LEGACY_ARCHIVE',
    'ARCHIVE_FORMAT_MISMATCH',
    'ECONOMY_READ_FAILED',
    'ECONOMY_WRITE_FAILED',
    'ECONOMY_IMPORT_MISMATCH',
    'WRITER_REQUIRED',
    'REPOSITORY_CLOSED',
    'IMPORT_WRITE_FAILED',
    'STORAGE_FULL',
    'TRANSACTION_ABORTED',
  ]),
] as SessionArchiveEconomyCode[]);

export interface SessionArchiveEconomyRejection {
  readonly code: SessionArchiveEconomyCode;
  readonly message: string;
  readonly path: string;
}

export class SessionArchiveEconomyError extends Error {
  readonly code: SessionArchiveEconomyCode;
  readonly path: string;

  constructor(code: SessionArchiveEconomyCode, message: string, path: string) {
    super(message);
    this.name = 'SessionArchiveEconomyError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: SessionArchiveEconomyCode, message: string, path: string): never {
  throw new SessionArchiveEconomyError(code, message, path);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_FIELD', 'Expected a plain object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_FIELD', 'Expected plain data, not a class instance', path);
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  const data = object(value, path);
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) fail('UNKNOWN_FIELD', `Unknown field: ${key}`, `${path}.${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(data, key)) fail('MISSING_FIELD', `Missing field: ${key}`, `${path}.${key}`);
  }
  return data;
}

function identity(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    value.trim() !== value
  ) {
    fail('INVALID_IDENTITY', 'Expected a bounded identity', path);
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_COUNTER', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function timestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
    fail('INVALID_TIMESTAMP', 'Expected a UTC ISO 8601 timestamp', path);
  }
  return value;
}

function versionText(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PERSISTENCE_LIMITS.maxTextCodeUnits
  ) {
    fail('INVALID_IDENTITY', 'Expected a bounded version text', path);
  }
  return value;
}

function canonicalText(value: unknown, path: string): string {
  const canonical = canonicalizeJson(value, { maxDepth: SESSION_ARCHIVE_ECONOMY_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    fail(
      canonical.rejection.code === 'UNSAFE_KEY' ? 'UNKNOWN_FIELD' : 'CANONICALIZATION_FAILED',
      `The ${path} value is not canonical: ${canonical.rejection.message}`,
      path,
    );
  }
  return canonical.text;
}

function rejectionOf(error: unknown): SessionArchiveEconomyRejection {
  if (error instanceof SessionArchiveEconomyError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  if (error instanceof SessionArchiveError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  if (error instanceof PersistenceError) {
    const code: SessionArchiveEconomyCode =
      error.code === 'WRITER_REQUIRED'
        ? 'WRITER_REQUIRED'
        : error.code === 'REPOSITORY_CLOSED' || error.code === 'REPOSITORY_DISPOSED'
          ? 'REPOSITORY_CLOSED'
          : error.code === 'STORAGE_FULL'
            ? 'STORAGE_FULL'
            : error.code === 'TRANSACTION_ABORTED'
              ? 'TRANSACTION_ABORTED'
              : 'ECONOMY_WRITE_FAILED';
    return Object.freeze({
      code,
      message: `${error.code}: ${error.message}`,
      path: error.path ?? '$',
    });
  }
  return Object.freeze({ code: 'ECONOMY_WRITE_FAILED', message: describe(error), path: '$' });
}

/* -------------------------------------------------------------------- the shape */

export type SessionArchiveEconomySession = SessionArchiveSession;

export interface SessionArchiveEconomySizes {
  readonly session: number;
  readonly economy: number;
  readonly total: number;
  readonly limit: number;
}

export interface SessionArchiveEconomyChecksum {
  readonly algorithm: typeof CHECKSUM_ALGORITHM;
  readonly canonicalization: typeof CANONICALIZATION_VERSION;
  readonly value: string;
}

export interface SessionArchiveEconomyDocument {
  readonly format: typeof SESSION_ARCHIVE_FORMAT;
  readonly formatVersion: typeof SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION;
  readonly schemaVersion: typeof SESSION_ARCHIVE_ECONOMY_SCHEMA_VERSION;
  readonly units: 'SI';
  readonly createdAt: string;
  readonly versions: SessionArchiveVersions;
  readonly session: SessionArchiveEconomySession;
  readonly components: Readonly<{
    session: SessionArchiveDocument;
    economy: EconomySaveDocument | null;
  }>;
  readonly sizes: SessionArchiveEconomySizes;
  readonly checksum: SessionArchiveEconomyChecksum;
}

/** What the version 2 document carries; a version 1 file reports zero economy quantities. */
export interface SessionArchiveEconomyCounts {
  readonly settlements: number;
  readonly reviews: number;
  readonly kpiDays: number;
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
  readonly dailyRewards: number;
  readonly historyScans: 0;
  readonly debits: 0;
  readonly negativeCredits: false;
}

export interface SessionArchiveEconomyAccepted {
  readonly version: typeof SESSION_ARCHIVE_ECONOMY_VERSION;
  readonly status: 'ACCEPTED';
  readonly formatVersion: typeof SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION;
  readonly document: SessionArchiveEconomyDocument;
  readonly checksumVerified: true;
  readonly session: SessionArchiveSession;
  readonly archive: SessionArchiveValidationAccepted;
  readonly economy: EconomySaveDocument | null;
  readonly economyValidation: EconomySaveValidation | null;
  readonly sizes: SessionArchiveEconomySizes;
  readonly counts: SessionArchiveEconomyCounts;
  readonly bytes: number;
  readonly rejection: null;
}

/** A version 1 archive: the session is readable and never carried an economy component. */
export interface SessionArchiveEconomyLegacy {
  readonly version: typeof SESSION_ARCHIVE_ECONOMY_VERSION;
  readonly status: 'LEGACY';
  readonly formatVersion: 1;
  readonly document: null;
  readonly checksumVerified: true;
  readonly session: SessionArchiveSession;
  readonly archive: SessionArchiveValidationAccepted;
  readonly economy: null;
  readonly economyValidation: null;
  readonly sizes: null;
  readonly counts: SessionArchiveEconomyCounts;
  readonly bytes: number;
  readonly rejection: null;
}

export interface SessionArchiveEconomyRejected {
  readonly version: typeof SESSION_ARCHIVE_ECONOMY_VERSION;
  readonly status: 'REJECTED';
  readonly formatVersion: null;
  readonly document: null;
  readonly checksumVerified: false;
  readonly session: null;
  readonly archive: null;
  readonly economy: null;
  readonly economyValidation: null;
  readonly sizes: null;
  readonly counts: null;
  readonly bytes: 0;
  readonly rejection: SessionArchiveEconomyRejection;
}

export type SessionArchiveEconomyValidation =
  SessionArchiveEconomyAccepted | SessionArchiveEconomyLegacy | SessionArchiveEconomyRejected;

export type SessionArchiveEconomyExpectation = SessionArchiveExpectation;

function zeroCounts(): SessionArchiveEconomyCounts {
  return Object.freeze({
    settlements: 0,
    reviews: 0,
    kpiDays: 0,
    xpBalance: 0,
    xpBalanceMicroXp: 0,
    level: 0,
    dailyRewards: 0,
    historyScans: 0 as const,
    debits: 0 as const,
    negativeCredits: false as const,
  });
}

function countsOf(validation: EconomySaveValidation | null): SessionArchiveEconomyCounts {
  if (validation === null || validation.status === 'REJECTED') return zeroCounts();
  const counts = validation.counts;
  return Object.freeze({
    settlements: counts.settlements,
    reviews: counts.reviews,
    kpiDays: counts.kpiDays,
    xpBalance: counts.xpBalance,
    xpBalanceMicroXp: counts.xpBalanceMicroXp,
    level: counts.level,
    dailyRewards: counts.dailyRewards,
    historyScans: 0 as const,
    debits: 0 as const,
    negativeCredits: false as const,
  });
}

/* ------------------------------------------------------------------- checksum */

function checksumPayload(document: Omit<SessionArchiveEconomyDocument, 'checksum'>): unknown {
  return {
    format: document.format,
    formatVersion: document.formatVersion,
    schemaVersion: document.schemaVersion,
    units: document.units,
    createdAt: document.createdAt,
    versions: document.versions,
    session: document.session,
    components: document.components,
    sizes: document.sizes,
  };
}

export function computeSessionArchiveEconomyChecksum(
  document: Omit<SessionArchiveEconomyDocument, 'checksum'> | SessionArchiveEconomyDocument,
): string {
  const payload = checksumPayload(document as Omit<SessionArchiveEconomyDocument, 'checksum'>);
  return sha256Hex(canonicalText(payload, 'checksum'));
}

export function stampSessionArchiveEconomyChecksum(
  document: Omit<SessionArchiveEconomyDocument, 'checksum'> | SessionArchiveEconomyDocument,
): SessionArchiveEconomyDocument {
  const payload = document as Omit<SessionArchiveEconomyDocument, 'checksum'>;
  return Object.freeze({
    ...payload,
    checksum: Object.freeze({
      algorithm: CHECKSUM_ALGORITHM,
      canonicalization: CANONICALIZATION_VERSION,
      value: computeSessionArchiveEconomyChecksum(payload),
    }),
  });
}

/** Canonical digest of a version 2 document, for the evidence transcript. */
export function sessionArchiveEconomyDigest(document: SessionArchiveEconomyDocument): string {
  return sha256Hex(canonicalText(document, 'document'));
}

/* ---------------------------------------------------------------- size ledger */

function measured(value: unknown, path: string): number {
  try {
    return measureJsonBytes(value, path);
  } catch (error) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The ${path} component cannot be measured within its budget: ${describe(error)}`,
      path,
    );
  }
}

export function sessionArchiveEconomySizes(
  session: SessionArchiveDocument,
  economy: EconomySaveDocument | null,
): SessionArchiveEconomySizes {
  const sessionBytes = measured(session, 'session');
  const economyBytes = measured(economy, 'economy');
  return Object.freeze({
    session: sessionBytes,
    economy: economyBytes,
    total: sessionBytes + economyBytes,
    limit: SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes,
  });
}

function enforceBudgets(sizes: SessionArchiveEconomySizes): void {
  if (sizes.session > SESSION_ARCHIVE_ECONOMY_LIMITS.sessionBytes) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The session component has ${sizes.session} bytes, above its ${SESSION_ARCHIVE_ECONOMY_LIMITS.sessionBytes} byte budget`,
      'components.session',
    );
  }
  if (sizes.economy > SESSION_ARCHIVE_ECONOMY_LIMITS.economyBytes) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The economy component has ${sizes.economy} bytes, above its ${SESSION_ARCHIVE_ECONOMY_LIMITS.economyBytes} byte budget`,
      'components.economy',
    );
  }
  if (sizes.total > sizes.limit) {
    fail(
      'FILE_TOO_LARGE',
      `The version 2 archive declares ${sizes.total} bytes against a ${sizes.limit} byte limit`,
      'sizes.total',
    );
  }
}

/* -------------------------------------------------------------------- builder */

export interface SessionArchiveEconomyBuildInput {
  readonly archive: SessionArchiveDocument;
  readonly economy: EconomySaveDocument | null;
  readonly createdAt: string;
  readonly catalog: unknown;
}

export interface SessionArchiveEconomyBuildAccepted {
  readonly version: typeof SESSION_ARCHIVE_ECONOMY_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: SessionArchiveEconomyDocument;
  readonly checksum: string;
  readonly sizes: SessionArchiveEconomySizes;
  readonly counts: SessionArchiveEconomyCounts;
  readonly bytes: number;
  readonly rejection: null;
}

export interface SessionArchiveEconomyBuildRejected {
  readonly version: typeof SESSION_ARCHIVE_ECONOMY_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksum: null;
  readonly sizes: null;
  readonly counts: null;
  readonly bytes: 0;
  readonly rejection: SessionArchiveEconomyRejection;
}

export type SessionArchiveEconomyBuildResult =
  SessionArchiveEconomyBuildAccepted | SessionArchiveEconomyBuildRejected;

function buildRejected(
  rejection: SessionArchiveEconomyRejection,
): SessionArchiveEconomyBuildRejected {
  return Object.freeze({
    version: SESSION_ARCHIVE_ECONOMY_VERSION,
    status: 'REJECTED' as const,
    document: null,
    checksum: null,
    sizes: null,
    counts: null,
    bytes: 0 as const,
    rejection: Object.freeze(rejection),
  });
}

function readVersions(value: unknown): SessionArchiveVersions {
  const data = exact(value, ['engine', 'physics', 'map'], 'versions');
  return Object.freeze({
    engine: versionText(data.engine, 'versions.engine'),
    physics: versionText(data.physics, 'versions.physics'),
    map: versionText(data.map, 'versions.map'),
  });
}

function readSession(value: unknown): SessionArchiveSession {
  const data = exact(value, ['sessionId', 'playerId', 'worldEpoch'], 'session');
  return Object.freeze({
    sessionId: identity(data.sessionId, 'session.sessionId'),
    playerId: identity(data.playerId, 'session.playerId'),
    worldEpoch: integer(data.worldEpoch, 'session.worldEpoch'),
  });
}

/**
 * Builds the version 2 document from an already produced 135 document and an economy bundle.
 *
 * The 135 document is re-read by the 135 reader first and the bundle by 215's own reader, so the
 * builder never trusts a hand-made component set.
 */
export function buildSessionArchiveWithEconomy(
  input: SessionArchiveEconomyBuildInput,
): SessionArchiveEconomyBuildResult {
  try {
    const session = readSession(input.archive.session);
    const archive: SessionArchiveValidation = readSessionArchive(input.archive, {
      sessionId: session.sessionId,
      playerId: session.playerId,
      catalog: input.catalog,
    });
    if (archive.status === 'REJECTED') {
      fail(archive.rejection.code, archive.rejection.message, archive.rejection.path);
    }
    if (archive.session.worldEpoch !== session.worldEpoch) {
      fail(
        'SESSION_MISMATCH',
        'The archive envelope and the document disagree on the world epoch',
        'session.worldEpoch',
      );
    }
    let economy: EconomySaveDocument | null = null;
    let economyValidation: EconomySaveValidation | null = null;
    if (input.economy !== null) {
      const read = readEconomySave(input.economy, session);
      if (read.status === 'REJECTED') {
        fail(read.rejection.code, read.rejection.message, read.rejection.path);
      }
      economy = read.document;
      economyValidation = read;
    }
    const versions = readVersions(input.archive.versions);
    const createdAt = timestamp(input.createdAt, 'createdAt');
    const sizes = sessionArchiveEconomySizes(input.archive, economy);
    enforceBudgets(sizes);
    const payload = {
      format: SESSION_ARCHIVE_FORMAT,
      formatVersion: SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION,
      schemaVersion: SESSION_ARCHIVE_ECONOMY_SCHEMA_VERSION,
      units: 'SI' as const,
      createdAt,
      versions,
      session,
      components: Object.freeze({ session: input.archive, economy }),
      sizes,
    };
    const document = stampSessionArchiveEconomyChecksum(payload);
    const canonical = canonicalText(document, '$');
    if (canonical.length > SESSION_ARCHIVE_ECONOMY_LIMITS.maxFileBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The version 2 archive has ${canonical.length} code units, above the ${SESSION_ARCHIVE_ECONOMY_LIMITS.maxFileBytes} budget`,
        '$',
      );
    }
    return Object.freeze({
      version: SESSION_ARCHIVE_ECONOMY_VERSION,
      status: 'ACCEPTED' as const,
      document,
      checksum: document.checksum.value,
      sizes,
      counts: countsOf(economyValidation),
      bytes: canonical.length,
      rejection: null,
    });
  } catch (error) {
    return buildRejected(rejectionOf(error));
  }
}

/**
 * Additive migration of a version 1 archive into the version 2 shape.
 *
 * Every 135 component is copied unchanged — the inner document keeps its own checksum, so the
 * migration cannot alter the session — and the economy slot is added as `null` unless the caller
 * supplies a bundle. A file that already declares version 1 only; version 2 is not older data.
 */
export function upgradeSessionArchive(
  archive: SessionArchiveDocument,
  options: {
    readonly createdAt: string;
    readonly catalog: unknown;
    readonly economy?: EconomySaveDocument | null;
  },
): SessionArchiveEconomyBuildResult {
  try {
    if (archive.formatVersion !== 1) {
      fail(
        'UNSUPPORTED_FORMAT_VERSION',
        `The document already declares format version ${String(archive.formatVersion)}`,
        'formatVersion',
      );
    }
  } catch (error) {
    return buildRejected(rejectionOf(error));
  }
  return buildSessionArchiveWithEconomy({
    archive,
    economy: options.economy ?? null,
    createdAt: options.createdAt,
    catalog: options.catalog,
  });
}

/* --------------------------------------------------------------------- reader */

const envelopeFields: readonly string[] = [
  'format',
  'formatVersion',
  'schemaVersion',
  'units',
  'createdAt',
  'versions',
  'session',
  'components',
  'sizes',
  'checksum',
];

const sizeFields = ['session', 'economy', 'total', 'limit'] as const;

function readSizes(value: unknown): SessionArchiveEconomySizes {
  const data = exact(value, sizeFields, 'sizes');
  const sizes: Record<string, number> = Object.create(null);
  for (const field of sizeFields) sizes[field] = integer(data[field], `sizes.${field}`);
  const declared = sizes as unknown as SessionArchiveEconomySizes;
  if (declared.limit !== SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes) {
    fail(
      'SIZE_MISMATCH',
      `The archive declares a ${declared.limit} byte limit; this build accepts ${SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes}`,
      'sizes.limit',
    );
  }
  return Object.freeze(declared);
}

function rejectedValidation(
  rejection: SessionArchiveEconomyRejection,
): SessionArchiveEconomyRejected {
  return Object.freeze({
    version: SESSION_ARCHIVE_ECONOMY_VERSION,
    status: 'REJECTED' as const,
    formatVersion: null,
    document: null,
    checksumVerified: false as const,
    session: null,
    archive: null,
    economy: null,
    economyValidation: null,
    sizes: null,
    counts: null,
    bytes: 0 as const,
    rejection: Object.freeze(rejection),
  });
}

/**
 * Reads a version 1 or version 2 session archive.
 *
 * Version 1 goes through the 135 reader unchanged and is reported as `LEGACY`; version 2 is verified
 * here and its inner session by 135. Nothing is interpreted before its checksum, and a newer format
 * is refused before any component is read.
 */
export function readSessionArchiveWithEconomy(
  input: unknown,
  expect: SessionArchiveEconomyExpectation,
): SessionArchiveEconomyValidation {
  try {
    const envelope = object(input, '$');
    if (envelope.format !== SESSION_ARCHIVE_FORMAT) {
      fail(
        'UNSUPPORTED_FORMAT',
        `Unsupported archive format: ${String(envelope.format)}`,
        'format',
      );
    }
    const formatVersion = envelope.formatVersion;
    if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion)) {
      fail('UNSUPPORTED_FORMAT_VERSION', 'Expected an integer format version', 'formatVersion');
    }
    if (formatVersion === 1) {
      const legacy = readSessionArchive(input, expect);
      if (legacy.status === 'REJECTED') {
        fail(legacy.rejection.code, legacy.rejection.message, legacy.rejection.path);
      }
      return Object.freeze({
        version: SESSION_ARCHIVE_ECONOMY_VERSION,
        status: 'LEGACY' as const,
        formatVersion: 1 as const,
        document: null,
        checksumVerified: true as const,
        session: legacy.session,
        archive: legacy,
        economy: null,
        economyValidation: null,
        sizes: null,
        counts: zeroCounts(),
        bytes: legacy.bytes,
        rejection: null,
      });
    }
    if (formatVersion > SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION) {
      fail(
        'FORMAT_VERSION_TOO_NEW',
        `The file declares format version ${formatVersion}; this build reads ${SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION}`,
        'formatVersion',
      );
    }
    if (formatVersion !== SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION) {
      fail(
        'UNSUPPORTED_FORMAT_VERSION',
        `Unsupported archive format version: ${formatVersion}`,
        'formatVersion',
      );
    }
    const data = exact(envelope, envelopeFields, '$');
    const schemaVersion = data.schemaVersion;
    if (schemaVersion !== SESSION_ARCHIVE_ECONOMY_SCHEMA_VERSION) {
      fail(
        typeof schemaVersion === 'number' && schemaVersion > SESSION_ARCHIVE_ECONOMY_SCHEMA_VERSION
          ? 'SCHEMA_TOO_NEW'
          : 'UNSUPPORTED_SCHEMA',
        `Unsupported version 2 archive schema: ${String(schemaVersion)}`,
        'schemaVersion',
      );
    }
    if (data.units !== 'SI') {
      fail('INVALID_FIELD', 'The archive is stored in SI units only', 'units');
    }
    const canonical = canonicalText(data, '$');
    if (canonical.length > SESSION_ARCHIVE_ECONOMY_LIMITS.maxFileBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The version 2 archive has ${canonical.length} code units, above the ${SESSION_ARCHIVE_ECONOMY_LIMITS.maxFileBytes} budget`,
        '$',
      );
    }
    const checksumData = exact(
      data.checksum,
      ['algorithm', 'canonicalization', 'value'],
      'checksum',
    );
    if (checksumData.algorithm !== CHECKSUM_ALGORITHM) {
      fail(
        'UNSUPPORTED_ALGORITHM',
        `Unsupported checksum algorithm: ${String(checksumData.algorithm)}`,
        'checksum.algorithm',
      );
    }
    if (checksumData.canonicalization !== CANONICALIZATION_VERSION) {
      fail(
        'UNSUPPORTED_CANONICALIZATION',
        `Unsupported canonicalization: ${String(checksumData.canonicalization)}`,
        'checksum.canonicalization',
      );
    }
    const declaredChecksum = checksumData.value;
    if (typeof declaredChecksum !== 'string' || !SHA256_HEX.test(declaredChecksum)) {
      fail('CHECKSUM_MISMATCH', 'Expected a lowercase SHA-256 checksum', 'checksum.value');
    }
    const createdAt = timestamp(data.createdAt, 'createdAt');
    const versions = readVersions(data.versions);
    const session = readSession(data.session);
    if (session.sessionId !== expect.sessionId || session.playerId !== expect.playerId) {
      fail(
        'SESSION_MISMATCH',
        `The archive belongs to ${session.sessionId}/${session.playerId}, not ${expect.sessionId}/${expect.playerId}`,
        'session',
      );
    }
    if (expect.versions !== undefined) {
      for (const field of ['engine', 'physics', 'map'] as const) {
        const expected = expect.versions[field];
        if (expected !== undefined && versions[field] !== expected) {
          fail(
            'VERSION_MISMATCH',
            `The archive targets ${field} version ${versions[field]}, not ${expected}`,
            `versions.${field}`,
          );
        }
      }
    }
    const components = exact(data.components, sessionArchiveEconomyComponents, 'components');
    if (components.session === null) {
      fail(
        'MISSING_FIELD',
        'A version 2 archive needs the 135 session document',
        'components.session',
      );
    }
    const archive = readSessionArchive(components.session, expect);
    if (archive.status === 'REJECTED') {
      fail(archive.rejection.code, archive.rejection.message, archive.rejection.path);
    }
    if (
      archive.session.sessionId !== session.sessionId ||
      archive.session.playerId !== session.playerId ||
      archive.session.worldEpoch !== session.worldEpoch
    ) {
      fail(
        'SESSION_MISMATCH',
        'The inner 135 session is not the session of the version 2 envelope',
        'components.session.session',
      );
    }
    let economy: EconomySaveDocument | null = null;
    let economyValidation: EconomySaveValidation | null = null;
    if (components.economy !== null) {
      const read = readEconomySave(components.economy, {
        sessionId: session.sessionId,
        playerId: session.playerId,
        worldEpoch: session.worldEpoch,
      });
      if (read.status === 'REJECTED') {
        fail(read.rejection.code, read.rejection.message, read.rejection.path);
      }
      economy = read.document;
      economyValidation = read;
    }
    const declaredSizes = readSizes(data.sizes);
    const payload: Omit<SessionArchiveEconomyDocument, 'checksum'> = {
      format: SESSION_ARCHIVE_FORMAT,
      formatVersion: SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION,
      schemaVersion: SESSION_ARCHIVE_ECONOMY_SCHEMA_VERSION,
      units: 'SI',
      createdAt,
      versions,
      session,
      components: Object.freeze({ session: archive.document, economy }),
      sizes: declaredSizes,
    };
    if (computeSessionArchiveEconomyChecksum(payload) !== declaredChecksum) {
      fail(
        'CHECKSUM_MISMATCH',
        'The archive was modified or is corrupted; the session was not loaded',
        'checksum.value',
      );
    }
    const measuredSizes = sessionArchiveEconomySizes(archive.document, economy);
    enforceBudgets(measuredSizes);
    for (const field of sizeFields) {
      if (measuredSizes[field] !== declaredSizes[field]) {
        fail(
          'SIZE_MISMATCH',
          `The declared ${field} size is ${declaredSizes[field]}, measured ${measuredSizes[field]}`,
          `sizes.${field}`,
        );
      }
    }
    const document: SessionArchiveEconomyDocument = Object.freeze({
      ...payload,
      checksum: Object.freeze({
        algorithm: CHECKSUM_ALGORITHM,
        canonicalization: CANONICALIZATION_VERSION,
        value: declaredChecksum,
      }),
    });
    return Object.freeze({
      version: SESSION_ARCHIVE_ECONOMY_VERSION,
      status: 'ACCEPTED' as const,
      formatVersion: SESSION_ARCHIVE_ECONOMY_FORMAT_VERSION,
      document,
      checksumVerified: true as const,
      session,
      archive,
      economy,
      economyValidation,
      sizes: measuredSizes,
      counts: countsOf(economyValidation),
      bytes: canonical.length,
      rejection: null,
    });
  } catch (error) {
    return rejectedValidation(rejectionOf(error));
  }
}

/* -------------------------------------------------------------------- export */

export interface SessionArchiveEconomyExportOptions {
  readonly sessionId: string;
  readonly playerId: string;
  readonly createdAt: string;
  readonly catalog: unknown;
  readonly versions?: SessionArchiveVersions;
}

export type SessionArchiveEconomyExportResult =
  SessionArchiveEconomyBuildAccepted | SessionArchiveEconomyBuildRejected;

/** Accepted result of a version 2 export; the document is the build result. */
export type SessionArchiveEconomyExportAccepted = SessionArchiveEconomyBuildAccepted;

/**
 * Exports the session and its economy bundle from the durable stores.
 *
 * The repository is the only source: the 135 components come from the 127 stores, the economy bundle
 * comes from the `meta` row 215 wrote. Nothing is read from a live object, and nothing is written.
 */
export async function exportSessionArchiveWithEconomy(
  repository: LocalRepository,
  transactions: SessionArchiveTransactionRunner,
  options: SessionArchiveEconomyExportOptions,
): Promise<SessionArchiveEconomyExportResult> {
  try {
    const economy = await transactions.transact(['meta'], (transaction) =>
      loadEconomySave(transaction, {
        sessionId: options.sessionId,
        playerId: options.playerId,
      }),
    );
    const archive = await exportSessionArchive(repository, {
      sessionId: options.sessionId,
      playerId: options.playerId,
      createdAt: options.createdAt,
      catalog: options.catalog,
      ...(options.versions === undefined ? {} : { versions: options.versions }),
    });
    if (archive.status === 'REJECTED') {
      const rejection = archive.rejection;
      return buildRejected({
        code: rejection.code as SessionArchiveEconomyCode,
        message: rejection.message,
        path: rejection.path,
      });
    }
    return buildSessionArchiveWithEconomy({
      archive: archive.document,
      economy: economy.status === 'FOUND' ? economy.document : null,
      createdAt: options.createdAt,
      catalog: options.catalog,
    });
  } catch (error) {
    return buildRejected(rejectionOf(error));
  }
}

/* -------------------------------------------------------------------- import */

export interface SessionArchiveEconomyImportRequest {
  readonly sessionId: string;
  readonly playerId: string;
  readonly document: unknown;
  readonly hooks?: ProfileTransactionHooks;
}

export interface SessionArchiveEconomyReplaced {
  readonly session: Awaited<ReturnType<typeof commitSessionArchiveRows>>;
  readonly economy: 'WRITTEN' | 'REMOVED' | 'UNCHANGED';
  readonly economyRow: { readonly key: string; readonly revision: number } | null;
}

export interface SessionArchiveEconomyImportAccepted {
  readonly version: typeof SESSION_ARCHIVE_ECONOMY_VERSION;
  readonly status: 'COMMITTED' | 'CRASHED_AFTER_COMMIT';
  readonly crashAfterCommit: boolean;
  readonly legacy: boolean;
  readonly sessionId: string;
  readonly playerId: string;
  readonly checksum: string;
  readonly counts: SessionArchiveEconomyCounts;
  readonly replacement: SessionArchiveEconomyReplaced;
  readonly validation: SessionArchiveEconomyAccepted | SessionArchiveEconomyLegacy;
  readonly rejection: null;
}

export interface SessionArchiveEconomyImportRejected {
  readonly version: typeof SESSION_ARCHIVE_ECONOMY_VERSION;
  readonly status: 'REJECTED';
  readonly crashAfterCommit: false;
  readonly legacy: false;
  readonly sessionId: string;
  readonly playerId: string;
  readonly checksum: null;
  readonly counts: null;
  readonly replacement: null;
  readonly validation: null;
  readonly rejection: SessionArchiveEconomyRejection;
}

export type SessionArchiveEconomyImportResult =
  SessionArchiveEconomyImportAccepted | SessionArchiveEconomyImportRejected;

function importRejected(
  sessionId: string,
  playerId: string,
  rejection: SessionArchiveEconomyRejection,
): SessionArchiveEconomyImportRejected {
  return Object.freeze({
    version: SESSION_ARCHIVE_ECONOMY_VERSION,
    status: 'REJECTED' as const,
    crashAfterCommit: false as const,
    legacy: false as const,
    sessionId,
    playerId,
    checksum: null,
    counts: null,
    replacement: null,
    validation: null,
    rejection,
  });
}

export interface SessionArchiveEconomyStoreOptions {
  readonly repository: LocalRepository;
  readonly transactions: SessionArchiveTransactionRunner;
  readonly catalog: unknown;
}

/** The stores one version 2 replacement touches. */
export const SESSION_ARCHIVE_ECONOMY_STORES: readonly PersistenceStoreName[] = Object.freeze([
  ...SESSION_ARCHIVE_IMPORT_STORES,
  'meta',
]);

export interface SessionArchiveEconomyCurrent {
  readonly economy: 'FOUND' | 'EMPTY';
  readonly economyRevision: number | null;
  readonly xpBalance: number | null;
  readonly level: number | null;
  readonly reviews: number | null;
  readonly dailyRewards: number | null;
}

export interface SessionArchiveEconomyPreviewAccepted {
  readonly status: 'ACCEPTED';
  readonly validation: SessionArchiveEconomyAccepted | SessionArchiveEconomyLegacy;
  readonly current: SessionArchiveEconomyCurrent;
  readonly rejection: null;
}

export interface SessionArchiveEconomyPreviewRejected {
  readonly status: 'REJECTED';
  readonly validation: null;
  readonly current: null;
  readonly rejection: SessionArchiveEconomyRejection;
}

export type SessionArchiveEconomyPreview =
  SessionArchiveEconomyPreviewAccepted | SessionArchiveEconomyPreviewRejected;

export interface SessionArchiveEconomyStore {
  readonly export: (
    options: SessionArchiveEconomyExportOptions,
  ) => Promise<SessionArchiveEconomyExportResult>;
  readonly preview: (
    request: SessionArchiveEconomyImportRequest,
  ) => Promise<SessionArchiveEconomyPreview>;
  readonly import: (
    request: SessionArchiveEconomyImportRequest,
  ) => Promise<SessionArchiveEconomyImportResult>;
}

/**
 * The application-facing version 2 archive port.
 *
 * `export` reads the session and its bundle from the durable stores, `preview` validates a file and
 * describes the current economy, and `import` replaces both in one transaction. The store keeps no
 * second copy of any state.
 */
export function createSessionArchiveEconomyStore(
  options: SessionArchiveEconomyStoreOptions,
): SessionArchiveEconomyStore {
  const repository = options.repository;
  const transactions = options.transactions;
  const catalog = options.catalog;

  async function currentOf(
    sessionId: string,
    playerId: string,
  ): Promise<SessionArchiveEconomyCurrent> {
    const loaded = await transactions.transact(['meta'], (transaction) =>
      loadEconomySave(transaction, { sessionId, playerId }),
    );
    if (loaded.status === 'EMPTY') {
      return Object.freeze({
        economy: 'EMPTY' as const,
        economyRevision: null,
        xpBalance: null,
        level: null,
        reviews: null,
        dailyRewards: null,
      });
    }
    const counts = loaded.counts;
    return Object.freeze({
      economy: 'FOUND' as const,
      economyRevision: loaded.revision,
      xpBalance: counts.xpBalance,
      level: counts.level,
      reviews: counts.reviews,
      dailyRewards: counts.dailyRewards,
    });
  }

  async function preview(
    request: SessionArchiveEconomyImportRequest,
  ): Promise<SessionArchiveEconomyPreview> {
    const validation = readSessionArchiveWithEconomy(request.document, {
      sessionId: request.sessionId,
      playerId: request.playerId,
      catalog,
    });
    if (validation.status === 'REJECTED') {
      return Object.freeze({
        status: 'REJECTED' as const,
        validation: null,
        current: null,
        rejection: validation.rejection,
      });
    }
    try {
      const current = await currentOf(request.sessionId, request.playerId);
      return Object.freeze({
        status: 'ACCEPTED' as const,
        validation,
        current,
        rejection: null,
      });
    } catch (error) {
      return Object.freeze({
        status: 'REJECTED' as const,
        validation: null,
        current: null,
        rejection: rejectionOf(error),
      });
    }
  }

  async function importArchive(
    request: SessionArchiveEconomyImportRequest,
  ): Promise<SessionArchiveEconomyImportResult> {
    const validation = readSessionArchiveWithEconomy(request.document, {
      sessionId: request.sessionId,
      playerId: request.playerId,
      catalog,
    });
    if (validation.status === 'REJECTED') {
      return importRejected(request.sessionId, request.playerId, validation.rejection);
    }
    const status = repository.status();
    if (status.state !== 'READY') {
      return importRejected(request.sessionId, request.playerId, {
        code: 'REPOSITORY_CLOSED',
        message: `The repository is ${status.state}`,
        path: 'repository',
      });
    }
    if (status.role !== 'WRITER') {
      return importRejected(request.sessionId, request.playerId, {
        code: 'WRITER_REQUIRED',
        message: 'This page does not own the writer lock; an import never runs in a second tab',
        path: 'writer',
      });
    }
    const expect = {
      sessionId: validation.session.sessionId,
      playerId: validation.session.playerId,
    };
    let replacement: SessionArchiveEconomyReplaced;
    try {
      replacement = await transactions.transact(
        SESSION_ARCHIVE_ECONOMY_STORES,
        async (transaction: TransactionPort): Promise<SessionArchiveEconomyReplaced> => {
          const session = await commitSessionArchiveRows(
            transaction,
            validation.archive,
            catalog,
            request.hooks ?? {},
          );
          if (validation.status === 'LEGACY') {
            // A version 1 file never carried economy data: the stored bundle is left untouched.
            return Object.freeze({ session, economy: 'UNCHANGED' as const, economyRow: null });
          }
          if (validation.economy === null) {
            const removed = await deleteEconomySaveRows(transaction, request.sessionId);
            const after = await loadEconomySave(transaction, expect);
            if (after.status !== 'EMPTY') {
              throw new SessionArchiveEconomyError(
                'ECONOMY_IMPORT_MISMATCH',
                'The economy bundle was not removed',
                'meta',
              );
            }
            return Object.freeze({
              session,
              economy: removed.deleted ? ('REMOVED' as const) : ('UNCHANGED' as const),
              economyRow: null,
            });
          }
          const commit = await commitEconomySaveRows(transaction, validation.economy, {
            updatedAt: validation.document.createdAt,
          });
          const stored = await loadEconomySave(transaction, {
            ...expect,
            worldEpoch: validation.session.worldEpoch,
          });
          if (stored.status === 'EMPTY') {
            throw new SessionArchiveEconomyError(
              'ECONOMY_IMPORT_MISMATCH',
              'The imported economy bundle is not stored',
              'meta',
            );
          }
          return Object.freeze({
            session,
            economy: 'WRITTEN' as const,
            economyRow: Object.freeze({ key: commit.key, revision: commit.revision }),
          });
        },
      );
    } catch (error) {
      return importRejected(request.sessionId, request.playerId, rejectionOf(error));
    }
    let crashAfterCommit = false;
    if (request.hooks?.afterCommit !== undefined) {
      try {
        request.hooks.afterCommit();
      } catch {
        crashAfterCommit = true;
      }
    }
    return Object.freeze({
      version: SESSION_ARCHIVE_ECONOMY_VERSION,
      status: crashAfterCommit ? ('CRASHED_AFTER_COMMIT' as const) : ('COMMITTED' as const),
      crashAfterCommit,
      legacy: validation.status === 'LEGACY',
      sessionId: validation.session.sessionId,
      playerId: validation.session.playerId,
      checksum:
        validation.status === 'LEGACY'
          ? validation.archive.document.checksum.value
          : validation.document.checksum.value,
      counts: validation.counts,
      replacement,
      validation,
      rejection: null,
    });
  }

  return Object.freeze({
    export: (request: SessionArchiveEconomyExportOptions) =>
      exportSessionArchiveWithEconomy(repository, transactions, request),
    preview,
    import: importArchive,
  });
}

/** The 135 contract this layer extends; kept so callers can report both versions. */
export const SESSION_ARCHIVE_ECONOMY_SESSION_VERSION = SESSION_ARCHIVE_VERSION;
