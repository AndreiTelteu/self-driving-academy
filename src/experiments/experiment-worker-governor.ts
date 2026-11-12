import type { Admission, Packet, WorkerOperation, WorkerResourceGovernor } from '../workers';
import { EXPERIMENT_WORKER_VERSION, experimentModelKinds } from './experiment-worker';
import type {
  ExperimentBatchRow,
  ExperimentModelKind,
  ExperimentPartialReason,
  ExperimentRunPort,
  ExperimentSlice,
  ExperimentSliceControl,
  ExperimentSliceExecution,
  ExperimentRowLabel,
} from './experiment-worker';

/**
 * The 221 adapter: every experiment slice becomes one job of the shared
 * `WorkerResourceGovernor` — never a private queue.
 *
 * A slice is submitted as an `optional` job of operation `comparison`, so the coordinator's own
 * rules apply unchanged: capacity refusal is `CAPACITY_INSUFFICIENT`, a suspended session is
 * `SESSION_SUSPENDED`, and interactive learning preempts the slice at its next step. The adapter
 * reports the preemption 221 measured (`preempted`, `cancellationMs`) so the batch transcript shows
 * what really happened to the slice, not an intention.
 *
 * The payload is the slice descriptor encoded as bytes; the worker side decodes it with
 * `decodeExperimentSlice` and answers with `encodeExperimentSliceResult`. Both directions are strict:
 * a malformed payload is an error, never a partially trusted result.
 */

export interface ExperimentGovernorIdentity {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly profileId: string;
  readonly baseVersionId: string;
}

export interface ExperimentGovernorPortOptions {
  readonly governor: WorkerResourceGovernor;
  /** Identity of the owning session; the client drops answers that do not match it. */
  readonly identity: () => ExperimentGovernorIdentity;
  readonly operation?: WorkerOperation;
}

export interface ExperimentGovernorPortUsage {
  readonly submissions: number;
  readonly refusals: number;
  readonly cancellations: number;
  readonly completed: number;
  readonly errors: number;
  readonly preempted: number;
}

export interface ExperimentGovernorPort extends ExperimentRunPort {
  readonly usage: ExperimentGovernorPortUsage;
  /** The bounded 221 measurements of this port's jobs, oldest first. */
  measurements(): readonly Readonly<{
    key: string;
    status: string;
    preempted: boolean;
    queueMs: number;
    serviceMs: number;
    cancellationMs: number | null;
  }>[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function encode(value: unknown): ArrayBuffer {
  const bytes = encoder.encode(JSON.stringify(value));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function decode(buffer: ArrayBuffer): unknown {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0)
    throw new Error('The experiment worker payload is empty');
  return JSON.parse(decoder.decode(new Uint8Array(buffer)));
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, maximum = 128): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum)
    throw new Error(`${path} must be bounded text`);
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${path} must be a safe integer >= ${minimum}`);
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${path} must be a finite number`);
  return value;
}

/** Encodes one slice descriptor for the worker; the buffer owns its bytes. */
export function encodeExperimentSlice(slice: ExperimentSlice): ArrayBuffer {
  return encode({
    version: EXPERIMENT_WORKER_VERSION,
    sliceId: slice.sliceId,
    runId: slice.runId,
    batchId: slice.batchId,
    worldKey: slice.worldKey,
    scenarioId: slice.scenarioId,
    ticks: slice.ticks,
    profileVersionIds: [...slice.profileVersionIds],
    baseSeed: slice.baseSeed,
    model: slice.model,
    sliceBudgetMs: slice.sliceBudgetMs,
  });
}

/** Decodes and strictly validates a slice descriptor inside the worker. */
export function decodeExperimentSlice(buffer: ArrayBuffer): ExperimentSlice {
  const value = record(decode(buffer), 'slice');
  if (value.version !== EXPERIMENT_WORKER_VERSION)
    throw new Error(`Unexpected experiment worker version ${String(value.version)}`);
  if (!(experimentModelKinds as readonly unknown[]).includes(value.model))
    throw new Error('The slice model must be FULL or SIMPLIFIED');
  if (!Array.isArray(value.profileVersionIds) || value.profileVersionIds.length < 2)
    throw new Error('A slice compares at least two profile versions');
  return Object.freeze({
    sliceId: text(value.sliceId, 'slice.sliceId'),
    runId: text(value.runId, 'slice.runId'),
    batchId: text(value.batchId, 'slice.batchId'),
    worldKey: text(value.worldKey, 'slice.worldKey'),
    scenarioId: text(value.scenarioId, 'slice.scenarioId'),
    ticks: integer(value.ticks, 'slice.ticks', 1),
    profileVersionIds: Object.freeze(
      value.profileVersionIds.map((entry, index) =>
        text(entry, `slice.profileVersionIds[${index}]`),
      ),
    ),
    baseSeed: integer(value.baseSeed, 'slice.baseSeed'),
    model: value.model as ExperimentModelKind,
    sliceBudgetMs: number(value.sliceBudgetMs, 'slice.sliceBudgetMs'),
  });
}

/** Encodes what one slice really produced: its rows plus the longest synchronous step. */
export function encodeExperimentSliceResult(
  result: Readonly<{
    rows: readonly ExperimentBatchRow[];
    stepMs: number;
  }>,
): ArrayBuffer {
  return encode({
    version: EXPERIMENT_WORKER_VERSION,
    stepMs: result.stepMs,
    rows: result.rows.map((row) => ({
      sliceId: row.sliceId,
      runId: row.runId,
      baseSeed: row.baseSeed,
      profileVersionIds: [...row.profileVersionIds],
      decisions: row.decisions,
      identical: row.identical,
      divergent: row.divergent,
      causes: { ...row.causes },
      parameters: [...row.parameters],
      model: row.model,
    })),
  });
}

const rowLabels: readonly ExperimentRowLabel[] = ['COMPLETE', 'PARTIAL'];
const partialReasons: readonly ExperimentPartialReason[] = [
  'CANCELLED_BY_REQUEST',
  'CANCELLED_WHILE_PAUSED',
  'SLICE_FAILED',
  'CAPACITY_INSUFFICIENT',
  'SESSION_SUSPENDED',
  'STALE_ADMISSION',
];

/** Decodes a slice result on the main thread; a malformed row is a hard error. */
export function decodeExperimentSliceResult(
  buffer: ArrayBuffer,
): Readonly<{ rows: readonly ExperimentBatchRow[]; stepMs: number }> {
  const value = record(decode(buffer), 'result');
  if (value.version !== EXPERIMENT_WORKER_VERSION)
    throw new Error(`Unexpected experiment worker version ${String(value.version)}`);
  const stepMs = number(value.stepMs, 'result.stepMs');
  if (!Array.isArray(value.rows)) throw new Error('result.rows must be an array');
  const rows = value.rows.map((entry, index) => {
    const row = record(entry, `result.rows[${index}]`);
    const causes = record(row.causes, `result.rows[${index}].causes`);
    if (!Array.isArray(row.parameters)) throw new Error('result row parameters must be an array');
    if (!Array.isArray(row.profileVersionIds))
      throw new Error('result row profileVersionIds must be an array');
    if (!(experimentModelKinds as readonly unknown[]).includes(row.model))
      throw new Error('result row model must be FULL or SIMPLIFIED');
    const label = rowLabels.includes(row.label as ExperimentRowLabel)
      ? (row.label as ExperimentRowLabel)
      : 'COMPLETE';
    const partialReason =
      row.partialReason === null ||
      partialReasons.includes(row.partialReason as ExperimentPartialReason)
        ? (row.partialReason as ExperimentPartialReason | null)
        : null;
    return Object.freeze({
      sliceId: text(row.sliceId, `result.rows[${index}].sliceId`),
      runId: text(row.runId, `result.rows[${index}].runId`),
      baseSeed: integer(row.baseSeed, `result.rows[${index}].baseSeed`),
      profileVersionIds: Object.freeze(
        row.profileVersionIds.map((item, position) =>
          text(item, `result.rows[${index}].profileVersionIds[${position}]`),
        ),
      ),
      decisions: integer(row.decisions, `result.rows[${index}].decisions`),
      identical: integer(row.identical, `result.rows[${index}].identical`),
      divergent: integer(row.divergent, `result.rows[${index}].divergent`),
      causes: Object.freeze(
        Object.fromEntries(
          Object.entries(causes).map(([key, count]) => [
            text(key, `result.rows[${index}].causes.${key}`),
            integer(count, `result.rows[${index}].causes.${key}`),
          ]),
        ),
      ),
      parameters: Object.freeze(
        row.parameters.map((item, position) =>
          text(item, `result.rows[${index}].parameters[${position}]`),
        ),
      ),
      model: row.model as ExperimentModelKind,
      label,
      partialReason,
    });
  });
  return Object.freeze({ rows: Object.freeze(rows), stepMs });
}

/**
 * Creates the 221-backed run port. One instance owns the slice-to-ticket mapping so a cooperative
 * cancel reaches the exact transport job, and the outcome is always mapped from what the coordinator
 * reported.
 */
export function createExperimentGovernorPort(
  options: ExperimentGovernorPortOptions,
): ExperimentGovernorPort {
  const governor: WorkerResourceGovernor = options.governor;
  const operation: WorkerOperation = options.operation ?? 'comparison';
  const tickets = new Map<string, string>();
  const pendingCancels = new Set<string>();
  const counts = { submissions: 0, refusals: 0, cancellations: 0, completed: 0, errors: 0 };
  let jobSequence = 0;

  const measurements = () =>
    governor.measurements.map((sample) =>
      Object.freeze({
        key: sample.key,
        status: sample.status,
        preempted: sample.preempted,
        queueMs: sample.queueMs,
        serviceMs: sample.serviceMs,
        cancellationMs: sample.cancellationMs,
      }),
    );
  const preemptionOf = (key: string) => {
    const samples = governor.measurements.filter(
      (sample) => sample.key === key && sample.preempted,
    );
    return samples[samples.length - 1] ?? null;
  };

  return Object.freeze({
    get usage(): ExperimentGovernorPortUsage {
      return Object.freeze({
        submissions: counts.submissions,
        refusals: counts.refusals,
        cancellations: counts.cancellations,
        completed: counts.completed,
        errors: counts.errors,
        preempted: measurements().filter((sample) => sample.preempted).length,
      });
    },
    measurements,
    cancel(sliceId: string): void {
      const key = tickets.get(sliceId);
      if (key === undefined) {
        pendingCancels.add(sliceId);
        return;
      }
      counts.cancellations += 1;
      governor.cancel(key);
    },
    async run(
      slice: ExperimentSlice,
      control: ExperimentSliceControl,
    ): Promise<ExperimentSliceExecution> {
      const identity = options.identity();
      const payload = encodeExperimentSlice(slice);
      jobSequence += 1;
      const packet: Packet = Object.freeze({
        ...identity,
        jobId: String(jobSequence),
        segmentId: slice.sliceId,
        type: 'start' as const,
        sequence: 0,
        payloadBytes: payload.byteLength,
        ownership: 'copy' as const,
        priority: 'optional' as const,
        buffer: payload,
      });
      counts.submissions += 1;
      let admission: Admission;
      try {
        admission = await governor.submit(packet, operation);
      } catch (error) {
        counts.errors += 1;
        return {
          status: 'ERROR',
          reason: error instanceof Error ? error.message : 'The governor rejected the slice packet',
        };
      }
      if (admission.status === 'CAPACITY_INSUFFICIENT') {
        counts.refusals += 1;
        return {
          status: 'REFUSED',
          code: 'CAPACITY_INSUFFICIENT',
          reason: admission.reason ?? '221 has no capacity for this optional slice',
        };
      }
      if (admission.status === 'SESSION_SUSPENDED') {
        counts.refusals += 1;
        return {
          status: 'SUSPENDED',
          code: 'SESSION_SUSPENDED',
          reason: admission.reason ?? '221 suspended the session',
        };
      }
      const ticket = admission.ticket;
      if (ticket === undefined) {
        counts.refusals += 1;
        return {
          status: 'REFUSED',
          code: 'CAPACITY_INSUFFICIENT',
          reason: admission.reason ?? '221 admitted the slice without a ticket',
        };
      }
      tickets.set(slice.sliceId, ticket.key);
      if (pendingCancels.delete(slice.sliceId) || control.cancelled()) {
        counts.cancellations += 1;
        governor.cancel(ticket.key);
      }
      try {
        const outcome = await ticket.outcome;
        if (outcome.status === 'result' && outcome.packet !== undefined) {
          counts.completed += 1;
          const preemption = preemptionOf(ticket.key);
          let decoded: Readonly<{ rows: readonly ExperimentBatchRow[]; stepMs: number }>;
          try {
            decoded = decodeExperimentSliceResult(outcome.packet.buffer);
          } catch (error) {
            counts.errors += 1;
            return {
              status: 'ERROR',
              reason: error instanceof Error ? error.message : 'The slice result is unreadable',
            };
          }
          return {
            status: 'COMPLETED',
            rows: decoded.rows,
            stepMs: decoded.stepMs,
            preempted: preemption !== null,
            cancellationMs: preemption?.cancellationMs ?? null,
          };
        }
        if (outcome.status === 'cancelled') {
          counts.cancellations += 1;
          return { status: 'CANCELLED', reason: outcome.reason ?? 'The slice was cancelled' };
        }
        if (outcome.status === 'stale') {
          counts.refusals += 1;
          return {
            status: 'STALE',
            code: 'STALE_ADMISSION',
            reason: outcome.reason ?? 'The slice expired or its target changed',
          };
        }
        counts.errors += 1;
        return {
          status: 'ERROR',
          reason: outcome.reason ?? 'The worker did not produce a slice result',
        };
      } finally {
        tickets.delete(slice.sliceId);
      }
    },
  });
}
