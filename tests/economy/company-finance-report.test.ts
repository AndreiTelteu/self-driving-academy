import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { COMPANY_FINANCE_REPORT_VERSION, runCompanyFinanceReport } from './company-finance-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '268-company-finance', 'report.json');

test('268 report: every documented company check passes on the real fixture', () => {
  const report = runCompanyFinanceReport();
  assert.equal(report.version, COMPANY_FINANCE_REPORT_VERSION);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.ok(report.summary.checks >= 40);
  for (const entry of report.checks)
    assert.equal(entry.pass, true, `report check failed: ${entry.name}`);
});

test('268 report: a profitable ride, a loss ride and an empty month are explicit', () => {
  const report = runCompanyFinanceReport();
  assert.ok(report.profitableRide.revenueMinorUnits > 0);
  assert.ok(report.profitableRide.grossCostMinorUnits > 0);
  assert.ok(report.profitableRide.grossProfitMinorUnits > 0);
  assert.ok(report.lossRide.incidentMinorUnits > 0);
  assert.ok(report.lossRide.grossProfitMinorUnits < 0);
  assert.equal(report.lossRide.reviewImpacts, 1);
  assert.equal(report.emptyMonth.terminalRides, 0);
  assert.equal(report.emptyMonth.fixedCostsApplied, true);
  assert.ok(report.emptyMonth.profitMinorUnits < 0);
  assert.equal(report.emptyMonth.monthPresent, true);
  assert.equal(report.emptyMonth.hasRideData, false);
});

test('268 report: refunds are adjustments and the KPI/XP fingerprints stay identical', () => {
  const report = runCompanyFinanceReport();
  assert.equal(report.cancellation.adjustmentCause, 'SERVICE_NOT_DELIVERED');
  assert.equal(report.cancellation.entryGrossCostMinorUnits, 40);
  assert.equal(report.cancellation.adjustmentMinorUnits, -40);
  assert.equal(report.cancellation.netCostMinorUnits, 0);
  assert.equal(report.kpi.same, true);
  assert.equal(report.xp.same, true);
  assert.equal(report.boundary.xpWrites, 0);
  assert.equal(report.boundary.economyWrites, 0);
  assert.equal(report.boundary.investmentWrites, 0);
});

test('268 report: the checked-in evidence is deterministic and current', () => {
  const report = runCompanyFinanceReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<
      typeof runCompanyFinanceReport
    >;
  assert.deepEqual(saved, report);
  assert.deepEqual(runCompanyFinanceReport(), report);
});
