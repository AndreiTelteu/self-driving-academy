import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  ECONOMY_REPORT_VERSION,
  REPORT_WINDOW_END_TICK,
  fleetEconomyStableReport,
  runFleetEconomyReport,
} from './economy-report';

const EVIDENCE = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '209-fleet-economy-reviews',
  'report.json',
);

test('209 report: every documented check passes on the real fixtures', () => {
  const report = runFleetEconomyReport();
  assert.equal(report.version, ECONOMY_REPORT_VERSION);
  assert.equal(report.windowEndTick, REPORT_WINDOW_END_TICK);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.ok(report.summary.checks >= 10);
  for (const entry of report.checks)
    assert.equal(entry.pass, true, `report check failed: ${entry.name}`);
});

test('209 report: a comparable window shows efficiency vs throughput and ratings', () => {
  const report = runFleetEconomyReport();
  // The same three requests and the same planned fare in both styles.
  assert.deepEqual(report.efficient.quotes, report.aggressive.quotes);
  assert.equal(new Set([...report.efficient.quotes, ...report.aggressive.quotes]).size, 1);
  // The efficient style serves fewer rides in the window but earns better ratings.
  assert.ok(report.efficient.ridesInWindow < report.aggressive.ridesInWindow);
  assert.ok(report.efficient.windowRevenueMinorUnits < report.aggressive.windowRevenueMinorUnits);
  assert.ok((report.efficient.averageRating ?? 0) > (report.aggressive.averageRating ?? 5));
  for (const rating of [...report.efficient.ratings, ...report.aggressive.ratings]) {
    assert.ok(Number.isInteger(rating));
    assert.ok(rating >= 0 && rating <= 5);
  }
});

test('209 report: the three terminal outcomes and the civilian exclusion are explicit', () => {
  const report = runFleetEconomyReport();
  assert.equal(report.outcomes.failedNetMinorUnits, 0);
  assert.equal(report.outcomes.cancelledBeforeNetMinorUnits, 0);
  assert.equal(report.outcomes.cancelledAfterNetMinorUnits, 165);
  assert.equal(report.outcomes.completedNetMinorUnits, 551);
  assert.equal(report.outcomes.civilianRejected, true);
  assert.equal(report.outcomes.civilianRevenueMinorUnits, 0);
  assert.equal(report.outcomes.reviewCount, 3);
  assert.ok(report.outcomes.reasonCodes.some((codes) => codes.includes('RIDE_FAILED')));
  assert.ok(report.outcomes.reasonCodes.some((codes) => codes.includes('RIDE_CANCELLED')));
});

test('209 report: the checked-in evidence is current and deterministic', () => {
  const report = runFleetEconomyReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runFleetEconomyReport>;
  assert.deepEqual(fleetEconomyStableReport(saved), fleetEconomyStableReport(report));
  assert.deepEqual(runFleetEconomyReport(), report);
});
