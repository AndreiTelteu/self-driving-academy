// SOURCE-only bounded immutable069 record transport; no native/world acquisition.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const REFERENCE_PROTOCOL = Object.freeze({ version: '069-chronological-reference-v1',
  warmupTicks: 180, measuredTicks: 600, hz: 60, pairs: 5,
  populations: [70, 110], fleetWorlds: 20, semanticWorlds: 4,
  channels: ['tickMs', 'authorityMs', 'boundaryMs', 'deliveryMs', 'rapierMs'],
  sampleCount: 600, normalTickP95Ms: 5.5, normalRapierP95Ms: 3,
  recordByteCap: 65536, recordSampleCap: 32, recordEventCap: 8 });
export function descriptors() {
  const rows=[];
  for(const count of REFERENCE_PROTOCOL.populations) for(let pair=0;pair<5;pair++)
    for(const observer of pair%2===0?[false,true]:[true,false])
      rows.push({ ordinal:rows.length, count,pair,observer, classId:null,fixedMode:null,kind:'FLEET' });
  for(const classId of ['sedan','compact']) for(const fixedMode of ['MANUAL','LEARNING'])
    rows.push({ordinal:rows.length,count:2,pair:0,observer:true,classId,fixedMode,kind:'SEMANTIC'});
  return rows;
}
export async function immutableJson(path, value, cap=4*1024*1024) {
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
  assert(bytes.length<=cap,'Bounded immutable JSON');
  await mkdir(dirname(path),{recursive:true}); await writeFile(path,bytes,{flag:'wx'});
  return {bytes:bytes.length,sha256:sha256(bytes)};
}
export function nearestRank(values,p) {
  assert(values.length>0 && values.every(v=>Number.isFinite(v)&&v>=0),'Finite timing channel');
  return [...values].sort((a,b)=>a-b)[Math.ceil(p*values.length)-1];
}
export function distribution(values) { return { count:values.length,
  p50:nearestRank(values,.5),p95:nearestRank(values,.95),p99:nearestRank(values,.99),
  min:Math.min(...values),max:Math.max(...values) }; }
export function validateRecord(record, descriptor, sourceHash) {
  assert.deepEqual(record.descriptor,descriptor); assert.equal(record.sourceHash,sourceHash);
  assert.equal(record.status,'PASS'); assert.equal(record.attemptedTick,780);
  assert.equal(record.acceptedTick,780);assert.equal(record.timingSampleCount,descriptor.observer?600:0); assert.equal(record.nativeStepSerial,780);
  assert.equal(record.finiteBodyTickChecks,780*descriptor.count);
  for(const field of ['nativeInputDigest','packetDigest','physicalDigest','rawInputDigest'])
    assert.match(record[field],/^[a-f0-9]{64}$/);
  assert.equal(record.checkpoints.length,13);
  for(let i=0;i<13;i++) { const cp=record.checkpoints[i]; assert.equal(cp.tick,(i+1)*60);
    assert.equal(cp.nativeStepSerial,cp.tick); assert.equal(cp.bodies.length,descriptor.count);
    for(const body of cp.bodies) { assert.equal(typeof body.identity.entityId,'string');
      assert(Number.isSafeInteger(body.identity.generation)&&body.identity.generation>0);
      for(const value of [...Object.values(body.transform.positionM),...Object.values(body.transform.rotationQuaternion),...Object.values(body.velocityMps)]) assert(Number.isFinite(value)); }
  }
  assert.equal(record.drivingHostMutations,0); assert.equal(record.cleanup.errors.length,0);
  assert.deepEqual(record.cleanup.snapshots.body,{entities:0,subscriptions:0});
  assert.equal(record.cleanup.snapshots.collision.vehicles,0);
  assert.equal(record.cleanup.snapshots.collision.obstacles,0);
  assert.equal(record.cleanup.snapshots.collision.colliders,0);
  assert.equal(new Set(record.cleanup.attempts).size,record.cleanup.attempts.length);
  assert.deepEqual(record.cleanup.attempts,[...record.acquiredOwners].reverse());
  for(const name of ['controller','authority','mode','keyboard','segment','selection','bus'])
    assert.equal(record.cleanup.snapshots[name].disposed,true);
  assert.equal(record.cleanup.snapshots.segment.retainedRecords,0);
  assert.equal(record.cleanup.snapshots.bus.retainedEvents,0);
  assert.equal(record.cleanup.snapshots.cameraTarget,null);
  assert.equal(record.cleanup.disposedReadRejected,true);
  for(const channel of REFERENCE_PROTOCOL.channels) {
    if(!descriptor.observer) {assert.equal(record.raw[channel],null);assert.equal(record.distributions[channel],null);}
    else {assert.equal(record.raw[channel].length,600);assert.deepEqual(record.distributions[channel],distribution(record.raw[channel]));}
  }
  if(descriptor.observer&&descriptor.count===70) {
    assert(record.distributions.tickMs.p95<=5.5,'Normal tick absolute gate');
    assert(record.distributions.rapierMs.p95<=3,'Normal Rapier absolute gate');
  }
  assert(record.liveRecords.archivedUtf8Bytes<=262144);
  assert(record.liveRecords.retainedRecords<=64);
  assert(record.segmentRecords.length>=1&&record.segmentRecords.length<=64);
  for(const entry of record.segmentRecords) {
    assert(entry.samples.length<=32&&entry.events.length<=8);
    assert(Buffer.byteLength(JSON.stringify(entry))<=65536);
    assert.equal(entry.learningEligible,false,'Reference does not infer eligibility');
    assert.equal(entry.completeness,'CLOSED');
    assert(entry.samples.every(s=>s.tick>=entry.startTick&&s.tick<entry.endTick),'Reference boundary t belongs new segment');
  }
}
export async function verifyInventory(folder, sourceHash) {
  const expected=descriptors(), files=await readdir(resolve(folder,'worlds'));
  assert.deepEqual(files.sort(),expected.flatMap(v=>['world-'+v.ordinal+'.started.json','world-'+v.ordinal+'.complete.json']).sort(),'Exact world inventory');
  const records=[];
  for(const d of expected) {
    const started=JSON.parse(await readFile(resolve(folder,'worlds/world-'+d.ordinal+'.started.json')));
    const record=JSON.parse(await readFile(resolve(folder,'worlds/world-'+d.ordinal+'.complete.json')));
    assert.deepEqual(started.descriptor,d);assert.equal(started.sourceHash,sourceHash);
    assert(Date.parse(started.startedAt)<=Date.parse(record.completedAt));
    validateRecord(record,d,sourceHash);records.push(record);
  }
  for(const count of [70,110])for(let pair=0;pair<5;pair++) {
    const arms=records.filter(v=>v.descriptor.count===count&&v.descriptor.pair===pair);
    assert.equal(arms.length,2);
    for(const field of ['nativeInputDigest','packetDigest','physicalDigest','rawInputDigest']) assert.equal(arms[0][field],arms[1][field],'OFF/ON '+field);
    assert.deepEqual(arms[0].checkpoints,arms[1].checkpoints,'OFF/ON exact native states');
  }
  return records;
}
