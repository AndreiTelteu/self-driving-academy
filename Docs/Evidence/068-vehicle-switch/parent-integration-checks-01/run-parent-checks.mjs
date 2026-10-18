import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
const base = 'Docs/Evidence/068-vehicle-switch';
const folder = base + '/parent-integration-checks-01';
mkdirSync(folder, { recursive: true });
const specs = [
  ['project-check', 'npm.cmd', ['run', 'check']],
  ['native-after', 'node', [base + '/verify-after.mjs', '--historical']],
  ['browser-before', 'node', [base + '/verify-browser-before-wire-v2.mjs', '--historical']],
  ['browser-short', 'node', [base + '/verify-browser-after-short-v2.mjs', '--historical']],
  ['browser-full', 'node', [base + '/verify-browser-steady-v4.mjs', '--historical']],
];
const results = [];
for (const [name, command, args] of specs) {
  const startedAt = new Date().toISOString();
  const r = spawnSync(command, args, { encoding: 'utf8', shell: command === 'npm.cmd', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(folder + '/' + name + '.log', (r.stdout ?? '') + (r.stderr ?? ''), { flag: 'wx' });
  results.push({ name, command, args, startedAt, endedAt: new Date().toISOString(), exit: r.status, error: r.error?.message ?? null });
  writeFileSync(folder + '/results.json', JSON.stringify(results, null, 2) + '\n');
  console.log(name, r.status);
  assert.equal(r.status, 0, name + ' failed; see preserved log');
}
const captured = readFileSync(base + '/browser-steady-v4-01/source-at-capture/src/input/vehicle-selection.ts', 'utf8');
const current = readFileSync('src/input/vehicle-selection.ts', 'utf8');
const normalized = s => s.replaceAll('\r\n', '\n');
assert.equal(normalized(captured).replace('../vehicles/body-port', '../vehicles'), normalized(current));
const emitted = s => stripTypeScriptTypes(normalized(s), { mode: 'transform' });
assert.equal(emitted(captured), emitted(current));
const runtime = { status: 'PASS', delta: 'Only type import changes; public index exports owner', sha256: createHash('sha256').update(emitted(current)).digest('hex') };
writeFileSync(folder + '/runtime-proof.json', JSON.stringify(runtime, null, 2) + '\n', { flag: 'wx' });
// Git raw object hashes audit all durable evidence files, including preserved failures.
const rows = execFileSync('git', ['ls-files', '-s', '--', base], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n').map(line => {
  const match = /^(\d+) ([a-f0-9]+) 0\t(.+)$/.exec(line);
  assert.ok(match, 'Only resolved normal files');
  return { path: match[3], indexObject: match[2] };
});
assert.ok(rows.length > 2000);
const rawHashes = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { input: rows.map(r => r.path).join('\n') + '\n', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n');
assert.equal(rawHashes.length, rows.length);
for (let i = 0; i < rows.length; i++) assert.equal(rawHashes[i], rows[i].indexObject, 'Raw Git blob mismatch: ' + rows[i].path);
writeFileSync(folder + '/raw-index-proof.json', JSON.stringify({ status: 'PASS', files: rows.length, audit: 'Every indexed evidence blob equals raw checkout; no normalization accepted', runtime }, null, 2) + '\n', { flag: 'wx' });
console.log('ALL_PARENT_GATES_PASS', rows.length);
