import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const root='F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01';
const canonical='F:/Sites/self-driving-academy';
const e='Docs/Evidence/026-wheel-dynamics/production-native-correctness-20261007-r7';
if(resolve(process.cwd()).toLowerCase()!==resolve(root).toLowerCase()) throw Error('Wrong cwd');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(readFileSync(p));
const item=p=>{const b=readFileSync(p);return {path:p,bytes:b.length,sha256:sha(b)}};
const put=(p,v)=>writeFileSync(`${e}/${p}`,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(`${d}/${x.name}`):[`${d}/${x.name}`]);
const owned=read('Docs/Evidence/026-wheel-dynamics/production-static-pure-20261007-r6/source-final.json').owned;
const agg=paths=>{const h=createHash('sha256');for(const p of [...paths].sort())h.update(p).update(readFileSync(p));return h.digest('hex')};
const sourceHash=()=>agg(owned.map(x=>x.path));
const pin='02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0';
const native=`${canonical}/node_modules/@dimforge/rapier3d-compat`;
const commands={factory:['--import','./scripts/register-typescript.mjs','--test','--test-concurrency=1','tests/vehicles/rapier-factory-ownership.test.ts'],regression:['--import','./scripts/register-typescript.mjs','--test','--test-concurrency=1','tests/vehicles/physics.test.ts','tests/vehicles/physics-adapter.test.ts']};
const mismatch=entries=>entries.filter(x=>{const a=item(x.path);return a.bytes!==x.bytes||a.sha256!==x.sha256});
if(process.argv[2]==='prepare'){
 const start=new Date().toISOString();
 const head=readFileSync(`${canonical}/.git/worktrees/wheel-dynamics-01/HEAD`,'utf8').trim();
 if(head!=='ref: refs/heads/loop-pbi/wheel-dynamics-01')throw Error('Wrong branch');
 if(sourceHash()!=='1256a2441becc63a7d8765236a0772fd4bc0570721f1bef7fb666d1ff3c00cd0'||mismatch(owned).length)throw Error('Owned source changed');
 const nativeFiles=walk(native).map(item);const pinned=nativeFiles.find(x=>x.sha256===pin&&x.bytes===4340292);if(!pinned)throw Error('Native pin missing');
 const prior=walk('Docs/Evidence/026-wheel-dynamics').filter(p=>!p.startsWith(e+'/'));
 const protectedFiles=[...new Set([...prior,...walk('tests/browser/wheel-dynamics-v2'),...walk(`${canonical}/PBI`),`${canonical}/AGENTS.md`,`${canonical}/Docs/README.md`,`${canonical}/Docs/21-acoperire-functionalitati.md`,`${canonical}/package.json`,`${canonical}/package-lock.json`,`${canonical}/.git/worktrees/wheel-dynamics-01/HEAD`])].sort().map(item);
 put('protected-before.json',protectedFiles);
 const originals=read('Docs/Evidence/026-wheel-dynamics/production-ownership-source-20261007-r1/after.json').originals;
 const historical=read('Docs/Evidence/026-wheel-dynamics/production-static-pure-20261007-r6/protected-before.json');
 const checks={original139:mismatch(originals),r6Protected1052:mismatch(historical)};
 put('prior-check.json',{at:new Date().toISOString(),counts:{original139:originals.length,r6Protected:historical.length,v2:walk('tests/browser/wheel-dynamics-v2').length},mismatches:checks});
 if(Object.values(checks).some(x=>x.length))throw Error('Prior evidence changed');
 const paths=[...walk('src'),...walk('tests'),...walk('scripts'),'package.json','package-lock.json','tsconfig.json','tsconfig.tests.json','Docs/performance-budgets.json'];
 const docs=['AGENTS.md','PBI/AGENTS.md','PBI/In Progress/026-wheel_dynamics.md','Docs/05-vehicule-si-fizica.md','Docs/25-performanta-contracte-si-benchmark.md','Docs/26-joaca-libera-haos-si-distrugere.md','Docs/physics-adapter.md','Docs/physics-prototype.md'];
 const inputs=[];
 for(const p of paths){const target=`${e}/source/${p}`;mkdirSync(dirname(target),{recursive:true});copyFileSync(p,target);inputs.push({...item(p),archivePath:target});}
 for(const p of docs){const origin=`${canonical}/${p}`,target=`${e}/canonical-data/${p}`;mkdirSync(dirname(target),{recursive:true});copyFileSync(origin,target);inputs.push({...item(origin),archivePath:target});}
 // Full installed Rapier and Babylon core packages cover every external runtime import.
 for(const pkg of ['@dimforge/rapier3d-compat','@babylonjs/core'])for(const p of walk(`${canonical}/node_modules/${pkg}`)){const target=`${e}/installed/${p.slice((canonical+'/node_modules/').length)}`;mkdirSync(dirname(target),{recursive:true});copyFileSync(p,target);inputs.push({...item(p),archivePath:target});}
 for(const x of inputs){const a=item(x.archivePath);if(a.bytes!==x.bytes||a.sha256!==x.sha256)throw Error('Archive mismatch '+x.path);}
 put('archive-before-world.json',{start,completedAt:new Date().toISOString(),workdir:root,branch:head,node:process.version,nodeExecutable:item(process.execPath),sourceOnlyHash:sourceHash(),nativePinned:pinned,inputs,coverage:'Complete src/tests/scripts and full installed Rapier/Babylon core packages: superset of local and external runtime import closure; no native import or world launched during preparation.',commands,protectedCount:protectedFiles.length});
 console.log(JSON.stringify({archiveComplete:true,at:new Date().toISOString(),inputs:inputs.length,protectedCount:protectedFiles.length,nativePinned:pinned,sourceOnlyHash:sourceHash()}));
}else if(process.argv[2]==='run'){
 const name=process.argv[3];if(!commands[name])throw Error('Unknown command');
 const archive=read(`${e}/archive-before-world.json`);if(mismatch(archive.inputs).length)throw Error('Input changed since archive');
 if(name==='regression'){const previous=read(`${e}/factory.json`);if(previous.exit!==0||previous.error||previous.signal)throw Error('Factory gate failed');}
 if(existsSync(`${e}/${name}.json`))throw Error('Immutable run exists');
 const startedAt=new Date().toISOString();const result=spawnSync(process.execPath,commands[name],{cwd:root,shell:false,windowsHide:true,encoding:null,timeout:180000,maxBuffer:16*1024*1024});
 const endedAt=new Date().toISOString();
 writeFileSync(`${e}/${name}.stdout.txt`,result.stdout??Buffer.alloc(0),{flag:'wx'});writeFileSync(`${e}/${name}.stderr.txt`,result.stderr??Buffer.alloc(0),{flag:'wx'});
 const output=(result.stdout??Buffer.alloc(0)).toString();
 const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(k=>[k,Number(output.match(new RegExp('(?:# |ℹ )'+k+' (\\d+)'))?.[1]??NaN)]));
 const record={name,startedAt,endedAt,archiveCompletedAt:archive.completedAt,executable:process.execPath,args:commands[name],workdir:root,exit:result.status,signal:result.signal,error:result.error?{name:result.error.name,message:result.error.message,code:result.error.code,stack:result.error.stack}:null,counts,scenarioCount:name==='factory'?10:null,sourceOnlyHash:sourceHash(),stdout:item(`${e}/${name}.stdout.txt`),stderr:item(`${e}/${name}.stderr.txt`),childPid:result.pid,childExited:true};
 put(`${name}.json`,record);console.log(JSON.stringify(record));process.stdout.write(result.stdout??Buffer.alloc(0));process.stderr.write(result.stderr??Buffer.alloc(0));process.exitCode=result.status??1;
}else if(process.argv[2]==='finalize'){
 const archive=read(`${e}/archive-before-world.json`),protectedFiles=read(`${e}/protected-before.json`);
 const changed={inputs:mismatch(archive.inputs),protected:mismatch(protectedFiles),archived:archive.inputs.filter(x=>{const a=item(x.archivePath);return a.bytes!==x.bytes||a.sha256!==x.sha256})};
 const runs=['factory','regression'].filter(n=>existsSync(`${e}/${n}.json`)).map(n=>read(`${e}/${n}.json`));
 const terminal={at:new Date().toISOString(),state:runs.length===2&&runs.every(r=>r.exit===0&&!r.error&&!r.signal)?'NATIVE_CORRECTNESS_PASS':'STOPPED_FIRST_FAILURE',cpuReleased:true,ownedActiveProcesses:[],runs,sourceOnlyHash:sourceHash(),nativePinned:archive.nativePinned,protectedCount:protectedFiles.length,inputCount:archive.inputs.length,changed,pbiDone:false,remaining:['Legacy numeric reader/server b696/calibration-v2 current provenance pending root SOURCE review','No performance acceptance; benchmark/calibration/build/browser not run','Native internal partial exceptions remain UNKNOWN; no forced free failure or retry','PBI 026 remains In Progress; integration, performance/browser gates, board completion remain outside grant']};
 put('protected-after.json',{at:terminal.at,checked:protectedFiles.length,mismatches:changed.protected,files:protectedFiles.map(x=>item(x.path))});
 put('terminal-handoff.json',terminal);
 put('completion.json',{at:new Date().toISOString(),files:walk(e).map(item)});
 console.log(JSON.stringify(terminal));if(Object.values(changed).some(x=>x.length))process.exitCode=1;
}else throw Error('Unknown mode');
