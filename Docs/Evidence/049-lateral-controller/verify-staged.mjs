// Strict isolated-branch staged-byte proof; integration/main checkout differences require a separate audit.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder='Docs/Evidence/049-lateral-controller';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const reports=await Promise.all(['after-v2','calibration-v3','build-manifest'].map(async name=>JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'))));
const archiveNames=['source-after-v2','source-calibration-v3','source-at-capture'];
const requests=new Set();
const staged=execFileSync('git',['diff','--cached','--name-only','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const path of staged)if(path.startsWith(`${folder}/`)) requests.add(path);
for(const report of reports)for(const input of report.inputs) requests.add(typeof input==='string'?input:input.path);
const paths=[...requests].sort();
const blobs=execFileSync('git',['cat-file','--batch'],{input:paths.map(path=>`:${path}\n`).join(''),maxBuffer:256*1024*1024});
let offset=0;
const indexed=new Map();
for(const path of paths){const end=blobs.indexOf(10,offset);assert(end>=offset);const header=blobs.subarray(offset,end).toString();const match=/^[0-9a-f]+ blob (\d+)$/.exec(header);assert(match,`${path}: ${header}`);const size=Number(match[1]);const bytes=blobs.subarray(end+1,end+1+size);assert.equal(bytes.length,size);assert.equal(blobs[end+1+size],10);indexed.set(path,bytes);offset=end+size+2;}
assert.equal(offset,blobs.length);
for(const path of staged)if(path.startsWith(`${folder}/`))assert(indexed.get(path).equals(await readFile(path)),`Evidence index byte mismatch: ${path}`);
const runtimeRows=[];
for(let n=0;n<reports.length;n++){const report=reports[n],aggregate=createHash('sha256');for(const input of report.inputs){const path=typeof input==='string'?input:input.path,bytes=await readFile(`${folder}/${archiveNames[n]}/${path}`);aggregate.update(path).update(bytes);assert(indexed.get(path).equals(bytes),`Accepted runtime index mismatch: ${path}`);runtimeRows.push({archive:archiveNames[n],path,bytes:bytes.length,sha256:hash(bytes)});}assert.equal(aggregate.digest('hex'),report.sourceHash);}
const result={status:'PASS',verifiedAt:new Date().toISOString(),scope:'Strict child Git-index/raw archive equality; no main/current-EOL waiver',stagedEvidenceFiles:staged.filter(path=>path.startsWith(`${folder}/`)).length,acceptedRuntimeRows:runtimeRows.length,uniqueRuntimeFiles:new Set(runtimeRows.map(row=>row.path)).size,runtimeRows};
await writeFile(`${folder}/staged-source-audit.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,runtimeRows:undefined}));