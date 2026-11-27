import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runKpiDashboardReport } from './kpi-dashboard-report';

test('267 committed evidence report is the current deterministic transcript', () => {
  const report = runKpiDashboardReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '267-kpi-dashboard', 'report.json'),
      'utf8',
    );
  assert.equal(report.summary.pass, true);
  assert.ok(report.summary.checks >= 15, `${report.summary.checks} checks`);
  assert.equal(report.kpi.historyScans, 0);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
});
