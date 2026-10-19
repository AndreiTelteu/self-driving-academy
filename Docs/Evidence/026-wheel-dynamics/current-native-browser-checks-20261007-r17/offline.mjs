import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const out=dirname(fileURLToPath(import.meta.url));
const save=(name,data)=>writeFileSync(resolve(out,name),typeof data==='string'?data:JSON.stringify(data,null,2),{flag:'wx'});
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(resolve(out,'source-after-affected.json')));
const inventory=()=>manifest.map(f=>{const b=readFileSync(f.path);return {path:f.path,bytes:b.length,sha256:hash(b)};});
if(JSON.stringify(inventory())!==JSON.stringify(manifest)) throw new Error('Source drift');
save('offline-source-before.json',inventory());
const binding=`import {readCurrentNative} from './tests/browser/wheel-dynamics-v2/numeric-reader.mjs'; const r=await readCurrentNative(); console.log(JSON.stringify({verified:true,acceptance:'NATIVE_ONLY_NOT_BROWSER_OR_HARDWARE',pins:r.pins,afterRuns:r.after.runs.length,calibrationRuns:r.calibration.runs.length,afterInputs:r.after.inputs.length,calibrationInputs:r.calibration.inputs.length,afterArchiveCompletedAt:r.after.archiveCompletedAt,calibrationArchiveCompletedAt:r.calibration.archiveCompletedAt},null,2));`;
const jobs=[['offline-current-verifier',['scripts/verify-wheel-dynamics.mjs','--reference=current','--after-capture=after-cleanup-current-20261007-r1']],['offline-current-binding',['--input-type=module','--eval',binding]]];
const results=[];
for(const [name,args] of jobs){
 const start=new Date().toISOString();save(`${name}.start.json`,{start,executable:process.execPath,args,cwd:process.cwd()});
 const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});
 save(`${name}.stdout.txt`,r.stdout??'');save(`${name}.stderr.txt`,r.stderr??'');
 const result={name,start,end:new Date().toISOString(),exit:r.status,signal:r.signal,error:r.error?.message??null};save(`${name}.exit.json`,result);results.push(result);console.log(JSON.stringify(result));if(r.status!==0)break;
}
save('offline-source-after.json',inventory());save('offline-results.json',results);
