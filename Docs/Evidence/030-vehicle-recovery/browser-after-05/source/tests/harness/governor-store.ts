import type { Packet, ProtectedJobStore, RetainedJob, WorkerOperation } from '../../src/workers';

/** Bounded deterministic persistence double, deliberately not browser durable storage. */
export class GovernorMemoryStore implements ProtectedJobStore {
  private records = new Map<string, { job: Packet; operation: WorkerOperation; result?: Packet }>();
  private maxRecords: number;
  private maxBytes: number;
  constructor(maxRecords = 8, maxBytes = 16 * 1024 * 1024) {
    this.maxRecords = maxRecords;
    this.maxBytes = maxBytes;
  }
  get usage() {
    return {
      records: this.records.size,
      bytes: [...this.records.values()].reduce(
        (n, r) => n + r.job.payloadBytes + (r.result?.payloadBytes ?? 0),
        0,
      ),
    };
  }
  async retain({
    key,
    job,
    operation,
  }: RetainedJob): Promise<'PENDING' | 'COMPLETED' | 'CAPACITY_INSUFFICIENT' | 'CONFLICT'> {
    const existing = this.records.get(key);
    if (existing) {
      const before = new Uint8Array(existing.job.buffer);
      const after = new Uint8Array(job.buffer);
      if (before.length !== after.length || before.some((byte, index) => byte !== after[index]))
        return 'CONFLICT';
      return existing.result ? 'COMPLETED' : 'PENDING';
    }
    if (this.records.size >= this.maxRecords || this.usage.bytes + job.payloadBytes > this.maxBytes)
      return 'CAPACITY_INSUFFICIENT';
    this.records.set(key, { job: structuredClone(job), operation });
    return 'PENDING';
  }
  async list(limit: number): Promise<readonly RetainedJob[]> {
    return [...this.records.entries()]
      .filter(([, r]) => !r.result)
      .slice(0, limit)
      .map(([key, record]) => ({
        key,
        operation: record.operation,
        job: structuredClone(record.job),
      }));
  }
  async complete(key: string, result: Packet): Promise<void> {
    const record = this.records.get(key);
    if (!record) throw new Error('Evidence missing');
    if (record.result) return;
    if (this.usage.bytes + result.payloadBytes > this.maxBytes)
      throw new Error('Result capacity insufficient');
    record.result = structuredClone(result);
  }
  async completed(limit: number): Promise<readonly { key: string; result: Packet }[]> {
    return [...this.records.entries()]
      .filter(([, r]) => r.result)
      .slice(0, limit)
      .map(([key, r]) => ({ key, result: structuredClone(r.result!) }));
  }
  async invalidateResult(key: string): Promise<void> {
    const record = this.records.get(key);
    if (record) record.result = undefined;
  }
  async acknowledge(key: string): Promise<void> {
    this.records.delete(key);
  }
}
