import assert from 'node:assert/strict';
import test from 'node:test';
import { createManualSegmentBridge } from '../../src/app';
import { createControlAuthority,createModeControls,createVehicleSelection } from '../../src/input';
import { createVehicleController } from '../../src/vehicles';
import type { BodyIdentity } from '../../src/vehicles';
import { createInterventionRecordStore,createInterventionEventTransport,createInterventionIntake } from '../../src/telemetry';
import type { InterventionTarget,InterventionCause } from '../../src/telemetry';
import { SEGMENT_CONTEXT } from './manual-segments-fixture';
function fixture(){
 const context=SEGMENT_CONTEXT,identity:BodyIdentity=Object.freeze({entityId:'taxi-1',handle:1,generation:1}),other:BodyIdentity=Object.freeze({entityId:'taxi-2',handle:2,generation:1}),identities=new Map([[identity.entityId,identity],[other.entityId,other]]);
 let steps=0,clears=0,camera:BodyIdentity|null=identity;
 const controller=createVehicleController(context,{bodyIdentity:id=>identities.get(id),step(){steps++;return {controllerMs:0,stepMs:0,queryMs:0,bridgeMs:0,totalMs:0,queryCount:0,bridgeCalls:0};}});
 const authority=createControlAuthority(context,controller,{bodyIdentity:id=>identities.get(id),clearOldPlayer(){clears++;}});authority.register(identity);authority.register(other);
 const store=createInterventionRecordStore(context),events=createInterventionEventTransport(context),intake=createInterventionIntake(context),causes=new Map<string,InterventionCause>();
 const target:InterventionTarget=Object.freeze({...context,version:'069-intervention-target-v1',playerId:'p',profileId:'profile',baseVersionId:'base',learningEpoch:1,controlPreferencesVersion:'keys-1',engineVersion:'engine',mapVersion:'map',inputType:'KEYBOARD',learningEligible:true});
 const bridge=createManualSegmentBridge(context,'bridge',authority,{bodyIdentity:id=>identities.get(id),readTarget:()=>target,preparedTarget:()=>null,preparedCause:id=>causes.get(id)??null,records:store.port,events:events.port,reserveIntake:d=>intake.reserve(d),rejectIntake:id=>intake.reject(id),acceptIntake:d=>intake.accept(d),inspectIntake:id=>intake.inspect(id),acknowledgeIntake(id){const r=intake.inspect(id);if(!r||!r.accepted)throw Error('Missing real intake receipt');intake.acknowledge(r);},inspectIntakeRelease:id=>intake.inspectRelease(id)});
 const mode=createModeControls(context,{readAuthority:()=>authority.getStats(),selectedIdentity:()=>camera,bodyIdentity:id=>identities.get(id)});
 const selection=createVehicleSelection(context,{readAuthority:()=>authority.getStats(),bodyIdentity:id=>identities.get(id),readPresentation:id=>({identity:id,kind:'TAXI',visible:true,selectable:true}),readCameraTarget:()=>camera,selectCamera:id=>{camera=id;},clearInput:()=>mode.clear(),readAssignment:id=>({context,identity:id,routeFingerprint:'route-retained',tripFingerprint:'trip-retained'}),...bridge.selectionBoundary});
 selection.register(identity,'TAXI');selection.register(other,'TAXI');bridge.bind(mode,selection);
 const time=()=>({...context,version:'066-control-authority-v1' as const,tick:authority.getStats().tick+1,dtSeconds:1/60});
 const packet=(t:number)=>({identity,command:{...context,vehicleId:identity.entityId,tick:t,throttle:.63,brake:0,steering:.17,handbrake:false,turnSignal:'OFF' as const,source:'PLAYER' as const}});
 return {context,identity,other,controller,authority,store,events,intake,bridge,mode,selection,time,packet,steps:()=>steps,clears:()=>clears,camera:()=>camera};
}
test('069 app actual024/066/067 M-L-M preserves every same-body command and one physical step',()=>{
 const f=fixture();for(const key of ['M','L','L'] as const){f.mode.enqueue(key);const t=f.time(),packet=f.packet(t.tick),packets=Object.freeze([packet]);const result=f.bridge.step(t,packets);assert.equal(result.frame.tick,t.tick);assert.deepEqual(f.controller.readControl(f.identity)?.raw,packet.command);assert.equal(f.controller.readControl(f.identity)?.command.throttle,.63);assert.equal(f.steps(),t.tick);assert.equal(f.clears(),0);}
 assert.equal(f.authority.getStats().seat!.mode,'MANUAL');assert.equal(f.intake.getStats().entries,1);
});
test('069 app actual068 departure closes once, preserves assignment/camera proof and clear timing',()=>{
 const f=fixture();f.mode.enqueue('M');f.bridge.step(f.time(),[f.packet(1)]);const old=f.bridge.lifecycle.observe().active!;
 f.selection.enqueue(f.other,'WORLD');f.bridge.step(f.time(),[]);assert.equal(f.steps(),2);assert.equal(f.clears(),1);assert.equal(f.authority.getStats().seat,null);assert.equal(f.camera(),f.other);assert.equal(f.store.port.read(old.segmentId)!.closeReason,'VEHICLE_SWITCH');assert.equal(f.events.getStats().retainedEvents,2);
});
test('069 app prephysical duplicate packet rejection leaves tick and OPEN unchanged',()=>{
 const f=fixture();f.mode.enqueue('M');f.bridge.step(f.time(),[f.packet(1)]);const old=f.bridge.lifecycle.observe().active!,packet=f.packet(2);f.mode.enqueue('L');assert.throws(()=>f.bridge.step(f.time(),[packet,packet]));
 assert.equal(f.steps(),1);assert.equal(f.authority.getStats().tick,1);assert.equal(f.store.port.read(old.segmentId)!.completeness,'OPEN');assert.equal(f.store.getStats().reservations,0);
});
test('069 app pause/resume invokes actual066 without close/reopen or extra physical steps',()=>{
 const f=fixture();f.mode.enqueue('L');f.bridge.step(f.time(),[f.packet(1)]);const old=f.bridge.lifecycle.observe().active!;f.bridge.suspend();assert.equal(f.authority.getStats().suspended,true);assert.equal(f.bridge.lifecycle.observe().active,old);f.bridge.resume();assert.equal(f.steps(),1);assert.equal(f.bridge.lifecycle.observe().active,old);
});
test('069 real app preserves original physical failure when authority inspection also fails',()=>{
 const f=fixture();f.mode.enqueue('M');const original=f.authority.getStats;let failRead=false;f.authority.getStats=()=>{if(failRead)throw Error('actual inspection failure');return original();};const step=f.authority.step;f.authority.step=(...args)=>{step(...args);failRead=true;throw Error('actual physical primary');};
 assert.throws(()=>f.bridge.step(f.time(),[f.packet(1)]),e=>e instanceof AggregateError&&e.errors.some(x=>x instanceof Error&&x.message==='actual physical primary')&&e.errors.some(x=>x instanceof Error&&x.message==='actual inspection failure'));assert.equal(f.steps(),1);assert.equal(f.bridge.getStats().lastReadback,null);assert.equal(f.bridge.lifecycle.observe().authorityReadback,'UNVALIDATED');
});
test('069 real app unexpected extra accepted physical advance is quarantined, never rejected as base',()=>{
 const f=fixture();f.mode.enqueue('M');const step=f.authority.step;f.authority.step=(time,packets,requests,measure)=>{const result=step(time,packets,requests,measure);step({...time,tick:time.tick+1},[],[],false);return result;};assert.throws(()=>f.bridge.step(f.time(),[f.packet(1)]));assert.equal(f.steps(),2);assert.equal(f.bridge.lifecycle.observe().authorityReadback,'UNVALIDATED');assert.equal(f.store.getStats().reservations,1);
});
test('069 real app suspend callback reentrancy rejected while preserving accepted pause truth',()=>{
 const f=fixture();f.mode.enqueue('M');f.bridge.step(f.time(),[f.packet(1)]);const clear=f.mode.clear;f.mode.clear=()=>{clear();f.bridge.resume();};assert.throws(()=>f.bridge.suspend(),/lifecycle/);assert.equal(f.authority.getStats().suspended,true);assert.equal(f.steps(),1);assert.equal(f.store.getStats().open,1);
});

// Repair03 SOURCE cases: actual024/066/067/068 composition, no native/foreground claim.
test('069 repair03 initialAUTO and MANUAL returnAUTO retain accepted null seat without metadata fault',()=>{
 const f=fixture();f.bridge.step(f.time(),[]);assert.equal(f.steps(),1);assert.equal(f.bridge.getStats().fault,null);assert.equal(f.bridge.lifecycle.observe().active,null);
 f.mode.enqueue('M');f.bridge.step(f.time(),[f.packet(2)]);const old=f.bridge.lifecycle.observe().active!;
 f.mode.enqueue('M');f.bridge.step(f.time(),[]);assert.equal(f.steps(),3);assert.equal(f.authority.getStats().seat,null);assert.equal(f.bridge.getStats().fault,null);assert.equal(f.store.port.read(old.segmentId)!.closeReason,'RETURN_TO_AUTO');assert.equal(f.events.getStats().retainedEvents,2);
});
test('069 repair03 accepted067 settle suspension cannot be adopted as accepted domain phase',()=>{
 const f=fixture();f.mode.enqueue('M');const settle=f.mode.settle;f.mode.settle=ticket=>{const result=settle(ticket);f.authority.suspend();return result;};
 assert.throws(()=>f.bridge.step(f.time(),[f.packet(1)]));assert.equal(f.steps(),1);assert.equal(f.authority.getStats().suspended,true);assert.equal(f.store.getStats().records,0);assert.equal(f.events.getStats().retainedEvents,0);assert.equal(f.bridge.lifecycle.observe().quarantined,true);assert.equal(f.bridge.lifecycle.observe().fault!.physicalTickAccepted,true);
});
test('069 repair03 actual068 inside-close callback checks fixed phase before record commit',()=>{
 const f=fixture();f.mode.enqueue('M');f.bridge.step(f.time(),[f.packet(1)]);const old=f.bridge.lifecycle.observe().active!;
 const settle=f.selection.settle;f.selection.settle=ticket=>{f.authority.suspend();return settle(ticket);};f.selection.enqueue(f.other,'WORLD');assert.throws(()=>f.bridge.step(f.time(),[]));
 assert.equal(f.steps(),2);assert.equal(f.authority.getStats().seat,null);assert.equal(f.store.port.read(old.segmentId)!.completeness,'OPEN');assert.equal(f.events.getStats().retainedEvents,1);assert.equal(f.bridge.lifecycle.observe().quarantined,true);
});
