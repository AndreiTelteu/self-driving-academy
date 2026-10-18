// Actual child only: pinned original inputs + live and durable derived bytes/AST transform proof.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { derive } from './prepare-manual-segments-record-stage-diagnostic.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const output = 'Docs/Evidence/069-manual-segments/record-stage-diagnostic-01';
const runtime = resolve('.pbi-validation-069/record-stage-diagnostic-01/runtime');
export const EXTRA_COPY_PATHS = Object.freeze([
  'scripts/manual-segments-record-stage-observer.mjs',
  'scripts/manual-segments-record-stage-observer.d.mts',
  'scripts/manual-segments-record-stage-guard.mjs',
]);
export const CHANGED_ROOTS = Object.freeze([
  'src/app/manual-segment-bridge.ts',
  'src/telemetry/intervention-lifecycle.ts',
  'src/input/control-authority.ts',
  'src/vehicles/controller.ts',
  'src/telemetry/intervention-admission.ts',
  'scripts/manual-segments-after-records.mjs',
  'scripts/benchmark-manual-segments-after.mjs',
]);
export function verifyCopyBytes(row, live, archived) {
  assert.equal(live.length, row.bytes);
  assert.equal(sha(live), row.sha256);
  assert.deepEqual(archived, live);
}
export function validateProofRows(proof, original) {
  assert.equal(proof.scope, 'INSTRUMENTED_COPY_ONLY_NO_ACCEPTANCE');
  assert.equal(original.inputs.length, 156);
  assert.equal(
    original.sourceHash,
    '683584eaa844008ec047546078c2ab2ad8e9b9c7c89cc9334a23b0ad3b1d06dd',
  );
  assert.equal(
    original.checkedProductFingerprint,
    '924c07641a8cd93539479d5e1e597936e259e8f680d462e22acb64b21ad1d708',
  );
  assert.equal(new Set(proof.inputs.map((r) => r.path)).size, 159);
  assert.deepEqual(
    proof.inputs.map((r) => r.path).sort(),
    [...original.inputs.map((r) => r.path), ...EXTRA_COPY_PATHS].sort(),
  );
  assert.equal(proof.derivationCount, 7);
  assert.equal(proof.sourceHash, sha(Buffer.from(JSON.stringify(proof.inputs))));
  for (const row of proof.inputs) {
    assert(
      typeof row.path === 'string' &&
        !row.path.includes('..') &&
        !row.path.startsWith('/') &&
        !row.path.includes('\\'),
    );
    assert(Number.isSafeInteger(row.bytes) && row.bytes > 0 && /^[a-f0-9]{64}$/.test(row.sha256));
  }
}
export async function verifyPreflight() {
  assert.equal(
    resolve('.').replaceAll('\\', '/'),
    'F:/Sites/self-driving-academy/.worktrees/manual-segments-01',
  );
  const manifestBytes = await readFile(
    'Docs/Evidence/069-manual-segments/native-after-03/manifest.json',
  );
  assert.equal(
    sha(manifestBytes),
    '028fb8f94cf612bf6be101092646b912867c5d1137d1ee5ca5aa39edc6e8732d',
  );
  const original = JSON.parse(manifestBytes);
  const receiptBytes = await readFile(
    'Docs/Evidence/069-manual-segments/parsed-record-reuse-checks-01/results-final.json',
  );
  assert.equal(
    sha(receiptBytes),
    'dbc4e9554c2200da726dbcdce024f7916216513c24829a2c5faa0e482eb6d25c',
  );
  const receipt = JSON.parse(receiptBytes);
  for (const row of receipt.source) {
    const b = await readFile(row.path);
    assert.equal(b.length, row.bytes);
    assert.equal(sha(b), row.sha256);
  }
  const proof = JSON.parse(await readFile(output + '/runtime-proof.json'));
  assert.deepEqual(
    proof.tools.map((r) => r.path),
    [
      'scripts/prepare-manual-segments-record-stage-diagnostic.mjs',
      'scripts/verify-manual-segments-record-stage-preflight.mjs',
      'scripts/verify-manual-segments-record-stage-diagnostic.mjs',
    ],
  );
  for (const tool of proof.tools) {
    const live = await readFile(tool.path),
      archived = await readFile(resolve(output, 'tool-source', tool.path));
    assert.equal(live.length, tool.bytes);
    assert.equal(sha(live), tool.sha256);
    assert.deepEqual(live, archived);
  }
  validateProofRows(proof, original);
  assert.equal(proof.runtime, runtime);
  const changed = [];
  for (const row of original.inputs) {
    const b = await readFile(
      'Docs/Evidence/069-manual-segments/native-after-03/source/' + row.path,
    );
    assert.equal(b.length, row.bytes);
    assert.equal(sha(b), row.sha256);
    const expected = /\.(ts|mjs)$/.test(row.path)
      ? Buffer.from(await derive(row.path, b.toString()))
      : b;
    const actual = proof.inputs.find((r) => r.path === row.path);
    assert.equal(expected.length, actual.bytes);
    assert.equal(sha(expected), actual.sha256);
    if (!b.equals(expected)) changed.push(row.path);
  }
  assert.deepEqual(changed.sort(), [...CHANGED_ROOTS].sort());
  for (const row of proof.inputs) {
    const live = await readFile(resolve(runtime, row.path)),
      archived = await readFile(resolve(output, 'runtime-source', row.path));
    verifyCopyBytes(row, live, archived);
    if (EXTRA_COPY_PATHS.includes(row.path)) assert.deepEqual(await readFile(row.path), live);
  }
  const originalSource = await readFile(output + '/native/rapier.mjs'),
    installed = await readFile('node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs');
  assert.equal(installed.length, 4340292);
  assert.equal(sha(installed), '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0');
  assert.deepEqual(originalSource, installed);
  return {
    status: 'PASS_COPY_BYTES_AND_DERIVATION_ONLY',
    originalManifestSource: original.sourceHash,
    executedCopySource: proof.sourceHash,
    paths: 159,
    nativeSha256: sha(installed),
    scope: 'No archivedcode/native execution; terminalAST derivation child only',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  console.log(JSON.stringify(await verifyPreflight()));
