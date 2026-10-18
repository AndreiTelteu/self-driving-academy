import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyProductQuery} from '../browser/service-zones/after-proof.mjs';
function fixture(){return{anchorId:'point-safe',inspection:{status:'SAFE'},before:{physicsStepSerial:1},product:{category:'SERVICE',id:'service',anchorNodeId:'040-safe',positionM:{x:0,y:0,z:-12},corridor:{mapId:'040-authored-service-baseline-v1',laneId:'lane-0',access:'TAXI',start:{x:0,y:0,z:-40},end:{x:0,y:0,z:100},widthM:24},status:'AVAILABLE'}};}
test('040 extra product proof cannot relabel an unrelated site or corridor as the baseline anchor',()=>{
  const original=fixture(),copy=structuredClone(original);assert.deepEqual(verifyProductQuery(original),{anchorId:'point-safe',inspection:{status:'SAFE'},before:{physicsStepSerial:1}});assert.deepEqual(original,copy);
  for(const mutate of [q=>q.product.id='foreign',q=>q.product.anchorNodeId='040-blocked',q=>q.product.corridor.end.z=90,q=>q.product.positionM.z=-5,q=>q.product.extra=true]){const q=fixture();mutate(q);assert.throws(()=>verifyProductQuery(q));}
});
test('040 raw native occupancy/support remains authoritative over declared availability',()=>{
  for(const status of ['BLOCKED','INVALID_SUPPORT','UNKNOWN']){const q=fixture();q.inspection.status=status;assert.throws(()=>verifyProductQuery(q));}
});
