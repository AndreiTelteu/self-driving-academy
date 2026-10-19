import { parentPort } from 'node:worker_threads';
import { WorkerRuntime } from '../../src/workers/index.ts';
import { createLearningEstimatorTask } from '../../src/learning/index.ts';
import { governorTaskFactory } from '../harness/governor-task.ts';

/**
 * The 221 synthetic task stays the secondary/comparison workload; learning segments use the real
 * 103 estimator task. Both run behind the same serial WorkerRuntime.
 */
const estimator = createLearningEstimatorTask();
const synthetic = governorTaskFactory();
const factory = (job) =>
  job.segmentId.startsWith('secondary') ? synthetic(job) : estimator(job);

const transport = {
  send: (packet, transfers) => parentPort.postMessage(packet, transfers),
  listen: (message, error) => {
    parentPort.on('message', message);
    parentPort.on('messageerror', error);
    return () => {
      parentPort.off('message', message);
      parentPort.off('messageerror', error);
    };
  },
};
new WorkerRuntime(transport, factory);
