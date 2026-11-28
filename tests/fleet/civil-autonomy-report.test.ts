import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runCivilAutonomyReport } from './civil-autonomy-report';

test('284 the committed civil autonomy report is the current deterministic transcript', () => {
  const report = runCivilAutonomyReport();
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  const committed = readFileSync(
    join(process.cwd(), 'Docs', 'Evidence', '284-civil-autonomy', 'report.json'),
    'utf8',
  );
  assert.equal(committed, `${JSON.stringify(report, null, 2)}\n`);
});
