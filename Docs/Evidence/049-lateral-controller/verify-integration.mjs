// Main integration proof kept separate from the original strict capture verifiers.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const folder = 'Docs/Evidence/049-lateral-controller';
const output = `${folder}/integration-source-audit.json`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
const captures = [['after-v2', 'source-after-v2'], ['calibration-v3', 'source-calibration-v3'], ['build-manifest', 'source-at-capture']];
const records = await Promise.all(captures.map(async ([name, archive]) => ({name, archive,
  report: JSON.parse(await readFile(`${folder}/${name}.json`, 'utf8'))})));
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
const paths = new Set(staged.filter(path => path.startsWith(`${folder}/`) && path !== output));
for (const {archive, report} of records) for (const entry of report.inputs) {
  const path = typeof entry === 'string' ? entry : entry.path;
  paths.add(path); paths.add(`${folder}/${archive}/${path}`);
}
const names = [...paths].sort();
const bytes = execFileSync('git', ['cat-file', '--batch'], {input:names.map(path=>`:${path}\n`).join(''), maxBuffer:512*1024*1024});
let offset = 0;
const blobs = new Map();
for (const path of names) {
  const end = bytes.indexOf(10, offset);
  const match = /^[0-9a-f]+ blob (\d+)$/.exec(bytes.subarray(offset,end).toString());
  assert(match, `Missing staged file: ${path}`);
  const size = Number(match[1]);
  blobs.set(path, bytes.subarray(end+1,end+1+size));
  assert.equal(bytes[end+1+size],10); offset=end+size+2;
}
assert.equal(offset,bytes.length);
for (const path of staged.filter(path=>path.startsWith(`${folder}/`) && path!==output))
  assert(blobs.get(path).equals(await readFile(path)), `Evidence Git-index difference: ${path}`);
const rows = [];
for (const {name, archive, report} of records) {
  const aggregate = createHash('sha256');
  for (const entry of report.inputs) {
    const path = typeof entry === 'string' ? entry : entry.path;
    const archived = await readFile(`${folder}/${archive}/${path}`), current = await readFile(path);
    if (typeof entry !== 'string') { assert.equal(archived.length,entry.bytes); assert.equal(hash(archived),entry.sha256); }
    aggregate.update(path).update(archived);
    assert(blobs.get(path).equals(archived), `Accepted runtime Git-index difference: ${name}/${path}`);
    assert(blobs.get(`${folder}/${archive}/${path}`).equals(archived), `Archive Git-index difference: ${path}`);
    const exact = current.equals(archived);
    if (!exact) { assert.equal(path,'Docs/performance-budgets.json'); assert(lf(current).equals(lf(archived))); }
    rows.push({capture:name,path,bytes:archived.length,sha256:hash(archived),currentByteExact:exact,gitIndexByteExact:true});
  }
  assert.equal(aggregate.digest('hex'),report.sourceHash);
}
const result = {status:'PASS',verifiedAt:new Date().toISOString(),acceptedRuntimeRows:rows.length,
  currentExactRows:rows.filter(row=>row.currentByteExact).length,eolOnlyRows:rows.filter(row=>!row.currentByteExact),rows,
  scope:'Separate main/Git-index proof. Runtime and archives byte exact in Git; only the existing budget file may differ by CRLF/LF in the checkout. Original strict capture validators remain unchanged. Audit output excluded from its own byte comparison.'};
await writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,rows:undefined}));
