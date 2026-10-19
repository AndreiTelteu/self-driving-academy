import { createEventBus,parseSimulationEvent } from '../simulation';
import type { SimulationEvent,EventBusOptions,EventListener,ListenerOptions } from '../simulation';
import { fields,contextFields,readContext,requireContract,record,tick,list } from '../sessions';
import type { ContractContext } from '../sessions';
import type { InterventionEventReservation,InterventionEventReceipt } from './intervention-ports';
import { sameInterventionContext } from './intervention-validation';
/** Dedicated actual007 bus: mirrored bounded admission ledger, never alternative publication. */
export function createInterventionEventTransport(initialContext:ContractContext,options:Omit<EventBusOptions,'sessionId'|'worldEpoch'>={}) {
 const context=Object.freeze(readContext(fields(initialContext,contextFields))),o=record(options);
 requireContract(Object.keys(o).every(k=>['maxEventsPerEpoch','maxEventCodeUnits','maxListeners'].includes(k)),'Intervention event options');
 const maxEvents=tick(o.maxEventsPerEpoch??10000),maxUnits=tick(o.maxEventCodeUnits??16384),maxListeners=tick(o.maxListeners??128);
 requireContract(maxEvents<=10000&&maxUnits<=16384&&maxListeners<=128,'Intervention event configured capacity bounds');
 const bus=createEventBus({sessionId:context.sessionId,worldEpoch:context.worldEpoch,maxEventsPerEpoch:maxEvents,maxEventCodeUnits:maxUnits,maxListeners});
 const accepted=new Map<string,string>();let watermark=0,pending:InterventionEventReservation|null=null,last:InterventionEventReservation|null=null;
 let pendingReceipt:InterventionEventReceipt|null=null,lastReceipt:InterventionEventReceipt|null=null,cursor=0,sequence=0,busy=false,disposed=false;
 let pendingErrors:unknown[]=[];
 const run=<T>(action:()=>T):T=>{requireContract(!busy&&!disposed,'Intervention event transport lifecycle');busy=true;try{return action();}finally{busy=false;}};
 const proof=(r:InterventionEventReservation):InterventionEventReceipt=>Object.freeze({version:'069-event-receipt-v1',sequence:r.sequence,acceptedCount:cursor,complete:cursor===r.events.length,listenerFailures:pendingErrors.length});
 const port=Object.freeze({
  reserve(values:readonly SimulationEvent[]){return run(()=>{
   requireContract(pending===null&&Array.isArray(values)&&values.length<=2,'Intervention event reservation capacity');const events=list(values,parseSimulationEvent);
   let nextWatermark=watermark,newCount=0;const proposed=new Map<string,string>();
   for(const e of events){const f=JSON.stringify(e),old=proposed.get(e.eventId)??accepted.get(e.eventId);requireContract(sameInterventionContext(e,context)&&f.length<=maxUnits,'Intervention event reservation bounds');if(old!==undefined)requireContract(old===f,'Conflicting accepted/proposed event identity');else {requireContract(e.tick>=nextWatermark,'Prospective event watermark');nextWatermark=e.tick;newCount++;}proposed.set(e.eventId,f);}
   requireContract(accepted.size+newCount<=maxEvents,'Intervention event backpressure');requireContract(sequence<Number.MAX_SAFE_INTEGER,'Intervention event sequence');pending=Object.freeze({version:'069-event-reservation-v1' as const,sequence:++sequence,events});cursor=0;pendingErrors=[];pendingReceipt=proof(pending);return pending;
  });},
  commit(reservation:InterventionEventReservation,phaseGuard:()=>void=()=>undefined){return run(()=>{
   phaseGuard();
   if(last===reservation){requireContract(lastReceipt!==null,'Missing exact last event receipt');return lastReceipt;}
   requireContract(pending===reservation,'Intervention event reservation identity');
   while(cursor<reservation.events.length){
    phaseGuard();const e=reservation.events[cursor],r=bus.publish(e);cursor++;
    if(!accepted.has(e.eventId)){accepted.set(e.eventId,JSON.stringify(e));watermark=e.tick;}
    for(const failure of r.failures)if(pendingErrors.length<256)pendingErrors.push(failure.error);pendingReceipt=proof(reservation);
    // Persist the actual accepted prefix before checking a listener-mutated phase.
    try{phaseGuard();}catch(error){throw pendingErrors.length?new AggregateError([...pendingErrors,error],'Accepted007 listener and publication-phase failures'):error;}
   }
   last=reservation;lastReceipt=pendingReceipt;pending=null;pendingReceipt=null;
   const errors=pendingErrors;pendingErrors=[];requireContract(lastReceipt!==null,'Missing completed event receipt');if(errors.length)throw new AggregateError(errors,'Accepted007 listener failures; never replay accepted listeners');return lastReceipt;
  });},
  inspectReceipt(reservation:InterventionEventReservation){requireContract(!disposed,'Intervention event disposed');return pending===reservation?pendingReceipt:last===reservation?lastReceipt:null;},
  reject(reservation:InterventionEventReservation){run(()=>{requireContract(pending===reservation&&cursor===0,'Cannot reject accepted event prefix');pending=null;pendingReceipt=null;pendingErrors=[];});},
 });
 return Object.freeze({port,subscribe:(listener:EventListener,opts?:ListenerOptions)=>bus.subscribe(listener,opts),getStats:()=>Object.freeze({...bus.getStats(),pending:pending?1:0,admissionLedgerEntries:accepted.size,admissionLedgerCodeUnits:[...accepted.values()].reduce((n,v)=>n+v.length,0)}),dispose(){requireContract(!busy,'Intervention event reentrant dispose');if(disposed)return;disposed=true;pending=null;last=null;pendingReceipt=null;lastReceipt=null;pendingErrors=[];accepted.clear();bus.dispose();}});
}
