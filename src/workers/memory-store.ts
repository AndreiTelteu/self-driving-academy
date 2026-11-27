import type { Packet } from './protocol';
import type { ProtectedJobStore, RetainedJob, WorkerOperation } from './governor';

/**
 * Bounded in-memory persistence for the shared 221 governor.
 *
 * It is the production shape for the live session: exact bytes are retained until an
 * idempotent publication acknowledges the key, completed results survive a worker replacement
 * and a duplicate key is never overwritten. It is deliberately not a disk/IndexedDB store;
 * durable savefile persistence remains the owner of the session checkpoint.
 */
export const GOVERNOR_MEMORY_STORE_VERSION = '221-memory-store-v1' as const;

export interface GovernorMemoryStoreOptions {
  readonly maxRecords?: number;
  readonly maxBytes?: number;
}

interface Record {
  readonly job: Packet;
  readonly operation: WorkerOperation;
  result?: Packet;
}

function copyPacket(packet: Packet): Packet {
  return Object.freeze({
    ...packet,
    buffer: packet.buffer.slice(0),
  });
}

export interface GovernorMemoryStore extends ProtectedJobStore {
  readonly version: typeof GOVERNOR_MEMORY_STORE_VERSION;
  readonly usage: Readonly<{ records: number; bytes: number }>;
}

export function createMemoryProtectedJobStore(
  options: GovernorMemoryStoreOptions = {},
): GovernorMemoryStore {
  const maxRecords = Math.max(1, options.maxRecords ?? 8);
  const maxBytes = Math.max(1, options.maxBytes ?? 16 * 1024 * 1024);
  const records = new Map<string, Record>();

  const bytes = (): number =>
    [...records.values()].reduce(
      (total, record) => total + record.job.payloadBytes + (record.result?.payloadBytes ?? 0),
      0,
    );

  const api: GovernorMemoryStore = {
    version: GOVERNOR_MEMORY_STORE_VERSION,
    get usage() {
      return Object.freeze({ records: records.size, bytes: bytes() });
    },
    async retain(input: RetainedJob) {
      const existing = records.get(input.key);
      if (existing) {
        const before = new Uint8Array(existing.job.buffer);
        const after = new Uint8Array(input.job.buffer);
        if (before.length !== after.length || before.some((byte, index) => byte !== after[index]))
          return 'CONFLICT';
        return existing.result ? 'COMPLETED' : 'PENDING';
      }
      if (records.size >= maxRecords || bytes() + input.job.payloadBytes > maxBytes)
        return 'CAPACITY_INSUFFICIENT';
      records.set(input.key, { job: copyPacket(input.job), operation: input.operation });
      return 'PENDING';
    },
    async list(limit: number) {
      return [...records.entries()]
        .filter(([, record]) => record.result === undefined)
        .slice(0, Math.max(0, Math.floor(limit)))
        .map(([key, record]) =>
          Object.freeze({ key, operation: record.operation, job: copyPacket(record.job) }),
        );
    },
    async complete(key: string, result: Packet) {
      const record = records.get(key);
      if (record === undefined) throw new Error('Governor evidence is missing');
      if (record.result !== undefined) return;
      if (bytes() + result.payloadBytes > maxBytes)
        throw new Error('Governor result capacity is insufficient');
      record.result = copyPacket(result);
    },
    async invalidateResult(key: string) {
      const record = records.get(key);
      if (record !== undefined) record.result = undefined;
    },
    async completed(limit: number) {
      return [...records.entries()]
        .filter(([, record]) => record.result !== undefined)
        .slice(0, Math.max(0, Math.floor(limit)))
        .map(([key, record]) =>
          Object.freeze({ key, result: copyPacket(record.result as Packet) }),
        );
    },
    async acknowledge(key: string) {
      records.delete(key);
    },
  };
  return Object.freeze(api);
}
