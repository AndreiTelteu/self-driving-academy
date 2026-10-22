import { requireContract, record, text } from '../sessions';
import { getParameterDefinition, validateParameterValue } from './parameter-registry';

/**
 * Immutable, versioned profile history for PBI 109.
 *
 * The store owns deep-frozen `ProfileVersion` records. A base version is created once; every
 * other version is derived from an explicit parent by applying a validated delta. The numeric
 * gate is injected (`ProfileDeltaValidator`) because the 102 validator lives in `src/learning`,
 * which already depends on `src/profiles`; importing it back would create a domain cycle. The
 * canonical production binding is `createCandidateProfileStore` from `src/learning`.
 *
 * The store never publishes a profile, never writes the 092 registry and never marks a value
 * LEARNED or an activation. Checksums are deterministic content hashes, not signatures.
 */
export const PROFILE_STORE_VERSION = '109-profile-store-v1' as const;

/** Deterministic, non-cryptographic content hash; documented in Docs/profile-store.md. */
export const PROFILE_STORE_CHECKSUM_ALGORITHM = 'fnv1a64' as const;

export const PROFILE_STORE_LIMITS = Object.freeze({
  maxVersions: 256,
  maxVersionsPerProfile: 128,
  maxInterventions: 512,
  maxIdentityLength: 128,
  maxReasonLength: 240,
  maxProvenanceIds: 64,
  /** Upper bounds accepted from callers so a custom store cannot request unbounded history. */
  maxConfiguredVersions: 10_000,
  maxConfiguredInterventions: 100_000,
});

/** Structural subset of the 102 candidate delta consumed by the injection port. */
export interface ProfileDeltaValidationInput {
  readonly profileVersionId?: unknown;
  readonly parentVersionId?: unknown;
  readonly engineVersion?: unknown;
  readonly schemaVersion?: unknown;
  readonly units?: unknown;
  readonly values: unknown;
}

export interface ProfileDeltaValidationExpectations {
  readonly baseVersionId?: string;
  readonly engineVersion?: string;
}

export interface ProfileDeltaValidationValue {
  readonly key: string;
  readonly unit: string;
  readonly value: number;
}

export interface ProfileDeltaValidationAccepted {
  readonly status: 'ACCEPTED';
  /** Validation contract version, echoed into the version provenance. */
  readonly version: string;
  readonly delta: {
    readonly profileVersionId: string;
    readonly parentVersionId: string | null;
    readonly engineVersion: string | null;
    readonly values: readonly ProfileDeltaValidationValue[];
    readonly keyCount: number;
  };
}

export interface ProfileDeltaValidationRejected {
  readonly status: 'REJECTED';
  readonly rejections: readonly { readonly code: string }[];
}

export type ProfileDeltaValidationResult =
  ProfileDeltaValidationAccepted | ProfileDeltaValidationRejected;

/**
 * Numeric delta gate. The 102 `validateCandidateDelta` satisfies this contract structurally; the
 * learning binding supplies it. A structurally malformed delta may throw inside the validator and
 * is translated into the closed `DELTA_INVALID` reason.
 */
export interface ProfileDeltaValidator {
  (
    input: ProfileDeltaValidationInput,
    expectations?: ProfileDeltaValidationExpectations,
  ): ProfileDeltaValidationResult;
}

export interface ProfileDeltaChange {
  readonly key: string;
  readonly unit: string;
  /** Value in the parent version; a delta can never replace the base silently. */
  readonly previousValue: number;
  readonly newValue: number;
}

export interface ProfileVersionDelta {
  /** The version this delta was applied to. Always equals the child `parentVersionId`. */
  readonly baseVersionId: string;
  /** Contract version of the validator that accepted the delta (for example 102). */
  readonly validationVersion: string;
  readonly segmentId: string;
  readonly interventionId: string | null;
  readonly reason: string | null;
  readonly keyCount: number;
  readonly changes: readonly ProfileDeltaChange[];
}

export interface ProfileVersionProvenance {
  readonly origin: 'BASE' | 'DERIVED';
  readonly sourceSegmentIds: readonly string[];
  readonly sourceInterventionIds: readonly string[];
  /** `null` only for a base version; a derived version always records its base. */
  readonly delta: ProfileVersionDelta | null;
}

export interface ProfileVersionContent {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly profileId: string;
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly engineVersion: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly provenance: ProfileVersionProvenance;
  readonly sourceSegmentIds: readonly string[];
  /** 0 for a base version, parent depth + 1 otherwise. */
  readonly depth: number;
  readonly createdAt: string;
}

export interface ProfileVersion extends ProfileVersionContent {
  readonly checksum: string;
}

export interface CreateProfileBaseInput {
  readonly profileId: string;
  readonly versionId: string;
  readonly parameters: unknown;
  readonly sourceSegmentIds?: unknown;
  readonly sourceInterventionIds?: unknown;
  readonly createdAt?: unknown;
}

export interface ProfileDeltaRequest {
  readonly profileId: string;
  /** Identity of the child version. Reusing it is rejected unless the intervention is a retry. */
  readonly versionId: string;
  /** Explicit base version; must exist in this store and belong to `profileId`. */
  readonly parentVersionId: string;
  /** Idempotency identity. A segment can produce at most one version. */
  readonly segmentId: string;
  readonly interventionId?: unknown;
  readonly reason?: unknown;
  readonly createdAt?: unknown;
  readonly delta: ProfileDeltaValidationInput;
}

export const profileStoreRejectionCodes = [
  'STORE_DISPOSED',
  'VERSION_ID_DUPLICATE',
  'PARENT_NOT_FOUND',
  'PARENT_FOREIGN',
  'PARENT_SELF',
  'ENGINE_VERSION_MISMATCH',
  'DELTA_VERSION_MISMATCH',
  'DELTA_BASE_MISMATCH',
  'DELTA_INVALID',
  'DELTA_KEY_NOT_IN_BASE',
  'INTERVENTION_CONFLICT',
  'PROVENANCE_LIMIT',
  'HISTORY_LIMIT',
  'INTERVENTION_LIMIT',
] as const;
export type ProfileStoreRejectionCode = (typeof profileStoreRejectionCodes)[number];

export interface ProfileStoreRejection {
  readonly code: ProfileStoreRejectionCode;
  readonly message: string;
  /** 102 rejection codes when the failure came from the injected delta gate. */
  readonly deltaCodes: readonly string[];
  readonly path: string | null;
}

export interface ProfileStoreAccepted {
  readonly version: typeof PROFILE_STORE_VERSION;
  readonly status: 'ACCEPTED';
  readonly versionId: string;
  /** Fresh deep-frozen copy; never the internal record. */
  readonly profileVersion: ProfileVersion;
  readonly created: boolean;
  readonly deduplicated: boolean;
  readonly rejection: null;
}

export interface ProfileStoreRejected {
  readonly version: typeof PROFILE_STORE_VERSION;
  readonly status: 'REJECTED';
  readonly versionId: null;
  readonly profileVersion: null;
  readonly created: false;
  readonly deduplicated: false;
  readonly rejection: ProfileStoreRejection;
}

export type ProfileStoreResult = ProfileStoreAccepted | ProfileStoreRejected;

export interface ProfileStoreStats {
  readonly version: typeof PROFILE_STORE_VERSION;
  readonly engineVersion: string;
  readonly disposed: boolean;
  readonly versions: number;
  readonly baseVersions: number;
  readonly derivedVersions: number;
  readonly profiles: number;
  readonly interventions: number;
  /** Cumulative accepted retries after a first application. */
  readonly deduplicated: number;
  /** Cumulative closed rejections, including history and intervention limits. */
  readonly rejected: number;
  readonly historyLimitRejections: number;
  readonly clears: number;
  readonly disposes: number;
}

export interface ProfileStoreOptions {
  readonly engineVersion: string;
  /** Required: numeric validation is owned by 102 and must not be reimplemented here. */
  readonly validateDelta: ProfileDeltaValidator;
  readonly maxVersions?: number;
  readonly maxVersionsPerProfile?: number;
  readonly maxInterventions?: number;
  /** Optional deterministic clock for tests and replays. */
  readonly now?: () => string;
}

export interface ProfileStore {
  readonly version: typeof PROFILE_STORE_VERSION;
  readonly engineVersion: string;
  createBase(input: CreateProfileBaseInput): ProfileStoreResult;
  derive(input: ProfileDeltaRequest): ProfileStoreResult;
  /** Fresh deep-frozen copy, or `null` when the version does not exist. */
  getVersion(versionId: string): ProfileVersion | null;
  listVersions(profileId?: string): readonly ProfileVersion[];
  /** Base-to-tip chain for a profile, either ending at `versionId` or at the latest version. */
  getHistory(profileId: string, versionId?: string): readonly ProfileVersion[];
  /** Version created by a segment, or `null`. */
  getInterventionVersion(profileId: string, segmentId: string): string | null;
  stats(): ProfileStoreStats;
  /** Drops all versions and interventions; the store stays usable. */
  clear(): void;
  /** Drops all state and rejects later mutations. Idempotent. */
  dispose(): void;
}

export const PROFILE_STORE_POLICY = Object.freeze({
  immutableVersions: true,
  deepFrozen: true,
  copiesOnRead: true,
  inPlaceMutation: false,
  explicitBasePerDelta: true,
  publishesProfile: false,
  publishesDelta: false,
  marksLearned: false,
  activatesProfile: false,
  mutatesRegistry: false,
  externalDeltaValidator: true,
});

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function fnv1a64(value: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Deterministic checksum over the full immutable content, excluding the checksum field itself.
 * Parameters are sorted, so map insertion order cannot change the result. This is an integrity
 * fingerprint for history comparisons, not a security signature.
 */
export function computeProfileVersionChecksum(version: ProfileVersionContent): string {
  const parameters = Object.keys(version.parameters)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((key) => [key, version.parameters[key]] as const);
  const delta = version.provenance.delta;
  const changes =
    delta === null
      ? []
      : delta.changes.map(
          (change) => [change.key, change.unit, change.previousValue, change.newValue] as const,
        );
  const canonical = JSON.stringify([
    PROFILE_STORE_VERSION,
    version.schemaVersion,
    version.units,
    version.profileId,
    version.versionId,
    version.parentVersionId,
    version.engineVersion,
    version.depth,
    version.createdAt,
    version.provenance.origin,
    [...version.provenance.sourceSegmentIds],
    [...version.provenance.sourceInterventionIds],
    delta === null
      ? null
      : [
          delta.baseVersionId,
          delta.validationVersion,
          delta.segmentId,
          delta.interventionId,
          delta.reason,
          delta.keyCount,
          changes,
        ],
    parameters,
  ]);
  return `${PROFILE_STORE_CHECKSUM_ALGORITHM}:${fnv1a64(canonical)}`;
}

export function verifyProfileVersionChecksum(version: ProfileVersion): boolean {
  return computeProfileVersionChecksum(version) === version.checksum;
}

function freezeChange(change: ProfileDeltaChange): ProfileDeltaChange {
  return Object.freeze({
    key: change.key,
    unit: change.unit,
    previousValue: change.previousValue,
    newValue: change.newValue,
  });
}

function freezeProvenance(provenance: ProfileVersionProvenance): ProfileVersionProvenance {
  const delta =
    provenance.delta === null
      ? null
      : Object.freeze({
          baseVersionId: provenance.delta.baseVersionId,
          validationVersion: provenance.delta.validationVersion,
          segmentId: provenance.delta.segmentId,
          interventionId: provenance.delta.interventionId,
          reason: provenance.delta.reason,
          keyCount: provenance.delta.keyCount,
          changes: Object.freeze(provenance.delta.changes.map(freezeChange)),
        });
  return Object.freeze({
    origin: provenance.origin,
    sourceSegmentIds: Object.freeze([...provenance.sourceSegmentIds]),
    sourceInterventionIds: Object.freeze([...provenance.sourceInterventionIds]),
    delta,
  });
}

function buildVersion(content: ProfileVersionContent): ProfileVersion {
  const parameters: Record<string, number> = Object.create(null);
  for (const key of Object.keys(content.parameters)) parameters[key] = content.parameters[key];
  const frozenContent: ProfileVersionContent = Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    profileId: content.profileId,
    versionId: content.versionId,
    parentVersionId: content.parentVersionId,
    engineVersion: content.engineVersion,
    parameters: Object.freeze(parameters),
    provenance: freezeProvenance(content.provenance),
    sourceSegmentIds: Object.freeze([...content.sourceSegmentIds]),
    depth: content.depth,
    createdAt: content.createdAt,
  });
  return Object.freeze({
    ...frozenContent,
    checksum: computeProfileVersionChecksum(frozenContent),
  });
}

function copyVersion(version: ProfileVersion): ProfileVersion {
  return buildVersion(version);
}

function readRequest(
  value: unknown,
  allowed: readonly string[],
  contract: string,
): Record<string, unknown> {
  const data = record(value);
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(data)) {
    requireContract(allowedFields.has(key), `Unknown ${contract} field: ${key}`);
  }
  return data;
}

function boundedText(
  value: unknown,
  field: string,
  maximum: number = PROFILE_STORE_LIMITS.maxIdentityLength,
): string {
  const raw = text(value);
  requireContract(raw.length <= maximum, `${field} exceeds ${maximum} characters`);
  return raw;
}

function optionalId(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : boundedText(value, field);
}

function optionalReason(value: unknown): string | null {
  return value === undefined || value === null
    ? null
    : boundedText(value, 'reason', PROFILE_STORE_LIMITS.maxReasonLength);
}

function readTimestamp(value: unknown, now: () => string): string {
  if (value === undefined || value === null) return now();
  const raw = text(value);
  requireContract(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw) &&
      Number.isFinite(Date.parse(raw)),
    'Expected a valid UTC timestamp',
  );
  return raw;
}

function readIds(value: unknown, field: string): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  requireContract(Array.isArray(value), `${field} must be an array`);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value as readonly unknown[]) {
    const id = boundedText(entry, field);
    requireContract(!seen.has(id), `Duplicate ${field}: ${id}`);
    seen.add(id);
    ids.push(id);
  }
  requireContract(
    ids.length <= PROFILE_STORE_LIMITS.maxProvenanceIds,
    `${field} exceeds ${PROFILE_STORE_LIMITS.maxProvenanceIds} entries`,
  );
  return Object.freeze(ids);
}

function readParameters(value: unknown): Readonly<Record<string, number>> {
  const raw = record(value);
  const keys = Object.keys(raw);
  requireContract(keys.length > 0, 'A profile version needs at least one parameter');
  const parameters: Record<string, number> = Object.create(null);
  for (const key of keys) {
    const definition = getParameterDefinition(key);
    parameters[key] = validateParameterValue(key, raw[key], definition.unit);
  }
  return Object.freeze(parameters);
}

function mergeIds(
  existing: readonly string[],
  additions: readonly string[],
  maximum: number,
): readonly string[] | null {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of [...existing, ...additions]) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged.length > maximum ? null : Object.freeze(merged);
}

function readLimit(value: unknown, fallback: number, maximum: number, field: string): number {
  if (value === undefined) return fallback;
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= maximum,
    `Invalid ${field}`,
  );
  return value;
}

function interventionSignature(
  baseVersionId: string,
  engineVersion: string,
  changes: readonly ProfileDeltaChange[],
): string {
  const sorted = changes
    .slice()
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map((change) => [change.key, change.newValue] as const);
  return JSON.stringify([baseVersionId, engineVersion, sorted]);
}

function versionSignature(version: ProfileVersion): string {
  const delta = version.provenance.delta;
  if (delta === null) return '';
  return interventionSignature(delta.baseVersionId, version.engineVersion, delta.changes);
}

function rejection(
  code: ProfileStoreRejectionCode,
  message: string,
  path: string | null = null,
  deltaCodes: readonly string[] = [],
): ProfileStoreRejected {
  return Object.freeze({
    version: PROFILE_STORE_VERSION,
    status: 'REJECTED',
    versionId: null,
    profileVersion: null,
    created: false,
    deduplicated: false,
    rejection: Object.freeze({ code, message, deltaCodes: Object.freeze([...deltaCodes]), path }),
  });
}

function accepted(
  version: ProfileVersion,
  created: boolean,
  deduplicated: boolean,
): ProfileStoreAccepted {
  return Object.freeze({
    version: PROFILE_STORE_VERSION,
    status: 'ACCEPTED',
    versionId: version.versionId,
    profileVersion: copyVersion(version),
    created,
    deduplicated,
    rejection: null,
  });
}

export function isProfileStoreAccepted(result: ProfileStoreResult): result is ProfileStoreAccepted {
  return result.status === 'ACCEPTED';
}

export function createProfileStore(options: ProfileStoreOptions): ProfileStore {
  const data = readRequest(
    options,
    [
      'engineVersion',
      'validateDelta',
      'maxVersions',
      'maxVersionsPerProfile',
      'maxInterventions',
      'now',
    ],
    'profile store option',
  );
  const engineVersion = boundedText(data.engineVersion, 'engineVersion');
  requireContract(typeof data.validateDelta === 'function', 'A delta validator is required');
  const validateDelta = data.validateDelta as ProfileDeltaValidator;
  const maxVersions = readLimit(
    data.maxVersions,
    PROFILE_STORE_LIMITS.maxVersions,
    PROFILE_STORE_LIMITS.maxConfiguredVersions,
    'maxVersions',
  );
  const maxVersionsPerProfile = readLimit(
    data.maxVersionsPerProfile,
    Math.min(PROFILE_STORE_LIMITS.maxVersionsPerProfile, maxVersions),
    maxVersions,
    'maxVersionsPerProfile',
  );
  const maxInterventions = readLimit(
    data.maxInterventions,
    PROFILE_STORE_LIMITS.maxInterventions,
    PROFILE_STORE_LIMITS.maxConfiguredInterventions,
    'maxInterventions',
  );
  requireContract(
    data.now === undefined || typeof data.now === 'function',
    'now must be a function',
  );
  const now = data.now === undefined ? () => new Date().toISOString() : (data.now as () => string);

  const versions = new Map<string, ProfileVersion>();
  const order: string[] = [];
  const interventions = new Map<string, Map<string, string>>();
  const counters = {
    deduplicated: 0,
    rejected: 0,
    historyLimitRejections: 0,
    clears: 0,
    disposes: 0,
  };
  let disposed = false;

  function profileVersionCount(profileId: string): number {
    let count = 0;
    for (const version of versions.values()) {
      if (version.profileId === profileId) count += 1;
    }
    return count;
  }

  function interventionCount(): number {
    let count = 0;
    for (const entries of interventions.values()) count += entries.size;
    return count;
  }

  function reject(
    code: ProfileStoreRejectionCode,
    message: string,
    path: string | null = null,
    deltaCodes: readonly string[] = [],
  ): ProfileStoreRejected {
    counters.rejected += 1;
    if (code === 'HISTORY_LIMIT') counters.historyLimitRejections += 1;
    return rejection(code, message, path, deltaCodes);
  }

  function createBase(input: CreateProfileBaseInput): ProfileStoreResult {
    if (disposed) {
      return reject('STORE_DISPOSED', 'The profile store was disposed');
    }
    const request = readRequest(
      input,
      [
        'profileId',
        'versionId',
        'parameters',
        'sourceSegmentIds',
        'sourceInterventionIds',
        'createdAt',
      ],
      'base version',
    );
    const profileId = boundedText(request.profileId, 'profileId');
    const versionId = boundedText(request.versionId, 'versionId');
    const parameters = readParameters(request.parameters);
    const sourceSegmentIds = readIds(request.sourceSegmentIds, 'sourceSegmentIds');
    const sourceInterventionIds = readIds(request.sourceInterventionIds, 'sourceInterventionIds');
    const createdAt = readTimestamp(request.createdAt, now);

    if (versions.has(versionId)) {
      return reject('VERSION_ID_DUPLICATE', `Version ${versionId} already exists`);
    }
    if (versions.size >= maxVersions) {
      return reject('HISTORY_LIMIT', `The store cannot hold more than ${maxVersions} versions`);
    }
    if (profileVersionCount(profileId) >= maxVersionsPerProfile) {
      return reject(
        'HISTORY_LIMIT',
        `Profile ${profileId} cannot hold more than ${maxVersionsPerProfile} versions`,
      );
    }

    const version = buildVersion({
      schemaVersion: 1,
      units: 'SI',
      profileId,
      versionId,
      parentVersionId: null,
      engineVersion,
      parameters,
      provenance: {
        origin: 'BASE',
        sourceSegmentIds,
        sourceInterventionIds,
        delta: null,
      },
      sourceSegmentIds,
      depth: 0,
      createdAt,
    });
    versions.set(versionId, version);
    order.push(versionId);
    return accepted(version, true, false);
  }

  function derive(input: ProfileDeltaRequest): ProfileStoreResult {
    if (disposed) {
      return reject('STORE_DISPOSED', 'The profile store was disposed');
    }
    const request = readRequest(
      input,
      [
        'profileId',
        'versionId',
        'parentVersionId',
        'segmentId',
        'interventionId',
        'reason',
        'createdAt',
        'delta',
      ],
      'profile delta',
    );
    const profileId = boundedText(request.profileId, 'profileId');
    const versionId = boundedText(request.versionId, 'versionId');
    const parentVersionId = boundedText(request.parentVersionId, 'parentVersionId');
    const segmentId = boundedText(request.segmentId, 'segmentId');
    const interventionId = optionalId(request.interventionId, 'interventionId');
    const reason = optionalReason(request.reason);
    const createdAt = readTimestamp(request.createdAt, now);

    if (versionId === parentVersionId) {
      return reject('PARENT_SELF', 'A version cannot be its own parent', 'parentVersionId');
    }
    const parent = versions.get(parentVersionId);
    if (parent === undefined) {
      return reject(
        'PARENT_NOT_FOUND',
        `Parent version ${parentVersionId} is not in this store`,
        'parentVersionId',
      );
    }
    if (parent.profileId !== profileId) {
      return reject(
        'PARENT_FOREIGN',
        `Parent ${parentVersionId} belongs to profile ${parent.profileId}, not ${profileId}`,
        'parentVersionId',
      );
    }

    let delta: Record<string, unknown>;
    try {
      delta = record(request.delta);
    } catch {
      return reject('DELTA_INVALID', 'The delta is not a plain contract object', 'delta');
    }
    if (delta.engineVersion !== engineVersion) {
      return reject(
        'ENGINE_VERSION_MISMATCH',
        `The delta must target engine version ${engineVersion}`,
        'delta.engineVersion',
      );
    }
    if (delta.profileVersionId !== versionId) {
      return reject(
        'DELTA_VERSION_MISMATCH',
        `The delta must declare version ${versionId}`,
        'delta.profileVersionId',
      );
    }
    if (delta.parentVersionId !== parentVersionId) {
      return reject(
        'DELTA_BASE_MISMATCH',
        `The delta must record its base ${parentVersionId}`,
        'delta.parentVersionId',
      );
    }

    let validation: ProfileDeltaValidationResult;
    try {
      validation = validateDelta(request.delta as ProfileDeltaValidationInput, {
        baseVersionId: parentVersionId,
        engineVersion,
      });
    } catch {
      return reject(
        'DELTA_INVALID',
        'The injected delta validation rejected the structure',
        'delta',
      );
    }
    if (validation.status !== 'ACCEPTED') {
      const deltaCodes = validation.rejections.map((entry) => entry.code);
      const code: ProfileStoreRejectionCode = deltaCodes.includes('BASE_VERSION_MISMATCH')
        ? 'DELTA_BASE_MISMATCH'
        : deltaCodes.includes('ENGINE_VERSION_MISMATCH')
          ? 'ENGINE_VERSION_MISMATCH'
          : deltaCodes.includes('PROFILE_VERSION_SELF_PARENT')
            ? 'PARENT_SELF'
            : 'DELTA_INVALID';
      return reject(code, 'The injected delta validation rejected the delta', 'delta', deltaCodes);
    }
    if (
      !validation.delta ||
      typeof validation.delta !== 'object' ||
      !Array.isArray(validation.delta.values) ||
      typeof validation.version !== 'string' ||
      validation.version.trim().length === 0
    ) {
      return reject('DELTA_INVALID', 'The accepted delta has no usable value list', 'delta');
    }
    if (
      validation.delta.profileVersionId !== versionId ||
      validation.delta.parentVersionId !== parentVersionId
    ) {
      return reject(
        'DELTA_VERSION_MISMATCH',
        'The accepted delta does not echo the requested version and base',
        'delta',
      );
    }
    if (validation.delta.engineVersion !== engineVersion) {
      return reject(
        'ENGINE_VERSION_MISMATCH',
        'The accepted delta does not echo the store engine version',
        'delta.engineVersion',
      );
    }

    const changes: ProfileDeltaChange[] = [];
    const seenKeys = new Set<string>();
    for (const row of validation.delta.values) {
      if (
        !row ||
        typeof row !== 'object' ||
        typeof row.key !== 'string' ||
        typeof row.unit !== 'string' ||
        typeof row.value !== 'number'
      ) {
        return reject(
          'DELTA_INVALID',
          'The accepted delta contains an invalid value',
          'delta.values',
        );
      }
      let definition;
      try {
        definition = getParameterDefinition(row.key);
      } catch {
        return reject('DELTA_INVALID', `Unknown delta parameter: ${row.key}`, 'delta.values');
      }
      if (seenKeys.has(row.key)) {
        return reject('DELTA_INVALID', `Duplicate delta parameter: ${row.key}`, 'delta.values');
      }
      seenKeys.add(row.key);
      let value: number;
      try {
        value = validateParameterValue(row.key, row.value, row.unit);
      } catch {
        return reject(
          'DELTA_INVALID',
          `Delta value for ${row.key} is outside the registry contract`,
          'delta.values',
        );
      }
      if (!Object.hasOwn(parent.parameters, row.key)) {
        return reject(
          'DELTA_KEY_NOT_IN_BASE',
          `Parameter ${row.key} does not exist in base ${parentVersionId}`,
          'delta.values',
        );
      }
      changes.push({
        key: row.key,
        unit: definition.unit,
        previousValue: parent.parameters[row.key],
        newValue: value,
      });
    }

    const signature = interventionSignature(parentVersionId, engineVersion, changes);
    const existingVersionId = interventions.get(profileId)?.get(segmentId);
    if (existingVersionId !== undefined) {
      const existing = versions.get(existingVersionId);
      if (existing !== undefined && versionSignature(existing) === signature) {
        counters.deduplicated += 1;
        return accepted(existing, false, true);
      }
      return reject(
        'INTERVENTION_CONFLICT',
        `Segment ${segmentId} already produced ${existingVersionId} with a different delta`,
        'segmentId',
      );
    }

    if (versions.has(versionId)) {
      return reject('VERSION_ID_DUPLICATE', `Version ${versionId} already exists`, 'versionId');
    }
    if (versions.size >= maxVersions) {
      return reject('HISTORY_LIMIT', `The store cannot hold more than ${maxVersions} versions`);
    }
    if (profileVersionCount(profileId) >= maxVersionsPerProfile) {
      return reject(
        'HISTORY_LIMIT',
        `Profile ${profileId} cannot hold more than ${maxVersionsPerProfile} versions`,
      );
    }
    if (interventionCount() >= maxInterventions) {
      return reject(
        'INTERVENTION_LIMIT',
        `The store cannot hold more than ${maxInterventions} interventions`,
      );
    }

    const sourceSegmentIds = mergeIds(
      parent.provenance.sourceSegmentIds,
      [segmentId],
      PROFILE_STORE_LIMITS.maxProvenanceIds,
    );
    if (sourceSegmentIds === null) {
      return reject('PROVENANCE_LIMIT', 'The source segment list is too long', 'segmentId');
    }
    const sourceInterventionIds = mergeIds(
      parent.provenance.sourceInterventionIds,
      interventionId === null ? [] : [interventionId],
      PROFILE_STORE_LIMITS.maxProvenanceIds,
    );
    if (sourceInterventionIds === null) {
      return reject('PROVENANCE_LIMIT', 'The source intervention list is too long');
    }

    const parameters: Record<string, number> = Object.create(null);
    for (const key of Object.keys(parent.parameters)) parameters[key] = parent.parameters[key];
    for (const change of changes) parameters[change.key] = change.newValue;

    const version = buildVersion({
      schemaVersion: 1,
      units: 'SI',
      profileId,
      versionId,
      parentVersionId,
      engineVersion,
      parameters,
      provenance: {
        origin: 'DERIVED',
        sourceSegmentIds,
        sourceInterventionIds,
        delta: {
          baseVersionId: parentVersionId,
          validationVersion: validation.version,
          segmentId,
          interventionId,
          reason,
          keyCount: changes.length,
          changes,
        },
      },
      sourceSegmentIds,
      depth: parent.depth + 1,
      createdAt,
    });
    versions.set(versionId, version);
    order.push(versionId);
    let segments = interventions.get(profileId);
    if (segments === undefined) {
      segments = new Map<string, string>();
      interventions.set(profileId, segments);
    }
    segments.set(segmentId, versionId);
    return accepted(version, true, false);
  }

  function getVersion(versionId: string): ProfileVersion | null {
    const id = boundedText(versionId, 'versionId');
    const version = versions.get(id);
    return version === undefined ? null : copyVersion(version);
  }

  function listVersions(profileId?: string): readonly ProfileVersion[] {
    const filter = profileId === undefined ? null : boundedText(profileId, 'profileId');
    const result: ProfileVersion[] = [];
    for (const versionId of order) {
      const version = versions.get(versionId);
      if (version === undefined) continue;
      if (filter !== null && version.profileId !== filter) continue;
      result.push(copyVersion(version));
    }
    return Object.freeze(result);
  }

  function getHistory(profileId: string, versionId?: string): readonly ProfileVersion[] {
    const profile = boundedText(profileId, 'profileId');
    let currentId: string | null;
    if (versionId === undefined) {
      currentId = null;
      for (let index = order.length - 1; index >= 0; index -= 1) {
        const candidate = versions.get(order[index]);
        if (candidate !== undefined && candidate.profileId === profile) {
          currentId = candidate.versionId;
          break;
        }
      }
      if (currentId === null) return Object.freeze([]);
    } else {
      currentId = boundedText(versionId, 'versionId');
    }
    const chain: ProfileVersion[] = [];
    const seen = new Set<string>();
    while (currentId !== null) {
      requireContract(!seen.has(currentId), 'Profile version history contains a cycle');
      seen.add(currentId);
      const version = versions.get(currentId);
      if (version === undefined || version.profileId !== profile) break;
      chain.push(copyVersion(version));
      currentId = version.parentVersionId;
    }
    chain.reverse();
    return Object.freeze(chain);
  }

  function getInterventionVersion(profileId: string, segmentId: string): string | null {
    const profile = boundedText(profileId, 'profileId');
    const segment = boundedText(segmentId, 'segmentId');
    return interventions.get(profile)?.get(segment) ?? null;
  }

  function stats(): ProfileStoreStats {
    let baseVersions = 0;
    let derivedVersions = 0;
    const profiles = new Set<string>();
    for (const version of versions.values()) {
      profiles.add(version.profileId);
      if (version.provenance.origin === 'BASE') baseVersions += 1;
      else derivedVersions += 1;
    }
    return Object.freeze({
      version: PROFILE_STORE_VERSION,
      engineVersion,
      disposed,
      versions: versions.size,
      baseVersions,
      derivedVersions,
      profiles: profiles.size,
      interventions: interventionCount(),
      deduplicated: counters.deduplicated,
      rejected: counters.rejected,
      historyLimitRejections: counters.historyLimitRejections,
      clears: counters.clears,
      disposes: counters.disposes,
    });
  }

  function clear(): void {
    if (disposed) return;
    versions.clear();
    order.length = 0;
    interventions.clear();
    counters.clears += 1;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    versions.clear();
    order.length = 0;
    interventions.clear();
    counters.disposes += 1;
  }

  return Object.freeze({
    version: PROFILE_STORE_VERSION,
    engineVersion,
    createBase,
    derive,
    getVersion,
    listVersions,
    getHistory,
    getInterventionVersion,
    stats,
    clear,
    dispose,
  });
}
