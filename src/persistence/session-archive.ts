import type { RuntimeSettings } from '../settings';
import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  parseStrictJson,
  sha256Hex,
} from './canonical-json';
import type { StrictJsonRejection } from './canonical-json';
import { PERSISTENCE_LIMITS, PersistenceError, boundedText } from './contracts';
import type { ActivationRecord, CheckpointRecord, PersistedRecord } from './contracts';
import {
  PROGRESS_SAVE_ROW_PREFIXES,
  decodePlayerSave,
  restoreMissionProgress,
} from './progress-save';
import {
  measureJsonBytes,
  parseActivationRecord,
  parseCheckpointRecord,
  parsePersistedRecord,
  parseSettingsRecord,
} from './records';
import type { LocalRepository } from './repository';
import { readWorldSnapshot } from './world-snapshot';

/**
 * Session archive for PBI 135.
 *
 * Docs/29 asks for one coherent backup of a session, distinct from the 133 profile export and from
 * the 234 savefile envelope. This module owns the format, the builder, the reader and the size
 * ledger; `session-archive-import.ts` owns the atomic replacement.
 *
 * Four rules drive the module:
 *
 * 1. **Explicit structure and declared size.** Every component has its own slot — the 206 world
 *    checkpoint, the 130 mission progress row, the 130 campaign row, the 009 settings row, the
 *    profile reference the checkpoint names, and the explicit scenario rows. The document declares
 *    the canonical UTF-8 size of each component plus the total and the limit it was built against;
 *    the reader recomputes them and refuses a wrong declaration, a component over its own budget
 *    and a total over the archive budget. A file over the cap is refused, never truncated.
 * 2. **Real integrity.** The checksum is the `SHA-256` of the `SDA-CJSON-1` canonical form of the
 *    whole envelope without the checksum field, exactly like 133 and 206. The nested 206 snapshot
 *    keeps its own checksum, the 130 rows keep their digests and the 125 campaign log is replayed,
 *    so a re-stamped file still cannot smuggle a modified world or a richer ledger.
 * 3. **Coherence before any write.** The checkpoint, the progress rows, the settings and the
 *    profile reference must belong to the same session, world epoch, catalog and profile
 *    generation. A checkpoint that names a profile version the reader cannot resolve is refused
 *    with an explicit code; nothing is repaired silently.
 * 4. **No second parser.** Every component is read with the parser of the module that owns it
 *    (`parseCheckpointRecord`, `readWorldSnapshot`, `parsePersistedRecord`, `decodePlayerSave`,
 *    `restoreMissionProgress`, `parseSettingsRecord`). This module only adds the archive envelope,
 *    the size ledger and the cross-component coherence.
 */

/** Contract id of this layer. */
export const SESSION_ARCHIVE_VERSION = '135-session-archive-v1' as const;

/** Format marker stored in every archive document. */
export const SESSION_ARCHIVE_FORMAT = 'self-driving-academy-session-archive' as const;

/** Version of the document format. A reader that does not know it refuses the file. */
export const SESSION_ARCHIVE_FORMAT_VERSION = 1 as const;

/** Version of the document schema. */
export const SESSION_ARCHIVE_SCHEMA_VERSION = 1 as const;

/** The explicit slots of an archive; every one of them is validated and size-checked. */
export const sessionArchiveComponents = [
  'checkpoint',
  'progress',
  'campaign',
  'settings',
  'profile',
  'scenarios',
] as const;
export type SessionArchiveComponentName = (typeof sessionArchiveComponents)[number];

/**
 * Fixed budgets of the archive.
 *
 * A caller, a component or a page cannot raise them: the document declares the limit it was built
 * against and a different number is refused. Component budgets sit at the 127 row budget plus the
 * envelope, because the import writes every component back through a 127 store.
 */
export const SESSION_ARCHIVE_LIMITS = Object.freeze({
  /** Canonical UTF-16 code units of the whole document. */
  maxFileBytes: 4_194_304,
  /** Sum of the canonical UTF-8 component sizes. */
  maxTotalBytes: 2_097_152,
  /** Scenario rows carried by one archive. */
  maxScenarios: 8,
  /** Nesting depth accepted by the reader. */
  maxDepth: 24,
  /** Per-component canonical UTF-8 budgets, derived from the 127 record budgets. */
  componentBytes: Object.freeze({
    checkpoint: 524_288,
    progress: 524_288,
    campaign: 524_288,
    settings: 131_072,
    profile: 65_536,
    scenarios: 524_288,
  }),
});

/** Closed vocabulary of the refusals; there is no open error channel. */
export const sessionArchiveRejectionCodes = [
  'UNSUPPORTED_FORMAT',
  'UNSUPPORTED_FORMAT_VERSION',
  'FORMAT_VERSION_TOO_NEW',
  'UNSUPPORTED_SCHEMA',
  'SCHEMA_TOO_NEW',
  'INVALID_FIELD',
  'UNKNOWN_FIELD',
  'MISSING_FIELD',
  'INVALID_IDENTITY',
  'INVALID_TIMESTAMP',
  'INVALID_NUMBER',
  'INVALID_COUNTER',
  'FILE_TOO_LARGE',
  'DEPTH_EXCEEDED',
  'PARSE_ERROR',
  'DUPLICATE_KEY',
  'TRAILING_CONTENT',
  'UNSAFE_KEY',
  'CANONICALIZATION_FAILED',
  'CHECKSUM_MISMATCH',
  'UNSUPPORTED_ALGORITHM',
  'UNSUPPORTED_CANONICALIZATION',
  'SIZE_MISMATCH',
  'ARCHIVE_TOO_LARGE',
  'COMPONENT_TOO_LARGE',
  'ARCHIVE_EMPTY',
  'SCENARIO_LIMIT_EXCEEDED',
  'SESSION_MISMATCH',
  'WORLD_EPOCH_MISMATCH',
  'VERSION_MISMATCH',
  'CHECKPOINT_INVALID',
  'PROGRESS_INVALID',
  'CAMPAIGN_INVALID',
  'SETTINGS_INVALID',
  'SCENARIO_INVALID',
  'PROFILE_REFERENCE_INVALID',
  'PROFILE_GENERATION_MISMATCH',
  'PROFILE_VERSION_MISSING',
  'REFERENCE_MISSING',
  'DUPLICATE_RECORD',
] as const;
export type SessionArchiveRejectionCode = (typeof sessionArchiveRejectionCodes)[number];

export interface SessionArchiveRejection {
  readonly code: SessionArchiveRejectionCode;
  readonly message: string;
  readonly path: string;
}

/** Thrown by the strict readers of this layer; the public entry points return it as data. */
export class SessionArchiveError extends Error {
  readonly code: SessionArchiveRejectionCode;
  readonly path: string;

  constructor(code: SessionArchiveRejectionCode, message: string, path: string) {
    super(message);
    this.name = 'SessionArchiveError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: SessionArchiveRejectionCode, message: string, path: string): never {
  throw new SessionArchiveError(code, message, path);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
/** The envelope checksum is a full SHA-256. */
const SHA256_HEX = /^[0-9a-f]{64}$/;
/** The 109 version checksum is `<algorithm>:<lowercase hex>` (the 109 store writes `fnv1a64:...`). */
const VERSION_CHECKSUM = /^[a-z0-9_]+:[0-9a-f]{16,64}$/;

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

/**
 * Exact field set: an unknown field is refused instead of being ignored, so a file written for a
 * newer layout can never be read with today's rules by accident.
 */
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

function timestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) {
    fail('INVALID_TIMESTAMP', 'Expected a UTC ISO 8601 timestamp', path);
  }
  if (!Number.isFinite(Date.parse(value))) {
    fail('INVALID_TIMESTAMP', 'Expected a valid calendar timestamp', path);
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_COUNTER', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function versionText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail('INVALID_IDENTITY', 'Expected a version text', path);
  }
  if (value.length > PERSISTENCE_LIMITS.maxTextCodeUnits) {
    fail(
      'INVALID_IDENTITY',
      `The version text exceeds ${PERSISTENCE_LIMITS.maxTextCodeUnits} code units`,
      path,
    );
  }
  return value;
}

/* ------------------------------------------------------------------- the shape */

export interface SessionArchiveVersions {
  readonly engine: string;
  readonly physics: string;
  readonly map: string;
}

/** The session the archive replaces; every component must belong to it. */
export interface SessionArchiveSession {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
}

/**
 * The profile generation the checkpoint names.
 *
 * It is a reference, not a copy of the 133 profile export: the archive says which stored version
 * the world belongs to, and the import refuses to land the world on a profile generation that is
 * not already stored.
 */
export interface SessionArchiveProfileReference {
  readonly profileId: string;
  readonly activeVersionId: string;
  readonly activationSequence: number;
  /** The 109 checksum of the named version, so the reference cannot drift silently. */
  readonly versionChecksum: string;
  readonly engineVersion: string;
  readonly activation: ActivationRecord | null;
}

/** Every component in its own slot; `null` means the component is absent, not empty. */
export interface SessionArchiveComponents {
  readonly checkpoint: CheckpointRecord | null;
  /** The 130 `MISSION_TRACKER` row of this session. */
  readonly progress: PersistedRecord | null;
  /** The 130 `CAMPAIGN_LEDGER` row of this session. */
  readonly campaign: PersistedRecord | null;
  readonly settings: RuntimeSettings | null;
  readonly profile: SessionArchiveProfileReference | null;
  readonly scenarios: readonly PersistedRecord[];
}

/** The declared size ledger: canonical UTF-8 bytes per component, their sum and the limit. */
export interface SessionArchiveSizes {
  readonly checkpoint: number;
  readonly progress: number;
  readonly campaign: number;
  readonly settings: number;
  readonly profile: number;
  readonly scenarios: number;
  readonly total: number;
  readonly limit: number;
}

export interface SessionArchiveChecksum {
  readonly algorithm: typeof CHECKSUM_ALGORITHM;
  readonly canonicalization: typeof CANONICALIZATION_VERSION;
  readonly value: string;
}

export interface SessionArchiveDocument {
  readonly format: typeof SESSION_ARCHIVE_FORMAT;
  readonly formatVersion: typeof SESSION_ARCHIVE_FORMAT_VERSION;
  readonly schemaVersion: typeof SESSION_ARCHIVE_SCHEMA_VERSION;
  readonly units: 'SI';
  readonly createdAt: string;
  readonly versions: SessionArchiveVersions;
  readonly session: SessionArchiveSession;
  readonly components: SessionArchiveComponents;
  readonly sizes: SessionArchiveSizes;
  readonly checksum: SessionArchiveChecksum;
}

/** What the archive really carries, derived from the validated components. */
export interface SessionArchiveCounts {
  readonly checkpoint: boolean;
  readonly progress: boolean;
  readonly campaign: boolean;
  readonly settings: boolean;
  readonly profile: boolean;
  readonly scenarios: number;
  readonly trackerInstances: number;
  readonly trackerRewards: number;
  readonly campaignEvents: number;
  readonly campaignCompleted: number;
  readonly xp: number;
  readonly rewardsGranted: number;
}

export interface SessionArchiveValidationAccepted {
  readonly version: typeof SESSION_ARCHIVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: SessionArchiveDocument;
  readonly checksumVerified: true;
  readonly session: SessionArchiveSession;
  readonly sizes: SessionArchiveSizes;
  readonly components: SessionArchiveComponents;
  readonly counts: SessionArchiveCounts;
  /** Canonical digest of the stored mission tracker and campaign log, recomputed by 130. */
  readonly digests: Readonly<{ tracker: string | null; campaign: string | null }>;
  /** Canonical UTF-16 code units of the whole document. */
  readonly bytes: number;
  readonly rejection: null;
}

export interface SessionArchiveValidationRejected {
  readonly version: typeof SESSION_ARCHIVE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksumVerified: false;
  readonly session: null;
  readonly sizes: null;
  readonly components: null;
  readonly counts: null;
  readonly digests: null;
  readonly bytes: 0;
  readonly rejection: SessionArchiveRejection;
}

export type SessionArchiveValidation =
  SessionArchiveValidationAccepted | SessionArchiveValidationRejected;

/** What the reader is allowed to accept: one session of one player in one build. */
export interface SessionArchiveExpectation {
  readonly sessionId: string;
  readonly playerId: string;
  /** The authored 125 catalog of this build; the campaign log is replayed against it. */
  readonly catalog: unknown;
  /** Engine/physics/map versions of this build. A different triple is a closed refusal. */
  readonly versions?: Partial<SessionArchiveVersions>;
}

/* ------------------------------------------------------------------- the checksum */

/** The document without its envelope checksum, in canonical form. */
function checksumPayload(document: Omit<SessionArchiveDocument, 'checksum'>): unknown {
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

/**
 * The `SHA-256` checksum of an archive, computed over the canonical form of the whole envelope
 * without the checksum field. The builder and the reader use the same function.
 */
export function computeSessionArchiveChecksum(
  document: Omit<SessionArchiveDocument, 'checksum'> | SessionArchiveDocument,
): string {
  const payload = checksumPayload(document as Omit<SessionArchiveDocument, 'checksum'>);
  const canonical = canonicalizeJson(payload, { maxDepth: SESSION_ARCHIVE_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    throw new SessionArchiveError(
      canonical.rejection.code === 'UNSAFE_KEY' ? 'UNSAFE_KEY' : 'CANONICALIZATION_FAILED',
      canonical.rejection.message,
      canonical.rejection.path,
    );
  }
  return sha256Hex(canonical.text);
}

/** Returns a copy of the document with a recomputed checksum. */
export function stampSessionArchiveChecksum(
  document: Omit<SessionArchiveDocument, 'checksum'> | SessionArchiveDocument,
): SessionArchiveDocument {
  const payload = document as Omit<SessionArchiveDocument, 'checksum'>;
  return Object.freeze({
    ...payload,
    checksum: Object.freeze({
      algorithm: CHECKSUM_ALGORITHM,
      canonicalization: CANONICALIZATION_VERSION,
      value: computeSessionArchiveChecksum(payload),
    }),
  });
}

/* ------------------------------------------------------------------ size ledger */

function measured(value: unknown, path: string): number {
  try {
    return measureJsonBytes(value, path);
  } catch (error) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The ${path} component cannot be measured within the 127 budget: ${describe(error)}`,
      path,
    );
  }
}

/**
 * The real size of every component, in canonical UTF-8 bytes.
 *
 * The measurement is the 127 one (`measureJsonBytes`), so a component that the local store could
 * not hold is also a component the archive refuses: the import writes these exact values back.
 */
export function sessionArchiveSizes(
  components: SessionArchiveComponents,
  limit: number = SESSION_ARCHIVE_LIMITS.maxTotalBytes,
): SessionArchiveSizes {
  const checkpoint = measured(components.checkpoint, 'checkpoint');
  const progress = measured(components.progress, 'progress');
  const campaign = measured(components.campaign, 'campaign');
  const settings = measured(components.settings, 'settings');
  const profile = measured(components.profile, 'profile');
  const scenarios = measured(components.scenarios, 'scenarios');
  return Object.freeze({
    checkpoint,
    progress,
    campaign,
    settings,
    profile,
    scenarios,
    total: checkpoint + progress + campaign + settings + profile + scenarios,
    limit,
  });
}

function enforceComponentBudgets(sizes: SessionArchiveSizes): void {
  for (const name of sessionArchiveComponents) {
    const budget = SESSION_ARCHIVE_LIMITS.componentBytes[name];
    const size = sizes[name];
    if (size > budget) {
      fail(
        'COMPONENT_TOO_LARGE',
        `The ${name} component has ${size} bytes, above its ${budget} byte budget`,
        name,
      );
    }
  }
  if (sizes.total > sizes.limit || sizes.limit > SESSION_ARCHIVE_LIMITS.maxTotalBytes) {
    fail(
      'ARCHIVE_TOO_LARGE',
      `The archive declares ${sizes.total} bytes against a ${sizes.limit} byte limit`,
      'sizes.total',
    );
  }
}

/* -------------------------------------------------------------- component reads */

function componentCode(
  code: SessionArchiveRejectionCode,
  path: string,
  error: unknown,
): SessionArchiveError {
  if (error instanceof SessionArchiveError) return error;
  const detail =
    error instanceof PersistenceError ? `${error.code}: ${error.message}` : describe(error);
  const detailPath = error instanceof PersistenceError && error.path !== null ? error.path : path;
  return new SessionArchiveError(code, detail, detailPath);
}

function readCheckpoint(value: unknown): CheckpointRecord {
  try {
    return parseCheckpointRecord(value);
  } catch (error) {
    throw componentCode('CHECKPOINT_INVALID', 'components.checkpoint', error);
  }
}

function readProgressRow(
  value: unknown,
  kind: 'MISSION_TRACKER' | 'CAMPAIGN_LEDGER',
  code: SessionArchiveRejectionCode,
  path: string,
): PersistedRecord {
  try {
    const row = parsePersistedRecord(value, 'PROGRESS');
    const body = object(row.body, `${path}.body`);
    if (body.kind !== kind) {
      fail(code, `Expected a ${kind} row, not ${String(body.kind)}`, `${path}.body.kind`);
    }
    return row;
  } catch (error) {
    throw componentCode(code, path, error);
  }
}

function readSettings(value: unknown): RuntimeSettings {
  try {
    return parseSettingsRecord(value);
  } catch (error) {
    throw componentCode('SETTINGS_INVALID', 'components.settings', error);
  }
}

function readProfileReference(value: unknown): SessionArchiveProfileReference {
  const data = exact(
    value,
    [
      'profileId',
      'activeVersionId',
      'activationSequence',
      'versionChecksum',
      'engineVersion',
      'activation',
    ],
    'components.profile',
  );
  const checksum = data.versionChecksum;
  if (typeof checksum !== 'string' || !VERSION_CHECKSUM.test(checksum)) {
    fail(
      'PROFILE_REFERENCE_INVALID',
      'Expected the 109 version checksum (algorithm:hex)',
      'components.profile.versionChecksum',
    );
  }
  let activation: ActivationRecord | null = null;
  if (data.activation !== null) {
    try {
      activation = parseActivationRecord(data.activation);
    } catch (error) {
      throw componentCode('PROFILE_REFERENCE_INVALID', 'components.profile.activation', error);
    }
  }
  return Object.freeze({
    profileId: identity(data.profileId, 'components.profile.profileId'),
    activeVersionId: identity(data.activeVersionId, 'components.profile.activeVersionId'),
    activationSequence: integer(data.activationSequence, 'components.profile.activationSequence'),
    versionChecksum: checksum,
    engineVersion: versionText(data.engineVersion, 'components.profile.engineVersion'),
    activation,
  });
}

function readScenarioRows(value: unknown): readonly PersistedRecord[] {
  if (!Array.isArray(value)) {
    fail('SCENARIO_INVALID', 'Expected a scenario list', 'components.scenarios');
  }
  if (value.length > SESSION_ARCHIVE_LIMITS.maxScenarios) {
    fail(
      'SCENARIO_LIMIT_EXCEEDED',
      `The archive carries ${value.length} scenarios, above the ${SESSION_ARCHIVE_LIMITS.maxScenarios} budget`,
      'components.scenarios',
    );
  }
  const rows: PersistedRecord[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    let row: PersistedRecord;
    try {
      row = parsePersistedRecord(value[index], 'SCENARIO');
    } catch (error) {
      throw componentCode('SCENARIO_INVALID', `components.scenarios[${index}]`, error);
    }
    if (seen.has(row.recordId)) {
      fail(
        'DUPLICATE_RECORD',
        `Duplicate scenario ${row.recordId}`,
        `components.scenarios[${index}]`,
      );
    }
    seen.add(row.recordId);
    rows.push(row);
  }
  return Object.freeze(rows);
}

function readComponents(value: unknown): SessionArchiveComponents {
  const data = exact(value, sessionArchiveComponents, 'components');
  const checkpoint = data.checkpoint === null ? null : readCheckpoint(data.checkpoint);
  const progress =
    data.progress === null
      ? null
      : readProgressRow(
          data.progress,
          'MISSION_TRACKER',
          'PROGRESS_INVALID',
          'components.progress',
        );
  const campaign =
    data.campaign === null
      ? null
      : readProgressRow(
          data.campaign,
          'CAMPAIGN_LEDGER',
          'CAMPAIGN_INVALID',
          'components.campaign',
        );
  const settings = data.settings === null ? null : readSettings(data.settings);
  const profile = data.profile === null ? null : readProfileReference(data.profile);
  const scenarios = readScenarioRows(data.scenarios);
  return Object.freeze({ checkpoint, progress, campaign, settings, profile, scenarios });
}

/* ------------------------------------------------------------ cross-component checks */

interface CoherenceInput {
  readonly session: SessionArchiveSession;
  readonly versions: SessionArchiveVersions;
  readonly components: SessionArchiveComponents;
  readonly catalog: unknown;
}

interface CoherenceResult {
  readonly counts: SessionArchiveCounts;
  readonly digests: Readonly<{ tracker: string | null; campaign: string | null }>;
}

/**
 * Proves that the components belong to one generation before anything is written.
 *
 * A row of another session, a checkpoint of another world epoch, a 206 snapshot that disagrees
 * with its own envelope, a campaign log that does not replay against this build's catalog, a
 * settings row of another player, a scenario of another session or a profile reference the
 * checkpoint does not match are all explicit refusals. Nothing is repaired.
 */
function verifyCoherence(input: CoherenceInput): CoherenceResult {
  const { session, versions, components, catalog } = input;
  const { checkpoint, progress, campaign, settings, profile, scenarios } = components;

  if (progress === null && campaign === null && settings === null && checkpoint === null) {
    if (scenarios.length === 0) {
      fail('ARCHIVE_EMPTY', 'The archive carries no session component', 'components');
    }
  }

  let snapshot: ReturnType<typeof readWorldSnapshot> | null = null;
  if (checkpoint !== null) {
    if (checkpoint.sessionId !== session.sessionId) {
      fail(
        'SESSION_MISMATCH',
        `The checkpoint belongs to ${checkpoint.sessionId}, not ${session.sessionId}`,
        'components.checkpoint.sessionId',
      );
    }
    if (checkpoint.worldEpoch !== session.worldEpoch) {
      fail(
        'WORLD_EPOCH_MISMATCH',
        `The checkpoint is in world epoch ${checkpoint.worldEpoch}, not ${session.worldEpoch}`,
        'components.checkpoint.worldEpoch',
      );
    }
    if (
      checkpoint.engineVersion !== versions.engine ||
      checkpoint.physicsVersion !== versions.physics ||
      checkpoint.mapVersion !== versions.map
    ) {
      fail(
        'VERSION_MISMATCH',
        'The checkpoint was captured with another engine/physics/map triple',
        'components.checkpoint',
      );
    }
    const read = readWorldSnapshot(checkpoint.body);
    if (read.status === 'REJECTED') {
      fail(
        read.rejection.code === 'CHECKSUM_MISMATCH' ? 'CHECKSUM_MISMATCH' : 'CHECKPOINT_INVALID',
        read.rejection.message,
        read.rejection.path,
      );
    }
    snapshot = read;
    if (
      read.snapshot.tick !== checkpoint.tick ||
      read.snapshot.worldEpoch !== checkpoint.worldEpoch ||
      read.snapshot.learning.learningEpoch !== checkpoint.learningEpoch
    ) {
      fail(
        'CHECKPOINT_INVALID',
        'The 206 snapshot disagrees with its own checkpoint envelope',
        'components.checkpoint.body',
      );
    }
    if (read.snapshot.profile.profileId !== checkpoint.profileId) {
      fail(
        'CHECKPOINT_INVALID',
        `The envelope names profile ${checkpoint.profileId} but the snapshot names ${read.snapshot.profile.profileId}`,
        'components.checkpoint.profileId',
      );
    }
    if (profile === null) {
      fail(
        'PROFILE_REFERENCE_INVALID',
        'A world checkpoint must carry the profile generation it belongs to',
        'components.profile',
      );
    }
    if (read.snapshot.profile.profileId !== profile.profileId) {
      fail(
        'PROFILE_GENERATION_MISMATCH',
        `The checkpoint names profile ${read.snapshot.profile.profileId}, not ${profile.profileId}`,
        'components.profile.profileId',
      );
    }
    if (read.snapshot.profile.activeVersionId !== profile.activeVersionId) {
      fail(
        'PROFILE_GENERATION_MISMATCH',
        `The checkpoint names version ${read.snapshot.profile.activeVersionId}, not ${profile.activeVersionId}`,
        'components.profile.activeVersionId',
      );
    }
    if (read.snapshot.profile.activationSequence !== profile.activationSequence) {
      fail(
        'PROFILE_GENERATION_MISMATCH',
        `The checkpoint is in activation ${read.snapshot.profile.activationSequence}, not ${profile.activationSequence}`,
        'components.profile.activationSequence',
      );
    }
  }

  if (profile !== null) {
    if (profile.engineVersion !== versions.engine) {
      fail(
        'VERSION_MISMATCH',
        `The profile reference targets engine ${profile.engineVersion}, not ${versions.engine}`,
        'components.profile.engineVersion',
      );
    }
    if (profile.activation === null) {
      if (checkpoint !== null) {
        fail(
          'PROFILE_REFERENCE_INVALID',
          'A world checkpoint must carry the stored 110 activation it was captured in',
          'components.profile.activation',
        );
      }
    } else {
      const activation = profile.activation;
      if (
        activation.profileId !== profile.profileId ||
        activation.versionId !== profile.activeVersionId ||
        activation.sequence !== profile.activationSequence ||
        activation.playerId !== session.playerId
      ) {
        fail(
          'PROFILE_GENERATION_MISMATCH',
          'The stored activation does not match the profile reference',
          'components.profile.activation',
        );
      }
    }
  }

  for (const [row, path] of [
    [progress, 'components.progress'],
    [campaign, 'components.campaign'],
  ] as const) {
    if (row === null) continue;
    if (row.sessionId !== session.sessionId) {
      fail(
        'SESSION_MISMATCH',
        `The row ${row.recordId} belongs to ${row.sessionId}, not ${session.sessionId}`,
        `${path}.sessionId`,
      );
    }
    if (row.worldEpoch !== session.worldEpoch) {
      fail(
        'WORLD_EPOCH_MISMATCH',
        `The row ${row.recordId} is in world epoch ${row.worldEpoch}, not ${session.worldEpoch}`,
        `${path}.worldEpoch`,
      );
    }
  }
  if (progress !== null) {
    const expected = `${PROGRESS_SAVE_ROW_PREFIXES.tracker}${session.sessionId}`;
    if (progress.recordId !== expected) {
      fail(
        'PROGRESS_INVALID',
        `Expected the 130 tracker row ${expected}`,
        'components.progress.recordId',
      );
    }
  }
  if (campaign !== null) {
    const expected = `${PROGRESS_SAVE_ROW_PREFIXES.campaign}${session.sessionId}`;
    if (campaign.recordId !== expected) {
      fail(
        'CAMPAIGN_INVALID',
        `Expected the 130 campaign row ${expected}`,
        'components.campaign.recordId',
      );
    }
  }

  if (settings !== null && settings.playerId !== session.playerId) {
    fail(
      'SETTINGS_INVALID',
      `The settings belong to ${settings.playerId}, not ${session.playerId}`,
      'components.settings.playerId',
    );
  }

  for (const [index, row] of scenarios.entries()) {
    if (row.sessionId !== session.sessionId) {
      fail(
        'SESSION_MISMATCH',
        `The scenario ${row.recordId} belongs to ${row.sessionId}`,
        `components.scenarios[${index}].sessionId`,
      );
    }
    if (row.worldEpoch !== session.worldEpoch) {
      fail(
        'WORLD_EPOCH_MISMATCH',
        `The scenario ${row.recordId} is in world epoch ${row.worldEpoch}`,
        `components.scenarios[${index}].worldEpoch`,
      );
    }
  }

  // The 130 decoder is the oracle for the two progress rows: tracker digest, restorable snapshot,
  // campaign replay against this catalog and the stored row status.
  const rows = [progress, campaign].filter((row): row is PersistedRecord => row !== null);
  let save;
  try {
    save = decodePlayerSave({
      sessionId: session.sessionId,
      playerId: session.playerId,
      catalog,
      rows: { progress: rows, settings: settings ?? undefined },
    });
  } catch (error) {
    const code: SessionArchiveRejectionCode =
      error instanceof PersistenceError &&
      (error.code === 'LEDGER_REPLAY_MISMATCH' || error.code === 'CATALOG_MISMATCH')
        ? 'CAMPAIGN_INVALID'
        : 'PROGRESS_INVALID';
    throw componentCode(code, 'components.progress', error);
  }
  if (save.tracker !== null) {
    try {
      const restored = restoreMissionProgress({ save, catalog });
      restored.tracker.dispose();
    } catch (error) {
      throw componentCode('PROGRESS_INVALID', 'components.progress', error);
    }
  }
  if (snapshot !== null && save.tracker !== null && save.campaign !== null) {
    // The world and the progress rows are one generation: the 130 rows carry the session and the
    // world epoch of the checkpoint, so a mixed payload cannot be assembled by hand.
    if (save.worldEpoch !== checkpoint?.worldEpoch) {
      fail(
        'WORLD_EPOCH_MISMATCH',
        'The progress rows and the checkpoint are not in the same world epoch',
        'components.progress.worldEpoch',
      );
    }
  }

  const counts: SessionArchiveCounts = Object.freeze({
    checkpoint: checkpoint !== null,
    progress: save.tracker !== null,
    campaign: save.campaign !== null,
    settings: settings !== null,
    profile: profile !== null,
    scenarios: scenarios.length,
    trackerInstances: save.tracker?.snapshot.instances.length ?? 0,
    trackerRewards: save.tracker?.snapshot.rewards.length ?? 0,
    campaignEvents: save.campaign?.events.length ?? 0,
    campaignCompleted: save.campaign?.counts.completed ?? 0,
    xp: save.campaign?.rewards.totals.xp ?? 0,
    rewardsGranted: save.campaign?.rewards.totals.granted ?? 0,
  });
  return Object.freeze({
    counts,
    digests: Object.freeze({
      tracker: save.tracker?.digest ?? null,
      campaign: save.campaign?.digest ?? null,
    }),
  });
}

/* ------------------------------------------------------------------- the builder */

export interface SessionArchiveProfileInput {
  readonly profileId: string;
  readonly activeVersionId: string;
  readonly activationSequence: number;
  readonly versionChecksum: string;
  readonly engineVersion: string;
  readonly activation?: unknown | null;
}

export interface SessionArchiveBuildInput {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  /** Creation time of the document; the caller owns it so the export stays deterministic. */
  readonly createdAt: string;
  readonly versions: SessionArchiveVersions;
  /** The authored 125 catalog of this build; the campaign log is replayed against it. */
  readonly catalog: unknown;
  readonly checkpoint?: unknown | null;
  /** The 130 rows of this session, in any order. */
  readonly progressRows?: readonly unknown[];
  readonly settings?: unknown | null;
  readonly scenarios?: readonly unknown[];
  readonly profile?: SessionArchiveProfileInput | null;
}

export interface SessionArchiveBuildAccepted {
  readonly version: typeof SESSION_ARCHIVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: SessionArchiveDocument;
  readonly checksum: string;
  readonly sizes: SessionArchiveSizes;
  readonly counts: SessionArchiveCounts;
  readonly bytes: number;
  readonly rejection: null;
}

export interface SessionArchiveBuildRejected {
  readonly version: typeof SESSION_ARCHIVE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksum: null;
  readonly sizes: null;
  readonly counts: null;
  readonly bytes: 0;
  readonly rejection: SessionArchiveRejection;
}

export type SessionArchiveBuildResult = SessionArchiveBuildAccepted | SessionArchiveBuildRejected;

function buildRejected(rejection: SessionArchiveRejection): SessionArchiveBuildRejected {
  return Object.freeze({
    version: SESSION_ARCHIVE_VERSION,
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

function readSizes(value: unknown): SessionArchiveSizes {
  const fields = [...sessionArchiveComponents, 'total', 'limit'] as const;
  const data = exact(value, fields, 'sizes');
  const sizes: Record<string, number> = Object.create(null);
  for (const field of fields) sizes[field] = integer(data[field], `sizes.${field}`);
  const declared = sizes as unknown as SessionArchiveSizes;
  if (declared.limit !== SESSION_ARCHIVE_LIMITS.maxTotalBytes) {
    fail(
      'SIZE_MISMATCH',
      `The archive declares a ${declared.limit} byte limit; this build accepts ${SESSION_ARCHIVE_LIMITS.maxTotalBytes}`,
      'sizes.limit',
    );
  }
  if (declared.total > declared.limit) {
    fail(
      'ARCHIVE_TOO_LARGE',
      `The archive declares ${declared.total} bytes, above its ${declared.limit} byte limit`,
      'sizes.total',
    );
  }
  return Object.freeze(declared);
}

/** Splits the 130 rows by the body kind they declare; anything else is refused. */
function splitProgressRows(
  rows: readonly unknown[],
): Readonly<{ progress: PersistedRecord | null; campaign: PersistedRecord | null }> {
  let progress: PersistedRecord | null = null;
  let campaign: PersistedRecord | null = null;
  for (const [index, raw] of rows.entries()) {
    let row: PersistedRecord;
    try {
      row = parsePersistedRecord(raw, 'PROGRESS');
    } catch (error) {
      throw componentCode('PROGRESS_INVALID', `progressRows[${index}]`, error);
    }
    const kind = object(row.body, `progressRows[${index}].body`).kind;
    if (kind === 'MISSION_TRACKER') {
      if (progress !== null) fail('DUPLICATE_RECORD', 'Duplicate tracker row', 'progressRows');
      progress = row;
    } else if (kind === 'CAMPAIGN_LEDGER') {
      if (campaign !== null) fail('DUPLICATE_RECORD', 'Duplicate campaign row', 'progressRows');
      campaign = row;
    } else {
      fail('PROGRESS_INVALID', `Unknown progress row kind: ${String(kind)}`, 'progressRows');
    }
  }
  return Object.freeze({ progress, campaign });
}

function readProfileInput(value: unknown): SessionArchiveProfileReference {
  const data = object(value, 'profile');
  return readProfileReference(data);
}

/**
 * Builds an archive document from already stored rows.
 *
 * The components are read with the parsers of their owners, the cross-component coherence is
 * checked, the size ledger is measured and enforced, and only then is the checksum stamped. A
 * refusal carries a closed code and leaves the caller with no half-built document.
 */
export function buildSessionArchive(input: SessionArchiveBuildInput): SessionArchiveBuildResult {
  try {
    const session = readSession({
      sessionId: input.sessionId,
      playerId: input.playerId,
      worldEpoch: input.worldEpoch,
    });
    const createdAt = timestamp(input.createdAt, 'createdAt');
    const versions = readVersions(input.versions);
    const checkpoint =
      input.checkpoint === undefined || input.checkpoint === null
        ? null
        : readCheckpoint(input.checkpoint);
    const rows = splitProgressRows(input.progressRows ?? []);
    const settings =
      input.settings === undefined || input.settings === null ? null : readSettings(input.settings);
    const profile =
      input.profile === undefined || input.profile === null
        ? null
        : readProfileInput(input.profile);
    const scenarios = readScenarioRows(input.scenarios ?? []);
    const components: SessionArchiveComponents = Object.freeze({
      checkpoint,
      progress: rows.progress,
      campaign: rows.campaign,
      settings,
      profile,
      scenarios,
    });
    const coherence = verifyCoherence({ session, versions, components, catalog: input.catalog });
    const sizes = sessionArchiveSizes(components);
    enforceComponentBudgets(sizes);
    const payload = {
      format: SESSION_ARCHIVE_FORMAT,
      formatVersion: SESSION_ARCHIVE_FORMAT_VERSION,
      schemaVersion: SESSION_ARCHIVE_SCHEMA_VERSION,
      units: 'SI' as const,
      createdAt,
      versions,
      session,
      components,
      sizes,
    };
    const document = stampSessionArchiveChecksum(payload);
    const canonical = canonicalizeJson(document, { maxDepth: SESSION_ARCHIVE_LIMITS.maxDepth });
    if (canonical.status === 'REJECTED') {
      fail(
        canonical.rejection.code === 'UNSAFE_KEY' ? 'UNSAFE_KEY' : 'CANONICALIZATION_FAILED',
        canonical.rejection.message,
        canonical.rejection.path,
      );
    }
    if (canonical.text.length > SESSION_ARCHIVE_LIMITS.maxFileBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The document has ${canonical.text.length} code units, above the ${SESSION_ARCHIVE_LIMITS.maxFileBytes} budget`,
        '$',
      );
    }
    return Object.freeze({
      version: SESSION_ARCHIVE_VERSION,
      status: 'ACCEPTED' as const,
      document,
      checksum: document.checksum.value,
      sizes,
      counts: coherence.counts,
      bytes: canonical.text.length,
      rejection: null,
    });
  } catch (error) {
    return buildRejected(toRejection(error));
  }
}

function toRejection(error: unknown): SessionArchiveRejection {
  if (error instanceof SessionArchiveError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  if (error instanceof PersistenceError) {
    return Object.freeze({
      code: 'PROGRESS_INVALID' as const,
      message: `${error.code}: ${error.message}`,
      path: error.path ?? '$',
    });
  }
  return Object.freeze({
    code: 'INVALID_FIELD' as const,
    message: describe(error),
    path: '$',
  });
}

/* -------------------------------------------------------------------- the reader */

function strictRejection(value: StrictJsonRejection): SessionArchiveRejection {
  const code: SessionArchiveRejectionCode =
    value.code === 'FILE_TOO_LARGE'
      ? 'FILE_TOO_LARGE'
      : value.code === 'DEPTH_EXCEEDED'
        ? 'DEPTH_EXCEEDED'
        : value.code === 'DUPLICATE_KEY'
          ? 'DUPLICATE_KEY'
          : value.code === 'TRAILING_CONTENT'
            ? 'TRAILING_CONTENT'
            : 'PARSE_ERROR';
  return Object.freeze({ code, message: value.message, path: value.path });
}
interface ParsedEnvelope {
  readonly createdAt: string;
  readonly versions: SessionArchiveVersions;
  readonly session: SessionArchiveSession;
  readonly components: SessionArchiveComponents;
  readonly declaredSizes: SessionArchiveSizes;
  readonly checksum: SessionArchiveChecksum;
  readonly bytes: number;
}

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

/**
 * Envelope first: format, versions, strict parse, canonical size, checksum.
 *
 * The order mirrors Docs/29: an envelope that does not verify is never interpreted, and a file for
 * a newer layout is refused before the checksum is recomputed.
 */
function parseEnvelope(input: unknown): ParsedEnvelope {
  let value = input;
  if (typeof input === 'string') {
    if (input.length > SESSION_ARCHIVE_LIMITS.maxFileBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The document has ${input.length} code units, above the ${SESSION_ARCHIVE_LIMITS.maxFileBytes} budget`,
        '$',
      );
    }
    const parsed = parseStrictJson(input, {
      maxBytes: SESSION_ARCHIVE_LIMITS.maxFileBytes,
      maxDepth: SESSION_ARCHIVE_LIMITS.maxDepth,
    });
    if (parsed.status === 'REJECTED') {
      const rejection = strictRejection(parsed.rejection);
      throw new SessionArchiveError(rejection.code, rejection.message, rejection.path);
    }
    value = parsed.value;
  }
  const envelope = exact(value, envelopeFields, '$');
  if (envelope.format !== SESSION_ARCHIVE_FORMAT) {
    fail('UNSUPPORTED_FORMAT', `Unsupported archive format: ${String(envelope.format)}`, 'format');
  }
  const formatVersion = envelope.formatVersion;
  if (typeof formatVersion === 'number' && Number.isInteger(formatVersion)) {
    if (formatVersion > SESSION_ARCHIVE_FORMAT_VERSION) {
      fail(
        'FORMAT_VERSION_TOO_NEW',
        `The file declares format version ${formatVersion}; this build reads version ${SESSION_ARCHIVE_FORMAT_VERSION}`,
        'formatVersion',
      );
    }
    if (formatVersion !== SESSION_ARCHIVE_FORMAT_VERSION) {
      fail(
        'UNSUPPORTED_FORMAT_VERSION',
        `Unsupported archive format version: ${formatVersion}`,
        'formatVersion',
      );
    }
  } else {
    fail('UNSUPPORTED_FORMAT_VERSION', 'Expected an integer format version', 'formatVersion');
  }
  const schemaVersion = envelope.schemaVersion;
  if (typeof schemaVersion === 'number' && Number.isInteger(schemaVersion)) {
    if (schemaVersion > SESSION_ARCHIVE_SCHEMA_VERSION) {
      fail(
        'SCHEMA_TOO_NEW',
        `The file declares schema version ${schemaVersion}; this build reads version ${SESSION_ARCHIVE_SCHEMA_VERSION}`,
        'schemaVersion',
      );
    }
    if (schemaVersion !== SESSION_ARCHIVE_SCHEMA_VERSION) {
      fail('UNSUPPORTED_SCHEMA', `Unsupported archive schema: ${schemaVersion}`, 'schemaVersion');
    }
  } else {
    fail('UNSUPPORTED_SCHEMA', 'Expected an integer schema version', 'schemaVersion');
  }
  if (envelope.units !== 'SI') {
    fail('INVALID_FIELD', 'The archive is stored in SI units only', 'units');
  }

  const canonical = canonicalizeJson(value, { maxDepth: SESSION_ARCHIVE_LIMITS.maxDepth });
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
  if (canonical.text.length > SESSION_ARCHIVE_LIMITS.maxFileBytes) {
    fail(
      'FILE_TOO_LARGE',
      `The canonical document has ${canonical.text.length} code units, above the ${SESSION_ARCHIVE_LIMITS.maxFileBytes} budget`,
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
  const checksum: SessionArchiveChecksum = Object.freeze({
    algorithm: CHECKSUM_ALGORITHM,
    canonicalization: CANONICALIZATION_VERSION,
    value: declaredChecksum,
  });
  const createdAt = timestamp(envelope.createdAt, 'createdAt');
  const versions = readVersions(envelope.versions);
  const session = readSession(envelope.session);
  const components = readComponents(envelope.components);
  const declaredSizes = readSizes(envelope.sizes);
  const payload: Omit<SessionArchiveDocument, 'checksum'> = {
    format: SESSION_ARCHIVE_FORMAT,
    formatVersion: SESSION_ARCHIVE_FORMAT_VERSION,
    schemaVersion: SESSION_ARCHIVE_SCHEMA_VERSION,
    units: 'SI',
    createdAt,
    versions,
    session,
    components,
    sizes: declaredSizes,
  };
  const computed = computeSessionArchiveChecksum(payload);
  if (computed !== declaredChecksum) {
    fail(
      'CHECKSUM_MISMATCH',
      'The archive was modified or is corrupted; the session was not loaded',
      'checksum.value',
    );
  }
  return Object.freeze({
    createdAt,
    versions,
    session,
    components,
    declaredSizes,
    checksum,
    bytes: canonical.text.length,
  });
}

/**
 * Reads and verifies an archive.
 *
 * Order: strict parse, envelope and checksum, size declaration, component parsers, cross-component
 * coherence against this build's catalog. Every step before the coherence is local to the file; the
 * coherence step is the one that proves the payload is one session of this game.
 */
export function readSessionArchive(
  input: unknown,
  expect: SessionArchiveExpectation,
): SessionArchiveValidation {
  try {
    if (
      typeof expect !== 'object' ||
      expect === null ||
      typeof expect.sessionId !== 'string' ||
      typeof expect.playerId !== 'string'
    ) {
      fail('INVALID_IDENTITY', 'Expected a target session and player', 'expect');
    }
    const parsed = parseEnvelope(input);
    if (parsed.session.sessionId !== expect.sessionId) {
      fail(
        'SESSION_MISMATCH',
        `The archive belongs to session ${parsed.session.sessionId}, not ${expect.sessionId}`,
        'session.sessionId',
      );
    }
    if (parsed.session.playerId !== expect.playerId) {
      fail(
        'SESSION_MISMATCH',
        `The archive belongs to player ${parsed.session.playerId}, not ${expect.playerId}`,
        'session.playerId',
      );
    }
    if (expect.versions !== undefined) {
      for (const field of ['engine', 'physics', 'map'] as const) {
        const expected = expect.versions[field];
        if (expected !== undefined && parsed.versions[field] !== expected) {
          fail(
            'VERSION_MISMATCH',
            `The archive targets ${field} version ${parsed.versions[field]}, not ${expected}`,
            `versions.${field}`,
          );
        }
      }
    }
    const measuredSizes = sessionArchiveSizes(parsed.components, parsed.declaredSizes.limit);
    enforceComponentBudgets(measuredSizes);
    for (const field of [...sessionArchiveComponents, 'total', 'limit'] as const) {
      if (measuredSizes[field] !== parsed.declaredSizes[field]) {
        fail(
          'SIZE_MISMATCH',
          `The declared ${field} size is ${parsed.declaredSizes[field]}, measured ${measuredSizes[field]}`,
          `sizes.${field}`,
        );
      }
    }
    const coherence = verifyCoherence({
      session: parsed.session,
      versions: parsed.versions,
      components: parsed.components,
      catalog: expect.catalog,
    });
    const document: SessionArchiveDocument = Object.freeze({
      format: SESSION_ARCHIVE_FORMAT,
      formatVersion: SESSION_ARCHIVE_FORMAT_VERSION,
      schemaVersion: SESSION_ARCHIVE_SCHEMA_VERSION,
      units: 'SI',
      createdAt: parsed.createdAt,
      versions: parsed.versions,
      session: parsed.session,
      components: parsed.components,
      sizes: parsed.declaredSizes,
      checksum: parsed.checksum,
    });
    return Object.freeze({
      version: SESSION_ARCHIVE_VERSION,
      status: 'ACCEPTED' as const,
      document,
      checksumVerified: true as const,
      session: parsed.session,
      sizes: measuredSizes,
      components: parsed.components,
      counts: coherence.counts,
      digests: coherence.digests,
      bytes: parsed.bytes,
      rejection: null,
    });
  } catch (error) {
    const rejection = toRejection(error);
    return Object.freeze({
      version: SESSION_ARCHIVE_VERSION,
      status: 'REJECTED' as const,
      document: null,
      checksumVerified: false as const,
      session: null,
      sizes: null,
      components: null,
      counts: null,
      digests: null,
      bytes: 0 as const,
      rejection,
    });
  }
}

/* --------------------------------------------------------------- the repository */

export interface SessionArchiveExportOptions {
  readonly sessionId: string;
  readonly playerId: string;
  /** Creation time of the document; the caller owns it so the export stays deterministic. */
  readonly createdAt: string;
  /** The authored 125 catalog of this build; the campaign log is replayed against it. */
  readonly catalog: unknown;
  /** Profile of the session; defaults to the profile the latest checkpoint names. */
  readonly profileId?: string;
  /** Engine/physics/map versions of this build; defaults to the checkpoint triple. */
  readonly versions?: SessionArchiveVersions;
}

export interface SessionArchiveExportAccepted {
  readonly version: typeof SESSION_ARCHIVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: SessionArchiveDocument;
  readonly checksum: string;
  readonly sizes: SessionArchiveSizes;
  readonly counts: SessionArchiveCounts;
  readonly bytes: number;
  readonly rejection: null;
}

export type SessionArchiveExportResult = SessionArchiveExportAccepted | SessionArchiveBuildRejected;

/**
 * Builds an archive from the local repository.
 *
 * The repository is the only source: the latest 206 checkpoint, the 130 rows and settings of the
 * session, the explicit 127 scenario rows, and the 109/110 profile generation the checkpoint names.
 * Nothing is read from a live object, and nothing is written.
 */
export async function exportSessionArchive(
  repository: LocalRepository,
  options: SessionArchiveExportOptions,
): Promise<SessionArchiveExportResult> {
  try {
    const sessionId = boundedText(
      options.sessionId,
      'sessionId',
      PERSISTENCE_LIMITS.maxIdCodeUnits,
    );
    const playerId = boundedText(options.playerId, 'playerId', PERSISTENCE_LIMITS.maxIdCodeUnits);
    const checkpoint = await repository.latestCheckpoint(sessionId);
    const rows = await repository.readPlayerSave(sessionId, playerId);
    const scenarios = await repository.listScenarios(sessionId);
    const profileId = options.profileId ?? checkpoint?.profileId ?? null;
    let profile: SessionArchiveProfileInput | null = null;
    if (profileId !== null) {
      const history = await repository.getProfileHistory(profileId);
      const activation = await repository.getActivation(profileId);
      let activeVersionId: string | null = null;
      if (checkpoint !== null) {
        const read = readWorldSnapshot(checkpoint.body);
        if (read.status === 'REJECTED') {
          fail(
            read.rejection.code === 'CHECKSUM_MISMATCH'
              ? 'CHECKSUM_MISMATCH'
              : 'CHECKPOINT_INVALID',
            read.rejection.message,
            read.rejection.path,
          );
        }
        activeVersionId = read.snapshot.profile.activeVersionId;
      } else {
        activeVersionId = history.activeVersionId;
      }
      if (activeVersionId !== null) {
        const version = history.versions.find((entry) => entry.versionId === activeVersionId);
        if (version === undefined) {
          fail(
            'PROFILE_VERSION_MISSING',
            `The version ${activeVersionId} is not stored for ${profileId}`,
            'profile.activeVersionId',
          );
        }
        profile = {
          profileId,
          activeVersionId,
          activationSequence:
            checkpoint === null ? (activation?.sequence ?? 0) : readSnapshotActivation(checkpoint),
          versionChecksum: version.checksum,
          engineVersion: version.engineVersion,
          activation,
        };
      }
    }
    const versions = options.versions ?? versionsOf(checkpoint);
    if (versions === null) {
      fail(
        'VERSION_MISMATCH',
        'The archive needs the engine/physics/map versions of the build',
        'versions',
      );
    }
    return buildSessionArchive({
      sessionId,
      playerId,
      worldEpoch: checkpoint?.worldEpoch ?? progressEpoch(rows),
      createdAt: options.createdAt,
      versions,
      catalog: options.catalog,
      checkpoint,
      progressRows: rows.progress,
      settings: rows.settings,
      scenarios,
      profile,
    });
  } catch (error) {
    return buildRejected(toRejection(error));
  }
}

function readSnapshotActivation(checkpoint: CheckpointRecord): number {
  const read = readWorldSnapshot(checkpoint.body);
  if (read.status === 'REJECTED') {
    fail('CHECKPOINT_INVALID', read.rejection.message, read.rejection.path);
  }
  return read.snapshot.profile.activationSequence;
}

function progressEpoch(rows: { readonly progress: readonly unknown[] }): number {
  for (const row of rows.progress) {
    try {
      return parsePersistedRecord(row, 'PROGRESS').worldEpoch;
    } catch {
      continue;
    }
  }
  return 0;
}

function versionsOf(checkpoint: CheckpointRecord | null): SessionArchiveVersions | null {
  if (checkpoint === null) return null;
  return {
    engine: checkpoint.engineVersion,
    physics: checkpoint.physicsVersion,
    map: checkpoint.mapVersion,
  };
}
