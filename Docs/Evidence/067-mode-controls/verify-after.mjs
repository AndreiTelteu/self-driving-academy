import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder='Docs/Evidence/067-mode-controls', historical=process.argv.includes('--historical');
const report=JSON.parse(await readFile(`${folder}/after.json`,'utf8'));
const beforeBytes=await readFile(`${folder}/before.json`), before=JSON.parse(beforeBytes);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'), aggregate=createHash('sha256');
assert.equal(report.status,'PASS');assert.equal(before.status,'PASS');assert.equal(report.fixtureVersion,before.fixtureVersion);assert.equal(report.baseline.sha256,hash(beforeBytes));
for(const input of report.inputs){const bytes=await readFile(`${folder}/source-after/${input.path}`);assert.equal(bytes.length,input.bytes);assert.equal(hash(bytes),input.sha256);aggregate.update(input.path).update(bytes);if(!historical)assert.equal(hash(await readFile(input.path)),input.sha256);}
assert.equal(aggregate.digest('hex'),report.sourceHash);
for(const path of ['src/input/mode-controls.ts','src/input/mode-keyboard.ts','src/ui/control-mode-hud.ts','scripts/benchmark-mode-controls-after.mjs'])assert(report.inputs.some(i=>i.path===path));
const native=await readFile(`${folder}/${report.nativeArtifact.archiveRelativePath}`);assert.equal(native.length,report.nativeArtifact.bytes);assert.equal(hash(native),report.nativeArtifact.sha256);assert.equal(report.nativeArtifact.sha256,before.nativeArtifact.sha256);if(!historical)assert.equal(hash(await readFile(report.nativeArtifact.path)),report.nativeArtifact.sha256);
const started=JSON.parse(await readFile(`${folder}/after-started.json`,'utf8')), first=JSON.parse(await readFile(`${folder}/after-first-world.json`,'utf8'));
assert.equal(started.startedAt,report.startedAt);assert.equal(first.firstWorldAt,report.firstWorldAt);assert.equal(first.sourceHash,report.sourceHash);assert.equal(first.nativeSha256,report.nativeArtifact.sha256);assert.equal(first.nativeArchivedAt,report.nativeArtifact.archivedAt);
assert(Date.parse(report.startedAt)<=Date.parse(report.nativeArtifact.archivedAt));assert(Date.parse(report.nativeArtifact.archivedAt)<=Date.parse(report.firstWorldAt));assert(Date.parse(report.firstWorldAt)<=Date.parse(report.capturedAt));
const zero={intents:0,inFlight:0,disposed:true,fault:null,projection:null,retainedHistory:0};
const distribution=values=>{const sorted=[...values].sort((a,b)=>a-b);return {p50:sorted[Math.floor((sorted.length-1)*.5)],p95:sorted[Math.floor((sorted.length-1)*.95)],p99:sorted[Math.floor((sorted.length-1)*.99)]};};
const physicalKeys=['decisionDigest','rawPlayerDigest','checkpoints','finalPhysicalHash','clearCalls','modeCounts','transitions','transitionCounts','ignoredAI','ignoredPLAYER','maximumPlayers','createdFilters','disposedFilters','drivingPoseWrites','drivingVelocityWrites'];
for(const [channel,count] of [['runs',20],['parity',6],['handoff',4],['rejections',2],['expiry',2]]) {
 assert.equal(report[channel].length,count);assert.equal(before[channel].length,count);
 for(let i=0;i<count;i++){const current=report[channel][i],baseline=before[channel][i];for(const key of channel==='rejections'||channel==='expiry'?Object.keys(baseline):physicalKeys)assert.deepEqual(current[key],baseline[key],`${channel}[${i}].${key}`);}
}
for(const run of [...report.runs,...report.parity,...report.handoff]) {
 assert.equal(run.physicalTicks,780);assert.equal(run.warmupTicks,180);assert.equal(run.measuredTicks,600);assert.equal(run.sampleBytes,run.observer?19200:0);
 assert.deepEqual(run.cleanup.modeControls,zero);assert.equal(run.cleanup.controller.vehicles,0);assert.equal(run.cleanup.authority.vehicles,0);assert.equal(run.cleanup.authority.players,0);assert.equal(run.cleanup.authority.disposed,true);assert.equal(run.cleanup.body.entities,0);assert.equal(run.cleanup.collision.colliders,0);assert.equal(run.cleanup.activeFilters,0);assert.equal(run.createdFilters,run.disposedFilters);
 assert.equal(run.lifecycleCycles.length,20);for(const cycle of run.lifecycleCycles){assert.equal(cycle.registeredVehicles,run.count);assert.equal(cycle.live.intents,0);assert.equal(cycle.live.inFlight,1);assert.deepEqual(cycle.cleanup,zero);}
 if(run.observer){for(const [channel,metric] of [['tick','tickMs'],['controller','existingControllerMs'],['authority','authorityOverheadMs'],['modeControls','modeControlsMs']]){const samples=run.rawTimingSamples[channel];assert.equal(samples.length,600);assert(samples.every(n=>Number.isFinite(n)&&n>=0));assert.deepEqual(distribution(samples),run[metric]);}}
 else {assert.equal(run.rawTimingSamples,null);assert.equal(run.tickMs,null);assert.equal(run.existingControllerMs,null);assert.equal(run.authorityOverheadMs,null);assert.equal(run.modeControlsMs,null);}
}
for(const run of [...report.rejections,...report.expiry])assert.deepEqual(run.modeControlsCleanup,zero);
for(const count of [70,110]) {
 const group=report.runs.filter(r=>r.count===count);assert.equal(group.length,10);assert.deepEqual(group.map(r=>r.observer),[false,true,true,false,false,true,true,false,false,true]);
 for(const run of group){assert.equal(run.maximumPlayers,1);assert.deepEqual(Object.keys(run.transitionCounts).sort(),['AUTO:M:MANUAL','MANUAL:L:LEARNING','LEARNING:L:MANUAL','MANUAL:M:AUTO','AUTO:L:LEARNING','LEARNING:M:AUTO'].sort());assert(Object.values(run.transitionCounts).every(n=>n>0));}
 const pairs=group.filter(r=>r.observer).map(current=>{const old=before.runs.find(r=>r.count===count&&r.pair===current.pair&&r.observer);const deltaMs=current.tickMs.p95-old.tickMs.p95;return {pair:current.pair,beforeP95:old.tickMs.p95,afterP95:current.tickMs.p95,deltaMs,ratio:current.tickMs.p95/old.tickMs.p95,regression:deltaMs>1&&current.tickMs.p95>old.tickMs.p95*1.1,ownStageP95:current.modeControlsMs.p95};});
 const comparison=report.comparisons.find(c=>c.count===count);assert.deepEqual(comparison.pairs,pairs);assert.equal(comparison.regressedPairs,pairs.filter(p=>p.regression).length);assert(comparison.regressedPairs<3);
 if(count===70)assert(group.filter(r=>r.observer).every(r=>r.tickMs.p95<=5.5));
}
console.log(JSON.stringify({status:'PASS',mode:historical?'historical':'current',sourceHash:report.sourceHash,inputs:report.inputs.length,nativeSha256:report.nativeArtifact.sha256,worlds:34,comparisons:report.comparisons,scope:report.timingScope}));
