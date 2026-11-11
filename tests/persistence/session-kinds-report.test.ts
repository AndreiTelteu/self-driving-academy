import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runSessionKindsReport } from './session-kinds-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '225-session-kinds', 'report.json');
const EVIDENCE_MARKDOWN = join(process.cwd(), 'Docs', 'Evidence', '225-session-kinds', 'report.md');

test('225 committed evidence report is the current transcript', async () => {
  const report = await runSessionKindsReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  for (const entry of report.checks) {
    assert.equal(entry.pass, true, `${entry.name}: expected ${String(entry.expected)}`);
  }
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /- Overall: PASS/);
  assert.match(markdown, /\| `switches` \| 20 \|/);
  assert.match(markdown, /\| `identical` \| true \|/);
});

test('225 the report is deterministic across runs', async () => {
  const first = JSON.stringify(await runSessionKindsReport());
  const second = JSON.stringify(await runSessionKindsReport());
  assert.equal(first, second);
});
