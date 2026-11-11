import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_RESTORE_VERSION,
  isPausedAutoLaunch,
  restoreSession,
  sessionRestoreSkipCodes,
} from '../../src/persistence/index';
import type { LocalRepository, SessionRestoreResumed } from '../../src/persistence/index';
import {
  INVALID_TICK,
  RESTORE_LEARNING_EPOCH,
  RESTORE_PROFILE,
  RESTORE_SESSION,
  RESTORE_VERSIONS,
  VALID_CHECKPOINT,
  VALID_TICK,
  createInvalidOnlyHarness,
  createRestoreHarness,
  createSingleCheckpointHarness,
  repositoryFingerprint,
  storeEnvelopeMismatch,
} from './session-restore-fixture';

/**
 * PBI 136 target tests: a restart resumes the last valid checkpoint, skips a broken newer one with
 * its exact code, opens paused/AUTO with the input released, closes open segments as INCOMPLETE and
 * relaunches jobs only in the active learning epoch. Nothing is written and nothing is rewarded
 * twice.
 */

function resumed(result: Awaited<ReturnType<typeof restoreSession>>): SessionRestoreResumed {
  if (result.status !== 'RESUMABLE') {
    throw new Error(`expected RESUMABLE, got ${result.status}: ${JSON.stringify(result)}`);
  }
  return result;
}

test('the newest broken generation is skipped in favour of the last valid one', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(result.version, SESSION_RESTORE_VERSION);
    assert.equal(result.checkpointId, VALID_CHECKPOINT);
    assert.equal(result.tick, VALID_TICK);
    assert.equal(result.generation, 1);
    assert.equal(result.counts.candidates, 2);
    assert.equal(result.counts.skipped, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0]?.checkpointId, 'checkpoint-136-invalid-newest');
    assert.equal(result.skipped[0]?.tick, INVALID_TICK);
    assert.equal(result.skipped[0]?.code, 'CHECKSUM_MISMATCH');
    assert.equal(result.skipped[0]?.path, 'snapshot.checksum');
    assert(sessionRestoreSkipCodes.includes('CHECKSUM_MISMATCH'));
  } finally {
    harness.repository.close();
  }
});

test('the restart opens paused/AUTO, releases the input and never keeps MANUAL control', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(result.launch.mode, 'PAUSED_AUTO');
    assert.equal(result.launch.paused, true);
    assert.equal(result.launch.auto, true);
    assert.equal(result.launch.inputReleased, true);
    assert.equal(result.launch.manualVehicles, 0);
    assert.equal(result.launch.vehiclesInAuto, result.resume.vehicles.length);
    assert.equal(result.launch.previousManualVehicles, 1);
    assert(isPausedAutoLaunch(result.launch));
    assert.equal(result.resume.paused, true);
    assert.equal(result.resume.auto, true);
    assert.equal(result.resume.inputReleased, true);
    for (const vehicle of result.resume.vehicles) {
      assert.equal(vehicle.controlMode, 'AUTO');
      assert.equal(vehicle.inputReleased, true);
    }
    assert.equal(
      result.resume.vehicles.some((vehicle) => vehicle.controlMode !== 'AUTO'),
      false,
    );
  } finally {
    harness.repository.close();
  }
});

test('open segments become INCOMPLETE with the RELOAD reason and are counted, not lost', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(result.counts.openSegments, 1);
    assert.equal(result.counts.incompleteSegments, 1);
    assert.deepEqual(
      result.segments.map((segment) => [
        segment.segmentId,
        segment.previousStatus,
        segment.nextStatus,
        segment.reason,
      ]),
      [['segment-taxi-01', 'OPEN', 'INCOMPLETE', 'RELOAD']],
    );
    const openInSnapshot = result.state.segments.filter((segment) => segment.status === 'OPEN');
    assert.equal(openInSnapshot.length, 1);
  } finally {
    harness.repository.close();
  }
});

test('jobs relaunch only in the active profile and learning epoch', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(result.counts.jobsRelaunched, 2);
    assert.equal(result.counts.jobsInvalidated, 4);
    const relaunched = result.jobs.filter((job) => job.status === 'RELAUNCH');
    assert.deepEqual(relaunched.map((job) => job.jobId).sort(), ['dispatch-01', 'learning-01']);
    for (const job of relaunched) {
      assert.equal(job.reason, null);
      assert.equal(job.profileId, RESTORE_PROFILE);
      assert.equal(job.learningEpoch, RESTORE_LEARNING_EPOCH);
    }
    const invalidated = result.jobs.filter((job) => job.status === 'INVALIDATED');
    assert.equal(
      invalidated.every((job) => job.reason !== null),
      true,
    );
    assert.equal(invalidated.filter((job) => job.reason === 'LEARNING_EPOCH_MISMATCH').length, 2);
  } finally {
    harness.repository.close();
  }
});

test('an invalid learning epoch invalidates every job explicitly and counts it', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, {
        versions: RESTORE_VERSIONS,
        currentLearningEpoch: RESTORE_LEARNING_EPOCH + 1,
      }),
    );
    assert.equal(result.learningEpoch, RESTORE_LEARNING_EPOCH + 1);
    assert.equal(result.counts.jobsRelaunched, 0);
    assert.equal(result.counts.jobsInvalidated, 6);
    assert.equal(
      result.jobs.every(
        (job) =>
          job.status === 'INVALIDATED' &&
          (job.reason === 'LEARNING_EPOCH_MISMATCH' || job.reason === 'PROFILE_AND_EPOCH_MISMATCH'),
      ),
      true,
    );
    assert.equal(result.counts.incompleteSegments, 1);
  } finally {
    harness.repository.close();
  }
});

test('a changed profile invalidates the jobs of the old profile', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, {
        versions: RESTORE_VERSIONS,
        currentProfileId: 'profile-2',
      }),
    );
    assert.equal(result.profileId, 'profile-2');
    assert.equal(result.counts.jobsRelaunched, 2);
    assert.equal(result.counts.jobsInvalidated, 4);
    assert.deepEqual(
      result.jobs
        .filter((job) => job.status === 'RELAUNCH')
        .map((job) => job.jobId)
        .sort(),
      ['dispatch-02', 'learning-03'],
    );
    assert.equal(
      result.jobs
        .filter((job) => job.status === 'INVALIDATED')
        .every(
          (job) => job.reason === 'PROFILE_MISMATCH' || job.reason === 'PROFILE_AND_EPOCH_MISMATCH',
        ),
      true,
    );
  } finally {
    harness.repository.close();
  }
});

test('an incoherent envelope is skipped with its own code', async () => {
  const harness = await createRestoreHarness();
  try {
    await storeEnvelopeMismatch(harness.repository, harness);
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(result.counts.candidates, 3);
    assert.equal(result.skipped.length, 2);
    assert.deepEqual(
      result.skipped.map((entry) => entry.code),
      ['CHECKSUM_MISMATCH', 'LEARNING_EPOCH_MISMATCH'],
    );
    assert.equal(result.checkpointId, VALID_CHECKPOINT);
  } finally {
    harness.repository.close();
  }
});

test('completed observations replay idempotently and no reward is reapplied', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(result.counts.observationsReplayed, 2);
    assert.equal(result.counts.observationsAlreadyRewarded, 1);
    assert.equal(result.resume.rewardsReapplied, 0);
    assert.equal(result.ledger.rewardsReapplied, 0);
    assert.equal(result.counts.acceptedResultsPreserved, result.resume.acceptedResultsPreserved);
    assert.equal(
      result.resume.observations.every((observation) => observation.status === 'REPLAY'),
      true,
    );
    assert.equal(
      new Set(result.resume.observations.map((observation) => observation.idempotencyKey)).size,
      2,
    );
  } finally {
    harness.repository.close();
  }
});

test('the durable ledger of the session continues and is digested', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(result.ledger.rows, 2);
    assert.match(result.ledger.digest, /^[0-9a-f]{64}$/);
    const again = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(again.ledger.digest, result.ledger.digest);
  } finally {
    harness.repository.close();
  }
});

test('restore is read-only: the database fingerprint does not change', async () => {
  const harness = await createRestoreHarness();
  try {
    const before = await repositoryFingerprint(harness.repository);
    resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    const after = await repositoryFingerprint(harness.repository);
    assert.equal(after, before);
  } finally {
    harness.repository.close();
  }
});

test('the age is reported in ticks and never read from a clock', async () => {
  const harness = await createRestoreHarness();
  try {
    const aged = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, {
        versions: RESTORE_VERSIONS,
        currentTick: VALID_TICK + 45,
      }),
    );
    assert.equal(aged.ageTicks, 45);
    const unaged = resumed(
      await restoreSession(harness.repository, RESTORE_SESSION, { versions: RESTORE_VERSIONS }),
    );
    assert.equal(unaged.ageTicks, null);
  } finally {
    harness.repository.close();
  }
});

test('a session without checkpoints is EMPTY, not an error', async () => {
  const harness = await createRestoreHarness();
  try {
    const result = await restoreSession(harness.repository, 'session-without-checkpoints', {
      versions: RESTORE_VERSIONS,
    });
    assert.equal(result.status, 'EMPTY');
    if (result.status === 'EMPTY') {
      assert.equal(result.code, 'NO_CHECKPOINT');
      assert.equal(result.counts.candidates, 0);
      assert.equal(result.skipped.length, 0);
    }
  } finally {
    harness.repository.close();
  }
});

test('a session whose only generation is broken is BLOCKED with the exact skip', async () => {
  const harness = await createInvalidOnlyHarness();
  try {
    const result = await restoreSession(harness.repository, RESTORE_SESSION, {
      versions: RESTORE_VERSIONS,
    });
    assert.equal(result.status, 'BLOCKED');
    if (result.status === 'BLOCKED') {
      assert.equal(result.code, 'CHECKPOINT_INVALID');
      assert.equal(result.counts.candidates, 1);
      assert.equal(result.counts.skipped, 1);
      assert.equal(result.skipped[0]?.code, 'CHECKSUM_MISMATCH');
    }
  } finally {
    harness.repository.close();
  }
});

test('an incompatible engine, physics or map version is an explicit block', async () => {
  const harness = await createSingleCheckpointHarness();
  try {
    const result = await restoreSession(harness.repository, RESTORE_SESSION, {
      versions: { ...RESTORE_VERSIONS, physicsVersion: 'rapier-0.22.0' },
    });
    assert.equal(result.status, 'BLOCKED');
    if (result.status === 'BLOCKED') {
      assert.equal(result.code, 'CHECKPOINT_INVALID');
      assert.equal(result.skipped[0]?.code, 'INCOMPATIBLE_VERSION');
      assert.equal(
        result.skipped[0]?.message,
        'physicsVersion: stored rapier-0.21.0, current rapier-0.22.0',
      );
    }
  } finally {
    harness.repository.close();
  }
});

test('the candidate budget bounds what a restart is willing to decode', async () => {
  const harness = await createRestoreHarness();
  try {
    const limited = await restoreSession(harness.repository, RESTORE_SESSION, {
      versions: RESTORE_VERSIONS,
      maxCandidates: 1,
    });
    assert.equal(limited.status, 'BLOCKED');
    if (limited.status === 'BLOCKED') {
      assert.equal(limited.counts.candidates, 1);
      assert.equal(limited.skipped[0]?.code, 'CHECKSUM_MISMATCH');
    }
    const invalidBudget = await restoreSession(harness.repository, RESTORE_SESSION, {
      versions: RESTORE_VERSIONS,
      maxCandidates: 0,
    });
    assert.equal(invalidBudget.status, 'BLOCKED');
    if (invalidBudget.status === 'BLOCKED') assert.equal(invalidBudget.code, 'INVALID_REQUEST');
  } finally {
    harness.repository.close();
  }
});

test('an unreadable ledger blocks the resume instead of promising a world without it', async () => {
  const harness = await createRestoreHarness();
  try {
    const failing = Object.freeze({
      ...harness.repository,
      listProgress: () => Promise.reject(new Error('ledger read failed')),
    }) as LocalRepository;
    const result = await restoreSession(failing, RESTORE_SESSION, { versions: RESTORE_VERSIONS });
    assert.equal(result.status, 'BLOCKED');
    if (result.status === 'BLOCKED') {
      assert.equal(result.code, 'LEDGER_UNREADABLE');
      assert.match(result.message, /ledger read failed/);
    }
  } finally {
    harness.repository.close();
  }
});

test('an invalid session identity is refused without touching the database', async () => {
  const harness = await createRestoreHarness();
  try {
    for (const value of ['', ' session-136', 'x'.repeat(300)]) {
      const result = await restoreSession(harness.repository, value, {
        versions: RESTORE_VERSIONS,
      });
      assert.equal(result.status, 'BLOCKED');
      if (result.status === 'BLOCKED') assert.equal(result.code, 'INVALID_REQUEST');
    }
  } finally {
    harness.repository.close();
  }
});

test('listCheckpoints returns newest first and bounds the list', async () => {
  const harness = await createRestoreHarness();
  try {
    const rows = await harness.repository.listCheckpoints(RESTORE_SESSION);
    assert.deepEqual(
      rows.map((row) => [row.checkpointId, row.tick, row.generation]),
      [
        ['checkpoint-136-invalid-newest', INVALID_TICK, 2],
        [VALID_CHECKPOINT, VALID_TICK, 1],
      ],
    );
    assert.equal((await harness.repository.listCheckpoints('session-absent')).length, 0);
  } finally {
    harness.repository.close();
  }
});
