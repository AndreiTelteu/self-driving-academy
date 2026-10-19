// UNEXECUTED pure test draft. No browser/native dependencies, no automatic execution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptureLifetime, runOwned } from './lifetime.mjs';

function fixture() {
  let time = 0, next = 0, focused = true;
  const rafs = new Map(), timers = new Map();
  const native = { ticks: 0, renders: 0, owners: 0 };
  const life = new CaptureLifetime({
    now: () => time, foreground: () => focused,
    requestRaf: (callback) => { const id = ++next; rafs.set(id, callback); return id; },
    cancelRaf: (id) => rafs.delete(id),
    setTimer: (callback) => { const id = ++next; timers.set(id, callback); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  return { life, native, rafs, timers, counters: () => ({ ...native }),
    time: (value) => { time = value; }, focus: (value) => { focused = value; },
    callback: () => [...rafs.values()][0], timer: () => [...timers.values()][0] };
}
test('callback-first cancels watchdog and records entry before continuation, exactly one advance', async () => {
  const f = fixture();
  const frame = f.life.nextFrame(f.counters).then(() => { f.native.ticks++; f.native.renders++; });
  const timer = f.timer();
  f.time(16); f.callback()(16);
  assert.equal(f.life.lastTrigger.callbackEntryMs, 16);
  assert.equal(f.life.lastTrigger.continuationEntryMs, null);
  await frame;
  f.time(300); timer();
  assert.deepEqual(f.native, { ticks: 1, renders: 1, owners: 0 });
  assert.equal(f.life.causes.length, 0);
  assert.equal(f.rafs.size + f.timers.size, 0);
  assert.equal(f.life.lastTrigger.continuationCounters.ticks, 0);
});
test('timer-first plus late callback cannot advance physics; failed trigger survives', async () => {
  const f = fixture();
  const frame = f.life.nextFrame(f.counters).then(() => { f.native.ticks++; });
  const rejected = assert.rejects(frame, /deadline/);
  const callback = f.callback();
  f.time(251); f.timer()();
  f.time(282000); callback(282000);
  await rejected;
  assert.equal(f.native.ticks, 0);
  assert.equal(f.life.causes[0].stage, 'raf-watchdog');
  assert.equal(f.life.lastTrigger.requestEntryMs, 0);
  assert.equal(f.life.lastTrigger.watchdogCounters.ticks, 0);
  assert.equal(f.life.lastTrigger.lateCallbackEntryMs, 282000);
  assert.equal(f.rafs.size + f.timers.size, 0);
});
test('cancel between callback and continuation prevents native work', async () => {
  const f = fixture();
  const frame = f.life.nextFrame(f.counters).then(() => f.native.ticks++);
  const rejected = assert.rejects(frame, /inactive/);
  f.time(16); f.callback()(16);
  f.life.fail('external-cancel', new Error('cancelled'));
  await rejected;
  assert.equal(f.native.ticks, 0);
  assert.equal(f.life.causes[0].stage, 'external-cancel');
});
test('foreground loss never advances, even when callback arrives on time', async () => {
  const f = fixture();
  const frame = f.life.nextFrame(f.counters).then(() => f.native.ticks++);
  const rejected = assert.rejects(frame, /Foreground/);
  f.focus(false); f.time(16); f.callback()(16);
  await rejected;
  assert.equal(f.native.ticks, 0);
  assert.equal(f.life.lastTrigger.callbackEntryMs, 16);
});
test('callback counter read throws: pending ownership is still cancelled', async () => {
  const f = fixture(); let reads = 0;
  const frame = f.life.nextFrame(() => { if (++reads > 1) throw new Error('callback read'); return f.counters(); });
  const rejected = assert.rejects(frame, /callback read/);
  f.time(16); f.callback()(16); await rejected;
  assert.equal(f.rafs.size + f.timers.size, 0);
  assert.equal(f.life.lastTrigger.callbackEntryMs, 16);
  assert.equal(f.native.ticks, 0);
});
test('dispose cancels pending frame and continues independent resource disposal/readbacks', async () => {
  const f = fixture(); f.native.owners = 2;
  const frame = f.life.nextFrame(f.counters);
  const rejected = assert.rejects(frame, /disposed/);
  f.life.own('world', () => { f.native.owners--; });
  f.life.own('scene', () => { f.native.owners--; throw new Error('scene disposal'); });
  f.life.readback('bad', () => { throw new Error('readback failed'); });
  f.life.readback('owners', () => f.native.owners);
  const readbacks = await f.life.teardown(); await rejected;
  await f.life.teardown();
  assert.equal(readbacks.owners, 0);
  assert.equal(f.native.owners, 0);
  assert.deepEqual(f.life.causes.map(({ stage }) => stage), ['dispose:scene', 'readback:bad']);
  assert.equal(f.rafs.size + f.timers.size, 0);
});
test('setup throw retains original, cleanup, readback and export causes; ownership acquired first', async () => {
  const f = fixture(); let exported;
  await runOwned(f.life, (life) => {
    f.native.owners++;
    life.own('backend', () => { f.native.owners--; throw new Error('cleanup failed'); });
    life.readback('engine', () => { throw new Error('readback failed'); });
    throw new Error('engine access setup failure');
  }, (terminal) => { exported = terminal; throw new Error('HTTP500'); });
  assert.equal(f.native.owners, 0);
  assert.equal(exported.acceptance, 'UNVERIFIED');
  assert.deepEqual(f.life.causes.map(({ stage }) => stage), ['run', 'dispose:backend', 'readback:engine', 'export']);
  assert.match(f.life.causes[0].error, /setup failure/);
});
test('overflow is failure with explicit lost count, never silently accepted', async () => {
  const f = fixture(); f.life.capacity = 1;
  f.life.record('blur'); f.life.record('focus'); f.life.record('visibility');
  assert.equal(f.life.failed, true);
  assert.equal(f.life.overflow, 2);
  assert.equal(f.life.causes[0].stage, 'journal-overflow');
});

test('synchronous RAF port cannot leave a newly registered watchdog after callback settlement', async () => {
  let timers=0,cancelled=0;
  const life=new CaptureLifetime({ now:()=>16,foreground:()=>true,
    requestRaf:callback=>{callback(16);return 7;},cancelRaf:()=>{cancelled++;},
    setTimer:()=>{timers++;return 8;},clearTimer:()=>{timers--;}});
  assert.equal(await life.nextFrame(()=>({ticks:0})),16);
  assert.equal(timers,0);assert.equal(cancelled,1);assert.equal(life.pending,null);
});
test('synchronous watchdog cancels RAF and clears timer handle returned after cancellation', async () => {
  let timerOwners=0,rafOwners=0,time=0;
  const life=new CaptureLifetime({now:()=>time,foreground:()=>true,
    requestRaf:()=>{rafOwners++;return 7;},cancelRaf:()=>{rafOwners--;},
    setTimer:callback=>{timerOwners++;time=251;callback();return 8;},clearTimer:()=>{timerOwners--;}});
  await assert.rejects(life.nextFrame(()=>({ticks:0})),/deadline/);
  assert.equal(timerOwners+rafOwners,0);
});
test('reentrant disposer sees the assigned teardown promise; snapshot and bounded causes are immutable copies', async () => {
  const f=fixture();let seen,calls=0;
  f.life.own('reentrant',()=>{calls++;seen=f.life.teardown();return seen;});
  const promise=f.life.teardown();await promise;
  assert.equal(seen,promise);assert.equal(calls,1);
  const snapshot=f.life.snapshot();f.life.cause('later','x'.repeat(4096));
  assert.equal(snapshot.causes.length,0);assert.equal(f.life.causes[0].error.length,1024);
  assert.equal(f.life.causes[0].omittedCodeUnits,3072);
});
test('post-terminal late callback has bounded separate sink, no terminal snapshot mutation or native advance', async () => {
  const f=fixture(),saved=[];f.life.onLate(async event=>{saved.push(structuredClone(event));});
  const frame=f.life.nextFrame(f.counters), rejected=assert.rejects(frame,/deadline/), callback=f.callback();
  f.time(251);f.timer()();await rejected;await f.life.teardown();
  const terminal=f.life.snapshot();f.time(1000);callback(1000);await f.life.lateQueue;
  assert.equal(saved.length,1);assert.equal(saved[0].state,'FAILED_UNKNOWN');
  assert.equal(terminal.lastTrigger.lateCallbackEntryMs,null);assert.equal(f.native.ticks,0);
});
test('late durable sink failure is retained as failedunknown without hiding original watchdog failure', async()=>{
  const f=fixture();f.life.onLate(async()=>{throw new Error('supplement disk failure');});
  const frame=f.life.nextFrame(f.counters),rejected=assert.rejects(frame,/deadline/),callback=f.callback();
  f.time(251);f.timer()();await rejected;f.time(1000);callback(1000);await f.life.lateQueue;
  assert.deepEqual(f.life.causes.map(x=>x.stage),['raf-watchdog','late-callback','late-export-or-readback']);
});
