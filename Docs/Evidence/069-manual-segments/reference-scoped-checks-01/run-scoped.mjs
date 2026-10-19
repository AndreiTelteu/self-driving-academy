import { spawnSync,execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root='F:/Sites/self-driving-academy/.worktrees/manual-segments-01';
if(resolve('.').replaceAll('\\','/')!==root||execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!=='loop-pbi/manual-segments-01')throw Error('Guard');
const dir='Docs/Evidence/069-manual-segments/reference-scoped-checks-01',req=createRequire(resolve('package.json'));
const paths=['scripts/benchmark-manual-segments-reference.mjs','scripts/manual-segments-reference-records.mjs','tests/telemetry/manual-segments-reference.ts','Docs/Evidence/069-manual-segments/verify-reference.mjs','tests/telemetry/manual-segments-reference-records.test.mjs','Docs/Evidence/069-manual-segments/source-design-01.md','Docs/Evidence/069-manual-segments/native-reference-plan-01.md','Docs/Evidence/069-manual-segments/native-reference-source-handoff-01.md'];
const inputs=paths.map(path=>{const bytes=readFileSync(path);const target=dir+'/source-initial/'+path;mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
writeFileSync(dir+'/source-initial.json',JSON.stringify({at:new Date().toISOString(),inputs},null,2),{flag:'wx'});
const bins={prettier:join(dirname(req.resolve('prettier/package.json')),'bin/prettier.cjs'),tsc:join(dirname(req.resolve('typescript/package.json')),'bin/tsc'),eslint:join(dirname(req.resolve('eslint/package.json')),'bin/eslint.js')};
const commands=[['01-format',[bins.prettier,'--write',...paths]],['02-types-production',[bins.tsc,'--noEmit']],['03-types-tests',[bins.tsc,'-p','tsconfig.tests.json','--noEmit']],['04-scoped-lint',[bins.eslint,...paths.filter(p=>p.startsWith('scripts/')||p.endsWith('.ts')),'--max-warnings','0']],...paths.filter(p=>p.endsWith('.mjs')).map((p,i)=>['05-syntax-'+i,['--check',p]]),['06-pure',['--import','./scripts/register-typescript.mjs','--test','tests/telemetry/manual-segments-reference-records.test.mjs']],['07-architecture',['scripts/verify-architecture.mjs']]];
writeFileSync(dir+'/commands.json',JSON.stringify({root,node:process.version,bins,dependencyResolution:'Exact locked versions already installed at canonical ancestor; no install needed. No native world acquired by these commands.',commands},null,2),{flag:'wx'});
const results=[];
for(const [name,args]of commands){const start=new Date().toISOString(),r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});writeFileSync(dir+'/'+name+'.log',(r.stdout??'')+(r.stderr??''),{flag:'wx'});const row={name,args,start,end:new Date().toISOString(),exit:r.status,error:r.error?String(r.error):null};writeFileSync(dir+'/'+name+'.json',JSON.stringify(row,null,2),{flag:'wx'});results.push(row);process.stdout.write(name+': exit '+r.status+'\n');if(r.status!==0)break;}
writeFileSync(dir+'/results-01.json',JSON.stringify(results,null,2),{flag:'wx'});
if(results.length!==commands.length||results.some(r=>r.exit!==0))process.exitCode=1;
