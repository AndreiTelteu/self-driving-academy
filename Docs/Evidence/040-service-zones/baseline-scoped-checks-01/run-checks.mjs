import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const root='F:/Sites/self-driving-academy/.worktrees/service-zones-01';
assert.equal(resolve('.').replaceAll('\\','/'),root);
assert.equal(execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),root);
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'loop-pbi/service-zones-01');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'0853a4d94d5ac7aed00fbacdf4723a0a3de4e906');
assert(!existsSync('Docs/Evidence/040-service-zones/before-01'));
const folder='Docs/Evidence/040-service-zones/baseline-scoped-checks-01';
const paths=['tests/browser/service-zones-before.mjs','tests/browser/service-zones/road-fixture.ts','tests/browser/service-zones/reference-query.ts','tests/browser/service-zones/verify-query-records.mjs','tests/browser/service-zones/verify-before.mjs','tests/browser/service-zones/failure-info.mjs','tests/world/service-zones-reference.test.mjs','Docs/Evidence/040-service-zones/baseline-source-handoff.md'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const inputs=[];
for(const path of paths){const bytes=readFileSync(path);mkdirSync(dirname(folder+'/source-before/'+path),{recursive:true});writeFileSync(folder+'/source-before/'+path,bytes,{flag:'wx'});inputs.push({path,bytes:bytes.length,sha256:sha(bytes)});}
writeFileSync(folder+'/source-before.json',JSON.stringify({capturedAt:new Date().toISOString(),inputs},null,2),{flag:'wx'});
const bin='F:/Sites/self-driving-academy/node_modules/';
const commands=[
 ['01-format-write',[bin+'prettier/bin/prettier.cjs','--write',...paths]],
 ['02-format-check',[bin+'prettier/bin/prettier.cjs','--check',...paths]],
 ['03-types-source',[bin+'typescript/bin/tsc','--noEmit']],
 ['04-types-tests',[bin+'typescript/bin/tsc','-p','tsconfig.tests.json','--noEmit']],
 ['05-lint',[bin+'eslint/bin/eslint.js','--config',folder+'/scoped-eslint.config.mjs',...paths.filter(x=>!x.endsWith('.md')),'--max-warnings','0']],
 ['06-architecture',['scripts/verify-architecture.mjs']],
 ...paths.filter(x=>x.endsWith('.mjs')).map((p,i)=>['07-syntax-'+i,['--check',p]]),
 ['08-pure',['--test','tests/world/service-zones-reference.test.mjs']],
];
for(const [name,args] of commands){const startedAt=new Date().toISOString();const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});const completedAt=new Date().toISOString();writeFileSync(folder+'/'+name+'.stdout.log',result.stdout??'',{flag:'wx'});writeFileSync(folder+'/'+name+'.stderr.log',result.stderr??'',{flag:'wx'});writeFileSync(folder+'/'+name+'.json',JSON.stringify({command:process.execPath,args,cwd:root,startedAt,completedAt,exit:result.status,signal:result.signal,error:result.error?String(result.error):null},null,2),{flag:'wx'});console.log(JSON.stringify({name,exit:result.status,completedAt}));if(result.status!==0)process.exit(result.status??1);}
assert(!existsSync('Docs/Evidence/040-service-zones/before-01'));
writeFileSync(folder+'/complete.json',JSON.stringify({status:'PASS',completedAt:new Date().toISOString(),commands:commands.length,inputs:paths.map(path=>({path,bytes:readFileSync(path).length,sha256:sha(readFileSync(path))})),nativeExecuted:false},null,2),{flag:'wx'});
