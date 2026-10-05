// Separate integration proof. Does not relax original strict current-source verification.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const folder = 'Docs/Evidence/045-behavior-fsm';
const report = JSON.parse(await readFile(`${folder}/after-v2.json`, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
const rows = [],
  aggregate = createHash('sha256');
for (const input of report.inputs) {
  const archived = await readFile(`${folder}/source-after-v2/${input.path}`),
    current = await readFile(input.path);
  assert.equal(archived.length, input.bytes);
  assert.equal(hash(archived), input.sha256);
  aggregate.update(input.path).update(archived);
  const staged = execFileSync('git', ['cat-file', 'blob', `:${input.path}`], {
    maxBuffer: 32 * 1024 * 1024,
  });
  const normalizedMatch = lf(archived).equals(lf(current)),
    gitBlobExact = staged.equals(archived);
  rows.push({
    path: input.path,
    archivedBytes: archived.length,
    currentBytes: current.length,
    archivedSha256: hash(archived),
    currentSha256: hash(current),
    gitBlobSha256: hash(staged),
    currentByteExact: current.equals(archived),
    lfNormalizedExact: normalizedMatch,
    gitBlobExact,
  });
  assert(normalizedMatch, `Semantic integration difference beyond CRLF/LF: ${input.path}`);
  assert(gitBlobExact, `Staged Git blob differs from actual capture bytes: ${input.path}`);
  const archiveBlob = execFileSync(
    'git',
    ['cat-file', 'blob', `:${folder}/source-after-v2/${input.path}`],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  assert(archiveBlob.equals(archived), `Staged archive bytes differ: ${input.path}`);
}
assert.equal(aggregate.digest('hex'), report.sourceHash);
const native = await readFile(`${folder}/native/rapier.mjs`);
assert.equal(native.length, report.nativeArtifact.bytes);
assert.equal(hash(native), report.nativeArtifact.sha256);
assert(
  execFileSync('git', ['cat-file', 'blob', `:${folder}/native/rapier.mjs`], {
    maxBuffer: 32 * 1024 * 1024,
  }).equals(native),
);
const result = {
  status: 'PASS',
  verifiedAt: new Date().toISOString(),
  afterSourceHash: report.sourceHash,
  currentExactRows: rows.filter((row) => row.currentByteExact).length,
  eolOnlyRows: rows.filter((row) => !row.currentByteExact),
  gitBlobExactRows: rows.length,
  rows,
  scope:
    'Separate raw archive/current/index proof. Only CRLF versus LF differences permitted; any semantic or staged/archive difference fails. Original strict verifier remains unchanged in meaning; this does not claim strict current-byte PASS when EOL differs.',
};
await writeFile(`${folder}/integration-source-audit.json`, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    status: result.status,
    rows: rows.length,
    currentExactRows: result.currentExactRows,
    eolOnlyRows: result.eolOnlyRows.map((row) => row.path),
    gitBlobExactRows: result.gitBlobExactRows,
  }),
);
