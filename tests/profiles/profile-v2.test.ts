import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROFILE_CATALOG_VERSION,
  PROFILE_SCHEMA_VERSION_V1,
  PROFILE_SCHEMA_VERSION_V2,
  PROFILE_V2_VERSION,
  compareProfileCatalogVersions,
  createProfileStore,
  getParameterDefinition,
  isProfileStoreAccepted,
  migrateProfileV1ToV2,
  parameterDefinitions,
  parseDrivingProfile,
  parseProfileCatalogVersion,
  projectProfileV2ForUi,
  readProfileDocument,
  rollbackProfileV2ToV1,
  summarizeProfileV2,
  verifyProfileV2Checksum,
} from '../../src/profiles';
import type { DrivingProfile, ProfileV2, ProfileVersion } from '../../src/profiles';
import { ContractValidationError } from '../../src/sessions';
import { createV1FixtureProfile, authoredV2Document, runProfileV2Report } from './profile-v2-suite';

function fixture(): Record<string, unknown> {
  return createV1FixtureProfile();
}

function migrate(): ProfileV2 {
  const result = migrateProfileV1ToV2(fixture());
  assert.equal(result.status, 'MIGRATED');
  if (result.status !== 'MIGRATED') throw new Error('expected a migrated profile');
  return result.profile;
}

function documentWithKey(
  profile: ProfileV2,
  key: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const document = JSON.parse(JSON.stringify(profile)) as unknown as Record<string, unknown>;
  const keys = document.keys as Record<string, Record<string, unknown>>;
  keys[key] = { ...keys[key], ...patch };
  const parameters = document.parameters as Record<string, number>;
  if (patch.value === null) delete parameters[key];
  else if (typeof patch.value === 'number') parameters[key] = patch.value;
  return document;
}

test('V2 versioning names the schema and the real 092 catalog', () => {
  assert.equal(PROFILE_SCHEMA_VERSION_V1, 1);
  assert.equal(PROFILE_SCHEMA_VERSION_V2, 2);
  assert.equal(PROFILE_CATALOG_VERSION, '092-catalog-1@2026-10-04');
  const current = parseProfileCatalogVersion(PROFILE_CATALOG_VERSION);
  assert.deepEqual(current, { schemaVersion: 1, updatedOn: '2026-10-04' });
  assert.equal(compareProfileCatalogVersions(current, current), 0);
  assert.equal(
    compareProfileCatalogVersions(parseProfileCatalogVersion('092-catalog-1@2026-12-31'), current),
    1,
  );
  assert.equal(
    compareProfileCatalogVersions(parseProfileCatalogVersion('092-catalog-1@2026-01-01'), current),
    -1,
  );
  assert.equal(parameterDefinitions.length, 80);
  assert.equal(
    parameterDefinitions.filter((entry) => entry.implementationStage === 'initial_learning_target')
      .length,
    24,
  );
  assert.equal(
    parameterDefinitions.filter((entry) => entry.implementationStage === 'extension').length,
    56,
  );
  assert.throws(() => parseProfileCatalogVersion('catalog-nou'), ContractValidationError);
});

test('a V1 profile is migrated with its values, units, provenance and evidence intact', () => {
  const source = fixture();
  const profile = migrate();
  assert.equal(profile.schemaVersion, PROFILE_SCHEMA_VERSION_V2);
  assert.equal(profile.catalogVersion, PROFILE_CATALOG_VERSION);
  assert.equal(profile.profileId, 'academy-style');
  assert.equal(profile.versionId, 'style-v7');
  assert.equal(profile.parentVersionId, 'style-v6');
  assert.equal(profile.createdAt, '2026-11-01T10:00:00.000Z');
  assert.equal(profile.migratedFrom?.schemaVersion, 1);
  assert.equal(profile.migratedFrom?.checksum, source.checksum);
  const sourceParameters = source.parameters as Record<string, number>;
  for (const key of Object.keys(sourceParameters)) {
    const entry = profile.keys[key];
    assert.equal(entry.value, sourceParameters[key], key);
    assert.equal(entry.unit, (source.unitsByParameter as Record<string, string>)[key], key);
    assert.equal(
      entry.source,
      `v1:${(source.provenanceByParameter as Record<string, string>)[key]}`,
      key,
    );
    assert.equal(entry.stage, getParameterDefinition(key).implementationStage, key);
  }
  assert.equal(profile.keys.speed_delta_urban.origin, 'PLAYER_SET');
  assert.equal(profile.keys.speed_delta_urban.reason, 'V1_PLAYER_VALUE');
  assert.equal(profile.keys.curve_lateral_accel.origin, 'PLAYER_SET');
  assert.equal(profile.keys.curve_lateral_accel.reason, 'V1_IMPORTED_VALUE');
  assert.equal(profile.keys.following_min_gap.origin, 'INHERITED_V1');
  assert.equal(profile.keys.following_min_gap.reason, 'V1_BASE_VALUE');
  const evidence = profile.keys.following_time_headway.evidence;
  assert(evidence !== null);
  assert.equal(evidence.effectiveCount, 6);
  assert.equal(evidence.quality, 0.72);
  assert.equal(profile.keys.following_time_headway.evidenceSource, 'PROFILE_EVIDENCE');
  assert.equal(profile.keys.following_min_gap.evidenceSource, 'V1_PROVENANCE');
  assert.equal(profile.keys.following_min_gap.evidence, null);
  assert(verifyProfileV2Checksum(profile));
  assert(profile.migratedFrom !== null);
  assert.equal(parseDrivingProfile(source).checksum, profile.migratedFrom.checksum);
});

test('a real 109 V1 version is migrated and keeps its checksum on rollback', () => {
  const store = createProfileStore({
    engineVersion: 'engine-166',
    validateDelta: () => ({ status: 'REJECTED', rejections: [] }),
  });
  const created = store.createBase({
    profileId: 'academy',
    versionId: 'v1',
    parameters: { speed_delta_urban: 0.8, following_time_headway: 2.2 },
    createdAt: '2026-11-01T00:00:00Z',
  });
  assert.equal(created.status, 'ACCEPTED');
  if (!isProfileStoreAccepted(created)) throw new Error('expected a base version');
  const version: ProfileVersion = created.profileVersion;
  const parameters: Record<string, number> = {};
  const unitsByParameter: Record<string, DrivingProfile['unitsByParameter'][string]> = {};
  const provenanceByParameter: Record<string, DrivingProfile['provenanceByParameter'][string]> = {};
  const evidenceByParameter: Record<string, null> = {};
  for (const key of Object.keys(version.parameters)) {
    parameters[key] = version.parameters[key];
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  const profileV1: DrivingProfile = Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION_V1,
    units: 'SI',
    profileId: version.profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters: Object.freeze(parameters),
    unitsByParameter: Object.freeze(unitsByParameter),
    provenanceByParameter: Object.freeze(provenanceByParameter),
    evidenceByParameter: Object.freeze(evidenceByParameter),
    sourceSegmentIds: Object.freeze([...version.sourceSegmentIds]),
    createdAt: version.createdAt,
    checksum: version.checksum,
  });
  const migrated = migrateProfileV1ToV2(profileV1);
  assert.equal(migrated.status, 'MIGRATED');
  if (migrated.status !== 'MIGRATED') throw new Error('expected a migrated profile');
  assert.equal(migrated.profile.keys.speed_delta_urban.value, 0.8);
  assert.equal(migrated.profile.keys.speed_delta_urban.origin, 'INHERITED_V1');
  assert.equal(migrated.profile.keys.following_time_headway.value, 2.2);
  assert.equal(migrated.profile.keys.speed_delta_arterial.origin, 'DEFAULT');
  const rollback = rollbackProfileV2ToV1(migrated.profile);
  assert.equal(rollback.status, 'ROLLED_BACK');
  if (rollback.status === 'ROLLED_BACK') assert.equal(rollback.profile.checksum, version.checksum);
});

test('the new keys receive the real catalog default, never an estimate', () => {
  const profile = migrate();
  const rKeys = parameterDefinitions.filter((entry) => entry.implementationStage === 'extension');
  assert.equal(rKeys.length, 56);
  for (const definition of rKeys) {
    const entry = profile.keys[definition.key];
    assert.equal(entry.origin, 'DEFAULT', definition.key);
    assert.equal(entry.reason, 'CATALOG_DEFAULT', definition.key);
    assert.equal(entry.value, definition.default, definition.key);
    assert.equal(entry.source, `catalog:${PROFILE_CATALOG_VERSION}#default`, definition.key);
    assert.equal(entry.evidence, null, definition.key);
    assert.equal(entry.evidenceSource, 'CATALOG_DEFAULT', definition.key);
    assert.equal(entry.support, 'RESERVED', definition.key);
    assert(entry.detail.length > 0);
  }
  const parameters = profile.parameters;
  assert.equal(Object.keys(parameters).length, 80);
  assert.equal(
    parameters.speed_delta_arterial,
    getParameterDefinition('speed_delta_arterial').default,
  );
});

test('the UI projection declares support and evidence for each of the 80 keys', () => {
  const profile = migrate();
  const rows = projectProfileV2ForUi(profile);
  assert.equal(rows.length, 80);
  for (const row of rows) {
    assert(row.key.length > 0);
    assert(row.originLabel.length > 0);
    assert(row.supportLabel.length > 0);
    assert(row.evidenceSourceLabel.length > 0);
    assert(row.detail.length > 0);
    assert.equal(row.stage === 'extension', row.reserved);
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  assert.equal(byKey.get('speed_delta_urban')?.origin, 'PLAYER_SET');
  assert.equal(byKey.get('speed_delta_urban')?.originLabel, 'setată de jucător');
  assert.equal(byKey.get('following_min_gap')?.origin, 'INHERITED_V1');
  assert.equal(byKey.get('following_min_gap')?.originLabel, 'moștenită din V1');
  assert.equal(byKey.get('speed_delta_residential')?.support, 'SUPPORTED');
  assert.equal(byKey.get('yield_time_gap')?.support, 'SUPPORTED');
  assert.equal(byKey.get('speed_delta_arterial')?.origin, 'DEFAULT');
  assert.equal(byKey.get('speed_delta_arterial')?.originLabel, 'default din catalog');
  assert.equal(byKey.get('following_time_headway')?.evidenceCount, 6);
  assert.equal(byKey.get('following_time_headway')?.evidenceSource, 'PROFILE_EVIDENCE');
  const summary = summarizeProfileV2(profile);
  assert.deepEqual(
    {
      keys: summary.keys,
      v1Keys: summary.v1Keys,
      v2Keys: summary.v2Keys,
      playerSet: summary.playerSet,
      inherited: summary.inherited,
      default: summary.default,
      unset: summary.unset,
      supported: summary.supported,
      reserved: summary.reserved,
    },
    {
      keys: 80,
      v1Keys: 24,
      v2Keys: 56,
      playerSet: 5,
      inherited: 4,
      default: 71,
      unset: 0,
      supported: 24,
      reserved: 56,
    },
  );
});

test('rollback returns the exact V1 profile, including its checksum', () => {
  const source = parseDrivingProfile(fixture());
  const result = rollbackProfileV2ToV1(migrate());
  assert.equal(result.status, 'ROLLED_BACK');
  if (result.status !== 'ROLLED_BACK') throw new Error('expected a rollback');
  assert.equal(result.profile.checksum, source.checksum);
  assert.equal(result.profile.profileId, source.profileId);
  assert.equal(result.profile.versionId, source.versionId);
  assert.equal(result.profile.parentVersionId, source.parentVersionId);
  assert.equal(result.profile.engineVersion, source.engineVersion);
  assert.equal(result.profile.createdAt, source.createdAt);
  assert.deepEqual([...result.profile.sourceSegmentIds], [...source.sourceSegmentIds]);
  assert.deepEqual({ ...result.profile.parameters }, { ...source.parameters });
  assert.deepEqual({ ...result.profile.unitsByParameter }, { ...source.unitsByParameter });
  assert.deepEqual(
    { ...result.profile.provenanceByParameter },
    { ...source.provenanceByParameter },
  );
  assert.deepEqual({ ...result.profile.evidenceByParameter }, { ...source.evidenceByParameter });
  assert.equal(Object.keys(result.profile.parameters).length, 9);
});

test('a current V2 document is read as CURRENT without being reinterpreted', () => {
  const profile = migrate();
  const read = readProfileDocument(profile);
  assert.equal(read.status, 'CURRENT');
  if (read.status !== 'CURRENT') throw new Error('expected a current document');
  assert.equal(read.profile.checksum, profile.checksum);
  assert.equal(read.profile.catalogVersion, PROFILE_CATALOG_VERSION);
  const serialized = JSON.parse(JSON.stringify(profile)) as unknown;
  const fromJson = readProfileDocument(serialized);
  assert.equal(fromJson.status, 'CURRENT');
  assert.throws(() => parseDrivingProfile(serialized), ContractValidationError);
});

test('the reserved UNSET policy leaves the R keys unset with a reason', () => {
  const result = migrateProfileV1ToV2(fixture(), { reservedKeys: 'UNSET' });
  assert.equal(result.status, 'MIGRATED');
  if (result.status !== 'MIGRATED') throw new Error('expected a migrated profile');
  const profile = result.profile;
  const rows = projectProfileV2ForUi(profile);
  const unset = rows.filter((row) => row.origin === 'UNSET');
  assert.equal(unset.length, 56);
  assert(unset.every((row) => row.value === null && row.detail.length > 0));
  assert.equal(Object.keys(profile.parameters).length, 24);
  for (const key of Object.keys(profile.parameters))
    assert.notEqual(profile.keys[key].origin, 'UNSET');
  const rollback = rollbackProfileV2ToV1(profile);
  assert.equal(rollback.status, 'ROLLED_BACK');
});

test('a newer schema or catalog is refused before any value is interpreted', () => {
  const schema = readProfileDocument({ ...fixture(), schemaVersion: 3 });
  assert.equal(schema.status, 'REJECTED');
  if (schema.status === 'REJECTED') assert.equal(schema.rejection.code, 'SCHEMA_TOO_NEW');
  const migration = migrateProfileV1ToV2({ ...fixture(), schemaVersion: 3 });
  if (migration.status === 'REJECTED') assert.equal(migration.rejection.code, 'SCHEMA_TOO_NEW');
  else assert.fail('a newer schema must be refused');

  const catalog = readProfileDocument({
    ...fixture(),
    catalogVersion: '092-catalog-1@2027-01-01',
  });
  if (catalog.status === 'REJECTED') assert.equal(catalog.rejection.code, 'CATALOG_TOO_NEW');
  else assert.fail('a newer catalog must be refused');

  const profile = migrate();
  const newerDocument = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
  newerDocument.catalogVersion = '092-catalog-2@2027-01-01';
  const newer = readProfileDocument(newerDocument);
  if (newer.status === 'REJECTED') assert.equal(newer.rejection.code, 'CATALOG_TOO_NEW');
  else assert.fail('a newer V2 catalog must be refused');

  const older = readProfileDocument({
    ...fixture(),
    catalogVersion: '092-catalog-1@2026-01-01',
  });
  if (older.status === 'REJECTED') assert.equal(older.rejection.code, 'CATALOG_UNSUPPORTED');
  else assert.fail('an unknown older catalog must be refused');
});

test('invalid V1 input is refused with closed codes', () => {
  const unknownKey = fixture();
  (unknownKey.parameters as Record<string, number>).key_inexistent = 1;
  (unknownKey.unitsByParameter as Record<string, string>).key_inexistent = 'm';
  (unknownKey.provenanceByParameter as Record<string, string>).key_inexistent = 'BASE';
  (unknownKey.evidenceByParameter as Record<string, unknown>).key_inexistent = null;
  const unknown = readProfileDocument(unknownKey);
  if (unknown.status === 'REJECTED') assert.equal(unknown.rejection.code, 'UNKNOWN_KEY');
  else assert.fail('unknown keys must be refused');

  const wrongUnit = fixture();
  (wrongUnit.unitsByParameter as Record<string, string>).speed_delta_urban = 's';
  const unit = readProfileDocument(wrongUnit);
  if (unit.status === 'REJECTED') assert.equal(unit.rejection.code, 'UNIT_MISMATCH');
  else assert.fail('a wrong unit must be refused');

  const outOfRange = fixture();
  (outOfRange.parameters as Record<string, number>).speed_delta_urban = 999;
  const range = readProfileDocument(outOfRange);
  if (range.status === 'REJECTED') assert.equal(range.rejection.code, 'VALUE_OUT_OF_RANGE');
  else assert.fail('an out-of-range value must be refused');

  const reserved = fixture();
  (reserved.parameters as Record<string, number>).speed_delta_arterial = 0;
  (reserved.unitsByParameter as Record<string, string>).speed_delta_arterial = 'm/s';
  (reserved.provenanceByParameter as Record<string, string>).speed_delta_arterial = 'BASE';
  (reserved.evidenceByParameter as Record<string, unknown>).speed_delta_arterial = null;
  const reservedResult = readProfileDocument(reserved);
  if (reservedResult.status === 'REJECTED')
    assert.equal(reservedResult.rejection.code, 'RESERVED_KEY_IN_V1');
  else assert.fail('an R key in a V1 profile must be refused');

  const broken = fixture();
  delete broken.checksum;
  const invalid = readProfileDocument(broken);
  if (invalid.status === 'REJECTED') assert.equal(invalid.rejection.code, 'INVALID_PROFILE');
  else assert.fail('a malformed V1 profile must be refused');
});

test('a malformed V2 document is refused, including a tampered checksum and false support', () => {
  const profile = migrate();
  const missing = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
  delete (missing.keys as Record<string, unknown>).speed_delta_urban;
  const missingRead = readProfileDocument(missing);
  if (missingRead.status === 'REJECTED')
    assert.equal(missingRead.rejection.code, 'INVALID_PROFILE');
  else assert.fail('a missing key must be refused');

  const tampered = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
  tampered.checksum = 'fnv1a64:0000000000000000';
  const checksum = readProfileDocument(tampered);
  if (checksum.status === 'REJECTED') assert.equal(checksum.rejection.code, 'CHECKSUM_MISMATCH');
  else assert.fail('a tampered checksum must be refused');

  const falseSupport = documentWithKey(profile, 'speed_delta_arterial', { support: 'SUPPORTED' });
  const support = readProfileDocument(falseSupport);
  if (support.status === 'REJECTED') assert.equal(support.rejection.code, 'INVALID_PROFILE');
  else assert.fail('a false support claim must be refused');

  const falseDefault = documentWithKey(profile, 'speed_delta_arterial', { value: 1 });
  const defaultValue = readProfileDocument(falseDefault);
  if (defaultValue.status === 'REJECTED')
    assert.equal(defaultValue.rejection.code, 'INVALID_PROFILE');
  else assert.fail('a fabricated default must be refused');
});

test('a V2 value authored after migration is not lost silently at rollback', () => {
  const profile = migrate();
  const edited = authoredV2Document(profile, 'speed_delta_arterial', {
    value: 2,
    origin: 'PLAYER_SET',
    source: 'v2:MANUAL_TUNING',
    evidenceSource: 'NONE',
    reason: 'V2_PLAYER_VALUE',
    detail: 'Valoare reglată direct în schema V2, după migrare.',
  });
  const read = readProfileDocument(edited);
  assert.equal(read.status, 'CURRENT');
  if (read.status !== 'CURRENT') throw new Error('expected the edited document to be current');
  const rollback = rollbackProfileV2ToV1(read.profile);
  assert.equal(rollback.status, 'REJECTED');
  if (rollback.status === 'REJECTED')
    assert.equal(rollback.rejection.code, 'MIGRATION_NOT_REPRESENTABLE');

  const native = rollbackProfileV2ToV1({
    ...JSON.parse(JSON.stringify(profile)),
    migratedFrom: null,
  });
  if (native.status === 'REJECTED') assert.equal(native.rejection.code, 'INVALID_PROFILE');
  else assert.fail('inherited keys without a migration source must be refused');
});

test('migration is deterministic, frozen and independent of map insertion order', () => {
  const first = migrate();
  const second = migrate();
  assert.equal(first.checksum, second.checksum);
  assert.equal(
    JSON.stringify(projectProfileV2ForUi(first)),
    JSON.stringify(projectProfileV2ForUi(second)),
  );
  const source = fixture();
  const reversed: Record<string, unknown> = { ...source };
  for (const field of [
    'parameters',
    'unitsByParameter',
    'provenanceByParameter',
    'evidenceByParameter',
  ]) {
    const original = source[field] as Record<string, unknown>;
    const map: Record<string, unknown> = {};
    for (const key of Object.keys(original).reverse()) map[key] = original[key];
    reversed[field] = map;
  }
  const third = migrateProfileV1ToV2(reversed);
  assert.equal(third.status, 'MIGRATED');
  if (third.status === 'MIGRATED') assert.equal(third.profile.checksum, first.checksum);
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.keys));
  assert(Object.isFrozen(first.parameters));
  assert(Object.isFrozen(first.keys.speed_delta_urban));
  const mutable = first.parameters as Record<string, number>;
  assert.throws(() => {
    mutable.speed_delta_urban = 99;
  }, TypeError);
  assert.equal(PROFILE_V2_VERSION, '166-profile-v2-v1');
});

test('the committed 166 report is reproducible and passes its own oracle', () => {
  const first = runProfileV2Report();
  const second = runProfileV2Report();
  assert.equal(first.determinism.digest, second.determinism.digest);
  assert.equal(first.summary.pass, true);
  assert.equal(first.summary.checks, first.summary.passed);
  assert.equal(first.catalog.keys, 80);
  assert.equal(first.migration.keys, 80);
  assert.equal(first.keys.length, 80);
  assert.equal(first.equivalence.mismatches.length, 0);
  assert.equal(first.refusal.postMigrationEdit, 'MIGRATION_NOT_REPRESENTABLE');
});
