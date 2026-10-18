import { messageTransport } from '../../../src/workers/index';
export function browserWorkerTransport(worker: Worker) {
  return messageTransport(worker);
}
