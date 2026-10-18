type Cleanup={attempts:string[];errors:unknown[];snapshots:Record<string,unknown>};
export function checkLifecycleCleanup(cleanup:Cleanup){
 const errors:string[]=[];const owned=new Set(cleanup.attempts);if(owned.size!==cleanup.attempts.length)errors.push('Duplicate owner disposal attempt');
 const snapshot=(name:string)=>{const p=cleanup.snapshots[name];if(!p||typeof p!=='object'){errors.push('Missing owned readback:'+name);return null;}return p as Record<string,unknown>;};
 const zero=(name:string,keys:string[])=>{const p=snapshot(name);if(p)for(const key of keys)if(p[key]!==0)errors.push(name+'.'+key+' nonzero');};
 if(owned.has('world')){zero('body',['entities','subscriptions']);zero('collision',['colliders']);}
 for(const [name,keys] of [['controller',['vehicles','players','targets','projections']],['authority',['vehicles','players']],['selection',['vehicles','pending','inFlight','retainedHistory']],['keyboard',['heldKeys']],['registry',['bindings']]] as [string,string[]][])if(owned.has(name))zero(name,keys);
 for(const name of ['controller','authority','selection','keyboard','camera'])if(owned.has(name)){const p=snapshot(name);if(p&&p.disposed!==true)errors.push(name+' not disposed');}
 if(owned.has('selection')){const p=snapshot('selection');if(p&&p.projection!==null)errors.push('Selection projection retained');}
 if(owned.has('renderer')){zero('renderer',['meshes','materials','cameras']);const p=snapshot('renderer');if(p&&p.disposed!==true)errors.push('Renderer not disposed');}
 if(owned.has('ui')){const p=snapshot('ui');if(p&&p.connected!==false)errors.push('UI connected');}
 for(const name of owned)if(name.startsWith('mesh-')||name.startsWith('material-')){const p=snapshot(name);if(p&&p.disposed!==true)errors.push(name+' not disposed');}
 for(const name of ['mode','segment','picker'])if(owned.has(name))snapshot(name);
 if(owned.has('mode'))zero('mode',['intents','inFlight']);
 if(owned.has('segment'))zero('segment',['retainedSegments']);
 if(owned.has('picker')){const p=snapshot('picker');if(p&&p.pickAfterDisposeNull!==true)errors.push('Picker disposed read failed');}
 return {errors,world:owned.has('world')?'ACQUIRED':'NOT_ACQUIRED',input:owned.has('authority')?'ACQUIRED':'NOT_ACQUIRED',renderer:owned.has('renderer')?'ACQUIRED':'NOT_ACQUIRED'};
}
export function requireCurrentCanvas(canvas:{isConnected:boolean;id:string},current:unknown){
 if(!canvas.isConnected||canvas.id!=='canvas'||current!==canvas)throw Error('Lifecycle current DOM canvas identity/connection');
}

export function requireLifecycleSurface(value:{css:number[];internal:number[];dpr:number}){if(value.dpr!==1||value.css.length!==2||value.internal.length!==2||value.css[0]!==1920||value.css[1]!==1080||value.internal[0]!==1920||value.internal[1]!==1080)throw Error('Lifecycle actual CSS/internal/DPR');}

export function lifecycleFailures(primary:unknown,cleanup:{errors:{resource:string;phase:string;message:string}[]},ownershipErrors:string[]):unknown[]{return [...(primary?[primary]:[]),...cleanup.errors.map(e=>Error(e.resource+':'+e.phase+':'+e.message)),...ownershipErrors.map(message=>Error(message))];}
