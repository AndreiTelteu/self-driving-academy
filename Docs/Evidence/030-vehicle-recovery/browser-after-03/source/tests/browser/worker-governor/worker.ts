import { messageTransport, WorkerRuntime } from '../../../src/workers';
import { governorTaskFactory } from '../../harness/governor-task';
import type { MessageEndpoint } from '../../../src/workers/transport';
// This entry point executes only in a DedicatedWorker, while the shared test tsconfig includes DOM.
declare const self: MessageEndpoint;
new WorkerRuntime(messageTransport(self), governorTaskFactory());
