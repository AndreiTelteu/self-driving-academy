import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='Docs/Evidence/040-service-zones/baseline-scoped-checks-01';
const root='F:/Sites/self-driving-academy/.worktrees/service-zones-01';
assert.equal(process.cwd().replaceAll('\\','/'),root);
const bin='F:/Sites/self-driving-academy/node_modules/';
const changed=['tests/browser/service-zones-before.mjs','tests/browser/service-zones/verify-query-records.mjs'];
for(const path of changed)writeFileSync(folder+'/'+path.split('/').at(-1)+'.lint-repair-source.txt',readFileSync(path),{flag:'wx'});
const paths=JSON.parse(readFileSync(folder+'/source-before.json')).inputs.map(x=>x.path);
const commands=[
 ['09-repair-format-write',[bin+'prettier/bin/prettier.cjs','--write',...changed]],
 ['10-repair-format-check',[bin+'prettier/bin/prettier.cjs','--check',...changed]],
 ['11-lint-02',[bin+'eslint/bin/eslint.js','--config',folder+'/scoped-eslint.config.mjs',...paths.filter(x=>!x.endsWith('.md')),'--max-warnings','0']],
 ['12-architecture',['scripts/verify-architecture.mjs']],
 ...paths.filter(x=>x.endsWith('.mjs')).map((p,i)=>['13-syntax-'+i,['--check',p]]),
 ['14-pure',['--test','tests/world/service-zones-reference.test.mjs']],
];
for(const [name,args] of commands){const startedAt=new Date().toISOString();const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});const completedAt=new Date().toISOString();writeFileSync(folder+'/'+name+'.stdout.log',result.stdout??'',{flag:'wx'});writeFileSync(folder+'/'+name+'.stderr.log',result.stderr??'',{flag:'wx'});writeFileSync(folder+'/'+name+'.json',JSON.stringify({command:process.execPath,args,cwd:root,startedAt,completedAt,exit:result.status,signal:result.signal},null,2),{flag:'wx'});console.log(JSON.stringify({name,exit:result.status,completedAt}));if(result.status!==0)process.exit(result.status??1);}
assert(!existsSync('Docs/Evidence/040-service-zones/before-01'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const sorted=[...paths].sort(),combined=createHash('sha256');
const inputs=sorted.map(path=>{const b=readFileSync(path);combined.update(path).update(b);return{path,bytes:b.length,sha256:sha(b)};});
writeFileSync(folder+'/complete.json',JSON.stringify({status:'PASS',completedAt:new Date().toISOString(),firstFailure:'05-lint.json',repair:'Only equivalent outside-window fixed-mechanics field filtering; six unused destructured variables removed',sourceFingerprint:combined.digest('hex'),inputs,tests:7,nativeExecuted:false,beforeNamespaceAbsent:true},null,2),{flag:'wx'});
