import type {ContractContext} from '../sessions';
import {requireContract,fields,contextFields,readContext,tick,boolean,choice,number} from '../sessions';
import type {BodyIdentity,VehicleCommandPacket} from '../vehicles';
import type {ControlAuthority,ControlAuthorityTime,ModeControls,ModeTickTicket,VehicleSelection,VehicleSelectionTicket,SelectionCloseEvent,SelectionSegmentBoundary} from '../input';
import {createInterventionLifecycle} from '../telemetry';
import type {InterventionPorts,InterventionBoundaryTicket,InterventionCause,InterventionTargetChange} from '../telemetry';
export interface ManualSegmentStepCause {readonly cause:InterventionCause|null;readonly targetChange:InterventionTargetChange|null;}
/** App066/067/068 composition. It never clears driving input or steps a native world itself. */
export function createManualSegmentBridge(context:ContractContext,ownerId:string,authority:ControlAuthority,ports:Omit<InterventionPorts,'readAuthority'>){
 function readStats(){
  const d=fields(authority.getStats(),['context','tick','vehicles','players','seat','suspended','disposed','fault','retainedHistory','retainedBatches']),c=readContext(fields(d.context,contextFields));
  requireContract(c.sessionId===context.sessionId&&c.worldEpoch===context.worldEpoch&&c.schemaVersion===context.schemaVersion&&c.units===context.units,'Manual segment authority world');
  let seat:Readonly<{identity:BodyIdentity;mode:'MANUAL'|'LEARNING'}>|null=null;if(d.seat!==null){const s=fields(d.seat,['identity','mode']),i=fields(s.identity,['entityId','handle','generation']);requireContract(typeof i.entityId==='string'&&i.entityId.length<=256&&Number.isFinite(number(i.handle))&&tick(i.generation)>0&&ports.bodyIdentity(i.entityId)===s.identity,'Manual segment native identity');seat=Object.freeze({identity:s.identity as BodyIdentity,mode:choice(s.mode,['MANUAL','LEARNING'])});}
  let stateFault:ReturnType<ControlAuthority['getStats']>['fault']=null;if(d.fault!==null){const f=fields(d.fault,['attemptedTick','acceptedTick','stage','physicalTickAccepted']);stateFault=Object.freeze({attemptedTick:tick(f.attemptedTick),acceptedTick:tick(f.acceptedTick),stage:choice(f.stage,['CONTROLLER_ACTUATION','KEYBOARD_CLEAR']),physicalTickAccepted:boolean(f.physicalTickAccepted)});}
  requireContract(tick(d.vehicles)<=110&&tick(d.players)===(seat===null?0:1),'Manual segment authority player/vehicle bound');requireContract(d.retainedHistory===0&&d.retainedBatches===0,'Manual segment authority retention');
  return Object.freeze({context:Object.freeze(c),tick:tick(d.tick),vehicles:tick(d.vehicles),players:tick(d.players),seat,suspended:boolean(d.suspended),disposed:boolean(d.disposed),fault:stateFault,retainedHistory:0 as const,retainedBatches:0 as const});
 }
 const lifecycle=createInterventionLifecycle(context,ownerId,{...ports,readAuthority:()=>{const s=readStats();return {...s.context,version:'069-accepted-authority-v1',tick:s.tick,identity:s.seat?.identity??null,mode:s.seat?.mode??'AUTO',suspended:s.suspended,disposed:s.disposed,fault:s.fault===null?null:s.fault.stage};}});
 let controls:{mode:ModeControls;selection:VehicleSelection}|null=null,busy=false,inStep=false,metadataAttempted=false,disposed=false,fault:readonly string[]|null=null;
 let lastReadback:ReturnType<typeof readStats>|null=null,physicalPhase:ReturnType<typeof readStats>|null=null,physicalTicket:InterventionBoundaryTicket|null=null;
 const describe=(errors:readonly unknown[])=>Object.freeze(errors.slice(0,8).map(e=>(e instanceof Error?`${e.name}: ${e.message}`:String(e)).slice(0,1024)));
 function guard(){requireContract(!disposed&&!busy&&fault===null,'Manual segment bridge lifecycle');}
 function quarantine(errors:readonly unknown[],t:number){fault=describe(errors);try{lifecycle.quarantineAuthority(errors[0],t);}catch(e){fault=describe([...errors,e]);}}
 function sameSeat(a:ReturnType<typeof readStats>,b:ReturnType<typeof readStats>){return a.tick===b.tick&&a.seat?.identity===b.seat?.identity&&a.seat?.mode===b.seat?.mode&&a.disposed===b.disposed;}
 function assertPhysicalPhase(){requireContract(physicalPhase!==null&&physicalTicket!==null,'Manual segment fixed physical phase absent');const actual=readStats();requireContract(sameStepBase(actual,physicalPhase)&&actual.vehicles===physicalPhase.vehicles&&actual.players===physicalPhase.players&&!actual.suspended&&actual.fault===null,'Manual segment accepted callback changed fixed physical phase');lifecycle.assertAcceptedPhase(physicalTicket);lastReadback=actual;}
 function sameStepBase(a:ReturnType<typeof readStats>,b:ReturnType<typeof readStats>){return sameSeat(a,b)&&a.suspended===b.suspended&&JSON.stringify(a.fault)===JSON.stringify(b.fault);}
 const selectionBoundary=Object.freeze({
  readBoundary(identity:BodyIdentity):SelectionSegmentBoundary|null{const b=lifecycle.readBoundary(identity);if(b===null)return null;requireContract(b.completeness!=='INCOMPLETE'&&(b.closeReason===null||b.closeReason==='VEHICLE_SWITCH'),'Selection requires actualOPEN or its matching068 close');return Object.freeze({...b,completeness:b.completeness,closeReason:b.closeReason});},
  closeBoundary(event:SelectionCloseEvent):void{requireContract(busy&&inStep,'068 closure must occur inside this accepted bridge step');assertPhysicalPhase();metadataAttempted=true;lifecycle.closeSelection({context:{schemaVersion:event.schemaVersion,units:event.units,sessionId:event.sessionId,worldEpoch:event.worldEpoch},identity:event.identity,segmentId:event.segmentId,mode:event.mode,tick:event.tick,reason:event.reason});assertPhysicalPhase();},
 });
 function pauseChange(suspended:boolean){
  guard();busy=true;let before:ReturnType<typeof readStats>|null=null;const errors:unknown[]=[];
  try{before=readStats();if(suspended)authority.suspend();else authority.resume();lastReadback=readStats();requireContract(sameSeat(before,lastReadback)&&lastReadback.suspended===suspended,'Manual segment partial pause authority');
   if(suspended){controls?.mode.clear();lastReadback=readStats();requireContract(sameSeat(before,lastReadback)&&lastReadback.suspended,'Manual segment clear mode changed authority');controls?.selection.clearPending();lastReadback=readStats();requireContract(sameSeat(before,lastReadback)&&lastReadback.suspended,'Manual segment clear selection changed authority');}
   return lifecycle.observe();
  }catch(e){errors.push(e);try{lastReadback=readStats();}catch(inspect){errors.push(inspect);lastReadback=null;}fault=describe(errors);if(before===null||lastReadback===null||!sameSeat(before,lastReadback))quarantine(errors,before?.tick??0);throw errors.length===1?e:new AggregateError(errors,'Manual segment pause primary/inspection failures');}finally{busy=false;}
 }
 return Object.freeze({lifecycle,selectionBoundary,
  bind(mode:ModeControls,selection:VehicleSelection){guard();requireContract(controls===null,'Manual segment controls already bound');controls={mode,selection};},
  step(time:ControlAuthorityTime,packets:readonly VehicleCommandPacket[],cause:ManualSegmentStepCause={cause:null,targetChange:null},measure=false){
   guard();requireContract(controls!==null,'Manual segment controls not bound');busy=true;inStep=true;metadataAttempted=false;physicalPhase=null;physicalTicket=null;
   let modeTicket:ModeTickTicket|null=null,selectionTicket:VehicleSelectionTicket|null=null,segmentTicket:InterventionBoundaryTicket|null=null,before:ReturnType<typeof readStats>|null=null,planned:{identity:BodyIdentity|null;mode:'AUTO'|'MANUAL'|'LEARNING'}|null=null;
   const errors:unknown[]=[];
   try{
    before=readStats();requireContract(before.tick+1===time.tick&&!before.suspended&&!before.disposed&&before.fault===null,'Manual segment beforephysical admission');
    selectionTicket=controls.selection.prepare({...time,version:'068-vehicle-selection-v1'});lastReadback=readStats();requireContract(sameStepBase(before,lastReadback),'068 preparation changed physical authority');
    if(selectionTicket===null){modeTicket=controls.mode.prepare({...time,version:'067-mode-controls-v1'});lastReadback=readStats();requireContract(sameStepBase(before,lastReadback),'067 preparation changed physical authority');}
    const requests=selectionTicket?.requests??modeTicket!.requests;
    let nextIdentity:BodyIdentity|null=before.seat?.identity??null,nextMode:'AUTO'|'MANUAL'|'LEARNING'=before.seat?.mode??'AUTO';
    for(const request of requests){if(request.mode==='AUTO'){if(nextIdentity===request.identity){nextIdentity=null;nextMode='AUTO';}}else{requireContract(nextIdentity===null||nextIdentity===request.identity,'Manual segment conflicting player request');nextIdentity=request.identity;nextMode=request.mode;}}
    let reason=cause.targetChange?.reason??cause.cause?.reason??null;if(selectionTicket!==null&&before.seat!==null)reason='VEHICLE_SWITCH';else if(before.seat?.identity===nextIdentity&&before.seat!==null&&before.seat.mode!==nextMode)reason='MODE_CHANGE';else if(before.seat!==null&&nextIdentity!==before.seat.identity)reason=nextIdentity===null?'RETURN_TO_AUTO':'VEHICLE_SWITCH';
    planned={identity:nextIdentity,mode:nextMode};segmentTicket=lifecycle.prepare({...context,version:'069-boundary-plan-v1',tick:time.tick,timing:'PREPARED_BEFORE_NEXT_TICK',nextIdentity,nextMode,reason,cause:cause.cause,targetChange:cause.targetChange});
    const result=authority.step(time,packets,requests,measure);lastReadback=readStats();requireContract(lastReadback.tick===time.tick,'Manual segment unexpected physical advance');
    physicalPhase=lastReadback;physicalTicket=segmentTicket;metadataAttempted=true;lifecycle.bindAcceptedPhase(segmentTicket);metadataAttempted=false;assertPhysicalPhase();
    if(selectionTicket!==null){assertPhysicalPhase();requireContract(controls.selection.settle(selectionTicket)==='ACCEPTED','Manual segment selection settle');assertPhysicalPhase();}
    if(modeTicket!==null){assertPhysicalPhase();requireContract(controls.mode.settle(modeTicket)==='ACCEPTED','Manual segment mode settle');assertPhysicalPhase();}
    metadataAttempted=true;requireContract(lifecycle.settle(segmentTicket)==='ACCEPTED','Manual segment accepted metadata settle');assertPhysicalPhase();lastReadback=readStats();requireContract(lastReadback.tick===time.tick&&(lastReadback.seat?.identity??null)===nextIdentity&&(lastReadback.seat?.mode??'AUTO')===nextMode,'Manual segment callback changed accepted authority');return result;
   }catch(error){
    errors.push(error);let s:ReturnType<typeof readStats>|null=null;try{s=readStats();lastReadback=s;}catch(inspect){errors.push(inspect);lastReadback=null;}
    if(s===null||before===null||(s.tick!==before.tick&&s.tick!==time.tick)||(s.tick===before.tick&&!sameStepBase(before,s))||(s.tick===time.tick&&planned!==null&&(s.seat?.identity!==(planned.identity??undefined)||s.seat?.mode!==(planned.mode==='AUTO'?undefined:planned.mode)))){quarantine(errors,time.tick);}
    else if(s.tick===time.tick){
     if(s.suspended||s.fault!==null||(physicalPhase!==null&&!sameStepBase(s,physicalPhase))||segmentTicket!==null&&lifecycle.inspectTicket(segmentTicket)?.quarantined){if(segmentTicket!==null&&physicalPhase===null){metadataAttempted=true;try{lifecycle.bindAcceptedPhase(segmentTicket);}catch(phaseError){errors.push(phaseError);}}quarantine(errors,time.tick);throw errors.length===1?error:new AggregateError(errors,'Manual segment accepted physical phase quarantined');}
     // No repeat after the metadata callback was already attempted, successful or ambiguous.
     if(segmentTicket!==null&&!metadataAttempted){metadataAttempted=true;try{lifecycle.settle(segmentTicket);}catch(e){errors.push(e);}}
     fault=describe(errors);
    }else{
     requireContract(s.tick===before.tick,'Manual segment rejection requires exact known base');
     if(segmentTicket!==null&&!metadataAttempted)try{lifecycle.reject(segmentTicket);}catch(e){errors.push(e);quarantine(errors,time.tick);}
     if(selectionTicket!==null)try{controls.selection.reject(selectionTicket);}catch(e){errors.push(e);}
     if(modeTicket!==null)try{controls.mode.reject(modeTicket);}catch(e){errors.push(e);}
     if(errors.length>1)fault=describe(errors);
    }
    throw errors.length===1?error:new AggregateError(errors,'Manual segment bridge primary/inspection/accepted-prefix diagnostics');
   }finally{inStep=false;busy=false;physicalPhase=null;physicalTicket=null;}
  },
  suspend:()=>pauseChange(true),resume:()=>pauseChange(false),
  getStats:()=>Object.freeze({disposed,busy,fault,bound:controls!==null,lastReadback}),
  dispose(){requireContract(!busy,'Manual segment bridge reentrant disposal');if(disposed)return;lifecycle.dispose();disposed=true;controls=null;},
 });
}
