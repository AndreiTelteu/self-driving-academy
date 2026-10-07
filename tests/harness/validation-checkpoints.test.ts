import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPairCheckpoints, savePairCheckpoint } from '../../scripts/validation-checkpoints.ts';

test('checkpoints preserve complete pairs, reject changed context and refuse overwrite/gaps', async () => {
  const root = await mkdtemp(join(tmpdir(), 'validation-checkpoints-'));
  const record = {
    sessionId: '12345678-1234-1234-1234-123456789abc',
    identity: { sourceHash: 'original', backend: 'WEBGPU' },
    pair: 1,
    payload: { off: 1, on: 2 },
  };
  try {
    assert.deepEqual(await readPairCheckpoints(root, record.sessionId), []);
    await assert.rejects(savePairCheckpoint(root, { ...record, pair: 2 }), /order/);
    await savePairCheckpoint(root, record);
    await savePairCheckpoint(root, record); // network retry preserves the same file
    await assert.rejects(savePairCheckpoint(root, { ...record, payload: { off: 99 } }), /content/);
    await assert.rejects(
      savePairCheckpoint(root, { ...record, pair: 2, identity: { sourceHash: 'changed' } }),
      /identity/,
    );
    await savePairCheckpoint(root, { ...record, pair: 2 });
    assert.equal((await readPairCheckpoints(root, record.sessionId)).length, 2);
    await assert.rejects(readPairCheckpoints(root, '../escape'), /session/);
    const path = join(root, record.sessionId, '1.json');
    const original = await readFile(path, 'utf8');
    await rm(path);
    await assert.rejects(readPairCheckpoints(root, record.sessionId), /gap/);
    await writeFile(path, original);
    const data = JSON.parse(original);
    data.record.payload.on = 100;
    await writeFile(path, JSON.stringify(data));
    await assert.rejects(readPairCheckpoints(root, record.sessionId), /content changed/);
  } finally {
    await rm(root, { recursive: true });
  }
});
