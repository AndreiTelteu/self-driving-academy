import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  parseStrictJson,
  sha256Hex,
} from './canonical-json';
import type { StrictJsonRejection } from './canonical-json';
import { PERSISTENCE_LIMITS } from './contracts';
import { measureJsonBytes } from './records';
import {
  SESSION_KINDS_VERSION,
  computeSessionKindCheckpointChecksum,
  sessionKinds,
  verifySessionKindCheckpoint,
} from './session-kinds';
import type { SessionKind, SessionKindCheckpoint } from './session-kinds';

/**
 * The live `.sdasave` file for PBI 278.
 *
 * The delivered file (234) carries the 135/215 archive of both sessions and is imported by an
 * IndexedDB transaction. This build does not have a world snapshot 206 row or a real IndexedDB
 * composition yet, so the live vertical needs a coherent generation of the *owners that are mounted*:
 * the 225 session checkpoint, the active 109/110 style, the 276 daily/XP ledger checkpoint, the 277
 * challenge checkpoint, the 268/269 company and the read-only 209 KPI/company snapshot.
 *
 * The document therefore reuses both delivered layers instead of inventing a parallel one:
 *
 * 1. the payload is a real `SessionKindCheckpoint` (225) with its own SHA-256 checksum; its `body`
 *    is the versioned `278-live-state-v1` manifest and every owner snapshot travels inside it;
 * 2. the envelope uses the same `SDA-CJSON-1`/`SHA-256` rules, the same strict parser and the same
 *    `.sdasave` extension as 234, so a reader of the file has one integrity vocabulary;
 * 3. `preview` returns the checksum as the preview identity; a replacement must present exactly
 *    that identity, so a confirmation cannot approve another file;
 * 4. the file is only data: nothing here settles a ride, credits XP or grants a daily reward. A
 *    second import writes the same owner state and cannot add a reward.
 *
 * The 206 world snapshot is deliberately absent: 278 owns the live vertical above, not a second
 * physics snapshot. The `resume` block still records the 206/225 reload decision explicitly:
 * `PAUSED_AUTO`, input released, the previous open segments named `INCOMPLETE` and zero offline
 * income/XP.
 */

export const LIVE_SAVE_VERSION = '278-live-save-v1' as const;
export const LIVE_SAVE_FORMAT = 'self-driving-academy-live-save' as const;
export const LIVE_SAVE_FORMAT_VERSION = 1 as const;
export const LIVE_SAVE_INTEGRITY_VERSION = 1 as const;
export const LIVE_SAVE_SCHEMA_VERSION = 1 as const;
export const LIVE_SAVE_SCHEMA_ID = '278-live-save-schema-1' as const;
export const LIVE_SAVE_STATE_VERSION = '278-live-state-v1' as const;
export const LIVE_SAVE_EXTENSION = '.sdasave' as const;
export const LIVE_SAVE_MIME_TYPE = 'application/json' as const;

export const LIVE_SAVE_LIMITS = Object.freeze({
  /** The whole canonical file, the 234 file budget. */
  maxFileBytes: PERSISTENCE_LIMITS.maxRecordBytes,
  /** The 225 body budget; every owner snapshot travels inside it. */
  maxBodyBytes: PERSISTENCE_LIMITS.maxBodyBytes,
  maxDepth: 32,
});

export const liveSaveCodes = [
  'UNSUPPORTED_LIVE_SAVE_FORMAT',
  'UNSUPPORTED_LIVE_SAVE_INTEGRITY',
  'LIVE_SAVE_TOO_LARGE',
  'LIVE_SAVE_STATE_INVALID',
  'LIVE_SAVE_SESSION_MISMATCH',
  'LIVE_SAVE_CHECKPOINT_INVALID',
  'LIVE_SAVE_SIZE_MISMATCH',
  'LIVE_SAVE_PREVIEW_REQUIRED',
  'LIVE_SAVE_PREVIEW_STALE',
  'LIVE_SAVE_WRITE_FAILED',
  'LIVE_SAVE_RESTORE_FAILED',
  'LIVE_SAVE_NOT_EMPTY',
] as const;

export type LiveSaveBoundaryCode = (typeof liveSaveCodes)[number];

/** Codes of the strict parser, the 225 checker and the file boundary. */
export type LiveSaveCode =
  | LiveSaveBoundaryCode
  | 'CHECKSUM_MISMATCH'
  | 'DUPLICATE_KEY'
  | 'TRAILING_CONTENT'
  | 'PARSE_ERROR'
  | 'INVALID_NUMBER'
  | 'INVALID_LITERAL'
  | 'DEPTH_EXCEEDED'
  | 'UNSAFE_KEY'
  | 'CANONICALIZATION_FAILED'
  | 'FILE_TOO_LARGE'
  | 'MISSING_FIELD'
  | 'UNKNOWN_FIELD'
  | 'INVALID_FIELD'
  | 'INVALID_IDENTITY'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_COUNTER'
  | 'FORMAT_VERSION_TOO_NEW'
  | 'SCHEMA_TOO_NEW'
  | 'UNSUPPORTED_FORMAT_VERSION'
  | 'UNSUPPORTED_ALGORITHM'
  | 'UNSUPPORTED_CANONICALIZATION'
  | 'CHECKPOINT_INVALID';

export interface LiveSaveRejection {
  readonly code: LiveSaveCode;
  readonly message: string;
  readonly path: string;
}

export class LiveSaveError extends Error {
  readonly code: LiveSaveCode;
  readonly path: string;

  constructor(code: LiveSaveCode, message: string, path: string) {
    super(message);
    this.name = 'LiveSaveError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: LiveSaveCode, message: string, path: string): never {
  throw new LiveSaveError(code, message, path);
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const FINGERPRINT = /^[A-Za-z0-9:_@.+-]{1,256}$/;

function plainObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    fail('INVALID_FIELD', 'Expected a plain object', path);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    fail('INVALID_FIELD', 'Expected plain data, not a class instance', path);
  return value as Record<string, unknown>;
}

function exact(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  const data = plainObject(value, path);
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) fail('UNKNOWN_FIELD', `Unknown field: ${key}`, `${path}.${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(data, key)) fail('MISSING_FIELD', `Missing field: ${key}`, `${path}.${key}`);
  }
  return data;
}

function identity(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256)
    fail('INVALID_IDENTITY', 'Expected a bounded identity', path);
  if (value.trim() !== value) fail('INVALID_IDENTITY', 'The identity must not be padded', path);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) fail('INVALID_IDENTITY', 'Expected a bounded identity', path);
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail('INVALID_COUNTER', 'Expected a nonnegative safe integer', path);
  return value;
}

function timestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value)))
    fail('INVALID_TIMESTAMP', 'Expected a UTC ISO 8601 timestamp', path);
  return value;
}

function fingerprint(value: unknown, path: string): string {
  if (typeof value !== 'string' || !FINGERPRINT.test(value))
    fail('INVALID_IDENTITY', 'Expected a fingerprint token', path);
  return value;
}

function requireSessionKind(value: unknown, path: string): SessionKind {
  if (typeof value !== 'string' || !(sessionKinds as readonly string[]).includes(value))
    fail('INVALID_FIELD', `Expected one of ${sessionKinds.join('/')}`, path);
  return value as SessionKind;
}

function canonical(value: unknown, path: string): string {
  const result = canonicalizeJson(value, { maxDepth: LIVE_SAVE_LIMITS.maxDepth });
  if (result.status === 'REJECTED') {
    fail(
      result.rejection.code === 'UNSAFE_KEY'
        ? 'UNSAFE_KEY'
        : result.rejection.code === 'TOO_DEEP'
          ? 'DEPTH_EXCEEDED'
          : result.rejection.code === 'NON_FINITE_NUMBER'
            ? 'INVALID_NUMBER'
            : 'CANONICALIZATION_FAILED',
      result.rejection.message,
      result.rejection.path === '$' ? path : result.rejection.path,
    );
  }
  return result.text;
}

function digestText(text: string): string {
  return sha256Hex(text);
}

/* ------------------------------------------------------------------------- state */

export interface LiveSaveSessionIdentity {
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly activeVersionId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly tick: number;
  /** Current three-mode authority, reported verbatim; reload always starts AUTO. */
  readonly mode: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly vehicles: number;
  readonly manualVehicles: number;
}

export interface LiveSaveResume {
  readonly launch: 'PAUSED_AUTO';
  readonly paused: true;
  readonly auto: true;
  readonly inputReleased: true;
  /** `INCOMPLETE` when the saved world had an open segment; `NONE` when it had none. */
  readonly previousSegment: 'INCOMPLETE' | 'NONE';
  readonly openSegmentIds: readonly string[];
  /** Structural proof that a reload never pays for the wall-clock interval. */
  readonly offlineIncome: 0;
  readonly offlineXp: 0;
}

export interface LiveSaveFingerprints {
  readonly xp: string;
  readonly kpi: string;
  readonly company: string;
  readonly profile: string;
  readonly daily: string;
  readonly challenges: string;
}

/** The versioned manifest inside the 225 checkpoint body. */
export interface LiveSaveState {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof LIVE_SAVE_STATE_VERSION;
  readonly identity: LiveSaveSessionIdentity;
  /** Owner-provided values for the summary; the body never recomputes a business number. */
  readonly metrics: Readonly<{
    xp: number;
    xpMicroXp: number;
    level: number;
    dailyRewards: number;
  }>;
  /** The active 109-derived style, plain JSON and verified by the owner on restore. */
  readonly profile: Readonly<Record<string, unknown>>;
  /** The 276 reload checkpoint (212 daily + 213 player). */
  readonly daily: Readonly<Record<string, unknown>>;
  /** The 277 checkpoint, or `null` when the challenge owner is not mounted. */
  readonly challenges: Readonly<Record<string, unknown>> | null;
  /** The 268 finance snapshot plus the 269 evolution journal, or `null`. */
  readonly company: Readonly<Record<string, unknown>> | null;
  /** The read-only 209/KPI snapshot; it is preserved, never replayed as a second ledger. */
  readonly economy: Readonly<Record<string, unknown>> | null;
  readonly resume: LiveSaveResume;
  readonly fingerprints: LiveSaveFingerprints;
}

export interface LiveSavePayload {
  readonly versions: Readonly<{
    engine: string;
    physics: string;
    map: string;
    schema: typeof LIVE_SAVE_SCHEMA_ID;
  }>;
  readonly generation: number;
  readonly checkpoint: SessionKindCheckpoint;
  readonly sizes: Readonly<{
    bodyBytes: number;
    total: number;
    limit: number;
  }>;
}

export interface LiveSaveDocument {
  readonly format: typeof LIVE_SAVE_FORMAT;
  readonly formatVersion: typeof LIVE_SAVE_FORMAT_VERSION;
  readonly integrityVersion: typeof LIVE_SAVE_INTEGRITY_VERSION;
  readonly schemaVersion: typeof LIVE_SAVE_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly payload: LiveSavePayload;
  readonly checksum: Readonly<{
    algorithm: typeof CHECKSUM_ALGORITHM;
    canonicalization: typeof CANONICALIZATION_VERSION;
    value: string;
  }>;
}

export interface LiveSaveSummary {
  readonly version: typeof LIVE_SAVE_VERSION;
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly activeVersionId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly tick: number;
  readonly generation: number;
  readonly mode: string;
  readonly createdAt: string;
  readonly checksum: string;
  readonly bytes: number;
  readonly bodyBytes: number;
  readonly xp: number;
  readonly xpMicroXp: number;
  readonly level: number;
  readonly dailyDate: string | null;
  readonly dailyRewards: number;
  readonly challengeRecords: number;
  readonly companyCashMinorUnits: number | null;
  readonly companyRevenueMinorUnits: number | null;
  readonly companyProfitMinorUnits: number | null;
  readonly kpiRevenueMinorUnits: number | null;
  readonly kpiDays: number;
  readonly profileVersionId: string;
  readonly resume: LiveSaveResume;
  readonly fingerprints: LiveSaveFingerprints;
}

/* ---------------------------------------------------------------------- checksum */

const envelopeFields = [
  'format',
  'formatVersion',
  'integrityVersion',
  'schemaVersion',
  'createdAt',
  'payload',
  'checksum',
] as const;
const payloadFields = ['versions', 'generation', 'checkpoint', 'sizes'] as const;
const versionFields = ['engine', 'physics', 'map', 'schema'] as const;
const sizeFields = ['bodyBytes', 'total', 'limit'] as const;
const checksumFields = ['algorithm', 'canonicalization', 'value'] as const;

function checksumOf(parts: {
  readonly format: unknown;
  readonly formatVersion: unknown;
  readonly integrityVersion: unknown;
  readonly schemaVersion: unknown;
  readonly createdAt: unknown;
  readonly payload: unknown;
}): string {
  return digestText(
    canonical(
      {
        format: parts.format,
        formatVersion: parts.formatVersion,
        integrityVersion: parts.integrityVersion,
        schemaVersion: parts.schemaVersion,
        createdAt: parts.createdAt,
        payload: parts.payload,
      },
      'checksum',
    ),
  );
}

/** The `SHA-256` checksum of a live savefile without the top-level `checksum`. */
export function computeLiveSaveChecksum(
  document: Omit<LiveSaveDocument, 'checksum'> | LiveSaveDocument,
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

function stamp(document: Omit<LiveSaveDocument, 'checksum'>): LiveSaveDocument {
  const payload = document;
  return Object.freeze({
    ...payload,
    checksum: Object.freeze({
      algorithm: CHECKSUM_ALGORITHM,
      canonicalization: CANONICALIZATION_VERSION,
      value: computeLiveSaveChecksum(payload),
    }),
  });
}

/** Deterministic, filesystem-safe file name, the same shape as the 234 backup. */
export function liveSaveFileName(createdAt: string): string {
  const stampText = timestamp(createdAt, 'createdAt').replace(/[-:.]/g, '');
  return `self-driving-academy-live-${stampText}${LIVE_SAVE_EXTENSION}`;
}

/* ------------------------------------------------------------------------ builder */

export interface LiveSaveBuildInput {
  readonly createdAt: string;
  readonly checkpointId: string;
  readonly reason: 'AUTOSAVE' | 'SESSION_SWITCH' | 'CLOSE' | 'SCENARIO_RESET';
  readonly generation: number;
  readonly identity: LiveSaveSessionIdentity;
  readonly metrics: Readonly<{
    xp: number;
    xpMicroXp: number;
    level: number;
    dailyRewards: number;
  }>;
  readonly versions: Readonly<{ engine: string; physics: string; map: string }>;
  readonly profile: unknown;
  readonly daily: unknown;
  readonly challenges: unknown | null;
  readonly company: unknown | null;
  readonly economy: unknown | null;
  readonly resume: LiveSaveResume;
  readonly fingerprints: LiveSaveFingerprints;
}

export interface LiveSaveBuildAccepted {
  readonly version: typeof LIVE_SAVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: LiveSaveDocument;
  readonly text: string;
  readonly checksum: string;
  readonly bytes: number;
  readonly summary: LiveSaveSummary;
  readonly rejection: null;
}

export interface LiveSaveBuildRejected {
  readonly version: typeof LIVE_SAVE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly text: null;
  readonly checksum: null;
  readonly bytes: 0;
  readonly summary: null;
  readonly rejection: LiveSaveRejection;
}

export type LiveSaveBuildResult = LiveSaveBuildAccepted | LiveSaveBuildRejected;

function toRejection(error: unknown): LiveSaveRejection {
  if (error instanceof LiveSaveError)
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  return Object.freeze({
    code: 'LIVE_SAVE_STATE_INVALID' as const,
    message: error instanceof Error ? error.message : String(error),
    path: '$',
  });
}

function rejected(rejection: LiveSaveRejection): LiveSaveBuildRejected {
  return Object.freeze({
    version: LIVE_SAVE_VERSION,
    status: 'REJECTED' as const,
    document: null,
    text: null,
    checksum: null,
    bytes: 0 as const,
    summary: null,
    rejection: Object.freeze(rejection),
  });
}

function plainSlot(value: unknown, path: string): Readonly<Record<string, unknown>> | null {
  if (value === null || value === undefined) return null;
  return Object.freeze(plainObject(value, path));
}

function readIdentity(value: unknown): LiveSaveSessionIdentity {
  const data = exact(
    value,
    [
      'sessionKind',
      'sessionId',
      'playerId',
      'profileId',
      'activeVersionId',
      'worldEpoch',
      'learningEpoch',
      'tick',
      'mode',
      'vehicles',
      'manualVehicles',
    ],
    'identity',
  );
  const mode = data.mode;
  if (mode !== 'AUTO' && mode !== 'MANUAL' && mode !== 'LEARNING')
    fail('INVALID_FIELD', 'Expected AUTO/MANUAL/LEARNING', 'identity.mode');
  return Object.freeze({
    sessionKind: requireSessionKind(data.sessionKind, 'identity.sessionKind'),
    sessionId: identity(data.sessionId, 'identity.sessionId'),
    playerId: identity(data.playerId, 'identity.playerId'),
    profileId: identity(data.profileId, 'identity.profileId'),
    activeVersionId: identity(data.activeVersionId, 'identity.activeVersionId'),
    worldEpoch: integer(data.worldEpoch, 'identity.worldEpoch'),
    learningEpoch: integer(data.learningEpoch, 'identity.learningEpoch'),
    tick: integer(data.tick, 'identity.tick'),
    mode,
    vehicles: integer(data.vehicles, 'identity.vehicles'),
    manualVehicles: integer(data.manualVehicles, 'identity.manualVehicles'),
  });
}

function readResume(value: unknown): LiveSaveResume {
  const data = exact(
    value,
    [
      'launch',
      'paused',
      'auto',
      'inputReleased',
      'previousSegment',
      'openSegmentIds',
      'offlineIncome',
      'offlineXp',
    ],
    'resume',
  );
  if (data.launch !== 'PAUSED_AUTO' || data.paused !== true || data.auto !== true)
    fail('LIVE_SAVE_STATE_INVALID', 'A reload must start PAUSED_AUTO', 'resume.launch');
  if (data.inputReleased !== true)
    fail('LIVE_SAVE_STATE_INVALID', 'A reload must release the input', 'resume.inputReleased');
  if (data.previousSegment !== 'INCOMPLETE' && data.previousSegment !== 'NONE')
    fail('LIVE_SAVE_STATE_INVALID', 'Expected INCOMPLETE/NONE', 'resume.previousSegment');
  if (data.offlineIncome !== 0)
    fail('LIVE_SAVE_STATE_INVALID', 'A reload never pays offline income', 'resume.offlineIncome');
  if (data.offlineXp !== 0)
    fail('LIVE_SAVE_STATE_INVALID', 'A reload never pays offline XP', 'resume.offlineXp');
  if (!Array.isArray(data.openSegmentIds))
    fail('LIVE_SAVE_STATE_INVALID', 'Expected the open segment list', 'resume.openSegmentIds');
  const openSegmentIds = data.openSegmentIds.map((entry, index) =>
    identity(entry, `resume.openSegmentIds[${index}]`),
  );
  if (data.previousSegment === 'NONE' && openSegmentIds.length > 0)
    fail('LIVE_SAVE_STATE_INVALID', 'NONE cannot name open segments', 'resume.openSegmentIds');
  return Object.freeze({
    launch: 'PAUSED_AUTO' as const,
    paused: true as const,
    auto: true as const,
    inputReleased: true as const,
    previousSegment: data.previousSegment,
    openSegmentIds: Object.freeze(openSegmentIds),
    offlineIncome: 0 as const,
    offlineXp: 0 as const,
  });
}

function readFingerprints(value: unknown): LiveSaveFingerprints {
  const data = exact(
    value,
    ['xp', 'kpi', 'company', 'profile', 'daily', 'challenges'],
    'fingerprints',
  );
  return Object.freeze({
    xp: fingerprint(data.xp, 'fingerprints.xp'),
    kpi: fingerprint(data.kpi, 'fingerprints.kpi'),
    company: fingerprint(data.company, 'fingerprints.company'),
    profile: fingerprint(data.profile, 'fingerprints.profile'),
    daily: fingerprint(data.daily, 'fingerprints.daily'),
    challenges: fingerprint(data.challenges, 'fingerprints.challenges'),
  });
}

function readMetrics(value: unknown): Readonly<{
  xp: number;
  xpMicroXp: number;
  level: number;
  dailyRewards: number;
}> {
  const data = exact(value, ['xp', 'xpMicroXp', 'level', 'dailyRewards'], 'metrics');
  const nonNegative = (number: unknown, path: string): number => {
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0)
      fail('INVALID_NUMBER', 'Expected a nonnegative finite number', path);
    return number;
  };
  if (data.xpMicroXp !== undefined && !Number.isSafeInteger(data.xpMicroXp))
    fail('INVALID_COUNTER', 'Expected an integer micro-XP value', 'metrics.xpMicroXp');
  return Object.freeze({
    xp: nonNegative(data.xp, 'metrics.xp'),
    xpMicroXp: nonNegative(data.xpMicroXp, 'metrics.xpMicroXp'),
    level: nonNegative(data.level, 'metrics.level'),
    dailyRewards: nonNegative(data.dailyRewards, 'metrics.dailyRewards'),
  });
}

function readState(value: unknown, sessionKind: SessionKind): LiveSaveState {
  const data = exact(
    value,
    [
      'schemaVersion',
      'units',
      'version',
      'identity',
      'metrics',
      'profile',
      'daily',
      'challenges',
      'company',
      'economy',
      'resume',
      'fingerprints',
    ],
    'state',
  );
  if (data.schemaVersion !== 1 || data.units !== 'SI')
    fail('LIVE_SAVE_STATE_INVALID', 'Unsupported live state schema or units', 'state');
  if (data.version !== LIVE_SAVE_STATE_VERSION)
    fail('LIVE_SAVE_STATE_INVALID', 'Unsupported live state version', 'state.version');
  const session = readIdentity(data.identity);
  if (session.sessionKind !== sessionKind)
    fail(
      'LIVE_SAVE_SESSION_MISMATCH',
      `The body carries ${session.sessionKind}, the checkpoint ${sessionKind}`,
      'state.identity.sessionKind',
    );
  const profile = plainSlot(data.profile, 'state.profile');
  const daily = plainSlot(data.daily, 'state.daily');
  if (profile === null || daily === null)
    fail('LIVE_SAVE_STATE_INVALID', 'The profile and daily slots are required', 'state');
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: LIVE_SAVE_STATE_VERSION,
    identity: session,
    metrics: readMetrics(data.metrics),
    profile,
    daily,
    challenges: plainSlot(data.challenges, 'state.challenges'),
    company: plainSlot(data.company, 'state.company'),
    economy: plainSlot(data.economy, 'state.economy'),
    resume: readResume(data.resume),
    fingerprints: readFingerprints(data.fingerprints),
  });
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberAt(value: unknown, path: readonly string[]): number | null {
  let current: unknown = value;
  for (const key of path) {
    const record = recordOf(current);
    if (record === null) return null;
    current = record[key];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : null;
}

function textAt(value: unknown, path: readonly string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    const record = recordOf(current);
    if (record === null) return null;
    current = record[key];
  }
  return typeof current === 'string' ? current : null;
}

function countAt(value: unknown, path: readonly string[]): number {
  let current: unknown = value;
  for (const key of path) {
    const record = recordOf(current);
    if (record === null) return 0;
    current = record[key];
  }
  return Array.isArray(current) ? current.length : 0;
}

function summaryOf(
  state: LiveSaveState,
  document: LiveSaveDocument,
  bytes: number,
): LiveSaveSummary {
  const identityValue = state.identity;
  const companyFinance = state.company === null ? null : state.company.finance;
  const kpiDays = countAt(state.economy, ['kpi', 'days']);
  const challengeRecords = Math.max(
    countAt(state.challenges, ['experience', 'records']),
    countAt(state.challenges, ['director', 'history']),
  );
  return Object.freeze({
    version: LIVE_SAVE_VERSION,
    sessionKind: identityValue.sessionKind,
    sessionId: identityValue.sessionId,
    playerId: identityValue.playerId,
    profileId: identityValue.profileId,
    activeVersionId: identityValue.activeVersionId,
    worldEpoch: identityValue.worldEpoch,
    learningEpoch: identityValue.learningEpoch,
    tick: identityValue.tick,
    generation: document.payload.generation,
    mode: identityValue.mode,
    createdAt: document.createdAt,
    checksum: document.checksum.value,
    bytes,
    bodyBytes: document.payload.sizes.bodyBytes,
    xp: state.metrics.xp,
    xpMicroXp: state.metrics.xpMicroXp,
    level: state.metrics.level,
    dailyDate: textAt(state.daily, ['daily', 'dailyDate']),
    dailyRewards: state.metrics.dailyRewards,
    challengeRecords,
    companyCashMinorUnits: numberAt(companyFinance, ['totals', 'cashMinorUnits']),
    companyRevenueMinorUnits: numberAt(companyFinance, ['totals', 'revenueMinorUnits']),
    companyProfitMinorUnits: numberAt(companyFinance, ['totals', 'profitMinorUnits']),
    kpiRevenueMinorUnits: numberAt(state.economy, ['kpi', 'totals', 'revenueMinorUnits']),
    kpiDays,
    profileVersionId: textAt(state.profile, ['versionId']) ?? identityValue.activeVersionId,
    resume: state.resume,
    fingerprints: state.fingerprints,
  });
}

/**
 * Builds one live savefile from the current owner snapshots.
 *
 * The 225 checkpoint is built first and verified with the delivered checker before the envelope is
 * stamped, so an oversized or malformed body never becomes a file.
 */
export function buildLiveSave(input: LiveSaveBuildInput): LiveSaveBuildResult {
  try {
    const createdAt = timestamp(input.createdAt, 'createdAt');
    const generation = integer(input.generation, 'generation');
    const identityValue = readIdentity(input.identity);
    const versions = exact(input.versions, ['engine', 'physics', 'map'], 'versions');
    const engine = textAt(versions, ['engine']);
    const physics = textAt(versions, ['physics']);
    const map = textAt(versions, ['map']);
    if (engine === null || physics === null || map === null)
      fail('INVALID_IDENTITY', 'Expected the engine/physics/map triple', 'versions');
    const profile = plainSlot(input.profile, 'profile');
    const daily = plainSlot(input.daily, 'daily');
    if (profile === null || daily === null)
      fail('LIVE_SAVE_STATE_INVALID', 'The profile and daily slots are required', 'state');
    const state: LiveSaveState = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: LIVE_SAVE_STATE_VERSION,
      identity: identityValue,
      metrics: readMetrics(input.metrics),
      profile,
      daily,
      challenges: plainSlot(input.challenges, 'challenges'),
      company: plainSlot(input.company, 'company'),
      economy: plainSlot(input.economy, 'economy'),
      resume: readResume(input.resume),
      fingerprints: readFingerprints(input.fingerprints),
    });
    const body = state as unknown as Readonly<Record<string, unknown>>;
    const bodyBytes = measureJsonBytes(body, 'state');
    if (bodyBytes > LIVE_SAVE_LIMITS.maxBodyBytes)
      fail(
        'LIVE_SAVE_TOO_LARGE',
        `The live state has ${bodyBytes} bytes, above ${LIVE_SAVE_LIMITS.maxBodyBytes}`,
        'state',
      );
    const checkpointBase = {
      version: SESSION_KINDS_VERSION,
      checkpointId: identity(input.checkpointId, 'checkpointId'),
      sessionKind: identityValue.sessionKind,
      sessionId: identityValue.sessionId,
      profileId: identityValue.profileId,
      worldEpoch: identityValue.worldEpoch,
      learningEpoch: identityValue.learningEpoch,
      tick: identityValue.tick,
      generation,
      reason: input.reason,
      createdAt,
      vehicles: identityValue.vehicles,
      manualVehicles: identityValue.manualVehicles,
      launch: 'PAUSED_AUTO' as const,
      body,
      bodyBytes,
    };
    const checkpoint: SessionKindCheckpoint = Object.freeze({
      ...checkpointBase,
      checksum: computeSessionKindCheckpointChecksum(checkpointBase),
    });
    const verified = verifySessionKindCheckpoint(checkpoint);
    if (verified.status === 'REJECTED')
      fail('LIVE_SAVE_CHECKPOINT_INVALID', verified.rejection.message, 'checkpoint');
    const versionsValue = Object.freeze({
      engine,
      physics,
      map,
      schema: LIVE_SAVE_SCHEMA_ID,
    });
    let total = 0;
    // The declared total contains its own decimal length, so measure to a fixed point. A payload
    // that changed digits between the measurement and the declaration would be a SIZE_MISMATCH on
    // the very file this build just wrote.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const measured = measureJsonBytes(
        {
          versions: versionsValue,
          generation,
          checkpoint,
          sizes: { bodyBytes, total, limit: LIVE_SAVE_LIMITS.maxBodyBytes },
        },
        'payload',
      );
      if (measured === total) break;
      total = measured;
    }
    const payload: LiveSavePayload = Object.freeze({
      versions: versionsValue,
      generation,
      checkpoint,
      sizes: Object.freeze({
        bodyBytes,
        total,
        limit: LIVE_SAVE_LIMITS.maxBodyBytes,
      }),
    });
    const baseDocument = {
      format: LIVE_SAVE_FORMAT,
      formatVersion: LIVE_SAVE_FORMAT_VERSION,
      integrityVersion: LIVE_SAVE_INTEGRITY_VERSION,
      schemaVersion: LIVE_SAVE_SCHEMA_VERSION,
      createdAt,
      payload,
    } as const;
    const document = stamp(baseDocument);
    const text = canonical(document, '$');
    if (text.length > LIVE_SAVE_LIMITS.maxFileBytes)
      fail(
        'LIVE_SAVE_TOO_LARGE',
        `The live savefile has ${text.length} code units, above ${LIVE_SAVE_LIMITS.maxFileBytes}`,
        '$',
      );
    const summary = summaryOf(state, document, text.length);
    return Object.freeze({
      version: LIVE_SAVE_VERSION,
      status: 'ACCEPTED' as const,
      document,
      text,
      checksum: document.checksum.value,
      bytes: text.length,
      summary,
      rejection: null,
    });
  } catch (error) {
    return rejected(toRejection(error));
  }
}

/* ------------------------------------------------------------------------- reader */

export interface LiveSaveExpectation {
  readonly sessionKind?: SessionKind;
  readonly sessionId?: string;
}

export interface LiveSaveValidationAccepted {
  readonly version: typeof LIVE_SAVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: LiveSaveDocument;
  readonly state: LiveSaveState;
  readonly text: string;
  readonly checksumVerified: true;
  readonly summary: LiveSaveSummary;
  readonly bytes: number;
  readonly rejection: null;
}

export interface LiveSaveValidationRejected {
  readonly version: typeof LIVE_SAVE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly state: null;
  readonly text: null;
  readonly checksumVerified: false;
  readonly summary: null;
  readonly bytes: 0;
  readonly rejection: LiveSaveRejection;
}

export type LiveSaveValidation = LiveSaveValidationAccepted | LiveSaveValidationRejected;

function strictRejection(value: StrictJsonRejection): LiveSaveRejection {
  const code: LiveSaveCode =
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

function validationRejected(rejection: LiveSaveRejection): LiveSaveValidationRejected {
  return Object.freeze({
    version: LIVE_SAVE_VERSION,
    status: 'REJECTED' as const,
    document: null,
    state: null,
    text: null,
    checksumVerified: false as const,
    summary: null,
    bytes: 0 as const,
    rejection: Object.freeze(rejection),
  });
}

/**
 * Reads a live savefile.
 *
 * Order: size/depth → strict parse → format/integrity → canonical bytes → envelope checksum →
 * schema → 225 checkpoint checksum → body schema/identity → the declared size. A file that fails
 * any step is refused before the caller sees a single owner value.
 */
export function readLiveSave(input: unknown, expect: LiveSaveExpectation = {}): LiveSaveValidation {
  try {
    let value = input;
    if (typeof input === 'string') {
      if (input.length > LIVE_SAVE_LIMITS.maxFileBytes)
        fail(
          'FILE_TOO_LARGE',
          `The file has ${input.length} code units, above ${LIVE_SAVE_LIMITS.maxFileBytes}`,
          '$',
        );
      const parsed = parseStrictJson(input, {
        maxBytes: LIVE_SAVE_LIMITS.maxFileBytes,
        maxDepth: LIVE_SAVE_LIMITS.maxDepth,
      });
      if (parsed.status === 'REJECTED') {
        const rejection = strictRejection(parsed.rejection);
        throw new LiveSaveError(rejection.code, rejection.message, rejection.path);
      }
      value = parsed.value;
    } else {
      canonical(input, '$');
    }
    const envelope = exact(value, envelopeFields, '$');
    if (envelope.format !== LIVE_SAVE_FORMAT)
      fail(
        'UNSUPPORTED_LIVE_SAVE_FORMAT',
        `Unsupported live save format: ${String(envelope.format)}`,
        'format',
      );
    const formatVersion = envelope.formatVersion;
    if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion))
      fail('UNSUPPORTED_FORMAT_VERSION', 'Expected an integer format version', 'formatVersion');
    if (formatVersion > LIVE_SAVE_FORMAT_VERSION)
      fail(
        'FORMAT_VERSION_TOO_NEW',
        `The file declares format ${formatVersion}; this build reads ${LIVE_SAVE_FORMAT_VERSION}`,
        'formatVersion',
      );
    if (formatVersion !== LIVE_SAVE_FORMAT_VERSION)
      fail(
        'UNSUPPORTED_FORMAT_VERSION',
        `Unsupported live save format: ${formatVersion}`,
        'formatVersion',
      );
    if (envelope.integrityVersion !== LIVE_SAVE_INTEGRITY_VERSION)
      fail(
        'UNSUPPORTED_LIVE_SAVE_INTEGRITY',
        `Unsupported integrity version: ${String(envelope.integrityVersion)}`,
        'integrityVersion',
      );
    const canonicalText = canonical(value, '$');
    if (canonicalText.length > LIVE_SAVE_LIMITS.maxFileBytes)
      fail('FILE_TOO_LARGE', `The canonical file has ${canonicalText.length} code units`, '$');
    const checksumData = exact(envelope.checksum, checksumFields, 'checksum');
    if (checksumData.algorithm !== CHECKSUM_ALGORITHM)
      fail(
        'UNSUPPORTED_ALGORITHM',
        `Unsupported checksum algorithm: ${String(checksumData.algorithm)}`,
        'checksum.algorithm',
      );
    if (checksumData.canonicalization !== CANONICALIZATION_VERSION)
      fail(
        'UNSUPPORTED_CANONICALIZATION',
        `Unsupported canonicalization: ${String(checksumData.canonicalization)}`,
        'checksum.canonicalization',
      );
    const declared = checksumData.value;
    if (typeof declared !== 'string' || !SHA256_HEX.test(declared))
      fail('CHECKSUM_MISMATCH', 'Expected a lowercase SHA-256 checksum', 'checksum.value');
    const computed = checksumOf({
      format: envelope.format,
      formatVersion: envelope.formatVersion,
      integrityVersion: envelope.integrityVersion,
      schemaVersion: envelope.schemaVersion,
      createdAt: envelope.createdAt,
      payload: envelope.payload,
    });
    if (computed !== declared)
      fail(
        'CHECKSUM_MISMATCH',
        'The savefile was modified or is corrupted; the game was not loaded',
        'checksum.value',
      );
    const schemaVersion = envelope.schemaVersion;
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion))
      fail('SCHEMA_TOO_NEW', 'Expected an integer schema version', 'schemaVersion');
    if (schemaVersion > LIVE_SAVE_SCHEMA_VERSION)
      fail(
        'SCHEMA_TOO_NEW',
        `The file declares schema ${schemaVersion}; this build reads ${LIVE_SAVE_SCHEMA_VERSION}`,
        'schemaVersion',
      );
    if (schemaVersion !== LIVE_SAVE_SCHEMA_VERSION)
      fail('SCHEMA_TOO_NEW', `Unsupported live save schema: ${schemaVersion}`, 'schemaVersion');
    const createdAt = timestamp(envelope.createdAt, 'createdAt');
    const payload = exact(envelope.payload, payloadFields, 'payload');
    const versions = exact(payload.versions, versionFields, 'payload.versions');
    const engine = textAt(versions, ['engine']);
    const physics = textAt(versions, ['physics']);
    const map = textAt(versions, ['map']);
    if (engine === null || physics === null || map === null)
      fail('INVALID_IDENTITY', 'Expected the engine/physics/map triple', 'payload.versions');
    if (versions.schema !== LIVE_SAVE_SCHEMA_ID)
      fail(
        'SCHEMA_TOO_NEW',
        `Unsupported payload schema: ${String(versions.schema)}`,
        'payload.versions.schema',
      );
    const generation = integer(payload.generation, 'payload.generation');
    const verified = verifySessionKindCheckpoint(payload.checkpoint);
    if (verified.status === 'REJECTED')
      fail('LIVE_SAVE_CHECKPOINT_INVALID', verified.rejection.message, 'payload.checkpoint');
    const checkpoint = verified.checkpoint;
    if (expect.sessionKind !== undefined && checkpoint.sessionKind !== expect.sessionKind)
      fail(
        'LIVE_SAVE_SESSION_MISMATCH',
        `The file carries ${checkpoint.sessionKind}, not ${expect.sessionKind}`,
        'payload.checkpoint.sessionKind',
      );
    if (expect.sessionId !== undefined && checkpoint.sessionId !== expect.sessionId)
      fail(
        'LIVE_SAVE_SESSION_MISMATCH',
        `The file carries ${checkpoint.sessionId}, not ${expect.sessionId}`,
        'payload.checkpoint.sessionId',
      );
    const state = readState(checkpoint.body, checkpoint.sessionKind);
    if (
      state.identity.sessionId !== checkpoint.sessionId ||
      state.identity.profileId !== checkpoint.profileId ||
      state.identity.worldEpoch !== checkpoint.worldEpoch ||
      state.identity.learningEpoch !== checkpoint.learningEpoch ||
      state.identity.tick !== checkpoint.tick ||
      state.identity.sessionKind !== checkpoint.sessionKind
    )
      fail(
        'LIVE_SAVE_SESSION_MISMATCH',
        'The body identity does not match the checkpoint identity',
        'state.identity',
      );
    const sizes = exact(payload.sizes, sizeFields, 'payload.sizes');
    const bodyBytes = integer(sizes.bodyBytes, 'payload.sizes.bodyBytes');
    const total = integer(sizes.total, 'payload.sizes.total');
    const limit = integer(sizes.limit, 'payload.sizes.limit');
    const measuredBody = measureJsonBytes(checkpoint.body, 'payload.checkpoint.body');
    if (measuredBody !== bodyBytes || checkpoint.bodyBytes !== bodyBytes)
      fail(
        'LIVE_SAVE_SIZE_MISMATCH',
        `The body declares ${bodyBytes} bytes, measured ${measuredBody}`,
        'payload.sizes.bodyBytes',
      );
    if (bodyBytes > LIVE_SAVE_LIMITS.maxBodyBytes)
      fail(
        'LIVE_SAVE_TOO_LARGE',
        `The body has ${bodyBytes} bytes, above ${LIVE_SAVE_LIMITS.maxBodyBytes}`,
        'payload.sizes.bodyBytes',
      );
    const measuredTotal = measureJsonBytes(payload, 'payload');
    if (measuredTotal !== total || limit !== LIVE_SAVE_LIMITS.maxBodyBytes)
      fail(
        'LIVE_SAVE_SIZE_MISMATCH',
        `The payload declares ${total}/${limit} bytes, measured ${measuredTotal}`,
        'payload.sizes',
      );
    const document: LiveSaveDocument = Object.freeze({
      format: LIVE_SAVE_FORMAT,
      formatVersion: LIVE_SAVE_FORMAT_VERSION,
      integrityVersion: LIVE_SAVE_INTEGRITY_VERSION,
      schemaVersion: LIVE_SAVE_SCHEMA_VERSION,
      createdAt,
      payload: Object.freeze({
        versions: Object.freeze({
          engine,
          physics,
          map,
          schema: LIVE_SAVE_SCHEMA_ID,
        }),
        generation,
        checkpoint,
        sizes: Object.freeze({ bodyBytes, total, limit }),
      }),
      checksum: Object.freeze({
        algorithm: CHECKSUM_ALGORITHM,
        canonicalization: CANONICALIZATION_VERSION,
        value: declared,
      }),
    });
    const summary = summaryOf(state, document, canonicalText.length);
    return Object.freeze({
      version: LIVE_SAVE_VERSION,
      status: 'ACCEPTED' as const,
      document,
      state,
      text: canonicalText,
      checksumVerified: true as const,
      summary,
      bytes: canonicalText.length,
      rejection: null,
    });
  } catch (error) {
    return validationRejected(toRejection(error));
  }
}

/** Preview identity of one exact file: the envelope checksum. */
export function liveSavePreviewId(file: LiveSaveValidationAccepted): string {
  return file.summary.checksum;
}

/** Stable digest used by tests and evidence for an arbitrary owner snapshot. */
export function liveSaveFingerprint(value: unknown): string {
  return digestText(canonical(value, 'fingerprint')).slice(0, 32);
}
