// Independent reader of immutable build bytes, export receipt and physical outcomes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateLongitudinalDriving } from './longitudinal-driving-validation.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const label = process.argv[2];
const name = process.argv[3];
assert(/^[a-z0-9-]+$/.test(label));
assert(/^run-[a-f0-9-]{36}\.json$/.test(name));
const folder = `Docs/Evidence/047-longitudinal-control/${label}`;
const bytes = await readFile(`${folder}/${name}`);
const envelope = JSON.parse(bytes);
const binding = JSON.parse(await readFile(`${folder}/binding.json`));
const hardwareBytes = await readFile(`${folder}/hardware.json`);
const receipt = JSON.parse(await readFile(`${folder}/${name}.receipt.json`));
assert.equal(receipt.name, name);
assert.equal(receipt.sha256, digest(bytes));
assert.deepEqual(envelope.build, binding);
assert.deepEqual(envelope.hardware, JSON.parse(hardwareBytes));
assert.equal(binding.sourceHash, digest(JSON.stringify(binding.inputs)));
assert.equal(binding.artifactHash, digest(JSON.stringify(binding.artifacts)));
for (const item of binding.inputs) {
  const captured = await readFile(`${folder}/source/${item.path}`);
  assert.equal(captured.length, item.bytes);
  assert.equal(digest(captured), item.sha256);
  if (process.argv.includes('--current'))
    assert.equal(digest(await readFile(item.path)), item.sha256, item.path);
}
for (const item of binding.artifacts) {
  const captured = await readFile(`${folder}/artifact/${item.path}`);
  assert.equal(captured.length, item.bytes);
  assert.equal(digest(captured), item.sha256);
}
const payload = envelope.payload;
assert.notEqual(payload.status, 'FAIL');
assert.equal(payload.fixture, '047-browser-driving-v1');
for (const key of ['commit', 'sourceHash', 'budgetVersion', 'engineVersion', 'physicsVersion'])
  assert.equal(payload.build[key], binding[key]);
assert.equal(binding.budgetVersion, '203-initial-1');
assert.equal(binding.engineVersion, '9.29.0');
assert.equal(binding.physicsVersion, '0.21.0');
assert.equal(payload.artifactHash, binding.artifactHash);
assert(['WEBGPU', 'WEBGL2'].includes(payload.renderer));
assert.equal(payload.foreground, true);
assert.equal(typeof payload.browser, 'string');
assert(payload.browser.includes('Chrome/'));
assert(payload.dpr > 0 && Number.isFinite(payload.dpr));
assert.deepEqual(payload.internalResolution, [1280, 720]);
assert(payload.cssResolution.every((n) => Number.isFinite(n) && n > 0));
assert.equal(payload.episodes.length, 4);
assert.equal(
  new Set(payload.episodes.map(({ result }) => `${result.classId}|${result.risky}`)).size,
  4,
);
for (const episode of payload.episodes) {
  assert.deepEqual(episode.failures, []);
  validateLongitudinalDriving(episode.result, episode.cleanup);
  assert.equal(episode.result.surface, 'dry-asphalt');
  const clock = episode.clock;
  assert.equal(clock.overloadCount, 0);
  assert(Number.isSafeInteger(clock.ticks));
  assert(clock.ticks >= episode.result.ticks && clock.ticks <= episode.result.ticks + 3);
  assert(Math.abs(clock.simulatedSeconds - clock.ticks / 60) < 1e-8);
  assert(Number.isFinite(clock.activeRealSeconds) && clock.activeRealSeconds > 0);
  assert(clock.simulatedSeconds / clock.activeRealSeconds >= 0.98);
  assert(Number.isFinite(episode.maxRafGapMs) && episode.maxRafGapMs >= 0);
  assert(Number.isFinite(episode.elapsedWallMs) && episode.elapsedWallMs > 0);
}
console.log(
  JSON.stringify({
    status: 'PASS',
    label,
    name,
    renderer: payload.renderer,
    sourceHash: binding.sourceHash,
    artifactHash: binding.artifactHash,
    episodes: payload.episodes.map(({ result }) => ({
      classId: result.classId,
      risky: result.risky,
      pathM: result.pathM,
      collisionImpulseNs: result.collisionImpulseNs,
    })),
    scope: 'Short visible integration; no fleet FPS or full hardware gate.',
  }),
);
