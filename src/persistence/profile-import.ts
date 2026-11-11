import { canonicalizeJson, parseStrictJson } from './canonical-json';
import type { StrictJsonRejection } from './canonical-json';
import type { PersistenceRejection } from './contracts';
import {
  PROFILE_EXPORT_FORMAT,
  PROFILE_EXPORT_FORMAT_VERSION,
  PROFILE_EXPORT_LIMITS,
  PROFILE_EXPORT_SCHEMA_VERSION,
  profileExportRejectionCodes,
  readProfileExport,
} from './profile-export';
import type {
  ProfileExportDocument,
  ProfileExportRejection,
  ProfileExportVersion,
} from './profile-export';
import type { ProfileImportCommit } from './profile-import-transaction';
import type { ProfileTransactionHooks } from './profile-transaction';
import type { LocalRepository } from './repository';
import { computeProfileVersionChecksum } from '../profiles';
import type { ProfileVersion, ProfileVersionContent } from '../profiles';

/**
 * Validated profile import and explicit activation for PBI 134.
 *
 * The importer consumes exactly the 133 document
 * (`self-driving-academy-profile-export`, `formatVersion 1`, `schemaVersion 1`) through the 133
 * reader and the shared `SDA-CJSON-1` canonicalization. It never builds a parallel parser: the
 * 133 reader already owns the key whitelist, the units, the 092 ranges, the reserved keys, the
 * per-version 109 checksums, the document checksum, the provenance and the history chain.
 *
 * Three rules drive the module:
 *
 * 1. **Nothing is written before the whole document is valid.** Size, format, schema, units, keys,
 *    ranges, checksums, provenance, history depth and the engine/profile identity are checked
 *    first. A refusal carries a closed code with a message and a path, and leaves the stored
 *    profile, its versions and its activation exactly as they were.
 * 2. **A newer format is a closed refusal, not best effort.** A `formatVersion` or `schemaVersion`
 *    above this build is reported as `FORMAT_VERSION_TOO_NEW` / `SCHEMA_TOO_NEW` before the
 *    checksum is interpreted, because an unknown layout must not be read with today's rules.
 * 3. **Import and activation are separate actions.** `importProfileDocument` writes the version
 *    rows only. `activateImportedProfile` is an explicit second call that goes through the real
 *    205 barrier (which publishes the common 110 activation for taxis and civilians) and then
 *    writes the durable 109/110 pointer through the 128 version+activation transaction.
 *
 * Progression (revenue, daily missions, XP) is not an input of this module and is never written.
 */

/** Contract id of this layer. */
export const PROFILE_IMPORT_VERSION = '134-profile-import-v1' as const;

/** Fixed budgets of the import; aligned with the 133 export and the 109 store. */
export const PROFILE_IMPORT_LIMITS = Object.freeze({
  /** Versions accepted by one import (the 133 document cap). */
  maxVersions: PROFILE_EXPORT_LIMITS.maxVersions,
  /** History depth accepted by one import, aligned with the 109 per-profile cap. */
  maxHistoryDepth: PROFILE_EXPORT_LIMITS.maxVersions,
  /** Canonical UTF-16 code units of the parsed document. */
  maxFileBytes: PROFILE_EXPORT_LIMITS.maxFileBytes,
  maxDepth: PROFILE_EXPORT_LIMITS.maxDepth,
  idCodeUnits: 256,
});

/**
 * Closed refusal vocabulary of the import.
 *
 * It contains every 133 refusal unchanged (the document layer keeps its own codes) plus the
 * reasons that only exist at the import boundary.
 */
export const profileImportRejectionCodes = [
  ...profileExportRejectionCodes,
  'FORMAT_VERSION_TOO_NEW',
  'SCHEMA_TOO_NEW',
  'ENGINE_INCOMPATIBLE',
  'IMPORT_PROFILE_MISMATCH',
  'IMPORT_PLAYER_MISMATCH',
  'HISTORY_TOO_DEEP',
  'IMPORT_TARGET_NOT_FOUND',
  'IMPORT_TARGET_MISMATCH',
  'IMPORT_STORE_REJECTED',
  'IMPORT_WRITE_FAILED',
  'IMPORT_STALE_ACTIVATION',
  'IMPORT_BARRIER_REJECTED',
  'IMPORT_ACTIVATION_MISSING',
  'IMPORT_ACTIVATION_STALE_TICK',
] as const;
export type ProfileImportRejectionCode = (typeof profileImportRejectionCodes)[number];

export interface ProfileImportRejection {
  readonly code: ProfileImportRejectionCode;
  readonly message: string;
  readonly path: string;
}

/** Identity the import is allowed to land on. */
export interface ProfileImportExpectation {
  /** The stored profile that receives the versions. */
  readonly profileId: string;
  /** Engine of this build; every imported version must target it. */
  readonly engineVersion: string;
  /** Optional progression identity; a document activated for another player is refused. */
  readonly playerId?: string;
}

export interface ProfileImportValidationAccepted {
  readonly version: typeof PROFILE_IMPORT_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: ProfileExportDocument;
  readonly profileId: string;
  readonly engineVersion: string;
  /** The player recorded in the document activation, or `null`. */
  readonly playerId: string | null;
  /** The 109 records reconstructed from the document, in depth order. */
  readonly versions: readonly ProfileVersion[];
  readonly activeVersionId: string | null;
  /** Deepest version of the imported history. */
  readonly tipVersionId: string;
  readonly maxDepth: number;
  readonly reservedParameters: Readonly<Record<string, null>>;
  readonly counts: {
    readonly versions: number;
    readonly baseVersions: number;
    readonly derivedVersions: number;
    readonly parameters: number;
    readonly reservedParameters: number;
  };
  readonly bytes: number;
  readonly checksumVerified: true;
  readonly rejection: null;
}

export interface ProfileImportValidationRejected {
  readonly version: typeof PROFILE_IMPORT_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly profileId: null;
  readonly engineVersion: null;
  readonly playerId: null;
  readonly versions: null;
  readonly activeVersionId: null;
  readonly tipVersionId: null;
  readonly maxDepth: null;
  readonly reservedParameters: null;
  readonly counts: null;
  readonly bytes: 0;
  readonly checksumVerified: false;
  readonly rejection: ProfileImportRejection;
}

export type ProfileImportValidationResult =
  ProfileImportValidationAccepted | ProfileImportValidationRejected;

export interface ProfileImportRequest {
  /** The file text or an already parsed object; the 133 reader accepts both. */
  readonly document: unknown;
  readonly expect: ProfileImportExpectation;
  readonly hooks?: ProfileTransactionHooks;
}

export interface ProfileImportAccepted {
  readonly version: typeof PROFILE_IMPORT_VERSION;
  readonly status: 'COMMITTED';
  readonly profileId: string;
  readonly versionIds: readonly string[];
  readonly versionsCreated: number;
  readonly versionsExisting: number;
  readonly bytes: number;
  /** True when the transaction committed but the fault hook fired afterwards. */
  readonly crashAfterCommit: boolean;
  /** Always `false`: an import never activates implicitly. */
  readonly activated: false;
  readonly activation: null;
  readonly validation: ProfileImportValidationAccepted;
  readonly rejection: null;
}

export interface ProfileImportRejected {
  readonly version: typeof PROFILE_IMPORT_VERSION;
  readonly status: 'REJECTED';
  readonly profileId: string | null;
  readonly versionIds: null;
  readonly versionsCreated: 0;
  readonly versionsExisting: 0;
  readonly bytes: 0;
  readonly crashAfterCommit: false;
  readonly activated: false;
  readonly activation: null;
  readonly validation: null;
  readonly rejection: ProfileImportRejection;
}

export type ProfileImportResult = ProfileImportAccepted | ProfileImportRejected;

/* ------------------------------------------------------------- the 205 port */

/** Minimal structural view of one 205 barrier record. */
export interface ProfileImportBarrierRecord {
  readonly barrierId: string;
  readonly status: string;
  readonly targetVersionId: string;
  readonly learningEpoch: number;
  readonly activationCommandId: string | null;
  readonly activationTick: number | null;
  readonly activationDuplicate: boolean;
  readonly code: string | null;
  readonly detail: string | null;
}

export interface ProfileImportGeneration {
  readonly learningEpoch: number;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly status: string;
}

export interface ProfileImportBarrierRequestResult {
  readonly status: 'PENDING' | 'REJECTED' | 'DUPLICATE';
  readonly code: string | null;
  readonly detail: string | null;
  readonly barrier: ProfileImportBarrierRecord | null;
  readonly generation: ProfileImportGeneration;
}

export interface ProfileImportBarrierResolveResult {
  readonly status: 'APPLIED' | 'ROLLED_BACK' | 'REJECTED' | 'NOTHING_PENDING' | 'TICK_NOT_REACHED';
  readonly code: string | null;
  readonly detail: string | null;
  readonly barrier: ProfileImportBarrierRecord | null;
  readonly generation: ProfileImportGeneration;
}

/**
 * Structural view of the real 205 `learningEpoch` barrier.
 *
 * The importer does not create, resolve or repair the barrier itself; it requests the explicit
 * `IMPORT` change and lets 205 close the segment, cancel the old generation, publish the common
 * 110 activation and open the next generation.
 */
export interface ProfileImportBarrierPort {
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  current(): ProfileImportGeneration;
  pending(): ProfileImportBarrierRecord | null;
  requestChange(input: unknown): ProfileImportBarrierRequestResult;
  resolve(): ProfileImportBarrierResolveResult;
}

export interface ProfileImportActivationSources {
  readonly repository: LocalRepository;
  readonly barrier: ProfileImportBarrierPort;
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  /** Fixed-tick readback owned by the host. */
  readonly tick: () => number;
  /** Deterministic UTC timestamp for the durable activation row. */
  readonly now: () => string;
}

export interface ProfileImportActivationRequest {
  readonly versionId: string;
  /** The host tick of this call; it must equal the injected fixed-tick readback. */
  readonly tick: number;
}

export interface ProfileImportActivationAccepted {
  readonly version: typeof PROFILE_IMPORT_VERSION;
  readonly status: 'ACTIVATED' | 'ALREADY_ACTIVE' | 'PENDING';
  readonly profileId: string;
  readonly versionId: string;
  readonly sequence: number | null;
  readonly activatedAt: string | null;
  readonly barrierId: string | null;
  readonly activationCommandId: string | null;
  readonly activateAtTick: number | null;
  readonly learningEpoch: number | null;
  readonly duplicate: boolean;
  readonly rejection: null;
}

export interface ProfileImportActivationRejected {
  readonly version: typeof PROFILE_IMPORT_VERSION;
  readonly status: 'REJECTED';
  readonly profileId: string | null;
  readonly versionId: string | null;
  readonly sequence: null;
  readonly activatedAt: null;
  readonly barrierId: null;
  readonly activationCommandId: null;
  readonly activateAtTick: null;
  readonly learningEpoch: null;
  readonly duplicate: false;
  readonly rejection: ProfileImportRejection;
}

export type ProfileImportActivationResult =
  ProfileImportActivationAccepted | ProfileImportActivationRejected;

/* ------------------------------------------------------------------ helpers */

function rejection(
  code: ProfileImportRejectionCode,
  message: string,
  path: string,
): ProfileImportRejection {
  return Object.freeze({ code, message, path });
}

function strictRejection(value: StrictJsonRejection): ProfileImportRejection {
  const code: ProfileImportRejectionCode =
    value.code === 'FILE_TOO_LARGE'
      ? 'FILE_TOO_LARGE'
      : value.code === 'DEPTH_EXCEEDED'
        ? 'DEPTH_EXCEEDED'
        : value.code === 'DUPLICATE_KEY'
          ? 'DUPLICATE_KEY'
          : value.code === 'TRAILING_CONTENT'
            ? 'TRAILING_CONTENT'
            : 'PARSE_ERROR';
  return rejection(code, value.message, value.path);
}

type PreflightAccepted = { readonly ok: true; readonly value: unknown };
type PreflightRejected = { readonly ok: false; readonly rejection: ProfileImportRejection };

/**
 * Parses and bounds the document, then refuses an unknown newer layout before any checksum is
 * interpreted. The strict 133 parser is reused; there is no second JSON parser in this module.
 */
function preflight(input: unknown): PreflightAccepted | PreflightRejected {
  let value = input;
  if (typeof input === 'string') {
    if (input.length > PROFILE_IMPORT_LIMITS.maxFileBytes) {
      return {
        ok: false,
        rejection: rejection(
          'FILE_TOO_LARGE',
          `The document has ${input.length} code units, above the ${PROFILE_IMPORT_LIMITS.maxFileBytes} budget`,
          '$',
        ),
      };
    }
    const parsed = parseStrictJson(input, {
      maxBytes: PROFILE_IMPORT_LIMITS.maxFileBytes,
      maxDepth: PROFILE_IMPORT_LIMITS.maxDepth,
    });
    if (parsed.status === 'REJECTED') {
      return { ok: false, rejection: strictRejection(parsed.rejection) };
    }
    value = parsed.value;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      rejection: rejection('INVALID_FIELD', 'Expected a profile export object', '$'),
    };
  }
  const data = value as Record<string, unknown>;
  if (data.format !== PROFILE_EXPORT_FORMAT) {
    return {
      ok: false,
      rejection: rejection(
        'UNSUPPORTED_FORMAT',
        `Unsupported export format: ${String(data.format)}`,
        'format',
      ),
    };
  }
  if (
    typeof data.formatVersion === 'number' &&
    Number.isInteger(data.formatVersion) &&
    data.formatVersion > PROFILE_EXPORT_FORMAT_VERSION
  ) {
    return {
      ok: false,
      rejection: rejection(
        'FORMAT_VERSION_TOO_NEW',
        `The file declares format version ${String(data.formatVersion)}; this build reads version ${PROFILE_EXPORT_FORMAT_VERSION}`,
        'formatVersion',
      ),
    };
  }
  if (
    typeof data.schemaVersion === 'number' &&
    Number.isInteger(data.schemaVersion) &&
    data.schemaVersion > PROFILE_EXPORT_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      rejection: rejection(
        'SCHEMA_TOO_NEW',
        `The file declares schema version ${String(data.schemaVersion)}; this build reads version ${PROFILE_EXPORT_SCHEMA_VERSION}`,
        'schemaVersion',
      ),
    };
  }
  const canonical = canonicalizeJson(value, { maxDepth: PROFILE_IMPORT_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    return {
      ok: false,
      rejection: rejection(
        canonical.rejection.code === 'UNSAFE_KEY' ? 'UNSAFE_KEY' : 'CANONICALIZATION_FAILED',
        canonical.rejection.message,
        canonical.rejection.path,
      ),
    };
  }
  if (canonical.text.length > PROFILE_IMPORT_LIMITS.maxFileBytes) {
    return {
      ok: false,
      rejection: rejection(
        'FILE_TOO_LARGE',
        `The canonical document has ${canonical.text.length} code units, above the ${PROFILE_IMPORT_LIMITS.maxFileBytes} budget`,
        '$',
      ),
    };
  }
  return { ok: true, value };
}

/**
 * Reconstructs the immutable 109 record from an exported version.
 *
 * The document carries the same content as the 109 row (parameters, provenance, delta, depth,
 * timestamps); the 133 reader already recomputed the 109 checksum of every version, and the
 * checksum is recomputed once more here before a row can be written.
 */
function toProfileVersion(
  profileId: string,
  version: ProfileExportVersion,
  path: string,
): ProfileVersion | ProfileImportRejection {
  const parameterKeys = Object.keys(version.parameters);
  if (parameterKeys.length === 0) {
    return rejection(
      'INVALID_FIELD',
      'A profile version needs at least one parameter',
      `${path}.parameters`,
    );
  }
  const parameters: Record<string, number> = Object.create(null);
  for (const key of parameterKeys) parameters[key] = version.parameters[key].value;
  const delta = version.provenance.delta;
  const content: ProfileVersionContent = {
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters: Object.freeze(parameters),
    provenance: Object.freeze({
      origin: version.provenance.origin,
      sourceSegmentIds: version.provenance.sourceSegmentIds,
      sourceInterventionIds: version.provenance.sourceInterventionIds,
      delta:
        delta === null
          ? null
          : Object.freeze({
              baseVersionId: delta.baseVersionId,
              validationVersion: delta.validationVersion,
              segmentId: delta.segmentId,
              interventionId: delta.interventionId,
              reason: delta.reason,
              keyCount: delta.keyCount,
              changes: delta.changes,
            }),
    }),
    sourceSegmentIds: version.provenance.sourceSegmentIds,
    depth: version.depth,
    createdAt: version.createdAt,
  };
  const checksum = computeProfileVersionChecksum(content);
  if (checksum !== version.checksum) {
    return rejection(
      'PROFILE_CHECKSUM_MISMATCH',
      `The version ${version.versionId} does not match its 109 checksum`,
      `${path}.checksum`,
    );
  }
  return Object.freeze({ ...content, checksum });
}

function compareByDepth(left: ProfileVersion, right: ProfileVersion): number {
  if (left.depth !== right.depth) return left.depth - right.depth;
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
  if (left.versionId === right.versionId) return 0;
  return left.versionId < right.versionId ? -1 : 1;
}

function validationRejected(rej: ProfileImportRejection): ProfileImportValidationRejected {
  return Object.freeze({
    version: PROFILE_IMPORT_VERSION,
    status: 'REJECTED' as const,
    document: null,
    profileId: null,
    engineVersion: null,
    playerId: null,
    versions: null,
    activeVersionId: null,
    tipVersionId: null,
    maxDepth: null,
    reservedParameters: null,
    counts: null,
    bytes: 0 as const,
    checksumVerified: false as const,
    rejection: rej,
  });
}

/**
 * Validates an exported profile document for import.
 *
 * The whole document is checked before the caller is allowed to write anything: the newer
 * format/schema preflight, the strict parse, the 133 envelope/checksum/schema/units/keys/ranges/
 * checksum/provenance/history validation, then the import identity (profile, engine, player) and
 * the explicit history budget.
 */
export function validateProfileImport(
  input: unknown,
  expect: ProfileImportExpectation,
): ProfileImportValidationResult {
  if (
    typeof expect !== 'object' ||
    expect === null ||
    typeof expect.profileId !== 'string' ||
    expect.profileId.length === 0 ||
    typeof expect.engineVersion !== 'string' ||
    expect.engineVersion.length === 0
  ) {
    return validationRejected(
      rejection('INVALID_IDENTITY', 'Expected a target profile and engine', 'expect'),
    );
  }

  const bounded = preflight(input);
  if (!bounded.ok) return validationRejected(bounded.rejection);

  const read = readProfileExport(bounded.value);
  if (read.status === 'REJECTED') {
    return validationRejected(read.rejection as ProfileExportRejection);
  }
  const document = read.document;

  if (document.profile.profileId !== expect.profileId) {
    return validationRejected(
      rejection(
        'IMPORT_PROFILE_MISMATCH',
        `The file belongs to ${document.profile.profileId}, not ${expect.profileId}`,
        'profile.profileId',
      ),
    );
  }
  if (document.engineVersion !== expect.engineVersion) {
    return validationRejected(
      rejection(
        'ENGINE_INCOMPATIBLE',
        `The file targets engine ${document.engineVersion}, not ${expect.engineVersion}`,
        'engineVersion',
      ),
    );
  }
  const activationPlayerId = document.profile.activation?.playerId ?? null;
  if (
    expect.playerId !== undefined &&
    activationPlayerId !== null &&
    activationPlayerId !== expect.playerId
  ) {
    return validationRejected(
      rejection(
        'IMPORT_PLAYER_MISMATCH',
        `The file was activated for ${activationPlayerId}, not ${expect.playerId}`,
        'profile.activation.playerId',
      ),
    );
  }
  for (let index = 0; index < document.profile.versions.length; index += 1) {
    const version = document.profile.versions[index];
    if (version.engineVersion !== expect.engineVersion) {
      return validationRejected(
        rejection(
          'ENGINE_INCOMPATIBLE',
          `The version ${version.versionId} targets engine ${version.engineVersion}, not ${expect.engineVersion}`,
          `profile.versions[${index}].engineVersion`,
        ),
      );
    }
  }

  if (document.profile.versions.length > PROFILE_IMPORT_LIMITS.maxVersions) {
    return validationRejected(
      rejection(
        'HISTORY_TOO_DEEP',
        `The history has ${document.profile.versions.length} versions, above the ${PROFILE_IMPORT_LIMITS.maxVersions} budget`,
        'profile.versions',
      ),
    );
  }

  const versions: ProfileVersion[] = [];
  for (let index = 0; index < document.profile.versions.length; index += 1) {
    const version = toProfileVersion(
      document.profile.profileId,
      document.profile.versions[index],
      `profile.versions[${index}]`,
    );
    if ('code' in version) return validationRejected(version);
    versions.push(version);
  }
  versions.sort(compareByDepth);
  const maxDepth = versions[versions.length - 1].depth;
  if (maxDepth + 1 > PROFILE_IMPORT_LIMITS.maxHistoryDepth) {
    return validationRejected(
      rejection(
        'HISTORY_TOO_DEEP',
        `The history depth ${maxDepth + 1} is above the ${PROFILE_IMPORT_LIMITS.maxHistoryDepth} budget`,
        'profile.versions',
      ),
    );
  }

  const canonical = canonicalizeJson(bounded.value, {
    maxDepth: PROFILE_IMPORT_LIMITS.maxDepth,
  });
  if (canonical.status === 'REJECTED') {
    return validationRejected(
      rejection('CANONICALIZATION_FAILED', canonical.rejection.message, canonical.rejection.path),
    );
  }

  let baseVersions = 0;
  for (const version of versions) {
    if (version.provenance.origin === 'BASE') baseVersions += 1;
  }
  return Object.freeze({
    version: PROFILE_IMPORT_VERSION,
    status: 'ACCEPTED' as const,
    document,
    profileId: document.profile.profileId,
    engineVersion: document.engineVersion,
    playerId: activationPlayerId,
    versions: Object.freeze(versions),
    activeVersionId: document.profile.activeVersionId,
    tipVersionId: versions[versions.length - 1].versionId,
    maxDepth,
    reservedParameters: document.profile.reservedParameters,
    counts: Object.freeze({
      versions: versions.length,
      baseVersions,
      derivedVersions: versions.length - baseVersions,
      parameters: document.aggregates.counts.parameters,
      reservedParameters: document.aggregates.counts.reservedParameters,
    }),
    bytes: canonical.text.length,
    checksumVerified: true as const,
    rejection: null,
  });
}

function importRejected(
  rej: ProfileImportRejection,
  profileId: string | null = null,
): ProfileImportRejected {
  return Object.freeze({
    version: PROFILE_IMPORT_VERSION,
    status: 'REJECTED' as const,
    profileId,
    versionIds: null,
    versionsCreated: 0 as const,
    versionsExisting: 0 as const,
    bytes: 0 as const,
    crashAfterCommit: false as const,
    activated: false as const,
    activation: null,
    validation: null,
    rejection: rej,
  });
}

function mapPersistenceRejection(value: PersistenceRejection): ProfileImportRejection {
  const code: ProfileImportRejectionCode =
    value.code === 'STALE_REVISION'
      ? 'IMPORT_STALE_ACTIVATION'
      : value.code === 'REFERENCE_MISSING' ||
          value.code === 'IMMUTABLE_RECORD' ||
          value.code === 'PROFILE_CHECKSUM_MISMATCH' ||
          value.code === 'INVALID_RECORD' ||
          value.code === 'RECORD_TOO_LARGE' ||
          value.code === 'BODY_INVALID' ||
          value.code === 'BODY_TOO_LARGE'
        ? 'IMPORT_STORE_REJECTED'
        : 'IMPORT_WRITE_FAILED';
  return rejection(code, `${value.code}: ${value.message}`, value.path ?? '$');
}

/**
 * Validates a document and, only when the whole document is accepted, writes its versions in one
 * `profiles` transaction.
 *
 * No activation row is written and no 205/110 publication happens: `activated` is always `false`.
 * A validation failure, a corrupted stored row, an interrupted transaction or an immutable
 * conflict leaves the profile, its versions and its activation untouched.
 */
export async function importProfileDocument(
  repository: LocalRepository,
  request: ProfileImportRequest,
): Promise<ProfileImportResult> {
  const validation = validateProfileImport(request.document, request.expect);
  if (validation.status === 'REJECTED') return importRejected(validation.rejection);

  let outcome;
  try {
    outcome = await repository.commitProfileImport(
      { profileId: validation.profileId, versions: validation.versions },
      request.hooks,
    );
  } catch (error: unknown) {
    return importRejected(
      rejection(
        'IMPORT_WRITE_FAILED',
        error instanceof Error ? error.message : 'The import transaction failed',
        'profiles',
      ),
      validation.profileId,
    );
  }
  if (outcome.status === 'REJECTED') {
    return importRejected(mapPersistenceRejection(outcome.rejection), validation.profileId);
  }
  const commit: ProfileImportCommit = outcome.value;
  return Object.freeze({
    version: PROFILE_IMPORT_VERSION,
    status: 'COMMITTED' as const,
    profileId: commit.profileId,
    versionIds: commit.versionIds,
    versionsCreated: commit.versionsCreated,
    versionsExisting: commit.versionsExisting,
    bytes: commit.bytes,
    crashAfterCommit: outcome.status === 'CRASHED_AFTER_COMMIT',
    activated: false as const,
    activation: null,
    validation,
    rejection: null,
  });
}

/* --------------------------------------------------------------- activation */

function activationRejected(
  rej: ProfileImportRejection,
  profileId: string | null = null,
  versionId: string | null = null,
): ProfileImportActivationRejected {
  return Object.freeze({
    version: PROFILE_IMPORT_VERSION,
    status: 'REJECTED' as const,
    profileId,
    versionId,
    sequence: null,
    activatedAt: null,
    barrierId: null,
    activationCommandId: null,
    activateAtTick: null,
    learningEpoch: null,
    duplicate: false as const,
    rejection: rej,
  });
}

function mapBarrierCode(code: string | null): ProfileImportRejectionCode {
  if (code === 'TARGET_PROFILE_MISMATCH') return 'IMPORT_PROFILE_MISMATCH';
  if (code === 'TARGET_VERSION_NOT_FOUND') return 'IMPORT_TARGET_NOT_FOUND';
  if (code === 'TARGET_ENGINE_MISMATCH') return 'ENGINE_INCOMPATIBLE';
  if (code === 'IMPORT_INVALID') return 'IMPORT_BARRIER_REJECTED';
  if (code === 'TICK_NOT_ADVANCING') return 'IMPORT_ACTIVATION_STALE_TICK';
  return 'IMPORT_BARRIER_REJECTED';
}

function activationAccepted(
  status: 'ACTIVATED' | 'ALREADY_ACTIVE' | 'PENDING',
  input: {
    readonly profileId: string;
    readonly versionId: string;
    readonly sequence: number | null;
    readonly activatedAt: string | null;
    readonly barrierId: string | null;
    readonly activationCommandId: string | null;
    readonly activateAtTick: number | null;
    readonly learningEpoch: number | null;
    readonly duplicate: boolean;
  },
): ProfileImportActivationAccepted {
  return Object.freeze({
    version: PROFILE_IMPORT_VERSION,
    status,
    profileId: input.profileId,
    versionId: input.versionId,
    sequence: input.sequence,
    activatedAt: input.activatedAt,
    barrierId: input.barrierId,
    activationCommandId: input.activationCommandId,
    activateAtTick: input.activateAtTick,
    learningEpoch: input.learningEpoch,
    duplicate: input.duplicate,
    rejection: null,
  });
}

/**
 * Explicitly activates one already imported version.
 *
 * The call is a separate action from the import. It:
 *
 * 1. requires the version to exist in the stored 109 history and to belong to the target
 *    profile/engine;
 * 2. requests the real 205 `IMPORT` barrier and resolves it at the host tick boundary, so the
 *    current segment closes with `PROFILE_CHANGE`, the old learning generation is cancelled and
 *    the common 110 activation is published once for taxis and civilians;
 * 3. writes the durable 109/110 pointer through the 128 version+activation transaction.
 *
 * A `TICK_NOT_REACHED` answer is reported as `PENDING` and writes no activation row. A refused or
 * rolled-back barrier writes nothing. The old generation is not revived: 205 `isCurrent` answers
 * `LATE_RESULT`/`STALE_GENERATION` for a result produced before the import.
 */
export async function activateImportedProfile(
  sources: ProfileImportActivationSources,
  request: ProfileImportActivationRequest,
): Promise<ProfileImportActivationResult> {
  const { repository, barrier } = sources;
  const profileId = sources.profileId;
  const versionId = request.versionId;

  if (typeof versionId !== 'string' || versionId.length === 0) {
    return activationRejected(
      rejection('INVALID_IDENTITY', 'Expected a stored version id', 'versionId'),
      profileId,
    );
  }
  if (barrier.profileId !== profileId) {
    return activationRejected(
      rejection(
        'IMPORT_PROFILE_MISMATCH',
        `The 205 barrier is pinned to ${barrier.profileId}, not ${profileId}`,
        'barrier.profileId',
      ),
      profileId,
      versionId,
    );
  }
  if (barrier.playerId !== sources.playerId) {
    return activationRejected(
      rejection(
        'IMPORT_PLAYER_MISMATCH',
        `The 205 barrier belongs to ${barrier.playerId}, not ${sources.playerId}`,
        'barrier.playerId',
      ),
      profileId,
      versionId,
    );
  }
  if (barrier.engineVersion !== sources.engineVersion) {
    return activationRejected(
      rejection(
        'ENGINE_INCOMPATIBLE',
        `The 205 barrier targets engine ${barrier.engineVersion}, not ${sources.engineVersion}`,
        'barrier.engineVersion',
      ),
      profileId,
      versionId,
    );
  }
  if (sources.tick() !== request.tick) {
    return activationRejected(
      rejection(
        'IMPORT_ACTIVATION_STALE_TICK',
        `The request names tick ${request.tick}, but the host is at ${sources.tick()}`,
        'tick',
      ),
      profileId,
      versionId,
    );
  }

  let stored: ProfileVersion | null;
  try {
    stored = await repository.getProfile(versionId);
  } catch (error: unknown) {
    return activationRejected(
      rejection(
        'IMPORT_STORE_REJECTED',
        error instanceof Error ? error.message : 'The stored version cannot be read',
        'profiles',
      ),
      profileId,
      versionId,
    );
  }
  if (stored === null) {
    return activationRejected(
      rejection(
        'IMPORT_TARGET_NOT_FOUND',
        `The version ${versionId} is not stored`,
        'profile.versionId',
      ),
      profileId,
      versionId,
    );
  }
  if (stored.profileId !== profileId) {
    return activationRejected(
      rejection(
        'IMPORT_TARGET_MISMATCH',
        `The version ${versionId} belongs to ${stored.profileId}, not ${profileId}`,
        'profile.profileId',
      ),
      profileId,
      versionId,
    );
  }
  if (stored.engineVersion !== sources.engineVersion) {
    return activationRejected(
      rejection(
        'ENGINE_INCOMPATIBLE',
        `The version ${versionId} targets engine ${stored.engineVersion}, not ${sources.engineVersion}`,
        'profile.engineVersion',
      ),
      profileId,
      versionId,
    );
  }

  let existing;
  try {
    existing = await repository.getActivation(profileId);
  } catch (error: unknown) {
    return activationRejected(
      rejection(
        'IMPORT_STORE_REJECTED',
        error instanceof Error ? error.message : 'The activation cannot be read',
        'profileActivations',
      ),
      profileId,
      versionId,
    );
  }
  if (existing !== null && existing.versionId === versionId) {
    return activationAccepted('ALREADY_ACTIVE', {
      profileId,
      versionId,
      sequence: existing.sequence,
      activatedAt: existing.activatedAt,
      barrierId: null,
      activationCommandId: null,
      activateAtTick: null,
      learningEpoch: barrier.current().learningEpoch,
      duplicate: false,
    });
  }

  let requested;
  try {
    requested = barrier.requestChange({
      reason: 'IMPORT',
      targetProfileId: profileId,
      targetVersionId: versionId,
      importValid: true,
    });
  } catch (error: unknown) {
    return activationRejected(
      rejection(
        'IMPORT_BARRIER_REJECTED',
        error instanceof Error ? error.message : 'The 205 barrier refused the change',
        'barrier',
      ),
      profileId,
      versionId,
    );
  }

  let barrierRecord: ProfileImportBarrierRecord | null = null;
  let sameTarget = false;
  if (requested.status === 'REJECTED') {
    if (requested.code === 'SAME_TARGET') {
      sameTarget = true;
    } else {
      return activationRejected(
        rejection(
          mapBarrierCode(requested.code),
          requested.detail ?? `The 205 barrier refused the change: ${String(requested.code)}`,
          'barrier',
        ),
        profileId,
        versionId,
      );
    }
  } else {
    barrierRecord = requested.barrier;
  }

  if (!sameTarget) {
    let resolved;
    try {
      resolved = barrier.resolve();
    } catch (error: unknown) {
      return activationRejected(
        rejection(
          'IMPORT_BARRIER_REJECTED',
          error instanceof Error ? error.message : 'The 205 barrier failed to resolve',
          'barrier',
        ),
        profileId,
        versionId,
      );
    }
    if (resolved.status === 'TICK_NOT_REACHED') {
      return activationAccepted('PENDING', {
        profileId,
        versionId,
        sequence: null,
        activatedAt: null,
        barrierId: resolved.barrier?.barrierId ?? barrierRecord?.barrierId ?? null,
        activationCommandId: null,
        activateAtTick: resolved.barrier?.activationTick ?? null,
        learningEpoch: resolved.generation.learningEpoch,
        duplicate: false,
      });
    }
    if (resolved.status !== 'APPLIED') {
      return activationRejected(
        rejection(
          solvedBarrierCode(resolved.code),
          resolved.detail ?? `The 205 barrier did not apply: ${resolved.status}`,
          'barrier',
        ),
        profileId,
        versionId,
      );
    }
    barrierRecord = resolved.barrier;
    if (barrierRecord === null || barrierRecord.activationCommandId === null) {
      return activationRejected(
        rejection(
          'IMPORT_ACTIVATION_MISSING',
          'The 205 barrier committed without a published 110 activation',
          'barrier.activationCommandId',
        ),
        profileId,
        versionId,
      );
    }
  }

  const sequence = existing === null ? 1 : existing.sequence + 1;
  const activatedAt = sources.now();
  let written;
  try {
    written = await repository.commitProfileActivation({
      profile: stored,
      activation: {
        schemaVersion: 1,
        playerId: sources.playerId,
        profileId,
        versionId,
        sequence,
        activatedAt,
      },
    });
  } catch (error: unknown) {
    return activationRejected(
      rejection(
        'IMPORT_WRITE_FAILED',
        error instanceof Error ? error.message : 'The activation transaction failed',
        'profileActivations',
      ),
      profileId,
      versionId,
    );
  }
  if (written.status === 'REJECTED') {
    return activationRejected(mapPersistenceRejection(written.rejection), profileId, versionId);
  }

  return activationAccepted('ACTIVATED', {
    profileId,
    versionId,
    sequence,
    activatedAt,
    barrierId: barrierRecord?.barrierId ?? null,
    activationCommandId: barrierRecord?.activationCommandId ?? null,
    activateAtTick: barrierRecord?.activationTick ?? null,
    learningEpoch: barrier.current().learningEpoch,
    duplicate: barrierRecord?.activationDuplicate ?? false,
  });
}

function solvedBarrierCode(code: string | null): ProfileImportRejectionCode {
  if (code === 'ACTIVATION_PENDING') return 'IMPORT_BARRIER_REJECTED';
  return mapBarrierCode(code);
}
