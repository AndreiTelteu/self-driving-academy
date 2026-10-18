import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { readPortableCapture } from '../tests/browser/wheel-dynamics-v2/ledger.mjs';

const [id, output] = process.argv.slice(2);
assert(/^[a-f0-9-]{36}$/.test(id));
assert(
  output?.startsWith('Docs/Evidence/026-laptop/') &&
    output.endsWith('.json') &&
    !output.includes('..'),
);
const c = await readPortableCapture(
  `Docs/Evidence/026-wheel-dynamics/laptop-20261011-browser/${id}`,
);
const terminal = c.terminal.dto;
assert.equal(terminal.state, 'SMOKE_COMPLETE');
assert.equal(c.raw.length, 10);
assert.equal(c.late.length, 0);
for (const dto of [terminal, ...c.raw.map((x) => x.dto)]) {
  const life = dto.lifetime;
  assert.equal(life.closed, true);
  assert.equal(life.failed, false);
  assert.equal(life.overflow, 0);
  assert.equal(life.causeOverflow, 0);
  assert.equal(life.lateCount, 0);
  assert.equal(life.pending, false);
  assert.equal(life.causes.length, 0);
  assert(life.journal.every((x) => x.focused === true && x.hidden === false));
}
for (const { dto } of c.raw) {
  assert(dto.frames > 0 && dto.ticks > 0);
  assert.deepEqual(dto.readbacks['native-resources'], {
    bodies: { entities: 0, subscriptions: 0 },
    collisions: { vehicles: 0, obstacles: 0, colliders: 0, disposed: true },
  });
}
assert.deepEqual(terminal.readbacks, {
  surface: { connected: false },
  backend: { sceneDisposed: true },
  engine: { engineDisposed: true },
});
const report = {
  id,
  backend: terminal.renderer,
  state: 'PREFLIGHT_PASS',
  arms: c.raw.length,
  cleanup: 'PASS',
  sourceHash: c.start.binding.sourceHash,
  artifactHash: c.start.binding.artifactHash,
  scope: 'SMOKE only, no performance acceptance',
};
await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report));
