import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LEARNING_EPOCH_VERSION,
  learningBarrierStatuses,
  learningChangeReasons,
  learningEpochDecisionStatuses,
  learningEpochRejectionCodes,
  learningGenerationStatuses,
} from '../../src/app';
import type { LearningChangeReason } from '../../src/app';
import { ContractValidationError } from '../../src/sessions';
import { PIPELINE_BASE_VERSION, PIPELINE_PROFILE_ID } from '../harness/profile-pipeline-fixture';
import { createEpochWorld } from '../harness/learning-epoch-fixture';
import type { EpochWorld } from '../harness/learning-epoch-fixture';

function change(
  world: EpochWorld,
  reason: LearningChangeReason,
  targetVersionId: string,
  importValid = true,
) {
  return world.barrier.requestChange({
    reason,
    targetProfileId: PIPELINE_PROFILE_ID,
    targetVersionId,
    importValid,
  });
}

test('205 the barrier exposes the closed contract and the monotone starting generation', () => {
  const world = createEpochWorld();
  try {
    assert.equal(LEARNING_EPOCH_VERSION, '205-learning-epoch-v1');
    assert.deepEqual([...learningChangeReasons], ['RESTORE', 'IMPORT', 'NEW_PROFILE']);
    assert.deepEqual(
      [...learningGenerationStatuses],
      ['OPEN', 'CLOSED', 'CANCELLED_BY_PROFILE_CHANGE'],
    );
    assert.deepEqual([...learningBarrierStatuses], ['PENDING', 'COMMITTED', 'ROLLED_BACK']);
    assert.equal(learningEpochRejectionCodes.includes('IMPORT_INVALID'), true);
    assert.equal(learningEpochRejectionCodes.includes('CHANGE_PENDING'), true);
    assert.deepEqual(
      [...learningEpochDecisionStatuses],
      ['CURRENT', 'STALE_GENERATION', 'DUPLICATE', 'LATE_RESULT', 'INVALID'],
    );
    const current = world.barrier.current();
    assert.equal(current.playerId, 'player-1');
    assert.equal(current.profileId, PIPELINE_PROFILE_ID);
    assert.equal(current.learningEpoch, 1);
    assert.equal(current.baseVersionId, PIPELINE_BASE_VERSION);
    assert.equal(current.segmentId, 'segment-g1');
    assert.equal(current.status, 'OPEN');
    assert.equal(current.closedTick, null);
    assert.deepEqual([...world.barrier.generations()], [current]);
    assert.equal(world.barrier.barriers().length, 0);
    assert.equal(world.barrier.pending(), null);
  } finally {
    world.dispose();
  }
});

test('205 restore with a queued learning job invalidates it and rejects the late result', async () => {
  const world = createEpochWorld();
  try {
    const job = world.job({ segmentId: 'job-restore', order: 1 });
    const admission = world.queue.queue.submit(job);
    assert.equal(admission.status, 'QUEUED');
    assert.ok(admission.ticket !== null);
    assert.equal(world.barrier.trackJob(job).status, 'TRACKED');
    const versionsBefore = world.store.listVersions(PIPELINE_PROFILE_ID).length;
    const request = change(world, 'RESTORE', world.targetVersionId);
    assert.equal(request.status, 'PENDING');
    assert.equal(request.barrier?.status, 'PENDING');
    assert.equal(request.barrier?.resolveAtTick, 1);
    assert.equal(request.barrier?.fromLearningEpoch, 1);
    assert.equal(request.barrier?.learningEpoch, 2);
    world.advanceTick();
    const applied = world.barrier.resolve();
    assert.equal(applied.status, 'APPLIED');
    assert.equal(applied.code, null);
    assert.equal(applied.barrier?.status, 'COMMITTED');
    assert.deepEqual([...applied.barrier!.cancelledJobs], ['job-restore']);
    assert.equal(applied.barrier?.activationCommandId, 'activation-0001');
    assert.equal(applied.barrier?.activationTick, 2);
    const outcome = await admission.ticket.outcome;
    assert.equal(outcome.status, 'cancelled');
    assert.equal(outcome.composition, null);
    const late = world.barrier.isCurrent(job);
    assert.equal(late.status, 'LATE_RESULT');
    assert.equal(late.reason, 'CANCELLED_BY_PROFILE_CHANGE');
    assert.equal(late.ignored, true);
    assert.equal(late.accepted, false);
    assert.equal(late.versionId, null);
    assert.equal(world.store.listVersions(PIPELINE_PROFILE_ID).length, versionsBefore);
    assert.equal(world.barrier.stats().invalidatedJobs, 1);
    assert.equal(world.barrier.stats().lateResults, 1);
    assert.equal(world.barrier.stats().changes, 1);
  } finally {
    world.dispose();
  }
});

test('205 the change closes with PROFILE_CHANGE and reopens the next epoch without physical loss', () => {
  const world = createEpochWorld();
  try {
    const physicalBefore = world.segments.port.physical();
    const request = change(world, 'NEW_PROFILE', world.targetVersionId);
    assert.equal(request.status, 'PENDING');
    world.advanceTick();
    const applied = world.barrier.resolve();
    assert.equal(applied.status, 'APPLIED');
    assert.equal(applied.barrier?.physicalPreserved, true);
    assert.equal(applied.barrier?.closedSegmentId, 'segment-g1');
    assert.equal(applied.barrier?.closedTick, 1);
    assert.equal(applied.barrier?.segmentId, 'city-profile:g2');
    assert.equal(applied.barrier?.openedTick, 1);
    assert.equal(world.segments.port.physical(), physicalBefore);
    const closed = world.segments.records.find((entry) => entry.segmentId === 'segment-g1');
    assert.equal(closed?.status, 'CLOSED');
    assert.equal(closed?.closeReason, 'PROFILE_CHANGE');
    assert.equal(closed?.closedTick, 1);
    const opened = world.segments.records.at(-1);
    assert.equal(opened?.segmentId, 'city-profile:g2');
    assert.equal(opened?.status, 'OPEN');
    assert.equal(opened?.openedTick, 1);
    assert.equal(opened?.learningEpoch, 2);
    assert.equal(opened?.baseVersionId, world.targetVersionId);
    const generation = world.barrier.current();
    assert.equal(generation.learningEpoch, 2);
    assert.equal(generation.baseVersionId, world.targetVersionId);
    assert.equal(generation.segmentId, 'city-profile:g2');
    assert.equal(generation.closedTick, null);
    assert.deepEqual(
      world.barrier.generations().map((entry) => entry.status),
      ['CANCELLED_BY_PROFILE_CHANGE', 'OPEN'],
    );
    assert.equal(world.barrier.generations()[0].closedTick, 1);
    assert.equal(world.barrier.stats().segmentsClosed, 1);
    assert.equal(world.barrier.stats().segmentsOpened, 1);
    assert.equal(world.segments.closeCalls(), 1);
    assert.equal(world.segments.openCalls(), 1);
  } finally {
    world.dispose();
  }
});

test('205 a valid import commits a barrier and the fleet adopts the target at the next common tick', () => {
  const world = createEpochWorld();
  try {
    const request = change(world, 'IMPORT', world.targetVersionId, true);
    assert.equal(request.status, 'PENDING');
    world.advanceTick();
    const applied = world.barrier.resolve();
    assert.equal(applied.status, 'APPLIED');
    assert.equal(applied.barrier?.reason, 'IMPORT');
    assert.equal(applied.barrier?.status, 'COMMITTED');
    const pending = world.activation.pending();
    assert.equal(pending?.versionId, world.targetVersionId);
    assert.equal(pending?.activateAtTick, 2);
    assert.equal(world.activation.commands()[0].origin, 'IMPORT');
    assert.deepEqual([...world.fleetVersions()], [PIPELINE_BASE_VERSION]);
    world.advanceTick();
    const report = world.activation.applyAt(world.tick.value);
    assert.equal(report.status, 'APPLIED');
    assert.deepEqual([...world.fleetVersions()], [world.targetVersionId]);
  } finally {
    world.dispose();
  }
});

test('205 an invalid import opens no barrier and leaves the queue, job and segment untouched', () => {
  const world = createEpochWorld();
  try {
    const job = world.job({ segmentId: 'job-import', order: 1 });
    const admission = world.queue.queue.submit(job);
    assert.equal(admission.status, 'QUEUED');
    assert.equal(world.queue.queue.usage.pending, 1);
    const rejectedBefore = world.barrier.stats().rejected;
    const result = change(world, 'IMPORT', world.targetVersionId, false);
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.code, 'IMPORT_INVALID');
    assert.equal(result.barrier, null);
    assert.equal(world.barrier.pending(), null);
    assert.equal(world.barrier.barriers().length, 0);
    assert.equal(world.barrier.current().learningEpoch, 1);
    assert.equal(world.barrier.current().segmentId, 'segment-g1');
    assert.equal(world.segments.closeCalls(), 0);
    assert.equal(world.segments.openCalls(), 0);
    assert.equal(world.queue.queue.usage.pending, 1);
    assert.equal(world.activation.commands().length, 0);
    assert.equal(world.barrier.stats().rejected, rejectedBefore + 1);
    assert.equal(world.barrier.resolve().status, 'NOTHING_PENDING');
    world.queue.queue.cancel('job-import');
  } finally {
    world.dispose();
  }
});

test('205 a new profile advances the epoch monotonically with a new stable segment identity', () => {
  const world = createEpochWorld();
  try {
    const first = change(world, 'NEW_PROFILE', world.targetVersionId);
    assert.equal(first.status, 'PENDING');
    assert.equal(first.barrier?.learningEpoch, 2);
    world.advanceTick();
    const appliedFirst = world.barrier.resolve();
    assert.equal(appliedFirst.status, 'APPLIED');
    assert.equal(appliedFirst.generation.learningEpoch, 2);
    assert.equal(appliedFirst.generation.segmentId, 'city-profile:g2');
    const second = change(world, 'NEW_PROFILE', world.nextVersionId);
    assert.equal(second.status, 'PENDING');
    assert.equal(second.barrier?.learningEpoch, 3);
    assert.equal(second.barrier?.fromBaseVersionId, world.targetVersionId);
    world.advanceTick();
    const appliedSecond = world.barrier.resolve();
    assert.equal(appliedSecond.status, 'APPLIED');
    assert.equal(appliedSecond.generation.learningEpoch, 3);
    assert.equal(appliedSecond.generation.baseVersionId, world.nextVersionId);
    assert.equal(appliedSecond.generation.segmentId, 'city-profile:g3');
    assert.equal(appliedSecond.barrier?.invalidatedActivations, 1);
    assert.deepEqual([...appliedSecond.barrier!.settledActivations], ['activation-0001']);
    assert.deepEqual(
      world.barrier.generations().map((entry) => entry.learningEpoch),
      [1, 2, 3],
    );
    assert.deepEqual(
      world.barrier.generations().map((entry) => entry.status),
      ['CANCELLED_BY_PROFILE_CHANGE', 'CANCELLED_BY_PROFILE_CHANGE', 'OPEN'],
    );
    assert.equal(world.barrier.stats().invalidatedActivations, 1);
    assert.deepEqual([...world.fleetVersions()], [world.targetVersionId]);
  } finally {
    world.dispose();
  }
});

test('205 a second target before the tick boundary is rejected CHANGE_PENDING', () => {
  const world = createEpochWorld();
  try {
    const first = change(world, 'RESTORE', world.targetVersionId);
    assert.equal(first.status, 'PENDING');
    const second = change(world, 'NEW_PROFILE', world.nextVersionId);
    assert.equal(second.status, 'REJECTED');
    assert.equal(second.code, 'CHANGE_PENDING');
    assert.equal(second.barrier, null);
    assert.equal(world.barrier.pending()?.barrierId, first.barrier?.barrierId);
    assert.equal(world.barrier.barriers().length, 1);
    assert.equal(world.barrier.stats().rejected, 1);
    world.advanceTick();
    const applied = world.barrier.resolve();
    assert.equal(applied.status, 'APPLIED');
    assert.equal(applied.barrier?.barrierId, first.barrier?.barrierId);
    assert.equal(applied.generation.baseVersionId, world.targetVersionId);
  } finally {
    world.dispose();
  }
});

test('205 a duplicate change request is idempotent and returns the existing barrier', () => {
  const world = createEpochWorld();
  try {
    const first = change(world, 'RESTORE', world.targetVersionId);
    const again = change(world, 'RESTORE', world.targetVersionId);
    assert.equal(again.status, 'DUPLICATE');
    assert.equal(again.code, null);
    assert.equal(again.barrier?.barrierId, first.barrier?.barrierId);
    assert.equal(again.barrier?.status, 'PENDING');
    assert.equal(world.barrier.barriers().length, 1);
    assert.equal(world.barrier.stats().duplicateRequests, 1);
    world.advanceTick();
    assert.equal(world.barrier.resolve().status, 'APPLIED');
    const afterCommit = change(world, 'RESTORE', world.targetVersionId);
    assert.equal(afterCommit.status, 'DUPLICATE');
    assert.equal(afterCommit.barrier?.status, 'COMMITTED');
    assert.equal(afterCommit.barrier?.barrierId, first.barrier?.barrierId);
    assert.equal(world.barrier.stats().duplicateRequests, 2);
    assert.equal(world.barrier.stats().changes, 1);
  } finally {
    world.dispose();
  }
});

test('205 a duplicate result is deduplicated and never creates a version', () => {
  const world = createEpochWorld();
  try {
    const versionsBefore = world.store.listVersions(PIPELINE_PROFILE_ID).length;
    const result = world.job({ segmentId: 'segment-g1', order: 1 });
    const first = world.barrier.isCurrent(result);
    assert.equal(first.status, 'CURRENT');
    assert.equal(first.accepted, true);
    assert.equal(first.ignored, false);
    assert.equal(first.versionId, null);
    const second = world.barrier.isCurrent(result);
    assert.equal(second.status, 'DUPLICATE');
    assert.equal(second.reason, 'DUPLICATE_RESULT');
    assert.equal(second.ignored, true);
    assert.equal(second.versionId, null);
    assert.equal(world.barrier.stats().duplicates, 1);
    assert.equal(world.store.listVersions(PIPELINE_PROFILE_ID).length, versionsBefore);
  } finally {
    world.dispose();
  }
});

test('205 a result from another epoch or base is STALE_GENERATION and ignored', () => {
  const world = createEpochWorld();
  try {
    const versionsBefore = world.store.listVersions(PIPELINE_PROFILE_ID).length;
    const epochResult = world.job({ segmentId: 'segment-g1', order: 1, learningEpoch: 2 });
    const byEpoch = world.barrier.isCurrent(epochResult);
    assert.equal(byEpoch.status, 'STALE_GENERATION');
    assert.equal(byEpoch.reason, 'EPOCH_MISMATCH');
    assert.equal(byEpoch.ignored, true);
    assert.equal(byEpoch.versionId, null);
    const baseResult = world.job({
      segmentId: 'segment-g1',
      order: 1,
      baseVersionId: 'profile-v9',
    });
    const byBase = world.barrier.isCurrent(baseResult);
    assert.equal(byBase.status, 'STALE_GENERATION');
    assert.equal(byBase.reason, 'BASE_MISMATCH');
    const segmentResult = world.job({ segmentId: 'segment-other', order: 1 });
    const bySegment = world.barrier.isCurrent(segmentResult);
    assert.equal(bySegment.status, 'STALE_GENERATION');
    assert.equal(bySegment.reason, 'SEGMENT_MISMATCH');
    assert.equal(world.barrier.stats().staleResults, 3);
    assert.equal(world.store.listVersions(PIPELINE_PROFILE_ID).length, versionsBefore);
  } finally {
    world.dispose();
  }
});

test('205 a result arriving after cancellation is a late result and creates no version', () => {
  const world = createEpochWorld();
  try {
    const job = world.job({ segmentId: 'job-late', order: 1 });
    assert.equal(world.queue.queue.submit(job).status, 'QUEUED');
    assert.equal(world.barrier.trackJob(job).status, 'TRACKED');
    change(world, 'RESTORE', world.targetVersionId);
    world.advanceTick();
    assert.equal(world.barrier.resolve().status, 'APPLIED');
    const versionsAfterBarrier = world.store.listVersions(PIPELINE_PROFILE_ID).length;
    const late = world.barrier.isCurrent(job);
    assert.equal(late.status, 'LATE_RESULT');
    assert.equal(late.reason, 'CANCELLED_BY_PROFILE_CHANGE');
    assert.equal(late.accepted, false);
    assert.equal(late.versionId, null);
    assert.equal(world.barrier.stats().lateResults, 1);
    assert.equal(world.store.listVersions(PIPELINE_PROFILE_ID).length, versionsAfterBarrier);
  } finally {
    world.dispose();
  }
});

test('205 trackJob accepts only the current generation and stays bounded', () => {
  const world = createEpochWorld();
  try {
    const foreign = world.job({ segmentId: 'segment-g1', order: 1, learningEpoch: 9 });
    const rejected = world.barrier.trackJob(foreign);
    assert.equal(rejected.status, 'STALE_GENERATION');
    assert.equal(rejected.reason, 'EPOCH_MISMATCH');
    assert.equal(world.barrier.stats().trackedJobs, 0);
    const current = world.job({ segmentId: 'segment-g1', order: 1 });
    assert.equal(world.barrier.trackJob(current).status, 'TRACKED');
    assert.equal(world.barrier.stats().trackedJobs, 1);
    assert.equal(world.barrier.trackJob(42).status, 'INVALID');
  } finally {
    world.dispose();
  }
});

test('205 an activation failure rolls back without a half-committed barrier', () => {
  const world = createEpochWorld();
  try {
    world.activation.dispose();
    const versionsBefore = world.store.listVersions(PIPELINE_PROFILE_ID).length;
    const fleetBefore = world.fleetVersions();
    assert.equal(change(world, 'RESTORE', world.targetVersionId).status, 'PENDING');
    world.advanceTick();
    const rolled = world.barrier.resolve();
    assert.equal(rolled.status, 'ROLLED_BACK');
    assert.equal(rolled.code, 'ACTIVATION_REJECTED');
    assert.equal(rolled.barrier?.status, 'ROLLED_BACK');
    assert.equal(rolled.barrier?.rollback?.exact, true);
    assert.equal(rolled.barrier?.rollback?.segmentRestored, true);
    assert.equal(rolled.barrier?.rollback?.activationPublished, false);
    assert.equal(rolled.barrier?.rollback?.activationCommandId, null);
    assert.equal(world.barrier.pending(), null);
    assert.equal(world.barrier.current().learningEpoch, 1);
    assert.equal(world.barrier.current().segmentId, 'segment-g1');
    assert.equal(world.segments.records.at(-1)?.segmentId, 'segment-g1');
    assert.equal(world.segments.records.at(-1)?.status, 'OPEN');
    assert.equal(world.barrier.generations().length, 1);
    assert.equal(world.barrier.stats().changes, 0);
    assert.equal(world.barrier.stats().rollbacks, 1);
    assert.equal(world.barrier.stats().segmentsClosed, 0);
    assert.equal(world.barrier.stats().segmentsOpened, 0);
    assert.equal(world.store.listVersions(PIPELINE_PROFILE_ID).length, versionsBefore);
    assert.deepEqual(world.fleetVersions(), fleetBefore);
  } finally {
    world.dispose();
  }
});

test('205 a physical change during the rotation rolls back with PHYSICAL_STATE_CHANGED', () => {
  const world = createEpochWorld({ mutatePhysicalOnClose: true });
  try {
    assert.equal(change(world, 'RESTORE', world.targetVersionId).status, 'PENDING');
    world.advanceTick();
    const rolled = world.barrier.resolve();
    assert.equal(rolled.status, 'ROLLED_BACK');
    assert.equal(rolled.code, 'PHYSICAL_STATE_CHANGED');
    assert.equal(rolled.barrier?.physicalPreserved, false);
    assert.equal(rolled.barrier?.rollback?.segmentRestored, true);
    assert.equal(rolled.barrier?.activationCommandId, null);
    assert.equal(world.barrier.current().learningEpoch, 1);
    assert.equal(world.segments.records.at(-1)?.segmentId, 'segment-g1');
    assert.equal(world.segments.records.at(-1)?.status, 'OPEN');
    assert.equal(world.segments.openCalls(), 1);
    assert.equal(world.activation.commands().length, 0);
    assert.equal(world.barrier.stats().changes, 0);
  } finally {
    world.dispose();
  }
});

test('205 barrier and generation history are bounded', () => {
  const world = createEpochWorld({ history: 1 });
  try {
    change(world, 'NEW_PROFILE', world.targetVersionId);
    world.advanceTick();
    assert.equal(world.barrier.resolve().status, 'APPLIED');
    change(world, 'NEW_PROFILE', world.nextVersionId);
    world.advanceTick();
    assert.equal(world.barrier.resolve().status, 'APPLIED');
    assert.equal(world.barrier.barriers().length, 1);
    assert.equal(world.barrier.barriers()[0].targetVersionId, world.nextVersionId);
    assert.equal(world.barrier.stats().barriers, 1);
    assert.equal(world.barrier.stats().droppedBarriers, 1);
    assert.deepEqual(
      world.barrier.generations().map((entry) => entry.learningEpoch),
      [2, 3],
    );
    assert.equal(world.barrier.stats().generations, 2);
  } finally {
    world.dispose();
  }
});

test('205 the barrier writes no version and mutates the fleet only through the intended activation', () => {
  const world = createEpochWorld();
  try {
    const versionsBefore = world.store.listVersions(PIPELINE_PROFILE_ID).length;
    const headBefore = world.store.getHistory(PIPELINE_PROFILE_ID).at(-1)?.versionId ?? null;
    const fleetBefore = world.fleetVersions();
    change(world, 'RESTORE', world.targetVersionId);
    assert.equal(
      world.store.listVersions(PIPELINE_PROFILE_ID).length,
      versionsBefore,
      'the request is pure',
    );
    world.advanceTick();
    assert.equal(world.barrier.resolve().status, 'APPLIED');
    assert.equal(world.store.listVersions(PIPELINE_PROFILE_ID).length, versionsBefore);
    assert.equal(world.store.getHistory(PIPELINE_PROFILE_ID).at(-1)?.versionId ?? null, headBefore);
    assert.deepEqual(world.fleetVersions(), fleetBefore);
    assert.equal(world.activation.commands().length, 1);
    assert.equal(world.activation.commands()[0].origin, 'RESTORE');
    assert.equal(world.activation.commands()[0].versionId, world.targetVersionId);
  } finally {
    world.dispose();
  }
});

test('205 dispose closes the current generation and rejects further changes', () => {
  const world = createEpochWorld();
  try {
    world.barrier.dispose();
    const current = world.barrier.current();
    assert.equal(current.status, 'CLOSED');
    assert.equal(current.closedTick, 0);
    const rejected = change(world, 'RESTORE', world.targetVersionId);
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.code, 'BARRIER_DISPOSED');
    assert.equal(world.barrier.resolve().status, 'REJECTED');
    assert.equal(world.barrier.stats().disposed, true);
  } finally {
    world.dispose();
  }
});

test('205 structural request errors throw the shared contract error', () => {
  const world = createEpochWorld();
  try {
    assert.throws(
      () =>
        world.barrier.requestChange({
          reason: 'RESTORE',
          targetProfileId: PIPELINE_PROFILE_ID,
          targetVersionId: world.targetVersionId,
        }),
      ContractValidationError,
    );
    assert.throws(
      () =>
        world.barrier.requestChange({
          reason: 'RESTORE',
          targetProfileId: PIPELINE_PROFILE_ID,
          targetVersionId: world.targetVersionId,
          importValid: true,
          extra: 1,
        }),
      ContractValidationError,
    );
  } finally {
    world.dispose();
  }
});
