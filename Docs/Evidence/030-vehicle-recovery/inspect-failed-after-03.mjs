import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const before = 'Docs/Evidence/030-vehicle-recovery/before-01';
const after = 'Docs/Evidence/030-vehicle-recovery/after-03';
const read = async path => JSON.parse(await readFile(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = await read(after + '/manifest.json'), original = await read(before + '/manifest.json');
const failureBytes = await readFile(after + '/failure.json');
assert.equal(JSON.parse(failureBytes).status, 'FAIL');
const source = createHash('sha256');
for (const row of manifest.inputs) {
  const current = await readFile(row.path), archived = await readFile(after + '/source/' + row.path);
  assert.equal(hash(current), row.sha256); assert.equal(hash(archived), row.sha256);
  source.update(row.path).update(archived);
}
assert.equal(source.digest('hex'), manifest.sourceHash);
const rows = [], parity = [];
for (let i = 0; i < 20; i++) {
  const name = '/run-' + String(i).padStart(2, '0') + '.json';
  const actualBytes = await readFile(after + name), actual = JSON.parse(actualBytes);
  const priorBytes = await readFile(before + name), prior = JSON.parse(priorBytes);
  const checks = {};
  for (const key of ['checkpoints', 'physicalDigest', 'controlDigest', 'nativeInputDigest', 'initialMechanics', 'finalMechanics']) {
    checks[key] = JSON.stringify(actual[key]) === JSON.stringify(prior[key]);
    assert(checks[key], 'Actual original parity ' + i + '/' + key);
  }
  parity.push({ ordinal: i, checks, rawSha256: hash(actualBytes), beforeRawSha256: hash(priorBytes) });
  assert.equal(actual.completedTicks, 780); assert.equal(actual.measuredTicks, 600);
  const c = actual.cleanup;
  assert.deepEqual(c.attempts, ['recovery', 'eventBus', 'controller', 'damage', 'world']);
  assert.equal(c.errors.length, 0);
  for (const [object, keys] of [[c.recovery, ['vehicles', 'candidates', 'pending']],
    [c.nativeRecovery, ['activePorts']], [c.eventBus, ['retainedEvents', 'listeners']],
    [c.controller, ['vehicles', 'targets', 'projections', 'players']],
    [c.damage, ['vehicles', 'historyRecords', 'operationIds']], [c.body, ['entities', 'subscriptions']],
    [c.collision, ['vehicles', 'obstacles', 'colliders']]])
    for (const key of keys) assert.equal(object[key], 0, 'Cleanup ' + i + '/' + key);
  if (!actual.observer) { assert.equal(actual.raw, null); continue; }
  const p95 = values => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * .95)];
  for (const [key, values] of Object.entries(actual.raw)) {
    assert.equal(values.length, 600); assert(values.every(value => Number.isFinite(value) && value >= 0));
    assert.equal(p95(values), actual.summaries[key].p95);
  }
  const a = p95(prior.raw.wholeMs), b = p95(actual.raw.wholeMs);
  rows.push({ count: actual.count, pair: actual.pair, beforeP95: a, afterP95: b,
    deltaMs: b - a, ratio: b / a, relativeRegression: b - a > 1 && b / a > 1.1,
    normalAbsoluteFailure: actual.count === 70 && b > 5.5 });
}
const report = { scope: 'SUPPLEMENTAL_READ_ONLY_REVIEW_OF_IMMUTABLE_FAILED_CAPTURE',
  inspectedAt: new Date().toISOString(), originalSource: original.sourceHash, currentSource: manifest.sourceHash,
  currentInputs: manifest.inputs.length, originalInputs: original.inputs.length,
  failureSha256: hash(failureBytes), captureStatus: 'FAIL_UNCHANGED', parity, rawDerivedRows: rows,
  relativeFlags: Object.fromEntries([70, 110].map(count => [count, rows.filter(row => row.count === count && row.relativeRegression).length])),
  normalAbsoluteFailures: rows.filter(row => row.normalAbsoluteFailure).length,
  cleanup: 'ZERO_ALL20_ONCE_5_OWNERS', hardwareAcceptance: false, memoryAcceptance: false, pbiDone: false };
await writeFile('Docs/Evidence/030-vehicle-recovery/failed-after-03-independent.json', JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ currentInputs: report.currentInputs, parityWorlds: parity.length,
  relativeFlags: report.relativeFlags, normalAbsoluteFailures: report.normalAbsoluteFailures, rows }));
