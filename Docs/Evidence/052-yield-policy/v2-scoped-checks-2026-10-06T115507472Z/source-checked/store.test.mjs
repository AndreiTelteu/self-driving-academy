import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { yieldBrowserStore } from './store.mjs';
import { readEvidenceJson } from './transport.mjs';

test('052 immutable parts and failed terminal cannot later become accepted; isolated unit destination only', async () => {
  const root = await mkdtemp(join(tmpdir(), '052-unit-store-'));
  try {
    const store = yieldBrowserStore(
      root,
      { sourceHash: 'UNIT_ONLY_NOT_HARDWARE', artifactHash: 'UNIT_ARTIFACT' },
      async () => {},
    );
    const start = {
      fixtureVersion: '052-yield-browser-v2',
      sourceHash: 'UNIT_ONLY_NOT_HARDWARE',
      backend: 'WEBGPU',
      full: true,
    };
    const { captureId } = await store.start(start);
    await assert.rejects(store.start(start), /one attempt/);
    const part = { captureId, ordinal: 0, channel: 'frame', part: 0, numbers: [1, 2, 3] };
    await store.part(part);
    await assert.rejects(store.part(part), /ordered immutable/);
    assert.deepEqual(
      JSON.parse(await readFile(join(root, 'WEBGPU-full/arm-0-frame-0.json'), 'utf8')),
      part,
    );
    await store.failure({ captureId, failure: 'UNIT injected original physics failure' });
    await assert.rejects(store.finish({ captureId }), /failed\/rejected/);
    assert.deepEqual((await readdir(join(root, 'WEBGPU-full'))).sort(), [
      'arm-0-frame-0.json',
      'failure.json',
      'rejected.json',
      'started.json',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('052 actual loopback accepts worst finite raw part and bounds request body without killing subsequent connection', async () => {
  const root = await mkdtemp(join(tmpdir(), '052-unit-http-'));
  const store = yieldBrowserStore(
    root,
    { sourceHash: 'UNIT_ONLY_NOT_HARDWARE', artifactHash: 'UNIT_ARTIFACT' },
    async () => {},
  );
  const server = createServer(async (request, response) => {
    try {
      const body = await readEvidenceJson(request);
      const result =
        request.url === '/start'
          ? await store.start(body)
          : request.url === '/part'
            ? await store.part(body)
            : { echo: true };
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(error.status ?? 400).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, value) =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  try {
    const started = await post('/start', {
      fixtureVersion: '052-yield-browser-v2',
      sourceHash: 'UNIT_ONLY_NOT_HARDWARE',
      backend: 'WEBGPU',
      full: true,
    });
    const { captureId } = await started.json();
    const body = {
      captureId,
      ordinal: 0,
      channel: 'frame',
      part: 0,
      numbers: Array(3000).fill(Number.MAX_VALUE),
    };
    assert.ok(
      Buffer.byteLength(JSON.stringify(body)) < 128 * 1024,
      'Worst finite encoded part proven bounded',
    );
    assert.equal((await post('/part', body)).status, 200);
    assert.equal((await post('/echo', { value: 'x'.repeat(4 * 1024 * 1024) })).status, 413);
    assert.equal((await post('/echo', { value: 1 })).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
