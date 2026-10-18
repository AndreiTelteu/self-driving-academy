import { control, limits, parsePacket, sameIdentity, sendPacket } from './protocol';
import type { JobIdentity, Packet, Transport } from './protocol';
export interface JobOutcome {
  readonly status: 'result' | 'cancelled' | 'error' | 'stale';
  readonly packet?: Packet;
  readonly reason?: string;
}
interface Pending {
  job: Packet;
  resolve: (outcome: JobOutcome) => void;
  sequence: number;
  cancelled: boolean;
  started: number;
  lastProgress: number;
}
export class WorkerClient {
  private pending = new Map<string, Pending>();
  private seen: string[] = [];
  private bytes = 0;
  private disposed = false;
  private unlisten: () => void;
  private watermark = 0;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private port: Transport;
  private current: () => Omit<JobIdentity, 'jobId' | 'segmentId'>;
  private now: () => number;
  private progress: (packet: Packet) => void;
  constructor(
    port: Transport,
    current: () => Omit<JobIdentity, 'jobId' | 'segmentId'>,
    now: () => number = () => performance.now(),
    progress: (packet: Packet) => void = () => {},
  ) {
    this.port = port;
    this.current = current;
    this.now = now;
    this.progress = progress;
    this.unlisten = port.listen(
      (value) => this.receive(value),
      (reason) => this.fail(reason),
    );
  }
  submit(value: unknown): Promise<JobOutcome> {
    this.expire();
    const job = parsePacket(value);
    if (
      this.disposed ||
      job.type !== 'start' ||
      this.pending.has(job.jobId) ||
      Number(job.jobId) <= this.watermark ||
      this.pending.size >= limits.jobs ||
      this.bytes + job.payloadBytes > limits.bytes
    )
      throw new Error('Job admission rejected');
    this.watermark = Number(job.jobId);
    const promise = new Promise<JobOutcome>((resolve) => {
      this.pending.set(job.jobId, {
        job,
        resolve,
        sequence: 0,
        cancelled: false,
        started: this.now(),
        lastProgress: -Infinity,
      });
    });
    this.bytes += job.payloadBytes;
    this.armExpiry();
    try {
      sendPacket(this.port, job);
    } catch {
      this.finish(job.jobId, { status: 'error', reason: 'Transport send failed' });
    }
    return promise;
  }
  cancel(jobId: string): void {
    const pending = this.pending.get(jobId);
    if (!pending || pending.cancelled) return;
    pending.cancelled = true;
    try {
      sendPacket(this.port, control(pending.job, 'cancel', 0));
    } catch {
      this.finish(jobId, { status: 'error', reason: 'Transport cancel failed' });
    }
  }
  expire(): void {
    for (const [id, p] of this.pending)
      if (this.now() - p.started >= limits.ageMs) {
        this.cancel(id);
        this.finish(id, { status: 'stale', reason: 'Job expired' });
      }
  }
  get usage(): Readonly<{ jobs: number; bytes: number; history: number }> {
    return Object.freeze({ jobs: this.pending.size, bytes: this.bytes, history: this.seen.length });
  }
  dispose(): void {
    this.disposed = true;
    this.unlisten();
    this.fail('Client disposed');
    clearTimeout(this.expiryTimer);
  }
  private receive(value: unknown): void {
    this.expire();
    let p: Packet;
    try {
      p = parsePacket(value);
    } catch {
      return;
    }
    const pending = this.pending.get(p.jobId);
    if (
      !pending ||
      !sameIdentity(p, pending.job) ||
      p.sequence <= pending.sequence ||
      p.type === 'start' ||
      p.type === 'cancel' ||
      p.priority !== pending.job.priority
    )
      return;
    pending.sequence = p.sequence;
    const current = this.current();
    if (!sameIdentity(p, { ...current, jobId: p.jobId, segmentId: p.segmentId })) {
      this.finish(p.jobId, { status: 'stale', reason: 'Target changed' });
      return;
    }
    if (p.type === 'progress') {
      if (!pending.cancelled && this.now() - pending.lastProgress >= limits.progressMs) {
        pending.lastProgress = this.now();
        try {
          this.progress(p);
        } catch {
          /* Observer failures do not own job lifecycle. */
        }
      }
      return;
    }
    if (pending.cancelled || p.type === 'cancelled') this.finish(p.jobId, { status: 'cancelled' });
    else if (p.type === 'error') this.finish(p.jobId, { status: 'error', reason: p.error });
    else this.finish(p.jobId, { status: 'result', packet: p });
  }
  private finish(id: string, outcome: JobOutcome): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    this.bytes -= p.job.payloadBytes;
    this.seen.push(id);
    if (this.seen.length > limits.history) this.seen.shift();
    p.resolve(outcome);
    this.armExpiry();
  }
  private armExpiry(): void {
    clearTimeout(this.expiryTimer);
    if (this.disposed || !this.pending.size) return;
    const remaining = Math.min(
      ...[...this.pending.values()].map((p) => limits.ageMs - (this.now() - p.started)),
    );
    this.expiryTimer = setTimeout(
      () => {
        this.expire();
        this.armExpiry();
      },
      Math.max(1, remaining),
    );
  }
  private fail(reason: string): void {
    for (const id of this.pending.keys()) this.finish(id, { status: 'error', reason });
  }
}
