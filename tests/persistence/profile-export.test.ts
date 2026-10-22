import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  PROFILE_EXPORT_FORMAT,
  PROFILE_EXPORT_FORMAT_VERSION,
  PROFILE_EXPORT_LIMITS,
  PROFILE_EXPORT_VERSION,
  buildProfileExport,
  canonicalizeJson,
  computeProfileExportChecksum,
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  exportProfileFromRepository,
  parseStrictJson,
  readProfileExport,
  sha256Hex,
  stampProfileExportChecksum,
} from '../../src/persistence/index';
import type {
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
} from '../../src/persistence/index';
import { computeProfileVersionChecksum, reservedParameterKeys } from '../../src/profiles/index';
import type { ProfileVersion, ProfileVersionContent } from '../../src/profiles/index';
import { fixedClock } from './fixtures';

const DB = '133-profile-export-db';
const ENGINE = 'engine-127';
const CREATED_AT = '2026-10-22T10:00:00.000Z';
/** A usable (M) key of the 092 catalog. */
const USABLE_KEY = 'speed_delta_urban';
/** A reserved (R/`extension`) key of the 092 catalog. */
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

/** A derived version produced by a manual intervention. */
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

/** A derived version produced from learned driving. */
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

function build(
  overrides: Partial<Parameters<typeof buildProfileExport>[0]> = {},
): ReturnType<typeof buildProfileExport> {
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
  });
}

function accepted(): ReturnType<typeof buildProfileExport> & { status: 'ACCEPTED' } {
  const result = build();
  assert.equal(result.status, 'ACCEPTED');
  if (result.status !== 'ACCEPTED') throw new Error('unreachable');
  return result;
}

/** A mutable copy of the document, so a test can tamper with it. */
function mutableDocument(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(accepted().document)) as Record<string, unknown>;
}

function restamp(document: Record<string, unknown>): Record<string, unknown> {
  return stampProfileExportChecksum(document as never) as unknown as Record<string, unknown>;
}

test('the export document declares its format, its schema and its versions', () => {
  const result = accepted();
  const document = result.document;
  assert.equal(PROFILE_EXPORT_VERSION, '133-profile-export-v1');
  assert.equal(document.format, PROFILE_EXPORT_FORMAT);
  assert.equal(document.formatVersion, PROFILE_EXPORT_FORMAT_VERSION);
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.units, 'SI');
  assert.equal(document.createdAt, CREATED_AT);
  assert.equal(document.engineVersion, ENGINE);
  assert.equal(document.profile.profileId, 'profile-1');
  assert.equal(document.profile.activeVersionId, 'profile-1@3');
  assert.equal(document.profile.source, 'LEARNING');
  assert.equal(document.profile.versions.length, 3);
  assert.equal(document.profile.versions[0].depth, 0);
  assert.equal(document.profile.versions[0].parentVersionId, null);
  assert.equal(document.profile.versions[2].parentVersionId, 'profile-1@2');
  assert.equal(document.profile.activation?.sequence, 3);
  assert.equal(document.profile.activation?.playerId, 'player-1');
  assert.equal(document.checksum.algorithm, 'SHA-256');
  assert.equal(document.checksum.canonicalization, 'SDA-CJSON-1');
  assert.match(document.checksum.value, /^[0-9a-f]{64}$/);
});

test('the provenance of every version is kept', () => {
  const document = accepted().document;
  const [base, manual, learned] = document.profile.versions;
  assert.equal(base.source, 'BASE');
  assert.equal(base.provenance.origin, 'BASE');
  assert.equal(base.provenance.delta, null);
  assert.equal(manual.source, 'MANUAL_TUNING');
  assert.deepEqual(manual.provenance.sourceInterventionIds, ['intervention-1']);
  assert.equal(manual.provenance.delta?.keyCount, 1);
  assert.equal(manual.provenance.delta?.changes[0].key, USABLE_KEY);
  assert.equal(manual.provenance.delta?.changes[0].previousValue, 1.5);
  assert.equal(manual.provenance.delta?.changes[0].newValue, 2.5);
  assert.equal(learned.source, 'LEARNING');
  assert.deepEqual(learned.provenance.sourceSegmentIds, ['segment-9']);
});

test('the export is deterministic', () => {
  const first = accepted();
  const second = accepted();
  assert.equal(first.checksum, second.checksum);
  assert.equal(first.bytes, second.bytes);
  const canonicalFirst = canonicalizeJson(first.document);
  const canonicalSecond = canonicalizeJson(second.document);
  assert.equal(canonicalFirst.status, 'ACCEPTED');
  assert.equal(canonicalSecond.status, 'ACCEPTED');
  if (canonicalFirst.status !== 'ACCEPTED' || canonicalSecond.status !== 'ACCEPTED') {
    throw new Error('unreachable');
  }
  assert.equal(canonicalFirst.text, canonicalSecond.text);
});

test('the checksum of the document is the SHA-256 of the canonical payload', () => {
  const document = accepted().document;
  const canonical = canonicalizeJson({
    format: document.format,
    formatVersion: document.formatVersion,
    schemaVersion: document.schemaVersion,
    units: document.units,
    createdAt: document.createdAt,
    engineVersion: document.engineVersion,
    profile: document.profile,
    aggregates: document.aggregates,
    telemetry: document.telemetry,
  });
  assert.equal(canonical.status, 'ACCEPTED');
  if (canonical.status !== 'ACCEPTED') throw new Error('unreachable');
  const expected = createHash('sha256').update(canonical.text, 'utf8').digest('hex');
  assert.equal(document.checksum.value, expected);
  assert.equal(computeProfileExportChecksum(document), expected);
});

test('the SHA-256 implementation matches the platform digest', () => {
  const samples = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(1000), 'ünïcodé ✓'];
  for (const sample of samples) {
    assert.equal(
      sha256Hex(sample),
      createHash('sha256').update(sample, 'utf8').digest('hex'),
      `sha256 mismatch for a ${sample.length} code unit sample`,
    );
  }
});

test('the canonicalization sorts the keys and keeps the array order', () => {
  const canonical = canonicalizeJson({ b: 1, a: [3, 1, 2], c: { z: 1, y: 2 } });
  assert.equal(canonical.status, 'ACCEPTED');
  if (canonical.status !== 'ACCEPTED') throw new Error('unreachable');
  assert.equal(canonical.text, '{"a":[3,1,2],"b":1,"c":{"y":2,"z":1}}');
});

test('the reserved keys are published as null and never as a value', () => {
  const document = accepted().document;
  const reserved = document.profile.reservedParameters;
  assert.equal(Object.keys(reserved).length, reservedParameterKeys.length);
  assert.equal(reservedParameterKeys.length, 56);
  assert.ok(reservedParameterKeys.includes(RESERVED_KEY));
  for (const key of Object.keys(reserved)) {
    assert.equal(reserved[key], null, `${key} must stay null`);
  }
  for (const version of document.profile.versions) {
    assert.equal(Object.hasOwn(version.parameters, RESERVED_KEY), false);
  }
  assert.equal(Object.hasOwn(document.profile.versions[2].parameters, USABLE_KEY), true);
});

test('the export refuses a profile that values a reserved key', () => {
  const result = buildProfileExport({
    profileId: 'profile-1',
    engineVersion: ENGINE,
    createdAt: CREATED_AT,
    versions: [version({ parameters: { [RESERVED_KEY]: 1 } })],
    activeVersionId: 'profile-1@1',
    activation: null,
  });
  assert.equal(result.status, 'REJECTED');
  if (result.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(result.rejection.code, 'RESERVED_KEY_SET');
});

test('the reader refuses a reserved key with a value', () => {
  const document = mutableDocument();
  const profile = document.profile as Record<string, unknown>;
  const versions = profile.versions as Record<string, unknown>[];
  versions[0].parameters = {
    ...(versions[0].parameters as Record<string, unknown>),
    [RESERVED_KEY]: { value: 1, unit: 'm/s' },
  };
  const read = readProfileExport(restamp(document));
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'RESERVED_KEY_SET');
});

test('the reader refuses a missing reserved key', () => {
  const document = mutableDocument();
  const profile = document.profile as Record<string, unknown>;
  const reserved = { ...(profile.reservedParameters as Record<string, unknown>) };
  delete reserved[RESERVED_KEY];
  profile.reservedParameters = reserved;
  const read = readProfileExport(restamp(document));
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'RESERVED_KEY_MISSING');
});

test('the reader refuses a usable key inside the reserved map', () => {
  const document = mutableDocument();
  const profile = document.profile as Record<string, unknown>;
  profile.reservedParameters = {
    ...(profile.reservedParameters as Record<string, unknown>),
    [USABLE_KEY]: null,
  };
  const read = readProfileExport(restamp(document));
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'RESERVED_KEY_INVALID');
});

test('the roundtrip keeps the parameter values and the reserved keys', () => {
  const document = accepted().document;
  const text = JSON.stringify(document);
  const read = readProfileExport(text);
  assert.equal(read.status, 'ACCEPTED');
  if (read.status !== 'ACCEPTED') throw new Error('unreachable');
  assert.equal(read.checksumVerified, true);
  assert.deepEqual({ ...read.parameters }, { [USABLE_KEY]: 3.5, desired_acceleration: 2 });
  assert.deepEqual(Object.keys(read.reservedParameters).sort(), [...reservedParameterKeys].sort());
  for (const key of Object.keys(read.reservedParameters)) {
    assert.equal(read.reservedParameters[key], null);
  }
  assert.equal(read.versions.length, 3);
  assert.equal(read.versions[2].versionId, 'profile-1@3');
  assert.equal(read.versions[2].source, 'LEARNING');
  assert.deepEqual(
    { ...read.versions[0].parameters },
    { [USABLE_KEY]: 1.5, desired_acceleration: 2 },
  );
  assert.deepEqual(
    { ...read.versions[2].parameters },
    { [USABLE_KEY]: 3.5, desired_acceleration: 2 },
  );
});

test('a modified document is refused before it is interpreted', () => {
  const document = mutableDocument();
  const profile = document.profile as Record<string, unknown>;
  const versions = profile.versions as Record<string, unknown>[];
  const parameters = versions[0].parameters as Record<string, unknown>;
  parameters[USABLE_KEY] = { value: 9, unit: 'm/s' };
  const read = readProfileExport(document);
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'CHECKSUM_MISMATCH');
});

test('a restamped document still fails the 109 checksum of the version', () => {
  const document = mutableDocument();
  const profile = document.profile as Record<string, unknown>;
  const versions = profile.versions as Record<string, unknown>[];
  const parameters = versions[0].parameters as Record<string, unknown>;
  parameters[USABLE_KEY] = { value: 9, unit: 'm/s' };
  const read = readProfileExport(restamp(document));
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'PROFILE_CHECKSUM_MISMATCH');
});

test('the reader refuses an unknown parameter, a wrong unit and a value out of range', () => {
  const unknown = mutableDocument();
  const unknownProfile = unknown.profile as Record<string, unknown>;
  const unknownVersions = unknownProfile.versions as Record<string, unknown>[];
  unknownVersions[0].parameters = {
    ...(unknownVersions[0].parameters as Record<string, unknown>),
    not_a_catalog_key: { value: 1, unit: 'm/s' },
  };
  const unknownRead = readProfileExport(restamp(unknown));
  assert.equal(unknownRead.status, 'REJECTED');
  if (unknownRead.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(unknownRead.rejection.code, 'UNKNOWN_PARAMETER');

  const unit = mutableDocument();
  const unitProfile = unit.profile as Record<string, unknown>;
  const unitVersions = unitProfile.versions as Record<string, unknown>[];
  const unitParameters = unitVersions[0].parameters as Record<string, unknown>;
  unitParameters[USABLE_KEY] = { value: 1.5, unit: 's' };
  const unitRead = readProfileExport(restamp(unit));
  assert.equal(unitRead.status, 'REJECTED');
  if (unitRead.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(unitRead.rejection.code, 'UNIT_MISMATCH');

  const range = mutableDocument();
  const rangeProfile = range.profile as Record<string, unknown>;
  const rangeVersions = rangeProfile.versions as Record<string, unknown>[];
  const rangeParameters = rangeVersions[0].parameters as Record<string, unknown>;
  rangeParameters[USABLE_KEY] = { value: 999, unit: 'm/s' };
  const rangeRead = readProfileExport(restamp(range));
  assert.equal(rangeRead.status, 'REJECTED');
  if (rangeRead.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(rangeRead.rejection.code, 'VALUE_OUT_OF_RANGE');
});

test('the reader refuses an unsupported format, an unknown field and a broken reference', () => {
  const format = mutableDocument();
  format.formatVersion = 2;
  const formatRead = readProfileExport(restamp(format));
  assert.equal(formatRead.status, 'REJECTED');
  if (formatRead.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(formatRead.rejection.code, 'UNSUPPORTED_FORMAT_VERSION');

  const unknownField = mutableDocument();
  unknownField.extra = true;
  const unknownRead = readProfileExport(restamp(unknownField));
  assert.equal(unknownRead.status, 'REJECTED');
  if (unknownRead.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(unknownRead.rejection.code, 'UNKNOWN_FIELD');

  const reference = mutableDocument();
  const referenceProfile = reference.profile as Record<string, unknown>;
  referenceProfile.activeVersionId = 'profile-1@404';
  const referenceRead = readProfileExport(restamp(reference));
  assert.equal(referenceRead.status, 'REJECTED');
  if (referenceRead.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(referenceRead.rejection.code, 'REFERENCE_MISSING');
});

test('the export never publishes the raw telemetry by itself', () => {
  const marker = 'raw-telemetry-marker';
  const withoutRequest = build({ rawTelemetry: { include: false, events: [{ marker }] } });
  assert.equal(withoutRequest.status, 'ACCEPTED');
  if (withoutRequest.status !== 'ACCEPTED') throw new Error('unreachable');
  assert.equal(withoutRequest.document.telemetry.included, false);
  assert.equal(withoutRequest.document.telemetry.rawEventCount, 0);
  assert.equal(withoutRequest.document.telemetry.rawEvents.length, 0);
  assert.equal(withoutRequest.rawTelemetryIncluded, false);
  assert.equal(withoutRequest.rawTelemetryOmitted, 1);
  assert.equal(JSON.stringify(withoutRequest.document).includes(marker), false);

  const plain = build();
  assert.equal(plain.status, 'ACCEPTED');
  if (plain.status !== 'ACCEPTED') throw new Error('unreachable');
  assert.equal(plain.document.telemetry.included, false);
  assert.equal(plain.document.telemetry.rawEventCount, 0);
});

test('the raw telemetry is published only on request and only under the cap', () => {
  const marker = 'raw-telemetry-marker';
  const requested = build({ rawTelemetry: { include: true, events: [{ marker, tick: 12 }] } });
  assert.equal(requested.status, 'ACCEPTED');
  if (requested.status !== 'ACCEPTED') throw new Error('unreachable');
  assert.equal(requested.document.telemetry.included, true);
  assert.equal(requested.document.telemetry.rawEventCount, 1);
  assert.equal(
    requested.document.telemetry.rawEventLimit,
    PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents,
  );
  assert.equal(JSON.stringify(requested.document).includes(marker), true);

  const events = Array.from(
    { length: PROFILE_EXPORT_LIMITS.maxRawTelemetryEvents + 1 },
    (_, index) => ({
      tick: index,
    }),
  );
  const above = build({ rawTelemetry: { include: true, events } });
  assert.equal(above.status, 'REJECTED');
  if (above.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(above.rejection.code, 'TELEMETRY_LIMIT_EXCEEDED');
});

test('the reader refuses a document that claims raw telemetry it does not carry', () => {
  const document = mutableDocument();
  const telemetry = document.telemetry as Record<string, unknown>;
  telemetry.rawEventCount = 3;
  const read = readProfileExport(restamp(document));
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'TELEMETRY_STATE_MISMATCH');
});

test('the strict reader refuses duplicate keys, trailing content and non JSON numbers', () => {
  const duplicate = parseStrictJson('{"a":1,"a":2}');
  assert.equal(duplicate.status, 'REJECTED');
  if (duplicate.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(duplicate.rejection.code, 'DUPLICATE_KEY');

  const trailing = parseStrictJson('{"a":1} {"b":2}');
  assert.equal(trailing.status, 'REJECTED');
  if (trailing.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(trailing.rejection.code, 'TRAILING_CONTENT');

  const notANumber = parseStrictJson('{"a":NaN}');
  assert.equal(notANumber.status, 'REJECTED');
  if (notANumber.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(notANumber.rejection.code, 'INVALID_LITERAL');

  const infinity = parseStrictJson('{"a":Infinity}');
  assert.equal(infinity.status, 'REJECTED');
  if (infinity.status !== 'REJECTED') throw new Error('unreachable');

  const oversized = parseStrictJson(`{"a":"${'x'.repeat(PROFILE_EXPORT_LIMITS.maxFileBytes)}"}`);
  assert.equal(oversized.status, 'REJECTED');
  if (oversized.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(oversized.rejection.code, 'FILE_TOO_LARGE');

  let deep = '1';
  for (let index = 0; index <= PROFILE_EXPORT_LIMITS.maxDepth + 1; index += 1) deep = `[${deep}]`;
  const tooDeep = parseStrictJson(deep);
  assert.equal(tooDeep.status, 'REJECTED');
  if (tooDeep.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(tooDeep.rejection.code, 'DEPTH_EXCEEDED');
});

test('the reader refuses a file that is not a profile export', () => {
  const read = readProfileExport('{"hello":"world"}');
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'UNKNOWN_FIELD');
});

test('a history with a hole is refused', () => {
  const result = buildProfileExport({
    profileId: 'profile-1',
    engineVersion: ENGINE,
    createdAt: CREATED_AT,
    versions: [manualTuningVersion()],
    activeVersionId: 'profile-1@2',
    activation: null,
  });
  assert.equal(result.status, 'REJECTED');
  if (result.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(result.rejection.code, 'HISTORY_INCOMPLETE');
});

test('the aggregates carry the counters and the injected indicators', () => {
  const result = build({
    indicators: [
      {
        id: 'complianceRate',
        unit: 'percentage',
        state: 'AVAILABLE',
        value: 92.5,
        sampleSize: 12,
        reason: null,
      },
      {
        id: 'violationRate',
        unit: 'percentage',
        state: 'UNAVAILABLE',
        value: null,
        sampleSize: null,
        reason: 'NO_OPPORTUNITIES',
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
  assert.equal(result.status, 'ACCEPTED');
  if (result.status !== 'ACCEPTED') throw new Error('unreachable');
  const aggregates = result.document.aggregates;
  assert.equal(aggregates.counts.versions, 3);
  assert.equal(aggregates.counts.baseVersions, 1);
  assert.equal(aggregates.counts.derivedVersions, 2);
  assert.equal(aggregates.counts.manualTuningVersions, 1);
  assert.equal(aggregates.counts.learningVersions, 1);
  assert.equal(aggregates.counts.parameters, 2);
  assert.equal(aggregates.counts.reservedParameters, 56);
  assert.equal(aggregates.counts.sourceSegments, 1);
  assert.equal(aggregates.counts.sourceInterventions, 1);
  assert.equal(aggregates.indicators.length, 2);
  assert.equal(aggregates.indicators[0].value, 92.5);
  assert.equal(aggregates.indicators[1].state, 'UNAVAILABLE');
  assert.equal(aggregates.indicators[1].reason, 'NO_OPPORTUNITIES');
  assert.equal(aggregates.evidence[0].key, USABLE_KEY);
  assert.equal(aggregates.evidence[0].effectiveCount, 12);
});

test('the reader refuses a document whose counters do not match the profile', () => {
  const document = mutableDocument();
  const aggregates = document.aggregates as Record<string, unknown>;
  const counts = { ...(aggregates.counts as Record<string, unknown>) };
  counts.versions = 99;
  aggregates.counts = counts;
  const read = readProfileExport(restamp(document));
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'AGGREGATE_MISMATCH');
});

test('the reader refuses evidence about a reserved key', () => {
  const document = mutableDocument();
  const aggregates = document.aggregates as Record<string, unknown>;
  aggregates.evidence = [
    {
      key: RESERVED_KEY,
      effectiveCount: 3,
      quality: 0.5,
      uncertainty: 0.5,
      sourceSegmentIds: ['segment-9'],
    },
  ];
  const read = readProfileExport(restamp(document));
  assert.equal(read.status, 'REJECTED');
  if (read.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(read.rejection.code, 'RESERVED_KEY_SET');
});

interface Harness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly repository: LocalRepository;
}

async function opened(tabId: string): Promise<Harness> {
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const repository = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId,
    now: fixedClock(),
  });
  const report = await repository.open();
  assert.equal(report.status, 'READY');
  return { factory, locks, repository };
}

test('the repository export carries the stored history and the activation', async () => {
  const harness = await opened('tab-repository');
  const stored = harness.repository;
  const committed = await stored.commitProfileActivation({
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
  assert.equal(committed.status, 'COMMITTED');
  const second = await stored.commitProfileActivation({
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
  assert.equal(second.status, 'COMMITTED');

  const result = await exportProfileFromRepository(stored, 'profile-1', { createdAt: CREATED_AT });
  assert.equal(result.status, 'ACCEPTED');
  if (result.status !== 'ACCEPTED') throw new Error('unreachable');
  const document = result.document;
  assert.equal(document.profile.profileId, 'profile-1');
  assert.equal(document.profile.versions.length, 2);
  assert.equal(document.profile.activeVersionId, 'profile-1@2');
  assert.equal(document.profile.source, 'MANUAL_TUNING');
  assert.equal(document.profile.activation?.playerId, 'player-1');
  assert.equal(document.profile.activation?.sequence, 2);
  assert.equal(document.telemetry.included, false);
  assert.equal(document.telemetry.rawEventCount, 0);
  assert.equal(document.telemetry.referencedSegmentIds.length, 0);

  const read = readProfileExport(JSON.stringify(document));
  assert.equal(read.status, 'ACCEPTED');
  if (read.status !== 'ACCEPTED') throw new Error('unreachable');
  assert.deepEqual({ ...read.parameters }, { [USABLE_KEY]: 2.5, desired_acceleration: 2 });
  assert.equal(read.versions.length, 2);
  assert.equal(read.versions[1].source, 'MANUAL_TUNING');
  stored.close();
});

test('the repository export refuses an unknown profile', async () => {
  const harness = await opened('tab-unknown');
  const result = await exportProfileFromRepository(harness.repository, 'profile-404', {
    createdAt: CREATED_AT,
  });
  assert.equal(result.status, 'REJECTED');
  if (result.status !== 'REJECTED') throw new Error('unreachable');
  assert.equal(result.rejection.code, 'REFERENCE_MISSING');
  harness.repository.close();
});
