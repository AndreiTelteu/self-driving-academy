/** UNEXECUTED pricing draft. Isolated synthetic scheduling overhead, never a hardware gate. */
import { CaptureLifetime } from './lifetime.mjs';
export async function priceScheduling(now, frames = 10000) {
  if (frames !== 10000) throw new Error('Fixed bounded pricing fixture');
  const records=[];
  for(let pair=0;pair<5;pair++) for(const enabled of pair%2 ? [true,false] : [false,true]) {
    let stamp=0,callback;
    const counters={tick:0,frameCount:0,tickCount:0,nativeCount:0,renderCount:0,armIndex:0,pair,current:true};
    const life=new CaptureLifetime({now:()=>stamp,foreground:()=>true,requestRaf:cb=>{callback=cb;return 1;},cancelRaf:()=>{},setTimer:()=>2,clearTimer:()=>{}});
    const elapsed=[];
    for(let frame=0;frame<frames;frame++) {
      const start=now();stamp+=1000/60;
      if(enabled) {
        life.boundary('native-entry',counters);life.boundary('native-exit',counters);
        life.boundary('render-entry',counters);life.boundary('render-exit',counters);
        const pending=life.nextFrame(()=>counters);callback(stamp);await pending;
      } else await Promise.resolve(stamp); // Uninstrumented continuation comparator; no simulated physics.
      elapsed.push(now()-start);
    }
    records.push({pair,enabled,frames,elapsedMs:elapsed,retainedJournal:life.journal.length,retainedTrigger:!!life.lastTrigger});
    await life.teardown();
  }
  return {purpose:'SYNTHETIC_INSTRUMENTATION_PRICE_ONLY',records,scope:'Additional pricing input only. Native/world/render observer OFF/ON and actual full gates still required.'};
}
