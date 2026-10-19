import { parentPort } from 'node:worker_threads';
import { WorkerRuntime } from '../../src/workers/index.ts';
import { earlyLoopTaskFactory } from '../harness/early-loop-governor-task.ts';

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
new WorkerRuntime(transport, earlyLoopTaskFactory());
