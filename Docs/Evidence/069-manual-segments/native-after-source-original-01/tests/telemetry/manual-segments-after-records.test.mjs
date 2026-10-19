// SOURCE-only adverse comparison DTO tests. No world/native initialization, server or browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import {descriptors,compareOriginal,distribution} from '../../scripts/manual-segments-after-records.mjs';
const digest='a'.repeat(64);
function fixture(){return descriptors().map(descriptor=>({descriptor,nativeInputDigest:digest,packetDigest:digest,physicalDigest:digest,rawInputDigest:digest,checkpoints:[{tick:60,nativeStepSerial:60}],boundaryTrace:[{tick:1,mode:'MANUAL',reason:null,completeness:'OPEN'}],distributions:Object.fromEntries(['tickMs','authorityMs','rapierMs'].map(c=>[c,distribution(Array(600).fill(3))])),heap:{afterMeasured:{heapUsed:40*1024*1024}}}));}
test('AFTER exact original physical/input/closure parity rejects forged native and omitted world',()=>{
 const before=fixture(),after=fixture();assert.equal(compareOriginal(before,after).verdict,'PASS');after[0].nativeInputDigest='b'.repeat(64);assert.throws(()=>compareOriginal(before,after));assert.throws(()=>compareOriginal(before,after.slice(1)));
});
test('AFTER original10percent AND1ms three-of-five gate keeps individual failures and exact borderline',()=>{
 const before=fixture(),after=fixture();for(const r of after)if(r.descriptor.count===70&&r.descriptor.observer&&r.descriptor.pair<3)r.distributions.tickMs=distribution(Array(600).fill(4.01));const report=compareOriginal(before,after);assert.equal(report.verdict,'FAIL');assert.equal(report.rows.find(r=>r.count===70&&r.channel==='tickMs').failedPairs,3);
 for(const r of after)if(r.descriptor.count===70&&r.descriptor.observer)r.distributions.tickMs=distribution(Array(600).fill(4));assert.equal(compareOriginal(before,after).rows.find(r=>r.count===70&&r.channel==='tickMs').failedPairs,0);
});
test('AFTER matched rawheap3of5 usesboth10percent and5MiB, never disposedheap or no observer timings',()=>{
 const before=fixture(),after=fixture();for(const r of after)if(r.descriptor.count===110&&!r.descriptor.observer&&r.descriptor.pair<3)r.heap.afterMeasured.heapUsed+=6*1024*1024;const result=compareOriginal(before,after);assert.equal(result.verdict,'FAIL');assert.equal(result.rows.find(r=>r.channel==='RAW_RUNTIME_JS_HEAP_USED'&&r.count===110&&!r.observer).failedPairs,3);assert.equal(result.rows.find(r=>r.count===70&&r.channel==='tickMs').failedPairs,0);
});
