import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createWorldStore } from './world-store.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), '068-short-store-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function begin(store) {
  await store.begin({
    captureId: 'capture',
    sequence: 0,
    createdAt: new Date().toISOString(),
    metadata: { classId: 'sedan', kind: 'PROTOCOL', observer: false },
  });
}
async function payload(store, disposition, value) {
  const bytes = Buffer.from(JSON.stringify({ disposition, ...value }));
  await store.start({
    captureId: 'capture',
    sequence: 0,
    parts: 1,
    worldBytes: bytes.length,
    worldSha256: sha(bytes),
  });
  await store.part({
    captureId: 'capture',
    sequence: 0,
    part: 0,
    bytes: bytes.length,
    sha256: sha(bytes),
    base64: bytes.toString('base64'),
  });
  await store.terminal({ captureId: 'capture', sequence: 0, disposition, worldSha256: sha(bytes) });
  return bytes;
}
test('each world has once-only pre-world marker, durable exact bytes and terminal; duplicate rejected', () =>
  fixture(async (root) => {
    const store = createWorldStore(root, 'capture', { worlds: 1 });
    await begin(store);
    await assert.rejects(begin(store), /begin/);
    const bytes = await payload(store, 'PASS', {
      result: { rawTimings: { frameMs: [1.5, 2] }, checkpoints: [{ tick: 60 }] },
    });
    store.requireComplete();
    assert.deepEqual(await readFile(join(root, 'capture/world-0-part-0.bin')), bytes);
    assert.deepEqual((await readdir(join(root, 'capture'))).sort(), [
      'world-0-begin.json',
      'world-0-part-0.bin',
      'world-0-started.json',
      'world-0-terminal.json',
    ]);
  }));
test('failed partial prefixes survive terminal but cannot be accepted or retried', () =>
  fixture(async (root) => {
    const store = createWorldStore(root, 'capture', { worlds: 1 });
    await begin(store);
    const bytes = await payload(store, 'FAILED', {
      partial: {
        attemptedTick: 61,
        acceptedTick: 60,
        rawTimings: { frameMs: [3, 4] },
        checkpoints: [{ tick: 60 }],
      },
      causes: ['original', 'cleanup'],
    });
    assert.deepEqual(await readFile(join(root, 'capture/world-0-part-0.bin')), bytes);
    assert.throws(() => store.requireComplete(), /failed/);
    await assert.rejects(begin(store), /begin/);
    assert.equal(store.stats().failed, true);
  }));
test('corrupt part and incomplete world fail closed without forged successful terminal', () =>
  fixture(async (root) => {
    const store = createWorldStore(root, 'capture', { worlds: 1 });
    await begin(store);
    const bytes = Buffer.from('{"disposition":"PASS"}');
    await store.start({
      captureId: 'capture',
      sequence: 0,
      parts: 1,
      worldBytes: bytes.length,
      worldSha256: sha(bytes),
    });
    await assert.rejects(
      store.part({
        captureId: 'capture',
        sequence: 0,
        part: 0,
        bytes: bytes.length,
        sha256: '0'.repeat(64),
        base64: bytes.toString('base64'),
      }),
      /SHA/,
    );
    await assert.rejects(
      store.terminal({
        captureId: 'capture',
        sequence: 0,
        disposition: 'PASS',
        worldSha256: sha(bytes),
      }),
      /completeness/,
    );
    assert.throws(() => store.requireComplete(), /incomplete/);
    assert.equal(
      (await readdir(join(root, 'capture'))).some((name) => name.includes('terminal')),
      false,
    );
  }));
