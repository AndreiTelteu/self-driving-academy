import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ECONOMY_VERSION } from '../../src/economy';
import { runLiveEconomyReport } from './live-economy-report';

test('266 the deterministic live economy report passes every check', () => {
  const report = runLiveEconomyReport();
  assert.equal(report.contract, LIVE_ECONOMY_VERSION);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.ok(report.checks.length >= 40);
  assert.equal(report.completed.settlements, 1);
  assert.equal(report.completed.reviews, 1);
  assert.ok(report.completed.netMinorUnits > 0);
  assert.equal(report.failed.netMinorUnits, 0);
  assert.equal(report.cancellation.beforeNetMinorUnits, 0);
  assert.ok(report.cancellation.withPassengerNetMinorUnits > 0);
  assert.equal(report.idempotency.duplicateTick, true);
  assert.equal(report.idempotency.settlements, 1);
  assert.equal(report.idempotency.historyScansAfterReads, 0);
  assert.equal(report.epoch.indexAfter, report.epoch.indexBefore + 1);
  assert.equal(report.epoch.revenueAfterStart, report.epoch.revenueBefore);
  assert.ok(report.epoch.revenueAfterNextRide > report.epoch.revenueAfterStart);
});
