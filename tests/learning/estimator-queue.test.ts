import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLearningQueueRuntime } from '../../src/learning';
import { getParameterDefinition } from '../../src/profiles';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PLAYER_ID,
  PIPELINE_PROFILE_ID,
  PIPELINE_SESSION_ID,
  PIPELINE_WORLD_EPOCH,
  pipelineSegment,
} from '../harness/profile-pipeline-fixture';

test('273 the production 103/221 runtime composes a real learning proposal and acknowledges it', async () => {
  const runtime = createLearningQueueRuntime({ engineVersion: PIPELINE_ENGINE });
  try {
    const segment = pipelineSegment({ segmentId: 'runtime-job', order: 4 });
    const job = {
      playerId: PIPELINE_PLAYER_ID,
      profileId: PIPELINE_PROFILE_ID,
      learningEpoch: 1,
      baseVersionId: PIPELINE_BASE_VERSION,
      segmentId: segment.segmentId,
      mode: segment.mode,
      eligible: segment.eligible,
      order: segment.order,
      sessionId: PIPELINE_SESSION_ID,
      worldEpoch: PIPELINE_WORLD_EPOCH,
      key: segment.key,
      baseValue: segment.baseValue,
      evidence: segment.evidence,
      episodes: segment.episodes,
      candidate: segment.candidate,
    };
    const admission = runtime.queue.submit(job);
    assert.equal(admission.status, 'QUEUED');
    assert.ok(admission.ticket !== null);
    const outcome = await admission.ticket.outcome;
    assert.equal(outcome.status, 'composed');
    assert.ok(outcome.composition !== null);
    assert.equal(outcome.composition.key, segment.key);
    assert.equal(outcome.composition.learningEpoch, 1);
    assert.ok(outcome.composition.value !== segment.baseValue);
    assert.ok(outcome.measurement.endToEndMs >= 0);
    assert.ok(outcome.measurement.payloadBytes > 0);
    assert.equal(await runtime.queue.acknowledge(segment.segmentId), true);
    assert.equal(await runtime.queue.acknowledge(segment.segmentId), false);
    const definition = getParameterDefinition(segment.key);
    assert.ok(outcome.composition.value >= definition.min);
    assert.ok(outcome.composition.value <= definition.max);
  } finally {
    runtime.dispose();
  }
});
