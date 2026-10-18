import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceZoneCatalog,serviceFootprintInside } from '../../src/world/service-zones';
import { serviceReferenceFixture } from '../browser/service-zones/road-fixture';
import { createLaneGraph } from '../../src/world/lane-graph';
const query={category:'SERVICE' as const,id:'service',fromLaneId:'lane-2',access:'TAXI' as const,purpose:'PICKUP' as const};
const size={halfWidthM:1.22,halfLengthM:2};
test('040 actual032 IDs/directed033 route and collinear anchor produce explicit conditions',()=>{
  const {map,graph}=serviceReferenceFixture(),catalog=createServiceZoneCatalog(map,graph);
  try {const result=catalog.resolve(query,size);assert.equal(result.status,'READY');if(result.status==='READY'){assert.equal(result.site.anchorNodeId,'040-safe');assert.deepEqual(result.corridor.start,{x:0,y:0,z:-40});assert.deepEqual(result.corridor.end,{x:0,y:0,z:100});assert.equal(result.site.positionM.z,-12);}
    assert.equal(catalog.resolve({...query,id:'foreign'},size).status,'DENIED');
    assert.deepEqual(catalog.resolve({...query,fromLaneId:'foreign'},size),{status:'DENIED',reason:'UNREACHABLE'});
    assert.deepEqual(catalog.resolve(query,{halfWidthM:13,halfLengthM:2}),{status:'DENIED',reason:'INSUFFICIENT_SPACE'});
  }finally{catalog.dispose();}assert.equal(catalog.getStats().sites,0);assert.throws(()=>catalog.resolve(query,size));
});
test('040 access and pickup/dropoff conditions are independent of static reachability',()=>{
  const data=structuredClone(serviceReferenceFixture().map);const mutable=JSON.parse(JSON.stringify(data));mutable.serviceZones[0].access=['TAXI'];mutable.serviceZones[0].kind='PICKUP';const graph=createLaneGraph(mutable),catalog=createServiceZoneCatalog(mutable,graph);
  try{assert.deepEqual(catalog.resolve({...query,access:'CIVIL'},size),{status:'DENIED',reason:'ACCESS_DENIED'});assert.deepEqual(catalog.resolve({...query,purpose:'DROPOFF'},size),{status:'DENIED',reason:'KIND_DENIED'});}finally{catalog.dispose();}
});
test('040 notch crossing rejected although all four vehicle corners lie in the polygon',()=>{
  const points=(rows:number[][])=>rows.map(([x,z])=>({x,y:0,z}));
  const notch=points([[-5,-5],[5,-5],[5,5],[1,5],[1,1],[-1,1],[-1,5],[-5,5]]);
  assert.equal(serviceFootprintInside(notch,points([[-2,0],[2,0],[2,3],[-2,3]])),false);
  assert.equal(serviceFootprintInside(notch,points([[-2,-3],[2,-3],[2,0],[-2,0]])),true);
  assert.equal(serviceFootprintInside(points([[-2,-2],[2,-2],[2,2],[-2,2]]),points([[-2,-2],[2,-2],[2,2],[-2,2]])),true);
});
test('040 corner/sloped anchor and forged graph geometry deny supported placement',()=>{
  const base=serviceReferenceFixture();const foreign={...base.graph,mapId:'other'};assert.throws(()=>createServiceZoneCatalog(base.map,foreign));
  const bad={...base.graph,getDirectedPath:(id:string)=>{const path=base.graph.getDirectedPath(id);return path?{...path,points:path.points.map((p,i)=>i===1?{...p,x:p.x+1}:p)}:null;}};
  assert.throws(()=>createServiceZoneCatalog(base.map,bad));
  const raw=JSON.parse(JSON.stringify(base.map));raw.geometry.nodes.find((n:{id:string})=>n.id==='040-safe').positionM.x=1;
  const catalog=createServiceZoneCatalog(raw,createLaneGraph(raw));try{assert.deepEqual(catalog.resolve({...query,category:'RECOVERY',id:'point-safe'},size),{status:'DENIED',reason:'UNSUPPORTED_CORRIDOR'});}finally{catalog.dispose();}
});
test('040 exact own-data query rejects getters and unknown fields before using values',()=>{
  const fixture=serviceReferenceFixture(),catalog=createServiceZoneCatalog(fixture.map,fixture.graph);let reads=0;
  const hostile={...query};Object.defineProperty(hostile,'id',{enumerable:true,get(){reads++;return'service';}});
  try{assert.throws(()=>catalog.resolve(hostile,size));assert.equal(reads,0);assert.throws(()=>catalog.resolve({...query,unexpected:true} as typeof query,size));}finally{catalog.dispose();}
});
test('040 finite recovery catalog capacity and malformed polygon fail closed',()=>{
  const base=serviceReferenceFixture(),raw=JSON.parse(JSON.stringify(base.map));
  raw.recoveryPoints=Array.from({length:257},(_,i)=>({...raw.recoveryPoints[0],id:'capacity-point-'+i}));
  assert.throws(()=>createServiceZoneCatalog(raw,createLaneGraph(raw)));
  const bow=JSON.parse(JSON.stringify(base.map));bow.geometry.areas[0].vertexNodeIds=['service-0','service-2','service-1','service-3'];
  const catalog=createServiceZoneCatalog(bow,createLaneGraph(bow));try{assert.deepEqual(catalog.resolve(query,size),{status:'DENIED',reason:'INSUFFICIENT_SPACE'});}finally{catalog.dispose();}
});
test('040 fresh graph binding cannot invent routes or replace same-map lane geometry',()=>{
  const base=serviceReferenceFixture();let changed=false;
  const graph={...base.graph,getDirectedPath:(id:string)=>{const path=base.graph.getDirectedPath(id);return changed&&path?{...path,points:path.points.map((p,i)=>i===1?{...p,x:p.x+2}:p)}:path;}};
  const catalog=createServiceZoneCatalog(base.map,graph);try{assert.equal(catalog.resolve(query,size).status,'READY');changed=true;assert.throws(()=>catalog.resolve(query,size));assert.equal(catalog.getStats().queriesInFlight,0);}finally{catalog.dispose();}
});
test('040 authored recovery heading must align exactly; slanted, reverse and near-perpendicular deny',()=>{
  for(const heading of [0,Math.PI/2-.01,Math.PI/2+1e-12,Math.PI, -Math.PI/2]) {
    const raw=JSON.parse(JSON.stringify(serviceReferenceFixture().map));raw.recoveryPoints[0].headingRad=heading;
    const catalog=createServiceZoneCatalog(raw,createLaneGraph(raw));
    try{assert.deepEqual(catalog.resolve({...query,category:'RECOVERY',id:'point-safe'},size),{status:'DENIED',reason:'UNSUPPORTED_CORRIDOR'});}finally{catalog.dispose();}
  }
});
test('040 REVERSE lane uses actual reversed path/headings; endpoint footprint still denies',()=>{
  const raw=JSON.parse(JSON.stringify(serviceReferenceFixture().map));
  raw.lanes[0].direction='REVERSE';raw.geometry.paths[0].nodeIds.reverse();
  const catalog=createServiceZoneCatalog(raw,createLaneGraph(raw));
  try{assert.equal(catalog.resolve({...query,category:'RECOVERY',id:'point-safe'},size).status,'READY');}finally{catalog.dispose();}
  const endpoint=JSON.parse(JSON.stringify(serviceReferenceFixture().map));endpoint.recoveryPoints[0].nodeId='road-0';
  const edge=createServiceZoneCatalog(endpoint,createLaneGraph(endpoint));
  try{assert.deepEqual(edge.resolve({...query,category:'RECOVERY',id:'point-safe'},size),{status:'DENIED',reason:'INSUFFICIENT_SPACE'});}finally{edge.dispose();}
});
