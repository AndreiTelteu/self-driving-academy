import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROFILE_EXPORT_LIMITS,
  PROFILE_IMPORT_VERSION,
  activateImportedProfile,
  importProfileDocument,
  parseStrictJson,
  validateProfileImport,
} from '../../src/persistence/index';
import type {
  ProfileImportRejectionCode,
  ProfileImportValidationResult,
} from '../../src/persistence/index';
import {
  IMPORT_ENGINE,
  IMPORT_PLAYER_ID,
  IMPORT_PROFILE_ID,
  IMPORT_TARGET_VERSION,
  buildImportDocument,
  createImportFixture,
  mutable,
  restamp,
  versionsSection,
} from './import-profile-harness';
import { progressRecord, settingsSnapshot } from './fixtures';
import { reservedParameterKeys } from '../../src/profiles/index';

const EXPECT = Object.freeze({ profileId: IMPORT_PROFILE_ID, engineVersion: IMPORT_ENGINE });

function rejectionCode(result: ProfileImportValidationResult): ProfileImportRejectionCode {
  assert.equal(result.status, 'REJECTED');
  return result.rejection.code;
}

function expectValidation(
  document: unknown,
  code: ProfileImportRejectionCode,
): ProfileImportValidationResult {
  const result = validateProfileImport(document, EXPECT);
  assert.equal(rejectionCode(result), code);
  return result;
}

test('134: a valid 133 document roundtrips and writes every version without activating', async () => {
  const fixture = await createImportFixture();
  try {
    const validation = validateProfileImport(fixture.text, EXPECT);
    assert.equal(validation.status, 'ACCEPTED');
    if (validation.status !== 'ACCEPTED') return;
    assert.equal(validation.versions.length, 3);
    assert.equal(validation.activeVersionId, 'profile-v3');
    assert.equal(validation.tipVersionId, 'profile-v3');
    assert.equal(validation.checksumVerified, true);
    assert.equal(validation.reservedParameters.speed_delta_arterial, null);
    assert.equal(Object.keys(validation.reservedParameters).length, reservedParameterKeys.length);

    const imported = await importProfileDocument(fixture.repository, {
      document: fixture.text,
      expect: EXPECT,
    });
    assert.equal(imported.status, 'COMMITTED');
    if (imported.status !== 'COMMITTED') return;
    assert.equal(imported.version, PROFILE_IMPORT_VERSION);
    assert.deepEqual(imported.versionIds, ['profile-v1', 'profile-v2', 'profile-v3']);
    assert.equal(imported.versionsCreated, 3);
    assert.equal(imported.versionsExisting, 0);
    assert.equal(imported.activated, false);
    assert.equal(imported.activation, null);

    const history = await fixture.repository.getProfileHistory(IMPORT_PROFILE_ID);
    assert.equal(history.versions.length, 3);
    assert.equal(history.complete, true);
    assert.equal(history.activeVersionId, null);
    assert.equal(history.activationSequence, null);
    assert.deepEqual(
      history.versions.map((version) => version.versionId),
      ['profile-v1', 'profile-v2', 'profile-v3'],
    );
    assert.equal(await fixture.repository.getActivation(IMPORT_PROFILE_ID), null);

    // A second import of the same document is idempotent, still without an activation.
    const again = await importProfileDocument(fixture.repository, {
      document: fixture.text,
      expect: EXPECT,
    });
    assert.equal(again.status, 'COMMITTED');
    if (again.status !== 'COMMITTED') return;
    assert.equal(again.versionsCreated, 0);
    assert.equal(again.versionsExisting, 3);
    assert.equal(again.activated, false);
  } finally {
    fixture.close();
  }
});

test('134: the document size budget is enforced before the parser runs', async () => {
  const oversized = 'x'.repeat(PROFILE_EXPORT_LIMITS.maxFileBytes + 1);
  const parsed = parseStrictJson(oversized);
  assert.equal(parsed.status, 'REJECTED');
  expectValidation(oversized, 'FILE_TOO_LARGE');
});

test('134: a modified document checksum is refused', async () => {
  const fixture = await createImportFixture();
  try {
    const tampered = mutable(fixture.document);
    versionsSection(tampered)[0].parameters = {
      ...(versionsSection(tampered)[0].parameters as Record<string, unknown>),
      speed_delta_urban: { value: 9, unit: 'm/s' },
    };
    expectValidation(tampered, 'CHECKSUM_MISMATCH');
    const result = await importProfileDocument(fixture.repository, {
      document: tampered,
      expect: EXPECT,
    });
    assert.equal(result.status, 'REJECTED');
    assert.equal(await fixture.repository.getProfile('profile-v1'), null);
  } finally {
    fixture.close();
  }
});

test('134: a per-version 109 checksum is verified, not trusted', async () => {
  const fixture = await createImportFixture();
  try {
    const tampered = mutable(fixture.document);
    const parameters = versionsSection(tampered)[0].parameters as Record<string, unknown>;
    parameters.speed_delta_urban = { value: 9, unit: 'm/s' };
    expectValidation(restamp(tampered), 'PROFILE_CHECKSUM_MISMATCH');
  } finally {
    fixture.close();
  }
});

test('134: an unknown unit is refused even with a valid document checksum', async () => {
  const fixture = await createImportFixture();
  try {
    const tampered = mutable(fixture.document);
    const parameters = versionsSection(tampered)[0].parameters as Record<string, unknown>;
    parameters.speed_delta_urban = { value: 1.5, unit: 'km/h' };
    expectValidation(restamp(tampered), 'UNIT_MISMATCH');
  } finally {
    fixture.close();
  }
});

test('134: a value outside the 092 range is refused', async () => {
  const fixture = await createImportFixture();
  try {
    const tampered = mutable(fixture.document);
    const parameters = versionsSection(tampered)[0].parameters as Record<string, unknown>;
    parameters.speed_delta_urban = { value: 9_999, unit: 'm/s' };
    expectValidation(restamp(tampered), 'VALUE_OUT_OF_RANGE');
  } finally {
    fixture.close();
  }
});

test('134: a reserved R key with a value is refused', async () => {
  const fixture = await createImportFixture();
  try {
    const tampered = mutable(fixture.document);
    const parameters = versionsSection(tampered)[0].parameters as Record<string, unknown>;
    parameters.speed_delta_arterial = { value: 1, unit: 'm/s' };
    expectValidation(restamp(tampered), 'RESERVED_KEY_SET');
  } finally {
    fixture.close();
  }
});

test('134: an unknown usable key is refused', async () => {
  const fixture = await createImportFixture();
  try {
    const tampered = mutable(fixture.document);
    const parameters = versionsSection(tampered)[0].parameters as Record<string, unknown>;
    parameters.not_a_parameter = { value: 1, unit: 'm/s' };
    expectValidation(restamp(tampered), 'UNKNOWN_PARAMETER');
  } finally {
    fixture.close();
  }
});

test('134: a newer schema or format is a closed refusal, never best effort', async () => {
  const fixture = await createImportFixture();
  try {
    const newerSchema = mutable(fixture.document);
    newerSchema.schemaVersion = 2;
    expectValidation(restamp(newerSchema), 'SCHEMA_TOO_NEW');

    const newerFormat = mutable(fixture.document);
    newerFormat.formatVersion = 2;
    expectValidation(restamp(newerFormat), 'FORMAT_VERSION_TOO_NEW');

    const newerSchemaParsed = validateProfileImport(
      JSON.parse(JSON.stringify(newerSchema)) as unknown,
      EXPECT,
    );
    assert.equal(rejectionCode(newerSchemaParsed), 'SCHEMA_TOO_NEW');
  } finally {
    fixture.close();
  }
});

test('134: malformed and duplicate-key JSON are closed refusals', async () => {
  expectValidation('{ not json', 'PARSE_ERROR');
  expectValidation('{"format":"a","format":"b"}', 'DUPLICATE_KEY');
  expectValidation('[1,2,3]', 'INVALID_FIELD');
});

test('134: a profile, engine or player mismatch is refused before any write', async () => {
  const fixture = await createImportFixture();
  try {
    const wrongProfile = validateProfileImport(fixture.document, {
      profileId: 'another-profile',
      engineVersion: IMPORT_ENGINE,
    });
    assert.equal(rejectionCode(wrongProfile), 'IMPORT_PROFILE_MISMATCH');

    const wrongEngine = validateProfileImport(fixture.document, {
      profileId: IMPORT_PROFILE_ID,
      engineVersion: 'engine-other',
    });
    assert.equal(rejectionCode(wrongEngine), 'ENGINE_INCOMPATIBLE');

    const wrongPlayer = validateProfileImport(fixture.document, {
      profileId: IMPORT_PROFILE_ID,
      engineVersion: IMPORT_ENGINE,
      playerId: 'another-player',
    });
    assert.equal(rejectionCode(wrongPlayer), 'IMPORT_PLAYER_MISMATCH');
  } finally {
    fixture.close();
  }
});

test('134: a fault before commit leaves no version, no activation and no progression write', async () => {
  const fixture = await createImportFixture();
  try {
    const progress = progressRecord();
    await fixture.repository.putProgress(progress);
    const settings = settingsSnapshot();
    await fixture.repository.putSettings(settings);
    const progressBefore = await fixture.repository.getProgress('progress-1');
    const settingsBefore = await fixture.repository.getSettings(settings.playerId);

    const failed = await importProfileDocument(fixture.repository, {
      document: fixture.text,
      expect: EXPECT,
      hooks: {
        beforeCommit(): void {
          throw new Error('deterministic import fault');
        },
      },
    });
    assert.equal(failed.status, 'REJECTED');
    if (failed.status !== 'REJECTED') return;
    assert.equal(failed.rejection.code, 'IMPORT_WRITE_FAILED');
    assert.equal(failed.activated, false);

    const history = await fixture.repository.getProfileHistory(IMPORT_PROFILE_ID);
    assert.equal(history.versions.length, 0);
    assert.equal(history.complete, true);
    assert.equal(history.activeVersionId, null);
    assert.equal(await fixture.repository.getActivation(IMPORT_PROFILE_ID), null);
    assert.deepEqual(await fixture.repository.getProgress('progress-1'), progressBefore);
    assert.deepEqual(await fixture.repository.getSettings(settings.playerId), settingsBefore);

    // The same document still imports cleanly after the aborted attempt.
    const retried = await importProfileDocument(fixture.repository, {
      document: fixture.text,
      expect: EXPECT,
    });
    assert.equal(retried.status, 'COMMITTED');
    if (retried.status !== 'COMMITTED') return;
    assert.equal(retried.versionsCreated, 3);
  } finally {
    fixture.close();
  }
});

test('134: an import that commits after the fault hook reports the durable commit', async () => {
  const fixture = await createImportFixture();
  try {
    const committed = await importProfileDocument(fixture.repository, {
      document: fixture.text,
      expect: EXPECT,
      hooks: {
        afterCommit(): void {
          throw new Error('deterministic post-commit fault');
        },
      },
    });
    assert.equal(committed.status, 'COMMITTED');
    if (committed.status !== 'COMMITTED') return;
    assert.equal(committed.crashAfterCommit, true);
    assert.equal(committed.versionsCreated, 3);
    assert.equal(
      (await fixture.repository.getProfileHistory(IMPORT_PROFILE_ID)).versions.length,
      3,
    );
    assert.equal(await fixture.repository.getActivation(IMPORT_PROFILE_ID), null);
  } finally {
    fixture.close();
  }
});

test('134: import never activates; activation is a separate explicit 205/110 step', async () => {
  const fixture = await createImportFixture();
  try {
    const imported = await importProfileDocument(fixture.repository, {
      document: fixture.text,
      expect: EXPECT,
    });
    assert.equal(imported.status, 'COMMITTED');
    assert.equal(fixture.epoch.barrier.pending(), null);
    assert.equal(fixture.epoch.activation.pending(), null);
    assert.deepEqual(fixture.epoch.fleetVersions(), ['profile-v1']);
    assert.equal(await fixture.repository.getActivation(IMPORT_PROFILE_ID), null);

    const stale = await activateImportedProfile(
      {
        repository: fixture.repository,
        barrier: fixture.epoch.barrier,
        playerId: IMPORT_PLAYER_ID,
        profileId: IMPORT_PROFILE_ID,
        engineVersion: IMPORT_ENGINE,
        tick: () => fixture.epoch.tick.value,
        now: () => '2026-10-22T12:30:00.000Z',
      },
      { versionId: IMPORT_TARGET_VERSION, tick: 99 },
    );
    assert.equal(stale.status, 'REJECTED');
    if (stale.status !== 'REJECTED') return;
    assert.equal(stale.rejection.code, 'IMPORT_ACTIVATION_STALE_TICK');

    // The barrier opens at tick 0 and resolves only at the next tick boundary.
    const pending = await activateImportedProfile(
      {
        repository: fixture.repository,
        barrier: fixture.epoch.barrier,
        playerId: IMPORT_PLAYER_ID,
        profileId: IMPORT_PROFILE_ID,
        engineVersion: IMPORT_ENGINE,
        tick: () => fixture.epoch.tick.value,
        now: () => '2026-10-22T12:30:00.000Z',
      },
      { versionId: IMPORT_TARGET_VERSION, tick: 0 },
    );
    assert.equal(pending.status, 'PENDING');
    assert.equal(await fixture.repository.getActivation(IMPORT_PROFILE_ID), null);
    assert.notEqual(fixture.epoch.barrier.pending(), null);

    fixture.epoch.advanceTick();
    const activated = await activateImportedProfile(
      {
        repository: fixture.repository,
        barrier: fixture.epoch.barrier,
        playerId: IMPORT_PLAYER_ID,
        profileId: IMPORT_PROFILE_ID,
        engineVersion: IMPORT_ENGINE,
        tick: () => fixture.epoch.tick.value,
        now: () => '2026-10-22T12:30:00.000Z',
      },
      { versionId: IMPORT_TARGET_VERSION, tick: 1 },
    );
    assert.equal(activated.status, 'ACTIVATED');
    if (activated.status !== 'ACTIVATED') return;
    assert.equal(activated.sequence, 1);
    assert.equal(activated.learningEpoch, 2);
    assert.equal(activated.activateAtTick, 2);
    assert.notEqual(activated.barrierId, null);
    assert.notEqual(activated.activationCommandId, null);

    const record = await fixture.repository.getActivation(IMPORT_PROFILE_ID);
    assert.notEqual(record, null);
    assert.equal(record?.versionId, IMPORT_TARGET_VERSION);
    assert.equal(record?.sequence, 1);
    assert.equal(record?.activatedAt, '2026-10-22T12:30:00.000Z');

    // The 110 publisher still applies at its own tick; until then the fleet keeps the old base.
    assert.deepEqual(fixture.epoch.fleetVersions(), ['profile-v1']);
    fixture.epoch.advanceTick();
    assert.equal(fixture.epoch.activation.applyAt(2).status, 'APPLIED');
    assert.deepEqual(fixture.epoch.fleetVersions(), [IMPORT_TARGET_VERSION]);

    // The old generation cannot feed a result into the imported profile.
    const late = fixture.epoch.barrier.isCurrent({
      playerId: IMPORT_PLAYER_ID,
      profileId: IMPORT_PROFILE_ID,
      learningEpoch: 1,
      baseVersionId: 'profile-v1',
      segmentId: 'segment-g1',
    });
    assert.equal(late.status, 'LATE_RESULT');
    assert.equal(late.accepted, false);

    // The same target is idempotent and does not open a second barrier.
    const idempotent = await activateImportedProfile(
      {
        repository: fixture.repository,
        barrier: fixture.epoch.barrier,
        playerId: IMPORT_PLAYER_ID,
        profileId: IMPORT_PROFILE_ID,
        engineVersion: IMPORT_ENGINE,
        tick: () => fixture.epoch.tick.value,
        now: () => '2026-10-22T12:40:00.000Z',
      },
      { versionId: IMPORT_TARGET_VERSION, tick: 2 },
    );
    assert.equal(idempotent.status, 'ALREADY_ACTIVE');
    if (idempotent.status !== 'ALREADY_ACTIVE') return;
    assert.equal(idempotent.sequence, 1);
  } finally {
    fixture.close();
  }
});

test('134: activating a version that was never imported is refused without a write', async () => {
  const fixture = await createImportFixture();
  try {
    const result = await activateImportedProfile(
      {
        repository: fixture.repository,
        barrier: fixture.epoch.barrier,
        playerId: IMPORT_PLAYER_ID,
        profileId: IMPORT_PROFILE_ID,
        engineVersion: IMPORT_ENGINE,
        tick: () => fixture.epoch.tick.value,
        now: () => '2026-10-22T12:30:00.000Z',
      },
      { versionId: 'profile-v9', tick: 0 },
    );
    assert.equal(result.status, 'REJECTED');
    if (result.status !== 'REJECTED') return;
    assert.equal(result.rejection.code, 'IMPORT_TARGET_NOT_FOUND');
    assert.equal(await fixture.repository.getActivation(IMPORT_PROFILE_ID), null);
  } finally {
    fixture.close();
  }
});

test('134: the document builder of the report is deterministic', async () => {
  const fixture = await createImportFixture();
  try {
    const rebuilt = buildImportDocument(fixture.versions);
    assert.deepEqual(rebuilt, fixture.document);
  } finally {
    fixture.close();
  }
});
