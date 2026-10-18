import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => /^submitted-arm-\d+\.json$/.test(f));
const rows = [];
for (const f of files) {
  const s = JSON.parse(readFileSync(dir + '/' + f, 'utf8'));
  const m = s.request.metadata ?? {};
  const d = m.diagnostics ?? {};
  rows.push({
    file: f,
    ordinal: s.request.ordinal,
    pair: m.pair,
    warm: m.warmupSeconds,
    meas: m.measuredSeconds,
    native: m.dualClock?.nativePhaseRatio,
    raf: m.dualClock?.matchedRafRatio,
    simWall: m.simulationToActiveWallTime,
    beforeDebt: d.beforeNative?.debtMs,
    rafDebt: d.rafAttempt?.debtMs,
    recovery: d.rafAttempt?.recoveryStepsBeforeReset,
    prevRaf: d.rafAttempt?.previousRaf?.nativeSerial,
    attemptTick: d.rafAttempt?.tick,
    frameP95: m.stats?.frame?.p95,
    frameMax: m.stats?.frame?.max,
  });
}
rows.sort((a, b) => a.ordinal - b.ordinal);
for (const r of rows)
  console.log(
    String(r.ordinal).padStart(2),
    'pair=' + String(r.pair).padEnd(4),
    'warm=' + r.warm,
    'meas=' + r.meas,
    'native=' + (r.native != null ? r.native.toFixed(5) : '-'),
    'raf=' + (r.raf != null ? r.raf.toFixed(5) : '-'),
    'simWall=' + (r.simWall != null ? r.simWall.toFixed(5) : '-'),
    'beforeDebt=' + (r.beforeDebt != null ? r.beforeDebt.toFixed(1) : '-'),
    'rafDebt=' + (r.rafDebt != null ? r.rafDebt.toFixed(1) : '-'),
    'recovery=' + r.recovery,
    'prevRaf=' + r.prevRaf,
    'tick=' + r.attemptTick,
  );
console.log('submitted arms:', rows.length);
