export interface NativePoint {nativeSerial:number;controllerTick:number;}
export interface WarmWait {phase:'INITIAL'|'WARM';requestStartedAt:number;previousStamp:number|null;counterBefore:NativePoint;returnedStamp?:number;callbackObservedAt?:number;gapMs?:number|null;counterAfter?:NativePoint;}
export interface CompletedFrame {stampMs:number;readStartedAt:number;readEndedAt:number;counter:NativePoint;frameWorkMs:number;renderWorkMs:number;}
/** One actual pending/returned wait and four completed warm frame costs only.
 * Copies/reads are inside the original active warm clock, never a reconstructed raw stream. */
export function warmObservation(){let wait:WarmWait|null=null;const completed:CompletedFrame[]=[];return {
 wait(value:WarmWait){wait=structuredClone(value);},
 returned(value:Pick<WarmWait,'returnedStamp'|'callbackObservedAt'|'gapMs'|'counterAfter'>){if(!wait)throw Error('Warm return without owned wait');Object.assign(wait,structuredClone(value));},
 completed(value:CompletedFrame){if(completed.length===4)completed.shift();completed.push(structuredClone(value));},
 snapshot(){return structuredClone({scope:'BOUNDED_WARM_DIAGNOSTIC_ONLY',acceptance:false,ownedCompletedFramesMaximum:4,wait,completed,overhead:'Actual clock/native reads and bounded copies inside original active warm windows; no pure cost or scheduler causality claim'});}
};}
