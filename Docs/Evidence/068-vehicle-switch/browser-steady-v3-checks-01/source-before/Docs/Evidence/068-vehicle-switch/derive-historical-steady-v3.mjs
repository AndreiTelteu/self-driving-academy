// SOURCE draft. Execute only after parent grants build/provenance preparation.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const cwd = resolve('.').replaceAll('\\', '/');
assert.equal(cwd, 'F:/Sites/self-driving-academy/.worktrees/vehicle-switch-01');
assert.equal(
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
  cwd,
);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-switch-01',
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const folder = 'Docs/Evidence/068-vehicle-switch',
  archived = folder + '/browser-before/source-at-capture';
const m = JSON.parse(await readFile(folder + '/browser-before/build-manifest.json', 'utf8'));
assert.equal(m.sourceHash, '0e215d02f8451a78a533ca87ebe44eddc1a197b8c8f29cff40c5f7e5963ae585');
const aggregate = createHash('sha256'),
  rows = [];
for (const path of m.inputs) {
  const bytes = await readFile(archived + '/' + path);
  aggregate.update(path).update(bytes);
  rows.push({
    originalPath: path,
    archivedPath: archived + '/' + path,
    bytes: bytes.length,
    sha256: hash(bytes),
  });
}
assert.equal(aggregate.digest('hex'), m.sourceHash);
const n = JSON.parse(await readFile(folder + '/corrected-reference-v2/before.json', 'utf8'));
assert.equal(n.sourceHash, 'fcb9a71661d7630cfbb137ba08b176fef1a6ed0927ed50c4e438b0d12809cace');
const nativeAggregate = createHash('sha256');
for (const row of n.inputs) {
  const bytes = await readFile(folder + '/corrected-reference-v2/source-before/' + row.path);
  assert.equal(bytes.length, row.bytes);
  assert.equal(hash(bytes), row.sha256);
  nativeAggregate.update(row.path).update(bytes);
}
assert.equal(nativeAggregate.digest('hex'), n.sourceHash);
const commonPaths = ['src/vehicles/controller.ts', 'src/vehicles/controller-port.ts'];
const common = [];
for (const path of commonPaths) {
  const bytes = await readFile(path);
  const published = execFileSync(
    'git',
    ['show', 'ad32db9c609cce1132669c95312ae202a62b87ed:' + path],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  // Known checkout EOL is explicitly distinguished from immutable historical rawbytes.
  assert.equal(
    bytes.toString('utf8').replaceAll('\r\n', '\n'),
    published.toString('utf8').replaceAll('\r\n', '\n'),
  );
  common.push({
    path,
    actualBytes: bytes.length,
    actualSha256: hash(bytes),
    publishedBlobSha256: hash(published),
    byteExact: bytes.equals(published),
    contentEqualLf: true,
  });
}
await writeFile(
  folder + '/historical-steady-derivation-v2-01.json',
  JSON.stringify(
    {
      status: 'DERIVED_SOURCE_ONLY',
      createdAt: new Date().toISOString(),
      historicalSourceHash: m.sourceHash,
      nativeBeforeHash: n.sourceHash,
      rows,
      common,
      originalCommit: m.commit,
      sharedRuntimeCommit: 'ad32db9c609cce1132669c95312ae202a62b87ed',
      disposition:
        'Later historical selection-composition comparison, not chronological PRE068 capture. Original native/short gates remain independent. Availability undefined. Existing archived raw source files are consumed directly, without rewritten imports; explicit host factory injection supplies common controller/native runtime.',
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log('Historical source derivation written, no hardware acceptance');
