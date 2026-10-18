import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceZoneAvailability } from '../../src/app/service-zones';
import { createServiceZoneCatalog } from '../../src/world/service-zones';
import { serviceReferenceFixture } from '../browser/service-zones/road-fixture';
import { vehicleClass } from '../../src/vehicles/vehicle-classes';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference';
import type { PhysicsRecoveryPort,RecoveryPlacement,RecoveryNativeState } from '../../src/vehicles/recovery-port';
import type { PhysicsProbe } from '../../src/vehicles/physics';

function setup() {
  const map=serviceReferenceFixture(),catalog=createServiceZoneCatalog(map.map,map.graph),identity=Object.freeze({entityId:'subject',handle:1,generation:1});
  let serial=180,status:'SAFE'|'BLOCKED'|'INVALID_SUPPORT'='SAFE',steps=0,placements=0,releases=0,queries=0;
  let changeDuringQuery=()=>{};
  const config=vehicleClass('sedan');
  const mechanics=()=>({classId:config.classId,version:config.version,massKg:config.massKg,powerW:config.powerW,grip:config.grip,brakeAccelerationMps2:config.brakeAcceleration,wheels:config.wheels,turningRadiusM:config.turningRadiusM,appliedEngineForceN:[0,0,0,0],appliedSteeringRadians:[0,0,0,0],wheelBrakeImpulseLimitNs:[0,0,0,0]});
  const state=():RecoveryNativeState=>({identity,physicsStepSerial:serial,transform:{positionM:{x:0,y:.76,z:0},rotationQuaternion:{x:0,y:0,z:0,w:1}},velocityMps:{x:0,y:0,z:0},angularVelocityRadS:{x:0,y:0,z:0}});
  const requests:RecoveryPlacement[]=[];
  const native:PhysicsRecoveryPort={readNative:()=>state(),inspectPlacement(request){queries++;requests.push(request);changeDuringQuery();return{status,physicsStepSerial:serial,colliderCount:4,blockingColliderHandle:status==='BLOCKED'?77:null};},applyPlacement(){placements++;throw Error('Forbidden placement');},release(){releases++;}};
  const physics:Pick<PhysicsProbe,'bodyIdentity'|'readVehicleMechanics'>={bodyIdentity:()=>identity,readVehicleMechanics:mechanics};
  const feature=createServiceZoneAvailability({context:CONTROLLER_CONTEXT,catalog,physics,native});
  const query={category:'RECOVERY' as const,id:'point-safe',fromLaneId:'lane-2',access:'TAXI' as const,purpose:'PICKUP' as const};
  return{feature,catalog,identity,query,requests,setStatus(value:typeof status){status=value;},setMutation(fn:()=>void){changeDuringQuery=fn;},advance(){serial++;steps++;},counts:()=>({steps,placements,releases,queries}),dispose(){feature.dispose();catalog.dispose();}};
}
test('040 static accessibility and fresh actual occupancy remain separate; no movement ownership',()=>{
  const s=setup();try{assert.equal(s.feature.inspect(s.query,s.identity).status,'AVAILABLE');s.setStatus('BLOCKED');assert.equal(s.feature.inspect(s.query,s.identity).status,'OCCUPIED');s.setStatus('INVALID_SUPPORT');assert.equal(s.feature.inspect(s.query,s.identity).status,'INVALID_SUPPORT');assert.equal(s.requests[0].transform.positionM.y,.76);assert.equal(s.requests[0].transform.positionM.z,-12);}finally{s.dispose();}assert.deepEqual(s.counts(),{steps:0,placements:0,releases:0,queries:3});assert.equal(s.feature.getStats().ownedNativePorts,0);
});
test('040 unknown origin denies without native inspection; stale identity and advanced native serial reject',()=>{
  const s=setup();try{assert.equal(s.feature.inspect({...s.query,fromLaneId:'unknown'},s.identity).status,'DENIED');assert.equal(s.counts().queries,0);assert.throws(()=>s.feature.inspect(s.query,{...s.identity,generation:2}));s.setMutation(()=>s.advance());assert.throws(()=>s.feature.inspect(s.query,s.identity));assert.equal(s.feature.getStats().queriesInFlight,0);}finally{s.dispose();}
});
test('040 host callback reentry fails closed and original borrowed resources stay owned',()=>{
  const s=setup();s.setMutation(()=>s.feature.inspect(s.query,s.identity));try{assert.throws(()=>s.feature.inspect(s.query,s.identity));assert.equal(s.feature.getStats().queriesInFlight,0);}finally{s.dispose();}assert.equal(s.counts().placements,0);assert.equal(s.counts().releases,0);assert.throws(()=>s.feature.inspect(s.query,s.identity));
});
test('040 caller native identity getters are rejected without invoking hooks',()=>{
  const s=setup();let hooks=0;const identity={...s.identity};Object.defineProperty(identity,'entityId',{enumerable:true,get(){hooks++;return'subject';}});
  try{assert.throws(()=>s.feature.inspect(s.query,identity));assert.equal(hooks,0);assert.equal(s.counts().queries,0);}finally{s.dispose();}
});
test('040 disposal callback is rejected while an actual request is active',()=>{
  const s=setup();s.setMutation(()=>s.feature.dispose());try{assert.throws(()=>s.feature.inspect(s.query,s.identity));assert.equal(s.feature.getStats().disposed,false);assert.equal(s.feature.getStats().queriesInFlight,0);}finally{s.dispose();}assert.equal(s.counts().releases,0);
});
