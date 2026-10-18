/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDriverLedger } from './driver-proof';
function row() {
  const events = [{ordinal:0,type:'keydown',code:'KeyR',repeat:false,isTrusted:false,stage:'NO_POINT',tick:1,generation:1,readMs:1},{ordinal:1,type:'click',code:'HUD',repeat:false,isTrusted:false,stage:'TRUSTED_HUD',tick:391,generation:1,readMs:2},{ordinal:2,type:'click',code:'HUD',repeat:false,isTrusted:false,stage:'AUTO_REJECT',tick:392,generation:null,readMs:3}];
  return { generation:1,setupWrites:[{stage:'SYNTHETIC_DRIVER_LEDGER',origin:'SYNTHETIC_DOM_DRIVER',physicalAcceptance:false,released:true,heldAtEnd:[] as string[],events}],keys:[{...events[0],readMs:1.1}],hud:{pointer:{isTrusted:false,readMs:2.1}},staleHud:{pointer:{isTrusted:false,readMs:3.1}} };
}
test('driver proof rejects trust upgrade, missing observed row, coordinated unknown origin and unreleased key', () => {
  validateDriverLedger(row());
  for (const mutate of [
    (r: ReturnType<typeof row>) => { r.keys[0]!.isTrusted=true; },
    (r: ReturnType<typeof row>) => { r.keys=[]; },
    (r: ReturnType<typeof row>) => { r.setupWrites[0]!.origin='PHYSICAL'; },
    (r: ReturnType<typeof row>) => { r.setupWrites[0]!.heldAtEnd=['KeyR']; },
  ]) { const r=row();mutate(r);assert.throws(()=>validateDriverLedger(r)); }
});
