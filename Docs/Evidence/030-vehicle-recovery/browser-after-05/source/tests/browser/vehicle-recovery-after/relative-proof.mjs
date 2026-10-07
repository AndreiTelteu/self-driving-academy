import assert from 'node:assert/strict';
import { quantileInterval } from '../vehicle-damage/hardware-collector.ts';

/** Same fixed-tick codec, including all70 identity/mechanics/raw/effective values.
 * Variable end ticks remain separately observed; never substitute final-variable state for8760.
 */
export function comparePhysical(before, after) {
  assert.equal(before.kind, 'trace');
  assert.equal(after.kind, 'trace');
  assert.equal(before.hashes.length, 58);
  assert.equal(after.hashes.length, 58);
  assert.deepEqual(
    after.hashes,
    before.hashes,
    'ALL70 physical/native/control/mechanics checkpoint parity',
  );
  assert.deepEqual(after.values, before.values, 'Retained actual three-body scalar trace parity');
  assert.equal(after.physicalHash, before.physicalHash);
  assert.equal(after.checkpointHash, before.checkpointHash);
}
export function intervalRegression(before, after, absolute = 1) {
  assert(before && after);
  for (const x of [before, after])
    assert(
      Number.isFinite(x.lower) && Number.isFinite(x.upper) && x.lower >= 0 && x.upper >= x.lower,
    );
  if (after.lower > before.upper * 1.1 && after.lower - before.upper > absolute) return 'FAIL';
  if (after.upper <= before.lower * 1.1 || after.upper - before.lower <= absolute) return 'PASS';
  return 'UNVALIDATED';
}
export function confirmations(values) {
  assert.equal(values.length, 5);
  assert(values.every((x) => ['PASS', 'FAIL', 'UNVALIDATED'].includes(x)));
  const failed = values.filter((x) => x === 'FAIL').length,
    uncertain = values.filter((x) => x === 'UNVALIDATED').length;
  return {
    failed,
    uncertain,
    verdict: failed >= 3 ? 'FAIL' : failed + uncertain >= 3 ? 'UNVALIDATED' : 'PASS',
  };
}
export function compareMetric(before, after, metric, fraction) {
  const a = before.find((p) => p.kind === 'metric' && p.metric === metric)?.distribution;
  const b = after.find((p) => p.kind === 'metric' && p.metric === metric)?.distribution;
  if (a === null && b === null) return { verdict: 'NOT_MEASURED', before: null, after: null };
  assert(a && b, 'Matched actual available metric');
  const first = quantileInterval(a, fraction),
    second = quantileInterval(b, fraction);
  return { before: first, after: second, verdict: intervalRegression(first, second) };
}
/** Raw browser JS proxy only. This is never native/WASM/total RAM or retained-live proof. */
export function compareJsProxy(before, after) {
  const a = before.find((p) => p.kind === 'heap'),
    b = after.find((p) => p.kind === 'heap');
  assert(a && b);
  const rows = [];
  for (const phase of ['BEFORE_MEASURE', 'AFTER_MEASURE']) {
    const x = a.endpoints.find((e) => e.phase === phase)?.usedBytes,
      y = b.endpoints.find((e) => e.phase === phase)?.usedBytes;
    if (!(Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0))
      return { scope: 'RAW_JS_PROXY_ONLY', verdict: 'UNVALIDATED', rows };
    rows.push({
      phase,
      before: x,
      after: y,
      delta: y - x,
      verdict: y > x * 1.1 && y - x > 5 * 1024 * 1024 ? 'FAIL' : 'PASS',
    });
  }
  return {
    scope: 'RAW_JS_PROXY_ONLY',
    verdict: rows.some((r) => r.verdict === 'FAIL') ? 'FAIL' : 'PASS',
    rows,
  };
}
