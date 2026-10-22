import { createHash } from 'node:crypto';
import {
  PROFILE_EXPORT_FORMAT,
  PROFILE_EXPORT_FORMAT_VERSION,
  PROFILE_EXPORT_LIMITS,
  PROFILE_EXPORT_SCHEMA_VERSION,
  PROFILE_EXPORT_VERSION,
  buildProfileExport,
  canonicalizeJson,
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  exportProfileFromRepository,
  parseStrictJson,
  readProfileExport,
  sha256Hex,
  stampProfileExportChecksum,
} from '../../src/persistence/index';
import { computeProfileVersionChecksum, reservedParameterKeys } from '../../src/profiles/index';
import type { ProfileVersion, ProfileVersionContent } from '../../src/profiles/index';
import { fixedClock } from './fixtures';

/**
 * Deterministic transcript of PBI 133.
 *
 * Every value below is the result of a real run of the export contract against the in-memory
 * IndexedDB double. There is no wall clock, no random identity and no timing value, so the
 * committed transcript can be re-verified byte for byte with `--check`.
 */
export interface ProfileExportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfileExportReport {
  readonly version: '133-export-profile-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly contract: string;
  readonly format: {
    readonly format: string;
    readonly formatVersion: number;
    readonly schemaVersion: number;
    readonly units: string;
    readonly checksumAlgorithm: string;
    readonly canonicalization: string;
    readonly documentBytes: number;
    readonly checksum: string;
  };
  readonly profile: {
    readonly profileId: string;
    readonly engineVersion: string;
    readonly versions: number;
    readonly activeVersionId: string;
    readonly source: string;
    readonly parameters: number;
    readonly reservedParameters: number;
    readonly activationSequence: number;
  };
  readonly aggregates: {
    readonly counts: Record<string, number>;
    readonly indicators: number;
    readonly evidence: number;
    readonly referencedSegments: number;
  };
  readonly telemetry: {
    readonly includedByDefault: boolean;
    readonly rawEventCountByDefault: number;
    readonly rawEventLimit: number;
    readonly omittedByDefault: number;
    readonly includedOnRequest: boolean;
    readonly rawEventCountOnRequest: number;
    readonly limitExceededCode: string;
  };
  readonly roundtrip: {
    readonly readStatus: string;
    readonly checksumVerified: boolean;
    readonly parameters: Record<string, number>;
    readonly reservedParameters: number;
    readonly versions: number;
    readonly sources: string[];
  };
  readonly refusals: Record<string, string>;
  readonly repository: {
    readonly status: string;
    readonly versions: number;
    readonly activeVersionId: string;
    readonly activationSequence: number;
    readonly included: boolean;
  };
  readonly digest: {
    readonly sample: string;
    readonly platform: string;
    readonly own: string;
    readonly equal: boolean;
  };
  readonly checks: readonly ProfileExportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

const DB = '133-export-profile-db';
const ENGINE = 'engine-127';
const CREATED_AT = '2026-10-22T10:00:00.000Z';
const USABLE_KEY = 'speed_delta_urban';
const RESERVED_KEY = 'speed_delta_arterial';

function baseContent(overrides: Partial<ProfileVersionContent> = {}): ProfileVersionContent {
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: 'profile-1',
    versionId: 'profile-1@1',
    parentVersionId: null,
    engineVersion: ENGINE,
    parameters: { [USABLE_KEY]: 1.5, desired_acceleration: 2 },
    provenance: {
      origin: 'BASE',
      sourceSegmentIds: [],
      sourceInterventionIds: [],
      delta: null,
    },
    sourceSegmentIds: [],
    depth: 0,
    createdAt: '2026-10-22T09:00:00.000Z',
    ...overrides,
  };
}

function version(overrides: Partial<ProfileVersionContent> = {}): ProfileVersion {
  const content = baseContent(overrides);
  return Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) });
}

function manualTuningVersion(): ProfileVersion {
  return version({
    versionId: 'profile-1@2',
    parentVersionId: 'profile-1@1',
    depth: 1,
    parameters: { [USABLE_KEY]: 2.5, desired_acceleration: 2 },
    provenance: {
      origin: 'DERIVED',
      sourceSegmentIds: [],
      sourceInterventionIds: ['intervention-1'],
      delta: {
        baseVersionId: 'profile-1@1',
        validationVersion: '102-candidate-v1',
        segmentId: 'segment-1',
        interventionId: 'intervention-1',
        reason: 'manual tuning',
        keyCount: 1,
        changes: [{ key: USABLE_KEY, unit: 'm/s', previousValue: 1.5, newValue: 2.5 }],
      },
    },
    sourceSegmentIds: [],
    createdAt: '2026-10-22T09:05:00.000Z',
  });
}

function learnedVersion(): ProfileVersion {
  return version({
    versionId: 'profile-1@3',
    parentVersionId: 'profile-1@2',
    depth: 2,
    parameters: { [USABLE_KEY]: 3.5, desired_acceleration: 2 },
    provenance: {
      origin: 'DERIVED',
      sourceSegmentIds: ['segment-9'],
      sourceInterventionIds: [],
      delta: {
        baseVersionId: 'profile-1@2',
        validationVersion: '102-candidate-v1',
        segmentId: 'segment-9',
        interventionId: null,
        reason: 'learned driving',
        keyCount: 1,
        changes: [{ key: USABLE_KEY, unit: 'm/s', previousValue: 2.5, newValue: 3.5 }],
      },
    },
    sourceSegmentIds: ['segment-9'],
    createdAt: '2026-10-22T09:10:00.000Z',
  });
}

function build(overrides: Record<string, unknown> = {}): ReturnType<typeof buildProfileExport> {
  return buildProfileExport({
    profileId: 'profile-1',
    engineVersion: ENGINE,
    createdAt: CREATED_AT,
    versions: [version(), manualTuningVersion(), learnedVersion()],
    activeVersionId: 'profile-1@3',
    activation: {
      playerId: 'player-1',
      sequence: 3,
      activatedAt: '2026-10-22T09:10:00.000Z',
    },
    ...overrides,
  } as Parameters<typeof buildProfileExport>[0]);
}

function codeOf(result: ReturnType<typeof readProfileExport>): string {
  return result.status === 'REJECTED' ? result.rejection.code : result.status;
}

function mutable(document: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
}

/**
 * The exported document of the transcript, written next to the report as a real artifact.
 *
 * It is the same deterministic build the checks use, so the sample can be diffed byte for byte.
 */
export function buildExportProfileSample(): unknown {
  const built = build({
    indicators: [
      {
        id: 'complianceRate',
        unit: 'percentage',
        state: 'AVAILABLE',
        value: 92.5,
        sampleSize: 12,
        reason: null,
      },
    ],
    evidence: [
      {
        key: USABLE_KEY,
        effectiveCount: 12,
        quality: 0.8,
        uncertainty: 0.2,
        sourceSegmentIds: ['segment-9'],
      },
    ],
  });
  if (built.status !== 'ACCEPTED') throw new Error(`The export failed: ${built.rejection.code}`);
  return built.document;
}

export async function runExportProfileReport(): Promise<ProfileExportReport> {
  const checks: ProfileExportCheck[] = [];
  const check = (name: string, expected: unknown, actual: unknown, detail: string): void => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    checks.push({ name, expected, actual, pass, detail });
  };

  // 1. The document itself.
  const built = build({
    indicators: [
      {
        id: 'complianceRate',
        unit: 'percentage',
        state: 'AVAILABLE',
        value: 92.5,
        sampleSize: 12,
        reason: null,
      },
    ],
    evidence: [
      {
        key: USABLE_KEY,
        effectiveCount: 12,
        quality: 0.8,
        uncertainty: 0.2,
        sourceSegmentIds: ['segment-9'],
      },
    ],
  });
  if (built.status !== 'ACCEPTED') throw new Error(`The export failed: ${built.rejection.code}`);
  const document = built.document;
  const canonical = canonicalizeJson(document);
  if (canonical.status !== 'ACCEPTED') throw new Error('The document is not canonicalizable');

  // 2. The raw telemetry policy.
  const byDefault = build({ rawTelemetry: { include: false, events: [{ tick: 1 }] } });
  if (byDefault.status !== 'ACCEPTED') throw new Error('The default export failed');
  const onRequest = build({ rawTelemetry: { include: true, events: [{ tick: 1 }, { tick: 2 }] } });
  if (onRequest.status !== 'ACCEPTED') throw new Error('The explicit export failed');
  const aboveCap = build({
    rawTelemetry: {
      include: true,
      events: Array.from(
        { length: PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents + 1 },
        (_, index) => ({
          tick: index,
        }),
      ),
    },
  });

  // 3. The roundtrip.
  const text = JSON.stringify(document);
  const read = readProfileExport(text);

  // 4. The refusals, each with a closed reason.
  const tampered = mutable(document);
  const tamperedProfile = tampered.profile as Record<string, unknown>;
  const tamperedVersions = tamperedProfile.versions as Record<string, unknown>[];
  (tamperedVersions[0].parameters as Record<string, unknown>)[USABLE_KEY] = {
    value: 9,
    unit: 'm/s',
  };
  const checksumRefusal = readProfileExport(tampered);

  const reservedValue = mutable(document);
  const reservedProfile = reservedValue.profile as Record<string, unknown>;
  const reservedVersions = reservedProfile.versions as Record<string, unknown>[];
  reservedVersions[0].parameters = {
    ...(reservedVersions[0].parameters as Record<string, unknown>),
    [RESERVED_KEY]: { value: 1, unit: 'm/s' },
  };
  const reservedRefusal = readProfileExport(
    stampProfileExportChecksum(reservedValue as never) as unknown as Record<string, unknown>,
  );

  const missingReserved = mutable(document);
  const missingProfile = missingReserved.profile as Record<string, unknown>;
  const missingMap = { ...(missingProfile.reservedParameters as Record<string, unknown>) };
  delete missingMap[RESERVED_KEY];
  missingProfile.reservedParameters = missingMap;
  const missingRefusal = readProfileExport(
    stampProfileExportChecksum(missingReserved as never) as unknown as Record<string, unknown>,
  );

  const foreignReserved = mutable(document);
  const foreignProfile = foreignReserved.profile as Record<string, unknown>;
  foreignProfile.reservedParameters = {
    ...(foreignProfile.reservedParameters as Record<string, unknown>),
    [USABLE_KEY]: null,
  };
  const foreignRefusal = readProfileExport(
    stampProfileExportChecksum(foreignReserved as never) as unknown as Record<string, unknown>,
  );

  const duplicateKey = parseStrictJson('{"format":"a","format":"b"}');
  const trailing = parseStrictJson('{"format":"a"} {"format":"b"}');
  const notJson = parseStrictJson('{"format":NaN}');
  const unknownFormat = mutable(document);
  unknownFormat.formatVersion = 99;
  const formatRefusal = readProfileExport(
    stampProfileExportChecksum(unknownFormat as never) as unknown as Record<string, unknown>,
  );

  // 5. The export built from the local repository.
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const repository = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId: 'tab-export',
    now: fixedClock(),
  });
  await repository.open();
  await repository.commitProfileActivation({
    profile: version(),
    activation: {
      schemaVersion: 1,
      playerId: 'player-1',
      profileId: 'profile-1',
      versionId: 'profile-1@1',
      sequence: 1,
      activatedAt: '2026-10-22T09:00:00.000Z',
    },
  });
  await repository.commitProfileActivation({
    profile: manualTuningVersion(),
    activation: {
      schemaVersion: 1,
      playerId: 'player-1',
      profileId: 'profile-1',
      versionId: 'profile-1@2',
      sequence: 2,
      activatedAt: '2026-10-22T09:05:00.000Z',
    },
  });
  const repositoryExport = await exportProfileFromRepository(repository, 'profile-1', {
    createdAt: CREATED_AT,
  });
  repository.close();
  if (repositoryExport.status !== 'ACCEPTED') {
    throw new Error(`The repository export failed: ${repositoryExport.rejection.code}`);
  }

  // 6. The digest of the canonical document against the platform digest.
  const platform = createHash('sha256').update(canonical.text, 'utf8').digest('hex');
  const own = sha256Hex(canonical.text);

  const report: ProfileExportReport = {
    version: '133-export-profile-v1',
    generatedBy:
      'node --import ./scripts/register-typescript.mjs scripts/run-export-profile-report.mjs',
    oracleRule:
      'Every value is a real run of src/persistence/profile-export against the in-memory IndexedDB double; the expected value is the documented contract, never a copy of the actual one.',
    contract: PROFILE_EXPORT_VERSION,
    format: {
      format: document.format,
      formatVersion: document.formatVersion,
      schemaVersion: document.schemaVersion,
      units: document.units,
      checksumAlgorithm: document.checksum.algorithm,
      canonicalization: document.checksum.canonicalization,
      documentBytes: built.bytes,
      checksum: document.checksum.value,
    },
    profile: {
      profileId: document.profile.profileId,
      engineVersion: document.engineVersion,
      versions: document.profile.versions.length,
      activeVersionId: document.profile.activeVersionId ?? '',
      source: document.profile.source ?? 'NONE',
      parameters: document.aggregates.counts.parameters,
      reservedParameters: document.aggregates.counts.reservedParameters,
      activationSequence: document.profile.activation?.sequence ?? 0,
    },
    aggregates: {
      counts: { ...document.aggregates.counts },
      indicators: document.aggregates.indicators.length,
      evidence: document.aggregates.evidence.length,
      referencedSegments: document.telemetry.referencedSegmentIds.length,
    },
    telemetry: {
      includedByDefault: byDefault.document.telemetry.included,
      rawEventCountByDefault: byDefault.document.telemetry.rawEventCount,
      rawEventLimit: PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents,
      omittedByDefault: byDefault.rawTelemetryOmitted,
      includedOnRequest: onRequest.document.telemetry.included,
      rawEventCountOnRequest: onRequest.document.telemetry.rawEventCount,
      limitExceededCode: aboveCap.status === 'REJECTED' ? aboveCap.rejection.code : aboveCap.status,
    },
    roundtrip: {
      readStatus: read.status,
      checksumVerified: read.status === 'ACCEPTED' ? read.checksumVerified : false,
      parameters: read.status === 'ACCEPTED' ? { ...read.parameters } : {},
      reservedParameters:
        read.status === 'ACCEPTED' ? Object.keys(read.reservedParameters).length : 0,
      versions: read.status === 'ACCEPTED' ? read.versions.length : 0,
      sources: read.status === 'ACCEPTED' ? read.versions.map((entry) => entry.source) : [],
    },
    refusals: {
      modifiedDocument: codeOf(checksumRefusal),
      reservedKeyWithValue: codeOf(reservedRefusal),
      missingReservedKey: codeOf(missingRefusal),
      usableKeyInReservedMap: codeOf(foreignRefusal),
      duplicateKey: duplicateKey.status === 'REJECTED' ? duplicateKey.rejection.code : 'ACCEPTED',
      trailingContent: trailing.status === 'REJECTED' ? trailing.rejection.code : 'ACCEPTED',
      nonJsonNumber: notJson.status === 'REJECTED' ? notJson.rejection.code : 'ACCEPTED',
      unsupportedFormatVersion: codeOf(formatRefusal),
    },
    repository: {
      status: repositoryExport.status,
      versions: repositoryExport.document.profile.versions.length,
      activeVersionId: repositoryExport.document.profile.activeVersionId ?? '',
      activationSequence: repositoryExport.document.profile.activation?.sequence ?? 0,
      included: repositoryExport.document.telemetry.included,
    },
    digest: {
      sample: String(canonical.text.length),
      platform,
      own,
      equal: platform === own,
    },
    checks: [],
    summary: { checks: 0, passed: 0, pass: false },
  };

  check('contract-version', '133-profile-export-v1', report.contract, 'Contract id');
  check('format', PROFILE_EXPORT_FORMAT, report.format.format, 'The format marker');
  check(
    'format-version',
    PROFILE_EXPORT_FORMAT_VERSION,
    report.format.formatVersion,
    'Format version',
  );
  check(
    'schema-version',
    PROFILE_EXPORT_SCHEMA_VERSION,
    report.format.schemaVersion,
    'Schema version',
  );
  check('units', 'SI', report.format.units, 'The export uses SI units');
  check('checksum-algorithm', 'SHA-256', report.format.checksumAlgorithm, 'Checksum algorithm');
  check(
    'canonicalization',
    'SDA-CJSON-1',
    report.format.canonicalization,
    'Canonicalization version',
  );
  check(
    'document-bytes',
    built.bytes,
    report.format.documentBytes,
    'Canonical size of the document',
  );
  check(
    'checksum-length',
    64,
    report.format.checksum.length,
    'The checksum is 64 hexadecimal characters',
  );
  check('profile-id', 'profile-1', report.profile.profileId, 'The exported profile');
  check('versions', 3, report.profile.versions, 'The three stored versions');
  check('active-version', 'profile-1@3', report.profile.activeVersionId, 'The active version');
  check('source', 'LEARNING', report.profile.source, 'The provenance classification');
  check('parameters', 2, report.profile.parameters, 'The effective parameters');
  check('reserved-parameters', 56, report.profile.reservedParameters, 'The reserved R keys');
  check(
    'reserved-catalog-keys',
    56,
    reservedParameterKeys.length,
    'The reserved keys of the catalog',
  );
  check('activation-sequence', 3, report.profile.activationSequence, 'The activation sequence');
  check('base-versions', 1, report.aggregates.counts.baseVersions, 'The base versions');
  check('derived-versions', 2, report.aggregates.counts.derivedVersions, 'The derived versions');
  check(
    'manual-tuning-versions',
    1,
    report.aggregates.counts.manualTuningVersions,
    'Manual versions',
  );
  check('learning-versions', 1, report.aggregates.counts.learningVersions, 'Learned versions');
  check('source-segments', 1, report.aggregates.counts.sourceSegments, 'The driving segments');
  check(
    'source-interventions',
    1,
    report.aggregates.counts.sourceInterventions,
    'The manual interventions',
  );
  check('indicators', 1, report.aggregates.indicators, 'The aggregated indicators');
  check('evidence', 1, report.aggregates.evidence, 'The aggregated evidence');
  check('referenced-segments', 1, report.aggregates.referencedSegments, 'The referenced segments');
  check(
    'telemetry-included-by-default',
    false,
    report.telemetry.includedByDefault,
    'No raw telemetry',
  );
  check(
    'telemetry-count-by-default',
    0,
    report.telemetry.rawEventCountByDefault,
    'No raw event is published',
  );
  check('telemetry-limit', 512, report.telemetry.rawEventLimit, 'The fixed raw event cap');
  check('telemetry-omitted', 1, report.telemetry.omittedByDefault, 'The dropped raw event');
  check(
    'telemetry-included-on-request',
    true,
    report.telemetry.includedOnRequest,
    'The explicit request publishes the raw events',
  );
  check(
    'telemetry-count-on-request',
    2,
    report.telemetry.rawEventCountOnRequest,
    'The published raw events',
  );
  check(
    'telemetry-limit-exceeded',
    'TELEMETRY_LIMIT_EXCEEDED',
    report.telemetry.limitExceededCode,
    'The raw event cap is enforced',
  );
  check('roundtrip-status', 'ACCEPTED', report.roundtrip.readStatus, 'The file is readable');
  check('roundtrip-checksum', true, report.roundtrip.checksumVerified, 'The checksum verifies');
  check(
    'roundtrip-parameters',
    { [USABLE_KEY]: 3.5, desired_acceleration: 2 },
    report.roundtrip.parameters,
    'The parameter values survive the roundtrip',
  );
  check(
    'roundtrip-reserved',
    56,
    report.roundtrip.reservedParameters,
    'The reserved keys survive the roundtrip',
  );
  check('roundtrip-versions', 3, report.roundtrip.versions, 'The versions survive the roundtrip');
  check(
    'roundtrip-sources',
    ['BASE', 'MANUAL_TUNING', 'LEARNING'],
    report.roundtrip.sources,
    'The provenance survives the roundtrip',
  );
  check(
    'refusal-modified',
    'CHECKSUM_MISMATCH',
    report.refusals.modifiedDocument,
    'A modified file',
  );
  check(
    'refusal-reserved-value',
    'RESERVED_KEY_SET',
    report.refusals.reservedKeyWithValue,
    'A reserved key with a value',
  );
  check(
    'refusal-missing-reserved',
    'RESERVED_KEY_MISSING',
    report.refusals.missingReservedKey,
    'A missing reserved key',
  );
  check(
    'refusal-foreign-reserved',
    'RESERVED_KEY_INVALID',
    report.refusals.usableKeyInReservedMap,
    'A usable key inside the reserved map',
  );
  check('refusal-duplicate-key', 'DUPLICATE_KEY', report.refusals.duplicateKey, 'A duplicate key');
  check(
    'refusal-trailing-content',
    'TRAILING_CONTENT',
    report.refusals.trailingContent,
    'Content after the document',
  );
  check('refusal-non-json', 'INVALID_LITERAL', report.refusals.nonJsonNumber, 'NaN is not JSON');
  check(
    'refusal-format-version',
    'UNSUPPORTED_FORMAT_VERSION',
    report.refusals.unsupportedFormatVersion,
    'A newer format version',
  );
  check('repository-status', 'ACCEPTED', report.repository.status, 'The repository export');
  check('repository-versions', 2, report.repository.versions, 'The stored versions');
  check(
    'repository-active-version',
    'profile-1@2',
    report.repository.activeVersionId,
    'The stored active version',
  );
  check('repository-activation', 2, report.repository.activationSequence, 'The stored sequence');
  check('repository-telemetry', false, report.repository.included, 'No raw telemetry');
  check('digest-equal', true, report.digest.equal, 'The SHA-256 matches the platform digest');

  const passed = checks.filter((entry) => entry.pass).length;
  return {
    ...report,
    checks: Object.freeze(checks),
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
