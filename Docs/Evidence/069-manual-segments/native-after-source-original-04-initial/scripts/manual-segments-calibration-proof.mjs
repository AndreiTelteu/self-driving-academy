// SOURCE-only pure admission/error helpers, no native acquisition or production mutation.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
export const CHECKED_PRODUCT_SHA='de072b4acb1a3f7879ce62ba94ba13476c1ac40af822f53504720d7a8ed1f1b6';
export const CALIBRATION_CLOSURE=Object.freeze(['scripts/benchmark-manual-segments-owner-calibration.mjs','scripts/manual-segments-after-records.mjs','scripts/manual-segments-calibration-proof.mjs','tests/telemetry/manual-segments-after.ts','tests/telemetry/manual-segments-reference.ts','tests/input/vehicle-selection-native-guard-v2.ts','tests/input/vehicle-selection-reference.ts','scripts/register-typescript.mjs','Docs/Evidence/069-manual-segments/verify-owner-calibration.mjs','Docs/Evidence/069-manual-segments/implementation-scoped-checks-03/results-final.json','tests/telemetry/manual-segments-after-calibration.test.ts','tests/contracts/fixtures.ts','package.json','package-lock.json','Docs/performance-budgets.json']);
export function validateCheckedProduct(checked){
 const source=Object.getOwnPropertyDescriptor(checked,'source'),declared=Object.getOwnPropertyDescriptor(checked,'sourceFinal');assert(source&&'value'in source&&declared&&'value'in declared,'Checked metadata must have own data fields');assert.equal(declared.value,CHECKED_PRODUCT_SHA);assert(Array.isArray(source.value));assert.equal(source.value.length,18);
 const rows=source.value.map(row=>own(row,['path','bytes','sha256']));assert.equal(new Set(rows.map(row=>row.path)).size,18);for(const row of rows){assert.equal(typeof row.path,'string');assert(Number.isSafeInteger(row.bytes)&&row.bytes>0);assert.equal(typeof row.sha256,'string');assert(/^[a-f0-9]{64}$/.test(row.sha256));}
 assert.equal(createHash('sha256').update(rows.map(row=>row.path+':'+row.sha256+'\n').join('')).digest('hex'),CHECKED_PRODUCT_SHA,'Checked18 exact ordered metadata fingerprint');return rows;
}
export function validateCalibrationClosure(paths,checked){
 validateCheckedProduct(checked);assert.equal(new Set(paths).size,paths.length);
 for(const path of [...CALIBRATION_CLOSURE,...checked.source.map(row=>row.path)])assert(paths.includes(path),'Missing consumed/checked calibration closure '+path);
}
function own(value,keys){assert(value&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());const result={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);assert(d&&'value'in d,'Accessor not allowed');result[key]=d.value;}return result;}
export function validateOwnerIntake(record,descriptor,receipt,owner){
 const d=own(descriptor,['schemaVersion','units','sessionId','worldEpoch','version','operationId','segmentId','playerId','profileId','learningEpoch','baseVersionId','endTick','recordBytes']);
 const r=own(receipt,['version','operationId','segmentId','accepted']);assert.equal(d.version,'069-closed-learning-intake-v1');assert.equal(r.version,'069-intake-receipt-v1');assert.equal(r.accepted,true);assert.equal(typeof d.operationId,'string');assert(d.operationId.length>0&&d.operationId.length<=256);assert.equal(r.operationId,d.operationId);assert.equal(r.segmentId,d.segmentId);
 for(const key of ['schemaVersion','units','sessionId','worldEpoch','segmentId','playerId','profileId','learningEpoch','baseVersionId','endTick'])assert.equal(d[key],record[key]);assert.equal(d.recordBytes,Buffer.byteLength(JSON.stringify(record)));assert(d.recordBytes<=65536);assert.equal(record.controlMode,'LEARNING');assert.equal(record.learningEligible,true);assert.equal(record.completeness,'CLOSED');assert.equal(owner.results,1);assert.equal(owner.pending,null);assert.equal(owner.fault,null);
 return {operationId:d.operationId,segmentId:d.segmentId,recordBytes:d.recordBytes};
}
export function serializeDiagnostic(error,depth=0,state={remaining:12,seen:new Set()}){
 if(depth>3||state.remaining===0||state.seen.has(error))return {name:'DiagnosticLimit',message:'bounded nested/cyclic error'};state.remaining--;state.seen.add(error);
 const row={name:String(error?.name??'Error').slice(0,128),message:String(error?.message??error).slice(0,1024),stack:String(error?.stack??'').slice(0,4096)};
 const children=error instanceof AggregateError?[...error.errors]:error?.cause!==undefined?[error.cause]:[];
 const retained=children.slice(0,Math.min(12,state.remaining));if(retained.length)row.causes=retained.map(c=>serializeDiagnostic(c,depth+1,state));if(children.length>retained.length)row.omittedCauses=children.length-retained.length;return row;
}
export async function exportFailurePreserving(original,write){try{await write();}catch(exportError){throw new AggregateError([original,exportError],'Original failure/export failure');}}
