// Read-only deterministic evidence verification. No world, browser, server or profiler.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fullBackendSequence } from './hardware-protocol.ts';
import { verifyCompleteRun, compareBackend, rejectTerminalMarkers } from './hardware-verifier.ts';
const capturePath = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass immutable capture directory');
assert.ok(
  capturePath.startsWith(resolve('Docs/Evidence/029-vehicle-damage') + sep),
  'Capture must be within029 evidence',
);
const historical = process.argv.includes('--historical'),
  sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const terminalFiles = await readdir(capturePath);
rejectTerminalMarkers(terminalFiles);
const start = JSON.parse(await readFile(resolve(capturePath, 'start.json'), 'utf8')),
  build = start.build;
const combined = createHash('sha256');
for (const input of build.inputs) {
  const bytes = await readFile(resolve(build.archiveRoot, input.path));
  assert.equal(bytes.length, input.bytes);
  assert.equal(sha(bytes), input.sha256);
  combined.update(input.path).update(bytes);
  if (!historical) {
    const current = await readFile(input.path);
    assert.equal(current.length, input.bytes);
    assert.equal(sha(current), input.sha256);
  }
}
assert.equal(combined.digest('hex'), build.sourceHash);
const artifact = createHash('sha256');
for (const input of build.artifacts) {
  const bytes = await readFile(resolve(build.artifactRoot, input.path));
  assert.equal(bytes.length, input.bytes);
  assert.equal(sha(bytes), input.sha256);
  artifact.update(input.path).update(bytes);
}
assert.equal(artifact.digest('hex'), build.artifactHash);
const native = await readFile(build.nativeArchivePath);
assert.equal(native.length, build.nativeBytes);
assert.equal(sha(native), build.nativeHash);
if (!historical) assert.equal(sha(await readFile(build.nativePath)), build.nativeHash);
assert.equal(
  sha(
    await readFile(
      resolve(build.archiveRoot, 'Docs/Evidence/029-vehicle-damage/reference-provenance.json'),
    ),
  ),
  build.referenceProvenanceHash,
);
const provenance = JSON.parse(
  await readFile(
    resolve(build.archiveRoot, 'Docs/Evidence/029-vehicle-damage/reference-provenance.json'),
    'utf8',
  ),
);
assert.equal(provenance.publishedCommit, 'f1c6428034c1d52ae0eb3e88857fb6f61ffd43ce');
assert.equal(provenance.allPublishedRuntimeSourcesMatched, true);
assert.equal(provenance.inputs.length, 22);
for (const input of provenance.inputs) {
  const bytes = await readFile(resolve(build.archiveRoot, input.archivePath));
  assert.equal(bytes.length, input.executedBytes);
  assert.equal(sha(bytes), input.executedSha256);
  const gitBlob = execFileSync('git', ['show', `${provenance.publishedCommit}:${input.path}`], {
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(gitBlob.length, input.gitBlobBytes);
  assert.equal(sha(gitBlob), input.gitBlobSha256);
  assert.equal(
    sha(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))),
    sha(Buffer.from(gitBlob.toString('utf8').replaceAll('\r\n', '\n'))),
  );
  assert.equal(input.byteIdentical, bytes.equals(gitBlob));
  assert.equal(input.eolOnlyDifference, !bytes.equals(gitBlob));
}
const files = await readdir(capturePath),
  runs = [];
let totalParts = 0;
for (const spec of fullBackendSequence()) {
  const manifest = JSON.parse(
    await readFile(resolve(capturePath, `run-${spec.runOrdinal}-manifest.json`), 'utf8'),
  );
  const expected = {
    captureId: start.captureId,
    backend: start.backend,
    pair: spec.pair,
    observer: spec.observer,
    arm: spec.arm,
    runOrdinal: spec.runOrdinal,
    sourceHash: build.sourceHash,
    artifactHash: build.artifactHash,
    nativeHash: build.nativeHash,
  };
  const parts = [];
  assert.ok(manifest.partIds.length <= 16);
  totalParts += manifest.partIds.length;
  for (const id of manifest.partIds) {
    assert.match(id, /^[a-zA-Z0-9_-]+$/);
    const bytes = await readFile(resolve(capturePath, `${id}.json`));
    assert.ok(bytes.length <= 128 * 1024);
    parts.push(JSON.parse(bytes));
  }
  assert.equal(
    files.filter((name) =>
      name.startsWith(`${start.captureId}-${start.backend}-${spec.runOrdinal}-`),
    ).length,
    manifest.partIds.length,
    'No unmanifested retained parts',
  );
  const verified = verifyCompleteRun(
    manifest,
    parts.filter((part) => part.version === '029-metric-part-v1'),
    parts.find((part) => part.version === '029-trace-part-v1'),
    parts.find((part) => part.version === '029-heap-part-v1'),
    expected,
    build,
  );
  assert.deepEqual(
    verified,
    JSON.parse(
      await readFile(resolve(capturePath, `run-${spec.runOrdinal}-verified.json`), 'utf8'),
    ),
  );
  runs.push(verified);
}
assert.ok(totalParts <= 320);
assert.deepEqual(
  compareBackend(runs),
  JSON.parse(await readFile(resolve(capturePath, 'comparison.json'), 'utf8')),
);
console.log(
  JSON.stringify({
    verification: 'PASS',
    mode: historical ? 'HISTORICAL_ARCHIVE_ONLY' : 'CURRENT_SOURCE_AND_ARCHIVE',
    captureId: start.captureId,
    backend: start.backend,
    totalParts,
    sourceHash: build.sourceHash,
    artifactHash: build.artifactHash,
    nativeHash: build.nativeHash,
    result: compareBackend(runs),
  }),
);
