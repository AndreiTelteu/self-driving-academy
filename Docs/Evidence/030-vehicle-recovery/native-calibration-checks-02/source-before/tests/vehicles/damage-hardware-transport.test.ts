import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import {
  validateLoopbackPost,
  readBoundedJson,
  PartCapacityError,
} from '../browser/vehicle-damage/hardware-transport';
import { createHardwareStore } from '../browser/vehicle-damage/hardware-store';
import type { StoredHardwareBuild } from '../browser/vehicle-damage/hardware-store';
import type { HardwarePartIdentity, MetricPart } from '../browser/vehicle-damage/hardware-parts';
import { metricPartId } from '../browser/vehicle-damage/hardware-parts';
async function* chunks(bytes: Uint8Array) {
  yield bytes.subarray(0, bytes.length / 2);
  yield bytes.subarray(bytes.length / 2);
}
test('actual server transport seam rejects wrong origin/content type and bounded multipart overflow', async () => {
  assert.doesNotThrow(() =>
    validateLoopbackPost('http://localhost:5199', 'application/json', 5199),
  );
  assert.doesNotThrow(() =>
    validateLoopbackPost('http://127.0.0.1:5199', 'application/json', 5199),
  );
  for (const origin of [
    null,
    'null',
    'http://example.com:5199',
    'http://localhost:5200',
    'http://localhost:5199.evil.test',
  ])
    assert.throws(() => validateLoopbackPost(origin, 'application/json', 5199), /same-origin/);
  assert.throws(
    () => validateLoopbackPost('http://localhost:5199', 'text/plain', 5199),
    /content type/,
  );
  const exact = new TextEncoder().encode(JSON.stringify('x'.repeat(128 * 1024 - 2)));
  assert.equal(exact.length, 128 * 1024);
  assert.equal(await readBoundedJson(chunks(exact)), 'x'.repeat(128 * 1024 - 2));
  await assert.rejects(readBoundedJson(chunks(new Uint8Array(128 * 1024 + 1))), PartCapacityError);
});
test('immutable real store preserves wx partials and rejects source/run/canonical sequence drift', async () => {
  const parent = resolve('.pbi-validation-029/unit-store');
  await mkdir(parent, { recursive: true });
  const folder = await mkdtemp(resolve(parent, 'case-'));
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  try {
    const sourcePath = resolve(folder, 'source.txt'),
      archiveRoot = resolve(folder, 'archive'),
      artifactRoot = resolve(folder, 'artifacts'),
      captures = resolve(folder, 'captures'),
      nativePath = resolve(folder, 'native.bin'),
      nativeArchivePath = resolve(folder, 'archived-native.bin');
    await mkdir(archiveRoot);
    await mkdir(artifactRoot);
    await mkdir(captures);
    const source = Buffer.from('Unit source; no native execution'),
      artifact = Buffer.from('Unit artifact'),
      native = Buffer.from('Unit dependency bytes; never loaded');
    await writeFile(sourcePath, source);
    // Store source paths are actual relative paths so archived closure stays portable.
    const relativePath = sourcePath.slice(process.cwd().length + 1).replaceAll('\\', '/');
    await mkdir(resolve(archiveRoot, relativePath, '..'), { recursive: true });
    await writeFile(resolve(archiveRoot, relativePath), source);
    await writeFile(resolve(artifactRoot, 'bundle.txt'), artifact);
    await writeFile(nativePath, native);
    await writeFile(nativeArchivePath, native);
    const sourceHash = createHash('sha256').update(relativePath).update(source).digest('hex'),
      artifactHash = createHash('sha256').update('bundle.txt').update(artifact).digest('hex');
    const build: StoredHardwareBuild = {
      sourceHash,
      artifactHash,
      nativeHash: hash(native),
      referenceProvenanceHash: 'f'.repeat(64),
      archivedAt: new Date().toISOString(),
      inputs: [{ path: relativePath, bytes: source.length, sha256: hash(source) }],
      artifacts: [{ path: 'bundle.txt', bytes: artifact.length, sha256: hash(artifact) }],
      archiveRoot,
      artifactRoot,
      nativePath,
      nativeArchivePath,
      nativeBytes: native.length,
    };
    const store = createHardwareStore(build, captures);
    const started = await store.start('AUTO');
    const identity: HardwarePartIdentity = {
      ...started,
      arm: 'PUBLISHED_027',
      pair: 0,
      observer: false,
      runOrdinal: 0,
      sourceHash,
      artifactHash,
      nativeHash: hash(native),
    };
    const part: MetricPart = {
        version: '029-metric-part-v1',
        identity,
        metric: 'frameIntervalMs',
        distribution: null,
      },
      partId = metricPartId(part);
    await store.part({ partId, part });
    const saved = await readFile(resolve(captures, started.captureId, `${partId}.json`));
    await assert.rejects(store.part({ partId, part }), /EEXIST/);
    assert.deepEqual(await readFile(resolve(captures, started.captureId, `${partId}.json`)), saved);
    await assert.rejects(
      store.part({
        partId,
        part: { ...part, identity: { ...identity, runOrdinal: 1, arm: 'CURRENT_029' } },
      }),
      /expected sequence/,
    );
    await writeFile(sourcePath, 'drift');
    await assert.rejects(store.verifySources(), /source drift/);
    assert.deepEqual(await readFile(resolve(captures, started.captureId, `${partId}.json`)), saved);
  } finally {
    assert.ok(
      resolve(folder).startsWith(parent + sep),
      'Deletion stays within designated unit workspace',
    );
    await rm(folder, { recursive: true, force: true });
  }
});
