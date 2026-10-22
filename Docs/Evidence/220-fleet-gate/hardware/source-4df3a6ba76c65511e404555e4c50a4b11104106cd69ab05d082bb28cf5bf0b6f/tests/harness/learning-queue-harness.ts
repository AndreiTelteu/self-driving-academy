import { WorkerClient, WorkerResourceGovernor } from '../../src/workers';
import type { Packet, Transport } from '../../src/workers';
import {
  LEARNING_ESTIMATE_VERSION,
  LearningEstimatorQueue,
  blendProfileValue,
  decodeLearningEstimateRequest,
  encodeLearningEstimateResult,
} from '../../src/learning';
import type { LearningEstimateResult } from '../../src/learning';
import { getParameterDefinition } from '../../src/profiles';
import { GovernorMemoryStore } from './governor-store';

/**
 * Deterministic harness for the real 103 `LearningEstimatorQueue`.
 *
 * It uses the real 221 `WorkerResourceGovernor`, `WorkerClient` and queue, and replaces only the
 * `worker_threads` transport: a start packet is answered with the real 101 `blendProfileValue`
 * result (or with an explicit error/cancel), scheduled on a microtask. No estimator, composition or
 * validation is reimplemented here. The transport identity follows the dispatched job because the
 * real client refuses a result whose world identity changed.
 */
export type LearningQueueReplyKind = 'result' | 'error' | 'cancelled';

export interface LearningQueueHarness {
  readonly queue: LearningEstimatorQueue;
  readonly governor: WorkerResourceGovernor;
  readonly starts: readonly Packet[];
  readonly controls: readonly Packet[];
  readonly tick: { now: number };
  plan(segmentId: string, kind: LearningQueueReplyKind): void;
  override(segmentId: string, patch: Partial<LearningEstimateResult>): void;
  dispose(): void;
}

export function createLearningQueueHarness(options: {
  readonly engineVersion: string;
  readonly maxRecords?: number;
}): LearningQueueHarness {
  const starts: Packet[] = [];
  const controls: Packet[] = [];
  const tick = { now: 0 };
  const identity = {
    baseVersionId: 'unused',
    profileId: 'unused',
    learningEpoch: 0,
    sessionId: 'unused',
    worldEpoch: 0,
  };
  const plans = new Map<string, LearningQueueReplyKind>();
  const patches = new Map<string, Partial<LearningEstimateResult>>();
  let receive: (value: unknown) => void = () => {};
  const port: Transport = {
    send(packet) {
      if (packet.type !== 'start') {
        controls.push(packet);
        return;
      }
      identity.baseVersionId = packet.baseVersionId;
      identity.profileId = packet.profileId;
      identity.learningEpoch = packet.learningEpoch;
      identity.sessionId = packet.sessionId;
      identity.worldEpoch = packet.worldEpoch;
      starts.push(packet);
      queueMicrotask(() => reply(packet));
    },
    listen(callback) {
      receive = callback;
      return () => {
        receive = () => {};
      };
    },
  };
  const client = new WorkerClient(
    port,
    () => identity,
    () => tick.now,
  );
  const store = new GovernorMemoryStore(options.maxRecords ?? 128, 32 * 1024 * 1024);
  const governor = new WorkerResourceGovernor(client, store, () => tick.now);
  const queue = new LearningEstimatorQueue({
    governor,
    engineVersion: options.engineVersion,
    now: () => tick.now,
  });

  function resultFor(start: Packet): ArrayBuffer {
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
      ...(patches.get(start.segmentId) ?? {}),
    });
  }

  function reply(start: Packet): void {
    const kind = plans.get(start.segmentId) ?? 'result';
    if (kind === 'cancelled') {
      receive({
        ...start,
        type: 'cancelled',
        sequence: 1,
        buffer: new ArrayBuffer(0),
        payloadBytes: 0,
        ownership: 'copy',
      });
      return;
    }
    if (kind === 'error') {
      receive({
        ...start,
        type: 'error',
        sequence: 1,
        buffer: new ArrayBuffer(0),
        payloadBytes: 0,
        ownership: 'copy',
        error: 'Synthetic estimator failure',
      });
      return;
    }
    const buffer = resultFor(start);
    receive({
      ...start,
      type: 'result',
      sequence: 1,
      buffer,
      payloadBytes: buffer.byteLength,
      ownership: 'copy',
    });
  }

  return {
    queue,
    governor,
    starts,
    controls,
    tick,
    plan(segmentId: string, kind: LearningQueueReplyKind): void {
      plans.set(segmentId, kind);
    },
    override(segmentId: string, patch: Partial<LearningEstimateResult>): void {
      patches.set(segmentId, patch);
    },
    dispose(): void {
      queue.dispose();
      governor.dispose();
    },
  };
}
