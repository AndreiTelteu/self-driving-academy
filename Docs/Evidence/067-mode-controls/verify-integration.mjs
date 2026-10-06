// Separate integration proof; original strict capture verifiers remain unchanged.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const folder='Docs/Evidence/067-mode-controls',output=`${folder}/integration-source-audit.json`;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),lf=bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
const records=[{name:'native-after',archive:'source-after',report:JSON.parse(await readFile(`${folder}/after.json`,'utf8'))},{name:'browser-after-format-v3',archive:'browser-after-format-v3/source-at-capture',report:JSON.parse(await readFile(`${folder}/browser-after-format-v3/build-manifest.json`,'utf8'))}];
assert.equal(records[0].report.status,'PASS');assert.equal(records[0].report.inputs.length,121);
const staged=execFileSync('git',['diff','--cached','--name-only','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const paths=new Set(staged.filter(path=>path.startsWith(`${folder}/`)&&path!==output));
for(const {archive,report} of records)for(const entry of report.inputs){const path=typeof entry==='string'?entry:entry.path;paths.add(path);paths.add(`${folder}/${archive}/${path}`);}
const names=[...paths].sort(),bytes=execFileSync('git',['cat-file','--batch'],{input:names.map(path=>`:${path}\n`).join(''),maxBuffer:512*1024*1024});
let offset=0;const blobs=new Map();
for(const path of names){const end=bytes.indexOf(10,offset),match=/^[0-9a-f]+ blob (\d+)$/.exec(bytes.subarray(offset,end).toString());assert(match,`Missing index file: ${path}`);const size=Number(match[1]);blobs.set(path,bytes.subarray(end+1,end+1+size));assert.equal(bytes[end+1+size],10);offset=end+size+2;}assert.equal(offset,bytes.length);
let evidenceRows=0;for(const path of staged.filter(path=>path.startsWith(`${folder}/`)&&path!==output)){assert(blobs.get(path).equals(await readFile(path)),`Evidence Git-index difference: ${path}`);evidenceRows++;}
const rows=[];
for(const {name,archive,report} of records){const aggregate=createHash('sha256');for(const entry of report.inputs){const path=typeof entry==='string'?entry:entry.path;const archived=await readFile(`${folder}/${archive}/${path}`),current=await readFile(path);if(typeof entry!=='string'){assert.equal(archived.length,entry.bytes);assert.equal(hash(archived),entry.sha256);}aggregate.update(path).update(archived);assert(blobs.get(path).equals(archived),`Accepted runtime Git-index difference: ${name}/${path}`);assert(blobs.get(`${folder}/${archive}/${path}`).equals(archived),`Archive Git-index difference: ${name}/${path}`);const exact=current.equals(archived);if(!exact){assert.equal(path,'Docs/performance-budgets.json');assert(lf(current).equals(lf(archived)));}rows.push({capture:name,path,bytes:archived.length,sha256:hash(archived),currentByteExact:exact,gitIndexByteExact:true});}assert.equal(aggregate.digest('hex'),report.sourceHash);}
const preservation=JSON.parse(await readFile(`${folder}/initial-browser-hud-layout-attempt/preservation-manifest.json`,'utf8'));
for(const row of preservation.rows){const original=await readFile(row.source),copy=await readFile(`${folder}/initial-browser-hud-layout-attempt/${row.copy}`);assert.equal(original.length,row.bytes);assert.equal(hash(original),row.sha256);assert.equal(copy.length,row.bytes);assert.equal(hash(copy),row.sha256);assert(blobs.get(row.source).equals(original));assert(blobs.get(`${folder}/initial-browser-hud-layout-attempt/${row.copy}`).equals(copy));}
const result={status:'PASS',verifiedAt:new Date().toISOString(),acceptedRuntimeRows:rows.length,evidenceRows,preservationRows:preservation.rows.length,currentExactRows:rows.filter(row=>row.currentByteExact).length,eolOnlyRows:rows.filter(row=>!row.currentByteExact),rows,scope:'Separate Git-index/current/archive proof. Accepted121 native and final format-v3 browser runtime and staged067 evidence bytes exact in Git. Only budget checkout CRLF/LF may differ; no semantic/source waiver. Initial numerical WebGPU/visual-layout attempt remains immutable supplemental evidence. Output excluded from own staged comparison.'};
await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined}));
