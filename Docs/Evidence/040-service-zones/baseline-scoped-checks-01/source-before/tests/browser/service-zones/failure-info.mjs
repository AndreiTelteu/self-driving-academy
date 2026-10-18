import { types } from 'node:util';
/** Cold diagnostics only. Native Error own data is read without custom getters/coercion.
 * Proxies and arbitrary objects are explicitly opaque. Cause export is bounded8/depth4.
 */
export function failureInfo(error, depth=0) {
  const out={name:'ThrownValue',message:'Opaque thrown value',causes:[],causeLimit:8,depthLimit:4,omittedCauses:0};
  if(typeof error==='string') {out.message=error.length?error.slice(0,2048):'Empty string thrown';return out;}
  if(error===null || typeof error!=='object') {out.message=error===null?'null thrown':typeof error+' thrown';return out;}
  if(types.isProxy(error) || !types.isNativeError(error)) return out;
  const descriptors=Object.getOwnPropertyDescriptors(error);
  const own=k=>descriptors[k] && 'value' in descriptors[k] ? descriptors[k].value : undefined;
  out.name='NativeError';const message=own('message');
  if(typeof message==='string') out.message=message.length?message.slice(0,2048):'Empty Error message';
  const causes=own('errors'), cause=own('cause');
  const retained=[];
  if(Array.isArray(causes) && !types.isProxy(causes)) {
    const fields=Object.getOwnPropertyDescriptors(causes),length=fields.length?.value;
    if(Number.isSafeInteger(length) && length>=0) {
      out.omittedCauses=Math.max(0,length-8);
      for(let i=0;i<Math.min(length,8);i++) retained.push(fields[i] && 'value' in fields[i]?fields[i].value:'Accessor or missing cause');
    }
  } else if(descriptors.cause && 'value' in descriptors.cause) retained.push(cause);
  if(depth>=4) {out.omittedCauses+=retained.length;return out;}
  out.causes=retained.map(value=>failureInfo(value,depth+1));return out;
}
