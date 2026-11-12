import { readFileSync } from 'node:fs';
import {
  WorkerClient,
  WorkerResourceGovernor,
  WorkerRuntime,
  governorLimits,
} from '../../src/workers';
import type {
  JobOutcome,
  Packet,
  ProtectedJobStore,
  TaskFactory,
  Transport,
} from '../../src/workers';
import {
  decodeExperimentSlice,
  encodeExperimentSliceResult,
} from '../../src/experiments/experiment-worker-governor';
import type {
  ExperimentBatchRow,
  ExperimentRunPort,
  ExperimentSlice,
  ExperimentSliceExecution,
} from '../../src/experiments/experiment-worker';
import { GovernorMemoryStore } from '../harness/governor-store';
import { compareProfile, runCompareCohort } from './experiment-compare-fixture';

/**
 * Deterministic composition for PBI 144.
 *
 * The batch contract itself has no worker imports: these helpers wire the **real** 221 coordinator
 * (`WorkerResourceGovernor` + `WorkerClient` + `WorkerRuntime`) over an in-process transport and run
 * the **real** 142 rerun per slice. The transport models the cross-thread boundary by delivering on
 * a later macrotask, exactly like `postMessage`, so the caller's turn is never blocked by a slice.
 *
 * Everything here is a fixture composition, not a second experiment engine: one slice is one real
 * `142-experiment-rerun-v1` run cell (a real profile pair on one base seed), and the row is copied
 * from the numbers 142 returned.
 */

/** A base seed the run-cell task refuses to execute, to exercise a real worker error. */
export const WORKER_ERROR_SEED = 142_902;

/** Identity shared by the governor, the client and every packet. */
export const EXPERIMENT_WORKER_IDENTITY = Object.freeze({
  sessionId: 'session-144',
  worldEpoch: 1,
  learningEpoch: 1,
  profileId: 'prudent-144@1',
  baseVersionId: 'prudent-144@1',
});

/** The two real profile versions the fixture batches compare. */
export const EXPERIMENT_PROFILES = Object.freeze(['prudent-144@1', 'impulsive-144@1']);

/** The real manifest, read from disk so the budgets are never typed by hand. */
export function readPerformanceManifest(): unknown {
  return JSON.parse(
    readFileSync(new URL('../../Docs/performance-budgets.json', import.meta.url), 'utf8'),
  );
}

/** A structural copy a probe can mutate without touching the file. */
export function copyManifest(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(readPerformanceManifest())) as Record<string, unknown>;
}

/* ---------------------------------------------------------------- transport */

interface TransportPair {
  readonly client: Transport;
  readonly worker: Transport;
  readonly failClient: (reason: string) => void;
  readonly dispose: () => void;
}

/** Two async transports that model `postMessage`: nothing is delivered inside `send`. */
function createTransportPair(): TransportPair {
  let clientMessage: (value: unknown) => void = () => {};
  let clientError: (reason: string) => void = () => {};
  let workerMessage: (value: unknown) => void = () => {};
  let workerError: (reason: string) => void = () => {};
  let closed = false;
  const deliver = (target: 'client' | 'worker', value: unknown): void => {
    setImmediate(() => {
      if (closed) return;
      if (target === 'client') clientMessage(value);
      else workerMessage(value);
    });
  };
  return {
    client: {
      send: (packet) => deliver('worker', packet),
      listen: (message, error) => {
        clientMessage = message;
        clientError = error;
        return () => {};
      },
    },
    worker: {
      send: (packet) => deliver('client', packet),
      listen: (message, error) => {
        workerMessage = message;
        workerError = error;
        return () => {};
      },
    },
    failClient: (reason) => {
      if (closed) return;
      clientError(reason);
    },
    dispose: () => {
      closed = true;
      workerError('The experiment worker transport was closed');
    },
  };
}

/* -------------------------------------------------------------------- tasks */

/** A learning probe: it does no experiment work, it only takes the coordinator's turn. */
function learningTask(): ReturnType<TaskFactory> {
  return {
    step: () => ({ done: true, progress: 1, result: new ArrayBuffer(0) }),
    dispose: () => {},
  };
}

/** Copies one slice row out of a finished 142 rerun; nothing is recalculated here. */
export function rowFromRerun(
  result: ReturnType<typeof runCompareCohort>,
  slice: ExperimentSlice,
): ExperimentBatchRow {
  const comparison = result.comparisons[0];
  if (comparison === undefined) throw new Error('The 142 rerun produced no comparison');
  const causes: Record<string, number> = {};
  const parameters = new Set<string>();
  for (const divergence of comparison.divergences) {
    causes[divergence.cause] = (causes[divergence.cause] ?? 0) + 1;
    if (divergence.parameter !== null) parameters.add(divergence.parameter);
  }
  return Object.freeze({
    sliceId: slice.sliceId,
    runId: slice.runId,
    baseSeed: slice.baseSeed,
    profileVersionIds: slice.profileVersionIds,
    decisions: comparison.identical + comparison.divergent,
    identical: comparison.identical,
    divergent: comparison.divergent,
    causes: Object.freeze({ ...causes }),
    parameters: Object.freeze([...parameters].sort()),
    model: slice.model,
    label: 'COMPLETE' as const,
    partialReason: null,
  });
}

export interface ExperimentTaskOptions {
  /** Clock used only to report how long the run cell took; injected so the transcript can drop it. */
  readonly now?: () => number;
  /** Called once per task instance, before its first step; the preemption probe waits on it. */
  readonly onFirstStep?: () => void;
}

/**
 * One real run cell per task: restore the 142 fixture, rerun the pairwise comparison for this seed and
 * return its numbers. The cell is atomic — 142 exposes no incremental evaluation yet — so the whole
 * run happens in one `step()` and the transcript reports that honestly.
 */
export function createRunCellTaskFactory(options: ExperimentTaskOptions = {}): TaskFactory {
  const now = options.now ?? (() => 0);
  return (job: Packet) => {
    if (job.priority !== 'optional') return learningTask();
    const slice = decodeExperimentSlice(job.buffer);
    if (slice.baseSeed === WORKER_ERROR_SEED)
      throw new Error(`The experiment worker could not run seed ${slice.baseSeed}`);
    const started = now();
    let announced = false;
    return {
      step: () => {
        if (!announced) {
          announced = true;
          options.onFirstStep?.();
        }
        const result = runCompareCohort(
          slice.profileVersionIds.map((versionId) =>
            compareProfile(versionId.startsWith('impulsive') ? 'IMPULSIVE' : 'PRUDENT', versionId),
          ),
          slice.baseSeed,
        );
        const row = rowFromRerun(result, slice);
        return {
          done: true,
          progress: 1,
          result: encodeExperimentSliceResult({ rows: [row], stepMs: now() - started }),
        };
      },
      dispose: () => {},
    };
  };
}

/**
 * A cooperative variant used only to prove the 221 preemption path: the task yields several cheap
 * steps before doing the real run cell, so an interactive learning job can preempt it exactly like a
 * production slice that respects `sliceMs`.
 */
export function createCooperativeTaskFactory(options: ExperimentTaskOptions = {}): TaskFactory {
  const now = options.now ?? (() => 0);
  const steps = 8;
  return (job: Packet) => {
    if (job.priority !== 'optional') return learningTask();
    const slice = decodeExperimentSlice(job.buffer);
    const started = now();
    let step = 0;
    let announced = false;
    return {
      step: () => {
        if (!announced) {
          announced = true;
          options.onFirstStep?.();
        }
        step += 1;
        if (step < steps) {
          let acc = 0x811c9dc5;
          for (let index = 0; index < 512; index += 1) acc = Math.imul(acc ^ index, 0x01000193);
          return { done: false, progress: step / steps };
        }
        const result = runCompareCohort(
          slice.profileVersionIds.map((versionId) =>
            compareProfile(versionId.startsWith('impulsive') ? 'IMPULSIVE' : 'PRUDENT', versionId),
          ),
          slice.baseSeed,
        );
        return {
          done: true,
          progress: 1,
          result: encodeExperimentSliceResult({
            rows: [rowFromRerun(result, slice)],
            stepMs: now() - started,
          }),
        };
      },
      dispose: () => {},
    };
  };
}

/* --------------------------------------------------------------- live stack */

export interface LiveExperimentHarnessOptions {
  readonly now?: () => number;
  readonly task?: 'RUN_CELL' | 'COOPERATIVE';
  readonly onFirstStep?: () => void;
  readonly store?: ProtectedJobStore;
}

export interface LiveExperimentHarness {
  readonly governor: WorkerResourceGovernor;
  readonly client: WorkerClient;
  readonly runtime: WorkerRuntime;
  readonly identity: typeof EXPERIMENT_WORKER_IDENTITY;
  readonly store: ProtectedJobStore;
  /** Submits an interactive learning job through the same coordinator; it wins the next turn. */
  submitLearning(learningEpoch?: number): Promise<JobOutcome>;
  /** Acknowledge the learning proposal so the protected store does not keep it. */
  acknowledgeLearning(promise: Promise<JobOutcome>): Promise<void>;
  dispose(): void;
}

/**
 * The real 221 stack in one process: the coordinator, the client, the runtime and the linked
 * transports. It is the composition the app would use with a real `Worker`, minus the OS thread.
 */
export function createLiveExperimentHarness(
  options: LiveExperimentHarnessOptions = {},
): LiveExperimentHarness {
  const store = options.store ?? new GovernorMemoryStore();
  const transport = createTransportPair();
  const client = new WorkerClient(transport.client, () => EXPERIMENT_WORKER_IDENTITY);
  const runtime = new WorkerRuntime(
    transport.worker,
    options.task === 'COOPERATIVE'
      ? createCooperativeTaskFactory({ now: options.now, onFirstStep: options.onFirstStep })
      : createRunCellTaskFactory({ now: options.now, onFirstStep: options.onFirstStep }),
  );
  const governor = new WorkerResourceGovernor(client, store, options.now);
  let learningJobs = 0;
  return {
    governor,
    client,
    runtime,
    identity: EXPERIMENT_WORKER_IDENTITY,
    store,
    submitLearning(learningEpoch = 1): Promise<JobOutcome> {
      learningJobs += 1;
      const buffer = new ArrayBuffer(0);
      const packet: Packet = Object.freeze({
        ...EXPERIMENT_WORKER_IDENTITY,
        jobId: String(learningJobs),
        segmentId: `learning/${learningEpoch}/${learningJobs}`,
        type: 'start' as const,
        sequence: 0,
        payloadBytes: 0,
        ownership: 'copy' as const,
        priority: 'interactive' as const,
        buffer,
      });
      return governor.submit(packet, 'learning').then((admission) => {
        if (admission.ticket === undefined)
          return {
            status: 'error' as const,
            reason: admission.reason ?? 'The learning job was not admitted',
          };
        return admission.ticket.outcome;
      });
    },
    async acknowledgeLearning(promise): Promise<void> {
      await promise;
      for (const entry of await store.completed(governorLimits.jobs)) {
        if (entry.key.includes('learning')) await governor.acknowledge(entry.key);
      }
    },
    dispose(): void {
      governor.dispose();
      runtime.dispose();
      transport.dispose();
    },
  };
}

/* ---------------------------------------------------------- admission probe */

export interface GovernorProbe {
  readonly governor: WorkerResourceGovernor;
  /** Fills the coordinator's payload budget with jobs that never answer. */
  readonly hold: (bytes: number) => Promise<void>;
  readonly dispose: () => void;
}

/**
 * A coordinator with a transport that records but never answers, so capacity can be exhausted
 * deterministically and the optional slice is refused by 221 itself.
 */
export function createGovernorProbe(): GovernorProbe {
  const port: Transport = {
    send: () => {},
    listen: () => () => {},
  };
  const client = new WorkerClient(port, () => EXPERIMENT_WORKER_IDENTITY);
  const governor = new WorkerResourceGovernor(client, new GovernorMemoryStore());
  let sequence = 0;
  return {
    governor,
    async hold(bytes: number): Promise<void> {
      sequence += 1;
      const packet: Packet = Object.freeze({
        ...EXPERIMENT_WORKER_IDENTITY,
        jobId: String(sequence),
        segmentId: `hold/${sequence}`,
        type: 'start' as const,
        sequence: 0,
        payloadBytes: bytes,
        ownership: 'copy' as const,
        priority: 'optional' as const,
        buffer: new ArrayBuffer(bytes),
      });
      await governor.submit(packet, 'comparison');
    },
    dispose: () => governor.dispose(),
  };
}

/* ------------------------------------------------- deterministic test double */

export type DeterministicSlicePlan =
  'COMPLETE' | 'CANCEL' | 'ERROR' | 'REFUSE' | 'SUSPEND' | 'STALE';

export interface DeterministicPortOptions {
  readonly plan?: readonly DeterministicSlicePlan[];
  readonly stepMs?: number;
  readonly delayMs?: number;
  readonly delay?: () => Promise<void>;
}

export interface DeterministicPort {
  readonly port: ExperimentRunPort;
  readonly slices: readonly ExperimentSlice[];
  readonly runs: number;
  readonly cancellations: number;
}

/** A fixture row with deterministic numbers; used by behavioural tests only, never as evidence. */
export function fixtureRow(slice: ExperimentSlice): ExperimentBatchRow {
  const divergent = slice.baseSeed % 7;
  const identical = 24 - divergent;
  const causes: Record<string, number> =
    divergent === 0 ? {} : { PROBABILITY_THRESHOLD: divergent };
  return Object.freeze({
    sliceId: slice.sliceId,
    runId: slice.runId,
    baseSeed: slice.baseSeed,
    profileVersionIds: slice.profileVersionIds,
    decisions: 24,
    identical,
    divergent,
    causes: Object.freeze(causes),
    parameters: Object.freeze(divergent === 0 ? [] : ['red_stop_probability']),
    model: slice.model,
    label: 'COMPLETE' as const,
    partialReason: null,
  });
}

/**
 * A deterministic port for behavioural tests: it returns real-shaped rows derived from the slice,
 * waits one macrotask so the caller keeps its turn, and honours the cooperative cancel flag.
 */
export function createDeterministicPort(options: DeterministicPortOptions = {}): DeterministicPort {
  const slices: ExperimentSlice[] = [];
  const state = { runs: 0, cancellations: 0 };
  const wait = options.delay ?? (() => nextMacrotask());
  const port = {
    async run(
      slice: ExperimentSlice,
      control: { readonly cancelled: () => boolean },
    ): Promise<ExperimentSliceExecution> {
      slices.push(slice);
      state.runs += 1;
      const index = Number(slice.sliceId.split('#')[1] ?? 0);
      const plan = options.plan?.[index] ?? 'COMPLETE';
      await wait();
      if (control.cancelled()) {
        state.cancellations += 1;
        return { status: 'CANCELLED', reason: 'The batch asked to stop' };
      }
      if (plan === 'ERROR') return { status: 'ERROR', reason: 'The worker crashed' };
      if (plan === 'REFUSE')
        return { status: 'REFUSED', code: 'CAPACITY_INSUFFICIENT', reason: 'No capacity' };
      if (plan === 'SUSPEND') return { status: 'SUSPENDED', reason: 'Session suspended' };
      if (plan === 'STALE') return { status: 'STALE', reason: 'Target changed' };
      if (plan === 'CANCEL') return { status: 'CANCELLED', reason: 'Cancelled at the step' };
      return {
        status: 'COMPLETED',
        rows: [fixtureRow(slice)],
        stepMs: options.stepMs ?? 4,
        preempted: false,
        cancellationMs: null,
      };
    },
    cancel(): void {
      /* The cooperative flag is enough: the next awaited turn returns CANCELLED. */
    },
  };
  return Object.freeze({
    port,
    get slices(): readonly ExperimentSlice[] {
      return slices;
    },
    get runs(): number {
      return state.runs;
    },
    get cancellations(): number {
      return state.cancellations;
    },
  });
}

/** Resolves on the next macrotask; the tests use it instead of any wall clock. */
export const nextMacrotask = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));
