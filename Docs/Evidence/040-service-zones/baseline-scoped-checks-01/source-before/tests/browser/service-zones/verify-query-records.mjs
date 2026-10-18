import assert from 'node:assert/strict';
export const CHANNELS = ['wholeMs','controllerIncrementalMs','nativeStepMs','nativeQueryMs','nativeBridgeMs','nativeTotalMs','explicitQueryMs'];
export function distribution(values) {
  assert(values.length > 0 && values.every(v => Number.isFinite(v) && v >= 0));
  const sorted = [...values].sort((a,b) => a-b);
  // Exact existing030 reference nearest-rank convention; no baseline interpolation.
  return Object.fromEntries([['p50',.5],['p95',.95],['p99',.99]].map(([k,p])=>[k,sorted[Math.ceil(sorted.length*p)-1]]));
}
function finite(value) {
  if(typeof value === 'number') assert(Number.isFinite(value));
  else if(value && typeof value === 'object') for(const child of Object.values(value)) finite(child);
}
export function verifyQueries(row) {
  assert.equal(row.queries.length,130);
  for(let i=0;i<130;i++) {
    const query=row.queries[i], tick=1+i*6;
    assert.equal(query.tick,tick);
    assert.equal(query.identity.entityId,'car-'+(i%row.count));
    const blocked=Math.floor(i/2)%2;
    assert.equal(query.anchorId,blocked?'point-blocked':'point-safe');
    assert.deepEqual(query.before,query.after,'Native state changed during readonly inspection');
    assert.deepEqual(query.before.identity,query.identity);
    assert.equal(query.before.physicsStepSerial,tick);
    assert.equal(query.inspection.physicsStepSerial,tick);
    assert(['SAFE','BLOCKED','INVALID_SUPPORT'].includes(query.inspection.status));
    if(query.inspection.status==='SAFE') {assert.equal(query.anchorId,'point-safe');assert.equal(query.inspection.blockingColliderHandle,null);}
    if(query.inspection.status==='BLOCKED') {assert.equal(query.anchorId,'point-blocked');assert(Number.isFinite(query.inspection.blockingColliderHandle) && query.inspection.blockingColliderHandle!==null);}
    if(query.inspection.status==='INVALID_SUPPORT') assert.equal(query.inspection.blockingColliderHandle,null);
    assert(Number.isSafeInteger(query.inspection.colliderCount) && query.inspection.colliderCount>=0 && query.inspection.colliderCount<=256);
    if(query.inspection.status!=='INVALID_SUPPORT') assert.equal(query.inspection.colliderCount,row.count+69,'Full actual collider traversal');
    else assert.equal(query.inspection.colliderCount,0);
    assert.equal(query.transform.positionM.x,0);
    assert.equal(query.transform.positionM.z,blocked?-5:-12);
    assert.equal(query.transform.positionM.y,query.before.transform.positionM.y);
    assert.deepEqual(query.transform.rotationQuaternion,{x:0,y:0,z:0,w:1});
    finite(query);
  }
  const measured=row.queries.filter(q=>q.tick>180);
  assert(measured.some(q=>q.inspection.status==='SAFE'),'Actual SAFE measured oracle required');
  assert(measured.some(q=>q.inspection.status==='BLOCKED'),'Actual BLOCKED measured oracle required');
  for(const parity of [0,1]) for(const status of ['SAFE','BLOCKED'])
    assert(measured.some(q=>Number(q.identity.entityId.slice(4))%2===parity && q.inspection.status===status),'Both actual classes '+parity+'/'+status);
}
export function verifyRun(row) {
  assert.equal(row.status,'PASS'); assert.equal(row.failure,null);
  assert.equal(row.completedTicks,780); assert.equal(row.warmupTicks,180); assert.equal(row.measuredTicks,600);
  verifyQueries(row);
  assert(Number.isFinite(row.loadingMs) && row.loadingMs>=0);
  assert(row.heapBeforeMeasured>0 && Number.isFinite(row.heapBeforeMeasured));
  assert(row.heapAfterMeasuredRaw>0 && Number.isFinite(row.heapAfterMeasuredRaw));
  assert.deepEqual(row.cleanup.attempts,['recovery','eventBus','controller','damage','world']);
  assert.deepEqual(row.cleanup.errors,[]);
  assert.equal(row.cleanup.recovery.vehicles,0); assert.equal(row.cleanup.recovery.disposed,true);
  assert.equal(row.cleanup.nativeRecovery.activePorts,0);
  assert.equal(row.cleanup.eventBus.retainedEvents,0); assert.equal(row.cleanup.eventBus.disposed,true);
  assert.equal(row.cleanup.controller.vehicles,0); assert.equal(row.cleanup.controller.players,0); assert.equal(row.cleanup.controller.disposed,true);
  assert.equal(row.cleanup.damage.vehicles,0); assert.equal(row.cleanup.damage.disposed,true);
  assert.equal(row.cleanup.body.entities,0); assert.equal(row.cleanup.body.subscriptions,0);
  assert.equal(row.cleanup.collision.colliders,0); assert.equal(row.cleanup.collision.disposed,true);
  assert.deepEqual(row.checkpoints.map(x=>x.tick),[240,300,360,420,480,540,600,660,720,780]);
  for(const digest of [row.physicalDigest,row.controlDigest,row.nativeInputDigest,...row.checkpoints.flatMap(x=>[x.physicalHash,x.controlHash,x.nativeHash])]) assert(/^[a-f0-9]{64}$/.test(digest));
  const fixed = ({appliedEngineForceN, appliedSteeringRadians,wheelBrakeImpulseLimitNs,...m})=>m;
  assert.equal(row.initialMechanics.length,row.count); finite(row.initialMechanics); finite(row.finalMechanics);
  assert.deepEqual(row.finalMechanics.map(fixed),row.initialMechanics.map(fixed));
  assert.equal(row.sampleBytes,row.observer?33600:0);
  if(row.observer) {
    assert.deepEqual(Object.keys(row.raw).sort(),[...CHANNELS].sort());
    for(const key of CHANNELS) {assert.equal(row.raw[key].length,600); assert.deepEqual(row.summaries[key],distribution(row.raw[key]));}
    if(row.count===70) assert(row.summaries.wholeMs.p95<=5.5,'Normal70 absolute5.5ms');
  } else {assert.equal(row.raw,null);assert.equal(row.summaries,null);}
}
