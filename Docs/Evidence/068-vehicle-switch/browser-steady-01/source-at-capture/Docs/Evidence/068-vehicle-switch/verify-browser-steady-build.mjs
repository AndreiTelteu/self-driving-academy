import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder = 'Docs/Evidence/068-vehicle-switch/browser-steady-01',
  hash = (b) => createHash('sha256').update(b).digest('hex'),
  json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const m = await json(folder + '/build-manifest.json'),
  a = await json(folder + '/build-archive.json'),
  native = await json(folder + '/native.json'),
  started = await json(folder + '/build-started.json'),
  complete = await json(folder + '/build-complete.json');
const bytes = await readFile(folder + '/build-at-capture.zip');
assert.equal(bytes.length, a.archiveBytes);
assert.equal(hash(bytes), a.archiveSha256);
const actual = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      `import sys,zipfile,hashlib,json
with zipfile.ZipFile(sys.argv[1]) as archive:
 print(json.dumps([dict(path=e.filename,bytes=e.file_size,sha256=hashlib.sha256(archive.read(e)).hexdigest()) for e in archive.infolist()]))`,
      folder + '/build-at-capture.zip',
    ],
    { encoding: 'utf8' },
  ),
);
assert.deepEqual(actual, a.entries, 'Actual durable ZIP byte rehash');
assert.equal(a.entries.length, m.artifacts.length + 2);
assert.equal(hash(JSON.stringify(m.artifacts)), m.artifactHash);
for (const artifact of m.artifacts)
  assert.deepEqual(
    a.entries.find((e) => e.path === artifact.path),
    artifact,
  );
for (const name of ['build-manifest.json', 'hardware.json']) {
  const b = await readFile(folder + '/' + name);
  assert.equal(a.entries.find((e) => e.path === name).sha256, hash(b));
}
const aggregate = createHash('sha256');
for (const path of m.inputs) {
  const b = await readFile(folder + '/source-at-capture/' + path);
  aggregate.update(path).update(b);
  if (!process.argv.includes('--historical')) assert.deepEqual(await readFile(path), b, path);
}
assert.equal(aggregate.digest('hex'), m.sourceHash);
const nb = await readFile(folder + '/native/rapier.mjs');
assert.equal(nb.length, native.bytes);
assert.equal(hash(nb), native.sha256);
if (!process.argv.includes('--historical'))
  assert.deepEqual(await readFile(new URL(native.path)), nb);
assert.equal(started.status, 'STARTED');
assert.equal(started.productionAbsent, false);
assert.equal(complete.status, 'BUILT');
assert.equal(complete.sourceHash, m.sourceHash);
assert.ok(
  Date.parse(started.createdAt) <= Date.parse(native.archivedAt) &&
    Date.parse(native.archivedAt) <= Date.parse(complete.createdAt) &&
    Date.parse(complete.createdAt) <= Date.parse(a.createdAt),
);
console.log(
  JSON.stringify({
    status: 'PASS',
    sourceHash: m.sourceHash,
    artifactHash: m.artifactHash,
    nativeHash: native.sha256,
    archiveSha256: a.archiveSha256,
    entries: actual.length,
  }),
);
