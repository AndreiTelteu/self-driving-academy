import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runWalkingSaveReport } from './walking-save-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '200-v3-walking-save', 'report.json');
const EVIDENCE_MARKDOWN = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '200-v3-walking-save',
  'report.md',
);

test('200 committed evidence report is the current transcript', async () => {
  const report = await runWalkingSaveReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.equal(report.summary.scenariosPassed, report.summary.scenarios);
  assert.equal(report.summary.refusalsClosed, report.summary.refusals);
  assert.equal(report.summary.migrationPreservesEverything, true);
  assert.equal(report.summary.reloadCoherent, true);
  assert.equal(report.summary.noDuplicates, true);
  assert.equal(report.summary.storeUntouched, true);
  assert.equal(report.determinism.identical, true);
  for (const entry of report.checks) {
    assert.equal(entry.pass, true, `${entry.name}: expected ${String(entry.expected)}`);
  }
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /- Verdict general: \*\*PASS\*\*/);
  assert.match(markdown, /\| `XP_TAMPERED` \|.*`CHECKSUM_MISMATCH`/);
});
