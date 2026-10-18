import { contextFields,fields,readContext,requireContract } from '../sessions';
import type { ContractContext } from '../sessions';
import type { InterventionSegment,TelemetrySample } from './contracts';
import { admitInterventionRecord } from './intervention-admission';
import { INTERVENTION_LIMITS } from './intervention-ports';
import type { InterventionRecordPort,InterventionRecordReservation,InterventionRecordReceipt } from './intervention-ports';

/** Concrete bounded RAM repository. No IndexedDB/savegame/crash durability claim. */
export function createInterventionRecordStore(initialContext: ContractContext) {
  const context=Object.freeze(readContext(fields(initialContext,contextFields)));
  let records=new Map<string,{record:InterventionSegment;bytes:number}>();
  let preparedRecords:Map<string,{record:InterventionSegment;bytes:number}>|null=null;
  let pending:InterventionRecordReservation|null=null,receipt:InterventionRecordReceipt|null=null;
  let committed:InterventionRecordReservation|null=null,sequence=0,disposed=false,busy=false;
  const same=(record:ContractContext)=>record.schemaVersion===context.schemaVersion&&record.units===context.units&&record.sessionId===context.sessionId&&record.worldEpoch===context.worldEpoch;
  function mutate<T>(action:()=>T):T{requireContract(!disposed&&!busy,'Intervention record store disposed/reentrant');busy=true;try{return action();}finally{busy=false;}}
  function size(next:Map<string,{record:InterventionSegment;bytes:number}>) {
    return 2+Math.max(0,next.size-1)+[...next.values()].reduce((sum,row)=>sum+row.bytes,0);
  }
  function capacity(next:Map<string,{record:InterventionSegment;bytes:number}>) {
    requireContract(next.size<=INTERVENTION_LIMITS.records&&size(next)<=INTERVENTION_LIMITS.recordStoreBytes,'Protected record admission capacity');
  }
  function transitions(close:ReturnType<typeof admitInterventionRecord>|null,open:ReturnType<typeof admitInterventionRecord>|null) {
    const closed=close?.record??null,opened=open?.record??null,next=new Map(records);
    if(closed){requireContract(same(closed)&&closed.completeness!=='OPEN','Foreign/open close record');
      const old=records.get(closed.segmentId)?.record;requireContract(old?.completeness==='OPEN','Close requires current OPEN');
      requireContract(old.vehicleId===closed.vehicleId&&old.controlMode===closed.controlMode&&old.startTick===closed.startTick&&old.learningEligible===closed.learningEligible&&old.learningEpoch===closed.learningEpoch&&old.baseVersionId===closed.baseVersionId&&old.playerId===closed.playerId&&old.profileId===closed.profileId&&old.controlPreferencesVersion===closed.controlPreferencesVersion&&old.engineVersion===closed.engineVersion&&old.mapVersion===closed.mapVersion&&old.inputType===closed.inputType,'Close changed frozen OPEN facts');
      requireContract(JSON.stringify(old.samples)===JSON.stringify(closed.samples)&&JSON.stringify(old.events)===JSON.stringify(closed.events),'Close altered protected sample/event prefix');
      requireContract(close!==null,'Missing admitted close');next.set(closed.segmentId,close);}
    if(opened){requireContract(same(opened)&&opened.completeness==='OPEN'&&!next.has(opened.segmentId),'Invalid/new OPEN identity');requireContract(open!==null,'Missing admitted OPEN');next.set(opened.segmentId,open);}
    requireContract([...next.values()].filter(v=>v.record.completeness==='OPEN').length<=1,'Single OPEN record');capacity(next);return next;
  }
  const port:InterventionRecordPort={
    reserve(closed,opened){return mutate(()=>{
      requireContract(pending===null,'One record reservation');requireContract(closed!==null||opened!==null,'Empty record transition');
      const close=closed?admitInterventionRecord(closed):null,open=opened?admitInterventionRecord(opened):null;
      const candidate=transitions(close,open);requireContract(Number.isSafeInteger(sequence+1),'Record reservation exhausted');preparedRecords=candidate;
      pending=Object.freeze({version:'069-record-reservation-v1',sequence:++sequence,closed:close?.record??null,opened:open?.record??null});return pending;
    });},
    commit(reservation){return mutate(()=>{
      if(committed===reservation){requireContract(receipt!==null,'Missing accepted record receipt');return receipt;}
      requireContract(pending===reservation&&preparedRecords!==null,'Foreign/stale record reservation');
      records=preparedRecords;preparedRecords=null;committed=reservation;pending=null;
      receipt=Object.freeze({version:'069-record-receipt-v1',sequence:reservation.sequence,accepted:true,closedSegmentId:reservation.closed?.segmentId??null,openedSegmentId:reservation.opened?.segmentId??null});return receipt;
    });},
    reject(reservation){mutate(()=>{requireContract(pending===reservation,'Foreign record rejection');pending=null;preparedRecords=null;});},
    appendSample(segmentId:string,sample:TelemetrySample){mutate(()=>{requireContract(!pending,'Append conflicts with admitted boundary');const current=records.get(segmentId);requireContract(current?.record.completeness==='OPEN','Sample requires OPEN record');
      requireContract(current.record.samples.length<INTERVENTION_LIMITS.samples,'Intervention sample capacity; explicit rollover required');const nextRecord=admitInterventionRecord({...current.record,samples:[...current.record.samples,sample]});const next=new Map(records);next.set(segmentId,nextRecord);capacity(next);records=next;
    });},
    inspectReceipt(reservation){requireContract(!disposed,'Intervention record store disposed');return committed===reservation?receipt:null;},
    read(segmentId){requireContract(!disposed,'Intervention record store disposed');return records.get(segmentId)?.record??null;},
  };
  return Object.freeze({
    port:Object.freeze(port),
    appendSample:port.appendSample,
    // No unproven consumer acknowledgement can evict a CLOSED/pending-intake record.
    // This bounded RAM implementation retains all protected records until explicit owner disposal.
    getStats(){return Object.freeze({disposed,records:records.size,open:[...records.values()].filter(v=>v.record.completeness==='OPEN').length,reservations:pending?1:0,serializedArrayBytes:size(records),recordByteCap:INTERVENTION_LIMITS.recordBytes,durability:'RAM_ONLY' as const});},
    dispose(){requireContract(!busy,'Intervention record disposal reentrant');if(disposed)return;disposed=true;records.clear();pending=null;preparedRecords=null;committed=null;receipt=null;},
  });
}
