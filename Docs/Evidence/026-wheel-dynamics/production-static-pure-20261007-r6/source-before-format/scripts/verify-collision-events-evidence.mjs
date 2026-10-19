import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const root = 'Docs/Evidence/028-collision-events';
const historical = process.argv.includes('--historical');
const read = (file) => JSON.parse(readFileSync(`${root}/${file}`, 'utf8'));
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const before = read('before.json');
const after = read('after.json');
const onset = read('onset-cpu.json');
const browser = read('browser-build-manifest.json');
let archivedSources = 0;
for (const [name, hashes] of [
  ['before', before.sourceHashes],
  ['after', after.sourceHashes],
  ['browser', browser.hashes],
]) {
  for (const [file, expected] of Object.entries(hashes)) {
    const archived = file.startsWith('node_modules/')
      ? `${root}/native-source/${file.endsWith('package.json') ? 'package.json' : 'rapier.mjs'}`
      : `${root}/source-${name}/${file}`;
    assert.equal(hash(archived), expected, `Archived ${name}: ${file}`);
    archivedSources++;
  }
}
if (!historical) {
  for (const [file, expected] of Object.entries(after.sourceHashes))
    assert.equal(hash(file), expected, `Current after source: ${file}`);
  for (const [file, expected] of Object.entries(browser.hashes))
    assert.equal(hash(file), expected, `Current browser source: ${file}`);
}
assert.equal(hash(`${root}/before.json`), after.beforeSha256);
assert.equal(
  hash(`${root}/onset-source/scripts/benchmark-collision-onsets.mjs`),
  onset.scriptSha256,
);
if (!historical) assert.equal(hash('scripts/benchmark-collision-onsets.mjs'), onset.scriptSha256);
assert.deepEqual(onset.afterSourceHashes, after.sourceHashes);
let emittedArtifactBytes = 0;
for (const artifact of browser.artifacts) {
  const file = `.pbi-validation-028/build/${artifact.path}`;
  assert.equal(hash(file), artifact.sha256, `Browser emitted artifact: ${file}`);
  assert.equal(readFileSync(file).length, artifact.bytes);
  emittedArtifactBytes += artifact.bytes;
}
assert.equal(before.runs.length, 20);
assert.equal(after.runs.length, 20);
assert.ok(before.completedAt && after.completedAt);
for (const row of after.runs) {
  const previous = before.runs.find(
    (candidate) =>
      candidate.repetition === row.repetition &&
      candidate.observe === row.observe &&
      candidate.dense === row.dense,
  );
  assert.equal(row.checksum, previous.checksum);
  assert.equal(row.maxContacts, previous.maxContacts);
  for (const [metric, value] of Object.entries(row.metrics))
    assert.equal(value.count, metric === 'observerCapture' && !row.observe ? 0 : 600);
  assert.ok(row.emitted > 0 && row.impulseSumNs > 0);
  assert.equal(row.received, row.emitted);
  assert.equal(row.disposed.body.entities, 0);
  assert.equal(row.disposed.body.subscriptions, 0);
  assert.equal(row.disposed.collision.colliders, 0);
  assert.equal(row.disposed.adapter.trackedPairs, 0);
  assert.equal(row.disposed.adapter.pending, 0);
  assert.equal(row.disposed.bus.retainedEvents, 0);
  assert.equal(row.disposed.bus.listeners, 0);
  assert.equal(row.disposedReadRejected, true);
}
for (const backend of ['webgpu', 'webgl2']) {
  const report = read(`browser-${backend}.json`);
  assert.equal(report.passed, true);
  assert.equal(report.identity.sourceHash, browser.sourceHash);
  assert.equal(report.identity.commit, browser.commit);
  assert.equal(report.renderer.toLowerCase(), backend);
  assert.equal(report.lifecycleCycles, 20);
  assert.equal(report.lifecycle.length, 20);
  assert.ok(report.contactTicks > 60 && report.maxStreak > 60 && report.events.length >= 2);
  assert.deepEqual(
    report.events.map((event) => event.tick),
    report.expectedOnsets,
  );
  for (const event of report.events) {
    assert.equal(event.type, 'COLLISION');
    assert.ok(event.payload.impulseNs > 0);
  }
  for (const counts of [report.cleanup, ...report.lifecycle]) {
    assert.equal(counts.body.entities, 0);
    assert.equal(counts.body.subscriptions, 0);
    assert.equal(counts.collision.colliders, 0);
    assert.equal(counts.adapter.trackedPairs, 0);
    assert.equal(counts.adapter.pending, 0);
    assert.equal(counts.bus.retainedEvents, 0);
    assert.equal(counts.bus.listeners, 0);
  }
}
assert.ok(existsSync(`${root}/028-actual-wall-contact.png`));
console.log(
  `028 evidence PASS: ${archivedSources} archived/source dependency hashes; ${historical ? 'EXPLICIT HISTORICAL archives; current source comparison skipped' : 'current after/browser closure'}; ${browser.artifacts.length} Vite artifacts/${emittedArtifactBytes} bytes; before raw SHA; onset exact-script SHA;20 before+20 after worlds; both actual browser lifecycle reports.`,
);
console.log(`Published canvas screenshot SHA256: ${hash(`${root}/028-actual-wall-contact.png`)}`);
