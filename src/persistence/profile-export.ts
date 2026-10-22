import {
  computeProfileVersionChecksum,
  parameterDefinitions,
  reservedParameterKeys,
} from '../profiles';
import type { ParameterDefinition, ProfileVersion } from '../profiles';
import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  parseStrictJson,
  sha256Hex,
} from './canonical-json';
import type { StrictJsonRejection } from './canonical-json';
import { classifyProfileSource } from './profile-transaction';
import type { ProfileSourceKind } from './profile-transaction';
import type { LocalRepository } from './repository';

/**
 * Profile export for PBI 133.
 *
 * The export is a versioned JSON document with an explicit schema. It carries the profile
 * versions with their provenance, the effective parameter values with their units, the reserved
 * (R/`extension`) keys as an explicit `null` map, the aggregated evidence and a checksum computed
 * with the rules of [Docs/29-savefile-si-integritate.md](../Docs/29-savefile-si-integritate.md).
 *
 * Three rules drive the whole module:
 *
 * 1. **The raw telemetry never comes by itself.** The default document carries no raw event at
 *    all; only aggregates and references are exported. Raw events are published only when the
 *    caller asks for them explicitly, and the amount is capped by
 *    `PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents`. The repository path cannot publish raw
 *    telemetry at all: the repository exposes no telemetry reader.
 * 2. **The reserved keys stay reserved.** An R (`extension`) key is never given a value. The export
 *    lists every one of them with the value `null`, and both the builder and the validator refuse
 *    any attempt to set one.
 * 3. **The file is verifiable.** The envelope carries a `SHA-256` checksum over the canonical
 *    form of the document without the checksum field, and every version carries its 109 checksum,
 *    so a reader can recompute both and detect any modification.
 *
 * The import side is PBI 134: this module owns the format, the builder, the validator and the
 * reader that reconstructs the parameter values and the reserved keys.
 */

/** Contract id of this layer. */
export const PROFILE_EXPORT_VERSION = '133-profile-export-v1' as const;

/** Format marker stored in every exported document. */
export const PROFILE_EXPORT_FORMAT = 'self-driving-academy-profile-export' as const;

/** Version of the document format. A reader that does not know it refuses the file. */
export const PROFILE_EXPORT_FORMAT_VERSION = 1 as const;

/** Version of the document schema. */
export const PROFILE_EXPORT_SCHEMA_VERSION = 1 as const;

/**
 * Fixed budgets of the export.
 *
 * The raw telemetry cap is part of the contract: a caller cannot raise it, and a document that
 * declares another limit is refused.
 */
export const PROFILE_EXPORT_LIMITS = Object.freeze({
  /** Versions carried by one export. */
  maxVersions: 128,
  /** Parameters of one version (the 092 catalog has 80 keys). */
  maxParameters: 80,
  /** Reserved (R) keys listed with a `null` value. */
  maxReservedParameters: 80,
  /** Aggregated indicator rows. */
  maxIndicators: 64,
  /** Aggregated evidence rows. */
  maxEvidenceEntries: 80,
  /** Source segments of one evidence row. */
  maxEvidenceSegments: 64,
  /** Raw telemetry events, only when the inclusion is explicitly requested. */
  maxRawTelemetryEvents: 512,
  /** Referenced telemetry segments. */
  maxReferencedSegments: 64,
  /** Canonical UTF-16 code units of the whole document. */
  maxFileBytes: 1_048_576,
  /** Nesting depth accepted by the reader. */
  maxDepth: 24,
});

/** Closed vocabulary of the refusals. There is no open error channel. */
export const profileExportRejectionCodes = [
  'UNSUPPORTED_FORMAT',
  'UNSUPPORTED_FORMAT_VERSION',
  'UNSUPPORTED_SCHEMA',
  'UNSUPPORTED_UNITS',
  'INVALID_TIMESTAMP',
  'INVALID_IDENTITY',
  'INVALID_FIELD',
  'UNKNOWN_FIELD',
  'MISSING_FIELD',
  'INVALID_NUMBER',
  'NON_FINITE_VALUE',
  'UNKNOWN_PARAMETER',
  'RESERVED_KEY_SET',
  'RESERVED_KEY_MISSING',
  'RESERVED_KEY_INVALID',
  'UNIT_MISMATCH',
  'VALUE_OUT_OF_RANGE',
  'DUPLICATE_VERSION_ID',
  'REFERENCE_MISSING',
  'HISTORY_INCOMPLETE',
  'PROVENANCE_MISMATCH',
  'DELTA_INVALID',
  'PROFILE_CHECKSUM_MISMATCH',
  'CHECKSUM_MISMATCH',
  'UNSUPPORTED_ALGORITHM',
  'UNSUPPORTED_CANONICALIZATION',
  'AGGREGATE_MISMATCH',
  'AGGREGATE_LIMIT_EXCEEDED',
  'TELEMETRY_LIMIT_EXCEEDED',
  'TELEMETRY_STATE_MISMATCH',
  'FILE_TOO_LARGE',
  'DEPTH_EXCEEDED',
  'PARSE_ERROR',
  'DUPLICATE_KEY',
  'TRAILING_CONTENT',
  'UNSAFE_KEY',
  'CANONICALIZATION_FAILED',
] as const;
export type ProfileExportRejectionCode = (typeof profileExportRejectionCodes)[number];

export interface ProfileExportRejection {
  readonly code: ProfileExportRejectionCode;
  readonly message: string;
  readonly path: string;
}

/** One effective parameter: the value and the unit of the 092 catalog. */
export interface ProfileExportParameter {
  readonly value: number;
  readonly unit: string;
}

/** The 109 delta of a derived version, kept verbatim. */
export interface ProfileExportDelta {
  readonly baseVersionId: string;
  readonly validationVersion: string;
  readonly segmentId: string;
  readonly interventionId: string | null;
  readonly reason: string | null;
  readonly keyCount: number;
  readonly changes: readonly {
    readonly key: string;
    readonly unit: string;
    readonly previousValue: number;
    readonly newValue: number;
  }[];
}

/** The provenance of one exported version. */
export interface ProfileExportProvenance {
  readonly origin: 'BASE' | 'DERIVED';
  readonly sourceSegmentIds: readonly string[];
  readonly sourceInterventionIds: readonly string[];
  readonly delta: ProfileExportDelta | null;
}

/** One exported profile version. */
export interface ProfileExportVersion {
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly depth: number;
  readonly createdAt: string;
  readonly engineVersion: string;
  /** Classification derived from the stored provenance: BASE, LEARNING or MANUAL_TUNING. */
  readonly source: ProfileSourceKind;
  /** The 109 checksum of the version, recomputed by the reader. */
  readonly checksum: string;
  readonly parameters: Readonly<Record<string, ProfileExportParameter>>;
  readonly provenance: ProfileExportProvenance;
}

/** The activation pointer of the exported profile. */
export interface ProfileExportActivation {
  readonly playerId: string;
  readonly sequence: number;
  readonly activatedAt: string;
}

/** One aggregated indicator, in the shape of the 138 metric rows. */
export interface ProfileExportIndicator {
  readonly id: string;
  readonly unit: string;
  readonly state: 'AVAILABLE' | 'UNAVAILABLE';
  readonly value: number | null;
  readonly sampleSize: number | null;
  readonly reason: string | null;
}

/** One aggregated evidence row of a parameter. */
export interface ProfileExportEvidence {
  readonly key: string;
  readonly effectiveCount: number;
  readonly quality: number;
  readonly uncertainty: number;
  readonly sourceSegmentIds: readonly string[];
}

/** The counters recomputed by the reader from the profile section. */
export interface ProfileExportCounts {
  readonly versions: number;
  readonly baseVersions: number;
  readonly derivedVersions: number;
  readonly manualTuningVersions: number;
  readonly learningVersions: number;
  readonly parameters: number;
  readonly reservedParameters: number;
  readonly sourceSegments: number;
  readonly sourceInterventions: number;
}

/** The aggregated evidence of the export: counters, indicators and evidence rows. */
export interface ProfileExportAggregates {
  readonly schemaVersion: 1;
  readonly counts: ProfileExportCounts;
  readonly indicators: readonly ProfileExportIndicator[];
  readonly evidence: readonly ProfileExportEvidence[];
}

/** The telemetry section: references and, only when explicitly asked for, raw events. */
export interface ProfileExportTelemetry {
  readonly included: boolean;
  readonly rawEventCount: number;
  readonly rawEventLimit: number;
  readonly referencedSegmentIds: readonly string[];
  readonly rawEvents: readonly unknown[];
}

/** The envelope checksum, as defined by the savefile module. */
export interface ProfileExportChecksum {
  readonly algorithm: typeof CHECKSUM_ALGORITHM;
  readonly canonicalization: typeof CANONICALIZATION_VERSION;
  readonly value: string;
}

/** The exported profile section. */
export interface ProfileExportProfile {
  readonly profileId: string;
  readonly source: ProfileSourceKind | null;
  readonly activeVersionId: string | null;
  readonly activation: ProfileExportActivation | null;
  readonly versions: readonly ProfileExportVersion[];
  /** Every reserved (R) key of the catalog, each with the value `null`. */
  readonly reservedParameters: Readonly<Record<string, null>>;
}

/** The whole exported document. */
export interface ProfileExportDocument {
  readonly format: typeof PROFILE_EXPORT_FORMAT;
  readonly formatVersion: typeof PROFILE_EXPORT_FORMAT_VERSION;
  readonly schemaVersion: typeof PROFILE_EXPORT_SCHEMA_VERSION;
  readonly units: 'SI';
  readonly createdAt: string;
  readonly engineVersion: string;
  readonly profile: ProfileExportProfile;
  readonly aggregates: ProfileExportAggregates;
  readonly telemetry: ProfileExportTelemetry;
  readonly checksum: ProfileExportChecksum;
}

/* ------------------------------------------------------------------ inputs */

export interface ProfileExportBuildInput {
  readonly profileId: string;
  /** Engine of the export; it must match the engine of the active version. */
  readonly engineVersion: string;
  /** Creation time of the document (UTC ISO 8601). */
  readonly createdAt: string;
  /** The 109 versions of the profile. */
  readonly versions: readonly ProfileVersion[];
  readonly activeVersionId: string | null;
  readonly activation: ProfileExportActivation | null;
  /** Aggregated indicator rows, for example from the 137/138 snapshots. */
  readonly indicators?: readonly ProfileExportIndicator[];
  /** Aggregated evidence rows of the parameters. */
  readonly evidence?: readonly ProfileExportEvidence[];
  /**
   * Raw telemetry. It is published only when `include` is `true`; otherwise the events are
   * dropped and the document says so through `telemetry.included: false`.
   */
  readonly rawTelemetry?: {
    readonly include: boolean;
    readonly events?: readonly unknown[];
  };
}

export interface ProfileExportBuildAccepted {
  readonly status: 'ACCEPTED';
  readonly document: ProfileExportDocument;
  /** The checksum of the document, without the envelope field. */
  readonly checksum: string;
  /** Canonical size of the document in code units. */
  readonly bytes: number;
  /** True when raw telemetry was published. */
  readonly rawTelemetryIncluded: boolean;
  /** Number of raw events that were dropped because the inclusion was not requested. */
  readonly rawTelemetryOmitted: number;
  readonly rejection: null;
}

export interface ProfileExportBuildRejected {
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksum: null;
  readonly bytes: 0;
  readonly rawTelemetryIncluded: false;
  readonly rawTelemetryOmitted: 0;
  readonly rejection: ProfileExportRejection;
}

export type ProfileExportBuildResult = ProfileExportBuildAccepted | ProfileExportBuildRejected;

/* ------------------------------------------------------------- reading bits */

type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly rejection: ProfileExportRejection };

function rejected<T>(
  code: ProfileExportRejectionCode,
  message: string,
  path: string,
): ReadResult<T> {
  return { ok: false, rejection: { code, message, path } };
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function readTimestamp(value: unknown, path: string): ReadResult<string> {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) {
    return rejected('INVALID_TIMESTAMP', 'Expected a UTC ISO 8601 timestamp', path);
  }
  if (!Number.isFinite(Date.parse(value))) {
    return rejected('INVALID_TIMESTAMP', 'Expected a valid calendar timestamp', path);
  }
  return { ok: true, value };
}

function readIdentity(value: unknown, path: string): ReadResult<string> {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    value.trim() !== value
  ) {
    return rejected('INVALID_IDENTITY', 'Expected a bounded identity', path);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return rejected('INVALID_IDENTITY', 'Expected a bounded identity', path);
    }
  }
  return { ok: true, value };
}

function readInteger(value: unknown, path: string): ReadResult<number> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return rejected('INVALID_NUMBER', 'Expected a safe integer', path);
  }
  return { ok: true, value };
}

function readCount(value: unknown, path: string): ReadResult<number> {
  const integer = readInteger(value, path);
  if (!integer.ok) return integer;
  if (integer.value < 0) {
    return rejected('INVALID_NUMBER', 'Expected a nonnegative counter', path);
  }
  return integer;
}

function readFinite(value: unknown, path: string): ReadResult<number> {
  if (typeof value !== 'number') {
    return rejected('INVALID_NUMBER', 'Expected a number', path);
  }
  if (!Number.isFinite(value)) {
    return rejected('NON_FINITE_VALUE', 'Numbers must be finite', path);
  }
  return { ok: true, value };
}

function readPlainObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
  required: readonly string[],
): ReadResult<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return rejected('INVALID_FIELD', 'Expected a plain object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return rejected('INVALID_FIELD', 'Expected plain data, not a class instance', path);
  }
  const data = value as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      return rejected('UNKNOWN_FIELD', `Unknown field: ${key}`, `${path}.${key}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(data, key)) {
      return rejected('MISSING_FIELD', `Missing field: ${key}`, `${path}.${key}`);
    }
  }
  return { ok: true, value: data };
}

function readStringArray(
  value: unknown,
  path: string,
  maximum: number,
): ReadResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return rejected('INVALID_FIELD', 'Expected an array', path);
  }
  if (value.length > maximum) {
    return rejected('AGGREGATE_LIMIT_EXCEEDED', `At most ${maximum} entries are accepted`, path);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = readIdentity(value[index], `${path}[${index}]`);
    if (!entry.ok) return entry;
    if (seen.has(entry.value)) {
      return rejected('INVALID_FIELD', `Duplicate identity: ${entry.value}`, `${path}[${index}]`);
    }
    seen.add(entry.value);
    result.push(entry.value);
  }
  return { ok: true, value: Object.freeze(result) };
}

/* --------------------------------------------------------- parameter rules */

/** The 092 catalog, indexed by key. A key outside it is not a profile parameter. */
const definitionsByKey: ReadonlyMap<string, ParameterDefinition> = new Map(
  parameterDefinitions.map((definition) => [definition.key, definition]),
);

function definitionOf(key: string): ParameterDefinition | null {
  return definitionsByKey.get(key) ?? null;
}

/**
 * Reads the effective parameters of one version.
 *
 * A key outside the 092 catalog is refused instead of being dropped: an export that cannot be
 * reimported without losing a parameter is not an export. A reserved (R) key is refused as well:
 * the reserved keys are published separately, with a `null` value.
 */
function readParameters(
  value: unknown,
  path: string,
): ReadResult<Readonly<Record<string, ProfileExportParameter>>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return rejected('INVALID_FIELD', 'Expected a parameter map', path);
  }
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length > PROFILE_EXPORT_LIMITS.maxParameters) {
    return rejected(
      'AGGREGATE_LIMIT_EXCEEDED',
      `At most ${PROFILE_EXPORT_LIMITS.maxParameters} parameters are accepted`,
      path,
    );
  }
  const result: Record<string, ProfileExportParameter> = Object.create(null);
  for (const key of keys) {
    const definition = definitionOf(key);
    if (definition === null) {
      return rejected('UNKNOWN_PARAMETER', `Unknown parameter: ${key}`, `${path}.${key}`);
    }
    if (definition.implementationStage === 'extension') {
      return rejected(
        'RESERVED_KEY_SET',
        `The reserved parameter ${key} cannot carry a value`,
        `${path}.${key}`,
      );
    }
    const entry = readPlainObject(
      data[key],
      `${path}.${key}`,
      ['value', 'unit'],
      ['value', 'unit'],
    );
    if (!entry.ok) return entry;
    const amount = readFinite(entry.value.value, `${path}.${key}.value`);
    if (!amount.ok) return amount;
    if (entry.value.unit !== definition.unit) {
      return rejected(
        'UNIT_MISMATCH',
        `The parameter ${key} uses the unit ${String(entry.value.unit)}, not ${definition.unit}`,
        `${path}.${key}.unit`,
      );
    }
    if (amount.value < definition.min || amount.value > definition.max) {
      return rejected(
        'VALUE_OUT_OF_RANGE',
        `The parameter ${key} is outside [${definition.min}, ${definition.max}]`,
        `${path}.${key}.value`,
      );
    }
    result[key] = Object.freeze({ value: amount.value, unit: definition.unit });
  }
  return { ok: true, value: Object.freeze(result) };
}

/**
 * Reads the reserved key map.
 *
 * Every reserved key of the catalog must be present with the value `null`, and nothing else may
 * be in the map: a reserved key is never valued and a usable key is never reserved.
 */
function readReservedParameters(
  value: unknown,
  path: string,
): ReadResult<Readonly<Record<string, null>>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return rejected('INVALID_FIELD', 'Expected a reserved parameter map', path);
  }
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length > PROFILE_EXPORT_LIMITS.maxReservedParameters) {
    return rejected(
      'AGGREGATE_LIMIT_EXCEEDED',
      `At most ${PROFILE_EXPORT_LIMITS.maxReservedParameters} reserved keys are accepted`,
      path,
    );
  }
  const result: Record<string, null> = Object.create(null);
  for (const key of keys) {
    if (!reservedParameterKeys.includes(key)) {
      return rejected(
        'RESERVED_KEY_INVALID',
        `The parameter ${key} is not a reserved key`,
        `${path}.${key}`,
      );
    }
    if (data[key] !== null) {
      return rejected(
        'RESERVED_KEY_SET',
        `The reserved parameter ${key} must stay null`,
        `${path}.${key}`,
      );
    }
    result[key] = null;
  }
  for (const key of reservedParameterKeys) {
    if (!Object.hasOwn(result, key)) {
      return rejected(
        'RESERVED_KEY_MISSING',
        `The reserved parameter ${key} is missing`,
        `${path}.${key}`,
      );
    }
  }
  return { ok: true, value: Object.freeze(result) };
}

/* --------------------------------------------------------- version reading */

function readDelta(value: unknown, path: string): ReadResult<ProfileExportDelta | null> {
  if (value === null) return { ok: true, value: null };
  const entry = readPlainObject(
    value,
    path,
    [
      'baseVersionId',
      'validationVersion',
      'segmentId',
      'interventionId',
      'reason',
      'keyCount',
      'changes',
    ],
    ['baseVersionId', 'validationVersion', 'segmentId', 'keyCount', 'changes'],
  );
  if (!entry.ok) return entry;
  const data = entry.value;
  const baseVersionId = readIdentity(data.baseVersionId, `${path}.baseVersionId`);
  if (!baseVersionId.ok) return baseVersionId;
  const validationVersion = readIdentity(data.validationVersion, `${path}.validationVersion`);
  if (!validationVersion.ok) return validationVersion;
  const segmentId = readIdentity(data.segmentId, `${path}.segmentId`);
  if (!segmentId.ok) return segmentId;
  let interventionId: string | null = null;
  if (data.interventionId !== null && data.interventionId !== undefined) {
    const read = readIdentity(data.interventionId, `${path}.interventionId`);
    if (!read.ok) return read;
    interventionId = read.value;
  }
  let reason: string | null = null;
  if (data.reason !== null && data.reason !== undefined) {
    if (typeof data.reason !== 'string' || data.reason.length === 0) {
      return rejected('INVALID_FIELD', 'Expected a reason text', `${path}.reason`);
    }
    reason = data.reason;
  }
  const keyCount = readCount(data.keyCount, `${path}.keyCount`);
  if (!keyCount.ok) return keyCount;
  if (!Array.isArray(data.changes)) {
    return rejected('INVALID_FIELD', 'Expected the delta changes', `${path}.changes`);
  }
  if (data.changes.length !== keyCount.value) {
    return rejected(
      'DELTA_INVALID',
      'The delta key count does not match its changes',
      `${path}.keyCount`,
    );
  }
  const changes: {
    key: string;
    unit: string;
    previousValue: number;
    newValue: number;
  }[] = [];
  for (let index = 0; index < data.changes.length; index += 1) {
    const changePath = `${path}.changes[${index}]`;
    const change = readPlainObject(
      data.changes[index],
      changePath,
      ['key', 'unit', 'previousValue', 'newValue'],
      ['key', 'unit', 'previousValue', 'newValue'],
    );
    if (!change.ok) return change;
    const key = readIdentity(change.value.key, `${changePath}.key`);
    if (!key.ok) return key;
    const unit = readIdentity(change.value.unit, `${changePath}.unit`);
    if (!unit.ok) return unit;
    const previousValue = readFinite(change.value.previousValue, `${changePath}.previousValue`);
    if (!previousValue.ok) return previousValue;
    const newValue = readFinite(change.value.newValue, `${changePath}.newValue`);
    if (!newValue.ok) return newValue;
    changes.push({
      key: key.value,
      unit: unit.value,
      previousValue: previousValue.value,
      newValue: newValue.value,
    });
  }
  return {
    ok: true,
    value: Object.freeze({
      baseVersionId: baseVersionId.value,
      validationVersion: validationVersion.value,
      segmentId: segmentId.value,
      interventionId,
      reason,
      keyCount: keyCount.value,
      changes: Object.freeze(changes),
    }),
  };
}

function readProvenance(value: unknown, path: string): ReadResult<ProfileExportProvenance> {
  const entry = readPlainObject(
    value,
    path,
    ['origin', 'sourceSegmentIds', 'sourceInterventionIds', 'delta'],
    ['origin', 'sourceSegmentIds', 'sourceInterventionIds', 'delta'],
  );
  if (!entry.ok) return entry;
  const data = entry.value;
  if (data.origin !== 'BASE' && data.origin !== 'DERIVED') {
    return rejected('INVALID_FIELD', 'Expected the origin BASE or DERIVED', `${path}.origin`);
  }
  const segmentIds = readStringArray(
    data.sourceSegmentIds,
    `${path}.sourceSegmentIds`,
    PROFILE_EXPORT_LIMITS.maxReferencedSegments,
  );
  if (!segmentIds.ok) return segmentIds;
  const interventionIds = readStringArray(
    data.sourceInterventionIds,
    `${path}.sourceInterventionIds`,
    PROFILE_EXPORT_LIMITS.maxReferencedSegments,
  );
  if (!interventionIds.ok) return interventionIds;
  const delta = readDelta(data.delta, `${path}.delta`);
  if (!delta.ok) return delta;
  if (data.origin === 'BASE' && delta.value !== null) {
    return rejected('DELTA_INVALID', 'A base version has no delta', `${path}.delta`);
  }
  if (data.origin === 'DERIVED' && delta.value === null) {
    return rejected('DELTA_INVALID', 'A derived version needs its delta', `${path}.delta`);
  }
  return {
    ok: true,
    value: Object.freeze({
      origin: data.origin,
      sourceSegmentIds: segmentIds.value,
      sourceInterventionIds: interventionIds.value,
      delta: delta.value,
    }),
  };
}

function readVersion(value: unknown, path: string): ReadResult<ProfileExportVersion> {
  const entry = readPlainObject(
    value,
    path,
    [
      'versionId',
      'parentVersionId',
      'depth',
      'createdAt',
      'engineVersion',
      'source',
      'checksum',
      'parameters',
      'provenance',
    ],
    [
      'versionId',
      'parentVersionId',
      'depth',
      'createdAt',
      'engineVersion',
      'source',
      'checksum',
      'parameters',
      'provenance',
    ],
  );
  if (!entry.ok) return entry;
  const data = entry.value;
  const versionId = readIdentity(data.versionId, `${path}.versionId`);
  if (!versionId.ok) return versionId;
  let parentVersionId: string | null = null;
  if (data.parentVersionId !== null && data.parentVersionId !== undefined) {
    const read = readIdentity(data.parentVersionId, `${path}.parentVersionId`);
    if (!read.ok) return read;
    parentVersionId = read.value;
  }
  const depth = readCount(data.depth, `${path}.depth`);
  if (!depth.ok) return depth;
  const createdAt = readTimestamp(data.createdAt, `${path}.createdAt`);
  if (!createdAt.ok) return createdAt;
  const engineVersion = readIdentity(data.engineVersion, `${path}.engineVersion`);
  if (!engineVersion.ok) return engineVersion;
  if (data.source !== 'BASE' && data.source !== 'LEARNING' && data.source !== 'MANUAL_TUNING') {
    return rejected(
      'INVALID_FIELD',
      'Expected the source BASE, LEARNING or MANUAL_TUNING',
      `${path}.source`,
    );
  }
  const checksum = readIdentity(data.checksum, `${path}.checksum`);
  if (!checksum.ok) return checksum;
  const parameters = readParameters(data.parameters, `${path}.parameters`);
  if (!parameters.ok) return parameters;
  const provenance = readProvenance(data.provenance, `${path}.provenance`);
  if (!provenance.ok) return provenance;
  return {
    ok: true,
    value: Object.freeze({
      versionId: versionId.value,
      parentVersionId,
      depth: depth.value,
      createdAt: createdAt.value,
      engineVersion: engineVersion.value,
      source: data.source,
      checksum: checksum.value,
      parameters: parameters.value,
      provenance: provenance.value,
    }),
  };
}

/* -------------------------------------------------------- aggregate reading */

function readIndicator(value: unknown, path: string): ReadResult<ProfileExportIndicator> {
  const entry = readPlainObject(
    value,
    path,
    ['id', 'unit', 'state', 'value', 'sampleSize', 'reason'],
    ['id', 'unit', 'state', 'value', 'sampleSize', 'reason'],
  );
  if (!entry.ok) return entry;
  const data = entry.value;
  const id = readIdentity(data.id, `${path}.id`);
  if (!id.ok) return id;
  const unit = readIdentity(data.unit, `${path}.unit`);
  if (!unit.ok) return unit;
  if (data.state !== 'AVAILABLE' && data.state !== 'UNAVAILABLE') {
    return rejected(
      'INVALID_FIELD',
      'Expected the state AVAILABLE or UNAVAILABLE',
      `${path}.state`,
    );
  }
  let amount: number | null = null;
  if (data.value !== null && data.value !== undefined) {
    const read = readFinite(data.value, `${path}.value`);
    if (!read.ok) return read;
    amount = read.value;
  }
  let sampleSize: number | null = null;
  if (data.sampleSize !== null && data.sampleSize !== undefined) {
    const read = readCount(data.sampleSize, `${path}.sampleSize`);
    if (!read.ok) return read;
    sampleSize = read.value;
  }
  let reason: string | null = null;
  if (data.reason !== null && data.reason !== undefined) {
    if (typeof data.reason !== 'string' || data.reason.length === 0) {
      return rejected('INVALID_FIELD', 'Expected a closed reason text', `${path}.reason`);
    }
    reason = data.reason;
  }
  if (data.state === 'AVAILABLE') {
    if (amount === null) {
      return rejected('INVALID_FIELD', 'An available indicator needs a value', `${path}.value`);
    }
    if (sampleSize === null) {
      return rejected(
        'INVALID_FIELD',
        'An available indicator needs a sample size',
        `${path}.sampleSize`,
      );
    }
    if (reason !== null) {
      return rejected('INVALID_FIELD', 'An available indicator has no reason', `${path}.reason`);
    }
  } else {
    if (amount !== null) {
      return rejected('INVALID_FIELD', 'An unavailable indicator has no value', `${path}.value`);
    }
    if (sampleSize !== null) {
      return rejected(
        'INVALID_FIELD',
        'An unavailable indicator has no sample size',
        `${path}.sampleSize`,
      );
    }
    if (reason === null) {
      return rejected('INVALID_FIELD', 'An unavailable indicator needs a reason', `${path}.reason`);
    }
  }
  return {
    ok: true,
    value: Object.freeze({
      id: id.value,
      unit: unit.value,
      state: data.state,
      value: amount,
      sampleSize,
      reason,
    }),
  };
}

function readIndicators(
  value: unknown,
  path: string,
): ReadResult<readonly ProfileExportIndicator[]> {
  if (!Array.isArray(value)) {
    return rejected('INVALID_FIELD', 'Expected an indicator array', path);
  }
  if (value.length > PROFILE_EXPORT_LIMITS.maxIndicators) {
    return rejected(
      'AGGREGATE_LIMIT_EXCEEDED',
      `At most ${PROFILE_EXPORT_LIMITS.maxIndicators} indicators are accepted`,
      path,
    );
  }
  const result: ProfileExportIndicator[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const indicator = readIndicator(value[index], `${path}[${index}]`);
    if (!indicator.ok) return indicator;
    result.push(indicator.value);
  }
  return { ok: true, value: Object.freeze(result) };
}

function readEvidence(value: unknown, path: string): ReadResult<readonly ProfileExportEvidence[]> {
  if (!Array.isArray(value)) {
    return rejected('INVALID_FIELD', 'Expected an evidence array', path);
  }
  if (value.length > PROFILE_EXPORT_LIMITS.maxEvidenceEntries) {
    return rejected(
      'AGGREGATE_LIMIT_EXCEEDED',
      `At most ${PROFILE_EXPORT_LIMITS.maxEvidenceEntries} evidence rows are accepted`,
      path,
    );
  }
  const result: ProfileExportEvidence[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const rowPath = `${path}[${index}]`;
    const entry = readPlainObject(
      value[index],
      rowPath,
      ['key', 'effectiveCount', 'quality', 'uncertainty', 'sourceSegmentIds'],
      ['key', 'effectiveCount', 'quality', 'uncertainty', 'sourceSegmentIds'],
    );
    if (!entry.ok) return entry;
    const data = entry.value;
    const key = readIdentity(data.key, `${rowPath}.key`);
    if (!key.ok) return key;
    const definition = definitionOf(key.value);
    if (definition === null) {
      return rejected('UNKNOWN_PARAMETER', `Unknown parameter: ${key.value}`, `${rowPath}.key`);
    }
    if (definition.implementationStage === 'extension') {
      return rejected(
        'RESERVED_KEY_SET',
        `The reserved parameter ${key.value} cannot carry evidence`,
        `${rowPath}.key`,
      );
    }
    if (seen.has(key.value)) {
      return rejected('INVALID_FIELD', `Duplicate evidence row: ${key.value}`, `${rowPath}.key`);
    }
    seen.add(key.value);
    const effectiveCount = readCount(data.effectiveCount, `${rowPath}.effectiveCount`);
    if (!effectiveCount.ok) return effectiveCount;
    const quality = readFinite(data.quality, `${rowPath}.quality`);
    if (!quality.ok) return quality;
    if (quality.value < 0 || quality.value > 1) {
      return rejected('VALUE_OUT_OF_RANGE', 'The quality is outside [0, 1]', `${rowPath}.quality`);
    }
    const uncertainty = readFinite(data.uncertainty, `${rowPath}.uncertainty`);
    if (!uncertainty.ok) return uncertainty;
    if (uncertainty.value < 0) {
      return rejected(
        'VALUE_OUT_OF_RANGE',
        'The uncertainty is negative',
        `${rowPath}.uncertainty`,
      );
    }
    const segmentIds = readStringArray(
      data.sourceSegmentIds,
      `${rowPath}.sourceSegmentIds`,
      PROFILE_EXPORT_LIMITS.maxEvidenceSegments,
    );
    if (!segmentIds.ok) return segmentIds;
    if (effectiveCount.value > 0 && segmentIds.value.length === 0) {
      return rejected(
        'INVALID_FIELD',
        'Observed evidence needs source segments',
        `${rowPath}.sourceSegmentIds`,
      );
    }
    result.push(
      Object.freeze({
        key: key.value,
        effectiveCount: effectiveCount.value,
        quality: quality.value,
        uncertainty: uncertainty.value,
        sourceSegmentIds: segmentIds.value,
      }),
    );
  }
  return { ok: true, value: Object.freeze(result) };
}

function readTelemetry(value: unknown, path: string): ReadResult<ProfileExportTelemetry> {
  const entry = readPlainObject(
    value,
    path,
    ['included', 'rawEventCount', 'rawEventLimit', 'referencedSegmentIds', 'rawEvents'],
    ['included', 'rawEventCount', 'rawEventLimit', 'referencedSegmentIds', 'rawEvents'],
  );
  if (!entry.ok) return entry;
  const data = entry.value;
  if (typeof data.included !== 'boolean') {
    return rejected('INVALID_FIELD', 'Expected a boolean inclusion flag', `${path}.included`);
  }
  const rawEventCount = readCount(data.rawEventCount, `${path}.rawEventCount`);
  if (!rawEventCount.ok) return rawEventCount;
  const rawEventLimit = readCount(data.rawEventLimit, `${path}.rawEventLimit`);
  if (!rawEventLimit.ok) return rawEventLimit;
  if (rawEventLimit.value !== PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents) {
    return rejected(
      'TELEMETRY_LIMIT_EXCEEDED',
      `The raw telemetry limit is fixed at ${PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents}`,
      `${path}.rawEventLimit`,
    );
  }
  const referencedSegmentIds = readStringArray(
    data.referencedSegmentIds,
    `${path}.referencedSegmentIds`,
    PROFILE_EXPORT_LIMITS.maxReferencedSegments,
  );
  if (!referencedSegmentIds.ok) return referencedSegmentIds;
  if (!Array.isArray(data.rawEvents)) {
    return rejected('INVALID_FIELD', 'Expected a raw event array', `${path}.rawEvents`);
  }
  if (data.rawEvents.length > PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents) {
    return rejected(
      'TELEMETRY_LIMIT_EXCEEDED',
      `At most ${PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents} raw events are accepted`,
      `${path}.rawEvents`,
    );
  }
  if (data.rawEvents.length !== rawEventCount.value) {
    return rejected(
      'TELEMETRY_STATE_MISMATCH',
      'The raw event count does not match the published events',
      `${path}.rawEventCount`,
    );
  }
  if (!data.included && data.rawEvents.length > 0) {
    return rejected(
      'TELEMETRY_STATE_MISMATCH',
      'A document without raw telemetry cannot publish raw events',
      `${path}.rawEvents`,
    );
  }
  const rawEvents: unknown[] = [];
  for (let index = 0; index < data.rawEvents.length; index += 1) {
    const canonical = canonicalizeJson(data.rawEvents[index], {
      maxDepth: PROFILE_EXPORT_LIMITS.maxDepth,
    });
    if (canonical.status === 'REJECTED') {
      return rejected(
        canonical.rejection.code === 'UNSAFE_KEY' ? 'UNSAFE_KEY' : 'CANONICALIZATION_FAILED',
        `The raw event is not plain JSON: ${canonical.rejection.message}`,
        `${path}.rawEvents[${index}]`,
      );
    }
    rawEvents.push(data.rawEvents[index]);
  }
  return {
    ok: true,
    value: Object.freeze({
      included: data.included,
      rawEventCount: rawEventCount.value,
      rawEventLimit: rawEventLimit.value,
      referencedSegmentIds: referencedSegmentIds.value,
      rawEvents: Object.freeze(rawEvents),
    }),
  };
}

/* -------------------------------------------------------------- the checksum */

/** The document without its envelope checksum, in canonical form. */
function checksumPayload(document: Omit<ProfileExportDocument, 'checksum'>): unknown {
  return {
    format: document.format,
    formatVersion: document.formatVersion,
    schemaVersion: document.schemaVersion,
    units: document.units,
    createdAt: document.createdAt,
    engineVersion: document.engineVersion,
    profile: document.profile,
    aggregates: document.aggregates,
    telemetry: document.telemetry,
  };
}

/**
 * The `SHA-256` checksum of a document, computed over the canonical form of the document without
 * the checksum field. The same function is used by the builder and by the reader.
 */
export function computeProfileExportChecksum(
  document: Omit<ProfileExportDocument, 'checksum'> | ProfileExportDocument,
): string {
  const payload = checksumPayload(document as Omit<ProfileExportDocument, 'checksum'>);
  const canonical = canonicalizeJson(payload, { maxDepth: PROFILE_EXPORT_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    throw new Error(`The document cannot be canonicalized: ${canonical.rejection.message}`);
  }
  return sha256Hex(canonical.text);
}

/** Returns a copy of the document with a recomputed checksum. */
export function stampProfileExportChecksum(
  document: Omit<ProfileExportDocument, 'checksum'> | ProfileExportDocument,
): ProfileExportDocument {
  const payload = document as Omit<ProfileExportDocument, 'checksum'>;
  const value = computeProfileExportChecksum(payload);
  return Object.freeze({
    ...payload,
    checksum: Object.freeze({
      algorithm: CHECKSUM_ALGORITHM,
      canonicalization: CANONICALIZATION_VERSION,
      value,
    }),
  });
}

/* ----------------------------------------------------------------- builder */

function compareVersions(left: ProfileVersion, right: ProfileVersion): number {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
  if (left.versionId === right.versionId) return 0;
  return left.versionId < right.versionId ? -1 : 1;
}

function buildRejected(rejection: ProfileExportRejection): ProfileExportBuildRejected {
  return Object.freeze({
    status: 'REJECTED' as const,
    document: null,
    checksum: null,
    bytes: 0,
    rawTelemetryIncluded: false,
    rawTelemetryOmitted: 0,
    rejection: Object.freeze(rejection),
  });
}

/**
 * Builds an export document.
 *
 * The result is explicit: either an accepted document with its checksum and size, or a refusal
 * with a closed reason. Nothing is written anywhere; the caller decides what to do with the
 * document.
 */
export function buildProfileExport(input: ProfileExportBuildInput): ProfileExportBuildResult {
  const profileId = readIdentity(input.profileId, 'profileId');
  if (!profileId.ok) return buildRejected(profileId.rejection);
  const engineVersion = readIdentity(input.engineVersion, 'engineVersion');
  if (!engineVersion.ok) return buildRejected(engineVersion.rejection);
  const createdAt = readTimestamp(input.createdAt, 'createdAt');
  if (!createdAt.ok) return buildRejected(createdAt.rejection);

  const versionsInput: readonly ProfileVersion[] = input.versions;
  const rawVersions: unknown = versionsInput;
  if (!Array.isArray(rawVersions) || rawVersions.length === 0) {
    return buildRejected({
      code: 'INVALID_FIELD',
      message: 'A profile export needs at least one version',
      path: 'versions',
    });
  }
  if (versionsInput.length > PROFILE_EXPORT_LIMITS.maxVersions) {
    return buildRejected({
      code: 'AGGREGATE_LIMIT_EXCEEDED',
      message: `At most ${PROFILE_EXPORT_LIMITS.maxVersions} versions are accepted`,
      path: 'versions',
    });
  }

  const ordered = [...versionsInput].sort(compareVersions);
  const exported: ProfileExportVersion[] = [];
  const byId = new Map<string, ProfileExportVersion>();
  for (let index = 0; index < ordered.length; index += 1) {
    const version = ordered[index];
    const path = `versions[${index}]`;
    if (byId.has(version.versionId)) {
      return buildRejected({
        code: 'DUPLICATE_VERSION_ID',
        message: `Duplicate version: ${version.versionId}`,
        path: `${path}.versionId`,
      });
    }
    const parameters: Record<string, ProfileExportParameter> = Object.create(null);
    for (const key of Object.keys(version.parameters)) {
      const definition = definitionOf(key);
      if (definition === null) {
        return buildRejected({
          code: 'UNKNOWN_PARAMETER',
          message: `Unknown parameter: ${key}`,
          path: `${path}.parameters.${key}`,
        });
      }
      if (definition.implementationStage === 'extension') {
        return buildRejected({
          code: 'RESERVED_KEY_SET',
          message: `The reserved parameter ${key} cannot carry a value`,
          path: `${path}.parameters.${key}`,
        });
      }
      const value = version.parameters[key];
      if (!Number.isFinite(value)) {
        return buildRejected({
          code: 'NON_FINITE_VALUE',
          message: 'Numbers must be finite',
          path: `${path}.parameters.${key}`,
        });
      }
      if (value < definition.min || value > definition.max) {
        return buildRejected({
          code: 'VALUE_OUT_OF_RANGE',
          message: `The parameter ${key} is outside [${definition.min}, ${definition.max}]`,
          path: `${path}.parameters.${key}`,
        });
      }
      parameters[key] = Object.freeze({ value, unit: definition.unit });
    }
    const delta = version.provenance.delta;
    const exportedVersion: ProfileExportVersion = Object.freeze({
      versionId: version.versionId,
      parentVersionId: version.parentVersionId,
      depth: version.depth,
      createdAt: version.createdAt,
      engineVersion: version.engineVersion,
      source: classifyProfileSource(version),
      checksum: version.checksum,
      parameters: Object.freeze(parameters),
      provenance: Object.freeze({
        origin: version.provenance.origin,
        sourceSegmentIds: Object.freeze([...version.provenance.sourceSegmentIds]),
        sourceInterventionIds: Object.freeze([...version.provenance.sourceInterventionIds]),
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
                changes: Object.freeze(
                  delta.changes.map((change) =>
                    Object.freeze({
                      key: change.key,
                      unit: change.unit,
                      previousValue: change.previousValue,
                      newValue: change.newValue,
                    }),
                  ),
                ),
              }),
      }),
    });
    exported.push(exportedVersion);
    byId.set(version.versionId, exportedVersion);
  }

  // The chain must be complete: a hole in the history cannot be reimported.
  for (const version of exported) {
    if (version.depth === 0) {
      if (version.parentVersionId !== null) {
        return buildRejected({
          code: 'HISTORY_INCOMPLETE',
          message: 'A base version has no parent',
          path: `versions.${version.versionId}.parentVersionId`,
        });
      }
      continue;
    }
    if (version.parentVersionId === null) {
      return buildRejected({
        code: 'HISTORY_INCOMPLETE',
        message: `The version ${version.versionId} needs its parent`,
        path: `versions.${version.versionId}.parentVersionId`,
      });
    }
    const parent = byId.get(version.parentVersionId);
    if (parent === undefined) {
      return buildRejected({
        code: 'HISTORY_INCOMPLETE',
        message: `The parent ${version.parentVersionId} of ${version.versionId} is missing`,
        path: `versions.${version.versionId}.parentVersionId`,
      });
    }
    if (parent.depth + 1 !== version.depth) {
      return buildRejected({
        code: 'HISTORY_INCOMPLETE',
        message: `The depth of ${version.versionId} does not follow its parent`,
        path: `versions.${version.versionId}.depth`,
      });
    }
  }

  let activeVersionId: string | null = null;
  if (input.activeVersionId !== null && input.activeVersionId !== undefined) {
    const active = byId.get(input.activeVersionId);
    if (active === undefined) {
      return buildRejected({
        code: 'REFERENCE_MISSING',
        message: `The active version ${input.activeVersionId} is not exported`,
        path: 'activeVersionId',
      });
    }
    activeVersionId = active.versionId;
    if (active.engineVersion !== engineVersion.value) {
      return buildRejected({
        code: 'INVALID_FIELD',
        message: 'The export engine version does not match the active version',
        path: 'engineVersion',
      });
    }
  }

  const reservedParameters: Record<string, null> = Object.create(null);
  for (const key of reservedParameterKeys) reservedParameters[key] = null;

  const indicators = readIndicators(input.indicators ?? [], 'aggregates.indicators');
  if (!indicators.ok) return buildRejected(indicators.rejection);
  const evidence = readEvidence(input.evidence ?? [], 'aggregates.evidence');
  if (!evidence.ok) return buildRejected(evidence.rejection);

  const segmentIds = new Set<string>();
  const interventionIds = new Set<string>();
  let baseVersions = 0;
  let manualTuningVersions = 0;
  let learningVersions = 0;
  for (const version of exported) {
    for (const id of version.provenance.sourceSegmentIds) segmentIds.add(id);
    for (const id of version.provenance.sourceInterventionIds) interventionIds.add(id);
    if (version.source === 'BASE') baseVersions += 1;
    else if (version.source === 'MANUAL_TUNING') manualTuningVersions += 1;
    else learningVersions += 1;
  }
  const activeVersion = activeVersionId === null ? null : (byId.get(activeVersionId) ?? null);
  const counts: ProfileExportCounts = Object.freeze({
    versions: exported.length,
    baseVersions,
    derivedVersions: exported.length - baseVersions,
    manualTuningVersions,
    learningVersions,
    parameters: activeVersion === null ? 0 : Object.keys(activeVersion.parameters).length,
    reservedParameters: reservedParameterKeys.length,
    sourceSegments: segmentIds.size,
    sourceInterventions: interventionIds.size,
  });

  const requested = input.rawTelemetry;
  const events = requested?.events ?? [];
  let rawEvents: readonly unknown[] = Object.freeze([]);
  let included = false;
  if (requested?.include === true) {
    if (events.length > PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents) {
      return buildRejected({
        code: 'TELEMETRY_LIMIT_EXCEEDED',
        message: `At most ${PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents} raw events are accepted`,
        path: 'rawTelemetry.events',
      });
    }
    for (let index = 0; index < events.length; index += 1) {
      const canonical = canonicalizeJson(events[index], {
        maxDepth: PROFILE_EXPORT_LIMITS.maxDepth,
      });
      if (canonical.status === 'REJECTED') {
        return buildRejected({
          code:
            canonical.rejection.code === 'UNSAFE_KEY' ? 'UNSAFE_KEY' : 'CANONICALIZATION_FAILED',
          message: `The raw event is not plain JSON: ${canonical.rejection.message}`,
          path: `rawTelemetry.events[${index}]`,
        });
      }
    }
    rawEvents = Object.freeze([...events]);
    included = true;
  }

  const telemetry: ProfileExportTelemetry = Object.freeze({
    included,
    rawEventCount: rawEvents.length,
    rawEventLimit: PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents,
    referencedSegmentIds: Object.freeze([...segmentIds].sort()),
    rawEvents,
  });

  let activation: ProfileExportActivation | null = null;
  if (input.activation !== null && input.activation !== undefined) {
    const playerId = readIdentity(input.activation.playerId, 'activation.playerId');
    if (!playerId.ok) return buildRejected(playerId.rejection);
    const sequence = readCount(input.activation.sequence, 'activation.sequence');
    if (!sequence.ok) return buildRejected(sequence.rejection);
    const activatedAt = readTimestamp(input.activation.activatedAt, 'activation.activatedAt');
    if (!activatedAt.ok) return buildRejected(activatedAt.rejection);
    activation = Object.freeze({
      playerId: playerId.value,
      sequence: sequence.value,
      activatedAt: activatedAt.value,
    });
  }

  const payload: Omit<ProfileExportDocument, 'checksum'> = Object.freeze({
    format: PROFILE_EXPORT_FORMAT,
    formatVersion: PROFILE_EXPORT_FORMAT_VERSION,
    schemaVersion: PROFILE_EXPORT_SCHEMA_VERSION,
    units: 'SI',
    createdAt: createdAt.value,
    engineVersion: engineVersion.value,
    profile: Object.freeze({
      profileId: profileId.value,
      source: activeVersion === null ? null : activeVersion.source,
      activeVersionId,
      activation,
      versions: Object.freeze(exported),
      reservedParameters: Object.freeze(reservedParameters),
    }),
    aggregates: Object.freeze({
      schemaVersion: 1,
      counts,
      indicators: indicators.value,
      evidence: evidence.value,
    }),
    telemetry,
  });

  const document = stampProfileExportChecksum(payload);
  const canonical = canonicalizeJson(document, { maxDepth: PROFILE_EXPORT_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    return buildRejected({
      code: 'CANONICALIZATION_FAILED',
      message: canonical.rejection.message,
      path: canonical.rejection.path,
    });
  }
  if (canonical.text.length > PROFILE_EXPORT_LIMITS.maxFileBytes) {
    return buildRejected({
      code: 'FILE_TOO_LARGE',
      message: `The document has ${canonical.text.length} code units, above the ${PROFILE_EXPORT_LIMITS.maxFileBytes} budget`,
      path: '$',
    });
  }
  return Object.freeze({
    status: 'ACCEPTED' as const,
    document,
    checksum: document.checksum.value,
    bytes: canonical.text.length,
    rawTelemetryIncluded: included,
    rawTelemetryOmitted: requested?.include === true ? 0 : events.length,
    rejection: null,
  });
}

/* ------------------------------------------------------------ the repository */

/** Options of the repository backed export. */
export interface ProfileExportRepositoryOptions {
  /** Creation time of the document; the caller owns it so the export stays deterministic. */
  readonly createdAt: string;
  /** Engine of the export; defaults to the engine of the active version. */
  readonly engineVersion?: string;
  /** Aggregated indicator rows, for example from the 137/138 snapshots. */
  readonly indicators?: readonly ProfileExportIndicator[];
  /** Aggregated evidence rows of the parameters. */
  readonly evidence?: readonly ProfileExportEvidence[];
}

/**
 * Builds an export from the local repository.
 *
 * The repository is the only source: the profile versions, the activation and the provenance are
 * read through the 127/128 ports, never from the database directly. The repository exposes no
 * telemetry reader, so this path cannot publish raw telemetry: the exported document always has
 * `telemetry.included: false`.
 */
export async function exportProfileFromRepository(
  repository: LocalRepository,
  profileId: string,
  options: ProfileExportRepositoryOptions,
): Promise<ProfileExportBuildResult> {
  const history = await repository.getProfileHistory(profileId);
  if (history.versions.length === 0) {
    return buildRejected({
      code: 'REFERENCE_MISSING',
      message: `The profile ${profileId} has no stored version`,
      path: 'profileId',
    });
  }
  if (!history.complete) {
    return buildRejected({
      code: 'HISTORY_INCOMPLETE',
      message: `The history of ${profileId} has a hole`,
      path: 'profile.missingVersionIds',
    });
  }
  const active = history.activeVersion;
  const engineVersion =
    options.engineVersion ?? active?.engineVersion ?? history.versions[0].engineVersion;
  const activationRow = await repository.getActivation(profileId);
  const resolvedActivation =
    activationRow === null
      ? null
      : {
          playerId: activationRow.playerId,
          sequence: activationRow.sequence,
          activatedAt: activationRow.activatedAt,
        };
  return buildProfileExport({
    profileId,
    engineVersion,
    createdAt: options.createdAt,
    versions: history.versions,
    activeVersionId: history.activeVersionId,
    activation: resolvedActivation,
    indicators: options.indicators ?? [],
    evidence: options.evidence ?? [],
  });
}

/* -------------------------------------------------------------- validation */

export interface ProfileExportValidationAccepted {
  readonly status: 'ACCEPTED';
  readonly document: ProfileExportDocument;
  readonly checksumVerified: true;
  /** The effective parameters of the active version. */
  readonly parameters: Readonly<Record<string, number>>;
  /** Every reserved key, with the value `null`. */
  readonly reservedParameters: Readonly<Record<string, null>>;
  /** The parameters of every exported version. */
  readonly versions: readonly {
    readonly versionId: string;
    readonly parentVersionId: string | null;
    readonly depth: number;
    readonly source: ProfileSourceKind;
    readonly createdAt: string;
    readonly engineVersion: string;
    readonly checksum: string;
    readonly parameters: Readonly<Record<string, number>>;
  }[];
  readonly rejection: null;
}

export interface ProfileExportValidationRejected {
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksumVerified: false;
  readonly parameters: null;
  readonly reservedParameters: null;
  readonly versions: null;
  readonly rejection: ProfileExportRejection;
}

export type ProfileExportValidationResult =
  ProfileExportValidationAccepted | ProfileExportValidationRejected;

function validationRejected(rejection: ProfileExportRejection): ProfileExportValidationRejected {
  return Object.freeze({
    status: 'REJECTED' as const,
    document: null,
    checksumVerified: false,
    parameters: null,
    reservedParameters: null,
    versions: null,
    rejection: Object.freeze(rejection),
  });
}

/**
 * Validates an exported document.
 *
 * The order follows the savefile module: the envelope and its checksum first, then the schema,
 * the references and the aggregates. A document that fails the checksum is refused before any
 * other rule, so a modified file is never interpreted.
 */
export function validateProfileExport(value: unknown): ProfileExportValidationResult {
  const envelope = readPlainObject(
    value,
    '$',
    [
      'format',
      'formatVersion',
      'schemaVersion',
      'units',
      'createdAt',
      'engineVersion',
      'profile',
      'aggregates',
      'telemetry',
      'checksum',
    ],
    [
      'format',
      'formatVersion',
      'schemaVersion',
      'units',
      'createdAt',
      'engineVersion',
      'profile',
      'aggregates',
      'telemetry',
      'checksum',
    ],
  );
  if (!envelope.ok) return validationRejected(envelope.rejection);
  const data = envelope.value;

  if (data.format !== PROFILE_EXPORT_FORMAT) {
    return validationRejected({
      code: 'UNSUPPORTED_FORMAT',
      message: `Unsupported export format: ${String(data.format)}`,
      path: 'format',
    });
  }
  if (data.formatVersion !== PROFILE_EXPORT_FORMAT_VERSION) {
    return validationRejected({
      code: 'UNSUPPORTED_FORMAT_VERSION',
      message: `Unsupported export format version: ${String(data.formatVersion)}`,
      path: 'formatVersion',
    });
  }
  if (data.schemaVersion !== PROFILE_EXPORT_SCHEMA_VERSION) {
    return validationRejected({
      code: 'UNSUPPORTED_SCHEMA',
      message: `Unsupported export schema version: ${String(data.schemaVersion)}`,
      path: 'schemaVersion',
    });
  }
  if (data.units !== 'SI') {
    return validationRejected({
      code: 'UNSUPPORTED_UNITS',
      message: 'The export uses SI units',
      path: 'units',
    });
  }

  const checksumEntry = readPlainObject(
    data.checksum,
    'checksum',
    ['algorithm', 'canonicalization', 'value'],
    ['algorithm', 'canonicalization', 'value'],
  );
  if (!checksumEntry.ok) return validationRejected(checksumEntry.rejection);
  if (checksumEntry.value.algorithm !== CHECKSUM_ALGORITHM) {
    return validationRejected({
      code: 'UNSUPPORTED_ALGORITHM',
      message: `Unsupported checksum algorithm: ${String(checksumEntry.value.algorithm)}`,
      path: 'checksum.algorithm',
    });
  }
  if (checksumEntry.value.canonicalization !== CANONICALIZATION_VERSION) {
    return validationRejected({
      code: 'UNSUPPORTED_CANONICALIZATION',
      message: `Unsupported canonicalization: ${String(checksumEntry.value.canonicalization)}`,
      path: 'checksum.canonicalization',
    });
  }
  const declared = checksumEntry.value.value;
  if (typeof declared !== 'string' || !/^[0-9a-f]{64}$/.test(declared)) {
    return validationRejected({
      code: 'INVALID_FIELD',
      message: 'The checksum must be 64 lowercase hexadecimal characters',
      path: 'checksum.value',
    });
  }

  const canonical = canonicalizeJson(
    checksumPayload(data as unknown as Omit<ProfileExportDocument, 'checksum'>),
    { maxDepth: PROFILE_EXPORT_LIMITS.maxDepth },
  );
  if (canonical.status === 'REJECTED') {
    return validationRejected({
      code: canonical.rejection.code === 'UNSAFE_KEY' ? 'UNSAFE_KEY' : 'CANONICALIZATION_FAILED',
      message: canonical.rejection.message,
      path: canonical.rejection.path,
    });
  }
  const computed = sha256Hex(canonical.text);
  if (computed !== declared) {
    return validationRejected({
      code: 'CHECKSUM_MISMATCH',
      message: 'The file was modified or is corrupt',
      path: 'checksum.value',
    });
  }

  const createdAt = readTimestamp(data.createdAt, 'createdAt');
  if (!createdAt.ok) return validationRejected(createdAt.rejection);
  const engineVersion = readIdentity(data.engineVersion, 'engineVersion');
  if (!engineVersion.ok) return validationRejected(engineVersion.rejection);

  const profileEntry = readPlainObject(
    data.profile,
    'profile',
    ['profileId', 'source', 'activeVersionId', 'activation', 'versions', 'reservedParameters'],
    ['profileId', 'source', 'activeVersionId', 'activation', 'versions', 'reservedParameters'],
  );
  if (!profileEntry.ok) return validationRejected(profileEntry.rejection);
  const profileData = profileEntry.value;
  const profileId = readIdentity(profileData.profileId, 'profile.profileId');
  if (!profileId.ok) return validationRejected(profileId.rejection);
  if (
    profileData.source !== null &&
    profileData.source !== 'BASE' &&
    profileData.source !== 'LEARNING' &&
    profileData.source !== 'MANUAL_TUNING'
  ) {
    return validationRejected({
      code: 'INVALID_FIELD',
      message: 'Expected the source BASE, LEARNING, MANUAL_TUNING or null',
      path: 'profile.source',
    });
  }
  if (!Array.isArray(profileData.versions) || profileData.versions.length === 0) {
    return validationRejected({
      code: 'INVALID_FIELD',
      message: 'A profile export needs at least one version',
      path: 'profile.versions',
    });
  }
  if (profileData.versions.length > PROFILE_EXPORT_LIMITS.maxVersions) {
    return validationRejected({
      code: 'AGGREGATE_LIMIT_EXCEEDED',
      message: `At most ${PROFILE_EXPORT_LIMITS.maxVersions} versions are accepted`,
      path: 'profile.versions',
    });
  }
  const versions: ProfileExportVersion[] = [];
  const byId = new Map<string, ProfileExportVersion>();
  for (let index = 0; index < profileData.versions.length; index += 1) {
    const version = readVersion(profileData.versions[index], `profile.versions[${index}]`);
    if (!version.ok) return validationRejected(version.rejection);
    if (byId.has(version.value.versionId)) {
      return validationRejected({
        code: 'DUPLICATE_VERSION_ID',
        message: `Duplicate version: ${version.value.versionId}`,
        path: `profile.versions[${index}].versionId`,
      });
    }
    byId.set(version.value.versionId, version.value);
    versions.push(version.value);
  }

  for (const version of versions) {
    if (version.depth === 0) {
      if (version.parentVersionId !== null) {
        return validationRejected({
          code: 'HISTORY_INCOMPLETE',
          message: 'A base version has no parent',
          path: `profile.versions.${version.versionId}.parentVersionId`,
        });
      }
    } else {
      if (version.parentVersionId === null) {
        return validationRejected({
          code: 'HISTORY_INCOMPLETE',
          message: `The version ${version.versionId} needs its parent`,
          path: `profile.versions.${version.versionId}.parentVersionId`,
        });
      }
      const parent = byId.get(version.parentVersionId);
      if (parent === undefined) {
        return validationRejected({
          code: 'HISTORY_INCOMPLETE',
          message: `The parent ${version.parentVersionId} of ${version.versionId} is missing`,
          path: `profile.versions.${version.versionId}.parentVersionId`,
        });
      }
      if (parent.depth + 1 !== version.depth) {
        return validationRejected({
          code: 'HISTORY_INCOMPLETE',
          message: `The depth of ${version.versionId} does not follow its parent`,
          path: `profile.versions.${version.versionId}.depth`,
        });
      }
      const delta = version.provenance.delta;
      if (delta !== null) {
        if (delta.baseVersionId !== version.parentVersionId) {
          return validationRejected({
            code: 'DELTA_INVALID',
            message: 'The delta base does not match the parent version',
            path: `profile.versions.${version.versionId}.provenance.delta.baseVersionId`,
          });
        }
        for (const change of delta.changes) {
          if (!Object.hasOwn(parent.parameters, change.key)) {
            return validationRejected({
              code: 'DELTA_INVALID',
              message: `The delta changes ${change.key}, which the parent does not carry`,
              path: `profile.versions.${version.versionId}.provenance.delta.changes`,
            });
          }
        }
      }
    }
    const expectedSource = expectedSourceOf(version);
    if (version.source !== expectedSource) {
      return validationRejected({
        code: 'PROVENANCE_MISMATCH',
        message: `The source of ${version.versionId} does not follow its provenance`,
        path: `profile.versions.${version.versionId}.source`,
      });
    }
    const checksum = versionChecksumOf(version, profileId.value);
    if (checksum !== version.checksum) {
      return validationRejected({
        code: 'PROFILE_CHECKSUM_MISMATCH',
        message: `The version ${version.versionId} does not match its 109 checksum`,
        path: `profile.versions.${version.versionId}.checksum`,
      });
    }
  }

  const reservedParameters = readReservedParameters(
    profileData.reservedParameters,
    'profile.reservedParameters',
  );
  if (!reservedParameters.ok) return validationRejected(reservedParameters.rejection);

  let activeVersionId: string | null = null;
  if (profileData.activeVersionId !== null && profileData.activeVersionId !== undefined) {
    const requested = profileData.activeVersionId;
    if (typeof requested !== 'string') {
      return validationRejected({
        code: 'INVALID_FIELD',
        message: 'The active version id must be a string',
        path: 'profile.activeVersionId',
      });
    }
    const active = byId.get(requested);
    if (active === undefined) {
      return validationRejected({
        code: 'REFERENCE_MISSING',
        message: `The active version ${requested} is not exported`,
        path: 'profile.activeVersionId',
      });
    }
    activeVersionId = active.versionId;
    if (active.engineVersion !== engineVersion.value) {
      return validationRejected({
        code: 'INVALID_FIELD',
        message: 'The export engine version does not match the active version',
        path: 'engineVersion',
      });
    }
  }

  let activation: ProfileExportActivation | null = null;
  if (profileData.activation !== null && profileData.activation !== undefined) {
    const entry = readPlainObject(
      profileData.activation,
      'profile.activation',
      ['playerId', 'sequence', 'activatedAt'],
      ['playerId', 'sequence', 'activatedAt'],
    );
    if (!entry.ok) return validationRejected(entry.rejection);
    const playerId = readIdentity(entry.value.playerId, 'profile.activation.playerId');
    if (!playerId.ok) return validationRejected(playerId.rejection);
    const sequence = readCount(entry.value.sequence, 'profile.activation.sequence');
    if (!sequence.ok) return validationRejected(sequence.rejection);
    const activatedAt = readTimestamp(entry.value.activatedAt, 'profile.activation.activatedAt');
    if (!activatedAt.ok) return validationRejected(activatedAt.rejection);
    activation = Object.freeze({
      playerId: playerId.value,
      sequence: sequence.value,
      activatedAt: activatedAt.value,
    });
  }

  const telemetry = readTelemetry(data.telemetry, 'telemetry');
  if (!telemetry.ok) return validationRejected(telemetry.rejection);

  const referencedSegments = new Set<string>();
  for (const version of versions) {
    for (const id of version.provenance.sourceSegmentIds) referencedSegments.add(id);
  }
  const expectedReferenced = [...referencedSegments].sort();
  if (telemetry.value.referencedSegmentIds.join(' ') !== expectedReferenced.join(' ')) {
    return validationRejected({
      code: 'AGGREGATE_MISMATCH',
      message: 'The referenced segments do not match the exported provenance',
      path: 'telemetry.referencedSegmentIds',
    });
  }

  const aggregatesEntry = readPlainObject(
    data.aggregates,
    'aggregates',
    ['schemaVersion', 'counts', 'indicators', 'evidence'],
    ['schemaVersion', 'counts', 'indicators', 'evidence'],
  );
  if (!aggregatesEntry.ok) return validationRejected(aggregatesEntry.rejection);
  if (aggregatesEntry.value.schemaVersion !== 1) {
    return validationRejected({
      code: 'UNSUPPORTED_SCHEMA',
      message: 'Unsupported aggregate schema version',
      path: 'aggregates.schemaVersion',
    });
  }
  const indicators = readIndicators(aggregatesEntry.value.indicators, 'aggregates.indicators');
  if (!indicators.ok) return validationRejected(indicators.rejection);
  const evidence = readEvidence(aggregatesEntry.value.evidence, 'aggregates.evidence');
  if (!evidence.ok) return validationRejected(evidence.rejection);
  const countsEntry = readPlainObject(
    aggregatesEntry.value.counts,
    'aggregates.counts',
    [
      'versions',
      'baseVersions',
      'derivedVersions',
      'manualTuningVersions',
      'learningVersions',
      'parameters',
      'reservedParameters',
      'sourceSegments',
      'sourceInterventions',
    ],
    [
      'versions',
      'baseVersions',
      'derivedVersions',
      'manualTuningVersions',
      'learningVersions',
      'parameters',
      'reservedParameters',
      'sourceSegments',
      'sourceInterventions',
    ],
  );
  if (!countsEntry.ok) return validationRejected(countsEntry.rejection);
  const counts: Record<string, number> = Object.create(null);
  for (const key of Object.keys(countsEntry.value)) {
    const count = readCount(countsEntry.value[key], `aggregates.counts.${key}`);
    if (!count.ok) return validationRejected(count.rejection);
    counts[key] = count.value;
  }
  const expectedCounts = computeCounts(versions, activeVersionId, byId, reservedParameters.value);
  const countKeys = [
    'versions',
    'baseVersions',
    'derivedVersions',
    'manualTuningVersions',
    'learningVersions',
    'parameters',
    'reservedParameters',
    'sourceSegments',
    'sourceInterventions',
  ] as const;
  for (const key of countKeys) {
    if (counts[key] !== expectedCounts[key]) {
      return validationRejected({
        code: 'AGGREGATE_MISMATCH',
        message: `The counter ${key} does not match the exported profile`,
        path: `aggregates.counts.${key}`,
      });
    }
  }

  const document: ProfileExportDocument = Object.freeze({
    format: PROFILE_EXPORT_FORMAT,
    formatVersion: PROFILE_EXPORT_FORMAT_VERSION,
    schemaVersion: PROFILE_EXPORT_SCHEMA_VERSION,
    units: 'SI',
    createdAt: createdAt.value,
    engineVersion: engineVersion.value,
    profile: Object.freeze({
      profileId: profileId.value,
      source: profileData.source as ProfileSourceKind | null,
      activeVersionId,
      activation,
      versions: Object.freeze(versions),
      reservedParameters: reservedParameters.value,
    }),
    aggregates: Object.freeze({
      schemaVersion: 1,
      counts: Object.freeze({
        versions: counts.versions,
        baseVersions: counts.baseVersions,
        derivedVersions: counts.derivedVersions,
        manualTuningVersions: counts.manualTuningVersions,
        learningVersions: counts.learningVersions,
        parameters: counts.parameters,
        reservedParameters: counts.reservedParameters,
        sourceSegments: counts.sourceSegments,
        sourceInterventions: counts.sourceInterventions,
      }),
      indicators: indicators.value,
      evidence: evidence.value,
    }),
    telemetry: telemetry.value,
    checksum: Object.freeze({
      algorithm: CHECKSUM_ALGORITHM,
      canonicalization: CANONICALIZATION_VERSION,
      value: declared,
    }),
  });

  const parameters: Record<string, number> = Object.create(null);
  const active = activeVersionId === null ? null : (byId.get(activeVersionId) ?? null);
  if (active !== null) {
    for (const key of Object.keys(active.parameters)) {
      parameters[key] = active.parameters[key].value;
    }
  }
  const exportedVersions = versions.map((version) => {
    const flat: Record<string, number> = Object.create(null);
    for (const key of Object.keys(version.parameters)) {
      flat[key] = version.parameters[key].value;
    }
    return Object.freeze({
      versionId: version.versionId,
      parentVersionId: version.parentVersionId,
      depth: version.depth,
      source: version.source,
      createdAt: version.createdAt,
      engineVersion: version.engineVersion,
      checksum: version.checksum,
      parameters: Object.freeze(flat),
    });
  });

  return Object.freeze({
    status: 'ACCEPTED' as const,
    document,
    checksumVerified: true,
    parameters: Object.freeze(parameters),
    reservedParameters: reservedParameters.value,
    versions: Object.freeze(exportedVersions),
    rejection: null,
  });
}

/** The provenance classification of an exported version, computed from its own provenance. */
function expectedSourceOf(version: ProfileExportVersion): ProfileSourceKind {
  if (version.provenance.origin === 'BASE') return 'BASE';
  if (version.provenance.sourceInterventionIds.length > 0) return 'MANUAL_TUNING';
  if (version.provenance.sourceSegmentIds.length > 0) return 'LEARNING';
  return 'MANUAL_TUNING';
}

/** The 109 checksum of an exported version, recomputed with the profile id of the document. */
function versionChecksumOf(version: ProfileExportVersion, profileId: string): string {
  const parameters: Record<string, number> = Object.create(null);
  for (const key of Object.keys(version.parameters)) {
    parameters[key] = version.parameters[key].value;
  }
  const delta = version.provenance.delta;
  return computeProfileVersionChecksum({
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters,
    provenance: {
      origin: version.provenance.origin,
      sourceSegmentIds: version.provenance.sourceSegmentIds,
      sourceInterventionIds: version.provenance.sourceInterventionIds,
      delta:
        delta === null
          ? null
          : {
              baseVersionId: delta.baseVersionId,
              validationVersion: delta.validationVersion,
              segmentId: delta.segmentId,
              interventionId: delta.interventionId,
              reason: delta.reason,
              keyCount: delta.keyCount,
              changes: delta.changes.map((change) => ({
                key: change.key,
                unit: change.unit,
                previousValue: change.previousValue,
                newValue: change.newValue,
              })),
            },
    },
    sourceSegmentIds: version.provenance.sourceSegmentIds,
    depth: version.depth,
    createdAt: version.createdAt,
  });
}

/** The counters recomputed from the profile section. */
function computeCounts(
  versions: readonly ProfileExportVersion[],
  activeVersionId: string | null,
  byId: ReadonlyMap<string, ProfileExportVersion>,
  reservedParameters: Readonly<Record<string, null>>,
): ProfileExportCounts {
  const segmentIds = new Set<string>();
  const interventionIds = new Set<string>();
  let baseVersions = 0;
  let manualTuningVersions = 0;
  let learningVersions = 0;
  for (const version of versions) {
    for (const id of version.provenance.sourceSegmentIds) segmentIds.add(id);
    for (const id of version.provenance.sourceInterventionIds) interventionIds.add(id);
    if (version.source === 'BASE') baseVersions += 1;
    else if (version.source === 'MANUAL_TUNING') manualTuningVersions += 1;
    else learningVersions += 1;
  }
  const active = activeVersionId === null ? null : (byId.get(activeVersionId) ?? null);
  return {
    versions: versions.length,
    baseVersions,
    derivedVersions: versions.length - baseVersions,
    manualTuningVersions,
    learningVersions,
    parameters: active === null ? 0 : Object.keys(active.parameters).length,
    reservedParameters: Object.keys(reservedParameters).length,
    sourceSegments: segmentIds.size,
    sourceInterventions: interventionIds.size,
  };
}

/* ------------------------------------------------------------------ reader */

export type ProfileExportReadResult = ProfileExportValidationResult;

function strictRejection(rejection: StrictJsonRejection): ProfileExportRejection {
  const code =
    rejection.code === 'FILE_TOO_LARGE'
      ? 'FILE_TOO_LARGE'
      : rejection.code === 'DEPTH_EXCEEDED'
        ? 'DEPTH_EXCEEDED'
        : rejection.code === 'DUPLICATE_KEY'
          ? 'DUPLICATE_KEY'
          : rejection.code === 'TRAILING_CONTENT'
            ? 'TRAILING_CONTENT'
            : 'PARSE_ERROR';
  return { code, message: rejection.message, path: rejection.path };
}

/**
 * Reads an exported file.
 *
 * The input is either the text of the file or an already parsed object. A text is parsed with the
 * strict reader, so a duplicate key, a trailing document or a document above the size budget is
 * refused before anything is interpreted. The result reconstructs the parameter values and the
 * reserved keys, which is the contract the importer (PBI 134) builds on.
 */
export function readProfileExport(input: unknown): ProfileExportReadResult {
  let value = input;
  if (typeof input === 'string') {
    const parsed = parseStrictJson(input, {
      maxBytes: PROFILE_EXPORT_LIMITS.maxFileBytes,
      maxDepth: PROFILE_EXPORT_LIMITS.maxDepth,
    });
    if (parsed.status === 'REJECTED') {
      return Object.freeze({
        status: 'REJECTED' as const,
        document: null,
        checksumVerified: false,
        parameters: null,
        reservedParameters: null,
        versions: null,
        rejection: Object.freeze(strictRejection(parsed.rejection)),
      });
    }
    value = parsed.value;
  }
  return validateProfileExport(value);
}
