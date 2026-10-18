import assert from 'node:assert/strict';
const finite=v=>{assert.ok(typeof v==='number'&&Number.isFinite(v)&&v>=0);return v;};
export function validateInitialCallbacks(record){
 assert.equal(record.rejectedCallback,null);
 const rows=record.initialWarmCallbacks;assert.ok(Array.isArray(rows)&&(rows.length===1||rows.length===2));
 const duplicate=record.initialDuplicateCallbacks;assert.ok(duplicate===0||duplicate===1);assert.equal(rows.length,1+duplicate);
 assert.equal(record.actualCallbackCount,1+record.warmFrames+record.frames+duplicate);
 let lastRead=record.initialRafProof.callbackObservedAt;
 for(const [index,row] of rows.entries()){
  assert.deepEqual(Object.keys(row).sort(),['activeRealSecondsBefore','callbackObservedAt','counterAfter','counterBefore','debtSecondsBefore','outcome','previousStamp','requestStartedAt','returnedStamp','timeoutObservedAt']);
  assert.equal(row.outcome,'RETURNED');assert.equal(row.timeoutObservedAt,null);
  assert.ok(finite(row.requestStartedAt)>=lastRead&&finite(row.callbackObservedAt)>=row.requestStartedAt);lastRead=row.callbackObservedAt;
  assert.equal(row.previousStamp,record.warmStarted);assert.equal(record.warmStarted,record.initialRafProof.stampMs);
  for(const p of [row.counterBefore,row.counterAfter])assert.deepEqual(p,{nativeSerial:0,controllerTick:0});
  assert.equal(row.debtSecondsBefore,0);assert.equal(row.activeRealSecondsBefore,0);
  const stamp=finite(row.returnedStamp);assert.ok(stamp<=row.callbackObservedAt||Math.abs(stamp-row.callbackObservedAt)<=1e-6);
  if(duplicate&&index===0)assert.equal(stamp,record.warmStarted);
  else assert.ok(stamp>record.warmStarted&&stamp-record.warmStarted<=250);
  if(index===1)assert.ok(row.callbackObservedAt-row.requestStartedAt<=250);
 }
 return {duplicate,callbacks:rows.length};
}
