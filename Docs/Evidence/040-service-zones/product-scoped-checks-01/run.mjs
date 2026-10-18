import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const cwd=process.cwd(),out=resolve('Docs/Evidence/040-service-zones/product-scoped-checks-01');
const hash=b=>createHash('sha256').update(b).digest('hex');
if(cwd.replaceAll('\\','/')!=='F:/Sites/self-driving-academy/.worktrees/service-zones-01')throw Error('cwd');
if(spawnSync('git',['branch','--show-current'],{encoding:'utf8'}).stdout.trim()!=='loop-pbi/service-zones-01')throw Error('branch');
const paths=['src/world/service-zones.ts','src/app/service-zones.ts','tests/world/service-zones.test.ts','tests/app/service-zones.test.ts','tests/app/service-zones-native.test.ts','tests/browser/service-zones-after.mjs','tests/browser/service-zones/after-query.ts','tests/browser/service-zones/after-proof.mjs','tests/browser/service-zones/verify-after.mjs','tests/world/service-zones-after-proof.test.mjs','Docs/service-zones.md','Docs/Evidence/040-service-zones/product-source-handoff-01.md','Docs/Evidence/040-service-zones/product-source-review-response-02.md','src/world/index.ts'];
const mjs=paths.filter(p=>p.endsWith('.mjs')),code=paths.filter(p=>/\.(ts|mjs)$/.test(p));
const frozen=JSON.parse(readFileSync('Docs/Evidence/040-service-zones/baseline-scoped-checks-01/complete.json')).inputs;
function snapshot(){return paths.map(path=>{const b=readFileSync(path);return{path,bytes:b.length,sha256:hash(b)}})}
function guard(){for(const r of frozen)if(hash(readFileSync(r.path))!==r.sha256)throw Error('Frozen baseline changed '+r.path)}
function files(dir){return readdirSync(dir).flatMap(n=>{const p=dir+'/'+n;return statSync(p).isDirectory()?files(p):[{path:p,sha256:hash(readFileSync(p))}]})}
guard();writeFileSync(out+'/before-inputs.json',JSON.stringify(snapshot(),null,2),{flag:'wx'});
const old=files('Docs/Evidence/040-service-zones/before-01');writeFileSync(out+'/before-archive-guard.json',JSON.stringify(old,null,2),{flag:'wx'});
for(const p of paths){const dest=out+'/source-before/'+p;mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(p),{flag:'wx'})}
const config="import project from '../../../../eslint.config.js';\nimport js from '@eslint/js';\nimport globals from 'globals';\nexport default [...project,{files:"+JSON.stringify(mjs)+",...js.configs.recommended,languageOptions:{globals:globals.node}}];\n";
writeFileSync(out+'/eslint.config.mjs',config,{flag:'wx'});
const root='F:/Sites/self-driving-academy/node_modules/';
const commands=[['01-format-write',[root+'prettier/bin/prettier.cjs','--write',...paths]],['02-format-check',[root+'prettier/bin/prettier.cjs','--check',...paths]],['03-types-source',[root+'typescript/bin/tsc','--noEmit']],['04-types-tests',[root+'typescript/bin/tsc','-p','tsconfig.tests.json','--noEmit']],['05-lint',[root+'eslint/bin/eslint.js','--config',out+'/eslint.config.mjs','--max-warnings','0',...code]],['06-architecture',['scripts/verify-architecture.mjs']],...mjs.map((p,i)=>['07-syntax-'+i,['--check',p]]),['08-pure',['--import','./scripts/register-typescript.mjs','--test-concurrency=1','--test','tests/world/service-zones.test.ts','tests/app/service-zones.test.ts','tests/world/service-zones-after-proof.test.mjs']]];
for(const [name,args] of commands){const startedAt=new Date().toISOString();console.log('START',name,startedAt);const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',maxBuffer:16*1024*1024});writeFileSync(out+'/'+name+'.stdout.log',r.stdout??'',{flag:'wx'});writeFileSync(out+'/'+name+'.stderr.log',r.stderr??'',{flag:'wx'});writeFileSync(out+'/'+name+'.json',JSON.stringify({argv:[process.execPath,...args],cwd,startedAt,endedAt:new Date().toISOString(),exit:r.status,error:r.error?.message},null,2),{flag:'wx'});console.log('END',name,r.status);if(r.status!==0){writeFileSync(out+'/first-failure-source.json',JSON.stringify(snapshot(),null,2),{flag:'wx'});guard();process.exitCode=1;break}}
guard();for(const r of old)if(hash(readFileSync(r.path))!==r.sha256)throw Error('archive drift '+r.path);
const rows=snapshot();writeFileSync(out+'/terminal.json',JSON.stringify({status:process.exitCode?'FAILED':'PASS',completedAt:new Date().toISOString(),inputs:rows,sourceFingerprint:hash(Buffer.from(rows.map(r=>r.path+'\0'+r.sha256).sort().join('\n'))),baseline8Unchanged:true,beforeArchiveFiles:old.length,beforeArchiveUnchanged:true,nativeExecuted:false},null,2),{flag:'wx'});
