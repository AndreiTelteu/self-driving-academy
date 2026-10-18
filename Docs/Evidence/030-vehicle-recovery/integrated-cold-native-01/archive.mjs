import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,posix} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve('.'), out='Docs/Evidence/030-vehicle-recovery/integrated-cold-native-01';
if(root.replaceAll('\\','/')!=='F:/Sites/self-driving-academy')throw Error('wrongroot');
const native='node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs';
const paths=new Set(execFileSync('rg',['--files','src'],{encoding:'utf8'}).trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')));
for(const p of ['tests/vehicles/recovery-native.test.ts','tests/vehicles/recovery-functional-native.test.ts','tests/vehicles/recovery-support-calibration.test.ts','tests/vehicles/recovery-diagnostic.test.ts','tests/vehicles/recovery-owner.test.ts','scripts/register-typescript.mjs','package.json','package-lock.json'])paths.add(p);
const queue=[...paths];
for(let n=0;n<queue.length;n++){const p=queue[n],t=await readFile(p,'utf8');for(const m of t.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){if(!m[1].startsWith('.'))continue;const b=posix.normalize(posix.join(posix.dirname(p),m[1]));let found;for(const candidate of [b,b+'.ts',b+'.mjs',b+'/index.ts']){try{await readFile(candidate);found=candidate;break}catch(e){if(e.code!=='ENOENT'&&e.code!=='EISDIR')throw e}}if(!found)throw Error('unresolved '+p+' '+b);if(!paths.has(found)){paths.add(found);queue.push(found)}}}
const hash=b=>createHash('sha256').update(b).digest('hex');
const rows=[];for(const p of [...paths].sort()){const b=await readFile(p), dest=out+'/source/'+p;await mkdir(dirname(dest),{recursive:true});await writeFile(dest,b,{flag:'wx'});rows.push({path:p,bytes:b.length,sha256:hash(b)})}
const bytes=await readFile(native);await mkdir(out+'/native',{recursive:true});await writeFile(out+'/native/rapier.mjs',bytes,{flag:'wx'});
await writeFile(out+'/manifest.json',JSON.stringify({scope:'INTEGRATED_COLD_NATIVE_ONLY',sourceHash:hash(Buffer.from(JSON.stringify(rows))),inputs:rows,nativeHash:hash(bytes),nativeBytes:bytes.length,archivedAt:new Date().toISOString(),noWorldDuringArchive:true},null,2),{flag:'wx'});
console.log(JSON.stringify({inputs:rows.length,nativeBytes:bytes.length,nativeHash:hash(bytes)}));