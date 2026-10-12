// Bind published index bytes to measured archives, without modifying the index.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = 'Docs/Evidence/047-longitudinal-control';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const labels = process.argv.slice(2);
assert(labels.length > 0);
const rows = [];
function staged(path, expected) {
  const bytes = execFileSync('git', ['cat-file', 'blob', `:${path}`], {
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(bytes.length, expected.bytes, path);
  assert.equal(hash(bytes), expected.sha256, path);
  rows.push({ path, bytes: bytes.length, sha256: hash(bytes) });
}
for (const label of labels) {
  assert(/^[a-z0-9-]+$/.test(label));
  const folder = `${root}/${label}`;
  const bindingBytes = await readFile(`${folder}/binding.json`);
  const binding = JSON.parse(bindingBytes);
  staged(`${folder}/binding.json`, {
    bytes: bindingBytes.length,
    sha256: hash(bindingBytes),
  });
  for (const item of binding.inputs) staged(`${folder}/source/${item.path}`, item);
  // Final product source bindings; old captures are intentionally historical.
  if (['after-v8', 'native-driving-v3', 'browser-build-v3'].includes(label))
    for (const item of binding.inputs) staged(item.path, item);
  if (binding.native) staged(`${folder}/native/rapier.mjs`, binding.native);
  for (const item of binding.artifacts ?? []) staged(`${folder}/artifact/${item.path}`, item);
  if (label === 'full-after-v4' && binding.origin?.phase === 'after')
    for (const item of binding.origin.originalInputs) staged(item.path, item);
}
const proof = {
  status: 'PASS',
  checkedAt: new Date().toISOString(),
  headBeforeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  labels,
  rows,
  scope: 'Exact Git index/archive bytes and final product inputs; numeric readers remain separate.',
};
await writeFile(`${root}/staged-byte-proof.json`, JSON.stringify(proof, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS', labels, rows: rows.length }));
