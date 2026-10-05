import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

// Integration provenance audit, distinct from the original byte-strict verifier.
// The canonical pending merge index is the code being proposed for delivery.
const folder = 'Docs/Evidence/025-keyboard-input';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => {
  const decoded = bytes.toString('utf8');
  assert(Buffer.from(decoded).equals(bytes), 'Expected valid UTF-8 source bytes');
  return Buffer.from(decoded.replace(/\r\n/g, '\n'));
};
const records = [
  ['after-node.json', 'source-after', 'inputs'],
  ['calibration.json', 'source-calibration', 'inputPaths'],
  ['build-manifest.json', 'source-at-capture', 'inputs'],
];
const rows = [];
const identities = [];
for (const [name, archive, inputKey] of records) {
  const record = JSON.parse(await readFile(`${folder}/${name}`, 'utf8'));
  const archivedSource = createHash('sha256');
  const indexSource = createHash('sha256');
  const currentSource = createHash('sha256');
  for (const input of record[inputKey]) {
    const path = typeof input === 'string' ? input : input.path;
    const archived = await readFile(`${folder}/${archive}/${path}`);
    const current = await readFile(path);
    const index = execFileSync('git', ['show', `:${path}`], {
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (typeof input !== 'string') {
      assert.equal(sha256(archived), input.sha256, `Archive hash: ${path}`);
      assert.equal(archived.length, input.bytes, `Archive length: ${path}`);
    }
    assert(index.equals(archived), `Canonical staged Git blob differs: ${path}`);
    assert(lf(current).equals(lf(archived)), `Difference beyond CRLF/LF: ${path}`);
    archivedSource.update(path).update(archived);
    indexSource.update(path).update(index);
    currentSource.update(path).update(current);
    rows.push({
      record: name,
      path,
      archiveSha256: sha256(archived),
      currentSha256: sha256(current),
      canonicalIndexBlobSha256: sha256(index),
      archiveBytes: archived.length,
      currentBytes: current.length,
      canonicalIndexBlobBytes: index.length,
      currentExact: archived.equals(current),
      currentLfNormalizedEqual: true,
      canonicalIndexBlobExact: true,
      extraCrBytes: current.length - archived.length,
    });
  }
  const archiveSourceHash = archivedSource.digest('hex');
  const canonicalIndexSourceHash = indexSource.digest('hex');
  assert.equal(archiveSourceHash, record.sourceHash, `Archived aggregate: ${name}`);
  assert.equal(canonicalIndexSourceHash, record.sourceHash, `Index aggregate: ${name}`);
  identities.push({
    record: name,
    capturedSourceHash: record.sourceHash,
    archiveSourceHash,
    canonicalIndexSourceHash,
    currentWorkingSourceHash: currentSource.digest('hex'),
  });
}
const differences = rows.filter((row) => !row.currentExact);
const report = {
  status: 'PASS',
  verifiedAt: new Date().toISOString(),
  scope: 'Integration audit: staged Git blobs match exact captured source bytes; canonical working files differ at most by CRLF/LF. Original byte-strict current-source verifier is unchanged and is not declared PASS.',
  originalStrictCurrentSourceMatches: differences.length === 0,
  recordInputRows: rows.length,
  uniqueInputPaths: new Set(rows.map((row) => row.path)).size,
  byteExactWorkingRows: rows.length - differences.length,
  eolOnlyWorkingRows: differences.length,
  changedWorkingPaths: [...new Set(differences.map((row) => row.path))],
  canonicalIndexBlobExactRows: rows.length,
  archivedAggregateChecks: 'PASS',
  identities,
  differences,
  rows,
};
await writeFile(`${folder}/integration-source-audit.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  status: report.status,
  recordInputRows: report.recordInputRows,
  byteExactWorkingRows: report.byteExactWorkingRows,
  eolOnlyWorkingRows: report.eolOnlyWorkingRows,
  canonicalIndexBlobExactRows: report.canonicalIndexBlobExactRows,
  originalStrictCurrentSourceMatches: report.originalStrictCurrentSourceMatches,
  changedWorkingPaths: report.changedWorkingPaths,
}));
