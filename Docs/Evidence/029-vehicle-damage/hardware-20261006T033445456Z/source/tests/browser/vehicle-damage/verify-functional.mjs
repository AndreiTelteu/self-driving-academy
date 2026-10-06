import { readFile, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { verifyFrozenArchive } from './hardware-archive.mjs';
import { verifyFunctionalCases } from './hardware-functional-verifier.ts';
const folder = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2]);
assert.ok(folder.startsWith(resolve('Docs/Evidence/029-vehicle-damage') + sep));
const start = JSON.parse(await readFile(resolve(folder, 'start.json'), 'utf8'));
const archive = await verifyFrozenArchive(start.build, process.argv.includes('--historical'));
const files = await readdir(folder);
assert.equal(
  files.includes('failure.json'),
  false,
  'Original failed attempt cannot become accepted',
);
assert.equal(files.filter((name) => /^case-\d+\.json$/.test(name)).length, 32);
const cases = [];
for (let ordinal = 0; ordinal < 32; ordinal++) {
  const bytes = await readFile(resolve(folder, `case-${ordinal}.json`));
  assert.ok(bytes.length <= 128 * 1024);
  const body = JSON.parse(bytes);
  assert.equal(body.captureId, start.captureId);
  assert.equal(body.ordinal, ordinal);
  cases.push(body.result);
}
const verified = verifyFunctionalCases(cases, start.backend),
  comparison = JSON.parse(await readFile(resolve(folder, 'comparison.json'), 'utf8'));
assert.equal(comparison.captureId, start.captureId);
assert.equal(comparison.backend, start.backend);
assert.equal(comparison.sourceHash, start.build.sourceHash);
assert.equal(comparison.artifactHash, start.build.artifactHash);
assert.equal(comparison.nativeHash, start.build.nativeHash);
assert.equal(comparison.passed, true);
assert.equal(comparison.nativeCases, verified.nativeCases);
assert.equal(comparison.ownershipCycles, verified.ownershipCycles);
assert.ok(
  Date.parse(start.build.archivedAt) <= Date.parse(start.startedAt),
  'Archive before functional capture',
);
for (let ordinal = 0; ordinal < cases.length; ordinal++) {
  assert.ok(Date.parse(start.startedAt) <= Date.parse(cases[ordinal].startedAt));
  if (ordinal)
    assert.ok(
      Date.parse(cases[ordinal - 1].completedAt) <= Date.parse(cases[ordinal].startedAt),
      'No concurrent/reordered worlds',
    );
}
console.log(
  JSON.stringify({
    verification: 'PASS',
    archive,
    captureId: start.captureId,
    backend: start.backend,
    verified,
  }),
);
