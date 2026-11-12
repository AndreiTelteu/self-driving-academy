import { choice, fields, list, nullable, record, requireContract, text } from '../sessions';
import { parameterUnits, parseDrivingProfile, parseParameterEvidence } from './contracts';
import type { DrivingProfile, ParameterEvidence } from './contracts';
import { parameterCatalogData } from './parameter-catalog.generated';
import {
  getParameterDefinition,
  parameterDefinitions,
  validateParameterValue,
} from './parameter-registry';
import type { ParameterStage, ParameterUnit } from './parameter-registry';
import { profileContentHash } from './profile-store';

/**
 * 166 V2 profile schema, versioning and explicit V1 migration.
 *
 * The module owns exactly one new profile record, `ProfileV2`, and the read path that turns a delivered
 * V1 `DrivingProfile` into it. It never invents a learned value: a key that the V1 profile did not
 * carry receives the real 092 catalog default (or stays unset when it is a reserved R key and the
 * caller asks for that policy) and is labelled `DEFAULT`/`UNSET` with the reason.
 *
 * Versioning is explicit in both directions:
 *
 * 1. A profile declares its schema version and its catalog version. A schema version above this
 *    build is refused with `SCHEMA_TOO_NEW` and a catalog version above the build with
 *    `CATALOG_TOO_NEW`, before any value is interpreted.
 * 2. `migrateProfileV1ToV2` keeps every V1 key, unit, value, provenance and evidence unchanged and
 *    records the whole source profile in `migratedFrom`, so `rollbackProfileV2ToV1` returns the
 *    exact V1 profile (same checksum) as long as no new key was authored on top.
 * 3. `projectProfileV2ForUi` answers the second acceptance criterion: for every one of the 80 keys
 *    it names the origin (player-set, inherited from V1, catalog default, unset), the real source,
 *    the 092 support status and the carried evidence, never a plausible substitute.
 */

export const PROFILE_V2_VERSION = '166-profile-v2-v1' as const;
export const PROFILE_V2_CHECKSUM_ALGORITHM = 'fnv1a64' as const;

/** Schema read by this build; documents above it are refused, documents below it are migrated. */
export const PROFILE_SCHEMA_VERSION_V2 = 2 as const;
export const PROFILE_SCHEMA_VERSION_V1 = 1 as const;

/** The 092 catalog this build reads, as `<id>-<schemaVersion>@<updatedOn>`. */
export const PROFILE_CATALOG_VERSION =
  `092-catalog-${parameterCatalogData.schemaVersion}@${parameterCatalogData.updatedOn}` as const;

export interface ProfileCatalogVersion {
  readonly schemaVersion: number;
  readonly updatedOn: string;
}

const catalogVersionPattern = /^092-catalog-(\d+)@(\d{4}-\d{2}-\d{2})$/;

/** Parses a declared catalog version instead of guessing from the record shape. */
export function parseProfileCatalogVersion(value: unknown): ProfileCatalogVersion {
  const raw = text(value);
  const match = catalogVersionPattern.exec(raw);
  requireContract(match !== null, 'Expected a profile catalog version');
  const schemaVersion = Number(match[1]);
  const updatedOn = match[2] as string;
  requireContract(
    Number.isSafeInteger(schemaVersion) && schemaVersion >= 1,
    'Invalid profile catalog schema version',
  );
  requireContract(
    /^\d{4}-\d{2}-\d{2}$/.test(updatedOn) &&
      Number.isFinite(Date.parse(updatedOn)) &&
      new Date(updatedOn).toISOString().slice(0, 10) === updatedOn,
    'Invalid profile catalog date',
  );
  return Object.freeze({ schemaVersion, updatedOn });
}

export function compareProfileCatalogVersions(
  left: ProfileCatalogVersion,
  right: ProfileCatalogVersion,
): number {
  if (left.schemaVersion !== right.schemaVersion)
    return left.schemaVersion < right.schemaVersion ? -1 : 1;
  if (left.updatedOn === right.updatedOn) return 0;
  return left.updatedOn < right.updatedOn ? -1 : 1;
}

const currentCatalogVersion = parseProfileCatalogVersion(PROFILE_CATALOG_VERSION);

/** Where the value of one key comes from. `DEFAULT`/`UNSET` are never learned estimates. */
export const profileV2Origins = ['PLAYER_SET', 'INHERITED_V1', 'DEFAULT', 'UNSET'] as const;
export type ProfileV2Origin = (typeof profileV2Origins)[number];

/** What the build can really do with the key today, derived from the 092 registry. */
export const profileV2SupportStatuses = ['SUPPORTED', 'DEFAULT_ONLY', 'RESERVED'] as const;
export type ProfileV2SupportStatus = (typeof profileV2SupportStatuses)[number];

/** The proof behind the value; `CATALOG_DEFAULT` is a design default, not a measurement. */
export const profileV2EvidenceSources = [
  'PROFILE_EVIDENCE',
  'V1_PROVENANCE',
  'CATALOG_DEFAULT',
  'NONE',
] as const;
export type ProfileV2EvidenceSource = (typeof profileV2EvidenceSources)[number];

export const profileV2ReasonCodes = [
  'V1_PLAYER_VALUE',
  'V1_IMPORTED_VALUE',
  'V1_BASE_VALUE',
  'V1_LEARNED_VALUE',
  'V2_PLAYER_VALUE',
  'CATALOG_DEFAULT',
  'RESERVED_UNSET',
] as const;
export type ProfileV2ReasonCode = (typeof profileV2ReasonCodes)[number];

export const profileV2OriginLabels: Readonly<Record<ProfileV2Origin, string>> = Object.freeze({
  PLAYER_SET: 'setată de jucător',
  INHERITED_V1: 'moștenită din V1',
  DEFAULT: 'default din catalog',
  UNSET: 'nesetată',
});

export const profileV2SupportLabels: Readonly<Record<ProfileV2SupportStatus, string>> =
  Object.freeze({
    SUPPORTED: 'suportat de controlere',
    DEFAULT_ONLY: 'doar default, fără control',
    RESERVED: 'rezervat V1',
  });

export const profileV2EvidenceSourceLabels: Readonly<Record<ProfileV2EvidenceSource, string>> =
  Object.freeze({
    PROFILE_EVIDENCE: 'dovezi din profil',
    V1_PROVENANCE: 'proveniență V1',
    CATALOG_DEFAULT: 'default din catalogul 092',
    NONE: 'nicio dovadă',
  });

export interface ProfileV2Key {
  readonly key: string;
  readonly category: string;
  readonly stage: ParameterStage;
  readonly unit: ParameterUnit;
  /** `null` only for `UNSET`: no value is invented for it. */
  readonly value: number | null;
  readonly origin: ProfileV2Origin;
  /** `v1:<provenance>`, `catalog:<version>#default`, or `null` for an unset key. */
  readonly source: string | null;
  readonly evidence: ParameterEvidence | null;
  readonly evidenceSource: ProfileV2EvidenceSource;
  readonly support: ProfileV2SupportStatus;
  readonly reason: ProfileV2ReasonCode;
  /** Why this key has this value; always a complete Romanian sentence, never empty. */
  readonly detail: string;
}

/** The V1 profile a V2 profile was migrated from, kept verbatim for a lossless rollback. */
export interface ProfileV2MigrationSource {
  readonly schemaVersion: typeof PROFILE_SCHEMA_VERSION_V1;
  readonly catalogVersion: string | null;
  readonly checksum: string;
  readonly keys: readonly string[];
  readonly profile: DrivingProfile;
}

export interface ProfileV2 {
  readonly schemaVersion: typeof PROFILE_SCHEMA_VERSION_V2;
  readonly catalogVersion: string;
  readonly units: 'SI';
  readonly profileId: string;
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly engineVersion: string;
  readonly migratedFrom: ProfileV2MigrationSource | null;
  readonly keys: Readonly<Record<string, ProfileV2Key>>;
  /** Only the keys that carry a value; an `UNSET` key is absent by contract. */
  readonly parameters: Readonly<Record<string, number>>;
  readonly sourceSegmentIds: readonly string[];
  readonly createdAt: string;
  readonly checksum: string;
}

type ProfileV2Content = Omit<ProfileV2, 'checksum'>;
export type { ProfileV2Content };

export const profileV2RejectionCodes = [
  'INVALID_PROFILE',
  'SCHEMA_UNSUPPORTED',
  'SCHEMA_TOO_NEW',
  'CATALOG_UNSUPPORTED',
  'CATALOG_TOO_NEW',
  'UNKNOWN_KEY',
  'UNIT_MISMATCH',
  'VALUE_OUT_OF_RANGE',
  'RESERVED_KEY_IN_V1',
  'CHECKSUM_MISMATCH',
  'ORIGIN_MISMATCH',
  'NOT_MIGRATED',
  'MIGRATION_NOT_REPRESENTABLE',
  'INVALID_OPTION',
] as const;
export type ProfileV2RejectionCode = (typeof profileV2RejectionCodes)[number];

export interface ProfileV2Rejection {
  readonly code: ProfileV2RejectionCode;
  readonly message: string;
  readonly path: string;
}

export interface ProfileV2MigrationAccepted {
  readonly version: typeof PROFILE_V2_VERSION;
  readonly status: 'MIGRATED';
  readonly profile: ProfileV2;
  readonly rejection: null;
}

export interface ProfileV2MigrationRejected {
  readonly version: typeof PROFILE_V2_VERSION;
  readonly status: 'REJECTED';
  readonly profile: null;
  readonly rejection: ProfileV2Rejection;
}

export type ProfileV2MigrationResult = ProfileV2MigrationAccepted | ProfileV2MigrationRejected;

export interface ProfileDocumentCurrent {
  readonly version: typeof PROFILE_V2_VERSION;
  readonly status: 'CURRENT';
  readonly schemaVersion: typeof PROFILE_SCHEMA_VERSION_V2;
  readonly profile: ProfileV2;
  readonly rejection: null;
}

export interface ProfileDocumentMigrated {
  readonly version: typeof PROFILE_V2_VERSION;
  readonly status: 'MIGRATED';
  readonly schemaVersion: typeof PROFILE_SCHEMA_VERSION_V2;
  readonly profile: ProfileV2;
  readonly rejection: null;
}

export interface ProfileDocumentRejected {
  readonly version: typeof PROFILE_V2_VERSION;
  readonly status: 'REJECTED';
  readonly schemaVersion: null;
  readonly profile: null;
  readonly rejection: ProfileV2Rejection;
}

export type ProfileDocumentReadResult =
  ProfileDocumentCurrent | ProfileDocumentMigrated | ProfileDocumentRejected;

/** `DEFAULT` keeps the acceptance criterion; `UNSET` is the honest "no value" policy. */
export interface ProfileMigrationOptions {
  readonly reservedKeys?: 'DEFAULT' | 'UNSET';
}

export interface ProfileV2RollbackAccepted {
  readonly version: typeof PROFILE_V2_VERSION;
  readonly status: 'ROLLED_BACK';
  readonly profile: DrivingProfile;
  readonly rejection: null;
}

export interface ProfileV2RollbackRejected {
  readonly version: typeof PROFILE_V2_VERSION;
  readonly status: 'REJECTED';
  readonly profile: null;
  readonly rejection: ProfileV2Rejection;
}

export type ProfileV2RollbackResult = ProfileV2RollbackAccepted | ProfileV2RollbackRejected;

/* ------------------------------------------------------------------ reading */

const profileV2Fields = [
  'schemaVersion',
  'catalogVersion',
  'units',
  'profileId',
  'versionId',
  'parentVersionId',
  'engineVersion',
  'migratedFrom',
  'keys',
  'parameters',
  'sourceSegmentIds',
  'createdAt',
  'checksum',
] as const;

const profileV1Fields = [
  'schemaVersion',
  'units',
  'profileId',
  'versionId',
  'parentVersionId',
  'engineVersion',
  'parameters',
  'unitsByParameter',
  'provenanceByParameter',
  'evidenceByParameter',
  'sourceSegmentIds',
  'createdAt',
  'checksum',
] as const;

const keyFields = [
  'key',
  'category',
  'stage',
  'unit',
  'value',
  'origin',
  'source',
  'evidence',
  'evidenceSource',
  'support',
  'reason',
  'detail',
] as const;

const migrationFields = ['schemaVersion', 'catalogVersion', 'checksum', 'keys', 'profile'] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readUtcTimestamp(value: unknown): string {
  const raw = text(value);
  requireContract(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw) &&
      Number.isFinite(Date.parse(raw)) &&
      new Date(raw).toISOString() ===
        raw.replace(
          /(?:\.(\d{1,3}))?Z$/,
          (_, fraction: string | undefined) => `.${(fraction ?? '').padEnd(3, '0')}Z`,
        ),
    'Expected valid UTC calendar timestamp',
  );
  return raw;
}

function supportFor(definition: {
  readonly implementationStage: ParameterStage;
  readonly implemented: boolean;
}): ProfileV2SupportStatus {
  if (definition.implementationStage === 'extension') return 'RESERVED';
  return definition.implemented ? 'SUPPORTED' : 'DEFAULT_ONLY';
}

function reasonAllows(origin: ProfileV2Origin, reason: ProfileV2ReasonCode): boolean {
  switch (origin) {
    case 'PLAYER_SET':
      return (
        reason === 'V1_PLAYER_VALUE' ||
        reason === 'V1_IMPORTED_VALUE' ||
        reason === 'V2_PLAYER_VALUE'
      );
    case 'INHERITED_V1':
      return reason === 'V1_BASE_VALUE' || reason === 'V1_LEARNED_VALUE';
    case 'DEFAULT':
      return reason === 'CATALOG_DEFAULT';
    case 'UNSET':
      return reason === 'RESERVED_UNSET';
  }
}

function canonicalEvidence(evidence: ParameterEvidence | null): unknown {
  return evidence === null
    ? null
    : [
        evidence.key,
        evidence.effectiveCount,
        [...evidence.contexts],
        evidence.quality,
        evidence.uncertainty,
        [...evidence.sourceSegmentIds],
        evidence.estimatorVersion,
      ];
}

function sameEvidence(left: ParameterEvidence | null, right: ParameterEvidence | null): boolean {
  return JSON.stringify(canonicalEvidence(left)) === JSON.stringify(canonicalEvidence(right));
}

function canonicalProfileV1(profile: DrivingProfile): unknown {
  const parameters = Object.keys(profile.parameters)
    .sort(compareText)
    .map((key) => [
      key,
      profile.parameters[key],
      profile.unitsByParameter[key],
      profile.provenanceByParameter[key],
      canonicalEvidence(profile.evidenceByParameter[key] ?? null),
    ]);
  return [
    profile.schemaVersion,
    profile.units,
    profile.profileId,
    profile.versionId,
    profile.parentVersionId,
    profile.engineVersion,
    parameters,
    [...profile.sourceSegmentIds],
    profile.createdAt,
    profile.checksum,
  ];
}

/** Deterministic checksum over the whole V2 record, excluding the checksum itself. */
export function computeProfileV2Checksum(content: ProfileV2Content): string {
  const keys = Object.keys(content.keys)
    .sort(compareText)
    .map((key) => {
      const entry = content.keys[key];
      return [
        key,
        entry.category,
        entry.stage,
        entry.unit,
        entry.value,
        entry.origin,
        entry.source,
        canonicalEvidence(entry.evidence),
        entry.evidenceSource,
        entry.support,
        entry.reason,
        entry.detail,
      ];
    });
  const migratedFrom =
    content.migratedFrom === null
      ? null
      : [
          content.migratedFrom.schemaVersion,
          content.migratedFrom.catalogVersion,
          content.migratedFrom.checksum,
          [...content.migratedFrom.keys],
          canonicalProfileV1(content.migratedFrom.profile),
        ];
  const canonical = JSON.stringify([
    PROFILE_V2_VERSION,
    content.schemaVersion,
    content.catalogVersion,
    content.units,
    content.profileId,
    content.versionId,
    content.parentVersionId,
    content.engineVersion,
    [...content.sourceSegmentIds],
    content.createdAt,
    migratedFrom,
    keys,
  ]);
  return `${PROFILE_V2_CHECKSUM_ALGORITHM}:${profileContentHash(canonical)}`;
}

export function verifyProfileV2Checksum(profile: ProfileV2): boolean {
  return computeProfileV2Checksum(profile) === profile.checksum;
}

function readMigrationSource(value: unknown): ProfileV2MigrationSource {
  const data = fields(value, migrationFields);
  requireContract(
    data.schemaVersion === PROFILE_SCHEMA_VERSION_V1,
    'The migration source must be a V1 profile',
  );
  const profile = parseDrivingProfile(data.profile);
  const checksum = text(data.checksum);
  requireContract(checksum === profile.checksum, 'Migration source checksum mismatch');
  const catalogVersion = data.catalogVersion === null ? null : text(data.catalogVersion);
  if (catalogVersion !== null) parseProfileCatalogVersion(catalogVersion);
  const keys = list(data.keys, (entry) => text(entry));
  requireContract(
    new Set(keys).size === keys.length &&
      keys.every((key, index) => index === 0 || keys[index - 1] < key),
    'Migration source keys must be unique and sorted',
  );
  const profileKeys = Object.keys(profile.parameters).sort(compareText);
  requireContract(
    keys.length === profileKeys.length && profileKeys.every((key) => keys.includes(key)),
    'Migration source keys do not match the V1 profile',
  );
  for (const key of keys)
    requireContract(
      getParameterDefinition(key).implementationStage === 'initial_learning_target',
      `A V1 profile cannot carry the R key ${key}`,
    );
  return Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION_V1,
    catalogVersion,
    checksum,
    keys: Object.freeze([...keys]),
    profile,
  });
}

function readProfileV2Key(mapKey: string, value: unknown): ProfileV2Key {
  const data = fields(value, keyFields);
  const key = text(data.key);
  requireContract(key === mapKey, 'Key entry identity mismatch');
  const definition = getParameterDefinition(key);
  const category = text(data.category);
  requireContract(category === definition.category, `Key category disagrees with 092: ${key}`);
  const stage = choice(data.stage, ['initial_learning_target', 'extension'] as const);
  requireContract(stage === definition.implementationStage, `Key stage disagrees with 092: ${key}`);
  const unit = choice(data.unit, parameterUnits);
  requireContract(unit === definition.unit, `Key unit disagrees with 092: ${key}`);
  const support = choice(data.support, profileV2SupportStatuses);
  requireContract(support === supportFor(definition), `Key support disagrees with 092: ${key}`);
  const origin = choice(data.origin, profileV2Origins);
  const held = data.value === null ? null : validateParameterValue(key, data.value, unit);
  requireContract(
    (origin === 'UNSET') === (held === null),
    `UNSET must be the only origin without a value: ${key}`,
  );
  if (held !== null)
    requireContract(
      held === definition.default || origin !== 'DEFAULT',
      `A catalog default must equal the 092 default: ${key}`,
    );
  const evidence = nullable(data.evidence, parseParameterEvidence);
  requireContract(evidence === null || evidence.key === key, `Evidence key mismatch: ${key}`);
  const source = data.source === null ? null : text(data.source);
  const authoredInV2 = source !== null && source.startsWith('v2:');
  requireContract(
    !authoredInV2 || (origin === 'PLAYER_SET' && evidence === null),
    `A V2-authored value is a player value without evidence: ${key}`,
  );
  const evidenceSource = choice(data.evidenceSource, profileV2EvidenceSources);
  const expectedEvidenceSource: ProfileV2EvidenceSource =
    evidence !== null
      ? 'PROFILE_EVIDENCE'
      : origin === 'DEFAULT'
        ? 'CATALOG_DEFAULT'
        : origin === 'UNSET' || authoredInV2
          ? 'NONE'
          : 'V1_PROVENANCE';
  requireContract(
    evidenceSource === expectedEvidenceSource,
    `Evidence source disagrees with the carried evidence: ${key}`,
  );
  const reason = choice(data.reason, profileV2ReasonCodes);
  requireContract(reasonAllows(origin, reason), `Reason disagrees with the origin: ${key}`);
  requireContract(
    reason !== 'V2_PLAYER_VALUE' || authoredInV2,
    `V2_PLAYER_VALUE needs a V2 source: ${key}`,
  );
  if (origin === 'DEFAULT')
    requireContract(
      source === `catalog:${PROFILE_CATALOG_VERSION}#default`,
      `A default value must name the 092 catalog default: ${key}`,
    );
  else if (origin === 'UNSET')
    requireContract(source === null, `An unset key has no source: ${key}`);
  else
    requireContract(
      source !== null && (source.startsWith('v1:') || source === 'v2:MANUAL_TUNING'),
      `A held value must name its provenance: ${key}`,
    );
  return Object.freeze({
    key,
    category,
    stage,
    unit,
    value: held,
    origin,
    source,
    evidence,
    evidenceSource,
    support,
    reason,
    detail: text(data.detail),
  });
}

function readProfileV2Content(value: unknown): ProfileV2Content {
  const data = fields(value, profileV2Fields);
  requireContract(
    data.schemaVersion === PROFILE_SCHEMA_VERSION_V2 && data.units === 'SI',
    'Unsupported profile schema or units',
  );
  const catalogVersion = text(data.catalogVersion);
  requireContract(
    compareProfileCatalogVersions(
      parseProfileCatalogVersion(catalogVersion),
      currentCatalogVersion,
    ) === 0,
    `Unsupported profile catalog version: ${catalogVersion}`,
  );
  const migratedFrom = data.migratedFrom === null ? null : readMigrationSource(data.migratedFrom);
  const rawKeys = record(data.keys);
  requireContract(
    Object.keys(rawKeys).length === parameterDefinitions.length,
    `A V2 profile carries exactly ${parameterDefinitions.length} keys`,
  );
  const keys: Record<string, ProfileV2Key> = Object.create(null);
  for (const definition of parameterDefinitions) {
    requireContract(
      Object.hasOwn(rawKeys, definition.key),
      `Missing V2 profile key: ${definition.key}`,
    );
    keys[definition.key] = readProfileV2Key(definition.key, rawKeys[definition.key]);
  }
  for (const key of Object.keys(rawKeys))
    requireContract(Object.hasOwn(keys, key), `Unknown V2 profile key: ${key}`);

  const rawParameters = record(data.parameters);
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) {
    const entry = keys[definition.key];
    const present = Object.hasOwn(rawParameters, definition.key);
    requireContract(
      present === (entry.value !== null),
      `Parameter map disagrees with key ${definition.key}`,
    );
    if (!present) continue;
    requireContract(
      rawParameters[definition.key] === entry.value,
      `Parameter value disagrees with key ${definition.key}`,
    );
    parameters[definition.key] = entry.value as number;
  }
  for (const key of Object.keys(rawParameters))
    requireContract(
      Object.hasOwn(keys, key) && keys[key].value !== null,
      `Unknown parameter in profile: ${key}`,
    );

  const versionId = text(data.versionId);
  const parentVersionId = nullable(data.parentVersionId, text);
  requireContract(versionId !== parentVersionId, 'Profile cannot be its own parent');
  const sourceSegmentIds = list(data.sourceSegmentIds, text);
  requireContract(
    new Set(sourceSegmentIds).size === sourceSegmentIds.length,
    'Duplicate profile source segments',
  );

  const content: ProfileV2Content = {
    schemaVersion: PROFILE_SCHEMA_VERSION_V2,
    catalogVersion,
    units: 'SI',
    profileId: text(data.profileId),
    versionId,
    parentVersionId,
    engineVersion: text(data.engineVersion),
    migratedFrom,
    keys: Object.freeze(keys),
    parameters: Object.freeze(parameters),
    sourceSegmentIds,
    createdAt: readUtcTimestamp(data.createdAt),
  };
  verifyMigrationLinks(content);
  return Object.freeze(content);
}

/**
 * Cross-checks the migrated content against the preserved V1 profile: inherited keys must carry
 * the real V1 value, unit, provenance and evidence, and a native V2 profile cannot inherit.
 */
function verifyMigrationLinks(content: ProfileV2Content): void {
  const { migratedFrom } = content;
  if (migratedFrom === null) {
    for (const definition of parameterDefinitions)
      requireContract(
        content.keys[definition.key].origin !== 'INHERITED_V1',
        `A native V2 profile cannot inherit V1 values: ${definition.key}`,
      );
    return;
  }
  const sourceKeys = new Set(migratedFrom.keys);
  for (const definition of parameterDefinitions) {
    const key = definition.key;
    const entry = content.keys[key];
    const inherited = entry.origin === 'PLAYER_SET' || entry.origin === 'INHERITED_V1';
    if (!sourceKeys.has(key)) {
      requireContract(
        entry.origin !== 'INHERITED_V1',
        `Key ${key} cannot inherit from a V1 profile that did not carry it`,
      );
      continue;
    }
    requireContract(inherited, `Key ${key} disagrees with the V1 migration source`);
    requireContract(
      entry.value === migratedFrom.profile.parameters[key],
      `Key ${key} changed its V1 value`,
    );
    requireContract(
      entry.unit === migratedFrom.profile.unitsByParameter[key],
      `Key ${key} changed its V1 unit`,
    );
    requireContract(
      entry.source === `v1:${migratedFrom.profile.provenanceByParameter[key]}`,
      `Key ${key} disagrees with the V1 provenance`,
    );
    requireContract(
      sameEvidence(entry.evidence, migratedFrom.profile.evidenceByParameter[key] ?? null),
      `Key ${key} changed its V1 evidence`,
    );
  }
}

/** Strict V2 parser; a malformed record throws the shared contract error. */
export function parseProfileV2(value: unknown): ProfileV2 {
  const data = record(value);
  const content = readProfileV2Content(data);
  const checksum = text(data.checksum);
  requireContract(checksum === computeProfileV2Checksum(content), 'Profile V2 checksum mismatch');
  return Object.freeze({ ...content, checksum });
}

/* ---------------------------------------------------------------- migration */

function rejection(code: ProfileV2RejectionCode, message: string, path = '$'): ProfileV2Rejection {
  return Object.freeze({ code, message, path });
}

function migrationRejected(rejectionValue: ProfileV2Rejection): ProfileV2MigrationRejected {
  return Object.freeze({
    version: PROFILE_V2_VERSION,
    status: 'REJECTED' as const,
    profile: null,
    rejection: rejectionValue,
  });
}

function documentRejected(rejectionValue: ProfileV2Rejection): ProfileDocumentRejected {
  return Object.freeze({
    version: PROFILE_V2_VERSION,
    status: 'REJECTED' as const,
    schemaVersion: null,
    profile: null,
    rejection: rejectionValue,
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid profile payload';
}

function readReservedKeyPolicy(value: unknown): 'DEFAULT' | 'UNSET' {
  if (value === undefined) return 'DEFAULT';
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(key === 'reservedKeys', `Unknown profile migration option: ${key}`);
  if (!Object.hasOwn(data, 'reservedKeys')) return 'DEFAULT';
  return choice(data.reservedKeys, ['DEFAULT', 'UNSET'] as const);
}

/**
 * Refuses a catalog version newer than the build before a value is interpreted, and refuses an
 * older one too: this build only knows the current 092 catalog.
 */
function checkDeclaredCatalog(value: unknown, path: string): ProfileV2Rejection | null {
  if (value === undefined || value === null) return null;
  let declared: ProfileCatalogVersion;
  try {
    declared = parseProfileCatalogVersion(value);
  } catch (error: unknown) {
    return rejection('CATALOG_UNSUPPORTED', messageOf(error), path);
  }
  const comparison = compareProfileCatalogVersions(declared, currentCatalogVersion);
  if (comparison > 0)
    return rejection(
      'CATALOG_TOO_NEW',
      `The profile declares catalog ${String(value)}; this build reads ${PROFILE_CATALOG_VERSION}`,
      path,
    );
  if (comparison < 0)
    return rejection(
      'CATALOG_UNSUPPORTED',
      `The profile declares the unknown catalog ${String(value)}; this build reads ${PROFILE_CATALOG_VERSION}`,
      path,
    );
  return null;
}

type ProfileSource = DrivingProfile['provenanceByParameter'][string];

function originOf(provenance: ProfileSource): ProfileV2Origin {
  return provenance === 'MANUAL_TUNING' || provenance === 'IMPORTED'
    ? 'PLAYER_SET'
    : 'INHERITED_V1';
}

function reasonOf(provenance: ProfileSource): ProfileV2ReasonCode {
  switch (provenance) {
    case 'MANUAL_TUNING':
      return 'V1_PLAYER_VALUE';
    case 'IMPORTED':
      return 'V1_IMPORTED_VALUE';
    case 'LEARNED':
      return 'V1_LEARNED_VALUE';
    case 'BASE':
      return 'V1_BASE_VALUE';
  }
}

function detailOf(provenance: ProfileSource): string {
  switch (provenance) {
    case 'MANUAL_TUNING':
      return 'Valoare setată de jucător în profilul V1 (MANUAL_TUNING); păstrată neschimbată.';
    case 'IMPORTED':
      return 'Valoare adusă prin import în profilul V1 (IMPORTED); păstrată neschimbată.';
    case 'LEARNED':
      return 'Valoare învățată în profilul V1 (LEARNED); dovezile ei rămân istorice și neschimbate.';
    case 'BASE':
      return 'Valoare de bază moștenită din profilul V1 (BASE); păstrată neschimbată.';
  }
}

function defaultDetail(stage: ParameterStage): string {
  return stage === 'extension'
    ? 'Cheie R fără nicio dovadă în profilul V1; primește defaultul din catalogul 092, nu o estimare din date inexistente.'
    : 'Cheie V1 absentă în profil; primește defaultul din catalogul 092, fără o valoare inventată.';
}

const UNSET_DETAIL =
  'Cheie R rezervată pentru V1; rămâne nesetată, cu motiv, fără o valoare plauzibilă inventată.';

function buildProfileV2(content: Omit<ProfileV2Content, 'parameters'>): ProfileV2 {
  const keys: Record<string, ProfileV2Key> = Object.create(null);
  for (const definition of parameterDefinitions)
    keys[definition.key] = content.keys[definition.key];
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) {
    const entry = content.keys[definition.key];
    if (entry.value !== null) parameters[definition.key] = entry.value;
  }
  const frozen: ProfileV2Content = Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION_V2,
    catalogVersion: content.catalogVersion,
    units: 'SI',
    profileId: content.profileId,
    versionId: content.versionId,
    parentVersionId: content.parentVersionId,
    engineVersion: content.engineVersion,
    migratedFrom: content.migratedFrom,
    keys: Object.freeze(keys),
    parameters: Object.freeze(parameters),
    sourceSegmentIds: Object.freeze([...content.sourceSegmentIds]),
    createdAt: content.createdAt,
  });
  return Object.freeze({ ...frozen, checksum: computeProfileV2Checksum(frozen) });
}

function migrate(
  profile: DrivingProfile,
  declaredCatalogVersion: string | null,
  reservedKeys: 'DEFAULT' | 'UNSET',
): ProfileV2MigrationResult {
  for (const key of Object.keys(profile.parameters)) {
    try {
      getParameterDefinition(key);
    } catch {
      return migrationRejected(
        rejection('UNKNOWN_KEY', `Unknown parameter in the V1 profile: ${key}`, 'parameters'),
      );
    }
  }

  const keys: Record<string, ProfileV2Key> = Object.create(null);
  for (const definition of parameterDefinitions) {
    const key = definition.key;
    if (Object.hasOwn(profile.parameters, key)) {
      if (definition.implementationStage === 'extension')
        return migrationRejected(
          rejection(
            'RESERVED_KEY_IN_V1',
            `The R key ${key} cannot appear in a V1 profile; 092 reserves it for V1`,
            `parameters.${key}`,
          ),
        );
      if (profile.unitsByParameter[key] !== definition.unit)
        return migrationRejected(
          rejection(
            'UNIT_MISMATCH',
            `The V1 unit of ${key} is ${profile.unitsByParameter[key]}, not ${definition.unit}`,
            `unitsByParameter.${key}`,
          ),
        );
      let value: number;
      try {
        value = validateParameterValue(key, profile.parameters[key], definition.unit);
      } catch (error: unknown) {
        return migrationRejected(
          rejection('VALUE_OUT_OF_RANGE', messageOf(error), `parameters.${key}`),
        );
      }
      const provenance = profile.provenanceByParameter[key];
      const evidence = profile.evidenceByParameter[key] ?? null;
      keys[key] = Object.freeze({
        key,
        category: definition.category,
        stage: definition.implementationStage,
        unit: definition.unit,
        value,
        origin: originOf(provenance),
        source: `v1:${provenance}`,
        evidence,
        evidenceSource: evidence === null ? 'V1_PROVENANCE' : 'PROFILE_EVIDENCE',
        support: supportFor(definition),
        reason: reasonOf(provenance),
        detail: detailOf(provenance),
      });
      continue;
    }
    if (definition.implementationStage === 'extension' && reservedKeys === 'UNSET') {
      keys[key] = Object.freeze({
        key,
        category: definition.category,
        stage: definition.implementationStage,
        unit: definition.unit,
        value: null,
        origin: 'UNSET' as const,
        source: null,
        evidence: null,
        evidenceSource: 'NONE' as const,
        support: supportFor(definition),
        reason: 'RESERVED_UNSET' as const,
        detail: UNSET_DETAIL,
      });
      continue;
    }
    keys[key] = Object.freeze({
      key,
      category: definition.category,
      stage: definition.implementationStage,
      unit: definition.unit,
      value: validateParameterValue(key, definition.default, definition.unit),
      origin: 'DEFAULT' as const,
      source: `catalog:${PROFILE_CATALOG_VERSION}#default`,
      evidence: null,
      evidenceSource: 'CATALOG_DEFAULT' as const,
      support: supportFor(definition),
      reason: 'CATALOG_DEFAULT' as const,
      detail: defaultDetail(definition.implementationStage),
    });
  }

  const sourceKeys = Object.freeze(Object.keys(profile.parameters).sort(compareText));
  const migratedFrom: ProfileV2MigrationSource = Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION_V1,
    catalogVersion: declaredCatalogVersion,
    checksum: profile.checksum,
    keys: sourceKeys,
    profile,
  });
  const result = buildProfileV2({
    schemaVersion: PROFILE_SCHEMA_VERSION_V2,
    catalogVersion: PROFILE_CATALOG_VERSION,
    units: 'SI',
    profileId: profile.profileId,
    versionId: profile.versionId,
    parentVersionId: profile.parentVersionId,
    engineVersion: profile.engineVersion,
    migratedFrom,
    keys: Object.freeze(keys),
    sourceSegmentIds: profile.sourceSegmentIds,
    createdAt: profile.createdAt,
  });
  return Object.freeze({
    version: PROFILE_V2_VERSION,
    status: 'MIGRATED' as const,
    profile: result,
    rejection: null,
  });
}

/**
 * Migrates one delivered V1 `DrivingProfile` to the V2 schema.
 *
 * Existing keys keep their value, unit, provenance and evidence byte for byte; every key the V1
 * profile did not carry receives the 092 catalog default (or stays unset for an R key when
 * `reservedKeys: 'UNSET'` is requested), always labelled as a default and never as an estimate.
 */
export function migrateProfileV1ToV2(
  value: unknown,
  options?: ProfileMigrationOptions,
): ProfileV2MigrationResult {
  let reservedKeys: 'DEFAULT' | 'UNSET';
  try {
    reservedKeys = readReservedKeyPolicy(options);
  } catch (error: unknown) {
    return migrationRejected(rejection('INVALID_OPTION', messageOf(error), 'options'));
  }

  const data = record(value);
  const schemaVersion = data.schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion))
    return migrationRejected(
      rejection('INVALID_PROFILE', 'Expected an integer schema version', 'schemaVersion'),
    );
  if (schemaVersion > PROFILE_SCHEMA_VERSION_V2)
    return migrationRejected(
      rejection(
        'SCHEMA_TOO_NEW',
        `The profile declares schema ${schemaVersion}; this build reads ${PROFILE_SCHEMA_VERSION_V2}`,
        'schemaVersion',
      ),
    );
  if (schemaVersion !== PROFILE_SCHEMA_VERSION_V1)
    return migrationRejected(
      rejection(
        'SCHEMA_UNSUPPORTED',
        `Only schema ${PROFILE_SCHEMA_VERSION_V1} can be migrated to V2`,
        'schemaVersion',
      ),
    );

  const catalogRejection = checkDeclaredCatalog(data.catalogVersion, 'catalogVersion');
  if (catalogRejection !== null) return migrationRejected(catalogRejection);

  let core: Record<string, unknown>;
  try {
    const allowed =
      data.catalogVersion === undefined ? profileV1Fields : [...profileV1Fields, 'catalogVersion'];
    const checked = fields(data, allowed);
    core = Object.create(null);
    for (const key of profileV1Fields) core[key] = checked[key];
  } catch (error: unknown) {
    return migrationRejected(rejection('INVALID_PROFILE', messageOf(error)));
  }

  let profile: DrivingProfile;
  try {
    profile = parseDrivingProfile(core);
  } catch (error: unknown) {
    return migrationRejected(rejection('INVALID_PROFILE', messageOf(error)));
  }
  const declaredCatalogVersion =
    data.catalogVersion === undefined ? null : text(data.catalogVersion);
  return migrate(profile, declaredCatalogVersion, reservedKeys);
}

/* -------------------------------------------------------------- read + rollback */

/**
 * Reads any profile payload in the versioned schema: a current V2 record is accepted as-is, a
 * V1 record is migrated explicitly, and a record this build cannot interpret is refused with a
 * closed code before a single value is used.
 */
export function readProfileDocument(
  value: unknown,
  options?: ProfileMigrationOptions,
): ProfileDocumentReadResult {
  let data: Record<string, unknown>;
  try {
    data = record(value);
  } catch (error: unknown) {
    return documentRejected(rejection('INVALID_PROFILE', messageOf(error)));
  }
  const schemaVersion = data.schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1)
    return documentRejected(
      rejection('INVALID_PROFILE', 'Expected an integer schema version', 'schemaVersion'),
    );
  if (schemaVersion > PROFILE_SCHEMA_VERSION_V2)
    return documentRejected(
      rejection(
        'SCHEMA_TOO_NEW',
        `The profile declares schema ${schemaVersion}; this build reads ${PROFILE_SCHEMA_VERSION_V2}`,
        'schemaVersion',
      ),
    );

  if (schemaVersion === PROFILE_SCHEMA_VERSION_V1) {
    const migrated = migrateProfileV1ToV2(value, options);
    if (migrated.status === 'REJECTED') return documentRejected(migrated.rejection);
    return Object.freeze({
      version: PROFILE_V2_VERSION,
      status: 'MIGRATED' as const,
      schemaVersion: PROFILE_SCHEMA_VERSION_V2,
      profile: migrated.profile,
      rejection: null,
    });
  }

  if (schemaVersion !== PROFILE_SCHEMA_VERSION_V2)
    return documentRejected(
      rejection(
        'SCHEMA_UNSUPPORTED',
        `Unsupported profile schema version: ${schemaVersion}`,
        'schemaVersion',
      ),
    );
  const catalogRejection = checkDeclaredCatalog(data.catalogVersion, 'catalogVersion');
  if (catalogRejection !== null) return documentRejected(catalogRejection);
  let content: ProfileV2Content;
  try {
    content = readProfileV2Content(data);
  } catch (error: unknown) {
    return documentRejected(rejection('INVALID_PROFILE', messageOf(error)));
  }
  let checksum: string;
  try {
    checksum = text(data.checksum);
  } catch (error: unknown) {
    return documentRejected(rejection('CHECKSUM_MISMATCH', messageOf(error), 'checksum'));
  }
  if (checksum !== computeProfileV2Checksum(content))
    return documentRejected(
      rejection('CHECKSUM_MISMATCH', 'The V2 profile does not match its checksum', 'checksum'),
    );
  return Object.freeze({
    version: PROFILE_V2_VERSION,
    status: 'CURRENT' as const,
    schemaVersion: PROFILE_SCHEMA_VERSION_V2,
    profile: Object.freeze({ ...content, checksum }),
    rejection: null,
  });
}

/**
 * Returns the exact V1 profile A V2 profile was migrated from.
 *
 * Defaults are not V1 data, so they are simply dropped; a V2 key authored on top of the migration
 * cannot be represented in V1 and the rollback is refused instead of losing it silently.
 */
export function rollbackProfileV2ToV1(value: unknown): ProfileV2RollbackResult {
  let profile: ProfileV2;
  try {
    profile = parseProfileV2(value);
  } catch (error: unknown) {
    return Object.freeze({
      version: PROFILE_V2_VERSION,
      status: 'REJECTED' as const,
      profile: null,
      rejection: rejection('INVALID_PROFILE', messageOf(error)),
    });
  }
  if (profile.migratedFrom === null)
    return Object.freeze({
      version: PROFILE_V2_VERSION,
      status: 'REJECTED' as const,
      profile: null,
      rejection: rejection(
        'NOT_MIGRATED',
        'The V2 profile was not migrated from V1',
        'migratedFrom',
      ),
    });
  const sourceKeys = new Set(profile.migratedFrom.keys);
  for (const definition of parameterDefinitions) {
    const entry = profile.keys[definition.key];
    if (
      (entry.origin === 'PLAYER_SET' || entry.origin === 'INHERITED_V1') &&
      !sourceKeys.has(definition.key)
    )
      return Object.freeze({
        version: PROFILE_V2_VERSION,
        status: 'REJECTED' as const,
        profile: null,
        rejection: rejection(
          'MIGRATION_NOT_REPRESENTABLE',
          `The V2 key ${definition.key} has a value that V1 cannot represent`,
          `keys.${definition.key}`,
        ),
      });
  }
  return Object.freeze({
    version: PROFILE_V2_VERSION,
    status: 'ROLLED_BACK' as const,
    profile: profile.migratedFrom.profile,
    rejection: null,
  });
}

/* ------------------------------------------------------------- UI projection */

export interface ProfileV2UiKey {
  readonly key: string;
  readonly category: string;
  readonly label: string;
  readonly stage: ParameterStage;
  readonly unit: ParameterUnit;
  readonly value: number | null;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly origin: ProfileV2Origin;
  readonly originLabel: string;
  readonly source: string | null;
  readonly support: ProfileV2SupportStatus;
  readonly supportLabel: string;
  readonly reserved: boolean;
  readonly evidenceSource: ProfileV2EvidenceSource;
  readonly evidenceSourceLabel: string;
  readonly evidenceCount: number;
  readonly quality: number;
  readonly uncertainty: number;
  readonly contexts: readonly string[];
  readonly reason: ProfileV2ReasonCode;
  readonly detail: string;
}

export interface ProfileV2Summary {
  readonly keys: number;
  readonly v1Keys: number;
  readonly v2Keys: number;
  readonly playerSet: number;
  readonly inherited: number;
  readonly default: number;
  readonly unset: number;
  readonly supported: number;
  readonly defaultOnly: number;
  readonly reserved: number;
  readonly withEvidence: number;
  readonly checksum: string;
}

/**
 * One row per catalog key, in catalog order. This is the UI projection required by the second
 * acceptance criterion: value, origin, source, support and evidence are always present together.
 */
export function projectProfileV2ForUi(profile: ProfileV2): readonly ProfileV2UiKey[] {
  const rows: ProfileV2UiKey[] = [];
  for (const definition of parameterDefinitions) {
    const entry = profile.keys[definition.key];
    if (entry === undefined) throw new Error(`Missing V2 profile key: ${definition.key}`);
    rows.push(
      Object.freeze({
        key: entry.key,
        category: entry.category,
        label: definition.description,
        stage: entry.stage,
        unit: entry.unit,
        value: entry.value,
        defaultValue: definition.default,
        min: definition.min,
        max: definition.max,
        origin: entry.origin,
        originLabel: profileV2OriginLabels[entry.origin],
        source: entry.source,
        support: entry.support,
        supportLabel: profileV2SupportLabels[entry.support],
        reserved: entry.stage === 'extension',
        evidenceSource: entry.evidenceSource,
        evidenceSourceLabel: profileV2EvidenceSourceLabels[entry.evidenceSource],
        evidenceCount: entry.evidence?.effectiveCount ?? 0,
        quality: entry.evidence?.quality ?? 0,
        uncertainty: entry.evidence?.uncertainty ?? 0,
        contexts: entry.evidence?.contexts ?? Object.freeze([]),
        reason: entry.reason,
        detail: entry.detail,
      }),
    );
  }
  return Object.freeze(rows);
}

export function summarizeProfileV2(profile: ProfileV2): ProfileV2Summary {
  let v1Keys = 0;
  let v2Keys = 0;
  const counts: Record<ProfileV2Origin, number> = {
    PLAYER_SET: 0,
    INHERITED_V1: 0,
    DEFAULT: 0,
    UNSET: 0,
  };
  const support: Record<ProfileV2SupportStatus, number> = {
    SUPPORTED: 0,
    DEFAULT_ONLY: 0,
    RESERVED: 0,
  };
  let withEvidence = 0;
  for (const definition of parameterDefinitions) {
    const entry = profile.keys[definition.key];
    if (definition.implementationStage === 'initial_learning_target') v1Keys += 1;
    else v2Keys += 1;
    counts[entry.origin] += 1;
    support[entry.support] += 1;
    if (entry.evidence !== null) withEvidence += 1;
  }
  return Object.freeze({
    keys: parameterDefinitions.length,
    v1Keys,
    v2Keys,
    playerSet: counts.PLAYER_SET,
    inherited: counts.INHERITED_V1,
    default: counts.DEFAULT,
    unset: counts.UNSET,
    supported: support.SUPPORTED,
    defaultOnly: support.DEFAULT_ONLY,
    reserved: support.RESERVED,
    withEvidence,
    checksum: profile.checksum,
  });
}
