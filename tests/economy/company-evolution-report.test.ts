import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  COMPANY_EVOLUTION_REPORT_VERSION,
  runCompanyEvolutionReport,
} from './company-evolution-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '269-company-evolution', 'report.json');

test('269 report: every documented company evolution check passes', () => {
  const report = runCompanyEvolutionReport();
  assert.equal(report.version, COMPANY_EVOLUTION_REPORT_VERSION);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.ok(report.summary.checks >= 50);
  for (const entry of report.checks)
    assert.equal(entry.pass, true, `report check failed: ${entry.name}`);
});

test('269 report: purchase, upgrade effect and refusals are explicit', () => {
  const report = runCompanyEvolutionReport();
  assert.equal(report.purchase.levelBefore, 1);
  assert.equal(report.purchase.levelAfter, 2);
  assert.equal(report.purchase.fleetTaxisBefore + 1, report.purchase.fleetTaxisAfter);
  assert.equal(report.purchase.slot, 21);
  assert.equal(report.purchase.cashBeforeMinorUnits - report.purchase.costMinorUnits, 43_220);
  assert.equal(report.upgrade.currentPeriodServiceMinorUnits, 40);
  assert.equal(report.upgrade.nextPeriodServiceMinorUnits, 20);
  assert.equal(report.upgrade.nextPeriodBaseMinorUnits, 40);
  assert.equal(report.upgrade.historyEntryUnchanged, true);
  assert.equal(report.upgrade.effectiveAfter, true);
  assert.equal(report.insufficientCash.reason, 'INSUFFICIENT_CASH');
  assert.equal(report.insufficientCash.changed, false);
  assert.equal(report.levelRequired.reason, 'LEVEL_REQUIRED');
  assert.equal(report.levelRequired.changed, false);
  assert.equal(report.duplicates.purchaseReason, 'ALREADY_OWNED');
  assert.equal(report.duplicates.upgradeReason, 'ALREADY_OWNED');
});

test('269 report: reload and the XP/style separation are proven', () => {
  const report = runCompanyEvolutionReport();
  assert.equal(report.reload.restoredPurchases, 1);
  assert.equal(report.reload.restoredUpgrades, 1);
  assert.equal(report.reload.levelBefore, report.reload.levelAfter);
  assert.equal(report.reload.cashBefore, report.reload.cashAfter);
  assert.equal(report.reload.slotBefore, report.reload.slotAfter);
  assert.equal(report.reload.guardRefused, true);
  assert.equal(report.xp.same, true);
  assert.equal(report.style.same, true);
  assert.equal(report.boundary.xpWrites, 0);
  assert.equal(report.boundary.profileWrites, 0);
  assert.equal(report.boundary.styleOverrides, 0);
  assert.equal(report.boundary.secondFleet, false);
  assert.equal(report.boundary.investmentWrites, 2);
  assert.equal(report.boundary.historyScans, 0);
});

test('269 report: the checked-in evidence is deterministic and current', () => {
  const report = runCompanyEvolutionReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<
      typeof runCompanyEvolutionReport
    >;
  assert.deepEqual(saved, report);
  assert.deepEqual(runCompanyEvolutionReport(), report);
});
