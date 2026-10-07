import assert from 'node:assert/strict';
import test from 'node:test';
import {
  preserveWorldRecord,
  verifyWorldInventory,
} from '../../scripts/vehicle-selection-after-records.mjs';
import { createVehicleSelection } from '../../src/input/vehicle-selection.ts';
import { CONTROLLER_CONTEXT as context } from '../vehicles/controller-reference.ts';
const sourceHash = 'a'.repeat(64),
  id = 'fleet-110-0-off',
  start = { startedAt: '2026-10-06T12:00:00.000Z' };
function memoryWriter() {
  const files = new Map();
  return {
    files,
    write: async (path, bytes, options) => {
      assert.equal(options.flag, 'wx');
      assert(!files.has(path), 'Immutable writer refuses overwrite');
      files.set(path, Buffer.from(bytes));
    },
  };
}
test('068 AFTER records preserve partial measured prefixes/checkpoints and original world failure', async () => {
  const memory = memoryWriter(),
    original = Error('native failure at tick584');
  const partial = {
    attemptedTick: 584,
    acceptedTick: 584,
    sampleCount: 2,
    rawTimings: {
      tickMs: [1.2, 1.4],
      authorityMs: [0.8, 0.9],
      referenceSelectionMs: [0.2, 0.3],
      vehicleSelectionMs: [0.01, 0.02],
    },
    checkpoints: [{ tick: 540, physical: [{ position: { x: 1, y: 2, z: 3 } }] }],
    selectionTrace: [{ tick: 581, selected: 'car-0' }],
  };
  await assert.rejects(
    preserveWorldRecord({
      folder: 'worlds',
      id,
      start,
      sourceHash,
      result: null,
      partial,
      cleanup: { body: { entities: 0 }, errors: [] },
      causes: [original],
      write: memory.write,
    }),
    (error) => error instanceof AggregateError && error.errors[0] === original,
  );
  const record = JSON.parse(memory.files.get('worlds/' + id + '.failed.json'));
  assert.equal(record.status, 'FAIL');
  assert.deepEqual(record.partial, partial);
  assert.equal(record.errors[0].message, original.message);
  assert.equal(JSON.parse(memory.files.get('worlds/' + id + '.terminal.json')).status, 'FAIL');
  assert(!memory.files.has('worlds/' + id + '.pass.json'));
});
test('068 AFTER writer failure retains original, cleanup and export errors and leaves no PASS', async () => {
  const memory = memoryWriter(),
    original = Error('capture cause'),
    cleanup = Error('dispose cause'),
    transport = Error('disk denied');
  const write = async (path, bytes, options) => {
    if (path.endsWith('.failed.json')) throw transport;
    await memory.write(path, bytes, options);
  };
  await assert.rejects(
    preserveWorldRecord({
      folder: 'worlds',
      id,
      start,
      sourceHash,
      result: null,
      partial: { sampleCount: 1, rawTimings: { tickMs: [3] } },
      cleanup: { errors: ['dispose cause'] },
      causes: [original, cleanup],
      write,
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.length === 3 &&
      error.errors[0] === original &&
      error.errors[1] === cleanup &&
      error.errors[2] === transport,
  );
  assert.equal(JSON.parse(memory.files.get('worlds/' + id + '.rejected.json')).recordSaved, false);
  assert(!memory.files.has('worlds/' + id + '.terminal.json'));
  assert(!memory.files.has('worlds/' + id + '.pass.json'));
});
test('068 AFTER strict inventory rejects an otherwise complete inventory with a failed/partial sibling', async () => {
  const worlds = [];
  for (const count of [70, 110])
    for (let pair = 0; pair < 5; pair++)
      for (const observer of [false, true])
        worlds.push({ descriptor: { count, pair, observer }, result: {} });
  for (const classId of ['sedan', 'compact'])
    for (const fixedMode of ['AUTO', 'MANUAL', 'LEARNING'])
      for (const targetKind of ['TAXI', 'CIVIL'])
        worlds.push({ descriptor: { classId, fixedMode, targetKind }, result: {} });
  for (const classId of ['sedan', 'compact'])
    worlds.push({ descriptor: { guard: true, classId }, result: {} });
  const { worldId } = await import('../../scripts/vehicle-selection-after-records.mjs');
  const names = worlds.flatMap((w) =>
    ['started', 'pass', 'terminal'].map((s) => worldId(w.descriptor) + '.' + s + '.json'),
  );
  names.push('fleet-110-0-off.failed.json');
  await assert.rejects(
    verifyWorldInventory({
      folder: 'worlds',
      sourceHash,
      worlds,
      list: async () => names,
      read: async () => {
        throw Error('Reader must not run after invalid inventory');
      },
    }),
    /Failed\/rejected\/partial/,
  );
});
test('068 actual independent live admission owner rejects retired native pointer after sameid replacement', () => {
  const old = Object.freeze({ entityId: 'car-1', handle: 1, generation: 1 }),
    replacement = Object.freeze({ entityId: 'car-1', handle: 2, generation: 2 });
  let current = old,
    camera = old;
  const owner = createVehicleSelection(context, {
    readAuthority: () => ({
      context,
      tick: 4,
      vehicles: 1,
      players: 0,
      seat: null,
      suspended: false,
      disposed: false,
      fault: null,
      retainedHistory: 0,
      retainedBatches: 0,
    }),
    bodyIdentity: () => current,
    readPresentation: (identity) => ({ identity, kind: 'TAXI', visible: true, selectable: true }),
    readCameraTarget: () => camera,
    selectCamera: (identity) => {
      camera = identity;
    },
    clearInput: () => {},
    readAssignment: (identity) => ({
      context,
      identity,
      routeFingerprint: 'route',
      tripFingerprint: null,
    }),
    readBoundary: () => null,
    closeBoundary: () => {
      throw Error('No controlled departure allowed');
    },
  });
  try {
    owner.register(old, 'TAXI');
    current = replacement;
    assert.throws(() => owner.enqueue(old, 'WORLD'), /Stale\/unregistered/);
    assert.equal(owner.getStats().pending, 0);
    owner.remove(old);
    owner.register(replacement, 'TAXI');
    assert.throws(() => owner.enqueue(old, 'WORLD'), /Stale\/unregistered/);
    assert.equal(owner.enqueue(replacement, 'WORLD'), true);
    assert.equal(owner.observe().tick, 4);
  } finally {
    owner.dispose();
  }
});
