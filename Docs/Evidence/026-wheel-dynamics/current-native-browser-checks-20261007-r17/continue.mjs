import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const out=dirname(fileURLToPath(import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(name,data)=>writeFileSync(resolve(out,name),typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2),{flag:'wx'});
const manifest=JSON.parse(readFileSync(resolve(out,'source-before.json')));
const inventory=()=>manifest.map(f=>{const b=readFileSync(f.path);return {path:f.path,bytes:b.length,sha256:hash(b)};});
if(JSON.stringify(inventory())!==JSON.stringify(manifest)) throw new Error('Unexpected source drift');
const names=['current-native-reference.mjs','safe-diagnostic.test.mjs','lifetime.test.mjs','ledger-diagnostic.test.mjs'];
const files=names.map(n=>`tests/browser/wheel-dynamics-v2/${n}`);
for(const f of files) save(`format-before-${basename(f)}`,readFileSync(f));
const results=[];
function run(name,args,exe=process.execPath){
 const start=new Date().toISOString();save(`${name}.start.json`,{start,executable:exe,args,cwd:process.cwd()});
 const r=spawnSync(exe,args,{encoding:'utf8',maxBuffer:8*1024*1024});
 save(`${name}.stdout.txt`,r.stdout??'');save(`${name}.stderr.txt`,r.stderr??'');
 const result={name,start,end:new Date().toISOString(),exit:r.status,signal:r.signal,error:r.error?.message??null};save(`${name}.exit.json`,result);results.push(result);console.log(JSON.stringify(result));return r.status;
}
let failed=run('format-fix',['F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs','--write',...files])!==0;
for(const f of files){
 save(`format-after-${basename(f)}`,readFileSync(f));
 const r=spawnSync('git',['diff','--no-index','--',resolve(out,`format-before-${basename(f)}`),resolve(out,`format-after-${basename(f)}`)],{encoding:'utf8'});
 save(`format-diff-${basename(f)}.txt`,r.stdout??'');if(r.status!==1&&r.status!==0) throw new Error('Diff failed');
}
save('source-after-format.json',inventory());
const jobs=files.map((f,i)=>[`syntax-affected-${i+1}`,['--check',f]]);
jobs.push(['tests-affected',['--test','--test-concurrency=1',...files.filter(f=>f.endsWith('.test.mjs'))]],
 ['lint-affected',['F:/Sites/self-driving-academy/node_modules/eslint/bin/eslint.js','--config',resolve(out,'eslint-scoped.config.mjs'),'--max-warnings','0',...files]],
 ['prettier-affected',['F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs','--check',...files]],
 ['architecture',['scripts/verify-architecture.mjs']]);
for(const [name,args] of jobs){if(failed)break;failed=run(name,args)!==0;}
save('source-after-affected.json',inventory());save('affected-results.json',results);
if(failed)process.exitCode=1;
