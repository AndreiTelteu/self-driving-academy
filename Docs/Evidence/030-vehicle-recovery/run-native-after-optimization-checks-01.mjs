import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01';
assert.equal(process.cwd().replaceAll('\\','/'),root);
assert.equal(execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim().replaceAll('\\','/'),root);
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'loop-pbi/vehicle-recovery-01');
const ns='Docs/Evidence/030-vehicle-recovery/native-after-optimization-checks-01';
await mkdir(ns);
const files=['src/vehicles/controller-port.ts','src/vehicles/controller.ts','src/vehicles/recovery-state.ts','src/vehicles/rapier/index.ts','tests/browser/vehicle-recovery-after.mjs','tests/vehicles/recovery-owner.test.ts','tests/vehicles/recovery-native.test.ts','Docs/Evidence/030-vehicle-recovery/native-after-optimization-source.md'];
const rows=[],aggregate=createHash('sha256');
for(const path of files.slice().sort()) {const bytes=await readFile(path);const archived=`${ns}/source-before/${path}`;await mkdir(dirname(archived),{recursive:true});await writeFile(archived,bytes,{flag:'wx'});aggregate.update(path).update(bytes);rows.push({path,archived,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(`${ns}/source-before.json`,JSON.stringify({recordedAt:new Date().toISOString(),files:rows,fingerprint:aggregate.digest('hex')},null,2),{flag:'wx'});
const bin='F:/Sites/self-driving-academy/node_modules/';
const commands=[['format-write',[bin+'prettier/bin/prettier.cjs','--write',...files]],['format-check',[bin+'prettier/bin/prettier.cjs','--check',...files]],['type-source',[bin+'typescript/bin/tsc','--noEmit']],['type-tests',[bin+'typescript/bin/tsc','-p','tsconfig.tests.json','--noEmit']],['lint',[bin+'eslint/bin/eslint.js',...files.filter(p=>p.endsWith('.ts')),'--max-warnings','0']],['architecture',['scripts/verify-architecture.mjs']],['syntax',['--check','tests/browser/vehicle-recovery-after.mjs']],['pure',['--import','./scripts/register-typescript.mjs','--test','tests/vehicles/recovery-owner.test.ts','tests/vehicles/recovery-after-functional.test.mjs']]];
for(const [label,args]of commands) {const startedAt=new Date().toISOString();let stdout='',stderr='',exit=0;try{const result=await promisify(execFile)(process.execPath,args,{cwd:root,maxBuffer:16*1024*1024});stdout=result.stdout;stderr=result.stderr;}catch(error){stdout=error.stdout??'';stderr=error.stderr??String(error);exit=Number.isInteger(error.code)?error.code:1;}await writeFile(`${ns}/${label}.stdout.txt`,stdout,{flag:'wx'});await writeFile(`${ns}/${label}.stderr.txt`,stderr,{flag:'wx'});await writeFile(`${ns}/${label}.json`,JSON.stringify({command:process.execPath,args,workdir:root,startedAt,finishedAt:new Date().toISOString(),exit},null,2),{flag:'wx'});console.log(`${label} EXIT ${exit}`);if(exit){process.exitCode=exit;break;}}