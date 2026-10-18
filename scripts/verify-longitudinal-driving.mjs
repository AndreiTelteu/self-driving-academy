import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateLongitudinalDriving } from './longitudinal-driving-validation.mjs';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const label = process.argv[2];
assert(/^[a-z0-9-]+$/.test(label));
const folder = `Docs/Evidence/047-longitudinal-control/${label}`,
  binding = JSON.parse(await readFile(`${folder}/binding.json`)),
  bytes = await readFile(`${folder}/report.json`),
  report = JSON.parse(bytes),
  terminal = JSON.parse(await readFile(`${folder}/terminal.json`));
await assert.rejects(access(`${folder}/failure.json`), { code: 'ENOENT' });
assert.equal(terminal.status, 'CAPTURE_COMPLETE');
assert.equal(report.status, 'CAPTURE_COMPLETE');
assert.equal(digest(bytes), terminal.reportSha256);
assert.equal(terminal.sourceHash, binding.sourceHash);
const aggregate = createHash('sha256');
for (const item of binding.inputs) {
  const bytes = await readFile(`${folder}/source/${item.path}`);
  assert.equal(bytes.length, item.bytes);
  assert.equal(digest(bytes), item.sha256);
  aggregate.update(item.path).update(bytes);
  if (process.argv.includes('--current'))
    assert.equal(digest(await readFile(item.path)), item.sha256);
}
assert.equal(aggregate.digest('hex'), binding.sourceHash);
assert.equal(digest(await readFile(`${folder}/native/rapier.mjs`)), binding.native.sha256);
if (process.argv.includes('--current'))
  assert.equal(digest(await readFile(binding.native.path)), binding.native.sha256);
assert.equal(report.fixture, '047-native-driving-v1');
assert.equal(report.episodes.length, 8);
assert.equal(
  new Set(
    report.episodes.map(({ result }) => [result.classId, result.surface, result.risky].join('|')),
  ).size,
  8,
);
for (const { result, cleanup } of report.episodes) validateLongitudinalDriving(result, cleanup);
console.log(
  JSON.stringify({
    status: 'PASS',
    label,
    sourceHash: binding.sourceHash,
    episodes: report.episodes.map(({ result }) => ({
      classId: result.classId,
      surface: result.surface,
      risky: result.risky,
      pathM: result.pathM,
      collisionImpulseNs: result.collisionImpulseNs,
    })),
  }),
);
