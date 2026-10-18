import { fields, contextFields, readContext, requireContract, tick } from '../sessions';
import type { ContractContext } from '../sessions';
import { INTERVENTION_LIMITS } from './intervention-ports';
import type { InterventionIntakeDescriptor,InterventionIntakeReceipt,InterventionIntakeRelease } from './intervention-ports';
import { interventionText,sameInterventionContext } from './intervention-validation';

/** Concrete bounded RAM intake, not an estimator, worker, persistence or profile activation. */
export function createInterventionIntake(initialContext:ContractContext) {
 const context=Object.freeze(readContext(fields(initialContext,contextFields)));
 const entries=new Map<string,{descriptor:InterventionIntakeDescriptor;receipt:InterventionIntakeReceipt}>();
 const acknowledged=new Map<string,{descriptor:InterventionIntakeDescriptor;receipt:InterventionIntakeReceipt;release:InterventionIntakeRelease}>();
 let pending:InterventionIntakeDescriptor|null=null,payloadBytes=0,disposed=false,busy=false;
 const run=<T>(action:()=>T):T=>{requireContract(!disposed&&!busy,'Intervention intake lifecycle');busy=true;try{return action();}finally{busy=false;}};
 function validate(value:unknown):InterventionIntakeDescriptor {
  const d=fields(value,[...contextFields,'version','segmentId','playerId','profileId','learningEpoch','baseVersionId','endTick','recordBytes','operationId']);
  requireContract(d.version==='069-closed-learning-intake-v1','Intervention intake version');
  const descriptor=Object.freeze({...readContext(d),version:'069-closed-learning-intake-v1' as const,segmentId:interventionText(d.segmentId),playerId:interventionText(d.playerId),profileId:interventionText(d.profileId),learningEpoch:tick(d.learningEpoch),baseVersionId:interventionText(d.baseVersionId),endTick:tick(d.endTick),recordBytes:tick(d.recordBytes),operationId:interventionText(d.operationId)});
  requireContract(sameInterventionContext(descriptor,context)&&descriptor.recordBytes<=INTERVENTION_LIMITS.recordBytes,'Intervention intake context/payload');return descriptor;
 }
 function serialized(value:unknown){return new TextEncoder().encode(JSON.stringify(value)).length;}
 function releaseOf(receipt:InterventionIntakeReceipt):InterventionIntakeRelease{return Object.freeze({version:'069-intake-release-v1',operationId:receipt.operationId,segmentId:receipt.segmentId,released:true});}
 return Object.freeze({
  reserve(value:InterventionIntakeDescriptor){run(()=>{requireContract(pending===null,'Intervention intake already reserved');const d=validate(value);requireContract(!entries.has(d.operationId)&&!acknowledged.has(d.operationId)&&entries.size+acknowledged.size<INTERVENTION_LIMITS.descriptors,'Intervention intake identity/capacity');const prospectiveReceipt=Object.freeze({version:'069-intake-receipt-v1' as const,operationId:d.operationId,segmentId:d.segmentId,accepted:true});const worst=[...acknowledged.values(),...[...entries.values()].map(e=>({...e,release:releaseOf(e.receipt)})),{descriptor:d,receipt:prospectiveReceipt,release:releaseOf(prospectiveReceipt)}];requireContract(serialized(worst)<=INTERVENTION_LIMITS.descriptorBytes&&payloadBytes+d.recordBytes<=INTERVENTION_LIMITS.intakePayloadBytes,'Intervention intake byte backpressure');pending=d;});},
  reject(operationId:string){run(()=>{requireContract(pending?.operationId===operationId,'Intervention intake reservation identity');pending=null;});},
  accept(value:InterventionIntakeDescriptor){return run(()=>{const d=validate(value),retired=acknowledged.get(d.operationId),existing=entries.get(d.operationId);if(retired){requireContract(JSON.stringify(retired.descriptor)===JSON.stringify(d),'Conflicting acknowledged intake duplicate');return retired.receipt;}if(existing){requireContract(JSON.stringify(existing.descriptor)===JSON.stringify(d),'Conflicting intake duplicate');return existing.receipt;}requireContract(pending!==null&&JSON.stringify(pending)===JSON.stringify(d),'Unreserved intake');const receipt=Object.freeze({version:'069-intake-receipt-v1' as const,operationId:d.operationId,segmentId:d.segmentId,accepted:true});payloadBytes+=d.recordBytes;entries.set(d.operationId,{descriptor:d,receipt});pending=null;return receipt;});},
  inspect(operationId:string){requireContract(!disposed,'Intervention intake disposed');return entries.get(operationId)?.receipt??(pending?.operationId===operationId?Object.freeze({version:'069-intake-receipt-v1' as const,operationId,segmentId:pending.segmentId,accepted:false}):null);},
  read(operationId:string){requireContract(!disposed,'Intervention intake disposed');return entries.get(operationId)?.descriptor??null;},
  /** Explicit consumer acknowledgement frees queue metadata; historical segment remains in its repository. */
  acknowledge(receipt:InterventionIntakeReceipt){run(()=>{const d=fields(receipt,['version','operationId','segmentId','accepted']);requireContract(d.version==='069-intake-receipt-v1'&&d.accepted===true,'Intervention intake acknowledgement receipt');const e=entries.get(interventionText(d.operationId));requireContract(e?.receipt===receipt,'Intervention intake acknowledgement identity');entries.delete(receipt.operationId);payloadBytes-=e.descriptor.recordBytes;acknowledged.set(receipt.operationId,{descriptor:e.descriptor,receipt:e.receipt,release:Object.freeze({version:'069-intake-release-v1',operationId:receipt.operationId,segmentId:receipt.segmentId,released:true})});});},
  inspectRelease(operationId:string){requireContract(!disposed,'Intervention intake disposed');return acknowledged.get(operationId)?.release??null;},
  getStats:()=>Object.freeze({disposed,entries:entries.size,pending:pending?1:0,serializedDescriptorBytes:2+[...entries.values()].reduce((n,e)=>n+new TextEncoder().encode(JSON.stringify(e.descriptor)).length,0)+Math.max(0,entries.size-1),serializedMetadataBytes:serialized([...entries.values(),...acknowledged.values()]),acknowledgedReceipts:acknowledged.size,referencedPayloadBytes:payloadBytes,durability:'RAM_ONLY' as const}),
  dispose(){requireContract(!busy,'Intervention intake reentrant dispose');if(disposed)return;disposed=true;entries.clear();acknowledged.clear();pending=null;payloadBytes=0;},
 });
}
