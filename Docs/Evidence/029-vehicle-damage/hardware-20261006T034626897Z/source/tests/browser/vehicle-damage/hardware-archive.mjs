import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const contained = (root, path) => {
  assert.ok(
    typeof path === 'string' &&
      !path.includes('\\') &&
      !path.includes(':') &&
      !path.startsWith('/'),
  );
  const file = resolve(root, path);
  assert.ok(file.startsWith(resolve(root) + sep));
  return file;
};
export async function verifyFrozenArchive(build, historical) {
  assert.equal(build.version, '029-frozen-hardware-build-v1');
  assert.equal(new Set(build.inputs.map((input) => input.path)).size, build.inputs.length);
  const source = createHash('sha256');
  for (const input of build.inputs) {
    const bytes = await readFile(contained(build.archiveRoot, input.path));
    assert.equal(bytes.length, input.bytes);
    assert.equal(sha(bytes), input.sha256);
    source.update(input.path).update(bytes);
    if (!historical) {
      const current = await readFile(contained('.', input.path));
      assert.equal(current.length, input.bytes);
      assert.equal(sha(current), input.sha256);
    }
  }
  assert.equal(source.digest('hex'), build.sourceHash);
  assert.equal(new Set(build.artifacts.map((input) => input.path)).size, build.artifacts.length);
  const artifact = createHash('sha256');
  for (const input of build.artifacts) {
    const bytes = await readFile(contained(build.artifactRoot, input.path));
    assert.equal(bytes.length, input.bytes);
    assert.equal(sha(bytes), input.sha256);
    artifact.update(input.path).update(bytes);
  }
  assert.equal(artifact.digest('hex'), build.artifactHash);
  const native = await readFile(build.nativeArchivePath);
  assert.equal(native.length, build.nativeBytes);
  assert.equal(sha(native), build.nativeHash);
  if (!historical) {
    const current = await readFile(build.nativePath);
    assert.equal(current.length, build.nativeBytes);
    assert.equal(sha(current), build.nativeHash);
  }
  const proofBytes = await readFile(
    contained(build.archiveRoot, 'Docs/Evidence/029-vehicle-damage/reference-provenance.json'),
  );
  assert.equal(sha(proofBytes), build.referenceProvenanceHash);
  const proof = JSON.parse(proofBytes);
  assert.equal(proof.publishedCommit, 'f1c6428034c1d52ae0eb3e88857fb6f61ffd43ce');
  assert.equal(proof.allPublishedRuntimeSourcesMatched, true);
  assert.equal(proof.inputs.length, 22);
  assert.equal(new Set(proof.inputs.map((input) => input.path)).size, 22);
  for (const input of proof.inputs) {
    assert.match(input.path, /^src\/(vehicles|sessions|settings|input)\/[a-zA-Z0-9_./-]+$/);
    assert.ok(!input.path.includes('..'));
    const bytes = await readFile(contained(build.archiveRoot, input.archivePath));
    assert.equal(bytes.length, input.executedBytes);
    assert.equal(sha(bytes), input.executedSha256);
    const blob = execFileSync('git', ['show', `${proof.publishedCommit}:${input.path}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(blob.length, input.gitBlobBytes);
    assert.equal(sha(blob), input.gitBlobSha256);
    assert.equal(input.byteIdentical, bytes.equals(blob));
    assert.equal(input.eolOnlyDifference, !bytes.equals(blob));
    assert.equal(
      sha(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))),
      sha(Buffer.from(blob.toString('utf8').replaceAll('\r\n', '\n'))),
    );
  }
  return {
    mode: historical ? 'HISTORICAL_ARCHIVE_ONLY' : 'CURRENT_SOURCE_AND_ARCHIVE',
    sources: build.inputs.length,
    artifacts: build.artifacts.length,
    publishedReferenceFiles: 22,
    sourceHash: build.sourceHash,
    artifactHash: build.artifactHash,
    nativeHash: build.nativeHash,
  };
}
