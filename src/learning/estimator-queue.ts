import {
  createMemoryProtectedJobStore,
  WorkerClient,
  WorkerResourceGovernor,
  WorkerRuntime,
  type Packet,
  type ProtectedJobStore,
  type Transport,
} from '../workers';
import { createLearningEstimatorTask } from './estimator-task';
import { LearningEstimatorQueue } from './estimator-worker';

/**
 * Production wiring for the 103 serial estimator queue.
 *
 * The queue, the 221 governor, the worker client/runtime and the estimator task are the real
 * contracts. Only the transport is selected by the host: the browser can attach a dedicated Worker
 * port, while the deterministic Node report and tests use the same runtime on an in-process
 * loopback transport. There is no second estimator and no second queue.
 */
export const LEARNING_QUEUE_RUNTIME_VERSION = '273-learning-queue-runtime-v1' as const;

export interface LearningQueueRuntime {
  readonly version: typeof LEARNING_QUEUE_RUNTIME_VERSION;
  readonly queue: LearningEstimatorQueue;
  readonly governor: WorkerResourceGovernor;
  readonly runtime: WorkerRuntime;
  readonly store: ProtectedJobStore;
  dispose(): void;
}

export interface LearningQueueRuntimeOptions {
  readonly engineVersion: string;
  readonly now?: () => number;
  readonly store?: ProtectedJobStore;
  readonly maxPending?: number;
  readonly maxBytes?: number;
  readonly maxProposals?: number;
  readonly history?: number;
}

function clonePacket(packet: Packet): Packet {
  return Object.freeze({ ...packet, buffer: packet.buffer.slice(0) });
}

interface Loopback {
  readonly client: Transport;
  readonly runtime: Transport;
  close(): void;
}

/**
 * A single duplex in-process transport. Messages are delivered on a microtask so dispatch coalescing
 * and the runtime's message-yield loop keep the same ordering as a real worker port.
 */
function createLoopback(): Loopback {
  let clientReceive: ((value: unknown) => void) | null = null;
  let runtimeReceive: ((value: unknown) => void) | null = null;
  let closed = false;
  const client: Transport = {
    send(packet, transfer) {
      if (closed) return;
      const copy = clonePacket(packet);
      queueMicrotask(() => runtimeReceive?.(copy));
      void transfer;
    },
    listen(callback) {
      clientReceive = callback;
      return () => {
        clientReceive = null;
      };
    },
  };
  const runtime: Transport = {
    send(packet, transfer) {
      if (closed) return;
      const copy = clonePacket(packet);
      queueMicrotask(() => clientReceive?.(copy));
      void transfer;
    },
    listen(callback) {
      runtimeReceive = callback;
      return () => {
        runtimeReceive = null;
      };
    },
  };
  return {
    client,
    runtime,
    close() {
      closed = true;
      clientReceive = null;
      runtimeReceive = null;
    },
  };
}

/**
 * Creates the shared 103/221 runtime. `attachWorkerTransport` may replace the loopback with a real
 * Worker port; the runtime is then recreated against the same store and queue options.
 */
export function createLearningQueueRuntime(
  options: LearningQueueRuntimeOptions,
): LearningQueueRuntime {
  if (typeof options !== 'object' || options === null)
    throw new Error('The learning queue runtime requires options');
  if (typeof options.engineVersion !== 'string' || options.engineVersion.length === 0)
    throw new Error('The learning queue runtime requires an engine version');
  const now = options.now ?? (() => performance.now());
  const loopback = createLoopback();
  const identity = {
    baseVersionId: '',
    profileId: '',
    learningEpoch: 0,
    sessionId: '',
    worldEpoch: 0,
  };
  const clientTransport: Transport = {
    send(packet, transfer) {
      identity.baseVersionId = packet.baseVersionId;
      identity.profileId = packet.profileId;
      identity.learningEpoch = packet.learningEpoch;
      identity.sessionId = packet.sessionId;
      identity.worldEpoch = packet.worldEpoch;
      loopback.client.send(packet, transfer);
    },
    listen(callback, error) {
      return loopback.client.listen(callback, error);
    },
  };
  const client = new WorkerClient(clientTransport, () => identity, now);
  const store = options.store ?? createMemoryProtectedJobStore();
  const governor = new WorkerResourceGovernor(client, store, now);
  const runtime = new WorkerRuntime(loopback.runtime, createLearningEstimatorTask(), now);
  const queue = new LearningEstimatorQueue({
    governor,
    engineVersion: options.engineVersion,
    now,
    ...(options.maxPending === undefined ? {} : { maxPending: options.maxPending }),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    ...(options.maxProposals === undefined ? {} : { maxProposals: options.maxProposals }),
    ...(options.history === undefined ? {} : { history: options.history }),
  });
  let disposed = false;
  return Object.freeze({
    version: LEARNING_QUEUE_RUNTIME_VERSION,
    queue,
    governor,
    runtime,
    store,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      queue.dispose();
      governor.dispose();
      runtime.dispose();
      loopback.close();
    },
  });
}
