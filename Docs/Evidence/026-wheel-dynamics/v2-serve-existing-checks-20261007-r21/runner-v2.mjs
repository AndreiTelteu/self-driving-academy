import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const cwd = 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01';
if (resolve('.').replaceAll('\\', '/') !== cwd) throw Error('Wrong explicit cwd');
const out = resolve('Docs/Evidence/026-wheel-dynamics/v2-serve-existing-checks-20261007-r21');
const base = resolve('Docs/Evidence/026-wheel-dynamics');
export const paths = ['tests/browser/wheel-dynamics-v2/serve-existing-contract.mjs','tests/browser/wheel-dynamics-v2/serve-existing.mjs','tests/browser/wheel-dynamics-v2/serve-existing.test.mjs'];
export const digest = b => createHash('sha256').update(b).digest('hex');
export const wx = (name, data) => { const path = resolve(out, name); const bytes = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data,null,2)+'\n'); writeFileSync(path,bytes,{flag:'wx'}); if (!readFileSync(path).equals(bytes)) throw Error('Readback'); };
export const meta = JSON.parse(readFileSync(resolve(base,'v2-serve-existing-source20/source20-final-manifest.json')));
export function run(name,args) {
 const start = new Date().toISOString(); wx(name+'.start.json',{start,cwd,executable:process.execPath,args,command:['node',...args]});
 const result = spawnSync(process.execPath,args,{cwd,encoding:'utf8',maxBuffer:16*1024*1024});
 wx(name+'.stdout.txt',result.stdout??''); wx(name+'.stderr.txt',result.stderr??'');
 wx(name+'.exit.json',{start,end:new Date().toISOString(),exit:result.status,signal:result.signal,error:result.error?.message??null});
 console.log(name+': '+result.status); if(result.stdout) console.log(result.stdout); if(result.stderr) console.log(result.stderr);
 return result.status===0 && !result.error;
}
export function inventory() {
 const set = new Set();
 const add = path => { if(statSync(path).isDirectory()) for(const e of readdirSync(path)) add(resolve(path,e)); else set.add(resolve(path)); };
 const manifest = JSON.parse(readFileSync(meta.exactManifestPath));
 const archive = resolve(meta.exactManifestPath,'..');
 const binding = JSON.parse(readFileSync(resolve(archive,'archive-complete.json')));
 manifest.inputs.forEach(p=>add(resolve(cwd,p)));
 add(resolve(cwd,'.pbi-validation-026-v2/build-'+ '66872ce5-696c-4c3f-9e6d-b849d38f0ee4'));
 add(resolve(base,'v2-captures-source-ownership-1'));
 for(const e of readdirSync(base)) if(/(?:-r(?:11|12|13|14|15|16|17|18|19|20)|-source(?:10|20))$/.test(e)) add(resolve(base,e));
 for(const e of ['before','after-main-027','after-cleanup-current-20261007-r1','calibration-cleanup-current-20261007-r1','calibration-v2.json']) add(resolve(base,e));
 add(binding.native.resolvedPath);
 return [...set].sort().map(path=> { const b=readFileSync(path); return {path:relative(cwd,path).replaceAll('\\','/'),bytes:b.length,sha256:digest(b)}; });
}
if(process.argv[2]==='initial') {
 wx('guard-confirmed.json',{cwd,head:'e52e10b1170db7b8882d6581bdbd4027d2149fb6',branch:'loop-pbi/wheel-dynamics-01',authorized:'SERIAL finite only; no serve/HTTP/browser/native init/build/Git writes/board/agents'});
 for(const item of meta.files) { const b=readFileSync(item.absolutePath); if(b.length!==item.bytes || digest(b)!==item.sha256) throw Error('SOURCE20 pin drift: '+item.path); }
 const final=readFileSync(resolve(base,'v2-serve-existing-source20/source20-final-manifest.json'));
 const sourceFiles=readdirSync(resolve(base,'v2-serve-existing-source20'),{recursive:true}).filter(p=>statSync(resolve(base,'v2-serve-existing-source20',p)).isFile()).map(p=>readFileSync(resolve(base,'v2-serve-existing-source20',p)));
 if(digest(final)!=='129f8b91bab5b6075a1b06d3af7e56889421fe74ba4336f252a186d42866735a' || sourceFiles.length+paths.length!==10 || sourceFiles.reduce((n,b)=>n+b.length,0)+paths.reduce((n,p)=>n+readFileSync(p).length,0)!==51693) throw Error('SOURCE20 final pins');
 wx('source20-pins.json',{finalManifestSha256:digest(final),fileCount:10,totalBytes:51693,files:meta.files});
 wx('service-proof-source20.json',readFileSync(resolve(base,'v2-serve-existing-source20/service-proof.json')));
 paths.forEach((p,i)=>wx('before-'+i+'.mjs',readFileSync(p)));
 wx('preservation-before.json',inventory());
 for(let i=0;i<paths.length;i++) if(!run('syntax-first-'+i,['--check',paths[i]])) process.exit(1);
 if(!run('tests-first',['--test','--test-concurrency=1',paths[2]])) process.exit(1);
 const lint = `import { ESLint } from 'eslint'; import config from './eslint.config.js'; const eslint=new ESLint({overrideConfig:[{...config[1],files:${JSON.stringify(paths)}}]}); const results=await eslint.lintFiles(${JSON.stringify(paths)}); console.log((await eslint.loadFormatter('stylish')).format(results)); const totals=results.reduce((t,r)=>({errors:t.errors+r.errorCount,warnings:t.warnings+r.warningCount}),{errors:0,warnings:0}); console.log(JSON.stringify({files:results.map(r=>r.filePath),...totals,rules:'Existing JS recommended + Node globals; only scoped file selector added'})); process.exitCode=totals.errors||totals.warnings?1:0;`;
 wx('lint-expression.txt',lint);
 if(!run('lint-first',['--input-type=module','-e',lint])) process.exit(1);
 if(!run('format-first',['node_modules/prettier/bin/prettier.cjs','--check',...paths])) process.exit(2);
 if(!run('architecture',['scripts/verify-architecture.mjs'])) process.exit(1);
}