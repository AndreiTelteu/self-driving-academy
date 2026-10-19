import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import * as prettier from 'prettier';
const cwd = 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01';
const relative = 'Docs/Evidence/026-wheel-dynamics/v2-finite-checks-20261007-r3';
const out = resolve(cwd,relative), handoff = resolve(cwd,'Docs/Evidence/026-wheel-dynamics/v2-source-handoff-20261007-r2');
const read = name => readFileSync(join(out,name),'utf8');
const save = (name,value) => writeFileSync(join(out,name),typeof value === 'string' ? value : JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const after=JSON.parse(read('after.json'));
const sourceDifferences=[];
for (const item of after.source) {
  const old=readFileSync(join(handoff,'source',item.path),'utf8'), current=readFileSync(resolve(cwd,item.path),'utf8');
  const config=await prettier.resolveConfig(resolve(cwd,item.path));
  const formattedOld=await prettier.format(old,{...config,filepath:item.path});
  sourceDifferences.push({path:item.path,byteChanged:after.changes.some(change=>change.path===item.path),formatOnly:formattedOld===current,normalizedOriginal:formattedOld===current ? undefined : formattedOld,current:formattedOld===current ? undefined : current});
}
save('source-differences.json',sourceDifferences);
const checks=readdirSync(out).filter(name=>name.endsWith('.json')).map(name=>{try{return JSON.parse(read(name));}catch{return null;}}).filter(value=>value?.label);
const suites=['lifetime','ledger','capacity','numeric-reader','device-loss'].map(name=>({name,...JSON.parse(read(`test-${name}-first.json`)),stdout:read(`test-${name}-first.stdout.txt`)}));
save('summary.json',{at:new Date().toISOString(),scope:'Finite pure/static/ephemeral HTTP; no hardware acceptance',checks,suites:suites.map(({stdout,...suite})=>({...suite,tests:Number(stdout.match(/tests (\d+)/)?.[1]),pass:Number(stdout.match(/pass (\d+)/)?.[1]),fail:Number(stdout.match(/fail (\d+)/)?.[1])})),originalsEqual:after.originalsEqual,immutableMetadataMatches:after.immutableMetadataMatches,sourceHash:after.sourceHash,sourceHashScope:after.sourceHashScope,cpuReleased:true,http:{pid:87240,port:11759,closedInFinally:true},reservation5220:'NOT_BOUND',activeOwnedProcesses:[]});
save('README.md',`# 026 finite checks r3 — pure/static PASS; hardware pending

Read-only Git verification: assigned worktree \\wheel-dynamics-01, branch loop-pbi/wheel-dynamics-01, HEAD e52e10b1170db7b8882d6581bdbd4027d2149fb6. Every terminal command and spawned check supplied F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01. Before inventory timestamp: 2026-10-07T01:55:58.553Z. Installed ancestor packages: Prettier 3.9.9, TypeScript 7.0.2, ESLint 10.12.0; exact binary paths, command arguments, PIDs, exit codes and start/end timestamps are in each command JSON. stdout/stderr are separate CreateNew/wx .txt files. No first failure was overwritten.

## Executed results

| Check | Actual exit/result |
| --- | --- |
| Format first | 1: 20 owned files need formatting |
| Format write + after + final | 0 each; exact 21 owned files only |
| Scoped lint first | 1: unnecessary regex escape, unused readEvidenceJson import, unmatched .mts configuration |
| Scoped lint after | 0; all 20 MJS/TS/MTS files, max warnings 0 |
| tsconfig.json | 0; includes tests/browser and v2 main.ts |
| tsconfig.tests.json | 0 |
| MJS syntax | 15 commands, each 0 |
| Architecture | 0; 108 TS files, 6 dependency/4 inspector/3 Rapier negative probes |
| Lifetime | 0; 13/13 |
| Ledger | 0; 5/5 |
| Capacity | 0; 2/2 |
| Numeric reader | 0; 4/4 |
| Device loss | 0; 1/1; existing loader via absolute Windows file URL |

Total: 25/25 tests passed, 0 failed/cancelled/skipped/todo. The device-loss loader emitted the preserved Node experimental stripTypeScriptTypes warning. No other test failed. Exact test names are in the five stdout files and summary.json.

## Sizing from actual capacity exit 0

| Logical record | Bytes | 512 KiB parts | Maximum encoded part request |
| --- | ---: | ---: | ---: |
| Raw | 13,229,880 | 26 | 705,549 |
| Terminal | 12,617,226 | 25 | 705,549 |
| Terminal-error | 13,438,060 | 26 | 705,549 |

Unchanged request limit 4,194,304 bytes; logical limit 16,777,216 bytes. Raw exceeds the single-request limit by 9,035,576 bytes and retains 3,547,336 bytes of logical headroom. Terminal headroom 4,159,990; terminal-error headroom 3,339,156; maximum request headroom 3,488,755. Five 30,000-wide numeric channels use the widest finite JSON token; 128 escaped causes, 4,096 finite journal records, 4,096 LongTasks, eight real-schema maximum calibration curves and export causes are retained. Joining proved byte equality; 16 MiB+1 was rejected; 10,000 synthetic RAFs retained zero per-frame journal records. These are test-only capacity bounds, not measured browser RAM/overhead or native/GPU acceptance.

## Changes and identity

20 files changed from immutable r2; transport.mjs is byte-identical. source-differences.json compares each current file with its r2 copy after applying the installed project formatter. Beyond formatting, ledger.test.mjs adds platform-aware absolute resolved os.tmpdir containment plus unique 026-v2-ledger-/026-v2-portable- basename assertions immediately before either recursive rm; removes an unused PART_BYTES import; protects HTTP acquisition with finally and records actual listener PID/address/closure. capacity.test.mjs emits exact measured logical/part/request sizes. numeric-reader.mjs replaces the escaped regex with explicit slash/backslash/colon checks (also rejects a leading Windows backslash). server.mjs removes the unused readEvidenceJson import. No threshold, physics, duration, baseline or terminal acceptance was weakened. The lint evidence config extends repository rules only for owned MJS and .mts because the repository config does not cover them. It changes no repository configuration.

Ordered 21-file source-only aggregate SHA256: ${after.sourceHash}. sourceInventoryHash and individual bytes/SHA256 are in after.json; byte-exact current copies are under source/. This is not a Vite build sourceHash/artifactHash and cannot relabel old captures CURRENT.

139 original paths (r1/r2 archives, selected old harness/reference files, original native reports/artifacts/source inputs) rehashed equal before/after. All 264 declared metadata records were rehashed; all non-owned records match their r2-declared bytes/SHA256, with no unexpected mismatch. after.json retains every comparison; owned formatted source differences are explicit. Original BEFORE 4f25789987ab81ad3bac1aa717ce11b351e9bb3860193e3772a199622e97d6e7 and AFTER-main-027 b696b02d00956797b91e1cad5bc53263f9e765047b506f7ff73030cb26f7901f source identities remain unchanged; both native artifacts retain 4,340,292 bytes/SHA256 02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0. r2 README/status/source copies and r1 archives remain byte-identical.

## Residual risks and limits

Production ownership findings remain parent-owned: nested backend cleanup can replace earlier causes; Babylon backend acquisition/partial sequential cleanup can miss independent releases after an exception; Rapier factory lacks a pre-return free/decrement guard after world acquisition. No production repair or leak reproduction was attempted. The Babylon 9.29 private _device.lost bridge requires parent review; injected pure promise coverage does not prove actual device-loss behavior. Numeric mutation tests cover their authored cases, not every malformed schema or a fresh BOTH-backend verifySuite archive. HTTP part lossless protocol tests and capacity encoding tests are separate; full browser ingestion, instrumentation overhead, exact RAM and native/full-capacity validation remain unexecuted here. Historical R3/R4 FAIL/INCOMPLETE remains unchanged; stall causation remains unknown.

No browser/UI/build/native/world/hardware/CIM/worker/subagent or long-running server was operated. No old harness/capture/baseline/production/board/index or Git mutation occurred. Existing tracked Docs/wheel-dynamics.md, scripts/verify-wheel-dynamics.mjs and tests/browser/wheel-dynamics/main.ts differences were present before this grant. No PBI Done claim or board movement. No staging; future-exact-paths-complete.txt lists new evidence paths individually. No .log files were created; globally ignored .log paths must be force-staged only by exact future path if subsequently created.

CPU grant released after these finite checks. HTTP PID 87240 bound only 127.0.0.1:11759 and reported listening=false after finally closure. Its Node parent PID 45320 exited 0; all recorded check processes exited. No owned process/listener remains. 5220 was never bound. Parent review/build/fresh physical foreground diagnostic remains a separate decision.
`);
function tree(path) {return readdirSync(resolve(cwd,path),{withFileTypes:true}).flatMap(item=>item.isDirectory()?tree(path+'/'+item.name):[path+'/'+item.name]);}
save('future-exact-paths-complete.txt',[...tree(relative),relative+'/future-exact-paths-complete.txt'].sort().join('\n')+'\n');
save('completion.json',{at:new Date().toISOString(),pid:process.pid,evidence:tree(relative).map(path=>{const bytes=readFileSync(resolve(cwd,path));return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}),cpuReleased:true,activeOwnedProcesses:[]});
console.log(JSON.stringify({tests:25,passed:25,sourceHash:after.sourceHash,originalsEqual:after.originalsEqual,immutableMetadataMatches:after.immutableMetadataMatches,semanticChanges:sourceDifferences.filter(item=>!item.formatOnly).map(item=>item.path),cpuReleased:true}));
