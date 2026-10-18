import assert from 'node:assert/strict';
import test from 'node:test';
import {createInterventionRecordStore,createInterventionEventTransport} from '../../src/telemetry';
import type {InterventionIntakeReceipt,InterventionRecordReceipt,InterventionResultToken} from '../../src/telemetry';
import {SEGMENT_CONTEXT,segmentFixture} from './manual-segments-fixture';
function resultToken(f:ReturnType<typeof segmentFixture>,operationId='tests:close:2'):InterventionResultToken{const d=f.intake.read(operationId)!;return {...f.context,version:'069-intake-result-token-v1',operationId,segmentId:d.segmentId,playerId:d.playerId,profileId:d.profileId,baseVersionId:d.baseVersionId,learningEpoch:d.learningEpoch};}
test('069 P1 cannot rewrite old retained operation into current restored epoch/base',()=>{
 const f=segmentFixture();f.apply('LEARNING');f.apply('MANUAL','MODE_CHANGE');const old=resultToken(f),change=f.change('PROFILE_RESTORE',Object.freeze({...f.target(),learningEpoch:2,baseVersionId:'style-v2'}));f.apply('MANUAL','PROFILE_RESTORE',null,change);
 assert.equal(f.owner.admitResult({...old,learningEpoch:2,baseVersionId:'style-v2'}),false);assert.equal(f.owner.admitResult(old),false);assert.equal(f.owner.observe().results,1);
});
test('069 P1 result rejects replaced original physical identity even while current authority AUTO',()=>{
 const f=segmentFixture();f.apply('LEARNING');f.apply('AUTO','RETURN_TO_AUTO');const token=resultToken(f);f.identities.set(f.identity.entityId,Object.freeze({...f.identity,generation:2}));assert.throws(()=>f.owner.admitResult(token),/Stale/);assert.equal(f.owner.observe().results,1);
});
test('069 P1 substituted valid prepared MANUAL record rejected before physical admission',()=>{
 const store=createInterventionRecordStore(SEGMENT_CONTEXT);const f=segmentFixture({records:{...store.port,reserve(closed,opened){return store.port.reserve(closed,opened?{...opened,controlMode:'MANUAL',learningEligible:false}:null);}}});
 assert.throws(()=>f.owner.prepare(f.plan('LEARNING')),/Substituted/);assert.equal(f.authority().tick,0);assert.equal(store.getStats().records,0);assert.equal(store.getStats().reservations,0);
});
test('069 P1 incoming native replacement during record reservation prevents the physical tick',()=>{
 const store=createInterventionRecordStore(SEGMENT_CONTEXT);let f:ReturnType<typeof segmentFixture>;f=segmentFixture({records:{...store.port,reserve(c,o){const r=store.port.reserve(c,o);f.identities.set(f.identity.entityId,Object.freeze({...f.identity,generation:2}));return r;}}});assert.throws(()=>f.owner.prepare(f.plan('LEARNING')));assert.equal(f.authority().tick,0);assert.equal(f.owner.observe().quarantined,true);assert.equal(f.owner.observe().pending!==null,true);
});
test('069 P1 getter-backed record acceptance never executes getter and forbids retry',()=>{
 const store=createInterventionRecordStore(SEGMENT_CONTEXT);let reads=0;const f=segmentFixture({records:{...store.port,commit(r){const receipt=store.port.commit(r);return Object.defineProperty({...receipt},'accepted',{enumerable:true,get(){reads++;return true;}}) as InterventionRecordReceipt;}}});const p=f.plan('LEARNING'),ticket=f.owner.prepare(p);f.accept(p);assert.throws(()=>f.owner.settle(ticket));assert.equal(reads,0);assert.equal(f.owner.observe().quarantined,true);assert.throws(()=>f.owner.retryDelivery(ticket),/known accepted/);assert.equal(store.getStats().open,1);
});
for(const bad of ['truthy','missing-version','getter'] as const)test(`069 P1 intake ${bad} receipt quarantines without executing getters`,()=>{
 let f:ReturnType<typeof segmentFixture>,reads=0;f=segmentFixture({acceptIntake(d){const raw:Record<string,unknown>={version:'069-intake-receipt-v1',operationId:d.operationId,segmentId:d.segmentId,accepted:true};if(bad==='truthy')raw.accepted='yes';if(bad==='missing-version')delete raw.version;if(bad==='getter')Object.defineProperty(raw,'accepted',{enumerable:true,get(){reads++;return true;}});return raw as unknown as InterventionIntakeReceipt;}});f.apply('LEARNING');const p=f.plan('MANUAL','MODE_CHANGE'),ticket=f.owner.prepare(p);f.accept(p);assert.throws(()=>f.owner.settle(ticket));assert.equal(reads,0);assert.equal(f.owner.observe().quarantined,true);assert.throws(()=>f.owner.retryDelivery(ticket),/known accepted/);
});
test('069 P1 event target mutation blocks intake, completed retry never bypasses fresh fence',()=>{
 const f=segmentFixture();f.apply('LEARNING');f.events.subscribe(e=>{if(e.type==='MANUAL_END')f.setTarget(Object.freeze({...f.target(),learningEpoch:2}));return undefined;});const p=f.plan('MANUAL','MODE_CHANGE'),ticket=f.owner.prepare(p);f.accept(p);assert.throws(()=>f.owner.settle(ticket));assert.equal(f.intake.getStats().entries,0);assert.equal(f.store.getStats().records,2);assert.throws(()=>f.owner.retryDelivery(ticket),/known accepted/);
 const g=segmentFixture(),q=g.plan('MANUAL'),done=g.owner.prepare(q);g.accept(q);g.owner.settle(done);g.setTarget(Object.freeze({...g.target(),learningEpoch:2}));assert.throws(()=>g.owner.settle(done),/target changed/);assert.equal(g.owner.observe().quarantined,true);
});
test('069 P1 result queue-read mutation of departed native identity cannot consume token',()=>{
 let f:ReturnType<typeof segmentFixture>,mutate=false;f=segmentFixture({inspectIntake(op){const receipt=f.intake.inspect(op);if(mutate)f.identities.set(f.identity.entityId,Object.freeze({...f.identity,generation:2}));return receipt;}});f.apply('LEARNING');f.apply('AUTO','RETURN_TO_AUTO');const token=resultToken(f);mutate=true;assert.throws(()=>f.owner.admitResult(token),/Stale/);assert.equal(f.owner.observe().results,1);
});
function event(eventId:string,tick:number,mode:'MANUAL'|'LEARNING'='MANUAL'){return {...SEGMENT_CONTEXT,eventId,tick,entityIds:['taxi-1'],type:'MANUAL_START' as const,payload:{vehicleId:'taxi-1',controlMode:mode}};}
test('069 P2 prospective007 watermark and accepted fingerprint are prephysical admissions',()=>{
 const t=createInterventionEventTransport(SEGMENT_CONTEXT,{maxEventsPerEpoch:2});assert.throws(()=>t.port.reserve([event('later',2),event('earlier',1)]),/watermark/);assert.equal(t.getStats().retainedEvents,0);
 const first=t.port.reserve([event('same',2)]);t.port.commit(first);assert.throws(()=>t.port.reserve([event('same',2,'LEARNING')]),/Conflicting/);
 const dup=t.port.reserve([event('same',2)]);t.port.commit(dup);assert.equal(t.getStats().retainedEvents,1);const last=t.port.reserve([event('new',3)]);t.port.commit(last);assert.equal(t.getStats().retainedEvents,2);
});
test('069 P2 reservationR1 proof is not overwritten by pending/acceptedR2 receipt',()=>{
 const t=createInterventionEventTransport(SEGMENT_CONTEXT),r1=t.port.reserve([event('one',1)]),one=t.port.commit(r1),r2=t.port.reserve([event('two',2)]);assert.equal(t.port.inspectReceipt(r1),one);assert.equal(t.port.commit(r1),one);assert.equal(t.port.inspectReceipt(r2)!.sequence,r2.sequence);t.port.commit(r2);assert.equal(t.port.inspectReceipt(r1),null);assert.throws(()=>t.port.commit(r1),/identity/);
});
test('069 P2 original007 listener error objects retained alongside accepted receipt, no redelivery',()=>{
 const t=createInterventionEventTransport(SEGMENT_CONTEXT),original=Error('actual listener cause');let deliveries=0;t.subscribe(()=>{deliveries++;throw original;});const r=t.port.reserve([event('one',1)]);assert.throws(()=>t.port.commit(r),e=>e instanceof AggregateError&&e.errors[0]===original);assert.equal(t.port.inspectReceipt(r)!.complete,true);assert.equal(t.port.commit(r).listenerFailures,1);assert.equal(deliveries,1);
});
test('069 rejected cleanup failure retains exactly one protected reservation and original causes',()=>{
 const store=createInterventionRecordStore(SEGMENT_CONTEXT),f=segmentFixture({records:{...store.port,reject(){throw Error('cleanup refused');}}});const ticket=f.owner.prepare(f.plan('MANUAL'));assert.throws(()=>f.owner.reject(ticket),/cleanup failed/);assert.equal(f.owner.observe().pending,ticket);assert.equal(f.owner.observe().quarantined,true);assert.equal(store.getStats().reservations,1);assert.throws(()=>f.owner.prepare(f.plan('MANUAL')),/lifecycle/);
});
test('069 acknowledged queue/result metadata stays bounded; protected history survives actual ack',()=>{
 const f=segmentFixture();const old=f.apply('LEARNING').active!;f.apply('MANUAL','MODE_CHANGE');const token=resultToken(f),descriptor=f.intake.read(token.operationId)!;assert.equal(f.owner.admitResult(token),true);f.owner.acknowledgeResult(token.operationId);assert.equal(f.owner.observe().results,0);assert.equal(f.intake.getStats().entries,0);assert.equal(f.intake.getStats().acknowledgedReceipts,1);assert.ok(f.intake.getStats().serializedMetadataBytes>2);assert.equal(f.store.port.read(old.segmentId)!.completeness,'CLOSED');assert.throws(()=>f.intake.reserve(descriptor),/version|identity|fields/);
});
test('069 actual accepted intake acknowledgement throw frees own metadata by strict release proof only',()=>{
 let f:ReturnType<typeof segmentFixture>;f=segmentFixture({acknowledgeIntake(op){const r=f.intake.inspect(op)!;f.intake.acknowledge(r);throw Error('ack after acceptance');}});const old=f.apply('LEARNING').active!;f.apply('MANUAL','MODE_CHANGE');const token=resultToken(f);f.owner.admitResult(token);assert.throws(()=>f.owner.acknowledgeResult(token.operationId),/ack after acceptance/);assert.equal(f.owner.observe().results,0);assert.equal(f.intake.getStats().entries,0);assert.equal(f.store.port.read(old.segmentId)!.completeness,'CLOSED');
});
test('069 host-provided sample append callback generation mutation retains prefix and quarantines',()=>{
 const store=createInterventionRecordStore(SEGMENT_CONTEXT);let f:ReturnType<typeof segmentFixture>;f=segmentFixture({records:{...store.port,appendSample(id,s){store.port.appendSample(id,s);f.identities.set(f.identity.entityId,Object.freeze({...f.identity,generation:2}));}}});const active=f.apply('LEARNING').active!;assert.throws(()=>f.owner.appendSample(f.identity,f.actualSample(1,'LEARNING')));assert.equal(store.port.read(active.segmentId)!.samples.length,1);assert.equal(f.owner.observe().quarantined,true);assert.throws(()=>f.owner.prepare(f.plan('LEARNING')),/lifecycle/);
});
for(const malformed of ['version','count','getter'] as const)test(`069 P1 malformed event ${malformed} receipt is not reusable acceptance proof`,()=>{
 const transport=createInterventionEventTransport(SEGMENT_CONTEXT);let reads=0;const f=segmentFixture({events:{...transport.port,commit(r,guard){const actual=transport.port.commit(r,guard),raw:Record<string,unknown>={...actual};if(malformed==='version')raw.version='wrong';if(malformed==='count')raw.acceptedCount=99;if(malformed==='getter')Object.defineProperty(raw,'complete',{enumerable:true,get(){reads++;return true;}});return raw as unknown as ReturnType<typeof transport.port.commit>;}}});const p=f.plan('MANUAL'),ticket=f.owner.prepare(p);f.accept(p);assert.throws(()=>f.owner.settle(ticket));assert.equal(reads,0);assert.equal(f.owner.observe().quarantined,true);assert.throws(()=>f.owner.retryDelivery(ticket),/known accepted/);
});
test('069 retire postcommit failure preserves inspected closed prefix without a physical mode reset',()=>{
 const store=createInterventionRecordStore(SEGMENT_CONTEXT);let throwClosed=false;const f=segmentFixture({records:{...store.port,commit(r){const receipt=store.port.commit(r);if(throwClosed)throw Error('retire accepted commit failed');return receipt;}}});const active=f.apply('MANUAL').active!,before=f.authority();throwClosed=true;assert.throws(()=>f.owner.retire(f.cause('STATE_IMPORT','AT_LAST_ACCEPTED_TICK')),/retire accepted/);assert.equal(f.authority(),before);assert.equal(store.port.read(active.segmentId)!.closeReason,'STATE_IMPORT');assert.equal(f.owner.observe().pending!==null,true);assert.equal(f.owner.observe().acceptedTick,1);
});
test('069 fresh retry fence rejects a changed target before any remaining intake callback',()=>{
 let f:ReturnType<typeof segmentFixture>,deliveries=0;f=segmentFixture({acceptIntake(d){deliveries++;if(deliveries===1)throw Error('known before queue acceptance');return f.intake.accept(d);}});f.apply('LEARNING');const p=f.plan('MANUAL','MODE_CHANGE'),ticket=f.owner.prepare(p);f.accept(p);assert.throws(()=>f.owner.settle(ticket));f.setTarget(Object.freeze({...f.target(),learningEpoch:2}));assert.throws(()=>f.owner.retryDelivery(ticket),/target changed/);assert.equal(deliveries,1);assert.equal(f.owner.observe().quarantined,true);assert.equal(f.intake.getStats().entries,0);
});

test('069 repair03 accepted record throw leaves event and intake suffix NOT_ATTEMPTED then resumes once',()=>{
 const store=createInterventionRecordStore(SEGMENT_CONTEXT);let commitCalls=0,fail=false;const f=segmentFixture({records:{...store.port,commit(r){commitCalls++;const receipt=store.port.commit(r);if(fail)throw Error('accepted record primary');return receipt;}}});
 f.apply('LEARNING');fail=true;const p=f.plan('MANUAL','MODE_CHANGE'),ticket=f.owner.prepare(p);f.accept(p);assert.throws(()=>f.owner.settle(ticket),/accepted record primary/);
 assert.equal(f.owner.inspectTicket(ticket)!.committed,true);assert.equal(f.owner.inspectTicket(ticket)!.eventDelivery,'NOT_ATTEMPTED');assert.equal(f.owner.inspectTicket(ticket)!.intakeDelivery,'NOT_ATTEMPTED');assert.equal(f.events.getStats().retainedEvents,1);assert.equal(f.intake.getStats().entries,0);
 assert.equal(f.owner.retryDelivery(ticket),true);assert.equal(commitCalls,2);assert.equal(f.events.getStats().retainedEvents,3);assert.equal(f.intake.getStats().entries,1);assert.equal(f.authority().tick,2);
});
test('069 repair03 accepted007 listener throw resumes only unattempted intake and never listeners',()=>{
 const f=segmentFixture();f.apply('LEARNING');let deliveries=0;const original=Error('listener accepted primary');f.events.subscribe(()=>{deliveries++;throw original;});const p=f.plan('MANUAL','MODE_CHANGE'),ticket=f.owner.prepare(p);f.accept(p);
 assert.throws(()=>f.owner.settle(ticket),e=>e instanceof AggregateError&&e.errors.includes(original));assert.equal(deliveries,2);assert.equal(f.owner.inspectTicket(ticket)!.eventDelivery,'ACCEPTED');assert.equal(f.owner.inspectTicket(ticket)!.intakeDelivery,'NOT_ATTEMPTED');assert.equal(f.intake.getStats().entries,0);
 assert.equal(f.owner.retryDelivery(ticket),true);assert.equal(deliveries,2);assert.equal(f.intake.getStats().entries,1);assert.equal(f.authority().tick,2);
});
for(const mutate of ['target','native'] as const)test(`069 repair03 END ${mutate} mutation prevents actual007 START and intake`,()=>{
 const f=segmentFixture();f.apply('LEARNING');let starts=0;f.events.subscribe(e=>{if(e.type==='MANUAL_END'){if(mutate==='target')f.setTarget(Object.freeze({...f.target(),learningEpoch:2}));else f.identities.set(f.identity.entityId,Object.freeze({...f.identity,generation:2}));}else starts++;return undefined;});
 const p=f.plan('MANUAL','MODE_CHANGE'),ticket=f.owner.prepare(p);f.accept(p);assert.throws(()=>f.owner.settle(ticket));assert.equal(starts,0);assert.equal(f.events.getStats().retainedEvents,2);assert.equal(f.intake.getStats().entries,0);assert.equal(f.owner.inspectTicket(ticket)!.quarantined,true);assert.throws(()=>f.owner.retryDelivery(ticket));
});
test('069 repair03 recordR1 proof survives pending/rejected R2 and expires only upon accepted R2',()=>{
 const f=segmentFixture();f.apply('MANUAL');const row=f.store.port.read(f.owner.observe().active!.segmentId)!;const store=createInterventionRecordStore(SEGMENT_CONTEXT),r1=store.port.reserve(null,row),proof=store.port.commit(r1);
 const closed={...row,endTick:2,closeReason:'RETURN_TO_AUTO' as const,completeness:'CLOSED' as const},r2=store.port.reserve(closed,null);assert.equal(store.port.inspectReceipt(r1),proof);assert.equal(store.port.commit(r1),proof);store.port.reject(r2);assert.equal(store.port.inspectReceipt(r1),proof);assert.equal(store.port.commit(r1),proof);
 const r3=store.port.reserve(closed,null);store.port.commit(r3);assert.equal(store.port.inspectReceipt(r1),null);assert.throws(()=>store.port.commit(r1),/stale/);assert.equal(store.port.commit(r3).sequence,r3.sequence);
});
for(const kind of ['suspended','fault'] as const)test(`069 repair03 standalone settle rejects unexpected accepted ${kind} before metadata`,()=>{
 const f=segmentFixture(),p=f.plan('MANUAL'),ticket=f.owner.prepare(p);f.accept(p);f.setAuthority(Object.freeze({...f.authority(),...(kind==='suspended'?{suspended:true}:{fault:'actual accepted fault'})}));assert.throws(()=>f.owner.settle(ticket));assert.equal(f.store.getStats().records,0);assert.equal(f.events.getStats().retainedEvents,0);assert.equal(f.owner.observe().acceptedTick,1);assert.equal(f.owner.observe().fault!.physicalTickAccepted,true);assert.equal(f.owner.observe().quarantined,true);
});
test('069 repair03 event transport retains exact accepted prefix and original listener cause before guard failure',()=>{
 const transport=createInterventionEventTransport(SEGMENT_CONTEXT),original=Error('accepted END listener');let changed=false,starts=0;transport.subscribe(e=>{if(e.type==='MANUAL_END'){changed=true;throw original;}starts++;return undefined;});
 const end={...event('end',1),type:'MANUAL_END' as const},r=transport.port.reserve([end,event('start',1)]);assert.throws(()=>transport.port.commit(r,()=>{if(changed)throw Error('actual phase changed');}),e=>e instanceof AggregateError&&e.errors.includes(original));assert.equal(transport.port.inspectReceipt(r)!.acceptedCount,1);assert.equal(transport.port.inspectReceipt(r)!.complete,false);assert.equal(starts,0);assert.equal(transport.getStats().retainedEvents,1);
});

test('069 repair03 validated actual007 accepted prefix resumes START only under unchanged phase',()=>{
 const transport=createInterventionEventTransport(SEGMENT_CONTEXT);let cut=false,guards=0,ends=0,starts=0;transport.subscribe(e=>{if(e.type==='MANUAL_END')ends++;else starts++;return undefined;});
 const f=segmentFixture({events:{...transport.port,commit(r,guard){return transport.port.commit(r,()=>{guard?.();if(cut&&++guards===3)throw Error('known publication suffix not attempted');});}}});f.apply('LEARNING');cut=true;
 const p=f.plan('MANUAL','MODE_CHANGE'),ticket=f.owner.prepare(p);f.accept(p);assert.throws(()=>f.owner.settle(ticket),/suffix not attempted/);assert.equal(f.owner.inspectTicket(ticket)!.eventDelivery,'ACCEPTED_PREFIX');assert.equal(ends,1);assert.equal(starts,1);assert.equal(f.intake.getStats().entries,0);
 assert.equal(f.owner.retryDelivery(ticket),true);assert.equal(ends,1);assert.equal(starts,2);assert.equal(f.intake.getStats().entries,1);assert.equal(f.authority().tick,2);
});
