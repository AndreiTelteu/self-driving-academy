import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import {
  WorkerClient,
  WorkerResourceGovernor,
  governorLimits,
  protectedJobKey,
} from '../../src/workers';
import type { Packet, Transport } from '../../src/workers';
import { GovernorMemoryStore } from '../harness/governor-store';

const identity = {
  baseVersionId: 'v1',
  profileId: 'p1',
  learningEpoch: 1,
  sessionId: 's1',
  worldEpoch: 1,
};
function packet(
  segmentId: string,
  priority: Packet['priority'] = 'interactive',
  slices = 1,
  bytes = 4,
): Packet {
  const buffer = new ArrayBuffer(bytes);
  new Uint32Array(buffer)[0] = slices;
  return {
    ...identity,
    jobId: '1',
    segmentId,
    priority,
    type: 'start',
    sequence: 0,
    buffer,
    payloadBytes: bytes,
    ownership: 'transfer',
  };
}
function fixture(store = new GovernorMemoryStore(), clock?: () => number) {
  let receive!: (value: unknown) => void;
  const starts: Packet[] = [];
  const cancels: Packet[] = [];
  const port: Transport = {
    send: (p) => {
      if (p.type === 'start') starts.push(p);
      else cancels.push(p);
    },
    listen: (callback) => {
      receive = callback;
      return () => {};
    },
  };
  const client = new WorkerClient(port, () => identity, clock);
  const governor = new WorkerResourceGovernor(client, store, clock);
  const reply = (job: Packet, type: Packet['type'] = 'result') =>
    receive({
      ...job,
      ownership: 'copy',
      type,
      sequence: 1,
      buffer: new ArrayBuffer(0),
      payloadBytes: 0,
    });
  return { governor, store, starts, cancels, reply };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test('global serial priority, cancel acknowledgement and restart publish once', async () => {
  const f = fixture();
  const optional = await f.governor.submit(packet('comparison', 'optional'));
  const learning = await f.governor.submit(packet('learning'));
  assert.equal(f.starts.length, 1);
  assert.equal(f.cancels.length, 1);
  f.reply(f.starts[0], 'cancelled');
  await settle();
  assert.equal(f.starts[1].segmentId, 'learning');
  f.reply(f.starts[0]); // stale duplicate from interrupted attempt
  f.reply(f.starts[1]);
  assert.equal((await learning.ticket!.outcome).status, 'result');
  await settle();
  assert.equal(f.starts[2].segmentId, 'comparison');
  assert.equal(f.starts[2].jobId, '3');
  f.reply(f.starts[2]);
  assert.equal((await optional.ticket!.outcome).status, 'result');
  assert.equal(f.governor.usage.bytes, 0);
  assert.equal(f.governor.usage.jobs, 0);
  assert.equal(f.governor.measurements[0].preempted, true);
  assert.equal((await f.governor.completed()).length, 1);
  await f.governor.acknowledge(learning.ticket!.key);
  assert.equal(f.store.usage.records, 0);
  f.governor.dispose();
});

test('queue/bytes caps reject optional while protected capacity suspends without detachment', async () => {
  const f = fixture();
  const source = packet('max0', 'optional', 1, 8 * 1024 * 1024);
  await f.governor.submit(source);
  await f.governor.submit(packet('max1', 'optional', 1, 8 * 1024 * 1024));
  assert.equal(
    (await f.governor.submit(packet('overflow', 'optional'))).status,
    'CAPACITY_INSUFFICIENT',
  );
  const learning = await f.governor.submit(packet('protected'));
  assert.equal(learning.status, 'PENDING');
  assert.equal(learning.ticket, undefined);
  assert.equal(f.store.usage.records, 1);
  assert.equal(source.buffer.byteLength, source.payloadBytes);
  assert.equal(f.governor.usage.bytes, governorLimits.payloadBytes);
  f.governor.dispose();
  const resumed = fixture(f.store);
  await resumed.governor.resume();
  assert.equal(resumed.starts[0].segmentId, 'protected');
  resumed.governor.dispose();
  const full = fixture(new GovernorMemoryStore(0));
  const xp = packet('xp-credit');
  assert.equal((await full.governor.submit(xp)).status, 'SESSION_SUSPENDED');
  assert.equal(xp.buffer.byteLength, 4);
  assert.equal(full.starts.length, 0);
  full.governor.dispose();
});

test('pressure pending, idle resume, cancellation preserves exact protected evidence', async () => {
  const f = fixture();
  f.governor.setPressure(true);
  const optional = await f.governor.submit(packet('optional', 'optional'));
  assert.equal(optional.ticket!.state, 'PENDING');
  assert.equal(f.starts.length, 0);
  const source = packet('learning-evidence');
  const protectedAdmission = await f.governor.submit(source);
  const duplicate = await f.governor.submit(source);
  assert.equal(duplicate.ticket, protectedAdmission.ticket);
  f.governor.cancel(protectedAdmission.ticket!.key);
  f.reply(f.starts[0], 'cancelled');
  assert.equal((await protectedAdmission.ticket!.outcome).status, 'cancelled');
  assert.deepEqual(
    new Uint32Array((await f.store.list(8))[0].job.buffer),
    new Uint32Array(source.buffer),
  );
  f.governor.setPressure(true, 'idle');
  assert.equal(f.starts[1].segmentId, 'optional');
  f.reply(f.starts[1]);
  await optional.ticket!.outcome;
  f.governor.dispose();
});

test('optional lease bounded history, errors and disposal release ownership', async () => {
  let now = 0;
  const f = fixture(undefined, () => now);
  f.governor.setPressure(true);
  const old = await f.governor.submit(packet('old', 'optional'));
  now = 30_001;
  f.governor.setPressure(false);
  assert.equal((await old.ticket!.outcome).status, 'stale');
  for (let i = 0; i < 70; i++) {
    const a = await f.governor.submit(packet(`serial${i}`, 'optional'));
    f.reply(f.starts.at(-1)!);
    await a.ticket!.outcome;
  }
  assert.equal(f.governor.measurements.length, 64);
  const a = await f.governor.submit(packet('unfinished'));
  f.governor.dispose();
  assert.equal((await a.ticket!.outcome).status, 'error');
  assert.equal(f.governor.usage.bytes, 0);
  assert.equal(f.store.usage.records, 1);
  assert.equal((await f.governor.submit(packet('closed'))).status, 'CAPACITY_INSUFFICIENT');
});

test('deferred persistence ingress is separately bounded at a full execution queue', async () => {
  let release!: () => void;
  const retained = new Promise<void>((resolve) => {
    release = resolve;
  });
  class DeferredStore extends GovernorMemoryStore {
    override async retain(record: Parameters<GovernorMemoryStore['retain']>[0]) {
      await retained;
      return super.retain(record);
    }
  }
  const f = fixture(new DeferredStore());
  f.governor.setPressure(true);
  for (let i = 0; i < 8; i++) await f.governor.submit(packet(`optional${i}`, 'optional'));
  const source = packet('ingress0');
  const pending = [f.governor.submit(source)];
  for (let i = 1; i < 8; i++) pending.push(f.governor.submit(packet(`ingress${i}`)));
  assert.equal(f.governor.usage.jobs, 8);
  assert.equal(f.governor.usage.persistenceIngressJobs, 8);
  assert.equal((await f.governor.submit(packet('ingress9'))).status, 'SESSION_SUSPENDED');
  new Uint32Array(source.buffer)[0] = 99;
  release();
  assert.ok((await Promise.all(pending)).every((a) => a.status === 'PENDING' && !a.ticket));
  assert.equal(new Uint32Array((await f.store.list(8))[0].job.buffer)[0], 1);
  assert.equal(f.governor.usage.persistenceIngressBytes, 0);
  f.governor.dispose();
});

test('operation identity distinct, completed durable proposals do not execute twice', async () => {
  const f = fixture();
  const source = packet('same-segment');
  const encode = await f.governor.submit(source, 'encode');
  const learning = await f.governor.submit(source, 'learning');
  assert.notEqual(encode.ticket!.key, learning.ticket!.key);
  assert.equal(f.cancels.length, 1);
  f.reply(f.starts[0], 'cancelled');
  await settle();
  f.reply(f.starts[1]);
  await learning.ticket!.outcome;
  await settle();
  f.reply(f.starts[2]);
  await encode.ticket!.outcome;
  const count = f.starts.length;
  assert.equal((await f.governor.submit(source, 'encode')).ticket, undefined);
  assert.equal(f.starts.length, count);
  assert.equal((await f.governor.completed()).length, 2);
  f.governor.dispose();
  const next = fixture(f.store);
  await next.governor.resume();
  assert.equal(next.starts.length, 0);
  assert.equal((await next.governor.completed()).length, 2);
  next.governor.dispose();
});

test('dispose during deferred retention preserves evidence and releases ingress reservations', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  class DeferredStore extends GovernorMemoryStore {
    override async retain(record: Parameters<GovernorMemoryStore['retain']>[0]) {
      await wait;
      return super.retain(record);
    }
  }
  const f = fixture(new DeferredStore());
  const source = packet('dispose-ingress', 'interactive', 1, 8 * 1024 * 1024);
  const pending = f.governor.submit(source);
  const second = f.governor.submit(packet('ingress-second', 'interactive', 1, 8 * 1024 * 1024));
  assert.equal(f.governor.usage.persistenceIngressBytes, governorLimits.persistenceIngressBytes);
  assert.equal(
    (await f.governor.submit(packet('ingress-byte-overflow'))).status,
    'SESSION_SUSPENDED',
  );
  f.governor.dispose();
  new Uint32Array(source.buffer)[0] = 99;
  release();
  assert.equal((await pending).ticket, undefined);
  assert.equal((await second).ticket, undefined);
  assert.equal(f.governor.usage.persistenceIngressJobs, 0);
  assert.equal(f.governor.usage.persistenceIngressBytes, 0);
  assert.equal(f.governor.usage.jobs, 0);
  assert.equal(f.starts.length, 0);
  assert.equal(new Uint32Array((await f.store.list(8))[0].job.buffer)[0], 1);
});

test('cancel during async protected completion retains evidence without recoverable result', async () => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  class DelayedCompletion extends GovernorMemoryStore {
    override async complete(key: string, result: Packet) {
      await delayed;
      await super.complete(key, result);
    }
  }
  const f = fixture(new DelayedCompletion());
  const source = packet('async-completion');
  const admitted = await f.governor.submit(source);
  f.reply(f.starts[0]);
  await settle();
  f.governor.cancel(admitted.ticket!.key);
  release();
  assert.equal((await admitted.ticket!.outcome).status, 'cancelled');
  assert.equal((await f.governor.completed()).length, 0);
  assert.equal((await f.store.list(8)).length, 1);
  new Uint32Array(source.buffer)[0] = 55;
  assert.equal((await f.governor.submit(source)).status, 'SESSION_SUSPENDED');
  assert.equal(new Uint32Array((await f.store.list(8))[0].job.buffer)[0], 1);
  f.governor.dispose();
});

test('persistence failure never publishes, observer exceptions do not leak ownership', async () => {
  class FailingCompletion extends GovernorMemoryStore {
    override async complete(): Promise<void> {
      throw new Error('Disk full');
    }
  }
  const f = fixture(new FailingCompletion());
  const admitted = await f.governor.submit(packet('disk-full'));
  f.reply(f.starts[0]);
  assert.equal((await admitted.ticket!.outcome).status, 'error');
  assert.equal(f.governor.usage.bytes, 0);
  assert.equal((await f.store.list(8)).length, 1);
  assert.ok(f.governor.usage.suspendedReason);
  f.governor.dispose();
});

test('dispose during async completion withdraws proposal while retaining evidence', async () => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  class DelayedCompletion extends GovernorMemoryStore {
    override async complete(key: string, result: Packet) {
      await delayed;
      await super.complete(key, result);
    }
  }
  const f = fixture(new DelayedCompletion());
  const admitted = await f.governor.submit(packet('dispose-completion'));
  f.reply(f.starts[0]);
  await settle();
  f.governor.dispose();
  assert.equal((await admitted.ticket!.outcome).status, 'error');
  release();
  await settle();
  assert.equal((await f.governor.completed()).length, 0);
  assert.equal((await f.store.list(8)).length, 1);
  assert.equal(f.governor.usage.jobs, 0);
  assert.equal(f.governor.usage.bytes, 0);
});

test('real worker transfer leaves live buffers attached and preempts between slices', async () => {
  const worker = new Worker(new URL('./governor-thread.mjs', import.meta.url), {
    execArgv: ['--import', new URL('../../scripts/register-typescript.mjs', import.meta.url).href],
  });
  let progress!: () => void;
  const began = new Promise<void>((resolve) => {
    progress = resolve;
  });
  let transferred = 0;
  const port: Transport = {
    send: (p, transfers) => {
      worker.postMessage(p, [...transfers]);
      if (transfers.length) {
        assert.equal(p.buffer.byteLength, 0);
        transferred++;
      }
    },
    listen: (message, error) => {
      worker.on('message', message);
      worker.on('error', error);
      return () => {
        worker.off('message', message);
        worker.off('error', error);
      };
    },
  };
  const client = new WorkerClient(
    port,
    () => identity,
    undefined,
    () => progress(),
  );
  const governor = new WorkerResourceGovernor(client, new GovernorMemoryStore());
  try {
    const source = packet('long-comparison', 'optional', 12);
    const long = await governor.submit(source);
    await began;
    const interactive = await governor.submit(packet('learning'));
    assert.equal((await interactive.ticket!.outcome).status, 'result');
    assert.equal((await long.ticket!.outcome).status, 'result');
    assert.equal(source.buffer.byteLength, 4);
    assert.equal(transferred, 3);
    assert.equal(governor.measurements.filter((m) => m.preempted).length, 1);
    assert.equal(governor.usage.bytes, 0);
    assert.equal(protectedJobKey(source, 'comparison'), long.ticket!.key);
  } finally {
    governor.dispose();
    await worker.terminate();
  }
});
