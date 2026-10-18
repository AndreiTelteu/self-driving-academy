import { RAF_DIAGNOSTIC } from './protocol.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { diagnosticStore, readDiagnosticBody, BODY_CAP } from './store.mjs';
const build = { sourceHash: 'source', artifactHash: 'artifact', nativeHash: 'native' };
async function temp(action) {
  const base = await realpath(tmpdir()),
    root = await mkdtemp(join(base, 'raf-diag-unit-'));
  try {
    return await action(root);
  } finally {
    const actual = await realpath(root);
    if (dirname(actual) !== base || !basename(actual).startsWith('raf-diag-unit-'))
      throw Error('temporary deletion boundary');
    await rm(actual, { recursive: true });
  }
}
const start = { sourceHash: 'source', nativeHash: 'native', preference: 'AUTO' },
  bytes = (x) => Buffer.from(JSON.stringify(x));
function report(id) {
  return {
    captureId: id,
    build,
    performanceAcceptance: false,
    hardwareFullAcceptance: false,
    status: 'COMPLETE_DIAGNOSTIC',
    waits: [],
    heartbeats: [],
    longTasks: [],
    stages: [],
  };
}
test('once per preference immutable submission and full source/native/artifact identity', () =>
  temp(async (root) => {
    const store = diagnosticStore(root, build, async () => {}),
      first = await store.handle('/start', bytes(start));
    assert.equal(first.nativeHash, 'native');
    await assert.rejects(store.handle('/start', bytes(start)), /exists/);
    const value = report(first.captureId);
    value.build = { ...build, artifactHash: 'forged' };
    await assert.rejects(store.handle('/diagnostic', bytes(value)), /identity/);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'AUTO', 'submitted.json'))), value);
    await assert.rejects(store.handle('/diagnostic', bytes(report(first.captureId))), /terminal/);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'AUTO', 'submitted.json'))), value);
  }));
test('submitted raw and SHA retained BEFORE current-source guard failure', () =>
  temp(async (root) => {
    let fail = false;
    const store = diagnosticStore(root, build, async () => {
        if (fail) throw Error('source changed');
      }),
      first = await store.handle('/start', bytes(start));
    fail = true;
    const raw = bytes(report(first.captureId));
    await assert.rejects(store.handle('/diagnostic', raw), /source changed/);
    assert.deepEqual(await readFile(join(root, 'AUTO', 'submitted.json')), raw);
    const envelope = JSON.parse(await readFile(join(root, 'AUTO', 'submitted-envelope.json')));
    assert.equal(envelope.bytes, raw.length);
    assert.equal((await readdir(join(root, 'AUTO'))).includes('rejected.json'), true);
  }));
test('bounded oversized stream retains attempted capture ID and immutable failure marker', () =>
  temp(async (root) => {
    const store = diagnosticStore(root, build, async () => {}),
      first = await store.handle('/start', bytes(start));
    const request = {
      headers: { 'x-diagnostic-capture-id': first.captureId },
      resume() {},
      iterator() {
        return (async function* () {
          const chunk = Buffer.alloc(1024 * 1024);
          for (let i = 0; i < 17; i++) yield chunk;
        })();
      },
    };
    let error;
    try {
      await readDiagnosticBody(request);
    } catch (e) {
      error = e;
    }
    assert.equal(error.status, 413);
    assert.equal(error.bytesObserved, BODY_CAP + 1024 * 1024);
    await store.rejectBody(error);
    const marker = JSON.parse(await readFile(join(root, 'AUTO', 'body-read-failure.json')));
    assert.equal(marker.captureId, first.captureId);
    assert.equal(marker.status, 'INCOMPLETE_TRANSPORT');
    await assert.rejects(store.rejectBody(error), /terminal/);
    assert.equal((await readdir(join(root, 'AUTO'))).includes('submitted.json'), false);
  }));
test('maximum shaped raw DTO admission fits declared16MiB encoded cap', () => {
  const n = -Number.MAX_VALUE;
  const wait = {
    phase: 'NATIVE_RENDERER_SETUP',
    first: true,
    requestMs: n,
    beforeReadStartMs: n,
    beforeReadEndMs: n,
    afterReadStartMs: n,
    afterReadEndMs: n,
    stampMs: n,
    callbackMs: n,
    nativeBefore: n,
    nativeAfter: n,
    controllerBefore: n,
    controllerAfter: n,
    priorRenderStartMs: n,
    priorRenderFinishMs: n,
    timeout: false,
  };
  const value = {
    ...report('id'),
    waits: Array(RAF_DIAGNOSTIC.frameCap).fill(wait),
    heartbeats: Array(4000).fill({ dueMs: n, firedMs: n }),
    longTasks: Array(4096).fill({ startMs: n, durationMs: n }),
    stages: Array(20).fill({ phase: 'NATIVE_SETUP_RENDER_COMPLETE', atMs: n }),
    cleanup: { causes: Array(32).fill({ category: 'x'.repeat(128), message: 'x'.repeat(2048) }) },
    nativeCleanup: {
      causes: Array(32).fill({ category: 'x'.repeat(128), message: 'x'.repeat(2048) }),
    },
    build: { ...build, inputs: Array(256).fill('x'.repeat(512)) },
    error: 'x'.repeat(16384),
    version: 'raf-scheduling-observation-v1',
    timeOrigin: n,
    renderer: 'WEBGPU',
    createdAt: '2026-10-06T00:00:00.000Z',
    longTaskOverflow: n,
    observerSupported: true,
    observerError: 'x'.repeat(2048),
    outstanding: wait,
    firstBeforeNative: {
      stage: 'SETUP',
      tick: n,
      readStartMs: n,
      readEndMs: n,
      counter: { nativeSerial: n, controllerTick: n },
    },
    latestBeforeNative: {
      stage: 'DRIVING',
      tick: n,
      readStartMs: n,
      readEndMs: n,
      counter: { nativeSerial: n, controllerTick: n },
    },
    apiAvailability: {
      raf: true,
      performanceNow: true,
      longtask: true,
      gc: null,
      osScheduler: null,
      devtoolsTracing: null,
    },
    overhead: 'x'.repeat(2048),
    nativeCleanupReserve: 'x'.repeat(262144),
    cleanupReserve: 'x'.repeat(262144),
  };
  const actual = bytes(value).length;
  console.log('maximum-shaped24000waitDTOBytes=' + actual + ' limit=' + BODY_CAP);
  assert.ok(actual <= BODY_CAP, 'actual maximum shaped JSON ' + actual);
});

test('cleanup admission overflow is rejected with submitted original retained', () =>
  temp(async (root) => {
    const store = diagnosticStore(root, build, async () => {}),
      first = await store.handle('/start', bytes(start));
    const value = { ...report(first.captureId), cleanup: { payload: 'x'.repeat(262145) } };
    await assert.rejects(store.handle('/diagnostic', bytes(value)), /cleanup payload cap/);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'AUTO', 'submitted.json'))), value);
    assert.ok((await readdir(join(root, 'AUTO'))).includes('rejected.json'));
  }));
