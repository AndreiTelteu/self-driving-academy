import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getParameterDefinition } from '../../src/profiles';
import type { ProfileVersion } from '../../src/profiles';
import { createLiveLearningFixture } from '../harness/live-learning-fixture';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PROFILE_ID,
} from '../harness/profile-pipeline-fixture';

function deriveTarget(
  fixture: ReturnType<typeof createLiveLearningFixture>,
  versionId: string,
  parentVersionId: string,
  value: number,
): ProfileVersion {
  const definition = getParameterDefinition('speed_delta_urban');
  const result = fixture.pipelineWorld.store.derive({
    profileId: PIPELINE_PROFILE_ID,
    versionId,
    parentVersionId,
    segmentId: `fixture-${versionId}`,
    reason: 'fixture target version',
    delta: {
      profileVersionId: versionId,
      parentVersionId,
      engineVersion: PIPELINE_ENGINE,
      schemaVersion: 1,
      units: 'SI',
      values: [{ key: definition.key, unit: definition.unit, value }],
    },
  });
  assert.equal(result.status, 'ACCEPTED');
  return fixture.pipelineWorld.store.getVersion(versionId)!;
}

test('273 a MANUAL segment and an ineligible LEARNING segment create no job and no version', async () => {
  const fixture = createLiveLearningFixture({ ineligibleSegments: ['live-ineligible'] });
  try {
    fixture.drive({ segmentId: 'live-manual', mode: 'MANUAL', ticks: 600 });
    await fixture.settle(6);
    fixture.drive({
      segmentId: 'live-ineligible',
      mode: 'LEARNING',
      ticks: 600,
    });
    await fixture.settle(6);
    const read = fixture.live.read();
    assert.equal(read.stats.jobs, 0);
    assert.equal(read.stats.versions, 0);
    assert.ok(
      read.history.some(
        (row) => row.segmentId === 'live-manual' && row.status === 'SKIPPED_MANUAL',
      ),
    );
    assert.ok(
      read.history.some(
        (row) => row.segmentId === 'live-ineligible' && row.status === 'SKIPPED_INELIGIBLE',
      ),
    );
    assert.equal(fixture.applied.length, 0);
  } finally {
    fixture.dispose();
  }
});

test('273 an eligible segment without observable evidence submits one job and publishes no version', async () => {
  const fixture = createLiveLearningFixture();
  try {
    fixture.drive({
      segmentId: 'live-no-evidence',
      startDistanceM: 130,
      ticks: 1080,
      camera: false,
    });
    await fixture.settle(10);
    const read = fixture.live.read();
    assert.equal(read.stats.jobs, 1);
    assert.equal(read.stats.versions, 0);
    assert.equal(read.lastStatus, 'INSUFFICIENT_EVIDENCE');
    assert.equal(read.headVersionId, PIPELINE_BASE_VERSION);
    assert.equal(fixture.applied.length, 0);
    assert.equal(fixture.pipelineWorld.fleetVersions()[0], PIPELINE_BASE_VERSION);
  } finally {
    fixture.dispose();
  }
});

test('273 an eligible live segment composes one immutable version and activates it for the whole fleet', async () => {
  const fixture = createLiveLearningFixture();
  try {
    fixture.drive({
      segmentId: 'live-composed',
      startDistanceM: 130,
      ticks: 1080,
      speed: (tick, total) => (tick < total - 240 ? 9 : 2),
    });
    await fixture.settle(24);
    const read = fixture.live.read();
    assert.equal(read.stats.jobs, 1);
    assert.equal(read.stats.versions, 1);
    assert.equal(read.stats.stale, 0);
    assert.equal(read.lastStatus, 'COMPOSED');
    const versionId = read.headVersionId;
    assert.notEqual(versionId, PIPELINE_BASE_VERSION);
    const version = fixture.pipelineWorld.store.getVersion(versionId)!;
    assert.equal(version.parentVersionId, PIPELINE_BASE_VERSION);
    assert.equal(read.profile.versionId, versionId);
    assert.equal(read.cityStyle?.versionId, versionId);
    assert.equal(fixture.applied.length, 1);
    assert.equal(fixture.style.profile.versionId, versionId);
    assert.deepEqual(fixture.pipelineWorld.fleetVersions(), [versionId]);
    assert.ok(
      fixture.pipelineWorld.registry
        .list()
        .every(
          (vehicle) =>
            fixture.pipelineWorld.registry.state(vehicle.vehicleId)?.appliedProfileVersion ===
            versionId,
        ),
    );
    assert.notEqual(
      read.profile.parameters.speed_delta_residential,
      fixture.pipelineWorld.store.getVersion(PIPELINE_BASE_VERSION)!.parameters
        .speed_delta_residential,
    );
    assert.equal(read.stats.activationsPublished, 1);
    assert.equal(read.stats.activationsApplied, 1);
    assert.equal(fixture.applied[0]?.versionId, versionId);
    const history = fixture.live.history().find((row) => row.segmentId === 'live-composed');
    assert.equal(history?.versionId, versionId);
    assert.equal(history?.jobSubmitted, true);
    assert.equal(history?.evidenceReady, true);
  } finally {
    fixture.dispose();
  }
});

test('273 a foreign learning epoch is STALE_JOB before any job is submitted', async () => {
  const fixture = createLiveLearningFixture({ learningEpoch: 1 });
  try {
    fixture.drive({
      segmentId: 'live-foreign-epoch',
      startDistanceM: 130,
      ticks: 1080,
      learningEpoch: 2,
    });
    await fixture.settle(6);
    const read = fixture.live.read();
    assert.equal(read.stats.jobs, 0);
    assert.equal(read.stats.versions, 0);
    assert.equal(read.stats.stale, 1);
    const row = read.history.find((entry) => entry.segmentId === 'live-foreign-epoch');
    assert.equal(row?.status, 'STALE_JOB');
    assert.equal(row?.reason, 'EPOCH_MISMATCH');
    assert.equal(row?.jobSubmitted, false);
    assert.equal(fixture.pipelineWorld.store.listVersions(PIPELINE_PROFILE_ID).length, 1);
  } finally {
    fixture.dispose();
  }
});

test('273 restore increments the epoch, cancels the in-flight job and preserves the physical state', async () => {
  const fixture = createLiveLearningFixture();
  try {
    const target = deriveTarget(fixture, 'profile-v2', PIPELINE_BASE_VERSION, 2.5);
    fixture.drive({
      segmentId: 'live-restore-job',
      startDistanceM: 130,
      ticks: 1080,
      speed: (tick, total) => (tick < total - 240 ? 9 : 2),
    });
    const release = fixture.pipelineWorld.queue.defer('live-restore-job');
    await fixture.advance(1);
    const requested = fixture.live.requestProfileChange({
      reason: 'RESTORE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: target.versionId,
      importValid: true,
    }) as { readonly status: string };
    assert.equal(requested.status, 'PENDING');
    await fixture.advance(1);
    const applied = fixture.live.isCurrent({}) as { readonly status: string };
    assert.equal(applied.status, 'INVALID');
    release();
    await fixture.settle(20);
    const read = fixture.live.read();
    assert.equal(read.learningEpoch, 2);
    assert.equal(read.stats.epochChanges, 1);
    assert.equal(read.stats.physicalPreserved, 1);
    assert.equal(read.barrier.changes, 1);
    assert.equal(read.barrier.invalidatedJobs, 1);
    assert.equal(read.headVersionId, target.versionId);
    assert.equal(read.cityStyle?.versionId, target.versionId);
    assert.equal(read.stats.versions, 0);
    const row = read.history.find((entry) => entry.segmentId === 'live-restore-job');
    assert.equal(row?.status, 'STALE_JOB');
    assert.equal(row?.versionId, null);
    assert.equal(
      fixture.pipelineWorld.store.getVersion(read.headVersionId)?.checksum,
      target.checksum,
    );
    assert.deepEqual(fixture.pipelineWorld.fleetVersions(), [target.versionId]);
  } finally {
    fixture.dispose();
  }
});

test('273 an invalid import changes nothing; a valid import and a new profile advance the epoch once', async () => {
  const fixture = createLiveLearningFixture();
  try {
    const target = deriveTarget(fixture, 'profile-import', PIPELINE_BASE_VERSION, 1.4);
    const before = fixture.live.read();
    const invalid = fixture.live.requestProfileChange({
      reason: 'IMPORT',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: target.versionId,
      importValid: false,
    }) as { readonly status: string };
    assert.equal(invalid.status, 'REJECTED');
    assert.equal(fixture.live.read().learningEpoch, before.learningEpoch);
    const valid = fixture.live.requestProfileChange({
      reason: 'IMPORT',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: target.versionId,
      importValid: true,
    }) as { readonly status: string };
    assert.equal(valid.status, 'PENDING');
    await fixture.settle(12);
    const imported = fixture.live.read();
    assert.equal(imported.learningEpoch, 2);
    assert.equal(imported.stats.epochChanges, 1);
    assert.equal(imported.headVersionId, target.versionId);
    assert.deepEqual(fixture.pipelineWorld.fleetVersions(), [target.versionId]);

    const next = deriveTarget(fixture, 'profile-new', target.versionId, 3.1);
    const newProfile = fixture.live.requestProfileChange({
      reason: 'NEW_PROFILE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: next.versionId,
      importValid: true,
    }) as { readonly status: string };
    assert.equal(newProfile.status, 'PENDING');
    await fixture.settle(12);
    const changed = fixture.live.read();
    assert.equal(changed.learningEpoch, 3);
    assert.equal(changed.stats.epochChanges, 2);
    assert.equal(changed.headVersionId, next.versionId);
    assert.deepEqual(fixture.pipelineWorld.fleetVersions(), [next.versionId]);
    assert.equal(changed.stats.versions, 0);
  } finally {
    fixture.dispose();
  }
});
