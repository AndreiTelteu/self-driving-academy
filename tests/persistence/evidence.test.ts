import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runDbSchemaReport } from './db-schema-report';
import type { DbSchemaReport } from './db-schema-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '127-db-schema', 'report.json');
const EVIDENCE_MARKDOWN = join(process.cwd(), 'Docs', 'Evidence', '127-db-schema', 'report.md');

test('127 committed evidence report is the current transcript', async () => {
  const report = await runDbSchemaReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as DbSchemaReport;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as DbSchemaReport);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.equal(report.checks.length, 49);
  for (const check of report.checks) {
    assert.equal(check.pass, true, `${check.name}: expected ${String(check.expected)}`);
  }
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /- Overall: PASS/);
  assert.match(markdown, /\| `checkpoints` \| `checkpointId` \|/);
});

test('127 the report is deterministic across runs', async () => {
  const first = JSON.stringify(await runDbSchemaReport());
  const second = JSON.stringify(await runDbSchemaReport());
  assert.equal(first, second);
});
