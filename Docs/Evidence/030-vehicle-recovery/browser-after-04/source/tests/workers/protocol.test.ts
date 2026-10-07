import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { WorkerClient, WorkerRuntime, limits, parsePacket } from '../../src/workers/index';
import type { Packet, Transport } from '../../src/workers/index';
let counter = 0;
const ids = new Map<string, string>();
function id(key: string): string {
  if (!ids.has(key)) ids.set(key, String(++counter));
  return ids.get(key)!;
}
export const job = (
  id = 'job',
  segmentId = 'short',
  ownership: 'copy' | 'transfer' = 'copy',
): Packet => ({
  type: 'start',
  jobId: String(ids.get(id) ?? (ids.set(id, String(++counter)), counter)),
  segmentId,
  baseVersionId: 'v1',
  profileId: 'p1',
  learningEpoch: 1,
  sessionId: 's1',
  worldEpoch: 1,
  sequence: 0,
  payloadBytes: 16,
  ownership,
  priority: 'interactive',
  buffer: new ArrayBuffer(16),
});
const target = () => ({
  baseVersionId: 'v1',
  profileId: 'p1',
  learningEpoch: 1,
  sessionId: 's1',
  worldEpoch: 1,
});
function fake() {
  let receive: (value: unknown) => void = () => {};
  let fail: (reason: string) => void = () => {};
  const sent: Packet[] = [];
  const transport: Transport = {
    send: (p) => {
      sent.push(p);
    },
    listen: (message, error) => {
      receive = message;
      fail = error;
      return () => {};
    },
  };
  return {
    transport,
    sent,
    receive: (p: unknown) => receive(p),
    fail: (reason: string) => fail(reason),
  };
}
test('strict envelope validates identities, discriminants, bytes and controls', () => {
  for (const value of [
    null,
    { ...job(), worldEpoch: -1 },
    { ...job(), learningEpoch: NaN },
    { ...job(), jobId: '' },
    { ...job(), payloadBytes: 15 },
    { ...job(), ownership: 'world' },
    { ...job(), priority: 'os-high' },
    { ...job(), type: 'progress', progress: 2 },
    { ...job(), extra: true },
    { ...job(), sequence: 1 },
  ])
    assert.throws(() => parsePacket(value));
});
test('late, duplicate, out-of-order and mismatched packets cannot publish', async () => {
  const f = fake();
  let epoch = 1;
  let progress = 0;
  const client = new WorkerClient(
    f.transport,
    () => ({ ...target(), learningEpoch: epoch }),
    () => 0,
    () => progress++,
  );
  const result = client.submit(job());
  f.receive({ ...job(), type: 'result', sequence: 1, worldEpoch: 2 });
  f.receive({
    ...job(),
    type: 'progress',
    sequence: 2,
    payloadBytes: 0,
    buffer: new ArrayBuffer(0),
    progress: 0.5,
  });
  f.receive({ ...job(), type: 'result', sequence: 1 });
  assert.equal(client.usage.jobs, 1);
  assert.equal(progress, 1);
  epoch = 2;
  f.receive({ ...job(), type: 'result', sequence: 3 });
  assert.equal((await result).status, 'stale');
  f.receive({ ...job(), type: 'result', sequence: 4 });
  assert.equal(client.usage.jobs, 0);
  assert.throws(() => client.submit(job()));
  client.dispose();
});
test('cancel sends one control, late result remains cancelled; worker errors release capacity', async () => {
  const f = fake();
  const client = new WorkerClient(f.transport, target);
  const p = client.submit(job());
  client.cancel(id('job'));
  client.cancel(id('job'));
  assert.equal(f.sent.length, 2);
  f.receive({ ...job(), type: 'result', sequence: 1 });
  assert.equal((await p).status, 'cancelled');
  const next = client.submit(job('next'));
  f.fail('crash');
  assert.equal((await next).status, 'error');
  assert.equal(client.usage.bytes, 0);
  client.dispose();
});
test('queue/history/bytes/age stay bounded and do not silently admit protected work', async () => {
  const f = fake();
  let now = 0;
  const client = new WorkerClient(f.transport, target, () => now);
  const promises = [];
  for (let i = 0; i < limits.jobs; i++) promises.push(client.submit(job(String(i))));
  assert.throws(() => client.submit(job('overflow')));
  now = limits.ageMs;
  client.expire();
  await Promise.all(promises);
  assert.equal(client.usage.bytes, 0);
  for (let i = 0; i < 100; i++) {
    const j = job(`history${i}`);
    const p = client.submit(j);
    f.receive({ ...j, type: 'result', sequence: 1 });
    await p;
  }
  assert.equal(client.usage.history, 64);
  assert.throws(() => client.submit(job('0')));
  client.dispose();
});
test('runtime throttles progress at 5Hz and disposes task resources', async () => {
  const f = fake();
  let now = 0;
  let steps = 0;
  let disposed = 0;
  const runtime = new WorkerRuntime(
    f.transport,
    () => ({
      step: () => ({ done: ++steps === 1001, progress: 0.5, result: new ArrayBuffer(0) }),
      dispose: () => {
        disposed++;
      },
    }),
    () => now,
    async () => {
      now++;
    },
  );
  f.receive(job());
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  assert.equal(f.sent.filter((p) => p.type === 'progress').length, 5);
  assert.equal(disposed, 1);
  assert.equal(runtime.usage.bytes, 0);
  runtime.dispose();
});
test('real worker yields to cancellation, runs next job, transfers buffers and handles task failure', async (t) => {
  const worker = new Worker(new URL('./thread-fixture.mjs', import.meta.url), {
    execArgv: ['--import', new URL('../../scripts/register-typescript.mjs', import.meta.url).href],
  });
  t.after(async () => {
    await worker.terminate();
  });
  const transport: Transport = {
    send: (p, transfers) => worker.postMessage(p, [...transfers]),
    listen: (message, error) => {
      worker.on('message', message);
      const onError = (e: Error) => error(e.message);
      worker.on('error', onError);
      return () => {
        worker.off('message', message);
        worker.off('error', onError);
      };
    },
  };
  let mark = 0;
  let started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const client = new WorkerClient(
    transport,
    target,
    () => performance.now(),
    () => started(),
  );
  t.after(() => client.dispose());
  const long = client.submit(job('long', 'long'));
  await ready;
  mark = performance.now();
  client.cancel(id('long'));
  assert.equal((await long).status, 'cancelled');
  const cancelMs = performance.now() - mark;
  assert.ok(cancelMs <= 100, `cancel ${cancelMs}ms`);
  const transfer = job('real-next', 'short', 'transfer');
  const next = client.submit(transfer);
  assert.equal(transfer.buffer.byteLength, 0);
  const result = await next;
  assert.equal(result.status, 'result');
  assert.equal(result.packet?.payloadBytes, 32);
  assert.equal((await client.submit(job('bad', 'throw'))).status, 'error');
  assert.equal((await client.submit(job('after-error'))).status, 'result');
  t.diagnostic(
    JSON.stringify({ cancelMs, trackedJobs: client.usage.jobs, trackedBytes: client.usage.bytes }),
  );
});

test('cleanup and progress observer exceptions cannot block later jobs', async () => {
  const f = fake();
  let calls = 0;
  const runtime = new WorkerRuntime(f.transport, () => ({
    step: () => ({ done: true, progress: 1, result: new ArrayBuffer(0) }),
    dispose: () => {
      calls++;
      throw new Error('cleanup');
    },
  }));
  f.receive(job('cleanup1'));
  f.receive(job('cleanup2'));
  await new Promise<void>((r) => setTimeout(r, 5));
  assert.equal(calls, 2);
  assert.equal(runtime.usage.jobs, 0);
  runtime.dispose();
  const g = fake();
  const client = new WorkerClient(
    g.transport,
    target,
    () => 0,
    () => {
      throw new Error('observer');
    },
  );
  const j = job('observer');
  const p = client.submit(j);
  g.receive({
    ...j,
    type: 'progress',
    sequence: 1,
    payloadBytes: 0,
    buffer: new ArrayBuffer(0),
    progress: 0.1,
  });
  g.receive({ ...j, type: 'result', sequence: 2 });
  assert.equal((await p).status, 'result');
  client.dispose();
});
test('runtime watermark rejects old replay after history eviction; byte cap rejects excessive queue', async () => {
  const f = fake();
  let runs = 0;
  const runtime = new WorkerRuntime(f.transport, () => ({
    step: () => {
      runs++;
      return { done: true, progress: 1, result: new ArrayBuffer(0) };
    },
    dispose: () => {},
  }));
  const first = job('replay-first');
  f.receive(first);
  for (let i = 0; i < 100; i++) f.receive(job(`runtime-history${i}`));
  f.receive(first);
  assert.equal(runs, 101);
  assert.equal(runtime.usage.history, 64);
  runtime.dispose();
  const g = fake();
  const client = new WorkerClient(g.transport, target);
  const j = { ...job('big'), buffer: new ArrayBuffer(limits.bytes), payloadBytes: limits.bytes };
  const result = client.submit(j);
  assert.throws(() => client.submit(job('big-overflow')));
  client.dispose();
  await result;
  assert.throws(() => parsePacket({ ...job('bad-id'), jobId: '9007199254740992' }));
  assert.throws(
    () =>
      parsePacket(
        Object.defineProperty({ ...job('getter') }, 'segmentId', {
          get() {
            throw new Error('getter ran');
          },
        }),
      ),
    /Invalid data property/,
  );
  const buffer = new ArrayBuffer(16);
  structuredClone(buffer, { transfer: [buffer] });
  assert.throws(() => parsePacket({ ...job('detached'), buffer, payloadBytes: 0 }));
  assert.throws(() =>
    parsePacket({
      ...job('resizable'),
      buffer: Reflect.construct(ArrayBuffer, [16, { maxByteLength: 32 }]),
    }),
  );
});

test('parser rejects nonenumerable identities and fields without invoking getters', () => {
  assert.throws(
    () =>
      parsePacket(
        Object.defineProperty({ ...job('nonenum') }, 'jobId', {
          value: '99999',
          enumerable: false,
        }),
      ),
    /Invalid data property/,
  );
  assert.throws(
    () =>
      parsePacket(
        Object.defineProperty({ ...job('hidden') }, 'extra', { value: 1, enumerable: false }),
      ),
    /Invalid data property/,
  );
});
