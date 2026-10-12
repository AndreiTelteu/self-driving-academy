// Check publication bytes against the measured source and artifact bindings.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = 'Docs/Evidence/048-following';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rows = [];
function staged(path, expected) {
  const bytes = execFileSync('git', ['cat-file', 'blob', `:${path}`], {
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(bytes.length, expected.bytes, path);
  assert.equal(hash(bytes), expected.sha256, path);
  rows.push({ path, ...expected });
}
for (const label of ['full-before-v2', 'full-after-v3', 'native-driving-v4', 'browser-v7']) {
  const folder = `${root}/${label}`;
  const bytes = await readFile(`${folder}/binding.json`);
  const binding = JSON.parse(bytes);
  staged(`${folder}/binding.json`, { bytes: bytes.length, sha256: hash(bytes) });
  for (const item of binding.inputs) {
    const archived = `${folder}/source/${item.path}`;
    try {
      await readFile(archived);
      staged(archived, item);
    } catch (error) {
      assert.equal(error.code, 'ENOENT', archived);
      const original = execFileSync('git', ['show', `${binding.prerequisiteCommit}:${item.path}`]);
      assert.equal(original.length, item.bytes, item.path);
      assert.equal(hash(original), item.sha256, item.path);
    }
    if (['native-driving-v4', 'browser-v7'].includes(label)) staged(item.path, item);
  }
  for (const item of binding.artifacts ?? []) staged(`${folder}/artifact/${item.path}`, item);
  if (binding.native) {
    const path = binding.native.durableArtifact ?? `${folder}/native/rapier.mjs`;
    staged(path, {
      bytes: (await readFile(path)).length,
      sha256: binding.native.sha256,
    });
  }
}
const summaryBytes = await readFile(`${root}/full-comparison-summary-v3.json`);
const summary = JSON.parse(summaryBytes);
assert.equal(summary.status, 'PASS');
staged(`${root}/full-comparison-summary-v3.json`, {
  bytes: summaryBytes.length,
  sha256: hash(summaryBytes),
});
for (const item of summary.currentProductionInputs) staged(item.path, item);
await writeFile(
  `${root}/staged-byte-proof.json`,
  JSON.stringify(
    {
      status: 'PASS',
      checkedAt: new Date().toISOString(),
      headBeforeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      rows,
      scope:
        'Git index bytes match final measured product, archived sources and browser artifacts; numerical readers are separate.',
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(JSON.stringify({ status: 'PASS', checkedBindings: rows.length }));
