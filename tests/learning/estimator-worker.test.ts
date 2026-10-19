import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { WorkerClient, WorkerResourceGovernor } from '../../src/workers';
import type { Packet, Transport } from '../../src/workers';
import {
  LearningEstimatorQueue,
  blendProfileValue,
  createLearningEstimatorTask,
  decodeLearningEstimateRequest,
  decodeLearningEstimateResult,
  encodeLearningEstimateRequest,
  encodeLearningEstimateResult,
  learningJobRejectionCodes,
  parseLearningJob,
  LEARNING_ESTIMATE_VERSION,
} from '../../src/learning';
import type { LearningEstimateResult } from '../../src/learning';
import { getParameterDefinition, parameterDefinitions } from '../../src/profiles';
import { GovernorMemoryStore } from '../harness/governor-store';
import { learningTestJob } from '../harness/learning-estimator-fixture';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

interface Clock {
  now: number;
}

interface QueueFixture {
  readonly queue: LearningEstimatorQueue;
  readonly governor: WorkerResourceGovernor;
  readonly store: GovernorMemoryStore;
  readonly starts: Packet[];
  readonly controls: Packet[];
  readonly clock: Clock;
  readonly identity: {
    baseVersionId: string;
    profileId: string;
    learningEpoch: number;
    sessionId: string;
    worldEpoch: number;
  };
  reply(start: Packet, kind?: 'result' | 'error' | 'cancelled', payload?: ArrayBuffer): void;
  setGeneration(learningEpoch: number, baseVersionId: string): void;
  secondary(segmentId?: string, slices?: number): Packet;
  resultFor(start: Packet, overrides?: Partial<LearningEstimateResult>): ArrayBuffer;
}

function fixture(
  options: {
    readonly maxPending?: number;
    readonly maxBytes?: number;
    readonly history?: number;
  } = {},
  after?: (cleanup: () => void) => void,
): QueueFixture {
  let receive: (value: unknown) => void = () => {};
  const starts: Packet[] = [];
  const controls: Packet[] = [];
  const clock: Clock = { now: 0 };
  const identity = {
    baseVersionId: 'profile-v1',
    profileId: 'profile-1',
    learningEpoch: 1,
    sessionId: 'session-1',
    worldEpoch: 1,
  };
  const port: Transport = {
    send: (packet) => {
      if (packet.type === 'start') starts.push(packet);
      else controls.push(packet);
    },
    listen: (callback) => {
      receive = callback;
      return () => {};
    },
  };
  const client = new WorkerClient(
    port,
    () => identity,
    () => clock.now,
  );
  const store = new GovernorMemoryStore(128, 32 * 1024 * 1024);
  const governor = new WorkerResourceGovernor(client, store, () => clock.now);
  const queue = new LearningEstimatorQueue({
    governor,
    engineVersion: 'engine-1',
    now: () => clock.now,
    ...(options.maxPending === undefined ? {} : { maxPending: options.maxPending }),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    ...(options.history === undefined ? {} : { history: options.history }),
  });
  const reply = (
    start: Packet,
    kind: 'result' | 'error' | 'cancelled' = 'result',
    payload?: ArrayBuffer,
  ): void => {
    receive({
      ...start,
      type: kind,
      sequence: 1,
      buffer: payload ?? new ArrayBuffer(0),
      payloadBytes: payload?.byteLength ?? 0,
      ownership: 'copy',
      ...(kind === 'error' ? { error: 'Synthetic estimator failure' } : {}),
    });
  };
  const resultFor = (
    start: Packet,
    overrides: Partial<LearningEstimateResult> = {},
  ): ArrayBuffer => {
    const request = decodeLearningEstimateRequest(start.buffer);
    const blended = blendProfileValue({
      key: request.key,
      oldValue: request.baseValue,
      evidence: request.evidence,
      episodes: request.episodes,
      candidate: request.candidate,
    });
    const definition = getParameterDefinition(request.key);
    return encodeLearningEstimateResult({
      version: LEARNING_ESTIMATE_VERSION,
      key: request.key,
      baseVersionId: request.baseVersionId,
      segmentId: request.segmentId,
      learningEpoch: request.learningEpoch,
      estimate: blended.estimate,
      learningWeight: blended.learningWeight,
      resolution: blended.resolution,
      changed: blended.changed,
      min: definition.min,
      max: definition.max,
      ...overrides,
    });
  };
  const secondary = (segmentId = 'secondary', slices = 120): Packet => ({
    ...identity,
    jobId: '1',
    segmentId,
    priority: 'optional',
    type: 'start',
    sequence: 0,
    payloadBytes: 4,
    ownership: 'copy',
    buffer: new Uint32Array([slices]).buffer,
  });
  if (after) {
    after(() => {
      queue.dispose();
      governor.dispose();
    });
  }
  return {
    queue,
    governor,
    store,
    starts,
    controls,
    clock,
    identity,
    reply,
    resultFor,
    secondary,
    setGeneration(learningEpoch, baseVersionId) {
      identity.learningEpoch = learningEpoch;
      identity.baseVersionId = baseVersionId;
    },
  };
}

function expectQueued(admission: ReturnType<LearningEstimatorQueue['submit']>) {
  assert.equal(admission.status, 'QUEUED');
  if (!admission.ticket) throw new Error('expected a queue ticket');
  return admission.ticket;
}

// 101 formula with 16 repeated episodes: weight 0.6, estimate = candidate value.
function fold(base: number, estimate: number): number {
  return Math.round((base + 0.6 * (estimate - base)) * 1e4) / 1e4;
}

test('103 only eligible LEARNING jobs reach the queue; MANUAL/AUTO use closed reasons', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  const manual = f.queue.submit(learningTestJob({ segmentId: 'manual', order: 1, mode: 'MANUAL' }));
  assert.equal(manual.status, 'REJECTED');
  assert.equal(manual.reason, 'MANUAL_SEGMENT_NOT_LEARNABLE');
  assert.equal(manual.ticket, null);
  assert.equal(learningJobRejectionCodes.includes('MANUAL_SEGMENT_NOT_LEARNABLE'), true);

  const auto = f.queue.submit(learningTestJob({ segmentId: 'auto', order: 1, mode: 'AUTO' }));
  assert.equal(auto.reason, 'AUTO_SEGMENT_NOT_LEARNABLE');

  const ineligible = f.queue.submit(
    learningTestJob({ segmentId: 'ineligible', order: 1, eligible: false }),
  );
  assert.equal(ineligible.reason, 'SEGMENT_INELIGIBLE');

  const incomplete = f.queue.submit({
    ...learningTestJob({ segmentId: 'incomplete', order: 1 }),
    playerId: undefined,
  });
  assert.equal(incomplete.reason, 'IDENTITY_INVALID');

  const extensionKey = parameterDefinitions.find(
    (definition) => definition.implementationStage === 'extension',
  )!.key;
  assert.equal(parseLearningJob(learningTestJob({ segmentId: 'ext', order: 1 })).status, 'VALID');
  const extension = parseLearningJob({
    ...learningTestJob({ segmentId: 'ext', order: 1 }),
    key: extensionKey,
    evidence: { ...learningTestJob({ segmentId: 'ext', order: 1 }).evidence, key: extensionKey },
  });
  assert.equal(extension.status, 'REJECTED');
  if (extension.status === 'REJECTED')
    assert.equal(extension.reason, 'PARAMETER_NOT_LEARNING_TARGET');

  await settle();
  assert.equal(f.starts.length, 0);
  assert.equal(f.governor.usage.jobs, 0);
  f.queue.dispose();
  f.governor.dispose();
});

test('103 the serial queue dispatches by intervention order, not arrival', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  const second = f.queue.submit(
    learningTestJob({ segmentId: 'second', order: 2, candidateValue: -2 }),
  );
  const first = f.queue.submit(
    learningTestJob({ segmentId: 'first', order: 1, candidateValue: 4 }),
  );
  const firstTicket = expectQueued(first);
  const secondTicket = expectQueued(second);

  await settle();
  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].segmentId, 'first');

  f.reply(f.starts[0], 'result', f.resultFor(f.starts[0]));
  const firstOutcome = await firstTicket.outcome;
  assert.equal(firstOutcome.status, 'composed');
  assert.equal(firstOutcome.composition!.value, fold(1.5, 4));

  f.clock.now = 20;
  await settle();
  assert.equal(f.starts.length, 2);
  assert.equal(f.starts[1].segmentId, 'second');
  f.reply(f.starts[1], 'result', f.resultFor(f.starts[1]));
  const secondOutcome = await secondTicket.outcome;
  assert.equal(secondOutcome.status, 'composed');
  assert.deepEqual(secondOutcome.composition!.appliedOrders, [1, 2]);
  assert.equal(secondOutcome.composition!.value, fold(fold(1.5, 4), -2));
  assert.equal(secondOutcome.measurement.queueMs, 20);
  assert.equal(secondOutcome.measurement.endToEndMs, 20);
  assert.equal(f.queue.usage.pending, 0);
  assert.equal(f.queue.usage.active, 0);
  f.queue.dispose();
  f.governor.dispose();
});

test('103 a stale same-generation result is recomposed in order, never dropped', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  const stale = f.queue.submit(
    learningTestJob({ segmentId: 'late-first', order: 2, candidateValue: -2 }),
  );
  const staleTicket = expectQueued(stale);
  await settle();
  assert.equal(f.starts[0].segmentId, 'late-first');
  f.reply(f.starts[0], 'result', f.resultFor(f.starts[0]));
  const staleOutcome = await staleTicket.outcome;
  assert.equal(staleOutcome.status, 'composed');
  assert.equal(staleOutcome.composition!.value, fold(1.5, -2));
  assert.equal(staleOutcome.measurement.recomposed, false);

  const earlier = f.queue.submit(
    learningTestJob({ segmentId: 'late-first', order: 1, candidateValue: 4 }),
  );
  // Duplicate segment is still rejected; use a distinct segment with the lower intervention order.
  assert.equal(earlier.status, 'REJECTED');
  assert.equal(earlier.reason, 'SEGMENT_DUPLICATE');

  const early = f.queue.submit(
    learningTestJob({ segmentId: 'late-second', order: 1, candidateValue: 4 }),
  );
  const earlyTicket = expectQueued(early);
  await settle();
  assert.equal(f.starts[1].segmentId, 'late-second');
  f.reply(f.starts[1], 'result', f.resultFor(f.starts[1]));
  const earlyOutcome = await earlyTicket.outcome;

  assert.equal(earlyOutcome.status, 'composed');
  assert.equal(earlyOutcome.composition!.recomposed, true);
  assert.deepEqual(earlyOutcome.composition!.appliedOrders, [1, 2]);
  assert.deepEqual(earlyOutcome.composition!.appliedSegments, ['late-second', 'late-first']);
  // Dropping the stale result would leave -1.5; a last-write-wins overwrite would leave 3.
  assert.equal(earlyOutcome.composition!.value, fold(fold(1.5, 4), -2));
  assert.equal(f.queue.usage.generation!.recompositions, 2);
  f.queue.dispose();
  f.governor.dispose();
});

test('103 a new learningEpoch invalidates the old job and its result', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  const old = expectQueued(
    f.queue.submit(learningTestJob({ segmentId: 'old-epoch', order: 1, candidateValue: 4 })),
  );
  await settle();
  assert.equal(f.starts[0].segmentId, 'old-epoch');

  f.setGeneration(2, 'profile-v2');
  const next = expectQueued(
    f.queue.submit(
      learningTestJob({
        segmentId: 'new-epoch',
        order: 1,
        candidateValue: 4,
        learningEpoch: 2,
        baseVersionId: 'profile-v2',
      }),
    ),
  );
  await settle();
  assert.equal(f.controls.length, 1);
  assert.equal(f.controls[0].type, 'cancel');
  assert.equal(f.starts.length, 1, 'the new generation waits for the old attempt to acknowledge');

  f.reply(f.starts[0], 'cancelled');
  const oldOutcome = await old.outcome;
  assert.equal(oldOutcome.status, 'invalidated');
  assert.equal(oldOutcome.reason, 'GENERATION_INVALIDATED');
  assert.equal(oldOutcome.composition, null);

  await settle();
  assert.equal(f.starts.length, 2);
  assert.equal(f.starts[1].segmentId, 'new-epoch');
  f.reply(f.starts[1], 'result', f.resultFor(f.starts[1]));
  const nextOutcome = await next.outcome;
  assert.equal(nextOutcome.status, 'composed');
  assert.deepEqual(nextOutcome.composition!.appliedSegments, ['new-epoch']);
  assert.equal(nextOutcome.composition!.appliedOrders[0], 1);
  assert.equal(f.queue.usage.generation!.learningEpoch, 2);
  assert.equal(f.queue.usage.generation!.baseVersionId, 'profile-v2');
  f.queue.dispose();
  f.governor.dispose();
});

test('103 a new baseVersion in the same epoch also invalidates the old attempt', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  const old = expectQueued(f.queue.submit(learningTestJob({ segmentId: 'base-v1', order: 1 })));
  await settle();
  assert.equal(f.starts[0].segmentId, 'base-v1');

  f.setGeneration(1, 'profile-v2');
  const next = expectQueued(
    f.queue.submit(
      learningTestJob({ segmentId: 'base-v2', order: 1, baseVersionId: 'profile-v2' }),
    ),
  );
  await settle();
  f.reply(f.starts[0], 'cancelled');
  assert.equal((await old.outcome).status, 'invalidated');
  await settle();
  assert.equal(f.starts[1].segmentId, 'base-v2');
  f.reply(f.starts[1], 'result', f.resultFor(f.starts[1]));
  const composed = await next.outcome;
  assert.equal(composed.status, 'composed');
  assert.equal(composed.composition!.baseVersionId, 'profile-v2');
  f.queue.dispose();
  f.governor.dispose();
});

test('103 cancellation, task errors and a rejected composition leave the queue runnable', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  const a = expectQueued(
    f.queue.submit(learningTestJob({ segmentId: 'cancel-me', order: 1, baseValue: 9 })),
  );
  assert.equal(f.queue.cancel('cancel-me'), true);
  assert.equal((await a.outcome).status, 'cancelled');
  const b = expectQueued(f.queue.submit(learningTestJob({ segmentId: 'after-cancel', order: 2 })));
  await settle();
  assert.equal(f.starts[0].segmentId, 'after-cancel');
  f.reply(f.starts[0], 'error');
  assert.equal((await b.outcome).status, 'error');

  const c = expectQueued(
    f.queue.submit(learningTestJob({ segmentId: 'bad-composition', order: 3, candidateValue: 4 })),
  );
  await settle();
  f.reply(f.starts[1], 'result', f.resultFor(f.starts[1], { estimate: 99 }));
  const rejected = await c.outcome;
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reason, 'COMPOSITION_REJECTED');
  assert.match(rejected.detail!, /VALUE_OUT_OF_RANGE/);

  const d = expectQueued(
    f.queue.submit(learningTestJob({ segmentId: 'after-reject', order: 3, candidateValue: 4 })),
  );
  await settle();
  f.reply(f.starts[2], 'result', f.resultFor(f.starts[2]));
  const composed = await d.outcome;
  assert.equal(composed.status, 'composed');
  assert.equal(composed.composition!.value, fold(1.5, 4));
  assert.equal(f.queue.usage.pending, 0);
  assert.equal(f.queue.usage.active, 0);
  f.queue.dispose();
  f.governor.dispose();
});

test('103 bounded queue returns explicit backpressure instead of growing silently', async (t) => {
  const f = fixture({ maxPending: 1 }, (cleanup) => t.after(cleanup));
  const first = f.queue.submit(learningTestJob({ segmentId: 'first', order: 1 }));
  const second = f.queue.submit(learningTestJob({ segmentId: 'second', order: 2 }));
  assert.equal(first.status, 'QUEUED');
  assert.equal(second.status, 'BACKPRESSURE');
  assert.equal(second.reason, 'QUEUE_FULL');
  assert.equal(second.ticket, null);
  await settle();
  f.reply(f.starts[0], 'result', f.resultFor(f.starts[0]));
  assert.equal((await expectQueued(first).outcome).status, 'composed');
  f.queue.dispose();
  f.governor.dispose();

  const sizeJob = learningTestJob({ segmentId: 'size', order: 1 });
  const sizeRequest = {
    version: LEARNING_ESTIMATE_VERSION,
    key: sizeJob.key,
    baseVersionId: sizeJob.baseVersionId,
    segmentId: sizeJob.segmentId,
    learningEpoch: sizeJob.learningEpoch,
    baseValue: sizeJob.baseValue,
    evidence: sizeJob.evidence,
    episodes: sizeJob.episodes,
    candidate: sizeJob.candidate,
  };
  const payloadSize = encodeLearningEstimateRequest(sizeRequest).byteLength;
  const bytes = fixture({ maxBytes: payloadSize + 10 }, (cleanup) => t.after(cleanup));
  assert.equal(bytes.queue.submit(sizeJob).status, 'QUEUED');
  const overflow = bytes.queue.submit(
    learningTestJob({ segmentId: 'size-2', order: 2, episodeCount: 8 }),
  );
  assert.equal(overflow.status, 'BACKPRESSURE');
  assert.equal(overflow.reason, 'QUEUE_BYTES');
  bytes.queue.dispose();
  bytes.governor.dispose();
});

test('103 end-to-end latency includes queue time while a secondary job is running', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  const secondary = f.secondary();
  const started = await f.governor.submit(secondary, 'comparison');
  assert.equal(started.status, 'PENDING');
  await settle();
  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].segmentId, 'secondary');

  const first = expectQueued(
    f.queue.submit(learningTestJob({ segmentId: 'learning-first', order: 1 })),
  );
  const second = expectQueued(
    f.queue.submit(learningTestJob({ segmentId: 'learning-second', order: 2 })),
  );
  await settle();
  assert.equal(f.controls.length, 1, 'learning must preempt the secondary comparison');

  f.clock.now = 40;
  f.reply(f.starts[0], 'cancelled');
  await settle();
  assert.equal(f.starts[1].segmentId, 'learning-first');

  // The 221 governor would restart the preempted secondary; retire it explicitly so this probe
  // measures one secondary job instead of a restart loop.
  f.governor.cancel(started.ticket!.key);
  assert.equal((await started.ticket!.outcome).status, 'cancelled');

  f.clock.now = 100;
  f.reply(f.starts[1], 'result', f.resultFor(f.starts[1]));
  const firstOutcome = await first.outcome;
  assert.equal(firstOutcome.status, 'composed');
  assert.equal(firstOutcome.measurement.queueMs, 0);
  assert.equal(firstOutcome.measurement.governorQueueMs, 40);
  assert.equal(firstOutcome.measurement.governorServiceMs, 60);
  assert.equal(firstOutcome.measurement.endToEndMs, 100);
  assert.ok(firstOutcome.measurement.endToEndMs > firstOutcome.measurement.governorServiceMs!);

  await settle();
  assert.equal(f.starts[2].segmentId, 'learning-second');
  f.clock.now = 130;
  f.reply(f.starts[2], 'result', f.resultFor(f.starts[2]));
  const secondOutcome = await second.outcome;
  assert.equal(secondOutcome.status, 'composed');
  assert.equal(secondOutcome.measurement.queueMs, 100, 'the second learning waits in this queue');
  assert.equal(secondOutcome.measurement.serviceMs, 30);
  assert.equal(secondOutcome.measurement.endToEndMs, 130);
  assert.ok(secondOutcome.measurement.endToEndMs > secondOutcome.measurement.serviceMs);
  f.queue.dispose();
  f.governor.dispose();
});

test('103 duplicate segments and orders are closed rejections', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  assert.equal(f.queue.submit(learningTestJob({ segmentId: 'same', order: 1 })).status, 'QUEUED');
  const duplicate = f.queue.submit(learningTestJob({ segmentId: 'same', order: 2 }));
  assert.equal(duplicate.status, 'REJECTED');
  assert.equal(duplicate.reason, 'SEGMENT_DUPLICATE');
  const conflict = f.queue.submit(learningTestJob({ segmentId: 'other', order: 1 }));
  assert.equal(conflict.reason, 'ORDER_CONFLICT');
  f.queue.dispose();
  f.governor.dispose();
});

test('103 the worker task runs the real 101 estimate over the wire contract', () => {
  const job = learningTestJob({ segmentId: 'worker-task', order: 1, candidateValue: 4 });
  const request = {
    version: LEARNING_ESTIMATE_VERSION,
    key: job.key,
    baseVersionId: job.baseVersionId,
    segmentId: job.segmentId,
    learningEpoch: job.learningEpoch,
    baseValue: job.baseValue,
    evidence: job.evidence,
    episodes: job.episodes,
    candidate: job.candidate,
  };
  const buffer = encodeLearningEstimateRequest(request);
  const task = createLearningEstimatorTask()({
    ...job,
    jobId: '1',
    type: 'start',
    sequence: 0,
    payloadBytes: buffer.byteLength,
    ownership: 'copy',
    priority: 'interactive',
    buffer,
  } as Packet);
  const slice = task.step(performance.now() + 10);
  task.dispose();
  assert.equal(slice.done, true);
  const result = decodeLearningEstimateResult(slice.result!);
  const direct = blendProfileValue({
    key: job.key,
    oldValue: job.baseValue,
    evidence: job.evidence,
    episodes: job.episodes,
    candidate: job.candidate,
  });
  assert.equal(result.version, LEARNING_ESTIMATE_VERSION);
  assert.equal(result.segmentId, 'worker-task');
  assert.equal(result.baseVersionId, job.baseVersionId);
  assert.equal(result.estimate, direct.estimate);
  assert.equal(result.learningWeight, direct.learningWeight);
  assert.equal(result.resolution, direct.resolution);
  assert.equal(result.changed, direct.changed);

  const malformed = { ...job, buffer: new TextEncoder().encode('{').buffer };
  assert.throws(() =>
    createLearningEstimatorTask()({
      ...malformed,
      jobId: '1',
      type: 'start',
      sequence: 0,
      payloadBytes: 1,
      ownership: 'copy',
      priority: 'interactive',
    } as Packet).step(performance.now() + 10),
  );
});

test('103 a real worker thread composes a learning proposal through the queue', async (t) => {
  const identity = {
    baseVersionId: 'profile-v1',
    profileId: 'profile-1',
    learningEpoch: 1,
    sessionId: 'session-1',
    worldEpoch: 1,
  };
  const worker = new Worker(new URL('../workers/learning-estimator-thread.mjs', import.meta.url), {
    execArgv: ['--import', new URL('../../scripts/register-typescript.mjs', import.meta.url).href],
  });
  t.after(async () => {
    await worker.terminate();
  });
  const port: Transport = {
    send: (packet, transfers) => worker.postMessage(packet, [...transfers]),
    listen: (message, error) => {
      worker.on('message', message);
      worker.on('error', error);
      return () => {
        worker.off('message', message);
        worker.off('error', error);
      };
    },
  };
  const client = new WorkerClient(port, () => identity);
  const governor = new WorkerResourceGovernor(
    client,
    new GovernorMemoryStore(16, 32 * 1024 * 1024),
  );
  const queue = new LearningEstimatorQueue({ governor, engineVersion: 'engine-1' });
  t.after(() => {
    queue.dispose();
    governor.dispose();
  });
  const admission = queue.submit(
    learningTestJob({ segmentId: 'real-thread', order: 1, candidateValue: 4 }),
  );
  const outcome = await expectQueued(admission).outcome;
  assert.equal(outcome.status, 'composed');
  assert.equal(outcome.composition!.value, fold(1.5, 4));
  assert.ok(outcome.measurement.endToEndMs >= outcome.measurement.serviceMs);
  assert.equal(queue.usage.pending, 0);
  assert.equal(queue.usage.active, 0);
  await queue.whenIdle();
});

test('103 admission rejects a duplicate profile owner and accepts multiple keys in one epoch', async (t) => {
  const f = fixture({}, (cleanup) => t.after(cleanup));
  const speed = expectQueued(
    f.queue.submit(learningTestJob({ segmentId: 'speed', order: 1, candidateValue: 4 })),
  );
  await settle();
  f.reply(f.starts[0], 'result', f.resultFor(f.starts[0]));
  assert.equal((await speed.outcome).status, 'composed');

  const other = f.queue.submit(
    learningTestJob({ segmentId: 'other-player', order: 2, playerId: 'player-2' }),
  );
  assert.equal(other.status, 'REJECTED');
  assert.equal(other.reason, 'PROFILE_OWNER_MISMATCH');

  const headway = expectQueued(
    f.queue.submit(
      learningTestJob({
        segmentId: 'headway',
        order: 3,
        key: 'following_time_headway',
        baseValue: 1.8,
        candidateValue: 1.5,
      }),
    ),
  );
  await settle();
  f.reply(f.starts[1], 'result', f.resultFor(f.starts[1]));
  const outcome = await headway.outcome;
  assert.equal(outcome.status, 'composed');
  assert.equal(outcome.composition!.key, 'following_time_headway');
  assert.equal(f.governor.usage.bytes, 0);
  f.queue.dispose();
  f.governor.dispose();
});
