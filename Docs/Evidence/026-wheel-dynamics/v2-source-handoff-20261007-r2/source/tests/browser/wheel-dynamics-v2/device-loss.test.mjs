// UNEXECUTED injected GPUDevice.lost journal draft. No native GPU/browser construction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptureLifetime } from './lifetime.mjs';
import { ownDeviceLoss } from './browser-journal.ts';
const fixture=()=>new CaptureLifetime({now:()=>0,foreground:()=>true,requestRaf:()=>1,cancelRaf:()=>{},setTimer:()=>2,clearTimer:()=>{}});
test('real lost promise port records failure; expected disposal loss is fenced',async()=>{
  let resolveLost;const lost=new Promise(resolve=>{resolveLost=resolve;});const life=fixture();
  ownDeviceLoss(life,lost);resolveLost({reason:'unknown',message:'device disappeared'});await Promise.resolve();
  assert.equal(life.causes[0].stage,'webgpu-device-lost');assert.equal(life.journal[0].kind,'webgpu-device-lost');
  let resolveDisposed;const expected=new Promise(resolve=>{resolveDisposed=resolve;});const disposed=fixture();
  ownDeviceLoss(disposed,expected);await disposed.teardown();resolveDisposed({reason:'destroyed',message:'intentional'});await Promise.resolve();
  assert.equal(disposed.causes.length,0);
});
