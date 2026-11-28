import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runLiveChaosReport } from './live-chaos-report';

test('285 deterministic report passes every acceptance check', () => {
  const report = runLiveChaosReport();
  assert.equal(
    report.summary.fail,
    0,
    JSON.stringify(report.checks.filter((check) => !check.pass)),
  );
  assert.equal(report.summary.total, 13);
  assert.equal(report.plan.definitions, 35);
  assert.equal(report.matrix.length, 6);
  assert.equal(report.reset.resetCount, 20);
  assert.equal(report.reset.baseline, true);
  assert.equal(report.reset.xpUnchanged, true);
  assert.equal(report.reset.profileUnchanged, true);
  assert.equal(report.reset.replayZeros, true);
  assert.equal(report.reset.resetOrder, true);
  assert.equal(report.reset.structural.untouched, true);
  assert.equal(report.cost.memory.heapBytes, null);
  assert.equal(report.cost.assets.definitions, 35);
});
