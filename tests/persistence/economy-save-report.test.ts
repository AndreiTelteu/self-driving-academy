import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runSaveEconomyReport } from './economy-save-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '215-save-economy', 'report.json');
const EVIDENCE_MARKDOWN = join(process.cwd(), 'Docs', 'Evidence', '215-save-economy', 'report.md');

test('215 committed evidence report is the current transcript', async () => {
  const report = await runSaveEconomyReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.equal(report.checks.length, 32);
  for (const entry of report.checks) {
    assert.equal(entry.pass, true, `${entry.name}: expected ${String(entry.expected)}`);
  }
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /- Overall: PASS|overall: PASS/);
  assert.match(markdown, /\| `bundle\.economy` \| \d+ \|/);
});

test('215 the report is deterministic across runs', async () => {
  const first = JSON.stringify(await runSaveEconomyReport());
  const second = JSON.stringify(await runSaveEconomyReport());
  assert.equal(first, second);
});
