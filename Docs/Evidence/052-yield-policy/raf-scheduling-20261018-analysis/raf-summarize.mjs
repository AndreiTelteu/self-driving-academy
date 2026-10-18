import { readFileSync } from 'node:fs';
const dir = process.argv[2];
const report = JSON.parse(readFileSync(dir + '/submitted.json', 'utf8'));
console.log('top keys:', Object.keys(report).join(', '));
const waits = report.waits ?? [];
const tasks = report.longTasks ?? report.tasks ?? [];
console.log('waits', waits.length, 'tasks', tasks.length, 'status', report.status);
const phases = new Map();
for (const w of waits) {
  const list = phases.get(w.phase) ?? [];
  list.push(w);
  phases.set(w.phase, list);
}
const num = (x) => (x == null ? null : Number(x));
for (const [phase, list] of phases) {
  let maxWait = 0,
    maxWaitAt = 0,
    maxStampGap = 0,
    maxGapAt = 0,
    prevStamp = null,
    missing = 0,
    timeouts = 0,
    maxDebt = 0;
  for (const w of list) {
    const request = num(w.requestMs),
      callback = num(w.callbackMs),
      stamp = num(w.stampMs);
    if (callback == null || stamp == null) missing++;
    if (w.timeout) timeouts++;
    if (callback != null && request != null) {
      const d = callback - request;
      if (d > maxWait) {
        maxWait = d;
        maxWaitAt = request;
      }
    }
    if (stamp != null) {
      if (prevStamp != null) {
        const g = stamp - prevStamp;
        if (g > maxStampGap) {
          maxStampGap = g;
          maxGapAt = prevStamp;
        }
      }
      prevStamp = stamp;
    }
    const debt = num(w.debtMs ?? w.nativeDebtMs);
    if (debt != null && debt > maxDebt) maxDebt = debt;
  }
  console.log(
    phase.padEnd(22),
    'count=' + String(list.length).padStart(5),
    'maxWait=' + maxWait.toFixed(1) + '@' + maxWaitAt.toFixed(0),
    'maxStampGap=' + maxStampGap.toFixed(1) + '@' + maxGapAt.toFixed(0),
    'missingCallback=' + missing,
    'timeouts=' + timeouts,
  );
}
const overlaps = waits.filter(
  (w) => w.callbackMs != null && tasks.some((t) => t.startMs < w.callbackMs && t.startMs + t.durationMs > w.requestMs),
);
console.log('waits overlapping a longtask:', overlaps.length);
console.log('longtasks:', JSON.stringify(tasks.slice(0, 10)));
console.log('cleanup keys:', JSON.stringify(report.nativeCleanup ?? null).slice(0, 300));
