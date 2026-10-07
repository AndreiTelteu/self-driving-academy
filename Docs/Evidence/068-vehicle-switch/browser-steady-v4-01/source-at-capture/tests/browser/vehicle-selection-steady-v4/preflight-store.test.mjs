import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createPreflightStore } from './preflight-store.mjs';
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), '068-v4-preflight-'));
  try {
    await run(
      root,
      createPreflightStore(root, { sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64) }),
    );
  } finally {
    const absolute = resolve(root),
      parent = resolve(tmpdir());
    assert.ok(
      absolute.startsWith(parent + sep) &&
        absolute.slice(parent.length + 1).startsWith('068-v4-preflight-'),
    );
    await rm(absolute, { recursive: true });
  }
}
test('incomplete lifecycle cannot satisfy twenty cycles/both renderer gate', () =>
  fixture(async (root, store) => {
    const { captureId } = await store.start({
      requestedBackend: 'AUTO',
      startedAt: new Date().toISOString(),
    });
    assert.throws(() => store.requireBothPassed());
    const value = {
      captureId,
      requestedBackend: 'AUTO',
      status: 'PASS',
      cycles: 0,
      worldsCreated: 0,
      listeners: 0,
      foreground: true,
    };
    await assert.rejects(() => store.finish(value, Buffer.from(JSON.stringify(value))));
    const terminal = JSON.parse(await readFile(join(root, captureId, 'terminal.json')));
    assert.equal(terminal.status, 'FAILED');
    assert.throws(() => store.requireBothPassed());
  }));
test('malformed raw lifecycle is durable and rejected without normal sequence advance', () =>
  fixture(async (root, store) => {
    const { captureId } = await store.start({
      requestedBackend: 'AUTO',
      startedAt: new Date().toISOString(),
    });
    const value = { captureId, requestedBackend: 'AUTO', ordinal: 0, record: { cycle: 0 } },
      raw = Buffer.from(JSON.stringify(value));
    await assert.rejects(() => store.cycle(value, raw));
    assert.equal(
      (await readFile(join(root, captureId, 'cycle-0-part-0.json'))).toString(),
      raw.toString(),
    );
    assert.ok((await readdir(join(root, captureId))).includes('rejected.json'));
  }));
test('wrong ordinal/raw identity is rejected and retained bounded expected-ordinal raw', () =>
  fixture(async (root, store) => {
    const { captureId } = await store.start({
      requestedBackend: 'AUTO',
      startedAt: new Date().toISOString(),
    });
    const value = { captureId, requestedBackend: 'AUTO', ordinal: 19, record: {} },
      raw = Buffer.from(JSON.stringify(value));
    await assert.rejects(() => store.cycle(value, raw));
    assert.ok((await readdir(join(root, captureId))).includes('cycle-0-rejected-raw.json'));
  }));

function pureRecord(cycle) {
  const attempts = [
      'renderer',
      'context-latch',
      'ui',
      'world',
      'controller',
      'keyboard',
      'authority',
      'mode',
      'segment',
      'camera',
      'registry',
      'picker',
      'selection',
    ],
    snapshots = {
      body: { entities: 0, subscriptions: 0 },
      collision: { colliders: 0 },
      controller: { vehicles: 0, players: 0, targets: 0, projections: 0, disposed: true },
      authority: { vehicles: 0, players: 0, disposed: true },
      selection: {
        vehicles: 0,
        pending: 0,
        inFlight: 0,
        retainedHistory: 0,
        projection: null,
        disposed: true,
      },
      keyboard: { heldKeys: 0, pendingPreferences: false, disposed: true },
      mode: { intents: 0, inFlight: 0, projection: null },
      segment: { retainedSegments: 0 },
      registry: { bindings: 0 },
      renderer: { meshes: 0, materials: 0, cameras: 0, disposed: true },
      camera: { disposed: true, selected: null },
      ui: { connected: false },
      picker: { pickAfterDisposeNull: true },
    };
  for (let i = 0; i < 70; i++) {
    attempts.push('mesh-' + i, 'material-' + i);
    snapshots['mesh-' + i] = { disposed: true };
    snapshots['material-' + i] = { disposed: true };
  }
  return {
    cycle,
    rendererKind: 'WEBGPU',
    surfacePrepared: { css: [1920, 1080], internal: [1920, 1080], dpr: 1 },
    canvas: { connected: true, id: 'canvas', currentDOM: true },
    causes: [],
    causeDetails: [],
    cleanup: { attempts, errors: [], snapshots, resourceCap: 192, readerCap: 192 },
    ownership: { errors: [], world: 'ACQUIRED', input: 'ACQUIRED', renderer: 'ACQUIRED' },
    admitted: {
      nativeSerial: 0,
      controllerTick: 0,
      profiles: Array.from({ length: 70 }, (_, i) => (i % 2 ? 'compact' : 'sedan')),
      body: { entities: 70, subscriptions: 0 },
      authority: { vehicles: 70, players: 0, tick: 0 },
      selection: { vehicles: 70 },
      registry: 70,
      meshes: 71,
      materials: 71,
      cameras: 2,
      uiElements: 4,
      uiTextNodes: 3,
      uiListeners: 0,
    },
  };
}
test('twenty pure protocol records still cannot forge clean terminal identity or cause-free PASS', () =>
  fixture(async (root, store) => {
    const startedAt = new Date().toISOString(),
      { captureId } = await store.start({ requestedBackend: 'AUTO', startedAt });
    for (let ordinal = 0; ordinal < 20; ordinal++) {
      const value = { captureId, requestedBackend: 'AUTO', ordinal, record: pureRecord(ordinal) };
      await store.cycle(value, Buffer.from(JSON.stringify(value)));
    }
    const value = {
      captureId,
      requestedBackend: 'AUTO',
      status: 'PASS',
      cycles: 20,
      worldsCreated: 20,
      listeners: 0,
      foreground: true,
      invalidated: 'WINDOW_BLUR',
      causes: [{ message: 'actual failure' }],
      startedAt: 'forged',
      renderer: 'WEBGL2',
      sourceHash: 'a'.repeat(64),
      artifactHash: 'b'.repeat(64),
      createdAt: new Date().toISOString(),
      scope: 'PREFLIGHT_ONLY_NOT_FULL_ACCEPTANCE',
    };
    await assert.rejects(() => store.finish(value, Buffer.from(JSON.stringify(value))));
    const terminal = JSON.parse(await readFile(join(root, captureId, 'terminal.json')));
    assert.equal(terminal.status, 'FAILED');
    assert.equal(terminal.parts.length, 20);
    assert.throws(() => store.requireBothPassed());
  }));

test('finish API cannot bind object fields to different raw bytes', () =>
  fixture(async (root, store) => {
    const { captureId } = await store.start({
      requestedBackend: 'AUTO',
      startedAt: new Date().toISOString(),
    });
    const value = { captureId, requestedBackend: 'AUTO', status: 'PASS' };
    await assert.rejects(() =>
      store.finish(value, Buffer.from(JSON.stringify({ ...value, status: 'FAILED' }))),
    );
    assert.ok(!(await readdir(join(root, captureId))).includes('terminal.json'));
  }));
