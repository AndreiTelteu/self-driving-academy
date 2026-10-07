import { WorkerClient } from './client';
import type { JobOutcome } from './client';
import { parsePacket } from './protocol';
import type { Packet } from './protocol';

/** Finite synthetic protocol limits, not calibrated gameplay/OS priorities. */
export const governorLimits = Object.freeze({
  version: '221-synthetic-1',
  jobs: 8,
  payloadBytes: 16 * 1024 * 1024,
  persistenceIngressJobs: 8,
  persistenceIngressBytes: 16 * 1024 * 1024,
  heavyJobs: 1,
  residentExperimentWorlds: 1,
  optionalAgeMs: 30_000,
  history: 64,
});
export type WorkerOperation = 'learning' | 'encode' | 'hash' | 'comparison';
export interface RetainedJob {
  readonly key: string;
  readonly job: Packet;
  readonly operation: WorkerOperation;
}
/** Implementations must be bounded and atomically deduplicate keys, preserving exact bytes.
 * Persistence is supplied by the application; this port does not implement IndexedDB.
 * list returns at most limit pending records; completed evidence survives until acknowledge.
 */
export interface ProtectedJobStore {
  retain(
    record: RetainedJob,
  ): Promise<'PENDING' | 'COMPLETED' | 'CAPACITY_INSUFFICIENT' | 'CONFLICT'>;
  list(limit: number): Promise<readonly RetainedJob[]>;
  complete(key: string, result: Packet): Promise<void>;
  invalidateResult(key: string): Promise<void>;
  completed(limit: number): Promise<readonly { key: string; result: Packet }[]>;
  acknowledge(key: string): Promise<void>;
}
export type GovernorState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'ERROR';
export interface GovernorTicket {
  readonly key: string;
  readonly outcome: Promise<JobOutcome>;
  readonly state: GovernorState;
}
export interface Admission {
  readonly status: 'PENDING' | 'CAPACITY_INSUFFICIENT' | 'SESSION_SUSPENDED';
  readonly reason?: string;
  readonly ticket?: GovernorTicket;
}
export interface GovernorMeasurement {
  readonly key: string;
  readonly attempt: number;
  readonly status: JobOutcome['status'];
  readonly queueMs: number;
  readonly serviceMs: number;
  readonly endToEndMs: number;
  readonly cancellationMs: number | null;
  readonly preempted: boolean;
}
interface Entry {
  key: string;
  job: Packet;
  operation: WorkerOperation;
  protected: boolean;
  admitted: number;
  attemptQueued: number;
  started: number;
  attempt: number;
  state: GovernorState;
  cancelled: boolean;
  preempted: boolean;
  cancelAt: number | null;
  transportId?: string;
  resolve: (outcome: JobOutcome) => void;
  ticket: GovernorTicket;
}
export function protectedJobKey(job: Packet, operation: WorkerOperation = 'learning'): string {
  return JSON.stringify([
    operation,
    job.sessionId,
    job.worldEpoch,
    job.learningEpoch,
    job.profileId,
    job.baseVersionId,
    job.segmentId,
  ]);
}
const rank = (job: Packet, operation: WorkerOperation) =>
  job.priority === 'protected'
    ? 0
    : operation === 'learning'
      ? 1
      : operation === 'comparison'
        ? 3
        : 2;

/** One coordinator owns all heavy learning, encode/hash and comparison submissions.
 * Feed every heavy producer through this instance, backed by one serial WorkerRuntime.
 * Cancellation acknowledges a slice boundary before the next job is dispatched.
 */
export class WorkerResourceGovernor {
  private entries = new Map<string, Entry>();
  private active?: Entry;
  private bytes = 0;
  private nextId = 0;
  private reservations = 0;
  private reservedBytes = 0;
  private closed = false;
  private pressured = false;
  private context: 'active' | 'idle' | 'paused' = 'active';
  private history: GovernorMeasurement[] = [];
  private suspendedReason: string | null = null;
  private client: WorkerClient;
  private store: ProtectedJobStore;
  private now: () => number;
  private measure: (sample: GovernorMeasurement) => void;
  constructor(
    client: WorkerClient,
    store: ProtectedJobStore,
    now: () => number = () => performance.now(),
    measure: (sample: GovernorMeasurement) => void = () => {},
  ) {
    this.client = client;
    this.store = store;
    this.now = now;
    this.measure = measure;
  }

  get usage() {
    return Object.freeze({
      version: governorLimits.version,
      jobs: this.entries.size,
      bytes: this.bytes,
      persistenceIngressJobs: this.reservations,
      persistenceIngressBytes: this.reservedBytes,
      activeHeavyJobs: this.active ? 1 : 0,
      history: this.history.length,
      transport: this.client.usage,
      pressure: this.pressured,
      context: this.context,
      suspendedReason: this.suspendedReason,
    });
  }
  get measurements(): readonly GovernorMeasurement[] {
    return this.history.slice();
  }
  async submit(value: unknown, operation?: WorkerOperation): Promise<Admission> {
    const job = parsePacket(value);
    operation ??= job.priority === 'optional' ? 'comparison' : 'learning';
    if (!['learning', 'encode', 'hash', 'comparison'].includes(operation))
      throw new Error('Invalid operation');
    if (operation === 'learning' && job.priority === 'optional')
      throw new Error('Learning evidence must be protected');
    if (job.type !== 'start') throw new Error('Governor accepts start packets only');
    if (this.closed) return { status: 'CAPACITY_INSUFFICIENT', reason: 'Governor disposed' };
    const key = protectedJobKey(job, operation);
    const existing = this.entries.get(key);
    if (existing) return { status: 'PENDING', ticket: existing.ticket, reason: 'Already admitted' };
    const protectedData = job.priority !== 'optional';
    let owned = job;
    // No transfer is performed on caller-owned buffers, including evidence/live snapshots.
    // The store and each execution attempt receive distinct, privately owned copies.
    if (protectedData) {
      if (
        this.reservations >= governorLimits.persistenceIngressJobs ||
        this.reservedBytes + job.payloadBytes > governorLimits.persistenceIngressBytes
      )
        return this.suspend(
          'Protected persistence ingress full; preserve caller evidence and retry',
        );
      this.reservations++;
      this.reservedBytes += job.payloadBytes;
      try {
        owned = this.copy(job);
        const retained = await this.store.retain({ key, operation, job: owned });
        if (retained === 'CAPACITY_INSUFFICIENT')
          return this.suspend('Protected persistence capacity insufficient');
        if (retained === 'CONFLICT')
          return this.suspend(
            'Protected identity conflicts with retained evidence; caller must resolve without overwrite',
          );
        if (retained === 'COMPLETED')
          return {
            status: 'PENDING',
            reason: 'Completed proposal retained; recover and acknowledge, do not execute twice',
          };
      } catch {
        return this.suspend(
          'Protected persistence failed; preserve caller data and suspend session',
        );
      } finally {
        this.reservations--;
        this.reservedBytes -= job.payloadBytes;
      }
      if (this.closed) return { status: 'PENDING', reason: 'Retained; governor disposed' };
      const concurrent = this.entries.get(key);
      if (concurrent) return { status: 'PENDING', ticket: concurrent.ticket };
    }
    if (!this.fits(job))
      return protectedData
        ? { status: 'PENDING', reason: 'Retained; waiting for governor capacity' }
        : {
            status: 'CAPACITY_INSUFFICIENT',
            reason: 'Optional job refused before ownership transfer',
          };
    return this.admit(key, owned, protectedData, operation);
  }

  /** Resume persisted pending work after capacity/pressure changes or worker replacement.
   * The store must respect the requested bound; oversized batches are rejected before admission.
   */
  async resume(): Promise<void> {
    if (this.closed) return;
    let records: readonly RetainedJob[];
    try {
      records = await this.store.list(governorLimits.jobs);
      if (records.length > governorLimits.jobs) throw new Error('Unbounded store response');
    } catch {
      this.suspend('Protected persistence cannot resume; session must remain suspended');
      return;
    }
    for (const record of records) {
      const job = parsePacket(record.job);
      if (
        record.key !== protectedJobKey(job, record.operation) ||
        !['learning', 'encode', 'hash', 'comparison'].includes(record.operation) ||
        job.type !== 'start' ||
        job.priority === 'optional'
      ) {
        this.suspend('Invalid protected persistence record');
        return;
      }
      if (!this.closed && !this.entries.has(record.key) && this.fits(job))
        this.admit(record.key, job, true, record.operation);
    }
    this.pump();
  }

  /** Only the publishing service may retire durable evidence after its idempotent commit. */
  async acknowledge(key: string): Promise<void> {
    if (this.entries.has(key)) throw new Error('Cannot retire unfinished work');
    await this.store.acknowledge(key);
  }
  /** Crash/restart recovery of completed proposals; publication remains caller-idempotent. */
  async completed(): Promise<readonly { key: string; result: Packet }[]> {
    const results = await this.store.completed(governorLimits.jobs);
    if (results.length > governorLimits.jobs) throw new Error('Unbounded completed response');
    return results.map(({ key, result }) => ({ key, result: this.copy(parsePacket(result)) }));
  }
  setPressure(pressure: boolean, context: 'active' | 'idle' | 'paused' = this.context): void {
    this.pressured = pressure;
    this.context = context;
    if (
      pressure &&
      context === 'active' &&
      this.active &&
      rank(this.active.job, this.active.operation) > 1
    )
      this.interrupt(this.active, true);
    this.pump();
  }
  cancel(key: string): void {
    const entry = this.entries.get(key);
    if (!entry || entry.cancelled) return;
    entry.cancelled = true;
    if (entry === this.active) this.interrupt(entry, false);
    else this.finish(entry, { status: 'cancelled' });
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.client.dispose();
    for (const entry of this.entries.values())
      this.finish(entry, {
        status: 'error',
        reason: 'Governor disposed; protected evidence retained',
      });
    this.active = undefined;
  }
  private suspend(reason: string): Admission {
    this.suspendedReason = reason;
    return { status: 'SESSION_SUSPENDED', reason };
  }
  private copy(job: Packet): Packet {
    return parsePacket({ ...job, buffer: job.buffer.slice(0) });
  }
  private fits(job: Packet): boolean {
    return (
      this.entries.size < governorLimits.jobs &&
      this.bytes + job.payloadBytes <= governorLimits.payloadBytes
    );
  }
  private admit(
    key: string,
    source: Packet,
    protectedData: boolean,
    operation: WorkerOperation,
  ): Admission {
    const job = this.copy(source);
    let resolve!: Entry['resolve'];
    const outcome = new Promise<JobOutcome>((done) => {
      resolve = done;
    });
    const admitted = this.now();
    const entry: Entry = {
      key,
      job,
      operation,
      protected: protectedData,
      admitted,
      attemptQueued: admitted,
      started: admitted,
      attempt: 0,
      state: 'PENDING',
      cancelled: false,
      preempted: false,
      cancelAt: null,
      resolve,
      ticket: {
        key,
        outcome,
        get state() {
          return entry.state;
        },
      },
    };
    this.entries.set(key, entry);
    this.bytes += job.payloadBytes;
    if (this.active && rank(job, operation) < rank(this.active.job, this.active.operation))
      this.interrupt(this.active, true);
    this.pump();
    return { status: 'PENDING', ticket: entry.ticket };
  }
  private interrupt(entry: Entry, preempted: boolean): void {
    entry.preempted = preempted && !entry.cancelled;
    if (entry.cancelAt === null) entry.cancelAt = this.now();
    if (entry.transportId) this.client.cancel(entry.transportId);
  }
  private pump(): void {
    if (this.closed || this.active) return;
    for (const entry of this.entries.values())
      if (!entry.protected && this.now() - entry.admitted >= governorLimits.optionalAgeMs)
        this.finish(entry, { status: 'stale', reason: 'Optional queue lease expired' });
    const next = [...this.entries.values()]
      .filter(
        (entry) =>
          !entry.cancelled &&
          entry.state === 'PENDING' &&
          !(rank(entry.job, entry.operation) > 1 && this.pressured && this.context === 'active'),
      )
      .sort(
        (a, b) => rank(a.job, a.operation) - rank(b.job, b.operation) || a.admitted - b.admitted,
      )[0];
    if (!next) return;
    this.active = next;
    next.state = 'RUNNING';
    next.started = this.now();
    next.attempt++;
    if (this.nextId >= Number.MAX_SAFE_INTEGER) {
      this.active = undefined;
      this.finish(next, { status: 'error', reason: 'Replace exhausted transport' });
      return;
    }
    next.transportId = String(++this.nextId);
    let pending: Promise<JobOutcome>;
    try {
      pending = this.client.submit({ ...this.copy(next.job), jobId: next.transportId });
    } catch {
      pending = Promise.resolve({ status: 'error', reason: 'Transport admission failed' });
    }
    void pending.then(async (outcome) => {
      if (!this.entries.has(next.key)) return;
      const ended = this.now();
      const sample: GovernorMeasurement = Object.freeze({
        key: next.key,
        attempt: next.attempt,
        status: outcome.status,
        queueMs: next.started - next.attemptQueued,
        serviceMs: ended - next.started,
        endToEndMs: ended - next.admitted,
        cancellationMs: next.cancelAt === null ? null : ended - next.cancelAt,
        preempted: next.preempted,
      });
      this.history.push(sample);
      if (this.history.length > governorLimits.history) this.history.shift();
      try {
        this.measure(sample);
      } catch {
        /* Observer cannot own lifecycle. */
      }
      if (next.preempted && !next.cancelled && outcome.status === 'cancelled' && !this.closed) {
        next.state = 'PENDING';
        next.preempted = false;
        next.cancelAt = null;
        next.attemptQueued = ended;
      } else {
        if (next.protected && outcome.status === 'result') {
          try {
            await this.store.complete(next.key, outcome.packet!);
            if (next.cancelled || this.closed) {
              await this.store.invalidateResult(next.key);
              outcome = { status: 'cancelled' };
            }
          } catch {
            this.suspend('Protected completion persistence failed; caller must not publish');
            outcome = { status: 'error', reason: 'Protected completion persistence failed' };
          }
        }
        this.finish(next, outcome);
      }
      if (this.active === next) this.active = undefined;
      this.pump();
    });
  }
  private finish(entry: Entry, outcome: JobOutcome): void {
    if (!this.entries.delete(entry.key)) return;
    this.bytes -= entry.job.payloadBytes;
    entry.state =
      outcome.status === 'result'
        ? 'COMPLETED'
        : outcome.status === 'cancelled'
          ? 'CANCELLED'
          : 'ERROR';
    entry.resolve(outcome);
    // Remove retained buffer references from completed tickets and async closures.
    entry.job = parsePacket({ ...entry.job, buffer: new ArrayBuffer(0), payloadBytes: 0 });
  }
}
