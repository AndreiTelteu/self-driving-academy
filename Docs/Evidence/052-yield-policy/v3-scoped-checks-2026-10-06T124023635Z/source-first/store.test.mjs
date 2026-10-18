import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,rename,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {yieldBrowserStore} from './store.mjs';
import {rawDistribution} from '../yield-policy-v2/protocol.ts';
async function cleanupGeneratedTemp(root) {
  const target = await realpath(resolve(root));
  const boundary = await realpath(resolve(tmpdir()));
  assert.equal(dirname(target).toLowerCase(),boundary.toLowerCase(),'Recursive cleanup must stay immediately inside actual tmpdir');
  assert.ok(basename(target).startsWith('052-v3-unit-'),'Recursive cleanup requires the verified generated test prefix');
  await rm(target,{recursive:true,force:true});
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function row(ordinal, ratioFailure=false) {
  const calibration=ordinal<4,seconds=calibration?13:3,ticks=seconds*60;
  const frame=Array(ticks).fill(1000/60);if(ratioFailure)frame[frame.length-1]+=62;
  const raw={frame,main:Array(ticks).fill(2),tick:Array(ticks).fill(1),step:Array(ticks).fill(.7),policy:Array(ticks).fill(.1)};
  const warm=calibration?0:1,origin=1000,start=origin+warm*1000,previous=start-1,span=frame.reduce((a,b)=>a+b,0);
  return {raw,metadata:{ordinal,current:calibration?true:false,pair:0,classId:ordinal<2?'sedan':'compact',thresholdS:ordinal%2?3:.2,otherDistanceM:14,warmupSeconds:warm,measuredSeconds:seconds,overloadCount:0,memory:{cars:calibration?2:70,numericChannelBytes:1248000},measurement:{originMs:origin,windowStartMs:start,windowEndMs:start+seconds*1000,previousFrameMs:previous,firstFrameMs:previous+frame[0],lastFrameMs:previous+span,lastWallMs:previous+span,samples:frame.length,nativeTicks:ticks},simulationToActiveWallTime:seconds/(span/1000),activeWallSeconds:(previous+span-origin)/1000,stats:Object.fromEntries(Object.entries(raw).map(([key,values])=>[key,rawDistribution(values)])),nativeReadbacks:Array.from({length:130},(_,index)=>({tick:(index+1)*6})),checkpoints:Array.from({length:6},(_,index)=>({tick:(index+1)*120})),cleanup:{bodies:{entities:0},controller:{vehicles:0},label:'UNIT DTO ONLY, NO NATIVE WORLD'}}};
}
async function setup() {
  const root=await mkdtemp(join(tmpdir(),'052-v3-unit-'));
  const store=yieldBrowserStore(root,{sourceHash:'UNIT_ONLY',artifactHash:'UNIT_ONLY'},async()=>{});
  const {captureId}=await store.start({fixtureVersion:'052-yield-browser-v2',sourceHash:'UNIT_ONLY',backend:'WEBGL2',full:false});
  return {root,store,captureId,folder:join(root,'WEBGL2-smoke')};
}
async function submit(value,ordinal,ratioFailure=false) {
  const {raw,metadata}=row(ordinal,ratioFailure),rawParts=[];
  for(const[channel,numbers]of Object.entries(raw)){await value.store.part({captureId:value.captureId,ordinal,channel,part:0,numbers});rawParts.push({channel,part:0,count:numbers.length});}
  return {captureId:value.captureId,ordinal,metadata:{...metadata,rawParts}};
}
test('052-v3 ratio rejection retains exact submitted endpoints/cleanup/hash before validation and immutable duplicate',async()=>{
  const value=await setup();try{
    for(let ordinal=0;ordinal<4;ordinal++)await value.store.arm(await submit(value,ordinal));
    const body=await submit(value,4,true);await assert.rejects(value.store.arm(body),/observed simulation/wall ratio/);
    const file=join(value.folder,'submitted-arm-4.json'),first=await readFile(file),saved=JSON.parse(first);
    assert.deepEqual(saved.request,body);assert.equal(saved.parsedRequestSha256,hash(body));assert.equal(saved.parsedRequestBytes,Buffer.byteLength(JSON.stringify(body)));
    assert.deepEqual(saved.request.metadata.measurement,body.metadata.measurement);assert.deepEqual(saved.request.metadata.cleanup,body.metadata.cleanup);
    assert.ok(Number.isFinite(Date.parse(saved.receivedAt)));
    assert.ok(!(await readdir(value.folder)).includes('arm-4.json'));
    await assert.rejects(value.store.arm(body),/EEXIST/);assert.deepEqual(await readFile(file),first);
    assert.equal((await readdir(value.folder)).filter(name=>name.startsWith('submission-rejected-')).length,2);
    await assert.rejects(value.store.finish({captureId:value.captureId}),/failed/rejected/);
  }finally{await cleanupGeneratedTemp(value.root);}
});
test('052-v3 oversized submission leaves bounded size/hash rejection and no huge immutable envelope',async()=>{
  const value=await setup();try{
    const body={captureId:value.captureId,ordinal:0,metadata:{payload:'x'.repeat(4*1024*1024)}};
    await assert.rejects(value.store.arm(body),/exceeds4MiB/);
    const diagnostic=JSON.parse(await readFile(join(value.folder,'submission-rejected-0.json'),'utf8'));
    assert.equal(diagnostic.parsedRequestSha256,hash(body));assert.ok(diagnostic.parsedRequestBytes>4*1024*1024);
    assert.ok(Buffer.byteLength(JSON.stringify(diagnostic))<128*1024);
    assert.ok(!(await readdir(value.folder)).includes('submitted-arm-0.json'));
  }finally{await cleanupGeneratedTemp(value.root);}
});
test('052-v3 original rejected-export cause survives independent diagnostic storage failure',async()=>{
  const value=await setup();const moved=value.folder+'-moved';try{
    await value.store.arm(await submit(value,0));
    await rename(value.folder,moved);
    await assert.rejects(value.store.finish({captureId:value.captureId}),error=>{
      assert.ok(error instanceof AggregateError);
      assert.ok(error.errors[0] instanceof AggregateError);
      assert.equal(error.errors[0].errors[0].actual,1);
      assert.equal(error.errors[0].errors[0].expected,14);
      assert.match(String(error.errors[0].errors[1]),/ENOENT/);
      assert.match(String(error.errors[1]),/ENOENT/);
      return true;
    });
  }finally{await cleanupGeneratedTemp(value.root);}
});
