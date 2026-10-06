// Native calibration and realbrowser functional acceptance, separate from Node CPU verification.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const folder='Docs/Evidence/049-lateral-controller',historical=process.argv.includes('--historical');
const json=async name=>JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function source(report,archive) {
  const aggregate=createHash('sha256');
  for(const input of report.inputs) {
    const path=typeof input==='string'?input:input.path,bytes=await readFile(`${folder}/${archive}/${path}`);
    if(typeof input!=='string'){assert.equal(bytes.length,input.bytes);assert.equal(hash(bytes),input.sha256);}
    aggregate.update(path).update(bytes);
    if(!historical)assert((await readFile(path)).equals(bytes),`Current executed source differs: ${path}`);
  }
  assert.equal(aggregate.digest('hex'),report.sourceHash);
}
const calibration=await json('calibration-v3');assert.equal(calibration.status,'PASS');await source(calibration,'source-calibration-v3');
const native=await readFile(`${folder}/${calibration.nativeArtifact.archiveRelativePath}`);
assert.equal(native.length,calibration.nativeArtifact.bytes);assert.equal(hash(native),calibration.nativeArtifact.sha256);
if(!historical)assert.equal(hash(await readFile(calibration.nativeArtifact.path)),calibration.nativeArtifact.sha256);
assert(Date.parse(calibration.nativeArtifact.archivedAt)<=Date.parse(calibration.capturedAt));
assert.equal(calibration.runs.length,22);assert.equal(calibration.infeasible.length,4);
for(const classId of ['sedan','compact']) {
  for(const requestedSpeedMps of [3,5,7])for(const kind of ['STRAIGHT','LEFT','RIGHT'])
    assert.equal(calibration.runs.filter(r=>r.classId===classId&&r.requestedSpeedMps===requestedSpeedMps&&r.kind===kind).length,1);
  for(const kind of ['LEFT','RIGHT'])assert.equal(calibration.runs.filter(r=>r.classId===classId&&r.requestedSpeedMps===7.3&&r.kind===kind).length,1);
  for(const kind of ['OVERSPEED','TOO_TIGHT'])assert.equal(calibration.infeasible.filter(r=>r.classId===classId&&r.kind===kind).length,1);
}
for(const arm of calibration.runs) {
  assert(arm.completed);assert(arm.maximumCrossTrackM<=1);assert(arm.maximumDisplacementM<1);
  assert.equal(arm.authoredTurnCount,arm.kind==='STRAIGHT'?0:1);assert(arm.kind==='STRAIGHT'||arm.sawCurve);
  assert.equal(arm.drivingPoseWrites,0);assert.equal(arm.drivingVelocityWrites,0);
  assert.equal(arm.cleanup.lateral.actors,0);assert.equal(arm.cleanup.lateral.retainedVertices,0);assert.equal(arm.cleanup.body.entities,0);
  for(const point of arm.checkpoints){assert.equal(point.projection.feasible,true);assert.equal(point.projection.tick,point.tick);assert.equal(point.projection.sourceTick,point.tick-1);}
}
for(const arm of calibration.infeasible) {
  assert.equal(arm.projection.feasible,false);assert.equal(arm.projection.steering,0);assert.equal(arm.physicalTicks,0);
  assert.equal(arm.projection.reason,arm.kind==='OVERSPEED'?'REQUESTED_OVERSPEED':'MECHANICALLY_INFEASIBLE');
}
console.log(JSON.stringify({status:'PASS',mode:historical?'historical':'current-source',calibrationSourceHash:calibration.sourceHash,nativeSha256:calibration.nativeArtifact.sha256,validArms:calibration.runs.length,infeasibleArms:calibration.infeasible.length,scope:'Native physical calibration only; browser evidence remains pending.'}));
