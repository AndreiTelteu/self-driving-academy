// Distinct AFTER verifier. Original preproduction absence verifiers intentionally remain unchanged.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder='Docs/Evidence/049-lateral-controller',historical=process.argv.includes('--historical');
const json=async name=>JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function verifySource(report,archive,current=false) {
  const aggregate=createHash('sha256');
  for(const input of report.inputs) {
    const bytes=await readFile(`${folder}/${archive}/${input.path}`);
    assert.equal(bytes.length,input.bytes);assert.equal(hash(bytes),input.sha256);aggregate.update(input.path).update(bytes);
    if(current&&!historical){const fresh=await readFile(input.path);assert.equal(fresh.length,input.bytes);assert.equal(hash(fresh),input.sha256,input.path);}
  }
  assert.equal(aggregate.digest('hex'),report.sourceHash);
  const native=await readFile(`${folder}/${report.nativeArtifact.archiveRelativePath}`);
  assert.equal(native.length,report.nativeArtifact.bytes);assert.equal(hash(native),report.nativeArtifact.sha256);
  assert(Date.parse(report.startedAt)<=Date.parse(report.nativeArtifact.archivedAt));
  assert(Date.parse(report.nativeArtifact.archivedAt)<=Date.parse(report.capturedAt));
  if(current&&!historical)assert.equal(hash(await readFile(report.nativeArtifact.path)),report.nativeArtifact.sha256);
}
const original=await json('before'),before=await json('before-v3'),failed=await json('before-v2'),after=await json('after');
await verifySource(original,'source-before');await verifySource(before,'source-before-v3');await verifySource(failed,'source-before-v2');await verifySource(after,'source-after',true);
assert.equal(original.status,'PASS');assert.equal(before.status,'PASS');assert.equal(after.status,'PASS');assert.equal(failed.status,'FAIL');
assert.match(failed.failure.message,/Intermediate physical result changed/);
assert.equal(after.beforeSourceHash,before.sourceHash);assert.equal(after.originalBeforeSourceHash,original.sourceHash);
await assert.rejects(access(`${folder}/source-before/src/autonomy/lateral-controller.ts`));
await assert.rejects(access(`${folder}/source-before-v3/src/autonomy/lateral-controller.ts`));
await access(`${folder}/source-after/src/autonomy/lateral-controller.ts`);
assert(Date.parse(before.capturedAt)<Date.parse(after.startedAt));
assert.equal(after.runs.length,20);assert.equal(after.parity.length,4);
for(const reference of [original,before])for(const kind of ['runs','parity']) {
  assert.equal(reference[kind].length,after[kind].length);
  for(let i=0;i<after[kind].length;i++) {
    const a=after[kind][i],b=reference[kind][i];
    assert.equal(a.decisionDigest,b.decisionDigest);assert.equal(a.finalPhysicalHash,b.finalPhysicalHash);
    assert.deepEqual(a.checkpoints,b.checkpoints);assert.deepEqual(a.envelope,b.envelope);
    assert.equal(a.drivingPoseWrites,0);assert.equal(a.drivingVelocityWrites,0);
    assert.equal(a.physicalTicks,780);assert.equal(a.sampleBytes,a.observer?9600:0);
    assert.equal(a.owned.lateral.actors,a.count);assert.equal(a.owned.lateral.retainedVertices,a.count*65);
    assert.equal(a.owned.lateral.retainedHistory,0);assert.equal(a.cleanup.lateral.actors,0);
    assert.equal(a.cleanup.lateral.identities,0);assert.equal(a.cleanup.lateral.retainedVertices,0);assert.equal(a.cleanup.lateral.projections,0);
    assert.equal(a.cleanup.body.entities,0);assert.equal(a.cleanup.controller.vehicles,0);assert.equal(a.cleanup.collision.colliders,0);
  }
}
const median=values=>[...values].sort((a,b)=>a-b)[2], comparisons=[];
for(const count of [70,110]) {
  const runs=after.runs.filter(r=>r.count===count&&r.observer);assert.equal(runs.length,5);
  if(count===70)assert(runs.every(r=>r.tickMs.p95<=5.5),'Provisional normal authoritative CPU budget failed');
  for(const reference of [original,before]) {
    const prior=reference.runs.filter(r=>r.count===count&&r.observer);
    const regressions=runs.filter((r,i)=>r.tickMs.p95>prior[i].tickMs.p95*1.1&&r.tickMs.p95-prior[i].tickMs.p95>1);
    assert(regressions.length<3,'Confirmed relative regression against preserved baseline');
    comparisons.push({count,baselineSourceHash:reference.sourceHash,beforeP95Ms:prior.map(r=>r.tickMs.p95),afterP95Ms:runs.map(r=>r.tickMs.p95),
      beforeMedianMs:median(prior.map(r=>r.tickMs.p95)),afterMedianMs:median(runs.map(r=>r.tickMs.p95)),regressionConfirmations:regressions.length});
  }
}
const result={status:'PASS',verifiedAt:new Date().toISOString(),mode:historical?'historical':'current-source',afterSourceHash:after.sourceHash,
  beforeSourceHash:before.sourceHash,originalBeforeSourceHash:original.sourceHash,comparisons,
  scope:'Native049 AFTER/source/native/determinism/ownership/CPU only; actualTURN/infeasibility calibration and both realbrowser backends require separate acceptance evidence. No renderer/FPS/fullgame/laptop claim.'};
await writeFile(`${folder}/${historical?'after-historical-summary':'after-summary'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
