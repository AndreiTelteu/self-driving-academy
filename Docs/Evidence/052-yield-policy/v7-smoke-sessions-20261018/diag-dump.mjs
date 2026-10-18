import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
const arm = Number(process.argv[3]);
const file = `${dir}/submitted-arm-${arm}.json`;
const s = JSON.parse(readFileSync(file, 'utf8'));
const m = s.request.metadata ?? {};
const d = m.diagnostics ?? {};
const r = d.rafAttempt ?? {};
const b = d.beforeNative ?? {};
const fmt = (x) => (x == null ? String(x) : Number(x).toFixed(3));
console.log('#', file);
console.log('ordinal', s.request.ordinal, 'pair', m.pair, 'current', m.current);
console.log('meas', m.measuredSeconds, 'warm', m.warmupSeconds);
console.log('dualClock', JSON.stringify(m.dualClock));
console.log('simulationToActiveWallTime', m.simulationToActiveWallTime);
console.log('beforeNative  tick=' + b.tick, 'now=' + fmt(b.nowMs), 'target=' + fmt(b.targetMs), 'debt=' + fmt(b.debtMs), 'counter=' + JSON.stringify(b.counter));
console.log('rafAttempt    tick=' + r.tick, 'waitStart=' + fmt(r.waitStartMs), 'target=' + fmt(r.targetMs));
console.log('  counterBefore=' + JSON.stringify(r.counterBefore));
console.log('  previousRaf=' + JSON.stringify(r.previousRaf), 'recovery=' + r.recoveryStepsBeforeReset);
console.log('  stamp=' + fmt(r.stampMs), 'rafCallback=' + fmt(r.rafCallbackMs), 'continuationStart=' + fmt(r.continuationStartMs));
console.log('  callbackRead=' + fmt(r.callbackReadMs), 'continuationRead=' + fmt(r.continuationReadMs), 'guardRead=' + fmt(r.guardReadMs));
console.log('  counterAfter=' + JSON.stringify(r.counterAfter), 'debt=' + fmt(r.debtMs));
if (r.stampMs != null && r.rafCallbackMs != null)
  console.log('  derived: stamp->callback=' + fmt(r.rafCallbackMs - r.stampMs), 'callback->continuation=' + fmt(r.continuationStartMs - r.rafCallbackMs), 'continuation->read=' + fmt(r.continuationReadMs - r.continuationStartMs));
if (b.nowMs != null && r.stampMs != null)
  console.log('  derived: beforeNative->stamp=' + fmt(r.stampMs - b.nowMs), 'waitStart-stamp=' + fmt((r.waitStartMs ?? 0) - r.stampMs));
console.log('nativeCosts', JSON.stringify(d.nativeCosts));
console.log('warmBoundary', JSON.stringify(m.warmBoundary && m.warmBoundary.diagnostic && m.warmBoundary.diagnostic.result));
console.log('coverage', m.observationCoverage ?? d.observationCoverage);
