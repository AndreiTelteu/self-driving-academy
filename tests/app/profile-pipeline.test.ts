import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROFILE_PIPELINE_VERSION,
  profilePipelineReasons,
  profilePipelineStatuses,
} from '../../src/app';
import type {
  ProfilePipelineContinuity,
  ProfilePipelineContinuityInput,
  ProfilePipelineContinuityResult,
  ProfileSegmentSource,
} from '../../src/app';
import type { ProfileDeltaValidator, ProfileStore } from '../../src/profiles';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_PROFILE_ID,
  createPipelineWorld,
  pipelineFold,
  pipelineSegment,
} from '../harness/profile-pipeline-fixture';

function versions(store: ProfileStore): number {
  return store.listVersions(PIPELINE_PROFILE_ID).length;
}

/** 102-shaped rejection used only to prove that the pipeline never writes without the gate. */
const rejectingDelta: ProfileDeltaValidator = () =>
  Object.freeze({
    status: 'REJECTED' as const,
    rejections: Object.freeze([{ code: 'VALUE_OUT_OF_RANGE' }]),
  });

test('112 an eligible LEARNING segment produces one published version', async () => {
  const world = createPipelineWorld();
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'segment-1', order: 1 }),
    );
    assert.equal(PROFILE_PIPELINE_VERSION, '112-profile-pipeline-v1');
    assert.equal(result.status, 'COMPOSED');
    assert.equal(result.reason, null);
    assert.equal(result.versionId, 'segment-1~112');
    assert.equal(result.parentVersionId, PIPELINE_BASE_VERSION);
    assert.equal(result.jobSubmitted, true);
    assert.equal(result.deduplicated, false);
    assert.equal(result.composition?.value, pipelineFold(1.5, 4));
    assert.equal(result.composition?.appliedSegments.length, 1);
    assert.equal(result.activation?.status, 'PENDING');
    assert.equal(result.activation?.activateAtTick, 1);
    assert.equal(versions(world.store), 2);
    assert.equal(world.pipeline.head(), 'segment-1~112');
    assert.equal(world.pipeline.stats().versions, 1);
    assert.equal(world.pipeline.stats().jobs, 1);
    assert.equal(world.queue.starts.length, 1);
    const version = world.store.getVersion('segment-1~112');
    assert.equal(version?.parameters.speed_delta_urban, pipelineFold(1.5, 4));
    assert.equal(version?.provenance.delta?.segmentId, 'segment-1');
  } finally {
    world.dispose();
  }
});

test('112 two consecutive interventions chain v1 then v2 with the explicit parent', async () => {
  const world = createPipelineWorld();
  try {
    const results = await world.pipeline.processInterventions([
      pipelineSegment({ segmentId: 'segment-1', order: 1 }),
      pipelineSegment({ segmentId: 'segment-2', order: 2, baseValue: pipelineFold(1.5, 4) }),
    ]);
    assert.deepEqual(
      results.map((entry) => entry.status),
      ['COMPOSED', 'COMPOSED'],
    );
    assert.equal(results[0].versionId, 'segment-1~112');
    assert.equal(results[1].versionId, 'segment-2~112');
    assert.equal(results[1].parentVersionId, 'segment-1~112');
    const history = world.store.getHistory(PIPELINE_PROFILE_ID);
    assert.deepEqual(
      history.map((version) => version.versionId),
      [PIPELINE_BASE_VERSION, 'segment-1~112', 'segment-2~112'],
    );
    assert.equal(history[2].parentVersionId, 'segment-1~112');
    assert.equal(history[2].depth, 2);
    assert.deepEqual(history[2].provenance.sourceSegmentIds, ['segment-1', 'segment-2']);
    assert.equal(world.pipeline.stats().versions, 2);
    assert.equal(world.pipeline.stats().activationsPublished, 2);
    assert.equal(world.pipeline.stats().activationsApplied, 1);
    // The first command is applied at the common tick before the second intervention.
    assert.deepEqual(world.fleetVersions(), ['segment-1~112']);
    assert.equal(world.pipeline.head(), 'segment-2~112');
  } finally {
    world.dispose();
  }
});

test('112 MANUAL creates no learning job, version or activation', async () => {
  const world = createPipelineWorld();
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'manual-1', order: 1, mode: 'MANUAL' }),
    );
    assert.equal(result.status, 'SKIPPED_MANUAL');
    assert.equal(result.reason, 'MANUAL_SEGMENT_NOT_LEARNABLE');
    assert.equal(result.jobSubmitted, false);
    assert.equal(result.versionId, null);
    assert.equal(result.activation, null);
    assert.equal(world.queue.starts.length, 0);
    assert.equal(versions(world.store), 1);
    assert.equal(world.activation.commands().length, 0);
    assert.equal(world.pipeline.stats().manualSkipped, 1);
    assert.equal(world.pipeline.stats().jobs, 0);
    assert.equal(world.pipeline.head(), PIPELINE_BASE_VERSION);
  } finally {
    world.dispose();
  }
});

test('112 AUTO is skipped with its own closed reason and never queued', async () => {
  const world = createPipelineWorld();
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'auto-1', order: 1, mode: 'AUTO' }),
    );
    assert.equal(result.status, 'SKIPPED_MANUAL');
    assert.equal(result.reason, 'AUTO_SEGMENT_NOT_LEARNABLE');
    assert.equal(world.queue.starts.length, 0);
    assert.equal(versions(world.store), 1);
  } finally {
    world.dispose();
  }
});

test('112 an ineligible LEARNING segment creates no job and no version', async () => {
  const world = createPipelineWorld();
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'ineligible-1', order: 1, eligible: false }),
    );
    assert.equal(result.status, 'SKIPPED_INELIGIBLE');
    assert.equal(result.reason, 'SEGMENT_INELIGIBLE');
    assert.equal(world.queue.starts.length, 0);
    assert.equal(versions(world.store), 1);
    assert.equal(world.pipeline.stats().ineligibleSkipped, 1);
  } finally {
    world.dispose();
  }
});

test('112 a composed result without a real change creates no version', async () => {
  const world = createPipelineWorld();
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'flat-1', order: 1, candidateValue: 1.5 }),
    );
    assert.equal(result.status, 'NO_CHANGE');
    assert.equal(result.reason, 'NO_CHANGE');
    assert.equal(result.jobSubmitted, true);
    assert.equal(result.versionId, null);
    assert.equal(result.activation, null);
    assert.equal(result.composition?.value, 1.5);
    assert.equal(versions(world.store), 1);
    assert.equal(world.activation.commands().length, 0);
    assert.equal(world.pipeline.stats().noChange, 1);
    assert.equal(world.pipeline.stats().versions, 0);
    assert.equal(world.pipeline.head(), PIPELINE_BASE_VERSION);

    const duplicate = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'flat-1', order: 1, candidateValue: 1.5 }),
    );
    assert.equal(duplicate.status, 'NO_CHANGE');
    assert.equal(duplicate.deduplicated, true);
    assert.equal(duplicate.jobSubmitted, false);
    assert.equal(world.queue.starts.length, 1, 'the duplicate never reaches the queue');
    assert.equal(versions(world.store), 1);
  } finally {
    world.dispose();
  }
});

test('112 a duplicate segment returns the stored version without a second job', async () => {
  const world = createPipelineWorld();
  try {
    const first = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'segment-1', order: 1 }),
    );
    const duplicate = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'segment-1', order: 1 }),
    );
    assert.equal(first.status, 'COMPOSED');
    assert.equal(duplicate.status, 'DEDUPLICATED');
    assert.equal(duplicate.versionId, first.versionId);
    assert.equal(duplicate.deduplicated, true);
    assert.equal(duplicate.jobSubmitted, false);
    assert.equal(duplicate.activation, null);
    assert.equal(world.queue.starts.length, 1);
    assert.equal(versions(world.store), 2);
    assert.equal(world.store.stats().deduplicated, 1);
    assert.equal(world.pipeline.stats().deduplicated, 1);
    assert.equal(world.pipeline.stats().versions, 1);
  } finally {
    world.dispose();
  }
});

test('112 a superseded result in the same generation is explicitly recomposed', async () => {
  const world = createPipelineWorld();
  try {
    const late = await world.pipeline.onSegmentClosed(
      pipelineSegment({
        segmentId: 'segment-late',
        order: 2,
        candidateValue: -2,
        baseVersionId: PIPELINE_BASE_VERSION,
      }),
    );
    assert.equal(late.status, 'COMPOSED');
    assert.equal(late.composition?.recomposed, false);
    const versionBefore = versions(world.store);
    world.advanceTick();

    const recomposed = await world.pipeline.onSegmentClosed(
      pipelineSegment({
        segmentId: 'segment-early',
        order: 1,
        candidateValue: 4,
        baseVersionId: PIPELINE_BASE_VERSION,
      }),
    );
    assert.equal(recomposed.status, 'RECOMPOSED');
    assert.equal(recomposed.composition?.recomposed, true);
    assert.deepEqual(recomposed.composition?.appliedOrders, [1, 2]);
    assert.deepEqual(recomposed.composition?.appliedSegments, ['segment-early', 'segment-late']);
    assert.equal(recomposed.composition?.value, pipelineFold(pipelineFold(1.5, 4), -2));
    assert.equal(recomposed.versionId, 'segment-early~112');
    assert.equal(recomposed.parentVersionId, 'segment-late~112');
    assert.equal(recomposed.activation?.status, 'PENDING');
    assert.equal(recomposed.activation?.activateAtTick, 2);
    assert.equal(versions(world.store), versionBefore + 1);
    assert.equal(world.pipeline.stats().recomposed, 1);
    assert.deepEqual(
      world.store.getHistory(PIPELINE_PROFILE_ID).map((version) => version.versionId),
      [PIPELINE_BASE_VERSION, 'segment-late~112', 'segment-early~112'],
    );
  } finally {
    world.dispose();
  }
});

test('112 a segment from another learning epoch is a stale job', async () => {
  const world = createPipelineWorld();
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'epoch-2', order: 1, learningEpoch: 2 }),
    );
    assert.equal(result.status, 'STALE_JOB');
    assert.equal(result.reason, 'EPOCH_MISMATCH');
    assert.equal(result.jobSubmitted, false);
    assert.equal(world.queue.starts.length, 0);
    assert.equal(versions(world.store), 1);
    assert.equal(world.pipeline.stats().stale, 1);
  } finally {
    world.dispose();
  }
});

test('112 a segment observed against an unknown base is a stale job', async () => {
  const world = createPipelineWorld();
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'base-miss', order: 1, baseVersionId: 'profile-v0' }),
    );
    assert.equal(result.status, 'STALE_JOB');
    assert.equal(result.reason, 'BASE_MISMATCH');
    assert.equal(result.jobSubmitted, false);
    assert.equal(world.queue.starts.length, 0);
    assert.equal(versions(world.store), 1);
  } finally {
    world.dispose();
  }
});

test('112 an estimator error fails with the real reason and writes nothing', async () => {
  const world = createPipelineWorld();
  try {
    world.queue.plan('segment-error', 'error');
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'segment-error', order: 1 }),
    );
    assert.equal(result.status, 'FAILED');
    assert.equal(result.reason, 'LEARNING_JOB_FAILED');
    assert.equal(result.code, 'RESULT_INVALID');
    assert.match(result.detail ?? '', /Synthetic estimator failure/);
    assert.equal(result.versionId, null);
    assert.equal(result.activation, null);
    assert.equal(versions(world.store), 1);
    assert.equal(world.activation.commands().length, 0);
    assert.equal(world.pipeline.stats().failed, 1);
  } finally {
    world.dispose();
  }
});

test('112 a rejected 102 delta gate leaves no version behind', async () => {
  const world = createPipelineWorld({ delta: rejectingDelta });
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'segment-delta', order: 1 }),
    );
    assert.equal(result.status, 'FAILED');
    assert.equal(result.reason, 'DELTA_REJECTED');
    assert.equal(result.code, 'VALUE_OUT_OF_RANGE');
    assert.equal(result.versionId, null);
    assert.equal(versions(world.store), 1);
    assert.equal(world.store.getInterventionVersion(PIPELINE_PROFILE_ID, 'segment-delta'), null);
    assert.equal(world.pipeline.head(), PIPELINE_BASE_VERSION);
  } finally {
    world.dispose();
  }
});

test('112 a rejected 103 admission fails without a version', async () => {
  const world = createPipelineWorld();
  try {
    const first = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'segment-1', order: 1 }),
    );
    assert.equal(first.status, 'COMPOSED');
    // The same intervention order is already owned inside the epoch generation.
    const conflict = await world.pipeline.onSegmentClosed(
      pipelineSegment({
        segmentId: 'segment-conflict',
        order: 1,
        baseVersionId: PIPELINE_BASE_VERSION,
      }),
    );
    assert.equal(conflict.status, 'FAILED');
    assert.equal(conflict.reason, 'LEARNING_JOB_REJECTED');
    assert.equal(conflict.code, 'ORDER_CONFLICT');
    assert.equal(conflict.versionId, null);
    assert.equal(versions(world.store), 2);
  } finally {
    world.dispose();
  }
});

test('112 the publication is applied at the next common tick', async () => {
  const world = createPipelineWorld();
  try {
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'segment-1', order: 1 }),
    );
    assert.equal(result.activation?.activateAtTick, 1);
    assert.equal(world.activation.pending()?.versionId, 'segment-1~112');
    const early = world.pipeline.advance();
    assert.equal(early?.status, 'PENDING');
    assert.equal(early?.versionId, 'segment-1~112');
    assert.deepEqual(world.fleetVersions(), [PIPELINE_BASE_VERSION]);
    world.tick.value = 1;
    const applied = world.pipeline.advance();
    assert.equal(applied?.status, 'APPLIED');
    assert.equal(applied?.appliedTick, 1);
    assert.equal(applied?.versionId, 'segment-1~112');
    assert.equal(applied?.updated, world.registry.list().length);
    assert.deepEqual(world.fleetVersions(), ['segment-1~112']);
    assert.equal(world.activation.pending(), null);
    assert.equal(world.pipeline.stats().activationsApplied, 1);
  } finally {
    world.dispose();
  }
});

test('112 the 111 guard observes the activation without repairing it', async () => {
  const observed: ProfilePipelineContinuityInput[] = [];
  let verdict: ProfilePipelineContinuityResult = Object.freeze({
    status: 'APPLIED',
    violations: Object.freeze([]),
  });
  const continuity: ProfilePipelineContinuity = {
    verify(input) {
      observed.push(input);
      return verdict;
    },
  };
  const world = createPipelineWorld({ continuity });
  try {
    await world.pipeline.onSegmentClosed(pipelineSegment({ segmentId: 'segment-1', order: 1 }));
    world.tick.value = 1;
    const applied = world.pipeline.advance();
    assert.equal(applied?.continuity?.status, 'APPLIED');
    assert.equal(observed.length, 1);
    assert.equal(observed[0].versionId, 'segment-1~112');
    assert.equal(observed[0].appliedAtTick, 1);

    verdict = Object.freeze({
      status: 'BLOCKED',
      violations: Object.freeze(['OPPORTUNITY_RESAMPLED']),
    });
    await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'segment-2', order: 2, baseValue: pipelineFold(1.5, 4) }),
    );
    world.tick.value = 2;
    const blocked = world.pipeline.advance();
    assert.equal(blocked?.continuity?.status, 'BLOCKED');
    assert.deepEqual(blocked?.continuity?.violations, ['OPPORTUNITY_RESAMPLED']);
    assert.equal(versions(world.store), 3, 'the guard never repairs or deletes a version');
    assert.equal(world.pipeline.head(), 'segment-2~112');
  } finally {
    world.dispose();
  }
});

test('112 retained history is bounded and reported', async () => {
  const world = createPipelineWorld({ history: 4 });
  try {
    for (let index = 1; index <= 6; index += 1) {
      const result = await world.pipeline.onSegmentClosed(
        pipelineSegment({ segmentId: `flat-${index}`, order: index, candidateValue: 1.5 }),
      );
      assert.equal(result.status, 'NO_CHANGE');
    }
    assert.equal(world.pipeline.history().length, 4);
    assert.deepEqual(
      world.pipeline.history().map((entry) => entry.segmentId),
      ['flat-3', 'flat-4', 'flat-5', 'flat-6'],
    );
    assert.equal(world.pipeline.stats().history, 4);
    assert.equal(world.pipeline.stats().dropped, 2);
    assert.equal(world.pipeline.stats().segments, 6);
    assert.equal(world.pipeline.stats().noChange, 6);
    assert.equal(versions(world.store), 1);
  } finally {
    world.dispose();
  }
});

test('112 the segment source resolves identities and reports a missing segment', async () => {
  const record = pipelineSegment({ segmentId: 'segment-source', order: 1 });
  const source: ProfileSegmentSource = {
    read(segmentId) {
      return segmentId === 'segment-source' ? record : null;
    },
  };
  const world = createPipelineWorld({ segments: source });
  try {
    const resolved = await world.pipeline.onSegmentClosed({ segmentId: 'segment-source' });
    assert.equal(resolved.status, 'COMPOSED');
    assert.equal(resolved.versionId, 'segment-source~112');
    const missing = await world.pipeline.onSegmentClosed({ segmentId: 'segment-missing' });
    assert.equal(missing.status, 'FAILED');
    assert.equal(missing.reason, 'SEGMENT_NOT_FOUND');
    assert.equal(missing.segmentId, 'segment-missing');
    assert.equal(versions(world.store), 2);
    assert.equal(world.pipeline.stats().jobs, 1);
  } finally {
    world.dispose();
  }
});

test('112 a disposed pipeline refuses segments without writing', async () => {
  const world = createPipelineWorld();
  try {
    world.pipeline.dispose();
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'after-dispose', order: 1 }),
    );
    assert.equal(result.status, 'FAILED');
    assert.equal(result.reason, 'PIPELINE_DISPOSED');
    assert.equal(world.queue.starts.length, 0);
    assert.equal(versions(world.store), 1);
    assert.equal(world.pipeline.stats().disposed, true);
  } finally {
    world.dispose();
  }
});

test('112 the contract vocabulary is closed', () => {
  assert.deepEqual(
    [...profilePipelineStatuses],
    [
      'COMPOSED',
      'RECOMPOSED',
      'NO_CHANGE',
      'DEDUPLICATED',
      'SKIPPED_MANUAL',
      'SKIPPED_INELIGIBLE',
      'STALE_JOB',
      'FAILED',
    ],
  );
  assert.equal(new Set(profilePipelineReasons).size, profilePipelineReasons.length);
  assert.equal(profilePipelineReasons.includes('MANUAL_SEGMENT_NOT_LEARNABLE'), true);
  assert.equal(profilePipelineReasons.includes('NO_CHANGE'), true);
  assert.equal(profilePipelineReasons.includes('BASE_SUPERSEDED'), true);
});
