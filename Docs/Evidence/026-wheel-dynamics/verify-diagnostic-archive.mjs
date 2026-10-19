// Read-only frozen input/artifact/ZIP verification; no browser or native execution.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = new URL('./', import.meta.url);
const label = 'failure-diagnostic-52671c78-d4eb36a7';
const metadata = JSON.parse(await readFile(new URL(`${label}-archive.json`, folder), 'utf8'));
const root = new URL(`${label}-inputs/`, folder);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(metadata.zipFile, `${label}.zip`);
assert.equal(sha(await readFile(new URL(metadata.zipFile, folder))), metadata.zipSha256);
for (const entry of metadata.files) {
  assert(!entry.path.includes('..') && !entry.path.includes('\\') && !entry.path.startsWith('/'));
  const bytes = await readFile(new URL(entry.path, root));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(sha(bytes), entry.sha256);
}
const manifest = JSON.parse(await readFile(new URL('build/build-manifest.json', root), 'utf8'));
assert.equal(manifest.sourceHash, metadata.sourceHash);
assert.equal(manifest.artifactHash, metadata.artifactHash);
const source = createHash('sha256');
for (const path of manifest.inputs) {
  assert(!path.includes('..') && !path.includes('\\') && !path.startsWith('/'));
  source.update(path).update(await readFile(new URL(`source/${path}`, root)));
}
assert.equal(source.digest('hex'), manifest.sourceHash);
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(new URL(`build/${artifact.path}`, root));
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(sha(bytes), artifact.sha256);
}
assert.equal(sha(JSON.stringify(manifest.artifacts)), manifest.artifactHash);
const historical = JSON.parse(await readFile(new URL('historical-native-after-main-027.json', root), 'utf8'));
const native = await readFile(new URL('rapier-native-artifact.mjs', root));
assert.equal(sha(native), historical.native.sha256);
assert.equal(native.length, historical.native.bytes);
assert.equal(metadata.nativeMechanicsChanged, false);
assert.equal(metadata.hardwareAcceptance, false);
console.log(JSON.stringify({ verified: true, sourceHash: metadata.sourceHash,
  artifactHash: metadata.artifactHash, zipSha256: metadata.zipSha256,
  nativeCaptureScope: 'Historical AFTER-main-027; new failure diagnostics do not recapture mechanics',
  hardwareAcceptance: false }));
