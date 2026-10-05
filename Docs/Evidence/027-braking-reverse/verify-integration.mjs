// Separate archive/current/GitINDEX proof after staging/integration; original strict source verifier remains strict.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const folder = 'Docs/Evidence/027-braking-reverse';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'),'utf8');
const blob = path => execFileSync('git',['cat-file','blob',`:${path}`],{maxBuffer:32*1024*1024});
const rows=[], records=[];
for(const [name,archive] of [['after-node','source-after'],['calibration','source-calibration'],['build-manifest','source-at-capture']]) {
  const record=JSON.parse(await readFile(`${folder}/${name}.json`,'utf8')), aggregate=createHash('sha256');
  for(const input of record.inputs) {
    const path=typeof input==='string'?input:input.path, archivePath=`${folder}/${archive}/${path}`;
    const archived=await readFile(archivePath), current=await readFile(path), staged=blob(path);
    if(typeof input!=='string'){assert.equal(archived.length,input.bytes);assert.equal(hash(archived),input.sha256);}
    aggregate.update(path).update(archived);
    const row={capture:name,path,archivedBytes:archived.length,currentBytes:current.length,archivedSha256:hash(archived),
      currentSha256:hash(current),gitBlobSha256:hash(staged),currentByteExact:current.equals(archived),
      lfNormalizedExact:lf(current).equals(lf(archived)),gitBlobExact:staged.equals(archived),archiveGitBlobExact:blob(archivePath).equals(archived)};
    rows.push(row);
    assert(row.lfNormalizedExact,`Semantic difference beyond CRLF/LF: ${name}/${path}`);
    assert(row.gitBlobExact,`Current staged blob differs: ${name}/${path}`);
    assert(row.archiveGitBlobExact,`Archived staged blob differs: ${archivePath}`);
  }
  assert.equal(aggregate.digest('hex'),record.sourceHash);
  records.push({capture:name,sourceHash:record.sourceHash,inputs:record.inputs.length});
}
const native=await readFile(`${folder}/native/rapier.mjs`),after=JSON.parse(await readFile(`${folder}/after-node.json`,'utf8'));
assert.equal(native.length,after.nativeArtifact.bytes);assert.equal(hash(native),after.nativeArtifact.sha256);assert(blob(`${folder}/native/rapier.mjs`).equals(native));
const result={status:'PASS',verifiedAt:new Date().toISOString(),records,rows,currentExactRows:rows.filter(r=>r.currentByteExact).length,
  eolOnlyRows:rows.filter(r=>!r.currentByteExact),gitBlobExactRows:rows.length,
  scope:'Separate114 archived AFTER/calibration/browser rows vs current working bytes and GitINDEX. Only CRLF/LF differences allowed. All archived aggregate hashes and staged archive/native bytes must match. Added unrelated045 sources are not executed inputs in027 closure; no claim current source digest matches when checkout EOL differs.'};
await writeFile(`${folder}/integration-source-audit.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({status:'PASS',rows:rows.length,currentExactRows:result.currentExactRows,eolOnlyRows:result.eolOnlyRows.map(r=>`${r.capture}/${r.path}`),gitBlobExactRows:rows.length}));
