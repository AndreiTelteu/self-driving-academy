import type { ContractContext } from '../../src/sessions';
import type { BodyIdentity } from '../../src/vehicles';
import { createInterventionLifecycle,createInterventionRecordStore,createInterventionEventTransport,createInterventionIntake,parseTelemetrySample } from '../../src/telemetry';
import type { InterventionAuthority,InterventionTarget,InterventionCause,InterventionTargetChange,InterventionBoundaryPlan,InterventionPorts,InterventionMode } from '../../src/telemetry';
import { sample as contractSample } from '../contracts/fixtures';
export const SEGMENT_CONTEXT:ContractContext=Object.freeze({schemaVersion:1,units:'SI',sessionId:'069-tests',worldEpoch:1});
/** Explicit injected accepted-authority DTO fixture; never an actualRapier/foreground claim. */
export function segmentFixture(overrides:Partial<InterventionPorts>={},eventCapacity=10000) {
 const context=SEGMENT_CONTEXT,identity:BodyIdentity=Object.freeze({entityId:'taxi-1',handle:1,generation:1});
 const identities=new Map<string,BodyIdentity>([[identity.entityId,identity]]);
 let target:InterventionTarget=Object.freeze({...context,version:'069-intervention-target-v1',playerId:'player',profileId:'profile',baseVersionId:'style-v1',learningEpoch:1,controlPreferencesVersion:'keys-1',engineVersion:'engine',mapVersion:'map',inputType:'KEYBOARD',learningEligible:true});
 let accepted:InterventionAuthority=Object.freeze({...context,version:'069-accepted-authority-v1',tick:0,identity:null,mode:'AUTO',suspended:false,disposed:false,fault:null});
 const store=createInterventionRecordStore(context),events=createInterventionEventTransport(context,{maxEventsPerEpoch:eventCapacity}),intake=createInterventionIntake(context);
 const causes=new Map<string,InterventionCause>(),changes=new Map<string,InterventionTargetChange>();
 const ports:InterventionPorts={readAuthority:()=>accepted,bodyIdentity:id=>identities.get(id),readTarget:()=>target,preparedCause:id=>causes.get(id)??null,preparedTarget:id=>changes.get(id)??null,records:store.port,events:events.port,reserveIntake:d=>intake.reserve(d),rejectIntake:id=>intake.reject(id),acceptIntake:d=>intake.accept(d),inspectIntake:id=>intake.inspect(id),acknowledgeIntake(id){const r=intake.inspect(id);if(!r||!r.accepted)throw Error('Missing real intake receipt');intake.acknowledge(r);},inspectIntakeRelease:id=>intake.inspectRelease(id),...overrides};
 const owner=createInterventionLifecycle(context,'tests',ports);
 function plan(mode:'AUTO'|InterventionMode,reason:InterventionBoundaryPlan['reason']=null,cause:InterventionCause|null=null,change:InterventionTargetChange|null=null):InterventionBoundaryPlan{return {...context,version:'069-boundary-plan-v1',timing:'PREPARED_BEFORE_NEXT_TICK',tick:accepted.tick+1,nextIdentity:mode==='AUTO'?null:identity,nextMode:mode,reason,cause,targetChange:change};}
 function accept(p:InterventionBoundaryPlan){accepted=Object.freeze({...accepted,tick:p.tick,identity:p.nextIdentity,mode:p.nextMode});if(p.targetChange)target=p.targetChange.target;}
 function apply(mode:'AUTO'|InterventionMode,reason:InterventionBoundaryPlan['reason']=null,cause:InterventionCause|null=null,change:InterventionTargetChange|null=null){const p=plan(mode,reason,cause,change),ticket=owner.prepare(p);accept(p);owner.settle(ticket);return owner.observe();}
 function actualSample(t:number,mode:InterventionMode){const s=contractSample();return parseTelemetrySample({...s,tick:t,state:{...s.state,...context,tick:t,controlMode:mode,appliedProfileVersion:target.baseVersionId},command:{...s.command,...context,tick:t},excludedReason:null});}
 function cause(reason:InterventionCause['reason'],timing:InterventionCause['timing']='PREPARED_BEFORE_NEXT_TICK'){const v:InterventionCause=Object.freeze({...context,version:'069-admitted-cause-v1',operationId:`cause-${causes.size}`,timing,tick:accepted.tick+(timing==='PREPARED_BEFORE_NEXT_TICK'?1:0),identity:accepted.identity,reason});causes.set(v.operationId,v);return v;}
 function change(reason:InterventionTargetChange['reason'],newTarget:InterventionTarget){const v:InterventionTargetChange=Object.freeze({...context,version:'069-validated-target-change-v1',operationId:`change-${changes.size}`,tick:accepted.tick+1,reason,target:newTarget});changes.set(v.operationId,v);return v;}
 return {context,identity,identities,ports,owner,store,events,intake,plan,accept,apply,actualSample,cause,change,target:()=>target,setTarget:(v:InterventionTarget)=>{target=v;},authority:()=>accepted,setAuthority:(v:InterventionAuthority)=>{accepted=v;}};
}
