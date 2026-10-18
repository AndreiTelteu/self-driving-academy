import { parentPort } from 'node:worker_threads';
import { WorkerRuntime } from '../../src/workers/index.ts';
let maxSliceMs=0;let slices=0;
const transport={ send:(p, transfers)=>parentPort.postMessage(p, transfers), listen:(message,error)=>{parentPort.on('message',message);parentPort.on('messageerror',error);return()=>{parentPort.off('message',message);parentPort.off('messageerror',error);};}};
new WorkerRuntime(transport,(job)=>{
  let count=0;
  return {step(deadline){
    const start=performance.now();slices++;
    if(job.segmentId==='long'){while(performance.now()<Math.min(deadline,start+2)) count++; maxSliceMs=Math.max(maxSliceMs,performance.now()-start);return {done:false,progress:0.5};}
    if(job.segmentId==='throw') throw new Error('Fixture failure');
    const result=new Float64Array([maxSliceMs,slices,process.memoryUsage().heapUsed,process.memoryUsage().rss]);
    return {done:true,progress:1,result:result.buffer};
  },dispose(){}};
});
