// Independent immutable inventory/chronology/source proof only, not full performance acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyWorldInventory } from '../../../scripts/vehicle-selection-after-records.mjs';
const root = fileURLToPath(new URL('../../..', import.meta.url)),
  folder = resolve(root, 'Docs/Evidence/068-vehicle-switch/native-after-01');
const historical = process.argv.includes('--historical');
assert(process.argv.slice(2).every((v) => v === '--historical'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const raw = await readFile(resolve(folder, 'after.json')),
  r = JSON.parse(raw),
  start = JSON.parse(await readFile(resolve(folder, 'after-started.json'))),
  first = JSON.parse(await readFile(resolve(folder, 'after-first-world.json'))),
  terminal = JSON.parse(await readFile(resolve(folder, 'after-terminal.json')));
assert.equal(r.status, 'PASS');
assert.equal(terminal.status, 'PASS');
assert.equal(terminal.reportSaved, true);
assert.deepEqual(terminal.errors, []);
assert.equal(terminal.reportSha256, hash(raw));
assert.equal(r.startedAt, start.startedAt);
assert.equal(r.firstWorldAt, first.firstWorldAt);
assert.equal(r.sourceHash, first.sourceHash);
assert.equal(r.sourceHash, terminal.sourceHash);
assert.equal(terminal.startedAt, r.startedAt);
assert.equal(terminal.firstWorldAt, r.firstWorldAt);
assert.equal(terminal.capturedAt, r.capturedAt);
assert.equal(r.fixtureVersion, '068-production-selection-after-v1');
assert.equal(start.phase, 'IMPLEMENTATION_AFTER');
assert.equal(r.resourceFailures.length, 0);
assert.equal(r.endGuards.status, 'PASS');
assert.equal(r.endGuards.inputs, r.inputs.length);
assert.equal(r.endGuards.native, true);
assert(Date.parse(r.startedAt) <= Date.parse(r.nativeArtifact.archivedAt));
assert(Date.parse(r.nativeArtifact.archivedAt) <= Date.parse(r.firstWorldAt));
assert(Date.parse(r.firstWorldAt) <= Date.parse(r.endGuards.checkedAt));
assert(Date.parse(r.endGuards.checkedAt) <= Date.parse(r.capturedAt));
const aggregate = createHash('sha256'),
  seen = new Set();
for (const i of r.inputs) {
  assert(!seen.has(i.path));
  seen.add(i.path);
  assert(!i.path.includes('..') && !i.path.startsWith('/') && !i.path.includes('\\'));
  const b = await readFile(resolve(folder, 'source-after', i.path));
  assert.equal(b.length, i.bytes);
  assert.equal(hash(b), i.sha256);
  aggregate.update(i.path).update(b);
  if (!historical)
    assert.equal(
      hash(await readFile(resolve(root, i.path))),
      i.sha256,
      'Current source differs ' + i.path,
    );
}
assert.equal(aggregate.digest('hex'), r.sourceHash);
for (const required of [
  'src/input/vehicle-selection.ts',
  'scripts/benchmark-vehicle-selection-after.mjs',
  'scripts/vehicle-selection-after-records.mjs',
  'Docs/Evidence/068-vehicle-switch/verify-after-inventory.mjs',
])
  assert(seen.has(required));
assert.equal(r.nativeArtifact.archiveRelativePath, 'native-after/rapier.mjs');
const native = await readFile(resolve(folder, r.nativeArtifact.archiveRelativePath));
assert.equal(native.length, r.nativeArtifact.bytes);
assert.equal(hash(native), r.nativeArtifact.sha256);
assert.equal(first.nativeSha256, r.nativeArtifact.sha256);
if (!historical) assert.equal(hash(await readFile(r.nativeArtifact.path)), r.nativeArtifact.sha256);
const expectedRuns = [];
for (const count of [70, 110])
  for (let pair = 0; pair < 5; pair++)
    for (const observer of pair % 2 ? [true, false] : [false, true])
      expectedRuns.push({
        count,
        pair,
        observer,
        classId: null,
        fixedMode: null,
        targetKind: 'TAXI',
      });
const expectedScenarios = [];
for (const classId of ['sedan', 'compact'])
  for (const targetKind of ['TAXI', 'CIVIL'])
    for (const fixedMode of ['AUTO', 'MANUAL', 'LEARNING'])
      expectedScenarios.push({
        count: 2,
        pair: 0,
        observer: false,
        classId,
        fixedMode,
        targetKind,
      });
const view = (r) =>
  Object.fromEntries(
    ['count', 'pair', 'observer', 'classId', 'fixedMode', 'targetKind'].map((k) => [k, r[k]]),
  );
assert.deepEqual(r.runs.map(view), expectedRuns);
assert.deepEqual(r.scenarios.map(view), expectedScenarios);
assert.deepEqual(
  r.guards.map((g) => g.classId),
  ['sedan', 'compact'],
);
assert.equal(r.worldRecords.length, 34);
assert.equal(terminal.runs, 20);
assert.equal(terminal.scenarios, 12);
assert.equal(terminal.guards, 2);
await verifyWorldInventory({
  folder: resolve(folder, 'worlds'),
  sourceHash: r.sourceHash,
  worlds: [
    ...r.runs.map((result) => ({ descriptor: result, result })),
    ...r.scenarios.map((result) => ({ descriptor: result, result })),
    ...r.guards.map((result) => ({ descriptor: { guard: true, classId: result.classId }, result })),
  ],
});
const receipts = new Set();
for (const receipt of r.worldRecords) {
  assert(!receipts.has(receipt.id));
  receipts.add(receipt.id);
  assert.match(
    receipt.id,
    /^(fleet-(70|110)-[0-4]-(on|off)|class-(sedan|compact)-(AUTO|MANUAL|LEARNING)-(TAXI|CIVIL)|guard-(sedan|compact))$/,
  );
  assert.equal(receipt.record, receipt.id + '.pass.json');
  const bytes = await readFile(resolve(folder, 'worlds', receipt.record));
  assert.equal(hash(bytes), receipt.sha256);
  const record = JSON.parse(bytes);
  assert(Date.parse(r.nativeArtifact.archivedAt) <= Date.parse(record.startedAt));
  assert(Date.parse(record.completedAt) <= Date.parse(r.capturedAt));
}
const rootEntries = await readdir(folder);
assert(!rootEntries.some((name) => /failed|rejected|partial|incomplete/i.test(name)));
console.log(
  JSON.stringify({
    status: 'PASS',
    scope: 'INVENTORY_SOURCE_CHRONOLOGY_ONLY_NOT_FULL_ACCEPTANCE',
    historical,
    worlds: 34,
    sourceHash: r.sourceHash,
  }),
);
