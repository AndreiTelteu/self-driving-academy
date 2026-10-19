/** SOURCE-only AFTER fixture. No native acquisition at import time. */
import {createVehicleController} from '../../src/vehicles';
import type {BodyIdentity} from '../../src/vehicles';
import type {PhysicsProbe} from '../../src/vehicles/rapier';
import {createControlAuthority} from '../../src/input';
import {createManualSegmentBridge} from '../../src/app';
import {admitInterventionRecord,createInterventionRecordStore,createInterventionEventTransport,createInterventionIntake,parseInterventionSegment} from '../../src/telemetry';
import type {InterventionSegment} from '../../src/telemetry';
import type {ContractContext} from '../../src/sessions';
import {bodySnapshot,sameNativeSnapshot} from '../input/vehicle-selection-native-guard-v2';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
export function createAfterResourceScope(){
 const owners:{name:string;dispose:()=>void}[]=[],readers=new Map<string,()=>unknown>();let closed=false;
 return {own(name:string,dispose:()=>void,read?:()=>unknown){assert(!closed&&owners.length<16&&!owners.some(v=>v.name===name));owners.push({name,dispose});if(read){assert(readers.size<20&&!readers.has(name));readers.set(name,read);}},inspect(name:string,read:()=>unknown){assert(!closed&&readers.size<20&&!readers.has(name));readers.set(name,read);},close(){assert(!closed);closed=true;const attempts:string[]=[],snapshots:Record<string,unknown>={},errors:{resource:string;phase:string;message:string}[]=[];for(const o of [...owners].reverse()){attempts.push(o.name);try{o.dispose();}catch(error){errors.push({resource:o.name,phase:'DISPOSE',message:String(error)});}}for(const [name,read] of readers)try{snapshots[name]=read();}catch(error){snapshots[name]=null;errors.push({resource:name,phase:'READBACK',message:String(error)});}return {attempts,snapshots,errors};}};
}
/** Full actual service operation, synthetic record fields clearly distinguished from native provenance. */
export function productionSchemaBoundary(context:ContractContext,record:InterventionSegment){
 assert.equal(record.samples.length,32);assert.equal(record.events.length,8);assert.equal(Buffer.byteLength(JSON.stringify(record)),65536);
 const result={scope:'SYNTHETIC_SCHEMA_STRESS_ACTUAL_069_SERVICES_NOT_NATIVE_EVENTS_NOT_ESTIMATOR',record,bytes:65536,timings:[] as Record<string,number>[],overByteRejected:false,cleanup:[] as unknown[]};
 for(let i=0;i<5;i++){
  const resources=createAfterResourceScope();let primary:unknown=null;
  try{
   const store=createInterventionRecordStore(context);resources.own('store',()=>store.dispose(),()=>store.getStats());
   const bus=createInterventionEventTransport(context,{maxEventsPerEpoch:8,maxListeners:1});resources.own('bus',()=>bus.dispose(),()=>bus.getStats());
   const intake=createInterventionIntake(context);resources.own('intake',()=>intake.dispose(),()=>intake.getStats());
   // Seed a real protected OPEN before measuring its closure; not a lifecycle-created8event claim.
   const open=parseInterventionSegment({...record,endTick:null,closeReason:null,completeness:'OPEN'});
   const initial=store.port.reserve(null,open);store.port.commit(initial);
   const begin=performance.now(),admitted=admitInterventionRecord(record),preflightEnd=performance.now();
   const reservation=store.port.reserve(admitted.record,null),reserveEnd=performance.now();
   const receipt=store.port.commit(reservation),commitEnd=performance.now();
   assert.equal(store.port.inspectReceipt(reservation),receipt);assert.equal(receipt.accepted,true);assert.deepEqual(store.port.read(record.segmentId),record);const readbackEnd=performance.now();
   const events=bus.port.reserve([{...context,eventId:'stress-end-'+i,tick:record.endTick!,type:'MANUAL_END',entityIds:[record.vehicleId],payload:{vehicleId:record.vehicleId,controlMode:record.controlMode}}]);assert.equal(bus.port.commit(events).acceptedCount,1);const eventEnd=performance.now();
   // Explicit service-capacity descriptor; owner eligibility is tested separately by real lifecycle.
   const descriptor={...context,version:'069-closed-learning-intake-v1' as const,operationId:'schema-capacity-'+i,segmentId:record.segmentId,playerId:record.playerId,profileId:record.profileId,learningEpoch:record.learningEpoch,baseVersionId:record.baseVersionId,endTick:record.endTick!,recordBytes:admitted.bytes};
   intake.reserve(descriptor);const accepted=intake.accept(descriptor);assert.equal(intake.inspect(descriptor.operationId),accepted);assert.equal(intake.accept(descriptor),accepted);const intakeEnd=performance.now();
   result.timings.push({admissionMs:preflightEnd-begin,reserveMs:reserveEnd-preflightEnd,commitMs:commitEnd-reserveEnd,readbackMs:readbackEnd-commitEnd,eventMs:eventEnd-readbackEnd,intakeMs:intakeEnd-eventEnd,totalMs:intakeEnd-begin});
  }catch(error){primary=error;}finally{const cleanup=resources.close();result.cleanup.push(cleanup);if(cleanup.errors.length)primary=new AggregateError([...(primary===null?[]:[primary]),...cleanup.errors.map(e=>new Error(e.message))],'Schema boundary primary/cleanup');}
  if(primary!==null)throw Object.assign(primary instanceof Error?primary:new Error(String(primary)),{diagnostics:result});
 }
 const over=structuredClone(record);let amended=false;for(const sample of over.samples)for(let i=0;i<sample.context.conflictEntityIds.length&&!amended;i++)if(sample.context.conflictEntityIds[i]!.length<256){(sample.context.conflictEntityIds as string[])[i]+='x';amended=true;}
 assert(amended);assert.equal(Buffer.byteLength(JSON.stringify(over)),65537);try{admitInterventionRecord(over);}catch(error){result.overByteRejected=/byte capacity/.test(String(error));}assert(result.overByteRejected);return result;
}
/** Actual owner construction/disposal at unchanged native tick. AUTO empty-owner cycles, not fabricated controlled segments. */
export function productionOwnershipCycles(context:ContractContext,world:PhysicsProbe,ids:BodyIdentity[],tick:number){
 const rows=[];const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 for(let cycle=0;cycle<20;cycle++){
  const before=bodySnapshot(world,ids),serial=world.collisionStepSerial(),resources=createAfterResourceScope();let primary:unknown=null;
  try{
   const controller=createVehicleController(context,world,tick,{drivetrainVersion:'027-braking-reverse-v1'});resources.own('controller',()=>controller.dispose(),()=>controller.getStats());
   const authority=createControlAuthority(context,controller,{bodyIdentity:id=>world.bodyIdentity(id),clearOldPlayer:()=>undefined});resources.own('authority',()=>authority.dispose(),()=>authority.getStats());for(const id of ids)authority.register(id);
   const store=createInterventionRecordStore(context);resources.own('store',()=>store.dispose(),()=>store.getStats());const events=createInterventionEventTransport(context);resources.own('events',()=>events.dispose(),()=>events.getStats());const intake=createInterventionIntake(context);resources.own('intake',()=>intake.dispose(),()=>intake.getStats());
   const target={...context,version:'069-intervention-target-v1' as const,playerId:'cycle-player',profileId:'cycle-profile',baseVersionId:'base',learningEpoch:0,controlPreferencesVersion:'keys',engineVersion:'engine',mapVersion:'map',inputType:'KEYBOARD' as const,learningEligible:false};
   const bridge=createManualSegmentBridge(context,'cycle-'+cycle,authority,{bodyIdentity:id=>world.bodyIdentity(id),readTarget:()=>target,preparedCause:()=>null,preparedTarget:()=>null,records:store.port,events:events.port,reserveIntake:d=>intake.reserve(d),rejectIntake:id=>intake.reject(id),acceptIntake:d=>intake.accept(d),inspectIntake:id=>intake.inspect(id),acknowledgeIntake(id){const receipt=intake.inspect(id);assert(receipt?.accepted);intake.acknowledge(receipt);},inspectIntakeRelease:id=>intake.inspectRelease(id)});resources.own('bridge',()=>bridge.dispose(),()=>bridge.getStats());assert.equal(bridge.lifecycle.observe().acceptedTick,tick);assert.equal(bridge.lifecycle.observe().active,null);
  }catch(error){primary=error;}
  const cleanup=resources.close(),after=sameNativeSnapshot(world,ids,before,serial);rows.push({cycle,scope:'ACTUAL_AUTO_EMPTY_OWNER_NO_EXTRA_NATIVE_STEP',nativeSerialBefore:serial,nativeSerialAfter:world.collisionStepSerial(),beforeHash:hash(before),afterHash:hash(after),cleanup});
  if(primary!==null||cleanup.errors.length)throw Object.assign(new AggregateError([...(primary===null?[]:[primary]),...cleanup.errors.map(e=>new Error(e.message))],'Ownership primary/cleanup'),{diagnostics:rows});
 }
 return rows;
}
