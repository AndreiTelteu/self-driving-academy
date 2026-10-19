import { WorkerClient, WorkerResourceGovernor } from '../../src/workers';
import type { Packet, Transport } from '../../src/workers';
import { GovernorMemoryStore } from './governor-store';

export async function runGovernorProbe(port: Transport) {
  const identity = {
    baseVersionId: 'v1',
    profileId: 'p1',
    learningEpoch: 1,
    sessionId: 'probe1',
    worldEpoch: 1,
  };
  let progressCount = 0;
  const progressEvents: { jobId: string; atMs: number }[] = [];
  let began!: () => void;
  const ready = new Promise<void>((resolve) => {
    began = resolve;
  });
  const client = new WorkerClient(
    port,
    () => identity,
    undefined,
    (packet) => {
      progressCount++;
      if (progressEvents.length < 64)
        progressEvents.push({ jobId: packet.jobId, atMs: performance.now() });
      began();
    },
  );
  const store = new GovernorMemoryStore();
  const governor = new WorkerResourceGovernor(client, store);
  const make = (segmentId: string, priority: Packet['priority'], slices: number): Packet => {
    const buffer = new Uint32Array([slices]).buffer;
    return {
      ...identity,
      jobId: '1',
      segmentId,
      priority,
      buffer,
      payloadBytes: 4,
      type: 'start',
      sequence: 0,
      ownership: 'transfer',
    };
  };
  const started = performance.now();
  try {
    const live = make('comparison-long', 'optional', 120);
    const comparison = await governor.submit(live, 'comparison');
    await ready;
    const startupMs = performance.now() - started;
    const interactiveAt = performance.now();
    const learning = await governor.submit(make('learning-short', 'interactive', 1), 'learning');
    const interactive = await learning.ticket!.outcome;
    const interactiveEndToEndMs = performance.now() - interactiveAt;
    if (interactive.status !== 'result') throw new Error('Learning did not finish');
    const long = await comparison.ticket!.outcome;
    if (long.status !== 'result') throw new Error('Comparison restart did not finish');
    const longResult = new Float64Array(long.packet!.buffer);
    const measurements = governor.measurements;
    const completed = await governor.completed();
    if (completed.length !== 1) throw new Error('Protected result recovery failed');
    await governor.acknowledge(learning.ticket!.key);
    const retainedAfterAcknowledgement = store.usage;
    const cancel = await governor.submit(make('cancel-long', 'optional', 120));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    governor.cancel(cancel.ticket!.key);
    if ((await cancel.ticket!.outcome).status !== 'cancelled') throw new Error('Cancel failed');
    const finalMeasurements = governor.measurements;
    const usage = governor.usage;
    if (
      live.buffer.byteLength !== 4 ||
      usage.jobs !== 0 ||
      usage.bytes !== 0 ||
      retainedAfterAcknowledgement.records !== 0 ||
      longResult[2] !== 1
    )
      throw new Error('Ownership/capacity cleanup failed');
    return {
      startupMs,
      interactiveEndToEndMs,
      progressCount,
      progressEvents,
      maxSliceMs: longResult[1],
      worldTokensMaximum: longResult[2],
      logicalComparisonResults: 1,
      attemptedComparisonStarts: measurements.filter((m) => m.key === comparison.ticket!.key)
        .length,
      liveBufferAttached: live.buffer.byteLength === 4,
      measurements: finalMeasurements,
      usage,
      storeAfterAcknowledgement: retainedAfterAcknowledgement,
      durationMs: performance.now() - started,
    };
  } finally {
    governor.dispose();
  }
}
