import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runSaveFileReport } from './savefile-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '234-savefile', 'report.json');
const EVIDENCE_MARKDOWN = join(process.cwd(), 'Docs', 'Evidence', '234-savefile', 'report.md');

test('234 committed evidence report is the current transcript', async () => {
  const report = await runSaveFileReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.equal(report.checks.length, 84);
  for (const entry of report.checks) {
    assert.equal(entry.pass, true, `${entry.name}: expected ${String(entry.expected)}`);
  }
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /- Overall: PASS/);
  assert.match(markdown, /\| modifiedWithoutChecksum \| `CHECKSUM_MISMATCH` \|/);
});

test('234 the report is deterministic across runs', async () => {
  const first = JSON.stringify(await runSaveFileReport());
  const second = JSON.stringify(await runSaveFileReport());
  assert.equal(first, second);
});
