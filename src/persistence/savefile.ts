import { DESTRUCTIBLE_DECOR_VERSION, DESTRUCTIBLE_LIMITS } from '../world';
import type { DestructibleSnapshot } from '../world';
import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  parseStrictJson,
  sha256Hex,
} from './canonical-json';
import type { StrictJsonRejection } from './canonical-json';
import { PERSISTENCE_LIMITS, PersistenceError } from './contracts';
import type { PersistenceStoreName } from './contracts';
import {
  ECONOMY_SAVE_LIMITS,
  commitEconomySaveRows,
  deleteEconomySaveRows,
  loadEconomySave,
} from './economy-save';
import type { TransactionPort } from './ports';
import type { ProfileTransactionHooks } from './profile-transaction';
import { measureJsonBytes } from './records';
import type { LocalRepository } from './repository';
import { SESSION_ARCHIVE_FORMAT, SessionArchiveError } from './session-archive';
import type { SessionArchiveDocument, SessionArchiveSession } from './session-archive';
import { commitSessionArchiveRows, SESSION_ARCHIVE_IMPORT_STORES } from './session-archive-import';
import type { SessionArchiveTransactionRunner } from './session-archive-import';
import {
  SESSION_ARCHIVE_ECONOMY_LIMITS,
  SessionArchiveEconomyError,
  exportSessionArchiveWithEconomy,
  readSessionArchiveWithEconomy,
  sessionArchiveEconomyCodes,
} from './session-archive-economy';
import type {
  SessionArchiveEconomyAccepted,
  SessionArchiveEconomyCode,
  SessionArchiveEconomyDocument,
  SessionArchiveEconomyLegacy,
} from './session-archive-economy';
import { sessionKinds } from './session-kinds';
import type { SessionKind } from './session-kinds';

/**
 * The `.sdasave` savefile for PBI 234.
 *
 * Docs/29 asks for a real file: `Salvează jocul în fișier` captures a coherent generation of the
 * whole game and `Încarcă jocul din fișier` replaces the session only after the file has been
 * verified. The delivered session archive (135), its economy bundle (215), the two session kinds
 * (225) and the destructible decor snapshot (227) are the components; this module only adds the
 * outer envelope, the file actions and the atomic replacement.
 *
 * Five rules are structural:
 *
 * 1. **A complete, versioned envelope.** `format`, `formatVersion`, `integrityVersion`,
 *    `schemaVersion`, `createdAt`, `payload` and `checksum`. The payload carries the explicit
 *    `versions` (engine/physics/map/schema), both session slots — `ACADEMY` and `CHAOS` — each with
 *    its own 135/215 archive (checkpoint, progress, campaign, settings, profile reference,
 *    scenarios, daily, economy and XP), the 227 decor snapshot of each slot and the optional
 *    replays. A slot that is `null` is absent, not empty.
 * 2. **Real integrity over everything but itself.** The checksum is the `SHA-256` of the
 *    `SDA-CJSON-1` canonical form of the envelope without the top-level `checksum`. It covers the
 *    metadata, both sessions, both decor snapshots and the optional replays. The inner 135/215
 *    documents keep their own checksums and re-read with their own readers; a re-stamped file still
 *    has to pass every component contract. The checksum detects modification and corruption; it is
 *    not a signature and the game never presents it as anti-cheat.
 * 3. **Closed refusals before anything live changes.** Order at read: size/depth → strict parse
 *    (duplicate keys refused before hashing) → format/integrity → canonical form and byte budget →
 *    checksum → schema version → payload/session/decor/replay contracts → size declaration. A file
 *    that is truncated, corrupt, over budget, of an unknown algorithm or of a newer format/schema
 *    is refused with a closed code; nothing is repaired and no live state is touched.
 * 4. **One transaction, one writer, no reward addition.** A confirmed import stages the world in a
 *    caller port, writes both session replacements and their economy rows in one transaction, and
 *    re-reads every written slot inside that transaction. A failed or cancelled transaction rolls
 *    back to the previous bytes; the paths contain no `settle`, `creditMission`, `creditDaily` or
 *    `recordDailyReward`, so importing twice cannot duplicate XP or a reward. The second tab is
 *    refused with `WRITER_REQUIRED`.
 * 5. **The summary precedes the replacement.** `preview` validates the file and returns the file
 *    summary plus the current session it would replace; `import` requires the preview identity of
 *    exactly that file. Startup after a replacement is always `PAUSED_AUTO` with the input released.
 */

/** Contract id of this layer. */
export const SAVEFILE_VERSION = '234-savefile-v1' as const;

/** File format marker stored in every `.sdasave` document. */
export const SAVEFILE_FORMAT = 'self-driving-academy-save' as const;

/** Version of the file layout; a reader that does not know it refuses the file. */
export const SAVEFILE_FORMAT_VERSION = 1 as const;

/** Version of the integrity rules (checksum algorithm plus canonicalization). */
export const SAVEFILE_INTEGRITY_VERSION = 1 as const;

/** Version of the payload schema. It is checked only after the checksum verified. */
export const SAVEFILE_SCHEMA_VERSION = 1 as const;

/** Schema identity stored in the payload versions; it is not a build number. */
export const SAVEFILE_SCHEMA_ID = '234-savefile-schema-1' as const;

/** Extension and media type of the produced file. */
export const SAVEFILE_EXTENSION = '.sdasave' as const;
export const SAVEFILE_MIME_TYPE = 'application/json' as const;

/** The two session kinds of 225; the savefile carries both, never a merged one. */
export const savefileSessionSlots = sessionKinds;

/**
 * Fixed byte and depth budgets.
 *
 * They are derived from the delivered layers, not invented: one slot is the 215 archive budget plus
 * its own envelope, the decor slot is the 227 snapshot budget, and the optional replays are bounded
 * by the 222 retention window. The file budget is the sum plus one envelope; a file over it is
 * refused explicitly and never truncated. `twoSessionCheckpointBytes` is still `null` in the 203
 * manifest, so the report measures the produced file instead of claiming a calibrated capacity.
 */
export const SAVEFILE_LIMITS = Object.freeze({
  /** Canonical UTF-16 code units of the whole file. */
  maxFileBytes:
    2 * (SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes + 65_536) +
    2 * DESTRUCTIBLE_LIMITS.maxSnapshotCodeUnits +
    Math.ceil(4_194_304 / 3) * 4 +
    131_072,
  /** Sum of the payload slots; leaves room for the envelope inside `maxFileBytes`. */
  maxPayloadBytes:
    2 * (SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes + 65_536) +
    2 * DESTRUCTIBLE_LIMITS.maxSnapshotCodeUnits +
    Math.ceil(4_194_304 / 3) * 4,
  /** One session slot, including its own 215 envelope. */
  maxSessionBytes: SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes + 65_536,
  /** One 227 decor snapshot. */
  maxDecorBytes: DESTRUCTIBLE_LIMITS.maxSnapshotCodeUnits,
  /** Optional replays: bounded entries and decoded bytes. */
  maxReplayEntries: 4,
  maxReplayBytes: 4_194_304,
  /** Nesting depth accepted by the reader. */
  maxDepth: Math.max(SESSION_ARCHIVE_ECONOMY_LIMITS.maxDepth, ECONOMY_SAVE_LIMITS.maxDepth) + 6,
});

/** Codes that exist only at the savefile boundary. */
export const savefileCodes = [
  'UNSUPPORTED_SAVEFILE_FORMAT',
  'UNSUPPORTED_INTEGRITY',
  'LEGACY_SAVEFILE',
  'SAVEFILE_EMPTY',
  'DUPLICATE_SESSION',
  'ACTIVE_SESSION_MISSING',
  'DECOR_INVALID',
  'DECOR_SESSION_MISMATCH',
  'REPLAY_INVALID',
  'REPLAY_TOO_LARGE',
  'PREVIEW_REQUIRED',
  'PREVIEW_STALE',
  'CANCELLED',
  'WORLD_PREPARE_FAILED',
  'WRITER_REQUIRED',
  'REPOSITORY_CLOSED',
  'IMPORT_WRITE_FAILED',
  'TRANSACTION_ABORTED',
  'STORAGE_FULL',
] as const;

export type SaveFileBoundaryCode = (typeof savefileCodes)[number];

/** Closed refusal vocabulary: every 135/215 code plus the savefile boundary. */
export type SaveFileCode = SessionArchiveEconomyCode | SaveFileBoundaryCode;

export const savefileRejectionCodes: readonly SaveFileCode[] = Object.freeze([
  ...new Set<string>([...sessionArchiveEconomyCodes, ...savefileCodes]),
] as SaveFileCode[]);

export interface SaveFileRejection {
  readonly code: SaveFileCode;
  readonly message: string;
  readonly path: string;
}

export class SaveFileError extends Error {
  readonly code: SaveFileCode;
  readonly path: string;

  constructor(code: SaveFileCode, message: string, path: string) {
    super(message);
    this.name = 'SaveFileError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: SaveFileCode, message: string, path: string): never {
  throw new SaveFileError(code, message, path);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const FNV1A32 = /^fnv1a32:[0-9a-f]{8}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

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
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    fail('INVALID_IDENTITY', 'Expected a bounded identity', path);
  }
  if (value.trim() !== value) fail('INVALID_IDENTITY', 'The identity must not be padded', path);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      fail('INVALID_IDENTITY', 'Expected a bounded identity', path);
    }
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_COUNTER', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_NUMBER', 'Expected a finite number', path);
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

function requireSessionKind(value: unknown, path: string): SessionKind {
  if (typeof value !== 'string' || !(savefileSessionSlots as readonly string[]).includes(value)) {
    fail('INVALID_FIELD', `Expected one of ${savefileSessionSlots.join('/')}`, path);
  }
  return value as SessionKind;
}

/* -------------------------------------------------------------------- the shape */

/** The explicit versions of one file: the build triple plus the payload schema identity. */
export interface SaveFileVersions {
  readonly engine: string;
  readonly physics: string;
  readonly map: string;
  /** `SAVEFILE_SCHEMA_ID` of the payload layout. */
  readonly schema: string;
}

/** One optional replay, carried as validated base64 with its decoded size. */
export interface SaveFileReplayEntry {
  readonly replayId: string;
  readonly encoding: 'base64';
  readonly data: string;
  /** Decoded byte length; it must match `data`. */
  readonly bytes: number;
}

/** The declared size ledger of the payload, in canonical UTF-8 bytes. */
export interface SaveFileSizes {
  readonly sessions: Readonly<Record<SessionKind, number>>;
  readonly decor: Readonly<Record<SessionKind, number>>;
  readonly optional: number;
  readonly total: number;
  readonly limit: number;
}

/** A session slot holds either a 135 v1 archive or a 215 v2 archive, unchanged. */
export type SaveFileSessionDocument = SessionArchiveDocument | SessionArchiveEconomyDocument;

export type SaveFileSessionValidation = SessionArchiveEconomyAccepted | SessionArchiveEconomyLegacy;

export interface SaveFilePayload {
  readonly versions: SaveFileVersions;
  readonly activeSession: SessionKind;
  readonly sessions: Readonly<Record<SessionKind, SaveFileSessionDocument | null>>;
  readonly decor: Readonly<Record<SessionKind, DestructibleSnapshot | null>>;
  readonly optional: Readonly<{ replays: readonly SaveFileReplayEntry[] }>;
  readonly sizes: SaveFileSizes;
}

export interface SaveFileChecksum {
  readonly algorithm: typeof CHECKSUM_ALGORITHM;
  readonly canonicalization: typeof CANONICALIZATION_VERSION;
  readonly value: string;
}

export interface SaveFileDocument {
  readonly format: typeof SAVEFILE_FORMAT;
  readonly formatVersion: typeof SAVEFILE_FORMAT_VERSION;
  readonly integrityVersion: typeof SAVEFILE_INTEGRITY_VERSION;
  readonly schemaVersion: typeof SAVEFILE_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly payload: SaveFilePayload;
  readonly checksum: SaveFileChecksum;
}

/** One slot as the summary and the confirmation screen describe it; no live object is leaked. */
export interface SaveFileSlotSummary {
  readonly sessionKind: SessionKind;
  readonly innerFormatVersion: 1 | 2;
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  readonly checkpointId: string | null;
  readonly checkpointTick: number | null;
  readonly xp: number;
  readonly xpMicroXp: number;
  readonly level: number;
  readonly missionsCompleted: number;
  readonly scenarios: number;
  readonly dailyRewards: number;
  readonly settlements: number;
  readonly reviews: number;
  readonly kpiDays: number;
  readonly decorObjects: number | null;
  readonly bytes: number;
}

export interface SaveFileSummary {
  readonly version: typeof SAVEFILE_VERSION;
  readonly activeSession: SessionKind;
  readonly createdAt: string;
  readonly checksum: string;
  readonly bytes: number;
  readonly versions: SaveFileVersions;
  readonly sessions: Readonly<Record<SessionKind, SaveFileSlotSummary | null>>;
  readonly sessionsPresent: number;
  readonly decorObjects: Readonly<Record<SessionKind, number | null>>;
  readonly replays: Readonly<{ entries: number; bytes: number }>;
  readonly sizes: SaveFileSizes;
  readonly totalXp: number;
}

/** Where the game resumes after a successful replacement. */
export const SAVEFILE_LAUNCH = Object.freeze({
  mode: 'PAUSED_AUTO' as const,
  paused: true as const,
  auto: true as const,
  inputReleased: true as const,
  manualVehicles: 0 as const,
});

/* ------------------------------------------------------------------- checksum */

interface ChecksumParts {
  readonly format: unknown;
  readonly formatVersion: unknown;
  readonly integrityVersion: unknown;
  readonly schemaVersion: unknown;
  readonly createdAt: unknown;
  readonly payload: unknown;
}

function checksumOf(parts: ChecksumParts): string {
  const canonical = canonicalizeJson(
    {
      format: parts.format,
      formatVersion: parts.formatVersion,
      integrityVersion: parts.integrityVersion,
      schemaVersion: parts.schemaVersion,
      createdAt: parts.createdAt,
      payload: parts.payload,
    },
    { maxDepth: SAVEFILE_LIMITS.maxDepth },
  );
  if (canonical.status === 'REJECTED') {
    if (canonical.rejection.code === 'UNSAFE_KEY') {
      fail('UNSAFE_KEY', canonical.rejection.message, canonical.rejection.path);
    }
    fail('CANONICALIZATION_FAILED', canonical.rejection.message, canonical.rejection.path);
  }
  return sha256Hex(canonical.text);
}

/**
 * The `SHA-256` checksum of a savefile, computed over the canonical form of the envelope without
 * the top-level `checksum` field. The builder and the reader call the same function.
 */
export function computeSaveFileChecksum(
  document: Omit<SaveFileDocument, 'checksum'> | SaveFileDocument,
): string {
  return checksumOf({
    format: document.format,
    formatVersion: document.formatVersion,
    integrityVersion: document.integrityVersion,
    schemaVersion: document.schemaVersion,
    createdAt: document.createdAt,
    payload: document.payload,
  });
}

/** Returns a copy of the document with a recomputed checksum. */
export function stampSaveFileChecksum(
  document: Omit<SaveFileDocument, 'checksum'> | SaveFileDocument,
): SaveFileDocument {
  const payload = document as Omit<SaveFileDocument, 'checksum'>;
  return Object.freeze({
    ...payload,
    checksum: Object.freeze({
      algorithm: CHECKSUM_ALGORITHM,
      canonicalization: CANONICALIZATION_VERSION,
      value: computeSaveFileChecksum(payload),
    }),
  });
}

/** Deterministic, filesystem-safe file name for the produced `.sdasave`. */
export function saveFileName(createdAt: string): string {
  const stamp = timestamp(createdAt, 'createdAt').replace(/[-:.]/g, '');
  return `self-driving-academy-${stamp}${SAVEFILE_EXTENSION}`;
}

/* ------------------------------------------------------------------ size ledger */

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

interface SlotValues {
  readonly sessions: Readonly<Record<SessionKind, SaveFileSessionDocument | null>>;
  readonly decor: Readonly<Record<SessionKind, DestructibleSnapshot | null>>;
  readonly optional: Readonly<{ replays: readonly SaveFileReplayEntry[] }>;
}

/** The real canonical UTF-8 size of every payload slot and of the whole payload. */
export function savefileSizes(
  slots: SlotValues,
  limit: number = SAVEFILE_LIMITS.maxPayloadBytes,
): SaveFileSizes {
  const sessions = Object.freeze({
    ACADEMY: measured(slots.sessions.ACADEMY, 'sessions.ACADEMY'),
    CHAOS: measured(slots.sessions.CHAOS, 'sessions.CHAOS'),
  });
  const decor = Object.freeze({
    ACADEMY: measured(slots.decor.ACADEMY, 'decor.ACADEMY'),
    CHAOS: measured(slots.decor.CHAOS, 'decor.CHAOS'),
  });
  const optional = measured(slots.optional, 'optional');
  return Object.freeze({
    sessions,
    decor,
    optional,
    total: sessions.ACADEMY + sessions.CHAOS + decor.ACADEMY + decor.CHAOS + optional,
    limit,
  });
}

function enforceBudgets(sizes: SaveFileSizes): void {
  for (const kind of savefileSessionSlots) {
    if (sizes.sessions[kind] > SAVEFILE_LIMITS.maxSessionBytes) {
      fail(
        'COMPONENT_TOO_LARGE',
        `The ${kind} session slot has ${sizes.sessions[kind]} bytes, above its ${SAVEFILE_LIMITS.maxSessionBytes} byte budget`,
        `sizes.sessions.${kind}`,
      );
    }
    if (sizes.decor[kind] > SAVEFILE_LIMITS.maxDecorBytes) {
      fail(
        'COMPONENT_TOO_LARGE',
        `The ${kind} decor slot has ${sizes.decor[kind]} bytes, above its ${SAVEFILE_LIMITS.maxDecorBytes} byte budget`,
        `sizes.decor.${kind}`,
      );
    }
  }
  if (sizes.total > sizes.limit || sizes.limit > SAVEFILE_LIMITS.maxPayloadBytes) {
    fail(
      'FILE_TOO_LARGE',
      `The savefile declares ${sizes.total} bytes against a ${sizes.limit} byte payload limit`,
      'sizes.total',
    );
  }
}

/* -------------------------------------------------------------- component reads */

function readSessionBlock(value: unknown, path: string): SessionArchiveSession {
  const data = exact(value, ['sessionId', 'playerId', 'worldEpoch'], path);
  return Object.freeze({
    sessionId: identity(data.sessionId, `${path}.sessionId`),
    playerId: identity(data.playerId, `${path}.playerId`),
    worldEpoch: integer(data.worldEpoch, `${path}.worldEpoch`),
  });
}

function readVersions(value: unknown, path: string, withSchema: true): SaveFileVersions;
function readVersions(
  value: unknown,
  path: string,
  withSchema: false,
): Omit<SaveFileVersions, 'schema'>;
function readVersions(
  value: unknown,
  path: string,
  withSchema: boolean,
): SaveFileVersions | Omit<SaveFileVersions, 'schema'> {
  const fields = withSchema
    ? (['engine', 'physics', 'map', 'schema'] as const)
    : (['engine', 'physics', 'map'] as const);
  const data = exact(value, fields, path);
  const engine = versionText(data.engine, `${path}.engine`);
  const physics = versionText(data.physics, `${path}.physics`);
  const map = versionText(data.map, `${path}.map`);
  if (!withSchema) return Object.freeze({ engine, physics, map });
  const schema = versionText(data.schema, `${path}.schema`);
  if (schema !== SAVEFILE_SCHEMA_ID) {
    fail(
      'UNSUPPORTED_SCHEMA',
      `Unsupported savefile schema: ${schema}; this build writes ${SAVEFILE_SCHEMA_ID}`,
      `${path}.schema`,
    );
  }
  return Object.freeze({ engine, physics, map, schema: SAVEFILE_SCHEMA_ID });
}

function readDecorSnapshot(value: unknown, path: string): DestructibleSnapshot {
  const data = exact(
    value,
    ['version', 'mapId', 'sessionId', 'worldEpoch', 'generation', 'objects', 'checksum'],
    path,
  );
  if (data.version !== DESTRUCTIBLE_DECOR_VERSION) {
    fail(
      'DECOR_INVALID',
      `Unsupported decor snapshot version: ${String(data.version)}`,
      `${path}.version`,
    );
  }
  if (!Array.isArray(data.objects)) {
    fail('DECOR_INVALID', 'Expected the decor object list', `${path}.objects`);
  }
  if (data.objects.length > DESTRUCTIBLE_LIMITS.maxObjects) {
    fail(
      'DECOR_INVALID',
      `The decor snapshot has ${data.objects.length} objects, above the ${DESTRUCTIBLE_LIMITS.maxObjects} budget`,
      `${path}.objects`,
    );
  }
  const seen = new Set<string>();
  const objects: {
    readonly objectId: string;
    readonly state: 'INTACT' | 'MOVED' | 'BROKEN';
    readonly damageNs: number;
    readonly positionM: Readonly<{ x: number; y: number; z: number }>;
    readonly headingRad: number;
  }[] = [];
  for (const [index, raw] of data.objects.entries()) {
    const entry = exact(
      raw,
      ['objectId', 'state', 'damageNs', 'positionM', 'headingRad'],
      `${path}.objects[${index}]`,
    );
    const objectId = identity(entry.objectId, `${path}.objects[${index}].objectId`);
    if (seen.has(objectId)) {
      fail(
        'DECOR_INVALID',
        `Duplicate decor object: ${objectId}`,
        `${path}.objects[${index}].objectId`,
      );
    }
    seen.add(objectId);
    if (entry.state !== 'INTACT' && entry.state !== 'MOVED' && entry.state !== 'BROKEN') {
      fail('DECOR_INVALID', 'Unknown decor object state', `${path}.objects[${index}].state`);
    }
    const position = exact(entry.positionM, ['x', 'y', 'z'], `${path}.objects[${index}].positionM`);
    objects.push(
      Object.freeze({
        objectId,
        state: entry.state,
        damageNs: finite(entry.damageNs, `${path}.objects[${index}].damageNs`),
        positionM: Object.freeze({
          x: finite(position.x, `${path}.objects[${index}].positionM.x`),
          y: finite(position.y, `${path}.objects[${index}].positionM.y`),
          z: finite(position.z, `${path}.objects[${index}].positionM.z`),
        }),
        headingRad: finite(entry.headingRad, `${path}.objects[${index}].headingRad`),
      }),
    );
  }
  const checksum = data.checksum;
  if (typeof checksum !== 'string' || !FNV1A32.test(checksum)) {
    fail(
      'DECOR_INVALID',
      'Expected the 227 decor snapshot checksum (fnv1a32:hex)',
      `${path}.checksum`,
    );
  }
  return Object.freeze({
    version: DESTRUCTIBLE_DECOR_VERSION,
    mapId: identity(data.mapId, `${path}.mapId`),
    sessionId: identity(data.sessionId, `${path}.sessionId`),
    worldEpoch: integer(data.worldEpoch, `${path}.worldEpoch`),
    generation: integer(data.generation, `${path}.generation`),
    objects: Object.freeze(objects),
    checksum,
  });
}

/** Decoded byte length of a validated base64 string, without allocating the bytes. */
function base64Bytes(data: string): number {
  if (!BASE64.test(data)) return -1;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

function readReplays(value: unknown): readonly SaveFileReplayEntry[] {
  if (!Array.isArray(value)) {
    fail('REPLAY_INVALID', 'Expected a replay list', 'optional.replays');
  }
  if (value.length > SAVEFILE_LIMITS.maxReplayEntries) {
    fail(
      'REPLAY_TOO_LARGE',
      `The file carries ${value.length} replays, above the ${SAVEFILE_LIMITS.maxReplayEntries} budget`,
      'optional.replays',
    );
  }
  const entries: SaveFileReplayEntry[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const [index, raw] of value.entries()) {
    const path = `optional.replays[${index}]`;
    const data = exact(raw, ['replayId', 'encoding', 'data', 'bytes'], path);
    const replayId = identity(data.replayId, `${path}.replayId`);
    if (seen.has(replayId)) {
      fail('REPLAY_INVALID', `Duplicate replay: ${replayId}`, `${path}.replayId`);
    }
    seen.add(replayId);
    if (data.encoding !== 'base64') {
      fail('REPLAY_INVALID', 'Replays are stored as base64', `${path}.encoding`);
    }
    if (typeof data.data !== 'string') {
      fail('REPLAY_INVALID', 'Expected the base64 replay body', `${path}.data`);
    }
    const bytes = base64Bytes(data.data);
    if (bytes < 0) {
      fail('REPLAY_INVALID', 'The replay body is not valid base64', `${path}.data`);
    }
    if (integer(data.bytes, `${path}.bytes`) !== bytes) {
      fail(
        'REPLAY_INVALID',
        `The declared replay size ${String(data.bytes)} does not match ${bytes} decoded bytes`,
        `${path}.bytes`,
      );
    }
    total += bytes;
    if (total > SAVEFILE_LIMITS.maxReplayBytes) {
      fail(
        'REPLAY_TOO_LARGE',
        `The optional replays have ${total} decoded bytes, above the ${SAVEFILE_LIMITS.maxReplayBytes} budget`,
        'optional.replays',
      );
    }
    entries.push(Object.freeze({ replayId, encoding: 'base64', data: data.data, bytes }));
  }
  return Object.freeze(entries);
}

function readOptional(value: unknown): Readonly<{ replays: readonly SaveFileReplayEntry[] }> {
  const data = exact(value, ['replays'], 'optional');
  return Object.freeze({ replays: readReplays(data.replays) });
}

/* ------------------------------------------------------------ cross-slot rules */

function checkSlots(
  activeSession: SessionKind,
  sessions: Readonly<Record<SessionKind, SaveFileSessionDocument | null>>,
): void {
  const present = savefileSessionSlots.filter((kind) => sessions[kind] !== null);
  if (present.length === 0) {
    fail('SAVEFILE_EMPTY', 'The savefile carries no session', 'payload.sessions');
  }
  if (sessions[activeSession] === null) {
    fail(
      'ACTIVE_SESSION_MISSING',
      `The active session ${activeSession} is not part of the file`,
      'payload.activeSession',
    );
  }
  const ids = new Map<string, SessionKind>();
  for (const kind of present) {
    const sessionId = sessions[kind]!.session.sessionId;
    const previous = ids.get(sessionId);
    if (previous !== undefined) {
      fail(
        'DUPLICATE_SESSION',
        `The ${kind} and ${previous} slots both name session ${sessionId}`,
        `payload.sessions.${kind}`,
      );
    }
    ids.set(sessionId, kind);
  }
}

function checkDecor(
  sessions: Readonly<Record<SessionKind, SaveFileSessionDocument | null>>,
  decor: Readonly<Record<SessionKind, DestructibleSnapshot | null>>,
): void {
  for (const kind of savefileSessionSlots) {
    const snapshot = decor[kind];
    if (snapshot === null) continue;
    const session = sessions[kind];
    if (session === null) {
      fail(
        'DECOR_SESSION_MISMATCH',
        `The ${kind} decor has no session in the same slot`,
        `payload.decor.${kind}`,
      );
    }
    if (snapshot.sessionId !== session.session.sessionId) {
      fail(
        'DECOR_SESSION_MISMATCH',
        `The ${kind} decor belongs to ${snapshot.sessionId}, not ${session.session.sessionId}`,
        `payload.decor.${kind}.sessionId`,
      );
    }
    if (snapshot.worldEpoch !== session.session.worldEpoch) {
      fail(
        'DECOR_SESSION_MISMATCH',
        `The ${kind} decor is in world epoch ${snapshot.worldEpoch}, not ${session.session.worldEpoch}`,
        `payload.decor.${kind}.worldEpoch`,
      );
    }
  }
}

function summaryOf(
  sessions: Readonly<Record<SessionKind, SaveFileSessionValidation | null>>,
  decor: Readonly<Record<SessionKind, DestructibleSnapshot | null>>,
): Readonly<Record<SessionKind, SaveFileSlotSummary | null>> {
  const summary: Record<SessionKind, SaveFileSlotSummary | null> = { ACADEMY: null, CHAOS: null };
  for (const kind of savefileSessionSlots) {
    const slot = sessions[kind];
    if (slot === null) continue;
    summary[kind] = Object.freeze({
      sessionKind: kind,
      innerFormatVersion: slot.status === 'LEGACY' ? (1 as const) : (2 as const),
      sessionId: slot.session.sessionId,
      playerId: slot.session.playerId,
      worldEpoch: slot.session.worldEpoch,
      checkpointId: slot.archive.components.checkpoint?.checkpointId ?? null,
      checkpointTick: slot.archive.components.checkpoint?.tick ?? null,
      xp: slot.counts.xpBalance,
      xpMicroXp: slot.counts.xpBalanceMicroXp,
      level: slot.counts.level,
      missionsCompleted: slot.archive.counts.campaignCompleted,
      scenarios: slot.archive.counts.scenarios,
      dailyRewards: slot.counts.dailyRewards,
      settlements: slot.counts.settlements,
      reviews: slot.counts.reviews,
      kpiDays: slot.counts.kpiDays,
      decorObjects: decor[kind]?.objects.length ?? null,
      bytes: slot.bytes,
    });
  }
  return Object.freeze(summary);
}

/* -------------------------------------------------------------------- builder */

export interface SaveFileBuildSlotInput {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
}

export interface SaveFileBuildInput {
  readonly createdAt: string;
  readonly activeSession: SessionKind;
  readonly versions: Omit<SaveFileVersions, 'schema'>;
  readonly catalog: unknown;
  /** The already produced 135/215 documents; `null` means the slot is absent. */
  readonly sessions: Readonly<Partial<Record<SessionKind, unknown | null>>>;
  readonly decor?: Readonly<Partial<Record<SessionKind, unknown | null>>>;
  readonly replays?: readonly unknown[];
}

export interface SaveFileAccepted {
  readonly version: typeof SAVEFILE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: SaveFileDocument;
  readonly checksum: string;
  readonly sizes: SaveFileSizes;
  readonly summary: SaveFileSummary;
  readonly bytes: number;
  readonly rejection: null;
}

export interface SaveFileRejected {
  readonly version: typeof SAVEFILE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksum: null;
  readonly sizes: null;
  readonly summary: null;
  readonly bytes: 0;
  readonly rejection: SaveFileRejection;
}

export type SaveFileBuildResult = SaveFileAccepted | SaveFileRejected;

function rejected(rejection: SaveFileRejection): SaveFileRejected {
  return Object.freeze({
    version: SAVEFILE_VERSION,
    status: 'REJECTED' as const,
    document: null,
    checksum: null,
    sizes: null,
    summary: null,
    bytes: 0 as const,
    rejection: Object.freeze(rejection),
  });
}

function toRejection(error: unknown): SaveFileRejection {
  if (error instanceof SaveFileError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  if (error instanceof SessionArchiveEconomyError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  if (error instanceof SessionArchiveError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  if (error instanceof PersistenceError) {
    const code: SaveFileCode =
      error.code === 'WRITER_REQUIRED'
        ? 'WRITER_REQUIRED'
        : error.code === 'REPOSITORY_CLOSED' || error.code === 'REPOSITORY_DISPOSED'
          ? 'REPOSITORY_CLOSED'
          : error.code === 'STORAGE_FULL'
            ? 'STORAGE_FULL'
            : error.code === 'TRANSACTION_ABORTED'
              ? 'TRANSACTION_ABORTED'
              : 'IMPORT_WRITE_FAILED';
    return Object.freeze({
      code,
      message: `${error.code}: ${error.message}`,
      path: error.path ?? '$',
    });
  }
  return Object.freeze({
    code: 'IMPORT_WRITE_FAILED' as const,
    message: describe(error),
    path: '$',
  });
}

function readBuiltSlot(
  value: unknown,
  kind: SessionKind,
  versions: Omit<SaveFileVersions, 'schema'>,
  catalog: unknown,
): SaveFileSessionValidation | null {
  if (value === undefined || value === null) return null;
  const path = `sessions.${kind}`;
  const envelope = object(value, path);
  if (envelope.format === SESSION_ARCHIVE_FORMAT) {
    // Only the two delivered archive layouts are accepted; a different container is not guessed.
    const formatVersion = envelope.formatVersion;
    if (formatVersion !== 1 && formatVersion !== 2) {
      fail(
        'UNSUPPORTED_FORMAT_VERSION',
        `The ${kind} session declares format version ${String(formatVersion)}`,
        `${path}.formatVersion`,
      );
    }
  }
  const session = readSessionBlock(envelope.session, `${path}.session`);
  const validation = readSessionArchiveWithEconomy(value, {
    sessionId: session.sessionId,
    playerId: session.playerId,
    catalog,
    versions,
  });
  if (validation.status === 'REJECTED') {
    throw new SessionArchiveEconomyError(
      validation.rejection.code,
      validation.rejection.message,
      validation.rejection.path,
    );
  }
  return validation;
}

function readBuiltDecor(value: unknown, kind: SessionKind): DestructibleSnapshot | null {
  if (value === undefined || value === null) return null;
  return readDecorSnapshot(value, `decor.${kind}`);
}

/**
 * Builds a complete `.sdasave` document.
 *
 * Every slot is re-read with the reader of its owner (215 for the session and its economy, the
 * savefile reader for the decor and the replays), the cross-slot identity is checked, the size
 * ledger is measured and enforced, and only then is the checksum stamped. A refusal returns a
 * closed code and no half-built document.
 */
export function buildSaveFile(input: SaveFileBuildInput): SaveFileBuildResult {
  try {
    const createdAt = timestamp(input.createdAt, 'createdAt');
    const activeSession = requireSessionKind(input.activeSession, 'activeSession');
    const versions = Object.freeze({
      engine: versionText(input.versions.engine, 'versions.engine'),
      physics: versionText(input.versions.physics, 'versions.physics'),
      map: versionText(input.versions.map, 'versions.map'),
    });
    const catalog = input.catalog;
    const validations = {
      ACADEMY: readBuiltSlot(input.sessions.ACADEMY, 'ACADEMY', versions, catalog),
      CHAOS: readBuiltSlot(input.sessions.CHAOS, 'CHAOS', versions, catalog),
    } as const;
    const sessions = {
      ACADEMY: validations.ACADEMY === null ? null : documentOf(validations.ACADEMY),
      CHAOS: validations.CHAOS === null ? null : documentOf(validations.CHAOS),
    } as const;
    const decor = {
      ACADEMY: readBuiltDecor(input.decor?.ACADEMY, 'ACADEMY'),
      CHAOS: readBuiltDecor(input.decor?.CHAOS, 'CHAOS'),
    } as const;
    const optional = Object.freeze({ replays: readReplays(input.replays ?? []) });
    checkSlots(activeSession, sessions);
    checkDecor(sessions, decor);
    const sizes = savefileSizes({ sessions, decor, optional });
    enforceBudgets(sizes);
    const payload: SaveFilePayload = Object.freeze({
      versions: Object.freeze({ ...versions, schema: SAVEFILE_SCHEMA_ID }),
      activeSession,
      sessions,
      decor,
      optional,
      sizes,
    });
    const document = stampSaveFileChecksum({
      format: SAVEFILE_FORMAT,
      formatVersion: SAVEFILE_FORMAT_VERSION,
      integrityVersion: SAVEFILE_INTEGRITY_VERSION,
      schemaVersion: SAVEFILE_SCHEMA_VERSION,
      createdAt,
      payload,
    });
    const canonical = canonicalizeJson(document, { maxDepth: SAVEFILE_LIMITS.maxDepth });
    if (canonical.status === 'REJECTED') {
      fail(
        canonical.rejection.code === 'UNSAFE_KEY' ? 'UNSAFE_KEY' : 'CANONICALIZATION_FAILED',
        canonical.rejection.message,
        canonical.rejection.path,
      );
    }
    if (canonical.text.length > SAVEFILE_LIMITS.maxFileBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The savefile has ${canonical.text.length} code units, above the ${SAVEFILE_LIMITS.maxFileBytes} budget`,
        '$',
      );
    }
    const summary = buildSummary({
      activeSession,
      createdAt,
      checksum: document.checksum.value,
      bytes: canonical.text.length,
      versions: payload.versions,
      validations,
      decor,
      optional,
      sizes,
    });
    return Object.freeze({
      version: SAVEFILE_VERSION,
      status: 'ACCEPTED' as const,
      document,
      checksum: document.checksum.value,
      sizes,
      summary,
      bytes: canonical.text.length,
      rejection: null,
    });
  } catch (error) {
    return rejected(toRejection(error));
  }
}

function documentOf(validation: SaveFileSessionValidation): SaveFileSessionDocument {
  return validation.status === 'LEGACY' ? validation.archive.document : validation.document;
}

function buildSummary(input: {
  readonly activeSession: SessionKind;
  readonly createdAt: string;
  readonly checksum: string;
  readonly bytes: number;
  readonly versions: SaveFileVersions;
  readonly validations: Readonly<Record<SessionKind, SaveFileSessionValidation | null>>;
  readonly decor: Readonly<Record<SessionKind, DestructibleSnapshot | null>>;
  readonly optional: Readonly<{ replays: readonly SaveFileReplayEntry[] }>;
  readonly sizes: SaveFileSizes;
}): SaveFileSummary {
  const sessions = summaryOf(input.validations, input.decor);
  const present = savefileSessionSlots.filter((kind) => sessions[kind] !== null);
  let totalXp = 0;
  for (const kind of present) totalXp += sessions[kind]!.xp;
  return Object.freeze({
    version: SAVEFILE_VERSION,
    activeSession: input.activeSession,
    createdAt: input.createdAt,
    checksum: input.checksum,
    bytes: input.bytes,
    versions: input.versions,
    sessions,
    sessionsPresent: present.length,
    decorObjects: Object.freeze({
      ACADEMY: sessions.ACADEMY?.decorObjects ?? null,
      CHAOS: sessions.CHAOS?.decorObjects ?? null,
    }),
    replays: Object.freeze({
      entries: input.optional.replays.length,
      bytes: input.optional.replays.reduce((sum, entry) => sum + entry.bytes, 0),
    }),
    sizes: input.sizes,
    totalXp,
  });
}

/* ---------------------------------------------------------------------- reader */

function strictRejection(value: StrictJsonRejection): SaveFileRejection {
  const code: SaveFileCode =
    value.code === 'FILE_TOO_LARGE'
      ? 'FILE_TOO_LARGE'
      : value.code === 'DEPTH_EXCEEDED'
        ? 'DEPTH_EXCEEDED'
        : value.code === 'DUPLICATE_KEY'
          ? 'DUPLICATE_KEY'
          : value.code === 'TRAILING_CONTENT'
            ? 'TRAILING_CONTENT'
            : value.code === 'INVALID_NUMBER'
              ? 'INVALID_NUMBER'
              : 'PARSE_ERROR';
  return Object.freeze({ code, message: value.message, path: value.path });
}

const envelopeFields = [
  'format',
  'formatVersion',
  'integrityVersion',
  'schemaVersion',
  'createdAt',
  'payload',
  'checksum',
] as const;

const payloadFields = [
  'versions',
  'activeSession',
  'sessions',
  'decor',
  'optional',
  'sizes',
] as const;
const sizeFields = ['sessions', 'decor', 'optional', 'total', 'limit'] as const;

export interface SaveFileExpectation {
  /** The authored 125 catalog of this build; the inner archives replay against it. */
  readonly catalog: unknown;
  /** The engine/physics/map triple of this build; a different triple is a closed refusal. */
  readonly versions?: Omit<SaveFileVersions, 'schema'>;
}

export interface SaveFileValidationAccepted {
  readonly version: typeof SAVEFILE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: SaveFileDocument;
  readonly checksumVerified: true;
  readonly activeSession: SessionKind;
  readonly sessions: Readonly<Record<SessionKind, SaveFileSessionValidation | null>>;
  readonly decor: Readonly<Record<SessionKind, DestructibleSnapshot | null>>;
  readonly replays: readonly SaveFileReplayEntry[];
  readonly sizes: SaveFileSizes;
  readonly summary: SaveFileSummary;
  readonly bytes: number;
  readonly rejection: null;
}

export interface SaveFileValidationRejected {
  readonly version: typeof SAVEFILE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksumVerified: false;
  readonly activeSession: null;
  readonly sessions: null;
  readonly decor: null;
  readonly replays: null;
  readonly sizes: null;
  readonly summary: null;
  readonly bytes: 0;
  readonly rejection: SaveFileRejection;
}

export type SaveFileValidation = SaveFileValidationAccepted | SaveFileValidationRejected;

function readDeclaredSizes(value: unknown): SaveFileSizes {
  const data = exact(value, sizeFields, 'sizes');
  const sessions = exact(data.sessions, savefileSessionSlots, 'sizes.sessions');
  const decor = exact(data.decor, savefileSessionSlots, 'sizes.decor');
  const declared: SaveFileSizes = Object.freeze({
    sessions: Object.freeze({
      ACADEMY: integer(sessions.ACADEMY, 'sizes.sessions.ACADEMY'),
      CHAOS: integer(sessions.CHAOS, 'sizes.sessions.CHAOS'),
    }),
    decor: Object.freeze({
      ACADEMY: integer(decor.ACADEMY, 'sizes.decor.ACADEMY'),
      CHAOS: integer(decor.CHAOS, 'sizes.decor.CHAOS'),
    }),
    optional: integer(data.optional, 'sizes.optional'),
    total: integer(data.total, 'sizes.total'),
    limit: integer(data.limit, 'sizes.limit'),
  });
  if (declared.limit !== SAVEFILE_LIMITS.maxPayloadBytes) {
    fail(
      'SIZE_MISMATCH',
      `The savefile declares a ${declared.limit} byte limit; this build accepts ${SAVEFILE_LIMITS.maxPayloadBytes}`,
      'sizes.limit',
    );
  }
  if (declared.total > declared.limit) {
    fail(
      'FILE_TOO_LARGE',
      `The savefile declares ${declared.total} bytes, above its ${declared.limit} byte limit`,
      'sizes.total',
    );
  }
  return declared;
}

/**
 * Reads and verifies a savefile.
 *
 * Order: file bytes/depth, strict JSON, format/integrity, canonical form and byte budget, checksum,
 * schema, then the payload components and the size declaration. The checksum is verified before
 * the schema is interpreted, so a re-stamped file still has to pass every schema and component
 * rule, and a file whose checksum does not verify is never used to decide anything else.
 */
export function readSaveFile(input: unknown, expect: SaveFileExpectation): SaveFileValidation {
  try {
    if (typeof expect !== 'object' || expect === null || !Object.hasOwn(expect, 'catalog')) {
      fail('INVALID_FIELD', 'Expected the build catalog', 'expect');
    }
    let value = input;
    if (typeof input === 'string') {
      if (input.length > SAVEFILE_LIMITS.maxFileBytes) {
        fail(
          'FILE_TOO_LARGE',
          `The file has ${input.length} code units, above the ${SAVEFILE_LIMITS.maxFileBytes} budget`,
          '$',
        );
      }
      const parsed = parseStrictJson(input, {
        maxBytes: SAVEFILE_LIMITS.maxFileBytes,
        maxDepth: SAVEFILE_LIMITS.maxDepth,
      });
      if (parsed.status === 'REJECTED') {
        const rejection = strictRejection(parsed.rejection);
        throw new SaveFileError(rejection.code, rejection.message, rejection.path);
      }
      value = parsed.value;
    }
    const shape = object(value, '$');
    if (shape.format === SESSION_ARCHIVE_FORMAT) {
      fail(
        'LEGACY_SAVEFILE',
        'This is a session archive, not a savefile; migrate it explicitly with migrateSessionArchiveToSaveFile',
        'format',
      );
    }
    const envelope = exact(value, envelopeFields, '$');
    if (envelope.format !== SAVEFILE_FORMAT) {
      fail(
        'UNSUPPORTED_SAVEFILE_FORMAT',
        `Unsupported savefile format: ${String(envelope.format)}`,
        'format',
      );
    }
    const formatVersion = envelope.formatVersion;
    if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion)) {
      fail('UNSUPPORTED_FORMAT_VERSION', 'Expected an integer format version', 'formatVersion');
    }
    if (formatVersion > SAVEFILE_FORMAT_VERSION) {
      fail(
        'FORMAT_VERSION_TOO_NEW',
        `The file declares format version ${formatVersion}; this build reads ${SAVEFILE_FORMAT_VERSION}`,
        'formatVersion',
      );
    }
    if (formatVersion !== SAVEFILE_FORMAT_VERSION) {
      fail(
        'UNSUPPORTED_FORMAT_VERSION',
        `Unsupported savefile format version: ${formatVersion}`,
        'formatVersion',
      );
    }
    const integrityVersion = envelope.integrityVersion;
    if (typeof integrityVersion !== 'number' || !Number.isInteger(integrityVersion)) {
      fail('UNSUPPORTED_INTEGRITY', 'Expected an integer integrity version', 'integrityVersion');
    }
    if (integrityVersion !== SAVEFILE_INTEGRITY_VERSION) {
      fail(
        'UNSUPPORTED_INTEGRITY',
        `Unsupported integrity version: ${integrityVersion}; this build verifies ${SAVEFILE_INTEGRITY_VERSION}`,
        'integrityVersion',
      );
    }
    const canonical = canonicalizeJson(value, { maxDepth: SAVEFILE_LIMITS.maxDepth });
    if (canonical.status === 'REJECTED') {
      fail(
        canonical.rejection.code === 'UNSAFE_KEY'
          ? 'UNSAFE_KEY'
          : canonical.rejection.code === 'TOO_DEEP'
            ? 'DEPTH_EXCEEDED'
            : canonical.rejection.code === 'NON_FINITE_NUMBER'
              ? 'INVALID_NUMBER'
              : 'CANONICALIZATION_FAILED',
        canonical.rejection.message,
        canonical.rejection.path,
      );
    }
    if (canonical.text.length > SAVEFILE_LIMITS.maxFileBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The canonical file has ${canonical.text.length} code units, above the ${SAVEFILE_LIMITS.maxFileBytes} budget`,
        '$',
      );
    }
    const checksumData = exact(
      envelope.checksum,
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
    const computed = checksumOf({
      format: envelope.format,
      formatVersion: envelope.formatVersion,
      integrityVersion: envelope.integrityVersion,
      schemaVersion: envelope.schemaVersion,
      createdAt: envelope.createdAt,
      payload: envelope.payload,
    });
    if (computed !== declaredChecksum) {
      fail(
        'CHECKSUM_MISMATCH',
        'The savefile was modified or is corrupted; the game was not loaded',
        'checksum.value',
      );
    }
    // Only now is the schema interpreted: a correct checksum never makes an unknown schema usable.
    const schemaVersion = envelope.schemaVersion;
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
      fail('UNSUPPORTED_SCHEMA', 'Expected an integer schema version', 'schemaVersion');
    }
    if (schemaVersion > SAVEFILE_SCHEMA_VERSION) {
      fail(
        'SCHEMA_TOO_NEW',
        `The file declares schema version ${schemaVersion}; this build reads ${SAVEFILE_SCHEMA_VERSION}`,
        'schemaVersion',
      );
    }
    if (schemaVersion !== SAVEFILE_SCHEMA_VERSION) {
      fail('UNSUPPORTED_SCHEMA', `Unsupported savefile schema: ${schemaVersion}`, 'schemaVersion');
    }
    const createdAt = timestamp(envelope.createdAt, 'createdAt');
    const payload = exact(envelope.payload, payloadFields, 'payload');
    const versions = readVersions(payload.versions, 'payload.versions', true);
    if (expect.versions !== undefined) {
      for (const field of ['engine', 'physics', 'map'] as const) {
        const expected = expect.versions[field];
        if (expected !== undefined && versions[field] !== expected) {
          fail(
            'VERSION_MISMATCH',
            `The savefile targets ${field} version ${versions[field]}, not ${expected}`,
            `payload.versions.${field}`,
          );
        }
      }
    }
    const activeSession = requireSessionKind(payload.activeSession, 'payload.activeSession');
    const rawSessions = exact(payload.sessions, savefileSessionSlots, 'payload.sessions');
    const validations: Record<SessionKind, SaveFileSessionValidation | null> = {
      ACADEMY: null,
      CHAOS: null,
    };
    const sessions: Record<SessionKind, SaveFileSessionDocument | null> = {
      ACADEMY: null,
      CHAOS: null,
    };
    for (const kind of savefileSessionSlots) {
      const raw = rawSessions[kind];
      if (raw === null) continue;
      const path = `payload.sessions.${kind}`;
      const block = readSessionBlock(object(raw, path).session, `${path}.session`);
      const validation = readSessionArchiveWithEconomy(raw, {
        sessionId: block.sessionId,
        playerId: block.playerId,
        catalog: expect.catalog,
        versions: { engine: versions.engine, physics: versions.physics, map: versions.map },
      });
      if (validation.status === 'REJECTED') {
        throw new SessionArchiveEconomyError(
          validation.rejection.code,
          validation.rejection.message,
          validation.rejection.path,
        );
      }
      validations[kind] = validation;
      sessions[kind] = documentOf(validation);
    }
    checkSlots(activeSession, sessions);
    const rawDecor = exact(payload.decor, savefileSessionSlots, 'payload.decor');
    const decor: Record<SessionKind, DestructibleSnapshot | null> = { ACADEMY: null, CHAOS: null };
    for (const kind of savefileSessionSlots) {
      const raw = rawDecor[kind];
      if (raw === null) continue;
      decor[kind] = readDecorSnapshot(raw, `payload.decor.${kind}`);
    }
    checkDecor(sessions, decor);
    const optional = readOptional(payload.optional);
    const declaredSizes = readDeclaredSizes(payload.sizes);
    const measuredSizes = savefileSizes({ sessions, decor, optional }, declaredSizes.limit);
    enforceBudgets(measuredSizes);
    for (const field of ['optional', 'total', 'limit'] as const) {
      if (measuredSizes[field] !== declaredSizes[field]) {
        fail(
          'SIZE_MISMATCH',
          `The declared ${field} size is ${declaredSizes[field]}, measured ${measuredSizes[field]}`,
          `payload.sizes.${field}`,
        );
      }
    }
    for (const kind of savefileSessionSlots) {
      for (const slot of ['sessions', 'decor'] as const) {
        if (measuredSizes[slot][kind] !== declaredSizes[slot][kind]) {
          fail(
            'SIZE_MISMATCH',
            `The declared ${slot}.${kind} size is ${declaredSizes[slot][kind]}, measured ${measuredSizes[slot][kind]}`,
            `payload.sizes.${slot}.${kind}`,
          );
        }
      }
    }
    const document: SaveFileDocument = Object.freeze({
      format: SAVEFILE_FORMAT,
      formatVersion: SAVEFILE_FORMAT_VERSION,
      integrityVersion: SAVEFILE_INTEGRITY_VERSION,
      schemaVersion: SAVEFILE_SCHEMA_VERSION,
      createdAt,
      payload: Object.freeze({
        versions,
        activeSession,
        sessions: Object.freeze(sessions),
        decor: Object.freeze(decor),
        optional,
        sizes: declaredSizes,
      }),
      checksum: Object.freeze({
        algorithm: CHECKSUM_ALGORITHM,
        canonicalization: CANONICALIZATION_VERSION,
        value: declaredChecksum,
      }),
    });
    const summary = buildSummary({
      activeSession,
      createdAt,
      checksum: declaredChecksum,
      bytes: canonical.text.length,
      versions,
      validations,
      decor,
      optional,
      sizes: measuredSizes,
    });
    return Object.freeze({
      version: SAVEFILE_VERSION,
      status: 'ACCEPTED' as const,
      document,
      checksumVerified: true as const,
      activeSession,
      sessions: Object.freeze(validations),
      decor: Object.freeze(decor),
      replays: optional.replays,
      sizes: measuredSizes,
      summary,
      bytes: canonical.text.length,
      rejection: null,
    });
  } catch (error) {
    const rejection = toRejection(error);
    return Object.freeze({
      version: SAVEFILE_VERSION,
      status: 'REJECTED' as const,
      document: null as null,
      checksumVerified: false as const,
      activeSession: null as null,
      sessions: null as null,
      decor: null as null,
      replays: null as null,
      sizes: null as null,
      summary: null as null,
      bytes: 0 as const,
      rejection,
    });
  }
}

/* ------------------------------------------------------------------ progress */

export const savefilePhases = [
  'IDLE',
  'PREPARE',
  'SERIALIZE',
  'CANONICALIZE',
  'HASH',
  'VALIDATE',
  'STAGE',
  'COMMIT',
  'DONE',
] as const;
export type SaveFilePhase = (typeof savefilePhases)[number];

export interface SaveFileProgressStatus {
  readonly phase: SaveFilePhase;
  readonly completed: number;
  readonly total: number;
  readonly fraction: number;
  readonly cancelled: boolean;
  readonly failed: boolean;
  readonly code: SaveFileCode | null;
}

/** The writer's handle: a UI reads `status()` and calls `cancel()`. */
export interface SaveFileJob {
  readonly total: number;
  readonly cancelled: boolean;
  cancel(): void;
  advance(phase?: SaveFilePhase): void;
  fail(code: SaveFileCode): void;
  status(): SaveFileProgressStatus;
}

/**
 * A bounded progress handle. Cancellation is cooperative: the writer checks `cancelled` between
 * phases, and before the commit it throws inside the transaction so the replacement rolls back.
 */
export function createSaveFileJob(total = 4): SaveFileJob {
  const steps = Number.isSafeInteger(total) && total > 0 ? total : 4;
  let completed = 0;
  let phase: SaveFilePhase = 'IDLE';
  let cancelled = false;
  let failed = false;
  let code: SaveFileCode | null = null;
  return Object.freeze({
    total: steps,
    get cancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    },
    advance(next: SaveFilePhase = 'PREPARE') {
      if (cancelled || failed) return;
      phase = next;
      completed = next === 'DONE' ? steps : Math.min(steps, completed + 1);
    },
    fail(next: SaveFileCode) {
      failed = true;
      code = next;
    },
    status(): SaveFileProgressStatus {
      return Object.freeze({
        phase,
        completed,
        total: steps,
        fraction: steps === 0 ? 0 : Math.min(1, completed / steps),
        cancelled,
        failed,
        code,
      });
    },
  });
}

export const saveFileSources = ['FILE', 'AUTOSAVE'] as const;
export type SaveFileSource = (typeof saveFileSources)[number];

export const saveFileViewLabels = [
  'NOT_STARTED',
  'PREPARING_FILE',
  'FILE_READY',
  'AUTOSAVE_SAVED',
  'VALIDATING',
  'PREVIEW_READY',
  'REPLACING',
  'DONE',
  'FAILED',
  'CANCELLED',
] as const;
export type SaveFileViewLabel = (typeof saveFileViewLabels)[number];

export interface SaveFileView {
  readonly label: SaveFileViewLabel;
  readonly phase: SaveFilePhase;
  readonly source: SaveFileSource;
  /** The browser download cannot confirm a disk write, so the game never claims one. */
  readonly claimsBrowserWrite: false;
  /** A browser autosave and the prepared backup are separate states. */
  readonly autosaveSeparate: true;
  readonly progress: SaveFileProgressStatus;
}

/**
 * The status projection of a savefile action.
 *
 * The same phase list serves a browser autosave and a downloaded backup, but the label says which
 * one it is: `AUTOSAVE_SAVED` is a stored autosave, `FILE_READY` is a file prepared for download.
 */
export function saveFileView(
  progress: SaveFileProgressStatus,
  source: SaveFileSource,
): SaveFileView {
  const label = (): SaveFileViewLabel => {
    if (progress.failed) return 'FAILED';
    if (progress.cancelled) return 'CANCELLED';
    switch (progress.phase) {
      case 'IDLE':
        return 'NOT_STARTED';
      case 'PREPARE':
      case 'SERIALIZE':
      case 'CANONICALIZE':
      case 'HASH':
        return 'PREPARING_FILE';
      case 'VALIDATE':
        return 'VALIDATING';
      case 'STAGE':
        return 'PREVIEW_READY';
      case 'COMMIT':
        return 'REPLACING';
      case 'DONE':
        return source === 'AUTOSAVE' ? 'AUTOSAVE_SAVED' : 'FILE_READY';
    }
  };
  return Object.freeze({
    label: label(),
    phase: progress.phase,
    source,
    claimsBrowserWrite: false as const,
    autosaveSeparate: true as const,
    progress,
  });
}

/* -------------------------------------------------------------------- export */

export interface SaveFileSessionTarget {
  readonly sessionId: string;
  readonly playerId: string;
}

export interface SaveFileExportRequest {
  /** The sessions to read; an omitted slot is absent from the file, not an empty session. */
  readonly sessions: Readonly<Partial<Record<SessionKind, SaveFileSessionTarget>>>;
  readonly activeSession: SessionKind;
  readonly createdAt: string;
  readonly catalog: unknown;
  readonly versions?: Omit<SaveFileVersions, 'schema'>;
  /** The 227 snapshots of the same sessions; a snapshot of another session is refused. */
  readonly decor?: Readonly<Partial<Record<SessionKind, unknown | null>>>;
  readonly replays?: readonly unknown[];
  readonly progress?: SaveFileJob;
}

/**
 * Exports the requested sessions and their decor from the durable stores into one `.sdasave`.
 *
 * The repository is the only source: the 135/215 export reads the rows, the checkpoints and the
 * economy bundle, and the decor arrives from its owner (227) because it lives in the live world, not
 * in the database. Nothing is written and no reward is touched.
 */
export async function exportSaveFile(
  repository: LocalRepository,
  transactions: SessionArchiveTransactionRunner,
  request: SaveFileExportRequest,
): Promise<SaveFileBuildResult> {
  const job = request.progress;
  try {
    const createdAt = timestamp(request.createdAt, 'createdAt');
    const activeSession = requireSessionKind(request.activeSession, 'activeSession');
    job?.advance('PREPARE');
    const exported: Partial<Record<SessionKind, unknown | null>> = {};
    let inferred: Omit<SaveFileVersions, 'schema'> | null = request.versions ?? null;
    for (const kind of savefileSessionSlots) {
      const target = request.sessions[kind];
      if (target === undefined) {
        exported[kind] = null;
        continue;
      }
      if (job?.cancelled === true) {
        return rejected({
          code: 'CANCELLED',
          message: 'The savefile export was cancelled',
          path: kind,
        });
      }
      const result = await exportSessionArchiveWithEconomy(repository, transactions, {
        sessionId: target.sessionId,
        playerId: target.playerId,
        createdAt,
        catalog: request.catalog,
        ...(request.versions === undefined ? {} : { versions: request.versions }),
      });
      if (result.status === 'REJECTED') {
        return rejected({
          code: result.rejection.code,
          message: result.rejection.message,
          path: `sessions.${kind}.${result.rejection.path}`,
        });
      }
      exported[kind] = result.document;
      inferred ??= result.document.versions;
      job?.advance('SERIALIZE');
    }
    if (inferred === null) {
      return rejected({
        code: 'VERSION_MISMATCH',
        message: 'The savefile needs the engine/physics/map triple of the build',
        path: 'versions',
      });
    }
    const built = buildSaveFile({
      createdAt,
      activeSession,
      versions: inferred,
      catalog: request.catalog,
      sessions: exported,
      decor: request.decor ?? {},
      replays: request.replays ?? [],
    });
    if (built.status === 'ACCEPTED') {
      job?.advance('DONE');
    } else {
      job?.fail(built.rejection.code);
    }
    return built;
  } catch (error) {
    const rejection = toRejection(error);
    job?.fail(rejection.code);
    return rejected(rejection);
  }
}

/* ------------------------------------------------------------------- migration */

export interface SaveFileMigrationOptions {
  /** The slot the legacy archive becomes; the other slot stays absent. */
  readonly sessionKind?: SessionKind;
  readonly createdAt: string;
  readonly catalog: unknown;
  readonly activeSession?: SessionKind;
}

/**
 * Explicit migration of the previously delivered session archive (135 v1 or 215 v2) into a
 * savefile. A savefile reader refuses a bare archive with `LEGACY_SAVEFILE`; it never guesses that
 * an archive is a savefile. The migration keeps the inner document unchanged, so the original
 * checksum still proves the session bytes.
 */
export function migrateSessionArchiveToSaveFile(
  archive: unknown,
  options: SaveFileMigrationOptions,
): SaveFileBuildResult {
  try {
    const kind = options.sessionKind ?? 'ACADEMY';
    const envelope = object(archive, 'archive');
    const versions = readVersions(envelope.versions, 'archive.versions', false);
    return buildSaveFile({
      createdAt: options.createdAt,
      activeSession: options.activeSession ?? kind,
      versions,
      catalog: options.catalog,
      sessions: { [kind]: archive },
    });
  } catch (error) {
    return rejected(toRejection(error));
  }
}

/* ----------------------------------------------------------------------- store */

/** Stores one savefile replacement touches; `profiles` is read to resolve both generations. */
export const SAVEFILE_IMPORT_STORES: readonly PersistenceStoreName[] = Object.freeze([
  ...SESSION_ARCHIVE_IMPORT_STORES,
  'meta',
]);

/** The staged world a composition layer prepares before the database replacement commits. */
export interface SaveFileWorldSession {
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  readonly checkpointId: string | null;
  readonly checkpointTick: number | null;
  readonly decor: DestructibleSnapshot | null;
}

export interface SaveFileWorldPrepareInput {
  readonly activeSession: SessionKind;
  readonly sessions: readonly SaveFileWorldSession[];
}

export interface SaveFilePreparedWorld {
  readonly launch: typeof SAVEFILE_LAUNCH;
  /** Publishes the staged world; called only after the database transaction committed. */
  commit(): void;
  /** Drops the staged world without touching the live one. */
  discard(): void;
}

/**
 * The live-world port. The composition layer restores the snapshots on a fresh world and keeps the
 * live session untouched until `commit()`; a failure here is a closed `WORLD_PREPARE_FAILED`.
 */
export interface SaveFileWorldPort {
  prepare(input: SaveFileWorldPrepareInput): SaveFilePreparedWorld;
}

export interface SaveFileCurrentSlot {
  readonly sessionId: string;
  readonly playerId: string;
  readonly progressRows: number;
  readonly scenarios: number;
  readonly checkpointTick: number | null;
  readonly economy: 'FOUND' | 'EMPTY';
  readonly economyRevision: number | null;
  readonly xp: number | null;
  readonly xpMicroXp: number | null;
  readonly level: number | null;
}

export interface SaveFileCurrent {
  readonly sessions: Readonly<Record<SessionKind, SaveFileCurrentSlot | null>>;
  readonly totalXp: number;
  readonly fingerprint: string;
}

export interface SaveFilePreviewRequest {
  /** The file text or an already parsed object; the strict reader accepts both. */
  readonly document: unknown;
  /** When supplied, the file must name exactly these current session identities. */
  readonly targets?: Readonly<Partial<Record<SessionKind, SaveFileSessionTarget>>>;
}

export interface SaveFilePreviewAccepted {
  readonly status: 'ACCEPTED';
  readonly validation: SaveFileValidationAccepted;
  readonly current: SaveFileCurrent;
  /** Identity of this exact file; the replacement must present it as confirmation. */
  readonly previewId: string;
  readonly rejection: null;
}

export interface SaveFilePreviewRejected {
  readonly status: 'REJECTED';
  readonly validation: null;
  readonly current: null;
  readonly previewId: null;
  readonly rejection: SaveFileRejection;
}

export type SaveFilePreview = SaveFilePreviewAccepted | SaveFilePreviewRejected;

export interface SaveFileImportRequest extends SaveFilePreviewRequest {
  readonly confirmation?: Readonly<{ previewId: string }>;
  readonly hooks?: ProfileTransactionHooks;
  readonly progress?: SaveFileJob;
}

export interface SaveFileSlotCommit {
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly playerId: string;
  readonly progressRows: number;
  readonly scenarios: number;
  readonly checkpointId: string | null;
  readonly checkpointTick: number | null;
  readonly economy: 'WRITTEN' | 'REMOVED' | 'UNCHANGED';
  readonly economyRevision: number | null;
  readonly xp: number | null;
  readonly xpMicroXp: number | null;
  readonly level: number | null;
}

export interface SaveFileImportAccepted {
  readonly version: typeof SAVEFILE_VERSION;
  readonly status: 'COMMITTED' | 'CRASHED_AFTER_COMMIT';
  readonly crashAfterCommit: boolean;
  readonly checksum: string;
  readonly bytes: number;
  readonly summary: SaveFileSummary;
  readonly activeSession: SessionKind;
  readonly launch: typeof SAVEFILE_LAUNCH;
  readonly replacement: Readonly<Record<SessionKind, SaveFileSlotCommit | null>>;
  /** Structural: this path never settles a ride, credits XP or grants a daily reward. */
  readonly rewards: Readonly<{ settled: 0; granted: 0; xpDelta: number }>;
  readonly validation: SaveFileValidationAccepted;
  readonly rejection: null;
}

export interface SaveFileImportRejected {
  readonly version: typeof SAVEFILE_VERSION;
  readonly status: 'REJECTED';
  readonly crashAfterCommit: false;
  readonly checksum: null;
  readonly bytes: 0;
  readonly summary: null;
  readonly activeSession: null;
  readonly launch: null;
  readonly replacement: null;
  readonly rewards: null;
  readonly validation: null;
  readonly rejection: SaveFileRejection;
}

export type SaveFileImportResult = SaveFileImportAccepted | SaveFileImportRejected;

function importRejected(rejection: SaveFileRejection): SaveFileImportRejected {
  return Object.freeze({
    version: SAVEFILE_VERSION,
    status: 'REJECTED' as const,
    crashAfterCommit: false as const,
    checksum: null as null,
    bytes: 0 as const,
    summary: null as null,
    activeSession: null as null,
    launch: null as null,
    replacement: null as null,
    rewards: null as null,
    validation: null as null,
    rejection: Object.freeze(rejection),
  });
}

export interface SaveFileStoreOptions {
  readonly repository: LocalRepository;
  readonly transactions: SessionArchiveTransactionRunner;
  readonly catalog: unknown;
  readonly versions?: Omit<SaveFileVersions, 'schema'>;
  /** Optional live-world staging; without it only the durable state is replaced. */
  readonly world?: SaveFileWorldPort;
}

export interface SaveFileStore {
  readonly preview: (request: SaveFilePreviewRequest) => Promise<SaveFilePreview>;
  readonly import: (request: SaveFileImportRequest) => Promise<SaveFileImportResult>;
}

function currentOfSlot(
  current: {
    readonly progressRows: number;
    readonly scenarios: number;
    readonly checkpointTick: number | null;
    readonly economy: 'FOUND' | 'EMPTY';
    readonly economyRevision: number | null;
    readonly xp: number | null;
    readonly xpMicroXp: number | null;
    readonly level: number | null;
  },
  target: SaveFileSessionTarget,
): SaveFileCurrentSlot {
  return Object.freeze({
    sessionId: target.sessionId,
    playerId: target.playerId,
    progressRows: current.progressRows,
    scenarios: current.scenarios,
    checkpointTick: current.checkpointTick,
    economy: current.economy,
    economyRevision: current.economyRevision,
    xp: current.xp,
    xpMicroXp: current.xpMicroXp,
    level: current.level,
  });
}

async function readCurrentSlot(
  repository: LocalRepository,
  transactions: SessionArchiveTransactionRunner,
  target: SaveFileSessionTarget,
): Promise<SaveFileCurrentSlot> {
  const rows = await repository.readPlayerSave(target.sessionId, target.playerId);
  const scenarios = await repository.listScenarios(target.sessionId);
  const checkpoint = await repository.latestCheckpoint(target.sessionId);
  const economy = await transactions.transact(['meta'], (transaction) =>
    loadEconomySave(transaction, { sessionId: target.sessionId, playerId: target.playerId }),
  );
  return currentOfSlot(
    {
      progressRows: rows.progress.length,
      scenarios: scenarios.length,
      checkpointTick: checkpoint?.tick ?? null,
      economy: economy.status,
      economyRevision: economy.status === 'FOUND' ? economy.revision : null,
      xp: economy.status === 'FOUND' ? economy.counts.xpBalance : null,
      xpMicroXp: economy.status === 'FOUND' ? economy.counts.xpBalanceMicroXp : null,
      level: economy.status === 'FOUND' ? economy.counts.level : null,
    },
    target,
  );
}

async function readCurrent(
  repository: LocalRepository,
  transactions: SessionArchiveTransactionRunner,
  sessions: Readonly<Record<SessionKind, SaveFileSessionValidation | null>>,
): Promise<SaveFileCurrent> {
  const slots: Record<SessionKind, SaveFileCurrentSlot | null> = { ACADEMY: null, CHAOS: null };
  for (const kind of savefileSessionSlots) {
    const slot = sessions[kind];
    if (slot === null) continue;
    slots[kind] = await readCurrentSlot(repository, transactions, {
      sessionId: slot.session.sessionId,
      playerId: slot.session.playerId,
    });
  }
  const totalXp = savefileSessionSlots.reduce((sum, kind) => sum + (slots[kind]?.xp ?? 0), 0);
  return Object.freeze({
    sessions: Object.freeze(slots),
    totalXp,
    fingerprint: sha256Hex(
      JSON.stringify({
        sessions: slots,
        totalXp,
      }),
    ),
  });
}

function checkTargets(
  validation: SaveFileValidationAccepted,
  targets: Readonly<Partial<Record<SessionKind, SaveFileSessionTarget>>> | undefined,
): void {
  if (targets === undefined) return;
  for (const kind of savefileSessionSlots) {
    const target = targets[kind];
    if (target === undefined) continue;
    const slot = validation.sessions[kind];
    if (slot === null) {
      fail(
        'SESSION_MISMATCH',
        `The file has no ${kind} session to replace ${target.sessionId}`,
        `payload.sessions.${kind}`,
      );
    }
    if (slot.session.sessionId !== target.sessionId || slot.session.playerId !== target.playerId) {
      fail(
        'SESSION_MISMATCH',
        `The ${kind} slot names ${slot.session.sessionId}/${slot.session.playerId}, not ${target.sessionId}/${target.playerId}`,
        `payload.sessions.${kind}.session`,
      );
    }
  }
}

function cancelledRejection(path: string): SaveFileRejection {
  return Object.freeze({
    code: 'CANCELLED' as const,
    message: 'The savefile import was cancelled before the replacement committed',
    path,
  });
}

interface SlotCommitInput {
  readonly sessionKind: SessionKind;
  readonly validation: SaveFileSessionValidation;
  readonly catalog: unknown;
  readonly hooks: ProfileTransactionHooks;
  readonly job?: SaveFileJob;
}

async function commitSaveFileSlot(
  transaction: TransactionPort,
  input: SlotCommitInput,
): Promise<SaveFileSlotCommit> {
  const { sessionKind: kind, validation, catalog, hooks, job } = input;
  const session = await commitSessionArchiveRows(transaction, validation.archive, catalog, {
    beforeCommit: () => {
      if (job?.cancelled === true) throw new SaveFileError('CANCELLED', 'Cancelled', kind);
      hooks.beforeCommit?.();
    },
  });
  const base = {
    sessionKind: kind,
    sessionId: session.sessionId,
    playerId: session.playerId,
    progressRows: session.progress.length,
    scenarios: session.scenarios,
    checkpointId: session.checkpointId,
    checkpointTick: session.checkpointTick,
  };
  if (validation.status === 'LEGACY') {
    return Object.freeze({
      ...base,
      economy: 'UNCHANGED' as const,
      economyRevision: null,
      xp: null,
      xpMicroXp: null,
      level: null,
    });
  }
  const expect = {
    sessionId: session.sessionId,
    playerId: session.playerId,
    worldEpoch: session.worldEpoch,
  };
  if (validation.economy === null) {
    const removed = await deleteEconomySaveRows(transaction, session.sessionId);
    const after = await loadEconomySave(transaction, expect);
    if (after.status !== 'EMPTY') {
      throw new SessionArchiveEconomyError(
        'ECONOMY_IMPORT_MISMATCH',
        'The economy bundle was not removed',
        'meta',
      );
    }
    return Object.freeze({
      ...base,
      economy: removed.deleted ? ('REMOVED' as const) : ('UNCHANGED' as const),
      economyRevision: null,
      xp: null,
      xpMicroXp: null,
      level: null,
    });
  }
  const commit = await commitEconomySaveRows(transaction, validation.economy, {
    updatedAt: validation.document.createdAt,
    beforeCommit: () => {
      if (job?.cancelled === true) throw new SaveFileError('CANCELLED', 'Cancelled', kind);
      hooks.beforeCommit?.();
    },
  });
  const stored = await loadEconomySave(transaction, expect);
  if (stored.status === 'EMPTY') {
    throw new SessionArchiveEconomyError(
      'ECONOMY_IMPORT_MISMATCH',
      'The imported economy bundle is not stored',
      'meta',
    );
  }
  if (
    stored.counts.xpBalanceMicroXp !== validation.counts.xpBalanceMicroXp ||
    stored.counts.dailyRewards !== validation.counts.dailyRewards ||
    stored.counts.settlements !== validation.counts.settlements
  ) {
    throw new SessionArchiveEconomyError(
      'ECONOMY_IMPORT_MISMATCH',
      'The stored economy is not the archived one; the replacement was rolled back',
      'meta',
    );
  }
  return Object.freeze({
    ...base,
    economy: 'WRITTEN' as const,
    economyRevision: commit.revision,
    xp: stored.counts.xpBalance,
    xpMicroXp: stored.counts.xpBalanceMicroXp,
    level: stored.counts.level,
  });
}

/**
 * The application-facing savefile port.
 *
 * `preview` validates the file and describes both the file summary and the current session it would
 * replace. `import` requires that preview identity and replaces every present slot in one
 * transaction; a cancelled or failed replacement leaves the previous bytes untouched.
 */
export function createSaveFileStore(options: SaveFileStoreOptions): SaveFileStore {
  const repository = options.repository;
  const transactions = options.transactions;
  const catalog = options.catalog;
  const world = options.world;
  let pending: { readonly checksum: string; readonly current: SaveFileCurrent } | null = null;

  async function preview(request: SaveFilePreviewRequest): Promise<SaveFilePreview> {
    const validation = readSaveFile(request.document, {
      catalog,
      ...(options.versions === undefined ? {} : { versions: options.versions }),
    });
    if (validation.status === 'REJECTED') {
      return Object.freeze({
        status: 'REJECTED' as const,
        validation: null,
        current: null,
        previewId: null,
        rejection: validation.rejection,
      });
    }
    try {
      checkTargets(validation, request.targets);
      const current = await readCurrent(repository, transactions, validation.sessions);
      pending = { checksum: validation.summary.checksum, current };
      return Object.freeze({
        status: 'ACCEPTED' as const,
        validation,
        current,
        previewId: validation.summary.checksum,
        rejection: null,
      });
    } catch (error) {
      return Object.freeze({
        status: 'REJECTED' as const,
        validation: null,
        current: null,
        previewId: null,
        rejection: toRejection(error),
      });
    }
  }

  async function importSaveFile(request: SaveFileImportRequest): Promise<SaveFileImportResult> {
    const job = request.progress;
    const validation = readSaveFile(request.document, {
      catalog,
      ...(options.versions === undefined ? {} : { versions: options.versions }),
    });
    if (validation.status === 'REJECTED') {
      job?.fail(validation.rejection.code);
      return importRejected(validation.rejection);
    }
    job?.advance('VALIDATE');
    if (pending === null) {
      return importRejected({
        code: 'PREVIEW_REQUIRED',
        message: 'The replacement needs the summary of a validated file before it can confirm',
        path: 'confirmation',
      });
    }
    if (request.confirmation === undefined) {
      return importRejected({
        code: 'PREVIEW_REQUIRED',
        message: 'The replacement needs the confirmation of the previewed summary',
        path: 'confirmation',
      });
    }
    if (
      request.confirmation.previewId !== pending.checksum ||
      validation.summary.checksum !== pending.checksum
    ) {
      return importRejected({
        code: 'PREVIEW_STALE',
        message: 'The confirmed preview does not describe this file',
        path: 'confirmation.previewId',
      });
    }
    const status = repository.status();
    if (status.state !== 'READY') {
      return importRejected({
        code: 'REPOSITORY_CLOSED',
        message: `The repository is ${status.state}`,
        path: 'repository',
      });
    }
    if (status.role !== 'WRITER') {
      return importRejected({
        code: 'WRITER_REQUIRED',
        message:
          'This page does not own the writer lock; a savefile import never runs in a second tab',
        path: 'writer',
      });
    }
    try {
      checkTargets(validation, request.targets);
    } catch (error) {
      return importRejected(toRejection(error));
    }
    let prepared: SaveFilePreparedWorld | null = null;
    if (world !== undefined) {
      try {
        prepared = world.prepare({
          activeSession: validation.activeSession,
          sessions: savefileSessionSlots.flatMap((kind) => {
            const slot = validation.sessions[kind];
            if (slot === null) return [];
            return [
              Object.freeze({
                sessionKind: kind,
                sessionId: slot.session.sessionId,
                playerId: slot.session.playerId,
                worldEpoch: slot.session.worldEpoch,
                checkpointId: slot.archive.components.checkpoint?.checkpointId ?? null,
                checkpointTick: slot.archive.components.checkpoint?.tick ?? null,
                decor: validation.decor[kind],
              }),
            ];
          }),
        });
      } catch (error) {
        job?.fail('WORLD_PREPARE_FAILED');
        return importRejected({
          code: 'WORLD_PREPARE_FAILED',
          message: `The world could not be staged: ${describe(error)}`,
          path: 'world',
        });
      }
    }
    job?.advance('STAGE');
    if (job?.cancelled === true) {
      prepared?.discard();
      return importRejected(cancelledRejection('progress'));
    }
    job?.advance('COMMIT');
    const slots: Record<SessionKind, SaveFileSlotCommit | null> = { ACADEMY: null, CHAOS: null };
    try {
      const written = await transactions.transact(
        SAVEFILE_IMPORT_STORES,
        async (transaction: TransactionPort) => {
          const result: Record<SessionKind, SaveFileSlotCommit | null> = {
            ACADEMY: null,
            CHAOS: null,
          };
          for (const kind of savefileSessionSlots) {
            const slot = validation.sessions[kind];
            if (slot === null) continue;
            result[kind] = await commitSaveFileSlot(transaction, {
              sessionKind: kind,
              validation: slot,
              catalog,
              hooks: request.hooks ?? {},
              ...(job === undefined ? {} : { job }),
            });
          }
          return result;
        },
      );
      slots.ACADEMY = written.ACADEMY;
      slots.CHAOS = written.CHAOS;
    } catch (error) {
      prepared?.discard();
      const rejection = toRejection(error);
      job?.fail(rejection.code);
      return importRejected(rejection);
    }
    let crashAfterCommit = false;
    try {
      prepared?.commit();
    } catch {
      crashAfterCommit = true;
    }
    if (request.hooks?.afterCommit !== undefined) {
      try {
        request.hooks.afterCommit();
      } catch {
        crashAfterCommit = true;
      }
    }
    const before = pending.current;
    let xpDelta = 0;
    for (const kind of savefileSessionSlots) {
      const after = slots[kind];
      if (after === null) continue;
      xpDelta += (after.xp ?? 0) - (before.sessions[kind]?.xp ?? 0);
    }
    pending = null;
    job?.advance('DONE');
    return Object.freeze({
      version: SAVEFILE_VERSION,
      status: crashAfterCommit ? ('CRASHED_AFTER_COMMIT' as const) : ('COMMITTED' as const),
      crashAfterCommit,
      checksum: validation.summary.checksum,
      bytes: validation.summary.bytes,
      summary: validation.summary,
      activeSession: validation.activeSession,
      launch: SAVEFILE_LAUNCH,
      replacement: Object.freeze(slots),
      rewards: Object.freeze({
        settled: 0 as const,
        granted: 0 as const,
        xpDelta,
      }),
      validation,
      rejection: null,
    });
  }

  return Object.freeze({ preview, import: importSaveFile });
}
