import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='F:/Sites/self-driving-academy/.worktrees/service-zones-01',folder='Docs/Evidence/040-service-zones/baseline-capture-command-01';
assert.equal(process.cwd().replaceAll('\\','/'),root);
assert.equal(execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),root);
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'loop-pbi/service-zones-01');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'0853a4d94d5ac7aed00fbacdf4723a0a3de4e906');
const receipt=JSON.parse(readFileSync('Docs/Evidence/040-service-zones/baseline-scoped-checks-01/complete.json'));
assert.equal(receipt.sourceFingerprint,'cc3693350d44687db93288966abf5feb49975e36c48b092f90985dcddbe28046');
const hash=b=>createHash('sha256').update(b).digest('hex');
function guards(){for(const item of receipt.inputs)assert.equal(hash(readFileSync(item.path)),item.sha256,item.path);}
guards();assert(!existsSync('Docs/Evidence/040-service-zones/before-01'));
writeFileSync(folder+'/started.json',JSON.stringify({startedAt:new Date().toISOString(),pid:process.pid,root,sourceFingerprint:receipt.sourceFingerprint},null,2),{flag:'wx'});
const commands=[['01-capture',['--import','./scripts/register-typescript.mjs','tests/browser/service-zones-before.mjs']],['02-current',['--import','./scripts/register-typescript.mjs','tests/browser/service-zones/verify-before.mjs']],['03-historical',['--import','./scripts/register-typescript.mjs','tests/browser/service-zones/verify-before.mjs','--historical']]];
for(const [name,args] of commands){const startedAt=new Date().toISOString();writeFileSync(folder+'/'+name+'-started.json',JSON.stringify({startedAt,command:process.execPath,args,cwd:root,pid:process.pid},null,2),{flag:'wx'});console.log(JSON.stringify({name,startedAt,pid:process.pid}));const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});const completedAt=new Date().toISOString();writeFileSync(folder+'/'+name+'.stdout.log',r.stdout??'',{flag:'wx'});writeFileSync(folder+'/'+name+'.stderr.log',r.stderr??'',{flag:'wx'});writeFileSync(folder+'/'+name+'.json',JSON.stringify({command:process.execPath,args,cwd:root,startedAt,completedAt,exit:r.status,signal:r.signal},null,2),{flag:'wx'});console.log(JSON.stringify({name,completedAt,exit:r.status}));guards();if(r.status!==0)process.exit(r.status??1);}
writeFileSync(folder+'/complete.json',JSON.stringify({status:'PASS',completedAt:new Date().toISOString(),sourceFingerprint:receipt.sourceFingerprint,sourceUnchanged:true},null,2),{flag:'wx'});
