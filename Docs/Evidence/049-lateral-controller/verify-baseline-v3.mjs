// Strict preproduction/current-source verifier. Production049 must still be absent.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder='Docs/Evidence/049-lateral-controller',report=JSON.parse(await readFile(`${folder}/before-v3.json`,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),aggregate=createHash('sha256');
assert.equal(report.status,'PASS');
assert(Date.parse(report.startedAt)<=Date.parse(report.nativeArtifact.archivedAt));
assert(Date.parse(report.nativeArtifact.archivedAt)<=Date.parse(report.capturedAt));
try { await access('src/autonomy/lateral-controller.ts'); throw new Error('Production exists: use distinct after verifier later'); }
catch (error) { if(error.code!=='ENOENT')throw error; }
for(const input of report.inputs) {
  for(const path of [input.path,`${folder}/source-before-v3/${input.path}`]) {const bytes=await readFile(path);assert.equal(bytes.length,input.bytes);assert.equal(hash(bytes),input.sha256,path);}
  aggregate.update(input.path).update(await readFile(`${folder}/source-before-v3/${input.path}`));
}
assert.equal(aggregate.digest('hex'),report.sourceHash);
for(const path of [report.nativeArtifact.path,`${folder}/${report.nativeArtifact.archiveRelativePath}`]){const bytes=await readFile(path);assert.equal(bytes.length,report.nativeArtifact.bytes);assert.equal(hash(bytes),report.nativeArtifact.sha256);}
assert.equal(report.runs.length,20);assert.equal(report.parity.length,4);
for(const classId of ['sedan','compact']) {const [auto,manual]=report.parity.filter(r=>r.singleClass===classId);assert(!auto.manual&&manual.manual);assert.equal(auto.finalPhysicalHash,manual.finalPhysicalHash);assert.deepEqual(auto.checkpoints,manual.checkpoints);}
for(const count of [70,110]) {
  const runs=report.runs.filter(r=>r.count===count);assert.equal(runs.length,10);
  for(let pair=0;pair<5;pair++){assert.deepEqual(runs.filter(r=>r.pair===pair).map(r=>r.observer),pair%2?[true,false]:[false,true]);}
  for(const run of runs) {
    assert.equal(run.warmupTicks,180);assert.equal(run.measuredTicks,600);assert.equal(run.physicalTicks,780);assert.equal(run.referenceCalls,count*780);
    assert.equal(run.sampleBytes,run.observer?9600:0);assert.equal(run.drivingPoseWrites,0);assert.equal(run.drivingVelocityWrites,0);
    assert.equal(run.cleanup.controller.vehicles,0);assert.equal(run.cleanup.body.entities,0);assert.equal(run.cleanup.collision.colliders,0);
    assert.equal(run.finalPhysicalHash,runs[0].finalPhysicalHash);assert.equal(run.decisionDigest,runs[0].decisionDigest);assert.deepEqual(run.checkpoints,runs[0].checkpoints);
  }
}
const original=JSON.parse(await readFile(`${folder}/before.json`,'utf8'));
assert.equal(original.status,'PASS');
assert.equal(report.originalBeforeSourceHash,original.sourceHash);
assert.equal(report.originalPhysicalCompatibility,'exact20fleet+4parity');
const oldAggregate=createHash('sha256');
for(const input of original.inputs){const bytes=await readFile(`${folder}/source-before/${input.path}`);assert.equal(bytes.length,input.bytes);assert.equal(hash(bytes),input.sha256);oldAggregate.update(input.path).update(bytes);}
assert.equal(oldAggregate.digest('hex'),original.sourceHash);
const oldNative=await readFile(`${folder}/${original.nativeArtifact.archiveRelativePath}`);assert.equal(oldNative.length,original.nativeArtifact.bytes);assert.equal(hash(oldNative),original.nativeArtifact.sha256);
for(const kind of ['runs','parity']){assert.equal(report[kind].length,original[kind].length);for(let i=0;i<report[kind].length;i++){assert.equal(report[kind][i].decisionDigest,original[kind][i].decisionDigest);assert.equal(report[kind][i].finalPhysicalHash,original[kind][i].finalPhysicalHash);assert.deepEqual(report[kind][i].checkpoints,original[kind][i].checkpoints);assert.deepEqual(report[kind][i].envelope,original[kind][i].envelope);}}
console.log(JSON.stringify({status:'PASS',sourceHash:report.sourceHash,inputs:report.inputs.length,nativeHash:report.nativeArtifact.sha256,runs:report.runs.length,parityWorlds:report.parity.length,
  scope:'Strict chronology/source/native/physical determinism/ownership integrity only. Tracking envelope and provisional normal CPU budget require separate review; no hardware proof.'}));
