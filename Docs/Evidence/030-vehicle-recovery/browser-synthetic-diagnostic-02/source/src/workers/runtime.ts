import { control, limits, parsePacket, sameIdentity, sendPacket } from './protocol';
import type { Packet, Transport } from './protocol';
export interface Slice {
  readonly done: boolean;
  readonly progress: number;
  readonly result?: ArrayBuffer;
}
export type TaskFactory = (job: Packet) => { step(deadline: number): Slice; dispose(): void };
interface Entry {
  job: Packet;
  cancelled: boolean;
  sequence: number;
  admitted: number;
}
// A timer yields to message tasks; a resolved Promise would only yield to microtasks.
export const yieldToMessages = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
export class WorkerRuntime {
  private queue: Entry[] = [];
  private active?: Entry;
  private history: string[] = [];
  private bytes = 0;
  private closed = false;
  private unlisten: () => void;
  private watermark = 0;
  private port: Transport;
  private factory: TaskFactory;
  private now: () => number;
  private yieldLoop: () => Promise<void>;
  constructor(
    port: Transport,
    factory: TaskFactory,
    now: () => number = () => performance.now(),
    yieldLoop: () => Promise<void> = yieldToMessages,
  ) {
    this.port = port;
    this.factory = factory;
    this.now = now;
    this.yieldLoop = yieldLoop;
    this.unlisten = port.listen(
      (value) => this.receive(value),
      () => this.dispose(),
    );
  }
  get usage(): Readonly<{ jobs: number; bytes: number; history: number }> {
    return Object.freeze({
      jobs: this.queue.length + (this.active ? 1 : 0),
      bytes: this.bytes,
      history: this.history.length,
    });
  }
  dispose(): void {
    this.closed = true;
    this.unlisten();
    if (this.active) this.active.cancelled = true;
    for (const entry of this.queue) this.bytes -= entry.job.payloadBytes;
    this.queue = [];
  }
  private receive(value: unknown): void {
    if (this.closed) return;
    let job: Packet;
    try {
      job = parsePacket(value);
    } catch {
      return;
    }
    if (job.type === 'cancel') {
      const entry = [this.active, ...this.queue].find((e) => e && sameIdentity(e.job, job));
      if (entry) entry.cancelled = true;
      return;
    }
    if (
      job.type !== 'start' ||
      Number(job.jobId) <= this.watermark ||
      [this.active, ...this.queue].some((e) => e?.job.jobId === job.jobId)
    )
      return;
    this.watermark = Number(job.jobId);
    if (this.usage.jobs >= limits.jobs || this.bytes + job.payloadBytes > limits.bytes) {
      sendPacket(this.port, control(job, 'error', 1, 'Capacity exceeded'));
      return;
    }
    this.queue.push({ job, cancelled: false, sequence: 0, admitted: this.now() });
    this.bytes += job.payloadBytes;
    if (!this.active) void this.run();
  }
  private async run(): Promise<void> {
    while (!this.closed && this.queue.length) {
      const entry = this.queue.shift()!;
      this.active = entry;
      let task: ReturnType<TaskFactory> | undefined;
      let lastProgress = -Infinity;
      try {
        if (this.now() - entry.admitted >= limits.ageMs) entry.cancelled = true;
        if (!entry.cancelled) task = this.factory(entry.job);
        while (!entry.cancelled && !this.closed && task) {
          if (this.now() - entry.admitted >= limits.ageMs) {
            entry.cancelled = true;
            break;
          }
          const slice = task.step(this.now() + limits.sliceMs);
          if (slice.done) {
            if (!(slice.result instanceof ArrayBuffer)) throw new Error('Missing result');
            sendPacket(
              this.port,
              parsePacket({
                ...entry.job,
                type: 'result',
                sequence: ++entry.sequence,
                buffer: slice.result,
                payloadBytes: slice.result.byteLength,
              }),
            );
            break;
          }
          if (this.now() - lastProgress >= limits.progressMs) {
            sendPacket(this.port, control(entry.job, 'progress', ++entry.sequence, slice.progress));
            lastProgress = this.now();
          }
          await this.yieldLoop();
        }
        if (entry.cancelled && !this.closed)
          sendPacket(this.port, control(entry.job, 'cancelled', ++entry.sequence));
      } catch (error) {
        if (!this.closed) {
          try {
            sendPacket(
              this.port,
              control(
                entry.job,
                'error',
                ++entry.sequence,
                (error instanceof Error ? error.message : 'Task failed').slice(0, 256) ||
                  'Task failed',
              ),
            );
          } catch {
            this.dispose();
          }
        }
      } finally {
        try {
          task?.dispose();
        } catch {
          // Cleanup failure is isolated; accounting and the next job still proceed.
        } finally {
          this.bytes -= entry.job.payloadBytes;
          this.history.push(entry.job.jobId);
          if (this.history.length > limits.history) this.history.shift();
          this.active = undefined;
        }
      }
    }
  }
}
