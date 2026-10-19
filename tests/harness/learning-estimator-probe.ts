import { LearningEstimatorQueue } from '../../src/learning';
import type { LearningJobOutcome, LearningQueueMeasurement } from '../../src/learning';
import { WorkerClient, WorkerResourceGovernor } from '../../src/workers';
import type { Packet, Transport } from '../../src/workers';
import { GovernorMemoryStore } from './governor-store';
import { learningTestIdentity, learningTestJob } from './learning-estimator-fixture';

export interface LearningEstimatorProbeResult {
  readonly learningJobs: number;
  readonly composed: number;
  readonly errors: number;
  readonly cancelled: number;
  readonly invalidated: number;
  readonly recomposed: number;
  readonly generationRecompositions: number;
  readonly secondaryAttempts: number;
  readonly secondaryStatus: 'result' | 'cancelled' | 'error' | 'stale';
  readonly startupMs: number;
  readonly submitBatch1Ms: number;
  readonly submitBatch2Ms: number;
  readonly pendingAfterSubmit1: number;
  readonly pendingAfterSubmit2: number;
  readonly maxOwnedBytes: number;
  readonly totalPayloadBytes: number;
  readonly maxPayloadBytes: number;
  readonly durationMs: number;
  readonly measurements: readonly LearningQueueMeasurement[];
  readonly outcomeSummary: readonly {
    segmentId: string;
    status: LearningJobOutcome['status'];
    appliedOrders: readonly number[];
  }[];
  readonly usage: LearningEstimatorQueue['usage'];
  readonly governorUsage: WorkerResourceGovernor['usage'];
  readonly storeUsage: GovernorMemoryStore['usage'];
  readonly governorMeasurementCount: number;
  readonly processMemory: {
    readonly rss: number;
    readonly heapUsed: number;
    readonly external: number;
    readonly arrayBuffers: number;
  };
}

interface Submitted {
  segmentId: string;
  outcome: Promise<LearningJobOutcome>;
}

function submitted(ticket: { segmentId: string; outcome: Promise<LearningJobOutcome> }): Submitted {
  return { segmentId: ticket.segmentId, outcome: ticket.outcome };
}

/**
 * Drives the real 103 queue and universal 221 governor through one worker transport. A synthetic
 * optional comparison is already running when the learning jobs arrive, so queue and end-to-end
 * latency include a real secondary job. The second wave uses lower intervention orders, which
 * forces the same-generation recomposition path.
 */
export async function runLearningEstimatorProbe(
  port: Transport,
): Promise<LearningEstimatorProbeResult> {
  const identity = {
    baseVersionId: learningTestIdentity.baseVersionId,
    profileId: learningTestIdentity.profileId,
    learningEpoch: learningTestIdentity.learningEpoch,
    sessionId: learningTestIdentity.sessionId,
    worldEpoch: learningTestIdentity.worldEpoch,
  };
  const processMemoryBefore = process.memoryUsage();
  const client = new WorkerClient(port, () => identity);
  const store = new GovernorMemoryStore(64, 32 * 1024 * 1024);
  const governor = new WorkerResourceGovernor(client, store);
  const queue = new LearningEstimatorQueue({
    governor,
    engineVersion: 'engine-probe-1',
    maxPending: 32,
    maxBytes: 8 * 1024 * 1024,
  });
  const startedAt = performance.now();
  try {
    const warmup: Packet = {
      ...identity,
      jobId: '1',
      segmentId: 'secondary-warmup',
      priority: 'optional',
      type: 'start',
      sequence: 0,
      payloadBytes: 4,
      ownership: 'copy',
      buffer: new Uint32Array([1]).buffer,
    };
    const warmupAdmission = await governor.submit(warmup, 'comparison');
    if (!warmupAdmission.ticket) throw new Error('Warmup comparison was not admitted');
    await warmupAdmission.ticket.outcome;
    const startupMs = performance.now() - startedAt;

    const secondary: Packet = {
      ...identity,
      jobId: '1',
      segmentId: 'secondary-probe',
      priority: 'optional',
      type: 'start',
      sequence: 0,
      payloadBytes: 4,
      ownership: 'copy',
      buffer: new Uint32Array([120]).buffer,
    };
    const secondaryAdmission = await governor.submit(secondary, 'comparison');
    if (!secondaryAdmission.ticket) throw new Error('Secondary comparison was not admitted');

    const wave1: Submitted[] = [];
    const submit1Start = performance.now();
    for (let order = 13; order <= 25; order++) {
      if (order === 20) {
        const errorJob = learningTestJob({
          segmentId: `probe-error-${order}`,
          order,
          candidateValue: 3,
        });
        const admission = queue.submit({
          ...errorJob,
          episodes: errorJob.episodes.map((episode, index) =>
            index === 0 ? { ...episode, observedTicks: -1 } : episode,
          ),
        });
        if (!admission.ticket) throw new Error('Error job was not admitted');
        wave1.push(submitted(admission.ticket));
        continue;
      }
      const segmentId = order === 25 ? 'probe-cancel' : `probe-wave1-${order}`;
      const admission = queue.submit(
        learningTestJob({
          segmentId,
          order,
          candidateValue: order % 2 === 0 ? 4 : -2,
          episodeCount: 48,
        }),
      );
      if (!admission.ticket) throw new Error(`Wave 1 job ${order} was not admitted`);
      wave1.push(submitted(admission.ticket));
    }
    queue.cancel('probe-cancel');
    const submitBatch1Ms = performance.now() - submit1Start;
    const pendingAfterSubmit1 = queue.usage.pending;
    const maxOwnedBytes = queue.usage.bytes;

    // The first learning job preempts the secondary. Active pressure then defers the restart so the
    // remaining jobs measure serial learning, not repeated comparison restarts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    governor.setPressure(true, 'active');

    const wave1Outcomes = await Promise.all(wave1.map(({ outcome }) => outcome));

    const wave2: Submitted[] = [];
    const submit2Start = performance.now();
    for (let order = 1; order <= 12; order++) {
      const admission = queue.submit(
        learningTestJob({
          segmentId: `probe-wave2-${order}`,
          order,
          candidateValue: order % 2 === 0 ? -2 : 4,
          episodeCount: 48,
        }),
      );
      if (!admission.ticket) throw new Error(`Wave 2 job ${order} was not admitted`);
      wave2.push(submitted(admission.ticket));
    }
    const submitBatch2Ms = performance.now() - submit2Start;
    const pendingAfterSubmit2 = queue.usage.pending;
    const maxOwnedBytesTotal = Math.max(maxOwnedBytes, queue.usage.bytes, governor.usage.bytes);
    const wave2Outcomes = await Promise.all(wave2.map(({ outcome }) => outcome));
    await queue.whenIdle();
    governor.cancel(secondaryAdmission.ticket.key);
    const secondaryOutcome = await secondaryAdmission.ticket.outcome;

    const outcomes = [...wave1Outcomes, ...wave2Outcomes];
    const measurements = queue.measurements;
    const usage = queue.usage;
    const governorUsage = governor.usage;
    const storeUsage = store.usage;
    const secondaryAttempts = governor.measurements.filter(
      (sample) => sample.key === secondaryAdmission.ticket!.key,
    ).length;
    const compositionValues = outcomes
      .filter((outcome) => outcome.composition !== null)
      .map((outcome) => outcome.composition!);
    const payloadSizes = measurements.map((sample) => sample.payloadBytes);
    return {
      learningJobs: outcomes.length,
      composed: outcomes.filter((outcome) => outcome.status === 'composed').length,
      errors: outcomes.filter((outcome) => outcome.status === 'error').length,
      cancelled: outcomes.filter((outcome) => outcome.status === 'cancelled').length,
      invalidated: outcomes.filter((outcome) => outcome.status === 'invalidated').length,
      recomposed: compositionValues.filter((composition) => composition.recomposed).length,
      generationRecompositions: usage.generation?.recompositions ?? 0,
      secondaryAttempts,
      secondaryStatus: secondaryOutcome.status,
      startupMs,
      submitBatch1Ms,
      submitBatch2Ms,
      pendingAfterSubmit1,
      pendingAfterSubmit2,
      maxOwnedBytes: maxOwnedBytesTotal,
      totalPayloadBytes: payloadSizes.reduce((total, bytes) => total + bytes, 0),
      maxPayloadBytes: payloadSizes.length ? Math.max(...payloadSizes) : 0,
      durationMs: performance.now() - startedAt,
      measurements,
      outcomeSummary: outcomes.map((outcome, index) => ({
        segmentId: [...wave1, ...wave2][index].segmentId,
        status: outcome.status,
        appliedOrders: outcome.composition?.appliedOrders ?? [],
      })),
      usage,
      governorUsage,
      storeUsage,
      governorMeasurementCount: governor.measurements.length,
      processMemory: {
        rss: process.memoryUsage().rss - processMemoryBefore.rss,
        heapUsed: process.memoryUsage().heapUsed - processMemoryBefore.heapUsed,
        external: process.memoryUsage().external - processMemoryBefore.external,
        arrayBuffers: process.memoryUsage().arrayBuffers - processMemoryBefore.arrayBuffers,
      },
    };
  } finally {
    queue.dispose();
    governor.dispose();
  }
}
