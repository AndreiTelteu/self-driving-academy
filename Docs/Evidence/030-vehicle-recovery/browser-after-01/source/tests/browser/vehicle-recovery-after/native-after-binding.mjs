import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const NATIVE_AFTER = Object.freeze({
  folder: 'Docs/Evidence/030-vehicle-recovery/after-04',
  sourceHash: '803cde501e63e44c786a6a4e942a0a10cd2c4a6fe1ded8d14e40b13c64ba5cd5',
  nativeHash: '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0',
  manifestHash: '25a6bd3b4c9588bceb4b42c5141a092e1a7ceb373878bcc4e00b68384aa92241',
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const production = (rows) => {
  const result = rows
    .filter((row) => row.path.startsWith('src/'))
    .map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  assert(result.length > 0 && new Set(result.map((row) => row.path)).size === result.length);
  for (const row of result) {
    assert(!row.path.includes('..') && !row.path.includes('\\'));
    assert(Number.isSafeInteger(row.bytes) && row.bytes >= 0);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
  }
  return result;
};

/** Raw native reader validates its complete historical capture; this additional proof binds
 * every production input to the current browser build, allowing honest auxiliary differences.
 */
export function nativeProductionBinding(nativeManifest, buildInputs, manifestHash, nativeHash) {
  assert.equal(manifestHash, NATIVE_AFTER.manifestHash);
  assert.equal(nativeManifest.sourceHash, NATIVE_AFTER.sourceHash);
  assert.equal(nativeManifest.phase, 'AFTER');
  assert.equal(
    nativeManifest.originalBeforeSourceHash,
    'e7e5241caa9ef9c5ac1a27460defc9de679a86de3c6a3287eb8409fe3e27d755',
  );
  assert.equal(nativeManifest.native.sha256, NATIVE_AFTER.nativeHash);
  assert.equal(nativeManifest.native.bytes, 4340292);
  assert.equal(nativeHash, NATIVE_AFTER.nativeHash);
  const rows = production(nativeManifest.inputs);
  assert.deepEqual(
    production(buildInputs),
    rows,
    'Browser production differs from accepted native AFTER4',
  );
  return {
    ...NATIVE_AFTER,
    validation: 'HISTORICAL_NATIVE_CAPTURE_WITH_BROWSER_PRODUCTION_BYTES',
    production: rows,
    productionIdentity: hash(JSON.stringify(rows)),
  };
}

export async function readNativeAfterBinding(buildInputs, historical = false) {
  const bytes = await readFile(NATIVE_AFTER.folder + '/manifest.json');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.native.archiveRelativePath, 'native/rapier.mjs');
  const native = await readFile(NATIVE_AFTER.folder + '/native/rapier.mjs');
  assert.equal(native.length, 4340292);
  const binding = nativeProductionBinding(manifest, buildInputs, hash(bytes), hash(native));
  for (const row of binding.production) {
    const archived = await readFile(NATIVE_AFTER.folder + '/source/' + row.path);
    assert.equal(archived.length, row.bytes);
    assert.equal(hash(archived), row.sha256);
    if (!historical) {
      const current = await readFile(row.path);
      assert.equal(current.length, row.bytes);
      assert.equal(hash(current), row.sha256);
    }
  }
  return binding;
}
