import assert from 'node:assert/strict';
export function validateLifecycle(record, cycle, renderer) {
  assert.equal(record.cycle, cycle);
  assert.equal(record.rendererKind, renderer);
  assert.deepEqual(record.surfacePrepared, { css: [1920, 1080], internal: [1920, 1080], dpr: 1 });
  assert.deepEqual(record.canvas, { connected: true, id: 'canvas', currentDOM: true });
  assert.deepEqual(record.causes, []);
  assert.deepEqual(record.causeDetails, []);
  const c = record.cleanup,
    s = c.snapshots;
  assert.deepEqual(c.errors, []);
  assert.equal(c.resourceCap, 192);
  assert.equal(c.readerCap, 192);
  const expected = [
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
  ];
  for (let i = 0; i < 70; i++) expected.push('mesh-' + i, 'material-' + i);
  assert.deepEqual([...c.attempts].sort(), expected.sort());
  assert.equal(new Set(c.attempts).size, c.attempts.length);
  assert.deepEqual(record.ownership, {
    errors: [],
    world: 'ACQUIRED',
    input: 'ACQUIRED',
    renderer: 'ACQUIRED',
  });
  const live = record.admitted;
  assert.equal(live.nativeSerial, 0);
  assert.equal(live.controllerTick, 0);
  assert.deepEqual(
    live.profiles,
    Array.from({ length: 70 }, (_, i) => (i % 2 ? 'compact' : 'sedan')),
  );
  assert.equal(live.body.entities, 70);
  assert.equal(live.body.subscriptions, 0);
  assert.equal(live.authority.vehicles, 70);
  assert.equal(live.authority.players, 0);
  assert.equal(live.authority.tick, 0);
  assert.equal(live.selection.vehicles, 70);
  assert.equal(live.registry, 70);
  assert.equal(live.meshes, 71);
  assert.equal(live.materials, 71);
  assert.equal(live.cameras, 2);
  assert.equal(live.uiElements, 4);
  assert.equal(live.uiTextNodes, 3);
  assert.equal(live.uiListeners, 0);
  for (const [name, keys] of [
    ['body', ['entities', 'subscriptions']],
    ['collision', ['colliders']],
    ['controller', ['vehicles', 'players', 'targets', 'projections']],
    ['authority', ['vehicles', 'players']],
    ['selection', ['vehicles', 'pending', 'inFlight', 'retainedHistory']],
    ['keyboard', ['heldKeys']],
    ['mode', ['intents', 'inFlight']],
    ['segment', ['retainedSegments']],
    ['registry', ['bindings']],
    ['renderer', ['meshes', 'materials', 'cameras']],
  ])
    for (const k of keys) assert.equal(s[name][k], 0);
  for (const name of ['controller', 'authority', 'selection', 'keyboard', 'camera', 'renderer'])
    assert.equal(s[name].disposed, true);
  assert.equal(s.keyboard.pendingPreferences, false);
  assert.equal(s.selection.projection, null);
  assert.equal(s.mode.projection, null);
  assert.equal(s.camera.selected, null);
  assert.equal(s.ui.connected, false);
  assert.equal(s.picker.pickAfterDisposeNull, true);
  for (let i = 0; i < 70; i++) {
    assert.equal(s['mesh-' + i].disposed, true);
    assert.equal(s['material-' + i].disposed, true);
  }
  return true;
}
