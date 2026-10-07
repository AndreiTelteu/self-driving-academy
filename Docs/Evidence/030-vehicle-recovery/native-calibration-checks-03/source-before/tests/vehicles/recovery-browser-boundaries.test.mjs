// UNEXECUTED scoped pure HTTP/store tests; no native/Vite/browser or application server startup.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHandler } from '../browser/vehicle-recovery/browser-http.mjs';
import { createStore } from '../browser/vehicle-recovery/browser-store.mjs';
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), '030browser-test-'));
  try {
    await mkdir(join(root, 'captures'));
    await fn(root);
  } finally {
    assert(
      resolve(root).startsWith(resolve(tmpdir()) + '\\030browser-test-') ||
        resolve(root).startsWith(resolve(tmpdir()) + '/030browser-test-'),
    );
    await rm(root, { recursive: true });
  }
}
function response() {
  return {
    headersSent: false,
    status: null,
    body: null,
    writeHead(status) {
      assert(!this.headersSent);
      this.headersSent = true;
      this.status = status;
    },
    end(value) {
      this.body = value;
    },
  };
}
test('staticmissingfavicon returns404 then nextactualartifact200 without prematureheaders', async () =>
  fixture(async (root) => {
    await writeFile(join(root, 'browser.html'), 'realartifact');
    const handler = createHandler({ artifactRoot: root }, {});
    const first = response();
    await handler({ method: 'GET', url: '/favicon.ico', headers: {} }, first);
    assert.equal(first.status, 404);
    const second = response();
    await handler({ method: 'GET', url: '/', headers: {} }, second);
    assert.equal(second.status, 200);
    assert.equal(second.body.toString(), 'realartifact');
  }));
test('rejects foreignOrigin before storeadmission and preserves wxraw part on duplicate', async () =>
  fixture(async (root) => {
    let called = false;
    const handler = createHandler(
      { artifactRoot: root },
      {
        start() {
          called = true;
        },
      },
    );
    const res = response();
    await handler(
      {
        method: 'POST',
        url: '/start',
        headers: { origin: 'https://foreign.invalid' },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('{}');
        },
      },
      res,
    );
    assert.equal(res.status, 400);
    assert.equal(called, false);
    const build = {
        captureRoot: join(root, 'captures'),
        sourceHash: 'a',
        artifactHash: 'b',
        nativeHash: 'c',
      },
      store = await createStore(build),
      start = await store.start('AUTO');
    const identity = {
      captureId: start.captureId,
      backend: 'WEBGPU',
      runOrdinal: 0,
      pair: 0,
      observer: false,
      arm: 'REFERENCE_030',
      sourceHash: 'a',
      artifactHash: 'b',
      nativeHash: 'c',
    };
    await store.receive(start.captureId, 'run-start', {
      identity,
      startedAt: new Date().toISOString(),
    });
    const data = {
      partId: 'run-00-frameIntervalMs',
      part: { identity, kind: 'metric', metric: 'frameIntervalMs', distribution: null },
    };
    await store.receive(start.captureId, 'part', data);
    await assert.rejects(store.receive(start.captureId, 'part', data));
    const raw = JSON.parse(
      await readFile(join(root, 'captures', start.captureId, 'run-00-frameIntervalMs.json')),
    );
    assert.deepEqual(raw, data.part);
  }));
test('both primaryRUN and cleanupBACKEND failuremarkers remainimmutable and preventfinish', async () =>
  fixture(async (root) => {
    const store = await createStore({
        captureRoot: join(root, 'captures'),
        sourceHash: 'a',
        artifactHash: 'b',
        nativeHash: 'c',
      }),
      start = await store.start('AUTO');
    await store.receive(start.captureId, 'failure', { stage: 'RUN', error: 'actualnativefault' });
    await store.receive(start.captureId, 'failure', {
      stage: 'BACKEND',
      error: 'enginecleanupfault',
    });
    await assert.rejects(store.receive(start.captureId, 'finish', { captureId: start.captureId }));
    for (const [name, error] of [
      ['run', 'actualnativefault'],
      ['backend', 'enginecleanupfault'],
    ])
      assert.equal(
        JSON.parse(
          await readFile(join(root, 'captures', start.captureId, 'failure-' + name + '.json')),
        ).error,
        error,
      );
  }));

test('invalid ordinal saves rejected raw envelope before terminal failure and never advances normal run', async () =>
  fixture(async (root) => {
    const store = await createStore({
        captureRoot: join(root, 'captures'),
        sourceHash: 'a',
        artifactHash: 'b',
        nativeHash: 'c',
      }),
      start = await store.start('AUTO');
    const raw = {
      identity: {
        captureId: start.captureId,
        backend: 'WEBGPU',
        runOrdinal: 10,
        pair: 5,
        observer: false,
        arm: 'REFERENCE_030',
        sourceHash: 'a',
        artifactHash: 'b',
        nativeHash: 'c',
      },
      nativeFailureMetadata: { tick: 42 },
    };
    await assert.rejects(store.receive(start.captureId, 'run-start', raw));
    const folder = join(root, 'captures', start.captureId),
      marker = JSON.parse(await readFile(join(folder, 'rejected-00.json')));
    assert.equal(marker.ordinal, 0);
    assert.equal(marker.raw.path, 'rejected-00-raw.json');
    assert.deepEqual(JSON.parse(await readFile(join(folder, marker.raw.path))), raw);
    await assert.rejects(store.receive(start.captureId, 'run-start', raw));
    assert.deepEqual(JSON.parse(await readFile(join(folder, 'rejected-00-raw.json'))), raw);
    await assert.rejects(readFile(join(folder, 'run-00-started.json')));
  }));
test('HTTP oversized bounded request stores rejection metadata without accepting a part', async () =>
  fixture(async (root) => {
    const build = {
        captureRoot: join(root, 'captures'),
        artifactRoot: root,
        sourceHash: 'a',
        artifactHash: 'b',
        nativeHash: 'c',
      },
      store = await createStore(build),
      start = await store.start('AUTO');
    const handler = createHandler(build, store),
      res = response();
    await handler(
      {
        method: 'POST',
        url: '/capture/' + start.captureId + '/part',
        headers: { origin: 'http://localhost:5208' },
        async *[Symbol.asyncIterator]() {
          yield Buffer.alloc(128 * 1024 + 1, 32);
        },
      },
      res,
    );
    assert.equal(res.status, 400);
    const marker = JSON.parse(
      await readFile(join(root, 'captures', start.captureId, 'rejected-00.json')),
    );
    assert.equal(marker.metadata.requestBytes, 128 * 1024 + 1);
    assert.equal(marker.raw, null);
    assert.equal(marker.ordinal, 0);
  }));
