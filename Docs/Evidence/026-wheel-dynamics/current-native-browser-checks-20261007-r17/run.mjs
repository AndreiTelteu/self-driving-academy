import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = dirname(fileURLToPath(import.meta.url));
const root = 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01';
if (resolve('.') !== resolve(root)) throw new Error('Wrong workdir');
const hash = b => createHash('sha256').update(b).digest('hex');
const save = (name, data) => writeFileSync(resolve(out, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2), { flag: 'wx' });
const source = JSON.parse(readFileSync('Docs/Evidence/026-wheel-dynamics/current-native-browser-source-20261007-r16/source-manifest-corrected.json'));
const inventory = () => source.files.map(f => { const b = readFileSync(f.path); return {path:f.path, bytes:b.length, sha256:hash(b)}; });
const before = inventory();
save('source-before.json', before);
if (hash(readFileSync('Docs/Evidence/026-wheel-dynamics/current-native-browser-source-20261007-r16/source-manifest-corrected.json')) !== '3b5b5e566c03401baf0bfd2d1106fef5e4e6835bc8bca2a4853433500e034960' || JSON.stringify(before) !== JSON.stringify(source.files)) throw new Error('Source revision mismatch');
const scope = source.files.map(f => f.path);
const config = `import base from '../../../../eslint.config.js';\nexport default base.map(c => c.files?.includes('scripts/**/*.mjs') ? {...c,files:['tests/browser/wheel-dynamics-v2/**/*.mjs']} : c.files?.includes('tests/**/*.ts') ? {...c,files:['tests/browser/wheel-dynamics-v2/**/*.ts','tests/browser/wheel-dynamics-v2/**/*.d.mts']} : c);\n`;
save('eslint-scoped.config.mjs',config);
const jobs = scope.filter(p => p.endsWith('.mjs')).map((p,i) => [`syntax-${i+1}`,['--check',p]]);
jobs.push(['pure-tests',['--test','--test-concurrency=1',...['safe-diagnostic','lifetime','ledger-diagnostic','numeric-reader'].map(n=>`tests/browser/wheel-dynamics-v2/${n}.test.mjs`)]],
 ['types-app',['F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc','--noEmit']],
 ['types-tests',['F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc','-p','tsconfig.tests.json','--noEmit']],
 ['lint',['F:/Sites/self-driving-academy/node_modules/eslint/bin/eslint.js','--config',resolve(out,'eslint-scoped.config.mjs'),'--max-warnings','0',...scope]],
 ['prettier',['F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs','--check',...scope]],
 ['architecture',['scripts/verify-architecture.mjs']]);
const results=[];
for (const [name,args] of jobs) {
 const start=new Date().toISOString();
 save(`${name}.start.json`,{start,executable:process.execPath,args,cwd:root});
 const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
 save(`${name}.stdout.txt`,r.stdout??''); save(`${name}.stderr.txt`,r.stderr??'');
 const result={name,start,end:new Date().toISOString(),exit:r.status,signal:r.signal,error:r.error?.message??null};
 save(`${name}.exit.json`,result);results.push(result);console.log(JSON.stringify(result));
 if(r.status!==0) break;
}
save('source-after.json',inventory());save('results.json',results);
