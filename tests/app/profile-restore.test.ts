import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  importProfile,
  newProfileFromBase,
  PROFILE_RESTORE_VERSION,
  profileRestoreProvenances,
  profileRestoreStatuses,
  resetStyle,
  restoreVersion,
} from '../../src/app';
import { PIPELINE_PROFILE_ID } from '../harness/profile-pipeline-fixture';
import {
  RESTORE_IMPORTED,
  RESTORE_SECOND_PROFILE,
  createProfileRestoreWorld,
} from './profile-restore-fixture';

function restore(world: ReturnType<typeof createProfileRestoreWorld>, versionId: string) {
  return restoreVersion(world.services, {
    profileId: PIPELINE_PROFILE_ID,
    versionId,
    tick: world.tick.value,
  });
}

function commitRestore(world: ReturnType<typeof createProfileRestoreWorld>, versionId: string) {
  const pending = restore(world, versionId);
  assert.equal(pending.status, 'PENDING');
  world.advanceTick();
  return restore(world, versionId);
}

function importOnce(
  world: ReturnType<typeof createProfileRestoreWorld>,
  payload: Record<string, unknown>,
) {
  return importProfile(world.services, { importedProfile: payload, tick: world.tick.value });
}

function commitImport(
  world: ReturnType<typeof createProfileRestoreWorld>,
  payload: Record<string, unknown>,
) {
  const pending = importOnce(world, payload);
  assert.equal(pending.status, 'PENDING');
  world.advanceTick();
  return importOnce(world, payload);
}

test('114 exposes the closed restore contract and provenance mapping', () => {
  const world = createProfileRestoreWorld();
  try {
    assert.equal(PROFILE_RESTORE_VERSION, '114-profile-restore-v1');
    assert.deepEqual(
      [...profileRestoreStatuses],
      ['COMMITTED', 'PENDING', 'ALREADY_ACTIVE', 'REJECTED'],
    );
    assert.deepEqual(
      [...profileRestoreProvenances],
      ['RESTORE', 'IMPORT', 'NEW_PROFILE', 'RESET_STYLE'],
    );
    assert.equal(world.barrier.current().baseVersionId, world.baseVersionId);
    assert.deepEqual(
      [...world.versions()],
      [world.baseVersionId, world.targetVersionId, world.otherVersionId],
    );
  } finally {
    world.dispose();
  }
});

test('114 restore schedules one barrier then commits one common activation without cloning', () => {
  const world = createProfileRestoreWorld();
  try {
    const versionsBefore = world.versions();
    const checksumsBefore = world.checksums();
    const pending = restore(world, world.targetVersionId);
    assert.equal(pending.status, 'PENDING');
    assert.equal(pending.provenance, 'RESTORE');
    assert.equal(pending.barrierId, 'barrier-0001');
    assert.equal(pending.activation, null);
    assert.equal(pending.versionsAdded, 0);
    assert.equal(world.barrier.barriers()[0].status, 'PENDING');
    assert.deepEqual([...world.versions()], versionsBefore);

    world.advanceTick();
    const committed = restore(world, world.targetVersionId);
    assert.equal(committed.status, 'COMMITTED');
    assert.equal(committed.reason, 'RESTORE');
    assert.equal(committed.versionId, world.targetVersionId);
    assert.equal(committed.versionCreated, false);
    assert.equal(committed.activation?.origin, 'RESTORE');
    assert.equal(committed.activation?.commandId, 'activation-0001');
    assert.equal(committed.activation?.activateAtTick, 2);
    assert.equal(committed.report.barrier?.reason, 'RESTORE');
    assert.equal(committed.report.barrier?.fromLearningEpoch, 1);
    assert.equal(committed.report.barrier?.learningEpoch, 2);
    assert.deepEqual([...world.versions()], versionsBefore);
    assert.deepEqual([...world.checksums()], checksumsBefore);
    assert.equal(world.barrier.stats().changes, 1);
  } finally {
    world.dispose();
  }
});

test('114 restoring an already active version is a no-op without a barrier', () => {
  const world = createProfileRestoreWorld();
  try {
    const result = restore(world, world.baseVersionId);
    assert.equal(result.status, 'ALREADY_ACTIVE');
    assert.equal(result.barrierId, null);
    assert.equal(result.activation, null);
    assert.equal(result.report.barrier, null);
    assert.equal(world.barrier.barriers().length, 0);
    assert.equal(world.barrier.stats().changes, 0);
  } finally {
    world.dispose();
  }
});

test('114 restore rejects an unknown version without opening a barrier', () => {
  const world = createProfileRestoreWorld();
  try {
    const versionsBefore = world.versions();
    const result = restore(world, 'missing-version');
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'VERSION_NOT_FOUND');
    assert.equal(result.barrierId, null);
    assert.equal(world.barrier.barriers().length, 0);
    assert.deepEqual([...world.versions()], versionsBefore);
  } finally {
    world.dispose();
  }
});

test('114 restore rejects a version that belongs to another profile', () => {
  const world = createProfileRestoreWorld();
  try {
    const result = restore(world, world.otherProfileVersionId);
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'VERSION_PROFILE_MISMATCH');
    assert.equal(world.barrier.barriers().length, 0);
  } finally {
    world.dispose();
  }
});

test('114 valid import stores one immutable version, then barriers and activates with IMPORT', () => {
  const world = createProfileRestoreWorld();
  try {
    const versionsBefore = world.versions();
    const payload = world.importedProfile();
    const pending = importOnce(world, payload);
    assert.equal(pending.status, 'PENDING');
    assert.equal(pending.versionCreated, true);
    assert.equal(pending.versionsAdded, 1);
    assert.equal(pending.versionId, RESTORE_IMPORTED);
    const stored = world.store.getVersion(RESTORE_IMPORTED);
    assert.ok(stored !== null);
    assert.equal(stored.provenance.origin, 'DERIVED');
    assert.equal(stored.provenance.delta?.baseVersionId, world.baseVersionId);
    assert.equal(stored.provenance.delta?.reason, 'IMPORTED');
    assert.equal(stored.parameters.speed_delta_urban, 2.75);
    assert.equal(stored.parameters.following_time_headway, 2.2);
    assert.deepEqual(
      world.versions().filter((entry) => versionsBefore.includes(entry)),
      versionsBefore,
    );

    world.advanceTick();
    const committed = importOnce(world, payload);
    assert.equal(committed.status, 'COMMITTED');
    assert.equal(committed.reason, 'IMPORT');
    assert.equal(committed.activation?.origin, 'IMPORT');
    assert.equal(committed.report.barrier?.reason, 'IMPORT');
    assert.equal(committed.versionsAdded, 0);
    assert.equal(world.versions().filter((entry) => entry === RESTORE_IMPORTED).length, 1);
  } finally {
    world.dispose();
  }
});

test('114 a duplicate import is idempotent and creates no second version', () => {
  const world = createProfileRestoreWorld();
  try {
    const payload = world.importedProfile();
    const committed = commitImport(world, payload);
    assert.equal(committed.status, 'COMMITTED');
    const versionsAfterFirst = world.versions();
    const checksumsAfterFirst = world.checksums();

    world.advanceTick();
    const duplicate = importOnce(world, payload);
    assert.equal(duplicate.status, 'ALREADY_ACTIVE');
    assert.equal(duplicate.versionId, RESTORE_IMPORTED);
    assert.equal(duplicate.versionsAdded, 0);
    assert.deepEqual([...world.versions()], versionsAfterFirst);
    assert.deepEqual([...world.checksums()], checksumsAfterFirst);
    assert.equal(world.barrier.barriers().length, 1);
  } finally {
    world.dispose();
  }
});

test('114 a duplicate checksum with another version id reuses the stored import', () => {
  const world = createProfileRestoreWorld();
  try {
    const committed = commitImport(world, world.importedProfile());
    assert.equal(committed.status, 'COMMITTED');
    const versionsAfterFirst = world.versions();
    world.advanceTick();
    const alias = importOnce(
      world,
      world.importedProfile({ versionId: 'import-v4-alias', checksum: 'import:import-v4' }),
    );
    assert.equal(alias.status, 'ALREADY_ACTIVE');
    assert.equal(alias.versionId, RESTORE_IMPORTED);
    assert.deepEqual([...world.versions()], versionsAfterFirst);
    assert.equal(world.versions().includes('import-v4-alias'), false);
  } finally {
    world.dispose();
  }
});

test('114 an invalid import changes neither the store, the queue nor the activation', async () => {
  const world = createProfileRestoreWorld();
  try {
    const job = world.job({ segmentId: 'job-invalid-import', order: 1 });
    const admission = world.queue.queue.submit(job);
    assert.equal(admission.status, 'QUEUED');
    const versionsBefore = world.versions();
    const checksumsBefore = world.checksums();
    const payload = world.importedProfile({ engineVersion: 'engine-2' });
    const result = importOnce(world, payload);
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'IMPORT_INVALID');
    assert.equal(result.barrierId, null);
    assert.equal(world.barrier.barriers().length, 0);
    assert.equal(world.segments.closeCalls(), 0);
    assert.equal(world.segments.openCalls(), 0);
    assert.equal(world.activation.commands().length, 0);
    assert.equal(world.queue.queue.usage.pending, 1);
    assert.deepEqual([...world.versions()], versionsBefore);
    assert.deepEqual([...world.checksums()], checksumsBefore);
    world.queue.queue.cancel(job.segmentId as string);
    await admission.ticket?.outcome;
  } finally {
    world.dispose();
  }
});

test('114 a structurally invalid or unknown-parent import is rejected closed', () => {
  const world = createProfileRestoreWorld();
  try {
    const broken = importOnce(world, { profileId: PIPELINE_PROFILE_ID });
    assert.equal(broken.status, 'REJECTED');
    assert.equal(broken.reason, 'IMPORT_INVALID');

    const orphan = importOnce(world, {
      ...world.importedProfile(),
      parentVersionId: 'missing-parent',
    });
    assert.equal(orphan.status, 'REJECTED');
    assert.equal(orphan.reason, 'IMPORT_INVALID');
    assert.equal(world.barrier.barriers().length, 0);
  } finally {
    world.dispose();
  }
});

test('114 a new profile creates a base version and commits a NEW_PROFILE barrier', () => {
  const world = createProfileRestoreWorld();
  try {
    const originals = world.versions(PIPELINE_PROFILE_ID);
    const otherBefore = world.versions(RESTORE_SECOND_PROFILE);
    const pending = newProfileFromBase(world.services, {
      playerId: 'player-1',
      profileId: RESTORE_SECOND_PROFILE,
      tick: world.tick.value,
    });
    assert.equal(pending.status, 'PENDING');
    assert.equal(pending.provenance, 'NEW_PROFILE');
    assert.equal(pending.versionCreated, true);
    assert.equal(pending.versionsAdded, 1);
    assert.equal(pending.versionId, 'base-profile-b-2');
    assert.deepEqual([...world.versions(PIPELINE_PROFILE_ID)], originals);
    assert.deepEqual(
      [...world.versions(RESTORE_SECOND_PROFILE)],
      [...otherBefore, 'base-profile-b-2'],
    );

    world.advanceTick();
    const committed = newProfileFromBase(world.services, {
      playerId: 'player-1',
      profileId: RESTORE_SECOND_PROFILE,
      tick: world.tick.value,
    });
    assert.equal(committed.status, 'COMMITTED');
    assert.equal(committed.reason, 'NEW_PROFILE');
    assert.equal(committed.activation?.origin, 'MANUAL_TUNING');
    assert.equal(committed.activation?.profileId, RESTORE_SECOND_PROFILE);
    assert.equal(committed.report.barrier?.reason, 'NEW_PROFILE');
    const created = world.store.getVersion('base-profile-b-2');
    assert.ok(created !== null);
    assert.equal(created.provenance.origin, 'BASE');
    assert.equal(Object.keys(created.parameters).length, 80);
    assert.deepEqual([...world.versions(PIPELINE_PROFILE_ID)], originals);
  } finally {
    world.dispose();
  }
});

test('114 a new profile without a pinned barrier is rejected before any store write', () => {
  const world = createProfileRestoreWorld();
  try {
    const versionsBefore = world.versions(PIPELINE_PROFILE_ID);
    const result = newProfileFromBase(
      { ...world.services, barrierFor: undefined },
      { playerId: 'player-1', profileId: 'profile-c', tick: world.tick.value },
    );
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'TARGET_PROFILE_MISMATCH');
    assert.deepEqual([...world.versions(PIPELINE_PROFILE_ID)], versionsBefore);
    assert.deepEqual([...world.versions('profile-c')], []);
  } finally {
    world.dispose();
  }
});

test('114 style reset activates the base version without missions or XP writes', () => {
  const world = createProfileRestoreWorld();
  try {
    assert.equal(commitRestore(world, world.targetVersionId).status, 'COMMITTED');
    const progress = { xp: 420, level: 3, missions: ['m1', 'm2'] };
    const snapshot = JSON.stringify(progress);
    const versionsBefore = world.versions();
    const checksumsBefore = world.checksums();
    const callsBefore = world.progression.calls();

    const pending = resetStyle(world.services, {
      profileId: PIPELINE_PROFILE_ID,
      tick: world.tick.value,
    });
    assert.equal(pending.status, 'PENDING');
    world.advanceTick();
    const committed = resetStyle(world.services, {
      profileId: PIPELINE_PROFILE_ID,
      tick: world.tick.value,
      progression: world.progression,
    });
    assert.equal(committed.status, 'COMMITTED');
    assert.equal(committed.provenance, 'RESET_STYLE');
    assert.equal(committed.versionId, world.baseVersionId);
    assert.equal(committed.activation?.origin, 'RESTORE');
    assert.equal(committed.versionsAdded, 0);
    assert.deepEqual([...world.versions()], versionsBefore);
    assert.deepEqual([...world.checksums()], checksumsBefore);
    assert.equal(world.progression.calls(), callsBefore);
    assert.deepEqual([...world.progression.names()], []);
    assert.equal(JSON.stringify(progress), snapshot);
  } finally {
    world.dispose();
  }
});

test('114 resetting an already active base is ALREADY_ACTIVE with zero progression calls', () => {
  const world = createProfileRestoreWorld();
  try {
    const result = resetStyle(world.services, {
      profileId: PIPELINE_PROFILE_ID,
      tick: world.tick.value,
      progression: world.progression,
    });
    assert.equal(result.status, 'ALREADY_ACTIVE');
    assert.equal(result.barrierId, null);
    assert.equal(world.progression.calls(), 0);
    assert.equal(world.barrier.barriers().length, 0);
  } finally {
    world.dispose();
  }
});

test('114 restore in an active session cancels the old job and preserves physical state', async () => {
  const world = createProfileRestoreWorld();
  try {
    const job = world.job({ segmentId: 'job-restore-114', order: 1 });
    const admission = world.queue.queue.submit(job);
    assert.equal(admission.status, 'QUEUED');
    assert.equal(world.barrier.trackJob(job).status, 'TRACKED');
    const physicalBefore = world.segments.port.physical();
    const versionsBefore = world.versions();

    assert.equal(restore(world, world.targetVersionId).status, 'PENDING');
    world.advanceTick();
    const committed = restore(world, world.targetVersionId);
    assert.equal(committed.status, 'COMMITTED');
    assert.equal(committed.report.barrier?.physicalPreserved, true);
    assert.deepEqual([...committed.report.barrier!.cancelledJobs], ['job-restore-114']);
    assert.equal(world.segments.port.physical(), physicalBefore);
    assert.equal(world.segments.closeCalls(), 1);
    assert.equal(world.segments.openCalls(), 1);
    const late = world.barrier.isCurrent(job);
    assert.equal(late.status, 'LATE_RESULT');
    assert.equal(late.reason, 'CANCELLED_BY_PROFILE_CHANGE');
    assert.deepEqual([...world.versions()], versionsBefore);
    const outcome = await admission.ticket?.outcome;
    assert.equal(outcome?.status, 'cancelled');
  } finally {
    world.dispose();
  }
});

test('114 results and reports are deeply frozen and deterministic', () => {
  const first = createProfileRestoreWorld();
  const second = createProfileRestoreWorld();
  try {
    const firstResult = importOnce(first, first.importedProfile());
    const secondResult = importOnce(second, second.importedProfile());
    assert.equal(Object.isFrozen(firstResult), true);
    assert.equal(Object.isFrozen(firstResult.report), true);
    assert.equal(Object.isFrozen(firstResult.report.store), true);
    assert.equal(Object.isFrozen(firstResult.report.barrier), true);
    assert.equal(JSON.stringify(firstResult.report), JSON.stringify(secondResult.report));
    assert.deepEqual(first.versions(), second.versions());
    assert.deepEqual(first.checksums(), second.checksums());
  } finally {
    first.dispose();
    second.dispose();
  }
});

test('114 import adds exactly one version and never edits an existing record', () => {
  const world = createProfileRestoreWorld();
  try {
    const before = world.checksums();
    const beforeVersions = world.versions();
    const committed = commitImport(world, world.importedProfile());
    assert.equal(committed.status, 'COMMITTED');
    assert.equal(world.versions().length, beforeVersions.length + 1);
    for (let index = 0; index < beforeVersions.length; index += 1) {
      assert.equal(world.versions()[index], beforeVersions[index]);
      assert.equal(world.checksums()[index], before[index]);
    }
    const stored = world.store.getVersion(RESTORE_IMPORTED);
    assert.ok(stored !== null);
    assert.equal(stored.checksum, world.store.getVersion(RESTORE_IMPORTED)?.checksum);
  } finally {
    world.dispose();
  }
});
